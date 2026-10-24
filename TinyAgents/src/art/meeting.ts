import { defineAsset } from './registry';
import { Dir, Part, Variant } from './types';
import { pulledSeat } from './work';
import {
  LayerPen, Mat, Pen, Ramp, area, box, charcoal, cushion, grain, layered, leg, makeVariant, mat, mirrorVariant, oak, screenGlow,
  shadow, single, steel, teal, walnut, warmgrey,
} from './kit';

const Z_SEAT = 24;
const Z_FRONT = 31;
const TABLE_TOP = -8;

// =========================================================================================================
// Meeting chair: upholstered shell on a slim steel sled base, no arms (lighter than the office chair)

/** Sled base seen from the front or back: two posts per side and a floor bar. */
function sledFront(p: Pen, frame: Mat, y0: number): void {
  for (const x of [8, 22]) {
    p.vline(x, y0, 29 - y0, frame.light);
    p.vline(x + 1, y0, 29 - y0, frame.dark);
    p.rect(x - 1, 29, 4, 1, frame.line);
  }
}

function meetingChairParts(ramp: Ramp, facing: 'down' | 'up' | 'left'): Part[] {
  const f = mat(ramp);
  const shell = mat(ramp, 1);
  const frame = mat(steel, 1);
  return layered(area(1, 1, 24), (L: LayerPen) => {
    const s = L(Z_SEAT);
    if (facing === 'down') {
      // back legs peek out behind the front ones
      s.vline(10, 20, 8, frame.base);
      s.vline(21, 20, 8, frame.base);
      cushion(s, 6, -2, 20, 3, 16, f, 3);
      s.hline(9, 8, 14, f.dark);
      s.vline(8, 2, 5, f.hi);
      sledFront(s, frame, 22);
      cushion(s, 6, 13, 20, 7, 4, f, 2);
    } else if (facing === 'up') {
      s.vline(10, 18, 10, frame.base);
      s.vline(21, 18, 10, frame.base);
      cushion(s, 6, 11, 20, 7, 4, f, 2);
      const b = L(Z_FRONT);
      cushion(b, 8, 9, 16, 2, 12, shell, 3);
      b.vline(10, 11, 7, shell.light);
      b.hline(12, 13, 8, shell.deep);
      sledFront(b, frame, 23);
    } else {
      // facing left: shell back on the east edge seen edge-on, sled base in profile
      cushion(s, 20, -2, 5, 9, 16, f, 2);
      s.vline(21, 0, 7, f.hi);
      s.line(22, 21, 23, 28, frame.base);
      s.line(8, 22, 8, 28, frame.light);
      s.vline(9, 22, 7, frame.dark);
      s.hline(7, 29, 18, frame.line);
      s.hline(8, 28, 16, frame.base);
      cushion(s, 6, 13, 18, 7, 4, f, 2);
    }
  });
}

function meetingChair(ramp: Ramp): (facing: Dir) => Variant {
  return (facing) => {
    if (facing === 'right') {
      return mirrorVariant(meetingChair(ramp)('left'));
    }
    return pulledSeat(facing, meetingChairParts(ramp, facing), 6, 23, 20, 8);
  };
}

for (const [id, name, ramp] of [
  ['chair.meeting.grey', 'Meeting chair (grey)', warmgrey],
  ['chair.meeting.teal', 'Meeting chair (teal)', teal],
] as const) {
  defineAsset({
    id,
    name,
    group: 'chair.meeting',
    category: 'Meeting',
    layer: 'object',
    placement: 'free',
    facings: ['down', 'up', 'left', 'right'],
    keywords: ['chair', 'seat', 'meeting', 'conference'],
    build: meetingChair(ramp),
  });
}

// =========================================================================================================
// Meeting tables (2 tiles deep). Top face y -8..46, lip to 49, floor line at 62. Chairs go on the rows
// directly north (facing down) and south (facing up), or on the columns east/west (facing in).

function tableTop(p: Pen, x: number, w: number, wood: Mat, seed: number): void {
  box(p, x, TABLE_TOP, w, 46 - TABLE_TOP, 3, wood, { round: 3 });
  grain(p, x + 3, TABLE_TOP + 3, w - 6, 40 - TABLE_TOP, wood.base, seed);
}

function meetingTable(w: number, wood: Mat, legs: Mat, seed: number): Variant {
  const W = w * 32;
  const parts = single(area(w, 2, 32), 64, (p) => {
    if (w === 2) {
      leg(p, 6, 47, 15, legs, 3);
      leg(p, W - 9, 47, 15, legs, 3);
      tableTop(p, 2, W - 4, wood, seed);
      // cable grommet
      p.ellipse(W / 2 - 3, 20, 7, 4, wood.line);
      p.ellipse(W / 2 - 2, 21, 5, 2, mat(charcoal).dark);
    } else {
      for (const x of [14, W - 26]) {
        box(p, x, 44, 12, 3, 18, legs, { edge: 'line' });
      }
      p.rect(26, 50, W - 52, 3, legs.dark);
      p.hline(26, 50, W - 52, legs.base);
      tableTop(p, 1, W - 2, wood, seed);
      // centre power and data box
      const m = mat(charcoal);
      const cx = W / 2;
      box(p, cx - 9, 17, 18, 6, 1, m, { edge: 'soft' });
      p.hline(cx - 7, 18, 14, mat(steel).base);
      p.px(cx - 6, 20, screenGlow[0]);
      p.rect(cx - 3, 20, 2, 1, m.hi);
      p.rect(cx + 2, 20, 2, 1, m.hi);
    }
  });
  return makeVariant({ w, h: 2, parts, shadows: [shadow(1, 44, W - 4, 18, 'rect')] });
}

/** The 8-seat table turned north-south (2 x 4), for rooms where the table points at the screen. */
function meetingTableLong(wood: Mat, legs: Mat, seed: number): Variant {
  const D = 128;
  const parts = single(area(2, 4, 32), D - 2, (p) => {
    for (const x of [8, 44]) {
      box(p, x, D - 20, 12, 3, 18, legs, { edge: 'line' });
    }
    box(p, 1, -8, 62, D - 10, 3, wood, { round: 3 });
    grain(p, 4, -5, 56, D - 16, wood.base, seed);
    const m = mat(charcoal);
    box(p, 26, 46, 12, 14, 1, m, { edge: 'soft' });
    p.vline(28, 48, 10, mat(steel).base);
    p.px(30, 52, screenGlow[0]);
  });
  return makeVariant({ w: 2, h: 4, parts, shadows: [shadow(1, D - 22, 60, 20, 'rect')] });
}

for (const [id, name, group, w, ramp, shift, seed] of [
  ['table.meeting.oak.4', 'Meeting table (oak, 4 seats)', 'table.meeting.small', 2, oak, 1, 5],
  ['table.meeting.oak.8', 'Meeting table (oak, 8 seats)', 'table.meeting.large', 4, oak, 1, 9],
  ['table.meeting.walnut.8', 'Meeting table (walnut, 8 seats)', 'table.meeting.large', 4, walnut, 0, 13],
] as const) {
  defineAsset({
    id,
    name,
    group,
    category: 'Meeting',
    layer: 'object',
    placement: 'free',
    facings: w === 4 ? ['down', 'left'] : ['down'],
    keywords: ['table', 'meeting', 'conference', 'boardroom'],
    build: (facing) =>
      facing === 'left' ? meetingTableLong(mat(ramp, shift), mat(ramp, shift + 1), seed) : meetingTable(w, mat(ramp, shift), mat(ramp, shift + 1), seed),
  });
}

// =========================================================================================================
// Conference speakerphone (surface item)

defineAsset({
  id: 'surface.conference',
  name: 'Conference speakerphone',
  group: 'surface.conference',
  category: 'Meeting',
  layer: 'surface',
  placement: 'free',
  facings: ['down'],
  keywords: ['conference', 'speaker', 'phone', 'call'],
  build() {
    const m = mat(charcoal);
    const parts = single(area(1, 1, 32), 32, (p) => {
      // cable trailing off toward the table centre
      p.line(25, 1, 29, 3, m.base);
      p.hline(29, 4, 3, m.base);
      box(p, 7, -5, 19, 7, 2, m, { round: 2 });
      // speaker grille: three fans of dots
      for (const [gx, gy] of [[10, -3], [19, -3], [14, 0]]) {
        p.px(gx, gy, m.dark);
        p.px(gx + 2, gy, m.dark);
        p.px(gx + 1, gy + 1, m.dark);
      }
      p.hline(13, -4, 7, screenGlow[0]);
      p.px(13, -4, screenGlow[1]);
      p.px(11, 1, m.hi);
    });
    return makeVariant({ w: 1, h: 1, mask: ['.'], parts });
  },
});
