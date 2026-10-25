import { Dir } from '../config';
import { Office, SpotRef } from '../world/office';
import { Act, Agent, Step } from './agent';
import { Needs, restore } from './needs';
import { Tile } from './nav';
import type { Director } from './director';

export interface Target {
  x: number;
  y: number;
  /** the spot being used (sit on it, or stand at it with its pixel offset) */
  spot?: SpotRef;
  face?: Dir;
  /** pixel offset of the final position (defaults to the spot's px / py) */
  ox?: number;
  oy?: number;
  /** fade in while walking (coming in from the map edge) */
  fadeIn?: boolean;
}

const SIT_SPEED = 52;
const RISE_SPEED = 64;

/** Foot point for a target: the tile's foot point plus the spot / target offset. */
export function targetPoint(t: Target): [number, number] {
  const [fx, fy] = Office.footPoint(t.x, t.y);
  return [fx + (t.ox ?? t.spot?.px ?? 0), fy + (t.oy ?? t.spot?.py ?? 0)];
}

/**
 * Walks to a target: stands up first when seated (a short slide off the seat), follows a path with local
 * avoidance, re-paths when blocked or when the layout changed, and finishes by sliding onto a seat or into
 * the spot's exact position, facing the right way.
 */
export function walkTo(d: Director, target: Target, status?: string): Step {
  let phase: 'rise' | 'path' | 'sit' | 'settle' = 'path';
  let exit: Tile = [0, 0];
  let retries = 0;
  let riseWait = 0;
  const sit = target.spot?.pose === 'sit';

  const plan = (a: Agent): boolean => {
    const from = a.seg ?? [a.tx, a.ty];
    const p = d.nav.path(from[0], from[1], target.x, target.y, d.crowdPenalty(a, target));
    if (!p) {
      return false;
    }
    if (sit && p.length && p[p.length - 1][0] === target.x && p[p.length - 1][1] === target.y) {
      p.pop();
    }
    a.path = a.seg ? [a.seg, ...p] : p;
    a.goal = [target.x, target.y];
    return true;
  };

  return {
    status,
    begin(a) {
      d.leavePlace(a, target.spot?.key);
      if (target.spot) {
        d.hold(a, target.spot.key);
      }
      if (a.seated) {
        if (sit && a.tx === target.x && a.ty === target.y) {
          exit = d.exitTile(a);
          phase = 'sit';
          return;
        }
        exit = d.exitTile(a);
        phase = 'rise';
        return;
      }
      phase = 'path';
      return plan(a);
    },
    tick(a, dt) {
      switch (phase) {
        case 'rise': {
          a.act = 'idle';
          if (!d.canEnter(a, exit[0], exit[1]) && riseWait < 2) {
            riseWait += dt;
            return false;
          }
          a.seated = false;
          const [ex, ey] = Office.footPoint(exit[0], exit[1]);
          if (a.glide(ex, ey, RISE_SPEED, dt, false)) {
            a.tx = exit[0];
            a.ty = exit[1];
            if (!plan(a)) {
              a.path = [];
              phase = 'settle';
              return true;
            }
            phase = 'path';
          }
          return false;
        }
        case 'path': {
          const arrived = a.walk(dt, (x, y) => d.canEnter(a, x, y));
          if (target.fadeIn) {
            a.alpha = Math.min(1, a.alpha + dt * 1.6);
          }
          if (a.blockedFor > 0) {
            d.resolveBlock(a);
          }
          if (!arrived) {
            return false;
          }
          if (d.givingWay(a)) {
            a.moving = false;
            a.face(a.x + (target.x - a.tx), a.y + (target.y - a.ty));
            return false;
          }
          const there = a.tx === target.x && a.ty === target.y;
          const adjacent = d.nav.connected(a.tx, a.ty, target.x, target.y);
          if (sit && (there || adjacent)) {
            if (there) {
              a.seatExit = null;
            }
            exit = there ? d.exitTile(a) : [a.tx, a.ty];
            phase = 'sit';
            return false;
          }
          if (there) {
            phase = 'settle';
            return false;
          }
          if (++retries > 6 || !plan(a)) {
            return true;
          }
          a.pauseT = 0.3;
          return false;
        }
        case 'sit': {
          const spot = target.spot!;
          a.dir = spot.facing;
          a.seated = true;
          a.seatExit = exit;
          const [px, py] = targetPoint(target);
          if (a.glide(px, py, SIT_SPEED, dt, false)) {
            a.tx = target.x;
            a.ty = target.y;
            return true;
          }
          return false;
        }
        case 'settle': {
          const [px, py] = targetPoint(target);
          const done = a.glide(px, py, 40, dt, Math.hypot(px - a.x, py - a.y) > 3);
          if (done) {
            a.moving = false;
            if (target.face ?? target.spot?.facing) {
              a.dir = (target.face ?? target.spot?.facing)!;
            }
          }
          return done;
        }
      }
    },
    end(a) {
      a.moving = false;
      if (target.fadeIn) {
        a.alpha = 1;
      }
    },
  };
}

export interface HangoutOpts {
  seconds: number;
  act?: Act;
  /** needs restored over the whole duration */
  gains?: Partial<Needs>;
  /** others may start a conversation with this agent */
  chatty?: boolean;
  /** a conversation may stretch the hangout up to this many extra seconds */
  extend?: number;
  status?: string;
  /** keep going while this holds (checked every frame) */
  until?: (a: Agent) => boolean;
  /** called every frame */
  each?: (a: Agent, dt: number) => void;
}

/** Stays put doing something (typing, drinking, reading, relaxing); joins in when a conversation forms. */
export function hangout(o: HangoutOpts): Step {
  let t = o.seconds;
  let extra = o.extend ?? 25;
  return {
    status: o.status,
    chatty: o.chatty,
    begin(a) {
      a.act = o.act ?? 'idle';
      a.conv?.arrive(a);
    },
    tick(a, dt) {
      t -= dt;
      if (o.gains) {
        restore(a.needs, o.gains, dt / Math.max(1, o.seconds));
      }
      o.each?.(a, dt);
      const talking = a.conv && !a.conv.done;
      if (talking) {
        a.conv!.arrive(a);
        if (!a.seated) {
          const [fx, fy] = a.conv!.focusFor(a);
          a.face(fx, fy);
        }
        if (t <= 0 && extra > 0) {
          extra -= dt;
          return false;
        }
      }
      if (o.until) {
        return !o.until(a);
      }
      return t <= 0 && !(talking && extra > 0);
    },
    end(a) {
      a.act = 'idle';
      a.conv?.leave(a);
    },
  };
}

/** Ends the task here (e.g. a walk that no longer has a reason) once `stop` holds: the steps after it are dropped too. */
export function unless(step: Step, stop: (a: Agent) => boolean): Step {
  return {
    ...step,
    tick(a, dt) {
      if (stop(a)) {
        a.task?.steps.splice(1);
        return true;
      }
      return step.tick(a, dt);
    },
  };
}

export function pause(seconds: number, status?: string, locked = false): Step {
  let t = seconds;
  return {
    status,
    locked,
    tick(_a, dt) {
      return (t -= dt) <= 0;
    },
  };
}

/**
 * Plans the next steps only when reached, then runs them in its place: for plans that depend on where the agent is
 * by then, like the way back after changing floors (`build` runs on that floor's terms). Null plans nothing.
 */
export function defer(build: (a: Agent) => Step[] | null): Step {
  return {
    locked: true,
    tick(a) {
      a.task?.steps.splice(1, 0, ...(build(a) ?? []));
      return true;
    },
  };
}

export function call(fn: (a: Agent) => void, locked = false): Step {
  return {
    locked,
    tick(a) {
      fn(a);
      return true;
    },
  };
}

/** Steps through a doorway (front door, elevator, stairs): moves `dy` px while fading out, then hides. */
export function fadeAway(dir: Dir, dy: number, seconds: number, status?: string): Step {
  let gx = 0;
  let gy = 0;
  return {
    status,
    locked: true,
    begin(a) {
      a.dir = dir;
      gx = a.x;
      gy = a.y + dy;
    },
    tick(a, dt) {
      a.alpha = Math.max(0, a.alpha - dt / seconds);
      a.glide(gx, gy, Math.abs(dy) / seconds, dt, true);
      if (a.alpha > 0) {
        return false;
      }
      a.moving = false;
      a.hidden = true;
      return true;
    },
  };
}

/** Appears at a doorway: placed `dy` px from the foot point of (x, y) + offset, walks onto it while fading in. */
export function fadeInto(x: number, y: number, ox: number, dy: number, dir: Dir, seconds: number, status?: string): Step {
  let px = 0;
  let py = 0;
  return {
    status,
    locked: true,
    begin(a) {
      a.placeAt(x, y, ox, dy);
      [px, py] = Office.footPoint(x, y);
      px += ox;
      a.dir = dir;
      a.alpha = 0;
      a.hidden = false;
      a.seated = false;
    },
    tick(a, dt) {
      a.alpha = Math.min(1, a.alpha + dt / seconds);
      const there = a.glide(px, py, Math.max(10, Math.abs(dy) / seconds), dt, dy !== 0);
      if (there && a.alpha >= 1) {
        a.moving = false;
        return true;
      }
      return false;
    },
  };
}
