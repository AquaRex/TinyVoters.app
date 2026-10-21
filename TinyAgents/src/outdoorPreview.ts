/**
 * Outdoor preview (outdoorPreview.html): a small business-park scene (park with a pond, paths, benches and
 * trees; a car park with bays and parked cars; a road with a crosswalk) rendered with engine-style depth
 * sorting, contact shadows and real characters. ?zoom=2 ?view=all|park|carpark ?night=1
 */
import './art/index';
import { asset, floor as floorDef, variant } from './art/registry';
import { Dir, Light } from './art/types';
import { FOOT_Y, TILE } from './config';
import { SHADOW, makeCanvas, semiTransparentCount } from './art/kit';
import { characterFrame, CHAR_FOOT_X, CHAR_FOOT_Y } from './render/characters';
import { ACCESSORIES, CLOTH_COLORS, TOP_STYLES, randomAppearance } from './agents/appearance';

const params = new URLSearchParams(location.search);
const ZOOM = Number(params.get('zoom') ?? 2) | 0 || 2;
const VIEW = params.get('view') ?? 'all';
const NIGHT = params.get('night') === '1';
const out = document.getElementById('out')!;

const W = 30;
const H = 20;

// ---------------------------------------------------------------------------------------------------------
// Ground

const pathTiles = new Set<string>();
const addPath = (x0: number, y0: number, x1: number, y1: number) => {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      pathTiles.add(`${x},${y}`);
    }
  }
};
addPath(9, 9, 9, 15);
addPath(2, 9, 16, 9);
addPath(13, 1, 13, 9);
addPath(0, 9, 1, 9);

function ground(x: number, y: number): string | null {
  if (x < 0 || y < 0 || x >= W || y >= H) {
    return null;
  }
  if (y === 17 || y === 18) {
    return 'asphalt';
  }
  if (y === 16) {
    return x >= 24 && x <= 26 ? 'asphalt' : 'paving.stone';
  }
  if (y === 19) {
    return 'paving.stone';
  }
  if (x === 18) {
    return 'paving.stone';
  }
  if (x >= 19) {
    return y >= 10 && y <= 11 && x >= 20 && x <= 28 ? 'grass' : 'asphalt';
  }
  const dx = (x + 0.5 - 4.6) / 2.7;
  const dy = (y + 0.5 - 5.2) / 2.0;
  if (dx * dx + dy * dy < 1) {
    return 'water';
  }
  if (x >= 7 && x <= 11 && y >= 15) {
    return 'paving.brick';
  }
  if (pathTiles.has(`${x},${y}`)) {
    return 'path.gravel';
  }
  if (x === 0 || y === 0 || (x <= 2 && y >= 11)) {
    return 'grass.meadow';
  }
  return 'grass';
}

// ---------------------------------------------------------------------------------------------------------
// Items

interface Place {
  id: string;
  x: number;
  y: number;
  dir?: Dir;
  /** Seat people at the asset's sit spots. */
  use?: boolean;
}

const items: Place[] = [];
const put = (id: string, x: number, y: number, dir: Dir = 'down', use = false) => items.push({ id, x, y, dir, use });

// park: hedges around, trees, pond-side benches, picnic, flowerbeds
for (let x = 0; x <= 16; x++) {
  if (x !== 13) {
    put('hedge', x, 0);
  }
}
for (let y = 0; y <= 15; y++) {
  put('hedge', 17, y, 'left');
}
put('tree.birch', 1, 2);
put('tree.oak.b', 9, 4);
put('tree.pine', 15, 2);
put('tree.oak.a', 3, 13);
put('tree.maple', 14, 14);
put('tree.birch', 16, 8);
put('bush.round.a', 2, 8);
put('bush.flowering', 7, 7);
put('bush.round.b', 11, 2);
put('bush.round.a', 0, 6);
put('bush.flowering', 12, 12);
put('bush.round.b', 16, 12);
put('bench.park', 10, 8, 'down', true);
put('bench.park', 4, 10, 'up', true);
put('bin.street', 12, 8);
put('lamp.street', 8, 8);
put('lamp.street', 12, 10);
put('table.picnic', 14, 6, 'down', true);
put('flowerbed.red', 10, 11);
put('flowerbed.yellow', 7, 11);
put('flowerbed.mixed', 10, 13);
put('fence.wood', 0, 10, 'left');
put('fence.wood', 0, 11, 'left');
put('fence.wood', 0, 12, 'left');
put('sign.monument', 4, 15);
put('flowerbed.mixed', 12, 15);
put('bush.round.a', 14, 15);
put('rock.mossy', 7, 4);
put('rock.mossy', 2, 6);
put('grass.tuft', 1, 7);
put('grass.tuft', 7, 6);
put('grass.tuft', 4, 3);
put('grass.tuft', 1, 13);
put('grass.tuft', 15, 10);
put('flowers.wild', 1, 5);
put('flowers.wild', 6, 2);
put('flowers.wild', 11, 6);
put('flowers.wild', 2, 14);
put('flowers.wild', 16, 15);
put('flowers.wild', 6, 13);
put('bush.round.a', 4, 1);
put('bush.flowering', 8, 1);
put('bush.round.a', 16, 5);
put('grass.tuft', 21, 10);
put('flowers.wild', 23, 11);
put('flowers.wild', 26, 10);

// car park: two rows of bays, a planted island, a third row by the entrance
for (let x = 20; x <= 28; x++) {
  put('marking.bay', x, 1);
  put('marking.bay', x, 5);
  if (x >= 21) {
    put('marking.bay', x, 12);
  }
}
put('car.sedan.red', 20, 1, 'down');
put('car.hatch.white', 21, 1, 'up');
put('car.suv.green', 23, 1, 'up');
put('car.sedan.blue', 24, 1, 'down');
put('car.hatch.yellow', 26, 1, 'up');
put('car.sedan.red', 28, 1, 'up');
put('car.hatch.yellow', 20, 5, 'down');
put('car.sedan.blue', 22, 5, 'up');
put('car.suv.green', 25, 5, 'down');
put('car.hatch.white', 27, 5, 'down');
put('car.sedan.blue', 24, 3, 'left');
put('car.hatch.white', 20, 4, 'right');
put('car.suv.green', 22, 12, 'down');
put('car.hatch.yellow', 23, 12, 'up');
put('car.sedan.red', 27, 12, 'down');
put('tree.oak.a', 22, 11);
put('tree.maple', 27, 11);
put('bush.round.a', 20, 10);
put('bush.flowering', 25, 10);
put('bush.round.b', 28, 10);
put('lamp.street', 24, 11);
put('bikerack', 19, 14);
put('bollard', 23, 16);
put('bollard', 27, 16);
put('sign.post', 18, 16);
put('lamp.street', 18, 4);
put('bin.street', 18, 8);

// road
for (let x = 0; x < W; x++) {
  if (x < 8 || x > 10) {
    put('marking.lane', x, 17);
  } else {
    put('marking.crosswalk', x, 17);
    put('marking.crosswalk', x, 18);
  }
}
put('lamp.street', 4, 19);
put('lamp.street', 16, 19);
put('car.sedan.blue', 2, 18, 'right');
put('car.suv.green', 14, 17, 'left');

// standing / walking people
const walkers: { x: number; y: number; dir: Dir; pose: string; frame: number }[] = [
  { x: 9, y: 12, dir: 'up', pose: 'walk', frame: 1 },
  { x: 6, y: 9, dir: 'right', pose: 'walk', frame: 3 },
  { x: 13, y: 4, dir: 'down', pose: 'stand', frame: 0 },
  { x: 18, y: 11, dir: 'down', pose: 'walk', frame: 2 },
  { x: 22, y: 3, dir: 'up', pose: 'phone', frame: 0 },
  { x: 10, y: 16, dir: 'left', pose: 'walk', frame: 4 },
  { x: 3, y: 9, dir: 'right', pose: 'talk', frame: 0 },
];

// ---------------------------------------------------------------------------------------------------------
// Render

const bias = { topColors: [...CLOTH_COLORS], tops: [...TOP_STYLES], accessories: [...ACCESSORIES] };
let lookSeed = 5;
const person = (dir: Dir, pose: string, frame = 0) =>
  characterFrame(randomAppearance((lookSeed += 41), bias), dir, pose as never, frame);

interface Drawable {
  key: number;
  order: number;
  draw(ctx: CanvasRenderingContext2D): void;
}

function render(): { canvas: HTMLCanvasElement; semi: string[] } {
  const [c, ctx] = makeCanvas(W * TILE, H * TILE);
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const id = ground(tx, ty);
      const f = id ? floorDef(id) : undefined;
      if (!f) {
        continue;
      }
      ctx.save();
      ctx.translate(tx * TILE, ty * TILE);
      ctx.beginPath();
      ctx.rect(0, 0, TILE, TILE);
      ctx.clip();
      f.draw(ctx, tx, ty, { floorAt: (dx, dy) => ground(tx + dx, ty + dy), wallAt: () => false });
      ctx.restore();
    }
  }
  const semi: string[] = [];
  const list: Drawable[] = [];
  const lights: { x: number; y: number; l: Light }[] = [];
  let order = 0;
  // floor-layer markings go straight onto the ground; shadows next; then everything standing, depth sorted
  for (const it of items) {
    const v = variant(it.id, it.dir ?? 'down');
    if (!v) {
      semi.push(`missing ${it.id}`);
      continue;
    }
    const ox = it.x * TILE;
    const oy = it.y * TILE;
    const n = v.frames[0].reduce((s, p) => s + semiTransparentCount(p.canvas), 0);
    if (n) {
      semi.push(`${it.id} ${it.dir}: ${n} semi-transparent px`);
    }
    if (asset(it.id)?.layer === 'floor') {
      for (const p of v.frames[0]) {
        ctx.drawImage(p.canvas, ox + p.x, oy + p.y);
      }
      continue;
    }
    for (const l of v.lights ?? []) {
      lights.push({ x: ox + l.x, y: oy + l.y, l });
    }
    v.frames[0].forEach((p) => list.push({ key: oy + p.z, order: order++, draw: (g) => g.drawImage(p.canvas, ox + p.x, oy + p.y) }));
    if (it.use) {
      for (const s of v.spots.filter((sp) => sp.pose === 'sit')) {
        const fx = ox + s.dx * TILE + 16 + (s.px ?? 0);
        const fy = oy + s.dy * TILE + FOOT_Y + (s.py ?? 0);
        const img = person(s.facing, 'sit');
        list.push({ key: fy, order: order++, draw: (g) => g.drawImage(img, fx - CHAR_FOOT_X, fy - CHAR_FOOT_Y) });
      }
    }
  }
  ctx.fillStyle = SHADOW;
  for (const it of items) {
    const v = variant(it.id, it.dir ?? 'down');
    for (const s of v?.shadows ?? []) {
      ctx.beginPath();
      if (s.shape === 'ellipse') {
        ctx.ellipse(it.x * TILE + s.x + s.w / 2, it.y * TILE + s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
      } else {
        ctx.roundRect(it.x * TILE + s.x, it.y * TILE + s.y, s.w, s.h, 2);
      }
      ctx.fill();
    }
  }
  for (const w of walkers) {
    const fx = w.x * TILE + 16;
    const fy = w.y * TILE + FOOT_Y;
    const img = person(w.dir, w.pose, w.frame);
    list.push({
      key: fy,
      order: order++,
      draw: (g) => {
        g.fillStyle = SHADOW;
        g.beginPath();
        g.ellipse(fx + 1, fy, 7, 2.5, 0, 0, Math.PI * 2);
        g.fill();
        g.drawImage(img, fx - CHAR_FOOT_X, fy - CHAR_FOOT_Y);
      },
    });
  }
  list.sort((a, b) => a.key - b.key || a.order - b.order);
  for (const d of list) {
    d.draw(ctx);
  }
  if (NIGHT) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#4a5280';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'lighter';
    for (const { x, y, l } of lights) {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, l.radius);
      gr.addColorStop(0, `rgba(255,200,120,${l.intensity * 0.55})`);
      gr.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x - l.radius, y - l.radius, l.radius * 2, l.radius * 2);
    }
    ctx.restore();
  }
  return { canvas: c, semi };
}

function crop(src: HTMLCanvasElement, x: number, y: number, w: number, h: number, z: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w * z, h * z);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, x, y, w, h, 0, 0, w * z, h * z);
  return c;
}

const { canvas, semi } = render();
const views: Record<string, [number, number, number, number]> = {
  all: [0, 0, W, H],
  park: [0, 0, 18, 17],
  carpark: [17, 0, 13, 20],
};
const [vx, vy, vw, vh] = views[VIEW] ?? views.all;
const title = document.createElement('h2');
title.textContent = `Outdoor preview · ${VIEW}${NIGHT ? ' · night' : ''}`;
out.append(title);
if (semi.length) {
  const warn = document.createElement('div');
  warn.className = 'warn';
  warn.textContent = semi.join(' | ');
  out.append(warn);
}
const row = document.createElement('div');
row.className = 'row';
row.append(crop(canvas, vx * TILE, vy * TILE, vw * TILE, vh * TILE, ZOOM));
if (VIEW === 'all') {
  row.append(crop(canvas, 0, 0, W * TILE, H * TILE, 1));
}
out.append(row);
