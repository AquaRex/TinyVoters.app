# Tiny Agents: Art Bible

Every sprite, tile and character in Tiny Agents is **drawn in code** (TypeScript, pixel by pixel through the
shared kit in `src/art/kit/`) and must follow this document. The goal is one coherent, cozy, artistically
driven world, not a collage. When in doubt, look at the references in `docs/references/` (cozy top-down pixel
offices and villages, warm light, readable silhouettes).

`AssetPacks/` contains purchased tilesets. They are **inspiration only**: look at them for ideas (what
furniture exists, proportions, how a 3/4 desk is staged), but never copy, trace or sample their pixels.
Nothing from `AssetPacks/` ships.

## 1. Scale and projection

- **Tile = 32 × 32 px.** 1 art pixel = 1 world pixel. No sprite is ever scaled. The camera zooms the whole
  scene by integer factors only.
- **Projection: top-down 3/4** (RPG Maker / Stardew). We see the tops of things and their south (front)
  faces. Height is drawn upward from the footprint. A 1-tile-high object (desk) draws its top surface
  plus a ~10–14 px front face.
- **Light comes from the top-left.** Top faces lightest, left edges catch a highlight, right and bottom
  edges darker, front faces mid-tone.
- Reference heights (px above the floor line at the footprint's south edge):
  person 42–44 · desk 22–26 · office chair back 22 · sofa back 20 · armchair 22 · bookshelf 60 ·
  fridge 60 · water cooler 46 · floor lamp 52 · small plant 22 · tall plant 50 · tree 110–140 ·
  street lamp 70 · car (top-down) 30 × 58.

## 2. Palette

Use these ramps (dark → light). Do not invent ad-hoc colours; if a ramp is missing, add it to
`src/art/kit/palette.ts` following the same rules (5–7 steps, hue-shifted: shadows lean
blue/purple, highlights lean yellow).

| Ramp | Colours |
| --- | --- |
| ink (rare; deepest outline) | `#1f1a24` |
| cream (walls, fabric) | `#3b3230 #5e504a #8a7a6e #b7a796 #d9cbb6 #efe4d0 #fbf5e9` |
| steel (metal, concrete) | `#262a33 #3c414d #5a6070 #7d8494 #a3a9b5 #c9cdd5 #eceef1` |
| oak (light wood) | `#3d2618 #5e3a22 #80522f #a36d3f #c48d57 #ddb07a #efd3a4` |
| walnut (dark wood) | `#24160f #3a2419 #553425 #714734 #8e5d43 #ad7a58` |
| teal carpet | `#1d3536 #284a4b #346061 #447774 #5b8f88` |
| slate carpet | `#20283a #2c374f #3b4966 #4f5f80 #6a7a98` |
| warm-grey carpet | `#33302e #45403d #5a544f #706962 #8a8279` |
| sage fabric | `#26362a #36503b #4c6b4f #668868 #87a684 #adc6a5` |
| mustard | `#4f3810 #7d5a1d #a97e2c #cfa244 #e9c46f` |
| terracotta | `#42201a #692f20 #8f442b #b65e3b #d4835c #e9ab86` |
| leather | `#33201a #4f3123 #6f4630 #915f41 #b07c58` |
| navy fabric | `#1c2236 #283252 #36456e #4b5d8c #6b7fab` |
| plant green | `#112a1c #1a4127 #255b30 #3a7a37 #5b9a3f #86b84e #b5d36a` |
| grass | `#2a4a24 #38602c #4a7a34 #5e933c #79ab47 #9cc45a` |
| dirt / path | `#4f3825 #6b4c31 #8a6a45 #a8875c #c4a679` |
| paving stone | `#3f4046 #55565c #6f6f72 #8c8a86 #aaa69d #c6c1b5` |
| asphalt | `#222328 #2c2e34 #383a41 #464951` · markings `#e6e0cc` `#d6b048` |
| water | `#1b3352 #234d74 #2f6c96 #4b93b6 #7cbcd2 #b7e0ea` |
| skin A | `#6e4433 #b9806a #e3b096 #f7d4bd` |
| skin B | `#5a3424 #9c6847 #c98e68 #e5b48d` |
| skin C | `#2e1a14 #5a3424 #81503a #a9704f` |
| accents | red `#a8443a #c95d4c` · blue `#2f557f #3d6a9a #5b8cc0` · yellow `#c9962a #e3b341` |
| glass | tint `#9fc3cf` @ 45–60% alpha, glint `#e3f2f5` opaque |
| light | warm `#ffd98a #ffb85c` · screen `#7fd0e8 #bfe9f4` |

## 3. Rendering rules

1. **Hard pixels.** Every pixel is fully opaque, except: soft shadows, glass, light glows (engine), and
   intentional transparency like smoke. No anti-aliased edges, no blurred art, no semi-transparent
   fringes, ever. (That fringe is exactly what made the cut-out pack assets look wrong.)
2. **Selective outlines (sel-out).** Outline the silhouette with the **darkest step of the object's own
   ramp**, not black. On lit (top/left) edges the outline may lift one step lighter. Interior lines only
   where planes meet (top surface vs front face, cushion seams, drawer gaps). `ink` only for tiny,
   very dark details.
3. **Three or four tones per material**: shadow, base, light, plus an occasional highlight pixel.
   Top faces are the light tone, front faces the base, undersides and recesses the shadow.
4. **No pillow shading, no noise spam.** Pixel clusters ≥ 2 px. Texture (wood grain, carpet weave) is
   sparse and aligned, about one detail stroke per 6–10 px.
5. **Contact shadows.** Every standing object declares a shadow: a soft, flat ellipse or rounded rect
   under its base in `rgba(24,16,28,0.26)`, shifted 2 px right and 1 px down. The engine draws shadows
   on the floor layer, so never bake shadows into the sprite.
6. **One focal detail** per small object (a mug on a desk, a sticky note, a book). Do not over-clutter.
7. **Hue shift.** Shadows cooler, highlights warmer. Greens go blue-green in shadow and yellow-green in light.
8. **Readable at zoom 1.** Silhouettes first; check every asset at 1× and 3×.
9. **Cozy, not sterile.** Warm woods, soft fabrics, plants, warm lamp light in social zones; cooler
   neutral light in work rooms; daylight outside.

## 4. Materials and where they belong

| Space | Floor | Walls | Light |
| --- | --- | --- | --- |
| Offices and focus rooms | carpet tiles (teal / slate / warm-grey) | cream paint, oak baseboard | neutral |
| Meeting rooms | carpet (slate) + rug under the table | glass partition to the corridor | neutral, screen glow |
| Lounge / social zones | oak or walnut planks + rugs | cream with an accent wall (sage or terracotta) | warm lamps |
| Kitchenette | warm tile or planks | cream; counter splashback tile | warm pendant / under-cabinet glow |
| Reception / elevator lobby | warm terrazzo or planks + entrance mat | accent wall with signage | warm |
| Restrooms | small cool tile | white tile wainscot | neutral |
| Corridors | runner carpet or planks | cream | neutral |
| Outside | grass with variation, paths, paving, asphalt | brick / render façade | daylight, street lamps |

## 5. Floors must not look tiled

Floors are drawn per tile with **deterministic variation** (`hash(x, y)`):
- Planks run across tile boundaries with staggered seams and varying plank lengths (2–5 tiles).
- Carpet tiles alternate weave direction subtly, and every few tiles shift a shade.
- Grass has low-frequency patches (2–3 shades over 3–6 tile blobs), sparse blades, rare flowers or clover.
- Rooms get a 1–2 px darker edge where the floor meets walls (ambient occlusion), drawn by the engine
  from the wall layout.
No visible 1-tile repeat should be noticeable at zoom 1.

## 6. Characters

- Frame 32 × 48, figure about 18 px wide, about 42 px tall, foot point at frame (16, 45).
- Chibi-leaning but not toy-like. The head is about 15 px tall, with simple eyes (2 × 2 to 2 × 3 with a
  1 px shine) and an optional 1–2 px mouth.
- Same rules: sel-out, 3-tone ramps, hue shift. Clothes use the fabric ramps above.
- Directions: down, up, left, right (right is the mirror of left, unless asymmetric details demand otherwise).
- Animations: walk (6 frames), idle (breathing + blink), sit, sit-type, sit-talk, stand-talk (gesture),
  drink (stand and sit), carry-mug walk, wave, phone, read (standing at a shelf).

## 7. Workflow

- Each asset's code lives in `src/art/<area>/<file>.ts` and registers through `src/art/registry.ts`.
- Preview everything in the asset gallery (`/gallery.html`, see ENGINE_CONTRACT.md). Screenshot it at
  1× and 3× and **look at it** before calling an asset done. Compare against the references.
- An asset is done when it reads at 1×, matches the palette and lighting, has no stray or semi-transparent
  pixels, declares its footprint, mask, spots and shadow, and sits naturally next to its neighbours.

## 8. Kit usage

Everything comes from `src/art/kit` (`import { ... } from './kit'`). Exemplars to copy from:
`work.ts` (`chair.office.charcoal`, `desk.oak.monitor`), `lounge.ts` (`sofa.2.sage`), `decor.ts`
(`plant.tall.fiddle`), `floors.ts`, `walls.ts`. Check every asset in `/gallery.html?id=<id>&zoom=4` and in
`/gallery.html?section=scene` (assets placed together, seated mannequins, engine depth sorting).

**The recipe**
1. Colours: `mat(ramp, shift?)` gives `{ line, lineLit, deep, dark, base, light, hi }` from any ramp in
   `palette.ts` (`mat(oak)`, `mat(oak, 1)` for a deeper wood). Use those names, never hex literals. For very
   subtle floor/wall tones, `mix(a, b, t)` two neighbouring steps of one ramp.
2. Draw in **footprint coordinates**: (0, 0) is the footprint's top-left, the footprint spans
   `w*32 × h*32`, tall things go to negative y. `area(wTiles, hTiles, up)` gives the drawing bounds.
3. Forms: `box` (top face + front face, lit lip, outline), `cushion` (soft rounded block), `cylinder`,
   `pot`, `leg`, `drawers`, `screen`, `leaf` / `foliage`, `grain`, `weave`, `dither`, `vgradient`, and
   `paintShape` for any custom silhouette. Coordinates are what you see: `box(p, x, y, w, d, h, m)` draws a
   top face `w × d` at (x, y) and a front face `h` tall under it. Light is top-left; the primitives already
   shade for it. Organic shapes (leaves, people): draw flat-shaded, then `selOut(p.canvas)`.
4. Layering: `layered(bounds, (L) => { ... })` — `L(z)` returns a pen for the part with depth key `z`.
   Everything behind a seated agent goes in `L(24)`; anything in front of them (a backrest seen from
   behind, a sofa arm on the near side) in `L(31)` (or `L(63)` on the second row of a 1×2). Fixtures use one
   part at their south edge: `L(h * 32)`.
5. Wrap up with `makeVariant({ w, h, mask, spots, parts, shadows, lights })`, `seat(facing, dx, dy, px)`,
   `stand(dx, dy, facing, activity)`, `shadow(x, y, w, h, 'ellipse' | 'rect')` (base rect; the 2 px / 1 px
   offset is applied for you), `warmLight` / `screenLight`. Build `right` with `mirrorVariant(left)`.
6. Seats: a seated agent's foot point is the tile's foot point (16, 26) + spot `px/py`; their hips rest
   `SEAT_HIP` (8) px above it, so a seat's front edge sits at about y = 18 in its tile.

**Worked example: a 1×1 seat (armchair) and a 2×1 fixture with a front spot**

```ts
import { defineAsset } from './registry';
import { Dir } from './types';
import { area, box, cushion, drawers, layered, makeVariant, mat, mirrorVariant, mustard, oak, seat, shadow, stand, steel, walnut } from './kit';

defineAsset({
  id: 'armchair.mustard', name: 'Armchair (mustard)', group: 'armchair', category: 'Lounge', layer: 'object',
  facings: ['down', 'up', 'left', 'right'],
  build(facing: Dir) {
    if (facing === 'right') {
      return mirrorVariant(this.build('left'));
    }
    const f = mat(mustard);
    const parts = layered(area(1, 1, 24), (L) => {
      const back = facing === 'up' ? L(31) : L(24);       // backrest in front of the sitter only when facing up
      const seatPen = L(24);
      if (facing === 'down') {
        cushion(back, 3, -6, 26, 4, 14, mat(mustard, 1), 3);
      }
      if (facing === 'left') {
        cushion(back, 22, -4, 8, 22, 10, mat(mustard, 1), 3);  // back along the east edge, seen edge-on
      }
      cushion(seatPen, 6, 8, 20, 10, 6, f);                 // seat: top 10 px, front 6 px, front edge ~y 18
      cushion(seatPen, 1, 2, 6, 6, 22, f, 3);               // arms
      cushion(seatPen, 25, 2, 6, 6, 22, f, 3);
      if (facing === 'up') {
        cushion(back, 2, 6, 28, 4, 20, mat(mustard, 1), 3);
      }
    });
    return makeVariant({ w: 1, h: 1, mask: ['s'], spots: [seat(facing)], parts, shadows: [shadow(2, 22, 28, 9, 'rect')] });
  },
});

defineAsset({
  id: 'counter.example', name: 'Counter', group: 'counter', category: 'Kitchen', layer: 'object', facings: ['down'],
  build() {
    const wood = mat(oak, 1);
    const parts = layered(area(2, 1, 16), (L) => {
      const p = L(32);                                      // one part, depth key at the south edge
      box(p, 0, 2, 64, 10, 20, wood);                       // worktop 10 px deep, cupboard front 20 px
      drawers(p, 3, 14, 58, 16, 2, mat(walnut), mat(steel).light);
    });
    return makeVariant({
      w: 2, h: 1, parts,                                    // mask defaults to all '#'
      spots: [stand(0, 1, 'up', 'coffee', 8)],              // the tile in front, facing the counter
      shadows: [shadow(0, 26, 64, 6, 'rect')],
    });
  },
});
```

Rules of thumb: one focal detail per object (a mug, a throw pillow); outlines come from the material's own
ramp; texture strokes are sparse (`grain`, `weave`), never noise; never bake shadows or glows into sprites;
the gallery flags any semi-transparent pixel in red.
