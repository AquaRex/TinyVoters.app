import { deviceToken } from '../cloud/api';
import { hubUrl } from '../cloud/config';

/** Conversation replies first, then reactions, then routine decisions. */
export type Priority = 0 | 1 | 2;
export const REPLY: Priority = 0;
export const REACTION: Priority = 1;
export const ROUTINE: Priority = 2;

/** How long a request may wait in the queue before its moment has passed (ms), per priority. */
const MAX_QUEUED: Record<Priority, number> = { 0: Infinity, 1: 5000, 2: 8000 };

const MAX_IN_FLIGHT = 2;
const STATUS_EVERY = 5000;

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

interface Job {
  priority: Priority;
  kind: string;
  messages: Msg[];
  schema: object;
  maxTokens: number;
  temperature: number;
  /** dropped unanswered when this turns true before its turn */
  stale?: () => boolean;
  resolve: (v: { json: Record<string, unknown>; raw: string } | null) => void;
  queued: number;
}

export type EngineState = 'off' | 'loading' | 'paused' | 'ready' | 'error';

const HUB_STATES: Record<string, EngineState> = { ready: 'ready', starting: 'loading', paused: 'paused', error: 'error' };

/** Latencies per request kind (queue wait included), for the dev readout. */
export const mindStats = new Map<string, number[]>();

/**
 * The AI staff's one engine: the small model served by the Tiny Agents hub on this computer. Every agent's own mind
 * (persona, memory, chat history) goes along with each of its requests. Requests run best priority first, a couple
 * at a time, while the hub says the model is ready.
 */
class Engine {
  state: EngineState = 'off';
  note = '';
  private watching = false;
  private timer = 0;
  private queue: Job[] = [];
  private inFlight = 0;
  private listeners: (() => void)[] = [];
  /** requests in flight or queued per owner, for the "thinking" dots */
  readonly pending = new Map<object, number>();

  constructor() {
    document.addEventListener('visibilitychange', () => this.pump());
  }

  get ready(): boolean {
    return this.state === 'ready';
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private set(state: EngineState, note: string): void {
    if (state === this.state && note === this.note) {
      return;
    }
    this.state = state;
    this.note = note;
    this.listeners.forEach((fn) => fn());
    this.pump();
  }

  start(): void {
    if (this.watching) {
      return;
    }
    this.watching = true;
    void this.poll();
  }

  stop(): void {
    this.watching = false;
    clearTimeout(this.timer);
    this.queue.forEach((j) => j.resolve(null));
    this.queue = [];
    this.set('off', '');
  }

  private async poll(): Promise<void> {
    if (!deviceToken()) {
      this.set('off', 'Connect this device to your office first');
    } else {
      try {
        const res = await fetch(`${hubUrl()}/mind/status`);
        const s = (await res.json()) as { state: string; note: string };
        if (this.watching) {
          this.set(HUB_STATES[s.state] ?? 'error', s.note);
        }
      } catch {
        if (this.watching) {
          this.set('error', `The Tiny Agents hub isn't running on ${hubUrl()}`);
        }
      }
    }
    if (this.watching) {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.poll(), STATUS_EVERY);
    }
  }

  /** Queues a request; resolves with the parsed JSON (and raw text), or null when dropped or invalid. */
  ask(owner: object, priority: Priority, kind: string, messages: Msg[], schema: object, maxTokens: number, stale?: () => boolean, temperature = 0.7): Promise<{ json: Record<string, unknown>; raw: string } | null> {
    if (!this.ready) {
      return Promise.resolve(null);
    }
    this.pending.set(owner, (this.pending.get(owner) ?? 0) + 1);
    return new Promise<{ json: Record<string, unknown>; raw: string } | null>((resolve) => {
      this.queue.push({ priority, kind, messages, schema, maxTokens, temperature, stale, resolve, queued: performance.now() });
      this.pump();
    }).finally(() => {
      const n = (this.pending.get(owner) ?? 1) - 1;
      if (n > 0) {
        this.pending.set(owner, n);
      } else {
        this.pending.delete(owner);
      }
    });
  }

  get backlog(): number {
    return this.queue.length;
  }

  private pump(): void {
    while (this.ready && !document.hidden && this.inFlight < MAX_IN_FLIGHT && this.queue.length) {
      this.queue.sort((p, q) => p.priority - q.priority || p.queued - q.queued);
      const job = this.queue.shift()!;
      if (job.stale?.() || performance.now() - job.queued > MAX_QUEUED[job.priority]) {
        job.resolve(null);
        continue;
      }
      this.inFlight++;
      void this.run(job).then((r) => {
        this.inFlight--;
        job.resolve(r);
        const all = mindStats.get(job.kind) ?? [];
        all.push(performance.now() - job.queued);
        mindStats.set(job.kind, all.slice(-300));
        this.pump();
      });
    }
  }

  private async run(job: Job): Promise<{ json: Record<string, unknown>; raw: string } | null> {
    try {
      const res = await fetch(`${hubUrl()}/mind`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: deviceToken(), messages: job.messages, schema: job.schema, maxTokens: job.maxTokens, temperature: job.temperature }),
      });
      if (res.status === 503) {
        void this.poll();
        return null;
      }
      if (!res.ok) {
        return null;
      }
      const { raw } = (await res.json()) as { raw: string };
      return { json: JSON.parse(raw) as Record<string, unknown>, raw };
    } catch {
      return null;
    }
  }
}

export const engine = new Engine();
