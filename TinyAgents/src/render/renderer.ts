import { MAX_CSS_ZOOM, TILE, WALL_FACE_H, WALL_LINE, ZOOM_LEVELS } from '../config';
import { variant } from '../art/registry';
import { AssetDef, Dir, Part, Variant } from '../art/types';
import { PlacedItem } from '../world/layout';
import { Office } from '../world/office';
import { FloorLayer, fillPixelEllipse, fillShadow } from './floorLayer';
import { Lighting, PlacedLight, placedLight } from './lighting';
import { WallGeom, WallSprite, buildWallSprite, wallGeom } from './walls';

export interface Camera {
  x: number;
  y: number;
  /** Device px per world px, one of ZOOM_LEVELS. */
  zoom: number;
}

/** What the renderer reads from an agent (docs/ENGINE_CONTRACT.md). */
export interface AgentView {
  x: number;
  y: number;
  alpha: number;
  seated: boolean;
  bubble: { text: string; icon?: string; t: number } | null;
  anim: number;
  name: string;
  profession: { title: string; badge: string };
  statusText: string;
  info: { waiting: boolean };
  /** tile being stepped into and the walk ahead: doors open only for people passing through */
  seg: readonly [number, number] | null;
  path: readonly (readonly [number, number])[];
  currentFrame(): HTMLCanvasElement;
  spriteOrigin(): [number, number];
  hitTest(wx: number, wy: number): boolean;
}

/** A moving car: centre in world px, facing, and the vehicle asset to draw (never rotated). */
export interface CarView {
  x: number;
  y: number;
  dir: Dir;
  alpha: number;
  assetId: string;
}

export type Overlay = (ctx: CanvasRenderingContext2D) => void;

/** A storey drawn beneath the one on screen (the ground floor's outdoors, the façades of the floors below). */
export interface Underlay<A> {
  /** px it's drawn higher than the ground (level × STOREY_H) */
  lift: number;
  office: Office;
  agents: readonly A[];
  cars: Iterable<CarView>;
  layers: readonly RenderLayer[];
  liftOpen: (uid: number) => number;
}

/** Extra drawing contributed by features (director extensions). All hooks are optional. */
export interface RenderLayer {
  /** World-space drawables depth-sorted with items and agents; `key` is a foot y in world px. */
  drawables?(view: Rect, push: (key: number, draw: (ctx: CanvasRenderingContext2D) => void) => void): void;
  /** World space, after day/night lighting (weather, particles, glowing signs). */
  afterLighting?(ctx: CanvasRenderingContext2D, view: Rect): void;
  /** Screen space (device px) after speech bubbles; `toScreen` maps world px to device px, `scale` is device px per world px. */
  screen?(ctx: CanvasRenderingContext2D, toScreen: (wx: number, wy: number) => [number, number], scale: number): void;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ItemView {
  item: PlacedItem;
  def: AssetDef;
  v: Variant;
  /** Pixel offset added to parts (wall-layer items sit on their wall face). */
  dy: number;
  /** World-px bounds over all frames, for culling. */
  bounds: Rect;
  /** Surface items: draw right after this key (the host's front-most part). Wall items: the wall's key. */
  after: number | null;
  /** Wall-layer items: wall tile indices they hang on (for fading). */
  wallTiles: number[];
}

interface Drawable {
  key: number;
  draw: () => void;
}

const VOID = '#2b2d39';
const SHADOW = 'rgb(24, 16, 28)';
const SHADOW_ALPHA = 0.26;
const FADED = 0.4;
const GHOST = 0.55;
const DOOR_SPEED = 3.5;

function partsBounds(frames: Part[][]): Rect {
  const all = frames.flat();
  if (!all.length) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  const x0 = Math.min(...all.map((p) => p.x));
  const y0 = Math.min(...all.map((p) => p.y));
  const x1 = Math.max(...all.map((p) => p.x + p.canvas.width));
  const y1 = Math.max(...all.map((p) => p.y + p.canvas.height));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export class Renderer<A extends AgentView = AgentView> {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  camera: Camera = { x: 0, y: 0, zoom: 2 };
  hovered: A | null = null;
  selected: A | null = null;
  showGrid = false;
  /** Edit mode: all walls translucent. */
  ghostWalls = false;
  readonly lighting = new Lighting();
  /** Elevator door openness by item uid (director.liftOpen). */
  liftOpen: (uid: number) => number = () => 0;

  private floor = new FloorLayer();
  private builtVersion = -1;
  /** each floor is its own Office: switching floors rebuilds even when versions match */
  private builtFor: Office | null = null;
  private geoms = new Map<number, WallGeom>();
  private walls: WallSprite[] = [];
  private wallCache = new Map<string, WallSprite>();
  private items: ItemView[] = [];
  private lights: PlacedLight[] = [];
  private wallAlpha = new Map<number, number>();
  private doorOpen = new Map<number, number>();
  private time = 0;
  private last = performance.now();
  private worldW = 0;
  private worldH = 0;
  /** px this floor is drawn higher than the ground (level × STOREY_H); screen mapping and input include it */
  lift = 0;
  /** draw the storeys below, sharing this canvas and camera */
  private belows: Renderer<A>[] = [];
  /** an underlay above the ground: draws over the storeys below instead of clearing the canvas */
  private stacked = false;

  constructor(
    canvas: HTMLCanvasElement,
    /** an underlay renderer: leaves feature effects and the hover label to the floor on top */
    private underlay = false,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
  }

  /** Device px per world px. */
  get scale(): number {
    return this.camera.zoom;
  }

  /** CSS px per world px: turns finger and mouse movement into world movement. */
  get cssScale(): number {
    return this.camera.zoom / (window.devicePixelRatio || 1);
  }

  /** From the level where the whole map fits on screen, in to MAX_CSS_ZOOM. */
  private get zoomLevels(): number[] {
    const fit = Math.min(this.canvas.width / this.worldW, this.canvas.height / this.worldH);
    const inRange = ZOOM_LEVELS.filter((z) => z <= MAX_CSS_ZOOM * (window.devicePixelRatio || 1));
    const min = Math.max(inRange[0], ...inRange.filter((z) => z <= fit));
    return inRange.filter((z) => z >= min);
  }

  /** Zooms to the level closest to `zoom`, keeping the world point under screen point (sx, sy) in place. */
  zoomTo(sx: number, sy: number, zoom: number): void {
    const dist = (z: number) => Math.abs(Math.log(z / zoom));
    const next = this.zoomLevels.reduce((best, z) => (dist(z) < dist(best) ? z : best));
    if (next === this.camera.zoom) {
      return;
    }
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.camera.zoom = next;
    const [wx2, wy2] = this.screenToWorld(sx, sy);
    this.camera.x += wx - wx2;
    this.camera.y += wy - wy2;
  }

  private get origin(): [number, number] {
    const s = this.scale;
    return [Math.round(this.canvas.width / 2 - this.camera.x * s), Math.round(this.canvas.height / 2 - (this.camera.y + this.lift) * s)];
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    const dpr = window.devicePixelRatio || 1;
    const s = this.scale;
    const [tx, ty] = this.origin;
    return [(sx * dpr - tx) / s, (sy * dpr - ty) / s];
  }

  /** One level in (`direction` 1) or out (-1) around screen point (sx, sy). */
  zoomAt(sx: number, sy: number, direction: number): void {
    const levels = this.zoomLevels;
    const idx = levels.findIndex((z) => z >= this.camera.zoom);
    const at = idx < 0 ? levels.length - 1 : idx;
    this.zoomTo(sx, sy, levels[Math.max(0, Math.min(levels.length - 1, at + direction))]);
  }

  /** Vertical px offset for wall-layer art on wall tile (x, y): the footprint's bottom edge sits on the face's floor line. */
  wallOffset(office: Office, x: number, y: number): number {
    if (!office.wallAt(x, y)) {
      return 0;
    }
    const g = this.builtVersion === office.version ? this.geoms.get(y * office.w + x) : undefined;
    return (g ?? wallGeom(office, x, y)).faceBottom - TILE;
  }

  private rebuild(office: Office): void {
    this.builtVersion = office.version;
    const { w, h } = office;
    this.worldW = w * TILE;
    this.worldH = h * TILE;
    this.geoms.clear();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (office.wallAt(x, y)) {
          this.geoms.set(y * w + x, wallGeom(office, x, y));
        }
      }
    }
    const geomAt = (x: number, y: number) => (office.inBounds(x, y) ? this.geoms.get(y * w + x) : undefined);
    const cache = new Map<string, WallSprite>();
    this.walls = [];
    for (const g of this.geoms.values()) {
      const left = geomAt(g.x - 1, g.y);
      const right = geomAt(g.x + 1, g.y);
      const sig = [
        office.wallAt(g.x - 1, g.y),
        office.wallAt(g.x, g.y),
        office.wallAt(g.x + 1, g.y),
        office.floorAt(g.x - 1, g.y),
        office.floorAt(g.x + 1, g.y),
        office.floorAt(g.x, g.y - 1),
        office.floorAt(g.x, g.y + 1),
        g.x,
        g.y,
        g.ax,
        g.ay,
        +g.n,
        +g.s,
        +g.w,
        +g.e,
        g.face.map(Number).join(''),
        left?.face[TILE - 1] ? left.bottoms[TILE - 1] : -1,
        right?.face[0] ? right.bottoms[0] : -1,
      ].join('|');
      const sprite = this.wallCache.get(sig) ?? buildWallSprite(office, g, geomAt);
      cache.set(sig, sprite);
      this.walls.push(sprite);
    }
    this.wallCache = cache;

    this.items = [];
    this.lights = [];
    const views = new Map<number, ItemView>();
    for (const item of office.layout.items) {
      const def = office.defOf(item);
      const v = office.variantOf(item);
      if (!def || !v || def.layer === 'floor') {
        continue;
      }
      const dy = def.layer === 'wall' ? this.wallOffset(office, item.x, item.y + v.h - 1) : 0;
      const b = partsBounds(v.frames);
      const view: ItemView = {
        item,
        def,
        v,
        dy,
        bounds: { x: item.x * TILE + b.x, y: item.y * TILE + b.y + dy, w: b.w, h: b.h },
        after: null,
        wallTiles: [],
      };
      if (def.layer === 'wall') {
        let key = 0;
        for (let dx = 0; dx < v.w; dx++) {
          const idx = (item.y + v.h - 1) * w + item.x + dx;
          view.wallTiles.push(idx);
          key = Math.max(key, this.geoms.get(idx)?.key ?? 0);
        }
        view.after = key;
      }
      views.set(item.uid, view);
      this.items.push(view);
      for (const l of v.lights ?? []) {
        const lx = item.x + Math.max(0, Math.min(v.w - 1, Math.floor(l.x / TILE)));
        const ly = def.layer === 'wall' ? item.y + v.h : item.y + v.h - 1;
        this.lights.push(placedLight(item.x * TILE + l.x, item.y * TILE + l.y + dy, lx, ly, l));
      }
    }
    for (const view of this.items) {
      if (view.def.layer !== 'surface') {
        continue;
      }
      const host = office.hostOf(view.item);
      const hv = host && views.get(host.uid);
      const hostKey = hv ? Math.max(...(hv.v.frames[0] ?? []).map((p) => hv.item.y * TILE + p.z)) : (view.item.y + 1) * TILE;
      view.after = hostKey;
    }
    this.floor.sync(office);
  }

  private frameOf(view: ItemView): Part[] {
    const { v, def, item } = view;
    const frames = v.frames;
    if (frames.length <= 1 || !v.anim) {
      return frames[0] ?? [];
    }
    if (v.anim.kind === 'loop') {
      const phase = v.anim.desync ? item.x * 7 + item.y * 13 : 0;
      return frames[(Math.floor(this.time * (v.anim.fps ?? 4)) + phase) % frames.length];
    }
    const open = def.door ? this.doorOpen.get(item.uid) ?? 0 : this.liftOpen(item.uid);
    return frames[Math.round(Math.max(0, Math.min(1, open)) * (frames.length - 1))];
  }

  /** Doors open by themselves while an agent is within one tile of them. */
  private updateDoors(agents: readonly A[], dt: number): void {
    for (const view of this.items) {
      if (!view.def.door) {
        continue;
      }
      const { item, v } = view;
      const inDoor = (t: readonly [number, number] | null | undefined) =>
        !!t && t[0] >= item.x && t[0] < item.x + v.w && t[1] >= item.y && t[1] < item.y + v.h;
      const near = agents.some(
        (a) => a.alpha > 0 && (inDoor([Math.floor(a.x / TILE), Math.floor(a.y / TILE)]) || inDoor(a.seg) || inDoor(a.path[0]) || inDoor(a.path[1])),
      );
      const cur = this.doorOpen.get(item.uid) ?? 0;
      this.doorOpen.set(item.uid, near ? Math.min(1, cur + dt * DOOR_SPEED) : Math.max(0, cur - dt * DOOR_SPEED * 0.7));
    }
  }

  /** Walls with an agent close behind them fade so the agent stays visible. */
  private updateWallFade(office: Office, agents: readonly A[], dt: number): void {
    const behind = new Set<number>();
    for (const a of agents) {
      if (a.alpha <= 0) {
        continue;
      }
      const ax = Math.floor(a.x / TILE);
      const ay = Math.floor(a.y / TILE);
      for (let dy = 0; dy <= 2; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = ax + dx;
          const y = ay + dy;
          const g = office.inBounds(x, y) ? this.geoms.get(y * office.w + x) : undefined;
          if (!g || a.y >= g.key) {
            continue;
          }
          const hit = a.x + 10 > x * TILE && a.x - 10 < (x + 1) * TILE && a.y - 44 < g.key && a.y > g.key - WALL_FACE_H - WALL_LINE;
          if (hit) {
            behind.add(y * office.w + x);
          }
        }
      }
    }
    const k = Math.min(1, dt * 8);
    for (const idx of this.geoms.keys()) {
      const target = this.ghostWalls ? GHOST : behind.has(idx) ? FADED : 1;
      const cur = this.wallAlpha.get(idx) ?? 1;
      const next = Math.abs(target - cur) < 0.01 ? target : cur + (target - cur) * k;
      if (next === 1) {
        this.wallAlpha.delete(idx);
      } else {
        this.wallAlpha.set(idx, next);
      }
    }
  }

  /**
   * Draws a floor, `lift` px up. `under` lists the storeys below (ground first), drawn first at their own lifts, so
   * each storey's south façade shows beneath the one above; tiles without floor here stay see-through, so the
   * street and the park show around an upper storey.
   */
  render(office: Office, agents: readonly A[], cars: Iterable<CarView>, overlay?: Overlay, layers: readonly RenderLayer[] = [], under: Underlay<A>[] = []): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    if (this.builtVersion !== office.version || this.builtFor !== office) {
      this.builtFor = office;
      this.rebuild(office);
    }
    this.updateDoors(agents, dt);
    this.updateWallFade(office, agents, dt);
    this.lighting.update(office, this.geoms, this.lights, now);

    const { ctx, canvas } = this;
    const s = this.scale;
    const [tx, ty] = this.origin;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    under.forEach((u, i) => {
      const below = (this.belows[i] ??= new Renderer<A>(canvas, true));
      below.camera = this.camera;
      below.lift = u.lift;
      below.stacked = i > 0;
      below.lighting.clock = this.lighting.clock;
      below.lighting.forcedHour = this.lighting.forcedHour;
      below.liftOpen = u.liftOpen;
      below.selected = this.selected;
      below.hovered = this.hovered;
      below.render(u.office, u.agents, u.cars, undefined, u.layers);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    });
    if (!under.length && !this.stacked) {
      ctx.fillStyle = VOID;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.setTransform(s, 0, 0, s, tx, ty);
    ctx.imageSmoothingEnabled = s < 1;

    const view: Rect = { x: -tx / s, y: -ty / s, w: canvas.width / s, h: canvas.height / s };
    const pad: Rect = { x: view.x - TILE * 2, y: view.y - TILE * 2, w: view.w + TILE * 4, h: view.h + TILE * 6 };
    this.floor.draw(ctx, office, this.geoms, view);

    const carList = [...cars];
    this.drawDynamicShadows(agents, carList);

    const list: Drawable[] = [];
    for (const iv of this.items) {
      if (!overlaps(iv.bounds, pad)) {
        continue;
      }
      const ox = iv.item.x * TILE;
      const oy = iv.item.y * TILE + iv.dy;
      const parts = this.frameOf(iv);
      const alpha = iv.wallTiles.length ? Math.min(...iv.wallTiles.map((i) => this.wallAlpha.get(i) ?? 1)) : 1;
      for (const p of parts) {
        const key = iv.after !== null ? iv.after + (iv.def.layer === 'wall' ? 0.5 : 0.25) : iv.item.y * TILE + p.z;
        list.push({
          key,
          draw: () => {
            ctx.globalAlpha = alpha;
            ctx.drawImage(p.canvas, ox + p.x, oy + p.y);
            ctx.globalAlpha = 1;
          },
        });
      }
    }
    for (const sp of this.walls) {
      const g = sp.geom;
      const x = g.x * TILE;
      const y = g.y * TILE - WALL_FACE_H;
      if (x + TILE < pad.x || x > pad.x + pad.w || y + TILE + WALL_FACE_H < pad.y || y > pad.y + pad.h) {
        continue;
      }
      const alpha = this.wallAlpha.get(g.y * office.w + g.x) ?? 1;
      list.push({
        key: g.key,
        draw: () => {
          ctx.globalAlpha = alpha;
          if (sp.face) {
            ctx.drawImage(sp.face, x, y);
          }
          if (sp.glass) {
            ctx.drawImage(sp.glass, x, y);
          }
          ctx.drawImage(sp.cap, x, y);
          ctx.globalAlpha = 1;
        },
      });
    }
    for (const a of agents) {
      if (a.alpha > 0) {
        list.push({ key: a.y, draw: () => this.drawAgent(a) });
      }
    }
    for (const car of carList) {
      const v = variant(car.assetId, car.dir);
      if (!v || car.alpha <= 0) {
        continue;
      }
      const ox = Math.round(car.x - (v.w * TILE) / 2);
      const oy = Math.round(car.y - (v.h * TILE) / 2);
      for (const p of v.frames[0] ?? []) {
        list.push({
          key: oy + p.z,
          draw: () => {
            ctx.globalAlpha = car.alpha;
            ctx.drawImage(p.canvas, ox + p.x, oy + p.y);
            ctx.globalAlpha = 1;
          },
        });
      }
    }
    for (const layer of layers) {
      layer.drawables?.(view, (key, draw) => list.push({ key, draw: () => draw(ctx) }));
    }
    list.sort((p, q) => p.key - q.key);
    for (const d of list) {
      d.draw();
    }

    this.lighting.composite(ctx);
    for (const layer of this.underlay ? [] : layers) {
      layer.afterLighting?.(ctx, view);
    }

    if (this.showGrid) {
      this.drawGrid(office);
    }
    overlay?.(ctx);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const a of agents) {
      this.drawBubble(a, tx, ty, s);
    }
    const toScreen = (wx: number, wy: number): [number, number] => [wx * s + tx, wy * s + ty];
    for (const layer of this.underlay ? [] : layers) {
      layer.screen?.(ctx, toScreen, s);
    }
    const label = this.hovered ?? this.selected;
    if (label && label.alpha > 0 && agents.includes(label)) {
      this.drawLabel(label, tx, ty, s);
    }
  }

  private drawDynamicShadows(agents: readonly A[], cars: CarView[]): void {
    const ctx = this.ctx;
    ctx.fillStyle = SHADOW;
    for (const a of agents) {
      if (a.alpha <= 0 || a.seated) {
        continue;
      }
      ctx.globalAlpha = SHADOW_ALPHA * a.alpha;
      fillPixelEllipse(ctx, Math.round(a.x) - 8, Math.round(a.y) - 3, 17, 5);
    }
    for (const car of cars) {
      const v = variant(car.assetId, car.dir);
      if (!v?.shadows || car.alpha <= 0) {
        continue;
      }
      ctx.globalAlpha = SHADOW_ALPHA * car.alpha;
      const ox = Math.round(car.x - (v.w * TILE) / 2);
      const oy = Math.round(car.y - (v.h * TILE) / 2);
      for (const sh of v.shadows) {
        fillShadow(ctx, sh, ox, oy);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawAgent(a: A): void {
    const ctx = this.ctx;
    ctx.globalAlpha = a.alpha;
    const [sx, sy] = a.spriteOrigin();
    ctx.drawImage(a.currentFrame(), sx, sy);
    if (a === this.selected) {
      const bob = Math.round(Math.sin(a.anim * 5) * 2);
      const ax = Math.round(a.x);
      const ay = Math.round(a.y) - 58 + bob;
      ctx.fillStyle = '#26232b';
      ctx.fillRect(ax - 6, ay - 1, 13, 3);
      ctx.fillStyle = '#e2b85a';
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(ax - 5 + i, ay + i, 11 - i * 2, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawBubble(a: A, tx: number, ty: number, s: number): void {
    if (!a.bubble || a.alpha < 1) {
      return;
    }
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const fontPx = Math.max(11, Math.round(s * 5.5 + 2));
    ctx.font = `${fontPx}px "Pixelify Sans", monospace`;
    const text = a.bubble.icon ? `${a.bubble.icon} ${a.bubble.text}` : a.bubble.text;
    const w = Math.ceil(ctx.measureText(text).width) + fontPx;
    const h = Math.round(fontPx * 1.5);
    const bx = Math.round(a.x * s + tx - w / 2);
    const by = Math.round((a.y - 50) * s + ty - h);
    ctx.globalAlpha = Math.min(1, a.bubble.t * 4);
    const u = Math.max(1, Math.round(s * 0.75));
    const bg = a.info.waiting ? '#ffe9a8' : '#fbf7ec';
    ctx.fillStyle = '#26232b';
    ctx.fillRect(bx - u, by, w + 2 * u, h);
    ctx.fillRect(bx, by - u, w, h + 2 * u);
    ctx.fillStyle = bg;
    ctx.fillRect(bx, by, w, h);
    const tailX = Math.round(a.x * s + tx);
    ctx.fillStyle = '#26232b';
    ctx.fillRect(tailX - 2 * u, by + h, 4 * u, 2 * u);
    ctx.fillStyle = bg;
    ctx.fillRect(tailX - u, by + h, 2 * u, u);
    ctx.fillStyle = '#26232b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + w / 2, by + h / 2 + dpr);
    ctx.globalAlpha = 1;
  }

  private drawLabel(a: A, tx: number, ty: number, s: number): void {
    const ctx = this.ctx;
    const fontPx = Math.max(12, Math.round(s * 5 + 3));
    const small = Math.round(fontPx * 0.8);
    const title = `${a.name} · ${a.profession.title}`;
    const sub = a.statusText;
    ctx.font = `${fontPx}px "Pixelify Sans", monospace`;
    const w1 = ctx.measureText(title).width;
    ctx.font = `${small}px "Pixelify Sans", monospace`;
    const w2 = ctx.measureText(sub).width;
    const w = Math.ceil(Math.max(w1, w2)) + fontPx;
    const h = Math.round(fontPx * 2.6);
    const bx = Math.round(a.x * s + tx - w / 2);
    const by = Math.round((a.y + 6) * s + ty);
    ctx.fillStyle = 'rgba(36, 37, 48, 0.92)';
    ctx.fillRect(bx, by, w, h);
    ctx.fillStyle = a.profession.badge;
    ctx.fillRect(bx, by, Math.max(3, Math.round(s * 1.5)), h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f1ead9';
    ctx.font = `${fontPx}px "Pixelify Sans", monospace`;
    ctx.fillText(title, bx + w / 2, by + h * 0.33);
    ctx.fillStyle = '#b4b1bd';
    ctx.font = `${small}px "Pixelify Sans", monospace`;
    ctx.fillText(sub, bx + w / 2, by + h * 0.72);
  }

  private drawGrid(office: Office): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let x = 0; x <= office.w; x++) {
      ctx.fillRect(x * TILE, 0, 1, office.h * TILE);
    }
    for (let y = 0; y <= office.h; y++) {
      ctx.fillRect(0, y * TILE, office.w * TILE, 1);
    }
  }
}
