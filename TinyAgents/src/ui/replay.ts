import { app, Tower } from '../app';
import type { AgentInfo } from '../agents/agent';
import { HistoryEvent, deviceToken, history } from '../cloud/api';
import { RosterEvent, recording } from '../features/recorder';
import { today } from '../world/calendar';
import { buildTower } from '../world/floors';
import { loadBuilding } from '../world/layout';

const SPEEDS = [10, 30, 60];
const SUBSTEP = 0.1;
const MAX_SUBSTEPS = 24;

let root: HTMLElement;
let events: RosterEvent[] = [];
let start = 0;
let end = 0;
/** replay time, epoch ms */
let t = 0;
let speed = 30;
let playing = false;
let open = false;
let scrubbing = false;
let cursor = 0;
let roster = new Map<string, AgentInfo>();
let firstSeen = new Map<string, number>();
let savedHour: number | null = null;
let last = 0;

const clockText = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const hourOf = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
};

function fromHistory(e: HistoryEvent): RosterEvent {
  const s = e.state;
  const info: AgentInfo | null =
    s === 'ended'
      ? null
      : {
          id: e.id,
          kind: e.kind,
          type: e.type,
          parent: e.parent,
          machine: e.machine,
          project: e.project ?? '',
          state: s,
          busy: s === 'thinking' || s === 'tool' || s === 'compacting',
          waiting: s === 'permission',
          tool: e.tool,
          detail: e.detail,
        };
  return { t: Date.parse(e.at), id: e.id, info };
}

/** A fresh copy of the building (every floor, no demo staff) whose clock is the replay time. */
function freshTower(): Tower {
  const tower = buildTower(loadBuilding());
  for (const f of tower.floors) {
    f.director.clock = () => hourOf(t);
  }
  return tower;
}

/** Applies events up to `t`; returns whether the roster changed. */
function advance(): boolean {
  let changed = false;
  while (cursor < events.length && events[cursor].t <= t) {
    const e = events[cursor++];
    if (e.info) {
      roster.set(e.id, e.info);
      if (!firstSeen.has(e.id)) {
        firstSeen.set(e.id, e.t);
      }
    } else {
      roster.delete(e.id);
      firstSeen.delete(e.id);
    }
    changed = true;
  }
  return changed;
}

/** Rebuilds the floor at time `t`: everyone already present sits where they'd be, no walking in. */
function seek(): void {
  cursor = 0;
  roster = new Map();
  firstSeen = new Map();
  advance();
  app.override = freshTower();
  app.override.staff.sync([...roster.values()].map((info) => ({ ...info, age: (t - firstSeen.get(info.id)!) / 1000 })));
}

function frame(ms: number): void {
  if (!open) {
    return;
  }
  const dt = Math.min(0.1, (ms - last) / 1000);
  last = ms;
  const tower = app.override;
  if (playing && !scrubbing && tower) {
    const sim = dt * speed;
    t = Math.min(end, t + sim * 1000);
    if (advance()) {
      tower.staff.sync([...roster.values()]);
    }
    const steps = Math.min(MAX_SUBSTEPS, Math.ceil(sim / SUBSTEP));
    for (let i = 0; i < steps; i++) {
      tower.staff.update(sim / steps);
      for (const f of tower.floors) {
        f.director.update(sim / steps);
      }
    }
    if (t >= end) {
      playing = false;
    }
  }
  app.renderer.lighting.forcedHour = hourOf(t);
  updateBar();
  requestAnimationFrame(frame);
}

function updateBar(): void {
  root.querySelector('.rp-time')!.textContent = clockText(t);
  root.querySelector('.rp-play')!.textContent = playing ? 'Pause' : 'Play';
  const range = root.querySelector<HTMLInputElement>('.rp-track input')!;
  if (!scrubbing) {
    range.value = String(t);
  }
  root.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === speed));
}

function hourMarks(): string {
  const span = end - start;
  const first = new Date(start);
  first.setMinutes(0, 0, 0);
  const stepH = Math.max(1, Math.ceil(span / 3600000 / 8));
  const marks: string[] = [];
  for (let h = first.getTime() + 3600000; h < end; h += stepH * 3600000) {
    const pct = ((h - start) / span) * 100;
    marks.push(`<span style="left:${pct}%">${new Date(h).getHours()}</span>`);
  }
  return marks.join('');
}

function message(text: string): void {
  root.classList.add('msg');
  root.querySelector('.rp-msg')!.textContent = text;
}

function build(): void {
  root.innerHTML = `
    <button class="rp-play">Play</button>
    <div class="rp-time">--:--</div>
    <div class="rp-track"><input type="range" step="1000" aria-label="Replay time" /><div class="rp-hours"></div></div>
    <div class="rp-speed">${SPEEDS.map((s) => `<button data-speed="${s}">&times;${s}</button>`).join('')}</div>
    <div class="rp-msg"></div>
    <button class="rp-close" aria-label="Close replay">&times;</button>`;
  root.querySelector('.rp-close')!.addEventListener('click', closeReplay);
  root.querySelector('.rp-play')!.addEventListener('click', () => {
    if (!playing && t >= end) {
      t = start;
      seek();
    }
    playing = !playing;
  });
  root.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => b.addEventListener('click', () => (speed = Number(b.dataset.speed))));
  const range = root.querySelector<HTMLInputElement>('.rp-track input')!;
  range.addEventListener('pointerdown', () => (scrubbing = true));
  range.addEventListener('input', () => {
    t = Number(range.value);
    root.querySelector('.rp-time')!.textContent = clockText(t);
  });
  range.addEventListener('change', () => {
    scrubbing = false;
    t = Number(range.value);
    seek();
  });
}

async function load(): Promise<RosterEvent[]> {
  if (!deviceToken()) {
    return recording.slice();
  }
  const midnight = today();
  midnight.setHours(0, 0, 0, 0);
  const list = await history(midnight.toISOString());
  return list.map(fromHistory).sort((a, b) => a.t - b.t);
}

/** Opens the timeline bar and replays today in a temporary copy of the building, shown instead of the live one. */
export async function openReplay(): Promise<void> {
  if (open) {
    return;
  }
  open = true;
  root.hidden = false;
  root.classList.remove('msg', 'ready');
  build();
  message('Loading today…');
  document.querySelector<HTMLButtonElement>('#agentPanel:not([hidden]) .ap-close')?.click();
  try {
    events = await load();
  } catch (e) {
    message(`Couldn't load today's history: ${(e as Error).message}`);
    return;
  }
  if (!open) {
    return;
  }
  if (!events.length) {
    message(deviceToken() ? 'Nothing happened in the office today yet.' : 'Nothing recorded yet: the replay covers what happened since this page opened.');
    return;
  }
  start = events[0].t - 30000;
  end = Math.max(Math.min(Date.now(), start + 86400000), events[events.length - 1].t);
  const range = root.querySelector<HTMLInputElement>('.rp-track input')!;
  range.min = String(start);
  range.max = String(end);
  root.querySelector('.rp-hours')!.innerHTML = hourMarks();
  root.classList.remove('msg');
  root.classList.add('ready');
  savedHour = app.renderer.lighting.forcedHour;
  t = start;
  seek();
  playing = true;
  last = performance.now();
  requestAnimationFrame(frame);
}

export function closeReplay(): void {
  if (!open) {
    return;
  }
  open = false;
  playing = false;
  root.hidden = true;
  if (app.override) {
    app.override = null;
    app.renderer.lighting.forcedHour = savedHour;
  }
}

export function initReplay(): void {
  root = document.createElement('div');
  root.id = 'replay';
  root.hidden = true;
  document.body.appendChild(root);
}
