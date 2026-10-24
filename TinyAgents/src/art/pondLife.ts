import { Part } from './types';
import { canvasPen, cream, grass, ink, makeCanvas, mix, mustard, plant, rng, steel, terracotta, trim, walnut, water, yellow } from './kit';
import { lean } from './outdoor';

/*
 * Pond life (drawn by src/features/pond.ts): koi plotted at any heading (pixel art is never rotated, so each of
 * 16 headings is painted pixel by pixel), their side view mid-jump, ripple rings, lily pads and reed clumps.
 */

interface KoiLook {
  body: string;
  shade: string;
  lit: string;
  patch?: string;
}

/** Kohaku (white with red), orange, yellow ogon, grey carp. */
const LOOKS: KoiLook[] = [
  { body: cream[5], shade: cream[4], lit: cream[6], patch: terracotta[4] },
  { body: terracotta[4], shade: terracotta[3], lit: terracotta[5] },
  { body: mustard[4], shade: mustard[3], lit: yellow[2] },
  { body: steel[3], shade: steel[2], lit: steel[4] },
];

export const KOI_KINDS = LOOKS.length;
export const KOI_HEADINGS = 16;
/** Koi canvases are KOI_SIZE square with the fish's centre at KOI_SIZE / 2. */
export const KOI_SIZE = 17;

const UNDERWATER = water[2];
const cache = new Map<string, HTMLCanvasElement>();

function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = cache.get(key);
  if (!c) {
    c = make();
    cache.set(key, c);
  }
  return c;
}

/**
 * Paints a koi heading `angle` (radians, screen space). `wig` bends the tail (-1..1). Top view (`side` false):
 * the flank facing the top-left light is lit. Side view (mid-jump): darker back,
 * lit belly, dorsal fin and an eye.
 */
function plotKoi(look: KoiLook, angle: number, wig: number, side: boolean, tint: number): HTMLCanvasElement {
  const c = KOI_SIZE / 2;
  const [canvas, ctx] = makeCanvas(KOI_SIZE, KOI_SIZE);
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const put = (x: number, y: number, col: string) => {
    ctx.fillStyle = tint ? mix(col, UNDERWATER, tint) : col;
    ctx.fillRect(x, y, 1, 1);
  };
  for (let y = 0; y < KOI_SIZE; y++) {
    for (let x = 0; x < KOI_SIZE; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const u = dx * ca + dy * sa;
      const v = -dx * sa + dy * ca - (u < 0 ? (wig * u * u) / 24 : 0);
      const t = (u - 0.6) / 3.9;
      const hw = t * t < 1 ? (side ? 2.2 : 1.9) * Math.sqrt(1 - t * t) : 0;
      // which way this flank faces in screen space: top view against the light, side view up or down
      const nx = -sa * Math.sign(v);
      const ny = ca * Math.sign(v);
      const facing = side ? -ny : -0.6 * nx - 0.8 * ny;
      if (hw > 0 && Math.abs(v) <= hw) {
        const rim = Math.abs(v) > hw * 0.45;
        let col = look.body;
        if (look.patch && (u > 2.4 || (u > -1.6 && u < 0.9 && v > -0.6))) {
          col = look.patch;
        }
        if (rim && facing < -0.3) {
          col = side ? look.lit : mix(col, look.shade, look.patch && col === look.patch ? 0.6 : 1);
        } else if (rim && facing > 0.3) {
          col = side ? mix(col, look.shade, 0.8) : look.lit;
        }
        if (side && u > 2.7 && u < 3.7 && facing > 0 && Math.abs(v) > 0.3 && Math.abs(v) < 1.2) {
          col = ink;
        }
        put(x, y, col);
        continue;
      }
      const fin = mix(look.body, look.lit, 0.5);
      if (u < -2.9 && u > -5.7 && Math.abs(v) <= 0.4 + (-2.9 - u) * 0.5) {
        put(x, y, u < -4.8 ? look.shade : fin);
      } else if (side && facing > 0.3 && u > -1.2 && u < 1.4 && Math.abs(v) > hw && Math.abs(v) < hw + 1.2) {
        put(x, y, look.shade);
      }
    }
  }
  return canvas;
}

/** A koi swimming under the surface, tinted by the water: heading index 0..15 (0 = east, clockwise), tail -1..1. */
export function koiUnder(kind: number, heading: number, tail: number): HTMLCanvasElement {
  return cached(`u${kind}|${heading}|${tail}`, () => plotKoi(LOOKS[kind], (heading / KOI_HEADINGS) * Math.PI * 2, tail, false, 0.2));
}

/** A koi in the air, side view: `tilt` -1 rising, 0 at the top of the arc, 1 diving back in. */
export function koiLeap(kind: number, right: boolean, tilt: number): HTMLCanvasElement {
  const a = tilt * 0.65;
  return cached(`j${kind}|${right}|${tilt}`, () => plotKoi(LOOKS[kind], right ? a : Math.PI - a, tilt * 0.5, true, 0));
}

/** An expanding ripple ring: a pixel ellipse outline 2r+1 wide and r+1 tall (top-down 3/4). */
export function rippleRing(r: number, bright: boolean): HTMLCanvasElement {
  return cached(`r${r}|${bright}`, () => {
    const w = 2 * r + 1;
    const h = r + 1;
    const [canvas, ctx] = makeCanvas(w, h);
    const inside = (x: number, y: number) => {
      const ex = (x + 0.5 - w / 2) / (w / 2);
      const ey = (y + 0.5 - h / 2) / (h / 2);
      return x >= 0 && y >= 0 && x < w && y < h && ex * ex + ey * ey <= 1;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (inside(x, y) && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1))) {
          ctx.fillStyle = y < h / 2 ? (bright ? water[5] : water[4]) : mix(water[4], water[3], 0.5);
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    return canvas;
  });
}

/** A lily pad (w x h px) with its notch, a darker water line under it and, optionally, a pink-and-white bloom. */
export function lilyPad(w: number, h: number, bloom: boolean): HTMLCanvasElement {
  return cached(`l${w}|${h}|${bloom}`, () => {
    const p = canvasPen(w + 1, h + 3, 0, 2);
    p.hline(1, h, w - 2, water[1]);
    p.ellipse(0, 0, w, h, plant[2]);
    p.ellipse(1, 0, w - 2, h - 1, plant[4]);
    p.hline(2, 1, Math.max(2, Math.floor(w / 3)), plant[5]);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    p.line(cx, cy, w - 1, cy - 1, plant[2]);
    p.erase(w - 2, cy - 1, 2, 1);
    if (bloom) {
      p.rect(cx - 2, cy - 3, 3, 2, cream[6]);
      p.px(cx - 1, cy - 4, cream[6]);
      p.px(cx - 1, cy - 3, mix(terracotta[4], terracotta[5], 0.6));
      p.px(cx, cy - 2, cream[5]);
    }
    return p.canvas;
  });
}

const reedPoses = new Map<string, Part>();

/** A clump of reeds with cattails, its base at (0, 0) of the part. `pose` 0..2 leans the tops downwind. */
export function reeds(seed: number, pose: number): Part {
  const key = `${seed}|${pose}`;
  let part = reedPoses.get(key);
  if (!part) {
    part = pose ? lean(reeds(seed, 0), pose * 0.9) : reedClump(seed);
    reedPoses.set(key, part);
  }
  return part;
}

function reedClump(seed: number): Part {
  const p = canvasPen(24, 22, 12, 20);
  const r = rng(seed);
  const stems: [number, number, number][] = [];
  for (let i = 0; i < 7; i++) {
    stems.push([Math.round((r() - 0.5) * 12), 9 + Math.floor(r() * 8), Math.round((r() - 0.5) * 3)]);
  }
  stems.sort((a, b) => b[1] - a[1]);
  p.hline(-6, 1, 12, mix(water[1], water[2], 0.5));
  stems.forEach(([x, h, tip], i) => {
    const col = i % 3 === 0 ? grass[2] : i % 3 === 1 ? grass[3] : plant[3];
    p.line(x, 0, x + tip, -h, col);
    p.px(x + tip, -h, i % 2 ? grass[4] : grass[5]);
    if (i === 1 || i === 4) {
      p.rect(x + tip - 1, -h + 2, 2, 4, walnut[3]);
      p.vline(x + tip, -h + 2, 4, walnut[2]);
      p.px(x + tip - 1, -h + 2, walnut[4]);
    }
  });
  const t = trim(p.canvas)!;
  return { canvas: t.canvas, x: t.x - 12, y: t.y - 20, z: 0 };
}
