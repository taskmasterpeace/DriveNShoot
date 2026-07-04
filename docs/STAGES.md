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
- On-foot + vehicle-mounted weapons unified (one weapon system, `mount_type`).
- Melee, throwables (grenade arc + cook), the dive already in.
- **Deep-dive:** `systems/INTERFACE_AND_BODY.md` (combat section). Uses: Skill(Marksmanship), Arsenal.

### Stage 5 — World Core & the Content Pipeline *(answers "how do we make a big world / bulk content")*
Stop falling off the map — because there's no edge, there's America.
- **Chunk streaming:** infinite terrain + roads from a seed; per-chunk persistence (husks, loot).
- **Compressed country:** state grid, welcome signs, road hierarchy, real exits, **world map UI**
  with fog-of-war cartography; navigate by **landmark silhouettes**.
- **Content pipeline (BULK CREATE):** blueprint authoring (towns/buildings as data), procedural
  generation, AI-assisted asset/data pipelines. ← *research subagents feeding this section.*
- **Deep-dive:** ENGINE.md §2 + `systems/CONTENT_PIPELINE.md` (from research). Uses: Blueprint.

### Stage 6 — The Living World: NPCs, Factions & Society *(the PCAS system you designed)*
The world remembers you.
- **Settlements:** Baronies (fortified city-states), Villes (small towns), the Wastelands,
  **Redoubts** (underground pre-dark tech + MAT-TRANS gates). **Jack** economy.
- **Pedestrian tiers T1–T5** (Crowd Engine ↔ Living World Engine), **12 archetypes**
  (Scavver…Cannie), **memory + gossip network**, daily schedules, off-screen simulation.
- **Faction Respect Ledger** (Esteem/Infamy/Notoriety) — GTA2 "Respect Is Everything" × UO.
- **Deep-dive:** `systems/WORLD_NPCS.md`. Uses: Perception cone, Memory, Schedule, Blueprint.

### Stage 7 — Companions, Animals & the Second Window *(high-payoff foundational systems)*
- **Companion system (big bang-for-buck):** dogs AND people follow, guard, fight, scout —
  a companion extends your **perception cone** (a dog's nose = a mobile sensor). One system,
  animal or human.
- **Animals & taming:** dogs → mutant hounds → wolves → roach mounts → war beetles (PROGRESSION.md).
- **The SecondaryView system** (multi-use viewport): **drone full-screen takeover**, scopes,
  **electronic-sight radar with directional arrows**, minimap — one engine module, many uses.
  ← *research subagent feeding this.*
- **Deep-dive:** `systems/INTERFACE_AND_BODY.md` (SecondaryView) + WORLD_NPCS (companions).

### Stage 8 — Progression Content, Automation & Base Building
The long tail that makes builds matter.
- Combat mods & Armoring (Mad Max customization, load/class: Scout/Raider/Tank/Mule),
  **robotics/drones** (Hotwire→Drone, 8 tiers), **construction/forts** (bus→bunker),
  **agriculture**, power grid, fusion battery. All plug into the Stage-3 Skill engine.
- **Deep-dive:** PROGRESSION.md (§ Robotics/Taming/Agriculture/Base). Uses: Skill, Blueprint, Container.

### Stage 9 — Multiplayer
Port the working ENet server-authority (2D donor); **cone-culled replication** (binoculars &
scouts become tactical; wallhacks impossible); co-op country drives → persistent shards later.

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

*Companion docs: `ENGINE.md` (7→8 pillars), `PROGRESSION.md` (skills), `loops/LOOP2_LIVING_CAR.md`,
`systems/INTERFACE_AND_BODY.md`, `systems/WORLD_NPCS.md`, `systems/CONTENT_PIPELINE.md`.*
