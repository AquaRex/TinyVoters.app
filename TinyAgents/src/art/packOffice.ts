import { defineAsset, variant } from './registry';
import { Activity, Dir, Light, Part, Variant } from './types';
import {
  Mat, Pen, Ramp, area, blue, box, canvasPen, charcoal, cream, cushion, cylinder, dirt, dither, drawers, glassGlint, glassTint,
  glint, grain, layered, leg, lightWarm, makeVariant, mat, mirrorVariant, mix, mustard, navy, oak, plant, red, sage,
  screen, screenGlow, screenLight, seat, selOut, shadow, single, skinA, skinB, skinC, stand, steel, teal, terracotta, walnut,
  warmLight, water, weave, yellow,
} from './kit';
import { rgba } from './walls';
import { pulledSeat } from './work';

// Office, government, data-centre, internet-café, TV-studio and school pieces, plus the dedicated rooms
// (server room, IT help, printer room, janitor closet, security office).

const T = 32;
const ALL: Dir[] = ['down', 'up', 'left', 'right'];
const SIDES: Dir[] = ['down', 'left', 'right'];
const DOWN: Dir[] = ['down'];
const RGB = [blue[3], red[2], plant[5], mustard[4]];
const Z_SEAT = 24;
const Z_FRONT = 31;

function organic(p: Pen, x: number, y: number, w: number, h: number, draw: (q: Pen) => void): void {
  const q = canvasPen(w, h, -x, -y);
  draw(q);
  selOut(q.canvas);
  p.blit(q.canvas, x, y);
}

const GLYPHS: Record<string, string> = {
  A: '010101111101101', C: '011100100100011', E: '111100110100111', I: '111010010010111', K: '101101110101101',
  L: '100100100100111', N: '101111111101101', O: '111101101101111', P: '110101110100100', R: '110101110101101',
  T: '111010010010010', H: '101101111101101', W: '101101111111101', F: '111100110100100', S: '011100010001110',
  U: '101101101101111', V: '101101101101010', Y: '101101010010010', G: '011100101101011', M: '101111111101101', D: '110101101101110',
};

/** Tiny 3x5 capitals. Returns the width drawn. */
function text(p: Pen, x: number, y: number, s: string, c: string): number {
  let cx = x;
  for (const ch of s) {
    const g = GLYPHS[ch];
    if (g) {
      for (let i = 0; i < 15; i++) {
        if (g[i] === '1') {
          p.px(cx + (i % 3), y + Math.floor(i / 3), c);
        }
      }
    }
    cx += ch === ' ' ? 3 : 4;
  }
  return cx - x - 1;
}

/** Blends the glass tint into what is already drawn (opaque result), with a diagonal glint. */
function glassOver(p: Pen, x: number, y: number, w: number, h: number, amount: number): void {
  const img = p.ctx.getImageData(x + p.ox, y + p.oy, w, h);
  const [tr, tg, tb] = [0x9f, 0xc3, 0xcf];
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) {
      continue;
    }
    img.data[i] = Math.round(img.data[i] * (1 - amount) + tr * amount);
    img.data[i + 1] = Math.round(img.data[i + 1] * (1 - amount) + tg * amount);
    img.data[i + 2] = Math.round(img.data[i + 2] * (1 - amount) + tb * amount);
  }
  p.ctx.putImageData(img, x + p.ox, y + p.oy);
  for (let i = 0; i < Math.min(4, w - 3, h - 3); i++) {
    p.px(x + w - 3 - i, y + 1 + i, glassGlint);
  }
}

// =========================================================================================================
// Wall fixtures: a box `w` along the wall, `d` deep, `h` tall, its back on the footprint's back edge.
// Facing 'left' backs onto the east edge; 'right' is its mirror. Side views show the box end-on plus a thin
// strip of the front.

interface Geo {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
}

type Side = 'down' | 'left';

function fixtureGeo(w: number, d: number, h: number, side: Side, tiles = 1): Geo {
  if (side === 'down') {
    return { x: Math.round((tiles * T - w) / 2), y: -h, w, d, h };
  }
  return { x: T - d, y: Math.round((tiles * T - w) / 2) - h, w: d, d: w, h };
}

/** The front face of a 'down' fixture: (x, top, width, height). */
const faceOf = (g: Geo) => ({ x: g.x + 1, y: g.y + g.d, w: g.w - 2, h: g.h - 1 });

/** The narrow front strip of a side view, just west of the box. */
function sideStrip(p: Pen, g: Geo, m: Mat): { x: number; y: number; h: number } {
  const y = g.y + 2;
  const h = g.d + g.h - 3;
  p.rect(g.x - 3, y, 3, h, m.base);
  p.vline(g.x - 3, y, h, m.line);
  p.vline(g.x - 2, y, h, m.light);
  p.hline(g.x - 3, y, 3, m.lineLit);
  p.hline(g.x - 3, y + h - 1, 3, m.line);
  return { x: g.x - 2, y, h };
}

interface FixtureSpec {
  w: number;
  d: number;
  h: number;
  m: Mat;
  act?: Activity;
  frames?: number;
  fps?: number;
  front(p: Pen, g: Geo, frame: number): void;
  side?(p: Pen, g: Geo, frame: number): void;
  lights?(g: Geo, side: Side): Light[];
}

function fixture(s: FixtureSpec): (facing: Dir) => Variant {
  const build = (facing: Dir): Variant => {
    if (facing === 'right') {
      return mirrorVariant(build('left'));
    }
    const side: Side = facing === 'left' ? 'left' : 'down';
    const g = fixtureGeo(s.w, s.d, s.h, side);
    const frames = Array.from({ length: s.frames ?? 1 }, (_, f) =>
      single(area(1, 1, s.h + 12, 6), T, (p) => {
        box(p, g.x, g.y, g.w, g.d, g.h, s.m);
        if (side === 'down') {
          s.front(p, g, f);
        } else {
          s.side?.(p, g, f);
        }
      }),
    );
    const spots = s.act ? [side === 'down' ? stand(0, 1, 'up', s.act) : stand(-1, 0, 'right', s.act)] : [];
    return makeVariant({
      w: 1,
      h: 1,
      frames,
      anim: frames.length > 1 ? { kind: 'loop', fps: s.fps ?? 3 } : undefined,
      spots,
      shadows: [shadow(g.x, g.y + g.h, g.w, g.d, 'rect')],
      lights: s.lights?.(g, side),
    });
  };
  return build;
}

/** A 2-tile 'down' fixture against the wall, spot in front between the tiles. */
function wide(w: number, d: number, h: number, draw: (p: Pen, g: Geo) => void, act?: Activity, lights?: Light[], tiles = 2): () => Variant {
  return () => {
    const g = fixtureGeo(w, d, h, 'down', tiles);
    const parts = single(area(tiles, 1, h + 16, 6), T, (p) => draw(p, g));
    return makeVariant({
      w: tiles,
      h: 1,
      parts,
      spots: act ? [stand(0, 1, 'up', act, tiles === 2 ? 16 : 0)] : [],
      shadows: [shadow(g.x, 0, g.w, g.d, 'rect')],
      lights,
    });
  };
}

// =========================================================================================================
// Lockers, safe

function lockerFront(p: Pen, g: Geo, m: Mat, sticker: string): void {
  const f = faceOf(g);
  const half = Math.floor((f.w - 3) / 2);
  for (const [i, x] of [f.x + 1, f.x + 2 + half].entries()) {
    const top = f.y + 1;
    const h = f.h - 6;
    p.rect(x, top, half, h, m.base);
    p.hline(x, top, half, m.light);
    p.vline(x, top, h, m.light);
    p.vline(x + half - 1, top, h, m.dark);
    for (let r = 0; r < 3; r++) {
      p.hline(x + 3, top + 3 + r * 2, half - 6, m.deep);
    }
    p.rect(x + 4, top + 11, 4, 2, cream[5]);
    p.px(x + 4, top + 12, cream[3]);
    p.rect(x + half - 3, top + 17, 1, 5, mat(steel).hi);
    p.px(x + half - 3, top + 22, mat(steel).dark);
    for (let r = 0; r < 2; r++) {
      p.hline(x + 3, top + h - 6 + r * 2, half - 6, m.deep);
    }
    if (i === 1) {
      p.disc(x + 3, top + 24, 4, sticker);
      p.px(x + 4, top + 25, cream[6]);
    }
  }
  p.vline(f.x + 1 + half, f.y + 1, f.h - 6, m.deep);
  p.rect(f.x, f.y + f.h - 5, f.w, 4, m.dark);
  p.hline(f.x, f.y + f.h - 5, f.w, m.deep);
}

function lockerSide(p: Pen, g: Geo, m: Mat): void {
  const s = sideStrip(p, g, m);
  p.rect(s.x, s.y + 18, 1, 4, mat(steel).hi);
  p.rect(s.x, s.y + s.h - 26, 1, 4, mat(steel).hi);
  for (let y = g.y + g.d + 4; y < g.y + g.d + 10; y += 2) {
    p.hline(g.x + 3, y, g.w - 6, m.dark);
  }
  p.rect(g.x + 1, g.y + g.d + g.h - 5, g.w - 2, 4, m.dark);
}

for (const [id, name, ramp, shift, sticker] of [
  ['locker.steel', 'Lockers (steel)', steel, 1, mustard[4]],
  ['locker.navy', 'Lockers (navy)', navy, 0, terracotta[4]],
  ['locker.sage', 'Lockers (sage)', sage, 0, mustard[4]],
] as const) {
  const m = mat(ramp, shift);
  defineAsset({
    id, name, group: 'locker', category: 'Work', layer: 'object', placement: 'wall', facings: SIDES,
    keywords: ['locker', 'lockers', 'storage', 'school', 'gym', 'staff'],
    build: fixture({ w: 28, d: 12, h: 46, m, front: (p, g) => lockerFront(p, g, m, sticker), side: (p, g) => lockerSide(p, g, m) }),
  });
}

{
  const m = mat(steel, 2);
  const brass = mat(yellow);
  defineAsset({
    id: 'safe.steel', name: 'Office safe', group: 'safe', category: 'Work', layer: 'object', placement: 'wall', facings: SIDES,
    keywords: ['safe', 'vault', 'money', 'government', 'secure', 'files'],
    build: fixture({
      w: 24, d: 14, h: 26, m, act: 'files',
      front(p, g) {
        const f = faceOf(g);
        p.rect(f.x + 2, f.y + 2, f.w - 4, f.h - 6, m.dark);
        p.rect(f.x + 3, f.y + 3, f.w - 6, f.h - 8, m.base);
        p.hline(f.x + 3, f.y + 3, f.w - 6, m.light);
        p.vline(f.x + 3, f.y + 3, f.h - 8, m.light);
        for (const y of [f.y + 5, f.y + f.h - 9]) {
          p.rect(f.x + 1, y, 2, 3, m.line);
        }
        const cx = f.x + 8;
        const cy = f.y + 9;
        p.disc(cx - 3, cy - 3, 7, m.line);
        p.disc(cx - 2, cy - 2, 5, brass.base);
        p.px(cx - 1, cy - 1, brass.hi);
        p.px(cx, cy, mat(mustard).dark);
        const hx = f.x + f.w - 8;
        p.line(hx - 3, cy - 3, hx + 3, cy + 3, m.hi);
        p.line(hx + 3, cy - 3, hx - 3, cy + 3, m.hi);
        p.rect(hx - 1, cy - 1, 3, 3, m.line);
        p.rect(f.x + 4, f.y + f.h - 3, f.w - 8, 2, m.deep);
      },
      side(p, g) {
        const s = sideStrip(p, g, m);
        p.rect(s.x, s.y + Math.floor(s.h / 2) - 2, 1, 4, brass.base);
      },
    }),
  });
}

// =========================================================================================================
// Printer room: copier, plotter, paper shelf, sorting table

function copier(ramp: Ramp, shift: number): (facing: Dir) => Variant {
  const body = mat(ramp, shift);
  const lid = mat(ramp, Math.max(0, shift - 1));
  const ink = mat(charcoal);
  const paper = mat(cream);
  return fixture({
    w: 28, d: 14, h: 34, m: body, act: 'print',
    front(p, g) {
      const f = faceOf(g);
      // scanner lid with the document feeder on top
      box(p, g.x + 1, g.y - 4, 20, 10, 4, lid, { edge: 'lip' });
      box(p, g.x + 4, g.y - 8, 12, 5, 3, lid, { round: 1 });
      p.rect(g.x + 6, g.y - 10, 8, 3, paper.hi);
      p.hline(g.x + 6, g.y - 10, 8, paper.light);
      // control panel with a touch screen
      box(p, g.x + 20, g.y + 1, 7, 6, 2, ink, { edge: 'soft' });
      p.rect(g.x + 21, g.y + 2, 4, 3, screenGlow[0]);
      p.px(g.x + 21, g.y + 2, screenGlow[1]);
      // output bay with a printed stack
      p.rect(f.x + 2, f.y + 1, f.w - 4, 5, ink.dark);
      p.hline(f.x + 2, f.y + 1, f.w - 4, ink.line);
      box(p, f.x + 6, f.y + 3, 12, 2, 1, paper, { edge: 'soft' });
      p.hline(f.x + 7, f.y + 4, 8, paper.dark);
      // paper trays
      drawers(p, f.x + 1, f.y + 8, f.w - 2, f.h - 12, 3, body, ink.base);
      p.rect(f.x + 1, f.y + f.h - 4, f.w - 2, 3, body.dark);
      p.rect(f.x + 1, f.y + f.h - 1, 3, 2, ink.line);
      p.rect(f.x + f.w - 4, f.y + f.h - 1, 3, 2, ink.line);
      p.px(f.x + f.w - 3, f.y + 2, plant[5]);
    },
    lights: (g) => [screenLight(g.x + 23, g.y + 3, 12, 0.18)],
  });
}

defineAsset({
  id: 'printer.copier', name: 'Copier (multifunction)', group: 'printer', category: 'Work', layer: 'object', placement: 'wall',
  facings: DOWN, keywords: ['copier', 'printer', 'photocopy', 'scanner', 'print', 'printer room'], build: copier(cream, 1),
});

defineAsset({
  id: 'printer.copier.charcoal', name: 'Copier (graphite)', group: 'printer', category: 'Work', layer: 'object', placement: 'wall',
  facings: DOWN, keywords: ['copier', 'printer', 'photocopy', 'scanner', 'print', 'printer room'], build: copier(steel, 2),
});

defineAsset({
  id: 'plotter', name: 'Wide-format plotter', group: 'plotter', category: 'Work', layer: 'object', placement: 'wall', facings: DOWN,
  keywords: ['plotter', 'printer', 'large format', 'blueprint', 'poster', 'print', 'printer room'],
  build: wide(58, 12, 30, (p, g) => {
    const body = mat(charcoal, 1);
    const stand = mat(steel, 1);
    const paper = mat(cream);
    for (const x of [g.x + 4, g.x + g.w - 7]) {
      leg(p, x, -2, 26, stand, 3);
      p.rect(x - 3, 24, 9, 2, stand.dark);
      p.hline(x - 3, 24, 9, stand.light);
    }
    p.rect(g.x + 6, 14, g.w - 12, 2, stand.base);
    // the printer head housing on top of the stand
    box(p, g.x, g.y, g.w, g.d, 14, body, { round: 2 });
    p.rect(g.x + 3, g.y + g.d + 3, g.w - 6, 3, body.deep);
    // the roll coming out: a long sheet curling down with a blue drawing on it
    p.rect(g.x + 8, g.y + g.d + 5, g.w - 16, 14, paper.hi);
    p.hline(g.x + 8, g.y + g.d + 18, g.w - 16, paper.light);
    p.vline(g.x + g.w - 9, g.y + g.d + 5, 14, paper.light);
    const ink = blue[2];
    p.frame(g.x + 12, g.y + g.d + 8, 14, 7, ink);
    p.line(g.x + 12, g.y + g.d + 8, g.x + 25, g.y + g.d + 14, ink);
    p.hline(g.x + 30, g.y + g.d + 9, 12, ink);
    p.hline(g.x + 30, g.y + g.d + 12, 8, ink);
    // control panel and ink cartridges
    p.rect(g.x + g.w - 12, g.y + 2, 8, 4, mat(charcoal).dark);
    p.rect(g.x + g.w - 11, g.y + 3, 4, 2, screenGlow[0]);
    for (const [i, c] of [teal[4], red[2], mustard[4], charcoal[2]].entries()) {
      p.rect(g.x + 4 + i * 3, g.y + 3, 2, 3, c);
    }
  }, 'print', [screenLight(50, -26, 12, 0.16)]),
});

/** Shelf compartments with stacked paper reams. */
function reams(p: Pen, x: number, bottom: number, w: number, seed: number): void {
  const wraps = [cream, sage, cream, terracotta, cream, navy];
  let cx = x;
  let k = seed;
  while (cx + 9 <= x + w) {
    const n = 2 + (k % 2);
    for (let i = 0; i < n; i++) {
      const m = mat(wraps[(k + i) % wraps.length]);
      p.rect(cx, bottom - 3 * (i + 1), 9, 3, m.light);
      p.hline(cx, bottom - 3 * (i + 1), 9, m.hi);
      p.vline(cx + 8, bottom - 3 * (i + 1), 3, m.base);
      p.px(cx + 3, bottom - 3 * (i + 1) + 1, m.dark);
    }
    cx += 10;
    k += 3;
  }
}

{
  const m = mat(steel, 1);
  defineAsset({
    id: 'shelf.paper', name: 'Paper supply shelf', group: 'shelf.paper', category: 'Work', layer: 'object', placement: 'wall',
    facings: SIDES, keywords: ['paper', 'shelf', 'reams', 'supplies', 'toner', 'printer room', 'print'],
    build: fixture({
      w: 28, d: 10, h: 44, m, act: 'print',
      front(p, g) {
        const f = faceOf(g);
        for (const [i, y] of [f.y + 1, f.y + 14, f.y + 27].entries()) {
          p.rect(f.x + 1, y, f.w - 2, 11, m.deep);
          reams(p, f.x + 2, y + 11, f.w - 4, i * 2 + 1);
          p.hline(f.x, y + 11, f.w, m.light);
          p.hline(f.x, y + 12, f.w, m.dark);
        }
        // toner boxes on the bottom shelf
        box(p, f.x + 2, f.y + 36, 10, 3, 6, mat(cream), { edge: 'line' });
        p.hline(f.x + 4, f.y + 41, 6, red[1]);
        box(p, f.x + 14, f.y + 37, 9, 3, 5, mat(charcoal), { edge: 'line' });
      },
      side(p, g) {
        const s = sideStrip(p, g, m);
        for (let y = s.y + 6; y < s.y + s.h - 4; y += 9) {
          p.rect(s.x - 1, y, 3, 2, cream[5]);
        }
      },
    }),
  });
}

defineAsset({
  id: 'table.sorting', name: 'Mail sorting table', group: 'table.sorting', category: 'Work', layer: 'object', placement: 'wall', facings: DOWN,
  keywords: ['mail', 'sorting', 'pigeonhole', 'binding', 'post', 'letters', 'printer room', 'files'],
  build: wide(60, 22, 40, (p, g) => {
    const wood = mat(oak, 1);
    const frame = mat(steel, 1);
    // pigeonhole rack against the wall
    const rack = { x: g.x + 4, y: g.y, w: g.w - 8 };
    box(p, rack.x, rack.y, rack.w, 6, 20, wood);
    const cols = 6;
    const cw = Math.floor((rack.w - 4) / cols);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < cols; c++) {
        const x = rack.x + 2 + c * cw;
        const y = rack.y + 8 + r * 9;
        p.rect(x, y, cw - 1, 8, wood.deep);
        if ((c + r * 2) % 3 !== 1) {
          const env = (c + r) % 4 === 0 ? mat(mustard) : mat(cream);
          p.rect(x + 1, y + 3, cw - 3, 5, env.light);
          p.hline(x + 1, y + 3, cw - 3, env.hi);
        }
        p.rect(x + 1, y + 7, 3, 1, cream[6]);
      }
    }
    // table below on steel legs
    leg(p, g.x + 2, 6, 22, frame, 2);
    leg(p, g.x + g.w - 4, 6, 22, frame, 2);
    p.rect(g.x + 3, 22, g.w - 6, 2, frame.base);
    box(p, g.x, -8, g.w, 14, 3, wood);
    grain(p, g.x + 2, -7, g.w - 4, 12, wood.base, 51);
    // a binding machine and loose envelopes
    const bind = mat(charcoal);
    box(p, g.x + 4, -10, 14, 6, 4, bind, { round: 1 });
    p.hline(g.x + 6, -8, 10, bind.deep);
    p.rect(g.x + 14, -12, 2, 3, bind.light);
    for (const [x, y, ramp] of [[g.x + 26, -5, cream], [g.x + 30, -3, mustard], [g.x + 40, -6, cream]] as const) {
      const m = mat(ramp);
      p.rect(x, y, 9, 5, m.light);
      p.frame(x, y, 9, 5, m.dark);
      p.line(x, y, x + 4, y + 2, m.dark);
      p.line(x + 8, y, x + 4, y + 2, m.dark);
    }
    p.rect(g.x + 50, -6, 4, 4, red[1]);
  }, 'files'),
});

// =========================================================================================================
// Lobby and government: ticket kiosk, queue rope, brochure rack, wall map, flags, waiting seats, badge gate

defineAsset({
  id: 'kiosk.ticket', name: 'Queue ticket kiosk', group: 'kiosk.ticket', category: 'Work', layer: 'object', placement: 'free', facings: DOWN,
  keywords: ['ticket', 'queue', 'number', 'kiosk', 'government', 'lobby', 'service'],
  build() {
    const body = mat(terracotta, 1);
    const dark = mat(charcoal);
    const parts = single(area(1, 1, 48), T, (p) => {
      box(p, 8, 24, 16, 3, 3, dark, { round: 1 });
      box(p, 9, -26, 14, 6, 52, body, { round: 1 });
      p.rect(10, -19, 12, 6, red[0]);
      text(p, 11, -18, 'TKT', cream[6]);
      p.rect(11, -11, 10, 8, dark.line);
      p.rect(12, -10, 8, 6, screenGlow[0]);
      p.hline(12, -10, 8, screenGlow[1]);
      text(p, 13, -9, 'A', dark.dark);
      p.rect(17, -9, 2, 3, dark.dark);
      p.rect(13, -1, 6, 2, dark.deep);
      p.rect(14, 0, 4, 5, cream[6]);
      p.hline(14, 3, 4, cream[4]);
      p.disc(14, 8, 4, plant[4]);
      p.px(15, 8, plant[6]);
      p.vline(10, -18, 40, body.light);
    });
    return makeVariant({ w: 1, h: 1, parts, spots: [stand(0, 1, 'up', 'print')], shadows: [shadow(8, 24, 16, 5)], lights: [screenLight(16, -6, 14, 0.18)] });
  },
});

function queueRope(ramp: Ramp): (facing: Dir) => Variant {
  return (facing) => {
    const chrome = mat(steel);
    const rope = mat(ramp);
    const post = (p: Pen, x: number, y: number) => {
      p.ellipse(x - 3, y - 2, 8, 4, chrome.line);
      p.ellipse(x - 2, y - 2, 6, 3, chrome.light);
      p.rect(x, y - 18, 2, 17, chrome.base);
      p.vline(x, y - 18, 17, chrome.hi);
      p.disc(x - 1, y - 21, 4, chrome.light);
      p.px(x - 1, y - 21, chrome.hi);
    };
    const parts = single(area(1, 1, 28), 24, (p) => {
      if (facing === 'down') {
        post(p, 3, 18);
        post(p, 27, 18);
        for (let x = 5; x < 28; x++) {
          const t = (x - 5) / 22;
          const y = -2 + Math.round(Math.sin(t * Math.PI) * 5);
          p.px(x, y, rope.base);
          p.px(x, y + 1, rope.dark);
        }
      } else {
        post(p, 15, 6);
        post(p, 15, 30);
        for (let y = -12; y < 12; y++) {
          const x = 16 - Math.round(Math.sin(((y + 12) / 24) * Math.PI) * 2);
          p.px(x, y, rope.base);
          p.px(x + 1, y, rope.dark);
        }
      }
    });
    const shadows = facing === 'down' ? [shadow(0, 16, 8, 4), shadow(24, 16, 8, 4)] : [shadow(12, 4, 8, 4), shadow(12, 28, 8, 3)];
    return makeVariant({ w: 1, h: 1, parts, shadows });
  };
}

for (const [id, name, ramp] of [['queue.rope.red', 'Queue rope (red)', red], ['queue.rope.navy', 'Queue rope (navy)', navy]] as const) {
  defineAsset({
    id, name, group: 'queue.rope', category: 'Decor', layer: 'object', placement: 'free', facings: ['down', 'left'],
    keywords: ['queue', 'rope', 'stanchion', 'barrier', 'line', 'lobby'], build: queueRope(ramp),
  });
}

defineAsset({
  id: 'rack.brochure', name: 'Brochure rack', group: 'rack.brochure', category: 'Decor', layer: 'object', placement: 'wall', facings: DOWN,
  keywords: ['brochure', 'leaflet', 'pamphlet', 'flyers', 'rack', 'government', 'lobby', 'read'],
  build: fixture({
    w: 22, d: 8, h: 42, m: mat(steel, 1), act: 'read',
    front(p, g) {
      const f = faceOf(g);
      const ramps = [sage, terracotta, navy, mustard, teal, cream, red, sage];
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 2; c++) {
          const x = f.x + 1 + c * 10;
          const y = f.y + 1 + r * 9;
          const m = mat(ramps[r * 2 + c]);
          p.rect(x, y, 9, 7, m.light);
          p.hline(x, y, 9, m.hi);
          p.hline(x + 2, y + 2, 5, m.dark);
          p.hline(x + 2, y + 4, 3, cream[6]);
          p.rect(x, y + 5, 9, 3, rgba(glassTint, 0.55));
          p.hline(x, y + 5, 9, glassGlint);
        }
      }
      p.rect(f.x, f.y + f.h - 4, f.w, 3, mat(steel).dark);
    },
  }),
});

defineAsset({
  id: 'wall.map', name: 'World map', group: 'wall.map', category: 'Decor', layer: 'wall', facings: DOWN,
  keywords: ['map', 'world', 'atlas', 'pins', 'government', 'school', 'geography'],
  build() {
    const parts = single({ x: 0, y: -10, w: 64, h: 36 }, 1, (p) => {
      const frame = mat(oak, 1);
      box(p, 6, -6, 52, 2, 26, frame);
      const x = 8;
      const y = -3;
      const w = 48;
      const h = 21;
      p.rect(x, y, w, h, water[4]);
      for (let gx = x + 6; gx < x + w; gx += 8) {
        p.vline(gx, y, h, water[5]);
      }
      p.hline(x, y + 10, w, water[5]);
      const land = (lx: number, ly: number, lw: number, lh: number, c: string) => p.ellipse(x + lx, y + ly, lw, lh, c);
      land(3, 2, 12, 8, sage[3]);
      land(8, 9, 6, 10, sage[3]);
      land(20, 2, 9, 7, mustard[3]);
      land(21, 8, 8, 10, terracotta[4]);
      land(29, 1, 16, 9, sage[4]);
      land(38, 13, 7, 5, mustard[3]);
      p.rect(x + 9, y + 4, 3, 2, sage[4]);
      p.rect(x + 32, y + 3, 4, 2, sage[5]);
      for (const [px, py, c] of [[12, 5, red[2]], [24, 10, mustard[4]], [36, 4, red[2]], [41, 15, blue[3]]] as const) {
        p.px(x + px, y + py, c);
        p.px(x + px, y + py - 1, cream[6]);
      }
      p.line(x + 12, y + 5, x + 24, y + 10, red[1]);
      p.line(x + 24, y + 10, x + 36, y + 4, red[1]);
    });
    return makeVariant({ w: 2, h: 1, mask: ['..'], parts, spots: [stand(0, 1, 'up', 'read', 16)] });
  },
});

defineAsset({
  id: 'flag.stand', name: 'Flag stand', group: 'flag.stand', category: 'Decor', layer: 'object', placement: 'corner', facings: DOWN,
  keywords: ['flag', 'flags', 'banner', 'government', 'ceremony', 'school'],
  build() {
    const brass = mat(yellow);
    const parts = single(area(1, 1, 64), 24, (p) => {
      box(p, 6, 18, 20, 8, 5, mat(walnut), { round: 1 });
      const flag = (top: number, poleX: number, dir: number, ramp: Ramp, accent: string) => {
        const m = mat(ramp);
        const x0 = dir > 0 ? poleX + 1 : poleX - 10;
        organic(p, x0 - 1, top - 1, 12, 34, (q) => {
          for (let i = 0; i < 10; i++) {
            const x = dir > 0 ? x0 + i : x0 + 9 - i;
            const len = 30 - Math.round(i * 0.9);
            const tone = i % 4 === 1 ? m.dark : i % 4 === 3 ? m.light : m.base;
            q.vline(x, top + Math.round(i * 0.4), len, tone);
          }
          q.rect(dir > 0 ? x0 + 2 : x0 + 3, top + 6, 5, 5, accent);
        });
      };
      flag(-44, 12, -1, navy, mustard[4]);
      flag(-42, 20, 1, terracotta, cream[6]);
      for (const [x, lean] of [[12, -1], [20, 1]] as const) {
        p.line(x, 20, x + lean, -48, brass.dark);
        p.line(x + 1, 20, x + 1 + lean, -48, brass.light);
        p.disc(x + lean - 1, -52, 4, brass.base);
        p.px(x + lean, -52, brass.hi);
      }
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(6, 22, 20, 6, 'rect')] });
  },
});

function waitingSeats(ramp: Ramp): (facing: Dir) => Variant {
  return (facing) => {
    const shell = mat(ramp);
    const back = mat(ramp, 1);
    const frame = mat(steel, 1);
    const parts = layered(area(3, 1, 28), (L) => {
      const s = L(Z_SEAT);
      const beamY = facing === 'down' ? 20 : 24;
      for (const x of [6, 47, 88]) {
        leg(s, x, beamY, 29 - beamY, frame, 2);
        s.rect(x - 3, 29, 8, 1, frame.line);
      }
      s.rect(3, beamY, 90, 2, frame.base);
      s.hline(3, beamY, 90, frame.light);
      for (let i = 0; i < 3; i++) {
        const x = i * T;
        if (facing === 'down') {
          cushion(s, x + 6, -20, 20, 4, 22, back, 3);
          s.hline(x + 9, -12, 14, back.dark);
          cushion(s, x + 5, 3, 22, 11, 6, shell, 2);
        } else {
          cushion(s, x + 5, 6, 22, 12, 6, shell, 2);
          const b = L(Z_FRONT);
          cushion(b, x + 6, 8, 20, 4, 20, back, 3);
          b.vline(x + 9, 11, 14, back.light);
        }
      }
      const arms = facing === 'down' ? L(Z_SEAT) : L(Z_FRONT);
      for (const x of [1, 30, 62, 93]) {
        box(arms, x, facing === 'down' ? 6 : 10, 3, 6, 8, frame, { edge: 'soft' });
      }
    });
    return makeVariant({
      w: 3,
      h: 1,
      mask: ['sss'],
      spots: [0, 1, 2].map((i) => seat(facing, i, 0)),
      parts,
      shadows: [shadow(2, facing === 'down' ? 18 : 22, 92, 10, 'rect')],
    });
  };
}

for (const [id, name, ramp] of [
  ['seating.waiting.navy', 'Waiting seats (navy)', navy],
  ['seating.waiting.terracotta', 'Waiting seats (terracotta)', terracotta],
  ['seating.waiting.teal', 'Waiting seats (teal)', teal],
] as const) {
  defineAsset({
    id, name, group: 'seating.waiting', category: 'Lounge', layer: 'object', placement: 'wall', facings: ['down', 'up'],
    keywords: ['waiting', 'seats', 'chairs', 'bench', 'lobby', 'government', 'reception'], build: waitingSeats(ramp),
  });
}

defineAsset({
  id: 'gate.badge', name: 'Badge gate', group: 'gate', category: 'Structure', layer: 'object', placement: 'free', facings: DOWN, door: true,
  keywords: ['turnstile', 'gate', 'badge', 'security', 'lobby', 'entrance', 'access'],
  build() {
    const body = mat(steel);
    const top = mat(charcoal);
    const frames = [0, 0.34, 0.67, 1].map((t) =>
      single(area(1, 1, 24), 26, (p) => {
        const len = Math.round(9 * (1 - t));
        for (const [x, dir] of [[0, 1], [26, -1]] as const) {
          box(p, x, -14, 6, 20, 20, body, { round: 1 });
          p.rect(x + 1, -13, 4, 18, top.base);
          p.hline(x + 1, -13, 4, top.light);
          p.vline(x + (dir > 0 ? 5 : 0), -10, 14, screenGlow[0]);
          if (len > 0) {
            const fx = dir > 0 ? x + 6 : x - len;
            p.rect(fx, -2, len, 12, rgba(glassTint, 0.5));
            p.hline(fx, -2, len, glassGlint);
            p.vline(dir > 0 ? fx + len - 1 : fx, -2, 12, rgba(glassGlint, 0.8));
          }
        }
        p.rect(1, -11, 4, 3, top.dark);
        p.px(2, -10, t > 0.5 ? plant[5] : red[2]);
      }),
    );
    return makeVariant({
      w: 1, h: 1, mask: ['.'], frames, anim: { kind: 'door' },
      shadows: [shadow(0, 6, 6, 20, 'rect'), shadow(26, 6, 6, 20, 'rect')],
    });
  },
});

// =========================================================================================================
// Partitions (2x1 freestanding screens)

function partition(kind: 'fabric' | 'glass', ramp: Ramp): (facing: Dir) => Variant {
  return (facing) => {
    const al = mat(steel);
    const cloth = mat(ramp);
    const vertical = facing === 'left';
    const parts = single(vertical ? area(1, 2, 40) : area(2, 1, 40), vertical ? 64 : 32, (p) => {
      if (vertical) {
        box(p, 14, -24, 4, 58, 2, al);
        if (kind === 'fabric') {
          p.rect(15, -23, 2, 56, cloth.base);
          p.vline(15, -23, 56, cloth.light);
        } else {
          p.rect(15, -23, 2, 56, rgba(glassTint, 0.6));
        }
        box(p, 13, 34, 6, 2, 28, kind === 'fabric' ? cloth : al, { edge: 'line' });
        if (kind === 'glass') {
          p.rect(14, 37, 4, 22, rgba(glassTint, 0.5));
        }
        for (const y of [-26, 58]) {
          p.rect(11, y + 2, 10, 2, al.dark);
        }
        return;
      }
      for (const x of [6, 54]) {
        p.rect(x - 3, 27, 10, 2, al.dark);
        p.hline(x - 3, 27, 10, al.light);
      }
      box(p, 2, -2, 60, 3, 30, al, { edge: 'lip' });
      if (kind === 'fabric') {
        p.rect(4, 2, 56, 23, cloth.base);
        weave(p, 4, 2, 56, 23, cloth.dark, 7);
        p.hline(4, 2, 56, cloth.light);
        p.rect(4, 2, 56, 4, rgba(glassTint, 0.5));
        p.hline(4, 6, 56, al.base);
        // a pinned note and a little calendar
        p.rect(10, 10, 6, 6, mustard[4]);
        p.px(12, 10, red[2]);
        p.rect(44, 9, 9, 8, cream[6]);
        p.hline(44, 9, 9, red[1]);
        dither(p, 45, 11, 7, 5, cream[3], 0.4);
      } else {
        p.erase(4, 2, 56, 23);
        p.rect(4, 2, 56, 23, rgba(glassTint, 0.45));
        p.rect(4, 12, 56, 4, rgba(steel[6], 0.7));
        for (let i = 2; i < 18; i++) {
          p.px(4 + 30 - i, 3 + i, glassGlint);
        }
      }
    });
    if (vertical) {
      return makeVariant({ w: 1, h: 2, parts, shadows: [shadow(12, 6, 8, 54, 'rect')] });
    }
    return makeVariant({ w: 2, h: 1, parts, shadows: [shadow(2, 24, 60, 5, 'rect')] });
  };
}

for (const [id, name, kind, ramp] of [
  ['partition.fabric.teal', 'Office partition (teal fabric)', 'fabric', teal],
  ['partition.fabric.sage', 'Office partition (sage fabric)', 'fabric', sage],
  ['partition.glass', 'Office partition (glass)', 'glass', steel],
] as const) {
  defineAsset({
    id, name, group: 'partition', category: 'Work', layer: 'object', placement: 'free', facings: ['down', 'left'],
    keywords: ['partition', 'divider', 'screen', 'cubicle', 'panel', 'privacy'], build: partition(kind, ramp),
  });
}

// =========================================================================================================
// Service counters (2x2): clerk seat behind, counter with a raised ledge in front

function counter(kind: 'service' | 'help'): () => Variant {
  return () => {
    const chair = variant('chair.office.charcoal', 'down')!.frames[0];
    const panel = kind === 'service' ? mat(navy) : mat(teal);
    const top = mat(cream);
    const work = mat(kind === 'service' ? oak : steel, 1);
    const parts = layered(area(2, 2, 44), (L) => {
      for (const part of chair) {
        L(part.z).blit(part.canvas, part.x, part.y);
      }
      const p = L(64);
      box(p, 2, 16, 60, 12, 4, work, { edge: 'line' });
      // monitor seen from behind, plus what's on the desk
      const m = mat(charcoal);
      box(p, 30, 6, 18, 2, 11, m, { round: 1 });
      p.rect(37, 19, 4, 4, m.dark);
      if (kind === 'help') {
        // parts bins and a laptop being fixed
        for (const [i, c] of [blue[3], red[2], mustard[4]].entries()) {
          box(p, 6 + i * 7, 14, 6, 4, 4, mat(steel), { edge: 'soft' });
          p.rect(7 + i * 7, 15, 4, 2, c);
        }
        box(p, 50, 20, 10, 5, 1, mat(steel), { edge: 'soft' });
      } else {
        p.rect(8, 19, 9, 5, cream[6]);
        p.hline(9, 21, 6, cream[3]);
      }
      box(p, 0, 26, 64, 8, 3, top, { round: 2 });
      p.rect(2, 33, 60, 26, panel.base);
      for (let x = 6; x < 60; x += 8) {
        p.vline(x, 34, 24, panel.dark);
        p.vline(x + 1, 34, 24, panel.light);
      }
      p.hline(2, 33, 60, panel.deep);
      p.rect(2, 58, 60, 4, panel.deep);
      p.hline(2, 61, 60, panel.line);
      p.vline(1, 33, 29, panel.line);
      p.vline(62, 33, 29, panel.line);
      const sign = kind === 'service' ? 'SERVICE' : 'IT HELP';
      p.rect(16, 40, 32, 9, cream[6]);
      p.frame(16, 40, 32, 9, panel.line);
      text(p, 19, 42, sign, panel.dark);
      if (kind === 'service') {
        // glass screen with a speaking hole and a document slot
        const g = L(65);
        g.rect(2, 2, 60, 24, rgba(glassTint, 0.38));
        g.frame(2, 2, 60, 24, mat(steel).base);
        g.hline(2, 2, 60, mat(steel).hi);
        g.ellipse(26, 12, 12, 6, rgba(steel[2], 0.6));
        for (let i = 2; i < 14; i++) {
          g.px(52 - i, 3 + i, glassGlint);
        }
        g.rect(20, 26, 24, 2, mat(steel).dark);
      } else {
        // a spare monitor box and a cable coil on the ledge
        box(p, 44, 14, 16, 6, 12, mat(dirt, 1), { edge: 'line' });
        p.hline(46, 24, 12, cream[5]);
        p.ellipse(8, 27, 9, 5, charcoal[3]);
        p.ellipse(10, 28, 5, 3, top.light);
      }
    });
    return makeVariant({
      w: 2,
      h: 2,
      mask: ['s.', '##'],
      spots: [{ dx: 0, dy: 0, facing: 'down', pose: 'sit', activity: kind === 'service' ? 'reception' : 'it', py: 6 }],
      parts,
      shadows: [shadow(0, 54, 64, 8, 'rect'), shadow(6, 30, 20, 7)],
      lights: [screenLight(39, 12, 16, 0.12)],
    });
  };
}

defineAsset({
  id: 'counter.service', name: 'Service counter (glass)', group: 'counter.service', category: 'Work', layer: 'object', placement: 'free', facings: DOWN,
  keywords: ['counter', 'service', 'government', 'clerk', 'window', 'bank', 'reception'], build: counter('service'),
});

defineAsset({
  id: 'counter.helpdesk', name: 'IT help desk', group: 'counter.service', category: 'Work', layer: 'object', placement: 'free', facings: DOWN,
  keywords: ['it', 'help desk', 'support', 'tech', 'repair', 'counter', 'it office'], build: counter('help'),
});

// =========================================================================================================
// Server room: cabinets, UPS, cooling unit, cable tray, patch panel

function serverRows(p: Pen, x: number, y: number, w: number, rows: number, frame: number, leds: string[]): void {
  const m = mat(charcoal);
  for (let r = 0; r < rows; r++) {
    const ry = y + r * 5;
    p.rect(x, ry, w, 4, m.dark);
    p.hline(x, ry, w, m.base);
    for (let vx = x + w - 9; vx < x + w - 1; vx += 2) {
      p.px(vx, ry + 2, m.deep);
    }
    for (let i = 0; i < 3; i++) {
      const on = (r * 7 + i * 5 + frame * (i + 1)) % 4 !== 0;
      p.px(x + 2 + i * 2, ry + 2, on ? leds[(r + i) % leds.length] : m.deep);
    }
  }
}

function serverCabinet(ramp: Ramp, shift: number, leds: string[]): (facing: Dir) => Variant {
  const m = mat(ramp, shift);
  return fixture({
    w: 24, d: 14, h: 52, m, act: 'server', frames: 4, fps: 3,
    front(p, g, frame) {
      const f = faceOf(g);
      // cable bundle leaving the top toward the wall tray
      for (const [i, c] of [navy[3], mustard[3], teal[4]].entries()) {
        p.vline(g.x + 6 + i * 2, g.y - 6, 7, c);
      }
      p.rect(f.x + 2, f.y + 2, f.w - 4, f.h - 7, mat(charcoal).deep);
      serverRows(p, f.x + 3, f.y + 4, f.w - 6, 8, frame, leds);
      glassOver(p, f.x + 2, f.y + 2, f.w - 4, f.h - 7, 0.14);
      p.frame(f.x + 2, f.y + 2, f.w - 4, f.h - 7, m.line);
      p.vline(f.x + f.w - 2, f.y + 14, 9, mat(steel).hi);
      p.rect(f.x + 3, f.y + f.h - 4, f.w - 6, 2, m.dark);
      p.rect(f.x, f.y + f.h - 1, 3, 2, m.line);
      p.rect(f.x + f.w - 3, f.y + f.h - 1, 3, 2, m.line);
    },
    side(p, g, frame) {
      const s = sideStrip(p, g, m);
      for (let i = 0; i < 8; i++) {
        const on = (i * 5 + frame) % 3 !== 0;
        p.px(s.x, s.y + 14 + i * 5, on ? leds[i % leds.length] : m.deep);
      }
      for (let y = g.y + g.d + 6; y < g.y + g.d + g.h - 8; y += 3) {
        p.hline(g.x + 3, y, g.w - 6, m.dark);
      }
    },
    lights: (g, side) => [side === 'down' ? screenLight(16, g.y + g.d + 24, 18, 0.14) : screenLight(g.x - 2, g.y + 30, 14, 0.1)],
  });
}

defineAsset({
  id: 'rack.cabinet.dark', name: 'Server cabinet (graphite)', group: 'rack.cabinet', category: 'Work', layer: 'object', placement: 'wall',
  facings: SIDES, keywords: ['server', 'rack', 'cabinet', 'data center', 'network', 'server room'],
  build: serverCabinet(charcoal, 1, [screenGlow[0], blue[3], plant[5]]),
});

defineAsset({
  id: 'rack.cabinet.white', name: 'Server cabinet (white)', group: 'rack.cabinet', category: 'Work', layer: 'object', placement: 'wall',
  facings: SIDES, keywords: ['server', 'rack', 'cabinet', 'data center', 'network', 'server room'],
  build: serverCabinet(steel, 0, [plant[5], mustard[4], plant[6]]),
});

{
  const m = mat(charcoal, 1);
  defineAsset({
    id: 'ups', name: 'UPS battery unit', group: 'ups', category: 'Work', layer: 'object', placement: 'wall', facings: SIDES,
    keywords: ['ups', 'battery', 'power', 'backup', 'server room', 'data center'],
    build: fixture({
      w: 22, d: 14, h: 30, m, act: 'server', frames: 2, fps: 1,
      front(p, g, frame) {
        const f = faceOf(g);
        p.rect(f.x + 3, f.y + 2, 14, 7, m.line);
        p.rect(f.x + 4, f.y + 3, 12, 5, mix(sage[3], screenGlow[0], 0.3));
        for (let i = 0; i < 4; i++) {
          p.rect(f.x + 5 + i * 3, f.y + 4, 2, 3, i < 3 + frame ? sage[5] : sage[2]);
        }
        p.disc(f.x + f.w - 5, f.y + 3, 3, plant[5]);
        for (let y = f.y + 12; y < f.y + f.h - 4; y += 2) {
          p.hline(f.x + 3, y, f.w - 6, m.deep);
        }
        p.hline(f.x + 1, f.y + 10, f.w - 2, m.light);
        p.rect(f.x + 3, g.y + 2, 6, 2, mustard[3]);
      },
      side(p, g) {
        const s = sideStrip(p, g, m);
        p.px(s.x, s.y + 6, plant[5]);
        for (let y = g.y + g.d + 4; y < g.y + g.d + g.h - 4; y += 2) {
          p.hline(g.x + 3, y, g.w - 6, m.deep);
        }
      },
      lights: (g, side) => [screenLight(side === 'down' ? 12 : g.x - 2, g.y + g.d + 6, 10, 0.12)],
    }),
  });
}

{
  const m = mat(steel);
  defineAsset({
    id: 'cooling.unit', name: 'Precision cooling unit', group: 'cooling', category: 'Work', layer: 'object', placement: 'wall', facings: SIDES,
    keywords: ['cooling', 'air conditioning', 'ac', 'crac', 'hvac', 'server room', 'data center'],
    build: fixture({
      w: 28, d: 14, h: 50, m, frames: 3, fps: 8,
      front(p, g, frame) {
        const f = faceOf(g);
        p.rect(f.x + 2, f.y + 2, f.w - 4, 6, m.line);
        p.rect(f.x + 3, f.y + 3, 9, 4, screenGlow[0]);
        text(p, f.x + 4, f.y + 3, 'C', mat(navy).dark);
        p.px(f.x + 10, f.y + 4, mat(navy).dark);
        for (const fy of [f.y + 11, f.y + 26]) {
          const cx = f.x + Math.floor(f.w / 2);
          p.disc(cx - 7, fy, 14, m.line);
          p.disc(cx - 6, fy + 1, 12, m.deep);
          for (let b = 0; b < 3; b++) {
            const a = (b * 2 * Math.PI) / 3 + frame * 0.7;
            p.line(cx, fy + 7, cx + Math.round(Math.cos(a) * 5), fy + 7 + Math.round(Math.sin(a) * 5), m.base);
          }
          p.rect(cx - 1, fy + 6, 2, 2, m.light);
          for (let y = fy + 1; y < fy + 14; y += 2) {
            p.hline(cx - 6, y, 12, m.dark);
          }
        }
        p.rect(f.x + 1, f.y + f.h - 6, f.w - 2, 5, m.dark);
        for (let x = f.x + 3; x < f.x + f.w - 3; x += 3) {
          p.vline(x, f.y + f.h - 5, 3, m.deep);
        }
      },
      side(p, g) {
        sideStrip(p, g, m);
        for (let y = g.y + g.d + 4; y < g.y + g.d + g.h - 6; y += 2) {
          p.hline(g.x + 3, y, g.w - 6, m.dark);
        }
      },
    }),
  });
}

defineAsset({
  id: 'wall.cabletray', name: 'Cable tray', group: 'wall.cabletray', category: 'Work', layer: 'wall', facings: DOWN,
  keywords: ['cable', 'tray', 'ladder', 'wires', 'server room', 'data center', 'network'],
  build() {
    const al = mat(steel);
    const parts = single({ x: 0, y: -12, w: 64, h: 44 }, 1, (p) => {
      const cables = [navy[3], mustard[3], teal[4], terracotta[4]];
      // brackets, then the tray's back rail, the cables lying in it, and the front rail
      for (const x of [14, 46]) {
        p.rect(x, -4, 2, 5, al.dark);
        p.px(x, -4, al.light);
      }
      p.hline(0, -9, 64, al.base);
      cables.forEach((c, i) => {
        for (let x = 0; x < 64; x++) {
          p.px(x, -8 + (i % 2) + (((x >> 4) + i) % 2), c);
        }
      });
      p.rect(0, -6, 64, 2, al.light);
      p.hline(0, -4, 64, al.line);
      for (let x = 4; x < 64; x += 8) {
        p.px(x, -6, al.hi);
      }
      // one bundle dropping down to the floor, with two cable ties
      cables.forEach((c, i) => p.vline(52 + i, -4, 34, c));
      for (const y of [8, 20]) {
        p.hline(51, y, 6, al.dark);
      }
    });
    return makeVariant({ w: 2, h: 1, mask: ['..'], parts });
  },
});

defineAsset({
  id: 'wall.patchpanel', name: 'Network switch panel', group: 'wall.network', category: 'Work', layer: 'wall', facings: DOWN,
  keywords: ['network', 'switch', 'patch panel', 'ethernet', 'router', 'server room', 'it'],
  build() {
    const m = mat(charcoal);
    const frames: Part[][] = [0, 1, 2, 3].map((f) =>
      single({ x: 0, y: -10, w: 32, h: 42 }, 1, (p) => {
        box(p, 3, -4, 26, 3, 18, m, { round: 1 });
        for (const [r, y] of [-1, 6].entries()) {
          p.rect(5, y, 22, 5, m.dark);
          p.hline(5, y, 22, m.base);
          for (let i = 0; i < 8; i++) {
            p.px(7 + i * 2, y + 3, m.deep);
            const on = (i * 3 + r * 5 + f * (i % 3 + 1)) % 4 !== 0;
            p.px(7 + i * 2, y + 1, on ? (i % 3 === 0 ? mustard[4] : plant[5]) : m.deep);
          }
        }
        const cols = [blue[3], mustard[3], red[2], plant[4], blue[3]];
        cols.forEach((c, i) => {
          const x = 8 + i * 4;
          const drop = 6 + ((i * 5) % 7);
          p.vline(x, 14, drop, c);
          p.line(x, 14 + drop, x + 2, 16 + drop, c);
        });
      }),
    );
    return makeVariant({
      w: 1, h: 1, mask: ['.'], frames, anim: { kind: 'loop', fps: 3 },
      spots: [stand(0, 1, 'up', 'server')], lights: [screenLight(16, 4, 14, 0.12)],
    });
  },
});

// =========================================================================================================
// IT help office: repair bench, spare-parts shelf, monitor stack

defineAsset({
  id: 'bench.repair', name: 'Repair bench', group: 'bench.repair', category: 'Work', layer: 'object', placement: 'wall', facings: DOWN,
  keywords: ['repair', 'bench', 'workbench', 'it', 'soldering', 'electronics', 'tools', 'it office'],
  build: wide(62, 24, 40, (p, g) => {
    const wood = mat(oak, 1);
    const frame = mat(steel, 1);
    const peg = mat(cream, 1);
    // pegboard with tools against the wall
    box(p, g.x + 3, g.y, g.w - 6, 2, 22, peg, { edge: 'soft' });
    for (let y = g.y + 4; y < g.y + 22; y += 4) {
      for (let x = g.x + 6; x < g.x + g.w - 6; x += 4) {
        p.px(x, y, peg.dark);
      }
    }
    const tool = (x: number, y: number, len: number, head: string) => {
      p.vline(x, y, len, mat(charcoal).light);
      p.rect(x - 1, y + len, 3, 4, head);
    };
    tool(g.x + 10, g.y + 5, 7, red[1]);
    tool(g.x + 16, g.y + 4, 8, mustard[3]);
    tool(g.x + 22, g.y + 5, 6, blue[2]);
    p.ellipse(g.x + 44, g.y + 5, 9, 9, mat(charcoal).base);
    p.ellipse(g.x + 46, g.y + 7, 5, 5, peg.light);
    // bench top and frame
    leg(p, g.x + 2, 4, 24, frame, 2);
    leg(p, g.x + g.w - 4, 4, 24, frame, 2);
    p.rect(g.x + 3, 22, g.w - 6, 2, frame.base);
    box(p, g.x, -14, g.w, 18, 4, wood);
    grain(p, g.x + 2, -13, g.w - 4, 16, wood.base, 61);
    // an opened PC case, a magnifier lamp, a soldering station
    const case_ = mat(charcoal, 1);
    box(p, g.x + 6, -20, 18, 10, 8, case_, { round: 1 });
    p.rect(g.x + 8, -18, 14, 6, mat(sage, 1).dark);
    p.rect(g.x + 10, -17, 4, 3, case_.light);
    p.hline(g.x + 15, -15, 6, mustard[3]);
    p.px(g.x + 19, -13, plant[5]);
    box(p, g.x + 30, -8, 10, 6, 3, mat(terracotta), { round: 1 });
    p.rect(g.x + 31, -7, 3, 2, screenGlow[0]);
    p.line(g.x + 40, -6, g.x + 44, -2, mat(charcoal).light);
    const lamp = mat(charcoal);
    p.line(g.x + 52, -6, g.x + 50, -20, lamp.base);
    p.line(g.x + 50, -20, g.x + 44, -24, lamp.base);
    p.ellipse(g.x + 39, -27, 10, 5, lamp.line);
    p.ellipse(g.x + 40, -26, 8, 3, rgba(glassTint, 0.7));
    p.rect(g.x + 49, -7, 6, 2, lamp.base);
  }, 'it', [warmLight(44, -20, 40, 0.35)]),
});

defineAsset({
  id: 'shelf.parts', name: 'Spare-parts shelf', group: 'shelf.parts', category: 'Work', layer: 'object', placement: 'wall', facings: DOWN,
  keywords: ['parts', 'spares', 'shelf', 'bins', 'cables', 'it', 'storage', 'it office'],
  build: wide(60, 12, 46, (p, g) => {
    const m = mat(steel, 1);
    box(p, g.x, g.y, g.w, g.d, g.h, m);
    const f = faceOf(g);
    const binRamps = [blue, red, mustard, sage, blue, teal, red, mustard];
    for (let r = 0; r < 3; r++) {
      const y = f.y + 1 + r * 14;
      p.rect(f.x + 1, y, f.w - 2, 12, m.deep);
      if (r < 2) {
        for (let c = 0; c < 6; c++) {
          const bm = mat(binRamps[(c + r * 3) % binRamps.length]);
          const x = f.x + 2 + c * 9;
          p.rect(x, y + 4, 8, 8, bm.base);
          p.hline(x, y + 4, 8, bm.light);
          p.rect(x + 2, y + 6, 4, 2, cream[6]);
          if ((c + r) % 3 === 0) {
            p.line(x + 2, y + 4, x + 4, y + 1, mat(charcoal).light);
          }
        }
      } else {
        // boxed spares and coiled cables
        box(p, f.x + 3, y + 3, 14, 3, 6, mat(dirt, 1), { edge: 'line' });
        box(p, f.x + 18, y + 1, 12, 3, 8, mat(dirt, 1), { edge: 'line' });
        p.hline(f.x + 20, y + 7, 8, cream[5]);
        for (const [x, c] of [[f.x + 34, blue[3]], [f.x + 44, charcoal[4]]] as const) {
          p.ellipse(x, y + 4, 9, 8, c);
          p.ellipse(x + 2, y + 6, 5, 4, m.deep);
        }
      }
      p.hline(f.x, y + 12, f.w, m.light);
      p.hline(f.x, y + 13, f.w, m.dark);
    }
  }, 'it'),
});

defineAsset({
  id: 'stack.monitors', name: 'Stack of monitors', group: 'stack.monitors', category: 'Work', layer: 'object', placement: 'corner', facings: DOWN,
  keywords: ['monitors', 'boxes', 'stack', 'spare', 'it', 'equipment', 'it office'],
  build() {
    const card = mat(dirt, 1);
    const parts = single(area(1, 1, 48), 24, (p) => {
      box(p, 3, 4, 24, 8, 16, card, { edge: 'line' });
      box(p, 5, -12, 22, 8, 16, card, { edge: 'line' });
      for (const y of [12, -4]) {
        p.hline(6, y + 4, 18, cream[5]);
        p.rect(8, y + 7, 9, 5, mat(charcoal).base);
        p.rect(9, y + 8, 7, 3, mat(charcoal).light);
      }
      // a loose monitor on top, screen dark
      const m = mat(charcoal);
      p.rect(13, -14, 6, 2, m.line);
      screen(p, 6, -28, 20, 14, false);
      p.rect(14, -15, 3, 2, m.dark);
      p.hline(3, 28, 24, card.line);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(3, 22, 24, 8, 'rect')] });
  },
});

// =========================================================================================================
// Janitor closet: supply shelving, mop sink, mop bucket, vacuum, wet-floor sign

{
  const m = mat(steel, 1);
  defineAsset({
    id: 'shelf.supplies', name: 'Cleaning supply shelf', group: 'shelf.supplies', category: 'Restroom', layer: 'object', placement: 'wall',
    facings: SIDES, keywords: ['janitor', 'cleaning', 'supplies', 'shelf', 'bottles', 'paper towels', 'closet', 'clean'],
    build: fixture({
      w: 28, d: 10, h: 46, m, act: 'clean',
      front(p, g) {
        const f = faceOf(g);
        for (const [r, y] of [f.y + 1, f.y + 15, f.y + 29].entries()) {
          p.rect(f.x + 1, y, f.w - 2, 13, m.deep);
          const bottom = y + 13;
          if (r === 0) {
            for (let i = 0; i < 3; i++) {
              cylinder(p, f.x + 2 + i * 8, bottom - 9, 7, 9, mat(cream), 3, cream[4]);
            }
          } else if (r === 1) {
            for (const [i, ramp] of [teal, mustard, red, blue].entries()) {
              const b = mat(ramp);
              const x = f.x + 2 + i * 6;
              p.rect(x, bottom - 8, 5, 8, b.base);
              p.vline(x, bottom - 8, 8, b.light);
              p.rect(x + 1, bottom - 11, 2, 3, b.dark);
              p.rect(x + 1, bottom - 5, 3, 2, cream[6]);
            }
          } else {
            box(p, f.x + 2, bottom - 9, 12, 3, 6, mat(dirt, 1), { edge: 'line' });
            cylinder(p, f.x + 16, bottom - 8, 8, 8, mat(sage), 3, sage[1]);
          }
          p.hline(f.x, bottom, f.w, m.light);
        }
      },
      side(p, g) {
        const s = sideStrip(p, g, m);
        for (const [y, c] of [[s.y + 8, cream[5]], [s.y + 22, teal[4]], [s.y + 36, mustard[4]]] as const) {
          p.rect(s.x - 1, y, 3, 4, c);
        }
      },
    }),
  });
}

{
  const m = mat(steel, 1);
  defineAsset({
    id: 'sink.mop', name: 'Mop sink', group: 'sink.mop', category: 'Restroom', layer: 'object', placement: 'wall', facings: SIDES,
    keywords: ['mop sink', 'utility sink', 'janitor', 'cleaning', 'closet', 'basin', 'clean'],
    build: fixture({
      w: 26, d: 20, h: 12, m, act: 'clean',
      front(p, g) {
        p.rect(g.x + 3, g.y + 2, g.w - 6, g.d - 4, m.deep);
        p.hline(g.x + 3, g.y + 2, g.w - 6, m.line);
        p.disc(g.x + 11, g.y + 9, 4, m.line);
        // tap on the wall and a hanging mop
        const chrome = mat(steel);
        p.rect(g.x + 11, g.y - 16, 4, 3, chrome.light);
        p.rect(g.x + 12, g.y - 13, 2, 8, chrome.base);
        p.px(g.x + 12, g.y - 5, chrome.dark);
        p.rect(g.x + 6, g.y - 18, 2, 3, red[2]);
        p.rect(g.x + 18, g.y - 18, 2, 3, blue[3]);
        const wood = mat(oak);
        p.vline(g.x + 23, g.y - 34, 30, wood.light);
        p.vline(g.x + 24, g.y - 34, 30, wood.dark);
        p.rect(g.x + 21, g.y - 6, 6, 8, cream[5]);
        p.vline(g.x + 22, g.y - 6, 8, cream[3]);
        p.vline(g.x + 25, g.y - 6, 8, cream[4]);
      },
      side(p, g) {
        p.rect(g.x + 2, g.y + 3, g.w - 4, g.d - 6, m.deep);
        const chrome = mat(steel);
        p.rect(g.x + g.w - 6, g.y - 14, 3, 10, chrome.base);
      },
    }),
  });
}

defineAsset({
  id: 'bucket.mop', name: 'Mop bucket', group: 'bucket.mop', category: 'Restroom', layer: 'object', placement: 'free', facings: DOWN,
  keywords: ['mop', 'bucket', 'wringer', 'janitor', 'cleaning', 'clean'],
  build() {
    const y = mat(mustard);
    const parts = single(area(1, 1, 40), 24, (p) => {
      // wheels, bucket with water, wringer, mop handle
      for (const x of [7, 22]) {
        p.rect(x, 26, 3, 3, mat(charcoal).line);
      }
      box(p, 5, 10, 22, 8, 10, y, { round: 2 });
      p.rect(7, 11, 12, 5, water[3]);
      p.hline(7, 11, 12, water[4]);
      box(p, 18, 6, 8, 6, 6, mat(charcoal), { round: 1 });
      p.line(21, 8, 25, -26, mat(steel).light);
      p.line(22, 8, 26, -26, mat(steel).dark);
      p.rect(24, -28, 4, 3, red[1]);
      p.rect(10, 22, 8, 2, y.dark);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(4, 24, 24, 6)] });
  },
});

defineAsset({
  id: 'vacuum', name: 'Vacuum cleaner', group: 'vacuum', category: 'Restroom', layer: 'object', placement: 'corner', facings: DOWN,
  keywords: ['vacuum', 'hoover', 'cleaner', 'janitor', 'cleaning', 'closet'],
  build() {
    const body = mat(red);
    const dark = mat(charcoal);
    const parts = single(area(1, 1, 40), 24, (p) => {
      // canister vacuum with a hose curling up to a wand leaning on it
      p.rect(6, 25, 3, 3, dark.line);
      p.rect(19, 25, 3, 3, dark.line);
      p.ellipse(4, 12, 22, 16, body.line);
      p.ellipse(5, 13, 20, 14, body.base);
      p.ellipse(7, 13, 12, 6, body.light);
      p.px(9, 14, cream[6]);
      p.rect(10, 22, 10, 2, dark.base);
      for (let i = 0; i < 9; i++) {
        const x = 22 + Math.round(Math.sin(i * 0.6) * 2);
        p.rect(x, 18 - i * 3, 3, 3, i % 2 ? dark.base : dark.light);
      }
      p.line(24, -10, 18, -30, mat(steel).light);
      p.line(25, -10, 19, -30, mat(steel).dark);
      p.rect(16, -33, 5, 4, dark.base);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(4, 22, 22, 7)] });
  },
});

defineAsset({
  id: 'sign.wetfloor', name: 'Wet floor sign', group: 'sign.wetfloor', category: 'Restroom', layer: 'object', placement: 'free', facings: DOWN,
  keywords: ['wet floor', 'caution', 'sign', 'janitor', 'cleaning', 'warning'],
  build() {
    const y = mat(yellow);
    const dark = mat(charcoal);
    const parts = single(area(1, 1, 24), 24, (p) => {
      paintFrame(p, 7, -6, 18, 34, y);
      // warning triangle with an exclamation mark, then two lines of text
      p.line(16, 0, 11, 9, dark.line);
      p.line(16, 0, 21, 9, dark.line);
      p.hline(11, 9, 11, dark.line);
      p.px(16, 3, dark.line);
      p.vline(16, 4, 3, dark.line);
      p.px(16, 8, dark.line);
      p.hline(11, 14, 10, dark.base);
      p.hline(12, 17, 8, dark.base);
      p.hline(9, 22, 14, y.dark);
    });
    return makeVariant({ w: 1, h: 1, mask: ['#'], parts, shadows: [shadow(6, 24, 20, 5)] });
  },
});

/** An A-frame sign seen from the front: tapered yellow board with a handle cut-out. */
function paintFrame(p: Pen, x: number, y: number, w: number, h: number, m: Mat): void {
  for (let r = 0; r < h; r++) {
    const inset = Math.round((1 - r / h) * 3);
    p.hline(x + inset, y + r, w - inset * 2, r === 0 ? m.line : m.light);
    p.px(x + inset, y + r, m.line);
    p.px(x + w - 1 - inset, y + r, m.line);
    p.px(x + w - 2 - inset, y + r, m.base);
  }
  p.hline(x, y + h - 1, w, m.line);
  p.rect(x + 5, y + 2, 4, 2, m.deep);
  p.hline(x - 1, y + h, 3, m.line);
  p.hline(x + w - 2, y + h, 3, m.line);
}

// =========================================================================================================
// Security office: CCTV wall, security desk; studio mixing desk shares the console body

function cctvFeed(p: Pen, x: number, y: number, w: number, h: number, seed: number): void {
  const bg = mix(sage[2], steel[3], 0.5);
  const fg = mix(sage[4], steel[5], 0.5);
  p.rect(x, y, w, h, bg);
  if (seed % 3 === 0) {
    p.line(x, y + h - 1, x + Math.floor(w / 2) - 1, y + 2, fg);
    p.line(x + w - 1, y + h - 1, x + Math.floor(w / 2), y + 2, fg);
  } else if (seed % 3 === 1) {
    p.rect(x + 2, y + 2, w - 6, h - 4, mix(sage[3], steel[4], 0.5));
    p.rect(x + w - 4, y + h - 5, 2, 3, fg);
  } else {
    p.hline(x, y + h - 3, w, fg);
    p.rect(x + 3, y + h - 6, 4, 3, fg);
  }
  p.hline(x, y, w, fg);
  if (seed === 0) {
    p.px(x + w - 2, y + 1, red[2]);
  }
}

defineAsset({
  id: 'wall.cctv', name: 'CCTV monitor wall', group: 'wall.cctv', category: 'Work', layer: 'wall', facings: DOWN,
  keywords: ['cctv', 'security', 'cameras', 'monitors', 'surveillance', 'screens', 'security office'],
  build() {
    const parts = single({ x: 0, y: -12, w: 64, h: 44 }, 1, (p) => {
      const m = mat(charcoal);
      box(p, 4, -8, 56, 2, 28, m, { round: 1 });
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          const x = 7 + c * 17;
          const y = -5 + r * 12;
          p.rect(x, y, 16, 11, m.line);
          cctvFeed(p, x + 1, y + 1, 14, 9, r * 3 + c);
        }
      }
    });
    return makeVariant({
      w: 2, h: 1, mask: ['..'], parts, spots: [stand(0, 1, 'up', 'cctv', 16)], lights: [screenLight(32, 4, 40, 0.28)],
    });
  },
});

interface ConsoleGear {
  up(p: Pen): void;
  down(p: Pen): void;
}

function consoleDesk(body: Mat, gear: ConsoleGear, light: Light): (facing: Dir) => Variant {
  return (facing) => {
    const parts = layered(area(2, 1, 36), (L) => {
      const p = L(32);
      const top = facing === 'down' ? -6 : -4;
      box(p, 0, top, 64, 16 - top, 14, body);
      p.rect(2, 18, 60, 9, body.dark);
      for (let x = 6; x < 60; x += 4) {
        p.vline(x, 20, 5, body.deep);
      }
      if (facing === 'up') {
        gear.up(p);
      } else {
        gear.down(p);
      }
    });
    return makeVariant({
      w: 2, h: 1, parts, shadows: [shadow(0, 14, 62, 16, 'rect')],
      lights: [facing === 'up' ? light : { ...light, intensity: light.intensity * 0.5 }],
    });
  };
}

function monitorBackSmall(p: Pen, cx: number, base: number, w: number): void {
  const m = mat(charcoal);
  box(p, cx - Math.floor(w / 2), base - 12, w, 2, 9, m, { round: 1 });
  p.rect(cx - 1, base - 3, 3, 4, m.dark);
}

const securityGear: ConsoleGear = {
  up(p) {
    const m = mat(charcoal);
    for (const [i, cx] of [12, 32, 52].entries()) {
      p.rect(cx - 2, -3, 4, 4, m.dark);
      p.rect(cx - 9, -17, 18, 14, m.line);
      cctvFeed(p, cx - 8, -16, 16, 12, i);
    }
    box(p, 20, 4, 18, 3, 1, mat(steel), { edge: 'soft' });
    // a radio and a coffee
    box(p, 46, 3, 5, 4, 7, m, { round: 1 });
    p.vline(47, -2, 5, m.light);
    p.px(48, 5, plant[5]);
    cylinder(p, 6, 3, 5, 6, mat(cream), 2, walnut[2]);
  },
  down(p) {
    for (const cx of [12, 32, 52]) {
      monitorBackSmall(p, cx, 8, 18);
    }
  },
};

const mixerGear: ConsoleGear = {
  up(p) {
    const m = mat(charcoal);
    // bridge with two preview screens
    box(p, 4, -20, 56, 4, 3, m);
    screen(p, 8, -18, 20, 12, true, 4);
    screen(p, 36, -18, 20, 12, true, 8);
    for (let i = 0; i < 12; i++) {
      const x = 4 + i * 5;
      p.vline(x + 1, 2, 7, m.deep);
      p.rect(x, 2 + ((i * 7) % 5), 3, 2, i === 5 ? red[2] : cream[6]);
      p.px(x + 1, -2, [plant[5], mustard[4], blue[3]][i % 3]);
      p.px(x + 1, 0, m.hi);
    }
  },
  down(p) {
    monitorBackSmall(p, 18, 2, 20);
    monitorBackSmall(p, 46, 2, 20);
    p.line(30, -2, 34, 10, navy[3]);
  },
};

defineAsset({
  id: 'desk.security', name: 'Security desk', group: 'desk.console', category: 'Work', layer: 'object', placement: 'free', facings: ['up', 'down'],
  keywords: ['security', 'desk', 'cctv', 'guard', 'monitors', 'control room', 'security office'],
  build: consoleDesk(mat(charcoal, 1), securityGear, screenLight(32, -10, 40, 0.3)),
});

defineAsset({
  id: 'desk.mixer', name: 'Studio mixing desk', group: 'desk.console', category: 'Work', layer: 'object', placement: 'free', facings: ['up', 'down'],
  keywords: ['mixer', 'console', 'studio', 'sound', 'tv', 'broadcast', 'faders', 'control room'],
  build: consoleDesk(mat(walnut), mixerGear, screenLight(32, -12, 40, 0.3)),
});

// =========================================================================================================
// Meeting: round 4-seat table, white boardroom table, conference wall screen

defineAsset({
  id: 'table.meeting.round.4', name: 'Round meeting table (4 seats)', group: 'table.meeting.small', category: 'Meeting', layer: 'object',
  placement: 'free', facings: DOWN, keywords: ['table', 'meeting', 'round', 'conference', 'huddle'],
  build() {
    const wood = mat(oak, 1);
    const base = mat(charcoal);
    const parts = single(area(2, 2, 32), 64, (p) => {
      p.ellipse(20, 54, 24, 8, base.line);
      p.ellipse(21, 54, 22, 6, base.base);
      p.rect(29, 40, 6, 16, base.base);
      p.vline(29, 40, 16, base.light);
      p.ellipse(2, -4, 60, 48, wood.line);
      p.ellipse(3, -4, 58, 46, wood.dark);
      p.ellipse(2, -7, 60, 48, wood.line);
      p.ellipse(3, -6, 58, 46, wood.light);
      p.hline(16, -4, 14, wood.hi);
      p.hline(11, -2, 6, wood.hi);
      grain(p, 12, 0, 40, 32, wood.base, 77);
      p.ellipse(28, 15, 8, 5, wood.line);
      p.ellipse(29, 16, 6, 3, base.dark);
    });
    return makeVariant({ w: 2, h: 2, parts, shadows: [shadow(4, 40, 56, 20)] });
  },
});

defineAsset({
  id: 'table.meeting.white.8', name: 'Boardroom table (white, 8 seats)', group: 'table.meeting.large', category: 'Meeting', layer: 'object',
  placement: 'free', facings: ['down', 'left'], keywords: ['table', 'meeting', 'boardroom', 'conference', 'white'],
  build(facing) {
    const top = mat(cream);
    const legs = mat(charcoal, 1);
    const inlay = mat(walnut);
    if (facing === 'left') {
      // long axis north-south (2 x 4): front legs at the south end, inlay and power box down the middle
      const D = 128;
      const parts = single(area(2, 4, 32), D - 2, (p) => {
        for (const x of [10, 50]) {
          box(p, x, D - 20, 4, 3, 18, legs, { edge: 'line' });
          p.rect(x - 2, D - 3, 8, 3, legs.base);
        }
        box(p, 1, -8, 62, D - 10, 3, top, { round: 3 });
        p.rect(29, 6, 6, D - 36, inlay.base);
        p.vline(29, 6, D - 36, inlay.light);
        p.vline(34, 6, D - 36, inlay.dark);
        p.vline(4, -5, 40, top.hi);
        const m = mat(charcoal);
        box(p, 26, 46, 12, 14, 1, m, { edge: 'soft' });
        p.px(31, 50, screenGlow[0]);
      });
      return makeVariant({ w: 2, h: 4, parts, shadows: [shadow(1, D - 22, 60, 20, 'rect')] });
    }
    const W = 128;
    const parts = single(area(4, 2, 32), 64, (p) => {
      for (const x of [16, W - 20]) {
        box(p, x, 44, 4, 3, 18, legs, { edge: 'line' });
        p.rect(x - 8, 59, 20, 3, legs.base);
        p.hline(x - 8, 59, 20, legs.light);
      }
      box(p, 1, -8, W - 2, 54, 3, top, { round: 3 });
      p.rect(12, 16, W - 24, 6, inlay.base);
      p.hline(12, 16, W - 24, inlay.light);
      p.hline(12, 21, W - 24, inlay.dark);
      p.hline(6, -5, 40, top.hi);
      const m = mat(charcoal);
      box(p, W / 2 - 9, 16, 18, 6, 1, m, { edge: 'soft' });
      p.px(W / 2 - 6, 19, screenGlow[0]);
    });
    return makeVariant({ w: 4, h: 2, parts, shadows: [shadow(1, 44, W - 4, 18, 'rect')] });
  },
});

defineAsset({
  id: 'wall.screen.conference', name: 'Video-call screen', group: 'wall.screen.wide', category: 'Meeting', layer: 'wall', facings: DOWN,
  keywords: ['screen', 'video call', 'conference', 'tv', 'display', 'zoom', 'meeting'],
  build() {
    const parts = single({ x: 0, y: -12, w: 96, h: 44 }, 1, (p) => {
      const b = mat(charcoal);
      p.rect(10, -4, 76, 30, b.line);
      p.rect(11, -3, 74, 28, b.dark);
      // camera bar
      p.rect(40, -8, 16, 3, b.base);
      p.px(48, -7, b.deep);
      p.px(52, -7, plant[5]);
      const skins = [skinA, skinB, skinC, skinA];
      const bgs = [sage[3], navy[3], terracotta[4], teal[4]];
      for (let i = 0; i < 4; i++) {
        const x = 12 + (i % 2) * 37;
        const y = -2 + Math.floor(i / 2) * 13;
        p.rect(x, y, 35, 12, bgs[i]);
        p.hline(x, y, 35, mix(bgs[i], cream[6], 0.3));
        const cx = x + 17;
        p.rect(cx - 6, y + 9, 12, 3, [navy[2], mustard[2], sage[2], terracotta[2]][i]);
        p.disc(cx - 3, y + 3, 6, skins[i][2]);
        p.rect(cx - 3, y + 2, 6, 2, [walnut[1], walnut[3], dirt[1], mustard[2]][i]);
        p.px(cx - 1, y + 5, b.line);
        p.px(cx + 1, y + 5, b.line);
      }
      p.rect(80, 21, 4, 2, red[2]);
    });
    return makeVariant({ w: 3, h: 1, mask: ['...'], parts, lights: [screenLight(48, 8, 56, 0.32)] });
  },
});

// =========================================================================================================
// Internet café: gaming desk, gaming chairs, PC booth

const RGB_FAN = (p: Pen, x: number, y: number, c: string, dark: string) => {
  p.disc(x, y, 7, c);
  p.disc(x + 1, y + 1, 5, dark);
  p.px(x + 3, y + 3, c);
};

function gameScreen(p: Pen, x: number, y: number, w: number, h: number): void {
  const m = mat(charcoal);
  p.rect(x - 1, y - 1, w + 2, h + 2, m.line);
  p.rect(x, y, w, h, navy[1]);
  p.rect(x, y, w, Math.floor(h / 2), navy[2]);
  for (let i = 0; i < w; i += 1) {
    const hh = 2 + Math.round((Math.sin(i * 0.5) + 1) * 1.5);
    p.vline(x + i, y + h - hh, hh, plant[3]);
  }
  p.rect(x + Math.floor(w / 3), y + h - 7, 2, 3, red[2]);
  p.rect(x + w - 8, y + 2, 2, 2, mustard[4]);
  p.rect(x + w - 6, y + 4, 4, 1, cream[6]);
  p.hline(x, y, w, screenGlow[0]);
}

function gamingDesk(slab: Mat, frame: Mat): (facing: Dir) => Variant {
  const tower = (p: Pen, x: number, y: number, front: boolean) => {
    const m = mat(charcoal, 1);
    box(p, x, y, 13, 6, 22, m, { round: 1 });
    if (front) {
      p.rect(x + 2, y + 8, 9, 16, m.deep);
      RGB_FAN(p, x + 3, y + 9, RGB[0], m.deep);
      RGB_FAN(p, x + 3, y + 16, RGB[1], m.deep);
      glassOver(p, x + 2, y + 8, 9, 16, 0.2);
    } else {
      for (let r = y + 9; r < y + 25; r += 2) {
        p.hline(x + 3, r, 7, m.deep);
      }
      p.hline(x + 2, y + 7, 9, RGB[2]);
    }
  };
  const strip = (p: Pen, x: number, y: number, w: number, vertical = false) => {
    for (let i = 0; i < w; i++) {
      const c = RGB[Math.floor(i / 6) % RGB.length];
      if (vertical) {
        p.px(x, y + i, c);
      } else {
        p.px(x + i, y, c);
      }
    }
  };
  const horizontal = (facing: 'down' | 'up'): Variant => {
    const parts = layered(area(2, 1, 36), (L) => {
      const p = L(32);
      const top = facing === 'down' ? -6 : -4;
      for (const x of [3, 58]) {
        leg(p, x, 18, 12, frame, 3);
        p.rect(x - 2, 28, 7, 2, frame.line);
      }
      p.rect(6, 22, 52, 2, frame.dark);
      box(p, 0, top, 64, 16 - top, 3, slab);
      weave(p, 2, top + 2, 60, 12 - top, slab.base, 3);
      strip(p, 2, 17, 60);
      if (facing === 'up') {
        p.rect(18, -1, 10, 2, mat(charcoal).line);
        p.rect(21, -4, 4, 4, mat(charcoal).dark);
        gameScreen(p, 6, -19, 34, 15);
        box(p, 8, 6, 24, 4, 1, mat(charcoal), { edge: 'soft' });
        strip(p, 10, 7, 20);
        p.rect(35, 7, 3, 3, mat(charcoal).base);
        p.px(36, 7, RGB[0]);
        tower(p, 46, -14, true);
      } else {
        box(p, 8, -4, 24, 4, 1, mat(charcoal), { edge: 'soft' });
        monitorBackSmall(p, 23, 10, 34);
        strip(p, 8, -2, 30);
        tower(p, 44, -12, false);
      }
    });
    const light: Light = { x: 30, y: -10, radius: facing === 'up' ? 40 : 26, color: blue[3], intensity: facing === 'up' ? 0.34 : 0.18 };
    return makeVariant({ w: 2, h: 1, parts, shadows: [shadow(0, 14, 62, 16, 'rect')], lights: [light] });
  };
  const vertical = (): Variant => {
    const parts = layered(area(1, 2, 36), (L) => {
      const p = L(64);
      leg(p, 2, 46, 14, frame, 3);
      leg(p, 23, 46, 14, frame, 3);
      box(p, 0, -4, 28, 50, 3, slab);
      weave(p, 2, -2, 24, 46, slab.base, 5);
      strip(p, 1, 47, 26);
      const m = mat(charcoal);
      p.rect(16, 14, 10, 2, m.line);
      p.rect(21, 8, 2, 6, m.dark);
      box(p, 17, -8, 8, 2, 20, m, { round: 1 });
      p.rect(18, -5, 3, 16, navy[2]);
      p.vline(18, -5, 16, screenGlow[0]);
      strip(p, 24, -6, 18, true);
      box(p, 4, 0, 5, 18, 1, m, { edge: 'soft' });
      strip(p, 6, 2, 14, true);
      p.rect(5, 22, 3, 3, m.base);
      tower(p, 13, 22, false);
    });
    return makeVariant({ w: 1, h: 2, parts, shadows: [shadow(3, 30, 26, 30, 'rect')], lights: [{ x: 14, y: 4, radius: 30, color: blue[3], intensity: 0.26 }] });
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

defineAsset({
  id: 'desk.gaming.charcoal', name: 'Gaming desk (black, RGB)', group: 'desk', category: 'Work', layer: 'object', placement: 'free', facings: ALL,
  keywords: ['desk', 'gaming', 'pc', 'rgb', 'computer', 'internet cafe', 'esports'], build: gamingDesk(mat(charcoal, 1), mat(charcoal)),
});

defineAsset({
  id: 'desk.gaming.white', name: 'Gaming desk (white, RGB)', group: 'desk', category: 'Work', layer: 'object', placement: 'free', facings: ALL,
  keywords: ['desk', 'gaming', 'pc', 'rgb', 'computer', 'internet cafe', 'esports'], build: gamingDesk(mat(cream), mat(steel, 2)),
});

function starBase(p: Pen, frame: Mat): void {
  p.rect(15, 21, 2, 6, frame.light);
  p.line(14, 27, 10, 25, frame.base);
  p.line(17, 27, 21, 25, frame.base);
  p.hline(8, 28, 16, frame.base);
  p.hline(8, 29, 16, frame.line);
  for (const [x, y] of [[9, 24], [21, 24], [6, 28], [24, 28], [15, 30]] as const) {
    p.rect(x, y, 2, 2, frame.line);
  }
}

function gamingChairParts(ramp: Ramp, accent: Ramp, facing: 'down' | 'up' | 'left'): Part[] {
  const f = mat(ramp);
  const a = mat(accent);
  const frame = mat(charcoal, 1);
  return layered(area(1, 1, 32), (L) => {
    const s = L(Z_SEAT);
    if (facing === 'down') {
      cushion(s, 8, -8, 16, 3, 22, f, 3);
      s.vline(10, -5, 18, a.base);
      s.vline(21, -5, 18, a.base);
      s.rect(13, -5, 6, 3, a.light);
      s.px(11, -2, f.deep);
      s.px(20, -2, f.deep);
      starBase(s, frame);
      cushion(s, 8, 14, 16, 7, 4, f, 2);
      s.hline(10, 16, 12, a.base);
      for (const x of [4, 24]) {
        leg(s, x + 1, 17, 5, frame, 2);
        box(s, x, 14, 4, 2, 2, frame, { edge: 'soft', side: false });
      }
    } else if (facing === 'up') {
      starBase(s, frame);
      cushion(s, 8, 11, 16, 7, 4, f, 2);
      for (const x of [4, 24]) {
        leg(s, x + 1, 15, 5, frame, 2);
        box(s, x, 12, 4, 2, 2, frame, { edge: 'soft', side: false });
      }
      const b = L(Z_FRONT);
      b.rect(15, 22, 2, 4, frame.dark);
      cushion(b, 8, 0, 16, 2, 23, mat(ramp, 1), 3);
      b.vline(10, 3, 18, a.dark);
      b.vline(21, 3, 18, a.dark);
      b.rect(14, 5, 4, 3, a.base);
    } else {
      starBase(s, frame);
      s.rect(18, 19, 3, 5, frame.dark);
      box(s, 19, -8, 6, 10, 20, f, { round: 2, edge: 'soft' });
      s.vline(21, -6, 16, a.base);
      s.rect(20, -6, 3, 3, a.light);
      cushion(s, 7, 14, 16, 7, 4, f, 2);
      box(s, 9, 10, 10, 3, 2, frame, { edge: 'soft', side: false });
      leg(s, 12, 15, 3, frame, 2);
    }
  });
}

function gamingChair(ramp: Ramp, accent: Ramp): (facing: Dir) => Variant {
  const build = (facing: Dir): Variant => {
    if (facing === 'right') {
      return mirrorVariant(build('left'));
    }
    return pulledSeat(facing, gamingChairParts(ramp, accent, facing), 6, 24, 20, 7);
  };
  return build;
}

for (const [id, name, ramp, accent] of [
  ['chair.gaming.red', 'Gaming chair (red)', charcoal, red],
  ['chair.gaming.navy', 'Gaming chair (navy)', navy, blue],
  ['chair.gaming.sage', 'Gaming chair (sage)', charcoal, sage],
] as const) {
  defineAsset({
    id, name, group: 'chair.office', category: 'Work', layer: 'object', placement: 'free', facings: ALL,
    keywords: ['chair', 'gaming', 'racing', 'seat', 'internet cafe', 'esports'], build: gamingChair(ramp, accent),
  });
}

function pcBooth(ramp: Ramp): () => Variant {
  return () => {
    const pad = mat(ramp);
    const shell = mat(charcoal, 1);
    const top = mat(walnut);
    const chair = variant('chair.gaming.red', 'up')!.frames[0];
    const parts = layered(area(1, 2, 48), (L) => {
      const p = L(32);
      // padded back panel against the wall
      box(p, 0, -40, 32, 4, 40, shell);
      p.rect(2, -35, 28, 30, pad.base);
      for (let x = 2; x < 30; x += 7) {
        p.vline(x, -35, 30, pad.dark);
        p.vline(x + 1, -35, 30, pad.light);
      }
      p.hline(2, -35, 28, pad.light);
      // desk with the PC
      leg(p, 4, 19, 11, shell, 2);
      leg(p, 26, 19, 11, shell, 2);
      box(p, 2, -14, 28, 30, 3, top);
      p.rect(14, -18, 4, 4, shell.dark);
      gameScreen(p, 6, -31, 20, 13);
      box(p, 9, -6, 14, 4, 1, mat(charcoal), { edge: 'soft' });
      for (let x = 10; x < 22; x += 2) {
        p.px(x, -5, RGB[(x >> 1) % 4]);
      }
      p.rect(25, -5, 2, 3, mat(charcoal).base);
      cylinder(p, 3, -12, 5, 6, mat(terracotta), 2, walnut[2]);
      for (const part of chair) {
        L(part.z + T).blit(part.canvas, part.x, part.y + T);
      }
      // side panels in front of the sitter's sides
      const s = L(64);
      for (const x of [0, 28]) {
        box(s, x, -34, 4, 52, 34, shell);
        s.rect(x + 1, 20, 2, 30, pad.base);
        s.vline(x + 1, 20, 30, pad.light);
      }
    });
    return makeVariant({
      w: 1,
      h: 2,
      mask: ['#', 's'],
      spots: [{ dx: 0, dy: 1, facing: 'up', pose: 'sit', activity: 'web', py: -4 }],
      parts,
      shadows: [shadow(0, 0, 32, 52, 'rect')],
      lights: [screenLight(16, -22, 24, 0.3)],
    });
  };
}

for (const [id, name, ramp] of [['booth.pc.navy', 'PC booth (navy)', navy], ['booth.pc.terracotta', 'PC booth (terracotta)', terracotta]] as const) {
  defineAsset({
    id, name, group: 'booth.pc', category: 'Work', layer: 'object', placement: 'wall', facings: DOWN,
    keywords: ['booth', 'pc', 'internet cafe', 'gaming', 'computer', 'cubicle', 'web'], build: pcBooth(ramp),
  });
}

// =========================================================================================================
// TV studio: camera, lights, green screen, ON AIR sign

defineAsset({
  id: 'studio.camera', name: 'Studio camera', group: 'studio.camera', category: 'Work', layer: 'object', placement: 'free', facings: ['down', 'up', 'left', 'right'],
  keywords: ['camera', 'tv', 'studio', 'broadcast', 'film', 'pedestal', 'video'],
  build(facing: Dir): Variant {
    if (facing === 'right') {
      return mirrorVariant(this.build('left'));
    }
    const body = mat(charcoal);
    const ped = mat(steel, 1);
    const parts = single(area(1, 1, 40), 24, (p) => {
      p.hline(6, 27, 20, ped.base);
      p.hline(6, 28, 20, ped.line);
      for (const x of [5, 15, 25]) {
        p.rect(x, 28, 3, 2, body.line);
      }
      p.rect(14, 2, 4, 25, ped.base);
      p.vline(14, 2, 25, ped.light);
      p.rect(12, 14, 8, 2, ped.dark);
      if (facing === 'down') {
        box(p, 7, -20, 18, 10, 14, body, { round: 1 });
        p.disc(10, -9, 12, body.line);
        p.disc(11, -8, 10, body.dark);
        p.disc(13, -6, 6, navy[1]);
        glint(p, 14, -5, 2, screenGlow[1]);
        box(p, 17, -27, 8, 5, 6, body, { round: 1 });
        p.px(9, -19, red[2]);
        p.line(7, 0, 2, 6, ped.light);
        p.line(24, 0, 29, 6, ped.light);
      } else if (facing === 'up') {
        box(p, 7, -18, 18, 12, 14, body, { round: 1 });
        p.rect(10, -26, 12, 9, body.line);
        p.rect(11, -25, 10, 7, screenGlow[0]);
        p.hline(11, -21, 10, plant[4]);
        p.px(19, -24, red[2]);
        p.line(9, 0, 4, 8, ped.light);
        p.line(22, 0, 27, 8, ped.light);
      } else {
        box(p, 6, -18, 22, 8, 12, body, { round: 1 });
        p.ellipse(1, -14, 7, 13, body.line);
        p.ellipse(2, -13, 5, 11, body.dark);
        p.vline(3, -10, 5, screenGlow[1]);
        box(p, 20, -26, 9, 6, 6, body, { round: 1 });
        p.px(8, -17, red[2]);
        p.line(27, -4, 31, 4, ped.light);
        p.line(26, -4, 30, 4, ped.dark);
      }
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(5, 24, 22, 7)] });
  },
});

function studioLight(kind: 'softbox' | 'fresnel'): () => Variant {
  return () => {
    const iron = mat(charcoal);
    const parts = single(area(1, 1, 52), 24, (p) => {
      p.line(15, -4, 7, 29, iron.line);
      p.line(16, -4, 8, 29, iron.base);
      p.line(17, -4, 25, 29, iron.line);
      p.line(16, -4, 24, 29, iron.dark);
      p.line(16, -4, 17, 24, iron.base);
      p.rect(15, -20, 2, 17, iron.base);
      p.vline(15, -20, 17, iron.hi);
      if (kind === 'softbox') {
        const s = mat(steel);
        box(p, 4, -42, 24, 3, 20, iron, { round: 1 });
        p.rect(6, -38, 20, 15, cream[6]);
        p.rect(7, -37, 18, 13, lightWarm[1]);
        p.rect(9, -35, 14, 9, cream[6]);
        p.hline(6, -38, 20, s.hi);
      } else {
        box(p, 8, -34, 16, 4, 12, iron, { round: 2 });
        p.disc(11, -30, 10, lightWarm[0]);
        p.disc(12, -29, 8, lightWarm[1]);
        p.px(14, -27, cream[6]);
        p.line(7, -34, 3, -38, iron.light);
        p.line(24, -34, 28, -38, iron.light);
        p.hline(10, -36, 12, iron.light);
      }
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(7, 24, 19, 6)], lights: [warmLight(16, kind === 'softbox' ? -30 : -24, 84, 0.6)] });
  };
}

defineAsset({
  id: 'studio.light.softbox', name: 'Studio softbox light', group: 'studio.light', category: 'Lighting', layer: 'object', placement: 'corner',
  facings: DOWN, keywords: ['light', 'softbox', 'studio', 'tv', 'photo', 'lamp'], build: studioLight('softbox'),
});

defineAsset({
  id: 'studio.light.fresnel', name: 'Studio spotlight', group: 'studio.light', category: 'Lighting', layer: 'object', placement: 'corner',
  facings: DOWN, keywords: ['light', 'spotlight', 'fresnel', 'studio', 'tv', 'stage', 'lamp'], build: studioLight('fresnel'),
});

defineAsset({
  id: 'studio.greenscreen', name: 'Green screen', group: 'studio.greenscreen', category: 'Work', layer: 'object', placement: 'wall', facings: DOWN,
  keywords: ['green screen', 'chroma', 'backdrop', 'studio', 'tv', 'video', 'streaming'],
  build() {
    const pole = mat(steel, 1);
    const parts = single(area(3, 1, 64), T, (p) => {
      const cloth = [plant[3], plant[4], plant[5]];
      p.rect(6, -52, 84, 54, cloth[1]);
      for (let x = 10; x < 90; x += 12) {
        p.vline(x, -50, 50, cloth[0]);
        p.vline(x + 1, -50, 50, cloth[2]);
      }
      // the sweep onto the floor
      p.rect(6, 2, 84, 20, cloth[2]);
      p.hline(6, 1, 84, cloth[1]);
      p.hline(6, 21, 84, plant[2]);
      p.vline(6, -52, 74, plant[2]);
      p.vline(89, -52, 74, plant[2]);
      for (const x of [3, 91]) {
        leg(p, x, -56, 60, pole, 2);
        p.rect(x - 3, 3, 8, 2, pole.dark);
      }
      p.rect(2, -57, 92, 3, pole.base);
      p.hline(2, -57, 92, pole.hi);
      for (const x of [20, 48, 76]) {
        p.rect(x, -55, 3, 4, mat(charcoal).base);
      }
    });
    return makeVariant({ w: 3, h: 1, parts, shadows: [shadow(4, 0, 88, 22, 'rect')] });
  },
});

defineAsset({
  id: 'wall.onair', name: 'ON AIR sign', group: 'wall.sign', category: 'Lighting', layer: 'wall', facings: DOWN,
  keywords: ['on air', 'sign', 'studio', 'tv', 'radio', 'recording', 'light'],
  build() {
    const parts = single({ x: 0, y: -8, w: 32, h: 32 }, 1, (p) => {
      const b = mat(charcoal);
      p.rect(2, -2, 28, 11, b.line);
      p.rect(3, -1, 26, 9, red[1]);
      p.hline(3, -1, 26, red[2]);
      text(p, 5, 1, 'ON AIR', cream[6]);
      p.vline(16, -6, 4, b.base);
    });
    return makeVariant({ w: 1, h: 1, mask: ['.'], parts, lights: [{ x: 16, y: 4, radius: 34, color: red[2], intensity: 0.35 }] });
  },
});

// =========================================================================================================
// School: desk, chair, chalkboard, trophy case, projector screen, globe, recycling bins, podium, extinguisher

function schoolDesk(facing: Dir): Variant {
  const wood = mat(oak);
  const frame = mat(steel, 1);
  const parts = single(area(1, 1, 24), T, (p) => {
    const top = facing === 'down' ? -6 : -4;
    for (const x of [3, 26]) {
      leg(p, x, 16, 13, frame, 2);
    }
    p.rect(4, 26, 24, 1, frame.dark);
    if (facing === 'up') {
      p.rect(4, 15, 24, 4, frame.deep);
      p.rect(6, 16, 9, 3, navy[3]);
      p.rect(16, 16, 7, 3, terracotta[4]);
    } else {
      p.rect(4, 15, 24, 6, frame.base);
      p.hline(4, 15, 24, frame.light);
    }
    box(p, 1, top, 30, 16 - top, 3, wood);
    grain(p, 3, top + 2, 26, 11 - top, wood.base, 19);
    if (facing === 'up') {
      box(p, 6, 2, 12, 8, 1, mat(cream), { edge: 'soft' });
      p.hline(8, 4, 8, cream[3]);
      p.hline(8, 6, 6, cream[3]);
      p.line(20, 8, 25, 3, mustard[3]);
      p.px(25, 3, charcoal[2]);
    } else {
      p.disc(20, -6, 5, red[2]);
      p.px(21, -5, cream[6]);
      p.px(22, -8, plant[3]);
    }
  });
  return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(1, 14, 30, 15, 'rect')] });
}

defineAsset({
  id: 'desk.school', name: 'School desk', group: 'desk.school', category: 'Work', layer: 'object', placement: 'free', facings: ['up', 'down'],
  keywords: ['desk', 'school', 'classroom', 'student', 'pupil', 'training'], build: schoolDesk,
});

function schoolChairParts(m: Mat, facing: 'down' | 'up' | 'left'): Part[] {
  const frame = mat(steel, 1);
  return layered(area(1, 1, 24), (L) => {
    const s = L(Z_SEAT);
    if (facing === 'down') {
      for (const x of [10, 21]) {
        s.vline(x, 4, 20, frame.base);
      }
      box(s, 8, -2, 16, 2, 9, m, { round: 1 });
      s.hline(10, 2, 12, m.hi);
      for (const x of [8, 23]) {
        leg(s, x, 18, 11, frame, 1);
      }
      box(s, 7, 12, 18, 7, 2, m, { round: 1 });
    } else if (facing === 'up') {
      for (const x of [8, 23]) {
        leg(s, x, 16, 13, frame, 1);
      }
      box(s, 7, 10, 18, 7, 2, m, { round: 1 });
      const b = L(Z_FRONT);
      for (const x of [10, 21]) {
        b.vline(x, 6, 18, frame.base);
      }
      box(b, 8, 4, 16, 2, 9, mat(oak, 1), { round: 1 });
    } else {
      s.vline(22, 2, 22, frame.base);
      box(s, 20, -2, 4, 10, 10, m, { round: 1 });
      for (const x of [8, 22]) {
        leg(s, x, 18, 11, frame, 1);
      }
      box(s, 7, 12, 17, 7, 2, m, { round: 1 });
    }
  });
}

function schoolChair(ramp: Ramp, shift: number): (facing: Dir) => Variant {
  const build = (facing: Dir): Variant => {
    if (facing === 'right') {
      return mirrorVariant(build('left'));
    }
    return pulledSeat(facing, schoolChairParts(mat(ramp, shift), facing), 7, 24, 18, 6);
  };
  return build;
}

for (const [id, name, ramp, shift] of [['chair.school.oak', 'School chair (oak)', oak, 0], ['chair.school.navy', 'School chair (navy)', navy, 0]] as const) {
  defineAsset({
    id, name, group: 'chair.school', category: 'Work', layer: 'object', placement: 'free', facings: ALL,
    keywords: ['chair', 'school', 'classroom', 'seat', 'student'], build: schoolChair(ramp, shift),
  });
}

defineAsset({
  id: 'wall.chalkboard', name: 'Chalkboard', group: 'wall.board', category: 'Work', layer: 'wall', facings: DOWN,
  keywords: ['chalkboard', 'blackboard', 'school', 'classroom', 'lesson', 'board'],
  build() {
    const parts = single({ x: 0, y: -10, w: 64, h: 36 }, 1, (p) => {
      const frame = mat(oak, 1);
      box(p, 3, -6, 58, 2, 26, frame);
      const x = 5;
      const y = -3;
      p.rect(x, y, 54, 21, sage[1]);
      dither(p, x, y, 54, 21, sage[2], 0.12);
      const chalk = cream[5];
      text(p, x + 3, y + 3, 'A', chalk);
      p.px(x + 7, y + 2, chalk);
      p.hline(x + 9, y + 5, 3, chalk);
      p.vline(x + 10, y + 4, 3, chalk);
      text(p, x + 13, y + 3, 'C', chalk);
      p.hline(x + 3, y + 12, 18, chalk);
      p.hline(x + 5, y + 15, 12, mix(chalk, sage[1], 0.4));
      p.line(x + 30, y + 16, x + 38, y + 3, chalk);
      p.line(x + 38, y + 3, x + 46, y + 16, chalk);
      p.hline(x + 30, y + 16, 17, chalk);
      p.px(x + 38, y + 11, mustard[4]);
      p.rect(x + 2, y + 8, 22, 1, mix(chalk, sage[1], 0.65));
      p.rect(x, y + 21, 54, 2, frame.base);
      p.hline(x, y + 21, 54, frame.light);
      p.rect(x + 8, y + 20, 7, 2, mat(navy).base);
      p.hline(x + 8, y + 20, 7, cream[4]);
      p.hline(x + 20, y + 20, 4, cream[6]);
      p.hline(x + 26, y + 20, 3, mustard[4]);
    });
    return makeVariant({ w: 2, h: 1, mask: ['..'], parts, spots: [stand(0, 1, 'up', 'whiteboard', 16)] });
  },
});

defineAsset({
  id: 'cabinet.trophy', name: 'Trophy cabinet', group: 'cabinet.trophy', category: 'Decor', layer: 'object', placement: 'wall', facings: DOWN,
  keywords: ['trophy', 'cabinet', 'awards', 'cups', 'display', 'school', 'glass'],
  build: wide(60, 12, 52, (p, g) => {
    const wood = mat(walnut);
    box(p, g.x, g.y, g.w, g.d, g.h, wood);
    const f = faceOf(g);
    const gold = mat(yellow);
    const cup = (x: number, bottom: number, h: number) => {
      p.rect(x + 1, bottom - 2, 5, 2, wood.light);
      p.rect(x + 3, bottom - 5, 1, 3, gold.base);
      p.rect(x, bottom - h, 7, h - 5, gold.base);
      p.vline(x, bottom - h, h - 5, gold.light);
      p.px(x - 1, bottom - h + 1, gold.base);
      p.px(x + 7, bottom - h + 1, gold.base);
      p.px(x + 1, bottom - h + 1, cream[6]);
    };
    for (const [r, y] of [f.y + 1, f.y + 16].entries()) {
      p.rect(f.x + 2, y, f.w - 4, 14, mix(walnut[1], walnut[2], 0.5));
      if (r === 0) {
        cup(f.x + 6, y + 14, 11);
        cup(f.x + 20, y + 14, 8);
        p.rect(f.x + 32, y + 4, 9, 10, wood.light);
        p.rect(f.x + 34, y + 6, 5, 4, gold.light);
        cup(f.x + 46, y + 14, 12);
      } else {
        for (const [i, c] of [red[2], blue[3], plant[4]].entries()) {
          const x = f.x + 6 + i * 8;
          p.line(x, y + 2, x + 2, y + 8, c);
          p.line(x + 4, y + 2, x + 2, y + 8, c);
          p.disc(x, y + 8, 5, gold.base);
          p.px(x + 1, y + 9, gold.hi);
        }
        cup(f.x + 34, y + 14, 9);
        p.rect(f.x + 44, y + 7, 8, 7, cream[6]);
        p.frame(f.x + 44, y + 7, 8, 7, wood.base);
      }
      p.hline(f.x + 2, y + 14, f.w - 4, wood.light);
    }
    glassOver(p, f.x + 2, f.y + 1, Math.floor((f.w - 4) / 2), 29, 0.16);
    glassOver(p, f.x + 2 + Math.floor((f.w - 4) / 2), f.y + 1, Math.ceil((f.w - 4) / 2), 29, 0.16);
    p.vline(f.x + 1 + Math.floor(f.w / 2), f.y + 1, 29, wood.base);
    drawers(p, f.x + 1, f.y + 32, f.w - 2, f.h - 34, 1, wood, gold.light);
  }, undefined, [warmLight(32, -30, 36, 0.3)]),
});

defineAsset({
  id: 'wall.projector', name: 'Projector screen', group: 'wall.screen', category: 'Meeting', layer: 'wall', facings: DOWN,
  keywords: ['projector', 'screen', 'presentation', 'slides', 'classroom', 'meeting'],
  build() {
    const parts = single({ x: 0, y: -12, w: 64, h: 44 }, 1, (p) => {
      const c = mat(steel);
      p.rect(3, -9, 58, 4, c.base);
      p.hline(3, -9, 58, c.hi);
      p.hline(3, -6, 58, c.line);
      p.rect(6, -5, 52, 27, cream[6]);
      p.vline(6, -5, 27, cream[4]);
      p.vline(57, -5, 27, cream[4]);
      p.rect(6, 22, 52, 2, c.dark);
      p.px(31, 24, c.line);
      p.vline(31, 24, 3, c.base);
      // the projected slide, softer than a screen
      p.rect(10, -2, 44, 20, mix(navy[4], cream[6], 0.55));
      p.hline(13, 1, 18, mix(navy[2], cream[6], 0.3));
      for (const [x, h] of [[14, 6], [20, 9], [26, 7], [32, 11]] as const) {
        p.rect(x, 15 - h, 4, h, mix(mustard[3], cream[6], 0.35));
      }
      p.disc(40, 5, 10, mix(terracotta[4], cream[6], 0.35));
      p.rect(45, 5, 5, 5, mix(navy[4], cream[6], 0.55));
    });
    return makeVariant({ w: 2, h: 1, mask: ['..'], parts, lights: [screenLight(32, 6, 40, 0.2)] });
  },
});

defineAsset({
  id: 'surface.globe', name: 'Desk globe', group: 'surface.globe', category: 'Decor', layer: 'surface', facings: DOWN,
  keywords: ['globe', 'world', 'geography', 'school', 'desk', 'study'],
  build() {
    const brass = mat(yellow);
    const parts = single(area(1, 1, 32), T, (p) => {
      p.ellipse(10, 0, 12, 4, walnut[1]);
      p.ellipse(11, 0, 10, 3, walnut[3]);
      p.rect(15, -4, 2, 4, brass.base);
      p.disc(9, -19, 14, water[1]);
      p.disc(10, -18, 12, water[3]);
      p.ellipse(11, -17, 5, 6, sage[4]);
      p.ellipse(16, -14, 4, 5, mustard[3]);
      p.ellipse(14, -19, 5, 3, sage[3]);
      glint(p, 12, -16, 2, water[5]);
      p.line(8, -12, 16, -21, brass.base);
      p.line(17, -21, 22, -12, brass.dark);
      p.line(8, -13, 8, -10, brass.dark);
    });
    return makeVariant({ w: 1, h: 1, mask: ['.'], parts });
  },
});

defineAsset({
  id: 'bin.recycle', name: 'Recycling bins', group: 'bin', category: 'Decor', layer: 'object', placement: 'corner', facings: DOWN,
  keywords: ['recycling', 'bins', 'trash', 'paper', 'plastic', 'waste', 'school'],
  build() {
    const parts = single(area(1, 1, 16), 24, (p) => {
      for (const [x, ramp] of [[2, blue], [17, sage]] as const) {
        const m = mat(ramp);
        box(p, x, 6, 13, 8, 18, m, { round: 1 });
        p.rect(x + 1, 6, 11, 3, m.dark);
        p.hline(x + 3, 9, 7, m.deep);
        p.line(x + 4, 20, x + 6, 16, cream[6]);
        p.line(x + 6, 16, x + 8, 20, cream[6]);
        p.hline(x + 4, 20, 5, cream[6]);
      }
      p.rect(5, 4, 5, 3, cream[6]);
      p.px(6, 4, cream[4]);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(2, 22, 28, 8, 'rect')] });
  },
});

defineAsset({
  id: 'podium', name: 'Lectern', group: 'podium', category: 'Meeting', layer: 'object', placement: 'free', facings: DOWN,
  keywords: ['podium', 'lectern', 'speech', 'presentation', 'school', 'stage', 'microphone'],
  build() {
    const wood = mat(walnut);
    const brass = mat(yellow);
    const parts = single(area(1, 1, 40), T, (p) => {
      box(p, 4, 12, 24, 3, 3, wood, { round: 1 });
      box(p, 7, -24, 18, 10, 36, wood);
      p.rect(10, -10, 12, 18, wood.dark);
      p.rect(11, -9, 10, 16, wood.base);
      p.disc(13, -6, 6, brass.base);
      p.px(14, -5, brass.hi);
      box(p, 5, -30, 22, 8, 3, mat(walnut, 1), { round: 1 });
      p.line(20, -30, 16, -40, mat(charcoal).light);
      p.rect(15, -42, 3, 3, mat(charcoal).base);
      p.rect(9, -30, 8, 4, cream[6]);
    });
    return makeVariant({ w: 1, h: 1, parts, spots: [stand(0, -1, 'down', 'whiteboard')], shadows: [shadow(4, 2, 24, 13, 'rect')] });
  },
});

{
  const m = mat(red);
  defineAsset({
    id: 'extinguisher', name: 'Fire extinguisher', group: 'extinguisher', category: 'Decor', layer: 'object', placement: 'wall', facings: SIDES,
    keywords: ['fire', 'extinguisher', 'safety', 'emergency', 'red'],
    build: fixture({
      w: 10, d: 8, h: 22, m,
      front(p, g) {
        p.erase(g.x - 1, g.y - 1, g.w + 2, g.d + g.h + 2);
        drawExtinguisher(p, g.x, g.y, m);
      },
      side(p, g) {
        p.erase(g.x - 1, g.y - 1, g.w + 2, g.d + g.h + 2);
        drawExtinguisher(p, g.x - 1, g.y + 8, m);
      },
    }),
  });
}

function drawExtinguisher(p: Pen, x: number, y: number, m: Mat): void {
  const dark = mat(charcoal);
  // sign plate above, then the bottle
  p.rect(x, y - 14, 10, 9, cream[6]);
  p.frame(x, y - 14, 10, 9, m.line);
  p.rect(x + 3, y - 12, 4, 5, m.base);
  cylinder(p, x + 1, y + 4, 8, 22, m, 3);
  p.rect(x + 3, y + 1, 4, 4, dark.base);
  p.hline(x + 2, y + 1, 6, dark.light);
  p.line(x + 7, y + 3, x + 10, y + 10, dark.line);
  p.rect(x + 2, y + 12, 6, 5, cream[6]);
  p.disc(x + 3, y + 4, 3, cream[6]);
}
