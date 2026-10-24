export const TILE = 32;
/** An agent standing on a tile has its foot point at (tile x + TILE / 2, tile y + FOOT_Y). */
export const FOOT_Y = 26;
/** Thickness of a wall line in px. */
export const WALL_LINE = 8;
/** Height of a wall face in px. */
export const WALL_FACE_H = 40;
/** Height of one storey on screen: an upper floor is drawn this many px higher per level (one wall face and its cap). */
export const STOREY_H = WALL_FACE_H + WALL_LINE;
export const WALK_SPEED = 64;
export const DRIVE_SPEED = 120;
/**
 * Device px per world px. Whole numbers keep pixels square and crisp; the fractions below 1 are a smoothed
 * overview, chosen so a tile stays a whole number of device px (no seams between tiles).
 */
export const ZOOM_LEVELS = [0.25, 0.375, 0.5, 0.625, 0.75, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12];
/** Closest zoom, in CSS px per world px. */
export const MAX_CSS_ZOOM = 4;
/** Deepest outline colour (art bible palette). */
export const INK = '#1f1a24';

export type { Dir } from './art/types';
