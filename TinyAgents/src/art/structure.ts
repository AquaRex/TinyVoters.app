import { defineAsset } from './registry';
import { Dir, Light, Part } from './types';
import {
  Bounds, Pen, area, pen, charcoal, cream, glassGlint, glassTint, hash2, layered, lightWarm, makeVariant, mat, mix, mustard,
  oak, paving, plant, shadow, sprite, stand, steel, terracotta, vgradient, walnut, warmLight, water,
} from './kit';
import { brickAt, renderAt, rgba } from './walls';

/**
 * Building structure: doors that sit in wall gaps, the elevator, the stairwell, the street façade and
 * exterior windows. Geometry follows the engine's thin cutaway walls (docs/ENGINE_CONTRACT.md):
 * an interior wall line occupies rows 12-19 of its tile, its face hangs 40 px up from the line's south
 * edge (y = 20), and its cap sits 40 px above the line.
 */

const LINE_TOP = 12;
const LINE_BOTTOM = 20;
const FACE_H = 40;
const nightLight = (x: number, y: number, radius: number, intensity: number): Light => ({ ...warmLight(x, y, radius, intensity), nightOnly: true });

// ---------------------------------------------------------------------------------------------------------
// Doors

type DoorKind = 'oak' | 'glass';
const LEAF_H = 36;

/** The closed leaf, front view, w x LEAF_H. */
function leafTexture(kind: DoorKind, w: number): HTMLCanvasElement {
  return sprite(w, LEAF_H, (p) => {
    if (kind === 'oak') {
      const m = mat(oak);
      p.rect(0, 0, w, LEAF_H, m.base);
      p.frame(0, 0, w, LEAF_H, m.line);
      p.vline(1, 1, LEAF_H - 2, m.light);
      p.hline(1, 1, w - 2, m.light);
      p.vline(w - 2, 1, LEAF_H - 2, m.dark);
      // recessed panels: shadow on the top-left inside, light on the bottom-right
      const panel = (x: number, y: number, pw: number, ph: number) => {
        p.rect(x, y, pw, ph, mix(m.base, m.dark, 0.35));
        p.hline(x, y, pw, m.deep);
        p.vline(x, y, ph, m.deep);
        p.hline(x + 1, y + ph - 1, pw - 1, m.light);
        p.vline(x + pw - 1, y + 1, ph - 1, m.light);
      };
      panel(4, 4, w - 8, 12);
      panel(4, 20, w - 8, 12);
      // vision panel in the upper panel
      p.rect(7, 6, w - 14, 8, glassTint);
      p.rect(7, 10, w - 14, 4, mix(glassTint, water[2], 0.45));
      p.frame(6, 5, w - 12, 10, m.deep);
      p.px(8, 7, glassGlint);
      p.px(9, 7, glassGlint);
      p.px(8, 8, glassGlint);
      for (const [gx, gy, gl] of [[6, 22, 5], [14, 26, 6], [9, 30, 4]]) {
        p.hline(gx, gy, gl, mix(m.base, m.dark, 0.6));
      }
      // brass lever
      p.rect(w - 6, 17, 4, 1, mustard[4]);
      p.rect(w - 4, 17, 2, 2, mustard[3]);
      p.px(w - 6, 18, mustard[1]);
      return;
    }
    const s = mat(steel);
    p.rect(0, 0, w, LEAF_H, s.light);
    p.frame(0, 0, w, LEAF_H, s.line);
    p.vline(1, 1, LEAF_H - 2, s.hi);
    p.vline(w - 2, 1, LEAF_H - 2, s.dark);
    p.rect(1, LEAF_H - 5, w - 2, 4, s.base);
    p.hline(1, LEAF_H - 5, w - 2, s.light);
    const gx = 3;
    const gy = 3;
    const gw = w - 6;
    const gh = LEAF_H - 9;
    p.erase(gx, gy, gw, gh);
    p.rect(gx, gy, gw, gh, rgba(glassTint, 0.42));
    p.rect(gx, gy, gw, 3, rgba(glassTint, 0.55));
    // frosted band at the same height as the partition's
    p.erase(gx, gy + 13, gw, 5);
    p.rect(gx, gy + 13, gw, 5, rgba(steel[6], 0.62));
    p.hline(gx, gy + 13, gw, rgba(steel[6], 0.8));
    p.hline(gx, gy + 17, gw, rgba(steel[6], 0.8));
    p.line(gx + 3, gy + 11, gx + 12, gy + 2, glassGlint);
    p.line(gx + 4, gy + 11, gx + 13, gy + 2, glassGlint);
    p.line(gx + 6, gy + 25, gx + 13, gy + 18, rgba(glassGlint, 0.7));
    // pull bar
    p.vline(w - 6, 10, 15, s.hi);
    p.vline(w - 5, 10, 15, s.dark);
  });
}

/**
 * Paints a door leaf hinged at floor point (hx, hy) whose free edge stands at floor point (fx, fy). The leaf is
 * vertical, so every screen column between hinge and free edge shows LEAF_H px of it, sheared along the floor
 * line. Texture column 0 is at the hinge.
 */
function swingLeaf(p: Pen, tex: HTMLCanvasElement, hx: number, hy: number, fx: number, fy: number, edge: string): void {
  const W = p.canvas.width;
  const H = p.canvas.height;
  const src = tex.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, tex.width, tex.height);
  const img = p.ctx.getImageData(0, 0, W, H);
  const span = fx - hx;
  if (Math.abs(span) >= 1) {
    const x0 = Math.floor(Math.min(hx, fx));
    const x1 = Math.ceil(Math.max(hx, fx));
    for (let x = x0; x < x1; x++) {
      const t = (x + 0.5 - hx) / span;
      if (t < 0 || t > 1) {
        continue;
      }
      const bottom = Math.round(hy + t * (fy - hy));
      const u = Math.min(tex.width - 1, Math.floor(t * tex.width));
      for (let v = 0; v < LEAF_H; v++) {
        const cx = x + p.ox;
        const cy = bottom - LEAF_H + v + p.oy;
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) {
          continue;
        }
        const si = (v * tex.width + u) * 4;
        const di = (cy * W + cx) * 4;
        for (let k = 0; k < 4; k++) {
          img.data[di + k] = src.data[si + k];
        }
      }
    }
  }
  p.ctx.putImageData(img, 0, 0);
  // the free edge's thickness
  const ex = Math.round(fx) + (span >= 0 ? 0 : -1);
  p.rect(ex, Math.round(fy) - LEAF_H, 1, LEAF_H, edge);
}

const DOOR_ANGLES = [0, 0.38, 0.78, 1.15, 1.45];

function lintel(p: Pen, x: number, y: number, w: number, h: number, fill: string, light: string, line: string, horizontal: boolean): void {
  p.rect(x, y, w, h, fill);
  if (horizontal) {
    p.hline(x, y, w, line);
    p.hline(x, y + h - 1, w, line);
    p.hline(x, y + 1, w, light);
    p.vline(x, y, h, line);
    p.vline(x + w - 1, y, h, line);
  } else {
    p.vline(x, y, h, line);
    p.vline(x + w - 1, y, h, line);
    p.vline(x + 1, y, h, light);
    p.hline(x, y, w, line);
    p.hline(x, y + h - 1, w, line);
  }
}

function doorVariant(kind: DoorKind, facing: Dir) {
  const isOak = kind === 'oak';
  const m = isOak ? mat(oak) : mat(steel);
  const capFill = isOak ? oak[4] : steel[5];
  const capLight = isOak ? oak[5] : steel[6];
  const capLine = isOak ? oak[1] : steel[2];
  const bounds: Bounds = { x: -18, y: -50, w: 68, h: 104 };
  const frames: Part[][] = [];
  if (facing === 'down') {
    const tex = leafTexture(kind, 26);
    for (const a of DOOR_ANGLES) {
      const fx = 3 + 26 * Math.cos(a);
      const fy = LINE_BOTTOM + 26 * Math.sin(a);
      frames.push(layered(bounds, (L) => {
        const f = L(LINE_BOTTOM);
        const faceTop = LINE_BOTTOM - FACE_H;
        lintel(f, 0, LINE_TOP - FACE_H, 32, 8, capFill, capLight, capLine, true);
        // casing: jambs and head trim, lit on the left
        f.rect(0, faceTop, 3, FACE_H, m.base);
        f.vline(0, faceTop, FACE_H, m.line);
        f.vline(1, faceTop, FACE_H, m.light);
        f.rect(29, faceTop, 3, FACE_H, m.dark);
        f.vline(31, faceTop, FACE_H, m.line);
        f.vline(29, faceTop, FACE_H, m.base);
        f.rect(3, faceTop, 26, 4, m.base);
        f.hline(3, faceTop, 26, m.light);
        f.hline(3, faceTop + 3, 26, m.deep);
        f.hline(0, LINE_BOTTOM - 1, 3, m.line);
        f.hline(29, LINE_BOTTOM - 1, 3, m.line);
        swingLeaf(L(Math.max(LINE_BOTTOM, Math.round(fy))), tex, 3, LINE_BOTTOM, fx, fy, m.dark);
      }));
    }
  } else {
    const tex = leafTexture(kind, 28);
    for (const a of DOOR_ANGLES) {
      const fx = 16 - 28 * Math.sin(a);
      const fy = 2 + 28 * Math.cos(a);
      frames.push(layered(bounds, (L) => {
        lintel(L(32), LINE_TOP, -FACE_H, 8, 32, capFill, capLight, capLine, false);
        const leaf = L(Math.max(2, Math.round(fy)));
        if (a === 0) {
          leaf.rect(15, 2 - LEAF_H, 2, 28 + LEAF_H, m.base);
          leaf.vline(15, 2 - LEAF_H, 28 + LEAF_H, m.light);
          return;
        }
        swingLeaf(leaf, tex, 16, 2, fx, fy, m.base);
      }));
    }
  }
  return makeVariant({ w: 1, h: 1, mask: ['.'], frames, anim: { kind: 'door' } });
}

for (const kind of ['oak', 'glass'] as DoorKind[]) {
  defineAsset({
    id: `door.${kind}`,
    name: kind === 'oak' ? 'Oak door' : 'Glass door',
    group: 'door',
    category: 'Structure',
    layer: 'object',
    facings: ['down', 'left'],
    door: true,
    keywords: ['door', 'entrance', kind],
    build(facing: Dir) {
      return doorVariant(kind, facing);
    },
  });
}

// ---------------------------------------------------------------------------------------------------------
// Elevator: a brushed-steel portal standing against the wall north of it, centre-opening doors over a warm
// cab, floor indicator and call buttons. Doors open across 6 frames (anim 'door', driven by the director).

function brushed(p: Pen, x: number, y: number, w: number, h: number, seed: number): void {
  for (let i = 0; i < w; i++) {
    const r = hash2(x + i, seed, 301);
    if (r < 0.22) {
      const len = 6 + Math.floor(hash2(x + i, seed, 302) * (h - 6));
      const y0 = y + Math.floor(hash2(x + i, seed, 303) * (h - len));
      p.vline(x + i, y0, len, r < 0.1 ? mix(steel[4], steel[5], 0.55) : mix(steel[4], steel[3], 0.4));
    }
  }
}

function cab(p: Pen, x: number, y: number, w: number, h: number): void {
  const floorY = y + h - 12;
  p.rect(x, y, w, floorY - y, mix(oak[4], oak[5], 0.45));
  for (let px = x + 6; px < x + w - 2; px += 8) {
    p.vline(px, y + 3, floorY - y - 3, mix(oak[3], oak[4], 0.6));
  }
  p.hline(x, y, w, cream[6]);
  p.hline(x, y + 1, w, lightWarm[1]);
  p.hline(x, y + 2, w, mix(oak[4], oak[5], 0.7));
  p.hline(x, y + 21, w, steel[5]);
  p.hline(x, y + 22, w, steel[2]);
  p.rect(x, floorY, w, h - (floorY - y), mix(cream[3], cream[4], 0.4));
  p.hline(x, floorY, w, mix(oak[2], oak[3], 0.5));
  p.hline(x, floorY + 1, w, mix(cream[3], cream[4], 0.15));
  for (let i = 0; i < h - (floorY - y) - 2; i++) {
    p.px(x + 3 + ((i * 7) % (w - 6)), floorY + 2 + i, mix(cream[3], cream[4], 0.7));
  }
  // side walls of the cab: the lit left one and the shaded right one, widening toward the viewer
  for (let r = 0; r < h; r++) {
    const k = 1 + Math.floor((r / h) * 3);
    p.hline(x, y + r, k, r >= floorY - y ? mix(cream[3], oak[3], 0.5) : oak[5]);
    p.hline(x + w - k, y + r, k, r >= floorY - y ? mix(oak[2], cream[3], 0.4) : oak[3]);
  }
}

function elevatorDoorLeaf(p: Pen, x: number, y: number, w: number, h: number, leading: 'left' | 'right'): void {
  if (w <= 0) {
    return;
  }
  p.rect(x, y, w, h, steel[4]);
  brushed(p, x, y, w, h, 7);
  p.hline(x, y, w, steel[5]);
  p.hline(x, y + h - 1, w, steel[2]);
  p.vline(leading === 'right' ? x + w - 1 : x, y, h, steel[2]);
  if (w > 2) {
    p.vline(leading === 'right' ? x : x + w - 1, y, h, mix(steel[3], steel[4], 0.5));
  }
}

/** Lift state 0..1: the cab rises into the shaft until ARRIVE, then the doors slide open. Shared with src/agents/lift.ts. */
export const LIFT_ARRIVE = 0.45;

/**
 * The open shaft seen from above (the building is cut away at the 2nd floor): a dark well with guide rails and
 * hoist cables, and the cab roof rising into view as `k` goes 0..1. Rows outside the opening are clipped.
 */
function shaft(p: Pen, x0: number, y0: number, w: number, h: number, k: number): void {
  const s = mat(steel);
  for (let r = 0; r < h; r++) {
    const depth = r / h;
    p.hline(x0, y0 + r, w, mix(charcoal[2], charcoal[0], Math.min(1, depth * 1.6)));
  }
  // far (north) inner wall catches a little light; guide rails down both sides
  p.hline(x0, y0, w, charcoal[3]);
  p.hline(x0, y0 + 1, w, mix(charcoal[2], charcoal[3], 0.5));
  for (const rx of [x0 + 3, x0 + w - 5]) {
    p.vline(rx, y0, h, steel[1]);
    p.vline(rx + 1, y0, h, mix(steel[1], steel[2], 0.6));
  }
  const roofW = w - 12;
  const roofH = h - 6;
  const rx = x0 + 6;
  const ry = y0 + 3 + Math.round((1 - k) * (h + 2));
  const cableBottom = Math.min(y0 + h, ry + 4);
  for (const cx of [x0 + Math.floor(w / 2) - 4, x0 + Math.floor(w / 2) + 3]) {
    p.vline(cx, y0, cableBottom - y0, steel[2]);
  }
  if (k <= 0) {
    return;
  }
  const lit = Math.min(1, k * 1.2);
  const plate = mix(charcoal[1], s.base, lit);
  const plateHi = mix(charcoal[2], s.light, lit);
  const plateDark = mix(charcoal[0], s.dark, lit);
  const glow = mix(charcoal[2], lightWarm[0], lit);
  const clip = (yy: number) => yy >= y0 && yy < y0 + h;
  for (let r = -1; r <= roofH; r++) {
    const yy = ry + r;
    if (!clip(yy)) {
      continue;
    }
    if (r === -1 || r === roofH) {
      // light leaking around the cab
      p.hline(rx - 1, yy, roofW + 2, glow);
      continue;
    }
    p.hline(rx, yy, roofW, r === 0 ? plateHi : r === roofH - 1 ? plateDark : plate);
    p.px(rx - 1, yy, glow);
    p.px(rx + roofW, yy, glow);
    p.px(rx, yy, plateHi);
    p.px(rx + roofW - 1, yy, plateDark);
  }
  // crosshead the cables hang from, and a service hatch
  const crossY = ry + Math.floor(roofH / 2) - 1;
  for (let r = 0; r < 3; r++) {
    if (clip(crossY + r)) {
      p.hline(rx + 4, crossY + r, roofW - 8, r === 0 ? plateHi : plateDark);
    }
  }
  for (let r = 0; r < 6; r++) {
    const yy = ry + 3 + r;
    if (clip(yy)) {
      p.hline(rx + 4, yy, 9, r === 0 || r === 5 ? plateDark : plate);
    }
  }
  if (clip(ry + 2) && lit > 0.6) {
    p.px(rx + roofW - 6, ry + 2, lightWarm[1]);
  }
}

defineAsset({
  id: 'elevator',
  name: 'Elevator',
  group: 'elevator',
  category: 'Structure',
  layer: 'object',
  facings: ['down'],
  keywords: ['lift', 'elevator'],
  build() {
    const s = mat(steel);
    const frames: Part[][] = [];
    const W = 64;
    const TOP = -58;
    const FRONT = -26;
    const BOTTOM = 30;
    const DX = 15;
    const DW = 34;
    const DY = -12;
    const DH = BOTTOM - DY;
    const N = 14;
    for (let i = 0; i < N; i++) {
      const state = i / (N - 1);
      const k = Math.min(1, state / LIFT_ARRIVE);
      const t = Math.max(0, (state - LIFT_ARRIVE) / (1 - LIFT_ARRIVE));
      const doors = t * t * (3 - 2 * t);
      frames.push(layered(area(2, 1, 66), (L) => {
        const p = L(32);
        // shaft rim (cut top of the shaft walls), lit on the north and west edges
        p.rect(0, TOP, W, FRONT - TOP, s.light);
        p.hline(0, TOP, W, s.hi);
        p.vline(0, TOP, FRONT - TOP, s.hi);
        p.vline(W - 1, TOP, FRONT - TOP, s.dark);
        p.hline(0, FRONT - 1, W, s.base);
        shaft(p, 4, TOP + 4, W - 8, FRONT - TOP - 8, k);
        p.frame(3, TOP + 3, W - 6, FRONT - TOP - 6, s.line);
        // front face of the shaft box
        p.rect(0, FRONT, W, BOTTOM - FRONT, s.base);
        brushed(p, 2, FRONT + 1, W - 4, BOTTOM - FRONT - 2, 3);
        p.hline(0, FRONT, W, s.hi);
        p.vline(0, FRONT, BOTTOM - FRONT, s.light);
        p.vline(1, FRONT, BOTTOM - FRONT, mix(s.light, s.base, 0.5));
        p.vline(W - 1, FRONT, BOTTOM - FRONT, s.dark);
        p.vline(W - 2, FRONT, BOTTOM - FRONT, mix(s.dark, s.base, 0.5));
        // doorway surround, cab, sliding leaves
        p.rect(DX - 3, DY - 3, DW + 6, DH + 3, s.light);
        p.vline(DX - 3, DY - 3, DH + 3, s.hi);
        p.hline(DX - 3, DY - 3, DW + 6, s.hi);
        p.vline(DX + DW + 2, DY - 2, DH + 2, s.dark);
        p.rect(DX - 1, DY - 1, DW + 2, DH + 1, s.line);
        if (doors > 0) {
          cab(p, DX, DY, DW, DH);
        }
        const half = DW / 2;
        const leafW = Math.round(half * (1 - doors));
        elevatorDoorLeaf(p, DX, DY, leafW, DH, 'right');
        elevatorDoorLeaf(p, DX + DW - leafW, DY, leafW, DH, 'left');
        if (leafW === half) {
          p.vline(DX + half - 1, DY, DH, s.line);
        }
        p.hline(DX - 3, BOTTOM, DW + 6, s.hi);
        p.hline(DX - 3, BOTTOM + 1, DW + 6, s.dark);
        // floor indicator: arrow lights while the cab travels, "2" once it has arrived
        const moving = k > 0 && k < 1;
        p.rect(23, FRONT + 4, 18, 9, charcoal[0]);
        p.rect(24, FRONT + 5, 16, 7, charcoal[1]);
        const arrow = moving ? lightWarm[0] : charcoal[3];
        p.px(28, FRONT + 6, arrow);
        p.hline(27, FRONT + 7, 3, arrow);
        p.hline(26, FRONT + 8, 5, moving ? mustard[3] : charcoal[3]);
        const digit = k >= 1 ? lightWarm[1] : charcoal[3];
        for (const [gx, gy] of [[33, 6], [34, 6], [35, 7], [34, 8], [33, 9], [34, 9], [35, 9]]) {
          p.px(gx, FRONT + gy, digit);
        }
        // call buttons: the up button glows while a ride is on its way
        p.rect(53, DY + 6, 7, 14, s.hi);
        p.frame(53, DY + 6, 7, 14, s.dark);
        p.rect(55, DY + 9, 3, 3, state > 0 ? lightWarm[1] : s.base);
        p.rect(55, DY + 14, 3, 3, s.base);
        p.px(56, DY + 16, s.line);
      }));
    }
    return makeVariant({
      w: 2,
      h: 1,
      mask: ['##'],
      frames,
      anim: { kind: 'door' },
      spots: [stand(0, 1, 'down', 'elevator', 16)],
      shadows: [shadow(0, 26, 64, 6, 'rect')],
      lights: [warmLight(32, -40, 22, 0.35)],
    });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Stairs: a 2x3 stairwell. Rows 0-1 are the opening with treads descending north into shadow, railed on
// three sides; row 2 is the landing (walkable floor) with a steel nosing at the top step.

defineAsset({
  id: 'stairs',
  name: 'Stairwell (down)',
  group: 'stairs',
  category: 'Structure',
  layer: 'object',
  facings: ['down'],
  keywords: ['stairs', 'stairwell'],
  build() {
    const parts = layered(area(2, 3, 24), (L) => {
      const p = L(64);
      const x0 = 3;
      const w = 58;
      // The far wall of the well faces us and drops into the dark; the treads below it are foreshortened,
      // each showing a 4 px band (lit nosing, tread, shadow of the step above), darkening with depth.
      vgradient(p, x0, 2, w, 26, [mix(cream[2], cream[3], 0.4), cream[1], mix(walnut[0], walnut[1], 0.6), walnut[0]]);
      p.hline(x0, 11, w, steel[3]);
      p.hline(x0, 12, w, steel[1]);
      const treads = [oak[3], mix(oak[2], oak[3], 0.5), oak[2], walnut[2], walnut[1], mix(walnut[0], walnut[1], 0.5), walnut[0], mix(walnut[0], charcoal[0], 0.5), charcoal[0]];
      for (let i = 0; i < treads.length; i++) {
        const y = 60 - 4 * i;
        const nose = i === 0 ? oak[4] : treads[i - 1];
        const under = treads[Math.min(treads.length - 1, i + 1)];
        p.hline(x0, y, w, nose);
        p.rect(x0, y + 1, w, 2, treads[i]);
        p.hline(x0, y + 3, w, under);
      }
      p.hline(x0, 28, w, charcoal[0]);
      p.vline(x0, 2, 62, mix(walnut[0], charcoal[0], 0.5));
      p.vline(x0 + w - 1, 2, 62, charcoal[0]);
      p.vline(x0 + w - 2, 29, 35, mix(walnut[0], walnut[1], 0.5));
      // slab edge around the opening
      const rim = mat(steel);
      p.rect(0, 0, 64, 2, rim.base);
      p.hline(0, 0, 64, rim.light);
      p.rect(0, 0, 3, 64, rim.base);
      p.vline(0, 0, 64, rim.dark);
      p.vline(1, 0, 64, rim.light);
      p.rect(61, 0, 3, 64, rim.base);
      p.vline(63, 0, 64, rim.dark);
      // top step nosing with a grip strip
      p.hline(0, 64, 64, rim.hi);
      p.hline(0, 65, 64, rim.base);
      p.hline(3, 66, 58, mix(mustard[2], mustard[3], 0.5));
      p.hline(0, 67, 64, rim.dark);
      // railings: steel balusters, oak handrail 16 px up; the side runs are seen edge-on as slim bars
      const RH = 16;
      const rail = mat(oak);
      for (let x = 4; x < 61; x += 4) {
        p.vline(x, 2 - RH + 2, RH - 1, steel[2]);
      }
      p.hline(2, 2 - 6, 60, steel[3]);
      for (const sx of [1, 61]) {
        p.vline(sx, 2 - RH, 63 - 2, steel[4]);
        p.vline(sx + 1, 2 - RH, 63 - 2, steel[2]);
        p.rect(sx, 63 - RH, 2, RH + 1, steel[4]);
        p.vline(sx + 1, 63 - RH, RH + 1, steel[2]);
        p.rect(sx, 2 - RH - 1, 2, 63 - 2 - 1, rail.base);
        p.vline(sx, 2 - RH - 1, 63 - 2 - 1, rail.light);
        p.rect(sx - 1, 63 - RH - 2, 4, 2, rail.light);
        p.hline(sx - 1, 63 - RH, 4, rail.line);
      }
      p.rect(0, 2 - RH - 1, 64, 2, rail.base);
      p.hline(0, 2 - RH - 1, 64, rail.light);
      p.hline(0, 2 - RH + 1, 64, rail.line);
    });
    return makeVariant({
      w: 2,
      h: 3,
      mask: ['##', '##', '..'],
      parts,
      spots: [stand(0, 3, 'down', 'stairs', 16)],
    });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Façade: the two storeys below the office floor, in brick or render. Pieces are 32 px wide modules that
// tile seamlessly; their top edge meets the building's south wall line, their bottom edge the street.
//   rows 0-3 cornice slab · 5-40 first floor (windows) · 41-45 string course · 46-88 ground floor · 89-95 plinth

type Skin = 'brick' | 'render';
type Piece = 'wall' | 'window' | 'entrance' | 'left' | 'right';

const FH = 96;
const STRING = 41;
const PLINTH = 89;

function body(skin: Skin, col: number, row: number): string {
  if (skin === 'brick') {
    return brickAt(col, row < STRING ? row - 5 : row - 47, 0);
  }
  const c = renderAt(col, row);
  if (row >= 47 && row < PLINTH) {
    const r = (row - 47) % 9;
    if (r === 8) {
      return mix(cream[2], cream[3], 0.6);
    }
    if (r === 0) {
      return mix(c, cream[6], 0.35);
    }
  }
  return c;
}

/** Shaded wall pixel (under a band or sill). */
function bodyShade(skin: Skin, col: number, row: number): string {
  return skin === 'brick' ? mix(body(skin, col, row), terracotta[0], 0.45) : mix(body(skin, col, row), cream[2], 0.55);
}

function stoneBand(p: Pen, x: number, w: number, y: number, h: number): void {
  p.rect(x, y, w, h, paving[4]);
  p.hline(x, y, w, paving[5]);
  p.hline(x, y + h - 1, w, paving[2]);
  if (h > 3) {
    p.hline(x, y + h - 2, w, paving[3]);
  }
}

/** Reflective glass pane, opaque (nothing shows through a façade). `inside` adds a hint of a lit room. */
function pane(p: Pen, x: number, y: number, w: number, h: number, inside = false): void {
  for (let r = 0; r < h; r++) {
    const t = r / Math.max(1, h - 1);
    const c = t < 0.18 ? mix(glassTint, cream[6], 0.35) : t < 0.5 ? glassTint : t < 0.8 ? mix(glassTint, water[2], 0.45) : mix(water[2], water[1], 0.4);
    p.hline(x, y + r, w, c);
  }
  if (inside && h > 18) {
    const fy = y + h - 7;
    p.rect(x, fy, w, 7, mix(mix(water[2], water[1], 0.4), oak[3], 0.35));
    p.hline(x, fy, w, mix(glassTint, oak[4], 0.4));
  }
  for (let i = 0; i < h; i++) {
    const gx = x + Math.round(w * 0.55) - Math.round(i * 0.7);
    if (gx >= x && gx < x + w - 1 && i > 1 && i < h - 2) {
      p.px(gx, y + i, glassGlint);
      p.px(gx + 1, y + i, mix(glassTint, glassGlint, 0.6));
    }
  }
}

/** First-floor window centred in a 32 px module at x. */
function upperWindow(p: Pen, skin: Skin, x: number): void {
  const wx = x + 7;
  const ww = 18;
  if (skin === 'brick') {
    for (let i = -1; i < ww + 1; i++) {
      const c = i % 3 === 2 ? mix(cream[2], cream[3], 0.55) : mix(terracotta[1], terracotta[2], 0.55);
      p.vline(wx + i, 6, 4, c);
      p.px(wx + i, 6, i % 3 === 2 ? mix(cream[2], cream[3], 0.55) : mix(terracotta[2], terracotta[4], 0.4));
    }
  } else {
    p.rect(wx - 2, 7, ww + 4, 2, mix(cream[5], cream[6], 0.4));
    p.hline(wx - 2, 7, ww + 4, cream[6]);
    p.hline(wx - 2, 9, ww + 4, cream[2]);
  }
  const fr = mat(cream);
  p.rect(wx, 10, ww, 23, fr.light);
  p.frame(wx, 10, ww, 23, fr.dark);
  p.hline(wx + 1, 11, ww - 2, fr.hi);
  // top lights with blinds lowered
  for (let r = 0; r < 5; r++) {
    p.hline(wx + 2, 12 + r, ww - 4, r % 2 === 0 ? cream[5] : mix(cream[3], cream[4], 0.5));
  }
  p.hline(wx + 2, 17, ww - 4, fr.base);
  p.hline(wx + 2, 18, ww - 4, fr.light);
  pane(p, wx + 2, 19, 6, 12);
  pane(p, wx + 10, 19, 6, 12);
  p.vline(wx + 8, 12, 19, fr.light);
  p.vline(wx + 9, 12, 19, fr.base);
  stoneBand(p, wx - 1, ww + 2, 33, 3);
  for (let i = wx; i < wx + ww + 1; i++) {
    p.px(i, 36, bodyShade(skin, i, 36));
  }
}

/** Ground-floor shop window in a 32 px module at x. */
function groundWindow(p: Pen, skin: Skin, x: number): void {
  if (skin === 'brick') {
    for (let i = 2; i < 30; i++) {
      const c = i % 3 === 1 ? mix(cream[2], cream[3], 0.55) : mix(terracotta[1], terracotta[2], 0.55);
      p.vline(x + i, 47, 3, c);
    }
  }
  const f = mat(charcoal);
  p.rect(x + 3, 50, 26, 39, f.base);
  p.hline(x + 3, 50, 26, f.light);
  p.vline(x + 3, 50, 39, f.light);
  pane(p, x + 5, 52, 22, 5);
  pane(p, x + 5, 59, 10, 29, true);
  pane(p, x + 17, 59, 10, 29, true);
  p.hline(x + 5, 58, 22, f.dark);
  p.vline(x + 15, 59, 29, f.dark);
  p.vline(x + 16, 59, 29, f.base);
}

const GLYPHS: Record<string, string[]> = {
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  I: ['#', '#', '#', '#', '#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  G: ['.###', '#...', '#.##', '#..#', '.##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  ' ': ['..', '..', '..', '..', '..'],
};

function textWidth(s: string): number {
  return [...s].reduce((n, ch) => n + GLYPHS[ch][0].length + 1, -1);
}

function text(p: Pen, s: string, x: number, y: number, c: string): void {
  let cx = x;
  for (const ch of s) {
    const g = GLYPHS[ch];
    g.forEach((row, r) => [...row].forEach((on, i) => on === '#' && p.px(cx + i, y + r, c)));
    cx += g[0].length + 1;
  }
}

/** The lobby seen through the entrance glass: warm back wall, a plant, terrazzo floor. */
function lobby(p: Pen, x: number, y: number, w: number, h: number): void {
  const floorY = y + h - 9;
  p.rect(x, y, w, h, mix(cream[3], cream[4], 0.35));
  p.rect(x, y, w, 4, mix(cream[2], cream[3], 0.5));
  p.hline(x, y + 4, w, lightWarm[1]);
  p.rect(x, floorY, w, h - (floorY - y), mix(cream[4], cream[5], 0.2));
  p.hline(x, floorY, w, mix(oak[2], oak[3], 0.5));
  p.rect(x + 3, y + 12, 10, 8, mix(oak[3], oak[4], 0.5));
  p.frame(x + 3, y + 12, 10, 8, oak[2]);
  p.rect(x + w - 9, floorY - 6, 6, 6, terracotta[3]);
  p.ellipse(x + w - 12, floorY - 18, 12, 13, plant[3]);
  p.ellipse(x + w - 11, floorY - 17, 8, 8, plant[4]);
}

function glassOver(p: Pen, x: number, y: number, w: number, h: number, amount: number): void {
  const img = p.ctx.getImageData(x + p.ox, y + p.oy, w, h);
  const [tr, tg, tb] = [0x9f, 0xc3, 0xcf];
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = Math.round(img.data[i] * (1 - amount) + tr * amount);
    img.data[i + 1] = Math.round(img.data[i + 1] * (1 - amount) + tg * amount);
    img.data[i + 2] = Math.round(img.data[i + 2] * (1 - amount) + tb * amount);
  }
  p.ctx.putImageData(img, x + p.ox, y + p.oy);
  for (let i = 2; i < h - 2; i++) {
    const gx = x + Math.round(w * 0.6) - Math.round(i * 0.6);
    if (gx > x && gx < x + w - 1) {
      p.px(gx, y + i, glassGlint);
    }
  }
}

/** Entrance bay (64 px): glass vestibule with sliding double doors (openness t), canopy with the sign. */
function entrance(p: Pen, skin: Skin, t: number): void {
  const f = mat(charcoal);
  upperWindow(p, skin, 0);
  upperWindow(p, skin, 32);
  // vestibule frame
  p.rect(4, 50, 56, 39, f.base);
  p.hline(4, 50, 56, f.light);
  p.vline(4, 50, 39, f.light);
  lobby(p, 6, 52, 52, 37);
  // fixed sidelights and transom
  glassOver(p, 6, 52, 9, 37, 0.55);
  glassOver(p, 49, 52, 9, 37, 0.55);
  glassOver(p, 15, 52, 34, 5, 0.55);
  p.vline(15, 52, 37, f.dark);
  p.vline(48, 52, 37, f.dark);
  p.hline(15, 57, 34, f.dark);
  // sliding leaves: each 16 px, sliding outward in front of the sidelights
  const shift = Math.round(t * 14);
  const leaf = (lx: number) => {
    glassOver(p, lx + 1, 59, 14, 29, 0.42);
    p.frame(lx, 58, 16, 31, f.light);
    p.vline(lx, 58, 31, f.hi);
    p.rect(lx + (lx < 32 ? 12 : 2), 70, 2, 8, steel[5]);
  };
  if (t < 1) {
    leaf(16 - shift);
    leaf(32 + shift);
  } else {
    leaf(2);
    leaf(46);
  }
  // mat, then the canopy: lit top, dark fascia with the sign, shadow on the glass under it
  p.rect(18, 87, 28, 2, mix(charcoal[2], walnut[2], 0.5));
  const top = 43;
  p.rect(1, top, 62, 4, steel[5]);
  p.hline(1, top, 62, steel[6]);
  p.vline(1, top, 4, steel[3]);
  p.vline(62, top, 4, steel[3]);
  p.rect(1, top + 4, 62, 7, charcoal[1]);
  p.hline(1, top + 4, 62, charcoal[3]);
  p.hline(1, top + 10, 62, charcoal[0]);
  const label = 'TINY AGENTS';
  text(p, label, 32 - Math.floor(textWidth(label) / 2), top + 5, lightWarm[1]);
  // tie rods up to the wall
  p.line(4, top - 1, 7, 32, steel[2]);
  p.line(59, top - 1, 56, 32, steel[2]);
  // wall lanterns either side of the entrance
  for (const lx of [1, 61]) {
    p.rect(lx, 60, 2, 1, charcoal[0]);
    p.rect(lx - 0, 61, 2, 4, lightWarm[1]);
    p.px(lx, 61, cream[6]);
    p.rect(lx, 65, 2, 1, charcoal[0]);
  }
}

function facadePiece(skin: Skin, piece: Piece, t = 0): Part[] {
  const w = piece === 'entrance' ? 64 : 32;
  return layered({ x: -2, y: -4, w: w + 4, h: FH + 8 }, (L) => {
    const p = L(FH);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < FH; y++) {
        p.px(x, y, body(skin, x, y));
      }
    }
    // cornice slab, string course and plinth, each casting a 1 px shadow
    stoneBand(p, 0, w, 0, 4);
    stoneBand(p, 0, w, STRING, 5);
    for (let x = 0; x < w; x++) {
      p.px(x, 4, bodyShade(skin, x, 4));
      p.px(x, STRING + 5, bodyShade(skin, x, STRING + 5));
    }
    p.rect(0, PLINTH, w, FH - PLINTH, paving[3]);
    p.hline(0, PLINTH, w, paving[5]);
    p.hline(0, PLINTH + 1, w, paving[4]);
    p.hline(0, FH - 2, w, paving[2]);
    p.hline(0, FH - 1, w, paving[1]);
    for (let x = 15; x < w; x += 16) {
      p.vline(x, PLINTH + 2, FH - PLINTH - 3, paving[2]);
    }
    if (piece === 'wall' || piece === 'window') {
      upperWindow(p, skin, 0);
    }
    if (piece === 'window') {
      groundWindow(p, skin, 0);
    }
    if (piece === 'entrance') {
      entrance(p, skin, t);
    }
    if (piece === 'left' || piece === 'right') {
      const px0 = piece === 'left' ? 0 : w - 8;
      for (let y = 0; y < FH; y++) {
        if (y < 4 || (y >= STRING && y < STRING + 5) || y >= PLINTH) {
          continue;
        }
        for (let i = 0; i < 8; i++) {
          let c: string;
          if (skin === 'brick') {
            const block = Math.floor(y / 6);
            const bw = block % 2 === 0 ? 8 : 6;
            const inside = piece === 'left' ? i < bw : i >= 8 - bw;
            if (!inside) {
              continue;
            }
            const joint = y % 6 === 5;
            c = joint ? paving[2] : y % 6 === 0 ? paving[5] : block % 3 === 0 ? mix(paving[4], paving[5], 0.4) : paving[4];
          } else {
            c = y % 12 === 11 ? cream[3] : i === 1 ? cream[6] : mix(cream[5], cream[6], 0.3);
          }
          p.px(px0 + i, y, c);
        }
      }
      const edgeX = piece === 'left' ? 0 : w - 1;
      p.vline(edgeX, 0, FH, skin === 'brick' ? paving[1] : cream[1]);
      p.vline(piece === 'left' ? 8 : w - 9, 5, STRING - 5, skin === 'brick' ? mix(terracotta[0], terracotta[1], 0.5) : cream[3]);
      p.vline(piece === 'left' ? 8 : w - 9, STRING + 6, PLINTH - STRING - 6, skin === 'brick' ? mix(terracotta[0], terracotta[1], 0.5) : cream[3]);
    }
  });
}

const FACADE_SKINS: Skin[] = ['brick', 'render'];

for (const skin of FACADE_SKINS) {
  const skinName = skin === 'brick' ? 'brick' : 'render';
  const shadows = (w: number) => [shadow(0, FH - 4, w, 5, 'rect')];
  defineAsset({
    id: `facade.wall.${skin}`,
    name: `Façade wall (${skinName})`,
    group: 'facade.wall',
    category: 'Structure',
    layer: 'object',
    facings: ['down'],
    keywords: ['facade', 'exterior', skin],
    build() {
      return makeVariant({ w: 1, h: 3, parts: facadePiece(skin, 'wall'), shadows: shadows(32) });
    },
  });
  defineAsset({
    id: `facade.window.${skin}`,
    name: `Façade window (${skinName})`,
    group: 'facade.wall',
    category: 'Structure',
    layer: 'object',
    facings: ['down'],
    keywords: ['facade', 'exterior', 'window', skin],
    build() {
      return makeVariant({ w: 1, h: 3, parts: facadePiece(skin, 'window'), shadows: shadows(32), lights: [nightLight(16, 74, 30, 0.3)] });
    },
  });
  defineAsset({
    id: `facade.entrance.${skin}`,
    name: `Façade entrance (${skinName})`,
    group: 'facade.entrance',
    category: 'Structure',
    layer: 'object',
    facings: ['down'],
    door: true,
    keywords: ['facade', 'entrance', 'door', 'sign', skin],
    build() {
      const frames = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => facadePiece(skin, 'entrance', t));
      return makeVariant({
        w: 2,
        h: 3,
        frames,
        anim: { kind: 'door' },
        spots: [stand(0, 3, 'up', 'enter', 16)],
        shadows: shadows(64),
        lights: [nightLight(32, 92, 44, 0.5), nightLight(2, 66, 26, 0.45), nightLight(62, 66, 26, 0.45)],
      });
    },
  });
  for (const side of ['left', 'right'] as const) {
    defineAsset({
      id: `facade.corner.${side}.${skin}`,
      name: `Façade corner ${side} (${skinName})`,
      group: 'facade.corner',
      category: 'Structure',
      layer: 'object',
      facings: ['down'],
      keywords: ['facade', 'corner', skin],
      build() {
        return makeVariant({ w: 1, h: 3, parts: facadePiece(skin, side), shadows: shadows(32) });
      },
    });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Exterior windows seen from inside (wall layer). The footprint's bottom edge is the face's floor line, so
// the face spans y = -8 .. 32 and the sill lands on the wall rail.

function outsideView(dst: Pen, x: number, y: number, w: number, h: number, seed: number): void {
  const p = pen(dst.ctx, dst.ox, dst.oy, { x, y, w, h });
  for (let r = 0; r < h; r++) {
    const t = r / Math.max(1, h - 1);
    p.hline(x, y + r, w, t < 0.3 ? mix(water[4], water[5], 0.6) : t < 0.55 ? mix(water[4], water[5], 0.25) : water[4]);
  }
  // a cloud
  const cx = x + 4 + Math.floor(hash2(seed, 1, 401) * Math.max(1, w - 16));
  p.rect(cx, y + 3, 9, 2, cream[6]);
  p.rect(cx + 2, y + 2, 4, 1, cream[6]);
  p.hline(cx + 1, y + 5, 7, mix(water[5], cream[6], 0.5));
  // tree tops along the bottom
  for (let i = -4; i < w + 4; i += 7) {
    const hh = 5 + Math.floor(hash2(seed, i, 402) * 5);
    const bx = x + i;
    const ty = y + h - hh;
    p.ellipse(bx, ty, 10, hh * 2, plant[3]);
    p.ellipse(bx + 1, ty + 1, 6, 4, plant[4]);
  }
  p.rect(x, y + h - 3, w, 3, plant[2]);
}

function windowFrame(p: Pen, x: number, y: number, w: number, h: number, panes: number, seed: number): void {
  const fr = mat(cream);
  p.rect(x, y, w, h, fr.light);
  p.frame(x, y, w, h, fr.dark);
  p.hline(x + 1, y + 1, w - 2, fr.hi);
  p.vline(x + 1, y + 1, h - 2, fr.hi);
  const ix = x + 3;
  const iw = w - 6;
  const iy = y + 3;
  const ih = h - 5;
  outsideView(p, ix, iy, iw, ih, seed);
  // blinds pulled up to the head
  p.rect(ix, iy, iw, 3, cream[5]);
  p.hline(ix, iy + 1, iw, cream[4]);
  p.hline(ix, iy + 3, iw, mix(cream[3], cream[4], 0.5));
  for (let k = 1; k < panes; k++) {
    const mx = ix + Math.round((iw * k) / panes) - 1;
    p.rect(mx, iy, 2, ih, fr.light);
    p.vline(mx + 1, iy, ih, fr.base);
  }
  // glints
  for (let k = 0; k < panes; k++) {
    const px0 = ix + Math.round((iw * k) / panes) + 3;
    p.line(px0, iy + 10, px0 + 4, iy + 6, glassGlint);
  }
  // sill: a top face and a front edge, slightly wider than the frame
  p.rect(x - 2, y + h, w + 4, 2, cream[6]);
  p.rect(x - 2, y + h + 2, w + 4, 2, fr.base);
  p.hline(x - 2, y + h + 3, w + 4, fr.dark);
}

function wallWindow(w: number) {
  const W = w * 32;
  const parts = layered(area(w, 1, 24), (L) => {
    windowFrame(L(32), 4, -5, W - 8, 21, w === 2 ? 3 : 1, w);
  });
  const daylight: Light = { x: W / 2, y: 44, radius: w === 2 ? 84 : 56, color: glassGlint, intensity: 0.32 };
  return makeVariant({ w, h: 1, parts, lights: [daylight] });
}

defineAsset({
  id: 'wall.window',
  name: 'Window (wide)',
  group: 'window',
  category: 'Structure',
  layer: 'wall',
  facings: ['down'],
  keywords: ['window', 'daylight'],
  build() {
    return wallWindow(2);
  },
});

defineAsset({
  id: 'wall.window.small',
  name: 'Window (small)',
  group: 'window.small',
  category: 'Structure',
  layer: 'wall',
  facings: ['down'],
  keywords: ['window', 'daylight'],
  build() {
    return wallWindow(1);
  },
});
