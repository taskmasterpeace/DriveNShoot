# LOOP LOG — THE SEABOARD LINE + THE WATER'S EDGE

## Iteration 0 — 2026-07-09 — RESEARCH FIRST (the one pass, before any code)
- **Built:** `docs/design/WATER_RESEARCH.md` — survey + chosen approach.
- **Licenses locked:** technique donor = Toon Style 3D Water (Megalithium, **CC0**, godotshaders);
  foam-math donor = Foam Edge Water (Antz, **MIT**, godotshaders). StayAtHomeDev series surveyed
  (site ECONNREFUSED during pass; noted from index). Boujie/OceanFFT rejected as overkill.
- **Key finding:** wade/swim/dog-swim/traction already exist; what's missing is ONE water data
  authority (`water_depth_at`) + ocean look + car stall + map paint. Build one law, five readers.
- **Ledger:** created with R1–R6, W1–W6, L1–L2 OPEN.
- **Proof:** docs exist; no code touched (law honored).
- **Next:** R1 rail data rows.

## Iteration 1 — 2026-07-09 — R1+R2+R3 built and individually green; R4/R5 code staged
- **R1 DATA:** `rails[]` in usmap.json (SEABOARD, 7 pts, ~23.1 km, 4 stations) + ProtoUSMap fold.
  `rail_sim` §data 12/0. Committed 07ee4b2 with WATER_RESEARCH + the ledger + tools/run_suite.sh.
- **R2 RENDER:** `rails_near` + `_build_rail_stretch` (bed + twin steel + MultiMesh ties — the
  twin-rut pipeline re-skinned; rail ONLY in world_stream, the one-milestone law held).
  `rail_sim` §render → 15/0 first run.
- **R3 STATIONS:** `train_station` profile row (40th in the catalog) + 4 placements; the depot
  shell materializes with its name sign. `rail_sim` §stations → 17/0.
- **R4/R5 STAGED (unwired):** `train.gd` (ProtoTrain kinematic rail-follower + TrainStop diegetic
  timetable post) + `daynight.advance_hours` + `ride_sim` written — the proto3d WIRE waits for the
  running full suite to land (the import gotcha: a new class_name referenced by proto3d mid-suite
  would false-red every later sim).
- **Suite:** full run in flight (background); its verdict stamps R1–R3 DONE.
- **Discipline note:** edits mid-suite were sequenced additive-first (fold before caller) so any
  sim booting mid-window parses a consistent tree.

## Iteration 2 — 2026-07-09 — THE RIDE + hard water, LOOK round 1→2, judge SHIP-WITH-NOTES
- **Suite run 1 declared MONGREL and killed:** a rig_v2 zombie pair (relative-path orphan) starved
  it 30+ min AND my W1 loop (`for dx in [-1,0,1]` untyped → parse error) poisoned usmap.gd for a
  ~4-min window mid-run. Fixes: typed loops (`for dx: int in`), per-sim `timeout -k 10 180` in
  run_suite.sh, zombie killed by PID.
- **R4 wired + two real bugs the sims caught:** (1) train spawn sat in _build_environment which
  runs BEFORE the usmap assignment (the waypoint-ring lesson again — order beats intent in _ready);
  (2) THE CROSSING LAW: arrival was checked with a post-move next_station read, so every crossed
  mark got skipped at ANY tick rate. Fixed pre-move.
- **R5's eaten edge:** the polled T-latch in _physics raced the input pump (ride_sim: skip 2 moved
  0 m). The skip is now EVENT-driven in _unhandled_input — one press, one leg. ride_sim 11/0:
  board (fare 6), 3 skips Meridian→Miami, clock +13.8 h (60× law), exit onto the platform 3.2 m.
- **W1+W3+W4:** water_depth_at authority (dry/ford/deep off the real grid — the Atlantic starts
  2 km east of Miami) · cars DROWN + flood + no-crank in deep water while the player swims and the
  drone overflies (water_hard_sim 9/0) · the atlas paints the sea as INK + the SEABOARD line with
  station ticks.
- **THE LOOK (rounds 1→2):** shots exposed what sims can't — the stacked consist at mark 0 (fixed:
  60 m tail spurs), bare-dirt boarding (fixed: platform slabs), invisible track (fixed: right-of-way
  ribbon + contrast ballast + bright steel), container-loco (fixed: cab + roof spine). Fresh judge:
  round 1 BLOCK → round 2 **SHIP-WITH-NOTES** (line B+, train B−); notes banked as rows J1–J3.
- **Next:** clean FULL suite (the DONE stamp) → merge to main → W2 ocean shader + L1 walkthrough.

## Iteration 3 — 2026-07-09 — the two-runner incident, THE WATERFRONT TERMINUS, W2 lands
- **THE TWO-RUNNER INCIDENT (process wound, paid + patched):** killing the mongrel suite's
  GODOT processes left its BASH LOOP alive — two suites interleaved for ~40 min (bike vs m1
  ordering exposed it). And `timeout` kills only the console wrapper on Windows: every timed-out
  sim leaked an ENGINE orphan (m1_sim ran 14 min). Fixes: TaskStop + kill the runner PIDs, and
  run_suite.sh now captures timeout's real rc (not tail's) and REAPS engine orphans by scene name.
- **THE WATERFRONT TERMINUS (stop condition: "ocean visible from the terminus"):** Miami Central
  sat 2 km from the first ocean cell — outside the 384 m stream ring, the ocean could never be
  visible from the platform. Redesign: the line now BENDS at the old city pin and terminates ON
  the shore at (-160, 20510) — open water ~160 m off the platform. rail_sim's "serves Miami" check
  updated to the waterfront reading (≤2200 m of the town pin + open water inside the stream ring)
  — a documented redesign, not a loosened pass.
- **W2 LANDS:** `water.gdshader` (CC0 structure + MIT foam math, cited) + per-chunk sea-surface
  sheets at +0.32 over the −0.23 wet floor (0.55 m of visible water: hoods sink, boots wade) +
  painted EDGE-FOAM strips on every water↔land chunk edge — the shoreline signal as deterministic
  geometry a headless sim asserts (water_hard_sim §look).
- **THE RETURN LEG:** ride_sim now boards at MIAMI → arrives MERIDIAN DEPOT (the stop condition's
  literal direction) with the clock paying both ways.
- **"Both termini" interpretation (owner can veto):** Meridian's terminus is INLAND — no ocean
  exists there to see. The honest reading satisfied here: ocean visible from the COASTAL terminus
  (Miami waterfront, in-world) + the MAP paints the sea and the line everywhere (any terminus,
  one M press). Logged, not hidden.
