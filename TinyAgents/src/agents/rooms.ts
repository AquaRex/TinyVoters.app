import { app } from '../app';
import type { RoomKind, RoomLabel } from '../world/layout';
import type { Director } from './director';
import { labelFor, roomKey } from './labels';

/** A named room of a floor with the nav room it covers. */
export interface PlacedRoom {
  label: RoomLabel;
  nav: number;
}

const cache = new WeakMap<Director, { version: number; rooms: PlacedRoom[] }>();

/** The floor's named rooms (layout `rooms`), each resolved to its nav room. */
export function roomsOf(d: Director): PlacedRoom[] {
  const c = cache.get(d);
  if (c && c.version === d.office.version) {
    return c.rooms;
  }
  d.nav.sync();
  const rooms = (d.office.layout.rooms ?? []).map((label) => ({ label, nav: d.nav.roomOf(label.x, label.y) })).filter((r) => r.nav > 0);
  cache.set(d, { version: d.office.version, rooms });
  return rooms;
}

/** The named room at a tile, if any. */
export function roomAt(d: Director, x: number, y: number): PlacedRoom | undefined {
  const nav = d.nav.roomOf(x, y);
  return nav > 0 ? roomsOf(d).find((r) => r.nav === nav) : undefined;
}

export function roomsOfKind(d: Director, kind: RoomKind): PlacedRoom[] {
  return roomsOf(d).filter((r) => r.label.kind === kind);
}

/** The id of the floor a director runs (live building or the replay). */
export function floorIdOf(d: Director): string | undefined {
  return [...app.tower.floors, ...app.floors].find((f) => f.director === d)?.id;
}

/** The custom name for a room key, or `undefined` when the floor isn't known. */
export function placedRoomKey(d: Director, r: PlacedRoom): string | undefined {
  const id = floorIdOf(d);
  return id ? roomKey(id, r.label.id) : undefined;
}

/** A room's shown name: the custom one, else the layout's default. */
export function roomName(d: Director, r: PlacedRoom): string {
  const key = placedRoomKey(d, r);
  return (key && labelFor(key)) || r.label.name;
}
