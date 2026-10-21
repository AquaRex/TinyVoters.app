import { defineAsset } from './registry';
import {
  Pen, area, box, cream, cylinder, glint, layered, makeVariant, mat, mustard, oak, paintShape, sage, shadow, single,
  stand, steel, water,
} from './kit';

const porcelain = mat(cream);
const chrome = mat(steel);
const panel = mat(sage);

/** Partition height above the floor; the panels float 3 px above the floor on steel feet. */
const PART_H = 34;
const FRONT_Y = 28;
const WALL_Y = -12;

/**
 * A stall partition running north-south, seen edge-on: its lit top edge from the wall to the front, then the front
 * end face down to the floor. Centred on the tile boundary at `x` so neighbouring stalls share one partition.
 */
function partition(p: Pen, x: number): void {
  const yTop = WALL_Y - PART_H;
  const yFront = FRONT_Y - PART_H;
  const w = 4;
  // top edge seen from above (lit), then the front end: a pilaster with a steel cap and a steel foot
  p.rect(x, yTop, w, yFront - yTop, panel.light);
  p.vline(x, yTop, yFront - yTop, panel.hi);
  p.vline(x + w - 1, yTop, yFront - yTop, panel.base);
  p.rect(x, yFront, w, PART_H - 3, panel.base);
  p.vline(x, yFront, PART_H - 3, panel.light);
  p.vline(x + w - 1, yFront, PART_H - 3, panel.dark);
  p.hline(x, yFront, w, chrome.hi);
  p.hline(x, yFront + 1, w, chrome.base);
  p.frame(x - 1, yTop - 1, w + 2, FRONT_Y - 3 - yTop + 1, panel.line);
  p.rect(x, FRONT_Y - 3, w, 3, chrome.dark);
  p.hline(x, FRONT_Y - 3, w, chrome.light);
}

/**
 * The stall door, hinged on the east partition. `open` 0 is shut across the stall front; as it opens the free
 * edge swings out toward the viewer (3/4 view: x shrinks by cos, the edge drops by sin, foreshortened).
 */
function door(p: Pen, open: number): void {
  const hingeX = 30;
  const L = 28;
  const h = PART_H - 4;
  const angle = open * Math.PI * 0.47;
  const span = Math.max(2, Math.round(L * Math.cos(angle)));
  const drop = Math.round(L * Math.sin(angle) * 0.6);
  const x0 = hingeX - span;
  const y0 = FRONT_Y - 3 - h;
  // column cx runs from the free edge (0) to the hinge (span); the free edge sits `drop` px nearer the viewer
  const topAt = (cx: number) => Math.round(drop * (1 - cx / span));
  paintShape(p, x0, y0, span + 1, h + drop + 1, (cx, cy) => cy >= topAt(cx) && cy <= topAt(cx) + h, (cx, cy, o, isEdge) => {
    if (isEdge) {
      return (o.up || o.left) && !o.down ? panel.lineLit : panel.line;
    }
    const k = cy - topAt(cx);
    if (k < 2) {
      return panel.hi;
    }
    if (k > h - 3) {
      return panel.dark;
    }
    return cx < 3 ? panel.light : panel.base;
  });
  if (span > 8) {
    for (let cx = 4; cx < span - 2; cx++) {
      p.px(x0 + cx, y0 + topAt(cx) + 5, panel.dark);
      p.px(x0 + cx, y0 + topAt(cx) + h - 6, panel.light);
    }
    // handle near the free edge, occupancy latch by the hinge (red when shut, green when free)
    p.rect(x0 + 2, y0 + topAt(2) + 12, 1, 4, chrome.hi);
    p.px(x0 + 2, y0 + topAt(2) + 16, chrome.line);
  }
  p.rect(hingeX - 4, y0 + 10, 2, 2, open < 0.2 ? '#b5443a' : '#4a8f4a');
}

function toilet(p: Pen): void {
  // cistern against the wall, a spare roll on the lid
  box(p, 8, -16, 16, 4, 12, porcelain, { round: 1 });
  p.rect(14, -15, 4, 1, chrome.base);
  cylinder(p, 18, -21, 5, 5, porcelain, 2, porcelain.dark);
  // pedestal and bowl, seat ring
  p.rect(12, 12, 8, 10, porcelain.base);
  p.vline(12, 12, 10, porcelain.light);
  p.vline(19, 12, 10, porcelain.dark);
  p.frame(11, 12, 10, 11, porcelain.line);
  p.ellipse(7, -2, 18, 16, porcelain.line);
  p.ellipse(8, -1, 16, 14, porcelain.hi);
  p.ellipse(10, 1, 12, 9, porcelain.dark);
  p.ellipse(11, 2, 10, 7, water[4]);
  p.hline(13, 3, 4, water[5]);
  p.hline(9, 11, 14, porcelain.base);
}

defineAsset({
  id: 'toilet.stall',
  name: 'Toilet stall',
  group: 'toilet',
  category: 'Restroom',
  layer: 'object',
  facings: ['down'],
  keywords: ['toilet', 'stall', 'wc', 'restroom', 'bathroom'],
  build() {
    // frames run shut -> wide open; the director drives them (shut while someone is inside)
    const frames = [0, 0.25, 0.5, 0.75, 1].map((open) =>
      layered(area(1, 1, 56, 10), (L) => {
        toilet(L(16));
        const near = L(FRONT_Y);
        partition(near, -2);
        partition(near, 30);
        door(L(40), open);
      }),
    );
    return makeVariant({
      w: 1,
      h: 1,
      mask: ['s'],
      spots: [{ dx: 0, dy: 0, facing: 'down', pose: 'sit', activity: 'toilet' }],
      frames,
      anim: { kind: 'door' },
      shadows: [shadow(8, 18, 16, 8)],
    });
  },
});

defineAsset({
  id: 'sink.vanity',
  name: 'Vanity sink',
  group: 'sink',
  category: 'Restroom',
  layer: 'object',
  facings: ['down'],
  keywords: ['sink', 'basin', 'mirror', 'wash', 'restroom', 'bathroom'],
  build() {
    const wood = mat(oak);
    const brass = mat(mustard);
    const parts = single(area(1, 1, 56, 4), 32, (p) => {
      // round brass mirror on the wall above
      p.disc(5, -48, 22, brass.line);
      p.disc(6, -47, 20, brass.light);
      p.disc(7, -46, 18, brass.base);
      p.disc(8, -45, 16, water[5]);
      p.ellipse(8, -38, 16, 9, water[4]);
      p.line(11, -40, 15, -44, '#ffffff');
      p.line(12, -38, 17, -43, cream[6]);
      p.line(19, -34, 21, -36, cream[6]);
      p.px(16, -49, brass.hi);
      // stone countertop with a vessel basin, tap and soap
      box(p, 2, -4, 28, 11, 3, porcelain, { round: 1 });
      p.ellipse(8, -6, 16, 9, porcelain.line);
      p.ellipse(9, -6, 14, 8, porcelain.hi);
      p.ellipse(11, -5, 10, 5, porcelain.dark);
      p.ellipse(12, -4, 8, 3, water[5]);
      p.vline(16, -12, 5, chrome.light);
      p.hline(16, -12, 3, chrome.light);
      p.px(18, -11, chrome.line);
      p.rect(15, -8, 3, 2, chrome.base);
      p.rect(24, -6, 3, 5, sage[3]);
      p.vline(24, -6, 5, sage[4]);
      p.rect(25, -8, 1, 2, chrome.base);
      p.hline(24, -8, 2, chrome.base);
      // oak cabinet with a shelf of rolled towels
      box(p, 3, 9, 26, 1, 19, wood, { edge: 'line' });
      p.rect(5, 12, 22, 7, wood.deep);
      for (let i = 0; i < 3; i++) {
        p.disc(6 + i * 7, 13, 6, cream[6]);
        p.disc(7 + i * 7, 14, 4, cream[5]);
        p.px(8 + i * 7, 15, cream[3]);
      }
      p.rect(5, 20, 22, 6, wood.base);
      p.hline(5, 20, 22, wood.light);
      p.hline(13, 22, 6, mustard[4]);
      p.rect(4, 28, 24, 2, wood.line);
      glint(p, 10, -44);
    });
    return makeVariant({
      w: 1,
      h: 1,
      spots: [stand(0, 1, 'up', 'wash')],
      parts,
      shadows: [shadow(3, 25, 26, 6, 'rect')],
    });
  },
});

defineAsset({
  id: 'wall.dryer',
  name: 'Hand dryer',
  group: 'wall.dryer',
  category: 'Restroom',
  layer: 'wall',
  facings: ['down'],
  keywords: ['dryer', 'hand dryer', 'restroom', 'wall'],
  build() {
    const parts = single({ x: 0, y: -8, w: 32, h: 40 }, 1, (p) => {
      const m = mat(steel);
      box(p, 9, 0, 14, 3, 11, m, { round: 2 });
      p.hline(11, 2, 6, m.hi);
      p.rect(12, 8, 8, 2, m.dark);
      p.hline(12, 8, 8, m.line);
      p.rect(14, 14, 4, 2, m.dark);
      p.hline(14, 15, 4, m.line);
      p.px(20, 5, '#7fd0e8');
      p.hline(12, 5, 5, m.base);
    });
    return makeVariant({ w: 1, h: 1, parts });
  },
});
