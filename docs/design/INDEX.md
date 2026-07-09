# THE SPEC LEDGER — every active design contract, its status, and the build order

**Law:** every new/updated spec lands with a row here (same commit). Status: **BANKED** (spec only) ·
**EXECUTING** (code in flight) · **SHIPPED** (sims green) · **PARKED** (owner-gated).
*Last updated 2026-07-09.*

## The active contracts

| Spec | Owns | Status | V1 gate / first slice | Hard deps |
|---|---|---|---|---|
| **MERIDIAN_LIVE** | the CONNECTED town: diegetic prompts for every shipped director (pitch/chair/tote/church), 6-8 resident schedules + THE WITNESS LAW, race-day calendar surfaces, the pond + eco paddock + quarantine dressing, **THE PLAY.BAT TRUTH (0.5: an arc isn't visible until merged to main)** | **BANKED (owner Q&A 2026-07-09) — EXECUTES NEXT, before creatures (0.4)** | one pass; `meridian_live_sim` | everything it consumes is SHIPPED |
| **THE_AMERICAN_ROAD** | junction/exit/address laws, road hierarchy+dirt, corridor look, milestones M0–M9 | **M0–M4a SHIPPED** (92fbd87 wire · M1 junctions/gaps/yaw-bug/exit-peel · 5be6ad4 M2 integrity · 978c8c8 Meridian=EXIT 9 · 3291bb3 two-tier towns · 1e9a194 M3b network fill+dirt layer · 4730500 M4a corridor kit) → **M4b/M5 next** | M4b mile markers/shields; M5 interiors (ProtoInteriorSkin) | — |
| **THE_BUILDING_BOOK** | canonical catalog, interiors law, mission schema, MULTI-USE law, strategies | BANKED | M0 materialize wire; M3c mission fields | AMERICAN_ROAD milestones |
| **NAVIGATION** | the journey law (walk/drive/fly), tiers, walk graph, failure ladder — +§9 cold-start spec | **NAV-P1 SHIPPED** (422820a: ProtoSteering/WalkGraph/Journeys — the walker crosses Meridian through the church's real door, 10/10; wall-follow ladder 4/4) → NAV-P2 drive/records next | NAV-P2 (DRIVE legs on road_graph + SHELL tier + records) | road_graph LIVE (M1) |
| **THE_FAMILY_EMPIRE** | extort/own→city→capital, collectors, family/wife/kids, dates+school, revenge | **E1 core SHIPPED** (the pitch/take/heat ledger on live Meridian businesses; profit_day rows; empire_sim 13/13) → F1 family pass (wife/courtship/crisis law — needs NPCs-as-persons) + E2 blocks | F1 + E2 | P0 ✓ NAV-P1 ✓; M3c fields ride the rows now |
| **LIVING_WOUND_ECOSYSTEM** | sector pressure, food chain, nests, night shift, EAR layer, seeding | **P1 eco core SHIPPED** (ProtoEcology pressure loop + eco dict + corpse deposits + hungry season + W-WET migration; ecology_sim 12/12) → P1 part 2 = creatures on the quadruped rig (gator LIVE already) + warning contract + EAR | P1p2 creatures/nests | P0 ✓; M4a ✓ |
| **WEATHER_AND_SEASONS** | storm-disc field, gradients, seasons, lean-season arc | **TRACK W SHIPPED** (04011be: field+W-INT/TAX/SPAWN/SEASON/W-WET+fiat pin+save; wx_field_sim 17/17) | render recipes (§9) ride the consumers | none hard |
| **THE_LIBRARY** (+ /librarian, LIVE) | skim/study/boost, catalog, content standards | **TABLED (owner, 2026-07-09)** | resumes on owner call; /librarian stays usable for skim books | **CLONING's journal need is decoupled**: a MINIMAL auto-journal (record run facts + render as readable pages) ships inside CLONING C1; the full Library study system stays tabled |
| **SPECTACLES** | races/derby/pits/beast-husbandry/drone duels + betting | **S1 core SHIPPED** (THE BOOK — ProtoBetting: honest odds, vig payout law, deterministic race days, fix flag; betting_sim 12/12; venue rows LIVE in Meridian) → S1 scene next (tote board/announcer/enter) | S2 pits + derby | events.gd hook |
| **CLONING** | clinic ritual, wake choice, MEMORY LAW + journal, black market, THE FAMILY LAW | **C1 SHIPPED** (90c52c6: the chair ritual on the clock, MEMORY LAW wake-at-the-scan, surviving journal, vat defect tax, save round-trip; clone_ritual_sim 15/15) → C2 wake tiers + FAMILY LAW ride the family slices | C2 with EMPIRE E-slices | DSOA §11 (canon) |
| **MUD_AND_MONSTERS** | traction matrix (surface×wetness×tire), mud (slow-never-stuck), monster trucks (built), tracked+tractors, the rally | **T1 SHIPPED** (64d66ef: ProtoTraction matrix + mud-where-it-rained + car wiring; traction_sim 17/17) → T2 monster build next | T2 monster truck + CRUSH + the rally | SPECTACLES venue rows (LIVE in Meridian) |
| **THE_INFECTED** | the failed trials: taxonomy rows, herds-as-cells, the Choir zone law + `infection_pressure` writer, BITE FEVER, quarantine, the PIT/PREY laws, the Trials films | **I1 COMPLETE** (117cc1c the infected walk + the Choir: benning zone live, dial bleeds, bed dies, dog refuses, F-IP 0.55 cap law; infected_sim 10/10, choir_zone_sim 14/14) → **I2 next** (sprinter/echo/choir-touched, GROUPS wiring, quarantine) | I2 taxonomy + the body + the law | SECURITY_LADDER enforcers for posts |
| LIVING_WORLD_DSOA | the locked five: state flips, law, crime, jail, clone canon §11 | BANKED (canon) | the Florida slice | — |
| GROUND_INTEGRITY / TERRAIN_RELIEF | floors, void net, relief | **M2 SHIPPED** (5be6ad4: void net + floor-first + CCD/2m + 5-point sampling + real decks; ground_integrity_sim 9/9) / relief M8 | — | — |
| ANIMATION packs / RUN / GROUND | rig fixes | partly SHIPPED | per their docs | — |
| BANDIT_CONVOY / POPULATION_WAR / SECURITY_LADDER / LOOT_NPC | convoys, cells, wanted | BANKED / partly shipped | per their docs | P0 (cells) |

**PARKED:** MT (ambient traffic returns — owner-gated) · portal interiors (until proven; howler den
P3) · family MP sync · mountains option C (roads that climb).

## THE SHARED P0 — ✅ SHIPPED 2026-07-09 (commit 81d8757)

**ProtoPopulation is WIRED** (boot + stream bridge + hourly tick + mark_seen + save/load) and
`population_cell_sim` runs 23/23 (the "hang" was a missing `--headless --import` pass — the
class_names were never registered). New `population_wire_sim` 9/9 proves the wired path;
save/world/threat suites green. The three arcs that queued behind this (ECOSYSTEM, EMPIRE, towns)
are unblocked. `world_stream.gd` touch order continues: **AMERICAN_ROAD M-work → NAV-P2's
dehydrate hook.** Never two milestones inside it at once.

**MERIDIAN = THE PROVING GROUND — ✅ SHIPPED 2026-07-09 (b5a8e0e, owner order "all the testing
elements"):** 23 placements cover the spec web's testing set (diner/bar/jeweler/restaurant/school/
church/police/clinic/clone_wing/vat/fight_pit/derby_bowl/grandstand/drone_ring/auto/junkyard/
warehouse/radio/motel/market/gas/houses×2), all data rows through ProtoStructureBuilder (its first
world consumer). `meridian_town_sim` 32/32 (presence, AUTHORED bounds, no overlaps, real door-gap
rays, signs, loot, metas).

## The recommended implementation order (the owner's "what should we start on")

1. **P0** — population wiring + sim fix (days; unblocks three arcs).
2. **AMERICAN_ROAD M0** — the materialize wire + migration rows (~150 placements light up) + the
   Florida relief bug. *Visible win in week one.*
3. **M1 junction + exit geometry law** — the owner's #1 complaint dies; road_graph lands.
   *(LIBRARY tabled by owner 2026-07-09 — its Phase-A bug fixes ride along whenever it resumes.)*
5. **ECOSYSTEM Phase 1** (parallel from here) + **WEATHER track W** (parallel any time).
6. **M2 ground integrity → M3 addresses + two-tier towns + M3c mission fields → M3b network fill +
   dirt layer → M4a corridor look.**
7. **NAV-P1 → THE HOLLOWPOINT SLICE (E1/F1)** — the first family-empire play: extort the diner, drive
   the satchel, court the wife, the churchyard wedding.
8. **LIBRARY Phase B/C · NAV-P2 (collectors live) · E2/F2 · SPECTACLES S1 · CLONING C1** — in
   whatever order the playtests pull.
9. **M5/M7 interiors · E3/F3 · M9 capitals · E4/E5 · the rest** — the empire climbs as the world deepens.

*Rule of thumb baked into this order: substrate first (P0/M0/M1), then the SLICES that prove fun
(Alley, Hollowpoint), then breadth. Nothing waits on anything it doesn't truly need.*

## THE FULL FOLDER AUDIT (owner ask 2026-07-09: "anything in the design folder not tied into this?")

Every doc in `docs/design/` classified — nothing untracked:

- **THE ACTIVE WEB (tracked above):** AMERICAN_ROAD · BUILDING_BOOK · NAVIGATION · FAMILY_EMPIRE ·
  LIVING_WOUND_ECOSYSTEM · WEATHER_AND_SEASONS · SPECTACLES · CLONING · THE_LIBRARY (tabled) ·
  LIVING_WORLD_DSOA · BANDIT_CONVOY · POPULATION_WAR · SECURITY_LADDER · LOOT_NPC · INDEX.
- **SHIPPED (their content is live; keep as records):** ROAD_TRAFFIC_OVERHAUL · MAP_POLISH_PLAN ·
  PUPPET_RIG_V2 · ANIMATION_FIX_PACK · CINEMA_MEDIA_LAYER · DYNAMIC_SPLIT_DRONE · CAROUSEL_PORTAL
  (dev build — the portal-interior proof CLONING/dens will cite).
- **REFERENCE (laws, not backlogs):** BODY_RIG_REFERENCE (the mannequin is definitive) ·
  UI_DESIGN_LANGUAGE (**cross-cutting law — every new panel this web adds (empire ledger, family K
  tab, betting window, clone terminal) MUST cite it**; now stated here so it's wired in).
- **THE COMBAT ARC — SCHEDULED (owner, 2026-07-09): after M1, parallel with the slices.**
  DRIVE_BY_COMBAT (seat-arc firing) + POSE_TO_POSE_STRIKES (contact-pose damage) slot in as order
  step 5b — so when collectors and pit fights arrive, the combat that powers them is already real.
- **ORPHANS TIED IN AS OF THIS AUDIT:** CAR_UI_REQUIREMENTS (→ consumed by the freight/collector
  cockpit reads — cite from FAMILY_EMPIRE when E3 lands) · EQUIPMENT_PAPERDOLL (→ the wife/kid/
  fighter dress rows — FAMILY §2.1 + SPECTACLES fighters) · COOP_PVP_MOBILE (→ the co-op v1 law
  FAMILY_EMPIRE 0.6 already cites; mobile stays DSOA P3) · INFECTED_TRIALS (**SUPERSEDED 2026-07-09 by
  THE_INFECTED.md** — the reconciled arc landed and holds the ledger row above; ECOSYSTEM P3 + DSOA +
  CLONING + SPECTACLES + NAV + SECURITY + BANDIT + POP_WAR all carry its amendment lines) ·
  WAR_AI_RESEARCH (research feedstock for POPULATION_WAR — no action).
- **ON MAIN, NOT THIS WORKTREE:** GROUND_INTEGRITY.md + RUN_ANIMATION.md (cherry-pick at M0 — already
  in the M-ladder).
- **ART/MODELS POLICY (owner question, answered):** there is NO blocking art phase — the box
  aesthetic IS the art. Animals are `quad_params` rows on the shipped quadruped rig; buildings are
  the builder's shells. Law: **behavior ships first with row-tuned boxes; each creature/building gets
  a 30–60 min SILHOUETTE PASS (proportions/color/one signature feature — the Knifeback's back
  ridges, the water tower's name) only after its sim goes green.** Art polish is a permanent
  background lane (MotionForge gaits, prop dressing), never a milestone gate.
