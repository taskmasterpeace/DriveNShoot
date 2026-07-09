# DRIVN — Population Cells + Large-Scale War

**Date:** 2026-07-07
**Builds on:** `LOOT_NPC_PRODUCTION_WANTED_SPAWN.md` §11 (spawn ecology) and §7.2 (rendered-vs-calculated travel)
**Companion doc:** `WAR_AI_RESEARCH.md` (auto-resolve math, morale curves, odds tables — written in parallel; this spec cites it rather than inventing those numbers)
**Priority key:** P0 = build first, breaks nothing if late; P1 = needed for war to read as a war; P2 = polish/scale

---

## 1. Overview

DRIVN's world today spawns population by chance-per-chunk with no memory: `world_stream.gd` destroys every actor on unload and hash-reseeds strangers on reload. §11 named the fix (cells, refill, migration) but never built the layer. This spec adds that layer — **persistent POPULATION CELLS that hold counts, not instances** — sitting above the streaming chunks, and uses the same count-based model to run **large-scale war**: battles are data rows resolved deterministically far away and rendered as real combat up close, with one shared outcome either way. The weekly STATE AT WAR event already in `events.gd` graduates from "pirate tax multiplier" to "an actual front line the player can see, hear about, and drive into."

## 2. Player Fantasy

The player should feel like **the world has a population, not a spawn table.** A cleared forest slowly fills back in from its neighbors, not from nothing. A safehouse is genuinely safe ground, not a lucky gap in the RNG. When the radio says a state is at war, that is not flavor text on a pirate multiplier — smoke is visible on the horizon, convoys of troops pass on the highway, and if the player drives toward the fighting, real squads are there, dying in numbers that match what the DJ already reported. The player should feel **their own presence is the seam** — approach a battle and it becomes real under them; leave, and the war keeps happening without them, off-screen, in the same book of numbers. Territory should feel like it can be *lost and won*, and the player's actions (fighting in a battle, cutting a supply route, killing a general) should be a lever on outcomes that were otherwise going to happen anyway.

## 3. Detailed Rules

### 3.1 POPULATION CELLS — P0

**Grid alignment: align to `usmap.gd` macro cells, NOT raw `world_stream` chunks.**

Justification: `ProtoUSMap.cell_m = 500.0` (the macro biome/state grid already used for `biome_at`/`state_at`) versus `ProtoWorldStream.CHUNK = 128.0` (the streaming unit). A population cell at 500m is roughly a 4×4 group of streaming chunks — coarse enough to be cheap to persist (a few hundred cells cover the whole compressed USA, not tens of thousands), and it reuses a grid the game already indexes into (`usmap.cell_index`, `usmap.legend`, `usmap.state_at`) instead of inventing a second coordinate system. Streaming chunks remain the disposable rendering unit; population cells are the permanent bookkeeping unit one layer up. A chunk always belongs to exactly one population cell (`floor(chunk_center / cell_m)`), and a population cell spans multiple chunks.

**Cell row schema** (`PopulationCell`, held in a `Dictionary["cx,cz"] -> PopulationCell` on a new `ProtoPopulation` singleton-style node, persisted in the save):

```json
{
  "id": "14,-8",
  "zone_tag": "thick_forest",
  "biome": "forest",
  "controlling_faction": "free_counties",
  "desired_pop": {"civilian": 0, "worker": 0, "threat": 3, "law": 0, "faction_troops": 0},
  "current_pop": {"civilian": 0, "worker": 0, "threat": 1, "law": 0, "faction_troops": 0},
  "last_seen_time": 118400.0,
  "last_noise_time": 0.0,
  "last_cleared_time": -1.0,
  "protected": false
}
```

- `zone_tag` — one of §11.4's zone tags (`thick_forest`, `house_field`, `forest_path`, `road_shoulder`, `swamp`, `suburbs`, `industrial`, `military_perimeter`) plus a new `war_front` tag (3.4). Derived once from `biome_at()` + `road_near()` proximity + town proximity at first cell touch; cached on the row (cheap — recomputed only if the cell has never been touched).
- `controlling_faction` — mirrors `world_state.state_control` at the state level but can diverge locally during an active battle (3.4) or a besieged Carousel node; defaults to the state's controller.
- `desired_pop` / `current_pop` — Dictionaries keyed by the five population groups the owner named (`civilian`, `worker`, `threat`, `law`, `faction_troops`). **Counts only.** No node references, no instances — a cell can exist and hold state for the entire game with zero actors ever spawned in it.
- `last_seen_time`, `last_noise_time`, `last_cleared_time` — game-clock seconds (`daynight` clock, matching the existing `ProtoDayNight` timebase other systems already read).
- `protected` — true for safehouse cells (3.2), true for the AUTHORED Meridian zone (`world_stream.AUTHORED` rect — hand-built content is never overwritten by ecology), settable by future "secure this area" gameplay (fence + generator, out of scope here but the flag is ready for it).

**Desired population by zone_tag** lives in a new data row file `data/population_targets.json` (§11's own naming, promoted from "open question" to a real file). *(THE_INFECTED.md I2: `GROUPS` gains `infected` and this file gains its rows + 3 new zone_tags — parallel keys, no collision with `controlling_faction`/`current_pop`, per the LWE parallel-keys law.)*:

```json
{
  "thick_forest":       {"civilian": 0, "worker": 0, "threat": 3, "law": 0, "faction_troops": 0},
  "house_field":        {"civilian": 2, "worker": 1, "threat": 1, "law": 0, "faction_troops": 0},
  "road_shoulder":      {"civilian": 1, "worker": 0, "threat": 2, "law": 0, "faction_troops": 0},
  "suburbs":            {"civilian": 4, "worker": 1, "threat": 1, "law": 1, "faction_troops": 0},
  "industrial":         {"civilian": 0, "worker": 3, "threat": 1, "law": 1, "faction_troops": 0},
  "military_perimeter": {"civilian": 0, "worker": 0, "threat": 2, "law": 0, "faction_troops": 4},
  "war_front":          {"civilian": 0, "worker": 0, "threat": 0, "law": 0, "faction_troops": 8}
}
```
Code floor ships with these seven rows; new zone tags are new JSON rows (same additive-fold pattern as `ensure_prices`/`ensure_archetypes` — floor wins on id collision).

**Refill rule (§11.2, made precise):** a cell's group `G` refills by `+1` (never a burst) when **all** of:
1. `current_pop[G] < desired_pop[G]`
2. `daynight.clock_seconds - last_seen_time >= REFILL_UNSEEN_HOURS * 3600.0` (default 2.0 hours game-clock)
3. a **valid edge source** exists: at least one adjacent cell (8-neighbor) has `current_pop[G] > 0`, OR the cell touches a road (`road_near` inside cell bounds) or a town anchor (`usmap.town_near`), OR it's the cell's very first touch (bootstrapping the world needs *a* source; "the road provides" is the canonical source of first life)
4. `not protected`
5. current world events allow it (a besieged/cleared Carousel node cell can suppress refill via its own `protected`-equivalent flag read from `carousel.gates`)

Refill is evaluated **once per cell per game-hour**, not every frame — cheap by construction (a few hundred cells, one dictionary walk on the `daynight` hour tick).

**NEVER spawn in player view.** A refill that materializes an actor (4.1) must pick a spawn point that is BOTH:
- outside the player's live vision cone (`vision_cone.current_half_angle()` / `current_dir()` — the same cone `_in_headlights` and the howler AI already read), computed against every human player in the cell (co-op: check all)
- at least `MIN_SPAWN_DIST_M` (default 45.0, matches the existing lurker/chest scatter radius already used in `world_stream._spawn_chunk`) from every human player, straight-line

If no cell-edge point satisfies both, the refill is deferred to the next hourly tick (the count sits banked, unspawned — this is exactly what counts-not-instances buys: nothing is lost by waiting).

**Safehouse suppression radius:** reuses the exact existing constant, doesn't invent a new one. `proto3d.gd` already defines `SAFEHOUSE := Vector3(110, 0, -323)` and `SAFE_BUBBLE_M := 18.0` (the PvP "holy ground" bubble). Any population cell whose bounds intersect a circle of `SAFE_BUBBLE_M` around `SAFEHOUSE` (and around any future player-built base, `homebase.gd`'s HOME anchor) gets `protected = true` automatically at cell-touch time — no separate radius to tune, one source of truth for "safe ground" across PvP and spawn ecology.

### 3.2 INSTANTIATION BRIDGE — P0

The core fix for "unload destroys everything." Cells hold counts; a loaded chunk that falls inside a cell **materializes** that cell's counts into real nodes, and the chunk's unload **banks** whatever's left back into counts.

- **On chunk load** (`ProtoWorldStream._spawn_chunk`, at the end, new call `ProtoPopulation.materialize(chunk, cell_key, key)`): for each group `G` with `current_pop[G] > 0`, spawn `min(current_pop[G], MAX_MATERIALIZED_PER_GROUP)` actors of the appropriate archetype (threat → `ProtoHowler`/`ProtoLurker` per zone_tag weighting already in `world_stream`'s `lurk_p` table; civilian/worker → `ProtoNPC` archetype rows; faction_troops → new `ProtoSquad` units, 3.4) at cell-edge-safe positions (3.1's rule, since a chunk can load while the player is *already* nearby driving in). Each spawned actor is tagged `set_meta("pop_cell", cell_key)` and `set_meta("pop_group", G)`. `current_pop[G]` is decremented by the count actually spawned the instant nodes exist — **the count and the instance are never double-counted.**
  - `MAX_MATERIALIZED_PER_GROUP` default 4 — a cell can desire 8 `faction_troops` but only render 4 at a time near any one chunk; the rest stay banked as counts and materialize in neighboring chunks of the same cell, or wait.
- **On chunk unload** (`ProtoWorldStream.update_stream`, the existing `loaded[key].queue_free()` branch): before freeing, walk the chunk's children for anything tagged `pop_cell`/`pop_group`, and for each surviving one, `current_pop[G] += 1` on that cell, then let `queue_free()` proceed as today. Dead actors (already `queue_free`'d themselves via `take_damage`/`dead = true` paths) simply never get counted back — this is casualty write-back for free, not a separate code path.
- **Casualties/removals from ANY cause** (killed by player, killed by another squad in 3.4's rendered battle, tamed into a dog, etc.) write back explicitly at the moment of death/removal, not just on unload: the death handler (`ProtoHowler.take_damage`'s `dead=true` branch, `ProtoNPC`'s equivalent, `ProtoSquad`'s casualty tick) calls `ProtoPopulation.on_actor_removed(actor)` which reads the actor's `pop_cell`/`pop_group` meta and **does not increment the count back** (it's gone — the whole point is the world remembers the kill). This is the one place double-accounting could sneak in if unload-banking and death-banking both fired for the same actor; the rule is **death-removal always fires first and clears the meta tag**, so a subsequent unload sees a taggless corpse-or-freed-node and does nothing.

This bridge is the single piece of new engine work the rest of this spec depends on; everything else (migration, war, perception) reads cell counts through it.

### 3.3 MIGRATION — P0/P1

Distinct from refill (3.1, which restores population toward desired). Migration **moves existing counts between adjacent cells** — it can push a cell temporarily *above* its desired population (a fleeing crowd is not desired, it's displaced) and it can drain a cell to zero regardless of desired.

**Trigger sources**, each with a pull weight and radius, read from the existing noise layer where possible (P0: the noise layer, `emit_noise`/`noises_in`, already exists uncommitted on `proto3d.gd` §per the parked diffs — this spec assumes that API is landed):

| Trigger | Source call | Pull radius (cells) | Pull weight |
|---|---|---:|---:|
| Gunshot | new `emit_noise(pos, r, "gunshot")` call from `ProtoWeapon` fire | 1 | 0.3 |
| Explosion | new `emit_noise(pos, r, "explosion")` from grenade/mine | 2 | 0.6 |
| Engine/horn | existing `emit_noise(..., "engine"/"horn")` (proto3d.gd:1094, 2333) | 1 | 0.15 |
| Radio (loud, powered) | existing `emit_noise(..., "radio")` (proto3d.gd:1108) | 1 | 0.1 |
| Sustained loud noise | any of the above repeated ≥3× within 60s in the same cell | 2 | **+0.4 stacking bonus** (this is the owner's "loud sustained noise = a pull") |
| World event: blood moon | `events.today_event == "blood_moon"` | ALL cells in a 6-cell radius of the player's home cell | 0.5 (threat group only, pulled TOWARD the player's area) |
| World event: state at war | `events.war_state != ""` | every cell in that state | see 3.4 — this is now the war engagement trigger, not a flat pull |
| Faction patrol order | future baron/ruler decision row (LOOT_NPC §9) issuing an "escort"/"raid" order | route cells between origin/destination | 0.5, directional along the route |
| Player bounty broadcast | `bounty_hunted == true` broadcast | cells within 3 of player's current cell | 0.3 (law group toward player) |

**Migration resolution** (once per game-hour, same tick as refill, folded into one `ProtoPopulation._hourly_tick()`): for each cell with an active pull (any trigger fired against it in the last hour), move `floor(pull_weight * source_cell.current_pop[G])` of the relevant group from the loudest/nearest adjacent source cell into the pulled cell, capped so a source cell never migrates below 0 and a destination never exceeds `desired_pop[G] * 2` (a temporary crowd is allowed to overshoot; it's not a runaway). Migrations write a one-line log entry (`ProtoPopulation.migration_log`, ring-buffer of last 20) for sim assertions and future radio flavor ("reports of movement near the old mill").

Big pulls (blood moon, state-at-war) use the same math with a larger radius/weight — there is no separate code path for "big event pull" vs "small noise pull," only different rows plugged into the same weighted-pull formula. **Per research doc**: the research doc should decide whether pull weight should scale with `daynight` darkness (night = bigger pulls, matching howler circle-ring behavior already scaling off `vision_cone.last_range_m`) — this spec leaves that multiplier as a named tuning knob (§7) rather than inventing the curve.

### 3.4 WAR ENGAGEMENTS — P1

A **battle row** is the atomic unit of large-scale war:

```json
{
  "id": "battle_ky_i65_042",
  "attacker": {"faction": "broadcast_church", "units": {"faction_troops": 22}},
  "defender": {"faction": "free_counties", "units": {"faction_troops": 14, "law": 3}},
  "cell": "31,-19",
  "seed": 8817342,
  "status": "calculated",
  "started_day": 42,
  "resolved_day": null,
  "casualty_band": null,
  "winner": null
}
```

- `status` ∈ `calculated` (running far away, resolved by math), `rendered` (player is near enough that real squads are fighting), `resolved` (over — winner + casualties are final, territory/law effects already applied).
- **FAR = CALCULATED.** While `status == "calculated"` and no player is within `RENDER_DISTANCE_M` (default 300m, roughly the vision-cone far range with margin) of the battle cell, the battle resolves **deterministically under `seed`** using the math in `WAR_AI_RESEARCH.md` (unit-count/quality odds, morale-rout thresholds, casualty bands — this spec does not restate that math; it names the seam). The resolution writes:
  - **Casualties** — decrement `current_pop["faction_troops"]` (and `law` if involved) on both the attacker's and defender's home cells (a battle's units are drawn FROM adjacent cells' `faction_troops`/`law` counts at battle start — a battle is not free troops out of nowhere, it's a local levy).
  - **Territory flips** — on a decisive win, `world_state.state_control[state] = winning_faction` for the state the battle cell is in (reusing the existing `ProtoWorldState.state_control` dictionary and `_apply_takeover`-style law swap — a battle can trigger the exact same law-profile change the FLORIDA takeover event does, just from combat instead of a scripted digest).
  - **Bulletins** — `world_state.queue_broadcast("radio", "...")` and `queue_broadcast("tv", "...")` (reusing the existing `broadcast_queue` the newsroom/radio/TV panel already drain), phrased from a battle-report template row (new `data/battle_bulletins.json`, same additive-fold pattern), e.g. *"The Witness Hour: Church units report a decisive push through Rock County — Free Counties militia in retreat."*
- **NEAR = RENDERED.** The moment a player crosses `RENDER_DISTANCE_M` of a `calculated` battle's cell, it flips to `status = "rendered"`: both sides materialize as real `ProtoSquad` units (3.5) with the REAL combat systems (the same `Damageable`/`take_damage`/`ProtoWeapon` law everything else uses) and fight it out live in the cell.
- **THE ONE-OUTCOME LAW.** Same battle row + same seed must produce the same winner and the same casualty band whether it resolves calculated or rendered. This is enforced by construction, not by luck:
  1. Rendered squads are stat-derived from the **same unit rows** the calculator reads (`data/unit_types.json` — `faction_troops` isn't a bare int, each point of count maps to one `ProtoSquad` member instance built from a `unit_type` row with hp/damage/accuracy that are the SAME numbers `WAR_AI_RESEARCH.md`'s odds formula uses as its per-unit strength inputs). There is exactly one place unit strength is defined; the calculator and the renderer both read it.
  2. The calculator's output (winner, casualty_band) becomes the **balance envelope** for the render: the render runs with the RNG seeded identically, and squad AI (3.5) targets/positions are seeded off the same `seed`, so the emergent fight tends toward the calculated result on its own. Where it doesn't (rendered combat has more variance — the player might tip a fight the calculator called for the other side), the render is authoritative for the ACTUAL played-out battle **only while the player is present**; the moment the player leaves mid-fight (streaming-edge handback below), the remaining fight re-collapses to counts and the calculated math takes over the rest of the way FROM the current casualty state — so a battle can be tipped by player intervention (that's the point of driving into one) but never desyncs into two contradictory histories, because there is only ever one active resolver (calculated OR rendered) for a battle at a time, never both.
  3. `battle_handoff_sim` (§7) is the enforcement test: run the same seed calculated-only and rendered-only, assert the winner matches and casualties fall within the tolerance band research doc specifies.
- **STREAMING-EDGE HANDOFF.**
  - **Approach mid-battle:** when a player crosses into render range of a battle already partway through its calculated timeline, the calculator has already produced a **casualty trajectory** (not just a final number — research doc should specify whether this is a simple linear interpolation of casualties-over-battle-duration or a coarser per-hour step; either way it's a deterministic function of elapsed time under the seed). The render **snapshots** that trajectory at the current elapsed time: survivors on each side = starting count − casualties-so-far, spawned at plausible positions (defenders dug in at the cell's `war_front` zone anchor, attackers advancing from the cell edge nearest their home cell) — **never inside the player's vision cone** (same rule as 3.1's refill). No pop-in in view: the transition happens on the chunk/cell the player is entering, one beat before their cone would resolve it, exactly like `world_stream`'s existing "load ring is bigger than render range" buffer.
  - **Player leaves:** the moment no player remains within `RENDER_DISTANCE_M`, the rendered squads' CURRENT hp/count state is read back into `current_pop`/a resumed casualty trajectory, all squad nodes are freed (banked into counts via the same instantiation-bridge path as 3.2), and `status` reverts to `calculated` — the calculator resumes from the exact casualty state the player left it in, continuing under the same seed as if it had never stopped.

### 3.5 PERCEPTION MODEL — P1

**One shared perception model for every actor** — howler, lurker, deputy, road pirate, `ProtoSquad` member alike. Two channels, matching what already exists and extending it rather than replacing it:

- **Sight** = the exact `vision_cone.gd` machinery already live: range/FOV pulled from the same `[half_angle, clear_radius_m, view_range_m, dim]` mode-param shape, with light modifiers already implemented as the day/night range change (howlers already read `vision_cone.last_range_m`). Non-player actors get a **cheap approximation** of the same shape (no per-NPC shader cone — that's the player's screen-space perception aid, not a simulated sense) using a plain dot-product + distance check against the same numbers: `is_in_sight(observer, target, mode_params) := angle(observer.facing, to_target) < half_angle AND distance < view_range_m AND melee_clear-style LOS (no wall between)`. This reuses `ProtoWeapon.melee_clear` (already the wall-law every combatant obeys) as the occlusion check instead of duplicating the shader's `occl_map` for hundreds of NPCs.
- **Hearing** = the noise-event layer, `emit_noise`/`noises_in`, exactly as howlers already consume it (`howler.gd`'s `_main.noises_in(global_position)` call, proto3d.gd:242-252). No new hearing model — every actor that wants to react to noise calls the same `noises_in(self.global_position)` the howler already calls.

**Squad AI verbs** (`ProtoSquad`, 3.4's rendered-battle unit) — five states, morale-gated, **per research doc for the exact morale-fraction thresholds and rout-probability curve**:
- `advance` — move toward the objective/enemy squad's last-seen position, using sight to update "last seen."
- `flank` — a squad member breaks formation to approach from an angle outside the defender's sight cone (uses the same sight-cone check against the ENEMY squad's approximated cone, not the player's).
- `hold` — dug in at a `war_front` zone anchor, doesn't advance, still fires.
- `suppress` — fires at a last-known position without full sight confidence (keeps pressure on hidden defenders — a research-doc-tunable accuracy penalty applies).
- `rout` — triggered when a squad's casualty fraction crosses the research doc's threshold; routed units flee toward their home cell at increased speed and stop fighting (mirrors `ProtoHowler.HowlState.FLEE`'s exact pattern — this is not a new flee behavior, it's the same one generalized).

**Existing actors adopt the model incrementally, not all at once:**
- Howler packs (circler/charger/screamer roles) **keep their bespoke ROLES** — this spec does not touch `howler.gd`'s role table. They already use both channels (sight via `vision_cone`, hearing via `noises_in`) — they're already conformant, no migration work needed.
- Deputies/sec-men (`ProtoNPC` archetype `secman`) and road pirates (`_update_pirates` in `proto3d.gd`) get sight/hearing wired in as a **P2 follow-up**, not required for the P0/P1 war slice to ship — they can keep their current simpler logic (aim_crouch on standing change, pirate-dice-roll) until a later pass folds them onto `is_in_sight`/`noises_in` explicitly. Naming this here so it's tracked, not silently dropped.

## 4. Formulas

**Refill eligibility** (3.1, rule 2):
```
eligible(cell, G) := current_pop[G] < desired_pop[G]
                 AND (clock_now - cell.last_seen_time) >= REFILL_UNSEEN_HOURS * 3600.0
                 AND has_valid_source(cell)
                 AND not cell.protected
REFILL_UNSEEN_HOURS = 2.0  (example: a cell last seen at clock=10000s, checked at clock=17400s → gap=7400s=2.06h → eligible)
```

**Migration transfer amount** (3.3):
```
moved(G) = floor(pull_weight * source_cell.current_pop[G])
dest.current_pop[G]   += min(moved(G), desired_pop[G]*2 - dest.current_pop[G])
source.current_pop[G] -= moved(G)
Example: source cell has 6 faction_troops, pull_weight = 0.6 (explosion trigger)
  → moved = floor(0.6 * 6) = 3 troops shift toward the noise this hour.
```

**Sustained-noise stacking bonus** (3.3):
```
effective_pull_weight = base_pull_weight + (0.4 if noise_count_in_60s >= 3 else 0.0)
Example: 3 gunshots in 40s in the same cell → 0.3 + 0.4 = 0.7 effective pull this hour.
```

**Spawn-safety gate** (3.1/3.4's "never in view" rule, one shared predicate):
```
safe_to_spawn(pos) := for every human player P:
    pos.distance_to(P.global_position) >= MIN_SPAWN_DIST_M   (45.0)
  AND
    angle_between(P.facing_xz, (pos - P.global_position).normalized()) > P.vision_cone.current_half_angle()
       OR pos.distance_to(P.global_position) > P.vision_cone.last_range_m
Example: player facing north (0,-1), half_angle=1.22 rad (~70°), last_range_m=36.
  A spawn point 50m north of the player fails the distance/angle test (inside cone, in range) → deferred.
  The same point, but 90° to the player's east at 50m, passes (outside the arc) → allowed if also >=45m away.
```

**One-Outcome tolerance** (research-doc-owned; this spec only names the check): `battle_handoff_sim` (§7) asserts `abs(rendered_casualties - calculated_casualties) <= TOLERANCE_BAND` and `rendered_winner == calculated_winner` across **N seeded runs**, where `N` and `TOLERANCE_BAND` are **per research doc** — not invented here.

## 5. Edge Cases

- **A battle's home cell runs out of `faction_troops` mid-battle (all levied, none left to reinforce).** The battle proceeds with whatever units it started with; it does NOT fail to start or pull from a non-adjacent cell. If the attacking side's home cell hits zero before the battle resolves, that side simply fights at its already-committed strength — running out of reserves is itself a valid research-doc-modeled disadvantage (a smaller starting `units` count), not a special-cased failure state.
- **Player is inside render range of TWO battles at once** (adjacent cells both at war). Both flip to `rendered`; no special handling required beyond the existing per-cell instantiation bridge — each battle's squads carry their own `pop_cell` meta and bank independently on unload/departure.
- **Player saves/quits mid-rendered-battle.** On load, a `rendered` battle whose cell isn't currently loaded reverts to `calculated` at load time (read current squad hp as casualties-so-far, bank, continue under seed) — the same path as "player leaves," just triggered by session boundary instead of distance. No battle is ever left in `rendered` status with no chunk loaded to hold its squads.
- **Migration would move a group below zero.** Clamped: `moved(G) = min(floor(pull_weight * source.current_pop[G]), source.current_pop[G])` — a cell can never migrate away more than it has, and the formula in §4 already floors from the CURRENT count so this can't occur by construction, but it's stated explicitly because a naive re-implementation (computing `moved` from `desired_pop` instead of `current_pop`) would break it.
- **A cell is `protected` (safehouse bubble) but an active war battle's cell overlaps it.** `protected` wins — battles never resolve as `rendered` inside the safehouse bubble radius (checked the same way spawn-safety is checked); a calculated battle whose cell happens to include safehouse-bubble area simply never flips to rendered while the player is inside the bubble, and casualties/territory still apply via the calculated path. This is "holy ground never spawns combat on top of you," not "wars can't happen near your house."
- **Noise trigger fires but the source cell has zero of the pulled group.** `moved(G) = floor(pull_weight * 0) = 0` — a no-op, not an error. The pull is logged (migration_log) but nothing visibly moves; this is correct (a gunshot in an empty forest pulls nothing because there's nothing adjacent to pull).
- **Two adjacent cells both qualify as a valid refill source for the same destination cell.** Pick the one with the higher `current_pop[G]` (a stronger population "radiates" faster) — deterministic tie-break: if equal, the lexicographically-lower cell key wins (matches the deterministic-hash-seed philosophy already used everywhere else in this codebase, e.g. `hash("%d:%d:%d" % [WORLD_SEED, cx, cz])`).
- **A `faction_troops` count exists in a cell whose state changed hands (territory flip) mid-simulation.** The cell's `controlling_faction` updates immediately on flip (3.4's territory-flip write), but `current_pop["faction_troops"]` does NOT automatically re-tag to the new faction — troops present at flip either routed (removed, per morale rules) or surrendered/were captured (research-doc's call on whether this converts them to the winner's roster or removes them entirely); this spec defers that conversion rule to `WAR_AI_RESEARCH.md` and only guarantees the COUNT bookkeeping stays consistent (no troops silently duplicated or created).

## 6. Dependencies

- **`world_stream.gd`** — gains the load-time `ProtoPopulation.materialize()` call and the unload-time bank-back call (3.2); this is the one required code change to the streaming layer itself. `world_stream.AUTHORED` rect cells are always `protected = true` (hand-built content, never ecology-managed).
- **`usmap.gd`** — population cells key off `usmap.cell_m`/`usmap.state_at`/`usmap.biome_at`/`usmap.town_near`/`usmap.road_near`; no changes needed to usmap itself, this spec only reads it.
- **`events.gd`** — the existing weekly `state_at_war` roll (`WAR_STATES`, `war_state`, `pirate_mult`) becomes the TRIGGER that spawns one or more battle rows for the chosen state (a new call from `roll_daily` into a new `ProtoWarDirector.start_battles_for(war_state, day)`); `pirate_mult` stays as-is for the existing pirate-dice system (unrelated to squad battles) — this spec ADDS battles on top of the existing war-week flavor, it does not replace the pirate tax.
- **`world_state.gd`** — battles write `state_control`/`active_laws` on territory flip (reusing `_apply_takeover`'s exact pattern) and write bulletins via the existing `queue_broadcast` (reusing `broadcast_queue`, which the newsroom/TV/radio panels already drain — no new drain path needed, only new producers).
- **`howler.gd`** — read-only dependency (this spec's perception model generalizes FROM howler's existing sight/hearing usage; howler.gd itself is unchanged, see 3.5).
- **`npc.gd`** — `ProtoNPC` archetypes (`civilian`, `worker`, `law` groups materialize as `ProtoNPC` rows) become the concrete class the instantiation bridge spawns for those three population groups; no changes to npc.gd required beyond it already being spawnable by archetype id, which it is.
- **`vision_cone.gd`** — read-only dependency for both the player's own suppression check (3.1) and the perception-model's sight approximation (3.5); no changes required.
- **The noise-event layer (`emit_noise`/`noises_in`, currently uncommitted diffs on `proto3d.gd`)** — this spec's migration triggers (3.3) and part of the perception model (3.5) assume that API lands as documented at proto3d.gd:104-124. If it lands with a different signature, 3.3's trigger table and 3.5's hearing channel need a one-line signature update, not a redesign.
- **`WAR_AI_RESEARCH.md`** (companion doc, in progress) — owns: unit-vs-unit odds math, morale/rout thresholds and probability curve, casualty-band width, the calculated-vs-rendered tolerance (`N` runs, `TOLERANCE_BAND`), and whether captured troops convert factions. This spec's battle-row schema and one-outcome law are written so that doc can fill in numbers without changing the data shape.
- **Reverse dependency (for those docs' future updates):** `LOOT_NPC_PRODUCTION_WANTED_SPAWN.md` §11 should be updated to point at this doc as the "implementation of the cell/migration model" once this ships — its §11.1-11.4 are the design intent this spec makes concrete and buildable. `LIVING_WORLD_DSOA.md` §5 (EventDirector) should note that battle rows are now a second kind of "calculated/rendered" event alongside its existing state-takeover events, sharing the same far/near philosophy.

## 7. Tuning Knobs

| Knob | Default | Range | Category | Affects |
|---|---:|---|---|---|
| `cell_m` (reused from usmap) | 500.0 | fixed (do not diverge from usmap) | gate | population cell size |
| `REFILL_UNSEEN_HOURS` | 2.0 | 0.5 – 12.0 | curve | how fast cleared areas feel alive again vs. stay cleared |
| `MIN_SPAWN_DIST_M` | 45.0 | 25.0 – 80.0 | gate | never-in-view guarantee strictness |
| `MAX_MATERIALIZED_PER_GROUP` | 4 | 2 – 8 | feel | how crowded a single chunk can look vs. render cost |
| `RENDER_DISTANCE_M` (battle handoff) | 300.0 | 150.0 – 500.0 | gate | how far out a war becomes "real" vs. stays numbers |
| Noise pull weights (per trigger, §3.3 table) | 0.1 – 0.6 | 0.05 – 1.0 each | feel | how strongly noise/events redistribute population |
| Sustained-noise stacking bonus | +0.4 | +0.2 – +0.8 | feel | how much repeated gunfire feels like "calling reinforcements" |
| Migration overshoot cap | `desired*2` | `desired*1.5` – `desired*3` | curve | how large a fleeing/reinforcing crowd can temporarily get |
| SAFE_BUBBLE_M (reused) | 18.0 | fixed (shared with PvP holy ground) | gate | safehouse suppression radius |
| Battle casualty trajectory shape | linear or per-hour step | — | curve | **per research doc** |
| Morale rout threshold | — | — | curve | **per research doc** |
| Calculated-vs-rendered tolerance band + N | — | — | gate | **per research doc** |

## 8. Acceptance Criteria

**P0**
- A cell that has never been visited can still hold `current_pop` counts and produce a valid `materialize()` call the first time a chunk inside it loads (bootstrapping works with no prior save data).
- Killing every `threat`-group actor materialized from a cell, then leaving and returning after less than `REFILL_UNSEEN_HOURS`, produces NO new threat actors in that cell (unseen-timer gate holds).
- Returning to the same cell after more than `REFILL_UNSEEN_HOURS`, WITH a valid adjacent source, produces exactly the refill formula's predicted count — not a burst to full desired population in one tick.
- No actor materialized by a refill or migration event ever appears inside the requesting player's live vision cone at the moment of spawn (assert via `safe_to_spawn` on every materialize call in a populated test scene).
- A cell within `SAFE_BUBBLE_M` of `SAFEHOUSE` never has `current_pop["threat"] > 0` at any point after its first hourly tick (protected flag holds).
- An actor that dies while its chunk is loaded correctly decrements `current_pop` exactly once (not twice via both a death-hook and a subsequent unload-bank).

**P1**
- A sustained burst of 3+ gunshots in one cell within 60 seconds measurably pulls more population from an adjacent source cell than a single isolated gunshot (assert the stacking bonus applies).
- A `calculated` battle resolved entirely offline (no player near it) writes exactly one territory flip (if decisive) to `world_state.state_control`, one casualty write-back to both cells' `faction_troops`/`law` counts, and at least one bulletin to `broadcast_queue`.
- The SAME battle row + seed, run once fully calculated and once with a player rendering it from the start, produce the same winner and casualties within the research-doc tolerance band.
- A player approaching a `calculated` battle mid-fight sees it flip to `rendered` with survivor counts matching the casualty trajectory at that elapsed time — never the full starting roster, never zero.
- A player leaving a `rendered` battle causes it to revert to `calculated` with `current_pop`/casualty state matching exactly what was alive the instant they left (no troops duplicated, none silently vanish beyond actual deaths).
- Driving into an active war-front cell during a `state_at_war` week produces a genuinely different scene than a normal drive: visible squads, active combat, distinct from the existing pirate-multiplier-only experience.

**P2**
- Distant (calculated, out of render range) battles produce a visible smoke-column prop and a radio/TV bulletin without spawning any actor — a co-op host and a co-op client both see the same war_state and the same territory-flip result (host-authoritative for battle resolution; clients read the result, never resolve their own copy).
- Deputies/pirates optionally adopting `is_in_sight`/`noises_in` do not regress their existing behavior (existing `secman_sim`/pirate-dice tests, if any, remain green).

## 9. Sim Hooks

| Sim | Phase | Key assertions |
|---|---|---|
| `population_cell_sim` | P0 | cell bootstraps with zero prior data; refill respects unseen-timer + valid-source + protected gates; `desired_pop`/`current_pop` never negative; tie-break on equal-source cells is deterministic |
| `migration_noise_sim` | P0/P1 | each trigger in the §3.3 table moves the predicted count under the §4 formula; sustained-noise stacking bonus applies at the 3-in-60s threshold; migration never drives a source cell below zero; overshoot cap holds on destination |
| `safehouse_spawn_suppression_sim` | P0 | every cell touching `SAFE_BUBBLE_M` around `SAFEHOUSE` is `protected`; `current_pop["threat"]` stays at 0 in those cells across repeated hourly ticks; extends to a second player-built base anchor to prove it's not hardcoded to one location |
| `biome_zone_spawn_sim` | P0 | each `zone_tag` in `population_targets.json` produces its OWN desired_pop mix (forest ≠ suburbs ≠ industrial); a new zone_tag row added via the additive-fold pattern is picked up without code changes |
| `calculated_battle_sim` | P1 | same battle row + seed run twice produces identical winner + casualties (raw determinism, no render involved); territory flip writes to `world_state.state_control`; bulletin lands in `broadcast_queue`; casualties write back to both home cells' counts |
| `rendered_battle_sim` | P1 | across **N seeded runs** (N per research doc), rendered winner matches calculated winner and casualties fall within **TOLERANCE_BAND** (per research doc) of the calculated figure; squad stats in the render trace back to the same `unit_types.json` rows the calculator used |
| `battle_handoff_sim` | P1 | approaching a battle mid-timeline produces a snapshot matching the casualty trajectory at that elapsed time; no actor spawns inside the approaching player's vision cone; leaving mid-battle banks state that the resumed calculated path continues from exactly (no double-counted or vanished troops); save/quit mid-battle also correctly reverts to calculated on load |
| `ai_perception_sim` | P1 | a non-player actor's sight approximation (`is_in_sight`) agrees with `melee_clear`-style occlusion (no seeing through walls); the same actor correctly reacts to `noises_in` at its own position (reusing howler's exact call pattern); squad AI verb transitions (`advance`→`rout`) fire at the research-doc morale threshold |

---

**House rules honored:** every config (cell targets, unit types, battle rows) is a JSON row, additive-fold, code-floor-authoritative on id collision — no hardcoded one-offs. Signals/meta-tags connect the instantiation bridge to death/unload paths rather than tight coupling cells to specific actor classes. `Damageable`/`take_damage` remains the one damage law for every rendered squad member — `ProtoSquad` units are ordinary combatants, not a special-cased health system. No purple anywhere this spec's future UI (smoke columns, map territory tints, battle bulletins) touches — territory-control map tints should use the existing faction palette conventions already implicit in `LIVING_WORLD_DSOA.md` (warm/cold state per faction, never violet/indigo hues).
