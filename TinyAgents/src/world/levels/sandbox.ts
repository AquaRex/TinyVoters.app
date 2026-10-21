import { LayoutBuilder } from '../builder';
import { Layout } from '../layout';

/**
 * Engine test level (?level=sandbox): a small building with an office, a lounge, a glass meeting room, a car park
 * and a street. Uses manifest ids; ones that aren't registered yet are skipped by the engine.
 */
export function sandboxLayout(): Layout {
  const b = new LayoutBuilder(34, 24, 'grass');

  // street and car park
  b.fill(0, 0, 2, 23, 'asphalt');
  b.fill(3, 2, 7, 13, 'asphalt');
  b.fill(3, 18, 33, 19, 'asphalt');
  b.fill(3, 14, 7, 17, 'paving.stone');
  b.fill(8, 16, 30, 17, 'paving.stone');
  for (const y of [2, 5, 8]) {
    b.put('marking.bay', 4, y).put('marking.bay', 6, y);
  }
  b.put('car.sedan.red', 4, 2).put('car.hatch.white', 6, 5, 'down');
  b.put('lamp.street', 3, 14).put('lamp.street', 8, 16).put('lamp.street', 20, 16);
  b.put('tree.oak.a', 31, 3).put('tree.maple', 31, 10).put('bush.round.a', 31, 14).put('bench.park', 24, 16);

  // building shell (2nd floor), façade along the south
  b.fill(9, 2, 30, 12, 'carpet.teal');
  b.fill(20, 2, 30, 12, 'wood.oak');
  b.box(9, 1, 30, 12, 'wall.brick');
  b.wall(19, 2, 19, 11, 'wall.cream');
  b.wall(19, 7, 19, 7, null);
  b.put('door.oak', 19, 7, 'left');
  for (let x = 9; x <= 30; x++) {
    b.put(x === 13 ? 'facade.entrance.brick' : 'facade.window.brick', x, 13);
    if (x === 13) {
      x++;
    }
  }

  // meeting room: glass partition with a door
  b.fill(10, 9, 18, 11, 'carpet.slate');
  b.wall(10, 8, 18, 8, 'wall.glass');
  b.wall(14, 8, 14, 8, null);
  b.put('door.glass', 14, 8);
  b.put('table.meeting.oak.4', 15, 9).put('chair.meeting.grey', 15, 11, 'up').put('chair.meeting.grey', 16, 11, 'up');

  // office: one desk row facing up (screens visible), one facing down
  b.put('desk.oak.monitor', 10, 3, 'up').put('chair.office.charcoal', 10, 4, 'up').put('chair.office.charcoal', 11, 4, 'up');
  b.put('desk.oak.monitor', 13, 3, 'up').put('chair.office.charcoal', 13, 4, 'up');
  b.put('desk.oak.monitor', 10, 7, 'down').put('chair.office.charcoal', 10, 6, 'down').put('chair.office.charcoal', 11, 6, 'down');
  b.put('desk.oak.monitor', 16, 4, 'left').put('chair.office.charcoal', 17, 4, 'left');
  b.put('surface.mug', 13, 3).put('surface.lamp', 14, 3);
  b.put('plant.tall.fiddle', 18, 2).put('bookshelf.oak', 16, 2).put('printer', 12, 2);
  b.put('wall.clock', 12, 1).put('wall.window', 14, 1).put('wall.art.landscape', 10, 1);

  // lounge
  b.put('rug.teal', 21, 5);
  b.put('sofa.2.sage', 21, 4, 'down').put('table.coffee.oak', 21, 6).put('sofa.2.sage', 21, 7, 'up');
  b.put('armchair.mustard', 24, 5, 'left').put('lamp.floor.brass', 24, 3);
  b.put('plant.tall.fiddle', 20, 2).put('plant.tall.fiddle', 29, 11);
  b.put('elevator', 27, 2);
  b.put('counter.coffee', 20, 11).put('fridge', 21, 11).put('water.cooler', 22, 11);
  b.put('wall.art.wide', 22, 1).put('wall.sconce', 25, 1);

  return b.layout;
}
