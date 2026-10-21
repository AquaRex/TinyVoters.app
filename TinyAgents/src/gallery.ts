/**
 * Asset gallery (gallery.html). Shows every registered asset, floor and wall style at 1x and a chosen zoom,
 * on a neutral swatch and on a sample floor with seated mannequins, so artists can judge layering,
 * repetition and quality. Query params: ?section=scene|assets|floors|walls|characters ?category= ?id= ?zoom=
 * ?floor=<floor id> ?sitters=0
 */
import './art/index';
import { allAssets, allFloors, allWallStyles, floor as floorDef, variant } from './art/registry';
import { AssetDef, Dir, FloorDef, Part, Variant, WallStyleDef } from './art/types';
import { FOOT_Y, TILE, WALL_FACE_H, WALL_LINE } from './config';
import { SHADOW, canvasPen, makeCanvas, mat, navy, selOut, semiTransparentCount, skinA, walnut } from './art/kit';

const params = new URLSearchParams(location.search);
const ZOOM = Math.max(1, Math.min(8, Number(params.get('zoom') ?? 3) | 0));
const SECTION = params.get('section');
const CATEGORY = params.get('category');
const ONLY_ID = params.get('id');
const SITTERS = params.get('sitters') !== '0';
const SWATCH = '#8f8880';

const out = document.getElementById('out')!;
const nav = document.getElementById('nav')!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) {
    e.className = cls;
  }
  if (text) {
    e.textContent = text;
  }
  return e;
}

function link(label: string, set: Record<string, string | null>): HTMLAnchorElement {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(set)) {
    if (v === null) {
      q.delete(k);
    } else {
      q.set(k, v);
    }
  }
  const a = el('a', undefined, label);
  a.href = `?${q.toString()}`;
  const active = Object.entries(set).every(([k, v]) => params.get(k) === v);
  if (active) {
    a.classList.add('on');
  }
  return a;
}

function buildNav(): void {
  nav.append(el('b', undefined, 'Tiny Agents gallery'));
  nav.append(link('all', { section: null, category: null, id: null }));
  for (const s of ['scene', 'assets', 'floors', 'walls', 'characters']) {
    nav.append(link(s, { section: s, category: null, id: null }));
  }
  const cats = [...new Set(allAssets().map((a) => a.category))];
  for (const c of cats) {
    nav.append(link(c, { section: 'assets', category: c, id: null }));
  }
  for (const z of [1, 2, 3, 4]) {
    nav.append(link(`${z}x`, { zoom: String(z) }));
  }
}

/** Nearest-neighbour upscale. */
function scaled(src: HTMLCanvasElement, z: number): HTMLCanvasElement {
  if (z === 1) {
    return src;
  }
  const [c, ctx] = makeCanvas(src.width * z, src.height * z);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function sampleFloorFor(def: AssetDef): FloorDef | undefined {
  const wanted = params.get('floor') ?? (def.category === 'Outdoor' || def.category === 'Vehicles' ? 'grass' : 'wood.oak');
  return floorDef(wanted) ?? allFloors()[0];
}

/** Paints floor tiles over a canvas area whose top-left is world px (wx, wy). */
function paintFloor(ctx: CanvasRenderingContext2D, f: FloorDef, wx: number, wy: number, w: number, h: number, isWall = (_x: number, _y: number) => false): void {
  const tx0 = Math.floor(wx / TILE);
  const ty0 = Math.floor(wy / TILE);
  const tx1 = Math.floor((wx + w - 1) / TILE);
  const ty1 = Math.floor((wy + h - 1) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      ctx.save();
      ctx.translate(tx * TILE - wx, ty * TILE - wy);
      ctx.beginPath();
      ctx.rect(0, 0, TILE, TILE);
      ctx.clip();
      f.draw(ctx, tx, ty, {
        floorAt: () => f.id,
        wallAt: (dx, dy) => isWall(tx + dx, ty + dy),
      });
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Seated mannequin (stand-in until src/render/characters.ts provides characterFrame)

type FrameFn = (dir: Dir, seed: number) => HTMLCanvasElement;
let sitterFrame: FrameFn = mannequin;
let charFoot: [number, number] = [16, 45];

function mannequin(dir: Dir): HTMLCanvasElement {
  const p = canvasPen(32, 48);
  const top = mat(navy);
  const skin = skinA;
  const hair = mat(walnut);
  const flip = dir === 'right';
  const d: Dir = flip ? 'left' : dir;
  const hipY = 45 - 8;
  if (d === 'down') {
    p.rect(11, hipY - 1, 10, 5, '#3b4966');
    p.rect(12, hipY + 4, 3, 4, '#2c374f');
    p.rect(17, hipY + 4, 3, 4, '#2c374f');
    p.rect(11, hipY + 7, 4, 2, '#24160f');
    p.rect(17, hipY + 7, 4, 2, '#24160f');
    p.rrect(9, hipY - 14, 14, 14, 2, top.base);
    p.rect(10, hipY - 13, 4, 6, top.light);
    p.rect(8, hipY - 12, 3, 9, top.dark);
    p.rect(21, hipY - 12, 3, 9, top.dark);
    p.rect(8, hipY - 4, 3, 2, skin[2]);
    p.rect(21, hipY - 4, 3, 2, skin[2]);
    p.rrect(9, hipY - 28, 14, 14, 3, skin[2]);
    p.rect(10, hipY - 27, 6, 4, skin[3]);
    p.rrect(8, hipY - 30, 16, 7, 2, hair.base);
    p.rect(8, hipY - 24, 2, 5, hair.base);
    p.rect(22, hipY - 24, 2, 5, hair.base);
    p.rect(12, hipY - 20, 2, 3, '#2a2030');
    p.rect(18, hipY - 20, 2, 3, '#2a2030');
    p.px(12, hipY - 20, '#fbf5e9');
    p.px(18, hipY - 20, '#fbf5e9');
  } else if (d === 'up') {
    p.rrect(9, hipY - 14, 14, 15, 2, top.base);
    p.rect(10, hipY - 13, 4, 6, top.light);
    p.rect(8, hipY - 12, 3, 9, top.dark);
    p.rect(21, hipY - 12, 3, 9, top.dark);
    p.rrect(9, hipY - 28, 14, 14, 3, skin[2]);
    p.rrect(8, hipY - 30, 16, 15, 3, hair.base);
    p.rect(10, hipY - 28, 6, 3, hair.light);
  } else {
    p.rect(8, hipY - 1, 11, 4, '#3b4966');
    p.rect(7, hipY + 2, 4, 6, '#2c374f');
    p.rect(5, hipY + 7, 6, 2, '#24160f');
    p.rrect(11, hipY - 14, 10, 14, 2, top.base);
    p.rect(12, hipY - 13, 3, 6, top.light);
    p.rect(11, hipY - 10, 4, 8, top.dark);
    p.rect(9, hipY - 3, 3, 2, skin[2]);
    p.rrect(9, hipY - 28, 14, 14, 3, skin[2]);
    p.rect(10, hipY - 27, 5, 4, skin[3]);
    p.rrect(11, hipY - 30, 13, 9, 3, hair.base);
    p.rect(17, hipY - 22, 6, 6, hair.base);
    p.rect(11, hipY - 20, 2, 3, '#2a2030');
    p.px(11, hipY - 20, '#fbf5e9');
  }
  selOut(p.canvas);
  if (flip) {
    const [c, ctx] = makeCanvas(32, 48);
    ctx.translate(32, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(p.canvas, 0, 0);
    return c;
  }
  return p.canvas;
}

async function loadCharacters(): Promise<boolean> {
  try {
    const mod: Record<string, unknown> = await import('./render/characters');
    const app: Record<string, unknown> = await import('./agents/appearance');
    if (typeof mod.characterFrame !== 'function' || typeof mod.CHAR_FOOT_X !== 'number' || typeof app.randomAppearance !== 'function') {
      return false;
    }
    const frame = mod.characterFrame as (look: unknown, dir: Dir, pose: string, f: number, o?: unknown) => HTMLCanvasElement;
    const randomLook = app.randomAppearance as (seed: number, bias: unknown) => unknown;
    const bias = {
      topColors: (app.CLOTH_COLORS as string[]) ?? [],
      tops: (app.TOP_STYLES as readonly string[]) ?? [],
      accessories: (app.ACCESSORIES as readonly string[]) ?? [],
    };
    const look = (seed: number) => randomLook(seed, bias);
    charFoot = [mod.CHAR_FOOT_X as number, mod.CHAR_FOOT_Y as number];
    const test = frame(look(1), 'down', 'sit', 0);
    if (!(test instanceof HTMLCanvasElement)) {
      return false;
    }
    sitterFrame = (dir, seed) => frame(look(seed), dir, 'sit', 0);
    characterApi = { frame, look, poses: (mod.POSES as string[]) ?? ['stand', 'walk', 'sit'], poseFrames: (mod.POSE_FRAMES as Record<string, number>) ?? {} };
    return true;
  } catch (e) {
    console.warn('character sheet unavailable:', e);
    return false;
  }
}

let characterApi: {
  frame: (look: unknown, dir: Dir, pose: string, f: number, o?: unknown) => HTMLCanvasElement;
  look: (seed: number, bias?: unknown) => unknown;
  poses: string[];
  poseFrames: Record<string, number>;
} | null = null;

// ---------------------------------------------------------------------------------------------------------
// Asset scenes

interface Drawable {
  key: number;
  order: number;
  draw(ctx: CanvasRenderingContext2D): void;
}

function frameBounds(v: Variant): { x: number; y: number; w: number; h: number } {
  let x0 = 0;
  let y0 = 0;
  let x1 = v.w * TILE;
  let y1 = v.h * TILE;
  for (const f of v.frames) {
    for (const p of f) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + p.canvas.width);
      y1 = Math.max(y1, p.y + p.canvas.height);
    }
  }
  for (const s of v.spots) {
    x0 = Math.min(x0, s.dx * TILE - 4);
    x1 = Math.max(x1, (s.dx + 1) * TILE + 4);
    y0 = Math.min(y0, s.dy * TILE - 24);
    y1 = Math.max(y1, (s.dy + 1) * TILE);
  }
  const pad = 8;
  return { x: x0 - pad, y: y0 - pad - (v.spots.some((s) => s.pose === 'sit') ? 8 : 0), w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 + 8 };
}

function renderScene(v: Variant, frame: Part[], b: { x: number; y: number; w: number; h: number }, onFloor: FloorDef | null, sitters: boolean, z: number): HTMLCanvasElement {
  const [base, ctx] = makeCanvas(b.w, b.h);
  if (onFloor) {
    paintFloor(ctx, onFloor, b.x + 3 * TILE, b.y + 3 * TILE, b.w, b.h);
  } else {
    ctx.fillStyle = SWATCH;
    ctx.fillRect(0, 0, b.w, b.h);
  }
  ctx.save();
  ctx.translate(-b.x, -b.y);
  if (!onFloor) {
    v.mask.forEach((row, ty) =>
      [...row].forEach((ch, tx) => {
        if (ch !== '.') {
          ctx.fillStyle = ch === 's' ? 'rgba(80,140,230,0.10)' : 'rgba(200,70,60,0.08)';
          ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        }
      }),
    );
  }
  ctx.fillStyle = SHADOW;
  for (const s of v.shadows ?? []) {
    ctx.beginPath();
    if (s.shape === 'ellipse') {
      ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
    } else {
      ctx.roundRect(s.x, s.y, s.w, s.h, 2);
    }
    ctx.fill();
  }
  const items: Drawable[] = frame.map((p, i) => ({ key: p.z, order: i, draw: (c) => c.drawImage(p.canvas, p.x, p.y) }));
  if (sitters) {
    v.spots
      .filter((s) => s.pose === 'sit')
      .forEach((s, i) => {
        const fx = s.dx * TILE + 16 + (s.px ?? 0);
        const fy = s.dy * TILE + FOOT_Y + (s.py ?? 0);
        const img = sitterFrame(s.facing, 7 + i * 13);
        items.push({ key: fy, order: 1000 + i, draw: (c) => c.drawImage(img, fx - charFoot[0], fy - charFoot[1]) });
      });
  }
  items.sort((a, c) => a.key - c.key || a.order - c.order);
  for (const it of items) {
    it.draw(ctx);
  }
  ctx.restore();
  const big = scaled(base, z);
  if (z > 1) {
    const g = big.getContext('2d')!;
    g.strokeStyle = onFloor ? 'rgba(255,250,235,0.16)' : 'rgba(255,250,235,0.28)';
    g.lineWidth = 1;
    for (let tx = 0; tx <= v.w; tx++) {
      const X = (tx * TILE - b.x) * z + 0.5;
      g.beginPath();
      g.moveTo(X, (0 - b.y) * z);
      g.lineTo(X, (v.h * TILE - b.y) * z);
      g.stroke();
    }
    for (let ty = 0; ty <= v.h; ty++) {
      const Y = (ty * TILE - b.y) * z + 0.5;
      g.beginPath();
      g.moveTo((0 - b.x) * z, Y);
      g.lineTo((v.w * TILE - b.x) * z, Y);
      g.stroke();
    }
    if (!onFloor) {
      for (const s of v.spots) {
        const fx = (s.dx * TILE + 16 + (s.px ?? 0) - b.x) * z;
        const fy = (s.dy * TILE + FOOT_Y + (s.py ?? 0) - b.y) * z;
        g.fillStyle = s.pose === 'sit' ? '#5b8cc0' : '#e3b341';
        g.fillRect(fx - 3, fy - 3, 6, 6);
        const [dx, dy] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[s.facing];
        g.fillRect(fx + dx * 7 - 1, fy + dy * 7 - 1, 3, 3);
      }
    }
  }
  return big;
}

function assetBlock(def: AssetDef): HTMLElement {
  const wrap = el('div', 'asset');
  const title = el('div', 'title');
  const v0 = variant(def.id, def.facings[0])!;
  title.append(el('span', 'id', def.id), el('span', 'meta', `  ${def.name} · ${v0.w}×${v0.h} · ${def.layer} · ${def.group} · ${def.facings.join('/')}`));
  wrap.append(title);
  const row = el('div', 'row');
  const fl = def.layer === 'floor' ? null : sampleFloorFor(def);
  for (const facing of def.facings) {
    let v: Variant;
    try {
      v = variant(def.id, facing)!;
    } catch (e) {
      row.append(el('div', 'cell warn', `${facing}: ${(e as Error).message}`));
      continue;
    }
    const b = frameBounds(v);
    v.frames.forEach((frame, fi) => {
      const cell = el('div', 'cell');
      const pair = el('div', 'pair');
      const small = el('div');
      small.append(renderScene(v, frame, b, null, false, 1));
      if (fl) {
        small.append(document.createElement('br'), renderScene(v, frame, b, fl, SITTERS, 1));
      }
      pair.append(small, renderScene(v, frame, b, null, false, ZOOM));
      if (fl) {
        pair.append(renderScene(v, frame, b, fl, SITTERS, ZOOM));
      }
      cell.append(pair);
      const semi = frame.reduce((n, p) => n + semiTransparentCount(p.canvas), 0);
      const zs = frame.map((p) => p.z).join(',');
      const cap = el('div', 'cap', `${facing}${v.frames.length > 1 ? ` · frame ${fi + 1}/${v.frames.length}` : ''} · ${v.w}×${v.h} · mask ${v.mask.join('/')} · z ${zs}`);
      if (semi > 0) {
        cap.append(el('span', 'warn', ` · ${semi} semi-transparent px!`));
      }
      cell.append(cap);
      row.append(cell);
    });
  }
  wrap.append(row);
  return wrap;
}

function assetsSection(): void {
  let defs = allAssets();
  if (ONLY_ID) {
    defs = defs.filter((d) => d.id === ONLY_ID);
  }
  if (CATEGORY) {
    defs = defs.filter((d) => d.category === CATEGORY);
  }
  const cats = [...new Set(defs.map((d) => d.category))];
  for (const c of cats) {
    out.append(el('h2', undefined, `${c}`));
    for (const d of defs.filter((x) => x.category === c)) {
      out.append(assetBlock(d));
    }
  }
  if (!defs.length) {
    out.append(el('p', 'note', 'No matching assets registered yet.'));
  }
}

// ---------------------------------------------------------------------------------------------------------
// Floors and walls

function floorsSection(): void {
  out.append(el('h2', undefined, 'Floors (6×4 patches; right: 14×8 at 1× to judge repetition)'));
  for (const f of allFloors().filter((x) => !ONLY_ID || x.id === ONLY_ID)) {
    const wrap = el('div', 'asset');
    wrap.append(el('div', 'title', `${f.id} · ${f.name}${f.outdoor ? ' · outdoor' : ''}${f.drivable ? ' · drivable' : ''}${f.walkable === false ? ' · not walkable' : ''}`));
    const row = el('div', 'row');
    const [patch, pctx] = makeCanvas(6 * TILE, 4 * TILE);
    paintFloor(pctx, f, 5 * TILE, 3 * TILE, patch.width, patch.height);
    const [wide, wctx] = makeCanvas(14 * TILE, 8 * TILE);
    paintFloor(wctx, f, 40 * TILE, 20 * TILE, wide.width, wide.height);
    const c1 = el('div', 'cell');
    c1.append(scaled(patch, ZOOM));
    const c2 = el('div', 'cell');
    c2.append(patch.cloneNode() as HTMLCanvasElement);
    (c2.firstChild as HTMLCanvasElement).getContext('2d')!.drawImage(patch, 0, 0);
    c2.append(document.createElement('br'), wide);
    row.append(c1, c2);
    wrap.append(row);
    out.append(wrap);
  }
}

/** A small room corner: horizontal wall with a doorway, a vertical wall on the left, floor below. */
function wallScene(style: WallStyleDef): HTMLCanvasElement {
  const W = 7;
  const H = 4;
  const top = WALL_FACE_H + 14;
  const [c, ctx] = makeCanvas(W * TILE, H * TILE + top);
  const ground = floorDef(style.kind === 'exterior' ? 'grass' : 'wood.oak') ?? allFloors()[0];
  const wallRowY = top + 12;
  const isWall = (tx: number, ty: number) => (ty === 0 && tx !== 4) || tx === 0;
  if (ground) {
    paintFloor(ctx, ground, 0, -top, W * TILE, H * TILE + top, isWall);
  }
  const lineTop = wallRowY;
  const lineBottom = lineTop + WALL_LINE;
  const faceTop = lineBottom - WALL_FACE_H;
  const gapX0 = 4 * TILE;
  const gapX1 = 5 * TILE;
  for (let x = TILE / 2 - WALL_LINE / 2; x < W * TILE; x++) {
    if (x >= gapX0 && x < gapX1) {
      continue;
    }
    const edge = x === gapX0 - 1 ? 'right' : x === gapX1 ? 'left' : null;
    style.faceSlice(ctx, x, faceTop, x, edge);
  }
  const [capC, capCtx] = makeCanvas(c.width, c.height);
  capCtx.fillStyle = style.cap.fill;
  const vx = TILE / 2 - WALL_LINE / 2;
  capCtx.fillRect(vx, lineTop - WALL_FACE_H, gapX0 - vx, WALL_LINE);
  capCtx.fillRect(gapX1, lineTop - WALL_FACE_H, W * TILE - gapX1, WALL_LINE);
  capCtx.fillRect(vx, lineTop - WALL_FACE_H, WALL_LINE, c.height);
  selOut(capC, { color: style.cap.edge, lit: false });
  capCtx.fillStyle = style.cap.highlight;
  capCtx.fillRect(vx + 1, lineTop - WALL_FACE_H + 1, gapX0 - vx - 2, 1);
  capCtx.fillRect(gapX1 + 1, lineTop - WALL_FACE_H + 1, W * TILE - gapX1 - 1, 1);
  capCtx.fillRect(vx + 1, lineTop - WALL_FACE_H + 1, 1, c.height);
  ctx.drawImage(capC, 0, 0);
  return c;
}

function wallsSection(): void {
  out.append(el('h2', undefined, 'Wall styles (room corner with a doorway)'));
  const row = el('div', 'row');
  for (const s of allWallStyles().filter((x) => !ONLY_ID || x.id === ONLY_ID)) {
    const cell = el('div', 'cell');
    const scene = wallScene(s);
    cell.append(scaled(scene, Math.min(ZOOM, 3)), el('div', 'cap', `${s.id} · ${s.name} · ${s.kind}`));
    const small = el('div', 'cell');
    small.append(scene, el('div', 'cap', '1×'));
    row.append(cell, small);
  }
  out.append(row);
}

function charactersSection(): void {
  out.append(el('h2', undefined, 'Characters'));
  if (!characterApi) {
    out.append(el('p', 'note', 'src/render/characters.ts does not export the contract characterFrame / CHAR_FOOT_X yet. Showing the seated mannequin used in asset scenes.'));
    const row = el('div', 'row');
    for (const d of ['down', 'up', 'left', 'right'] as Dir[]) {
      const cell = el('div', 'cell');
      cell.append(scaled(mannequin(d), ZOOM), el('div', 'cap', `sit ${d}`));
      row.append(cell);
    }
    out.append(row);
    return;
  }
  const api = characterApi;
  for (const seed of [1, 2, 3, 4]) {
    const look = api.look(seed * 977);
    for (const pose of api.poses) {
      const n = api.poseFrames[pose] ?? 1;
      const row = el('div', 'row');
      for (const d of ['down', 'up', 'left', 'right'] as Dir[]) {
        const [sheet, sctx] = makeCanvas(32 * n, 48);
        sctx.fillStyle = SWATCH;
        sctx.fillRect(0, 0, sheet.width, sheet.height);
        for (let f = 0; f < n; f++) {
          sctx.drawImage(api.frame(look, d, pose, f), f * 32, 0);
        }
        const cell = el('div', 'cell');
        cell.append(scaled(sheet, ZOOM), el('div', 'cap', `look ${seed} · ${pose} · ${d} · ${n}f`));
        row.append(cell);
      }
      out.append(row);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Scene vignette: registered assets placed together in a small office + lounge, depth-sorted like the engine.

interface Placement {
  id: string;
  x: number;
  y: number;
  dir: Dir;
  sit?: boolean;
}

const SCENE_ITEMS: Placement[] = [
  { id: 'chair.office.charcoal', x: 1, y: 2, dir: 'down', sit: true },
  { id: 'desk.oak.monitor', x: 1, y: 3, dir: 'down' },
  { id: 'desk.oak.monitor', x: 1, y: 4, dir: 'up' },
  { id: 'chair.office.charcoal', x: 1, y: 5, dir: 'up', sit: true },
  { id: 'chair.office.charcoal', x: 2, y: 5, dir: 'up' },
  { id: 'chair.office.charcoal', x: 4, y: 3, dir: 'right', sit: true },
  { id: 'desk.oak.monitor', x: 5, y: 3, dir: 'right' },
  { id: 'plant.tall.fiddle', x: 0, y: 1, dir: 'down' },
  { id: 'plant.tall.fiddle', x: 6, y: 1, dir: 'down' },
  { id: 'sofa.2.sage', x: 8, y: 2, dir: 'down', sit: true },
  { id: 'sofa.2.sage', x: 11, y: 3, dir: 'left' },
  { id: 'sofa.2.sage', x: 8, y: 5, dir: 'up', sit: true },
  { id: 'plant.tall.fiddle', x: 11, y: 1, dir: 'down' },
];

function sceneSection(): void {
  out.append(el('h2', undefined, 'Scene (office + lounge vignette, engine-style depth sorting)'));
  const W = 12;
  const H = 7;
  const top = WALL_FACE_H + 4;
  const [c, ctx] = makeCanvas(W * TILE, H * TILE + top);
  const floorFor = (tx: number) => floorDef(tx < 7 ? 'carpet.teal' : 'wood.oak') ?? allFloors()[0];
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const f = floorFor(tx);
      if (!f) {
        continue;
      }
      ctx.save();
      ctx.translate(tx * TILE, ty * TILE + top);
      ctx.beginPath();
      ctx.rect(0, 0, TILE, TILE);
      ctx.clip();
      f.draw(ctx, tx + 10, ty + 10, { floorAt: () => f.id, wallAt: (_dx, dy) => ty + dy <= 0 });
      ctx.restore();
    }
  }
  ctx.translate(0, top);
  const items: Drawable[] = [];
  const style = allWallStyles().find((w) => w.id === 'wall.cream') ?? allWallStyles()[0];
  if (style) {
    const lineBottom = 12 + WALL_LINE;
    items.push({
      key: lineBottom,
      order: 0,
      draw: (g) => {
        for (let x = 0; x < W * TILE; x++) {
          style.faceSlice(g, x, lineBottom - WALL_FACE_H, x, null);
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
  ctx.fillStyle = SHADOW;
  let seed = 3;
  for (const it of SCENE_ITEMS) {
    const def = allAssets().find((a) => a.id === it.id);
    if (!def) {
      continue;
    }
    const v = variant(it.id, it.dir)!;
    const ox = it.x * TILE;
    const oy = it.y * TILE;
    for (const s of v.shadows ?? []) {
      ctx.beginPath();
      if (s.shape === 'ellipse') {
        ctx.ellipse(ox + s.x + s.w / 2, oy + s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
      } else {
        ctx.roundRect(ox + s.x, oy + s.y, s.w, s.h, 2);
      }
      ctx.fill();
    }
    v.frames[0].forEach((p, i) => items.push({ key: oy + p.z, order: i + 1, draw: (g) => g.drawImage(p.canvas, ox + p.x, oy + p.y) }));
    if (it.sit) {
      for (const s of v.spots.filter((sp) => sp.pose === 'sit')) {
        const fx = ox + s.dx * TILE + 16 + (s.px ?? 0);
        const fy = oy + s.dy * TILE + FOOT_Y + (s.py ?? 0);
        const img = sitterFrame(s.facing, (seed += 17));
        items.push({ key: fy, order: 100, draw: (g) => g.drawImage(img, fx - charFoot[0], fy - charFoot[1]) });
      }
    }
  }
  items.sort((a, b) => a.key - b.key || a.order - b.order);
  for (const it of items) {
    it.draw(ctx);
  }
  const cell = el('div', 'cell');
  cell.append(scaled(c, Math.min(ZOOM, 3)));
  const small = el('div', 'cell');
  small.append(c, el('div', 'cap', '1×'));
  const row = el('div', 'row');
  row.append(cell, small);
  out.append(row);
}

async function main(): Promise<void> {
  buildNav();
  await loadCharacters();
  const show = (s: string) => !SECTION || SECTION === s;
  if ((!SECTION || SECTION === 'scene') && !CATEGORY && !ONLY_ID) {
    sceneSection();
  }
  if (show('floors') && !CATEGORY && !(ONLY_ID && !allFloors().some((f) => f.id === ONLY_ID))) {
    floorsSection();
  }
  if (show('walls') && !CATEGORY && !(ONLY_ID && !allWallStyles().some((f) => f.id === ONLY_ID))) {
    wallsSection();
  }
  if (show('assets')) {
    assetsSection();
  }
  if (show('characters') && !CATEGORY && !ONLY_ID) {
    charactersSection();
  }
}

main().catch((e) => {
  out.append(el('pre', 'warn', String((e as Error).stack ?? e)));
});
