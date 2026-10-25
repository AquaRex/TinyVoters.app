import type { Agent } from './agent';
import { LIFT_ARRIVE } from '../art/structure';

interface Trip {
  at: number;
  riders: Agent[];
  released: number;
  nextRelease: number;
}

/** Seconds for the cab to rise into view, then for the doors to slide open. Closing runs the same way back. */
const ARRIVE_SECONDS = 2.2;
const DOOR_SECONDS = 0.7;
/** State at which the doors count as open enough to step through. */
const DOORS_OPEN = LIFT_ARRIVE + (1 - LIFT_ARRIVE) * 0.8;
/** People per ride. */
export const LIFT_CAPACITY = 4;
/** Seconds for a full cab to go and come back for the next people waiting (or bring the next ride up). */
const ROUND_TRIP = 8;

/**
 * One elevator: door openness, rides arriving upstairs (riders step out one by one; up to LIFT_CAPACITY share a
 * ride) and pickups (people waiting upstairs board when the doors open, up to LIFT_CAPACITY a stop; the rest wait
 * for the cab to come back).
 */
export class Lift {
  open = 0;
  private holdUntil = -1;
  private trips: Trip[] = [];
  /** riders waiting upstairs, in arrival order */
  waiting: Agent[] = [];
  private callAt: number | null = null;
  private nextBoard = 0;
  /** people boarded at this stop so far */
  private loaded = 0;
  private lastRelease = -10;
  /** riders cleared to step out / step in */
  readonly exitOk = new Set<Agent>();
  readonly boardOk = new Set<Agent>();

  constructor(
    readonly uid: number,
    public spotKey: string,
    private rand: () => number,
  ) {}

  /** Lift state 0..1 for the elevator art: cab arriving up to LIFT_ARRIVE, then doors opening. */
  get openness(): number {
    return this.open;
  }

  get busy(): boolean {
    return this.trips.length > 0 || this.waiting.length > 0;
  }

  /**
   * Books a ride up arriving around `at`: joins a ride already arriving within a few seconds if it has room, else
   * takes the next one (a full cab arriving then means waiting for it to come back). Returns the arrival time.
   */
  rideUp(a: Agent, at: number): number {
    const near = this.trips.filter((t) => t.released === 0 && Math.abs(t.at - at) < 3.5);
    const trip = near.find((t) => t.riders.length < LIFT_CAPACITY);
    if (trip) {
      trip.riders.push(a);
      trip.at = Math.max(trip.at, Math.min(at, trip.at + 2));
      return trip.at;
    }
    const after = near.length ? Math.max(at, ...near.map((t) => t.at + ROUND_TRIP)) : at;
    this.trips.push({ at: after, riders: [a], released: 0, nextRelease: 0 });
    return after;
  }

  callDown(a: Agent): void {
    if (!this.waiting.includes(a)) {
      this.waiting.push(a);
    }
  }

  forget(a: Agent): void {
    this.waiting = this.waiting.filter((w) => w !== a);
    for (const t of this.trips) {
      const i = t.riders.indexOf(a);
      if (i >= t.released) {
        t.riders.splice(i, 1);
      }
    }
    this.trips = this.trips.filter((t) => t.released < t.riders.length);
    this.exitOk.delete(a);
    this.boardOk.delete(a);
  }

  private hold(until: number): void {
    this.holdUntil = Math.max(this.holdUntil, until);
  }

  update(dt: number, now: number): void {
    let unloading = false;
    for (const trip of this.trips) {
      if (now < trip.at) {
        continue;
      }
      unloading = true;
      this.hold(now + 1);
      if (this.open >= DOORS_OPEN && now >= trip.nextRelease && trip.released < trip.riders.length) {
        this.exitOk.add(trip.riders[trip.released++]);
        trip.nextRelease = now + 0.6;
        this.lastRelease = now;
        this.hold(now + 1.8);
      }
    }
    this.trips = this.trips.filter((t) => t.released < t.riders.length);

    if (this.waiting.length) {
      if (this.callAt === null) {
        this.callAt = this.open > LIFT_ARRIVE ? now : now + 1 + this.rand() * 2;
      }
      if (now >= this.callAt) {
        this.hold(now + 1);
        const clear = !unloading && now - this.lastRelease > 0.9;
        if (this.open >= DOORS_OPEN && clear && now >= this.nextBoard) {
          this.boardOk.add(this.waiting.shift()!);
          this.nextBoard = now + 0.7;
          this.hold(now + 1.8);
          if (++this.loaded >= LIFT_CAPACITY) {
            // full: the doors close behind the last one in, and the cab comes back for the rest
            this.loaded = 0;
            this.callAt = now + 1.8 + ROUND_TRIP;
          }
        }
      }
    } else {
      this.callAt = null;
      this.loaded = 0;
    }

    const want = now < this.holdUntil;
    const rate = this.open < LIFT_ARRIVE || (!want && this.open <= LIFT_ARRIVE) ? LIFT_ARRIVE / ARRIVE_SECONDS : (1 - LIFT_ARRIVE) / DOOR_SECONDS;
    this.open = want ? Math.min(1, this.open + dt * rate) : Math.max(0, this.open - dt * rate);
  }
}
