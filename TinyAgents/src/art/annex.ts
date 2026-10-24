import { defineAsset } from './registry';
import { Part } from './types';
import {
  Mat, Pen, area, box, charcoal, cream, grain, leg, lightWarm, makeVariant, mat, mustard, navy, oak, red, sage,
  screenGlow, shadow, single, stand, teal, terracotta, walnut, yellow,
} from './kit';
import { mug } from './decor';

// =========================================================================================================
// Pixel lettering (3 x 5, caps) for the signs here

export const FONT: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'], K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['10001', '11011', '10101', '10001', '10001'], N: ['1001', '1101', '1011', '1001', '1001'],
  O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'], Q: ['010', '101', '101', '110', '011'],
  R: ['110', '101', '110', '101', '101'], S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'], W: ['10001', '10001', '10101', '11011', '10001'],
  X: ['101', '101', '010', '101', '101'], Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['110', '001', '010', '100', '111'],
  3: ['110', '001', '010', '001', '110'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '110', '001', '110'],
  6: ['011', '100', '110', '101', '010'], 7: ['111', '001', '010', '010', '010'], 8: ['010', '101', '010', '101', '010'],
  9: ['010', '101', '011', '001', '110'], '&': ['010', '101', '010', '101', '011'], '.': ['0', '0', '0', '0', '1'],
  '-': ['000', '000', '111', '000', '000'], "'": ['1', '1', '0', '0', '0'], '/': ['001', '001', '010', '100', '100'],
  '!': ['1', '1', '1', '0', '1'], ' ': ['00', '00', '00', '00', '00'],
};

/** Upper-cases and keeps only the letters the font has. */
export function signText(s: string): string {
  return [...s.toUpperCase()].filter((ch) => ch in FONT).join('').trim();
}

export function textWidth(s: string): number {
  return [...s].reduce((w, ch) => w + (FONT[ch]?.[0].length ?? 0) + 1, -1);
}

/** Draws `s` (already `signText`) with its top-left at (x, y); `shade` adds a 1 px drop under each glyph. */
export function pixelText(p: Pen, s: string, x: number, y: number, c: string, shade?: string): void {
  for (const [colour, dy] of shade ? [[shade, 1], [c, 0]] as const : [[c, 0]] as const) {
    let cx = x;
    for (const ch of s) {
      const g = FONT[ch];
      if (!g) {
        continue;
      }
      g.forEach((row, gy) => [...row].forEach((bit, gx) => bit === '1' && p.px(cx + gx, y + gy + dy, colour)));
      cx += g[0].length + 1;
    }
  }
}

// =========================================================================================================
// Arcade cabinets: tall cabinet with a lit marquee, a flickering screen and a control deck

function cabinetFrame(body: Mat, trim: string, t: number): (p: Pen) => void {
  const side = mat(charcoal);
  return (p) => {
    box(p, 5, -30, 22, 5, 61, body, { round: 1 });
    // charcoal side panels hugging the front, the coloured body shows as a stripe of side art
    p.rect(6, -24, 2, 54, side.base);
    p.rect(24, -24, 2, 54, side.dark);
    p.vline(8, -24, 54, body.hi);
    // marquee
    p.rect(8, -24, 16, 7, side.line);
    p.rect(9, -23, 14, 5, mustard[4]);
    p.hline(9, -23, 14, cream[6]);
    p.hline(9, -21, 14, red[1]);
    p.hline(9, -20, 14, red[0]);
    for (const sx of [11, 15, 19]) {
      p.px(sx, -22, cream[6]);
    }
    // screen bezel, tilted back: the top band is darker
    p.rect(8, -15, 16, 16, side.line);
    p.hline(9, -15, 14, side.dark);
    const sx = 10;
    const sy = -13;
    p.rect(sx, sy, 12, 12, navy[0]);
    // a tiny maze game: walls, dots and a yellow runner whose position depends on the frame
    p.hline(sx + 1, sy + 2, 10, navy[3]);
    p.hline(sx + 1, sy + 9, 10, navy[3]);
    p.vline(sx + 5, sy + 4, 3, navy[3]);
    for (let i = 0; i < 4; i++) {
      p.px(sx + 2 + i * 3, sy + 6, cream[5]);
    }
    const rx = sx + 1 + t * 3;
    p.rect(rx, sy + 5, 3, 3, yellow[2]);
    p.px(rx + 2, sy + 6, navy[0]);
    p.px(sx + 10 - t * 2, sy + 4, red[2]);
    p.px(sx, sy, screenGlow[1]);
    // control deck jutting forward with a joystick and two buttons
    box(p, 4, 2, 24, 6, 4, side, { round: 1 });
    p.rect(9, -1, 2, 5, side.line);
    p.disc(8, -3, 4, red[1]);
    p.px(9, -2, red[2]);
    p.rect(16, 4, 3, 2, trim);
    p.rect(21, 4, 3, 2, yellow[2]);
    p.hline(16, 4, 3, cream[6]);
    // coin door
    p.rect(12, 16, 8, 9, side.base);
    p.frame(12, 16, 8, 9, side.line);
    p.rect(14, 18, 1, 3, red[2]);
    p.rect(17, 18, 1, 3, red[2]);
    p.hline(13, 23, 6, side.light);
    p.hline(6, 30, 20, body.line);
  };
}

for (const [id, name, ramp, trim] of [
  ['arcade.cabinet.red', 'Arcade cabinet (red)', terracotta, screenGlow[0]],
  ['arcade.cabinet.blue', 'Arcade cabinet (blue)', navy, red[2]],
] as const) {
  defineAsset({
    id,
    name,
    group: 'arcade.cabinet',
    category: 'Lounge',
    layer: 'object',
    placement: 'wall',
    facings: ['down'],
    keywords: ['arcade', 'game', 'cabinet', 'retro', 'play'],
    build() {
      const body = mat(ramp, ramp.length > 5 ? 1 : 0);
      const frames: Part[][] = [0, 1, 2, 1].map((t) => single(area(1, 1, 36, 4), 32, cabinetFrame(body, trim, t)));
      return makeVariant({
        w: 1,
        h: 1,
        frames,
        anim: { kind: 'loop', fps: 3 },
        spots: [stand(0, 1, 'up', 'play')],
        shadows: [shadow(4, 26, 25, 6, 'rect')],
        lights: [{ x: 16, y: -6, radius: 34, color: screenGlow[0], intensity: 0.34 }, { x: 16, y: -21, radius: 20, color: lightWarm[1], intensity: 0.2 }],
      });
    },
  });
}

// =========================================================================================================
// Board-game table: walnut table with a game in progress, cards and dice

defineAsset({
  id: 'table.boardgame',
  name: 'Board-game table',
  group: 'table.game',
  category: 'Lounge',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['table', 'board game', 'cards', 'dice', 'play', 'games'],
  build() {
    const wood = mat(walnut);
    const parts = single(area(2, 1, 24), 32, (p) => {
      leg(p, 3, 18, 11, mat(walnut, 1), 3);
      leg(p, 58, 18, 11, mat(walnut, 1), 3);
      p.hline(6, 19, 52, wood.deep);
      box(p, 0, -4, 64, 19, 4, wood, { round: 1 });
      grain(p, 2, -2, 60, 15, wood.base, 41);
      // the board: cream frame, sage and cream track around a teal centre
      const bx = 18;
      const by = -2;
      p.rect(bx, by, 26, 14, mat(oak).line);
      p.rect(bx + 1, by + 1, 24, 12, cream[5]);
      for (let i = 0; i < 6; i++) {
        p.rect(bx + 2 + i * 4, by + 2, 3, 2, i % 2 ? sage[3] : terracotta[4]);
        p.rect(bx + 2 + i * 4, by + 10, 3, 2, i % 2 ? terracotta[4] : sage[3]);
      }
      p.rect(bx + 5, by + 5, 16, 4, teal[3]);
      p.hline(bx + 5, by + 5, 16, teal[4]);
      // pawns standing on the track
      for (const [px, c] of [[bx + 4, red[1]], [bx + 13, navy[3]], [bx + 21, yellow[1]]] as const) {
        p.rect(px, by + 7, 2, 3, c);
        p.px(px, by + 6, c);
        p.px(px, by + 7, cream[6]);
      }
      // a fanned hand of cards, the draw pile and two dice
      for (let i = 0; i < 3; i++) {
        p.rect(4 + i * 3, 1 + i, 6, 8, cream[6]);
        p.frame(4 + i * 3, 1 + i, 6, 8, cream[3]);
        p.px(6 + i * 3, 3 + i, i === 1 ? red[1] : charcoal[2]);
      }
      p.rect(50, -1, 8, 10, navy[2]);
      p.frame(50, -1, 8, 10, navy[0]);
      p.hline(51, 0, 6, navy[4]);
      p.rect(49, 10, 4, 4, cream[6]);
      p.px(50, 11, charcoal[1]);
      p.px(51, 12, charcoal[1]);
      p.rect(55, 10, 4, 4, red[2]);
      p.px(56, 11, cream[6]);
      mug(p, 6, 10, sage);
    });
    return makeVariant({ w: 2, h: 1, parts, shadows: [shadow(1, 14, 62, 15, 'rect')] });
  },
});

// =========================================================================================================
// Café wall menu (chalkboard) and arcade neon sign (wall layer: the face spans y = -8 .. 32)

defineAsset({
  id: 'wall.menu',
  name: 'Chalkboard menu',
  group: 'wall.menu',
  category: 'Kitchen',
  layer: 'wall',
  facings: ['down'],
  keywords: ['menu', 'chalkboard', 'cafe', 'coffee', 'board'],
  build() {
    const frame = mat(oak);
    const parts = single({ x: 0, y: -10, w: 64, h: 34 }, 1, (p) => {
      p.rect(9, -6, 46, 24, frame.line);
      p.rect(10, -5, 44, 22, frame.base);
      p.hline(10, -5, 44, frame.light);
      p.rect(12, -3, 40, 18, charcoal[1]);
      p.hline(12, -3, 40, charcoal[2]);
      pixelText(p, 'MENU', 24, -1, cream[6]);
      p.hline(24, 5, 15, cream[3]);
      // three chalk lines with prices, a coffee-cup doodle
      for (let i = 0; i < 3; i++) {
        p.hline(15, 8 + i * 3, 10 + (i % 2) * 4, cream[4]);
        p.hline(44, 8 + i * 3, 4, i === 0 ? mustard[4] : cream[5]);
      }
      p.rect(31, 9, 6, 4, terracotta[5]);
      p.px(37, 10, terracotta[5]);
      p.hline(30, 13, 8, cream[4]);
      p.px(32, 7, cream[3]);
      p.px(34, 6, cream[3]);
      // chalk ledge
      p.rect(10, 17, 44, 2, frame.dark);
      p.rect(16, 16, 4, 1, cream[6]);
      p.rect(42, 16, 3, 1, terracotta[5]);
    });
    return makeVariant({ w: 2, h: 1, parts });
  },
});

defineAsset({
  id: 'wall.neon',
  name: 'Neon sign (PLAY)',
  group: 'wall.neon',
  category: 'Lighting',
  layer: 'wall',
  facings: ['down'],
  keywords: ['neon', 'sign', 'arcade', 'play', 'light'],
  build() {
    const board = mat(charcoal);
    const parts = single({ x: 0, y: -10, w: 64, h: 34 }, 1, (p) => {
      p.rect(8, -5, 48, 20, board.line);
      p.rect(9, -4, 46, 18, board.deep);
      p.hline(9, -4, 46, board.dark);
      // tubes: a halo step, then the bright core
      const tube = (draw: (c: string, o: number) => void, halo: string, core: string) => {
        draw(halo, 1);
        draw(core, 0);
      };
      const letters = (c: string, o: number) => {
        const glyphs = ['PLAY'];
        for (const s of glyphs) {
          let cx = 17;
          for (const ch of s) {
            FONT[ch].forEach((row, gy) => [...row].forEach((bit, gx) => {
              if (bit === '1') {
                p.rect(cx + gx * 2 - o, -1 + gy * 2 - o, 2 + o * 2, 2 + o * 2, c);
              }
            }));
            cx += FONT[ch][0].length * 2 + 2;
          }
        }
      };
      tube(letters, '#3d7f9e', screenGlow[1]);
      // warm tube dots either side
      for (const dx of [12, 50]) {
        tube((c, o) => p.rect(dx - o, 3 - o, 2 + o * 2, 2 + o * 2, c), terracotta[3], lightWarm[1]);
      }
    });
    return makeVariant({ w: 2, h: 1, parts, lights: [{ x: 32, y: 6, radius: 70, color: screenGlow[0], intensity: 0.45 }] });
  },
});
