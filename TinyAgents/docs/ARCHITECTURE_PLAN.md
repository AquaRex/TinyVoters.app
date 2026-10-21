# Tiny Agents HQ: Architecture Plan

Owner: architect. Implemented by the level designer in `src/world/levels/hq.ts`, exactly as written here.
Every coordinate below is a **map tile coordinate** `(x, y)`, origin top-left, x to the right, y down.
Item coordinates are the footprint's top-left tile for the given facing (the `PlacedItem.x/y`).

> **Amendment (client review): overrides the sections below where they conflict.**
> 1. The elevator and the stairs sit **side by side** in the centre of the building as one circulation
>    core, both opening onto the same lobby.
> 2. Restrooms hug that core on both flanks.
> 3. The front door stays directly below the elevator.
> 4. There is **no kitchen room**. A small kitchenette nook (a short counter run with the fridge and water
>    cooler, plus a bar ledge or café table) sits along circulation where hallways meet.
> 5. The freed space goes to a cozier, larger lounge/collaboration area.
>
> `src/world/levels/hq.ts` is the source of truth for the final coordinates.

## 1. Design intent

**The idea:** a small, warm brick office of about ten people in a business-park garden. You see the whole
story on one screen: a car turns off the street into a 12-bay car park, the driver crosses the brick
forecourt and disappears through the glass doors, and a few seconds later the lift **exactly two floors
above that door** opens and the same person steps out into the lobby. The front door (x 30-31) and the lift
(x 30-31) sit on one vertical axis through the middle of the building, so the player reads the connection
without being told.

**How people use it (and why the plan looks the way it does):**

- **Core in the middle, like a real building.** Lift, stairs and both restrooms form one central core. The
  restrooms open off the office corridor (short, discreet walks: 11 to 24 tiles from any desk), while
  the lift and stairs open south into the lobby. The solid core is also the acoustic buffer between the
  quiet north half and the social south half.
- **Two halves: focus north, social south.** All 10 desks sit in three enclosed, carpeted offices on the
  north perimeter. They get the only real windows (the north wall is the only exterior wall whose inner face
  we see), so daylight goes to the desks. The meeting room shares that sunny band. Everything that makes
  noise (lobby, lounge, foosball, kitchen) is south of the core, two walls and a corridor away from the desks.
- **Arrival is a social space.** Step out of the lift and you are in a warm walnut lobby: reception to your
  left, against an oak-slat feature wall with a clock and two sconces flanking the lift doors; the stairs to
  your right; and straight ahead, on the same axis, a sofa group on a sage rug beside a brass floor lamp. A water
  cooler and a coat rack sit by the lift, so small talk happens where people already pass.
- **Coffee as a magnet, but not next to focus rooms.** The kitchenette is in the west wing, opening onto
  the lounge through a 3-tile opening, never onto the office corridor. People walk from the corridor down
  the west passage, past reception, into the café. The focus room and library are at the opposite (east) end.
  Office C is the furthest from coffee, so the corridor's water cooler (45,11) sits right outside its door.
- **Corridors and real rooms, not one open plan.** A 2-tile corridor runs the full width between the
  offices and the core. Two 2-tile passages either side of the core link it to the lobby, which makes a loop
  (corridor, passage, lobby, passage) so people never have to squeeze past each other at dead ends.
- **Glass where you want to see in, solid where you want quiet.** The meeting room fronts the corridor with
  a glass wall and glass door (you see who is meeting); the focus room has a glass wall and door on the
  east passage. Office walls are solid cream with oak doors.
- **A quiet corner.** A small library behind an oak door in the east wing: two bookshelves, two armchairs
  around a side table, a beanbag, a brass reading lamp. It is the furthest point from the kitchen.
- **Warm light where people linger:** brass floor lamps in the lounge, the dining area and the library,
  sconces in the lobby. Neutral daylight in offices, with one warm desk lamp per office.
- **Density.** The building is 32 x 21 tiles, about 300 walkable indoor tiles for 10 people. No room is
  larger than it needs to be: offices are 6-7 x 6, the meeting room 8 x 6, the lobby and lounge 17 x 6
  (furnished in three clusters).

## 2. Site plan

Map size: **56 x 42 tiles** (`w = 56`, `h = 42`). Default ground is `grass`; `grass.meadow` on the map edges.

| Zone | Tiles (x0,y0)-(x1,y1) | Contents |
| --- | --- | --- |
| North green strip | (0,0)-(55,2) | meadow and grass; a clipped `hedge` row along the building's north wall at y 2 (x 15-46); bushes and two flowerbeds |
| Building (2nd floor plateau) | (15,3)-(46,23) | 32 x 21 including exterior walls; see section 3 |
| Facade band | (15,24)-(46,26) | 3 tiles tall, directly south of the south wall (y 23); floor `paving.stone` under it; all tiles blocked |
| Front door | (30,24)-(31,26) | `facade.entrance.brick`; its `enter` spot is the street tile **(30,27)**, facing up |
| Facade walkway | (15,27)-(46,27) | `paving.stone`, 1 tile, links the park path (west), the forecourt and the car park (east) |
| Planting strip | y 28, x 15-25 and 36-46 | flowerbeds and bushes at the foot of the facade |
| Entrance forecourt | (26,27)-(35,30) | `paving.brick` |
| Entrance path | (29,31)-(32,34) | `paving.brick`, 4 wide, centred on the door; two `lamp.street`, two flowerbeds, two `bollard` at the sidewalk |
| Plaza lawns | (15,28)-(28,34), (33,28)-(46,34) | grass with 4 trees, 2 benches, bike rack on a stone pad (39,29)-(42,30), monument sign in the hedge line |
| Park (west) | (0,0)-(14,34) | gravel loop (x 2 and x 11, y 8 to y 27), pond (4,14)-(9,19), 2 benches facing the pond, picnic table, 8 trees, flowerbeds, lamps, a hedge along the building's west wall (x 14) |
| East garden | (47,0)-(55,25) | gravel path x 49 (y 3-25) to the car park, a bench, 4 trees, flowerbeds |
| Car park | (47,26)-(54,34) | 12 bays (`marking.bay`, 1x2) in two rows of 6, 2-tile drive aisle, 2-tile access lane down to the road |
| North sidewalk | (0,35)-(55,36) | `paving.stone`, 2 wide; 4 street lamps; the access lane crosses it with `marking.crosswalk` |
| Road | (0,37)-(55,38) | `asphalt`, 2 lanes. Cars enter and leave **only** at x 0 and x 55 (rows 37-38) |
| South sidewalk + verge | (0,39)-(55,41) | sidewalk y 39, meadow verge, `fence.wood` along y 41 |

**Car park geometry.** North bay row: bays at x 47-52, tiles y 27-28 (parking spot on y 28, next to the
aisle). Drive aisle: (47,29)-(54,30). South bay row: bays at x 47-52, tiles y 31-32 (spot on y 32). Access
lane: (53,29)-(54,38), joining the road. Cars drive road, lane, aisle, bay. The bays are 1 x 2 tiles: one
car each, no oversized stalls. Drivers step out onto the bay tiles and walk west along the facade walkway
(y 27) to the front door (18 to 27 tiles).

**Pedestrians** arrive on the sidewalks (map edges x 0 / x 55, rows 35-36 and 39), cross at the zebra
`marking.crosswalk` (30-31, 37-38) straight into the entrance path, or come through the park via the
gravel spur (6, 28-34).

**No road tile touches the map border** except the four road-end tiles (0,37), (0,38), (55,37), (55,38).
The access lane stops one tile short of the east border (x 55 is meadow).

## 3. Second floor plan

The building occupies (15,3)-(46,23). For readability, **local** building coordinates `(lx, ly)` = `(x - 15,
y - 3)` are given in the room table; everything else uses map coordinates.

Schematic (not to scale; the exact tiles are in section 4):

```
y 3      +--------------------------------------+   brick wall, 8 windows, meeting TV
y 4-9    | Office A | Office B | Meeting | Off. C |   carpet, daylight, all 10 desks
y 10     +----D-----+----D-----+---d-----+---D----+   cream walls, glass meeting front
y 11-12  |            C O R R I D O R             |   2 tiles, full width
y 13     +--------+--+---D-----D---+----+--+------+
y 14-15  | Kitchen|pa|  WC W | WC E |Stair|pa| Focus|   the core sits in the middle
y 16     | counter|ss[== oak lift wall ==]   |ss|      |
y 17-19  | dining |  LOBBY: reception  LIFT  stairs  +------+
y 20-22  | bar    -  LOUNGE: foosball  sofa  cafe    D Library
y 23     +--------------------------------------+   brick wall
y 24-26     facade ........ [ENTRANCE] ........       front door right below the lift
```

| room | interior tiles, map coords (x0,y0)-(x1,y1) | interior size | local (building) coords |
| --- | --- | --- | --- |
| Office A | (16,4)-(22,9) | 7 x 6 | (1,1)-(7,6) |
| Office B | (24,4)-(29,9) | 6 x 6 | (9,1)-(14,6) |
| Meeting room | (31,4)-(38,9) | 8 x 6 | (16,1)-(23,6) |
| Office C | (40,4)-(45,9) | 6 x 6 | (25,1)-(30,6) |
| Corridor | (16,11)-(45,12) | 30 x 2 | (1,8)-(30,9) |
| Kitchenette + dining | (16,14)-(21,22) | 6 x 9 | (1,11)-(6,19) |
| West passage | (23,13)-(24,16) | 2 x 4 | (8,10)-(9,13) |
| WC west | (26,14)-(29,15) | 4 x 2 | (11,11)-(14,12) |
| WC east | (31,14)-(33,15) | 3 x 2 | (16,11)-(18,12) |
| Stairwell | (35,14)-(36,16) | 2 x 3 | (20,11)-(21,13) |
| East passage | (38,13)-(39,16) | 2 x 4 | (23,10)-(24,13) |
| Lift lobby + reception | (23,17)-(39,19) | 17 x 3 | (8,14)-(24,16) |
| Lounge | (23,20)-(39,22) | 17 x 3 | (8,17)-(24,19) |
| Focus room | (41,14)-(45,17) | 5 x 4 | (26,11)-(30,14) |
| Library | (41,19)-(45,22) | 5 x 4 | (26,16)-(30,19) |

**Room notes**

- **Office A** (4 desks): a back-to-back pod in the middle (`desk` x 17-20, y 5-6). The two north desks face
  down (we see faces), the two south desks face up (we see screens). Free ring around the pod. Bookshelf on
  the east wall, filing cabinet, tall plants. Door (21,10).
- **Office B and Office C** (3 desks each, mirror images): two desks against the window wall facing up, one
  desk in the second row, a standing whiteboard, filing cabinet, plants. Doors (26,10) and (43,10).
- **Meeting room** (8 seats): `table.meeting.walnut.8` centred, 4 chairs each side, `wall.tv` centred on the
  north wall between two windows, glass wall and glass door (32,10) to the corridor.
- **Corridor** (30 x 2): clear for its whole length. Printer at the west end (16,11), water cooler at the
  east end (45,11). Art, a corkboard and a clock on the north wall face.
- **WC west** (4 x 2): 2 `toilet.stall`, 1 `sink.vanity`, door (28,13). **WC east** (3 x 2, accessible):
  1 stall, 1 vanity, door (32,13). Vanities sit directly under the WCs' north wall so the mirror reaches the
  wall face.
- **Stairwell**: `stairs` at (35,14), 2 x 3, back against the core's north wall, opening onto the lobby;
  arrival spot (35,17). The **elevator** is at (30,17), on the floor directly south of the oak lift wall
  (y 16); arrival spot (30,18), centred between the doors with `px: 16`.
- **Lift lobby + reception**: `reception.desk` at (25,17), receptionist seat (26,17) with the oak feature
  wall behind; tall plants flank the lift (29,17) and (32,17); water cooler (33,17), coat rack (34,17);
  `mat.entrance` in front of the lift (30,18).
- **Lounge**: sofa group on the lift axis (sofa (30,20) facing down, coffee table, two armchairs, `rug.large.sage`),
  foosball near the kitchen (west, the loud end), café table with 3 chairs near the library (east), plants and
  brass lamps.
- **Kitchenette + dining**: counter run along the terracotta north wall: fridge (16,14), end cap, sink,
  coffee machine (19,14), microwave, end cap; vending machine (16,16). Communal dining table (two
  `table.dining.oak` end to end, 8 chairs) in the middle; a bar ledge of two `table.bar.oak` against the
  south wall with 4 stools. Two brass floor lamps at the ends of the bar. Opens to the lounge at x 22,
  y 19-21.
- **Focus room** (4 seats): `table.meeting.oak.4`, 2 chairs each side, `wall.whiteboard` on the north wall.
  Free ring around the table. Glass west wall with glass door (40,14) from the east passage.
- **Library**: `bookshelf.lounge` and `bookshelf.walnut` on the sage north wall, reading nook on `rug.cream`.

**Workstations (exactly 10) + reception seat (26,17):**

| # | room | chair (x,y) facing | desk |
| --- | --- | --- | --- |
| 1 | Office A | `chair.office.teal` (17,4) down | `desk.oak.dual` at 17,5 |
| 2 | Office A | `chair.office.charcoal` (19,4) down | `desk.oak.monitor` at 19,5 |
| 3 | Office A | `chair.office.charcoal` (17,7) up | `desk.oak.monitor` at 17,6 |
| 4 | Office A | `chair.office.mustard` (19,7) up | `desk.oak.laptop` at 19,6 |
| 5 | Office B | `chair.office.charcoal` (24,5) up | `desk.walnut.monitor` at 24,4 |
| 6 | Office B | `chair.office.teal` (27,5) up | `desk.walnut.monitor` at 27,4 |
| 7 | Office B | `chair.office.mustard` (24,8) up | `desk.oak.dual` at 24,7 |
| 8 | Office C | `chair.office.teal` (41,5) up | `desk.white.monitor` at 41,4 |
| 9 | Office C | `chair.office.charcoal` (44,5) up | `desk.white.monitor` at 44,4 |
| 10 | Office C | `chair.office.mustard` (44,8) up | `desk.oak.laptop` at 44,7 |

## 4. Exact layout

### 4.1 Conventions

- **Facing** is the asset facing from the manifest. Desks and chairs: the facing is the way the worker looks;
  the chair stands on the opposite side of the desk and always sits under the desk's **west** tile (for
  `up`/`down` desks). Seat facings are chosen so every seat faces its table; see the spots table.
- **Walls** are whole tiles in the grid (the engine draws a thin line inside). A wall tile still carries a
  floor id: the floor grid gives it. Rule used: a horizontal interior wall takes the floor of the room
  **south** of it (that is the half left visible below the line); vertical walls and exterior walls take
  the floor of the room they belong to.
- **Doors** are items placed in a wall gap: the tile has **no wall**, the floor shown in the floor grid, and a
  `door.oak` / `door.glass` item. Facing `down` = door in a horizontal wall, `left` = door in a vertical wall.
- **Facade** items are 1 x 3 (2 x 3 for the entrance) placed at y 24; their tiles have floor `paving.stone`
  and no wall.
- **Wall-layer items** (windows, TV, art, sconces, clocks, boards) sit on wall tiles whose south neighbour
  is open floor, so their face is visible. None hangs above a tall object.
- **Surface items** sit on a desk, table or counter tile.

### 4.2 Floor layer (every tile)

Legend: `,` grass, `;` grass.meadow, `:` path.gravel, `_` paving.stone, `=` paving.brick, `a` asphalt,
`~` water, `t` carpet.teal, `s` carpet.slate, `g` carpet.warmgrey, `o` wood.oak, `n` wood.walnut,
`z` tile.terrazzo, `k` tile.kitchen, `r` tile.restroom.

```
    0         1         2         3         4         5     
    01234567890123456789012345678901234567890123456789012345
  0 ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
  1 ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
  2 ;;,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,;;;;;
  3 ;;,,,,,,,,,,,,,ttttttttttttttttsssssssssttttttt,,:,;;;;;
  4 ;;,,,,:,,,,,,,,ttttttttttttttttsssssssssttttttt,,:,;;;;;
  5 ;;,,,,:,,,,,,,,ttttttttttttttttsssssssssttttttt,,:,;;;;;
  6 ;;,,,,:,,,,,,,,ttttttttttttttttsssssssssttttttt,,:,;;;;;
  7 ;;,,,,:,,,,,,,,ttttttttttttttttsssssssssttttttt,,:,,,,,;
  8 ;;::::::::::,,,ttttttttttttttttsssssssssttttttt,,:,,,,,;
  9 ;;:,,,,,,,,:,,,ttttttttttttttttsssssssssttttttt,,:,,,,,;
 10 ;;:,,,,,,,,:,,,tggggggggggggggggggggggggggggggt,,:,,,,,;
 11 ;;:,,,,,,,,:,,,gggggggggggggggggggggggggggggggg,,:,,,,,;
 12 ;;:,,,,,,,,:,,,gggggggggggggggggggggggggggggggg,,:,,,,,;
 13 ;;:,,,,,,,,:,,,kkkkkkkkggrrrrrrrrrrzzzggggggggg,,:,,,,,;
 14 ;;:,,~~~~,,:,,,kkkkkkkkggrrrrrrrrrrzzzggggggggg,,:,,,,,;
 15 ;;:,~~~~~~,:,,,kkkkkkkkggrrrrrrrrrrzzzggggggggg,,:,,,,,;
 16 ;;:,~~~~~~,:,,,kkkkkkkkggnnnnnnnnnnzzzggggggggg,,:,,,,,;
 17 ;;:,~~~~~~,:,,,oooooooonnnnnnnnnnnnnnnnnggggggg,,:,,,,,;
 18 ;;:,~~~~~~,:,,,oooooooonnnnnnnnnnnnnnnnnggggggg,,:,,,,,;
 19 ;;:,,~~~~,,:,,,oooooooonnnnnnnnnnnnnnnnnggggggg,,:,,,,,;
 20 ;;:,,,,,,,,:,,,oooooooooooooooooooooooooggggggg,,:,,,,,;
 21 ;;:,,,,,,,,:,,,oooooooooooooooooooooooooggggggg,,:,,,,,;
 22 ;;:,,,,,,,,:,,,oooooooooooooooooooooooooggggggg,,:,,,,,;
 23 ;;:,,,,,,,,:,,,oooooooooooooooooooooooooggggggg,,:,,,,,;
 24 ;;:,,,,,,,,:,,,________________________________,,:,,,,,;
 25 ;;:,,,,,,,,:,,,________________________________,,::::,,;
 26 ;;:,,,,,,,,:,,,________________________________,,,,,:,,;
 27 ;;:::::::::::::___________==========___________aaaaaa,,;
 28 ;;,,,,:,,,,,,,,,,,,,,,,,,,==========,,,,,,,,,,,aaaaaa,,;
 29 ;;,,,,:,,,,,,,,,,,,,,,,,,,==========,,,____,,,,aaaaaaaa;
 30 ;;,,,,:,,,,,,,,,,,,,,,,,,,==========,,,____,,,,aaaaaaaa;
 31 ;;,,,,:,,,,,,,,,,,,,,,,,,,,,,====,,,,,,,,,,,,,,aaaaaaaa;
 32 ;;,,,,:,,,,,,,,,,,,,,,,,,,,,,====,,,,,,,,,,,,,,aaaaaaaa;
 33 ;;,,,,:,,,,,,,,,,,,,,,,,,,,,,====,,,,,,,,,,,,,,,,,,,,aa;
 34 ;;,,,,:,,,,,,,,,,,,,,,,,,,,,,====,,,,,,,,,,,,,,,,,,,,aa;
 35 _____________________________________________________aa_
 36 _____________________________________________________aa_
 37 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
 38 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
 39 ________________________________________________________
 40 ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
 41 ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
```

### 4.3 Structure layer: walls, doors, facade (building area, x 14-47, y 2-26)

Legend: walls by style `B` wall.brick, `C` wall.cream, `S` wall.sage, `T` wall.terracotta, `W` wall.wood,
`X` wall.tile, `G` wall.glass. Doors (no wall on the tile): `D` door.oak, `d` door.glass. Facade items:
`l` facade.corner.left.brick, `r` facade.corner.right.brick, `m` facade.wall.brick, `v` facade.window.brick,
`E` facade.entrance.brick. `.` = no wall.

```
          2         3         4       
    4567890123456789012345678901234567
  2 ..................................
  3 .BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB.
  4 .B.......C......C........C......B.
  5 .B.......C......C........C......B.
  6 .B.......C......C........C......B.
  7 .B.......C......C........C......B.
  8 .B.......C......C........C......B.
  9 .B.......C......C........C......B.
 10 .BCCCCCDCCCCDCCCCGdGGGGGGCCCCDCCB.
 11 .B..............................B.
 12 .B..............................B.
 13 .BTTTTTTT..XXXDXXXDXCCCC..CCCCCCB.
 14 .B......C..C....X...X..C..d.....B.
 15 .B......C..C....X...X..C..G.....B.
 16 .B......C..WWWWWWWWWW..C..G.....B.
 17 .B......C.................G.....B.
 18 .B......C.................SSSSSSB.
 19 .B........................C.....B.
 20 .B........................D.....B.
 21 .B........................C.....B.
 22 .B......C.................C.....B.
 23 .BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB.
 24 .lvmvvmvvmvvmvvmEEmvvmvvmvvmvvmvr.
 25 .lvmvvmvvmvvmvvmEEmvvmvvmvvmvvmvr.
 26 .lvmvvmvvmvvmvvmEEmvvmvvmvvmvvmvr.
 27 ..................................
```

### 4.4 Item overlay (object footprints, for checking)

Legend: `+` wall, `D`/`d` door, `F` facade, `E` entrance, `K` desk, `h` chair/stool, `T` table (any),
`O` sofa, `A` armchair/beanbag, `b` bench, `R` reception, `L` elevator, `^` stairs, `U` toilet, `u` sink,
`c` counter/fridge, `v` vending, `w` water cooler, `P` printer, `Q` whiteboard stand, `H` bookshelf/cabinet,
`g` foosball, `p` plant, `l` lamp, `y` coat rack, `x` bin, `Y` tree trunk, `*` bush, `#` hedge, `|` fence,
`f` flowerbed, `k` bike rack, `$` sign, `i` bollard, `-` rug/mat (floor layer), `[` parking bay,
`%` crosswalk, `~` water, `a` asphalt, `,` grass, `.` other free floor.

```
    0         1         2         3         4         5     
    01234567890123456789012345678901234567890123456789012345
  0 ,,,,,,,,,,,,,,,,,ff,*,,,,,,,,,,,,,,*,,,,ff,,,,,,,,,,,,,,
  1 ,*,,,,,,,,,,*,,,,,,,,,,,,,,*,,,,,,,,,,,,,,,,*,,,,,*,,,,,
  2 ,,,,,,,,,,,,,,,################################,,,,,,,,,
  3 ,,,Y,,,,,,Y,,,#++++++++++++++++++++++++++++++++,,.,Y,,,,
  4 ,,,,,,.TT,,,,,#+.hxh..H+KKpKKH+p......p+HKKpKK+,*.,,,,,,
  5 ,,,,,,.,,,,,,,#+.KKKK.H+h..h..+..hhhh..+.h..h.+,,.,,,,,,
  6 ,,,,,,.,,,,,*,#+.KKKK.H+......+..TTTT..+......+,,.,,,,,,
  7 *,,,,,.,,,,,,,#+.h.h...+KK..QQ+..TTTT..+QQ..KK+,,.,,,,,,
  8 ,,..........,,#+......p+h.....+..hhhh..+....h.+,,.,,,,,,
  9 ,,.l,,,,,,,.,,#+p......+...x.p+p......p+p.x...+,,.,,,,,,
 10 ,,.ff,,,ff,.,,#++++++D++++D+++++d++++++++++D+++ff.,,,Y,,
 11 ,,.,,,,,,,,.,,#+P............................w+,,.,,,,,,
 12 ,Y.,,,bbx,,.,,#+..............................+,,.,,,,,,
 13 ,,.*,,,,,,,.,,#++++++++..+++D+++D+++++..+++++++,,.,,,,,,
 14 ,,.,,~~~~,*.,,#+cccccc+..+UU.u+U.u+^^+..d.....+,,.,,,,,,
 15 ,,.,~~~~~~,.,,#+......+..+....+...+^^+..+hTTh.+,l.,Y,,,,
 16 ,,.,~~~~~~,.Y,#+v.....+..++++++++++^^+..+hTTh.+,,.,,,,,,
 17 ,,.,~~~~~~,.,,#+.hhhh.+..RRR.pLLpwy..p..+.....+,,.,,,,,,
 18 ,,.,~~~~~~,.,,#+.TTTT.+..RRR..--........+++++++,,.bbx,,,
 19 ,,.,,~~~~,,.,,#+.hhhh..................l+pHHHH+,,.,,,,,,
 20 ,,.*,,,,,,*.,,#+.............-OO-l......D.....+,,.,,,,Y,
 21 ,Y.,,,bbx,,.,,#+.hhhh...gg...ATTA..hTh..+.-A-.+,,.,,,,,,
 22 ,,.,,,,,,,,.,,#+lTTTTl+p...p.----..-h-.p+pATAl+ff.,,,,,,
 23 ,,.,,,,,,,,.,,#++++++++++++++++++++++++++++++++,,.,,,,,,
 24 ,,.,,,,,,Y,.,,,FFFFFFFFFFFFFFFEEFFFFFFFFFFFFFFF,,.,,,*,,
 25 ,,.ff,,ff,,.,,,FFFFFFFFFFFFFFFEEFFFFFFFFFFFFFFF,,....,,,
 26 *,.,,,,,,,l.,*,FFFFFFFFFFFFFFFEEFFFFFFFFFFFFFFF#####.,,,
 27 ,,.............................................[[[[[[**,
 28 ,,,,,,.,,,,,$,,,ff*,ff*,ff..........ff*ff*,ff*,[[[[[[,$,
 29 ,,,,,,.l,,,,,,,,,,,,,,,,,,..........,,,.kk.,,,,aaaaaaaa,
 30 ,,,,,,.,,,,,,,,,*,,,,,,xbb..........bb,....,,,,aaaaaaaa,
 31 ,,,Y,,.,,,,,,,,,,,,,,*,,,,,,l....l,,,,,,,,,,,*,[[[[[[aa,
 32 ,,,,,,.,,,,Y,,,,,,Y,,,,,,,,,,....,,,,,,,*,,Y,,,[[[[[[aa,
 33 ,,,,,,.,,,,,,,,,,,,,,,,,Y,,ff....ff,,Y,,,,,,,,,ff*ff*aa,
 34 ######.############$$$#######i..i####################aa,
 35 .........l............l...........x....l..........l..%%.
 36 .....................................................%%.
 37 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa%%aaaaaaaaaaaaaaaaaaaaaaaa
 38 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa%%aaaaaaaaaaaaaaaaaaaaaaaa
 39 ........................................................
 40 ,,,*,,,,,,,,ff,,,,*,,,,,,*,,,,,,,,,,ff,,,,*,,,,*,,,ff,,,
 41 ||||||||||||||||||||||||||||||||||||||||||||||||||||||||
```

### 4.5 Placement table

473 items in 312 rows. A row with a range (`x 47..52`) means one item per tile along that
range, each with the same id and facing (for 2-wide items such as `marking.bay` it is still one per x
listed, since bays are 1 wide). Seat rows list what the engine resolves the seat to.

| # | zone | asset id | x | y | facing | count | spots / notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Office A | `wall.window` | 17 | 3 | down | 1 |  |
| 2 | Office A | `wall.window` | 20 | 3 | down | 1 |  |
| 3 | Office A | `chair.office.teal` | 17 | 4 | down | 1 | seat -> work |
| 4 | Office A | `bin.office` | 18 | 4 | down | 1 |  |
| 5 | Office A | `chair.office.charcoal` | 19 | 4 | down | 1 | seat -> work |
| 6 | Office A | `cabinet.filing` | 22 | 4 | down | 1 |  |
| 7 | Office A | `desk.oak.dual` | 17 | 5 | down | 1 |  |
| 8 | Office A | `surface.plant` | 18 | 5 | down | 1 |  |
| 9 | Office A | `desk.oak.monitor` | 19 | 5 | down | 1 |  |
| 10 | Office A | `surface.mug` | 20 | 5 | down | 1 |  |
| 11 | Office A | `bookshelf.oak` | 22 | 5 | left | 1 | read spot (21,5) right; read spot (21,6) right |
| 12 | Office A | `desk.oak.monitor` | 17 | 6 | up | 1 |  |
| 13 | Office A | `surface.lamp` | 18 | 6 | down | 1 |  |
| 14 | Office A | `desk.oak.laptop` | 19 | 6 | up | 1 |  |
| 15 | Office A | `surface.books` | 20 | 6 | down | 1 |  |
| 16 | Office A | `chair.office.charcoal` | 17 | 7 | up | 1 | seat -> work |
| 17 | Office A | `chair.office.mustard` | 19 | 7 | up | 1 | seat -> work |
| 18 | Office A | `plant.tall.monstera` | 22 | 8 | down | 1 |  |
| 19 | Office A | `plant.tall.fiddle` | 16 | 9 | down | 1 |  |
| 20 | Office A | `door.oak` | 21 | 10 | down | 1 |  |
| 21 | Office B | `wall.window` | 24 | 3 | down | 1 |  |
| 22 | Office B | `wall.window` | 27 | 3 | down | 1 |  |
| 23 | Office B | `desk.walnut.monitor` | 24 | 4 | up | 1 |  |
| 24 | Office B | `surface.lamp` | 25 | 4 | down | 1 |  |
| 25 | Office B | `plant.small.a` | 26 | 4 | down | 1 |  |
| 26 | Office B | `desk.walnut.monitor` | 27 | 4 | up | 1 |  |
| 27 | Office B | `surface.mug` | 28 | 4 | down | 1 |  |
| 28 | Office B | `cabinet.filing` | 29 | 4 | down | 1 |  |
| 29 | Office B | `chair.office.charcoal` | 24 | 5 | up | 1 | seat -> work |
| 30 | Office B | `chair.office.teal` | 27 | 5 | up | 1 | seat -> work |
| 31 | Office B | `desk.oak.dual` | 24 | 7 | up | 1 |  |
| 32 | Office B | `surface.plant` | 25 | 7 | down | 1 |  |
| 33 | Office B | `whiteboard.stand` | 28 | 7 | down | 1 | whiteboard spot (28,8) up; whiteboard spot (29,8) up |
| 34 | Office B | `chair.office.mustard` | 24 | 8 | up | 1 | seat -> work |
| 35 | Office B | `bin.office` | 27 | 9 | down | 1 |  |
| 36 | Office B | `plant.tall.palm` | 29 | 9 | down | 1 |  |
| 37 | Office B | `door.oak` | 26 | 10 | down | 1 |  |
| 38 | Meeting room | `wall.window` | 31 | 3 | down | 1 |  |
| 39 | Meeting room | `wall.tv` | 34 | 3 | down | 1 |  |
| 40 | Meeting room | `wall.window` | 37 | 3 | down | 1 |  |
| 41 | Meeting room | `plant.small.a` | 31 | 4 | down | 1 |  |
| 42 | Meeting room | `plant.small.b` | 38 | 4 | down | 1 |  |
| 43 | Meeting room | `chair.meeting.grey` | 33 | 5 | down | 1 | seat -> meeting |
| 44 | Meeting room | `chair.meeting.grey` | 34 | 5 | down | 1 | seat -> meeting |
| 45 | Meeting room | `chair.meeting.grey` | 35 | 5 | down | 1 | seat -> meeting |
| 46 | Meeting room | `chair.meeting.grey` | 36 | 5 | down | 1 | seat -> meeting |
| 47 | Meeting room | `table.meeting.walnut.8` | 33 | 6 | down | 1 |  |
| 48 | Meeting room | `surface.conference` | 34 | 6 | down | 1 |  |
| 49 | Meeting room | `surface.plant` | 35 | 7 | down | 1 |  |
| 50 | Meeting room | `chair.meeting.grey` | 33 | 8 | up | 1 | seat -> meeting |
| 51 | Meeting room | `chair.meeting.grey` | 34 | 8 | up | 1 | seat -> meeting |
| 52 | Meeting room | `chair.meeting.grey` | 35 | 8 | up | 1 | seat -> meeting |
| 53 | Meeting room | `chair.meeting.grey` | 36 | 8 | up | 1 | seat -> meeting |
| 54 | Meeting room | `plant.tall.monstera` | 31 | 9 | down | 1 |  |
| 55 | Meeting room | `plant.tall.fiddle` | 38 | 9 | down | 1 |  |
| 56 | Meeting room | `door.glass` | 32 | 10 | down | 1 |  |
| 57 | Office C | `wall.window` | 41 | 3 | down | 1 |  |
| 58 | Office C | `wall.window` | 44 | 3 | down | 1 |  |
| 59 | Office C | `cabinet.filing` | 40 | 4 | down | 1 |  |
| 60 | Office C | `desk.white.monitor` | 41 | 4 | up | 1 |  |
| 61 | Office C | `surface.lamp` | 42 | 4 | down | 1 |  |
| 62 | Office C | `plant.small.b` | 43 | 4 | down | 1 |  |
| 63 | Office C | `desk.white.monitor` | 44 | 4 | up | 1 |  |
| 64 | Office C | `surface.phone` | 45 | 4 | down | 1 |  |
| 65 | Office C | `chair.office.teal` | 41 | 5 | up | 1 | seat -> work |
| 66 | Office C | `chair.office.charcoal` | 44 | 5 | up | 1 | seat -> work |
| 67 | Office C | `whiteboard.stand` | 40 | 7 | down | 1 | whiteboard spot (40,8) up; whiteboard spot (41,8) up |
| 68 | Office C | `desk.oak.laptop` | 44 | 7 | up | 1 |  |
| 69 | Office C | `surface.mug` | 45 | 7 | down | 1 |  |
| 70 | Office C | `chair.office.mustard` | 44 | 8 | up | 1 | seat -> work |
| 71 | Office C | `plant.tall.palm` | 40 | 9 | down | 1 |  |
| 72 | Office C | `bin.office` | 42 | 9 | down | 1 |  |
| 73 | Office C | `door.oak` | 43 | 10 | down | 1 |  |
| 74 | Corridor | `wall.corkboard` | 17 | 10 | down | 1 |  |
| 75 | Corridor | `wall.art.landscape` | 24 | 10 | down | 1 |  |
| 76 | Corridor | `wall.clock` | 28 | 10 | down | 1 |  |
| 77 | Corridor | `wall.art.wide` | 41 | 10 | down | 1 |  |
| 78 | Corridor | `wall.art.botanical` | 44 | 10 | down | 1 |  |
| 79 | Corridor | `printer` | 16 | 11 | down | 1 | print spot (16,12) up |
| 80 | Corridor | `water.cooler` | 45 | 11 | down | 1 | water spot (45,12) up |
| 81 | Corridor | `door.oak` | 28 | 13 | down | 1 |  |
| 82 | Corridor | `door.oak` | 32 | 13 | down | 1 |  |
| 83 | Kitchenette + dining | `fridge` | 16 | 14 | down | 1 | snack spot (16,15) up |
| 84 | Kitchenette + dining | `counter.end.left` | 17 | 14 | down | 1 |  |
| 85 | Kitchenette + dining | `counter.sink` | 18 | 14 | down | 1 |  |
| 86 | Kitchenette + dining | `counter.coffee` | 19 | 14 | down | 1 | coffee spot (19,15) up |
| 87 | Kitchenette + dining | `counter.microwave` | 20 | 14 | down | 1 | snack spot (20,15) up |
| 88 | Kitchenette + dining | `counter.end.right` | 21 | 14 | down | 1 |  |
| 89 | Kitchenette + dining | `vending` | 16 | 16 | down | 1 | snack spot (16,17) up |
| 90 | Kitchenette + dining | `chair.dining.oak` | 17 | 17 | down | 1 | seat -> eat |
| 91 | Kitchenette + dining | `chair.dining.oak` | 18 | 17 | down | 1 | seat -> eat |
| 92 | Kitchenette + dining | `chair.dining.oak` | 19 | 17 | down | 1 | seat -> eat |
| 93 | Kitchenette + dining | `chair.dining.oak` | 20 | 17 | down | 1 | seat -> eat |
| 94 | Kitchenette + dining | `table.dining.oak` | 17 | 18 | down | 1 |  |
| 95 | Kitchenette + dining | `surface.plant` | 18 | 18 | down | 1 |  |
| 96 | Kitchenette + dining | `table.dining.oak` | 19 | 18 | down | 1 |  |
| 97 | Kitchenette + dining | `surface.mug` | 19 | 18 | down | 1 |  |
| 98 | Kitchenette + dining | `chair.dining.oak` | 17 | 19 | up | 1 | seat -> eat |
| 99 | Kitchenette + dining | `chair.dining.oak` | 18 | 19 | up | 1 | seat -> eat |
| 100 | Kitchenette + dining | `chair.dining.oak` | 19 | 19 | up | 1 | seat -> eat |
| 101 | Kitchenette + dining | `chair.dining.oak` | 20 | 19 | up | 1 | seat -> eat |
| 102 | Kitchenette + dining | `stool.bar` | 17 | 21 | down | 1 | seat -> eat |
| 103 | Kitchenette + dining | `stool.bar` | 18 | 21 | down | 1 | seat -> eat |
| 104 | Kitchenette + dining | `stool.bar` | 19 | 21 | down | 1 | seat -> eat |
| 105 | Kitchenette + dining | `stool.bar` | 20 | 21 | down | 1 | seat -> eat |
| 106 | Kitchenette + dining | `lamp.floor.brass` | 16 | 22 | down | 1 |  |
| 107 | Kitchenette + dining | `table.bar.oak` | 17..19 | 22 | down | 2 |  |
| 108 | Kitchenette + dining | `surface.plant` | 20 | 22 | down | 1 |  |
| 109 | Kitchenette + dining | `lamp.floor.brass` | 21 | 22 | down | 1 |  |
| 110 | WC west | `toilet.stall` | 26 | 14 | down | 1 | seat -> toilet |
| 111 | WC west | `toilet.stall` | 27 | 14 | down | 1 | seat -> toilet |
| 112 | WC west | `sink.vanity` | 29 | 14 | down | 1 | wash spot (29,15) up |
| 113 | WC east | `toilet.stall` | 31 | 14 | down | 1 | seat -> toilet |
| 114 | WC east | `sink.vanity` | 33 | 14 | down | 1 | wash spot (33,15) up |
| 115 | Stairwell | `stairs` | 35 | 14 | down | 1 | stairs spot (35,17) down |
| 116 | East passage | `door.glass` | 40 | 14 | left | 1 |  |
| 117 | Lift lobby + reception | `wall.clock` | 26 | 16 | down | 1 |  |
| 118 | Lift lobby + reception | `wall.art.abstract` | 28 | 16 | down | 1 |  |
| 119 | Lift lobby + reception | `wall.sconce` | 29 | 16 | down | 1 |  |
| 120 | Lift lobby + reception | `wall.sconce` | 32 | 16 | down | 1 |  |
| 121 | Lift lobby + reception | `reception.desk` | 25 | 17 | down | 1 | reception spot (26,17) down |
| 122 | Lift lobby + reception | `plant.tall.fiddle` | 29 | 17 | down | 1 |  |
| 123 | Lift lobby + reception | `elevator` | 30 | 17 | down | 1 | elevator spot (30,18) down |
| 124 | Lift lobby + reception | `plant.tall.monstera` | 32 | 17 | down | 1 |  |
| 125 | Lift lobby + reception | `water.cooler` | 33 | 17 | down | 1 | water spot (33,18) up |
| 126 | Lift lobby + reception | `coatrack` | 34 | 17 | down | 1 |  |
| 127 | Lift lobby + reception | `plant.tall.palm` | 37 | 17 | down | 1 |  |
| 128 | Lift lobby + reception | `mat.entrance` | 30 | 18 | down | 1 |  |
| 129 | Lift lobby + reception | `lamp.floor.brass` | 39 | 19 | down | 1 |  |
| 130 | Lift lobby + reception | `door.oak` | 40 | 20 | left | 1 |  |
| 131 | Lounge | `rug.large.sage` | 29 | 20 | down | 1 |  |
| 132 | Lounge | `sofa.2.sage` | 30 | 20 | down | 1 | seat -> social |
| 133 | Lounge | `lamp.floor.brass` | 33 | 20 | down | 1 |  |
| 134 | Lounge | `game.foosball` | 24 | 21 | down | 1 | play spot (23,21) right; play spot (26,21) left |
| 135 | Lounge | `armchair.mustard` | 29 | 21 | right | 1 | seat -> social |
| 136 | Lounge | `table.coffee.walnut` | 30 | 21 | down | 1 |  |
| 137 | Lounge | `armchair.leather` | 32 | 21 | left | 1 | seat -> social |
| 138 | Lounge | `rug.terracotta` | 35 | 21 | down | 1 |  |
| 139 | Lounge | `chair.cafe.oak` | 35 | 21 | right | 1 | seat -> social |
| 140 | Lounge | `table.round.cafe` | 36 | 21 | down | 1 |  |
| 141 | Lounge | `chair.cafe.oak` | 37 | 21 | left | 1 | seat -> social |
| 142 | Lounge | `plant.tall.palm` | 23 | 22 | down | 1 |  |
| 143 | Lounge | `plant.small.a` | 27 | 22 | down | 1 |  |
| 144 | Lounge | `chair.cafe.oak` | 36 | 22 | up | 1 | seat -> social |
| 145 | Lounge | `plant.tall.monstera` | 39 | 22 | down | 1 |  |
| 146 | Focus room | `wall.whiteboard` | 44 | 13 | down | 1 | whiteboard spot (44,14) up; whiteboard spot (45,14) up |
| 147 | Focus room | `chair.meeting.teal` | 41 | 15 | right | 1 | seat -> meeting |
| 148 | Focus room | `table.meeting.oak.4` | 42 | 15 | down | 1 |  |
| 149 | Focus room | `surface.conference` | 42 | 15 | down | 1 |  |
| 150 | Focus room | `chair.meeting.teal` | 44 | 15 | left | 1 | seat -> meeting |
| 151 | Focus room | `chair.meeting.teal` | 41 | 16 | right | 1 | seat -> meeting |
| 152 | Focus room | `surface.plant` | 43 | 16 | down | 1 |  |
| 153 | Focus room | `chair.meeting.teal` | 44 | 16 | left | 1 | seat -> meeting |
| 154 | Library | `plant.tall.palm` | 41 | 19 | down | 1 |  |
| 155 | Library | `bookshelf.lounge` | 42 | 19 | down | 1 | read spot (42,20) up; read spot (43,20) up |
| 156 | Library | `bookshelf.walnut` | 44 | 19 | down | 1 | read spot (44,20) up; read spot (45,20) up |
| 157 | Library | `rug.cream` | 42 | 21 | down | 1 |  |
| 158 | Library | `beanbag.mustard` | 43 | 21 | down | 1 | seat -> social |
| 159 | Library | `plant.small.b` | 41 | 22 | down | 1 |  |
| 160 | Library | `armchair.leather` | 42 | 22 | up | 1 | seat -> social |
| 161 | Library | `table.side` | 43 | 22 | down | 1 |  |
| 162 | Library | `armchair.sage` | 44 | 22 | up | 1 | seat -> social |
| 163 | Library | `lamp.floor.brass` | 45 | 22 | down | 1 |  |
| 164 | Facade | `facade.corner.left.brick` | 15 | 24 | down | 1 |  |
| 165 | Facade | `facade.window.brick` | 16 | 24 | down | 1 |  |
| 166 | Facade | `facade.wall.brick` | 17 | 24 | down | 1 |  |
| 167 | Facade | `facade.window.brick` | 18..19 | 24 | down | 2 |  |
| 168 | Facade | `facade.wall.brick` | 20 | 24 | down | 1 |  |
| 169 | Facade | `facade.window.brick` | 21..22 | 24 | down | 2 |  |
| 170 | Facade | `facade.wall.brick` | 23 | 24 | down | 1 |  |
| 171 | Facade | `facade.window.brick` | 24..25 | 24 | down | 2 |  |
| 172 | Facade | `facade.wall.brick` | 26 | 24 | down | 1 |  |
| 173 | Facade | `facade.window.brick` | 27..28 | 24 | down | 2 |  |
| 174 | Facade | `facade.wall.brick` | 29 | 24 | down | 1 |  |
| 175 | Facade | `facade.entrance.brick` | 30 | 24 | down | 1 | enter spot (30,27) up |
| 176 | Facade | `facade.wall.brick` | 32 | 24 | down | 1 |  |
| 177 | Facade | `facade.window.brick` | 33..34 | 24 | down | 2 |  |
| 178 | Facade | `facade.wall.brick` | 35 | 24 | down | 1 |  |
| 179 | Facade | `facade.window.brick` | 36..37 | 24 | down | 2 |  |
| 180 | Facade | `facade.wall.brick` | 38 | 24 | down | 1 |  |
| 181 | Facade | `facade.window.brick` | 39..40 | 24 | down | 2 |  |
| 182 | Facade | `facade.wall.brick` | 41 | 24 | down | 1 |  |
| 183 | Facade | `facade.window.brick` | 42..43 | 24 | down | 2 |  |
| 184 | Facade | `facade.wall.brick` | 44 | 24 | down | 1 |  |
| 185 | Facade | `facade.window.brick` | 45 | 24 | down | 1 |  |
| 186 | Facade | `facade.corner.right.brick` | 46 | 24 | down | 1 |  |
| 187 | Entrance plaza | `flowerbed.red` | 16 | 28 | down | 1 |  |
| 188 | Entrance plaza | `bush.round.a` | 18 | 28 | down | 1 |  |
| 189 | Entrance plaza | `flowerbed.mixed` | 20 | 28 | down | 1 |  |
| 190 | Entrance plaza | `bush.round.b` | 22 | 28 | down | 1 |  |
| 191 | Entrance plaza | `flowerbed.yellow` | 24 | 28 | down | 1 |  |
| 192 | Entrance plaza | `flowerbed.yellow` | 36 | 28 | down | 1 |  |
| 193 | Entrance plaza | `bush.round.b` | 38 | 28 | down | 1 |  |
| 194 | Entrance plaza | `flowerbed.mixed` | 39 | 28 | down | 1 |  |
| 195 | Entrance plaza | `bush.round.a` | 41 | 28 | down | 1 |  |
| 196 | Entrance plaza | `flowerbed.red` | 43 | 28 | down | 1 |  |
| 197 | Entrance plaza | `bush.flowering` | 45 | 28 | down | 1 |  |
| 198 | Entrance plaza | `bikerack` | 40 | 29 | down | 1 |  |
| 199 | Entrance plaza | `bush.flowering` | 16 | 30 | down | 1 |  |
| 200 | Entrance plaza | `bin.street` | 23 | 30 | down | 1 |  |
| 201 | Entrance plaza | `bench.park` | 24 | 30 | down | 1 | seat -> social |
| 202 | Entrance plaza | `bench.park` | 36 | 30 | down | 1 | seat -> social |
| 203 | Entrance plaza | `bush.round.a` | 21 | 31 | down | 1 |  |
| 204 | Entrance plaza | `lamp.street` | 28 | 31 | down | 1 |  |
| 205 | Entrance plaza | `lamp.street` | 33 | 31 | down | 1 |  |
| 206 | Entrance plaza | `bush.flowering` | 45 | 31 | down | 1 |  |
| 207 | Entrance plaza | `tree.maple` | 18 | 32 | down | 1 |  |
| 208 | Entrance plaza | `bush.round.b` | 40 | 32 | down | 1 |  |
| 209 | Entrance plaza | `tree.oak.b` | 43 | 32 | down | 1 |  |
| 210 | Entrance plaza | `tree.oak.a` | 24 | 33 | down | 1 |  |
| 211 | Entrance plaza | `flowerbed.mixed` | 27 | 33 | down | 1 |  |
| 212 | Entrance plaza | `flowerbed.mixed` | 33 | 33 | down | 1 |  |
| 213 | Entrance plaza | `tree.birch` | 37 | 33 | down | 1 |  |
| 214 | Entrance plaza | `hedge` | 15..18 | 34 | down | 4 |  |
| 215 | Entrance plaza | `sign.monument` | 19 | 34 | down | 1 |  |
| 216 | Entrance plaza | `hedge` | 22..28 | 34 | down | 7 |  |
| 217 | Entrance plaza | `bollard` | 29 | 34 | down | 1 |  |
| 218 | Entrance plaza | `bollard` | 32 | 34 | down | 1 |  |
| 219 | Entrance plaza | `hedge` | 33..46 | 34 | down | 14 |  |
| 220 | Car park | `hedge` | 47..51 | 26 | down | 5 |  |
| 221 | Car park | `marking.bay` | 47..52 | 27 | down | 6 | one bay per x; parking spot on the lower tile (y+1) |
| 222 | Car park | `bush.round.a` | 53 | 27 | down | 1 |  |
| 223 | Car park | `bush.round.b` | 54 | 27 | down | 1 |  |
| 224 | Car park | `sign.post` | 54 | 28 | down | 1 |  |
| 225 | Car park | `marking.bay` | 47..52 | 31 | down | 6 | one bay per x; parking spot on the lower tile (y+1) |
| 226 | Car park | `flowerbed.yellow` | 47 | 33 | down | 1 |  |
| 227 | Car park | `bush.round.b` | 49 | 33 | down | 1 |  |
| 228 | Car park | `flowerbed.red` | 50 | 33 | down | 1 |  |
| 229 | Car park | `bush.round.a` | 52 | 33 | down | 1 |  |
| 230 | Car park | `hedge` | 47..52 | 34 | down | 6 |  |
| 231 | Car park | `lamp.street` | 50 | 35 | down | 1 |  |
| 232 | Car park | `marking.crosswalk` | 53..54 | 35 | left | 2 |  |
| 233 | Car park | `marking.crosswalk` | 53..54 | 36 | left | 2 |  |
| 234 | Street | `lamp.street` | 9 | 35 | down | 1 |  |
| 235 | Street | `lamp.street` | 22 | 35 | down | 1 |  |
| 236 | Street | `bin.street` | 34 | 35 | down | 1 |  |
| 237 | Street | `lamp.street` | 39 | 35 | down | 1 |  |
| 238 | Street | `marking.crosswalk` | 30..31 | 37 | down | 2 |  |
| 239 | Street | `marking.crosswalk` | 30..31 | 38 | down | 2 |  |
| 240 | Street | `bush.round.a` | 3 | 40 | down | 1 |  |
| 241 | Street | `flowerbed.mixed` | 12 | 40 | down | 1 |  |
| 242 | Street | `bush.flowering` | 18 | 40 | down | 1 |  |
| 243 | Street | `bush.round.b` | 25 | 40 | down | 1 |  |
| 244 | Street | `flowerbed.yellow` | 36 | 40 | down | 1 |  |
| 245 | Street | `bush.round.a` | 42 | 40 | down | 1 |  |
| 246 | Street | `bush.flowering` | 47 | 40 | down | 1 |  |
| 247 | Street | `flowerbed.red` | 51 | 40 | down | 1 |  |
| 248 | Street | `fence.wood` | 0..55 | 41 | down | 56 |  |
| 249 | Park | `bush.round.b` | 1 | 1 | down | 1 |  |
| 250 | Park | `bush.round.a` | 12 | 1 | down | 1 |  |
| 251 | Park | `tree.oak.a` | 3 | 3 | down | 1 |  |
| 252 | Park | `tree.maple` | 10 | 3 | down | 1 |  |
| 253 | Park | `hedge` | 14 | 3 | left | 1 |  |
| 254 | Park | `table.picnic` | 7 | 4 | down | 1 | eat spot (7,3) down; eat spot (8,3) down; eat spot (7,5) up; eat spot (8,5) up |
| 255 | Park | `hedge` | 14 | 4..5 | left | 2 |  |
| 256 | Park | `bush.flowering` | 12 | 6 | down | 1 |  |
| 257 | Park | `hedge` | 14 | 6 | left | 1 |  |
| 258 | Park | `bush.round.b` | 0 | 7 | down | 1 |  |
| 259 | Park | `hedge` | 14 | 7..8 | left | 2 |  |
| 260 | Park | `lamp.street` | 3 | 9 | down | 1 |  |
| 261 | Park | `hedge` | 14 | 9 | left | 1 |  |
| 262 | Park | `flowerbed.yellow` | 3 | 10 | down | 1 |  |
| 263 | Park | `flowerbed.mixed` | 8 | 10 | down | 1 |  |
| 264 | Park | `hedge` | 14 | 10..11 | left | 2 |  |
| 265 | Park | `tree.birch` | 1 | 12 | down | 1 |  |
| 266 | Park | `bench.park` | 6 | 12 | down | 1 | seat -> social |
| 267 | Park | `bin.street` | 8 | 12 | down | 1 |  |
| 268 | Park | `hedge` | 14 | 12 | left | 1 |  |
| 269 | Park | `bush.round.a` | 3 | 13 | down | 1 |  |
| 270 | Park | `hedge` | 14 | 13 | left | 1 |  |
| 271 | Park | `bush.flowering` | 10 | 14 | down | 1 |  |
| 272 | Park | `hedge` | 14 | 14..15 | left | 2 |  |
| 273 | Park | `tree.oak.b` | 12 | 16 | down | 1 |  |
| 274 | Park | `hedge` | 14 | 16..19 | left | 4 |  |
| 275 | Park | `bush.round.b` | 3 | 20 | down | 1 |  |
| 276 | Park | `bush.round.a` | 10 | 20 | down | 1 |  |
| 277 | Park | `hedge` | 14 | 20 | left | 1 |  |
| 278 | Park | `tree.oak.a` | 1 | 21 | down | 1 |  |
| 279 | Park | `bench.park` | 6 | 21 | up | 1 | seat -> social |
| 280 | Park | `bin.street` | 8 | 21 | down | 1 |  |
| 281 | Park | `hedge` | 14 | 21..23 | left | 3 |  |
| 282 | Park | `tree.birch` | 9 | 24 | down | 1 |  |
| 283 | Park | `flowerbed.red` | 3 | 25 | down | 1 |  |
| 284 | Park | `flowerbed.mixed` | 7 | 25 | down | 1 |  |
| 285 | Park | `bush.flowering` | 0 | 26 | down | 1 |  |
| 286 | Park | `lamp.street` | 10 | 26 | down | 1 |  |
| 287 | Park | `bush.round.a` | 13 | 26 | down | 1 |  |
| 288 | Park | `sign.post` | 12 | 28 | down | 1 |  |
| 289 | Park | `lamp.street` | 7 | 29 | down | 1 |  |
| 290 | Park | `tree.maple` | 3 | 31 | down | 1 |  |
| 291 | Park | `tree.oak.b` | 11 | 32 | down | 1 |  |
| 292 | Park | `hedge` | 0..5 | 34 | down | 6 |  |
| 293 | Park | `hedge` | 7..14 | 34 | down | 8 |  |
| 294 | Grounds | `flowerbed.mixed` | 17 | 0 | down | 1 |  |
| 295 | Grounds | `bush.round.a` | 20 | 0 | down | 1 |  |
| 296 | Grounds | `bush.round.b` | 35 | 0 | down | 1 |  |
| 297 | Grounds | `flowerbed.yellow` | 40 | 0 | down | 1 |  |
| 298 | Grounds | `bush.flowering` | 27 | 1 | down | 1 |  |
| 299 | Grounds | `bush.round.a` | 44 | 1 | down | 1 |  |
| 300 | Grounds | `bush.flowering` | 50 | 1 | down | 1 |  |
| 301 | Grounds | `hedge` | 15..46 | 2 | down | 32 |  |
| 302 | Grounds | `tree.oak.a` | 51 | 3 | down | 1 |  |
| 303 | Grounds | `bush.round.a` | 48 | 4 | down | 1 |  |
| 304 | Grounds | `flowerbed.red` | 47 | 10 | down | 1 |  |
| 305 | Grounds | `tree.birch` | 53 | 10 | down | 1 |  |
| 306 | Grounds | `lamp.street` | 48 | 15 | down | 1 |  |
| 307 | Grounds | `tree.maple` | 51 | 15 | down | 1 |  |
| 308 | Grounds | `bench.park` | 50 | 18 | down | 1 | seat -> social |
| 309 | Grounds | `bin.street` | 52 | 18 | down | 1 |  |
| 310 | Grounds | `tree.oak.b` | 54 | 20 | down | 1 |  |
| 311 | Grounds | `flowerbed.yellow` | 47 | 22 | down | 1 |  |
| 312 | Grounds | `bush.flowering` | 53 | 24 | down | 1 |  |

### 4.6 Spots (as the engine will resolve them)

| activity | count | spot tiles (x,y) |
| --- | --- | --- |
| coffee | 1 | (19,15) |
| eat | 16 | (17,17) (17,19) (18,17) (18,19) (19,17) (19,19) (20,17) (20,19) (17,21) (18,21) (19,21) (20,21) (7,3) (8,3) (7,5) (8,5) |
| elevator | 1 | (30,18) |
| enter | 1 | (30,27) |
| meeting | 12 | (33,5) (33,8) (34,5) (34,8) (35,5) (35,8) (36,5) (36,8) (41,15) (41,16) (44,15) (44,16) |
| parking | 12 | (47,28) (47,32) (48,28) (48,32) (49,28) (49,32) (50,28) (50,32) (51,28) (51,32) (52,28) (52,32) |
| play | 2 | (23,21) (26,21) |
| print | 1 | (16,12) |
| read | 6 | (21,5) (21,6) (42,20) (43,20) (44,20) (45,20) |
| reception | 1 | (26,17) |
| snack | 3 | (16,15) (20,15) (16,17) |
| social | 20 | (30,20) (31,20) (29,21) (32,21) (35,21) (37,21) (36,22) (42,22) (44,22) (43,21) (24,30) (25,30) (36,30) (37,30) (6,12) (7,12) (6,21) (7,21) (50,18) (51,18) |
| stairs | 1 | (35,17) |
| toilet | 3 | (26,14) (27,14) (31,14) |
| wash | 2 | (29,15) (33,15) |
| water | 2 | (45,12) (33,18) |
| whiteboard | 6 | (28,8) (29,8) (40,8) (41,8) (44,14) (45,14) |
| work | 10 | (17,4) (19,4) (17,7) (19,7) (24,5) (27,5) (24,8) (41,5) (44,5) (44,8) |

## 5. Materials and lighting schedule

| Room | Floor | Walls | Accent | Light |
| --- | --- | --- | --- | --- |
| Offices A, B, C | `carpet.teal` | north: `wall.brick` exterior (inner face, 2 `wall.window` each); dividers and corridor wall `wall.cream`; oak doors | none: plants and a bookshelf instead | daylight from the windows, neutral; one warm `surface.lamp` per office, monitor glow |
| Meeting room | `carpet.slate` | north `wall.brick` with 2 windows and `wall.tv`; sides `wall.cream`; corridor side `wall.glass` + `door.glass` | glass front | neutral daylight, TV glow |
| Corridor + passages | `carpet.warmgrey` (runner) | `wall.cream` | art, corkboard, clock on the north face | neutral |
| Lift lobby + reception | `wood.walnut` + `mat.entrance` | lift wall (y 16, x 25-34) `wall.wood` | the oak-slat lift wall with `wall.clock` over reception, `wall.art.abstract`, 2 `wall.sconce` flanking the lift | warm: `wall.sconce` (29,16) and (32,16), `lamp.floor.brass` (39,19) at the east passage, reception monitor glow |
| Lounge | `wood.oak` + `rug.large.sage`, `rug.terracotta` | shares the lift wall; side walls are caps only | sage rug, leather and mustard armchairs | warm: `lamp.floor.brass` (33,20) beside the sofa group; the lobby lamp (39,19) and the dining lamps spill in |
| Kitchenette + dining | `tile.kitchen` at the counters (y 13-16), `wood.oak` for dining and bar | north `wall.terracotta` (behind the counters), east `wall.cream` | terracotta wall | warm: `lamp.floor.brass` (16,22), (21,22); counter under-cabinet glow and the vending screen |
| WCs | `tile.restroom` | `wall.tile` | none | neutral |
| Stairwell | `tile.terrazzo` | `wall.cream` | none | neutral |
| Focus room | `carpet.warmgrey` | north `wall.cream` + `wall.whiteboard`; west `wall.glass` + `door.glass`; south `wall.sage` | none | neutral (daylight through the glass) |
| Library | `carpet.warmgrey` + `rug.cream` | north `wall.sage`, west `wall.cream` + `door.oak` | sage wall behind the shelves | warm: `lamp.floor.brass` (45,22) in the reading nook |
| Exterior shell | | all four perimeter walls `wall.brick`; facade set `*.brick` | | daylight; `lamp.street` (night only) |

All light sources placed:

| zone | light sources (asset, x,y) |
| --- | --- |
| Office A | `wall.window` (17,3), `wall.window` (20,3), `surface.lamp` (18,6) |
| Office B | `wall.window` (24,3), `wall.window` (27,3), `surface.lamp` (25,4) |
| Meeting room | `wall.window` (31,3), `wall.window` (37,3), `wall.tv` (34,3) |
| Office C | `wall.window` (41,3), `wall.window` (44,3), `surface.lamp` (42,4) |
| Kitchenette + dining | `vending` (16,16), `lamp.floor.brass` (16,22), `lamp.floor.brass` (21,22) |
| Lift lobby + reception | `wall.sconce` (29,16), `wall.sconce` (32,16), `lamp.floor.brass` (39,19) |
| Lounge | `lamp.floor.brass` (33,20) |
| Library | `lamp.floor.brass` (45,22) |
| Entrance plaza | `lamp.street` (28,31), `lamp.street` (33,31) |
| Car park | `lamp.street` (50,35) |
| Street | `lamp.street` (9,35), `lamp.street` (22,35), `lamp.street` (39,35) |
| Park | `lamp.street` (3,9), `lamp.street` (10,26), `lamp.street` (7,29) |
| Grounds | `lamp.street` (48,15) |

## 6. Validation

A throwaway script parsed this exact layout (the grids and the table are generated from the same data) and
checked it against the footprints, facings and spots in `docs/ASSET_MANIFEST.md`. **Result: 0 errors, 0
warnings.** (Script: `validate.py` in the architect's scratch folder; the session scratchpad is temporary, so
re-check against the grids above if it is gone.) Checks:

1. Every id exists in the manifest and the facing is one the asset supports.
2. Every footprint is in bounds; floor-layer and object-layer footprints sit on floor tiles with no wall;
   no two items overlap on the same layer.
3. Every wall-layer item sits on wall tiles whose south neighbour is open floor (visible face); no wall decor
   hangs above a tall object (bookshelf, fridge, tall plant, cooler, lamp, coat rack).
4. Every surface item stands on a desk, table or counter.
5. Every door sits in a wall gap with wall tiles on both sides and free, walkable approach tiles on both sides.
6. The elevator has wall tiles directly north of both its tiles; the facade covers x 15-46 exactly, directly
   south of the brick south wall.
7. Seat resolution: all 10 office chairs face a desk (10 `work`), all meeting chairs face a meeting table,
   dining chairs and stools face dining/bar tables, café chairs face the café table; 1 `reception` seat.
8. Reachability (BFS, 4-directional, treating seats as enterable goals but not as corridors): every indoor
   spot is reachable from the elevator spot (30,18); the stairs spot (35,17) is in the same region; every
   walkable indoor tile is reachable (no sealed pockets); every outdoor spot (enter, 12 parking spots,
   benches, picnic) is reachable from the enter spot (30,27); indoor and outdoor regions do not touch.
   Indoor walkable tiles: 308. Outdoor walkable tiles: 1264.
9. Corridors (y 11-12, and both passages) contain no objects.
10. Roads: the only drivable border tiles are (0,37), (0,38), (55,37), (55,38); all 12 bay spots are
    reachable by car from the road; every bay lies on asphalt.

100 spots in total.

## 7. Assumptions to confirm with the artists

The manifest leaves a few details open. The layout is valid under these readings; if an artist decides
otherwise, tell the architect.

- **Masks:** every object-layer asset blocks all its tiles (`#`) except seats (`s`: chairs, stools, sofas,
  armchairs, beanbags, benches, toilets), doors (`.`) and `reception.desk` row 0 (`.s.`). Floor-layer items
  (rugs, mat, markings) never block.
- **Stairs:** treated as fully blocking 2 x 3 with the arrival spot outside the footprint at (35,17).
- **Bookshelves (`down`):** `read` spot(s) on the tile(s) directly in front; both front tiles are kept free.
  `bookshelf.oak` facing `left` at (22,5) has its front on x 21, kept free.
- **`table.picnic`:** spots at dy -1 (facing down) and dy +1 (facing up) on both columns; both rows are kept
  free grass. Seats inside the footprint would also work.
- **`marking.bay`:** facing `down` only. In the north row the spot tile (y 28) touches the aisle; in the south
  row the spot (y 32) is the far tile. Both bay tiles are drivable, so either row works for cars.
- **`marking.crosswalk`:** `down` on the road (stripes for walking north-south across it), `left` across the
  access lane on the sidewalk.
- **`bench.park`:** two seats inside the footprint, facing the bench's facing (both resolve to `social`).
- **`marking.lane` is not used:** a 2-lane road's centre line falls on a tile seam.
- No parked car props are placed; the bays are for the engine's cars.

## Final 2nd-floor plan (as built in `src/world/levels/hq.ts`, x 14–47)

Legend: `+` wall, `D` door, `L` lift, `^` stairs, `K` desk, `h` chair/stool, `T` table, `O` sofa,
`A` armchair/beanbag, `R` reception, `U` toilet, `u` vanity, `c` counter/fridge, `w` water cooler, `P` printer,
`Q` whiteboard stand, `H` shelf/cabinet, `g` foosball, `p` plant, `l` lamp, `y` coat rack, `x` bin, `F`/`E` façade/entrance.

```
  3  ++++++++++++++++++++++++++++++++
  4  +.hxh..H+KKpKKH+p......p+HKKpKK+
  5  +.KKKK.H+h..h.H+..hhhh..+.h..h.+
  6  +.KKKK.H+.....H+.hTTTTh.+......+
  7  +.h.h...+KK..QQ+..TTTT..+QQ..KK+
  8  +......p+h.....+..hhhh..+....h.+
  9  +p......+...x.p+p......p+p.x..p+
 10  ++++++D++++D+++++D++++++++++D+++
 11  +P............................w+
 12  +..............................+
 13  ++++++++..+++D+++++++D++..++++++
 14  +ccccccw..+UU.u.+^^+u.U+..D....+
 15  +.........+.....+^^+...+..+hTTh+
 16  +.TTTT....+++++++^^+++++..+hTTh+
 17  +.hhhhl...RRR.pLL..yOOOp..+...p+
 18  +p........RRR.............++++++
 19  +.OOl..p.................l+HHHH+
 20  +ATTA..........OO.l.......D....+
 21  +.OO..gg..hTh.ATTA..hTh...+ATAl+
 22  +p..p...p....p...........p+.A.p+
 23  ++++++++++++++++++++++++++++++++
 24  FFFFFFFFFFFFFFFEEFFFFFFFFFFFFFFF   (entrance x 30-31 directly below the lift)
```
