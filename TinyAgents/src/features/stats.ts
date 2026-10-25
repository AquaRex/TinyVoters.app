import { TILE } from '../config';
import { Agent } from '../agents/agent';
import { registerExtension } from '../agents/director';
import { rememberDesk } from '../agents/people';
import { TIMES_INK, TIMES_PAPER, TIMES_ROWS, pixelText } from '../art/premium';
import { flushStats, latestStats, trackGone, trackInfo, trackSpawn } from '../stats/stats';

/**
 * Staff and stats in the world: feeds the local stats tracker, remembers each seat's desk, writes today's
 * numbers onto every "Tiny Times" board.
 */

export const BOARD_ID = 'board.tinytimes';
const FLUSH_EVERY = 5;

function compact(n: number): string {
  return n >= 10000 ? `${Math.floor(n / 1000)}k` : String(n);
}

registerExtension((director) => {
  const desks = new WeakMap<Agent, string>();
  let flushIn = FLUSH_EVERY;
  return {
    onSpawn: (a) => trackSpawn(a),
    onInfo: (a, was, now) => trackInfo(a, was, now),
    onGone: (a) => trackGone(a),
    update(dt) {
      for (const a of director.agents) {
        if (a.homeDesk && desks.get(a) !== a.homeDesk) {
          desks.set(a, a.homeDesk);
          rememberDesk(a.slot, a.homeDesk);
        }
      }
      flushIn -= dt;
      if (flushIn <= 0) {
        flushIn = FLUSH_EVERY;
        flushStats();
      }
    },
    drawables(view, push) {
      const today = latestStats()?.today;
      for (const item of director.office.layout.items) {
        if (item.type !== BOARD_ID) {
          continue;
        }
        const ox = item.x * TILE;
        const oy = item.y * TILE;
        if (ox > view.x + view.w || ox + TILE < view.x || oy - TILE > view.y + view.h || oy + TILE < view.y) {
          continue;
        }
        const values = today ? [today.turns, today.toolCalls] : null;
        push(oy + 24.1, (ctx) => {
          TIMES_ROWS.forEach((r, i) => {
            ctx.fillStyle = TIMES_PAPER;
            ctx.fillRect(ox + r.x, oy + r.y, 15, 5);
            ctx.fillStyle = TIMES_INK;
            pixelText((x, y, w, h) => ctx.fillRect(ox + x, oy + y, w, h), values ? compact(values[i]) : '--', r.x, r.y);
          });
        });
      }
    },
  };
});
