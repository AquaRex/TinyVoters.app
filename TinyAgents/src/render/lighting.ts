import { TILE, WALL_FACE_H, WALL_LINE } from '../config';
import { Light } from '../art/types';
import { Office } from '../world/office';
import { hexToRgb, makeCanvas } from './pixel';
import { WallGeom } from './walls';

/** World px per light texel. Small enough to stay pixel-crisp, big enough to stay cheap. */
const RES = 2;
const LEVELS_MUL = 40;
const LEVELS_GLOW = 28;
/** Region id meaning "no room": walls and empty tiles take light from any side. */
const ANY = -1;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

type RGB = [number, number, number];

interface Sky {
  outdoor: RGB;
  indoor: RGB;
  /** 0 by day, 1 at night: gates nightOnly lights and strengthens glows. */
  night: number;
}

/** Ambient light through the day: [hour, outdoor, indoor, night]. */
const KEYS: [number, RGB, RGB, number][] = [
  [0, [0.3, 0.35, 0.56], [0.74, 0.71, 0.77], 1],
  [5, [0.3, 0.35, 0.56], [0.74, 0.71, 0.77], 1],
  [6.5, [0.78, 0.66, 0.7], [0.86, 0.8, 0.8], 0.55],
  [8, [1, 1, 1], [1, 0.98, 0.96], 0],
  [17, [1, 1, 1], [1, 0.98, 0.96], 0],
  [18.5, [1, 0.84, 0.66], [0.97, 0.9, 0.84], 0.2],
  [20, [0.5, 0.46, 0.66], [0.78, 0.73, 0.75], 0.75],
  [21.5, [0.3, 0.35, 0.56], [0.74, 0.71, 0.77], 1],
  [24, [0.3, 0.35, 0.56], [0.74, 0.71, 0.77], 1],
];

export function skyAt(hour: number): Sky {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) {
    i++;
  }
  const [h0, o0, n0, k0] = KEYS[i];
  const [h1, o1, n1, k1] = KEYS[i + 1];
  const t = h1 > h0 ? (h - h0) / (h1 - h0) : 0;
  const mix = (a: RGB, b: RGB): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  return { outdoor: mix(o0, o1), indoor: mix(n0, n1), night: k0 + (k1 - k0) * t };
}

/**
 * The time of day: the local clock, or a game clock started at an hour picked on the time bar that keeps running
 * from there at `speed` (0 holds it still).
 */
export class DayClock {
  speed = 1;
  private anchor: { hour: number; at: number } | null = null;

  /** Whether the game clock runs instead of the local clock. */
  get manual(): boolean {
    return this.anchor !== null;
  }

  get hour(): number {
    if (this.anchor) {
      const h = this.anchor.hour + ((performance.now() - this.anchor.at) / 3600000) * this.speed;
      return ((h % 24) + 24) % 24;
    }
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  /** Runs the game clock from `hour`, or follows the local clock again (null). */
  set(hour: number | null): void {
    this.anchor = hour === null ? null : { hour, at: performance.now() };
  }

  setSpeed(speed: number): void {
    if (this.anchor) {
      this.anchor = { hour: this.hour, at: performance.now() };
    }
    this.speed = speed;
  }
}

/** The sky's colour through the day, for the time bar: night, dawn, day, dusk (same hours as KEYS). */
export const SKY_COLORS: [number, string][] = [
  [0, '#1d2747'], [5, '#1d2747'], [6.5, '#e3896a'], [8, '#8ec7ea'], [17, '#8ec7ea'], [18.5, '#f0a050'], [20, '#5a4c88'],
  [21.5, '#1d2747'], [24, '#1d2747'],
];

interface PlacedLight {
  x: number;
  y: number;
  /** Tile whose room the light belongs to (walls keep light inside its room). */
  tx: number;
  ty: number;
  light: Light;
  rgb: RGB;
}

/** Ambient class of texels with neither floor nor wall: left untouched (an upper floor's see-through surroundings). */
const EMPTY = 2;
const CLEAR: RGB = [1, 1, 1];

/** Lights and night-time darkness a feature adds to one office. */
export interface LightContribution {
  /** Changes whenever the contribution changes (part of the rebuild key). */
  key: string;
  lights?: PlacedLight[];
  /** At night, indoor tiles for which this is true have their lights off (rooms nobody is in). */
  dark?: (tx: number, ty: number) => boolean;
}

type LightSource = (office: Office) => LightContribution | null;
const sources: LightSource[] = [];

/** Registers a feature's lights (called for the office being lit at every update). */
export function registerLightSource(source: LightSource): void {
  sources.push(source);
}

/**
 * Day/night lighting: a half-res ambient map (outdoor vs indoor, lifted by lamps) composited with `multiply`,
 * and a glow map for lamp and screen light composited additively. Both are dithered to a few levels so the
 * light reads as pixels, not blur. Rebuilt only when the hour bucket, layout or lights change.
 */
export class Lighting {
  /** The time of day the light follows; floors drawn below share the one on screen. */
  clock = new DayClock();
  /** Forced hour from ?time=, overriding everything. */
  forcedHour: number | null = null;
  private mul: HTMLCanvasElement | null = null;
  private glow: HTMLCanvasElement | null = null;
  private builtKey = '';
  private lastBuild = 0;

  constructor() {
    const t = new URLSearchParams(location.search).get('time');
    if (t !== null && !Number.isNaN(parseFloat(t))) {
      this.forcedHour = parseFloat(t);
    }
  }

  get hour(): number {
    if (this.forcedHour !== null) {
      return this.forcedHour;
    }
    return this.clock.hour;
  }

  /** Rebuilds the light maps when the layout or the hour (2-minute steps) changed, at most 4 times a second. */
  update(office: Office, geoms: Map<number, WallGeom>, lights: PlacedLight[], now: number): void {
    const hour = this.hour;
    const extra = sources.map((s) => s(office)).filter((c): c is LightContribution => !!c);
    const key = `${office.version}|${office.w}x${office.h}|${Math.round(hour * 30)}|${lights.length}|${extra.map((c) => c.key).join(';')}`;
    if (key === this.builtKey || (this.mul && now - this.lastBuild < 250)) {
      return;
    }
    this.builtKey = key;
    this.lastBuild = now;
    const darks = extra.flatMap((c) => (c.dark ? [c.dark] : []));
    const dark = darks.length ? (x: number, y: number) => darks.some((f) => f(x, y)) : null;
    this.build(office, geoms, [...lights, ...extra.flatMap((c) => c.lights ?? [])], skyAt(hour), dark);
  }

  composite(ctx: CanvasRenderingContext2D): void {
    if (!this.mul || !this.glow) {
      return;
    }
    const w = this.mul.width * RES;
    const h = this.mul.height * RES;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.mul, 0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.glow, 0, 0, w, h);
    ctx.restore();
  }

  private build(office: Office, geoms: Map<number, WallGeom>, lights: PlacedLight[], sky: Sky, dark: ((x: number, y: number) => boolean) | null): void {
    const W = Math.ceil((office.w * TILE) / RES);
    const H = Math.ceil((office.h * TILE) / RES);
    const n = W * H;
    const r = new Float32Array(n);
    const g = new Float32Array(n);
    const b = new Float32Array(n);
    const gr = new Float32Array(n);
    const gg = new Float32Array(n);
    const gb = new Float32Array(n);

    const { indoor, region, tileRegion, unlit } = this.texelMaps(office, geoms, W, H, dark);
    const off = dark ? Math.max(0, Math.min(1, (sky.night - 0.3) / 0.7)) * 0.8 : 0;
    const lightsOff: RGB = [0, 1, 2].map((i) => sky.indoor[i] + (Math.min(1, sky.outdoor[i] * 1.2) - sky.indoor[i]) * off) as RGB;
    for (let k = 0; k < n; k++) {
      const c = indoor[k] === EMPTY ? CLEAR : indoor[k] ? (unlit[k] ? lightsOff : sky.indoor) : sky.outdoor;
      r[k] = c[0];
      g[k] = c[1];
      b[k] = c[2];
    }

    const glowScale = 0.11 + 0.24 * sky.night;
    const liftScale = 0.25 + 0.75 * sky.night;
    for (const { x, y, tx: lx, ty: ly, light, rgb } of lights) {
      const own = office.inBounds(lx, ly) ? tileRegion[ly * office.w + lx] : ANY;
      const switchedOff = off > 0 && !light.nightOnly && dark!(lx, ly) && !office.isOutdoor(lx, ly);
      const gate = (light.nightOnly ? Math.max(0, (sky.night - 0.3) / 0.7) : 1) * (switchedOff ? 1 - off : 1);
      if (gate <= 0 || light.radius <= 0) {
        continue;
      }
      const lift = light.intensity * gate * liftScale;
      const glow = light.intensity * gate * glowScale;
      const rad = light.radius;
      const x0 = Math.max(0, Math.floor((x - rad) / RES));
      const x1 = Math.min(W - 1, Math.ceil((x + rad) / RES));
      const y0 = Math.max(0, Math.floor((y - rad) / RES));
      const y1 = Math.min(H - 1, Math.ceil((y + rad) / RES));
      for (let ty = y0; ty <= y1; ty++) {
        const dy = (ty + 0.5) * RES - y;
        for (let tx = x0; tx <= x1; tx++) {
          const dx = (tx + 0.5) * RES - x;
          const d2 = (dx * dx + dy * dy) / (rad * rad);
          if (d2 >= 1) {
            continue;
          }
          const k = ty * W + tx;
          if (indoor[k] === EMPTY || (own !== ANY && region[k] !== own && region[k] !== ANY)) {
            continue;
          }
          const f = (1 - d2) * (1 - d2);
          r[k] += rgb[0] * f * lift;
          g[k] += rgb[1] * f * lift;
          b[k] += rgb[2] * f * lift;
          const f2 = f * f;
          gr[k] += rgb[0] * f2 * glow;
          gg[k] += rgb[1] * f2 * glow;
          gb[k] += rgb[2] * f2 * glow;
        }
      }
    }

    const [mul, mctx] = makeCanvas(W, H);
    const [glowC, gctx] = makeCanvas(W, H);
    const mi = mctx.createImageData(W, H);
    const gi = gctx.createImageData(W, H);
    const q = (v: number, levels: number, t: number) => Math.min(levels, Math.floor(v * levels + t)) / levels;
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const k = ty * W + tx;
        const t = BAYER[(ty & 3) * 4 + (tx & 3)];
        const o = k * 4;
        mi.data[o] = q(Math.min(1, r[k]), LEVELS_MUL, t) * 255;
        mi.data[o + 1] = q(Math.min(1, g[k]), LEVELS_MUL, t) * 255;
        mi.data[o + 2] = q(Math.min(1, b[k]), LEVELS_MUL, t) * 255;
        mi.data[o + 3] = 255;
        gi.data[o] = q(Math.min(1, gr[k]), LEVELS_GLOW, t) * 255;
        gi.data[o + 1] = q(Math.min(1, gg[k]), LEVELS_GLOW, t) * 255;
        gi.data[o + 2] = q(Math.min(1, gb[k]), LEVELS_GLOW, t) * 255;
        gi.data[o + 3] = 255;
      }
    }
    mctx.putImageData(mi, 0, 0);
    gctx.putImageData(gi, 0, 0);
    this.mul = mul;
    this.glow = glowC;
  }

  /**
   * Per-texel ambient class and room. Indoor: indoor floor tiles plus each wall sprite painted by the side its
   * face looks into (a building's south wall shows its outside; vertical runs count as indoor if either side is).
   * Rooms: flood-filled areas between walls; wall sprites belong to the room they face (vertical runs to any).
   */
  private texelMaps(
    office: Office,
    geoms: Map<number, WallGeom>,
    W: number,
    H: number,
    dark: ((x: number, y: number) => boolean) | null,
  ): { indoor: Uint8Array; region: Int32Array; tileRegion: Int32Array; unlit: Uint8Array } {
    const indoor = new Uint8Array(W * H);
    const unlit = new Uint8Array(W * H);
    const isDark = (x: number, y: number) => (dark && dark(x, y) ? 1 : 0);
    const region = new Int32Array(W * H).fill(ANY);
    const tileRegion = this.rooms(office);
    const inside = (x: number, y: number) => !!office.floorAt(x, y) && !office.isOutdoor(x, y) && !office.wallAt(x, y);
    const roomOf = (x: number, y: number) => (office.inBounds(x, y) ? tileRegion[y * office.w + x] : ANY);
    const paint = (px: number, py: number, pw: number, ph: number, v: number, room: number, off: number) => {
      const x0 = Math.max(0, Math.floor(px / RES));
      const y0 = Math.max(0, Math.floor(py / RES));
      const x1 = Math.min(W, Math.ceil((px + pw) / RES));
      const y1 = Math.min(H, Math.ceil((py + ph) / RES));
      for (let y = y0; y < y1; y++) {
        indoor.fill(v, y * W + x0, y * W + x1);
        region.fill(room, y * W + x0, y * W + x1);
        unlit.fill(off, y * W + x0, y * W + x1);
      }
    };
    for (let y = 0; y < office.h; y++) {
      for (let x = 0; x < office.w; x++) {
        let wallNextToInside = false;
        if (office.wallAt(x, y)) {
          for (let k = 0; k < 9 && !wallNextToInside; k++) {
            wallNextToInside = inside(x + (k % 3) - 1, y + Math.floor(k / 3) - 1);
          }
        }
        const v = !office.floorAt(x, y) && !office.wallAt(x, y) ? EMPTY : inside(x, y) || wallNextToInside ? 1 : 0;
        paint(x * TILE, y * TILE, TILE, TILE, v, roomOf(x, y), isDark(x, office.wallAt(x, y) ? y + 1 : y));
      }
    }
    for (const g of geoms.values()) {
      const { x, y } = g;
      if (g.s && !g.w && !g.e) {
        const v = inside(x - 1, y) || inside(x + 1, y) ? 1 : 0;
        paint(x * TILE + g.ax, y * TILE - WALL_FACE_H, g.vw, TILE + WALL_FACE_H, v, ANY, isDark(x - 1, y) & isDark(x + 1, y));
      } else {
        const v = inside(x, y + 1) || inside(x - 1, y + 1) || inside(x + 1, y + 1) || (g.s && (inside(x - 1, y) || inside(x + 1, y))) ? 1 : 0;
        paint(x * TILE, y * TILE + g.faceBottom - WALL_FACE_H - WALL_LINE, TILE, WALL_FACE_H + WALL_LINE, v, g.s ? ANY : roomOf(x, y + 1), isDark(x, y + 1));
      }
    }
    return { indoor, region, tileRegion, unlit };
  }

  /** Room id per tile: 4-connected floor tiles not split by walls. Walls and empty tiles are ANY. */
  private rooms(office: Office): Int32Array {
    const { w, h } = office;
    const room = new Int32Array(w * h).fill(ANY);
    let next = 0;
    const stack: number[] = [];
    for (let start = 0; start < w * h; start++) {
      const sx = start % w;
      const sy = Math.floor(start / w);
      if (room[start] !== ANY || office.wallAt(sx, sy) || !office.floorAt(sx, sy)) {
        continue;
      }
      room[start] = next;
      stack.push(start);
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % w;
        const y = Math.floor(i / w);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          const ni = ny * w + nx;
          if (office.inBounds(nx, ny) && room[ni] === ANY && !office.wallAt(nx, ny) && office.floorAt(nx, ny)) {
            room[ni] = next;
            stack.push(ni);
          }
        }
      }
      next++;
    }
    return room;
  }
}

export function placedLight(x: number, y: number, tx: number, ty: number, light: Light): PlacedLight {
  const [r, g, b] = hexToRgb(light.color);
  return { x, y, tx, ty, light, rgb: [r / 255, g / 255, b / 255] };
}

export type { PlacedLight };
