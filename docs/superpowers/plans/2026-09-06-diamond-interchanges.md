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

## Task 3: Shared runtime ports, directed routing and traffic

**Files:** `game/proto3d/usmap.gd`, `traffic.gd`, `road_graph.gd`, new
`game/proto3d/tests/interchange_ports_sim.{gd,tscn}`, runner allowlist.
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
- [ ] Commit after RED/GREEN evidence and independent task review.

## Task 4: Physical road presentation and four-direction driving proof

**Files:** `world_stream.gd`; new `interchange_drive_sim.{gd,tscn}`;
`road_surface_sim.gd` only to extend coverage honestly; isolated runner.
**Consumes:** shared ports, same managed rows/geometry as Task 3.
**Produces:** actual port signs/decel/accel/gore placement and physical traversal
evidence, plus unedited captures under a unique isolated build run.

- [ ] Write physics probes that fail on the original median-crossing data and
  barrels placed on the ramp centre. Sample full ramp widths and bridge
  clearance/deck collision; require successful floor rays at every point.
- [ ] Use actual per-port positions and heights for signs and acceleration/
  deceleration strips. Place gores/barrels in the clear wedge, reserving full
  highway and ramp footprints. One-way markings use white rather than yellow.
  Keep decks/rails clear of ground-level local turning junctions.
  Regression-check elevated `road_guard_rail` drape exemption (the existing
  roadside tag is a different `road_guardrail`), and verify column placement
  on densified short deck spans rather than relying on per-span length/30.
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
- [ ] Parent inspects every final capture, runs broad surface and relevant
  road/junction/traffic/atlas/elevation checks, records baseline failures and
  hashes map bytes after every scene. Commit only with evidence and review.

## Task 5: Visual acceptance, publication inside the repo and rollout record

**Files:** new `docs/verification/DIAMOND_INTERCHANGE_VISUAL_AUDIT_2026_09_06.md`,
exact screenshot copies under `docs/renders/diamond-interchange-2026-09-06/`,
`docs/HANDOFF.md`, `docs/AMERICA_FOUNDATION_STATUS.md`, existing 20-piece gallery.

- [ ] Preserve original and final PNGs/manifests, compare their SHA-256 hashes,
  record source commits, selected/missing sites, test commands, exits and limits.
- [ ] Judge the actual world against the spec. If any turn is physically blocked
  or a screenshot exposes malformed geometry, return that concrete failure to
  the owning task instead of issuing acceptance from data-only tests.
- [ ] Independent whole-milestone review checks source/physics/evidence and
  unresolved mission requirements. Rerun affected checks after corrections.
- [ ] Update status with measured results and remaining per-site rollout. Show
  the actual comparisons. No new Windows export or whole-game completion claim
  unless separately built and verified. Keep the global goal active.
