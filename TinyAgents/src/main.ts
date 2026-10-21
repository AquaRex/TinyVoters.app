import './style.css';
import './art';
import { TILE } from './config';
import { Agent } from './agents/agent';
import { Director } from './agents/director';
import { OfficeStatus, watchOffice } from './cloud/api';
import { Renderer } from './render/renderer';
import { AgentPanel } from './ui/agentPanel';
import { ConnectDialog } from './ui/connect';
import { Editor } from './ui/editor';
import { Roster } from './ui/roster';
import { loadLayout } from './world/layout';
import { Office } from './world/office';

const canvas = document.getElementById('world') as HTMLCanvasElement;
const office = new Office(loadLayout());
const renderer = new Renderer<Agent>(canvas);
const director = new Director(office);
renderer.liftOpen = (uid) => director.liftOpen(uid);
if (import.meta.env.DEV) {
  Object.assign(window, { tiny: { office, director, renderer, editor: () => editor } });
}
const editor = new Editor(office, renderer, toast);
const panel = new AgentPanel(() => (renderer.selected = null));
const roster = new Roster(selectAgent, matchMedia('(pointer: coarse)').matches || window.innerWidth < 700);

renderer.resize();
renderer.camera.x = (office.w * TILE) / 2;
renderer.camera.y = (office.h * TILE) / 2;
renderer.camera.zoom = Math.max(1, Math.round((window.devicePixelRatio || 1) * (window.innerWidth < 900 ? 1 : 2)));
window.addEventListener('resize', () => renderer.resize());

// ---------- HUD ----------

const modeBtn = document.getElementById('modeBtn') as HTMLButtonElement;
const officePill = document.getElementById('office') as HTMLButtonElement;
const emptyHint = document.getElementById('emptyHint')!;
const help = document.getElementById('help')!;
let officeStatus: OfficeStatus = 'connecting';
const connect = new ConnectDialog(toast);
officePill.addEventListener('click', () => connect.open());
emptyHint.querySelector('button')!.addEventListener('click', () => connect.open());

function setEditMode(on: boolean): void {
  editor.setActive(on);
  document.body.classList.toggle('editing', on);
  modeBtn.textContent = on ? 'Done editing' : 'Edit office';
  modeBtn.classList.toggle('on', on);
  if (on) {
    panel.close();
  }
}
modeBtn.addEventListener('click', () => setEditMode(!editor.active));

const PREFS_KEY = 'tiny-agents.prefs.v2';
const prefs: { demo: boolean; clock: boolean } = (() => {
  try {
    return { demo: true, clock: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { demo: true, clock: true };
  }
})();
function savePrefs(): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable: preferences last for this session
  }
}

const demoBtn = document.getElementById('demoBtn') as HTMLButtonElement;
function setDemo(on: boolean): void {
  prefs.demo = on;
  demoBtn.classList.toggle('on', on);
  director.setDemo(on);
}
demoBtn.addEventListener('click', () => {
  setDemo(!prefs.demo);
  savePrefs();
});
setDemo(prefs.demo);

const timeBtn = document.getElementById('timeBtn') as HTMLButtonElement;
function setClock(on: boolean): void {
  prefs.clock = on;
  renderer.lighting.followClock = on;
  timeBtn.textContent = on ? 'Clock' : 'Day';
  timeBtn.classList.toggle('on', on);
}
timeBtn.addEventListener('click', () => {
  setClock(!prefs.clock);
  savePrefs();
});
setClock(prefs.clock);
director.clock = () => renderer.lighting.hour;
document.getElementById('helpBtn')!.addEventListener('click', () => (help.hidden = !help.hidden));
document.getElementById('zoomIn')!.addEventListener('click', () => renderer.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1));
document.getElementById('zoomOut')!.addEventListener('click', () => renderer.zoomAt(window.innerWidth / 2, window.innerHeight / 2, -1));
help.querySelector('.close')!.addEventListener('click', () => (help.hidden = true));

function updateHud(): void {
  const present = director.agents.filter((a) => !a.leaving);
  const working = present.filter((a) => a.info.busy).length;
  const claude = present.filter((a) => a.claude).length;
  const labels: Record<OfficeStatus, string> = {
    online: `Live · ${claude} Claude agent${claude === 1 ? '' : 's'} · ${working} working`,
    connecting: 'Connecting…',
    offline: 'Office offline: retrying…',
    unpaired: 'Demo office · Connect Claude',
  };
  officePill.textContent = labels[officeStatus];
  officePill.dataset.state = officeStatus;
  emptyHint.hidden = !(officeStatus === 'online' && claude === 0) || editor.active || prefs.demo;
}

let toastTimer = 0;
function toast(msg: string): void {
  const el = document.getElementById('toast')!;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 1800);
}

function selectAgent(a: Agent): void {
  if (editor.active) {
    setEditMode(false);
  }
  renderer.selected = a;
  panel.open(a);
  renderer.camera.x = a.x;
  renderer.camera.y = a.y - 24;
}

watchOffice(
  (agents) => director.sync(agents),
  (s) => (officeStatus = s),
);

// ---------- input ----------

const keys = new Set<string>();
let drag: { x: number; y: number; camX: number; camY: number; moved: boolean; pan: boolean; id: number } | null = null;
let spaceHeld = false;

function tileAt(sx: number, sy: number): [number, number] {
  const [wx, wy] = renderer.screenToWorld(sx, sy);
  return [Math.floor(wx / TILE), Math.floor(wy / TILE)];
}

function agentAt(sx: number, sy: number): Agent | undefined {
  const [wx, wy] = renderer.screenToWorld(sx, sy);
  return [...director.agents].sort((a, b) => b.y - a.y).find((a) => a.alpha > 0.5 && a.hitTest(wx, wy));
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/** Two-finger pinch on touch screens: zooms with the fingers (snapping to zoom levels) and pans with their midpoint. */
const touches = new Map<number, [number, number]>();
let pinch: { dist: number; zoom: number; x: number; y: number } | null = null;

function pinchSpan(): [number, number, number] {
  const [a, b] = [...touches.values()];
  return [Math.hypot(a[0] - b[0], a[1] - b[1]), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2) {
      const [dist, x, y] = pinchSpan();
      pinch = { dist, zoom: renderer.camera.zoom, x, y };
      drag = null;
      return;
    }
  }
  const pan = !editor.active || e.button !== 0 || spaceHeld;
  drag = { x: e.clientX, y: e.clientY, camX: renderer.camera.x, camY: renderer.camera.y, moved: false, pan, id: e.pointerId };
  if (!pan) {
    editor.pointerDown(...tileAt(e.clientX, e.clientY));
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) {
    touches.set(e.pointerId, [e.clientX, e.clientY]);
  }
  if (pinch && touches.size === 2) {
    const [dist, x, y] = pinchSpan();
    panel.follow = false;
    renderer.camera.x -= (x - pinch.x) / renderer.cssScale;
    renderer.camera.y -= (y - pinch.y) / renderer.cssScale;
    pinch.x = x;
    pinch.y = y;
    renderer.zoomTo(x, y, (pinch.zoom * dist) / pinch.dist);
    return;
  }
  if (editor.active) {
    editor.pointerMove(...tileAt(e.clientX, e.clientY));
  } else {
    renderer.hovered = agentAt(e.clientX, e.clientY) ?? null;
    canvas.style.cursor = renderer.hovered ? 'pointer' : drag ? 'grabbing' : 'grab';
  }
  if (!drag || drag.id !== e.pointerId) {
    return;
  }
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) {
    drag.moved = true;
  }
  if (drag.pan && drag.moved) {
    panel.follow = false;
    renderer.camera.x = drag.camX - dx / renderer.cssScale;
    renderer.camera.y = drag.camY - dy / renderer.cssScale;
  }
});

function endTouch(e: PointerEvent): void {
  touches.delete(e.pointerId);
  if (touches.size < 2) {
    pinch = null;
  }
}
canvas.addEventListener('pointercancel', (e) => {
  endTouch(e);
  drag = null;
});

canvas.addEventListener('pointerup', (e) => {
  endTouch(e);
  if (!drag || drag.id !== e.pointerId) {
    return;
  }
  if (!drag.pan) {
    editor.pointerUp();
  } else if (!drag.moved && !editor.active && e.button === 0) {
    const a = agentAt(e.clientX, e.clientY);
    if (a) {
      selectAgent(a);
    } else if (panel.agent) {
      panel.close();
    }
  }
  drag = null;
});

canvas.addEventListener('pointerleave', () => {
  renderer.hovered = null;
  editor.leave();
});

/** Wheel distance per zoom level: one mouse notch, or a short trackpad pinch/scroll. */
const WHEEL_STEP = 60;
let wheel = 0;
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    wheel += e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 33 : e.deltaY;
    if (Math.abs(wheel) >= WHEEL_STEP) {
      renderer.zoomAt(e.clientX, e.clientY, wheel < 0 ? 1 : -1);
      wheel = 0;
    }
  },
  { passive: false },
);

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) {
    return;
  }
  keys.add(e.key.toLowerCase());
  switch (e.key) {
    case ' ':
      spaceHeld = true;
      e.preventDefault();
      break;
    case 'e':
    case 'E':
      setEditMode(!editor.active);
      break;
    case 'r':
    case 'R':
      if (editor.active) {
        editor.rotate();
      }
      break;
    case 'Delete':
    case 'Backspace':
      if (editor.active) {
        editor.deleteSelected();
      }
      break;
    case 'v':
    case 'V':
      if (editor.active) {
        editor.setTool('select');
      }
      break;
    case 'Escape':
      if (editor.active) {
        editor.cancel();
      } else if (panel.agent) {
        panel.close();
      } else {
        help.hidden = true;
      }
      break;
    case '+':
    case '=':
      renderer.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1);
      break;
    case '-':
      renderer.zoomAt(window.innerWidth / 2, window.innerHeight / 2, -1);
      break;
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  if (e.key === ' ') {
    spaceHeld = false;
  }
});
window.addEventListener('blur', () => keys.clear());

function panWithKeys(dt: number): void {
  const speed = (900 / renderer.cssScale) * dt;
  let dx = 0;
  let dy = 0;
  if (keys.has('a') || keys.has('arrowleft')) {
    dx -= speed;
  }
  if (keys.has('d') || keys.has('arrowright')) {
    dx += speed;
  }
  if (keys.has('w') || keys.has('arrowup')) {
    dy -= speed;
  }
  if (keys.has('s') || keys.has('arrowdown')) {
    dy += speed;
  }
  if (dx || dy) {
    panel.follow = false;
    renderer.camera.x += dx;
    renderer.camera.y += dy;
  }
}

function clampCamera(): void {
  const cam = renderer.camera;
  cam.x = Math.max(0, Math.min(office.w * TILE, cam.x));
  cam.y = Math.max(0, Math.min(office.h * TILE, cam.y));
}

// ---------- loop ----------

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  director.update(dt);
  panWithKeys(dt);
  if (panel.follow && panel.agent) {
    const cam = renderer.camera;
    cam.x += (panel.agent.x - cam.x) * Math.min(1, dt * 4);
    cam.y += (panel.agent.y - 24 - cam.y) * Math.min(1, dt * 4);
  }
  if (renderer.selected && !director.agents.includes(renderer.selected)) {
    panel.close();
  }
  clampCamera();
  panel.tick(dt);
  renderer.render(office, director.agents, director.cars, editor.overlay);
  roster.update(director.agents, renderer.selected);
  updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((e) => console.warn('service worker not registered', e));
}
