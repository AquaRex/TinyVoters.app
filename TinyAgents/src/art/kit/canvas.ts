/**
 * Canvas and pen helpers. A Pen draws hard-edged, fully opaque pixels in integer coordinates.
 * Pens may carry an origin so you draw in footprint-relative coordinates (0,0 = footprint top-left)
 * even when the canvas extends above or left of the footprint.
 */

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

export interface Pen {
  readonly ctx: CanvasRenderingContext2D;
  readonly canvas: HTMLCanvasElement;
  /** Canvas pixel of drawing coordinate (0,0). */
  readonly ox: number;
  readonly oy: number;
  px(x: number, y: number, c: string): void;
  rect(x: number, y: number, w: number, h: number, c: string): void;
  hline(x: number, y: number, len: number, c: string): void;
  vline(x: number, y: number, len: number, c: string): void;
  /** Bresenham line, inclusive of both ends. */
  line(x0: number, y0: number, x1: number, y1: number, c: string): void;
  /** Filled, hard-edged, symmetric ellipse inside the box (x, y, w, h). */
  ellipse(x: number, y: number, w: number, h: number, c: string): void;
  /** Filled disc of diameter d with top-left (x, y). */
  disc(x: number, y: number, d: number, c: string): void;
  /** Rounded rectangle (corner radius 1-3 px, cut as pixel steps). */
  rrect(x: number, y: number, w: number, h: number, r: number, c: string): void;
  /** Rectangle border of 1 px. */
  frame(x: number, y: number, w: number, h: number, c: string): void;
  erase(x: number, y: number, w: number, h: number): void;
  /** Blit another canvas at drawing coords. */
  blit(src: HTMLCanvasElement, x: number, y: number): void;
}

/**
 * A pen over `ctx`. Drawing coordinate (0,0) maps to canvas pixel (ox, oy). `clip` (in drawing coordinates)
 * discards pixels outside it, e.g. a floor tile drawing features that cross into neighbouring tiles.
 */
export function pen(ctx: CanvasRenderingContext2D, ox = 0, oy = 0, clip?: { x: number; y: number; w: number; h: number }): Pen {
  const fill = (x: number, y: number, w: number, h: number, c: string) => {
    let x0 = Math.round(x);
    let y0 = Math.round(y);
    let x1 = x0 + Math.round(w);
    let y1 = y0 + Math.round(h);
    if (clip) {
      x0 = Math.max(x0, clip.x);
      y0 = Math.max(y0, clip.y);
      x1 = Math.min(x1, clip.x + clip.w);
      y1 = Math.min(y1, clip.y + clip.h);
    }
    if (x1 <= x0 || y1 <= y0) {
      return;
    }
    ctx.fillStyle = c;
    ctx.fillRect(x0 + ox, y0 + oy, x1 - x0, y1 - y0);
  };
  const spans = (x: number, y: number, w: number, h: number, c: string, half: (row: number) => number) => {
    for (let row = 0; row < h; row++) {
      const hw = half(row);
      const x0 = Math.round(w / 2 - hw);
      fill(x + x0, y + row, w - 2 * x0, 1, c);
    }
  };
  const p: Pen = {
    ctx,
    canvas: ctx.canvas,
    ox,
    oy,
    px: (x, y, c) => fill(x, y, 1, 1, c),
    rect: fill,
    hline: (x, y, len, c) => fill(x, y, len, 1, c),
    vline: (x, y, len, c) => fill(x, y, 1, len, c),
    line(x0, y0, x1, y1, c) {
      x0 = Math.round(x0);
      y0 = Math.round(y0);
      x1 = Math.round(x1);
      y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        fill(x0, y0, 1, 1, c);
        if (x0 === x1 && y0 === y1) {
          break;
        }
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
      }
    },
    ellipse(x, y, w, h, c) {
      spans(x, y, w, h, c, (row) => {
        const t = (row + 0.5 - h / 2) / (h / 2);
        return (w / 2) * Math.sqrt(Math.max(0, 1 - t * t)) + 0.15;
      });
    },
    disc(x, y, d, c) {
      p.ellipse(x, y, d, d, c);
    },
    rrect(x, y, w, h, r, c) {
      spans(x, y, w, h, c, (row) => {
        const k = Math.min(row, h - 1 - row);
        const cut = k >= r ? 0 : r === 1 ? 1 : r === 2 ? [2, 1][k] : [3, 1, 1][k] ?? 0;
        return w / 2 - cut;
      });
    },
    frame(x, y, w, h, c) {
      fill(x, y, w, 1, c);
      fill(x, y + h - 1, w, 1, c);
      fill(x, y, 1, h, c);
      fill(x + w - 1, y, 1, h, c);
    },
    erase(x, y, w, h) {
      ctx.clearRect(Math.round(x) + ox, Math.round(y) + oy, Math.round(w), Math.round(h));
    },
    blit(src, x, y) {
      ctx.drawImage(src, Math.round(x) + ox, Math.round(y) + oy);
    },
  };
  return p;
}

/** Pen for drawing one floor tile: clipped to the 32 x 32 tile at (0, 0) of an already translated ctx. */
export function tilePen(ctx: CanvasRenderingContext2D, size = 32): Pen {
  return pen(ctx, 0, 0, { x: 0, y: 0, w: size, h: size });
}

/** New canvas of w x h with a pen whose (0,0) sits at canvas pixel (ox, oy). */
export function canvasPen(w: number, h: number, ox = 0, oy = 0): Pen {
  const [, ctx] = makeCanvas(w, h);
  return pen(ctx, ox, oy);
}

/** Draws a standalone sprite and returns its canvas. */
export function sprite(w: number, h: number, draw: (p: Pen) => void): HTMLCanvasElement {
  const p = canvasPen(w, h);
  draw(p);
  return p.canvas;
}

export function mirrorX(src: HTMLCanvasElement): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(src.width, src.height);
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return canvas;
}

/** Trims fully transparent borders. Returns the trimmed canvas and its offset in the source, or null if empty. */
export function trim(src: HTMLCanvasElement): { canvas: HTMLCanvasElement; x: number; y: number } | null {
  const { width: w, height: h } = src;
  const data = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] !== 0) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < 0) {
    return null;
  }
  const [canvas, ctx] = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  ctx.drawImage(src, -x0, -y0);
  return { canvas, x: x0, y: y0 };
}

/** Number of pixels that are neither fully transparent nor fully opaque (should be 0 for sprites). */
export function semiTransparentCount(src: HTMLCanvasElement): number {
  const data = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, src.width, src.height).data;
  let n = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0 && data[i] !== 255) {
      n++;
    }
  }
  return n;
}

export function isFullyOpaque(src: HTMLCanvasElement): boolean {
  return semiTransparentCount(src) === 0;
}
