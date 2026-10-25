/** Office sound effects, synthesized once into mono sample arrays (peak 1) and replayed as buffers (the desk and lift door sounds are recordings: recordings.ts). */
export interface OfficeSamples {
  print: Float32Array;
  shred: Float32Array;
  /** seamless 2 s loop */
  hum: Float32Array;
  /** seamless 8 s loop */
  rain: Float32Array;
  /** seamless 8 s loop: rain on the roof, heard from inside */
  rainIndoors: Float32Array;
  ding: Float32Array;
}

const TAU = Math.PI * 2;
const rnd = () => Math.random() * 2 - 1;

/** RBJ biquad, in place. */
function filter(d: Float32Array, type: 'lowpass' | 'highpass' | 'bandpass', freq: number, q: number, sr: number): Float32Array {
  const w = (TAU * freq) / sr;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  const [b0, b1, b2] = type === 'lowpass' ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : type === 'highpass' ? [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2] : [alpha, 0, -alpha];
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    d[i] = y;
  }
  return d;
}

function normalize(d: Float32Array): Float32Array {
  let peak = 0;
  for (const v of d) {
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < d.length; i++) {
    d[i] /= peak || 1;
  }
  return d;
}

/** Paper feed whirr, then the page sliding out. */
function print(sr: number): Float32Array {
  const len = Math.floor(sr * 2);
  const motor = new Float32Array(len);
  const rattle = new Float32Array(len);
  const slide = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.08) * Math.min(1, Math.max(0, (1.45 - t) / 0.2));
    const am = 1 + 0.3 * Math.sin(TAU * 9 * t);
    motor[i] = (Math.sin(TAU * 120 * t) * 0.5 + Math.sin(TAU * 240 * t) * 0.25 + Math.sin(TAU * 360 * t) * 0.12) * env * am;
    rattle[i] = rnd() * env * am;
    const s = (t - 1.15) / 0.75;
    slide[i] = s > 0 && s < 1 ? rnd() * Math.sin(Math.PI * s) ** 2 : 0;
  }
  filter(rattle, 'bandpass', 900, 0.8, sr);
  filter(slide, 'bandpass', 2300, 0.7, sr);
  const d = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    d[i] = motor[i] * 0.5 + rattle[i] * 0.9 + slide[i] * 1.6;
  }
  return normalize(filter(d, 'lowpass', 4000, 0.7, sr));
}

/** A short shredder grind. */
function shred(sr: number): Float32Array {
  const len = Math.floor(sr * 1.5);
  const saw = new Float32Array(len);
  const grit = new Float32Array(len);
  let phase = 0;
  let freq = 75;
  let rough = 1;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.05) * Math.min(1, Math.max(0, (1.5 - t) / 0.18));
    freq = Math.max(60, Math.min(92, freq + rnd() * 0.4));
    phase = (phase + freq / sr) % 1;
    if (i % Math.floor(sr / 40) === 0) {
      rough = 0.5 + Math.random() * 0.5;
    }
    const am = 0.6 + 0.4 * Math.abs(Math.sin(TAU * 11 * t));
    saw[i] = (phase * 2 - 1) * env * am;
    grit[i] = rnd() * env * am * rough;
  }
  filter(saw, 'lowpass', 1200, 0.7, sr);
  filter(grit, 'bandpass', 1500, 0.6, sr);
  const d = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    d[i] = saw[i] + grit[i] * 0.8;
  }
  return normalize(d);
}

/** Lift motor hum: whole cycles in 2 s so it loops without a seam. */
function hum(sr: number): Float32Array {
  const len = sr * 2;
  const rumble = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    rumble[i] = rnd();
  }
  filter(rumble, 'lowpass', 250, 0.7, sr);
  normalize(rumble);
  const d = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    d[i] = (Math.sin(TAU * 55 * t) * 0.6 + Math.sin(TAU * 110 * t) * 0.3 + Math.sin(TAU * 165 * t) * 0.1 + rumble[i] * 0.15) * (1 + 0.1 * Math.sin(TAU * 0.5 * t));
  }
  return normalize(d);
}

/** `len` samples of `layer` with its last `fade` samples crossfaded into the start, so the loop has no seam. */
function seamless(len: number, fade: number, mix: (k: number) => number): Float32Array {
  const d = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    d[i] = i < fade ? mix(i) * (i / fade) + mix(len + i) * (1 - i / fade) : mix(i);
  }
  return normalize(d);
}

/** Slow swells, as gusts drive the rain harder and softer (whole cycles per loop, so it loops). */
function gusts(k: number, len: number): number {
  return 0.9 + 0.1 * Math.sin((Math.PI * 2 * k) / len + 0.7 * Math.sin((Math.PI * 6 * k) / len));
}

/**
 * One drop hitting something (Liu, Cheng & Tong 2019, after Franz 1959): a sine at `freq` damped so hard it fades to
 * 1/e^2 within `periods` cycles. On solid ground that's 2: a tiny tick, not a thud. Glass rings a little longer.
 */
function impact(out: Float32Array, sr: number, at: number, freq: number, periods: number, gain: number): void {
  const decay = freq / (periods / 2);
  const n = Math.min(out.length - at, Math.ceil((5 / decay) * sr));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[at + i] += Math.sin(TAU * freq * t) * Math.exp(-decay * t) * gain;
  }
}

/** A drop into a puddle: the air bubble it traps rings as a short sine (Minnaert), rising slightly in pitch. */
function bubble(out: Float32Array, sr: number, at: number, freq: number, gain: number): void {
  let phase = 0;
  for (let i = 0; i < sr * 0.02 && at + i < out.length; i++) {
    const t = i / sr;
    phase += (TAU * freq * (1 + 0.15 * Math.min(1, t / 0.006))) / sr;
    out[at + i] += Math.sin(phase) * Math.exp(-t / 0.004) * gain;
  }
}

/** `perSecond` drops at random moments over `len` samples, each made by `drop(at)`. */
function scatter(len: number, sr: number, perSecond: number, drop: (out: Float32Array, at: number) => void): Float32Array {
  const out = new Float32Array(len);
  for (let k = Math.round((len / sr) * perSecond); k > 0; k--) {
    drop(out, Math.floor(Math.random() * len));
  }
  return out;
}

/** Drop loudness: most drops are small or far off and faint, a few are big and close. */
const dropGain = () => 0.08 + 0.92 * Math.random() ** 4;

/** White noise kept to the band `lo`..`hi` Hz: the soft "shhh" body of rain. */
function band(len: number, sr: number, lo: number, hi: number): Float32Array {
  const d = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    d[i] = rnd();
  }
  filter(d, 'highpass', lo, 0.7, sr);
  filter(d, 'lowpass', hi, 0.7, sr);
  return normalize(filter(d, 'lowpass', hi, 0.7, sr));
}

/**
 * Rain outdoors, open air: a soft body of rain noise (300 Hz-4 kHz), a dense patter of rounded drops up to 5 kHz
 * (very high, crisp ticks sound like frying, not rain), and the odd bubble from a drop into a puddle. No bass.
 */
function rain(sr: number): Float32Array {
  const len = sr * 8;
  const fade = sr;
  const total = len + fade;
  const body = band(total, sr, 300, 4000);
  const drops = normalize(scatter(total, sr, 1200, (out, at) => impact(out, sr, at, 600 + Math.random() * 4400, 3, dropGain())));
  const puddles = normalize(scatter(total, sr, 15, (out, at) => bubble(out, sr, at, 800 + Math.random() * 1200, 0.3 + Math.random() * 0.7)));
  const mixed = new Float32Array(total);
  for (let k = 0; k < total; k++) {
    mixed[k] = body[k] * 0.55 + drops[k] + puddles[k] * 0.12;
  }
  filter(mixed, 'lowpass', 6000, 0.7, sr);
  return seamless(len, fade, (k) => mixed[k] * gusts(k, len));
}

/**
 * Rain heard from inside: the roof turns it into a muffled patter, a soft body (300 Hz-1.5 kHz) with rounded drops in
 * the low mids and nothing above about 2 kHz or below 250 Hz, plus now and then a drop ticking on the window glass.
 */
function rainIndoors(sr: number): Float32Array {
  const len = sr * 8;
  const fade = sr;
  const total = len + fade;
  const body = band(total, sr, 300, 1500);
  const drops = normalize(scatter(total, sr, 900, (out, at) => impact(out, sr, at, 400 + Math.random() * 1400, 3, dropGain())));
  const glass = normalize(scatter(total, sr, 10, (out, at) => impact(out, sr, at, 1950 + Math.random() * 100, 8, 0.4 + Math.random() * 0.6)));
  const mixed = new Float32Array(total);
  for (let k = 0; k < total; k++) {
    mixed[k] = body[k] * 0.5 + drops[k] + glass[k] * 0.08;
  }
  filter(mixed, 'highpass', 250, 0.7, sr);
  filter(mixed, 'lowpass', 2000, 0.7, sr);
  return seamless(len, fade, (k) => mixed[k] * gusts(k, len));
}

function ding(sr: number): Float32Array {
  const d = new Float32Array(Math.floor(sr * 1.4));
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const attack = Math.min(1, t / 0.005);
    d[i] = attack * (Math.sin(TAU * 1046.5 * t) * Math.exp(-t / 0.45) + Math.sin(TAU * 2093 * t) * 0.25 * Math.exp(-t / 0.15) + Math.sin(TAU * 2890 * t) * 0.08 * Math.exp(-t / 0.08));
  }
  return normalize(d);
}

export function bakeSamples(sr: number): OfficeSamples {
  return {
    print: print(sr),
    shred: shred(sr),
    hum: hum(sr),
    rain: rain(sr),
    rainIndoors: rainIndoors(sr),
    ding: ding(sr),
  };
}
