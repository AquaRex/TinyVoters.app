import { Dir } from '../config';
import {
  ACCENT_RAMPS, Appearance, CLOTH_RAMPS, HAIR_RAMPS, HairStyle, PANTS_RAMPS, Ramp, SHOE_RAMPS, SKIN_RAMPS, TopStyle, rampFor,
} from '../agents/appearance';
import { cream, steel, walnut } from '../art/kit/palette';
import { makeCanvas } from './pixel';

export type Pose =
  | 'stand' | 'walk' | 'sit' | 'type' | 'sitTalk' | 'talk' | 'drink' | 'sitDrink' | 'carry' | 'wave' | 'phone' | 'read';

export const POSES: readonly Pose[] = ['stand', 'walk', 'sit', 'type', 'sitTalk', 'talk', 'drink', 'sitDrink', 'carry', 'wave', 'phone', 'read'];

/** stand: frames 0-2 breathe, frame 3 blinks. sit: frame 1 blinks. Every other pose loops all its frames. */
export const POSE_FRAMES: Record<Pose, number> = {
  stand: 4, walk: 6, sit: 2, type: 4, sitTalk: 4, talk: 4, drink: 4, sitDrink: 4, carry: 6, wave: 4, phone: 4, read: 4,
};

export const CHAR_W = 32;
export const CHAR_H = 48;
export const CHAR_FOOT_X = 16;
export const CHAR_FOOT_Y = 45;
/** Alias of CHAR_FOOT_Y for older callers. */
export const CHAR_FOOT = CHAR_FOOT_Y;

export interface FrameOpts {
  smiling?: boolean;
  /** Force closed eyes on any pose. */
  blink?: boolean;
}

const W = CHAR_W;
const H = CHAR_H;
const SEATED: ReadonlySet<Pose> = new Set(['sit', 'type', 'sitTalk', 'sitDrink']);

// ---------------------------------------------------------------- raster

const T_SKIN = 1;
const T_HAIR = 2;
const T_TOP = 3;
const T_UNDER = 4;
const T_PANTS = 5;
const T_SHOE = 6;
const T_ITEM = 7;
const T_ACC = 8;
const T_EYE = 9;

interface M {
  c: number[];
  tag: number;
}

function pack(hex: string): number {
  const n = parseInt(hex.slice(1, 7), 16);
  return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
}

function mat(ramp: Ramp, tag: number): M {
  return { c: [0, 1, 2, 3, 4].map((i) => pack(ramp[Math.min(i, ramp.length - 1)])), tag };
}

let C = new Uint32Array(W * H);
let E = new Uint32Array(W * H);
let G = new Uint8Array(W * H);
let S = new Uint8Array(W * H);

function px(x: number, y: number, m: M, s: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H) {
    return;
  }
  const i = y * W + x;
  C[i] = m.c[s];
  E[i] = m.c[0];
  G[i] = m.tag;
  S[i] = s;
}

function rect(x: number, y: number, w: number, h: number, m: M, s: number): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      px(i, j, m, s);
    }
  }
}

function tagAt(x: number, y: number): number {
  return x < 0 || y < 0 || x >= W || y >= H ? 0 : G[y * W + x];
}

/** Sel-out: every empty pixel touching the figure takes the darkest step of the neighbouring material. */
function outlinePass(): void {
  const out = C.slice();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (C[i] !== 0) {
        continue;
      }
      const n = y < H - 1 && C[i + W] ? i + W : x > 0 && C[i - 1] ? i - 1 : x < W - 1 && C[i + 1] ? i + 1 : y > 0 && C[i - W] ? i - W : -1;
      if (n >= 0) {
        out[i] = E[n];
      }
    }
  }
  C = out;
}

function flipRaster(): void {
  for (let y = 0; y < H; y++) {
    C.subarray(y * W, y * W + W).reverse();
  }
}

// ---------------------------------------------------------------- look

interface Kit {
  skin: M;
  hair: M;
  top: M;
  under: M;
  pants: M;
  shoe: M;
  accent: M;
  eye: M;
  mouth: M;
  item: M;
  coffee: M;
  metal: M;
  blush: number;
  style: TopStyle;
  hairStyle: HairStyle;
}

const EYE_RAMP: Ramp = ['#1f1a24', '#2b2232', '#2b2232', '#fbf5e9', '#fbf5e9'];
const MOUTH_RAMP: Ramp = ['#4a1c26', '#6e2a36', '#a8484e', '#d0767a'];
const BLUSH = ['#f4a898', '#eea08e', '#dc8a6e', '#c27258', '#9a5640', '#734030'];

function kit(a: Appearance): Kit {
  const skinRamp = rampFor(SKIN_RAMPS, a.skin);
  const topRamp = rampFor(CLOTH_RAMPS, a.topColor);
  const light = topRamp === CLOTH_RAMPS[13];
  return {
    skin: mat(skinRamp, T_SKIN),
    hair: mat(rampFor(HAIR_RAMPS, a.hairColor), T_HAIR),
    top: mat(topRamp, T_TOP),
    under: mat(light ? CLOTH_RAMPS[8] : CLOTH_RAMPS[13], T_UNDER),
    pants: mat(rampFor(PANTS_RAMPS, a.pants), T_PANTS),
    shoe: mat(rampFor(SHOE_RAMPS, a.shoes), T_SHOE),
    accent: mat(rampFor(ACCENT_RAMPS, a.accent), T_ACC),
    eye: mat(EYE_RAMP, T_EYE),
    mouth: mat(MOUTH_RAMP, T_EYE),
    item: mat([cream[1], cream[3], cream[5], cream[6], cream[6]], T_ITEM),
    coffee: mat([walnut[0], walnut[1], walnut[2], walnut[3]], T_ITEM),
    metal: mat([steel[0], steel[1], steel[2], steel[4], steel[6]], T_ITEM),
    blush: pack(BLUSH[SKIN_RAMPS.indexOf(skinRamp)] ?? BLUSH[1]),
    style: a.top,
    hairStyle: a.hair,
  };
}

// ---------------------------------------------------------------- rig

type View = 'down' | 'up' | 'left';
type V2 = [number, number];

interface Arm {
  /** Top-left of the 2x2 hand, in body space (the rig's `u` is added). */
  h: V2;
  e?: V2;
  /** Drawn behind the torso. */
  back?: boolean;
  /** Forearm crosses the body: give it a contour line. */
  over?: boolean;
}

/** Legs: front views [screen-left, screen-right], side view [far, near]; [dx, lift]. */
type Leg = [number, number];

interface Held {
  kind: 'mug' | 'phone' | 'book';
  x: number;
  y: number;
  back?: boolean;
  frame?: number;
}

interface Rig {
  view: View;
  seated: boolean;
  u: number;
  legs: [Leg, Leg];
  arms: [Arm, Arm];
  eyes: 'open' | 'closed' | 'down';
  mouth: 'rest' | 'smile' | 'open';
  held?: Held;
}

const WALK_BOB = [0, 1, 0, 0, 1, 0];
const FRONT_LIFT_L = [-1, 0, 0, 1, 2, 1];
const FRONT_LIFT_R = [1, 2, 1, -1, 0, 0];
const SIDE_NEAR_X = [-4, -2, 1, 4, 1, -2];
const SIDE_NEAR_LIFT = [0, 0, 0, 0, 2, 2];
const SIDE_FAR_X = [4, 1, -2, -4, -2, 1];
const SIDE_FAR_LIFT = [0, 2, 2, 0, 0, 0];
const ARM_SWING = [2, 1, -1, -2, -1, 1];

function rig(view: View, pose: Pose, f: number, smiling: boolean): Rig {
  const seated = SEATED.has(pose);
  const r: Rig = {
    view,
    seated,
    u: seated ? 3 : 0,
    legs: [[0, 0], [0, 0]],
    arms: view === 'left' ? [{ h: [15, 28], back: true }, { h: [15, 28] }] : [{ h: [9, 28] }, { h: [21, 28] }],
    eyes: 'open',
    mouth: smiling ? 'smile' : 'rest',
  };
  const walking = pose === 'walk' || pose === 'carry';
  if (walking) {
    r.u = WALK_BOB[f];
    if (view === 'left') {
      r.legs = [[SIDE_FAR_X[f], SIDE_FAR_LIFT[f]], [SIDE_NEAR_X[f], SIDE_NEAR_LIFT[f]]];
      const s = ARM_SWING[f];
      r.arms = [
        { h: [15 + s, 28 - (Math.abs(s) > 1 ? 1 : 0)], back: true },
        { h: [15 - s, 28 - (Math.abs(s) > 1 ? 1 : 0)] },
      ];
    } else {
      r.legs = [[0, FRONT_LIFT_L[f]], [0, FRONT_LIFT_R[f]]];
      const s = ARM_SWING[f];
      const arm = (x: number, sw: number): Arm => ({ h: [x, 28 + (sw > 1 ? 1 : sw < -1 ? -1 : 0)] });
      r.arms = view === 'down' ? [arm(9, -s), arm(21, s)] : [arm(9, s), arm(21, -s)];
    }
  } else if (view === 'left' && !seated) {
    r.legs = [[1, 0], [0, 0]];
  }
  if (seated) {
    r.arms = view === 'left'
      ? [{ h: [12, 29], e: [15, 25], back: true }, { h: [11, 29], e: [15, 25] }]
      : [{ h: [11, 28], e: [9, 25], over: true }, { h: [19, 28], e: [21, 25], over: true }];
    if (view === 'up') {
      r.arms = [{ h: [9, 27] }, { h: [21, 27] }];
    }
  }
  if (pose === 'stand') {
    r.u = f === 1 || f === 2 ? 1 : 0;
    r.eyes = f === 3 ? 'closed' : 'open';
  }
  if (pose === 'sit') {
    r.eyes = f === 1 ? 'closed' : 'open';
  }
  const talking = f === 1 || f === 3;

  switch (pose) {
    case 'type': {
      const up = [[0, 0], [-1, 0], [0, 0], [0, -1]][f];
      if (view === 'down') {
        r.arms = [{ h: [12, 27 + up[0]], e: [9, 25], over: true }, { h: [18, 27 + up[1]], e: [21, 25], over: true }];
      } else if (view === 'up') {
        r.arms = [{ h: [11, 20 + up[0]], e: [8, 25 + up[0]], back: true }, { h: [19, 20 + up[1]], e: [23, 25 + up[1]], back: true }];
      } else {
        r.arms = [{ h: [9, 26 + up[1]], e: [14, 26], back: true }, { h: [8, 26 + up[0]], e: [14, 27] }];
      }
      r.eyes = f === 2 && view !== 'up' ? 'down' : 'open';
      break;
    }
    case 'talk':
    case 'sitTalk': {
      const g = [[0, 0], [1, -2], [0, -1], [1, -3]][f];
      if (view === 'down') {
        r.arms[1] = { h: [20 + g[0], 23 + g[1]], e: [22, 26], over: true };
      } else if (view === 'up') {
        r.arms[1] = { h: [22 + g[0], 22 + g[1]], e: [23, 25] };
      } else {
        r.arms[1] = { h: [9 - g[0], 23 + g[1]], e: [14, 26] };
      }
      r.mouth = talking ? 'open' : r.mouth;
      break;
    }
    case 'drink':
    case 'sitDrink': {
      const lift = [0, 1, 2, 1][f];
      if (view === 'down') {
        const hy = [25, 21, 16, 21][f];
        r.arms[1] = { h: [18, hy], e: [22, lift === 2 ? 22 : 26], over: true };
        r.held = { kind: 'mug', x: 15, y: hy - 1 };
      } else if (view === 'up') {
        const hy = [25, 21, 17, 21][f];
        r.arms[1] = { h: [20, hy], e: [23, lift === 2 ? 21 : 25], back: lift < 2 };
        r.held = { kind: 'mug', x: 19, y: hy - 1, back: true };
      } else {
        const hy = [24, 20, 15, 20][f];
        const hx = [12, 11, 10, 11][f];
        r.arms[1] = { h: [hx, hy], e: [14, lift === 2 ? 22 : 25] };
        r.held = { kind: 'mug', x: hx - 3, y: hy - 1 };
      }
      if (lift === 2) {
        r.eyes = 'closed';
      }
      break;
    }
    case 'carry': {
      if (view === 'down') {
        r.arms[1] = { h: [19, 25], e: [22, 25], over: true };
        r.held = { kind: 'mug', x: 16, y: 24 };
      } else if (view === 'up') {
        r.arms[1] = { h: [20, 24], e: [22, 26], back: true };
        r.held = { kind: 'mug', x: 19, y: 23, back: true };
      } else {
        r.arms[1] = { h: [10, 25], e: [14, 26] };
        r.held = { kind: 'mug', x: 7, y: 24 };
      }
      break;
    }
    case 'wave': {
      const w = [0, 1, 0, -1][f];
      if (view === 'left') {
        r.arms[1] = { h: [5 + Math.max(0, w), 11 - Math.abs(w)], e: [9, 18] };
      } else {
        r.arms[1] = { h: [25 + w, 10], e: [24, 18] };
      }
      r.mouth = 'smile';
      if (f === 1 || f === 3) {
        r.mouth = 'open';
      }
      break;
    }
    case 'phone': {
      if (view === 'left') {
        r.arms[1] = { h: [16, 13], e: [15, 22] };
        r.held = { kind: 'phone', x: 17, y: 9 };
      } else {
        r.arms[1] = { h: [22, 13], e: [23, 22] };
        r.held = { kind: 'phone', x: 23, y: 9 };
      }
      r.mouth = talking ? 'open' : 'rest';
      if (smiling && !talking) {
        r.mouth = 'smile';
      }
      break;
    }
    case 'read': {
      if (view === 'down') {
        r.arms = [{ h: [11, 25], e: [9, 26], over: true }, { h: [19, 25], e: [22, 26], over: true }];
        r.held = { kind: 'book', x: 11, y: 22, frame: f };
      } else if (view === 'up') {
        r.arms = [{ h: [11, 23], e: [8, 26], back: true }, { h: [19, 23], e: [23, 26], back: true }];
        r.held = { kind: 'book', x: 11, y: 20, back: true, frame: f };
      } else {
        r.arms = [{ h: [9, 23], e: [13, 26], back: true }, { h: [9, 24], e: [14, 26] }];
        r.held = { kind: 'book', x: 5, y: 19, frame: f };
      }
      r.eyes = f === 3 ? 'closed' : 'down';
      break;
    }
    default:
      break;
  }
  return r;
}

// ---------------------------------------------------------------- entry

export function characterFrame(look: Appearance, dir: Dir, pose: Pose, frame: number, opts?: FrameOpts | boolean): HTMLCanvasElement {
  const o: FrameOpts = typeof opts === 'boolean' ? { smiling: opts } : opts ?? {};
  const n = POSE_FRAMES[pose] ?? 1;
  const f = ((Math.floor(frame) % n) + n) % n;
  const view: View = dir === 'right' ? 'left' : dir;
  const k = kit(look);
  const r = rig(view, pose, f, !!o.smiling);
  if (o.blink) {
    r.eyes = 'closed';
  }
  r.u += look.build === 'short' ? 1 : look.build === 'tall' ? -1 : 0;

  C = new Uint32Array(W * H);
  E = new Uint32Array(W * H);
  G = new Uint8Array(W * H);
  S = new Uint8Array(W * H);
  drawFigure(k, look, r);
  outlinePass();
  if (dir === 'right') {
    flipRaster();
  }
  const [canvas, ctx] = makeCanvas(W, H);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(C.buffer), W, H), 0, 0);
  return canvas;
}

function drawFigure(k: Kit, a: Appearance, r: Rig): void {
  const backArms = r.arms.map((arm, i) => [arm, i] as const).filter(([arm]) => arm.back);
  const frontArms = r.arms.map((arm, i) => [arm, i] as const).filter(([arm]) => !arm.back);
  if (r.held?.back) {
    heldItem(k, r);
  }
  hairBack(k, r);
  for (const [arm, i] of backArms) {
    drawArm(k, r, arm, i);
  }
  legs(k, r);
  torso(k, r);
  neckwear(k, a, r, false);
  head(k, r);
  face(k, a, r);
  hair(k, r);
  headwear(k, a, r);
  neckwear(k, a, r, true);
  if (r.held && !r.held.back && r.held.kind !== 'mug') {
    heldItem(k, r);
  }
  for (const [arm, i] of frontArms) {
    drawArm(k, r, arm, i);
  }
  if (r.held && !r.held.back && r.held.kind === 'mug') {
    heldItem(k, r);
  }
}

// ---------------------------------------------------------------- body

function legs(k: Kit, r: Rig): void {
  const hip = 30 + r.u;
  const p = k.pants;
  const dress = k.style === 'dress';
  if (r.view === 'left') {
    if (r.seated) {
      rect(13, hip, 7, 3, p, 2);
      rect(9, hip, 6, 3, p, 2);
      rect(9, hip, 10, 1, p, 3);
      rect(9, hip + 3, 4, 1, p, 1);
      rect(19, hip + 1, 1, 2, p, 1);
      rect(9, hip + 3, 4, 5, p, 2);
      rect(12, hip + 3, 1, 5, p, 1);
      shoeSide(k, 10, hip + 8);
      if (dress) {
        rect(10, hip - 1, 10, 3, k.top, 2);
        rect(10, hip - 1, 10, 1, k.top, 3);
        rect(10, hip + 2, 10, 1, k.top, 1);
      }
      return;
    }
    const [far, near] = r.legs;
    sideLeg(k, 15, hip, far, true);
    rect(13, hip, 6, 3, p, 2);
    rect(13, hip, 6, 1, p, 3);
    sideLeg(k, 14, hip, near, false);
    if (dress) {
      skirtSide(k, hip);
    }
    return;
  }
  if (r.seated) {
    if (r.view === 'up') {
      rect(11, hip, 10, 3, p, 1);
      rect(11, hip, 10, 1, p, 2);
      return;
    }
    rect(11, hip, 10, 3, p, 2);
    rect(11, hip, 10, 1, p, 3);
    rect(10, hip + 3, 5, 2, p, 2);
    rect(17, hip + 3, 5, 2, p, 2);
    rect(10, hip + 3, 2, 1, p, 3);
    rect(17, hip + 3, 2, 1, p, 3);
    rect(14, hip + 3, 1, 2, p, 1);
    rect(21, hip + 3, 1, 2, p, 1);
    rect(11, hip + 5, 4, 2, p, 1);
    rect(17, hip + 5, 4, 2, p, 1);
    shoeFront(k, 10, hip + 7, true);
    shoeFront(k, 17, hip + 7, true);
    if (dress) {
      rect(10, hip - 1, 12, 4, k.top, 2);
      rect(10, hip - 1, 12, 1, k.top, 3);
      rect(21, hip - 1, 1, 4, k.top, 1);
    }
    return;
  }
  rect(11, hip, 10, 3, p, 2);
  rect(11, hip, 10, 1, p, 3);
  rect(20, hip, 1, 3, p, 1);
  const [l, rr] = r.legs;
  frontLeg(k, r.view, 11, hip, l[1], true);
  frontLeg(k, r.view, 17, hip, rr[1], false);
  if (dress) {
    rect(10, hip - 1, 12, 4, k.top, 2);
    rect(9, hip + 3, 14, 2, k.top, 2);
    rect(10, hip - 1, 2, 6, k.top, 3);
    rect(21, hip - 1, 1, 4, k.top, 1);
    rect(22, hip + 3, 1, 2, k.top, 1);
    rect(9, hip + 4, 14, 1, k.top, 1);
    if (r.view === 'down') {
      rect(13, hip + 2, 1, 2, k.top, 1);
      rect(18, hip + 2, 1, 2, k.top, 1);
    }
  }
}

function frontLeg(k: Kit, view: View, x: number, hip: number, lift: number, left: boolean): void {
  const p = k.pants;
  const sole = 44 - lift;
  const top = hip + 3;
  const len = sole - 2 - top;
  rect(x, top, 4, len, p, 2);
  rect(left ? x : x + 3, top, 1, len, p, left ? 3 : 1);
  rect(left ? x + 3 : x, top, 1, len, p, 1);
  if (len > 4) {
    rect(x, sole - 4, 4, 1, p, 1);
  }
  shoeFront(k, left ? x - 1 : x, sole - 2, view === 'down');
}

function shoeFront(k: Kit, x: number, y: number, toes: boolean): void {
  const s = k.shoe;
  rect(x, y, 5, 3, s, 2);
  rect(x, y + 2, 5, 1, s, 1);
  if (toes) {
    rect(x + 1, y + 1, 3, 1, s, 3);
    px(x + 1, y + 1, s, 4);
  } else {
    rect(x, y, 5, 1, s, 1);
  }
}

function sideLeg(k: Kit, x: number, hip: number, leg: Leg, far: boolean): void {
  const p = k.pants;
  const [dx, lift] = leg;
  const sole = 44 - lift;
  const ankle: V2 = [x + dx, sole - 3];
  const knee: V2 = lift > 0 ? [Math.min(x, ankle[0]) - 1, Math.round((hip + 2 + ankle[1]) / 2)] : [Math.round((x + ankle[0]) / 2), Math.round((hip + 2 + ankle[1]) / 2)];
  for (const [a, b] of [[[x, hip + 2], knee], [knee, ankle]] as [V2, V2][]) {
    limb(a[0], a[1], b[0], b[1], 4, (i, j) => px(i, j, p, far ? 1 : 2));
    if (!far) {
      limb(a[0], a[1], b[0], b[1], 1, (i, j) => px(i, j, p, 3));
      limb(a[0] + 3, a[1], b[0] + 3, b[1], 1, (i, j) => px(i, j, p, 1));
    }
  }
  shoeSide(k, ankle[0], sole - 2, far);
}

function shoeSide(k: Kit, x: number, y: number, far = false): void {
  const s = k.shoe;
  rect(x, y, 4, 2, s, far ? 1 : 2);
  rect(x - 2, y + 1, 2, 1, s, far ? 1 : 2);
  rect(x - 2, y + 2, 6, 1, s, far ? 0 : 1);
  if (!far) {
    rect(x - 1, y + 1, 2, 1, s, 3);
  }
}

function skirtSide(k: Kit, hip: number): void {
  const t = k.top;
  rect(12, hip - 1, 8, 3, t, 2);
  rect(11, hip + 2, 10, 3, t, 2);
  rect(12, hip - 1, 1, 3, t, 3);
  rect(11, hip + 2, 1, 3, t, 3);
  rect(11, hip + 4, 10, 1, t, 1);
  rect(19, hip - 1, 1, 3, t, 1);
}

/** Visit a thick line's stamps from (x0,y0) to (x1,y1), w x w each, calling plot for each pixel. */
function limb(x0: number, y0: number, x1: number, y1: number, w: number, plot: (x: number, y: number, i: number) => void): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let s = 0; s <= n; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / n);
    const y = Math.round(y0 + ((y1 - y0) * s) / n);
    for (let j = 0; j < w; j++) {
      for (let i = 0; i < w; i++) {
        plot(x + i, y + j, i);
      }
    }
  }
}

function sleeveMat(k: Kit): M {
  return k.style === 'vest' ? k.under : k.top;
}

function shortSleeve(k: Kit): boolean {
  return k.style === 'tee' || k.style === 'dress';
}

function torso(k: Kit, r: Rig): void {
  const t = k.top;
  const u = r.u;
  const y0 = 18 + u;
  const st = k.style;
  if (r.view === 'left') {
    rect(12, y0 + 1, 8, 11, t, 2);
    rect(13, y0, 6, 1, t, 3);
    rect(12, y0 + 1, 1, 11, t, 3);
    rect(19, y0 + 1, 1, 11, t, 1);
    rect(12, y0 + 11, 8, 1, t, 1);
    sideDetails(k, y0);
    return;
  }
  rect(11, y0 + 1, 10, 11, t, 2);
  rect(12, y0, 8, 1, t, 3);
  rect(11, y0 + 1, 1, 11, t, 1);
  rect(12, y0 + 1, 1, 10, t, 3);
  rect(20, y0 + 1, 1, 11, t, 1);
  rect(11, y0 + 11, 10, 1, t, 1);
  if (r.view === 'up') {
    backDetails(k, y0);
    return;
  }
  const un = k.under;
  switch (st) {
    case 'tee':
      rect(14, y0, 4, 1, k.skin, 1);
      px(13, y0, t, 1);
      px(18, y0, t, 1);
      break;
    case 'dress':
      rect(14, y0, 4, 1, k.skin, 1);
      rect(15, y0 + 1, 2, 1, k.skin, 1);
      rect(11, y0 + 10, 10, 1, t, 1);
      break;
    case 'hoodie':
      rect(12, y0, 8, 2, t, 3);
      rect(14, y0, 4, 1, k.skin, 1);
      rect(13, y0 + 1, 6, 1, t, 1);
      px(14, y0 + 2, un, 3);
      px(14, y0 + 3, un, 3);
      px(17, y0 + 2, un, 3);
      px(17, y0 + 3, un, 2);
      rect(13, y0 + 7, 6, 1, t, 1);
      rect(13, y0 + 8, 1, 2, t, 1);
      rect(18, y0 + 8, 1, 2, t, 1);
      rect(11, y0 + 10, 10, 1, t, 1);
      break;
    case 'shirt':
      px(13, y0, t, 4);
      px(14, y0 + 1, t, 4);
      px(18, y0, t, 4);
      px(17, y0 + 1, t, 4);
      px(15, y0, k.skin, 1);
      px(16, y0, k.skin, 1);
      rect(15, y0 + 1, 1, 10, t, 1);
      px(16, y0 + 3, t, 4);
      px(16, y0 + 6, t, 4);
      px(16, y0 + 9, t, 4);
      break;
    case 'sweater':
      rect(13, y0, 6, 1, t, 1);
      rect(14, y0, 4, 1, k.skin, 1);
      rect(11, y0 + 10, 10, 2, t, 1);
      rect(11, y0 + 10, 1, 2, t, 2);
      break;
    case 'turtleneck':
      rect(13, y0 - 1, 6, 2, t, 3);
      rect(13, y0 + 1, 6, 1, t, 1);
      px(18, y0 - 1, t, 2);
      px(18, y0, t, 2);
      rect(11, y0 + 11, 10, 1, t, 1);
      break;
    case 'jacket':
      rect(14, y0, 4, 11, un, 3);
      rect(14, y0, 4, 1, k.skin, 1);
      rect(17, y0 + 1, 1, 10, un, 2);
      rect(13, y0 + 1, 1, 10, t, 1);
      rect(18, y0 + 1, 1, 10, t, 1);
      px(12, y0, t, 4);
      px(19, y0, t, 4);
      px(13, y0 + 7, t, 3);
      break;
    case 'blazer':
      rect(14, y0, 4, 3, un, 3);
      rect(15, y0 + 3, 2, 2, un, 3);
      rect(15, y0 + 1, 2, 1, k.accent, 3);
      rect(15, y0 + 2, 2, 4, k.accent, 2);
      px(16, y0 + 2, k.accent, 1);
      px(16, y0 + 5, k.accent, 1);
      px(13, y0, t, 1);
      px(18, y0, t, 1);
      rect(14, y0 + 3, 1, 2, t, 1);
      rect(17, y0 + 3, 1, 2, t, 1);
      px(15, y0 + 8, t, 0);
      rect(12, y0 + 8, 2, 1, t, 1);
      break;
    case 'cardigan':
      rect(14, y0, 4, 4, un, 3);
      rect(15, y0 + 4, 2, 7, un, 3);
      rect(14, y0, 4, 1, k.skin, 1);
      rect(14, y0 + 4, 1, 7, t, 1);
      rect(17, y0 + 4, 1, 7, t, 1);
      px(17, y0 + 5, t, 4);
      px(17, y0 + 8, t, 4);
      rect(11, y0 + 11, 10, 1, t, 1);
      break;
    case 'vest':
      rect(14, y0, 4, 3, un, 3);
      rect(15, y0 + 3, 2, 1, un, 3);
      px(13, y0, un, 4);
      px(18, y0, un, 4);
      px(15, y0, k.skin, 1);
      px(16, y0, k.skin, 1);
      rect(11, y0 + 10, 10, 2, t, 1);
      px(14, y0 + 3, t, 1);
      px(17, y0 + 3, t, 1);
      break;
  }
}

function backDetails(k: Kit, y0: number): void {
  const t = k.top;
  switch (k.style) {
    case 'hoodie':
      rect(12, y0, 8, 4, t, 3);
      rect(13, y0 + 4, 6, 1, t, 1);
      rect(12, y0 + 1, 1, 3, t, 2);
      rect(19, y0 + 1, 1, 3, t, 1);
      px(12, y0 + 4, t, 1);
      px(19, y0 + 4, t, 1);
      break;
    case 'shirt':
    case 'vest':
      rect(13, y0, 6, 1, k.style === 'vest' ? k.under : t, 4);
      break;
    case 'blazer':
    case 'jacket':
      rect(13, y0, 6, 1, t, 3);
      rect(15, y0 + 7, 1, 4, t, 1);
      break;
    case 'turtleneck':
      rect(13, y0 - 1, 6, 2, t, 3);
      break;
    case 'sweater':
    case 'cardigan':
      rect(11, y0 + 10, 10, 2, t, 1);
      break;
    default:
      break;
  }
}

function sideDetails(k: Kit, y0: number): void {
  const t = k.top;
  const un = k.under;
  switch (k.style) {
    case 'hoodie':
      rect(16, y0, 4, 4, t, 3);
      rect(19, y0 + 1, 1, 4, t, 1);
      rect(16, y0 + 4, 3, 1, t, 1);
      px(13, y0 + 2, un, 3);
      px(13, y0 + 3, un, 3);
      break;
    case 'shirt':
      px(13, y0, t, 4);
      px(14, y0, t, 4);
      rect(13, y0 + 1, 1, 10, t, 1);
      break;
    case 'jacket':
    case 'blazer':
    case 'cardigan':
      rect(12, y0, 2, 11, un, 3);
      if (k.style === 'blazer') {
        rect(12, y0 + 1, 1, 4, k.accent, 2);
      }
      rect(14, y0, 1, 11, t, 1);
      break;
    case 'vest':
      rect(12, y0, 2, 2, un, 3);
      break;
    case 'turtleneck':
      rect(13, y0 - 1, 4, 2, t, 3);
      break;
    case 'sweater':
      rect(12, y0 + 10, 8, 2, t, 1);
      break;
    default:
      break;
  }
}

function shoulder(view: View, i: number): V2 {
  if (view === 'left') {
    return [15, 19];
  }
  return i === 0 ? [9, 19] : [21, 19];
}

function drawArm(k: Kit, r: Rig, arm: Arm, i: number): void {
  const u = r.u;
  const [sx, sy] = shoulder(r.view, i);
  const hx = arm.h[0];
  const hy = arm.h[1] + u;
  const ex = arm.e ? arm.e[0] : Math.round((sx + hx) / 2);
  const ey = arm.e ? arm.e[1] + u : Math.round((sy + u + hy) / 2);
  const sl = sleeveMat(k);
  const shadowSide = r.view === 'left' ? arm.back : i === 1;
  const tone = shadowSide ? 1 : 2;
  const short = shortSleeve(k);
  if (arm.over) {
    limb(ex, ey, hx, hy, 2, (x, y) => {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const t = tagAt(x + dx, y + dy);
        if (t === T_TOP || t === T_UNDER || t === T_ACC) {
          px(x + dx, y + dy, sl === k.top && t === T_TOP ? k.top : sl, 0);
        }
      }
    });
  }
  limb(sx, sy + u, ex, ey, 2, (x, y, c) => {
    if (short && y > sy + u + 3) {
      px(x, y, k.skin, c === 0 ? 2 : shadowSide ? 1 : 2);
    } else {
      px(x, y, sl, c === 0 ? tone + 1 : tone);
    }
  });
  limb(ex, ey, hx, hy, 2, (x, y, c) => {
    if (short) {
      px(x, y, k.skin, c === 0 ? 2 : shadowSide ? 1 : 2);
    } else {
      px(x, y, sl, c === 0 ? tone + 1 : tone);
    }
  });
  if (!short) {
    const cuffY = hy - (hy > ey ? 1 : -2);
    if (Math.abs(hy - ey) > 2) {
      rect(hx, cuffY, 2, 1, sl, tone === 2 ? 1 : 0);
    }
  }
  rect(hx, hy, 2, 2, k.skin, shadowSide ? 1 : 2);
  if (!shadowSide) {
    px(hx, hy, k.skin, 3);
  }
}

// ---------------------------------------------------------------- head and face

/** Head masks, origin abs (9, 4). 's' skin base, 'd' shadow, 'l' light. */
const HEAD_FRONT = [
  '..ssssssssss..',
  '.slllsssssssd.',
  'sllssssssssssd',
  'slssssssssssdd',
  'ssssssssssssdd',
  'ssssssssssssdd',
  'ssssssssssssdd',
  'ssssssssssssdd',
  'ssssssssssssdd',
  'ssssssssssssdd',
  'ssssssssssssdd',
  'ssssssssssssdd',
  '.sssssssssssd.',
  '..ddssssssdd..',
];
const HEAD_SIDE = [
  '..ssssssssss..',
  '.slllsssssssd.',
  'sllssssssssssd',
  'slssssssssssdd',
  'ssssssssssssdd',
  'ssssssssssssdd',
  'ssssssssssssdd',
  'ssssssssssssdd',
  'ssssssssssssdd',
  'ssssssssssssdd',
  'ssssssssssssdd',
  'ssssssssssssdd',
  '.sssssssssssd.',
  '..ssssssssdd..',
];

function head(k: Kit, r: Rig): void {
  const y0 = 4 + r.u;
  const rows = r.view === 'left' ? HEAD_SIDE : HEAD_FRONT;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch !== '.') {
        px(9 + i, y0 + j, k.skin, ch === 'd' ? 1 : ch === 'l' ? 3 : 2);
      }
    }
  });
  if (r.view === 'left') {
    px(8, y0 + 9, k.skin, 2);
    px(8, y0 + 10, k.skin, 1);
    rect(17, y0 + 7, 2, 3, k.skin, 1);
    px(17, y0 + 8, k.skin, 0);
  } else if (r.view === 'up') {
    rect(8, y0 + 6, 1, 3, k.skin, 2);
    rect(23, y0 + 6, 1, 3, k.skin, 1);
    rect(11, y0 + 13, 10, 1, k.skin, 1);
  }
}

function face(k: Kit, a: Appearance, r: Rig): void {
  if (r.view === 'up') {
    return;
  }
  const y0 = 4 + r.u;
  const ey = y0 + 7;
  const eye = (x: number) => {
    if (r.eyes === 'closed') {
      rect(x, ey + 2, 2, 1, k.eye, 1);
    } else if (r.eyes === 'down') {
      rect(x, ey + 1, 2, 2, k.eye, 1);
      rect(x, ey + 1, 2, 1, k.skin, 1);
      rect(x, ey + 1, 2, 1, k.eye, 0);
    } else {
      rect(x, ey, 2, 3, k.eye, 1);
      px(x, ey, k.eye, 3);
    }
  };
  const blush = (x: number, y: number) => {
    const i = y * W + x;
    C[i] = k.blush;
    E[i] = k.skin.c[0];
    G[i] = T_SKIN;
  };
  const my = y0 + 11;
  if (r.view === 'left') {
    eye(10);
    blush(11, ey + 3);
    blush(12, ey + 3);
    mouthSide(k, r, my);
  } else {
    eye(12);
    eye(18);
    blush(11, ey + 3);
    blush(12, ey + 3);
    blush(19, ey + 3);
    blush(20, ey + 3);
    if (r.mouth === 'smile') {
      rect(15, my, 2, 1, k.mouth, 0);
      px(14, my - 1, k.mouth, 0);
      px(17, my - 1, k.mouth, 0);
    } else if (r.mouth === 'open') {
      rect(15, my, 2, 1, k.mouth, 0);
      rect(15, my + 1, 2, 1, k.mouth, 3);
    } else {
      rect(15, my, 2, 1, k.skin, 0);
    }
  }
  facialHair(k, a, r, y0);
}

function mouthSide(k: Kit, r: Rig, my: number): void {
  if (r.mouth === 'open') {
    px(9, my, k.mouth, 0);
    px(9, my + 1, k.mouth, 3);
  } else if (r.mouth === 'smile') {
    px(9, my, k.mouth, 0);
    px(10, my - 1, k.mouth, 0);
  } else {
    px(9, my, k.skin, 0);
  }
}

function facialHair(k: Kit, a: Appearance, r: Rig, y0: number): void {
  const h = k.hair;
  if (a.facial === 'none') {
    return;
  }
  if (r.view === 'left') {
    if (a.facial === 'beard') {
      rect(9, y0 + 10, 7, 3, h, 2);
      rect(10, y0 + 13, 5, 1, h, 1);
      rect(14, y0 + 7, 2, 4, h, 2);
      px(9, y0 + 11, k.mouth, 0);
      px(15, y0 + 9, h, 1);
    } else if (a.facial === 'mustache') {
      rect(8, y0 + 10, 3, 1, h, 2);
    } else {
      rect(10, y0 + 12, 5, 2, k.skin, 1);
    }
    return;
  }
  if (a.facial === 'beard') {
    rect(9, y0 + 9, 2, 3, h, 2);
    rect(21, y0 + 9, 2, 3, h, 1);
    rect(10, y0 + 11, 12, 2, h, 2);
    rect(11, y0 + 13, 10, 1, h, 1);
    rect(13, y0 + 10, 6, 1, h, 2);
    rect(15, y0 + 11, 2, 1, r.mouth === 'rest' ? h : k.mouth, r.mouth === 'rest' ? 1 : 0);
    px(12, y0 + 12, h, 3);
  } else if (a.facial === 'mustache') {
    rect(13, y0 + 10, 6, 1, h, 2);
    px(13, y0 + 11, h, 1);
    px(18, y0 + 11, h, 1);
    px(14, y0 + 10, h, 3);
  } else {
    rect(11, y0 + 12, 10, 1, k.skin, 1);
    rect(12, y0 + 13, 8, 1, k.skin, 1);
    px(10, y0 + 11, k.skin, 1);
    px(21, y0 + 11, k.skin, 1);
  }
}

// ---------------------------------------------------------------- hair

/**
 * Hair masks: 18 columns starting at abs x 7, rows starting at abs y `y` (+ body offset).
 * '#' hair, '1' hair strand (forced shadow), '.' nothing. Shading is applied by `shadeHair`.
 */
interface Mask {
  y: number;
  rows: string[];
  x?: number;
}

const mk = (y: number, ...rows: string[]): Mask => ({ y, rows });
const mkx = (x: number, y: number, ...rows: string[]): Mask => ({ x, y, rows });

const CAP = mk(3,
  '.....########.....',
  '...############...',
  '..##############..',
  '.################.',
  '.################.',
  '.################.',
);
const CAP_BACK = mk(3,
  '.....########.....',
  '...############...',
  '..##############..',
  '.################.',
  '.################.',
  '.################.',
  '..##############..',
  '..##############..',
  '..##############..',
  '..##############..',
  '..##############..',
  '...############...',
  '.....########.....',
);
const CAP_SIDE = mk(3,
  '.....########.....',
  '...############...',
  '..##############..',
  '.################.',
  '.################.',
  '.################.',
  '.###.....########.',
  '.##......########.',
  '............#####.',
  '............#####.',
  '............#####.',
  '............####..',
);

interface HairSet {
  down: Mask[];
  up: Mask[];
  left: Mask[];
  /** Behind the body (long hair seen from the front hangs behind the shoulders). */
  behind?: Partial<Record<View, Mask[]>>;
  thin?: boolean;
}

const HAIR: Record<HairStyle, HairSet> = {
  short: {
    down: [CAP, mk(9,
      '.###1#####1####1#.',
      '.##.##...##....##.',
      '.##............##.',
      '.#..............#.',
    )],
    up: [CAP_BACK, mk(9, '..####1####1####..')],
    left: [CAP_SIDE, mk(9, '.###1....#1######.')],
  },
  sidepart: {
    down: [CAP, mk(5, '..........1.......', '..........1.......', '...........1......', '...........1......'), mk(9,
      '.##########....##.',
      '.#######.......##.',
      '.##.............#.',
      '.#...............',
    )],
    up: [CAP_BACK, mk(4, '.....1............', '.....1............')],
    left: [CAP_SIDE, mk(9, '.####....#1######.', '.###.....########.', '.#................')],
  },
  spiky: {
    down: [mk(1, '.....#....#.......', '....##.#.###..#...', '...############...'), CAP, mk(9,
      '.##.###.##.###.##.',
      '.#...#....#....#..',
      '.##............##.',
    )],
    up: [mk(1, '.....#....#.......', '....##.#.###..#...', '...############...'), CAP_BACK],
    left: [mk(1, '..........#..#....', '.......#.####.##..', '...#############..'), CAP_SIDE, mk(9, '.#.#.....########.')],
  },
  buzz: {
    thin: true,
    down: [mk(4,
      '....##########....',
      '...############...',
      '..##############..',
      '..##############..',
      '..##############..',
      '..##..........##..',
    )],
    up: [mk(4,
      '....##########....',
      '...############...',
      '..##############..',
      '..##############..',
      '..##############..',
      '..##############..',
      '..##############..',
      '..##############..',
      '..##############..',
      '...############...',
    )],
    left: [mk(4,
      '....##########....',
      '...############...',
      '..##############..',
      '..##############..',
      '..##.....#######..',
      '.........#######..',
      '...........#####..',
      '...........#####..',
      '...........#####..',
      '...........####...',
    )],
  },
  bald: {
    down: [mk(9, '..#............#..', '..##..........##..', '..##..........##..', '...#..........#...')],
    up: [mk(9, '..#............#..', '..##..........##..', '..###........###..', '..##############..', '...############...', '....##########....')],
    left: [mk(9, '..............#...', '............####..', '............####..', '............###...')],
    thin: true,
  },
  curly: {
    down: [mk(1,
      '.....##..##.##....',
      '...#############..',
      '..###1###########.',
      '.##############1##',
      '##################',
      '##1######1########',
      '##################',
      '####1##1##1##1####',
      '###.#..#..#..#.###',
      '##..............##',
      '###............###',
      '.#..............#.',
    )],
    up: [mk(1,
      '.....##..##.##....',
      '...#############..',
      '..###1###########.',
      '.##############1##',
      '##################',
      '##1######1########',
      '##################',
      '#####1######1#####',
      '##################',
      '.########1########',
      '.################.',
      '..#####1########..',
      '..##############..',
      '...##.#####.###...',
    )],
    left: [mk(1,
      '......##.##.##....',
      '...#############..',
      '..###1###########.',
      '.##############1##',
      '##################',
      '###1##1###########',
      '####.##.##########',
      '.#........######1#',
      '..........########',
      '...........#######',
      '............#####.',
      '............######',
      '.............###..',
    )],
  },
  afro: {
    down: [mkx(5, 0,
      '.......########.......',
      '....##############....',
      '...######1#########...',
      '..##################..',
      '.###1##############1#.',
      '.####################.',
      '######1########1######',
      '######################',
      '######..........######',
      '#####............#####',
      '#####............#####',
      '.####............####.',
      '..###............###..',
      '...#..............#...',
    )],
    up: [mkx(5, 0,
      '.......########.......',
      '....##############....',
      '...######1#########...',
      '..##################..',
      '.###1##############1#.',
      '.####################.',
      '######1########1######',
      '######################',
      '######################',
      '#########1######1#####',
      '######################',
      '.####################.',
      '..######1###########..',
      '....##############....',
    )],
    left: [mkx(5, 0,
      '.......########.......',
      '....##############....',
      '...######1#########...',
      '..##################..',
      '.###1##############1#.',
      '.####################.',
      '..####1########1######',
      '..####################',
      '...#......############',
      '..........############',
      '..........######1#####',
      '...........###########',
      '...........##########.',
      '............#######...',
    )],
  },
  bob: {
    down: [CAP, mk(9,
      '.################.',
      '.###..........###.',
      '.###..........###.',
      '.###..........###.',
      '.###..........###.',
      '.###..........###.',
      '.###..........###.',
      '####..........####',
      '.##............##.',
    )],
    up: [CAP_BACK, mk(9,
      '.################.',
      '.################.',
      '.################.',
      '.################.',
      '.################.',
      '.######1##1######.',
      '.################.',
      '##################',
      '.################.',
    )],
    left: [CAP, mk(9,
      '.#####..#########.',
      '.##.....#########.',
      '........#########.',
      '........#########.',
      '........#########.',
      '........#########.',
      '........#########.',
      '.......##########.',
      '..........######..',
    )],
  },
  long: {
    down: [CAP, mk(3, '........1.........', '........1.........', '.......1..........'), mk(9,
      '.#####......#####.',
      '.###..........###.',
      '.###..........###.',
      '.###..........###.',
      '.###..........###.',
      '.###..........###.',
      '.###..........###.',
      '####..........####',
      '###............###',
      '###............###',
      '###............###',
      '###............###',
      '.##............##.',
      '.#..............#.',
    )],
    behind: { down: [mk(17, '...############...', '..##############..', '..##############..', '..##############..', '..##############..', '...############...')] },
    up: [CAP_BACK, mk(9,
      '.################.',
      '.################.',
      '.################.',
      '.################.',
      '.################.',
      '.################.',
      '.################.',
      '##################',
      '##################',
      '##################',
      '##################',
      '#######1##1#######',
      '.################.',
      '.##.###.##.###.##.',
    )],
    left: [CAP, mk(9,
      '.#####..#########.',
      '.##.....#########.',
      '........##########',
      '........##########',
      '........##########',
      '........##########',
      '........##########',
      '........#########.',
      '..........#######.',
      '...........######.',
      '...........######.',
      '...........######.',
      '...........######.',
    )],
  },
  wavy: {
    down: [CAP, mk(5, '...........1......', '..........1.......', '...........1......'), mk(9,
      '.##########...###.',
      '.#####........###.',
      '.###...........###',
      '####...........###',
      '.###..........###.',
      '.###..........###.',
      '####...........###',
      '###............###',
      '.###..........###.',
      '.##............##.',
      '##..............##',
    )],
    behind: { down: [mk(17, '...############...', '..##############..', '..##############..', '...############...')] },
    up: [CAP_BACK, mk(9,
      '.################.',
      '.################.',
      '##################',
      '.################.',
      '.################.',
      '##################',
      '##################',
      '.#######1########.',
      '.################.',
      '##################',
      '.##.####.####.##..',
    )],
    left: [CAP, mk(9,
      '.######.#########.',
      '.####...#########.',
      '.##.....##..######',
      '........#########.',
      '........##########',
      '.......###########',
      '........#########.',
      '........##########',
      '..........#######.',
      '..........#######.',
      '...........######.',
    )],
  },
  ponytail: {
    down: [CAP, mk(9,
      '.#########1#####..',
      '.##.###.......####',
      '.#.............###',
      '...............###',
      '................##',
      '................##',
      '.................#',
    )],
    up: [CAP_BACK, mk(14, '......######......', '.......####.......', '.......####.......', '.......####.......', '.......###........', '........##........', '........#.........')],
    left: [CAP_SIDE, mk(7, '................##', '................##', '................##', '...............###', '...............###', '...............###', '...............###', '...............##.', '...............##.', '................#.')],
  },
  bun: {
    down: [mk(0, '......######......', '.....########.....', '.....###1####.....'), CAP, mk(9, '.###1####1#####1#.', '.##............##.')],
    up: [mk(0, '......######......', '.....########.....', '.....###1####.....'), CAP_BACK],
    left: [mk(0, '..........#####...', '.........#######..', '.........###1###..'), CAP_SIDE],
  },
  pigtails: {
    down: [CAP, mk(3, '........1.........', '........1.........'), mk(9,
      '.#####1....1#####.',
      '.###..........###.',
      '.##............##.',
    ), mkx(4, 11,
      '..#.................#..',
      '.##.................##.',
      '###.................###',
      '###.................###',
      '###.................###',
      '###.................###',
      '.##.................##.',
      '.#...................#.',
    )],
    up: [CAP_BACK, mk(3, '........1.........', '........1.........', '........1.........', '........1.........', '........1.........', '........1.........', '........1.........', '........1.........'), mkx(4, 11,
      '..#.................#..',
      '.##.................##.',
      '###.................###',
      '###.................###',
      '###.................###',
      '###.................###',
      '.##.................##.',
      '.#...................#.',
    )],
    left: [CAP_SIDE, mkx(21, 10, '..#.', '.###', '####', '####', '####', '####', '.###', '..#.')],
  },
  locs: {
    down: [CAP, mk(3, '........1.........', '........1.........'), mk(9,
      '.##1##1....1##1##.',
      '.#1#..........#1#.',
      '##1#..........#1##',
      '#1##..........##1#',
      '##1#..........#1##',
      '#1##..........##1#',
      '##1#..........#1##',
      '#1##..........##1#',
      '##1............1##',
      '.#.#..........#.#.',
    )],
    up: [CAP_BACK, mk(9,
      '.#1##1##1##1##1##.',
      '.#1##1##1##1##1##.',
      '##1##1##1##1##1###',
      '##1##1##1##1##1###',
      '##1##1##1##1##1###',
      '##1##1##1##1##1###',
      '##1##1##1##1##1###',
      '##1##1##1##1##1###',
      '##1##1##1##1##1###',
      '.#.#.#.#.#.#.#.#..',
    )],
    left: [CAP, mk(9,
      '.##1#1..#1##1##1#.',
      '.#1.....#1##1##1#.',
      '........#1..#1##1#',
      '........#...#1##1#',
      '............##1##1',
      '............#1##1#',
      '............##1##1',
      '............#1##1#',
      '............##1#1#',
      '............#.#.#.',
    )],
  },
};

function stampHair(masks: Mask[], k: Kit, dy: number): void {
  for (const m of masks) {
    m.rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        const x = (m.x ?? 7) + i;
        const y = m.y + j + dy;
        if (ch === '#') {
          px(x, y, k.hair, 2);
        } else if (ch === '1' && y >= 0 && x >= 0 && x < W) {
          px(x, y, k.hair, 1);
          S[y * W + x] = 9;
        }
      }
    });
  }
}

/** Top-left lighting over the hair mask: lit crown band, shadowed right and lower edges, cast shadow on the forehead. */
function shadeHair(k: Kit, r: Rig, thin: boolean, y0: number, y1: number): void {
  const h = k.hair;
  const base = thin ? 1 : 2;
  const isHair = (x: number, y: number) => tagAt(x, y) === T_HAIR;
  const cx = r.view === 'left' ? 14 : 16;
  const lit: [number, number][] = [];
  const dark: [number, number][] = [];
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
    for (let x = 0; x < W; x++) {
      if (!isHair(x, y)) {
        continue;
      }
      const i = y * W + x;
      if (S[i] === 9) {
        dark.push([x, y]);
        continue;
      }
      const top = !isHair(x, y - 1);
      const top2 = !top && !isHair(x, y - 2);
      if ((top || top2) && x < cx + 1) {
        lit.push([x, y]);
      } else if (!isHair(x + 1, y) || !isHair(x, y + 1)) {
        dark.push([x, y]);
      } else {
        px(x, y, h, base);
      }
    }
  }
  for (const [x, y] of lit) {
    px(x, y, h, thin ? 2 : 3);
  }
  for (const [x, y] of dark) {
    px(x, y, h, base - 1);
  }
  if (!thin) {
    for (const [x, y] of lit) {
      if (!isHair(x, y - 1) && (x === cx - 5 || x === cx - 4)) {
        px(x, y + 1, h, 4);
      }
    }
  }
}

function hairBack(k: Kit, r: Rig): void {
  const set = HAIR[k.hairStyle];
  const masks = set.behind?.[r.view];
  if (masks) {
    stampHair(masks, k, r.u);
    shadeHair(k, r, false, 17 + r.u, 30 + r.u);
  }
}

function hair(k: Kit, r: Rig): void {
  const set = HAIR[k.hairStyle];
  stampHair(set[r.view], k, r.u);
  shadeHair(k, r, !!set.thin, r.u - 1, 24 + r.u);
  if (k.hairStyle === 'bald') {
    px(12, 5 + r.u, k.skin, 3);
    px(13, 5 + r.u, k.skin, 3);
  }
  if (r.view !== 'up') {
    castShadow(k, r);
  }
  hairTies(k, r);
}

function castShadow(k: Kit, r: Rig): void {
  for (let y = 6 + r.u; y < 16 + r.u; y++) {
    for (let x = 8; x < 24; x++) {
      if (tagAt(x, y) === T_SKIN && tagAt(x, y - 1) === T_HAIR && S[y * W + x] >= 2) {
        px(x, y, k.skin, 1);
      }
    }
  }
}

function hairTies(k: Kit, r: Rig): void {
  const a = k.accent;
  const u = r.u;
  if (k.hairStyle === 'ponytail') {
    if (r.view === 'up') {
      rect(14, 13 + u, 4, 1, a, 2);
    } else if (r.view === 'left') {
      rect(23, 7 + u, 2, 1, a, 2);
    }
  } else if (k.hairStyle === 'pigtails') {
    if (r.view === 'left') {
      rect(22, 11 + u, 3, 1, a, 2);
    } else {
      rect(5, 12 + u, 3, 1, a, 2);
      rect(24, 12 + u, 3, 1, a, 2);
    }
  }
}

// ---------------------------------------------------------------- accessories

function headwear(k: Kit, a: Appearance, r: Rig): void {
  const u = r.u;
  const ac = k.accent;
  const ink = k.metal;
  switch (a.accessory) {
    case 'glasses':
    case 'roundGlasses': {
      if (r.view === 'up') {
        rect(8, 10 + u, 1, 1, ink, 0);
        rect(23, 10 + u, 1, 1, ink, 0);
        return;
      }
      const round = a.accessory === 'roundGlasses';
      if (r.view === 'left') {
        rect(round ? 10 : 9, 10 + u, round ? 3 : 4, 1, ink, 0);
        rect(round ? 10 : 9, 14 + u, round ? 3 : 4, 1, ink, 0);
        rect(13, 11 + u, 1, 3, ink, 0);
        rect(14, 11 + u, 3, 1, ink, 0);
        px(12, 11 + u, k.item, 4);
        return;
      }
      for (const x of [11, 17]) {
        rect(x, 10 + u, 4, 1, ink, 0);
        rect(x, 14 + u, 4, 1, ink, 0);
        rect(x - 1, round ? 11 + u : 10 + u, 1, round ? 3 : 5, ink, 0);
        rect(x + 4, round ? 11 + u : 10 + u, 1, round ? 3 : 5, ink, 0);
        px(x + 3, 11 + u, k.item, 4);
      }
      return;
    }
    case 'headphones': {
      if (r.view === 'left') {
        rect(15, 2 + u, 4, 1, ink, 1);
        rect(19, 3 + u, 1, 7, ink, 1);
        rect(16, 9 + u, 4, 5, ac, 2);
        rect(16, 9 + u, 4, 1, ac, 3);
        rect(19, 10 + u, 1, 4, ac, 1);
        return;
      }
      rect(10, 2 + u, 12, 1, ink, 2);
      px(9, 3 + u, ink, 2);
      px(22, 3 + u, ink, 1);
      rect(8, 4 + u, 1, 6, ink, 2);
      rect(23, 4 + u, 1, 6, ink, 1);
      rect(6, 10 + u, 3, 5, ac, 2);
      rect(23, 10 + u, 3, 5, ac, 1);
      rect(6, 10 + u, 3, 1, ac, 3);
      return;
    }
    case 'cap': {
      const top = (x0: number) => {
        rect(x0 + 2, 2 + u, 10, 1, ac, 3);
        rect(x0 + 1, 3 + u, 12, 2, ac, 2);
        rect(x0, 5 + u, 14, 3, ac, 2);
        rect(x0 + 2, 3 + u, 4, 1, ac, 3);
        rect(x0 + 13, 4 + u, 1, 4, ac, 1);
        px(x0 + 7, 2 + u, ac, 4);
      };
      if (r.view === 'left') {
        top(9);
        rect(5, 8 + u, 9, 1, ac, 1);
        rect(5, 7 + u, 4, 1, ac, 2);
        rect(9, 7 + u, 1, 1, ac, 1);
      } else if (r.view === 'down') {
        top(9);
        rect(9, 8 + u, 14, 1, ac, 1);
        rect(10, 9 + u, 12, 1, ac, 3);
        rect(11, 9 + u, 2, 1, ac, 4);
        rect(10, 10 + u, 12, 1, ac, 0);
      } else {
        top(9);
        rect(9, 8 + u, 14, 1, ac, 1);
        rect(14, 9 + u, 4, 1, ac, 1);
      }
      return;
    }
    case 'beanie': {
      rect(11, 2 + u, 10, 1, ac, 3);
      rect(10, 3 + u, 12, 2, ac, 2);
      rect(9, 5 + u, 14, 2, ac, 2);
      rect(9, 7 + u, 14, 2, ac, 3);
      rect(9, 8 + u, 14, 1, ac, 1);
      rect(11, 3 + u, 3, 1, ac, 3);
      for (let x = 11; x < 22; x += 3) {
        px(x, 7 + u, ac, 2);
      }
      rect(21, 3 + u, 1, 4, ac, 1);
      rect(15, 0 + u, 2, 2, k.item, 3);
      return;
    }
    case 'bow': {
      const bx = r.view === 'up' ? 10 : r.view === 'left' ? 16 : 18;
      rect(bx, 3 + u, 2, 3, ac, 2);
      rect(bx + 3, 3 + u, 2, 3, ac, 1);
      px(bx + 2, 4 + u, ac, 0);
      px(bx, 3 + u, ac, 3);
      return;
    }
    default:
      return;
  }
}

function neckwear(k: Kit, a: Appearance, r: Rig, front: boolean): void {
  const u = r.u;
  const ac = k.accent;
  if (a.accessory === 'scarf' && front) {
    if (r.view === 'left') {
      rect(11, 17 + u, 8, 3, ac, 2);
      rect(11, 17 + u, 8, 1, ac, 3);
      rect(11, 20 + u, 3, 5, ac, 2);
      rect(13, 20 + u, 1, 5, ac, 1);
      return;
    }
    rect(11, 17 + u, 10, 3, ac, 2);
    rect(11, 17 + u, 10, 1, ac, 3);
    rect(20, 18 + u, 1, 2, ac, 1);
    if (r.view === 'down') {
      rect(12, 20 + u, 3, 6, ac, 2);
      rect(14, 20 + u, 1, 6, ac, 1);
      rect(12, 25 + u, 3, 1, ac, 1);
      px(12, 20 + u, ac, 3);
    } else {
      rect(17, 20 + u, 3, 3, ac, 1);
    }
  }
  if (a.accessory === 'badge' && front && r.view !== 'up') {
    if (r.view === 'left') {
      px(13, 19 + u, ac, 2);
      px(13, 20 + u, ac, 2);
      px(12, 21 + u, ac, 2);
      rect(11, 22 + u, 2, 3, k.item, 3);
      px(11, 22 + u, ac, 2);
      return;
    }
    px(14, 19 + u, ac, 2);
    px(17, 19 + u, ac, 2);
    px(14, 20 + u, ac, 2);
    px(17, 20 + u, ac, 2);
    px(15, 21 + u, ac, 2);
    px(16, 21 + u, ac, 2);
    rect(14, 22 + u, 4, 4, k.item, 3);
    rect(14, 22 + u, 4, 1, ac, 2);
    rect(15, 24 + u, 2, 1, k.item, 1);
    rect(17, 23 + u, 1, 3, k.item, 2);
  }
}

// ---------------------------------------------------------------- held items

function heldItem(k: Kit, r: Rig): void {
  const h = r.held;
  if (!h) {
    return;
  }
  const u = r.u;
  const x = h.x;
  const y = h.y + u;
  switch (h.kind) {
    case 'mug': {
      const m = k.item;
      rect(x, y, 4, 4, m, 2);
      rect(x, y, 1, 4, m, 3);
      rect(x + 3, y, 1, 4, m, 1);
      rect(x, y + 3, 4, 1, m, 1);
      rect(x + 1, y, 2, 1, k.coffee, 2);
      if (r.view !== 'left') {
        px(x + 1, y + 2, k.accent, 2);
        px(x + 2, y + 2, k.accent, 2);
        px(x + 4, y + 1, m, 1);
        px(x + 4, y + 2, m, 1);
      } else {
        px(x - 1, y + 1, m, 2);
        px(x - 1, y + 2, m, 1);
      }
      return;
    }
    case 'phone': {
      const m = k.metal;
      rect(x, y, 2, 5, m, 1);
      px(x, y, m, 2);
      px(x + 1, y + 1, m, 3);
      return;
    }
    case 'book': {
      const p = k.item;
      const c = k.accent;
      const flip = h.frame === 3;
      if (r.view === 'left') {
        rect(x, y, 3, 7, c, 2);
        rect(x, y, 1, 7, c, 3);
        rect(x + 3, y + 1, 1, 6, p, 3);
        px(x + 3, y + 6, p, 2);
        if (flip) {
          rect(x + 4, y, 1, 3, p, 4);
        }
        return;
      }
      rect(x - 1, y, 12, 5, c, 1);
      rect(x, y, 10, 4, p, 3);
      rect(x + 5, y, 1, 4, p, 1);
      rect(x + 4, y, 1, 4, p, 2);
      rect(x, y + 3, 10, 1, p, 2);
      for (const ly of [1, 2]) {
        rect(x + 1, y + ly, 3, 1, p, 2);
        rect(x + 6, y + ly, 3, 1, p, 2);
      }
      if (flip) {
        rect(x + 5, y - 2, 3, 2, p, 4);
        px(x + 7, y - 2, p, 3);
      }
      return;
    }
  }
}
