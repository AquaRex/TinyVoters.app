import { AgentInfo } from './agent';

interface Staffer {
  index: number;
  name: string;
  profession: string;
  info: AgentInfo;
  /** in the office (otherwise at home) */
  present: boolean;
  /** time of the next presence change (arrive / go home) */
  shiftAt: number;
  /** time of the next work state change */
  nextAt: number;
  /** remaining waiting time inside a busy stretch */
  waitIn: number;
  toolAt: number;
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

/** Name, profession id and stable index of a demo staffer id ('demo:<n>'). */
export function demoIdentity(id: string): { name: string; profession: string; index: number } | undefined {
  const index = Number(id.slice('demo:'.length));
  const s = id.startsWith('demo:') ? STAFF[index] : undefined;
  return s && { name: s[0], profession: s[1], index };
}

const TOOLS = ['Read', 'Edit', 'Bash', 'Grep', 'Edit', 'Write', 'Glob', 'Read', 'WebSearch', 'Edit'];
const PROJECTS = ['tiny-agents', 'pixel-shop', 'api-gateway', 'docs-site', 'ml-pipeline'];

/**
 * Built-in colleagues with stable names and looks who keep realistic hours: they arrive staggered, alternate
 * busy and idle stretches (sometimes waiting for "the user"), go home after a while and come back later.
 */
export class DemoStaff {
  private staff: Staffer[] = [];
  private time = 0;

  constructor(private rand: () => number) {}

  /** `atWork`: the page just opened mid-day, so most of the team is already in; otherwise they arrive one by one. */
  start(atWork = false): void {
    let at = 0.5;
    this.staff = STAFF.map(([name, profession], index) => {
      const already = atWork && index < 6;
      const s: Staffer = {
        index,
        name,
        profession,
        info: { id: `demo:${index}`, kind: 'main', type: profession, project: PROJECTS[index % PROJECTS.length], busy: false, waiting: false },
        present: already,
        shiftAt: this.time + (already ? 300 + this.rand() * 800 : at),
        nextAt: 0,
        waitIn: -1,
        toolAt: 0,
      };
      at += 3 + this.rand() * 6;
      return s;
    });
  }

  stop(): void {
    this.staff = [];
  }

  /** Advances the schedules; returns the infos of everyone currently in the office. */
  update(dt: number): AgentInfo[] {
    this.time += dt;
    const now = this.time;
    const r = (lo: number, hi: number) => lo + this.rand() * (hi - lo);
    for (const s of this.staff) {
      if (now >= s.shiftAt) {
        s.present = !s.present;
        s.shiftAt = now + (s.present ? r(480, 1100) : r(90, 240));
        s.info = { ...s.info, busy: false, waiting: false, tool: undefined };
        s.nextAt = now + r(15, 45);
      }
      if (!s.present || now < s.nextAt) {
        if (s.present && s.info.busy && now >= s.toolAt) {
          s.toolAt = now + r(3, 9);
          s.info = { ...s.info, tool: TOOLS[Math.floor(this.rand() * TOOLS.length)] };
        }
        if (s.present && s.waitIn >= 0 && now >= s.waitIn && !s.info.waiting) {
          s.info = { ...s.info, waiting: true };
          s.waitIn = -1;
          s.toolAt = now + r(6, 16);
        } else if (s.info.waiting && now >= s.toolAt) {
          s.info = { ...s.info, waiting: false };
        }
        continue;
      }
      if (s.info.busy) {
        s.info = { ...s.info, busy: false, waiting: false, tool: undefined };
        s.nextAt = now + r(25, 110);
      } else {
        s.info = { ...s.info, busy: true, waiting: false, tool: TOOLS[Math.floor(this.rand() * TOOLS.length)] };
        s.nextAt = now + r(45, 170);
        s.toolAt = now + r(3, 9);
        s.waitIn = this.rand() < 0.3 ? now + r(10, 30) : -1;
      }
    }
    return this.staff.filter((s) => s.present).map((s) => s.info);
  }
}
