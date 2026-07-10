# Vehicle Impact Bay L2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded, visible, directional vehicle damage to real DRIVN vehicles and make it playable in the standalone Physics & Combat Lab Impact Bay.

**Architecture:** Every bullet or crash becomes one normalized impact packet. `ProtoVehicleImpact` resolves local face and armor while `ProtoVehicleDamageVisual` owns event-driven panel transforms and a fixed mark pool; the `VehicleBody3D` hull never deforms. `ProtoCar3D` remains the compatibility boundary, keeps `take_damage(amount)`, persists compact damage state, and exposes the same implementation to campaign, traffic promotion, weapons, and the lab.

**Tech Stack:** Godot 4.5.1, statically typed GDScript 2.0, `VehicleBody3D`, modular `MeshInstance3D` visuals, JSON vehicle rows, real-path headless sims.

## Global Constraints

- `res://` is `game/`; never use `res://game/`.
- No soft bodies and no continuous arbitrary vertex rewrites.
- Collision hulls remain stable; dents are cosmetic event-driven transforms.
- Vehicle, armor, threshold, and cap tuning stays in data rows with safe code floors.
- Marks are capped at 16 per real vehicle and reuse the oldest slot.
- Old `take_damage(amount)` callers and old saves remain valid.
- Ambient traffic receives full visual damage only after promotion to `ProtoCar3D`.
- Every behavior change lands RED→GREEN with a focused sim and a commit.
- Lab outputs remain below `user://physics_lab/`; campaign saves remain isolated while the lab runs.

---

## File map

### New focused components

- `game/proto3d/vehicle_impact.gd` — packet validation, local face resolution, contact conversion, and armor math.
- `game/proto3d/vehicle_damage_visual.gd` — panel registration/rest transforms, deterministic dents, fixed mark pool, compact snapshot/restore.
- `game/proto3d/tools/physics_lab/lab_impact_bay.gd` — L2 bay cars, selected face/energy controls, telemetry, reset.

### Existing integrations

- `game/proto3d/car_3d.gd` — owns the two components; routes component damage; captures physics contacts; preserves the old wrapper.
- `game/proto3d/weapon.gd` — emits the packet from real ray-hit position/normal/direction/weapon rows.
- `game/proto3d/proto3d.gd` — compact vehicle-damage save records and old-save-tolerant restore.
- `game/proto3d/tools/physics_combat_lab.gd` and `lab_hud.gd` — build/surface the playable Impact Bay.
- `game/data/vehicles.json` — deformation/armor durability rows; existing face armor stays authoritative.

### Focused sims

- `vehicle_contact_sim` — bounded packet and face/contact resolution.
- `directional_armor_sim` — same energy, different face/armor result, compatibility wrapper.
- `vehicle_deform_sim` — event-only transforms, stable collision, mark cap, deterministic snapshot.
- `impact_bay_sim` — real lab car, real weapon ray, crash preset, HUD/reset/save isolation.

---

### Task 1: Normalized vehicle impact packet and local-zone resolver

**Files:**
- Create: `game/proto3d/vehicle_impact.gd`
- Create: `game/proto3d/tests/vehicle_contact_sim.gd`
- Create: `game/proto3d/tests/vehicle_contact_sim.tscn`

**Interfaces:**
- Produces: `ProtoVehicleImpact.packet(raw: Dictionary) -> Dictionary`.
- Produces: `ProtoVehicleImpact.zone_for(vehicle_transform: Transform3D, half_extents: Vector3, packet: Dictionary) -> String`.
- Produces: `ProtoVehicleImpact.contact_packet(world_pos: Vector3, world_normal: Vector3, incoming_dir: Vector3, impulse: float, source: String = "crash") -> Dictionary`.

- [ ] **Step 1: Write the failing pure resolver sim**

Create packets containing `world_pos`, `world_normal`, `incoming_dir`, `energy`, `penetration`, `source`, and `weapon_id`. Assert missing/nonfinite values sanitize, energy/penetration clamp to `0..5000`, and a car rotated 90° still resolves its local `front`, `rear`, `left`, `right`, `top`, and nearest `wheel` consistently.

- [ ] **Step 2: Run RED**

```powershell
Godot_console --headless --path game res://proto3d/tests/vehicle_contact_sim.tscn
```

Expected: FAIL because `vehicle_impact.gd` does not exist.

- [ ] **Step 3: Implement the pure component**

The normalized row is:

```gdscript
{
    "world_pos": Vector3.ZERO,
    "world_normal": Vector3.UP,
    "incoming_dir": Vector3.FORWARD,
    "energy": 0.0,
    "penetration": 0.0,
    "source": "legacy",
    "weapon_id": "",
}
```

Convert hit position and direction through `vehicle_transform.affine_inverse()`. `top` wins when local normal Y is above `0.58`; wheel wins only inside a wheel-height band and near a lateral corner. Otherwise compare normalized absolute local X/Z distance, remembering DRIVN forward is local `-Z`.

- [ ] **Step 4: Run GREEN and adjacent math tests**

Run `vehicle_contact_sim` and `vehicles_sim`. Expected: both exit 0.

- [ ] **Step 5: Commit**

```powershell
git add game/proto3d/vehicle_impact.gd game/proto3d/tests/vehicle_contact_sim.*
git commit -m "feat: add vehicle impact packets"
```

---

### Task 2: Directional armor resolver and data floors

**Files:**
- Modify: `game/data/vehicles.json`
- Modify: `game/proto3d/car_3d.gd`
- Modify: `game/proto3d/vehicle_impact.gd`
- Create: `game/proto3d/tests/directional_armor_sim.gd`
- Create: `game/proto3d/tests/directional_armor_sim.tscn`

**Interfaces:**
- Produces: `ProtoVehicleImpact.profile(spec: Dictionary) -> Dictionary`.
- Produces: `ProtoVehicleImpact.resolve(packet: Dictionary, zone: String, profile: Dictionary, armor_durability: Dictionary) -> Dictionary`.
- Produces: `ProtoCar3D.take_impact(packet: Dictionary) -> Dictionary`.
- Preserves: `ProtoCar3D.take_damage(amount: float) -> void`.

- [ ] **Step 1: Write the failing armor sim**

Using one SUV and one light car, hit front/rear/side with identical `energy=50`, `penetration=12`. Assert authored front/rear/side values differ, energy below resistance creates a scuff with near-zero chassis damage, depleted armor allows more damage, and `take_damage(20)` retains the current compatibility damage band.

- [ ] **Step 2: Run RED**

Expected: FAIL because `take_impact()` is missing and runtime still uses one front scalar.

- [ ] **Step 3: Add data rows and safe floors**

Each relevant vehicle row may override:

```json
"impact": {
  "armor_durability_mult": 2.0,
  "dent_threshold": 8.0,
  "armor_dent_threshold": 34.0,
  "max_dent": 0.22,
  "max_shift": 0.16,
  "max_rotation_deg": 10.0,
  "mark_cap": 16,
  "deformation_seed": 1001
}
```

The code floor supplies all keys. Missing `rear`, `side`, or `top` armor falls back in that order to `front * 0.75`, `front * 0.85`, and `front * 0.55`; wheel resistance uses `side * 0.45`.

- [ ] **Step 4: Implement deterministic armor math**

Resolution returns `zone`, `resistance`, `absorbed`, `remaining_energy`, `component_damage`, `severity_delta`, `armor_before`, `armor_after`, `penetrated`, and `mark_allowed`. Penetration reduces effective resistance; impacts consume durability only in their resolved zone. `take_damage(amount)` supplies `compatibility=true` so old callers preserve the previous armor formula and component spiral.

- [ ] **Step 5: Run GREEN and regressions**

Run `directional_armor_sim`, `gunfeel_sim`, `vehicles_sim`, `traffic_sim`, and `balance_sim`.

- [ ] **Step 6: Commit**

```powershell
git add game/data/vehicles.json game/proto3d/car_3d.gd game/proto3d/vehicle_impact.gd game/proto3d/tests/directional_armor_sim.*
git commit -m "feat: add directional vehicle armor"
```

---

### Task 3: Event-driven modular panel deformation

**Files:**
- Create: `game/proto3d/vehicle_damage_visual.gd`
- Modify: `game/proto3d/car_3d.gd`
- Create: `game/proto3d/tests/vehicle_deform_sim.gd`
- Create: `game/proto3d/tests/vehicle_deform_sim.tscn`

**Interfaces:**
- Produces: `ProtoVehicleDamageVisual.setup(car: ProtoCar3D, visual_root: Node3D, profile: Dictionary) -> void`.
- Produces: `apply_impact(packet: Dictionary, resolution: Dictionary) -> void`.
- Produces: `facts() -> Dictionary`, `snapshot() -> Dictionary`, and `restore(state: Dictionary) -> bool`.

- [ ] **Step 1: Write RED deformation invariants**

Assert idle physics frames do not change panel transforms; a front event changes only front-assigned modular panels; severity is monotonic and clamped; transforms remain finite; the `CollisionShape3D` resource/transform never changes; the same seed/state regenerates the exact panel transforms.

- [ ] **Step 2: Run RED**

Expected: FAIL because the visual component does not exist.

- [ ] **Step 3: Register modular panels once**

Walk the vehicle visual root once at setup. Record each eligible `MeshInstance3D` rest transform and zone. Prefer name hints (`hood`, `grille`, `nose`, `tailgate`, `rear`, `_l`, `_r`, `roof`); fall back to normalized local position. Exclude wheels, glass/lights, seats, frame rails, occupants, particles, and collision nodes.

- [ ] **Step 4: Apply bounded deterministic dents only on events**

Recompute each affected panel from its rest transform and zone severity. Use a seeded sign/weight per panel, inward translation along the face normal, bounded scale squash, and bounded rotation. Do not tween or poll deformation during idle physics.

- [ ] **Step 5: Run GREEN and visual-size regressions**

Run `vehicle_deform_sim`, `vehicles_sim`, and `vehicle_shape_sim` if present. Expected: modular footprints remain inside existing tolerance before damage and collision identity stays stable after damage.

- [ ] **Step 6: Commit**

```powershell
git add game/proto3d/vehicle_damage_visual.gd game/proto3d/car_3d.gd game/proto3d/tests/vehicle_deform_sim.*
git commit -m "feat: add bounded vehicle dents"
```

---

### Task 4: Fixed bullet-mark pool

**Files:**
- Modify: `game/proto3d/vehicle_damage_visual.gd`
- Modify: `game/proto3d/tests/vehicle_deform_sim.gd`

**Interfaces:**
- Produces: `add_mark(packet: Dictionary, resolution: Dictionary) -> bool`.
- Extends snapshot with a compact ordered mark summary.

- [ ] **Step 1: Extend the sim RED**

Apply 40 accepted bullet impacts. Assert exactly 16 mark nodes, oldest-slot reuse, local surface alignment, dark ring/indent visuals, no mark for invalid/failed hit, and no allocations after the cap is reached.

- [ ] **Step 2: Run RED**

Expected: mark assertions fail.

- [ ] **Step 3: Build and reuse the pool**

Prebuild/reuse small `MeshInstance3D` slots beneath the visual component. Store only zone, local position, local normal, radius, and serial. Crash packets dent but do not create bullet holes unless a row explicitly opts in.

- [ ] **Step 4: Run GREEN and allocation soak**

Run `vehicle_deform_sim` with 200 repeated impacts. Expected: node/resource counts plateau at the authored cap.

- [ ] **Step 5: Commit**

```powershell
git add game/proto3d/vehicle_damage_visual.gd game/proto3d/tests/vehicle_deform_sim.gd
git commit -m "feat: pool vehicle bullet marks"
```

---

### Task 5: Real weapon rays and direct crash contacts

**Files:**
- Modify: `game/proto3d/weapon.gd`
- Modify: `game/proto3d/car_3d.gd`
- Modify: `game/proto3d/tests/vehicle_contact_sim.gd`
- Modify: `game/proto3d/tests/gunfeel_sim.gd`

**Interfaces:**
- Consumes: `ProtoCar3D.take_impact(packet)`.
- Produces crash packets from `_integrate_forces(state: PhysicsDirectBodyState3D)`.

- [ ] **Step 1: Write RED real-path tests**

Fire a real weapon ray into front and side surfaces and assert packet position/normal/direction/weapon id reach the car. Stage a real wall collision and assert contact position, normal, and bounded impulse become one crash packet. Assert the delta-velocity fallback still fires when no usable direct contact exists.

- [ ] **Step 2: Run RED**

Expected: weapon still calls `take_damage(dmg)` and crashes have no packet.

- [ ] **Step 3: Route weapon hits**

For `ProtoCar3D`, call `take_impact()` with the ray query result. Use damage as energy and weapon-row `penetration` (safe floor by weapon class). Keep metal impact SFX/hit-stop rules unchanged.

- [ ] **Step 4: Capture direct contacts**

Enable contact monitoring with a bounded contact count. In `_integrate_forces`, select the strongest new contact above threshold, transform local contact facts to world, clamp impulse energy, and rate-limit duplicate resting contacts. Preserve the existing delta-velocity path as fallback/sanity cap.

- [ ] **Step 5: Run GREEN and traffic regression**

Run `vehicle_contact_sim`, `gunfeel_sim`, `vehicles_sim`, `traffic_sim`, and `stage4_sim` (alone).

- [ ] **Step 6: Commit**

```powershell
git add game/proto3d/weapon.gd game/proto3d/car_3d.gd game/proto3d/tests/vehicle_contact_sim.gd game/proto3d/tests/gunfeel_sim.gd
git commit -m "feat: route vehicle bullet and crash impacts"
```

---

### Task 6: Compact snapshot and campaign persistence

**Files:**
- Modify: `game/proto3d/car_3d.gd`
- Modify: `game/proto3d/proto3d.gd`
- Modify: `game/proto3d/tests/vehicle_deform_sim.gd`
- Modify: `game/proto3d/tests/save_sim.gd`

**Interfaces:**
- Extends `snapshot_damage()` with `impact: {version, zones, armor_durability, deformation_seed, marks}`.
- Extends `restore_damage(d: Dictionary)` and the campaign save with `vehicle_damage` records.

- [ ] **Step 1: Write RED round-trip and old-save tests**

Damage multiple zones, exhaust one armor face, create more marks than the cap, save, restore into a fresh identical car, and assert compact state plus generated transforms match. Apply a pre-L2 record without `impact` and assert a clean undented car with current component HP.

- [ ] **Step 2: Run RED**

Expected: impact state is absent from snapshots and campaign save.

- [ ] **Step 3: Extend car snapshot/restore**

Store severity/durability/seed/mark summaries only. Never serialize mesh transforms or vertices. Restore clears visual state and regenerates it deterministically.

- [ ] **Step 4: Add campaign vehicle records**

`save_game()` writes `vehicle_damage` as ordered `{index, vclass, damage}` records for live real cars. `apply_save()` restores only when index and `vclass` agree; mismatches and old saves are ignored safely. The standalone lab never calls either path.

- [ ] **Step 5: Run GREEN**

Run `vehicle_deform_sim`, `save_sim`, `garage_sim`, and `traffic_sim`.

- [ ] **Step 6: Commit**

```powershell
git add game/proto3d/car_3d.gd game/proto3d/proto3d.gd game/proto3d/tests/vehicle_deform_sim.gd game/proto3d/tests/save_sim.gd
git commit -m "feat: persist vehicle impact damage"
```

---

### Task 7: Playable standalone Impact Bay

**Files:**
- Create: `game/proto3d/tools/physics_lab/lab_impact_bay.gd`
- Modify: `game/proto3d/tools/physics_combat_lab.gd`
- Modify: `game/proto3d/tools/physics_lab/lab_hud.gd`
- Create: `game/proto3d/tests/impact_bay_sim.gd`
- Create: `game/proto3d/tests/impact_bay_sim.tscn`

**Interfaces:**
- Produces: `ProtoLabImpactBay.setup(lab: Node3D, origin: Vector3)`, `cycle_vehicle()`, `cycle_zone()`, `cycle_preset()`, `apply_selected()`, `reset()`, and `facts()`.

- [ ] **Step 1: Write RED playable-bay sim**

Assert lab boot creates a light car and armored SUV at the Vehicle Damage Bay; real gunfire produces a mark/dent; selected 9mm/rifle/heavy/crash presets resolve differently; Z/X/P/C controls cycle vehicle/zone/preset/apply; reset restores both exact clean snapshots; campaign save timestamp stays unchanged.

- [ ] **Step 2: Run RED**

Expected: dedicated bay controller and controls do not exist.

- [ ] **Step 3: Build the bay**

Spawn frozen collision-active real `ProtoCar3D` rigs on contrasting pads with face signs and a physical crash wall. Synthetic C-key packets use the same `take_impact()` path as real weapons/contacts. The crash preset is explicitly labeled a contact-energy reproducer, not a replacement physics implementation.

- [ ] **Step 4: Surface telemetry and controls**

The HUD reports selected rig/face/preset, energy/penetration, armor before/after, absorbed/remaining energy, zone severity, mark count/cap, panel count, last source, and impact processing microseconds. Add bottom-rail copy: `Z vehicle · X face · P energy · C apply · Backspace reset` without hiding L1 controls.

- [ ] **Step 5: Run GREEN and visible QA**

Run `impact_bay_sim`, `physics_lab_sim`, `directional_armor_sim`, and `vehicle_deform_sim`; then launch `PHYSICS_LAB.bat` and capture day/night and Camera Truth Wall views proving dents/marks read at gameplay distance.

- [ ] **Step 6: Commit**

```powershell
git add game/proto3d/tools/physics_lab/lab_impact_bay.gd game/proto3d/tools/physics_combat_lab.gd game/proto3d/tools/physics_lab/lab_hud.gd game/proto3d/tests/impact_bay_sim.*
git commit -m "feat: add playable vehicle impact bay"
```

---

### Task 8: L2 performance budget, documentation, and final integration

**Files:**
- Modify: `game/proto3d/tools/physics_lab/lab_chaos.gd`
- Modify: `game/proto3d/tests/impact_bay_sim.gd`
- Modify: `docs/design/PHYSICS_COMBAT_LAB.md`
- Modify: `docs/PHYSICS_LAB_PLAYTEST.md`

**Interfaces:**
- Consumes every prior L2 task.
- Produces a playable, documented, evidence-backed L2 milestone.

- [ ] **Step 1: Extend RED performance assertions**

At 20 damaged cars × 16 marks and maximum authored dent panels, assert idle frames allocate no new nodes/resources, impact work occurs only on packet application, cap counts remain exact, and chaos telemetry names the first exceeded CPU/physics/draw/load budget without degrading quality.

- [ ] **Step 2: Run RED then implement only missing counters**

Add explicit `impact_us`, `deform_events`, `mark_reuses`, `damaged_cars`, and `damage_panels` facts. Do not invent GPU milliseconds; retain draw calls/objects as the honest render proxy.

- [ ] **Step 3: Update docs**

Set design status to `L1–L2 SHIPPED · L3–L4 PLANNED`. Extend the playtest guide with Impact Bay controls, light-versus-armored acceptance, crash setup, snapshot behavior, performance cap, and known cosmetic-collision boundary.

- [ ] **Step 4: Full verification**

Run all four L2 sims plus `physics_lab_sim`, `gunfeel_sim`, `vehicles_sim`, `traffic_sim`, `save_sim`, `garage_sim`, `traction_sim` if present, `motorcycle_sim` if present, `vehicle_shape_sim` if present, and `stage4_sim` alone. Run `git diff --check` and scan for screenshots/user exports/unrelated files.

- [ ] **Step 5: Independent review and commit**

Request a read-only review against this plan; fix every Critical/Important item and rerun affected tests.

```powershell
git add docs/design/PHYSICS_COMBAT_LAB.md docs/PHYSICS_LAB_PLAYTEST.md game/proto3d/tools/physics_lab/lab_chaos.gd game/proto3d/tests/impact_bay_sim.gd
git commit -m "feat: complete vehicle impact bay l2"
```

---

## Plan self-review

### Spec coverage

- Stable hull/event-driven modular dents: Tasks 3 and 8.
- One bullet/crash packet and local zones: Tasks 1 and 5.
- Existing directional armor and durability: Task 2.
- Shallow/penetrating/heavy behavior: Task 2.
- Armor threshold and bounded transforms: Tasks 2–3.
- Fixed mark pool and failed-hit rule: Task 4.
- Traffic promotion compatibility: Task 5 regressions; full presentation starts only on `ProtoCar3D`.
- Compact deterministic persistence: Task 6.
- Playable standalone bay and gameplay-distance readability: Task 7.
- Explicit performance budget/no silent degradation: Task 8.
- Old callers, old saves, traction, motorcycle, vehicle, traffic, gunfeel: Tasks 2, 5, 6, and 8.

### Placeholder scan

The plan contains no TBD/TODO, unnamed test step, deferred error handling, or implied soft-body work. L3 Spectacles and L4 BACKROOMS '84 remain separate approved plans, not L2 placeholders.

### Type/interface consistency

- Every producer uses the Task 1 packet dictionary.
- `ProtoCar3D.take_impact()` is the only runtime armor/component/visual entry point.
- Weapon, contact capture, and the lab controller all call that same entry point.
- The visual component owns transforms/marks/snapshot facts but never component HP or collision.
- `snapshot_damage()` remains the persistence boundary used by campaign and lab reset.

## Execution handoff

The owner already requested implementation in this session. Execute inline with `superpowers:executing-plans`, stop after each committed task for a quick diff/test checkpoint, and do not merge into main until the complete L2 review gate passes.
