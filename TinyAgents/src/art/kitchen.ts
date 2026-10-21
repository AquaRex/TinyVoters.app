import { defineAsset } from './registry';
import { Dir, Variant } from './types';
import {
  Mat, Pen, Ramp, area, blue, box, charcoal, cream, cylinder, glint, grain, layered, leg, lightWarm, makeVariant,
  mat, mirrorVariant, mustard, navy, oak, plant, red, sage, screenLight, seat, shadow, single, stand, steel,
  terracotta, walnut, warmLight, water, yellow,
} from './kit';
import { mug, sprig, vine } from './decor';

/**
 * Kitchenette counter modules. Every module is one tile wide and draws the same upper cabinet, splashback,
 * worktop and cupboard bands from x 0 to 32 with no side outline, so any run of modules joins seamlessly; the
 * end caps close the run. Vertical layout (footprint px): upper cabinets -36..-18, splashback -18..-4, worktop
 * top -4..6 with a lip to 8, cupboards 9..30, toe kick 30..32.
 */
const cab = mat(sage);
const top = mat(oak);
const brass = mustard[4];
const Y_UPPER = -36;
const Y_SPLASH = -18;
const Y_TOP = -4;
const Y_FRONT = 6;
/** Cupboard band: top row and height. */
const C0 = Y_FRONT + 3;
const CH = 30 - C0;

type End = 'left' | 'right' | null;

const span = (end: End): [number, number] => [end === 'left' ? 1 : 0, end === 'right' ? 31 : 32];

/** Oak butcher-block worktop: staves run along the counter, so the grain continues from module to module. */
function worktop(p: Pen, end: End): void {
  const [x0, x1] = span(end);
  const w = x1 - x0;
  p.rect(x0, Y_TOP, w, Y_FRONT - Y_TOP, top.light);
  p.hline(x0, Y_TOP, w, top.line);
  p.hline(x0, Y_TOP + 1, w, top.base);
  // stave seams along the length, broken by a few staggered butt joints
  for (const [y, gaps] of [[Y_TOP + 4, [9, 25]], [Y_TOP + 7, [3, 18]]] as [number, number[]][]) {
    for (let x = x0; x < x1; x++) {
      if (!gaps.includes(x)) {
        p.px(x, y, top.base);
      }
    }
  }
  for (const [x, y, l] of [[4, Y_TOP + 2, 5], [20, Y_TOP + 5, 4], [12, Y_TOP + 8, 3]]) {
    if (x > x0 && x + l < x1) {
      p.hline(x, y, l, top.hi);
    }
  }
  p.hline(x0, Y_FRONT - 1, w, top.hi);
  p.rect(x0, Y_FRONT, w, 2, top.base);
  p.hline(x0, Y_FRONT + 2, w, top.line);
  if (end === 'left') {
    p.vline(0, Y_TOP + 1, Y_FRONT - Y_TOP + 1, top.lineLit);
    p.px(0, Y_FRONT + 2, top.line);
  }
  if (end === 'right') {
    p.vline(31, Y_TOP + 1, Y_FRONT - Y_TOP + 2, top.line);
    p.vline(30, Y_TOP + 2, Y_FRONT - Y_TOP - 2, top.base);
  }
}

/** Cream subway tiles between the upper cabinets and the worktop, brightest just under the cabinet light. */
function splashback(p: Pen, end: End): void {
  const x0 = end === 'left' ? 2 : 0;
  const x1 = end === 'right' ? 30 : 32;
  const h = Y_TOP - Y_SPLASH;
  p.rect(x0, Y_SPLASH, x1 - x0, h, cream[5]);
  p.rect(x0, Y_SPLASH + 1, x1 - x0, 3, cream[6]);
  for (let r = 0; r * 4 < h; r++) {
    const y = Y_SPLASH + r * 4 + 4;
    if (y < Y_TOP) {
      p.hline(x0, y, x1 - x0, cream[4]);
    }
    for (let x = (r % 2) * 4 + 3; x < 32; x += 8) {
      if (x >= x0 && x < x1) {
        p.vline(x, Y_SPLASH + r * 4 + 1, Math.min(3, Y_TOP - (Y_SPLASH + r * 4 + 1)), cream[4]);
      }
    }
  }
  p.hline(x0, Y_SPLASH, x1 - x0, cream[3]);
}

/** Upper cabinet with one shaker door per module, or an open shelf on the end caps. */
function upperCabinet(p: Pen, end: End, open = false): void {
  const [x0, x1] = span(end);
  const w = x1 - x0;
  const y = Y_UPPER;
  const h = Y_SPLASH - y;
  p.rect(x0, y, w, 3, cab.light);
  p.hline(x0, y, w, cab.line);
  p.hline(x0, y + 1, w, cab.hi);
  p.rect(x0, y + 3, w, h - 3, cab.base);
  p.hline(x0, y + 3, w, cab.dark);
  p.hline(x0, y + h - 1, w, cab.line);
  p.hline(x0, y + h - 2, w, cab.dark);
  if (end === 'left') {
    p.vline(0, y + 1, h - 1, cab.lineLit);
  }
  if (end === 'right') {
    p.vline(31, y + 1, h - 1, cab.line);
  }
  if (open) {
    p.rect(x0 + 2, y + 4, w - 4, h - 6, cab.deep);
    p.rect(x0 + 2, y + 9, w - 4, 2, top.light);
    p.hline(x0 + 2, y + 11, w - 4, top.dark);
    return;
  }
  shakerDoor(p, x0 + 2, y + 4, w - 4, h - 6, cab, end === 'right' ? 'left' : 'right', 'bottom');
}

/** A shaker-style door: lit frame, recessed panel, brass knob. */
function shakerDoor(p: Pen, x: number, y: number, w: number, h: number, m: Mat, knobSide: 'left' | 'right', knobAt: 'top' | 'bottom'): void {
  p.rect(x, y, w, h, m.base);
  p.hline(x, y, w, m.light);
  p.vline(x, y, h, m.light);
  p.hline(x, y + h - 1, w, m.dark);
  p.vline(x + w - 1, y + 1, h - 1, m.dark);
  p.rect(x + 3, y + 3, w - 6, h - 6, m.dark);
  p.rect(x + 4, y + 4, w - 7, h - 7, m.base);
  const kx = knobSide === 'right' ? x + w - 3 : x + 2;
  const ky = knobAt === 'top' ? y + 2 : y + h - 4;
  p.rect(kx, ky, 1, 2, brass);
  p.px(kx, ky + 2, mustard[1]);
}

/** A drawer front with a brass pull. */
function drawer(p: Pen, x: number, y: number, w: number, h: number, m: Mat): void {
  p.rect(x, y, w, h, m.base);
  p.hline(x, y, w, m.light);
  p.hline(x, y + h - 1, w, m.dark);
  p.vline(x + w - 1, y, h, m.dark);
  const pw = Math.min(8, w - 6);
  p.hline(x + Math.floor((w - pw) / 2), y + Math.floor(h / 2) - 1, pw, brass);
  p.hline(x + Math.floor((w - pw) / 2), y + Math.floor(h / 2), pw, mustard[1]);
}

/** Cupboard band below the worktop: carcass colour, outline and the recessed toe kick. */
function base(p: Pen, end: End): void {
  const [x0, x1] = span(end);
  p.rect(x0, C0 - 1, x1 - x0, CH + 1, cab.dark);
  p.rect(x0, 30, x1 - x0, 2, cab.line);
  p.hline(x0 + 1, 30, x1 - x0 - 2, cab.deep);
  if (end === 'left') {
    p.vline(0, C0 - 1, CH + 1, cab.lineLit);
  }
  if (end === 'right') {
    p.vline(31, C0 - 1, CH + 1, cab.line);
  }
}

/** Shared frame of every counter module. `fill` draws the module's own cupboards and worktop props. */
function counter(end: End, fill: (p: Pen) => void, open = false): Variant {
  const parts = single(area(1, 1, 44, 6), 32, (p) => {
    upperCabinet(p, end, open);
    splashback(p, end);
    worktop(p, end);
    base(p, end);
    fill(p);
  });
  return makeVariant({
    w: 1,
    h: 1,
    parts,
    shadows: [shadow(-2, 26, 32, 6, 'rect')],
    lights: [warmLight(16, -8, 30, 0.2)],
  });
}

const front = (activity: 'coffee' | 'snack' | 'water') => stand(0, 1, 'up', activity);

defineAsset({
  id: 'counter.plain',
  name: 'Counter',
  group: 'counter',
  category: 'Kitchen',
  layer: 'object',
  facings: ['down'],
  keywords: ['counter', 'kitchen', 'cupboard', 'worktop'],
  build() {
    return counter(null, (p) => {
      drawer(p, 1, C0, 30, 6, cab);
      shakerDoor(p, 1, C0 + 7, 30, CH - 8, cab, 'right', 'top');
    });
  },
});

defineAsset({
  id: 'counter.sink',
  name: 'Counter with sink',
  group: 'counter',
  category: 'Kitchen',
  layer: 'object',
  facings: ['down'],
  keywords: ['counter', 'kitchen', 'sink', 'tap'],
  build() {
    const s = mat(steel);
    return counter(null, (p) => {
      // undermount basin
      p.rrect(5, -2, 22, 8, 1, s.line);
      p.rect(6, -1, 20, 6, s.dark);
      p.rect(7, 1, 18, 4, s.base);
      p.hline(7, 4, 18, s.light);
      p.rect(15, 2, 2, 1, s.deep);
      // gooseneck tap with lever, against the splashback
      p.rect(14, -6, 4, 2, s.base);
      p.hline(14, -6, 4, s.hi);
      p.vline(15, -13, 7, s.light);
      p.vline(16, -13, 7, s.dark);
      p.hline(15, -14, 5, s.light);
      p.hline(16, -13, 4, s.dark);
      p.vline(19, -13, 3, s.base);
      p.px(19, -10, s.line);
      p.line(13, -8, 11, -10, s.light);
      // dish brush, the sink's focal detail
      p.rect(23, -8, 2, 4, walnut[3]);
      p.rect(22, -10, 4, 2, mustard[4]);
      // false front over two doors
      p.rect(1, C0, 30, 4, cab.base);
      p.hline(1, C0, 30, cab.light);
      shakerDoor(p, 1, C0 + 5, 15, CH - 6, cab, 'right', 'top');
      shakerDoor(p, 16, C0 + 5, 15, CH - 6, cab, 'left', 'top');
    });
  },
});

/** Espresso machine on the worktop, its base at `y`: polished body, gauge, a cup under the group head. */
function espresso(p: Pen, x: number, y: number): void {
  const body = mat(steel);
  const dark = mat(charcoal);
  box(p, x, y - 21, 22, 4, 19, body, { round: 1 });
  p.rect(x + 2, y - 15, 18, 3, dark.base);
  p.hline(x + 2, y - 15, 18, dark.light);
  p.rect(x + 3, y - 14, 3, 2, cream[6]);
  p.px(x + 4, y - 14, red[1]);
  p.px(x + 15, y - 14, yellow[2]);
  p.px(x + 17, y - 14, plant[5]);
  // recessed brewing bay with group head, portafilter, a cup on the drip tray
  p.rect(x + 3, y - 11, 16, 9, dark.deep);
  p.rect(x + 7, y - 11, 7, 2, body.light);
  p.hline(x + 7, y - 9, 7, body.dark);
  p.rect(x + 13, y - 9, 6, 2, dark.line);
  p.hline(x + 13, y - 9, 5, dark.dark);
  mug(p, x + 8, y - 7, cream);
  p.rect(x + 3, y - 2, 16, 2, body.base);
  p.hline(x + 3, y - 2, 16, body.hi);
  // steam wand
  p.vline(x + 20, y - 10, 6, body.light);
  p.px(x + 20, y - 4, body.line);
  // two cups warming on the top
  cylinder(p, x + 4, y - 25, 5, 4, mat(terracotta), 2, mat(terracotta).deep);
  cylinder(p, x + 11, y - 25, 5, 4, mat(cream), 2, mat(cream).deep);
}

defineAsset({
  id: 'counter.coffee',
  name: 'Counter with espresso machine',
  group: 'counter',
  category: 'Kitchen',
  layer: 'object',
  facings: ['down'],
  keywords: ['counter', 'kitchen', 'coffee', 'espresso', 'machine'],
  build() {
    const v = counter(null, (p) => {
      espresso(p, 5, 4);
      for (let i = 0; i < 3; i++) {
        drawer(p, 1, C0 + i * 7, 30, i === 2 ? CH - 14 : 7, cab);
      }
    });
    return { ...v, spots: [front('coffee')] };
  },
});

defineAsset({
  id: 'counter.microwave',
  name: 'Counter with microwave',
  group: 'counter',
  category: 'Kitchen',
  layer: 'object',
  facings: ['down'],
  keywords: ['counter', 'kitchen', 'microwave', 'snack'],
  build() {
    const v = counter(null, (p) => {
      const m = mat(cream);
      const g = mat(charcoal);
      box(p, 3, -15, 26, 4, 14, m, { round: 1 });
      // window with a soft reflection, control strip with a warm clock
      p.rect(5, -10, 16, 8, g.line);
      p.rect(6, -9, 14, 6, g.base);
      p.line(8, -4, 12, -8, g.light);
      p.line(10, -4, 13, -7, g.dark);
      p.vline(21, -10, 8, m.dark);
      p.rect(22, -9, 5, 2, g.line);
      p.hline(23, -9, 3, lightWarm[0]);
      for (const yy of [-6, -4]) {
        p.hline(23, yy, 3, m.dark);
      }
      drawer(p, 1, C0, 30, 6, cab);
      shakerDoor(p, 1, C0 + 7, 30, CH - 8, cab, 'left', 'top');
    });
    return { ...v, spots: [front('snack')] };
  },
});

/** Woven storage basket seen from the front. */
function basket(p: Pen, x: number, y: number, w: number): void {
  const m = mat(oak);
  p.rect(x, y, w, 5, m.base);
  p.hline(x, y, w, m.hi);
  p.frame(x, y, w, 5, m.line);
  for (let i = x + 2; i < x + w - 2; i += 3) {
    p.vline(i, y + 1, 3, m.dark);
  }
}

/** End caps close a run: rounded worktop end, open shelves below (bowls, a basket) and above (plant, jars). */
function endCap(side: 'left' | 'right'): Variant {
  const L = side === 'left';
  return counter(side, (p) => {
    const x0 = L ? 3 : 2;
    const w = 27;
    p.rect(x0, C0 + 1, w, CH - 2, cab.deep);
    p.rect(x0, C0 + 9, w, 2, top.light);
    p.hline(x0, C0 + 11, w, top.dark);
    if (L) {
      for (let i = 0; i < 3; i++) {
        p.rect(x0 + 3 + i, C0 + 7 - 2 * i, 10 - 2 * i, 2, i % 2 ? cream[5] : cream[6]);
        p.hline(x0 + 3 + i, C0 + 8 - 2 * i, 10 - 2 * i, cream[3]);
      }
      p.rect(x0 + 16, C0 + 5, 6, 4, terracotta[3]);
      p.hline(x0 + 16, C0 + 5, 6, terracotta[4]);
      basket(p, x0 + 3, C0 + 14, 20);
    } else {
      for (const [dx, c] of [[3, mustard], [9, terracotta], [15, sage]] as [number, Ramp][]) {
        cylinder(p, x0 + dx, C0 + 3, 5, 6, mat(c), 2, cream[6]);
      }
      basket(p, x0 + 5, C0 + 14, 20);
    }
    // upper open shelf: a trailing plant and two jars on the board, bowls on the base
    const ux = L ? 4 : 3;
    const shelfY = Y_UPPER + 9;
    sprig(p, L ? ux + 2 : ux + 17, shelfY, terracotta, L ? 6 : 12);
    for (const [dx, h] of L ? [[13, 6], [19, 5]] : [[2, 5], [8, 6]]) {
      p.rect(ux + dx, shelfY - h, 5, h, cream[6]);
      p.frame(ux + dx, shelfY - h, 5, h, steel[3]);
      p.rect(ux + dx + 1, shelfY - h + 2, 3, h - 3, L ? mustard[3] : walnut[3]);
      p.hline(ux + dx, shelfY - h, 5, walnut[3]);
    }
    vine(p, L ? ux + 4 : ux + 19, shelfY + 3, 8, 1);
    const bowls: [number, string][] = L ? [[10, cream[6]], [17, navy[3]]] : [[4, sage[3]], [11, cream[6]]];
    for (const [dx, c] of bowls) {
      p.rect(ux + dx, Y_SPLASH - 5, 5, 3, c);
      p.hline(ux + dx, Y_SPLASH - 5, 5, cream[6]);
    }
  }, true);
}

for (const side of ['left', 'right'] as const) {
  defineAsset({
    id: `counter.end.${side}`,
    name: `Counter end (${side})`,
    group: 'counter.end',
    category: 'Kitchen',
    layer: 'object',
    facings: ['down'],
    keywords: ['counter', 'kitchen', 'end', 'shelf'],
    build: () => endCap(side),
  });
}

// =========================================================================================================
// Appliances

defineAsset({
  id: 'fridge',
  name: 'Fridge',
  group: 'fridge',
  category: 'Kitchen',
  layer: 'object',
  facings: ['down'],
  keywords: ['fridge', 'refrigerator', 'kitchen', 'snack'],
  build() {
    const m = mat(cream);
    const chrome = mat(steel);
    const parts = single(area(1, 1, 44, 4), 32, (p) => {
      box(p, 2, -34, 28, 6, 60, m, { round: 2 });
      // freezer and fridge doors, chrome handles on the left
      p.hline(3, -13, 26, m.dark);
      p.hline(3, -12, 26, m.hi);
      p.vline(5, -24, 8, chrome.light);
      p.vline(6, -24, 8, chrome.dark);
      p.vline(5, -8, 12, chrome.light);
      p.vline(6, -8, 12, chrome.dark);
      p.px(5, -25, chrome.line);
      p.px(5, -9, chrome.line);
      p.rect(4, 28, 24, 2, m.deep);
      // a kid's drawing and a postcard held by magnets, the fridge's focal detail
      p.rect(13, -6, 10, 8, cream[6]);
      p.frame(13, -6, 10, 8, m.dark);
      p.disc(15, -4, 4, mustard[4]);
      p.line(15, 0, 21, -2, plant[4]);
      p.px(20, -4, terracotta[3]);
      p.rect(17, -7, 2, 2, red[1]);
      p.rect(19, 4, 7, 5, water[4]);
      p.hline(19, 7, 7, sage[3]);
      p.rect(22, 3, 2, 2, mustard[3]);
      p.rect(12, -21, 3, 3, terracotta[3]);
      p.px(12, -21, terracotta[5]);
      p.hline(21, -28, 5, chrome.base);
    });
    return makeVariant({ w: 1, h: 1, spots: [front('snack')], parts, shadows: [shadow(2, 25, 28, 6, 'rect')] });
  },
});

defineAsset({
  id: 'water.cooler',
  name: 'Water cooler',
  group: 'water',
  category: 'Kitchen',
  layer: 'object',
  facings: ['down'],
  keywords: ['water', 'cooler', 'drink', 'dispenser'],
  build() {
    const body = mat(cream);
    const w = mat(water);
    const parts = single(area(1, 1, 36, 4), 32, (p) => {
      // bottle: rounded water jug with ridges and a glint
      p.rrect(9, -24, 14, 15, 3, w.line);
      p.rrect(10, -23, 12, 13, 3, w.base);
      p.rect(11, -22, 3, 10, w.light);
      p.rect(19, -22, 2, 11, w.dark);
      p.hline(10, -19, 12, w.dark);
      p.hline(10, -14, 12, w.dark);
      p.hline(11, -19, 3, w.base);
      p.hline(11, -14, 3, w.base);
      glint(p, 12, -22, 2, w.hi);
      p.rect(13, -10, 6, 3, w.dark);
      p.hline(13, -10, 6, w.base);
      // cabinet with taps and drip tray
      box(p, 8, -8, 16, 3, 36, body, { round: 1 });
      p.rect(10, 0, 12, 9, body.dark);
      p.rect(11, 1, 10, 7, body.deep);
      p.rect(12, 1, 3, 2, red[2]);
      p.rect(17, 1, 3, 2, blue[3]);
      p.px(13, 3, steel[3]);
      p.px(18, 3, steel[3]);
      p.rect(11, 7, 10, 2, steel[4]);
      p.hline(11, 7, 10, steel[5]);
      p.rect(10, 12, 12, 13, body.base);
      p.hline(10, 12, 12, body.light);
      p.hline(14, 18, 4, body.dark);
      // paper cup tube on the side
      p.rect(24, -4, 4, 12, steel[4]);
      p.vline(24, -4, 12, steel[5]);
      p.vline(27, -4, 12, steel[2]);
      p.rect(24, 8, 4, 3, cream[6]);
      p.frame(24, 8, 4, 3, cream[3]);
    });
    return makeVariant({ w: 1, h: 1, spots: [front('water')], parts, shadows: [shadow(7, 25, 22, 6, 'rect')] });
  },
});

/** A crinkly snack bag: rounded pillow shape with a crimped top and a light label. */
function snackBag(p: Pen, x: number, y: number, ramp: Ramp): void {
  const m = mat(ramp);
  p.rect(x, y + 1, 4, 5, m.base);
  p.hline(x, y, 4, m.dark);
  p.vline(x, y + 1, 5, m.light);
  p.vline(x + 3, y + 1, 5, m.dark);
  p.rect(x + 1, y + 2, 2, 2, cream[6]);
}

/** A drink can: a little cylinder with a lit side. */
function can(p: Pen, x: number, y: number, ramp: Ramp): void {
  const m = mat(ramp);
  p.rect(x, y, 3, 6, m.base);
  p.vline(x, y, 6, m.light);
  p.hline(x, y, 3, steel[5]);
}

defineAsset({
  id: 'vending',
  name: 'Vending machine',
  group: 'vending',
  category: 'Kitchen',
  layer: 'object',
  facings: ['down'],
  keywords: ['vending', 'snack', 'machine', 'drinks'],
  build() {
    const m = mat(terracotta);
    const g = mat(charcoal);
    const parts = single(area(1, 1, 44, 4), 32, (p) => {
      box(p, 1, -34, 30, 5, 65, m, { round: 1 });
      p.hline(4, -27, 24, m.hi);
      // lit window: rows of snack bags and cans on wire spirals
      p.rect(4, -25, 19, 39, g.line);
      p.rect(5, -24, 17, 37, cream[5]);
      p.rect(5, -24, 17, 2, cream[6]);
      const rows: [Ramp, Ramp, Ramp, Ramp][] = [
        [mustard, red, mustard, plant], [blue, blue, terracotta, terracotta], [red, yellow, plant, navy], [sage, red, blue, mustard],
      ];
      rows.forEach((row, r) => {
        const sy = -21 + r * 9;
        row.forEach((ramp, c) => (r % 2 ? can(p, 6 + c * 4, sy, ramp) : snackBag(p, 5 + c * 4, sy, ramp)));
        p.hline(5, sy + 6, 17, steel[4]);
        p.hline(5, sy + 7, 17, steel[2]);
      });
      // glass reflection
      p.line(18, -20, 21, -23, cream[6]);
      p.line(6, 10, 8, 6, cream[6]);
      // side panel: little screen, keypad, coin slot
      p.rect(24, -23, 5, 4, g.line);
      p.rect(25, -22, 3, 2, '#7fd0e8');
      for (let ky = -16; ky < -7; ky += 3) {
        p.hline(24, ky, 2, cream[5]);
        p.hline(27, ky, 2, cream[5]);
      }
      p.rect(25, -4, 3, 4, g.line);
      p.vline(26, -3, 2, steel[4]);
      // dispenser flap
      p.rect(4, 17, 24, 8, g.base);
      p.hline(4, 17, 24, g.light);
      p.rect(5, 19, 22, 4, g.line);
      p.hline(5, 22, 22, g.dark);
      p.rect(2, 28, 28, 2, m.deep);
    });
    return makeVariant({
      w: 1,
      h: 1,
      spots: [front('snack')],
      parts,
      shadows: [shadow(1, 25, 30, 6, 'rect')],
      lights: [screenLight(14, -6, 34, 0.3)],
    });
  },
});

// =========================================================================================================
// Tables

defineAsset({
  id: 'table.dining.oak',
  name: 'Dining table (oak)',
  group: 'table.dining',
  category: 'Kitchen',
  layer: 'object',
  facings: ['down'],
  keywords: ['table', 'dining', 'lunch', 'eat'],
  build() {
    const wood = mat(oak);
    const parts = single(area(2, 1, 24), 32, (p) => {
      leg(p, 3, 18, 11, mat(oak, 1), 3);
      leg(p, 58, 18, 11, mat(oak, 1), 3);
      p.hline(6, 19, 52, mat(oak, 1).dark);
      box(p, 0, -4, 64, 19, 4, wood, { round: 1 });
      grain(p, 2, -2, 60, 15, wood.base, 31);
      // linen runner along the table with a bowl of fruit
      p.rect(8, 3, 48, 6, cream[5]);
      p.hline(8, 3, 48, cream[6]);
      p.hline(8, 8, 48, cream[4]);
      for (let x = 10; x < 56; x += 4) {
        p.px(x, 6, cream[4]);
      }
      p.ellipse(25, 1, 14, 7, mat(sage).line);
      p.ellipse(26, 1, 12, 5, sage[3]);
      p.disc(27, -1, 4, red[2]);
      p.disc(30, -2, 4, mustard[4]);
      p.disc(33, 0, 3, plant[4]);
      p.px(28, -1, cream[6]);
      p.hline(26, 6, 12, sage[1]);
    });
    return makeVariant({ w: 2, h: 1, parts, shadows: [shadow(1, 14, 62, 15, 'rect')] });
  },
});

defineAsset({
  id: 'table.bar.oak',
  name: 'Bar table (oak)',
  group: 'table.bar',
  category: 'Kitchen',
  layer: 'object',
  facings: ['down'],
  keywords: ['table', 'bar', 'high table', 'eat'],
  build() {
    const wood = mat(oak);
    const iron = mat(charcoal);
    const parts = single(area(2, 1, 28), 32, (p) => {
      // black steel trestle legs with a footrest bar
      for (const x of [6, 55]) {
        leg(p, x, 6, 24, iron, 3);
        p.rect(x - 2, 28, 7, 2, iron.line);
      }
      p.rect(8, 23, 48, 2, iron.base);
      p.hline(8, 23, 48, iron.light);
      box(p, 0, -12, 64, 16, 4, wood, { round: 1 });
      grain(p, 2, -10, 60, 12, wood.base, 17);
      // a little succulent and two mugs
      sprig(p, 29, -2, cream, 4);
      mug(p, 12, -6, terracotta);
      mug(p, 46, -8, sage);
    });
    return makeVariant({ w: 2, h: 1, parts, shadows: [shadow(2, 22, 60, 9, 'rect')] });
  },
});

// =========================================================================================================
// Seating

function diningChair(facing: Dir): Variant {
  if (facing === 'right') {
    return mirrorVariant(diningChair('left'));
  }
  const wood = mat(oak);
  const dark = mat(oak, 1);
  const pad = mat(cream);
  const parts = layered(area(1, 1, 28), (L) => {
    const p = L(24);
    if (facing === 'down') {
      leg(p, 7, -8, 26, dark, 2);
      leg(p, 23, -8, 26, dark, 2);
      box(p, 7, -9, 18, 2, 4, wood, { round: 1 });
      box(p, 8, -1, 16, 1, 3, wood);
      leg(p, 8, 19, 10, wood, 2);
      leg(p, 22, 19, 10, wood, 2);
      box(p, 6, 8, 20, 10, 3, wood);
      box(p, 8, 9, 16, 7, 1, pad, { round: 1 });
    } else if (facing === 'up') {
      leg(p, 8, 14, 12, dark, 2);
      leg(p, 22, 14, 12, dark, 2);
      box(p, 6, 6, 20, 10, 3, wood);
      box(p, 8, 7, 16, 7, 1, pad, { round: 1 });
      const b = L(31);
      leg(b, 7, -6, 35, dark, 2);
      leg(b, 23, -6, 35, dark, 2);
      box(b, 7, -7, 18, 2, 4, wood, { round: 1 });
      box(b, 8, 1, 16, 1, 3, wood);
    } else {
      // facing left: the ladder back seen edge-on along the east side
      p.rect(20, -9, 5, 19, dark.dark);
      p.frame(20, -9, 5, 19, dark.line);
      box(p, 19, -11, 7, 2, 4, wood, { round: 1 });
      box(p, 19, -2, 7, 1, 3, wood);
      leg(p, 22, 10, 19, dark, 2);
      leg(p, 7, 19, 10, wood, 2);
      box(p, 5, 8, 21, 10, 3, wood);
      box(p, 7, 9, 13, 7, 1, pad, { round: 1 });
      const f = L(31);
      leg(f, 8, 20, 10, wood, 2);
      leg(f, 21, 20, 10, dark, 2);
    }
  });
  return makeVariant({ w: 1, h: 1, mask: ['s'], spots: [seat(facing)], parts, shadows: [shadow(6, 22, 20, 8)] });
}

defineAsset({
  id: 'chair.dining.oak',
  name: 'Dining chair (oak)',
  group: 'chair.dining',
  category: 'Kitchen',
  layer: 'object',
  facings: ['down', 'up', 'left', 'right'],
  keywords: ['chair', 'dining', 'seat'],
  build: diningChair,
});

/** Backless bar stool: the same from every side, so all four facings share one sprite. */
function barStool(facing: Dir): Variant {
  const iron = mat(charcoal);
  const seatTop = mat(walnut);
  const parts = single(area(1, 1, 24), 24, (p) => {
    p.vline(16, 12, 12, iron.dark);
    p.line(10, 12, 7, 29, iron.line);
    p.line(11, 12, 8, 29, iron.base);
    p.line(22, 12, 25, 29, iron.line);
    p.line(21, 12, 24, 29, iron.dark);
    p.hline(9, 22, 15, iron.line);
    p.hline(10, 21, 12, iron.light);
    cylinder(p, 6, 4, 20, 9, seatTop, 6);
    p.hline(10, 5, 6, seatTop.hi);
  });
  return makeVariant({ w: 1, h: 1, mask: ['s'], spots: [seat(facing)], parts, shadows: [shadow(6, 23, 20, 7)] });
}

defineAsset({
  id: 'stool.bar',
  name: 'Bar stool',
  group: 'stool',
  category: 'Kitchen',
  layer: 'object',
  facings: ['down', 'up', 'left', 'right'],
  keywords: ['stool', 'bar', 'seat'],
  build: barStool,
});
