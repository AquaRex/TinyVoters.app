import { defineWallStyle } from './registry';
import { cream, glassGlint, glassTint, hash2, hashInt, hexToRgb, mix, noise2, oak, paint, paving, sage, steel, terracotta, walnut } from './kit';

/**
 * Wall faces are painted one 1 px column at a time (`faceSlice`), WALL_FACE_H (40) px tall, top to bottom.
 * Patterns use the world column `col` so they continue seamlessly along a wall. Every face shares one
 * vertical rhythm: a soft shadow under the cap (rows 0-2), the wall body, and a base (rows 34-39), so
 * different styles meet cleanly at junctions.
 */

const FACE_H = 40;

function column(ctx: CanvasRenderingContext2D, x: number, y: number, colors: (row: number) => string): void {
  for (let r = 0; r < FACE_H; r++) {
    ctx.fillStyle = colors(r);
    ctx.fillRect(x, y + r, 1, 1);
  }
}

/** A palette colour at partial alpha (glass only). */
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

const oakBase = (row: number): string => (row === 34 ? oak[5] : row < 38 ? oak[4] : row === 38 ? oak[3] : oak[2]);

// ---------------------------------------------------------------------------------------------------------
// Painted interior walls: shadow under the cap, painted upper wall, a slim rail, a slightly deeper lower
// band, and an oak baseboard. One recipe, three paints.

interface PaintTones {
  /** rows 0, 1, 2 under the cap */
  under: [string, string, string];
  upper: string;
  /** rail: lit top, body, shadow below */
  rail: [string, string, string];
  lower: string;
  edgeLit: string;
  edgeDark: string;
}

function paintRows(t: PaintTones): (row: number) => string {
  return (row) => {
    if (row < 3) {
      return t.under[row];
    }
    if (row < 24) {
      return t.upper;
    }
    if (row < 27) {
      return t.rail[row - 24];
    }
    if (row < 34) {
      return t.lower;
    }
    return oakBase(row);
  };
}

const paintCap = { fill: cream[4], edge: cream[1], highlight: cream[5] };

function paintedWall(id: string, name: string, t: PaintTones): void {
  const rows = paintRows(t);
  defineWallStyle({
    id,
    name,
    kind: 'interior',
    cap: paintCap,
    faceSlice(ctx, x, y, _col, edge) {
      if (edge) {
        const c = edge === 'left' ? t.edgeLit : t.edgeDark;
        column(ctx, x, y, (r) => (r >= 34 ? oak[2] : c));
        return;
      }
      column(ctx, x, y, rows);
    },
  });
}

paintedWall('wall.cream', 'Cream paint', {
  under: [paint[0], paint[1], paint[2]],
  upper: paint[3],
  rail: [paint[5], paint[4], paint[1]],
  lower: paint[2],
  edgeLit: cream[3],
  edgeDark: cream[2],
});

paintedWall('wall.sage', 'Sage paint', {
  under: [sage[2], sage[3], mix(sage[3], sage[4], 0.6)],
  upper: mix(sage[4], sage[5], 0.45),
  rail: [mix(sage[5], cream[5], 0.4), sage[5], sage[3]],
  lower: mix(sage[4], sage[5], 0.15),
  edgeLit: sage[4],
  edgeDark: sage[2],
});

paintedWall('wall.terracotta', 'Terracotta paint', {
  under: [terracotta[2], terracotta[3], mix(terracotta[3], terracotta[4], 0.6)],
  upper: mix(terracotta[4], terracotta[5], 0.3),
  rail: [terracotta[5], mix(terracotta[4], terracotta[5], 0.6), terracotta[3]],
  lower: mix(terracotta[3], terracotta[4], 0.72),
  edgeLit: terracotta[4],
  edgeDark: terracotta[2],
});

// ---------------------------------------------------------------------------------------------------------
// Vertical oak slats (reception / lounge accent)

const SLAT = 5;

defineWallStyle({
  id: 'wall.wood',
  name: 'Oak slats',
  kind: 'interior',
  cap: { fill: oak[4], edge: oak[1], highlight: oak[5] },
  faceSlice(ctx, x, y, col, edge) {
    if (edge) {
      column(ctx, x, y, (r) => (r >= 36 ? walnut[1] : edge === 'left' ? oak[3] : oak[1]));
      return;
    }
    const slat = Math.floor(col / SLAT);
    const u = col - slat * SLAT;
    const tones = [mix(oak[3], oak[4], 0.35), mix(oak[3], oak[4], 0.55), mix(oak[3], oak[4], 0.75)];
    const n = noise2(col, 0, 60, 201) + (hash2(slat, 0, 202) - 0.5) * 0.45;
    const tone = tones[n < 0.38 ? 0 : n > 0.64 ? 2 : 1];
    const grainRow = 6 + (hashInt(slat, 1, 203) % 22);
    const grainLen = 4 + (hashInt(slat, 2, 204) % 6);
    column(ctx, x, y, (r) => {
      if (r === 0) {
        return walnut[1];
      }
      if (r === 1) {
        return walnut[2];
      }
      if (r >= 36) {
        return r === 36 ? walnut[4] : r === 39 ? walnut[1] : walnut[3];
      }
      if (u === SLAT - 1) {
        return mix(oak[1], oak[2], 0.5);
      }
      const shade = r === 2 || r === 35 ? mix(tone, oak[2], 0.45) : tone;
      if (u === 0) {
        return mix(shade, oak[5], 0.35);
      }
      if (u === 2 && r >= grainRow && r < grainRow + grainLen) {
        return mix(tone, oak[3], 0.55);
      }
      return shade;
    });
  },
});

// ---------------------------------------------------------------------------------------------------------
// White tile (restrooms): painted upper wall, a bullnose trim, square tiles to the floor.

const tileWhite = [mix(steel[5], steel[6], 0.55), mix(steel[5], steel[6], 0.7), mix(steel[5], steel[6], 0.85)];
const tileGrout = mix(steel[4], steel[5], 0.4);

defineWallStyle({
  id: 'wall.tile',
  name: 'White tile',
  kind: 'interior',
  cap: { fill: steel[5], edge: steel[2], highlight: steel[6] },
  faceSlice(ctx, x, y, col, edge) {
    if (edge) {
      column(ctx, x, y, (r) => (r < 14 ? (edge === 'left' ? paint[2] : paint[0]) : edge === 'left' ? steel[4] : steel[3]));
      return;
    }
    const tx = Math.floor(col / 8);
    const u = col - tx * 8;
    column(ctx, x, y, (r) => {
      if (r < 3) {
        return [paint[0], paint[1], paint[2]][r];
      }
      if (r < 13) {
        return paint[4];
      }
      if (r === 13) {
        return steel[6];
      }
      if (r === 14) {
        return steel[5];
      }
      if (r === 15) {
        return steel[3];
      }
      if (r >= 35) {
        return [steel[5], steel[3], steel[3], steel[2], steel[1]][r - 35];
      }
      const ty = Math.floor((r - 16) / 8);
      const v = r - 16 - ty * 8;
      if (u === 0 || v === 7) {
        return tileGrout;
      }
      const c = tileWhite[hashInt(tx, ty, 211) % 3];
      if (u === 1 || v === 0) {
        return mix(c, steel[6], 0.6);
      }
      if (u === 7 || v === 6) {
        return mix(c, steel[4], 0.3);
      }
      return c;
    });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Glass partition: slim steel head and floor track, posts every 48 px, a tinted see-through pane with a
// frosted privacy band and diagonal glints. The pane is semi-transparent; frame and glints are opaque.

const GLASS_BAY = 48;
const pane = rgba(glassTint, 0.42);
const paneTop = rgba(glassTint, 0.55);
const frost = rgba(steel[6], 0.62);
const frostEdge = rgba(steel[6], 0.8);
const glintSoft = rgba(glassGlint, 0.7);

defineWallStyle({
  id: 'wall.glass',
  name: 'Glass partition',
  kind: 'glass',
  cap: { fill: steel[5], edge: steel[2], highlight: steel[6] },
  faceSlice(ctx, x, y, col, edge) {
    const u = ((col % GLASS_BAY) + GLASS_BAY) % GLASS_BAY;
    const post = edge !== null || u < 2;
    const postTone = edge === 'right' ? steel[2] : u === 0 || edge === 'left' ? steel[4] : steel[3];
    column(ctx, x, y, (r) => {
      if (r === 0) {
        return steel[2];
      }
      if (r === 1) {
        return steel[4];
      }
      if (r === 2) {
        return steel[3];
      }
      if (r >= 37) {
        return r === 37 ? steel[4] : r === 38 ? steel[3] : steel[1];
      }
      if (post) {
        return postTone;
      }
      if (r === 20 || r === 24) {
        return frostEdge;
      }
      if (r > 20 && r < 24) {
        return frost;
      }
      const d = (u + r) % GLASS_BAY;
      if (r > 4 && r < 33 && (d === 30 || d === 31)) {
        return glassGlint;
      }
      if (r > 6 && r < 30 && d === 35) {
        return glintSoft;
      }
      return r < 6 ? paneTop : pane;
    });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Exterior brick: running bond, 4 px courses with 1 px mortar, bricks laid on a 32 px module (11 + 11 + 10)
// so façade pieces line up with the wall above them. Stone plinth.

const brickTones = [terracotta[2], mix(terracotta[2], terracotta[3], 0.35), mix(terracotta[2], terracotta[3], 0.6), mix(terracotta[1], terracotta[2], 0.55)];
const mortar = mix(cream[2], cream[3], 0.55);
const mortarShadow = mix(cream[1], cream[2], 0.6);
const BRICK_STARTS = [0, 11, 22];

/** Brick colour at (col, course row r >= 0) on the shared 32 px brick module. `salt` varies tones per wall. */
export function brickAt(col: number, r: number, salt = 0): string {
  const course = Math.floor(r / 5);
  const inCourse = r % 5;
  if (inCourse === 4) {
    return mortar;
  }
  const shifted = (((col + (course % 2 === 0 ? 0 : 16)) % 32) + 32) % 32;
  const k = shifted >= 22 ? 2 : shifted >= 11 ? 1 : 0;
  const inBrick = shifted - BRICK_STARTS[k];
  const len = k === 2 ? 10 : 11;
  if (inBrick === len - 1) {
    return inCourse === 0 ? mortar : mortarShadow;
  }
  const brick = Math.floor((col + (course % 2 === 0 ? 0 : 16)) / 32) * 3 + k;
  const tone = brickTones[hashInt(brick + salt, course, 71) % brickTones.length];
  if (inCourse === 0) {
    return inBrick === 0 ? mix(tone, terracotta[4], 0.5) : mix(tone, terracotta[4], 0.28);
  }
  if (inCourse === 3) {
    return mix(tone, terracotta[1], 0.35);
  }
  return tone;
}

defineWallStyle({
  id: 'wall.brick',
  name: 'Red-brown brick',
  kind: 'exterior',
  cap: { fill: paving[4], edge: paving[0], highlight: paving[5] },
  faceSlice(ctx, x, y, col, edge) {
    if (edge) {
      column(ctx, x, y, (r) => (r >= 37 ? paving[1] : edge === 'left' ? terracotta[1] : terracotta[0]));
      return;
    }
    column(ctx, x, y, (r) => {
      if (r === 0) {
        return terracotta[0];
      }
      if (r === 1) {
        return terracotta[1];
      }
      if (r >= 37) {
        return r === 37 ? paving[4] : r === 38 ? paving[3] : paving[1];
      }
      return brickAt(col, r - 2);
    });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Exterior render (stucco): warm light render with soft mottling and a few 2 px specks, stone plinth.

const renderTones = [mix(cream[4], cream[5], 0.3), mix(cream[4], cream[5], 0.48), mix(cream[4], cream[5], 0.64)];

/** Render colour at (col, row) on a wall body. Shared with the façade. */
export function renderAt(col: number, row: number): string {
  const n = noise2(col, row * 1.6, 26, 221) * 0.7 + noise2(col, row, 9, 222) * 0.3;
  const c = renderTones[n < 0.4 ? 0 : n > 0.6 ? 2 : 1];
  const s = hash2(col >> 1, row, 223);
  if (s < 0.02) {
    return mix(c, cream[3], 0.3);
  }
  if (s > 0.99) {
    return mix(c, cream[6], 0.35);
  }
  return c;
}

defineWallStyle({
  id: 'wall.render',
  name: 'Light render',
  kind: 'exterior',
  cap: { fill: paving[4], edge: paving[0], highlight: paving[5] },
  faceSlice(ctx, x, y, col, edge) {
    if (edge) {
      column(ctx, x, y, (r) => (r >= 37 ? paving[1] : edge === 'left' ? cream[3] : cream[2]));
      return;
    }
    column(ctx, x, y, (r) => {
      if (r === 0) {
        return cream[2];
      }
      if (r === 1) {
        return cream[3];
      }
      if (r === 2) {
        return mix(cream[3], cream[4], 0.5);
      }
      if (r >= 37) {
        return r === 37 ? paving[4] : r === 38 ? paving[3] : paving[1];
      }
      return renderAt(col, r);
    });
  },
});
