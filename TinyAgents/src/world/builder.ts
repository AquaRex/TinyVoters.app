import { Dir } from '../art/types';
import { Layout } from './layout';

/** Small helper for level scripts: fills, walls and item placement on a fresh layout. */
export class LayoutBuilder {
  readonly layout: Layout;
  private uid = 1;

  constructor(w: number, h: number, floor: string | null) {
    this.layout = { w, h, floor: new Array(w * h).fill(floor), walls: new Array(w * h).fill(null), items: [] };
  }

  fill(x0: number, y0: number, x1: number, y1: number, floor: string | null): this {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        this.layout.floor[y * this.layout.w + x] = floor;
      }
    }
    return this;
  }

  wall(x0: number, y0: number, x1: number, y1: number, style: string | null): this {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        this.layout.walls[y * this.layout.w + x] = style;
      }
    }
    return this;
  }

  /** Wall outline of a rectangle. */
  box(x0: number, y0: number, x1: number, y1: number, style: string): this {
    return this.wall(x0, y0, x1, y0, style).wall(x0, y1, x1, y1, style).wall(x0, y0, x0, y1, style).wall(x1, y0, x1, y1, style);
  }

  put(type: string, x: number, y: number, dir: Dir = 'down'): this {
    this.layout.items.push({ uid: this.uid++, type, x, y, dir });
    return this;
  }
}
