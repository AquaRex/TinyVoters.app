import { defineAsset } from './registry';
import { Part } from './types';
import {
  Pen, area, blue, box, charcoal, cream, dirt, glassGlint, leaf, leg, lightWarm, makeVariant, mat, mustard, navy,
  oak, paving, plant, pot, red, sage, screenGlow, screenLight, selOut, shadow, single, stand, steel, terracotta, walnut,
  warmLight, water, yellow,
} from './kit';

/** The lobby's "Tiny Times" board and a set of special decor pieces (aquarium, arcade, neon, trophies, espresso, records, gold plant). */

// =========================================================================================================
// 3 x 5 pixel font

const GLYPHS: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001011001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111', k: '100101110101101', '+': '000010111010000',
  T: '111010010010010', I: '111010010010111', M: '101111111101101', E: '111100110100111', S: '011100010001110',
  H: '101101111101101', P: '110101110100100', N: '110101101101101', Y: '101101010010010', ' ': '000000000000000',
};

/** Width in px of `text` in the 3 x 5 font at `scale`. */
export function pixelTextWidth(text: string, scale = 1): number {
  return text.length ? (text.length * 4 - 1) * scale : 0;
}

/** Draws `text` in the 3 x 5 font; `fill(x, y, w, h)` paints one (scaled) pixel. */
export function pixelText(fill: (x: number, y: number, w: number, h: number) => void, text: string, x: number, y: number, scale = 1): void {
  [...text].forEach((ch, i) => {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let k = 0; k < 15; k++) {
      if (g[k] === '1') {
        fill(x + (i * 4 + (k % 3)) * scale, y + Math.floor(k / 3) * scale, scale, scale);
      }
    }
  });
}

/** Builds `n` animation frames from one drawing function (each frame drawn from scratch). */
function animFrames(n: number, draw: (f: number) => Part[]): Part[][] {
  return Array.from({ length: n }, (_, f) => draw(f));
}

const gold = mat(mustard);

// =========================================================================================================
// The Tiny Times: lobby stats board

/** Paper colour of the board's number rows and where the live numbers go (footprint px, 3 x 5 digits). */
export const TIMES_PAPER = cream[5];
export const TIMES_INK = navy[1];
export const TIMES_ROWS: { x: number; y: number }[] = [
  { x: 12, y: -15 },
  { x: 12, y: -8 },
];

defineAsset({
  id: 'board.tinytimes',
  name: 'The Tiny Times (stats board)',
  group: 'board.news',
  category: 'Decor',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['news', 'newspaper', 'stats', 'board', 'tiny times', 'report'],
  build() {
    const wood = mat(oak);
    const parts = single(area(1, 1, 32), 24, (p) => {
      // A-frame legs and a crossbar under the panel
      leg(p, 6, 2, 26, wood, 2);
      leg(p, 24, 2, 26, wood, 2);
      p.hline(8, 19, 16, wood.dark);
      p.hline(8, 20, 16, wood.line);
      // frame, paper, masthead
      p.rect(3, -26, 26, 29, wood.base);
      p.frame(3, -26, 26, 29, wood.line);
      p.hline(4, -25, 24, wood.light);
      p.vline(4, -25, 27, wood.light);
      p.hline(4, 1, 24, wood.dark);
      p.rect(5, -24, 22, 25, TIMES_PAPER);
      p.vline(26, -24, 25, cream[4]);
      p.hline(5, 0, 22, cream[4]);
      p.rect(5, -24, 22, 7, mat(navy).base);
      p.hline(5, -24, 22, mat(navy).light);
      pixelText((x, y, w, h) => p.rect(x, y, w, h, cream[6]), 'TIMES', 7, -23);
      p.hline(5, -17, 22, gold.base);
      // row icons: a check (finished turns) and a wrench (tool calls), placeholders for the numbers
      const [r1, r2] = TIMES_ROWS;
      const check = sage[2];
      p.px(r1.x - 6, r1.y + 2, check);
      p.px(r1.x - 5, r1.y + 3, check);
      p.px(r1.x - 4, r1.y + 2, check);
      p.px(r1.x - 3, r1.y + 1, check);
      p.px(r1.x - 2, r1.y, check);
      const w = mat(steel);
      p.rect(r2.x - 5, r2.y, 3, 2, w.dark);
      p.px(r2.x - 4, r2.y, TIMES_PAPER);
      p.vline(r2.x - 4, r2.y + 2, 3, w.dark);
      pixelText((x, y, ww, hh) => p.rect(x, y, ww, hh, cream[3]), '0', r1.x, r1.y);
      pixelText((x, y, ww, hh) => p.rect(x, y, ww, hh, cream[3]), '0', r2.x, r2.y);
      // newspaper column lines
      p.hline(7, -2, 7, cream[3]);
      p.hline(16, -2, 9, cream[3]);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(4, 25, 24, 5)] });
  },
});

// =========================================================================================================
// Aquarium (2 x 1): fish swim back and forth, bubbles rise, plants sway

function fish(p: Pen, x: number, y: number, right: boolean, body: string, belly: string): void {
  const s = right ? 1 : -1;
  p.rect(x - 2, y - 1, 5, 3, body);
  p.hline(x - 1, y + 1, 3, belly);
  p.vline(x - 3 * s, y - 1, 3, body);
  p.px(x - 4 * s, y - 2, body);
  p.px(x - 4 * s, y + 2, body);
  p.px(x + 2 * s, y - 1, belly);
  p.px(x + 1 * s, y - 1, charcoal[0]);
}

defineAsset({
  id: 'premium.aquarium',
  name: 'Aquarium',
  group: 'premium.aquarium',
  category: 'Lounge',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['aquarium', 'fish', 'tank', 'water'],
  build() {
    const wood = mat(walnut);
    const frame = mat(charcoal);
    const N = 16;
    const frames = animFrames(N, (f) =>
      single(area(2, 1, 32), 32, (p) => {
        const t = (f / N) * Math.PI * 2;
        // cabinet with two doors
        box(p, 2, 6, 60, 8, 18, wood);
        p.frame(6, 17, 25, 11, wood.deep);
        p.frame(33, 17, 25, 11, wood.deep);
        p.px(28, 22, gold.hi);
        p.px(35, 22, gold.hi);
        // tank: lid, water, sand, rocks
        p.rect(3, -26, 58, 6, frame.base);
        p.frame(3, -26, 58, 6, frame.line);
        p.hline(4, -25, 56, frame.light);
        p.hline(12, -22, 20, lightWarm[1]);
        p.rect(4, -20, 56, 32, water[3]);
        p.rect(4, -20, 56, 3, water[4]);
        p.hline(4, -19, 56, water[5]);
        for (let x = 6; x < 58; x += 7) {
          p.hline(x + ((f >> 1) % 3), -18, 2, water[4]);
        }
        p.rect(4, 0, 56, 12, water[2]);
        p.rect(4, 6, 56, 6, dirt[4]);
        p.hline(4, 6, 56, dirt[3]);
        for (let x = 7; x < 58; x += 6) {
          p.px(x, 8 + (x % 3), dirt[3]);
        }
        p.ellipse(38, 2, 10, 6, paving[2]);
        p.ellipse(39, 2, 6, 3, paving[4]);
        p.ellipse(45, 4, 6, 4, paving[1]);
        // swaying weed
        const weeds: [number, number, number][] = [[8, 18, 0], [11, 24, 1], [14, 15, 2], [52, 20, 3], [55, 14, 4]];
        for (const [wx, h, ph] of weeds) {
          for (let i = 0; i < h; i++) {
            const sway = Math.round(Math.sin(t + ph + i * 0.3) * (i / h) * 1.6);
            p.px(wx + sway, 6 - i, i % 4 < 2 ? plant[3] : plant[4]);
            if (i % 5 === 3) {
              p.px(wx + sway + (ph % 2 ? 1 : -1), 6 - i, plant[5]);
            }
          }
        }
        // fish on loops: x swings, facing follows the direction
        const school: [number, number, number, number, string, string][] = [
          [30, 20, -8, 0, terracotta[4], terracotta[5]],
          [26, 14, -1, 2.1, yellow[2], cream[6]],
          [34, 16, -13, 4.2, blue[3], water[5]],
        ];
        for (const [cx, amp, cy, ph, body, belly] of school) {
          const x = Math.round(cx + Math.sin(t + ph) * amp);
          const y = Math.round(cy + Math.sin(t * 2 + ph) * 1.2);
          fish(p, x, y, Math.cos(t + ph) > 0, body, belly);
        }
        // bubbles from the rock
        for (let k = 0; k < 3; k++) {
          const by = 1 - ((f * 2 + k * 7) % 21);
          p.px(42 + (k % 2), by, water[5]);
        }
        // tank frame and glass glints
        p.vline(3, -20, 33, frame.line);
        p.vline(60, -20, 33, frame.line);
        p.rect(3, 12, 58, 2, frame.base);
        p.hline(3, 13, 58, frame.line);
        p.line(20, -11, 24, -15, glassGlint);
        p.line(21, -8, 23, -10, glassGlint);
      }),
    );
    return makeVariant({
      w: 2,
      h: 1,
      frames,
      anim: { kind: 'loop', fps: 5 },
      shadows: [shadow(1, 26, 62, 6, 'rect')],
      lights: [screenLight(32, -6, 46, 0.34)],
    });
  },
});

// =========================================================================================================
// Arcade cabinet: an attract-mode screen, people stop by to play

defineAsset({
  id: 'premium.arcade',
  name: 'Arcade cabinet',
  group: 'premium.arcade',
  category: 'Lounge',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['arcade', 'game', 'play', 'retro'],
  build() {
    const body = mat(navy);
    const N = 4;
    const frames = animFrames(N, (f) =>
      single(area(1, 1, 44), 32, (p) => {
        box(p, 5, -34, 22, 6, 62, body, { round: 1 });
        // side art stripes
        p.vline(7, -26, 52, terracotta[4]);
        p.vline(8, -26, 52, mustard[3]);
        // marquee
        p.rect(6, -28, 20, 7, mustard[4]);
        p.frame(6, -28, 20, 7, mat(mustard).line);
        p.rect(8, -26, 16, 3, terracotta[3]);
        p.hline(8, -26, 16, terracotta[4]);
        for (let i = 0; i < 5; i++) {
          p.px(9 + i * 3 + (f % 2), -25, i % 2 ? cream[6] : yellow[2]);
        }
        // screen
        p.rect(7, -19, 18, 15, charcoal[0]);
        p.rect(8, -18, 16, 13, navy[0]);
        for (let s = 0; s < 6; s++) {
          p.px(9 + ((s * 5 + 3) % 15), -18 + ((s * 7 + f * 3) % 13), navy[3]);
        }
        const ox = f % 2;
        for (let i = 0; i < 3; i++) {
          const ix = 10 + i * 5 + ox;
          p.rect(ix, -16, 3, 2, plant[5]);
          p.px(ix - 1 + (f % 2) * 4, -14, plant[5]);
        }
        const shipX = 12 + [0, 3, 6, 3][f];
        p.rect(shipX, -8, 3, 2, cream[6]);
        p.px(shipX + 1, -9, cream[6]);
        p.px(shipX + 1, -11 - f, terracotta[5]);
        p.px(9, -7, cream[3]);
        // control panel, joystick and buttons
        box(p, 4, -2, 24, 5, 4, mat(navy, 1));
        p.rect(9, -3, 3, 2, red[2]);
        p.px(9, -3, terracotta[5]);
        p.px(10, -1, charcoal[1]);
        p.rect(16, -1, 2, 2, yellow[2]);
        p.rect(20, -1, 2, 2, red[2]);
        p.rect(23, 0, 2, 2, blue[3]);
        // coin door
        p.rect(12, 12, 8, 9, charcoal[2]);
        p.frame(12, 12, 8, 9, charcoal[0]);
        p.vline(14, 14, 3, gold.hi);
        p.vline(17, 14, 3, gold.hi);
      }),
    );
    return makeVariant({
      w: 1,
      h: 1,
      frames,
      anim: { kind: 'loop', fps: 3 },
      spots: [stand(0, 1, 'up', 'play')],
      shadows: [shadow(4, 26, 25, 5, 'rect')],
      lights: [screenLight(16, -12, 32, 0.4), warmLight(16, -24, 26, 0.25)],
    });
  },
});

// =========================================================================================================
// Neon "SHIP IT" sign (wall, 2 x 1)

defineAsset({
  id: 'premium.neon.shipit',
  name: 'Neon sign: SHIP IT',
  group: 'premium.neon',
  category: 'Lighting',
  layer: 'wall',
  facings: ['down'],
  keywords: ['neon', 'sign', 'ship it', 'light', 'wall'],
  build() {
    const back = mat(charcoal);
    const parts = single({ x: 0, y: -10, w: 64, h: 34 }, 1, (p) => {
      p.rrect(4, -6, 56, 18, 2, back.dark);
      p.frame(4, -6, 56, 18, back.line);
      p.hline(5, -5, 54, back.base);
      for (const sx of [6, 57]) {
        p.px(sx, -4, steel[4]);
        p.px(sx, 9, steel[4]);
      }
      const tube = (text: string, x: number, core: string, rim: string) => {
        pixelText((tx, ty, w, h) => p.rect(tx + 1, ty + 1, w, h, rim), text, x, -2, 2);
        pixelText((tx, ty, w, h) => p.rect(tx, ty, w, h, core), text, x, -2, 2);
      };
      tube('SHIP', 8, screenGlow[1], screenGlow[0]);
      tube('IT', 42, lightWarm[1], lightWarm[0]);
      p.hline(10, 11, 44, back.line);
    });
    return makeVariant({
      w: 2,
      h: 1,
      parts,
      lights: [{ x: 22, y: 4, radius: 48, color: screenGlow[0], intensity: 0.5 }, { x: 48, y: 4, radius: 36, color: lightWarm[0], intensity: 0.45 }],
    });
  },
});

// =========================================================================================================
// Trophy shelf (wall, 2 x 1)

function cup(p: Pen, cx: number, base: number, h: number): void {
  const m = gold;
  const bowlH = Math.round(h * 0.55);
  const top = base - h;
  for (let i = 0; i < bowlH; i++) {
    const half = Math.max(1, Math.round(4 - (i / bowlH) * 2.5 + (h > 12 ? 1 : 0)));
    p.hline(cx - half, top + i, half * 2, i === 0 ? m.hi : m.light);
    p.px(cx - half, top + i, m.hi);
    p.px(cx + half - 1, top + i, m.dark);
  }
  p.px(cx - 5 - (h > 12 ? 1 : 0), top + 1, m.dark);
  p.px(cx - 5 - (h > 12 ? 1 : 0), top + 2, m.dark);
  p.px(cx + 4 + (h > 12 ? 1 : 0), top + 1, m.dark);
  p.px(cx + 4 + (h > 12 ? 1 : 0), top + 2, m.dark);
  p.vline(cx - 1, top + bowlH, h - bowlH - 3, m.dark);
  p.vline(cx, top + bowlH, h - bowlH - 3, m.base);
  p.rect(cx - 3, base - 3, 6, 3, walnut[2]);
  p.hline(cx - 3, base - 3, 6, walnut[4]);
  p.px(cx - 2, top + 1, cream[6]);
}

defineAsset({
  id: 'premium.trophy.shelf',
  name: 'Trophy shelf',
  group: 'premium.trophy',
  category: 'Decor',
  layer: 'wall',
  facings: ['down'],
  keywords: ['trophy', 'award', 'cup', 'gold', 'shelf', 'wall'],
  build() {
    const wood = mat(walnut);
    const parts = single({ x: 0, y: -16, w: 64, h: 40 }, 1, (p) => {
      cup(p, 32, 7, 16);
      cup(p, 18, 7, 11);
      cup(p, 46, 7, 11);
      // a medal on a ribbon and a small plaque
      p.line(8, -4, 9, 1, red[1]);
      p.line(10, -4, 9, 1, blue[2]);
      p.disc(7, 1, 5, gold.base);
      p.px(8, 2, gold.hi);
      p.px(9, 4, gold.dark);
      p.rect(53, 1, 6, 6, wood.base);
      p.frame(53, 1, 6, 6, wood.line);
      p.rect(54, 3, 4, 2, gold.light);
      selOut(p.canvas);
      // brackets and shelf (surface at y 8)
      p.rect(10, 11, 2, 5, wood.dark);
      p.rect(52, 11, 2, 5, wood.dark);
      box(p, 4, 6, 56, 3, 3, wood, { side: false });
    });
    return makeVariant({ w: 2, h: 1, parts, lights: [warmLight(32, 0, 40, 0.25)] });
  },
});

// =========================================================================================================
// Espresso machine on a little cart

defineAsset({
  id: 'premium.espresso',
  name: 'Espresso machine',
  group: 'premium.espresso',
  category: 'Kitchen',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['espresso', 'coffee', 'barista', 'machine'],
  build() {
    const cart = mat(oak);
    const chrome = mat(steel);
    const parts = single(area(1, 1, 32), 32, (p) => {
      box(p, 2, 0, 28, 8, 22, cart);
      p.hline(4, 18, 24, cart.dark);
      p.hline(4, 19, 24, cart.deep);
      p.rect(6, 22, 20, 5, walnut[2]);
      p.hline(6, 22, 20, walnut[4]);
      // machine body with cups warming on top
      box(p, 3, -16, 26, 6, 18, chrome, { round: 1 });
      for (const cx of [7, 12, 17]) {
        p.rect(cx, -18, 3, 3, cream[5]);
        p.hline(cx, -18, 3, cream[6]);
        p.px(cx + 2, -16, cream[3]);
      }
      p.disc(24, -15, 3, cream[6]);
      p.px(25, -14, red[1]);
      p.rect(4, -8, 24, 2, terracotta[3]);
      p.hline(4, -8, 24, terracotta[4]);
      // group head with the portafilter handle sticking out, steam wand
      p.rect(11, -5, 8, 2, chrome.dark);
      p.hline(11, -5, 8, chrome.light);
      p.rect(12, -3, 6, 1, charcoal[1]);
      p.rect(18, -3, 6, 2, walnut[3]);
      p.hline(18, -3, 6, walnut[5]);
      p.vline(7, -5, 5, chrome.dark);
      p.px(7, 0, chrome.line);
      // drip tray and a cup
      p.rect(5, 1, 22, 1, chrome.line);
      p.rect(13, -1, 4, 2, cream[6]);
      p.px(17, 0, cream[4]);
    });
    return makeVariant({
      w: 1,
      h: 1,
      parts,
      spots: [stand(0, 1, 'up', 'coffee')],
      shadows: [shadow(2, 25, 28, 6, 'rect')],
    });
  },
});

// =========================================================================================================
// Record player on a mid-century cabinet: the platter spins

defineAsset({
  id: 'premium.record.player',
  name: 'Record player',
  group: 'premium.record',
  category: 'Lounge',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['record', 'vinyl', 'music', 'turntable'],
  build() {
    const wood = mat(walnut);
    const N = 4;
    const frames = animFrames(N, (f) =>
      single(area(1, 1, 24), 32, (p) => {
        leg(p, 5, 26, 5, mat(oak), 2);
        leg(p, 25, 26, 5, mat(oak), 2);
        box(p, 2, -4, 28, 12, 18, wood);
        // speaker grille and knobs
        p.rect(5, 11, 14, 11, cream[3]);
        p.frame(5, 11, 14, 11, wood.deep);
        for (let y = 13; y < 21; y += 2) {
          p.hline(6, y, 12, cream[2]);
        }
        p.disc(22, 13, 3, gold.base);
        p.px(22, 13, gold.hi);
        p.disc(22, 18, 3, gold.base);
        p.px(22, 18, gold.hi);
        // turntable on top: platter, record, spinning glint, tonearm
        p.rect(4, -3, 24, 10, oak[5]);
        p.hline(4, 6, 24, oak[3]);
        p.ellipse(5, -2, 17, 8, charcoal[1]);
        p.ellipse(7, -1, 13, 6, charcoal[2]);
        p.ellipse(11, 1, 5, 2, red[2]);
        const glint: [number, number][] = [[8, 0], [12, -2], [17, 0], [13, 4]];
        const [gx, gy] = glint[f];
        p.px(gx, gy, charcoal[5]);
        p.px(gx + 1, gy, charcoal[4]);
        p.vline(24, -2, 3, steel[3]);
        p.line(24, -2, 18, 2, steel[5]);
        p.px(18, 3, steel[1]);
      }),
    );
    return makeVariant({
      w: 1,
      h: 1,
      frames,
      anim: { kind: 'loop', fps: 6 },
      shadows: [shadow(2, 26, 28, 5, 'rect')],
    });
  },
});

// =========================================================================================================
// Bird of paradise in a gold pot

defineAsset({
  id: 'premium.plant.gold',
  name: 'Bird of paradise (gold pot)',
  group: 'plant.tall',
  category: 'Decor',
  layer: 'object',
  placement: 'corner',
  facings: ['down'],
  keywords: ['plant', 'gold', 'bird of paradise', 'green'],
  build() {
    const parts = single(area(1, 1, 48, 8), 24, (p) => {
      // [x, y, angle deg, length, width, brightness], back to front
      const blades: [number, number, number, number, number, number][] = [
        [15, 12, -120, 26, 8, -2], [17, 12, -62, 26, 8, -2], [14, 12, -150, 18, 7, -1], [18, 12, -30, 18, 7, -1],
        [16, 12, -98, 30, 8, 0], [16, 12, -80, 24, 8, 1], [15, 12, -132, 20, 7, 0],
      ];
      for (const [x, y, a, len, w, b] of blades) {
        const rad = (a * Math.PI) / 180;
        p.line(x, y, Math.round(x + Math.cos(rad) * len * 0.35), Math.round(y + Math.sin(rad) * len * 0.35), plant[2]);
        leaf(p, x + Math.cos(rad) * len * 0.3, y + Math.sin(rad) * len * 0.3, rad, len * 0.7, w, plant, b, 1.1);
      }
      // the flower: an orange crest over a blue-grey beak
      p.line(20, 0, 23, -10, plant[2]);
      p.vline(21, -6, 4, plant[3]);
      p.rect(22, -12, 7, 2, navy[3]);
      p.hline(22, -12, 7, navy[4]);
      p.px(29, -11, navy[2]);
      p.line(23, -13, 24, -18, terracotta[4]);
      p.line(24, -13, 27, -17, mustard[4]);
      p.line(25, -13, 29, -15, terracotta[5]);
      p.px(23, -19, mustard[4]);
      selOut(p.canvas);
      pot(p, 9, 16, 14, 14, gold, mat(dirt).deep, 2);
      p.vline(11, 23, 5, gold.hi);
    });
    return makeVariant({ w: 1, h: 1, parts, shadows: [shadow(8, 26, 16, 5)] });
  },
});
