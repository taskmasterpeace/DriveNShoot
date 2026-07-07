# ROAD & TRAFFIC OVERHAUL — lanes, dividers, and a world that drives itself

**Status:** GREENLIT (owner directive 2026-07-07: "overhaul our road system… create custom
traffic system on top of paths… we need 6, 4 and 2 lane highways, some with dividers, but
exits are the connections to the locations").
**Builds on:** `usmap.json` road rows (PILLAR 1: a road is a CHARACTER), the exit-node
system (World Structures §5), `MAP_POLISH_PLAN.md` (the content that will sit on these
bones), `motorist.gd`/`autopilot.gd` (the real-car layer this coexists with).

## 1. Overview

Today every road in the DSOA renders as one 13 m slab with a single dash, only the
*nearest* road materializes per chunk (an exit ramp can displace the interstate it meets),
and ambient "traffic" is at most two full-physics motorists spawned minutes apart. This
overhaul makes the road a real place: **lane count and median division become ROW DATA**
(6/4/2 lanes, `divided: true|false`), the streamer renders true geometry (twin carriageways,
physical median barriers, lane markings, correct grip footprints), and a **custom traffic
system runs on top of the road polylines (the paths)** — lightweight lane-following agents
with right-hand discipline, car-following, and exit-taking, that **promote to real
`ProtoCar3D` physics vehicles the moment the player touches them** (ram or bullet). Exits
stay the sole connective tissue: traffic leaves the highway only at exit ramps, headed to
the locations, and merges on from them.

## 2. Player Fantasy

You crest a rise on THE CRIMSON MILE and it *looks like an interstate*: three lanes your
side, a concrete median you'd better not bet your suspension against, oncoming headlights
safely across the divide. Traffic flows around you — slower trucks in the right lane, a
sedan braking off at EXIT 12 toward some town's lights. On a two-lane state route the same
world tightens: one lane each way, double yellow, an oncoming pickup that makes you hold
your breath. Every car out there is REAL if you make it real: clip one and it's suddenly
physics — spinning, honking, stealable, shootable. The country has a pulse, and the pulse
obeys the road.

## 3. Detailed Rules

### 3.1 LANE ROWS (data, never code)
Every road row in `usmap.json` gains two fields (additive; absent = defaults):
- `lanes`: total lane count, both directions. Legal: 2 | 4 | 6. Default: interstate 4, exit 2.
- `divided`: bool — a physical median. Default: `lanes >= 6`.

Assignment (this doc's data pass): I-95/I-90/I-80 = 6 divided · I-70/I-40/I-10/I-75 =
4 divided · I-5 = 4 undivided · I-35/I-25 = 2 undivided · exit-kind ramps = 2 undivided.
All three widths and both division states exist in the world from day one.

### 3.2 GEOMETRY (one law, shared by renderer and traffic)
`ProtoUSMap.road_geometry(road) -> {lanes, per_side, divided, width, carriage_w, median_w,
center_gap}` is the ONLY place lane math lives; the streamer, the traffic system, the
autopilot, and grip registration all read it.

```
LANE_W    = 3.6 m       SHOULDER = 1.0 m       MEDIAN_W = 2.4 m (barrier 0.5 wide rides its center)
undivided: width = lanes*LANE_W + 2*SHOULDER ;  center_gap = 0
divided:   carriage_w = (lanes/2)*LANE_W + 1.6 ; width = 2*carriage_w + MEDIAN_W
           center_gap = MEDIAN_W/2 + 0.8 (inner shoulder before lane 0)
lane_offset(road, lane) = center_gap + (lane + 0.5)*LANE_W    (right-hand side of travel)
```
6-div = 27.2 m · 4-div = 20.0 m · 4-undiv = 16.4 m · 2-undiv = 9.2 m (old: 13 m for all).

### 3.3 THE STREAMER RENDERS THE ROW
- **All roads within range materialize per chunk** (`usmap.roads_near`, plural) — fixes
  the nearest-only bug where a ramp could displace its own interstate. Each road id gets a
  deterministic tiny y-jitter so overlapping slabs at junctions never z-fight.
- Undivided: one slab, double-yellow center strip, white strips at every same-direction
  lane boundary.
- Divided: TWO carriageway slabs with a gap; a **physical median barrier** (`box_body`,
  0.5×0.8 m section, chunk-seam gaps read as expansion joints) — crossing means finding an
  exit or a seam, which is the point of a divided highway.
- Grip rects, tree clearance, and neighborhood setbacks all use the row's real width.
- Bridges (wet chunks) keep rails at the row's real edge.

### 3.4 TRAFFIC ON PATHS (`traffic.gd`, `ProtoTraffic`)
Agents are **path followers, not physics**: each tracks (road, segment index, distance-along,
lane, direction ±1, cruise speed) and every frame advances along the polyline, positioned at
its lane offset, yawed to the segment. Godot bodies: `AnimatableBody3D` + box visuals
(body/cab/emissive headlight quads) so hitscan and the player's bumper both find something.
- **Right-hand law:** direction picks the side; `lane ∈ [0, lanes/2)`.
- **Car-following:** agents bucket by (road, dir, lane); a follower within
  `headway_s × speed` of its leader matches the leader's speed, hard-stopping under 8 m.
  The PLAYER's car projects onto the road as a phantom leader — traffic brakes behind you
  (and honks once if you make it brake hard).
- **Exits are the connections:** approaching an exit node on its side of the highway, an
  agent rolls `exit_take_chance` — on success it transfers to the ramp's polyline and
  despawns at ramp's end ("went to the location"). Agents also occasionally SPAWN at a
  ramp's mouth, merging onto the highway. Traffic never leaves a road except at an exit.
- **Spawn/despawn band:** keep `budget` agents alive on roads within the band
  [`spawn_r_min`, `spawn_r_max`] of the player; cull beyond `despawn_r`. Budget shares
  weight by lane count (a 6-lane road is busier than a 2-lane).
- **PROMOTION (the one law that makes it real):** the moment an agent is *touched* —
  the player's car enters its proximity Area3D, or any `take_damage()` lands (hitscan,
  blast) — the agent is replaced in-place by a real `ProtoCar3D` (same transform, matched
  velocity, forwarded damage) with a short autopilot route that continues its lane then
  pulls over. Promoted cars are ordinary world cars: damageable through the 5-part law,
  stealable, lootable. Cap simultaneous promotions (`promote_cap`); at cap, contact just
  despawns the agent (never a physics storm).
- **Rows:** every knob above lives in a `TRAFFIC` dict (code floor) folded additively from
  `data/traffic.json` — same law as MOTION/motions.json.

### 3.5 REAL CARS KEEP THEIR LANE
`ProtoMotorist.plan_route` waypoints (and thus pirates/chase AI on routes) offset to the
right-hand lane center by segment direction — motorists stop driving the centerline into
oncoming traffic. Ambient agents and motorists coexist: motorists are the rare REAL cars
(ride shotgun, take the wheel); agents are the ambient flow that promotes on touch.

## 4. Formulas

- **Width (3.2):** worked: 6-lane divided = 2×((3×3.6)+1.6) + 2.4 = **27.2 m**;
  2-lane undivided = 2×3.6 + 2×1.0 = **9.2 m**.
- **Lane offset (3.2):** 6-div lane 1 = 2.0 + 1.5×3.6 = **7.4 m** right of center.
  4-undiv lane 0 = 0 + 0.5×3.6 = **1.8 m**.
- **Following:** `gap = leader_s − my_s − CAR_LEN`; if `gap < headway_s×speed` →
  `speed = min(speed, leader_speed × clamp(gap / (headway_s×speed), 0, 1))`; `gap < 8` → 0.
  Example: 21 m/s, headway 1.6 s → braking starts at 33.6 m.
- **Spawn weight:** `P(road) ∝ lanes` among roads within band. A 6-lane gets 3× a 2-lane.
- **Promotion velocity:** promoted car's `linear_velocity = seg_dir × agent_speed` — the
  handoff conserves momentum so the swap is invisible at 60 Hz.

## 5. Edge Cases

- **Two roads overlap in a chunk (ramp meets interstate):** both materialize; deterministic
  per-id y-jitter (≤24 mm) prevents z-fighting; grip rects union, so the seam is drivable.
- **Agent reaches polyline end (map edge):** despawn silently (beyond the band by
  construction — interstates end at coasts/borders).
- **Exit on the wrong side:** an agent only takes an exit whose ramp departs its travel
  side (dot of ramp direction vs. travel perp); wrong-side exits are ignored.
- **Promotion at cap:** contact despawns the agent instead — never more than `promote_cap`
  extra physics cars, never a silent no-op on gunfire (the shot's damage still voids the
  agent).
- **Divided median blocks a route:** intended. The autopilot's whiskers already treat the
  barrier as a wall; routes cross carriageways only via ramps. Chunk-seam gaps (~ meters)
  exist but are rare enough to read as expansion joints, not doors.
- **Player parks ON the road:** traffic projects the player as a lane leader and stops
  behind (honking); it never re-lanes around in V1 — a parked player can dam a lane, which
  is a feature (roadblock play) not a bug.
- **Multiplayer:** ambient agents are LOCAL ambience (not net-synced); promoted cars enter
  `cars` and ride the existing vehicle sync. Peers may see different ambient flows —
  acceptable V1, documented here.
- **Save/load:** agents are ephemeral (never saved); promoted cars persist like any car.

## 6. Dependencies

- **Reads:** `usmap.json` rows (schema owner: World Structures spec) · `road_geometry`
  consumers: `world_stream.gd`, `traffic.gd`, `motorist.gd`, `world_builder.gd` grip ·
  exit nodes (§5) for take/merge points · `ProtoCar3D.create` + 5-part damage for
  promotion · `audio.gd` horn.
- **Written for:** `MAP_POLISH_PLAN.md`'s ~46 exits become traffic destinations the day
  they land (this doc is the mechanical layer under that content plan — bidirectional).
- **Tools:** MapForge `/api/roads` POST gains `lanes`/`divided` passthrough (character-
  preserving, same as danger/nickname); its road list shows them.
- **Does not touch:** save schema (agents ephemeral), net protocol (local ambience),
  radio/toll/ambush row consumers (`road_sim` must stay green untouched).

## 7. Tuning Knobs

| Knob | Default | Range | Governs |
|---|---:|---|---|
| `LANE_W` | 3.6 | 3.2–4.0 | all road widths (visual + grip) |
| `MEDIAN_W` | 2.4 | 1.5–4.0 | divided-highway footprint |
| `budget` | 12 | 0–24 | ambient density (0 = empty roads, apocalypse dial) |
| `spawn_r_min/max` | 260/420 | ≥200 | how far out traffic materializes |
| `despawn_r` | 550 | > spawn_r_max | cull distance |
| `headway_s` | 1.6 | 0.8–3.0 | following aggression (tailgater ↔ cautious) |
| `speed_by_lanes` | 16/21/26 | ±50% | cruise speed per road class (2/4/6) |
| `exit_take_chance` | 0.35 | 0–1 | how alive the exits feel |
| `merge_chance` | 0.3 | 0–1 | share of spawns that enter via a ramp |
| `promote_cap` | 5 | 0–10 | max simultaneous promoted physics cars |
| `honk_brake_mps2` | 6.0 | 3–12 | how hard a brake triggers the horn |

All ride `TRAFFIC` (code floor) ⊕ `data/traffic.json` (additive fold, F10 reload).

## 8. Acceptance Criteria (each testable, sims named)

1. **Rows parse with defaults** (`road_lane_sim`): a row without `lanes` reads 4
   (interstate) / 2 (exit); `divided` defaults true iff lanes ≥ 6.
2. **Geometry law** (`road_lane_sim`): widths equal §4's worked numbers exactly.
3. **Divided rendering** (`road_lane_sim`): a chunk over a 6-lane divided road contains
   two carriageway slabs at ±(median/2 + carriage/2) and ≥1 physical barrier body; a
   2-lane chunk contains one slab and a yellow center strip.
4. **Multi-road chunks** (`road_lane_sim`): a chunk containing an interstate AND its exit
   ramp registers ≥2 grip rects (the old code registered exactly 1).
5. **Grip width** (`road_lane_sim`): `surface_at()` = "road" at the outer lane center of a
   6-lane divided highway (13.4 m out — "dirt" under the old 13 m slab) and "dirt" past
   the shoulder.
6. **Right-hand law** (`traffic_sim`): spawned agents' lateral offset sign matches travel
   direction for both directions.
7. **Following** (`traffic_sim`): a follower behind a slow leader in-lane closes to ≥8 m
   and matches speed within 20%; never passes through.
8. **Exits connect** (`traffic_sim`): with `exit_take_chance = 1.0`, an agent approaching
   an exit transfers to the ramp polyline and despawns at its end.
9. **Promotion** (`traffic_sim`): `take_damage()` on an agent yields a real `ProtoCar3D`
   at its transform with damage applied and the agent freed; promotions stop at
   `promote_cap`.
10. **Budget & cull** (`traffic_sim`): population never exceeds `budget`; agents beyond
    `despawn_r` free within one maintenance tick.
11. **Nothing regresses** (gate): `road_sim`, `npc_drive_sim`, `drive_sim`, `world_sim`,
    `save_sim`, `roadkill_sim` all green untouched.
