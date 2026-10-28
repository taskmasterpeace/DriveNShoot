# WEB_CREW — the crew and the tactics brain

**Status:** v1 built on `feat/web-crew` (2026-10-27). Gap spec: `WEB_DEATHLANDS_GAP.md` G3, §4.4, §5, §8 acceptance 7.
Genre reference: `docs/research/GENRE_DEPTH.md` §2 (jobs) and §5 (tactical AI).
Code: `src/data/crew.js`, `src/data/crewjobs.js`, `src/data/doctrine.js`, `src/systems/crew.js`, `src/systems/tactics.js`,
`src/ui/crew.js`, `src/agent/crew-api.js`, scenarios `crew-run` and `firefight-lab`.

---

## 1. Overview

A crew you **assemble, lead and lose**. Robert (2026-10-27): "the band is 1 to 6... you start off solo"; "if you're
gonna have a crew, they're gonna have to do stuff"; "make sure the AI uses the environment, and distance and flanking";
"this is a top-down game"; "we want it to be multiplayer"; "do not get caught up in the visuals".

- **The crew is 1 to 6 counting you.** A new game starts solo (`crew` reports `size: 1`).
- **The crew walk the world as top-down people.** The CREW panel is UI, not a world view.
- **The crew is per-player state.** It is in the save and in the shard snapshot (portable: records only, bodies made
  again round you at login).
- **One tactical brain** (`systems/tactics.js`) moves every fighter that has a doctrine row: your crew, the Dustwolves,
  the Federal Remnant, Rust Haven's bulls and drifters. The infected keep their own swarm-by-noise brain
  (`systems/zombies.js`); their doctrine row says so (`on: false`).

## 2. Player fantasy

- **The Deathlands reader:** a band of mismatched people, each with one thing they're known for and one thing that goes
  wrong; you can lose any of them, and the road remembers.
- **The XCOM / Jagged Alliance player:** people who take cover, keep their range, flank while others pin, break when the
  squad is cut down.
- **The Zomboid player:** they eat, they drink, they get tired, they cost rounds; jobs at camp and at a base.
- **The GTA2 player:** none of it gets in the way. Tap U, hold U, or just drive.

## 3. Detailed rules

### 3.1 Rows (`data/crew.js`)
- **The 8 CREW CARDS** (archetype rows, from `WEB_ATLAS.md` §3.3, in our words): the Wheel Boss, the Static-Ear, the
  Quartermaster, the Marsh Kid, the Sleeper, the Thrown Man, the Prospect, the Scrap Smith.
- **20 generic hireables** in the same schema: drifters, a sutler's guard, a caravan driver, a field medic, freed
  captives, a turned Dustwolf, a Remnant deserter and more.
- **Each row has:**
  - `names` and `flags`: the pool (every flag is drawable in `ui/portrait.js`);
  - `look`, `hand`, `weapon` and `rounds`;
  - `signature`, and a `flaw` with an id the system reads;
  - `skills` 1-5 in eight crew skills;
  - `ai`: the atlas's moves / cover / retreat / ammo columns, plus the tactics knobs `bandMul`, `coverPref`, `breakAt`,
    `thrift`, `flank`, `stray`, `hardCoverOnly`, `highGround`, `vehicleCover`;
  - `values`: −5..+5 per deed verb or crew event;
  - `trustStart`, `pay`, `role` (the EARN route), `hp`.
- **Caps:**
  - `CREW_RULES.cap` 6 (with you).
  - `archetypeCap` 4: at most 4 of the 8 cards in one crew (IP law, bible §3.5 row 13). A card joins at most once.
  - Generics are unlimited.
- `validateCrew(rows)` checks the ids, flags, guns, skills, value keys, ranges and caps.

### 3.2 Joining: four ways, no API needed
| Way | Where (fresh game) | How | Trust starts |
|---|---|---|---|
| talk | the Wheel Boss by Rust Haven's east gate road (6, −22); the Sleeper at Meridian's clinic door | dialogue: **"Ride with me."** | the card's `trustStart` (Wheel Boss 40, Sleeper 50) |
| hire | a sutler's guard in Rust Haven (−12, −26) | dialogue: **"Hire on: $40 a day."** (pays the first day) | 10 |
| rescue | two captives tied up at Dustwolf camp 0 (the west flats) | dialogue: **"Cut them loose. 'Ride with me.'"**; records a `rescue` deed | 35 |
| earn | appears 12 m behind you when a role reaches renowned | dialogue as talk | at least 50 |

- Candidates are records (`CREW_SEEDS`). The island's always stand; Meridian's stand when you are within 150 m.
- Captives are nobody's fight while tied up (`ai.hostile` ignores `captive`).
- **A full crew:** the join choice is replaced by a greyed line, "(The crew is full: six. Swap someone out at the CREW
  panel, U.)".
- **A 5th card:** its join choice never appears.
- **Shared dialogue lines** (all in `systems/crew.js`, `candidateTalk` / `memberTalk`):
  - candidates: "Ride with me." · "Hire on: $N a day." · "Cut them loose. 'Ride with me.'" · "Cut them loose and let
    them go." · "(The crew is full: six...)" · "What can you do?" · "[Leave]";
  - members: "Take some rounds." · "Hand me your gun for a while." · "Here: carry my gun." · "You are free to go. Take
    your share."

### 3.3 Orders (hold U = radial; pad: hold LB + right stick)
Thirteen wedges for the ten orders:
- **FOLLOW** in the current formation (slots in your frame; the old follower brain when you are in or on a vehicle);
- **HOLD HERE** (stand at the spot; fights from it; tactics `force: holdpos`, 3.5 m search);
- **TAKE COVER** (the best cover near where they stand, crouched);
- **WEDGE / FILE / SPREAD** (the formation rows in `CREW_RULES.formations`);
- **FOCUS MY TARGET** (the hostile nearest your aim);
- **FREE FIRE / HOLD FIRE** (hold: they move and take cover but never shoot);
- **FALL BACK TO THE RIG** (run to your car and board a seat or the bed, then shoot from it);
- **MAN THE GUN** (board, work the hood gun if it is fitted, else their own gun);
- **LOOT THIS** (walk to the box nearest your aim, bring its contents to your pack);
- **STAND WATCH** (makes camp at your spot; stand and turn).

On a pad the radial's centre, let go with the stick at rest, opens the panel. LB's tap is still the grip, and the radial
puts the grip back when a hold opened it.
- **Refusals:** under −25 trust, members refuse the risky orders (focus, man the gun, loot, hold here).
- **The Prospect's flaw:** he only falls back when told twice inside 6 s.

### 3.4 The CREW panel (tap U): tabs, never one long scroll
Robert (2026-10-27): "Just use tabs." The panel has six tabs. TAB cycles them and 1-6 jump to one while the panel is
open; the pause menu also gets a CREW tab through `qol.addTab`, when that build has it.
- **ROSTER:** the member cards described below, plus **your dogs** (`dogs.mine()`: breed, bond tier, health, order).
  Dogs are part of the crew but do not count against the six.
- **ORDERS:** every order for everyone, and the common ones per member.
- **JOBS:** a job picker per member with its live/waiting state and progress; MAKE CAMP and CLAIM BASE; the last pins.
- **GEAR:** gun, mag and spare rounds; GIVE ROUNDS, TAKE GUN or GIVE GUN, DISMISS.
- **BONDS:** trust toward you, what each pair thinks of each other (FRIENDS … RIVALS), and the lines heard lately.
- **WALL:** the fallen crew and dogs.

The roster card (the rest of this section is the card):
- One card per member. The member's **flag is the card's backdrop**, under a dark gradient.
- **On each card:**
  - the portrait, name, card name and country;
  - bars for health, food, water and rest;
  - trust, a centred bar from −100 to +100;
  - the gun as `mag/size · N spare`;
  - the flaw, and the status (the order and fire, DOWN with its bleed clock, or ON A RUN with its return hour);
  - the job and whether its place is live.
- **Card actions:** a job picker; GIVE ROUNDS (rounds of their gun's kind from your pack); TAKE GUN or GIVE GUN; DISMISS
  (confirmed: they take their share).
- **The header:** WEDGE, FILE and SPREAD; MAKE CAMP; CLAIM BASE HERE.
- **The footer:** camp, base, pins, and the last names on the memorial wall.
- **With no crew:** a large icon in a circle and "You ride alone...".

### 3.8 Talk: barks, camp talk, bonds, interjections (`data/crewtalk.js`)
- **Every line goes through one place** (`crew.say`): the subtitle, `g.voice.speak`, and the `crewSay` event
  `{ rec, name, kind, line, to, ctx }`. kind is bark | camp | interject | one of the BARKS kinds. The voice/LLM lane can
  voice any line, or replace it with a generated one built from `crew.context(member)`: card, flaw, signature, style,
  values, trust, needs, order, job, the last 8 deeds they remember (kind, sign, place, target, day), their bonds with
  the others, and the last lines heard.
- **Barks** (rows by kind and card style): down, saved, kill, dry, order ack, refuse, approve, disapprove, last stand,
  callout, a won fight.
- **Memories:** every deed that moved a member's trust is remembered (8 deep, in the save).
- **Bonds between members** (pairwise −100..100, in the save): they start from how alike their values are
  (`Σ va·vb·2`, clamped ±40) plus flaws that rub or fit (`FLAW_CLASH`, e.g. the talker and the town-hater −20). Two who
  both saw a deed and took it the same way +1.5; opposite ways −3 (the seed of a quarrel).
- **Camp talk:** at the camp, at night or while you sleep, a line every 35-70 s, in this order:
  1. the strongest deed a member remembers and has not told ("You put down an empty-handed man at {place}. Tell me why.");
  2. else the pair with the strongest feeling: friends, rivals, or a quarrel under −60 that pulls you in (the bond moves
     ±2 toward its sign);
  3. else a flaw's small talk.
- **Interjections:** as you open a conversation, a member within 14 m whose value for the row's verb is high enough
  speaks up. Rows: a hurt person (heal ≥ 3: the Sleeper), a trader (trade), a warden, a Dustwolf.

### 3.5 Jobs (`data/crewjobs.js`)
A job = **skill + inputs + outputs + duration + risk**, run on the game clock:
- progress per tick is `hours / job.hours × (0.5 + 0.25 × skill)`;
- a cycle with no inputs waits;
- every job is assigned from the panel or with `crewJob`.

| Where | Job | Effect |
|---|---|---|
| road | DRIVER | takes the wheel of your rig (you slide over; `seats.js` chauffeur) |
| road | GUNNER | works the hood gun or a window at hostiles within 48 + 4×shooting m |
| road | NAVIGATOR | each hour on the move (speed > 4 m/s): a pin 300-800 m ahead |
| road | LOOKOUT | names a hostile within 60 × (0.6 + 0.1×scout) m with its bearing and range |
| camp | STAND WATCH | as lookout at 40 m; wakes you if you sleep |
| camp | COOK | eats one food item from your pack: +0.35 × mul food for every member (and half for you) |
| camp | MEND GEAR | a rag: worn gear and guns gain condition |
| camp | CLEAN GUNS | every gun you carry +0.06 × mul condition, jams cleared |
| camp | TEND WOUNDS | +18 × mul hp to you and every member |
| base | GUARD POST | holds the base spot, turning; calls what comes |
| base | SCAVENGE RUN | off-screen for 6 h / mul (described below) |
| base | REPAIR VEHICLES | scrap: the rig near the base +15% hp × mul, parts fixed |
| base | CRAFT AMMO | scrap: 8 × mul pistol rounds to the stash |
| base | RADIO WATCH | every 4 h: a pin (a distress call, a cache on the band) |
| base | FARM PLOT | a stub: a ration every 12 h (the base lane grows it) |

- **The SCAVENGE RUN:** the body leaves the map and the record waits.
  - The risk roll is seeded (member id + the hour they left): trouble = `risk × (1.25 − 0.1 × scavenge)`.
  - Trouble twice means they do not come back, and they get a grave.
  - Otherwise they come back with three loot rolls (`CREW_RUN_LOOT`) and maybe a pin, hurt if there was trouble.
- **A base** is `crew.base`, claimed at a spot (the panel or `crewJob claimBase=true`). This is the hook a
  base-building lane plugs into: it sets `crew.base` to its building, and the stash container `crew:stash` stands
  there. Base output lands in the stash while you are away from the base, and in your pack when you are there.

### 3.6 Tactics (`systems/tactics.js`, `data/doctrine.js`)
`ai.js` still decides **when** a fighter shoots; tactics decides **where they stand**. It is called from the fight
branch of `ai.js` for every unit with a target, and it re-plans at `thinkHz` 5, with at most `perFrame` 6 plans a frame
(staggered).
- **Band:** `BANDS[weapon] × doctrine.bandMul × card.bandMul` (pistol 7-18, smg 9-22, shotgun 3-9, rifle 25-45).
- **Cover candidates:**
  - **(a)** The nearest 10 collision boxes within the search radius (the island's grid or the streamed ring's cells):
    the spot just behind each one from the threat.
  - **(b)** 10 probe rays from the threat through points round the anchor. A hit short of the point means something
    stands between, so the spot behind its face is a candidate.
  - **(c)** Parked vehicles: the spot behind them from the threat.
  - **(d)** Where they stand now, plus a stay bonus (hysteresis).
- **Score:** `S = 3·exposure·coverPref + 1.5·bandFit − 0.05·walk + 0.6·rise·highGround − 1.2·crowd + 2.5·flankFit + 0.4·car`.
  - `exposure`: 1 = low cover (hidden crouched, eye clear standing), 0.7 = full cover, 0 = open.
  - `bandFit = clamp(1 − |d − mid| / half, −3, 1)`.
  - `crowd`: a squadmate's goal already within 1.6 m.
  - `flankFit` (flankers only): 1 inside 60-120° off the target's facing.
- **The peek:** on the street every box stops a round, low or not. So a fighter in cover with no line gets a PEEK spot
  1.3 or 2.4 m to one side where the eye clears the edge. They lean out to shoot for 1.6 s and duck back for 1.8 s, and
  stay in while suppressed above 0.55.
- **Roles in a squad** (same side, same target, within 30 m):
  - **PIN:** hold a cover point in band. With no line of sight, suppressive fire at the last-seen spot, at a slow rate.
  - **FLANK:** a point 90° off the target's facing at `mid × flankWide`, by cover. The flankers are the highest-index
    `round(n × flank)`.
  - **BOUND / OVERWATCH** (the Remnant): halves swap every `boundS`.
  - **RETREAT:** morale under `breakAt`, back 22 m by cover for `regroupS`.
  - **HOLD:** the bulls never stray past `holdR` from their post.
  - Crew orders force **cover** and **holdpos**.
- **Suppression:** a shot from a shooter facing within 10° of a unit within 45 m adds `0.3 × (1 − off/cone)`, decaying
  0.4/s. It costs aim (spread × (1 + 1.6·supp)), hugs them to cover (crouched, creeping), and counts against morale.
- **Morale:** `1 − 1.2·fallen/(n + fallen) − 0.4·supp − 0.3·wounds`.
- **Doctrines:**
  - **Dustwolves:** aggressive; flank 0.55 swinging wide (×1.25); low cover preference; break at 0.3; their buggies
    already ram (`vehicles.js`).
  - **Federal Remnant:** disciplined; bounding overwatch; suppression 0.9; high ground.
  - **Rust Haven bulls:** hold the gate (`holdR` 26).
  - **drifters:** skittish, break at 0.6.
  - **the infected:** off; they swarm by noise.

### 3.7 Trust and mortality
- **Trust:** the formula and its thresholds are §4. They are read from the chronicle every 0.5 s: every record whose
  actor is you, against each member's own values.
- **Derived events:**
  - `killUnarmed`: the target had no gun;
  - `killRaider`: the target was a Dustwolf;
  - `shotCrew`: you hurt one of yours;
  - `winOutnumbered`: hostiles down by you and yours inside 25 s ≥ crew size + 2;
  - `abandonCrew`: a member bled out with you over 40 m away;
  - `savedCrew`, `paid` / `unpaid`, `fedCrew` / `starved`.
- **Going down:** a member's body hitting 0 hp goes DOWN, not dead. Doc Reyes's walk home does not apply (crew takes the
  body).
  - The bleed clock is 75 s, running at ×0.6 while dragged.
  - **Tap E** beside them with a bandage, rag, suture kit or first aid kit: they stand at 35% hp.
  - **Hold E:** you drag them, at 2.2 m/s, hands busy.
  - A headshot, a blast or a burning ends it outright.
- **Death:**
  - a grave by the body (`crew.graves`);
  - a line on the memorial wall (`crew.memorial`: name, card, flag, day, days riding, saves, kills, why);
  - a `crewDied` chronicle record (named, so it reaches the legend);
  - the radio obituary on STATIC 1660 (`director.radio`).

## 4. Formulas
- **Trust (gap §4.4):** `ΔT = weight · value(member, kind) · (1 seen | 0.4 heard)`.
  - `weight` is the deed's magnitude clamped to 1-4, or the crew event's own weight.
  - `seen` means within 34 m and in sight.
  - Daily drift toward 0 by 2.
- **Trust thresholds:**
  - T < −25: refuses risky orders.
  - T < −40 at dawn: leaves with `floor(cash / (members + 2))`.
  - T < −80 with a Dustwolf camp within 500 m: turns (faction raider, targets you).
  - T > 60: the last stand. When you are under 30% hp, they step between you and the shooter.
  - **Example:** the Sleeper sees you kill an unarmed man. killUnarmed, weight 3 × value −5 = **−15**. Heard at camp:
    −6.
- **Job speed:** `mul = 0.5 + 0.25·skill`; a cycle every `hours / mul` game hours.
- **Needs per game hour:** food −0.03, water −0.05, rest −0.035 (+0.07 while you sleep). Under 0.25 at dawn is the
  `starved` event. Water from a canteen in your pack at dawn.
- **The tactics score, suppression and morale:** §3.6.

## 5. Edge cases
- **A two-seat car:** the extras ride the bed or deck when there is one (`decks.room`). Otherwise they stand by it
  crouched.
- **A member killed carrying things:** the body keeps its gun as a body container (the existing law).
- **A full crew:** the dialogue choice is greyed. **A 5th card:** no choice at all.
- **The flaw "wanderer"** (the Thrown Man): mid-fight he may drift off for 4-8 s and say why.
- **The flaw "healer"** (the Sleeper): she stops to patch hurt strangers within 10 m.
- **The flaw "hoarder"** (the Quartermaster): taking his gun costs trust.
- **Dry:** a member out of rounds says so ("I am dry! Rounds!") and stops shooting until you give rounds.
- **Riders:** `ai.js` skips anyone in a seat, so the crew's riders are worked from `crew.update` (`ride`).
- **Shard play:** `crew.save({ portable: true })` carries no character ids. Candidates and members are made again round
  you at login, and this page's own seeded candidate bodies are replaced.
- **Pad LB:** shared with the grip's tap; the radial restores the grip.
- **KeyU is shared:**
  - **with the workshop** (on feat/web-engine): at a garage site (`workshop.siteAt`), U opens the workshop. Anywhere else
    U is the crew's (tap = panel, hold = radial), and the pad's hold LB is the crew's everywhere.
  - **with the gadgets lane** (`detonate`, also KeyU): not landed yet. See the shared notes.
- **MAN THE GUN and GUNNER** fire the workshop's mounted weapons first (`workshop.fireMount`, group 1, in arc), then the
  old hood gun, then their own gun.

## 6. Dependencies
- **Reads:**
  - `systems/seats.js`: board, leave, cycle, followThink, the chauffeur;
  - `systems/decks.js`: room, climb;
  - `systems/ai.js`: move, hostile, the fight branch;
  - `society.chronicle` and `deeds.record`, `director.radio`, `inventory`, `garage.fireFront`, `carCombat.fireFromVehicle`;
  - `regions.clinic('meridian')`, `world.spawns.camps`, `roles.atLeast`, `nav.foot.find`, `statics`.
- **Shared-file hooks:**
  - `main.js`: imports, construct, seed, input, update, crewUI.update, onKill;
  - `systems/ai.js`: onNoise → tactics.onShot; beginFrame; the crew think hook; tactics in both fight branches; hold
    fire; aim × suppression; captives never hostile;
  - `agent/api.js`: commands, checks, snapshot, restore;
  - `net/shard.js`: personal and applyPersonal;
  - `data/controls.js`: the `crew` row.
- **Plugs in later:**
  - a base-building lane sets `crew.base` and owns the stash;
  - camp talk and interjections (G3.8) read `crew.members[*].row.values` and the chronicle;
  - the stats lane can map `row.skills` onto `systems/skills.js`.

## 7. Tuning knobs
| Knob | Default | Range | Affects |
|---|---|---|---|
| `CREW_RULES.cap` | 6 | 1-6 | party size (with you) |
| `CREW_RULES.archetypeCap` | 4 | ≤ 4 (IP law) | cards per crew |
| `trustDecayPerDay` | 2 | 0-5 | forgiveness |
| `heardMul` | 0.4 | 0-1 | how much camp talk counts |
| `bleedOut` | 75 s | 30-180 | time to save a downed member |
| `TACTICS.thinkHz` / `perFrame` | 5 / 6 | 3-10 / 2-12 | plan rate and cost cap |
| `TACTICS.w.*` | as §3.6 | — | cover vs band vs walking |
| `TACTICS.peek` | 1.6 out / 1.8 in | — | how firefights trade |
| `DOCTRINE.<side>.*` | rows | — | temperament per faction |
| `BANDS` | rows | — | range per gun |

## 7a. Commands
- **`crew`:** the summary, `id=`, `validate=true`, and the debug verbs `trust= seen=`, `down=`, `patch=`, `dawn=`.
- **`crewJoin`:** `key=`, `id= row=`, `spawn=`, `how=`, `leave=`.
- **`crewOrder`:** `order= who= x= z=`.
- **`crewJob`:** `id= job=`, `claimBase=`, `camp=`, `advance=<hours>`, `jobs=`.
- **`tactics`:** `id=` gives a unit's role, why, goal, cover, peek spot, band, distance, off-facing angle, suppression,
  morale, squad and path. No id gives every unit plus the counters. `on=false` gives the A/B.
- **Scenarios:**
  - `crew-run`: recruit by talk and hire, drive to camp 0, a wedge assault, cut the captives loose, make camp with a
    watch and a cook;
  - `firefight-lab`: the crew of four vs six Dustwolves in a cover-rich block. It reports the roles, cover samples,
    breaks, suppression, casualties and plan cost.

## 8. Acceptance criteria (selftest checks, all named `crew:` / `crew order` / `crew trust` / `crew jobs` / `tactics`)
1. **The rows:** the 8 cards, 20+ generics, the jobs and the doctrines validate, and a fresh game starts solo.
2. **A fresh game recruits through dialogue** (the Wheel Boss, "Ride with me.") with no agent join (gap acceptance 7).
3. **Rescue and hire:** a captive cut loose by dialogue starts at trust 35 and leaves a rescue deed; a hire pays $40 and
   starts at trust 10.
4. **The caps:** 6 with you; a 5th card refused and its choice hidden; the full crew's choice greyed.
5. **The panel:** tap U opens it, one card per member with a flag image as the backdrop; tap again closes it.
6. **The radial:** hold U opens it, and letting go on a wedge gives that order.
7. **Each order has a check:**
   - FOLLOW and FILE / SPREAD: the slots;
   - HOLD HERE and TAKE COVER: no drift, crouched;
   - FOCUS, HOLD FIRE and FREE FIRE;
   - FALL BACK and MAN THE GUN: aboard, the gunner hits;
   - LOOT THIS: the contents into your pack;
   - STAND WATCH: camp made, a callout.
8. **Trust:** killUnarmed seen = −15, heard = −6; refusals under −25; leaving at dawn with a share; drift 2/day.
9. **Down → patch:** tap E with a bandage. **Drag:** hold E, they move more than 5 m with you.
10. **Death:** a grave, the memorial, a chronicle record, the obituary.
11. **Save → load keeps the crew,** and the shard-portable save round-trips.
12. **Jobs:**
    - tend, clean and cook over a game hour;
    - the scavenge run leaves and returns with loot (or a grave), and base jobs need a base;
    - lookout calls a raider, and the navigator pins.
13. **Tactics flank:** a Dustwolf squad against you behind a wall has a raider ≥ 60° off your facing within 20 s.
14. **Tactics band:** a rifleman spawned at 12 m backs off and holds 25-45 m.
15. **Tactics suppression:** it rises past 0.5, aim × 1.5 or worse, and it decays.
16. **Tactics cover:** a pinned raider picks a point hidden from you crouched, behind the sandbags.
17. **Tactics doctrine:** the Remnant take both BOUND and OVERWATCH; drifters break when half the squad falls.
18a. **Bonds:** the talker and the town-hater start at least 20 under the values' bond; a robbery one cheers and one
    hates drives them apart (a `crewBond` event, same: false).
18b. **Camp talk:** at camp at 23:00 the Sleeper brings up the unarmed man you killed; the `crewSay` event carries kind
    camp and the memory as its context.
18c. **Interjection:** opening a talk with a hurt stranger with the Sleeper beside you gives a `crewInterject` event.
18d. **The panel's tabs:** all six draw for five members without a scroll, and your dog is on the roster.
18. **Tactics cost:** the average plan is under 0.3 ms, under 1% of plans over 2 ms (a max over thousands of timings measures GC pauses), a nav path under 8 ms.

**Not yet (next lanes):**
- influence maps and threat-weighted paths (GENRE_DEPTH §5.4);
- pre-baked cover nodes with normals and materials;
- grenades into cover held for more than 6 s (`ai.js` already lobs over cover);
- AI driving a car into position as mobile cover;
- camp talk and interjections;
- the pack screen's CREW column (give and take is on the CREW panel and in the member's talk for now);
- the crew walking down into the Carousel with you (G6).
