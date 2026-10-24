import { defineAsset } from './registry';
import { Dir, Variant } from './types';
import {
  LayerPen, Mat, Pen, Ramp, area, box, charcoal, cream, cushion, cylinder, grain, layered, leather, leg,
  makeVariant, mat, mirrorVariant, mustard, navy, oak, plant, red, sage, seat, shadow, single, stand, steel, teal,
  terracotta, walnut, blue, dirt, pot, foliage, selOut, canvasPen,
} from './kit';
import { blob, books, flatBook, mug, sprig, vine } from './decor';

/** Depth keys: seat layers draw before a seated agent (foot y 26), front layers (backrests, near arms) after. */
const Z_SEAT = 24;
const Z_FRONT = 31;

/** Small tapered walnut feet. */
function foot(p: Pen, x: number, y: number): void {
  const w = mat(walnut);
  p.rect(x, y, 2, 2, w.base);
  p.px(x + 1, y + 1, w.line);
  p.px(x, y, w.light);
}

// =========================================================================================================
// Sofas

interface Upholstery {
  /** Cushions and arms. */
  f: Mat;
  /** Back frame and base rail (one step deeper). */
  frame: Mat;
  /** Throw pillow fabric (the sofa's focal detail). */
  pillow: Ramp;
  /** Button tufting on the back cushions (leather). */
  tufted?: boolean;
}

function upholstery(ramp: Ramp, pillow: Ramp, tufted = false): Upholstery {
  return { f: mat(ramp), frame: mat(ramp, 1), pillow, tufted };
}

/** Splits [x0, x1) into n integer spans. */
function spans(x0: number, x1: number, n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [x0 + Math.round(((x1 - x0) * i) / n), x0 + Math.round(((x1 - x0) * (i + 1)) / n)]);
}

/** Seat spot offsets so sitters land on the cushion centres. */
const SOFA_PX: Record<number, number[]> = { 2: [4, -4], 3: [5, 0, -5] };
const SOFA_PY_LEFT: Record<number, number[]> = { 2: [0, -4], 3: [0, 0, -4] };

/** Tufting buttons on a cushion front: a staggered pair of rows. */
function tufts(p: Pen, x: number, y: number, w: number, m: Mat): void {
  for (let i = 3; i < w - 2; i += 6) {
    p.px(x + i, y, m.dark);
    p.px(x + i + 3 < x + w - 2 ? x + i + 3 : x + i, y + 4, m.dark);
  }
}

/**
 * An n-seat sofa. Seats sit on tile centres shifted toward the cushion centres (spot px). Facing = the way the
 * sitters look.
 */
function sofa(n: number, u: Upholstery): (facing: Dir) => Variant {
  const { f, frame } = u;
  const build = (facing: Dir): Variant => {
    if (facing === 'right') {
      return mirrorVariant(build('left'));
    }
    const W = n * 32;
    if (facing === 'down' || facing === 'up') {
      const parts = layered(area(n, 1, 24), (L) => {
        if (facing === 'down') {
          const p = L(Z_SEAT);
          // backrest frame and plump back pillows
          cushion(p, 2, -10, W - 4, 5, 16, frame, 3);
          for (const [a, b] of spans(8, W - 8, n)) {
            cushion(p, a, -6, b - a, 3, 13, f, 3);
            if (u.tufted) {
              tufts(p, a + 1, -1, b - a - 2, f);
            }
          }
          // base rail, seat cushions with the arm's cast shadow, arms
          box(p, 6, 18, W - 12, 2, 9, frame, { edge: 'line' });
          for (const [a, b] of spans(8, W - 8, n)) {
            cushion(p, a, 6, b - a, 11, 6, f, 2);
          }
          p.vline(9, 7, 9, f.base);
          throwPillow(p, 9, -3, u.pillow);
          arm(p, 0, 0, f, 26);
          arm(p, W - 10, 0, f, 26);
          foot(p, 3, 29);
          foot(p, W - 5, 29);
        } else {
          const p = L(Z_SEAT);
          arm(p, 0, -10, f, 22);
          arm(p, W - 10, -10, f, 22);
          cushion(p, 9, -6, W - 18, 10, 4, f, 2);
          // the back, seen from behind, in front of the sitters
          const b = L(Z_FRONT);
          cushion(b, 0, 4, W, 5, 20, frame, 3);
          b.hline(3, 10, W - 6, frame.light);
          for (let i = 1; i < n; i++) {
            b.vline(Math.round((W * i) / n), 10, 16, frame.deep);
          }
          b.hline(2, 25, W - 4, frame.deep);
          foot(b, 3, 29);
          foot(b, W - 5, 29);
        }
      });
      return makeVariant({
        w: n,
        h: 1,
        mask: ['s'.repeat(n)],
        spots: SOFA_PX[n].map((px, i) => seat(facing, i, 0, px)),
        parts,
        shadows: [shadow(1, 20, W - 2, 11, 'rect')],
      });
    }
    // facing left: footprint 1 x n, back along the east edge, arms at the north and south ends
    const H = n * 32;
    const parts = layered(area(1, n, 24), (L) => {
      const p = L(Z_SEAT);
      cushion(p, 21, -10, 10, H - 14, 16, frame, 3);
      cushion(p, 18, -4, 6, H - 18, 10, f, 2);
      arm(p, 1, -14, f, 22, 30);
      box(p, 4, H - 18, 18, 2, 8, frame, { edge: 'line' });
      spans(2, H - 15, n).forEach(([a, b], i) => cushion(p, 4, a, 17, b - a, i === n - 1 ? 5 : 4, f, 2));
      const front = L(H - 1);
      arm(front, 1, H - 24, f, 20, 30);
      foot(front, 3, H - 3);
      foot(front, 27, H - 3);
    });
    return makeVariant({
      w: 1,
      h: n,
      mask: Array.from({ length: n }, () => 's'),
      spots: SOFA_PY_LEFT[n].map((py, i) => seat('left', 0, i, 0, py)),
      parts,
      shadows: [shadow(1, 8, 30, H - 10, 'rect')],
    });
  };
  return build;
}

/** Accent throw pillow (the sofa's focal detail), slightly tilted. */
function throwPillow(p: Pen, x: number, y: number, ramp: Ramp): void {
  const m = mat(ramp);
  cushion(p, x, y, 12, 4, 7, m, 3);
  for (const [cx, cy] of [[x, y], [x + 11, y], [x, y + 10], [x + 11, y + 10]]) {
    p.px(cx, cy, m.line);
  }
  p.line(x + 3, y + 8, x + 7, y + 5, m.dark);
  p.px(x + 6, y + 2, m.hi);
}

/** A sofa arm: rounded top (7 px deep) and a front face down to the floor. */
function arm(p: Pen, x: number, y: number, m: Mat, height: number, width = 10): void {
  cushion(p, x, y, width, 7, height - 7, m, 3);
  p.hline(x + 2, y + 2, width - 5, m.hi);
}

const SOFAS: [string, string, number, Upholstery][] = [
  ['sofa.2.sage', 'Two-seat sofa (sage)', 2, upholstery(sage, mustard)],
  ['sofa.2.cream', 'Two-seat sofa (cream)', 2, upholstery(cream, terracotta)],
  ['sofa.2.terracotta', 'Two-seat sofa (terracotta)', 2, upholstery(terracotta, mustard)],
  ['sofa.2.navy', 'Two-seat sofa (navy)', 2, upholstery(navy, mustard)],
  ['sofa.3.sage', 'Three-seat sofa (sage)', 3, upholstery(sage, terracotta)],
  ['sofa.3.cream', 'Three-seat sofa (cream)', 3, upholstery(cream, sage)],
  ['sofa.3.leather', 'Three-seat sofa (leather)', 3, { f: mat(leather), frame: mat(walnut, 1), pillow: cream, tufted: true }],
];

for (const [id, name, n, u] of SOFAS) {
  defineAsset({
    id,
    name,
    group: `sofa.${n}`,
    category: 'Lounge',
    layer: 'object',
    placement: 'free',
    facings: ['down', 'up', 'left', 'right'],
    keywords: ['sofa', 'couch', 'seat', 'lounge'],
    build: sofa(n, u),
  });
}

// =========================================================================================================
// Armchairs

function armchair(u: Upholstery): (facing: Dir) => Variant {
  const { f, frame } = u;
  const build = (facing: Dir): Variant => {
    if (facing === 'right') {
      return mirrorVariant(build('left'));
    }
    const parts = layered(area(1, 1, 24), (L: LayerPen) => {
      const p = L(Z_SEAT);
      if (facing === 'down') {
        cushion(p, 2, -8, 28, 5, 15, frame, 3);
        cushion(p, 7, -4, 18, 3, 12, f, 3);
        if (u.tufted) {
          tufts(p, 8, 1, 16, f);
        }
        box(p, 5, 20, 22, 2, 7, frame, { edge: 'line' });
        cushion(p, 7, 7, 18, 11, 5, f, 2);
        p.vline(8, 8, 9, f.base);
        arm(p, 0, 1, f, 26, 8);
        arm(p, 24, 1, f, 26, 8);
        foot(p, 3, 28);
        foot(p, 27, 28);
      } else if (facing === 'up') {
        arm(p, 0, -6, f, 22, 8);
        arm(p, 24, -6, f, 22, 8);
        cushion(p, 7, -2, 18, 10, 4, f, 2);
        const b = L(Z_FRONT);
        cushion(b, 1, 5, 30, 5, 20, frame, 3);
        b.hline(4, 11, 24, frame.light);
        b.hline(3, 26, 26, frame.deep);
        if (u.tufted) {
          tufts(b, 5, 15, 22, frame);
        }
        foot(b, 3, 29);
        foot(b, 27, 29);
      } else {
        // facing left: back along the east edge, arms at the north and south ends
        cushion(p, 22, -10, 9, 26, 15, frame, 3);
        cushion(p, 19, -5, 5, 22, 10, f, 2);
        arm(p, 2, -10, f, 20, 22);
        box(p, 4, 18, 18, 2, 8, frame, { edge: 'line' });
        cushion(p, 4, 1, 17, 17, 5, f, 2);
        const front = L(Z_FRONT);
        arm(front, 2, 12, f, 18, 22);
        foot(front, 4, 29);
        foot(front, 26, 29);
      }
    });
    return makeVariant({ w: 1, h: 1, mask: ['s'], spots: [seat(facing)], parts, shadows: [shadow(1, 21, 29, 10, 'rect')] });
  };
  return build;
}

const ARMCHAIRS: [string, string, Upholstery][] = [
  ['armchair.leather', 'Armchair (leather)', { f: mat(leather), frame: mat(walnut, 1), pillow: cream, tufted: true }],
  ['armchair.mustard', 'Armchair (mustard)', upholstery(mustard, cream)],
  ['armchair.sage', 'Armchair (sage)', upholstery(sage, cream)],
];

for (const [id, name, u] of ARMCHAIRS) {
  defineAsset({
    id,
    name,
    group: 'armchair',
    category: 'Lounge',
    layer: 'object',
    placement: 'free',
    facings: ['down', 'up', 'left', 'right'],
    keywords: ['armchair', 'chair', 'seat', 'lounge'],
    build: armchair(u),
  });
}

// =========================================================================================================
// Beanbags

function beanbag(ramp: Ramp): (facing: Dir) => Variant {
  return (facing) => {
    const m = mat(ramp);
    const parts = layered(area(1, 1, 24), (L) => {
      const p = L(Z_SEAT);
      if (facing === 'down') {
        // the slumped back mound behind the sitter, then the wide low seat folding over it
        blob(p, [{ x: 16, y: 11, rx: 13, ry: 9 }, { x: 16, y: 20, rx: 15, ry: 8 }], m);
        p.line(26, 14, 28, 22, m.dark);
        p.px(5, 20, m.light);
      } else {
        // seen from behind: the seat dips away, the high back rises in front of the sitter
        blob(p, [{ x: 16, y: 10, rx: 14, ry: 7 }], m);
        const b = L(Z_FRONT);
        blob(b, [{ x: 16, y: 21, rx: 15, ry: 8 }, { x: 16, y: 15, rx: 11, ry: 8 }], m);
      }
    }, (canvas) => selOut(canvas));
    return makeVariant({ w: 1, h: 1, mask: ['s'], spots: [seat(facing)], parts, shadows: [shadow(1, 21, 30, 9)] });
  };
}

for (const [id, name, ramp] of [['beanbag.mustard', 'Beanbag (mustard)', mustard], ['beanbag.teal', 'Beanbag (teal)', teal]] as const) {
  defineAsset({
    id,
    name,
    group: 'beanbag',
    category: 'Lounge',
    layer: 'object',
    placement: 'free',
    facings: ['down', 'up'],
    keywords: ['beanbag', 'seat', 'lounge', 'pouf'],
    build: beanbag(ramp),
  });
}

// =========================================================================================================
// Tables

function coffeeTable(wood: Mat, topper: (p: Pen, vertical: boolean) => void, seed: number): (facing: Dir) => Variant {
  return (facing) => {
    if (facing === 'left') {
      const parts = single(area(1, 2, 16), 64, (p) => {
        leg(p, 7, 54, 8, wood, 2);
        leg(p, 23, 54, 8, wood, 2);
        leg(p, 8, 8, 4, wood, 2);
        leg(p, 22, 8, 4, wood, 2);
        box(p, 5, 2, 22, 50, 4, wood, { round: 1 });
        grain(p, 7, 4, 18, 46, wood.base, seed, true);
        topper(p, true);
      });
      return makeVariant({ w: 1, h: 2, parts, shadows: [shadow(5, 8, 22, 54, 'rect')] });
    }
    const parts = single(area(2, 1, 16), 32, (p) => {
      // splayed mid-century legs
      p.line(6, 24, 4, 30, wood.line);
      p.line(7, 24, 5, 30, wood.base);
      p.line(57, 24, 59, 30, wood.line);
      p.line(56, 24, 58, 30, wood.dark);
      box(p, 2, 7, 60, 14, 4, wood, { round: 1 });
      grain(p, 4, 9, 56, 10, wood.base, seed);
      topper(p, false);
    });
    return makeVariant({ w: 2, h: 1, parts, shadows: [shadow(2, 20, 60, 10, 'rect')] });
  };
}

defineAsset({
  id: 'table.coffee.oak',
  name: 'Coffee table (oak)',
  group: 'table.coffee',
  category: 'Lounge',
  layer: 'object',
  placement: 'free',
  facings: ['down', 'left'],
  keywords: ['table', 'coffee table', 'lounge'],
  build: coffeeTable(mat(oak), (p, v) => {
    if (v) {
      flatBook(p, 8, 10, 12, navy);
      flatBook(p, 9, 7, 10, mustard);
      mug(p, 18, 36, cream);
    } else {
      flatBook(p, 10, 10, 12, navy);
      flatBook(p, 11, 7, 10, mustard);
      mug(p, 44, 9, cream);
    }
  }, 5),
});

defineAsset({
  id: 'table.coffee.walnut',
  name: 'Coffee table (walnut)',
  group: 'table.coffee',
  category: 'Lounge',
  layer: 'object',
  placement: 'free',
  facings: ['down', 'left'],
  keywords: ['table', 'coffee table', 'lounge'],
  build: coffeeTable(mat(walnut), (p, v) => {
    const tray = (x: number, y: number) => {
      box(p, x, y, 16, 8, 2, mat(steel), { round: 1, edge: 'lip' });
      p.rect(x + 2, y + 2, 12, 4, steel[4]);
    };
    if (v) {
      tray(8, 26);
      sprig(p, 12, 32, cream, 5);
      flatBook(p, 9, 8, 13, terracotta);
    } else {
      tray(38, 8);
      sprig(p, 42, 14, cream, 5);
      flatBook(p, 10, 9, 13, terracotta);
    }
  }, 9),
});

defineAsset({
  id: 'table.side',
  name: 'Side table',
  group: 'table.side',
  category: 'Lounge',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['table', 'side table', 'end table', 'lounge'],
  build() {
    const wood = mat(walnut);
    const parts = single(area(1, 1, 24), 24, (p) => {
      // three legs (the back one first), round top, a small trailing plant
      p.vline(16, 16, 10, wood.dark);
      p.line(9, 16, 7, 29, wood.line);
      p.line(10, 16, 8, 29, wood.base);
      p.line(22, 16, 24, 29, wood.line);
      p.line(21, 16, 23, 29, wood.dark);
      cylinder(p, 5, 6, 22, 13, wood, 10);
      p.hline(8, 8, 8, wood.hi);
      const pothos = canvasPen(24, 20, 12, 16);
      foliage(pothos, 0, -6, 6, 5, plant, 13, 5);
      selOut(pothos.canvas);
      p.blit(pothos.canvas, 16 - 12, 9 - 16);
      pot(p, 12, 4, 9, 7, mat(cream), mat(dirt).deep, 1);
      vine(p, 12, 10, 9, 1);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(6, 22, 20, 8)] });
  },
});

defineAsset({
  id: 'table.round.cafe',
  name: 'Café table',
  group: 'table.round',
  category: 'Lounge',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['table', 'cafe', 'round', 'bistro'],
  build() {
    const wood = mat(oak);
    const iron = mat(charcoal);
    const parts = single(area(1, 1, 24), 24, (p) => {
      // pedestal and cross base
      p.rect(15, 18, 3, 9, iron.base);
      p.vline(15, 18, 9, iron.light);
      p.vline(17, 18, 9, iron.line);
      p.ellipse(8, 26, 17, 4, iron.line);
      p.ellipse(9, 26, 15, 3, iron.base);
      p.hline(11, 26, 6, iron.light);
      cylinder(p, 2, 3, 28, 16, wood, 13);
      grain(p, 6, 5, 20, 8, wood.base, 21);
      // bud vase with a sprig of flowers
      const g = mat(sage);
      p.rect(14, 2, 4, 6, g.base);
      p.vline(14, 2, 6, g.light);
      p.frame(13, 2, 6, 7, g.line);
      p.line(16, 1, 15, -5, plant[3]);
      p.line(16, 1, 18, -3, plant[3]);
      p.rect(14, -7, 2, 2, terracotta[4]);
      p.rect(18, -5, 2, 2, mustard[4]);
      p.px(14, -7, terracotta[5]);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(4, 20, 24, 10)] });
  },
});

// =========================================================================================================
// Café chair (bentwood, spindle back)

function cafeChair(facing: Dir): Variant {
  if (facing === 'right') {
    return mirrorVariant(cafeChair('left'));
  }
  const wood = mat(oak);
  const dark = mat(oak, 1);
  const parts = layered(area(1, 1, 28), (L) => {
    const p = L(Z_SEAT);
    if (facing === 'down') {
      // back behind the sitter: two posts, a curved top rail and three spindles
      leg(p, 7, -6, 20, dark, 2);
      leg(p, 23, -6, 20, dark, 2);
      for (const x of [12, 16, 20]) {
        p.vline(x, -2, 12, dark.base);
        p.vline(x + 1, -2, 12, dark.dark);
      }
      box(p, 6, -9, 20, 2, 3, wood, { round: 1 });
      leg(p, 8, 19, 10, wood, 2);
      leg(p, 22, 19, 10, wood, 2);
      p.hline(9, 25, 14, dark.dark);
      box(p, 6, 9, 20, 9, 3, wood, { round: 2 });
      grain(p, 8, 10, 16, 6, wood.base, 3);
    } else if (facing === 'up') {
      leg(p, 8, 14, 12, dark, 2);
      leg(p, 22, 14, 12, dark, 2);
      box(p, 6, 7, 20, 9, 3, wood, { round: 2 });
      grain(p, 8, 8, 16, 6, wood.base, 4);
      // back in front of the sitter: posts are the back legs, spindles show the sitter through the gaps
      const b = L(Z_FRONT);
      leg(b, 7, -4, 33, dark, 2);
      leg(b, 23, -4, 33, dark, 2);
      for (const x of [12, 16, 20]) {
        b.vline(x, -1, 18, dark.base);
        b.vline(x + 1, -1, 18, dark.dark);
      }
      box(b, 6, -7, 20, 2, 3, wood, { round: 1 });
      b.hline(8, 16, 16, dark.dark);
      b.hline(8, 15, 16, wood.light);
    } else {
      // facing left: the spindle back seen edge-on along the east side
      p.rect(20, -8, 5, 18, dark.dark);
      p.frame(20, -8, 5, 18, dark.line);
      for (const y of [-3, 2, 7]) {
        p.hline(21, y, 3, dark.base);
      }
      leg(p, 22, 10, 19, dark, 2);
      box(p, 19, -11, 7, 3, 2, wood, { round: 1 });
      leg(p, 7, 19, 10, wood, 2);
      p.hline(9, 25, 13, dark.dark);
      box(p, 5, 9, 21, 9, 3, wood, { round: 2 });
      grain(p, 7, 10, 17, 6, wood.base, 5);
      const front = L(Z_FRONT);
      leg(front, 8, 20, 10, wood, 2);
      leg(front, 21, 20, 10, dark, 2);
    }
  });
  return makeVariant({ w: 1, h: 1, mask: ['s'], spots: [seat(facing)], parts, shadows: [shadow(6, 22, 20, 8)] });
}

defineAsset({
  id: 'chair.cafe.oak',
  name: 'Café chair (oak)',
  group: 'chair.cafe',
  category: 'Lounge',
  layer: 'object',
  placement: 'free',
  facings: ['down', 'up', 'left', 'right'],
  keywords: ['chair', 'cafe', 'bistro', 'seat'],
  build: cafeChair,
});

// =========================================================================================================
// Foosball

defineAsset({
  id: 'game.foosball',
  name: 'Foosball table',
  group: 'game',
  category: 'Lounge',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['foosball', 'game', 'table football', 'play'],
  build() {
    const wood = mat(walnut);
    const parts = single(area(2, 1, 24, 10), 32, (p) => {
      // legs, cabinet, playing field
      leg(p, 5, 22, 8, wood, 3);
      leg(p, 56, 22, 8, wood, 3);
      p.hline(8, 27, 48, wood.dark);
      box(p, 2, -4, 60, 18, 9, wood, { round: 1 });
      const g = mat(plant);
      p.rect(6, -1, 52, 12, g.light);
      p.frame(6, -1, 52, 12, g.deep);
      p.hline(7, 0, 50, g.hi);
      p.vline(32, 0, 10, plant[6]);
      p.frame(29, 3, 7, 5, plant[6]);
      p.rect(7, 2, 2, 6, plant[6]);
      p.rect(55, 2, 2, 6, plant[6]);
      // goal mouths in the end walls
      p.rect(3, 2, 2, 6, wood.line);
      p.rect(59, 2, 2, 6, wood.line);
      // rods run end to end, handles sticking out where the players stand
      const rods = [1, 4, 7, 10];
      rods.forEach((ry, i) => {
        const y = -1 + ry;
        p.hline(-2, y, 68, steel[4]);
        p.px(-3, y, charcoal[1]);
        p.px(66, y, charcoal[1]);
        p.rect(-5, y - 1, 3, 2, i % 2 === 0 ? charcoal[3] : charcoal[2]);
        p.rect(66, y - 1, 3, 2, i % 2 === 0 ? charcoal[2] : charcoal[3]);
        // little players on the rods: red and blue teams
        const team = i % 2 === 0 ? red : blue;
        for (let k = 0; k < 3; k++) {
          const px = 14 + k * 14 + (i % 2) * 6;
          p.rect(px, y - 2, 2, 3, team[team.length - 1]);
          p.px(px, y - 2, team[team.length - 1]);
          p.px(px + 1, y, team[0]);
          p.px(px, y - 3, cream[5]);
        }
      });
      // a ball, the score beads on the near wall
      p.rect(40, 5, 2, 2, cream[6]);
      p.px(41, 6, cream[3]);
      for (let k = 0; k < 5; k++) {
        p.px(24 + k * 2, 16, k < 3 ? mustard[4] : cream[5]);
      }
      p.hline(23, 17, 11, wood.deep);
    });
    return makeVariant({
      w: 2,
      h: 1,
      spots: [stand(-1, 0, 'right', 'play'), stand(2, 0, 'left', 'play')],
      parts,
      shadows: [shadow(2, 22, 60, 9, 'rect')],
    });
  },
});

// =========================================================================================================
// Lounge bookshelf

defineAsset({
  id: 'bookshelf.lounge',
  name: 'Lounge bookshelf',
  group: 'bookshelf',
  category: 'Lounge',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['bookshelf', 'books', 'shelf', 'plants', 'read'],
  build() {
    const wood = mat(oak);
    const parts = single(area(2, 1, 40), 32, (p) => {
      box(p, 1, -30, 62, 5, 61, wood, { round: 0 });
      // inner back panel, shelves (surfaces at y -12, 4, 18) and a centre divider
      const back = mat(walnut);
      p.rect(4, -24, 56, 52, back.dark);
      for (const y of [-24, -8, 8]) {
        p.hline(4, y, 56, back.deep);
      }
      for (const y of [-12, 4, 18]) {
        p.rect(3, y, 58, 3, wood.base);
        p.hline(3, y, 58, wood.light);
        p.hline(3, y + 2, 58, wood.dark);
      }
      p.rect(31, -25, 2, 54, wood.base);
      p.vline(31, -25, 54, wood.light);
      // top row: books, a vase with a stem, and a trailing pothos
      let x = books(p, 5, -12, [[3, 10, terracotta], [2, 9, cream], [3, 11, navy], [2, 8, mustard], [3, 10, sage]]);
      p.line(x + 1, -12, x + 4, -20, walnut[1]);
      p.line(x + 2, -12, x + 5, -20, cream[4]);
      const vase = mat(terracotta);
      cylinder(p, 22, -19, 6, 7, vase, 3, vase.deep);
      p.line(25, -19, 24, -24, plant[3]);
      p.rect(23, -25, 2, 2, mustard[4]);
      sprig(p, 37, -12, cream, 2);
      books(p, 46, -12, [[2, 9, sage], [3, 11, walnut], [2, 10, terracotta], [3, 9, navy], [2, 8, cream]]);
      // middle row: lying books with a mug, framed photo, upright books
      flatBook(p, 6, -1, 13, sage);
      flatBook(p, 7, -4, 11, terracotta);
      flatBook(p, 6, -7, 12, navy);
      mug(p, 21, -3, mustard);
      p.rect(35, -7, 9, 11, walnut[3]);
      p.frame(35, -7, 9, 11, walnut[1]);
      p.rect(37, -5, 5, 7, '#7cbcd2');
      p.rect(37, -2, 5, 4, sage[3]);
      p.px(38, -4, cream[6]);
      books(p, 48, 4, [[2, 10, mustard], [3, 11, cream], [2, 9, navy], [3, 10, terracotta]]);
      // lower row: books leaning, a plant
      x = books(p, 5, 18, [[3, 11, navy], [2, 9, sage], [3, 10, mustard], [2, 11, terracotta], [3, 9, cream], [2, 10, walnut]]);
      p.line(x, 18, x + 4, 9, navy[2]);
      p.line(x + 1, 18, x + 5, 9, navy[3]);
      sprig(p, 41, 18, terracotta, 8);
      books(p, 50, 18, [[3, 10, terracotta], [3, 11, sage]]);
      // a vine trailing from the top plant over the shelf edges
      vine(p, 37, -9, 13, 1);
      // woven storage baskets in the bottom cubbies
      for (const bx of [6, 35]) {
        const b = mat(dirt);
        p.rect(bx, 22, 23, 6, b.base);
        p.hline(bx, 22, 23, b.hi);
        p.frame(bx, 22, 23, 6, b.line);
        for (let i = bx + 2; i < bx + 21; i += 3) {
          p.vline(i, 23, 4, b.dark);
        }
        p.rect(bx + 9, 24, 5, 2, b.deep);
      }
      // feet strip
      p.hline(2, 29, 60, wood.line);
    });
    return makeVariant({
      w: 2,
      h: 1,
      spots: [stand(0, 1, 'up', 'read', 16)],
      parts,
      shadows: [shadow(1, 24, 62, 7, 'rect')],
    });
  },
});

