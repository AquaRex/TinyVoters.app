import { TILE } from '../config';
import { allAssets, allFloors, allWallStyles, asset, swapsFor, variant } from '../art/registry';
import { AssetDef, Category, Dir } from '../art/types';
import { assetSprite, floorSwatch, thumbnail } from '../render/preview';
import { Renderer } from '../render/renderer';
import { wallSwatch } from '../render/walls';
import { defaultLayout, PlacedItem } from '../world/layout';
import { Office } from '../world/office';

type Tool = 'select' | 'place' | 'floor' | 'wall';

const CATEGORIES: Category[] = ['Work', 'Meeting', 'Lounge', 'Kitchen', 'Restroom', 'Decor', 'Lighting', 'Structure', 'Outdoor', 'Vehicles'];
const PAGE = 120;

function nextFacing(def: AssetDef, dir: Dir): Dir {
  const i = def.facings.indexOf(dir);
  return def.facings[(i + 1) % def.facings.length];
}

export class Editor {
  active = false;
  private tool: Tool = 'select';
  private placeType: string | null = null;
  private placeDir: Dir = 'down';
  private floorType: string | null | undefined;
  private wallStyle: string | null = null;
  private selected: PlacedItem | null = null;
  private moving: { item: PlacedItem; grabDx: number; grabDy: number } | null = null;
  private hover: [number, number] | null = null;
  private painting = false;
  private wallErase = false;
  private category: Category = 'Work';
  private query = '';
  private shown = PAGE;
  private root: HTMLElement;

  constructor(private office: Office, private renderer: Renderer, private notify: (msg: string) => void) {
    this.root = document.getElementById('editor')!;
    this.buildUI();
  }

  setActive(on: boolean): void {
    this.active = on;
    this.root.hidden = !on;
    this.renderer.showGrid = on;
    this.renderer.ghostWalls = on;
    if (!on) {
      this.selected = null;
      this.moving = null;
      this.painting = false;
    }
    this.renderBody();
  }

  // ---------- UI ----------

  private buildUI(): void {
    this.root.innerHTML = `
      <div class="ed-tabs" role="tablist">
        <button data-tool="select" title="Select, move, rotate and swap (V)">Select</button>
        <button data-tool="place" title="Place furniture and decor">Assets</button>
        <button data-tool="floor" title="Paint floor">Floor</button>
        <button data-tool="wall" title="Draw walls">Walls</button>
        <span class="spacer"></span>
        <button data-act="reset" class="danger" title="Restore the default office">Reset office</button>
      </div>
      <div class="ed-body"></div>`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) =>
      b.addEventListener('click', () => this.setTool(b.dataset.tool as Tool)),
    );
    this.root.querySelector('[data-act="reset"]')!.addEventListener('click', () => {
      if (confirm('Reset the office to the default layout? Your edits will be lost.')) {
        this.selected = null;
        this.office.replaceLayout(defaultLayout());
        this.renderBody();
      }
    });
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.moving = null;
    if (tool !== 'select') {
      this.selected = null;
    }
    this.renderBody();
  }

  private assetButton(def: AssetDef, dir: Dir, on: boolean, onClick: () => void, label = def.name): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'tile-btn' + (on ? ' on' : '');
    const v = variant(def.id, dir);
    b.title = `${def.name} · ${def.id}${v ? ` · ${v.w}×${v.h}` : ''}`;
    const holder = document.createElement('div');
    holder.className = 'thumb';
    holder.append(thumbnail(def.id, dir, 64));
    const span = document.createElement('span');
    span.textContent = label;
    b.append(holder, span);
    b.addEventListener('click', onClick);
    return b;
  }

  private renderBody(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === this.tool));
    const body = this.root.querySelector<HTMLElement>('.ed-body')!;
    body.innerHTML = '';
    switch (this.tool) {
      case 'select':
        this.renderSelect(body);
        break;
      case 'place':
        this.renderAssets(body);
        break;
      case 'floor':
        this.renderFloors(body);
        break;
      case 'wall':
        this.renderWalls(body);
        break;
    }
  }

  private renderSelect(body: HTMLElement): void {
    const item = this.selected;
    const def = item && this.office.defOf(item);
    if (!item || !def) {
      body.innerHTML = `<p class="hint">Click something to select it, drag to move. <kbd>R</kbd> turns it to face another way, <kbd>Del</kbd> removes it. Right-drag pans the camera.</p>`;
      return;
    }
    const v = this.office.variantOf(item)!;
    const head = document.createElement('div');
    head.className = 'sel-head';
    const preview = document.createElement('div');
    preview.className = 'thumb big';
    preview.append(thumbnail(item.type, item.dir, 80));
    const info = document.createElement('div');
    info.innerHTML = `<b></b><small></small>`;
    info.querySelector('b')!.textContent = def.name;
    info.querySelector('small')!.textContent = `${def.category} · ${def.id} · ${v.w}×${v.h}${def.facings.length > 1 ? ` · faces ${item.dir}` : ''}`;
    const actions = document.createElement('div');
    actions.className = 'sel-actions';
    const rot = document.createElement('button');
    rot.textContent = 'Rotate';
    rot.disabled = def.facings.length < 2;
    rot.addEventListener('click', () => this.rotate());
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', () => this.deleteSelected());
    actions.append(rot, del);
    head.append(preview, info, actions);
    body.append(head);

    const options = swapsFor(item.type).filter((o) => o.facings.includes(item.dir));
    if (!options.length) {
      body.insertAdjacentHTML('beforeend', `<p class="hint">Nothing else in the "${def.group}" group to swap with.</p>`);
      return;
    }
    const title = document.createElement('p');
    title.className = 'hint';
    title.textContent = `Swap for another ${def.group} (${options.length}):`;
    body.append(title);
    const grid = document.createElement('div');
    grid.className = 'swatch-grid';
    for (const o of options) {
      grid.append(
        this.assetButton(o, item.dir, false, () => {
          if (!this.office.retype(item, o.id)) {
            this.notify("That one doesn't fit here");
          }
          this.renderBody();
        }),
      );
    }
    body.append(grid);
  }

  private renderAssets(body: HTMLElement): void {
    const bar = document.createElement('div');
    bar.className = 'ed-filter';
    const search = document.createElement('input');
    search.placeholder = 'Search by name, id or keyword: sofa, plant, lamp…';
    search.value = this.query;
    search.addEventListener('input', () => {
      this.query = search.value;
      this.shown = PAGE;
      chipsOn();
      this.renderList(list);
    });
    bar.append(search);
    const chips = document.createElement('div');
    chips.className = 'chips';
    const counts = new Map<Category, number>();
    for (const a of allAssets()) {
      counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
    }
    const chipsOn = () => chips.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.cat === this.category && !this.query.trim()));
    for (const cat of CATEGORIES) {
      const b = document.createElement('button');
      b.dataset.cat = cat;
      b.textContent = `${cat} ${counts.get(cat) ?? 0}`;
      b.addEventListener('click', () => {
        this.category = cat;
        this.query = '';
        search.value = '';
        this.shown = PAGE;
        chipsOn();
        this.renderList(list);
      });
      chips.append(b);
    }
    chipsOn();
    const list = document.createElement('div');
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.innerHTML = 'Click to place. <kbd>R</kbd> turns the piece before placing. Surface items go on desks and tables, wall items on walls facing a room.';
    body.append(bar, chips, hint, list);
    this.renderList(list);
    search.focus();
  }

  private renderList(list: HTMLElement): void {
    list.innerHTML = '';
    const q = this.query.trim().toLowerCase();
    const defs = allAssets().filter((d) =>
      q ? `${d.name} ${d.id} ${d.group} ${(d.keywords ?? []).join(' ')}`.toLowerCase().includes(q) : d.category === this.category,
    );
    if (!defs.length) {
      list.innerHTML = `<p class="hint">Nothing here yet.</p>`;
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'swatch-grid';
    for (const d of defs.slice(0, this.shown)) {
      const btn = this.assetButton(d, d.facings[0], d.id === this.placeType, () => {
        this.placeType = d.id;
        this.placeDir = d.facings[0];
        grid.querySelectorAll('.on').forEach((e) => e.classList.remove('on'));
        btn.classList.add('on');
      });
      grid.append(btn);
    }
    list.append(grid);
    if (defs.length > this.shown) {
      const more = document.createElement('button');
      more.className = 'more';
      more.textContent = `Show more (${defs.length - this.shown} left)`;
      more.addEventListener('click', () => {
        this.shown += PAGE;
        this.renderList(list);
      });
      list.append(more);
    }
  }

  private swatchButton(id: string | null, name: string, preview: HTMLCanvasElement | null, on: boolean, pick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'tile-btn' + (on ? ' on' : '') + (preview ? '' : ' void');
    b.title = id ? `${name} · ${id}` : name;
    if (preview) {
      preview.classList.add('pix');
      b.append(preview);
    }
    const span = document.createElement('span');
    span.textContent = name;
    b.append(span);
    b.addEventListener('click', () => {
      pick();
      this.renderBody();
    });
    return b;
  }

  private renderFloors(body: HTMLElement): void {
    const floors = allFloors();
    if (this.floorType === undefined && floors.length) {
      this.floorType = floors[0].id;
    }
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Drag to paint floor. Outdoor floors are where people walk outside; asphalt is drivable.';
    const grid = document.createElement('div');
    grid.className = 'swatch-grid small';
    for (const f of [...floors.filter((f) => !f.outdoor), ...floors.filter((f) => f.outdoor)]) {
      grid.append(this.swatchButton(f.id, f.name, floorSwatch(f.id), f.id === this.floorType, () => (this.floorType = f.id)));
    }
    grid.append(this.swatchButton(null, 'Remove floor', null, this.floorType === null, () => (this.floorType = null)));
    body.append(hint, grid);
  }

  private renderWalls(body: HTMLElement): void {
    const styles = allWallStyles();
    if (!this.wallStyle && styles.length) {
      this.wallStyle = styles[0].id;
    }
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Drag to build walls in the chosen style. Start a drag on an existing wall to erase. Wall decor hangs on walls that face into a room.';
    const grid = document.createElement('div');
    grid.className = 'swatch-grid small';
    for (const w of styles) {
      const swatch = wallSwatch(w.id);
      swatch.classList.add('wall');
      grid.append(this.swatchButton(w.id, w.name, swatch, w.id === this.wallStyle, () => (this.wallStyle = w.id)));
    }
    if (!styles.length) {
      body.append(hint);
      body.insertAdjacentHTML('beforeend', `<p class="hint">No wall styles registered yet.</p>`);
      return;
    }
    body.append(hint, grid);
  }

  // ---------- input ----------

  pointerDown(tx: number, ty: number): void {
    this.hover = [tx, ty];
    switch (this.tool) {
      case 'place': {
        if (!this.placeType) {
          this.notify('Pick an asset first');
          break;
        }
        const def = asset(this.placeType)!;
        const [px, py] = this.anchorFor(this.placeType, this.placeDir, tx, ty, -1);
        if (!this.office.place(this.placeType, px, py, this.placeDir)) {
          this.notify(def.layer === 'wall' ? 'Wall decor goes on a wall facing a room' : def.layer === 'surface' ? 'Place it on a desk, table or counter' : "Can't place that here");
        }
        break;
      }
      case 'floor':
        this.painting = true;
        this.office.paintFloor(tx, ty, this.floorType ?? null);
        break;
      case 'wall':
        this.painting = true;
        this.wallErase = !!this.office.wallAt(tx, ty);
        this.office.setWall(tx, ty, this.wallErase ? null : this.wallStyle);
        break;
      case 'select': {
        const item = this.pick(tx, ty);
        this.selected = item ?? null;
        if (item) {
          this.moving = { item, grabDx: tx - item.x, grabDy: ty - item.y };
        }
        this.renderBody();
        break;
      }
    }
  }

  /** What's under the cursor: surface items first, then objects, wall decor (on the face above), then floor art. */
  private pick(tx: number, ty: number): PlacedItem | undefined {
    return (
      this.office.itemAt(tx, ty, 'surface') ??
      this.office.itemAt(tx, ty, 'object') ??
      this.office.itemAt(tx, ty, 'wall') ??
      this.office.itemAt(tx, ty + 1, 'wall') ??
      this.office.itemAt(tx, ty, 'floor')
    );
  }

  /**
   * Footprint top-left for the cursor tile: the cursor sits on the item's bottom row, centred. Wall decor also
   * accepts the tile just above the wall, since that's where its face shows.
   */
  private anchorFor(type: string, dir: Dir, tx: number, ty: number, ignoreUid: number): [number, number] {
    const v = variant(type, dir)!;
    const x = tx - Math.floor((v.w - 1) / 2);
    const y = ty - (v.h - 1);
    if (asset(type)!.layer === 'wall' && !this.office.canPlace(type, x, y, dir, ignoreUid) && this.office.canPlace(type, x, y + 1, dir, ignoreUid)) {
      return [x, y + 1];
    }
    return [x, y];
  }

  pointerMove(tx: number, ty: number): void {
    const changed = !this.hover || this.hover[0] !== tx || this.hover[1] !== ty;
    this.hover = [tx, ty];
    if (!changed || !this.painting) {
      return;
    }
    if (this.tool === 'floor') {
      this.office.paintFloor(tx, ty, this.floorType ?? null);
    } else if (this.tool === 'wall') {
      this.office.setWall(tx, ty, this.wallErase ? null : this.wallStyle);
    }
  }

  pointerUp(): void {
    this.painting = false;
    if (this.moving && this.hover) {
      const { item, grabDx, grabDy } = this.moving;
      const nx = this.hover[0] - grabDx;
      const ny = this.hover[1] - grabDy;
      if ((nx !== item.x || ny !== item.y) && !this.office.move(item, nx, ny)) {
        this.notify("Can't move it there");
      }
    }
    this.moving = null;
  }

  leave(): void {
    this.hover = null;
  }

  cancel(): void {
    if (this.tool !== 'select') {
      this.setTool('select');
    } else {
      this.selected = null;
      this.renderBody();
    }
  }

  /** Turns the piece being placed, or the selected item, to its next facing (only if it still fits). */
  rotate(): void {
    if (this.tool === 'place' && this.placeType) {
      const def = asset(this.placeType)!;
      if (def.facings.length < 2) {
        this.notify('This piece only faces one way');
      }
      this.placeDir = nextFacing(def, this.placeDir);
      return;
    }
    const item = this.selected;
    const def = item && this.office.defOf(item);
    if (!item || !def) {
      return;
    }
    if (def.facings.length < 2) {
      this.notify('This piece only faces one way');
      return;
    }
    let dir = item.dir;
    for (let k = 1; k < def.facings.length; k++) {
      dir = nextFacing(def, dir);
      if (this.office.retype(item, item.type, dir)) {
        this.renderBody();
        return;
      }
    }
    this.notify('No room to turn it here');
  }

  deleteSelected(): void {
    if (!this.selected) {
      return;
    }
    this.office.remove(this.selected);
    this.selected = null;
    this.renderBody();
  }

  // ---------- overlay ----------

  overlay = (ctx: CanvasRenderingContext2D): void => {
    if (!this.active) {
      return;
    }
    if (this.selected && !this.moving) {
      const v = this.office.variantOf(this.selected);
      if (v) {
        this.outline(ctx, this.selected.x, this.selected.y, v.w, v.h, '#e2b85a');
      }
    }
    if (!this.hover) {
      return;
    }
    const [hx, hy] = this.hover;
    if (this.moving) {
      const { item, grabDx, grabDy } = this.moving;
      this.ghost(ctx, item.type, item.dir, hx - grabDx, hy - grabDy, item.uid);
    } else if (this.tool === 'place' && this.placeType) {
      const [px, py] = this.anchorFor(this.placeType, this.placeDir, hx, hy, -1);
      this.ghost(ctx, this.placeType, this.placeDir, px, py, -1);
    } else {
      ctx.strokeStyle = this.tool === 'wall' ? '#c9a7ff' : this.tool === 'floor' ? '#7fdcef' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(hx * TILE + 1, hy * TILE + 1, TILE - 2, TILE - 2);
    }
  };

  private ghost(ctx: CanvasRenderingContext2D, type: string, dir: Dir, x: number, y: number, ignoreUid: number): void {
    const def = asset(type);
    const v = def && variant(type, dir);
    const sprite = assetSprite(type, dir);
    if (!def || !v || !sprite) {
      return;
    }
    const ok = this.office.canPlace(type, x, y, dir, ignoreUid);
    const lift = def.layer === 'wall' ? this.renderer.wallOffset(this.office, x, y + v.h - 1) : 0;
    ctx.globalAlpha = 0.8;
    ctx.drawImage(sprite.canvas, x * TILE - sprite.ox, y * TILE - sprite.oy + lift);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ok ? 'rgba(90, 220, 140, 0.22)' : 'rgba(240, 80, 80, 0.32)';
    ctx.fillRect(x * TILE, y * TILE, v.w * TILE, v.h * TILE);
    this.outline(ctx, x, y, v.w, v.h, ok ? '#5adc8c' : '#f05050');
  }

  private outline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x * TILE + 1, y * TILE + 1, w * TILE - 2, h * TILE - 2);
  }
}
