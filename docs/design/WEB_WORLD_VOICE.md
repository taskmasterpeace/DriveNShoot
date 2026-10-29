# WEB_WORLD_VOICE: the world tells you its stories

Lane WORLD-VOICE (Wave 2 follow-on of `WEB_DEPTH_PLAN.md`). Branch `feat/web-world-voice`.
Code:
- `web/src/data/worldvoice.js`: every row, plus `validateWorldVoice`.
- `web/src/systems/farsound.js`: ambience layers, and far real events.
- `web/src/systems/feed.js`: the radio as a world feed (built on `systems/knowledge.js`).
- `web/src/systems/marks.js`: readable leftovers.
- `web/src/systems/campfire.js`: campfire scenes.
- `web/src/ui/radiofeed.js`: the HUD feed (the `radiofeed` row of `data/hudlayout.js`).
- `web/src/agent/worldvoice-api.js`: the `farsound`, `feed`, `marks` and `campfire` commands and 10 checks.

Renders: `docs/renders/web/world-voice/`:
- `01-tagged-wall.jpg`: the Dustwolves' DW on a Miami Metro wall between the windows.
- `02-tally-marks.jpg`: 17 strokes for its dead.
- `03-dont-go-north.jpg`: Miami Metro's board, DON'T GO NORTHEAST / INTERSTATE EXIT CLUSTER FELL, painted once it held the news.
- `04-campfire-night.jpg`: the crew sat round a fire at night.
- `05-radio-feed-hud.jpg` and `05b-radio-feed-hud-crop.png`: THE WIRE on the HUD, three lines with their ages.

## 1. Overview
Robert, 2026-10-29: "Sound gives about half the sense of depth for nearly no CPU", "the world tells you its stories", "it costs nothing in render time, gives the loop a breather", "it shows the persistent world working without new art".
Four things the world says, each built on what already exists:

| part | what it does | built on |
|---|---|---|
| **ambience** | Layered synth voices (insects, crickets, katydids, frogs, tree frogs, wind, gusts, surf, the hum of dead wires), mixed by the biome under you, by region, day and night, rain and dust. It is crossfaded once a second, so a biome border is heard as you cross it | the recorded beds (`soundscape.js`) stay; this rides beside them |
| **far sound** | A shot, a volley, a blast, an engine, the dead or a town's dogs, heard far off from the true bearing, after distance / 343 m/s. **Only** from a real source | `combat.fire`, the chronicle, `g.vehicles`, `overrun.hordes`, the pulls' towns |
| **the feed** | Two feed stations, THE WIRE (1480 AM) and TALLY NIGHTLY (1590 AM). Each is a town's set, reading out what *that town holds*, with how old the news is. It hedges when the copy is shaky, and gets a count wrong when the copy is very shaky. Text goes in the HUD; key lines go to the station voice | the knowledge model and the grapevine (`WEB_PULLS.md`), `radio.js`, `voice.radio` |
| **marks** | Raiders' tags on a raided place's walls and in its street, tally marks for its dead, DEAD INSIDE on an overrun town, DON'T GO NORTH painted by a town that heard of a fall, the words on a grave, and a cold ring of ash where a fire burned | the chronicle, `citygen` buildings, `rites.graves`, knowledge holders |
| **campfire** | Stop at night, out of the car, with your crew. A fire is made, and the crew talk from your stats, the land and real recent events. The clock passes, and you get rest and morale | `crew.say` (voice and LLM hook), `survival`, `stats` morale, the fx light pool |

Which of scarcity, distance and consequence this makes bite harder:
- **Distance:** a shot to the north-east, three seconds late, is a fight about a kilometre away. A town's dogs at night mean people that way.
- **Consequence:** the places you raided wear your enemies' tags, and the walls count the dead. The radio tells the next town what you did, once somebody saw it.

## 2. Player Fantasy
You pull off the I-10 after dark and kill the engine. Crickets come up over the wind. Far off to the north-east there is one shot, then nothing, and you know it was real.
You tune to 1480: "Word is, raiders out of the Dustwolves hit the Silver Strip. That was yesterday." You check the map. The board on the Strip's road reads DON'T GO EAST, and the Dustwolves' red DW drips down the gas station wall beside thirty-one chalk strokes.
Mara builds a fire. "That shooting earlier, off to the north-east. Somebody is having a worse night than us." The clock runs two hours. When you drive off at dawn, the ring of ash stays.

## 3. Detailed Rules
### 3.1 Ambience (rows: `AMBIENT_LAYERS`, `BIOME_AMBIENCE`, `AMBIENCE`)
- **A layer** is one Web Audio voice: noise, sine or saw, through a filter, with an amplitude pulse (cicada buzz, cricket chirp trains, frog croaks) and a slow swell.
  - It is built the first time a mix wants it, then only its gain moves (`setTargetAtTime`, fade 2.2 s).
  - It is synthesized from rows. No recording is used, and nothing trains on any library (the N: studio rule).
- **The biome** is read under you, once a second:
  - `W.biomeAt` gives the key, and the region's own biome row gives the name (Florida's `swamp`, `pine flatwoods`, `the coast`...);
  - otherwise `BIOMES` gives the name (`desert`, `scrub`, `urban`...).
  - A region can override a biome row: `BIOME_AMBIENCE.florida.swamp` is louder at night.
- **The mix** = day level × (1 − night) + night level × night, then:
  - rain: insects ×0.25, frogs ×1.4, wind ×1.2;
  - dust: wind ×1.8, gusts ×1.6, insects ×0.4;
  - under a roof or underground: everything ×0.35.
- **A biome border:** the name changes, `borders++`, and a `biomeSound` event goes out. The crossfade takes about 2 s.

### 3.2 Far sound (rows: `FAR`)
- **A sound is queued only from a real source.** There is no other door:

| source | what | where from |
|---|---|---|
| `shot` | a round fired by a body | `combat.fire` (1 hook) |
| `chronicle` | a `skirmish`, `took`, `raided`, `fell` or `repelled` row (or a director ambush or raid outcome) written off screen (`src` sim/story/director) | the row's x, z, or its place |
| `vehicle` | a vehicle with a driver, moving over 4 m/s | `g.vehicles` |
| `mover` | a site-stories party by car | `g.stories.movers` (once that lane lands) |
| `horde` | an overrun horde with strength | `citygen.overrun.hordes` |
| `dogs` | a town with people (not overrun). It barks at night; by day only when something real moves within 220 m of it (a horde, a driven car, a mover), and then every 5 s | the pulls' town nodes |

- **Carry:** each kind has a `range`, cut by rain (×0.6), dust (×0.75) and a roof (×0.55). It also has a `near`: inside it, the ordinary sound already plays the thing (`audio.gun` covers shots to 520 m), so the far layer never doubles it.
- **Delay:** the sound lands at `fired + d / 343` seconds of game time. Its pan is `dx / d`, and its caption names the bearing (`[a shot, far off · NE]`).
- **Fixed pools:** a 32-slot queue and a 48-row ledger. Each source is held to one sound per its `gap` (engines 9 s, the dead 7 s, dogs 26 s).

### 3.3 The feed (rows: `NEWS`, `FEED`, `STATIONS` kind `feed`)
- **News is made only from a witness.**
  - A chronicle row with a `NEWS.verbs` verb becomes a `news` fact only if:
    - a town stands within 900 m of it (that town holds it as `saw`); or
    - the row has witnesses and is not flagged unwitnessed (the nearest town holds it as `said`, from the people who saw it).
  - Otherwise nobody holds it, it is counted `unwitnessed`, and it is never on the air.
  - Rows from site stories (`src: 'story'`) are left to that system's own `story` facts.
- **Markets:** at 06:00 each game day, a town that keeps a market knows its own market is open. That town holds a `market` fact as `saw`. Towns that keep one are Rust Haven and the county seat, neighbourhood, trading-post and market archetypes, unless overrun.
- **The grapevine** (pulls) carries every fact from town to town at 450 m per game hour. This lane does not touch it.
- **A feed station** is a town's set:
  - Its **mast** is the nearest town node inside the station's range (WIRE 9 km, TALLY 12 km).
  - It reads one copy **the mast town holds**, of a kind the station airs (WIRE: news, story, market, death, funeral, caravan, work; TALLY: posting, bounty).
  - The copy must still be news, and not read at that mast in the last 18 game hours. Key lines go first, then the freshest.
- **The read:**
  - If the copy's confidence is under 0.62, the line opens with a hedge ("Word is"). Otherwise it opens with a plain lead.
  - Under 0.5, the first number in the text is shifted 1 to 3 (the same way every time for that fact at that mast).
  - The age comes last, by hours old (`FEED.ages`): under 1 h "just now", under 6 h "a few hours back", under 18 h "earlier today", under 42 h "yesterday", under 96 h "a couple of days back", otherwise "a while back".
- **Who hears it:**
  - You, if you can hear a radio and are tuned to that station.
  - Every knowledge holder with a set inside the range.
  - Each gets a `radio` copy from `mast:<town>` with the mast's where, when and text, never the world's.
- **On the speaker:**
  - the subtitle;
  - the HUD feed (the last 3 lines; it fades after 50 s or when you tune away);
  - the stinger;
  - the `radioLine` event.
  - Key lines (postings, bounties, falls, takes, raids) also go to `voice.radio`, which plays a locked, rendered station voice when one exists and is silent otherwise. Nothing here generates new audio.
- **The air gap** is 26 to 44 s while tuned. With nothing new to read, the station plays static.

### 3.4 Marks (rows: `MARK_KINDS`, `MARK_RULES`, `TAGS`, `MARK_TEXT`, `PAINT`)
| kind | made when | cause | text |
|---|---|---|---|
| tag | a chronicle row `took`/`fell` (raiders = `af`), `raided` (raiders = `of`), `raid_won` | that row's seq | the raiders' letters and word, in their colour, with a scrawl (teeth, star, bar, arrow); 2 to 4 per raid on walls and in the street |
| tally | a `kill`, `silence`, `raided` (its "N dead") or `skirmish` row with a place | the rows' seqs | strokes of five, one tally per place that grows (to 40) |
| warning | a planned town that is `overrun` (DEAD INSIDE); a site story's sickness, toll, dry well or nest | the state or the story | from `MARK_TEXT.warning` |
| dontgo | a town near you holds a `news` fact (or a story) that a place within 14 km fell, was taken or raided | the fact id and the holder | DON'T GO <dir> / <PLACE> FELL, dir from the town to the place |
| grave | a grave dug since the world began (`rites.graves`) within 240 m | the grave id | the name, and how they died and by whom |
| ash | a campfire left behind | the fire id | a cold ring of ash and stones |

- **Where a mark goes** (`on`):
  - **wall:** a face of a live citygen building near the place.
    - The face has no door. Faces with 6 m of open ground in front of them come first (a face 2 m from the next building is a slot nobody reads), then south faces (the camera's side).
    - The mark goes in the widest bare stretch between the face's ground-floor windows. Their spans come from `VERT.window` (`every` 3.6 m, `w` 1.3 m, a metre in from each corner), the same numbers `world/citygen/build.js` lays them with. It is shrunk to fit (to 45% at most).
    - It sits 4 cm proud of the outer face. The wall is 0.4 m thick, so the outer face stands 0.2 m out from the footprint's edge.
    - If the place is not built near you, the mark goes on the ground instead.
  - **ground:** paint on the street near the place's centre.
  - **board:** a plank leaned back 54° so it reads from the top-down camera, its centre 1.25 m up (clear of a road's raised bed), on two posts set behind it.
- **Drawing:**
  - Marks within 240 m are drawn, with a cap of 96. The near set is rebuilt when you move 18 m or a mark changes.
  - Each mark has a 256 × 128 slot in one 2048 × 1024 canvas atlas, painted once and given back when the mark is far.
  - One instanced mesh of quads reads its slot (`aRect`, the road signs' trick), and one instanced mesh holds the posts. That is two draw calls, or none when nothing is near.

### 3.5 Campfire (rows: `CAMPFIRE`, `CAMP_LINES`)
- **When:**
  - it is night (night share ≥ 0.5);
  - you are on foot, not indoors, underground or swimming;
  - a crew member is alive and not down within 30 m;
  - `survival.threat(30)` is clear;
  - and you have stood still for 5 s.
  - `campfire light` does it at once, under the same rules.
- **The fire:**
  - It is made 2.6 m in front of you: five logs and nine stones (one instanced mesh), and three additive glow quads that flicker (no new light).
  - It keeps one light of the fx's fixed pool lit (re-armed every 0.35 s), so the light count holds.
  - While it burns, `crew.camp` is the fire (the crew's own camp talk is held off). Each member at the fire walks to a seat round it (2.4 m out) under the crew's own `holdpos` order, sits (crouch) and faces the fire. Their previous order comes back when the fire ends.
- **A line every 6 s:**
  - It is the best line nobody has said tonight, spoken by each member in turn through `crew.say(m, text, true, 'camp', null, { campfire, line, ref })`, which carries it to the subtitle, the voice layer and the LLM hook.
  - Candidates, by weight:
    - **real events** (+2): chronicle rows in the last 30 game hours within 6 km. That means a raid, fall or take, a skirmish, your kill (it names the target and the place), or someone else's kill.
    - **heard** (+1): from the far-sound ledger, with its bearing. `heard:shot` takes a shot, volley or blast, and `heard:engine` takes an engine, so a line about shooting is never said of a car.
    - **news:** a radio copy you hold.
    - **stats:** hp under 50%, food under 0.35, cash over 400, kills over 10, wanted, morale under 0.
    - **area:** the biome (swamp, desert, coast, ruins).
    - **any:** small talk.
  - Every line carries its `ref`: the chronicle seq, the ledger seq, the fact id, the stat or the biome.
- **Each exchange:**
  - the clock moves 0.4 game hours (the sky's hour, society and pulls ticked: `advance`);
  - you and every member at the fire gain 0.06 rest;
  - the first line adds the `campfire` morale mod (+4 for 14 h);
  - two members who talk move their bond by `BOND_RULES.campNudge`.
- **The look:** the glow quads are `toneMapped: false` and `fog: false` (as the fx's own flames are), or the night's exposure and fog swallow them. The pool is 5.5 m across in `#c2611f`, and the pool light's power is 70.
- **It ends** after 5 exchanges ("burned down"), when you walk 14 m off or get in a car, at dawn (night under 0.3), or when a threat comes. A cold ring of ash is left as a mark.

## 4. Formulas
- **Far-sound delay:** `t_heard = t_fired + d / 343`.
  **Example:** a rifle 850 m east and 850 m north of you (d = 1202 m) is heard 3.50 s after the round, bearing 45° (NE). That is the check.
- **Carry:** `range × (rain 0.6) × (dust 0.75) × (roof 0.55)`; level `gain × max(0.12, 1 − d / range)`.
  **Example:** a shot at 1200 m in rain carries 2600 × 0.6 = 1560 m, at level 0.85 × (1 − 1200/1560) = 0.20.
- **Ambience mix:** `level = day × (1 − n) + night × n`.
  **Example:** the swamp at dusk (n = 0.5) has frogs 0.65 and wind 0.175. In Florida's swamp row, frogs are 0.65 and wind 0.15.
- **Grapevine to the air** (pulls' law, read by the feed): `on the air ≥ seen + (hour boundary) + d / 450`.
  **Example:** two towns 7.9 km apart. A fight beside T2 at 14:10 leaves on the 15:00 truck and lands at 15:00 + 17.5 h = 08:30 the next day. Only then can T1's set read it, and it says "That was yesterday".
- **The read's confidence:**
  - `you.conf = mast.conf × 0.85` (the radio channel).
  - A copy that came saw (1.0) → grapevine (0.8) → grapevine (0.64) is hedged (under 0.62 after the radio: 0.54) and very shaky (under 0.5) one hop later.
- **Tally:** `n = Σ kill rows at the place + raided "N dead" + round(skirmish m)`, capped at 40.

## 5. Edge Cases
- **You moved since the last pulls tick** (a teleport, a fast car): the feed puts your holder where you are before it measures the station's range, so you are never left out of a broadcast you stand under.
- **History already in the chronicle when the page boots** is not news: the feed's cursor starts at the chronicle's newest row. Only rows written after that become facts.
- **A shot inside 520 m** is the ordinary sound's job. The far layer never queues it (checked).
- **A source that stops** (a car parks) stops being heard. What is already in the air still lands: sound that has left does not come back.
- **No mast in range:** the station is static ("No mast in reach" on a forced read). A mast with nothing new also plays static.
- **The feed only airs while you listen.** Other holders with sets hear a line only when it is aired, so a mast is silent to them while nobody listens. The facts themselves are made, and travel, whether or not you listen.
- **A wall mark for a place not built near you** goes on the ground. It is not re-hung on the walls when the town builds later. (Follow-up: a pending wall slot.)
- **Saves:** marks and the feed's cursor, what it aired, and its log are saved (`voice` in the snapshot). A burning fire is put out on load (its ash stays). The far queue is cleared on load.
- **The battery:** all four systems are off for the rest of the battery (they caption, paint and light fires), and its own checks turn them on.
- **A fire with no crew left near it** ends with "the crew walked off".

## 6. Dependencies
| Uses | For |
|---|---|
| `systems/knowledge.js` (`record`, `put`, `holders`, `copyOf`, `inFlight`) and pulls (`nodes`, `neighbours`, `me`, `tick`) | news facts, who holds them, the mast, the grapevine's lag |
| `society.chronicle` (`query`, `seq`), `society.sim.record` | real events for the far sound, news, tags and tallies, the campfire |
| `citygen` (`plan`, `byId`, `live` buildings, `overrun.hordes`) | walls to paint; overrun towns; hordes heard |
| `rites` (`graves`, `ground`) | the words on graves; the ground height |
| `crew` (`members`, `say`, `camp`, `campAt`, `moveBond`) | campfire talk through the crew's own voice path |
| `survival.threat`, `needs`, `deep.moraleAdd` | the fire's rules, rest and morale |
| `audio` (`ctx`, `master`, `noiseBuf`, `sample`, `burst`, `tone`) | the layers and far sounds |
| `voice.radio` | key feed lines in a locked station voice |
| `fx.light` | one light of the fixed pool for the fire |

Shared-file hooks (exact):
| File | Hook |
|---|---|
| `web/src/main.js` | 5 imports; `this.farsound`, `this.feed`, `this.marks`, `this.campfire` and `this.feedUI` built after `pullsUI`; `this.feed.update`, `this.marks.update`, `this.campfire.update` after `pulls.update` (sim block); `this.farsound.update(dt)`, `this.feedUI.update()` after `radio.update` |
| `web/src/systems/combat.js` | 1 line after `g.noise` in `fire`: `g.farsound?.shot(ch, w)` |
| `web/src/systems/radio.js` | 1 line in `update`: `if (S.kind === 'feed') this.g.feed?.tick(S, dt)` |
| `web/src/data/radio.js` | 2 station rows (`wire`, `tally`, kind `feed`) and a comment |
| `web/src/data/hudlayout.js` | 1 row: `radiofeed` (`.rf-feed`, top right under the pulls chip) |
| `web/src/agent/api.js` (runSelfTest) | `g.selftestLive = { results, ms, done, at }`, with each check's ms. A long battery can be read with `exec` after the bridge stops waiting. It is set at the start and end of `runSelfTest`, plus one line in `check` |
| `web/src/agent/api.js` | import; `...worldVoiceCommands`; `voiceWas` (all four off for the battery; back on at its very end, after the crew's and the rites' checks) and `worldVoiceChecks` after the pulls' checks; the snapshot saves `voice: { feed, marks }`; restore loads them, puts out a fire and clears the far queue |
| `data/pulls.js`, `data/stats.js` | not edited. `FACT_KINDS.news`/`market` and `MORALE.mods.campfire` are added at import from `data/worldvoice.js` |
| `web/docs/COMMANDS.md` | regenerated |

What other lanes can use:
- `g.farsound.emit(kind, x, z, src, id)`: any real event can be heard far off. Call it only for something that happened.
- `g.feed.air(S)` and the `feed` kind: a new station is a row.
- `g.marks.add({...})`: a new kind of leftover is a `MARK_KINDS` row and a painter branch.
- `CAMP_LINES`: a new campfire line is a row with a `when`.
- SITE-STORIES: their `raided`/`fell` rows already tag walls and count the dead. Their `story` facts are read on THE WIRE, and their `postings` on TALLY NIGHTLY once their kinds reach town holders.

## 7. Tuning Knobs (`web/src/data/worldvoice.js`)
| knob | default | safe range | effect |
|---|---|---|---|
| `AMBIENT_LAYERS.*.gain` | 0.012 to 0.2 | (0, 0.5] | how loud each voice is at level 1 |
| `BIOME_AMBIENCE.<biome>.day/night.<layer>` | 0 to 1 | 0 to 1.5 | the land's mix |
| `AMBIENCE.fade` | 2.2 s | 0.5 to 6 | how soft a border is |
| `FAR.kinds.*.range` | 700 to 5200 m | > near | how far each carries |
| `FAR.kinds.dogs.gap` / `stirred` | 26 / 5 s | 8 to 120 / 2 to 20 | how often a town's dogs bark, quiet or stirred |
| `FAR.weather.rain` / `dust` | 0.6 / 0.75 | 0.2 to 1 | weather eats sound |
| `NEWS.witnessR` | 900 m | 300 to 2500 | how near a town must be to have seen it |
| `FEED.every` | [26, 44] s | [10, 180] | lines on the air |
| `FEED.shaky` / `errorAt` | 0.62 / 0.5 | shaky > errorAt | when the radio hedges, and when it is wrong |
| `FEED.airAgainAfter` | 18 h | 4 to 72 | repeats |
| `MARK_RULES.near` / `cap` | 240 m / 96 | 120 to 400 / ≤ 128 | how many marks are drawn |
| `MARK_RULES.dontgoR` | 14 km | 3 to 30 km | how far a town's warning reaches |
| `CAMPFIRE.stillSecs` / `exchanges` / `gapSecs` | 5 / 5 / 6 s | 2 to 30 / 2 to 12 / 3 to 20 | the scene's length |
| `CAMPFIRE.hoursPerLine` / `rest` | 0.4 h / 0.06 | 0.1 to 1 / 0 to 0.2 | the breather's payoff |

## 8. Acceptance Criteria (`selftest only=world voice:`)
| check | proves |
|---|---|
| the rows validate | every layer, biome mix, far kind, feed line, mark kind, tag colour (no purple) and campfire line passes; a broken row set trips ≥ 10 named errors |
| biome ambience switches at a biome border | two spots 200 m apart with two biome names give two different mixes, the border is counted, and night is its own mix |
| a distant gunshot is heard only if a shot was really fired | 6 s of silence hears no shot. A real `combat.fire` 1.2 km NE is pending at once, is not heard 0.6 s before d/343, and is heard at d/343 ± 0.12 s, bearing NE (± 1°), from that body. A round at 300 m is left to the near sound |
| an off-screen fight is heard as a volley only from a real chronicle row | the sim's skirmish row 1.65 km west is queued and lands as a volley of ≥ 5 shots from the west, keyed to that row |
| the radio never reports an event before a witness | a fight nobody saw is never a fact. A fight beside T2 is held by T2 and not by T1. T1's set does not read it before the grapevine truck lands (its time is distance / 450), and reads it after with its age ≥ that. You hold it as `radio` from T1's mast, and every aired line came from a copy the mast held |
| a raided site gets the raiders' tag | the sim's own `record('took')` tags the camp in the winner's letters with that row's seq. A town raided (the site-stories row) is tagged on a real wall in the raiders' colour, and drawn when you stand there |
| deaths leave tally marks | three kill rows at a place add exactly 3 strokes to its one tally |
| DON'T GO <dir> is painted only by a town that holds news of the fall | nothing before the town holds the fact; after it is told, its road edge says DON'T GO <the right direction>, caused by that fact |
| a campfire line references a real recent event | at night, with a crew member, stopped: the fire is made. The first line's ref is the chronicle row of the raider you really shot (a real round, a real kill), and the line names them or the place. The clock moved, rest rose, morale has `campfire`, and walking off leaves the ash |
| draws | nothing drawn when no mark is near, and the frame stays under 150 draw calls |
