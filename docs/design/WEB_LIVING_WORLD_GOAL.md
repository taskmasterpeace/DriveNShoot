# WEB_LIVING_WORLD_GOAL: the goal the living world is built to

Robert, 2026-10-30: "before you build a living world that is a reflection of deathlands, build an ambitious, clear,
measurable, defined goal." This is that goal. No living-world lane starts until Robert agrees it. After that, every lane brief
quotes the target it moves and the check that proves it.

## 1. Overview

**The goal in one sentence:** a player can drive a ruined, lower-48 United States coast to coast
(about two real hours flat out). Every mile and every person on the way runs on real, honest systems. Nothing appears from
nowhere and no one knows what they weren't told. **Eight players can share that world for 24 hours, and it remembers
everything they did.**

That's "Living World v1". It's ambitious on purpose: it is the whole country, not one state, and a shared server, not a
single-player demo. It is defined by **twelve world targets** and **ten game goals** (§3, §8), and each is proven by a named audit or check. It is
reached through **five gates in order** (§8). Robert (2026-10-30): dates are not the point. The game is. The gates are an order of work, not deadlines. The world holds the *shape* of the post-collapse genre, never its names, slang,
characters or plot (law 4).

## 2. Player Fantasy

You wake in Florida with almost nothing. The radio, a board in a bar and a stranger on the road give you reasons to go
somewhere. The road there is long and never empty: a trader's convoy pulled off at an exit, a wreck worth stripping, a walled town
whose strongman taxes the bridge, an ambush laid in the dry wash.

Every box you open was filled once and never refills. Every bullet you fire is one fewer in the country. Every person you pass
has a home, a job and a flag, and they only know what someone told them. Two hours of hard driving gets you to the other
ocean, if your fuel, your car and your luck hold. When you come back a week later, the town you saved still flies your colours,
the grave you dug is still there, and the people you robbed still remember your face.

**The genre shapes it must hold (IP-safe):** walled towns under a strongman; sealed pre-war bunkers with dead technology;
scarce ammunition and fuel; poisoned ground and bad water; acid weather; mutated beasts and the infected; slavers,
raiders and traders on the long roads; convoys of armoured trucks.

## 3. Detailed Rules (the twelve targets)

| # | Target | v1 number | Proven by | Today (2026-10-30) |
|---|---|---|---|---|
| T1 | The whole country | 48 states laid out with the world tools; 0 hand-placed one-offs | `worldAudit states`: every row has a stamp source | Arizona and Florida start areas; 251 sites stamped |
| T2 | Real distance | LA to NYC in 120 ± 15 min flat out in the fastest car; Miami to Orlando in 10 ± 1 min | `travel from= to= vehicle=` on the real road graph, plus one driven run | Scale law K = 5.2; travel math being built |
| T3 | Never empty | No dead stretch > 90 s of driving on any interstate; a stop worth slowing for every 1-3 min | `long-road` gap audit over every interstate | I-10: 0 dead stretches (was 6 / 20 of 49 min) |
| T4 | Places worth going to | ≥ 600 towns and cities; ≥ 48 military bases (1 per state); ≥ 1 notable site per 30 road-miles; sealed bunkers in ≥ 16 states | `worldAudit places` | 251 sites; base system built |
| T5 | A living population | ≥ 20,000 named people (a home, role, schedule, faction and flag), simulated off-screen; ≥ 300 in screen tier near players | `worldAudit people`; a census per region | Start towns only |
| T6 | Nobody cheats | 0 teleports, 0 items without an origin | `cheatAudit` over a 2-h soak | Law in force; no world-wide audit |
| T7 | Nobody knows untold things | 100% of the facts NPCs act on carry a source and an age | `knowledgeAudit` over 1 game day | Law in pulls, hunters and investigators; not audited world-wide |
| T8 | Scarcity is real | World stock of ammo, fuel, food and meds never rises without a traced production or delivery | `stockLedger`, hourly totals | Containers roll once; no ledger |
| T9 | The world remembers | 24-h soak: ≥ 10 town ownership changes, ≥ 200 chronicle rows, ≥ 50 graves, each traced to a cause | `chronicle` export plus `worldAudit memory` | Chronicle, graves, factions and stories exist |
| T10 | The loop works | A new player finishes a full run (need, plan, travel, get in, take, get out, spend) in ≤ 30 min; ≥ 8 of 10 testers name a reason to go out again | scripted playthrough plus Test Lab playtests | All pieces exist |
| T11 | It runs | ≥ 60 fps on Robert's PC at defaults; < 150 draw calls; no streaming hitch > 50 ms at 100 mph | `scenario name=stress`, `stream-drive`, feel report | Within budget in start areas |
| T12 | Shared and persistent | 8 players, one shard, 24 h: 0 desyncs, 0 lost saves; the clock runs only while someone is on | shard soak (`npm run shard:test`, grown to 8 bots plus Robert) | Shard and dev seed exist; no 8-player soak |

### The ten game goals (what it is like to play; Robert: "we need goals for the game")

| # | Game goal | Number | Proven by |
|---|---|---|---|
| P1 | **A first hour that hooks** | Within 10 min of a new game: drive a car, win or flee a fight, loot something, and be shown a reason to go out | scripted new-player run plus Test Lab playtests (time to each beat) |
| P2 | **Driving is the heart** | ≥ 50% of play time in or on a vehicle; ≥ 12 drivable vehicle rows, each with a distinct feel inside the feel bands | session recorder (time in vehicle); `feel` report |
| P3 | **Many kinds of run** | ≥ 10 distinct run types: scavenge, rescue, escort, bounty, heist, trade run, salvage, town defence, delivery, hunt | pulls board census over a game week |
| P4 | **Regions that feel different** | ≥ 8 regions, each with its own look, weather, threats, loot table, factions and road dangers; a blind tester names the region from a screenshot ≥ 7 of 10 times | region rows audit plus a screenshot test |
| P5 | **Never more than 3 minutes without a decision** | In playtests, the longest stretch with no meaningful choice (route, fight or flee, take or leave, spend) is ≤ 3 min | recorder: input-decision timeline |
| P6 | **Fights you read and win by thinking** | Every incoming shot can be placed (foeTold ≥ 0.75); cover, flanking, stance and range change the outcome in ≥ 80% of staged fights | `feel` gun bands plus the tactics checks |
| P7 | **Coming home stronger** | A base that grows through ≥ 4 tiers; a crew of up to 6; dogs; ≥ 20 car upgrades; each tier visibly changes what you can attempt | homes, crew and workshop rows audit |
| P8 | **Your choices show** | Every major act (a killing, a robbery, a rescue, a town saved or lost) changes something visible within 1 game day: prices, greetings, bounties, graves, flags | chronicle-to-reaction audit |
| P9 | **Scarcity you feel, not starvation** | In a new game, ammo and fuel last ~3-5 runs before you must go further; nobody is ever soft-locked (a way out always exists: trade, scavenge, walk) | economy sim over 20 seeded games |
| P10 | **The genre on every road** | Every interstate passes ≥ 1 walled town under a strongman, sealed pre-war tech, poisoned or acid hazards, and raiders or slavers, as genre shapes with 0 IP-lint deny | `worldAudit shapes` plus `ip-lint` |

Rules that bind the targets:
- **R1.** All twelve world targets and all ten game goals must hold **at once, on one build**, and the full selftest battery must be green twice on fresh pages.
- **R2.** Honesty targets (T6-T8) are never traded for scale or speed. A failing honesty audit stops the line (§5).
- **R3.** Every target's number appears in the status pane with today's value. The lead refreshes it from the audit, never by hand.

## 4. Formulas

**F1 Drive time (T2).** `t_min = (d_road_mi × 1609.344 × K / L) / v_ms / 60`
- `d_road_mi`: real road miles between the two places (from the usmap road graph). LA to NYC ≈ 2,790; Miami to Orlando ≈ 235.
- `K`: game metres per usmap metre (WEB_STREAMING scale law), currently 5.2, safe 4.9-5.5.
- `L`: the map's compression factor, real metres per usmap metre, fixed by the usmap import.
- `v_ms`: the reference vehicle's flat-out speed in m/s (the LAWMAN row).
- Calibration: the rule "Miami to Orlando in 10 real min flat out" fixes `K/L`. Coast to coast then scales by distance:
  `t_LA→NYC = 10 × 2790 / 235 ≈ 118.7 min` → inside T2's 120 ± 15.

**F2 Dead stretch (T3).** On a route sampled every 1 s of driving at cruise, a second is *live* if any of these is within sight
range (default 120 m): a vehicle, a person, a site, a wreck, a sign, a landmark, a radio line or an event. A dead stretch is a
run of non-live seconds. `max_dead` must stay ≤ 90 s.
- Example: I-10 before the long-road lane, 6 stretches totalling 20 of 49 min; after, 0.

**F3 Stock ledger (T8).** For each good `g`, hourly: `Δ_g = S_g(t) − S_g(t−1)`. Pass if `Δ_g ≤ Σ produced_g + Σ delivered_in_g`
(tracked rows), for every hour.
- Example: ammo 9mm, hour 14: stock 41,200 → 41,260 (+60). The crafting rows show a reloading bench made 60, so it passes. An
  untraced +1 fails.

**F4 Knowledge coverage (T7).** `coverage = facts_with_source_and_age / facts_acted_on`, over every NPC decision in one
game day. Pass if `coverage = 1.0`.

**F5 Population budget (T5, T11).** Screen tier ≤ 300 full sims; town tier at 1 tick per game minute; region tier at 1 tick
per game hour. Frame cost must stay inside T11 at the peak screen count.

## 5. Edge Cases

- **Performance misses (T11):** cut draw distance and screen-tier density first, then simplify far chunks. Honesty (T6-T8)
  is never cut.
- **Stamping too slow (T1, T4):** improve the tools; never hand-place. If G3 drags on, v1 ships the lower 48 at
  **city-and-interstate depth** (rural detail in a later pass) and the pane says so.
- **Population too heavy (T5):** lower the off-screen tier's tick rate before the head count. People who exist stay honest.
- **The shard soak fails (T12):** v1 slips. Shared and persistent is part of the goal, not a stretch.
- **An honesty audit fails (T6-T8):** stop the line. No new content lands until it's green.
- **A target turns out wrong** (for example, a 2-hour crossing feels too long in play): Robert changes the number in the pane.
  The goal is updated here with the date and his words, and the lanes re-aim.
- **Measurement gaps:** a target with no working audit counts as *red*, never green by default.

## 6. Dependencies

Uses (each of these docs must also link back here):
- WEB_DEPTH_PLAN (laws §0, the loop §2, the Version 2 roadmap §10)
- WEB_STREAMING (scale law, T2/T11)
- WEB_WORLD_TOOLS (T1/T4, being written)
- WEB_LONG_ROAD (T3)
- WEB_MILITARY_BASES and WEB_SITES_TERRAIN (T4)
- WEB_CITYGEN and roles (T5)
- WEB_PERSISTENT_WORLD_PLAN and the shard server (T12)
- WEB_SITE_STORIES, the chronicle, WEB_DEATH_RITES and factions (T9)
- the pulls board, bounty hunters and investigators (T7)
- crafting, farming and couriers (T8)
- WEB_FEEL and the Test Lab (T10/T11)

Used by: every living-world lane brief (each names its target), and the status pane milestone "Living World v1".

## 7. Tuning Knobs

| Knob | Default | Safe range | What it changes |
|---|---|---|---|
| Coast-to-coast time (T2) | 120 min | 90-180 | How big the country feels; fuel and breakdown pressure |
| Max dead stretch (T3) | 90 s | 45-180 | How busy the road is versus how lonely |
| Towns and cities (T4) | 600 | 300-1,200 | Density of destinations; stamping effort |
| Named people (T5) | 20,000 | 8,000-60,000 | How alive towns feel; server cost |
| Screen-tier cap (F5) | 300 | 150-500 | Crowds near you versus frame rate |
| Soak length (T12) | 24 h | 8-72 h | Confidence in persistence |
| Players in soak (T12) | 8 | 4-32 | The multiplayer claim |
| Sight range for "live" (F2) | 120 m | 80-200 | What counts as "something there" |

## 8. Acceptance Criteria

**The gates, in order (no dates; a gate passes only when every line holds).**

| Gate | Order | Pass/fail criteria |
|---|---|---|
| **G0 Ground** | first | (a) Tonight's integrate batch is on main. (b) The battery is green twice on fresh pages. (c) Seasons, horses, crafting, and house and garden have landed. (d) `worldAudit`, `cheatAudit`, `knowledgeAudit` and `stockLedger` exist and print today's values into the pane. |
| **G1 Tools** | after G0 | (a) World tools and travel math are in the Forge. (b) T2 is within ± 15% on 5 city pairs. (c) Georgia or Alabama is laid out only with tools (T1 for that state). (d) T3 and T11 hold in it. |
| **G2 The South-East** | after G1 | (a) FL, GA, AL, MS, SC, NC and TN are stamped (bases, cities, exits, rural buildings). (b) T3, T4 and T11 hold across them. (c) A 2-h `cheatAudit`, `knowledgeAudit` and `stockLedger` are all clean (T6-T8). |
| **G3 The lower 48** | after G2 | (a) All 48 states are stamped (T1, T4). (b) T2 holds coast to coast. (c) T5 holds. (d) The 2-h audits are clean. |
| **G4 Living World v1** | last | (a) A 24-h, 8-player shard soak passes T9 and T12. (b) T10 passes (scripted plus Robert's playtests). (c) **All twelve world targets and ten game goals are green at once on one build, with the battery green twice.** (d) P1, P5 and P10 also pass in Robert's own playtest. |

**Not in v1 (on purpose):** VR and mobile (after v1, VR first), Alaska and Hawaii, the Version 2 maker layer beyond the four
green-lit lanes (WEB_DEPTH_PLAN §10), and the room-scan base (parked).

**Approved by Robert 2026-10-30** (numbers as written; dates removed: "not important, we need goals for the game"; the ten game goals P1-P10 added).
