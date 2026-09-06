# Roadstead Habitation Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent lighting task and parent-owned asset/integration work, with parent-only Godot/MCP execution and a combined review.

**Goal:** Correct screenshot-proven lighting and habitation gaps in the real Roadstead world.

**Architecture:** Keep existing local gameplay/authority and imported cottages. Add original Blender yard props with data-row placements. Correct only visual perception-mask strength/softness and add row-defined practical lights, leaving gameplay LOS/range/culling untouched.

**Tech Stack:** Godot 4.5.1 Compatibility, typed GDScript 2.0, JSON rows, Blender MCP, Python unittest.

**Spec:** docs/design/ROADSTEAD_HABITATION.md

## Global Constraints

- No purple. Ever.
- Data-driven everything: new vehicle/item/NPC/base/upgrade = a ROW.
- Every feature lands with a sim; every bug fix leaves a regression check.
- Headless sims must exercise the REAL path — inputs, never teleports (staging positions is the documented exception).
- Isolated worktree only; preserve existing economy, save and controller behavior.
- Parent alone runs Godot, Blender MCP, and commits. Workers do not spawn agents.

### Task 1: Light that reads as light

**Files:** Modify `game/proto3d/vision_cone.gd`, the visual-mask call in `proto3d.gd`, `daynight.gd` as needed, `game/data/world_lighting.json`, `realm/property_site.gd`, `game/data/properties.json`. Create focused lighting/property regression scenes in `game/proto3d/tests/`.

**Interfaces:** Existing `ProtoVisionCone.update_cone` remains compatible. Any optional mask-strength argument defaults to previous behavior for unchanged consumers. Consume real `ProtoDayNight` hour and visual-only row settings. Existing entity visibility ranges/LOS/fades are untouched. Property light definitions are optional `lights` rows on each parcel; runtime lights belong to that site and die with it.

- [x] Add tests first: full-scene daytime mask strength is below nighttime; day/night sight ranges remain existing values; night practical lights are present, local, warm and illuminate the house/porch anchors; varying a property light row changes the actual runtime node. Assert real state, not source text. Send parent RED-ready paths and pause production edits until expected failure is observed.
- [x] Parent runs focused RED scenes using isolated APPDATA and captures output. Correct test setup errors before treating failures as RED.
- [x] Implement bounded visual-only mask correction: reduce daylight dim, smooth angular/radial transition; no global ambient cheat. Add data-driven local lights using established `ProtoHouse` precedent and preserve shell/door/cutaway.
- [x] Parent runs new and existing lighting/visibility/home tests and real rendered audit. Inspect daylight and night images with HUD/mask active; fix actual issues and rerun covering tests.
- [x] Review task diff against spec and tests; commit only verified work.

### Task 2: Original yard assets and real navigable placement

**Files:** Create `tools/blenderforge/gen_roadstead_yard.py`, `tools/blenderforge/tests/test_roadstead_yard_contract.py`, exports `game/assets/models/homestead/{freight_shelter,reclaimed_fence,yard_lamp}.glb`, editable `tools/blenderforge/sources/roadstead_yard.blend`; create `game/data/roadstead_yard.json` and `game/proto3d/realm/roadstead_yard.gd`; wire from `road_life.gd`. Create `game/proto3d/tests/roadstead_yard_sim.gd/.tscn`.

**Interfaces:** `ProtoRoadsteadYard.setup(life: Node) -> void` consumes only life/main and data rows, owns decoration/collision. Surface rows use world X/Z endpoints and width; sample terrain at each vertex. Prop rows use asset, position, yaw and optional cutaway/collision/light fields. Avoid props in real vehicle/foot routes. Keep existing sites and receivers as the sole transaction authorities.

- [x] Add binary-geometry tests. RED: three missing exports, expected failure before generator exists.
- [x] Author three original props through actual installed Blender MCP. Reuse existing generator helpers by import without running its main. Export only task-owned asset scenes, embedded materials, metre-space transforms, independent canopy roof. Run Python tests against vertices and triangle budgets.
- [x] Add runtime regression before placement: real scene has a connected Roadstead approach; office desk and every front door reachable by real input; solid controls detect fence posts away from route. Parent observes RED before integration.
- [x] Implement terrain-conforming visual surfaces and data-row placed yard assets: sheltered office desk, freight stacks/parking markings, connected gravel lane, parcel edge fences with open approaches, lamp landmarks. No new fake interactions.
- [x] Parent imports once, runs yard/home/freight/lighting regressions and repeats the 20-piece real-game audit to a new evidence directory. Review images, refine, rerun.
- [x] Save evidence and candid remaining mission gaps in HANDOFF/status, review combined diff and commit verified source/assets. Full-game goal remains active.
