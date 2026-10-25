import { type Floor, app } from '../app';
import type { Agent } from '../agents/agent';
import { LIFT_ARRIVE } from '../art/structure';
import { TILE } from '../config';
import { openSky } from '../features/weather';
import { weather } from '../world/calendar';
import { type Recordings, loadRecordings } from './recordings';
import { type OfficeSamples, bakeSamples } from './officeSamples';
import { ux } from './prefs';
import { audio, channel, playCue } from './sound';

const TICK = 0.05;
/** Typing: seconds between keys within a word, how long words are, and how often a typist stops to think. */
const KEY_GAP = [0.09, 0.18];
const word = () => 2 + Math.floor(Math.random() * 7);
const THINK_CHANCE = 0.15;
/** Only the nearest few typists are heard. */
const MAX_TYPISTS = 4;
/** Mouse moments (click, double click or scroll) per second for one person working at a desk. */
const MOUSE_PER_WORKER = 1 / 3;
const REMIND_AFTER = 60;
const MAX_VOICES = 24;
/** Peak gains on the effects bus at full earshot. */
const KEY = 0.02;
export const LEVEL = { key: KEY * 0.6, click: KEY * 0.5, scroll: KEY * 0.3, print: KEY * 0.6, shred: KEY * 0.55, hum: KEY * 0.35, ding: KEY * 0.7, door: KEY * 0.45, rain: KEY * 1.2, rainIndoors: KEY * 1 };
/** The lift doors close a touch slower and lower than they open. */
const DOOR_CLOSING_RATE = 0.94;
/** Rain heard from inside plays a little lower (about two semitones), duller through the roof. */
const RAIN_INDOORS_PITCH = 0.89;
/** Sounds that would play below this (a keyboard clack at 2% earshot) are skipped. */
const QUIETEST = KEY * 0.02;

/** Shorter side of the view, in world px, at or below which sounds play at full level. */
const CLOSE_SPAN = 500;
const MIN_RADIUS = 192;

/** The listener: the camera centre on the shown floor and how much of the world the view spans. */
export interface Ear {
  x: number;
  y: number;
  /** world px across the shorter side of the view */
  span: number;
  /** world px from the centre to the left or right edge */
  halfW: number;
}

/** Loudness 0..1 of a sound at world (x, y): full near the camera centre when zoomed in, fading with distance and as the view widens. */
export function earshot(e: Ear, x: number, y: number): number {
  const zoom = Math.min(1, (CLOSE_SPAN / e.span) ** 3);
  const r = Math.max(MIN_RADIUS, e.span * 0.45);
  return zoom / (1 + ((x - e.x) ** 2 + (y - e.y) ** 2) / (r * r));
}

export function panOf(e: Ear, x: number): number {
  return Math.max(-1, Math.min(1, (x - e.x) / e.halfW)) * 0.6;
}

function ear(): Ear {
  const r = app.renderer;
  const [x, y] = r.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
  const s = r.cssScale;
  return { x, y, span: Math.min(window.innerWidth, window.innerHeight) / s, halfW: window.innerWidth / 2 / s };
}

const PANS = [-0.6, -0.3, 0, 0.3, 0.6];
const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/** Positional office sounds on the shown floor: baked buffers replayed through a few fixed pan buses, plus the lift hum loop. */
export class OfficeAmbience {
  private buffers = new Map<Float32Array, AudioBuffer>();
  private buses: StereoPannerNode[];
  private active = 0;
  private humGain: GainNode;
  private humPan: StereoPannerNode;
  private rainOut: GainNode;
  private rainIn: GainNode;
  private spotNext = new Map<string, number>();
  /** each typist's next key time and the keys left in the word they're typing */
  private typing = new WeakMap<Agent, { next: number; left: number }>();
  /** the recorded keyboard, mouse and lift door sounds, once loaded */
  recorded: Recordings | null = null;
  private lifts = new Map<number, { open: number; dir: number }>();
  private floor: Floor | null = null;
  private ear!: Ear;

  constructor(
    private ctx: AudioContext,
    out: AudioNode,
    weatherOut: AudioNode,
    private baked: OfficeSamples,
  ) {
    this.buses = PANS.map((p) => {
      const pan = ctx.createStereoPanner();
      pan.pan.value = p;
      pan.connect(out);
      return pan;
    });
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humPan = ctx.createStereoPanner();
    const hum = ctx.createBufferSource();
    hum.buffer = this.buffer(baked.hum);
    hum.loop = true;
    hum.connect(this.humGain).connect(this.humPan).connect(out);
    hum.start();
    this.rainOut = this.loop(baked.rain, weatherOut);
    this.rainIn = this.loop(baked.rainIndoors, weatherOut, RAIN_INDOORS_PITCH);
  }

  /** A sample looping from now on (played at `rate`, which also shifts its pitch), silent until its gain is raised. */
  private loop(d: Float32Array, out: AudioNode, rate = 1): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer(d);
    src.loop = true;
    src.playbackRate.value = rate;
    src.connect(gain).connect(out);
    src.start();
    return gain;
  }

  private buffer(d: Float32Array): AudioBuffer {
    let buf = this.buffers.get(d);
    if (!buf) {
      buf = this.ctx.createBuffer(1, d.length, this.ctx.sampleRate);
      buf.getChannelData(0).set(d);
      this.buffers.set(d, buf);
    }
    return buf;
  }

  /** Plays a sample `at` seconds from now, from world (x, y), at playback `rate`. */
  private emit(d: Float32Array, at: number, level: number, x: number, y: number, rate = 1): void {
    const gain = level * earshot(this.ear, x, y);
    if (gain < QUIETEST || this.active >= MAX_VOICES) {
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer(d);
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const bus = Math.round((panOf(this.ear, x) - PANS[0]) / (PANS[1] - PANS[0]));
    src.connect(g).connect(this.buses[bus]);
    src.start(this.ctx.currentTime + at);
    this.active++;
    src.onended = () => {
      this.active--;
      g.disconnect();
    };
  }

  silence(): void {
    this.humGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    this.rainOut.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    this.rainIn.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    this.floor = null;
  }

  tick(floor: Floor, e: Ear, now: number): void {
    if (floor !== this.floor) {
      this.floor = floor;
      this.spotNext.clear();
      this.lifts.clear();
    }
    this.ear = e;
    const people = floor.director.agents.filter((a) => !a.hidden);
    this.desks(people, now);
    this.spots(floor, people, now);
    this.lift(floor);
    this.rain(floor);
  }

  /** Rain: the roof-and-window loop while the view is inside the building, the open hiss outdoors, crossfaded. */
  private rain(floor: Floor): void {
    const t = this.ctx.currentTime;
    const tx = Math.floor(this.ear.x / TILE);
    const ty = Math.floor(this.ear.y / TILE);
    const office = floor.office;
    const out = !office.inBounds(tx, ty) || openSky(office, tx, ty);
    const wet = weather() === 'rain';
    this.rainOut.gain.setTargetAtTime(wet && out ? LEVEL.rain : 0, t, 0.8);
    this.rainIn.gain.setTargetAtTime(wet && !out ? LEVEL.rainIndoors : 0, t, 0.8);
  }

  private desks(people: Agent[], now: number): void {
    if (!this.recorded) {
      return;
    }
    const { keys, click, scrolls } = this.recorded;
    const typists = people.filter((a) => a.seated && a.act === 'type').sort((p, q) => earshot(this.ear, q.x, q.y) - earshot(this.ear, p.x, p.y));
    for (const a of typists.slice(0, MAX_TYPISTS)) {
      let s = this.typing.get(a);
      if (!s || s.next < now - 0.5) {
        s = { next: now + Math.random() * 0.4, left: word() };
        this.typing.set(a, s);
      }
      while (s.next < now + TICK) {
        const at = Math.max(0, s.next - now);
        if (s.left > 0) {
          this.emit(pick(keys), at, LEVEL.key * (0.7 + Math.random() * 0.4), a.x, a.y);
          s.left--;
          s.next += KEY_GAP[0] + Math.random() * (KEY_GAP[1] - KEY_GAP[0]);
        } else {
          this.emit(pick(keys), at, LEVEL.key * 1.1, a.x, a.y);
          s.left = word();
          s.next += Math.random() < THINK_CHANCE ? 1 + Math.random() * 2 : 0.15 + Math.random() * 0.3;
        }
      }
    }
    for (const a of people) {
      if (!a.seated || (a.act !== 'type' && a.task?.kind !== 'work') || Math.random() >= MOUSE_PER_WORKER * TICK) {
        continue;
      }
      const at = Math.random() * TICK;
      const r = Math.random();
      if (r < 0.75) {
        this.emit(click, at, LEVEL.click, a.x, a.y);
        if (r >= 0.55) {
          this.emit(click, at + 0.16, LEVEL.click, a.x, a.y);
        }
      } else {
        this.emit(pick(scrolls), at, LEVEL.scroll, a.x, a.y);
      }
    }
  }

  /** The printer and the shredder, repeating while someone stands at their spot. */
  private spots(floor: Floor, people: Agent[], now: number): void {
    const kinds = [
      { activity: 'print', sample: this.baked.print, level: LEVEL.print, every: 2.2 },
      { activity: 'shred', sample: this.baked.shred, level: LEVEL.shred, every: 1.6 },
    ] as const;
    for (const k of kinds) {
      for (const s of floor.office.spotsFor(k.activity)) {
        const used = people.some((a) => !a.moving && Math.floor(a.x / TILE) === s.x && Math.floor(a.y / TILE) === s.y);
        if (!used) {
          this.spotNext.delete(s.key);
          continue;
        }
        const next = this.spotNext.get(s.key) ?? now + 0.4;
        if (now >= next) {
          this.emit(k.sample, 0, k.level, (s.x + 0.5) * TILE, (s.y + 0.5) * TILE);
          this.spotNext.set(s.key, now + k.every + Math.random() * 0.8);
        } else {
          this.spotNext.set(s.key, next);
        }
      }
    }
  }

  /** Hum while a cab moves, a ding when it arrives, a slide whenever the doors start to open or close. */
  private lift(floor: Floor): void {
    let hum = 0;
    let pan = 0;
    const seen = new Set<number>();
    for (const s of floor.office.spotsFor('elevator')) {
      const uid = s.item.uid;
      if (seen.has(uid)) {
        continue;
      }
      seen.add(uid);
      const open = floor.director.liftOpen(uid);
      const was = this.lifts.get(uid) ?? { open, dir: 0 };
      const x = (s.x + 0.5) * TILE;
      const y = (s.y + 0.5) * TILE;
      if (open !== was.open && Math.min(open, was.open) < LIFT_ARRIVE && LEVEL.hum * earshot(this.ear, x, y) > hum) {
        hum = LEVEL.hum * earshot(this.ear, x, y);
        pan = panOf(this.ear, x);
      }
      if (was.open < LIFT_ARRIVE && open >= LIFT_ARRIVE) {
        this.emit(this.baked.ding, 0, LEVEL.ding, x, y);
      }
      const dir = open > LIFT_ARRIVE || was.open > LIFT_ARRIVE ? Math.sign(open - was.open) : 0;
      if (dir !== 0 && dir !== was.dir && this.recorded) {
        this.emit(this.recorded.door, dir > 0 ? 0.25 : 0, LEVEL.door, x, y, dir > 0 ? 1 : DOOR_CLOSING_RATE);
      }
      this.lifts.set(uid, { open, dir });
    }
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(hum < QUIETEST ? 0 : hum, t, 0.15);
    this.humPan.pan.setTargetAtTime(pan, t, 0.15);
  }
}

/**
 * Background sound heard from the camera: keyboard clacks and mouse clicks at desks, the printer, the shredder and
 * the elevator on the visible floor (office channel), rain (weather channel), plus a reminder chime every minute
 * someone has been waiting for permission.
 */
export function initOfficeSound(): void {
  const waitingSince = new Map<Agent, number>();
  let lastRemind = 0;
  let ambience: OfficeAmbience | null = null;
  window.setInterval(() => {
    const now = performance.now() / 1000;
    const floor = app.shown;
    for (const a of app.agents.concat(floor?.director.agents ?? [])) {
      if (!a.info.waiting) {
        waitingSince.delete(a);
      } else if (!waitingSince.has(a)) {
        waitingSince.set(a, now);
      }
    }
    for (const a of waitingSince.keys()) {
      if (a.gone) {
        waitingSince.delete(a);
      }
    }
    const ctx = audio();
    if (!ctx || document.hidden || !floor) {
      ambience?.silence();
      return;
    }
    const overdue = [...waitingSince.entries()].some(([a, since]) => now - since > REMIND_AFTER && (!a.demo || floor.director.agents.includes(a)));
    if (overdue && now - lastRemind > REMIND_AFTER) {
      lastRemind = now;
      playCue('permission');
    }
    if (!ux.office && !ux.weather) {
      ambience?.silence();
      return;
    }
    if (!ambience) {
      const made = new OfficeAmbience(ctx, channel('office')!, channel('weather')!, bakeSamples(ctx.sampleRate));
      ambience = made;
      void loadRecordings(ctx).then((recorded) => (made.recorded = recorded));
    }
    ambience.tick(floor, ear(), now);
  }, TICK * 1000);
}
