# DRIVN / DSOA - Loot, NPC Society, Production Chains, Wanted Law, and Spawn Ecology Spec

**Date:** 2026-07-07  
**Purpose:** Turn buildings, furniture, NPCs, town jobs, production, police/wanted logic, and biome spawning into one standardized system that fits the Divided States world.

## 0. Executive Summary

DRIVN should not fill towns with random buildings and random NPCs. That will look alive for five minutes and then fall apart. The right model is this:

> **Every town is a machine. Buildings contain furniture. Furniture owns loot tables. NPCs have jobs. Jobs power town production. Production creates shipments. Shipments move on roads. Roads create opportunities for crime, ambush, trade, shortage, and law response.**

This gives every exit and town a reason to exist. A farm town can grow corn, process it, load it into a truck, and deliver it to nearby towns. If the player steals the truck, kills the driver, or blocks the route, the destination loses supply. Prices move. Hunger rises. The baron reacts. Guards get assigned next time. A bounty may go out.

That is the spine. Not decoration. Simulation.

## 1. Design North Star

The goal is to make every place readable, useful, and reactive.

A player should be able to understand a place from the outside:

- This is a farming town.
- This is a courthouse town.
- This is a military-adjacent town.
- This is a religious state border town.
- This is a highway service exit.
- This is a production town that supplies other towns.

The game should then back that up with systems:

- The furniture inside buildings matches the building purpose.
- The loot matches the furniture and local economy.
- NPCs behave according to local jobs.
- Trucks and patrols travel for a reason.
- Crime generates evidence, not magical police knowledge.
- Biomes and zone types affect wandering threats and sound.

## 2. Reference Models to Borrow From, Not Copy

### 2.1 Project Zomboid Reference: Cells, Respawn, Migration, and Unseen Time

Project Zomboid is useful because it does not need every zombie to be simulated everywhere all the time. The world has population expectations by area, respawn rules, unseen timers, and redistribution/migration behavior. Players report that even with respawn reduced or disabled, migration and meta events can make cleared areas feel alive again.

For DRIVN, the lesson is not "make zombies." The lesson is:

> **Use cells/chunks with desired population targets, unseen timers, migration/redistribution, and noise attraction.**

DRIVN version:

- A forest cell wants wildlife, strays, raiders, and hidden camps.
- A highway cell wants motorists, patrols, wrecks, hitchhikers, convoys, and ambushes.
- A town cell wants workers, civilians, guards, cops, traders, and criminals.
- A military perimeter wants patrol dogs, soldiers, cameras, drones, mines, fences, and warning signs.

Do not spawn enemies directly in the player's face. Let cells repopulate from edges, adjacent cells, roads, trails, and events.

### 2.2 GTA / GTA VI Reference: Wanted Systems Players Want

The strongest expectation around modern GTA-style policing is that police should not magically know everything instantly. Community discussion around GTA VI repeatedly focuses on witnesses, identity, vehicle recognition, police needing information, and more tactical response. None of that should be treated as confirmed GTA VI design. Treat it as player desire.

DRIVN should implement its own version:

- Crimes create evidence.
- Witnesses must see or hear something.
- Witnesses report descriptions, plates, clothing, vehicle type, dog, gunshots, or location.
- Police only know what was reported.
- Crossing a county or state line matters.
- Local wanted does not automatically become state wanted.
- Federal/interstate wanted exists for high-level crimes, fugitives, faction warrants, and bounty hunters.

This fits the Divided States premise better than GTA's universal stars.

## 3. World Structure Standardization

The world should be standardized from large to small:

```text
State
  Region
    Highway Corridor
      Exit
        Community
          District
            Building
              Room
                Furniture
                  Container
                    Loot Table
```

### 3.1 Community Tiers

Use four practical community sizes first.

| Tier | Name | Purpose | Required Content |
|---|---|---|---|
| T1 | Roadside Exit | Fast stop, fuel, loot, danger | gas station, restrooms, small store, parking, 1-2 houses or motel |
| T2 | Neighborhood / Hamlet | Residential survival, minor jobs | houses, small clinic, church/store, local workshop, small farm/yard |
| T3 | County Town | Law/economy hub | courthouse or town hall, police/sheriff, market, clinic, warehouse, job site |
| T4 | Metro District | Major city slice | hospital, police HQ, courthouse, monument, transit, faction office, dense blocks |

Military bases are not community tiers. They are special sites outside major cities or hidden off spurs.

## 4. Building Types and Required Furniture

Buildings must not be empty shells. Each building type needs a role, furniture set, NPC use pattern, loot tables, and law status.

### 4.1 Building Role Categories

| Building Type | Main Role | Example Furniture | Loot Flavor | NPC Use |
|---|---|---|---|---|
| House | shelter, food, personal loot | fridge, cabinets, beds, closets, bathroom | food, clothes, medicine, small cash, tools | civilians sleep, hide, gossip |
| Farmhouse | rural shelter, production node | pantry, tool rack, seed shelf, chest freezer | food, seeds, tools, fuel, shotgun chance | farmers, guards, family |
| Gas Station | fuel, road info, ambush risk | pumps, register, shelves, freezer, back office | fuel cans, snacks, maps, parts, cash | clerk, travelers, raiders |
| Police/Sheriff | law, weapons, evidence | desks, lockers, armory, holding cell, evidence room | ammo, guns, armor, records, keys | cops, prisoners, bounty contacts |
| Courthouse/Town Hall | authority, law, records | benches, clerk desk, archive, judge office | warrants, deeds, licenses, maps | mayor/baron, clerks, guards |
| Clinic/Hospital | healing, medicine | beds, cabinets, pharmacy, surgery room | meds, bandages, antibiotics, tools | doctors, wounded, desperate NPCs |
| Church | ideology, refuge, faction law | pews, altar, office, food closet | food, books, relics, donations | priest, cult, refugees |
| Warehouse | storage, shipments | pallets, crates, forklift, loading bay | bulk goods, parts, cargo manifests | workers, guards, drivers |
| Processing Plant | production conversion | conveyor, vats, packaging tables, loading dock | processed goods, chemicals, tools | workers, foreman, guards |
| Military Base | restricted power | fence, gate, barracks, motor pool, armory, comms | guns, ammo, armor, drones, vehicles | soldiers, dogs, drones |

### 4.2 Furniture/Container Categories

Furniture should drive loot. The player should learn the world.

- Fridge: perishables, drinks, medicine sometimes.
- Kitchen cabinet: canned food, utensils, lighter, batteries.
- Medicine cabinet: painkillers, bandages, prescriptions, hygiene.
- Closet: clothes, backpack chance, hidden cash, shoes.
- Desk: documents, keys, small cash, letters, cartridges, maps.
- Gun safe: firearms, ammo, cleaning kit, restricted by lock/law.
- Police locker: vest, baton, pistol ammo, uniform, cuffs.
- Evidence box: contraband, documents, confiscated weapons.
- Cash register: money, receipts, shop keys.
- Tool rack: wrench, scrap, car parts, fuel hose, battery.
- Pallet/crate: bulk production output, export goods, food stock.
- Truck cargo: shipment contents, manifest, seal, GPS route.

## 5. Loot Table System

The loot table must be layered. Do not make one flat global table.

### 5.1 Loot Resolution Order

When a container is opened, resolve loot in this order:

```text
State law profile
  + Faction control
  + Community tier
  + Building type
  + Room type
  + Furniture/container type
  + Ownership/security
  + Condition/time since collapse
  + Current events/shortages
  = final loot roll
```

Example: a gun safe in Florida before takeover may be high-gun. The same safe after a religious Georgia takeover may be empty, confiscated, booby-trapped, or tagged as contraband evidence.

### 5.2 Loot Table Row Example

```json
{
  "id": "container_gun_safe_rural_fl",
  "base_table": "gun_safe_common",
  "tags": ["rural", "firearms", "locked"],
  "requires": { "lockpick": 2 },
  "rolls": [
    { "item": "pistol", "weight": 18, "min": 1, "max": 1 },
    { "item": "shotgun", "weight": 10, "min": 1, "max": 1 },
    { "item": "ammo_9mm", "weight": 30, "min": 5, "max": 40 },
    { "item": "ammo_shells", "weight": 16, "min": 2, "max": 16 },
    { "item": "gun_oil", "weight": 8, "min": 1, "max": 2 },
    { "item": "empty", "weight": 20 }
  ],
  "law_overrides": {
    "guns_banned": { "replace_with": "confiscation_notice", "chance": 0.65 }
  }
}
```

### 5.3 Loot Should Have Ownership

Every valuable item should know if it is:

- unowned scavenged loot
- privately owned
- faction owned
- state owned
- contraband
- evidence
- shipment cargo

This matters for crime.

Stealing a can of beans from an abandoned house is not the same as stealing a sealed corn shipment from a Baron-controlled warehouse.

## 6. NPC Tiers

NPCs should not all be equal. Most should be cheap simulation. A few should matter.

| Tier | Name | Sim Cost | Function | Example |
|---|---|---|---|---|
| N0 | Ambient | very cheap | fills streets, reacts, reports | civilian, drifter, shopper |
| N1 | Worker | cheap | performs town jobs | farmer, packer, clerk, mechanic helper |
| N2 | Specialist | medium | services and systems | medic, mechanic, trader, deputy, driver |
| N3 | Power NPC | high | local decisions and quests | sheriff, baron, mayor, priest, plant boss |
| N4 | Strategic Actor | calculated mostly | state/faction moves | ruler, warlord, corporate director, general |

### 6.1 Core NPC State Machine

Every NPC should have a small state machine:

```text
HOME -> WORK -> ERRAND -> SOCIAL -> TRAVEL -> DANGER_RESPONSE -> RETURN
```

They do not need full life simulation. They need readable purpose.

### 6.2 NPC Jobs

Job rows should define what an NPC does and what system they affect.

Examples:

- Farmer: increases crop stock at field/warehouse.
- Packer: converts raw crop into packaged crop.
- Driver: carries cargo between towns.
- Guard: reduces theft/ambush chance at site or convoy.
- Clerk: runs store and prices.
- Mechanic: repairs town fleet or player vehicle for pay.
- Medic: heals NPC/player and keeps town health stable.
- Deputy: investigates crime, escorts convoys, patrols roads.
- Scout: discovers road danger and reports to town board/radio.

## 7. NPC Travel Between Towns

DRIVN already wants motorists and roads. Use that. NPCs should travel for jobs, trade, law, and story.

### 7.1 Travel Entity

Represent any traveling NPC/group as a route job:

```json
{
  "id": "shipment_corn_rosewood_to_meridian_day_17",
  "kind": "shipment",
  "origin": "rosewood_farms",
  "destination": "meridian_market",
  "route": "US-31_to_I-65",
  "actors": ["driver", "guard_optional"],
  "vehicle": "box_truck",
  "cargo": [{ "item": "corn_crate", "count": 18 }],
  "escort_policy": "baron_decision",
  "status": "scheduled"
}
```

### 7.2 Rendered vs Calculated Travel

Do not simulate every truck physically across the entire USA.

- Far away: route resolves as a calculated event.
- Near the player: spawn the truck on the actual road.
- Interrupted: player action writes to the event record.
- Outcome: update town stock, prices, crime, standing, and radio/news.

This connects to the EventDirector design.

## 8. Town Production Chains

Towns need outputs. This is how they become more than scenery.

### 8.1 Production Chain Row

```json
{
  "id": "corn_chain_basic",
  "resource": "corn",
  "sites": {
    "grow": "corn_field",
    "process": "pickle_cramp_plant",
    "package": "warehouse_loading_bay",
    "distribute": "market_routes"
  },
  "jobs": ["farmer", "packer", "driver"],
  "inputs": ["water", "labor", "fuel"],
  "outputs": ["corn_crate", "pickled_corn_jar"],
  "cycle_hours": 24,
  "shipment_size": 18
}
```

### 8.2 Corn Town Example

A T3 county town has corn as its main economy.

Daily flow:

1. Farmers work fields.
2. Raw corn stock increases.
3. Plant workers process corn into packaged goods.
4. Warehouse workers load crates onto a truck.
5. Driver takes the truck to nearby towns.
6. Guards may escort if the route is dangerous.
7. Destination receives supply.
8. Food prices and hunger pressure adjust.

Player interference:

- Rob truck: player gains cargo; destination gets shortage.
- Kill driver: local murder/evidence case starts.
- Destroy bridge: shipment reroutes or fails.
- Warn town of ambush: reputation gain.
- Escort shipment: paid job.
- Sell stolen shipment in another state: profit plus risk.

Town impact:

- Successful shipments lower food prices.
- Failed shipments raise food prices.
- Repeated losses cause militia patrols, curfews, bounty posters, or baron decisions.

## 9. Baron / Mayor / Sheriff Decision AI

A town leader should not be full AGI. It should be a weighted daily decision tree.

### 9.1 Town Stats

Each town tracks:

- food_stock
- fuel_stock
- medicine_stock
- ammo_stock
- order
- fear
- treasury
- labor
- defense
- road_danger
- player_reputation
- faction_pressure

### 9.2 Decision Examples

A baron can choose:

- send shipment with no escort
- send shipment with one guard car
- delay shipment until road clears
- hire player as escort
- issue bounty on raiders
- raise food prices
- confiscate guns
- declare curfew
- request help from state faction
- raid a nearby rival town

### 9.3 Decision Row Example

```json
{
  "id": "send_corn_escort",
  "requires": { "food_stock": ">=20", "road_danger": ">=2" },
  "cost": { "fuel": 4, "guards": 2, "treasury": 20 },
  "effect": { "shipment_success_chance": "+0.25", "town_defense": "-1" },
  "toast": "The Baron sends an escort with the corn truck."
}
```

## 10. Wanted and Law System

This is not GTA stars pasted onto DRIVN. This is jurisdictional law for broken states.

### 10.1 Core Rule

> **Police do not know what they did not witness, receive, or infer from evidence.**

Crime should become wanted through a pipeline:

```text
Crime occurs
  -> witness/sensor hears or sees it
  -> evidence is created
  -> report is generated
  -> suspect identity confidence increases
  -> law response escalates
  -> jurisdiction decides how far it spreads
```

### 10.2 Jurisdiction Layers

| Layer | Scope | Knows About |
|---|---|---|
| Community | one town/neighborhood | local theft, assault, murder, trespass |
| County | several towns/exits | repeat crimes, known vehicle, local warrant |
| State | whole state/faction territory | high crime, contraband, law profile violations |
| Interstate/Federal | across states | murder spree, state leader hit, convoy terrorism, clone fraud, AI tech theft |
| Faction | ideological/territorial | heresy, debt, betrayal, enemy badges, dog killing, machine use |

### 10.3 Wanted Levels

| Level | Name | Meaning | Response |
|---|---|---|---|
| 0 | Clean | no known crime | normal NPC behavior |
| 1 | Suspicious | reports, gunshots, trespass, body rumor | NPCs watch, deputies investigate |
| 2 | Local Wanted | identified minor crime | patrols, store refusal, arrest attempt |
| 3 | Active Pursuit | seen violent crime or chase | cops/deputies pursue, road warnings |
| 4 | County Manhunt | murder, convoy robbery, repeated crimes | roadblocks, bounty posters, house checks |
| 5 | State Blacklist | high crime or law-profile violation | checkpoints, drones, confiscation, heavy units |
| 6 | Interstate/Federal Heat | cross-border terrorist/fugitive status | bounty hunters, special teams, radio alerts |

### 10.4 Crossing State Lines

A local crime should not magically follow the player everywhere.

- If nobody identified the player, crossing a state line can drop active pursuit.
- If the vehicle plate/paint/dog/weapon/clothes were reported, suspicion can follow.
- If the crime was major, a state can broadcast a warrant.
- If a faction controls both territories, the warrant may carry over.
- If there is an interstate/federal bounty, every state can receive the notice.

This makes borders meaningful.

### 10.5 Evidence Objects

Do not instantly turn every corpse into a loot chest forever. Bodies must become evidence.

Evidence objects:

- corpse
- blood pool/trail
- shell casings
- stolen vehicle
- broken lock
- witness statement
- CCTV/drone camera clip
- cargo manifest
- dog bite report
- gunshot sound marker

The player can interact with evidence:

- move body
- hide body
- burn evidence
- clean blood later
- swap plates
- repaint vehicle
- bribe witness
- jam radio/camera

MVP is simple: corpse found + witness saw player = local wanted.

### 10.6 Arrest and Jail

Do not start jail first. Start with arrest outcome.

MVP arrest:

- fade out
- time skip
- player loses some contraband/cash
- dog hunger advances
- vehicle may be impounded
- local standing changes
- release near jail/courthouse

Later:

- jailbreaks
- prison transport ambushes
- lawyer/bribe system
- clone/life-insurance exceptions

## 11. Spawn Ecology and Biome Zones

The world should not just spawn enemies randomly. It should have ecology.

### 11.1 Cell/Chunk Model

Divide the streamed world into population cells.

Each cell tracks:

- zone type
- biome
- state/faction
- desired population by group
- current population by group
- last_seen_time
- last_noise_time
- last_cleared_time
- safehouse/protected flag
- road proximity
- water/forest/urban density

### 11.2 Population Refill Rules

A cell can refill when:

- it is under its desired population
- the player has not seen it for X hours
- there is a valid spawn edge or adjacent source cell
- the area is not sealed/protected
- current events allow it

This is DRIVN's version of the Project Zomboid lesson: respawn plus redistribution keeps the world alive, but the player should be able to meaningfully secure areas with work.

### 11.3 Migration Rules

Migration is different from respawn.

Respawn creates or restores population after time away. Migration moves existing population between cells.

Migration triggers:

- gunshots
- explosions
- car engine noise
- horn
- dog barking
- convoy movement
- radio event
- weather
- faction patrol order
- player bounty broadcast

### 11.4 Biome Sub-Zones

A forest biome should not be one thing. Break it into zone tags.

| Zone Tag | Feel | Sounds | Spawns |
|---|---|---|---|
| thick_forest | blocked sight, fear, slow travel | branches, birds, distant growl | wolves, strays, hidden camps, ambush scouts |
| house_field | exposed rural lots | insects, wind, dogs | farmers, strays, looters, militia |
| forest_path | narrow movement corridor | footsteps, gravel, twig snaps | travelers, traps, patrol dogs |
| road_shoulder | highway edge | engines, tires, radio static | motorists, raiders, wrecks, hitchhikers |
| swamp | slow, hidden, disease | frogs, water, insects | gators/wildlife, cult scouts, drones fail chance |
| suburbs | houses, yards, fences | TVs, dogs, alarms | civilians, burglars, cops, packs |
| industrial | warehouses, loading docks | metal, forklifts, hum | workers, guards, thieves, trucks |
| military_perimeter | danger layers | distant PA, dogs, drones | soldiers, hunter dogs, drones, mines |

## 12. Military Base Standard

Military bases should live outside metro areas or on hidden spurs. They should feel layered.

Layer order:

1. Approach road - warning signs, abandoned cars, tire spikes, camera poles.
2. Outer fence - broken sections, locked gate, guard booth.
3. Kill zone / parking - wrecks, jersey barriers, patrol routes.
4. Barracks - beds, lockers, mess hall.
5. Motor pool - trucks, parts, fuel, repair tools.
6. Armory - weapons, armor, ammo, restricted locks.
7. Command/comms - maps, terminals, drone controls, orders.
8. Restricted underground - AI tech, clones, Carousel/old government infrastructure.

The player should feel the layers before they get to the loot.

## 13. How This Fits Co-op and PvP

This system makes co-op and PvP matter.

Co-op examples:

- one player escorts the corn truck while another scouts ahead
- one player loots the processing plant while another holds off deputies
- one player hides evidence while another steals the car
- one player controls a drone to track a convoy

PvP examples:

- player A robs a town shipment, causing shortages for player B's home town
- player A becomes wanted in Florida but escapes to Alabama
- player B accepts a bounty to hunt player A across state lines
- player A hides in a community with friendly faction laws
- player B snipes drones near a roof launchpad to deny scouting

This is where the world becomes multiplayer without needing MMO scale first.

## 14. Implementation Plan

### Phase 1 - Furniture Loot Tables

Goal: make buildings worth entering.

Tasks:

- Create `building_types.json`.
- Create `furniture_defs.json`.
- Create `loot_tables.json`.
- Add furniture/container tags.
- Spawn at least 8 furniture/container types.
- Make loot roll from building + room + furniture.

MVP containers:

- fridge
- kitchen cabinet
- medicine cabinet
- closet
- desk
- cash register
- tool rack
- gun safe
- warehouse crate
- police locker

Sims:

- `loot_table_sim`
- `furniture_container_sim`
- `law_loot_override_sim`

### Phase 2 - NPC Tiers and Basic Jobs

Goal: make towns have workers, not just bodies.

Tasks:

- Add `npc_roles.json`.
- Assign home, worksite, job, schedule.
- Add cheap states: home, work, errand, travel, danger.
- Add job effects to town stock.

First roles:

- farmer
- packer
- driver
- guard
- deputy
- medic
- mechanic
- clerk

Sims:

- `npc_job_sim`
- `npc_travel_sim`
- `npc_danger_response_sim`

### Phase 3 - One Production Town

Goal: prove the town economy loop.

Build one corn town.

Sites:

- corn field
- processing plant
- warehouse
- market
- destination town store

Flow:

- field creates corn
- plant processes corn
- warehouse loads truck
- truck travels
- destination stock updates

Sims:

- `production_chain_sim`
- `shipment_delivery_sim`
- `shipment_intercept_sim`

### Phase 4 - Wanted / Evidence MVP

Goal: crime creates local consequences without magical omniscience.

Tasks:

- Create `crime_defs.json`.
- Create local wanted record.
- Add gunshot sound marker.
- Add corpse evidence marker.
- Add witness NPC report.
- Add local deputy response.
- Add cross-border drop rule unless warrant broadcast.

Sims:

- `wanted_local_sim`
- `evidence_body_sim`
- `jurisdiction_crossing_sim`

### Phase 5 - Spawn Ecology

Goal: make cleared spaces repopulate believably.

Tasks:

- Create population cells.
- Add zone tags.
- Add desired population by zone.
- Add unseen timer.
- Add migration from adjacent cells.
- Add noise attraction.
- Prevent spawn in sealed/protected spaces.

Sims:

- `population_cell_sim`
- `migration_noise_sim`
- `safehouse_spawn_suppression_sim`
- `biome_zone_spawn_sim`

### Phase 6 - Baron Decisions

Goal: make town leaders affect shipments/law.

Tasks:

- Add town stats.
- Add decision rows.
- Add daily decision tick.
- Add escort/no-escort logic.
- Add shortage response.
- Add bounty issue.

Sims:

- `baron_decision_sim`
- `escort_policy_sim`
- `shortage_response_sim`

### Phase 7 - State and Federal Law Expansion

Goal: make borders and states matter.

Tasks:

- Add law profiles per state/faction.
- Add contraband definitions.
- Add state wanted transfer.
- Add interstate/federal bounty tier.
- Add radio/TV bulletin hooks.

Sims:

- `state_law_profile_sim`
- `contraband_scan_sim`
- `federal_heat_sim`
- `radio_warrant_sim`

## 15. MVP Slice to Build First

Do not build everything. Build one complete vertical slice.

### The Corn Route Slice

Create:

- one T3 farming county town
- one corn field
- one processing plant
- one warehouse
- one box truck
- one destination market
- one sheriff/deputy response
- one route on the highway
- one lootable shipment
- one local wanted consequence

Player stories enabled:

- Escort the corn truck for pay.
- Rob the corn truck.
- Ambush the driver and hide the body.
- Destroy the truck and cause shortage.
- Follow the truck to discover the warehouse.
- Cross the state line after the robbery and see the local warrant stop following unless broadcast.

This one slice proves the whole system.

## 16. Required Data Files

Create these files as the spine:

```text
game/data/building_types.json
game/data/furniture_defs.json
game/data/loot_tables.json
game/data/npc_roles.json
game/data/town_stats.json
game/data/production_chains.json
game/data/shipments.json
game/data/crime_defs.json
game/data/law_profiles.json
game/data/spawn_zones.json
game/data/population_targets.json
```

## 17. Acceptance Criteria

The system is working when:

- A house kitchen rolls house/kitchen loot, not random global loot.
- A police locker produces law-enforcement loot and stealing it can be a crime.
- A farm town visibly produces corn over time.
- A box truck leaves town with corn cargo.
- The cargo can arrive, be stolen, or be destroyed.
- The destination town prices react to delivery or shortage.
- A baron can choose to escort shipments after repeated losses.
- A murder creates evidence and local wanted only if witnessed/found.
- A state line changes wanted behavior unless a broadcast warrant exists.
- A cleared forest/path can slowly repopulate from migration/unseen-time rules.
- No enemy appears directly inside a sealed safehouse.

## 18. Hard Rules

1. Do not spawn enemies directly in player view unless it is a scripted jump/ambush.
2. Do not make police magically know crimes.
3. Do not make every building loot the same.
4. Do not simulate every NPC fully at all distances.
5. Do not build jail before evidence and arrest.
6. Do not build 50 production chains before one corn chain works.
7. Do not let the data model rot into hardcoded one-offs.

## 19. Open Questions, Not Blockers

These can be decided after the first slice:

- Is the currency called jack or scrip in final UI?
- How many named NPCs per town should persist forever?
- Do bodies decay into loot containers after investigation, or stay as evidence until cleared?
- Should a town shortage create hunger wounds, higher prices, raids, or all three?
- How long should local wanted last if the player is unseen?
- Can witnesses lie or misidentify the player?
- Can factions forge evidence?

## 20. Final Strategic Call

Build this in the order that makes the world playable fastest:

1. Loot tables and furniture.
2. NPC jobs.
3. One production chain.
4. One shipment route.
5. Local wanted/evidence.
6. Spawn ecology.
7. Baron decisions.
8. State/federal law.

This turns towns into machines, roads into targets, and crime into consequences.

The first real win is not "more buildings." The first real win is this:

> **The player robs a corn truck, hides the body, crosses a state line, hears a radio bulletin, and later sees food prices spike because that truck never arrived.**

That is DRIVN.

## Source Notes

- Project Zomboid reference model: community documentation and player discussion describe respawn hours, respawn multiplier, unseen hours, redistribution/migration, population settings, and meta events as key parts of how cleared areas refill or feel alive again.
- GTA VI police/wanted discussion: current public conversation includes unconfirmed speculation and community desire for witness/identity-informed police behavior, less magical police knowledge, and more tactical response. Treat this as a design inspiration, not confirmed Rockstar feature data.
