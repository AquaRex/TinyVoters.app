import { app } from '../app';
import type { Agent } from '../agents/agent';
import { ux } from './prefs';

const IDLE_CURSOR_MS = 2000;

let on = false;
let target: Agent | null = null;
let switchAt = 0;
let last = 0;
let cursorTimer = 0;
/** Last tool seen per agent and when it changed (ms), so busy people with fresh tool calls rank higher. */
const tools = new Map<Agent, { tool?: string; at: number }>();

export function ambientOn(): boolean {
  return on;
}

function interest(a: Agent, now: number): number {
  if (a.info.waiting) {
    return 100;
  }
  const t = tools.get(a);
  if (a.info.busy && t && now - t.at < 15000) {
    return 70;
  }
  if (a.info.busy) {
    return 50;
  }
  if (a.act === 'wave' || a.act === 'talk' || a.conv?.started || a.speakT > 0) {
    return 30;
  }
  return 10;
}

/** The most interesting person in view, preferring someone new among equals. */
function pick(now: number): Agent | null {
  const people = app.shown.director.agents.filter((a) => !a.hidden && a.alpha > 0.5 && !a.leaving);
  if (!people.length) {
    return null;
  }
  const best = Math.max(...people.map((a) => interest(a, now)));
  const top = people.filter((a) => interest(a, now) === best);
  const fresh = top.filter((a) => a !== target);
  const pool = fresh.length ? fresh : top;
  return pool[Math.floor(Math.random() * pool.length)];
}

function frame(ms: number): void {
  if (!on) {
    return;
  }
  const dt = Math.min(0.1, (ms - last) / 1000);
  last = ms;
  const floor = app.shown;
  for (const a of floor.director.agents) {
    const t = tools.get(a);
    if (!t || t.tool !== a.info.tool) {
      tools.set(a, { tool: a.info.tool, at: ms });
    }
  }
  for (const a of tools.keys()) {
    if (a.gone) {
      tools.delete(a);
    }
  }
  const lost = !target || target.gone || target.hidden || !floor.director.agents.includes(target);
  const urgent = !!target && !target.info.waiting && floor.director.agents.some((a) => a.info.waiting && !a.hidden);
  if (lost || ms >= switchAt || (urgent && ms >= switchAt - 15000)) {
    const next = pick(ms);
    if (next !== target) {
      target = next;
      const r = app.renderer;
      const dpr = window.devicePixelRatio || 1;
      const base = Math.max(1, Math.round(dpr * (window.innerWidth < 900 ? 1.5 : 2.5)));
      r.zoomTo(window.innerWidth / 2, window.innerHeight / 2, base * (Math.random() < 0.5 ? 1 : 1.5));
    }
    switchAt = ms + 20000 + Math.random() * 20000;
  }
  if (target) {
    const cam = app.renderer.camera;
    const k = Math.min(1, dt * 0.9);
    cam.x += (target.x - cam.x) * k;
    cam.y += (target.y - 20 - cam.y) * k;
  }
  requestAnimationFrame(frame);
}

function showCursor(): void {
  document.body.classList.remove('ambient-idle');
  clearTimeout(cursorTimer);
  cursorTimer = window.setTimeout(() => document.body.classList.add('ambient-idle'), IDLE_CURSOR_MS);
}

/** Ambient mode: no UI, the camera drifts between the most interesting people. `fullscreen` needs a user gesture. */
export function setAmbient(enable: boolean, fullscreen = false): void {
  if (enable === on) {
    return;
  }
  on = enable;
  document.body.classList.toggle('ambient', on);
  if (on) {
    document.querySelector<HTMLButtonElement>('#agentPanel:not([hidden]) .ap-close')?.click();
    if (fullscreen && ux.fullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
    target = null;
    switchAt = 0;
    last = performance.now();
    showCursor();
    requestAnimationFrame(frame);
  } else {
    clearTimeout(cursorTimer);
    document.body.classList.remove('ambient-idle');
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    }
  }
}

function typing(e: Event): boolean {
  return e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
}

export function initAmbient(): void {
  window.addEventListener(
    'keydown',
    (e) => {
      if (on) {
        e.preventDefault();
        e.stopPropagation();
        setAmbient(false);
      } else if ((e.key === 'f' || e.key === 'F') && !typing(e) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.stopPropagation();
        setAmbient(true, true);
      }
    },
    { capture: true },
  );
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (on) {
        e.preventDefault();
        e.stopPropagation();
        setAmbient(false);
      }
    },
    { capture: true },
  );
  window.addEventListener('pointermove', () => {
    if (on) {
      showCursor();
    }
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && on && ux.fullscreen) {
      setAmbient(false);
    }
  });
  if (new URLSearchParams(location.search).get('ambient') === '1') {
    setAmbient(true);
  }
}
