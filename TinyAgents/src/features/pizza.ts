import { TILE } from '../config';
import { registerExtension } from '../agents/director';
import { pizzaBoxes } from '../art/officeLife';
import { pizzaTime } from '../world/calendar';
import { PlacedItem } from '../world/layout';
import { Office } from '../world/office';
import { itemsWith } from './shared';

/** Where the boxes rest on each host: bottom-left of the sprite in footprint px. */
const SURFACES: [prefix: string, x: number, y: number][] = [
  ['table.dining', 19, 11],
  ['table.bar', 3, 1],
  ['counter.plain', 3, 4],
  ['counter', 3, 4],
];

function hosts(office: Office): { item: PlacedItem; x: number; y: number }[] {
  const out: { item: PlacedItem; x: number; y: number }[] = [];
  for (const [prefix, x, y] of SURFACES) {
    const item = itemsWith(office, prefix).find((i) => !office.isOutdoor(i.x, i.y) && !out.some((o) => o.item === i));
    if (item && out.length < 2) {
      out.push({ item, x, y });
    }
  }
  return out;
}

/**
 * Friday pizza: 15:00-17:00 on Fridays (director clock, ?date= / ?time= to test) boxes appear on the dining
 * table and the kitchen counter, and free staff head for snacks and food labelled "Pizza!" (director chooseIdle).
 */
registerExtension((director) => {
  let was = false;
  return {
    update() {
      const now = pizzaTime(director.hour);
      if (now && !was) {
        const herald = director.agents.find((a) => a.arrived && !a.hidden && !a.info.busy && !a.info.waiting);
        herald?.say("pizza's here!", 2.6);
      }
      was = now;
    },
    drawables(_view, push) {
      if (!pizzaTime(director.hour)) {
        return;
      }
      const img = pizzaBoxes();
      for (const { item, x, y } of hosts(director.office)) {
        const v = director.office.variantOf(item);
        const z = Math.max(...(v?.frames[0] ?? []).map((p) => p.z), TILE);
        push(item.y * TILE + z + 0.3, (ctx) => ctx.drawImage(img, item.x * TILE + x, item.y * TILE + y - img.height));
      }
    },
  };
});
