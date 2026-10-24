import { ux } from './prefs';

export type Cue = 'permission' | 'done' | 'bell' | 'celebrate' | 'click';

let ctx: AudioContext | null = null;
let sfx: GainNode | null = null;

/** The shared audio context, created on the first user gesture (browsers block audio before one). */
export function audio(): AudioContext | null {
  return ctx;
}

/** Output bus for sound effects. */
export function sfxBus(): GainNode | null {
  return sfx;
}

function unlock(): void {
  if (!ctx) {
    ctx = new AudioContext();
    sfx = ctx.createGain();
    sfx.gain.value = 0.5;
    sfx.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) {
  window.addEventListener(ev, unlock, { capture: true });
}

/** A short enveloped tone on the effects bus. */
export function tone(freq: number, at: number, dur: number, gain: number, type: OscillatorType = 'sine', out?: AudioNode): void {
  if (!ctx || !sfx) {
    return;
  }
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(out ?? sfx);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

let noiseBuf: AudioBuffer | null = null;
/** One second of white noise, shared by clacks, hats and crackle. */
export function noise(): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = ctx!.createBuffer(1, ctx!.sampleRate, ctx!.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = Math.random() * 2 - 1;
    }
  }
  return noiseBuf;
}

/** A filtered noise burst (key clack, hat). */
export function burst(at: number, dur: number, gain: number, freq: number, out?: AudioNode): void {
  if (!ctx || !sfx) {
    return;
  }
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise();
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.2;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(env).connect(out ?? sfx);
  src.start(t, Math.random() * 0.9);
  src.stop(t + dur + 0.02);
}

/** Play a UI/office sound cue; does nothing while sound is off or before the first user gesture. */
export function playCue(cue: Cue): void {
  if (!ux.sound || !ctx) {
    return;
  }
  switch (cue) {
    case 'permission':
      tone(880, 0, 0.6, 0.18);
      tone(1318.5, 0.12, 0.8, 0.14);
      tone(1760, 0.24, 0.9, 0.06);
      break;
    case 'done':
      tone(659.3, 0, 0.35, 0.14, 'triangle');
      tone(987.8, 0.14, 0.5, 0.12, 'triangle');
      break;
    case 'bell':
      tone(2093, 0, 1.2, 0.16);
      tone(5274, 0, 0.4, 0.04);
      tone(3140, 0, 0.8, 0.05);
      break;
    case 'celebrate':
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(f, i * 0.08, 0.4, 0.06, 'square'));
      tone(1318.5, 0.34, 0.6, 0.08, 'triangle');
      break;
    case 'click':
      burst(0, 0.03, 0.25, 3500);
      break;
  }
}
