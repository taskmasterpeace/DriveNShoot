# DRIVN — The Stages (master build plan, beginning → end)

**Status:** LIVING ROADMAP · **Created:** 2026-07-04
**This is the one document** that orders the whole build, start to finish. Each stage links to
its deep-dive spec. Stages ship as `/goal` loops — each ends **sim-proven + playable**.

> **Working title in fiction:** *DeathWheels* / the world is the **Deathlands**.
> **The pitch:** Autoduel × GTA2 × Mad Max × Project Zomboid — a gritty, top-down 3D,
> **permadeath** survival-driving RPG across a compressed post-apocalyptic America.

---

## Committed direction (decisions locked 2026-07-04)

- **Tone:** GRITTY. Lean into Project Zomboid — permadeath, consequence, survival friction.
  Not cartoonish. Death means something.
- **Art (now):** low-poly placeholder boxes are fine to build on. The art-direction *commit*
  (textured low-poly vs models) is a later experiment (Stage 10 / Art Range) — engine stays
  art-agnostic (mesh slots on data) so the choice is swappable.
- **Camera:** top-down 3D with zoom + binocular scanning (shipped M1).
- **Physics:** real `VehicleBody3D`; weight/feel emerges from what you build (shipped M1).
- **Travel scale:** **60× compression** (re-set 2026-07-05; was 24×) — a 4-hour real drive =
  **4 real minutes**; the country ≈ 45 min to cross, towns ~a minute apart
  (`systems/TRAVEL_AND_NETCODE.md`). Shipped as `data/usmap.json` + MapForge.
- **North star:** the **retention pillars** in `DESIGN_PILLARS.md` are the tiebreaker — when two
  designs compete, pick the one serving more pillars (reputation loop, player economy, territory,
  sandbox skeleton, living pedestrians, no-P2W scarcity).

---

## ⭐ The Engine Philosophy: MULTI-USE COMPONENTS (the user's core principle)

> *"When we build stuff in our engine it should have multiple uses."*

This is the rule that makes a small team build a huge game. We do **not** build features — we
build **foundational systems that each pay off in many places.** Before building anything, ask
"what are its 3 uses?" The high-leverage systems:

| System | Used for… (one build, many payoffs) |
|---|---|
| **DamageableComponent** | car parts · player body parts (broken leg, gunshot) · destructible doors/walls · fort pieces |
| **Container** | car trunk · backpack · world cabinets/crates · corpse loot · vendor stock |
| **Interactable + prompt** | doors · cars · stashes · NPCs · workbenches · switches (shipped M1) |
| **StatusGlyph (emoji)** | car part tiers · player afflictions (🤒🩸🦴) · ammo · buffs — one moodle system |
| **SecondaryView** | drone full-screen takeover · rifle/binocular scope · electronic-sight radar · minimap |
| **Skill (xp→thresholds→unlocks)** | every RPG skill (Mechanics, Marksmanship, Robotics, Taming…) — see PROGRESSION.md |
| **Blueprint (data→world)** | towns · buildings · vehicles (chassis+modules) · bot builds · fort layouts |
| **AI Perception cone** | player vision · NPC awareness · MP anti-cheat replication · companion scouting |

Every stage below is built as one or more of these, so later stages get cheaper, not costlier.

---

## The Stages

### ✅ Stage 0 — Proto3D Foundation *(DONE 2026-07-04)*
Real vehicle physics, top-down zoom camera, in/out of cars, enterable building. → `proto3d/`.

### ✅ Stage 1 — Feel Core (M1) *(DONE 2026-07-04, 21/21 sim green)*
Stairs, interact-prompt UI, doors + locks + a key loot loop, dive, binoculars v2 (mouse-aimed),
world-edge respawn, off-road detail. → `proto3d/`, proof `proto3d/tests/m1_sim.tscn`.

### 🔜 Stage 2 — The Living Car *(DESIGNED → next loop)*
The car becomes a character that dies dramatically; the screen tells you your status; guns exist.
- 5-part vehicle damage (🔧🛞🔋⛽🛡️), death spiral smoke→fire→cook→**burnt husk** (persists as
  cover/salvage), **glyph HUD** (health/ammo/car), data-driven **arsenal** (3 sample guns,
  shared ammo), hotwire + loud forced-entry.
- **Deep-dive:** `loops/LOOP2_LIVING_CAR.md`. Uses: DamageableComponent, StatusGlyph, Container(trunk stub).

### Stage 3 — Character Core & The Interface *(absorbs the "you never spec'd UI" gap)*
The RPG spine + the screens to see it. **This is where the UI system is born.**
- **Progression engine:** skill = xp→thresholds→unlocks; 5 attributes → stat hooks. First 3
  anchor skills: **Mechanics, Driving, Marksmanship** (see PROGRESSION.md).
- **Body & Health system:** per-body-part health; injuries (broken leg → slowed, gunshot →
  bleeding, cuts, burns) and afflictions (cold/flu, infection, radiation) — and their
  **treatment as gameplay** (splint, bandage, disinfect, "treat your arm"). Built on
  DamageableComponent. Permadeath: when you die, the run dies.
- **Inventory & Containers:** one Container system → backpack + **car trunk** + world crates +
  corpses. Put stuff down (drop/place). Encumbrance ties to Strength.
- **The UI framework:** character-stats sheet, inventory screens, the injury/body panel, the
  repair screens ("what repairing a car / motorcycle looks like"), context menus.
- **Navigation:** waypoint arrows, off-screen edge indicators, compass — the "arrow stuff."
- **Deep-dive:** `systems/INTERFACE_AND_BODY.md`. Uses: Skill, DamageableComponent, Container, StatusGlyph.

### Stage 4 — Combat Depth
Make the fight feel like the fight in your head.
- **Aim-cone shooting:** the mouse is *intent*; real accuracy is a **cone** set by Marksmanship
  (imperfect, improves with skill), with **visible projectiles/tracers** and reticle bloom.
- ✅ **Twin-stick aim & locomotion (SHIPPED 2026-07-05):** feet/arms/eyes are three things. The
  **gun aims any direction instantly** (twin-stick — shoot behind you; look one way, walk the
  other), the **eyes/cone turn at human speed** (the rear blind spot the dog covers). Firing
  enters combat stance; melee-where-you-aim; circle-strafe; akimbo-ready.
  → `systems/AIM_AND_LOCOMOTION.md` · proof `proto3d/tests/aim_sim.tscn` 15/15.
- On-foot + vehicle-mounted weapons unified (one weapon system, `mount_type`).
- Melee (ammo-independent + stealth), throwables (grenade arc + cook), the dive already in.
- **Deep-dive:** `systems/COMBAT_AND_GEAR.md` (melee/ranged/throwables/**car weapons**/loadout) +
  `systems/INTERFACE_AND_BODY.md §6` (aim cone). Uses: Skill(Marksmanship), Arsenal, weapon_system.

### Stage 5 — World Core & the Content Pipeline *(answers "how do we make a big world / bulk content")*
Stop falling off the map — because there's no edge, there's America.
- ✅ **THE COMPRESSED USA SHIPPED 2026-07-05 (map_sim 31/31):** the whole country as DATA —
  `game/data/usmap.json` (60×: 150×85 cells of 500 m = 75×42.5 km; biome grid with farmland/
  forest/desert/plains/swamp/mountains/lake-country BY REGION like the real America, 48 Voronoi
  states with welcome-sign lines, 10 real interstates that MATERIALIZE as drivable asphalt with
  bridges over rivers, 37 town anchors with landmarks — the Dead Strip, the Rusted Arch, the
  Drowned Monuments). Neighborhoods + small woods hug the highways. Water BOGS cars (cross at
  bridges). M cycles local fog-of-war → the **country atlas**.
- ✅ **MapForge (the content pipeline's front door):** `tools/mapforge/` — canvas editor + a
  **REST API designed for AI agents** to read/build/expand the map (`API.md`, `/api/help`);
  one source of truth shared with the game. API smoke test: `test_api.mjs` 15/15.
- Remaining: per-chunk persistence (husks/loot deltas), interstate EXITS as generated towns,
  road hierarchy below interstates, long-haul cruise + costed fast-travel, landmark silhouettes
  at range, floating-origin/double-precision decision before MP (far-west float eps ~7 mm).
- **Deep-dive:** `systems/TRAVEL_AND_NETCODE.md` (scale/travel) + `systems/CONTENT_PIPELINE.md` +
  ENGINE.md §2. Uses: Blueprint, chunk streaming (which the MP AoI design reuses).

### Stage 6 — The Living World: NPCs, Factions & Society *(the PCAS system you designed)*
The world remembers you.
- ✅ **First slice SHIPPED 2026-07-05:** Respect Ledger v1 (esteem/infamy/notoriety, §6 bands,
  prices scale with standing), Mercy the TRADER (the container panel IS the shop), Bridger the
  SEC-MAN (bounty chain: offer → mark → claim), crime → SUSPECT → the town closes up.
  Proof: `proto3d/tests/town_sim.tscn` 16/16.
- **Settlements:** Baronies (fortified city-states), Villes (small towns), the Wastelands,
  **Redoubts** (underground pre-dark tech + MAT-TRANS gates). **Jack** economy.
- **Pedestrian tiers T1–T5** (Crowd Engine ↔ Living World Engine), **12 archetypes**
  (Scavver…Cannie), **memory + gossip network**, daily schedules, off-screen simulation.
- **Faction Respect Ledger** (Esteem/Infamy/Notoriety) — GTA2 "Respect Is Everything" × UO.
- **Deep-dive:** `systems/WORLD_NPCS.md`. Uses: Perception cone, Memory, Schedule, Blueprint.

### Stage 7 — Companions, Animals & the Second Window *(high-payoff foundational systems)*
- ✅ **Slice SHIPPED 2026-07-05** (`proto3d/tests/stage7_sim.tscn` 13/13):
  **Companions** — Sam the Drifter hires on (40 jack): follows (dog law), FIGHTS with his own
  gun, and SCOUTS — contacts HE sees that you can't ping your perception (reveal). One boarding
  law, animal or human: he climbs into vehicles with the pack.
  **Taming rung 1** — stagger a howler, feed it meat ×3 → FANG the Mutant Hound joins the pack
  (inherits every dog system: whistle, guard, ride-along, metaworld).
  **SecondaryView** — one PiP module, V cycles 📡DOGCAM / 🪞REARVIEW / 🛸DRONE; modes self-skip
  when their eye doesn't exist.
- Remaining (full stage): companion permadeath/loyalty, deeper taming ladder (wolves → roach
  mounts → war beetles), drone full-screen takeover, scopes, radar arrows, minimap on the SAME
  module. **Deep-dive:** `systems/INTERFACE_AND_BODY.md` (SecondaryView) + WORLD_NPCS (companions).

### Stage 8 — Progression Content, Automation & Base Building
The long tail that makes builds matter.
- ✅ **Robotics rung 1 SHIPPED 2026-07-05** (`proto3d/tests/drone_sim.tscn` 6/6): the SCOUT
  DRONE — deploys from the pack (🛸 item, trader sells it, one in the safehouse chest), patrols
  a ring overhead, PINGS threats into your perception (same channel as the dog's nose and Sam's
  callouts — one perception engine, many sensors), Second Window rides its eye, and a dead
  battery lands it as a pickup.
- Remaining: combat mods & Armoring (Scout/Raider/Tank/Mule), drone tiers 2–8 (Hotwire→Drone
  ladder), **construction/forts** (bus→bunker), **agriculture**, power grid, fusion battery.
- **Deep-dive:** PROGRESSION.md (§ Robotics/Taming/Agriculture/Base). Uses: Skill, Blueprint, Container.

### Stage 9 — Multiplayer *(PZ-style: big world, cheap server)*
Port the working ENet server-authority (2D donor) into a **chunk-grid + Area-of-Interest** design:
only chunks near players tick, each client hears only its AoI, **vehicles are client-authoritative
+ server-validated** (no heavy server physics), distant regions run tiered off-screen sim, chunks
persist per-cell. Two players far apart cost ~one region each; they share sim only when they
converge. Gunner seats = driver+gunner co-op. **Deep-dive:** `systems/TRAVEL_AND_NETCODE.md §3`.

### Stage 10 — Art Direction, Audio & Release Polish
The **Art Range** experiment (flat low-poly vs textured low-poly vs AI/free 3D models — you pick
seeing all three in motion), full audio pass (engine/impact/fire — half the "feel"), balance.

---

## What ports from the 2D donor (nothing dies)
Economy/scrap, contracts/mission board, heat/encounter director, save/load (DataManager),
dialogue (DialogueManager), garage/upgrades, and the **ENet netcode** — all engine-layer-agnostic
GDScript that lands in the stages above.

---

## Open design threads needing deep thought (flagged, not yet solved)
- **Content regeneration vs authored** — how much of the world is procedural vs hand-blueprinted
  (Stage 5 research).
- **Off-screen NPC simulation cost** at scale + in multiplayer (Stage 6 — the PCAS tier system
  is the answer; needs validation).
- **The SecondaryView performance budget** — how many live viewports (Stage 7 research).
- **Permadeath stakes vs. progression loss** — what carries over between runs, if anything
  (Stage 3 decision).

*Companion docs: `DESIGN_PILLARS.md` (north star), `ENGINE.md` (8 pillars), `PROGRESSION.md`
(skills), `loops/LOOP2_LIVING_CAR.md`, `systems/INTERFACE_AND_BODY.md`, `systems/COMBAT_AND_GEAR.md`,
`systems/WORLD_NPCS.md`, `systems/TRAVEL_AND_NETCODE.md`, `systems/CONTENT_PIPELINE.md`.*
