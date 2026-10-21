import { TILE } from '../config';
import { floor } from '../art/registry';
import { FloorQuery, Shadow } from '../art/types';
import { PlacedItem } from '../world/layout';
import { Office } from '../world/office';
import { makeCanvas } from './pixel';
import { WallGeom, underWallRegions } from './walls';

const CHUNK = 16;
const CPX = CHUNK * TILE;
const SHADOW = 'rgb(24, 16, 28)';
const SHADOW_ALPHA = 0.26;
/** Ambient occlusion alpha by distance (px) from a wall line. */
const AO = [0, 0.3, 0.17, 0.07];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fills a hard-edged pixel ellipse. */
export function fillPixelEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const rx = w / 2;
  const ry = h / 2;
  for (let j = 0; j < h; j++) {
    const dy = (j + 0.5 - ry) / ry;
    const half = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
    const x0 = Math.round(x + rx - half);
    const x1 = Math.round(x + rx + half);
    if (x1 > x0) {
      ctx.fillRect(x0, y + j, x1 - x0, 1);
    }
  }
}

/** Fills a rect with 1-2 px cut corners. */
function fillPixelRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = Math.min(2, Math.floor(Math.min(w, h) / 2));
  for (let j = 0; j < h; j++) {
    const inset = j < r ? r - j : j >= h - r ? j - (h - r - 1) : 0;
    ctx.fillRect(x + inset, y + j, w - inset * 2, 1);
  }
}

export function fillShadow(ctx: CanvasRenderingContext2D, s: Shadow, ox: number, oy: number): void {
  const x = Math.round(ox + s.x);
  const y = Math.round(oy + s.y);
  if (s.shape === 'ellipse') {
    fillPixelEllipse(ctx, x, y, Math.round(s.w), Math.round(s.h));
  } else {
    fillPixelRoundRect(ctx, x, y, Math.round(s.w), Math.round(s.h));
  }
}

/** Draws one floor tile (FloorDef.draw) at local px (lx, ly); `own` overrides the tile's own floor id. */
export function drawFloorTile(ctx: CanvasRenderingContext2D, office: Office, own: string, tx: number, ty: number, lx: number, ly: number): void {
  const def = floor(own);
  if (!def) {
    return;
  }
  const q: FloorQuery = {
    floorAt: (dx, dy) => (dx === 0 && dy === 0 ? own : office.floorAt(tx + dx, ty + dy)),
    wallAt: (dx, dy) => !!office.wallAt(tx + dx, ty + dy),
  };
  ctx.save();
  ctx.translate(lx, ly);
  def.draw(ctx, tx, ty, q);
  ctx.restore();
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * The flat ground: floors (FloorDef.draw per tile), floor-layer assets, contact shadows and wall ambient occlusion,
 * baked into CHUNK x CHUNK tile canvases that rebuild only where the layout changed.
 */
export class FloorLayer {
  private chunks = new Map<number, HTMLCanvasElement>();
  private dirty = new Set<number>();
  private floorSnap: (string | null)[] = [];
  private wallSnap: (string | null)[] = [];
  private itemSnap = new Map<number, { sig: string; bounds: Rect | null }>();
  private w = -1;
  private h = -1;

  private chunkKey(cx: number, cy: number): number {
    return cy * 4096 + cx;
  }

  private markRect(r: Rect): void {
    const cx0 = Math.floor(r.x / CPX);
    const cy0 = Math.floor(r.y / CPX);
    const cx1 = Math.floor((r.x + r.w - 1) / CPX);
    const cy1 = Math.floor((r.y + r.h - 1) / CPX);
    for (let cy = Math.max(0, cy0); cy <= cy1; cy++) {
      for (let cx = Math.max(0, cx0); cx <= cx1; cx++) {
        this.dirty.add(this.chunkKey(cx, cy));
      }
    }
  }

  /** World-px area an item paints on the floor layer (floor-layer art or contact shadows). */
  private floorBounds(office: Office, item: PlacedItem): Rect | null {
    const def = office.defOf(item);
    const v = office.variantOf(item);
    if (!def || !v) {
      return null;
    }
    const boxes: Rect[] = [];
    if (def.layer === 'floor') {
      for (const p of v.frames[0] ?? []) {
        boxes.push({ x: p.x, y: p.y, w: p.canvas.width, h: p.canvas.height });
      }
    } else if (def.layer === 'object') {
      boxes.push(...(v.shadows ?? []));
    }
    if (!boxes.length) {
      return null;
    }
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.w));
    const y1 = Math.max(...boxes.map((b) => b.y + b.h));
    return { x: item.x * TILE + Math.floor(x0) - 1, y: item.y * TILE + Math.floor(y0) - 1, w: Math.ceil(x1 - x0) + 2, h: Math.ceil(y1 - y0) + 2 };
  }

  /** Compares the layout with the last snapshot and marks changed chunks dirty. */
  sync(office: Office): void {
    const { w, h } = office;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.chunks.clear();
      this.dirty.clear();
      this.floorSnap = [];
      this.wallSnap = [];
      this.itemSnap.clear();
      this.markRect({ x: 0, y: 0, w: w * TILE, h: h * TILE });
    }
    const { floor: fl, walls } = office.layout;
    for (let i = 0; i < w * h; i++) {
      if (fl[i] !== this.floorSnap[i] || walls[i] !== this.wallSnap[i]) {
        const x = i % w;
        const y = Math.floor(i / w);
        this.markRect({ x: (x - 2) * TILE, y: (y - 2) * TILE, w: 5 * TILE, h: 5 * TILE });
      }
    }
    this.floorSnap = [...fl];
    this.wallSnap = [...walls];
    const seen = new Set<number>();
    for (const item of office.layout.items) {
      seen.add(item.uid);
      const sig = `${item.type}|${item.x}|${item.y}|${item.dir}|${!!office.defOf(item)}`;
      const old = this.itemSnap.get(item.uid);
      if (old?.sig === sig) {
        continue;
      }
      const bounds = this.floorBounds(office, item);
      if (old?.bounds) {
        this.markRect(old.bounds);
      }
      if (bounds) {
        this.markRect(bounds);
      }
      this.itemSnap.set(item.uid, { sig, bounds });
    }
    for (const [uid, old] of this.itemSnap) {
      if (!seen.has(uid)) {
        if (old.bounds) {
          this.markRect(old.bounds);
        }
        this.itemSnap.delete(uid);
      }
    }
  }

  /** Draws the visible chunks (building dirty ones first). `view` is in world px. */
  draw(ctx: CanvasRenderingContext2D, office: Office, geoms: Map<number, WallGeom>, view: Rect): void {
    const cx0 = Math.max(0, Math.floor(view.x / CPX));
    const cy0 = Math.max(0, Math.floor(view.y / CPX));
    const cx1 = Math.min(Math.ceil((office.w * TILE) / CPX) - 1, Math.floor((view.x + view.w) / CPX));
    const cy1 = Math.min(Math.ceil((office.h * TILE) / CPX) - 1, Math.floor((view.y + view.h) / CPX));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = this.chunkKey(cx, cy);
        let c = this.chunks.get(key);
        if (!c || this.dirty.has(key)) {
          c = this.build(office, geoms, cx, cy, c);
          this.chunks.set(key, c);
          this.dirty.delete(key);
        }
        ctx.drawImage(c, cx * CPX, cy * CPX);
      }
    }
  }

  private build(office: Office, geoms: Map<number, WallGeom>, cx: number, cy: number, reuse?: HTMLCanvasElement): HTMLCanvasElement {
    const [canvas, ctx] = reuse ? [reuse, reuse.getContext('2d')!] : makeCanvas(CPX, CPX);
    ctx.clearRect(0, 0, CPX, CPX);
    const X = cx * CPX;
    const Y = cy * CPX;
    const area: Rect = { x: X, y: Y, w: CPX, h: CPX };

    for (let ty = cy * CHUNK; ty < Math.min(office.h, (cy + 1) * CHUNK); ty++) {
      for (let tx = cx * CHUNK; tx < Math.min(office.w, (cx + 1) * CHUNK); tx++) {
        const lx = tx * TILE - X;
        const ly = ty * TILE - Y;
        const g = geoms.get(ty * office.w + tx);
        if (g) {
          for (const [rx, ry, rw, rh, f] of underWallRegions(office, g)) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(lx + rx, ly + ry, rw, rh);
            ctx.clip();
            drawFloorTile(ctx, office, f, tx, ty, lx, ly);
            ctx.restore();
          }
        } else {
          const f = office.floorAt(tx, ty);
          if (f) {
            drawFloorTile(ctx, office, f, tx, ty, lx, ly);
          }
        }
      }
    }

    const [shadowCanvas, sctx] = makeCanvas(CPX, CPX);
    sctx.fillStyle = SHADOW;
    let anyShadow = false;
    for (const item of office.layout.items) {
      const def = office.defOf(item);
      const v = office.variantOf(item);
      if (!def || !v) {
        continue;
      }
      const ox = item.x * TILE - X;
      const oy = item.y * TILE - Y;
      if (def.layer === 'floor') {
        const b = this.floorBounds(office, item);
        if (b && intersects(b, area)) {
          for (const p of [...(v.frames[0] ?? [])].sort((a, b2) => a.z - b2.z)) {
            ctx.drawImage(p.canvas, ox + p.x, oy + p.y);
          }
        }
      } else if (def.layer === 'object' && v.shadows?.length) {
        const b = this.floorBounds(office, item);
        if (b && intersects(b, area)) {
          for (const s of v.shadows) {
            fillShadow(sctx, s, ox, oy);
          }
          anyShadow = true;
        }
      }
    }
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    if (anyShadow) {
      ctx.globalAlpha = SHADOW_ALPHA;
      ctx.drawImage(shadowCanvas, 0, 0);
      ctx.globalAlpha = 1;
    }
    const ao = this.ambientOcclusion(office, geoms, cx, cy);
    if (ao) {
      ctx.drawImage(ao, 0, 0);
    }
    ctx.restore();
    return canvas;
  }

  private ambientOcclusion(office: Office, geoms: Map<number, WallGeom>, cx: number, cy: number): HTMLCanvasElement | null {
    const R = AO.length - 1;
    const dist = new Uint8Array(CPX * CPX).fill(255);
    const X = cx * CPX;
    const Y = cy * CPX;
    let any = false;
    for (let ty = cy * CHUNK - 1; ty <= (cy + 1) * CHUNK; ty++) {
      for (let tx = cx * CHUNK - 1; tx <= (cx + 1) * CHUNK; tx++) {
        const g = office.inBounds(tx, ty) ? geoms.get(ty * office.w + tx) : undefined;
        if (!g) {
          continue;
        }
        any = true;
        for (let j = 0; j < TILE; j++) {
          for (let i = 0; i < TILE; i++) {
            if (!g.mask[j * TILE + i]) {
              continue;
            }
            const px = tx * TILE + i - X;
            const py = ty * TILE + j - Y;
            for (let dy = -R; dy <= R; dy++) {
              const yy = py + dy;
              if (yy < 0 || yy >= CPX) {
                continue;
              }
              for (let dx = -R; dx <= R; dx++) {
                const xx = px + dx;
                if (xx < 0 || xx >= CPX) {
                  continue;
                }
                const d = Math.max(Math.abs(dx), Math.abs(dy));
                const k = yy * CPX + xx;
                if (d < dist[k]) {
                  dist[k] = d;
                }
              }
            }
          }
        }
      }
    }
    if (!any) {
      return null;
    }
    const [canvas, ctx] = makeCanvas(CPX, CPX);
    const img = ctx.createImageData(CPX, CPX);
    for (let k = 0; k < dist.length; k++) {
      const d = dist[k];
      if (d >= 1 && d <= R) {
        img.data[k * 4] = 24;
        img.data[k * 4 + 1] = 16;
        img.data[k * 4 + 2] = 28;
        img.data[k * 4 + 3] = Math.round(AO[d] * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}
