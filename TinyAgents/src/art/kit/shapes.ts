/**
 * 3/4 drawing primitives. They all take a Pen and screen coordinates (what you see, not a plan), and a Mat
 * (material tones from `mat(ramp)`). Light comes from the top-left: top faces `light`, front faces `base`,
 * undersides and right edges `dark`, outline `line` (lifted to `lineLit` on top/left edges).
 */
import { Pen } from './canvas';
import { Mat, Ramp, mat, charcoal, screenGlow, steel, ink } from './palette';
import { bayer, hash2, rng } from './rand';

export interface Edges {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Per-pixel painter for any shape: `inside(cx, cy)` defines the silhouette in local coords (0..w-1, 0..h-1);
 * `color(cx, cy, open)` picks each pixel's colour, where `open` tells which neighbours lie outside the shape
 * (so you can paint outlines, lit edges and rims). Return null to leave a pixel untouched.
 */
export function paintShape(
  p: Pen,
  x: number,
  y: number,
  w: number,
  h: number,
  inside: (cx: number, cy: number) => boolean,
  color: (cx: number, cy: number, open: Edges, edge: boolean) => string | null,
): void {
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      if (!inside(cx, cy)) {
        continue;
      }
      const open: Edges = {
        up: cy === 0 || !inside(cx, cy - 1),
        down: cy === h - 1 || !inside(cx, cy + 1),
        left: cx === 0 || !inside(cx - 1, cy),
        right: cx === w - 1 || !inside(cx + 1, cy),
      };
      const c = color(cx, cy, open, open.up || open.down || open.left || open.right);
      if (c) {
        p.px(x + cx, y + cy, c);
      }
    }
  }
}

/** Corner cut (px) for row `row` of a rounded rect of height h and radius r (0-3). */
export function cornerCut(row: number, h: number, r: number): number {
  const k = Math.min(row, h - 1 - row);
  if (k >= r) {
    return 0;
  }
  return [[1], [2, 1], [3, 1, 1]][r - 1][k];
}

/** Inside-test for a rounded rect, optionally rounding only the top or bottom corners. */
export function roundedInside(w: number, h: number, rTop: number, rBottom = rTop) {
  return (cx: number, cy: number) => {
    const top = cy < h / 2;
    const r = top ? rTop : rBottom;
    const cut = r === 0 ? 0 : top ? cornerCut(cy, h * 2, r) : cornerCut(h - 1 - cy, h * 2, r);
    return cx >= cut && cx < w - cut;
  };
}

export interface BoxOpts {
  /** Corner radius of the silhouette (0-3). Default 0 (hard corners still lose their 1 px corner pixel). */
  round?: number;
  /** How the top meets the front: 'lip' (lit front edge, default), 'line' (dark plane line), 'soft' (none). */
  edge?: 'lip' | 'line' | 'soft';
  /** Darken the rightmost inner column of the front face (default true). */
  side?: boolean;
  outline?: boolean;
}

/**
 * A 3/4 box: top face (x, y, w, d) and a front face of height h below it. Total screen size w x (d + h).
 * Outline is drawn inside the rect. Overlay details (drawers, grain, cushions) afterwards.
 */
export function box(p: Pen, x: number, y: number, w: number, d: number, h: number, m: Mat, o: BoxOpts = {}): void {
  const H = d + h;
  const round = o.round ?? 0;
  const edge = o.edge ?? 'lip';
  const outline = o.outline !== false;
  const inside = round > 0 ? roundedInside(w, H, round) : (cx: number, cy: number) =>
    !((cx === 0 || cx === w - 1) && (cy === 0 || cy === H - 1));
  paintShape(p, x, y, w, H, inside, (cx, cy, open, isEdge) => {
    if (isEdge && outline) {
      return cy < d && (open.up || open.left) && !open.right ? m.lineLit : m.line;
    }
    if (cy < d - 1) {
      return m.light;
    }
    if (cy === d - 1) {
      return edge === 'lip' ? m.hi : edge === 'line' ? m.dark : m.light;
    }
    if (cy === H - 2 && h >= 3) {
      return m.dark;
    }
    if (o.side !== false && cx === w - 2 && h >= 3) {
      return m.dark;
    }
    return m.base;
  });
}

/**
 * A soft upholstered block (seat cushion, sofa arm, backrest pad): rounded silhouette, sheen on the top,
 * rounded shading on the front. Same geometry as `box`.
 */
export function cushion(p: Pen, x: number, y: number, w: number, d: number, h: number, m: Mat, round = 2): void {
  const H = d + h;
  paintShape(p, x, y, w, H, roundedInside(w, H, round), (cx, cy, open, isEdge) => {
    if (isEdge) {
      return cy < d && (open.up || open.left) && !open.right && !open.down ? m.lineLit : m.line;
    }
    if (cy < d) {
      if (cy === 1 && cx >= 2 && cx < Math.max(3, Math.floor(w * 0.45))) {
        return m.hi;
      }
      if (cx === w - 2 && cy > 1) {
        return m.base;
      }
      return m.light;
    }
    if (cy >= H - 2 || (cx === w - 2 && cy > d)) {
      return m.dark;
    }
    return m.base;
  });
}

/**
 * A cylinder seen from 3/4 (pot, bin, stool, water bottle): elliptical top of height `rim`, body below.
 * `fill` paints the opening (soil, water) or null for a closed lid in `light`.
 */
export function cylinder(p: Pen, x: number, y: number, w: number, h: number, m: Mat, rim = Math.max(3, Math.round(w / 3)), fill: string | null = null): void {
  const ry = rim / 2;
  const inEll = (cx: number, cy: number, top: number) => {
    const dx = (cx + 0.5 - w / 2) / (w / 2);
    const dy = (cy + 0.5 - top - ry) / ry;
    return dx * dx + dy * dy <= 1.08;
  };
  const inside = (cx: number, cy: number) => inEll(cx, cy, 0) || (cy >= ry && cy < h - ry) || inEll(cx, cy, h - rim);
  const innerTop = (cx: number, cy: number) => {
    const dx = (cx + 0.5 - w / 2) / (w / 2 - 1.5);
    const dy = (cy + 0.5 - ry) / (ry - 1);
    return dx * dx + dy * dy <= 1;
  };
  paintShape(p, x, y, w, h, inside, (cx, cy, open, isEdge) => {
    const onTop = inEll(cx, cy, 0) && cy < rim;
    if (isEdge) {
      return onTop && (open.up || open.left) ? m.lineLit : m.line;
    }
    if (onTop) {
      if (fill && innerTop(cx, cy)) {
        return cy <= ry - 0.5 ? m.deep : fill;
      }
      if (!fill && innerTop(cx, cy)) {
        return m.light;
      }
      return !inEll(cx, cy + 1, 0) && cy >= ry ? m.dark : m.hi;
    }
    const u = cx / (w - 1);
    if (cy >= h - 2) {
      return m.dark;
    }
    if (u < 0.22) {
      return m.light;
    }
    if (u > 0.78) {
      return m.dark;
    }
    return m.base;
  });
}

/**
 * Tapered plant pot, total size w x h from (x, y): a rim seen from above (soil opening) and its 3 px band,
 * then a body narrowing by `taper` px per side toward the base. Draw the plant first, then the pot.
 */
export function pot(p: Pen, x: number, y: number, w: number, h: number, m: Mat, soil: string, taper = 2): void {
  const bodyTop = y + 6;
  const bodyH = h - 6;
  const insetAt = (cy: number) => Math.round((cy / Math.max(1, bodyH - 1)) * taper);
  paintShape(p, x + 1, bodyTop, w - 2, bodyH, (cx, cy) => {
    const inset = insetAt(cy);
    return cx >= inset && cx < w - 2 - inset && !(cy === bodyH - 1 && (cx === inset || cx === w - 3 - inset));
  }, (cx, cy, open, isEdge) => {
    if (isEdge) {
      return open.left && !open.down ? m.lineLit : m.line;
    }
    if (cy === 0) {
      return m.deep;
    }
    const inset = insetAt(cy);
    const u = (cx - inset) / Math.max(1, w - 3 - 2 * inset);
    if (cy >= bodyH - 2) {
      return m.dark;
    }
    return u < 0.28 ? m.light : u > 0.74 ? m.dark : m.base;
  });
  box(p, x, y, w, 3, 3, m, { round: 1 });
  p.rect(x + 2, y + 1, w - 4, 1, soil);
  p.hline(x + 1, y + 3, Math.max(2, Math.round(w / 3)), m.hi);
}

/** A furniture leg or post, `w` px wide (1-3), lit on the left. */
export function leg(p: Pen, x: number, y: number, h: number, m: Mat, w = 2): void {
  if (w === 1) {
    p.vline(x, y, h, m.line);
    return;
  }
  p.rect(x, y, w, h, m.dark);
  p.vline(x, y, h - 1, m.base);
  p.vline(x + w - 1, y, h, m.line);
  p.px(x, y + h - 1, m.line);
}

/** Drawer or cabinet fronts stacked in (x, y, w, h): gaps in `deep`, lit top rims, small handles. */
export function drawers(p: Pen, x: number, y: number, w: number, h: number, n: number, m: Mat, handle: string = m.hi): void {
  const each = h / n;
  for (let i = 0; i < n; i++) {
    const top = Math.round(y + i * each);
    const bottom = Math.round(y + (i + 1) * each);
    p.rect(x, top, w, bottom - top, m.base);
    p.hline(x, top, w, m.light);
    p.hline(x, bottom - 1, w, m.deep);
    const hw = Math.max(2, Math.round(w / 4));
    p.hline(x + Math.round((w - hw) / 2), top + Math.max(1, Math.floor((bottom - top) / 2) - 1), hw, handle);
  }
}

/** Monitor / TV panel (bezel included). When `on`, a screen-glow gradient with a few lines of "work". */
export function screen(p: Pen, x: number, y: number, w: number, h: number, on = true, seed = 1): void {
  const b = mat(charcoal);
  p.rect(x, y, w, h, b.line);
  p.hline(x + 1, y, w - 2, b.dark);
  const ix = x + 1;
  const iy = y + 1;
  const iw = w - 2;
  const ih = h - 2;
  if (!on) {
    p.rect(ix, iy, iw, ih, b.deep);
    p.line(ix + 1, iy + ih - 2, ix + Math.min(iw, ih) - 1, iy, b.dark);
    return;
  }
  p.rect(ix, iy, iw, ih, '#4f8fb0');
  p.rect(ix, iy, iw, Math.ceil(ih / 2), screenGlow[0]);
  p.hline(ix, iy, iw, screenGlow[1]);
  const r = rng(seed);
  for (let ry = iy + 2; ry < iy + ih - 1; ry += 2) {
    const indent = Math.floor(r() * 3);
    const len = 2 + Math.floor(r() * (iw - 4 - indent));
    p.hline(ix + 1 + indent, ry, Math.max(1, len), ry < iy + ih / 2 ? '#3d7f9e' : '#2b6585');
  }
  p.px(ix, iy, '#eaf8fb');
}

/** Sparse aligned wood grain strokes over (x, y, w, h): about one stroke per 7 px. Horizontal by default. */
export function grain(p: Pen, x: number, y: number, w: number, h: number, c: string, seed = 1, vertical = false): void {
  const r = rng(seed);
  const across = vertical ? w : h;
  const along = vertical ? h : w;
  for (let a = 1; a < across - 1; a += 2) {
    let pos = Math.floor(r() * 6);
    while (pos < along - 2) {
      const len = 3 + Math.floor(r() * 6);
      if (r() < 0.45) {
        const l = Math.min(len, along - pos);
        if (vertical) {
          p.vline(x + a, y + pos, l, c);
        } else {
          p.hline(x + pos, y + a, l, c);
        }
      }
      pos += len + 4 + Math.floor(r() * 6);
    }
  }
}

/** Subtle fabric weave: offset 2-px dashes on a 4 x 3 lattice. Use a tone one step from the base. */
export function weave(p: Pen, x: number, y: number, w: number, h: number, c: string, seed = 1): void {
  for (let ry = 1; ry < h - 1; ry += 3) {
    const off = ((ry / 3) | 0) % 2 === 0 ? 0 : 2;
    for (let rx = 1 + off; rx < w - 2; rx += 4) {
      if (hash2(x + rx, y + ry, seed) < 0.6) {
        p.hline(x + rx, y + ry, 2, c);
      }
    }
  }
}

/** Ordered dither of colour `c` over (x, y, w, h) at density 0..1 (world-aligned via `ax, ay`). */
export function dither(p: Pen, x: number, y: number, w: number, h: number, c: string, density: number, ax = 0, ay = 0): void {
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      if (density > bayer(cx + x + ax, cy + y + ay)) {
        p.px(x + cx, y + cy, c);
      }
    }
  }
}

/** Vertical banded gradient through `colors` (top -> bottom) with a 2-row dithered seam between bands. */
export function vgradient(p: Pen, x: number, y: number, w: number, h: number, colors: readonly string[]): void {
  const n = colors.length;
  for (let cy = 0; cy < h; cy++) {
    const t = (cy / Math.max(1, h - 1)) * (n - 1);
    const i = Math.min(n - 2, Math.floor(t));
    const f = t - i;
    for (let cx = 0; cx < w; cx++) {
      p.px(x + cx, y + cy, f > 0.5 + (bayer(cx, cy) - 0.5) * 0.35 ? colors[i + 1] : colors[i]);
    }
  }
}

/**
 * One leaf rasterised along an angle (radians, 0 = pointing right, -PI/2 = up). Lit on the side facing the
 * top-left, shaded on the other, with a midrib. `bright` shifts tones along the ramp (+ lighter, - darker);
 * `round` > 1 moves the widest point toward the tip (fiddle-leaf, monstera). Draw back leaves first; sel-out after.
 */
export function leaf(p: Pen, x: number, y: number, angle: number, len: number, width: number, ramp: Ramp, bright = 0, round = 1): void {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const n = ramp.length;
  const tone = (i: number) => ramp[Math.max(1, Math.min(n - 1, i + bright))];
  const R = Math.ceil(len) + 2;
  for (let cy = -R; cy <= R; cy++) {
    for (let cx = -R; cx <= R; cx++) {
      const u = (cx + 0.5) * ca + (cy + 0.5) * sa;
      const v = -(cx + 0.5) * sa + (cy + 0.5) * ca;
      if (u < 0 || u > len) {
        continue;
      }
      const t = u / len;
      const half = (width / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, round) * 1.04)), 0.7);
      if (Math.abs(v) > half) {
        continue;
      }
      const normalX = -sa * Math.sign(v || 1);
      const normalY = ca * Math.sign(v || 1);
      const litSide = normalX * -0.7 + normalY * -0.7 > 0;
      let i = litSide ? n - 3 : n - 4;
      if (Math.abs(v) < 0.6 && t > 0.15 && t < 0.85) {
        i = litSide ? n - 4 : n - 5;
      } else if (litSide && Math.abs(v) > half * 0.45 && t > 0.25 && t < 0.7) {
        i = n - 2;
      }
      if (t > 0.9) {
        i -= 1;
      }
      p.px(x + cx, y + cy, tone(i));
    }
  }
}

/**
 * Leafy clump (bush, small plant, tree canopy): overlapping round clusters inside the ellipse (cx, cy, rx, ry),
 * back/bottom clusters darker and cooler, top-left clusters lighter and warmer. Sel-out afterwards.
 */
export function foliage(p: Pen, cx: number, cy: number, rx: number, ry: number, ramp: Ramp, seed = 1, clusterSize = 7): void {
  const r = rng(seed);
  const n = ramp.length;
  const count = Math.max(4, Math.round(((rx * ry) / (clusterSize * clusterSize)) * 3.2));
  const blobs: { x: number; y: number; s: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 0.82;
    blobs.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, s: clusterSize * (0.75 + r() * 0.5) });
  }
  blobs.sort((a, b) => a.y + a.x * 0.3 - (b.y + b.x * 0.3));
  for (const b of blobs) {
    const light = 1 - ((b.y - (cy - ry)) / (2 * ry)) * 0.7 - ((b.x - (cx - rx)) / (2 * rx)) * 0.3;
    const baseI = Math.max(1, Math.min(n - 2, Math.round(1 + light * (n - 3))));
    const s = Math.round(b.s);
    const x0 = Math.round(b.x - s / 2);
    const y0 = Math.round(b.y - s / 2);
    p.ellipse(x0, y0, s, s, ramp[baseI - 1]);
    p.ellipse(x0, y0, s - 1, s - 1, ramp[baseI]);
    p.ellipse(x0 + 1, y0 + 1, Math.max(2, s - 4), Math.max(2, s - 4), ramp[baseI]);
    const hs = Math.max(2, Math.round(s / 3));
    p.rect(x0 + Math.round(s / 4), y0 + Math.round(s / 5), hs, Math.max(1, hs - 1), ramp[Math.min(n - 1, baseI + 1)]);
  }
}

/** A tiny glossy highlight: 1-2 px of `hi` on glass, ceramics or screens. */
export function glint(p: Pen, x: number, y: number, size = 1, c = '#fbf5e9'): void {
  p.px(x, y, c);
  if (size > 1) {
    p.px(x + 1, y, c);
    p.px(x, y + 1, c);
  }
}

export const metal = mat(steel);
export const plastic = mat(charcoal);
export { ink };
