import { TILE } from '../config';
import { Director, registerExtension } from '../agents/director';
import { lightWarm } from '../art/kit';
import { placedLight, registerLightSource } from '../render/lighting';
import { DIR_STEP, Office } from '../world/office';
import { nightness } from './shared';

const shifts = new WeakMap<Office, Director>();
const furnished = new WeakMap<Office, { version: number; room: Int32Array }>();

/** Nav rooms extended under furniture: blocked floor tiles take the room of the floor around them. */
function roomMap(d: Director): Int32Array {
  const o = d.office;
  const cached = furnished.get(o);
  if (cached && cached.version === o.version) {
    return cached.room;
  }
  const room = new Int32Array(o.w * o.h);
  const queue: number[] = [];
  for (let i = 0; i < room.length; i++) {
    room[i] = d.nav.roomOf(i % o.w, Math.floor(i / o.w));
    if (room[i] > 0) {
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % o.w;
    const y = Math.floor(i / o.w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const n = ny * o.w + nx;
      if (o.inBounds(nx, ny) && room[n] === -1 && !d.nav.walkable(nx, ny) && o.floorAt(nx, ny) && !o.wallAt(nx, ny)) {
        room[n] = room[i];
        queue.push(n);
      }
    }
  }
  furnished.set(o, { version: o.version, room });
  return room;
}

registerLightSource((office) => {
  const d = shifts.get(office);
  if (!d || nightness() < 0.5) {
    return null;
  }
  const occupied = new Set<number>();
  const people = d.agents.filter((a) => !a.hidden && a.alpha > 0);
  for (const a of people) {
    occupied.add(d.nav.roomOf(a.tx, a.ty));
  }
  const lamps = people.filter((a) => a.info.busy && a.seated && a.task?.kind === 'work');
  const lights = lamps.map((a) => {
    const spot = d.spotByKey(a.homeDesk);
    const [fx, fy] = spot ? DIR_STEP[spot.facing] : [0, -1];
    const x = (a.tx + fx) * TILE + 16;
    const y = (a.ty + fy) * TILE + 8;
    return placedLight(x, y, a.tx, a.ty, { x: 0, y: 0, radius: 46, intensity: 0.7, color: lightWarm[1] });
  });
  const rooms = roomMap(d);
  const roomAt = (x: number, y: number) => {
    const r = d.office.inBounds(x, y) ? rooms[y * d.office.w + x] : -1;
    if (r !== -1 || !d.nav.walkable(x, y)) {
      return r;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = d.nav.roomOf(x + dx, y + dy);
      if (n > 0) {
        return n;
      }
    }
    return -1;
  };
  return {
    key: `night|${[...occupied].sort().join(',')}|${lamps.map((a) => `${a.tx},${a.ty}`).join(',')}`,
    lights,
    dark: (x, y) => {
      const r = roomAt(x, y);
      return r > 0 && !occupied.has(r);
    },
  };
});

/**
 * Night shift: after dark only rooms with someone in them keep their lights on (the night guard's office, a late
 * worker's room), and busy people work under a warm desk lamp.
 */
registerExtension((director) => {
  shifts.set(director.office, director);
  return {};
});
