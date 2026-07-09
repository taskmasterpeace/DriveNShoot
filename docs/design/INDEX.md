# THE SPEC LEDGER — every active design contract, its status, and the build order

**Law:** every new/updated spec lands with a row here (same commit). Status: **BANKED** (spec only) ·
**EXECUTING** (code in flight) · **SHIPPED** (sims green) · **PARKED** (owner-gated).
*Last updated 2026-07-09.*

## The active contracts

| Spec | Owns | Status | V1 gate / first slice | Hard deps |
|---|---|---|---|---|
| **THE_AMERICAN_ROAD** | junction/exit/address laws, road hierarchy+dirt, corridor look, milestones M0–M9 | BANKED | **M0 wire+rows (~2-3 d)** → M1 junction+exit geometry | GROUND_INTEGRITY (cherry-pick, main) |
| **THE_BUILDING_BOOK** | canonical catalog, interiors law, mission schema, MULTI-USE law, strategies | BANKED | M0 materialize wire; M3c mission fields | AMERICAN_ROAD milestones |
| **NAVIGATION** | the journey law (walk/drive/fly), tiers, walk graph, failure ladder | BANKED | NAV-P1 walk (wife→church through a door) | road_graph (M1) for P2 drive |
| **THE_FAMILY_EMPIRE** | extort/own→city→capital, collectors, family/wife/kids, dates+school, revenge | BANKED | **THE HOLLOWPOINT SLICE** (E1/F1) | **P0** (below), M3c, NAV-P1 |
| **LIVING_WOUND_ECOSYSTEM** | sector pressure, food chain, nests, night shift, EAR layer, seeding | BANKED | Phase 1 "Alligator Alley Awakens" | **P0**; M4a look (soft) |
| **WEATHER_AND_SEASONS** | storm-disc field, gradients, seasons, lean-season arc | BANKED | field + rain/dust/heat + calendar (track W, road-independent) | none hard |
| **THE_LIBRARY** (+ /librarian, LIVE) | skim/study/boost, catalog, content standards | BANKED (skill SHIPPED) | Phase A fix-pack (3 shipped bugs die) | none hard |
| **SPECTACLES** | races/derby/pits/beast-husbandry/drone duels + betting | BANKED | S1 one grandstand + betting | events.gd; venue rows; FAMILY dates (soft) |
| **CLONING** | clinic ritual, wake choice, MEMORY LAW + journal, black market, THE FAMILY LAW | BANKED | C1 ritual + memory law | DSOA §11 (canon); **LIBRARY journal (now required)** |
| LIVING_WORLD_DSOA | the locked five: state flips, law, crime, jail, clone canon §11 | BANKED (canon) | the Florida slice | — |
| GROUND_INTEGRITY / TERRAIN_RELIEF | floors, void net, relief | BANKED (main) | executes at M2 / M8 | — |
| ANIMATION packs / RUN / GROUND | rig fixes | partly SHIPPED | per their docs | — |
| BANDIT_CONVOY / POPULATION_WAR / SECURITY_LADDER / LOOT_NPC | convoys, cells, wanted | BANKED / partly shipped | per their docs | P0 (cells) |

**PARKED:** MT (ambient traffic returns — owner-gated) · portal interiors (until proven; howler den
P3) · family MP sync · mountains option C (roads that climb).

## THE SHARED P0 (the one workorder everything queues behind)

**Wire `ProtoPopulation` into proto3d.gd + fix the hanging `population_cell_sim`.** Owned by the
FAMILY_EMPIRE arc; cited by ECOSYSTEM (its own iron first step), EMPIRE (cells = territory), and the
towns work. `world_stream.gd` is the hot file — published touch order: **P0 → AMERICAN_ROAD M-work →
NAV-P2's dehydrate hook.** Never two milestones inside it at once.

## The recommended implementation order (the owner's "what should we start on")

1. **P0** — population wiring + sim fix (days; unblocks three arcs).
2. **AMERICAN_ROAD M0** — the materialize wire + migration rows (~150 placements light up) + the
   Florida relief bug. *Visible win in week one.*
3. **LIBRARY Phase A** — the fix-pack (USE-eats-the-book, pad path, fire-guard) — small, kills three
   shipped bugs, and /librarian starts drafting skim books immediately.
4. **M1 junction + exit geometry law** — the owner's #1 complaint dies; road_graph lands.
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
