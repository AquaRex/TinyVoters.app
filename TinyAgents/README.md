# Tiny Agents

A cozy pixel-art office life-sim. The office is the 2nd floor of a small brick building in a business park. Its staff live a whole workday:

- They drive into the car park, walk in through the front door, and step out of the elevator or come up the stairs.
- They work at their desks, grab coffee and lunch, chat, play foosball, meet, and take breaks in the park.
- In the evening they drive home.

It runs as a game first. Built-in **demo staff** keep the office alive on their own. **Claude Code sessions** join as extra coworkers: each session and each subagent becomes a person. Whether Claude is working, idle or waiting for your permission decides what that person does.

All art is drawn in code (`src/art/`). `AssetPacks/` was used as inspiration only and never ships.

## Run it

```sh
npm install
npm run dev            # http://localhost:5173
```

Live at **https://tinyvoters.app/tinyagents/**. This folder lives inside the `TinyVoters.app` repo as
`TinyAgents/`; that repo's Pages workflow builds it on every push to `main`.

### Connect Claude Code

1. Run [supabase/tinyagents.sql](supabase/tinyagents.sql) once in the Supabase SQL Editor.
2. On the site, tap the status pill, then **Create my office**.
3. **Add a computer**: paste the setup prompt into Claude Code on each computer, once.
4. **Add a device**: pair your phone with a 6-letter code.

Details, privacy and limits: [docs/CLAUDE_INTEGRATION.md](docs/CLAUDE_INTEGRATION.md).

Helpers: `npm run install-hooks -- <computer key>` connects a computer from the command line (`--remove` undoes
it); `npm run simulate -- <computer key>` posts fake sessions for testing.

## Controls

- Drag or WASD to pan, scroll to zoom. Click a person to see their needs and activity and change their look.
- **Demo staff**: toggles the simulated colleagues.
- **Clock / Day**: follows your local time (with day, dusk and night lighting) or keeps a sunny afternoon. `?time=21` forces an hour.
- **Edit office** (`E`):
  - Place any asset.
  - Move it, rotate it (`R`), swap it for a look-alike, or delete it.
  - Paint floors and draw walls.
- `?level=sandbox` loads the small test level.

## How Claude maps to the game

Full scope (data, states, privacy, limits): [docs/CLAUDE_INTEGRATION.md](docs/CLAUDE_INTEGRATION.md).

| Claude | In the office |
| --- | --- |
| Session starts | A coworker drives in (subagents arrive by elevator and sit near their lead) |
| Working (`UserPromptSubmit`, `PreToolUse`) | Sits at their desk and types; the current tool shows in their status |
| Permission prompt | Stands by the desk, waves or phones, shows a "need you!" bubble |
| Idle (`Stop`) | Free time driven by their needs and personality |
| Session ends | Elevator down, out the front door, drives home |

## Project layout

```
docs/          ART_BIBLE.md, ENGINE_CONTRACT.md, ASSET_MANIFEST.md, ARCHITECTURE_PLAN.md, references/
src/art/       pixel kit + every asset, floor and wall style (registered in registry.ts)
src/world/     office grid, layout, levels/hq.ts (default level), levels/sandbox.ts
src/render/    renderer, thin cutaway walls, floor chunks, day/night lighting, characters
src/agents/    director, needs, personalities, social life, travel (cars, front door, lift, stairs), demo staff
src/ui/        editor, roster, agent panel
supabase/      tinyagents.sql: the whole backend (schema tinyagents + tiny_* functions)
server/        hook installer, session simulator
gallery.html   every asset at 1x/3x; also workPreview, livingPreview, outdoorPreview, tiles, characters pages
```
