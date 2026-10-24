import { app } from '../app';
import { TILE } from '../config';
import { registerExtension } from '../agents/director';
import { bayer, fbm2, hash2, steel, water } from '../art/kit';
import { makeCanvas } from '../render/pixel';
import { Rect } from '../render/renderer';
import { Weather, weather } from '../world/calendar';
import { Office } from '../world/office';
import { itemsWith } from './shared';

interface Ground {
  key: string;
  /** snow cover or puddles, drawn right over the floor */
  cover: HTMLCanvasElement | null;
  /** outdoor tiles filled in one colour, for the rainy-day dimming */
  outdoor: HTMLCanvasElement;
  puddles: [number, number][];
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

function puddleCover(office: Office, puddles: [number, number][]): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(office.w * TILE, office.h * TILE);
  for (let ty = 0; ty < office.h; ty++) {
    for (let tx = 0; tx < office.w; tx++) {
      const f = office.floorAt(tx, ty) ?? '';
      const hard = office.drivable(tx, ty) || f.startsWith('paving') || f.startsWith('path');
      if (!office.isOutdoor(tx, ty) || !hard || hash2(tx, ty, 23) > 0.16) {
        continue;
      }
      const w = 10 + Math.floor(hash2(tx, ty, 24) * 10);
      const h = 4 + Math.floor(hash2(tx, ty, 25) * 3);
      const x = tx * TILE + Math.floor(hash2(tx, ty, 26) * (TILE - w));
      const y = ty * TILE + 6 + Math.floor(hash2(tx, ty, 27) * (TILE - h - 8));
      ellipse(ctx, x, y, w, h, water[2]);
      ellipse(ctx, x + 1, y + 1, w - 2, h - 1, water[3]);
      ctx.fillStyle = water[4];
      ctx.fillRect(x + 3, y + 1, Math.max(2, Math.floor(w / 3)), 1);
      ctx.fillStyle = water[5];
      ctx.fillRect(x + 3, y + 1, 1, 1);
      puddles.push([x + w / 2, y + h / 2]);
    }
  }
  return c;
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  for (let row = 0; row < h; row++) {
    const t = (row + 0.5 - h / 2) / (h / 2);
    const half = Math.round((w / 2) * Math.sqrt(Math.max(0, 1 - t * t)) + 0.15);
    ctx.fillRect(x + Math.round(w / 2 - half), y + row, half * 2, 1);
  }
}

function outdoorMask(office: Office): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(office.w * TILE, office.h * TILE);
  ctx.fillStyle = '#2c374f';
  for (let y = 0; y < office.h; y++) {
    for (let x = 0; x < office.w; x++) {
      if (office.isOutdoor(x, y) || (!office.floorAt(x, y) && !office.wallAt(x, y))) {
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }
  return c;
}

const grounds = new WeakMap<Office, Ground>();

function groundFor(office: Office, w: Weather): Ground {
  const snowy = w === 'snow';
  const key = `${office.version}|${w}|${snowy}`;
  let g = grounds.get(office);
  if (!g || g.key !== key) {
    const puddles: [number, number][] = [];
    const cover = snowy ? snowCover(office, w === 'snow') : w === 'rain' ? puddleCover(office, puddles) : null;
    g = { key, cover, outdoor: outdoorMask(office), puddles };
    grounds.set(office, g);
  }
  return g;
}

/**
 * The day's weather (calendar `weather()`, ?weather=rain|snow|clear): rain or snow falling over outdoor areas,
 * drips running down the windows, puddles or snow cover on the ground and a greyer sky when it rains.
 * December always has some snow on the ground. Staff skip the park in bad weather (director `chooseIdle`).
 */
registerExtension((director) => {
  let time = 0;
  const office = director.office;
  return {
    update(dt) {
      time += dt;
    },
    drawables(_view, push) {
      const g = groundFor(office, weather());
      if (g.cover) {
        const cover = g.cover;
        push(-1e6 + 1, (ctx) => ctx.drawImage(cover, 0, 0));
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
    if (!office.inBounds(tx, ty) || !office.isOutdoor(tx, ty)) {
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
