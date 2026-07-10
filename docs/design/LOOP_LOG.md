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
