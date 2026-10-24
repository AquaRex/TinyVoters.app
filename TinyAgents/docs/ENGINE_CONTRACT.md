# Tiny Agents: Engine Contract and Team Rules

This is the source of truth for how the pieces fit. Read it fully, along with `docs/ART_BIBLE.md` (style) and
`docs/ASSET_MANIFEST.md` (the asset list). Types live in `src/art/types.ts`, and the registry in
`src/art/registry.ts`. Changing those two files means coordinating with the lead (the main session).
Additive optional fields are fine; list them in your final report.

**Game first, Claude second.** Tiny Agents must look and behave like a cozy management/life-sim game. Claude
Code sessions decide *who* is in the office and *whether they are working*. Everything else (routines,
needs, conversations, animation, pathing) is game logic that must feel alive with zero Claude sessions too
(built-in demo staff).

## Team and file ownership

Only edit files you own. If you need a change elsewhere, describe it precisely in your final report.
Never run git commands.

| Role | Owns |
| --- | --- |
| Lead (main session) | `docs/ART_BIBLE.md`, `docs/ENGINE_CONTRACT.md`, `docs/ASSET_MANIFEST.md`, `src/art/types.ts`, `src/art/registry.ts` |
| Art lead | `src/art/kit/**`, `gallery.html`, `src/gallery.ts` |
| Tileset artist | `src/art/floors.ts`, `src/art/walls.ts`, `src/art/structure.ts` |
| Furniture artist: work | `src/art/work.ts`, `src/art/meeting.ts` |
| Furniture artist: living | `src/art/lounge.ts`, `src/art/kitchen.ts`, `src/art/restroom.ts`, `src/art/decor.ts` |
| Exterior artist | `src/art/outdoor.ts`, `src/art/vehicles.ts` |
| Character artist | `src/render/characters.ts`, `src/agents/appearance.ts` |
| Architect | `docs/ARCHITECTURE_PLAN.md` |
| Level designer | `src/world/levels/hq.ts` |
| Engine programmer | `src/config.ts`, `src/main.ts`, `src/world/**` (except `levels/hq.ts`), `src/render/**` (except `characters.ts`), `src/ui/editor.ts`, `src/art/index.ts`, `index.html`, `src/style.css`, `src/assets/**` (to delete), `tools/**`, `public/**` |
| AI / gameplay programmer | `src/agents/**` (except `appearance.ts`), `src/bridge/**`, `src/ui/roster.ts`, `src/ui/agentPanel.ts`, `server/**` |

The art lead seeds a few exemplar assets in `work.ts` and `lounge.ts`. When the furniture artists start,
those files become theirs, and they may refine the exemplars.

`src/art/index.ts` imports every art file so their `defineAsset` / `defineFloor` / `defineWallStyle` calls run.
All art files already exist as stubs; fill them in.

## Constants (`src/config.ts`)

| Name | Value | Meaning |
| --- | --- | --- |
| `TILE` | 32 | tile size in px |
| `FOOT_Y` | 26 | an agent standing on a tile has its foot point at (tile x + 16, tile y + 26) |
| `WALL_LINE` | 8 | thickness of a horizontal wall's cap line (see Walls below) |
| `WALL_FACE_H` | 40 | height of a wall face in px |
| `ZOOM_LEVELS` | `[1, 2, 3, 4]` | integer zoom only (pixel-perfect) |

Characters: frame 32 × 48, foot point at frame (16, 45). Exported from `src/render/characters.ts` as
`CHAR_W`, `CHAR_H`, `CHAR_FOOT_X`, `CHAR_FOOT_Y`.

## Depth sorting

Everything that stands (object parts, wall tiles, agents, cars) sorts by a world-y key, and larger keys draw later:
- object part key = `item.y * TILE + part.z`
- agent key = the agent's foot y (`tile.y * TILE + FOOT_Y + spot.py` when seated)
- wall tile key = the wall line's south edge in world px
- surface items draw right after their host

So a chair whose back faces the viewer (sitter faces 'up') puts its backrest in a part with
`z` greater than the seated foot y, and the backrest covers the sitter's lower back. A desk the sitter
faces 'up' toward (desk north of the chair) has its z at the desk's south edge, below the sitter's
foot y, so the sitter draws over the desk front. Artists control layering entirely through part `z`.

## Walls (cutaway walls that fill their tile)

Wall tiles hold a wall style id. Walls fill their tile, so furniture in the next tile stands flush against them:
- a horizontal wall is a `WALL_LINE`-thick line on the tile's **south edge**, with a cap (style `cap` colours) raised
  by `WALL_FACE_H`; wherever its south side is open floor (or empty, on an upper floor's outside edge) a face hangs
  from the cap down to the floor line and covers the whole wall tile. The face is painted by the style's `faceSlice`
- a vertical run is a **full tile wide** and shows only its cap; its bottom tile shows a face where the run ends

Assets tagged `placement: 'wall'` keep their back edge on the footprint's back edge, so placed in the tile next to a
wall they touch it. The engine adds floor ambient occlusion along wall bases. Walls near agents fade to about 40% so
people behind them stay visible. Wall-layer assets (art, TVs, sconces, windows) hang on visible faces.

## The building: real floors

The building has real storeys (`Building` in `src/world/layout.ts`; default from `hqBuilding()` in
`src/world/levels/hq.ts`). Each floor has its own layout, `Office` and `Director`; level 0 is the ground floor and
holds the outdoors (street, car park, park). Upper floors are drawn over the ground floor so the outdoors stays
visible around the building. The lift and stairs sit at the same tiles on every floor.

People arrive by car (or walk in from the street), walk through the ground floor's front doors, and take the lift or
stairs to their home floor; leaving is the reverse. Cross-floor trips (lunch in the canteen, the server room…) use
the director's `spotsAnywhere` / `routeTo` / `visit` (see the `Director` doc comment). Rooms are labelled per floor
in `Layout.rooms` (`RoomLabel`: kind, name, an inside tile).

## Office API (`src/world/office.ts`, engine programmer)

```ts
office.w / office.h
office.floorAt(x, y): string | null      // floor id
office.wallAt(x, y): string | null       // wall style id
office.isOutdoor(x, y): boolean
office.walkable(x, y): boolean
office.drivable(x, y): boolean
office.spots: SpotRef[]
office.spotsFor(activity: Activity): SpotRef[]   // 'seat' already resolved to work/meeting/social/eat
office.findPath(sx, sy, gx, gy): [x, y][] | null // 4-dir A*, goal always enterable, seats cost more
office.findRoadPath(sx, sy, gx, gy)              // over drivable tiles
office.roadEntrances(): [x, y][]                 // drivable tiles on the map border
office.randomIndoorTile(rand): [x, y]
office.nearestWalkable(x, y): [x, y]
office.onChange(fn)                              // layout edited
Office.footPoint(tx, ty): [px, py]               // (tx*TILE+16, ty*TILE+FOOT_Y)

interface SpotRef extends Spot { activity: Activity; key: string; item: PlacedItem; x: number; y: number }
```

Seat resolution: a spot with activity `seat` looks at the tile it faces:
- `desk.*` → `work`
- `table.meeting.*` → `meeting`
- `table.dining.*` / `table.bar.*` / `table.picnic.*` → `eat`
- anything else (sofas, armchairs, café tables) → `social`

Layout (`src/world/layout.ts`):
```ts
interface PlacedItem { uid: number; type: string /* asset id */; x: number; y: number; dir: Dir }
interface Layout { w: number; h: number; floor: (string | null)[]; walls: (string | null)[]; items: PlacedItem[] }
```
The default level is `hqLayout()` from `src/world/levels/hq.ts`.

## Agents (AI programmer) and the renderer (engine programmer)

The renderer reads only this from an agent:
```ts
agent.x, agent.y        // foot point in world px
agent.alpha             // 0..1 (fading in/out at doors)
agent.seated            // no floor shadow when true
agent.bubble            // { text: string; icon?: string; t: number } | null  (speech bubble)
agent.anim              // seconds, for UI bobbing
agent.name, agent.profession.{title, badge}, agent.statusText, agent.info.waiting
agent.currentFrame(): HTMLCanvasElement   // 32x48
agent.spriteOrigin(): [x, y]              // top-left of the frame in world px
agent.hitTest(wx, wy): boolean
```
The director exposes:
```ts
director.agents: Agent[]
director.cars: Iterable<CarView>    // { x, y (centre px), dir: Dir, alpha, assetId }
director.liftOpen(itemUid): number  // elevator door openness 0..1
director.update(dt), director.sync(infos)
```
The renderer opens ordinary `door: true` assets by itself when an agent is within one tile of them.

Moving cars are drawn with `variant(assetId, dir).frames[0]` and drive on tile centres along axis-aligned
paths. Pixel art is never rotated.

## Gallery and screenshots

- `http://localhost:5173/gallery.html` shows every registered asset (all facings, 1× and 3×), floor
  swatches as 6 × 4 patches, wall styles, and a character sheet. Query params filter it, e.g.
  `?category=Lounge`, `?id=sofa.2.sage`, `?zoom=3`, `?section=floors|walls|characters`.
- `node tools/shoot.mjs <url> <out.png> [--wait ms] [--eval "js"] [--size 1600x1000]` takes a headless
  Chrome screenshot (the dev server must be running; it usually is, on port 5173). Put your screenshots in
  your own folder under the scratchpad path you were given. **Look at your screenshots** with the Read
  tool, and iterate until the result is genuinely good.
- `npx tsc --noEmit` must pass for your files. Ignore errors in files you don't own, since others are mid-edit.

## Quality bar

Compare your work with `docs/references/*.png`. If a piece looks pasted-in, flat, noisy, over-outlined,
oddly scaled or out of palette, it isn't done. Prefer fewer, excellent assets over many mediocre ones,
but every id in the manifest assigned to you must exist.
