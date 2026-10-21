export const TILE = 32;
/** An agent standing on a tile has its foot point at (tile x + TILE / 2, tile y + FOOT_Y). */
export const FOOT_Y = 26;
/** Thickness of a wall line in px. */
export const WALL_LINE = 8;
/** Height of a wall face in px. */
export const WALL_FACE_H = 40;
export const WALK_SPEED = 64;
export const DRIVE_SPEED = 120;
export const ZOOM_LEVELS = [1, 2, 3, 4];
/** Deepest outline colour (art bible palette). */
export const INK = '#1f1a24';

export type { Dir } from './art/types';
