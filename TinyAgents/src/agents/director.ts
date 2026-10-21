import { Activity } from '../art/types';
import { hash, seeded } from '../render/pixel';
import { CarView } from '../render/renderer';
import { DIR_STEP, Office, SpotRef } from '../world/office';
import { Act, Agent, AgentInfo, Step, Task, TaskKind } from './agent';
import { Car } from './car';
import { DemoStaff, demoIdentity } from './demo';
import { Lift } from './lift';
import { NEIGHBORS, Nav, Tile } from './nav';
import { NeedId, Needs, criticalNeed, decay, restore, urgency } from './needs';
import { personFor } from './people';
import { GREETINGS, PROFESSION_BY_ID, SHY_GREETINGS, pickFrom, professionFor, toolPhrase } from './professions';
import { ConvKind, Conversation } from './social';
import { Target, call, hangout, walkTo } from './steps';
import { Travel } from './travel';

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

/** What a busy agent does about a pressing need, best first. */
const MICRO_BREAK: Partial<Record<NeedId, string[]>> = {
  bladder: ['toilet'],
  thirst: ['water', 'coffee'],
  energy: ['coffee', 'water'],
  hunger: ['snack', 'eat'],
};

const IDLE_KINDS: TaskKind[] = ['idle', 'fun', 'chat', 'outside', 'lunch'];

function forcedHour(): number | null {
  const t = new URLSearchParams(location.search).get('time');
  return t !== null && !Number.isNaN(parseFloat(t)) ? parseFloat(t) : null;
}

/**
 * Runs the office: who is in (Claude sessions from the bridge plus optional demo staff), how they arrive and
 * leave, what they do (utility AI over needs and personality, with Claude's busy / waiting state taking
 * priority), and their social life (greetings, conversations, meetings, lunch).
 */
export class Director {
  agents: Agent[] = [];
  readonly nav: Nav;
  readonly travel: Travel;
  time = 0;
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
  private claudeInfos: AgentInfo[] = [];
  /** The first roster from the bridge / the demo after the page opened: those people are already at work. */
  private firstClaude = true;
  private firstDemo = true;
  private demo = new DemoStaff(Math.random);
  private demoOn = false;
  private lastSpawn = -10;
  private socialClock = 0;
  private meetingAt = 40;
  private lunchInvites = 0;

  constructor(readonly office: Office) {
    this.nav = new Nav(office);
    this.travel = new Travel(this);
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

  get demoEnabled(): boolean {
    return this.demoOn;
  }

  /** Built-in demo staff on / off. Turning it off sends them home (they leave properly). */
  setDemo(on: boolean): void {
    if (on === this.demoOn) {
      return;
    }
    this.demoOn = on;
    if (on) {
      this.demo.start(this.time < 2);
    } else {
      this.demo.stop();
    }
    this.reconcile([]);
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

  /** The Claude sessions reported by the bridge. */
  sync(infos: AgentInfo[]): void {
    this.claudeInfos = infos;
    this.reconcile(this.demoOn ? this.demo.update(0) : []);
    this.firstClaude = false;
  }

  get hour(): number {
    return this.clock();
  }

  // ---------------------------------------------------------------- roster

  private reconcile(demoInfos: AgentInfo[]): void {
    const wanted = new Map<string, AgentInfo>();
    for (const info of [...this.claudeInfos, ...demoInfos]) {
      wanted.set(info.id, info);
    }
    for (const a of this.agents) {
      const info = wanted.get(a.id);
      wanted.delete(a.id);
      if (!info) {
        if (!a.leaving) {
          this.dismiss(a);
        }
        continue;
      }
      if (!a.leaving) {
        this.onInfo(a, a.info, info);
        a.info = info;
      }
    }
    for (const info of wanted.values()) {
      this.spawn(info, this.alreadyAtWork(info));
    }
    if (demoInfos.length) {
      this.firstDemo = false;
    }
  }

  /** Reactions to Claude state changes that aren't just "go work" / "take a break". */
  private onInfo(a: Agent, was: AgentInfo, now: AgentInfo): void {
    if (!a.claude || !a.arrived) {
      return;
    }
    if (now.state === 'error' && was.state !== 'error') {
      const lines: Record<string, string> = {
        rate_limit: 'rate limited... coffee?',
        overloaded: 'servers busy...',
        authentication_failed: 'locked out?!',
        billing_error: 'uh oh, billing',
      };
      a.say(lines[now.error ?? ''] ?? 'hmm, that failed', 3);
      if (now.error === 'rate_limit' || now.error === 'overloaded') {
        a.chain = 'coffee';
      }
    } else if (now.state === 'compacting' && was.state !== 'compacting') {
      a.say('tidying my notes', 2.5);
    } else if (now.state === 'idle' && (was.state === 'thinking' || was.state === 'tool')) {
      a.say(this.rand() < 0.5 ? 'done!' : 'all yours', 2);
    } else if (now.tool && (now.tool === 'Agent' || now.tool === 'Task') && was.tool !== now.tool) {
      a.say('calling in help', 2);
    }
  }

  /**
   * People who were already working before the page opened skip the trip in: a Claude session that has been
   * running for a while when the bridge first reports it, and demo staff on the first roster.
   */
  private alreadyAtWork(info: AgentInfo): boolean {
    if (demoIdentity(info.id)) {
      return this.firstDemo;
    }
    return this.firstClaude && (info.age ?? 0) > 20;
  }

  private spawn(info: AgentInfo, present = false): void {
    const ident = demoIdentity(info.id);
    const role = (ident && PROFESSION_BY_ID.get(ident.profession)) || professionFor(info.type);
    let slot: string;
    if (ident) {
      slot = `demo#${ident.index}`;
    } else {
      const used = new Set(this.agents.map((a) => a.slot));
      let n = 0;
      while (used.has(`${role.id}#${n}`)) {
        n++;
      }
      slot = `${role.id}#${n}`;
    }
    const a = new Agent(info, role, slot, personFor(slot, role, ident?.name), !!ident, seeded(hash(slot)));
    if (present) {
      a.task = {
        kind: 'arrive',
        label: 'At work',
        activity: 'arrive',
        started: false,
        steps: [{ locked: true, tick: (x) => (this.placePresent(x), true) }],
      };
      this.agents.push(a);
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
  }

  /** At the desk when Claude is working or waiting on you, otherwise somewhere in the office; the car is already parked. */
  private placePresent(a: Agent): void {
    if (!a.isSub && this.rand() < a.traits.drives) {
      this.travel.parkNow(a);
    }
    const desk = a.info.busy || a.info.waiting ? this.deskFor(a) : undefined;
    const [tx, ty] = desk ? [desk.x, desk.y] : this.office.randomIndoorTile(this.rand);
    a.placeAt(tx, ty);
    a.hidden = false;
    a.alpha = 1;
    a.arrived = true;
  }

  private dismiss(a: Agent): void {
    a.leaving = true;
    if (a.homeDesk) {
      this.release(a.homeDesk, a);
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

  private release(key: string, a: Agent): void {
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
      if (b === a || b.hidden || b.alpha <= 0) {
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
    const still = new Set<number>();
    for (const b of this.visibleOthers(a)) {
      if (!b.moving) {
        still.add(b.ty * this.office.w + b.tx);
      }
    }
    return (x, y) => (still.has(y * this.office.w + x) && !(target && x === target.x && y === target.y) ? 25 : 0);
  }

  private occupant(a: Agent, x: number, y: number): Agent | undefined {
    return this.visibleOthers(a).find((b) => (b.tx === x && b.ty === y) || (b.seg && b.seg[0] === x && b.seg[1] === y));
  }

  /** Blocked walkers detour, step aside for someone coming the other way, and as a last resort squeeze past. */
  resolveBlock(a: Agent): void {
    const next = a.path[0];
    const goal = a.goal;
    if (!next || !goal) {
      return;
    }
    const b = this.occupant(a, next[0], next[1]);
    if (a.blockedFor > 0.45 && !a.detoured) {
      a.detoured = true;
      const base = this.crowdPenalty(a);
      const p = this.nav.path(a.tx, a.ty, goal[0], goal[1], (x, y) => base(x, y) + (x === next[0] && y === next[1] ? 40 : 0));
      if (p && p.length && (p[0][0] !== next[0] || p[0][1] !== next[1])) {
        a.path = p;
        a.blockedFor = 0.01;
        return;
      }
    }
    const headOn = b && b.path[0] && b.path[0][0] === a.tx && b.path[0][1] === a.ty;
    if (a.blockedFor > 1.1 && b && headOn && a.id < b.id) {
      const side = NEIGHBORS.map(([dx, dy]): Tile => [a.tx + dx, a.ty + dy]).find(
        ([x, y]) => this.nav.open(x, y) && !(x === next[0] && y === next[1]) && this.canEnter(a, x, y) && !b.path.slice(0, 2).some(([px, py]) => px === x && py === y),
      );
      if (side) {
        a.path = [side];
        a.blockedFor = 0;
        a.pauseT = 0;
        return;
      }
    }
    if (a.blockedFor > 2.6) {
      a.ghostT = 1.4;
    }
  }

  /** The tile to step onto when getting up from a seat. */
  exitTile(a: Agent): Tile {
    const back = a.seatExit;
    if (back && this.nav.open(back[0], back[1])) {
      return back;
    }
    const n = NEIGHBORS.map(([dx, dy]): Tile => [a.tx + dx, a.ty + dy]).find(([x, y]) => this.nav.open(x, y));
    return n ?? this.office.nearestWalkable(a.tx, a.ty);
  }

  /** Free plain floor tiles near (x, y), nearest first. */
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
        out.push([[tx, ty], d + this.rand() * 0.5]);
      }
    }
    return out.sort((p, q) => p[1] - q[1]).map(([t]) => t);
  }

  deskTile(a: Agent): Tile | undefined {
    const own = this.spotByKey(a.homeDesk);
    if (own) {
      return [own.x, own.y];
    }
    const parent = a.info.parent ? this.agents.find((o) => o.id === a.info.parent) : undefined;
    const ps = parent && this.spotByKey(parent.homeDesk);
    return ps ? [ps.x, ps.y] : undefined;
  }

  private zoneDiffers(a: Agent, x: number, y: number): boolean {
    return this.office.isOutdoor(a.tx, a.ty) !== this.office.isOutdoor(x, y);
  }

  // ---------------------------------------------------------------- clock

  private lunchTime(): boolean {
    const h = this.hour;
    return h >= 12 && h < 13.5;
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
    this.time += dt;
    this.nav.sync();
    if (this.demoOn) {
      this.reconcile(this.demo.update(dt));
    }
    for (const lift of this.lifts.values()) {
      lift.update(dt, this.time);
    }
    this.updateStalls(dt);
    this.updateCars(dt);
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
      this.startConversations();
      this.maybeMeeting();
    }
    for (const a of this.agents.filter((x) => x.gone)) {
      this.cleanupGone(a);
    }
    this.agents = this.agents.filter((a) => !a.gone);
  }

  private cleanupGone(a: Agent): void {
    this.interrupt(a);
    for (const key of [...a.holds]) {
      this.release(key, a);
    }
    if (a.homeDesk) {
      this.release(a.homeDesk, a);
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
    for (let guard = 0; guard < 6 && a.task === task; guard++) {
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
      a.reactT = 0;
      this.interrupt(a);
    }
  }

  private decide(a: Agent): void {
    let task: Task | null = null;
    if (a.leaving) {
      task = this.task('leave', 'Heading home', 'leave', this.travel.departure(a));
    } else if (!a.arrived) {
      task = this.task('arrive', 'Arriving', 'arrive', this.travel.arrival(a));
    } else if (a.info.waiting) {
      task = this.waitTask(a);
    } else if (a.info.busy) {
      task = this.microBreak(a) ?? this.workTask(a);
    } else if (a.chain) {
      const def = ACTIVITY_BY_ID.get(a.chain);
      a.chain = null;
      const spot = def && this.findSpot(a, def);
      task = def && spot ? this.activityTask(a, def, spot) : null;
    }
    if (!task && !a.info.busy && !a.info.waiting && !a.leaving) {
      task = this.chooseIdle(a);
    }
    a.task = task ?? this.task('idle', 'Looking around', 'pause', [hangout({ seconds: 1.5 + this.rand() * 2, chatty: true })]);
  }

  private task(kind: TaskKind, label: Task['label'], activity: string, steps: Step[], cleanup?: () => void): Task {
    return { kind, label, activity, steps, started: false, cleanup };
  }

  // ---------------------------------------------------------------- work

  /** The agent's desk: keeps one for the whole visit. Subagents sit near their parent (same room first). */
  private deskFor(a: Agent): SpotRef | undefined {
    const own = this.spotByKey(a.homeDesk);
    if (own) {
      return own;
    }
    a.homeDesk = null;
    const anchor = this.deskTile(a) ?? [a.tx, a.ty];
    const room = this.nav.roomOf(anchor[0], anchor[1]);
    const kinds: [Activity, number][] = a.isSub ? [['work', 0], ['meeting', 6], ['social', 10]] : [['work', 0], ['meeting', 60], ['social', 80]];
    const options = this.office.spots
      .map((s) => ({ s, extra: kinds.find(([k]) => k === s.activity)?.[1] }))
      .filter(({ s, extra }) => extra !== undefined && this.isFree(s.key, a) && !this.office.isOutdoor(s.x, s.y))
      .map(({ s, extra }) => ({ s, d: Math.abs(s.x - anchor[0]) + Math.abs(s.y - anchor[1]) + extra! + (a.isSub && this.nav.roomOf(s.x, s.y) !== room ? 10 : 0) }))
      .sort((p, q) => p.d - q.d);
    for (const { s } of options.slice(0, 5)) {
      if (this.travel.reachable(a, s.x, s.y)) {
        a.homeDesk = s.key;
        this.reserved.set(s.key, a);
        return s;
      }
    }
    return undefined;
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
        if ((quip -= dt) <= 0) {
          quip = 25 + this.rand() * 40;
          if (!x.bubble && this.rand() < 0.5) {
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
      const spot = this.findSpot(a, def);
      const task = spot && this.activityTask(a, def, spot);
      if (task) {
        task.kind = 'need';
        return task;
      }
    }
    return null;
  }

  /** Waiting for the user's permission: at the desk, standing, waving and checking the phone. */
  private waitTask(a: Agent): Task {
    const desk = this.spotByKey(a.homeDesk);
    const steps: Step[] = [];
    if (desk) {
      const [fx, fy] = DIR_STEP[desk.facing];
      const spots = NEIGHBORS.map(([dx, dy]): Tile => [desk.x + dx, desk.y + dy]).filter(([x, y]) => !(x === desk.x + fx && y === desk.y + fy) && this.nav.open(x, y));
      const pick = (a.seated && a.tx === desk.x && a.ty === desk.y ? a.seatExit : null) ?? spots[0];
      if (pick) {
        steps.push(...(this.travel.route(a, { x: pick[0], y: pick[1], face: 'down' }, 'Waiting for you') ?? []));
      }
    }
    let t = 0;
    let nag = 0;
    steps.push({
      status: 'Waiting for you',
      begin: (x) => {
        x.dir = 'down';
        x.say('need you!', 4);
        nag = 7 + this.rand() * 3;
      },
      tick: (x, dt) => {
        t += dt;
        if (!x.seated) {
          x.dir = 'down';
        }
        x.act = t % 8 < 1.8 ? 'wave' : 'phone';
        if ((nag -= dt) <= 0) {
          nag = 6 + this.rand() * 4;
          x.say(this.rand() < 0.6 ? '?' : 'need you!', 2.5);
        }
        return !x.info.waiting || x.leaving;
      },
      end: (x) => {
        x.act = 'idle';
      },
    });
    return this.task('wait', 'Waiting for you', 'wait', steps);
  }

  // ---------------------------------------------------------------- free time

  private recency(a: Agent, id: string): number {
    const last = a.lastDone.get(id);
    return last !== undefined && this.time - last < 120 ? 0.25 : 1;
  }

  private findSpot(a: Agent, def: ActivityDef, near?: Tile): SpotRef | undefined {
    const [ax, ay] = near ?? [a.tx, a.ty];
    const options = this.office.spots
      .filter((s) => {
        if (!def.spots.includes(s.activity) || !this.isFree(s.key, a)) {
          return false;
        }
        const out = this.office.isOutdoor(s.x, s.y);
        return def.outdoor === 'only' ? out : def.outdoor === 'any' || !out;
      })
      .map((s) => ({
        s,
        d: Math.abs(s.x - ax) + Math.abs(s.y - ay) + (this.zoneDiffers(a, s.x, s.y) ? 30 : 0) + def.spots.indexOf(s.activity) * 8 + this.rand() * 3,
      }))
      .sort((p, q) => p.d - q.d);
    for (const { s } of options.slice(0, 4)) {
      if (this.travel.reachable(a, s.x, s.y)) {
        return s;
      }
    }
    return undefined;
  }

  private distance(a: Agent, x: number, y: number): number {
    return Math.abs(x - a.tx) + Math.abs(y - a.ty) + (this.zoneDiffers(a, x, y) ? 30 : 0);
  }

  private chooseIdle(a: Agent): Task | null {
    const options: { u: number; make: () => Task | null }[] = [];
    const lunch = this.lunchTime() && a.lunchDay !== this.day;
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
      const crowd = this.agents.filter((b) => b !== a && b.task?.activity === def.id).length;
      u *= (this.recency(a, def.id) * (0.8 + this.rand() * 0.4)) / (1 + crowd * 0.6);
      if (u < 0.03) {
        continue;
      }
      const spot = this.findSpot(a, def);
      if (!spot) {
        continue;
      }
      u -= (def.outdoor === 'only' ? Math.abs(spot.x - a.tx) + Math.abs(spot.y - a.ty) : this.distance(a, spot.x, spot.y)) * 0.003;
      options.push({ u, make: () => this.activityTask(a, def, spot) });
    }
    if (this.deskFor(a)) {
      const u = (0.04 + a.traits.diligence * 0.12) * this.recency(a, 'desk') * (0.8 + this.rand() * 0.4);
      options.push({ u, make: () => this.deskTask(a) });
    }
    const partner = this.chatPartner(a);
    if (partner) {
      const u = urgency(a.needs.social) * (0.3 + a.traits.sociability) * 1.1 * this.recency(a, 'chat');
      options.push({ u, make: () => this.seekChat(a, partner) });
    }
    options.push({ u: (0.05 + (1 - a.traits.diligence) * 0.04) * this.recency(a, 'wander'), make: () => this.wanderTask(a) });
    options.sort((p, q) => q.u - p.u);
    for (const o of options.slice(0, 4)) {
      const t = o.make();
      if (t) {
        return t;
      }
    }
    return null;
  }

  private activityTask(a: Agent, def: ActivityDef, spot: SpotRef): Task | null {
    const route = this.travel.route(a, { x: spot.x, y: spot.y, spot });
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
      steps.push(...this.linger(spot, def.linger));
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
      this.inviteToLunch(a, spot);
    }
    const label = def.id === 'eat' ? () => (this.lunchTime() ? 'Having lunch' : 'Having a bite') : def.label;
    return this.task(def.kind, label, def.id, steps);
  }

  /** Steps back from a coffee machine or cooler and hangs around for a bit (where coffee-point chats happen). */
  private linger(spot: SpotRef, [lo, hi]: [number, number]): Step[] {
    let walk: Step | null = null;
    return [
      {
        begin: (x) => {
          const tile = this.freeTilesNear(x, spot.x, spot.y, 2)[0];
          if (!tile) {
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
      if (this.office.spots.some((s) => s.x === x && s.y === y) || !this.isFree(`t:${x},${y}`, a) || !this.canEnter(a, x, y)) {
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

  private chatPartner(a: Agent): Agent | undefined {
    if (this.time < a.chatReady || a.traits.sociability < 0.2) {
      return undefined;
    }
    return this.agents
      .filter((b) => b !== a && this.chatAvailable(b) && !b.info.busy && !this.zoneDiffers(a, b.tx, b.ty) && a.tilesTo(b) < 14)
      .sort((p, q) => a.tilesTo(p) - a.tilesTo(q))[0];
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
        if (this.time - last < 120) {
          continue;
        }
        a.greeted.set(key, this.time);
        b.greeted.set(key, this.time);
        const [g, o] = a.traits.sociability >= b.traits.sociability ? [a, b] : [b, a];
        if (this.rand() > 0.35 + g.traits.sociability * 0.6 || g.bubble) {
          continue;
        }
        g.face(o.x, o.y);
        if (g.traits.sociability > 0.5) {
          g.waveT = 0.9;
          g.say(pickFrom(GREETINGS, this.rand), 1.8);
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
          o.sayLater(pickFrom(GREETINGS, this.rand), 0.5, 1.6);
        } else {
          o.sayLater(pickFrom(SHY_GREETINGS, this.rand), 0.6, 1.4);
        }
      }
    }
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
        const seeking = a.task?.activity === 'chat' || b.task?.activity === 'chat';
        const p = seeking ? 0.7 : 0.05 * (a.traits.sociability + b.traits.sociability) * (0.5 + urgency(a.needs.social) + urgency(b.needs.social));
        if (this.rand() > p) {
          continue;
        }
        const members = [a, b];
        const third = avail.find((c) => !members.includes(c) && !taken.has(c) && Math.min(a.tilesTo(c), b.tilesTo(c)) < 2.2 && this.rand() < 0.6);
        if (third) {
          members.push(third);
        }
        members.forEach((m) => taken.add(m));
        this.startConversation(members);
        break;
      }
    }
  }

  private startConversation(members: Agent[]): void {
    const seated = members.every((m) => m.seated);
    const kind: ConvKind = seated ? (members.some((m) => m.task?.activity === 'eat') ? 'lunch' : 'seated') : 'chat';
    const conv = new Conversation(kind, members, this.time + 4, this.rand);
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

  private idleForGroup(a: Agent): boolean {
    return (
      a.arrived && !a.hidden && !a.locked && !a.conv && !a.leaving && !a.info.busy && !a.info.waiting &&
      (!a.task || IDLE_KINDS.includes(a.task.kind)) && a.task?.kind !== 'lunch' && !this.office.isOutdoor(a.tx, a.ty)
    );
  }

  /** Free meeting seats grouped by the table they face. */
  private meetingTables(a: Agent): SpotRef[][] {
    const groups = new Map<number, SpotRef[]>();
    for (const s of this.office.spotsFor('meeting')) {
      if (!this.isFree(s.key, a)) {
        continue;
      }
      const [dx, dy] = DIR_STEP[s.facing];
      const table = this.office.itemAt(s.x + dx, s.y + dy, 'object');
      const id = table?.uid ?? -s.item.uid;
      groups.set(id, [...(groups.get(id) ?? []), s]);
    }
    return [...groups.values()];
  }

  /** When several people are free at once, someone calls a meeting: they gather around a table and talk. */
  private maybeMeeting(): void {
    if (this.time < this.meetingAt) {
      return;
    }
    this.meetingAt = this.time + 6;
    const idle = this.agents.filter((a) => this.idleForGroup(a));
    if (idle.length < 3 || this.rand() > 0.35) {
      return;
    }
    const tables = this.meetingTables(idle[0]).filter((t) => t.length >= 3).sort((p, q) => q.length - p.length);
    const seats = tables[0];
    if (!seats) {
      return;
    }
    const n = Math.min(seats.length, idle.length, 3 + Math.floor(this.rand() * 3));
    const people = idle
      .map((a) => ({ a, s: urgency(a.needs.social) + a.traits.sociability + this.rand() * 0.6 }))
      .sort((p, q) => q.s - p.s)
      .slice(0, n)
      .map((x) => x.a)
      .filter((a) => this.travel.reachable(a, seats[0].x, seats[0].y));
    if (people.length < 3) {
      return;
    }
    this.meetingAt = this.time + 150 + this.rand() * 150;
    const conv = new Conversation('meeting', people, this.time + 30, this.rand);
    this.convs.push(conv);
    people.forEach((a, i) => {
      const seat = seats[i];
      this.interrupt(a);
      a.conv = conv;
      const route = this.travel.route(a, { x: seat.x, y: seat.y, spot: seat }, 'Going to a meeting') ?? [];
      a.task = this.task('meeting', 'In a meeting', 'meeting', [
        ...route,
        hangout({ seconds: 40, act: 'idle', gains: { social: 0.6, energy: 0.1 }, until: (x) => x.conv === conv && !conv.done }),
      ]);
      if (i === 0) {
        a.say('meeting time!', 2.4);
      } else if (this.rand() < 0.6) {
        a.sayLater(pickFrom(['coming!', 'ok!', 'on my way', 'sure'], this.rand), 0.6 + this.rand(), 1.8);
      }
    });
  }

  /** Lunch is better together: invite a couple of hungry colleagues to nearby seats. */
  private inviteToLunch(host: Agent, seat: SpotRef): void {
    if (this.time < this.lunchInvites) {
      return;
    }
    this.lunchInvites = this.time + 20;
    const def = ACTIVITY_BY_ID.get('eat')!;
    const guests = this.agents.filter((b) => b !== host && this.idleForGroup(b) && b.lunchDay !== this.day && b.needs.hunger < 0.75 && host.tilesTo(b) < 20).slice(0, 2);
    if (!guests.length) {
      return;
    }
    host.say('lunch?', 2);
    for (const g of guests) {
      const spot = this.findSpot(g, def, [seat.x, seat.y]);
      if (!spot || spot.key === seat.key) {
        continue;
      }
      this.reserved.set(spot.key, g);
      const task = this.activityTask(g, def, spot);
      if (!task) {
        this.reserved.delete(spot.key);
        continue;
      }
      this.interrupt(g);
      g.task = task;
      g.sayLater(pickFrom(['yes!', 'starving', 'sure!', 'yum'], this.rand), 0.7, 1.8);
    }
  }

  // ---------------------------------------------------------------- layout edits

  private onLayoutChange(): void {
    this.nav.sync();
    const keys = new Set(this.office.spots.map((s) => s.key));
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
      if (a.homeDesk && !keys.has(a.homeDesk)) {
        a.homeDesk = null;
      }
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
