import { Dir } from '../../art/types';
import { LayoutBuilder } from '../builder';
import { Building, Layout } from '../layout';

type Item = [type: string, x: number, y: number, dir?: Dir];

/** Map size shared by both floors. */
const W = 56;
const H = 42;

interface Kit {
  b: LayoutBuilder;
  put(items: Item[]): void;
  row(type: string, x0: number, x1: number, y: number, dir?: Dir): void;
  column(type: string, x: number, y0: number, y1: number, dir?: Dir): void;
  door(type: string, x: number, y: number, dir: Dir): void;
}

function kit(floor: string | null): Kit {
  const b = new LayoutBuilder(W, H, floor);
  return {
    b,
    put(items) {
      for (const [type, x, y, dir] of items) {
        b.put(type, x, y, dir);
      }
    },
    row(type, x0, x1, y, dir = 'down') {
      for (let x = x0; x <= x1; x++) {
        b.put(type, x, y, dir);
      }
    },
    column(type, x, y0, y1, dir = 'down') {
      for (let y = y0; y <= y1; y++) {
        b.put(type, x, y, dir);
      }
    },
    door(type, x, y, dir) {
      b.wall(x, y, x, y, null);
      b.put(type, x, y, dir);
    },
  };
}

/**
 * The HQ: one brick building (15,3)-(46,26) in a business-park garden. Two floors share the footprint and the core
 * (lift (30,17), stairs (32,14), restrooms either side); the front door (30-31,26) is right below the lift. The ground
 * floor holds the outdoors, the canteen and the building services; floor 2 is where the teams work.
 * Built from docs/ARCHITECTURE_PLAN.md (map coordinates throughout).
 */
export function hqBuilding(): Building {
  return {
    floors: [
      { id: 'ground', label: 'Floor 1', level: 0, layout: groundFloor() },
      { id: 'upper', label: 'Floor 2', level: 1, layout: upperFloor() },
    ],
  };
}

/** Exterior walls, the corridor wall line north of the core, and the core itself: restrooms, stairs, lift. */
function shell(k: Kit): void {
  const { b } = k;
  b.fill(25, 13, 38, 15, 'tile.restroom');
  b.fill(32, 13, 33, 16, 'tile.terrazzo');
  b.box(15, 3, 46, 26, 'wall.concrete.white');
  b.wall(16, 3, 45, 3, 'wall.cream');
  b.wall(25, 13, 30, 13, 'wall.tile').wall(31, 13, 34, 13, 'wall.cream').wall(35, 13, 37, 13, 'wall.tile').wall(38, 13, 38, 13, 'wall.cream');
  b.wall(25, 14, 25, 15, 'wall.cream').wall(31, 14, 31, 15, 'wall.cream').wall(34, 14, 34, 15, 'wall.cream').wall(38, 14, 38, 15, 'wall.cream');
  b.wall(25, 16, 31, 16, 'wall.wood').wall(34, 16, 38, 16, 'wall.wood');
  k.door('door.oak', 28, 13, 'down');
  k.door('door.oak', 36, 13, 'down');
  k.put([
    ['toilet.stall', 26, 14], ['toilet.stall', 27, 14], ['sink.vanity', 30, 14],
    ['sink.vanity', 35, 14], ['toilet.stall', 37, 14],
    ['stairs', 32, 14], ['elevator', 30, 17], ['mat.entrance', 30, 18],
  ]);
}

/** Window runs in the exterior walls: ribbon windows on the south façade (y 26), framed glass in the side walls. */
function windows(b: LayoutBuilder, south: [number, number][], west: [number, number][], east: [number, number][]): void {
  for (const [x0, x1] of south) {
    b.wall(x0, 26, x1, 26, 'wall.concrete.window');
  }
  for (const [y0, y1] of west) {
    b.wall(15, y0, 15, y1, 'wall.window.frame');
  }
  for (const [y0, y1] of east) {
    b.wall(46, y0, 46, y1, 'wall.window.frame');
  }
}

// ================================================================================================ ground floor

function groundFloor(): Layout {
  const k = kit('grass');
  const { b, put, row } = k;
  outdoors(k);

  b.fill(15, 3, 46, 26, 'tile.marble');
  b.fill(16, 4, 24, 9, 'tile.kitchen'); // kitchen + servery
  b.fill(16, 10, 24, 25, 'wood.oak'); // canteen
  b.fill(26, 4, 33, 9, 'tile.raised'); // server room
  b.fill(35, 4, 45, 9, 'carpet.warmgrey'); // IT help, archive
  b.fill(42, 14, 45, 16, 'carpet.warmgrey'); // print room
  b.fill(42, 18, 45, 19, 'tile.linoleum'); // janitor closet
  b.fill(41, 21, 45, 25, 'wood.walnut'); // reading corner
  b.fill(34, 22, 37, 25, 'carpet.slate'); // security
  shell(k);
  windows(b, [[17, 23], [26, 29], [42, 45]], [[11, 13], [16, 18], [21, 23]], [[5, 8], [22, 24]]);

  b.wall(23, 9, 23, 9, 'wall.terracotta');
  b.wall(25, 4, 25, 12, 'wall.cream').wall(25, 17, 25, 25, 'wall.cream');
  b.wall(26, 10, 45, 10, 'wall.cream');
  b.wall(34, 4, 34, 9, 'wall.cream').wall(41, 4, 41, 9, 'wall.cream');
  b.wall(39, 13, 45, 13, 'wall.cream');
  b.wall(41, 14, 41, 20, 'wall.cream').wall(42, 17, 45, 17, 'wall.cream').wall(42, 20, 45, 20, 'wall.sage');
  b.wall(33, 21, 37, 21, 'wall.cream').wall(38, 21, 38, 25, 'wall.cream').wall(33, 22, 33, 25, 'wall.glass');

  k.door('door.entrance.left', 30, 26, 'down');
  k.door('door.entrance.right', 31, 26, 'down');
  k.door('door.oak', 24, 9, 'down');
  // the canteen is open to the service corridor and, wide, to the entrance hall
  k.door('door.open', 25, 11, 'left');
  for (const y of [18, 19, 20, 21]) {
    k.door('door.open', 25, y, 'left');
  }
  k.door('door.oak', 29, 10, 'down');
  k.door('door.oak', 37, 10, 'down');
  k.door('door.oak', 43, 10, 'down');
  k.door('door.glass', 39, 13, 'down');
  k.door('door.glass', 40, 13, 'down');
  k.door('door.oak', 41, 16, 'left');
  k.door('door.oak', 41, 19, 'left');
  k.door('door.glass', 33, 23, 'left');

  // kitchen: cooking line on the north wall, prep island, staff serve from behind the line (y 8)
  put([
    ['kitchen.range', 16, 4], ['kitchen.range', 17, 4], ['counter.plain', 18, 4], ['counter.sink', 19, 4],
    ['kitchen.dishwasher', 20, 4], ['counter.plain', 21, 4], ['fridge', 22, 4], ['fridge', 23, 4],
    ['kitchen.prep', 18, 6], ['kitchen.prep', 21, 6],
  ]);

  // servery: trays at the hall end, hot food, salad; people queue along y 10
  put([
    ['canteen.line.salad', 16, 9], ['canteen.line.hot', 18, 9], ['canteen.line.hot', 20, 9], ['canteen.trays', 22, 9],
    ['trolley.dishreturn', 23, 10],
  ]);
  row('marking.queue', 16, 22, 10);

  // canteen: six six-seat tables in two columns, plants and lamps in the corners
  for (const y of [13, 17, 21]) {
    put([['table.dining.canteen', 16, y], ['table.dining.canteen', 21, y]]);
  }
  put([
    ['plant.tall.monstera', 24, 25], ['plant.tall.palm', 16, 25], ['lamp.floor.brass', 19, 25],
  ]);

  // server room: racks along the north and side walls, UPS and cooling, the QA bench and internet kiosk
  put([
    ['ups', 26, 4], ['rack.cabinet.dark', 27, 4], ['rack.cabinet.white', 28, 4], ['rack.cabinet.dark', 29, 4],
    ['rack.cabinet.dark', 30, 4], ['rack.cabinet.white', 31, 4], ['kiosk.internet', 32, 4], ['booth.pc.navy', 33, 4],
    ['cooling.unit', 26, 7, 'right'], ['rack.cabinet.dark', 26, 8, 'right'],
    ['rack.cabinet.dark', 33, 7, 'left'], ['ups', 33, 8, 'left'],
    ['bench.qa', 29, 8],
  ]);

  // IT help: help desk facing the door, repair bench and parts on the north wall
  put([
    ['bench.repair', 35, 4], ['shelf.parts', 39, 4], ['stack.monitors', 40, 9],
    ['counter.helpdesk', 37, 6], ['chair.office.charcoal', 39, 7, 'right'], ['desk.oak.monitor', 40, 7, 'right'],
    ['plant.small.b', 35, 9], ['bin.office', 39, 9], ['wall.window', 37, 3],
  ]);

  // archive: cabinets along the north wall, the safe on the east wall
  put([
    ['cabinet.archive', 42, 4], ['cabinet.archive', 43, 4], ['cabinet.archive', 44, 4], ['cabinet.archive', 45, 4],
    ['safe.steel', 45, 7, 'left'], ['plant.small.a', 42, 9],
  ]);

  // print room and janitor closet off the east hall, an open reading corner
  put([
    ['printer.copier', 42, 14], ['printer.copier.charcoal', 43, 14], ['shelf.paper', 44, 14], ['shredder', 45, 14],
    ['vacuum', 42, 18], ['shelf.supplies', 45, 18, 'left'], ['sink.mop', 45, 19, 'left'],
    ['lamp.floor.brass', 41, 21], ['bookshelf.walnut', 42, 21], ['bookcase.narrow.oak', 44, 21],
    ['rug.cream', 43, 24], ['armchair.wingback.navy', 43, 24, 'right'], ['table.side', 44, 24], ['armchair.wingback.terracotta', 45, 24, 'left'],
    ['plant.tall.olive', 45, 25],
  ]);

  // security: CCTV wall and desk, glass to the hall so the guard sees the front door
  put([
    ['wall.cctv', 35, 21], ['desk.security', 35, 23, 'up'], ['chair.office.charcoal', 35, 24, 'up'],
    ['plant.small.a', 37, 25],
  ]);

  // entrance hall: mat inside the doors, waiting seats against the lift wall, brochures, plants
  put([
    ['mat.entrance', 30, 25], ['plant.tall.fiddle', 29, 25], ['plant.tall.fiddle', 32, 25],
    ['seating.waiting.teal', 35, 17], ['plant.tall.palm', 38, 17], ['coatrack', 34, 17], ['extinguisher', 26, 17],
    ['rack.brochure', 27, 17], ['board.tinytimes', 26, 24],
    ['rug.navy', 27, 21], ['armchair.sage', 27, 21, 'down'], ['table.side', 28, 21], ['armchair.mustard', 29, 21, 'down'],
    ['wall.clock', 28, 16], ['wall.sconce', 29, 16],
    ['plant.tall.palm', 26, 25], ['flag.stand', 40, 25],
  ]);

  b.layout.rooms = [
    { id: 'kitchen', kind: 'kitchen', name: 'Kitchen', x: 20, y: 7 },
    { id: 'canteen', kind: 'canteen', name: 'Canteen', x: 20, y: 16 },
    { id: 'server', kind: 'server', name: 'Server room', x: 30, y: 9 },
    { id: 'it', kind: 'it', name: 'IT help', x: 37, y: 9 },
    { id: 'archive', kind: 'storage', name: 'Archive', x: 43, y: 8 },
    { id: 'service', kind: 'corridor', name: 'Service corridor', x: 30, y: 12 },
    { id: 'print', kind: 'print', name: 'Print room', x: 43, y: 16 },
    { id: 'janitor', kind: 'janitor', name: 'Janitor closet', x: 43, y: 19 },
    { id: 'security', kind: 'security', name: 'Security', x: 34, y: 24 },
    { id: 'hall', kind: 'lobby', name: 'Entrance hall', x: 31, y: 22 },
    { id: 'wc.w.0', kind: 'restroom', name: 'Restroom', x: 28, y: 15 },
    { id: 'wc.e.0', kind: 'restroom', name: 'Restroom', x: 36, y: 15 },
  ];
  return b.layout;
}

// ================================================================================================ floor 2

function upperFloor(): Layout {
  const k = kit(null);
  const { b, put, row, column } = k;

  b.fill(15, 3, 46, 26, 'carpet.warmgrey');
  b.fill(16, 4, 29, 9, 'carpet.teal'); // team offices 1, 2
  b.fill(31, 4, 38, 9, 'carpet.slate'); // boardroom
  b.fill(40, 4, 45, 9, 'carpet.teal'); // team office 3
  b.fill(23, 14, 45, 25, 'wood.walnut'); // open reception and waiting corner
  b.fill(16, 14, 22, 19, 'tile.kitchen'); // kitchen nook
  b.fill(16, 20, 26, 25, 'wood.walnut'); // lounge
  b.fill(40, 20, 45, 25, 'carpet.slate'); // meeting room
  b.fill(42, 14, 45, 16, 'tile.linoleum'); // print room
  shell(k);
  windows(b, [[17, 25], [27, 37], [41, 44]], [[5, 8], [15, 18], [21, 24]], [[5, 8], [21, 24]]);

  b.wall(16, 10, 30, 10, 'wall.cream').wall(31, 10, 38, 10, 'wall.glass').wall(39, 10, 45, 10, 'wall.cream');
  b.wall(23, 4, 23, 9, 'wall.cream').wall(30, 4, 30, 9, 'wall.cream').wall(39, 4, 39, 9, 'wall.cream');
  b.wall(16, 13, 24, 13, 'wall.terracotta').wall(39, 13, 45, 13, 'wall.cream');
  b.wall(16, 20, 20, 20, 'wall.wood');
  b.wall(41, 14, 41, 16, 'wall.cream').wall(41, 17, 45, 17, 'wall.cream');
  b.wall(39, 19, 45, 19, 'wall.cream').wall(39, 20, 39, 25, 'wall.glass');

  k.door('door.oak', 21, 10, 'down');
  k.door('door.oak', 26, 10, 'down');
  k.door('door.glass', 32, 10, 'down');
  k.door('door.oak', 43, 10, 'down');
  b.wall(23, 13, 24, 13, null).wall(39, 13, 40, 13, null);
  k.door('door.oak', 41, 16, 'left');
  k.door('door.glass', 40, 19, 'down');

  // team office 1: four-desk pod under the windows, bookshelf on the east wall
  put([
    ['wall.window', 17, 3], ['wall.clock', 19, 3], ['wall.window', 20, 3],
    ['desk.oak.dual', 17, 5, 'down'], ['chair.office.teal', 17, 4, 'down'],
    ['desk.oak.monitor', 19, 5, 'down'], ['chair.office.charcoal', 19, 4, 'down'],
    ['desk.oak.monitor', 17, 6, 'up'], ['chair.office.charcoal', 17, 7, 'up'],
    ['desk.oak.laptop', 19, 6, 'up'], ['chair.office.mustard', 19, 7, 'up'],
    ['surface.plant', 18, 5], ['surface.mug', 20, 5], ['surface.lamp', 18, 6], ['surface.books', 20, 6],
    ['bin.office', 18, 4], ['bookshelf.oak', 22, 7, 'left'],
    ['plant.tall.fiddle', 16, 9], ['plant.tall.monstera', 22, 9],
  ]);

  // team office 2: three desks, two on the window wall
  put([
    ['wall.window', 24, 3], ['wall.window', 27, 3],
    ['desk.walnut.monitor', 24, 5, 'down'], ['chair.office.charcoal', 24, 4, 'down'],
    ['desk.walnut.monitor', 28, 5, 'down'], ['chair.office.teal', 28, 4, 'down'],
    ['desk.oak.dual', 24, 6, 'up'], ['chair.office.mustard', 24, 7, 'up'],
    ['surface.lamp', 25, 5], ['surface.mug', 29, 5], ['surface.plant', 25, 6],
    ['cabinet.filing', 29, 4], ['bookshelf.walnut', 29, 7, 'left'], ['plant.tall.palm', 24, 9], ['plant.small.a', 29, 9],
  ]);

  // boardroom: long table pointing at the TV, four seats down each side and one at the far end (9), glass front
  put([
    ['wall.window', 31, 3], ['wall.tv', 34, 3], ['wall.window', 37, 3],
    ['table.meeting.walnut.8', 34, 5, 'left'], ['surface.conference', 34, 6], ['surface.plant', 35, 7],
    ['chair.meeting.grey', 34, 9, 'up'],
    ['plant.small.a', 31, 4], ['plant.small.b', 38, 4], ['plant.tall.fiddle', 38, 9], ['plant.tall.monstera', 31, 8],
  ]);
  column('chair.meeting.grey', 33, 5, 8, 'right');
  column('chair.meeting.grey', 36, 5, 8, 'left');

  // team office 3: four desks around a central aisle
  put([
    ['wall.window', 40, 3], ['wall.window', 44, 3],
    ['desk.white.monitor', 40, 5, 'down'], ['chair.office.teal', 40, 4, 'down'],
    ['desk.white.monitor', 44, 5, 'down'], ['chair.office.charcoal', 44, 4, 'down'],
    ['desk.oak.laptop', 40, 7, 'up'], ['chair.office.mustard', 40, 8, 'up'],
    ['desk.oak.monitor', 44, 7, 'up'], ['chair.office.charcoal', 44, 8, 'up'],
    ['surface.lamp', 41, 5], ['surface.phone', 45, 5], ['surface.mug', 45, 7], ['surface.plant', 41, 7],
    ['bin.office', 45, 4], ['plant.tall.palm', 40, 9],
  ]);

  // corridor: art on the office walls, a water cooler at the east end
  put([
    ['wall.corkboard', 17, 10], ['wall.art.landscape', 24, 10], ['wall.clock', 28, 10],
    ['wall.art.wide', 40, 10],
    ['water.cooler', 45, 11], ['plant.tall.fiddle', 16, 11],
  ]);

  // print room: copier, paper, shredder, a supplies cabinet
  put([
    ['printer.copier', 42, 14], ['shelf.paper', 43, 14], ['shredder', 44, 14], ['cabinet.filing', 45, 14],
  ]);

  // kitchen nook, open onto the west passage and the lounge: counter run, bar table with stools
  put([
    ['fridge', 16, 14], ['counter.end.left', 17, 14], ['counter.sink', 18, 14], ['counter.coffee', 19, 14],
    ['counter.microwave', 20, 14], ['water.cooler', 21, 14], ['vending', 22, 14],
    ['table.bar.oak', 18, 18], ['surface.plant', 19, 18], ['lamp.floor.brass', 16, 19],
  ]);
  row('stool.bar', 18, 19, 17, 'down');
  row('stool.bar', 18, 19, 19, 'up');

  // reception: desk against the lift wall, waiting seats opposite, plants flanking the lift
  put([
    ['reception.desk', 25, 17], ['bell.desk', 27, 17],
    ['coatrack', 34, 17], ['seating.waiting.terracotta', 35, 17], ['rug.teal', 35, 18], ['plant.tall.palm', 38, 17],
    ['wall.clock', 26, 16], ['wall.art.abstract', 28, 16], ['wall.sconce', 29, 16],
  ]);

  // lounge corner behind a low walnut wall: sofa group by the bookshelf, foosball by the south wall
  put([
    ['wall.art.botanical', 16, 20],
    ['bookshelf.lounge', 19, 21],
    ['rug.large.sage', 17, 22], ['armchair.mustard', 17, 23, 'right'], ['table.coffee.oak', 18, 23], ['armchair.sage', 20, 23, 'left'],
    ['sofa.2.terracotta', 18, 24, 'up'], ['plant.tall.palm', 21, 21], ['lamp.floor.brass', 20, 25],
    ['game.foosball', 23, 25], ['plant.small.b', 26, 25],
  ]);

  // break zone along the south windows, open to reception: two sofa groups, a window counter with stools
  put([
    ['rug.large.sage', 27, 20], ['sofa.2.sage', 28, 20, 'down'], ['table.coffee.oak', 28, 21], ['sofa.2.terracotta', 28, 22, 'up'],
    ['armchair.mustard', 27, 21, 'right'], ['armchair.sage', 30, 21, 'left'],
    ['rug.large.navy', 33, 20], ['sofa.2.navy', 34, 20, 'down'], ['table.coffee.walnut', 34, 21], ['sofa.2.cream', 34, 22, 'up'],
    ['armchair.leather', 33, 21, 'right'], ['armchair.sage', 36, 21, 'left'],
    ['plant.tall.monstera', 32, 20], ['lamp.floor.brass', 31, 22], ['plant.tall.fiddle', 38, 20],
    ['table.bar.oak', 27, 25], ['table.bar.oak', 29, 25], ['table.bar.oak', 31, 25], ['table.bar.oak', 33, 25], ['table.bar.oak', 35, 25],
    ['plant.small.a', 37, 25], ['plant.tall.palm', 38, 25],
  ]);
  row('stool.bar', 27, 36, 24, 'down');

  // meeting room in the east corner: long table pointing at the screen, four seats down each side, one at the end (9)
  put([
    ['wall.tv', 42, 19], ['table.meeting.white.8', 42, 21, 'left'], ['surface.conference', 42, 22], ['surface.plant', 43, 23],
    ['chair.meeting.grey', 42, 25, 'up'], ['plant.tall.fiddle', 45, 18],
  ]);
  column('chair.meeting.grey', 41, 21, 24, 'right');
  column('chair.meeting.grey', 44, 21, 24, 'left');

  b.layout.rooms = [
    { id: 'office.1', kind: 'office', name: 'Team office 1', x: 18, y: 8 },
    { id: 'office.2', kind: 'office', name: 'Team office 2', x: 26, y: 8 },
    { id: 'board', kind: 'meeting', name: 'Boardroom', x: 34, y: 9 },
    { id: 'office.3', kind: 'office', name: 'Team office 3', x: 42, y: 8 },
    { id: 'reception', kind: 'reception', name: 'Reception', x: 31, y: 19 },
    { id: 'print.1', kind: 'print', name: 'Print room', x: 43, y: 16 },
    { id: 'meeting', kind: 'meeting', name: 'Meeting room', x: 40, y: 22 },
    { id: 'wc.w.1', kind: 'restroom', name: 'Restroom', x: 28, y: 15 },
    { id: 'wc.e.1', kind: 'restroom', name: 'Restroom', x: 36, y: 15 },
  ];
  return b.layout;
}

// ================================================================================================ outdoors

/** Ground-floor outdoors: north strip, west park with pond, forecourt, car park, street. */
function outdoors(k: Kit): void {
  const { b, put, row, column } = k;
  b.fill(0, 0, 55, 1, 'grass.meadow');
  b.fill(0, 0, 1, 34, 'grass.meadow');
  b.fill(55, 0, 55, 34, 'grass.meadow');
  b.fill(51, 0, 54, 6, 'grass.meadow');
  b.fill(0, 35, 55, 36, 'paving.stone');
  b.fill(0, 37, 55, 38, 'asphalt');
  b.fill(0, 39, 55, 39, 'paving.stone');
  b.fill(0, 40, 55, 41, 'grass.meadow');
  b.fill(15, 27, 46, 27, 'paving.stone');
  b.fill(26, 27, 35, 30, 'paving.brick');
  b.fill(29, 31, 32, 34, 'paving.brick');
  b.fill(38, 29, 41, 30, 'paving.stone');

  b.fill(47, 26, 52, 27, 'asphalt');
  b.fill(47, 28, 54, 33, 'asphalt');
  b.fill(53, 34, 54, 38, 'asphalt');

  b.fill(2, 8, 11, 8, 'path.gravel');
  b.fill(2, 8, 2, 27, 'path.gravel');
  b.fill(11, 8, 11, 27, 'path.gravel');
  b.fill(2, 27, 14, 27, 'path.gravel');
  b.fill(6, 28, 6, 34, 'path.gravel');
  b.fill(6, 4, 6, 7, 'path.gravel');
  const pond: [number, number, number][] = [[14, 5, 8], [15, 4, 9], [16, 4, 9], [17, 4, 9], [18, 4, 9], [19, 5, 8]];
  for (const [y, x0, x1] of pond) {
    b.fill(x0, y, x1, y, 'water');
  }
  b.fill(49, 3, 49, 25, 'path.gravel');
  b.fill(49, 25, 53, 25, 'path.gravel');
  b.fill(53, 25, 53, 27, 'path.gravel');

  // forecourt and plaza lawns
  put([
    ['flowerbed.red', 16, 28], ['bush.round.a', 18, 28], ['flowerbed.mixed', 20, 28], ['bush.round.b', 22, 28],
    ['flowerbed.yellow', 24, 28],
    ['flowerbed.yellow', 36, 28], ['bush.round.b', 38, 28], ['flowerbed.mixed', 39, 28], ['bush.round.a', 41, 28],
    ['flowerbed.red', 43, 28], ['bush.flowering', 45, 28],
    ['bench.park', 24, 30, 'down'], ['bin.street', 23, 30], ['bench.park', 36, 30, 'down'], ['bikerack', 38, 29],
    ['plant.tall.fiddle', 28, 27], ['plant.tall.fiddle', 33, 27],
    ['lamp.street', 28, 31], ['lamp.street', 33, 31],
    ['flowerbed.mixed', 27, 33], ['flowerbed.mixed', 33, 33], ['bollard', 29, 34], ['bollard', 32, 34],
    ['tree.maple', 17, 32], ['tree.oak.a', 21, 32], ['tree.birch', 41, 33], ['tree.oak.b', 45, 32],
    ['bush.flowering', 16, 30], ['bush.round.a', 23, 33], ['bush.round.b', 40, 32], ['bush.flowering', 38, 31],
    ['flowers.wild', 19, 30], ['grass.tuft', 25, 32], ['flowers.wild', 34, 32], ['grass.tuft', 37, 33], ['flowers.wild', 39, 33],
    ['sign.monument', 19, 34],
  ]);
  row('hedge', 15, 18, 34);
  row('hedge', 22, 28, 34);
  row('hedge', 33, 52, 34);

  // car park: two rows of 6 bays off a 2-tile aisle, access lane down to the road
  for (let x = 47; x <= 52; x++) {
    b.put('marking.bay', x, 26).put('marking.bay', x, 30);
  }
  row('hedge', 47, 48, 25);
  put([['bush.round.b', 54, 26], ['lamp.street', 54, 27], ['sign.post', 54, 25]]);
  for (const y of [35, 36]) {
    row('marking.crosswalk', 53, 54, y, 'left');
  }

  // street
  for (const y of [37, 38]) {
    row('marking.crosswalk', 30, 31, y, 'down');
  }
  row('marking.lane', 0, 29, 37);
  row('marking.lane', 32, 55, 37);
  put([
    ['lamp.street', 9, 35], ['lamp.street', 22, 35], ['lamp.street', 39, 35], ['lamp.street', 50, 35], ['bin.street', 34, 35],
    ['bush.round.a', 3, 40], ['flowerbed.mixed', 12, 40], ['bush.flowering', 18, 40], ['bush.round.b', 25, 40],
    ['flowerbed.yellow', 36, 40], ['bush.round.a', 42, 40], ['bush.flowering', 47, 40], ['flowerbed.red', 51, 40],
  ]);
  row('fence.wood', 0, 55, 41);

  // park
  column('hedge', 14, 3, 26, 'left');
  row('hedge', 0, 5, 34);
  row('hedge', 7, 14, 34);
  put([
    ['table.picnic', 7, 4],
    ['tree.oak.a', 3, 3], ['tree.maple', 10, 3], ['tree.birch', 1, 12], ['tree.oak.b', 12, 16], ['tree.oak.a', 1, 21],
    ['tree.birch', 9, 24], ['tree.maple', 3, 31], ['tree.oak.b', 11, 32],
    ['bench.park', 6, 12, 'down'], ['bin.street', 8, 12], ['bench.park', 6, 21, 'up'], ['bin.street', 8, 21],
    ['flowerbed.yellow', 3, 10], ['flowerbed.mixed', 8, 10], ['flowerbed.red', 3, 25], ['flowerbed.mixed', 7, 25],
    ['bush.round.a', 3, 13], ['bush.flowering', 10, 14], ['bush.round.b', 3, 20], ['bush.round.a', 10, 20],
    ['bush.flowering', 12, 6], ['bush.round.b', 0, 7], ['bush.round.a', 13, 29], ['bush.flowering', 0, 26],
    ['lamp.street', 3, 9], ['lamp.street', 10, 26], ['lamp.street', 7, 29], ['sign.post', 12, 28],
    ['rock.mossy', 4, 14], ['rock.mossy', 9, 19], ['rock.mossy', 10, 16], ['rock.mossy', 3, 18],
    ['grass.tuft', 5, 13], ['flowers.wild', 9, 13], ['grass.tuft', 4, 20], ['flowers.wild', 10, 18],
    ['flowers.wild', 5, 10], ['grass.tuft', 9, 16], ['flowers.wild', 4, 23], ['grass.tuft', 8, 23], ['flowers.wild', 10, 11],
    ['grass.tuft', 12, 10], ['flowers.wild', 13, 21], ['grass.tuft', 0, 15], ['flowers.wild', 1, 29], ['grass.tuft', 9, 30],
  ]);

  // north strip and east garden
  row('hedge', 15, 46, 2);
  put([
    ['bush.round.a', 20, 0], ['bush.flowering', 27, 1], ['bush.round.b', 35, 0], ['bush.round.a', 44, 1],
    ['flowerbed.mixed', 17, 0], ['flowerbed.yellow', 40, 0], ['bush.round.b', 1, 1], ['bush.round.a', 12, 1],
    ['bush.flowering', 50, 1],
    ['tree.oak.a', 51, 3], ['tree.birch', 54, 15], ['tree.maple', 51, 15], ['tree.oak.b', 54, 20],
    ['bench.park', 50, 18, 'down'], ['bin.street', 52, 18], ['lamp.street', 48, 15],
    ['flowerbed.red', 47, 8], ['flowerbed.yellow', 47, 22], ['bush.round.a', 48, 4], ['bush.flowering', 54, 24],
    ['tree.pine', 52, 7], ['tree.pine', 51, 23], ['bush.round.b', 52, 14], ['bush.flowering', 47, 6],
    ['flowers.wild', 50, 14], ['grass.tuft', 53, 17], ['flowers.wild', 52, 21], ['grass.tuft', 48, 19], ['flowers.wild', 54, 9],
  ]);
}
