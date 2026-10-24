# Tiny Agents HQ: Architecture Plan

Owner: architect. Built in `src/world/levels/hq.ts` (`hqBuilding()`), which is the source of truth for exact item
coordinates. Coordinates are **map tiles** `(x, y)`, origin top-left. Walls fill their tile: a room's interior starts
on the tile next to its wall, and wall-backed furniture stands on that tile.

## 1. Intent

One well-planned brick building in a business-park garden, **two floors**, like a real small company HQ:

- **Ground floor = the building's services + the outdoors.** You arrive from the street or the car park, cross the
  forecourt, go through the glass doors into the entrance hall, past the security desk, and the lift is straight
  ahead on the same axis as the door. Everything that serves the whole company lives here: the staffed canteen, the
  server room and IT help, the print room, the janitor closet.
- **Floor 2 = where teams work.** Three team offices and the boardroom take the north windows. Step out of the lift
  into a large open reception that flows into a kitchen nook, a lounge corner and a seating area. A boardroom (10)
  and a meeting room (8) host meetings, and a small print room serves the floor.
- **One shared core.** Lift (30,17) and stairs (32,14) sit at the same tiles on both floors, flanked by restrooms
  (stacked plumbing). The front door (30-31,26) is directly below the lift.
- **Rooms where privacy or noise matters, open areas elsewhere.** Offices, meeting rooms, server, security, print
  and restrooms are walled with doors. Reception, lounge corners and kitchen points are open onto circulation. Each
  label sits on its own `Nav.roomOf` region, and an open area carries one label. Circulation is a corridor north of
  the core and a lobby south of it, joined by two passages either side of the core with glass double doors.
- **Office exterior, not a warehouse.** White concrete (`wall.concrete.white`); ribbon windows in the south walls
  (`wall.concrete.window`, which shows on the stacked façade) and framed glass in the side walls (`wall.window.frame`,
  a glass-kind style, so the cap reads as a pane with a mullion). Ground: canteen sides and south, hall left of the
  door, reading corner, IT. Floor 2: offices 1 and 3, kitchen nook, lounge, break zone, meeting room.
- **Meeting tables point at the screen.** Long tables run north-south with seats down both sides and one at the
  far end; the screen hangs on the north wall.
- **Against the wall means against the wall.** Counters, racks, toilets, sinks, shelves, copiers, whiteboards
  and cabinets stand on the first tile inside a wall, facing away from it. Tables, pods and sofa groups stand free.
- **Servers and computers live in the server room** (racks, UPS, cooling, internet kiosk), not in offices or the lobby.

## 2. Site (ground floor, map 56 x 42)

The east wing, glass link and neighbour buildings are gone; the map is back to what the site needs.

| zone | tiles | notes |
| --- | --- | --- |
| North strip | (0,0)-(55,2) | meadow, hedge along the north wall (y 2) |
| Building | (15,3)-(46,26) | 32 x 24 incl. brick exterior walls; same footprint on both floors |
| Façade walkway | (15,27)-(46,27) | paving; links park path, forecourt and car park |
| Forecourt + entrance path | (26,27)-(35,30), (29,31)-(32,34) | brick paving centred on the door, lamps, benches, bollards |
| Plaza lawns | (15,28)-(46,34) | trees, flowerbeds, bike rack, monument sign |
| Park (west) | (0,0)-(14,34) | gravel loop, pond, benches, picnic table, hedge along the west wall |
| East garden | (47,0)-(55,25) | gravel path down to the car park |
| Car park | (47,26)-(54,33) | 12 bays in two rows, 2-tile aisle, access lane (53-54, 34-38) to the road |
| Street | (0,35)-(55,41) | sidewalks, 2-lane road (cars enter/leave at x 0 and x 55), zebra crossing at the entrance |

Upper floors have **null floor** outside the footprint; the engine draws the ground floor's outdoors beneath them.

## 3. Shared shell and core (both floors)

| element | tiles |
| --- | --- |
| Exterior walls | box (15,3)-(46,26) |
| Corridor walls | y 10 (north rooms' front) and y 13 (core's north wall) |
| Restroom W | interior (26,14)-(30,15), door (28,13): 2 stalls, vanity |
| Stairs | `stairs` at (32,14), 2 x 3, arrival spot (32,17) |
| Restroom E | interior (35,14)-(37,15), door (36,13): 1 stall, vanity |
| Lift | `elevator` at (30,17) against the lift wall (y 16), arrival spot (30,18) |
| Passages | (23-24, 13-16) and (39-40, 13-16) with glass double doors on y 13 |

Restrooms are entered from the corridor (discreet, away from reception); the lift and stairs open south onto the lobby.

## 4. Floor 1: ground floor (level 0, id `ground`)

```
x 15       25        34      41    46
y 3  +--------+--------+------+------+
y 4  |KITCHEN |SERVER  |IT    |ARCH- |
y 8  |cook line ROOM   |HELP  |IVE   |
y 9  |SERVERY D        |      |      |
y 10 |queue   +---D----+--D---+--D---+
y 11 |        D   SERVICE CORRIDOR   |
y 13 | CANTEEN+--WC--^^--WC--+dd+----+
y 14 | dining |WC W |st|WC E |  | PRINT
y 16 |        |==lift wall===|  D----+
y 17 |        |    LIFT      |  | JAN.
y 19 |        D                 D----+
y 20 |        D  ENTRANCE HALL  |
y 21 |        |       +SECUR.+  reading
y 24 |        |       D CCTV |  corner
y 26 +--------+---DD--+------+--+----+
```

| room | kind | interior | size | door(s) | contents |
| --- | --- | --- | --- | --- | --- |
| Kitchen | kitchen | (16,4)-(24,8) | 9 x 5 | (24,9) staff door | cooking line on the north wall (ranges, prep, dishwasher, fridge) |
| Servery | (canteen) | counter row y 9, x 16-22 | | | hot + salad line facing the dining room; staff stand behind (y 8), people queue in front (y 10) |
| Canteen | canteen | (16,10)-(24,25) | 9 x 16 | (25,11) corridor, (25,19)-(25,20) hall | queue lane with floor markings, trays, six 6-seat canteen tables (36 `eat` seats), dish return |
| Server room | server | (26,4)-(33,9) | 8 x 6 | (29,10) | racks against the north and side walls, UPS, cooling, internet kiosk + PC booth (`web`), QA bench (`qa`), cable trays |
| IT help | it | (35,4)-(40,9) | 6 x 6 | (37,10) | help desk (`it`), repair bench, parts shelf |
| Archive | storage | (42,4)-(45,9) | 4 x 6 | (43,10) | archive cabinets and safe (`files`) |
| Service corridor | corridor | (26,11)-(45,12) | 20 x 2 | glass (39-40,13) | clear |
| Print room | print | (42,14)-(45,16) | 4 x 3 | (41,16) | copiers and paper shelf on the north wall (`print`), shredder |
| Janitor closet | janitor | (42,18)-(45,19) | 4 x 2 | (41,19) | supply shelf and mop sink on the east wall (`clean`), vacuum; 2 x 2 clear floor |
| Entrance hall | lobby | (26,17)-(45,25) less security | | front doors (30-31,26) | entrance mat, waiting seats, plants, notice board |
| Security | security | (34,22)-(37,25) | 4 x 4 | (33,23) | glass walls to the hall, CCTV wall + desk (`cctv`) |
| Reading corner | (part of the hall) | (41,21)-(45,25) | open | | bookshelves (`read`), wingback armchairs |

**Why:** the canteen is the biggest room and the noisiest, so it takes the whole west wing with its own door to the
hall (lunch guests) and a back door to the service corridor (staff, deliveries). The kitchen sits behind the serving
line with a staff door beside it. The server room, IT help and archive share the north band off the service
corridor, so IT staff are next to their racks. The print room is one passage away from the lift, for leads printing
on their way up to a meeting. The security office sees the front door through glass.

## 5. Floor 2 (level 1, id `upper`)

```
x 15       23      30        39      46
y 3  +-------+------+---------+------+
y 4  |TEAM 1 |TEAM 2|BOARDROOM|TEAM 3|
y 9  |4 desks|3     |10 seats |4     |
y 10 +---D---+--D---+-d-glass-+--D---+
y 11 |          CORRIDOR      coffee |
y 13 +------+dd+-WC--^^--WC-+dd+-----+
y 14 |kitchen   |WC W|st|WC E|  |PRINT|
y 16 | nook     |==lift wall==|  D----+
y 17 |   bar      RECEPTION       ------+
y 19 |          reception   lift  +d-----+
y 20 +-----   open                |MEETING
y 21 |LOUNGE corner   sofa group  | 8    |
y 25 |books, foosball              |seats |
y 26 +----------------------------+------+
```

| area | kind | tiles | walls | contents |
| --- | --- | --- | --- | --- |
| Team office 1 | office | (16,4)-(22,9), door (21,10) | room | 4-desk pod, bookshelf |
| Team office 2 | office | (24,4)-(29,9), door (26,10) | room | 3 desks, cabinet, bookshelf |
| Boardroom | meeting | (31,4)-(38,9), glass door (32,10) | room, glass front | walnut 8-seater turned north-south toward the TV: 4 seats each side + 1 at the far end = 9 |
| Team office 3 | office | (40,4)-(45,9), door (43,10) | room | 4 desks |
| Corridor | corridor | (16,11)-(45,12), glass doors (23-24,13), (39-40,13) | | water cooler at the east end (45,11) |
| Print room | print | (42,14)-(45,16), door (41,16) | small room | copier, paper shelf (`print`), shredder (`shred`), supplies cabinet |
| Meeting room | meeting | (40,20)-(45,25), glass door (40,19) | room 6 x 6: solid north wall, glass west wall | white 8-seater turned north-south toward the TV on the north wall: 4 seats each side + 1 at the far end = 9, walkable ring |
| **Reception** (open) | reception | (16,14)-(45,25) less the rooms above; label (31,19) | open | see below |

The **reception** is one open area, and one `Nav` region, from wall to wall south of the corridor:

- **Lift lobby** (23-40, 14-19): reception desk (25,17) against the lift wall, waiting seats, plants either side of the lift.
- **Kitchen nook** (16-22, 14-19), open onto the west passage: counter run on the north wall (`coffee`, `snack`,
  `water`), vending, and a bar table with 4 stools (`eat`).
- **Lounge corner** (16-26, 20-25), behind a low walnut wall: bookshelf and board games on the wall, sofa group,
  foosball against the south wall.
- **Break zone along the south windows** (27-38, 20-25), open to reception: two sofa groups on rugs with a plant
  and lamp between, and a window counter (five bar tables, ten stools) along the glass.

**Why:** the team offices and the boardroom keep the quiet north band and its windows. Everything south of the
corridor is shared and open: you step out of the lift into one generous space that runs from the kitchen nook and
lounge in the west, past reception and the seating below it, to the meeting room in the east corner. Walls are kept
only where privacy or noise matters (the meeting room, the print room, restrooms). Two meeting rooms: the boardroom
(10) on the corridor and the meeting room (8) off reception. The corridor's glass doors keep the office wing calm.

## 6. Circulation and reachability

- Ground floor: street/car park → walkway y 27 → forecourt → front doors (30-31,26) → hall → lift (30,18) / stairs
  (32,17). The hall reaches the canteen (west doors), the print room, janitor closet and reading corner (east), and the
  service corridor through the glass doors (39-40,13).
- Floor 2: lift/stairs → open reception (kitchen nook, lounge, seating, meeting room, print room via the east
  passage) → corridor through the glass doors → team offices and boardroom.
- Doors are kept clear on both sides; corridors and passages hold no furniture. Every spot is reachable from the lift
  spot on its floor.

## 7. Furnishing rules (checked by the level validator)

- Company-office furniture only: no arcade, pinball or claw machines, and no café bistro sets scattered in open
  areas. Lounge seating, kitchen points, plants, bookshelves, rugs and break-area furniture are fine. The canteen is
  the place for eating.
- No wall-mounted item (windows, art, clocks, screens, boards, sconces, CCTV) may be hidden by furniture standing in
  front of it. Desks under windows face away from the window, with the chair against the wall.
- Wall-backed items stand flush against a wall; doors keep both landings clear; no sealed pockets of floor.
- No chokepoints: main walkways and desk aisles are 2 tiles wide, every stand spot has a free neighbour that is not
  another spot, and no 1-wide dead-end lane holds a spot (two people must be able to pass).
