import { hexToRgb, rampOf, rgbToHex } from './palette';

/**
 * Selective outline (sel-out). Recolours the silhouette's own edge pixels (opaque pixels touching
 * transparency) so the shape keeps its size:
 * - default colour: the darkest step of the pixel's own ramp (wood -> dark brown, sage -> deep green)
 * - lit edges (top and left) lift one step lighter, as the bible allows
 * Pass `color` to force one colour (string) or decide per source colour (function).
 * Use it on organic shapes (plants, cushions, people). Boxes from `shapes.ts` already draw their outline.
 */
export interface SelOutOpts {
  color?: string | ((src: string) => string);
  /** Lift top/left edges one ramp step (default true). */
  lit?: boolean;
  /** Also outline holes inside the silhouette (default false: only the outer contour). */
  holes?: boolean;
  /** Add the outline outside the silhouette instead of recolouring edge pixels (needs 1 px canvas margin). */
  outside?: boolean;
}

export function selOut(canvas: HTMLCanvasElement, opts: SelOutOpts = {}): void {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] !== 0;
  const outside = opts.holes ? null : exteriorMask(d, w, h);
  const open = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) {
      return true;
    }
    return !solid(x, y) && (outside === null || outside[y * w + x] === 1);
  };
  const lit = opts.lit !== false;
  const colorFor = (src: string, litEdge: boolean): string => {
    if (typeof opts.color === 'string') {
      return opts.color;
    }
    if (opts.color) {
      return opts.color(src);
    }
    const { ramp } = rampOf(src);
    return litEdge && lit ? ramp[1] : ramp[0];
  };
  const hexAt = (i: number) => rgbToHex(d[i], d[i + 1], d[i + 2]);
  const writes: [number, string][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (opts.outside) {
        if (solid(x, y) || !open(x, y)) {
          continue;
        }
        const nb = [[x, y + 1], [x + 1, y], [x - 1, y], [x, y - 1]].find(([a, b]) => solid(a, b));
        if (nb) {
          const src = hexAt((nb[1] * w + nb[0]) * 4);
          const litEdge = nb[1] > y || nb[0] > x;
          writes.push([(y * w + x) * 4, colorFor(src, litEdge)]);
        }
        continue;
      }
      if (!solid(x, y)) {
        continue;
      }
      const up = open(x, y - 1);
      const left = open(x - 1, y);
      const down = open(x, y + 1);
      const right = open(x + 1, y);
      if (up || left || down || right) {
        const litEdge = (up || left) && !down && !right;
        writes.push([(y * w + x) * 4, colorFor(hexAt((y * w + x) * 4), litEdge)]);
      }
    }
  }
  for (const [i, c] of writes) {
    const [r, g, b] = hexToRgb(c);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** 1 where a transparent pixel connects to the canvas border (true outside), 0 for enclosed holes and solids. */
function exteriorMask(d: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const i = y * w + x;
    if (m[i] === 0 && d[i * 4 + 3] === 0) {
      m[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) {
      push(x - 1, y);
    }
    if (x < w - 1) {
      push(x + 1, y);
    }
    if (y > 0) {
      push(x, y - 1);
    }
    if (y < h - 1) {
      push(x, y + 1);
    }
  }
  return m;
}
