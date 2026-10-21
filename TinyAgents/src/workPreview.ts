/**
 * Work / meeting furniture preview (workPreview.html): small rooms rendered with engine-style depth sorting and
 * real seated characters, plus a seat test grid. ?section=office|meeting|seats|desks ?zoom=3 ?pose=sit
 */
import './art/index';
import { asset, floor as floorDef, variant, wallStyle } from './art/registry';
import { Dir, Part } from './art/types';
import { FOOT_Y, TILE, WALL_FACE_H, WALL_LINE } from './config';
import { SHADOW, makeCanvas, semiTransparentCount } from './art/kit';
import { characterFrame, CHAR_FOOT_X, CHAR_FOOT_Y } from './render/characters';
import { ACCESSORIES, CLOTH_COLORS, TOP_STYLES, randomAppearance } from './agents/appearance';

const params = new URLSearchParams(location.search);
const ZOOM = Number(params.get('zoom') ?? 3) | 0 || 3;
const SECTION = params.get('section');
const SIT_POSE = params.get('pose') ?? 'sit';
const out = document.getElementById('out')!;

const bias = { topColors: [...CLOTH_COLORS], tops: [...TOP_STYLES], accessories: [...ACCESSORIES] };
let lookSeed = 11;
const person = (dir: Dir, pose: string) => characterFrame(randomAppearance((lookSeed += 37), bias), dir, pose as never, 0);

interface Place {
  id: string;
  x: number;
  y: number;
  dir?: Dir;
  /** Seat or stand people at the asset's spots. */
  use?: boolean;
}

interface Drawable {
  key: number;
  order: number;
  draw(g: CanvasRenderingContext2D): void;
}

const LINE_BOTTOM = 12 + WALL_LINE;

function render(W: number, H: number, floorAt: (x: number, y: number) => string, items: Place[], wallId = 'wall.cream'): HTMLCanvasElement {
  const top = WALL_FACE_H;
  const [c, ctx] = makeCanvas(W * TILE, H * TILE + top);
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const f = floorDef(floorAt(tx, ty));
      if (!f) {
        continue;
      }
      ctx.save();
      ctx.translate(tx * TILE, ty * TILE + top);
      ctx.beginPath();
      ctx.rect(0, 0, TILE, TILE);
      ctx.clip();
      f.draw(ctx, tx + 7, ty + 3, { floorAt: () => f.id, wallAt: (_dx, dy) => ty + dy <= 0 });
      ctx.restore();
    }
  }
  ctx.translate(0, top);
  const list: Drawable[] = [];
  const style = wallStyle(wallId);
  if (style) {
    list.push({
      key: LINE_BOTTOM,
      order: 0,
      draw: (g) => {
        for (let x = 0; x < W * TILE; x++) {
          style.faceSlice(g, x, LINE_BOTTOM - WALL_FACE_H, x, null);
        }
        g.fillStyle = style.cap.edge;
        g.fillRect(0, 12 - WALL_FACE_H, W * TILE, WALL_LINE);
        g.fillStyle = style.cap.fill;
        g.fillRect(0, 13 - WALL_FACE_H, W * TILE, WALL_LINE - 2);
        g.fillStyle = style.cap.highlight;
        g.fillRect(0, 13 - WALL_FACE_H, W * TILE, 1);
      },
    });
  }
  const hostKey = new Map<string, number>();
  const ordered = [...items].sort((a, b) => layerRank(a.id) - layerRank(b.id));
  ctx.fillStyle = SHADOW;
  let order = 1;
  for (const it of ordered) {
    const def = asset(it.id);
    if (!def) {
      console.warn('missing', it.id);
      continue;
    }
    const v = variant(it.id, it.dir ?? def.facings[0])!;
    const ox = it.x * TILE;
    const oy = it.y * TILE + (def.layer === 'wall' ? LINE_BOTTOM - TILE : 0);
    for (const s of v.shadows ?? []) {
      ctx.beginPath();
      if (s.shape === 'ellipse') {
        ctx.ellipse(ox + s.x + s.w / 2, oy + s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
      } else {
        ctx.roundRect(ox + s.x, oy + s.y, s.w, s.h, 2);
      }
      ctx.fill();
    }
    const frame: Part[] = v.frames[0];
    let maxKey = 0;
    for (const p of frame) {
      let key = oy + p.z;
      if (def.layer === 'wall') {
        key = LINE_BOTTOM + 0.5;
      } else if (def.layer === 'surface') {
        key = (hostKey.get(`${it.x},${it.y}`) ?? oy + TILE) + 0.25;
      }
      maxKey = Math.max(maxKey, key);
      list.push({ key, order: order++, draw: (g) => g.drawImage(p.canvas, ox + p.x, oy + p.y) });
    }
    if (def.layer === 'object') {
      for (let dy = 0; dy < v.h; dy++) {
        for (let dx = 0; dx < v.w; dx++) {
          hostKey.set(`${it.x + dx},${it.y + dy}`, maxKey);
        }
      }
    }
    if (it.use) {
      for (const s of v.spots) {
        const fx = ox + s.dx * TILE + 16 + (s.px ?? 0);
        const fy = it.y * TILE + s.dy * TILE + FOOT_Y + (s.py ?? 0);
        const img = person(s.facing, s.pose === 'sit' ? SIT_POSE : s.activity === 'read' ? 'read' : 'stand');
        list.push({ key: fy, order: 10000 + order++, draw: (g) => g.drawImage(img, fx - CHAR_FOOT_X, fy - CHAR_FOOT_Y) });
      }
    }
  }
  list.sort((a, b) => a.key - b.key || a.order - b.order);
  for (const d of list) {
    d.draw(ctx);
  }
  return c;
}

function layerRank(id: string): number {
  const l = asset(id)?.layer;
  return l === 'floor' ? 0 : l === 'object' ? 1 : l === 'surface' ? 2 : 3;
}

function scaled(src: HTMLCanvasElement, z: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(src.width * z, src.height * z);
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function show(title: string, c: HTMLCanvasElement): void {
  const h = document.createElement('h2');
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'row';
  row.append(scaled(c, ZOOM), c);
  out.append(h, row);
}

function officeRoom(): void {
  const items: Place[] = [
    { id: 'wall.clock', x: 5, y: 0 },
    { id: 'wall.corkboard', x: 1, y: 0 },
    { id: 'wall.whiteboard', x: 7, y: 0 },
    { id: 'wall.tv', x: 10, y: 0 },
    { id: 'bookshelf.oak', x: 0, y: 1, dir: 'down', use: true },
    { id: 'cabinet.filing', x: 2, y: 1 },
    { id: 'surface.plant', x: 2, y: 1 },
    { id: 'printer', x: 3, y: 1, use: true },
    { id: 'bookshelf.walnut', x: 12, y: 1, dir: 'left' },
    { id: 'whiteboard.stand', x: 7, y: 1, use: true },
    // back-to-back pod
    { id: 'chair.office.charcoal', x: 1, y: 3, dir: 'down', use: true },
    { id: 'chair.office.teal', x: 3, y: 3, dir: 'down', use: true },
    { id: 'desk.oak.monitor', x: 1, y: 4, dir: 'down' },
    { id: 'desk.oak.dual', x: 3, y: 4, dir: 'down' },
    { id: 'desk.walnut.monitor', x: 1, y: 5, dir: 'up' },
    { id: 'desk.white.monitor', x: 3, y: 5, dir: 'up' },
    { id: 'chair.office.mustard', x: 1, y: 6, dir: 'up', use: true },
    { id: 'chair.office.charcoal', x: 3, y: 6, dir: 'up', use: true },
    { id: 'divider.planter', x: 5, y: 4, dir: 'left' },
    // side desks
    { id: 'chair.office.teal', x: 6, y: 4, dir: 'right', use: true },
    { id: 'desk.oak.laptop', x: 7, y: 4, dir: 'right' },
    { id: 'desk.oak.monitor', x: 8, y: 4, dir: 'left' },
    { id: 'chair.office.mustard', x: 9, y: 4, dir: 'left', use: true },
    { id: 'surface.lamp', x: 8, y: 5 },
    { id: 'divider.planter', x: 6, y: 7, dir: 'down' },
    { id: 'reception.desk', x: 9, y: 6, use: true },
    { id: 'chair.office.charcoal', x: 11, y: 3, dir: 'down' },
  ];
  show('Office', render(13, 9, () => 'carpet.teal', items));
}

function meetingRoom(): void {
  const items: Place[] = [
    { id: 'wall.tv', x: 3, y: 0 },
    { id: 'wall.clock', x: 7, y: 0 },
    { id: 'wall.whiteboard', x: 9, y: 0 },
    { id: 'table.meeting.walnut.8', x: 2, y: 3 },
    { id: 'surface.conference', x: 3, y: 3 },
    { id: 'surface.mug', x: 4, y: 4 },
    { id: 'chair.meeting.grey', x: 2, y: 2, dir: 'down', use: true },
    { id: 'chair.meeting.grey', x: 3, y: 2, dir: 'down', use: true },
    { id: 'chair.meeting.grey', x: 4, y: 2, dir: 'down' },
    { id: 'chair.meeting.grey', x: 5, y: 2, dir: 'down', use: true },
    { id: 'chair.meeting.grey', x: 2, y: 5, dir: 'up', use: true },
    { id: 'chair.meeting.grey', x: 3, y: 5, dir: 'up' },
    { id: 'chair.meeting.grey', x: 4, y: 5, dir: 'up', use: true },
    { id: 'chair.meeting.grey', x: 5, y: 5, dir: 'up', use: true },
    { id: 'chair.meeting.teal', x: 1, y: 3, dir: 'right', use: true },
    { id: 'chair.meeting.teal', x: 6, y: 4, dir: 'left', use: true },
    { id: 'table.meeting.oak.4', x: 9, y: 3 },
    { id: 'surface.books', x: 9, y: 4 },
    { id: 'surface.phone', x: 10, y: 3 },
    { id: 'chair.meeting.teal', x: 9, y: 2, dir: 'down', use: true },
    { id: 'chair.meeting.teal', x: 10, y: 2, dir: 'down' },
    { id: 'chair.meeting.teal', x: 9, y: 5, dir: 'up' },
    { id: 'chair.meeting.teal', x: 10, y: 5, dir: 'up', use: true },
    { id: 'chair.meeting.grey', x: 8, y: 4, dir: 'right' },
    { id: 'chair.meeting.grey', x: 11, y: 3, dir: 'left', use: true },
    { id: 'table.meeting.oak.8', x: 2, y: 7 },
    { id: 'surface.mug', x: 5, y: 7 },
  ];
  show('Meeting', render(13, 10, () => 'carpet.slate', items));
}

function seats(): void {
  const ids = ['chair.office.charcoal', 'chair.office.teal', 'chair.office.mustard', 'chair.meeting.grey', 'chair.meeting.teal'];
  const dirs: Dir[] = ['down', 'up', 'left', 'right'];
  const items: Place[] = [];
  ids.forEach((id, i) => dirs.forEach((d, j) => items.push({ id, x: j * 2 + 1, y: i * 2 + 1, dir: d, use: true })));
  ids.forEach((id, i) => dirs.forEach((d, j) => items.push({ id, x: j * 2 + 10, y: i * 2 + 1, dir: d })));
  show('Seats', render(18, 11, () => 'wood.oak', items, ''));
}

function desks(): void {
  const ids = ['desk.oak.monitor', 'desk.oak.dual', 'desk.oak.laptop', 'desk.walnut.monitor', 'desk.white.monitor'];
  const items: Place[] = [];
  ids.forEach((id, i) => {
    const x = i * 6 + 1;
    items.push({ id: 'chair.office.charcoal', x, y: 1, dir: 'down', use: true }, { id, x, y: 2, dir: 'down' });
    items.push({ id, x, y: 4, dir: 'up' }, { id: 'chair.office.teal', x, y: 5, dir: 'up', use: true });
    items.push({ id: 'chair.office.mustard', x, y: 7, dir: 'right', use: true }, { id, x: x + 1, y: 7, dir: 'right' });
    items.push({ id, x: x + 3, y: 7, dir: 'left' }, { id: 'chair.office.charcoal', x: x + 4, y: 7, dir: 'left', use: true });
  });
  show('Desks', render(30, 10, () => 'carpet.warmgrey', items, ''));
}

function audit(): void {
  const bad: string[] = [];
  for (const id of AUDIT_IDS) {
    const def = asset(id);
    if (!def) {
      bad.push(`missing ${id}`);
      continue;
    }
    for (const f of def.facings) {
      const v = variant(id, f)!;
      const n = v.frames.flat().reduce((s, p) => s + semiTransparentCount(p.canvas), 0);
      if (n) {
        bad.push(`${id} ${f}: ${n} semi-transparent px`);
      }
    }
  }
  const p = document.createElement('p');
  p.className = bad.length ? 'warn' : '';
  p.textContent = bad.length ? bad.join(' | ') : `audit ok: ${AUDIT_IDS.length} ids`;
  out.append(p);
}

const AUDIT_IDS = [
  'desk.oak.monitor', 'desk.oak.dual', 'desk.oak.laptop', 'desk.walnut.monitor', 'desk.white.monitor',
  'chair.office.charcoal', 'chair.office.teal', 'chair.office.mustard', 'bookshelf.oak', 'bookshelf.walnut',
  'cabinet.filing', 'printer', 'whiteboard.stand', 'reception.desk', 'divider.planter', 'surface.mug', 'surface.plant',
  'surface.lamp', 'surface.books', 'surface.phone', 'wall.tv', 'wall.whiteboard', 'wall.corkboard', 'wall.clock',
  'table.meeting.oak.4', 'table.meeting.oak.8', 'table.meeting.walnut.8', 'chair.meeting.grey', 'chair.meeting.teal',
  'surface.conference',
];

audit();
const sections: Record<string, () => void> = { office: officeRoom, meeting: meetingRoom, seats, desks };
for (const [name, fn] of Object.entries(sections)) {
  if (!SECTION || SECTION === name) {
    try {
      fn();
    } catch (e) {
      const p = document.createElement('pre');
      p.className = 'warn';
      p.textContent = `${name}: ${(e as Error).stack}`;
      out.append(p);
    }
  }
}
