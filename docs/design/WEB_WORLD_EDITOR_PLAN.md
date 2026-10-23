# WEB_WORLD_EDITOR_PLAN: the procedural strategy, the World Forge, and the content ladder

## 1. Overview

Robert, 2026-10-23:
> "Come up with a procedural strategy, build tools, a unified gateway for the tools (a World Editor), then add more into it: structures, rivers, bridges, human-made stuff, then regional stuff like the animals. Go all out, design the whole game."

This is the master plan for building a USA-sized world that one person and a fleet of agents can fill:
- **One strategy**: the world is a stack of seeded layers, each a pure function of data rows and the layers under it.
- **One gateway**: THE WORLD FORGE, a single web app where every layer has an editor tab that writes rows the game reads live.
- **One ladder**: build the layers bottom-up, and prove each layer before the next stands on it.

It also records Robert's answers from the EM3 Briefing (2026-10-23), which set the game's direction.

### 1.1 Robert's settled calls (EM3 Briefing, 23 of 23 answered)

| Call | Answer | Notes in his words, condensed |
|---|---|---|
| Core | survival-action | |
| World | persistent shards | |
| PvP | open, murderers marked | |
| Death | Autoduel cloning | you wake as your clone and then travel back to where you died: buses, bus stations, trains, and a rare single airline (New York, Los Angeles, New Orleans, Ohio, Chicago); travel ports; our own slang, influenced by the books but ours |
| New character | point-buy | the creator system from his superhero game |
| Night | truly dark and scary | bring over as much of the superhero game as makes sense; military rail; secret facilities with secret projects; military holdouts with real guns and drones; "infinite stuff": he wants ideas |
| Controller | pad and keyboard both first-class | |
| Weapon UI | his hotbar with mode boxes, plus a radial on the pad | |
| Pistol | one-handed and two-handed | |
| Gunpoint | the full standoff | "but we must have dialog": living characters, generated audio at production level with variations; lay the groundwork now without sinking all the time into it |
| Melee | timing and stamina | knockback; hit by a car you get thrown, not run under; a ragdoll |
| Infected | three of our own | **the Greyborn**: set traps, have societies. **The Grapevine**: humans who watch people and learn from them, eat bodies, run, attack only when they can win, learn your vulnerabilities, and know only what they have seen (no cheating knowledge). Wardens are zombies too. The landscape must have mountains, valleys, underground, water, forests, radiation areas where strange creatures live, and dark underground facilities full of things. |
| Building | house deeds, and all three | use our creator: resize rooms and move stairs (the Building Lab); later, take pictures with an iPhone and build from them |
| Cars | full Car Wars-style design | |
| Car "sleep" | the car as shelter | an RV you can walk around inside, a van you walk around in even though it is small, a pickup's bed; an RV full of stuff in the middle of nowhere |
| Party | up to 6 | |
| Water | boats, the need, swimming | all three |
| Tech | rare pre-war tech | power suits and augmentations |
| **Start region** | **FLORIDA** | |
| Terrain | find it (public data) | long drives with the radio; rare solar cars; plug-in motorcycles; shooting in every direction from a bike; reverse is too slow; left must be left and right must be right when steering |
| EM3 | every role | lore, IP guard, critic, designer, content, sound |
| Sounds | the NAS, `N:/assets/audio` | |
| Tonight | controller, server, walkable vehicles | |

## 2. Player fantasy

You log in to a shard in Florida with a character you built point by point. You live out of an RV parked on a dead
interstate, or out of a house you bought a deed for and laid out yourself.

The world is the whole country, compressed:
- real terrain under you, real rivers with bridges you can blow;
- towns that look like the cities they were, burnt out and rebuilt;
- a base in every state, and secret facilities underground;
- woods thick enough to lose a convoy in;
- radiation zones where strange things live.

The dead are three kinds, and one of them is watching you and learning how you fight. When you die you wake as your
clone, and you have to buy a bus ticket to get back to your body.

## 3. Detailed rules

### 3.1 The layer stack (the procedural strategy)

Every layer is: data rows, then a seeded generator (a pure function of rows, the seed and the layers below), then a
validator, then an editor tab, then a selftest check, then a photobooth shot. A chunk is still a pure function of the
data (WEB_STREAMING's law), so anything a layer adds streams, saves and hashes like the rest.

| Layer | What it is | Rows / sources | Generator | Status |
|---|---|---|---|---|
| L0 Earth | elevation, landcover, biome | public DEM + landcover (WEB_TERRAIN) | `tools/terrain-bake.mjs` → baked tiles | agent building (I-10 corridor first) |
| L1 Water | rivers, lakes, coast, swamps, flooded cities | public hydrography (rivers as polylines with widths), the coastline, a sea level | carve and sheet water over L0; fords by depth | new |
| L2 Network | interstates, highways, rail, plus the bridges and overpasses where they cross water or each other | `usmap.json` roads and rails | roads graded to L0; **bridges generated wherever a road crosses L1 water or a gorge**, with decks, piers and rails as rows | partly built (exits and overpasses on I-10) |
| L3 Settlement | metros, cities, towns, holdouts; zones, blocks, lots, buildings with rooms | city rows (size by the metro rule), zone rules, KINDS, floor plans | the ring and town generators | Phoenix ring built; Florida next |
| L4 Sites | the atlas's 147 locations; 50 bases; caves; radiation zones; secret facilities; underground | `data/atlas.js`, base rows | site templates: perimeter, buildings, underground levels | atlas researched; one base built |
| L5 Life | regional animals; strange creatures in radiation zones; the infected (Shambler, Sprinter, Echo, Choir, plus the Greyborn and the Grapevine); factions, traders, convoys | biome × fauna rows, infected rows, faction rows | spawn by layer and region, with memory (WEB_WORLD_MEMORY) | infected v1 and factions built; fauna new |
| L6 Story | director events, the chronicle, dialogue with generated voice, the radio | event rows, dialogue rows, voice-cast rows | director plus the dialogue variation engine | director built; voice groundwork new |

### 3.2 THE WORLD FORGE (the unified gateway)

One web app served by the game's own vite server (`web/forge.html`), the way the Godot game's FORGE hub (:8900) gathered
its tools. It is tabbed, has one look (the game's HUD language), and every tab:
- writes **data rows** (never code);
- **validates** with the engine's own checks;
- **previews** with the engine's real generators (never a mock);
- **pushes live** into a running game through the agent bridge, so you see the change in the world at once.

Every tab is agent-drivable too: an action in the forge is a COMMANDS row.

| Tab | Edits | Built on |
|---|---|---|
| MAP | the national map: roads, rails, cities, regions, exits, the clone travel network (bus, train, air) | `usmap.json`, the MapForge ideas |
| TERRAIN | elevation overrides, biome paint, water: rivers, lakes, coast | L0/L1 |
| BRUSH | painting density: forest thickness and canopy, brush, ruin share, radiation zones, scatter | L0 tints, vegetation rows |
| TOWN | a city's zones, blocks, lots and landmarks | the ring generator |
| BUILDING | the Building Lab: floor plans, storeys, stairs, authored buildings, house deeds | `lab.html` (built) |
| SITE | the atlas sites, bases, caves, bunkers (underground levels), secret facilities | `atlas.js`, base rows |
| LIFE | fauna, the infected, factions, spawn rules by region and time | infected, factions, director rows |
| VOICE | dialogue lines, variations, voice casting, the generated-audio queue | dialogue rows, the TTS pipeline |
| OBSERVE | the live game: map, feed, people, record and replay, controls | the observer (being built) |

### 3.3 The content ladder, in order

1. **Structures:** buildings with rooms (done: ring, island, Lab), sites, bases, bunkers.
2. **Rivers and bridges:** L1 water, plus generated bridges and fords on L2.
3. **Human-made:**
   - rail and the clone travel network (bus stations, train stations, the rare airline);
   - power lines, billboards, gas stations, junkyards;
   - farms, canals, dams.
4. **Regional:**
   - animals by biome: Florida's alligators, wild hogs, deer, panthers, snakes, birds; the West's coyotes, javelina, rattlesnakes;
   - strange creatures in radiation zones;
   - the Greyborn's settlements and the Grapevine's hunting grounds.

### 3.4 First region: Florida

Robert chose Florida as the start. Its data already exists from the Godot game: `game/data/usmap.json` (Meridian at I-95
Exit 9, the Seaboard Line, Miami Central), the Living World specs, and THE_COUNTRY_PLAN.
- **Florida streams first**, on the same chunk system as I-10: I-95, I-4 and I-75, the Keys road.
- **Meridian is the starting holdout** (Rust Haven's role), with the swamp ecology (Alligator Alley) as L5's first region.

### 3.5 The fleet, wave 2

Each agent gets its own worktree, branch and port, and stays in its lane; I merge, run the battery twice and land.

| Agent | Builds |
|---|---|
| World Forge gateway | the forge shell, plus tabs for the Lab, Observer, terrain and brush as they land |
| Florida | the start region: streaming, Meridian holdout, I-95 |
| The new infected | the Greyborn (societies, traps) and the Grapevine (watch, learn, strike only when they win, know only what they saw) |
| Walkable vehicles | ride in a pickup's bed; walk around inside a van and an RV; the RV as a home |
| Rivers and bridges | L1 + L2: rivers carved into terrain, bridges generated at every crossing |
| Fauna | L5 animals by biome, and the radiation-zone creatures |
| Voice groundwork | dialogue rows with variations, voice casting, a batch TTS pipeline |
| Clone and travel | clone backups at the clinic; bus, train and air routes back to your body |
| Point-buy creator | ported from the superhero game's ORIGIN creator |
| Underground | caves, bunker levels and secret facilities (storeys v2: basements) |

## 4. Formulas

- **Metro size:** metros are about 3 km across, cities 1.5 km, holdouts as authored (decided 2026-10-22).
- **Base footprint:** area ÷ 14², clamped between 64 m and 3 km (the atlas's road-law scaling).
- **Bridge generation:** a road segment crossing water deeper than `ford` (0.6 m), or terrain lower than the road by more than `gorge` (4 m), gets a deck.
  - Deck length = the crossing plus 2 × `approach`.
  - A pier every `span` (24 m).
  - Rails above `rail_h` (1 m).
- **Fauna density:** spawns per km² = biome row base × time-of-day factor × a factor of (1 − human presence), capped per chunk by a pool budget.

## 5. Edge cases

- **A layer changes under a saved world** (an edited river under a placed house): the generator is pure, so the chunk rebuilds. Authored rows win over generated ones, and a validator reports the overlap in the forge rather than letting it sit silently.
- **An editor push to a running shard:** forge pushes go to a dev harness only. A live shard takes data changes on restart, so players never see half an edit.
- **Two people editing one row:** the last writer wins. The forge shows a conflict banner when a row changed on disk since it was opened (MapForge's mtime guard).

## 6. Dependencies

Each pairs with the layer it feeds:
- WEB_TERRAIN (L0);
- WEB_STREAMING (chunks, golden hashes);
- WEB_FLOORPLANS and WEB_BUILDING_LAB (L3, BUILDING tab);
- WEB_ATLAS (L4);
- WEB_INFECTED, WEB_WORLD_MEMORY and WEB_DOGS (L5);
- WEB_OBSERVER (OBSERVE tab);
- WEB_SHARD (shards take data on restart);
- WEB_LOOK (how every layer looks);
- docs/skills/em3 (the design voice).

## 7. Tuning knobs

| Knob | Value | What it changes |
|---|---|---|
| `ford` | 0.6 m | water a car may drive through |
| `gorge` | 4 m | when a road needs a deck |
| `span` | 24 m | pier spacing |
| fauna base per biome | rows | how alive the wild is |
| forest density per biome | rows | how thick the woods are (Robert: "forests gotta be thick, canopies") |
| radiation zone share | rows | how much of a region is hot |

## 8. Acceptance criteria

- The forge opens at `/forge.html` with every tab listed in §3.2. Each landed tab edits real rows and validates them with the engine's checks.
- Every layer has at least one selftest check and a photobooth shot.
- Florida streams and boots a new character at Meridian (when the Florida agent lands).
- `selftest` is green twice on fresh pages after every landing.
