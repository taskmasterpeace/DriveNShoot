# LOOP LEDGER — THE LIVING WORLD LOOP

**Created:** 2026-07-09 (iteration 1 setup) · **Updated:** 2026-07-09 (iteration 1 shipped)
**What this is:** one row per work item for the Living World Loop. Status is checked by reading a file or running a sim — never by judgment.
**Legend:** `OPEN` · `DONE` (proof cited) · `PARTIAL` · `DEFERRED(reason)`

---

## A. CREATURES — the living-world heart (LWE Phase 1)

| id | item | status | proof |
|----|------|--------|-------|
| C0 | **Eco→world realization BRIDGE** — `ProtoEcology.wildlife_desired` (floats→counts law) + hourly `_reconcile_wildlife` + cold-start seeds in `population._new_cell` + wildlife groups through `materialize_budget` + `world_stream._spawn_pop_actor` wildlife cases. Kills write back via `eco_kill`; `ProtoCorpse` deposits heat. | DONE | `creatures_sim` 29/0 (ledger cold-start, reconcile both directions, realization, budget cap, eco write-back) |
| C1 | **Mossback** — swamp grazer, herds, flees noise/hunters, meat+hide on the body | DONE | `creatures_sim` 29/0 + judge PASS (lineup, solo, body-law) |
| C2 | **Wire Rat** — rodent, human-zone cells (rats live where humans lived), low-lozenge silhouette (rig_squash_y row) | DONE | `creatures_sim` 29/0 + judge PASS ("reads rodent, not dog") |
| C3 | **Road Vulture** — read-layer bird: circles corpse_heat, flushes on approach, wings (birdify), airborne | DONE | `creatures_sim` 29/0 + judge PASS ("soaring bird") |
| C4 | **Razor Dog / Glass Jackal** — pack predator, dusk-biased hunt, targets player/dogs/grazers (the food chain on camera) | DONE | `creatures_sim` 29/0 + judge PASS |
| C5 | **Knifeback** — apex, 6-state NEST machine (FED/HUNGRY/STARVING/BREEDING/WOUNDED/EXPANDING — beats transient, sim caught the sticky-BREEDING bug), STARVING widens the ground, warning tell before first human strike, spine-blade silhouette | DONE | `creatures_sim` 29/0 (machine walked) + judge PASS ("unmistakable apex") |
| C6 | **0.11 BODY LAW substrate** — `ProtoCorpse.create(..., rig)` adopts the killed actor's rig posed dead (box lump = fallback only); quadruped `pose_dead` now drops the WHOLE animal (head/tail/legs followed the chest — the floating-head read is fixed), `unpose_dead` restores exactly (dog revive safe) | DONE | `creatures_sim` (corpse-is-rig check) + `dog_sim` 12/0, `quad_sim` 11/0 + judge PASS (body-law shot) |

## B. INTERIORS — every building has an inside (BUILDING_BOOK)

| id | item | status | proof |
|----|------|--------|-------|
| I0 | **`ProtoInteriorSkin`** — house.gd's three laws generalized (`interior_skin.gd`); `interior_template` rows: "walkin" (open-top honest default) / "walkin_roofed" (EARNED roof: motel_strip, police_station); wave-1 all wired | DONE | `interior_skin_sim` 15/0 |
| I1 | **Footprint furnisher** — `furnisher.gd` (grid lifted from house.gd, door-safe, faces the room); LOD law: wakes ≤40 m / frees >55 m / awake cap; per-instance position-keyed loot uids; wave-1 building_types rows added | DONE | `furnisher_lod_sim` 10/0 |
| I2 | **Silhouette pass** — every structure grows its read-feature: 15 category defaults + per-row `silhouette` override (schema field; church=steeple, school=flagpole — data categories were crossed), floors read as wall height, plinth pulled outside its slab | DONE | `silhouette_sim` 21/0 + judge PASS (4/4 sheets, iter3 renders) |

## C. PLAYTEST_FIX_SPEC — still-open rows

| id | item | status | proof |
|----|------|--------|-------|
| P14 | Radar / minimap ("radiant") | DEFERRED(spec #14 NEEDS OWNER'S WORD) | — |
| P16 | Roads disconnect (M2 decks) | DEFERRED(owned by THE_AMERICAN_ROAD M-ladder) | — |
| P17 | Rideable train | DONE(SEABOARD LINE shipped `ProtoTrain`) | train arc sims |
| P18 | Car dashboard UI | PARTIAL(gauge cluster Phase 1 shipped 8600601; owner's lane) | `gauge_hud_sim` in-suite PASS |
| P-clarify-1 | "The dog comes all the way down" | DEFERRED(needs owner clarification) | — |

## D. PROOF HARNESS

| id | item | status | proof |
|----|------|--------|-------|
| W0 | **`world_walkthrough_sim`** — six player-path gates in one real-scene boot: 500 m interstate drive (real held input) → brake+exit → REAL Meridian sign reads its words → real streamed cache opens (loot varies, arms) → drone one-press deploy + recall lands → Alligator Alley ≥3 living creatures on screen | DONE | `world_walkthrough_sim` 16/0 (also PASS in-suite) |

## E. INHERITED REDS (found by iteration 1's suite gate; ALL verified red on pristine HEAD baseline — none caused by loop work)

> Baseline split 2026-07-09: 27 suite reds → 26 baseline-red (pre-existing) + 1 load-flake (`car_sim`: green standalone + green baseline; failed only under 3-instance CPU contention).
> Several are STALE SIMS vs owner-shipped behavior changes (e.g. binocular removal #15, TestGrounds adopting the boot car) — realigning those sims to shipped truth is maintenance, not weakening.

| id | sim | status | note |
|----|-----|--------|------|
| E1 | audio_sim | DONE | realigned to the IGNITION LAW (dead motor silent → crank → hum → pitch) + I-95 staging — 8/0 |
| E2 | bike_rider_sim | DONE | sign-law realign (hips fold positive, knees flex negative) — 10/0 |
| E3 | bike_sim | DONE | root: swerve ends spun 180° (forward_speed sign flip) + brake-is-reverse scheme — stop choreography now throttles against the roll — 8/0 |
| E4 | binocular_sim | DONE | realigned to the retirement (bind row cleared; B=recall) — 6/0 |
| E5 | char_sim | DONE | realigned to RIG V2 build axis (raider slab = build 1.6) — 14/0 |
| E6 | cone_sim | DONE | binocular phase asserts no-change — 8/0 |
| E7 | dark_sim | DONE | night-floor law (tense-not-blind) + glass retirement — 17/0 |
| E8 | drone_sim | DONE | one-press piloted truth asserted, then abort_to_autonomy for the patrol/battery legs (pilot owns battery, drone.gd:194) — 7/0 |
| E9 | frontier_sim | DONE | "backroad" kind retired by the road-rows normalization — town-knitters are the 46 "county" rows (all 2-lane undivided; 5 keep the winding character) — 15/0 |
| E10 | furnisher_sim | DONE | THE LIBRARY's bookshelf owns the desk's wall stretch ("read the MANUALS" wins the E-scan) — chain retargeted to the clear-air kitchen cabinet — 11/0 |
| E11 | items_sim | DONE | 3 missing price rows added (hide/drone_remote/antibiotics) — 23/0 |
| E12 | life_sim | PARTIAL | night-floor realigned (18/19) — HORN-heels check = real-bug remainder |
| E13 | los_sim | DONE | not the ray at all — the perception cone follows the AIM, not the body snap (headless left the aim astray); aim_override = NORTH — 9/0 |
| E14 | m1_sim | DONE | three stales realigned: binocular retirement, sedan moved to TestGrounds (stage by cars[1] position), entry-ladder smash prompt, void-net corridor tape — 22/0 |
| E15 | nav_sim | DONE | ring gained ⚒ TEST GROUNDS stop — wrap check walks the ring to OFF — 8/0 |
| E16 | noise_sim | DEFERRED(owner's live radio arc — loud-radio draw API moving) | — |
| E17 | puppet_sim | DONE | rung-2 realigned to RIG V2 grip IK (grips + animate settle; measure the free HAND) — 20/0 |
| E18 | radio_positional_sim | DEFERRED(owner's live radio arc) | — |
| E19 | stage3_sim | DONE | skills mirror the grown tree (12: +martial_arts, piloting); drive-xp leg staged active_car on I-95 + ignition — 12/0 |
| E20 | stage4_sim | DONE | corpse sweep realigned to 0.11 (bodies are ProtoCorpse group, not chest lumps) — 10/0 |
| E21 | stage7_sim | DONE | duel staged on open highway (TestGrounds clutter ate Sam's line of fire) — 11/0 |
| E22 | station_sim | DEFERRED(owner's live radio arc) | — |
| E23 | tv_sim | DEFERRED(owner's live TV arc) | — |
| E24 | vision_reach_sim | DONE | retirement section (bind-row cleared truth) — 8/0 |
| E25 | vision_sim | DONE | binocular phase asserts cone stays wide — 6/0 |
| E26 | walkthrough_sim (old) | DONE | realigned: motor-pool fleet ≥15 + I-95 staged drive — 15/0 |
| E27 | car_sim | DONE(flake) | green standalone + baseline; contention-only failure |


## F. AUDIT 1 ROWS (iteration-4 adversarial audit vs LWE/BUILDING_BOOK/PLAYTEST specs — added 14)

> The ecosystem's P1 PLUMBING shipped; parts of its P1 CONTRACT didn't. Quick-fix rows landed same iteration; contract rows queue next.

| id | item | status | proof |
|----|------|--------|-------|
| F1 | Warning contract: warn_count rides the CELL (survives the animal); 3 escalating tells; the unwarned strike DEFERS into the next tell | DONE | `creatures_sim` 36/0 (defer + armed checks) |
| F2 | Human-gate: FED never hunts humans; dogs enter the menu at HUNGRY; humans only STARVING+warned — state gates WHO, not just how far | DONE | `creatures_sim` 36/0 (FED-gate check) |
| F3 | Apex rarity: bar raised to pred ≥ 0.75 (cold swamps no longer qualify); THE ONE AUTHORED NEST at the Alley (−8000, 6000) runs hot from first touch | DONE | `creatures_sim` 36/0 (nest-banks-1 + generic-swamp-banks-0) |
| F4 | Noise chain: emit_noise deposits human_noise on the cell (decays 0.12/gh); the apex's claimed ground scales ×(1+0.6·noise) — quiet routes matter | DONE | `creatures_sim` 36/0 (racket check) |
| F5 | Rats emerge from wrecks (nest-in-object); swamp road_shoulder zone SHIPPED (the Alley banks rodents now) | PARTIAL | zone fix in `creatures_sim` 31/0 |
| F6 | Bait verb (dropped meat deposits corpse-heat — pull the swamp off your route) + the backfire (rodent desire ×(2−pred): rats inherit the earth) | DONE | `creatures_sim` 38/0 |
| F7 | Bird language: the vulture is a MARKER (shots scatter, never fell/farmed); formations SPEAK (fresh kill = low+tight, old = high+lazy, gunfire = scatter, NO-BIRDS over an apex sky); the 6 s re-materialize beat gathers banked birds over watched kills. + the ANCHOR BUG: creatures/knifebacks claimed home at the chunk-add origin and drifted off — lazily claimed on frame 1 now | DONE | `creatures_sim` 46/0 |
| F8 | Protected cells bank NO wildlife on the hourly tick (doorstep law) | DONE | `creatures_sim` 31/0 (GAP-8 check) |
| F9 | Offline ecology: run_offline_catchup advances the SAME RNG-free equations 24 gh/day (floats + banked counts, never a spawn) + Alley-boldness briefing line | DONE | `creatures_sim` 41/0 + `offline_catchup_sim` 16/0 |
| F10 | Pre-eco saves heal on touch (eco backfill in cell_at) | DONE | `creatures_sim` 31/0 (GAP-10 check) |
| F11 | Legibility layer (LWE 0.9): threat-priority stack, toast queue, cause-stamped beats | OPEN | — |
| F12 | 0.11 BODY LAW on ALL death paths: howler/lurker/companion/infected pass their rigs | DONE | threat 17/0 · crew 11/0 · infected 10/0 · corpse 12/0 |
| F13 | Furnisher cap semantics: per-CHUNK ≤3 (awake_by_chunk ledger; global-6 removed — no co-op starvation) | DONE | `furnisher_lod_sim` 11/0 (4-shell cluster: 3 wake) |
| F14 | Catalog completion: 14 Building Book rows landed (53 total, all lawful: districts + JOB rule; silhouette overrides on the landmark rows) | DONE | `structure_data_sim` 36/0 + `silhouette_sim` 21/0 (53/53 materialize) |

---

## Status roll-up (post-audit-1, iteration 4)
- DONE: 45 (…E-set closed… + F1–F4, F6–F10, F12–F14)
- OPEN: 1 (F11 legibility)
- PARTIAL: 3 (P18, E12, F5)
- DEFERRED: 7 (P14, P16, P-clarify-1, E16, E18, E22, E23)
- **Audit 1 added 14 rows** (4 closed same iteration)

**STOP CONDITION** holds only when every row reads DONE or DEFERRED(reason), the full sim suite (incl. `world_walkthrough_sim`) is green, and two consecutive audits add zero rows.
