import { defineAsset } from './registry';
import {
  Mat, Pen, Ramp, area, box, canvasPen, charcoal, cream, cylinder, dirt, foliage, glint, layered, leaf,
  lightWarm, makeVariant, mat, mix, mustard, navy, oak, plant, pot, sage, selOut, shadow, single, teal,
  terracotta, walnut, warmLight,
} from './kit';

// =========================================================================================================
// Shared props (also used by lounge.ts, kitchen.ts and restroom.ts)

/** A soft lump for `blob`: an ellipse centred at (x, y) with radii (rx, ry). */
export interface Lump {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/**
 * Soft organic volume (beanbag, pouf): lumps painted back to front, each as a dark ellipse with its base, lit
 * and highlight ellipses pushed toward the top-left light, so overlapping lumps read as folds. Sel-out afterwards
 * (the caller decides when, since it outlines everything on the pen's canvas).
 */
export function blob(p: Pen, lumps: Lump[], m: Mat): void {
  for (const { x, y, rx, ry } of lumps) {
    p.ellipse(x - rx, y - ry, rx * 2, ry * 2, m.dark);
    p.ellipse(x - rx, y - ry, rx * 2 - 2, ry * 2 - 3, m.base);
    p.ellipse(x - rx + 2, y - ry + 1, Math.round(rx * 1.2), Math.round(ry * 1.1), m.light);
    p.ellipse(x - rx + 4, y - ry + 2, Math.max(2, Math.round(rx * 0.5)), Math.max(1, Math.round(ry * 0.35)), m.hi);
  }
}

/** A small mug (5 x 6) with a handle on the right. */
export function mug(p: Pen, x: number, y: number, ramp: Ramp = terracotta): void {
  const m = mat(ramp);
  cylinder(p, x, y, 5, 6, m, 2, mat(oak).deep);
  p.rect(x + 5, y + 2, 1, 3, m.line);
  p.px(x + 4, y + 3, m.line);
}

/** Book spines standing on a shelf whose surface is at `baseY`. Each spec: [width, height, ramp]. Returns the end x. */
export function books(p: Pen, x: number, baseY: number, specs: [number, number, Ramp][]): number {
  for (const [w, h, ramp] of specs) {
    const m = mat(ramp);
    p.rect(x, baseY - h, w, h, m.base);
    p.hline(x, baseY - h, w, m.light);
    if (w > 1) {
      p.vline(x + w - 1, baseY - h + 1, h - 1, m.dark);
    }
    if (h > 5) {
      p.hline(x, baseY - h + 2, Math.max(1, w - 1), m.hi);
    }
    x += w;
  }
  return x;
}

/** A book lying flat: a thin slab with a lit top and cream page edge. */
export function flatBook(p: Pen, x: number, y: number, w: number, ramp: Ramp): void {
  const m = mat(ramp);
  box(p, x, y, w, 3, 2, m, { edge: 'soft', side: false });
  p.hline(x + 1, y + 3, w - 3, cream[5]);
}

/** Tiny potted sprig for shelves and tables: a 6 px pot with a leafy tuft, standing on `baseY`. */
export function sprig(p: Pen, x: number, baseY: number, potRamp: Ramp = terracotta, seed = 3): void {
  const t = canvasPen(16, 16, 8, 14);
  foliage(t, 0, -5, 5, 4, plant, seed, 4);
  leaf(t, 0, -4, -2.3, 6, 4, plant, 1);
  leaf(t, 0, -4, -0.8, 6, 4, plant, 0);
  selOut(t.canvas);
  p.blit(t.canvas, x + 3 - 8, baseY - 6 - 14 + 3);
  pot(p, x, baseY - 6, 6, 6, mat(potRamp), mat(dirt).deep, 1);
}

/** A pothos vine trailing down from (x, y) for `len` px, leaves alternating sides. */
export function vine(p: Pen, x: number, y: number, len: number, sway = 1): void {
  for (let i = 0; i < len; i++) {
    const vx = x + Math.round(Math.sin(i * 0.35) * sway);
    p.px(vx, y + i, plant[2]);
    if (i % 4 === 2) {
      const right = (i >> 2) % 2 === 1;
      const lx = right ? vx + 1 : vx - 2;
      p.rect(lx, y + i - 1, 2, 2, plant[i < len / 2 ? 5 : 4]);
      p.px(right ? lx + 1 : lx, y + i + 1, plant[2]);
    }
  }
}

/** A picture frame on a wall: outer frame in `wood`, a cream mat, then `paint` fills the inner window. */
function framed(p: Pen, x: number, y: number, w: number, h: number, wood: Mat, matBorder: number, paint: (ix: number, iy: number, iw: number, ih: number) => void): void {
  p.rect(x, y, w, h, wood.base);
  p.frame(x, y, w, h, wood.line);
  p.hline(x + 1, y + 1, w - 2, wood.light);
  p.vline(x + 1, y + 1, h - 2, wood.light);
  p.hline(x + 1, y + h - 2, w - 2, wood.dark);
  p.hline(x + 1, y + h, w - 1, wood.line);
  const mx = x + 2;
  const my = y + 2;
  const mw = w - 4;
  const mh = h - 4;
  if (matBorder > 0) {
    p.rect(mx, my, mw, mh, cream[5]);
    p.hline(mx, my, mw, cream[3]);
    p.vline(mx, my, mh, cream[4]);
  }
  paint(mx + matBorder, my + matBorder, mw - matBorder * 2, mh - matBorder * 2);
}

// =========================================================================================================
// Plants

/** [x, y, angle in degrees (0 = right, -90 = up), length, width, brightness] */
type LeafSpec = [number, number, number, number, number, number];

function leaves(p: Pen, list: LeafSpec[], round = 1.6, ramp: Ramp = plant): void {
  for (const [x, y, a, len, w, b] of list) {
    leaf(p, x, y, (a * Math.PI) / 180, len, w, ramp, b, round);
  }
}

/** Fiddle-leaf fig: bare lower trunk, big glossy leaves crowded toward the top, darker and cooler below. */
const FIDDLE_BACK: LeafSpec[] = [
  [16, -16, -125, 12, 9, -1],
  [16, -17, -60, 12, 9, -1],
  [15, -9, -165, 12, 9, -1],
  [17, -10, -15, 12, 9, -1],
  [15, -2, 165, 11, 8, -2],
];
const FIDDLE_FRONT: LeafSpec[] = [
  [16, -18, -92, 12, 9, 1],
  [15, -11, -140, 12, 9, 0],
  [17, -12, -40, 12, 9, 0],
  [16, -4, -105, 10, 8, 1],
  [17, -3, 20, 12, 9, -1],
  [15, 3, 150, 11, 8, -1],
  [17, 6, 35, 10, 8, -2],
];

defineAsset({
  id: 'plant.tall.fiddle',
  name: 'Fiddle-leaf fig',
  group: 'plant.tall',
  category: 'Decor',
  layer: 'object',
  placement: 'corner',
  facings: ['down'],
  keywords: ['plant', 'tree', 'green', 'fiddle'],
  build() {
    const parts = single(area(1, 1, 40), 24, (p) => {
      leaves(p, FIDDLE_BACK);
      const bark = mat(walnut);
      p.rect(15, -8, 2, 28, bark.base);
      p.vline(15, -8, 28, bark.light);
      p.line(16, 2, 19, -2, bark.base);
      leaves(p, FIDDLE_FRONT);
      selOut(p.canvas);
      pot(p, 9, 17, 14, 13, mat(terracotta), mat(dirt).deep);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(8, 26, 16, 5)] });
  },
});

/** Monstera: broad split leaves on long stalks fanning out of a woven basket. */
const MONSTERA: [number, number, number, number][] = [
  // [stalk end x, stalk end y, leaf angle, brightness]
  [7, -10, -150, -2],
  [25, -12, -30, -2],
  [13, -20, -110, -1],
  [21, -21, -70, -1],
  [5, -1, 175, -1],
  [27, 0, 5, -1],
  [16, -12, -95, 1],
  [10, -5, -140, 0],
  [22, -5, -40, 0],
];

defineAsset({
  id: 'plant.tall.monstera',
  name: 'Monstera',
  group: 'plant.tall',
  category: 'Decor',
  layer: 'object',
  placement: 'corner',
  facings: ['down'],
  keywords: ['plant', 'green', 'monstera', 'swiss cheese'],
  build() {
    const parts = single(area(1, 1, 44, 8), 24, (p) => {
      for (const [ex, ey, a, b] of MONSTERA) {
        p.line(16, 16, ex, ey + 4, plant[b < 0 ? 2 : 3]);
        const rad = (a * Math.PI) / 180;
        const len = b > 0 ? 13 : 12;
        leaf(p, ex - Math.cos(rad) * 3, ey - Math.sin(rad) * 3, rad, len, 12, plant, b, 1.25);
        // fenestrations: short dark slits from the leaf edge toward the midrib
        const ca = Math.cos(rad);
        const sa = Math.sin(rad);
        for (const t of [0.35, 0.6]) {
          for (const side of [-1, 1]) {
            const ux = ex - ca * 3 + ca * len * t;
            const uy = ey - sa * 3 + sa * len * t;
            const nx = -sa * side;
            const ny = ca * side;
            for (let k = 2; k <= 4; k++) {
              p.px(Math.round(ux + nx * k + ca * (k - 2) * 0.5), Math.round(uy + ny * k + sa * (k - 2) * 0.5), plant[1]);
            }
          }
        }
      }
      selOut(p.canvas);
      basketPot(p, 8, 15, 16, 15);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(7, 26, 18, 5)] });
  },
});

/** A woven seagrass basket used as a planter: a pot silhouette with staggered weave dashes. */
function basketPot(p: Pen, x: number, y: number, w: number, h: number): void {
  const m = mat(dirt);
  pot(p, x, y, w, h, m, mat(dirt).line, 1);
  for (let ry = y + 7; ry < y + h - 2; ry += 2) {
    const off = ((ry - y) >> 1) % 2 === 0 ? 0 : 2;
    for (let rx = x + 2 + off; rx < x + w - 3; rx += 4) {
      p.hline(rx, ry, 2, m.dark);
    }
  }
  p.hline(x + 2, y + h - 3, w - 4, m.dark);
}

/** Kentia palm: arching fronds of thin leaflets from a tall cream pot. */
defineAsset({
  id: 'plant.tall.palm',
  name: 'Kentia palm',
  group: 'plant.tall',
  category: 'Decor',
  layer: 'object',
  placement: 'corner',
  facings: ['down'],
  keywords: ['plant', 'palm', 'green'],
  build() {
    const parts = single(area(1, 1, 48, 10), 24, (p) => {
      // [tip x, tip y, droop, brightness]: arching fronds drawn back to front, leaflets hanging from each rachis
      const fronds: [number, number, number, number][] = [
        [1, -14, 8, -2], [31, -15, 8, -2], [9, -28, 3, -1], [24, -28, 3, -1], [-1, 2, 6, -1], [33, 2, 6, -1], [16, -32, 1, 0],
        [6, -20, 5, 0], [27, -21, 5, 0],
      ];
      for (const [tx, ty, droop, b] of fronds) {
        const sx = 16;
        const sy = 12;
        const steps = 16;
        let px0 = sx;
        let py0 = sy;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const x = sx + (tx - sx) * t;
          const y = sy + (ty - sy) * Math.sin((t * Math.PI) / 2) + droop * t * t;
          p.line(px0, py0, x, y, plant[b < 0 ? 2 : 3]);
          if (i > 4 && i % 3 === 0) {
            const ang = Math.atan2(y - py0, x - px0);
            const len = 7 - t * 3;
            leaf(p, x, y, ang + 0.9, len, 2.6, plant, b, 1);
            leaf(p, x, y, ang - 0.9 + (tx < sx ? 0 : 0), len, 2.6, plant, b - 1, 1);
          }
          px0 = x;
          py0 = y;
        }
      }
      selOut(p.canvas);
      const c = mat(cream);
      pot(p, 9, 13, 14, 17, c, mat(dirt).deep, 2);
      p.hline(10, 21, 12, c.dark);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(8, 26, 16, 5)] });
  },
});

defineAsset({
  id: 'plant.small.a',
  name: 'Small plant (peperomia)',
  group: 'plant.small',
  category: 'Decor',
  layer: 'object',
  placement: 'corner',
  facings: ['down'],
  keywords: ['plant', 'small', 'green'],
  build() {
    const parts = single(area(1, 1, 16), 24, (p) => {
      const ring: LeafSpec[] = [];
      const back = [-160, -130, -100, -70, -40, -15, 180];
      const front = [-145, -115, -85, -55, -28, 160, 20, 130, 50];
      back.forEach((a) => ring.push([16, 15, a, 8, 6, -1]));
      front.forEach((a, i) => ring.push([16 + (i % 3) - 1, 15, a, 7, 6, i % 2 === 0 ? 1 : 0]));
      leaves(p, ring, 1.4);
      selOut(p.canvas);
      pot(p, 10, 17, 12, 11, mat(cream), mat(dirt).deep, 1);
      p.hline(11, 23, 10, mat(sage).base);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(9, 25, 14, 5)] });
  },
});

defineAsset({
  id: 'plant.small.b',
  name: 'Small plant (snake plant)',
  group: 'plant.small',
  category: 'Decor',
  layer: 'object',
  placement: 'corner',
  facings: ['down'],
  keywords: ['plant', 'small', 'snake plant', 'sansevieria'],
  build() {
    const parts = single(area(1, 1, 16), 24, (p) => {
      const blades: LeafSpec[] = [
        [13, 19, -112, 13, 4, -1], [19, 19, -70, 12, 4, -1], [16, 19, -95, 16, 4, -1],
        [12, 19, -128, 9, 4, 0], [20, 19, -55, 9, 4, 0], [15, 19, -100, 12, 4, 1], [17, 19, -82, 14, 4, 0],
      ];
      leaves(p, blades, 0.6, sage);
      // yellow-green margins catch the light on the lit side
      for (const [x, y, a, len] of blades) {
        const rad = (a * Math.PI) / 180;
        for (let i = 4; i < len - 2; i += 3) {
          p.px(Math.round(x + Math.cos(rad) * i - 1), Math.round(y + Math.sin(rad) * i), plant[6]);
        }
      }
      selOut(p.canvas);
      pot(p, 10, 17, 12, 11, mat(mustard), mat(dirt).deep, 1);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(9, 25, 14, 5)] });
  },
});

defineAsset({
  id: 'planter.long',
  name: 'Long planter',
  group: 'planter',
  category: 'Decor',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['planter', 'plants', 'divider', 'green'],
  build() {
    const parts = single(area(2, 1, 32, 6), 32, (p) => {
      foliage(p, 16, 2, 13, 8, plant, 11, 7);
      foliage(p, 46, 1, 14, 9, plant, 29, 7);
      foliage(p, 31, 4, 10, 6, plant, 5, 6);
      leaves(p, [[22, 6, -100, 12, 4, 0], [24, 6, -75, 10, 4, 1], [40, 6, -110, 11, 4, 0]], 0.7, sage);
      // a few flowers in the green
      for (const [x, y, c] of [[9, -2, mustard[4]], [14, -5, mustard[3]], [50, -4, terracotta[4]], [55, -1, terracotta[5]], [42, -6, cream[6]]] as const) {
        p.rect(x, y, 2, 2, c);
        p.px(x + 1, y + 1, c === cream[6] ? mustard[3] : c);
      }
      selOut(p.canvas);
      const w = mat(walnut);
      box(p, 2, 6, 60, 5, 19, w, { round: 1 });
      p.rect(4, 7, 56, 2, mat(dirt).line);
      // vertical board seams on the front
      for (let x = 12; x < 60; x += 10) {
        p.vline(x, 12, 11, w.dark);
        p.vline(x + 1, 12, 11, w.light);
      }
      p.hline(3, 11, 58, w.hi);
    });
    return makeVariant({ w: 2, h: 1, parts, shadows: [shadow(2, 24, 60, 7, 'rect')] });
  },
});

// =========================================================================================================
// Rugs and mats (layer floor: flat, walkable, no shadow)

type RugPattern = 'medallion' | 'kilim' | 'stripes' | 'lattice' | 'border';

function rug(wT: number, hT: number, field: Ramp, accent: Ramp, pattern: RugPattern, seed: number) {
  return () => {
    const W = wT * 32;
    const H = hT * 32;
    const parts = single({ x: -4, y: 0, w: W + 8, h: H + 2 }, 0, (p) => {
      const f = mat(field);
      const a = mat(accent);
      const x0 = 4;
      const y0 = 3;
      const w = W - 8;
      const h = H - 7;
      // fringe on the short ends
      for (let y = y0 + 2; y < y0 + h - 2; y += 2) {
        p.hline(x0 - 3, y, 3, cream[4]);
        p.hline(x0 + w, y, 3, cream[4]);
        p.px(x0 - 3, y, cream[3]);
        p.px(x0 + w + 2, y, cream[3]);
      }
      // body, outline and a darker bottom edge for thickness
      p.rrect(x0, y0, w, h + 1, 1, f.line);
      p.rrect(x0 + 1, y0 + 1, w - 2, h - 2, 1, f.dark);
      p.hline(x0 + 1, y0 + h - 1, w - 2, f.deep);
      // border band, accent line, field
      const b = 4;
      p.rect(x0 + 1, y0 + 1, w - 2, 1, f.base);
      p.rect(x0 + b, y0 + b, w - 2 * b, h - 2 * b, a.light);
      p.rect(x0 + b + 1, y0 + b + 1, w - 2 * b - 2, h - 2 * b - 2, f.base);
      const fx = x0 + b + 1;
      const fy = y0 + b + 1;
      const fw = w - 2 * b - 2;
      const fh = h - 2 * b - 2;
      // border motif: little dashes along the band
      for (let x = x0 + 4; x < x0 + w - 4; x += 6) {
        p.hline(x, y0 + 2, 2, f.base);
        p.hline(x + 3, y0 + h - 3, 2, f.base);
      }
      for (let y = y0 + 4; y < y0 + h - 4; y += 6) {
        p.vline(x0 + 2, y, 2, f.base);
        p.vline(x0 + w - 3, y, 2, f.base);
      }
      // pile texture: sparse soft dashes one step lighter
      for (let y = fy + 1; y < fy + fh - 1; y += 3) {
        const off = ((y - fy) / 3) % 2 === 0 ? 0 : 3;
        for (let x = fx + 1 + off + (seed % 3); x < fx + fw - 2; x += 7) {
          p.hline(x, y, 2, f.light);
        }
      }
      const cx = fx + fw / 2;
      const cy = fy + fh / 2;
      if (pattern === 'medallion' || pattern === 'border' || pattern === 'lattice') {
        // corner triangles
        for (let i = 0; i < 6; i++) {
          p.hline(fx, fy + i, 6 - i, a.base);
          p.hline(fx + fw - 6 + i, fy + i, 6 - i, a.base);
          p.hline(fx, fy + fh - 1 - i, 6 - i, a.base);
          p.hline(fx + fw - 6 + i, fy + fh - 1 - i, 6 - i, a.base);
        }
      }
      if (pattern === 'medallion' || pattern === 'border') {
        const rx = Math.min(fw / 2 - 8, pattern === 'border' ? 22 : 16);
        const ry = Math.min(fh / 2 - 3, pattern === 'border' ? 14 : 10);
        diamond(p, cx, cy, rx, ry, a.base);
        diamond(p, cx, cy, rx - 3, ry - 2, f.dark);
        diamond(p, cx, cy, rx - 5, ry - 3, a.light);
        diamond(p, cx, cy, rx - 8, ry - 5, f.base);
        diamond(p, cx, cy, 3, 2, a.hi);
      }
      if (pattern === 'lattice') {
        for (let y = fy + 4; y < fy + fh - 3; y += 8) {
          for (let x = fx + 8 + (((y - fy - 4) / 8) % 2) * 6; x < fx + fw - 7; x += 12) {
            diamond(p, x, y, 3, 2, a.base);
            p.px(Math.round(x), Math.round(y), a.hi);
          }
        }
      }
      if (pattern === 'kilim') {
        for (const t of [0.2, 0.5, 0.8]) {
          const yy = Math.round(fy + fh * t);
          p.rect(fx, yy - 2, fw, 4, f.dark);
          for (let x = fx; x < fx + fw; x++) {
            const k = (x - fx) % 6;
            const zz = k < 3 ? k : 6 - k;
            p.px(x, yy - 1 + (zz > 1 ? 1 : 0) - (zz === 0 ? 1 : 0), a.light);
          }
          p.hline(fx, yy - 3, fw, a.base);
          p.hline(fx, yy + 2, fw, a.base);
        }
      }
      if (pattern === 'stripes') {
        for (let y = fy + 3; y < fy + fh - 2; y += 6) {
          p.hline(fx, y, fw, f.light);
          p.hline(fx, y + 1, fw, a.base);
        }
      }
    });
    return makeVariant({ w: wT, h: hT, mask: Array.from({ length: hT }, () => '.'.repeat(wT)), parts });
  };
}

function diamond(p: Pen, cx: number, cy: number, rx: number, ry: number, c: string): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * (1 - Math.abs(dy) / (ry + 0.5)));
    p.hline(Math.round(cx - half), Math.round(cy + dy), half * 2, c);
  }
}

const RUGS: [string, string, number, number, Ramp, Ramp, RugPattern, string][] = [
  ['rug.teal', 'Rug (teal)', 3, 2, teal, cream, 'medallion', 'rug.medium'],
  ['rug.terracotta', 'Rug (terracotta kilim)', 3, 2, terracotta, mustard, 'kilim', 'rug.medium'],
  ['rug.cream', 'Rug (cream)', 3, 2, cream, sage, 'stripes', 'rug.medium'],
  ['rug.navy', 'Rug (navy)', 3, 2, navy, mustard, 'lattice', 'rug.medium'],
  ['rug.large.sage', 'Large rug (sage)', 4, 3, sage, cream, 'border', 'rug.large'],
  ['rug.large.navy', 'Large rug (navy)', 4, 3, navy, cream, 'medallion', 'rug.large'],
];

RUGS.forEach(([id, name, w, h, field, accent, pattern, group], i) => {
  defineAsset({
    id,
    name,
    group,
    category: 'Decor',
    layer: 'floor',
    placement: 'free',
    facings: ['down'],
    keywords: ['rug', 'carpet', 'floor'],
    build: rug(w, h, field, accent, pattern, i),
  });
});

/** 3 x 5 pixel letters for the doormat greeting. */
const GLYPHS: Record<string, string[]> = {
  H: ['1.1', '1.1', '111', '1.1', '1.1'],
  E: ['111', '1..', '11.', '1..', '111'],
  L: ['1..', '1..', '1..', '1..', '111'],
  O: ['.1.', '1.1', '1.1', '1.1', '.1.'],
  I: ['111', '.1.', '.1.', '.1.', '111'],
};

defineAsset({
  id: 'mat.entrance',
  name: 'Entrance mat',
  group: 'mat',
  category: 'Decor',
  layer: 'floor',
  placement: 'free',
  facings: ['down'],
  keywords: ['mat', 'doormat', 'entrance', 'welcome'],
  build() {
    const parts = single({ x: 0, y: 0, w: 64, h: 32 }, 0, (p) => {
      const c = mat(dirt);
      const edge = mat(walnut);
      p.rrect(4, 6, 56, 21, 1, edge.line);
      p.rrect(5, 7, 54, 18, 1, edge.base);
      p.hline(5, 25, 54, edge.dark);
      p.rect(8, 9, 48, 14, c.base);
      // coir bristle texture: short vertical ticks in a staggered grid
      for (let y = 9; y < 23; y += 2) {
        for (let x = 8 + ((y >> 1) % 2) * 2; x < 56; x += 4) {
          p.px(x, y, (x + y) % 3 === 0 ? c.light : c.dark);
        }
      }
      p.rect(20, 12, 25, 7, c.light);
      let x = 32 - Math.floor((5 * 4 - 1) / 2);
      for (const ch of 'HELLO') {
        GLYPHS[ch].forEach((row, ry) =>
          [...row].forEach((v, rx) => {
            if (v === '1') {
              p.px(x + rx, 13 + ry, edge.line);
            }
          }),
        );
        x += 4;
      }
    });
    return makeVariant({ w: 2, h: 1, mask: ['..'], parts });
  },
});

// =========================================================================================================
// Lighting

const brass = mat(mustard);

/** Fabric drum shade glowing from within: lit linen sides, a warm bright rim at the bottom opening. */
function drumShade(p: Pen, x: number, y: number, topW: number, botW: number, h: number, linen: Mat): void {
  for (let r = 0; r < h; r++) {
    const t = r / Math.max(1, h - 1);
    const half = Math.round((topW + (botW - topW) * t) / 2);
    const cx = x;
    p.hline(cx - half, y + r, half * 2, r < 2 ? linen.hi : linen.light);
    p.px(cx - half, y + r, linen.hi);
    p.px(cx + half - 1, y + r, linen.base);
    p.px(cx + half - 2, y + r, mix(linen.light, linen.base, 0.5));
  }
  const half = Math.round(botW / 2);
  p.hline(x - half, y + h, half * 2, lightWarm[1]);
  p.hline(x - half + 2, y + h + 1, half * 2 - 4, lightWarm[0]);
  p.hline(x - Math.round(topW / 2) + 1, y, Math.round(topW / 2) * 2 - 2, linen.base);
  selOut(p.canvas, { color: (c) => (c === lightWarm[0] || c === lightWarm[1] ? mustard[2] : linen.line) });
}

defineAsset({
  id: 'lamp.floor.brass',
  name: 'Floor lamp (brass)',
  group: 'lamp.floor',
  category: 'Lighting',
  layer: 'object',
  placement: 'corner',
  facings: ['down'],
  keywords: ['lamp', 'light', 'floor lamp', 'warm'],
  build() {
    const parts = layered(area(1, 1, 32), (L) => {
      const s = L(-1);
      drumShade(s, 16, -22, 14, 18, 11, mat(cream));
      const p = L(24);
      // weighted base, pole with a joint, then the shade on top
      cylinder(p, 10, 24, 12, 5, brass, 3);
      p.vline(15, -11, 36, brass.hi);
      p.vline(16, -11, 36, brass.dark);
      p.rect(14, 6, 4, 2, brass.light);
      p.hline(14, 8, 4, brass.line);
      p.blit(s.canvas, -s.ox, -s.oy);
      s.erase(-s.ox, -s.oy, s.canvas.width, s.canvas.height);
    });
    return makeVariant({
      w: 1,
      h: 1,
      parts,
      shadows: [shadow(9, 25, 14, 5)],
      lights: [warmLight(16, -14, 72, 0.6)],
    });
  },
});

defineAsset({
  id: 'lamp.floor.black',
  name: 'Floor lamp (black tripod)',
  group: 'lamp.floor',
  category: 'Lighting',
  layer: 'object',
  placement: 'corner',
  facings: ['down'],
  keywords: ['lamp', 'light', 'floor lamp', 'tripod', 'warm'],
  build() {
    const iron = mat(charcoal);
    const parts = layered(area(1, 1, 32), (L) => {
      const s = L(-1);
      drumShade(s, 16, -24, 18, 20, 12, mat(cream));
      const p = L(24);
      // tripod: back leg, then the two front legs splaying out
      p.line(16, -4, 17, 24, iron.base);
      p.line(15, -4, 7, 29, iron.line);
      p.line(16, -4, 8, 29, iron.base);
      p.line(17, -4, 25, 29, iron.line);
      p.line(16, -4, 24, 29, iron.dark);
      p.rect(14, -12, 3, 9, iron.base);
      p.vline(14, -12, 9, iron.hi);
      p.rect(13, -5, 5, 2, iron.light);
      p.hline(13, -3, 5, iron.line);
      p.blit(s.canvas, -s.ox, -s.oy);
      s.erase(-s.ox, -s.oy, s.canvas.width, s.canvas.height);
      // a thin black rim on the shade's bottom edge
      p.hline(7, -12, 2, iron.line);
      p.hline(24, -12, 2, iron.line);
    });
    return makeVariant({
      w: 1,
      h: 1,
      parts,
      shadows: [shadow(7, 24, 19, 6)],
      lights: [warmLight(16, -16, 72, 0.6)],
    });
  },
});

defineAsset({
  id: 'wall.sconce',
  name: 'Wall sconce',
  group: 'wall.light',
  category: 'Lighting',
  layer: 'wall',
  facings: ['down'],
  keywords: ['sconce', 'light', 'lamp', 'wall', 'warm'],
  build() {
    const parts = layered({ x: 0, y: -16, w: 32, h: 40 }, (L) => {
      const s = L(-1);
      drumShade(s, 16, -8, 10, 12, 7, mat(cream));
      const p = L(1);
      // round backplate, then a curved arm up to the shade
      p.rect(14, 6, 5, 7, brass.base);
      p.frame(14, 6, 5, 7, brass.line);
      p.vline(15, 7, 5, brass.hi);
      p.rect(15, 3, 2, 4, brass.base);
      p.px(15, 3, brass.hi);
      p.vline(17, 3, 4, brass.line);
      p.blit(s.canvas, -s.ox, -s.oy);
      s.erase(-s.ox, -s.oy, s.canvas.width, s.canvas.height);
    });
    return makeVariant({ w: 1, h: 1, parts, lights: [warmLight(16, 2, 60, 0.5)] });
  },
});

// =========================================================================================================
// Wall art (the wall face spans y -8..31 in a wall item's coordinates; the rail sits at y 16)

defineAsset({
  id: 'wall.art.landscape',
  name: 'Art: landscape',
  group: 'wall.art.small',
  category: 'Decor',
  layer: 'wall',
  facings: ['down'],
  keywords: ['art', 'painting', 'picture', 'landscape'],
  build() {
    const parts = single({ x: 0, y: -10, w: 32, h: 34 }, 1, (p) => {
      framed(p, 5, -4, 22, 17, mat(oak), 0, (x, y, w, h) => {
        p.rect(x, y, w, h, '#b7e0ea');
        p.rect(x, y + 3, w, 2, '#e9ab86');
        p.rect(x, y + 4, w, h - 4, mat(navy).hi);
        p.disc(x + w - 7, y + 2, 4, mustard[4]);
        // far hills, near hills, a lone tree
        for (let i = 0; i < w; i++) {
          const far = Math.round(5 + Math.sin(i * 0.45) * 1.5);
          const near = Math.round(8 + Math.sin(i * 0.3 + 2) * 1.6);
          p.vline(x + i, y + far, h - far, sage[3]);
          p.vline(x + i, y + near, h - near, plant[4]);
        }
        p.hline(x, y + h - 2, w, plant[3]);
        p.vline(x + 5, y + 6, 4, walnut[2]);
        p.rect(x + 3, y + 4, 5, 3, plant[2]);
        p.px(x + 4, y + 4, plant[4]);
      });
    });
    return makeVariant({ w: 1, h: 1, parts });
  },
});

defineAsset({
  id: 'wall.art.abstract',
  name: 'Art: abstract',
  group: 'wall.art.small',
  category: 'Decor',
  layer: 'wall',
  facings: ['down'],
  keywords: ['art', 'painting', 'picture', 'abstract'],
  build() {
    const parts = single({ x: 0, y: -10, w: 32, h: 34 }, 1, (p) => {
      framed(p, 8, -6, 16, 21, mat(walnut), 1, (x, y, w, h) => {
        p.rect(x, y, w, h, cream[5]);
        p.disc(x + 1, y + 1, 8, terracotta[4]);
        p.rect(x + 5, y + 7, 5, 8, navy[3]);
        p.rect(x, y + h - 4, w, 4, mustard[3]);
        p.ellipse(x + 2, y + h - 6, 6, 4, sage[3]);
        p.px(x + 3, y + 3, terracotta[5]);
      });
    });
    return makeVariant({ w: 1, h: 1, parts });
  },
});

defineAsset({
  id: 'wall.art.botanical',
  name: 'Art: botanical print',
  group: 'wall.art.small',
  category: 'Decor',
  layer: 'wall',
  facings: ['down'],
  keywords: ['art', 'print', 'picture', 'botanical', 'leaf'],
  build() {
    const parts = single({ x: 0, y: -10, w: 32, h: 34 }, 1, (p) => {
      framed(p, 8, -6, 16, 21, mat(oak), 1, (x, y, w, h) => {
        p.rect(x, y, w, h, cream[6]);
        const cx = x + Math.floor(w / 2);
        p.vline(cx, y + 2, h - 3, sage[2]);
        for (let i = 0; i < 4; i++) {
          const yy = y + 3 + i * 3;
          p.hline(cx - 3 + Math.floor(i / 2), yy, 3 - Math.floor(i / 2), sage[3 + (i % 2)]);
          p.hline(cx + 1, yy + 1, 3 - Math.floor(i / 2), sage[3 + ((i + 1) % 2)]);
        }
        p.hline(x + 2, y + h - 1, w - 4, cream[3]);
      });
    });
    return makeVariant({ w: 1, h: 1, parts });
  },
});

defineAsset({
  id: 'wall.art.wide',
  name: 'Art: wide canvas',
  group: 'wall.art.wide',
  category: 'Decor',
  layer: 'wall',
  facings: ['down'],
  keywords: ['art', 'painting', 'picture', 'canvas', 'sunset'],
  build() {
    const parts = single({ x: 0, y: -10, w: 64, h: 34 }, 1, (p) => {
      framed(p, 7, -5, 50, 19, mat(walnut), 0, (x, y, w, h) => {
        // sunset sky in warm bands, a lake, layered hills
        const sky = [terracotta[5], '#f0c48a', mustard[4], terracotta[4]];
        sky.forEach((c, i) => p.rect(x, y + i * 2, w, 2, c));
        p.disc(x + 29, y + 4, 6, '#fbe3b0');
        p.rect(x, y + 8, w, h - 8, '#4b93b6');
        p.hline(x, y + 9, w, '#7cbcd2');
        p.hline(x + 26, y + 10, 8, '#f0c48a');
        p.hline(x + 28, y + 12, 5, '#f0c48a');
        for (let i = 0; i < w; i++) {
          const a = Math.round(6 + Math.sin(i * 0.22) * 2.2);
          const b = Math.round(9 + Math.sin(i * 0.17 + 2.4) * 2.5);
          if (i < 22) {
            p.vline(x + i, y + a, Math.max(0, 9 - a + 1), navy[3]);
          }
          if (i > 32) {
            p.vline(x + i, y + b - 2, Math.max(0, h - b + 2), sage[2]);
            p.px(x + i, y + b - 2, sage[3]);
          }
        }
        p.rect(x, y + h - 3, 18, 3, sage[1]);
        p.hline(x, y + h - 3, 18, sage[2]);
      });
    });
    return makeVariant({ w: 2, h: 1, parts });
  },
});

defineAsset({
  id: 'wall.shelf.plants',
  name: 'Wall shelf with plants',
  group: 'wall.shelf',
  category: 'Decor',
  layer: 'wall',
  facings: ['down'],
  keywords: ['shelf', 'plants', 'wall', 'books'],
  build() {
    const parts = single({ x: 0, y: -16, w: 64, h: 48 }, 1, (p) => {
      const wood = mat(oak);
      // things standing on the shelf (shelf surface at y 7)
      const pothos = canvasPen(20, 18, 10, 14);
      foliage(pothos, 0, -6, 7, 5, plant, 7, 5);
      selOut(pothos.canvas);
      p.blit(pothos.canvas, 12 - 10, 7 - 4 - 14);
      pot(p, 7, 0, 10, 8, mat(terracotta), mat(dirt).deep, 1);
      books(p, 24, 7, [[2, 9, navy], [3, 10, mustard], [2, 8, sage], [3, 9, terracotta]]);
      p.line(34, 7, 37, -2, walnut[2]);
      p.line(35, 7, 38, -2, mat(cream).base);
      sprig(p, 44, 7, cream, 9);
      // little cactus
      const cac = mat(sage);
      p.rect(53, -2, 4, 6, cac.base);
      p.vline(53, -2, 6, cac.light);
      p.frame(52, -3, 6, 8, cac.line);
      p.rect(50, 0, 2, 3, cac.base);
      p.px(50, 0, cac.line);
      pot(p, 51, 3, 8, 4, mat(cream), mat(dirt).deep, 1);
      // the shelf board
      box(p, 3, 6, 58, 3, 3, wood);
      p.hline(4, 12, 56, wood.line);
      // trailing vines over the front edge
      vine(p, 9, 10, 14, 1);
      vine(p, 14, 10, 9, 1);
      vine(p, 46, 10, 7, 0.6);
    });
    return makeVariant({ w: 2, h: 1, parts });
  },
});

// =========================================================================================================
// Coat rack and bin

defineAsset({
  id: 'coatrack',
  name: 'Coat rack',
  group: 'coatrack',
  category: 'Decor',
  layer: 'object',
  placement: 'corner',
  facings: ['down'],
  keywords: ['coat', 'rack', 'hat', 'stand', 'entrance'],
  build() {
    const parts = single(area(1, 1, 40), 24, (p) => {
      const wood = mat(oak);
      // splayed feet, pole, knob
      p.line(15, 22, 9, 29, wood.base);
      p.line(16, 22, 10, 29, wood.line);
      p.line(17, 22, 23, 29, wood.dark);
      p.line(16, 22, 22, 29, wood.base);
      p.rect(15, -20, 3, 44, wood.base);
      p.vline(15, -20, 44, wood.light);
      p.vline(17, -20, 44, wood.dark);
      p.frame(14, -21, 5, 46, wood.line);
      p.rect(14, -24, 5, 4, wood.light);
      p.frame(14, -24, 5, 4, wood.line);
      // pegs
      p.line(13, -16, 10, -19, wood.line);
      p.line(19, -16, 22, -19, wood.line);
      // mustard coat hanging from the left peg: shoulders, lapels, a sleeve seam, a pocket
      const coat = mat(mustard);
      p.rrect(5, -17, 11, 26, 2, coat.line);
      p.rrect(6, -16, 9, 24, 1, coat.base);
      p.vline(6, -14, 21, coat.light);
      p.vline(7, -15, 6, coat.hi);
      p.vline(14, -14, 21, coat.dark);
      p.line(10, -16, 8, -10, coat.light);
      p.line(11, -16, 12, -10, coat.dark);
      p.vline(9, -9, 14, coat.dark);
      p.hline(11, 0, 3, coat.dark);
      p.hline(6, 7, 9, coat.dark);
      // terracotta scarf on the right peg
      blob(p, [{ x: 21, y: -15, rx: 3, ry: 3 }], mat(terracotta));
      p.rect(20, -14, 3, 12, terracotta[4]);
      p.vline(22, -14, 12, terracotta[2]);
      p.frame(19, -14, 5, 13, terracotta[0]);
      for (let x = 20; x < 23; x++) {
        p.vline(x, -1, 2, terracotta[5]);
      }
      // hat on top
      const hat = mat(walnut);
      p.ellipse(9, -26, 15, 4, hat.line);
      p.ellipse(10, -26, 13, 3, hat.base);
      p.rrect(12, -31, 9, 6, 1, hat.line);
      p.rect(13, -30, 7, 4, hat.base);
      p.hline(13, -30, 5, hat.hi);
      p.hline(13, -27, 7, terracotta[3]);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(7, 25, 18, 6)] });
  },
});

defineAsset({
  id: 'bin.office',
  name: 'Waste basket',
  group: 'bin',
  category: 'Decor',
  layer: 'object',
  placement: 'corner',
  facings: ['down'],
  keywords: ['bin', 'trash', 'waste', 'basket'],
  build() {
    const parts = single(area(1, 1, 8), 24, (p) => {
      const m = mat(oak);
      cylinder(p, 9, 13, 14, 16, m, 5, mat(walnut).deep);
      // woven bands
      for (let y = 19; y < 27; y += 3) {
        for (let x = 10 + ((y / 3) % 2 === 0 ? 0 : 2); x < 22; x += 4) {
          p.hline(x, y, 2, m.dark);
        }
      }
      p.hline(10, 18, 12, m.light);
      // a crumpled paper ball peeking out
      const paper = mat(cream);
      p.rect(13, 12, 5, 4, paper.light);
      p.frame(13, 12, 5, 4, paper.dark);
      p.px(14, 13, paper.hi);
      p.px(16, 14, paper.base);
      glint(p, 14, 13, 1, paper.hi);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(9, 25, 14, 4)] });
  },
});
