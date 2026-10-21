import { Agent } from '../agents/agent';
import { characterFrame } from '../render/characters';

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

  update(agents: Agent[], selected: Agent | null): void {
    const present = agents.filter((a) => !a.leaving);
    const sig = present
      .map((a) => `${a.id}|${a.name}|${a.statusText}|${JSON.stringify(a.person.look)}|${a === selected}`)
      .join(';');
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
      return;
    }
    const order = { waiting: 0, busy: 1, idle: 2 };
    const state = (a: Agent) => (a.info.waiting ? 'waiting' : a.info.busy ? 'busy' : 'idle');
    const sorted = [...present].sort((p, q) => +p.demo - +q.demo || order[state(p)] - order[state(q)] || p.name.localeCompare(q.name));
    for (const a of sorted) {
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
      text.querySelector('small')!.textContent = `${a.role.title} · ${a.statusText}`;
      const dot = document.createElement('i');
      dot.className = `dot ${state(a)}`;
      btn.append(face, text, dot);
      btn.addEventListener('click', () => this.onPick(a));
      li.append(btn);
      this.list.append(li);
    }
  }
}
