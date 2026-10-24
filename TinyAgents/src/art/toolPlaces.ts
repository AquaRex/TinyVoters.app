import { defineAsset } from './registry';
import { Part } from './types';
import {
  Pen, area, box, charcoal, cream, drawers, glint, grain, layered, leg, makeVariant, mat, mustard, navy, oak, plant,
  red, sage, screenGlow, screenLight, shadow, single, stand, steel, teal, terracotta, walnut, water, yellow,
} from './kit';

// Places where Claude's tools happen: reading files, browsing the web, running commands and tests, shredding notes.

/** The QA bench's signal lamp glass, in footprint px; the work-visibility feature paints it green, red or amber. */
export const QA_BULB = { x: 53, y: -11, w: 7, h: 6 };

/** A ring binder standing on a shelf: spine with a label and a finger hole. */
function binder(p: Pen, x: number, bottom: number, h: number, ramp: readonly string[]): void {
  const m = mat(ramp);
  p.rect(x, bottom - h, 3, h, m.base);
  p.vline(x, bottom - h, h, m.light);
  p.hline(x, bottom - h, 3, m.light);
  p.px(x + 1, bottom - h + 3, cream[5]);
  p.px(x + 1, bottom - h + 4, cream[4]);
  p.px(x + 1, bottom - 3, m.line);
}

defineAsset({
  id: 'cabinet.archive',
  name: 'Archive cabinet',
  group: 'cabinet.archive',
  category: 'Work',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['archive', 'binders', 'files', 'cabinet', 'records'],
  build() {
    const wood = mat(walnut);
    const parts = single(area(1, 1, 40), 32, (p) => {
      box(p, 2, -14, 28, 7, 39, wood, { edge: 'lip' });
      grain(p, 4, -13, 24, 5, wood.base, 5);
      // open cubby with a row of binders, one pulled half out
      p.rect(4, -5, 24, 14, wood.deep);
      p.hline(4, -5, 24, wood.line);
      const ramps = [navy, terracotta, sage, mustard, navy, cream, teal];
      ramps.forEach((r, i) => {
        if (i !== 4) {
          binder(p, 5 + i * 3, 9, 12 - (i % 2), r);
        }
      });
      binder(p, 17, 7, 14, mustard);
      p.hline(16, 8, 5, mat(walnut).line);
      p.hline(3, 9, 26, wood.light);
      p.hline(3, 10, 26, wood.dark);
      // two deep drawers with label holders
      drawers(p, 4, 12, 24, 18, 2, wood, mat(steel).hi);
      for (const y of [13, 22]) {
        p.rect(13, y, 6, 2, cream[5]);
        p.hline(13, y + 1, 6, cream[4]);
      }
      p.rect(3, 30, 26, 1, wood.line);
    });
    return makeVariant({ w: 1, h: 1, parts, spots: [stand(0, 1, 'up', 'files')], shadows: [shadow(2, 26, 28, 5, 'rect')] });
  },
});

defineAsset({
  id: 'kiosk.internet',
  name: 'Internet kiosk',
  group: 'kiosk',
  category: 'Work',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['internet', 'kiosk', 'terminal', 'web', 'browser', 'search'],
  build() {
    const body = mat(charcoal, 1);
    const trim = mat(teal);
    const sea = mat(water);
    const parts = single(area(1, 1, 40), 32, (p) => {
      box(p, 7, 25, 18, 3, 3, body, { round: 1 });
      box(p, 12, 6, 8, 2, 19, body, { edge: 'soft' });
      p.vline(15, 9, 14, trim.base);
      p.vline(15, 9, 2, trim.hi);
      // keyboard ledge
      box(p, 6, 1, 20, 4, 2, mat(steel));
      for (let x = 8; x < 24; x += 2) {
        p.px(x, 2, steel[3]);
      }
      // head with a teal header strip and the screen showing a globe
      box(p, 5, -21, 22, 3, 19, body, { round: 1, edge: 'lip' });
      p.hline(7, -18, 18, trim.light);
      p.px(23, -18, trim.hi);
      p.rect(7, -16, 18, 12, sea.dark);
      p.disc(11, -15, 10, sea.light);
      p.rect(13, -14, 3, 3, plant[4]);
      p.rect(17, -12, 3, 4, plant[4]);
      p.px(14, -9, plant[4]);
      p.vline(16, -15, 10, sea.base);
      p.hline(11, -10, 10, sea.base);
      glint(p, 12, -14, 1, screenGlow[1]);
      p.hline(21, -6, 3, screenGlow[0]);
      p.hline(7, -4, 18, body.dark);
    });
    return makeVariant({
      w: 1,
      h: 1,
      parts,
      spots: [stand(0, 1, 'up', 'web')],
      shadows: [shadow(6, 25, 20, 5)],
      lights: [screenLight(16, -10, 22, 0.24)],
    });
  },
});

/** One rack unit row: a face plate with vents and status LEDs that blink per frame. */
function rackUnit(p: Pen, y: number, row: number, frame: number): void {
  const m = mat(charcoal);
  p.rect(6, y, 20, 4, m.dark);
  p.hline(6, y, 20, m.base);
  for (let x = 15; x < 24; x += 2) {
    p.px(x, y + 2, m.deep);
  }
  const leds = [plant[5], mustard[4], screenGlow[0]];
  for (let i = 0; i < 3; i++) {
    const on = ((row * 7 + i * 5 + frame * (i + 1)) % 4) !== 0;
    p.px(8 + i * 2, y + 2, on ? leds[(row + i) % 3] : m.deep);
  }
}

defineAsset({
  id: 'rack.server',
  name: 'Server rack',
  group: 'rack',
  category: 'Work',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['server', 'rack', 'network', 'computer', 'bash', 'terminal'],
  build() {
    const m = mat(charcoal, 1);
    const frames: Part[][] = [0, 1, 2, 3].map((f) =>
      single(area(1, 1, 24), 32, (p) => {
        box(p, 3, -14, 26, 6, 39, m, { edge: 'lip' });
        // cables looping out of the top
        p.line(9, -12, 12, -10, mat(navy).base);
        p.line(20, -12, 23, -10, mat(terracotta).base);
        p.rect(5, -6, 22, 34, m.deep);
        for (let row = 0; row < 6; row++) {
          rackUnit(p, -5 + row * 5, row, f);
        }
        // patch panel at the bottom and a little steel handle on the door edge
        p.rect(6, 25, 20, 2, m.base);
        p.vline(27, 0, 12, mat(steel).light);
        p.rect(4, 29, 3, 2, m.line);
        p.rect(25, 29, 3, 2, m.line);
      }),
    );
    return makeVariant({
      w: 1,
      h: 1,
      frames,
      anim: { kind: 'loop', fps: 3 },
      spots: [stand(0, 1, 'up', 'server')],
      shadows: [shadow(3, 26, 26, 5, 'rect')],
      lights: [screenLight(16, 8, 16, 0.12)],
    });
  },
});

defineAsset({
  id: 'bench.qa',
  name: 'QA test bench',
  group: 'bench.qa',
  category: 'Work',
  layer: 'object',
  placement: 'free',
  facings: ['down'],
  keywords: ['qa', 'test', 'bench', 'lab', 'workbench', 'lamp'],
  build() {
    const wood = mat(oak, 1);
    const frame = mat(steel, 1);
    const parts = layered(area(2, 1, 40), (L) => {
      const p = L(32);
      leg(p, 3, 14, 16, frame, 2);
      leg(p, 59, 14, 16, frame, 2);
      p.rect(4, 24, 56, 2, frame.base);
      p.hline(4, 24, 56, frame.light);
      // a crate of parts on the lower shelf
      box(p, 8, 19, 12, 2, 4, mat(mustard, 1), { edge: 'soft' });
      box(p, 0, 6, 64, 8, 5, wood);
      grain(p, 2, 7, 60, 6, wood.base, 23);
      // device under test: a green board with a chip, wired to a meter
      const pcb = mat(sage, 1);
      box(p, 20, 1, 15, 7, 2, pcb, { edge: 'soft' });
      p.rect(25, 3, 5, 3, charcoal[2]);
      p.hline(25, 3, 5, charcoal[4]);
      p.px(22, 2, yellow[2]);
      p.px(33, 6, yellow[2]);
      p.line(35, 4, 40, 3, red[1]);
      p.line(35, 6, 40, 5, charcoal[3]);
      const meter = mat(mustard);
      box(p, 40, -3, 10, 4, 8, meter, { round: 1 });
      p.rect(42, 0, 6, 3, mat(sage).dark);
      p.hline(43, 1, 3, plant[6]);
      p.px(44, 6, charcoal[2]);
      // signal lamp tower: steel post, glass dome (painted live), base
      p.rect(54, -5, 5, 11, frame.base);
      p.vline(54, -5, 11, frame.light);
      p.vline(58, -5, 11, frame.dark);
      p.rect(52, 5, 9, 3, frame.dark);
      p.hline(52, 5, 9, frame.light);
      p.rect(QA_BULB.x - 1, QA_BULB.y - 1, QA_BULB.w + 2, QA_BULB.h + 2, frame.line);
      p.rect(QA_BULB.x, QA_BULB.y, QA_BULB.w, QA_BULB.h, steel[4]);
      p.hline(QA_BULB.x, QA_BULB.y, QA_BULB.w, steel[5]);
      p.px(QA_BULB.x + 1, QA_BULB.y + 1, steel[6]);
      // test log sheet
      p.rect(6, 8, 9, 4, cream[6]);
      p.hline(7, 9, 6, cream[3]);
      p.hline(7, 11, 4, cream[3]);
    });
    return makeVariant({
      w: 2,
      h: 1,
      parts,
      spots: [stand(1, -1, 'down', 'qa')],
      shadows: [shadow(0, 24, 64, 7, 'rect')],
    });
  },
});

defineAsset({
  id: 'shredder',
  name: 'Paper shredder',
  group: 'shredder',
  category: 'Work',
  layer: 'object',
  placement: 'wall',
  facings: ['down'],
  keywords: ['shredder', 'paper', 'bin', 'compact'],
  build() {
    const bin = mat(steel, 1);
    const head = mat(charcoal);
    const paper = mat(cream);
    const parts = single(area(1, 1, 24), 32, (p) => {
      box(p, 7, 6, 18, 3, 24, bin, { edge: 'soft' });
      // window showing the shredded strips
      p.rect(10, 13, 12, 12, bin.deep);
      for (let x = 11; x < 21; x += 2) {
        const h = 4 + ((x * 5) % 6);
        p.vline(x, 25 - h, h, paper.light);
        p.vline(x + 1, 26 - h, h - 1, paper.base);
      }
      p.hline(10, 13, 12, bin.line);
      // motor head with the feed slot, a sheet going in, and the power light
      box(p, 6, -1, 20, 5, 6, head, { edge: 'lip' });
      p.hline(9, 1, 14, head.line);
      p.rect(11, -7, 10, 8, paper.light);
      p.hline(11, -7, 10, paper.hi);
      p.vline(20, -6, 7, paper.base);
      p.hline(12, -4, 6, paper.dark);
      p.hline(12, -2, 4, paper.dark);
      p.px(23, 2, plant[5]);
      p.rect(8, 29, 16, 1, bin.line);
    });
    return makeVariant({ w: 1, h: 1, parts, spots: [stand(0, 1, 'up', 'shred')], shadows: [shadow(7, 26, 18, 5)] });
  },
});

defineAsset({
  id: 'bell.desk',
  name: 'Desk bell',
  group: 'bell',
  category: 'Work',
  layer: 'surface',
  placement: 'free',
  facings: ['down'],
  keywords: ['bell', 'ring', 'reception', 'service'],
  build() {
    const brass = mat(yellow);
    const base = mat(walnut);
    const parts = single(area(1, 1, 16), 40, (p) => {
      // sits on the reception ledge (2 px larger than the ledge's own bell, so it covers it)
      p.rect(5, 29, 12, 2, base.base);
      p.hline(5, 29, 12, base.light);
      p.hline(5, 31, 12, base.line);
      p.ellipse(6, 23, 10, 8, brass.base);
      p.rect(6, 27, 10, 2, brass.base);
      p.hline(6, 28, 10, mat(mustard).dark);
      p.ellipse(7, 24, 5, 3, brass.light);
      glint(p, 8, 24, 1, cream[6]);
      p.rect(10, 21, 2, 2, steel[4]);
      p.px(10, 21, steel[6]);
      // a little tent card
      p.rect(18, 25, 6, 5, cream[6]);
      p.hline(18, 25, 6, cream[4]);
      p.hline(19, 27, 4, red[1]);
      p.hline(18, 30, 6, cream[3]);
    });
    return makeVariant({ w: 1, h: 1, mask: ['.'], parts, spots: [stand(0, 2, 'up', 'bell')] });
  },
});
