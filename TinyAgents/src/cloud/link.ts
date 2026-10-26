/**
 * How this page reaches the hub from anywhere (the hub's side is hub/link.mjs): both connect out to Supabase
 * Realtime and meet on a channel named after the office code. Here the page asks the hub for a direct WebRTC
 * connection; once it's open, requests and updates go straight between them. If the network won't allow one,
 * they pass through the channel (the relay). Nothing is stored anywhere.
 */
const REF = 'hchyekrxubzuqrnlckpm';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjaHlla3J4dWJ6dXFybmxja3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNjI3NDIsImV4cCI6MjA5OTgzODc0Mn0.IIfUjrwSEnrAzPuRrCUblli2fJ7dYJssj7jE-526OxE';
const ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const HEARTBEAT_MS = 25000;
/** Nothing from Realtime for this long (it answers every heartbeat): the connection is dead, so start a new one. */
const REALTIME_SILENT_MS = 70000;
/** While relayed, the page says hello this often so the hub keeps sending it updates. */
const HELLO_MS = 30000;
/** How long a direct connection gets to open before the page settles for the relay, and when it tries again. */
const DIRECT_WAIT_MS = 8000;
const DIRECT_RETRY_MS = 60000;
const REQUEST_MS = 15000;
/** No word from the hub for this long (it resends the office every 15 s): the hub is offline. */
const SILENT_MS = 40000;

export type LinkState = 'connecting' | 'direct' | 'relay' | 'offline';
type Reply = { result?: unknown; error?: { message: string; status: number } };
type Piece = { part: number; parts: number; chunk: string };

export class LinkError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Reassembles messages split into pieces (Realtime caps one message at 256 KB). */
class Pieces {
  private parts = new Map<string, string[]>();

  add(key: string, p: Piece): string | null {
    const got = this.parts.get(key) ?? [];
    got[p.part] = p.chunk;
    if (got.filter((x) => x !== undefined).length < p.parts) {
      this.parts.set(key, got);
      return null;
    }
    this.parts.delete(key);
    return got.join('');
  }
}

export class Link {
  state: LinkState = 'connecting';
  private readonly me = crypto.randomUUID();
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private ref = 0;
  private nextId = 0;
  private waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: number }>();
  private pieces = new Pieces();
  private heardAt = 0;
  private timers: number[] = [];
  private pushListeners: ((kind: string, data: unknown) => void)[] = [];
  private stateListeners: ((s: LinkState) => void)[] = [];
  private stopped = false;
  private opened: Promise<void>;
  private markOpen: () => void = () => undefined;

  constructor(readonly code: string) {
    this.opened = new Promise((done) => (this.markOpen = done));
  }

  get topic(): string {
    return `realtime:ta-${this.code}`;
  }

  onPush(fn: (kind: string, data: unknown) => void): void {
    this.pushListeners.push(fn);
  }

  onState(fn: (s: LinkState) => void): void {
    this.stateListeners.push(fn);
  }

  start(): void {
    this.connect();
    this.timers.push(
      window.setInterval(() => this.state === 'relay' && this.broadcast('hello', { from: this.me }), HELLO_MS),
      window.setInterval(() => {
        if (this.state !== 'connecting' && this.state !== 'offline' && performance.now() - this.heardAt > SILENT_MS) {
          this.setState('offline');
        }
      }, 5000),
    );
  }

  stop(): void {
    this.stopped = true;
    this.timers.forEach(clearInterval);
    this.channel?.close();
    this.pc?.close();
    this.ws?.close();
    this.waiting.forEach((w) => w.reject(new LinkError('Disconnected', 0)));
  }

  private setState(s: LinkState): void {
    if (s !== this.state) {
      this.state = s;
      this.stateListeners.forEach((fn) => fn(s));
    }
  }

  private heard(): void {
    this.heardAt = performance.now();
    if (this.state === 'offline' || this.state === 'connecting') {
      this.setState(this.channel?.readyState === 'open' ? 'direct' : 'relay');
    }
  }

  private connect(): void {
    const ws = new WebSocket(`wss://${REF}.supabase.co/realtime/v1/websocket?apikey=${ANON_KEY}&vsn=1.0.0`);
    this.ws = ws;
    let beat = 0;
    let heard = performance.now();
    ws.onopen = () => {
      ws.send(JSON.stringify({ topic: this.topic, event: 'phx_join', payload: { config: { broadcast: { self: false }, private: false } }, ref: String(++this.ref) }));
      beat = window.setInterval(() => {
        if (performance.now() - heard > REALTIME_SILENT_MS) {
          ws.close();
          return;
        }
        ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++this.ref) }));
      }, HEARTBEAT_MS);
      this.broadcast('hello', { from: this.me });
      this.markOpen();
      void this.tryDirect();
    };
    ws.onmessage = (m) => {
      heard = performance.now();
      const msg = JSON.parse(m.data as string);
      // Realtime can drop the channel while the connection stays up: join again on a fresh connection
      if (msg.topic === this.topic && (msg.event === 'phx_error' || msg.event === 'phx_close' || (msg.event === 'system' && msg.payload?.status === 'error') || (msg.event === 'phx_reply' && msg.payload?.status === 'error'))) {
        ws.close();
        return;
      }
      if (msg.event === 'broadcast' && msg.topic === this.topic) {
        void this.onBroadcast(msg.payload.event, msg.payload.payload);
      }
    };
    ws.onclose = () => {
      clearInterval(beat);
      if (!this.stopped && this.ws === ws) {
        window.setTimeout(() => this.connect(), 3000);
      }
    };
    ws.onerror = () => ws.close();
  }

  private broadcast(event: string, payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ topic: this.topic, event: 'broadcast', payload: { type: 'broadcast', event, payload }, ref: String(++this.ref) }));
    }
  }

  private async onBroadcast(event: string, p: Record<string, unknown>): Promise<void> {
    if (event === 'res' && p.to === this.me) {
      this.heard();
      this.onReply(`r${p.id}`, Number(p.id), p as unknown as Piece);
    } else if (event === 'push') {
      this.heard();
      const json = this.pieces.add(`p${p.push}`, p as unknown as Piece);
      if (json && this.state !== 'direct') {
        this.emitPush(json);
      }
    } else if (event === 'answer' && p.to === this.me && this.pc && this.pc.signalingState === 'have-local-offer') {
      await this.pc.setRemoteDescription({ type: 'answer', sdp: p.sdp as string });
    }
  }

  private onReply(key: string, id: number, p: Piece): void {
    const json = this.pieces.add(key, p);
    const w = this.waiting.get(id);
    if (json === null || !w) {
      return;
    }
    this.waiting.delete(id);
    clearTimeout(w.timer);
    const reply = JSON.parse(json) as Reply;
    if (reply.error) {
      w.reject(new LinkError(reply.error.message, reply.error.status));
    } else {
      w.resolve(reply.result);
    }
  }

  private emitPush(json: string): void {
    const { kind, data } = JSON.parse(json) as { kind: string; data: unknown };
    this.pushListeners.forEach((fn) => fn(kind, data));
  }

  /** Offers the hub a direct connection; if it doesn't open in time, the relay carries on and it's tried again later. */
  private async tryDirect(): Promise<void> {
    this.pc?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc = pc;
    const channel = pc.createDataChannel('ta');
    channel.onopen = () => {
      this.channel = channel;
      this.heard();
      this.setState('direct');
    };
    channel.onclose = () => {
      if (this.channel === channel) {
        this.channel = null;
        this.setState('relay');
        this.broadcast('hello', { from: this.me });
        window.setTimeout(() => !this.stopped && void this.tryDirect(), DIRECT_RETRY_MS);
      }
    };
    channel.onmessage = (m) => {
      this.heard();
      const msg = JSON.parse(m.data as string) as Piece & { type: string; id?: number };
      if (msg.type === 'res') {
        this.onReply(`d${msg.id}`, msg.id!, msg);
      } else {
        const json = this.pieces.add('direct-push', msg);
        if (json) {
          this.emitPush(json);
        }
      }
    };
    await pc.setLocalDescription(await pc.createOffer());
    if (pc.iceGatheringState !== 'complete') {
      await new Promise<void>((done) => {
        pc.addEventListener('icegatheringstatechange', () => pc.iceGatheringState === 'complete' && done());
        window.setTimeout(done, 3000);
      });
    }
    this.broadcast('offer', { from: this.me, sdp: pc.localDescription!.sdp });
    window.setTimeout(() => {
      if (!this.stopped && this.pc === pc && channel.readyState !== 'open') {
        pc.close();
        window.setTimeout(() => !this.stopped && this.pc === pc && void this.tryDirect(), DIRECT_RETRY_MS);
      }
    }, DIRECT_WAIT_MS);
  }

  /** One request to the hub, over the direct connection when it's open, else through the relay. */
  async request<T>(kind: string, name = '', args: Record<string, unknown> = {}): Promise<T> {
    await this.opened;
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.waiting.delete(id);
        reject(new LinkError('Your PC did not answer: is it on, with the Tiny Agents hub running?', 504));
      }, REQUEST_MS);
      this.waiting.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      const req = { from: this.me, id, kind, name, args };
      if (this.channel?.readyState === 'open') {
        this.channel.send(JSON.stringify(req));
      } else {
        this.broadcast('req', req);
      }
    });
  }
}
