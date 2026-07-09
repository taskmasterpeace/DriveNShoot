# NAVIGATION — the journey law (walk / drive / fly, one contract)

**Status:** GREENLIT design spec (owner directive 2026-07-09: *"improve the navigation of different AIs —
driving, walking, flying — a system that allows our people to do what they need to do"*).
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
