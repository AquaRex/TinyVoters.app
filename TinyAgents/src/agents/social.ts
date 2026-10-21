import type { Agent } from './agent';
import {
  LUNCH_LINES, MEETING_LINES, REPLIES, SMALL_TALK, pickFrom, smallTalkLine, toolPhrase,
} from './professions';

export type ConvKind = 'chat' | 'seated' | 'meeting' | 'lunch';

/**
 * A conversation between two or more people: once everyone is in place they take turns talking (talk / sitTalk
 * poses with short bubbles), then part ways. Meetings wait for everyone to sit down first.
 */
export class Conversation {
  members: Agent[];
  /** members who are in place */
  present = new Set<Agent>();
  started = false;
  done = false;
  private nextAt = 0;
  private lines: number;
  private last: Agent | null = null;
  private answer: string | null = null;

  constructor(
    readonly kind: ConvKind,
    members: Agent[],
    /** start even if not everyone made it by then */
    private readyBy: number,
    private rand: () => number,
  ) {
    this.members = [...members];
    const chat = members.reduce((s, m) => s + m.traits.chattiness, 0) / members.length;
    const base = kind === 'meeting' ? 9 : kind === 'lunch' ? 6 : 3;
    this.lines = base + Math.round(chat * 4 + rand() * 3) + (members.length - 2) * 2;
  }

  arrive(a: Agent): void {
    this.present.add(a);
  }

  leave(a: Agent): void {
    this.members = this.members.filter((m) => m !== a);
    this.present.delete(a);
    if (a.conv === this) {
      a.conv = null;
    }
    if (this.members.length < 2) {
      this.end();
    }
  }

  end(): void {
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
        this.nextAt = now + 0.4 + this.rand() * 0.6;
      }
      return;
    }
    if (now < this.nextAt) {
      return;
    }
    if (this.lines <= 0) {
      this.end();
      return;
    }
    const speaker = this.pickSpeaker();
    const text = this.lineFor(speaker);
    const seconds = 1.8 + Math.min(1.4, text.length * 0.06);
    speaker.say(text, seconds);
    this.last = speaker;
    this.lines--;
    this.nextAt = now + seconds + 0.25 + this.rand() * 0.7;
  }

  private pickSpeaker(): Agent {
    const options = this.members.filter((m) => m !== this.last && this.present.has(m));
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
