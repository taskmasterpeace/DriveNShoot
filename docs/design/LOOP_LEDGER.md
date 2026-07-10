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
| E1 | audio_sim | OPEN | engine-hum attach nil pitch_scale — real-bug bucket |
| E2 | bike_rider_sim | OPEN | — |
| E3 | bike_sim | OPEN | — |
| E4 | binocular_sim | DONE | realigned to the retirement (bind row cleared; B=recall) — 6/0 |
| E5 | char_sim | DONE | realigned to RIG V2 build axis (raider slab = build 1.6) — 14/0 |
| E6 | cone_sim | DONE | binocular phase asserts no-change — 8/0 |
| E7 | dark_sim | DONE | night-floor law (tense-not-blind) + glass retirement — 17/0 |
| E8 | drone_sim | OPEN | likely stale vs one-press/recall rework |
| E9 | frontier_sim | OPEN | — |
| E10 | furnisher_sim | OPEN | fold into I1 work |
| E11 | items_sim | DONE | 3 missing price rows added (hide/drone_remote/antibiotics) — 23/0 |
| E12 | life_sim | PARTIAL | night-floor realigned (18/19) — HORN-heels check = real-bug remainder |
| E13 | los_sim | OPEN | — |
| E14 | m1_sim | OPEN | — |
| E15 | nav_sim | OPEN | — |
| E16 | noise_sim | DEFERRED(owner's live radio arc — loud-radio draw API moving) | — |
| E17 | puppet_sim | OPEN | — |
| E18 | radio_positional_sim | DEFERRED(owner's live radio arc) | — |
| E19 | stage3_sim | OPEN | — |
| E20 | stage4_sim | OPEN | — |
| E21 | stage7_sim | OPEN | — |
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
| F1 | Warning contract (LWE 0.6): warn_mask ≥3 perceived clues before a human strike; strike DEFERS + force-spawns a clue | OPEN | — |
| F2 | Human-gate by nest state (LWE §3.5): FED apex never hunts humans; state changes eligibility, not just radius | OPEN | — |
| F3 | ONE authored nest (LWE §9-P1): apex-per-swamp-cell → one memorable I-75 nest + den prop; apex rarity law | OPEN | — |
| F4 | Noise→predator chain (LWE §3.5): human_noise float + apex reads noises_in; quiet/lights/route verbs matter | OPEN | — |
| F5 | Rats emerge from wrecks (nest-in-object); swamp road_shoulder zone SHIPPED (the Alley banks rodents now) | PARTIAL | zone fix in `creatures_sim` 31/0 |
| F6 | Bait verb + rodent-boom backfire on apex kill (LWE §9-P1 agency) | OPEN | — |
| F7 | Bird language (LWE §3.7): vulture = unkillable marker w/ formation states; + re-materialize loaded chunks so birds gather over watched kills | OPEN | — |
| F8 | Protected cells bank NO wildlife on the hourly tick (doorstep law) | DONE | `creatures_sim` 31/0 (GAP-8 check) |
| F9 | Offline ecology (LWE 0.8): pure advance_offline_day + return briefing | OPEN | — |
| F10 | Pre-eco saves heal on touch (eco backfill in cell_at) | DONE | `creatures_sim` 31/0 (GAP-10 check) |
| F11 | Legibility layer (LWE 0.9): threat-priority stack, toast queue, cause-stamped beats | OPEN | — |
| F12 | 0.11 BODY LAW on ALL death paths: howler/lurker/companion/infected pass their rigs | DONE | threat 17/0 · crew 11/0 · infected 10/0 · corpse 12/0 |
| F13 | Furnisher cap semantics (AR 0.11): per-chunk 2-3 (not global 6); co-op starvation | OPEN | — |
| F14 | Catalog 42-row completion (BUILDING_BOOK §1: 14 missing rows incl. hospital_lobby, library_small, city_hall) | OPEN | — |

---

## Status roll-up (post-audit-1, iteration 4)
- DONE: 23 (C0–C6, I0–I2, W0, P17, E4–E7, E11, E24–E27, F8, F10, F12)
- OPEN: 21 (E1–E3, E8–E10, E13–E15, E17, E19–E21; F1–F4, F6, F7, F9, F11, F13, F14)
- PARTIAL: 3 (P18, E12, F5)
- DEFERRED: 7 (P14, P16, P-clarify-1, E16, E18, E22, E23)
- **Audit 1 added 14 rows** (4 closed same iteration)

**STOP CONDITION** holds only when every row reads DONE or DEFERRED(reason), the full sim suite (incl. `world_walkthrough_sim`) is green, and two consecutive audits add zero rows.
