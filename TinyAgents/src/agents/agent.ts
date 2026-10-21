import { Dir, TILE, WALK_SPEED } from '../config';
import { CHAR_FOOT_X, CHAR_FOOT_Y, POSE_FRAMES, Pose, characterFrame } from '../render/characters';
import { Office } from '../world/office';
import { Needs, freshNeeds } from './needs';
import { Tile } from './nav';
import { Person } from './people';
import { Personality, Profession, personalityFor } from './professions';
import type { Conversation } from './social';

/** What the Claude agent behind a person is doing (see docs/CLAUDE_INTEGRATION.md). */
export type ClaudeState = 'starting' | 'thinking' | 'tool' | 'permission' | 'idle' | 'compacting' | 'error';

export interface AgentInfo {
  id: string;
  kind: 'main' | 'sub';
  type: string;
  project: string;
  /** derived from state: thinking, tool or compacting */
  busy: boolean;
  /** derived from state: permission */
  waiting: boolean;
  tool?: string;
  parent?: string;
  // ---- richer bridge fields (protocol 2); all optional so demo staff can omit them
  state?: ClaudeState;
  /** short summary of the current tool call: file name, search term, host… */
  detail?: string;
  /** session title, or the subagent's task description */
  title?: string;
  description?: string;
  model?: string;
  /** permission mode: default, plan, acceptEdits, auto… */
  mode?: string;
  /** seconds in the current state, and since the session started */
  stateFor?: number;
  age?: number;
  prompts?: number;
  toolCalls?: number;
  errors?: number;
  /** error kind when state is 'error' (rate_limit, overloaded…) */
  error?: string;
  /** background tasks still running after the turn ended */
  background?: number;
  subagents?: number;
  recent?: { ago: number; text: string }[];
}

/** One step of a task. Steps run in order; a task ends when its last step is done. */
export interface Step {
  /** Status text while this step runs (overrides the task label). */
  status?: string;
  /** Transit steps (in a car, inside the building, in the elevator) can't be interrupted. */
  locked?: boolean;
  /** Return false to abort the task (e.g. no path). */
  begin?(a: Agent): boolean | void;
  /** Return true when done. */
  tick(a: Agent, dt: number): boolean;
  /** Runs when the step ends, finished or dropped. */
  end?(a: Agent): void;
  /** Others may start a conversation with this agent during this step. */
  chatty?: boolean;
  /** set by the director once begin() ran */
  begun?: boolean;
}

export type TaskKind = 'arrive' | 'leave' | 'work' | 'wait' | 'need' | 'fun' | 'chat' | 'meeting' | 'lunch' | 'idle' | 'outside';

export interface Task {
  kind: TaskKind;
  label: string | (() => string);
  /** activity id, for variety and the panel */
  activity: string;
  steps: Step[];
  started: boolean;
  /** called once when the task ends or is dropped */
  cleanup?: () => void;
}

/** What the hands are doing while standing or seated. */
export type Act = 'idle' | 'type' | 'talk' | 'phone' | 'wave' | 'read' | 'drink' | 'eat';

const STRIDE = 5.4;

export class Agent {
  readonly id: string;
  info: AgentInfo;
  role: Profession;
  traits: Personality;
  person: Person;
  slot: string;
  readonly demo: boolean;
  needs: Needs;
  rand: () => number;

  x = 0;
  y = 0;
  tx = 0;
  ty = 0;
  dir: Dir = 'down';
  speed: number;
  alpha = 0;
  seated = false;
  /** not in the world (in a car, inside the ground floor, in the elevator) */
  hidden = true;
  path: Tile[] = [];
  /** tile currently being stepped into */
  seg: Tile | null = null;
  /** where the current walk ends */
  goal: Tile | null = null;
  /** the tile to step back onto when standing up from a seat */
  seatExit: Tile | null = null;
  moving = false;
  walkDist = 0;
  blockedFor = 0;
  /** seconds during which this agent may walk through others (deadlock breaker) */
  ghostT = 0;
  /** waits on a side tile before re-pathing */
  pauseT = 0;

  act: Act = 'idle';
  speakT = 0;
  waveT = 0;
  /** seconds of coffee left in the mug (0 = no mug) */
  mug = 0;
  bubble: { text: string; icon?: string; t: number } | null = null;
  pendingSay: { text: string; delay: number; seconds: number } | null = null;

  task: Task | null = null;
  conv: Conversation | null = null;
  homeDesk: string | null = null;
  /** reserved spot or standing tile keys */
  holds = new Set<string>();
  leaving = false;
  gone = false;
  arrived = false;
  /** time the agent may next start a conversation */
  chatReady = 0;
  greeted = new Map<string, number>();
  lastDone = new Map<string, number>();
  lunchDay = -1;
  reactT = 0;
  /** earliest time for the next decision (natural pauses between tasks) */
  decideAt = 0;
  /** activity to do next (toilet -> wash) */
  chain: string | null = null;
  /** earliest time for the next micro-break while busy */
  breakAt = 0;
  /** already tried a detour for the current blockage */
  detoured = false;
  anim: number;
  private blinkAt: number;
  private frames = new Map<string, HTMLCanvasElement>();
  private profView: { title: string; badge: string };

  constructor(info: AgentInfo, role: Profession, slot: string, person: Person, demo: boolean, rand: () => number) {
    this.id = info.id;
    this.info = info;
    this.role = role;
    this.slot = slot;
    this.person = person;
    this.demo = demo;
    this.rand = rand;
    this.traits = personalityFor(role, rand);
    this.needs = freshNeeds(rand);
    this.speed = WALK_SPEED * (0.9 + rand() * 0.2);
    this.anim = rand() * 10;
    this.blinkAt = this.anim + 1 + rand() * 3;
    this.profView = { title: role.title, badge: role.badge };
  }

  get name(): string {
    return this.person.name;
  }

  /** A Claude Code session (not built-in demo staff). */
  get claude(): boolean {
    return !this.demo;
  }

  get isSub(): boolean {
    return this.info.kind === 'sub';
  }

  /** What the renderer shows on the hover label: Claude agents are tagged. */
  get profession(): { title: string; badge: string } {
    const title = this.claude ? `${this.role.title} · Claude` : this.role.title;
    if (this.profView.title !== title) {
      this.profView = { title, badge: this.role.badge };
    }
    return this.profView;
  }

  get statusText(): string {
    const step = this.task?.steps[0];
    if (step?.status) {
      return step.status;
    }
    if (this.task) {
      return typeof this.task.label === 'function' ? this.task.label() : this.task.label;
    }
    if (this.leaving) {
      return 'Heading home';
    }
    return this.info.waiting ? 'Waiting for you' : this.info.busy ? 'Getting to work' : 'Looking around';
  }

  get locked(): boolean {
    return !!this.task?.steps[0]?.locked;
  }

  setPerson(person: Person): void {
    this.person = person;
    this.frames.clear();
  }

  placeAt(tx: number, ty: number, ox = 0, oy = 0): void {
    const [cx, cy] = Office.footPoint(tx, ty);
    this.tx = tx;
    this.ty = ty;
    this.x = cx + ox;
    this.y = cy + oy;
    this.path = [];
    this.seg = null;
  }

  say(text: string, seconds = 2.6): void {
    this.bubble = { text, t: seconds };
    this.speakT = Math.min(seconds, 2);
  }

  sayLater(text: string, delay: number, seconds = 2.4): void {
    this.pendingSay = { text, delay, seconds };
  }

  face(x: number, y: number): void {
    const dx = x - this.x;
    const dy = y - this.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      return;
    }
    this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  }

  get smiling(): boolean {
    return this.waveT > 0 || this.speakT > 0 || this.traits.sociability >= 0.75;
  }

  /** Timers that run every frame regardless of the task. */
  tickTimers(dt: number): void {
    this.anim += dt;
    this.speakT = Math.max(0, this.speakT - dt);
    this.waveT = Math.max(0, this.waveT - dt);
    this.ghostT = Math.max(0, this.ghostT - dt);
    if (this.bubble && (this.bubble.t -= dt) <= 0) {
      this.bubble = null;
    }
    if (this.pendingSay && (this.pendingSay.delay -= dt) <= 0) {
      this.say(this.pendingSay.text, this.pendingSay.seconds);
      this.pendingSay = null;
    }
    if (this.mug > 0 && !this.moving) {
      this.mug = Math.max(0, this.mug - dt);
    }
  }

  /** Walks along `path`; returns true on arrival. `canEnter` gates stepping into the next tile (local avoidance). */
  walk(dt: number, canEnter: (x: number, y: number) => boolean): boolean {
    if (this.waveT > 0 || this.pauseT > 0) {
      this.pauseT = Math.max(0, this.pauseT - dt);
      this.moving = false;
      return false;
    }
    let budget = this.speed * (this.mug > 0 ? 0.88 : 1) * dt;
    while (budget > 0 && this.path.length) {
      const [nx, ny] = this.path[0];
      if (!this.seg) {
        if (this.ghostT <= 0 && !canEnter(nx, ny)) {
          this.blockedFor += dt;
          this.moving = false;
          return false;
        }
        this.seg = [nx, ny];
        this.blockedFor = 0;
        this.detoured = false;
      }
      const [gx, gy] = Office.footPoint(nx, ny);
      const dx = gx - this.x;
      const dy = gy - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) {
        this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      }
      if (dist <= budget) {
        this.x = gx;
        this.y = gy;
        this.tx = nx;
        this.ty = ny;
        this.path.shift();
        this.seg = null;
        budget -= dist;
        this.walkDist += dist;
      } else {
        this.x += (dx / dist) * budget;
        this.y += (dy / dist) * budget;
        this.walkDist += budget;
        budget = 0;
      }
    }
    this.moving = this.path.length > 0;
    return this.path.length === 0;
  }

  /** Moves straight toward a pixel point at `speed`; returns true on arrival. Counts as walking for animation when `stepping`. */
  glide(px: number, py: number, speed: number, dt: number, stepping: boolean): boolean {
    const dx = px - this.x;
    const dy = py - this.y;
    const dist = Math.hypot(dx, dy);
    const step = speed * dt;
    if (dist <= step) {
      this.x = px;
      this.y = py;
      this.moving = false;
      return true;
    }
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    if (stepping) {
      this.walkDist += step;
      this.moving = true;
    }
    return false;
  }

  currentFrame(): HTMLCanvasElement {
    const [pose, frame, blink] = this.pose();
    const smile = this.smiling;
    const key = `${this.dir}|${pose}|${frame}|${+smile}|${+blink}`;
    let c = this.frames.get(key);
    if (!c) {
      c = characterFrame(this.person.look, this.dir, pose, frame, { smiling: smile, blink });
      this.frames.set(key, c);
    }
    return c;
  }

  private loop(pose: Pose, fps: number): [Pose, number, boolean] {
    return [pose, Math.floor(this.anim * fps) % POSE_FRAMES[pose], false];
  }

  private blinking(): boolean {
    if (this.anim > this.blinkAt + 0.14) {
      this.blinkAt = this.anim + 2 + this.rand() * 3.5;
    }
    return this.anim >= this.blinkAt;
  }

  /** The pose and frame to draw now. */
  pose(): [Pose, number, boolean] {
    const t = this.anim;
    if (this.moving) {
      const pose: Pose = this.mug > 0 ? 'carry' : 'walk';
      return [pose, Math.floor(this.walkDist / STRIDE) % POSE_FRAMES[pose], false];
    }
    const blink = this.blinking();
    if (this.seated) {
      if (this.speakT > 0 || this.waveT > 0) {
        return this.loop('sitTalk', 5);
      }
      if (this.act === 'type') {
        return t % 9 < 7.4 ? this.loop('type', 7) : this.mug > 0 ? this.sip('sitDrink') : ['sit', blink ? 1 : 0, false];
      }
      if (this.act === 'talk') {
        return this.loop('sitTalk', 4);
      }
      if (this.mug > 0 || this.act === 'eat' || this.act === 'drink') {
        return this.sip('sitDrink');
      }
      return ['sit', blink ? 1 : 0, false];
    }
    if (this.waveT > 0 || this.act === 'wave') {
      return this.loop('wave', 6);
    }
    if (this.speakT > 0 || this.act === 'talk') {
      return this.loop('talk', 5);
    }
    if (this.act === 'phone') {
      return this.loop('phone', 3);
    }
    if (this.act === 'read') {
      return [...this.loop('read', 1.5).slice(0, 2), blink] as [Pose, number, boolean];
    }
    if (this.mug > 0 || this.act === 'drink' || this.act === 'eat') {
      return this.sip('drink');
    }
    const breathe = [0, 1, 2, 1][Math.floor(t * 1.6) % 4];
    return ['stand', blink ? 3 : breathe, false];
  }

  /** Holds the mug, raising it for a sip every few seconds. */
  private sip(pose: 'drink' | 'sitDrink'): [Pose, number, boolean] {
    const cycle = (this.anim + this.blinkAt) % 6;
    if (cycle < 1.6) {
      return [pose, 1 + Math.min(2, Math.floor(cycle * 2.2)), false];
    }
    return [pose, 0, this.blinking()];
  }

  /** Sprite draw position in world pixels. */
  spriteOrigin(): [number, number] {
    return [Math.round(this.x) - CHAR_FOOT_X, Math.round(this.y) - CHAR_FOOT_Y];
  }

  hitTest(wx: number, wy: number): boolean {
    return wx >= this.x - 11 && wx <= this.x + 11 && wy >= this.y - 40 && wy <= this.y + 3;
  }

  tilesTo(o: { x: number; y: number }): number {
    return Math.hypot(this.x - o.x, this.y - o.y) / TILE;
  }
}
