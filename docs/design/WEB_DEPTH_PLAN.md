# WEB_DEPTH_PLAN: the next depth pass (2026-10-28)

Robert's asks of 2026-10-28, checked against what the code already does, turned into lanes.
Each lane gets its own branch `feat/web-<lane>`, its own session, its own design doc, and the lead's two-green battery before it lands.

## 0. Laws that bind every lane
1. **Nobody cheats** (taken from Robert's Consequences of Failure mod, `C:/Users/taskm/Zomboid/mods/ConsequencesOfFailureVR/README.md`):
   NPCs walk to the source, carry the real item, and come back. There are no factory supplies, no teleports, and no keys or doors granted for free.
   An NPC that drives needs a real key, fuel and a working engine. An NPC that shoots needs ammo in the gun and a line of sight.
   A success the server didn't see doesn't happen. Unknown state holds; it never mints a copy.
2. **No loot regeneration.** A container rolls once (`box.rolled`, already the law) and never refills.
   Anything that restocks must be a visible delivery: trader shelves filled by a courier, a caravan or a farm that actually produced the goods.
   Foraging regrowth (plants) and rain stay. The world's stock only goes down unless someone makes or carries more.
3. **The world moves only while someone is in it.** The shard clock runs while at least one player is logged in, and stops when the last one leaves.
   This amends `WEB_PERSISTENT_WORLD_PLAN.md` §3.1.4 ("never stops"). Off-screen sim tiers still run on that clock.
4. **The world is our own.** It takes the *problems* of the genre: poisoned ground and bad water, acid weather, ammo and fuel scarcity, mutated beasts, warlord-run walled towns, slavers, cannibals and buried pre-war bunkers.
   Never its names, slang, characters or plot. `ip-lint` must report 0 deny.
5. **Multiplayer first.** Everything new is shard-shaped: who owns it, what gets saved, and what another player sees.
6. **Tooling over hand-tuning.** Every new system ships as data rows, a `validate*` function, and a forge/editor surface where Robert can change it.

## 1. What exists vs what's missing (audit 2026-10-28)
| Ask | Exists | Missing |
|---|---|---|
| Walk on moving vehicles | `systems/decks.js`. Riders keep a local frame and turn with the vehicle. Open decks throw you out on hard turns and crashes; crouching braces you (×1.6). Pickup bed, van cargo, and an RV coach with beds/stove/awning | No boat decks, no bus deck, no roofs. The balance check only looks at crouch |
| Stances | Crouch: slower, 0.6× spotting distance, braces on a deck, dives in deep water | **Prone.** No per-stance collision capsule (fixed `radius 0.4`) |
| Passenger shoots out the window | `seats.js` followers already shoot out of their window | A passenger can't man the roof turret (only the driver fires group 3). Not checked in multiplayer |
| Gadgets | 14 rows (mines, spikes, charges, lures, flares, smoke, alarms...), drones, traps | **Placeable sentry turret**, a turret seat |
| Dogs | Strays, bond tiers, the whistle verbs, digging, riding, graves | (good; extend later: dog armor, dog-carried packs) |
| Bodies | Become loot boxes; eaten by packs and dogs | **Deleted after 90 s** out of view. No bloat, rot or bones |
| Burial | Crew `bury()` grave record and obituary; dog graves | No cemeteries in towns or sites, no burial verb, no funerals or mourning |
| Bullets | **Hitscan** (`combat.js hitscan`) | Bullet travel time, drop, per-ammo speed |
| UI | Fixed px on a 1600×900 design, one global `--s` scale, a 5-step `hudScale` | **Layout editor**: named elements, drag/resize/anchor, presets, screenshots |
| Roads | Scatter kept 22 m off every road, the same everywhere | Regional roadsides (tree walls, fences, poles, ditches, sound walls, nothing-for-a-while) |
| Terrain | Real-elevation strip on I-10 behind a flag | Whole country (lane SITES-TERRAIN is on it now) |
| Back lots | 45% back doors, 35% locked in held towns; kick/pick/pry | **Alleys, fenced yards**, loading docks |
| Water | One depth authority; rivers, lakes, Florida sea; 3 boats | Ferries/rafts you stand on, current, flooded towns |
| Underground | Bunkers, caves, facilities | Storm drains and sewers under towns |
| Factions and stories | 16 factions, off-screen income, wars that flip places, hunters, skip tracers | A bounty-hunter faction and board; sites that affect each other |
| Zombies | `data/infected.js`: shambler, sprinter, echo, choir | Robert wants **3 breeds** (see §3 decision D1) |
| Role diversity | `data/roles.js`: 10 player reputation roles; town residents | Towns full of the same jobs; no per-region/per-kind occupation mix |
| Models | DSOA: one instanced procedural rig for all 160 people (cheap, <150 draw calls) | Robert prefers the LSW skinned GLB bodies (§4) |

## 2. The lanes
### WAVE 1 (start now; no two lanes touch the same files)
| Lane | Where | Owns | Proof |
|---|---|---|---|
| **SITES-TERRAIN** (running) | local | citygen site stamps, realterrain default, the bake past I-10 | battery ×2, renders |
| **DECKS-STANCE** | local session | `decks.js`, `data/decks.js`, stance code in `main.js`/`characters.js`, `seats.js` turret seat | boat/bus/RV/pickup deck checks; prone check; turret-seat check |
| **BALLISTICS** | local session | `combat.js` projectile path, `data/items.js` ammo speed rows | travel-time and drop checks; stress unchanged |
| **UI-EDITOR** | cloud | `src/ui/` element registry + edit mode, `data/hudlayout.js` | named elements, drag/resize/anchor, presets, saved layout |
| **ROADSIDE** | cloud | a new `world/roadside.js` + `data/roadside.js` rows; one hook in chunkgen | per-region scenes; unit checks over the rows |
| **DEATH-RITES** | cloud | body decay + cemetery/funeral system and rows | decay stages; a cemetery in every site/settlement; a funeral when a resident dies |

### WAVE 2 (after Wave 1 lands; these touch citygen/residents)
- **BACK-LOTS**: service alleys on every block, fenced back yards (sheds, dog runs, clotheslines), loading docks, back doors as the quiet way in.
- **ROLES-DIVERSITY + GOAL LOOP**: occupation mixes per town kind × region × size × faction (a port town has dockhands and net menders; a farm town has growers, a smith and a miller; a raider camp has scouts, slavers and a quartermaster). Scored by a diversity metric (§5) and tuned by the goal loop until every town clears it.
- **WATER-PLACE**: rafts and ferries as decks, river current, flooded towns with only the rooftops above water, island ruins.
- **UNDERSTREET**: storm drains and sewers under every town, joined to the street seamlessly (manholes, outfalls, culverts under roads).
- **SITE-STORIES + BOUNTY GUILD**: each site gets an owner, a problem and a clock. Sites send traders, raiders and refugees to each other. A bounty-hunter guild posts boards in towns, and its hunters are real NPCs who travel (law 1).
- **ZOMBIES**: the 3 breeds (D1), plus what Project Zomboid teaches: hearing and sight memory, hordes that drift toward noise, breaking windows and doors, crawlers, lunges, fear of fire.

### WAVE 3
- **LSW-BODIES** (§4), **SIM-CORE / persistent shard** (law 3; `WEB_PERSISTENT_WORLD_PLAN.md` M3), the room-scan base (`D:/git/little-big-home`).

## 3. Decisions to confirm (the lanes go ahead on the default)
- **D1, the 3 breeds.** Default: **Shambler** (slow, a horde body), **Sprinter** (fast bursts that tire), **Echo** (the one that works doors and windows and calls the others). **Choir-Touched** stays as a rare site special, not a breed.
- **D2, prone.** Default: prone means unseen past 12 m in cover or grass and 0.25× spotting in the open. Movement 0.8 m/s, aim only forward ±40°, cannot be done in a cabin. On an open deck you can't be thrown out, and anyone outside the vehicle can't see you past the rail.
- **D3, balance on decks.** Default: the throw-out limits scale with the existing Athletics/Agility stat (±30% across the range). Crouch gives ×1.6 and prone gives ×3, plus whatever you're holding onto.

## 4. LSW character models: how much work
- LSW people are **skinned GLB bodies** (`public/authored-assets/body.hero-{standard,standard-female,lean,heavy}`) driven by **motion packs** (`motion.hero-ual`, `motion.cmu-walk-02`, `motion.fab-close-combat`) through `src/engine/hero-skin.js` and `authored-character.js`.
- DSOA people are one **instanced procedural rig** (`systems/characters.js`). All 160 people cost a handful of draw calls, and every pose (IK feet, two-hand grips, deck riding, crouch, death sprawl) is solved there.
- **The switch is a medium-large lane, not a rewrite.** Ordinary skinned meshes cost one draw call each, so 160 of them would blow the 150 draw-call budget. The workable version:
  1. Near people (about 24 nearest) wear the LSW skinned body, posed from the same joint solution DSOA already makes (DSOA's IK becomes the retarget target).
  2. Far people stay on the instanced rig, or use baked vertex-animation textures of the LSW body.
  3. Clothing/gear/flags move onto the GLB as attachments.
- Estimated at one lane of about 2–3 days of agent time, after DECKS-STANCE lands (they share the pose code). Cars are untouched.

## 5. The goal loop ("dream loop for a process")
A tool, `tools/goal-loop.mjs`, plus a skill: a goal is a **metric row** (a command that prints a number, a target, and the files the loop may change).
Each round: measure → if below target, change one thing (an agent edits rows) → re-measure → keep the change only if the metric went up and the selftest stayed green → repeat until the target is met or the rounds run out.
The first goal is role diversity: per town, Shannon diversity of occupations ≥ 1.6, no occupation over 25% of a town, and neighbouring towns of the same kind differing by ≥ 30% (Jaccard distance).

## 6. Burial formula (DEATH-RITES)
- **Body stages** (game hours): fresh 0–24 → bloated 24–72 (smell; flies; draws dogs and infected) → rotting 72–240 → bones 240+ (a bone pile that stays). Heat ×1.5 speed, cold ×0.5, water ×1.3.
  Bodies are only removed when someone buries, burns or drags them. The 90 s delete becomes a far-fold record like the population one.
- **Cemetery size for a place** = `ceil(pop × years_settled × 0.02 × (1 + danger))` graves, at least 6; on-site for a site, at the edge for a town, a family plot for rural places. Every one of the 251 sites gets one (a mass grave for a battle site, a bunker crypt for a bunker).
- **Funerals:** a resident who dies with ties (family, friends, a faction) gets a funeral within 1–2 game days at their place's cemetery. Tied residents come (they walk there, law 1), and the town's mood and standing toward the killer change. The player can attend, dig, or pay for a stone. Graves are rows (who, when, how, by whose hand) in the chronicle.

## 7. Roadsides (ROADSIDE)
Port Robert's road research (`docs/reference/lsw/ROAD-BIOMES-2026-09-21.md`, `road-kit*.js`, `between-cities.js`, `relief.js`, `open-country-terrain.js`) into DSOA data rows:
- Road class ladder: interstate → divided → two-lane → rural → dirt, each with clear zone, shoulder, median, meander and bend radius.
- Scenes with setbacks: tree wall, houses off the road, sound wall, billboards, power poles, field fences, windmills, desert scrub, wetland cattails, snow fences.
- `NOTHING_CHANCE` per biome, service stops, ditches, median swales and raised road beds.
LSW units are 0.19 m; DSOA is metres, so convert once in the rows.

## 8. UI editor (UI-EDITOR)
Port the LSW layout editor (`docs/reference/lsw/touch-layout.js`) to DSOA's HUD:
1. Every HUD element gets a **stable name and anchor** in a registry (minimap, clock, cash, weather, status, speedo, needs, respect, objective, kill feed, prompt, subtitle, weapon bar, compass...).
2. An **edit mode** (a key, plus a pause-menu button): drag, resize, snap, change the anchor, hide, reset.
3. **Presets** (Default, Compact, Streamer, Controller) plus a per-element scale. The layout saves per player, and the default layout is a data file Robert can commit.
4. A **screenshot sheet**: one capture per element with its name, so the standard layout is documented.
5. The default is **smaller** than today (Robert: "too big on the screen").
