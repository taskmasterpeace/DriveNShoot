# WEB_POLICE_RESPONSE: stations, beats, the desk, and the heavy team

Rows: `web/src/data/police.js` (+ `validatePolice`, `INVESTIGATE`). Systems: `web/src/systems/police.js`, `web/src/systems/investigate.js` (the shared search party). Commands and checks: `web/src/agent/police-api.js` (`police action=stations|patrols|dispatch|units|report|clear|siren`, `investigate action=view|start|stop`). Renders: `docs/renders/web/swat/`.

Robert (2026-10-29): *"certain cities should be able to have, like, the equivalent of SWAT teams. And they got to actually come from the police station too, though. And you should hear them coming close. They should have their routes around the city for certain."*

## 1. Overview
Every generated town with a police station (`world/citygen/layout.js` gives one from 30 buildings up) gets a **desk** while it is built near you:
- a **tier** by size: post (30+ buildings), station (60+), precinct (110+);
- a **force** decided by who owns the town: the sheriff's bulls, a family's militia, or a raider boss's enforcers;
- a **motor pool** of real cars parked in stalls at the station's bays and its own curb;
- an **armory** roster and **holding cells**;
- the town's own **street graph**, built from its `T.roads`.

Patrols drive **beats** round the town's blocks and walk the main street, on day and night shifts. A crime reaches the desk **only** through a real channel: a witness who runs to the station, an officer who saw or heard it, the station hearing shots, or an alarm wired to the desk.

The desk sends a rung by severity: a patrol car, a posse, or the **heavy team** (a breach truck carrying six in helmets and vests, with a shield and a ram). The heavy team exists only in precincts, major cities and rich stations.

Units leave their stalls and drive the town's streets to the **reported** spot. They park, search, hold corners, and stack and breach a building the report names. If they see you, they offer the cuffs or open fire. If they find nothing, they call it clear and drive home to the same stall. Sirens carry 650 m, with their direction. The desk's lines go out on the air from the station, and a scanner copies them.

It makes **consequence** bite harder: the town answers for what it learns, at the speed the news can travel and the cars can drive. It also makes **distance** matter: a witness 300 m from the station is your window.

## 2. Player Fantasy
You hear it before you see it: a siren to the south-west, getting louder.

You did something on the north end; the desk thinks it happened two blocks over, because that is where the shots seemed to come from. You can watch the bull car go the wrong way.

In a big town you learn the beat: the car rounds the courthouse block every couple of minutes, two officers walk Main between the saloon and the station. You learn when the shift changes.

In a precinct, if you kill an officer, the breach truck comes. You see six helmets in a file against the wall beside your door, the shield at the frame and the ram up. In a grain town of 80 buildings, that truck does not exist; two cars come instead.

## 3. Detailed Rules
**Desks.**
- The desk scans the live towns once a second. It adopts a town with `T.police` and a tier, and drops it when the town is released (or rebuilt under the same id).
- Tier: the town's non-outbuilding building count against `STATION_TIERS[*].minBld`. The heavy team comes with `precinct`, with a major city (`ARCHETYPES.*.major`), or with a `station` whose wealth is at least `HEAVY_WEALTH`.
- Force: `forceOf(arch, owner)`. A raider faction owner (`RAIDERS`) or a raiding family gives enforcers. Another family gives the militia. Otherwise it is `FORCE_BY_ARCH[arch]`, falling back to the sheriff.
  The owner comes from `systems/sitestories.js` places. Every force wears faction `warden`, so standing and hostility rules apply. Each officer gets a random real flag (`g.randomFlag`).

**Motor pool.**
- Stalls: one in front of each bay of the station, then the station's curb along the nearest street, nose to tail, a car's width in from the kerb.
- The tier's `cars` are parked there at adoption, plus the breach truck (`VEHICLES.breach_truck`, registered from `BREACH_TRUCK`) if the town keeps one.
- A call or a beat **takes a parked car**. It comes back to the same stall: the last ≤25 m into the stall are not driven.
- A destroyed car is gone; nothing refills the pool (law 2). The armory's `officers` count drops by one for each officer sent out, and rises again when they come back in. The dead are never replaced.

**Beats.**
- Car beats loop a block of the town's grid: the block nearest the centre, `PATROLS.car.ring` blocks wide, one block wider per extra car. The car drives every crossing on the block's edge, clockwise, and dwells `dwell` s at each. It starts at the corner nearest its stall.
- Foot beats: a pair walks the main street's sidewalk up to `foot.len` m either side of the station, and looks `foot.look` s at each end.
- Shifts: `PATROLS.shifts`. When the shift changes, every beat goes home (the car to its stall, the walkers to the front door), and the new shift's beats (`carBeats`/`footBeats` for the tier) come out of the station.

**Channels (the only way in).**
1. **witness**: a deed (`events: deed`) whose identified witnesses (`deeds.js` witness pass) include a townsperson. The witness nearest the station runs there on foot at `witness.run`. The report lands `tell` s after they arrive.
   If they die or are removed on the way, it is silenced (`reportSilenced`). If an officer is within `flag` m of them, the officer is flagged down and the report goes on the radio.
2. **patrol**: an officer is among the deed's identified witnesses, or an officer heard a shot within its radius. The radio delay is `patrol.radio` s. The spot is exact if they saw it; if they only heard it, the spot is ±10 m.
3. **heard**: a player noise (`g.noise`, radius ≥ `minNoise`) in a town. The station hears it if its door is within radius × `stationEar`. Otherwise the nearest townsperson inside the radius runs it in.
   The reported spot is off by `fuzz` × the hearer's distance (where they *think* it was). One heard report per town per 12 s.
4. **alarm**: you kick a door or break glass (`doorKick`, `windowShattered` events, by the player) at a building whose alarm is wired to the desk. Wiring: the building is a kind in `alarm.kinds`, and the hash of its id falls under `share` (police stations are always wired). The report reaches the desk after distance / `wire` + `delay` s.

**Cases and dispatch.**
- A report within `merge.r` m and `merge.secs` s of an open case firms that case up: the higher severity, a suspect, a building, and the spot (unless the new report is only a heard one). Otherwise it opens a new case.
- Severity starts from `SEVERITY.verb[v]` (else the deed's `VERBS` magnitude), plus `officer` when the victim was an officer.
- The rung is `rungFor`: heavy at `ladder.heavy` if the town keeps a running truck, posse at `ladder.posse`, else patrol. A patrol call diverts the nearest beat car that is out.
- A case already answered at that rung or higher sends nothing more. If the motor pool or the roster is empty, the desk refuses that rung (`dispatchRefused`) and falls to the next one down.

**Units.**
- **roll**: the desk routes along `StreetGraph.route` from the stall to the street foot nearest the case spot. The goal is set from the case, never from the player.
  Cars keep right (1.9 m off the crown). They slow for corners, stop for people, follow a moving car ahead, steer a lane round a standing car or a wreck, and do three-point turns. When pinned, they back off and sidestep. Two pins at the same crossing close it for the desk (`streetBlocked`) and the car re-routes.
  The second car of a call pulls out 3 s after the first. Sirens and lights are on for posse and heavy; a patrol car rolls quiet.
- **arrive**: the men get out. A heavy unit with a named building goes to **stack**; everyone else goes to **search**. `perimeter` men take the block's nearest crossings.
- **search**: a ring 11 m round the case spot (or `lastSeen`), turning every 8 s. After `search` s with no sighting, the unit calls clear and goes **home**.
- **stack** (heavy): a file against the wall beside the door, 0.8 m out, 1 m apart: the shield first, then the ram. They crouch. When every man is up (or after 25 s), they wait 1.5 s, then the ram swings every 1.1 s.
  The ram goes through the timed-actions lane's `g.actions.breakIn` when that lane is in. Until then it is two of the door's own `interiors.kick` blows a swing. When the door is open: **inside**, a 4 m search round the building's centre.
- **contact**: an officer on foot who sees you (`g.sees`, within `sightR`, which is 55% shorter at night) while the case names you as the suspect, or while you are armed.
  At severity ≤ 2 with a force that arrests: hands up, holster and stand still within 5.5 m for 1.5 s. If you can pay, you are fined `fine` × severity; if not, you go to THIS station's cell for `jail` × severity hours.
  Otherwise they open fire. If they lose you for 12 s, they search where they last saw you.

**Investigation (the shared INVESTIGATE behaviour, `systems/investigate.js`).** Robert: *"no cheating, but the AI needs the tools that they need in order to be able to do stuff like find you and investigate stuff."* Any AI starts a party (`g.investigate.start({ members, x, z, ... })`); police searches run through it. A party knows only:
- the **last known spot** it was given, plus whatever it reads there itself;
- **brass**: two or more casings at rest within `brassR` of the spot (`systems/ambient.js` shells). The search moves to where the shooter stood;
- **witnesses**: people who SAW you have `c.lastSawP`, which is recorded only from `g.sees`, twice a second, while a party is out. A searcher within `askR` of one walks over, asks (`ask` s), and the search moves to where that witness last saw you;
- **blood**: a drop laid after the incident (the `outdoors.js` track pool, by anyone not in the party, younger than `lookbackH`). They follow it print to print forward (the newest within `noseR` of the lead each scan). **Boot prints** are followed the same way, but only by a party with `trackSkill ≥ bootSkill` (a tracker), so a bull without a dog does not read boots on a street;
- **hiding places** within `hideR`, nearest first, up to `maxHides`: inside the nearest buildings (the centre; `look` × 1.5), behind crates, half-walls, pumps and wrecks (the far side of their normal), beside parked cars (the side away from the spot), and the back yards;
- **sweep** rings at `rings` m, `perRing` points each, after the hiding places;
- **sight**: any member who sees you (`g.sees` inside `sightDay`→`sightNight`; ×0.6 crouched; prone by `stance.seenRange`) ends the party as FOUND. The party's side keeps your description (weapon, vehicle, flag, where, when).

Members take the next place on the list in turn, so the party splits up. A place they cannot reach is given up after `giveGoal` s. Hard evidence (blood, brass) calls backup once (police: the case's rung rises to posse). After `until` s with no fresh clue, they give up (`investigateEnd`). Drains: a party never goes below the street (no line of sight into the drains); a witness who saw you go down a manhole moves the search to the manhole and no further.

**The air.**
- The desk's lines (`DISPATCH_LINES`: send, scene, stack, clear, contact) are knowledge facts keyed up from the station through `kit.keyUp`. Only a live scanner in range copies them.

**The siren.**
- Every 0.25 s, each rolling unit with its siren on is run through `audio.js spatial(d, SIREN.range)`. The first time its gain reaches `audible`: `sirenHeard` {bearing, compass, d}.
- The HUD subtitle names the loudest siren's direction. A real browser plays a panned wail.

## 4. Formulas
- **Tier**: `tier = max{ t : nBld ≥ t.minBld }`; `heavy = t == precinct ∨ major ∨ (t == station ∧ wealth ≥ 0.6)`.
  Example: county_seat seed 3 has 133 buildings → precinct + heavy. plains_grain_town seed 1 has 81 buildings and wealth 0.4 → station, no heavy. boom_strip (major) → heavy at any tier.
- **Witness delay**: `t = d_station / run + tell` (run 3.4 m/s, tell 6 s). A witness 200 m out: 200/3.4 + 6 = 64.8 s. The selftest measured within 0.6–2.2× of this.
- **Alarm delay**: `t = d / wire + delay` (wire 300 m/s, delay 2 s). A shop 300 m away: 3 s.
- **Heard spot error**: `e = fuzz · d_hearer` (fuzz 0.25). The station 60 m from the shot reports a spot 15 m off.
- **Station ear**: heard if `d_station < r · 2.2`. A pistol (r 45) is heard by the desk out to 99 m.
- **Severity → rung**: `sev ≥ 5 ∧ truck → heavy`; `sev ≥ 3 → posse`; else patrol. A killing (4) of an officer (+2) = 6 → heavy (or a posse where none is kept).
- **Travel time**: physical. The car drives the street route at ≤ `cruise`, slowed at corners: `target = min(cruise, 5 + 0.5·d_end)`, and `6 + 0.35·d_corner` inside 22 m of a turn over 0.6 rad.
  Measured: a 110 m call and a 330 m call took times in the ratio of their route lengths (±45% allowed; see §8).
- **Siren audibility**: `gain = spatial(d, 650).gain = inv(d) · (1 − (d/650)²)`, heard when ≥ 0.012. With the shared `SPATIAL` constants that is ~300 m in the open. The selftest needs it heard more than 60 m away.
- **Fine / jail**: `fine = force.fine · sev` (sheriff 35 → $70 for a theft); `jail = force.jail · sev` hours (sheriff 4 → 8 h).

## 5. Edge Cases
- **A crime nobody saw or heard** (no identified witness, no noise in any ear) creates no report, no case and no unit. This is checked.
- **The witness is killed on the way**: the report is silenced (`reportSilenced`) and the desk never learns. Killing them is its own deed, witnessed or not.
- **A runner wedged by geometry** is delivered late, at 3× the expected delay plus 30 s: they got there another way.
- **You leave the scene**: units go to the case spot, never to you. Only a sighting (`lastSeen`) moves the search.
- **The heavy truck is destroyed**: `truckLeft` is 0; the next heavy call falls to a posse.
- **The motor pool or roster is empty**: `dispatchRefused`, then the next rung down; with nothing at all, nobody comes.
- **A wreck or a car stands in the lane**: the car steers a lane round it. If it is pinned twice at the same crossing, that crossing closes for the desk and every car re-routes.
  If the graph has no path while crossings are closed, the router retries ignoring the closures.
- **Pinned within 25 m of the goal**: it counts as arrived, and the car parks where it stands. It snaps into its stall if that is within 25 m. A car left further out stays where it is, out of the pool.
- **The town is released** while units are out: every unit, beat and parked car of that desk is removed (`drop`). The desk re-adopts fresh when the town is built again (counts reset).
- **Rust Haven** keeps `systems/security.js` (the paper ladder). Inside a town with a desk, Security no longer auto-dispatches Rust Haven's bulls across the country (`g.police.owns`).
- **Shots in a town where the stars rise anyway** (`deeds.js` lawful witnesses raise `g.wanted`): the stars are untouched. The desk answers its own reports; stars stay the HUD's.

## 6. Dependencies
| This uses | How |
|---|---|
| `world/citygen/layout.js` (`T.police`, `T.roads`, `T.buildings`, doors) | the station, the street graph, a building to breach |
| `systems/citygen.js` (`live`, `buildingAt`, `built.wrecks`) | which desks exist; alarms; wrecks in the lane |
| `systems/deeds.js` (`deed` events, `find(seq)`, the witness pass) | witnesses and patrol sightings |
| `main.js g.noise` | the heard channel (hook) |
| `systems/interiors.js` (`byId`, `doors`, `kick`, `setLocked`) | alarms by door or window; the ram |
| `systems/kit.js keyUp`, `systems/knowledge.js` | the desk's lines on the air; the desk's copy of each report |
| `systems/audio.js spatial`, `tone` | the siren's falloff and its wail |
| `systems/gadgets.js` parts and glow meshes | light bars, the shield, the ram, the station lamp (hook: no new draw calls) |
| `systems/sitestories.js` places (owner) | which force |
| `systems/outdoors.js` track pool (`tx/tz/tt/tk/tw`, `visible`, `hours`) | blood and boot prints for the party |
| `systems/ambient.js shells` | brass at the spot |
| `systems/citygen.js coverNear`, `T.yards`, built `blds` | the obvious hiding places |
| `systems/vehicles.js VEHICLES` | `bullcar`; the breach truck row on the `patrol` frame |
| `data/gear.js` (NPC `c.worn` soaks) | the heavy team's helmets, vests and arm guards |

| Uses this | How |
|---|---|
| `systems/security.js` | `g.police.owns(x, z)`: no Rust Haven dispatch inside a desk's town (hook) |
| `agent/api.js` | `policeCommands`; `policeChecks` in the battery; the desk is off for unrelated checks (hook) |
| `systems/kit.js` (scanner) | hears the desk's key-ups (no change: `keyUp` already public) |
| `systems/police.js` | every police search (`search`, `inside`) is a party; blood or brass raises the case's rung |
| bounty hunters / guards (any lane) | `g.investigate.start({ members, x, z, side, until, trackSkill, onFound, onBackup })` |
| CALIBERS lane (pending) | when it lands casings and wounds that carry the calibre and direction, `scan()` can read them; today brass gives only the shooter's spot |
| timed-actions lane (pending) | `g.actions.breakIn(ram, door, { tool: 'ram' })` is called when present |
| gunfire-react lane (pending) | can file into `g.police.file({...})` or rely on `g.noise` |

## 7. Tuning Knobs
| Knob | Default | Safe range | What it changes |
|---|---|---|---|
| `STATION_TIERS.*.minBld` | 30 / 60 / 110 | must climb; 30 is citygen's station floor | which towns have which tier |
| `HEAVY_WEALTH` | 0.6 | 0.5–0.8 | rich mid-size towns with a heavy team |
| `STATION_TIERS.*.cars`, `officers` | 2/3/4, 8/14/22 | cars 1–6; officers ≥ 2 × cars | how many calls at once; attrition |
| `carBeats`, `footBeats` (per shift) | see rows | 0..cars | how patrolled a town feels; draw calls (each car is 1) |
| `RESPONSES.*.cruise` | 14 / 17 / 13 | 8–22 m/s | arrival time; crash risk on corners |
| `RESPONSES.*.search` | 45 / 70 / 110 s | 20–180 | how long they linger |
| `RESPONSES.*.perimeter` | 0 / 2 / 2 | < cars × men | corners held |
| `SEVERITY.ladder` | posse 3, heavy 5 | heavy > posse | how fast the heavy team comes |
| `CHANNELS.witness.run`, `tell` | 3.4 m/s, 6 s | 2.5–5, 2–20 | your window to stop a witness |
| `CHANNELS.heard.stationEar`, `fuzz` | 2.2, 0.25 | 1–4, 0–0.6 | how far the desk hears; how wrong the heard spot is |
| `CHANNELS.alarm.share` | 0.6 | 0–1 | how many shops are wired |
| `PATROLS.car.ring`, `dwell`, `cruise` | 1, 4 s, 9 | ring 1–3 | beat size; how predictable |
| `SIREN.range`, `audible` | 650 m, 0.012 | 300–900, 0.005–0.05 | how early you hear them |
| `INVESTIGATE.hideR`, `maxHides` | 34 m, 10 | 20–50, 4–16 | how thorough the hiding-place pass is; how long it takes |
| `INVESTIGATE.until` | 75 s (police: the response's `search`) | 30–180 | how long they keep looking with no new clue |
| `INVESTIGATE.bootSkill`, `trackSkill` | 6, 3 | 4–8, 1–8 | who can follow your boots (a tracker can; a bull can't) |
| `INVESTIGATE.sightDay/Night` | 38 / 15 m | 25–50 / 8–25 | how far a searcher picks you out |
| `FORCES.*.fine`, `jail` | 35/25/0, 4/6/0 | — | the price of the cuffs |

## 8. Acceptance Criteria
The selftest checks (`police:` in `src/agent/police-api.js`, run inside the battery) and what each proves:
1. **The rows are whole**: `validatePolice` with the real weapons, gear and vehicles. Tiers climb. Forces name real cars and can carry out an arrest. Responses use real weapons and gear. The breach truck seats six. The lights are one red and one blue, never purple.
2. **The response table by town size**: every archetype × 3 seeds, through the real `layoutTown`. Fewer than 30 buildings gives no station. Every station-holding town gets a tier. The heavy team iff precinct, major, or a rich station. The table holds at least none, post, station and precinct+heavy.
3. **A county seat keeps a precinct**: a desk at its station, a parked motor pool (≥3 cars and the truck), an armory with men, cells, and a street graph.
4. **A crime nobody saw or heard never dispatches anyone**: an unwitnessed killing plus a shot beyond the station's ear, then 60 s. No report, no case, no unit.
5. **From the station, by the streets, in time proportional to distance**: a theft radioed in from 110 m and from 330 m of street (the channels have their own checks; this one is the drive). Each unit starts within 30 m of the station. ≥85% of its samples are on a street. Time ratio / route ratio is within ±45%.
6. **The reported spot, not your true position**: a shot the station hears, then you teleport 200 m off. The reported spot is >3 m from the real one. The car parks <30 m from the *reported* spot and >120 m from you, and there is no contact.
7. **Sirens before arrival, from the right direction**: a posse to a spot beside you. `sirenHeard` comes before `policeArrived`, while the unit is still rolling, from >60 m. Its bearing is within 20° of the car's true bearing at that moment.
8. **A witness runs; stopped, the word never arrives**: the first runner is killed, which gives a silenced report and no case. A second runner reaches the station and opens the case in 0.6–2.2× their run time.
9. **The heavy team stacks and breaches**: a severity-6 report naming a shop with a locked door. The breach truck brings six. `policeStack` reports the shield and the ram. `policeBreach` follows, and the door is unlocked.
10. **The heavy team only where kept**: the same severity-6 call in a station-sized grain town brings two bull cars and no truck.
11. **Patrols on schedule**: at 09:00, the day shift's car beats leave from within 30 m of the station. A car makes ≥3 corners, in loop order, starting at its first corner. At 18:00 every day beat goes home (`beatIn`), and the night shift's car beats are out.

12. **Investigate: the obvious spot, and the one who left**: a generic party of two (not police) starts at a street spot.
    You hide inside the nearest building that can't be seen from the spot: they go inside and find you.
    You were moved 170 m off before they came (staged, so no prints) and nobody saw you go: they never get within 60 m of you, and they give up.
13. **Investigate: no clue, no beeline**: while you sit 120 m away, every place the party goes is the spot, a hiding place or a sweep point within 60 m of the spot. None is within 40 m of you. No clue is found, and you are not found.
14. **Investigate: a blood trail**: drops laid from the spot to 24 m round the next corner, more than 50 m from the spot, beyond the hiding-place pass. The party reads the blood, takes at least 3 steps along the trail, and finds you.

Also required of the lane: full selftest green twice on fresh pages, `scenario name=stress` with no regression, <150 draw calls, `ip-lint` 0 deny.

## Not done / follow-ups
- Witnesses really run, but nobody *phones*: the world has no phones, which is deliberate. A radio-holding townsperson could key up the desk (a future channel).
- Wanted stars and the desk are separate ledgers. The HUD star still comes from `deeds.js`. A future pass could show "the desk has a case on you" instead.
- Security's Rust Haven bulls still drive to your true position (`security.js` `dispatch`/`update`, not this lane's to rewrite). Porting Rust Haven onto a desk is the clean fix.
- The breach uses the door's own kick until the timed-actions lane lands `g.actions.breakIn`.
- The last ≤25 m into a stall snap rather than drive. A car wedged within 25 m of a scene parks where it stands.
- Saves: the desk is rebuilt from the town when it is built again. Parked cars are saved as plain vehicles if the game saves while they stand there.
