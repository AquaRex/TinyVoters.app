import { defineAsset } from './registry';
import { Dir, Part, Spot, Variant } from './types';
import {
  Mat, Pen, Ramp, area, blue, box, charcoal, cream, cushion, cylinder, dirt, foliage, glassGlint, grain, layered,
  leg, lightWarm, makeVariant, mat, markingYellow, mirrorVariant, mustard, navy, oak, paving, plant, red, sage, screenGlow,
  screenLight, seat, selOut, shadow, single, stand, steel, teal, terracotta, walnut, warmLight, water,
} from './kit';
import { books, flatBook, mug, sprig, vine } from './decor';
import { pixelText } from './annex';
import { brickAt } from './walls';

/**
 * Living / leisure pack: café and bar fixtures, a staffed canteen and its kitchen, a mini kitchen, games corner,
 * cozy living-room pieces, hotel and mall props, and outdoor drive-in bits. Inspired by (never copied from) the
 * café, restaurant, bar, board-game café, hotel, house, living room, mall, gaming, arcade and drive-in tilesets.
 */

const Z_SEAT = 24;
const Z_FRONT = 31;
const ALL: Dir[] = ['down', 'up', 'left', 'right'];

const brass = mat(mustard);
const chrome = mat(steel);
const iron = mat(charcoal);

function animFrames(n: number, draw: (f: number) => Part[]): Part[][] {
  return Array.from({ length: n }, (_, f) => draw(f));
}

/** A diagonal glass glint: a 2 px bright stroke and a soft 1 px echo. */
function glassStreak(p: Pen, x: number, y: number, len: number): void {
  p.line(x, y + len, x + len, y, glassGlint);
  p.line(x + 3, y + len, x + 3 + Math.floor(len / 2), y + len - Math.floor(len / 2), glassGlint);
}

/** A bottle standing on `base`: body, shoulder, neck and cap, an optional paper label. */
function bottle(p: Pen, x: number, base: number, h: number, ramp: Ramp, label: string | null = cream[5]): void {
  const m = mat(ramp);
  p.rect(x, base - h + 4, 4, h - 4, m.base);
  p.vline(x, base - h + 4, h - 4, m.light);
  p.vline(x + 3, base - h + 4, h - 4, m.dark);
  p.rect(x + 1, base - h + 1, 2, 3, m.dark);
  p.hline(x + 1, base - h, 2, charcoal[2]);
  if (label && h >= 10) {
    p.rect(x, base - 6, 4, 3, label);
    p.px(x + 3, base - 5, cream[3]);
  }
  p.px(x + 1, base - h + 5, m.hi);
}

/** A flat board-game box with a lit lid edge and a small cream label. */
function gameBox(p: Pen, x: number, y: number, w: number, h: number, ramp: Ramp): void {
  const m = mat(ramp);
  p.rect(x, y, w, h, m.base);
  p.hline(x, y, w, m.light);
  p.hline(x, y + h - 1, w, m.dark);
  p.vline(x + w - 1, y, h, m.dark);
  if (w >= 8 && h >= 3) {
    p.rect(x + 2, y + 1, 3, h - 2, cream[6]);
  }
}

/** Little round wheel / caster seen from the front. */
function wheel(p: Pen, x: number, y: number, d = 4): void {
  p.disc(x, y, d, iron.line);
  p.rect(x + 1, y + 1, Math.max(1, d - 2), Math.max(1, d - 2), iron.base);
  p.px(x + 1, y + 1, iron.light);
}

// =========================================================================================================
// Café: pastry display and order counter (2 x 1)

/** Café counter body: oak worktop -6..8, walnut tongue-and-groove front to the floor, sage kick. */
function cafeCounter(p: Pen): void {
  const top = mat(oak);
  const front = mat(walnut);
  p.rect(1, 8, 62, 22, front.base);
  for (let x = 6; x < 62; x += 6) {
    p.vline(x, 9, 18, front.dark);
    p.vline(x + 1, 9, 18, front.light);
  }
  p.vline(0, 8, 22, front.lineLit);
  p.vline(63, 8, 22, front.line);
  p.vline(62, 9, 20, front.dark);
  p.hline(1, 8, 62, front.deep);
  p.rect(1, 27, 62, 3, sage[1]);
  p.hline(1, 27, 62, sage[2]);
  p.hline(0, 30, 64, front.line);
  box(p, 0, -6, 64, 12, 2, top, { round: 1 });
  grain(p, 3, -4, 58, 8, top.base, 61);
}

function croissant(p: Pen, x: number, b: number): void {
  p.rect(x, b - 3, 7, 3, mustard[3]);
  p.hline(x + 1, b - 4, 5, mustard[4]);
  p.vline(x + 2, b - 3, 2, mustard[2]);
  p.vline(x + 4, b - 3, 2, mustard[2]);
  p.px(x, b - 1, mustard[1]);
  p.px(x + 6, b - 1, mustard[1]);
}

function cake(p: Pen, x: number, b: number): void {
  p.rect(x, b - 6, 10, 6, cream[6]);
  p.hline(x, b - 6, 10, cream[5]);
  p.hline(x, b - 3, 10, terracotta[4]);
  p.vline(x + 9, b - 5, 5, cream[4]);
  p.rect(x + 2, b - 8, 2, 2, red[2]);
  p.rect(x + 6, b - 8, 2, 2, red[2]);
  p.px(x + 2, b - 8, terracotta[5]);
}

function macarons(p: Pen, x: number, b: number): void {
  [sage[4], terracotta[5], mustard[4], cream[6]].forEach((c, i) => {
    p.rect(x + i * 5, b - 3, 4, 3, c);
    p.hline(x + i * 5, b - 2, 4, cream[5]);
  });
}

function muffin(p: Pen, x: number, b: number): void {
  p.rect(x + 1, b - 3, 5, 3, terracotta[2]);
  p.vline(x + 2, b - 3, 3, terracotta[3]);
  p.rect(x, b - 6, 7, 3, walnut[4]);
  p.hline(x + 1, b - 7, 5, walnut[4]);
  p.px(x + 2, b - 6, walnut[5]);
}

defineAsset({
  id: 'cafe.display.pastry',
  name: 'Pastry display counter',
  group: 'cafe.display',
  category: 'Kitchen',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['cafe', 'bakery', 'pastry', 'display', 'cake', 'counter', 'glass'],
  build() {
    const parts = single(area(2, 1, 32), 32, (p) => {
      cafeCounter(p);
      // glass case on the worktop: steel frame, lit cream back, two shelves of pastries
      p.rect(3, -26, 58, 30, chrome.line);
      p.rect(4, -25, 56, 28, cream[5]);
      p.rect(4, -25, 56, 3, lightWarm[1]);
      p.hline(4, -22, 56, cream[6]);
      p.rect(4, -12, 56, 2, steel[5]);
      p.hline(4, -10, 56, steel[3]);
      p.rect(4, 0, 56, 3, steel[4]);
      p.hline(4, 0, 56, steel[5]);
      croissant(p, 7, -12);
      croissant(p, 15, -12);
      cake(p, 26, -12);
      macarons(p, 40, -12);
      muffin(p, 7, 0);
      muffin(p, 15, 0);
      cake(p, 25, 0);
      croissant(p, 39, 0);
      muffin(p, 49, 0);
      p.hline(3, -26, 58, steel[5]);
      p.vline(3, -25, 28, steel[4]);
      p.vline(60, -25, 28, steel[2]);
      glassStreak(p, 10, -20, 6);
      glassStreak(p, 44, -8, 5);
      // price tags along the front rail
      for (const x of [9, 28, 44]) {
        p.rect(x, 4, 4, 2, cream[6]);
        p.px(x + 1, 4, terracotta[3]);
      }
    });
    return makeVariant({
      w: 2,
      h: 1,
      parts,
      spots: [stand(0, 1, 'up', 'snack', 16)],
      shadows: [shadow(0, 24, 64, 7, 'rect')],
      lights: [warmLight(32, -12, 44, 0.3)],
    });
  },
});

defineAsset({
  id: 'cafe.counter.register',
  name: 'Café order counter',
  group: 'cafe.register',
  category: 'Kitchen',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['cafe', 'counter', 'register', 'till', 'order', 'coffee', 'barista'],
  build() {
    const parts = single(area(2, 1, 32), 32, (p) => {
      cafeCounter(p);
      // till: body, key pad and a customer screen on a stalk
      box(p, 6, -10, 18, 7, 8, iron, { round: 1 });
      for (let i = 0; i < 4; i++) {
        p.rect(9 + i * 3, -8, 2, 1, cream[4]);
        p.rect(9 + i * 3, -6, 2, 1, cream[4]);
      }
      p.rect(19, -8, 3, 3, terracotta[4]);
      p.rect(15, -16, 2, 7, iron.dark);
      p.rect(10, -24, 12, 9, iron.line);
      p.rect(11, -23, 10, 7, screenGlow[0]);
      p.hline(11, -23, 10, screenGlow[1]);
      p.hline(12, -20, 6, '#3d7f9e');
      p.hline(12, -18, 4, '#3d7f9e');
      // tip jar with coins, a stack of paper cups, a cake under a glass dome
      p.rect(29, -8, 6, 8, water[5]);
      p.frame(29, -8, 6, 8, water[3]);
      p.rect(30, -3, 4, 2, mustard[4]);
      p.px(31, -4, mustard[3]);
      p.px(30, -7, glassGlint);
      for (let i = 0; i < 4; i++) {
        p.rect(39, -3 - i * 3, 6, 3, i % 2 ? cream[5] : cream[6]);
        p.vline(44, -3 - i * 3, 3, cream[3]);
      }
      p.hline(39, -13, 6, terracotta[3]);
      p.ellipse(48, 1, 12, 3, steel[3]);
      cake(p, 49, 1);
      p.rect(48, -12, 12, 13, water[5]);
      p.frame(48, -12, 12, 13, water[3]);
      cake(p, 49, 0);
      p.rect(53, -14, 2, 2, steel[3]);
      p.px(50, -10, glassGlint);
      p.px(50, -9, glassGlint);
    });
    return makeVariant({
      w: 2,
      h: 1,
      parts,
      spots: [stand(0, 1, 'up', 'coffee', 16)],
      shadows: [shadow(0, 24, 64, 7, 'rect')],
      lights: [screenLight(16, -20, 22, 0.25)],
    });
  },
});

// =========================================================================================================
// Café: coffee-bean shelf (1 x 1, tall)

function beanBag(p: Pen, x: number, b: number, labelColor: string): void {
  const m = mat(dirt);
  p.rect(x, b - 9, 7, 9, m.light);
  p.vline(x + 6, b - 9, 9, m.base);
  p.rect(x, b - 11, 7, 2, m.base);
  p.hline(x, b - 11, 7, m.hi);
  p.frame(x, b - 11, 7, 11, m.line);
  p.rect(x + 1, b - 7, 4, 3, labelColor);
  p.px(x + 2, b - 6, cream[6]);
}

defineAsset({
  id: 'cafe.shelf.beans',
  name: 'Coffee-bean shelf',
  group: 'cafe.shelf',
  category: 'Kitchen',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['cafe', 'coffee', 'beans', 'shelf', 'mugs', 'retail'],
  build() {
    const wood = mat(oak);
    const back = mat(walnut);
    const parts = single(area(1, 1, 40), 32, (p) => {
      box(p, 1, -34, 30, 6, 58, wood);
      p.rect(4, -27, 24, 48, back.dark);
      for (const y of [-27, -12, 3]) {
        p.hline(4, y, 24, back.deep);
      }
      for (const y of [-14, 1, 16]) {
        p.rect(3, y, 26, 2, wood.light);
        p.hline(3, y + 2, 26, wood.dark);
      }
      beanBag(p, 5, -14, terracotta[3]);
      beanBag(p, 13, -14, sage[3]);
      beanBag(p, 21, -14, navy[3]);
      mug(p, 5, -5, cream);
      mug(p, 13, -5, terracotta);
      mug(p, 21, -5, sage);
      for (const [x, ramp] of [[6, walnut], [14, walnut], [22, oak]] as const) {
        p.rect(x, 7, 6, 9, water[5]);
        p.rect(x, 10, 6, 6, mat(ramp).dark);
        p.px(x + 1, 11, mat(ramp).light);
        p.hline(x, 7, 6, cream[6]);
        p.rect(x, 5, 6, 2, wood.base);
        p.px(x + 1, 8, glassGlint);
      }
      // cupboard below
      p.rect(4, 19, 24, 9, wood.base);
      p.hline(4, 19, 24, wood.light);
      p.vline(16, 19, 9, wood.dark);
      p.px(14, 23, brass.hi);
      p.px(18, 23, brass.hi);
      p.hline(2, 29, 28, wood.line);
    });
    return makeVariant({ w: 1, h: 1, parts, spots: [stand(0, 1, 'up', 'coffee')], shadows: [shadow(1, 24, 30, 7, 'rect')] });
  },
});

// =========================================================================================================
// Café: chalkboard A-frame (1 x 1)

defineAsset({
  id: 'sign.aframe.cafe',
  name: 'Café A-frame sign',
  group: 'sign.aframe',
  category: 'Decor',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['sign', 'chalkboard', 'menu', 'cafe', 'a-frame', 'sidewalk'],
  build() {
    const wood = mat(oak);
    const parts = single(area(1, 1, 30, 4), 28, (p) => {
      p.line(7, 6, 4, 27, wood.line);
      p.line(8, 6, 5, 27, wood.base);
      p.line(24, 6, 27, 27, wood.line);
      p.line(23, 6, 26, 27, wood.dark);
      box(p, 3, -18, 26, 2, 36, wood, { round: 1 });
      p.rect(5, -14, 22, 28, charcoal[1]);
      p.hline(5, -14, 22, charcoal[2]);
      pixelText(p, 'CAFE', 9, -11, cream[6]);
      p.hline(8, -4, 16, cream[3]);
      // a steaming cup doodle and two chalk lines
      p.rect(12, 1, 7, 5, terracotta[5]);
      p.px(19, 2, terracotta[5]);
      p.px(19, 3, terracotta[5]);
      p.hline(11, 6, 9, cream[4]);
      p.px(14, -1, cream[3]);
      p.px(16, -2, cream[3]);
      p.hline(8, 9, 7, cream[4]);
      p.hline(18, 9, 5, mustard[4]);
      p.hline(4, 16, 24, wood.dark);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(3, 22, 26, 6, 'rect')] });
  },
});

// =========================================================================================================
// Bar counter modules (1 x 1, tile seamlessly): walnut top, oak slat front, brass foot rail

type End = 'left' | 'right' | null;

function barCounter(p: Pen, end: End): void {
  const x0 = end === 'left' ? 1 : 0;
  const x1 = end === 'right' ? 31 : 32;
  const w = x1 - x0;
  const top = mat(walnut);
  const slat = mat(oak, 1);
  // front: vertical slats
  p.rect(x0, 8, w, 20, slat.base);
  for (let x = x0; x < x1; x++) {
    if (x % 4 === 3) {
      p.vline(x, 9, 18, slat.dark);
    } else if (x % 4 === 0) {
      p.vline(x, 9, 18, slat.light);
    }
  }
  p.hline(x0, 8, w, slat.deep);
  // brass foot rail on brackets
  for (let x = x0; x < x1; x++) {
    if (x % 16 === 8) {
      p.rect(x, 23, 1, 2, brass.dark);
    }
  }
  p.hline(x0, 21, w, brass.hi);
  p.hline(x0, 22, w, brass.dark);
  // kick
  p.rect(x0, 27, w, 3, top.dark);
  p.hline(x0, 30, w, top.line);
  // bar top with a rounded front lip
  p.rect(x0, -4, w, 10, top.light);
  p.hline(x0, -4, w, top.line);
  p.hline(x0, -3, w, top.base);
  p.hline(x0, 5, w, top.hi);
  p.rect(x0, 6, w, 2, top.base);
  p.hline(x0, 7, w, top.dark);
  for (const [x, y, l] of [[4, -1, 6], [19, 2, 5]]) {
    if (x > x0 && x + l < x1) {
      p.hline(x, y, l, top.hi);
    }
  }
  if (end === 'left') {
    p.vline(0, -3, 33, top.lineLit);
  }
  if (end === 'right') {
    p.vline(31, -3, 33, top.line);
    p.vline(30, -2, 30, top.dark);
  }
}

function barModule(end: End, fill: (p: Pen) => void, spots: Spot[] = []): Variant {
  const parts = single(area(1, 1, 36, 4), 32, (p) => {
    barCounter(p, end);
    fill(p);
  });
  return makeVariant({ w: 1, h: 1, parts, spots, shadows: [shadow(-2, 26, 32, 6, 'rect')] });
}

/** A short glass of something on a coaster. */
function drink(p: Pen, x: number, y: number, liquid: Ramp): void {
  const m = mat(liquid);
  p.rect(x - 1, y + 5, 6, 1, cream[4]);
  p.rect(x, y, 4, 5, m.light);
  p.rect(x, y + 2, 4, 3, m.base);
  p.vline(x + 3, y, 5, m.dark);
  p.hline(x, y, 4, cream[6]);
  p.px(x, y + 1, glassGlint);
}

defineAsset({
  id: 'bar.counter.plain',
  name: 'Bar counter',
  group: 'bar.counter',
  category: 'Kitchen',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['bar', 'counter', 'pub', 'drinks', 'walnut'],
  build: () => barModule(null, (p) => drink(p, 13, -4, mustard)),
});

defineAsset({
  id: 'bar.counter.taps',
  name: 'Bar counter with taps',
  group: 'bar.counter.taps',
  category: 'Kitchen',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['bar', 'taps', 'soda', 'beer', 'cold brew', 'drinks', 'counter'],
  build: () => barModule(null, (p) => {
    // drip tray, tap tower, three coloured handles
    p.rect(7, -1, 18, 3, iron.base);
    p.hline(7, -1, 18, iron.light);
    for (let x = 8; x < 24; x += 2) {
      p.px(x, 0, iron.line);
    }
    p.rect(14, -14, 4, 13, chrome.base);
    p.vline(14, -14, 13, chrome.light);
    p.vline(17, -14, 13, chrome.dark);
    p.rect(7, -18, 18, 4, chrome.light);
    p.hline(7, -18, 18, chrome.hi);
    p.hline(7, -15, 18, chrome.dark);
    p.frame(7, -18, 18, 4, chrome.line);
    ([[9, mustard], [15, terracotta], [21, sage]] as const).forEach(([x, ramp]) => {
      const m = mat(ramp);
      p.rect(x, -26, 3, 8, m.base);
      p.vline(x, -26, 8, m.light);
      p.hline(x, -26, 3, m.hi);
      p.px(x + 2, -19, m.line);
      p.vline(x + 1, -14, 3, chrome.dark);
    });
    drink(p, 26, -6, mustard);
  }, [stand(0, 1, 'up', 'water')]),
});

for (const side of ['left', 'right'] as const) {
  defineAsset({
    id: `bar.counter.end.${side}`,
    name: `Bar counter end (${side})`,
    group: 'bar.counter.end',
    category: 'Kitchen',
    layer: 'object',
    placement: 'free',
    facings: ['down'],
    keywords: ['bar', 'counter', 'end', 'cap'],
    build: () => barModule(side, (p) => {
      const x = side === 'left' ? 8 : 18;
      // napkin holder
      p.rect(x, -6, 6, 6, steel[4]);
      p.rect(x + 1, -8, 4, 3, cream[6]);
      p.hline(x, -6, 6, steel[5]);
      p.vline(x + 5, -6, 6, steel[2]);
    }),
  });
}

// =========================================================================================================
// Back bar: bottle shelves over a cupboard (2 x 1, tall)

defineAsset({
  id: 'bar.backbar',
  name: 'Back-bar shelves',
  group: 'bar.backbar',
  category: 'Kitchen',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['bar', 'bottles', 'shelf', 'back bar', 'drinks', 'mirror'],
  build() {
    const wood = mat(walnut);
    const parts = single(area(2, 1, 40), 32, (p) => {
      box(p, 0, -36, 64, 6, 64, wood);
      // mirrored back with soft reflections
      p.rect(3, -29, 58, 30, steel[3]);
      p.rect(3, -29, 58, 2, steel[2]);
      for (const x of [12, 40]) {
        p.line(x, -4, x + 14, -26, steel[4]);
        p.line(x + 2, -4, x + 16, -26, steel[4]);
      }
      // two lit shelves of bottles
      for (const y of [-15, -1]) {
        p.rect(2, y, 60, 2, mat(oak).light);
        p.hline(2, y + 2, 60, mat(oak).dark);
        p.hline(3, y + 3, 58, lightWarm[1]);
      }
      const row1: [number, number, Ramp][] = [[5, 12, mustard], [10, 10, plant], [15, 13, cream], [20, 11, terracotta], [26, 9, mustard], [36, 12, navy], [41, 10, plant], [46, 13, mustard], [51, 11, cream], [56, 9, terracotta]];
      for (const [x, h, r] of row1) {
        bottle(p, x, -15, h, r);
      }
      const row2: [number, number, Ramp][] = [[5, 10, plant], [10, 12, terracotta], [16, 9, mustard], [24, 11, cream], [30, 13, walnut], [38, 10, mustard], [44, 12, sage], [50, 10, terracotta], [55, 12, mustard]];
      for (const [x, h, r] of row2) {
        bottle(p, x, -1, h, r, x % 2 ? cream[5] : null);
      }
      // worktop ledge with glasses, cupboard doors
      box(p, 1, 2, 62, 4, 2, mat(oak));
      for (const x of [8, 13, 46, 51]) {
        p.rect(x, -2, 3, 4, water[5]);
        p.px(x, -2, glassGlint);
      }
      for (const x of [4, 33]) {
        p.rect(x, 10, 27, 17, wood.base);
        p.hline(x, 10, 27, wood.light);
        p.vline(x, 10, 17, wood.light);
        p.vline(x + 26, 10, 17, wood.dark);
        p.hline(x, 26, 27, wood.dark);
        p.rect(x + 3, 13, 21, 11, wood.dark);
        p.rect(x + 4, 14, 19, 9, wood.base);
      }
      p.rect(29, 16, 1, 4, brass.hi);
      p.rect(35, 16, 1, 4, brass.hi);
      p.rect(2, 27, 60, 2, wood.deep);
    });
    return makeVariant({
      w: 2,
      h: 1,
      parts,
      shadows: [shadow(0, 24, 64, 7, 'rect')],
      lights: [warmLight(32, -10, 52, 0.35)],
    });
  },
});

// =========================================================================================================
// Pedestal bar stools (join the 'stool' swap group)

function pedestalStool(ramp: Ramp): (facing: Dir) => Variant {
  return (facing) => {
    const pad = mat(ramp);
    const parts = single(area(1, 1, 24), Z_SEAT, (p) => {
      p.ellipse(8, 25, 17, 5, chrome.line);
      p.ellipse(9, 25, 15, 3, chrome.base);
      p.hline(11, 25, 6, chrome.hi);
      // foot ring: back arc, column, front arc
      p.hline(11, 18, 11, chrome.dark);
      p.rect(15, 11, 3, 15, chrome.base);
      p.vline(15, 11, 15, chrome.light);
      p.vline(17, 11, 15, chrome.line);
      p.vline(9, 19, 2, chrome.base);
      p.vline(23, 19, 2, chrome.dark);
      p.hline(10, 21, 13, chrome.light);
      p.hline(10, 22, 13, chrome.line);
      cushion(p, 6, 4, 21, 7, 5, pad, 3);
      p.hline(7, 15, 19, chrome.dark);
    });
    return makeVariant({ w: 1, h: 1, mask: ['s'], spots: [seat(facing)], parts, shadows: [shadow(6, 23, 20, 7)] });
  };
}

for (const [id, name, ramp] of [
  ['stool.bar.red', 'Bar stool (red leather)', terracotta],
  ['stool.bar.teal', 'Bar stool (teal leather)', teal],
] as const) {
  defineAsset({
    id,
    name,
    group: 'stool',
    category: 'Kitchen',
    layer: 'object',
    placement: 'free',
    facings: ALL,
    keywords: ['stool', 'bar', 'seat', 'diner', 'chrome'],
    build: pedestalStool(ramp),
  });
}

// =========================================================================================================
// Booth seating (2 seats, tall back) for diners and bars

interface Booth {
  f: Mat;
  wood: Mat;
}

function booth(u: Booth): (facing: Dir) => Variant {
  const { f, wood } = u;
  const build = (facing: Dir): Variant => {
    if (facing === 'right') {
      return mirrorVariant(build('left'));
    }
    if (facing === 'down' || facing === 'up') {
      const W = 64;
      const parts = layered(area(2, 1, 32), (L) => {
        const p = L(Z_SEAT);
        if (facing === 'down') {
          box(p, 4, -22, W - 8, 3, 3, wood, { round: 1 });
          cushion(p, 5, -16, W - 10, 2, 26, f, 2);
          for (let x = 12; x < W - 8; x += 8) {
            p.vline(x, -12, 18, f.dark);
            p.vline(x + 1, -12, 18, f.light);
          }
          box(p, 6, 23, W - 12, 1, 6, wood, { edge: 'line' });
          cushion(p, 6, 5, W - 12, 12, 7, f, 2);
          p.vline(32, 6, 10, f.base);
          box(p, 0, -20, 6, 3, 50, wood);
          box(p, W - 6, -20, 6, 3, 50, wood);
        } else {
          cushion(p, 6, -8, W - 12, 12, 4, f, 2);
          const b = L(Z_FRONT);
          box(b, 1, -2, W - 2, 4, 29, wood);
          for (const x of [5, 33]) {
            b.rect(x, 5, 26, 18, wood.dark);
            b.rect(x + 1, 6, 24, 16, wood.base);
            b.hline(x + 1, 6, 24, wood.light);
          }
          b.hline(2, 30, W - 4, wood.line);
        }
      });
      return makeVariant({
        w: 2,
        h: 1,
        mask: ['ss'],
        spots: [seat(facing, 0, 0, 3), seat(facing, 1, 0, -3)],
        parts,
        shadows: [shadow(0, 20, W, 11, 'rect')],
      });
    }
    const H = 64;
    const parts = layered(area(1, 2, 36), (L) => {
      const p = L(Z_SEAT);
      // tall back along the east edge, its padded face toward the sitters
      box(p, 23, -22, 9, H - 12, 28, wood);
      cushion(p, 18, -12, 6, H - 22, 18, f, 2);
      for (let y = -6; y < H - 28; y += 8) {
        p.hline(19, y, 4, f.dark);
      }
      box(p, 1, -10, 30, 4, 16, wood);
      box(p, 4, H - 20, 18, 2, 8, wood, { edge: 'line' });
      cushion(p, 4, 2, 15, 21, 5, f, 2);
      cushion(p, 4, 25, 15, H - 46, 5, f, 2);
      const front = L(H - 1);
      box(front, 1, H - 20, 30, 4, 15, wood);
      front.rect(5, H - 13, 22, 7, wood.dark);
      front.rect(6, H - 12, 20, 5, wood.base);
      front.hline(6, H - 12, 20, wood.light);
    });
    return makeVariant({
      w: 1,
      h: 2,
      mask: ['s', 's'],
      spots: [seat('left', 0, 0, -2, 0), seat('left', 0, 1, -2, -4)],
      parts,
      shadows: [shadow(0, 4, 32, H - 6, 'rect')],
    });
  };
  return build;
}

for (const [id, name, u] of [
  ['booth.red', 'Booth (red leather)', { f: mat(terracotta, 1), wood: mat(walnut) }],
  ['booth.teal', 'Booth (teal)', { f: mat(teal), wood: mat(oak, 1) }],
] as const) {
  defineAsset({
    id,
    name,
    group: 'booth',
    category: 'Kitchen',
    layer: 'object',
    placement: 'wall',
    facings: ALL,
    keywords: ['booth', 'bench', 'diner', 'seat', 'restaurant', 'bar'],
    build: booth(u),
  });
}

// =========================================================================================================
// Board-game shelf (2 x 1, tall)

defineAsset({
  id: 'shelf.boardgames',
  name: 'Board-game shelf',
  group: 'shelf.games',
  category: 'Lounge',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['board games', 'shelf', 'games', 'cafe', 'play', 'boxes'],
  build() {
    const wood = mat(oak);
    const back = mat(walnut);
    const parts = single(area(2, 1, 40), 32, (p) => {
      box(p, 1, -34, 62, 6, 62, wood);
      p.rect(4, -27, 56, 54, back.dark);
      for (const y of [-27, -11, 5]) {
        p.hline(4, y, 56, back.deep);
      }
      for (const y of [-13, 3, 19]) {
        p.rect(3, y, 58, 2, wood.light);
        p.hline(3, y + 2, 58, wood.dark);
      }
      p.rect(31, -27, 2, 46, wood.base);
      p.vline(31, -27, 46, wood.light);
      // top row: stacked boxes, a dice jar
      gameBox(p, 5, -17, 20, 4, terracotta);
      gameBox(p, 6, -21, 18, 4, navy);
      gameBox(p, 5, -24, 16, 3, mustard);
      p.rect(25, -20, 5, 7, water[5]);
      p.frame(25, -20, 5, 7, water[3]);
      p.px(26, -16, red[2]);
      p.px(28, -15, mustard[4]);
      p.px(27, -17, sage[4]);
      for (let i = 0; i < 6; i++) {
        gameBox(p, 35 + i * 4, -25 + (i % 3), 4, 12 - (i % 3), [sage, terracotta, navy, mustard, teal, cream][i]);
      }
      // middle row: upright boxes, a meeple on a tall stack
      for (let i = 0; i < 6; i++) {
        gameBox(p, 5 + i * 4, -9 + (i % 2) * 2, 4, 12 - (i % 2) * 2, [mustard, teal, terracotta, cream, sage, navy][i]);
      }
      gameBox(p, 35, -1, 22, 4, sage);
      gameBox(p, 36, -5, 20, 4, terracotta);
      gameBox(p, 37, -8, 17, 3, cream);
      const meeple = mat(mustard);
      p.rect(44, -12, 3, 4, meeple.base);
      p.rect(43, -11, 5, 2, meeple.base);
      p.px(44, -12, meeple.hi);
      // bottom row: big flat boxes and a basket of cards
      gameBox(p, 5, 15, 24, 4, navy);
      gameBox(p, 6, 11, 22, 4, mustard);
      gameBox(p, 7, 8, 18, 3, terracotta);
      const b = mat(dirt);
      p.rect(36, 11, 22, 8, b.base);
      p.hline(36, 11, 22, b.hi);
      p.frame(36, 11, 22, 8, b.line);
      for (let x = 38; x < 56; x += 3) {
        p.vline(x, 12, 6, b.dark);
      }
      p.rect(40, 9, 5, 2, cream[6]);
      p.rect(47, 8, 5, 3, cream[6]);
      p.px(48, 9, red[2]);
      p.rect(2, 22, 60, 6, wood.base);
      p.hline(2, 22, 60, wood.light);
      p.hline(2, 29, 60, wood.line);
    });
    return makeVariant({ w: 2, h: 1, parts, spots: [stand(0, 1, 'up', 'play', 16)], shadows: [shadow(1, 24, 62, 7, 'rect')] });
  },
});

// =========================================================================================================
// Barrel standing table (1 x 1)

defineAsset({
  id: 'table.barrel',
  name: 'Barrel table',
  group: 'table.barrel',
  category: 'Lounge',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['barrel', 'table', 'standing', 'pub', 'cafe', 'high table'],
  build() {
    const wood = mat(oak);
    const parts = single(area(1, 1, 24), 28, (p) => {
      cylinder(p, 6, 0, 20, 30, mat(oak, 1), 6);
      for (const x of [11, 16, 21]) {
        p.vline(x, 6, 20, oak[2]);
      }
      for (const y of [7, 22]) {
        p.hline(7, y, 18, steel[2]);
        p.hline(7, y + 1, 18, steel[1]);
        p.px(7, y, steel[4]);
      }
      cylinder(p, 2, -8, 28, 14, wood, 11);
      p.hline(6, -6, 9, wood.hi);
      // two drinks and a candle jar
      drink(p, 8, -6, mustard);
      drink(p, 20, -5, terracotta);
      p.rect(14, -8, 4, 4, water[5]);
      p.px(15, -9, lightWarm[1]);
      p.px(15, -10, lightWarm[0]);
    });
    return makeVariant({
      w: 1,
      h: 1,
      parts,
      spots: [stand(-1, 0, 'right', 'social'), stand(1, 0, 'left', 'social')],
      shadows: [shadow(5, 24, 22, 7)],
      lights: [warmLight(16, -8, 22, 0.25)],
    });
  },
});

// =========================================================================================================
// TV and game console on a media console (2 x 1)

defineAsset({
  id: 'console.tv',
  name: 'Game console and TV',
  group: 'console.tv',
  category: 'Lounge',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['tv', 'console', 'video games', 'play', 'gaming', 'media'],
  build() {
    const wood = mat(walnut);
    const N = 4;
    const frames = animFrames(N, (f) =>
      single(area(2, 1, 40), 32, (p) => {
        leg(p, 5, 26, 5, brass, 2);
        leg(p, 57, 26, 5, brass, 2);
        box(p, 1, 4, 62, 8, 20, wood);
        // open cubby with the console, drawers with slats
        p.rect(4, 15, 26, 10, wood.deep);
        box(p, 7, 18, 14, 3, 4, mat(cream), { round: 1 });
        p.px(19, 21, f % 2 ? screenGlow[1] : teal[4]);
        gameBox(p, 23, 18, 5, 7, terracotta);
        for (const y of [15, 20]) {
          p.rect(34, y, 26, 5, wood.base);
          p.hline(34, y, 26, wood.light);
          p.hline(34, y + 4, 26, wood.deep);
          p.hline(44, y + 2, 6, brass.hi);
        }
        // controllers on top
        for (const x of [8, 48]) {
          p.rect(x, 8, 7, 3, iron.base);
          p.hline(x, 8, 7, iron.light);
          p.px(x + 1, 9, terracotta[4]);
          p.px(x + 5, 9, teal[4]);
        }
        // TV: foot, bezel, a little platformer on screen
        p.rect(26, 2, 12, 3, iron.base);
        p.rect(30, -2, 4, 4, iron.dark);
        p.rect(6, -32, 52, 31, iron.line);
        p.hline(7, -32, 50, iron.dark);
        const sx = 8;
        const sy = -30;
        p.rect(sx, sy, 48, 27, '#7cbcd2');
        p.rect(sx, sy, 48, 9, '#4b93b6');
        p.rect(sx, sy + 19, 48, 8, plant[3]);
        p.hline(sx, sy + 19, 48, plant[5]);
        p.rect(sx, sy + 22, 48, 5, dirt[2]);
        for (let i = 0; i < 4; i++) {
          p.rect(sx + 6 + i * 12, sy + 22, 2, 1, dirt[3]);
        }
        const cloud = (sx + 8 + f * 3) % 40;
        p.rect(sx + cloud, sy + 4, 8, 3, cream[6]);
        p.rect(sx + cloud + 2, sy + 3, 4, 1, cream[6]);
        p.rect(sx + 30, sy + 13, 10, 3, mustard[3]);
        p.hline(sx + 30, sy + 13, 10, mustard[4]);
        p.rect(sx + 34, sy + 9, 2, 2, mustard[4]);
        const hx = sx + 10 + [0, 3, 6, 3][f];
        const hy = sy + 13 - [0, 3, 0, 1][f];
        p.rect(hx, hy, 4, 6, red[1]);
        p.rect(hx, hy, 4, 2, red[2]);
        p.px(hx + 2, hy + 1, cream[6]);
        p.px(sx, sy, screenGlow[1]);
      }),
    );
    return makeVariant({
      w: 2,
      h: 1,
      frames,
      anim: { kind: 'loop', fps: 3 },
      spots: [stand(0, 1, 'up', 'play', 16)],
      shadows: [shadow(1, 25, 62, 6, 'rect')],
      lights: [screenLight(32, -16, 52, 0.42)],
    });
  },
});

// =========================================================================================================
// Pinball machine (1 x 1)

defineAsset({
  id: 'game.pinball',
  name: 'Pinball machine',
  group: 'game.pinball',
  category: 'Lounge',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['pinball', 'arcade', 'game', 'play', 'retro', 'flipper'],
  build() {
    const body = mat(terracotta, 1);
    const N = 4;
    const frames = animFrames(N, (f) =>
      single(area(1, 1, 40), 32, (p) => {
        leg(p, 5, 16, 14, iron, 2);
        leg(p, 25, 16, 14, iron, 2);
        leg(p, 7, 4, 10, iron, 2);
        leg(p, 23, 4, 10, iron, 2);
        // back box with a lit score display
        box(p, 3, -34, 26, 3, 26, body, { round: 1 });
        p.rect(6, -29, 20, 13, navy[0]);
        p.frame(6, -29, 20, 13, mustard[1]);
        p.rect(8, -27, 16, 4, navy[2]);
        for (let i = 0; i < 4; i++) {
          p.rect(9 + i * 4, -26, 2, 2, (i + f) % 4 === 0 ? cream[6] : mustard[4]);
        }
        p.disc(10, -22, 4, terracotta[4]);
        p.disc(18, -22, 4, teal[4]);
        p.rect(8, -14, 16, 3, mustard[3]);
        // cabinet and glass-covered playfield
        box(p, 3, -9, 26, 22, 7, body, { round: 1 });
        p.rect(5, -7, 22, 18, navy[1]);
        p.hline(5, -7, 22, navy[2]);
        const lit = (i: number) => (i + f) % 3 === 0;
        p.disc(9, -5, 4, lit(0) ? cream[6] : terracotta[4]);
        p.disc(17, -6, 4, lit(1) ? cream[6] : mustard[4]);
        p.disc(13, -1, 4, lit(2) ? cream[6] : teal[4]);
        p.line(6, 3, 10, 7, cream[3]);
        p.line(25, 3, 21, 7, cream[3]);
        p.line(11, 8, 14, 9, cream[6]);
        p.line(20, 8, 17, 9, cream[6]);
        p.vline(24, -4, 12, navy[3]);
        const balls: [number, number][] = [[20, 4], [15, 2], [11, 3], [18, -1]];
        p.rect(balls[f][0], balls[f][1], 2, 2, steel[6]);
        glassStreak(p, 7, -6, 4);
        // coin door and flipper buttons
        p.rect(12, 16, 8, 3, iron.base);
        p.px(14, 17, red[2]);
        p.px(17, 17, red[2]);
        p.rect(2, 11, 2, 2, red[2]);
        p.rect(28, 11, 2, 2, red[2]);
      }),
    );
    return makeVariant({
      w: 1,
      h: 1,
      frames,
      anim: { kind: 'loop', fps: 4 },
      spots: [stand(0, 1, 'up', 'play')],
      shadows: [shadow(3, 18, 26, 12, 'rect')],
      lights: [warmLight(16, -22, 28, 0.3), screenLight(16, 2, 22, 0.2)],
    });
  },
});

// =========================================================================================================
// Air hockey (2 x 1)

defineAsset({
  id: 'game.airhockey',
  name: 'Air hockey table',
  group: 'game',
  category: 'Lounge',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['air hockey', 'game', 'table', 'arcade', 'play'],
  build() {
    const rim = mat(navy);
    const N = 6;
    const frames = animFrames(N, (f) =>
      single(area(2, 1, 24, 10), 32, (p) => {
        leg(p, 6, 18, 12, iron, 3);
        leg(p, 55, 18, 12, iron, 3);
        p.hline(9, 26, 46, iron.dark);
        box(p, 1, -6, 62, 20, 10, rim, { round: 1 });
        p.rect(5, -3, 54, 14, steel[6]);
        p.hline(5, -3, 54, steel[5]);
        for (let y = -1; y < 10; y += 3) {
          for (let x = 7 + (y % 2); x < 58; x += 4) {
            p.px(x, y, steel[5]);
          }
        }
        p.vline(32, -3, 14, red[1]);
        p.frame(28, 1, 9, 6, red[1]);
        p.frame(5, 0, 6, 8, blue[2]);
        p.frame(53, 0, 6, 8, blue[2]);
        // goal slots and the puck gliding between two mallets
        p.rect(2, 1, 3, 6, iron.line);
        p.rect(59, 1, 3, 6, iron.line);
        const px = 12 + Math.round((Math.sin((f / N) * Math.PI * 2) * 0.5 + 0.5) * 38);
        const py = 2 + [0, 2, 4, 3, 1, 0][f];
        p.disc(px, py, 4, iron.line);
        p.hline(px + 1, py + 1, 2, iron.light);
        p.disc(9, 2, 5, red[1]);
        p.rect(10, 2, 2, 2, red[2]);
        p.disc(50, 3, 5, blue[2]);
        p.rect(51, 3, 2, 2, blue[3]);
        // score LEDs on the near rim
        p.rect(24, 16, 16, 4, iron.line);
        p.rect(26, 17, 3, 2, red[2]);
        p.rect(35, 17, 3, 2, screenGlow[0]);
      }),
    );
    return makeVariant({
      w: 2,
      h: 1,
      frames,
      anim: { kind: 'loop', fps: 6 },
      spots: [stand(-1, 0, 'right', 'play'), stand(2, 0, 'left', 'play')],
      shadows: [shadow(2, 22, 60, 9, 'rect')],
    });
  },
});

// =========================================================================================================
// Claw machine (1 x 1)

function plush(p: Pen, x: number, y: number, ramp: Ramp): void {
  const m = mat(ramp);
  p.rect(x, y + 1, 6, 4, m.base);
  p.rect(x + 1, y, 4, 1, m.base);
  p.hline(x + 1, y + 1, 3, m.light);
  p.px(x, y, m.dark);
  p.px(x + 5, y, m.dark);
  p.px(x + 2, y + 2, charcoal[0]);
  p.px(x + 4, y + 2, charcoal[0]);
}

defineAsset({
  id: 'game.claw',
  name: 'Claw machine',
  group: 'game.claw',
  category: 'Lounge',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['claw', 'crane', 'prize', 'arcade', 'plush', 'play'],
  build() {
    const body = mat(mustard);
    const N = 6;
    const frames = animFrames(N, (f) =>
      single(area(1, 1, 48), 32, (p) => {
        box(p, 2, 0, 28, 6, 24, body, { round: 1 });
        p.rect(12, 12, 9, 7, iron.line);
        p.rect(13, 13, 7, 5, iron.base);
        p.rect(6, 22, 5, 4, iron.base);
        p.vline(8, 22, 3, red[2]);
        p.disc(23, 1, 3, red[2]);
        p.rect(24, 4, 1, 3, iron.line);
        // glass cabinet: posts, back, plush pile, claw
        p.rect(3, -36, 26, 37, body.line);
        p.rect(5, -30, 22, 30, navy[1]);
        p.hline(5, -30, 22, navy[2]);
        const pile: [number, number, Ramp][] = [[5, -6, terracotta], [11, -7, sage], [17, -6, teal], [22, -6, cream], [8, -10, mustard], [14, -11, navy], [20, -10, terracotta]];
        for (const [x, y, r] of pile) {
          plush(p, x, y, r);
        }
        p.rect(5, -2, 22, 2, navy[0]);
        const cx = 9 + [0, 3, 6, 9, 6, 3][f];
        const drop = [4, 4, 8, 12, 8, 4][f];
        p.hline(5, -28, 22, steel[4]);
        p.rect(cx, -29, 5, 2, steel[3]);
        p.vline(cx + 2, -27, drop, steel[5]);
        const cy = -27 + drop;
        p.rect(cx + 1, cy, 3, 2, steel[4]);
        p.px(cx, cy + 2, steel[3]);
        p.px(cx + 4, cy + 2, steel[3]);
        p.px(cx, cy + 3, steel[2]);
        p.px(cx + 4, cy + 3, steel[2]);
        glassStreak(p, 7, -24, 6);
        p.vline(3, -36, 37, body.base);
        p.vline(4, -36, 37, body.light);
        p.vline(27, -36, 37, body.base);
        p.vline(28, -36, 37, body.dark);
        // marquee
        box(p, 2, -42, 28, 3, 7, body, { round: 1 });
        for (let i = 0; i < 6; i++) {
          p.px(6 + i * 4, -38, (i + f) % 2 ? cream[6] : terracotta[4]);
        }
      }),
    );
    return makeVariant({
      w: 1,
      h: 1,
      frames,
      anim: { kind: 'loop', fps: 3 },
      spots: [stand(0, 1, 'up', 'play')],
      shadows: [shadow(2, 25, 28, 6, 'rect')],
      lights: [warmLight(16, -36, 26, 0.3), screenLight(16, -14, 24, 0.22)],
    });
  },
});

// =========================================================================================================
// Dartboard (wall, 1 x 1): the thrower stands two tiles out

defineAsset({
  id: 'wall.dartboard',
  name: 'Dartboard',
  group: 'wall.dartboard',
  category: 'Lounge',
  layer: 'wall',
  facings: ['down'],
  keywords: ['darts', 'dartboard', 'game', 'pub', 'play', 'wall'],
  build() {
    const parts = single({ x: 0, y: -10, w: 32, h: 34 }, 1, (p) => {
      const wood = mat(walnut);
      p.rect(3, -6, 26, 26, wood.base);
      p.frame(3, -6, 26, 26, wood.line);
      p.hline(4, -5, 24, wood.light);
      p.hline(4, 18, 24, wood.dark);
      const cx = 16;
      const cy = 7;
      for (let y = -4; y < 18; y++) {
        for (let x = 5; x < 27; x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          const r = Math.hypot(dx, dy);
          if (r > 10.5) {
            continue;
          }
          const sector = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 8) % 2;
          let c = sector ? charcoal[1] : cream[5];
          if (r > 9.3) {
            c = charcoal[0];
          } else if ((r > 8 && r <= 9.3) || (r > 4.6 && r <= 5.6)) {
            c = sector ? red[1] : sage[3];
          } else if (r <= 1.4) {
            c = red[2];
          } else if (r <= 2.6) {
            c = sage[3];
          }
          p.px(x, y, c);
        }
      }
      // two darts
      for (const [x, y, flight] of [[19, 3, mustard[4]], [12, 10, teal[4]]] as const) {
        p.px(x, y, steel[5]);
        p.line(x + 1, y - 1, x + 3, y - 3, steel[2]);
        p.rect(x + 3, y - 5, 2, 2, flight);
        p.px(x + 4, y - 3, flight);
      }
    });
    return makeVariant({ w: 1, h: 1, parts, spots: [stand(0, 2, 'up', 'play')] });
  },
});

// =========================================================================================================
// Brick fireplace with a walnut mantel and a crackling fire (2 x 1)

function flames(p: Pen, f: number): void {
  const tongues: [number, number, number][] = [[22, 9, 0], [27, 13, 1.7], [32, 15, 3.1], [37, 12, 4.4], [42, 9, 5.6]];
  for (const [x, h0, ph] of tongues) {
    const h = h0 + Math.round(Math.sin(f * 1.3 + ph) * 2.5);
    for (let i = 0; i < h; i++) {
      const t = i / h;
      const half = Math.max(0, Math.round((1 - t) * 3 - 0.2));
      const sway = Math.round(Math.sin(f + ph + i * 0.4) * t * 1.5);
      const c = t < 0.3 ? cream[6] : t < 0.55 ? lightWarm[1] : t < 0.8 ? mustard[4] : terracotta[4];
      p.hline(x - half + sway, 22 - i, half * 2 + 1, c);
    }
  }
}

defineAsset({
  id: 'fireplace.brick',
  name: 'Brick fireplace',
  group: 'fireplace',
  category: 'Lounge',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['fireplace', 'fire', 'hearth', 'brick', 'cozy', 'mantel'],
  build() {
    const N = 6;
    const mantel = mat(walnut);
    const stone = mat(paving);
    const frames = animFrames(N, (f) =>
      single(area(2, 1, 40), 32, (p) => {
        // chimney breast in brick
        for (let y = -32; y < 24; y++) {
          for (let x = 4; x < 60; x++) {
            p.px(x, y, brickAt(x, y + 32, 9));
          }
        }
        p.vline(4, -32, 56, terracotta[1]);
        p.vline(59, -32, 56, terracotta[0]);
        p.hline(4, -32, 56, terracotta[1]);
        // firebox with a soot arch, logs and fire
        p.rect(16, 6, 32, 18, charcoal[0]);
        p.rect(18, 4, 28, 2, charcoal[0]);
        p.rect(18, 6, 28, 4, charcoal[1]);
        p.rect(14, 4, 2, 20, stone.base);
        p.rect(48, 4, 2, 20, stone.dark);
        p.rect(16, 2, 32, 2, stone.light);
        p.hline(14, 1, 36, stone.line);
        flames(p, f);
        for (const [x, w] of [[20, 14], [30, 14]]) {
          p.rect(x, 20, w, 3, walnut[2]);
          p.hline(x, 20, w, walnut[4]);
          p.px(x, 21, oak[5]);
        }
        p.hline(18, 23, 28, terracotta[3]);
        for (const x of [22, 29, 35, 41]) {
          p.px(x + (f % 2), 23, lightWarm[1]);
        }
        // hearth slab
        box(p, 0, 22, 64, 4, 6, stone);
        // mantel shelf with candles, a clock and a sprig
        box(p, 0, -10, 64, 4, 5, mantel);
        for (const x of [6, 10]) {
          p.rect(x, -16, 2, 6, cream[6]);
          p.px(x, -17, f % 3 === 0 ? lightWarm[0] : lightWarm[1]);
        }
        p.disc(27, -19, 9, brass.base);
        p.disc(28, -18, 7, cream[6]);
        p.vline(31, -17, 3, charcoal[1]);
        p.hline(31, -15, 2, charcoal[1]);
        p.rect(25, -11, 13, 1, brass.dark);
        sprig(p, 50, -10, cream, 6);
        p.rect(40, -18, 7, 8, walnut[3]);
        p.frame(40, -18, 7, 8, walnut[1]);
        p.rect(41, -17, 5, 6, sage[4]);
      }),
    );
    return makeVariant({
      w: 2,
      h: 1,
      frames,
      anim: { kind: 'loop', fps: 6 },
      spots: [stand(0, 1, 'up', 'social', 16)],
      shadows: [shadow(0, 24, 64, 7, 'rect')],
      lights: [warmLight(32, 16, 96, 0.6)],
    });
  },
});

// =========================================================================================================
// Upright piano with its bench (2 x 2): the pianist sits on the bench facing the keys

defineAsset({
  id: 'piano.upright',
  name: 'Upright piano',
  group: 'piano',
  category: 'Lounge',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['piano', 'music', 'keys', 'instrument', 'play'],
  build() {
    const wood = mat(walnut);
    const parts = layered(area(2, 2, 40), (L) => {
      const p = L(32);
      box(p, 1, -32, 62, 6, 40, wood);
      // music desk with a score, a plant on top
      p.rect(14, -18, 36, 12, wood.dark);
      p.rect(20, -17, 11, 10, cream[6]);
      p.rect(32, -17, 11, 10, cream[5]);
      for (let y = -15; y < -8; y += 2) {
        p.hline(22, y, 8, charcoal[3]);
        p.hline(34, y, 7, charcoal[3]);
      }
      p.vline(31, -17, 10, cream[3]);
      sprig(p, 52, -32, terracotta, 11);
      // keyboard shelf jutting out
      box(p, 0, 8, 64, 8, 3, wood, { round: 1 });
      p.rect(4, 9, 56, 5, cream[6]);
      p.hline(4, 13, 56, cream[4]);
      for (let x = 4; x < 60; x += 3) {
        p.vline(x, 9, 5, cream[4]);
      }
      for (let k = 0; k < 18; k++) {
        if (![2, 6].includes(k % 7)) {
          p.rect(6 + k * 3, 9, 2, 3, charcoal[1]);
        }
      }
      // lower panel, pedals
      p.rect(4, 19, 56, 9, wood.base);
      p.hline(4, 19, 56, wood.light);
      p.rect(8, 21, 48, 5, wood.dark);
      for (const x of [26, 31, 36]) {
        p.rect(x, 28, 3, 2, brass.light);
      }
      p.hline(1, 30, 62, wood.line);
      leg(p, 3, 16, 14, wood, 3);
      leg(p, 58, 16, 14, wood, 3);
      // bench in the second row, under the pianist
      const b = L(50);
      leg(b, 16, 46, 12, wood, 2);
      leg(b, 46, 46, 12, wood, 2);
      box(b, 14, 38, 36, 6, 5, wood, { round: 1 });
      b.rect(16, 39, 32, 3, mat(terracotta, 1).light);
    });
    return makeVariant({
      w: 2,
      h: 2,
      mask: ['##', 'ss'],
      spots: [{ dx: 0, dy: 1, facing: 'up', pose: 'sit', activity: 'play', px: 16, py: -4 }],
      parts,
      shadows: [shadow(0, 24, 64, 8, 'rect'), shadow(14, 52, 36, 7, 'rect')],
    });
  },
});

// =========================================================================================================
// Narrow bookcases (1 x 1, tall)

function narrowBookcase(wood: Mat, back: Mat, seed: number): () => Variant {
  return () => {
    const parts = single(area(1, 1, 40), 32, (p) => {
      box(p, 1, -34, 30, 6, 58, wood);
      p.rect(4, -27, 24, 48, back.dark);
      for (const y of [-27, -12, 3]) {
        p.hline(4, y, 24, back.deep);
      }
      for (const y of [-14, 1, 16]) {
        p.rect(3, y, 26, 2, wood.light);
        p.hline(3, y + 2, 26, wood.dark);
      }
      const R = [terracotta, navy, mustard, sage, cream, walnut, teal];
      const pick = (i: number) => R[(i * 3 + seed) % R.length];
      books(p, 5, -14, [[3, 11, pick(0)], [2, 9, pick(1)], [3, 10, pick(2)], [2, 11, pick(3)]]);
      sprig(p, 19, -14, seed % 2 ? terracotta : cream, seed);
      flatBook(p, 6, -4, 12, pick(4));
      flatBook(p, 7, -7, 10, pick(5));
      mug(p, 21, -5, pick(6));
      books(p, 5, 16, [[3, 10, pick(7)], [3, 11, pick(8)], [2, 9, pick(9)], [3, 10, pick(10)], [2, 11, pick(11)], [3, 9, pick(12)]]);
      p.line(22, 16, 25, 7, mat(pick(13)).base);
      p.line(23, 16, 26, 7, mat(pick(13)).light);
      vine(p, 21, -12, 10, 1);
      p.rect(4, 19, 24, 9, wood.base);
      p.hline(4, 19, 24, wood.light);
      p.px(16, 23, brass.hi);
      p.hline(2, 29, 28, wood.line);
    });
    return makeVariant({ w: 1, h: 1, parts, spots: [stand(0, 1, 'up', 'read')], shadows: [shadow(1, 24, 30, 7, 'rect')] });
  };
}

for (const [id, name, wood, back, seed] of [
  ['bookcase.narrow.oak', 'Narrow bookcase (oak)', mat(oak), mat(walnut), 2],
  ['bookcase.narrow.white', 'Narrow bookcase (white)', mat(cream), mat(sage), 5],
] as const) {
  defineAsset({
    id,
    name,
    group: 'bookcase.narrow',
    category: 'Lounge',
    layer: 'object',
    placement: 'wall',
    facings: ['down'],
    keywords: ['bookshelf', 'bookcase', 'books', 'narrow', 'read', 'library'],
    build: narrowBookcase(wood, back, seed),
  });
}

// =========================================================================================================
// Grandfather clock (1 x 1, tall): the pendulum swings

defineAsset({
  id: 'clock.grandfather',
  name: 'Grandfather clock',
  group: 'clock.tall',
  category: 'Decor',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['clock', 'grandfather', 'pendulum', 'antique', 'time'],
  build() {
    const wood = mat(walnut);
    const N = 4;
    const frames = animFrames(N, (f) =>
      single(area(1, 1, 48), 32, (p) => {
        box(p, 6, 4, 20, 4, 26, wood);
        p.rect(9, 12, 14, 12, wood.dark);
        p.rect(10, 13, 12, 10, wood.base);
        box(p, 8, -20, 16, 3, 25, wood);
        // glazed waist door with the swinging pendulum
        p.rect(11, -16, 10, 19, wood.deep);
        const swing = [-2, 0, 2, 0][f];
        p.line(16, -16, 16 + swing, -2, brass.dark);
        p.disc(14 + swing, -3, 5, brass.base);
        p.px(15 + swing, -2, brass.hi);
        glassStreak(p, 12, -13, 3);
        // hood with the dial, crown and finials
        box(p, 5, -40, 22, 4, 20, wood);
        p.disc(9, -34, 14, brass.base);
        p.disc(10, -33, 12, cream[6]);
        p.px(16, -32, charcoal[1]);
        p.vline(16, -31, 4, charcoal[1]);
        p.line(16, -27, 19, -29, charcoal[1]);
        for (const [x, y] of [[16, -33], [21, -27], [16, -22], [11, -27]] as const) {
          p.px(x, y, charcoal[3]);
        }
        p.rect(4, -43, 24, 3, wood.light);
        p.hline(4, -43, 24, wood.hi);
        p.frame(4, -43, 24, 3, wood.line);
        p.rect(15, -46, 2, 3, brass.base);
        p.px(15, -46, brass.hi);
      }),
    );
    return makeVariant({ w: 1, h: 1, frames, anim: { kind: 'loop', fps: 2 }, shadows: [shadow(5, 25, 22, 6, 'rect')] });
  },
});

// =========================================================================================================
// Wingback armchairs (join 'armchair': same seat and mask)

function wingback(f: Mat, frame: Mat): (facing: Dir) => Variant {
  const build = (facing: Dir): Variant => {
    if (facing === 'right') {
      return mirrorVariant(build('left'));
    }
    const legs = (p: Pen, y: number) => {
      for (const x of [4, 26]) {
        p.rect(x, y, 2, 3, walnut[3]);
        p.px(x + 1, y + 2, walnut[1]);
      }
    };
    const parts = layered(area(1, 1, 30), (L) => {
      const p = L(Z_SEAT);
      if (facing === 'down') {
        cushion(p, 3, -16, 26, 4, 24, frame, 3);
        cushion(p, 8, -11, 16, 3, 18, f, 3);
        for (const x of [12, 16, 20]) {
          p.px(x, -4, f.dark);
        }
        cushion(p, 1, -10, 7, 4, 14, f, 3);
        cushion(p, 24, -10, 7, 4, 14, f, 3);
        box(p, 5, 21, 22, 2, 6, frame, { edge: 'line' });
        cushion(p, 7, 7, 18, 11, 5, f, 2);
        cushion(p, 0, 3, 7, 6, 19, f, 3);
        cushion(p, 25, 3, 7, 6, 19, f, 3);
        p.hline(2, 5, 3, f.hi);
        legs(p, 28);
      } else if (facing === 'up') {
        cushion(p, 0, -6, 7, 6, 18, f, 3);
        cushion(p, 25, -6, 7, 6, 18, f, 3);
        cushion(p, 7, -2, 18, 10, 4, f, 2);
        const b = L(Z_FRONT);
        cushion(b, 1, -4, 30, 5, 30, frame, 3);
        b.rect(0, -2, 3, 10, frame.base);
        b.rect(29, -2, 3, 10, frame.dark);
        b.hline(4, 2, 24, frame.light);
        b.hline(3, 27, 26, frame.deep);
        legs(b, 29);
      } else {
        cushion(p, 22, -18, 9, 26, 24, frame, 3);
        cushion(p, 19, -10, 5, 20, 14, f, 2);
        cushion(p, 2, -10, 22, 7, 13, f, 3);
        box(p, 4, 18, 18, 2, 8, frame, { edge: 'line' });
        cushion(p, 4, 1, 17, 17, 5, f, 2);
        const front = L(Z_FRONT);
        cushion(front, 2, 12, 22, 7, 11, f, 3);
        front.rect(4, 29, 2, 2, walnut[3]);
        front.rect(26, 29, 2, 2, walnut[3]);
      }
    });
    return makeVariant({ w: 1, h: 1, mask: ['s'], spots: [seat(facing)], parts, shadows: [shadow(1, 21, 29, 10, 'rect')] });
  };
  return build;
}

for (const [id, name, ramp] of [
  ['armchair.wingback.navy', 'Wingback armchair (navy)', navy],
  ['armchair.wingback.terracotta', 'Wingback armchair (terracotta)', terracotta],
] as const) {
  defineAsset({
    id,
    name,
    group: 'armchair',
    category: 'Lounge',
    layer: 'object',
    placement: 'free',
    facings: ALL,
    keywords: ['armchair', 'wingback', 'chair', 'seat', 'reading', 'lounge'],
    build: wingback(mat(ramp), mat(ramp, 1)),
  });
}

// =========================================================================================================
// Side table with a lamp (joins 'table.side')

defineAsset({
  id: 'table.side.lamp',
  name: 'Side table with lamp',
  group: 'table.side',
  category: 'Lounge',
  layer: 'object',
  placement: 'corner',
  facings: ['down'],
  keywords: ['table', 'side table', 'lamp', 'light', 'end table', 'lounge'],
  build() {
    const wood = mat(walnut);
    const shadeM = mat(cream);
    const parts = single(area(1, 1, 36), 24, (p) => {
      leg(p, 7, 14, 15, wood, 2);
      leg(p, 23, 14, 15, wood, 2);
      p.rect(8, 22, 16, 2, wood.base);
      p.hline(8, 22, 16, wood.light);
      flatBook(p, 10, 18, 11, sage);
      box(p, 5, 6, 22, 8, 5, wood);
      p.hline(13, 16, 6, brass.hi);
      // ceramic base and a pleated shade
      cylinder(p, 12, -4, 8, 11, mat(teal), 3);
      p.vline(16, -9, 5, brass.dark);
      for (let i = 0; i < 12; i++) {
        const inset = Math.round(((11 - i) / 11) * 3);
        const y = -21 + i;
        p.hline(8 + inset, y, 16 - inset * 2, i === 11 ? lightWarm[1] : shadeM.light);
        p.px(8 + inset, y, shadeM.lineLit);
        p.px(23 - inset, y, shadeM.line);
        if (i > 0 && i < 11) {
          p.px(19 - Math.round(inset / 2), y, shadeM.base);
        }
      }
      p.hline(11, -21, 10, shadeM.line);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(6, 22, 20, 8)], lights: [warmLight(16, -12, 70, 0.5)] });
  },
});

// =========================================================================================================
// Knitted pouf (1 x 1 seat, the same from every side)

function pouf(ramp: Ramp): (facing: Dir) => Variant {
  return (facing) => {
    const m = mat(ramp);
    const parts = single(area(1, 1, 16), Z_SEAT, (p) => {
      cushion(p, 4, 8, 24, 10, 10, m, 3);
      for (let x = 7; x < 26; x += 3) {
        p.vline(x, 19, 7, m.dark);
      }
      p.ellipse(9, 10, 14, 6, m.base);
      p.ellipse(11, 11, 10, 4, m.light);
      p.px(16, 13, m.dark);
      p.hline(7, 9, 5, m.hi);
    });
    return makeVariant({ w: 1, h: 1, mask: ['s'], spots: [seat(facing)], parts, shadows: [shadow(3, 22, 26, 8)] });
  };
}

for (const [id, name, ramp] of [
  ['pouf.terracotta', 'Knitted pouf (terracotta)', terracotta],
  ['pouf.sage', 'Knitted pouf (sage)', sage],
] as const) {
  defineAsset({
    id,
    name,
    group: 'pouf',
    category: 'Lounge',
    layer: 'object',
    placement: 'free',
    facings: ALL,
    keywords: ['pouf', 'ottoman', 'footstool', 'seat', 'knitted', 'lounge'],
    build: pouf(ramp),
  });
}

// =========================================================================================================
// Hotel luggage cart (1 x 1)

defineAsset({
  id: 'cart.luggage',
  name: 'Luggage cart',
  group: 'cart.luggage',
  category: 'Decor',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['luggage', 'cart', 'hotel', 'suitcase', 'bellhop', 'brass'],
  build() {
    const parts = single(area(1, 1, 44), 28, (p) => {
      // brass uprights and the hanging arch
      for (const x of [4, 26]) {
        p.rect(x, -30, 2, 48, brass.base);
        p.vline(x, -30, 48, brass.hi);
      }
      for (let x = 5; x < 27; x++) {
        const t = (x - 15.5) / 11;
        p.px(x, -34 + Math.round(t * t * 4), brass.light);
        p.px(x, -33 + Math.round(t * t * 4), brass.dark);
      }
      p.hline(6, -22, 20, brass.dark);
      // suitcases: tall navy, leather on top, small sage
      box(p, 7, -6, 11, 4, 18, mat(navy), { round: 1 });
      p.rect(10, -8, 5, 2, charcoal[1]);
      p.vline(12, 0, 10, mat(navy).dark);
      box(p, 17, 2, 9, 4, 10, mat(terracotta, 1), { round: 1 });
      p.rect(20, 0, 3, 2, charcoal[1]);
      p.hline(17, 9, 9, mustard[4]);
      box(p, 9, -14, 9, 3, 6, mat(sage), { round: 1 });
      p.rect(12, -15, 3, 1, charcoal[1]);
      // carpeted deck and casters
      box(p, 2, 14, 28, 5, 5, mat(terracotta), { round: 1 });
      p.hline(2, 19, 28, brass.light);
      wheel(p, 3, 24);
      wheel(p, 25, 24);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(2, 20, 28, 9, 'rect')] });
  },
});

// =========================================================================================================
// Mall bench: oak slats on charcoal blocks, backless (2 x 1)

function mallBench(facing: Dir): Variant {
  if (facing === 'right') {
    return mirrorVariant(mallBench('left'));
  }
  const wood = mat(oak);
  const block = mat(charcoal);
  if (facing === 'left') {
    const parts = single(area(1, 2, 16), Z_SEAT, (p) => {
      box(p, 8, 10, 16, 3, 14, block);
      box(p, 8, 46, 16, 3, 14, block);
      box(p, 5, 0, 22, 50, 4, wood, { round: 1 });
      for (const x of [11, 17]) {
        p.vline(x, 1, 48, wood.base);
      }
    });
    return makeVariant({
      w: 1,
      h: 2,
      mask: ['s', 's'],
      spots: [seat('left', 0, 0, 0, -4), seat('left', 0, 1, 0, -4)],
      parts,
      shadows: [shadow(5, 4, 22, 56, 'rect')],
    });
  }
  const parts = single(area(2, 1, 16), Z_SEAT, (p) => {
    box(p, 6, 16, 8, 3, 12, block);
    box(p, 50, 16, 8, 3, 12, block);
    box(p, 1, 4, 62, 12, 4, wood, { round: 1 });
    for (const y of [8, 12]) {
      p.hline(2, y, 60, wood.base);
    }
    grain(p, 3, 5, 58, 10, wood.base, 77);
  });
  return makeVariant({
    w: 2,
    h: 1,
    mask: ['ss'],
    spots: [seat(facing, 0, 0), seat(facing, 1, 0)],
    parts,
    shadows: [shadow(1, 18, 62, 11, 'rect')],
  });
}

defineAsset({
  id: 'bench.mall',
  name: 'Mall bench',
  group: 'bench.mall',
  category: 'Lounge',
  layer: 'object',
  placement: 'free',
  facings: ALL,
  keywords: ['bench', 'mall', 'seat', 'waiting', 'lobby', 'backless'],
  build: mallBench,
});

// =========================================================================================================
// Olive tree in a concrete cube planter (joins 'plant.tall')

defineAsset({
  id: 'plant.tall.olive',
  name: 'Olive tree (cube planter)',
  group: 'plant.tall',
  category: 'Decor',
  layer: 'object',
  placement: 'corner',
  facings: ['down'],
  keywords: ['plant', 'olive', 'tree', 'planter', 'mall', 'hotel', 'green'],
  build() {
    const parts = single(area(1, 1, 52, 10), 24, (p) => {
      const t = mat(walnut);
      p.rect(15, 0, 3, 12, t.base);
      p.vline(17, 0, 12, t.dark);
      p.line(15, 2, 11, -12, t.base);
      p.line(15, 0, 20, -14, t.base);
      p.line(16, 0, 21, -14, t.dark);
      foliage(p, 16, -20, 14, 11, sage, 21, 7);
      foliage(p, 10, -14, 7, 5, sage, 24, 5);
      foliage(p, 22, -28, 8, 6, sage, 23, 6);
      for (const [x, y] of [[9, -16], [20, -27], [25, -18], [14, -24], [18, -12]] as const) {
        p.px(x, y, navy[2]);
      }
      selOut(p.canvas);
      box(p, 7, 8, 18, 5, 19, mat(paving));
      p.rect(9, 9, 14, 3, dirt[1]);
      p.hline(8, 14, 6, paving[5]);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(6, 26, 20, 5, 'rect')] });
  },
});

// =========================================================================================================
// Coffee cart with a striped awning (2 x 1)

defineAsset({
  id: 'kiosk.coffee',
  name: 'Coffee cart',
  group: 'kiosk.coffee',
  category: 'Kitchen',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['coffee', 'cart', 'kiosk', 'barista', 'mall', 'market', 'stall'],
  build() {
    const body = mat(sage);
    const parts = single(area(2, 1, 52, 6), 32, (p) => {
      for (const x of [4, 58]) {
        p.rect(x, -40, 2, 38, steel[4]);
        p.vline(x + 1, -40, 38, steel[2]);
      }
      box(p, 2, -4, 60, 10, 20, body, { round: 1 });
      p.rect(8, 9, 30, 8, cream[6]);
      p.frame(8, 9, 30, 8, body.line);
      pixelText(p, 'COFFEE', 11, 11, terracotta[2]);
      p.rect(44, 9, 12, 8, body.dark);
      p.hline(44, 9, 12, body.deep);
      wheel(p, 6, 23, 7);
      wheel(p, 50, 23, 7);
      // espresso machine, cups and a jar on the worktop
      box(p, 8, -16, 18, 4, 12, chrome, { round: 1 });
      p.rect(12, -8, 8, 2, chrome.dark);
      p.rect(14, -6, 3, 2, cream[6]);
      p.rect(19, -6, 5, 1, walnut[3]);
      for (let i = 0; i < 3; i++) {
        p.rect(32 + i * 6, -6, 4, 4, i === 1 ? terracotta[4] : cream[6]);
        p.vline(35 + i * 6, -6, 4, cream[3]);
      }
      p.rect(51, -10, 6, 8, water[5]);
      p.rect(51, -6, 6, 4, walnut[2]);
      p.px(52, -9, glassGlint);
      // striped awning with a scalloped valance
      for (let x = 0; x < 64; x++) {
        const stripe = Math.floor(x / 8) % 2 === 0;
        const top = -52 + Math.round(Math.abs(x - 31.5) / 16);
        for (let y = top; y < -42; y++) {
          p.px(x, y, stripe ? terracotta[4] : cream[5]);
        }
        p.px(x, top, stripe ? terracotta[5] : cream[6]);
        const scallop = (x % 8) === 0 || (x % 8) === 7 ? 0 : (x % 8) === 1 || (x % 8) === 6 ? 1 : 2;
        for (let y = -42; y < -42 + scallop + 1; y++) {
          p.px(x, y, stripe ? terracotta[3] : cream[4]);
        }
      }
      p.hline(0, -42, 64, terracotta[2]);
    });
    return makeVariant({
      w: 2,
      h: 1,
      parts,
      spots: [stand(0, 1, 'up', 'coffee', 16)],
      shadows: [shadow(0, 20, 64, 10, 'rect')],
      lights: [warmLight(32, -14, 50, 0.32)],
    });
  },
});

// =========================================================================================================
// Glass-door drinks fridge (joins 'fridge')

defineAsset({
  id: 'fridge.drinks',
  name: 'Drinks fridge',
  group: 'fridge',
  category: 'Kitchen',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['fridge', 'drinks', 'soda', 'cooler', 'glass door', 'snack'],
  build() {
    const body = mat(steel);
    const parts = single(area(1, 1, 40), 32, (p) => {
      box(p, 2, -34, 28, 5, 59, body, { round: 1 });
      p.rect(5, -28, 22, 5, terracotta[3]);
      p.hline(5, -28, 22, terracotta[4]);
      pixelText(p, 'COLD', 8, -28, cream[6]);
      p.rect(5, -21, 22, 42, screenGlow[1]);
      p.frame(5, -21, 22, 42, body.line);
      const cans: Ramp[] = [terracotta, sage, mustard, navy, teal, cream];
      for (let row = 0; row < 4; row++) {
        const y = -10 + row * 10;
        p.hline(6, y, 20, steel[3]);
        for (let i = 0; i < 5; i++) {
          const m = mat(cans[(row * 2 + i) % cans.length]);
          if (row % 2) {
            bottle(p, 7 + i * 4, y, 8, cans[(row + i) % cans.length], null);
          } else {
            p.rect(7 + i * 4, y - 5, 3, 5, m.base);
            p.vline(7 + i * 4, y - 5, 5, m.light);
            p.hline(7 + i * 4, y - 5, 3, steel[5]);
          }
        }
      }
      glassStreak(p, 8, -16, 8);
      p.rect(24, -12, 2, 14, steel[5]);
      p.vline(25, -12, 14, steel[2]);
      p.rect(5, 22, 22, 3, body.dark);
      for (let x = 6; x < 26; x += 2) {
        p.px(x, 23, body.line);
      }
    });
    return makeVariant({
      w: 1,
      h: 1,
      parts,
      spots: [stand(0, 1, 'up', 'snack')],
      shadows: [shadow(1, 25, 30, 6, 'rect')],
      lights: [screenLight(16, -2, 30, 0.3)],
    });
  },
});

// =========================================================================================================
// Patio table under a parasol (1 x 1)

function parasolTable(ramp: Ramp): () => Variant {
  return () => {
    const cloth = mat(ramp);
    const parts = single(area(1, 1, 60, 12), 32, (p) => {
      p.rect(15, 18, 3, 9, iron.base);
      p.vline(15, 18, 9, iron.light);
      p.ellipse(8, 26, 17, 4, iron.line);
      p.ellipse(9, 26, 15, 3, iron.base);
      cylinder(p, 3, 4, 26, 15, mat(cream), 12);
      p.hline(7, 6, 8, cream[6]);
      // pole through the table and the canopy
      p.rect(15, -34, 2, 44, cream[3]);
      p.vline(15, -34, 44, cream[5]);
      const cx = 16;
      for (let y = -50; y < -32; y++) {
        const t = (y + 50) / 18;
        const half = Math.round(6 + t * 18);
        for (let x = cx - half; x < cx + half; x++) {
          const seg = Math.floor(((x - cx) / Math.max(1, half)) * 3 + 3);
          const c = seg % 2 === 0 ? cloth.light : cream[5];
          p.px(x, y, y === -50 ? cloth.hi : y >= -34 ? (seg % 2 === 0 ? cloth.base : cream[4]) : c);
        }
        p.px(cx - half, y, cloth.lineLit);
        p.px(cx + half - 1, y, cloth.line);
      }
      for (let x = cx - 24; x < cx + 24; x++) {
        if ((x - cx + 24) % 6 < 3) {
          p.px(x, -32, cloth.dark);
        }
      }
      p.hline(cx - 24, -33, 48, cloth.line);
      p.rect(15, -53, 2, 3, cream[6]);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(-8, 6, 44, 24)] });
  };
}

for (const [id, name, ramp] of [
  ['table.parasol.terracotta', 'Parasol table (terracotta)', terracotta],
  ['table.parasol.sage', 'Parasol table (sage)', sage],
] as const) {
  defineAsset({
    id,
    name,
    group: 'table.parasol',
    category: 'Outdoor',
    layer: 'object',
    placement: 'free',
    facings: ['down'],
    keywords: ['parasol', 'umbrella', 'patio', 'table', 'terrace', 'garden', 'outdoor'],
    build: parasolTable(ramp),
  });
}

// =========================================================================================================
// Food truck (3 x 2): serving hatch on the near side

defineAsset({
  id: 'foodtruck',
  name: 'Food truck',
  group: 'foodtruck',
  category: 'Outdoor',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['food truck', 'street food', 'snack', 'van', 'lunch', 'market'],
  build() {
    const body = mat(mustard);
    const parts = single(area(3, 2, 40, 6), 64, (p) => {
      // roof, side wall and the cab at the east end
      box(p, 2, -24, 92, 36, 44, body, { round: 2 });
      p.rect(4, -22, 88, 32, cream[5]);
      p.hline(4, -22, 88, cream[6]);
      p.rect(20, -14, 14, 10, steel[4]);
      p.frame(20, -14, 14, 10, steel[2]);
      p.hline(21, -11, 12, steel[3]);
      // roof sign
      box(p, 34, -34, 34, 3, 9, mat(terracotta), { round: 1 });
      pixelText(p, 'SNACKS', 39, -30, cream[6]);
      p.rect(4, 32, 88, 4, terracotta[3]);
      p.hline(4, 32, 88, terracotta[4]);
      // serving hatch: warm interior, menu, counter shelf, propped awning
      p.rect(14, 16, 46, 16, walnut[1]);
      p.rect(14, 16, 46, 4, lightWarm[0]);
      p.rect(18, 20, 14, 9, charcoal[1]);
      for (let i = 0; i < 3; i++) {
        p.hline(20, 22 + i * 2, 8, cream[4]);
      }
      p.rect(36, 21, 6, 8, steel[3]);
      p.rect(46, 22, 10, 7, walnut[2]);
      p.rect(12, 32, 50, 3, chrome.light);
      p.hline(12, 34, 50, chrome.line);
      p.rect(16, 29, 3, 3, red[2]);
      p.rect(20, 29, 3, 3, mustard[4]);
      for (let i = 0; i < 3; i++) {
        p.rect(48 + i * 4, 29, 3, 3, cream[6]);
      }
      for (let x = 10; x < 64; x++) {
        const stripe = Math.floor(x / 6) % 2 === 0;
        p.vline(x, 9, 6, stripe ? terracotta[4] : cream[6]);
      }
      p.hline(10, 9, 54, terracotta[2]);
      p.hline(10, 15, 54, terracotta[2]);
      // cab window and door
      p.rect(70, 14, 18, 12, water[4]);
      p.rect(70, 14, 18, 4, water[5]);
      p.frame(70, 14, 18, 12, body.line);
      glassStreak(p, 73, 16, 6);
      p.rect(69, 13, 1, 30, body.dark);
      p.hline(78, 30, 6, body.dark);
      p.rect(90, 30, 3, 4, lightWarm[1]);
      // wheels
      for (const x of [14, 70]) {
        p.rect(x - 1, 44, 16, 6, body.dark);
        p.disc(x, 46, 14, charcoal[1]);
        p.disc(x + 3, 49, 8, steel[3]);
        p.px(x + 6, 52, steel[5]);
      }
      p.hline(4, 50, 88, body.deep);
    });
    return makeVariant({
      w: 3,
      h: 2,
      parts,
      spots: [stand(1, 2, 'up', 'snack', 4)],
      shadows: [shadow(2, 34, 92, 28, 'rect')],
      lights: [warmLight(38, 26, 64, 0.45)],
    });
  },
});

// =========================================================================================================
// String-light poles (3 x 1): festoon bulbs sag between two posts

defineAsset({
  id: 'lights.string',
  name: 'String-light poles',
  group: 'lights.string',
  category: 'Outdoor',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['string lights', 'festoon', 'bulbs', 'patio', 'garden', 'party', 'light'],
  build() {
    const wood = mat(walnut);
    const parts = single(area(3, 1, 64), 32, (p) => {
      for (const x of [15, 79]) {
        leg(p, x, -58, 82, wood, 3);
        box(p, x - 4, 20, 11, 4, 6, mat(paving));
        p.rect(x - 1, -60, 5, 2, iron.base);
      }
      const bulbs: [number, number][] = [];
      for (let x = 18; x < 80; x++) {
        const t = (x - 48.5) / 31;
        const y = -56 + Math.round((1 - t * t) * 12);
        p.px(x, y, iron.line);
        if ((x - 18) % 7 === 4) {
          bulbs.push([x, y]);
        }
      }
      for (const [x, y] of bulbs) {
        p.px(x, y + 1, iron.base);
        p.rect(x - 1, y + 2, 3, 3, lightWarm[1]);
        p.px(x, y + 2, cream[6]);
        p.px(x, y + 5, lightWarm[0]);
      }
    });
    return makeVariant({
      w: 3,
      h: 1,
      mask: ['#.#'],
      parts,
      shadows: [shadow(12, 22, 10, 5), shadow(76, 22, 10, 5)],
      lights: [22, 40, 58, 74].map((x) => ({ x, y: -46, radius: 34, color: lightWarm[1], intensity: 0.45, nightOnly: true })),
    });
  },
});

// =========================================================================================================
// Popcorn cart (1 x 1): kernels pop in the glass kettle box

defineAsset({
  id: 'popcorn.machine',
  name: 'Popcorn cart',
  group: 'popcorn',
  category: 'Kitchen',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['popcorn', 'cinema', 'snack', 'cart', 'movie', 'drive-in'],
  build() {
    const cart = mat(terracotta);
    const N = 4;
    const frames = animFrames(N, (f) =>
      single(area(1, 1, 44), 32, (p) => {
        box(p, 3, 2, 26, 6, 20, cart, { round: 1 });
        p.rect(6, 12, 20, 6, cream[6]);
        p.frame(6, 12, 20, 6, cart.line);
        for (let x = 7; x < 25; x += 4) {
          p.rect(x, 13, 2, 4, red[1]);
        }
        wheel(p, 4, 24, 6);
        wheel(p, 22, 24, 6);
        // glass box: posts, popcorn heap, kettle, popping kernels
        p.rect(4, -26, 24, 28, cart.line);
        p.rect(6, -24, 20, 26, lightWarm[1]);
        p.rect(6, -24, 20, 3, cream[6]);
        for (let i = 0; i < 40; i++) {
          const x = 6 + ((i * 7) % 20);
          const y = -6 + ((i * 5) % 8);
          p.px(x, y, i % 3 ? cream[6] : mustard[4]);
        }
        p.rect(6, 0, 20, 2, cream[6]);
        p.rect(12, -18, 8, 5, steel[4]);
        p.hline(12, -18, 8, steel[5]);
        p.vline(16, -24, 6, steel[3]);
        for (let k = 0; k < 5; k++) {
          const t = (f + k * 2) % 7;
          p.px(10 + ((k * 5) % 14), -13 + t, cream[6]);
        }
        glassStreak(p, 8, -20, 5);
        p.vline(4, -26, 28, cart.base);
        p.vline(27, -26, 28, cart.dark);
        box(p, 2, -33, 28, 3, 6, cart, { round: 1 });
        pixelText(p, 'POP', 11, -31, cream[6]);
      }),
    );
    return makeVariant({
      w: 1,
      h: 1,
      frames,
      anim: { kind: 'loop', fps: 4 },
      spots: [stand(0, 1, 'up', 'snack')],
      shadows: [shadow(3, 24, 26, 6, 'rect')],
      lights: [warmLight(16, -12, 34, 0.35)],
    });
  },
});

// =========================================================================================================
// Canteen: serving line modules (2 x 1). Staff stand behind (north), the queue in front (south).

/** Stainless counter body: worktop -4..8, brushed doors, kick; `cladding` paints the customer-facing front. */
function steelCounter(p: Pen, w: number, cladding: Mat | null = null): void {
  const front = cladding ?? chrome;
  p.rect(0, 8, w, 20, front.base);
  p.vline(0, 8, 20, front.lineLit);
  p.vline(w - 1, 8, 20, front.line);
  p.vline(w - 2, 9, 19, front.dark);
  p.hline(1, 8, w - 2, front.deep);
  if (!cladding) {
    for (let x = 4; x < w - 4; x += 16) {
      p.frame(x, 11, 12, 15, chrome.dark);
      p.hline(x + 1, 12, 10, chrome.light);
      p.rect(x + 9, 17, 1, 4, chrome.hi);
    }
  } else {
    for (let x = 4; x < w - 2; x += 5) {
      p.vline(x, 10, 16, cladding.dark);
    }
  }
  p.rect(0, 28, w, 2, iron.base);
  p.hline(0, 30, w, iron.line);
  box(p, 0, -4, w, 10, 2, chrome, { round: 1 });
}

/** A gastronorm tray set into the counter: steel rim and its food. */
function foodTray(p: Pen, x: number, y: number, w: number, food: Ramp, seed: number): void {
  const m = mat(food);
  p.rect(x, y, w, 7, chrome.line);
  p.rect(x + 1, y + 1, w - 2, 5, m.base);
  p.hline(x + 1, y + 1, w - 2, m.light);
  for (let i = 0; i < w - 3; i += 2) {
    const yy = y + 2 + ((i * 7 + seed) % 3);
    p.px(x + 1 + i, yy, (i + seed) % 3 ? m.hi : m.dark);
  }
}

function servingLine(trays: [Ramp, number][], hot: boolean): () => Variant {
  return () => {
    const clad = mat(oak);
    const parts = single(area(2, 1, 40), 32, (p) => {
      steelCounter(p, 64, clad);
      // tray slide on brackets
      for (const x of [8, 32, 56]) {
        p.rect(x, 12, 1, 3, chrome.dark);
      }
      p.hline(0, 10, 64, chrome.hi);
      p.hline(0, 11, 64, chrome.base);
      p.hline(0, 12, 64, chrome.line);
      trays.forEach(([food, seed], i) => foodTray(p, 3 + i * 15, -3, 13, food, seed));
      // sneeze guard: posts, glass top shelf, glints
      for (const x of [2, 31, 60]) {
        p.rect(x, -20, 2, 18, chrome.light);
        p.vline(x + 1, -20, 18, chrome.dark);
      }
      p.rect(1, -22, 62, 3, chrome.light);
      p.hline(1, -22, 62, chrome.hi);
      p.hline(1, -20, 62, chrome.line);
      glassStreak(p, 8, -17, 5);
      glassStreak(p, 40, -17, 5);
      if (hot) {
        p.rect(3, -28, 58, 4, iron.base);
        p.hline(3, -28, 58, iron.light);
        p.hline(4, -24, 56, lightWarm[0]);
        for (const x of [10, 30, 50]) {
          p.rect(x, -25, 4, 1, lightWarm[1]);
        }
        for (const x of [12, 42]) {
          p.px(x, -8, cream[6]);
          p.px(x + 1, -10, cream[5]);
          p.px(x, -12, cream[6]);
        }
      } else {
        for (const x of [14, 46]) {
          p.px(x, -6, water[5]);
          p.px(x + 2, -5, glassGlint);
        }
      }
    });
    return makeVariant({
      w: 2,
      h: 1,
      parts,
      spots: [stand(0, -1, 'down', 'serve', 16), stand(0, 1, 'up', 'queue', 16)],
      shadows: [shadow(0, 24, 64, 7, 'rect')],
      lights: hot ? [warmLight(32, -16, 50, 0.4)] : [],
    });
  };
}

defineAsset({
  id: 'canteen.line.hot',
  name: 'Serving line (hot food)',
  group: 'canteen.line',
  category: 'Kitchen',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['canteen', 'serving', 'bain-marie', 'hot food', 'buffet', 'counter', 'cafeteria', 'lunch'],
  build: servingLine([[terracotta, 1], [mustard, 2], [sage, 3], [cream, 4]], true),
});

defineAsset({
  id: 'canteen.line.salad',
  name: 'Serving line (salad bar)',
  group: 'canteen.line',
  category: 'Kitchen',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['canteen', 'salad bar', 'cold', 'buffet', 'counter', 'cafeteria', 'lunch'],
  build: servingLine([[plant, 5], [red, 6], [mustard, 7], [sage, 8]], false),
});

defineAsset({
  id: 'canteen.trays',
  name: 'Tray and cutlery station',
  group: 'canteen.trays',
  category: 'Kitchen',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['canteen', 'trays', 'cutlery', 'napkins', 'cafeteria', 'station'],
  build() {
    const parts = single(area(1, 1, 30), 32, (p) => {
      steelCounter(p, 32, mat(oak));
      p.hline(0, 10, 32, chrome.hi);
      p.hline(0, 11, 32, chrome.base);
      p.hline(0, 12, 32, chrome.line);
      for (let i = 0; i < 5; i++) {
        const m = mat(i % 2 ? teal : charcoal);
        p.rect(3, -3 - i * 2, 14, 2, m.base);
        p.hline(3, -3 - i * 2, 14, m.light);
      }
      p.hline(3, -2, 14, teal[0]);
      // cutlery cups bristling with handles, a napkin box
      for (const x of [19, 24]) {
        p.rect(x, -6, 4, 6, chrome.base);
        p.vline(x, -6, 6, chrome.light);
        for (let k = 0; k < 3; k++) {
          p.vline(x + k + (k === 2 ? 0 : 0), -10 + (k % 2), 4, steel[5]);
        }
      }
      p.rect(19, 1, 9, 4, cream[6]);
      p.frame(19, 1, 9, 4, cream[3]);
      p.rect(22, 0, 3, 1, cream[6]);
    });
    return makeVariant({ w: 1, h: 1, parts, spots: [stand(0, 1, 'up', 'queue')], shadows: [shadow(-2, 26, 32, 6, 'rect')] });
  },
});

// =========================================================================================================
// Canteen table with two benches (3 x 3): rows of diners face each other

defineAsset({
  id: 'table.dining.canteen',
  name: 'Canteen table with benches',
  group: 'table.dining.canteen',
  category: 'Kitchen',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['canteen', 'table', 'bench', 'dining', 'eat', 'lunch', 'cafeteria', 'long table'],
  build() {
    const wood = mat(oak);
    const legM = mat(steel, 1);
    const parts = layered(area(3, 3, 16), (L) => {
      const north = L(Z_SEAT);
      for (const x of [8, 86]) {
        leg(north, x, 21, 9, legM, 2);
      }
      box(north, 2, 13, 92, 6, 4, wood, { round: 1 });
      const table = L(64);
      for (const x of [6, 88]) {
        leg(table, x, 54, 8, legM, 3);
      }
      table.hline(9, 55, 78, legM.dark);
      box(table, 0, 30, 96, 22, 4, wood, { round: 1 });
      grain(table, 2, 32, 92, 18, wood.base, 91);
      // trays with plates and a water jug
      for (const [x, y, food] of [[10, 33, terracotta], [42, 42, mustard], [74, 34, sage]] as const) {
        table.rect(x, y, 14, 9, teal[2]);
        table.hline(x, y, 14, teal[3]);
        table.ellipse(x + 2, y + 1, 9, 6, cream[6]);
        table.rect(x + 4, y + 2, 5, 3, mat(food).base);
        table.vline(x + 12, y + 2, 5, steel[5]);
      }
      table.rect(30, 34, 5, 7, water[5]);
      table.frame(30, 34, 5, 7, water[3]);
      table.px(31, 35, glassGlint);
      const south = L(84);
      for (const x of [8, 86]) {
        south.rect(x, 80, 2, 14, legM.base);
        south.vline(x + 1, 80, 14, legM.line);
      }
      box(south, 2, 72, 92, 6, 4, wood, { round: 1 });
    });
    const down = [0, 1, 2].map((i) => seat('down', i, 0, 0, 6));
    const up = [0, 1, 2].map((i) => seat('up', i, 2, 0, -4));
    return makeVariant({
      w: 3,
      h: 3,
      mask: ['sss', '###', 'sss'],
      spots: [...down, ...up],
      parts,
      shadows: [shadow(2, 16, 92, 8, 'rect'), shadow(0, 46, 96, 14, 'rect'), shadow(2, 76, 92, 8, 'rect')],
    });
  },
});

// =========================================================================================================
// Dish-return trolley (1 x 1)

defineAsset({
  id: 'trolley.dishreturn',
  name: 'Dish-return trolley',
  group: 'trolley.dishes',
  category: 'Kitchen',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['trolley', 'dishes', 'tray return', 'canteen', 'cart', 'dirty dishes'],
  build() {
    const parts = single(area(1, 1, 40), 32, (p) => {
      for (const x of [3, 27]) {
        p.rect(x, -30, 2, 54, chrome.light);
        p.vline(x + 1, -30, 54, chrome.dark);
      }
      for (let i = 0; i < 4; i++) {
        const y = -26 + i * 12;
        p.hline(5, y + 6, 22, chrome.line);
        p.rect(6, y + 3, 20, 3, i % 2 ? teal[2] : charcoal[2]);
        p.hline(6, y + 3, 20, i % 2 ? teal[3] : charcoal[3]);
        if (i < 3) {
          p.ellipse(8, y + 1, 8, 4, cream[6]);
          p.rect(10, y + 2, 3, 1, mat(i ? terracotta : mustard).dark);
          p.rect(17, y, 5, 4, water[5]);
          p.px(18, y, glassGlint);
        }
      }
      p.hline(3, -30, 26, chrome.hi);
      wheel(p, 3, 24);
      wheel(p, 25, 24);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(2, 22, 28, 8, 'rect')] });
  },
});

// =========================================================================================================
// Chef's kitchen: range with hood, prep table, dishwasher (staff 'serve' spots in front)

defineAsset({
  id: 'kitchen.range',
  name: 'Range with hood',
  group: 'kitchen.range',
  category: 'Kitchen',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['stove', 'range', 'oven', 'hood', 'cooking', 'chef', 'kitchen'],
  build() {
    const N = 4;
    const frames = animFrames(N, (f) =>
      single(area(1, 1, 48), 32, (p) => {
        // hood on the wall above
        for (let i = 0; i < 10; i++) {
          const inset = Math.round(((9 - i) / 9) * 5);
          p.hline(inset, -42 + i, 32 - inset * 2, i === 0 ? chrome.hi : chrome.light);
          p.px(inset, -42 + i, chrome.lineLit);
          p.px(31 - inset, -42 + i, chrome.line);
        }
        p.rect(0, -32, 32, 3, chrome.base);
        p.hline(0, -30, 32, chrome.line);
        p.hline(2, -29, 28, lightWarm[0]);
        p.rect(11, -48, 10, 6, chrome.base);
        p.vline(11, -48, 6, chrome.light);
        // oven body and burners
        steelCounter(p, 32);
        p.rect(3, 11, 26, 15, chrome.line);
        p.rect(4, 12, 24, 13, chrome.base);
        p.rect(7, 15, 18, 7, charcoal[1]);
        p.rect(8, 16, 16, 5, f % 2 ? terracotta[2] : terracotta[1]);
        p.hline(6, 13, 20, chrome.hi);
        for (const x of [5, 11, 17, 23]) {
          p.px(x + 1, 9, charcoal[1]);
        }
        for (const [x, y] of [[3, -3], [17, -3]] as const) {
          p.ellipse(x, y, 12, 6, charcoal[0]);
          p.ellipse(x + 2, y + 1, 8, 4, charcoal[2]);
        }
        // stockpot and a frying pan
        cylinder(p, 3, -12, 12, 11, chrome, 4, walnut[2]);
        for (let k = 0; k < 2; k++) {
          p.px(6 + k * 4, -15 - ((f + k) % 3), cream[6]);
        }
        p.ellipse(17, -1, 12, 5, charcoal[1]);
        p.ellipse(19, -1, 8, 3, mustard[3]);
        p.rect(28, 0, 5, 2, charcoal[2]);
        p.px(19 + (f % 2) * 3, -1, cream[6]);
      }),
    );
    return makeVariant({
      w: 1,
      h: 1,
      frames,
      anim: { kind: 'loop', fps: 4 },
      spots: [stand(0, 1, 'up', 'serve')],
      shadows: [shadow(-2, 26, 32, 6, 'rect')],
      lights: [warmLight(16, -24, 34, 0.3)],
    });
  },
});

defineAsset({
  id: 'kitchen.prep',
  name: 'Prep table',
  group: 'kitchen.prep',
  category: 'Kitchen',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['prep table', 'chef', 'kitchen', 'chopping', 'stainless', 'work table'],
  build() {
    const parts = single(area(2, 1, 24), 32, (p) => {
      for (const x of [2, 60]) {
        leg(p, x, 6, 24, chrome, 2);
      }
      // under-shelf with a crate of vegetables and stacked pans
      p.rect(3, 20, 58, 2, chrome.light);
      p.hline(3, 22, 58, chrome.line);
      const crate = mat(oak);
      p.rect(8, 12, 18, 8, crate.base);
      p.hline(8, 12, 18, crate.light);
      p.hline(8, 16, 18, crate.dark);
      p.rect(10, 10, 4, 3, terracotta[4]);
      p.rect(15, 10, 4, 3, plant[4]);
      p.rect(20, 10, 4, 3, mustard[4]);
      for (let i = 0; i < 3; i++) {
        p.rect(38, 17 - i * 2, 16, 2, i % 2 ? steel[3] : steel[4]);
      }
      box(p, 0, -4, 64, 10, 2, chrome, { round: 1 });
      // chopping board, knife, carrots and greens, a bowl
      p.rect(10, -3, 20, 8, oak[4]);
      p.hline(10, -3, 20, oak[5]);
      p.hline(10, 4, 20, oak[2]);
      for (let i = 0; i < 3; i++) {
        p.rect(13 + i * 3, 0, 2, 2, terracotta[4]);
      }
      p.hline(22, 1, 6, steel[5]);
      p.hline(19, 1, 3, walnut[1]);
      p.ellipse(36, -4, 10, 6, plant[3]);
      p.ellipse(37, -4, 6, 3, plant[5]);
      p.ellipse(48, -3, 11, 6, chrome.line);
      p.ellipse(49, -3, 9, 4, chrome.light);
      p.rect(51, -3, 3, 2, red[2]);
    });
    return makeVariant({ w: 2, h: 1, parts, spots: [stand(0, 1, 'up', 'serve', 16)], shadows: [shadow(0, 24, 64, 7, 'rect')] });
  },
});

defineAsset({
  id: 'kitchen.dishwasher',
  name: 'Pass-through dishwasher',
  group: 'kitchen.dishwasher',
  category: 'Kitchen',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['dishwasher', 'dishes', 'chef', 'kitchen', 'washing', 'stainless'],
  build() {
    const parts = single(area(1, 1, 44), 32, (p) => {
      steelCounter(p, 32);
      box(p, 3, -30, 26, 6, 26, chrome, { round: 1 });
      p.rect(6, -20, 20, 12, chrome.base);
      p.hline(6, -20, 20, chrome.light);
      p.rect(7, -16, 18, 1, chrome.dark);
      p.rect(6, -6, 20, 2, iron.base);
      p.hline(6, -6, 20, iron.light);
      p.rect(23, -27, 4, 3, iron.base);
      p.px(24, -26, plant[5]);
      p.rect(14, -34, 3, 4, chrome.dark);
      // a rack of plates waiting on the worktop
      p.rect(4, -2, 24, 2, chrome.dark);
      for (let x = 6; x < 26; x += 3) {
        p.rect(x, -5, 2, 4, cream[6]);
        p.px(x + 1, -5, cream[4]);
      }
      p.px(10, -36, cream[5]);
      p.px(12, -38, cream[6]);
    });
    return makeVariant({ w: 1, h: 1, parts, spots: [stand(0, 1, 'up', 'serve')], shadows: [shadow(-2, 26, 32, 6, 'rect')] });
  },
});

// =========================================================================================================
// Painted queue marking (floor)

defineAsset({
  id: 'marking.queue',
  name: 'Queue floor marking',
  group: 'marking.queue',
  category: 'Decor',
  layer: 'floor',
  placement: 'free',
  facings: ['down'],
  keywords: ['queue', 'marking', 'floor', 'footprints', 'wait here', 'line'],
  build() {
    const parts = single({ x: 0, y: 0, w: 32, h: 32 }, 0, (p) => {
      for (let x = 2; x < 30; x += 6) {
        p.rect(x, 2, 3, 1, markingYellow);
        p.rect(x, 29, 3, 1, markingYellow);
      }
      for (const x of [10, 18]) {
        p.rrect(x, 9, 5, 7, 2, markingYellow);
        p.rrect(x + 1, 17, 4, 4, 1, markingYellow);
      }
      p.hline(9, 24, 15, markingYellow);
    });
    return makeVariant({ w: 1, h: 1, mask: ['.'], parts });
  },
});

// =========================================================================================================
// Mini kitchen: compact counter (sink + coffee), under-counter fridge, high round table

defineAsset({
  id: 'kitchenette.compact',
  name: 'Compact kitchenette',
  group: 'kitchenette',
  category: 'Kitchen',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['kitchenette', 'mini kitchen', 'sink', 'coffee', 'tea point', 'counter'],
  build() {
    const cab = mat(cream);
    const top = mat(oak);
    const parts = single(area(2, 1, 44), 32, (p) => {
      // open shelf with mugs on the wall
      p.rect(2, -34, 60, 3, top.light);
      p.hline(2, -34, 60, top.hi);
      p.hline(2, -31, 60, top.line);
      p.rect(8, -31, 2, 3, top.dark);
      p.rect(54, -31, 2, 3, top.dark);
      [terracotta, sage, cream, mustard, navy].forEach((r, i) => mug(p, 6 + i * 7, -40, r));
      sprig(p, 46, -34, terracotta, 12);
      // splashback tile
      p.rect(1, -22, 62, 18, cream[6]);
      for (let y = -18; y < -4; y += 4) {
        p.hline(1, y, 62, cream[4]);
      }
      for (let x = 8; x < 62; x += 8) {
        p.vline(x, -21, 17, cream[5]);
      }
      // cabinets and worktop
      p.rect(1, 8, 62, 20, cab.base);
      p.frame(0, 8, 64, 22, cab.line);
      for (const x of [3, 33]) {
        p.rect(x, 10, 28, 16, cab.light);
        p.hline(x, 25, 28, cab.dark);
        p.vline(x + 27, 10, 16, cab.dark);
        p.vline(x + 14, 10, 16, cab.dark);
        p.px(x + 12, 13, brass.hi);
        p.px(x + 16, 13, brass.hi);
      }
      p.rect(1, 28, 62, 2, cab.dark);
      box(p, 0, -4, 64, 10, 2, top, { round: 1 });
      // sink with a gooseneck tap
      p.rect(6, -2, 20, 6, chrome.line);
      p.rect(7, -1, 18, 4, chrome.dark);
      p.hline(7, -1, 18, chrome.deep);
      p.rect(15, -12, 2, 10, chrome.light);
      p.rect(15, -12, 6, 2, chrome.light);
      p.px(20, -10, chrome.dark);
      // coffee machine and a cup
      box(p, 38, -18, 16, 5, 16, iron, { round: 1 });
      p.rect(41, -10, 10, 7, iron.line);
      p.rect(44, -6, 4, 3, cream[6]);
      p.rect(42, -15, 3, 2, screenGlow[0]);
      p.px(50, -15, red[2]);
    });
    return makeVariant({
      w: 2,
      h: 1,
      parts,
      spots: [stand(0, 1, 'up', 'water'), stand(1, 1, 'up', 'coffee')],
      shadows: [shadow(0, 24, 64, 7, 'rect')],
      lights: [warmLight(32, -14, 40, 0.22)],
    });
  },
});

defineAsset({
  id: 'fridge.mini',
  name: 'Under-counter fridge',
  group: 'fridge.mini',
  category: 'Kitchen',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['fridge', 'mini fridge', 'under counter', 'kitchenette', 'snack', 'drinks'],
  build() {
    const body = mat(sage);
    const parts = single(area(1, 1, 28), 32, (p) => {
      box(p, 2, -4, 28, 8, 26, body, { round: 2 });
      p.hline(4, 8, 24, body.dark);
      p.rect(25, 10, 2, 8, chrome.light);
      p.vline(26, 10, 8, chrome.dark);
      p.rect(6, 12, 8, 3, cream[6]);
      p.px(7, 13, terracotta[4]);
      p.rect(3, 26, 26, 3, body.deep);
      // fruit bowl and a kettle on top
      p.ellipse(4, -4, 12, 5, cream[5]);
      p.disc(6, -6, 4, red[2]);
      p.disc(9, -7, 4, plant[5]);
      cylinder(p, 18, -10, 9, 10, mat(steel), 3);
      p.rect(27, -7, 2, 4, chrome.dark);
      p.rect(21, -12, 3, 2, iron.base);
    });
    return makeVariant({ w: 1, h: 1, parts, spots: [stand(0, 1, 'up', 'snack')], shadows: [shadow(1, 24, 30, 7, 'rect')] });
  },
});

defineAsset({
  id: 'table.bar.round',
  name: 'High round table',
  group: 'table.bar.round',
  category: 'Kitchen',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['high table', 'bar table', 'round', 'standing', 'kitchenette', 'eat'],
  build() {
    const top = mat(oak);
    const parts = single(area(1, 1, 30), 28, (p) => {
      p.ellipse(7, 26, 19, 5, iron.line);
      p.ellipse(8, 26, 17, 3, iron.base);
      p.hline(10, 26, 6, iron.light);
      p.rect(15, 0, 3, 27, iron.base);
      p.vline(15, 0, 27, iron.light);
      p.vline(17, 0, 27, iron.line);
      p.hline(11, 18, 11, iron.dark);
      cylinder(p, 2, -10, 28, 15, top, 12);
      grain(p, 6, -8, 20, 8, top.base, 51);
      mug(p, 9, -8, sage);
      sprig(p, 18, -3, cream, 14);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(5, 23, 22, 8)] });
  },
});
