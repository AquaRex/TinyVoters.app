import { Dir, DRIVE_SPEED, TILE } from '../config';
import { allAssets } from '../art/registry';
import { hash } from '../render/pixel';
import { CarView } from '../render/renderer';
import { SpotRef } from '../world/office';
import type { Agent } from './agent';

export type CarState = 'arriving' | 'parked' | 'leaving' | 'gone';

/** A point on a car's route. With `facing`, the car keeps that facing while moving (reversing into or out of a bay). */
export interface Waypoint {
  x: number;
  y: number;
  facing?: Dir;
  /** speed factor */
  slow?: number;
  /** fade out while driving to this point (leaving the map) */
  fadeOut?: boolean;
}

const AHEAD: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

/** A car driving along tile centres (axis-aligned), drawn from a vehicle asset facing its direction. Never rotated. */
export class Car implements CarView {
  x: number;
  y: number;
  dir: Dir = 'down';
  alpha = 0;
  assetId: string;
  state: CarState = 'arriving';
  route: Waypoint[] = [];
  waitFor = 0;
  owner: Agent | null = null;
  /** last motion direction (differs from `dir` while reversing) */
  heading: Dir = 'down';

  constructor(
    readonly ownerId: string,
    public bay: SpotRef,
    start: [number, number],
  ) {
    const models = allAssets().filter((a) => a.group === 'car');
    this.assetId = models.length ? models[hash(ownerId) % models.length].id : '';
    [this.x, this.y] = start;
  }

  static center(tx: number, ty: number): [number, number] {
    return [tx * TILE + TILE / 2, ty * TILE + TILE / 2];
  }

  get moving(): boolean {
    return this.state === 'arriving' || this.state === 'leaving';
  }

  /** Returns true when the route is finished. `blocked` says whether another car is in the way ahead. */
  update(dt: number, blocked: (car: Car, dir: Dir) => boolean): boolean {
    if (!this.moving) {
      return false;
    }
    const wp = this.route[0];
    if (!wp) {
      return true;
    }
    if (!wp.fadeOut) {
      this.alpha = Math.min(1, this.alpha + dt * 2.5);
    }
    const dx = wp.x - this.x;
    const dy = wp.y - this.y;
    const dist = Math.hypot(dx, dy);
    const motion: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    if (dist > 0.5) {
      this.heading = motion;
      this.dir = wp.facing ?? motion;
      if (blocked(this, motion)) {
        this.waitFor += dt;
        if (this.waitFor < 3) {
          return false;
        }
      } else {
        this.waitFor = 0;
      }
    }
    const budget = DRIVE_SPEED * (wp.slow ?? 1) * dt;
    if (dist <= budget) {
      this.x = wp.x;
      this.y = wp.y;
      this.route.shift();
      return this.route.length === 0;
    }
    this.x += (dx / dist) * budget;
    this.y += (dy / dist) * budget;
    if (wp.fadeOut) {
      this.alpha = Math.max(0, Math.min(this.alpha, dist / TILE));
    }
    return false;
  }

  /** Whether a point lies in the lane just ahead of this car, moving `dir`. */
  ahead(dir: Dir, px: number, py: number): boolean {
    const [ax, ay] = AHEAD[dir];
    const rx = px - this.x;
    const ry = py - this.y;
    const along = rx * ax + ry * ay;
    const across = Math.abs(rx * ay - ry * ax);
    return along > 4 && along < TILE * 1.9 && across < TILE * 0.8;
  }
}
