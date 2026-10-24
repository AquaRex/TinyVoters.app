import { defineFloor } from './registry';
import { FloorQuery } from './types';
import {
  Pen, asphalt as asphaltR, blue, cream, dirt, fbm2, grass as grassR, hash2, hashInt, mix, noise2, oak,
  paving, plant, rng, slate, steel, teal, terracotta, tilePen, walnut, warmgrey, water as waterR, yellow,
} from './kit';

/**
 * Floors are drawn per tile, but every feature is laid out in world pixels (planks, seams, grass patches,
 * cracks) so nothing repeats on the tile grid. Draw features that cross a tile edge whole and let the
 * clipped tile pen discard what falls outside. Edges between materials (curbs, shorelines, soft path
 * borders) come from the FloorQuery and are drawn by the tile that owns the transition.
 */

const T = 32;

/** Calls fn(lx, ly, wx, wy) for every pixel of the tile. */
function eachPixel(tx: number, ty: number, fn: (lx: number, ly: number, wx: number, wy: number) => void): void {
  for (let ly = 0; ly < T; ly++) {
    for (let lx = 0; lx < T; lx++) {
      fn(lx, ly, tx * T + lx, ty * T + ly);
    }
  }
}

/** Index 0..n-1 from a 0..1 value with fixed thresholds. */
function band(v: number, lo: number, hi: number): number {
  return v < lo ? 0 : v > hi ? 2 : 1;
}

// ---------------------------------------------------------------------------------------------------------
// Edges

const GREEN = new Set(['grass', 'grass.meadow']);
const PAVED = new Set(['paving.stone', 'paving.brick']);
const isGreen = (id: string | null) => !!id && GREEN.has(id);
const isPaved = (id: string | null) => !!id && PAVED.has(id);

type Side = 'n' | 's' | 'w' | 'e';

interface EdgeHit {
  d: number;
  side: Side;
}

/**
 * Distance (px) from a tile pixel to the nearest tile side whose neighbour matches `pred`, including the
 * inner corners where only the diagonal neighbour matches. Null when no neighbour matches. `round` > 0 rounds
 * convex corners (two matching sides) with that radius and measures inner corners as true distance.
 */
function edgeAt(q: FloorQuery, lx: number, ly: number, pred: (id: string | null) => boolean, round = 0): EdgeHit | null {
  let best: EdgeHit | null = null;
  const take = (d: number, side: Side) => {
    if (!best || d < best.d) {
      best = { d, side };
    }
  };
  const n = pred(q.floorAt(0, -1));
  const s = pred(q.floorAt(0, 1));
  const w = pred(q.floorAt(-1, 0));
  const e = pred(q.floorAt(1, 0));
  if (n) {
    take(ly, 'n');
  }
  if (s) {
    take(T - 1 - ly, 's');
  }
  if (w) {
    take(lx, 'w');
  }
  if (e) {
    take(T - 1 - lx, 'e');
  }
  const corner = (dx: number, dy: number, cx: number, cy: number, side: Side) => {
    if (pred(q.floorAt(dx, dy))) {
      const ax = Math.abs(lx - cx);
      const ay = Math.abs(ly - cy);
      take(round > 0 ? Math.hypot(ax, ay) : Math.max(ax, ay), side);
    }
  };
  const convex = (a: boolean, b: boolean, da: number, db: number, side: Side) => {
    if (round > 0 && a && b && da < round && db < round) {
      const d = round - Math.hypot(round - da, round - db);
      best = { d: Math.max(0, d), side };
    }
  };
  convex(n, w, ly, lx, ly < lx ? 'n' : 'w');
  convex(n, e, ly, T - 1 - lx, ly < T - 1 - lx ? 'n' : 'e');
  convex(s, w, T - 1 - ly, lx, T - 1 - ly < lx ? 's' : 'w');
  convex(s, e, T - 1 - ly, T - 1 - lx, ly > lx ? 's' : 'e');
  if (!n && !w) {
    corner(-1, -1, 0, 0, 'n');
  }
  if (!n && !e) {
    corner(1, -1, T - 1, 0, 'n');
  }
  if (!s && !w) {
    corner(-1, 1, 0, T - 1, 's');
  }
  if (!s && !e) {
    corner(1, 1, T - 1, T - 1, 's');
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------
// Planks

interface PlankWood {
  tones: string[];
  grain: (tone: string) => string;
  gap: (tone: string) => string;
  lit: (tone: string) => string;
  knot: string;
}

const PLANK_H = 8;
const PLANK_PERIOD = 116;

/** World x of seam k in plank row `row`: staggered per row and jittered, so planks run about 2-5 tiles. */
function seamX(row: number, k: number): number {
  return k * PLANK_PERIOD + Math.floor(hash2(row, 0, 11) * PLANK_PERIOD) + Math.floor((hash2(row, k, 12) - 0.5) * 70);
}

function drawPlanks(p: Pen, tx: number, ty: number, wood: PlankWood, salt: number): void {
  const x0 = tx * T;
  for (let i = 0; i < T / PLANK_H; i++) {
    const row = ty * (T / PLANK_H) + i + salt * 1000;
    const y = i * PLANK_H;
    const kFirst = Math.floor((x0 - 160) / PLANK_PERIOD) - 1;
    const kLast = Math.floor((x0 + T + 160) / PLANK_PERIOD) + 1;
    for (let k = kFirst; k <= kLast; k++) {
      const s0 = seamX(row, k);
      const s1 = seamX(row, k + 1);
      if (s1 <= x0 || s0 >= x0 + T) {
        continue;
      }
      const len = s1 - s0;
      const patch = noise2(s0 + len / 2, row * PLANK_H, 190, salt + 5);
      let ti = Math.floor(hash2(k, row, 13) * wood.tones.length);
      ti += patch < 0.3 ? -1 : patch > 0.7 ? 1 : 0;
      const tone = wood.tones[Math.max(0, Math.min(wood.tones.length - 1, ti))];
      const lx = s0 - x0;
      p.rect(lx, y, len, PLANK_H - 1, tone);
      p.hline(lx + 1, y, len - 2, wood.lit(tone));
      p.hline(lx, y + PLANK_H - 1, len, wood.gap(tone));
      p.vline(lx, y, PLANK_H - 1, wood.gap(tone));
      const r = rng(hashInt(k, row, 14));
      const g = wood.grain(tone);
      const streaks = Math.floor((len / 56) * (0.7 + r()));
      for (let n = 0; n < streaks; n++) {
        const gx = lx + 6 + Math.floor(r() * (len - 16));
        const gy = y + 2 + Math.floor(r() * 4);
        const gl = 8 + Math.floor(r() * 14);
        const bend = Math.floor(gl * (0.35 + r() * 0.3));
        const dir = gy > y + 3 ? -1 : 1;
        p.hline(gx, gy, bend, g);
        p.hline(gx + bend, gy + dir, Math.min(gl - bend, s1 - x0 - (gx + bend) - 3), g);
      }
      if (len > 60 && r() < 0.18) {
        const kx = lx + 10 + Math.floor(r() * (len - 22));
        p.hline(kx, y + 3, 2, wood.knot);
        p.hline(kx - 1, y + 4, 4, g);
      }
    }
  }
}

const oakWood: PlankWood = {
  tones: [mix(oak[3], oak[4], 0.5), mix(oak[3], oak[4], 0.66), mix(oak[3], oak[4], 0.8), mix(oak[3], oak[4], 0.93)],
  grain: (t) => mix(t, oak[3], 0.42),
  gap: (t) => mix(t, oak[2], 0.55),
  lit: (t) => mix(t, oak[5], 0.2),
  knot: mix(oak[2], oak[3], 0.6),
};

const walnutWood: PlankWood = {
  tones: [mix(walnut[2], walnut[3], 0.45), mix(walnut[2], walnut[3], 0.65), mix(walnut[2], walnut[3], 0.85), mix(walnut[3], walnut[4], 0.1)],
  grain: (t) => mix(t, walnut[2], 0.5),
  gap: (t) => mix(t, walnut[1], 0.6),
  lit: (t) => mix(t, walnut[4], 0.28),
  knot: mix(walnut[1], walnut[2], 0.5),
};

defineFloor({
  id: 'wood.oak',
  name: 'Oak planks',
  outdoor: false,
  draw(ctx, tx, ty) {
    drawPlanks(tilePen(ctx), tx, ty, oakWood, 0);
  },
});

defineFloor({
  id: 'wood.walnut',
  name: 'Walnut planks',
  outdoor: false,
  draw(ctx, tx, ty) {
    drawPlanks(tilePen(ctx), tx, ty, walnutWood, 3);
  },
});

// ---------------------------------------------------------------------------------------------------------
// Carpet tiles (16 px squares, alternating weave, a few squares a shade off)

interface CarpetTones {
  bases: string[];
  weave: (b: string) => string;
  fleck: (b: string) => string;
  seam: (b: string) => string;
}

function drawCarpet(p: Pen, tx: number, ty: number, c: CarpetTones, salt: number): void {
  eachPixel(tx, ty, (lx, ly, wx, wy) => {
    const sx = Math.floor(wx / 16);
    const sy = Math.floor(wy / 16);
    const u = wx - sx * 16;
    const v = wy - sy * 16;
    const n = noise2(sx * 16 + 8, sy * 16 + 8, 120, salt);
    let bi = band(n, 0.36, 0.66);
    const odd = hash2(sx, sy, salt + 1);
    if (odd < 0.07) {
      bi = Math.max(0, bi - 1);
    } else if (odd > 0.95) {
      bi = Math.min(2, bi + 1);
    }
    const base = c.bases[bi];
    const horizontal = ((sx + sy) & 1) === 0;
    const a = horizontal ? u : v;
    const b = horizontal ? v : u;
    let col = base;
    if (b % 4 === 2 && a > 0 && a < 15) {
      col = c.weave(base);
    } else if (b % 4 === 0 && hash2(wx, wy, salt + 2) < 0.05) {
      col = c.fleck(base);
    }
    if (u === 0 || v === 0) {
      col = c.seam(base);
    }
    p.px(lx, ly, col);
  });
}

function carpetFloor(id: string, name: string, ramp: readonly string[], lo: number, salt: number): void {
  const at = (t: number) => mix(ramp[lo], ramp[lo + 1], t);
  const tones: CarpetTones = {
    bases: [at(0.38), at(0.55), at(0.72)],
    weave: (b) => mix(b, ramp[lo], 0.55),
    fleck: (b) => mix(b, ramp[lo + 2] ?? ramp[lo + 1], 0.3),
    seam: (b) => mix(b, ramp[lo - 1], 0.16),
  };
  defineFloor({
    id,
    name,
    outdoor: false,
    draw(ctx, tx, ty) {
      drawCarpet(tilePen(ctx), tx, ty, tones, salt);
    },
  });
}

carpetFloor('carpet.teal', 'Teal carpet tiles', teal, 2, 40);
carpetFloor('carpet.slate', 'Slate carpet tiles', slate, 2, 60);
carpetFloor('carpet.warmgrey', 'Warm-grey carpet tiles', warmgrey, 3, 80);

// ---------------------------------------------------------------------------------------------------------
// Hard indoor floors: terrazzo, kitchen tile, restroom tile

const terrazzoBase = [mix(cream[4], cream[5], 0.3), mix(cream[4], cream[5], 0.5), mix(cream[4], cream[5], 0.68)];
const terrazzoChips = [
  mix(terracotta[4], cream[4], 0.45), mix(cream[3], cream[4], 0.2), mix(steel[4], cream[4], 0.5),
  mix(oak[4], cream[4], 0.4), cream[6], mix(cream[2], cream[3], 0.6),
];
const terrazzoStrip = mix(yellow[2], cream[4], 0.55);
const TERRAZZO_GRID = 80;

defineFloor({
  id: 'tile.terrazzo',
  name: 'Warm terrazzo',
  outdoor: false,
  draw(ctx, tx, ty) {
    const p = tilePen(ctx);
    eachPixel(tx, ty, (lx, ly, wx, wy) => {
      const n = fbm2(wx >> 1, wy >> 1, 70, 90) + (hash2(wx >> 1, wy >> 1, 91) - 0.5) * 0.05;
      p.px(lx, ly, terrazzoBase[band(n, 0.38, 0.64)]);
    });
    // chips: a jittered 4 px lattice, 2 px clusters, low contrast with a few darker stones
    const x0 = tx * T;
    const y0 = ty * T;
    for (let cy = (y0 >> 2) - 1; cy <= (y0 + T) >> 2; cy++) {
      for (let cx = (x0 >> 2) - 1; cx <= (x0 + T) >> 2; cx++) {
        const h = hash2(cx, cy, 92);
        if (h > 0.24) {
          continue;
        }
        const c = terrazzoChips[hashInt(cx, cy, 93) % terrazzoChips.length];
        const x = cx * 4 + (hashInt(cx, cy, 94) % 3) - x0;
        const y = cy * 4 + (hashInt(cx, cy, 95) % 3) - y0;
        if (h < 0.05) {
          p.rect(x, y, 2, 2, c);
          p.px(x + 1, y + 1, mix(c, cream[2], 0.3));
        } else if (h < 0.15) {
          p.hline(x, y, 2, c);
        } else {
          p.vline(x, y, 2, c);
        }
      }
    }
    // brass divider strips on a grid that doesn't follow the tiles
    for (let ly = 0; ly < T; ly++) {
      if ((y0 + ly) % TERRAZZO_GRID === 0) {
        p.hline(0, ly, T, terrazzoStrip);
      }
    }
    for (let lx = 0; lx < T; lx++) {
      if ((x0 + lx) % TERRAZZO_GRID === 0) {
        p.vline(lx, 0, T, terrazzoStrip);
      }
    }
  },
});

/** Square tiles with grout, a lit top-left inner edge and per-tile tone. */
function drawSquareTiles(p: Pen, tx: number, ty: number, size: number, tone: (sx: number, sy: number) => string, grout: string, lit: (c: string) => string, shade: (c: string) => string): void {
  eachPixel(tx, ty, (lx, ly, wx, wy) => {
    const sx = Math.floor(wx / size);
    const sy = Math.floor(wy / size);
    const u = wx - sx * size;
    const v = wy - sy * size;
    if (u === 0 || v === 0) {
      p.px(lx, ly, grout);
      return;
    }
    const c = tone(sx, sy);
    if (u === 1 || v === 1) {
      p.px(lx, ly, lit(c));
    } else if (u === size - 1 || v === size - 1) {
      p.px(lx, ly, shade(c));
    } else {
      p.px(lx, ly, c);
    }
  });
}

const kitchenA = [mix(cream[4], cream[5], 0.25), mix(cream[4], cream[5], 0.4), mix(cream[4], cream[5], 0.55)];
const kitchenB = [mix(cream[3], cream[4], 0.66), mix(cream[3], cream[4], 0.76), mix(cream[3], cream[4], 0.86)];

defineFloor({
  id: 'tile.kitchen',
  name: 'Kitchen tile',
  outdoor: false,
  draw(ctx, tx, ty) {
    const p = tilePen(ctx);
    drawSquareTiles(
      p, tx, ty, 16,
      (sx, sy) => {
        const set = ((sx + sy) & 1) === 0 ? kitchenA : kitchenB;
        const n = noise2(sx * 16, sy * 16, 110, 70) + (hash2(sx, sy, 71) - 0.5) * 0.3;
        return set[band(n, 0.36, 0.66)];
      },
      mix(cream[2], cream[3], 0.6),
      (c) => mix(c, cream[5], 0.45),
      (c) => mix(c, cream[3], 0.4),
    );
    // occasional worn spot / speck, sparse
    const r = rng(hashInt(tx, ty, 72));
    if (r() < 0.35) {
      const x = 3 + Math.floor(r() * 26);
      const y = 3 + Math.floor(r() * 26);
      if ((tx * T + x) % 16 > 1 && (ty * T + y) % 16 > 1) {
        p.hline(x, y, 2, mix(cream[3], cream[4], 0.2));
      }
    }
  },
});

const restroomTones = [mix(steel[5], steel[6], 0.35), mix(steel[5], steel[6], 0.55), mix(steel[5], steel[6], 0.72)];

defineFloor({
  id: 'tile.restroom',
  name: 'Restroom tile',
  outdoor: false,
  draw(ctx, tx, ty) {
    drawSquareTiles(
      tilePen(ctx), tx, ty, 8,
      (sx, sy) => {
        const n = noise2(sx * 8, sy * 8, 90, 75) + (hash2(sx, sy, 76) - 0.5) * 0.22;
        return restroomTones[band(n, 0.35, 0.68)];
      },
      mix(steel[4], steel[5], 0.62),
      (c) => mix(c, steel[6], 0.35),
      (c) => mix(c, steel[5], 0.4),
    );
  },
});

// ---------------------------------------------------------------------------------------------------------
// Grass and meadow

const grassTones = [mix(grassR[2], grassR[3], 0.45), grassR[3], mix(grassR[3], grassR[4], 0.45)];
const meadowTones = [mix(grassR[3], grassR[4], 0.2), mix(grassR[3], grassR[4], 0.5), mix(grassR[4], grassR[5], 0.1)];

/** Grass patch shade 0-2 at world px, quantised on 2 px cells with ragged edges. */
export function grassShade(wx: number, wy: number): number {
  const cx = wx >> 1;
  const cy = wy >> 1;
  const n = fbm2(cx * 2, cy * 2, 110, 21) + (hash2(cx, cy, 22) - 0.5) * 0.07;
  return band(n, 0.4, 0.6);
}

/** Grass colour at a world pixel (shared by tiles that let grass creep over their edges). */
function grassAt(wx: number, wy: number): string {
  return grassTones[grassShade(wx, wy)];
}

function drawGrassBase(p: Pen, tx: number, ty: number): void {
  eachPixel(tx, ty, (lx, ly, wx, wy) => p.px(lx, ly, grassAt(wx, wy)));
}

function daisy(p: Pen, x: number, y: number, petal: string, eye: string, stem: string): void {
  p.rect(x, y + 1, 3, 1, petal);
  p.rect(x + 1, y, 1, 3, petal);
  p.px(x + 1, y + 1, eye);
  p.px(x + 1, y + 3, stem);
}

/** Blades, clover and rare flowers, laid out on a world grid of 8 px cells. `keep(lx, ly)` can veto a detail. */
function drawGrassDetail(p: Pen, tx: number, ty: number, flowerRate: number, keep: (lx: number, ly: number) => boolean = () => true): void {
  const x0 = tx * T;
  const y0 = ty * T;
  for (let cy = Math.floor(y0 / 8) - 1; cy <= Math.floor((y0 + T) / 8); cy++) {
    for (let cx = Math.floor(x0 / 8) - 1; cx <= Math.floor((x0 + T) / 8); cx++) {
      const h = hash2(cx, cy, 31);
      const gx = cx * 8 + Math.floor(hash2(cx, cy, 32) * 6);
      const gy = cy * 8 + Math.floor(hash2(cx, cy, 33) * 6);
      const shade = grassShade(gx, gy);
      const lx = gx - x0;
      const ly = gy - y0;
      if (!keep(lx, ly)) {
        continue;
      }
      const dark = shade === 0 ? grassR[1] : mix(grassR[1], grassR[2], 0.6);
      const light = shade === 2 ? grassR[5] : mix(grassR[4], grassR[5], 0.4);
      if (h < 0.2) {
        p.px(lx, ly, dark);
        p.px(lx + 1, ly + 1, dark);
        p.px(lx + 2, ly, dark);
        p.px(lx + 3, ly - 1, light);
      } else if (h < 0.34) {
        p.vline(lx, ly + 1, 2, dark);
        p.vline(lx + 2, ly, 3, dark);
        p.px(lx + 2, ly - 1, light);
        p.px(lx, ly, light);
      } else if (h < 0.34 + flowerRate) {
        const kind = hash2(cx, cy, 34);
        if (kind < 0.4) {
          daisy(p, lx, ly, cream[6], yellow[2], dark);
        } else if (kind < 0.7) {
          p.rect(lx, ly, 2, 2, yellow[2]);
          p.px(lx + 1, ly + 1, yellow[1]);
          p.px(lx + 1, ly + 2, dark);
        } else {
          const cl = mix(grassR[4], grassR[5], 0.2);
          p.rect(lx, ly + 1, 2, 2, dark);
          p.rect(lx + 2, ly + 1, 2, 2, dark);
          p.rect(lx + 1, ly - 1, 2, 2, dark);
          p.px(lx, ly + 1, cl);
          p.px(lx + 2, ly + 1, cl);
          p.px(lx + 1, ly - 1, cl);
        }
      }
    }
  }
}

defineFloor({
  id: 'grass',
  name: 'Grass',
  outdoor: true,
  draw(ctx, tx, ty) {
    const p = tilePen(ctx);
    drawGrassBase(p, tx, ty);
    drawGrassDetail(p, tx, ty, 0.035);
  },
});

/** Meadow: lighter, longer grass in drifts, with flower clusters. Blends raggedly into plain grass. */
defineFloor({
  id: 'grass.meadow',
  name: 'Meadow',
  outdoor: true,
  draw(ctx, tx, ty, q) {
    const p = tilePen(ctx);
    const plainEdge = (lx: number, ly: number) => {
      const e = edgeAt(q, lx, ly, (id) => id !== 'grass.meadow');
      return e ? e.d - noise2(tx * T + lx, ty * T + ly, 9, 140) * 7 : 99;
    };
    eachPixel(tx, ty, (lx, ly, wx, wy) => {
      const shade = grassShade(wx + 300, wy + 170);
      p.px(lx, ly, plainEdge(lx, ly) < 1 ? grassAt(wx, wy) : meadowTones[shade]);
    });
    const x0 = tx * T;
    const y0 = ty * T;
    // long blades: a jittered 5 px lattice of 3-5 px strokes, dark at the root and lit at the tip
    for (let cy = Math.floor(y0 / 5) - 1; cy <= Math.floor((y0 + T) / 5) + 1; cy++) {
      for (let cx = Math.floor(x0 / 5) - 1; cx <= Math.floor((x0 + T) / 5); cx++) {
        const h = hash2(cx, cy, 141);
        const gx = cx * 5 + (hashInt(cx, cy, 142) % 4);
        const gy = cy * 5 + (hashInt(cx, cy, 143) % 4);
        const lx = gx - x0;
        const ly = gy - y0;
        if (plainEdge(Math.max(0, Math.min(31, lx)), Math.max(0, Math.min(31, ly))) < 3) {
          continue;
        }
        const shade = grassShade(gx + 300, gy + 170);
        const root = shade === 0 ? grassR[1] : mix(grassR[1], grassR[2], 0.5);
        const mid = grassR[3];
        const tip = shade === 2 ? grassR[5] : mix(grassR[4], grassR[5], 0.5);
        if (h < 0.36) {
          const len = 3 + (hashInt(cx, cy, 144) % 3);
          const lean = hash2(cx, cy, 145) < 0.5 ? -1 : 1;
          p.vline(lx, ly - len + 2, len - 1, mid);
          p.px(lx, ly, root);
          p.px(lx + lean, ly - len + 1, tip);
          p.px(lx + lean * 2, ly - 1, root);
          p.px(lx + lean * 2, ly - 2, mid);
        } else if (h < 0.36 + 0.16 * Math.max(0, noise2(gx, gy, 70, 147) - 0.45)) {
          const kind = hash2(cx, cy, 146);
          const petal = kind < 0.4 ? cream[6] : kind < 0.62 ? yellow[2] : kind < 0.82 ? mix(terracotta[4], terracotta[5], 0.6) : blue[3];
          const eye = kind < 0.4 ? yellow[2] : kind < 0.62 ? yellow[1] : kind < 0.82 ? terracotta[3] : blue[1];
          daisy(p, lx, ly - 2, petal, eye, root);
        }
      }
    }
  },
});

// ---------------------------------------------------------------------------------------------------------
// Gravel path: compacted dirt with pebbles; grass creeps over its edges

const gravelBase = [mix(dirt[2], dirt[3], 0.55), mix(dirt[2], dirt[3], 0.8), mix(dirt[3], dirt[4], 0.15)];
const pebbleTones = [mix(dirt[3], dirt[4], 0.6), dirt[4], mix(paving[3], paving[4], 0.5), mix(dirt[2], dirt[3], 0.3)];

defineFloor({
  id: 'path.gravel',
  name: 'Gravel path',
  outdoor: true,
  draw(ctx, tx, ty, q) {
    const p = tilePen(ctx);
    const x0 = tx * T;
    const y0 = ty * T;
    const edge = (lx: number, ly: number) => {
      const e = edgeAt(q, lx, ly, isGreen);
      if (!e) {
        return 99;
      }
      const wx = x0 + lx;
      const wy = y0 + ly;
      return e.d - 1.5 - noise2(wx, wy, 7, 150) * 4 - noise2(wx, wy, 3, 151) * 1.5;
    };
    eachPixel(tx, ty, (lx, ly, wx, wy) => {
      const d = edge(lx, ly);
      if (d < 0) {
        p.px(lx, ly, grassAt(wx, wy));
        return;
      }
      const n = fbm2(wx >> 1, wy >> 1, 60, 152) + (hash2(wx >> 1, wy >> 1, 153) - 0.5) * 0.08;
      p.px(lx, ly, d < 1 ? mix(dirt[1], dirt[2], 0.6) : d < 2 ? mix(dirt[2], dirt[3], 0.25) : gravelBase[band(n, 0.38, 0.62)]);
    });
    for (let cy = (y0 >> 2) - 1; cy <= (y0 + T) >> 2; cy++) {
      for (let cx = (x0 >> 2) - 1; cx <= (x0 + T) >> 2; cx++) {
        const h = hash2(cx, cy, 154);
        if (h > 0.42) {
          continue;
        }
        const lx = cx * 4 + (hashInt(cx, cy, 155) % 3) - x0;
        const ly = cy * 4 + (hashInt(cx, cy, 156) % 3) - y0;
        if (edge(Math.max(0, Math.min(31, lx)), Math.max(0, Math.min(31, ly))) < 2.5) {
          continue;
        }
        const c = pebbleTones[hashInt(cx, cy, 157) % pebbleTones.length];
        if (h < 0.12) {
          p.rect(lx, ly, 2, 1, mix(c, cream[5], 0.25));
          p.rect(lx, ly + 1, 2, 1, c);
          p.hline(lx, ly + 2, 2, mix(dirt[1], dirt[2], 0.5));
        } else {
          p.px(lx, ly, c);
          p.px(lx + 1, ly, c);
          p.px(lx + 1, ly + 1, mix(dirt[1], dirt[2], 0.5));
        }
      }
    }
    // grass tufts along the soft edge
    for (let i = 0; i < 6; i++) {
      const r = rng(hashInt(tx, ty, 158 + i));
      const lx = Math.floor(r() * 30);
      const ly = Math.floor(r() * 30);
      const d = edge(lx, ly);
      if (d >= 0 && d < 2) {
        p.px(lx, ly, grassR[2]);
        p.px(lx + 1, ly - 1, grassR[3]);
        p.px(lx + 2, ly, grassR[2]);
      }
    }
  },
});

// ---------------------------------------------------------------------------------------------------------
// Asphalt

const curbTop = paving[5];
const curbLip = mix(paving[4], paving[5], 0.4);
const curbFace = paving[2];
const curbFaceDark = paving[1];

function drawAsphalt(p: Pen, tx: number, ty: number, q: FloorQuery): void {
  const base = asphaltR[2];
  const dark = mix(asphaltR[1], asphaltR[2], 0.45);
  const light = mix(asphaltR[2], asphaltR[3], 0.4);
  eachPixel(tx, ty, (lx, ly, wx, wy) => {
    const cx = wx >> 1;
    const cy = wy >> 1;
    const n = fbm2(cx * 2, cy * 2, 140, 51) + (hash2(cx, cy, 52) - 0.5) * 0.06;
    let c = n < 0.36 ? dark : n > 0.66 ? light : base;
    const s = hash2(wx >> 1, wy, 53);
    if (s < 0.012) {
      c = mix(asphaltR[2], asphaltR[3], 0.8);
    } else if (s > 0.99) {
      c = asphaltR[1];
    }
    p.px(lx, ly, c);
  });
  // rare hairline cracks, laid out per 3x3-tile region so they cross tile edges
  const rx0 = Math.floor((tx - 1) / 3);
  const ry0 = Math.floor((ty - 1) / 3);
  for (let ry = ry0; ry <= ry0 + 1; ry++) {
    for (let rx = rx0; rx <= rx0 + 1; rx++) {
      if (hash2(rx, ry, 54) > 0.45) {
        continue;
      }
      const r = rng(hashInt(rx, ry, 55));
      let x = rx * 96 + 16 + Math.floor(r() * 64) - tx * T;
      let y = ry * 96 + 16 + Math.floor(r() * 64) - ty * T;
      const steps = 10 + Math.floor(r() * 14);
      let dx = r() < 0.5 ? 1 : -1;
      for (let i = 0; i < steps; i++) {
        p.px(x, y, asphaltR[1]);
        if (r() < 0.55) {
          x += dx;
        } else {
          y += 1;
        }
        if (r() < 0.12) {
          dx = -dx;
        }
      }
    }
  }
  // Raised sidewalk to the north: its curb face stands over the road edge and casts a thin shadow.
  if (isPaved(q.floorAt(0, -1))) {
    p.hline(0, 0, T, curbFace);
    p.hline(0, 1, T, curbFaceDark);
    p.hline(0, 2, T, asphaltR[0]);
    for (let x = (8 - ((tx * T) % 8)) % 8; x < T; x += 8) {
      if (hash2(tx * T + x, ty, 59) < 0.5) {
        p.px(x, 0, curbFaceDark);
      }
    }
  }
  if (isPaved(q.floorAt(0, 1)) || isGreen(q.floorAt(0, 1))) {
    p.hline(0, T - 1, T, asphaltR[1]);
  }
  if (isPaved(q.floorAt(-1, 0)) || isGreen(q.floorAt(-1, 0))) {
    p.vline(0, 0, T, asphaltR[0]);
    p.vline(1, 0, T, asphaltR[1]);
  }
  if (isPaved(q.floorAt(1, 0)) || isGreen(q.floorAt(1, 0))) {
    p.vline(T - 1, 0, T, asphaltR[1]);
  }
  if (isGreen(q.floorAt(0, -1))) {
    p.hline(0, 0, T, asphaltR[0]);
  }
}

defineFloor({
  id: 'asphalt',
  name: 'Asphalt',
  outdoor: true,
  drivable: true,
  draw(ctx, tx, ty, q) {
    drawAsphalt(tilePen(ctx), tx, ty, q);
  },
});

/** Curb stones on a paved tile's sides that meet asphalt (top face; the face over the road is drawn by the asphalt). */
function drawCurbs(p: Pen, tx: number, ty: number, q: FloorQuery): void {
  const road = (dx: number, dy: number) => q.floorAt(dx, dy) === 'asphalt';
  const joints = (x: number, y: number, horizontal: boolean) => {
    for (let i = 0; i < T; i++) {
      const w = (horizontal ? tx * T : ty * T) + i;
      if (w % 16 === 0) {
        if (horizontal) {
          p.vline(i, y, 3, paving[3]);
        } else {
          p.hline(x, i, 3, paving[3]);
        }
      }
    }
  };
  if (road(0, 1)) {
    p.hline(0, T - 4, T, paving[3]);
    p.hline(0, T - 3, T, curbTop);
    p.hline(0, T - 2, T, curbTop);
    p.hline(0, T - 1, T, curbLip);
    joints(0, T - 3, true);
  }
  if (road(0, -1)) {
    p.hline(0, 0, T, paving[1]);
    p.hline(0, 1, T, curbLip);
    p.hline(0, 2, T, curbTop);
    p.hline(0, 3, T, paving[3]);
    joints(0, 1, true);
  }
  if (road(-1, 0)) {
    p.vline(0, 0, T, paving[2]);
    p.vline(1, 0, T, curbTop);
    p.vline(2, 0, T, curbLip);
    p.vline(3, 0, T, paving[3]);
    joints(1, 0, false);
  }
  if (road(1, 0)) {
    p.vline(T - 4, 0, T, paving[3]);
    p.vline(T - 3, 0, T, curbTop);
    p.vline(T - 2, 0, T, curbLip);
    p.vline(T - 1, 0, T, paving[2]);
    joints(T - 3, 0, false);
  }
}

/** A thin dark border and a few grass tufts where a paved tile meets grass. */
function drawLawnEdge(p: Pen, tx: number, ty: number, q: FloorQuery, line: string): void {
  const sides: [number, number, Side][] = [[0, -1, 'n'], [0, 1, 's'], [-1, 0, 'w'], [1, 0, 'e']];
  for (const [dx, dy, side] of sides) {
    if (!isGreen(q.floorAt(dx, dy))) {
      continue;
    }
    if (side === 'n') {
      p.hline(0, 0, T, line);
    } else if (side === 's') {
      p.hline(0, T - 1, T, line);
    } else if (side === 'w') {
      p.vline(0, 0, T, line);
    } else {
      p.vline(T - 1, 0, T, line);
    }
    const r = rng(hashInt(tx * 4 + dx, ty * 4 + dy, 160));
    for (let i = 0; i < 2; i++) {
      if (r() < 0.55) {
        continue;
      }
      const a = 3 + Math.floor(r() * 24);
      const [x, y] = side === 'n' ? [a, 0] : side === 's' ? [a, T - 2] : side === 'w' ? [0, a] : [T - 2, a];
      p.px(x, y, grassR[3]);
      p.px(x + 1, y + (side === 's' ? 1 : 0), grassR[2]);
      p.px(x + (side === 'e' ? 1 : 0), y + 1, grassR[3]);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Stone paving: square slabs in staggered courses, per-slab tone, rare cracks and moss

const slabTones = [mix(paving[3], paving[4], 0.45), mix(paving[3], paving[4], 0.62), mix(paving[3], paving[4], 0.78), mix(paving[4], paving[5], 0.05)];
const SLAB = 16;

defineFloor({
  id: 'paving.stone',
  name: 'Stone paving',
  outdoor: true,
  draw(ctx, tx, ty, q) {
    const p = tilePen(ctx);
    eachPixel(tx, ty, (lx, ly, wx, wy) => {
      const sy = Math.floor(wy / SLAB);
      const off = (sy & 1) * 8;
      const sx = Math.floor((wx + off) / SLAB);
      const u = wx + off - sx * SLAB;
      const v = wy - sy * SLAB;
      if (u === 0 || v === 0) {
        p.px(lx, ly, mix(paving[2], paving[3], 0.55));
        return;
      }
      const n = noise2(sx * SLAB, sy * SLAB, 130, 161) + (hash2(sx, sy, 162) - 0.5) * 0.5;
      const c = slabTones[Math.max(0, Math.min(3, Math.floor(n * 4)))];
      if (u === 1 || v === 1) {
        p.px(lx, ly, mix(c, paving[5], 0.4));
      } else if (u === SLAB - 1 || v === SLAB - 1) {
        p.px(lx, ly, mix(c, paving[3], 0.45));
      } else if (hash2(wx, wy, 163) < 0.02) {
        p.px(lx, ly, mix(c, paving[3], 0.5));
      } else {
        p.px(lx, ly, c);
      }
    });
    // a rare cracked slab corner or moss in a joint
    const r = rng(hashInt(tx, ty, 164));
    if (r() < 0.2) {
      let x = 2 + Math.floor(r() * 12);
      let y = 2 + Math.floor(r() * 12);
      for (let i = 0; i < 6; i++) {
        p.px(x, y, mix(paving[2], paving[3], 0.4));
        x += r() < 0.6 ? 1 : 0;
        y += 1;
      }
    }
    if (r() < 0.25) {
      const x = Math.floor(r() * 30);
      const y = (16 - ((ty * T) % 16)) % 16;
      p.hline(x, y, 2, mix(grassR[2], grassR[3], 0.5));
    }
    drawLawnEdge(p, tx, ty, q, paving[2]);
    drawCurbs(p, tx, ty, q);
  },
});

// ---------------------------------------------------------------------------------------------------------
// Brick paving: basket weave of warm clay pavers with a soldier-course border where it meets other ground

const paverTones = [mix(terracotta[2], terracotta[3], 0.45), mix(terracotta[2], terracotta[3], 0.65), mix(terracotta[2], terracotta[3], 0.85), mix(terracotta[3], oak[3], 0.35)];
const paverJoint = mix(dirt[2], dirt[3], 0.4);

function paverPixel(wx: number, wy: number): string {
  const bx = Math.floor(wx / 8);
  const by = Math.floor(wy / 8);
  const vertical = ((bx + by) & 1) === 1;
  const u = wx - bx * 8;
  const v = wy - by * 8;
  const along = vertical ? v : u;
  const across = vertical ? u : v;
  const half = across >> 2;
  const inA = across & 3;
  if (inA === 0 || along === 0) {
    return paverJoint;
  }
  const n = noise2(wx, wy, 120, 171) + (hash2(bx * 2 + (vertical ? half : 0), by * 2 + (vertical ? 0 : half), 172) - 0.5) * 0.55;
  const c = paverTones[Math.max(0, Math.min(3, Math.floor(n * 4)))];
  if (inA === 1) {
    return mix(c, terracotta[4], 0.35);
  }
  if (inA === 3) {
    return mix(c, terracotta[1], 0.25);
  }
  return c;
}

defineFloor({
  id: 'paving.brick',
  name: 'Brick paving',
  outdoor: true,
  draw(ctx, tx, ty, q) {
    const p = tilePen(ctx);
    const border = (id: string | null) => id !== 'paving.brick' && id !== 'asphalt';
    eachPixel(tx, ty, (lx, ly, wx, wy) => {
      const e = edgeAt(q, lx, ly, border);
      if (e && e.d < 6) {
        // soldier course: pavers set across the edge, a shade deeper
        const alongEdge = e.side === 'n' || e.side === 's' ? wx : wy;
        const d = e.d;
        if (d === 5 || alongEdge % 5 === 0) {
          p.px(lx, ly, paverJoint);
          return;
        }
        const c = mix(paverTones[hashInt(Math.floor(alongEdge / 5), e.side.charCodeAt(0), 173) % 3], terracotta[1], 0.18);
        p.px(lx, ly, d === 0 ? mix(c, terracotta[1], 0.35) : d === 4 ? mix(c, terracotta[1], 0.15) : c);
        return;
      }
      p.px(lx, ly, paverPixel(wx, wy));
    });
    drawLawnEdge(p, tx, ty, q, mix(terracotta[1], dirt[1], 0.5));
    drawCurbs(p, tx, ty, q);
  },
});

// ---------------------------------------------------------------------------------------------------------
// Pond water: deeper toward the middle, an earth bank under the north shore, a light shallow band along
// the others, sparse ripples and the odd lily pad.

const waterDeep = [mix(waterR[1], waterR[2], 0.35), mix(waterR[1], waterR[2], 0.6)];
const waterMid = [mix(waterR[2], waterR[3], 0.2), mix(waterR[2], waterR[3], 0.45)];
const waterShallow = mix(waterR[3], waterR[4], 0.3);

defineFloor({
  id: 'water',
  name: 'Pond water',
  outdoor: true,
  walkable: false,
  draw(ctx, tx, ty, q) {
    const p = tilePen(ctx);
    const x0 = tx * T;
    const y0 = ty * T;
    const land = (id: string | null) => id !== 'water';
    const shore = (lx: number, ly: number) => {
      const e = edgeAt(q, lx, ly, land, 12);
      if (!e) {
        return null;
      }
      const wob = noise2(x0 + lx, y0 + ly, 13, 180) * 5 + noise2(x0 + lx, y0 + ly, 5, 188) * 1.5;
      return { side: e.side, d: e.d - wob, raw: e.d };
    };
    eachPixel(tx, ty, (lx, ly, wx, wy) => {
      const s = shore(lx, ly);
      const depth = s ? s.raw : 40;
      if (s && s.d < 0) {
        p.px(lx, ly, grassAt(wx, wy));
        return;
      }
      if (s && s.side === 'n' && s.d < 4) {
        // the bank: the lawn's edge seen from the water, dark earth with a lit lip
        p.px(lx, ly, s.d < 1 ? mix(grassR[1], dirt[1], 0.4) : s.d < 2.5 ? dirt[1] : mix(dirt[0], waterR[0], 0.5));
        return;
      }
      if (s && s.side !== 'n' && s.d < 1) {
        p.px(lx, ly, mix(dirt[1], grassR[1], 0.5));
        return;
      }
      if (s && s.d < 3) {
        p.px(lx, ly, s.side === 'n' ? waterMid[0] : waterShallow);
        return;
      }
      const n = fbm2(wx >> 1, wy >> 1, 90, 181) + (hash2(wx >> 1, wy >> 1, 182) - 0.5) * 0.05;
      const deep = depth > 12 + n * 8;
      const tones = deep ? waterDeep : waterMid;
      p.px(lx, ly, tones[n > 0.5 ? 1 : 0]);
    });
    // ripples: short paired highlights on a jittered world lattice
    for (let cy = Math.floor(y0 / 10) - 1; cy <= Math.floor((y0 + T) / 10); cy++) {
      for (let cx = Math.floor(x0 / 14) - 1; cx <= Math.floor((x0 + T) / 14); cx++) {
        const h = hash2(cx, cy, 183);
        if (h > 0.5) {
          continue;
        }
        const lx = cx * 14 + (hashInt(cx, cy, 184) % 8) - x0;
        const ly = cy * 10 + (hashInt(cx, cy, 185) % 6) - y0;
        const s = shore(Math.max(0, Math.min(31, lx)), Math.max(0, Math.min(31, ly)));
        if (s && s.d < 5) {
          continue;
        }
        const len = 3 + (hashInt(cx, cy, 186) % 3);
        p.hline(lx, ly, len, h < 0.12 ? waterR[5] : waterR[4]);
        if (h < 0.3) {
          p.hline(lx + 2, ly + 2, len - 1, mix(waterR[3], waterR[4], 0.5));
        }
      }
    }
    // a lily pad now and then, in open water
    const r = rng(hashInt(tx, ty, 187));
    if (r() < 0.09) {
      const lx = 6 + Math.floor(r() * 18);
      const ly = 6 + Math.floor(r() * 18);
      const s = shore(lx, ly);
      if (!s || s.d > 7) {
        p.ellipse(lx, ly, 7, 5, plant[2]);
        p.ellipse(lx, ly, 6, 4, plant[4]);
        p.hline(lx + 1, ly + 1, 2, plant[5]);
        p.line(lx + 3, ly + 2, lx + 5, ly + 1, plant[2]);
        if (r() < 0.5) {
          p.rect(lx + 4, ly - 1, 2, 2, cream[6]);
          p.px(lx + 4, ly - 1, mix(terracotta[4], terracotta[5], 0.6));
        }
        p.hline(lx + 1, ly + 5, 5, waterR[1]);
      }
    }
  },
});

