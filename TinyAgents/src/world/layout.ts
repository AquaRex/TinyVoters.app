import { Dir } from '../art/types';
import { hqLayout } from './levels/hq';
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
}

const LEVELS: Record<string, () => Layout> = {
  hq: hqLayout,
  sandbox: sandboxLayout,
};

/** The level picked with ?level=<name> (default hq). */
export const LEVEL = (() => {
  const name = new URLSearchParams(location.search).get('level') ?? 'hq';
  return name in LEVELS ? name : 'hq';
})();

const STORAGE_KEY = `tiny-agents.layout.v4.${LEVEL}`;

export function defaultLayout(): Layout {
  return LEVELS[LEVEL]();
}

export function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as Layout;
    }
  } catch {
    // unreadable storage: start from the default level
  }
  return defaultLayout();
}

export function saveLayout(layout: Layout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // storage unavailable: the layout lives for this session only
  }
}
