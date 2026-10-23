---
name: dsoa-content
description: Use when adding or changing content in the DIVIDED STATES OF AMERICA web game - a place, a building, a road, a river, a forest, an animal, an infected kind, a faction, a person, an item, a weapon, a vehicle, a dialogue line, a base, an underground level - or when using THE WORLD FORGE (web/forge.html). Says which layer and which rows file each thing lives in, the generator that reads them, the validator and the check to add.
---

# Adding content to DSOA: rows first, code last

The world is a stack of seeded layers (`docs/design/WEB_WORLD_EDITOR_PLAN.md`). A chunk is a pure function of the
rows, the seed and the layers below, so content added as rows streams, saves and hashes for free. Add a ROW before
writing code; write code only when no generator can express it.

## Where things live
| Layer | Thing | Rows | Generator / system | Forge tab |
|---|---|---|---|---|
| L0 Earth | real elevation, landcover (`?terrain=real`) | `src/data/terrain/*.bin` via `tools/terrain-bake.mjs` | `world/terrain.js` | TERRAIN |
| L0 | forest, brush, ruin, radiation density | `src/data/brush.json` | `world/brush.js` | BRUSH |
| L1 Water | rivers, washes, canals, lakes, sea | `src/data/water.js`, `src/data/water/*.json` (`tools/water-bake.mjs`, USGS NHD) | `world/rivers.js` (`depthAt` = THE water authority) | TERRAIN (planned) |
| L2 Network | interstates, roads, rails, exits, bridges | `src/data/usmap.json` (generated: `tools/import-usmap.mjs` from `game/data`), crossings planned by `rivers.plan()` | `world/worldindex.js`, `world/chunkgen.js` | MAP |
| L2 | bus/train/air lines, poles, knots | `src/data/travel.js` | `systems/travel.js` | MAP (planned) |
| L3 Settlement | regions (Florida), holdouts (Meridian) | `src/data/regions.js`, `src/data/holdouts.js` | `world/regions.js`, `world/holdout.js` | TOWN (card) |
| L3 | the Phoenix ring's blocks, lots, yards | `src/data/ring.js` | `world/ring.js` | TOWN |
| L3 | rooms in any building | `src/data/floorplans.js` | `world/floorplan.js` (NavProbe proves every room) | BUILDING (the Lab) |
| L3 | hand-made buildings | `src/data/authored.js` | `world/authored.js` (`author` command) | BUILDING |
| L4 Sites | the series' places reimagined, 50 bases | `src/data/atlas.js` | per-system | SITE (card) |
| L5 Life | animals by biome | `src/data/fauna.js` | `systems/fauna.js` | LIFE (card) |
| L5 | the infected, the Greyborn, the Grapevine, hot ground | `src/data/infected.js`, wilds rows | `systems/zombies.js`, `systems/wilds.js` | LIFE |
| L5 | factions, people, roles | `src/data/society.js`, `npcs.js`, `roles.js` | society, memory, director | - |
| L6 Story | events, dialogue + voices | `src/data/events.js`, `dialogue.js`, `voices.js` | director, `systems/voice.js`, `web/tools/voiceforge/` | VOICE (card) |
| Things | items, loot, gear, weapons, materials | `data/items.js`, `data/gear.js`, `systems/combat.js` WEAPONS, `data/materials.js` | inventory, gear, materials | - |
| Things | vehicles, decks | `systems/vehicles.js` rows, `data/decks.js` | vehicles, decks | - |
| People | the character creator | `data/creator.js` | `systems/creator.js` | - |

## THE WORLD FORGE
`http://localhost:3141/forge.html` (any harness port). MAP edits `usmap.json` (field-preserving, conflict-guarded,
byte-identical round trips), BRUSH paints `brush.json`, LIVE pushes edits into a running game without a reload.
Every forge action is a COMMANDS row too (`forge`, `mapEdit`, `brushPaint`...), so an agent can do anything a person can.

## The checklist for any new content
1. Rows in the right file, in our own words (`node tools/ip-lint.mjs` 0 deny: never the novels' names or coined words).
2. Run the validator the layer exports (`validateWater`, `validateRoadside`, `validateBaseRow`, `validateUnderground`...).
3. New collision tag → a rule in `data/materials.js` (the materials census check fails otherwise).
4. Own rng stream (`rngOf(seed ^ CONST)`): never draw from the city's main stream, or every golden hash moves.
5. Golden: `src/data/golden.json` (island `f0cfcd28` + pinned chunks). If a change is meant to move one, re-pin it
   deliberately and say which and why.
6. A selftest check that proves the content WORKS in play (reach it on foot, drive it, shoot it, save/load it), not
   just that the row exists. A screenshot from the game camera.
7. Draw calls < 150 at the widest zoom over the new thing (instance everything; one pool per kind).
