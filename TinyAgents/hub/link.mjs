// How devices elsewhere reach the hub, with nothing opened on the router: the hub and the office page both connect
// out to Supabase Realtime and meet on a channel named after the office code (no tables, nothing stored). There the
// page asks for a direct WebRTC connection; once it's open, everything goes straight between them. If a network
// won't allow a direct one, requests and updates pass through the channel instead (the relay).
// The protocol on both paths: requests {from, id, kind, name, args}, replies and pushes split into pieces so no
// message passes Realtime's 256 KB cap (see src/cloud/link.ts, the page's side).
import { RTCPeerConnection } from 'werift';

const REF = 'hchyekrxubzuqrnlckpm';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjaHlla3J4dWJ6dXFybmxja3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNjI3NDIsImV4cCI6MjA5OTgzODc0Mn0.IIfUjrwSEnrAzPuRrCUblli2fJ7dYJssj7jE-526OxE';
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
const PIECE = 60000;
const HEARTBEAT_MS = 25000;
/** Nothing from Realtime for this long (it answers every heartbeat): the connection is dead, so start a new one. */
const SILENT_MS = 70000;
/** A relayed device that hasn't said hello for this long no longer gets updates through the channel. */
const RELAY_VIEWER_FOR = 70000;

function pieces(json) {
  const out = [];
  for (let i = 0; i < json.length || i === 0; i += PIECE) {
    out.push(json.slice(i, i + PIECE));
  }
  return out;
}

export class Link {
  /** @param serve (kind, name, args) => result, throwing errors with .status for refusals */
  constructor(code, serve, log) {
    this.code = code;
    this.serve = serve;
    this.log = log;
    this.peers = new Map();
    this.relayViewers = new Map();
    this.ref = 0;
  }

  start() {
    this.connect();
  }

  /** A new office code: devices on the old one lose access at once. */
  setCode(code) {
    this.code = code;
    this.peers.forEach((p) => p.pc.close());
    this.peers.clear();
    this.relayViewers.clear();
    this.ws?.close();
  }

  get topic() {
    return `realtime:ta-${this.code}`;
  }

  connect() {
    const ws = new WebSocket(`wss://${REF}.supabase.co/realtime/v1/websocket?apikey=${ANON_KEY}&vsn=1.0.0`);
    this.ws = ws;
    let beat = 0;
    let heard = Date.now();
    ws.onopen = () => {
      ws.send(JSON.stringify({ topic: this.topic, event: 'phx_join', payload: { config: { broadcast: { self: false }, private: false } }, ref: String(++this.ref) }));
      beat = setInterval(() => {
        if (Date.now() - heard > SILENT_MS) {
          this.log('Realtime went quiet: reconnecting');
          ws.close();
          return;
        }
        ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++this.ref) }));
      }, HEARTBEAT_MS);
    };
    ws.onmessage = (m) => {
      heard = Date.now();
      const msg = JSON.parse(m.data);
      // Realtime can drop the channel while the connection stays up: join again on a fresh connection
      if (msg.topic === this.topic && (msg.event === 'phx_error' || msg.event === 'phx_close' || (msg.event === 'system' && msg.payload?.status === 'error') || (msg.event === 'phx_reply' && msg.payload?.status === 'error'))) {
        this.log(`Realtime channel ${msg.event}${msg.payload?.message ? ` (${msg.payload.message})` : ''}: reconnecting`);
        ws.close();
        return;
      }
      if (msg.event === 'broadcast' && msg.topic === this.topic) {
        void this.onBroadcast(msg.payload.event, msg.payload.payload);
      }
    };
    ws.onclose = () => {
      clearInterval(beat);
      if (this.ws === ws) {
        setTimeout(() => this.connect(), 3000);
      }
    };
    ws.onerror = () => ws.close();
  }

  broadcast(event, payload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ topic: this.topic, event: 'broadcast', payload: { type: 'broadcast', event, payload }, ref: String(++this.ref) }));
    }
  }

  async onBroadcast(event, p) {
    if (event === 'hello') {
      this.relayViewers.set(p.from, Date.now());
    } else if (event === 'offer') {
      await this.answer(p.from, p.sdp).catch((e) => this.log(`A direct connection failed: ${e.message}`));
    } else if (event === 'req') {
      this.relayViewers.set(p.from, Date.now());
      const reply = await this.reply(p);
      pieces(JSON.stringify(reply)).forEach((chunk, part, all) => this.broadcast('res', { to: p.from, id: p.id, part, parts: all.length, chunk }));
    }
  }

  async reply(req) {
    try {
      return { result: await this.serve(req.kind, req.name, req.args ?? {}) };
    } catch (e) {
      return { error: { message: e?.message ?? String(e), status: e?.status ?? 500 } };
    }
  }

  /** A page asks for a direct connection: answer its offer (all candidates included, no trickling). */
  async answer(from, sdp) {
    this.peers.get(from)?.pc.close();
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const peer = { pc, channel: null };
    this.peers.set(from, peer);
    pc.onDataChannel.subscribe((channel) => {
      peer.channel = channel;
      channel.onMessage.subscribe(async (data) => {
        const req = JSON.parse(String(data));
        const reply = await this.reply(req);
        if (channel.readyState === 'open') {
          pieces(JSON.stringify(reply)).forEach((chunk, part, all) => channel.send(JSON.stringify({ type: 'res', id: req.id, part, parts: all.length, chunk })));
        }
      });
    });
    pc.connectionStateChange.subscribe((state) => {
      if ((state === 'failed' || state === 'closed') && this.peers.get(from) === peer) {
        this.peers.delete(from);
      }
    });
    await pc.setRemoteDescription({ type: 'offer', sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    if (pc.iceGatheringState !== 'complete') {
      await new Promise((done) => {
        const sub = pc.iceGatheringStateChange.subscribe((s) => s === 'complete' && (sub.unSubscribe(), done()));
        setTimeout(done, 3000);
      });
    }
    this.broadcast('answer', { to: from, sdp: pc.localDescription.sdp });
  }

  /** An update for every connected device: direct ones over their channel, relayed ones through the channel. */
  push(kind, data) {
    const json = JSON.stringify({ kind, data });
    for (const peer of this.peers.values()) {
      if (peer.channel?.readyState === 'open') {
        pieces(json).forEach((chunk, part, all) => peer.channel.send(JSON.stringify({ type: 'push', part, parts: all.length, chunk })));
      }
    }
    const now = Date.now();
    for (const [id, at] of this.relayViewers) {
      if (now - at > RELAY_VIEWER_FOR) {
        this.relayViewers.delete(id);
      }
    }
    if (this.relayViewers.size) {
      const push = `p${++this.ref}`;
      pieces(json).forEach((chunk, part, all) => this.broadcast('push', { push, part, parts: all.length, chunk }));
    }
  }

  /** Whether any device elsewhere is watching (updates are only sent then). */
  get watched() {
    return [...this.peers.values()].some((p) => p.channel?.readyState === 'open') || this.relayViewers.size > 0;
  }
}
