import { TILE } from '../config';
import { mustard } from '../art/kit';
import { Agent } from '../agents/agent';
import { registerExtension } from '../agents/director';
import { rememberDesk } from '../agents/people';
import { TIMES_INK, TIMES_PAPER, TIMES_ROWS, pixelText } from '../art/premium';
import { flushStats, latestStats, monthLeaders, sameCareer, trackGone, trackInfo, trackSpawn } from '../stats/stats';

/**
 * Staff and stats in the world: feeds the local stats tracker, remembers each seat's desk, writes today's
 * numbers onto every "Tiny Times" board and puts a gold star over the Employee of the month.
 */

export const BOARD_ID = 'board.tinytimes';
const FLUSH_EVERY = 5;

function compact(n: number): string {
  return n >= 10000 ? `${Math.floor(n / 1000)}k` : String(n);
}

const STAR = ['..#..', '.###.', '#####', '.###.', '##.##'];

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
    screen(ctx, toScreen, scale) {
      const best = monthLeaders(latestStats(), 1)[0];
      if (!best) {
        return;
      }
      const px = Math.max(1, Math.round(scale));
      for (const a of director.agents) {
        if (a.alpha <= 0.5 || a.isSub || !sameCareer(a, best)) {
          continue;
        }
        const [x0, y0] = a.spriteOrigin();
        const [sx, sy] = toScreen(x0 + 13, y0 - 2 + Math.round(Math.sin(a.anim * 2.5)));
        ctx.globalAlpha = a.alpha;
        STAR.forEach((row, y) =>
          [...row].forEach((c, x) => {
            if (c === '#') {
              ctx.fillStyle = y === 0 || (y === 1 && x === 1) ? mustard[4] : y === 4 ? mustard[2] : mustard[3];
              ctx.fillRect(Math.round(sx) + x * px, Math.round(sy) + y * px, px, px);
            }
          }),
        );
        ctx.globalAlpha = 1;
      }
    },
  };
});
