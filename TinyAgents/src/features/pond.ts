import { TILE } from '../config';
import { registerExtension } from '../agents/director';
import { hash2, water } from '../art/kit';
import { KOI_HEADINGS, KOI_SIZE, koiLeap, koiUnder, lilyPad, reeds, rippleRing } from '../art/pondLife';
import { Office } from '../world/office';
import { nightness } from './shared';
import { windPose } from './wind';

const KOI = [0, 1, 2, 0];
const LEAP_TIME = 0.85;
const LEAP_DIST = 14;
const LEAP_HEIGHT = 13;
const TURN_RATE = 1.4;
const UNDER = -1e6 + 5;

interface Koi {
  kind: number;
  x: number;
  y: number;
  a: number;
  target: number;
  speed: number;
  tail: number;
  wander: number;
  leap: { t: number; x0: number; y0: number; dir: number } | null;
}

interface Ring {
  x: number;
  y: number;
  t: number;
  life: number;
  max: number;
}

interface Drop {
  x: number;
  y: number;
  h: number;
  vx: number;
  vh: number;
}

interface Pond {
  version: number;
  tiles: [number, number][];
  cx: number;
  cy: number;
  pads: { x: number; y: number; img: HTMLCanvasElement }[];
  reeds: { x: number; y: number; seed: number }[];
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function pondOf(office: Office): Pond {
  const tiles: [number, number][] = [];
  for (let y = 0; y < office.h; y++) {
    for (let x = 0; x < office.w; x++) {
      if (office.floorAt(x, y) === 'water') {
        tiles.push([x, y]);
      }
    }
  }
  const n = Math.max(1, tiles.length);
  const pond: Pond = {
    version: office.version,
    tiles,
    cx: (tiles.reduce((s, [x]) => s + x, 0) / n + 0.5) * TILE,
    cy: (tiles.reduce((s, [, y]) => s + y, 0) / n + 0.5) * TILE,
    pads: [],
    reeds: [],
  };
  const wet = (x: number, y: number) => office.floorAt(x, y) === 'water';
  const covered = (x: number, y: number) => office.layout.items.some((i) => office.defOf(i)?.layer !== 'floor' && office.covers(i, x, y));
  for (const [x, y] of tiles) {
    const roomy = (gap: number) => (p: { x: number; y: number }) => Math.abs(p.x - x * TILE) + Math.abs(p.y - y * TILE) < gap;
    if (hash2(x, y, 601) < 0.22 && wet(x - 1, y) && wet(x + 1, y) && wet(x, y - 1) && wet(x, y + 1) && !pond.pads.some(roomy(48))) {
      const big = hash2(x, y, 602) < 0.5;
      pond.pads.push({ x: x * TILE + 6 + Math.floor(hash2(x, y, 603) * 14), y: y * TILE + 8 + Math.floor(hash2(x, y, 604) * 14), img: lilyPad(big ? 10 : 8, big ? 6 : 5, hash2(x, y, 605) < 0.4) });
    }
    const shore = !wet(x, y + 1) ? [16, 25] : !wet(x - 1, y) ? [9, 18] : !wet(x + 1, y) ? [23, 18] : null;
    if (shore && !covered(x, y) && hash2(x, y, 611) < 0.4 && !pond.reeds.some(roomy(64))) {
      pond.reeds.push({ x: x * TILE + shore[0] + Math.round((hash2(x, y, 612) - 0.5) * 8), y: y * TILE + shore[1], seed: 620 + x * 7 + y });
    }
  }
  return pond;
}

/**
 * Koi in the park pond (ground floor): they wander under the surface, tinted by the water and turning smoothly,
 * and every so often one leaps out in a small arc and splashes back, leaving ripple rings. Lily pads float over
 * them and reeds along the shore lean with the wind. Drawn before the lighting, so night dims them too.
 */
registerExtension((director) => {
  if (director.level !== 0) {
    return {};
  }
  const office = director.office;
  let pond: Pond | null = null;
  const fish: Koi[] = [];
  const rings: Ring[] = [];
  const drops: Drop[] = [];
  let nextLeap = 4 + Math.random() * 6;

  const swim = (x: number, y: number) =>
    [[-7, -6], [7, -6], [-7, 6], [7, 6]].every(([dx, dy]) => {
      const tx = Math.floor((x + dx) / TILE);
      const ty = Math.floor((y + dy) / TILE);
      return office.inBounds(tx, ty) && office.floorAt(tx, ty) === 'water';
    });

  const place = (k: Koi, p: Pond) => {
    for (let i = 0; i < 40; i++) {
      const [tx, ty] = p.tiles[Math.floor(Math.random() * p.tiles.length)];
      const x = tx * TILE + 4 + Math.random() * 24;
      const y = ty * TILE + 4 + Math.random() * 24;
      if (swim(x, y)) {
        k.x = x;
        k.y = y;
        return;
      }
    }
  };

  const splash = (x: number, y: number, big: boolean) => {
    rings.push({ x, y, t: 0, life: 1.6, max: big ? 11 : 7 });
    if (big) {
      rings.push({ x, y, t: -0.35, life: 1.4, max: 7 });
    }
    for (let i = 0; i < (big ? 6 : 3); i++) {
      drops.push({ x, y, h: 1, vx: (Math.random() - 0.5) * 34, vh: 30 + Math.random() * (big ? 40 : 22) });
    }
  };

  const refresh = (): Pond | null => {
    if (!pond || pond.version !== office.version) {
      pond = pondOf(office);
      if (!pond.tiles.length) {
        fish.length = 0;
        return pond;
      }
      if (!fish.length) {
        for (const kind of KOI) {
          const a = Math.random() * Math.PI * 2;
          fish.push({ kind, x: 0, y: 0, a, target: a, speed: 6, tail: Math.random() * 6, wander: Math.random() * 3, leap: null });
        }
      }
      for (const k of fish) {
        if (!swim(k.x, k.y)) {
          k.leap = null;
          place(k, pond);
        }
      }
    }
    return pond;
  };

  const leapOff = () => {
    const k = fish[Math.floor(Math.random() * fish.length)];
    const dir = Math.cos(k.a) >= 0 ? 1 : -1;
    if (k.leap || !swim(k.x + dir * LEAP_DIST, k.y)) {
      return;
    }
    k.leap = { t: 0, x0: k.x, y0: k.y, dir };
    splash(k.x, k.y, false);
  };

  const swimStep = (k: Koi, p: Pond, dt: number) => {
    if ((k.wander -= dt) <= 0) {
      k.target = k.a + (Math.random() - 0.5) * 2.2;
      k.speed = Math.random() < 0.15 ? 15 : 4 + Math.random() * 5;
      k.wander = 2 + Math.random() * 4;
      if (Math.random() < 0.25) {
        rings.push({ x: k.x + Math.cos(k.a) * 4, y: k.y + Math.sin(k.a) * 4, t: 0, life: 1.1, max: 4 });
      }
    }
    if (!swim(k.x + Math.cos(k.a) * 10, k.y + Math.sin(k.a) * 10)) {
      k.target = Math.atan2(p.cy - k.y, p.cx - k.x) + (Math.random() - 0.5) * 0.6;
      k.wander = Math.max(k.wander, 1);
    }
    const turn = wrapAngle(k.target - k.a);
    k.a = wrapAngle(k.a + Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, turn)));
    const nx = k.x + Math.cos(k.a) * k.speed * dt;
    const ny = k.y + Math.sin(k.a) * k.speed * dt;
    if (swim(nx, ny)) {
      k.x = nx;
      k.y = ny;
    }
    k.speed += (5 - k.speed) * Math.min(1, dt * 0.5);
    k.tail += dt * (2.5 + k.speed * 0.35);
  };

  return {
    update(dt) {
      const p = refresh();
      if (!p || !p.tiles.length) {
        return;
      }
      if ((nextLeap -= dt) <= 0) {
        nextLeap = 7 + Math.random() * 14;
        leapOff();
      }
      for (const k of fish) {
        const l = k.leap;
        if (!l) {
          swimStep(k, p, dt);
          continue;
        }
        l.t += dt / LEAP_TIME;
        if (l.t >= 1) {
          k.x = l.x0 + l.dir * LEAP_DIST;
          k.y = l.y0;
          k.a = k.target = l.dir > 0 ? 0 : Math.PI;
          k.leap = null;
          splash(k.x, k.y, true);
        }
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        if ((rings[i].t += dt) >= rings[i].life) {
          rings.splice(i, 1);
        }
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.x += d.vx * dt;
        d.vh -= 150 * dt;
        d.h += d.vh * dt;
        if (d.h < 0) {
          drops.splice(i, 1);
        }
      }
    },
    drawables(view, push) {
      const p = refresh();
      if (!p || !p.tiles.length) {
        return;
      }
      const dim = 1 - 0.35 * nightness();
      const half = KOI_SIZE / 2;
      push(UNDER, (ctx) => {
        ctx.globalAlpha = 0.78 * dim;
        for (const k of fish) {
          if (k.leap) {
            continue;
          }
          const heading = ((Math.round((k.a / (Math.PI * 2)) * KOI_HEADINGS) % KOI_HEADINGS) + KOI_HEADINGS) % KOI_HEADINGS;
          ctx.drawImage(koiUnder(k.kind, heading, Math.round(Math.sin(k.tail))), Math.round(k.x - half), Math.round(k.y - half));
        }
        for (const r of rings) {
          if (r.t < 0) {
            continue;
          }
          const f = r.t / r.life;
          const rad = Math.max(1, Math.round(1 + (r.max - 1) * Math.sqrt(f)));
          ctx.globalAlpha = 0.85 * (1 - f) * dim;
          ctx.drawImage(rippleRing(rad, f < 0.3), Math.round(r.x) - rad, Math.round(r.y) - Math.round(rad / 2));
        }
        ctx.globalAlpha = 1;
        for (const pad of p.pads) {
          ctx.drawImage(pad.img, pad.x, pad.y);
        }
      });
      for (const k of fish) {
        const l = k.leap;
        if (!l) {
          continue;
        }
        const x = l.x0 + l.dir * LEAP_DIST * l.t;
        const h = LEAP_HEIGHT * Math.sin(Math.PI * Math.min(1, l.t));
        const tilt = l.t < 0.36 ? -1 : l.t > 0.64 ? 1 : 0;
        push(l.y0 + 1, (ctx) => {
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = water[0];
          ctx.fillRect(Math.round(x) - 3, Math.round(l.y0), 6, 1);
          ctx.fillRect(Math.round(x) - 2, Math.round(l.y0) + 1, 4, 1);
          ctx.globalAlpha = 1;
          ctx.drawImage(koiLeap(k.kind, l.dir > 0, tilt), Math.round(x - half), Math.round(l.y0 - h - half));
        });
      }
      for (const d of drops) {
        push(d.y + 1, (ctx) => {
          ctx.fillStyle = water[5];
          ctx.fillRect(Math.round(d.x), Math.round(d.y - d.h), 1, 1);
        });
      }
      for (const r of p.reeds) {
        if (r.x < view.x - 16 || r.x > view.x + view.w + 16 || r.y < view.y - 4 || r.y > view.y + view.h + 24) {
          continue;
        }
        const part = reeds(r.seed, windPose(r.x, r.y));
        push(r.y, (ctx) => ctx.drawImage(part.canvas, r.x + part.x, r.y + part.y));
      }
    },
  };
});
