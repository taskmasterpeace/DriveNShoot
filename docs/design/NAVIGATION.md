# NAVIGATION — the journey law (walk / drive / fly, one contract)

**Status:** GREENLIT design spec (owner directive 2026-07-09: *"improve the navigation of different AIs —
driving, walking, flying — a system that allows our people to do what they need to do"*).
**Deep pass (owner-picked, 2026-07-09):** §9 THE COLD-START SPEC — schemas, the v0 graph algorithm,
parking/door state machines, the steering port map, sim staging. Implementation can start cold.
**Scope law:** PURPOSEFUL movers only — a named actor with a reason (the wife walking to church, a
collector hauling scrip, a courier driving I-95, a drone survey). **Ambient traffic stays PARKED**
(THE_AMERICAN_ROAD ruling 0.16 — binding; this doc never spawns a car without a name and a mission).
Live cap ~6 movers, all despawnable.
**Ground truth (verified):** there is NO navigation system today — zero NavigationServer/NavMesh/AStar
in `game/proto3d/`. Ten bespoke steering brains; exactly two react to obstacles (ProtoAutopilot's
whiskers, `track/autopilot.gd:105-141`; the dog's stuck-sidestep + auto-JUMP, `dog.gd:569-585`). The
only purposeful traveler is ProtoMotorist — single-polyline, interstate-only, and its failure mode is
standing still forever. Town NPCs pace 2 m and never enter a building.
**Core laws:** **A journey is a ROW** · **three fidelity tiers, one truth** (RECORD ↔ SHELL ↔ BODY,
same `progress_m`) · **one brain per domain, already written** (autopilot / dog-laws-extracted / drone)
· **NO navmesh** (a town WALK GRAPH baked from rows; NavigationServer is the named escape hatch for
downtown grids only if `nav_walk_sim` fails there) · **NEVER A STATUE** (every journey has a
fail_verb and an escalation ladder — the motorist's stand-forever is outlawed).

## 1. The contract

`ProtoJourneys.start(actor, goal) → journey` — one new director (`nav/journeys.gd`) owns every journey:
**GOAL → ROUTE (legs: WALK | DRIVE | FLY | BOARD | UNBOARD | VERB) → LOCOMOTION → ARRIVE → VERB.**
Directors (empire, family, ecology, events) issue goals; NAVIGATION moves people, it never decides why.
Example — a collector run: `[WALK(shop_door→curb), BOARD(sedan), DRIVE(shop→safehouse exit, park_spot),
UNBOARD, WALK(→safe door), VERB deliver(safe, {scrip:120})]`.

**Route domains:** **DRIVE** = `ProtoRoadGraph.route()` (AMERICAN_ROAD M1 — this doc is its second
sanctioned consumer after atlas/GPS; ambient agents wait for MT) with lane-offset waypoints via the ONE
geometry law; pre-M1 fallback = `ProtoMotorist.plan_route` verbatim (single-highway journeys; M1 swaps
the backend, not the callers). **WALK** = A* over the town walk graph in towns; open terrain =
straight-line + steering, legs capped 400 m (longer goes RECORD). **FLY** = the drone FSM + one new law
(terrain clearance — today it would clip relief); signal range validates at plan time.

**Fidelity tiers:** BODY (full node) near the player · SHELL (drive-only: transform-driven arc follower
on analytic ground — the traffic trick, no floor colliders; **the 120–550 m interception band**: a
SHELL courier promotes to a real car on bumper/bullet with cargo — the Gangland interception mechanic,
already built as the traffic PROMOTION law) · RECORD (a dict advancing by clock — the metaworld
pattern). Player distance picks the tier; `progress_m` is the same number in all three.

## 2. The steering layer (`nav/steering.gd` — extracted, not invented)

Walker: the dog's laws ported to ALL walkers — accel law, **stuck-sidestep** (pinned 0.35 s → lateral
impulse + re-roll angle), whisker-lite (2 knee rays ±0.5 rad × 2.2 m), LEAP for animals /
**STEP-UP** for humans (obstacle top < 0.5 m). Driver: ProtoAutopilot UNCHANGED + two new signals
(`route_done`, `stuck_escalated`) so the director can re-plan — today the pilot retries forever,
silently. Flyer: clearance sampling only.

**Obstacles:** median barrier — the graph never routes across one (crossings only via junction gaps
0.3 / riro ramps 0.2; a gap is a WALK crossing too) · fence gates = walk edges with the door law ·
**DOORS** — entrance nodes + NEW `ProtoDoor.npc_open(actor)`: unlocked → opens with the player's own
audio/anim; locked → alternate entrance → fail ladder; **NPCs never open player-locked doors — they
KNOCK** (the home-invasion read stays player-controlled).

## 3. The walk graph — rows, not mesh

Sources: street-kit rows (two sidewalk polylines per street at `±(width/2 + SIDEWALK_OFF)`, nodes at
ends/junctions, crossing edges over junction slabs) + structure rows' **`entrances[]`** (required for
any row with jobs — *a workplace without a door is a lie*; THE BUILDING BOOK owns the field) + town
anchor/plaza nodes. 30–80 nodes per main-street town, 200–400 per downtown; A* in microseconds.
**V0 honesty:** street kits are spec-only today → v0 auto-derives a ring + one spoke per placement to
its doorway face, schema-identical, so street kits upgrade the *data*, not the code. Graph folds from
rows — **routes plan for towns whose chunks have never been built**.

## 4. Offscreen continuation — the record law

Dehydrate past 420 m (or at chunk unload): the node frees, the journey row IS the record. Advance on
the ProtoJourneys tick (0.5 game-hours — the companion job cadence, honoring T-wait/dev clock; +5 s
polls near the ring). **Position is DERIVED — `pos = route.point_at_arc(progress_m)` — never
integrated**: no drift, trivially save-safe, and honest enough to project a rival collector's arc on
the atlas. Rematerialize under 300 m of `point_at_arc` **via a standalone never-in-view check owned by
ProtoJourneys** (camera + vision-cone test — deliberately NOT `population.safe_to_spawn`, so NAV
carries no dependency on the P0 population wiring; they converge later). Offscreen arrivals execute
verbs in record form and narrate via `metaworld.come_home` + the return briefing.
**Schedules are arrival deadlines:** a scheduled actor's position of record is `point_at_arc(now)`
along her commute — anything targeting her (hit squads, the player's binoculars) targets THAT, never
the slot's endpoint. **Crisis states persist in the save** (stuck counters, downed clocks — no alt-F4
escapes). Journey actors NEVER enter the population count bank (named movers ≠ anonymous crowds).
**Weather:** F1 route cost and F3 offscreen advance carry a `weather_mult` hook (storm discs slow
records too — constant 1.0 in v1, one knob; WEATHER_AND_SEASONS.md is a listed dependency).

## 5. The failure law (one ladder)

1 LOCAL (silent): stuck-reverse / sidestep+leap. 2 RE-PLAN: ≥2 recoveries in 20 s → re-route, failed
edge cost ×8. 3 RESOLVE: off-view → dehydrate and advance (unseen failure is honest); in-view → fail
FORWARD (driver pulls over + hazards; walker waits at the nearest node with a grumble bark; flyer
hovers) + `journey_failed(reason)` — the issuing director owns the fiction. 4 `fail_verb` per row:
`despawn_offview | return_home | wait_for_rescue`.
**Arrival tolerances (one table):** DRIVE pass 24 m / arrive ≤8 m & <1.5 m/s · WALK node 0.9 / final
0.5 m · BOARD 2.6 m · FLY 1.5 m — all 2D (the top-down law).

## 6. Arrive → verb (the do-stuff handoff)

Terminal verbs are existing systems keyed by rows: `enter(placement, entrance)` (npc_open → interior
anchor → act overlay — occupants can now ARRIVE, not just be placed) · `man_counter(anchor)` ·
`deliver(container, items)` (scrip physically in a box — the trunk law) · `patrol(anchor, pattern)` ·
`board/unboard` · `visit(node, dwell)` (church = visit 40 game-min) · `despawn`.
**Set-piece carve-out:** venue crowds (wedding guests) are NOT journeys — they materialize at work
spots via the never-in-view gate and walk the last 50 m; only cross-map movers count against LIVE_CAP.

## 7. Surfacing

Arrivals notify within 40 m. Journeys you have intel on (your collectors always; rivals via
informants/drone) draw **honest projected arcs on the atlas** (F3 is deterministic — that's why
ambush-planning works). The N board lists own journeys ("Sal — cash run, ETA 6 min"); the K sheet
shows family/crew journey state ("at church" · "driving I-95, mile 34").

## 8. Dependencies · Knobs · Acceptance

**Deps:** AMERICAN_ROAD (road_graph M1 §0.2/0.16, street kits 0.8, junction gaps 0.3, surface 0.17;
NAV feeds its amendments: entrances/parking/counter/door_class/sidewalk fields — now owned by THE
BUILDING BOOK) · THE_FAMILY_EMPIRE (the client: collectors, couriers, hit squads, church walks;
interception = SHELL promotion) · ECOSYSTEM (movers emit the same noise signals predators read; a
gator eating a courier is designed-for — cargo drops where the body fell) · WEATHER (weather_mult) ·
metaworld (the record pattern donor) · net.gd (journeys host-authoritative; clients ghost).
**Knobs** (data/nav.json): LIVE_CAP 4–8 · R_hydrate 250–350 / R_dehydrate 380–500 (hysteresis ≥80) ·
W_danger 0–60 s/pt (the courier-avoids-THE-CRIMSON-MILE dial) · η per domain 0.6–1.0 · SHELL band ·
walker whiskers/t_stuck · SIDEWALK_OFF · fly clearance. `danger_pts` sources include
`infection_pressure` and `choir_zone` (THE_INFECTED.md F-NAV, I2 — cost, never a wall; W_danger prices it).
**Sims:** `nav_walk_sim` (door-to-door through a real door) · `nav_walk_block_sim` (obstacle →
sidestep → re-plan, never a statue) · `nav_drive_sim` (multi-leg drive, park in a spot) ·
`nav_fly_sim` (relief clearance) · `nav_offscreen_sim` (dehydrate → arithmetic → rematerialize at the
arc, deterministic, save round-trip) · `nav_intercept_sim` (SHELL courier promotes on bumper, satchel
intact). Universal assert: frame displacement of any LIVE mover ≤ `v_max×delta×1.5`; hydration is the
staged exception and must occur off-view.

**Phases:** **P0** (shared workorder, named once: wire ProtoPopulation + fix the hanging
`population_cell_sim` — owned by the empire arc, cited here; NAV itself does not block on it) ·
**NAV-P1** the contract + WALK domain + v0 graph + steering port (the wife can walk to church through
the door) · **NAV-P2** DRIVE domain on the M1 graph + SHELL tier + records (the collector run,
interceptable) · **NAV-P3** FLY + full failure ladder + atlas arcs. world_stream.gd touch order
(the hot file): P0 → AMERICAN_ROAD M-work → NAV-P2's dehydrate hook.

*NAVIGATION moves people. WHY they move is THE_FAMILY_EMPIRE's job. What they walk through is THE
BUILDING BOOK's. What they drive on is THE AMERICAN ROAD's.*

---

# 9. THE COLD-START SPEC (the deep pass — owner-picked 2026-07-09)

*Everything above is the contract. Everything below is so implementation can start COLD — schemas,
algorithms, state machines, signatures, staging. Code cites re-verified against the worktree this date.*

**Player fantasy, stated once:** the town breathes on the clock. Sal locks the shop, walks to his
sedan, and drives the take home — and because his journey is a row, you can tail him, T-bone him at
the underpass (the SHELL promotion), or read his arc off the atlas and be waiting. Your wife walks
to church Sundays and knocks when you've locked the door. Nobody teleports, nobody stands forever,
and every ambush you plan against the world is one the world could run against you.

## 9.1 THE JOURNEY ROW (runtime dict; templates are rows)

Journeys are CREATED by directors at runtime; recurring commutes are authored TEMPLATES
(`data/journey_templates.json`, additive fold: `{id, actor_ref, days, depart_h, goal, priority}` —
the schedule law: templates mint a journey each valid day; the deadline is `depart_h + eta × 1.3`).
The runtime row (serializes AS-IS under `save.journeys[]`; Vector3s stored `[x,z]`, the top-down law):

```json
{ "id": "jrn_412", "actor": {"kind": "family|crew|npc|drone", "ref": "sal"},
  "priority": 2, "tier": "RECORD", "state": "active",
  "legs": [
    {"kind":"walk",  "from":"door_shop", "to":"curb_shop", "path":["door_shop","curb_shop"], "arc_m":14.0},
    {"kind":"board", "vehicle":"veh_sal_sedan", "seat":"driver"},
    {"kind":"drive", "route":{"road":"I-95","a_arc":8200.0,"b_arc":14400.0,"lane":1}, "park":"spot|curb"},
    {"kind":"unboard"},
    {"kind":"walk",  "from":"curb_safe", "to":"door_safe", "path":["curb_safe","door_safe"], "arc_m":9.0},
    {"kind":"verb",  "verb":"deliver", "args":{"container":"safe_1","items":{"scrip":120}}} ],
  "leg_idx": 2, "progress_m": 3120.0,
  "stuck": {"count": 0, "window_s": 0.0}, "fail_verb": "return_home",
  "cargo": {"scrip": 120}, "started_h": 812.4, "deadline_h": 815.0, "crisis": {} }
```

`progress_m` is per-leg and THE one truth across tiers. `cargo` is what physically drops at the fall
point (the satchel law). Leg kinds: `walk` (graph path or open-terrain point list, ≤400 m) · `drive`
(a road_graph route; pre-M1: `ProtoMotorist.plan_route()` output verbatim — the static fn at
motorist.gd:42) · `board`/`unboard` · `fly` (point list + clearance) · `verb` (terminal, §6).

## 9.2 THE WALK GRAPH v0 — the derivation algorithm (folds from rows at load; no chunks needed)

Node kinds: `door` (from `entrances[]`) · `curb` (spoke foot) · `ring` (v0 street stand-in) ·
`plaza` (the hub) · `junction` (arrives with street kits, M3b — same schema). Algorithm, per town row:

1. Read town center `c` + radius `r` (usmap town row).
2. **RING:** `N = clamp(ceil(2π·(0.55r)/60), 8, 24)` nodes on the circle `0.55r`; edge each neighbor.
3. **Per placement with `entrances[]`:** mint `door` at the entrance pos (+facing); project the door
   onto the nearest ring segment → insert a `curb` node at the foot (splice the ring edge); add
   `door↔curb`. A placement with jobs but no entrance is a FOLD-TIME ERROR (the Building Book law).
4. **Hub:** one `plaza` at `c`, edged to every 3rd ring node — planar, tiny, no crossing spaghetti.
5. **Costs** per F1; the graph is a flat `{nodes:{id:[x,z]}, edges:[[a,b,cost]]}` dict, A* over it.

**Worked example — Hollowpoint** (9 doored placements): ring N=12 + 9 door + 9 curb + 1 plaza =
**31 nodes, ~44 edges**; A* cost is microseconds; the whole graph is <4 KB in the save-adjacent cache
(rebuilt on fold, never saved). **Street-kit upgrade (M3b):** sidewalk polylines replace ring nodes
1:1 in schema; junction slab crossings become `junction` nodes; **the median law:** never emit an
edge across a `divided` road except inside junction gaps or riro ramps (the gap is a WALK crossing
too). Islands are a fold-time WARN + auto long-spoke to the nearest node; `nav_walk_sim` asserts
zero islands per town. NavigationServer stays the named escape hatch for downtown grids ONLY if
`nav_walk_sim` fails there.

## 9.3 PARKING (the DRIVE arrive, v1-honest)

Spot pick: destination placement's `parking[]` rows (Building Book) — first spot with no car within
3 m (a disc scan of `main.cars`); none/full → **THE CURB LAW:** stop at
`lane_offset(outermost) + 2.2 m` at the arrival arc, hazards on. No reverse-parking sim in v1: the
car eases to the point (arrive ≤8 m, <1.5 m/s), then rolls onto the spot at ≤0.6 m/s (reads as a
park at top-down, never a snap). The parked car PERSISTS in `main.cars` flagged
`journey_owned: jrn_id` — it is stealable and destroyable, and that is a feature: BOARD-on-resume
finds it by ref or enters the failure ladder (re-plan as WALK if ≤400 m, else `wait_for_rescue` +
a radio line; the theft is reported to the issuing director — a grudge hook). Cap: ≤2 journey cars
parked per town; the oldest despawns off-view.

## 9.4 THE DOOR FLOW (state machine)

`APPROACH` (walk to door node) → at 0.5 m:
- **v0 honesty:** door MESHES don't exist yet (the shipped house recipe is walls + front-fade — the
  opening IS the doorway). v0 `npc_open` = pass the threshold node + play the player's own door
  audio at it. The fiction holds at this camera. `ProtoDoor` (a real swinging node with
  `npc_open(actor)`) lands with the Building Book's interior materialization (M5/M7) — same call
  site, richer node.
- **Unlocked** → open (audio/anim), pass, auto-close 1.2 s.
- **World-locked** (night shop, sealed base) → try `entrances[1..]` → none: fail FORWARD — wait 20 s
  at the door with a grumble bark, then `fail_verb`.
- **PLAYER-locked** → **KNOCK**: knock audio + one bark + wait 30 s; player opens (E) → proceed;
  else fail forward (`return_home`) and the K-sheet says why ("she couldn't get in"). NPCs NEVER
  breach a player lock — the home-invasion read stays player-controlled (contract law, restated).
- **Inside:** the graph does NOT extend indoors in v1 — `enter()` walks the last ≤6 m straight-line
  with steering to the interior anchor/work spot (interiors are one room today). Door node capacity
  1: a second walker queues 2 s at the curb (an honest, free read).

## 9.5 THE STEERING PORT MAP (extract, don't invent — signatures + donor lines)

`nav/steering.gd` (static, stateless — callers own the little state dicts):
- `walk_step(body, target, p, delta)` — the dog accel law verbatim: `move_toward(v, dir·speed,
  22·delta)` + yaw `lerp_angle(…, 10·delta)` (dog.gd:586-589).
- `stuck_tick(st, body, target, delta) -> bool` — pinned (<0.6 m/s while >2 m out) 0.35 s →
  lateral impulse `side · speed · 0.8` + re-roll approach angle (dog.gd:569-575 verbatim); returns
  true when it fired (feeds the §5 ladder counter).
- `clear_low_obstacle(body, dir) -> String` — the dog's `_leap_blocked` knee-ray + head-clear test
  (dog.gd:578-585): animals return `"leap"` (the MotionForge leap row); humans return `"step_up"`
  when the top is <0.5 m (a small y-pop, no leap row); else `"blocked"`.
- `whiskers(body, dir) -> Vector3` — 2 knee rays ±0.5 rad × 2.2 m → steer blend (the autopilot idea
  at walking scale, track/autopilot.gd:105-141 is the donor).
- `fly_clearance(pos, dir) -> float` — relief sample ahead; the drone FSM keeps its own brain.
Driver: **ProtoAutopilot UNCHANGED** + two added signals (`route_done`, `stuck_escalated`) so the
director can re-plan — today it retries forever, silently.
- `route_point_at_arc(pts: PackedVector3Array, arc_m: float) -> Vector3` — **NEW, ~15 lines**: the
  cumulative-length polyline sampler (the generalization of traffic.gd's `_travel_arc` math,
  traffic.gd:149/:289). **ONE sampler, three consumers:** SHELL positioning, RECORD projection,
  the atlas arc draw. It is the position-of-record function — write it once, sim it once.

## 9.6 THE DIRECTOR (`nav/journeys.gd` — ProtoJourneys, child of main)

Data: `journeys: Array[Dictionary]` + `live: Dictionary` (id → node). Ticks: **LIVE** steering per
physics frame (BODY/SHELL only) · **tier arbitration** every 0.5 s · **RECORD** advance every
0.5 gh on the game clock, plus a 5 s poll for any record whose arc point is within 600 m.
Transitions: BODY↔SHELL at 120 m (SHELL exists only for DRIVE legs) · →RECORD at R_dehydrate 420 ·
→live at R_hydrate 300 **via ProtoJourneys' OWN never-in-view check** (camera + vision cone — no
population dependency). Hysteresis ≥80 m by construction (420−300), no flicker. **LIVE_CAP 6
arbitration:** over cap → demote lowest priority, farthest first; priority 0 (crisis) never demotes.
**Interception:** bumper/bullet on a SHELL → PROMOTE to a real car with cargo attached (the traffic
law); journey `state: "waiting"`; the issuing director owns the fiction from there. API:
`start(actor, goal) -> id` · `cancel(id, reason)` · `state(id)` · signals `journey_arrived(id)` /
`journey_failed(id, reason)` / `leg_changed(id)`. **The T-wait law:** any wait/sleep >1 gh first
forces all non-crisis journeys to RECORD (dehydrate-first — honest fast-forward, no LIVE teleports).

## 9.7 Formulas (vars · ranges · worked examples)

- **F1 walk edge cost:** `cost_s = len_m / (1.4 · η_walk) · surface_mult + W_danger · pts`
  [η_walk 0.6–1.0 (persona dawdle); surface 1.0 paved / 1.15 grass / 1.3 sand; pts per THE_INFECTED
  F-NAV. Ex: 60 m of grass at η 0.9 → 60/1.26 × 1.15 ≈ **54.8 s**.]
- **F2 drive leg cost:** the road_graph edge law (AMERICAN_ROAD owns it) + `PARK_OVERHEAD 12 s`.
- **F3 offscreen advance:** `progress_m += v_dom · η · weather_mult · dt_game_s` [v_dom: walk 1.4 ·
  drive `speed_limit × 0.8` · fly 12; weather_mult 1.0 in v1. Ex: a 6.2 km drive leg at limit
  27 m/s → v = 27·0.8·0.85 ≈ 18.4 m/s → 337 s ≈ **0.23 gh — done inside one RECORD tick**; the 5 s
  near-ring poll catches the player-adjacent boundary.]
- **F4 arrival:** 2D dist ≤ tol (§5 table) AND for DRIVE speed <1.5 m/s.
- **F5 tier pick:** RECORD if `d > 420` or capped out · SHELL if `120 < d ≤ 420` and leg is DRIVE ·
  else BODY. [Promote at 300 / demote at 420.]

## 9.8 Edge cases (explicit, per the house rule)

- **Actor killed mid-journey** (gator, herd, pirates) → `journey_failed("death")`; cargo drops at
  the fall point; the record narrates via `come_home`; the corpse law owns the body.
- **Journey car stolen/destroyed while parked** → BOARD fails → re-plan WALK (≤400 m) or
  `wait_for_rescue` + radio line; the director gets the theft report (grudge hook).
- **Player walls the doorway with a car** → stuck ladder: sidestep → alternate entrance → fail
  forward (wait + grumble). NEVER clips through, NEVER breaches.
- **Two walkers, one door** → capacity 1; the second queues 2 s at the curb.
- **Route crosses a Choir zone / danger cells** → F-NAV prices it; if it's the only route the
  journey PROCEEDS and the record law rolls the price — crisis outcomes belong to the FAMILY
  pipeline, never silent death.
- **Save mid-leg at SHELL tier** → the dict serializes; on load the actor rehydrates by tier rule
  (never-in-view); the parked/SHELL car re-materializes at `route_point_at_arc(progress_m)`.
- **Graph island at fold** → WARN + auto long-spoke; sims assert zero islands.
- **Deadline blown while RECORD** (storm mult, detours) → arrival late, `deadline_h` overrun flags
  the schedule slot; the K sheet says "late from church" — never a vanished person.
- **Net** → journeys are host-authoritative; clients see kind-tagged ghosts; interception damage is
  victim-authoritative per the co-op law.

## 9.9 The sim scripts (staging + asserts, cold-start)

All: `Godot_console --headless --path game res://proto3d/tests/<name>.tscn`, WATCHDOG timer,
`Engine.time_scale` restored, REAL inputs (staging positions = the one documented exception).
- **`nav_walk_sim`** — stage Hollowpoint rows (9 doored placements) + the wife at her door;
  `start(visit church 40 gm)`. Asserts: graph ≥28 nodes / 0 islands; A* <1 ms; passes the door
  node (2D tol 0.5); door audio fired; ∀frames displacement ≤ `v_max·delta·1.5`; arrival signal.
- **`nav_walk_block_sim`** — same + a crate wall dropped mid-path after leg start. Asserts: stuck
  fired ≥1; sidestep impulse observed; failed edge cost ×8 on re-plan; alternate arrival; zero
  clip-through; never motionless >5 s (THE STATUE ASSERT).
- **`nav_drive_sim`** — pre-M1 backend: `ProtoMotorist.plan_route` (motorist.gd:42); BOARD the
  owned sedan → drive → CURB LAW park (no spots staged) → UNBOARD → WALK → door. Asserts: leg
  order; park end speed <0.6; the car persists in `main.cars` with `journey_owned`; arrival verb.
- **`nav_offscreen_sim`** — 6 km collector run; force dehydrate by distance; advance 0.3 gh via the
  T-wait path. Asserts: `|route_point_at_arc(progress) − expected| < 1 m` (deterministic); save/
  load round-trip mid-leg; rematerialize only while never-in-view (staged look-away); the deliver
  verb executed in record form (scrip in the safe).
- **`nav_intercept_sim`** — SHELL courier on a staged straight; player bumper at the arc. Asserts:
  PROMOTE minted a real car; cargo row intact; journey `waiting`; satchel drops on kill.
- **`nav_fly_sim`** — drone journey over a staged ridge. Asserts: clearance ≥ knob every sample;
  no relief clip; battery/return law preserved.

*§9 changes no ruling above — it is the same contract at build resolution. First hot file:
`nav/steering.gd` (pure extraction, sim-able the same day); `route_point_at_arc` second; the
director third; the v0 graph last (it needs only rows that already exist).*
