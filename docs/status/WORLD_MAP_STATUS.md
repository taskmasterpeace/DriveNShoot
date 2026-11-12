# WORLD MAP STATUS (DSOA web)

**Branch:** `feat/web-world-map` (off `integrate/deathlands` 2b93cc0f) · **Worktree:** `.claude/worktrees/web-world-map`
**Last pass:** 2026-11-12 (pass 0: scope) · **Bus:** `alpine-swift-dsoa`

## What "the world map" means here

Press **M** in the game and you get the big map. Today it has three views, picked by where you stand:
- **Rust Haven** (the Phoenix island, 900 m across), with camps, bases, people and cars.
- **The Phoenix metro** (3.8 km), every street and building.
- **The area** (24 km round you), the interstate, its exits, the dust wall.

What it does **not** have is the country. The design (`docs/design/WEB_STREAMING.md` §3.9, §4 F13) promised a
**continental atlas**: the whole Divided States, state borders, rivers, the interstates with their nicknames, the towns,
the exits and a fog over the places you have never been. It was left for phase P4 and never built. That atlas is the job.
Our data already holds all of it (`web/src/data/usmap.json`: 48 states, 10 interstates, 59 towns, 91 exits, 6 rivers,
the biome and relief grids; `web/src/data/atlas.js`: the 50 rulers).

Out of scope (feature freeze, WEB_DEPTH_PLAN §10 row 6): stash maps, notes and shared map pins. Opening the country to
drive (the dust wall) is world-tools work, not this map.

## Checklist

| # | Item | Proof check | State |
|---|---|---|---|
| 1 | A COUNTRY view on the big map: the whole country painted once (land by biome, hill shading, the sea) | screenshot of M → COUNTRY; selftest `worldmap: the atlas paints the whole country once` | left |
| 2 | State borders, each state's name and who rules it ("ARIZONA · THE SUN COURT") | screenshot; selftest: 48 states labelled, every label has its ruler | left |
| 3 | Rivers and the 10 interstates, each with its nickname, coloured by danger | screenshot; selftest: 10 interstates drawn with nicknames | left |
| 4 | Towns and exits on the atlas; big cities always, small places only once you have been near (law 6) | screenshot before/after a drive; selftest | left |
| 5 | Fog of where you have been: a 1 km grid you uncover by travelling, saved with the game | selftest: drive → cells uncovered → save → load → still uncovered; screenshot | left |
| 6 | You are here (arrow), your waypoint, and the dust wall on the atlas | screenshot | left |
| 7 | Switching views: a tab row AREA / COUNTRY, Tab key cycles, wheel zooms, drag pans | tap every control in the running game; selftest | left |
| 8 | Click the country to set a waypoint at the right spot; right-click clears | selftest: click → waypoint world x/z matches the usmap point; tap in game | left |
| 9 | Agent command `atlas` (open, view, uncovered share, state under you) + COMMANDS regenerated | `node tools/dl.mjs atlas` output | left |
| 10 | Speed: the atlas paints once (under 250 ms) and reopening is free; no per-frame cost when closed | selftest timing | left |
| 11 | No purple anywhere on the map; IP lint 0 deny | palette check in selftest; `node tools/ip-lint.mjs` | left |
| 12 | Design doc `docs/design/WEB_WORLD_MAP.md` (8 sections) + back-reference in WEB_STREAMING §3.9 | file exists | left |
| 13 | The game's own batteries green in a foreground tab (worldmap + qol + a full selftest run) | battery output pasted below | left |
| 14 | PR into `integrate/deathlands` with an independent review PASS | PR link + review | left |

## Passes

- **Pass 0 (2026-11-12):** read the handoff, the plan and the four newer branches (storeys, holdouts, carousel, room
  scan: none of them touch the big map). Found the gap above. Wrote this checklist.
