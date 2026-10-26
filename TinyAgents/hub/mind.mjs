// The NPC minds: the fine-tuned model served by the hub's own Ollama (installed separately, see hub/README.md).
// Ollama runs on its own port so it never clashes with another Ollama on this computer. The model loads on the
// first request and unloads after a few idle minutes. Game mode: while something else keeps an NVIDIA GPU busy
// (a game), the minds pause and the model unloads, so the office never costs the game frames.
import { execFile, spawn } from 'node:child_process';

export const MODEL = 'tinyagent-v7b';
const OLLAMA = 'http://127.0.0.1:11435';
const OLLAMA_ENV = {
  OLLAMA_HOST: '127.0.0.1:11435',
  OLLAMA_NUM_PARALLEL: '2',
  OLLAMA_CONTEXT_LENGTH: '1024',
  OLLAMA_FLASH_ATTENTION: '1',
  OLLAMA_MAX_LOADED_MODELS: '1',
  OLLAMA_KEEP_ALIVE: '3m',
  // llama.cpp's prompt cache and context checkpoints live in system RAM and grow to gigabytes; prompts here are short
  LLAMA_ARG_CACHE_RAM: '0',
  LLAMA_ARG_CTX_CHECKPOINTS: '0',
};
/** GPU busy share (percent) that counts as "a game is running", while no answer of ours is being written. */
const GAME_BUSY = 70;
const CALM = 35;
/** Samples every 3 s: busy for 4 in a row pauses, calm for 10 in a row resumes. */
const SAMPLE_MS = 3000;
const PAUSE_AFTER = 4;
const RESUME_AFTER = 10;

export class Mind {
  state = 'starting';
  note = 'Starting the model server…';
  listeners = new Set();
  active = 0;
  lastDone = 0;
  busyRun = 0;
  calmRun = 0;

  onChange(fn) {
    this.listeners.add(fn);
  }

  set(state, note) {
    if (state !== this.state || note !== this.note) {
      this.state = state;
      this.note = note;
      this.listeners.forEach((fn) => fn());
    }
  }

  status() {
    return { state: this.state, note: this.note };
  }

  async start() {
    this.server = spawn('ollama', ['serve'], { env: { ...process.env, ...OLLAMA_ENV }, stdio: 'ignore', windowsHide: true });
    this.server.on('error', (e) => this.set('error', e.code === 'ENOENT' ? 'Ollama is not installed: get it from ollama.com, then restart the hub.' : `Ollama failed to start: ${e.message}`));
    this.server.on('exit', (code) => this.state !== 'error' && this.set('error', `Ollama stopped (exit ${code}). Restart the hub.`));
    for (let i = 0; i < 40 && this.state === 'starting'; i++) {
      if (await fetch(`${OLLAMA}/api/version`).then((r) => r.ok, () => false)) {
        const has = await fetch(`${OLLAMA}/api/show`, { method: 'POST', body: JSON.stringify({ model: MODEL }) }).then((r) => r.ok, () => false);
        this.set(has ? 'ready' : 'error', has ? '' : `The model "${MODEL}" isn't in Ollama yet: see hub/README.md → Model.`);
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (this.state === 'starting') {
      this.set('error', 'Ollama did not answer: restart the hub.');
    }
    if (this.state === 'ready') {
      this.watchGpu();
    }
  }

  stop() {
    this.server?.kill();
  }

  /** The training prompt layout exactly (ChatML, no thinking block): anything else makes the model drift. */
  prompt(messages) {
    return messages.map((m) => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join('') + '<|im_start|>assistant\n';
  }

  async ask({ messages, schema, maxTokens, temperature }) {
    if (this.state !== 'ready') {
      return null;
    }
    this.active++;
    try {
      const res = await fetch(`${OLLAMA}/api/generate`, {
        method: 'POST',
        body: JSON.stringify({
          model: MODEL, prompt: this.prompt(messages), raw: true, stream: false, format: schema,
          options: { num_predict: Math.min(160, Number(maxTokens) || 64), temperature: Number(temperature) || 0.7, stop: ['<|im_end|>'] },
        }),
      });
      if (!res.ok) {
        throw new Error(`Ollama answered ${res.status}`);
      }
      return (await res.json()).response;
    } finally {
      this.active--;
      this.lastDone = Date.now();
    }
  }

  /** Game mode (NVIDIA only: nvidia-smi). Samples are skipped while our own answers keep the GPU busy. */
  watchGpu() {
    execFile('nvidia-smi', ['--version'], (err) => {
      if (err) {
        return;
      }
      setInterval(() => this.sampleGpu(), SAMPLE_MS);
    });
  }

  sampleGpu() {
    if (this.active || Date.now() - this.lastDone < 1500 || (this.state !== 'ready' && this.state !== 'paused')) {
      return;
    }
    // starting nvidia-smi can fail outright when the computer is short on memory: skip that sample, keep the hub up
    try {
      this.queryGpu();
    } catch {
      this.busyRun = this.calmRun = 0;
    }
  }

  queryGpu() {
    execFile('nvidia-smi', ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'], (err, out) => {
      if (err) {
        return;
      }
      const busy = Number(out.trim().split('\n')[0]);
      this.busyRun = busy >= GAME_BUSY ? this.busyRun + 1 : 0;
      this.calmRun = busy <= CALM ? this.calmRun + 1 : 0;
      if (this.state === 'ready' && this.busyRun >= PAUSE_AFTER) {
        this.set('paused', 'Paused while a game is using the graphics card.');
        void fetch(`${OLLAMA}/api/generate`, { method: 'POST', body: JSON.stringify({ model: MODEL, keep_alive: 0 }) }).catch(() => undefined);
      } else if (this.state === 'paused' && this.calmRun >= RESUME_AFTER) {
        this.set('ready', '');
      }
    });
  }
}
