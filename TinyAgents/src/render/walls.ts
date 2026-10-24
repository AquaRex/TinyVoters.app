import { TILE, WALL_FACE_H, WALL_LINE } from '../config';
import { glassTint } from '../art/kit';
import { floor, wallStyle } from '../art/registry';
import { Office } from '../world/office';
import { hexToRgb, makeCanvas } from './pixel';

/** Tint of a glass partition's top, drawn see-through. */
const GLASS_CAP = hexToRgb(glassTint);

/**
 * Cutaway walls that fill their tile, so furniture in the next tile stands flush against them. Horizontal walls are a
 * WALL_LINE-thick line on the tile's south edge whose face covers the whole tile; vertical runs are a full tile wide.
 * The cap is raised by WALL_FACE_H, and wherever the south side is open floor a face hangs from the cap down to the
 * floor line.
 */

export interface WallGeom {
  x: number;
  y: number;
  /** Line position inside the tile: vertical runs fill the tile's width, horizontal lines hug its south edge. */
  ax: number;
  ay: number;
  /** Width of the vertical run (TILE), 0 for a purely horizontal wall. */
  vw: number;
  /** Floor-plane mask of the line, TILE x TILE. */
  mask: Uint8Array;
  /** Per column: row just below the lowest line pixel (0 = no line in this column). */
  bottoms: number[];
  /** Per column: whether a face hangs below the line here. */
  face: boolean[];
  /** Depth key: the line's south edge in world px. */
  key: number;
  /** Floor line under the face (or the line's south edge), relative to the tile top. */
  faceBottom: number;
  /** Neighbour walls. */
  n: boolean;
  s: boolean;
  w: boolean;
  e: boolean;
}

export interface WallSprite {
  geom: WallGeom;
  /** TILE x (TILE + WALL_FACE_H) canvases, drawn at (x * TILE, y * TILE - WALL_FACE_H). */
  face: HTMLCanvasElement | null;
  /** Glass faces, drawn semi-transparent. */
  glass: HTMLCanvasElement | null;
  cap: HTMLCanvasElement;
}

export function wallGeom(office: Office, x: number, y: number): WallGeom {
  const n = !!office.wallAt(x, y - 1);
  const s = !!office.wallAt(x, y + 1);
  const w = !!office.wallAt(x - 1, y);
  const e = !!office.wallAt(x + 1, y);
  const hasV = n || s;
  const ay = TILE - WALL_LINE;
  const vw = hasV ? TILE : 0;

  const mask = new Uint8Array(TILE * TILE);
  const top = hasV && n ? 0 : ay;
  const bottom = hasV && s ? TILE : ay + WALL_LINE;
  mask.fill(1, top * TILE, bottom * TILE);

  // open floor south of the line, or nothing (an upper floor's outside: its façade shows over the street below)
  const southOpen = !s && (!!office.floorAt(x, y + 1) || !office.layout.floor[(y + 1) * office.w + x]);
  const bottoms: number[] = [];
  const face: boolean[] = [];
  for (let i = 0; i < TILE; i++) {
    let bottom = 0;
    for (let j = 0; j < TILE; j++) {
      if (mask[j * TILE + i]) {
        bottom = j + 1;
      }
    }
    bottoms.push(bottom);
    face.push(bottom > 0 && (bottom < TILE || southOpen));
  }
  return { x, y, ax: 0, ay, vw, mask, bottoms, face, key: y * TILE + Math.max(...bottoms), faceBottom: TILE, n, s, w, e };
}

/**
 * Wall style id painting column i of a wall tile. At junctions, the arms reaching a neighbour wall take that
 * neighbour's style, so a glass partition meeting a brick wall stays glass up to the brick line.
 */
function columnStyle(office: Office, g: WallGeom, i: number): string {
  const own = office.wallAt(g.x, g.y)!;
  if (!(g.n || g.s) || !(g.w || g.e)) {
    return own;
  }
  if (i < g.ax && g.w) {
    return office.wallAt(g.x - 1, g.y)!;
  }
  if (i >= g.ax + g.vw && g.e) {
    return office.wallAt(g.x + 1, g.y)!;
  }
  return own;
}

/** Builds face and cap canvases for a wall tile. `geomAt` gives neighbouring wall geometry for face edges. */
export function buildWallSprite(office: Office, g: WallGeom, geomAt: (x: number, y: number) => WallGeom | undefined): WallSprite {
  const H = TILE + WALL_FACE_H;
  const [cap, cctx] = makeCanvas(TILE, H, true);
  const styles = Array.from({ length: TILE }, (_, i) => columnStyle(office, g, i));

  /** Face signature of a column (bottom + style), across tile borders; '' where there's no face. */
  const faceKey = (i: number): string => {
    const o = i < 0 ? geomAt(g.x - 1, g.y) : i >= TILE ? geomAt(g.x + 1, g.y) : g;
    const c = i < 0 ? TILE - 1 : i >= TILE ? 0 : i;
    if (!o || !o.face[c]) {
      return '';
    }
    return `${o.bottoms[c]}|${o === g ? styles[c] : columnStyle(office, o, c)}`;
  };

  let face: HTMLCanvasElement | null = null;
  let glass: HTMLCanvasElement | null = null;
  for (let i = 0; i < TILE; i++) {
    const style = wallStyle(styles[i]);
    if (!g.face[i] || !style) {
      continue;
    }
    const isGlass = style.kind === 'glass';
    if (isGlass && !glass) {
      glass = makeCanvas(TILE, H)[0];
    } else if (!isGlass && !face) {
      face = makeCanvas(TILE, H)[0];
    }
    const fctx = (isGlass ? glass : face)!.getContext('2d')!;
    const b = g.bottoms[i];
    const me = faceKey(i);
    const edge = faceKey(i - 1) !== me ? 'left' : faceKey(i + 1) !== me ? 'right' : null;
    fctx.save();
    fctx.beginPath();
    fctx.rect(i, b, 1, WALL_FACE_H);
    fctx.clip();
    style.faceSlice(fctx, i, b, g.x * TILE + i, edge);
    fctx.restore();
  }

  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < TILE && j < TILE && g.mask[j * TILE + i] === 1;
  const continues = (i: number, j: number) => (i < 0 && g.w) || (i >= TILE && g.e) || (j < 0 && g.n) || (j >= TILE && g.s);
  const open = (i: number, j: number) => (i < 0 || j < 0 || i >= TILE || j >= TILE ? !continues(i, j) : !at(i, j));
  const colors = new Map<string, [number, number, number][]>();
  const indoor = (x: number, y: number) => !!office.floorAt(x, y) && !office.wallAt(x, y) && !office.isOutdoor(x, y);
  // only glass between two indoor spaces is see-through from above; an outside window shows its frame
  const partition = g.vw > 0 ? indoor(g.x - 1, g.y) && indoor(g.x + 1, g.y) : indoor(g.x, g.y - 1) && indoor(g.x, g.y + 1);
  const img = cctx.createImageData(TILE, TILE);
  for (let j = 0; j < TILE; j++) {
    for (let i = 0; i < TILE; i++) {
      const style = wallStyle(styles[i]);
      if (!at(i, j) || !style) {
        continue;
      }
      let c3 = colors.get(style.id);
      if (!c3) {
        c3 = [hexToRgb(style.cap.edge), hexToRgb(style.cap.highlight), hexToRgb(style.cap.fill)];
        colors.set(style.id, c3);
      }
      const boundary = open(i - 1, j) || open(i + 1, j) || open(i, j - 1) || open(i, j + 1);
      const glassy = style.kind === 'glass';
      const mullion = glassy && g.vw > 0 && (i === TILE / 2 - 1 || i === TILE / 2);
      const pane = glassy && partition && !boundary && !mullion;
      const c = boundary || mullion ? c3[0] : pane ? GLASS_CAP : open(i, j - 2) ? c3[1] : c3[2];
      const k = (j * TILE + i) * 4;
      img.data[k] = c[0];
      img.data[k + 1] = c[1];
      img.data[k + 2] = c[2];
      img.data[k + 3] = pane ? 110 : 255;
    }
  }
  cctx.putImageData(img, 0, 0);
  return { geom: g, face, glass, cap };
}

/**
 * Floor under a wall tile: each side of the thin line shows the floor of the room on that side.
 * Returns [x, y, w, h, floorId] regions in tile-local px.
 */
export function underWallRegions(office: Office, g: WallGeom): [number, number, number, number, string][] {
  const { x, y } = g;
  const own = office.floorAt(x, y);
  const side = (dx: number, dy: number) => (office.wallAt(x + dx, y + dy) ? null : office.floorAt(x + dx, y + dy));
  const W = side(-1, 0);
  const E = side(1, 0);
  const N = side(0, -1);
  const S = side(0, 1);
  const hasH = g.w || g.e;
  const hasV = g.n || g.s;
  const sx = TILE / 2;
  const sy = g.ay + WALL_LINE / 2;
  const regions: [number, number, number, number, string | null][] = [];
  if (hasV && !hasH) {
    regions.push([0, 0, sx, TILE, W ?? E ?? own], [sx, 0, TILE - sx, TILE, E ?? W ?? own]);
  } else if (!hasV) {
    regions.push([0, 0, TILE, sy, N ?? S ?? own], [0, sy, TILE, TILE - sy, S ?? N ?? own]);
  } else {
    regions.push(
      [0, 0, sx, sy, W ?? N ?? side(-1, -1) ?? own],
      [sx, 0, TILE - sx, sy, E ?? N ?? side(1, -1) ?? own],
      [0, sy, sx, TILE - sy, W ?? S ?? side(-1, 1) ?? own],
      [sx, sy, TILE - sx, TILE - sy, E ?? S ?? side(1, 1) ?? own],
    );
  }
  return regions.filter((r): r is [number, number, number, number, string] => !!r[4] && !!floor(r[4]));
}

/** A natural-size preview of a wall style: a 32 px run of cap over its face. */
export function wallSwatch(id: string): HTMLCanvasElement {
  const capH = WALL_LINE;
  const [c, ctx] = makeCanvas(TILE, capH + WALL_FACE_H);
  const style = wallStyle(id);
  if (!style) {
    return c;
  }
  ctx.fillStyle = style.cap.edge;
  ctx.fillRect(0, 0, TILE, capH);
  ctx.fillStyle = style.cap.fill;
  ctx.fillRect(0, 2, TILE, capH - 3);
  ctx.fillStyle = style.cap.highlight;
  ctx.fillRect(0, 1, TILE, 1);
  for (let i = 0; i < TILE; i++) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(i, capH, 1, WALL_FACE_H);
    ctx.clip();
    style.faceSlice(ctx, i, capH, i, null);
    ctx.restore();
  }
  return c;
}
