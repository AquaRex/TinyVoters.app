/**
 * Living-spaces preview (livingPreview.html): a lounge corner, a kitchenette run and a restroom row composed
 * from the registered assets, depth-sorted like the engine, with seated and standing characters at the spots.
 * ?zoom=2|3 · ?night=1 darkens the room and adds the assets' warm/screen lights.
 */
import './art/index';
import { floor as floorDef, variant, wallStyle, asset } from './art/registry';
import { Dir, Light } from './art/types';
import { FOOT_Y, TILE, WALL_FACE_H, WALL_LINE } from './config';
import { SHADOW, makeCanvas } from './art/kit';
import { CHAR_FOOT_X, CHAR_FOOT_Y, characterFrame } from './render/characters';
import { randomAppearance } from './agents/appearance';
import { PROFESSIONS } from './agents/professions';

const params = new URLSearchParams(location.search);
const ZOOM = Math.max(1, Math.min(4, Number(params.get('zoom') ?? 2) | 0));
const NIGHT = params.get('night') === '1';
const out = document.getElementById('out')!;

interface Place {
  id: string;
  x: number;
  y: number;
  dir?: Dir;
  /** Put people on this item's spots. */
  people?: boolean;
}

interface Room {
  title: string;
  w: number;
  h: number;
  floor: string | ((x: number, y: number) => string);
  wall: string;
  items: Place[];
}

const ROOMS: Room[] = [
  {
    title: 'Lounge corner',
    w: 11,
    h: 8,
    floor: 'wood.oak',
    wall: 'wall.sage',
    items: [
      { id: 'rug.large.navy', x: 1, y: 2 },
      { id: 'mat.entrance', x: 8, y: 6 },
      { id: 'wall.art.wide', x: 1, y: 0 },
      { id: 'wall.sconce', x: 4, y: 0 },
      { id: 'wall.shelf.plants', x: 8, y: 0 },
      { id: 'plant.tall.monstera', x: 0, y: 1 },
      { id: 'sofa.3.sage', x: 1, y: 1, dir: 'down', people: true },
      { id: 'lamp.floor.brass', x: 4, y: 1 },
      { id: 'bookshelf.lounge', x: 5, y: 1, people: true },
      { id: 'plant.tall.fiddle', x: 7, y: 1 },
      { id: 'table.side', x: 0, y: 3 },
      { id: 'table.coffee.walnut', x: 2, y: 3 },
      { id: 'armchair.leather', x: 4, y: 3, dir: 'left', people: true },
      { id: 'beanbag.teal', x: 2, y: 5, dir: 'up', people: true },
      { id: 'armchair.mustard', x: 3, y: 5, dir: 'up' },
      { id: 'chair.cafe.oak', x: 7, y: 3, dir: 'right', people: true },
      { id: 'table.round.cafe', x: 8, y: 3 },
      { id: 'chair.cafe.oak', x: 9, y: 3, dir: 'left' },
      { id: 'lamp.floor.black', x: 10, y: 1 },
      { id: 'game.foosball', x: 6, y: 5, people: true },
      { id: 'coatrack', x: 10, y: 6 },
      { id: 'plant.small.a', x: 0, y: 6 },
    ],
  },
  {
    title: 'Kitchenette',
    w: 11,
    h: 8,
    floor: 'tile.kitchen',
    wall: 'wall.cream',
    items: [
      { id: 'counter.end.left', x: 0, y: 1 },
      { id: 'counter.coffee', x: 1, y: 1, people: true },
      { id: 'counter.sink', x: 2, y: 1 },
      { id: 'counter.plain', x: 3, y: 1 },
      { id: 'counter.microwave', x: 4, y: 1 },
      { id: 'counter.end.right', x: 5, y: 1 },
      { id: 'fridge', x: 6, y: 1 },
      { id: 'water.cooler', x: 7, y: 1, people: true },
      { id: 'vending', x: 8, y: 1 },
      { id: 'wall.art.botanical', x: 9, y: 0 },
      { id: 'plant.tall.palm', x: 10, y: 1 },
      { id: 'chair.dining.oak', x: 1, y: 4, dir: 'down', people: true },
      { id: 'chair.dining.oak', x: 2, y: 4, dir: 'down' },
      { id: 'table.dining.oak', x: 1, y: 5 },
      { id: 'chair.dining.oak', x: 1, y: 6, dir: 'up', people: true },
      { id: 'chair.dining.oak', x: 2, y: 6, dir: 'up' },
      { id: 'stool.bar', x: 6, y: 3, dir: 'down', people: true },
      { id: 'stool.bar', x: 7, y: 3, dir: 'down' },
      { id: 'table.bar.oak', x: 6, y: 4 },
      { id: 'stool.bar', x: 6, y: 5, dir: 'up' },
      { id: 'stool.bar', x: 7, y: 5, dir: 'up', people: true },
      { id: 'bin.office', x: 10, y: 5 },
      { id: 'plant.small.b', x: 4, y: 6 },
    ],
  },
  {
    title: 'Restroom',
    w: 8,
    h: 5,
    floor: 'tile.restroom',
    wall: 'wall.tile',
    items: [
      { id: 'toilet.stall', x: 1, y: 1, people: true },
      { id: 'toilet.stall', x: 2, y: 1 },
      { id: 'toilet.stall', x: 3, y: 1 },
      { id: 'sink.vanity', x: 5, y: 1, people: true },
      { id: 'sink.vanity', x: 6, y: 1 },
      { id: 'wall.dryer', x: 7, y: 0 },
      { id: 'bin.office', x: 7, y: 1 },
      { id: 'plant.small.b', x: 0, y: 1 },
      { id: 'plant.small.a', x: 7, y: 4 },
    ],
  },
];

interface Drawable {
  key: number;
  order: number;
  draw(g: CanvasRenderingContext2D): void;
}

/** Interior horizontal wall on row 0: the line sits centred in its tile, the face hangs to its south edge. */
const LINE_TOP = (TILE - WALL_LINE) / 2;
const FACE_BOTTOM = LINE_TOP + WALL_LINE;

function renderRoom(room: Room): HTMLCanvasElement {
  const top = WALL_FACE_H;
  const [c, ctx] = makeCanvas(room.w * TILE, room.h * TILE + top);
  ctx.translate(0, top);
  const floorId = (x: number, y: number) => (typeof room.floor === 'string' ? room.floor : room.floor(x, y));
  for (let ty = 0; ty < room.h; ty++) {
    for (let tx = 0; tx < room.w; tx++) {
      const f = floorDef(floorId(tx, ty)) ?? floorDef('wood.oak');
      if (!f) {
        continue;
      }
      ctx.save();
      ctx.translate(tx * TILE, ty * TILE);
      ctx.beginPath();
      ctx.rect(0, 0, TILE, TILE);
      ctx.clip();
      f.draw(ctx, tx + 7, ty + 3, { floorAt: () => f.id, wallAt: (_dx, dy) => ty + dy <= 0 });
      ctx.restore();
    }
  }
  const items: Drawable[] = [];
  const style = wallStyle(room.wall) ?? wallStyle('wall.cream');
  if (style) {
    items.push({
      key: FACE_BOTTOM,
      order: 0,
      draw: (g) => {
        for (let x = 0; x < room.w * TILE; x++) {
          style.faceSlice(g, x, FACE_BOTTOM - WALL_FACE_H, x, null);
        }
        g.fillStyle = style.cap.edge;
        g.fillRect(0, LINE_TOP - WALL_FACE_H, room.w * TILE, WALL_LINE);
        g.fillStyle = style.cap.fill;
        g.fillRect(0, LINE_TOP - WALL_FACE_H + 1, room.w * TILE, WALL_LINE - 2);
        g.fillStyle = style.cap.highlight;
        g.fillRect(0, LINE_TOP - WALL_FACE_H + 1, room.w * TILE, 1);
      },
    });
  }
  const lights: Light[] = [];
  let seed = 11;
  for (const it of room.items) {
    const def = asset(it.id);
    const v = def && variant(it.id, it.dir ?? def.facings[0]);
    if (!def || !v) {
      continue;
    }
    const ox = it.x * TILE;
    const oy = it.y * TILE + (def.layer === 'wall' ? FACE_BOTTOM - TILE : 0);
    for (const l of v.lights ?? []) {
      lights.push({ ...l, x: ox + l.x, y: oy + l.y });
    }
    if (def.layer === 'floor') {
      for (const p of v.frames[0]) {
        ctx.drawImage(p.canvas, ox + p.x, oy + p.y);
      }
      continue;
    }
    ctx.fillStyle = SHADOW;
    for (const s of v.shadows ?? []) {
      ctx.beginPath();
      if (s.shape === 'ellipse') {
        ctx.ellipse(ox + s.x + s.w / 2, oy + s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
      } else {
        ctx.roundRect(ox + s.x, oy + s.y, s.w, s.h, 2);
      }
      ctx.fill();
    }
    v.frames[0].forEach((p, i) =>
      items.push({
        key: def.layer === 'wall' ? FACE_BOTTOM + 0.5 : oy + p.z,
        order: i + 1,
        draw: (g) => g.drawImage(p.canvas, ox + p.x, oy + p.y),
      }),
    );
    if (it.people) {
      v.spots.forEach((s, i) => {
        if (s.pose === 'stand' && i > 0) {
          return;
        }
        const fx = ox + s.dx * TILE + 16 + (s.px ?? 0);
        const fy = it.y * TILE + s.dy * TILE + FOOT_Y + (s.py ?? 0);
        const img = characterFrame(randomAppearance((seed += 37), PROFESSIONS[seed % PROFESSIONS.length].look), s.facing, s.pose === 'sit' ? 'sit' : 'stand', 0);
        items.push({ key: fy, order: 100, draw: (g) => g.drawImage(img, fx - CHAR_FOOT_X, fy - CHAR_FOOT_Y) });
      });
    }
  }
  items.sort((a, b) => a.key - b.key || a.order - b.order);
  for (const it of items) {
    it.draw(ctx);
  }
  if (NIGHT) {
    ctx.fillStyle = 'rgba(18,16,40,0.55)';
    ctx.fillRect(0, -top, c.width, c.height);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.radius);
      g.addColorStop(0, hexA(l.color, l.intensity * 0.55));
      g.addColorStop(1, hexA(l.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(l.x - l.radius, l.y - l.radius, l.radius * 2, l.radius * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  return c;
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function scaled(src: HTMLCanvasElement, z: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(src.width * z, src.height * z);
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

for (const room of ROOMS) {
  const h = document.createElement('h2');
  h.textContent = room.title;
  const row = document.createElement('div');
  row.className = 'row';
  const scene = renderRoom(room);
  row.append(scaled(scene, ZOOM), scene);
  out.append(h, row);
}
