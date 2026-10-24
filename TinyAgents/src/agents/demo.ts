import { hash, seeded } from '../render/pixel';
import { AgentInfo, ClaudeState } from './agent';
import { professionFor } from './professions';

/** One stretch of a simulated turn: a state held for a while, a tool call, or a delegation to subagents. */
interface Phase {
  state: ClaudeState;
  seconds: number;
  tool?: string;
  detail?: string;
  /** the tool call fails (errors goes up when it ends) */
  fail?: boolean;
  error?: string;
  /** subagents started by this phase (an Agent call); the phase lasts until they are done */
  subs?: [type: string, title: string][];
  /** permission mode during this phase ('plan' while planning) */
  mode?: string;
}

/** A simulated Claude session: its info and the phases left in the current turn. */
interface Sim {
  info: AgentInfo;
  phases: Phase[];
  /** end of the current phase */
  until: number;
  started: number;
  stateAt: number;
}

interface Staffer extends Sim {
  index: number;
  name: string;
  profession: string;
  /** in the office (otherwise at home) */
  present: boolean;
  /** when a due arrival or departure happens (staggered, so a jump of the clock doesn't move everyone at once) */
  flipAt: number | null;
  /** idle until this time, then a new turn starts */
  idleUntil: number;
  subs: Sim[];
  subCount: number;
}

const STAFF: [name: string, profession: string][] = [
  ['Maya', 'lead'],
  ['Theo', 'frontend'],
  ['Priya', 'designer'],
  ['Jonas', 'backend'],
  ['Lena', 'researcher'],
  ['Omar', 'devops'],
  ['Rosa', 'writer'],
  ['Kenji', 'qa'],
];

/** Professions for demo subagent types (others go by keyword). */
const SUB_PROFESSIONS: Record<string, string> = { Explore: 'researcher', Plan: 'architect', 'code-reviewer': 'reviewer', 'general-purpose': 'generalist' };

/**
 * Who a demo id is. Staff: 'demo:<n>' (fixed name and profession). Demo subagents: 'demosub:<n>.<k>:<type>', with a
 * profession from their type and no fixed name (index -1).
 */
export function demoIdentity(id: string): { name?: string; profession: string; index: number } | undefined {
  if (id.startsWith('demosub:')) {
    const type = id.slice(id.indexOf(':', 'demosub:'.length) + 1);
    return { profession: SUB_PROFESSIONS[type] ?? professionFor(type).id, index: -1 };
  }
  const index = Number(id.slice('demo:'.length));
  const s = id.startsWith('demo:') ? STAFF[index] : undefined;
  return s && { name: s[0], profession: s[1], index };
}

const PROJECTS = ['tiny-agents', 'pixel-shop', 'api-gateway', 'docs-site', 'ml-pipeline'];
const TITLES = [
  'Fix the login redirect loop', 'Add a dark mode toggle', 'Speed up the search API', 'Write the onboarding docs',
  'Migrate to Postgres 16', 'Refactor the render loop', 'Add CSV export', 'Fix flaky checkout test', 'Pixel-perfect icons',
  'Set up CI caching', 'Paginate the orders page', 'Tidy the README',
];
const FILES = ['login.ts', 'director.ts', 'README.md', 'api.ts', 'styles.css', 'schema.sql', 'router.tsx', 'utils.py', 'main.go', 'index.html', 'package.json', 'Cart.vue'];
const PATTERNS = ['useAuth', 'TODO', 'handleClick', 'fetchUser', 'src/**/*.ts', '*.test.ts', 'onSubmit', 'class Agent'];
const QUERIES = ['vite env variables', 'css subgrid support', 'postgres jsonb index', 'oauth pkce flow', 'pixel art outlines'];
const HOSTS = ['developer.mozilla.org', 'github.com', 'docs.python.org', 'stackoverflow.com', 'vitejs.dev'];
const TESTS = ['npm test', 'Run unit tests', 'vitest run', 'pytest -q', 'cargo test', 'Run the test suite'];
const COMMANDS = ['npm run build', 'Install dependencies', 'docker compose up', 'Start the dev server', 'Lint the project'];
const ASKS = ['Deploy to staging', 'Delete old builds', 'Push the branch'];
const SUB_TASKS: [string, string][] = [
  ['Explore', 'Find the auth handlers'], ['Explore', 'Map the render loop'], ['general-purpose', 'Write migration tests'],
  ['Plan', 'Plan the refactor'], ['code-reviewer', 'Review the diff'], ['Explore', 'Survey the API routes'],
];

const BUSY: ClaudeState[] = ['thinking', 'tool', 'compacting'];

/** Local day number, for schedules that change from day to day. */
function today(): number {
  return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
}

/**
 * One person's hours today (stable per person and day): in around 8:00-9:30 (some a bit later), out around
 * 15:00-16:00 (some a bit early); on some days one or two of the team stay late, until about 22:00-24:00.
 */
export function demoHours(index: number, day = today()): [number, number] {
  const r = seeded(hash(`demo#${index}|${day}`));
  const late = r() < 0.2 ? 0.5 + r() : 0;
  const start = 8 + r() * 1.5 + late;
  const early = r() < 0.15;
  let end = early ? 14 + r() : 15 + r();
  const night = seeded(hash(`late|${day}`));
  const owls = [night() < 0.7 ? Math.floor(night() * STAFF.length) : -1, night() < 0.35 ? Math.floor(night() * STAFF.length) : -1];
  if (owls.includes(index)) {
    end = 22 + r() * 1.95;
  }
  return [start, end];
}

function onDuty(index: number, hour: number): boolean {
  const [start, end] = demoHours(index);
  return hour >= start && hour < end;
}

/**
 * Built-in colleagues with stable names and looks who keep realistic hours and simulate real sessions: turns of
 * thinking and tool calls (reading files, searching the web, running commands and tests that sometimes fail,
 * editing), permission prompts of varying length, compaction, the odd rate limit, and parallel subagents.
 */
export class DemoStaff {
  private staff: Staffer[] = [];
  private time = 0;

  /** Whether the person behind a demo session is on a lunch break right now (no new turn starts until they're back). */
  onBreak: (id: string) => boolean = () => false;

  constructor(private rand: () => number) {}

  private r(lo: number, hi: number): number {
    return lo + this.rand() * (hi - lo);
  }

  private pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.rand() * arr.length)];
  }

  /**
   * `atWork`: the page just opened, so whoever's schedule has them in at `hour` is already at their desk; otherwise
   * everyone follows their schedule from now on (arriving one by one).
   */
  start(atWork: boolean, hour: number): void {
    this.staff = STAFF.map(([name, profession], index) => {
      const already = atWork && onDuty(index, hour);
      const s: Staffer = {
        index,
        name,
        profession,
        info: { id: `demo:${index}`, kind: 'main', type: profession, project: PROJECTS[index % PROJECTS.length], busy: false, waiting: false },
        phases: [],
        until: 0,
        started: this.time - (already ? this.r(300, 2400) : 0),
        stateAt: this.time,
        present: already,
        flipAt: null,
        idleUntil: this.time + this.r(3, 30),
        subs: [],
        subCount: 0,
      };
      s.info = { ...s.info, state: already ? 'idle' : 'starting', toolCalls: 0, errors: 0, prompts: 0 };
      return s;
    });
  }

  stop(): void {
    this.staff = [];
  }

  /**
   * Advances the sessions and follows each person's schedule at `hour` (the building's clock: real time or the
   * slider); returns the infos of everyone currently in the office (subagents included). Lunch breaks run longer.
   */
  update(dt: number, hour: number): AgentInfo[] {
    this.time += dt;
    const lunch = hour >= 11 && hour < 13;
    const now = this.time;
    const out: AgentInfo[] = [];
    let queued = this.staff.filter((x) => x.flipAt !== null).length;
    for (const s of this.staff) {
      const due = onDuty(s.index, hour) !== s.present;
      if (!due) {
        s.flipAt = null;
      } else if (s.flipAt === null) {
        s.flipAt = now + 2 + queued++ * this.r(5, 12);
      }
      if (s.flipAt !== null && now >= s.flipAt) {
        s.present = !s.present;
        s.flipAt = null;
        s.phases = [];
        s.subs = [];
        s.started = now;
        s.idleUntil = now + this.r(15, 45);
        s.info = { ...s.info, title: undefined, tool: undefined, detail: undefined, toolCalls: 0, errors: 0, prompts: 0, error: undefined };
        this.enter(s, { state: 'starting', seconds: 0 });
      }
      if (!s.present) {
        continue;
      }
      if (!s.phases.length && now >= s.idleUntil && !this.onBreak(s.info.id)) {
        s.info = { ...s.info, title: this.pick(TITLES), prompts: (s.info.prompts ?? 0) + 1 };
        s.phases = this.turn(true);
        this.enter(s, s.phases[0]);
      }
      this.advance(s, () => {
        s.idleUntil = now + (lunch ? this.r(100, 220) : this.r(25, 110));
        this.enter(s, { state: 'idle', seconds: 0 });
      });
      for (const sub of s.subs) {
        this.advance(sub, () => (sub.phases = []));
      }
      s.subs = s.subs.filter((sub) => sub.phases.length);
      out.push(this.stamp(s), ...s.subs.map((sub) => this.stamp(sub)));
    }
    return out;
  }

  /** Moves a session to its next phase when the current one is over; `done` runs after the last phase. */
  private advance(s: Sim, done: () => void): void {
    const cur = s.phases[0];
    if (!cur || this.time < s.until) {
      return;
    }
    if (cur.subs && s.info.kind === 'main' && (s as Staffer).subs.length) {
      return;
    }
    if (cur.fail) {
      s.info = { ...s.info, errors: (s.info.errors ?? 0) + 1 };
    }
    s.phases.shift();
    if (s.phases.length) {
      this.enter(s, s.phases[0]);
    } else {
      done();
    }
  }

  private enter(s: Sim, p: Phase): void {
    const tool = p.state === 'idle' || p.state === 'starting' ? undefined : p.tool ?? s.info.tool;
    s.info = {
      ...s.info,
      state: p.state,
      busy: BUSY.includes(p.state),
      waiting: p.state === 'permission',
      tool,
      detail: p.tool ? p.detail : p.state === 'idle' ? undefined : s.info.detail,
      error: p.error,
      mode: p.mode,
      toolCalls: (s.info.toolCalls ?? 0) + (p.state === 'tool' || (p.state === 'permission' && p.tool) ? 1 : 0),
    };
    s.until = this.time + p.seconds;
    s.stateAt = this.time;
    if (p.subs) {
      const lead = s as Staffer;
      for (const [type, title] of p.subs) {
        const k = lead.subCount++;
        const phases = this.turn(false);
        lead.subs.push({
          info: { id: `demosub:${lead.index}.${k}:${type}`, kind: 'sub', type, parent: lead.info.id, project: lead.info.project, title, busy: true, waiting: false, state: 'thinking', toolCalls: 0, errors: 0, prompts: 1 },
          phases,
          until: this.time + phases[0].seconds,
          started: this.time,
          stateAt: this.time,
        });
      }
    }
  }

  private stamp(s: Sim): AgentInfo {
    s.info.age = this.time - s.started;
    s.info.stateFor = this.time - s.stateAt;
    return s.info;
  }

  private think(lo: number, hi: number): Phase {
    return { state: 'thinking', seconds: this.r(lo, hi) };
  }

  private call(tool: string, detail: string, lo: number, hi: number, fail = false): Phase {
    return { state: 'tool', tool, detail, seconds: this.r(lo, hi), fail };
  }

  /** One busy turn: a mix of reading streaks, web research, commands, test runs and edits; leads may ask, compact and delegate. */
  private turn(lead: boolean): Phase[] {
    const out: Phase[] = [this.think(2, 5)];
    const total = lead ? this.r(50, 170) : this.r(35, 70);
    let t = 0;
    while (t < total) {
      const k = this.rand();
      const chunk: Phase[] = [];
      if (k < 0.24) {
        const n = 4 + Math.floor(this.rand() * 4);
        for (let i = 0; i < n; i++) {
          const tool = this.pick(['Read', 'Read', 'Grep', 'Glob']);
          chunk.push(this.call(tool, this.pick(tool === 'Read' ? FILES : PATTERNS), 1.5, 3), this.think(0.4, 1.4));
        }
      } else if (k < 0.36) {
        chunk.push(this.call('WebSearch', this.pick(QUERIES), 5, 8), this.think(0.5, 1), this.call('WebFetch', this.pick(HOSTS), 6, 10), this.think(0.5, 1), this.call('WebFetch', this.pick(HOSTS), 5, 8));
      } else if (k < 0.48 && lead) {
        const long = this.rand() < 0.4;
        chunk.push(this.call('Bash', this.pick(TESTS), long ? 45 : 8, long ? 80 : 18, this.rand() < 0.35));
      } else if (k < 0.56 && lead) {
        const long = this.rand() < 0.35;
        chunk.push(this.call('Bash', this.pick(COMMANDS), long ? 40 : 6, long ? 70 : 14, this.rand() < 0.1));
      } else if (k < 0.6 && lead) {
        chunk.push(this.call('Bash', this.pick(TESTS), 4, 7, true), this.think(1, 2), this.call('Edit', this.pick(FILES), 2, 3), this.call('Bash', this.pick(TESTS), 4, 7, true));
      } else {
        const n = 1 + Math.floor(this.rand() * 3);
        for (let i = 0; i < n; i++) {
          chunk.push(this.call(this.rand() < 0.75 ? 'Edit' : 'Write', this.pick(FILES), 2, 4, this.rand() < 0.08), this.think(1, 3));
        }
      }
      chunk.push(this.think(1.5, 5));
      out.push(...chunk);
      t += chunk.reduce((sum, p) => sum + p.seconds, 0);
    }
    if (!lead) {
      return out;
    }
    const insert = (p: Phase) => out.splice(1 + Math.floor(this.rand() * (out.length - 1)), 0, p, this.think(1, 3));
    if (this.rand() < 0.3) {
      const r = this.rand();
      insert({ state: 'permission', tool: 'Bash', detail: this.pick(ASKS), seconds: r < 0.4 ? this.r(6, 15) : r < 0.75 ? this.r(24, 45) : this.r(62, 85) });
    }
    if (this.rand() < 0.14) {
      insert({ state: 'compacting', seconds: this.r(10, 16) });
    }
    if (this.rand() < 0.2) {
      out.splice(1, 0, { state: 'tool', tool: 'TodoWrite', detail: '4 todos', seconds: 2 }, this.think(1, 2));
    } else if (this.rand() < 0.18) {
      const plan: Phase[] = [this.think(4, 8), this.call('Read', this.pick(FILES), 2, 3), this.think(3, 6), this.call('Grep', this.pick(PATTERNS), 2, 3), this.think(4, 8)];
      plan.forEach((p) => (p.mode = 'plan'));
      out.splice(1, 0, ...plan, { state: 'tool', tool: 'ExitPlanMode', detail: 'the plan', seconds: 2, mode: 'plan' }, this.think(1, 2));
    }
    if (this.rand() < 0.28) {
      const n = 1 + Math.floor(this.rand() * 3);
      const subs = Array.from({ length: n }, () => this.pick(SUB_TASKS));
      insert({ state: 'tool', tool: 'Agent', detail: subs[0][1], seconds: 3, subs });
    }
    if (this.rand() < 0.06) {
      out.push({ state: 'error', error: 'rate_limit', seconds: 20 });
    }
    return out;
  }
}
