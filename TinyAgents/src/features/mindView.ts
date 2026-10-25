import { registerExtension } from '../agents/director';
import { thinking } from '../mind/brain';

/** AI staff: a small "…" over the head while someone's mind is waiting for the model. */
registerExtension((d) => ({
  screen(ctx, toScreen, scale) {
    const dots = Math.floor(performance.now() / 350) % 3 + 1;
    for (const a of d.agents) {
      if (a.hidden || a.alpha < 1 || a.bubble || !thinking(a)) {
        continue;
      }
      const [x, y] = toScreen(a.x, a.y - 50);
      const u = Math.max(1, Math.round(scale * 0.75));
      const w = 11 * u;
      const h = 6 * u;
      const bx = Math.round(x - w / 2);
      const by = Math.round(y - h);
      ctx.fillStyle = '#26232b';
      ctx.fillRect(bx - u, by - u, w + 2 * u, h + 2 * u);
      ctx.fillStyle = '#fbf7ec';
      ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = '#26232b';
      for (let i = 0; i < dots; i++) {
        ctx.fillRect(bx + (2 + i * 3) * u, by + 2 * u, 2 * u, 2 * u);
      }
    }
  },
}));
