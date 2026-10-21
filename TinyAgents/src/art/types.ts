/**
 * Shared contract between artists (who define assets) and the engine (which places, sorts, lights and
 * animates them). Read docs/ENGINE_CONTRACT.md for the conventions behind these fields.
 */

export type Dir = 'down' | 'up' | 'left' | 'right';

/** What an agent does at a spot. 'seat' is resolved by the engine from what the seat faces (desk -> work, meeting table -> meeting, otherwise social). */
export type Activity =
  | 'seat'
  | 'work'
  | 'meeting'
  | 'social'
  | 'coffee'
  | 'water'
  | 'snack'
  | 'eat'
  | 'toilet'
  | 'wash'
  | 'read'
  | 'whiteboard'
  | 'print'
  | 'reception'
  | 'play'
  | 'smoke'
  | 'enter'
  | 'elevator'
  | 'stairs'
  | 'parking';

export type Category =
  | 'Work'
  | 'Meeting'
  | 'Lounge'
  | 'Kitchen'
  | 'Restroom'
  | 'Decor'
  | 'Lighting'
  | 'Structure'
  | 'Outdoor'
  | 'Vehicles';

/**
 * floor:   flat on the ground (rugs, mats, markings) — baked into the floor layer, walkable.
 * object:  stands on the floor, depth-sorted with agents.
 * surface: sits on a host object (desk, table, counter); drawn right after the host.
 * wall:    hangs on a wall face (art, clocks, screens, sconces). Placed on wall tiles whose face is visible.
 */
export type Layer = 'floor' | 'object' | 'surface' | 'wall';

/** A sprite piece. (x, y) is the canvas's top-left relative to the footprint's top-left in px. */
export interface Part {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  /** Depth key in px relative to the footprint top. Agents sort by their foot y; larger z draws later (in front). */
  z: number;
}

export interface Spot {
  /** Tile relative to the footprint's top-left. May lie outside the footprint (e.g. dy = h for "in front of"). */
  dx: number;
  dy: number;
  facing: Dir;
  pose: 'sit' | 'stand';
  activity: Activity;
  /** Pixel offset of the agent's foot point from the tile's default foot point (tile centre x, tile top + FOOT_Y). */
  px?: number;
  py?: number;
}

export interface Light {
  /** Centre in px relative to the footprint's top-left. */
  x: number;
  y: number;
  radius: number;
  color: string;
  /** 0..1 */
  intensity: number;
  /** Only shines when it's dark outside (street lamps, outdoor lights). */
  nightOnly?: boolean;
}

/** Flat shadow shapes in px relative to the footprint's top-left, drawn by the engine on the floor layer. */
export interface Shadow {
  shape: 'ellipse' | 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Variant {
  /** Footprint in tiles. */
  w: number;
  h: number;
  /** One string per footprint row: '#' blocks movement, '.' walkable, 's' walkable seat (paths avoid it). */
  mask: string[];
  spots: Spot[];
  /**
   * Frames of parts. Static assets have one frame. Animated assets index frames by `anim`:
   * 'door' -> openness 0..1 mapped across frames (closed first); 'loop' -> time-based at `fps`.
   */
  frames: Part[][];
  anim?: { kind: 'door' | 'loop'; fps?: number };
  shadows?: Shadow[];
  lights?: Light[];
}

export interface AssetDef {
  /** Stable id, e.g. 'chair.office.charcoal'. Saved in layouts — never rename once used. */
  id: string;
  name: string;
  /** Swap group: assets in the same group are interchangeable (same footprint and spots per facing). e.g. 'chair.office' */
  group: string;
  category: Category;
  layer: Layer;
  /** Facings this asset supports. Rotating cycles through them. Single-facing assets list one. */
  facings: Dir[];
  /** Builds the variant for a facing. Called lazily once per facing and cached by the registry. */
  build(facing: Dir): Variant;
  /** Agents can walk through when open (doors). The engine opens it when an agent is within 1 tile. */
  door?: boolean;
  /** Free-form search keywords for the editor. */
  keywords?: string[];
}

export interface FloorQuery {
  /** Floor id at an offset from the tile being drawn (null = no floor / out of bounds). */
  floorAt(dx: number, dy: number): string | null;
  wallAt(dx: number, dy: number): boolean;
}

export interface FloorDef {
  id: string;
  name: string;
  /** Outdoor floors are where agents walk outside; indoor-only behaviour (wandering) avoids them. */
  outdoor: boolean;
  /** Cars can drive on it. */
  drivable?: boolean;
  /** Default true. False for water and similar. */
  walkable?: boolean;
  /** Draws one 32x32 tile at (0,0) of ctx (already translated). (tx, ty) are world tile coords for deterministic variation. */
  draw(ctx: CanvasRenderingContext2D, tx: number, ty: number, q: FloorQuery): void;
}

export interface WallStyleDef {
  id: string;
  name: string;
  kind: 'interior' | 'exterior' | 'glass';
  /** Cap (top of the wall line) colours: fill, edge (outline), and highlight on the north edge. */
  cap: { fill: string; edge: string; highlight: string };
  /**
   * Paints a vertical 1-px-wide slice of the wall face. The face is WALL_FACE_H px tall.
   * `col` is the world x pixel (for patterns), `edge` is 'left' | 'right' | null when this slice ends the face.
   */
  faceSlice(ctx: CanvasRenderingContext2D, x: number, y: number, col: number, edge: 'left' | 'right' | null): void;
}
