import { Dir } from '../../art/types';
import { LayoutBuilder } from '../builder';
import { Layout } from '../layout';

type Item = [type: string, x: number, y: number, dir?: Dir];

/**
 * The default office: a 32 x 21 brick office on the 2nd floor of a business-park building, with a park, a forecourt,
 * a car park and a street. Built from docs/ARCHITECTURE_PLAN.md (map coordinates throughout).
 */
export function hqLayout(): Layout {
  const b = new LayoutBuilder(56, 42, 'grass');
  const put = (items: Item[]): void => {
    for (const [type, x, y, dir] of items) {
      b.put(type, x, y, dir);
    }
  };
  const row = (type: string, x0: number, x1: number, y: number, dir: Dir = 'down'): void => {
    for (let x = x0; x <= x1; x++) {
      b.put(type, x, y, dir);
    }
  };
  const column = (type: string, x: number, y0: number, y1: number, dir: Dir = 'down'): void => {
    for (let y = y0; y <= y1; y++) {
      b.put(type, x, y, dir);
    }
  };
  const door = (type: string, x: number, y: number, dir: Dir): void => {
    b.wall(x, y, x, y, null);
    b.put(type, x, y, dir);
  };

  // ---------------------------------------------------------------- ground
  b.fill(0, 0, 55, 1, 'grass.meadow');
  b.fill(0, 0, 1, 34, 'grass.meadow');
  b.fill(0, 40, 55, 41, 'grass.meadow');
  b.fill(55, 0, 55, 36, 'grass.meadow');
  b.fill(51, 0, 54, 6, 'grass.meadow');
  b.fill(0, 35, 55, 36, 'paving.stone');
  b.fill(0, 37, 55, 38, 'asphalt');
  b.fill(0, 39, 55, 39, 'paving.stone');
  b.fill(15, 24, 46, 27, 'paving.stone');
  b.fill(26, 27, 35, 30, 'paving.brick');
  b.fill(29, 31, 32, 34, 'paving.brick');
  b.fill(38, 29, 41, 30, 'paving.stone');

  // car park: two rows of 6 bays, each opening south onto a 2-tile aisle; access lane down to the road
  b.fill(47, 26, 52, 27, 'asphalt');
  b.fill(47, 28, 54, 33, 'asphalt');
  b.fill(53, 34, 54, 38, 'asphalt');

  // park loop, spurs and pond
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

  // east garden path, ending at the car park's north-east corner
  b.fill(49, 3, 49, 25, 'path.gravel');
  b.fill(49, 25, 53, 25, 'path.gravel');
  b.fill(53, 25, 53, 27, 'path.gravel');

  // ---------------------------------------------------------------- building floors
  b.fill(15, 3, 46, 23, 'carpet.warmgrey');
  b.fill(15, 3, 23, 10, 'carpet.teal');
  b.fill(24, 3, 30, 10, 'carpet.teal');
  b.fill(31, 3, 39, 10, 'carpet.slate');
  b.fill(40, 3, 46, 10, 'carpet.teal');
  b.fill(16, 10, 45, 10, 'carpet.warmgrey');
  b.fill(15, 13, 22, 17, 'tile.kitchen'); // kitchenette nook where the corridor meets the west lounge
  b.fill(15, 18, 22, 23, 'wood.oak'); // west lounge
  b.fill(25, 13, 38, 15, 'tile.restroom'); // core: WC west, lift shaft, stairs, WC east
  b.fill(32, 13, 33, 16, 'tile.terrazzo');
  b.fill(25, 16, 38, 16, 'wood.walnut');
  b.fill(23, 17, 40, 19, 'wood.walnut'); // lift lobby
  b.fill(23, 20, 40, 23, 'wood.oak'); // lounge
  b.fill(41, 13, 46, 23, 'carpet.warmgrey'); // focus room, library

  // ---------------------------------------------------------------- building walls
  b.box(15, 3, 46, 23, 'wall.brick');
  b.wall(16, 3, 45, 3, 'wall.cream'); // the north wall is seen from inside
  b.wall(16, 10, 30, 10, 'wall.cream').wall(31, 10, 38, 10, 'wall.glass').wall(39, 10, 45, 10, 'wall.cream');
  b.wall(23, 4, 23, 9, 'wall.cream').wall(30, 4, 30, 9, 'wall.cream').wall(39, 4, 39, 9, 'wall.cream');
  b.wall(16, 13, 22, 13, 'wall.terracotta');
  // central core (x 25-38): WC west | stairs | WC east, the lift on the lobby side between WC west and the stairs
  b.wall(25, 13, 30, 13, 'wall.tile').wall(31, 13, 34, 13, 'wall.cream').wall(35, 13, 37, 13, 'wall.tile').wall(38, 13, 38, 13, 'wall.cream');
  b.wall(25, 14, 25, 15, 'wall.cream').wall(31, 14, 31, 15, 'wall.cream').wall(34, 14, 34, 15, 'wall.cream').wall(38, 14, 38, 15, 'wall.cream');
  b.wall(25, 16, 31, 16, 'wall.wood').wall(34, 16, 38, 16, 'wall.wood');
  b.wall(41, 13, 45, 13, 'wall.cream').wall(41, 14, 41, 17, 'wall.glass');
  b.wall(41, 18, 45, 18, 'wall.sage').wall(41, 19, 41, 22, 'wall.cream');

  door('door.oak', 21, 10, 'down');
  door('door.oak', 26, 10, 'down');
  door('door.glass', 32, 10, 'down');
  door('door.oak', 43, 10, 'down');
  door('door.oak', 28, 13, 'down');
  door('door.oak', 36, 13, 'down');
  door('door.glass', 41, 14, 'left');
  door('door.oak', 41, 20, 'left');

  // ---------------------------------------------------------------- office A: 4-desk pod
  put([
    ['wall.window', 17, 3], ['wall.clock', 19, 3], ['wall.window', 20, 3],
    ['desk.oak.dual', 17, 5, 'down'], ['chair.office.teal', 17, 4, 'down'],
    ['desk.oak.monitor', 19, 5, 'down'], ['chair.office.charcoal', 19, 4, 'down'],
    ['desk.oak.monitor', 17, 6, 'up'], ['chair.office.charcoal', 17, 7, 'up'],
    ['desk.oak.laptop', 19, 6, 'up'], ['chair.office.mustard', 19, 7, 'up'],
    ['surface.plant', 18, 5], ['surface.mug', 20, 5], ['surface.lamp', 18, 6], ['surface.books', 20, 6],
    ['bin.office', 18, 4], ['cabinet.filing', 22, 4], ['bookshelf.oak', 22, 5, 'left'],
    ['plant.tall.monstera', 22, 8], ['plant.tall.fiddle', 16, 9],
  ]);

  // ---------------------------------------------------------------- office B
  put([
    ['wall.window', 24, 3], ['wall.window', 27, 3],
    ['desk.walnut.monitor', 24, 4, 'up'], ['chair.office.charcoal', 24, 5, 'up'],
    ['desk.walnut.monitor', 27, 4, 'up'], ['chair.office.teal', 27, 5, 'up'],
    ['desk.oak.dual', 24, 7, 'up'], ['chair.office.mustard', 24, 8, 'up'],
    ['surface.lamp', 25, 4], ['surface.mug', 28, 4], ['surface.plant', 25, 7],
    ['plant.small.a', 26, 4], ['cabinet.filing', 29, 4], ['whiteboard.stand', 28, 7],
    ['bin.office', 27, 9], ['plant.tall.palm', 29, 9], ['bookshelf.walnut', 29, 5, 'left'],
  ]);

  // ---------------------------------------------------------------- meeting room (8 + 2 end seats)
  put([
    ['wall.window', 31, 3], ['wall.tv', 34, 3], ['wall.window', 37, 3],
    ['table.meeting.walnut.8', 33, 6], ['surface.conference', 34, 6], ['surface.plant', 35, 7],
    ['chair.meeting.grey', 32, 6, 'right'], ['chair.meeting.grey', 37, 6, 'left'],
    ['plant.small.a', 31, 4], ['plant.small.b', 38, 4], ['plant.tall.monstera', 31, 9], ['plant.tall.fiddle', 38, 9],
  ]);
  row('chair.meeting.grey', 33, 36, 5, 'down');
  row('chair.meeting.grey', 33, 36, 8, 'up');

  // ---------------------------------------------------------------- office C
  put([
    ['wall.window', 41, 3], ['wall.window', 44, 3],
    ['desk.white.monitor', 41, 4, 'up'], ['chair.office.teal', 41, 5, 'up'],
    ['desk.white.monitor', 44, 4, 'up'], ['chair.office.charcoal', 44, 5, 'up'],
    ['desk.oak.laptop', 44, 7, 'up'], ['chair.office.mustard', 44, 8, 'up'],
    ['surface.lamp', 42, 4], ['surface.phone', 45, 4], ['surface.mug', 45, 7],
    ['plant.small.b', 43, 4], ['cabinet.filing', 40, 4], ['whiteboard.stand', 40, 7],
    ['plant.tall.palm', 40, 9], ['bin.office', 42, 9], ['plant.tall.fiddle', 45, 9],
  ]);

  // ---------------------------------------------------------------- corridor
  put([
    ['printer', 16, 11], ['water.cooler', 45, 11],
    ['wall.corkboard', 17, 10], ['wall.art.landscape', 24, 10], ['wall.clock', 28, 10],
    ['wall.shelf.plants', 39, 10], ['wall.art.wide', 41, 10], ['wall.art.botanical', 44, 10],
  ]);

  // ---------------------------------------------------------------- kitchenette nook: counter run, island with stools
  put([
    ['fridge', 16, 14], ['counter.end.left', 17, 14], ['counter.sink', 18, 14], ['counter.coffee', 19, 14],
    ['counter.microwave', 20, 14], ['counter.end.right', 21, 14], ['water.cooler', 22, 14],
    ['table.bar.oak', 17, 16], ['table.bar.oak', 19, 16], ['surface.plant', 18, 16], ['surface.mug', 20, 16],
    ['lamp.floor.brass', 21, 17],
  ]);
  row('stool.bar', 17, 20, 17, 'up');

  // ---------------------------------------------------------------- west lounge: sofa pit on a rug, foosball at the loud end
  put([
    ['rug.large.sage', 16, 20], ['sofa.2.sage', 17, 19, 'down'], ['table.coffee.oak', 17, 20], ['sofa.2.terracotta', 17, 21, 'up'],
    ['armchair.mustard', 16, 20, 'right'], ['armchair.leather', 19, 20, 'left'], ['lamp.floor.brass', 19, 19],
    ['plant.tall.monstera', 16, 18], ['plant.tall.palm', 16, 22], ['plant.small.a', 19, 22],
    ['game.foosball', 21, 21], ['plant.tall.fiddle', 22, 19],
  ]);

  // ---------------------------------------------------------------- core: restrooms either side of the lift and stairs
  put([
    ['toilet.stall', 26, 14], ['toilet.stall', 27, 14], ['sink.vanity', 29, 14], ['wall.dryer', 30, 13],
    ['sink.vanity', 35, 14], ['toilet.stall', 37, 14],
    ['stairs', 32, 14], ['elevator', 30, 17], ['mat.entrance', 30, 18],
  ]);

  // ---------------------------------------------------------------- lift lobby: reception west, waiting sofa east
  put([
    ['wall.clock', 26, 16], ['wall.art.abstract', 28, 16], ['wall.sconce', 29, 16], ['wall.sconce', 36, 16],
    ['reception.desk', 25, 17], ['plant.tall.fiddle', 29, 17],
    ['coatrack', 34, 17], ['sofa.3.leather', 35, 17, 'down'], ['rug.teal', 35, 18], ['plant.tall.palm', 38, 17], ['lamp.floor.brass', 40, 19],
  ]);

  // ---------------------------------------------------------------- lounge: café table, sofa group on the lift axis, café corner
  put([
    ['chair.cafe.oak', 25, 21, 'right'], ['table.round.cafe', 26, 21], ['chair.cafe.oak', 27, 21, 'left'],
    ['rug.large.sage', 29, 20], ['sofa.2.sage', 30, 20, 'down'], ['table.coffee.walnut', 30, 21],
    ['armchair.mustard', 29, 21, 'right'], ['armchair.sage', 32, 21, 'left'], ['lamp.floor.brass', 33, 20],
    ['rug.terracotta', 35, 21], ['chair.cafe.oak', 35, 21, 'right'], ['table.round.cafe', 36, 21],
    ['chair.cafe.oak', 37, 21, 'left'],
    ['plant.tall.palm', 23, 22], ['plant.small.b', 28, 22], ['plant.tall.monstera', 40, 22],
  ]);

  // ---------------------------------------------------------------- focus room, library
  put([
    ['wall.whiteboard', 44, 13], ['wall.clock', 42, 13],
    ['table.meeting.oak.4', 43, 15], ['surface.conference', 43, 15], ['surface.plant', 44, 16],
    ['chair.meeting.teal', 42, 15, 'right'], ['chair.meeting.teal', 42, 16, 'right'],
    ['chair.meeting.teal', 45, 15, 'left'], ['chair.meeting.teal', 45, 16, 'left'],
    ['plant.tall.fiddle', 45, 17],
    ['bookshelf.lounge', 42, 19], ['bookshelf.walnut', 44, 19],
    ['rug.cream', 42, 21], ['armchair.leather', 42, 21, 'right'], ['table.side', 43, 21], ['armchair.sage', 44, 21, 'left'],
    ['beanbag.mustard', 43, 22, 'up'], ['lamp.floor.brass', 45, 21], ['plant.small.b', 45, 22],
  ]);

  // ---------------------------------------------------------------- façade: one row under the south wall
  b.put('facade.corner.left.brick', 15, 24).put('facade.corner.right.brick', 46, 24).put('facade.entrance.brick', 30, 24);
  for (let x = 16; x <= 45; x++) {
    if (x === 30 || x === 31) {
      continue;
    }
    const fromDoor = x < 30 ? 29 - x : x - 32;
    b.put(fromDoor % 3 === 0 ? 'facade.wall.brick' : 'facade.window.brick', x, 24);
  }

  // ---------------------------------------------------------------- forecourt and plaza lawns
  put([
    ['flowerbed.red', 16, 28], ['bush.round.a', 18, 28], ['flowerbed.mixed', 20, 28], ['bush.round.b', 22, 28],
    ['flowerbed.yellow', 24, 28],
    ['flowerbed.yellow', 36, 28], ['bush.round.b', 38, 28], ['flowerbed.mixed', 39, 28], ['bush.round.a', 41, 28],
    ['flowerbed.red', 43, 28], ['bush.flowering', 45, 28],
    ['bench.park', 24, 30, 'down'], ['bin.street', 23, 30], ['bench.park', 36, 30, 'down'], ['bikerack', 38, 29],
    ['plant.tall.fiddle', 29, 27], ['plant.tall.fiddle', 32, 27],
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

  // ---------------------------------------------------------------- car park
  for (let x = 47; x <= 52; x++) {
    b.put('marking.bay', x, 26).put('marking.bay', x, 30);
  }
  row('hedge', 47, 48, 25);
  put([['bush.round.b', 54, 26], ['lamp.street', 54, 27], ['sign.post', 54, 25]]);
  for (const y of [35, 36]) {
    row('marking.crosswalk', 53, 54, y, 'left');
  }

  // ---------------------------------------------------------------- street
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

  // ---------------------------------------------------------------- park
  column('hedge', 14, 3, 23, 'left');
  row('hedge', 0, 5, 34);
  row('hedge', 7, 14, 34);
  put([
    ['table.picnic', 7, 4],
    ['tree.oak.a', 3, 3], ['tree.maple', 10, 3], ['tree.birch', 1, 12], ['tree.oak.b', 12, 16], ['tree.oak.a', 1, 21],
    ['tree.birch', 9, 24], ['tree.maple', 3, 31], ['tree.oak.b', 11, 32],
    ['bench.park', 6, 12, 'down'], ['bin.street', 8, 12], ['bench.park', 6, 21, 'up'], ['bin.street', 8, 21],
    ['flowerbed.yellow', 3, 10], ['flowerbed.mixed', 8, 10], ['flowerbed.red', 3, 25], ['flowerbed.mixed', 7, 25],
    ['bush.round.a', 3, 13], ['bush.flowering', 10, 14], ['bush.round.b', 3, 20], ['bush.round.a', 10, 20],
    ['bush.flowering', 12, 6], ['bush.round.b', 0, 7], ['bush.round.a', 13, 26], ['bush.flowering', 0, 26],
    ['lamp.street', 3, 9], ['lamp.street', 10, 26], ['lamp.street', 7, 29], ['sign.post', 12, 28],
    ['rock.mossy', 4, 14], ['rock.mossy', 9, 19], ['rock.mossy', 10, 16], ['rock.mossy', 3, 18],
    ['grass.tuft', 5, 13], ['flowers.wild', 9, 13], ['grass.tuft', 4, 20], ['flowers.wild', 10, 18],
    ['flowers.wild', 5, 10], ['grass.tuft', 9, 16], ['flowers.wild', 4, 23], ['grass.tuft', 8, 23], ['flowers.wild', 10, 11],
    ['grass.tuft', 12, 10], ['flowers.wild', 13, 21], ['grass.tuft', 0, 15], ['flowers.wild', 1, 29], ['grass.tuft', 9, 30],
  ]);

  // ---------------------------------------------------------------- north strip and east garden
  row('hedge', 15, 46, 2);
  put([
    ['bush.round.a', 20, 0], ['bush.flowering', 27, 1], ['bush.round.b', 35, 0], ['bush.round.a', 44, 1],
    ['flowerbed.mixed', 17, 0], ['flowerbed.yellow', 40, 0], ['bush.round.b', 1, 1], ['bush.round.a', 12, 1],
    ['bush.flowering', 50, 1],
    ['tree.oak.a', 51, 3], ['tree.birch', 53, 10], ['tree.maple', 51, 15], ['tree.oak.b', 54, 20],
    ['bench.park', 50, 18, 'down'], ['bin.street', 52, 18], ['lamp.street', 48, 15],
    ['flowerbed.red', 47, 10], ['flowerbed.yellow', 47, 22], ['bush.round.a', 48, 4], ['bush.flowering', 54, 24],
    ['tree.pine', 52, 7], ['tree.pine', 51, 23], ['bush.round.b', 53, 13], ['bush.flowering', 47, 6],
    ['flowers.wild', 50, 12], ['grass.tuft', 53, 17], ['flowers.wild', 52, 21], ['grass.tuft', 48, 19], ['flowers.wild', 54, 9],
  ]);

  return b.layout;
}
