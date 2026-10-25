import type { SpotRef } from '../world/office';
import type { RoomKind } from '../world/layout';
import type { Agent, AgentInfo, Step, Task } from './agent';
import { CLOTH_COLORS } from './appearance';
import { canteenFloor, chefSpots, queueLength } from './canteen';
import type { Director } from './director';
import type { Tile } from './nav';
import { Profession } from './professions';
import { roomsOfKind } from './rooms';
import { Target, call, defer, hangout, pause, walkTo } from './steps';
import type { Choice } from '../mind/brain';
import { track } from './toolPlaces';

const C = (...i: number[]) => i.map((n) => CLOTH_COLORS[n]);
const QUIET = { sociability: 0.45, chattiness: 0.4, stairs: 0.2, coffee: 0.4, outdoorsy: 0.2, drives: 0.6, diligence: 0.9, playful: 0.1, bookish: 0.1 };

function role(id: string, title: string, badge: string, look: Profession['look'], phrases: string[]): Profession {
  return { id, title, badge, traits: QUIET, likes: {}, look, phrases, keywords: [] };
}

/** Building staff roles. No keywords: Claude agent types never map to them. */
export const NPC_ROLES = new Map<string, Profession>([
  ['chef', role('chef', 'Chef', '#efe4d0', { topColors: C(13), tops: ['jacket'], accessories: ['none'] }, ['soup is on!', 'mind the pan', 'chop chop', 'fresh bread!'])],
  ['it', role('it', 'IT Technician', '#5b8cc0', { topColors: C(2, 10), tops: ['shirt', 'hoodie'], accessories: ['glasses', 'badge'] }, ['restart it?', 'cables...', 'patching', 'ticket #42'])],
  ['guard', role('guard', 'Security Guard', '#36456e', { topColors: C(5), tops: ['jacket'], accessories: ['none'] }, ['all quiet', 'badge please', 'evening!', 'stay safe'])],
  ['reception', role('reception', 'Receptionist', '#e48a9c', { topColors: C(0, 2, 12), tops: ['blazer', 'cardigan'], accessories: ['badge', 'glasses'] }, ['welcome!', 'one moment', 'sign in here', 'lovely day'])],
  ['cleaner', role('cleaner', 'Cleaner', '#668868', { topColors: C(3, 10), tops: ['tee', 'vest'], accessories: ['none', 'headphones'] }, ['shiny!', 'wet floor!', 'almost done', 'la la la'])],
]);

interface NpcDef {
  id: string;
  name: string;
  role: string;
  /** floor level they work on (and arrive to) */
  level: number;
  /** shift, hours of the day (wraps past midnight when start > end) */
  hours: [number, number];
  /** the guard this one takes over from: that one stays (up to an hour) until the handover at the desk */
  relieves?: string;
}

const NPCS: NpcDef[] = [
  { id: 'npc:chef:0', name: 'Marco', role: 'chef', level: 0, hours: [6, 14] },
  { id: 'npc:chef:1', name: 'Ines', role: 'chef', level: 0, hours: [6, 14] },
  { id: 'npc:it:0', name: 'Raj', role: 'it', level: 0, hours: [8, 17.5] },
  { id: 'npc:guard:0', name: 'Bruno', role: 'guard', level: 0, hours: [6.75, 19], relieves: 'npc:guard:1' },
  { id: 'npc:guard:1', name: 'Nadia', role: 'guard', level: 0, hours: [18.75, 7], relieves: 'npc:guard:0' },
  { id: 'npc:reception:0', name: 'Clara', role: 'reception', level: 1, hours: [8, 17.5] },
  { id: 'npc:cleaner:0', name: 'Dot', role: 'cleaner', level: 0, hours: [16.5, 20.5] },
  { id: 'npc:cleaner:1', name: 'Sami', role: 'cleaner', level: 1, hours: [17, 21] },
];
const NPC_BY_ID = new Map(NPCS.map((n) => [n.id, n]));

function onShift(h: number, [start, end]: [number, number]): boolean {
  return start < end ? h >= start && h < end : h >= start || h < end;
}

const infos = new Map<string, AgentInfo>();
/** Guards who handed the desk over and may go home. */
const relieved = new Set<string>();

/** Whether a guard whose shift is over still waits at the desk for the relief (at most an hour). */
function awaitingRelief(n: NpcDef, hour: number): boolean {
  const end = n.hours[1];
  return !!n.relieves && !relieved.has(n.id) && onShift(hour, [end, (end + 1) % 24]);
}

/** Building staff on duty at this hour, as roster entries (one stable object each). */
export function npcInfos(hour: number): AgentInfo[] {
  for (const n of NPCS) {
    if (onShift(hour, n.hours)) {
      relieved.delete(n.id);
    }
  }
  return NPCS.filter((n) => onShift(hour, n.hours) || awaitingRelief(n, hour)).map((n) => {
    let info = infos.get(n.id);
    if (!info) {
      info = { id: n.id, kind: 'main', type: n.role, project: '', busy: false, waiting: false, state: 'idle' };
      infos.set(n.id, info);
    }
    return info;
  });
}

export function npcDef(id: string): NpcDef | undefined {
  return NPC_BY_ID.get(id);
}

export function npcShift(id: string): string {
  const n = NPC_BY_ID.get(id);
  const f = (h: number) => `${Math.floor(h)}:${h % 1 ? '30' : '00'}`;
  return n ? `${f(n.hours[0])}–${f(n.hours[1])}` : '';
}

/** Cleaners pushing gear right now: what they're doing at their spot ('vacuum' or 'mop'). */
export const cleaning = new WeakMap<Agent, 'vacuum' | 'mop'>();
/** Wet-floor signs left behind by mopping. */
export const wetSigns: { d: Director; x: number; y: number; until: number }[] = [];

const rnd = (d: Director, lo: number, hi: number) => lo + d.rand() * (hi - lo);

function task(label: string, activity: string, steps: Step[], cleanup?: () => void): Task {
  return { kind: 'idle', label, activity, steps, started: false, cleanup };
}

/** The free spots of these activities on any connected floor, nearest first; optionally only in rooms of a kind. */
function spots(d: Director, a: Agent, activities: SpotRef['activity'][], kind?: RoomKind, pose?: 'sit' | 'stand') {
  return d.spotsAnywhere(a, activities).filter(({ d: f, spot }) => {
    if (pose && spot.pose !== pose) {
      return false;
    }
    return !kind || roomsOfKind(f, kind).some((r) => r.nav === f.nav.roomOf(spot.x, spot.y));
  });
}

/** Walk to a spot (any floor) and stay there for a while. */
function stint(d: Director, a: Agent, pick: { d: Director; spot: SpotRef } | undefined, label: string, seconds: number, act: 'idle' | 'type' | 'read' = 'idle', chatty = false): Task | null {
  const route = pick && d.routeTo(a, pick.d, { x: pick.spot.x, y: pick.spot.y, spot: pick.spot }, label);
  if (!route) {
    return null;
  }
  return task(label, label, [...route, hangout({ seconds, act, status: label, chatty, extend: 15 })]);
}

function chef(d: Director, a: Agent): Task | null {
  const cd = canteenFloor(d) ?? d;
  const serving = cd.lunchTime() || queueLength(cd) > 0;
  const free = chefSpots(cd, serving).filter((s) => cd.isFree(s.key, a));
  const spot = free[Math.floor(d.rand() * Math.min(2, free.length))];
  return stint(d, a, spot && { d: cd, spot }, serving ? 'Serving lunch' : 'Cooking', serving ? rnd(d, 25, 45) : rnd(d, 12, 25), serving ? 'idle' : 'type');
}

function itTech(d: Director, a: Agent): Choice[] {
  const fix = spots(d, a, ['it', 'server'], undefined, 'stand');
  const pick = fix[Math.floor(d.rand() * Math.min(4, fix.length))];
  const what = pick?.spot.activity === 'server' ? 'Checking the servers' : 'Fixing a laptop';
  return [
    { label: 'sit at the help desk', u: 0.7, make: () => stint(d, a, spots(d, a, ['it'], undefined, 'sit')[0], 'At the IT help desk', rnd(d, 50, 110), 'type', true) },
    { label: what.toLowerCase(), u: 0.3, make: () => stint(d, a, pick, what, rnd(d, 12, 22)) },
  ];
}

function doorAt(f: Director, x: number, y: number): boolean {
  const item = f.office.itemAt(x, y, 'object');
  return !!item && !!f.office.defOf(item)?.door;
}

/** A random open tile in a room of these kinds on floor `f`, clear of doorways. */
function tileIn(f: Director, kinds: RoomKind[], a: Agent): Tile | null {
  const navs = new Set(kinds.flatMap((k) => roomsOfKind(f, k).map((r) => r.nav)));
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(f.rand() * f.office.w);
    const y = Math.floor(f.rand() * f.office.h);
    if (navs.has(f.nav.roomOf(x, y)) && !f.office.isOutdoor(x, y) && [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => f.office.cost[(y + dy) * f.office.w + x + dx] === 1 && !doorAt(f, x + dx, y + dy)) && f.isFree(`t:${x},${y}`, a) && !f.office.spots.some((s) => s.x === x && s.y === y)) {
      return [x, y];
    }
  }
  return null;
}

/** The incoming guard walks up to the one on duty, they swap a few words, and the other one may go home. */
function handover(d: Director, a: Agent): Task | null {
  const def = NPC_BY_ID.get(a.id);
  const other = def?.relieves && NPC_BY_ID.get(def.relieves);
  const due = !!def && !!other && onShift(d.hour, def.hours) && awaitingRelief(other, d.hour);
  const mate = due && other ? d.agents.find((o) => o.id === other.id && o.arrived && !o.hidden && !o.leaving) : undefined;
  const tile = mate && d.freeTilesNear(a, mate.tx, mate.ty, 2)[0];
  const route = tile && d.travel.route(a, { x: tile[0], y: tile[1] }, 'Taking over the desk');
  if (!mate || !tile || !route) {
    return null;
  }
  const evening = d.hour >= 12;
  let left = 5;
  return task('Taking over the desk', 'handover', [
    ...route,
    {
      status: 'Taking over the desk',
      begin: (x) => {
        x.face(mate.x, mate.y);
        x.waveT = 0.9;
        x.say(evening ? 'evening!' : 'morning!', 2);
        mate.sayLater(evening ? 'all quiet. night!' : 'quiet night. bye!', 1.6, 2.4);
      },
      tick: (x, dt) => {
        x.face(mate.x, mate.y);
        return (left -= dt) <= 0;
      },
      end: () => relieved.add(mate.id),
    },
  ]);
}

function patrol(d: Director, a: Agent): Task | null {
  const steps: Step[] = [];
  for (let i = 0; i < 3; i++) {
    const tile = tileIn(d, ['lobby'], a);
    if (tile) {
      steps.push(walkTo(d, { x: tile[0], y: tile[1] }, 'Patrolling the entrance'), pause(rnd(d, 2, 5), 'Patrolling the entrance'));
    }
  }
  return steps.length ? task('Patrolling the entrance', 'patrol', steps) : null;
}

function guard(d: Director, a: Agent): Choice[] {
  const takeOver = handover(d, a);
  if (takeOver) {
    return [{ label: 'take over the desk', u: 1, make: () => takeOver }];
  }
  const def = NPC_BY_ID.get(a.id);
  const cameras: Choice = { label: 'watch the cameras', u: 0.7, make: () => stint(d, a, spots(d, a, ['work'], 'security', 'sit')[0] ?? spots(d, a, ['cctv'])[0], 'Watching the cameras', rnd(d, 40, 80), 'idle', true) };
  return def && awaitingRelief(def, d.hour) ? [cameras] : [cameras, { label: 'patrol the entrance', u: 0.3, make: () => patrol(d, a) }];
}

function receptionist(d: Director, a: Agent): Choice[] {
  return [
    { label: 'stay at the reception desk', u: 0.85, make: () => stint(d, a, d.spotsAnywhere(a, ['reception']).sort((p, q) => +(q.d === a.homeFloor) - +(p.d === a.homeFloor))[0], 'At reception', rnd(d, 60, 120), 'type', true) },
    { label: 'a coffee break', u: 0.15, make: () => stint(d, a, d.spotsAnywhere(a, ['coffee', 'water']).find((p) => p.d === d), 'Coffee break', rnd(d, 6, 10), 'idle', true) },
  ];
}

const CLEAN_ROOMS: RoomKind[] = ['corridor', 'lobby', 'reception', 'canteen', 'kitchen', 'social'];

/** Cleaning at one tile: vacuuming back and forth, or mopping behind a wet-floor sign. */
function cleanAt(f: Director, gear: 'vacuum' | 'mop'): Step {
  let left = rnd(f, 6, 10);
  return {
    status: gear === 'vacuum' ? 'Vacuuming' : 'Mopping',
    begin(a) {
      cleaning.set(a, gear);
      if (gear === 'mop') {
        wetSigns.push({ d: f, x: a.x + (a.dir === 'left' ? 12 : -12), y: a.y + 4, until: f.time + left + 12 });
      }
    },
    tick: (_a, dt) => (left -= dt) <= 0,
    end(a) {
      cleaning.delete(a);
    },
  };
}

/** Next cleaning stop (mostly this floor, sometimes another), planned on arrival. */
function rounds(gear: 'vacuum' | 'mop', n: number): Step {
  return defer((x) => {
    if (n <= 0) {
      return [];
    }
    const here = x.floor;
    const others = here.staff.directors.filter((f) => f === here || here.travel.connects(f));
    const f = here.rand() < 0.65 ? here : others[Math.floor(here.rand() * others.length)];
    const tile = tileIn(f, CLEAN_ROOMS, x);
    const route = tile && here.routeTo(x, f, { x: tile[0], y: tile[1] } as Target, gear === 'vacuum' ? 'Vacuuming' : 'Mopping');
    return route ? [...route, cleanAt(f, gear), rounds(gear, n - 1)] : [rounds(gear, n - 1)];
  });
}

/** Gets the vacuum or the mop bucket from the janitor closet, cleans a few spots, puts it back. Evening shift. */
function cleaner(d: Director, a: Agent): Choice[] {
  // a break away from the closet: it's a one-tile lane, and the other cleaner needs to get to the gear
  const rest: Choice = { label: 'a short break', u: 0.25, make: () => stint(d, a, d.spotsAnywhere(a, ['social', 'read', 'water']).find((p) => p.d === d), 'On a break', rnd(d, 20, 40), 'idle', true) };
  // the closet is a one-tile lane: one cleaner in there at a time
  const busy = d.staff.agents.some((o) => o !== a && o.npc && /^(Getting|Putting) the/.test(o.statusText));
  const gear = d.rand() < 0.5 ? 'vacuum' : 'mop';
  return busy ? [rest] : [{ label: gear === 'vacuum' ? 'vacuum the floors' : 'mop the floors', u: 0.75, make: () => cleanRound(d, a, gear) }, rest];
}

function cleanRound(d: Director, a: Agent, gear: 'vacuum' | 'mop'): Task | null {
  const closet = d.spotsAnywhere(a, ['clean'])[0];
  if (!closet) {
    return null;
  }
  const what = gear === 'vacuum' ? 'the vacuum' : 'the mop bucket';
  const to = d.routeTo(a, closet.d, { x: closet.spot.x, y: closet.spot.y, spot: closet.spot }, `Getting ${what}`);
  if (!to) {
    return null;
  }
  const t = track(a);
  return task('Cleaning', 'clean', [
    ...to,
    pause(2, `Getting ${what}`),
    call(() => (t.carry = gear)),
    rounds(gear, 2 + Math.floor(d.rand() * 3)),
    defer((x) => x.floor.routeTo(x, closet.d, { x: closet.spot.x, y: closet.spot.y, spot: closet.spot }, `Putting ${what} away`)),
    pause(1.5, `Putting ${what} away`),
    call(() => (t.carry = null)),
  ], () => {
    t.carry = null;
    cleaning.delete(a);
  });
}

/** What a member of the building staff may do next: duty-appropriate options with their usual weights. */
export function npcChoices(d: Director, a: Agent): Choice[] {
  switch (a.role.id) {
    case 'chef':
      return [{ label: 'work the kitchen', u: 1, make: () => chef(d, a) }];
    case 'it':
      return itTech(d, a);
    case 'guard':
      return guard(d, a);
    case 'reception':
      return receptionist(d, a);
    case 'cleaner':
      return cleaner(d, a);
  }
  return [];
}

/** The usual pick: an option at random by weight (the next one if it can't happen right now). */
export function npcTask(d: Director, a: Agent): Task | null {
  const options = npcChoices(d, a);
  let r = d.rand() * options.reduce((sum, o) => sum + o.u, 0);
  const first = options.findIndex((o) => (r -= o.u) <= 0);
  for (const o of [...options.slice(Math.max(0, first)), ...options.slice(0, Math.max(0, first))]) {
    const t = o.make();
    if (t) {
      return t;
    }
  }
  return null;
}

/** The IT technician when sitting at the help desk (for workers who walk down with an error). */
export function itOnDuty(d: Director): { tech: Agent; desk: SpotRef } | undefined {
  for (const tech of d.staff.agents) {
    if (tech.role.id !== 'it' || !tech.npc || !tech.seated || tech.leaving) {
      continue;
    }
    const desk = tech.floor.office.spotsFor('it').find((s) => s.x === tech.tx && s.y === tech.ty);
    if (desk) {
      return { tech, desk };
    }
  }
  return undefined;
}
