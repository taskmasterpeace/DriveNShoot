# BANDIT & CONVOY ECOSYSTEM — the road's predators and its prey

**Status:** GREENLIT design (owner directive 2026-07-07 evening, voice): *"I want vehicles
that are trying to go somewhere… delivering… going from one city to another. We need to
think about putting up the checkpoints from the bandits. A whole AI for the bandits: how
they act, how they spawn, what attracts them. They should have drones. Certain regions
where the bandits are stronger — really strong in the southwest. Put it all together —
one system, one ecosystem: the bandits, the convoys."*
**First rung SHIPPED with this doc:** convoy trips on the traffic system (§3.1 v1) — see
Acceptance 1. Everything else is the build contract for the arc.
**Builds on:** `traffic.gd` (trips, `set_agent_trip`, promotion), the corridor pass
(46 exits + 13 purposed towns = real origins/destinations), `LOOT_NPC_PRODUCTION_WANTED_SPAWN.md`
§7-8 (shipments/production), `POPULATION_WAR.md` (cells, zone tags), `DIVIDED_STATES.md`
(regional rulers), `drone.gd` (the drone tech that bandits now get too).

## 1. Overview

One food chain on the highway network. **CONVOYS** are the prey: purposeful multi-vehicle
trips hauling REAL cargo between the corridor pass's towns (Rosewood corn → Meridian
market; Peach Combine diesel → everywhere), visible, robbable, escortable. **BANDITS** are
the predators: gangs that hold territory, watch the roads that cross it, spin up
CHECKPOINTS at chokepoints, launch SCOUT DRONES to find prey, and commit to ambushes when
the take looks worth the risk. **REGION sets the stakes**: each state carries a
`bandit_strength` row (the Southwest — AZ/NM/NV/UT — is their heartland), scaling gang
size, gear tier, checkpoint frequency, and drone availability. The player meets the
ecosystem from every side: prey (they hit you), competitor (you rob the same convoy),
customer (pay the checkpoint toll), or exterminator (clear a camp, strength drops).

## 2. Player Fantasy

Cresting a rise on THE FURNACE RUN you see it play out ahead: a three-truck corn convoy
brake-lighting behind a bandit checkpoint — plywood, wrecks, and a spike strip across the
westbound lanes. A drone you heard minutes ago buzzes back toward the ridge. You can turn
around, pay, run it, or pick the overwatch off the ridge and take the convoy's gratitude
(or its cargo). In Virginia this is a rare, ragged nuisance. In New Mexico it's the
government.

## 3. Detailed Rules

### 3.1 CONVOYS (the prey) — v1 SHIPPED, v2 spec
**v1 (shipped with this doc):** the traffic system's TRIPS grow into CONVOYS: a
`convoy_chance` roll on ambient spawn creates 2–3 agents in a column (semi/van visuals,
shared `dest_exit_id`, tight headway), tagged `convoy=true` + a `cargo` row (picked from
the origin town's purpose: farm→produce, fuel→diesel, salvage→scrap). Promotion of any
member promotes the neighbors within 60m (a convoy is one story). A promoted convoy
vehicle carries its cargo as trunk loot (`loot_table` by cargo row).
**v2 (build next):** convoys SCHEDULE off production (LOOT_NPC §8 shipments.json):
Rosewood ships corn to Meridian on a game-day cadence; robbing the road STARVES the
market (prices react through the existing respect/prices spine). Escort contracts appear
on the radio/jobs board.

### 3.2 BANDIT GANGS (the predators)
A GANG is a data row + a camp placement: `{id, state, camp_pos, strength 1-5, gear_tier,
vehicles[], drone: bool}`. Gangs don't wander the whole map — they hold a TERRITORY
(cells within ~4km of camp, marked `controlling_faction: gang_id` in population cells).
AI is a three-state director per gang, ticked on game-hours (not frames):
- **WATCH:** passive. Roads crossing territory accrue `sightings` from passing traffic
  (weighted by cargo value; convoys weigh triple). Drone-equipped gangs launch a scout
  drone along their road every N hours — the player can SEE and SHOOT it (drone.gd's
  existing shoot-down), blinding the gang for a day.
- **STALK:** sightings past a threshold → the gang commits: spawns an AMBUSH party
  (vehicles + puppets per strength/gear rows) at a chokepoint AHEAD of the prey —
  bridges, exits, the median gaps of divided highways (the road overhaul's geometry
  gives real chokepoints).
- **STRIKE / CHECKPOINT:** strength ≥3 gangs prefer standing CHECKPOINTS (checkpoint_road
  structure + barricade props + a toll demand through the existing toll law — pay,
  fight, or run the strip and eat tire damage). Weaker gangs hit-and-run: the pirates'
  existing chase AI (`_update_pirates` grows a `gang_id`).

### 3.3 WHAT ATTRACTS THEM (the owner's question, answered as rows)
`attraction = cargo_value × visibility × region_strength − player_reputation_fear`
- **cargo_value:** convoy cargo rows > lone traffic > the player's trunk contents (they
  scan what you're hauling when you pass a checkpoint scanner drone).
- **visibility:** NOISE (the shipped noise layer — horns, gunfire, loud radio), headlights
  at night, drone sightings. Crouch-quiet drivers get seen less.
- **region_strength:** §3.4. **reputation_fear:** a player with a high bandit-kill ledger
  (respect spine) makes weak gangs skip them — the strong ones take it as a challenge.

### 3.4 REGIONAL STRENGTH (the Southwest law)
`data/bandit_regions.json`: per-state `strength 0-5`. Seeds: AZ 5, NM 5, NV 4, UT 4,
TX 3, the plains 2, the east 1, VIRGINIA 1 (Bridger's Council keeps order), occupied
FLORIDA 0 bandits but Faith patrols instead (their checkpoints reuse the same machinery
with the law skin — one system, two masters). Strength scales: gang count per state, camp
gear tier, checkpoint frequency, drone ownership (strength ≥4 = drones). The Southwest
states' rulers (DIVIDED_STATES) get flavor hooks: their "government" IS the strongest gang.

### 3.5 BANDIT DRONES
Reuse `drone.gd`'s rig: gang drones patrol their territory's road at low altitude. On
spotting prey (player/convoy) they SHADOW it (the buzz is the tell — audio cue) and feed
the gang's sightings. Shootable (existing shoot-down); a downed drone drops scrap + marks
the gang's camp direction on the map (intel cuts both ways). Strength ≥4 gangs relaunch
after a cooldown.

## 4. Formulas

- **Sightings:** `+cargo_value × (1 + noise_bonus) per pass`; convoy cargo_value 3.0,
  loner 1.0, player 1.0 + trunk_value/100. Ambush threshold = `12 / region_strength`.
- **Gang size at STRIKE:** `2 + strength` puppets, `1 + floor(strength/2)` vehicles.
- **Checkpoint toll:** `8 × strength` scrip (the existing toll law's pay-or-stress path,
  plus the fight/run options).
- **Drone patrol cadence:** every `8 − strength` game hours; shadow speed 26 m/s.
- **Territory:** cells within `2000 + 500×strength` m of camp.

## 5. Edge Cases

- **A convoy meets a checkpoint:** convoys PAY weak gangs (cargo row loses a slice —
  visible if the player later robs it) and refuse strong shakedowns → a firefight the
  player can arrive mid-scene (the ecosystem runs without him).
- **Two gangs' territories touch:** the stronger absorbs sightings in the overlap; gang
  wars are OUT OF SCOPE v1 (a war row is banked for POPULATION_WAR).
- **The player parks IN a checkpoint lane:** it's a toll stop, not a wall — bandits
  approach on foot after 10s (the existing pirate boarding pattern).
- **Gang camp cleared (all puppets dead):** state strength −1 for a game-week (respect
  ledger records it); the camp placement stays as lootable ruins; a new gang reseeds
  after the week if strength > 0.
- **Occupied Florida:** zero bandit gangs; Faith checkpoints reuse §3.2's STRIKE state
  with law_hooks instead of tolls — contraband searches (already proven in law_profile_sim).
- **Multiplayer:** gang director is HOST-authoritative like every enemy; convoys are
  local-ambience until promoted (the traffic law), promoted convoy vehicles sync as cars.

## 6. Dependencies

- **Reads:** `traffic.gd` trips/promotion (v1 convoys live there), corridor-pass towns +
  purposes (cargo origins), `population.gd` cells (`controlling_faction`), noise layer
  (`emit_noise`/`noises_in`), `drone.gd`, toll law (`road_sim`'s), pirates
  (`_update_pirates`), respect/prices spine, `checkpoint_road` structure.
- **Written for:** POPULATION_WAR (gang territory uses its cell schema; wars banked),
  LOOT_NPC §7 shipments (v2 convoys), DIVIDED_STATES (Southwest ruler flavor).
- **New data:** `data/bandit_regions.json`, gang rows (`data/gangs.json`), cargo rows
  (fold into traffic.json or their own file).

## 7. Tuning Knobs

| Knob | Default | Range | Governs |
|---|---:|---|---|
| `convoy_chance` | 0.25 | 0–1 | share of ambient spawns that are convoys |
| `convoy_size` | 2–3 | 2–4 | column length |
| ambush threshold base | 12 | 6–24 | how much watching before a gang commits |
| `region strength` (per state) | see §3.4 | 0–5 | THE dial — the Southwest's identity |
| toll | 8×strength | ±50% | pay-vs-fight economics |
| drone cadence | 8−strength h | 2–12 | how watched a strong state feels |
| reseed time | 7 days | 3–14 | how permanent clearing a camp feels |

## 8. Acceptance Criteria (each testable)

1. **Convoys v1 (SHIPPED with this doc):** `traffic_sim` asserts a convoy spawn produces
   2–3 column agents sharing a destination, tight-following; promoting one promotes its
   neighbors; a promoted convoy truck's trunk rolls its cargo loot table.
2. Gang director: a staged gang in WATCH accrues sightings from passing traffic and
   transitions to STALK past the threshold (`bandit_sim`).
3. A strength-3 gang raises a CHECKPOINT at a chokepoint: barricade + toll demand;
   paying passes, refusing spawns the fight (`bandit_sim`).
4. Regional law: the same convoy route through NM (5) vs VA (1) yields ≥3× the ambush
   rate over N simulated days (`bandit_region_sim`, seeded).
5. A gang drone shadows the player, is shootable, and its loss blinds the gang (sightings
   stop) for a day (`bandit_drone_sim`).
6. Clearing a camp drops the state's strength for a week and the world FEELS it (ambush
   rate row-drop asserted).
7. Occupied Florida runs Faith checkpoints through the same machinery with law_hooks
   (contraband search), zero bandit gangs (`law_profile_sim` extension).
