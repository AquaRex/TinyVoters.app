/**
 * Props and little creatures drawn by features (never placed in the layout): Friday pizza, the office cat and the
 * janitor's mop cart.
 * Every sprite is built once on first use; anchors are noted per sprite (where its foot point sits).
 */
import {
  Pen, pen, charcoal, cream, ink, mat, mustard, oak, plant, red, selOut, sprite, steel, terracotta, yellow, sage,
} from './kit';

const cache = new Map<string, HTMLCanvasElement>();

function once(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = cache.get(key);
  if (!c) {
    c = make();
    cache.set(key, c);
  }
  return c;
}

// ---------------------------------------------------------------- Friday pizza

/** 26 x 12 pizza: a stack of closed boxes and an open one; bottom-left at (0, 11). */
export function pizzaBoxes(): HTMLCanvasElement {
  return once('pizza', () => {
    const card = mat(oak);
    const c = sprite(26, 12, (p) => {
      for (const y of [7, 4]) {
        p.rect(0, y, 12, 4, card.light);
        p.hline(0, y + 3, 12, card.base);
      }
      p.rect(3, 5, 6, 1, red[1]);
      p.rect(13, 6, 13, 6, card.light);
      p.hline(13, 11, 13, card.base);
      p.rect(13, 2, 13, 4, card.base);
      p.disc(14, 6, 11, mustard[3]);
      p.ellipse(14, 6, 11, 5, terracotta[3]);
      p.ellipse(15, 7, 9, 4, mustard[4]);
      for (const [x, y] of [[16, 8], [20, 7], [18, 9], [22, 9]] as const) {
        p.px(x, y, red[1]);
      }
    });
    selOut(c);
    return c;
  });
}

// ---------------------------------------------------------------- the office cat (orange tabby)

const fur = mat(terracotta, -1);
const belly = cream[5];

export type CatPose = 'walk' | 'sit' | 'sleep';

/**
 * Cat frames, facing left (mirror for right). walk: 16 x 12, 4 frames, foot (8, 11). sit: 12 x 14, 3 tail
 * frames, foot (6, 13). sleep: 15 x 9, 2 breathing frames, foot (7, 8).
 */
export function catFrame(pose: CatPose, frame: number): HTMLCanvasElement {
  const n = pose === 'walk' ? 4 : pose === 'sit' ? 3 : 2;
  const f = ((frame % n) + n) % n;
  return once(`cat|${pose}|${f}`, () => {
    if (pose === 'walk') {
      return catWalk(f);
    }
    return pose === 'sit' ? catSit(f) : catSleep(f);
  });
}

function catWalk(f: number): HTMLCanvasElement {
  const legs = [[0, 1, 1, 0], [1, 0, 0, 1], [0, 1, 1, 0], [1, 0, 0, 1]][f];
  const c = sprite(16, 12, (p: Pen) => {
    p.ellipse(3, 4, 11, 5, fur.base);
    p.hline(5, 4, 7, fur.light);
    p.hline(5, 8, 7, belly);
    [4, 6, 10, 12].forEach((x, i) => p.vline(x, 8, 4 - legs[i], i % 2 ? fur.dark : fur.base));
    p.disc(0, 1, 6, fur.base);
    p.px(1, 0, fur.base);
    p.px(4, 0, fur.base);
    p.hline(1, 2, 3, fur.light);
    p.rect(1, 5, 2, 1, belly);
    p.line(13, 6, 14, 2, fur.base);
    p.px(15, 1 + (f % 2), fur.base);
    p.vline(7, 4, 2, fur.dark);
    p.vline(9, 4, 2, fur.dark);
  });
  selOut(c);
  const p = penOf(c);
  p.px(1, 3, plant[5]);
  p.px(0, 4, terracotta[2]);
  return c;
}

function catSit(f: number): HTMLCanvasElement {
  const tail = [[10, 12, 11, 9], [10, 12, 11, 10], [10, 12, 11, 11]][f];
  const c = sprite(13, 14, (p: Pen) => {
    p.ellipse(1, 5, 10, 9, fur.base);
    p.ellipse(2, 6, 4, 6, fur.light);
    p.ellipse(4, 8, 4, 5, belly);
    p.disc(1, 0, 9, fur.base);
    p.rect(1, 0, 2, 2, fur.base);
    p.rect(8, 0, 2, 2, fur.base);
    p.hline(3, 1, 4, fur.light);
    p.vline(5, 1, 2, fur.dark);
    p.rect(3, 12, 2, 2, belly);
    p.rect(6, 12, 2, 2, belly);
    p.line(tail[0], 12, tail[2] + 1, tail[3], fur.dark);
    p.px(tail[2] + 1, tail[3] - 1, fur.dark);
  });
  selOut(c);
  const p = penOf(c);
  p.px(3, 4, plant[5]);
  p.px(7, 4, plant[5]);
  p.px(5, 5, terracotta[2]);
  return c;
}

function catSleep(f: number): HTMLCanvasElement {
  const c = sprite(15, 9, (p: Pen) => {
    p.ellipse(1, 2 - f, 14, 7 + f, fur.base);
    p.ellipse(3, 2 - f, 8, 4, fur.light);
    p.vline(7, 3 - f, 2, fur.dark);
    p.vline(10, 3 - f, 2, fur.dark);
    p.disc(0, 3, 6, fur.base);
    p.px(1, 2, fur.base);
    p.px(4, 2, fur.base);
    p.hline(3, 8, 10, fur.dark);
    p.hline(1, 7, 3, belly);
  });
  selOut(c);
  const p = penOf(c);
  p.hline(1, 5, 2, fur.line);
  return c;
}

// ---------------------------------------------------------------- the night janitor's mop cart

/** 16 x 22 mop cart (yellow bucket, wringer, mop); foot point (8, 21). */
export function mopCart(): HTMLCanvasElement {
  return once('mopcart', () => {
    const b = mat(yellow);
    const s = mat(steel);
    const c = sprite(16, 22, (p) => {
      p.vline(11, 0, 14, oak[3]);
      p.vline(12, 0, 14, oak[2]);
      p.rect(9, 12, 6, 4, cream[4]);
      p.rect(2, 12, 12, 7, b.base);
      p.hline(2, 12, 12, b.light);
      p.rect(3, 13, 7, 2, steel[2]);
      p.hline(3, 13, 7, sage[2]);
      p.rect(2, 18, 12, 1, b.dark);
      p.rect(0, 9, 2, 8, s.base);
      p.hline(0, 9, 4, s.light);
      for (const x of [2, 11]) {
        p.rect(x, 19, 3, 3, charcoal[1]);
        p.px(x + 1, 20, charcoal[4]);
      }
    });
    selOut(c);
    return c;
  });
}

/** 8 x 12 yellow "wet floor" sign; foot point (4, 11). */
export function wetSign(): HTMLCanvasElement {
  return once('wetsign', () => {
    const b = mat(yellow);
    const c = sprite(8, 12, (p) => {
      p.rect(1, 1, 6, 11, b.base);
      p.hline(2, 0, 4, b.light);
      p.vline(1, 2, 9, b.light);
      p.rect(3, 4, 2, 3, ink);
      p.px(3, 8, ink);
      p.px(4, 8, ink);
    });
    selOut(c);
    return c;
  });
}

function penOf(c: HTMLCanvasElement): Pen {
  return pen(c.getContext('2d')!);
}
