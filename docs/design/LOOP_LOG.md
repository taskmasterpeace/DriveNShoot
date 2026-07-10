# LOOP LOG — THE LIVING WORLD LOOP (append-only journal)

Format per entry: **iter # · row shipped · sims added · suite total · gaps found**

---

## Iteration 0 — SETUP (2026-07-09)
- Created `docs/design/LOOP_LEDGER.md`, seeded by **direct verification** (not memory) of the three source buckets.
- Created this log.
- **Verified findings:**
  - CREATURES: `ecology.gd` is the float director only — *no* eco→world realization reader; the 5 creatures are docs-only. Genuinely OPEN (6 rows: C0–C5).
  - INTERIORS: no `ProtoInteriorSkin`; `house.gd` still bespoke. Genuinely OPEN (3 rows: I0–I2).
  - PLAYTEST_FIX_SPEC: 15/18 already shipped; remaining rows are owner-gated or superseded (P14/P16/P17/P18/clarify).
  - `world_walkthrough_sim` does not exist yet (W0). Its Alligator-Alley creature gate is blocked on C0–C5.
  - Suite baseline: ~186 `_sim.tscn` files present.
- **Ledger totals at setup:** 10 OPEN · 1 PARTIAL · 4 DEFERRED · 1 DONE.
- **AWAITING OWNER:** scope confirmation before the autonomous build-grind begins (see session — "is this dien??" reality-check answered with this ledger).

## Iteration 1 — THE CREATURES + THE BRIDGE (2026-07-09)
- **Rows shipped:** C0 (eco→world bridge: wildlife_desired law + hourly reconcile + cold-start seeds + budget-capped realization), C1–C5 (all five creatures: ProtoCreature rows + ProtoKnifeback apex w/ 6-state nest machine), C6 (0.11 BODY LAW: ProtoCorpse rig adoption + whole-animal pose_dead), W0 (world_walkthrough_sim, 6 player-path gates).
- **Sims added:** `creatures_sim` (29 checks), `world_walkthrough_sim` (16 checks). Suite runner adopted onto main (`tools/run_suite.sh`).
- **Suite total:** 188 sims → 161 green + 27 red → **baseline-split: 26 pre-existing on pristine HEAD + 1 contention flake (car_sim). Zero regressions from loop work.** Inherited reds ledgered as E1–E26 (audit came early).
- **LOOK:** 7 acceptance renders → fresh judge round 1: 4/7 (fails: rat=re-tinted-jackal, vulture=ground plank, lineup=head-on hid the ridge) → fixed (rig_squash_y/stretch_z rows, birdify wings, profile+airborne staging) → **round 2: OVERALL PASS.** Renders in docs/acceptance/iter1/.
- **Real bugs the loop caught:** knifeback sticky-BREEDING state (sim), quadruped floating-head death pose (render), vulture-was-a-dog (judge), boot car adopted by TestGrounds facing the pen wall (walkthrough gate — explains old walkthrough_sim's inherited red), buffered-output-hides-parse-error + untyped-loop-var `:=` inference (tooling gotchas re-paid and logged).
- **Gaps found:** catalog has 39 structure rows vs spec's 42 (noted on I2).

## Iteration 2 — THE INTERIOR SKIN + THE FURNISHER (2026-07-09)
- **Rows shipped:** I0 (`interior_skin.gd` — roof-hide/front-fade/slab-fade generalized from house.gd; `interior_template` data values "walkin"/"walkin_roofed"; roof EARNED per AR 0.9), I1 (`furnisher.gd` — door-safe grid lifted from house.gd; AR 0.11 LOD law: wake ≤40 m, free >55 m, awake cap; per-instance position-keyed loot uids; 4 new building_types rows).
- **Sims added:** `interior_skin_sim` (15), `furnisher_lod_sim` (10).
- **Targeted regressions green:** structure_data 36/0, placement_wire 6/0, town 16/0, world_walkthrough 16/0.
- **Gaps found:** node names are session-unique — determinism asserts must key loot uids, not names (sim measurement fixed, not weakened).

## Iteration 3 — THE SILHOUETTE PASS (2026-07-09)
- **Row shipped:** I2 — every structure grows its category read-feature (canopy/awning/porch+chimney/lightbar/cross/steeple/flagpole/marquee/stack/boom/plinth/mast/hazard/berm/silo), all visual-only boxes (zero new colliders); floors build wall height (courthouse 6 m); NEW schema field `silhouette` = per-row override.
- **Data-truth catch:** the catalog's categories are CROSSED in places (church_small=civic_faction, school_small=civic, clone_wing=medical, still_shack=restricted) — the mapper agent's summary was wrong in 5 places; row overrides now carry iconic truth (steeple on the church, flag on the school) regardless of category.
- **Sims added:** `silhouette_sim` (21 — features per rep, iconic-truth overrides, floors height, 39/39 catalog materializes). Stale builder header fixed.
- **LOOK:** 4 contact sheets → judge round 1 FAIL (sheet-3 composition: a giant footprint swallowed neighbors; chimney read as interior post; boom arm invisible; awning faint) → fixed (footprint-aware framing + giant gets own sheet + 3 feature tweaks) → **round 2: PASS 4/4 sheets.** Renders in docs/acceptance/iter3/.
- **Regression sweep:** silhouette 21/0 · interior_skin 15/0 · furnisher_lod 10/0 · structure_data 36/0 · placement_wire 6/0 · town 16/0 · world_walkthrough 16/0.

## Iteration 4 — AUDIT 1 + THE E-BURN-DOWN, wave 1 (2026-07-09)
- **AUDIT (every-3rd-iteration law): added 14 rows (F1–F14).** Verdict: the ecosystem's P1 plumbing shipped, parts of its P1 CONTRACT didn't (warning contract, human-gate, one-authored-nest, noise chain, bird language, offline, legibility). Interiors "substantially conformant". All 3 playtest spot-checks verified in code.
- **Audit quick-fixes shipped same iteration (4):** F8 protected cells bank no wildlife on tick · F10 pre-eco saves heal on touch · F12 BODY LAW on all four remaining death paths (howler/lurker/companion/infected pass their rigs; corpse adopter learned the biped's private _pose_dead) · F5a swamp+road = road_shoulder (the Alley banks rats now).
- **E-rows closed (8):** E4 binocular 6/0 · E6 cone 8/0 · E7 dark 17/0 · E11 items 23/0 (3 price rows — incl. my own iter-1 `hide` debt) · E24 vision_reach 8/0 · E25 vision 6/0 · E26 walkthrough 15/0 · E27 car (flake, already closed). E12 life PARTIAL (night-floor realigned 18/19; horn-heels = real bug). Realignments carry the shipped-law citations in-file (retirement = playtest #15; night floor = daynight.gd:69 "tense, not blind").
- **Deferred to the owner's LIVE radio/TV arc (4):** E16 noise, E18 radio_positional, E22 station, E23 tv — his lane moved under them mid-loop; realigning now would fight his WIP.
- **Suite (iter-2/3 background run): 167/191** — new names all contention flakes (aim_sim 15/0 standalone); zero regressions from loop work.
- **creatures_sim grew to 31 checks** (protected-law + save-heal regressions).

## Iteration 5 — E-burn-down wave 2 (2026-07-09): 10 more rows closed
- **Closed:** E1 audio 8/0 (ignition law: dead motor silent → crank → hum → pitch, I-95 staging) · E2 bike_rider 10/0 (knee-sign law) · E3 bike 8/0 (swerve ends spun 180°; brake-is-reverse → stop = throttle against the roll) · E5 char 14/0 (RIG V2 build axis) · E8 drone 7/0 (one-press piloted truth + abort_to_autonomy for the autonomous legs — the pilot owns battery, drone.gd:194) · E15 nav 8/0 (ring gained TEST GROUNDS; walk to OFF) · E17 puppet 20/0 (grip-IK settle recipe) · E19 stage3 12/0 (12-skill tree mirror + I-95 drive-xp) · E20 stage4 10/0 (corpse sweep → 0.11 group) · E21 stage7 11/0 (Sam's duel staged clear of TestGrounds clutter).
- **The recurring villain:** ⚒ TEST GROUNDS — four sims (audio pitch, stage3 drive-xp, stage7 line-of-fire, old walkthrough) failed on the fairground's pen walls/clutter around the boot spot; the I-95 staging pattern (6,0.8,380 basis-identity) is now the house move.
- **Remaining OPEN E (4):** E9 frontier (backroads lay 0), E10 furnisher (desk E grabs a neighbor), E13 los (fade ray blocked post-open while the occl fan spills — panel geometry cleared, blocker unnamed; probes in scratchpad), E14 m1 (nil cascade — read ediag log). Partials: E12 (horn-heels), F5 (nest-in-wreck).
