import { ux } from './prefs';
import { audio, burst, tone } from './sound';

const BPM = 74;
const EIGHTH = 30 / BPM;
const SWING = 0.12 * EIGHTH;
/** Seconds scheduled ahead; longer in a background tab, where timers fire only about once a second. */
const lookahead = () => (document.hidden ? 1.3 : 0.3);

/** Four bars of warm seventh chords (MIDI notes) with their bass roots. */
const CHORDS: { notes: number[]; bass: number }[] = [
  { notes: [53, 57, 60, 64], bass: 41 },
  { notes: [52, 55, 59, 62], bass: 40 },
  { notes: [50, 53, 57, 60, 64], bass: 38 },
  { notes: [48, 52, 55, 59, 62], bass: 43 },
];
const PENTATONIC = [69, 72, 74, 76, 79, 81];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

let bus: GainNode | null = null;
let crackle: AudioBufferSourceNode | null = null;
let step = 0;
let nextAt = 0;

function setup(ctx: AudioContext): void {
  const warm = ctx.createBiquadFilter();
  warm.type = 'lowpass';
  warm.frequency.value = 3800;
  bus = ctx.createGain();
  bus.gain.value = 0;
  bus.connect(warm).connect(ctx.destination);
}

/** Sparse pops and a faint hiss, looped. */
function crackleBuffer(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let pop = 0;
  for (let i = 0; i < d.length; i++) {
    if (Math.random() < 0.00025) {
      pop = (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.5);
    }
    d[i] = (Math.random() * 2 - 1) * 0.012 + pop;
    pop *= 0.82;
  }
  return buf;
}

function startCrackle(ctx: AudioContext): void {
  crackle = ctx.createBufferSource();
  crackle.buffer = crackleBuffer(ctx);
  crackle.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.value = 0.18;
  crackle.connect(hp).connect(g).connect(bus!);
  crackle.start();
}

function pad(ctx: AudioContext, notes: number[], t: number, dur: number): void {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1100;
  filter.connect(bus!);
  const drift = (Math.random() - 0.5) * 12;
  notes.forEach((n, i) => {
    const at = t + i * 0.025;
    for (const detune of [drift - 6, drift + 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = hz(n);
      osc.detune.value = detune;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.035, at + 0.06);
      env.gain.setTargetAtTime(0.02, at + 0.06, 0.6);
      env.gain.setTargetAtTime(0, t + dur - 0.15, 0.12);
      osc.connect(env).connect(filter);
      osc.start(at);
      osc.stop(t + dur + 0.4);
    }
  });
}

function kick(ctx: AudioContext, t: number): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.frequency.setValueAtTime(115, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  env.gain.setValueAtTime(0.5, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.connect(env).connect(bus!);
  osc.start(t);
  osc.stop(t + 0.4);
}

/** Schedules one swung eighth note of the loop at audio time `t`. */
function play(ctx: AudioContext, t: number): void {
  const inBar = step % 8;
  const bar = Math.floor(step / 8) % CHORDS.length;
  const chord = CHORDS[bar];
  const at = (sec: number) => sec - ctx.currentTime;
  if (inBar === 0) {
    pad(ctx, chord.notes, t, EIGHTH * 8);
  }
  if (inBar === 0 || inBar === 4 || (inBar === 5 && Math.random() < 0.35)) {
    kick(ctx, t);
  }
  if (inBar === 0 || inBar === 3 || (inBar === 6 && Math.random() < 0.5)) {
    tone(hz(chord.bass), at(t), EIGHTH * 1.6, 0.16, 'sine', bus!);
  }
  if (inBar === 2 || inBar === 6) {
    burst(at(t), 0.16, 0.09, 1600, bus!);
  }
  burst(at(t), 0.035, inBar % 2 ? 0.025 : 0.04, 8500, bus!);
  if (Math.random() < 0.22) {
    const note = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
    tone(hz(note), at(t), EIGHTH * 2.5, 0.035, 'sine', bus!);
  }
}

function schedule(): void {
  const ctx = audio();
  if (!ctx || !bus || !ux.music) {
    return;
  }
  if (nextAt < ctx.currentTime) {
    nextAt = ctx.currentTime + 0.05;
  }
  while (nextAt < ctx.currentTime + lookahead()) {
    play(ctx, nextAt + (step % 2 ? SWING : 0));
    nextAt += EIGHTH;
    step++;
  }
}

/** Applies the Music toggle and volume (fades in or out). Starts once audio is unlocked by a gesture. */
export function applyMusic(): void {
  const ctx = audio();
  if (!ctx) {
    return;
  }
  if (!bus) {
    setup(ctx);
  }
  if (ux.music && !crackle) {
    startCrackle(ctx);
  } else if (!ux.music && crackle) {
    crackle.stop(ctx.currentTime + 0.6);
    crackle = null;
  }
  bus!.gain.setTargetAtTime(ux.music ? ux.volume * 0.45 : 0, ctx.currentTime, 0.2);
}

export function initMusic(): void {
  let unlocked = false;
  window.setInterval(() => {
    if (!unlocked && audio()) {
      unlocked = true;
      applyMusic();
    }
    schedule();
  }, 60);
}
