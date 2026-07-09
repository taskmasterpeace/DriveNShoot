# THE MAPMAKER'S EYE — the missing world-craft process

**Date:** 2026-07-09 · **Status:** BANKED — owner evaluating (nothing below is adopted until he says so)
**Owner ask (verbatim spirit):** "We need a process… think like a map maker. Look at what we're doing. Tell me what's missing. Then I'll be able to evaluate it."

---

## 1. Overview

The honest gap list between how DRIVN's world gets made today and how a working mapmaker/level
designer runs a world. Today we have a factory for FEATURES (`BUILD_PLAYBOOK.md` §2: pick → build →
sim → commit) and a pile of laws for ROADS (`THE_AMERICAN_ROAD.md`), but **no process that treats a
PLACE as the unit of work** — nothing that asks "is this region complete, reachable, readable, and
honest?" before the owner drives into it. Every gap below is pinned to a REAL wound from the
2026-07-09 playtest (see `PLAYTEST_FIX_SPEC_2026-07-09.md`) — no theoretical process for its own sake.

**What exists today (so the gaps are real gaps):**

| Piece | Covers | Does NOT cover |
|---|---|---|
| `BUILD_PLAYBOOK.md` §2 | the CODE loop (features) | PLACES — it verifies verbs, not geography |
| `MAP_POLISH_PLAN.md` | one big content PLAN (exit rhythm, town roster) | executed once — not a repeatable per-region process |
| `THE_AMERICAN_ROAD.md` | road/junction/exit/address LAWS + M-ladder | one arc's laws; no cross-cutting "is the world true" check |
| `PLAYTEST_GUIDE.md` | DO→EXPECT feature script | no designed DRIVE — tests verbs, not the map |
| The sim iron rule | every feature lands with a sim | per-feature; nothing sweeps the whole network |
| MapForge v3 | the editing tool | edits without LINTING (no warnings about what's wrong) |
| Art policy (INDEX) | silhouette pass per creature/building | no landmark budget per REGION |

## 2. Player Fantasy

When this process runs, the player never meets the seams: **every road he can see, he can drive;
every name is a promise the ground keeps** (a town called RAIL YARD has rails); he always knows
roughly where he is within ten seconds (compass → sign → marker → silhouette → map); something worth
slowing down for arrives on a rhythm, and the quiet stretches feel chosen, not empty. For the OWNER
the fantasy is: playtest night stops being bug-hunting and becomes judging a build that was already
swept — he drives the Map Walk, evaluates, and spends his words on direction instead of defect reports.

## 3. Detailed Rules — THE GAPS, ranked (impact on real wounds × cost)

### GAP 1 — THE CONFORMANCE SWEEP *(the map is a contract)*
- **A mapmaker does:** an automated pass proving the drawn map and the built world agree: every road drivable end-to-end, every junction physically crossable, every exit lands on a road, every placement reachable from the road net.
- **We do today:** per-feature sims + road_graph (planning only). Nobody proves graph-connected ⇒ world-connected.
- **The wound:** "the roads disconnect… super clunky" — 61 grade-separated crossings with NO geometry; the owner found them by driving into them.
- **Smallest step:** `map_conformance_sim` — visit every junction kind + N seeded autopilot A→B drives; assert arrival; print the failure list (the 61 pendings surface on day one, already owned by AMERICAN_ROAD M2).
- **Cost:** M (~a day; autopilot + graph already exist).

### GAP 2 — THE PROMISE AUDIT *(the name is a promise)*
- **A mapmaker does:** every named/marked thing delivers its name; map icon = world thing.
- **We do today:** names are flavor rows; nothing checks them against ground truth.
- **The wound:** the owner "saw a train track" (dirt-road twin ruts) and wanted to ride it — and the map really contains a town named **RAIL YARD SEVEN with zero rail**. The world wrote a check the ground can't cash.
- **Smallest step:** a name→required-prop table + a MapForge LINT panel flagging every unkept promise. Human-reviewed, never auto-fixed.
- **Cost:** S.

### GAP 3 — THE SPAWN-TO-FUN BUDGET *(travel-time truth)*
- **A mapmaker does:** keeps a travel-time matrix between key nodes and budgets it.
- **We do today:** the 60× scale law — with no check on what it costs the player in seconds.
- **The wound:** "everything is far as fuck away" — spawn sat ~700 m from the testbed. Nothing was moved; nothing was BUDGETED. We patched with a warp; a budget prevents the class.
- **Smallest step:** `travel_budget_sim` — time spawn→(car, weapon source, race board, test town, first exit) via autopilot; fail on a blown budget row.
- **Cost:** S–M.

### GAP 4 — THE MAP WALK *(the designed evaluation drive)*
- **A mapmaker does:** a scripted ~15-minute route crossing one of everything (junction, exit, town, POI, landmark, sign), driven before every review.
- **We do today:** the owner free-roams and burns his session DISCOVERING problems instead of judging the build.
- **The wound:** the entire 2026-07-09 session shape.
- **Smallest step:** a MAP WALK section in `PLAYTEST_GUIDE.md` (spawn → Meridian loop → I-95 → Exit 9 → a junction → a dirt spur; DO→EXPECT per leg) + a dev-panel "▶ start the Map Walk" warp.
- **Cost:** S (an afternoon; it's a doc + one button).

### GAP 5 — THE ORIENTATION LADDER *(can I answer "where am I?")*
- **A mapmaker does:** from any random point the player answers *where am I / which way is X* in ~10 s, via a ladder (compass → signs → mile markers → landmarks → map), plus a LANDMARK BUDGET per corridor km.
- **We do today:** the rungs exist or are coming (compass ✅ new, readable signs ✅ new, mile markers = M4b, 3 city landmarks) — but no TEST and no budget.
- **The wound:** "we need a compass… I don't know what this building is" — both fixed as one-offs; the ladder keeps the class closed.
- **Smallest step:** `orientation_sim` — sample K random road points; assert a readable sign/marker within X m and a landmark within the corridor budget.
- **Cost:** M.

### GAP 6 — BREADCRUMBS *(telemetry — the map learns)*
- **A mapmaker does:** heatmaps: where players went, died, U-turned, opened the map, got stuck.
- **We do today:** the owner's memory, transcribed by voice. That is the whole telemetry stack.
- **The wound:** every report starts with him reconstructing where he was ("I'm at another building…" — where?). We fix blind.
- **Smallest step:** `user://breadcrumbs_<date>.json` (pos every 5 s + death/map-open/chest/car events) + a MapForge overlay drawing it.
- **Cost:** S–M.

### GAP 7 — BEAT SPACING *(interval design)*
- **A mapmaker does:** density tables — something worth slowing for every N seconds per road tier; quiet stretches as chosen CONTRAST.
- **We do today:** MAP_POLISH's "exit rhythm" was this instinct, once. No per-corridor density lint; dead stretches are accidents.
- **The wound:** indirect — "I was just able to drive to another place" was the session's high (a discovery beat); the flatness elsewhere is the absence of designed beats.
- **Smallest step:** a MapForge density report per corridor (placements/km, longest dead gap) flagging blown budgets. Owner picks the fills.
- **Cost:** S (report first; content later).

### GAP 8 — PAPER FIRST *(the regional one-pager)*
- **A mapmaker does:** before data: half a page per region — its JOB, mood, signature, beats. (MERIDIAN and Alligator Alley HAVE paper; that's why they're the best places on the map.)
- **We do today:** two authored places have paper; the rest is biome noise with names.
- **The wound:** "I don't know what the fuck this is" — nobody decided what that place IS, so the world can't say.
- **Smallest step:** a REGION one-pager template (job / mood / signature / promises / beats / budget check) + the law: no new named place without one; rows land in INDEX like specs.
- **Cost:** S per region, forever — which is the point.

### GAP 9 — ONE LEGEND *(a single symbol language)*
- **A mapmaker does:** one legend — the map mark, the world sign, and the HUD glyph agree.
- **We do today:** MapForge diamonds, atlas marks, 🛸/🧭/🏁 HUD glyphs, sign glyphs — grown separately, aligned by luck.
- **The wound:** mild so far (the map view is our best surface — "I love the roads on the map"); this is prevention while the icon set is small.
- **Smallest step:** a LEGEND row table in `data/` read by MapForge, the atlas, and the HUD.
- **Cost:** S.

### GAP 10 — THE REBAKE BUTTON *(edit → derive → re-verify, one motion)*
- **A mapmaker does:** editing the source map re-derives all downstream layers (junctions, exit numbers, addresses, routes) and re-runs the sweep — impossible to forget.
- **We do today:** the junction bake exists as a manual step; nothing chains bake → sweep after a MapForge save.
- **The wound:** latent — the "map changed, derived layer silently didn't" class. Cheap insurance.
- **Cost:** S once GAP 1 exists (it's chaining).

## 4. Formulas (the budget defaults — owner tunes)

- **Spawn-to-fun:** `t(spawn → verb_i) ≤ B_i` via autopilot at road-legal speed. Defaults: car ≤ 20 s · weapon source ≤ 90 s · race board ≤ 120 s · test town ≤ 90 s · first exit ≤ 120 s. *Example: spawn→Meridian = 700 m ÷ ~15 m/s ≈ 47 s ✅ by car — but on foot 700 ÷ 4.2 ≈ 167 s ❌, which is exactly why last night felt far.*
- **Orientation:** from any sampled road point, `d(nearest readable sign|marker) ≤ 250 m` interstate / `≤ 400 m` county; `landmarks_visible ≥ 1` per 2 km of interstate corridor.
- **Beat spacing:** `longest_dead_gap(corridor) ≤ 45 s` at tier speed (interstate ≈ 1 km) — a "beat" = any placement/exit/landmark/event trigger.
- **Conformance:** `∀ junction j: crossable(j) = graph_connected(j)`; `N ≥ 25` seeded A→B autopilot drives with `arrival_rate = 100%`.
- **Breadcrumbs:** sample every 5 s (≈ 720 points/hour — trivial file size).

## 5. Edge Cases

- **Legacy content fails a new lint:** it goes on a GRANDFATHER list printed by the lint — never auto-deleted, never silently passed. The list is the worklist.
- **Conformance vs PARKED work:** `separated_pending` junctions are EXPECTED failures until AMERICAN_ROAD M2 decks them — the sim marks them `KNOWN (M2)`, so the suite stays green while the debt stays visible.
- **A promise with no prop yet in the catalog** (e.g. `rail`): the lint reports `UNFULFILLABLE — needs a Building-Book row first`; renaming the place is a valid resolution (owner's call, since names are lore).
- **Budgets vs the 60× scale law:** budgets are measured in PLAYER SECONDS at tier speed, never map meters — so a scale retune never silently invalidates them.
- **Breadcrumbs in co-op:** one file per peer id; the overlay tints per player. No network sync — each client writes its own.
- **Map Walk after a world edit:** any edit inside the Walk's corridor requires re-driving the Walk before the next review (that's the point of having one).

## 6. Dependencies

- **GAP 1/3/5 sims** ride the existing autopilot (`track/autopilot.gd`), `road_graph.gd`, and the sim iron rule (`proto3d/tests/`).
- **GAP 2/7 lints + GAP 6 overlay** live in **MapForge** (`tools/mapforge/`) — the map's home.
- **GAP 1 is the worklist feeder for THE_AMERICAN_ROAD M2** (bridge decks); when adopted, AMERICAN_ROAD's doc should cite this sweep as its acceptance harness (bidirectional link on adoption).
- **GAP 4** extends `PLAYTEST_GUIDE.md` and adds one devmode row (`devmode.gd`).
- **GAP 8** rows land in `INDEX.md` under its existing ledger law.
- **GAP 9** is a `data/` row table consumed by MapForge + atlas + HUD (`hud_3d.gd`).
- Consumers that cite THIS doc once adopted: PLAYTEST_GUIDE (Map Walk), MapForge README (lints), AMERICAN_ROAD (M2 harness).

## 7. Tuning Knobs

| Knob | Default | Safe range | Affects |
|---|---|---|---|
| spawn-to-fun budgets `B_i` | §4 values | 0.5×–3× | how front-loaded the world feels |
| orientation sign radius | 250 m / 400 m | 150–600 m | signage density cost vs "where am I" time |
| landmark budget | 1 / 2 km | 1/km – 1/5 km | corridor navigability by silhouette |
| beat gap ceiling | 45 s | 20–120 s | drive rhythm; lower = denser world |
| conformance drive count N | 25 | 10–100 | sweep coverage vs sim runtime |
| breadcrumb interval | 5 s | 1–15 s | telemetry resolution vs file size |

## 8. Acceptance Criteria (for ADOPTING each gap — each is pass/fail)

1. **CONFORMANCE:** `map_conformance_sim` exists, green, with every non-`KNOWN(M2)` junction crossable and 25/25 A→B arrivals.
2. **PROMISE:** MapForge shows a lint panel; RAIL YARD SEVEN appears on it (or has been renamed/given rail) — the canary case.
3. **BUDGETS:** `travel_budget_sim` green against the §4 table; blowing a budget row by editing usmap makes it fail.
4. **MAP WALK:** PLAYTEST_GUIDE has the route; devmode has the "▶ Map Walk" warp; the owner completes one review night on it.
5. **ORIENTATION:** `orientation_sim` green at §4 radii on K=40 sampled points.
6. **BREADCRUMBS:** a session writes the file; MapForge renders the trail of that session.
7. **BEATS:** MapForge prints per-corridor density with the longest-gap flag.
8. **PAPER:** the template exists; the NEXT new named place lands with a one-pager + INDEX row (enforced at review).
9. **LEGEND:** one data table; grep proves MapForge/atlas/HUD read it (no hardcoded glyph duplicated across the three).
10. **REBAKE:** a MapForge save triggers bake + sweep automatically (log line proves the chain).

---

## The recommended first bite (if the owner adopts)

**Adopt 1 + 2 + 4 first** — the three loudest wounds for the least work: CONFORMANCE kills the
"roads disconnect" class permanently (and hands M2 its worklist) · PROMISE kills the
RAIL-YARD-with-no-rails class in a day · MAP WALK costs an afternoon and converts every future
playtest from bug-hunting into evaluation. Then **3 (budgets)** and **6 (breadcrumbs)** as the next
pair — they make every later decision evidence-based.

**Why believe process beats one-off fixes:** the handbrake was "fixed" 2026-07-04, again 2026-07-05
(BUILD_PLAYBOOK bug ledger #5–6), and AGAIN 2026-07-09 — three passes on one wound, because each fix
closed the instance, not the class. Named, repeatable checks are how a class stays closed.
