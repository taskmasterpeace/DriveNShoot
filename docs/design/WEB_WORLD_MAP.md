# WEB_WORLD_MAP — the big map's COUNTRY view and the fog of where you have been

**Status:** built 2026-11-12 on `feat/web-world-map` (off `integrate/deathlands`). **Code:** `web/src/ui/atlas.js` (the sheet,
the fog), `web/src/ui/qol.js` (the big map: views, input, the title), `web/src/agent/worldmap-api.js` (the `atlas` command, the
checks). **Spec it finishes:** `WEB_STREAMING.md` §3.9 "Big map, three levels" and §4 F13 (the atlas scale, the discovery grid).
**Status page:** `docs/status/WORLD_MAP_STATUS.md`.

## 1. Overview

Press **M** for the big map. It has two views, switched with the **AREA / COUNTRY** tabs or **Tab**:

- **AREA** (as before): Rust Haven's island, the Phoenix metro, or the 24 km round you, picked by where you stand.
- **COUNTRY** (new): the whole Divided States on one wide sheet. The land by biome with hill shading and the sea; the state
  lines with each state's name and **who rules it**; the six rivers; the ten interstates coloured by danger, with a key of their
  nicknames; the 33 cities; the dust wall and the streamed regions past it (Florida); you, your husk, your waypoint; and a
  **fog** over every square kilometre you have never been near. Holdouts, exits and military bases show only where the fog is
  gone.

The map's title now names the state you stand in and its ruler (it said "ARIZONA · THE SUN COURT" everywhere before).

## 2. Player Fantasy

*A road atlas found in a dead glovebox: the country as it was printed, with the new owners written over each state in pencil.
The cities are where they always were. Everything between them is fog until you drive it, and the map remembers every mile.*

| If you love… | You should feel… |
|---|---|
| GTA's pause map | one key, the whole country, a click puts a waypoint anywhere |
| Fallout's Pip-Boy map | the blank spaces fill in as you travel, and stay filled |
| the old road atlases | interstates with names, a sense of how far Miami really is from here |

## 3. Detailed Rules

1. **The sheet** is painted once per session from `usmap.json`: 150 × 85 grid cells at 6 px each (900 × 510), biome colours
   blended between cell centres, hill shading from the relief grid lit from the north-west, a little grain. State lines are
   segments between land cells of different states. It is the same wash the World Forge paints (`forge/mapview.js`), owned
   here so the game does not load the forge.
2. **The view** is a wide canvas, 1216 × 690 (the country's own shape). Zoom 1 fits the country's width; the wheel zooms 1-8
   about the cursor; a drag pans; the view may run 2.5 km of usmap past the sheet (Florida's tip lies past its last row).
3. **A click** (no drag) sets the waypoint at that point in world metres; a right-click clears it. A drag is never a click.
4. **Labels never print over labels.** They are placed in order: cities (right of the dot, else left, above, below), state
   names (nudged up or down off a city), rulers under their state, interstate nicknames beside their shields, then local
   places. A label that would cover an earlier one, a city dot, or you, is left off; zooming in makes room. At zoom 1 a small
   state shows its postal code, and the interstates' nicknames are in the key (bottom-left, in the Pacific).
5. **What everyone knows** (printed): the land, the sea, the rivers, the state lines, the rulers (law 6 holds: who holds a
   state is the first thing any traveller is told), the interstates and their nicknames, the 33 cities.
6. **What you have to go and see** (law 6): the 26 holdouts, the 91 exits and the 48 military bases appear only in uncovered
   cells. Nothing is revealed by a dialogue or a rumour yet (§6).
7. **The fog** is a grid of 1 km world cells over the usmap box (390 × 221). Every 0.5 s of play, if you have moved a quarter
   cell since the last lift, every cell whose centre is within 1.6 km (+ half a cell) of you is uncovered. Paused (the map,
   the menu) never uncovers.
8. **Saved** as runs of uncovered cells (`atlas: { v, w, h, cellW, runs: [start, length, ...] }` in the save). A save from a
   different grid is refused, never misread; a save without it keeps what this session has seen.
9. **No purple.** Interstates are sand (quiet), orange (risky) and red (deadly); rivers are a slate blue; the fog is a warm
   near-black.

## 4. Formulas (with example)

```
s (px per usmap m)  = 1216 / 75,000 · zoom                world m across = 1216 / s · K        (K = 5.2)
fog cell            = floor((x - x0) / 1000), x0 = (-60,000 - PHX.x) · K = -87,100 m
uncovered cells     ≈ π · (1.6 + 0.5)² ≈ 14 per stop; a straight drive of L km uncovers ≈ 4.2 · L + 14
```
- **Example.** At zoom 1 the canvas is 390 km of world across and one pixel is 321 m: a click lands inside the 1 km cell you
  meant. At zoom 8 it is 49 km across. The 60 s flat-out drive east out of Phoenix (`stream-drive` gate, 2,588 m) uncovered
  42 cells with the start: 14 at the start, about 25 along the road.

## 5. Edge Cases

- **Standing in the sea of the coarse grid** (Meridian's coast is finer than a 500 m cell): the sheet shows you just offshore;
  the AREA view shows the real coast.
- **A waypoint past the dust wall:** it is set and drawn with its straight-line distance; the GPS line finds no route.
- **Miami, the Keys road:** past the sheet's last row; the view runs 2.5 km past the sheet so they stay reachable.
- **A town row with an epithet** ("CHICAGO, a dash, a nickname", one mis-decoded by the Godot import): the sheet prints the city.
- **The page reloads** (a dev edit): the fog comes back with the next load of a save; an unsaved session's fog is lost, like
  everything else unsaved.

## 6. Dependencies (both ways)

- **Reads:** `data/usmap.json` (grid, relief, states, interstates, rivers, towns, exits), `data/atlas.js` (`RULERS`,
  `ATLAS_BASES`, `ATLAS_XZ`), `data/streaming.js` (K, PHX, the dust wall), `world/geo.js`, the streamer's regions, the travel
  network's and your husk's map layers (`systems/travel.js`, `systems/clone.js`).
- **Read by:** the save (`agent/api.js` snapshot/restore), the `atlas` command.
- **Next (not built):** "nobody knows what they weren't told" both ways: a pull, a bar's gossip or a found road map could
  uncover a place without going (WEB_DEPTH_PLAN §10 row 6, stash maps and shared map pins, is Version 2).

## 7. Tuning Knobs (safe ranges)

| Knob (`ATLAS` in ui/atlas.js) | Default | Range | What it does |
|---|---|---|---|
| `cellW` | 1000 m | 500-2000 | fog cell (F13); halving it quadruples the save's worst case |
| `uncoverM` | 1600 m | 800-3000 | how far you see round you |
| `uncoverS` | 0.5 s | 0.25-2 | how often the fog is checked |
| `P` | 6 px | 4-10 | sheet pixels per grid cell (paint time grows with the square) |
| `maxZoom` | 8 | 4-12 | how close the COUNTRY view goes before AREA is the better map |
| `pad` | 2500 usmap m | 0-5000 | how far the view may run past the sheet |

## 8. Acceptance Criteria (each a selftest check — `selftest only=worldmap`)

1. The atlas paints the whole country once (48 states, 59 towns, 10 interstates, 6 rivers) in under 250 ms (measured 47 ms).
2. Every state on the sheet has its ruler, and the map title names yours.
3. COUNTRY prints the states, the rulers, the cities and the key of nicknames, with no label over another.
4. The fog lifts where you go, only there, and comes back from a save (a save from another grid is refused).
5. Holdouts, exits and bases show only where you have been; cities always.
6. Tab and the AREA/COUNTRY tabs switch the view; the wheel zooms about the cursor; a drag pans and is not a click.
7. A click on the country sets the waypoint there (El Paso within a cell); a right-click clears it.
8. No purple anywhere on the sheet (hue 270-320).
9. The fog costs nothing while you stand still with the map closed (10,000 updates under 5 ms).
10. The `atlas` command reports the sheet, the state you are in and what you have seen.
