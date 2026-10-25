import { aiOn, serve } from '../mind/brain';
import type { SpotRef } from '../world/office';
import type { Agent, Step, Task } from './agent';
import type { Director } from './director';
import type { Tile } from './nav';
import { pickFrom } from './professions';
import { roomsOfKind } from './rooms';
import { Target, call, defer, hangout, walkTo } from './steps';
import { track } from './toolPlaces';

/** The canteen's serving line: queue positions front first (the tray station is the back), and who stands in it. */
interface Line {
  version: number;
  /** canteen nav room */
  room: number;
  places: Target[];
  /** the staff side of the line: where chefs serve from */
  counters: SpotRef[];
  queue: Agent[];
}

const lines = new WeakMap<Director, Line>();
const SERVED_LINES = ['enjoy!', 'here you go', 'bon appétit', "today's special!", 'next!'];
const THANKS = ['thanks!', 'yum', 'smells great', 'thank you'];

/** The canteen line of a floor (a 'canteen' room with 'queue' spots), rebuilt after layout edits. */
export function lineOf(d: Director): Line | null {
  const cur = lines.get(d);
  if (cur && cur.version === d.office.version) {
    return cur.places.length ? cur : null;
  }
  const canteen = roomsOfKind(d, 'canteen')[0];
  const queue = canteen ? d.office.spotsFor('queue').filter((s) => d.nav.roomOf(s.x, s.y) === canteen.nav) : [];
  const back = queue.find((s) => s.item.type.startsWith('canteen.trays')) ?? queue[queue.length - 1];
  const dist = (s: { x: number; y: number }) => Math.abs(s.x - back.x) + Math.abs(s.y - back.y);
  const line: Line = { version: d.office.version, room: canteen?.nav ?? -1, places: [], counters: [], queue: cur?.queue ?? [] };
  if (back) {
    const front = [...queue].sort((p, q) => dist(q) - dist(p));
    line.places = front.map((s): Target => ({ x: s.x, y: s.y, spot: s }));
    const row = new Set(queue.map((s) => `${s.x},${s.y}`));
    const behind: Tile[] = [];
    for (let y = back.y - 3; y <= back.y + 4; y++) {
      for (let x = back.x - 3; x <= back.x + 3; x++) {
        if (d.office.cost[y * d.office.w + x] === 1 && d.nav.roomOf(x, y) === line.room && !row.has(`${x},${y}`) && y >= back.y && !d.office.spots.some((s) => s.x === x && s.y === y)) {
          behind.push([x, y]);
        }
      }
    }
    behind.sort((p, q) => dist({ x: p[0], y: p[1] }) - dist({ x: q[0], y: q[1] }) || q[0] - p[0]);
    line.places.push(...behind.slice(0, 6).map(([x, y]): Target => ({ x, y, face: x === back.x ? 'up' : x > back.x ? 'left' : 'right' })));
    const rows = new Set(front.map((s) => s.y - 2));
    line.counters = d.office.spotsFor('serve').filter((s) => s.facing === 'down' && rows.has(s.y) && d.nav.roomOf(s.x, s.y + 2) === line.room);
  }
  lines.set(d, line);
  return line.places.length ? line : null;
}

/** The floor with the canteen line, if the building has one. */
export function canteenFloor(d: Director): Director | undefined {
  return d.staff.directors.find((f) => (f === d || d.travel.connects(f)) && lineOf(f));
}

/** Someone on the staff side of the counter right now (a chef serving). */
function chefAt(cd: Director, line: Line): Agent | undefined {
  return cd.agents.find((a) => a.npc && !a.moving && line.counters.some((s) => s.x === a.tx && s.y === a.ty));
}

/** Waits in line, moving up as the people in front are served; done once served at the front. */
function queueStep(cd: Director, line: Line): Step {
  let walk: Step | null = null;
  let at = -1;
  let served = 0;
  const finish = (a: Agent) => {
    walk?.end?.(a);
    walk = null;
  };
  return {
    status: 'Queueing for lunch',
    begin(a) {
      line.queue.push(a);
    },
    tick(a, dt) {
      line.queue = line.queue.filter((x) => !x.gone && x.floor === cd);
      const i = line.queue.indexOf(a);
      const want = Math.min(Math.max(0, i), line.places.length - 1);
      if (want !== at && !(walk && a.seg)) {
        finish(a);
        at = want;
        walk = walkTo(cd, line.places[want]);
        if (walk.begin!(a) === false) {
          walk = null;
        }
      }
      if (walk) {
        if (!walk.tick(a, dt)) {
          return false;
        }
        finish(a);
      }
      a.act = 'idle';
      if (i !== 0) {
        return false;
      }
      const chef = chefAt(cd, line);
      served += dt;
      if (served < (chef ? 4.5 : 7)) {
        return false;
      }
      if (chef) {
        chef.face(a.x, a.y);
        if (aiOn()) {
          serve(chef, a);
        } else {
          chef.say(pickFrom(SERVED_LINES, cd.rand), 1.8);
          a.sayLater(pickFrom(THANKS, cd.rand), 0.8, 1.6);
        }
      }
      track(a).carry = 'tray';
      return true;
    },
    end(a) {
      finish(a);
      line.queue = line.queue.filter((x) => x !== a);
    },
  };
}

/** Back to the dish-return trolley with the empty tray. */
function returnTray(cd: Director): Step[] {
  const trolley = cd.office.layout.items.find((i) => i.type.startsWith('trolley.dishreturn'));
  if (!trolley) {
    return [call((x) => (track(x).carry = null))];
  }
  let walk: Step | null = null;
  let left = 1.2;
  return [
    {
      status: 'Returning the tray',
      begin(a) {
        const tile = cd.freeTilesNear(a, trolley.x, trolley.y, 2)[0];
        if (!tile) {
          return;
        }
        walk = walkTo(cd, { x: tile[0], y: tile[1] });
        if (walk.begin!(a) === false) {
          walk = null;
        }
      },
      tick: (a, dt) => !walk || walk.tick(a, dt),
      end: (a) => walk?.end?.(a),
    },
    {
      status: 'Returning the tray',
      begin: (a) => a.face(trolley.x * 32 + 16, trolley.y * 32 + 20),
      tick: (_a, dt) => (left -= dt) <= 0,
      end: (a) => (track(a).carry = null),
    },
  ];
}

/**
 * Lunch in the canteen: down to the canteen (from any floor), queue at the line and get served, a tray in hand to a
 * free canteen table, eat (lunch chats happen here), the tray back to the trolley, then back to the floor they came from.
 */
export function canteenLunch(d: Director, a: Agent, done: (x: Agent) => void): Task | null {
  const cd = canteenFloor(d);
  const line = cd && lineOf(cd);
  if (!cd || !line) {
    return null;
  }
  const join = line.places[line.places.length - 1];
  const there = d.routeTo(a, cd, { x: join.x, y: join.y }, 'Going down for lunch');
  if (!there) {
    return null;
  }
  const t = track(a);
  const seated = (x: Agent): Step[] => {
    const seat = cd
      .spotsAnywhere(x, ['eat'], { near: [x.tx, x.ty] })
      .find((p) => p.d === cd && cd.nav.roomOf(p.spot.x, p.spot.y) === line.room)?.spot;
    const walk = seat && cd.travel.route(x, { x: seat.x, y: seat.y, spot: seat }, 'Finding a table');
    if (!seat || !walk) {
      return [];
    }
    return [...walk, hangout({ seconds: 28 + cd.rand() * 20, act: 'eat', gains: { hunger: 1, comfort: 0.3, social: 0.15 }, chatty: true, extend: 30 })];
  };
  const steps: Step[] = [...there, queueStep(cd, line), defer(seated), ...returnTray(cd), call(done)];
  if (cd !== d) {
    steps.push(defer((x) => cd.travel.toFloor(x, d)));
  }
  return { kind: 'lunch', label: 'Lunch in the canteen', activity: 'eat', steps, started: false, cleanup: () => t.carry === 'tray' && (t.carry = null) };
}

/** Where a chef stands: behind the line when someone queues (or at lunch), otherwise at the kitchen stations. */
export function chefSpots(cd: Director, serving: boolean): SpotRef[] {
  const line = lineOf(cd);
  if (serving && line) {
    return line.counters;
  }
  const kitchen = roomsOfKind(cd, 'kitchen')[0];
  return cd.office.spotsFor('serve').filter((s) => !line?.counters.includes(s) && (!kitchen || cd.nav.roomOf(s.x, s.y) === kitchen.nav));
}

/** How many are waiting at the line right now. */
export function queueLength(cd: Director): number {
  return lineOf(cd)?.queue.length ?? 0;
}

