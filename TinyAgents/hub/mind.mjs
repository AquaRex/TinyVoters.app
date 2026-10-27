// The NPC minds: the fine-tuned model served by the hub's own Ollama (installed separately, see hub/README.md).
// Ollama runs on its own port so it never clashes with another Ollama on this computer. The model loads on the
// first request and unloads after a few idle minutes.
import { execFileSync, spawn } from 'node:child_process';

export const MODEL = 'tinyagent-v9-4b';
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
export class Mind {
  state = 'starting';
  note = 'Starting the model server…';
  listeners = new Set();

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
  }

  /** Ollama with the model runner it started: on Windows, killing Ollama alone leaves the runner holding the model's RAM. */
  stop() {
    if (!this.server?.pid || this.server.exitCode !== null) {
      return;
    }
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(this.server.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      this.server.kill();
    }
  }

  /** The training prompt layout exactly (ChatML, no thinking block): anything else makes the model drift. */
  prompt(messages) {
    return messages.map((m) => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join('') + '<|im_start|>assistant\n';
  }

  async ask({ messages, schema, maxTokens, temperature }) {
    if (this.state !== 'ready') {
      return null;
    }
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
  }
}
