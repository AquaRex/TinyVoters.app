import type { Agent } from './agents/agent';
import type { Director } from './agents/director';
import type { Staff } from './agents/staff';
import type { Renderer } from './render/renderer';
import type { Office } from './world/office';

/** One storey of the building: its own office grid and the people on it right now. */
export interface Floor {
  id: string;
  label: string;
  /** 0 is the ground floor (with the outdoors) */
  level: number;
  office: Office;
  director: Director;
}

/** A running building: its floors (by level, ground first) and everyone in it. */
export interface Tower {
  floors: Floor[];
  staff: Staff;
}

/**
 * Shared handles for UI modules and features, filled in by main.ts before any `init*` call. Read `current` / `shown`
 * each time (the visible floor can change); `floors` lists every floor of the live building.
 */
export const app = {
  renderer: undefined as unknown as Renderer<Agent>,
  building: undefined as unknown as Tower,
  /** The picked floor of the live building. */
  current: undefined as unknown as Floor,
  /** A temporary building shown (and updated) instead of the live one, e.g. the day replay. */
  override: null as Tower | null,
  toast: (_msg: string): void => undefined,
  selectAgent: (_a: Agent): void => undefined,
  get floors(): Floor[] {
    return this.building.floors;
  },
  /** The building on screen: the override or the live one. */
  get tower(): Tower {
    return this.override ?? this.building;
  },
  /** The floor on screen: the picked level of the building on screen. */
  get shown(): Floor {
    const floors = this.tower.floors;
    return floors.find((f) => f.level === this.current.level) ?? floors[floors.length - 1];
  },
  /** Everyone on every floor of the live building. */
  get agents(): Agent[] {
    return this.floors.flatMap((f) => f.director.agents);
  },
};
