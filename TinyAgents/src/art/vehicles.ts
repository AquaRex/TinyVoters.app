import { defineAsset } from './registry';
import { Dir, Variant } from './types';
import {
  Pen, blue, charcoal, cornerCut, cream, glassGlint, glassTint, lightWarm, makeVariant, mirrorVariant, mustard, navy, paintShape,
  red, sage, shadow, single, slate, steel, terracotta, water, yellow,
} from './kit';

/*
 * Cars, top-down 3/4. Facing = the way the nose points. Up/down: 1x2 footprint, the car about 28 x 52-58 px
 * seen mostly from above (the glass sloping toward the viewer looks longer). Left/right: 2x1 footprint, a side
 * profile with a sliver of roof, hood and trunk on top. Pixel art is never rotated, so each facing is drawn.
 */

interface Paint {
  line: string;
  deep: string;
  dark: string;
  base: string;
  light: string;
  hi: string;
}

interface Model {
  /** Body length in px. */
  len: number;
  /** Top view section lengths, rear to front, with the nose pointing at the viewer. */
  trunk: number;
  rw: number;
  roof: number;
  ws: number;
  hood: number;
  face: number;
  round: number;
  /** Side profile: section lengths nose to tail, roof top y, shoulder (belt line) y. */
  sHood: number;
  sWs: number;
  sRoof: number;
  sRw: number;
  roofY: number;
  belt: number;
  rails?: boolean;
}

const SEDAN: Model = { len: 58, trunk: 8, rw: 6, roof: 17, ws: 10, hood: 11, face: 6, round: 3, sHood: 15, sWs: 8, sRoof: 17, sRw: 7, roofY: 5, belt: 15 };
const HATCH: Model = { len: 52, trunk: 3, rw: 8, roof: 17, ws: 9, hood: 9, face: 6, round: 3, sHood: 12, sWs: 8, sRoof: 20, sRw: 6, roofY: 5, belt: 15 };
const SUV: Model = { len: 58, trunk: 3, rw: 7, roof: 23, ws: 8, hood: 11, face: 6, round: 2, sHood: 13, sWs: 6, sRoof: 29, sRw: 4, roofY: 3, belt: 14, rails: true };

const W = 28;
const glass = { dark: slate[0], base: slate[1], light: slate[2], tint: glassTint, glint: glassGlint };
const tyre = charcoal[0];

type Row = 'trunk' | 'rearglass' | 'roof' | 'frontglass' | 'hood' | 'face';

/** Glass pane pixel: dark slate with a diagonal sky reflection band. */
function glassAt(u: number, v: number, w: number, h: number, salt: number): string {
  const d = u + v * 1.6 - salt;
  if (d >= 3 && d < 6) {
    return glass.tint;
  }
  if (d >= 8 && d < 9) {
    return glass.light;
  }
  if (v === h - 1 || u === w - 1) {
    return glass.dark;
  }
  return v < h / 2 ? glass.light : glass.base;
}

/** Top-down car (nose 'down' toward the viewer, or 'up' away). Drawn at (ox, oy). */
function carTop(p: Pen, ox: number, oy: number, m: Model, c: Paint, nose: 'down' | 'up'): void {
  const sections: [Row, number][] = nose === 'down'
    ? [['trunk', m.trunk], ['rearglass', m.rw], ['roof', m.roof], ['frontglass', m.ws], ['hood', m.hood], ['face', m.face]]
    : [['hood', m.hood], ['frontglass', m.rw], ['roof', m.roof], ['rearglass', m.ws], ['trunk', m.trunk], ['face', m.face]];
  const rows: { kind: Row; v: number; n: number }[] = [];
  for (const [kind, n] of sections) {
    for (let v = 0; v < n; v++) {
      rows.push({ kind, v, n });
    }
  }
  const H = m.len;
  const inside = (x: number, y: number) => {
    const cut = cornerCut(y, H, m.round);
    return x >= cut && x < W - cut;
  };
  paintShape(p, ox, oy, W, H, inside, (x, y, open, edge) => {
    const { kind, v, n } = rows[y];
    if (edge) {
      return (open.up || open.left) && !open.right && !open.down && kind !== 'face' ? c.deep : c.line;
    }
    if (kind === 'face') {
      if (v === 0) {
        return c.hi;
      }
      if (v >= n - 2 && (x <= 4 || x >= W - 5)) {
        return tyre;
      }
      if (v === n - 2) {
        return c.deep;
      }
      if (nose === 'down') {
        if ((v === 1 || v === 2) && (x >= 2 && x <= 6 || x >= W - 7 && x <= W - 3)) {
          return v === 1 ? cream[6] : lightWarm[1];
        }
        if (v >= 1 && v <= 3 && x >= 9 && x <= W - 10) {
          return v === 2 ? charcoal[3] : charcoal[1];
        }
      } else {
        if ((v === 1 || v === 2) && (x >= 1 && x <= 5 || x >= W - 6 && x <= W - 2)) {
          return v === 1 ? red[2] : red[1];
        }
        if (v >= 2 && v <= 3 && x >= 10 && x <= W - 11) {
          return v === 2 ? cream[5] : cream[3];
        }
      }
      return x >= W - 3 ? c.dark : c.base;
    }
    const cabin = kind === 'roof' || kind === 'rearglass' || kind === 'frontglass';
    if (cabin) {
      if (x <= 2) {
        return x === 1 ? c.hi : c.light;
      }
      if (x >= W - 3) {
        return c.dark;
      }
      if (kind === 'roof') {
        if (x <= 4 || x >= W - 5) {
          return glassAt(x <= 4 ? x - 3 : x - (W - 5), v, 2, n, 0) === glass.tint && v < 4 ? glass.tint : x <= 4 ? glass.base : glass.dark;
        }
        if (x === W - 6 || v === n - 1) {
          return c.base;
        }
        if (x === 5 || v === 0) {
          return c.hi;
        }
        return c.light;
      }
      // windshield / rear window, corners rounded into the pillars
      const corner = (v === 0 || v === n - 1) && (x === 3 || x === W - 4);
      if (corner) {
        return kind === 'frontglass' && nose === 'down' ? c.light : c.base;
      }
      return glassAt(x - 3, v, W - 6, n, kind === 'frontglass' ? 2 : 6);
    }
    // hood / trunk lid: lit left, shaded right, a soft crease on the hood
    const nearGlass = nose === 'down' ? (kind === 'hood' ? v === 0 : v === n - 1) : kind === 'hood' ? v === n - 1 : v === 0;
    if (nearGlass) {
      return c.base;
    }
    if (x <= 2) {
      return c.hi;
    }
    if (x >= W - 3) {
      return c.dark;
    }
    if (kind === 'hood' && (x === 9 || x === W - 10)) {
      return c.base;
    }
    return c.light;
  });
  // side mirrors at the base of the windshield
  let wsStart = 0;
  for (const [kind, n] of sections) {
    if (kind === 'frontglass') {
      break;
    }
    wsStart += n;
  }
  const wsLen = nose === 'down' ? m.ws : m.rw;
  const my = oy + (nose === 'down' ? wsStart + wsLen - 3 : wsStart);
  for (const mx of [ox - 1, ox + W - 1]) {
    p.rect(mx, my, 2, 3, c.base);
    p.px(mx === ox - 1 ? mx : mx + 1, my, c.line);
    p.px(mx === ox - 1 ? mx : mx + 1, my + 2, c.line);
  }
  p.vline(ox - 2, my, 3, c.line);
  p.vline(ox + W + 1, my, 3, c.line);
}

/** Side profile, nose pointing left, drawn with the body starting at ox; ground at y 30. */
function carSide(p: Pen, ox: number, m: Model, c: Paint): void {
  const L = m.len;
  const b = m.belt;
  const sill = 27;
  const aEnd = m.sHood;
  const wsEnd = aEnd + m.sWs;
  const roofEnd = wsEnd + m.sRoof;
  const rwEnd = roofEnd + m.sRw;
  const deck = b - 4;
  const top = (u: number) => {
    if (u < aEnd) {
      return u === 0 ? deck + 3 : u === 1 ? deck + 1 : deck;
    }
    if (u < wsEnd) {
      return Math.round(deck + ((u - aEnd + 1) / (m.sWs + 1)) * (m.roofY - deck));
    }
    if (u < roofEnd) {
      return m.roofY;
    }
    if (u < rwEnd) {
      return Math.round(m.roofY + ((u - roofEnd + 1) / (m.sRw + 1)) * (deck - m.roofY));
    }
    return u === L - 1 ? deck + 3 : u === L - 2 ? deck + 1 : deck;
  };
  const wheelU = [9, L - 11];
  const wheelY = 25;
  const inArch = (u: number, y: number) => wheelU.some((wu) => Math.hypot(u - wu, y - wheelY) < 7.2) && y > b + 4;
  const inside = (u: number, y: number) => y >= top(u) && y <= sill - (u === 0 || u === L - 1 ? 1 : 0) && !inArch(u, y);
  const bPillar = wsEnd + Math.floor(m.sRoof / 2) - 1;
  paintShape(p, ox, 0, L, 32, inside, (u, y, open, edge) => {
    if (edge) {
      return (open.up || open.left) && !open.right && !open.down && y < b ? c.deep : c.line;
    }
    const cabin = u >= aEnd && u < rwEnd;
    if (y < b) {
      if (!cabin) {
        if (y === top(u) + 1 || (u < aEnd && y === top(u))) {
          return c.hi;
        }
        return y === b - 1 ? c.base : c.light;
      }
      // roof skin, then the side glass with pillars
      if (u >= wsEnd && u < roofEnd && y <= m.roofY + 2) {
        return y === m.roofY + 1 ? c.hi : c.light;
      }
      if (y <= top(u) + 1) {
        return c.base;
      }
      if (y === b - 1) {
        return c.dark;
      }
      if (u === bPillar || u === bPillar + 1 || u === wsEnd - 1 || u === roofEnd) {
        return u === bPillar ? c.base : c.dark;
      }
      return glassAt(u - aEnd, y - m.roofY, m.sRoof + m.sWs, b - m.roofY, 4);
    }
    if (y === b) {
      return c.hi;
    }
    // lights at both ends of the side panel
    if (y >= b + 1 && y <= b + 2) {
      if (u <= 2) {
        return y === b + 1 ? cream[6] : lightWarm[1];
      }
      if (u >= L - 3) {
        return y === b + 1 ? red[2] : red[1];
      }
    }
    // door seams and handles
    if ((u === aEnd + 1 || u === bPillar + 1 || u === roofEnd) && y < sill - 3) {
      return c.dark;
    }
    if (y === b + 2 && (u === aEnd + 5 || u === aEnd + 6 || u === bPillar + 5 || u === bPillar + 6)) {
      return c.light;
    }
    if (y >= sill - 2) {
      return c.dark;
    }
    if (y === b + 1) {
      return c.light;
    }
    return c.base;
  });
  // dark wheel wells, then the wheels in their arches
  paintShape(p, ox, 0, L, sill + 1, (u, y) => inArch(u, y) && y >= top(u), () => charcoal[0]);
  for (const wu of wheelU) {
    const cx = ox + wu;
    paintShape(p, cx - 6, wheelY - 6, 13, 13, (u, v) => Math.hypot(u - 6, v - 6) <= 6, (u, v) => {
      const d = Math.hypot(u - 6, v - 6);
      if (d > 5) {
        return charcoal[0];
      }
      if (d > 3.2) {
        return v < 6 && u < 6 ? charcoal[3] : charcoal[2];
      }
      if (d > 1.6) {
        return u + v < 11 ? steel[5] : steel[3];
      }
      return steel[2];
    });
  }
  // wing mirror on the near side, roof rails on SUVs
  p.rect(ox + aEnd + 1, b - 3, 3, 2, c.base);
  p.hline(ox + aEnd + 1, b - 4, 3, c.line);
  p.px(ox + aEnd + 4, b - 3, c.line);
  if (m.rails) {
    p.hline(ox + wsEnd + 1, m.roofY - 1, m.sRoof - 2, steel[4]);
    p.px(ox + wsEnd + 1, m.roofY - 1, steel[2]);
    p.px(ox + roofEnd - 2, m.roofY - 1, steel[2]);
  }
}

function car(m: Model, c: Paint): (facing: Dir) => Variant {
  const build = (facing: Dir): Variant => {
    if (facing === 'right') {
      return mirrorVariant(build('left'));
    }
    if (facing === 'left') {
      const ox = Math.floor((64 - m.len) / 2);
      const parts = single({ x: 0, y: -4, w: 64, h: 36 }, 32, (p) => carSide(p, ox, m, c));
      return makeVariant({ w: 2, h: 1, parts, shadows: [shadow(ox, 22, m.len - 2, 9, 'rect')] });
    }
    const oy = Math.floor((64 - m.len) / 2);
    const parts = single({ x: -2, y: 0, w: 36, h: 64 }, 64, (p) => carTop(p, 2, oy, m, c, facing));
    return makeVariant({ w: 1, h: 2, parts, shadows: [shadow(2, oy + 3, 27, m.len - 3, 'rect')] });
  };
  return build;
}

function defineCar(id: string, name: string, m: Model, c: Paint, keywords: string[]): void {
  const build = car(m, c);
  defineAsset({
    id,
    name,
    group: 'car',
    category: 'Vehicles',
    layer: 'object',
    placement: 'free',
    facings: ['down', 'up', 'left', 'right'],
    keywords: ['car', 'vehicle', 'parking', ...keywords],
    build,
  });
}

const RED: Paint = { line: terracotta[0], deep: terracotta[1], dark: red[0], base: red[1], light: red[2], hi: terracotta[4] };
const BLUE: Paint = { line: navy[0], deep: blue[0], dark: blue[1], base: blue[2], light: blue[3], hi: water[4] };
const WHITE: Paint = { line: steel[1], deep: steel[3], dark: steel[4], base: steel[5], light: steel[6], hi: cream[6] };
const GREEN: Paint = { line: sage[0], deep: sage[1], dark: sage[2], base: sage[3], light: sage[4], hi: sage[5] };
const YELLOW: Paint = { line: mustard[0], deep: mustard[1], dark: yellow[1], base: yellow[2], light: mustard[4], hi: cream[5] };

defineCar('car.sedan.red', 'Sedan (red)', SEDAN, RED, ['sedan', 'red']);
defineCar('car.sedan.blue', 'Sedan (blue)', SEDAN, BLUE, ['sedan', 'blue']);
defineCar('car.hatch.white', 'Hatchback (white)', HATCH, WHITE, ['hatchback', 'white']);
defineCar('car.suv.green', 'SUV (green)', SUV, GREEN, ['suv', 'green']);
defineCar('car.hatch.yellow', 'Hatchback (yellow)', HATCH, YELLOW, ['hatchback', 'yellow']);
