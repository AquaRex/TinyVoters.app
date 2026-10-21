/**
 * Tileset preview (tiles.html): a small building with every floor, wall style and structure piece placed
 * the way a level would use them, drawn with the engine's own wall geometry and depth keys.
 * Query params: ?ext=brick|render  ?open=0..1 (door/elevator frames)  ?zoom=1..4  ?crop=x,y,w,h (tiles)
 */
import './art/index';
import { asset, variant } from './art/registry';
import { Part } from './art/types';
import { TILE } from './config';
import { LayoutBuilder } from './world/builder';
import { Office } from './world/office';
import { buildWallSprite, underWallRegions, wallGeom, WallGeom } from './render/walls';
import { drawFloorTile, fillShadow } from './render/floorLayer';
import { makeCanvas, navy, skinA, walnut, SHADOW } from './art/kit';

const params = new URLSearchParams(location.search);
const EXT = params.get('ext') === 'render' ? 'render' : 'brick';
const OPEN = Math.max(0, Math.min(1, Number(params.get('open') ?? 0)));
const ZOOM = Math.max(1, Math.min(6, Number(params.get('zoom') ?? 1) | 0));
const CROP = params.get('crop')?.split(',').map(Number);
const GLASS_ALPHA = Number(params.get('ga') ?? 0.62);
const FACE_H = 40;

function level(): LayoutBuilder {
  const b = new LayoutBuilder(30, 26, 'grass');
  // building (2nd floor)
  b.fill(2, 2, 9, 6, 'carpet.slate').fill(2, 8, 9, 12, 'carpet.teal');
  b.fill(11, 2, 18, 6, 'wood.walnut').fill(11, 8, 18, 12, 'tile.terrazzo');
  b.fill(20, 2, 27, 6, 'tile.kitchen').fill(20, 8, 27, 12, 'tile.restroom');
  b.fill(10, 2, 10, 12, 'carpet.warmgrey').fill(19, 2, 19, 12, 'wood.oak').fill(2, 7, 27, 7, 'wood.oak');
  b.fill(1, 1, 28, 1, 'wood.oak').fill(1, 13, 28, 13, 'wood.oak').fill(1, 1, 1, 13, 'wood.oak').fill(28, 1, 28, 13, 'wood.oak');
  b.wall(1, 1, 9, 1, 'wall.cream').wall(10, 1, 18, 1, 'wall.terracotta').wall(19, 1, 28, 1, 'wall.wood');
  b.wall(1, 1, 1, 13, `wall.${EXT}`).wall(28, 1, 28, 13, `wall.${EXT}`).wall(1, 13, 28, 13, `wall.${EXT}`);
  b.wall(10, 2, 10, 12, 'wall.cream').wall(19, 2, 19, 12, 'wall.cream');
  b.wall(2, 7, 9, 7, 'wall.glass').wall(11, 7, 18, 7, 'wall.sage').wall(20, 7, 27, 7, 'wall.tile');
  b.wall(5, 7, 5, 7, null).wall(16, 7, 16, 7, null).wall(25, 7, 25, 7, null).wall(10, 10, 10, 10, null).wall(19, 4, 19, 4, null);
  b.put('door.glass', 5, 7).put('door.oak', 16, 7).put('door.oak', 25, 7).put('door.oak', 10, 10, 'left').put('door.glass', 19, 4, 'left');
  b.put('elevator', 12, 8).put('stairs', 12, 2);
  b.put('wall.window', 3, 1).put('wall.window', 6, 1).put('wall.window.small', 15, 1).put('wall.window', 22, 1).put('wall.window.small', 26, 1);

  // façade band, sidewalk, plaza, street, park
  b.fill(0, 14, 29, 17, 'paving.stone');
  b.fill(11, 17, 18, 18, 'paving.brick');
  b.put(`facade.corner.left.${EXT}`, 1, 14).put(`facade.corner.right.${EXT}`, 28, 14);
  for (let x = 2; x < 28; x++) {
    if (x === 14) {
      b.put(`facade.entrance.${EXT}`, 14, 14);
      x++;
      continue;
    }
    b.put(x % 3 === 0 ? `facade.wall.${EXT}` : `facade.window.${EXT}`, x, 14);
  }
  b.fill(0, 19, 29, 21, 'asphalt');
  b.fill(0, 18, 10, 18, 'paving.stone').fill(19, 18, 29, 18, 'paving.stone');
  b.fill(5, 22, 6, 25, 'path.gravel').fill(7, 24, 12, 25, 'path.gravel');
  b.fill(13, 22, 17, 25, 'grass.meadow').fill(24, 22, 29, 25, 'grass.meadow');
  b.fill(18, 23, 22, 25, 'water').fill(19, 22, 21, 22, 'water');
  return b;
}

interface Item {
  key: number;
  order: number;
  draw(g: CanvasRenderingContext2D): void;
}

function person(seed: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(32, 48);
  const shirt = seed % 2 ? navy[3] : '#8f442b';
  g.fillStyle = walnut[1];
  g.fillRect(9, 4, 14, 13);
  g.fillStyle = skinA[2];
  g.fillRect(10, 8, 12, 10);
  g.fillStyle = shirt;
  g.fillRect(9, 18, 14, 14);
  g.fillStyle = navy[1];
  g.fillRect(10, 32, 5, 13);
  g.fillRect(17, 32, 5, 13);
  return c;
}

function render(): HTMLCanvasElement {
  const layout = level().layout;
  const office = new Office(layout);
  const W = layout.w * TILE;
  const top = FACE_H + 16;
  const [c, ctx] = makeCanvas(W, layout.h * TILE + top);
  ctx.fillStyle = '#1f1a24';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(0, top);

  const geoms = new Map<number, WallGeom>();
  for (let y = 0; y < layout.h; y++) {
    for (let x = 0; x < layout.w; x++) {
      if (office.wallAt(x, y)) {
        geoms.set(y * layout.w + x, wallGeom(office, x, y));
      }
    }
  }
  const geomAt = (x: number, y: number) => geoms.get(y * layout.w + x);

  // floors
  for (let y = 0; y < layout.h; y++) {
    for (let x = 0; x < layout.w; x++) {
      const own = office.floorAt(x, y);
      if (!own) {
        continue;
      }
      const g = geomAt(x, y);
      if (!g) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x * TILE, y * TILE, TILE, TILE);
        ctx.clip();
        drawFloorTile(ctx, office, own, x, y, x * TILE, y * TILE);
        ctx.restore();
        continue;
      }
      for (const [rx, ry, rw, rh, id] of underWallRegions(office, g)) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x * TILE + rx, y * TILE + ry, rw, rh);
        ctx.clip();
        drawFloorTile(ctx, office, id, x, y, x * TILE, y * TILE);
        ctx.restore();
      }
    }
  }

  const items: Item[] = [];
  for (const g of geoms.values()) {
    const sp = buildWallSprite(office, g, geomAt);
    const x = g.x * TILE;
    const y = g.y * TILE - FACE_H;
    items.push({
      key: g.key,
      order: 0,
      draw: (d) => {
        if (sp.face) {
          d.drawImage(sp.face, x, y);
        }
        if (sp.glass) {
          d.globalAlpha = GLASS_ALPHA;
          d.drawImage(sp.glass, x, y);
          d.globalAlpha = 1;
        }
        d.drawImage(sp.cap, x, y);
      },
    });
  }

  ctx.fillStyle = SHADOW;
  let seed = 1;
  for (const it of layout.items) {
    const def = asset(it.type);
    const v = def && variant(it.type, it.dir);
    if (!def || !v) {
      console.warn('missing asset', it.type);
      continue;
    }
    const ox = it.x * TILE;
    let oy = it.y * TILE;
    let after: number | null = null;
    if (def.layer === 'wall') {
      const g = geomAt(it.x, it.y + v.h - 1);
      oy += g ? g.faceBottom - TILE : 0;
      after = Math.max(...Array.from({ length: v.w }, (_, i) => geomAt(it.x + i, it.y + v.h - 1)?.key ?? 0)) + 0.5;
    }
    for (const s of v.shadows ?? []) {
      fillShadow(ctx, s, ox, oy);
    }
    const frame: Part[] = v.frames[v.anim ? Math.round(OPEN * (v.frames.length - 1)) : 0] ?? [];
    frame.forEach((p, i) => items.push({ key: after ?? it.y * TILE + p.z, order: i + 1, draw: (d) => d.drawImage(p.canvas, ox + p.x, oy + p.y) }));
    for (const s of v.spots) {
      if (s.pose !== 'stand') {
        continue;
      }
      const fx = (it.x + s.dx) * TILE + 16 + (s.px ?? 0);
      const fy = (it.y + s.dy) * TILE + 26 + (s.py ?? 0);
      const img = person(seed++);
      items.push({ key: fy, order: 50, draw: (d) => d.drawImage(img, fx - 16, fy - 45) });
    }
  }
  for (const [tx, ty] of [[16, 8], [10, 10], [5, 8], [24, 18], [7, 23]]) {
    const img = person(seed++);
    const fx = tx * TILE + 16;
    const fy = ty * TILE + 26;
    items.push({ key: fy, order: 50, draw: (d) => d.drawImage(img, fx - 16, fy - 45) });
  }
  items.sort((a, b) => a.key - b.key || a.order - b.order);
  for (const it of items) {
    it.draw(ctx);
  }
  return c;
}

const full = render();
let shown = full;
if (CROP && CROP.length === 4) {
  const [cx, cy, cw, ch] = CROP;
  const [c, g] = makeCanvas(cw * TILE, ch * TILE);
  g.drawImage(full, -cx * TILE, -cy * TILE - (FACE_H + 16));
  shown = c;
}
const [big, bg] = makeCanvas(shown.width * ZOOM, shown.height * ZOOM);
bg.imageSmoothingEnabled = false;
bg.drawImage(shown, 0, 0, big.width, big.height);
document.getElementById('out')!.append(big);
