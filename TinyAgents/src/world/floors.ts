import { Agent, AgentInfo } from '../agents/agent';
import { Director } from '../agents/director';
import { Staff } from '../agents/staff';
import { app, Floor, Tower } from '../app';
import { Building, BuildingFloor, Layout, clearBuilding, defaultBuilding, loadBuilding, saveFloorLayout, saveFloorList } from './layout';
import { Office } from './office';

let setup: (f: Floor) => void = () => undefined;

function makeFloor(staff: Staff, bf: BuildingFloor, persist: boolean): Floor {
  const office = new Office(bf.layout);
  const director = new Director(office, staff, bf.level);
  staff.add(director);
  if (persist) {
    office.onChange(() => saveFloorLayout(bf.id, office.layout));
  }
  return { id: bf.id, label: bf.label, level: bf.level, office, director };
}

/** A running building from layouts: one office and director per floor, sharing one Staff. `persist` saves edits. */
export function buildTower(building: Building, persist = false): Tower {
  const staff = new Staff();
  const floors = [...building.floors].sort((p, q) => p.level - q.level).map((bf) => makeFloor(staff, bf, persist));
  return { floors, staff };
}

/** Loads the saved building; `onFloor` sets up each floor (also ones added later). Shows the first upper floor. */
export function initFloors(onFloor: (f: Floor) => void): void {
  setup = onFloor;
  app.building = buildTower(loadBuilding(), true);
  app.floors.forEach(setup);
  app.current = app.floors.find((f) => f.level === 1) ?? app.floors[0];
}

/** Hands the building the Claude sessions reported by the bridge. */
export function routeInfos(infos: AgentInfo[]): void {
  app.building.staff.sync(infos);
}

/** The floor someone is on right now. */
export function floorOf(a: Agent): Floor | undefined {
  return app.tower.floors.find((f) => f.director === a.floor);
}

/** The key on the elevator panel and the roster tag: the floor's number (the ground floor is 1). */
export function floorKey(f: { level: number }): string {
  return String(f.level + 1);
}

function saveList(): void {
  saveFloorList(app.floors);
}

/** Tiles of the building on a floor: its walls and indoor floor. */
function footprint(o: Office): boolean[] {
  const inside: boolean[] = [];
  for (let y = 0; y < o.h; y++) {
    for (let x = 0; x < o.w; x++) {
      inside.push(!!o.wallAt(x, y) || (!!o.floorAt(x, y) && !o.isOutdoor(x, y)));
    }
  }
  return inside;
}

function mostCommon(ids: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const id of ids) {
    if (id) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts].sort((p, q) => q[1] - p[1])[0]?.[0] ?? null;
}

/**
 * An empty storey on top of `below`: floor (its most common indoor floor) under the building's footprint, exterior
 * walls all round (door gaps closed), and the lift and stairs core copied in place (walls around it included).
 */
function shellAbove(below: Office): Layout {
  const { w, h } = below;
  const inside = footprint(below);
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside[y * w + x];
  const edge = (x: number, y: number) => at(x, y) && [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => !at(x + dx, y + dy)));
  const layout: Layout = { w, h, floor: new Array(w * h).fill(null), walls: new Array(w * h).fill(null), items: [], rooms: [] };
  const tiles = [...Array(w * h).keys()];
  const carpet = mostCommon(tiles.filter((i) => inside[i] && !below.layout.walls[i]).map((i) => below.layout.floor[i]));
  const outer = mostCommon(tiles.filter((i) => edge(i % w, Math.floor(i / w))).map((i) => below.layout.walls[i]));
  for (const i of tiles) {
    const [x, y] = [i % w, Math.floor(i / w)];
    if (inside[i]) {
      layout.floor[i] = carpet;
      layout.walls[i] = edge(x, y) ? below.layout.walls[i] ?? outer : null;
    }
  }
  const core = new Set([...below.spotsFor('elevator'), ...below.spotsFor('stairs')].map((s) => s.item));
  for (const item of core) {
    const v = below.variantOf(item);
    if (!v) {
      continue;
    }
    layout.items.push({ ...item, uid: layout.items.length + 1 });
    for (let y = item.y - 1; y <= item.y + v.h; y++) {
      for (let x = item.x - 1; x <= item.x + v.w; x++) {
        if (at(x, y)) {
          layout.floor[y * w + x] = below.layout.floor[y * w + x];
          layout.walls[y * w + x] = below.layout.walls[y * w + x] ?? layout.walls[y * w + x];
        }
      }
    }
  }
  return layout;
}

/** Adds a storey on top, with the building shell of the floor below; it's saved and ready for the editor. */
export function addFloor(): Floor {
  const top = app.floors[app.floors.length - 1];
  const level = top.level + 1;
  const bf: BuildingFloor = { id: `floor-${level}`, label: `Floor ${level + 1}`, level, layout: shellAbove(top.office) };
  const floor = makeFloor(app.building.staff, bf, true);
  saveFloorLayout(bf.id, bf.layout);
  app.floors.push(floor);
  saveList();
  setup(floor);
  return floor;
}

/** Why the top floor can't be removed (null: it can): only added floors, and only while nobody is up there. */
export function removeBlocker(f: Floor): string | null {
  if (f !== app.floors[app.floors.length - 1] || defaultBuilding().floors.some((d) => d.id === f.id)) {
    return 'Only an added top floor can be removed';
  }
  if (app.agents.some((a) => !a.gone && (a.floor === f.director || a.homeFloor === f.director))) {
    return `People are working on ${f.label}`;
  }
  return null;
}

export function removeFloor(f: Floor): boolean {
  if (removeBlocker(f)) {
    return false;
  }
  dropFloor(f, app.floors[app.floors.length - 2]);
  saveFloorLayout(f.id, null);
  saveList();
  return true;
}

/** Takes a floor out of the building; anyone on it (or working there) moves to `to`. */
function dropFloor(f: Floor, to: Floor): void {
  const staff = app.building.staff;
  for (const a of staff.agents) {
    if (a.homeFloor === f.director) {
      a.homeFloor = to.director;
      a.homeDesk = null;
    }
  }
  for (const a of [...f.director.agents]) {
    f.director.interrupt(a);
    f.director.handOver(a, to.director);
    const [x, y] = to.office.randomIndoorTile(Math.random);
    a.placeAt(x, y);
    a.hidden = false;
    a.alpha = 1;
  }
  staff.remove(f.director);
  app.building.floors = app.floors.filter((x) => x !== f);
  if (app.current === f) {
    app.current = to;
  }
}

/** Back to the default building: every default floor gets its default layout, added floors go. */
export function resetBuilding(): void {
  clearBuilding();
  const defaults = defaultBuilding();
  for (const f of [...app.floors].reverse()) {
    const def = defaults.floors.find((d) => d.id === f.id);
    if (def) {
      f.office.replaceLayout(def.layout);
    } else {
      dropFloor(f, [...app.floors].reverse().find((x) => defaults.floors.some((d) => d.id === x.id)) ?? app.floors[0]);
    }
  }
  clearBuilding();
}
