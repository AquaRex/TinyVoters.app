# Tiny Agents: Asset Manifest

Every id below **must exist** (the level designer builds against these ids). Artists may add more assets.
New ids should follow the same naming (`group.variant`) and be listed in the final report.

Notation:
- **Footprint**: w×h in tiles for facing `down`. Rotated facings swap w/h (left/right) unless noted.
- **Facings**: the facings the asset supports. For seats, the facing is the direction the sitter faces. For
  fixtures (bookshelf, fridge…), it's the direction the usable front faces.
- **Spots**: as in `Spot` (`src/art/types.ts`). "front" means the tile directly in front of the usable face.
- All swap-group members share footprint, mask and spots per facing.

## Floors: tileset artist (`src/art/floors.ts`)

| id | name | notes |
| --- | --- | --- |
| `carpet.teal` | Teal carpet tiles | offices |
| `carpet.slate` | Slate carpet tiles | meeting rooms |
| `carpet.warmgrey` | Warm-grey carpet tiles | focus rooms, corridors |
| `wood.oak` | Oak planks | lounge, lobby |
| `wood.walnut` | Walnut planks | lounge, reception |
| `tile.terrazzo` | Warm terrazzo | lobby, reception |
| `tile.kitchen` | Kitchen tile | warm, kitchenette |
| `tile.restroom` | Restroom tile | small cool tile |
| `grass` | Grass | outdoor; low-frequency variation, sparse clover and flowers |
| `grass.meadow` | Meadow | outdoor; longer grass, more flowers, for park edges |
| `path.gravel` | Gravel path | outdoor; soft edge against grass |
| `paving.stone` | Stone paving | outdoor; sidewalks, plaza; curb edge where it meets asphalt |
| `paving.brick` | Brick paving | outdoor; entrance plaza |
| `asphalt` | Asphalt | outdoor, drivable |
| `water` | Pond water | outdoor, walkable false; gentle shoreline against grass |

## Wall styles: tileset artist (`src/art/walls.ts`)

| id | kind | notes |
| --- | --- | --- |
| `wall.cream` | interior | default paint, oak baseboard |
| `wall.sage` | interior | accent paint |
| `wall.terracotta` | interior | accent paint |
| `wall.wood` | interior | vertical oak slats (reception and lounge accent) |
| `wall.tile` | interior | white tile, restrooms |
| `wall.glass` | glass | glass partition with a slim steel frame; you see through it |
| `wall.brick` | exterior | warm red-brown brick |
| `wall.render` | exterior | light render / stucco |

## Structure: tileset artist (`src/art/structure.ts`)

| id | group | footprint | facings | spots / notes |
| --- | --- | --- | --- | --- |
| `door.oak` | door | 1×1 | down, left | `door: true`, frames closed→open (≥4), mask `.`. Placed in a wall gap. `down` = door in a horizontal wall, `left` = in a vertical wall |
| `door.glass` | door | 1×1 | down, left | same, glass |
| `elevator` | elevator | 2×1 | down | sits on the floor directly south of a wall; doors anim `door` (≥5 frames); call panel, floor indicator; mask `##`; spot `{dx:0, dy:1, facing:'down', pose:'stand', activity:'elevator', px:16}` |
| `stairs` | stairs | 2×3 | down | stairwell going down with railings; mask all `#` except the landing; spot `{dx:0, dy:3, facing:'down', stand, activity:'stairs', px:16}` |
| `facade.wall.brick` | facade.wall | 1×3 | down | repeatable façade segment: ground-floor wall + 1st-floor window; mask all `#` |
| `facade.window.brick` | facade.wall | 1×3 | down | ground-floor glass + 1st-floor window |
| `facade.entrance.brick` | facade.entrance | 2×3 | down | glass double doors at street level, canopy and sign above; `door: true`; spot `{dx:0, dy:3, facing:'up', stand, activity:'enter', px:16}` |
| `facade.corner.left.brick` / `facade.corner.right.brick` | facade.corner | 1×3 | down | façade ends (pilaster / corner) |
| `facade.wall.render`, `facade.window.render`, `facade.entrance.render`, `facade.corner.left.render`, `facade.corner.right.render` | as above | | | same set in render |
| `wall.window` | window | 2×1 | down | layer `wall`; exterior window seen from inside (sky and greenery, light frame, sill); daylight `Light` |
| `wall.window.small` | window | 1×1 | down | layer `wall` |

## Work: furniture artist, work (`src/art/work.ts`)

| id | group | footprint | facings | spots / notes |
| --- | --- | --- | --- | --- |
| `desk.oak.monitor`, `desk.oak.dual`, `desk.oak.laptop`, `desk.walnut.monitor`, `desk.white.monitor` | desk | 2×1 (left/right: 1×2) | down, up, left, right | facing = way the worker faces; the screen is visible when the facing is `up`. Mask all `#`. No spots (chairs supply them). Light: soft screen glow |
| `chair.office.charcoal`, `chair.office.teal`, `chair.office.mustard` | chair.office | 1×1 | all 4 | mask `s`; spot `{dx:0, dy:0, sit, activity:'seat'}` + facing; backrest layering via `z` |
| `bookshelf.oak`, `bookshelf.walnut` | bookshelf | 2×1 | down, left, right | spot read at front, standing, facing the shelf |
| `cabinet.filing` | cabinet | 1×1 | down | |
| `printer` | printer | 1×1 | down | spot print at front |
| `whiteboard.stand` | whiteboard | 2×1 | down | two spots whiteboard at front |
| `reception.desk` | reception | 3×2 | down | row 0 `.s.` (receptionist area), row 1 `###` counter; spot `{dx:1, dy:0, facing:'down', sit, activity:'reception'}`; monitor, small plant, bell |
| `divider.planter` | divider | 2×1 | down, left | low planter divider between desks |
| `surface.mug`, `surface.plant`, `surface.lamp`, `surface.books`, `surface.phone` | surface.* | 1×1 | down | layer `surface`; `surface.lamp` has a warm light |
| `wall.tv` | wall.screen | 2×1 | down | layer `wall`; screen glow light |
| `wall.whiteboard` | wall.board | 2×1 | down | layer `wall`; spot whiteboard at the tile in front (dy:1) |
| `wall.corkboard` | wall.board | 2×1 | down | layer `wall` |
| `wall.clock` | wall.clock | 1×1 | down | layer `wall` |

## Meeting: furniture artist, work (`src/art/meeting.ts`)

| id | group | footprint | facings | notes |
| --- | --- | --- | --- | --- |
| `table.meeting.oak.4` | table.meeting.small | 2×2 | down | mask all `#` |
| `table.meeting.oak.8` | table.meeting.large | 4×2 | down | |
| `table.meeting.walnut.8` | table.meeting.large | 4×2 | down | |
| `chair.meeting.grey`, `chair.meeting.teal` | chair.meeting | 1×1 | all 4 | seat |
| `surface.conference` | surface.conference | 1×1 | down | conference speaker / laptop |

## Lounge: furniture artist, living (`src/art/lounge.ts`)

| id | group | footprint | facings | notes |
| --- | --- | --- | --- | --- |
| `sofa.2.sage`, `sofa.2.cream`, `sofa.2.terracotta`, `sofa.2.navy` | sofa.2 | 2×1 (left/right 1×2) | all 4 | 2 seats, mask `ss` |
| `sofa.3.sage`, `sofa.3.cream`, `sofa.3.leather` | sofa.3 | 3×1 | all 4 | 3 seats |
| `armchair.leather`, `armchair.mustard`, `armchair.sage` | armchair | 1×1 | all 4 | seat |
| `beanbag.mustard`, `beanbag.teal` | beanbag | 1×1 | down, up | seat |
| `table.coffee.oak`, `table.coffee.walnut` | table.coffee | 2×1 | down, left | mask `##` |
| `table.side` | table.side | 1×1 | down | |
| `table.round.cafe` | table.round | 1×1 | down | café table (chairs/stools around it → social) |
| `chair.cafe.oak` | chair.cafe | 1×1 | all 4 | seat |
| `game.foosball` | game | 2×1 | down | spots play at `{dx:-1,dy:0,facing:'right'}` and `{dx:2,dy:0,facing:'left'}`, standing |
| `bookshelf.lounge` | bookshelf | 2×1 | down | full of books and plants; spot read |

## Kitchen: furniture artist, living (`src/art/kitchen.ts`)

Counter modules tile seamlessly side by side (identical worktop edge).

| id | group | footprint | facings | notes |
| --- | --- | --- | --- | --- |
| `counter.plain` | counter | 1×1 | down | worktop + cupboard; upper cabinets drawn above |
| `counter.sink` | counter | 1×1 | down | |
| `counter.coffee` | counter | 1×1 | down | espresso machine; spot coffee at front |
| `counter.microwave` | counter | 1×1 | down | spot snack at front |
| `counter.end.left`, `counter.end.right` | counter.end | 1×1 | down | end caps |
| `fridge` | fridge | 1×1 | down | tall; spot snack at front |
| `water.cooler` | water | 1×1 | down | spot water at front |
| `vending` | vending | 1×1 | down | spot snack at front; screen light |
| `table.dining.oak` | table.dining | 2×1 | down | |
| `table.bar.oak` | table.bar | 2×1 | down | high table |
| `chair.dining.oak` | chair.dining | 1×1 | all 4 | seat |
| `stool.bar` | stool | 1×1 | all 4 | seat |

## Restroom: furniture artist, living (`src/art/restroom.ts`)

| id | group | footprint | facings | notes |
| --- | --- | --- | --- | --- |
| `toilet.stall` | toilet | 1×1 | down | toilet with thin stall partitions on both sides and a half-open stall door; spot `{dx:0,dy:0,facing:'down',sit,activity:'toilet'}`; mask `s` |
| `sink.vanity` | sink | 1×1 | down | basin with a mirror that extends up onto the wall face; spot wash at front |
| `wall.dryer` | wall.dryer | 1×1 | down | layer `wall` |

## Decor and lighting: furniture artist, living (`src/art/decor.ts`)

| id | group | footprint | facings | notes |
| --- | --- | --- | --- | --- |
| `plant.small.a`, `plant.small.b` | plant.small | 1×1 | down | about 22 px |
| `plant.tall.fiddle`, `plant.tall.monstera`, `plant.tall.palm` | plant.tall | 1×1 | down | about 50 px |
| `planter.long` | planter | 2×1 | down | |
| `rug.teal`, `rug.terracotta`, `rug.cream`, `rug.navy` | rug.medium | 3×2 | down | layer `floor` |
| `rug.large.sage`, `rug.large.navy` | rug.large | 4×3 | down | layer `floor` |
| `mat.entrance` | mat | 2×1 | down | layer `floor` |
| `lamp.floor.brass`, `lamp.floor.black` | lamp.floor | 1×1 | down | warm light, radius about 72 |
| `wall.sconce` | wall.light | 1×1 | down | layer `wall`, warm light |
| `wall.art.landscape`, `wall.art.abstract`, `wall.art.botanical` | wall.art.small | 1×1 | down | layer `wall` |
| `wall.art.wide` | wall.art.wide | 2×1 | down | layer `wall` |
| `wall.shelf.plants` | wall.shelf | 2×1 | down | layer `wall` |
| `coatrack` | coatrack | 1×1 | down | |
| `bin.office` | bin | 1×1 | down | |

## Outdoor: exterior artist (`src/art/outdoor.ts`)

| id | group | footprint | facings | notes |
| --- | --- | --- | --- | --- |
| `tree.oak.a`, `tree.oak.b`, `tree.birch`, `tree.maple` | tree | 1×1 (trunk) | down | big canopies (3–4 tiles wide, 110–140 px tall) layered over the trunk; canopy shadow; mask `#` |
| `bush.round.a`, `bush.round.b`, `bush.flowering` | bush | 1×1 | down | |
| `hedge` | hedge | 1×1 | down, left | trimmed hedge segment that tiles seamlessly in a row/column |
| `flowerbed.red`, `flowerbed.yellow`, `flowerbed.mixed` | flowerbed | 2×1 | down | low stone or timber edging |
| `bench.park` | bench | 2×1 | down, up | 2 seats (social) |
| `table.picnic` | table.picnic | 2×1 | down | benches built in; seats eat on both long sides: spots at dy:-1 facing down and dy:1 facing up, or seats inside the footprint, your choice, but declare them |
| `lamp.street` | lamp.street | 1×1 | down | light `nightOnly` |
| `bin.street` | bin.street | 1×1 | down | |
| `bikerack` | bikerack | 2×1 | down | with 2 bikes |
| `sign.monument` | sign | 3×1 | down | low monument sign "TINY AGENTS" on a stone base with planting |
| `sign.post` | sign.post | 1×1 | down | directional signpost (parking / entrance) |
| `bollard` | bollard | 1×1 | down | |
| `fence.wood` | fence | 1×1 | down, left | tiles seamlessly |
| `marking.bay` | marking | 1×2 | down | layer `floor`; painted bay lines on asphalt; spot `{dx:0, dy:1, facing:'down', stand, activity:'parking'}` |
| `marking.crosswalk` | marking | 1×1 | down, left | layer `floor` |
| `marking.lane` | marking | 1×1 | down, left | layer `floor`; dashed centre line |

## Vehicles: exterior artist (`src/art/vehicles.ts`)

| id | group | footprint | facings | notes |
| --- | --- | --- | --- | --- |
| `car.sedan.red`, `car.sedan.blue`, `car.hatch.white`, `car.suv.green`, `car.hatch.yellow` | car | 1×2 (left/right 2×1) | all 4 | top-down 3/4 car about 28×58 px; facing = direction the nose points; windows, lights, contact shadow; one frame. The engine uses these for moving cars and for parked props |

## Characters: character artist (`src/render/characters.ts`, `src/agents/appearance.ts`)

`characterFrame(look: Appearance, dir: Dir, pose: Pose, frame: number, opts?: { smiling?: boolean }): HTMLCanvasElement`
returns a 32 × 48 frame. Export `POSES`, `POSE_FRAMES`, `CHAR_W`, `CHAR_H`, `CHAR_FOOT_X`, `CHAR_FOOT_Y`.

Poses: `stand`, `walk` (6), `sit`, `type`, `sitTalk`, `talk`, `drink`, `sitDrink`, `carry` (walking with a mug, 6), `wave`,
`phone`, `read`. `appearance.ts` keeps `Appearance`, `randomAppearance(seed, bias)` and the option lists
(hair styles, tops, accessories, colour swatches) for the customizer.
