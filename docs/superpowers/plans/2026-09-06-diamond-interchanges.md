# Direction-Correct Diamond Interchanges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace generated median-crossing city ramps with physically usable four-direction diamond interchanges, connected to their real town destinations.

**Architecture:** A pure layout/profile builder emits owned road and junction rows. A selective migration and the existing MapForge bake consume it; Godot folds explicit ports for traffic, directed routing and rendered road furniture. The first three generated city POCs establish the reusable path before per-site expansion.

**Tech Stack:** Node.js ES modules/node:test, Godot 4.5.1/GDScript 2.0, PowerShell 7 isolated test driver.

**Spec:** `docs/superpowers/specs/2026-09-06-diamond-interchanges-design.md`

## Global Constraints

- Work only in `D:/git/carworld/.worktrees/america-foundation`, branch `codex/america-foundation`.
- Every engine run isolates both APPDATA and LOCALAPPDATA under this worktree's build directory.
- No push, merge, public deployment, normal-profile access or full-game completion claim.
- Stable exit/ramp IDs and unrelated authored roads/placements are preserved.
- The highway median stays intact; right-in/right-out ports never use `control: "gap"`.
- Use apply_patch for code/docs. You are not alone in the codebase; preserve others' edits.
- Do not dispatch subagents from an implementation task. Parent schedules review and all engines.
- Primary test commands use `C:/Program Files/nodejs/node.exe` and the existing isolated PowerShell driver.

## Task 1: Pure diamond layout and profile builder

**Files:** Create `tools/mapforge/diamond_interchange.mjs` and `tools/mapforge/diamond_interchange.test.mjs` only. Do not change live map, runtime, existing bake or external profiles.

**Interfaces:**

```js
export function buildDiamondInterchange(map, exitId, {
  terrainAt, approach_m = 260, junction_offset_m = 180,
  bridge_clearance_m = 6.2
} = {}) { /* returns {exit, roads, junctions}; never mutates map */ }
```

`terrainAt(x,z)` is the caller's real relief field; it is required and finite.
`roads` contains four preserved-ID ramp replacements and two connector rows.
`exit` is a copied exit with retained fields plus the spec's managed metadata.
All six roads use `elev_mode: "structure"`; metadata names and values in the
spec's Data contract are binding, including `diamond_v2` and connector IDs.
Connector danger comes from the canonical exit risk_rating; only fall back to
legacy exit danger when risk_rating is absent. Do not rewrite retained ramp danger.
`junctions` contains the four ports, two local crossroad/ramp meetings, deck
crossing and destination meeting. Highway legs use true projected arcs; ramp
ports use arc 0 for off and full length for on. Include the crossroad/link
meeting in the town-side local junction. At the destination, link the feeder
to all existing non-exit road segments within 1m of the retained destination;
reject a missing destination road rather than producing a disconnected row.

- [ ] Write the independent tests first. Begin against the missing production
  export with a namespace dynamic import guard, so failure is an explicit
  missing builder assertion rather than a parser accident. Then retain tests
  against the actual production function without a fake implementation.

```js
const source = await import('./diamond_interchange.mjs').catch(() => ({}));
assert.equal(typeof source.buildDiamondInterchange, 'function');
```

Use a literal flat fixture: highway `main`, points `[[-1200,0],[1200,0]]`,
elevations `[0,0]`, six lanes/divided; exit at `[0,0]`, destination `[-520,-240]`;
town road from `[-520,-300]` to `[-520,-180]`. Owned four old ramps have distinct
non-pattern IDs, sides +/-1 and old ends near the highway anchor. Preserve a
custom character field, toll, nickname, all exit metadata and unrelated rows.
Test named role inference for legacy owned rows by the <=80m mouth rule plus
side, not suffix. On/off IDs must not be swapped. Duplicate role/side, missing
highway, unowned or missing ramp and invalid inputs throw without mutation.

Independent geometric assertions include:

```js
assert.deepEqual(result.exit.dest, [-520,-240]);
assert.deepEqual(input, before); // the input remains the authoritative map
for (const r of result.roads.filter(r => r.ramp_role)) {
  assert.equal(r.one_way, true);
  // Six-lane highway outer edge=13.6m; start/end ramp centre=14.6m.
  const mouth = r.ramp_role === 'off' ? r.pts[0] : r.pts.at(-1);
  assert.ok(Math.abs(mouth[1] - r.side*14.6) < 0.02);
  assert.ok(r.pts.every(p => p[1]*r.side >= 14.59));
  assert.ok(r.elev.every(Number.isFinite));
  assert.equal(r.elev.length, r.pts.length);
}
```

Add hand-derived checks for all four serving travel directions, 8–15 degree
peel/merge tangents, maximum 16m emitted spans, no full-width median intrusion,
crossroad centre elevation at least 6.2m, <=0.061 grade, and ground-level local
junction endpoints. Reverse and rotate the fixture 90 degrees with explicit
expected mouths. A behind-anchor destination must be reached by the separate
feeder; no ramp crosses the highway to get there. A shortened highway cannot
accommodate the ports and must throw. A raised highway with too little lateral
approach for a legal bridge grade must throw, not float the local junctions.

- [ ] Run Node tests and record expected RED output in the task report.
- [ ] Implement the pure builder with small internal vector/polyline helpers.
  Use the actual highway arc around the anchor for upstream/downstream mouths
  and each mouth's local tangent. Compute right as `[-dz,dx] * side`.
  Begin each off path with 70m at 12 degrees; finish with a smooth sampled cubic
  curve to the same-side junction, approaching perpendicular to the crossroad.
  Reflect/reverse the shape for on-ramps while keeping point order legal.
  Densify to <=16m, preserve exact endpoints, and use finite centimetre heights.

```js
const radians = 12*Math.PI/180;
const peelDirection = [travel[0]*Math.cos(radians)+right[0]*Math.sin(radians),
                       travel[1]*Math.cos(radians)+right[1]*Math.sin(radians)];
const point = [mouth[0]+70*peelDirection[0], mouth[1]+70*peelDirection[1]];
```

  Crossroad spans the two 180m junctions. Its crest spans highway half-width
  plus 6m per side; height is at least highway maximum across that crossing
  plus 6.2m. Use <=5.8% target approach slopes and validate <=0.061 including
  terrain/rounding; do not lift local junction endpoints above their terrain.
  Ramp heights follow terrain with distance-weighted corrections to the actual
  highway and crossroad terminal heights. Refine profile bends as needed.
  Feeder leaves outward 40m before a rounded bend toward the retained town
  endpoint; it may not cross the median or double back onto a ramp. Validate
  full-width conflicts between emitted ramp/feeder paths away from their local
  junction reservation. Reject impossible layouts with actionable errors.
- [ ] Run the focused suite, then the existing ramp-relief and road-clearance
  Node tests once. Self-review every new export/helper through its observable
  test contract. Do not run Godot. Commit only the two owned files, clean
  message without Co-Authored-By; full report includes RED/GREEN outputs and
  unresolved constraints. Parent reviews before accepting this task.

## Task 2: Selective migration and MapForge rebake preservation

**Files:** Modify `tools/mapforge/bake_junctions.mjs`; create
`tools/mapforge/repair_diamond_interchanges.mjs` and its `.test.mjs`; selected
map edits in `game/data/usmap.json` only after dry-run review.
**Consumes:** Task 1 `buildDiamondInterchange`; existing `reliefField` and ramp
profile bake; existing atomic dry-run migration pattern.
**Produces:** exported `applyDiamondInterchanges(map, exitIds)` returning
`{exits, roads, junctions}` counts, and exported `reliefField(map)` for the builder.

- [ ] Tests exercise a real migration subprocess: default bytes unchanged,
  explicit `--write --exit=ID` affects only selected ownership, repeat bytes
  identical, missing/ambiguous ownership and stale source reject before write.
  Use `assert.deepEqual(after.roads.filter(unrelated), before.roads.filter(unrelated))`.
- [ ] Run RED before implementing the CLI and bake integration.
- [ ] Stage explicit roles on a private copy for selected legacy exits using
  their owned ramp IDs and unambiguous existing ramp_mouth/ramp_rejoin junction
  kinds that also name the owning highway. Validate the corresponding actual
  terminal against that highway and side; reject contradictory/foreign roles.
  Do not widen the 80m shared-anchor heuristic or infer roles from ID suffixes.
  Live on-ramps rejoin 100m or more from the anchor, so the pure builder's
  contained legacy fallback alone cannot migrate the three POCs.
- [ ] Integrate the builder without circular imports. Managed layouts bypass
  the legacy peel and ramp-relief rewrites. Regenerate managed geometry before
  town-slot reservations and managed final profiles/junctions after generic
  overpass elevation. Replace only selected ramp legs/port nodes; preserve all
  unrelated junction fields and retain remaining multi-road legs.

```js
const patch = buildDiamondInterchange(map, id, {terrainAt: reliefField(map).macroY});
// Apply only patch-owned road IDs and selected exit ID; never replace all roads.
```

- [ ] Run existing Node suites plus a repeated full bake fixture proving no
  collapse back to `peel_v1`, no role loss, and no grade-separated transfer.
- [ ] Dry-run the three generated POC exits, inspect road/building footprint
  conflicts, preserve exact pre-migration bytes under build, then apply only
  feasible reviewed sites. Record site-specific failures; do not overwrite
  authored placements or remove the median. Commit the tested integration.

The parent owns live-map migration review/application and all engines. The
implementation worker owns the CLI/bake/tests, runs dry probes, and reports
before any live-map write. Reuse road_clearance.mjs with the actual
game/data/world/structure_profiles.json, including rendered end caps. Default
selected IDs are I-90_X11, I-80_X11 and I-75_X10 only when explicitly requested;
never silently migrate every exit or accept an unknown authored layout.
Parent preflight at c897e71 found no external road centreline crossing at
Seattle, one at San Francisco, and five at Atlanta. SF/Atlanta are not eligible
for a live write until those conflicts have explicit layout/junction treatment;
do not discard another exit's ramp or road to force the three-site count.

Runtime integration uncovered a separate existing shared-mouth bake defect:
generic mergeLegs picks an interior ramp arc nearest the anchor instead of the
known off-ramp terminal0. Repair that emitter and add an explicit dry-by-default
`--mouth-arcs-only` CLI path using existing atomic/stale-source safeguards.
Selected I-80_X11 and I-75_X10 corrections change only their two erroneous
mirrored off-ramp leg arcs (144/142 ->0), never geometry/exits/other legs. Tests
must prove exact scope, ownership rejection, repeat identity and full-bake
retention. Parent backs up/applies data only after source review. This does not
qualify either city for diamond geometry migration or physical acceptance.

## Task 3: Shared runtime ports, directed routing and traffic

**Files:** `game/proto3d/usmap.gd`, `traffic.gd`, `road_graph.gd`, new
`game/proto3d/tests/interchange_ports_sim.{gd,tscn}`, `junction_bake_sim.gd`
actual-port ownership assertion, `map_nav_sim.gd` dispatch-timing regression,
runner allowlist.
**Consumes:** spec row schema and Task 2 managed map.
**Produces:** `ProtoUSMap.exit_ports(e: Dictionary, role: String = "") -> Array`
of `{road: Dictionary, role: String, side: int, pos: Vector2, highway_arc_m: float}`.

- [ ] Write a real fold/consumer regression with a deliberately displaced port
  and unrelated nearby ramp. Assert the correct owned off-ramp for each side,
  actual-mouth trigger, no owned-list fallback to a neighbor and no on-as-off.
  Parent runs isolated RED with both profile environment roots.
- [ ] Fold `ramp_role`, `one_way`, `interchange_id`, `connector_ids` and
  `interchange` without losing existing fields; propagate one-way to segment rows.
  Port query resolves IDs, applies contained legacy role inference only when
  explicit metadata is absent, and projects the chosen terminal to its highway.
- [ ] Make `_ramp_for` and `_maybe_take_exit` consume ports. Trigger distance
  uses the actual selected port; preserve destination choice, one-roll behavior,
  cruise and legal transfer direction.
  Cache static port resolution at the map fold/grid-rebuild boundary. The actual
  I-95 workload measured 19.116ms per frame for 12 agents; repeated linear road
  lookups/projections must not stay in this hot path. Prove bounded cache reuse,
  reload/rebuild invalidation, modified same-ID descriptor safety and caller
  mutation safety; remeasure the same workload without a brittle timing assert.
- [ ] Add directed ramp edges and serving-side highway port transfer nodes to
  `ProtoRoadGraph`. Highway carriageway nodes use their real lateral positions
  so nearest-node selection cannot prefer an unused shared crossing node.

```gdscript
# A one-way road contributes the increasing-arc edge only.
if not bool(road.get("one_way", false)):
	(adj[bn] as Array).append({"to":an,"road":rid,"len_m":span,"time_s":span/mps})
```

  Prove both town-bound routes and both return routes, reject reverse on/off
  traversal and direct cross-median/under-deck transfers. Retain legacy network
  routes and time-cost weighting. Parent runs focused traffic/graph/atlas tests.
  Actual Seattle already has a shorter flat-gap street route in its graph. Prove
  ordered directed paths through each required ramp separately from ordinary
  fastest-route availability; never bias time costs or remove that street.
  Later Task4 physical inspection disproves the earlier assumption that every
  such legacy connection meets its street: J-tee-135 is38.71m displaced. Retaining
  graph availability is not proof of physical legality. Record this legacy
  navigation/data limitation explicitly for final review; the four managed
  paths require their own real-input physical proof.
  Existing legacy ramp_mouth rows can list both sides' off-ramps in one junction.
  Do not join both carrier directions to that shared node: use per-ramp port
  transfer nodes, with carrier-to-off and on-to-carrier edges only. Directional
  through-edges must stay distinct at other limited-access junctions on the
  serving highway too; an immediately adjacent old port is not permission for
  a cross-median turn. Flat control-gap intersections retain legal transfers.
  Exclude unused shared deck/port placeholders from nearest_node selection,
  but retain legitimate one-way destination sinks that have incoming edges.
- [ ] Replace junction_bake_sim's obsolete one-mouth-per-exit count assertion with
  actual owned departure-port/junction-leg and projected-arc validation. Shared
  legacy mouths remain valid; do not weaken this to a distance/count tolerance.
- [ ] Repair map_nav_sim's proved input-dispatch race: wait for actual atlas
  unblock and observe process/input dispatch between individual N gestures.
  Preserve its original cycle budget and HOME assertion; do not change gameplay
  input behavior. Remove verbose diagnostic instrumentation after verification.
- [ ] After RED/GREEN evidence create a scoped local review commit. Acceptance
  follows independent task review; the review commit is not a push or merge.

## Task 4: Physical road presentation and four-direction driving proof

**Files:** `world_stream.gd`; new `interchange_drive_sim.{gd,tscn}`;
`road_surface_sim.gd` only to extend coverage honestly; `elevation_sim.gd` only
to isolate its synthetic map fixture and update verified support expectations
if required by the global station law; isolated runner. Narrow integration
ownership also includes `traffic.gd` lifetime guarding and managed connector/
structure-height/safe-arrival integration, with real `traffic_sim.gd` regressions
for defects discovered by the input drive. Unmanaged arrival behavior is retained.
**Consumes:** shared ports, same managed rows/geometry as Task 3.
**Scoped data exception:** worker proposes and validates the exact
`seattle-slot-8.pos`, `seattle-slot-26.pos` and subsequently proved
`seattle-slot-7.pos` relocations using owned read-only plan-workspace helpers;
parent alone publishes the source-map change after hash/field/clearance checks.
All other authored rows and every non-position field remain unchanged.
**Produces:** actual port signs/decel/accel/gore placement and physical traversal
evidence, plus unedited captures under a unique isolated build run.

**Parent-owned compatibility-test exception:** `roadside_clearance_sim.gd`
still casts all slabs to BoxMesh and crashes on the joined ArrayMesh pavement.
Measure literal convex-prism vertex footprints, with translated/rotated/sloped
hand-authored controls and an empty bounding-box-corner negative. Preserve all
furniture, full pavement coverage, overlap/grounding/drive assertions and
interval controls. This is a test-adapter repair, not permission to alter road
geometry or waive newly exposed failures; outside the worker's eight-file commit.
Full driving coverage uses all eight actual transformed chassis-box corners and
the complete projected hull minus the union of finite current-road mesh slabs.
Independent controls cover roll, pitch, finite ends, transverse/enclosed holes,
interior-slab-first order, reversed winding, repeated closing points and malformed
geometry. Convex difference must preserve holes and reject invalid geometry without
consuming the subject; no positive pavement-gap tolerance is introduced.
The old fixed driving line is now53.13m from the relocated ON ramp and hits an
actual roadside pole outside every loaded pavement footprint (diagnostic06aa70ca).
Retain that evidence and adapt the drive to the nearest point of the current ON
row: start22m before its projection, initial heading toward a38m-ahead road point,
actual row elevation. Initial E/W adaptation traverses66.523m but leaves the
curve by3.364m. Use real E and bound pad steering/pedals to follow the curved
row, copying the existing four-route driver's proportional15m/s control and a
12m lookahead. Keep240physics frames and>30m travel gate;
add full actual chassis-corner pavement membership before/throughout driving.
Do not remove the lawful off-road pole or certify the old route as passable.

- [ ] Write physics probes that fail on the original median-crossing data and
  barrels placed on the ramp centre. Sample full ramp widths and bridge
  clearance/deck collision; require successful floor rays at every point.
  The migrated-data broad baseline is 16/1: its +20m downward ray hits the
  legitimate overpass (including the currently floating rails) as if it were
  pavement burial. Separate the near-pavement floor probe from a vehicle-height
  obstruction volume. Keep medians/barrels/buildings in that volume query;
  do not exclude them or all bridge hardware to force a pass. Include negative
  controls for a blocked travel envelope and a bridge with insufficient
  underside clearance. Spec bridge_clearance_m is deck-top separation (6.2m),
  not a claim of 6.2m underside headroom: measure/report both independently.
  Self-review also identifies managed+wet undivided roads creating both their
  new ribbon floor and a legacy box deck. Add real ocean-chunk managed/unmanaged
  controls, assert one managed deck, actual endpoint clearance and floor height;
  gate the minimal legacy wet-undivided branch correction on failing evidence.
  Retain unmanaged/divided wet decks and all wet rails.
- [ ] Use actual per-port positions and heights for signs and acceleration/
  deceleration strips. Place gores/barrels in the clear wedge, reserving full
  highway and ramp footprints. One-way markings use white rather than yellow.
  Keep decks/rails clear of ground-level local turning junctions.
  Regression-check elevated `road_guard_rail` drape exemption (the existing
  roadside tag is a different `road_guardrail`), and verify column placement
  on densified short deck spans rather than relying on per-span length/30.
  Global column stations use point-order arc distance, matching elev_at, not
  arc_from_origin's south/west address convention. Sample actual pillar feet
  against terrain and reserve every underlying road's full footprint.
  The disposable preview also shows generated neighborhood homes across the
  town-side feeder. Probe real bodies before fixing _stamp_neighborhood: it
  currently checks no road footprint and offsets from chunk center rather
  than the serving road. Reuse full-footprint/all-segment reservations and
  preserve deterministic RNG draws; keep valid homes and authored placements.
- [ ] Follow up on actual GPU rejection: managed short-segment boxes retain
  3m end overhangs, producing sawtooth bends and fragmented paint. Use joined
  visual pavement/paint while preserving row geometry, physical collision and
  honest rendered-surface regression coverage. Managed exit signs need a
  highway-scale green board and camera-readable number/destination/direction;
  presence alone and perception-hidden tiny text do not meet spec 0.12. Keep
  normal ProtoSign behavior elsewhere. Crash barrels may use proved-clear
  35/40/45m stations while retaining all footprint reservations and three per
  port; do not waive the failed per-port hardware expectation.
  Actual wheel-contact diagnosis also proved a roadside rail occupies the
  speed-change lane. Test and repair full-width physical floors and furniture
  reservations for all four auxiliary lanes, add required ramp reflector
  posts, and keep rendered/collision surfaces consistent at joins. For live
  traffic occupancy, retain all query categories and allow only bounded natural
  clear/re-probing; report initial occupancy and final obstruction separately,
  with stationary negative controls. No deleting/freezing traffic to pass.
  The continuous full-width follow-up must distinguish fixed/unknown blockers
  from identity-verified living road occupants while still querying every body.
  Report both initial/final occupancy and fixed blockers; an occupied road is
  not empty. Default unknown bodies to blockers, with native StaticBody3D,
  CharacterBody3D and AnimatableBody3D negative controls (including spoofed
  combat groups). Recognize only actual registered, active production actors,
  not physics classes or group names alone. Keep the same bounded recheck and
  independent four-direction real-input traversal requirement. Do not alter
  actors, seeds, collisions or query layers to obtain a geometry pass.
- [ ] Remove the photographed legacy square only through a consistent geometric
  validity guard: flat tee/cross filler requires all incident pavement footprints
  to meet at the junction position. Preserve every valid pad and all road bodies,
  road meshes, data, median-gap policy and traffic/nav. Test actual invalid
  J-tee-135 and valid J-tee-3 plus missing, nonmeeting, diagonal and wide-road
  runtime cases. Record the wider renderer reach (read-only audit: 141 nonmeeting
  versus 388 meeting eligible rows) and unresolved stale street connectivity.
- [ ] Drive four staged routes via actual keyboard/pad inputs: each off-ramp to
  the town endpoint and each on-ramp to the correct highway direction. After
  initial staging, never set the car transform/velocity to move it along a path.

```gdscript
var event := InputEventKey.new()
event.physical_keycode = KEY_W
event.pressed = true
Input.parse_input_event(event)
```

  A steering test helper computes input events, not kinematic movement. Check
  reached landmarks, retained positive hp, finite physics, deck underside
  clearance and untouched median collision. Capture approach, crossing, feeder
  and completion through the real camera; disclose clock/location staging.
  First real route exposed `_car_ahead` testing `c is Node3D` before checking
  validity on a freed car entry. Add a real freed-entry/valid-leader regression
  before the narrow lifetime guard; retain traffic, vehicles and following.
  Do not suppress the errors, disable traffic, or make the check always null.
- [ ] Parent inspects every final capture, runs broad surface and relevant
  road/junction/traffic/atlas/elevation checks, records baseline failures and
  hashes map bytes after every scene. Commit only with evidence and review.
  Before running elevation_sim, replace its legacy live-map overwrite/restore
  fixture with an owned disposable map loaded through the real ProtoUSMap fold
  before main boot. The same synthetic road and assertions remain; interruption
  must never leave game/data/usmap.json modified. No test may write the live map.
  The real OFF-R repeat exposed marginal high-speed corner entry by the test
  driver. Add an actual sharp-vertex entry-speed<=7m/s regression before changing
  its planner. Anticipatory cap: scan40m ahead for >45degree vertices, target5m/s,
  deceleration3m/s²,6m waypoint-reach allowance; retain the old15/7 heading cap,
  steering, pad events, route, physics and110sim/12stall budgets. This is test
  driving behavior, not a gameplay handling rewrite. Re-run all four routes.
  Screenshot follow-up: diagnose the next15m of the ON completion carriageway
  using real streamed full-lane3.6m envelope boxes and floor rays. The captured
  roof is attributed by source to slot7 police_station; actual collider ancestry
  and height must confirm whether its walls block the continuation. Keep all
  bodies/query layers and the same bounded live-occupancy reporting. This is a
  tests-only diagnostic authorization, not permission to move a third placement.
  Subsequent actual wall/furniture RED107/1 authorizes a separate position-only
  correction proposal for slot7 police_station, with the exact same guarded
  parent publication/full-footprint/all-road/auxiliary/neighbor/doorway checks.
  Preserve slots8/26 and all other fields. Require continuation GREEN and new
  ON screenshot. Actual7.086m/s corner failure also changes the test-only braking
  envelope3→2m/s²; retain target5/lookahead40/reach6/gate7 and all input/budgets.
  Diagnose actual collided-agent arrival/promotion/leader state before changing
  production traffic or adding evasive test-driving behavior.
  Deterministic endpoint follow-up uses existing traffic_sim manual `_tick`,
  a staged real agent0.11m before the managed off-ramp end, an available-capacity
  case and a stockcap5 case filled via five actual production promotions.
  Query real streamed crossroad/feeder floors and full road body envelopes,
  without exclusions, initially and after12 traffic seconds; require zero
  arrival-collider obstruction in both cases. Log actual registry/arrival/leader
  identity. Keep fixture cleanup local and all four real drives unchanged.
  Confirmed endpoint RED authorizes managed-only continuation/structure-height/
  safe-pull-over behavior per the updated spec and Task4 brief. Tests first:
  both directions/deck height/speed-bounded transitions/final arrival at both
  cap states plus occupied/no-floor/steep rejection. Preserve legacy behavior,
  canonical rows, visible actors, promotion cap and four-route drive budgets.
  Search starts80m before feeder end; stations55/40/25m upstream; right offsets
  half-width+5/+8/+11m; retry2s; approach/pull-over5m/s; grade<=6%; actual maximum
  folded promoted-rig and ambient footprint plus0.5m clearance. Validate loaded
  floors, full plot/swept entry road/placement/body clearance and per-step
  occupancy. Apply the spec's explicit single downward serving-pavement-to-right-
  shoulder curb policy (<=0.10m), not a general grade relaxation: actual serving
  collider/footprint identity, full support/clearance, no uphill/larger/untagged
  or repeated steps, including across retries. Tests first cover0.09m positive,
  0.15m/untagged/repeated negatives and two fixed entry headings/positions; keep
  the real Seattle convoy staging and all existing unsafe-site controls.
  Unsafe candidates cause unarrived waiting upstream, never a hidden
  vanish or park in the junction. Existing TRAFFIC floor holds the tunables.
  Each managed convoy member validates its own safe arrival; do not chain-park
  lane-bound followers when a leader parks. Cover with real-agent regression
  before changing that managed call; retain on-touch chain/cargo/unmanaged law.
  Fresh drive160d1763 exposes cap exhaustion manufacturing arrival during a
  managed pull-over. Add tests-first public damage/promotion requests before
  and during actual departure at stockcap5: retain registered actor, unfinished
  trip/cruise, physical checks and eventual road-clear arrival. Continue a real
  full-cap convoy after its lead safely parks: both actors retained, follower
  earns a distinct clear plot; a still-in-lane stopped leader must keep blocking.
  Only then narrowly repair managed cap state and actual-footprint lane-leader
  membership. No cap, route/controller, budget, actor or unmanaged-law changes.

## Task 5: Visual acceptance, publication inside the repo and rollout record

Screenshot rejection reopens Task4 only for the fully-owned managed junction's
redundant axis-aligned square. Extend road_surface_sim first with actual mesh
and physical coverage/independent corner controls; then suppress supplemental
filler only when all incident roads use the same owned managed ribbon path.
Preserve mixed/unmanaged/non-ribbon fillers exactly, all road physics and map
bytes. A fresh ON-R input drive/crossing screenshot must verify the visible
correction. The task-4-visual brief/report records ownership and RED/GREEN;
this is not permission to redraw the other legacy street strips or terrain.

**Additional prerequisite Task3b — actual graph connectivity:** the parent-only
read-only J135 diagnostic now reproduces four public graph routes across the
known38.71m street/highway gap. The earlier no-navigation-change boundary is
extended narrowly: share the renderer's existing finite-pavement meeting law
with the graph and reject nonmeeting multi-road transfers, preserving all map
bytes, same-road travel, valid junctions, explicit ports and directional lanes.
Tests-first actual routes plus literal finite/nonmeeting and legitimate controls
are required. Keep single-leg endpoints valid. Report any lost reachability;
do not invent geometry or retain a phantom shortcut to make routing pass.
Implementation details, source ownership and separate review are recorded in
the Task3b brief. Cost of this ruling: other stale junctions may expose missing
connections; this is not permission for a country-wide map rebake.

Compatibility follow-up also updates only `exit_geometry_sim.gd`: its old40m
shared-anchor classifier misses both new managed mouths. Use owned off roles,
actual finite highway projections, unchanged edge/angle/right-side thresholds,
explicit managed two-direction coverage and retained legacy/ Meridian guards;
no production/map changes. The observed5/1 is the before-fix regression evidence.

**Files:** new `docs/verification/DIAMOND_INTERCHANGE_VISUAL_AUDIT_2026_09_06.md`,
exact screenshot copies under `docs/renders/diamond-interchange-2026-09-06/`,
`docs/HANDOFF.md`, `docs/AMERICA_FOUNDATION_STATUS.md`, existing 20-piece gallery.
Parent-owned portability addition: `tools/build_visual_review_pdf.py`, one
review PDF and its validation JSON under `output/pdf/`, plus the existing atlas
audit's damaged-capture disclosure. These are outside the worker's8-file commit.

- [ ] Preserve original and final PNGs/manifests, compare their SHA-256 hashes,
  record source commits, selected/missing sites, test commands, exits and limits.
- [x] Package the existing20-piece tour and two valid later interface views in
  a23-page PDF with clickable contents and criticism. Validate every embedded
  image against source pixels and inspect all rendered pages. Preserve the
  malformed atlas03 original; use separately captured valid04 with disclosure.
- [ ] Judge the actual world against the spec. If any turn is physically blocked
  or a screenshot exposes malformed geometry, return that concrete failure to
  the owning task instead of issuing acceptance from data-only tests.
- [ ] Independent whole-milestone review checks source/physics/evidence and
  unresolved mission requirements. Rerun affected checks after corrections.
- [ ] Update status with measured results and remaining per-site rollout. Show
  the actual comparisons. No new Windows export or whole-game completion claim
  unless separately built and verified. Keep the global goal active.
