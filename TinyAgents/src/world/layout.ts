import { Dir } from '../art/types';
import { hqBuilding } from './levels/hq';
import { sandboxLayout } from './levels/sandbox';

export interface PlacedItem {
  uid: number;
  /** asset id */
  type: string;
  x: number;
  y: number;
  dir: Dir;
}

export interface Layout {
  w: number;
  h: number;
  /** floor id per tile */
  floor: (string | null)[];
  /** wall style id per tile */
  walls: (string | null)[];
  items: PlacedItem[];
  /** Named rooms on this floor (meeting rooms, team offices, canteen, server room…). */
  rooms?: RoomLabel[];
}

export type RoomKind =
  | 'office'
  | 'meeting'
  | 'lobby'
  | 'reception'
  | 'kitchen'
  | 'canteen'
  | 'social'
  | 'restroom'
  | 'server'
  | 'it'
  | 'print'
  | 'janitor'
  | 'security'
  | 'corridor'
  | 'storage';

/** A named room: `(x, y)` is any floor tile inside it (the room is what Nav.roomOf finds there). */
export interface RoomLabel {
  id: string;
  kind: RoomKind;
  /** default display name; users can rename meeting rooms and team offices */
  name: string;
  x: number;
  y: number;
}

/** One storey of the building. Level 0 is the ground floor (it holds the outdoors: street, car park, park). */
export interface BuildingFloor {
  id: string;
  label: string;
  level: number;
  layout: Layout;
}

export interface Building {
  floors: BuildingFloor[];
}

const LEVELS: Record<string, () => Building> = {
  hq: hqBuilding,
  sandbox: () => ({ floors: [{ id: 'ground', label: 'Ground floor', level: 0, layout: sandboxLayout() }] }),
};

/** The level picked with ?level=<name> (default hq). */
export const LEVEL = (() => {
  const name = new URLSearchParams(location.search).get('level') ?? 'hq';
  return name in LEVELS ? name : 'hq';
})();

/** Floor list (id, label, level) under this key, each floor's layout under `<key>.<floor id>`. */
const STORAGE_KEY = `tiny-agents.building.v5.${LEVEL}`;

type FloorMeta = Omit<BuildingFloor, 'layout'>;

export function defaultBuilding(): Building {
  return LEVELS[LEVEL]();
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // storage unavailable: the building lives for this session only
  }
}

/** The saved building: the saved floor list (or the default one), each floor's saved layout or its default. */
export function loadBuilding(): Building {
  const defaults = defaultBuilding();
  const metas = read<FloorMeta[]>(STORAGE_KEY) ?? defaults.floors.map(({ id, label, level }) => ({ id, label, level }));
  const floors = metas.flatMap((m): BuildingFloor[] => {
    const layout = read<Layout>(`${STORAGE_KEY}.${m.id}`) ?? defaults.floors.find((f) => f.id === m.id)?.layout;
    return layout ? [{ ...m, layout }] : [];
  });
  return { floors: floors.length ? floors : defaults.floors };
}

export function saveFloorLayout(id: string, layout: Layout | null): void {
  write(`${STORAGE_KEY}.${id}`, layout);
}

export function saveFloorList(floors: FloorMeta[]): void {
  write(STORAGE_KEY, floors.map(({ id, label, level }) => ({ id, label, level })));
}

/** Forgets every saved floor (the next load is the default building). */
export function clearBuilding(): void {
  for (const m of read<FloorMeta[]>(STORAGE_KEY) ?? defaultBuilding().floors) {
    write(`${STORAGE_KEY}.${m.id}`, null);
  }
  write(STORAGE_KEY, null);
}
