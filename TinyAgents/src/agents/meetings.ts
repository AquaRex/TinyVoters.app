import type { SpotRef } from '../world/office';
import type { Agent, AgentInfo, Step, Task } from './agent';
import type { Director } from './director';
import { pickFrom } from './professions';
import { Conversation } from './social';
import type { Staff } from './staff';
import { call, defer, hangout } from './steps';
import { EDIT_TOOLS, track } from './toolPlaces';

/**
 * Why a team meets: work being split up (a lead delegates to subagents), planned (plan mode, a planning tool), or
 * summarised (the lead's subagents are all done); 'social' is a few free coworkers who just sit down and talk.
 */
export type MeetingReason = 'distribute' | 'plan' | 'summary' | 'social';

const TOPICS: Record<MeetingReason, readonly string[] | undefined> = {
  distribute: ['who takes what?', "I'll take the API", 'I got the tests', 'split it up', "I'll grab the docs", 'on it!', 'deadline?', 'go go go', 'I can do the UI'],
  plan: ['plan?', 'step one...', 'scope it down', 'any risks?', "what's first?", 'then the UI', 'estimate?', 'todo list', 'agreed'],
  summary: ['summary:', 'all done', 'tests green', 'ship it', 'found a bug', 'nice work', 'lgtm', 'merge it?', 'next steps'],
  social: undefined,
};
const OPENERS: Record<MeetingReason, string> = { distribute: 'team huddle!', plan: 'planning time!', summary: 'quick wrap-up!', social: 'meeting time!' };
const LABELS: Record<MeetingReason, string> = { distribute: 'Splitting up the work', plan: 'Planning meeting', summary: 'Wrap-up meeting', social: 'In a meeting' };
const PLAN_TOOLS = new Set(['ExitPlanMode', 'TodoWrite', 'EnterPlanMode']);
const delegating = (tool?: string) => tool === 'Agent' || tool === 'Task';
/** Seconds after which an invited person who hasn't made it is dropped. */
const JOIN_BY = 35;
/** A working member may leave for their desk once they've sat in for this long. */
const BRIEFED = 15;

interface Room {
  d: Director;
  nav: number;
  seats: SpotRef[];
}

export interface Meeting {
  reason: MeetingReason;
  lead: Agent | null;
  room: Room;
  conv: Conversation;
  invited: Agent[];
  joined: Set<Agent>;
  seatedAt: Map<Agent, number>;
  created: number;
  print: boolean;
}

/**
 * The building's one meeting system: team meetings around Claude work and the odd social meeting. A meeting books a
 * free meeting room sized to the group (any floor), everyone walks over (the lead sometimes via a printer for
 * handouts), talks for a while, then goes back to work. Claude state wins: waiting on you, or a session that needs
 * them at the desk, takes a person out early.
 */
export class Meetings {
  list: Meeting[] = [];
  private cooldown = new Map<string, number>();
  private pending: { lead: Agent; reason: MeetingReason; at: number }[] = [];
  /** leads with subagents at work, for spotting when they're all done */
  private delegated = new Set<Agent>();

  constructor(private staff: Staff) {}

  private get time(): number {
    return this.staff.time;
  }

  inMeeting(a: Agent): boolean {
    return this.list.some((m) => m.invited.includes(a) && !m.conv.done);
  }

  /** A lead's Claude state changed: delegating or planning calls the team in (after a beat, so subagents can arrive). */
  onInfo(a: Agent, was: AgentInfo, now: AgentInfo): void {
    if (a.isSub || a.npc || !a.arrived || a.leaving) {
      return;
    }
    if (delegating(now.tool) && !delegating(was.tool)) {
      this.schedule(a, 'distribute', 4);
    } else if ((now.mode === 'plan' && was.mode !== 'plan' && now.busy) || (PLAN_TOOLS.has(now.tool ?? '') && now.tool !== was.tool)) {
      this.schedule(a, 'plan', 1.5);
    }
  }

  private schedule(lead: Agent, reason: MeetingReason, delay: number): void {
    if (!this.pending.some((p) => p.lead === lead)) {
      this.pending.push({ lead, reason, at: this.time + delay });
    }
  }

  update(): void {
    const due = this.pending.filter((p) => this.time >= p.at);
    this.pending = this.pending.filter((p) => this.time < p.at);
    for (const p of due) {
      this.start(p.reason, p.lead);
    }
    for (const lead of this.staff.agents) {
      if (lead.isSub || lead.npc) {
        continue;
      }
      if (this.subsOf(lead).some((s) => !s.leaving)) {
        this.delegated.add(lead);
      } else if (this.delegated.delete(lead) && lead.info.busy && !lead.leaving) {
        this.start('summary', lead);
      }
    }
    for (const m of this.list) {
      this.gather(m);
    }
    this.list = this.list.filter((m) => !m.conv.done);
  }

  private subsOf(lead: Agent): Agent[] {
    return this.staff.agents.filter((s) => s.isSub && s.info.parent === lead.id && !s.gone);
  }

  /** Free, idle coworkers of the same project who can be pulled into a meeting. */
  private teammates(lead: Agent): Agent[] {
    return this.staff.agents.filter((o) =>
      o !== lead && !o.isSub && !o.npc && o.info.project === lead.info.project && this.free(o));
  }

  private free(o: Agent): boolean {
    const k = o.task?.kind;
    return o.arrived && !o.hidden && !o.leaving && !o.info.busy && !o.info.waiting && !this.inMeeting(o) &&
      (!k || k === 'idle' || k === 'fun' || k === 'chat' || k === 'outside');
  }

  /** A team meeting for `lead`: the lead, its subagents and free teammates, in the best free room. */
  start(reason: MeetingReason, lead: Agent): Meeting | null {
    const key = `${lead.id}|${reason}`;
    if (this.time < (this.cooldown.get(key) ?? -Infinity) || this.inMeeting(lead) || lead.leaving || lead.info.waiting) {
      return null;
    }
    const subs = this.subsOf(lead).filter((s) => (reason === 'summary' ? s.leaving && !s.hidden : !s.leaving));
    const people = [lead, ...subs, ...this.teammates(lead)];
    const m = this.open(reason, lead, people);
    if (m) {
      this.cooldown.set(key, this.time + 90);
      if (reason === 'distribute') {
        subs.forEach((s) => (track(s).briefed = true));
      }
    }
    return m;
  }

  /** A few free coworkers on one floor sit down for a chat meeting. */
  social(d: Director, people: Agent[]): Meeting | null {
    return this.open('social', null, people, d);
  }

  private open(reason: MeetingReason, lead: Agent | null, people: Agent[], only?: Director): Meeting | null {
    if (people.length < 2 || (!lead && people.length < 3)) {
      return null;
    }
    const anchor = lead ?? people[0];
    const room = this.pickRoom(anchor, people.length, only);
    if (!room) {
      return null;
    }
    const invited = people.slice(0, room.seats.length);
    const conv = new Conversation('meeting', invited, this.time + JOIN_BY, room.d.rand, TOPICS[reason]);
    room.d.convs.push(conv);
    const m: Meeting = { reason, lead, room, conv, invited, joined: new Set(), seatedAt: new Map(), created: this.time, print: !!lead && reason !== 'summary' && room.d.rand() < 0.5 };
    this.list.push(m);
    anchor.say(OPENERS[reason], 2.4);
    this.gather(m);
    return m;
  }

  /** The free meeting room (meeting seats grouped by nav room) that best fits `n` people, nearest the anchor's floor. */
  private pickRoom(anchor: Agent, n: number, only?: Director): Room | null {
    const booked = new Set(this.list.filter((m) => !m.conv.done).map((m) => `${m.room.d.level}|${m.room.nav}`));
    let best: Room | null = null;
    let bestCost = Infinity;
    for (const d of only ? [only] : this.staff.directors) {
      if (d !== anchor.floor && !anchor.floor.travel.connects(d)) {
        continue;
      }
      const rooms = new Map<number, SpotRef[]>();
      for (const s of d.office.spotsFor('meeting')) {
        const nav = d.nav.roomOf(s.x, s.y);
        rooms.set(nav, [...(rooms.get(nav) ?? []), s]);
      }
      for (const [nav, seats] of rooms) {
        if (nav <= 0 || booked.has(`${d.level}|${nav}`) || seats.some((s) => !d.isFree(s.key, anchor))) {
          continue;
        }
        const fits = seats.length >= n;
        const cost = (fits ? (seats.length - n) * 4 : 200 - seats.length * 4) + Math.abs(d.level - anchor.homeFloor.level) * 30;
        if (cost < bestCost) {
          bestCost = cost;
          best = { d, nav, seats };
        }
      }
    }
    return best;
  }

  /** Sends invited people over as they become free to go; drops those who can't make it. */
  private gather(m: Meeting): void {
    for (const a of m.invited) {
      if (m.joined.has(a) || m.conv.done) {
        continue;
      }
      if (a.gone || (a.leaving && (!this.leavingOk(m, a) || a.hidden)) || this.time - m.created > JOIN_BY) {
        m.joined.add(a);
        m.conv.leave(a);
        continue;
      }
      if (!a.arrived || a.hidden || a.locked || a.info.waiting || a.task?.kind === 'wait' || a.alpha < 1) {
        continue;
      }
      m.joined.add(a);
      a.floor.interrupt(a);
      const task = this.task(m, a);
      if (!task) {
        m.conv.leave(a);
        continue;
      }
      a.task = task;
      if (a !== (m.lead ?? m.invited[0]) && !a.bubble && a.rand() < 0.6) {
        a.sayLater(pickFrom(['coming!', 'ok!', 'on my way', 'sure'], a.rand), 0.6 + a.rand(), 1.8);
      }
    }
  }

  private leavingOk(m: Meeting, a: Agent): boolean {
    return m.reason === 'summary' && a.isSub;
  }

  private excused(m: Meeting, a: Agent): boolean {
    return !!m.lead && (a === m.lead || a.info.parent === m.lead.id);
  }

  /** Claude state wins: waiting on you, unrelated work, or (after the brief) editing calls a member back to the desk. */
  private mustLeave(m: Meeting, a: Agent): boolean {
    if (a.gone || (a.leaving && !this.leavingOk(m, a)) || a.info.waiting) {
      return true;
    }
    if (!a.info.busy) {
      return false;
    }
    if (!this.excused(m, a)) {
      return true;
    }
    const sat = m.seatedAt.get(a);
    return EDIT_TOOLS.has(a.info.tool ?? '') && sat !== undefined && this.time - sat > BRIEFED;
  }

  private task(m: Meeting, a: Agent): Task | null {
    const { room, conv } = m;
    const seat = room.seats.find((s) => room.d.isFree(s.key, a));
    if (!seat) {
      return null;
    }
    room.d.hold(a, seat.key);
    const target = { x: seat.x, y: seat.y, spot: seat };
    const label = LABELS[m.reason];
    const t = track(a);
    let steps: Step[] | null = null;
    if (a === m.lead && m.print) {
      const printer = a.floor.spotsAnywhere(a, ['print'])[0];
      const there = printer && a.floor.routeTo(a, printer.d, { x: printer.spot.x, y: printer.spot.y, spot: printer.spot }, 'Printing handouts');
      if (there) {
        let left = 3 + a.rand() * 2;
        steps = [
          ...there,
          { status: 'Printing handouts', begin: (x) => x.say('handouts...', 1.8), tick: (_x, dt) => (left -= dt) <= 0 },
          call(() => (t.carry = 'papers')),
          defer((x) => {
            const free = room.seats.find((s) => room.d.isFree(s.key, x));
            return free ? x.floor.routeTo(x, room.d, { x: free.x, y: free.y, spot: free }, label) : null;
          }),
        ];
      }
    }
    steps ??= a.floor.routeTo(a, room.d, target, label);
    if (!steps) {
      return null;
    }
    steps.push(
      call((x) => {
        x.conv = conv;
        m.seatedAt.set(x, this.time);
        if (t.carry === 'papers') {
          t.carry = null;
          x.say('handouts!', 1.8);
        }
        if (m.reason === 'summary' && t.carry === 'folder') {
          t.carry = null;
          t.returned = true;
        }
      }),
      hangout({ seconds: 5, act: 'idle', gains: { social: 0.5, energy: 0.1 }, until: (x) => x.conv === conv && !conv.done && !this.mustLeave(m, x) }),
    );
    if (a.leaving) {
      steps.push(defer((x) => x.floor.travel.departure(x)));
    }
    const kind = a.leaving ? 'leave' : this.excused(m, a) ? 'work' : 'meeting';
    return { kind, label, activity: 'meeting', steps, started: false, cleanup: () => t.carry === 'papers' && (t.carry = null) };
  }
}
