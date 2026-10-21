import { TILE } from '../config';
import { floor, variant } from '../art/registry';
import { Dir, Part } from '../art/types';
import { makeCanvas } from './pixel';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Footprint top-left inside the canvas. */
  ox: number;
  oy: number;
}

/** Flattens a set of parts (sorted by z) into one canvas. */
export function flatten(parts: Part[]): Sprite {
  if (!parts.length) {
    return { canvas: makeCanvas(1, 1)[0], ox: 0, oy: 0 };
  }
  const x0 = Math.min(...parts.map((p) => p.x));
  const y0 = Math.min(...parts.map((p) => p.y));
  const x1 = Math.max(...parts.map((p) => p.x + p.canvas.width));
  const y1 = Math.max(...parts.map((p) => p.y + p.canvas.height));
  const [canvas, ctx] = makeCanvas(x1 - x0, y1 - y0);
  for (const p of [...parts].sort((a, b) => a.z - b.z)) {
    ctx.drawImage(p.canvas, p.x - x0, p.y - y0);
  }
  return { canvas, ox: -x0, oy: -y0 };
}

const thumbs = new Map<string, Sprite>();

/** The asset's first frame for a facing, flattened (cached). */
export function assetSprite(id: string, dir: Dir): Sprite | undefined {
  const key = `${id}|${dir}`;
  let s = thumbs.get(key);
  if (!s) {
    const v = variant(id, dir);
    if (!v) {
      return undefined;
    }
    s = flatten(v.frames[0] ?? []);
    thumbs.set(key, s);
  }
  return s;
}

/** A square thumbnail: integer-scaled up when small, scaled down to fit when large. */
export function thumbnail(id: string, dir: Dir, size: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const s = assetSprite(id, dir);
  if (!s) {
    return c;
  }
  const { width: w, height: h } = s.canvas;
  const fit = (size - 4) / Math.max(w, h);
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  const dw = Math.round(w * scale);
  const dh = Math.round(h * scale);
  ctx.drawImage(s.canvas, Math.floor((size - dw) / 2), Math.floor((size - dh) / 2), dw, dh);
  return c;
}

/** A tiles x tiles patch of a floor, drawn with real neighbour queries so variation shows. */
export function floorSwatch(id: string, tiles = 2): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(tiles * TILE, tiles * TILE);
  const def = floor(id);
  if (!def) {
    return c;
  }
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      ctx.save();
      ctx.translate(tx * TILE, ty * TILE);
      def.draw(ctx, tx + 7, ty + 3, { floorAt: () => id, wallAt: () => false });
      ctx.restore();
    }
  }
  return c;
}
