/**
 * The AI staff's model: Qwen3.5-0.8B fine-tuned on office-worker decisions, reactions and conversations (trained in
 * G:\LLM\Custom\TinyAgent), converted to the official Qwen3.5-0.8B q4f16_1 layout so the official WebGPU library runs
 * it. Weights are served from MIND_MODEL_URL (a folder ending in /resolve/main/, as web-llm expects).
 */
export const MIND_MODEL = 'TinyAgent-0.8B-v5';
export const MIND_MODEL_URL = `${import.meta.env.BASE_URL}models/tinyagent-0.8b-v5/resolve/main/`;
/** The official prebuilt this model shares its WebGPU library with. */
export const MIND_BASE = 'Qwen3.5-0.8B-q4f16_1-MLC';

/** KV cache size: prompts are tiny, so a short window keeps VRAM low (the prebuilt libraries are compiled for small windows). */
export const MIND_CONTEXT = 1024;

/** Where the downloaded weights persist between visits ('cache': the browser Cache API). */
export const MIND_CACHE = 'cache';

/** Pause after each request, as a share of its run time (at least MIND_MIN_GAP ms), so drawing keeps the GPU. */
export const MIND_GAP = 0.25;
export const MIND_MIN_GAP = 60;
