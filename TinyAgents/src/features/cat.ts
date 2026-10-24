import { TILE } from '../config';
import type { Agent } from '../agents/agent';
import { Director, registerExtension } from '../agents/director';
import type { Tile } from '../agents/nav';
import { restore } from '../agents/needs';
import { CatPose, catFrame } from '../art/officeLife';
import { mirrorX, steel } from '../art/kit';
import { DIR_STEP, Office } from '../world/office';
import { Walker, drawZ, itemsWith, randomIndoor } from './shared';

type Mood = 'wander' | 'nap' | 'desk' | 'follow';

interface Plan {
  mood: Mood;
  /** where to settle (tile) and the pixel offset of the settled pose */
  tile: Tile;
  ox: number;
  oy: number;
  /** depth key override while settled (on a desk) */
  key?: number;
  pose: CatPose;
  seconds: number;
  /** who the plan is about (the waiting person, the lonely one) */
  who?: Agent;
}

const FOOT: Record<CatPose, [number, number]> = { walk: [8, 11], sit: [6, 13], sleep: [7, 8] };
const mirrored = new Map<HTMLCanvasElement, HTMLCanvasElement>();

function frameFor(pose: CatPose, frame: number, right: boolean): HTMLCanvasElement {
  const img = catFrame(pose, frame);
  if (!right) {
    return img;
  }
  let m = mirrored.get(img);
  if (!m) {
    m = mirrorX(img);
    mirrored.set(img, m);
  }
  return m;
}

/**
 * The office cat, one per floor: wanders the indoor tiles, naps (zzz) on rugs, sofas or the empty desk chair of
 * someone on a break, sits on the desk of whoever is waiting for your permission, and now and then keeps the
 * loneliest person company.
 */
class Cat {
  w = new Walker(38);
  plan: Plan | null = null;
  settled = false;
  hop = 0;
  t = 0;
  wait = 2;
  private placed = false;

  constructor(private d: Director) {}

  private get office(): Office {
    return this.d.office;
  }

  update(dt: number): void {
    this.t += dt;
    if (!this.placed) {
      const start = randomIndoor(this.d, this.d.rand);
      if (!start) {
        return;
      }
      this.w.place(start[0], start[1]);
      this.placed = true;
    }
    if (!this.d.nav.walkable(this.w.tx, this.w.ty)) {
      const [x, y] = this.office.nearestWalkable(this.w.tx, this.w.ty);
      this.w.place(x, y);
      this.plan = null;
    }
    const plan = this.plan;
    if (!plan) {
      if ((this.wait -= dt) <= 0) {
        this.choose();
      }
      return;
    }
    if (!this.settled) {
      if (plan.mood === 'follow' && plan.who && Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2)) {
        const next = this.besides(plan.who);
        if (next && (next[0] !== plan.tile[0] || next[1] !== plan.tile[1])) {
          plan.tile = next;
          this.w.goTo(this.d, next[0], next[1]);
        }
      }
      if (this.w.update(dt)) {
        this.settled = true;
        this.hop = 0;
        if (plan.mood === 'follow' && plan.who && !plan.who.bubble && this.d.rand() < 0.6) {
          plan.who.say(this.d.rand() < 0.5 ? 'hi kitty!' : 'aww', 2);
          restore(plan.who.needs, { social: 0.1, comfort: 0.1 }, 1);
        }
      }
      return;
    }
    this.hop = Math.min(1, this.hop + dt * 4);
    plan.seconds -= dt;
    const done =
      plan.seconds <= 0 ||
      (plan.mood === 'desk' && (!plan.who || !plan.who.info.waiting || plan.who.gone)) ||
      (plan.mood === 'follow' && (!plan.who || plan.who.gone || plan.who.hidden || plan.who.tilesTo(this.w) > 2.5)) ||
      (plan.mood === 'nap' && plan.oy !== 0 && this.d.agents.some((a) => a.seated && a.tx === plan.tile[0] && a.ty === plan.tile[1]));
    if (done) {
      this.plan = null;
      this.settled = false;
      this.wait = 1 + this.d.rand() * 4;
    }
  }

  private choose(): void {
    const r = this.d.rand();
    const plan = (this.d.agents.some((a) => a.info.waiting) && r < 0.8 ? this.deskPlan() : null) ??
      (r < 0.45 ? this.napPlan() : r < 0.65 ? this.followPlan() : null) ??
      this.wanderPlan();
    if (!plan || !this.w.goTo(this.d, plan.tile[0], plan.tile[1])) {
      this.wait = 2;
      return;
    }
    this.plan = plan;
    this.settled = false;
  }

  private wanderPlan(): Plan | null {
    const t = randomIndoor(this.d, this.d.rand);
    return t && { mood: 'wander', tile: t, ox: 0, oy: 0, pose: 'sit', seconds: 3 + this.d.rand() * 6 };
  }

  /** On the desk of someone waiting for permission, next to their monitor. */
  private deskPlan(): Plan | null {
    for (const a of this.d.agents.filter((x) => x.info.waiting && !x.hidden)) {
      const desk = this.d.spotByKey(a.homeDesk);
      if (!desk) {
        continue;
      }
      const [fx, fy] = DIR_STEP[desk.facing];
      const dy = desk.y + fy;
      return {
        mood: 'desk', tile: [desk.x, desk.y], who: a, pose: 'sit', seconds: 120,
        ox: fx * TILE + 7, oy: fy * TILE - 14, key: (dy + 1) * TILE + 0.4,
      };
    }
    return null;
  }

  private napPlan(): Plan | null {
    const d = this.d;
    const office = this.office;
    const options: { tile: Tile; oy: number }[] = [];
    const taken = (x: number, y: number) => d.agents.some((a) => !a.hidden && a.tx === x && a.ty === y);
    for (const rug of itemsWith(office, 'rug')) {
      const v = office.variantOf(rug);
      for (let y = rug.y; v && y < rug.y + v.h; y++) {
        for (let x = rug.x; x < rug.x + v.w; x++) {
          if (d.nav.open(x, y) && !taken(x, y)) {
            options.push({ tile: [x, y], oy: 0 });
          }
        }
      }
    }
    for (const s of office.spots) {
      if (s.pose !== 'sit' || office.isOutdoor(s.x, s.y) || taken(s.x, s.y)) {
        continue;
      }
      const holder = d.reserved.get(s.key);
      const comfy = /^(sofa|armchair)/.test(s.item.type) && !holder;
      const emptyChair = s.activity === 'work' && holder && !holder.info.busy && !holder.info.waiting && !holder.hidden;
      if (comfy || emptyChair) {
        options.push({ tile: [s.x, s.y], oy: -9 });
      }
    }
    const pick = options[Math.floor(d.rand() * options.length)];
    return pick ? { mood: 'nap', tile: pick.tile, ox: 0, oy: pick.oy, pose: 'sleep', seconds: 25 + d.rand() * 40 } : null;
  }

  private followPlan(): Plan | null {
    const lonely = this.d.agents
      .filter((a) => a.arrived && !a.hidden && !a.leaving && !this.office.isOutdoor(a.tx, a.ty))
      .sort((p, q) => p.needs.social - q.needs.social)[0];
    const tile = lonely && this.besides(lonely);
    return tile ? { mood: 'follow', tile, who: lonely, ox: 0, oy: 0, pose: 'sit', seconds: 12 + this.d.rand() * 12 } : null;
  }

  private besides(a: Agent): Tile | null {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = a.tx + dx;
      const y = a.ty + dy;
      if (this.d.nav.open(x, y) && !this.office.isOutdoor(x, y)) {
        return [x, y];
      }
    }
    return null;
  }

  /** Foot point, pose and frame to draw now. */
  view(): { x: number; y: number; key: number; img: HTMLCanvasElement; pose: CatPose } | null {
    if (!this.placed) {
      return null;
    }
    const w = this.w;
    const plan = this.plan;
    const right = w.side === 'right';
    if (!plan || !this.settled) {
      const moving = w.moving;
      const pose: CatPose = moving ? 'walk' : 'sit';
      const frame = moving ? Math.floor(w.dist / 4) : Math.floor(this.t * 1.5) % 6 === 0 ? 1 + (Math.floor(this.t * 6) % 2) : 0;
      return { x: w.x, y: w.y, key: w.y + 0.1, img: frameFor(pose, frame, right), pose };
    }
    const lift = Math.sin(this.hop * Math.PI) * -6;
    const x = w.x + plan.ox * this.hop;
    const y = w.y + plan.oy * this.hop + lift;
    const frame = plan.pose === 'sleep' ? Math.floor(this.t * 0.8) % 2 : Math.floor(this.t * 1.5) % 5 === 0 ? 1 + (Math.floor(this.t * 6) % 2) : 0;
    return { x, y, key: plan.key ?? w.y + 0.2, img: frameFor(plan.pose, frame, right), pose: plan.pose };
  }
}

registerExtension((director) => {
  const cat = new Cat(director);
  return {
    update(dt) {
      cat.update(dt);
    },
    drawables(view, push) {
      const v = cat.view();
      if (!v || v.x < view.x - 16 || v.x > view.x + view.w + 16 || v.y < view.y - 16 || v.y > view.y + view.h + 32) {
        return;
      }
      const [fx, fy] = FOOT[v.pose];
      push(v.key, (ctx) => {
        if (v.pose !== 'sleep' || cat.plan?.oy === 0) {
          ctx.fillStyle = 'rgba(24, 16, 28, 0.22)';
          ctx.fillRect(Math.round(v.x) - 5, Math.round(v.y) - 1, 11, 2);
        }
        ctx.drawImage(v.img, Math.round(v.x) - fx, Math.round(v.y) - fy);
      });
    },
    afterLighting(ctx) {
      const v = cat.view();
      if (!v || v.pose !== 'sleep' || !cat.settled) {
        return;
      }
      for (let i = 0; i < 2; i++) {
        const t = (cat.t * 0.5 + i * 0.5) % 1;
        drawZ(ctx, Math.round(v.x + 4 + t * 6), Math.round(v.y - 10 - t * 12), steel[6]);
      }
    },
  };
});
