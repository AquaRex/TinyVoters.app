import { Activity } from '../art/types';
import { hash, seeded } from '../render/pixel';
import { CarView, RenderLayer } from '../render/renderer';
import { DIR_STEP, Office, SpotRef } from '../world/office';
import { Act, Agent, AgentInfo, Step, Task, TaskKind } from './agent';
import { Car } from './car';
import { demoIdentity } from './demo';
import { Lift } from './lift';
import { NEIGHBORS, Nav, Tile } from './nav';
import { NeedId, Needs, criticalNeed, decay, restore, urgency } from './needs';
import { adoptLegacy, lastDesk, personFor, staffSlot } from './people';
import { PROFESSION_BY_ID, SHY_GREETINGS, greetings, pickFrom, professionForAgent, toolPhrase } from './professions';
import { ConvKind, Conversation } from './social';
import { Target, call, defer, hangout, pause, unless, walkTo } from './steps';
import type { Staff } from './staff';
import { PLACE_SPOTS, Place, labLamps, placeOf, track } from './toolPlaces';
import { playCue } from '../ui/sound';
import { Travel } from './travel';
import { FRIEND, affinity, bond } from './relationships';
import { outdoorAppeal, pizzaTime } from '../world/calendar';
import { NPC_ROLES, itOnDuty, npcChoices, npcDef, npcTask } from './buildingStaff';
import { canteenLunch } from './canteen';
import { roomAt, roomsOf } from './rooms';
import { Choice, aiOn, favourPlan, muse, noteTurn, opener, plannedChat, prefetch, remark, takeDecision, topicOf, wantsPrefetch } from '../mind/brain';

interface ActivityDef {
  id: string;
  /** spot activities it can use, best first */
  spots: Activity[];
  /** needs restored over the activity */
  gains: Partial<Needs>;
  seconds: [number, number];
  label: string;
  kind: TaskKind;
  act: Act;
  /** personality / taste multiplier */
  appeal?: (a: Agent) => number;
  /** flat appeal regardless of needs */
  base?: number;
  /** 'any': indoor or outdoor spots; 'only': outdoor spots only (park) */
  outdoor?: 'any' | 'only';
  /** leaves with a mug of coffee */
  mug?: boolean;
  /** hangs around nearby afterwards (coffee point chats) */
  linger?: [number, number];
  then?: string;
}

const ACTIVITIES: ActivityDef[] = [
  { id: 'coffee', spots: ['coffee'], gains: { energy: 0.65, thirst: 0.25 }, seconds: [4, 6], label: 'Getting coffee', kind: 'need', act: 'idle', appeal: (a) => 0.5 + a.traits.coffee, mug: true, linger: [5, 11] },
  { id: 'water', spots: ['water'], gains: { thirst: 0.85 }, seconds: [4, 7], label: 'Water break', kind: 'need', act: 'drink', linger: [3, 7] },
  { id: 'snack', spots: ['snack'], gains: { hunger: 0.4, energy: 0.1 }, seconds: [4, 7], label: 'Grabbing a snack', kind: 'need', act: 'eat', linger: [2, 5] },
  { id: 'eat', spots: ['eat', 'social'], gains: { hunger: 1, comfort: 0.3, social: 0.15 }, seconds: [30, 50], label: 'Having lunch', kind: 'lunch', act: 'eat', outdoor: 'any' },
  { id: 'toilet', spots: ['toilet'], gains: { bladder: 1 }, seconds: [7, 11], label: 'Restroom break', kind: 'need', act: 'idle', then: 'wash' },
  { id: 'wash', spots: ['wash'], gains: {}, seconds: [3, 5], label: 'Washing hands', kind: 'need', act: 'idle' },
  { id: 'read', spots: ['read'], gains: { energy: 0.25, comfort: 0.2 }, seconds: [14, 28], label: 'Reading', kind: 'fun', act: 'read', appeal: (a) => (0.3 + a.traits.bookish) * (a.role.likes.read ?? 1), base: 0.05 },
  { id: 'whiteboard', spots: ['whiteboard'], gains: { energy: 0.15, social: 0.1 }, seconds: [12, 24], label: 'Sketching ideas', kind: 'fun', act: 'talk', appeal: (a) => 0.5 * (a.role.likes.whiteboard ?? 1), base: 0.05 },
  { id: 'play', spots: ['play'], gains: { comfort: 0.3, social: 0.35, energy: 0.2 }, seconds: [16, 30], label: 'Playing foosball', kind: 'fun', act: 'talk', appeal: (a) => (0.2 + a.traits.playful) * (a.role.likes.play ?? 1), base: 0.04 },
  { id: 'relax', spots: ['social'], gains: { comfort: 0.75, energy: 0.25 }, seconds: [18, 40], label: 'Relaxing', kind: 'fun', act: 'idle', appeal: (a) => a.role.likes.relax ?? 1, base: 0.05 },
  { id: 'print', spots: ['print'], gains: {}, seconds: [4, 7], label: 'Printing', kind: 'fun', act: 'idle', base: 0.03 },
  { id: 'park', spots: ['social', 'eat'], gains: { energy: 0.5, comfort: 0.5, social: 0.1 }, seconds: [25, 50], label: 'Break in the park', kind: 'outside', act: 'idle', appeal: (a) => (0.2 + a.traits.outdoorsy) * (a.role.likes.park ?? 1), base: 0.07, outdoor: 'only' },
];

const ACTIVITY_BY_ID = new Map(ACTIVITIES.map((d) => [d.id, d]));
/** How a free-time option reads in an AI worker's shortlist. */
const CHOICE_LABEL: Record<string, string> = {
  coffee: 'coffee', water: 'water', snack: 'a snack', eat: 'lunch', toilet: 'restroom', read: 'read a book',
  whiteboard: 'sketch on the whiteboard', play: 'play foosball', relax: 'relax on the sofa', print: 'print something', park: 'walk in the park',
};

/** What a busy agent does about a pressing need, best first. */
const MICRO_BREAK: Partial<Record<NeedId, string[]>> = {
  bladder: ['toilet'],
  thirst: ['water', 'coffee'],
  energy: ['coffee', 'water'],
  hunger: ['snack', 'eat'],
};

const IDLE_KINDS: TaskKind[] = ['idle', 'fun', 'chat', 'outside', 'lunch'];

/** AI staff desk banter: seconds between remarks on a floor (on average), and before the same two people banter again. */
const BANTER_EVERY = 20;
const BANTER_PAIR_GAP = 180;
/** Thinking longer than this ends a tool streak (the person heads back to the desk). */
const THINK_GRACE = 4;
/** Seconds into a permission wait: walk over and ring the reception bell, then back to the desk on the phone. */
const BELL_AT = 20;
const PHONE_AT = 60;
const PLACE_STATUS: Record<Place, string> = {
  files: 'Pulling the files',
  web: 'Off to the internet kiosk',
  server: 'Off to the server rack',
  qa: 'Running the tests',
};
/** A tool streak this long (seconds) is worth the trip to a tool place on another floor (the server room, the archive). */
const CROSS_FLOOR_TRIP = 20;
/** Long Bash runs and test runs: worth walking to the rack or the QA bench on this floor after this long. */
const RUN_TRIP = 10;
const HELP_LINES = ['it broke again', 'got a sec?', 'error after error', 'help?', 'it says 500...'];
const TECH_LINES = ['have you tried restarting?', 'let me look', 'ah, I see', 'try now', 'fixed!', 'classic'];
type LunchStyle = 'canteen' | 'kitchen' | 'desk' | 'skip';
/** What a trip to another floor counts as when comparing spots, in tiles per level. */
const FLOOR_COST = 30;

/** A spot on some floor of the building, with that floor's director. */
export interface FloorSpot {
  d: Director;
  spot: SpotRef;
}

/**
 * A feature that lives beside the director (one instance per director, so per floor). It sees every agent's
 * info changes and may draw into the world through the RenderLayer hooks.
 */
export interface DirectorExtension extends RenderLayer {
  update?(dt: number): void;
  onSpawn?(a: Agent): void;
  onInfo?(a: Agent, was: AgentInfo, now: AgentInfo): void;
  onGone?(a: Agent): void;
}

const EXTENSIONS: ((d: Director) => DirectorExtension)[] = [];

/** Registers a feature for every director created afterwards (register at module load, from src/features). */
export function registerExtension(make: (d: Director) => DirectorExtension): void {
  EXTENSIONS.push(make);
}

function forcedHour(): number | null {
  const t = new URLSearchParams(location.search).get('time');
  return t !== null && !Number.isNaN(parseFloat(t)) ? parseFloat(t) : null;
}

/**
 * Runs one floor of the building: the people on it right now (the building's roster lives in Staff), how they
 * arrive, leave and change floors, what they do (utility AI over needs and personality, with Claude's busy /
 * waiting state taking priority), and their social life (greetings, conversations, meetings, lunch).
 *
 * Cross-floor API for behaviour code (steps run on whichever floor the person is on by then):
 * - `spotsAnywhere(a, activities)`: free spots on every floor, nearest first, as `{ d, spot }`.
 * - `routeTo(a, d, target)`: walks there, taking the lift or the stairs first when `d` is another floor.
 * - `visit(a, pick, stay)`: goes to a spot on any floor, runs `stay` there, then returns to the floor it left.
 * - `travel.toFloor(a, d)`: only the lift / stairs trip; `defer(build)` (steps.ts) plans the rest on arrival.
 */
export class Director {
  agents: Agent[] = [];
  readonly nav: Nav;
  readonly travel: Travel;
  rand = Math.random;
  /** Hour of day (0..24) driving lunch and park breaks. Defaults to ?time= or the local clock. */
  clock: () => number;
  /** spot / tile key -> who holds it */
  reserved = new Map<string, Agent>();
  convs: Conversation[] = [];
  private carList: Car[] = [];
  private lifts = new Map<number, Lift>();
  /** Stall door openness by toilet item uid: shut while someone sits inside. */
  private stalls = new Map<number, number>();
  /** project -> nav room id it claimed: a project's people share a desk room while any of them is in */
  readonly projectRooms = new Map<string, number>();
  private lastSpawn = -10;
  /** tiles where nobody should stand around (doorways, 1-wide lanes, corridors, lift and stair mouths), by office version */
  private passages = { version: -1, tiles: new Set<number>() };
  /** standing people asked to shuffle aside for someone stuck behind them, with the tile they shuffle to */
  private nudged = new Map<Agent, Tile>();
  /** who is giving way to whom: the yielder waits on its side tile until the other has gone past */
  private yields = new Map<Agent, { other: Agent; from: Tile; until: number }>();
  private socialClock = 0;
  private meetingAt = 40;
  private lunchInvites = 0;
  readonly extensions: DirectorExtension[];

  constructor(
    readonly office: Office,
    readonly staff: Staff,
    /** 0 is the ground floor */
    readonly level: number,
  ) {
    this.nav = new Nav(office);
    this.travel = new Travel(this);
    this.extensions = EXTENSIONS.map((make) => make(this));
    const forced = forcedHour();
    this.clock = () => {
      if (forced !== null) {
        return forced;
      }
      const d = new Date();
      return d.getHours() + d.getMinutes() / 60;
    };
    office.onChange(() => this.onLayoutChange());
  }

  // ---------------------------------------------------------------- public API

  get cars(): Iterable<CarView> {
    return this.carList;
  }

  /** The building's clock (shared by every floor, so times carry over when people change floors). */
  get time(): number {
    return this.staff.time;
  }

  /** Animation state (0..1) for director-driven assets: elevator state for lifts, door openness for toilet stalls. */
  liftOpen(uid: number): number {
    return this.lifts.get(uid)?.openness ?? this.stalls.get(uid) ?? 0;
  }

  private updateStalls(dt: number): void {
    for (const spot of this.office.spotsFor('toilet')) {
      if (spot.pose !== 'sit') {
        continue;
      }
      const inside = this.agents.some((a) => a.seated && !a.hidden && a.tx === spot.x && a.ty === spot.y);
      const cur = this.stalls.get(spot.item.uid) ?? 1;
      const target = inside ? 0 : 1;
      this.stalls.set(spot.item.uid, target > cur ? Math.min(1, cur + dt * 3) : Math.max(0, cur - dt * 3));
    }
  }

  get hour(): number {
    return this.clock();
  }

  // ---------------------------------------------------------------- roster

  /** New info for someone on this floor (Staff calls it). Lifecycle events go to the home floor's extensions. */
  applyInfo(a: Agent, info: AgentInfo): void {
    this.onInfo(a, a.info, info);
    for (const ext of a.homeFloor.extensions) {
      ext.onInfo?.(a, a.info, info);
    }
    this.staff.meetings.onInfo(a, a.info, info);
    a.info = info;
  }

  /** Reactions to Claude state changes that aren't just "go work" / "take a break". */
  private onInfo(a: Agent, was: AgentInfo, now: AgentInfo): void {
    this.trackWork(a, was, now);
    if (!a.arrived) {
      return;
    }
    if (now.state === 'error' && was.state !== 'error') {
      const lines: Record<string, string> = {
        rate_limit: 'rate limited... coffee?',
        overloaded: 'servers busy...',
        authentication_failed: 'locked out?!',
        billing_error: 'uh oh, billing',
      };
      if (!remark(a, `Your work hit an error (${(now.error ?? 'it failed').replace(/_/g, ' ')}).`)) {
        a.say(lines[now.error ?? ''] ?? 'hmm, that failed', 3);
      }
      if (now.error === 'rate_limit' || now.error === 'overloaded') {
        a.chain = 'coffee';
      }
      this.maybeHelp(a, 0.5);
    } else if (now.state === 'compacting' && was.state !== 'compacting') {
      a.say('tidying my notes', 2.5);
    } else if (now.state === 'idle' && (was.state === 'thinking' || was.state === 'tool')) {
      noteTurn(a);
      if (!remark(a, 'You just finished your work task.')) {
        a.say(this.rand() < 0.5 ? 'done!' : 'all yours', 2);
      }
    } else if (now.tool && (now.tool === 'Agent' || now.tool === 'Task') && was.tool !== now.tool) {
      a.say('calling in help', 2);
    }
  }

  /** Some people walk down to IT help after an error (not too often). */
  private maybeHelp(a: Agent, chance: number): void {
    const t = track(a);
    if (!a.isSub && this.time >= t.helpAt && this.rand() < chance) {
      t.helpDue = true;
      t.helpAt = this.time + 150;
    }
  }

  /** Tool streaks (for walking to tool places), the start of a permission wait, and compaction chores. */
  private trackWork(a: Agent, was: AgentInfo, now: AgentInfo): void {
    const t = track(a);
    if ((now.errors ?? 0) > (was.errors ?? 0)) {
      if (this.time - t.errorAt < 90) {
        this.maybeHelp(a, 0.6);
      }
      t.errorAt = this.time;
    }
    const place = now.state === 'tool' || now.state === 'thinking' ? placeOf(now) : null;
    if (now.state === 'tool' && was.state === 'thinking' && t.thinkSince >= 0 && this.time - t.thinkSince > THINK_GRACE) {
      t.since = this.time;
    }
    if (place !== t.place) {
      t.place = place;
      t.since = this.time;
      t.delay = place === 'server' || place === 'qa' ? RUN_TRIP + this.rand() * 2 : 6 + this.rand() * 2.5;
    }
    if (now.state !== 'thinking') {
      t.thinkSince = -1;
    } else if (t.thinkSince < 0) {
      t.thinkSince = this.time;
    }
    if (now.waiting && !was.waiting) {
      t.waitSince = this.time;
    }
    if (now.state === 'compacting' && was.state !== 'compacting') {
      t.shredDue = true;
    } else if (now.state !== 'compacting') {
      t.shredDue = false;
    }
  }

  /**
   * Brings a newcomer onto this floor (Staff calls it). `present` people were already at work before the page
   * opened and start at their desk; everyone else arrives (by car or on foot, then up to `home`).
   */
  spawn(info: AgentInfo, home: Director, present: boolean): void {
    const npc = npcDef(info.id);
    const ident = npc ? { name: npc.name, profession: npc.role, index: -2 } : demoIdentity(info.id);
    const role = (npc && NPC_ROLES.get(npc.role)) || (ident && PROFESSION_BY_ID.get(ident.profession)) || professionForAgent(info.type, info.description);
    const everyone = this.staff.agents;
    const parent = info.parent ? everyone.find((o) => o.id === info.parent) : undefined;
    const slot = npc ? info.id : ident && ident.index >= 0 ? `demo#${ident.index}` : staffSlot(info, parent?.slot, new Set(everyone.filter((o) => !o.leaving).map((o) => o.slot)));
    if (!ident) {
      adoptLegacy(slot, `${role.id}#${everyone.filter((o) => !o.leaving && o.claude && o.role.id === role.id).length}`);
    }
    const a = new Agent(info, role, slot, personFor(slot, role, ident?.name), !!ident, seeded(hash(slot)));
    a.floor = this;
    a.homeFloor = home;
    a.preferredDesk = lastDesk(slot);
    const t = track(a);
    t.spawnedAt = this.time;
    t.waitSince = this.time - (info.waiting ? info.stateFor ?? 0 : 0);
    t.shredDue = info.state === 'compacting';
    if (present) {
      a.task = {
        kind: 'arrive',
        label: 'At work',
        activity: 'arrive',
        started: false,
        steps: [{ locked: true, tick: (x) => (this.placePresent(x), true) }],
      };
      this.agents.push(a);
      home.extensions.forEach((ext) => ext.onSpawn?.(a));
      return;
    }
    const start = Math.max(this.time, this.lastSpawn + (info.kind === 'sub' ? 0.8 : 2.5));
    this.lastSpawn = start;
    a.task = {
      kind: 'arrive',
      label: 'On the way',
      activity: 'arrive',
      started: false,
      steps: [{ locked: true, status: 'On the way', tick: () => this.time >= start }, ...this.travel.arrival(a)],
    };
    this.agents.push(a);
    home.extensions.forEach((ext) => ext.onSpawn?.(a));
  }

  /** At the desk when Claude is working or waiting on you, otherwise somewhere in the office; the car is already parked. */
  private placePresent(a: Agent): void {
    if (!a.isSub && this.rand() < a.traits.drives) {
      this.staff.ground.travel.parkNow(a);
    }
    const desk = a.info.busy || a.info.waiting ? this.deskFor(a) : undefined;
    const [tx, ty] = desk ? [desk.x, desk.y] : this.office.randomIndoorTile(this.rand);
    a.placeAt(tx, ty);
    a.hidden = false;
    a.alpha = 1;
    a.arrived = true;
  }

  /** Sends someone home (Staff calls it when they leave the roster). */
  dismiss(a: Agent): void {
    a.leaving = true;
    if (a.homeDesk) {
      a.homeFloor.release(a.homeDesk, a);
      a.homeDesk = null;
    }
    if (!a.arrived && a.hidden && !this.carList.some((c) => c.owner === a)) {
      a.gone = true;
      return;
    }
    if (!a.locked) {
      this.interrupt(a);
    }
  }

  // ---------------------------------------------------------------- reservations

  isFree(key: string, a: Agent): boolean {
    const holder = this.reserved.get(key);
    return !holder || holder === a || holder.gone;
  }

  hold(a: Agent, key: string): void {
    this.reserved.set(key, a);
    a.holds.add(key);
  }

  release(key: string, a: Agent): void {
    if (this.reserved.get(key) === a) {
      this.reserved.delete(key);
    }
    a.holds.delete(key);
  }

  /** Lets go of the spots and tiles the agent was using (keeps its home desk and `keep`). */
  leavePlace(a: Agent, keep?: string): void {
    for (const key of [...a.holds]) {
      if (key !== keep && key !== a.homeDesk) {
        this.release(key, a);
      }
    }
  }

  /** Lets go of a spot reserved on another floor for a trip that was dropped. */
  private unbind(a: Agent): void {
    if (a.bound) {
      a.bound.d.release(a.bound.key, a);
      a.bound = null;
    }
  }

  spotByKey(key: string | null): SpotRef | undefined {
    return key ? this.office.spots.find((s) => s.key === key) : undefined;
  }

  // ---------------------------------------------------------------- lifts and cars (used by travel)

  liftFor(spot: SpotRef): Lift {
    let lift = this.lifts.get(spot.item.uid);
    if (!lift) {
      lift = new Lift(spot.item.uid, spot.key, this.rand);
      this.lifts.set(spot.item.uid, lift);
    }
    return lift;
  }

  liftExists(lift: Lift): boolean {
    return this.lifts.get(lift.uid) === lift;
  }

  /**
   * Moves someone to another floor's director, mid-trip (hidden in the lift or the stairwell): lets go of what they
   * held here (their desk stays theirs) and keeps their task, which goes on over there.
   */
  handOver(a: Agent, to: Director): void {
    if (a.floor !== this || to === this) {
      return;
    }
    for (const key of [...a.holds]) {
      if (this.reserved.get(key) === a && !(key === a.homeDesk && a.homeFloor === this)) {
        this.release(key, a);
      }
    }
    for (const lift of this.lifts.values()) {
      lift.forget(a);
    }
    a.conv?.leave(a);
    a.seated = false;
    a.path = [];
    a.seg = null;
    a.goal = null;
    this.agents = this.agents.filter((x) => x !== a);
    to.agents.push(a);
    a.floor = to;
  }

  addCar(car: Car): void {
    this.carList.push(car);
  }

  carOf(a: Agent): Car | undefined {
    return this.carList.find((c) => c.owner === a && c.state === 'parked');
  }

  // ---------------------------------------------------------------- spatial helpers

  private visibleOthers(a: Agent): Agent[] {
    return this.agents.filter((b) => b !== a && !b.hidden && b.alpha > 0);
  }

  /** Local avoidance: a tile is taken while someone stands, sits or is stepping on it. */
  canEnter(a: Agent, x: number, y: number): boolean {
    for (const b of this.agents) {
      // people fading into or out of the stairwell or the lift are mid-step, not in the way: others follow right behind
      if (b === a || b.hidden || b.alpha < 1) {
        continue;
      }
      if ((b.tx === x && b.ty === y) || (b.seg && b.seg[0] === x && b.seg[1] === y)) {
        return false;
      }
    }
    return true;
  }

  /** Path cost around people standing still, so walkers route around groups and queues. */
  crowdPenalty(a: Agent, target?: Target): (x: number, y: number) => number {
    const w = this.office.w;
    const cost = new Map<number, number>();
    for (const b of this.visibleOthers(a)) {
      if (!b.moving) {
        cost.set(b.ty * w + b.tx, 25);
        continue;
      }
      // walkers: keep to the free lane of a 2-wide corridor instead of walking into them
      for (const [x, y] of [[b.tx, b.ty], ...b.path.slice(0, 3)]) {
        cost.set(y * w + x, Math.max(cost.get(y * w + x) ?? 0, 4));
      }
    }
    return (x, y) => (target && x === target.x && y === target.y ? 0 : cost.get(y * w + x) ?? 0);
  }

  /** Doorways (and the tiles either side), 1-wide lanes, corridors, and the tiles in front of the lift and stairs. */
  passage(x: number, y: number): boolean {
    const { office } = this;
    if (this.passages.version !== office.version) {
      const tiles = new Set<number>();
      const add = (tx: number, ty: number) => tiles.add(ty * office.w + tx);
      for (const item of office.layout.items) {
        if (office.defOf(item)?.door) {
          [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => add(item.x + dx, item.y + dy));
        }
      }
      for (const s of [...office.spotsFor('elevator'), ...office.spotsFor('stairs')]) {
        add(s.x, s.y);
        add(s.x, s.y + 1);
      }
      const corridors = new Set(roomsOf(this).filter((r) => r.label.kind === 'corridor').map((r) => r.nav));
      for (let ty = 0; ty < office.h; ty++) {
        for (let tx = 0; tx < office.w; tx++) {
          if (!office.walkable(tx, ty) || office.isOutdoor(tx, ty)) {
            continue;
          }
          const lane = (!office.walkable(tx - 1, ty) && !office.walkable(tx + 1, ty)) || (!office.walkable(tx, ty - 1) && !office.walkable(tx, ty + 1));
          if (lane || corridors.has(this.nav.roomOf(tx, ty))) {
            add(tx, ty);
          }
        }
      }
      this.passages = { version: office.version, tiles };
    }
    return this.passages.tiles.has(y * office.w + x);
  }

  private occupant(a: Agent, x: number, y: number): Agent | undefined {
    return this.visibleOthers(a).find((b) => (b.tx === x && b.ty === y) || (b.seg && b.seg[0] === x && b.seg[1] === y));
  }

  /**
   * Blocked walkers detour; when two meet head-on the one with a free side tile steps aside; someone just standing in
   * the way shuffles to a free tile; only then, as a last resort, the walker squeezes past.
   */
  resolveBlock(a: Agent): void {
    const next = a.path[0];
    const goal = a.goal;
    if (!next || !goal || this.yields.has(a)) {
      return;
    }
    const b = this.occupant(a, next[0], next[1]);
    const passing = b && [...this.yields].some(([y, w]) => (y === b && w.other === a) || (y === a && w.other === b));
    if (passing) {
      a.blockedFor = Math.min(a.blockedFor, 1);
      return;
    }
    // two walkers in each other's way: exactly one gives way (never both re-path into the same lane)
    const meeting = b && !b.seated && b.path.slice(0, 2).some(([x, y]) => x === a.tx && y === a.ty);
    if (b && meeting && a.blockedFor > 0.35) {
      if (this.giveWay(a, b)) {
        return;
      }
    } else if (a.blockedFor > 0.35 && !a.detoured) {
      a.detoured = true;
      const base = this.crowdPenalty(a);
      const p = this.nav.path(a.tx, a.ty, goal[0], goal[1], (x, y) => base(x, y) + (x === next[0] && y === next[1] ? 40 : 0));
      if (p && p.length && (p[0][0] !== next[0] || p[0][1] !== next[1]) && p.length <= a.path.length + 8) {
        a.path = p;
        a.blockedFor = 0.01;
        return;
      }
    }
    if (b && !meeting && a.blockedFor >= 0.6 && !b.moving && !b.seated && !b.locked && !b.path.length && !this.nudged.has(b)) {
      const tile = this.sideTile(b, next, a);
      if (tile) {
        b.path = [tile];
        b.goal = tile;
        this.nudged.set(b, tile);
        a.blockedFor = 0.3;
        return;
      }
    }
    if (a.blockedFor > 2.6) {
      a.ghostT = 1.4;
    }
  }

  /**
   * Head-on (or crossing) walkers: one of the pair, chosen by a stable priority (the one whose id sorts first, unless
   * it has no room or is in transit), steps to a side tile off the other's next few tiles and waits there until the
   * other has passed. Returns false when neither can make room.
   */
  private giveWay(a: Agent, b: Agent): boolean {
    const [first, second] = a.id < b.id ? [a, b] : [b, a];
    for (const [y, p] of [[first, second], [second, first]]) {
      if (y.locked || y.seated || !y.path.length || y.seg) {
        continue;
      }
      const tile = this.sideTile(y, y.path[0], p, p.path.slice(0, 3));
      if (!tile) {
        continue;
      }
      this.yields.set(y, { other: p, from: [y.tx, y.ty], until: this.time + 6 });
      y.path = [tile];
      y.blockedFor = 0;
      y.pauseT = 0;
      p.blockedFor = 0;
      return true;
    }
    return false;
  }

  /**
   * True while `a` waits on its side tile for the other walker to go past (walkTo holds its re-plan meanwhile). The
   * wait ends once the other is clear of the tile `a` stepped off, has stopped walking, or after a few seconds.
   */
  givingWay(a: Agent): boolean {
    const w = this.yields.get(a);
    if (!w) {
      return false;
    }
    const o = w.other;
    const near = (x: number, y: number) => Math.abs(x - w.from[0]) + Math.abs(y - w.from[1]) <= 1;
    const coming = o.path.slice(0, 3).some(([x, y]) => near(x, y)) || near(o.tx, o.ty);
    if (o.gone || o.hidden || o.floor !== this || !o.goal || this.time > w.until || !coming) {
      this.yields.delete(a);
      return false;
    }
    return true;
  }

  /** A free plain tile beside `who` that isn't on the other person's way (`avoid`), off passages first. */
  private sideTile(who: Agent, ahead: Tile, other: Agent, avoid: Tile[] = []): Tile | undefined {
    const blocked: Tile[] = [ahead, ...other.path.slice(0, 1), ...avoid, [other.tx, other.ty], ...[...this.yields.values()].map((w) => w.from)];
    return NEIGHBORS.map(([dx, dy]): Tile => [who.tx + dx, who.ty + dy])
      .filter(([x, y]) => this.nav.open(x, y) && this.nav.connected(who.tx, who.ty, x, y) && this.canEnter(who, x, y) && !blocked.some(([px, py]) => px === x && py === y))
      .sort((p, q) => +this.passage(p[0], p[1]) - +this.passage(q[0], q[1]))[0];
  }

  /** Moves nudged people onto their side tile (their hangout goes on there). */
  private shuffle(dt: number): void {
    for (const [a, tile] of this.nudged) {
      if (a.goal === tile && !a.walk(dt, (x, y) => this.canEnter(a, x, y))) {
        continue;
      }
      this.nudged.delete(a);
      if (a.goal === tile) {
        a.goal = null;
        for (const key of [...a.holds]) {
          if (key.startsWith('t:')) {
            this.release(key, a);
          }
        }
        this.hold(a, `t:${tile[0]},${tile[1]}`);
      }
    }
  }

  /** The tile to step onto when getting up from a seat. */
  exitTile(a: Agent): Tile {
    const back = a.seatExit;
    if (back && this.nav.open(back[0], back[1]) && ((back[0] === a.tx && back[1] === a.ty) || this.nav.connected(a.tx, a.ty, back[0], back[1]))) {
      return back;
    }
    const n = NEIGHBORS.map(([dx, dy]): Tile => [a.tx + dx, a.ty + dy]).find(([x, y]) => this.nav.open(x, y) && this.nav.connected(a.tx, a.ty, x, y));
    return n ?? this.office.nearestWalkable(a.tx, a.ty);
  }

  /** Free plain floor tiles near (x, y), nearest first; passages (doorways, lanes, corridors) only after every other tile. */
  freeTilesNear(a: Agent, x: number, y: number, r: number): Tile[] {
    const out: [Tile, number][] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        const d = Math.abs(dx) + Math.abs(dy);
        if (d > r || !this.nav.open(tx, ty) || !this.isFree(`t:${tx},${ty}`, a)) {
          continue;
        }
        if (this.office.spots.some((s) => s.x === tx && s.y === ty) || !this.canEnter(a, tx, ty)) {
          continue;
        }
        out.push([[tx, ty], d + this.rand() * 0.5 + (this.passage(tx, ty) ? 20 : 0)]);
      }
    }
    return out.sort((p, q) => p[1] - q[1]).map(([t]) => t);
  }

  /** Where the agent's desk (or a subagent's lead's desk) is, when it's on this floor. */
  deskTile(a: Agent): Tile | undefined {
    const own = a.homeFloor === this ? this.spotByKey(a.homeDesk) : undefined;
    if (own) {
      return [own.x, own.y];
    }
    const parent = this.parentOf(a);
    const ps = parent && parent.homeFloor === this ? this.spotByKey(parent.homeDesk) : undefined;
    return ps ? [ps.x, ps.y] : undefined;
  }

  private zoneDiffers(a: Agent, x: number, y: number): boolean {
    return this.office.isOutdoor(a.tx, a.ty) !== this.office.isOutdoor(x, y);
  }

  // ---------------------------------------------------------------- clock

  /** Lunch hours: the canteen serves and people go down to eat. */
  lunchTime(): boolean {
    const h = this.hour;
    return h >= 11 && h < 13;
  }

  private daylight(): boolean {
    const h = this.hour;
    return h >= 7.5 && h < 19;
  }

  private get day(): number {
    return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  }

  // ---------------------------------------------------------------- main loop

  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    this.nav.sync();
    for (const lift of this.lifts.values()) {
      lift.update(dt, this.time);
    }
    this.updateStalls(dt);
    this.updateCars(dt);
    this.shuffle(dt);
    for (const [y] of this.yields) {
      if (y.floor !== this || y.gone) {
        this.yields.delete(y);
      }
    }
    const lunch = this.lunchTime();
    for (const a of this.agents) {
      a.tickTimers(dt);
      if (!a.hidden) {
        decay(a.needs, a.traits, {
          working: a.task?.kind === 'work' && a.info.busy,
          seated: a.seated,
          company: !!a.conv?.started,
          lunchHour: lunch && a.lunchDay !== this.day,
        }, dt);
        if (a.conv?.started) {
          restore(a.needs, { social: 1 }, dt / 35);
        }
      }
      this.review(a);
      if (a.arrived && !a.leaving && !a.hidden) {
        muse(a);
      }
      if (a.arrived && !a.leaving && !a.info.busy && !a.info.waiting && a.task && IDLE_KINDS.includes(a.task.kind) && wantsPrefetch(a)) {
        prefetch(a, a.npc ? npcChoices(this, a) : this.idleChoices(a).slice(0, 3));
      }
      if (!a.task && this.time >= a.decideAt) {
        this.decide(a);
      }
      this.runTask(a, dt);
    }
    for (const c of this.convs) {
      c.update(this.time);
    }
    this.convs = this.convs.filter((c) => !c.done);
    this.socialClock += dt;
    if (this.socialClock >= 0.5) {
      this.socialClock = 0;
      this.greetings();
      this.deskBanter();
      this.startConversations();
      this.maybeMeeting();
    }
    for (const ext of this.extensions) {
      ext.update?.(dt);
    }
    for (const a of this.agents.filter((x) => x.gone)) {
      this.cleanupGone(a);
      a.homeFloor.extensions.forEach((ext) => ext.onGone?.(a));
    }
    this.agents = this.agents.filter((a) => !a.gone);
    const everyone = this.staff.agents;
    for (const project of this.projectRooms.keys()) {
      if (!everyone.some((a) => !a.leaving && a.info.project === project)) {
        this.projectRooms.delete(project);
      }
    }
  }

  private cleanupGone(a: Agent): void {
    this.interrupt(a);
    for (const key of [...a.holds]) {
      this.release(key, a);
    }
    if (a.homeDesk) {
      a.homeFloor.release(a.homeDesk, a);
    }
    for (const lift of this.lifts.values()) {
      lift.forget(a);
    }
    for (const [key, holder] of this.reserved) {
      if (holder === a && !this.carList.some((c) => c.owner === a && c.bay.key === key && c.state !== 'gone')) {
        this.reserved.delete(key);
      }
    }
  }

  private updateCars(dt: number): void {
    const blocked = (car: Car, dir: Parameters<Car['ahead']>[0]) => this.carList.some((o) => o !== car && o.moving && car.ahead(dir, o.x, o.y));
    for (const car of this.carList) {
      if (car.update(dt, blocked)) {
        if (car.state === 'arriving') {
          car.state = 'parked';
          car.alpha = 1;
        } else {
          car.state = 'gone';
        }
      }
      if (car.state === 'leaving' && car.owner && !car.owner.gone && !car.owner.hidden) {
        car.owner = null;
      }
    }
    for (const car of this.carList.filter((c) => c.state === 'gone')) {
      if (car.owner && this.reserved.get(car.bay.key) === car.owner) {
        this.reserved.delete(car.bay.key);
      }
      if (this.reserved.get(car.bay.key)?.gone) {
        this.reserved.delete(car.bay.key);
      }
    }
    this.carList = this.carList.filter((c) => c.state !== 'gone');
  }

  private runTask(a: Agent, dt: number): void {
    const task = a.task;
    if (!task) {
      a.moving = false;
      return;
    }
    task.started = true;
    for (let guard = 0; guard < 6 && a.task === task && a.floor === this; guard++) {
      const step = task.steps[0];
      if (!step) {
        this.endTask(a, true);
        return;
      }
      if (!step.begun) {
        step.begun = true;
        if (step.begin?.(a) === false) {
          step.end?.(a);
          this.endTask(a, false);
          return;
        }
      }
      if (!step.tick(a, dt)) {
        return;
      }
      step.end?.(a);
      task.steps.shift();
      dt = 0;
    }
  }

  private endTask(a: Agent, ok: boolean): void {
    const task = a.task;
    if (!task) {
      return;
    }
    a.task = null;
    task.cleanup?.();
    this.unbind(a);
    a.act = 'idle';
    a.moving = false;
    if (!ok) {
      a.lastDone.set(task.activity, this.time);
    }
    a.decideAt = this.time + (ok ? 0.4 + this.rand() * 1.2 : 0.8);
  }

  /** Drops the current task (the agent stays where it is; the next task's walk stands it up). */
  interrupt(a: Agent): void {
    const task = a.task;
    if (!task) {
      return;
    }
    a.task = null;
    const step = task.steps[0];
    if (step?.begun) {
      step.end?.(a);
    }
    task.cleanup?.();
    this.unbind(a);
    if (a.conv) {
      a.conv.leave(a);
    }
    for (const lift of this.lifts.values()) {
      lift.forget(a);
    }
    a.act = 'idle';
    a.path = a.seg ? [a.seg] : [];
    a.decideAt = this.time;
  }

  // ---------------------------------------------------------------- decisions

  /** Claude state wins over free time: waiting and busy agents drop what they're doing (after a short reaction). */
  private review(a: Agent): void {
    if (!a.task || a.hidden || a.locked) {
      a.reactT = 0;
      return;
    }
    const k = a.task.kind;
    if (k === 'wait' && !a.info.waiting && !a.leaving) {
      this.interrupt(a);
      return;
    }
    let switchTo = false;
    if (a.leaving) {
      switchTo = k !== 'leave';
      if (switchTo) {
        this.interrupt(a);
        return;
      }
    } else if (a.info.waiting) {
      switchTo = k !== 'wait' && k !== 'arrive';
    } else if (a.info.busy) {
      switchTo = IDLE_KINDS.includes(k) || k === 'meeting';
    }
    if (!switchTo) {
      a.reactT = 0;
      return;
    }
    if (!a.reactT) {
      a.reactT = this.time + (a.info.waiting ? 0.3 + this.rand() * 0.8 : 0.6 + this.rand() * 2);
    } else if (this.time >= a.reactT) {
      // in the middle of a conversation they finish their turn and excuse themselves first (it lets them go)
      if (a.conv?.started && !a.conv.done) {
        a.conv.excuse(a);
        return;
      }
      a.reactT = 0;
      this.interrupt(a);
    }
  }

  private decide(a: Agent): void {
    let task: Task | null = null;
    if (a.leaving) {
      task = this.task('leave', 'Heading home', 'leave', [...this.folderBack(a), ...this.travel.departure(a)]);
    } else if (!a.arrived) {
      task = this.task('arrive', 'Arriving', 'arrive', this.travel.arrival(a));
    } else if (a.npc) {
      const pick = takeDecision(a, () => npcChoices(this, a));
      task = pick === 'wait' ? this.thinkTask() : pick ?? npcTask(this, a);
    } else if ((a.info.waiting || a.info.busy) && a.homeFloor !== this && this.travel.connects(a.homeFloor)) {
      task = this.task(a.info.waiting ? 'wait' : 'work', 'Heading to the desk', 'home', this.travel.toFloor(a, a.homeFloor) ?? []);
    } else if (a.info.waiting) {
      task = this.waitTask(a);
    } else if (a.info.busy) {
      task = this.microBreak(a) ?? this.detour(a) ?? this.workTask(a);
    } else if (track(a).helpDue) {
      task = this.helpTask(a);
    } else if (a.chain) {
      const def = ACTIVITY_BY_ID.get(a.chain);
      a.chain = null;
      const pick = def && this.findSpot(a, def);
      task = def && pick ? this.activityTask(a, def, pick) : null;
    }
    if (!task && !a.info.busy && !a.info.waiting && !a.leaving && !a.npc) {
      const pick = takeDecision(a, () => this.idleChoices(a).slice(0, 3));
      task = pick === 'wait' ? this.thinkTask() : pick ?? this.chooseIdle(a);
    }
    a.task = task ?? this.task('idle', 'Looking around', 'pause', [hangout({ seconds: 1.5 + this.rand() * 2, chatty: true })]);
  }

  /** A beat in place while the agent's model decides what's next. */
  private thinkTask(): Task {
    return this.task('idle', 'Looking around', 'think', [pause(0.4)]);
  }

  task(kind: TaskKind, label: Task['label'], activity: string, steps: Step[], cleanup?: () => void): Task {
    return { kind, label, activity, steps, started: false, cleanup };
  }

  // ---------------------------------------------------------------- work

  /**
   * The agent's desk: keeps one for the whole visit. People of one project share a claimed room (see
   * projectDesk); subagents sit near their parent (same room first); overflow takes the nearest free desk.
   */
  private deskFor(a: Agent): SpotRef | undefined {
    if (a.homeFloor !== this) {
      return undefined;
    }
    const own = this.spotByKey(a.homeDesk);
    if (own) {
      return own;
    }
    a.homeDesk = null;
    const desk = (!a.isSub && this.projectDesk(a)) || this.nearestDesk(a);
    if (desk) {
      a.homeDesk = desk.key;
      this.reserved.set(desk.key, a);
    }
    return desk;
  }

  private takeable(a: Agent, s: SpotRef | undefined): s is SpotRef {
    return !!s && this.isFree(s.key, a) && this.deskRoom(s) && this.travel.reachable(a, s.x, s.y);
  }

  /** Desks in named service rooms (the guard's, the IT tech's) aren't for coworkers. */
  private deskRoom(s: SpotRef): boolean {
    const room = roomAt(this, s.x, s.y);
    return !room || room.label.kind === 'office';
  }

  /** A desk in the project's room, claiming a free desk room for the project's first person. */
  private projectDesk(a: Agent): SpotRef | undefined {
    const project = a.info.project;
    if (!project) {
      return undefined;
    }
    const preferred = this.spotByKey(a.preferredDesk);
    const usable = this.takeable(a, preferred) ? preferred : undefined;
    const room = this.projectRooms.get(project) ?? this.claimRoom(project, usable);
    if (room === undefined) {
      return usable;
    }
    if (usable && this.nav.roomOf(usable.x, usable.y) === room) {
      return usable;
    }
    const dist = (s: SpotRef) => Math.abs(s.x - a.tx) + Math.abs(s.y - a.ty);
    return this.office
      .spotsFor('work')
      .filter((s) => this.nav.roomOf(s.x, s.y) === room && this.isFree(s.key, a) && this.deskRoom(s))
      .sort((p, q) => dist(p) - dist(q))
      .find((s) => this.travel.reachable(a, s.x, s.y));
  }

  /** Claims the unclaimed indoor room with the most free desks (the preferred desk's room first). */
  private claimRoom(project: string, preferred: SpotRef | undefined): number | undefined {
    const taken = new Set(this.projectRooms.values());
    const free = new Map<number, number>();
    for (const s of this.office.spotsFor('work')) {
      const room = this.nav.roomOf(s.x, s.y);
      if (room > 0 && !taken.has(room) && !this.reserved.get(s.key) && this.deskRoom(s)) {
        free.set(room, (free.get(room) ?? 0) + 1);
      }
    }
    const pref = preferred && this.nav.roomOf(preferred.x, preferred.y);
    const room = pref && free.has(pref) ? pref : [...free].sort((p, q) => q[1] - p[1])[0]?.[0];
    if (room !== undefined) {
      this.projectRooms.set(project, room);
    }
    return room;
  }

  private nearestDesk(a: Agent): SpotRef | undefined {
    const anchor = this.deskTile(a) ?? [a.tx, a.ty];
    const room = this.nav.roomOf(anchor[0], anchor[1]);
    const claimed = new Map([...this.projectRooms].map(([p, r]) => [r, p]));
    const foreign = (s: SpotRef) => {
      const owner = claimed.get(this.nav.roomOf(s.x, s.y));
      return owner !== undefined && owner !== a.info.project;
    };
    const kinds: [Activity, number][] = a.isSub ? [['work', 0], ['meeting', 6], ['social', 10]] : [['work', 0], ['meeting', 60], ['social', 80]];
    const options = this.office.spots
      .map((s) => ({ s, extra: kinds.find(([k]) => k === s.activity)?.[1] }))
      .filter(({ s, extra }) => extra !== undefined && this.isFree(s.key, a) && !this.office.isOutdoor(s.x, s.y) && (s.activity !== 'work' || this.deskRoom(s)))
      .map(({ s, extra }) => ({
        s,
        d: Math.abs(s.x - anchor[0]) + Math.abs(s.y - anchor[1]) + extra! + (a.isSub && this.nav.roomOf(s.x, s.y) !== room ? 10 : 0) + (!a.isSub && foreign(s) ? 30 : 0),
      }))
      .sort((p, q) => p.d - q.d);
    return options.slice(0, 5).find(({ s }) => this.travel.reachable(a, s.x, s.y))?.s;
  }

  private workLabel(a: Agent): () => string {
    return () => {
      if (a.info.waiting) {
        return 'Waiting for you';
      }
      if (!a.info.busy) {
        return a.info.background ? 'Waiting on background work' : 'Wrapping up';
      }
      if (a.info.state === 'compacting') {
        return 'Tidying notes (compacting)';
      }
      if (!a.info.tool || a.info.state === 'thinking') {
        return 'Thinking';
      }
      return a.info.detail ? `${a.info.tool} · ${a.info.detail}` : `Working · ${a.info.tool}`;
    };
  }

  private workTask(a: Agent): Task | null {
    const desk = this.deskFor(a);
    let target: Target | null = desk ? { x: desk.x, y: desk.y, spot: desk } : null;
    if (!target) {
      const anchor = this.deskTile(a) ?? [a.tx, a.ty];
      const tile = this.freeTilesNear(a, anchor[0], anchor[1], 3)[0];
      target = tile ? { x: tile[0], y: tile[1] } : { x: a.tx, y: a.ty };
    }
    const route = this.travel.route(a, target, 'Heading to the desk') ?? [];
    let linger = -1;
    let quip = 15 + this.rand() * 30;
    const work: Step = {
      begin: () => {
        if (!desk) {
          this.hold(a, `t:${target!.x},${target!.y}`);
        }
      },
      tick: (x, dt) => {
        if (x.info.waiting || x.leaving) {
          return true;
        }
        if (!x.info.busy) {
          x.act = 'idle';
          if (linger < 0) {
            linger = 3 + this.rand() * 7;
          }
          return (linger -= dt) <= 0;
        }
        linger = -1;
        x.act = this.workAct(x);
        if (this.time >= x.breakAt && criticalNeed(x.needs, 0.15, ['bladder', 'thirst', 'energy', 'hunger'])) {
          return true;
        }
        if (this.detourDue(x)) {
          return true;
        }
        if ((quip -= dt) <= 0) {
          quip = 25 + this.rand() * 40;
          if (!aiOn() && !x.bubble && this.rand() < 0.5) {
            x.say(x.info.state === 'thinking' ? '...' : toolPhrase(x.info.tool, x.info.detail), 2.2);
          }
        }
        return false;
      },
      end: (x) => {
        x.act = 'idle';
      },
    };
    return this.task('work', this.workLabel(a), 'work', [...route, work]);
  }

  /** Hands while working: thinking is mostly still with bursts of typing, delegating is talking (to the helper). */
  private workAct(x: Agent): Act {
    if (!x.seated) {
      return 'read';
    }
    const tool = x.info.tool;
    if (x.info.state === 'thinking' || !tool) {
      return x.anim % 6 < 3.8 ? 'idle' : 'type';
    }
    if (tool === 'Agent' || tool === 'Task') {
      return 'talk';
    }
    return 'type';
  }

  /** A quick break for a pressing need while Claude is busy, then straight back to the desk. */
  private microBreak(a: Agent): Task | null {
    if (this.time < a.breakAt) {
      return null;
    }
    const need = criticalNeed(a.needs, 0.15, ['bladder', 'thirst', 'energy', 'hunger']);
    if (!need) {
      return null;
    }
    a.breakAt = this.time + 60;
    for (const id of MICRO_BREAK[need] ?? []) {
      const def = ACTIVITY_BY_ID.get(id)!;
      const pick = this.findSpot(a, def);
      const task = pick && this.activityTask(a, def, pick);
      if (task) {
        task.kind = 'need';
        return task;
      }
    }
    return null;
  }

  /** The tile beside the desk where someone stands while waiting. */
  private deskSide(a: Agent, desk: SpotRef): Tile | undefined {
    const [fx, fy] = DIR_STEP[desk.facing];
    const spots = NEIGHBORS.map(([dx, dy]): Tile => [desk.x + dx, desk.y + dy]).filter(([x, y]) => !(x === desk.x + fx && y === desk.y + fy) && this.nav.open(x, y));
    spots.sort((p, q) => +this.passage(p[0], p[1]) - +this.passage(q[0], q[1]));
    return (a.seated && a.tx === desk.x && a.ty === desk.y ? a.seatExit : null) ?? spots[0];
  }

  /**
   * Waiting for the user's permission, with rising urgency: waving and checking the phone by the desk; after BELL_AT
   * seconds a walk to the reception bell (ding!); after PHONE_AT back by the desk on the phone. The review drops it
   * the moment the wait is over.
   */
  private waitTask(a: Agent): Task {
    const t = track(a);
    const elapsed = () => this.time - t.waitSince;
    const desk = a.homeFloor === this ? this.spotByKey(a.homeDesk) : undefined;
    const side = desk && this.deskSide(a, desk);
    const toDesk = (): Step[] => (side ? this.travel.route(a, { x: side[0], y: side[1], face: 'down' }, 'Waiting for you') ?? [] : []);
    const bell = elapsed() < PHONE_AT ? this.nearSpot(a, ['bell']) : undefined;
    const bellRoute = bell && this.travel.route(a, { x: bell.x, y: bell.y, spot: bell }, 'Going to ring the bell');
    const steps: Step[] = [];
    if (elapsed() < (bellRoute ? BELL_AT : PHONE_AT)) {
      steps.push(...toDesk(), this.waitAt('wave', () => elapsed() >= (bellRoute ? BELL_AT : PHONE_AT)));
    }
    if (bellRoute) {
      steps.push(...bellRoute, this.ringBell(elapsed));
    }
    steps.push(...(bellRoute || elapsed() >= PHONE_AT ? toDesk() : []), this.waitAt('phone', () => false));
    return this.task('wait', 'Waiting for you', 'wait', steps);
  }

  private waitAt(mode: 'wave' | 'phone', until: () => boolean): Step {
    let t = 0;
    let nag = 0;
    return {
      status: 'Waiting for you',
      begin: (x) => {
        x.dir = 'down';
        x.say(mode === 'wave' ? 'need you!' : '?', 3);
        nag = 6 + this.rand() * 3;
      },
      tick: (x, dt) => {
        t += dt;
        if (!x.seated) {
          x.dir = 'down';
        }
        x.act = mode === 'phone' || t % 8 >= 1.8 ? 'phone' : 'wave';
        if ((nag -= dt) <= 0) {
          nag = mode === 'phone' ? 4 + this.rand() * 3 : 6 + this.rand() * 4;
          x.say(mode === 'phone' || this.rand() < 0.6 ? '?' : 'need you!', 2.5);
        }
        return !x.info.waiting || x.leaving || until();
      },
      end: (x) => {
        x.act = 'idle';
      },
    };
  }

  private ringBell(elapsed: () => number): Step {
    let ding = 0;
    return {
      status: 'Ringing for you',
      tick: (x, dt) => {
        x.act = 'idle';
        if ((ding -= dt) <= 0) {
          ding = 11 + this.rand() * 4;
          track(x).dingAt = this.time;
          x.say('ding!', 1.4);
          x.sayLater(pickFrom(['hello?', 'anyone?', 'need you!'], this.rand), 1.8, 2);
          playCue('bell');
        }
        return !x.info.waiting || x.leaving || elapsed() >= PHONE_AT;
      },
    };
  }

  // ---------------------------------------------------------------- work visibility: tool places, chores, handoffs

  /** Something to get up for while working: briefing a new subagent, shredding notes, IT help, a tool place. */
  private detour(a: Agent): Task | null {
    this.queueBrief(a);
    return this.handoffTask(a) ?? this.shredTask(a) ?? this.helpTask(a) ?? this.toolTrip(a);
  }

  /** Ends the desk step when `detour` has something to do (each reason clears itself when it can't happen). */
  private detourDue(a: Agent): boolean {
    const t = track(a);
    return t.shredDue || t.helpDue || this.pendingBriefs(a).length > 0 || this.tripDue(a);
  }

  /** Down to the IT help desk (any floor) with an error: explain it, get it fixed, back to the floor it left. */
  private helpTask(a: Agent): Task | null {
    const t = track(a);
    if (!t.helpDue) {
      return null;
    }
    t.helpDue = false;
    const it = itOnDuty(this);
    if (!it || a.info.waiting) {
      return null;
    }
    const { tech, desk } = it;
    const tile = tech.floor.freeTilesNear(a, desk.x, desk.y + 2, 1)[0];
    const route = tile && this.routeTo(a, tech.floor, { x: tile[0], y: tile[1], face: 'up' }, 'Off to IT help');
    if (!route) {
      return null;
    }
    let left = 9 + this.rand() * 5;
    let line = 0;
    const chat: Step = {
      status: 'Getting help from IT',
      begin: (x) => tech.floor.hold(x, `t:${tile![0]},${tile![1]}`),
      tick: (x, dt) => {
        x.face(tech.x, tech.y);
        tech.face(x.x, x.y);
        if ((line -= dt) <= 0) {
          line = 2.6;
          const [who, lines] = Math.round(left / 2.6) % 2 ? [x, HELP_LINES] : [tech, TECH_LINES];
          who.say(pickFrom(lines, this.rand), 2.2);
        }
        return (left -= dt) <= 0 || x.info.waiting;
      },
    };
    const back = tech.floor === this ? [] : [defer((x: Agent) => tech.floor.travel.toFloor(x, this))];
    return this.task('need', 'Off to IT help', 'it', [...route, chat, ...back]);
  }

  private parentOf(a: Agent): Agent | undefined {
    return a.info.parent ? this.staff.agents.find((o) => o.id === a.info.parent) : undefined;
  }

  /** The nearest free spot of these kinds (best kind first) from the agent's desk. */
  private nearSpot(a: Agent, kinds: Activity[]): SpotRef | undefined {
    const [ax, ay] = this.deskTile(a) ?? [a.tx, a.ty];
    return this.office.spots
      .filter((s) => kinds.includes(s.activity) && this.isFree(s.key, a) && !this.office.isOutdoor(s.x, s.y))
      .map((s) => ({ s, d: Math.abs(s.x - ax) + Math.abs(s.y - ay) + kinds.indexOf(s.activity) * 6 }))
      .sort((p, q) => p.d - q.d)
      .slice(0, 3)
      .find(({ s }) => this.travel.reachable(a, s.x, s.y))?.s;
  }

  private thinkingLong(a: Agent): boolean {
    const t = track(a);
    return a.info.state === 'thinking' && t.thinkSince >= 0 && this.time - t.thinkSince > THINK_GRACE;
  }

  /** A tool streak (thinking between calls included) that has lasted long enough to walk over to its place. */
  private tripDue(a: Agent): boolean {
    const t = track(a);
    return !!t.place && a.info.busy && a.info.state !== 'compacting' && this.time >= t.nextTrip && this.time - t.since >= t.delay && !this.thinkingLong(a);
  }

  private tripOver(a: Agent, place: Place): boolean {
    const t = track(a);
    return !a.info.busy || a.info.waiting || a.leaving || t.place !== place || t.shredDue || this.thinkingLong(a) || this.pendingBriefs(a).length > 0;
  }

  /** Reads at the archive, browses at the kiosk, runs commands at the rack, tests at the QA bench; back when the tool changes. */
  private toolTrip(a: Agent): Task | null {
    if (!this.tripDue(a)) {
      return null;
    }
    const t = track(a);
    const place = t.place!;
    t.nextTrip = this.time + 15;
    const pick = this.spotsAnywhere(a, PLACE_SPOTS[place], { near: this.deskTile(a) }).slice(0, 3).find((p) => p.d !== this || this.travel.reachable(a, p.spot.x, p.spot.y));
    if (pick && pick.d !== this && this.time - t.since < CROSS_FLOOR_TRIP) {
      t.nextTrip = t.since + CROSS_FLOOR_TRIP;
      return null;
    }
    const spot = pick?.spot;
    const route = pick && this.routeTo(a, pick.d, { x: pick.spot.x, y: pick.spot.y, spot: pick.spot }, PLACE_STATUS[place]);
    if (!spot || !route) {
      return null;
    }
    const lamps = labLamps(pick.d.office);
    const errors = a.info.errors ?? 0;
    const failed = (x: Agent) => (x.info.errors ?? 0) > errors;
    let quip = 2 + this.rand() * 3;
    const at: Step = {
      begin: () => {
        if (place === 'qa') {
          lamps.set(spot.item.uid, { state: 'run', until: Infinity });
        }
      },
      tick: (x, dt) => {
        x.act = place === 'files' ? 'read' : 'idle';
        if (place === 'qa' && failed(x)) {
          lamps.set(spot.item.uid, { state: 'fail', until: Infinity });
        }
        if ((quip -= dt) <= 0) {
          quip = 14 + this.rand() * 12;
          if (!aiOn() && !x.bubble) {
            x.say(toolPhrase(x.info.tool, x.info.detail), 2.2);
          }
        }
        return this.tripOver(x, place);
      },
      end: (x) => {
        x.act = 'idle';
        t.nextTrip = this.time + 6 + this.rand() * 6;
        if (place === 'qa') {
          lamps.set(spot.item.uid, { state: failed(x) ? 'fail' : 'pass', until: this.time + 30 });
          x.say(failed(x) ? 'tests failed...' : 'all green!', 2);
        }
      },
    };
    const walk = route.map((s) => (s.locked ? s : unless(s, (x) => this.tripOver(x, place))));
    return this.task('work', this.workLabel(a), `tool:${place}`, [...walk, at]);
  }

  /** Compaction as a chore: an armful of old notes to the shredder, then back to the desk. */
  private shredTask(a: Agent): Task | null {
    const t = track(a);
    if (!t.shredDue) {
      return null;
    }
    t.shredDue = false;
    const spot = this.nearSpot(a, ['shred']);
    const route = spot && this.travel.route(a, { x: spot.x, y: spot.y, spot }, 'Taking old notes to the shredder');
    if (!spot || !route) {
      return null;
    }
    let left = 3.5 + this.rand() * 2;
    return this.task('work', 'Tidying notes (compacting)', 'shred', [
      call(() => (t.carry = 'papers')),
      ...route,
      {
        status: 'Shredding old notes',
        begin: (x) => x.say('bzzzt...', 2),
        tick: (_x, dt) => (left -= dt) <= 0,
      },
      call(() => (t.carry = null)),
    ], () => (t.carry = null));
  }

  /** A subagent that just arrived asks its lead (busy, in the office) for a brief; otherwise it goes without. */
  private queueBrief(a: Agent): void {
    const t = track(a);
    if (!a.isSub || t.briefed) {
      return;
    }
    const lead = this.parentOf(a);
    if (!lead || !lead.arrived || lead.hidden || lead.leaving || !lead.info.busy) {
      t.briefed = true;
      return;
    }
    const queue = track(lead).handoffs;
    if (!queue.includes(a)) {
      queue.push(a);
    }
  }

  private pendingBriefs(a: Agent): Agent[] {
    const t = track(a);
    if (t.handoffs.length) {
      t.handoffs = t.handoffs.filter((s) => !s.gone && !s.leaving && !track(s).briefed);
    }
    return t.handoffs;
  }

  /** The lead walks over to a new subagent (at its desk) and hands it a folder. */
  private handoffTask(a: Agent): Task | null {
    const sub = this.pendingBriefs(a)[0];
    if (!sub) {
      return null;
    }
    const st = track(sub);
    const [gx, gy] = sub.goal ?? [sub.tx, sub.ty];
    const tile = sub.floor !== this || this.zoneDiffers(a, gx, gy) ? undefined : this.freeTilesNear(a, gx, gy, 2)[0];
    const route = tile && this.travel.route(a, { x: tile[0], y: tile[1] }, `Briefing ${sub.name}`);
    if (!tile || !route) {
      st.briefed = true;
      return null;
    }
    const t = track(a);
    let waited = 0;
    return this.task('work', `Briefing ${sub.name}`, 'handoff', [
      call(() => (t.carry = 'folder')),
      ...route,
      call((x) => this.hold(x, `t:${tile[0]},${tile[1]}`)),
      {
        status: `Briefing ${sub.name}`,
        tick: (x, dt) => {
          x.face(sub.x, sub.y);
          waited += dt;
          return sub.gone || sub.leaving || (x.tilesTo(sub) < 2.3 && !sub.moving) || waited > 15;
        },
      },
      call((x) => {
        if (sub.gone || sub.leaving) {
          return;
        }
        t.carry = null;
        st.carry = 'folder';
        st.briefed = true;
        x.say(pickFrom(['here you go', "here's the brief", 'all yours', 'good luck!'], this.rand), 2);
        sub.sayLater(pickFrom(['on it!', 'got it', 'thanks!', 'roger'], this.rand), 0.7, 1.8);
      }),
      pause(1.2),
    ], () => (t.carry = null));
  }

  /** A leaving subagent first walks its folder back to the lead. */
  private folderBack(a: Agent): Step[] {
    const t = track(a);
    const lead = this.parentOf(a);
    if (!a.isSub || t.carry !== 'folder' || t.returned || a.hidden || !lead || lead.floor !== this || lead.hidden || lead.leaving || this.zoneDiffers(a, lead.tx, lead.ty)) {
      return [];
    }
    t.returned = true;
    const tile = this.freeTilesNear(a, lead.tx, lead.ty, 2)[0];
    const route = tile && this.travel.route(a, { x: tile[0], y: tile[1] }, 'Bringing the results back');
    if (!route) {
      return [];
    }
    return [
      ...route,
      call((x) => {
        x.face(lead.x, lead.y);
        t.carry = null;
        x.say(pickFrom(['all done!', 'results!', 'done, boss'], this.rand), 2);
        if (!lead.bubble) {
          lead.sayLater(pickFrom(['thanks!', 'nice work', 'great'], this.rand), 0.7, 1.8);
        }
      }),
      pause(1.2),
    ];
  }

  // ---------------------------------------------------------------- free time

  private recency(a: Agent, id: string): number {
    const last = a.lastDone.get(id);
    return last !== undefined && this.time - last < 120 ? 0.25 : 1;
  }

  /**
   * Free spots of these activities on every floor this one connects to, nearest first (activities listed first win
   * ties). Distance is in tiles; another floor adds FLOOR_COST per level, going outside or inside 30 more.
   * `outdoor`: 'no' (default) indoor spots only, 'only' outdoor spots only, 'any' both.
   */
  spotsAnywhere(a: Agent, activities: Activity[], opts: { near?: Tile; outdoor?: 'no' | 'only' | 'any' } = {}): FloorSpot[] {
    const [ax, ay] = opts.near ?? [a.tx, a.ty];
    const outdoor = opts.outdoor ?? 'no';
    const here = this.office.isOutdoor(ax, ay);
    const options: { pick: FloorSpot; cost: number }[] = [];
    for (const d of this.staff.directors) {
      if (d !== this && !this.travel.connects(d)) {
        continue;
      }
      for (const s of d.office.spots) {
        if (!activities.includes(s.activity) || !d.isFree(s.key, a)) {
          continue;
        }
        const out = d.office.isOutdoor(s.x, s.y);
        if (outdoor === 'only' ? !out : outdoor === 'no' && out) {
          continue;
        }
        const levels = Math.abs(d.level - this.level);
        const outsideFirst = levels ? false : here;
        const cost = Math.abs(s.x - ax) + Math.abs(s.y - ay) + levels * FLOOR_COST + (out !== outsideFirst ? 30 : 0) + activities.indexOf(s.activity) * 8;
        options.push({ pick: { d, spot: s }, cost });
      }
    }
    return options.sort((p, q) => p.cost - q.cost).map((o) => o.pick);
  }

  private findSpot(a: Agent, def: ActivityDef, near?: Tile): FloorSpot | undefined {
    const options = this.spotsAnywhere(a, def.spots, { near, outdoor: def.outdoor ?? 'no' });
    const jittered = options.slice(0, 8).map((pick, i) => ({ pick, r: i + this.rand() * 1.5 })).sort((p, q) => p.r - q.r);
    return jittered.slice(0, 4).find(({ pick }) => pick.d !== this || this.travel.reachable(a, pick.spot.x, pick.spot.y))?.pick;
  }

  /** How far a spot is for choosing what to do: tiles, plus the trip when it's on another floor or across the front door. */
  private distance(a: Agent, pick: FloorSpot): number {
    const { d, spot } = pick;
    const trip = d === this ? (this.zoneDiffers(a, spot.x, spot.y) ? 30 : 0) : Math.abs(d.level - this.level) * FLOOR_COST;
    return Math.abs(spot.x - a.tx) + Math.abs(spot.y - a.ty) + trip;
  }

  /**
   * Steps that bring `a` to `target` on floor `to`: an ordinary route on this floor; otherwise the lift or stairs
   * trip, then a walk on `to`. Null when there's no way.
   */
  routeTo(a: Agent, to: Director, target: Target, status?: string): Step[] | null {
    if (to === this) {
      return this.travel.route(a, target, status);
    }
    const trip = this.travel.toFloor(a, to);
    if (!trip) {
      return null;
    }
    const key = target.spot?.key;
    if (key) {
      this.unbind(a);
      to.hold(a, key);
      a.bound = { d: to, key };
    }
    return [...trip, call((x) => (x.bound = null), true), walkTo(to, target, status)];
  }

  /**
   * Goes to a spot on any floor, runs `stay` there (e.g. a hangout), then comes back to this floor (out of the lift
   * or stairs; the next decision takes it on from there). Null when the spot can't be reached.
   */
  visit(a: Agent, pick: FloorSpot, stay: Step[], status?: string): Step[] | null {
    const there = this.routeTo(a, pick.d, { x: pick.spot.x, y: pick.spot.y, spot: pick.spot }, status);
    if (!there) {
      return null;
    }
    return pick.d === this ? [...there, ...stay] : [...there, ...stay, defer((x) => pick.d.travel.toFloor(x, this))];
  }

  private chooseIdle(a: Agent): Task | null {
    for (const o of this.idleChoices(a).slice(0, 4)) {
      const t = o.make();
      if (t) {
        return t;
      }
    }
    return null;
  }

  /** What a free agent could do now, best first (the rule brain tries the top few; AI staff pick from the top 3). */
  idleChoices(a: Agent): Choice[] {
    const options: Choice[] = [];
    const style = this.lunchStyle(a);
    const lunch = this.lunchTime() && a.lunchDay !== this.day && style !== 'skip';
    for (const def of ACTIVITIES) {
      if (def.id === 'wash' || (def.id === 'park' && !this.daylight())) {
        continue;
      }
      let u = def.base ?? 0;
      for (const id of Object.keys(def.gains) as NeedId[]) {
        u += def.gains[id]! * urgency(a.needs[id]);
      }
      u *= def.appeal ? def.appeal(a) : 1;
      if (def.id === 'eat') {
        u *= lunch ? 1.8 : 0.3;
      }
      if (def.id === 'park') {
        u *= outdoorAppeal();
      }
      if ((def.id === 'snack' || def.id === 'eat') && pizzaTime(this.hour)) {
        u = u * 2 + 0.3;
      }
      const crowd = this.agents.filter((b) => b !== a && b.task?.activity === def.id).length;
      u *= (this.recency(a, def.id) * (0.8 + this.rand() * 0.4)) / (1 + crowd * 0.6);
      if (u < 0.03) {
        continue;
      }
      if (def.id === 'eat' && lunch && style !== 'kitchen') {
        options.push({ label: style === 'desk' ? 'lunch at your desk' : 'lunch in the canteen', u, make: () => (style === 'desk' ? this.deskLunch(a) : this.canteenLunch(a)) ?? this.kitchenLunch(a, def) });
        continue;
      }
      const pick = def.id === 'eat' && lunch ? this.spotsAnywhere(a, def.spots).find((p) => p.d === this) : this.findSpot(a, def);
      if (!pick) {
        continue;
      }
      u -= (def.outdoor === 'only' ? this.distance(a, pick) - (pick.d === this ? 30 : 0) : this.distance(a, pick)) * 0.003;
      options.push({ label: def.id === 'eat' && !lunch ? 'a bite to eat' : CHOICE_LABEL[def.id] ?? def.id, u, make: () => this.activityTask(a, def, pick) });
    }
    if (this.deskFor(a)) {
      const u = (0.04 + a.traits.diligence * 0.12) * this.recency(a, 'desk') * (0.8 + this.rand() * 0.4);
      options.push({ label: 'back to your desk', u, make: () => this.deskTask(a) });
    }
    const partner = this.plannedPartner(a) ?? this.chatPartner(a);
    if (partner) {
      const u = urgency(a.needs.social) * (0.3 + a.traits.sociability) * 1.1 * this.recency(a, 'chat');
      options.push({ label: aiOn() ? `chat with ${partner.name} about ${topicOf(partner)}` : `chat with ${partner.name}`, u: aiOn() ? Math.max(u, 0.2) : u, make: () => this.seekChat(a, partner) });
    }
    options.push({ label: 'stretch your legs', u: (0.05 + (1 - a.traits.diligence) * 0.04) * this.recency(a, 'wander'), make: () => this.wanderTask(a) });
    return favourPlan(a, options).sort((p, q) => q.u - p.u);
  }

  /**
   * How someone does lunch today (stable per person and day): most go down to the canteen, some eat on their own
   * floor (the kitchenette), diligent ones at their desk, and a few skip it.
   */
  lunchStyle(a: Agent): LunchStyle {
    const r = seeded(hash(`${a.slot}|${this.day}`))();
    const d = a.traits.diligence;
    if (r < 0.04 + d * 0.08) {
      return 'skip';
    }
    if (r < 0.1 + d * 0.16) {
      return 'desk';
    }
    if (r < 0.2 + d * 0.16 + (1 - a.traits.sociability) * 0.1) {
      return 'kitchen';
    }
    return 'canteen';
  }

  /** Down to the canteen, asking a few free colleagues along (so the line fills up like a real lunch rush). */
  private canteenLunch(a: Agent): Task | null {
    const task = canteenLunch(this, a, (x) => this.ateLunch(x));
    if (!task || this.time < this.lunchInvites) {
      return task;
    }
    this.lunchInvites = this.time + 20;
    const guests = this.staff.agents
      .filter((b) => b !== a && b.floor.idleForGroup(b) && b.lunchDay !== this.day && b.floor.lunchStyle(b) === 'canteen' && (b.needs.hunger < 0.8 || affinity(a, b) >= FRIEND))
      .sort((p, q) => affinity(a, q) - affinity(a, p))
      .slice(0, 3);
    if (guests.length) {
      a.say('lunch?', 2);
    }
    for (const g of guests) {
      const d = g.floor;
      d.interrupt(g);
      g.task = canteenLunch(d, g, (x) => d.ateLunch(x));
      g.sayLater(pickFrom(['yes!', 'starving', 'sure!', 'yum'], this.rand), 0.7, 1.8);
    }
    return task;
  }

  private ateLunch(a: Agent): void {
    a.lastDone.set('eat', this.time);
    a.lunchDay = this.day;
  }

  /** Lunch on this floor (the kitchenette or any eating spot here), the canteen's fallback. */
  private kitchenLunch(a: Agent, def: ActivityDef): Task | null {
    const pick = this.spotsAnywhere(a, def.spots).find((p) => p.d === this);
    return pick ? this.activityTask(a, def, pick) : null;
  }

  /** Something from the fridge, eaten at the desk. */
  private deskLunch(a: Agent): Task | null {
    const desk = this.deskFor(a);
    const fridge = desk && this.spotsAnywhere(a, ['snack']).find((p) => p.d === this);
    const route = fridge && this.travel.route(a, { x: fridge.spot.x, y: fridge.spot.y, spot: fridge.spot }, 'Grabbing lunch');
    if (!desk || !fridge || !route) {
      return null;
    }
    return this.task('lunch', 'Lunch at the desk', 'eat', [
      ...route,
      pause(2.5, 'Grabbing lunch'),
      walkTo(this, { x: desk.x, y: desk.y, spot: desk }, 'Lunch at the desk'),
      hangout({ seconds: 25 + this.rand() * 15, act: 'eat', gains: { hunger: 1, comfort: 0.2 } }),
      call((x) => this.ateLunch(x)),
    ]);
  }

  private activityTask(a: Agent, def: ActivityDef, pick: FloorSpot): Task | null {
    const { spot } = pick;
    const route = this.routeTo(a, pick.d, { x: spot.x, y: spot.y, spot });
    if (!route) {
      return null;
    }
    const busy = a.info.busy;
    const seconds = def.seconds[0] + this.rand() * (def.seconds[1] - def.seconds[0]);
    const steps: Step[] = [...route, hangout({ seconds, act: def.act, gains: def.gains, chatty: def.id !== 'toilet' && def.id !== 'wash', extend: busy ? 6 : 30 })];
    if (def.mug) {
      steps.push(call((x) => (x.mug = 40 + this.rand() * 30)));
    }
    if (def.linger && !busy) {
      steps.push(...pick.d.linger(spot, def.linger));
    }
    steps.push(
      call((x) => {
        x.lastDone.set(def.id, this.time);
        if (def.id === 'eat') {
          x.lunchDay = this.day;
        }
        if (def.then) {
          x.chain = def.then;
        }
      }),
    );
    if (def.id === 'eat' && this.lunchTime() && !busy) {
      this.inviteToLunch(a, pick);
    }
    const pizza = (def.id === 'snack' || def.id === 'eat') && pizzaTime(this.hour);
    const label = pizza ? 'Pizza!' : def.id === 'eat' ? () => (this.lunchTime() ? 'Having lunch' : 'Having a bite') : def.label;
    return this.task(def.kind, label, def.id, steps);
  }

  /** Steps back from a coffee machine or cooler and hangs around for a bit (where coffee-point chats happen). */
  private linger(spot: SpotRef, [lo, hi]: [number, number]): Step[] {
    let walk: Step | null = null;
    return [
      {
        begin: (x) => {
          const tile = this.freeTilesNear(x, spot.x, spot.y, 2)[0];
          if (!tile || this.passage(tile[0], tile[1])) {
            return;
          }
          walk = walkTo(this, { x: tile[0], y: tile[1] });
          if (walk.begin!(x) === false) {
            walk = null;
            return;
          }
          this.hold(x, `t:${tile[0]},${tile[1]}`);
        },
        tick: (x, dt) => !walk || walk.tick(x, dt),
        end: (x) => walk?.end?.(x),
      },
      hangout({ seconds: lo + this.rand() * (hi - lo), chatty: true, extend: 30, each: (x) => this.faceNearest(x) }),
    ];
  }

  private faceNearest(a: Agent): void {
    if (a.conv || a.seated) {
      return;
    }
    const near = this.visibleOthers(a).find((b) => a.tilesTo(b) < 2.2);
    if (near) {
      a.face(near.x, near.y);
    }
  }

  private deskTask(a: Agent): Task | null {
    const desk = this.deskFor(a);
    const route = desk && this.travel.route(a, { x: desk.x, y: desk.y, spot: desk });
    if (!desk || !route) {
      return null;
    }
    const act: Act = this.rand() < 0.5 ? 'type' : 'idle';
    return this.task('idle', 'At the desk', 'desk', [
      ...route,
      hangout({ seconds: 15 + this.rand() * 25, act, gains: { comfort: 0.2 } }),
      call((x) => x.lastDone.set('desk', this.time)),
    ]);
  }

  private wanderTask(a: Agent): Task | null {
    const out = this.office.isOutdoor(a.tx, a.ty);
    const room = this.nav.roomOf(a.tx, a.ty);
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(this.rand() * this.office.w);
      const y = Math.floor(this.rand() * this.office.h);
      if (!this.nav.open(x, y) || this.office.isOutdoor(x, y) !== out || (i < 10 && this.nav.roomOf(x, y) === room)) {
        continue;
      }
      if (this.passage(x, y) || this.office.spots.some((s) => s.x === x && s.y === y) || !this.isFree(`t:${x},${y}`, a) || !this.canEnter(a, x, y)) {
        continue;
      }
      if (!this.nav.path(a.tx, a.ty, x, y)) {
        continue;
      }
      return this.task('idle', 'Stretching legs', 'wander', [
        walkTo(this, { x, y }),
        call((b) => this.hold(b, `t:${x},${y}`)),
        hangout({ seconds: 3 + this.rand() * 5, chatty: true, each: (b) => this.faceNearest(b) }),
        call((b) => b.lastDone.set('wander', this.time)),
      ]);
    }
    return null;
  }

  // ---------------------------------------------------------------- social

  private chatAvailable(a: Agent): boolean {
    if (a.hidden || a.locked || a.conv || a.leaving || a.info.waiting || !a.arrived || this.time < a.chatReady || !a.task) {
      return false;
    }
    const step = a.task.steps[0];
    return !!step?.chatty || (a.task.kind === 'idle' && a.moving && !a.info.busy);
  }

  /** The colleague the agent's mind plans to talk to, when they're around and free. */
  private plannedPartner(a: Agent): Agent | undefined {
    const name = plannedChat(a);
    return name ? this.agents.find((b) => b !== a && b.name === name && this.chatAvailable(b) && !b.info.busy && !this.zoneDiffers(a, b.tx, b.ty)) : undefined;
  }

  private chatPartner(a: Agent): Agent | undefined {
    if (this.time < a.chatReady || a.traits.sociability < 0.2) {
      return undefined;
    }
    return this.agents
      .filter((b) => b !== a && this.chatAvailable(b) && !b.info.busy && !this.zoneDiffers(a, b.tx, b.ty) && a.tilesTo(b) < 14 + affinity(a, b) * 10)
      .sort((p, q) => a.tilesTo(p) - affinity(a, p) * 12 - (a.tilesTo(q) - affinity(a, q) * 12))[0];
  }

  /** Walks over to someone who's hanging out; the conversation starts when close. */
  private seekChat(a: Agent, b: Agent): Task | null {
    const tile = this.freeTilesNear(a, b.tx, b.ty, 1)[0];
    if (!tile || !this.nav.path(a.tx, a.ty, tile[0], tile[1])) {
      return null;
    }
    return this.task('chat', `Chatting with ${b.name}`, 'chat', [
      walkTo(this, { x: tile[0], y: tile[1] }),
      call((x) => {
        this.hold(x, `t:${tile[0]},${tile[1]}`);
        x.face(b.x, b.y);
        x.lastDone.set('chat', this.time);
      }),
      hangout({ seconds: 4, chatty: true, extend: 40 }),
    ]);
  }

  private greetings(): void {
    const walkers = this.agents.filter((a) => a.moving && !a.hidden && a.alpha >= 1 && !a.conv && !a.locked);
    for (const a of walkers) {
      for (const b of this.agents) {
        if (b === a || b.hidden || b.alpha < 1 || b.conv || a.tilesTo(b) > 1.7) {
          continue;
        }
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        const last = a.greeted.get(key) ?? -Infinity;
        if (this.time - last < (aiOn() ? 300 : 120)) {
          continue;
        }
        a.greeted.set(key, this.time);
        b.greeted.set(key, this.time);
        const [g, o] = a.traits.sociability >= b.traits.sociability ? [a, b] : [b, a];
        if (this.rand() > 0.35 + g.traits.sociability * 0.6 || g.bubble) {
          continue;
        }
        if (aiOn()) {
          // minds open with something about what the other is doing or just said (or nothing at all)
          opener(g, o);
          continue;
        }
        g.face(o.x, o.y);
        if (g.traits.sociability > 0.5) {
          g.waveT = 0.9;
          g.say(pickFrom(greetings(this.hour), this.rand), 1.8);
        } else {
          g.say(pickFrom(SHY_GREETINGS, this.rand), 1.6);
        }
        if (o.bubble || this.rand() > 0.3 + o.traits.sociability * 0.7) {
          continue;
        }
        if (o.traits.sociability > 0.55) {
          if (!o.seated && !o.task?.steps[0]?.locked) {
            o.face(g.x, g.y);
          }
          o.sayLater(pickFrom(greetings(this.hour), this.rand), 0.5, 1.6);
        } else {
          o.sayLater(pickFrom(SHY_GREETINGS, this.rand), 0.6, 1.4);
        }
      }
    }
  }

  /** AI staff: now and then someone at a desk says something to a colleague sitting nearby (about every 20 s per floor). */
  private deskBanter(): void {
    if (!aiOn() || this.rand() > 0.5 / BANTER_EVERY) {
      return;
    }
    const seated = this.agents.filter((a) => a.seated && !a.hidden && !a.conv && !a.bubble && !a.info.waiting && !a.isSub);
    const g = seated[Math.floor(this.rand() * seated.length)];
    const o = g && seated.filter((b) => b !== g && g.tilesTo(b) <= 3).sort((p, q) => g.tilesTo(p) - g.tilesTo(q))[0];
    if (!o) {
      return;
    }
    const key = g.id < o.id ? `${g.id}|${o.id}` : `${o.id}|${g.id}`;
    if (this.time - (g.greeted.get(key) ?? -Infinity) < BANTER_PAIR_GAP) {
      return;
    }
    g.greeted.set(key, this.time);
    o.greeted.set(key, this.time);
    opener(g, o);
  }

  private startConversations(): void {
    const avail = this.agents.filter((a) => this.chatAvailable(a));
    const taken = new Set<Agent>();
    for (let i = 0; i < avail.length; i++) {
      const a = avail[i];
      if (taken.has(a)) {
        continue;
      }
      for (let j = i + 1; j < avail.length; j++) {
        const b = avail[j];
        if (taken.has(b) || a.tilesTo(b) > 2.3 || this.nav.roomOf(a.tx, a.ty) !== this.nav.roomOf(b.tx, b.ty)) {
          continue;
        }
        if ([a, b].some((m) => !m.task?.steps[0]?.chatty && this.passage(m.tx, m.ty))) {
          continue;
        }
        const seeking = a.task?.activity === 'chat' || b.task?.activity === 'chat';
        const p = (seeking ? 0.7 : 0.05 * (a.traits.sociability + b.traits.sociability) * (0.5 + urgency(a.needs.social) + urgency(b.needs.social))) * (aiOn() ? 2.5 : 1);
        if (this.rand() > p) {
          continue;
        }
        const members = [a, b];
        const third = avail.find((c) => !members.includes(c) && !taken.has(c) && Math.min(a.tilesTo(c), b.tilesTo(c)) < 2.2 && this.rand() < 0.6);
        if (third) {
          members.push(third);
        }
        members.forEach((m) => taken.add(m));
        this.talk(members);
        break;
      }
    }
  }

  /** Starts a conversation among people standing or sitting together (optionally from lines already said). */
  talk(members: Agent[], said: { who: Agent; text: string }[] = []): void {
    const seated = members.every((m) => m.seated);
    const kind: ConvKind = seated ? (members.some((m) => m.task?.activity === 'eat') ? 'lunch' : 'seated') : 'chat';
    const conv = new Conversation(kind, members, this.time + 4, this.rand);
    conv.seed(said);
    this.convs.push(conv);
    for (const m of members) {
      m.conv = conv;
      m.chatReady = this.time + 40 + this.rand() * 60;
      const step = m.task?.steps[0];
      if (step?.chatty) {
        conv.arrive(m);
        continue;
      }
      this.interrupt(m);
      m.conv = conv;
      m.task = this.task('chat', 'Chatting', 'chat', [
        {
          tick: (x, dt) => x.walk(dt, () => true),
        },
        hangout({ seconds: 2, chatty: true, extend: 45 }),
      ]);
    }
  }

  idleForGroup(a: Agent): boolean {
    return (
      a.arrived && !a.hidden && !a.locked && !a.conv && !a.leaving && !a.npc && !a.info.busy && !a.info.waiting &&
      (!a.task || IDLE_KINDS.includes(a.task.kind)) && a.task?.kind !== 'lunch' && !this.office.isOutdoor(a.tx, a.ty)
    );
  }

  /** When several people are free at once, someone calls a meeting: they gather around a table and talk. */
  private maybeMeeting(): void {
    if (this.time < this.meetingAt) {
      return;
    }
    this.meetingAt = this.time + 6;
    const idle = this.agents.filter((a) => this.idleForGroup(a) && !this.staff.meetings.inMeeting(a));
    if (idle.length < 3 || this.rand() > 0.35) {
      return;
    }
    const n = 3 + Math.floor(this.rand() * 3);
    const people = idle
      .map((a) => ({ a, s: urgency(a.needs.social) + a.traits.sociability + this.rand() * 0.6 }))
      .sort((p, q) => q.s - p.s)
      .slice(0, n)
      .map((x) => x.a);
    if (this.staff.meetings.social(this, people)) {
      this.meetingAt = this.time + 150 + this.rand() * 150;
    }
  }

  /** Lunch is better together: invite a couple of hungry colleagues to nearby seats. */
  private inviteToLunch(host: Agent, seat: FloorSpot): void {
    if (this.time < this.lunchInvites) {
      return;
    }
    this.lunchInvites = this.time + 20;
    const def = ACTIVITY_BY_ID.get('eat')!;
    const guests = this.agents
      .filter((b) => b !== host && this.idleForGroup(b) && b.lunchDay !== this.day && (b.needs.hunger < 0.75 || affinity(host, b) >= FRIEND) && host.tilesTo(b) < 20)
      .sort((p, q) => affinity(host, q) - affinity(host, p))
      .slice(0, 2);
    if (!guests.length) {
      return;
    }
    host.say('lunch?', 2);
    const { d, spot: hostSeat } = seat;
    for (const g of guests) {
      const pick = this.spotsAnywhere(g, def.spots, { near: [hostSeat.x, hostSeat.y], outdoor: def.outdoor }).find((p) => p.d === d && p.spot.key !== hostSeat.key);
      if (!pick) {
        continue;
      }
      d.reserved.set(pick.spot.key, g);
      const task = this.activityTask(g, def, pick);
      if (!task) {
        d.reserved.delete(pick.spot.key);
        continue;
      }
      this.interrupt(g);
      g.task = task;
      bond(host, g, 0.03);
      g.sayLater(pickFrom(['yes!', 'starving', 'sure!', 'yum'], this.rand), 0.7, 1.8);
    }
  }

  // ---------------------------------------------------------------- layout edits

  private onLayoutChange(): void {
    this.nav.sync();
    const keys = new Set(this.office.spots.map((s) => s.key));
    const residents = this.staff.agents.filter((a) => a.homeFloor === this);
    for (const a of residents) {
      if (a.homeDesk && !keys.has(a.homeDesk)) {
        a.homeDesk = null;
      }
    }
    for (const project of [...this.projectRooms.keys()]) {
      const desk = residents.map((a) => (a.info.project === project && a.homeDesk ? this.spotByKey(a.homeDesk) : undefined)).find((s) => s);
      if (desk) {
        this.projectRooms.set(project, this.nav.roomOf(desk.x, desk.y));
      } else {
        this.projectRooms.delete(project);
      }
    }
    for (const [key] of this.reserved) {
      if (!key.startsWith('t:') && !keys.has(key)) {
        this.reserved.delete(key);
      }
    }
    const liftUids = new Set(this.office.spotsFor('elevator').map((s) => s.item.uid));
    for (const uid of [...this.lifts.keys()]) {
      if (!liftUids.has(uid)) {
        this.lifts.delete(uid);
      }
    }
    for (const a of this.agents) {
      if (a.hidden) {
        continue;
      }
      const seat = [...a.holds].map((k) => this.spotByKey(k)).find((s) => s && s.pose === 'sit');
      if (a.seated && !(seat && seat.x === a.tx && seat.y === a.ty)) {
        a.seated = false;
        const [x, y] = this.office.nearestWalkable(a.tx, a.ty);
        a.placeAt(x, y);
        if (!a.locked) {
          this.interrupt(a);
        }
        continue;
      }
      if (!a.seated && !this.nav.walkable(a.tx, a.ty)) {
        const [x, y] = this.office.nearestWalkable(a.tx, a.ty);
        a.placeAt(x, y);
      }
      if (!a.locked && (a.path.length || a.task?.steps.some((s) => !s.begun))) {
        this.interrupt(a);
      }
    }
  }

  /** Small helper for the dev console: everyone's state. */
  debug(): string[] {
    return this.agents.map((a) => {
      const steps = a.task ? `${a.task.activity}:${a.task.steps.map((s) => s.status ?? '·').join('>')}` : '-';
      return `${a.name} [${a.claude ? 'claude' : 'demo'}] ${a.statusText} @${a.tx},${a.ty} ${steps} a=${a.alpha.toFixed(1)}`;
    });
  }
}
