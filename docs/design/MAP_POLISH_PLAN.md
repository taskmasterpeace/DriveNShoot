# MAP POLISH PLAN — Exits, Corridors, Alligator Alley, Maple Hill

**Date:** 2026-07-07
**Owner ask:** "polish the map — extensive plan — the exits and all that — Alligator Alley in South Florida — Maple Hill in North Carolina, secluded — different towns that have stuff that they gotta do."
**Builds on:** `docs/design/LOOT_NPC_PRODUCTION_WANTED_SPAWN.md` (§3 tiers, §4 buildings, §8 production, §11.4 zone tags), `docs/design/POPULATION_WAR.md` §3.1 (cells/zone_tag), `game/data/usmap.json` (ground truth), `tools/mapforge/server.mjs` (execution API), `docs/DIVIDED_STATES.md` (ruler flavor)
**Ground truth today:** 10 named interstates, **1 exit total** (`I-95_X1 MERIDIAN`, T3 county_seat), 1 authored town (Meridian), 17 structure profiles created-not-placed, `population_targets.json` has 7 zone_tag rows waiting for content to sit in them.

---

## 1. Overview

DRIVN's map is a skeleton: ten named interstates with real geography, real danger ratings, real nicknames — and almost nothing along them. One exit exists on the entire 150×85-cell map. This plan is the flesh: a repeatable **exit placement rhythm** for every major interstate, a **named-town roster** where every T2+ community has a real economic job wired to the loot/NPC spec, and two owner-named signature stretches — **Alligator Alley** (South Florida, I-75's southern run, the scariest road in the DSOA) and **Maple Hill** (North Carolina, deliberately off the interstate, a secluded reward for curiosity). Everything here is placed through MapForge's REST API in a fixed execution order so an executor agent can run it start to finish without design judgment calls.

## 2. Player Fantasy

Driving should feel like **the country has a pulse again, and it gets more dangerous the less anyone is watching.** Near a county seat, the road promises fuel, a sheriff, a market — pull over and something useful happens. Between towns, the exits thin out and the risk rating climbs. Crossing into occupied Florida, a checkpoint makes the player *feel* an occupied border for the first time — a real law profile, not scenery. Alligator Alley should be the stretch players warn each other about on the CB: swamp on both sides, a gator that comes off the water fast enough that headlights don't save you, drones that stop reporting back once the canopy closes. Maple Hill should be the opposite fantasy: a rumor on the radio, a hand-painted sign at a spur nobody drives past, and a town that rewards the player for leaving the interstate — self-sufficient, wary, and quietly better-stocked than anything on I-95.

## 3. Detailed Rules

### 3.1 THE CORRIDOR PASS

**The ten interstates that exist today** (from `usmap.json`, all currently exit-less except I-95):

| Highway | Nickname | Danger | Family | Approx. length (endpoint sum, km) | States crossed (start→end) |
|---|---|---:|---|---:|---|
| I-95 | THE CRIMSON MILE | 3 | crimson_road | ~34 | MA→ME border area → down to FL (Miami) |
| I-90 | THE LONG COLD | 1 | federal_remnant | ~57 | WA → MA (coast to coast north) |
| I-80 | THE GAUNTLET | 2 | crimson_road | ~57 | CA/OR area → NY |
| I-70 | THE TOLLWAY (toll 8) | 1 | corporate_corridor | ~42 | UT/CO → MD |
| I-40 | THE BONE ROAD | 2 | free_counties | ~57 | AZ → NC |
| I-10 | THE FURNACE RUN | 2 | crimson_road | ~53 | CA → FL |
| I-5 | THE PRODUCE LINE | 1 | green_belt | ~29 | WA → CA |
| I-35 | (unnamed) | 1 | free_counties | ~34 | ND → TX |
| I-25 | (unnamed) | 1 | free_counties | ~19 | MT → NM |
| I-75 | THE PREACHER PIKE | 2 | federal_remnant | ~46 | MI → FL (Miami) |

This plan places new exits on **I-95, I-75, I-40, I-10, and I-90** (the five touching Meridian's region, Florida, North Carolina, and the two coast-to-coast anchors). The other five (I-70, I-5, I-35, I-25, I-80) get their own corridor pass in a follow-up doc — scope discipline, not all ten at once.

**The rhythm formula.** Real seconds of driving between stops depends only on real distance and the vehicle's real speed — the "60×" compression is spatial (the *world* is built at 1/60th scale so that a drive that would take 4 real hours across actual America now covers ground in 4 real minutes of play), not a second clock multiplied on top of gameplay pacing. Do not apply the 60× factor twice.

```
CRUISE_MPS = 24.0            # assumed sustained average speed (not top_speed);
                              # accounts for curves, AI encounters, town slow-zones.
                              # scavenger.top_speed = 34.0 m/s (vehicles.json) is the ceiling;
                              # 24.0 m/s (~86 km/h) is what a player actually holds on a real drive.

target_T1_gap_s  = 45 to 90        # seconds between roadside stops (the sawtooth breath)
target_T1_gap_m  = CRUISE_MPS * target_T1_gap_s   =  1,080 m  to  2,160 m
target_T1_gap_cells = target_T1_gap_m / cell_m(500)  =  ~2.2 to ~4.3 cells

target_T2_gap_km = 4 to 10 km   (every 3-5 T1s; ~3-7 real-minutes apart)
target_T3_gap_km = 15 to 25 km  (one per state border crossing or major junction; every 10-17 real-minutes)
```

**Worked example:** a 46 km run (I-75, MI→FL total length) at CRUISE_MPS=24.0 takes `46,000 / 24 = 1,917s ≈ 32 real minutes` end to end. At the T1 rhythm (45-90s), that run should carry **21-43 T1-tier stops** if it were T1-only; real corridors mix tiers, so the actual per-highway exit count (below) is lower because T2/T3 stops replace several T1 slots along the way.

**Exit count per highway** (this plan's placement budget — the number of `/api/exits` POSTs per highway):

| Highway | Length (km) | T1 (roadside) | T2 (hamlet/spur) | T3 (county seat) | Total new exits |
|---|---:|---:|---:|---:|---:|
| I-95 | 34 | 6 | 2 | 1 (already have Meridian) | 8 new (+1 existing) |
| I-75 | 46 | 7 (incl. Alligator Alley's 3, §3.3) | 2 | 1 (checkpoint counts as T1 risk-marker, not a full T3) | 9 new |
| I-40 | 57 | 8 | 2 (incl. Maple Hill spur origin, §3.4) | 1 | 10 new (+1 spur, not an exit node) |
| I-10 | 53 | 7 | 2 | 1 | 9 new |
| I-90 | 57 | 8 | 2 | 1 | 10 new |
| **Total this plan** | | **36** | **10** | **4** (+1 existing) | **~46 exit nodes** |

**Archetype variety rule: no two adjacent exits on the same highway share an archetype.** The 7 archetypes (`data/world/exit_blueprints.json`): `service`, `neighborhood`, `county_seat`, `industrial`, `metro`, `military_spur`, `dead`. Placing exit N: its archetype must differ from exit N-1 on the same `highway_id`. Enforcement: check `GET /api/exits` for the highway's last exit before each `POST`; if the tier-appropriate roster would repeat, insert a `dead` exit (T1, danger 4, no structures — a burned-out ramp) to break the streak.

**Risk_rating gradient rule:** `risk_rating` (an override on top of the archetype's base `danger`) scales by proximity to a T3 county seat and by state occupation status:

```
risk_rating = clamp(archetype.danger + proximity_penalty + occupation_penalty, 0, 5)

proximity_penalty = -1  if within 2 exits of a T3 county seat (safer near the seat of law)
                   =  0  otherwise
                   = +1  if more than 5 exits from any T3 on the same highway (the deep stretch)

occupation_penalty = +1  if the exit's state is under a hostile-faction takeover
                        (world_state.controller_of(state) != "free_counties", e.g. occupied FLORIDA)
                   =  0  otherwise
```

Example: a `service` exit (base danger 1) two exits from Meridian in free-standing Virginia → `1 + (-1) + 0 = 0`, clamped to floor `0` (readable as "safe roadside stop"). The same archetype six exits deep into occupied Florida → `1 + 1 + 1 = 3` (a real gut-check before pulling in).

### 3.2 TOWNS WITH PURPOSE

Every T2+ community gets exactly one **primary purpose** mapped to a production chain or civic function from `LOOT_NPC_PRODUCTION_WANTED_SPAWN.md`. A purpose names the `structure_profiles.json` ids that must exist at the community, and which production chain (§8 of that spec) it participates in.

| Purpose | Structure ids (from `structure_profiles.json`) | Production/chain hook |
|---|---|---|
| Farm town | `house_small` ×N, `market_general`, a new `farmhouse`/`processing_plant`/`warehouse` row (not yet in the catalog — flagged in §6 Phase 2) | `corn_chain_basic` (§8.1/8.2 of the spec) — grow/process/package/distribute |
| Fuel depot | `gas_station_small`, `auto_shop`, `warehouse` | fuel production/distribution (a fuel-analog chain, same shape as corn: field→depot→truck→market) |
| Law seat | `courthouse`, `police_station`, `market_general` | no chain — civic anchor; the T3 "county_seat" archetype's default building set |
| Faith mission | `church_small`, `house_small` ×2 | Faith Bloc faction override hooks (§4.1's `faction_overrides` on `church_small`: `faction_identity`, `propaganda`) |
| Market crossroads | `market_general`, `diner_roadside`, `motel_strip` | destination node for multiple chains (a demand sink, not a supply source) |
| Salvage yard | `junkyard`, `auto_shop` | scrap/parts supply chain (feeds `auto_shop` NPC jobs, `mechanic`/`apprentice`) |
| Kennel town | `house_small` ×2, a new `kennel` structure row (not yet in the catalog — flagged §6 Phase 2) | dog economy (bond/breed system, `dog.gd`) — no production chain, a service node |

**Named communities (14 across the map)**, state, tier, purpose, one-line flavor:

| # | Name | State | Tier | Purpose | Flavor |
|---|---|---|---|---|---|
| 1 | **MERIDIAN** | VIRGINIA | T3 | Law seat *(existing, unchanged)* | The one town that already stands — home base, no takeover, Bridger's Council keeps the lights on. |
| 2 | **ROSEWOOD** | VIRGINIA | T3 | Farm town | The corn slice's real geography (§3.2.1): silos on the ridge, a plant that never fully stopped smoking. |
| 3 | **HOLLOWPOINT** | VIRGINIA | T2 | Salvage yard | A T1 chop-shop that grew a fence and a name; every panel on every car here came off a wreck on I-95. |
| 4 | **FAIRWEATHER CROSS** | NORTH CAROLINA | T2 | Market crossroads | Where three spurs meet under King Sawyer's tax men — pay the toll or take the long way. |
| 5 | **MAPLE HILL** | NORTH CAROLINA | T2 | Salvage yard + farm loop (self-sufficient, §3.4) | Off the interstate on purpose. Nobody advertises it, and that's the point. |
| 6 | **BRAGG'S SHADOW** | NORTH CAROLINA | T3 | Law seat | King Sawyer's garrison town outside the old airborne base — the only checkpoint that isn't Faith Bloc. |
| 7 | **PEACH COMBINE DEPOT** | GEORGIA | T3 | Fuel depot | CEO Marrow's syrup trucks run on diesel, and this depot keeps every one of them moving. |
| 8 | **LOWCOUNTRY LANDING** | GEORGIA | T2 | Faith mission | The Faith Bloc's forward pulpit before the Florida line — converts or turns away, never both. |
| 9 | **SAINT REGIS CHECKPOINT** | FLORIDA | T1 (checkpoint, not full T2) | Law seat (occupation) | The state-line gate the brief calls for (§3.3) — `faith_occupation_law` starts here, not at the water. |
| 10 | **COTTONMOUTH FUEL & BAIT** | FLORIDA | T1 | Fuel depot | Stilts over black water, a generator that's louder than the frogs, and a scavenger's honest gas price. |
| 11 | **THE DRY DOCK** | FLORIDA | T2 | Market crossroads (airboat trading post, §3.3) | Half boat ramp, half black market — nobody asks how you got here without wet tires. |
| 12 | **REEF FLEET WHARF** | FLORIDA | T3 | Law seat / market | The Admiral of the Reef Fleet's last honest port before the Faith Bloc's writ runs out to sea. |
| 13 | **QUARTERMASTER'S REST** | KANSAS *(I-90/I-70 anchor, west leg)* | T2 | Fuel depot | Chief Quartermaster Vale's supply cache for anything still driving the plains. |
| 14 | **RAIL YARD SEVEN** | ILLINOIS *(I-90 anchor, near Chicago)* | T3 | Salvage yard + law seat | The Rail Baron's scrapping ground, half junkyard, half checkpoint — everything that dies on I-90 ends up here. |

**Corn Route slice — real geography (this is the LOOT_NPC spec's MVP slice, given a home on the map):** **Rosewood Farms** (community #2, ROSEWOOD, VIRGINIA T3) grows and packages corn; the destination market is **Meridian's** existing `market_stall` placement (community #1, ~14 km down I-95 from Rosewood at CRUISE_MPS = ~10 real-minute drive — inside the T2/T3 gap band). This gives the box-truck route (`route: "I-95_Rosewood_to_Meridian"`) real coordinates instead of placeholder ids.

### 3.3 ALLIGATOR ALLEY (owner-named)

**Highway/segment:** the southern run of **I-75** ("THE PREACHER PIKE," danger 2) — the last three waypoints of its `pts` array, `[-7500,6500] → [-5000,16750] → [-2000,20500]`, crossing Georgia into Florida and terminating at Miami. I-75's own southernmost leg — the closest analog to the real Alligator Alley (I-75/Everglades) on our existing network; no new highway invented.

**Swamp biome band:** paint a corridor of `swamp` (`s`) cells straddling this leg, matching the real swamp band already visible in `usmap.json`'s southern Florida rows (~rows 62-84 show heavy `s` in the `H`/FLORIDA region) — this plan widens/connects that band along the I-75 corridor via `POST /api/paint {biome:"swamp", cells:[...]}`, a ~3-cell-wide ribbon along the three waypoints.

**Zone_tag:** cells along this stretch get `zone_tag: "swamp"` (defined in `POPULATION_WAR.md` §3.1), which per §11.4 desires `gators/wildlife, cult scouts, drones fail chance` — this plan is the first content to *populate* that row (its numeric desired_pop is missing from `population_targets.json`'s 7 rows — new row added in §6 Phase 5).

**3 exits** (part of I-75's 9-exit budget in §3.1's table):
1. **COTTONMOUTH FUEL & BAIT** — T1, archetype `service`, stilts over water, risk_rating 2 (mid-alley, no nearby T3 to lower it).
2. **THE DRY DOCK** — T2, archetype `neighborhood` (airboat trading post — `market_general` + a new `dock` interior flavor on the existing footprint, no new structure row required), risk_rating 2.
3. **A flooded ghost exit** — T1, archetype `dead` (per §3.1's variety rule, this breaks up two `service`/`neighborhood` picks in a row), risk_rating 3 — the off-ramp itself is half-submerged; `structures_hint: []` means nothing spawns here except atmosphere and a wreck.

**THE GATOR — quadruped-rig actor row.** Built on the existing `ProtoQuadruped` puppet (`game/proto3d/quadruped.gd`) — the same box-rig class dogs, howlers, and lurkers already wear, extended with a **low, long, lunge-from-water** silhouette and behavior, not a new rig class:

| Param | Value | Rationale |
|---|---|---|
| `scale` | 1.4 | Bigger than a dog's 1.0 baseline — reads as a real threat silhouette. |
| `tail` | 0.9 (vs. dog's ~0.3) | A gator's tail is most of its body length; also gives the existing tail-as-mood-readout system (thrash speed = aggression) a natural home. |
| `snout` | true, elongated proportions via a wider/flatter head box scale on instantiation | The one visual tell that reads "gator" not "dog" at a glance from the driver's seat. |
| `ears` | false | Gators don't have visible ears; also frees up silhouette read time. |
| `color` | dark olive-black, `Color(0.18, 0.22, 0.15)` | Blends with the swamp-water color already used in `world_stream.gd`'s swamp scatter (`Color(0.14, 0.22, 0.20)`), so a stationary gator visually hides until it moves — the fear point of the whole encounter. |

**Behavior sketch** (new state layered on top of the quadruped's existing `air_target`/`leap` MOTION row — the gator is the second consumer of the leap pose that dogs already use for JUMP/POUNCE):
- **AMBUSH state (default):** the gator sits submerged/still at a fixed water-adjacent spawn point (never wandering — this is a stationary hazard, not a roaming threat, consistent with `POPULATION_WAR.md`'s "never spawn in player view" rule since it's already placed before the player arrives, not popped in).
- **TRIGGER:** player or NPC crosses within a lunge radius (tuning knob, default 6.0m) OR lingers within a wider detection radius (default 14.0m) for more than 2.0s (a gator that reacts instantly to a fast pass-by would feel unfair; a lingering target — someone stopped at Cottonmouth's fuel pump — earns the punish).
- **LUNGE:** reuses `air_target = 1.0` (the quadruped's existing leap pose — front legs reach, head up) driven fast and short (a 0.4s launch, much quicker than a dog's arcing jump) covering the lunge radius in one motion; on landing, a bite check (melee scan, reusing the existing wall-law/combatant-union melee resolution `weapon.gd` already provides — no new combat path).
- **RECOVER:** after a lunge (hit or miss), a forced 4.0s cooldown crawling back toward the water's edge before it can ambush again — this is the player's counterplay window (gun it past, or shoot it while it's grounded and slow).
- **Drone-fail hook:** per §11.4's swamp row, a scout drone (`drone.gd`) flying this stretch has an elevated chance (tuning knob, default 25%, vs. baseline drone loss chance elsewhere) of losing signal/crashing over the swamp band — this reuses the drone's existing shoot-down-able/recharge-loop machinery, just with a biome-weighted failure roll added at route-scan time, not a new mechanic.

**Faith Bloc checkpoint at the state line:** placed at **SAINT REGIS CHECKPOINT** (community #9, §3.2's roster), positioned at the Georgia/Florida border crossing of I-75 (the first cell where `states_grid` flips from `I` (GEORGIA) to `H` (FLORIDA) along I-75's path). This ties directly into the **already-implemented** law/faction system: `world_state.controller_of("FLORIDA")` returns `"broadcast_church"` after `TAKEOVER_DAYS` (4 in-game days, `world_state.gd:13`), and `active_laws["FLORIDA"] = "faith_occupation_law"` drives `contraband_in()` (proven in `law_profile_sim.gd`) — this plan does not invent a new law hook, it places the **existing** checkpoint archetype (`checkpoint_road` structure, `law_hooks: ["contraband_search","toll","arrest"]`) at a real coordinate so the mechanic has a body. Player fantasy: the scariest stretch of road in the south starts with a border crossing that actually flags your trunk.

### 3.4 MAPLE HILL, NC (owner-named)

**Deliberately off the interstate.** Maple Hill is not an exit node on any highway — it is a **spur road** branching from I-40 (danger 2, "THE BONE ROAD," the interstate whose eastern points already run through North Carolina per its `states_grid` path) via the executor's existing `pointAlong`/off-ramp machinery, but built as a longer, winding non-highway road (`kind: "exit"` road row, multiple intermediate `pts` rather than a straight two-point ramp — the "winding, forested" character comes from adding 3-4 waypoints instead of MapForge's default 2-point ramp).

**Spur origin:** branches off I-40 near its NC-crossing waypoints (`[-14750,4250]` region, per `usmap.json`'s I-40 `pts`), extending several kilometers off the highway to a hidden anchor point — far enough that it will not appear as a numbered exit sign on the interstate itself (no `EXIT-` sign row placed on I-40 for this spur; discovery is earned, not advertised — see below).

**Hidden T2 hamlet:** MAPLE HILL (community #5 in §3.2's roster), tier T2, purpose = self-sufficient salvage-yard-plus-farm-loop (a smaller-scale echo of the corn chain — its own tiny `farmhouse`→`market_general` loop that never ships product OUT to other towns, consistent with "self-sufficient," distinct from Rosewood which explicitly exports).

**Self-sufficient production loop:** unlike Rosewood's export chain (§3.2), Maple Hill's chain has `distribute: "local_only"` — it grows/processes for its own `house_small` population and stops there. This is the mechanical definition of "self-sufficient": the production chain row exists (§6 Phase 2/3 data work) but has no `shipments.json` entry ever generated for it, so it never appears on the road as a truck the player can rob — the only way to interact with Maple Hill's economy is to physically go there.

**Wary-but-fair community flavor:** structure-level flavor hook via `faction_overrides` on its buildings (existing mechanism, no new system) — prices are fair (no gouge multiplier) but NPC dialogue/reputation gain rate is slower here than at a T3 law seat (a design intent flag for the dialogue-writing pass, not a new formula this doc needs to specify).

**Discovery-rewarded:**
- **Radio rumor breadcrumb:** a new row in `ProtoRadio.LORE` (`radio.gd`'s existing `LORE: Array` — the same array the "lore" signal already draws from, no new signal type): `"…heard the Bone Road's got a turn nobody marks. Maple Hill, they call it. Good people, if you find it…"` — reuses the existing weighted-signal delivery (`ProtoRadio._deliver("lore")`), night_mult unchanged, no new probability math.
- **A landmark sign:** a placed structure (using the existing `placements` array, not a new structure type) at the spur's mouth on I-40 — a small `sign_glyph`-bearing marker object (reusing the `checkpoint_road`-style small-footprint category, but with `enterable: false` and no law hooks — purely a wayfinding prop) so a player who actually looks at the road (not just the GPS/exit list) can find the turn.

**Higher-value rare loot table nod:** Maple Hill's `market_general`/`house_small` containers roll against `cache_rare` (the existing loot-table tier already defined in `structure_profiles.json`, currently reserved for `police_station`/`courthouse`/`warehouse`/`military_base_shell`) instead of the T2-default `chest_common` — a design override on this specific community's structure instances (a per-placement `loot_table` override field, not a new tier), rewarding the drive out here with genuinely better loot than the interstate offers at the same tier.

### 3.5 ZONE TAGS → CELLS

Mapping table from map features (biome/road/structure context) to `population_targets.json`'s zone rows (`POPULATION_WAR.md` §3.1, §11.4):

| Map feature | zone_tag | Existing row? | Notes |
|---|---|---|---|
| Any cell on/adjacent to an interstate `pts` polyline | `road_shoulder` | Yes (row exists) | Applies along all five corridors this plan touches. |
| `forest`/`scrub` biome cell, no road within 1 cell | `thick_forest` | Yes | Default for off-road forest cells, incl. Maple Hill's approach outside the spur itself. |
| `farmland` biome cell adjacent to a T2+ community | `house_field` | Yes | Rosewood's and Maple Hill's farm rings. |
| `swamp` biome cell | `swamp` | **No — new row needed** (currently absent from the 7-row `targets` object in `population_targets.json`; §11.4 defines its desired spawns qualitatively but no numeric row exists yet) | Required for Alligator Alley (§3.3) to actually populate gators/wildlife/cult scouts. Proposed row: `{"civilian":0,"worker":0,"threat":4,"law":0,"faction_troops":0}` — threat-heavy, matching §11.4's swamp flavor; the gator itself is a bespoke placed actor (§3.3), not a `threat`-group refill spawn, so this count covers ambient wildlife/cult scouts only. |
| `urban` biome cell within a T3+ community's authored zone | `suburbs` | Yes | Bragg's Shadow, Reef Fleet Wharf, Rail Yard Seven. |
| Cell containing a `warehouse`/`auto_shop`/`junkyard` placement | `industrial` | Yes | Hollowpoint, Rosewood's warehouse, Rail Yard Seven. |
| Cell within `SAFE_BUBBLE_M` (18.0) of the SAFEHOUSE anchor or a future home base | *(protected flag, not a zone_tag)* | N/A | Existing suppression rule — no new work, confirmed in POPULATION_WAR §3.1. |
| Cell containing `checkpoint_road`/`military_base_shell` | `military_perimeter` | Yes | Saint Regis Checkpoint. |
| Any cell in occupied FLORIDA once `TAKEOVER_DAYS` triggers | *(no zone_tag change — `controlling_faction` field flips, per POPULATION_WAR §3.1's cell schema)* | N/A | The cell's `zone_tag` stays what its terrain says; only `controlling_faction` on the `PopulationCell` row changes. This plan does not need a new tag for "occupied" — that's already a separate field. |

## 4. Formulas

All formulas are collected here for reference; each is derived and justified in place above.

**F1 — Rhythm formula (§3.1):**
```
target_T1_gap_m = CRUISE_MPS * target_T1_gap_s
CRUISE_MPS = 24.0                      # tuning knob, §7
target_T1_gap_s ∈ [45, 90]             # tuning knob, §7
→ target_T1_gap_m ∈ [1,080, 2,160]     # meters
→ target_T1_gap_cells ∈ [2.16, 4.32]   # at cell_m = 500.0
```
Example: at CRUISE_MPS=24.0 and a 60s target gap, exits should land every `24 * 60 = 1,440 m` (≈ 2.9 cells).

**F2 — Risk rating gradient (§3.1):**
```
risk_rating = clamp(archetype.danger + proximity_penalty + occupation_penalty, 0, 5)
proximity_penalty = -1 if within 2 exits of nearest T3 same-highway, else (+1 if >5 exits from any T3, else 0)
occupation_penalty = +1 if state's controller != "free_counties", else 0
```
Example (worked in §3.1): base 1, near-T3 → `1 - 1 + 0 = 0`. Deep + occupied → `1 + 1 + 1 = 3`.

**F3 — Corridor exit budget (§3.1 table derivation):**
```
total_exits_on_highway ≈ (length_km * 1000 / target_T1_gap_m_avg) adjusted down for T2/T3 substitution
target_T1_gap_m_avg = (1,080 + 2,160) / 2 = 1,620 m
```
Example: I-95 at 34 km → `34,000 / 1,620 ≈ 21` raw T1-only slots; the actual plan places 8 new (6 T1 + 2 T2, Meridian already covers the T3 slot) because T2/T3 tiers deliberately consume several T1 slots' worth of driving time each (a T2 hamlet is a longer stop, not a drive-by) — this is a **design choice to keep the map buildable in one pass**, not a hard formula; F3 sets the ceiling, the table in §3.1 sets the actual budget below that ceiling.

## 5. Edge Cases

- **A T1 exit would land inside another community's authored zone (e.g., near Meridian's `authored_zones` rect `[-60,-440,280,900]`).** Rule: skip that placement slot entirely rather than overlapping; the next exit along the highway absorbs the gap (its `risk_rating` proximity bonus from being near a T3 already accounts for the shorter-than-formula gap).
- **Two highways cross or run parallel within 2 cells of each other (no such case exists among the five corridors in this plan, but a future corridor pass could create one).** Rule: exits are owned per-`highway_id` and never shared; a shared physical junction gets two separate exit nodes with different ids, one per highway, even if their `pos` values are near-identical.
- **The archetype-variety rule (§3.1) runs out of untried archetypes in a short highway stretch (e.g., only `service`/`neighborhood`/`county_seat` make sense for T1-T3 in a rural corridor, and three in a row would need a fourth distinct pick).** Rule: `dead` is always a legal filler (defined for exactly this purpose — atmosphere, no structures) and does not need to make narrative sense every time; a highway is allowed long dead stretches.
- **Maple Hill's spur road crosses water or a swamp cell on its way off I-40.** Rule: per the existing engine convention noted in MapForge's own guardrails ("roads crossing water become bridges automatically in-game"), no special-casing needed — the spur simply routes through; if this produces an unwanted bridge visual on a "hidden, winding" road, the executor should re-route the spur's intermediate waypoints to avoid the water cell rather than fight the bridge auto-behavior.
- **A player reaches Alligator Alley before Florida's `TAKEOVER_DAYS` threshold has passed (i.e., before day 4, when `controller_of("FLORIDA")` is still `"free_counties"`).** Rule: Saint Regis Checkpoint still physically exists and still functions as a `checkpoint_road` structure (toll/search hooks are generic, not Faith-Bloc-exclusive), but `contraband_in("FLORIDA", ...)` returns empty and the checkpoint reads as a normal free-counties toll stop, not an occupation gate — this is the correct, already-proven behavior per `law_profile_sim.gd`'s state-flip test; this plan places the checkpoint once and the *law* changes under it, not the structure.
- **The gator's lunge trigger fires on an NPC (not the player) — e.g., a motorist or a shipment driver from `LOOT_NPC_PRODUCTION_WANTED_SPAWN.md` §7 passing through.** Rule: the lunge radius check is actor-agnostic (any `Damageable`/combatant-tagged body in radius), consistent with the existing melee wall-law's "scans combatant∪threat" union — an NPC convoy losing a driver to a gator is a valid, desired emergent event (feeds the shipment-interception story beats in the LOOT_NPC spec), not an edge case to prevent.
- **Two named communities end up within `target_T2_gap_km`'s lower bound of each other by coincidence of the highway's existing `pts` geometry (e.g., Lowcountry Landing and Saint Regis Checkpoint are both near the GA/FL line).** Rule: this is acceptable and intentional here — a faith-mission-then-checkpoint pairing at a contested border is a deliberate narrative beat (convert-or-be-stopped), not a spacing bug; the rhythm formula (F1) governs T1 roadside spacing, not narrative-adjacent T2/T3 pairs.
- **`population_targets.json`'s new `swamp` row (§3.5) would spawn ambient wildlife/cult-scout `threat` group actors literally on top of the placed, bespoke gator actors from §3.3.** Rule: the gator is placed via `placements`/a bespoke spawn call, tagged distinctly from `pop_group: "threat"` refill actors (it is not counted in any cell's `current_pop`), so the two systems never double-spawn the same entity; the `swamp` zone_tag's refill only ever produces ambient wildlife/cult scouts, never a second gator at the same spot.

## 6. Dependencies

- **Upstream (this plan reads from, does not modify):** `game/data/usmap.json` (roads/towns/exits/placements arrays — the executor writes here via MapForge, but the *schema* is owned by the World Structures spec); `game/data/world/exit_blueprints.json` (the 7 archetypes — this plan uses them as-is, proposes none new); `game/data/world/structure_profiles.json` (the 17 existing structure rows — this plan references them by id, adds zero new rows in Phase 1, flags 2 candidate new rows — `farmhouse_field`, `kennel_small` — for Phase 2); `docs/design/LOOT_NPC_PRODUCTION_WANTED_SPAWN.md` (community tiers §3, building purposes §4, production chains §8 — this plan is the geographic instantiation of that spec's abstractions); `docs/design/POPULATION_WAR.md` (`zone_tag` vocabulary §3.1, cell schema — this plan's §3.5 table is additive to that system, adding one new `swamp` row); `game/proto3d/world_state.gd` (the FLORIDA/`broadcast_church` takeover timeline — this plan's Faith Bloc checkpoint depends on `TAKEOVER_DAYS`/`controller_of` existing exactly as proven in `law_profile_sim.gd`, and must not duplicate that logic); `game/proto3d/quadruped.gd` (the gator is a parameterized instance of `ProtoQuadruped`, not a new rig class); `game/proto3d/radio.gd` (Maple Hill's rumor is a new `LORE` array entry, reusing the existing "lore" signal path).
- **Downstream (systems that must be told about what this plan adds — bidirectional per the design-docs rule):**
  - `docs/design/POPULATION_WAR.md` should gain a note that `population_targets.json` picks up a `swamp` row from this plan (§3.5), and that placed/bespoke actors (the gator) are explicitly excluded from `current_pop`/`desired_pop` counting — a rule POPULATION_WAR's spec does not currently state and should, to prevent a future contributor from double-counting a placed actor against a cell's threat budget.
  - `docs/design/LOOT_NPC_PRODUCTION_WANTED_SPAWN.md` should gain the Rosewood→Meridian corn route as its **named MVP slice geography** (§15 of that spec currently describes the corn route abstractly with no map coordinates) — once Phase 3 (§6 below) lands the actual `production_chains.json`/`shipments.json` rows, that spec's own doc should be updated to point at these two real places instead of leaving them placeholder.
  - `game/data/world/structure_profiles.json` gains 2 new candidate rows in Phase 2 (`farmhouse_field` for Rosewood/Maple Hill's grow-site, `kennel_small` for a future kennel-town pass) — these are catalog additions, not placements, consistent with the "created ≠ placed" discipline already established by the §9 JOB rule.
  - `docs/DIVIDED_STATES.md` is not modified by this plan (ruler flavor is used as-is: Bridger's Council/VIRGINIA, King Sawyer/NORTH CAROLINA, CEO Marrow/GEORGIA, Admiral of the Reef Fleet/FLORIDA pre-takeover, Chief Quartermaster Vale/KANSAS, Rail Baron/ILLINOIS) — but the lore bible's Florida entry ("The Swamp Kingdoms — Gator Barons") is the flavor source for the Reef Fleet Wharf/Dry Dock naming and should be treated as canon-compatible, not contradicted, by anything placed here.
- **Sibling systems this plan does not touch but assumes are stable:** the melee wall-law (`weapon.gd`) that the gator's bite reuses; the drone's shoot-down/recharge loop (`drone.gd`) that the swamp drone-fail hook layers onto; the `checkpoint_road` structure's `law_hooks` (already wired, proven in `law_profile_sim.gd`).

## 7. Tuning Knobs

| Knob | Default | Range | Category | Affects |
|---|---:|---|---|---|
| `CRUISE_MPS` | 24.0 m/s | 18.0 - 30.0 | curve | The rhythm formula's entire basis (F1) — raising it spreads exits farther apart for the same time-gap feel. |
| `target_T1_gap_s` (low/high) | 45 / 90 | 30-60 / 75-120 | feel | The sawtooth breath between roadside stops — tighten for a busier road, loosen for a lonelier one. |
| `target_T2_gap_km` | 4-10 km | 3-15 | feel | Hamlet spacing — how often a "real stop, not a drive-by" appears. |
| `target_T3_gap_km` | 15-25 km | 10-40 | gate | County-seat spacing — the safety-net rhythm; too tight removes danger, too loose removes the sawtooth's "relief" beat. |
| `risk_rating` proximity bonus/penalty | -1 / 0 / +1 | fixed 3-step | curve | How sharply risk drops near law and rises in the deep stretch. |
| `risk_rating` occupation penalty | +1 | 0-2 | gate | How much an occupied state's checkpoints/patrols should punish underprepared players; raising to 2 makes occupied Florida meaningfully harder than free states. |
| Gator lunge radius | 6.0 m | 4.0-10.0 | feel | How close is "too close" — smaller reads as more forgiving/skill-based, larger reads as a hazard zone. |
| Gator detection/linger radius | 14.0 m | 10.0-20.0 | feel | How far away lingering (not passing) draws the ambush. |
| Gator lunge launch time | 0.4 s | 0.25-0.6 | feel | Reaction-time fairness — too fast reads as cheap, too slow removes the fear. |
| Gator recover cooldown | 4.0 s | 2.0-8.0 | curve | The counterplay window's length after a lunge. |
| Drone-fail chance (swamp) | 25% | 10-40% | gate | How often Alligator Alley denies the player's scout-drone crutch — the "scariest road" fantasy leans on this being noticeably higher than baseline. |
| Maple Hill loot_table override | `cache_rare` | `chest_common` \| `cache_rare` | gate | The size of the "reward for leaving the interstate" — could be dialed back to `chest_common` with a lower drop-rate bonus instead if `cache_rare` proves too generous relative to its T2 tier. |
| Archetype-variety enforcement | strict (never repeat adjacent) | strict \| soft (allow after 1 `dead` filler) | gate | How mechanically enforced the "no two identical neighbors" rule is versus left as executor judgment. |

## 8. Acceptance Criteria

1. **Exit counts per corridor match §3.1's table exactly:** `GET /api/exits` filtered by `highway_id` returns 9 total for I-95 (8 new + Meridian), 9 for I-75, 10 for I-40 (spur excluded, it's not an exit node), 9 for I-10, 10 for I-90 — testable by a direct API count.
2. **No two adjacent exits on the same highway share an `archetype` field** — testable by sorting each highway's exits by `exit_number` and asserting no consecutive pair has equal `archetype`.
3. **All 14 named communities from §3.2's roster exist as rows in `usmap.json`'s `towns` array with correct `pos` (within the highway/spur geography described) and their purpose is derivable from at least one structure whose id is placed in their `authored_zones`/`placements`** — testable by `GET /api/towns` plus `GET /api/placements` filtered by proximity to each town's `pos`.
4. **Every T2+ community's primary purpose maps to at least one `structure_profiles.json` id named in §3.2's table** (or, for the 2 flagged-new rows, exists as a Phase-2-created catalog row before the community is considered "wired") — testable by cross-referencing each town's placements against `GET /api/structures`.
5. **Alligator Alley's 3 exits exist on `I-75`, within the `[-7500,6500]→[-2000,20500]` waypoint span, with a `swamp`-painted cell band along that stretch verifiable via `GET /api/grid?layer=biomes`** — testable by sampling `GET /api/cell?wx=&wz=` at 5 points along the span and asserting `biome == "swamp"` for at least 60% of samples within 1 cell of the road.
6. **Saint Regis Checkpoint exists at the Georgia/Florida `states_grid` boundary along I-75**, and a `law_profile_sim`-style check confirms `contraband_in("FLORIDA", [...])` is empty before day 4 and non-empty after — testable by running the existing `law_profile_sim` unmodified (this plan adds no new law code, only a placed structure) plus a coordinate check via `GET /api/cell?wx=&wz=` returning `state: "FLORIDA"` immediately south of the checkpoint's `pos` and `state: "GEORGIA"` immediately north.
7. **Maple Hill is NOT reachable via any `/api/exits` entry** (i.e., zero exit nodes list Maple Hill as their `dest`/`name`) — its only road connection is a `kind: "exit"` road row with 4+ intermediate `pts` branching from I-40, confirmed via `GET /api/roads` showing a road id distinct from any `_X#` exit-numbered id.
8. **A radio scan (`ProtoRadio.scan()`) can, over enough repeated calls, surface the new Maple Hill `LORE` line** — testable by seeding `rng` deterministically (per the sim-testing convention already used elsewhere in the codebase) and asserting the new line appears in the weighted rotation at least once across N scans matching its 1-in-6-ish share of the `LORE` array.
9. **Drive-through timing matches the rhythm formula within tolerance:** driving the Scavenger at a controlled, sustained ~24 m/s along any of the 5 corridors' T1-only stretches produces exit-to-exit real-time gaps within the `target_T1_gap_s` [45,90] band ±15% for at least 80% of consecutive T1 pairs — testable via a headless drive-sim harness (following the existing `--headless` sim convention, inputs not teleports) logging exit-crossing timestamps.
10. **The new `swamp` row in `population_targets.json` exists with a `threat`-weighted count** and is confirmed distinct from the gator's placement (the gator does not appear in any cell's `current_pop["threat"]` count) — testable via a `population_cell_sim`-style assertion once Phase 5 (§6 below) lands.
11. **Risk rating gradient is provably monotonic** along at least one corridor: sampling `risk_rating` for all exits on I-75 in highway order shows values generally rising with distance from the nearest T3 and jumping up at the Georgia/Florida occupation boundary — testable by pulling `GET /api/exits` for `I-75` and checking the sequence against formula F2.

---

## Execution Order (for the executor agent)

Phase list with exact MapForge API calls and estimated row counts. Run `curl localhost:8899/api/help` first to confirm the server is live before Phase A.

**Phase A — THE CORRIDOR PASS (exits).** ~46 `POST /api/exits` calls total (per §3.1's table), one per exit, in highway order (start-to-end along each `pts` array) so the archetype-variety and risk-gradient rules can check "the previous exit" correctly. Payload shape per call:
```
POST /api/exits
{ "dest": [wx, wz], "name": "...", "archetype": "service|neighborhood|county_seat|industrial|metro|military_spur|dead",
  "highway_id": "I-95", "community_tier": "T1|T2|T3", "risk_rating": <computed via F2> }
```
Estimated new rows: 46 exit nodes (`map.exits`), ~46-92 ramp roads (each exit adds 1-2 `kind:"exit"` roads via `has_return_ramp`).

**Phase B — MAPLE HILL SPUR (not an exit node).** 1 `POST /api/roads` call with a multi-point winding `pts` array branching off I-40 near its NC waypoints, `kind: "exit"`, `danger` matching a forested spur (suggest 2). Estimated new rows: 1 road.

**Phase C — TOWNS.** 14 `POST /api/towns` calls (§3.2's roster minus Meridian, which exists) — `kind: "holdout"` for all per the DIVIDED_STATES renamed vocabulary, `pos` matching each community's placement on its highway/spur. Estimated new rows: 13 towns.

**Phase D — PLACEMENTS (buildings per purpose).** For each T2+ town, `POST /api/stamp_template` (using existing `hamlet`/`outpost`/`waystation` templates as a starting skeleton) followed by targeted `POST /api/placements` calls for purpose-specific structures named in §3.2's table (e.g., Rosewood gets an explicit `warehouse` and `market_general` placement beyond the generic template). Estimated new rows: ~5-8 placements per T2+ town × 13 towns ≈ 70-100 placements.

**Phase E — ALLIGATOR ALLEY DETAIL.** `POST /api/paint {biome:"swamp", cells:[...]}` tracing the I-75 southern band (§3.3); the 3 exits are already covered in Phase A but flagged here as a checkpoint — verify via `GET /api/grid?layer=biomes` that the paint landed before moving on. Estimated: 1 paint call covering ~30-50 cells.

**Phase F — STRUCTURE CATALOG ADDITIONS (data-row phase, not MapForge).** `POST /api/structures` for the 2 flagged new rows (`farmhouse_field`, `kennel_small`) if Rosewood/Maple Hill/a future kennel town need them beyond what the existing 17 cover. Estimated new rows: 2 structures.

**Phase G — POPULATION DATA ROW.** Direct edit to `game/data/population_targets.json`'s `targets` object, adding the `swamp` row (§3.5). Estimated new rows: 1 zone_tag row.

**Phase H — GATOR ACTOR ROW.** New data/code row for the gator's `ProtoQuadruped` parameters (§3.3's table) plus its ambush/lunge/recover state — this is the one piece of this plan that is genuinely new behavior, not a data-row-only change, and should be scoped as its own small implementation task handed to engineering with this doc's §3.3 as the spec. Estimated: 1 new actor type + its param row.

**Phase I — RADIO RUMOR ROW.** 1-line addition to `ProtoRadio.LORE` (`radio.gd`) — the Maple Hill breadcrumb (§3.4). Estimated: 1 array entry.

**Phase J — VERIFICATION.** Run `world_sim` (confirms streaming/world-state integrity is unbroken by the new roads/towns/placements) and a manual/scripted drive-through of at least I-95 and I-75 checking exit-crossing timestamps against the rhythm formula (Acceptance Criterion 9). Any headless drive-timing sim should follow the house convention: real input events over several `process_frame`s, a watchdog timer, `--import` run once for any new `class_name` script (the gator).

**Total estimated new rows across all phases:** ~46 exits, ~90 ramp roads, 1 spur road, 13 towns, ~85 placements, 2 structures, 1 population row, 1 actor type, 1 lore line — roughly **240 new data rows** plus one small new actor behavior, executable end to end through the MapForge API and two direct JSON edits (Phases F/G) without any engine-code changes beyond the gator (Phase H).
