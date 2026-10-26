import { app } from '../app';
import { TILE } from '../config';
import { registerExtension } from '../agents/director';
import { bayer, dirt, fbm2, hash2, steel, water } from '../art/kit';
import { drawFloorTile } from '../render/floorLayer';
import { makeCanvas } from '../render/pixel';
import { Rect } from '../render/renderer';
import { Weather, snowSeason, weather } from '../world/calendar';
import { Office } from '../world/office';
import { itemsWith } from './shared';

interface Ground {
  key: string;
  /** snow cover or puddles, drawn right over the floor */
  cover: HTMLCanvasElement | null;
  /** outdoor tiles filled in one colour, for the rainy-day dimming */
  outdoor: HTMLCanvasElement;
  puddles: [number, number][];
  /** how much sky each pixel reflects (white = all): the pond, and puddles when it rains; null with no water */
  water: HTMLCanvasElement | null;
}

const SNOW = steel[6];
const SNOW_SHADE = steel[5];

function snowCover(office: Office, heavy: boolean): HTMLCanvasElement {
  const W = office.w * TILE;
  const H = office.h * TILE;
  const [c, ctx] = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  const put = (i: number, hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    img.data[i] = n >> 16;
    img.data[i + 1] = (n >> 8) & 255;
    img.data[i + 2] = n & 255;
    img.data[i + 3] = 255;
  };
  for (let ty = 0; ty < office.h; ty++) {
    for (let tx = 0; tx < office.w; tx++) {
      if (!office.isOutdoor(tx, ty)) {
        continue;
      }
      const f = office.floorAt(tx, ty) ?? '';
      const base = office.drivable(tx, ty) ? 0.28 : f.startsWith('grass') ? 0.82 : 0.55;
      for (let py = 0; py < TILE; py += 2) {
        for (let px = 0; px < TILE; px += 2) {
          const x = tx * TILE + px;
          const y = ty * TILE + py;
          const v = base * (heavy ? 1 : 0.6) * (0.55 + fbm2(x, y, 40, 17) * 0.8);
          if (v > bayer(x >> 1, y >> 1) * 0.9 + 0.08) {
            const c = fbm2(x, y + 3, 9, 4) < 0.38 ? SNOW_SHADE : SNOW;
            for (const k of [0, 1, W, W + 1]) {
              put((y * W + x + k) * 4, c);
            }
          }
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Paving and roads: rain splashes on them and leaves shallow clear puddles. */
function hardGround(office: Office, x: number, y: number): boolean {
  const f = office.floorAt(x, y) ?? '';
  return office.drivable(x, y) || f === 'asphalt' || f.startsWith('paving');
}

/** Gravel and dirt paths: muddy puddles, no splashes. */
function softPath(office: Office, x: number, y: number): boolean {
  return (office.floorAt(x, y) ?? '').startsWith('path');
}

/**
 * Wide, shallow puddles: a few overlapping ellipses each, a faint sheen of water on paving and roads, muddy on gravel.
 * Each puddle also goes into `mask` (how much sky it reflects).
 */
function puddleCover(office: Office, puddles: [number, number][], mask: CanvasRenderingContext2D): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(office.w * TILE, office.h * TILE);
  for (let ty = 0; ty < office.h; ty++) {
    for (let tx = 0; tx < office.w; tx++) {
      const hard = hardGround(office, tx, ty);
      const mud = !hard && softPath(office, tx, ty);
      if (!office.isOutdoor(tx, ty) || (!hard && !mud) || hash2(tx, ty, 23) > 0.2) {
        continue;
      }
      const w = 18 + Math.floor(hash2(tx, ty, 24) * 18);
      const h = 7 + Math.floor(hash2(tx, ty, 25) * 6);
      const x = tx * TILE + Math.floor(hash2(tx, ty, 26) * (TILE - w / 2)) - 4;
      const y = ty * TILE + 4 + Math.floor(hash2(tx, ty, 27) * (TILE - h - 4));
      const blobs: [number, number, number, number][] = [[x, y, w, h]];
      for (let k = 0; k < 2; k++) {
        const bw = Math.round(w * (0.4 + hash2(tx, ty, 30 + k) * 0.3));
        const bh = Math.round(h * (0.6 + hash2(tx, ty, 32 + k) * 0.3));
        blobs.push([x + Math.floor(hash2(tx, ty, 34 + k) * (w - bw)), y + (k ? h - bh + 2 : -2), bw, bh]);
      }
      ctx.globalAlpha = mud ? 0.5 : 0.28;
      for (const [bx, by, bw, bh] of blobs) {
        ellipse(ctx, bx, by, bw, bh, mud ? dirt[1] : water[3]);
      }
      ctx.globalAlpha = mud ? 0.35 : 0.22;
      for (const [bx, by, bw, bh] of blobs) {
        ellipse(ctx, bx + 2, by + 1, Math.max(2, bw - 4), Math.max(2, bh - 2), mud ? dirt[2] : water[4]);
      }
      mask.globalAlpha = mud ? 0.3 : 0.6;
      for (const [bx, by, bw, bh] of blobs) {
        ellipse(mask, bx + 1, by + 1, Math.max(2, bw - 2), Math.max(2, bh - 2), '#fff');
      }
      puddles.push([x + w / 2, y + h / 2]);
    }
  }
  ctx.globalAlpha = 1;
  mask.globalAlpha = 1;
  return c;
}

/** The pond's open water, pixel for pixel (the water tiles as drawn, minus their grassy and earthy shores). */
function pondMask(office: Office, mask: CanvasRenderingContext2D): boolean {
  const [, tctx] = makeCanvas(TILE, TILE);
  let any = false;
  for (let ty = 0; ty < office.h; ty++) {
    for (let tx = 0; tx < office.w; tx++) {
      if (office.floorAt(tx, ty) !== 'water') {
        continue;
      }
      tctx.clearRect(0, 0, TILE, TILE);
      drawFloorTile(tctx, office, 'water', tx, ty, 0, 0);
      const src = tctx.getImageData(0, 0, TILE, TILE);
      const out = mask.getImageData(tx * TILE, ty * TILE, TILE, TILE);
      for (let i = 0; i < src.data.length; i += 4) {
        const [r, g, b] = [src.data[i], src.data[i + 1], src.data[i + 2]];
        if (b > r + 20 && b >= g - 6) {
          out.data.set([255, 255, 255, 255], i);
        }
      }
      mask.putImageData(out, tx * TILE, ty * TILE);
      any = true;
    }
  }
  return any;
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  for (let row = 0; row < h; row++) {
    const t = (row + 0.5 - h / 2) / (h / 2);
    const half = Math.round((w / 2) * Math.sqrt(Math.max(0, 1 - t * t)) + 0.15);
    ctx.fillRect(x + Math.round(w / 2 - half), y + row, half * 2, 1);
  }
}

/** Under the open sky: outdoor ground, or (on upper floors) the open air around the building. */
export function openSky(office: Office, x: number, y: number): boolean {
  return office.isOutdoor(x, y) || (!office.floorAt(x, y) && !office.wallAt(x, y));
}

function outdoorMask(office: Office): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(office.w * TILE, office.h * TILE);
  ctx.fillStyle = '#2c374f';
  for (let y = 0; y < office.h; y++) {
    for (let x = 0; x < office.w; x++) {
      if (openSky(office, x, y)) {
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }
  return c;
}

const grounds = new WeakMap<Office, Ground>();

function groundFor(office: Office, w: Weather): Ground {
  const snowy = w === 'snow' || snowSeason();
  const key = `${office.version}|${w}|${snowy}`;
  let g = grounds.get(office);
  if (!g || g.key !== key) {
    const puddles: [number, number][] = [];
    const [water, mask] = makeCanvas(office.w * TILE, office.h * TILE);
    const pond = pondMask(office, mask);
    const cover = snowy ? snowCover(office, w === 'snow') : w === 'rain' ? puddleCover(office, puddles, mask) : null;
    const wet = pond || puddles.length > 0;
    g = { key, cover, outdoor: outdoorMask(office), puddles, water: wet ? water : null };
    grounds.set(office, g);
  }
  return g;
}

interface SkyLook {
  /** sky gradient, deepest first */
  sky: string[];
  /** cloud tones: shaded underside, body, sunlit top */
  cloud: [string, string, string];
  /** chance that a sky cell holds a cloud, 0..1 */
  cover: number;
}

const SKY: Record<Weather, SkyLook> = {
  clear: { sky: ['#6fa9d6', '#86b9df', '#9fc9e7', '#b9d9ef'], cloud: ['#c9d8e8', '#e7eef6', '#fbfdff'], cover: 0.45 },
  rain: { sky: ['#5d6b7a', '#677685', '#738291', '#808e9c'], cloud: ['#56626f', '#8b97a3', '#a9b3bd'], cover: 0.95 },
  snow: { sky: ['#a9b6c4', '#b7c3cf', '#c6d0da', '#d5dde5'], cloud: ['#c4ccd6', '#e1e6ec', '#f6f8fa'], cover: 0.75 },
};
const SKY_W = 64;
const SKY_H = 192;
/** Reflected sky drift, world px per second. */
const SKY_DRIFT = 4;
/** The sky is a grid of cells, each holding at most one cloud, picked and placed by hashing the cell. */
const SKY_CELL_W = 150;
const SKY_CELL_H = 80;
const CLOUD_SHAPES = 12;
const CLOUD_MAX_W = 140;
const skies = new Map<Weather, HTMLCanvasElement>();
const cloudSets = new Map<Weather, HTMLCanvasElement[]>();
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The bare sky: a dithered gradient that repeats every SKY_H px down the screen. */
function skyTile(w: Weather): HTMLCanvasElement {
  let c = skies.get(w);
  if (c) {
    return c;
  }
  const skyRgb = SKY[w].sky.map(rgb);
  const [canvas, ctx] = makeCanvas(SKY_W, SKY_H);
  const img = ctx.createImageData(SKY_W, SKY_H);
  for (let y = 0; y < SKY_H; y++) {
    for (let x = 0; x < SKY_W; x++) {
      const dither = bayer(x, y) - 0.5;
      const t = Math.min(0.999, Math.max(0, (Math.sin((y / SKY_H) * Math.PI * 2) * 0.5 + 0.5) * 0.85 + dither * 0.25));
      const col = skyRgb[Math.floor(t * skyRgb.length)];
      img.data.set([col[0], col[1], col[2], 255], (y * SKY_W + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  skies.set(w, canvas);
  return canvas;
}

/**
 * One puffy cloud: noise carved into an ellipse with a flatter base, so the whole cloud always fits its sprite.
 * Sunlit top edge, soft body, shaded underside, the outline broken up by ordered dither.
 */
function cloudSprite(look: SkyLook, k: number): HTMLCanvasElement {
  const w = 56 + Math.floor(hash2(k, 1, 721) * (CLOUD_MAX_W - 56));
  const h = 20 + Math.floor(hash2(k, 2, 721) * 20);
  const tones = look.cloud.map(rgb);
  const density = (x: number, y: number) => {
    const nx = ((x + 0.5) / w) * 2 - 1;
    const ny = ((y + 0.5) / h) * 2 - 1;
    const r = Math.hypot(nx, ny > 0 ? ny ** 3 : ny);
    return 1 - r - (1 - fbm2(x, y * 1.6, 14, 730 + k * 7)) * 0.6;
  };
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && density(x, y) > 0.02;
  const [canvas, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) {
        continue;
      }
      const ny = (y / h) * 2 - 1 + (bayer(x, y) - 0.5) * 0.3;
      const tone = !inside(x, y + 3) || ny > 0.45 ? 0 : !inside(x, y - 3) || ny < -0.5 ? 2 : 1;
      const col = tones[tone];
      img.data.set([col[0], col[1], col[2], 255], (y * w + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function cloudShapes(w: Weather): HTMLCanvasElement[] {
  let set = cloudSets.get(w);
  if (!set) {
    set = Array.from({ length: CLOUD_SHAPES }, (_, k) => cloudSprite(SKY[w], k));
    cloudSets.set(w, set);
  }
  return set;
}

let scratch: [HTMLCanvasElement, CanvasRenderingContext2D] | null = null;

/**
 * The sky mirrored in the pond and puddles. The sky is pinned to the screen, not the ground: walking the camera over
 * the water slides the water under clouds that stay put on screen, which reads as depth. Drawn before the lighting.
 */
function reflectSky(ctx: CanvasRenderingContext2D, water: HTMLCanvasElement, view: Rect, w: Weather, time: number): void {
  const vw = Math.ceil(view.w) + 2;
  const vh = Math.ceil(view.h) + 2;
  if (!scratch || scratch[0].width < vw || scratch[0].height < vh) {
    scratch = makeCanvas(Math.max(vw, scratch?.[0].width ?? 0), Math.max(vh, scratch?.[0].height ?? 0));
  }
  const [buf, b] = scratch;
  const x0 = Math.floor(view.x);
  const y0 = Math.floor(view.y);
  b.globalCompositeOperation = 'source-over';
  b.clearRect(0, 0, buf.width, buf.height);
  const sky = skyTile(w);
  for (let y = 0; y < vh; y += SKY_H) {
    for (let x = 0; x < vw; x += SKY_W) {
      b.drawImage(sky, x, y);
    }
  }
  const drift = Math.floor(time * SKY_DRIFT);
  const shapes = cloudShapes(w);
  const cover = SKY[w].cover;
  for (let j = -1; j * SKY_CELL_H < vh; j++) {
    for (let i = Math.floor((drift - CLOUD_MAX_W) / SKY_CELL_W); i * SKY_CELL_W < drift + vw; i++) {
      if (hash2(i, j, 741) >= cover) {
        continue;
      }
      const cloud = shapes[Math.floor(hash2(i, j, 742) * shapes.length)];
      const x = i * SKY_CELL_W + Math.floor(hash2(i, j, 743) * (SKY_CELL_W - cloud.width * 0.4)) - drift;
      const y = j * SKY_CELL_H + Math.floor(hash2(i, j, 744) * (SKY_CELL_H - cloud.height * 0.4));
      b.drawImage(cloud, x, y);
    }
  }
  b.globalCompositeOperation = 'destination-in';
  b.drawImage(water, -x0, -y0);
  ctx.globalAlpha = w === 'rain' ? 0.42 : 0.4;
  ctx.drawImage(buf, 0, 0, vw, vh, x0, y0, vw, vh);
  ctx.globalAlpha = 1;
}

/** Raindrops hitting paving and roads: a dot, then a tiny crown, then a fading ring, scattered over the view. */
function splashes(ctx: CanvasRenderingContext2D, office: Office, view: Rect, time: number): void {
  const n = Math.min(160, Math.round((view.w * view.h) / 2600));
  const LIFE = 0.3;
  ctx.fillStyle = 'rgba(214, 236, 242, 0.6)';
  for (let i = 0; i < n; i++) {
    const phase = hash2(i, 0, 801);
    const t = time / LIFE + phase;
    const round = Math.floor(t);
    const f = t - round;
    const x = Math.round(view.x + hash2(i, round, 802) * view.w);
    const y = Math.round(view.y + hash2(i, round, 803) * view.h);
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (!office.inBounds(tx, ty) || !office.isOutdoor(tx, ty) || !hardGround(office, tx, ty)) {
      continue;
    }
    if (f < 0.3) {
      ctx.fillRect(x, y, 1, 1);
    } else if (f < 0.6) {
      ctx.fillRect(x - 1, y - 1, 1, 1);
      ctx.fillRect(x + 1, y - 1, 1, 1);
      ctx.fillRect(x, y, 1, 1);
    } else {
      ctx.fillRect(x - 2, y, 1, 1);
      ctx.fillRect(x + 2, y, 1, 1);
    }
  }
}

/**
 * The day's weather (calendar `weather()`, ?weather=rain|snow|clear): rain or snow falling over outdoor areas,
 * drips running down the windows, puddles or snow cover on the ground and a greyer sky when it rains.
 * Through December (unless switched off in Settings) snow covers the ground. Staff skip the park in bad weather (director `chooseIdle`).
 */
registerExtension((director) => {
  let time = 0;
  const office = director.office;
  return {
    update(dt) {
      time += dt;
    },
    drawables(view, push) {
      const w = weather();
      const g = groundFor(office, w);
      if (g.cover) {
        const cover = g.cover;
        push(-1e6 + 1, (ctx) => ctx.drawImage(cover, 0, 0));
      }
      if (g.water) {
        const water = g.water;
        push(-1e6 + 4, (ctx) => reflectSky(ctx, water, view, w, time));
      }
    },
    afterLighting(ctx, view) {
      const w = weather();
      if (w === 'clear') {
        return;
      }
      const g = groundFor(office, w);
      if (w === 'rain') {
        ctx.globalAlpha = 0.16;
        ctx.drawImage(g.outdoor, 0, 0);
        ctx.globalAlpha = 1;
        ripples(ctx, g.puddles, view, time);
        splashes(ctx, office, view, time);
        windowDrips(ctx, office, time);
      }
      fall(ctx, office, view, time, w);
    },
  };
});

function inView(view: Rect, x: number, y: number): boolean {
  return x >= view.x - 4 && x <= view.x + view.w + 4 && y >= view.y - 4 && y <= view.y + view.h + 4;
}

function fall(ctx: CanvasRenderingContext2D, office: Office, view: Rect, time: number, w: Weather): void {
  const rain = w === 'rain';
  const n = Math.min(900, Math.round((view.w * view.h) / (rain ? 700 : 900)));
  const speed = rain ? 300 : 26;
  ctx.fillStyle = rain ? 'rgba(183, 224, 234, 0.55)' : 'rgba(236, 238, 241, 0.92)';
  for (let i = 0; i < n; i++) {
    const sx = hash2(i, 1, 501) * view.w;
    const sy = hash2(i, 2, 502) * view.h;
    const v = speed * (0.8 + hash2(i, 3, 503) * 0.4);
    const y = view.y + ((sy + time * v) % view.h);
    const drift = (sx - time * v * (rain ? 0.12 : 0)) % view.w;
    let x = view.x + (drift < 0 ? drift + view.w : drift);
    if (!rain) {
      x += Math.sin(time * 1.3 + i) * 4;
    }
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (!office.inBounds(tx, ty) || !openSky(office, tx, ty)) {
      continue;
    }
    if (rain) {
      ctx.fillRect(Math.round(x), Math.round(y), 1, 4);
      ctx.fillRect(Math.round(x) + 1, Math.round(y) - 3, 1, 3);
    } else {
      const s = hash2(i, 4, 504) < 0.3 ? 2 : 1;
      ctx.fillRect(Math.round(x), Math.round(y), s, s);
    }
  }
}

function ripples(ctx: CanvasRenderingContext2D, puddles: [number, number][], view: Rect, time: number): void {
  ctx.fillStyle = 'rgba(183, 224, 234, 0.7)';
  puddles.forEach(([x, y], i) => {
    if (!inView(view, x, y)) {
      return;
    }
    const t = (time * 0.9 + hash2(i, 0, 61) * 3) % 1.6;
    if (t > 0.8) {
      return;
    }
    const r = 1 + Math.floor(t * 5);
    const cx = Math.round(x + (hash2(i, Math.floor(time / 1.6), 62) - 0.5) * 6);
    const cy = Math.round(y);
    ctx.fillRect(cx - r, cy, 1, 1);
    ctx.fillRect(cx + r, cy, 1, 1);
    ctx.fillRect(cx - Math.max(0, r - 1), cy - 1, Math.max(1, r * 2 - 1), 1);
    ctx.fillRect(cx - Math.max(0, r - 1), cy + 1, Math.max(1, r * 2 - 1), 1);
  });
}

/** Drops running down the glass of window walls. */
function windowDrips(ctx: CanvasRenderingContext2D, office: Office, time: number): void {
  ctx.fillStyle = 'rgba(227, 242, 245, 0.75)';
  for (const item of itemsWith(office, 'wall.window')) {
    const wide = item.type === 'wall.window' ? 2 : 1;
    const dy = app.renderer.wallOffset(office, item.x, item.y);
    const x0 = item.x * TILE + 7;
    const gw = wide * TILE - 14;
    const y0 = item.y * TILE + dy - 3;
    for (let k = 0; k < wide * 5; k++) {
      const x = x0 + Math.floor(hash2(item.uid, k, 81) * gw);
      const v = 6 + hash2(item.uid, k, 82) * 8;
      const y = y0 + ((hash2(item.uid, k, 83) * 17 + time * v) % 17);
      ctx.fillRect(x, Math.round(y), 1, 2);
    }
  }
}
