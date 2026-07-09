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
| R1 | Rail DATA: `rails` rows in usmap data (kind "rail" road-row idiom) — THE SEABOARD LINE polyline Miami↔Meridian paralleling I-95 (+60 m tail spurs both ends so the consist never stacks) + 4 stations (MIAMI CENTRAL · JACKSONVILLE JUNCTION · RICHMOND SIDING · MERIDIAN DEPOT 103 m from town) | R | **PROVEN** (suite stamp pending) | `rail_sim` §data green (24/0 total) |
| R2 | Rail RENDER: right-of-way ribbon + blue-gray ballast + bright twin steel + MultiMesh ties per chunk. ONLY rail in world_stream. | R | **PROVEN** (suite stamp pending) | `rail_sim` §render green; judge round 2: line read = B+ |
| R3 | `train_station` profile (transit slate) + 4 placements + name signs + PLATFORM slabs + TrainStop timetable posts (diegetic, MERIDIAN_LIVE law) | R | **PROVEN** (suite stamp pending) | `rail_sim` §stations green; the roof stays open-top per the house shell law |
| R4 | `ProtoTrain`: kinematic rail-follower (loco+cab+spine + 2 banded coaches) — dist-on-spline, can never derail/void; THE CROSSING LAW (pre-move next-station read) | R | **PROVEN** (suite stamp pending) | `rail_sim` §ride-the-line: 4/4 stations, turnaround, zero void/derail |
| R5 | THE RIDE: E boards at the post (6 scrip fare) · T skips (EVENT-driven; polled latch ate edges) + clock pays real route time (60× law: 13.8 h Meridian↔Miami) · E exits onto the PLATFORM | R | **PROVEN** (suite stamp pending) | `ride_sim` 11/0 |
| R6 | Radio: SEABOARD DISPATCH bulletin reads the LIVE train | R | **PROVEN** (suite stamp pending) | `rail_sim` R6 check green |
| W1 | WATER DATA AUTHORITY: `water_depth_at(x,z)` — grid-truth; shallow ford ring, deep open sea. (Player swim keeps its stride-probe of the same grid — finer than cells.) | W | **PROVEN** (suite stamp pending) | `water_hard_sim` §data green |
| W2 | OCEAN LOOK: per-chunk water sheets + the researched shader (two-tone flat + depth foam + bob; reads top-down); Miami waterfront visible from the depot | W | OPEN | acceptance shots (both termini) graded by fresh-context judge |
| W3 | HARD WATER LAW: deep water stalls engines + floods them toward dead + no crank · player/dog swim (shipped) · drone overflies · fords via traction matrix | W | **PROVEN** (suite stamp pending) | `water_hard_sim` 9/0 |
| W4 | THE MAP PAINTS WATER + THE SEABOARD ON THE ATLAS (line + station ticks) | W | **PROVEN** (visual in next map shot) | code in map draw; verify in W2's acceptance pass |
| W5 | READABILITY LAW: barrier visible ≥100 m out (foam edge + sheet contrast); a marked crossing (bridge deck or the rail line) within reasonable reach — water redirects, never dead-ends | W | OPEN | audit row: coast approach shot + crossing-distance check on the Florida corridor |
| W6 | Everglades soft-barrier (deep-mud crawl) in ONE test sector only — full relief/mountains stay with AMERICAN_ROAD M8 | W | OPEN | traction row active in the sector; sim asserts crawl speed |
| L1 | THE LOOK walkthrough as a sim: spawn Meridian → walk to DEPOT → board → T-skip → step onto MIAMI CENTRAL platform → see ocean → drive car into deep water: stalls, player swims out | R+W | OPEN | `seaboard_walkthrough_sim` green |
| L2 | Acceptance shots to `docs/acceptance/` (depot, ride, Miami waterfront, foam edge, map water) + fresh-context judge grades | R+W | OPEN | shots exist + judge report ≥ acceptable on every visual row |

| J1 | Judge note (round 2): track visibly UNDER the parked consist at the depot (spur short + shadow-side camera hid it) | R | OPEN | reshoot from the gameplay camera; extend depot ballast read |
| J2 | Judge note: line's FAR read decays to a thread — LOD widening/brightening at distance | R | OPEN | far-read acceptance shot |
| J3 | Pre-existing warts logged: "freed instance 'is'" spam in proto3d boot · the giant vertical light band near the safehouse (home beacon?) in depot shots | — | OPEN | identify + fix or explain in an audit pass |

**Audit trail:** audits at iterations 3, 6, 9… against the goal text; two CONSECUTIVE clean audits
(zero new rows) + full suite green + merged to main = STOP CONDITION.
