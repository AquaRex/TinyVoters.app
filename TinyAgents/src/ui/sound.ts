import { ux } from './prefs';
import { type Recordings, loadRecordings } from './recordings';

export type Cue = 'permission' | 'done' | 'bell' | 'celebrate';

export type Channel = 'music' | 'office' | 'chimes' | 'weather' | 'ui' | 'typing' | 'scroll';
const CHANNELS: Channel[] = ['music', 'office', 'chimes', 'weather', 'ui', 'typing', 'scroll'];
/** Channel gain at 50% volume (the original loudness); 100% doubles it. */
const BASE = 0.5;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const channels = new Map<Channel, GainNode>();

/** The shared audio context, created on the first user gesture (browsers block audio before one). */
export function audio(): AudioContext | null {
  return ctx;
}

/** The output for one kind of sound (Settings > Audio), through the master volume. */
export function channel(c: Channel): GainNode | null {
  return channels.get(c) ?? null;
}

/** Applies Settings > Audio: the master volume, and each channel's switch and volume. */
/** UI clicks sit under everything else: full volume on their slider is half the recording's level. */
const UI_LEVEL = 0.5;

export function applyAudio(): void {
  if (!ctx || !master) {
    return;
  }
  const t = ctx.currentTime;
  const on: Record<Channel, boolean> = { music: ux.music, office: ux.office, chimes: ux.chimes, weather: ux.weather, ui: ux.ui, typing: ux.typing, scroll: ux.scroll };
  const vol: Record<Channel, number> = { music: ux.volume, office: ux.officeVol, chimes: ux.chimesVol, weather: ux.weatherVol, ui: ux.uiVol, typing: ux.typingVol, scroll: ux.scrollVol };
  master.gain.setTargetAtTime(ux.master * 2, t, 0.05);
  for (const [c, g] of channels) {
    g.gain.setTargetAtTime(on[c] ? vol[c] * 2 * BASE * (c === 'ui' ? UI_LEVEL : 1) : 0, t, 0.05);
  }
}

function unlock(): void {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
    for (const c of CHANNELS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(master);
      channels.set(c, g);
    }
    applyAudio();
    const audio = ctx;
    void fetch(`${import.meta.env.BASE_URL}sounds/click.wav`)
      .then((r) => r.arrayBuffer())
      .then((b) => audio.decodeAudioData(b))
      .then((b) => (clickParts = { down: cut(audio, b, PRESS_AT, RELEASE_AT), up: cut(audio, b, RELEASE_AT, b.duration) }));
    void loadRecordings(audio).then((r) => (recorded = r));
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) {
  window.addEventListener(ev, unlock, { capture: true });
}

/** A short enveloped tone (on the chimes channel unless `out` is given). */
export function tone(freq: number, at: number, dur: number, gain: number, type: OscillatorType = 'sine', out?: AudioNode): void {
  const sfx = channel('chimes');
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
/** One second of white noise, shared by UI clicks and the music's hats and snare. */
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
  const sfx = channel('chimes');
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

/** The recorded mouse click split at the release: press 3.5 ms in, release 97.5 ms in (cut just before each onset). */
const PRESS_AT = 0.0035;
const RELEASE_AT = 0.0975;
type ClickPart = 'down' | 'up';
let clickParts: Record<ClickPart, AudioBuffer> | null = null;

function cut(audio: BaseAudioContext, b: AudioBuffer, from: number, to: number): AudioBuffer {
  const start = Math.round(from * b.sampleRate);
  const data = b.getChannelData(0).slice(start, Math.round(to * b.sampleRate));
  const out = audio.createBuffer(1, data.length, b.sampleRate);
  out.copyToChannel(data, 0);
  return out;
}

/** Presses on these get the UI click sound (the game world, a canvas, never does). */
const UI_CLICKABLE = 'button, a[href], [role="button"], [role="slider"], input[type="checkbox"], select, .ro-team';

/** Half of the recorded mouse click on the UI channel, a touch higher or lower each time. */
export function uiClick(part: ClickPart): void {
  const out = channel('ui');
  if (!ctx || !out || !clickParts || !ux.ui) {
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = clickParts[part];
  src.playbackRate.value = 0.95 + Math.random() * 0.1;
  src.connect(out);
  src.start();
}

let pressed = false;
document.addEventListener('pointerdown', (e) => {
  pressed = e.button === 0 && !!(e.target as Element | null)?.closest?.(UI_CLICKABLE);
  if (pressed) {
    uiClick('down');
  }
}, true);
document.addEventListener('pointerup', () => {
  if (pressed) {
    uiClick('up');
  }
  pressed = false;
}, true);

let recorded: Recordings | null = null;

/** A recorded office sound (a keystroke, a wheel tick) on its own channel. */
function uiSample(c: Channel, data: Float32Array, gain: number): void {
  const out = channel(c);
  if (!ctx || !out) {
    return;
  }
  const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buf.getChannelData(0).set(data);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 0.95 + Math.random() * 0.1;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(out);
  src.start();
}

/** Typing in a text field sounds like the office keyboards. */
document.addEventListener('keydown', (e) => {
  const field = (e.target as Element | null)?.closest?.('input:not([type="checkbox"]):not([type="range"]), textarea, [contenteditable="true"]');
  if (recorded && field && !e.repeat) {
    uiSample('typing', recorded.keys[Math.floor(Math.random() * recorded.keys.length)], 0.25);
  }
}, true);

/** Each wheel step (one tick, at most every 40 ms) sounds like a mouse wheel. */
let lastNotch = 0;
document.addEventListener('wheel', (e) => {
  if (recorded && e.timeStamp - lastNotch > 40) {
    lastNotch = e.timeStamp;
    uiSample('scroll', recorded.tick, 0.5);
  }
}, { capture: true, passive: true });

/** Play a chime; does nothing while chimes are off or before the first user gesture. */
export function playCue(cue: Cue): void {
  if (!ux.chimes || !ctx) {
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
  }
}
