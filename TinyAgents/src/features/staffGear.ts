import type { Agent } from '../agents/agent';
import { cleaning, wetSigns } from '../agents/buildingStaff';
import { registerExtension } from '../agents/director';
import { track } from '../agents/toolPlaces';
import { mopCart, wetSign } from '../art/officeLife';
import { GearView, chefHat, foodTray, guardCap, vacuum } from '../art/staffGear';
import { headLift } from '../render/characters';
import { DIR_STEP } from '../world/office';

/**
 * What building staff and lunch-goers wear and carry, drawn over the character: the chef's toque and the guard's cap,
 * a tray of food on the way from the canteen line, the cleaners' vacuum or mop cart, and wet-floor signs.
 */
function hat(a: Agent): HTMLCanvasElement | null {
  const view = a.dir as GearView;
  return a.role.id === 'chef' && a.npc ? chefHat(view) : a.role.id === 'guard' && a.npc ? guardCap(view) : null;
}

registerExtension((d) => {
  let t = 0;
  return {
    update(dt) {
      t += dt;
      for (let i = wetSigns.length - 1; i >= 0; i--) {
        if (wetSigns[i].d === d && wetSigns[i].until < d.time) {
          wetSigns.splice(i, 1);
        }
      }
    },
    drawables(view, push) {
      for (const a of d.agents) {
        if (a.hidden || a.alpha <= 0 || a.x < view.x - 40 || a.x > view.x + view.w + 40 || a.y < view.y - 20 || a.y > view.y + view.h + 60) {
          continue;
        }
        const [sx, sy] = a.spriteOrigin();
        const cap = hat(a);
        if (cap) {
          const [pose, frame] = a.pose();
          const u = headLift(a.person.look, pose, frame);
          const top = a.role.id === 'chef' ? sy + u - 4 : sy + u + 1;
          push(a.y + 0.02, (ctx) => {
            ctx.globalAlpha = a.alpha;
            ctx.drawImage(cap, sx + 8, top);
            ctx.globalAlpha = 1;
          });
        }
        const carry = track(a).carry;
        if (carry === 'tray' && !a.seated) {
          const img = foodTray();
          const [hx, hy] = a.dir === 'left' ? [1, 22] : a.dir === 'right' ? [17, 22] : [9, a.dir === 'up' ? 19 : 22];
          push(a.y + (a.dir === 'up' ? -0.01 : 0.01), (ctx) => {
            ctx.globalAlpha = a.alpha;
            ctx.drawImage(img, sx + hx, sy + hy);
            ctx.globalAlpha = 1;
          });
        }
        if (carry === 'vacuum' || carry === 'mop') {
          const [dx, dy] = DIR_STEP[a.dir];
          const wiggle = cleaning.has(a) ? Math.round(Math.sin(t * 6) * 3) : 0;
          if (carry === 'vacuum') {
            const img = vacuum(a.dir as GearView);
            const fx = Math.round(a.x + dx * 16 + (dx === 0 ? 9 : 0) + (dx === 0 ? 0 : wiggle * dx));
            const fy = Math.round(a.y + (dy > 0 ? 6 : dy < 0 ? -4 : 2) + (dy === 0 ? 0 : wiggle * dy));
            push(fy, (ctx) => {
              ctx.globalAlpha = a.alpha;
              ctx.drawImage(img, fx - Math.floor(img.width / 2), fy - img.height + 1);
              ctx.globalAlpha = 1;
            });
          } else {
            const cart = mopCart();
            const cx = Math.round(a.x + dx * 15 + (dx === 0 ? 10 : 0) + wiggle);
            const cy = Math.round(a.y + dy * 8 + 2);
            push(cy, (ctx) => {
              ctx.globalAlpha = a.alpha;
              ctx.drawImage(cart, cx - 8, cy - 21);
              ctx.globalAlpha = 1;
            });
          }
        }
      }
      for (const s of wetSigns) {
        if (s.d === d) {
          push(s.y, (ctx) => ctx.drawImage(wetSign(), Math.round(s.x) - 4, Math.round(s.y) - 11));
        }
      }
    },
  };
});
