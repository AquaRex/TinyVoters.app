import type { Agent, AgentInfo } from './agent';
import { DemoStaff, demoIdentity } from './demo';
import type { Director } from './director';
import { npcDef, npcInfos } from './buildingStaff';
import { Meetings } from './meetings';

/**
 * Everyone in one building: the roster (Claude sessions from the bridge plus optional demo staff), the shared
 * clock, and which floor each newcomer works on. Each floor's director runs the people currently on it;
 * people change directors when they take the lift or the stairs (Director.handOver).
 */
export class Staff {
  /** one director per floor, ground floor first */
  directors: Director[] = [];
  /** seconds since the building opened, shared by every floor */
  time = 0;
  /** team meetings (and the odd social one) across every floor */
  readonly meetings = new Meetings(this);
  private claudeInfos: AgentInfo[] = [];
  /** The first roster from the bridge / the demo after the page opened: those people are already at work. */
  private firstClaude = true;
  private firstDemo = true;
  private demo = new DemoStaff(Math.random);

  constructor() {
    this.demo.onBreak = (id) => this.agents.some((a) => a.id === id && a.task?.kind === 'lunch');
  }
  private demoOn = false;

  add(d: Director): void {
    this.directors = [...this.directors, d].sort((p, q) => p.level - q.level);
  }

  remove(d: Director): void {
    this.directors = this.directors.filter((x) => x !== d);
  }

  /** The ground floor: cars, the front door and the outdoors. */
  get ground(): Director {
    return this.directors[0];
  }

  get agents(): Agent[] {
    return this.directors.flatMap((d) => d.agents);
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
      this.demo.start(this.time < 2, this.ground?.hour ?? 12);
    } else {
      this.demo.stop();
    }
    this.reconcile([]);
  }

  /** The Claude sessions reported by the bridge. */
  sync(infos: AgentInfo[]): void {
    this.claudeInfos = infos;
    this.reconcile(this.demoOn ? this.demo.update(0, this.ground?.hour ?? 12) : []);
    this.firstClaude = false;
  }

  /** Advances the clock, the demo staff, the building staff's shifts and the meetings; call once per frame before the directors' update. */
  update(dt: number): void {
    this.time += Math.min(dt, 0.1);
    this.reconcile(this.demoOn ? this.demo.update(dt, this.ground?.hour ?? 12) : []);
    this.meetings.update();
  }

  private reconcile(demoInfos: AgentInfo[]): void {
    const wanted = new Map<string, AgentInfo>();
    const npcs = this.ground ? npcInfos(this.ground.hour) : [];
    for (const info of [...this.claudeInfos, ...demoInfos, ...npcs]) {
      wanted.set(info.id, info);
    }
    for (const d of this.directors) {
      for (const a of d.agents) {
        const info = wanted.get(a.id);
        wanted.delete(a.id);
        if (!info) {
          if (!a.leaving) {
            d.dismiss(a);
          }
        } else if (!a.leaving) {
          d.applyInfo(a, info);
        }
      }
    }
    for (const info of wanted.values()) {
      this.spawn(info);
    }
    if (demoInfos.length) {
      this.firstDemo = false;
    }
  }

  /**
   * People who were already working before the page opened skip the trip in: a Claude session that has been
   * running for a while when the bridge first reports it, and demo staff on the first roster.
   */
  private alreadyAtWork(info: AgentInfo): boolean {
    if (npcDef(info.id)) {
      return this.time < 3;
    }
    if (demoIdentity(info.id)) {
      return this.firstDemo && this.time < 3;
    }
    return this.firstClaude && (info.age ?? 0) > 20;
  }

  /** Newcomers start at their desk (already at work), next to their lead (subagents), or on the ground floor (arrivals). */
  private spawn(info: AgentInfo): void {
    const home = this.homeFor(info);
    const present = this.alreadyAtWork(info);
    const start = present || info.kind === 'sub' ? home : this.ground;
    start.spawn(info, home, present);
  }

  /**
   * The floor someone works on: a subagent's lead's floor, a teammate's floor, floor 2 for demo staff, otherwise the
   * floor with the most free desks (upper floors first).
   */
  private homeFor(info: AgentInfo): Director {
    const people = this.agents.filter((a) => !a.leaving);
    const lead = info.parent ? people.find((a) => a.id === info.parent) : undefined;
    if (lead) {
      return lead.homeFloor;
    }
    const npc = npcDef(info.id);
    if (npc) {
      return this.directors.find((d) => d.level === npc.level) ?? this.ground;
    }
    if (demoIdentity(info.id)) {
      return this.directors.find((d) => d.level === 1) ?? this.directors[this.directors.length - 1];
    }
    const mate = people.find((a) => a.claude && !a.isSub && a.info.project === info.project);
    if (mate) {
      return mate.homeFloor;
    }
    const free = (d: Director) => d.office.spotsFor('work').filter((s) => !d.reserved.get(s.key)).length;
    return [...this.directors].sort((p, q) => free(q) - free(p) || q.level - p.level)[0];
  }
}
