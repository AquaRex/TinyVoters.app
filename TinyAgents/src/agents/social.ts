import type { Agent } from './agent';
import {
  LUNCH_LINES, MEETING_LINES, REPLIES, SMALL_TALK, pickFrom, smallTalkLine, toolPhrase,
} from './professions';

/** What someone says when their real work calls them out of a conversation (when no mind writes it). */
const EXCUSES = ['sorry, gotta run!', 'work calls, later!', 'oops, need to go', 'brb, duty calls', 'gotta jump, sorry'];

export type ConvKind = 'chat' | 'seated' | 'meeting' | 'lunch';

/** Model-written conversations: lines before a speaker may wrap up, and the most lines, per kind. */
const WRITTEN_TURNS: Record<ConvKind, [min: number, max: number]> = { chat: [3, 6], seated: [3, 6], lunch: [4, 8], meeting: [6, 10] };

/**
 * A conversation between two or more people: once everyone is in place they take turns talking (talk / sitTalk
 * poses with short bubbles), then part ways. Meetings wait for everyone to sit down first.
 */
/** Seconds a bubble stays up: long enough to read the line. */
export function readTime(text: string): number {
  return 1.6 + Math.min(3.4, text.length * 0.045);
}

export class Conversation {
  /** AI staff: writes a speaker's next line from its own model (null: use the built-in lines). */
  /** Called once when a conversation ends. */
  static onEnd: ((c: Conversation) => void) | null = null;
  static writer: ((c: Conversation, speaker: Agent, excuse: boolean) => Promise<{ say: string; end: boolean; icon?: string } | null> | null) | null = null;
  /** AI staff: members whose own mind can write their lines get the turns (Claude subagents have none). */
  static voiced: ((a: Agent) => boolean) | null = null;
  members: Agent[];
  /** members who are in place */
  present = new Set<Agent>();
  started = false;
  done = false;
  private nextAt = 0;
  private lines: number;
  private last: Agent | null = null;
  private answer: string | null = null;
  /** what has been said so far, in order */
  log: { who: Agent; text: string }[] = [];
  /** performance.now() when the talking started */
  startedAt = performance.now();
  private writing = false;
  private turns = 0;
  private now = 0;
  /** members called away (their real work needs them): each says one last line on its turn, then goes */
  private excusing = new Set<Agent>();

  /** Whether a written conversation has gone on long enough for its speakers to start wrapping up. */
  get winding(): boolean {
    return this.log.length >= WRITTEN_TURNS[this.kind][1] - 2;
  }

  constructor(
    readonly kind: ConvKind,
    members: Agent[],
    /** start even if not everyone made it by then */
    private readyBy: number,
    private rand: () => number,
    /** lines for a team meeting (planning, splitting up work, a wrap-up) instead of generic meeting talk */
    private topic?: readonly string[],
  ) {
    this.members = [...members];
    const chat = members.reduce((s, m) => s + m.traits.chattiness, 0) / members.length;
    const base = kind === 'meeting' ? 9 : kind === 'lunch' ? 6 : 3;
    this.lines = base + Math.round(chat * 4 + rand() * 3) + (members.length - 2) * 2;
  }

  /** Starts from lines already said (someone answered a remark): the next turn replies to the last of them. */
  seed(lines: { who: Agent; text: string }[]): void {
    this.log = [...lines];
    this.last = lines[lines.length - 1]?.who ?? null;
    this.turns = lines.length;
  }

  /** `a` must go: before the talking starts it just leaves; once it has, it takes the next turn to excuse itself. */
  excuse(a: Agent): void {
    if (!this.started) {
      this.leave(a);
      return;
    }
    this.excusing.add(a);
  }

  arrive(a: Agent): void {
    this.present.add(a);
  }

  leave(a: Agent): void {
    this.members = this.members.filter((m) => m !== a);
    this.present.delete(a);
    this.excusing.delete(a);
    if (a.conv === this) {
      a.conv = null;
    }
    if (this.members.length < 2) {
      this.end();
    }
  }

  end(): void {
    if (!this.done) {
      Conversation.onEnd?.(this);
    }
    this.done = true;
    for (const m of this.members) {
      if (m.conv === this) {
        m.conv = null;
      }
    }
  }

  /** The point everyone faces: the average position of the others. */
  focusFor(a: Agent): [number, number] {
    const others = (this.last && this.last !== a ? [this.last] : this.members.filter((m) => m !== a));
    const x = others.reduce((s, m) => s + m.x, 0) / Math.max(1, others.length);
    const y = others.reduce((s, m) => s + m.y, 0) / Math.max(1, others.length);
    return [x, y];
  }

  update(now: number): void {
    this.now = now;
    if (this.done) {
      return;
    }
    if (!this.started) {
      if (this.members.every((m) => this.present.has(m)) || now >= this.readyBy) {
        for (const m of [...this.members]) {
          if (!this.present.has(m)) {
            this.leave(m);
          }
        }
        this.started = !this.done;
        this.startedAt = performance.now();
        this.nextAt = now + 0.4 + this.rand() * 0.6;
      }
      return;
    }
    if (now < this.nextAt || this.writing) {
      return;
    }
    const leaving = [...this.excusing][0];
    if (this.lines <= 0 && !leaving) {
      this.end();
      return;
    }
    const speaker = leaving ?? this.pickSpeaker();
    const written = Conversation.writer?.(this, speaker, !!leaving);
    if (!written) {
      this.speak(speaker, leaving ? pickFrom(EXCUSES, this.rand) : this.lineFor(speaker));
      if (leaving) {
        this.leave(leaving);
      }
      return;
    }
    this.writing = true;
    void written.then((r) => {
      this.writing = false;
      if (this.done || !this.members.includes(speaker)) {
        return;
      }
      if (leaving) {
        this.speak(speaker, r?.say ?? pickFrom(EXCUSES, this.rand), r?.icon);
        this.leave(leaving);
        return;
      }
      if (!r) {
        // the speaker's mind had nothing sensible to say: a beat of silence, never a canned line in a written chat
        this.lines--;
        this.nextAt = this.now + 0.6;
        return;
      }
      this.speak(speaker, r.say, r.icon);
      const [min, max] = WRITTEN_TURNS[this.kind];
      if ((r.end && this.turns + 1 >= min) || ++this.turns >= max) {
        this.lines = 0;
      }
    });
  }

  private speak(speaker: Agent, text: string, icon?: string): void {
    const seconds = readTime(text);
    speaker.say(text, seconds, icon);
    this.last = speaker;
    this.log.push({ who: speaker, text });
    this.lines--;
    this.nextAt = this.now + seconds + 0.25 + this.rand() * 0.7;
  }

  private pickSpeaker(): Agent {
    const all = this.members.filter((m) => m !== this.last && this.present.has(m));
    const voiced = Conversation.voiced ? all.filter(Conversation.voiced) : [];
    const options = voiced.length ? voiced : all;
    if (!options.length) {
      return this.members[0];
    }
    const total = options.reduce((s, m) => s + 0.3 + m.traits.chattiness, 0);
    let r = this.rand() * total;
    for (const m of options) {
      if ((r -= 0.3 + m.traits.chattiness) <= 0) {
        return m;
      }
    }
    return options[options.length - 1];
  }

  private lineFor(a: Agent): string {
    if (this.answer) {
      const text = this.answer;
      this.answer = null;
      return text;
    }
    const r = this.rand();
    if (this.kind === 'meeting') {
      if (this.topic && r < 0.75) {
        return pickFrom(this.topic, this.rand);
      }
      if (r < 0.2) {
        return pickFrom(a.role.phrases, this.rand);
      }
      return r < 0.85 ? pickFrom(MEETING_LINES, this.rand) : pickFrom(REPLIES, this.rand);
    }
    if (this.kind === 'lunch' && r < 0.35) {
      return pickFrom(LUNCH_LINES, this.rand);
    }
    if (a.claude && a.info.busy && a.info.tool && r < 0.25) {
      return a.info.tool === 'Edit' || a.info.tool === 'Write' ? `still editing...` : toolPhrase(a.info.tool);
    }
    if (this.last && r < 0.35) {
      return pickFrom(REPLIES, this.rand);
    }
    if (r < 0.65) {
      const [q, ans] = pickFrom(SMALL_TALK, this.rand);
      this.answer = ans;
      return q;
    }
    return smallTalkLine(a.role, this.rand);
  }
}
