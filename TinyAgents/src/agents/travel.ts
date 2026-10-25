import { Dir, TILE } from '../config';
import { variant } from '../art/registry';
import { Activity } from '../art/types';
import { Office, SpotRef } from '../world/office';
import { Agent, Step } from './agent';
import { Car, Waypoint } from './car';
import { Tile } from './nav';
import { Target, call, defer, fadeAway, fadeInto, pause, walkTo } from './steps';
import type { Director } from './director';

const OUTWARD: Record<Dir, Tile> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** A road crossing the map border: cars come in on one lane and leave on the other (drive on the right). */
interface Gate {
  inTile: Tile;
  outTile: Tile;
  /** direction pointing off the map */
  out: Dir;
}

interface BayGeometry {
  /** aisle tile the car turns in from */
  entry: Tile;
  centre: [number, number];
  /** parked facing */
  facing: Dir;
  /** direction of motion from the aisle into the bay */
  inDir: Dir;
}

const between = (rand: () => number, lo: number, hi: number) => lo + rand() * (hi - lo);

/**
 * Whether someone walks `levels` floors up (`up`) or down rather than taking the elevator. Baseline: one floor 80%
 * down / 60% up, then 10 points less per extra floor (at least 20% / 10%). Keen walkers (the stairs trait, average
 * about 0.35) nudge it up, lift lovers down.
 */
function prefersStairs(a: Agent, levels: number, up: boolean, rand: () => number): boolean {
  const base = up ? Math.max(0.1, 0.7 - 0.1 * levels) : Math.max(0.2, 0.9 - 0.1 * levels);
  return rand() < Math.min(0.95, Math.max(0.05, base + (a.traits.stairs - 0.35) * 0.5));
}

/** Getting people into and out of the office: cars, the front door, the elevator and the stairs. */
export class Travel {
  constructor(private d: Director) {}

  private get office(): Office {
    return this.d.office;
  }

  entrance(near?: Tile): SpotRef | undefined {
    const doors = this.office.spotsFor('enter');
    if (!near) {
      return doors[0];
    }
    return [...doors].sort((p, q) => Math.hypot(p.x - near[0], p.y - near[1]) - Math.hypot(q.x - near[0], q.y - near[1]))[0];
  }

  isOutdoor(a: Agent): boolean {
    const [x, y] = a.seg ?? [a.tx, a.ty];
    return this.office.isOutdoor(x, y);
  }

  /** Whether a tile can be reached from where the agent is, walking or through the building. */
  reachable(a: Agent, x: number, y: number): boolean {
    const [sx, sy] = a.seated && a.seatExit ? a.seatExit : a.seg ?? [a.tx, a.ty];
    if (this.d.nav.path(sx, sy, x, y)) {
      return true;
    }
    return !!this.entrance() && this.office.isOutdoor(sx, sy) !== this.office.isOutdoor(x, y);
  }

  /** Steps that bring the agent to a target, going through the building (front door, elevator or stairs) when needed. */
  route(a: Agent, target: Target, status?: string): Step[] | null {
    const [sx, sy] = a.seated && a.seatExit ? a.seatExit : a.seg ?? [a.tx, a.ty];
    if (this.d.nav.path(sx, sy, target.x, target.y)) {
      return [walkTo(this.d, target, status)];
    }
    const out = this.office.isOutdoor(sx, sy);
    const door = this.entrance([sx, sy]);
    if (!door || out === this.office.isOutdoor(target.x, target.y)) {
      return null;
    }
    if (out) {
      return [...this.goInside(door), ...this.upstairs(a), walkTo(this.d, target, status)];
    }
    return [...this.downstairs(a), this.outOfDoor(door), walkTo(this.d, target, status)];
  }

  // ---------------------------------------------------------------- the front door

  private goInside(door: SpotRef): Step[] {
    return [
      walkTo(this.d, { x: door.x, y: door.y, ox: door.px ?? 0, oy: door.py ?? 0, face: 'up' }, 'Walking in'),
      fadeAway('up', -14, 0.7, 'Going inside'),
    ];
  }

  private outOfDoor(door: SpotRef): Step {
    return fadeInto(door.x, door.y, door.px ?? 0, -14, 'down', 0.7, 'Leaving the building');
  }

  // ---------------------------------------------------------------- elevator and stairs

  private nearest(spots: SpotRef[], from: Tile): SpotRef | undefined {
    return [...spots].sort((p, q) => Math.hypot(p.x - from[0], p.y - from[1]) - Math.hypot(q.x - from[0], q.y - from[1]))[0];
  }

  /** Between the ground floor and this one, `up` or down: the stairs, or the elevator (see prefersStairs). */
  private useStairs(a: Agent, up: boolean): boolean {
    const lifts = this.office.spotsFor('elevator').length > 0;
    const stairs = this.office.spotsFor('stairs').length > 0;
    return stairs && (!lifts || prefersStairs(a, Math.max(1, this.d.level), up, this.d.rand));
  }

  /** Steps from hidden on the ground floor to standing upstairs: out of the elevator, up the stairs, or (neither) faded in. */
  upstairs(a: Agent, quick = false): Step[] {
    const d = this.d;
    const anchor: Tile = d.deskTile(a) ?? [Math.floor(this.office.w / 2), Math.floor(this.office.h / 2)];
    if (this.useStairs(a, true)) {
      return this.outOfStairs(this.nearest(this.office.spotsFor('stairs'), anchor)!, quick ? 2 : between(d.rand, 10, 15));
    }
    const spot = this.nearest(this.office.spotsFor('elevator'), anchor);
    if (spot) {
      return this.outOfLift(spot, quick ? between(d.rand, 2, 4) : between(d.rand, 6, 10));
    }
    const [x, y] = this.office.randomIndoorTile(d.rand);
    return [call((b) => (b.hidden = true), true), pause(quick ? 0.5 : 2, 'Arriving', true), fadeInto(x, y, 0, 0, 'down', 0.8, 'Arriving')];
  }

  /** Hidden in the stairwell for `seconds`, then up (or down) the stairs onto this floor and out of the way. */
  private outOfStairs(stairs: SpotRef, seconds: number): Step[] {
    return [
      call((x) => (x.hidden = true), true),
      pause(seconds, 'Taking the stairs', true),
      fadeInto(stairs.x, stairs.y, stairs.px ?? 0, -20, stairs.facing, 0.8, 'Off the stairs'),
      this.stepAside(stairs),
    ];
  }

  /** Riding the elevator to this floor (the doors here open when it arrives in about `seconds`), then stepping out. */
  private outOfLift(spot: SpotRef, seconds: number): Step[] {
    const d = this.d;
    const lift = d.liftFor(spot);
    return [
      {
        status: 'In the elevator',
        locked: true,
        begin(x) {
          x.hidden = true;
          x.alpha = 0;
          lift.rideUp(x, d.time + seconds);
        },
        tick: (x) => lift.exitOk.has(x) || !d.liftExists(lift),
        end: (x) => lift.exitOk.delete(x),
      },
      fadeInto(spot.x, spot.y, spot.px ?? 0, -18, 'down', 0.45, 'Stepping out'),
      this.stepAside(spot),
    ];
  }

  /** Whether people can go between this floor and `to` (both have an elevator, or both have stairs). */
  connects(to: Director): boolean {
    return (['elevator', 'stairs'] as const).some((k) => this.office.spotsFor(k).length > 0 && to.office.spotsFor(k).length > 0);
  }

  /**
   * The lift or stairs trip from this floor to `to`: walk to the elevator (wait, board) or the stairs here, change
   * directors, ride or climb, and step out on `to` (the matching shaft there, so stacked lifts line up). `walk: false`
   * starts hidden (already inside, e.g. just in through the front door). Null when the floors don't connect.
   */
  toFloor(a: Agent, to: Director, walk = true, from?: Tile): Step[] | null {
    const d = this.d;
    if (to === d) {
      return [];
    }
    if (!this.connects(to)) {
      return null;
    }
    const levels = Math.abs(to.level - d.level);
    const both = (k: Activity) => this.office.spotsFor(k).length > 0 && to.office.spotsFor(k).length > 0;
    const kind: Activity = both('stairs') && (!both('elevator') || prefersStairs(a, levels, to.level > d.level, d.rand)) ? 'stairs' : 'elevator';
    const start: Tile = from ?? (a.seated && a.seatExit ? a.seatExit : a.seg ?? [a.tx, a.ty]);
    const here = this.nearest(this.office.spotsFor(kind), start)!;
    const there = this.nearest(to.office.spotsFor(kind), [here.x, here.y])!;
    const leave = walk ? (kind === 'stairs' ? this.intoStairs(here) : this.intoLift(here)) : [];
    const arrive = kind === 'stairs' ? to.travel.outOfStairs(there, levels * between(d.rand, 6, 9)) : to.travel.outOfLift(there, 1.5 + levels * between(d.rand, 2, 3));
    return [...leave, call((x) => d.handOver(x, to), true), ...arrive];
  }

  /** Clears the doorway after stepping out, so the next rider has room. */
  private stepAside(spot: SpotRef): Step {
    const d = this.d;
    let target: Target | null = null;
    let inner: Step | null = null;
    return {
      status: 'Arriving',
      begin(a) {
        const room = d.nav.roomOf(spot.x, spot.y);
        const free = d.freeTilesNear(a, spot.x, spot.y + 1, 3).filter(([x, y]) => !(x === spot.x && y === spot.y) && d.nav.roomOf(x, y) === room);
        const pick = free[Math.floor(d.rand() * Math.min(3, free.length))];
        if (!pick) {
          return false;
        }
        target = { x: pick[0], y: pick[1] };
        inner = walkTo(d, target);
        return inner.begin!(a) !== false;
      },
      tick: (a, dt) => inner!.tick(a, dt),
      end: (a) => inner?.end?.(a),
    };
  }

  /** Steps from upstairs to hidden on the ground floor (elevator ride or stairs down). */
  downstairs(a: Agent, vanish = false): Step[] {
    const d = this.d;
    const here: Tile = [a.tx, a.ty];
    if (this.useStairs(a, false)) {
      return [...this.intoStairs(this.nearest(this.office.spotsFor('stairs'), here)!), pause(vanish ? 0 : between(d.rand, 10, 15), 'Taking the stairs', true)];
    }
    const spot = this.nearest(this.office.spotsFor('elevator'), here);
    if (spot) {
      return [...this.intoLift(spot), pause(vanish ? 0 : between(d.rand, 6, 10), 'In the elevator', true)];
    }
    return [fadeAway(a.dir, 0, 0.8, 'Leaving'), pause(vanish ? 0 : 2, 'Leaving', true)];
  }

  /** Walks onto the stairs and out of sight. */
  private intoStairs(stairs: SpotRef): Step[] {
    const face = OPPOSITE[stairs.facing];
    return [
      walkTo(this.d, { x: stairs.x, y: stairs.y, ox: stairs.px ?? 0, oy: stairs.py ?? 0, face }, 'Heading for the stairs'),
      fadeAway(face, -20, 0.8, 'Taking the stairs'),
    ];
  }

  /** Walks to the elevator, waits beside the doors, boards when they open and disappears inside. */
  private intoLift(spot: SpotRef): Step[] {
    const d = this.d;
    const lift = d.liftFor(spot);
    let waitAt: Tile = [spot.x, spot.y];
    let walk: Step | null = null;
    const [doorX, doorY] = Office.footPoint(spot.x, spot.y);
    const room = d.nav.roomOf(spot.x, spot.y);
    return [
      {
        status: 'Walking to the elevator',
        begin(x) {
          const free = d.freeTilesNear(x, spot.x, spot.y, 3).filter(([tx, ty]) => !(tx === spot.x && ty === spot.y) && !(tx === spot.x && ty === spot.y + 1) && d.nav.roomOf(tx, ty) === room);
          waitAt = free[0] ?? [spot.x, spot.y];
          walk = walkTo(d, { x: waitAt[0], y: waitAt[1] });
          const ok = walk.begin!(x) !== false;
          d.hold(x, `t:${waitAt[0]},${waitAt[1]}`);
          return ok;
        },
        tick: (x, dt) => walk!.tick(x, dt),
        end: (x) => walk?.end?.(x),
      },
      {
        status: 'Waiting for the elevator',
        begin(x) {
          x.face(doorX + (spot.px ?? 0), doorY - 20);
          lift.callDown(x);
        },
        tick(x) {
          x.face(doorX + (spot.px ?? 0), doorY - 20);
          return lift.boardOk.has(x) || !d.liftExists(lift);
        },
        end(x) {
          if (!lift.boardOk.delete(x)) {
            lift.forget(x);
          }
        },
      },
      { ...walkTo(d, { x: spot.x, y: spot.y, ox: spot.px ?? 0, face: 'up' }), status: 'Stepping in', locked: true },
      fadeAway('up', -18, 0.45, 'In the elevator'),
    ];
  }

  // ---------------------------------------------------------------- arrival and departure

  /**
   * How a person gets in: by car or on foot to the front door, then (in a taller building) through the lobby and up
   * the lift or stairs to their floor; in a one-storey building through the door and out of its own lift.
   */
  arrival(a: Agent): Step[] {
    const d = this.d;
    const home = a.homeFloor;
    const finish = call((x) => (x.arrived = true));
    const hidden = call((x) => (x.hidden = true), true);
    const appear = (): Step[] => [hidden, pause(0.5, 'Arriving', true), call((x) => d.handOver(x, home), true), ...home.travel.upstairs(a), finish];
    if (a.isSub) {
      return [hidden, pause(between(d.rand, 0.5, 2), 'Coming up', true), ...this.upstairs(a, true), finish];
    }
    const door = this.entrance() ?? (home !== d ? this.way() : undefined);
    if (!door) {
      return appear();
    }
    const outside = (d.rand() < a.traits.drives && this.byCar(a, door)) || this.onFoot(door);
    if (!outside) {
      return appear();
    }
    if (this.walkIn(door)) {
      return [...outside, ...(this.toFloor(a, home, true, [door.x, door.y]) ?? []), finish];
    }
    if (home === d) {
      return [...outside, ...this.goInside(door), ...this.upstairs(a), finish];
    }
    const inside = this.toFloor(a, home, false, [door.x, door.y]);
    return inside ? [...outside, ...this.goInside(door), ...inside, finish] : appear();
  }

  /** The first elevator (or stairs) spot on this floor. */
  private way(): SpotRef | undefined {
    return [...this.office.spotsFor('elevator'), ...this.office.spotsFor('stairs')][0];
  }

  /** Whether the front door leads into a walkable lobby (a real ground floor), not a façade people vanish into. */
  private walkIn(door: SpotRef): boolean {
    const way = this.way();
    return !!way && !!this.d.nav.path(door.x, door.y, way.x, way.y);
  }

  /**
   * How a person leaves: from an upper floor down to the ground floor first; then out to their car or the map edge,
   * through the lobby, or (a façade front door) down this floor's own lift and out of the door.
   */
  departure(a: Agent): Step[] {
    const d = this.d;
    const gone = call((x) => (x.gone = true), true);
    const ground = d.staff.ground;
    if (a.isSub) {
      return this.isOutdoor(a) ? [...this.home(a), gone] : [...this.downstairs(a, true), gone];
    }
    if (d !== ground) {
      const down = this.toFloor(a, ground);
      return down ? [...down, defer((x) => ground.travel.departure(x))] : [...this.downstairs(a, true), gone];
    }
    const edge = this.edgeFor(a);
    if (this.isOutdoor(a) || (edge && d.nav.path(a.tx, a.ty, edge[0], edge[1]))) {
      return [...this.home(a), gone];
    }
    const door = this.entrance([a.tx, a.ty]);
    return door ? [...this.downstairs(a), this.outOfDoor(door), ...this.home(a), gone] : [...this.downstairs(a, true), gone];
  }

  /** From the street to the car (which drives off) or to the map edge. */
  private home(a: Agent): Step[] {
    const d = this.d;
    const car = d.carOf(a);
    if (car) {
      const side = this.carSide(car.bay);
      return [
        walkTo(d, { x: car.bay.x, y: car.bay.y, ox: side * 18, face: side < 0 ? 'right' : 'left' }, 'Walking to the car'),
        fadeAway(side < 0 ? 'right' : 'left', 0, 0.45, 'Getting in the car'),
        call(() => this.depart(car), true),
      ];
    }
    const edge = this.edgeFor(a);
    if (!edge) {
      return [fadeAway(a.dir, 0, 0.8, 'Leaving')];
    }
    return [walkTo(d, { x: edge[0], y: edge[1] }, 'Walking home'), fadeAway(a.dir, 0, 0.6, 'Walking home')];
  }

  private onFoot(door: SpotRef): Step[] | null {
    const d = this.d;
    const edges = d.nav.edgeTiles();
    const scored = edges
      .map((t) => ({ t, s: (this.sidewalk(t) ? 0 : 1.5) + d.rand() * 2 }))
      .sort((p, q) => p.s - q.s)
      .slice(0, 6);
    for (const { t } of scored) {
      if (d.nav.path(t[0], t[1], door.x, door.y)) {
        return [
          {
            status: 'Walking in',
            locked: true,
            begin(x) {
              x.placeAt(t[0], t[1]);
              x.alpha = 0;
              x.hidden = false;
            },
            tick: () => true,
          },
          walkTo(d, { x: door.x, y: door.y, ox: door.px ?? 0, face: 'up', fadeIn: true }, 'Walking in'),
        ];
      }
    }
    return null;
  }

  private sidewalk([x, y]: Tile): boolean {
    const f = this.office.floorAt(x, y) ?? '';
    return f.startsWith('paving') || f.startsWith('path');
  }

  private edgeFor(a: Agent): Tile | undefined {
    const edges = this.d.nav.edgeTiles();
    const near = [...edges].sort((p, q) => Math.hypot(p[0] - a.tx, p[1] - a.ty) - Math.hypot(q[0] - a.tx, q[1] - a.ty)).slice(0, 8);
    return near.find((t) => this.sidewalk(t)) ?? near[0];
  }

  // ---------------------------------------------------------------- cars

  /** Border road crossings with an in lane and an out lane. Long runs (a road along the map edge) are not crossings. */
  gates(): Gate[] {
    const o = this.office;
    const gates: Gate[] = [];
    const sides: [Dir, Tile[]][] = [
      ['up', Array.from({ length: o.w }, (_, x) => [x, 0] as Tile)],
      ['down', Array.from({ length: o.w }, (_, x) => [x, o.h - 1] as Tile)],
      ['left', Array.from({ length: o.h }, (_, y) => [0, y] as Tile)],
      ['right', Array.from({ length: o.h }, (_, y) => [o.w - 1, y] as Tile)],
    ];
    for (const [out, tiles] of sides) {
      let run: Tile[] = [];
      const flush = () => {
        if (run.length && run.length <= 4) {
          // drive on the right: the in lane is on the right of a car heading into the map
          const first = run[0];
          const last = run[run.length - 1];
          const inTile = out === 'up' || out === 'right' ? first : last;
          const outTile = inTile === first ? last : first;
          gates.push({ inTile, outTile, out });
        }
        run = [];
      };
      for (const t of tiles) {
        if (o.drivable(t[0], t[1])) {
          run.push(t);
        } else {
          flush();
        }
      }
      flush();
    }
    return gates;
  }

  private offMap(t: Tile, out: Dir): [number, number] {
    const [cx, cy] = Car.center(t[0], t[1]);
    const [dx, dy] = OUTWARD[out];
    return [cx + dx * TILE * 1.5, cy + dy * TILE * 1.5];
  }

  private bayGeometry(bay: SpotRef): BayGeometry | null {
    const o = this.office;
    const v = variant(bay.item.type, bay.item.dir);
    const w = v?.w ?? 1;
    const h = v?.h ?? 1;
    const centre: [number, number] = [bay.item.x * TILE + (w * TILE) / 2, bay.item.y * TILE + (h * TILE) / 2];
    const options: [Tile, Dir][] = [];
    if (h >= w) {
      options.push([[bay.x, bay.item.y + h], 'up'], [[bay.x, bay.item.y - 1], 'down']);
    }
    if (w >= h) {
      options.push([[bay.item.x + w, bay.y], 'left'], [[bay.item.x - 1, bay.y], 'right']);
    }
    const pick = options.find(([t]) => o.drivable(t[0], t[1]));
    if (!pick) {
      return null;
    }
    const [entry, inDir] = pick;
    const vertical = (dir: Dir) => dir === 'up' || dir === 'down';
    const facing = vertical(bay.facing) === vertical(inDir) ? bay.facing : inDir;
    return { entry, centre, facing, inDir };
  }

  /** A bay is taken when reserved or when a parked car prop stands on it. */
  private bayFree(bay: SpotRef, a: Agent): boolean {
    if (!this.d.isFree(bay.key, a)) {
      return false;
    }
    return !this.office.layout.items.some((it) => this.office.defOf(it)?.group === 'car' && this.office.covers(it, bay.x, bay.y));
  }

  private carSide(bay: SpotRef): number {
    const o = this.office;
    const open = (x: number) => this.d.nav.walkable(x, bay.y) && !o.spotsFor('parking').some((s) => s.x === x && s.y === bay.y);
    return open(bay.x - 1) || !open(bay.x + 1) ? -1 : 1;
  }

  private byCar(a: Agent, door: SpotRef): Step[] | null {
    const d = this.d;
    const o = this.office;
    const bays = o
      .parkingSpots()
      .filter((b) => this.bayFree(b, a))
      .sort((p, q) => Math.hypot(p.x - door.x, p.y - door.y) - Math.hypot(q.x - door.x, q.y - door.y) + (d.rand() - 0.5) * 6);
    const gates = this.gates().sort(() => d.rand() - 0.5);
    for (const bay of bays) {
      const geo = this.bayGeometry(bay);
      if (!geo || !d.nav.path(bay.x, bay.y, door.x, door.y)) {
        continue;
      }
      for (const gate of gates) {
        const road = o.findRoadPath(gate.inTile[0], gate.inTile[1], geo.entry[0], geo.entry[1]);
        if (!road && !(gate.inTile[0] === geo.entry[0] && gate.inTile[1] === geo.entry[1])) {
          continue;
        }
        const car = new Car(a.id, bay, this.offMap(gate.inTile, gate.out));
        car.route = [
          { x: Car.center(...gate.inTile)[0], y: Car.center(...gate.inTile)[1] },
          ...(road ?? []).map(([x, y]): Waypoint => ({ x: Car.center(x, y)[0], y: Car.center(x, y)[1] })),
          { x: geo.centre[0], y: geo.centre[1], facing: geo.facing, slow: 0.4 },
        ];
        car.owner = a;
        d.addCar(car);
        d.reserved.set(bay.key, a);
        const side = this.carSide(bay);
        return [
          {
            status: 'Driving in',
            locked: true,
            begin(x) {
              x.hidden = true;
              x.alpha = 0;
              x.placeAt(bay.x, bay.y);
            },
            tick: () => car.state === 'parked',
          },
          fadeInto(bay.x, bay.y, side * 18, 0, side < 0 ? 'left' : 'right', 0.5, 'Getting out of the car'),
          walkTo(d, { x: door.x, y: door.y, ox: door.px ?? 0, face: 'up' }, 'Walking in'),
        ];
      }
    }
    return null;
  }

  /** Puts the agent's car straight into a free bay, already parked (for people who were at work before the page opened). */
  parkNow(a: Agent): void {
    const d = this.d;
    const bay = this.office.parkingSpots().find((b) => this.bayFree(b, a) && this.bayGeometry(b));
    const geo = bay && this.bayGeometry(bay);
    if (!bay || !geo) {
      return;
    }
    const car = new Car(a.id, bay, [geo.centre[0], geo.centre[1]]);
    car.dir = geo.facing;
    car.heading = geo.facing;
    car.state = 'parked';
    car.alpha = 1;
    car.owner = a;
    d.addCar(car);
    d.reserved.set(bay.key, a);
  }

  /** Backs out of (or drives out of) the bay and leaves through a road gate. */
  depart(car: Car): void {
    const o = this.office;
    const geo = this.bayGeometry(car.bay);
    const gates = this.gates();
    const from: Tile = geo?.entry ?? [car.bay.x, car.bay.y];
    const options = gates
      .map((g) => ({ g, road: o.findRoadPath(from[0], from[1], g.outTile[0], g.outTile[1]) }))
      .filter((x) => x.road || (x.g.outTile[0] === from[0] && x.g.outTile[1] === from[1]));
    const pick = options[Math.floor(this.d.rand() * options.length)];
    if (!geo || !pick) {
      car.state = 'leaving';
      car.route = [{ x: car.x, y: car.y, fadeOut: true }];
      return;
    }
    const [ex, ey] = Car.center(...geo.entry);
    const outDir = OPPOSITE[geo.inDir];
    car.route = [
      { x: ex, y: ey, facing: outDir === geo.facing ? undefined : geo.facing, slow: 0.4 },
      ...(pick.road ?? []).map(([x, y]): Waypoint => ({ x: Car.center(x, y)[0], y: Car.center(x, y)[1] })),
      { x: this.offMap(pick.g.outTile, pick.g.out)[0], y: this.offMap(pick.g.outTile, pick.g.out)[1], fadeOut: true },
    ];
    car.state = 'leaving';
  }
}
