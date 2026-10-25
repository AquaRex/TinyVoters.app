import { TILE } from '../config';
import { registerExtension } from '../agents/director';
import { grassShade } from '../art/floors';
import { hash2 } from '../art/kit';
import { lawnBlades } from '../art/outdoor';
import { Office } from '../world/office';

/**
 * Wind pose 0..2 at world px (x, y) and time `t` (s): a slow breeze rolling across the map from the west, with an
 * occasional stronger gust. Shared by the lawn blades here and the pond's reeds.
 */
export function windPose(x: number, y: number, t = performance.now() / 1000): number {
  const breeze = 0.5 + 0.5 * Math.sin(t * 0.9 - x * 0.021 - y * 0.009);
  const gust = Math.max(0, Math.sin(t * 0.19 - x * 0.0035)) ** 8;
  const s = breeze * 0.85 + gust * 1.4;
  return s > 1.45 ? 2 : s > 0.6 ? 1 : 0;
}

interface Blade {
  x: number;
  y: number;
  shade: number;
}

/** Loose blades on open lawn, by tile row; none under objects or in their shade. */
function lawnOf(office: Office): Blade[][] {
  const blocked = new Uint8Array(office.w * office.h);
  const mark = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(0, y0); y <= Math.min(office.h - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(office.w - 1, x1); x++) {
        blocked[y * office.w + x] = 1;
      }
    }
  };
  for (const item of office.layout.items) {
    const v = office.variantOf(item);
    if (!v || office.defOf(item)?.layer === 'floor') {
      continue;
    }
    mark(item.x, item.y, item.x + v.w - 1, item.y + v.h - 1);
    for (const s of v.shadows ?? []) {
      const sx = item.x * TILE + s.x;
      const sy = item.y * TILE + s.y;
      mark(Math.floor(sx / TILE), Math.floor(sy / TILE), Math.floor((sx + s.w) / TILE), Math.floor((sy + s.h) / TILE));
    }
  }
  const rows: Blade[][] = [];
  for (let ty = 0; ty < office.h; ty++) {
    const row: Blade[] = [];
    for (let tx = 0; tx < office.w; tx++) {
      if (blocked[ty * office.w + tx] || office.floorAt(tx, ty) !== 'grass') {
        continue;
      }
      for (let k = 0; k < 3; k++) {
        if (hash2(tx, ty, 900 + k) < 0.6) {
          const x = tx * TILE + 4 + Math.floor(hash2(tx, ty, 910 + k) * 24);
          const y = ty * TILE + 7 + Math.floor(hash2(tx, ty, 920 + k) * 6) + k * 8;
          row.push({ x, y, shade: grassShade(x, y) });
        }
      }
    }
    rows.push(row);
  }
  return rows;
}

/** Grass in the wind: a light overlay of loose lawn blades that lean as the breeze rolls over (the floor stays baked). */
registerExtension((director) => {
  const office = director.office;
  let version = -1;
  let rows: Blade[][] = [];
  return {
    drawables(view, push) {
      if (version !== office.version) {
        version = office.version;
        rows = lawnOf(office);
      }
      push(-1e6 + 2, (ctx) => {
        const t = performance.now() / 1000;
        const y0 = Math.max(0, Math.floor(view.y / TILE));
        const y1 = Math.min(rows.length - 1, Math.floor((view.y + view.h) / TILE) + 1);
        for (let ty = y0; ty <= y1; ty++) {
          for (const b of rows[ty]) {
            if (b.x < view.x - 4 || b.x > view.x + view.w + 4) {
              continue;
            }
            const part = lawnBlades(b.shade, windPose(b.x, b.y, t));
            ctx.drawImage(part.canvas, b.x + part.x, b.y + part.y);
          }
        }
      });
    },
  };
});
