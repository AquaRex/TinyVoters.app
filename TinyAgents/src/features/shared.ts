import { app } from '../app';
import { Dir, TILE } from '../config';
import type { Director } from '../agents/director';
import type { Tile } from '../agents/nav';
import { skyAt } from '../render/lighting';
import { Office } from '../world/office';
import { PlacedItem } from '../world/layout';

/** 0 by day, 1 at night, following the renderer's hour (?time=, Clock / Day). */
export function nightness(): number {
  return skyAt(app.renderer.lighting.hour).night;
}

/** The director whose office is on screen. */
export function shownDirector(): Director | undefined {
  return app.shown.director;
}

export function itemsWith(office: Office, prefix: string): PlacedItem[] {
  return office.layout.items.filter((i) => i.type === prefix || i.type.startsWith(prefix + '.'));
}

/** Plain open floor with nothing standing on it, no wall, no spot: somewhere a prop can stand without floating. */
export function bareTile(office: Office, x: number, y: number): boolean {
  if (!office.floorAt(x, y) || office.wallAt(x, y) || !office.walkable(x, y) || office.cost[y * office.w + x] !== 1) {
    return false;
  }
  if (office.spots.some((s) => s.x === x && s.y === y)) {
    return false;
  }
  return !office.layout.items.some((i) => office.defOf(i)?.layer !== 'floor' && office.covers(i, x, y));
}

/** Something that walks the nav grid tile by tile (the cat, the janitor). Foot point in world px. */
export class Walker {
  x = 0;
  y = 0;
  tx = 0;
  ty = 0;
  dir: Dir = 'left';
  /** last horizontal facing, for side-view sprites */
  side: 'left' | 'right' = 'left';
  path: Tile[] = [];
  dist = 0;

  constructor(public speed: number) {}

  get moving(): boolean {
    return this.path.length > 0;
  }

  place(tx: number, ty: number): void {
    [this.x, this.y] = Office.footPoint(tx, ty);
    this.tx = tx;
    this.ty = ty;
    this.path = [];
  }

  goTo(d: Director, gx: number, gy: number): boolean {
    const p = d.nav.path(this.tx, this.ty, gx, gy);
    if (!p) {
      return false;
    }
    this.path = p;
    return true;
  }

  /** Returns true on arrival (or when standing still). */
  update(dt: number): boolean {
    let budget = this.speed * dt;
    while (budget > 0 && this.path.length) {
      const [nx, ny] = this.path[0];
      const [gx, gy] = Office.footPoint(nx, ny);
      const dx = gx - this.x;
      const dy = gy - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) {
        this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        if (Math.abs(dx) > 0.01) {
          this.side = dx > 0 ? 'right' : 'left';
        }
      }
      if (d <= budget) {
        this.x = gx;
        this.y = gy;
        this.tx = nx;
        this.ty = ny;
        this.path.shift();
        budget -= d;
        this.dist += d;
      } else {
        this.x += (dx / d) * budget;
        this.y += (dy / d) * budget;
        this.dist += budget;
        budget = 0;
      }
    }
    return this.path.length === 0;
  }
}

/** A random open indoor tile reachable for walkers. */
export function randomIndoor(d: Director, rand: () => number): Tile | null {
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(rand() * d.office.w);
    const y = Math.floor(rand() * d.office.h);
    if (d.nav.open(x, y) && !d.office.isOutdoor(x, y) && d.office.floorAt(x, y)) {
      return [x, y];
    }
  }
  return null;
}

/** Tiny pixel "z" (3 x 3 world px) for snoozing creatures. */
export function drawZ(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 3, 1);
  ctx.fillRect(x + 1, y + 1, 1, 1);
  ctx.fillRect(x, y + 2, 3, 1);
}

export const tileCenter = (t: number): number => t * TILE + TILE / 2;
