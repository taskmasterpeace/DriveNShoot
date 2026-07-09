# LOOP LEDGER — THE SEABOARD LINE + THE WATER'S EDGE (goal set 2026-07-09)

**The machine:** BUILD the topmost OPEN row → PROVE (its sim + full suite; red blocks DONE) →
LOOK (the walkthrough) → acceptance shots + fresh-context judge on visual rows → AUDIT every 3rd
iteration against the goal text (gaps become new OPEN rows) → LOG to `LOOP_LOG.md` → commit,
merge to main when green (PLAY.BAT TRUTH).

**Laws in force:** one milestone inside `world_stream.gd` at a time — THIS loop touches ONLY rail
rendering + water sheets there; road/junction geometry belongs to THE_AMERICAN_ROAD (conflict →
STOP and ask). Techniques/shader code MIT/CC0 only, cited (see `WATER_RESEARCH.md`). Never delete,
weaken, or skip a sim to get green. Backstops: same sim red ×3 → STOP+ask · 30 iterations →
STOP+report · world_stream conflict → STOP+ask.

## The rows

| # | Row | Block | Status | Proof |
|---|-----|-------|--------|-------|
| 0 | WATER RESEARCH one-pass → `docs/design/WATER_RESEARCH.md` (licenses cited) | W | **DONE** (iter 0) | doc exists; CC0+MIT cited |
| R1 | Rail DATA: `rails` rows in usmap data (kind "rail" road-row idiom) — THE SEABOARD LINE polyline Miami↔Meridian paralleling I-95 + stations list (MIAMI CENTRAL · 1-2 corridor stops · MERIDIAN DEPOT walkable from town near EXIT 9) | R | OPEN | `rail_sim` §data: line continuity, ≥3 stations, stations ON the line, depot within walk of Meridian |
| R2 | Rail RENDER: world_stream draws rail per chunk — twin steel rails + ties + ballast (dirt twin-rut pipeline re-skinned). ONLY rail in world_stream. | R | OPEN | `rail_sim` §render: streamed chunk contains rail geometry on the line |
| R3 | `train_station` structure row (platform + roof + name sign + schedule board w/ diegetic prompt, MERIDIAN_LIVE law) placed at every station | R | OPEN | `rail_sim` §stations: station materializes, sign readable, board prompt present |
| R4 | `ProtoTrain`: kinematic rail-follower (locomotive + 2 cars, box-built) — position rides the polyline, can never derail; CCD + floor law, can never void | R | OPEN | `rail_sim` §ride-the-line: full Miami↔Meridian headless, zero void/derail |
| R5 | THE RIDE: E on platform boards (seat-anchor law, scrip fare) · T aboard skips to next station + advances daynight by real route time (60× law) · E exits ground-settled on the PLATFORM (~1.5 m, the car-exit lesson) | R | OPEN | `ride_sim`: board Miami → arrive Meridian Depot, clock advanced correctly, exit lands on platform |
| R6 | Radio bulletin row: departures/arrivals flavor | R | OPEN | radio row present + surfaces in scan |
| W1 | WATER DATA AUTHORITY: `water_depth_at(x,z)` (ocean along Florida coasts in usmap data) — one law every consumer reads | W | OPEN | `water_hard_sim` §data: ocean cells report depth, inland reports 0 |
| W2 | OCEAN LOOK: per-chunk water sheets + the researched shader (two-tone flat + depth foam + bob; reads top-down); Miami waterfront visible from the depot | W | OPEN | acceptance shots (both termini) graded by fresh-context judge |
| W3 | HARD WATER LAW: deep water stalls engines (sunk car dies) · player/dog swim (exists) · drone overflies · shallow fords via traction matrix | W | OPEN | `water_hard_sim`: car stalls+dies in deep, player swims out, drone unaffected |
| W4 | THE MAP PAINTS WATER: map view renders the water layer so routes read before driving | W | OPEN | map draw call covers water cells (sim-checkable via map data hook) + acceptance shot |
| W5 | READABILITY LAW: barrier visible ≥100 m out (foam edge + sheet contrast); a marked crossing (bridge deck or the rail line) within reasonable reach — water redirects, never dead-ends | W | OPEN | audit row: coast approach shot + crossing-distance check on the Florida corridor |
| W6 | Everglades soft-barrier (deep-mud crawl) in ONE test sector only — full relief/mountains stay with AMERICAN_ROAD M8 | W | OPEN | traction row active in the sector; sim asserts crawl speed |
| L1 | THE LOOK walkthrough as a sim: spawn Meridian → walk to DEPOT → board → T-skip → step onto MIAMI CENTRAL platform → see ocean → drive car into deep water: stalls, player swims out | R+W | OPEN | `seaboard_walkthrough_sim` green |
| L2 | Acceptance shots to `docs/acceptance/` (depot, ride, Miami waterfront, foam edge, map water) + fresh-context judge grades | R+W | OPEN | shots exist + judge report ≥ acceptable on every visual row |

**Audit trail:** audits at iterations 3, 6, 9… against the goal text; two CONSECUTIVE clean audits
(zero new rows) + full suite green + merged to main = STOP CONDITION.
