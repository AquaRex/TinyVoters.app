export interface Pen {
  ctx: CanvasRenderingContext2D;
  r(x: number, y: number, w: number, h: number, c: string): void;
  p(x: number, y: number, c: string): void;
}

export function makeCanvas(w: number, h: number, readback = false): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: readback })!;
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

export function pen(ctx: CanvasRenderingContext2D): Pen {
  return {
    ctx,
    r(x, y, w, h, c) {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    },
    p(x, y, c) {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    },
  };
}

export function sprite(w: number, h: number, draw: (p: Pen) => void, outlineColor?: string): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(w, h);
  draw(pen(ctx));
  if (outlineColor) {
    outline(canvas, outlineColor);
  }
  return canvas;
}

export function outline(canvas: HTMLCanvasElement, color: string): void {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const src = img.data;
  const out = new Uint8ClampedArray(src);
  const [r, g, b] = hexToRgb(color);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] > 0) {
        continue;
      }
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = 255;
      }
    }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
}

export function mirror(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const [out, ctx] = makeCanvas(canvas.width, canvas.height);
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (target - c) * t);
  return '#' + [mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seeded(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function tileNoise(x: number, y: number, salt = 0): number {
  return seeded(hash(`${x},${y},${salt}`))();
}
