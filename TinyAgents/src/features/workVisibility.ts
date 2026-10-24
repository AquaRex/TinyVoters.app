import { Agent, AgentInfo } from '../agents/agent';
import { Director, registerExtension } from '../agents/director';
import { EDIT_TOOLS, labLamps, track } from '../agents/toolPlaces';
import { QA_BULB } from '../art/toolPlaces';
import { cream, mustard, plant, red, sprite, terracotta, walnut, yellow } from '../art/kit';
import { TILE } from '../config';
import { Rect } from '../render/renderer';
import { PlacedItem } from '../world/layout';
import { DIR_STEP } from '../world/office';

// Makes Claude's work visible around the person: their desk fills up over a session (paper stack per edit, a
// crumpled ball per error, empty cups, a trophy after a long turn), folders and notes in hand, the QA bench lamp,
// the reception bell ringing, and a sticky note with the task on the monitor at close zoom.

interface DeskState {
  edits: number;
  balls: number;
  mugs: number;
  hadMug: boolean;
  busySince: number;
  trophyAt: number;
}

const MAX_SHEETS = 10;
const MAX_BALLS = 6;
const MAX_CUPS = 4;
const BALLS: [number, number][] = [[25, 14], [28, 12], [22, 14], [27, 9], [30, 14], [24, 11]];
const CUPS: [number, number][] = [[28, 4], [32, 3], [36, 4], [40, 3]];

/** Sprites are built on first use (the art kit needs the DOM). */
function lazy<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}

const stacks = new Map<number, HTMLCanvasElement>();
function paperStack(n: number): HTMLCanvasElement {
  let c = stacks.get(n);
  if (!c) {
    c = sprite(10, n + 5, (p) => {
      for (let i = 0; i < n; i++) {
        const dx = (i * 7) % 3 === 0 ? 1 : 0;
        p.hline(dx, 4 + i, 9, i % 2 ? cream[4] : cream[5]);
        p.px(dx + 8, 4 + i, cream[3]);
      }
      p.rect(0, 1, 9, 3, cream[6]);
      p.hline(0, 0, 9, cream[4]);
      p.hline(1, 2, 5, cream[3]);
      p.hline(0, n + 4, 10, cream[2]);
    });
    stacks.set(n, c);
  }
  return c;
}

const ball = lazy(() =>
  sprite(5, 4, (p) => {
    p.ellipse(0, 0, 5, 4, cream[5]);
    p.px(1, 1, cream[6]);
    p.px(3, 1, cream[3]);
    p.px(2, 2, cream[3]);
    p.hline(1, 3, 3, cream[2]);
  }),
);

const cup = lazy(() =>
  sprite(4, 5, (p) => {
    p.rect(0, 0, 4, 1, cream[2]);
    p.rect(0, 1, 4, 3, cream[6]);
    p.hline(0, 2, 4, terracotta[3]);
    p.rect(1, 4, 2, 1, cream[4]);
    p.px(3, 1, cream[4]);
    p.px(3, 3, cream[4]);
  }),
);

const trophy = lazy(() =>
  sprite(9, 10, (p) => {
    p.rect(2, 0, 5, 4, yellow[2]);
    p.rect(3, 4, 3, 1, yellow[1]);
    p.px(2, 0, mustard[4]);
    p.px(3, 1, cream[6]);
    p.vline(6, 1, 3, yellow[1]);
    p.px(1, 1, yellow[1]);
    p.px(0, 2, yellow[1]);
    p.px(1, 3, yellow[1]);
    p.px(7, 1, yellow[1]);
    p.px(8, 2, yellow[1]);
    p.px(7, 3, yellow[1]);
    p.rect(4, 5, 1, 2, yellow[1]);
    p.rect(2, 7, 5, 3, walnut[3]);
    p.hline(2, 7, 5, walnut[4]);
    p.hline(3, 8, 3, yellow[2]);
  }),
);

const folder = lazy(() =>
  sprite(8, 7, (p) => {
    p.rect(0, 0, 3, 1, mustard[2]);
    p.rect(0, 1, 8, 6, mustard[3]);
    p.hline(1, 1, 6, cream[6]);
    p.hline(0, 2, 8, mustard[4]);
    p.hline(0, 6, 8, mustard[1]);
    p.vline(7, 2, 4, mustard[2]);
  }),
);

const papers = lazy(() =>
  sprite(12, 8, (p) => {
    p.rect(1, 0, 10, 3, cream[6]);
    p.rect(0, 3, 11, 2, cream[5]);
    p.rect(2, 5, 10, 2, cream[6]);
    p.hline(2, 1, 6, cream[3]);
    p.hline(1, 4, 5, cream[3]);
    p.hline(3, 6, 7, cream[3]);
    p.hline(0, 7, 12, cream[2]);
    p.px(11, 3, cream[3]);
  }),
);

/** Where a held item goes in the 32 x 48 frame per facing (x for a w-wide item), and whether the body hides it. */
function heldAt(a: Agent, w: number, big: boolean): [number, number, boolean] {
  switch (a.dir) {
    case 'down':
      return [big ? 10 : 12, big ? 22 : 25, false];
    case 'up':
      return [big ? 10 : 19, big ? 20 : 23, true];
    case 'left':
      return [big ? 2 : 4, big ? 22 : 24, false];
    case 'right':
      return [32 - (big ? 2 : 4) - w, big ? 22 : 24, false];
  }
}

const LAMP_COLOURS = { pass: [plant[5], plant[6]], fail: [red[1], red[2]], run: [mustard[3], mustard[4]] };

class WorkVisibility {
  private desks = new Map<Agent, DeskState>();

  constructor(private d: Director) {}

  private state(a: Agent): DeskState {
    let s = this.desks.get(a);
    if (!s) {
      s = { edits: Math.round((a.info.toolCalls ?? 0) * 0.3), balls: a.info.errors ?? 0, mugs: 0, hadMug: false, busySince: a.info.busy ? this.d.time : -1, trophyAt: -1 };
      this.desks.set(a, s);
    }
    return s;
  }

  onSpawn(a: Agent): void {
    this.state(a);
  }

  onInfo(a: Agent, was: AgentInfo, now: AgentInfo): void {
    if (a.leaving) {
      return;
    }
    const s = this.state(a);
    const calls = (now.toolCalls ?? 0) - (was.toolCalls ?? 0);
    if (calls > 0 && EDIT_TOOLS.has(now.tool ?? '')) {
      s.edits += calls;
    }
    s.balls += Math.max(0, (now.errors ?? 0) - (was.errors ?? 0));
    if (now.busy && !was.busy) {
      s.busySince = this.d.time;
      s.trophyAt = -1;
    } else if (!now.busy && was.busy && now.state === 'idle' && s.busySince >= 0) {
      if (this.d.time - s.busySince >= (a.claude ? 150 : 90)) {
        s.trophyAt = this.d.time;
      }
      s.busySince = -1;
    }
  }

  onGone(a: Agent): void {
    this.desks.delete(a);
  }

  update(): void {
    for (const a of this.d.agents) {
      if (a.leaving) {
        this.desks.delete(a);
        continue;
      }
      const s = this.desks.get(a);
      if (s) {
        if (s.hadMug && a.mug <= 0) {
          s.mugs++;
        }
        s.hadMug = a.mug > 0;
      }
    }
  }

  /** The horizontal desk in front of someone's desk seat and the left x of their half of it. */
  private desk(a: Agent): { item: PlacedItem; x: number; up: boolean } | null {
    const spot = this.d.spotByKey(a.homeDesk);
    if (!spot || spot.activity !== 'work') {
      return null;
    }
    const [dx, dy] = DIR_STEP[spot.facing];
    const item = this.d.office.itemAt(spot.x + dx, spot.y + dy, 'object');
    if (!item || !item.type.startsWith('desk') || (item.dir !== 'up' && item.dir !== 'down')) {
      return null;
    }
    return { item, x: spot.x * TILE, up: item.dir === 'up' };
  }

  drawables(view: Rect, push: (key: number, draw: (ctx: CanvasRenderingContext2D) => void) => void): void {
    const time = this.d.time;
    for (const [a, s] of this.desks) {
      const desk = this.desk(a);
      if (!desk) {
        continue;
      }
      const ox = desk.x;
      const oy = desk.item.y * TILE;
      if (ox + TILE * 2 < view.x || ox > view.x + view.w || oy + TILE < view.y || oy - TILE > view.y + view.h) {
        continue;
      }
      const sheets = Math.min(MAX_SHEETS, Math.ceil(s.edits / 2));
      const balls = Math.min(MAX_BALLS, s.balls);
      const cups = Math.min(MAX_CUPS, Math.max(s.mugs, Math.floor((a.info.age ?? 0) / (a.claude ? 1200 : 300))));
      const showFolder = a.seated && track(a).carry === 'folder';
      const age = time - s.trophyAt;
      push(oy + TILE + 0.3, (ctx) => {
        for (let i = 0; i < cups; i++) {
          const c = cup();
          ctx.drawImage(c, ox + CUPS[i][0], oy + CUPS[i][1] - c.height);
        }
        if (s.trophyAt >= 0) {
          const hop = age < 0.25 ? -7 * (age / 0.25) : age < 0.45 ? -7 + 7 * ((age - 0.25) / 0.2) : 0;
          const t = trophy();
          ctx.drawImage(t, ox + 1, Math.round(oy + 6 - t.height + hop));
        }
        if (sheets > 0) {
          const st = paperStack(sheets);
          ctx.drawImage(st, ox + 1, oy + 15 - st.height);
        }
        if (showFolder) {
          const f = folder();
          ctx.drawImage(f, ox + 10, oy + 15 - f.height);
        }
        for (let i = 0; i < balls; i++) {
          const b = ball();
          ctx.drawImage(b, ox + BALLS[i][0], oy + BALLS[i][1] - b.height);
        }
      });
    }
    for (const a of this.d.agents) {
      const carry = track(a).carry;
      if ((carry !== 'folder' && carry !== 'papers') || a.seated || a.hidden || a.alpha <= 0) {
        continue;
      }
      const img = carry === 'folder' ? folder() : papers();
      const [hx, hy, behind] = heldAt(a, img.width, carry === 'papers');
      const [sx, sy] = a.spriteOrigin();
      push(a.y + (behind ? -0.01 : 0.01), (ctx) => {
        ctx.globalAlpha = a.alpha;
        ctx.drawImage(img, sx + hx, sy + hy);
        ctx.globalAlpha = 1;
      });
    }
    const lamps = labLamps(this.d.office);
    for (const spot of this.d.office.spotsFor('qa')) {
      const lamp = lamps.get(spot.item.uid);
      if (!lamp) {
        continue;
      }
      if (lamp.until < time) {
        lamps.delete(spot.item.uid);
        continue;
      }
      const [dark, light] = LAMP_COLOURS[lamp.state];
      const on = lamp.state !== 'run' || time % 1 < 0.6;
      const bx = spot.item.x * TILE + QA_BULB.x;
      const by = spot.item.y * TILE + QA_BULB.y;
      push(spot.item.y * TILE + TILE + 0.2, (ctx) => {
        ctx.fillStyle = on ? dark : mustard[1];
        ctx.fillRect(bx, by, QA_BULB.w, QA_BULB.h);
        if (on) {
          ctx.fillStyle = light;
          ctx.fillRect(bx + 1, by + 1, QA_BULB.w - 2, QA_BULB.h - 3);
          ctx.fillStyle = cream[6];
          ctx.fillRect(bx + 1, by + 1, 1, 1);
        }
      });
    }
  }

  afterLighting(ctx: CanvasRenderingContext2D): void {
    const time = this.d.time;
    const lamps = labLamps(this.d.office);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const spot of this.d.office.spotsFor('qa')) {
      const lamp = lamps.get(spot.item.uid);
      if (!lamp || (lamp.state === 'run' && time % 1 >= 0.6)) {
        continue;
      }
      const cx = spot.item.x * TILE + QA_BULB.x + QA_BULB.w / 2;
      const cy = spot.item.y * TILE + QA_BULB.y + QA_BULB.h / 2;
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 16);
      g.addColorStop(0, lamp.state === 'pass' ? 'rgba(134,184,78,0.45)' : lamp.state === 'fail' ? 'rgba(201,93,76,0.5)' : 'rgba(233,196,111,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 16, cy - 16, 32, 32);
    }
    ctx.restore();
    // the reception bell shakes off two little ring marks
    ctx.fillStyle = cream[6];
    for (const a of this.d.agents) {
      const since = time - track(a).dingAt;
      if (since > 0.8 || a.hidden) {
        continue;
      }
      const bell = this.d.office.spotsFor('bell').find((s) => s.x === a.tx && s.y === a.ty);
      if (!bell) {
        continue;
      }
      const bx = bell.item.x * TILE + 11;
      const by = bell.item.y * TILE + 24;
      const r = since < 0.4 ? 7 : 9;
      for (const sx of [-1, 1]) {
        ctx.fillRect(bx + sx * r, by - 2, 1, 1);
        ctx.fillRect(bx + sx * (r + 1), by, 1, 1);
        ctx.fillRect(bx + sx * r, by + 2, 1, 1);
      }
    }
  }

  /** The task's sticky note on the monitor, once zoomed in far enough to read it. */
  screen(ctx: CanvasRenderingContext2D, toScreen: (wx: number, wy: number) => [number, number], scale: number): void {
    if (scale < 3) {
      return;
    }
    const fontPx = Math.max(9, Math.round(scale * 2.4));
    ctx.font = `${fontPx}px "Pixelify Sans", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const u = Math.max(1, Math.round(scale / 3));
    for (const a of this.d.agents) {
      const title = a.info.title?.trim();
      const desk = title && !a.leaving ? this.desk(a) : null;
      if (!title || !desk) {
        continue;
      }
      const [cx, cy] = toScreen(desk.x + 22, desk.item.y * TILE + (desk.up ? -9 : -3));
      if (cx < -200 || cy < -100 || cx > ctx.canvas.width + 200 || cy > ctx.canvas.height + 100) {
        continue;
      }
      const lines = noteLines(title);
      const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + 4 * u;
      const h = Math.round(lines.length * fontPx * 1.05) + 4 * u;
      const x = Math.round(cx - w / 2);
      const y = Math.round(cy - h / 2);
      ctx.fillStyle = mustard[2];
      ctx.fillRect(x - u, y - u, w + 2 * u, h + 2 * u);
      ctx.fillStyle = mustard[4];
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = mustard[3];
      ctx.fillRect(x, y, w, 2 * u);
      ctx.fillRect(x + w - 2 * u, y + h - 2 * u, 2 * u, 2 * u);
      ctx.fillStyle = mustard[0];
      lines.forEach((l, i) => ctx.fillText(l, x + 2 * u, y + 2 * u + Math.round(i * fontPx * 1.05)));
    }
  }
}

/** The start of the title in up to two short lines. */
function noteLines(title: string): string[] {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > 12) {
      lines.push(cur);
      cur = '';
      if (lines.length === 2) {
        break;
      }
    }
    cur = cur ? `${cur} ${w}` : w.slice(0, 12);
  }
  if (cur && lines.length < 2) {
    lines.push(cur);
  }
  if (lines.length === 2 && lines.join(' ').length < title.length) {
    lines[1] = `${lines[1].slice(0, 11)}…`;
  }
  return lines;
}

registerExtension((d) => new WorkVisibility(d));
