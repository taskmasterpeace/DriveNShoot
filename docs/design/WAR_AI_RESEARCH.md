# WAR & POPULATION AI — RESEARCH (implementation gate)

**Date:** 2026-07-07 · **Status:** research complete — GATES implementation of population cells + on/off-screen war
**How to read:** every claim carries an inline [source](url), a `[code]` tag (grounded in this repo, path given), or `[inference]` (our reasoning, not sourced).

---

## 0. Scope

Three case studies feeding one design: (1) how Project Zomboid runs an off-screen population, (2) how M&B / Total War / X4 / Kenshi / RimWorld resolve battles nobody is watching — and why players revolt when watched and unwatched math disagree, (3) how top-down action games do readable squad tactics without heavy infrastructure. Then THE DRIVN TAKEAWAYS: cell size, auto-resolve math shape, the one-outcome law, phased risks.

---

## 1. CASE STUDY: Project Zomboid — the off-screen population

### 1.1 The cell model
- The map is divided into cells (~300×300 tiles); zombie population and respawn are tracked **per cell**, with a per-cell **desired population** the system steers toward ([PZwiki: Custom Sandbox](https://pzwiki.net/wiki/Custom_Sandbox)).
- Population is a curve, not a constant: official sandbox options include a start multiplier, a **peak multiplier**, and a **peak day** ("The day when the population reaches its peak") — the world gets worse on a schedule ([official Sandbox_EN.txt](https://raw.githubusercontent.com/TheIndieStone/ProjectZomboidTranslations/master/EN/Sandbox_EN.txt)).

### 1.2 The respawn law (three interlocking timers)
Official setting descriptions, verbatim ([Sandbox_EN.txt](https://raw.githubusercontent.com/TheIndieStone/ProjectZomboidTranslations/master/EN/Sandbox_EN.txt)):
- **RespawnHours** — "hours that must pass before zombies may respawn in a cell. If zero, spawning is disabled." (default 72 h — [PZwiki](https://pzwiki.net/wiki/Custom_Sandbox))
- **RespawnUnseenHours** — "hours that a **chunk** must be unseen before zombies may respawn in it" (default 16 h). Note the two granularities: population per CELL, unseen-eligibility per CHUNK.
- **RespawnMultiplier** — "the fraction of a cell's desired population that may respawn every RespawnHours" (default 0.1 → 10% per cycle; clear a town, come back in a week, ~10% crept back per 72 h — [PZwiki](https://pzwiki.net/wiki/Custom_Sandbox)).
- **RedistributeHours** — "hours that must pass before zombies migrate to empty parts of the **same cell**" (default 12 h). Respawn is top-up; redistribution is local flow. Zombies also drift back toward original areas over days after an event ([pzfans](https://pzfans.com/surviving_the_helicopter_event_in_project_zomboid_build_41_vs_build_42/)).

### 1.3 Meta-events: the off-screen hand that moves hordes
- The **metagame** plays sourceless sounds — distant gunshots, house alarms — that players can hear but never locate, and which cause real zombie migration ([PZwiki: Metagame](https://pzwiki.net/wiki/Metagame)); frequency is a sandbox row ("Meta Event — how often zombie attracting metagame events like distant gunshots will occur" — [Sandbox_EN.txt](https://raw.githubusercontent.com/TheIndieStone/ProjectZomboidTranslations/master/EN/Sandbox_EN.txt)).
- The **helicopter** is the masterclass: a continuous, *mobile* noise source that sweeps the map and drags followers with it — "like a traveling siren"; unlike a one-shot gunshot it keeps re-attracting as it moves, and triggered migrations persist for days ([pzfans](https://pzfans.com/surviving_the_helicopter_event_in_project_zomboid_build_41_vs_build_42/), [PC Gamer](https://www.pcgamer.com/project-zomboid-helicopter-event/)).
- Noise is the universal glue: a shotgun blast attracts from up to ~200 tiles; every zombie has a **FollowSoundDistance** row; idle zombies clump via **RallyGroupSize** ([PZwiki: Noise](https://pzwiki.net/wiki/Noise), [Sandbox_EN.txt](https://raw.githubusercontent.com/TheIndieStone/ProjectZomboidTranslations/master/EN/Sandbox_EN.txt)).

### 1.4 What breaks immersion when tuned wrong
- Default respawn makes **clearing feel pointless** — players report "zombie respawn woes," ask which timer to zero out, and commonly disable respawn entirely; the wiki itself documents 0 = off as the escape hatch ([Steam thread](https://steamcommunity.com/app/108600/discussions/0/3198119216816033522/), [pzfans](https://pzfans.com/zombie_respawn_woes_outsmarting_project_zomboids_hordes/)).
- The failure mode is *visible bookkeeping*: population that reappears in areas the player secured, on a timer the player can smell. Lesson: respawn must be **diegetic** (migration from somewhere, pulled by something) or players will catch the accountant at work `[inference]`.

---

## 2. CASE STUDY: unwatched battle resolution — the one-outcome problem

### 2.1 Mount & Blade Warband: the famous divergence
- Auto-calc "looks at numbers of fighters, unit tiers and then adds a heavy dose of RNG"; mechanically it repeatedly picks a random troop, takes its power level, and applies it as damage to a random defender ([Steam: Does auto-calc really only look at numbers?](https://steamcommunity.com/app/48700/discussions/0/1732087824982805535/)).
- The bug players never forgave: troop power levels are too close across tiers, so **quality is undervalued** — "200 huscarls vs 500 recruits" wins but bleeds, and "looters take out Swadian knights, when in a field battle the knights would win without a single loss" ([same thread](https://steamcommunity.com/app/48700/discussions/0/1732087824982805535/)). Auto-calc casualties act as a deliberate *price* for not playing — and players read that as the game cheating ([Steam](https://steamcommunity.com/app/48700/discussions/0/45350791145649182/)).

### 2.2 Bannerlord: the actual vanilla math (documented from game code)
([Bannerlord Combat Simulation System gist](https://gist.github.com/jzebedee/be076d28f162c8d05fd7d2d72109a46f)):
- Power: `scaledPowerLevel = (2 + basePowerLevel) * (10 + basePowerLevel) * 0.02` where basePowerLevel = troop tier (heroes: level/4 + 1, ×1.5; mounted ×1.2).
- Damage per exchange: `(0.5 + 0.5*random) * (40 * (attackerPower / defenderPower)^0.7 * advantage)`, morale nudging it by `(attScale − defScale) * 0.005`; kill chance ≈ damage / victim maxHP ([search-corroborated](https://www.nexusmods.com/mountandblade2bannerlord/mods/1151)).
- Shape to steal: **power-RATIO damage with a dampening exponent (^0.7)** — elites beat trash but never for free, and randomness is bounded (0.5–1.0×), not a coin flip `[inference from formula]`.
- An entire mod genre exists solely to re-fix quality-vs-quantity weighting: [Simulations Fix — Advanced Autoresolve](https://www.nexusmods.com/mountandblade2bannerlord/mods/1151), [Auto Resolve Rebalanced](https://www.nexusmods.com/mountandblade2bannerlord/mods/3453), [Better Auto Calc](https://www.nexusmods.com/mountandblade2bannerlord/mods/673) (adds striker-advantage and troop-numbers-advantage terms: `damage = 50 * (attPower/defPower) * strikerAdvantage * numbersAdvantage` — [Advanced Autoresolve source](https://github.com/ukiie/bannerlord-advanced-autoresolve/blob/master/AdvancedAutoresolve/Simulation/SimulationModel.cs)). When your abstract math disagrees with rendered play, the community will ship the fix for you — loudly.

### 2.3 Total War: same disease, bigger budget
- Auto-resolve compares army strength/stats/composition in a "very simplified calculation"; it "over values certain units and races while undervaluing others," and "an easily winnable battle may end as a loss if autoresolved" ([TW:WH wiki](https://totalwarwarhammer.fandom.com/wiki/Autoresolve), [Steam](https://steamcommunity.com/app/1142710/discussions/0/3832045251564133986/)). The inverse complaint also exists — AR sometimes *beats* manual play, which players exploit ([Steam](https://steamcommunity.com/app/1142710/discussions/0/3832045251561220120/)). Both directions of divergence damage trust; the formula has been a community reverse-engineering project for 15+ years ([TWCenter](https://www.twcenter.net/threads/how-auto-resolve-is-calculated-exactly-what-is-the-formula.295689/)).

### 2.4 X4 Foundations: the cautionary tale of two rule-sets
- Out-of-sector (OOS) combat runs "a different set of rules... more like turn-based combat with hit rates and damage modifiers," calculated off weapon damage/shield/hull/agility ([Steam](https://steamcommunity.com/app/392160/discussions/0/3174449951069302946/)).
- OOS **ignores collisions and geometry** — all turrets fire even through the station's own structure; low-attention attackers pick 1..min(turrets, targets, 5) targets ([Steam](https://steamcommunity.com/app/392160/discussions/0/3043859512575894410/)).
- Player verdict: "IS and OOS combat is so different that X4 could be considered two separate games" ([Steam](https://steamcommunity.com/app/392160/discussions/0/603025705548123835/)). The lesson: divergence isn't just casualty *counts* — it's which **constraints** each layer honors. If walls, range, and fear matter on-screen, the off-screen law must price them in or outcomes flip when the player warps in `[inference]`.
- The good idea to keep: **graduated attention** — full sim near the player, cheaper rules farther away — rather than a binary on/off ([Steam](https://steamcommunity.com/app/392160/discussions/0/4407417406452121725/)).

### 2.5 Kenshi: discrete world-state flips instead of continuous sim
- Vanilla Kenshi simulates only what surrounds the player; unwatched squads "forget how to fight and get mauled," and mobs spawn directly onto unwatched groups ([Steam](https://steamcommunity.com/app/233860/discussions/0/1733210552690235471/), [RPGWatch](https://rpgwatch.com/forum/threads/rpgwatch-feature-kenshi-review.42490/page-2)) — a whole mod project (Kenshi Virtual Simulation Engine) exists to add the missing background world ([itch devlog](https://problemchild1500.itch.io/kenshi-virtual-simulation-engine)).
- Yet Kenshi *feels* like a living world because of **World States**: kill or imprison a faction leader and towns get overridden wholesale — new occupants, changed spawn rates, power-vacuum "invasion" spawns from rival factions ([Kenshi wiki: World States](https://kenshi.fandom.com/wiki/World_States), [Steam](https://steamcommunity.com/app/233860/discussions/0/1639792569854155564/)). Off-screen war as a handful of discrete, narratively-legible flags — not an ODE. Cheap, save-friendly, and players praise it as depth.

### 2.6 RimWorld: don't resolve battles — direct them
- RimWorld ducks the problem: home-map fights are always fully simulated; the off-screen system is a **pacing director**. Cassandra alternates 4.6-day ON / 6-day OFF threat phases, ≥1.9 days between major threats, ~8.5 majors/year ([RimWorld wiki: Cassandra Classic](https://rimworldwiki.com/wiki/Cassandra_Classic), [AI Storytellers](https://rimworldwiki.com/wiki/AI_Storytellers)).
- Threat SIZE is a budget, not a simulation: raid points = f(storyteller wealth, colonist count, adaptation, time), roughly wealth/160.83 + colonists-scaled terms, buildings counted at 50%, clamped 35..10,000; an **adaptation factor** eases off after player losses, and a days-passed factor ramps 0.7→1.0 by day 40 ([RimWorld wiki: Raid points](https://rimworldwiki.com/wiki/Raid_points)). Points are then *spent* buying raiders from a cost table — budgeted spawning, resolved live.

### 2.7 Lanchester: the math shelf
- Lanchester's **linear law** (1916): serial 1-v-1 combat — power ∝ N; **square law**: concentrated aimed fire — power ∝ N² (twice the troops = 4× the power) ([Wikipedia](https://en.wikipedia.org/wiki/Lanchester%27s_laws), [Ernest Adams, Designer's Notebook: Kicking Butt by the Numbers](https://www.gamedeveloper.com/design/the-designer-s-notebook-kicking-butt-by-the-numbers-lanchester-s-laws)).
- Real game combat, with range and movement limits, "effectively operates somewhere between Linear and Squared" ([Giant Battling Robots, attrition modeling](http://giantbattlingrobots.blogspot.com/2010/06/lanchesters-laws-and-attrition-modeling.html)); these laws remain the standard basis for attrition in large-scale military sims ([ibid.](http://giantbattlingrobots.blogspot.com/2010/07/lanchesters-laws-and-attrition-modeling.html)).

---

## 3. CASE STUDY: squad tactics in top-down action

### 3.1 GTA: escalation ladders as data rows
- GTA V's police response is literally a data table: `dispatch.meta` defines, per wanted star, the unit types, vehicle models, loadouts, and number of simultaneous pursuit units ([GTA5-Mods: Dispatch & Tactics](https://gta5mod.net/gta-5-mods/misc/dispatch-tactics-enhancement-v-aritifical-intelligence-enhancement-v-1-5/)). At 3 stars the *tactics* widen (roadblocks, spike strips), not just the headcount; officers use cover ([GTA wiki: Wanted Level in GTA V](https://gta.fandom.com/wiki/Wanted_Level_in_GTA_V)). Escalation = smarter positioning over raw aggression is where the series is heading ([Leonida Explorer analysis](https://leonidaexplorer.com/wiki/police-system)).

### 3.2 F.E.A.R.: the ceiling of "simple"
- The most-praised squad AI in shooter history ran a **3-state FSM** (Goto / Animate / UseSmartObject) with A* planning; squad behavior came from a manager that groups NPCs **by proximity** and hands out goals (suppress, advance, flank, search) — "creating the illusion of cooperation even though individual NPCs are blissfully unaware of their squad-mates" ([Orkin, GDC 2006, Three States and a Plan (PDF)](https://www.gamedevs.org/uploads/three-states-plan-ai-of-fear.pdf), [GDC Vault](https://gdcvault.com/play/1013282/Three-States-and-a-Plan)).
- Half the effect is **barks**: soldiers shouting orders makes uncoordinated agents read as a fireteam ([ibid.](https://www.gamedevs.org/uploads/three-states-plan-ai-of-fear.pdf)). Coordination is a presentation problem as much as a planning problem.

### 3.3 Hotline Miami: perception on a shoestring (top-down, no navmesh ceremony)
- Enemy FSM: Idle (Patrol / Roamer / Static) → Inspect → Attack; alerted enemies walk to the point of interest, time out, return to patrol; patrol handles obstruction with a simple local rule (turn when blocked) ([Rodrigo Fernandez Diaz, AI analysis](https://medium.com/@RodFernandez91/an-analysis-of-hotline-miami-ai-23c37dbcb156), [Hotline Miami wiki: Enemy Behaviour](https://hotlinemiami.fandom.com/wiki/Enemy_Behaviour)).
- Perception: line-of-sight alert speed scales with facing and distance (~1 s to bring a gun around); hearing is a **radius check** — a gunshot raycasts for enemies in range and hands them an Inspect position; some enemy classes are deaf by design ([same analysis](https://medium.com/@RodFernandez91/an-analysis-of-hotline-miami-ai-23c37dbcb156), [Dennaton dev blog](http://dennaton.blogspot.com/2012/11/hotline-miami-ai.html)).

### 3.4 Door Kickers: reactive doctrine
- Top-down tactics with enemies that hide, flank, and suppress; they react to *how you enter* — a loud breach draws defenders toward it or drives them deeper; difficulty scales by making enemies "smarter... using actual tactics," never bullet-spongier ([Scientific Gamer](https://scientificgamer.com/thoughts-door-kickers/), [Steam DK2 AI thread](https://steamcommunity.com/app/1239080/discussions/0/3016815718812214421/), [Wikipedia](https://en.wikipedia.org/wiki/Door_Kickers)).
- None of the above needs a navmesh: steering-behavior locomotion (seek/flee/wander/avoid via local feelers) is the classic alternative ([Reynolds, Steering Behaviors for Autonomous Characters](https://www.red3d.com/cwr/steer/)) — and is already DRIVN's pattern (whisker raycasts in `track/autopilot.gd`) `[code]`.

---

## 4. THE DRIVN TAKEAWAYS

### 4.1 Mapping the findings onto our reality
| Finding | Our hook `[code]` |
|---|---|
| PZ: population per persistent cell, ABOVE transient chunks | Stream chunks are 128 m, hash-seeded (`hash(WORLD_SEED:cx:cz)`), stateless, destroyed on unload — `world_stream.gd:12,119`. Cells must be a NEW persistent dict, not chunk state. |
| PZ: desired population + peak day curve | Per-cell `desired` by biome/state row; war curves it (events.gd already makes Tuesdays canonical). |
| PZ metasounds / helicopter | `world_state.broadcast_queue` + `queue_broadcast()` is the news pipe (`world_state.gd:69,175`); the parked noise-event layer is the attraction mechanic; the drone (`drone.gd`) is our mobile-noise-source precedent. |
| RimWorld: budgeted threats, director pacing | `events.gd` deterministic `hash(day)` roll, weekly `state_at_war` (`events.gd:30-57`) — the director exists; war needs a POINTS BUDGET row per front. |
| Kenshi: discrete world-state flips | `world_state.state_control` + `_apply_takeover()` (`world_state.gd:65,155`) — takeovers already flip states; war = contested flips with visible fronts. |
| X4: graduated attention | Player cell = rendered; adjacent = coarse tick; far = daily ledger tick `[inference]`. |
| FEAR/GTA/DK/HM: FSM + proximity squads + cones + noise + barks | `vision_cone` exists (howler/dog/deputy); pack roles (circler/charger/screamer in `howler.gd`) ARE squad slots; radio VO = our barks channel. |

### 4.2 Recommended cell size
**Use the usmap cell: ~500 m, on the existing 150×85 grid (12,750 cells).** `usmap.gd:2` already declares the world as "150×85 cells"; the 128 m stream chunk is the wrong layer (transient, 4:1 too fine, destroyed on unload) `[code]`. PZ precedent supports two granularities: population per CELL, "unseen" eligibility per finer chunk ([PZwiki](https://pzwiki.net/wiki/Custom_Sandbox)) — ours: population ledger per usmap cell, last-seen timestamp per 128 m chunk (already streamed). 12,750 small dicts fits the single-file save (`save_game()`) trivially; a daily ledger tick over 12,750 cells is negligible `[inference]`.

### 4.3 Recommended auto-resolve shape: seeded dice-pool attrition ticks (not closed-form Lanchester)
- **Shape:** resolve unwatched fights in discrete ticks (per in-game 10 min or per event). Each tick, each side deals `kill_chances = tick_rate × N_eff × (P_us / P_them)^0.7`, where P is summed unit power from the SAME data rows the rendered game uses, and `N_eff = N^1.5`-style mixed-Lanchester concentration (between linear and square, because our fights are ranged-but-positional) ([Lanchester](https://en.wikipedia.org/wiki/Lanchester%27s_laws), [Bannerlord ^0.7 dampener](https://gist.github.com/jzebedee/be076d28f162c8d05fd7d2d72109a46f)). Casualties are sampled per-unit, biased toward low-tier first (fixes Warband's huscarl massacre — [Steam](https://steamcommunity.com/app/48700/discussions/0/1732087824982805535/)).
- **Why dice ticks over the ODE:** (a) deterministic under our house pattern — seed with `hash("war:%d:%s" % [day, cell])` exactly like `events.gd`/`_apply_takeover` `[code]`; (b) **interruptible** — the player can arrive mid-battle and the survivor list spawns rendered (X4's binary handoff is the anti-pattern); (c) produces named casualties and loot, not just totals; (d) variance is bounded and tunable per tick. Closed-form Lanchester gives one expected value — no mid-fight state, no upset drama `[inference]`.

### 4.4 The one-outcome-law recipe
1. **One source of truth:** abstract power derives from the same rows rendered combat reads (weapon dps, hp, pack size, vehicle armor) — never a parallel hand-tuned table (Warband/Total War's original sin).
2. **Calibrate, don't guess:** we already run 60 headless sims — add `war_calibration_sim` that stages N rendered pack-vs-deputy / pirate-vs-convoy fights via real inputs and FITS the abstract `tick_rate` and matchup modifiers to measured kill-rates. Re-run whenever combat rows change (a parity check, like motion_sim) `[inference, grounded in existing sim infra]`.
3. **Price the constraints or lose them:** headlight fear, walls (`melee_clear`), crew wounds decide rendered fights — bake each as a measured scalar on the abstract side (X4's turrets-through-walls is the failure to copy) ([Steam](https://steamcommunity.com/app/392160/discussions/0/3043859512575894410/)).
4. **Tolerance target:** players tolerate casualty variance; they do NOT tolerate **rank inversion** (the favorite losing to trash) or systematic auto-taxes ([Warband](https://steamcommunity.com/app/48700/discussions/0/45350791145649182/), [TW](https://steamcommunity.com/app/1142710/discussions/0/3832045251564133986/)). Rule: abstract expected outcome within ±25% of rendered TTK, upsets only via an explicit low-probability roll that the news pipe REPORTS as an upset (turn the tolerated divergence into a story) `[inference]`.
5. **Flips over flows:** settle wars into Kenshi-style discrete outcomes (`state_control` flips, node ownership, spawn-rate deltas) — continuous fronts tick privately, but what persists and what the player is told are legible flags ([Kenshi World States](https://kenshi.fandom.com/wiki/World_States)).

### 4.5 Squad AI recommendation
FSM verbs: **advance / flank / hold-suppress / rout**, assigned by a proximity squad-manager (FEAR pattern — [Orkin PDF](https://www.gamedevs.org/uploads/three-states-plan-ai-of-fear.pdf)); locomotion stays whisker-steering (`autopilot.gd` pattern, [Reynolds](https://www.red3d.com/cwr/steer/)) — no navmesh needed, Hotline Miami shipped on local rules ([analysis](https://medium.com/@RodFernandez91/an-analysis-of-hotline-miami-ai-23c37dbcb156)). Perception = existing `vision_cone` + the revived noise layer (radius events, facing-scaled alert speed). Escalation = data rows per heat tier, GTA `dispatch.meta`-style ([GTA5-Mods](https://gta5mod.net/gta-5-mods/misc/dispatch-tactics-enhancement-v-aritifical-intelligence-enhancement-v-1-5/)). Sell coordination with radio barks through `audio.gd` VO — cheaper than real planning and proven to carry the illusion ([Orkin](https://www.gamedevs.org/uploads/three-states-plan-ai-of-fear.pdf)).

### 4.6 Phase-ordered risk list
| Phase | Build | Top risk (and the case-study warning) |
|---|---|---|
| P1 | Persistent cell ledger (150×85) + last-seen timestamps, in the save | Save bloat / migration of old saves; two-granularity confusion (PZ cell-vs-chunk) |
| P2 | Abstract resolver + `war_calibration_sim` parity harness | Rank inversion → M&B-style trust collapse; calibrate BEFORE any war ships |
| P3 | Arrival handoff: ledger → rendered spawns on approach, survivors → ledger on unload | Conservation-of-mass bugs (dupe/vanish packs); pop-in inside sightline (PZ respawn-in-cleared-zone rage) |
| P4 | Noise layer + meta-events on the broadcast pipe (mobile sources: patrol flights) | Map-wide audio/attraction blowouts — we already paid the ambient-TV EMERGENCY-TONE bug once `[code: 89802d1]` |
| P5 | Squad FSM verbs + heat-tier dispatch rows | Readability: flanking that looks like wandering; fix with barks + HUD pips before adding states |
| P6 | War fronts riding `events.gd` weekly `state_at_war` + `state_control` flips + news reports | Pacing: fronts everywhere = noise; adopt RimWorld on/off cadence (≥1.9-day gaps between majors) |

**Bottom line:** PZ proves the ledger, RimWorld proves the budget-and-director, Kenshi proves discrete flips, Bannerlord donates the damage curve, X4 is the tombstone that says "one law or two games." Build the ledger first, calibrate the law second, and never let the player catch the accountant.
