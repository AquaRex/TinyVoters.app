import { floor } from '../art/registry';
import { Dir } from '../config';
import { Office } from '../world/office';

export type Tile = [number, number];

/** Outdoors people keep to sidewalks and paths, cut across grass reluctantly and cross roads only when needed. */
function outdoorCost(floorId: string, drivable: boolean): number {
  if (drivable) {
    return 5;
  }
  if (floorId.startsWith('paving') || floorId.startsWith('path') || floorId.startsWith('tile')) {
    return 1;
  }
  return 2.5;
}

/**
 * Pathfinding for people: a weighted version of the office grid (seats cost more, sidewalks cost less), with
 * optional per-tile penalties for local avoidance, plus room ids (areas separated by walls and doors).
 */
export class Nav {
  private version = -1;
  cost = new Float32Array(0);
  room = new Int32Array(0);
  doorTile = new Uint8Array(0);
  /** Per tile, the sides people can't cross (bits from SIDE): stall partitions. */
  closed = new Uint8Array(0);
  w = 0;
  h = 0;

  constructor(private office: Office) {}

  sync(): boolean {
    if (this.version === this.office.version && this.w === this.office.w) {
      return false;
    }
    const o = this.office;
    this.version = o.version;
    this.w = o.w;
    this.h = o.h;
    const n = o.w * o.h;
    this.cost = new Float32Array(n);
    this.doorTile = new Uint8Array(n);
    this.closed = new Uint8Array(n);
    for (const item of o.layout.items) {
      const def = o.defOf(item);
      const v = def ? o.variantOf(item) : undefined;
      if (!v || (!def!.door && !v.closed)) {
        continue;
      }
      const sides = (v.closed ?? []).reduce((m, d) => m | SIDE[d], 0);
      for (let dy = 0; dy < v.h; dy++) {
        for (let dx = 0; dx < v.w; dx++) {
          if (o.inBounds(item.x + dx, item.y + dy)) {
            const i = (item.y + dy) * o.w + item.x + dx;
            this.doorTile[i] = def!.door ? 1 : this.doorTile[i];
            this.closed[i] |= sides;
          }
        }
      }
    }
    for (let y = 0; y < o.h; y++) {
      for (let x = 0; x < o.w; x++) {
        const i = y * o.w + x;
        const base = o.cost[i];
        if (!base) {
          continue;
        }
        const f = o.floorAt(x, y);
        this.cost[i] = f && floor(f)?.outdoor ? base * outdoorCost(f, o.drivable(x, y)) : base;
      }
    }
    this.buildRooms();
    return true;
  }

  private buildRooms(): void {
    const { w, h, office: o } = this;
    this.room = new Int32Array(w * h).fill(-1);
    let next = 1;
    const stack: number[] = [];
    for (let s = 0; s < w * h; s++) {
      if (this.room[s] !== -1 || !this.cost[s] || this.doorTile[s]) {
        continue;
      }
      const outdoor = o.isOutdoor(s % w, Math.floor(s / w));
      const id = outdoor ? 0 : next++;
      this.room[s] = id;
      stack.push(s);
      while (stack.length) {
        const c = stack.pop()!;
        const cx = c % w;
        const cy = Math.floor(c / w);
        for (const [dx, dy] of NEIGHBORS) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
            continue;
          }
          const n = ny * w + nx;
          if (this.room[n] !== -1 || !this.cost[n] || this.doorTile[n] || o.isOutdoor(nx, ny) !== outdoor || !this.passable(c, n, dx, dy)) {
            continue;
          }
          this.room[n] = id;
          stack.push(n);
        }
      }
    }
  }

  walkable(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.cost[y * this.w + x] > 0;
  }

  /** A plain floor tile (not a seat or other slow tile). */
  open(x: number, y: number): boolean {
    return this.walkable(x, y) && this.office.cost[y * this.w + x] === 1;
  }

  /** Whether the side between tile index `c` and its neighbour `n` (one step dx, dy away) can be crossed. */
  private passable(c: number, n: number, dx: number, dy: number): boolean {
    return !(this.closed[c] & sideOf(dx, dy)) && !(this.closed[n] & sideOf(-dx, -dy));
  }

  /** Whether someone can step straight from one tile to a neighbouring one. */
  connected(ax: number, ay: number, bx: number, by: number): boolean {
    this.sync();
    const dx = bx - ax;
    const dy = by - ay;
    return Math.abs(dx) + Math.abs(dy) === 1 && this.walkable(ax, ay) && this.walkable(bx, by) && this.passable(ay * this.w + ax, by * this.w + bx, dx, dy);
  }

  roomOf(x: number, y: number): number {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.room[y * this.w + x] : -1;
  }

  /**
   * Weighted 4-directional A*. The goal tile is always enterable (so seats can be reached).
   * `penalty` adds cost per tile (used to steer around people).
   */
  path(sx: number, sy: number, gx: number, gy: number, penalty?: (x: number, y: number) => number): Tile[] | null {
    this.sync();
    const { w, h } = this;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h || gx < 0 || gy < 0 || gx >= w || gy >= h) {
      return null;
    }
    if (sx === gx && sy === gy) {
      return [];
    }
    const start = sy * w + sx;
    const goal = gy * w + gx;
    const g = new Float32Array(w * h).fill(Infinity);
    const came = new Int32Array(w * h).fill(-1);
    const heap = new Heap();
    g[start] = 0;
    heap.push(start, 0);
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) {
        const out: Tile[] = [];
        for (let c = goal; c !== start; c = came[c]) {
          out.push([c % w, Math.floor(c / w)]);
        }
        return out.reverse();
      }
      const cx = cur % w;
      const cy = Math.floor(cur / w);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
          continue;
        }
        const n = ny * w + nx;
        let c = n === goal ? 1 : this.cost[n];
        if (!c || !this.passable(cur, n, dx, dy)) {
          continue;
        }
        if (penalty && n !== goal) {
          c += penalty(nx, ny);
        }
        const ng = g[cur] + c;
        if (ng < g[n]) {
          g[n] = ng;
          came[n] = cur;
          heap.push(n, ng + Math.abs(nx - gx) + Math.abs(ny - gy));
        }
      }
    }
    return null;
  }

  /** Walkable tiles on the map border that are outdoors (where people on foot come and go). */
  edgeTiles(): Tile[] {
    this.sync();
    const out: Tile[] = [];
    const add = (x: number, y: number) => {
      if (this.walkable(x, y) && this.office.isOutdoor(x, y) && !this.office.drivable(x, y)) {
        out.push([x, y]);
      }
    };
    for (let x = 0; x < this.w; x++) {
      add(x, 0);
      add(x, this.h - 1);
    }
    for (let y = 1; y < this.h - 1; y++) {
      add(0, y);
      add(this.w - 1, y);
    }
    return out;
  }
}

const SIDE: Record<Dir, number> = { right: 1, left: 2, down: 4, up: 8 };
const sideOf = (dx: number, dy: number): number => (dx > 0 ? SIDE.right : dx < 0 ? SIDE.left : dy > 0 ? SIDE.down : SIDE.up);

export const NEIGHBORS: Tile[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

class Heap {
  private items: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, p: number): void {
    const { items, prio } = this;
    items.push(item);
    prio.push(p);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (prio[parent] <= prio[i]) {
        break;
      }
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const { items, prio } = this;
    const top = items[0];
    const lastItem = items.pop()!;
    const lastPrio = prio.pop()!;
    if (items.length) {
      items[0] = lastItem;
      prio[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && prio[l] < prio[m]) {
          m = l;
        }
        if (r < items.length && prio[r] < prio[m]) {
          m = r;
        }
        if (m === i) {
          break;
        }
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const { items, prio } = this;
    [items[a], items[b]] = [items[b], items[a]];
    [prio[a], prio[b]] = [prio[b], prio[a]];
  }
}
