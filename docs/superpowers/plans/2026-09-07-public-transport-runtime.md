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
- New row fields `model_path`, `authored_details: bool`, `model_ground_offset: float`, `chassis`, `cabin`, `cabin_pos`, `wheels`. Fold known vector arrays into Vector3, never leak Array where the engine expects Vector3.
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
Coach mass 4800, engine_force 14500, top_speed 16, service cap 12. Helicopter
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
- Test: `game/proto3d/tests/transit_coach_sim.gd`, `.tscn`, `.gd.uid`

**Interfaces:**
- Consumes exact Task 1 catalog/ticket methods and Task 2 vehicle/anchors.
- `class_name ProtoTransitService extends Node3D`, `setup(main: Node) -> void`; fields `catalog`, `state`, `panel`, `vehicles: Dictionary`, `stops: Dictionary`.
- `is_riding() -> bool`, `request_exit() -> bool`, `passenger_position() -> Vector3`, `restore_run(data: Dictionary) -> bool`, `record() -> Dictionary`.
- `class_name ProtoCoachDriver extends Node`, `setup(car: ProtoTransitVehicle, points: PackedVector3Array, speed: float) -> void`; signals `arrived`, `failed(reason: String)`.
- `ProtoTransitPanel` uses `is_open`, `open(stop_id: String)`, `close()`; focusable buttons have stable action metadata for sims.

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

- [ ] **Step 2: Run coach RED; implement real service around main interfaces.**

Hook setup after road-life and game-deck are available; capture_save adds transit.
Validate transit before road-life/player restoration. Recovery is staged with
the incoming save wallet, committed before exposing the recovered run. Never
apply live-mode mutation on failed write. Avoid call recursion via capture_run.
Old saves omit transit -> empty state. Stop panels join `_gameplay_input_blocked`
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
Unavailable physical coach cannot sell a ticket. Off-line local orchestration
is explicit until Task 5 supplies host authority; do not spoof online support.
Compose physical apron paths outside the road lanes. The pedestrian standing
point is not the coach's parking origin. For both directions the right-side door
must open toward a protected waiting area, not into a live lane; a shared
south-side terminus requires a real turning/apron path for westbound departures.
Test both directions, clear turning radius, and cross-traffic yielding at merges.

- [ ] **Step 3: Run coach/ticket/vehicle and road-life regression; capture and commit.**

Use `-Mode capture -Sim coach` for stop board, boarding, journey and arrival.
Run outbound and return as separate bounded scenarios (`-Scenario east` and
`-Scenario west`, added to the runner in this task) so each real approximately
86-second drive plus boarding fits the original 180-second process limit. Do not
raise the wall limit or silently shorten the world route to make tests pass.
Inspect each capture against the ordinary gameplay camera and correct faults.
Commit `Connect LASTLINE stops tickets and physical passenger journeys`.

### Task 4: Physical KESTREL flights and safe weather landings

**Files:**
- Create: `game/proto3d/transit/flight_driver.gd`
- Modify: `game/proto3d/transit/service.gd`, `vehicle.gd`, `panel.gd`
- Test: `game/proto3d/tests/transit_flight_sim.gd`, `.tscn`, `.gd.uid`

**Interfaces:**
- `class_name ProtoFlightDriver extends Node`, `setup(car: ProtoTransitVehicle, origin: Vector3, destination: Vector3, speed: float) -> void`, `request_landing() -> void`; signals `arrived`, `failed(reason: String)`.
- Consumes same ticket/seat service path as coach; `main.weather.intensity_at(pos, kind)` supplies weather.

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

- [ ] **Step 3: Run flight/coach regression and capture; scoped commit.**

Capture takeoff, cabin during cruise, approach/landing and safe exit through real
driver simulation. Inspect all frames; retain logs and contact checks.
Commit `Add KESTREL physical flights and weather-safe landings`.

### Task 5: Host-owned shared service seats

**Files:**
- Create: `game/proto3d/transit/network.gd`
- Modify: `game/proto3d/transit/service.gd`, `game/proto3d/net.gd`
- Test: `game/proto3d/tests/transit_network_sim.gd`, `.tscn`, `.gd.uid`
- Modify: `tools/transit_runtime_check.ps1` for owned loopback pair orchestration.

**Interfaces:**
- `class_name ProtoTransitNetwork extends Node`, `setup(service: ProtoTransitService, net: Node) -> void`.
- RPCs are reliable host-directed requests with sender-derived peer ID and monotonic request sequence; host snapshot includes vehicle transform/velocity, phase, seats, route ID and revision. Client interpolation never owns service decisions.
- Validate distance against host-known player pose, actual stopped vehicle, ticket/fare authority and capacity before assignment. Stable service ID maps replicas, not node path guesses.

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
- Modify: `game/data/transit.json`, `game/proto3d/transit/service.gd`, `panel.gd`
- Test: `game/proto3d/tests/transit_journey_sim.gd`, `.tscn`, `.gd.uid`
- Create: `docs/verification/TRANSIT_RUNTIME_REVIEW_2026_09_07.md`, `docs/renders/transit-runtime-2026-09-07/*`
- Update: `docs/HANDOFF.md`, `docs/AMERICA_FOUNDATION_STATUS.md`, `docs/design/PUBLIC_TRANSPORT.md`.

**Interfaces:**
- Same service/ticket paths; existing `main.game_deck`, `main.respect`, real enemy
  `ProtoLurker`/weapon damage and item containers, not a new combat engine.

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

- [ ] **Step 2: Run journey RED, then connect encounter and interruptions.**

```gdscript
if encounter_begins and main.game_deck != null:
    main._stop_handheld_session("body_unavailable")
# Only publish standing/item consequence after an atomic full-run commit.
```

World clock, hunger, weather and combat continue. Do not make screen reading
invulnerable. Show concrete risk/consequence and controls in readable UI.

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
