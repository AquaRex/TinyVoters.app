import { charcoal, cream, mirrorX, navy, oak, plant, red, sprite, steel, terracotta, yellow } from './kit';

// Building staff gear, drawn over the character sprite by src/features/staffGear.ts: the chef's toque, the guard's
// peaked cap, a canteen tray of food carried in both hands, and the cleaners' upright vacuum.

export type GearView = 'down' | 'up' | 'left' | 'right';

const cache = new Map<string, HTMLCanvasElement>();
function once(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = cache.get(key);
  if (!c) {
    c = make();
    cache.set(key, c);
  }
  return c;
}

/** 16 x 12 chef's toque; the band's bottom row (y 11) sits on the forehead. */
export function chefHat(view: GearView): HTMLCanvasElement {
  return once(`toque|${view === 'right' ? 'left' : view}`, () =>
    sprite(16, 12, (p) => {
      p.ellipse(1, 0, 14, 9, cream[2]);
      p.ellipse(2, 1, 12, 7, cream[6]);
      p.rect(4, 6, 8, 2, cream[5]);
      p.hline(4, 1, 3, cream[6]);
      p.px(11, 2, cream[4]);
      p.px(12, 4, cream[4]);
      p.px(7, 5, cream[4]);
      p.rect(2, 7, 12, 5, cream[2]);
      p.rect(3, 7, 10, 4, cream[5]);
      p.hline(3, 7, 10, cream[6]);
      p.hline(3, 10, 10, cream[4]);
      if (view !== 'up') {
        p.vline(view === 'down' ? 7 : 4, 8, 2, cream[4]);
      }
    }),
  );
}

/** 16 x 9 security cap: navy crown, black band with a brass badge, peak towards the facing. Bottom row on the brow. */
export function guardCap(view: GearView): HTMLCanvasElement {
  if (view === 'right') {
    return once('cap|right', () => mirrorX(guardCap('left')));
  }
  return once(`cap|${view}`, () =>
    sprite(16, 9, (p) => {
      p.rect(1, 0, 14, 5, navy[0]);
      p.rect(2, 1, 12, 3, navy[2]);
      p.hline(3, 1, 8, navy[3]);
      p.hline(2, 4, 12, navy[1]);
      p.rect(2, 5, 12, 2, charcoal[1]);
      p.hline(2, 5, 12, charcoal[3]);
      if (view === 'down') {
        p.rect(7, 2, 2, 2, yellow[2]);
        p.px(7, 2, yellow[1]);
        p.rect(3, 7, 10, 2, charcoal[0]);
        p.hline(4, 7, 8, charcoal[2]);
      } else if (view === 'left') {
        p.rect(3, 2, 2, 2, yellow[2]);
        p.rect(0, 6, 5, 2, charcoal[0]);
        p.hline(0, 6, 4, charcoal[2]);
      }
    }),
  );
}

/** 14 x 7 canteen tray: plate of food, a small salad bowl and a glass. */
export function foodTray(): HTMLCanvasElement {
  return once('tray', () =>
    sprite(14, 7, (p) => {
      p.rect(0, 2, 14, 5, steel[2]);
      p.rect(1, 2, 12, 4, steel[4]);
      p.hline(1, 2, 12, steel[5]);
      p.ellipse(1, 0, 7, 5, cream[3]);
      p.ellipse(2, 0, 5, 4, cream[6]);
      p.rect(3, 1, 2, 2, terracotta[3]);
      p.px(5, 1, yellow[2]);
      p.px(4, 2, terracotta[4]);
      p.ellipse(8, 2, 4, 3, cream[4]);
      p.rect(9, 2, 2, 1, plant[5]);
      p.px(10, 3, plant[4]);
      p.rect(12, 0, 2, 4, steel[5]);
      p.px(12, 1, steel[6]);
      p.hline(0, 6, 14, steel[1]);
    }),
  );
}

/** Upright vacuum, 22 px tall (handle up to hand height); side view pushed to the left, right is mirrored. Foot at the bottom centre. */
export function vacuum(view: GearView): HTMLCanvasElement {
  if (view === 'right') {
    return once('vac|right', () => mirrorX(vacuum('left')));
  }
  if (view === 'down' || view === 'up') {
    return once(`vac|${view}`, () =>
      sprite(12, 22, (p) => {
        p.rect(3, 0, 6, 2, charcoal[1]);
        p.hline(4, 0, 4, charcoal[4]);
        p.vline(5, 2, 6, charcoal[2]);
        p.vline(6, 2, 6, charcoal[4]);
        p.rect(3, 7, 6, 10, red[0]);
        p.rect(4, 7, 4, 9, red[1]);
        p.vline(4, 8, 7, red[2]);
        p.rect(5, 10, 2, 3, cream[5]);
        p.rect(0, 16, 12, 4, charcoal[1]);
        p.hline(1, 16, 10, charcoal[4]);
        p.hline(1, 19, 10, charcoal[0]);
        p.rect(1, 20, 3, 2, charcoal[0]);
        p.rect(8, 20, 3, 2, charcoal[0]);
      }),
    );
  }
  return once('vac|left', () =>
    sprite(14, 22, (p) => {
      p.rect(11, 0, 3, 2, oak[2]);
      p.line(12, 2, 8, 8, charcoal[2]);
      p.line(11, 2, 7, 8, charcoal[4]);
      p.rect(4, 8, 6, 9, red[0]);
      p.rect(5, 8, 4, 8, red[1]);
      p.vline(5, 9, 6, red[2]);
      p.rect(6, 11, 2, 3, cream[5]);
      p.rect(0, 16, 10, 4, charcoal[1]);
      p.hline(0, 16, 9, charcoal[4]);
      p.px(0, 17, charcoal[3]);
      p.rect(2, 20, 2, 2, charcoal[0]);
      p.rect(7, 20, 2, 2, charcoal[0]);
    }),
  );
}
