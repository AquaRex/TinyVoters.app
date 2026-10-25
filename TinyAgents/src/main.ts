import './style.css';
import './art';
import './features';
import { app, Floor } from './app';
import { STOREY_H, TILE } from './config';
import { Agent } from './agents/agent';
import { OfficeStatus, visitToken, watchOffice } from './cloud/api';
import { SKY_COLORS } from './render/lighting';
import { Renderer } from './render/renderer';
import { AgentPanel } from './ui/agentPanel';
import { ConnectDialog } from './ui/connect';
import { Editor } from './ui/editor';
import { FloorSwitch } from './ui/floorSwitch';
import { Roster } from './ui/roster';
import { initAmbient } from './ui/ambient';
import { initMusic } from './ui/music';
import { initNotify } from './ui/notify';
import { initOfficeSound } from './ui/officeSound';
import { initReplay } from './ui/replay';
import { initReport, openBoardAt } from './ui/report';
import { openSignAt } from './features/plaques';
import { ux } from './ui/prefs';
import { initSettings } from './ui/settings';
import { initMindChip } from './ui/mindChip';
import { toggleRain, Weather, weather } from './world/calendar';
import { addFloor, floorOf, initFloors, removeBlocker, removeFloor, resetBuilding, routeInfos } from './world/floors';

const PREFS_KEY = 'tiny-agents.prefs.v2';
const prefs: { demo: boolean; clock: boolean; hour: number } = (() => {
  const defaults = { demo: true, clock: true, hour: 13 };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
})();

const canvas = document.getElementById('world') as HTMLCanvasElement;
const renderer = new Renderer<Agent>(canvas);
app.renderer = renderer;
initFloors((f) => {
  f.director.clock = () => renderer.lighting.hour;
});
/** The floor on screen: the picked level of the live building, or of a temporary one (the replay). */
const shown = (): Floor => app.shown;
renderer.liftOpen = (uid) => shown().director.liftOpen(uid);
if (import.meta.env.DEV) {
  Object.assign(window, { tiny: { app, renderer, director: () => shown().director, editor: () => editor } });
}
/** Edits the visible floor of the live building. */
const editor = new Editor(() => app.current.office, renderer, toast, resetBuilding);
const floorSwitch = new FloorSwitch(showFloor, () => showFloor(addFloor()), (f) => {
  const why = removeBlocker(f);
  if (why) {
    toast(why);
  } else if (confirm(`Remove ${f.label}? Everything on it is lost.`)) {
    removeFloor(f);
  }
});
const panel = new AgentPanel(() => (renderer.selected = null));
const roster = new Roster(selectAgent, matchMedia('(pointer: coarse)').matches || window.innerWidth < 700);

renderer.resize();
renderer.camera.x = (shown().office.w * TILE) / 2;
renderer.camera.y = (shown().office.h * TILE) / 2;
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
  if (on && visitToken) {
    return;
  }
  editor.setActive(on);
  document.body.classList.toggle('editing', on);
  modeBtn.textContent = on ? 'Done editing' : 'Edit office';
  modeBtn.classList.toggle('on', on);
  if (on) {
    panel.close();
  }
}
modeBtn.addEventListener('click', () => setEditMode(!editor.active));
modeBtn.hidden = !!visitToken;

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
  app.building.staff.setDemo(on);
}
demoBtn.addEventListener('click', () => {
  setDemo(!prefs.demo);
  savePrefs();
});
setDemo(prefs.demo);

const timeBtn = document.getElementById('timeBtn') as HTMLButtonElement;
const timeCtl = timeBtn.parentElement!;
const timeBar = document.querySelector<HTMLElement>('#timeSlider .time-bar')!;
const timeDot = timeBar.querySelector<HTMLElement>('.time-dot')!;
const clock = renderer.lighting.clock;
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
timeBar.style.background = `linear-gradient(to right, ${SKY_COLORS.map(([h, c]) => `${c} ${(h / 24) * 100}%`).join(', ')})`;
/** Real time ("Clock"), or the game clock running on from the hour picked on the bar. */
function setClock(on: boolean): void {
  prefs.clock = on;
  clock.set(on ? null : prefs.hour);
  timeBtn.classList.toggle('on', on);
  timeCtl.classList.toggle('manual', !on);
}
/** Snaps the game clock to the hour under the pointer (quarter hours); it runs on from there. */
function pickTime(e: PointerEvent): void {
  const r = timeBar.getBoundingClientRect();
  prefs.hour = Math.min(23.75, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * 96) / 4));
  setClock(false);
}
timeBtn.addEventListener('click', () => {
  prefs.hour = clock.hour;
  setClock(!prefs.clock);
  savePrefs();
});
timeBar.addEventListener('pointerdown', (e) => {
  timeBar.setPointerCapture(e.pointerId);
  timeCtl.classList.add('dragging');
  pickTime(e);
});
timeBar.addEventListener('pointermove', (e) => timeBar.hasPointerCapture(e.pointerId) && pickTime(e));
timeBar.addEventListener('pointerup', () => {
  timeCtl.classList.remove('dragging');
  savePrefs();
});
timeBar.addEventListener('keydown', (e) => {
  const step = e.key === 'ArrowRight' ? 0.25 : e.key === 'ArrowLeft' ? -0.25 : 0;
  if (step) {
    prefs.hour = (Math.round(clock.hour * 4) / 4 + step + 24) % 24;
    setClock(false);
    savePrefs();
  }
});
clock.setSpeed(ux.timeSpeed);
app.timeSpeed = (speed) => {
  clock.setSpeed(speed);
  if (prefs.clock && speed !== 1) {
    prefs.hour = clock.hour;
    setClock(false);
    savePrefs();
  }
};
setClock(prefs.clock);
// the running game clock picks up where it was after a reload
window.setInterval(() => {
  if (!prefs.clock) {
    prefs.hour = clock.hour;
    savePrefs();
  }
}, 5000);

/** The clock button and bar follow the running time: the button shows it, the dot moves along the day. */
function updateClock(): void {
  const h = clock.hour;
  timeBtn.textContent = prefs.clock ? 'Clock' : hhmm(h);
  timeDot.style.left = `${(h / 24) * 100}%`;
  timeBar.setAttribute('aria-valuenow', h.toFixed(2));
  timeBar.setAttribute('aria-valuetext', hhmm(h));
}

const weatherBtn = document.getElementById('weatherBtn') as HTMLButtonElement;
const WEATHER_GLYPH: Record<Weather, string> = { clear: '☀︎', rain: '☂︎', snow: '❄︎' };
weatherBtn.addEventListener('click', toggleRain);
document.getElementById('helpBtn')!.addEventListener('click', () => (help.hidden = !help.hidden));
document.getElementById('zoomIn')!.addEventListener('click', () => renderer.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1));
document.getElementById('zoomOut')!.addEventListener('click', () => renderer.zoomAt(window.innerWidth / 2, window.innerHeight / 2, -1));
help.querySelector('.close')!.addEventListener('click', () => (help.hidden = true));

function updateHud(): void {
  const present = app.agents.filter((a) => !a.leaving);
  const working = present.filter((a) => a.info.busy).length;
  const claude = present.filter((a) => a.claude).length;
  const labels: Record<OfficeStatus, string> = {
    online: visitToken
      ? `Visiting · ${claude} agent${claude === 1 ? '' : 's'}`
      : `Live · ${claude} Claude agent${claude === 1 ? '' : 's'} · ${working} working`,
    connecting: 'Connecting…',
    offline: 'Office offline: retrying…',
    unpaired: 'Demo office · Connect Claude',
  };
  officePill.textContent = labels[officeStatus];
  officePill.dataset.state = officeStatus;
  const w = weather();
  weatherBtn.textContent = WEATHER_GLYPH[w];
  weatherBtn.classList.toggle('on', w !== 'clear');
  emptyHint.hidden = !(officeStatus === 'online' && claude === 0) || editor.active || prefs.demo || !!visitToken;
}

let toastTimer = 0;
function toast(msg: string): void {
  const el = document.getElementById('toast')!;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 1800);
}

/** Switches the view to another floor; the camera stays put (every floor shares the map's coordinates). */
function showFloor(f: Floor): void {
  const live = app.floors.find((x) => x.level === f.level) ?? app.floors[0];
  if (live === app.current) {
    return;
  }
  app.current = live;
  if (renderer.selected && renderer.selected.floor !== shown().director) {
    panel.close();
  }
  renderer.hovered = null;
}

function selectAgent(a: Agent): void {
  if (editor.active) {
    setEditMode(false);
  }
  const floor = floorOf(a);
  if (floor && !seenFrom(shown(), a)) {
    showFloor(floor);
  }
  renderer.selected = a;
  panel.open(a);
  renderer.camera.x = a.x;
  renderer.camera.y = a.y - 24 - lifted(floor ?? shown());
}
app.toast = toast;
app.selectAgent = selectAgent;

watchOffice(
  (agents) => routeInfos(agents),
  (s) => (officeStatus = s),
);
initNotify();
initOfficeSound();
initMusic();
initReplay();
initReport();
initSettings();
initMindChip();
initAmbient();

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
  const floor = shown();
  const here = [...floor.director.agents].sort((a, b) => b.y - a.y).find((a) => a.alpha > 0.5 && a.hitTest(wx, wy));
  if (here) {
    return here;
  }
  for (const f of app.tower.floors.filter((g) => g.level < floor.level).reverse()) {
    const dy = lifted(f) - lifted(floor);
    const hit = [...f.director.agents].sort((a, b) => b.y - a.y).find((a) => a.alpha > 0.5 && seenFrom(floor, a) && a.hitTest(wx, wy + dy));
    if (hit) {
      return hit;
    }
  }
  return undefined;
}

/** Someone on a lower floor shows on `floor` where they're outdoors and the storey above doesn't cover them. */
function seenFrom(floor: Floor, a: Agent): boolean {
  const own = floorOf(a);
  if (!own || own === floor) {
    return own === floor;
  }
  const above = Math.round((lifted(floor) - lifted(own)) / TILE);
  return own.level < floor.level && own.office.isOutdoor(a.tx, a.ty) && !floor.office.floorAt(a.tx, a.ty + above) && !floor.office.wallAt(a.tx, a.ty + above);
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
    panned = true;
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
    panned = true;
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
    } else if (openBoardAt(...renderer.screenToWorld(e.clientX, e.clientY))) {
      panel.close();
    } else if (!visitToken && openSignAt(...renderer.screenToWorld(e.clientX, e.clientY), e.clientX, e.clientY)) {
      panel.close();
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
    panned = true;
    renderer.camera.x += dx;
    renderer.camera.y += dy;
  }
}

/** The camera was moved by hand this frame (drag, keys or a two-finger pan; zooming alone doesn't count). */
let panned = false;
/** Panning the followed person further than this share of the screen's shorter side from the centre lets go of them. */
const FOLLOW_BREAK = 0.35;

/**
 * Keeps the followed person in view (window open or not). A short pan just pauses it and the view glides back;
 * panning them far off the centre stops following.
 */
function follow(dt: number, floor: Floor): void {
  const a = panel.following;
  if (!a || a.gone) {
    panel.following = null;
    panned = false;
    return;
  }
  const cam = renderer.camera;
  const x = a.x;
  const y = a.y - 24 - lifted(floorOf(a) ?? floor);
  if (panned || (drag?.pan && drag.moved) || pinch) {
    panned = false;
    if (Math.hypot(x - cam.x, y - cam.y) * renderer.cssScale > Math.min(window.innerWidth, window.innerHeight) * FOLLOW_BREAK) {
      panel.following = null;
      panel.refresh();
    }
    return;
  }
  cam.x += (x - cam.x) * Math.min(1, dt * 4);
  cam.y += (y - cam.y) * Math.min(1, dt * 4);
}

function clampCamera(): void {
  const cam = renderer.camera;
  const { office } = shown();
  cam.x = Math.max(0, Math.min(office.w * TILE, cam.x));
  cam.y = Math.max(0, Math.min(office.h * TILE, cam.y));
}

/** How far up a storey is drawn (camera coordinates stay those of the ground, so the street never jumps). */
function lifted(f: Floor): number {
  return f.level * STOREY_H;
}

/** A followed person who takes the lift or the stairs takes the view along to their new floor. */
function followSelected(): void {
  const a = panel.following;
  const at = a && !a.gone ? floorOf(a) : undefined;
  if (a && at && at !== shown() && !seenFrom(shown(), a) && !app.override && !editor.active) {
    showFloor(at);
  }
}

// ---------- loop ----------

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  app.building.staff.update(dt);
  for (const f of app.floors) {
    f.director.update(dt);
  }
  followSelected();
  const floor = shown();
  panWithKeys(dt);
  follow(dt, floor);
  if (renderer.selected && renderer.selected.floor !== floor.director && !seenFrom(floor, renderer.selected)) {
    panel.close();
  }
  clampCamera();
  panel.tick(dt);
  const under = app.tower.floors
    .filter((f) => f.level < floor.level)
    .map((f) => ({ lift: lifted(f), office: f.office, agents: f.director.agents, cars: f.director.cars, layers: f.director.extensions, liftOpen: (uid: number) => f.director.liftOpen(uid) }));
  renderer.lift = lifted(floor);
  renderer.render(floor.office, floor.director.agents, floor.director.cars, editor.overlay, floor.director.extensions, under);
  roster.update(app.agents, renderer.selected);
  floorSwitch.update();
  updateHud();
  updateClock();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// in dev too, so phone alerts can be tried on localhost (the worker caches nothing there). A changed worker is
// picked up on this very load (never from the HTTP cache), so an outdated one can't keep serving old files.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
    .then((reg) => reg.update())
    .catch((e) => console.warn('service worker not registered', e));
}
