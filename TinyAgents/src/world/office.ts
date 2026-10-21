import { FOOT_Y, TILE } from '../config';
import { asset, floor, variant } from '../art/registry';
import { Activity, AssetDef, Dir, Spot, Variant } from '../art/types';
import { Layout, PlacedItem, saveLayout } from './layout';

export interface SpotRef extends Spot {
  activity: Activity;
  key: string;
  item: PlacedItem;
  x: number;
  y: number;
}

const SEAT_COST = 12;
/** Groups (or id prefixes) that surface items can stand on. */
const HOST_PREFIXES = ['desk', 'table', 'counter', 'cabinet', 'bookshelf', 'reception'];
const EAT_PREFIXES = ['table.dining', 'table.bar', 'table.picnic'];

export const DIR_STEP: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

function hasPrefix(def: AssetDef, prefixes: string[]): boolean {
  return prefixes.some((p) => [def.id, def.group].some((s) => s === p || s.startsWith(p + '.')));
}

const warned = new Set<string>();
function warnOnce(what: string): void {
  if (!warned.has(what)) {
    warned.add(what);
    console.warn(`Tiny Agents: ${what} is not registered in src/art; it is skipped until an artist defines it.`);
  }
}

export class Office {
  layout: Layout;
  /** 0 = blocked, otherwise traversal cost */
  cost: Uint8Array = new Uint8Array(0);
  /** 1 where cars can drive */
  road: Uint8Array = new Uint8Array(0);
  spots: SpotRef[] = [];
  version = 0;
  private nextUid: number;
  private listeners: (() => void)[] = [];

  constructor(layout: Layout) {
    this.layout = layout;
    this.nextUid = Math.max(0, ...layout.items.map((i) => i.uid)) + 1;
    this.rebuild();
  }

  get w(): number {
    return this.layout.w;
  }

  get h(): number {
    return this.layout.h;
  }

  /** Foot point of an agent standing on a tile. */
  static footPoint(tx: number, ty: number): [number, number] {
    return [tx * TILE + TILE / 2, ty * TILE + FOOT_Y];
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** Floor id at a tile, or null when empty, out of bounds, or not (yet) registered. */
  floorAt(x: number, y: number): string | null {
    if (!this.inBounds(x, y)) {
      return null;
    }
    const id = this.layout.floor[y * this.w + x];
    if (id && !floor(id)) {
      warnOnce(`floor "${id}"`);
      return null;
    }
    return id;
  }

  wallAt(x: number, y: number): string | null {
    return this.inBounds(x, y) ? this.layout.walls[y * this.w + x] : null;
  }

  isOutdoor(x: number, y: number): boolean {
    const f = this.floorAt(x, y);
    return !!f && floor(f)!.outdoor;
  }

  walkable(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.cost[y * this.w + x] > 0;
  }

  drivable(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.road[y * this.w + x] > 0;
  }

  /** A wall whose south face is visible (open floor south of it), so wall-layer assets can hang on it. */
  wallHasFace(x: number, y: number): boolean {
    if (!this.wallAt(x, y) || this.wallAt(x, y + 1) || !this.floorAt(x, y + 1)) {
      return false;
    }
    const verticalEnd = !!this.wallAt(x, y - 1) && !this.wallAt(x - 1, y) && !this.wallAt(x + 1, y);
    return !verticalEnd;
  }

  defOf(item: PlacedItem): AssetDef | undefined {
    const def = asset(item.type);
    if (!def) {
      warnOnce(`asset "${item.type}"`);
    }
    return def;
  }

  variantOf(item: PlacedItem): Variant | undefined {
    return this.defOf(item) && variant(item.type, item.dir);
  }

  /** Effective facing (the asset's first facing when it doesn't support the stored one). */
  facingOf(item: PlacedItem): Dir {
    const def = this.defOf(item);
    return def && !def.facings.includes(item.dir) ? def.facings[0] : item.dir;
  }

  rebuild(): void {
    const { w, h } = this;
    this.cost = new Uint8Array(w * h);
    this.road = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const f = this.floorAt(x, y);
        const def = f ? floor(f)! : undefined;
        const open = !!def && !this.layout.walls[i];
        this.cost[i] = open && def!.walkable !== false ? 1 : 0;
        this.road[i] = open && def!.drivable ? 1 : 0;
      }
    }
    const pending: { s: Spot; item: PlacedItem; n: number }[] = [];
    for (const item of this.layout.items) {
      const def = this.defOf(item);
      const v = def && this.variantOf(item);
      if (!def || !v) {
        continue;
      }
      if (def.layer === 'object') {
        this.forFootprint(item, v, (x, y, m) => {
          const i = y * w + x;
          if (m === '#') {
            this.cost[i] = 0;
            this.road[i] = 0;
          } else if (m === 's' && this.cost[i] > 0) {
            this.cost[i] = SEAT_COST;
            this.road[i] = 0;
          } else if (!def.door) {
            this.road[i] = 0;
          }
        });
      }
      v.spots.forEach((s, n) => pending.push({ s, item, n }));
    }
    this.spots = pending.map(({ s, item, n }) => {
      const x = item.x + s.dx;
      const y = item.y + s.dy;
      const activity = s.activity === 'seat' ? this.seatPurpose(x, y, s.facing, item) : s.activity;
      return { ...s, activity, key: `${item.uid}:${n}`, item, x, y };
    });
    this.version++;
  }

  private forFootprint(item: PlacedItem, v: Variant, fn: (x: number, y: number, mask: string) => void): void {
    for (let dy = 0; dy < v.h; dy++) {
      for (let dx = 0; dx < v.w; dx++) {
        if (this.inBounds(item.x + dx, item.y + dy)) {
          fn(item.x + dx, item.y + dy, v.mask[dy]?.[dx] ?? '#');
        }
      }
    }
  }

  /** A seat is for whatever it faces: desks mean work, meeting tables meetings, dining tables eating, otherwise social. */
  private seatPurpose(x: number, y: number, facing: Dir, own: PlacedItem): Activity {
    const [ox, oy] = DIR_STEP[facing];
    const target = this.itemAt(x + ox, y + oy, 'object') ?? (this.covers(own, x + ox, y + oy) ? own : undefined);
    const def = target && this.defOf(target);
    if (!def) {
      return 'social';
    }
    if (hasPrefix(def, ['desk'])) {
      return 'work';
    }
    if (hasPrefix(def, ['table.meeting'])) {
      return 'meeting';
    }
    if (hasPrefix(def, EAT_PREFIXES)) {
      return 'eat';
    }
    return 'social';
  }

  private commit(): void {
    this.rebuild();
    saveLayout(this.layout);
    for (const fn of this.listeners) {
      fn();
    }
  }

  spotsFor(activity: Activity): SpotRef[] {
    return this.spots.filter((s) => s.activity === activity);
  }

  /** Parking spots (from bay markings), where cars stop. */
  parkingSpots(): SpotRef[] {
    return this.spotsFor('parking');
  }

  itemAt(x: number, y: number, layer?: AssetDef['layer']): PlacedItem | undefined {
    for (let i = this.layout.items.length - 1; i >= 0; i--) {
      const item = this.layout.items[i];
      const def = this.defOf(item);
      if (!def || (layer && def.layer !== layer)) {
        continue;
      }
      if (this.covers(item, x, y)) {
        return item;
      }
    }
    return undefined;
  }

  /** The desk, table, counter… a surface item stands on. */
  hostOf(item: PlacedItem): PlacedItem | undefined {
    const host = this.itemAt(item.x, item.y, 'object');
    return host && hasPrefix(this.defOf(host)!, HOST_PREFIXES) ? host : undefined;
  }

  canPlace(type: string, x: number, y: number, dir: Dir, ignoreUid = -1): boolean {
    const def = asset(type);
    const v = def && variant(type, dir);
    if (!def || !v) {
      return false;
    }
    for (let dy = 0; dy < v.h; dy++) {
      for (let dx = 0; dx < v.w; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (def.layer === 'wall') {
          if (!this.wallHasFace(tx, ty)) {
            return false;
          }
        } else if (!this.floorAt(tx, ty) || this.wallAt(tx, ty)) {
          return false;
        }
        if (def.layer === 'surface') {
          const host = this.itemAt(tx, ty, 'object');
          if (!host || !hasPrefix(this.defOf(host)!, HOST_PREFIXES)) {
            return false;
          }
        }
        const other = this.itemAt(tx, ty, def.layer);
        if (other && other.uid !== ignoreUid) {
          return false;
        }
      }
    }
    return true;
  }

  place(type: string, x: number, y: number, dir: Dir): PlacedItem | undefined {
    const def = asset(type);
    if (!def) {
      return undefined;
    }
    const facing = def.facings.includes(dir) ? dir : def.facings[0];
    if (!this.canPlace(type, x, y, facing)) {
      return undefined;
    }
    const item: PlacedItem = { uid: this.nextUid++, type, x, y, dir: facing };
    this.layout.items.push(item);
    this.commit();
    return item;
  }

  move(item: PlacedItem, x: number, y: number): boolean {
    if (!this.canPlace(item.type, x, y, item.dir, item.uid)) {
      return false;
    }
    item.x = x;
    item.y = y;
    this.commit();
    return true;
  }

  /** Changes an item's asset and/or facing in place (rotate, swap for a look-alike). */
  retype(item: PlacedItem, type: string, dir: Dir = item.dir): boolean {
    if (!this.canPlace(type, item.x, item.y, dir, item.uid)) {
      return false;
    }
    item.type = type;
    item.dir = dir;
    this.commit();
    return true;
  }

  remove(item: PlacedItem): void {
    this.layout.items = this.layout.items.filter((i) => i !== item);
    this.commit();
  }

  paintFloor(x: number, y: number, type: string | null): void {
    if (!this.inBounds(x, y) || this.layout.floor[y * this.w + x] === type) {
      return;
    }
    this.layout.floor[y * this.w + x] = type;
    if (!type) {
      this.layout.walls[y * this.w + x] = null;
      this.layout.items = this.layout.items.filter((i) => !this.covers(i, x, y));
    }
    this.commit();
  }

  setWall(x: number, y: number, style: string | null): void {
    if (!this.inBounds(x, y) || this.layout.walls[y * this.w + x] === style || !this.layout.floor[y * this.w + x]) {
      return;
    }
    const was = this.layout.walls[y * this.w + x];
    this.layout.walls[y * this.w + x] = style;
    this.layout.items = this.layout.items.filter((i) => {
      const def = this.defOf(i);
      if (!def) {
        return true;
      }
      if (def.layer === 'wall') {
        return this.canPlace(i.type, i.x, i.y, i.dir, i.uid);
      }
      return !(style && !was && this.covers(i, x, y));
    });
    this.commit();
  }

  replaceLayout(layout: Layout): void {
    this.layout = layout;
    this.nextUid = Math.max(0, ...layout.items.map((i) => i.uid)) + 1;
    this.commit();
  }

  covers(item: PlacedItem, x: number, y: number): boolean {
    const v = this.variantOf(item);
    return !!v && x >= item.x && y >= item.y && x < item.x + v.w && y < item.y + v.h;
  }

  /** 4-directional A* over a cost grid; the goal tile is always enterable so seats can be reached. */
  private search(grid: Uint8Array, sx: number, sy: number, gx: number, gy: number): [number, number][] | null {
    const { w, h } = this;
    if (!this.inBounds(gx, gy) || !this.inBounds(sx, sy)) {
      return null;
    }
    const start = sy * w + sx;
    const goal = gy * w + gx;
    const g = new Float32Array(w * h).fill(Infinity);
    const came = new Int32Array(w * h).fill(-1);
    const open = new MinHeap();
    g[start] = 0;
    open.push(start, 0);
    while (open.size) {
      const cur = open.pop();
      if (cur === goal) {
        const path: [number, number][] = [];
        for (let c = goal; c !== start; c = came[c]) {
          path.push([c % w, Math.floor(c / w)]);
        }
        return path.reverse();
      }
      const cx = cur % w;
      const cy = Math.floor(cur / w);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.inBounds(nx, ny)) {
          continue;
        }
        const n = ny * w + nx;
        const c = n === goal ? 1 : grid[n];
        if (!c) {
          continue;
        }
        const ng = g[cur] + c;
        if (ng < g[n]) {
          g[n] = ng;
          came[n] = cur;
          open.push(n, ng + Math.abs(nx - gx) + Math.abs(ny - gy));
        }
      }
    }
    return null;
  }

  findPath(sx: number, sy: number, gx: number, gy: number): [number, number][] | null {
    return this.search(this.cost, sx, sy, gx, gy);
  }

  findRoadPath(sx: number, sy: number, gx: number, gy: number): [number, number][] | null {
    return this.search(this.road, sx, sy, gx, gy);
  }

  /** Drivable tiles on the map border, where cars come and go. */
  roadEntrances(): [number, number][] {
    const out: [number, number][] = [];
    for (let x = 0; x < this.w; x++) {
      for (const y of [0, this.h - 1]) {
        if (this.drivable(x, y)) {
          out.push([x, y]);
        }
      }
    }
    for (let y = 1; y < this.h - 1; y++) {
      for (const x of [0, this.w - 1]) {
        if (this.drivable(x, y)) {
          out.push([x, y]);
        }
      }
    }
    return out;
  }

  nearestWalkable(x: number, y: number): [number, number] {
    for (let r = 0; r < Math.max(this.w, this.h); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && this.walkable(x + dx, y + dy) && this.cost[(y + dy) * this.w + x + dx] === 1) {
            return [x + dx, y + dy];
          }
        }
      }
    }
    return [x, y];
  }

  randomIndoorTile(rand: () => number): [number, number] {
    for (let i = 0; i < 400; i++) {
      const x = Math.floor(rand() * this.w);
      const y = Math.floor(rand() * this.h);
      if (!this.isOutdoor(x, y) && this.floorAt(x, y) && this.cost[y * this.w + x] === 1) {
        return [x, y];
      }
    }
    return [Math.floor(this.w / 2), Math.floor(this.h / 2)];
  }
}

const NEIGHBORS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, p: number): void {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) {
        break;
      }
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastPrio = this.prio.pop()!;
    if (this.items.length) {
      this.items[0] = lastItem;
      this.prio[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l] < this.prio[m]) {
          m = l;
        }
        if (r < this.items.length && this.prio[r] < this.prio[m]) {
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
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}
