/**
 * Building Variants. Draw in footprint-relative coordinates: (0, 0) is the footprint's top-left, the
 * footprint spans (0..w*32, 0..h*32), and tall things extend to negative y. `layered` splits one drawing
 * into z-parts (e.g. a chair's backrest drawn over the sitter), so everything stays aligned by construction.
 */
import { FOOT_Y, TILE } from '../../config';
import { Dir, Light, Part, Shadow, Spot, Variant, Activity } from '../types';
import { Pen, canvasPen, mirrorX, trim } from './canvas';

export { TILE, FOOT_Y };

/**
 * Seated pose convention shared with the character artist: a seated agent's foot point is the tile's foot
 * point (+ spot px/py); their hips rest SEAT_HIP px above it. Draw seat surfaces so their front edge sits at
 * about FOOT_Y - SEAT_HIP within the seat's tile.
 */
export const SEAT_HIP = 8;

/** Drawing area in footprint-relative px. Generous is fine: parts are trimmed to their pixels. */
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bounds covering a w x h tile footprint plus `up` px above it and `pad` px on the other sides. */
export function area(wTiles: number, hTiles: number, up = 48, pad = 4): Bounds {
  return { x: -pad, y: -up, w: wTiles * TILE + pad * 2, h: hTiles * TILE + up + pad };
}

export type LayerPen = (z: number) => Pen;

/**
 * Draws one picture split into z-layers. `L(z)` returns the pen for the part with depth key z (created on
 * first use); all pens share the same footprint coordinates. Returns trimmed parts, lowest z first.
 * `post` runs on each layer canvas before trimming (e.g. `selOut`).
 */
export function layered(b: Bounds, draw: (L: LayerPen) => void, post?: (canvas: HTMLCanvasElement, z: number) => void): Part[] {
  const pens = new Map<number, Pen>();
  const L: LayerPen = (z) => {
    let p = pens.get(z);
    if (!p) {
      p = canvasPen(b.w, b.h, -b.x, -b.y);
      pens.set(z, p);
    }
    return p;
  };
  draw(L);
  const parts: Part[] = [];
  for (const [z, p] of [...pens.entries()].sort((a, c) => a[0] - c[0])) {
    post?.(p.canvas, z);
    const t = trim(p.canvas);
    if (t) {
      parts.push({ canvas: t.canvas, x: b.x + t.x, y: b.y + t.y, z });
    }
  }
  return parts;
}

/** A single part at depth z. */
export function single(b: Bounds, z: number, draw: (p: Pen) => void, post?: (canvas: HTMLCanvasElement) => void): Part[] {
  return layered(b, (L) => draw(L(z)), post ? (c) => post(c) : undefined);
}

/** Footprint for a facing: left/right swap w and h. */
export function footprint(w: number, h: number, facing: Dir): [number, number] {
  return facing === 'left' || facing === 'right' ? [h, w] : [w, h];
}

/** Uniform mask rows of one character. */
export function maskOf(w: number, h: number, ch: '#' | '.' | 's' = '#'): string[] {
  return Array.from({ length: h }, () => ch.repeat(w));
}

/**
 * Contact shadow under a base rect (x, y, w, h) in footprint px. Applies the bible's 2 px right / 1 px down
 * offset for you.
 */
export function shadow(x: number, y: number, w: number, h: number, shape: Shadow['shape'] = 'ellipse'): Shadow {
  return { shape, x: x + 2, y: y + 1, w, h };
}

/** A seat spot on tile (dx, dy) for a sitter facing `facing`. */
export function seat(facing: Dir, dx = 0, dy = 0, px?: number, py?: number): Spot {
  return { dx, dy, facing, pose: 'sit', activity: 'seat', ...(px ? { px } : {}), ...(py ? { py } : {}) };
}

/** A standing spot, e.g. the tile in front of a fixture: `stand(0, 1, 'up', 'coffee')`. */
export function stand(dx: number, dy: number, facing: Dir, activity: Activity, px?: number, py?: number): Spot {
  return { dx, dy, facing, pose: 'stand', activity, ...(px ? { px } : {}), ...(py ? { py } : {}) };
}

export interface VariantSpec {
  w: number;
  h: number;
  /** Defaults to all '#'. */
  mask?: string[];
  spots?: Spot[];
  /** One frame of parts, or several frames. */
  parts?: Part[];
  frames?: Part[][];
  anim?: Variant['anim'];
  shadows?: Shadow[];
  lights?: Light[];
}

export function makeVariant(s: VariantSpec): Variant {
  return {
    w: s.w,
    h: s.h,
    mask: s.mask ?? maskOf(s.w, s.h),
    spots: s.spots ?? [],
    frames: s.frames ?? [s.parts ?? []],
    ...(s.anim ? { anim: s.anim } : {}),
    ...(s.shadows ? { shadows: s.shadows } : {}),
    ...(s.lights ? { lights: s.lights } : {}),
  };
}

const flipDir = (d: Dir): Dir => (d === 'left' ? 'right' : d === 'right' ? 'left' : d);

/** Mirrors a variant horizontally (build 'right' from 'left'): parts, mask, spots, shadows and lights. */
export function mirrorVariant(v: Variant): Variant {
  const W = v.w * TILE;
  return {
    ...v,
    mask: v.mask.map((row) => [...row].reverse().join('')),
    spots: v.spots.map((s) => ({ ...s, dx: v.w - 1 - s.dx, facing: flipDir(s.facing), ...(s.px ? { px: -s.px } : {}) })),
    frames: v.frames.map((f) => f.map((p) => ({ ...p, canvas: mirrorX(p.canvas), x: W - p.x - p.canvas.width }))),
    ...(v.shadows ? { shadows: v.shadows.map((s) => ({ ...s, x: W - s.x - s.w + 4 })) } : {}),
    ...(v.lights ? { lights: v.lights.map((l) => ({ ...l, x: W - l.x })) } : {}),
  };
}

