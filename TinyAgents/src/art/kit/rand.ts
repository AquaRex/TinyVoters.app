/**
 * Deterministic randomness. The same inputs always give the same result, so floors and props vary per tile
 * without flickering or changing between sessions.
 */

/** 32-bit integer hash of (x, y, salt). */
export function hashInt(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Hash of (x, y, salt) as a float in [0, 1). */
export function hash2(x: number, y: number, salt = 0): number {
  return hashInt(x, y, salt) / 4294967296;
}

/** Seeded PRNG (mulberry32) returning floats in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed from a string (asset id), for per-asset variation. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

export function pick<T>(items: readonly T[], r: number): T {
  return items[Math.min(items.length - 1, Math.floor(r * items.length))];
}

/**
 * Smooth value noise in [0, 1]. `x, y` are world pixels, `cell` the feature size in px (e.g. 96 for blobs
 * about three tiles across). Use for low-frequency variation that crosses tile boundaries.
 */
export function noise2(x: number, y: number, cell: number, salt = 0): number {
  const fx = x / cell;
  const fy = y / cell;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const s = (t: number) => t * t * (3 - 2 * t);
  const tx = s(fx - ix);
  const ty = s(fy - iy);
  const a = hash2(ix, iy, salt);
  const b = hash2(ix + 1, iy, salt);
  const c = hash2(ix, iy + 1, salt);
  const d = hash2(ix + 1, iy + 1, salt);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Two octaves of value noise, still in [0, 1]. Breaks up the grid feel of plain value noise. */
export function fbm2(x: number, y: number, cell: number, salt = 0): number {
  return noise2(x, y, cell, salt) * 0.68 + noise2(x + 37, y + 11, cell / 2.3, salt + 101) * 0.32;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Ordered-dither threshold in [0, 1) for pixel (x, y). `on` when value > bayer(x, y). */
export function bayer(x: number, y: number): number {
  return (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}
