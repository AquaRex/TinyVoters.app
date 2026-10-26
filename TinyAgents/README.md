# Tiny Agents

A cozy pixel-art office life-sim. The office is a small brick building with real floors: the ground floor holds
the entrance, the canteen and the services, the floor above the team offices and meeting rooms, and you can
build more floors on top. Its staff live a whole workday:

- They drive into the car park, walk in through the front door, and take the lift or the stairs up to their floor.
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

1. Run the **hub** on the computer that runs Claude Code: see [hub/README.md](hub/README.md) (`npm run hub`, or
   `npm run hub:autostart` to start it with Windows). It also runs the staff's minds.
2. Connect that computer's Claude Code once: `npm run install-hooks -- <computer key>` (see hub/README.md).
3. Other devices: Connect → enter the **office code** shown under Connect on the hub's computer.

Details, privacy and limits: [docs/CLAUDE_INTEGRATION.md](docs/CLAUDE_INTEGRATION.md).

**Connect** also has some optional extras:
- **Visitor link**: a read-only `?visit=` link that shows only who's busy or waiting.
- **Away mode**: approve or deny permission requests from any paired device. Off by default, and needs the
  approvals hook on each computer.

The hub also keeps stats, careers, the day replay log and your customized people. The integration
doc covers what's stored, how long it's kept, the setup steps and the approval security model.

Helpers: `npm run install-hooks -- <computer key>` connects a computer from the command line (`--approvals` also
adds the away-mode approvals hook, `--remove` undoes it); `npm run simulate -- <computer key>` posts fake sessions for testing.

## Controls

- Drag or WASD to pan. Scroll, pinch, `+`/`-` or the on-screen buttons zoom, from the whole map down to close-ups. Click a person to see their needs and activity and change their look.
- **Demo staff**: toggles the simulated colleagues.
- **Clock / Day**: follows your local time (with day, dusk and night lighting) or keeps a sunny afternoon. `?time=21` forces an hour.
- **Floors**: the elevator panel shows the building's floors (lit while someone there works, blinking while someone
  waits for you). Pick one to look at it; **+ Add floor** builds a new storey on top with the shell of the floor
  below (walls, lift and stairs), ready to furnish. An added top floor can be removed while nobody is on it.
- **Edit office** (`E`): edits the floor on screen.
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
hub/           the background app: Claude Code events, the office's data, live updates, the staff's minds (Ollama)
src/mind/      the staff's minds: thinking, speaking and acting with one shared state (brain.ts), hub client (engine.ts)
supabase/      remove-tinyagents.sql: removes the former Supabase backend from the wiki's project
server/        hook installer, away-mode approvals hook (tinyagents-approve.mjs), session simulator
gallery.html   every asset at 1x/3x; also workPreview, livingPreview, outdoorPreview, tiles, characters pages
```
