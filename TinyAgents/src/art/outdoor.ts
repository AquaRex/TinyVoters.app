import { defineAsset } from './registry';
import { Dir, Light, Variant } from './types';
import {
  Mat, Pen, Ramp, area, blue, box, charcoal, cream, cylinder, dirt, grass, hash2, layered, leg, lightWarm, makeVariant,
  markingWhite, mat, mix, mustard, navy, oak, paintShape, paving, plant, red, rng, sage, seat, shadow, single,
  stand, steel, terracotta, walnut, yellow, asphalt,
} from './kit';

/*
 * Outdoor assets: trees, bushes, hedges, flowerbeds, park furniture, street furniture, signage and asphalt
 * markings. Foliage is painted per pixel by `leafMass`: a union of round lobes, each lit like a sphere from the
 * top-left, broken into leaf clusters on a jittered grid so tone edges and the silhouette scallop like leaves.
 */

// ---------------------------------------------------------------------------------------------------------
// Foliage

interface Lobe {
  x: number;
  y: number;
  r: number;
  ry?: number;
  /** Tone offset for this lobe (+ lighter). */
  lift?: number;
}

interface LeafOpts {
  /** Leaf-cluster size in px. */
  cell?: number;
  seed?: number;
  /** Global tone offset (+ lighter). */
  lift?: number;
  /** Share of lit clusters that get a highlight fleck (0..1). */
  sparkle?: number;
  /** Repeat the cluster pattern every n px (seamless hedges). */
  periodX?: number;
  periodY?: number;
  /** How far down the mass the shade deepens (0..1). */
  depth?: number;
}

interface Clump {
  /** Offset of the pixel from the clump centre, normalised by its radius (|o| < 1 inside). */
  ox: number;
  oy: number;
  /** 0 at the rim, 1 at the centre. */
  dome: number;
  h: number;
  cx: number;
  cy: number;
  r: number;
}

const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** Clump centre and radius for grid cell (ax, ay), optionally periodic. */
function clumpCell(ax: number, ay: number, cell: number, seed: number, periodX = 0, periodY = 0) {
  const hx = periodX ? wrap(ax, periodX / cell) : ax;
  const hy = periodY ? wrap(ay, periodY / cell) : ay;
  return {
    cx: (ax + hash2(hx, hy, seed)) * cell,
    cy: (ay + hash2(hx, hy, seed + 1)) * cell,
    r: cell * (0.68 + 0.32 * hash2(hx, hy, seed + 3)),
    h: hash2(hx, hy, seed + 2),
    hx,
    hy,
  };
}

/**
 * The frontmost leaf clump covering pixel (x, y): clumps are discs on a jittered grid, lower ones in front
 * (painter's order), so they overlap like scales. Null in the gaps between clumps.
 */
function clumpAt(x: number, y: number, cell: number, seed: number, periodX = 0, periodY = 0): Clump | null {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  let best: Clump | null = null;
  for (let j = -1; j <= 2; j++) {
    for (let i = -2; i <= 2; i++) {
      const c = clumpCell(gx + i, gy + j, cell, seed, periodX, periodY);
      const ox = (x + 0.5 - c.cx) / c.r;
      const oy = (y + 0.5 - c.cy) / c.r;
      const d2 = ox * ox + oy * oy;
      if (d2 >= 1) {
        continue;
      }
      if (!best || c.cy + c.cx * 0.05 > best.cy + best.cx * 0.05) {
        best = { ox, oy, dome: 1 - Math.sqrt(d2), h: c.h, cx: c.cx, cy: c.cy, r: c.r };
      }
    }
  }
  return best;
}

/** Tone offset from a clump: lit on its top-left, shaded bottom-right, gaps dark. */
function clumpLight(c: Clump | null): number {
  if (!c) {
    return -0.3;
  }
  return (-0.55 * c.ox - 0.8 * c.oy) * 0.3 + (c.dome - 0.35) * 0.18 + (c.h - 0.5) * 0.16;
}

/**
 * Paints a leafy mass made of lobes (back lobes first, sorted by their lower edge). Tones come from `ramp`
 * (dark -> light): step 0 outlines, 1..n-2 the body, n-1 highlight flecks. Returns the silhouette test.
 */
function leafMass(p: Pen, lobes: Lobe[], ramp: Ramp, o: LeafOpts = {}): (x: number, y: number) => boolean {
  const cell = o.cell ?? 6;
  const seed = o.seed ?? 1;
  const n = ramp.length;
  const order = [...lobes].sort((a, b) => a.y + (a.ry ?? a.r) - (b.y + (b.ry ?? b.r)));
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const l of order) {
    const ry = l.ry ?? l.r;
    x0 = Math.min(x0, Math.floor(l.x - l.r - cell));
    x1 = Math.max(x1, Math.ceil(l.x + l.r + cell));
    y0 = Math.min(y0, Math.floor(l.y - ry - cell));
    y1 = Math.max(y1, Math.ceil(l.y + ry + cell));
  }
  const top = Math.min(...order.map((l) => l.y - (l.ry ?? l.r)));
  const bot = Math.max(...order.map((l) => l.y + (l.ry ?? l.r)));
  const W = x1 - x0 + 1;
  const H = y1 - y0 + 1;
  const lobeAt = new Int16Array(W * H).fill(-1);
  const tone = new Int8Array(W * H);
  const depth = o.depth ?? 0.5;
  const lobeE = (l: Lobe, x: number, y: number) => {
    const nx = (x - l.x) / l.r;
    const ny = (y - l.y) / (l.ry ?? l.r);
    return { nx, ny, e: Math.sqrt(nx * nx + ny * ny) };
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wx = x0 + x;
      const wy = y0 + y;
      const c = clumpAt(wx, wy, cell, seed, o.periodX, o.periodY);
      for (let k = order.length - 1; k >= 0; k--) {
        const l = order[k];
        const { nx, ny, e } = lobeE(l, wx + 0.5, wy + 0.5);
        const core = e * l.r < l.r - cell * 0.6;
        const viaClump = c !== null && lobeE(l, c.cx, c.cy).e * l.r < l.r - cell * 0.15;
        if (!core && !viaClump) {
          continue;
        }
        const q = Math.min(1, e);
        const nz = Math.sqrt(1 - q * q);
        const lam = -0.5 * Math.max(-1, Math.min(1, nx)) - 0.62 * Math.max(-1, Math.min(1, ny)) + 0.6 * nz;
        const g = (wy - top) / Math.max(1, bot - top);
        const v = 0.5 * lam - depth * g + clumpLight(c) + (l.lift ?? 0) + (o.lift ?? 0);
        const i = y * W + x;
        lobeAt[i] = k;
        tone[i] = Math.max(1, Math.min(n - 2, 1 + Math.floor(((v + 0.62) / 1.2) * (n - 2))));
        break;
      }
    }
  }
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && lobeAt[y * W + x] >= 0;
  // drop lonely pixels so the silhouette has no 1 px spurs
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!inside(x, y)) {
          continue;
        }
        const nbs = +inside(x - 1, y) + +inside(x + 1, y) + +inside(x, y - 1) + +inside(x, y + 1);
        if (nbs <= 1) {
          lobeAt[y * W + x] = -1;
        }
      }
    }
  }
  // fill enclosed holes (they would show the ground through the canopy) with deep shade
  const outside = new Uint8Array(W * H);
  const stack: number[] = [];
  for (let x = 0; x < W; x++) {
    stack.push(x, (H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    stack.push(y * W, y * W + W - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    if (outside[i] || lobeAt[i] >= 0) {
      continue;
    }
    outside[i] = 1;
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0) {
      stack.push(i - 1);
    }
    if (x < W - 1) {
      stack.push(i + 1);
    }
    if (y > 0) {
      stack.push(i - W);
    }
    if (y < H - 1) {
      stack.push(i + W);
    }
  }
  for (let i = 0; i < W * H; i++) {
    if (lobeAt[i] < 0 && !outside[i]) {
      lobeAt[i] = 0;
      tone[i] = 1;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const k = lobeAt[i];
      if (k < 0) {
        continue;
      }
      const up = !inside(x, y - 1);
      const down = !inside(x, y + 1);
      const left = !inside(x - 1, y);
      const right = !inside(x + 1, y);
      let c: string;
      if (up || down || left || right) {
        c = (up || left) && !down && !right ? ramp[1] : ramp[0];
      } else {
        let ti = tone[i];
        // crevice: a clump in front (lower lobe) starts just below -> this back pixel sits in its shade
        const below1 = inside(x, y + 1) ? lobeAt[i + W] : -1;
        const below2 = inside(x, y + 2) ? lobeAt[i + 2 * W] : -1;
        if (below1 > k || below2 > k) {
          ti = Math.max(1, ti - 1);
        }
        c = ramp[ti];
      }
      p.px(x0 + x, y0 + y, c);
    }
  }
  // dappled highlight flecks on the lit top-left of bright clumps
  const sparkle = o.sparkle ?? 0.5;
  const ok = (x: number, y: number) =>
    inside(x, y) && inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1);
  for (let gy = Math.floor(y0 / cell) - 1; gy <= Math.ceil(y1 / cell); gy++) {
    for (let gx = Math.floor(x0 / cell) - 1; gx <= Math.ceil(x1 / cell); gx++) {
      const cc = clumpCell(gx, gy, cell, seed, o.periodX, o.periodY);
      if (hash2(cc.hx, cc.hy, seed + 9) > sparkle) {
        continue;
      }
      const sx = Math.round(cc.cx - cc.r * 0.4) - x0;
      const sy = Math.round(cc.cy - cc.r * 0.45) - y0;
      if (!ok(sx, sy) || !ok(sx + 1, sy) || tone[sy * W + sx] < n - 2) {
        continue;
      }
      const front = clumpAt(sx + x0, sy + y0, cell, seed, o.periodX, o.periodY);
      if (!front || front.cx !== cc.cx || front.cy !== cc.cy) {
        continue;
      }
      p.px(x0 + sx, y0 + sy, ramp[n - 1]);
      p.px(x0 + sx + 1, y0 + sy, ramp[n - 1]);
      if (cell >= 6 && ok(sx, sy + 1)) {
        p.px(x0 + sx, y0 + sy + 1, ramp[n - 1]);
      }
    }
  }
  return (x, y) => inside(x - x0, y - y0);
}

/** Thick line (round-ish brush) for branches. */
function stroke(p: Pen, x0: number, y0: number, x1: number, y1: number, w: number, c: string): void {
  for (let i = 0; i < w; i++) {
    p.line(x0 + i, y0, x1 + i, y1, c);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Trees

/** Tapered trunk with root flare, lit from the left. Base centre (cx, base), top y `top`. */
function trunk(p: Pen, cx: number, base: number, top: number, w: number, m: Mat, seed: number, birch = false): void {
  const h = base - top;
  const W = w + 8;
  const left = cx - W / 2;
  const halfAt = (y: number) => {
    const t = y / Math.max(1, h - 1);
    const flare = y > h - 5 ? (y - (h - 5)) * 0.8 : 0;
    return w / 2 - 1 + t * 1.2 + flare;
  };
  const r = rng(seed);
  paintShape(p, left, top, W, h, (x, y) => Math.abs(x + 0.5 - W / 2) <= halfAt(y), (x, y, open, edge) => {
    const half = halfAt(y);
    const u = (x + 0.5 - (W / 2 - half)) / (2 * half);
    if (edge) {
      return (open.left || open.up) && !open.right ? m.lineLit : m.line;
    }
    if (u < 0.3) {
      return birch ? m.hi : m.light;
    }
    if (u > 0.68) {
      return m.dark;
    }
    return m.base;
  });
  // bark: sparse vertical strokes (oak) or dark horizontal lenticels (birch)
  for (let i = 0; i < Math.round(h / 5); i++) {
    const y = top + 2 + Math.floor(r() * (h - 6));
    const half = halfAt(y - top);
    const x = Math.round(cx - half + 1 + r() * (2 * half - 3));
    if (birch) {
      const len = 2 + Math.floor(r() * 3);
      p.hline(Math.min(x, Math.round(cx + half - len)), y, len, m.line);
    } else {
      p.vline(x, y, 3 + Math.floor(r() * 4), r() < 0.5 ? m.dark : m.deep);
    }
  }
}

interface TreeSpec {
  lobes: Lobe[];
  ramp: Ramp;
  bark: Mat;
  birch?: boolean;
  trunkW: number;
  trunkTop: number;
  branches: [number, number, number, number, number][];
  seed: number;
  cell: number;
  lift?: number;
  sparkle?: number;
  depth?: number;
  /** Canopy shadow ellipse (footprint px, before the 2/1 offset). */
  shade: [number, number, number, number];
}

const Z_TRUNK = 28;
const Z_CANOPY = 40;

function treeVariant(s: TreeSpec): Variant {
  const parts = layered(area(1, 1, 160, 70), (L) => {
    const t = L(Z_TRUNK);
    for (const [x0, y0, x1, y1, w] of s.branches) {
      stroke(t, x0, y0, x1, y1, w, s.bark.base);
      stroke(t, x0 + w - 1, y0, x1 + w - 1, y1, 1, s.bark.dark);
    }
    trunk(t, 16, 28, s.trunkTop, s.trunkW, s.bark, s.seed, s.birch);
    leafMass(L(Z_CANOPY), s.lobes, s.ramp, { cell: s.cell, seed: s.seed, lift: s.lift, sparkle: s.sparkle, depth: s.depth });
  });
  const [sx, sy, sw, sh] = s.shade;
  return makeVariant({
    w: 1,
    h: 1,
    parts,
    shadows: [shadow(sx, sy, sw, sh), shadow(7, 23, 20, 8)],
  });
}

/** Autumn maple: terracotta into mustard (highlights lean yellow). */
const mapleRamp: Ramp = [terracotta[0], terracotta[1], terracotta[2], terracotta[3], terracotta[4], mustard[3], mustard[4]];
/** Birch: airy yellow-green. */
const birchRamp: Ramp = [grass[0], grass[1], grass[2], grass[3], grass[4], grass[5], plant[6]];
/** Linden: deep, cool green. */
const lindenRamp: Ramp = [plant[0], plant[1], plant[2], mix(plant[2], plant[3], 0.5), plant[3], plant[4], plant[5]];

defineAsset({
  id: 'tree.oak.a',
  name: 'Oak tree',
  group: 'tree',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['tree', 'oak', 'park', 'green'],
  build() {
    return treeVariant({
      ramp: plant,
      bark: mat(walnut),
      trunkW: 9,
      trunkTop: -40,
      seed: 11,
      cell: 7,
      branches: [[14, -12, 2, -36, 3], [17, -16, 32, -40, 3], [15, -22, 12, -56, 2]],
      lobes: [
        { x: 0, y: -86, r: 19 },
        { x: 32, y: -88, r: 19 },
        { x: 16, y: -96, r: 17, lift: 0.1 },
        { x: -18, y: -62, r: 18 },
        { x: 50, y: -62, r: 18 },
        { x: 14, y: -68, r: 24 },
        { x: -10, y: -38, r: 17 },
        { x: 16, y: -32, r: 19 },
        { x: 42, y: -38, r: 17 },
        { x: -26, y: -44, r: 11 },
        { x: 58, y: -44, r: 11 },
      ],
      shade: [-28, 4, 92, 34],
    });
  },
});

defineAsset({
  id: 'tree.oak.b',
  name: 'Spreading oak',
  group: 'tree',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['tree', 'oak', 'park', 'green', 'wide'],
  build() {
    return treeVariant({
      ramp: lindenRamp,
      bark: mat(walnut, 1),
      trunkW: 10,
      trunkTop: -34,
      seed: 23,
      cell: 8,
      lift: 0.05,
      branches: [[13, -10, -10, -30, 3], [18, -12, 44, -32, 3], [15, -18, 18, -48, 2]],
      lobes: [
        { x: -22, y: -70, r: 18 },
        { x: 4, y: -82, r: 20 },
        { x: 30, y: -84, r: 20 },
        { x: 54, y: -70, r: 18 },
        { x: -36, y: -46, r: 15 },
        { x: -12, y: -54, r: 21 },
        { x: 18, y: -60, r: 23 },
        { x: 46, y: -52, r: 21 },
        { x: 68, y: -44, r: 14 },
        { x: -22, y: -30, r: 14 },
        { x: 4, y: -30, r: 17 },
        { x: 30, y: -28, r: 17 },
        { x: 54, y: -30, r: 14 },
      ],
      shade: [-40, 2, 116, 36],
    });
  },
});

defineAsset({
  id: 'tree.birch',
  name: 'Birch tree',
  group: 'tree',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['tree', 'birch', 'park', 'light'],
  build() {
    return treeVariant({
      ramp: birchRamp,
      bark: mat(cream),
      birch: true,
      trunkW: 6,
      trunkTop: -78,
      seed: 37,
      cell: 5,
      lift: 0.06,
      sparkle: 0.65,
      depth: 0.4,
      branches: [[15, -30, 2, -52, 2], [16, -44, 30, -66, 2], [15, -60, 6, -84, 1], [16, -20, 27, -34, 1]],
      lobes: [
        { x: 16, y: -112, r: 12, ry: 14 },
        { x: 5, y: -97, r: 12 },
        { x: 28, y: -99, r: 12 },
        { x: 16, y: -90, r: 13 },
        { x: 0, y: -77, r: 11 },
        { x: 32, y: -79, r: 12 },
        { x: 15, y: -70, r: 12 },
        { x: 4, y: -55, r: 10 },
        { x: 29, y: -53, r: 10 },
      ],
      shade: [-14, 6, 64, 26],
    });
  },
});

defineAsset({
  id: 'tree.maple',
  name: 'Maple tree (autumn)',
  group: 'tree',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['tree', 'maple', 'autumn', 'orange', 'park'],
  build() {
    return treeVariant({
      ramp: mapleRamp,
      bark: mat(walnut),
      trunkW: 8,
      trunkTop: -38,
      seed: 51,
      cell: 6,
      lift: 0.04,
      branches: [[14, -14, 0, -40, 3], [17, -16, 34, -42, 3], [15, -20, 16, -60, 2]],
      lobes: [
        { x: 16, y: -94, r: 19, ry: 17 },
        { x: -4, y: -80, r: 16 },
        { x: 36, y: -80, r: 16 },
        { x: 16, y: -72, r: 20, lift: 0.05 },
        { x: -12, y: -56, r: 15 },
        { x: 44, y: -56, r: 15 },
        { x: 16, y: -50, r: 19 },
        { x: 0, y: -36, r: 13 },
        { x: 32, y: -36, r: 13 },
      ],
      shade: [-22, 4, 80, 32],
    });
  },
});

defineAsset({
  id: 'tree.pine',
  name: 'Pine tree',
  group: 'tree',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['tree', 'pine', 'conifer', 'evergreen'],
  build() {
    const ramp = lindenRamp;
    const parts = layered(area(1, 1, 150, 40), (L) => {
      trunk(L(Z_TRUNK), 16, 28, -4, 7, mat(walnut), 61);
      const c = L(Z_CANOPY);
      // drooping triangular tiers from the bottom up; each upper tier overlaps the top of the one below
      const tiers: [number, number, number][] = [[-2, 25, 26], [-24, 21, 24], [-44, 17, 22], [-62, 13, 20], [-78, 9, 18], [-91, 5, 14]];
      tiers.forEach(([yb, hw, h], i) => {
        const lobes: Lobe[] = [];
        for (let y = yb - h; y <= yb; y += 4) {
          const half = 2 + ((y - (yb - h)) / h) * (hw - 2);
          for (let x = 16 - half; x <= 16 + half + 0.1; x += Math.max(4, half / 2)) {
            lobes.push({ x, y, r: 5 });
          }
        }
        leafMass(c, lobes, ramp, { cell: 4, seed: 70 + i, lift: 0.02 + i * 0.03, sparkle: 0.3, depth: 0.8 });
      });
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(-8, 8, 50, 24), shadow(7, 23, 20, 8)] });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Bushes

function bush(lobes: Lobe[], ramp: Ramp, seed: number, extra?: (p: Pen, inside: (x: number, y: number) => boolean) => void): Variant {
  const parts = single(area(1, 1, 40, 6), 28, (p) => {
    const inside = leafMass(p, lobes, ramp, { cell: 4, seed, sparkle: 0.45, depth: 0.55 });
    extra?.(p, inside);
  });
  return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(1, 20, 30, 11)] });
}

/** A small round blossom: 3x3 plus shape with a lit top-left petal and a darker lower petal. */
function blossom(p: Pen, x: number, y: number, petals: readonly string[], centre: string): void {
  p.px(x + 1, y, petals[2]);
  p.px(x, y + 1, petals[2]);
  p.px(x + 2, y + 1, petals[1]);
  p.px(x + 1, y + 2, petals[0]);
  p.px(x + 1, y + 1, centre);
}

defineAsset({
  id: 'bush.round.a',
  name: 'Round bush',
  group: 'bush',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['bush', 'shrub', 'green'],
  build() {
    return bush([
      { x: 16, y: 16, r: 13, ry: 11 },
      { x: 7, y: 20, r: 7 },
      { x: 25, y: 20, r: 7 },
      { x: 16, y: 9, r: 9, ry: 7 },
    ], plant, 101);
  },
});

defineAsset({
  id: 'bush.round.b',
  name: 'Tall boxwood',
  group: 'bush',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['bush', 'shrub', 'boxwood', 'green'],
  build() {
    return bush([
      { x: 16, y: 9, r: 11, ry: 17 },
    ], lindenRamp, 113);
  },
});

defineAsset({
  id: 'bush.flowering',
  name: 'Flowering bush',
  group: 'bush',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['bush', 'flower', 'rose', 'pink'],
  build() {
    const petals = [red[0], red[1], red[2]];
    return bush([
      { x: 16, y: 15, r: 13, ry: 11 },
      { x: 7, y: 20, r: 7 },
      { x: 25, y: 19, r: 7 },
    ], plant, 127, (p, inside) => {
      const r = rng(5);
      let placed = 0;
      for (let i = 0; i < 80 && placed < 11; i++) {
        const x = 3 + Math.floor(r() * 25);
        const y = 1 + Math.floor(r() * 24);
        if (inside(x, y) && inside(x + 2, y + 2) && inside(x - 1, y) && inside(x + 3, y + 1) && inside(x + 1, y - 1)) {
          blossom(p, x, y, petals, placed % 3 === 0 ? terracotta[5] : red[2]);
          placed++;
        }
      }
    });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Hedge: a trimmed box hedge; texture repeats every tile so rows (down) and columns (left) join seamlessly.

const HEDGE_H = 18;

function hedgeTone(ramp: Ramp, v: number): string {
  const n = ramp.length;
  return ramp[Math.max(1, Math.min(n - 2, 1 + Math.floor(((v + 0.6) / 1.25) * (n - 2))))];
}

defineAsset({
  id: 'hedge',
  name: 'Hedge',
  group: 'hedge',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down', 'left'],
  keywords: ['hedge', 'bush', 'border', 'green'],
  build(facing: Dir) {
    const ramp = plant;
    const cell = 4;
    const seed = facing === 'down' ? 141 : 151;
    const micro = (x: number, y: number) => {
      const c = clumpAt(x, y, cell, seed, 32, 32);
      return { t: c ? c.dome : 0, m: clumpLight(c) };
    };
    if (facing === 'down') {
      // ground band y 6..28; top face raised by HEDGE_H: y -12..10, front face y 10..28
      const topY = -12;
      const lipY = 10;
      const baseY = 28;
      const parts = single(area(1, 1, 40, 0), 30, (p) => {
        paintShape(p, 0, topY - 3, 32, baseY - topY + 3, (x, y) => {
          const { t } = micro(x, y + topY - 3);
          const yy = y + topY - 3;
          return yy >= topY + 1 - Math.round(t * 3) && yy < baseY + (t > 0.55 ? 1 : 0);
        }, (x, y, open) => {
          const yy = y + topY - 3;
          const { m } = micro(x, yy);
          if (open.up) {
            return ramp[2];
          }
          if (open.down) {
            return ramp[0];
          }
          if (yy < lipY) {
            const v = 0.3 - ((yy - topY) / (lipY - topY)) * 0.12 + m;
            return yy >= lipY - 1 ? hedgeTone(ramp, v + 0.15) : hedgeTone(ramp, v);
          }
          const v = 0 - ((yy - lipY) / (baseY - lipY)) * 0.45 + m;
          return yy === lipY ? hedgeTone(ramp, v - 0.25) : hedgeTone(ramp, v);
        });
      });
      return makeVariant({ w: 1, h: 1, parts, shadows: [{ shape: 'rect', x: 0, y: 24, w: 32, h: 8 }] });
    }
    // column: ground band x 5..27 over the whole tile; top face y -18..14, front face y 14..32
    const x0 = 5;
    const x1 = 27;
    const topY = -HEDGE_H;
    const lipY = 32 - HEDGE_H;
    const parts = single(area(1, 1, 40, 4), 32, (p) => {
      paintShape(p, x0 - 3, topY, x1 - x0 + 6, 32 - topY, (x, y) => {
        const wx = x + x0 - 3;
        const wy = y + topY;
        const { t } = micro(wx, wy);
        const grow = Math.round(t * 3);
        return wx >= x0 + 1 - grow && wx < x1 - 1 + grow;
      }, (x, y, open) => {
        const wx = x + x0 - 3;
        const wy = y + topY;
        const { m } = micro(wx, wy);
        if (open.left) {
          return ramp[2];
        }
        if (open.right) {
          return ramp[0];
        }
        const u = (wx - x0) / (x1 - x0);
        if (wy < lipY) {
          return hedgeTone(ramp, 0.32 - u * 0.25 + m);
        }
        const v = -0.05 - ((wy - lipY) / HEDGE_H) * 0.5 + m;
        return wy === lipY ? hedgeTone(ramp, v - 0.2) : hedgeTone(ramp, v);
      });
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [{ shape: 'rect', x: x1 - 2, y: 0, w: 7, h: 32 }, { shape: 'rect', x: x0 + 2, y: 26, w: x1 - x0, h: 6 }] });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Flowerbeds: stone curb, dark soil, a lush leafy mass with blossoms spilling slightly over the rim.

const stone = mat(paving);

function flowerbed(id: string, name: string, flowers: { petals: readonly string[]; centre: string }[], seed: number): void {
  defineAsset({
    id,
    name,
    group: 'flowerbed',
    category: 'Outdoor',
    layer: 'object',
    facings: ['down'],
    keywords: ['flower', 'bed', 'planter', 'garden'],
    build() {
      const parts = single(area(2, 1, 30, 4), 28, (p) => {
        box(p, 1, 6, 62, 18, 6, stone, { round: 2 });
        p.rect(4, 8, 56, 13, mat(dirt).deep);
        p.hline(4, 8, 56, dirt[0]);
        const lobes: Lobe[] = [];
        for (let i = 0; i < 6; i++) {
          lobes.push({ x: 8 + i * 9.6, y: 10, r: 7, ry: 6 });
          lobes.push({ x: 12 + i * 8.4, y: 16, r: 7, ry: 6 });
        }
        const inside = leafMass(p, lobes, plant, { cell: 4, seed, sparkle: 0.25, depth: 0.45, lift: 0.05 });
        const r = rng(seed);
        let placed = 0;
        for (let i = 0; i < 400 && placed < 26; i++) {
          const x = 2 + Math.floor(r() * 58);
          const y = 1 + Math.floor(r() * 19);
          if (!(inside(x - 1, y) && inside(x + 3, y + 2) && inside(x + 1, y - 1) && inside(x + 1, y + 3))) {
            continue;
          }
          const f = flowers[placed % flowers.length];
          blossom(p, x, y, f.petals, f.centre);
          placed++;
        }
        // front curb drawn last so foliage tucks in behind it
        box(p, 1, 22, 62, 2, 6, stone, { round: 1 });
        p.hline(3, 22, 58, stone.hi);
        for (const sx of [17, 33, 49]) {
          p.vline(sx, 24, 4, stone.dark);
        }
      });
      return makeVariant({ w: 2, h: 1, parts, shadows: [shadow(1, 22, 62, 9, 'rect')] });
    },
  });
}

flowerbed('flowerbed.red', 'Flowerbed (red)', [
  { petals: [red[0], red[1], red[2]], centre: terracotta[5] },
  { petals: [red[0], red[1], red[2]], centre: red[1] },
], 161);
flowerbed('flowerbed.yellow', 'Flowerbed (yellow)', [
  { petals: [mustard[2], yellow[1], yellow[2]], centre: mustard[1] },
  { petals: [mustard[2], mustard[3], mustard[4]], centre: terracotta[3] },
], 173);
flowerbed('flowerbed.mixed', 'Flowerbed (mixed)', [
  { petals: [red[0], red[1], red[2]], centre: terracotta[5] },
  { petals: [mustard[2], yellow[1], yellow[2]], centre: mustard[1] },
  { petals: [cream[3], cream[5], cream[6]], centre: yellow[2] },
  { petals: [navy[2], navy[3], navy[4]], centre: cream[5] },
], 187);

// ---------------------------------------------------------------------------------------------------------
// Park bench: oak slats on dark cast-iron ends. Facing = the way the sitters look.

const iron = mat(charcoal, 1);
const slat = mat(oak);

function ironPost(p: Pen, x: number, yTop: number, yBottom: number): void {
  p.rect(x, yTop, 3, yBottom - yTop, iron.base);
  p.vline(x, yTop, yBottom - yTop, iron.light);
  p.vline(x + 2, yTop, yBottom - yTop, iron.line);
  p.hline(x, yTop, 3, iron.hi);
}

/** Slim cast-iron armrest seen from above: a short rounded bar with its support below. */
function armrest(p: Pen, x: number, y: number, support: number): void {
  box(p, x, y, 4, 10, 2, iron, { round: 1 });
  p.px(x + 1, y + 1, iron.hi);
  p.rect(x + 1, y + 12, 2, support, iron.base);
  p.vline(x + 2, y + 12, support, iron.line);
}

defineAsset({
  id: 'bench.park',
  name: 'Park bench',
  group: 'bench',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down', 'up'],
  keywords: ['bench', 'seat', 'park'],
  build(facing: Dir) {
    const parts = layered(area(2, 1, 30), (L) => {
      if (facing === 'down') {
        const p = L(24);
        // backrest: three slats right behind the seat, on iron uprights
        ironPost(p, 6, -11, 20);
        ironPost(p, 55, -11, 20);
        for (let i = 0; i < 3; i++) {
          box(p, 2, -10 + i * 5, 60, 1, 3, slat, { edge: 'line' });
          p.hline(10 + i * 13, -9 + i * 5, 5, slat.light);
        }
        // seat slats (top face) and the front lip at y ~18, then legs
        for (let i = 0; i < 3; i++) {
          box(p, 3, 6 + i * 3, 58, 3, 0, slat, { edge: 'soft' });
        }
        box(p, 3, 15, 58, 1, 3, slat);
        leg(p, 7, 19, 9, iron, 2);
        leg(p, 55, 19, 9, iron, 2);
        armrest(p, 1, 3, 6);
        armrest(p, 59, 3, 6);
      } else {
        const p = L(24);
        for (let i = 0; i < 3; i++) {
          box(p, 3, 2 + i * 3, 58, 3, 0, slat, { edge: 'soft' });
        }
        armrest(p, 1, -2, 4);
        armrest(p, 59, -2, 4);
        // the backrest seen from behind, in front of the sitters
        const b = L(31);
        ironPost(b, 6, 7, 28);
        ironPost(b, 55, 7, 28);
        for (let i = 0; i < 3; i++) {
          box(b, 2, 8 + i * 5, 60, 1, 3, mat(oak, 1), { edge: 'line' });
        }
      }
    });
    return makeVariant({
      w: 2,
      h: 1,
      mask: ['ss'],
      spots: [seat(facing, 0, 0, 4), seat(facing, 1, 0, -4)],
      parts,
      shadows: [shadow(2, 16, 60, 12, 'rect')],
    });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Picnic table: plank top on A-frame legs with built-in benches on both long sides (seats outside the footprint).

defineAsset({
  id: 'table.picnic',
  name: 'Picnic table',
  group: 'table.picnic',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['picnic', 'table', 'eat', 'lunch', 'park'],
  build() {
    const wood = mat(oak);
    const wood2 = mat(oak, 1);
    const parts = layered(area(2, 3, 30), (L) => {
      // north bench: behind the north sitters (their hips rest on its front edge, y -14)
      const n = L(-10);
      box(n, 4, -24, 56, 9, 3, wood2, { round: 1 });
      n.hline(5, -20, 54, wood2.dark);
      // table: plank top over the north sitters' laps, A-frame legs
      const t = L(32);
      leg(t, 9, 12, 15, wood2, 3);
      leg(t, 52, 12, 15, wood2, 3);
      t.line(12, 16, 16, 25, wood2.dark);
      t.line(52, 16, 48, 25, wood2.dark);
      box(t, 2, -12, 60, 22, 4, wood, { round: 1 });
      for (const y of [-7, -2, 3]) {
        t.hline(3, y, 58, wood.dark);
        t.hline(3, y + 1, 58, mix(wood.light, wood.hi, 0.4));
      }
      t.hline(14, -10, 7, wood.hi);
      // a lunch focal detail: a small paper bag and an apple
      t.rect(40, -6, 5, 6, cream[5]);
      t.hline(40, -6, 5, cream[6]);
      t.vline(44, -5, 5, cream[3]);
      t.hline(40, 0, 5, oak[3]);
      t.rect(47, -2, 3, 3, red[1]);
      t.px(47, -2, red[2]);
      t.px(48, -3, plant[3]);
      // south bench: the south sitters sit on it with their backs to us
      const s = L(48);
      box(s, 4, 32, 56, 9, 3, wood2, { round: 1 });
      s.hline(5, 36, 54, wood2.dark);
      leg(s, 8, 44, 5, wood2, 2);
      leg(s, 54, 44, 5, wood2, 2);
    });
    const eat = (dx: number, dy: number, facing: Dir, px: number) => ({ dx, dy, facing, pose: 'sit' as const, activity: 'eat' as const, px });
    return makeVariant({
      w: 2,
      h: 1,
      mask: ['##'],
      spots: [eat(0, -1, 'down', 4), eat(1, -1, 'down', -4), eat(0, 1, 'up', 4), eat(1, 1, 'up', -4)],
      parts,
      shadows: [shadow(4, -15, 56, 5, 'rect'), shadow(2, 6, 60, 22, 'rect'), shadow(4, 41, 56, 8, 'rect')],
    });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Street lamp, bin, bike rack, bollard

defineAsset({
  id: 'lamp.street',
  name: 'Street lamp',
  group: 'lamp.street',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['lamp', 'light', 'street', 'night'],
  build() {
    const m = iron;
    const parts = single(area(1, 1, 80), 28, (p) => {
      // plinth
      box(p, 10, 20, 12, 4, 5, m, { round: 1 });
      p.rect(12, 16, 8, 5, m.base);
      p.vline(12, 16, 5, m.light);
      p.vline(19, 16, 5, m.line);
      // post
      p.rect(14, -32, 4, 48, m.base);
      p.vline(14, -32, 48, m.light);
      p.vline(17, -32, 48, m.line);
      p.hline(13, -6, 6, m.line);
      p.hline(13, -7, 6, m.hi);
      // lantern: arms, glass panes, roof, finial
      p.hline(11, -33, 10, m.line);
      p.rect(10, -46, 12, 13, m.line);
      p.rect(11, -45, 10, 11, lightWarm[1]);
      p.rect(11, -45, 3, 11, '#fff0c4');
      p.rect(17, -45, 4, 11, lightWarm[0]);
      p.vline(15, -45, 11, m.base);
      p.rect(8, -48, 16, 2, m.base);
      p.hline(8, -48, 16, m.light);
      p.rect(10, -51, 12, 3, m.base);
      p.hline(11, -51, 10, m.light);
      p.rect(14, -54, 4, 3, m.base);
      p.px(15, -55, m.light);
      p.px(16, -55, m.line);
      p.hline(8, -46, 16, m.line);
    });
    const glow: Light = { x: 16, y: 6, radius: 88, color: lightWarm[1], intensity: 0.6, nightOnly: true };
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(8, 22, 16, 7)], lights: [glow] });
  },
});

defineAsset({
  id: 'bin.street',
  name: 'Street bin',
  group: 'bin.street',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['bin', 'trash', 'litter'],
  build() {
    const g = mat(sage, 1);
    const parts = single(area(1, 1, 30), 28, (p) => {
      cylinder(p, 8, 2, 16, 26, g, 6, charcoal[0]);
      for (const x of [11, 15, 19]) {
        p.vline(x, 8, 16, g.dark);
      }
      p.hline(9, 8, 14, g.hi);
      p.hline(8, 22, 16, g.line);
      p.hline(9, 23, 13, g.light);
      // a lid ring and the little litter decal
      p.rect(14, 13, 4, 4, cream[5]);
      p.px(15, 14, g.base);
      p.px(16, 15, g.base);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(7, 22, 18, 8)] });
  },
});

/** A side-view bicycle, front wheel hub at (x, y), rear hub 18 px to the right. */
function bike(p: Pen, x: number, y: number, frame: Mat): void {
  const wheel = (cx: number) => {
    paintShape(p, cx - 6, y - 6, 13, 13, (u, v) => {
      const d = Math.hypot(u - 6, v - 6);
      return d <= 6.4 && d >= 3.9;
    }, (u, v) => (Math.hypot(u - 6, v - 6) > 4.7 ? charcoal[1] : steel[4]));
    p.line(cx - 3, y - 1, cx + 3, y + 1, steel[2]);
    p.line(cx - 1, y - 3, cx + 1, y + 3, steel[2]);
    p.px(cx, y, steel[5]);
  };
  const front = x;
  const rear = x + 18;
  wheel(front);
  wheel(rear);
  // chainstay, seat stay, seat tube, top tube, down tube, fork
  p.line(rear, y, rear - 8, y, frame.dark);
  p.line(rear, y, rear - 6, y - 8, frame.base);
  p.line(rear - 8, y, rear - 6, y - 9, frame.base);
  p.line(rear - 6, y - 9, front + 4, y - 9, frame.light);
  p.line(rear - 8, y, front + 4, y - 8, frame.base);
  p.line(front + 4, y - 10, front, y, frame.dark);
  // saddle, bars, chainring
  p.rect(rear - 9, y - 12, 5, 2, charcoal[2]);
  p.hline(rear - 9, y - 12, 4, charcoal[5]);
  p.line(front + 4, y - 10, front + 3, y - 13, charcoal[2]);
  p.hline(front + 1, y - 13, 4, charcoal[3]);
  p.rect(rear - 9, y - 1, 3, 3, steel[3]);
  p.px(rear - 9, y - 1, steel[5]);
}

/** Blue bike-frame ramp (navy into the accent blues, sky-tinted highlight). */
const bikeBlue: Ramp = [navy[0], blue[0], blue[1], blue[2], blue[3], '#7cbcd2'];

defineAsset({
  id: 'bikerack',
  name: 'Bike rack',
  group: 'bikerack',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['bike', 'bicycle', 'rack', 'cycle'],
  build() {
    const s = mat(steel);
    const parts = layered(area(2, 1, 30), (L) => {
      // two inverted-U hoops behind the bikes
      const back = L(20);
      for (const x0 of [5, 34]) {
        back.rect(x0, 7, 2, 20, s.light);
        back.vline(x0 + 1, 7, 20, s.base);
        back.rect(x0 + 22, 7, 2, 20, s.base);
        back.vline(x0 + 23, 7, 20, s.line);
        back.rect(x0 + 1, 5, 22, 2, s.light);
        back.hline(x0 + 2, 6, 20, s.dark);
        back.px(x0 + 1, 6, s.light);
        back.hline(x0, 26, 3, s.line);
        back.hline(x0 + 21, 26, 3, s.line);
      }
      const b = L(26);
      bike(b, 9, 20, mat(bikeBlue));
      bike(b, 38, 21, mat(terracotta));
    });
    return makeVariant({ w: 2, h: 1, parts, shadows: [shadow(3, 22, 58, 7, 'rect')] });
  },
});

defineAsset({
  id: 'bollard',
  name: 'Bollard',
  group: 'bollard',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['bollard', 'post', 'street'],
  build() {
    const m = iron;
    const parts = single(area(1, 1, 24), 28, (p) => {
      cylinder(p, 11, 4, 10, 24, m, 4);
      p.rect(12, 10, 8, 3, cream[5]);
      p.hline(12, 10, 8, cream[6]);
      p.px(19, 11, cream[3]);
      p.px(19, 12, cream[3]);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(10, 24, 12, 6)] });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Pixel lettering

const FONT5: Record<string, string[]> = {
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  ' ': ['00', '00', '00', '00', '00', '00', '00'],
};

const FONT3: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  I: ['111', '010', '010', '010', '111'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  N: ['1001', '1101', '1011', '1001', '1001'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  U: ['101', '101', '101', '101', '111'],
  Y: ['101', '101', '010', '010', '010'],
  '>': ['00100', '00010', '11111', '00010', '00100'],
  '<': ['00100', '01000', '11111', '01000', '00100'],
  ' ': ['0', '0', '0', '0', '0'],
};

function textWidth(font: Record<string, string[]>, s: string): number {
  return [...s].reduce((w, ch) => w + font[ch][0].length + 1, -1);
}

function text(p: Pen, font: Record<string, string[]>, s: string, x: number, y: number, c: string, shade?: string): void {
  let cx = x;
  for (const ch of s) {
    const g = font[ch];
    g.forEach((row, gy) => {
      [...row].forEach((bit, gx) => {
        if (bit === '1') {
          if (shade) {
            p.px(cx + gx, y + gy + 1, shade);
          }
        }
      });
    });
    g.forEach((row, gy) => {
      [...row].forEach((bit, gx) => {
        if (bit === '1') {
          p.px(cx + gx, y + gy, c);
        }
      });
    });
    cx += g[0].length + 1;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Signs

defineAsset({
  id: 'sign.monument',
  name: 'Monument sign',
  group: 'sign',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['sign', 'monument', 'tiny agents', 'entrance'],
  build() {
    const panel = mat(charcoal, 1);
    const brass = mat(mustard);
    const parts = single(area(3, 1, 40, 8), 28, (p) => {
      // stone plinth
      box(p, 2, 10, 92, 10, 8, stone, { round: 1 });
      p.hline(4, 18, 88, stone.hi);
      for (const sx of [24, 48, 72]) {
        p.vline(sx, 21, 6, stone.dark);
      }
      // the panel: dark slab with a brass inset frame
      box(p, 14, -18, 68, 4, 30, panel, { round: 1 });
      p.frame(17, -12, 62, 22, brass.dark);
      p.hline(18, -12, 60, brass.base);
      const title = 'TINY AGENTS';
      const tw = textWidth(FONT5, title);
      text(p, FONT5, title, 48 - Math.ceil(tw / 2), -8, brass.hi, brass.line);
      const sub = 'BUSINESS PARK';
      const sw = textWidth(FONT3, sub);
      text(p, FONT3, sub, 48 - Math.ceil(sw / 2), 2, cream[4], panel.line);
      // planting at both ends of the plinth
      const lobesL: Lobe[] = [{ x: 7, y: 10, r: 7 }, { x: 14, y: 14, r: 6 }, { x: 5, y: 16, r: 5 }];
      const lobesR: Lobe[] = [{ x: 89, y: 10, r: 7 }, { x: 82, y: 14, r: 6 }, { x: 91, y: 16, r: 5 }];
      const inL = leafMass(p, lobesL, plant, { cell: 4, seed: 201, sparkle: 0.4 });
      const inR = leafMass(p, lobesR, plant, { cell: 4, seed: 203, sparkle: 0.4 });
      const petals = [mustard[2], yellow[1], yellow[2]];
      const whites = [cream[3], cream[5], cream[6]];
      for (const [x, y, f] of [[4, 8, 0], [10, 12, 1], [5, 15, 1], [87, 7, 1], [84, 12, 0], [90, 14, 0]] as const) {
        if (inL(x + 1, y + 1) || inR(x + 1, y + 1)) {
          blossom(p, x, y, f === 0 ? petals : whites, f === 0 ? mustard[1] : yellow[2]);
        }
      }
    });
    return makeVariant({ w: 3, h: 1, parts, shadows: [shadow(2, 22, 92, 8, 'rect')] });
  },
});

defineAsset({
  id: 'sign.post',
  name: 'Signpost',
  group: 'sign.post',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['sign', 'post', 'parking', 'direction', 'entrance'],
  build() {
    const board = mat(navy);
    const pole = mat(steel);
    const parts = single(area(1, 1, 50), 28, (p) => {
      p.rect(15, -26, 3, 52, pole.base);
      p.vline(15, -26, 52, pole.light);
      p.vline(17, -26, 52, pole.line);
      p.hline(14, 25, 5, pole.line);
      // blade 1: blue P + arrow right
      box(p, 2, -38, 28, 1, 10, board, { round: 1 });
      p.rect(5, -36, 7, 7, blue[2]);
      p.frame(5, -36, 7, 7, cream[5]);
      text(p, FONT3, 'P', 7, -35, cream[6]);
      text(p, FONT3, '>', 19, -35, cream[5]);
      // blade 2: arrow left + LOBBY
      box(p, 2, -25, 28, 1, 10, board, { round: 1 });
      text(p, FONT3, '<', 4, -22, cream[5]);
      text(p, FONT3, 'LOBBY', 10, -22, cream[6]);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(11, 23, 12, 6)] });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Wooden fence: centred post, rails to both tile edges (down) or north-south (left). Tiles seamlessly.

defineAsset({
  id: 'fence.wood',
  name: 'Wooden fence',
  group: 'fence',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down', 'left'],
  keywords: ['fence', 'wood', 'border', 'rail'],
  build(facing: Dir) {
    const w = mat(oak, 1);
    if (facing === 'down') {
      const parts = single(area(1, 1, 24, 0), 28, (p) => {
        for (const ry of [4, 13]) {
          p.rect(0, ry, 32, 4, w.base);
          p.hline(0, ry, 32, w.line);
          p.hline(0, ry + 1, 32, w.light);
          p.hline(0, ry + 3, 32, w.line);
          p.hline(0, ry + 2, 32, w.base);
          for (const gx of [5, 23]) {
            p.hline(gx, ry + 2, 4, w.dark);
          }
        }
        box(p, 13, -2, 6, 3, 25, w, { round: 1 });
        p.vline(17, 2, 20, w.dark);
        p.hline(14, 21, 4, w.deep);
      });
      return makeVariant({ w: 1, h: 1, parts, shadows: [{ shape: 'rect', x: 0, y: 22, w: 32, h: 4 }, shadow(13, 21, 8, 5)] });
    }
    const parts = single(area(1, 1, 24, 0), 32, (p) => {
      // north-south rails seen from above: the top rail hides the lower one, so one plank strip, lit on the left
      p.rect(13, -18, 6, 42, w.base);
      p.vline(13, -18, 42, w.line);
      p.vline(14, -18, 42, w.light);
      p.vline(17, -18, 42, w.dark);
      p.vline(18, -18, 42, w.line);
      for (const gy of [-13, 7]) {
        p.vline(15, gy, 5, w.dark);
      }
      box(p, 12, -7, 8, 4, 23, w, { round: 1 });
      p.hline(13, -6, 5, w.hi);
      p.vline(18, -2, 17, w.dark);
      p.hline(13, 18, 6, w.deep);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [{ shape: 'rect', x: 19, y: 0, w: 4, h: 32 }, shadow(12, 14, 9, 5)] });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Ground cover and rocks (extras): walkable tufts and wildflowers to break up open lawn, a mossy rock for pond edges.

/** A blade of grass from (x, y) up `h` px, leaning `lean` px at the tip; 2 px wide at the base. */
function blade(p: Pen, x: number, y: number, h: number, lean: number, base: string, tip: string): void {
  p.line(x, y, x + lean, y - h, base);
  p.line(x + 1, y, x + 1 + lean, y - h + 2, base);
  p.px(x + lean, y - h, tip);
  p.px(x + lean, y - h + 1, tip);
}

defineAsset({
  id: 'grass.tuft',
  name: 'Tall grass tuft',
  group: 'groundcover',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['grass', 'tuft', 'meadow', 'wild'],
  build() {
    const parts = single(area(1, 1, 20), 20, (p) => {
      const r = rng(401);
      const blades: [number, number, number, number][] = [];
      for (let i = 0; i < 18; i++) {
        const x = 6 + Math.floor(r() * 19);
        const y = 21 + Math.floor(r() * 5);
        blades.push([x, y, 8 + Math.floor(r() * 9) - Math.abs(x - 16) / 3, Math.round((x - 16) / 2.5 + (r() - 0.5) * 3)]);
      }
      blades.sort((a, b) => a[1] - b[1]);
      blades.forEach(([x, y, h, lean], i) => {
        const front = i / blades.length;
        const base = front < 0.35 ? grass[0] : front < 0.7 ? grass[1] : grass[2];
        const tip = front < 0.35 ? grass[3] : front < 0.7 ? grass[4] : grass[5];
        blade(p, x, y, h, lean, base, tip);
      });
    });
    return makeVariant({ w: 1, h: 1, mask: ['.'], parts, shadows: [shadow(7, 22, 18, 5)] });
  },
});

defineAsset({
  id: 'flowers.wild',
  name: 'Wildflowers',
  group: 'groundcover',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['flowers', 'wild', 'meadow', 'daisy'],
  build() {
    const parts = single(area(1, 1, 20), 20, (p) => {
      const inside = leafMass(p, [{ x: 11, y: 17, r: 8, ry: 7 }, { x: 21, y: 18, r: 7, ry: 6 }, { x: 16, y: 22, r: 8, ry: 5 }], plant, { cell: 3, seed: 411, sparkle: 0.3, depth: 0.45 });
      const r = rng(413);
      const kinds = [
        { petals: [cream[3], cream[5], cream[6]], centre: yellow[2] },
        { petals: [mustard[2], yellow[1], yellow[2]], centre: mustard[1] },
        { petals: [navy[2], navy[3], navy[4]], centre: cream[5] },
        { petals: [red[0], red[1], red[2]], centre: terracotta[5] },
      ];
      let placed = 0;
      for (let i = 0; i < 300 && placed < 10; i++) {
        const x = 3 + Math.floor(r() * 25);
        const y = 9 + Math.floor(r() * 14);
        if (inside(x + 1, y + 3) && inside(x - 1, y + 1) && inside(x + 3, y + 1)) {
          const k = kinds[placed % kinds.length];
          blossom(p, x, y, k.petals, k.centre);
          placed++;
        }
      }
    });
    return makeVariant({ w: 1, h: 1, mask: ['.'], parts });
  },
});

defineAsset({
  id: 'rock.mossy',
  name: 'Mossy rock',
  group: 'rock',
  category: 'Outdoor',
  layer: 'object',
  facings: ['down'],
  keywords: ['rock', 'stone', 'boulder', 'pond'],
  build() {
    const s = mat(paving);
    const parts = single(area(1, 1, 16), 26, (p) => {
      const cx = 15.5;
      const inside = (x: number, y: number) => {
        const dx = (x - cx) / 11;
        const dy = (y - 18) / (y < 18 ? 9 : 7);
        return dx * dx + dy * dy < 1;
      };
      paintShape(p, 3, 8, 26, 18, (x, y) => inside(x + 3, y + 8), (x, y, open, edge) => {
        const wx = x + 3;
        const wy = y + 8;
        if (edge) {
          return (open.up || open.left) && !open.down && !open.right ? s.lineLit : s.line;
        }
        const l = -(wx - cx) / 11 - (wy - 14) / 9;
        if (wy < 15 && l > -0.2 && hash2(wx >> 1, wy >> 1, 421) < 0.75) {
          return l > 0.5 ? grass[4] : grass[3];
        }
        return l > 0.6 ? s.hi : l > 0.1 ? s.light : l > -0.5 ? s.base : s.dark;
      });
      p.line(13, 17, 17, 21, s.dark);
      p.px(18, 21, s.deep);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(4, 20, 25, 8)] });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Asphalt markings (layer floor). Paint is worn: a few pixels let the asphalt show through.

/** Worn paint pixel: mostly paint, a few asphalt-mixed or missing pixels. */
function paint(p: Pen, x: number, y: number, w: number, h: number, c: string, salt: number): void {
  const worn = mix(c, asphalt[3], 0.5);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const r = hash2(xx >> 1, yy, salt);
      if (r < 0.025) {
        continue;
      }
      p.px(xx, yy, r < 0.07 ? worn : c);
    }
  }
}

defineAsset({
  id: 'marking.bay',
  name: 'Parking bay lines',
  group: 'marking',
  category: 'Outdoor',
  layer: 'floor',
  facings: ['down'],
  keywords: ['parking', 'bay', 'marking', 'lines'],
  build() {
    const parts = single({ x: 0, y: 0, w: 32, h: 64 }, 0, (p) => {
      paint(p, 0, 0, 1, 62, markingWhite, 301);
      paint(p, 31, 0, 1, 62, markingWhite, 302);
      paint(p, 0, 0, 32, 2, markingWhite, 303);
    });
    return makeVariant({ w: 1, h: 2, mask: ['.', '.'], parts, spots: [stand(0, 1, 'down', 'parking')] });
  },
});

defineAsset({
  id: 'marking.crosswalk',
  name: 'Crosswalk',
  group: 'marking',
  category: 'Outdoor',
  layer: 'floor',
  facings: ['down', 'left'],
  keywords: ['crosswalk', 'zebra', 'marking'],
  build(facing: Dir) {
    const parts = single({ x: 0, y: 0, w: 32, h: 32 }, 0, (p) => {
      for (let i = 0; i < 4; i++) {
        // bars run parallel to the traffic: 'down' = people walk north-south across an east-west road
        if (facing === 'down') {
          paint(p, 0, 2 + i * 8, 32, 5, markingWhite, 311 + i);
        } else {
          paint(p, 2 + i * 8, 0, 5, 32, markingWhite, 321 + i);
        }
      }
    });
    return makeVariant({ w: 1, h: 1, mask: ['.'], parts });
  },
});

defineAsset({
  id: 'marking.lane',
  name: 'Lane dash',
  group: 'marking',
  category: 'Outdoor',
  layer: 'floor',
  facings: ['down', 'left'],
  keywords: ['lane', 'dash', 'centre line', 'road', 'marking'],
  build(facing: Dir) {
    const parts = single({ x: 0, y: 0, w: 32, h: 32 }, 0, (p) => {
      if (facing === 'down') {
        paint(p, 8, 30, 16, 2, markingWhite, 331);
      } else {
        paint(p, 0, 8, 2, 16, markingWhite, 332);
      }
    });
    return makeVariant({ w: 1, h: 1, mask: ['.'], parts });
  },
});

