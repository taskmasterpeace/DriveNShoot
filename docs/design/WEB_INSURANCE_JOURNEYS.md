# WEB_INSURANCE_JOURNEYS: paying to come back, and the long way home

Rows: `web/src/data/insurance.js` (rules, policies, kits, the major centres), `web/src/data/journeys.js` (journey rules, road
stretches, weather, incidents, the long haul), `web/src/data/clones.js` (VATS: `major` centres and pressing offices),
`web/src/data/travel.js` (the Miami knot, the Houston depot, the long haul as a line).
Systems: `web/src/systems/insurance.js` (`g.clone.ins`, `g.clone.policyView()`), `web/src/systems/journeys.js` (`g.travel.j`),
with hooks in `systems/clone.js` (the waking) and `systems/travel.js` (the trip, the coach, the cord).
Agent rows and the selftest: `web/src/agent/journeys-api.js` (`insurance`), `web/src/agent/clone-api.js` (`clone action=die vat=`,
`travel action=cord|incident|plan|hitch`). Scenario: `web/src/scenarios/bus-home.js`.
Built on `docs/design/WEB_CLONE_TRAVEL.md` (the pressing, the husk, the pickers, the trundle, the iron, the airline).

## 1. Overview

Robert, 2026-10-27:
- "You need to pay your life insurance in order to get clones to be able to come back once you die. And even then, you got to
  choose what city you want to come back in. Because it's only the major cities that have the cloning centers... like Los
  Angeles, Miami, Houston, New York, and Chicago... the biggest, densest cities."
- "You gotta literally catch a bus from one city to another and you gotta hope that nothing happens on the way there."
- "You should literally have to catch the bus back home... I don't want you to have to go to a city that's not even by your
  base... then you gotta find some transportation from there to go to where your base is."
- "I don't want to make a stupid game, so make the game fun. But at the same time, it should be brutal."

What it adds on top of the clone loop:
1. **LIFE INSURANCE.** The pressing stays the mechanism; a POLICY is a pressing with terms: DUST COVER, ROAD COVER, IRON COVER.
   Bought at any vat counter. The premium comes out of the brine book every new day; behind past the grace, it LAPSES, the vat
   pours the pressing out, and the next death is flat.
2. **Cloning centres only in the major cities**: Phoenix (Rust Haven's brine room, the metro's centre), Los Angeles, Miami,
   Houston, New York, Chicago. The small towns' clinics (El Paso, Meridian, New Orleans, Ohio) are PRESSING OFFICES: they scan
   you and sell the policy; the body grows at the office's HOME CENTRE (the nearest major city).
3. **The city picker.** Die with a policy and, after the black, a full-screen board of the six centres: distance to your husk
   and to your base, the way home from there by the cheapest line, the transfer fee. The home centre is free.
4. **Risky journeys.** Every leg rolls for an INCIDENT (breakdown, raiders across the road, the dead on the road, the town
   bulls' checkpoint, a thief, a detour, a crash) weighted by the stretch's danger, the hour, the weather and who holds the
   road. On the map it plays out with the real coach and its passengers; off the map (a long haul between cities, or a trip
   slept through) it is a card with choices and consequences.
5. **Get off anywhere.** Pull the cord and the coach stops at the roadside wherever it is. The planner tells you which pole is
   nearest your base and the walk from it. Then walk, hitch (a car may stop, if the road likes you) or steal a car.

## 2. Player fantasy

You were careless at mile 31. You had IRON COVER, so you do not die flat: the screen goes amber and a board comes up. WHERE DO
YOU COME UP? Phoenix is home and free, 9 km from your husk, 3 h back by the trundle. Los Angeles is $49 out of the brine book
and 42 km away. Houston is past the dust: a 30-hour long haul just to reach El Paso. You pick Phoenix.

You stand up in Reyes's back room with a loaner and twelve rounds. Your pickup is in the lot (the tow got it before the
pickers did). But your camp is out past the Sand Trap, and the board at the Rust Haven pole says so: NEAREST POLE TO YOUR BASE:
THE SAND TRAP · 1.8 KM WALK. You buy the punch. Two drifters and a woman from Sonora with a shotgun across her knees ride with
you; one of them tells you there is a herd east of the exit. Four miles out the coach stops hard: wrecks across both lanes,
rifles on the roofs. You can pay the toll, fight it out with the guard and the passengers, or hand over a bag. You fight. The
woman from Sonora gets out with you. Afterwards you pull the cord a mile short of the pole, because the camp is closer from the
dry wash, and walk the rest in the heat, thumb out at the first car that passes. It does not stop.

What each fan should recognise:
- **Autoduel:** the clone, paid for; the car towed or left in the ditch.
- **GTA2:** the bus as a real vehicle on a real road, the stops, getting off wherever you like.
- **Project Zomboid:** the cost is time, scrip and stuff; the clock never stops.
- **The novels' world (never their words):** walled towns linked by dangerous roads, tolls by whoever holds them, travel as
  the adventure.

## 3. Detailed rules

### 3.1 Policies
- A policy row: `premium` (scrip a day, x the vat's `upkeepMul`), `signMul` (the sign-up: a pressing's price x), `graceDays`,
  `staleDays` (how old the pressing may get), `sickHours`, `kit`, `tow`, `transferMul`, `repress`.
- **Signing** (`insurance buy policy=`, the counter panel's keys 1-3) presses you at the counter you stand at (an hour in the
  chair) with that policy. Signing again replaces the policy and the pressing. `clone press` is DUST COVER (the old pressing).
- **Premiums** come out of the brine book at each new day (never your pockets: the book is the policy's account). A day it
  cannot pay is owed; more than `graceDays` owed and the policy LAPSES: the pressing is poured out (`pressingLost`,
  `policyLapsed`). A deposit settles what is owed first. `insurance lapse` stops paying at once.
- **The starter pressing** a new character gets free at the start holdout is DUST COVER the town pays for its first week
  (`starterDays` 7); then the premium is due like anyone's.
- **Cold:** a pressing older than its policy's `staleDays` is cold: it can only be grown at its home centre (no transfer) and
  the new body is brine-sick twice as long. A toast warns each day once it is three quarters of the way there.

### 3.2 Centres and offices
- `VATS` rows with `major: true` grow bodies: `rust_haven` (Phoenix), `los_angeles`, `miami` (at the Miami knot, mile 0 of
  I-95, the SALT LINE's new south end), `houston` (the Houston depot, past the dust), `new_york`, `chicago`.
- Every other vat row is a **pressing office** (`office: true`): `el_paso`, `meridian`, `new_orleans`, `ohio`. It scans,
  sells, keeps the brine book. A pressing taken there is filed with its **home centre**: the nearest major centre by the towns'
  places on the world plane (El Paso and Meridian's offices file with Phoenix and Miami).
- A centre's place: the cities lane's `citygen.cloneCenters()` building when it exists (matched by vat id or town), else the
  vat row's place (its `at`, its clinic's bay, or its knot's counter). Off the map, its city's arrivals hall.

### 3.3 The city picker
- After the black, with a pressing: if the agent named a centre (`clone action=die vat=`, `insurance pick vat=`) that one;
  if an agent command is running, the home centre; else the board (keys 1-6, ENTER the home centre, the home centre after
  `pickerSecs` 45 s). The world is black and holds still while it is up.
- Each row: the centre, km to your husk, km to your base, the cheapest way home from it (hours, fare, the first ride), the
  transfer fee. A row you cannot pay (the brine book: your pockets are on your husk) or a cold pressing's non-home row is dim.
- Coming up: the policy's kit, its brine sickness (x2 cold), the transfer paid; IRON COVER tows your husk's car to the lot
  beside the centre (on the map only) and takes a fresh pressing (the policy goes on).

### 3.4 Incidents
- A leg's context: the line, from and to, miles, the hour, the weather, the worst `ROAD_STRETCHES` row it touches (its danger
  and who holds it). Odds: `min(maxP, (1 - (1 - perMile * danger)^miles) * night * weather)`.
- The roll is seeded: which incident, where along the leg (`at` 15-85%), and every choice's amounts (delay, hurt, toll, fine,
  a fight's outcome) are rolled together, so the same seed is the same incident and the same costs.
- Choices (the first is the default: a sleeper, Esc, a timeout or an agent with no `choice=`):
  breakdown (wait | walk), roadblock (pay | fight | hand over a bag), infected (push through | hole up), checkpoint (open your
  bag: contraband taken, a fine if any | bribe), thief (it takes 30% of your pockets first; let it go | take it back: a fight),
  detour (sit back), crash (climb out: hurt, on foot).
- **A toll you cannot pay** falls through to the next choice that costs nothing (the bag, the fight).
- **Slept or off the map** (`travel skip`, a long haul): the clock runs to the incident, the card asks, the consequences land,
  the clock runs the rest. `putOff` leaves you at the roadside where it happened (a long haul's: walking the rest, x3 the hours).
- **On the map, aboard the real coach**: one roll every `rollEveryM` metres. Roadblock and checkpoint: the coach brakes to a stop
  before them and the card comes up; fight brings the raiders out shooting and the guard and the armed passengers shoot back
  from the windows; the bulls stand at the roadside while you choose. Breakdown and crash stop the coach; the dead come out
  of the brush ahead; the thief is a real passenger who runs if you lose.

### 3.5 Passengers
- A real coach seats `passengers` [2, 4] people (rows of `passengerKinds`): a name, a flag, a faction, some armed. Two rows are
  always left free. U aboard opens THE PASSENGERS: each is a row, 1-9 talks to them (the same topics as anyone you meet: the
  news, the road, what their people make of you).

### 3.6 Getting off and getting home
- **The cord** (F aboard a moving coach; `travel action=cord`): the driver brakes to a stop where it is and you step down at
  the roadside within `dropR` 30 m of it; the ride ends, the punch is spent. On a stopped coach F is the old F.
- **The planner** (`travel action=plan to=base|husk|x,z|node`; the board's note): Dijkstra over the real network on fare plus
  `walk.costPerKm` a walking km, carrying the clock through the real timetables. It returns the legs, the fare, the hours, the
  pole to get off at, the walk from it, and the pole nearest the target ("NEAREST POLE TO YOUR BASE: THE SAND TRAP · 1.8 KM").
- **Your base**: `insurance base x= z= name=`; until you set one, the start holdout's vat.
- **Hitching** (O at an interstate's roadside; `travel action=hitch`): every `everyS` seconds a car may come; it stops with odds
  `base + standing * perStanding` (the drifters' reading of you), never below `refuseBelow`. It pulls up, waits 25 s, drives you
  up the road toward the next exit (at most `rideMaxM`), lets you out; F asks to be let out sooner. Take the wheel and it is a
  stolen car.

## 4. Formulas

| What | Formula | Variables |
|---|---|---|
| Sign-up | `round(price * vat.priceMul * policy.signMul)` | price 400; DUST x1, ROAD x1.25, IRON x1.75 |
| Premium / day | `round(policy.premium * vat.upkeepMul)` (0 for the starter's first `starterDays`) | DUST 20, ROAD 35, IRON 70 |
| Lapse | owed days > `policy.graceDays` | 2 / 3 / 4 |
| Cold | `hours - pressing.at > staleDays * 24` | 4 / 10 / 30 days |
| Transfer | `round((30 + 260 * abs(mulA - mulB) + 6 * km / 100) * policy.transferMul)` | x1.5 / x1 / x0.5 |
| Brine sickness | `policy.sickHours * (cold ? 2 : 1)` | 24 / 18 / 10 h |
| Incident odds | `min(0.85, (1 - (1 - perMile * danger)^miles) * night * weather)` | perMile: SUN 0.011, SALT 0.012, haul 0.004; night x1.6; STORM x1.5 |
| Incident weight | `weight * night * held[holder] * weather[key]` | roadblock 2.5, x2.2 on Dustwolf road |
| Real-time roll | the odds for `rollEveryM / mile` miles, once per 400 m with you aboard | one per leg |
| Planner cost | `fare + 6 * walkKm` | walk 1.4 m/s; walking legs from you to a node at most 3.5 km |
| Hitch odds | `clamp(0.35 + 0.006 * standing, 0.05, 0.85)`; 0 below -40 | every 18 s |

**Worked example.** IRON COVER signed at Rust Haven: `round(400 * 1 * 1.75) = $700`, $70 a day. You die at mile 31. Waking in Los
Angeles instead of Phoenix: km 41.6, `(30 + 260 * 0.25 + 6 * 41.6 / 100) * 0.5 = 48.7 -> $49`. Sleeping through the trundle home
from Rust Haven to the Sand Trap at 23:00: 5.4 miles at danger 1.5 (the Sand Trap reach), night x1.6:
`(1 - (1 - 0.011 * 1.5)^5.4) * 1.6 = 13.3%`. A roadblock there (Dustwolf road) weighs `2.5 * 1.6 * 2.2 = 8.8` of 22.0: 40% of
incidents.

## 5. Edge cases

- **No policy:** you die flat (as before). A lapsed policy is no policy.
- **A cold pressing:** the picker offers only the home centre.
- **Can't pay a transfer:** that row is dim; the home centre is always free. Your pockets are on your husk: the book pays.
- **An off-map centre (Houston):** you come up in its arrivals hall; the hall's board lists the long haul (to El Paso, New
  Orleans) and lets you press there.
- **Towing a car you are not near / already burned / past the dust:** nothing is towed; the husk keeps the record.
- **An agent command running when you die:** no board (it would hold the bridge): the named centre or the home centre.
- **A toll you can't pay:** the next choice that costs nothing happens instead (`couldNotPay` in the result).
- **Pulling the cord on a stopped coach:** that is the old F (get off at the pole).
- **Dying aboard during an incident:** the ride ends as before; the incident's card closes with its default.
- **Florida to Phoenix:** no line crosses the Gulf on the map: the planner goes Miami -> New Orleans -> Houston -> El Paso by long
  haul (about 78 h and $350), which is the point.
- **Saves:** the policy rides the pressing; the base rides the clone section; a pending incident card is not saved (a load
  drops it, the trip having not happened yet).

## 6. Dependencies

Uses: `systems/clone.js` (press, wake, due, newDay, kit, pickers), `systems/travel.js` (nodes, timetables, punches, skip, the
coach, holds), `ui/travelpanel.js` (the picker, the incident cards, THE PASSENGERS), `systems/talk.js` (what passengers say),
`systems/factions.js` (the hitch's standing), `systems/sky.js` (`weatherKey`), `world/streamer.js` (`autopilot`), `main.js`
(the F hook: `travel.cord()` before `exitVehicle`).
Used by: the lead's pause-menu INSURANCE tab (`g.clone.policyView()`), the cities lane's cloning-centre buildings
(`citygen.cloneCenters()`, consumed by `Insurance.place`), the World Forge MAP tab (rows).

## 7. Tuning knobs

| Knob | Value | Safe range | What it changes |
|---|---|---|---|
| `POLICIES.*.premium` | 20 / 35 / 70 | 5-200 | the slow drain of staying alive |
| `POLICIES.*.graceDays` | 2 / 3 / 4 | 0-7 | how forgiving the policy is |
| `POLICIES.*.staleDays` | 4 / 10 / 30 | 1-60 | how often you must get re-pressed |
| `starterDays` | 7 | 0-30 | the town's free first week |
| `transfer` | 30 + 260/mul + 6/100 km | x0-x3 | the price of coming up far from home |
| `JOURNEY_RULES.maxP` | 0.85 | 0.2-1 | the most a leg can be dangerous |
| `ROAD_STRETCHES.*.danger` | 0.6-1.6 | 0.2-3 | which roads are deadly |
| `INCIDENTS.*.weight` | 0.7-3 | 0-10 | what happens most |
| `rollEveryM` | 400 m | 100-2000 | how often a real ride can turn |
| `passengers` | 2-4 | 0-8 | how full the coach is |
| `cord.dropR` | 30 m | 10-60 | where the cord leaves you |
| `walk.costPerKm` | $6 | 0-30 | how much the planner hates walking |
| `hitch.base` / `perStanding` | 0.35 / 0.006 | 0-1 | how kind the road is |
| `HAUL.routes.*` | 12-34 h, $55-150 | x0.5-x3 | the long way between cities |

## 8. Acceptance criteria (each is a `selftest` check, `src/agent/journeys-api.js` unless noted)

1. **Premiums lapse -> die flat:** signing ROAD COVER costs `price * 1.25`; a day's premium comes out of the brine book; the owed
   days count up to the grace; the next unpaid dawn lapses it (`policyLapsed`); the next death is flat.
2. **The picker wakes you at the chosen major centre:** the picker lists exactly the six major centres, each with its distance to
   your base and a fee unless home; `clone action=die vat=los_angeles` wakes you within 3 m of LA's centre, the transfer out of
   the brine book; IRON COVER towed the pickup to the centre's lot and pressed you again there.
3. **A small-town clinic can't grow a body:** a pressing at El Paso's office wakes you at its home centre (Phoenix), never in El
   Paso; every office is `canGrow false`, every major centre true.
4. **An incident roll is deterministic with a seed:** the same seed rolls the same JSON; a quiet seed rolls nothing; Dustwolf
   road weighs roadblocks over 1.5x Rust Haven's; paying the toll costs exactly the rolled amount.
5. **A long haul plays its card:** held in Houston's hall, a punch to El Paso, a seed that rolls the roadblock, `choice=bag`: the
   best stack is gone, you land at the El Paso knot on the map.
6. **Passengers:** a real coach seats 2-4 people with flags and factions, aboard; THE PASSENGERS panel talks to one.
7. **Pulling the cord drops you within 30 m of the coach's position**, not at a pole (> 60 m from every pole), the ride over.
8. **The planner picks the pole nearest a staged base:** a base 1.8 km off the Sand Trap pole; the plan from Rust Haven rides
   the trundle to the Sand Trap and says the walk.
Updated in `src/agent/clone-api.js` with a reason: the Florida check (Meridian is an office now: a Florida start comes up in
Miami's centre); the sleep-through check (the roll is an incident with a context and a default choice).
Plus: scenario `bus-home` (die far from home, wake in a major city, ride toward your base, survive one incident, get off near
home, finish on foot); the whole battery green twice on fresh pages; `scenario name=stress` not regressed; `ip-lint` 0 deny.
