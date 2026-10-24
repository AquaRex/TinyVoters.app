import { Agent } from '../agents/agent';
import { app } from '../app';
import { characterFrame } from '../render/characters';
import { floorKey, floorOf } from '../world/floors';
import { teamName } from '../agents/labels';

/** Head-and-shoulders crop of a 32x48 character frame. */
const CROP = { x: 4, y: 1, w: 24, h: 21 };
export const CLAUDE_ORANGE = '#d97757';

export function portrait(a: Agent, canvas: HTMLCanvasElement): void {
  canvas.width = CROP.w;
  canvas.height = CROP.h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, CROP.w, CROP.h);
  const frame = characterFrame(a.person.look, 'down', 'stand', 0, { smiling: a.smiling });
  ctx.drawImage(frame, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
}

/** A small "Claude" tag marking real Claude Code agents (demo staff have none). */
export function claudeBadge(): HTMLElement {
  const tag = document.createElement('span');
  tag.textContent = 'Claude';
  tag.title = 'A live Claude Code session';
  tag.style.cssText = `background:${CLAUDE_ORANGE};color:#fff7ef;font-size:10px;line-height:1;padding:2px 4px 1px;border-radius:2px;margin-left:6px;vertical-align:1px;font-weight:600`;
  return tag;
}

export class Roster {
  private root: HTMLElement;
  private list: HTMLElement;
  private signature = '';
  /** the collapsed "Building staff" group is open */
  private staffOpen = false;

  constructor(
    private onPick: (a: Agent) => void,
    collapsed: boolean,
  ) {
    this.root = document.getElementById('roster')!;
    this.root.innerHTML = `<button class="ro-toggle" aria-expanded="${!collapsed}">Team <span class="ro-count">0</span></button><ul></ul>`;
    this.root.classList.toggle('collapsed', collapsed);
    this.list = this.root.querySelector('ul')!;
    const toggle = this.root.querySelector<HTMLButtonElement>('.ro-toggle')!;
    toggle.addEventListener('click', () => {
      const open = this.root.classList.toggle('collapsed');
      toggle.setAttribute('aria-expanded', String(!open));
    });
  }

  /** Everyone on every floor; with several floors each row carries the floor they're on now. */
  update(agents: Agent[], selected: Agent | null): void {
    const present = agents.filter((a) => !a.leaving && !a.npc);
    const npcs = agents.filter((a) => !a.leaving && a.npc && a.arrived);
    const tagged = app.floors.length > 1;
    const floorNum = (a: Agent) => {
      const f = tagged && !a.hidden ? floorOf(a) : undefined;
      return f ? floorKey(f) : '';
    };
    const sig = present
      .map((a) => `${a.id}|${a.name}|${a.statusText}|${JSON.stringify(a.person.look)}|${a === selected}|${floorNum(a)}|${projectOf(a)}|${teamName(a)}`)
      .join(';') + `|staff:${this.staffOpen ? npcs.map((a) => `${a.id}|${a.statusText}|${a === selected}|${floorNum(a)}`).join(',') : npcs.length}`;
    if (sig === this.signature) {
      return;
    }
    this.signature = sig;
    this.root.querySelector('.ro-count')!.textContent = String(present.length);
    this.list.innerHTML = '';
    if (!present.length) {
      const li = document.createElement('li');
      li.className = 'ro-empty';
      li.textContent = 'Nobody in yet';
      this.list.append(li);
    }
    const sorted = [...present].sort((p, q) => +p.demo - +q.demo || order[state(p)] - order[state(q)] || p.name.localeCompare(q.name));
    const teams = new Map<string, Agent[]>();
    for (const a of sorted) {
      teams.set(projectOf(a), [...(teams.get(projectOf(a)) ?? []), a]);
    }
    const ranked = [...teams].sort(
      ([p, ps], [q, qs]) => +qs.some((a) => a.info.waiting) - +ps.some((a) => a.info.waiting) || qs.length - ps.length || p.localeCompare(q),
    );
    for (const [project, members] of ranked) {
      const head = document.createElement('li');
      head.className = 'ro-team';
      head.innerHTML = '<span></span><small></small>';
      head.querySelector('span')!.textContent = teamName(members.find((a) => !a.isSub) ?? members[0]);
      head.title = project;
      head.querySelector('small')!.textContent = String(members.length);
      this.list.append(head);
      for (const a of members) {
        this.list.append(this.row(a, selected, floorNum(a)));
      }
    }
    if (npcs.length) {
      const head = document.createElement('li');
      head.className = `ro-team ro-staff${this.staffOpen ? ' open' : ''}`;
      head.innerHTML = '<span>Building staff</span><small></small>';
      head.querySelector('small')!.textContent = String(npcs.length);
      head.addEventListener('click', () => {
        this.staffOpen = !this.staffOpen;
        this.signature = '';
      });
      this.list.append(head);
      if (this.staffOpen) {
        for (const a of npcs) {
          this.list.append(this.row(a, selected, floorNum(a)));
        }
      }
    }
  }

  private row(a: Agent, selected: Agent | null, num: string): HTMLLIElement {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = a === selected ? 'on' : '';
    const face = document.createElement('canvas');
    face.className = 'pix';
    portrait(a, face);
    const text = document.createElement('span');
    text.className = 'ro-text';
    text.innerHTML = `<b></b><small></small>`;
    const name = text.querySelector('b')!;
    name.textContent = a.name;
    if (a.claude) {
      name.append(claudeBadge());
    }
    if (num) {
      const tag = document.createElement('span');
      tag.className = 'ro-floor';
      tag.textContent = num;
      tag.title = `On ${floorOf(a)!.label}`;
      name.append(tag);
    }
    text.querySelector('small')!.textContent = `${a.role.title} · ${a.statusText}`;
    const dot = document.createElement('i');
    dot.className = `dot ${state(a)}`;
    btn.append(face, text, dot);
    btn.addEventListener('click', () => this.onPick(a));
    li.append(btn);
    return li;
  }
}

const order = { waiting: 0, busy: 1, idle: 2 };

function state(a: Agent): keyof typeof order {
  return a.info.waiting ? 'waiting' : a.info.busy ? 'busy' : 'idle';
}

/** The repo folder a person works in; subagents count toward their lead's project. */
function projectOf(a: Agent): string {
  const lead = a.info.parent ? app.agents.find((o) => o.id === a.info.parent) : undefined;
  return lead?.info.project || a.info.project || 'No project';
}
