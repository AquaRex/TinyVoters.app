import { AppConfig, WebWorkerMLCEngine, hasModelInCache, prebuiltAppConfig } from '@mlc-ai/web-llm';
import { MIND_BASE, MIND_CACHE, MIND_CONTEXT, MIND_GAP, MIND_MIN_GAP, MIND_MODEL, MIND_MODEL_URL } from './config';

/** Conversation replies first, then reactions, then routine decisions. */
export type Priority = 0 | 1 | 2;
export const REPLY: Priority = 0;
export const REACTION: Priority = 1;
export const ROUTINE: Priority = 2;

/** How long a request may wait in the queue before its moment has passed (ms), per priority. */
const MAX_QUEUED: Record<Priority, number> = { 0: Infinity, 1: 5000, 2: 8000 };

/** Tries at downloading the model when the connection drops, and the pause before each retry (ms). */
const DOWNLOAD_TRIES = 4;
const RETRY_WAIT = 4000;

export type Msg ={ role: 'system' | 'user' | 'assistant'; content: string };

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

export type EngineState = 'off' | 'unsupported' | 'loading' | 'ready' | 'error';

/** Latencies per request kind (queue wait included), for the dev readout. */
export const mindStats = new Map<string, number[]>();

const base = prebuiltAppConfig.model_list.find((m) => m.model_id === MIND_BASE)!;
const APP_CONFIG: AppConfig = {
  ...prebuiltAppConfig,
  cacheBackend: MIND_CACHE,
  model_list: [...prebuiltAppConfig.model_list, { ...base, model: new URL(MIND_MODEL_URL, location.href).href, model_id: MIND_MODEL }],
};

/**
 * The AI staff's one engine: one copy of the small model in one Web Worker, loaded once per visit (from the browser
 * cache after the first download). Every agent's own mind (persona, memory, chat history) goes along with each of its
 * requests. Requests run one at a time, best priority first, with a pause after each so drawing keeps the GPU.
 */
class Engine {
  state: EngineState = 'off';
  note = '';
  progress = 0;
  /** download stats while fetching: MB so far, MB/s, seconds left */
  download: { mb: number; speed: number; eta: number } | null = null;
  /** whether the weights were already in the cache when loading started */
  cached = false;
  loadMs = 0;
  private engine: WebWorkerMLCEngine | null = null;
  private worker: Worker | null = null;
  private queue: Job[] = [];
  private running = false;
  private listeners: (() => void)[] = [];
  /** requests in flight or queued per owner, for the "thinking" dots */
  readonly pending = new Map<object, number>();

  get ready(): boolean {
    return this.state === 'ready';
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private set(state: EngineState, note: string): void {
    this.state = state;
    this.note = note;
    this.listeners.forEach((fn) => fn());
  }

  /** Null when this browser can run the model, else the reason it can't. */
  async unsupported(): Promise<string | null> {
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) {
      return 'the browser asks to save data';
    }
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
    if (!gpu) {
      return 'this browser has no WebGPU';
    }
    const adapter = await gpu.requestAdapter().catch(() => null);
    if (!adapter) {
      return 'no WebGPU graphics adapter is available';
    }
    return adapter.features.has('shader-f16') ? null : 'the graphics adapter lacks shader-f16';
  }

  async start(): Promise<void> {
    if (this.engine || this.state === 'loading') {
      return;
    }
    const why = await this.unsupported();
    if (why) {
      this.set('unsupported', why);
      return;
    }
    this.set('loading', 'Starting…');
    // in the background: after the page has drawn its first frames and the main thread is idle
    await new Promise((r) => setTimeout(r, 2500));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => ('requestIdleCallback' in window ? requestIdleCallback(() => r(null), { timeout: 3000 }) : r(null)));
    for (let attempt = 1; ; attempt++) {
      try {
        await this.load();
        return;
      } catch (e) {
        this.teardown();
        // a dropped connection mid-download: the shards already fetched stay cached, so a retry picks up from there
        if (!(e instanceof DOMException && e.name === 'NetworkError') || attempt === DOWNLOAD_TRIES) {
          this.set('error', e instanceof Error ? e.message.split('\n')[0].slice(0, 160) : String(e));
          return;
        }
        this.set('loading', 'Download interrupted, picking up where it left off…');
        await new Promise((r) => setTimeout(r, RETRY_WAIT));
        if (this.state === 'off') {
          return;
        }
      }
    }
  }

  private async load(): Promise<void> {
    this.cached = await hasModelInCache(MIND_MODEL, APP_CONFIG).catch(() => false);
    const t0 = performance.now();
    let fetchStart = 0;
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.engine = new WebWorkerMLCEngine(this.worker, { appConfig: APP_CONFIG });
    this.engine.setInitProgressCallback((p) => {
      this.progress = p.progress;
      const mb = Number(/(\d+)MB fetched/.exec(p.text)?.[1] ?? NaN);
      if (!Number.isNaN(mb)) {
        fetchStart ||= performance.now();
        const secs = (performance.now() - fetchStart) / 1000;
        const speed = secs > 0.5 ? mb / secs : 0;
        const total = p.progress > 0 ? mb / p.progress : 0;
        this.download = { mb, speed, eta: speed > 0 ? (total - mb) / speed : 0 };
        this.set('loading', `Downloading ${mb} MB · ${Math.floor(p.progress * 100)}%`);
      } else {
        this.set('loading', `${this.cached ? 'Loading from cache' : 'Preparing'} · ${Math.floor(p.progress * 100)}%`);
      }
    });
    await this.engine.reload(MIND_MODEL, { context_window_size: MIND_CONTEXT });
    this.download = null;
    this.set('loading', 'Getting the minds ready (preparing the GPU, slower on phones)…');
    // the first request compiles the GPU pipelines: do it while loading, not when someone first talks
    await this.engine.chat.completions.create({ messages: [{ role: 'user', content: 'Say hi.' }], max_tokens: 4, response_format: { type: 'json_object', schema: JSON.stringify({ type: 'object', properties: { say: { type: 'string' } }, required: ['say'] }) } });
    this.loadMs = performance.now() - t0;
    this.set('ready', '');
    console.info(`[mind] engine ready in ${Math.round(this.loadMs)} ms (${this.cached ? 'from cache' : 'downloaded'})`);
    void this.pump();
  }

  stop(): void {
    this.teardown();
    if (this.state !== 'unsupported' && this.state !== 'error') {
      this.set('off', '');
    }
  }

  private teardown(): void {
    void this.engine?.unload().catch(() => undefined);
    this.worker?.terminate();
    this.engine = null;
    this.worker = null;
    this.download = null;
    this.queue.forEach((j) => j.resolve(null));
    this.queue = [];
    this.pending.clear();
  }

  /** Queues a request; resolves with the parsed JSON (and raw text), or null when dropped or invalid. */
  ask(owner: object, priority: Priority, kind: string, messages: Msg[], schema: object, maxTokens: number, stale?: () => boolean, temperature = 0.7): Promise<{ json: Record<string, unknown>; raw: string } | null> {
    if (!this.ready) {
      return Promise.resolve(null);
    }
    this.pending.set(owner, (this.pending.get(owner) ?? 0) + 1);
    return new Promise<{ json: Record<string, unknown>; raw: string } | null>((resolve) => {
      this.queue.push({ priority, kind, messages, schema, maxTokens, temperature, stale, resolve, queued: performance.now() });
      void this.pump();
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

  private async pump(): Promise<void> {
    if (this.running || !this.engine) {
      return;
    }
    this.running = true;
    while (this.engine && this.queue.length) {
      if (document.hidden) {
        await new Promise((r) => document.addEventListener('visibilitychange', r, { once: true }));
        continue;
      }
      this.queue.sort((p, q) => p.priority - q.priority || p.queued - q.queued);
      const job = this.queue.shift()!;
      if (job.stale?.() || performance.now() - job.queued > MAX_QUEUED[job.priority]) {
        job.resolve(null);
        continue;
      }
      const t = performance.now();
      job.resolve(await this.run(job));
      const took = performance.now() - t;
      const all = mindStats.get(job.kind) ?? [];
      all.push(performance.now() - job.queued);
      mindStats.set(job.kind, all.slice(-300));
      await new Promise((r) => setTimeout(r, Math.max(MIND_MIN_GAP, took * MIND_GAP)));
    }
    this.running = false;
  }

  private async run(job: Job): Promise<{ json: Record<string, unknown>; raw: string } | null> {
    try {
      const res = await this.engine!.chat.completions.create({
        messages: job.messages,
        temperature: job.temperature,
        max_tokens: job.maxTokens,
        response_format: { type: 'json_object', schema: JSON.stringify(job.schema) },
      });
      const raw = res.choices[0].message.content ?? '';
      return { json: JSON.parse(raw) as Record<string, unknown>, raw };
    } catch {
      return null;
    }
  }
}

export const engine = new Engine();
