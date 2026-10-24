import { defineAsset } from './registry';
import { Dir, Light, Part, Spot, Variant } from './types';
import {
  FOOT_Y, LayerPen, Mat, Pen, Ramp, area, blue, box, canvasPen, charcoal, cream, cushion, cylinder, dirt, dither, drawers, grain,
  layered, leaf, leg, makeVariant, mat, mirrorVariant, mustard, navy, oak, plant, pot, red, sage, screen, screenGlow, screenLight,
  seat, selOut, shadow, single, stand, steel, teal, terracotta, walnut, warmLight, yellow, lightWarm,
} from './kit';

/** Depth keys used while drawing a seat; `pullSeat` remaps them around the sitter's real foot y. */
const Z_SEAT = 24;
const Z_FRONT = 31;

/**
 * Seats are tucked toward what the sitter faces (a desk or table edge), so knees and laps slide under it
 * instead of floating a few px away. The spot carries the same px/py offset as the art.
 */
export const SEAT_PULL: Record<Dir, [number, number]> = { down: [0, 6], up: [0, -4], left: [-7, 0], right: [7, 0] };

/** Shifts seat parts by the facing's pull; seat layers sort just before the sitter, front layers just after. */
export function pullSeat(facing: Dir, parts: Part[]): Part[] {
  const [px, py] = SEAT_PULL[facing];
  const foot = FOOT_Y + py;
  return parts.map((p) => ({ ...p, x: p.x + px, y: p.y + py, z: p.z === Z_FRONT ? foot + 5 : foot - 2 }));
}

/** Seat spot plus a contact shadow under the base, both pulled like the art. */
export function pulledSeat(facing: Dir, parts: Part[], sx: number, sy: number, sw: number, sh: number): Variant {
  const [px, py] = SEAT_PULL[facing];
  return makeVariant({
    w: 1,
    h: 1,
    mask: ['s'],
    spots: [seat(facing, 0, 0, px, py)],
    parts: pullSeat(facing, parts),
    shadows: [shadow(sx + px, sy + py, sw, sh)],
  });
}

/** Screen tones not covered by the glow ramp (same as the kit's `screen`). */
const SCREEN_MID = '#4f8fb0';

/** Draws an organic shape (plant, cable, headphones) on its own canvas, sel-outs it, and stamps it onto `p`. */
function organic(p: Pen, x: number, y: number, w: number, h: number, draw: (q: Pen) => void): void {
  const q = canvasPen(w, h, -x, -y);
  draw(q);
  selOut(q.canvas);
  p.blit(q.canvas, x, y);
}

// =========================================================================================================
// Office chair

/** Five-star base with casters, centred on x = 16, resting on the tile's foot line. */
function chairBase(p: Pen, frame: Mat): void {
  const m = mat(steel);
  p.vline(15, 21, 6, m.light);
  p.vline(16, 21, 6, m.dark);
  p.line(14, 27, 10, 25, frame.base);
  p.line(17, 27, 21, 25, frame.base);
  p.hline(8, 28, 16, frame.base);
  p.hline(8, 29, 16, frame.line);
  p.rect(14, 27, 4, 2, frame.light);
  p.rect(15, 29, 2, 2, frame.base);
  for (const [x, y] of [[9, 24], [21, 24], [6, 28], [24, 28], [15, 30]] as const) {
    p.rect(x, y, 2, 2, frame.line);
    p.px(x, y, frame.dark);
  }
}

function armrest(p: Pen, x: number, y: number, fabric: Mat, frame: Mat): void {
  leg(p, x + 1, y + 3, 5, frame, 2);
  box(p, x, y, 4, 2, 2, fabric, { edge: 'soft', side: false });
}

/** Office chair parts, untucked (centred in the tile). Facing left draws the backrest on the east side. */
function officeChairParts(ramp: Ramp, facing: 'down' | 'up' | 'left'): Part[] {
  const fabric = mat(ramp);
  const shell = mat(ramp, 1);
  const frame = mat(charcoal, 1);
  return layered(area(1, 1, 24), (L: LayerPen) => {
    const s = L(Z_SEAT);
    if (facing === 'down') {
      cushion(s, 9, 1, 14, 3, 13, fabric, 3);
      s.hline(11, 9, 10, fabric.dark);
      s.vline(10, 5, 3, fabric.hi);
      chairBase(s, frame);
      s.rect(12, 24, 8, 2, frame.line);
      cushion(s, 8, 14, 16, 7, 4, fabric, 2);
      armrest(s, 4, 14, fabric, frame);
      armrest(s, 24, 14, fabric, frame);
    } else if (facing === 'up') {
      chairBase(s, frame);
      cushion(s, 8, 11, 16, 7, 4, fabric, 2);
      armrest(s, 4, 12, fabric, frame);
      armrest(s, 24, 12, fabric, frame);
      // backrest shell seen from behind, in front of the sitter
      const b = L(Z_FRONT);
      b.rect(15, 22, 2, 4, frame.dark);
      b.px(15, 22, frame.light);
      cushion(b, 9, 9, 14, 2, 13, shell, 3);
      b.vline(11, 12, 7, shell.light);
      b.hline(13, 18, 6, shell.line);
      b.hline(13, 19, 6, shell.base);
    } else {
      chairBase(s, frame);
      s.rect(18, 19, 3, 5, frame.dark);
      box(s, 19, 2, 5, 9, 11, fabric, { round: 2, edge: 'soft' });
      s.vline(20, 4, 5, fabric.hi);
      cushion(s, 7, 14, 16, 7, 4, fabric, 2);
      box(s, 9, 10, 10, 3, 2, fabric, { edge: 'soft', side: false });
      leg(s, 12, 15, 3, frame, 2);
    }
  });
}

function officeChair(ramp: Ramp): (facing: Dir) => Variant {
  return (facing) => {
    if (facing === 'right') {
      return mirrorVariant(officeChair(ramp)('left'));
    }
    return pulledSeat(facing, officeChairParts(ramp, facing), 6, 24, 20, 7);
  };
}

const ALL_DIRS: Dir[] = ['down', 'up', 'left', 'right'];

for (const [id, name, ramp] of [
  ['chair.office.charcoal', 'Office chair (charcoal)', charcoal],
  ['chair.office.teal', 'Office chair (teal)', teal],
  ['chair.office.mustard', 'Office chair (mustard)', mustard],
] as const) {
  defineAsset({
    id,
    name,
    group: 'chair.office',
    category: 'Work',
    layer: 'object',
    placement: 'free',
    facings: ALL_DIRS,
    keywords: ['chair', 'seat', 'office', 'desk chair'],
    build: officeChair(ramp),
  });
}

// =========================================================================================================
// Desk gear: monitors, laptops, keyboards and the small things on desks

function monitorFront(p: Pen, cx: number, baseY: number, seed = 7): void {
  const m = mat(charcoal);
  p.rect(cx - 5, baseY, 10, 2, m.line);
  p.hline(cx - 4, baseY, 8, m.base);
  p.rect(cx - 1, baseY - 5, 3, 5, m.dark);
  p.vline(cx - 1, baseY - 5, 5, m.light);
  screen(p, cx - 10, baseY - 18, 21, 14, true, seed);
}

function monitorBack(p: Pen, cx: number, baseY: number): void {
  const m = mat(charcoal);
  p.rect(cx - 5, baseY, 10, 2, m.line);
  p.hline(cx - 4, baseY, 8, m.base);
  box(p, cx - 10, baseY - 18, 21, 2, 12, m, { round: 1, edge: 'lip' });
  p.rect(cx - 3, baseY - 12, 6, 5, m.dark);
  p.rect(cx - 1, baseY - 7, 3, 7, m.dark);
  p.vline(cx - 1, baseY - 7, 7, m.light);
}

/** Monitor on a 1x2 desk, turned toward a worker on the west: a narrow 3/4 view with a sliver of screen. */
function monitorSide(p: Pen, y: number): void {
  const m = mat(charcoal);
  p.rect(16, y + 16, 10, 2, m.line);
  p.hline(17, y + 16, 8, m.base);
  p.rect(21, y + 12, 2, 4, m.dark);
  p.vline(21, y + 12, 4, m.light);
  box(p, 17, y, 8, 2, 12, m, { round: 1 });
  p.rect(18, y + 3, 3, 8, SCREEN_MID);
  p.rect(18, y + 3, 3, 4, screenGlow[0]);
  p.vline(18, y + 3, 8, screenGlow[1]);
}

function keyboard(p: Pen, x: number, y: number, w: number): void {
  const m = mat(steel);
  box(p, x, y, w, 3, 1, m, { edge: 'soft' });
  for (let i = x + 2; i < x + w - 2; i += 2) {
    p.px(i, y + 1, m.base);
  }
}

function keyboardSide(p: Pen, y: number): void {
  const m = mat(steel);
  box(p, 4, y, 5, 16, 1, m, { edge: 'soft' });
  for (let r = y + 2; r < y + 14; r += 2) {
    p.px(5, r, m.base);
    p.px(7, r + 1, m.base);
  }
}

function mouse(p: Pen, x: number, y: number): void {
  const m = mat(steel);
  p.rect(x, y, 3, 2, m.dark);
  p.px(x, y, m.light);
}

function laptopOpen(p: Pen, cx: number, hinge: number): void {
  const shell = mat(steel);
  screen(p, cx - 9, hinge - 12, 18, 12, true, 5);
  box(p, cx - 10, hinge, 20, 5, 1, shell, { edge: 'soft' });
  for (let i = cx - 7; i < cx + 7; i += 2) {
    p.px(i, hinge + 1, shell.base);
    p.px(i + 1, hinge + 2, shell.base);
  }
  p.rect(cx - 2, hinge + 3, 5, 2, shell.hi);
  p.hline(cx - 9, hinge, 18, shell.dark);
}

function laptopBack(p: Pen, cx: number, hinge: number): void {
  const shell = mat(steel);
  box(p, cx - 9, hinge - 12, 18, 2, 10, shell, { round: 1 });
  p.rect(cx - 1, hinge - 7, 2, 2, shell.hi);
  p.hline(cx - 8, hinge - 1, 16, shell.dark);
}

function laptopSide(p: Pen, y: number): void {
  const shell = mat(steel);
  box(p, 7, y + 4, 10, 15, 1, shell, { edge: 'soft' });
  for (let r = y + 6; r < y + 16; r += 2) {
    p.hline(9, r, 2, shell.base);
    p.hline(12, r + 1, 2, shell.base);
  }
  const m = mat(charcoal);
  p.rect(16, y - 8, 4, 27, m.line);
  p.vline(17, y - 7, 22, SCREEN_MID);
  p.vline(17, y - 7, 10, screenGlow[0]);
  p.px(17, y - 7, screenGlow[1]);
  p.vline(18, y - 7, 25, shell.light);
  p.px(18, y - 7, shell.hi);
}

function mug(p: Pen, x: number, y: number, ramp: Ramp = terracotta): void {
  const m = mat(ramp);
  cylinder(p, x, y, 5, 6, m, 2, mat(oak).deep);
  p.rect(x + 5, y + 2, 1, 3, m.line);
  p.px(x + 4, y + 3, m.line);
}

function notepad(p: Pen, x: number, y: number): void {
  const paper = mat(cream);
  box(p, x, y, 9, 6, 1, paper, { edge: 'soft' });
  for (let r = y + 2; r < y + 6; r += 2) {
    p.hline(x + 2, r, 5, paper.dark);
  }
  p.line(x + 7, y + 1, x + 10, y - 2, mat(steel).line);
}

/** A book lying flat: cover top face, a page-edge front in cream, and a coloured spine on the left. */
function flatBook(p: Pen, x: number, y: number, w: number, d: number, ramp: Ramp): void {
  const m = mat(ramp);
  const paper = mat(cream);
  box(p, x, y, w, d, 2, m, { edge: 'line' });
  p.hline(x + 2, y + d, w - 3, paper.light);
  p.hline(x + 2, y + d + 1, w - 3, paper.dark);
  p.px(x + 1, y + 1, m.hi);
}

function bookStack(p: Pen, x: number, y: number): void {
  flatBook(p, x, y + 5, 13, 4, navy);
  flatBook(p, x + 1, y + 1, 12, 4, terracotta);
  flatBook(p, x + 2, y - 3, 10, 4, sage);
}

/** Small succulent rosette in a cream pot (desk focal). */
function succulent(p: Pen, x: number, y: number): void {
  organic(p, x - 2, y - 9, 14, 12, (q) => {
    for (const [a, len, b] of [[-150, 6, -1], [-30, 6, -1], [-120, 6, 0], [-60, 6, 0], [-90, 6, 1]] as const) {
      leaf(q, x + 5, y + 1, (a * Math.PI) / 180, len, 4, sage, b, 1.3);
    }
  });
  cylinder(p, x + 1, y, 8, 7, mat(cream), 3, mat(dirt).deep);
}

/** Trailing pothos in a cream pot, vines spilling over the desk edge (desk focal). */
function pothos(p: Pen, x: number, y: number, trailDown = 14): void {
  organic(p, x - 8, y - 10, 26, 16 + trailDown, (q) => {
    const vine = plant[2];
    q.line(x + 7, y + 2, x + 12, y + trailDown - 2, vine);
    q.line(x + 2, y + 3, x - 2, y + 8, vine);
    const L: [number, number, number, number][] = [
      [x + 4, y + 1, -120, 0], [x + 6, y + 1, -60, 1], [x + 5, y, -95, 1], [x + 1, y + 2, 170, -1], [x + 9, y + 2, 10, 0],
      [x - 1, y + 7, 150, -1], [x + 10, y + 6, 40, -1], [x + 12, y + trailDown - 4, 70, -2], [x + 11, y + trailDown - 1, 120, -2],
    ];
    for (const [lx, ly, a, b] of L) {
      leaf(q, lx, ly, (a * Math.PI) / 180, 6, 5, plant, b, 1.2);
    }
  });
  cylinder(p, x + 1, y, 8, 7, mat(cream), 3, mat(dirt).deep);
  organic(p, x + 4, y + 4, 12, 8, (q) => {
    leaf(q, x + 7, y + 6, (60 * Math.PI) / 180, 6, 5, plant, 0, 1.2);
  });
}

/** Over-ear headphones lying on the desk (desk focal). */
function headphones(p: Pen, x: number, y: number): void {
  organic(p, x - 1, y - 1, 15, 11, (q) => {
    const band = mat(charcoal);
    for (const o of [0, 1]) {
      q.line(x + 1, y + 5 - o, x + 2, y + 2 - o, band.light);
      q.line(x + 3, y + 1 - o, x + 9, y + 1 - o, band.light);
      q.line(x + 10, y + 2 - o, x + 11, y + 5 - o, band.light);
    }
    q.hline(x + 4, y - 1, 5, band.hi);
    const cup = mat(mustard);
    q.rrect(x - 1, y + 4, 5, 5, 1, cup.base);
    q.rect(x, y + 4, 2, 2, cup.light);
    q.rrect(x + 9, y + 4, 5, 5, 1, cup.base);
    q.rect(x + 10, y + 4, 2, 2, cup.light);
  });
}

// =========================================================================================================
// Desks

interface DeskWood {
  slab: Mat;
  ped: Mat;
  legs: Mat;
  legW: number;
  grain: boolean;
  handle: string;
}

const OAK_DESK: DeskWood = { slab: mat(oak, 1), ped: mat(oak, 2), legs: mat(oak, 1), legW: 3, grain: true, handle: mat(steel).light };
const WALNUT_DESK: DeskWood = { slab: mat(walnut), ped: mat(walnut, 1), legs: mat(walnut), legW: 3, grain: true, handle: mat(mustard).light };
const WHITE_DESK: DeskWood = { slab: mat(cream), ped: mat(cream), legs: mat(steel, 2), legW: 2, grain: false, handle: mat(steel).base };

type Orient = 'up' | 'down' | 'side';

/** What stands on a desk. `side` draws for the 1x2 desk with the worker on the west. */
interface DeskGear {
  draw(p: Pen, o: Orient): void;
  light(o: Orient): Light;
}

const monitorGear: DeskGear = {
  draw(p, o) {
    if (o === 'up') {
      monitorFront(p, 16, 0);
      keyboard(p, 9, 8, 16);
      mouse(p, 28, 9);
    } else if (o === 'down') {
      keyboard(p, 9, -3, 16);
      monitorBack(p, 16, 11);
    } else {
      monitorSide(p, -1);
      keyboardSide(p, 6);
      mouse(p, 5, 25);
    }
  },
  light: (o) => (o === 'side' ? screenLight(14, -6, 22, 0.22) : screenLight(17, -10, o === 'up' ? 30 : 18, o === 'up' ? 0.32 : 0.16)),
};

const dualGear: DeskGear = {
  draw(p, o) {
    if (o === 'up') {
      monitorFront(p, 13, 0, 3);
      monitorFront(p, 36, 0, 9);
      keyboard(p, 8, 8, 16);
      mouse(p, 27, 9);
    } else if (o === 'down') {
      keyboard(p, 8, -3, 16);
      monitorBack(p, 13, 11);
      monitorBack(p, 36, 11);
    } else {
      monitorSide(p, -8);
      monitorSide(p, 12);
      keyboardSide(p, 6);
      mouse(p, 5, 25);
    }
  },
  light: (o) => (o === 'side' ? screenLight(14, 0, 30, 0.26) : screenLight(25, -10, o === 'up' ? 40 : 24, o === 'up' ? 0.34 : 0.16)),
};

const laptopGear: DeskGear = {
  draw(p, o) {
    if (o === 'up') {
      laptopOpen(p, 16, 4);
    } else if (o === 'down') {
      laptopBack(p, 16, 8);
    } else {
      laptopSide(p, 2);
    }
  },
  light: (o) => (o === 'side' ? screenLight(14, 2, 18, 0.18) : screenLight(16, -2, o === 'up' ? 24 : 14, o === 'up' ? 0.26 : 0.12)),
};

/** The desk's one focal detail, on the far half (right half of a 2x1, south tile of a 1x2). */
type Focal = (p: Pen, o: Orient) => void;

const focalMugNotes: Focal = (p, o) => {
  if (o === 'side') {
    mug(p, 18, 30);
    notepad(p, 6, 30);
  } else {
    mug(p, 48, 0);
    notepad(p, o === 'up' ? 36 : 34, o === 'up' ? 4 : 3);
  }
};
const focalSucculent: Focal = (p, o) => (o === 'side' ? succulent(p, 12, 32) : succulent(p, 50, 1));
const focalBooks: Focal = (p, o) => (o === 'side' ? bookStack(p, 8, 31) : bookStack(p, 42, 2));
const focalPothos: Focal = (p, o) => (o === 'side' ? pothos(p, 15, 30, 10) : pothos(p, 48, -2, 16));
const focalHeadphones: Focal = (p, o) => (o === 'side' ? headphones(p, 9, 33) : headphones(p, 44, 2));

/**
 * Horizontal desk body (64 x 32 footprint): slab top, lip, a leg on the left, drawer pedestal on the right.
 * `top` is the slab's back edge: a desk faced from the north reaches 2 px further back, under the sitter's lap.
 */
function deskBodyH(p: Pen, s: DeskWood, seed: number, top: number): void {
  leg(p, 2, 18, 12, s.legs, s.legW);
  box(p, 42, 15, 20, 2, 14, s.ped, { edge: 'soft' });
  drawers(p, 44, 18, 16, 10, 2, s.ped, s.handle);
  box(p, 0, top, 64, 16 - top, 3, s.slab);
  if (s.grain) {
    grain(p, 2, top + 2, 60, 12 - top, s.slab.base, seed);
  } else {
    p.hline(2, top + 2, 20, s.slab.hi);
  }
}

/** Vertical desk body (32 x 64 footprint), flush with its west edge where the worker's knees go. */
function deskBodyV(p: Pen, s: DeskWood, seed: number): void {
  leg(p, 2, 46, 14, s.legs, s.legW);
  leg(p, 26 - s.legW, 46, 14, s.legs, s.legW);
  box(p, 0, -4, 28, 50, 3, s.slab);
  if (s.grain) {
    grain(p, 2, -2, 24, 46, s.slab.base, seed, true);
  } else {
    p.vline(2, -2, 18, s.slab.hi);
  }
}

function desk(wood: DeskWood, gear: DeskGear, focal: Focal, seed: number): (facing: Dir) => Variant {
  const horizontal = (facing: 'down' | 'up'): Variant => {
    const parts = layered(area(2, 1, 32), (L) => {
      const p = L(32);
      deskBodyH(p, wood, seed, facing === 'down' ? -6 : -4);
      gear.draw(p, facing);
      focal(p, facing);
    });
    return makeVariant({ w: 2, h: 1, parts, shadows: [shadow(0, 14, 62, 16, 'rect')], lights: [gear.light(facing)] });
  };
  const vertical = (): Variant => {
    const parts = layered(area(1, 2, 32), (L) => {
      const p = L(64);
      deskBodyV(p, wood, seed + 12);
      gear.draw(p, 'side');
      focal(p, 'side');
    });
    return makeVariant({ w: 1, h: 2, parts, shadows: [shadow(3, 30, 26, 30, 'rect')], lights: [gear.light('side')] });
  };
  return (facing) => {
    if (facing === 'right') {
      return vertical();
    }
    if (facing === 'left') {
      return mirrorVariant(vertical());
    }
    return horizontal(facing);
  };
}

for (const [id, name, wood, gear, focal, seed] of [
  ['desk.oak.monitor', 'Oak desk with monitor', OAK_DESK, monitorGear, focalMugNotes, 11],
  ['desk.oak.dual', 'Oak desk with two monitors', OAK_DESK, dualGear, focalSucculent, 17],
  ['desk.oak.laptop', 'Oak desk with laptop', OAK_DESK, laptopGear, focalBooks, 29],
  ['desk.walnut.monitor', 'Walnut desk with monitor', WALNUT_DESK, monitorGear, focalPothos, 31],
  ['desk.white.monitor', 'White desk with monitor', WHITE_DESK, monitorGear, focalHeadphones, 37],
] as const) {
  defineAsset({
    id,
    name,
    group: 'desk',
    category: 'Work',
    layer: 'object',
    placement: 'free',
    facings: ALL_DIRS,
    keywords: ['desk', 'monitor', 'computer', 'workstation', 'laptop'],
    build: desk(wood, gear, focal, seed),
  });
}

// =========================================================================================================
// Bookshelves

const BOOK_RAMPS: Ramp[] = [navy, terracotta, sage, mustard, cream, teal, red, blue, walnut];

/** One upright book: spine with a lit left edge, page tops in cream, a title band. */
function book(p: Pen, x: number, bottom: number, w: number, h: number, ramp: Ramp): void {
  const m = mat(ramp);
  const top = bottom - h;
  p.rect(x, top, w, h, m.base);
  p.vline(x, top, h, m.light);
  if (w >= 3) {
    p.vline(x + w - 1, top, h, m.dark);
  }
  p.hline(x, top, w, m.light);
  p.hline(x, top + 2, w, ramp === cream ? mat(navy).base : m.hi);
  p.hline(x, bottom - 2, w, m.dark);
}

/** Fills one shelf compartment (x..x+w, books standing on `bottom`) with books, a lean, a stack or an object. */
function shelfRow(p: Pen, x: number, bottom: number, w: number, h: number, seed: number, wood: Mat): void {
  let r = seed;
  const next = () => {
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    return r / 0x7fffffff;
  };
  let cx = x;
  const end = x + w;
  const objectAt = next() < 0.5 ? x + Math.floor(w * (0.55 + next() * 0.2)) : -1;
  while (cx < end - 1) {
    if (objectAt >= 0 && cx >= objectAt && cx < objectAt + 3) {
      if (seed % 3 === 0) {
        organic(p, cx - 1, bottom - 13, 10, 13, (q) => {
          leaf(q, cx + 3, bottom - 5, -2.0, 6, 4, plant, 0, 1.3);
          leaf(q, cx + 4, bottom - 5, -1.1, 6, 4, plant, 1, 1.3);
          leaf(q, cx + 3, bottom - 5, -1.55, 7, 4, plant, 1, 1.3);
        });
        pot(p, cx, bottom - 6, 8, 6, mat(terracotta), mat(dirt).deep, 1);
        cx += 9;
      } else {
        flatBook(p, cx, bottom - 7, Math.min(10, end - cx - 1), 3, BOOK_RAMPS[(seed + 2) % BOOK_RAMPS.length]);
        flatBook(p, cx + 1, bottom - 11, Math.min(8, end - cx - 2), 2, BOOK_RAMPS[(seed + 5) % BOOK_RAMPS.length]);
        cx += 11;
      }
      continue;
    }
    if (next() < 0.12 && cx > x + 2) {
      cx += 2;
      if (cx < end - 4 && next() < 0.6) {
        const m = mat(BOOK_RAMPS[Math.floor(next() * BOOK_RAMPS.length)]);
        p.line(cx, bottom - 1, cx + 3, bottom - h + 3, m.base);
        p.line(cx + 1, bottom - 1, cx + 4, bottom - h + 3, m.dark);
        p.line(cx - 1, bottom - 1, cx + 2, bottom - h + 3, m.light);
        cx += 5;
      }
      continue;
    }
    const bw = Math.min(end - cx, 2 + Math.floor(next() * 2));
    const bh = Math.max(5, h - 1 - Math.floor(next() * 4));
    book(p, cx, bottom, bw, bh, BOOK_RAMPS[Math.floor(next() * BOOK_RAMPS.length)]);
    cx += bw;
  }
  p.hline(x, bottom - h, w, wood.deep);
}

function bookshelfFront(p: Pen, wood: Mat, seed: number): void {
  // carcass: top 8 deep at y -30, front face 52 tall down to the floor line at 30
  box(p, 0, -30, 64, 8, 52, wood, { edge: 'lip' });
  const inner = wood.deep;
  for (const [y, h] of [[-19, 11], [-5, 11]] as const) {
    for (const x of [3, 33]) {
      p.rect(x, y, 28, h, inner);
      p.hline(x, y, 28, mat(walnut).line);
    }
  }
  // shelf boards and the centre divider
  for (const y of [-8, 6]) {
    p.hline(2, y, 60, wood.light);
    p.hline(2, y + 1, 60, wood.base);
    p.hline(2, y + 2, 60, wood.dark);
  }
  p.rect(31, -20, 2, 26, wood.base);
  p.vline(31, -20, 26, wood.light);
  shelfRow(p, 3, -8, 28, 11, seed, wood);
  shelfRow(p, 33, -8, 28, 11, seed + 7, wood);
  shelfRow(p, 3, 6, 28, 11, seed + 13, wood);
  shelfRow(p, 33, 6, 28, 11, seed + 21, wood);
  // closed cupboard below
  for (const x of [3, 33]) {
    p.rect(x, 9, 28, 17, wood.base);
    p.hline(x, 9, 28, wood.light);
    p.vline(x, 9, 17, wood.light);
    p.vline(x + 27, 9, 17, wood.dark);
    p.hline(x, 25, 28, wood.dark);
  }
  p.rect(28, 15, 1, 4, mat(steel).light);
  p.rect(35, 15, 1, 4, mat(steel).light);
  p.rect(2, 26, 60, 3, wood.dark);
  p.hline(2, 26, 60, wood.deep);
}

/** Side view: a tall narrow carcass along the east edge, books showing on the open (west) side. */
function bookshelfSide(p: Pen, wood: Mat, seed: number): void {
  box(p, 14, -30, 16, 40, 52, wood, { edge: 'lip' });
  grain(p, 16, -28, 12, 36, wood.base, seed, true);
  // end panel detail: inset and plinth
  p.rect(17, 14, 10, 42, wood.base);
  p.vline(17, 14, 42, wood.dark);
  p.hline(17, 14, 10, wood.dark);
  p.rect(15, 58, 14, 3, wood.dark);
  // open side: shelf boards with the tops of books between them
  p.rect(10, -26, 5, 84, wood.line);
  const boards = [-26, -6, 14, 34, 56];
  for (let i = 0; i < boards.length - 1; i++) {
    const y0 = boards[i] + 2;
    const y1 = boards[i + 1];
    let y = y0;
    let k = seed + i * 5;
    while (y < y1 - 1) {
      const m = mat(BOOK_RAMPS[k % BOOK_RAMPS.length]);
      const t = 2 + (k % 2);
      p.rect(11, y, 3, Math.min(t, y1 - y), m.base);
      p.px(11, y, m.light);
      y += t;
      k += 3;
    }
  }
  for (const y of boards) {
    p.rect(10, y, 5, 2, wood.light);
    p.px(10, y + 1, wood.base);
  }
}

function bookshelf(ramp: Ramp, shift: number, seed: number): (facing: Dir) => Variant {
  const wood = mat(ramp, shift);
  return (facing) => {
    if (facing === 'right') {
      return mirrorVariant(bookshelf(ramp, shift, seed)('left'));
    }
    if (facing === 'left') {
      const parts = single(area(1, 2, 40), 64, (p) => bookshelfSide(p, wood, seed)).map((part) => ({ ...part, x: part.x + 2 }));
      return makeVariant({
        w: 1,
        h: 2,
        parts,
        spots: [stand(-1, 0, 'right', 'read', 0, 16)],
        shadows: [shadow(14, 6, 16, 56, 'rect')],
      });
    }
    const parts = single(area(2, 1, 40), 32, (p) => bookshelfFront(p, wood, seed));
    return makeVariant({ w: 2, h: 1, parts, spots: [readSpot], shadows: [shadow(0, 24, 64, 7, 'rect')] });
  };
}

/** Shared with every member of the 'bookshelf' group facing down. */
const readSpot: Spot = stand(0, 1, 'up', 'read', 16);

defineAsset({
  id: 'bookshelf.oak',
  name: 'Bookshelf (oak)',
  group: 'bookshelf',
  category: 'Work',
  layer: 'object',
  placement: 'wall',
  facings: ['down', 'left', 'right'],
  keywords: ['bookshelf', 'books', 'shelf', 'library'],
  build: bookshelf(oak, 1, 3),
});

defineAsset({
  id: 'bookshelf.walnut',
  name: 'Bookshelf (walnut)',
  group: 'bookshelf',
  category: 'Work',
  layer: 'object',
  placement: 'wall',
  facings: ['down', 'left', 'right'],
  keywords: ['bookshelf', 'books', 'shelf', 'library'],
  build: bookshelf(walnut, 0, 6),
});

// =========================================================================================================
// Filing cabinet, printer, standing whiteboard

defineAsset({
  id: 'cabinet.filing',
  name: 'Filing cabinet',
  group: 'cabinet',
  category: 'Work',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['cabinet', 'filing', 'drawers', 'storage'],
  build() {
    const m = mat(steel, 1);
    const parts = single(area(1, 1, 24), 32, (p) => {
      box(p, 4, -8, 24, 10, 38, m, { edge: 'lip' });
      drawers(p, 6, 3, 20, 26, 3, m, m.hi);
      // label cards above the handles
      for (const y of [4, 13, 21]) {
        p.rect(13, y + 1, 6, 2, mat(cream).light);
        p.hline(13, y + 2, 6, mat(cream).base);
      }
      // the top drawer stands ajar: folder tabs peek out
      p.rect(6, 1, 20, 2, m.deep);
      for (const [x, ramp] of [[8, mustard], [12, cream], [16, sage], [21, terracotta]] as const) {
        p.rect(x, 0, 3, 2, mat(ramp).light);
        p.px(x + 2, 1, mat(ramp).base);
      }
      p.rect(5, 29, 22, 1, m.line);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(4, 26, 24, 5, 'rect')] });
  },
});

defineAsset({
  id: 'printer',
  name: 'Printer',
  group: 'printer',
  category: 'Work',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['printer', 'copier', 'print'],
  build() {
    const body = mat(cream, 1);
    const lid = mat(cream);
    const ink = mat(charcoal);
    const parts = single(area(1, 1, 24), 32, (p) => {
      // base cabinet with paper drawers
      box(p, 2, 4, 28, 4, 26, body, { edge: 'line' });
      drawers(p, 4, 14, 24, 14, 2, body, ink.base);
      // print engine and scanner lid on top
      box(p, 2, -10, 28, 10, 10, lid, { edge: 'lip' });
      p.hline(4, -6, 22, lid.base);
      // output slot with a printed sheet
      p.rect(5, 2, 16, 2, ink.dark);
      box(p, 7, 0, 11, 3, 1, mat(cream), { edge: 'soft', outline: false });
      p.hline(8, 1, 7, mat(cream).dark);
      // control panel
      box(p, 20, -9, 8, 5, 1, ink, { edge: 'soft' });
      p.rect(21, -8, 4, 2, screenGlow[0]);
      p.px(21, -8, screenGlow[1]);
      p.px(26, -8, mat(sage).hi);
      p.rect(5, 29, 22, 1, body.line);
    });
    return makeVariant({
      w: 1,
      h: 1,
      parts,
      spots: [stand(0, 1, 'up', 'print')],
      shadows: [shadow(2, 26, 28, 5, 'rect')],
      lights: [screenLight(23, -8, 10, 0.18)],
    });
  },
});

/** A whiteboard surface (x, y, w, h) with an aluminium frame, scribbles and a marker tray. */
function boardFace(p: Pen, x: number, y: number, w: number, h: number, seed: number): void {
  const al = mat(steel);
  const white = steel[6];
  p.rect(x, y, w, h, al.line);
  p.rect(x + 1, y + 1, w - 2, h - 2, al.light);
  p.hline(x + 1, y + 1, w - 2, al.hi);
  p.rect(x + 2, y + 2, w - 4, h - 4, white);
  p.hline(x + 2, y + h - 3, w - 4, steel[5]);
  p.vline(x + w - 3, y + 3, h - 5, steel[5]);
  p.line(x + 4, y + h - 5, x + 9, y + 3, steel[5]);
  const ink = mat(navy).base;
  const redInk = red[1];
  if (seed === 1) {
    // a small flow: three boxes and arrows, with a circled result
    p.frame(x + 5, y + 5, 8, 5, ink);
    p.frame(x + 19, y + 5, 8, 5, ink);
    p.frame(x + 12, y + 13, 8, 5, ink);
    p.hline(x + 13, y + 7, 6, ink);
    p.line(x + 23, y + 10, x + 19, y + 13, ink);
    p.ellipse(x + 32, y + 10, 10, 8, redInk);
    p.ellipse(x + 33, y + 11, 8, 6, white);
    for (const r of [0, 3, 6, 9]) {
      p.hline(x + 45, y + 5 + r, 4 + ((r * 7) % 5), mat(charcoal).light);
    }
  } else {
    // goals list with ticks, and a little rising chart
    p.hline(x + 4, y + 4, 9, mat(charcoal).light);
    for (const r of [0, 4, 8]) {
      p.frame(x + 4, y + 8 + r, 3, 3, ink);
      p.hline(x + 9, y + 9 + r, 8 + ((r * 3) % 7), mat(charcoal).light);
    }
    p.px(x + 5, y + 9, redInk);
    p.px(x + 5, y + 13, redInk);
    p.vline(x + 27, y + 4, h - 9, mat(charcoal).light);
    p.hline(x + 27, y + h - 6, w - 34, mat(charcoal).light);
    p.line(x + 29, y + h - 8, x + 34, y + 11, ink);
    p.line(x + 34, y + 11, x + 38, y + 13, ink);
    p.line(x + 38, y + 13, x + 45, y + 5, ink);
    p.rect(x + w - 11, y + 4, 6, 6, mat(mustard).hi);
    p.hline(x + w - 10, y + 6, 4, mat(mustard).base);
  }
  // marker tray with markers
  p.rect(x + 3, y + h, w - 6, 2, al.base);
  p.hline(x + 3, y + h, w - 6, al.hi);
  p.hline(x + 3, y + h + 1, w - 6, al.dark);
  p.hline(x + 8, y + h - 1, 4, red[1]);
  p.hline(x + 14, y + h - 1, 4, blue[2]);
  p.hline(x + 20, y + h - 1, 3, mat(charcoal).base);
}

defineAsset({
  id: 'whiteboard.stand',
  name: 'Whiteboard on wheels',
  group: 'whiteboard',
  category: 'Work',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['whiteboard', 'board', 'brainstorm'],
  build() {
    const al = mat(steel, 1);
    const parts = single(area(2, 1, 48), 32, (p) => {
      for (const x of [3, 59]) {
        leg(p, x, -30, 56, al, 2);
        // foot bar running front to back, with casters
        p.rect(x - 3, 25, 8, 3, al.base);
        p.hline(x - 3, 25, 8, al.light);
        p.hline(x - 3, 27, 8, al.line);
        p.rect(x - 3, 28, 2, 2, mat(charcoal).line);
        p.rect(x + 3, 28, 2, 2, mat(charcoal).line);
      }
      p.rect(5, 6, 54, 2, al.dark);
      p.hline(5, 6, 54, al.light);
      boardFace(p, 4, -36, 56, 30, 1);
    });
    return makeVariant({
      w: 2,
      h: 1,
      parts,
      spots: [stand(0, 1, 'up', 'whiteboard'), stand(1, 1, 'up', 'whiteboard')],
      shadows: [shadow(0, 25, 64, 6, 'rect')],
    });
  },
});

// =========================================================================================================
// Reception desk (3x2): receptionist seat in the back row, counter with a raised ledge in front

defineAsset({
  id: 'reception.desk',
  name: 'Reception desk',
  group: 'reception',
  category: 'Work',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['reception', 'front desk', 'counter', 'lobby'],
  build() {
    const chair = officeChairParts(charcoal, 'down');
    const panel = mat(walnut);
    const top = mat(cream);
    const work = mat(oak, 1);
    const parts = layered(area(3, 2, 40), (L) => {
      for (const part of chair) {
        L(part.z).blit(part.canvas, part.x + 32, part.y);
      }
      const p = L(64);
      // work surface at desk height, behind the ledge
      box(p, 2, 16, 92, 12, 4, work, { edge: 'line' });
      grain(p, 4, 17, 88, 10, work.base, 41);
      monitorBack(p, 20, 23);
      keyboard(p, 40, 22, 14);
      // raised ledge (cream top) and the walnut slat front panel
      box(p, 0, 26, 96, 8, 3, top, { round: 2 });
      p.rect(2, 33, 92, 26, panel.base);
      for (let x = 4; x < 92; x += 4) {
        p.vline(x, 34, 24, panel.dark);
        p.vline(x + 1, 34, 24, panel.light);
      }
      p.hline(2, 33, 92, panel.deep);
      p.hline(2, 34, 92, panel.dark);
      p.vline(2, 33, 26, panel.light);
      p.vline(93, 33, 26, panel.dark);
      p.rect(2, 58, 92, 4, panel.deep);
      p.hline(2, 61, 92, panel.line);
      p.vline(1, 33, 29, panel.line);
      p.vline(94, 33, 29, panel.line);
      // brass name plate
      const brass = mat(yellow);
      p.rect(40, 41, 16, 6, brass.base);
      p.hline(40, 41, 16, brass.light);
      p.hline(40, 46, 16, mat(mustard).dark);
      p.hline(43, 43, 10, mat(mustard).dark);
      // bell and a small plant on the ledge
      const bell = mat(yellow);
      p.rect(71, 30, 7, 1, mat(charcoal).base);
      p.ellipse(72, 26, 5, 5, bell.base);
      p.rect(72, 28, 5, 2, bell.base);
      p.px(73, 27, bell.light);
      p.px(74, 25, mat(mustard).dark);
      organic(p, 77, 12, 18, 18, (q) => {
        for (const [a, b] of [[-150, -1], [-30, -1], [-115, 0], [-65, 0], [-90, 1]] as const) {
          leaf(q, 86, 26, (a * Math.PI) / 180, 8, 5, plant, b, 1.4);
        }
      });
      pot(p, 81, 24, 10, 8, mat(cream), mat(dirt).deep, 1);
    });
    return makeVariant({
      w: 3,
      h: 2,
      mask: ['.s.', '###'],
      spots: [{ dx: 1, dy: 0, facing: 'down', pose: 'sit', activity: 'reception' }],
      parts,
      shadows: [shadow(0, 54, 96, 8, 'rect'), shadow(38, 24, 20, 7)],
      lights: [screenLight(20, 12, 18, 0.14)],
    });
  },
});

// =========================================================================================================
// Planter divider

/** A bed of leafy plants rooted along (x0..x0+w, y0..y0+h): back clumps cooler, front clumps lighter, a few spikes. */
function planterFoliage(p: Pen, x0: number, y0: number, w: number, h: number, seed: number): void {
  organic(p, x0 - 10, y0 - 22, w + 20, h + 30, (q) => {
    const rows = Math.max(2, Math.round(h / 9));
    for (let r = 0; r < rows; r++) {
      const fy = y0 + Math.round(((r + 0.5) * h) / rows);
      const bright = r === rows - 1 ? 0 : -1;
      for (let fx = x0 + 3 + ((r * 4 + seed) % 6); fx < x0 + w - 2; fx += 9) {
        const k = (fx * 7 + r * 13 + seed) % 5;
        if (k === 0) {
          for (const a of [-100, -84, -70]) {
            leaf(q, fx, fy + 1, (a * Math.PI) / 180, 14, 4, sage, 0, 1);
          }
          continue;
        }
        for (const [a, len, b] of [[-150, 10, -1], [-30, 10, -1], [-118, 13, 0], [-62, 13, 0], [-90, 15, 1]] as const) {
          leaf(q, fx, fy, ((a + k * 4) * Math.PI) / 180, len, 6, plant, b + bright, 1.5);
        }
      }
    }
  });
}

defineAsset({
  id: 'divider.planter',
  name: 'Planter divider',
  group: 'divider',
  category: 'Work',
  layer: 'object',
  placement: 'free',
  facings: ['down', 'left'],
  keywords: ['planter', 'divider', 'plants', 'green'],
  build(facing) {
    const wood = mat(oak, 1);
    if (facing === 'left') {
      const parts = single(area(1, 2, 40), 64, (p) => {
        box(p, 6, 2, 20, 42, 16, wood, { edge: 'lip' });
        p.rect(9, 4, 14, 37, mat(dirt).deep);
        planterFoliage(p, 8, 6, 16, 34, 9);
        for (let y = 46; y < 58; y += 4) {
          p.hline(8, y, 16, wood.dark);
        }
      });
      return makeVariant({ w: 1, h: 2, parts, shadows: [shadow(5, 50, 22, 12, 'rect')] });
    }
    const parts = single(area(2, 1, 40), 32, (p) => {
      box(p, 1, 6, 62, 10, 15, wood, { edge: 'lip' });
      p.rect(4, 8, 56, 6, mat(dirt).deep);
      planterFoliage(p, 4, 2, 56, 10, 3);
      for (let x = 8; x < 60; x += 8) {
        p.vline(x, 17, 12, wood.dark);
      }
    });
    return makeVariant({ w: 2, h: 1, parts, shadows: [shadow(1, 24, 62, 7, 'rect')] });
  },
});

// =========================================================================================================
// Surface items (stand on a desk or table top; contact line around y = 4 of their tile)

function surfaceItem(id: string, name: string, keywords: string[], draw: (p: Pen) => void, lights?: Light[]): void {
  defineAsset({
    id,
    name,
    group: id,
    category: 'Work',
    layer: 'surface',
    placement: 'free',
    facings: ['down'],
    keywords,
    build() {
      return makeVariant({ w: 1, h: 1, mask: ['.'], parts: single(area(1, 1, 32), 32, draw), lights });
    },
  });
}

surfaceItem('surface.mug', 'Mug', ['mug', 'coffee', 'cup'], (p) => {
  const m = mat(cream);
  cylinder(p, 13, -3, 7, 8, m, 3, mat(walnut).dark);
  p.rect(20, -1, 2, 4, m.line);
  p.px(20, 0, m.base);
  p.hline(14, 1, 5, mat(teal).base);
  const steam = mat(cream).hi;
  p.px(15, -6, steam);
  p.px(16, -7, steam);
  p.px(17, -9, steam);
  p.px(17, -6, steam);
});

surfaceItem('surface.plant', 'Small potted plant', ['plant', 'pot', 'green'], (p) => {
  organic(p, 4, -22, 24, 24, (q) => {
    for (const [x, y, a, len, b] of [
      [16, -2, -150, 9, -1], [16, -2, -30, 9, -1], [15, -3, -120, 10, 0], [17, -3, -62, 10, 0], [16, -4, -92, 11, 1], [15, -1, 170, 7, -2],
      [17, -1, 12, 7, -2],
    ] as const) {
      leaf(q, x, y, (a * Math.PI) / 180, len, 6, plant, b, 1.5);
    }
  });
  pot(p, 11, -2, 11, 8, mat(terracotta), mat(dirt).deep, 1);
});

surfaceItem('surface.lamp', 'Desk lamp', ['lamp', 'light', 'desk lamp'], (p) => {
  const arm = mat(charcoal);
  const shade = mat(mustard);
  p.ellipse(6, 2, 11, 4, arm.line);
  p.ellipse(7, 2, 9, 3, arm.base);
  p.hline(8, 2, 5, arm.hi);
  p.line(11, 2, 9, -11, arm.base);
  p.line(12, 2, 10, -11, arm.dark);
  p.line(10, -12, 17, -17, arm.base);
  p.line(10, -11, 17, -16, arm.dark);
  p.rect(9, -13, 3, 3, arm.line);
  // shade: a cone tipped toward the desk, warm bulb glowing underneath
  organic(p, 14, -22, 14, 14, (q) => {
    q.rrect(16, -21, 9, 6, 2, shade.base);
    q.rect(17, -20, 4, 2, shade.light);
    q.rect(14, -16, 13, 4, shade.base);
    q.hline(15, -16, 5, shade.light);
    q.hline(14, -13, 13, shade.dark);
  });
  p.hline(16, -12, 9, lightWarm[1]);
  p.hline(18, -11, 5, lightWarm[0]);
}, [warmLight(20, -8, 44, 0.45)]);

surfaceItem('surface.books', 'Stack of books', ['books', 'reading', 'stack'], (p) => {
  flatBook(p, 7, -2, 18, 6, navy);
  flatBook(p, 9, -6, 15, 5, terracotta);
  flatBook(p, 8, -10, 14, 5, sage);
  // a bookmark ribbon
  p.vline(18, -5, 3, red[2]);
});

surfaceItem('surface.phone', 'Desk phone', ['phone', 'telephone', 'call'], (p) => {
  const m = mat(charcoal);
  box(p, 7, -6, 18, 9, 3, m, { round: 1 });
  // handset resting on the left
  box(p, 8, -8, 6, 11, 2, mat(charcoal, 1), { round: 2 });
  p.vline(9, -7, 8, m.hi);
  // keypad and display
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      p.px(17 + c * 2, -3 + r * 2, mat(steel).light);
    }
  }
  p.rect(16, -5, 7, 1, screenGlow[0]);
  p.px(23, -3, red[2]);
  // coiled cord
  for (let i = 0; i < 4; i++) {
    p.px(7 - (i % 2), 2 + i, m.base);
  }
});

// =========================================================================================================
// Wall items (footprint bottom = floor line under the wall face; the face spans y -8..32, rail at 16)

function wallItem(id: string, name: string, group: string, w: number, keywords: string[], draw: (p: Pen) => void, extra: { spots?: Spot[]; lights?: Light[] } = {}): void {
  defineAsset({
    id,
    name,
    group,
    category: 'Work',
    layer: 'wall',
    facings: ['down'],
    keywords,
    build() {
      return makeVariant({ w, h: 1, mask: ['.'.repeat(w)], parts: single(area(w, 1, 16), 32, draw), ...extra });
    },
  });
}

wallItem('wall.tv', 'Wall TV', 'wall.screen', 2, ['tv', 'screen', 'display', 'presentation'], (p) => {
  const b = mat(charcoal);
  p.rect(7, -7, 50, 29, b.line);
  p.rect(8, -6, 48, 27, b.dark);
  p.hline(8, -6, 48, b.base);
  // a presentation slide: header, bar chart, glow
  const x = 10;
  const y = -4;
  p.rect(x, y, 44, 23, mat(navy).dark);
  p.rect(x, y, 44, 11, mat(navy).base);
  p.hline(x, y, 44, mat(navy).light);
  p.hline(x + 3, y + 3, 14, mat(cream).hi);
  p.hline(x + 3, y + 5, 9, mat(navy).hi);
  p.hline(x + 4, y + 19, 36, mat(navy).hi);
  const bars: [number, number, Ramp][] = [[6, 6, teal], [12, 9, sage], [18, 7, mustard], [24, 12, terracotta], [30, 10, mustard]];
  for (const [bx, bh, ramp] of bars) {
    const m = mat(ramp);
    p.rect(x + bx, y + 19 - bh, 4, bh, m.hi);
    p.vline(x + bx + 3, y + 19 - bh, bh, m.light);
  }
  p.line(x + 26, y + 3, x + 40, y + 3, screenGlow[0]);
  p.px(x, y, screenGlow[1]);
  p.px(55, 20, sage[5]);
}, { lights: [screenLight(32, 8, 44, 0.3)] });

wallItem('wall.whiteboard', 'Wall whiteboard', 'wall.board', 2, ['whiteboard', 'board', 'planning'], (p) => {
  boardFace(p, 4, -5, 56, 22, 2);
}, { spots: [stand(0, 1, 'up', 'whiteboard', 16)] });

wallItem('wall.corkboard', 'Corkboard', 'wall.board', 2, ['corkboard', 'pinboard', 'notes'], (p) => {
  const frame = mat(oak, 1);
  const cork = mat(dirt);
  box(p, 6, -5, 52, 2, 23, frame, { edge: 'lip' });
  p.rect(8, -2, 48, 18, cork.hi);
  dither(p, 8, -2, 48, 18, cork.light, 0.18);
  p.hline(8, -2, 48, cork.base);
  p.vline(8, -2, 18, cork.light);
  const paper = mat(cream);
  const note = (x: number, y: number, w: number, h: number, m: Mat, lines: boolean, pin: string) => {
    p.rect(x, y, w, h, m.light);
    p.hline(x, y + h - 1, w, m.base);
    p.vline(x + w - 1, y, h, m.base);
    if (lines) {
      for (let r = y + 3; r < y + h - 1; r += 2) {
        p.hline(x + 1, r, w - 3, m.dark);
      }
    }
    p.px(x + Math.floor(w / 2), y + 1, pin);
    p.px(x + Math.floor(w / 2), y, mat(cream).hi);
  };
  note(11, 0, 10, 12, paper, true, red[1]);
  note(23, 2, 7, 7, mat(mustard), false, blue[2]);
  // a photo: sky and hills
  p.rect(33, -1, 11, 9, paper.hi);
  p.rect(34, 0, 9, 5, blue[3]);
  p.rect(34, 5, 9, 2, mat(sage).base);
  p.px(37, 4, mat(sage).base);
  p.px(36, 1, mat(cream).hi);
  p.px(38, -1, red[1]);
  note(46, 1, 8, 10, mat(sage), true, mustard[3]);
  note(25, 10, 9, 5, paper, false, red[1]);
}, {});

wallItem('wall.clock', 'Wall clock', 'wall.clock', 1, ['clock', 'time'], (p) => {
  const rim = mat(charcoal);
  const face = mat(cream);
  p.disc(8, -3, 15, rim.line);
  p.disc(9, -2, 13, rim.base);
  p.disc(10, -1, 11, face.hi);
  p.hline(11, 9, 9, face.light);
  for (const [x, y] of [[15, 0], [15, 8], [11, 4], [19, 4]]) {
    p.px(x, y, rim.dark);
  }
  p.line(15, 4, 12, 2, rim.line);
  p.line(15, 4, 18, 1, rim.base);
  p.px(15, 4, red[1]);
  p.px(10, 0, rim.hi);
  p.px(11, -1, rim.hi);
});
