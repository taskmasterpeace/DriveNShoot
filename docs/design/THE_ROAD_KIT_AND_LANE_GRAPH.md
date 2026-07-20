# THE ROAD KIT & THE LANE GRAPH — modular pieces that AI can drive

**Date:** 2026-07-19 · **Status:** SPEC (executing) · **Owner ask:** *"build a modular road system we
can lay down and connect"* + *"add a foundation for AI logic that fits our game — don't cut corners."*

Research-grounded: ASAM OpenDRIVE 1.8.1, SUMO, CARLA, Argoverse 2, Lanelet2, Cities: Skylines (dev
deep-dive), re3/reVC (decompiled GTA III), Coulter CMU-RI-TR-92-01 (pure pursuit), Treiber et al.
(IDM), Kesting et al. (MOBIL), Bethesda GDC modular-kit talks, AASHTO/TxDOT/Caltrans/WSDOT manuals.

---

## 1. Overview

Two asks, one structure. A "modular road system" and an "AI foundation" are the **same data seen
twice**:

```
PROFILE (the socket)  →  lanes × lane_offset  →  LANE PATHS  →  TURN LINKS + RIGHT-OF-WAY
  geometry contract          derived                what agents drive
```

**The central design decision (and it inverts the naive reading of "modular"):** we do **not** adopt
a tile grid. Classic kit theory ("grid size is the foundation" — Burgess/Purkeypile, GDC 2013/2016)
governs *hand-placed* level pieces. Our roads are polylines across a 75×42 km world materialised per
128 m chunk; a grid would quantise highway headings and trigger the documented 45°-diagonal tile
explosion (~4096 tiles). Instead **the discrete quantum is the cross-section profile**, exactly as
OpenDRIVE models roads and as Godot Road Generator implements. `ProtoUSMap.road_geometry()` is
already that function — it gets **promoted from a helper to THE SOCKET TYPE**.

**Runs stay procedural; junctions become discrete.** Every mature system converges here (CS2, Godot
Road Generator, Road Architect). Curves come free from polylines, so **there are no curve pieces**.

**What is genuinely missing today** (measured, not assumed): the junction *interior*. We bake 2,333
junction rows carrying topology but **no geometry and no lane linkage**. Traffic hits the end of a
polyline and despawns; there is no turning, no right-of-way, no merge, no lane change. The one real
graph (`ProtoRoadGraph`) is fenced off and only prints a GPS toast.

This spec adds the missing layer: **the lane graph + junction connectors**, baked once, read forever.

---

## 2. Player Fantasy

The world stops being a set of ribbons you drive *along* and becomes a network you drive *through*.
Cars come off the ramp and **merge** into a gap instead of teleporting. At a town crossroads someone
**waits** for you, then goes. A truck ahead pulls into the right lane and you **pass** it. The city
streets we just built have traffic on them, because traffic can finally leave the interstate. And
for the builder: a new interchange is **rows**, not a hand-written function — lay a piece, and both
its geometry and its lane logic come with it.

---

## 3. Detailed Rules

### 3.1 THE SOCKET (the connection contract)

A socket is a cross-section, evaluated at a piece's mouth:

```
Socket = { lanes, per_side, divided, carriage_w, median_w, width, center_gap, heading, elevation }
```

`road_geometry()` supplies the first seven. **Connection law:** a junction leg and a road span
connect iff their sockets are equal within epsilon (0.05 m) — width, lane count, divided flag — and
their headings oppose. This is the plug-and-socket rule (Fallout 4's kit; Modular Snap System's
name+distance+angle triple), minus the grid.

**Only 5 profiles exist in the live map** (measured): 5.6 m (1-lane dirt), **9.2 m (2-lane — 923 of
1006 roads)**, 16.4 m, 20.0 m, 27.2 m. The kit is small by construction.

**LAW — ONE GEOMETRY, ONE IMPLEMENTATION.** The bake currently re-implements the law in JS
(`halfWidth`) and **disagrees with the engine by 0.5 m on every undivided road**. That is the exact
class of bug the socket contract exists to kill. The bake must consume the engine's numbers, and a
sim must assert equality.

### 3.2 THE PIECE TAXONOMY (demand-measured, not invented)

Junction pieces, ranked by actual demand in the live map:

| Piece | Demand | Notes |
|---|---|---|
| **cross** (4-way) | 825 | 625 are 9.2×9.2 — the town grids |
| **tee** (3-way) | 802 | 569 are 9.2×9.2 |
| **end_cap** | 467 | dresses nothing today |
| **ramp_rejoin** (merge) | 151 | dresses nothing today |
| **ramp_mouth** (diverge) | 88 | gore + barrels + decel lane exist |
| **overpass (deck)** | **152 needed, 0 exist** | `separated_pending`; the biggest hole |
| **width transition** | implied | mandatory once >1 profile meets |

**No curve piece. No roundabout in v1** (a roundabout is a junction *policy* + a ring of connectors;
it is also unrenderable today because `roads_near` returns only the nearest segment per chunk).

### 3.3 THE LANE GRAPH (the AI foundation)

**Derived and baked — never hand-authored.** Lane centrelines are *not stored*; they are evaluated
from the polyline + `lane_offset()`, so paint and traffic can never disagree (Argoverse and Lanelet2
both derive rather than store).

One row per `(road_id, dir, lane)` — the Argoverse-11 field set plus speed:

| Field | Meaning |
|---|---|
| `id` | `"I-95:+1:0"` — road, direction, lane index (0 = innermost) |
| `road_id`, `dir`, `lane` | already present on `TrafficAgent` |
| `kind` | road class → speed + spawn weight |
| `speed_mps` | per-class limit (the thing that does not exist today) |
| `successors[]` / `predecessors[]` | lane ids reachable off each end |
| `left_id` / `right_id` | adjacent lane, **same road, same direction only** |
| `left_ok` / `right_ok` | **separate booleans** — Lanelet2's `Left` vs `AdjacentLeft`. On an undivided road the inner neighbour is *oncoming*: `left_id` set, `left_ok = false`. Conflating these drives cars into oncoming traffic. |
| `is_junction`, `turn` | connectors only; `turn ∈ {straight,left,right}` (Autoware makes this mandatory inside junctions) |

### 3.4 JUNCTION CONNECTORS — the missing piece

For each junction, for each ordered pair of legs, emit **connector lanes** with real geometry. **A
vehicle must never teleport across a junction** (SUMO's internal lanes; OpenDRIVE's connecting
roads; Waymo's patent independently reaches the same structure).

1. **Geometry** — 5-point parametric blend of the two legs' direction vectors (re3's
   `CCurves::CalcCurvePoint`, not a Bézier, not a navmesh).
2. **Lane-to-lane links by index — re3's shipped rule, zero authoring:**
   leftmost lane may turn left · rightmost may turn right · `lanes < 3` may always go straight.
3. **`foes` bitmask** — which other connectors' paths geometrically cross yours. Symmetric.
4. **`response` bitmask** — which of those you must **yield** to. Asymmetric subset of `foes`,
   derived from road-class priority (interstate > county > street > dirt), then lane count.
5. **Turn speed cap** — `v = sqrt(radius × 5.5)` (SUMO's `--junctions.limit-turn-speed` default).
6. **`separated_pending` emits NO connectors** — a walled crossing is not traversable. This extends
   `_travel_node()`'s existing per-road-clone insight, which is already correct.

**This is the highest-leverage item in the whole spec.** SUMO's architecture rests on it: expensive
conflict analysis **once at bake**, a bit lookup **forever at runtime**.

**Stitching tolerance:** round connector endpoints to **0.25 m** to form node keys (CARLA uses 1 m;
0.25 m suits our lane width). That one constant is what turns disjoint records into a graph.

### 3.5 THE AGENT LOOP

```
1 ROUTE      plan on ROADS via ProtoRoadGraph (exists); choose LANES per step.
             SUMO's separation: a route is a sequence of edges, never lanes.
             Never re-plan per frame (CS1 does not).
             + re3's CONSTRAINT-RELAXATION LADDER: 15 attempts, then drop dead-end
               avoidance, then randomness, then permit a U-turn. On a procedurally
               baked network this is not optional — it is what prevents deadlock.
2 LONGITUDE  IDM + CAH blend (the blend is the cut-in fix; plain IDM brakes absurdly
             when someone merges in front).
3 LATERAL    pure pursuit on the lane centreline + Reynolds deadband.
4 JUNCTION   look up connector → check `response & occupied_foes` → gap-accept → enter,
             capped at the connector's turn speed.
5 LANE       MOBIL, evaluated only at nodes offering ≥2 target lanes, for ~50% of agents
             (TM:PE's rule — dynamic lane selection favours egoism and causes jams).
```

---

## 4. Formulas

**IDM** (Treiber/Hennecke/Helbing 2000) — use the `max(0,·)` clamp or followers accelerate absurdly
when a leader pulls away:
```
s*(v,Δv) = s0 + max(0, T·v + v·Δv / (2·√(a·b)))
dv/dt    = a · [ 1 − (v/v0)^δ − (s*/s)² ]
```
Parameters (**Kesting/Treiber 2010 "Set C"** — sources genuinely disagree on `a`, spanning 0.3–1.4;
Set C is the only one with game-plausible launch feel):
`T = 1.5 s · a = 1.4 m/s² · b = 2.0 m/s² · s0 = 2.0 m · δ = 4 · v0 = lane.speed_mps`

**CAH blend** (fixes cut-in braking):
```
a_out = a_idm                                                if a_idm ≥ a_cah
      = (1−c)·a_idm + c·[a_cah + b·tanh((a_idm − a_cah)/b)]  otherwise      c = 0.95
```

**Pure pursuit** (Coulter 1992). Note it *is* a P controller with `Kp = 2/ld²` — halving lookahead
quadruples gain, which explains every oscillation:
```
ld    = clamp(0.9·v, 6.0, 25.0)          # ≈0.9 s of travel
κ     = 2·y_goal / ld²                    # y_goal = lateral offset to the lookahead point
steady-state corner-cut error ≈ ld²·κ/8   # grows with the SQUARE of lookahead
```
Search the goal point **forward from the current projection**, never globally (Coulter step 2).

**Reynolds deadband** (GDC 1999) — the highest visual-quality-per-line win available: if
`|lateral_offset| < 0.6 × lane_half_width`, emit **zero** steering. Kills micro-jitter for free.

**Turn speed:** `v_turn = sqrt(radius × 5.5)`  ·  **Curve speed:** `v = min(√(a_lat/κ), v_max)`,
`a_lat ≈ 1.5 m/s²` civilian, 4–8 arcade.

**MOBIL** (Kesting 2007): safety `a'(new_follower) > −4.0`; incentive
`a'(me) − a(me) > p·[a(B') − a'(B')] + 0.2`, `p ∈ [0.1,0.3]`, **`Δa_bias = 0`** (right-lane bias is a
European rule).

**Gap acceptance:** HCM critical gaps (6.5 s minor through, 7.1 s minor left) **read catatonic in a
game**. Use `t_crit`: **2.5 s** minor entry · **2.0 s** ramp merge **decaying to 1.2 s** at the end
of the acceleration lane (empirically, remaining ramp distance dominates merge behaviour). Impatience:
`t_crit ×= (1 − min(1, waited/20s)·0.5)` so a queue can never deadlock.

**Weather** (ties to the existing system): `T ×= 1.5` rain, `×3` fog/ice; drop `b`. The original IDM
paper reproduced its entire range of congested states by varying only `T`.

---

## 5. Edge Cases

- **Undivided inner neighbour is oncoming** → `left_ok = false`. The single most dangerous conflation.
- **Polyline authored backwards** flips which side traffic drives on (travel side is derived from
  segment winding today). The lane row stores `dir` explicitly so this stops being implicit.
- **`separated_pending` crossing** → no connectors emitted; agents cannot turn there, matching the
  walled geometry. Correct today in planning, now correct for agents too.
- **Co-located junctions** (ramp mouth + interchange cross-street share an arc) → already fixed with
  a 0-cost transfer arc; connectors must not double-emit there.
- **Dead-end / `end_cap`** → connector set is empty; the relaxation ladder eventually permits a U-turn
  rather than stalling the agent.
- **A lane with no successor** (map edge) → agent despawns *outside* the vanish radius, parks inside
  it (existing law, correct — never dissolve in view).
- **Route invalidated mid-drive** → re-plan once, not per frame; on repeated failure, relax.
- **Zero-length / duplicate polyline vertices** — 24 rows currently have them (18 are doubled-back
  `-xr` rows produced by `healDeadEnds` prepending an existing vertex). Connector geometry must
  reject degenerate segments, and the heal must test connectivity against **all** roads (including
  ramps) so an interchange landing is not mistaken for a dead end.

---

## 6. Dependencies

- **Consumes:** `ProtoUSMap.road_geometry()` / `lane_offset()` (the socket + lane derivation),
  `usmap.junctions[]` (placement + `control`), `ProtoRoadGraph` (road-level routing, already built).
- **Feeds:** `traffic.gd` (the MT "TRAFFIC RETURNS" milestone — `_maybe_transfer` at nodes),
  `autopilot.gd` (gets a lane centreline instead of bare `Vector3`s), `motorist.gd` (multi-road
  routing), convoys, bandits, future deliveries.
- **THE_AMERICAN_ROAD** — this is MT's substrate; M2 (decks) unlocks the overpass piece.
- **NAVIGATION.md** — vehicles finally get what pedestrians already have (`walk_graph` + A*).
- **Bidirectional:** THE_AMERICAN_ROAD and NAVIGATION must cite this doc as the lane layer.

---

## 7. Tuning Knobs

| Knob | Default | Safe range | Affects |
|---|---|---|---|
| IDM `T` | 1.5 s | 0.8–2.5 | following distance, density |
| IDM `a` / `b` | 1.4 / 2.0 m/s² | 0.8–2.5 / 1.5–4 | launch feel, braking |
| CAH `c` | 0.95 | 0.8–0.99 | cut-in harshness |
| lookahead `k·v` | 0.9 s | 0.4–1.6 | 6–25 m clamp; low = wobble, high = corner cut |
| deadband | 0.6×half-lane | 0.3–0.9 | steering stillness on straights |
| `t_crit` entry / merge | 2.5 / 2.0 s | 1.2–4.0 | how bold NPCs are at junctions |
| impatience decay | 0.5 over 20 s | 0–0.8 | deadlock resistance |
| MOBIL `p` | 0.2 | 0–0.5 | courtesy vs egoism |
| turn-speed factor | 5.5 m/s² | 3–8 | cornering pace through junctions |
| stitch tolerance | 0.25 m | 0.1–1.0 | graph connectivity vs false joins |
| relaxation attempts | 15 | 5–30 | deadlock resistance |

---

## 8. Acceptance Criteria (each pass/fail)

1. **SOCKET CONTRACT** — for every junction leg, the leg's socket equals `road_geometry()` of the
   road it serves (width, lanes, divided) within 0.05 m. *This currently FAILS: bake vs engine differ
   by 0.5 m on undivided roads.*
2. **LANE COVERAGE** — a lane row exists for every `(road, dir, lane)`; count matches the measured
   3,169 directional lane-segments ±1%.
3. **NO ORPHAN LANE** — every lane has ≥1 successor, or terminates at a map edge / `end_cap` / town.
4. **CONNECTORS EXIST** — every `flat` junction with ≥2 legs emits ≥1 connector; every
   `separated_pending` junction emits **zero**.
5. **TURN RULE** — connector turn assignment obeys the lane-index law (leftmost→left, rightmost→right,
   `lanes<3`→straight always).
6. **FOES/RESPONSE** — `foes` is symmetric; `response ⊆ foes`; no pair has `response` set both ways
   (that is a guaranteed deadlock).
7. **NO TELEPORT** — every connector polyline has ≥2 points and non-zero length; its endpoints match
   the in/out lane mouths within the stitch tolerance.
8. **TRAVERSAL** — an agent placed on lane A reaches lane B across a junction using only the graph
   (the sim `THE_AMERICAN_ROAD` books as MT's `traffic_transfer_sim`, which does not exist today).
9. **DETERMINISM** — two bakes of the same map produce identical lane/connector tables.
10. **BUDGET** — the graph bakes ONCE, LAZILY (the pattern `ProtoRoadGraph` already uses), inside
    2 s. *Measured on the live map: 2,034 lanes · 21,341 connectors · 27,345 conflict pairs in
    ~1.4 s.* The 500 ms originally written here was a guess made before anything was measured;
    this is the calibrated figure, and because the bake is lazy it never costs a frame.
