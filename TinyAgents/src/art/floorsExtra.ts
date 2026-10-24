import { defineFloor } from './registry';
import { Pen, blue, charcoal, cream, fbm2, hash2, hashInt, mix, mustard, noise2, plant, red, rng, sage, steel, tilePen } from './kit';

// Extra indoor floors: raised data-centre panels, school linoleum, polished studio concrete, gaming-café carpet, marble.
// Every feature is laid out in world pixels so nothing repeats on the tile grid.

const T = 32;

function eachPixel(p: Pen, tx: number, ty: number, fn: (wx: number, wy: number) => string): void {
  for (let ly = 0; ly < T; ly++) {
    for (let lx = 0; lx < T; lx++) {
      p.px(lx, ly, fn(tx * T + lx, ty * T + ly));
    }
  }
}

const band = (v: number, lo: number, hi: number) => (v < lo ? 0 : v > hi ? 2 : 1);

// Raised access floor: 32 px steel panels offset half a tile, with perforated airflow panels in loose lanes.
const raisedTones = [mix(steel[4], steel[5], 0.35), mix(steel[4], steel[5], 0.5), mix(steel[4], steel[5], 0.65)];
const raisedSeam = mix(steel[3], steel[4], 0.4);

defineFloor({
  id: 'tile.raised',
  name: 'Raised floor panels',
  outdoor: false,
  draw(ctx, tx, ty) {
    const p = tilePen(ctx);
    eachPixel(p, tx, ty, (wx, wy) => {
      const px = wx + 16;
      const py = wy + 16;
      const sx = Math.floor(px / T);
      const sy = Math.floor(py / T);
      const u = px - sx * T;
      const v = py - sy * T;
      const tone = raisedTones[band(noise2(sx * T, sy * T, 160, 301) + (hash2(sx, sy, 302) - 0.5) * 0.25, 0.38, 0.64)];
      if (u === 0 || v === 0) {
        return raisedSeam;
      }
      if (u === 1 || v === 1) {
        return mix(tone, steel[6], 0.35);
      }
      if (u === T - 1 || v === T - 1) {
        return mix(tone, steel[3], 0.35);
      }
      const vented = hash2(sx, 0, 303) < 0.3 && hash2(sx, sy, 304) < 0.8;
      if (vented && u > 4 && u < T - 4 && v > 4 && v < T - 4 && u % 3 === 0 && v % 3 === 0) {
        return mix(steel[2], steel[3], 0.5);
      }
      if (!vented && u > 3 && u < 7 && v > 3 && v < 7 && u + v === 9) {
        return mix(tone, steel[3], 0.25);
      }
      return tone;
    });
  },
});

// School linoleum: 16 px vinyl tiles in a cream/sage checker, a few off-tone tiles, sparse flecks.
const linoA = [mix(cream[4], cream[5], 0.3), mix(cream[4], cream[5], 0.45), mix(cream[4], cream[5], 0.6)];
const linoB = [mix(sage[5], cream[4], 0.45), mix(sage[5], cream[4], 0.55), mix(sage[5], cream[4], 0.65)];

defineFloor({
  id: 'tile.linoleum',
  name: 'School linoleum',
  outdoor: false,
  draw(ctx, tx, ty) {
    const p = tilePen(ctx);
    eachPixel(p, tx, ty, (wx, wy) => {
      const sx = Math.floor(wx / 16);
      const sy = Math.floor(wy / 16);
      const u = wx - sx * 16;
      const v = wy - sy * 16;
      const set = ((sx + sy) & 1) === 0 ? linoA : linoB;
      const base = set[band(noise2(sx * 16, sy * 16, 140, 311) + (hash2(sx, sy, 312) - 0.5) * 0.3, 0.36, 0.66)];
      if (u === 0 || v === 0) {
        return mix(base, cream[2], 0.22);
      }
      if (u === 1 || v === 1) {
        return mix(base, cream[6], 0.25);
      }
      if (hash2(wx, wy, 313) < 0.035) {
        return mix(base, set === linoA ? sage[3] : cream[6], 0.35);
      }
      return base;
    });
  },
});

// Polished concrete: soft mottling, saw-cut joints every three tiles (offset), rare hairline cracks.
const concrete = [mix(steel[3], steel[4], 0.55), mix(steel[3], steel[4], 0.63), mix(steel[3], steel[4], 0.71), mix(steel[3], steel[4], 0.79)];
const JOINT = 96;

defineFloor({
  id: 'concrete.polished',
  name: 'Polished concrete',
  outdoor: false,
  draw(ctx, tx, ty) {
    const p = tilePen(ctx);
    eachPixel(p, tx, ty, (wx, wy) => {
      const n = fbm2(wx >> 1, wy >> 1, 60, 321) + (hash2(wx >> 1, wy >> 1, 322) - 0.5) * 0.06;
      const c = concrete[n < 0.32 ? 0 : n < 0.5 ? 1 : n < 0.68 ? 2 : 3];
      if ((wx + 40) % JOINT === 0 || (wy + 24) % JOINT === 0) {
        return mix(steel[2], steel[3], 0.6);
      }
      if ((wx + 40) % JOINT === 1 || (wy + 24) % JOINT === 1) {
        return mix(c, steel[5], 0.3);
      }
      return c;
    });
    const r = rng(hashInt(tx, ty, 323));
    if (r() < 0.12) {
      let x = Math.floor(r() * 24) + 4;
      let y = Math.floor(r() * 24) + 4;
      const crack = mix(steel[2], steel[3], 0.8);
      for (let i = 0; i < 10; i++) {
        p.px(x, y, crack);
        x += r() < 0.6 ? 1 : 0;
        y += r() < 0.5 ? 1 : -1;
      }
    }
    if (r() < 0.2) {
      p.hline(Math.floor(r() * 26) + 2, Math.floor(r() * 28) + 2, 3, mix(steel[4], steel[5], 0.35));
    }
  },
});

// Gaming-café carpet: dark charcoal 16 px tiles with alternating weave and sparse coloured confetti flecks.
const darkCarpet = [mix(charcoal[2], charcoal[3], 0.35), mix(charcoal[2], charcoal[3], 0.55), mix(charcoal[2], charcoal[3], 0.75)];
const confetti = [mix(blue[3], charcoal[3], 0.35), mix(red[2], charcoal[3], 0.4), mix(plant[5], charcoal[3], 0.45), mix(mustard[4], charcoal[3], 0.4)];

defineFloor({
  id: 'carpet.charcoal',
  name: 'Charcoal confetti carpet',
  outdoor: false,
  draw(ctx, tx, ty) {
    const p = tilePen(ctx);
    eachPixel(p, tx, ty, (wx, wy) => {
      const sx = Math.floor(wx / 16);
      const sy = Math.floor(wy / 16);
      const u = wx - sx * 16;
      const v = wy - sy * 16;
      const base = darkCarpet[band(noise2(sx * 16 + 8, sy * 16 + 8, 120, 331) + (hash2(sx, sy, 332) - 0.5) * 0.2, 0.36, 0.66)];
      const horizontal = ((sx + sy) & 1) === 0;
      const a = horizontal ? u : v;
      const b = horizontal ? v : u;
      if (u === 0 || v === 0) {
        return mix(base, charcoal[1], 0.3);
      }
      const h = hash2(wx >> 1, wy, 333);
      if (h < 0.012) {
        return confetti[hashInt(wx >> 1, wy, 334) % confetti.length];
      }
      if (b % 4 === 2 && a > 0 && a < 15) {
        return mix(base, charcoal[1], 0.5);
      }
      return base;
    });
  },
});

// Marble: 32 px slabs offset by half a tile in alternate rows, soft veins that run across slab joints.
const marble = [mix(cream[5], cream[6], 0.35), mix(cream[5], cream[6], 0.55), mix(cream[5], cream[6], 0.75)];
const vein = mix(steel[4], cream[4], 0.55);
const veinSoft = mix(steel[5], cream[5], 0.65);

defineFloor({
  id: 'tile.marble',
  name: 'Polished marble',
  outdoor: false,
  draw(ctx, tx, ty) {
    const p = tilePen(ctx);
    eachPixel(p, tx, ty, (wx, wy) => {
      const row = Math.floor(wy / T);
      const ox = row & 1 ? 16 : 0;
      const sx = Math.floor((wx + ox) / T);
      const u = wx + ox - sx * T;
      const v = wy - row * T;
      const base = marble[band(noise2(sx * T, row * T, 150, 341) + (hash2(sx, row, 342) - 0.5) * 0.3, 0.36, 0.66)];
      if (u === 0 || v === 0) {
        return mix(cream[4], cream[5], 0.4);
      }
      const n = fbm2(wx + wy * 0.6, wy - wx * 0.3, 70, 343);
      const d = Math.abs(n - 0.5);
      if (d < 0.004) {
        return vein;
      }
      if (d < 0.01) {
        return veinSoft;
      }
      if (u === 1 || v === 1) {
        return mix(base, cream[6], 0.5);
      }
      return base;
    });
  },
});
