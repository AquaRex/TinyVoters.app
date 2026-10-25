import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';
import pipelinesUrl from './pipelines.json?url';

/**
 * The model's first answer makes WebLLM create ~80 GPU pipelines synchronously (the 9 it prebuilds asynchronously
 * are only the main module's). The browser's GPU process then compiles them back to back and can't draw the game
 * meanwhile: a freeze of several seconds whenever the browser hasn't cached them. So as soon as WebLLM has its GPU
 * device, those same pipelines (captured once into pipelines.json for this model library) are compiled on it in
 * the background, one at a time, while the weights load; generating waits for that. WebLLM's own creates are then
 * instant.
 */
const PIPELINE_GAP = 15;

interface Captured {
  code: string;
  entryPoint: string;
  /** bind group layout entries, per group */
  groups: unknown[][];
}

interface Device {
  createShaderModule(d: { code: string }): unknown;
  createBindGroupLayout(d: { entries: unknown[] }): unknown;
  createPipelineLayout(d: { bindGroupLayouts: unknown[] }): unknown;
  createComputePipelineAsync(d: { layout: unknown; compute: { module: unknown; entryPoint: string } }): Promise<unknown>;
}

async function precompile(device: Device): Promise<void> {
  const list = (await (await fetch(pipelinesUrl)).json()) as Captured[];
  for (const p of list) {
    const module = device.createShaderModule({ code: p.code });
    const layout = device.createPipelineLayout({ bindGroupLayouts: p.groups.map((entries) => device.createBindGroupLayout({ entries })) });
    await device.createComputePipelineAsync({ layout, compute: { module, entryPoint: p.entryPoint } });
    await new Promise((r) => setTimeout(r, PIPELINE_GAP));
  }
}

let precompiled: Promise<void> = Promise.resolve();
const adapter = (self as unknown as { GPUAdapter: { prototype: { requestDevice: (this: unknown, d?: unknown) => Promise<Device> } } }).GPUAdapter.prototype;
const requestDevice = adapter.requestDevice;
adapter.requestDevice = async function (descriptor) {
  const device = await requestDevice.call(this, descriptor);
  precompiled = precompile(device).catch((e) => console.warn('[mind] pipeline precompile stopped:', e));
  return device;
};

/** Requests that run the model (they'd create the pipelines synchronously) wait for the precompile. */
const RUNS_MODEL = /completion|forwardTokens|embedding/i;

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = async (msg: MessageEvent) => {
  if (RUNS_MODEL.test(String(msg.data?.kind ?? ''))) {
    await precompiled;
  }
  handler.onmessage(msg);
};
