import { defineWallStyle } from './registry';
import { cream, glassGlint, glassTint, hashInt, mix, mustard, oak, paint, paving, sage, slate, steel, teal, terracotta, walnut } from './kit';
import { brickAt, rgba } from './walls';

/**
 * Extra interior wall styles (café, bar, hotel, house). Same face rhythm as walls.ts: shadow under the cap
 * (rows 0-2), the wall body, and a base (rows 34-39), so they meet the core styles cleanly at junctions.
 */

const FACE_H = 40;

function column(ctx: CanvasRenderingContext2D, x: number, y: number, colors: (row: number) => string): void {
  for (let r = 0; r < FACE_H; r++) {
    ctx.fillStyle = colors(r);
    ctx.fillRect(x, y + r, 1, 1);
  }
}

const paintCap = { fill: cream[4], edge: cream[1], highlight: cream[5] };
const walnutCap = { fill: walnut[4], edge: walnut[1], highlight: walnut[5] };

const oakBase = (row: number): string => (row === 34 ? oak[5] : row < 38 ? oak[4] : row === 38 ? oak[3] : oak[2]);
const walnutBase = (row: number): string => (row === 34 ? walnut[5] : row < 38 ? walnut[3] : row === 38 ? walnut[2] : walnut[1]);

// ---------------------------------------------------------------------------------------------------------
// Café wainscot: cream paint over an oak chair rail and sage beadboard

defineWallStyle({
  id: 'wall.wainscot.sage',
  name: 'Café wainscot (sage beadboard)',
  kind: 'interior',
  cap: paintCap,
  faceSlice(ctx, x, y, col, edge) {
    if (edge) {
      column(ctx, x, y, (r) => (r >= 34 ? oak[2] : r >= 20 ? (edge === 'left' ? sage[3] : sage[1]) : edge === 'left' ? cream[3] : cream[2]));
      return;
    }
    const u = ((col % 4) + 4) % 4;
    column(ctx, x, y, (r) => {
      if (r < 3) {
        return [paint[0], paint[1], paint[2]][r];
      }
      if (r < 18) {
        return paint[3];
      }
      if (r < 21) {
        return [oak[5], oak[4], oak[2]][r - 18];
      }
      if (r >= 34) {
        return oakBase(r);
      }
      if (r === 21) {
        return sage[2];
      }
      if (u === 0) {
        return sage[2];
      }
      if (u === 1) {
        return mix(sage[4], sage[5], 0.4);
      }
      return r === 33 ? sage[3] : mix(sage[3], sage[4], 0.6);
    });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Exposed brick (loft café / bar): the shared brick module with a walnut skirting

defineWallStyle({
  id: 'wall.brick.exposed',
  name: 'Exposed brick',
  kind: 'interior',
  cap: { fill: terracotta[3], edge: terracotta[0], highlight: terracotta[4] },
  faceSlice(ctx, x, y, col, edge) {
    if (edge) {
      column(ctx, x, y, (r) => (r >= 34 ? walnut[1] : edge === 'left' ? terracotta[2] : terracotta[0]));
      return;
    }
    column(ctx, x, y, (r) => {
      if (r === 0) {
        return terracotta[0];
      }
      if (r === 1) {
        return terracotta[1];
      }
      if (r >= 34) {
        return walnutBase(r);
      }
      return brickAt(col, r - 2, 37);
    });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Bar tile: glossy deep-teal subway tile under a walnut cap rail

const TILE_W = 8;
const TILE_H = 4;
const tealTones = [mix(teal[2], teal[3], 0.35), mix(teal[2], teal[3], 0.6), mix(teal[2], teal[3], 0.8)];

defineWallStyle({
  id: 'wall.tile.green',
  name: 'Green bar tile',
  kind: 'interior',
  cap: walnutCap,
  faceSlice(ctx, x, y, col, edge) {
    if (edge) {
      column(ctx, x, y, (r) => (r >= 34 ? walnut[1] : r < 4 ? walnut[2] : edge === 'left' ? teal[3] : teal[0]));
      return;
    }
    column(ctx, x, y, (r) => {
      if (r < 4) {
        return [walnut[1], walnut[4], walnut[3], walnut[1]][r];
      }
      if (r >= 34) {
        return walnutBase(r);
      }
      const tr = r - 4;
      const course = Math.floor(tr / TILE_H);
      const v = tr % TILE_H;
      const shifted = col + (course % 2) * (TILE_W / 2);
      const u = ((shifted % TILE_W) + TILE_W) % TILE_W;
      if (v === TILE_H - 1 || u === TILE_W - 1) {
        return teal[0];
      }
      const tone = tealTones[hashInt(Math.floor(shifted / TILE_W), course, 301) % 3];
      if (v === 0) {
        return mix(tone, teal[4], 0.5);
      }
      return u === 0 ? mix(tone, teal[4], 0.3) : tone;
    });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Hotel corridor: warm striped wallpaper over walnut raised panels

const PANEL = 16;

defineWallStyle({
  id: 'wall.paper.stripe',
  name: 'Striped wallpaper',
  kind: 'interior',
  cap: paintCap,
  faceSlice(ctx, x, y, col, edge) {
    if (edge) {
      column(ctx, x, y, (r) => (r >= 21 ? (edge === 'left' ? walnut[4] : walnut[1]) : edge === 'left' ? cream[4] : cream[2]));
      return;
    }
    const s = ((col % 8) + 8) % 8;
    const stripe = s >= 5 ? mix(mustard[3], cream[5], 0.55) : s === 4 ? mix(mustard[4], cream[5], 0.7) : cream[5];
    const u = ((col % PANEL) + PANEL) % PANEL;
    column(ctx, x, y, (r) => {
      if (r < 3) {
        return [mix(stripe, cream[2], 0.7), mix(stripe, cream[3], 0.5), mix(stripe, cream[4], 0.3)][r];
      }
      if (r < 20) {
        return stripe;
      }
      if (r < 23) {
        return [walnut[5], walnut[4], walnut[1]][r - 20];
      }
      if (r >= 34) {
        return walnutBase(r);
      }
      if (u <= 1 || u === PANEL - 1 || r === 23 || r === 33) {
        return u === 1 ? walnut[4] : walnut[3];
      }
      if (r === 24 || u === 2) {
        return walnut[2];
      }
      if (r === 32 || u === PANEL - 2) {
        return walnut[4];
      }
      return r === 25 ? walnut[4] : walnut[3];
    });
  },
});

// ---------------------------------------------------------------------------------------------------------
// Library / house: full-height walnut panelling, two rows of raised panels

const STILE = 24;

function panelRow(r: number, u: number, top: number, bottom: number): string | null {
  if (r < top || r > bottom) {
    return null;
  }
  if (r === top || r === bottom || u < 2) {
    return null;
  }
  if (r === top + 1 || u === 2) {
    return walnut[2];
  }
  if (r === bottom - 1 || u === STILE - 1) {
    return walnut[5];
  }
  return r === top + 2 || u === 3 ? walnut[4] : mix(walnut[3], walnut[4], 0.5);
}

defineWallStyle({
  id: 'wall.panel.walnut',
  name: 'Walnut panelling',
  kind: 'interior',
  cap: walnutCap,
  faceSlice(ctx, x, y, col, edge) {
    if (edge) {
      column(ctx, x, y, (r) => (r >= 34 ? walnut[1] : edge === 'left' ? walnut[4] : walnut[1]));
      return;
    }
    const u = ((col % STILE) + STILE) % STILE;
    column(ctx, x, y, (r) => {
      if (r < 3) {
        return [walnut[1], walnut[2], walnut[3]][r];
      }
      if (r >= 34) {
        return walnutBase(r);
      }
      const panel = panelRow(r, u, 4, 17) ?? panelRow(r, u, 20, 32);
      if (panel) {
        return panel;
      }
      return u === 0 ? walnut[2] : u === 1 ? walnut[4] : walnut[3];
    });
  },
});

// ---------------------------------------------------------------------------------------------------------
// White concrete office exterior: smooth cool-white panels on a 32 px module (one joint per tile, a reveal at
// mid-height), a stone plinth. The windowed variant puts one framed window with a centre mullion in every
// module, so a run of it reads as a ribbon of office windows on the façade.

const concreteCap = { fill: steel[6], edge: steel[3], highlight: '#ffffff' };
const concreteTones = [mix(steel[5], steel[6], 0.55), mix(steel[5], steel[6], 0.7), mix(steel[5], cream[5], 0.5)];

function concreteAt(col: number, r: number): string {
  const u = ((col % 32) + 32) % 32;
  if (r === 0) {
    return steel[3];
  }
  if (r === 1) {
    return steel[4];
  }
  if (r >= 37) {
    return r === 37 ? paving[4] : r === 38 ? paving[3] : paving[1];
  }
  if (u === 31) {
    return steel[4];
  }
  if (r === 19) {
    return mix(steel[4], steel[5], 0.5);
  }
  if (r === 20 || u === 0) {
    return steel[6];
  }
  return concreteTones[hashInt(Math.floor(col / 32), r >> 3, 401) % concreteTones.length];
}

const windowPane = [mix(glassTint, slate[2], 0.55), mix(glassTint, slate[2], 0.4), mix(glassTint, slate[3], 0.3)];

function windowAt(col: number, r: number): string {
  const u = ((col % 32) + 32) % 32;
  if (r < 5 || r >= 32 || u < 3 || u > 28) {
    return concreteAt(col, r);
  }
  if (r === 31) {
    return steel[6];
  }
  if (r === 5 || r === 30 || u === 3 || u === 28 || u === 15 || u === 16) {
    return u === 16 ? steel[4] : steel[2];
  }
  const d = (u + r) % 18;
  if (r > 7 && r < 28 && (d === 9 || d === 10)) {
    return glassGlint;
  }
  return windowPane[r < 12 ? 2 : r < 22 ? 1 : 0];
}

defineWallStyle({
  id: 'wall.concrete.white',
  name: 'White concrete',
  kind: 'exterior',
  cap: concreteCap,
  faceSlice(ctx, x, y, col, edge) {
    if (edge) {
      column(ctx, x, y, (r) => (r >= 37 ? paving[1] : edge === 'left' ? steel[5] : steel[3]));
      return;
    }
    column(ctx, x, y, (r) => concreteAt(col, r));
  },
});

defineWallStyle({
  id: 'wall.concrete.window',
  name: 'White concrete with windows',
  kind: 'exterior',
  cap: concreteCap,
  faceSlice(ctx, x, y, col, edge) {
    if (edge) {
      column(ctx, x, y, (r) => (r >= 37 ? paving[1] : edge === 'left' ? steel[5] : steel[3]));
      return;
    }
    column(ctx, x, y, (r) => windowAt(col, r));
  },
});

/** Side-wall window: a glass-kind style, so its cap reads as a tinted pane in a concrete frame with a mullion. */
defineWallStyle({
  id: 'wall.window.frame',
  name: 'Framed window (exterior)',
  kind: 'glass',
  cap: { fill: steel[6], edge: steel[2], highlight: '#ffffff' },
  faceSlice(ctx, x, y, col, edge) {
    const u = ((col % 32) + 32) % 32;
    column(ctx, x, y, (r) => {
      if (r < 3 || r >= 37 || edge !== null || u < 2 || u > 29) {
        return r >= 37 ? paving[3] : steel[5];
      }
      if (u === 15 || u === 16) {
        return steel[3];
      }
      return rgba(glassTint, r < 8 ? 0.55 : 0.42);
    });
  },
});

