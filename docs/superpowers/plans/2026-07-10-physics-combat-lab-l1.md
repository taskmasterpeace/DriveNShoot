# Physics & Combat Lab L1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the standalone, save-free Physics & Combat Lab with three comparable body modes, shared controls, improved gun/throw/gaze systems, nonlethal sparring, and the ten approved diagnostic tools.

**Architecture:** The lab is an isolated `Node3D` scene that consumes the real input, puppet, weapon, character, vehicle, and perception laws through small adapters. A normalized command packet drives every body mode. F1 wraps the existing deterministic `ProtoPlayer3D`; F2/F3 share one articulated rigid-body rig with different data profiles. Campaign-facing improvements (driving gaze, trigger modes, muzzle FX, radial selection, throwable math) are implemented as focused reusable components and proven independently before the lab consumes them.

**Tech Stack:** Godot 4.5.1 · GDScript 2.0 with static typing · `CharacterBody3D` · `RigidBody3D` · `Generic6DOFJoint3D` · CanvasLayer/Control UI · JSON data rows · headless Godot sims.

## Global Constraints

- `res://` is `game/`; never write `res://game/`.
- Static typing is required. Dictionary element reads that feed typed variables receive explicit types.
- New content is data-rowed; code provides additive defaults and unknown JSON fields survive.
- The lab never reads or writes the campaign save and never advances campaign time.
- All body modes receive identical commands, stats, weapons, surfaces, and scenario seeds.
- Sound assets and voice ids are untouched; code may emit existing or new stable sound-event ids.
- Driving gaze, weapon aim, and vehicle forward remain separate directions.
- No main-game FOV distance change is allowed until instrumentation reproduces a distance failure.
- Nonlethal lab rounds create no corpse, wound, crime, loot loss, or death counter.
- No purple UI or debug colors.
- Each task starts with a failing sim, runs the focused sim green, then runs adjacent regressions.
- Commits contain only files from that task and never add `Co-Authored-By` trailers.

---

## File Map

### Shared campaign components

- Create `game/proto3d/drive_gaze.gd` — bounded driving head/gaze resolver.
- Create `game/proto3d/weapon_wheel.gd` — reusable radial selection UI and tap/hold state.
- Create `game/proto3d/throwable.gd` — data fold, charge, launch, and preview math.
- Create `game/data/throwables.json` — grenade row and forward-compatible throwable schema.
- Modify `game/proto3d/proto3d.gd` — wire gaze, automatic hold-fire, radial, and throw charge.
- Modify `game/proto3d/puppet.gd` — low-ready sprint carry, gaze joint setter, grip diagnostics.
- Modify `game/proto3d/weapon.gd` — trigger/muzzle rows, Scrap SMG, one accepted-shot FX path.
- Modify `game/proto3d/fx.gd` — pooled/capped data-driven muzzle flashes.
- Modify `game/data/input_bindings.json` — radial action; RB/RMB tap/hold grammar.
- Modify `game/data/items.json` and `game/proto3d/test_grounds.gd` — Scrap SMG content/surfacing.

### Standalone lab

- Create `PHYSICS_LAB.bat` — direct launcher.
- Create `game/proto3d/tools/physics_combat_lab.tscn` — standalone scene.
- Create `game/proto3d/tools/physics_lab/lab_command.gd` — normalized timestamped command packet.
- Create `game/proto3d/tools/physics_lab/lab_input.gd` — keyboard/mouse/pad command producer.
- Create `game/proto3d/tools/physics_lab/lab_body_adapter.gd` — F1 adapter contract.
- Create `game/proto3d/tools/physics_lab/lab_physical_body.gd` — shared F2/F3 articulated rig.
- Create `game/proto3d/tools/physics_lab/lab_profiles.gd` and `game/data/physics_profiles.json` — physical tuning rows.
- Create `game/proto3d/tools/physics_lab/lab_opponent.gd` — passive/return/hunter/duel AI.
- Create `game/proto3d/tools/physics_lab/lab_round.gd` — nonlethal scoring/reset.
- Create `game/proto3d/tools/physics_lab/lab_hud.gd` — controls, telemetry, mode/scenario cards.
- Create `game/proto3d/tools/physics_lab/lab_replay.gd` — Mirror Run and Black Box state buffer.
- Create `game/proto3d/tools/physics_lab/lab_diagnostics.gd` — X-ray, gaze/FOV, metrics.
- Create `game/proto3d/tools/physics_lab/lab_calibration.gd` — controller oscilloscope and lab presets.
- Create `game/proto3d/tools/physics_lab/lab_surface.gd` — surface carousel and condition staging.
- Create `game/proto3d/tools/physics_lab/lab_camera_wall.gd` — synchronized gameplay/broadcast views.
- Create `game/proto3d/tools/physics_lab/lab_scenario.gd` and `game/data/lab_scenarios.json` — deterministic Scenario Deck.
- Create `game/proto3d/tools/physics_lab/lab_chaos.gd` — network and load-budget simulation.
- Create `game/proto3d/tools/physics_lab/lab_verdict.gd` — `user://physics_lab/` ratings/export.
- Create `game/proto3d/tools/physics_combat_lab.gd` — station construction and orchestration.

### Focused sims

- Create `drive_gaze_sim`, `weapon_radial_sim`, `automatic_fire_sim`, `muzzle_visibility_sim`, `throw_charge_sim`, `physics_lab_sim`, `body_compare_sim`, `sparring_sim`, `fov_direction_sim`, `lab_replay_sim`, `lab_bonus_tools_sim`, and `lab_verdict_sim` `.gd/.tscn` pairs under `game/proto3d/tests/`.

---

### Task 1: Bounded driving gaze component

**Files:**
- Create: `game/proto3d/drive_gaze.gd`
- Modify: `game/proto3d/proto3d.gd:951-969,1099-1147,4506-4521`
- Modify: `game/proto3d/puppet.gd:980-1011`
- Test: `game/proto3d/tests/drive_gaze_sim.gd`
- Test scene: `game/proto3d/tests/drive_gaze_sim.tscn`

**Interfaces:**
- Produces: `ProtoDriveGaze.update(delta, car_basis, yaw_rate, aim_world, aim_active, source) -> Vector3`.
- Produces: `ProtoDriveGaze.local_yaw`, `source`, `idle_s`, and `reset()` for telemetry.
- Produces: `ProtoPuppet.set_gaze_yaw(local_yaw: float)`.

- [ ] **Step 1: Write the failing pure resolver sim**

Create a sim that advances 600 frames of constant right turn and asserts `abs(local_yaw) <= deg_to_rad(35.1)`, then releases the turn for 180 frames and asserts `abs(local_yaw) < deg_to_rad(2.0)`. Feed a mouse aim at local +70°, assert gaze reaches +65°..+80°, then remove aim and assert return. Feed a +150° aim and assert the head remains below 80.1°.

```gdscript
var gaze := ProtoDriveGaze.new()
for _i in 600:
	gaze.update(1.0 / 60.0, Basis.IDENTITY, -0.7, Vector3.ZERO, false, "turn")
_check("circle cannot wind the neck", absf(gaze.local_yaw) <= deg_to_rad(35.1))
for _i in 180:
	gaze.update(1.0 / 60.0, Basis.IDENTITY, 0.0, Vector3.ZERO, false, "returning")
_check("released turn returns forward", absf(gaze.local_yaw) < deg_to_rad(2.0))
```

- [ ] **Step 2: Run the sim and verify RED**

Run:
`C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe --headless --path game res://proto3d/tests/drive_gaze_sim.tscn`

Expected: parser failure because `ProtoDriveGaze` does not exist.

- [ ] **Step 3: Implement the resolver**

Use one local angle and critically damped velocity; never integrate world yaw.

```gdscript
class_name ProtoDriveGaze
extends RefCounted

const TURN_LIMIT := deg_to_rad(35.0)
const AIM_LIMIT := deg_to_rad(80.0)
const LOOK_AHEAD_S := 0.55
const OMEGA := 9.0

var local_yaw: float = 0.0
var yaw_velocity: float = 0.0
var idle_s: float = 99.0
var source: String = "returning"

func reset() -> void:
	local_yaw = 0.0
	yaw_velocity = 0.0
	idle_s = 99.0
	source = "returning"

func update(delta: float, car_basis: Basis, yaw_rate: float, aim_world: Vector3,
		aim_active: bool, source_in: String) -> Vector3:
	idle_s = 0.0 if aim_active else idle_s + delta
	var target: float = clampf(yaw_rate * LOOK_AHEAD_S, -TURN_LIMIT, TURN_LIMIT)
	source = "turn" if absf(target) > 0.01 else "returning"
	if aim_active and aim_world.length_squared() > 0.001:
		var local: Vector3 = car_basis.inverse() * aim_world.normalized()
		target = clampf(atan2(-local.x, -local.z), -AIM_LIMIT, AIM_LIMIT)
		source = source_in
	var accel: float = OMEGA * OMEGA * (target - local_yaw) - 2.0 * OMEGA * yaw_velocity
	yaw_velocity += accel * delta
	local_yaw = clampf(local_yaw + yaw_velocity * delta, -AIM_LIMIT, AIM_LIMIT)
	return (car_basis * Vector3(-sin(local_yaw), 0.0, -cos(local_yaw))).normalized()
```

- [ ] **Step 4: Wire real mouse/pad activity and vision**

Add `_drive_gaze`, `_drive_look_idle`, and `_drive_look_source` fields to `proto3d.gd`. Reset the timer on meaningful `InputEventMouseMotion` while driving and in `_update_pad()` when right-stick length exceeds 0.25. In `_update_vision_cone()`, replace velocity-facing with the resolver output. Keep `aim_direction()` unchanged for bullets. In `_pose_exposed_rider()`, call `player.puppet.set_gaze_yaw(_drive_gaze.local_yaw)` after `pose_riding()`.

```gdscript
var aim_active: bool = _drive_look_idle < 0.55
facing = _drive_gaze.update(delta, active_car.global_basis,
	active_car.angular_velocity.y, aim_direction(), aim_active, _drive_look_source)
```

- [ ] **Step 5: Run focused and adjacent sims**

Run `drive_gaze_sim`, `vision_sim`, `aim_sim`, `pad_sim`, and `bike_rider_sim`.

Expected: all report `ALL CHECKS PASSED`; the drive-gaze sim includes mouse/pad ownership, bounded circle, return, and weapon-aim independence.

- [ ] **Step 6: Commit**

```powershell
git add game/proto3d/drive_gaze.gd game/proto3d/proto3d.gd game/proto3d/puppet.gd game/proto3d/tests/drive_gaze_sim.*
git commit -m "feat: add bounded driving gaze"
```

### Task 2: Trigger modes and Scrap SMG

**Files:**
- Modify: `game/proto3d/weapon.gd:12-115`
- Modify: `game/proto3d/proto3d.gd:666-681,1000-1035`
- Modify: `game/data/items.json`
- Modify: `game/proto3d/test_grounds.gd:85-100`
- Modify: `game/proto3d/tests/weapon_shape_sim.gd`
- Modify: `game/proto3d/tests/balance_sim.gd`
- Test: `game/proto3d/tests/automatic_fire_sim.gd/.tscn`

**Interfaces:**
- Produces: weapon row field `trigger_mode: "semi" | "auto" | "burst"`.
- Produces: `ProtoWeapon.is_automatic() -> bool`.
- Produces: real `scrap_smg` weapon/item using `9mm`.

- [ ] **Step 1: Write the failing automatic-fire sim**

Instantiate the real main scene, equip a 30-round `scrap_smg`, hold the real `drivn_fire` action for 0.62 s, release, and assert 4–7 rounds fired. Advance 0.4 s after release and assert the magazine no longer changes. Repeat with pistol and assert a hold consumes exactly one round.

- [ ] **Step 2: Run RED**

Expected: `ProtoWeapon.WEAPONS` has no `scrap_smg` and the sim fails before firing.

- [ ] **Step 3: Add trigger rows and SMG shape**

Add `trigger_mode: "semi"` to pistol/shotgun/pipe rocket, `"auto"` to car MG, and this row:

```gdscript
"scrap_smg": {"name": "Scrap SMG", "emoji": "🔫", "behavior": Behavior.HITSCAN,
	"damage": 8.0, "mag_size": 30, "ammo": "9mm", "cooldown": 0.12,
	"spread_deg": 5.5, "range": 38.0, "reload_s": 1.35, "trigger_mode": "auto",
	"fire_sfx": "shot_mg", "hit_stop": false,
	"recoil": {"kick_pitch": 0.055, "torso_jolt": 0.025, "stagger_threshold": 0.4},
	"hand_pose": {"offset": Vector3(-0.05, 0.11, -0.03), "two_handed": true,
		"grip_r": Vector3(0.0, 0.0, 0.07), "grip_l": Vector3(0.0, -0.02, -0.16)}},
```

Add a receiver/barrel/stock/magazine shape with `muzzle_z = 0.42`. Add `is_automatic()` as a direct row read. Add an `items.json` weapon entry using 9 mm and stock one in the Test Grounds armory.

- [ ] **Step 4: Poll held fire through the one cooldown gate**

After `wpn.tick(delta, self)` in the main physics loop:

```gdscript
if _fire_down and mode == Mode.FOOT and wpn != null and wpn.is_automatic() \
		and not panel.is_open and _reload_t <= 0.0 and wpn.mag > 0:
	fire_equipped()
```

The input event still fires the first shot. `ProtoWeapon.can_fire()`/`_cd` remains the only cadence gate. Do not loop or use a second timer.

- [ ] **Step 5: Extend content/balance coverage and run GREEN**

Add `scrap_smg` to weapon shape coverage and ranged balance arrays. Assert DPS is 30–80 and its silhouette differs from pistol/shotgun.

Run `automatic_fire_sim`, `weapon_shape_sim`, `balance_sim`, `gunfeel_sim`, and `pad_sim`.

- [ ] **Step 6: Commit**

```powershell
git add game/proto3d/weapon.gd game/proto3d/proto3d.gd game/data/items.json game/proto3d/test_grounds.gd game/proto3d/tests/automatic_fire_sim.* game/proto3d/tests/weapon_shape_sim.gd game/proto3d/tests/balance_sim.gd
git commit -m "feat: add automatic weapon trigger mode"
```

### Task 3: Pooled, weapon-authored muzzle flashes

**Files:**
- Modify: `game/proto3d/fx.gd:1-35`
- Modify: `game/proto3d/weapon.gd:405-420`
- Modify: `game/proto3d/proto3d.gd:2674-2705`
- Test: `game/proto3d/tests/muzzle_visibility_sim.gd/.tscn`

**Interfaces:**
- Produces: `ProtoFX.muzzle_flash(parent, pos, dir, row := {})`.
- Modifies: `ProtoWeapon.fire(main, from, aim_dir, fx_parent := null)` so one accepted shot emits one flash/casing pair.

- [ ] **Step 1: Write failing flash pool assertions**

Fire 40 SMG shots through the real weapon path. Assert `fx_flash` children never exceed 12 per host, inactive nodes remain pooled, the flash origin is within 0.08 m of `muzzle + dir * authored_offset`, and pistol/shotgun/SMG rows produce distinct lengths.

- [ ] **Step 2: Run RED**

Expected: current flashes self-free and `muzzle_fx` rows/pool state do not exist.

- [ ] **Step 3: Implement reusable flash nodes**

Add an inner `FlashSlot extends Node3D` with two crossed emissive BoxMesh blades and one OmniLight3D. `play()` updates meshes/material/light, sets `_life`, and enables processing. At expiry it hides and disables processing without freeing. Store slots by parent instance id; clean invalid arrays on lookup; cap at 12 and reuse the oldest active slot.

```gdscript
const FLASH_CAP := 12
static var _flash_pools: Dictionary = {}

static func muzzle_flash(parent: Node, pos: Vector3, dir: Vector3, row: Dictionary = {}) -> void:
	var pool: Array = _valid_pool(parent)
	var slot: FlashSlot = _idle_slot(pool)
	if slot == null and pool.size() < FLASH_CAP:
		slot = FlashSlot.new()
		parent.add_child(slot)
		pool.append(slot)
	if slot == null:
		slot = pool[0] as FlashSlot
	slot.play(pos, dir, row)
```

- [ ] **Step 4: Add muzzle rows and remove vehicle duplication**

Add per-gun `muzzle_fx` dictionaries. Pass `w.get("muzzle_fx", {})` from `ProtoWeapon.fire`. Add optional `fx_parent`; use it for both flash and casing. In `fire_from_vehicle()`, pass `active_car` and delete the second direct flash/casing pair.

- [ ] **Step 5: Run GREEN and regressions**

Run `muzzle_visibility_sim`, `gunfeel_sim`, `automatic_fire_sim`, `stage4_sim`, and `mount_sim`.

- [ ] **Step 6: Commit**

```powershell
git add game/proto3d/fx.gd game/proto3d/weapon.gd game/proto3d/proto3d.gd game/proto3d/tests/muzzle_visibility_sim.*
git commit -m "feat: make muzzle flashes authored and pooled"
```

### Task 4: Tap/hold weapon radial

**Files:**
- Create: `game/proto3d/weapon_wheel.gd`
- Modify: `game/data/input_bindings.json:20-28`
- Modify: `game/proto3d/proto3d.gd:30-40,660-790,930-1035`
- Test: `game/proto3d/tests/weapon_radial_sim.gd/.tscn`

**Interfaces:**
- Produces: `ProtoWeaponWheel.create()`, `configure(ids, current)`, `begin_hold()`, `update_pointer(vec)`, `release() -> String`, `tap_cycle() -> String`, and `is_open`.

- [ ] **Step 1: Write failing pure selection and input-path tests**

Assert tap returns the next id, hold under 0.18 s remains a tap, hold over 0.18 s opens, a rightward vector selects the right wedge, center selects fists, and release closes. Push RB events and RMB events through a minimal host and assert parity.

- [ ] **Step 2: Run RED**

Expected: no `ProtoWeaponWheel` or `drivn_weapon_wheel` action.

- [ ] **Step 3: Build the radial component**

Use a full-rect `CanvasLayer` with a dim overlay, eight `Polygon2D` wedges, center circle, item labels, and amber active stroke. Selection is pure angle math:

```gdscript
func selection_for(pointer: Vector2) -> int:
	if pointer.length() < 0.28:
		return 0
	var angle: float = wrapf(atan2(pointer.y, pointer.x) + PI * 0.5, 0.0, TAU)
	return 1 + int(floor(angle / TAU * float(maxi(1, _ids.size() - 1)))) % maxi(1, _ids.size() - 1)
```

The component owns no inventory and returns an id only.

- [ ] **Step 4: Rebind RB/RMB into one tap/hold action**

Add `drivn_weapon_wheel` with `mouse:right` and `joy:rb`. Remove RB from `drivn_weapon_next`; keep backtick as direct next-weapon. Remove right mouse from retired binocular bindings if present. On press start timing; after 0.18 s open; while open feed mouse-from-center or raw right stick; on release either cycle or equip returned id. Freeze player input while the panel is open. Restore the previous `Engine.time_scale` instead of forcing 1.0.

- [ ] **Step 5: Run GREEN and regressions**

Run `weapon_radial_sim`, `pad_sim`, `input_map_sim` if present, `controls_sim` if present, `aim_sim`, and `options_sim`.

- [ ] **Step 6: Commit**

```powershell
git add game/proto3d/weapon_wheel.gd game/data/input_bindings.json game/proto3d/proto3d.gd game/proto3d/tests/weapon_radial_sim.*
git commit -m "feat: add tap hold weapon radial"
```

### Task 5: Reusable charged throwable system

**Files:**
- Create: `game/proto3d/throwable.gd`
- Create: `game/data/throwables.json`
- Modify: `game/proto3d/proto3d.gd:730-765,2659-2670`
- Modify: `game/proto3d/weapon.gd:523-555`
- Test: `game/proto3d/tests/throw_charge_sim.gd/.tscn`

**Interfaces:**
- Produces: `ProtoThrowable.row(id)`, `charge_for(held_s, row)`, `launch_velocity(dir, charge, strength, mass, inherited, row)`, and `predict(origin, velocity, gravity, steps, dt)`.
- Produces: `ProtoThrowable.Projectile` using the same gravity/velocity values as preview.

- [ ] **Step 1: Write failing math and real-input tests**

Assert charge ordering (`tap < half < full`), stronger character throws farther, heavier item travels less, inherited horizontal velocity is preserved, and predicted point 10 matches a projectile advanced 10 fixed steps within 0.03 m. Through real G press/hold/release, assert inventory is removed on release—not press—and one projectile appears.

- [ ] **Step 2: Run RED**

Expected: class and data file missing; current G immediately consumes and throws fixed velocity.

- [ ] **Step 3: Implement additive rows and shared math**

Code-floor grenade row:

```gdscript
{"id": "grenade", "mass": 0.5, "tap_charge": 0.45, "charge_s": 0.9,
 "speed_min": 7.0, "speed_max": 15.0, "up_min": 3.6, "up_max": 7.2,
 "gravity": 12.0, "fuse_s": 1.6, "blast": 5.0, "damage": 55.0,
 "lab_damage": 0.0, "lab_stun": 1.2}
```

Launch formula:

```gdscript
var power: float = lerpf(float(row["speed_min"]), float(row["speed_max"]), charge)
power *= clampf(0.82 + 0.035 * float(strength), 0.82, 1.24)
power *= sqrt(0.5 / maxf(mass, 0.1))
var up: float = lerpf(float(row["up_min"]), float(row["up_max"]), charge)
return dir.normalized() * power + Vector3.UP * up + inherited * 0.65
```

- [ ] **Step 4: Wire press/hold/release and preview**

Press enters throw pose and stores previous stance; hold updates charge and a 24-segment line from `predict`; release validates/removes inventory and spawns. Cancel on panel open, death, vehicle entry, or weapon-wheel open without consuming inventory. Fuse begins on release.

- [ ] **Step 5: Run GREEN and regressions**

Run `throw_charge_sim`, `stage4_sim`, `pad_sim`, `items_sim`, and `save_sim`.

- [ ] **Step 6: Commit**

```powershell
git add game/proto3d/throwable.gd game/data/throwables.json game/proto3d/proto3d.gd game/proto3d/weapon.gd game/proto3d/tests/throw_charge_sim.*
git commit -m "feat: add charged throwable system"
```

### Task 6: Low-ready sprint and grip diagnostics

**Files:**
- Modify: `game/proto3d/puppet.gd:563-735,889-945,1050-1060`
- Modify: `game/proto3d/player_3d.gd:423-450,512-520`
- Modify: `game/proto3d/weapon.gd` hand-pose rows
- Modify: `game/data/motions.json`
- Test: `game/proto3d/tests/run_form_sim.gd`
- Test: `game/proto3d/tests/grip_ik_sim.gd`
- Create test: `game/proto3d/tests/low_ready_sim.gd/.tscn`

**Interfaces:**
- Produces: weapon `carry_class`, `elbow_pole_l`, and pistol two-hand firing grip rows.
- Produces: `ProtoPuppet.grip_metrics() -> Dictionary` with centimeter errors and elbow angles.
- Produces: `ProtoPuppet.sprint_blend` and `low_ready_blend` sim hooks.

- [ ] **Step 1: Extend tests RED**

Assert pistol raised has both hands within 3 cm of grips, shotgun elbows remain 20°–145°, full sprint with a firearm sets low-ready blend >0.9, muzzle pitches down/diagonal relative to firing pose, and firing/stance drives the blend back below 0.1 before a shot is accepted.

- [ ] **Step 2: Run RED**

Expected: pistol is one-handed, no carry class/poles/metrics/low-ready blend.

- [ ] **Step 3: Add carry rows and diagnostic API**

Pistol becomes two-hand firing with `grip_l` at the frame/trigger-guard. `carry_class` values are `pistol`, `long_gun`, `heavy`, and `melee`. `grip_metrics()` returns exact world distances and elbow flex from current transforms.

- [ ] **Step 4: Layer low-ready over sprint**

Drive sprint form from actual `_was_running`, not raw speed alone. For pistols, pull both hands close to sternum and muzzle 25° down. For long guns, rotate diagonally across chest, stock near shoulder, support elbow bent. `player_3d.gd` rejects firing until `_was_running` has ended and `low_ready_blend < 0.35`; the press enters stance and the accepted shot occurs as soon as the raise transition crosses the gate, capped at 0.18 s.

- [ ] **Step 5: Run GREEN and render evidence**

Run `low_ready_sim`, `run_form_sim`, `grip_ik_sim`, `rig_v2_sim`, `recoil_sim`, and the existing body photobooth to compare normal gameplay views.

- [ ] **Step 6: Commit**

```powershell
git add game/proto3d/puppet.gd game/proto3d/player_3d.gd game/proto3d/weapon.gd game/data/motions.json game/proto3d/tests/low_ready_sim.* game/proto3d/tests/run_form_sim.gd game/proto3d/tests/grip_ik_sim.gd
git commit -m "feat: add tactical low ready sprint"
```

### Task 7: Normalized lab command/input layer

**Files:**
- Create: `game/proto3d/tools/physics_lab/lab_command.gd`
- Create: `game/proto3d/tools/physics_lab/lab_input.gd`
- Test: `game/proto3d/tests/body_compare_sim.gd/.tscn`

**Interfaces:**
- Produces: immutable-per-frame `ProtoLabCommand` fields `stamp`, `move`, `aim_world`, `sprint`, `dive_pressed`, `fire_pressed`, `fire_held`, `fire_released`, `reload_pressed`, `throw_pressed`, `throw_held`, `throw_released`, `radial_pressed`, `radial_held`, `radial_released`, and `interact_pressed`.
- Produces: `ProtoLabInput.sample(camera, origin, delta) -> ProtoLabCommand` and `feed_for_test(command)`.

- [ ] **Step 1: Write RED parity tests**

Feed keyboard/mouse-shaped input and pad-shaped input that represent the same move/aim/fire state. Assert every normalized field matches. Assert edge fields occur exactly once and held fields persist.

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Implement the typed packet and sampler**

```gdscript
class_name ProtoLabCommand
extends RefCounted

var stamp: int = 0
var move: Vector3 = Vector3.ZERO
var aim_world: Vector3 = Vector3.FORWARD
var sprint: bool = false
var dive_pressed: bool = false
var fire_pressed: bool = false
var fire_held: bool = false
var fire_released: bool = false
var reload_pressed: bool = false
var throw_pressed: bool = false
var throw_held: bool = false
var throw_released: bool = false
var radial_pressed: bool = false
var radial_held: bool = false
var radial_released: bool = false
var interact_pressed: bool = false

func duplicate_frame() -> ProtoLabCommand:
	var out := ProtoLabCommand.new()
	for p in get_property_list():
		var name: StringName = p["name"]
		if name in [&"stamp", &"move", &"aim_world", &"sprint", &"dive_pressed", &"fire_pressed",
			&"fire_held", &"fire_released", &"reload_pressed", &"throw_pressed", &"throw_held",
			&"throw_released", &"radial_pressed", &"radial_held", &"radial_released", &"interact_pressed"]:
			out.set(name, get(name))
	return out
```

- [ ] **Step 4: Run GREEN**

Run `body_compare_sim` command-only phase and `pad_sim`.

- [ ] **Step 5: Commit**

```powershell
git add game/proto3d/tools/physics_lab/lab_command.gd game/proto3d/tools/physics_lab/lab_input.gd game/proto3d/tests/body_compare_sim.*
git commit -m "feat: add shared physics lab commands"
```

### Task 8: Standalone scene, launcher, and F1 hybrid adapter

**Files:**
- Create: `PHYSICS_LAB.bat`
- Create: `game/proto3d/tools/physics_combat_lab.tscn`
- Create: `game/proto3d/tools/physics_combat_lab.gd`
- Create: `game/proto3d/tools/physics_lab/lab_body_adapter.gd`
- Create: `game/proto3d/tools/physics_lab/lab_hud.gd`
- Test: `game/proto3d/tests/physics_lab_sim.gd/.tscn`

**Interfaces:**
- Produces: `ProtoLabBodyAdapter.apply_command(command, delta)`, `combat_body()`, `muzzle_world()`, `set_weapon(id)`, `reset_at(transform)`, `metrics()`, and `set_condition(row)`.
- Produces: `ProtoPhysicsCombatLab.switch_mode(id)`, `start_scenario(id)`, and `reset_station()`.

- [ ] **Step 1: Write RED boot/isolation/station test**

Instantiate the standalone scene and assert: no `ProtoMenu`, no save file access, active mode `hybrid`, player can move by fed command, five named stations exist, HUD names controls, resetting restores transform/health/ammo, and `Engine.time_scale` is restored on exit.

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Add launcher and scene**

`PHYSICS_LAB.bat` uses the exact Godot path and `--path "%~dp0game" res://proto3d/tools/physics_combat_lab.tscn`.

The `.tscn` contains one `Node3D` using `physics_combat_lab.gd`. The script creates WorldEnvironment, sun, floor, station signs, camera, body lane, grip/gaze range, dive/throw lane, killhouse, and vehicle-bay shell using `ProtoWorldBuilder.box_visual/box_body`.

- [ ] **Step 4: Implement F1 adapter**

Wrap a real `ProtoPlayer3D` with `use_player_input = false`; translate commands into its existing packet:

```gdscript
_player.packet = {"move": cmd.move, "dive": cmd.dive_pressed,
	"sprint": cmd.sprint, "crouch": false}
_player.set_aim_intent(cmd.aim_world)
```

The lab exposes `player = adapter.combat_body()` plus a real `ProtoCharacter` so `ProtoWeapon` can use its existing context. XP/audio methods are safe no-ops/event logs.

- [ ] **Step 5: Build readable HUD**

Use dark brown/charcoal panels, amber/teal status, no purple. Show mode, station, controls, weapon/ammo, condition, opponent behavior, FPS, physics ms, grip error, speed error, dive metrics, gaze/aim yaw, and active tool toggles.

- [ ] **Step 6: Run GREEN and launch visibly**

Run `physics_lab_sim`, then launch `PHYSICS_LAB.bat`, move/sprint/dive/fire/reset, and capture one screenshot in `user://physics_lab/` for manual comparison only.

- [ ] **Step 7: Commit**

```powershell
git add PHYSICS_LAB.bat game/proto3d/tools/physics_combat_lab.tscn game/proto3d/tools/physics_combat_lab.gd game/proto3d/tools/physics_lab/lab_body_adapter.gd game/proto3d/tools/physics_lab/lab_hud.gd game/proto3d/tests/physics_lab_sim.*
git commit -m "feat: add standalone physics combat lab"
```

### Task 9: F2/F3 articulated physical bodies

**Files:**
- Create: `game/proto3d/tools/physics_lab/lab_profiles.gd`
- Create: `game/data/physics_profiles.json`
- Create: `game/proto3d/tools/physics_lab/lab_physical_body.gd`
- Modify: `game/proto3d/tools/physics_combat_lab.gd`
- Extend test: `game/proto3d/tests/body_compare_sim.gd`

**Interfaces:**
- Produces: profiles `active_ragdoll` and `full_physics` with identical mass/speed/stamina and different motor/balance/root-control gains.
- Produces: physical body duck interface identical to Task 8 adapter.

- [ ] **Step 1: Write RED physical invariants**

Spawn each profile, feed identical commands for 10 s, and assert: all positions/velocities finite; joint count >= 10; no part separates >1.2 m from its parent; active ragdoll reaches at least 75% commanded speed; full physics moves via forces; dive creates airborne/contact/recovery metrics; reset restores all parts; body count returns to baseline after switch.

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Add profile rows**

```json
{
  "profiles": {
    "active_ragdoll": {"pose_kp":45.0,"pose_kd":8.0,"balance_kp":80.0,"balance_kd":12.0,"velocity_gain":220.0,"move_force":900.0,"dive_impulse":7.5},
    "full_physics": {"pose_kp":16.0,"pose_kd":5.0,"balance_kp":24.0,"balance_kd":7.0,"velocity_gain":0.0,"move_force":650.0,"dive_impulse":8.5}
  }
}
```

- [ ] **Step 4: Build the shared articulated rig**

Create pelvis, torso, head, upper/lower arms, hands, upper/lower legs, and feet as RigidBody3D boxes with unique shapes/materials. Connect parent/child pairs using Generic6DOFJoint3D with locked linear axes and anatomical angular limits. Store `part`, `parent`, `rest_basis`, and `target_basis` dictionaries.

Apply PD torque per part:

```gdscript
var error: Basis = part.global_basis.inverse() * target_basis
var q: Quaternion = error.get_rotation_quaternion()
var axis: Vector3 = q.get_axis()
var angle: float = wrapf(q.get_angle(), -PI, PI)
part.apply_torque(part.global_basis * axis * angle * _pose_kp - part.angular_velocity * _pose_kd)
```

Active ragdoll adds pelvis force toward desired velocity. Full physics applies only directional force and balance torque. Both use the same target-pose generator for idle/run/low-ready/dive/throw/grip.

- [ ] **Step 5: Implement physical weapon/grip contract**

Attach weapon visual to right hand. Apply bounded spring force to left hand toward `grip_l` and torque the forearm toward an elbow-pole plane. Report both hand errors. Firing recoil applies opposite impulse at muzzle. Melee applies target-pose stages and physical lunge/arm torque.

- [ ] **Step 6: Wire F1/F2/F3 switching**

F1/F2/F3 destroys the previous adapter/rig after snapshotting transform, selection, condition, aim, opponent, and station. Instantiate the new mode, restore snapshot, set lab `player` to its combat body, and assert no old physics nodes remain.

- [ ] **Step 7: Run GREEN and stability soak**

Run `body_compare_sim` plus a 5-minute headless soak alternating modes every 10 s. Expected: zero NaN/INF, no leaked bodies/joints, watchdog not fired.

- [ ] **Step 8: Commit**

```powershell
git add game/proto3d/tools/physics_lab/lab_profiles.gd game/data/physics_profiles.json game/proto3d/tools/physics_lab/lab_physical_body.gd game/proto3d/tools/physics_combat_lab.gd game/proto3d/tests/body_compare_sim.*
git commit -m "feat: add active and full physics lab bodies"
```

### Task 10: Nonlethal opponent and round controller

**Files:**
- Create: `game/proto3d/tools/physics_lab/lab_opponent.gd`
- Create: `game/proto3d/tools/physics_lab/lab_round.gd`
- Create: `game/data/lab_opponents.json`
- Modify: `game/proto3d/tools/physics_combat_lab.gd`
- Test: `game/proto3d/tests/sparring_sim.gd/.tscn`

**Interfaces:**
- Produces: behaviors `passive`, `return_fire`, `hunter`, `duel`.
- Produces: `ProtoLabRound.hit(fighter_id, amount, tags)`, `knockdown`, `ring_out`, `score`, `reset_round`, and best-of-three match state.

- [ ] **Step 1: Write RED behavior/safety tests**

Assert passive never initiates, return-fire attacks only after hit, hunter searches last-known position and respects walls, duel damages both sides and reaches a winner, depletion resets fighters at corners, and no corpse/save/crime/wound/death counter appears.

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Implement data-driven opponent**

Rows expose `reaction_s`, `accuracy_deg`, `aggression`, `cover_bias`, `weapon_id`, `health`, and `martial_arts`. Use NavigationAgent3D only inside the lab nav region; LOS is a direct ray excluding both fighters. Search stores last seen position for a bounded 4 s.

- [ ] **Step 4: Implement round scoring**

Score health depletion = round, knockdown = 2 points, clean melee combo = 1, ring-out = round. On round end freeze commands for 1.2 s, show card, reset health/ammo/rig transforms, then resume. Campaign `ProtoCharacter` is not mutated; adapters route hits to lab health first.

- [ ] **Step 5: Run GREEN and regressions**

Run `sparring_sim`, `melee_sim`, `unarmed_sim`, `aim_sim`, and `gunfeel_sim`.

- [ ] **Step 6: Commit**

```powershell
git add game/proto3d/tools/physics_lab/lab_opponent.gd game/proto3d/tools/physics_lab/lab_round.gd game/data/lab_opponents.json game/proto3d/tools/physics_combat_lab.gd game/proto3d/tests/sparring_sim.*
git commit -m "feat: add nonlethal lab sparring"
```

### Task 11: Gaze/FOV station and X-ray diagnostics

**Files:**
- Create: `game/proto3d/tools/physics_lab/lab_diagnostics.gd`
- Modify: `game/proto3d/tools/physics_combat_lab.gd`
- Modify: `game/proto3d/tools/physics_lab/lab_hud.gd`
- Test: `game/proto3d/tests/fov_direction_sim.gd/.tscn`

**Interfaces:**
- Produces: `snapshot(body, target, camera, vision) -> Dictionary` with forward/gaze/weapon yaw, source, distance, on-screen, cone, LOS, fade, transparency, joint/contact/grip facts.
- Produces: `set_xray(enabled)`.

- [ ] **Step 1: Write RED station/diagnostic tests**

Assert targets exist at 5/10/20/30/50/75/100/150/240 m, one wall and door produce LOS transitions, turn/aim/return sources are named, visible head yaw and cone direction match within 2°, weapon aim may exceed head yaw without moving the cone, and X-ray creates labeled debug geometry for every body mode.

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Implement diagnostic snapshots**

Use `Camera3D.is_position_behind`, `unproject_position`, `ProtoVisionCone` hooks, direct LOS, body `metrics()`, and `Performance.get_monitor`. Draw joint axes/contact normals/grip anchors with reusable ImmediateMesh nodes and Label3D tags; hide and disable updates when X-ray is off.

- [ ] **Step 4: Add station toggles**

Buttons/actions cycle day/night, clear/dust, headlights, binocular view, zoom, door open/closed, target distance, and X-ray. Distance toggles are instrument-only; do not change main cone constants.

- [ ] **Step 5: Run GREEN**

Run `fov_direction_sim`, `drive_gaze_sim`, `vision_sim`, `vision_reach_sim`, `visibility_sim`, and `fade_sim`.

- [ ] **Step 6: Commit**

```powershell
git add game/proto3d/tools/physics_lab/lab_diagnostics.gd game/proto3d/tools/physics_combat_lab.gd game/proto3d/tools/physics_lab/lab_hud.gd game/proto3d/tests/fov_direction_sim.*
git commit -m "feat: add physics lab xray and gaze diagnostics"
```

### Task 12: Mirror Run and Black Box replay

**Files:**
- Create: `game/proto3d/tools/physics_lab/lab_replay.gd`
- Modify: `game/proto3d/tools/physics_combat_lab.gd`
- Modify: `game/proto3d/tools/physics_lab/lab_hud.gd`
- Test: `game/proto3d/tests/lab_replay_sim.gd/.tscn`

**Interfaces:**
- Produces: rolling 20 s `record_command`, `record_snapshot`, `mark`, `freeze`, `seek`, `resume_from`, and `mirror_run`.

- [ ] **Step 1: Write RED bounded-buffer/determinism tests**

Record 30 s at 60 Hz; assert only newest 20 s remains. Add fire/contact markers, freeze, seek to each, restore two seconds earlier, and assert transform/state. Mirror one command trace to three stub modes and assert identical stamps/commands received.

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Implement bounded typed frames**

Use ring arrays sized 1200 commands and 1200 snapshots; no per-frame JSON. Snapshots carry mode, body transforms, velocities, weapon/ammo, condition, round state, opponent state, and RNG seed. Timeline markers carry frame index/type/label.

- [ ] **Step 4: Build Mirror Run lanes and controls**

Record 10–30 s, reset three lanes, spawn one body mode per lane, feed duplicate command frames at original stamps, and show synchronized cameras/ghost paths. Produce metric rows without a combined winner score.

- [ ] **Step 5: Run GREEN and memory check**

Run `lab_replay_sim` and a 10-minute record/clear loop. Expected memory returns to a stable band after clears.

- [ ] **Step 6: Commit**

```powershell
git add game/proto3d/tools/physics_lab/lab_replay.gd game/proto3d/tools/physics_combat_lab.gd game/proto3d/tools/physics_lab/lab_hud.gd game/proto3d/tests/lab_replay_sim.*
git commit -m "feat: add mirror and black box replay"
```

### Task 13: Input, surface, condition, and camera tools

**Files:**
- Create: `game/proto3d/tools/physics_lab/lab_calibration.gd`
- Create: `game/proto3d/tools/physics_lab/lab_surface.gd`
- Create: `game/proto3d/tools/physics_lab/lab_camera_wall.gd`
- Modify: `game/proto3d/tools/physics_combat_lab.gd`
- Modify: `game/proto3d/tools/physics_lab/lab_hud.gd`
- Test: `game/proto3d/tests/lab_bonus_tools_sim.gd/.tscn`

**Interfaces:**
- Produces: lab-only controller presets under `user://physics_lab/input_presets.json`.
- Produces: surface ids `asphalt`, `dirt`, `wet`, `mud`, `gravel`, `shallow_water`, `low_friction_debug`.
- Produces: condition presets `fresh`, `overloaded`, `hurt`, `exhausted`, `late_game_specialist`.

- [ ] **Step 1: Write RED tool isolation tests**

Assert five-second drift sampling recommends a deadzone above measured drift, presets do not modify `user://input_overrides.json`, tap/hold remains correct, identical command traces have ordered stopping/slide distances across surfaces, condition reset restores exact baseline, and five camera viewports track one subject without becoming current gameplay cameras.

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Implement calibration and oscilloscope**

Sample raw axes each frame, show raw/normalized values, calculate `recommended_deadzone = clamp(max_rest_magnitude + 0.04, 0.08, 0.35)`, expose response exponent/trigger threshold/sensitivity/rumble/hold threshold, and save named lab presets only.

- [ ] **Step 4: Implement surface carousel and condition dial**

Use real `ProtoTraction`/weather multipliers where applicable and a lab character-friction row for foot bodies. Rotate/select physical lane panels rather than teleporting during a recorded run. Condition presets feed the shared condition packet to every body.

- [ ] **Step 5: Implement Camera Truth Wall**

Create five SubViewports/cameras: top-down drive, on-foot 3D, chase candidate, high tactical, and broadcast. Toggle updates; when hidden, set SubViewport update mode disabled. Add day/night/dust/headlight/flash presets.

- [ ] **Step 6: Run GREEN**

Run `lab_bonus_tools_sim`, `pad_sim`, `traction_sim`, `water_sim`, `camera_lab_sim`, and `split_view_sim`.

- [ ] **Step 7: Commit**

```powershell
git add game/proto3d/tools/physics_lab/lab_calibration.gd game/proto3d/tools/physics_lab/lab_surface.gd game/proto3d/tools/physics_lab/lab_camera_wall.gd game/proto3d/tools/physics_combat_lab.gd game/proto3d/tools/physics_lab/lab_hud.gd game/proto3d/tests/lab_bonus_tools_sim.*
git commit -m "feat: add physics lab comparison tools"
```

### Task 14: Scenario Deck, chaos testing, and Verdict Book

**Files:**
- Create: `game/proto3d/tools/physics_lab/lab_scenario.gd`
- Create: `game/data/lab_scenarios.json`
- Create: `game/proto3d/tools/physics_lab/lab_chaos.gd`
- Create: `game/proto3d/tools/physics_lab/lab_verdict.gd`
- Modify: `game/proto3d/tools/physics_combat_lab.gd`
- Modify: `game/proto3d/tools/physics_lab/lab_hud.gd`
- Test: `game/proto3d/tests/lab_scenario_sim.gd/.tscn`
- Test: `game/proto3d/tests/lab_verdict_sim.gd/.tscn`

**Interfaces:**
- Produces: deterministic scenario rows and `start(id, seed)`.
- Produces: command transport presets `local`, `good_coop`, `bad_wifi`, `hostile_jitter`.
- Produces: verdict JSON/Markdown only beneath `user://physics_lab/verdicts/`.

- [ ] **Step 1: Write RED deterministic/export tests**

Start each approved scenario twice with the same seed; assert matching bodies, positions, loadouts, AI, weather, and opening events. Assert simulated transport delivers commands within configured bounds and reports drops. Save a verdict, assert objective and subjective fields coexist, Markdown/JSON round-trip, and no file outside the lab user directory changes.

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Add eight concrete scenario rows**

Rows: `pistol_duel`, `smg_suppression`, `martial_arts_bout`, `cover_two`, `low_light_hunt`, `vehicle_gunner_pass`, `armored_penetration`, and `tournament_final`. Each row explicitly contains seed, body modes, spawn transforms, loadouts, opponent rows, surface, weather, camera preset, and win condition.

- [ ] **Step 4: Implement transport/load chaos**

Queue duplicate commands with delivery timestamp; seeded RNG applies latency/jitter/loss. Load sliders spawn known counts of spectator impostors, fighters, rigid props, flashes, marks, and cars. Report render/script/physics time and the first exceeded authored budget; never auto-degrade during recording.

- [ ] **Step 5: Implement Verdict Book UI/storage**

Rating fields are integers 1–10 for feel/control/weight/readability/fun. Record note, mode, weapon, surface, camera, condition, scenario, metrics, replay id, and UTC timestamp. Confirm before clear-all. Export grouped comparisons without calculating one composite winner.

- [ ] **Step 6: Run GREEN**

Run `lab_scenario_sim`, `lab_verdict_sim`, `net_sim`, `network_fill_sim`, and `stream_budget_sim`.

- [ ] **Step 7: Commit**

```powershell
git add game/proto3d/tools/physics_lab/lab_scenario.gd game/data/lab_scenarios.json game/proto3d/tools/physics_lab/lab_chaos.gd game/proto3d/tools/physics_lab/lab_verdict.gd game/proto3d/tools/physics_combat_lab.gd game/proto3d/tools/physics_lab/lab_hud.gd game/proto3d/tests/lab_scenario_sim.* game/proto3d/tests/lab_verdict_sim.*
git commit -m "feat: add physics lab scenarios and verdicts"
```

### Task 15: L1 integration, visual QA, and documentation

**Files:**
- Modify: `game/proto3d/tests/physics_lab_sim.gd`
- Modify: `docs/design/PHYSICS_COMBAT_LAB.md`
- Create: `docs/PHYSICS_LAB_PLAYTEST.md`

**Interfaces:**
- Consumes every prior task.
- Produces a double-clickable, documented L1 and a green verification record.

- [ ] **Step 1: Extend the end-to-end sim RED before final wiring**

Drive real input through: boot → F1 sprint/dive/fire/throw → radial SMG → nonlethal duel → F2 → F3 → gaze circle/mouse return → X-ray → record/replay → surface/condition → scenario → verdict export → reset. Assert save path untouched and all temporary bodies freed on quit.

- [ ] **Step 2: Run the sim and capture the first failure**

Run `physics_lab_sim` with a 180 s watchdog. Expected before final wiring: at least one missing end-to-end connection.

- [ ] **Step 3: Add only the missing integration connections**

Connect scene actions/HUD signals to existing component methods. Do not add new mechanics in this step. Update the design status to `L1 SHIPPED` only after all acceptance checks pass.

- [ ] **Step 4: Run focused suite**

Run all L1 sims from Tasks 1–14 plus `rig_v2_sim`, `grip_ik_sim`, `run_form_sim`, `recoil_sim`, `gunfeel_sim`, `aim_sim`, `vision_sim`, `pad_sim`, `stage4_sim`, `vehicles_sim`, `traffic_sim`, `save_sim`, and `test_grounds_sim`.

Expected: every process exits 0 and prints `ALL CHECKS PASSED`.

- [ ] **Step 5: Hands-on playtest**

Launch `PHYSICS_LAB.bat` in a visible Godot window. Complete the DO→EXPECT card for all three bodies and ten bonus tools. Verify standard top-down readability in day/night, mouse/pad radial behavior, nonlethal resets, and no campaign save changes. Record exact FPS/physics ms at baseline and chaos budget limit.

- [ ] **Step 6: Write the playtest guide**

Document launcher, complete control table, stations, F1/F2/F3 differences, scenario cards, diagnostic toggles, verdict export path, reset/quit behavior, and known prototype limitations with concrete symptoms.

- [ ] **Step 7: Final diff and verification review**

Run `git diff --check`, inspect `git status --short`, confirm only intended files are staged, and ensure no `.superpowers`, screenshots, user exports, or unrelated untracked artifacts enter the commit.

- [ ] **Step 8: Commit L1 integration**

```powershell
git add docs/design/PHYSICS_COMBAT_LAB.md docs/PHYSICS_LAB_PLAYTEST.md game/proto3d/tests/physics_lab_sim.gd
git commit -m "docs: complete physics combat lab l1"
```

---

## Plan Self-Review

### Spec coverage

- Standalone/save isolation: Tasks 8 and 15.
- Three body modes/common commands: Tasks 7–9.
- Grip, sprint, dive, throw: Tasks 5, 6, 8, 9.
- Bounded driving gaze plus independent aim: Tasks 1 and 11.
- Pistol/shotgun/automatic/fists/grenade: Tasks 2, 5, 6, 8–10.
- Muzzle flashes and sound boundary: Tasks 2–3; no asset replacement.
- Nonlethal opponent/martial arts: Task 10.
- Radial mouse/pad grammar: Task 4.
- FOV direction/distance instrumentation: Task 11.
- Mirror Run, replay, X-ray: Tasks 11–12.
- Calibration, surfaces, conditions, camera wall: Task 13.
- Scenario deck, network/crowd chaos, Verdict Book: Task 14.
- Vehicle bay geometry exists in Task 8; visible deformation is intentionally L2 per the approved four-slice design.
- Spectacle Runtime and BACKROOMS '84 are intentionally L3/L4 and receive their own plans after L1.

### Placeholder scan

The plan contains no `TBD`, deferred error-handling instruction, or unnamed “write tests” step. Later-slice boundaries are explicit approved scope, not implementation placeholders.

### Type/interface consistency

- Every body supplies the Task 8 duck interface and `combat_body()` for `ProtoWeapon` context.
- Every input source produces `ProtoLabCommand` from Task 7.
- Replay/scenarios transport the same command and snapshot types.
- Diagnostics consume `metrics()` from both F1 adapter and F2/F3 physical rig.
- Verdict records consume diagnostics/replay ids without writing repository files.
