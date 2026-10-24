import { app } from '../app';
import type { Agent, AgentInfo } from '../agents/agent';
import { Director, registerExtension } from '../agents/director';
import { blue, lightWarm, red, sage, terracotta, yellow } from '../art/kit';
import { playCue } from '../ui/sound';

/** A turn this long (seconds) or with this many tool calls earns a celebration. */
const LONG_TURN = 180;
const MANY_TOOLS = 20;
const CHEERS = ['yay!', 'nice!', 'woo!', 'great work!', 'shipped!', 'nailed it'];
const COLORS = [red[2], yellow[2], blue[3], sage[4], terracotta[4], lightWarm[1]];

interface Turn {
  start: number;
  tools: number;
  calls0: number;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  color: string;
  w: number;
}

const working = (i: AgentInfo) => i.busy || i.waiting;

/** Confetti per floor: info changes reach the person's home floor, but the party is where they are. */
const confetti = new WeakMap<Director, Bit[]>();
function bitsOf(d: Director): Bit[] {
  let bits = confetti.get(d);
  if (!bits) {
    bits = [];
    confetti.set(d, bits);
  }
  return bits;
}

/**
 * When someone finishes a long turn (busy for 3+ minutes or 20+ tool calls), confetti bursts over them and
 * free coworkers in the same room cheer. Works for Claude sessions and demo staff alike.
 */
registerExtension((director) => {
  const turns = new Map<string, Turn>();
  const bits = bitsOf(director);

  const celebrate = (a: Agent) => {
    const here = a.floor;
    const burst = bitsOf(here);
    for (let i = 0; i < 46; i++) {
      const ang = -Math.PI / 2 + (director.rand() - 0.5) * 2.2;
      const v = 50 + director.rand() * 70;
      burst.push({ x: a.x, y: a.y - 38, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, t: 1.6 + director.rand() * 1.2, color: COLORS[i % COLORS.length], w: director.rand() < 0.4 ? 2 : 1 });
    }
    a.say(director.rand() < 0.5 ? 'done!' : 'finally!', 2.4);
    a.waveT = 1.2;
    const room = here.nav.roomOf(a.tx, a.ty);
    const fans = here.agents.filter((b) =>
      b !== a && !b.hidden && b.arrived && !b.leaving && !b.info.busy && !b.info.waiting && !b.locked &&
      here.nav.roomOf(b.tx, b.ty) === room && a.tilesTo(b) < 6);
    fans.forEach((b) => {
      if (!b.seated) {
        b.face(a.x, a.y);
      }
      b.waveT = 1 + director.rand();
      b.sayLater(CHEERS[Math.floor(director.rand() * CHEERS.length)], 0.3 + director.rand() * 0.9, 2);
    });
    if (app.shown.director === here) {
      playCue('celebrate');
    }
  };

  return {
    onSpawn(a) {
      if (working(a.info)) {
        turns.set(a.id, { start: director.time - (a.info.stateFor ?? 0), tools: 0, calls0: a.info.toolCalls ?? 0 });
      }
    },
    onInfo(a, was, now) {
      if (working(now) && !working(was)) {
        turns.set(a.id, { start: director.time, tools: 0, calls0: was.toolCalls ?? 0 });
        return;
      }
      const turn = turns.get(a.id);
      if (!turn) {
        return;
      }
      if (now.tool && now.tool !== was.tool) {
        turn.tools++;
      }
      if (!working(now) && working(was)) {
        turns.delete(a.id);
        const tools = Math.max(turn.tools, (now.toolCalls ?? 0) - turn.calls0);
        if (a.arrived && !a.hidden && (director.time - turn.start >= LONG_TURN || tools >= MANY_TOOLS)) {
          celebrate(a);
        }
      }
    },
    onGone(a) {
      turns.delete(a.id);
    },
    update(dt) {
      for (const b of bits) {
        b.t -= dt;
        b.vy += 140 * dt;
        b.vx *= 1 - dt * 1.5;
        b.x += b.vx * dt + Math.sin(b.t * 9) * 0.3;
        b.y += Math.min(b.vy, 40) * dt;
      }
      for (let i = bits.length - 1; i >= 0; i--) {
        if (bits[i].t <= 0) {
          bits.splice(i, 1);
        }
      }
    },
    afterLighting(ctx) {
      for (const b of bits) {
        ctx.fillStyle = b.color;
        ctx.fillRect(Math.round(b.x), Math.round(b.y), b.w, Math.sin(b.t * 12) > 0 ? 2 : 1);
      }
    },
  };
});
