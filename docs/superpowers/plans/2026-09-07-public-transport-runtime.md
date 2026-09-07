# Public Transport Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LASTLINE coaches and KESTREL flights real, playable passenger services with safe ticketing, physical journeys, and screenshot-verified presentation.

**Architecture:** Reuse `ProtoCar3D`, existing passenger mode and atomic full-run checkpoints. Separate catalog/tickets, physical drivers, presentation, and session authority. Original Blender assets are already delivered and must be integrated, not replaced by generic boxes.

**Tech Stack:** Godot 4.5.1, statically typed GDScript 2.0, JSON rows, PowerShell 7 isolated runners, existing ENet session.

**Spec:** `docs/design/PUBLIC_TRANSPORT_RUNTIME.md`; parent contract `docs/design/PUBLIC_TRANSPORT.md`.

## Global Constraints

- Work only in `D:/git/carworld/.worktrees/america-foundation`, branch `codex/america-foundation`; preserve unrelated changes. Local scoped commits only; no push, merge, deploy or release export.
- Every engine/import run isolates APPDATA and LOCALAPPDATA under this worktree's build directory. No normal player profile, production service, or public port.
- Candidate ticket state and candidate carried scrip are written together; neither is published if the write fails.
- Road points remain authoritative and unmodified.
- No transform-driven traversal, hidden teleport, or disabled world.
- The player uses the existing passenger mode, with the authored seat rather than the generic cabin offset.
- No online client writes a local authority checkpoint, and client-supplied price, position, capacity or seat claims are not trusted by the host.
- Local/offline evidence is never MMO proof. Full-game completion additionally requires the still-open stability, content, national-world, authenticated-server, and long-session gates in HANDOFF.
- Use original cream/oxidized-green/amber LASTLINE and olive/orange KESTREL art. No purple. All input uses the existing shared actions and focusable controls.

## File structure and verification contract

New runtime modules live in `game/proto3d/transit/`. Every task owns its named
sim `.gd/.tscn/.gd.uid`. Keep runner logic in `tools/transit_runtime_check.ps1`:
parameters `-Mode import|headless|capture`, `-Sim ticket|vehicle|coach|flight|network|journey`;
map these to `transit_<Sim>_sim.tscn`. Both profile variables point into a fresh
UUID `build/transit-runtime-*` directory; reject reparse ancestors and paths
outside build. Use hidden owned child processes, a 120-second wall limit for the
ticket-only checks and a 180-second wall limit for physical/capture scenarios,
stdout/stderr/result JSON and source hashes. A sim refuses unsafe profile paths
before loading the main scene. Never kill unrelated processes. GPU captures
use `--capture-dir=<run>/captures`; snapshots are from the real viewport.

PS7 command prefix below is
`C:/Users/taskm/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe`.
Use `& '<prefix>' -File tools/transit_runtime_check.ps1 ...` from PowerShell.
RED is a behavioral failure before production implementation, not a parse typo.
Missing modules can be guarded with `ResourceLoader.exists` and a clear failing
check, then return cleanly; after modules exist, test their real behavior.

### Task 1: Catalog and atomic ticket lifecycle

**Files:**
- Create: `game/data/transit.json`
- Create: `game/proto3d/transit/catalog.gd`, `ticket_state.gd`
- Create: `tools/transit_runtime_check.ps1`
- Test: `game/proto3d/tests/transit_ticket_sim.gd`, `.tscn`, `.gd.uid`
- Read: `realm/atomic_checkpoint.gd`, `realm/road_life_state.gd`, `container.gd`, `usmap.gd`.

**Interfaces:**
- `class_name ProtoTransitCatalog extends RefCounted`
- `setup(rows: Dictionary, map: ProtoUSMap) -> bool`, `valid: bool`, `errors: PackedStringArray`
- `stops: Dictionary`, `services: Dictionary` contain validated deep-copied rows keyed by ID.
- `stop_position(id: String) -> Vector3` returns world standing point with ground height.
- `next_departure(service_id: String, now_minutes: float) -> float` returns the first headway multiple at or after now, using `ceil(now/headway)*headway`.
- `route_points(service_id: String) -> PackedVector3Array` returns only the ordered road lane-centre path at the stop fractions, including any intermediate road vertices. The pedestrian stop positions are not body-centre route endpoints; Task 3 composes apron approaches from authored boarding anchors. Shared road geometry determines offsets; no map mutation.
- `class_name ProtoTransitTicketState extends RefCounted`
- `setup(catalog: ProtoTransitCatalog, checkpoint_path: String, capture_run: Callable, publish_wallet: Callable) -> void`
- `record() -> Dictionary`, `valid_record(value: Variant) -> bool`, `restore(value: Dictionary) -> bool`
- `reserve(service_id: String, origin_id: String, departure: float, now: float, expected_serial: int, wallet: Dictionary) -> Dictionary`
- `board(serial: int, wallet: Dictionary) -> Dictionary`
- `finish(serial: int, reason: String, safe_stop: String, wallet: Dictionary) -> Dictionary`
- All operation results contain `ok: bool`, `code: String`. Successful finish additionally has `refund: int` and `safe_stop: String`. No process-node/player-mode mutation in this task; the orchestrator consumes the result.
- Record shape exactly `{version: 1, next_serial: int, ticket: Dictionary, last_end: Dictionary}`. Empty ticket/end are `{}`. Active ticket fields: `serial:int`, `service:String`, `origin:String`, `destination:String`, `departure:float`, `paid:int`, `phase:String` (`reserved` or `aboard`), `last_safe_stop:String`. Last end fields: `serial:int`, `reason:String`, `refund:int`, `safe_stop:String`. Require finite numbers, real integer serials/fares, known IDs, correct direction/fare, serial ordering, no unknown keys; use deep copies.

- [ ] **Step 1: Write real catalog/transaction failures and safe runner.**

Use actual map and `ProtoAtomicCheckpoint` file writes inside the isolated profile.
Capture callback can close over a dictionary run fixture containing a real
backpack dictionary and unrelated sentinel fields; publish callback updates that
fixture after successful disk commit. No mocked writer. A directory at the
checkpoint file path produces a real denied write. Expectations are literals:

```gdscript
check("service cannot exist without runtime catalog", ResourceLoader.exists("res://proto3d/transit/catalog.gd"))
# After dynamic loading once available:
check("new state does not create a checkpoint", not FileAccess.file_exists(path))
var bought: Dictionary = state.reserve("lastline_east", "meridian_east", 720.0, 710.0, 1, {"scrip": 5, "bandage": 1})
check("ticket debits carried scrip", bought.ok and published_wallet == {"scrip": 3, "bandage": 1})
check("duplicate serial cannot charge", not state.reserve("lastline_east", "meridian_east", 720.0, 710.0, 1, published_wallet).ok)
var ended: Dictionary = state.finish(1, "cancelled", "meridian_east", published_wallet)
check("one cancellation refunds paid fare", ended.ok and ended.refund == 2 and published_wallet.scrip == 5)
check("repeat refund rejected", not state.finish(1, "cancelled", "meridian_east", published_wallet).ok)
```

Also cover insufficient scrip; wrong origin/service; NaN/infinite/stale/non-scheduled
departure; negative/malformed wallet; stale/future serial; second active ticket;
board twice; arrival only aboard and at destination; cancellation only reserved;
failure/restart uses last safe stop and refunds once; voluntary early exit zero;
failed buy/board/refund leaves memory AND existing checkpoint unchanged; roundtrip
recovery; reject forged paid amount/unknown phase/extra keys/invalid serial.
Catalog rejects duplicate IDs, bad road IDs/fractions, same endpoint/fraction,
cross-road services unsupported by this initial corridor, nonpositive
headway/speed, negative fare, zero capacity, absent origin/destination, nonfinite
coordinates and unknown vehicle kinds. Test route points on the correct lane for
both directions and ensure original map points unchanged.

- [ ] **Step 2: Run import and ticket sim; retain behavioral RED output.**

Run `-Mode import -Sim ticket`, then `-Mode headless -Sim ticket`.
Expected RED reports missing catalog/ticket implementation and exits 1 without
reading any normal save. Missing-class stubs must not fake implementation.

- [ ] **Step 3: Implement rows/catalog and atomic candidate publication.**

Rows use version 1 with `stops` and `services` arrays. Stop fields are `id`,
`name`, `road`, `fraction` (fraction along source road points), `side` (-1/+1),
`shoulder_m` (8.0), `pad_offset_m` (18.0). `meridian_east`, named Meridian East,
uses fraction 0.96; `richmond`, named Richmond West, uses fraction 0.16 on
`CR-meridian-richmond`. Both are initially on the south
side; derive `side` correctly from the source road tangent, not its name.
Service fields: `id`, `name`, `kind` (`coach`/`helicopter`), `origin`, `destination`,
`fare`, `capacity`, `speed_mps`, `headway_minutes`, `boarding_minutes`, `risk`.
Create `lastline_east`, `lastline_west`, `kestrel_east`, `kestrel_west`. LASTLINE
values are 2, 6, 12.0; KESTREL 15, 3, 28.0; all headways 360.0 and boarding 30.0.
Risk text describes roadside attacks/breakdowns or weather/forced landings.
Direction is derived from the two stop fractions; do not add a redundant direction
field. East runs opposite the source road order; west runs with it.
Read `usmap.gd`'s loaded representation (world coordinates) and
`ProtoUSMap.road_geometry`, not raw JSON coordinate guesses.

Validate inputs before staging. Reservations require now within the 30-minute
boarding window ending at departure; booked departure equals the catalog's next
departure; expected serial equals `next_serial`. The current wallet is supplied
by the authoritative caller, not network data. Verify scrip is a nonnegative
integer, all item counts nonnegative integers, no unknown Variant objects.

```gdscript
var candidate: Dictionary = _record.duplicate(true)
var candidate_wallet: Dictionary = wallet.duplicate(true)
candidate_wallet["scrip"] = int(wallet.get("scrip", 0)) - int(service.fare)
candidate["next_serial"] = expected_serial + 1
# Build the exact ticket fields listed above, from validated catalog rows.
var run: Dictionary = capture_run.call().duplicate(true)
run["transit"] = candidate
run["player"]["backpack"] = candidate_wallet
var error: Error = ProtoAtomicCheckpoint.write(checkpoint_path, run)
if error != OK:
    return {"ok": false, "code": "checkpoint_failed"}
_record = candidate
publish_wallet.call(candidate_wallet.duplicate(true))
return {"ok": true, "code": "reserved"}
```

Share that commit routine across reserve/board/finish. Guard reentrant calls
during publication. Board changes only reserved->aboard for the matching serial.
Finish reasons exactly `cancelled`, `arrived`, `service_failed`, `restart`,
`early_exit`; cancelled requires origin, arrived requires destination, restart
requires the recorded last_safe_stop. Service_failed and early_exit require one
of this ticket's two route endpoints; the service controller must also prove
physical grounding and proximity before calling finish. Refund
cancelled/service_failed/restart; do not refund arrived/early_exit. A successful
finish clears ticket and records last_end. Invalid restore must leave old state
untouched; empty dictionary initializes the versioned default for old saves.

- [ ] **Step 4: Run ticket sim GREEN, self-review, scoped commit.**

Run import if adding classes, then ticket sim once after focused iterations;
check exit code, actual pass/fail count, stderr, exact profile/run paths. Do not
call a framework failure a pass. `git diff --check`; stage only Task 1 files and
commit `Add validated transit catalog and atomic ticket lifecycle`.

### Task 2: Original models as real service vehicles

**Files:**
- Modify: `game/proto3d/car_3d.gd`, `game/proto3d/data/data_library.gd`, `game/data/vehicles.json`
- Create: `game/proto3d/transit/vehicle.gd`
- Test: `game/proto3d/tests/transit_vehicle_sim.gd`, `.tscn`, `.gd.uid`
- Modify only if needed: `tools/transit_runtime_check.ps1`.

The Task 1 runner intentionally has only import/headless ticket mode. This task
adds `vehicle` and GPU capture plus the named compatibility scenes, with the
planned 180-second physical/capture limit; retain ticket's stricter 120-second
limit. Record the runner itself and actual scenario production dependencies in
source hashes. Do not advertise future absent scenario files as runnable.

**Interfaces:**
- Consumes Task 1 service rows and existing `ProtoCar3D.create`.
- Extend factory to `static create(vclass_in: String, body_color: Color, instance: ProtoCar3D = null) -> ProtoCar3D`; default preserves every existing caller.
- New row fields `model_path`, `authored_details: bool`, `model_ground_offset: float`, `max_brake: float`, `chassis`, `cabin`, `cabin_pos`, `wheels`. Fold known vector arrays into Vector3, never leak Array where the engine expects Vector3. The optional brake row retains the existing default 40 for ordinary vehicles.
- Optional `collision_boxes` is an array of `{name:String, size:[x,y,z], position:[x,y,z], door:bool}` in body-local metres; when present it replaces the generic solid chassis collider. Door boxes disable only after an opened-door transition; closed doors remain collision-bearing. Use floor, wall spans, nose/tail and roof boxes matching the hollow GLBs, not one cabin-filling cube.
- Mark both rows `service_only: true`; `DrivnData.fleet(include_services: bool = false) -> Array` excludes these from the existing ordinary racing selector by default. Explicit tooling may request inclusion. Do not change random traffic selections or add helicopter road racers.
- `class_name ProtoTransitVehicle extends ProtoCar3D`, `static make(kind: String) -> ProtoTransitVehicle`, `anchor_world(anchor_name: String) -> Vector3`, `set_door_open(open: bool) -> void`, `passenger_anchor(seat: int) -> Node3D`.
- `service: Node = null`, `service_kind: String`, `doors_open: bool`. `can_disembark() -> bool` requires stopped and doors open; aircraft additionally grounded by a ray/collision contact.

- [ ] **Step 1: Add failing real factory/physics/capture checks.**

```gdscript
check("authored service can be created", ResourceLoader.exists("res://proto3d/transit/vehicle.gd"))
# Once present, instantiate on real collision ground, do not advance via transforms.
check("coach has all six reachable anchors", coach.passenger_anchor(5) != null)
check("door is a moving authored part", door.global_transform != closed_transform)
check("moving service rejects exit", not coach.can_disembark())
```

Catch half-scale models, duplicate opaque stock cabin windows, missing wheels,
any of the six coach or three helicopter seat anchors missing, incorrect factory
subclass, donor row mutation, wheel
centres at wrong heights, cabin/chassis intersections at seat or entry paths.
Drive coach through actual throttle/brake on collision ground, assert displacement
and stopped distance; sample positions every physics frame to reject teleport.
Render front, open door/cabin and coach driving views with the runtime car body.

- [ ] **Step 2: Run vehicle RED, then implement minimal factory hooks.**

`-Mode headless -Sim vehicle` initially fails service creation. Preserve old
generic details for old rows. For `authored_details=true`, do not add stock
opaque cabin meshes, fake wheel meshes or unrelated family geometry. Use
GLB `lastline_coach.glb` and `kestrel_courier.glb` paths already under assets/transit.
Coach wheel centres are X +/-1.10, Y 0.5, front Z -1.95, rear Z 2.7, radius 0.5.
Calibrate chassis origin/COM/suspension against grounded model, not screen size.
Coach mass 4800, engine_force 14500, top_speed 16, service cap 12, max_brake 220.
The initial real braking run showed 35.4m travel over four seconds with the
old brake value and still 3.47m/s. Use the existing pedal then handbrake at low
speed, preserving ordinary reverse-pedal behavior. Retain the original stopping
requirement and regression-check that ordinary vehicles still default to 40.
Do not force linear/angular velocity or transforms to make the stop pass. Helicopter
mass 1450; no wheel-driven propulsion; flight driver will own its forces.
Reparent the four authored wheel meshes onto the real suspension wheels and
preserve their correctly oriented mesh basis. They must roll, steer and compress
with those wheels, not remain rigid in the body while hidden wheels do the work.

```gdscript
var car: ProtoCar3D = instance if instance != null else ProtoCar3D.new()
# Existing factory builds this instance; no duplicate copy of factory code.
var model_path: String = String(s.get("model_path", GLB_BODY_DIR + _glb_body_name(vclass, s) + ".glb"))
```

Door animation rotates coach hinge about local Y; helicopter door slides aft.
Keep collision out of the visible doorway when open; no closed solid collision
box over every passenger seat. Authored cabin roof can fade for passenger camera
without removing collision or passenger model. Defer flight force controller to
Task 4, do not claim flight from hovering staged art.

- [ ] **Step 3: Run vehicle + ticket + existing data/grip regression GREEN and capture.**

Use isolated runner for all scenes (extend allowlist with `data`, `grip_ik` if
needed, same profile safeguards). Personally inspect three runtime captures.
Record actual results; commit scoped files `Integrate authored transit rigs with real vehicle physics`.

### Task 3: Playable LASTLINE corridor and passenger interface

**Files:**
- Create: `game/proto3d/transit/service.gd`, `coach_driver.gd`, `stop.gd`, `panel.gd`
- Modify: `game/proto3d/proto3d.gd`, `game/proto3d/transit/vehicle.gd`
- Modify: `game/data/transit.json`, relevant production-row assertions in `game/proto3d/tests/transit_ticket_sim.gd`; `game/proto3d/world_stream.gd` only as needed for real, persistent service-footprint clearance.
- Modify: `tools/transit_runtime_check.ps1` to add only the existing/introduced scenarios named below, plus optional `-EngineVerbose` to append Godot `--verbose` for the repeated safety-shutdown leak diagnostic. Defaults, isolation, source recording and time caps remain unchanged; arguments record whether verbosity was enabled.
- Test: `game/proto3d/tests/transit_coach_sim.gd`, `.tscn`, `.gd.uid`
- Read: `docs/design/UI_DESIGN_LANGUAGE.md` and the controller's corridor scout; this is a player-facing panel, not the test-ground diagnostic overlay.
- Modify only if its existing API is insufficient: `game/proto3d/hud_3d.gd` for truthful service-passenger hints/state, preserving ordinary driver controls and presentation; also the verified shared surface-label defect below.
- Modify: `game/proto3d/car_3d.gd` only for the shared occupant-aware roadkill hook and the later attributed inactive/dead brake seam described below; ordinary body behavior remains unchanged.
- Modify only as required by the review's death handoff: `game/proto3d/cloning.gd` for shared pure wake preparation used by existing clone wake and transit; no clone schema change. Include the existing clone regression if touched.
- Modify/test: `game/proto3d/tests/transit_vehicle_sim.gd` only for the inactive-brake default/ordinary-wreck/free-rolling regression, preserving its existing physical brake and ride-height checks.
- Modify/test: `game/proto3d/tests/clone_ritual_sim.gd` only to free its attributed unparented round-trip probe after the existing assertion; confirm that probe is invalid while main.cloning remains valid. Preserve all ritual checks; no unrelated production teardown change.

**Interfaces:**
- Consumes exact Task 1 catalog/ticket methods and Task 2 vehicle/anchors.
- `class_name ProtoTransitService extends Node3D`, `setup(main: Node) -> void`; fields `catalog`, `state`, `panel`, `vehicles: Dictionary`, `stops: Dictionary`.
- `is_riding() -> bool`, `request_exit() -> bool`, `passenger_position() -> Vector3`, `restore_run(data: Dictionary) -> bool`, `record() -> Dictionary`.
- `fleet_record() -> Dictionary` returns sibling full-run key `transit_fleet`, exactly `{version: 1, coach_stop: "meridian_east"|"richmond"}` in Task 3. The reviewed `transit` ticket shape stays unchanged. `vehicles["lastline_coach"]` is one stable physical coach shared by both directional service rows; only a row originating at its actual safe stop is available.
- `class_name ProtoCoachDriver extends Node`, `setup(car: ProtoTransitVehicle, points: PackedVector3Array, speed: float) -> void`; signals `arrived`, `failed(reason: String)`.
- `ProtoTransitPanel` uses `is_open`, `open(stop_id: String)`, `close()`; focusable buttons have stable action metadata for sims.
- `ProtoCar3D.carries_character(body: Node3D) -> bool` defaults to the existing player-driver roadkill exemption, and is consulted at that existing exemption only. Transit overrides it for the actually seated local rider: matching body, service.is_riding(), and main.active_car == self. No other vehicle/character gets immunity; external combat/impact damage remains live.

- [ ] **Step 1: Write input-driven failing trip and checkpoint recovery checks.**

```gdscript
await action("interact") # after staging the player beside a real stop
check("stop opens one shared service panel", main.transit.panel.is_open)
await activate("reserve:lastline_east") # GUI input; no direct ticket mutation
await activate("board")
check("paid character occupies real passenger seat", main.passenger_of_ai and main.transit.is_riding())
# Track frame-to-frame bus motion and world clock until arrival, not teleport.
check("road journey made physical progress", furthest_from_origin > 100.0 and largest_step < 2.0)
check("arrival leaves living rider on clear ground", main.mode == main.Mode.FOOT and main.character.hp > 0)
```

Cover out-of-range boarding, held fire/movement during panel, mouse/pad focus,
double purchase, no take-wheel exploit, exit while moving, blocked exit, real
obstacle braking, failed checkpoint before boarding, reserve/aboard save reload
recovering at safe origin with one refund, corrupt transit refusing entire save.
The actual Boarding-anchor range is 3m, distinct from the ticket-counter's
3.5m reading radius. Assert a valid reserved passenger at 2.99m is admitted and
at 3.01m is denied; retain the stopped/open/grounded and ticket checks.
Include the side of the Boarding anchor away from the counter: admission must
not require the intersection of the two radii. Keep non-spatial eligibility
separate from counter-reading proximity.
Prove real interact opens the same Board action at that eligible door-side
position; a true predicate with an inaccessible counter-gated panel is not
usable boarding. Initial ticket purchase remains at the counter. Use the
existing service/panel/vehicle interaction path, never a second panel or
recursive can_open/can_board predicates.
Also reject present malformed/extra-key/unknown-stop fleet records before any
live restore. Test arrival -> save with no active ticket -> reload with exactly
one coach still at the destination and the reverse service available. A failed
arrival checkpoint must not publish destination fleet state or ticket completion.
The west scenario may start from an explicitly staged initial no-ticket fleet
checkpoint at Richmond, never a teleport after boarding; label this setup.
Reload lifecycle coverage must continue through actual reverse reserve, boarding
and departure after the old driver has been freed. Detach the matching vehicle's
`ai_driver` before freeing it, including when retaining a healthy coach.
Named `reboard_east`/`reboard_west` fixtures may create a real driver by physical
departure, then explicitly apply a staged destination checkpoint and exercise
reverse boarding/departure. These are lifecycle fixtures, not arrival evidence;
the separate full east/west journey checks remain unchanged.

The named `death` fixture must board through real input, kill the passenger
through real damage, then press the existing R action for both ordinary and
clone wake paths. Before any live respawn mutation, atomically stage the final
safehouse/clone wake position and character, deaths+1, existing 40% scrap/30%
scrip toll on pre-refund carried inventory, then one full fare refund; finish
the ticket as `service_failed` with unchanged last-terminal fleet state. This
is explicit death respawn, not roadside egress. Failed writes preserve the dead
rider's respawn-owned fields, ticket, wallet, deaths, clone backup/journal and
disabled ownership until R retry succeeds. Ordinary world time remains live;
derive expected hunger changes from the actual hunger-cadence clock and existing
2.8/game-hour law rather than freezing it or ignoring character differences.
Success clears stale passenger ownership and restores real
player processing/colliders/camera; actual movement must work after waking.
Halt/preserve the coach and disable sales for the session; replacement only on
reload. Never duplicate the clone revival/fever/defect policy; extract shared
pure preparation if needed. Preserve ordinary non-transit respawn. Scenario
watchdogs and the180s process cap remain unchanged; record the command/RED/GREEN.
Regression: the moving AI coach must not roadkill its own seated passenger;
preserve the ordinary driver exemption and roadkill against non-occupants.
The first actual trip reproduced self-roadkill destroying the coach; retain
that damage-source RED evidence before applying the occupant hook.
For a genuinely failed roadside service, test actual safe egress, denied-write
retry, exactly one refund, actual saved foot position and one reload replacement.
Require completed physical parking and actual linear speed below 0.1m/s for
service_failed egress, in addition to the existing grounded/upright/angular/clear
exit gates. With a driver present, both its completed parking transition and
measured speed are required. Test a real E request with a valid writer while
the wreck is still rolling below 0.5m/s but above 0.1m/s: no exit or refund. Deny
the writer before yielding more frames so automatic egress after parking cannot
consume the later explicit denied-write/retry fixture. After real parking, press
the real exit action with the denied writer, then restore it and retry. Retain the 0.2m
post-exit wreck-displacement bound and normal terminal egress rules. Diagnostic
RED measured 0.347532m drift over 0.73s at roughly 0.34m/s with dead=true and reservation
correctly unavailable; do not treat this as a teleport or loosen the tolerance.

The review-fix covering pass exposed a separate dead-coach braking defect.
Focused RED7a128abf14/1 records a real100m approach16.853wall/16.767physics
seconds, then20.507wall/20.533physics seconds to park after damage. All four
wheels contact ground, but effective body/wheel brake remains3.0 despite a
driver demand0.7 and the existing coach max_brake220. The base inactive/dead
early return ignores the driver's controls. Keep the combined40s fixture
deadline and165/180s outer caps; report approach and braking clocks separately.
Add `inactive_brake_force() -> float` to the base car with its exact existing
3.0 default /0.4 free-rolling result, and use it only at that return. The transit
override may honor the existing pedal/handbrake demand and surface brake factor
only for a dead stable LASTLINE body, its owning offline service, and a matching
running ProtoCoachDriver. Actual VehicleBody/wheel brake physics supplies the
stop; engine_force stays0. Restore the ordinary idle brake once parking finishes.
No transform/velocity assignment, extra damping, artificial ground force or
gravity/damage/collision suppression. Verify effective brakes and real parking,
ordinary wreck/trailer defaults and the existing stopped suspension check.
Named `emergency_brakes` diagnostics use the same guarded runner and unchanged
caps; the complete safety/physical journeys remain required.
The stronger brake can stop the bus during a multi-frame press/release helper.
Observe the actual input decision, not the helper's later completion: send real
E press/release at the rolling boundary and positively verify handler delivery
on both edges before checking unchanged ticket/wallet/ownership/checkpoint.
Record wallet-publication speed and driver-running state; no success may publish
while either stationarity condition is false. A pre-callback physics-frame sample
of old brake3.0 is not the post-callback effective brake; log the direct hook and
the real body/wheels after their physics callback. These are expectation/sampling
corrections, not slower brakes, new production test APIs or looser thresholds.

Clone-ritual covering run03c9170f is15/0 with240bytes of shutdown diagnostics,
not pristine. Verbose5aae300e identifies a detached probe Node retaining
cloning.gd, created by the sim's round-trip fixture and never freed. Only this
owned fixture cleanup is authorized. Preserve both logs and require a normal
clean covering run; do not attribute the older safety leaks to this different
fixture without evidence.

- [ ] **Step 2: Run coach RED; implement real service around main interfaces.**

Hook setup after road-life and game-deck are available; capture_save adds transit.
Validate transit before road-life/player restoration. Recovery is staged with
the incoming save wallet, committed before exposing the recovered run. Never
apply live-mode mutation on failed write. Avoid call recursion via capture_run.
Old saves omit transit -> empty state. Only an omitted `transit_fleet` gets the
legacy Meridian fleet default; a present malformed record rejects restore.
Main capture and service capture callbacks include the fleet sibling. Arrival
stages the destination fleet row in the same atomic ticket-finish write before
publishing the safe-stop change. Pending-ticket restart uses the ticket's
recorded last safe stop ahead of an inconsistent fleet stop. Validate both
records before any live run mutation. Stop panels join `_gameplay_input_blocked`
and `_unhandled_input` modal ownership. Public vehicles intercept main's
`take_wheel`, `_exit_car`, `_pose_cab_driver`; ordinary motorists unchanged.
`_stop_handheld_session` runs on arrival/death/emergency.
Seat anchors locate the pelvis, not the character's foot-origin. The existing
puppet hip joint rests at local Y 0.90; position the rider from its actual hip
transform so head and shoulders do not protrude through the roof. Verify the
result visually and with transformed pelvis/seat distance, rather than simply
assigning the player's root position to a seat anchor.

```gdscript
# In main's existing passenger exit/pose paths:
if transit != null and transit.is_riding():
    transit.request_exit()
    return
# In driver: control the real drivetrain, not global_transform.
car.input_throttle = throttle
car.input_brake = brake_amount
car.input_steer = steer_amount
```

Use speed-dependent lookahead and curvature braking, front collision probes,
final stop tolerance 2 metres and speed below 0.5. A persistent obstruction
stops/fails the service rather than teleporting. Stop signage/shelter/lighting
must be placed clear of road lanes using catalog geometry. Present actual next
departure, fare, duration, risk, baggage and refund rules; UI colors from spec.
Follow the UI language's standard panel: viewport-clamped fixed rect, scrollable
variable content, first-action focus, visible close button and Escape/pad-cancel
paths, shared prompts/toasts/sounds, and dual Xbox/PlayStation button labels.
Test each close path and fitting at the supported small viewport. The physical
destination sign and waiting vehicle introduce the service; exact fare,
departure minutes and refund terms require the readable ticket board because
vehicle appearance cannot convey those contractual details.
While aboard, the HUD must show actual passenger actions and route/departure
state, not advertise throttle/steering/handbrake or taking the public driver's
seat. Verify the visible hints as well as input behavior.

The actual corridor is authored gravel; the existing dashboard incorrectly
labels every non-road surface DIRT. Correct only the known surface display
labels (gravel, dirt_road/dirt, water; road remains quiet), including bogging copy
that must not claim dirt on another surface. Preserve severity/tire/drive-factor
logic and authored grip. Add real dashboard-method/payload label assertions and
record the actual sampled surface during a journey; no renderer/traction change.

Ticket-board action rows need deliberate amber focus/hover styling and readable fare/departure
hierarchy; avoid a tall mostly-empty panel. The physical stop must visibly read
as a shelter and marked waiting/apron area. Practical lamps should illuminate
night boarding without washing the midday ground with strong light cones.
Unavailable physical coach cannot sell a ticket. Off-line local orchestration
is explicit until Task 5 supplies host authority; do not spoof online support.
Compose physical apron paths outside the road lanes. The pedestrian standing
point is not the coach's parking origin. For both directions the right-side door
must open toward a protected waiting area, not into a live lane; a shared
south-side terminus requires a real turning/apron path for westbound departures.
Test both directions, clear turning radius, and cross-traffic yielding at merges.
Finish the inherited drivetrain's braking transition by releasing pedal and
handbrake inputs and setting `is_active=false` below 0.1m/s. Task 2 diagnostics
found that indefinitely holding the existing low-speed handbrake fights the
suspension through its component-wise velocity writes. Verify stable resting
ride height after arrival; do not zero velocity or retune suspension to conceal
an incorrect parking transition.

Explicit offline emergency policy: for `service_failed`, safe_stop names the
last verified terminal/recovery location, not an assertion that a roadside
wreck arrived there. Brake physically, require stationary/upright/grounded body
and a clear actual Exit capsule, then checkpoint the real roadside player
position, refund/ticket completion and unchanged fleet recovery terminal together
before publishing foot mode. Failed writes remain retryable without a false
refund/success. The wreck remains roadside and cannot sell another ticket this
session. A normal reload may reconstruct exactly one replacement at the recorded
terminal as disclosed service-interruption recovery, not movement of that wreck.
No player teleport or automatic healing/invulnerability. Normal arrivals and
voluntary serviced-terminal exits keep their existing rules. This controller
distinction replaces Task 1's initial all-finish terminal-proximity assumption
only for a physically grounded emergency road exit; ticket schema stays unchanged.

The controller's four main-world baseline captures are recorded in
`docs/verification/TRANSIT_CORRIDOR_SCOUT_2026_09_07.md`. Before constructing stops,
move Meridian East from the Task 1 initial fraction 0.96 to 0.88, retaining the
same road, side, and service IDs. The old proposed pad is only 3.11m from the
EXIT-meridian centreline and overlaps that road. The new candidate is over 47m
from other road centrelines at its pad and over 22m from authored building
footprints at its standing point; verify the complete apron/rotor/boarding
footprints against actual road widths, terrain, buildings and collisions, not
just these point distances. If it fails real clearance, resolve the placement
before dispatching a service; do not move national road points or buildings.
Keep Richmond West at 0.16; its old 0.06 point was visibly inside the church.
Increase both stop rows' `pad_offset_m` from 18 to 36 as the first physically
separated candidate: the old lateral pad conflicts with the required coach
turnaround. The earlier point-distance measurements used the old pad offset;
recompute actual full-footprint clearance for the new pad. `stop.gd` owns one
derived bay/waiting/swept-apron/pad geometry shared by construction, exclusions
and routing. No duplicated magic parking targets. Persistent service-owned
physical apron ground is allowed to support a waiting vehicle after distant
chunks unload; sample its support against actual terrain. Do not disable the
world, conceal intersecting structures, or relocate a moving vehicle. Keep one
stable shuttle instance, not opposing fixed services competing for one bay.
Reserve the service's real footprint against procedural trees both in already
loaded and regenerated chunks, including their physics. Waiting/boarding areas
must also be clear of procedural filler and visual bushes/rocks, not just solid
tree trunks. Preserve deterministic generation draws outside the reservation.
Register reservations before first generation where possible; do not rebuild
live chunks in a way that loses existing occupants or loot. Waiting/boarding areas
need legible wayfinding and practical night lighting. Do not hide colliders or
disable the world to clear the site. Add a chunk-reload clearance regression.
The actual west turnaround exposed an anonymous neighborhood house/roof at
(1309.661, -220.9745), not an authored building. Extend reservations to the full
house/roof/driveway assembly created by `_stamp_neighborhood`, after all its
existing random draws. Tag accepted anonymous assemblies so late reservations
can remove only intersecting filler, never authored structures, actors or loot.
Cover the reproduced intrusion, unchanged outside candidates/random sequence,
and clearance after chunk reload. Do not rebuild live chunks.
Register only the constructed concrete footprints in the existing
`ProtoWorldBuilder.extra_road_rects` so every vehicle receives the normal grip
of visible pavement. Stop-owned lifetime keys must be removed on teardown
without erasing replacement stops' registrations during deferred frees. Test
inside/outside pavement, teardown and replacement/reload; no global traction
retuning or world_builder source change is authorized for this correction.

- [ ] **Step 3: Run coach/ticket/vehicle and road-life regression; capture and commit.**

Use `-Mode capture -Sim coach` for stop board, boarding, journey and arrival.
Run outbound and return as separate bounded scenarios (`-Scenario east` and
`-Scenario west`, added to the runner in this task) so each real approximately
80-second drive (after the documented road-clearance siting correction) plus
boarding fits the original 180-second process limit. Do not
raise the wall limit or silently shorten the world route to make tests pass.
Inspect each capture against the ordinary gameplay camera and correct faults.
Commit `Connect LASTLINE stops tickets and physical passenger journeys`.

### Task 4: Physical KESTREL flights and safe weather landings

**Files:**
- Create: `game/proto3d/transit/flight_driver.gd`
- Modify: `game/proto3d/transit/service.gd`, `vehicle.gd`, `panel.gd`
- Modify: `game/proto3d/transit/stop.gd` only for KESTREL pad/walkway identification and practical night boarding light, preserving shared geometry, road clearance, pavement registry and coach apron.
- Modify: `game/proto3d/car_3d.gd` only for explicit aircraft opt-outs from road-flip recovery and ground-only rolling/roughness forces, plus a vertically correct aircraft roadkill-proximity seam; preserve ordinary car behavior, actual damage and collision.
- Modify: `game/proto3d/proto3d.gd`, `hud_3d.gd` only for truthful shared-service names/prompts and existing passenger-hook arguments; no unrelated HUD layout or main-loop rewrite.
- Modify: `game/proto3d/world_stream.gd` only for the bounded physical-service interest contract below; `proto3d.gd` may pass that optional interest into its existing single streaming update. Preserve ordinary streaming, live chunks and player-only exploration state.
- Modify: `tools/transit_runtime_check.ps1` for isolated flight scenarios/captures, retaining the original 180-second process cap and both profile directories.
- Test: `game/proto3d/tests/transit_flight_sim.gd`, `.tscn`, `.gd.uid`
- Modify only if needed: `game/proto3d/tests/transit_coach_sim.gd` for the additional validated fleet member's expected record shape; retain all existing coach behavior checks.

**Interfaces:**
- `class_name ProtoFlightDriver extends Node`, `setup(car: ProtoTransitVehicle, origin: Vector3, destination: Vector3, speed: float) -> void`, `request_landing() -> void`; signals `arrived`, `failed(reason: String)`.
- Shared driver lifecycle also requires `running: bool`, `halt(reason: String) -> void` and `detach() -> void`, matching the coach lifecycle from the preceding task rather than relying on coach-only fields. `halt` requests the safe failure/landing path while airborne; it never disables gravity or declares arrival. `detach` clears only its own matching body `ai_driver` reference before freeing; it cannot erase a replacement. Reuse these hooks in the existing service for switch/reload/death and preserve the fixed atomic respawn handoff. Both driver types must survive actual same-session service switching and retained-body reload without stale references; no second passenger ownership implementation.
- Consumes same ticket/seat service path as coach; `main.weather.intensity_at(pos, kind)` supplies weather.
- Extend Task 3's `transit_fleet` sibling with optional `helicopter_stop` using the same two validated stop IDs. Omission on a pre-flight save defaults that aircraft to Meridian; known coach state is preserved, all other unknown keys remain rejected. `fleet_record()` now writes both locations. Stable physical aircraft identity is `kestrel_courier`; route ID changes separately. Arrival and interruption recovery update only the corresponding fleet member in the same atomic full-run transaction. Update only affected fleet-shape expectations in the existing coach sim if needed, retaining its behavioral gates.
- Task 3's orchestrator, vehicle interaction and HUD currently contain coach-specific references. Generalize only these existing service seams to resolve the active ticket's physical vehicle, stop, passenger anchor and driver; preserve the single shared panel/ticket/exit path. KESTREL must not advertise LASTLINE or road-driving controls.
- Keep the ticket-counter reading radius distinct from actual boarding proximity. Helicopter pads are 36m away from the coach frame: requiring the player to remain at the shelter while also being within 3m of the aircraft would make boarding impossible. The existing interact action at the actual aircraft Boarding anchor must open the same service panel, and boarding must independently require that anchor's 3m range plus the ticket, stationary/open/grounded craft and free-seat gates. A reserved passenger standing at the distant counter cannot board remotely. Prove the walk from counter to pad with real movement inputs after buying the ticket, not a position assignment.
- The separated pad must be legible from the actual walking camera: KESTREL name/direction at the shared counter, visible pad identification and a clear approach. Existing LASTLINE lamps reach the shelter/apron but not the pad36m away. Add pad-safe practical night lighting outside rotor/landing/boarding clearance; day/night state follows the existing stop lamp rules. Capture counter-to-pad approach and night boarding, labeling any staged night-clock fixture as such. Do not accept a dark anonymous concrete patch as the final boarding presentation.
- Base-car integration preflight: `_roadkill` currently discards height, and rolling resistance/roughness currently apply from the ground surface regardless of contact. A helicopter cruising above someone must not roadkill them through 25m of air, nor receive dirt suspension judder aloft. Add narrow aircraft-specific seams/overrides for actual 3D proximity and ground-only forces; preserve existing ground-car behavior and real non-occupant/impact/external damage. Keep aerodynamic drag and gravity active. Cover a living person below real cruise, legitimate near-body damage, and ordinary car regression; do not blanket-disable collision or give an airborne service invulnerability.
- Physical-service streaming must survive explicit passenger respawn. Add `ProtoTransitService.streaming_positions() -> Array[Vector3]` and optional third `service_positions: Array[Vector3] = []` parameter to `ProtoWorldStream.update_stream(body_pos, main, service_positions)`. Main passes the query to its existing single streaming update; old callers remain identical with an empty array. Return only actual locally authoritative service bodies: a running driver even after passenger release, or a preserved failed body away from its verified terminal. At most the two stable service bodies; no client-provided interest or infinite route preloading. The query is frame-local, so restore, teardown and replacement cannot leave an orphan registry. Waiting terminal bodies use the existing permanent apron support and need no extra ring.
- Retain a3x3 chunk neighborhood around each returned physical position, unioned with the unchanged local player load/unload sets. Load missing current-body center support before its next physical advance; steady edge work retains the existing load budget and nearest-needed ordering. The radius provides at least128m edge lookahead for the35m aircraft probes. Never rebuild a live chunk, replace collision with an invisible proxy, bank/despawn live content merely to satisfy travel, or silently move the host/player. At most18 additional requested chunks for the two bodies, deduplicated with the local set. Remove stale service-only requests and allow normal unload when the query releases them; stopped roadside failures retain their bounded neighborhood until legitimate replacement/reload. Preserve player exploration/fog: service-only materialization must not mark unseen chunks as player-visited; when the player genuinely reaches already materialized chunks, normal reveal must still occur. Keep ordinary empty-interest behavior covered.
- Streaming verification: cover bounded union/dedup, stale-queue pruning, current-body floor-first support, live-node identity retention, release cleanup and no service-only map reveal. A separately labeled far-terrain fixture may test support beyond the permanent authored slab; it is not a national-route journey claim. In the actual flight death/R case, continue observing the original aircraft to real landing after the player wakes away, with the actual nearby collision still present. The existing12km slab supports this first corridor but does not replace scenery/obstacle lifetime. Task5 reuses this interest path for authoritative remote-only travel instead of creating a competing streamer.

- [ ] **Step 1: Write flight phase, weather and collision behavioral failures.**

```gdscript
check("dust grounds paid flight before boarding", not departure_result.ok and wallet_after == wallet_before)
check("takeoff gains real height continuously", highest_agl > 12.0 and largest_step < 2.0)
check("cruise closes distance to the far pad", closest_to_destination < 20.0)
check("airborne exit cannot drop player", main.transit.is_riding())
check("landing produces grounded foot exit", grounded and main.mode == main.Mode.FOOT)
```

Also test rain threshold, worsening weather while airborne, obstacle in approach,
engine damage, death, early stop request, save/restart and Game Deck interruption.
Include just-below/at/above weather-threshold tests at both endpoints, both
directional flights, and the older fleet record with no helicopter field. Reject
malformed present aircraft state before any coach/ticket/player mutation.

- [ ] **Step 2: Run flight RED and implement a force-controlled flight state machine.**

States: boarding, takeoff, cruise, approach, landing, stopped, emergency.
Use gravity compensation plus bounded proportional velocity/height control,
torque damping and swept clearance probes; no position/velocity overwrites to
advance the trip. Intended normal cruise AGL 25m with forward clearance 35m.
Avoid existing road-only flip-recovery for aircraft via explicit service-kind
hook, preserving old car behavior. Rotor_main spins local Y, Rotor_tail local X.

```gdscript
var acceleration: Vector3 = (desired_velocity - car.linear_velocity) * response
acceleration = acceleration.limit_length(max_acceleration)
car.apply_central_force((acceleration + Vector3.UP * gravity) * car.mass)
car.apply_torque(-car.angular_velocity * attitude_damping)
```

Ground departures when dust >=0.55 or rain >=0.85 at either pad. In flight route
to the nearest unobstructed known pad, mark interruption and refund at safe exit.
No forced exit before actual touchdown/contact and low speed.

Failure policy: reduced engine health measurably reduces available powered
thrust/control. Total engine loss, exhausted fuel or a dead/crashed body produces
zero propulsive lift/thrust; gravity, aerodynamic drag and collision/impact damage
continue. Do not invent unlimited autorotation or compensation to guarantee a
pad arrival. A survivable forced touchdown may use real supported/upright/
low-speed/clear roadside egress, one atomic `service_failed` full refund and the
actual saved foot position; preserve the last verified terminal as fleet recovery
metadata, not an asserted arrival. Fatal impact uses the existing explicit R
death handoff. Test partial-power response and externally caused total loss;
catastrophic failure is allowed to kill, not required to fake a safe landing.

If both known pads are obstructed, hold only a currently tested clear volume
while actual power/fuel permit and retry real pad clearance. Expose delay/blocked
status; keep passenger/ticket ownership, no arrival, airborne exit or refund.
Fuel consumption remains real under force-based control. A bounded fixture
observes these facts, removes an obstruction, then verifies a real landing.
If no clear holding volume or usable power remains, ordinary physical consequences
apply. Grounding weather blocks departures, not emergency landing at a physically
clear known pad. Retain existing process/test time limits.

- [ ] **Step 3: Run flight/coach regression and capture; scoped commit.**

Capture takeoff, cabin during cruise, approach/landing and safe exit through real
driver simulation. Inspect all frames; retain logs and contact checks.
Commit `Add KESTREL physical flights and weather-safe landings`.

### Task 5: Host-owned shared service seats

**Files:**
- Create: `game/proto3d/transit/network.gd`
- Modify: `game/proto3d/transit/service.gd`, `game/proto3d/net.gd`
- Modify: `game/proto3d/world_stream.gd` only if the Task4 bounded interest producer/consumer needs narrow host-authority integration; reuse its physical support path and preserve normal player streaming and live chunk contents.
- Test: `game/proto3d/tests/transit_network_sim.gd`, `.tscn`, `.gd.uid`
- Modify: `tools/transit_runtime_check.ps1` for owned loopback pair orchestration.

**Interfaces:**
- `class_name ProtoTransitNetwork extends Node`, `setup(service: ProtoTransitService, net: Node) -> void`.
- RPCs are reliable host-directed requests with sender-derived peer ID and monotonic request sequence; host snapshot includes vehicle transform/velocity, phase, seats, route ID and revision. Client interpolation never owns service decisions.
- Validate distance against host-known player pose, actual stopped vehicle, ticket/fare authority and capacity before assignment. Stable physical vehicle ID maps replicas, not node path guesses or the changing directional route ID. Task 3's `lastline_coach` identity persists when the active LASTLINE direction changes; route ID remains a separate snapshot field.

- [ ] **Step 1: Add two-process loopback failures for seat arbitration.**

```gdscript
# Arrange a one-seat service row on the HOST, then race host/client requests.
check("last seat accepts exactly one rider", host_seat_owners.size() == 1 and accepted_requests == 1 and rejected_requests == 1)
check("last seat belongs to one of the real requesting peers", host_seat_owners.values()[0] in [host_peer, client_peer])
check("far peer cannot board", far_request_rejected and seat_count_after == seat_count_before)
check("client cannot change fare or vehicle phase", authoritative_fare == 2 and host_phase == expected_phase)
check("disconnect frees rider seat", not host_seat_owners.values().has(disconnected_peer))
```

Use literal independently checked expected ownership, race two requests for the
last free seat, replay requests, spoof prices and service IDs, compare host/client
vehicle positions within interpolation tolerance; verify no local save writes.
Also exercise an actual remote-only passenger journey while the host stays on
foot away from the route. The current streamer follows only the local active
body; endpoint aprons alone cannot support an authoritative moving coach beyond
that body's chunk ring. Reuse Task4's bounded service-owned interest lifetime,
retaining actual road/terrain collision and nearby obstacles
around active host-owned vehicles without rebuilding live chunks or moving the
host for the test. Verify continuous motion, arrival/grounded exit, unchanged
host location, client checkpoint prohibition, and interest cleanup after the
trip/disconnect. A stationary seat race or a host who rides along cannot satisfy
this separate streaming/authority gate. This is bounded transport support, not
proof of nationwide MMO AOI/capacity.

- [ ] **Step 2: Run loopback RED and implement host checks and replication.**

Keep all ENet listeners loopback for tests, owned child lifecycle and separate
profiles for each peer. Existing session account/inventory authority limits must
be surfaced: host-session balances are session state, not authenticated persistent
accounts. Never let a client submit a trusted wallet. Boarding and exit requests
are reconciled from host facts; disconnect stops handheld and releases seat.

```gdscript
var sender: int = multiplayer.get_remote_sender_id()
if not multiplayer.is_server() or sequence <= last_sequence.get(sender, 0):
    return
# Resolve peer pose, balance, seat and phase from host-owned session state.
```

- [ ] **Step 3: Run loopback and local service regressions; scoped commit.**

Report exact peer counts and cases, not load-scale MMO claims.
Commit `Synchronize transit seats and journeys through host authority`.

### Task 6: Encounter, handheld continuity and visual acceptance

**Files:**
- Modify: `game/proto3d/car_3d.gd` and `game/proto3d/tests/transit_vehicle_sim.gd` for the carried Task 2 material-name wear defect and its regression.
- Modify: `game/proto3d/hud_3d.gd` only for the carried bottom-right status overflow and night glyph presentation; add relevant viewport checks to `transit_journey_sim.gd`.
- Modify: `game/proto3d/transit/stop.gd`, `vehicle.gd` and the existing service vehicle rows in `game/data/vehicles.json` only for the visual operator/boarding-light gate below, preserving geometry, live damage, seat capacity and the shared vehicle factory. Exact operator-row shape and lifecycle are a required pre-dispatch ruling, not an unspecified data addition.
- Modify: `game/data/transit.json`, `game/proto3d/transit/service.gd`, `panel.gd`
- Modify: `game/proto3d/transit/catalog.gd` and the relevant `transit_ticket_sim.gd` catalog cases for the explicitly optional encounter section; retain the reviewed ticket-record schema.
- Modify: `tools/transit_runtime_check.ps1` only to add the journey scenario and required existing regression names.
- Test: `game/proto3d/tests/transit_journey_sim.gd`, `.tscn`, `.gd.uid`
- Create: `docs/verification/TRANSIT_RUNTIME_REVIEW_2026_09_07.md`, `docs/renders/transit-runtime-2026-09-07/*`
- Update: `docs/HANDOFF.md`, `docs/AMERICA_FOUNDATION_STATUS.md`, `docs/design/PUBLIC_TRANSPORT.md`.
- Modify/test: `PLAY_ROADSTEAD.bat` only to bring the source-play launcher into dual-profile isolation before recommending it. It currently redirects APPDATA only; verify both APPDATA and LOCALAPPDATA stay worktree-owned without launching against a normal profile. Preserve the existing isolated player save location, reject unsafe/reparse profile targets, and keep verification fixtures separate from human play data. This is not authorization for a new export or to overwrite the isolated playthrough.

**Interfaces:**
- Same service/ticket paths; existing `main.game_deck`, `main.respect`, real enemy
  `ProtoLurker`/weapon damage and item containers, not a new combat engine.
- Final contract preflight must also resolve the coach's requested-stop interaction: the runtime spec promises hold-interact requests an early stop, while the Task3 implementation only rejects taking the wheel and moving exits. Flight early-landing requests belong to Task4. Before Task6 dispatch, define the coach's actual safe-stop policy, affected driver/main interfaces and atomic no-refund early-exit behavior; add exact ownership and input/physical-exit regression. A denial toast alone is not the promised request, and no airborne/moving exit, hidden return trip or extra refund is acceptable. Do not call the overall transit spec complete with this gap open.
- Fresh Task3 east7983dbec camera preflight: the cutaway shows a passenger but no visible operator, while runtime control is a nonvisual driver Node; both original models already provide Seat_driver. Add an original, data-described service operator using the existing puppet/seat-pose system, with measured pelvis/hand/cabin clearance. Do not represent an invisible driver/pilot as final inhabited-world polish. Keep operator identity distinct from passenger capacity and host seat ownership. Before implementation define visible living/disabled/service-state behavior and cleanup; this is service crew presentation, not a new recruitable NPC/combat engine or an invented human network peer. Verify the same cabin at boarding, travel and failure, and that an old driver visual is not duplicated on reload/service switch.
- The same actual Richmond night capture lights the shelter sign while leaving much of the bus/boarding area very dark. Target practical boarding/cabin illumination and wayfinding, without flooding the surrounding wasteland or concealing the issue by disabling the perception mask. Preserve measured rotor/doorway/foot clearance and day/night rules. Investigate the conspicuous daytime hard wedges separately against a mask-off diagnostic; do not assume lamp shadows, vehicle lights and perception geometry are the same source. Day/night captures must distinguish actual journey evidence from staged clock diagnostics. World-wide lighting and bare buildings remain broader gates, not secretly waived by the transit pass.

- [ ] **Step 1: Write whole-loop input/encounter failures.**

```gdscript
check("handheld rides while world continues", game_score_changed and vehicle_distance > 20.0 and clock_delta > 0.0)
check("ambush closes handheld without losing passenger state", not handheld_open and rider_safe)
check("help choice has a real persistent consequence", bandages_after == bandages_before - 1 and standing_after > standing_before)
check("resume delivers through physical travel", destination_reached and not main.transit.is_riding())
```

One row-driven road encounter offers aid or wait, consumes one existing bandage
for aid and grants recorded standing once, or exposes the stop to real threats;
no farmable repeated payouts from reload. Test failed writes preserve resources.
The implemented catalog currently accepts exactly version/stops/services. Before
writing encounter rows, define the exact encounter-row fields and their bounds
in this task's brief and resolve them with the controller. Extend the root with
only an optional encounters array: omission means no encounters for legacy
fixtures, but present malformed data or any other unknown root key must still
fail closed. Validate referenced service/item/standing identifiers and duplicate
encounter IDs; publish no partial catalog on failure. Add explicit omitted,
valid, malformed, duplicate, unknown-reference and unrelated-extra-key cases.
Do not make the catalog generally permissive or weaken ticket validation to
accept the new content. Atomic consequence/replay state belongs in its own
versioned full-run sibling rather than unreviewed extra ticket fields; settle
that exact shape before implementation and cover whole-save refusal/recovery.

- [ ] **Step 2: Run journey RED, then connect encounter and interruptions.**

```gdscript
if encounter_begins and main.game_deck != null:
    main._stop_handheld_session("body_unavailable")
# Only publish standing/item consequence after an atomic full-run commit.
```

World clock, hunger, weather and combat continue. Do not make screen reading
invulnerable. Show concrete risk/consequence and controls in readable UI.
Resolve Task 2's deferred wear defect: imported wheel material is named
`DRIVN_rubber`, while the current prefix test expects `rubber`. Match the actual
rubber surface robustly without recoloring rims. Add a behavioral RED then GREEN
for damaged and repaired tire tiers: rubber changes at wear, rims stay original,
and repair restores the original rubber material. Do not treat initial rim
appearance alone as proof of damage-state rendering.
Carry the Task3 screenshot finding: the vehicle's bottom-right status sentence
runs off the viewport even after its surface names are corrected. Fit/wrap the
actual text within the dashboard area at normal and supported compact sizes,
without hiding important tire/surface/load information or overlapping other
controls; test rendered content bounds, not just the Label's nominal rectangle.
The current night location glyph is a purple city emoji. Replace that isolated
glyph with a warm or monochrome night symbol consistent with the no-purple
palette; no broader HUD redesign or lighting change is required.

- [ ] **Step 3: Full relevant suite, screenshot review, documentation and commit.**

Run ticket, vehicle, coach, flight, network and journey plus changed subsystem
regressions in isolated profiles. Capture stop UI, open door, rider on bus,
handheld journey, ambush choice, night stop, takeoff, cruise, landing, arrival.
Personally inspect each and fix verified faults with regression evidence; do not
use staged studio images as journey proof. Record raw results, dimensions,
honest visual judgments and remaining native/server/content gates. Scoped commit
`Verify transit encounters passenger play and runtime presentation`.

## Self-review and completion boundary

Parent asset step is already delivered; runtime spec sections map to Tasks 1–6:
catalog/transactions=1, physical model=2, coach/UI/recovery=3,
aircraft/weather=4, host session=5, encounter/visual/full-loop=6. Authenticated
realm deployment and full-game release are explicitly not delivered by this
subsystem plan and remain required by the active game goal. Task 5 tests must
not be represented as authentication. No placeholders or undefined cross-task
runtime interfaces are intended; resolve genuine implementation discoveries in
the plan ledger before changing a consuming task's contract.
