/**
 * Office sounds from real recordings (CC0, see public/sounds/CREDITS.md): keystrokes (press and release, cut from one
 * sheet of 0.2 s slots), a mouse click, scroll-wheel notches built from slivers of that click, and the lift doors.
 */
export interface Recordings {
  keys: Float32Array[];
  click: Float32Array;
  scrolls: Float32Array[];
  /** the lift doors sliding (played for opening and, a touch slower, for closing) */
  door: Float32Array;
}

const KEY_SLOT = 0.2;
/** Length of the click's opening tick, used as one scroll-wheel notch. */
const NOTCH = 0.004;

async function decode(ctx: AudioContext, name: string): Promise<Float32Array> {
  const res = await fetch(`${import.meta.env.BASE_URL}sounds/${name}`);
  return (await ctx.decodeAudioData(await res.arrayBuffer())).getChannelData(0);
}

/** A flick of the wheel: `notches` small ticks 30-40 ms apart, each a sliver of the click at a varied level. */
function scroll(notch: Float32Array, sr: number, notches: number): Float32Array {
  const d = new Float32Array(Math.ceil(sr * (notches * 0.04 + 0.02)));
  let at = 0;
  for (let n = 0; n < notches; n++) {
    const g = 0.5 + Math.random() * 0.5;
    const start = Math.floor(at * sr);
    notch.forEach((v, i) => {
      d[start + i] += v * g * (1 - i / notch.length);
    });
    at += 0.03 + Math.random() * 0.01;
  }
  return d;
}

export async function loadRecordings(ctx: AudioContext): Promise<Recordings> {
  const [sheet, click, door] = await Promise.all([decode(ctx, 'keys.wav'), decode(ctx, 'click.wav'), decode(ctx, 'lift-doors.wav')]);
  const sr = ctx.sampleRate;
  const slot = Math.round(sr * KEY_SLOT);
  const keys = Array.from({ length: Math.floor(sheet.length / slot) }, (_, i) => sheet.slice(i * slot, (i + 1) * slot));
  const notch = click.slice(0, Math.round(sr * NOTCH));
  return { keys, click, scrolls: [4, 6, 8, 10].map((n) => scroll(notch, sr, n)), door };
}
