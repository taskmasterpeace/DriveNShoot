# WEB_PULLS: why go out today

Lane PULLS (Wave 2 of `WEB_DEPTH_PLAN.md`). Branch `feat/web-pulls`.
Code: `web/src/systems/knowledge.js`, `web/src/systems/pulls.js`, `web/src/data/pulls.js` (rows plus `validateKnowledge` and `validatePulls`), `web/src/ui/pullsboard.js`, `web/src/agent/pulls-api.js`.
Renders: `docs/renders/web/pulls/`.

## 1. Overview
Every session needs a reason to leave the base. A **pull** is that reason, and every pull is a real thing in the world: a person on a road, a caller bleeding out at a ranch, a town's work order, a bottle-and-rumour at a bar.
Each pull is a **record**. It has a position, a clock and a purse. Near you it becomes **characters**; when you leave, it is written back to the record.
You only ever hear of a pull through a **channel**. The **knowledge model** carries facts by channel, and the **pulls board** lists only the copies you hold.

Which of scarcity, distance and consequence this makes bite harder:
- **Distance:** a pull is somewhere, and the board tells you how far.
- **Consequence:** the clock runs without you. The caller dies, the caravan is hit, the hitchhiker walks on.
- **Scarcity:** every reward is somebody's real stock. A bar's shelf, a trader's cart and a town's chest all run out.

## 2. Player Fantasy
You walk into a saloon, put six dollars on the counter, and the barkeep tells you about a hitchhiker on the Furnace Run.
You find them walking the shoulder, two miles further on than the story said. You give them a ride, and on the way they tell you what they saw. Near town they pay you out of their own pocket. Or they don't: they draw on you at the first stop.
On the radio, a voice says somebody is bleeding out at a ranch west of the dead suburbs. You have three hours. If you are late, you find a body. It still has the photograph it carried, and the board says EXPIRED.

## 3. Detailed Rules
### 3.1 The knowledge model (law 6)
- **A fact** is the world's own record: `{ what, subject, text, where, who, when, life, ends }`.
- **A holder** is anyone who can know something: `player`, `town:<id>`, `board:<id>`, `bar:<building>`, `d:<bar>:<n>` (a drinker), `p:<pull>:<n>` (a road person) and `road:<pull>` (a passing trader).
- **A copy** is what a holder actually has: the fact plus `source { channel, from, fromName, at }`, `heard`, `conf` (confidence) and `hops`. Its `where` and `when` are the teller's, not the world's. A hitchhiker's copied position is where they were when someone saw them.
- There are only four doors in:
  - `see()`: your own eyes. Line of sight inside 70 m by day or 26 m by night.
  - `tell()`: face to face, within the channel's range. **The teller must hold the copy**, so nobody passes on what they never had.
  - `broadcast()`: the radio. Every holder with a set inside 2600 m of the transmitter hears it. You count as having a set only in a vehicle or with a `radio_portable` in your pack.
  - `sendWire()` / `deliver()`: the grapevine. A town's fresh news (heard in the last 8 h, under 3 hops) leaves every game hour for each neighbouring town. It lands after `distance / 450 m per game hour`.
- Confidence multiplies down the chain: a copy's confidence is the teller's confidence times the channel's. Each holder keeps a capped list (town 40, person 12, you 80), and the oldest copy drops out of mind.
- **Facts can be wrong.** A copy keeps its old position and goes stale. A missing person's "last seen" spot is the town's guess, up to 400 m off. By the time you get there, the pull may be over.

### 3.2 Pulls (rows: `PULL_KINDS`)
| kind | where | heard by | the clock | reward (law 2) |
|---|---|---|---|---|
| hitchhiker | walks the road shoulder toward the next town | your eyes; their home town | walks on; arrives and tells that town what they saw | their own purse, when you let them out near their town; 12% rob you instead (with the pistol they carry) |
| stranded | on the shoulder by a dry car | their CB (radio); your eyes | waits | their purse, for a fuel can out of your pack |
| caravan | broken down on the shoulder with a load | radio; grapevine | raiders reach it at 6 to 12 h. If you are inside 170 m, three raiders come up the road from out of sight and you fight them. Otherwise the load is taken and the hands die | their stock, in the pickup's trunk |
| refugees | a party walking toward a town | your eyes; grapevine | walk on | a fact, for food out of your pack |
| trader | a cart walking the road | your eyes; grapevine; their home town | walks on | sells from their own stock; your cash goes into their purse |
| wreck | a dead car and a body | your eyes; a passing trader tells the nearest town 1 to 7 h later | stays | the body holds what they carried; a **note** in their pocket (read standing over it) |
| medic | a rural parcel or a road shoulder, 500 to 2400 m out | their CB, every half game hour while they live | dies at 2.5 to 4 h | their purse, for a bandage or suture kit out of your pack |
| missing | hurt, off a road, toward the place named | the town board; the town's talk | dies at 18 to 30 h | patch them up, then ride them home; their town's chest pays what the board promised |
| bounty | a raider camp near the town | the board; radio; said | open | the town's chest, at its bar, once you have put down the number asked within 160 m of the camp |
| work | the town | the board; said | open | the town's chest, at its bar, for the goods out of your pack (they become the town's stock) |
| weather | over the nearest town | its set, when you listen | over in 6 h | none (the reason to stay in) |
| funeral | a cemetery (the rites' own) | the household's town (said), its set (radio), the grapevine | the funeral's own start and end (the rites schedule it) | nothing paid: standing with the family (the rites' attend and dig) |
| need | your own fuel, rounds, meds, water, food, car | your own eyes, every 2 s | gone once you meet the need | the nearest town you have stood in |

### 3.3 Bars
- Every saloon of a town built near you has a bar record, rolled once from the building's id:
  - a shelf of 10 to 24 bottles;
  - a till holding $60 to $200;
  - a barkeep;
  - 4 to 6 drinkers: two on the stools at the counter, the rest seated at the tables. Half of them are gun hands, each with a purse and a day rate.
- **The room** is planned from the bar's own id (`plan(bar)`), and both the furniture and the seating read that plan:
  - a dark plank floor over the building's own slab, with its seams;
  - the counter facing the door, with glasses on it, and four stools along it;
  - the back shelf against the back wall, holding the bottles that are actually left;
  - a red rug with a cream border between the stools and the tables;
  - 3 to 5 tables with four chairs each. The first is the card table (green baize, cards dealt); the others hold a bottle and a glass;
  - a piano against one side wall (70% of bars) and a dartboard on the other (80%);
  - the board, with its papers, on a side wall;
  - a hanging lamp over each table and two over the counter;
  - an awning over the front door with **SALOON** in bone letters (a 3x5 pixel font; the N is 4 columns wide), read from above.
- **It costs two instanced meshes for every bar near you:**
  - lit boxes (cap 1600);
  - unlit additive discs (cap 64) for the lamps and the warm pools under them, in two rings for a falloff. This adds no light, so the fixed light count holds.
  
  Both are rebuilt only when a bar opens, closes or loses a bottle. A street with five live saloons stays at 82 draw calls.
- The barkeep hears everything said in town: a `said` copy from the `town:` holder.
- **A drink**: $6 goes into the till, a real `rotgut` comes off the shelf into your pack, and the barkeep tells you **one copy they hold** that you don't. If they hold none, they say it is a quiet week. No fact is ever made up to sell.
- **The board**: you read every copy on `board:<town>` (the channel is `board`).
- **Cards**: the stake comes out of the drinker's real purse, or yours. After two of your wins, a 35% chance the sore loser either draws their own pistol on you (a gun hand) or storms out (anyone else).
- **Hire**: a gun hand follows you for $40 to $90 for 2 days, with the rounds in their own gun.
- **Work and bounties** are handed over and collected at the barkeep of the town that posted them.

### 3.4 The board and the chip
- **The board** is the PULLS tab of the character sheet (the ` key). It shows every pull copy you hold:
  - the kind and the text;
  - the channel and who told you;
  - how long ago you heard it, and how old the news is;
  - the place;
  - the distance and bearing from you to the copy's spot;
  - the told window, then EXPIRED;
  - a bar for how sure the teller was;
  - and, underneath, anything you have since learned of how it went.
- Sorting: live rows first, needs after them, expired rows at the bottom.
- **The chip** is the `pulls` row of the HUD layout (`data/hudlayout.js`: top right under the kill feed, every play situation and the menu; F6 moves it, the presets scale it). It shows `PULLS n` and the nearest live one, with distance and bearing. Click it to open the board. It refreshes twice a second, only when its text changes.

### 3.5 No cheats (law 1)
- Road people are born on a corridor's shoulder, 450 to 2600 m along the road from you, never inside the camera's ground radius plus 10 m, and never on the island.
- A caller is born on a rural parcel or a shoulder 500 m or more out, also out of sight.
- Bodies are promoted at 170 m (outside view) and demoted past 260 m.
- Off screen, a walker moves `walk / sky.timeScale` metres per game hour (39 m), the same pace their body walks on screen.
- A rider takes a free passenger seat (`seats.board`).
- A caravan's raiders come up the road from out of sight.
- A body's box holds the person's real items and gun. Their purse spills as a cash pickup of exactly that amount.

## 4. Formulas
- Walk pace off screen: `m per game hour = 1.3 m/s / (1/30 h per s) = 39 m/h`.
  **Example:** a hitchhiker at s = 36 800 walking east, left for 2 game hours, is at s = 36 878.
- Grapevine arrival: `at = sent + distance / 450`.
  **Example:** Dead Suburb (cg-237) to Rust Haven is about 7.8 km. A work order posted at 9:00 leaves on the 10:00 truck and lands at 10:00 + 17.3 h = 03:20 the next day. At 03:10, Rust Haven does not have it.
- Confidence: `copy.conf = teller.conf x channel.conf`.
  **Example:** saw it (1.0), told a town (said 0.9 = 0.9), on to the next town (grapevine 0.8 = 0.72), to its barkeep (said 0.9 = 0.65), to you (said 0.9 = 0.58).
- Window left: `(copy.ends ?? copy.when + copy.life) - now`. A told window (a medic call) ends when it ends; a fresh sighting only makes the news younger.
- Card odds: `p(win) = 0.42 + luck x 0.012` (luck = 5 + the deep sheet's and the gear's luck).

## 5. Edge Cases
- **A corpse never renews a call.** Seeing the body teaches you the outcome, not "they are still waiting".
- **Teleporting into a record's spot:** the record was already there, so it is promoted (not born). Births alone are kept out of sight.
- **A rider and the car:** demotion skips anyone in a seat. A save turns a ride back into a walk at the record's spot.
- **A barkeep who dies:** `keepDead`, so no drinks are served and no rumours told. The bar record stays (no regeneration).
- **The shelf runs dry:** "the next wagon brings more". A delivery that restocks it is future work (law 2: only a visible delivery restocks).
- **A town stamped after the plan** (ad hoc or forge) becomes a node when its bar first opens.
- **A full pack:** no bottle, no sale, no item is lost.
- **A hired gun's days run out:** after `hireDays` they say so, are dismissed (`seats.dismiss`) and go back to their bar. The pay stays theirs.
- **A dead pull person far away:** the rites keep the body. Coming back, you find the rites' body, not a second copy.
- **A hired gun:** `seats.recruit` gives followers `mag 99`. The hire puts the gun's own magazine back. The engine's AI reload still refills from nothing; that is the AI's law, not this lane's.

## 6. Dependencies
| Uses | For |
|---|---|
| `citygen` (plan, live towns, buildings) | towns as nodes; saloons; rural parcels |
| `streamer.W` corridors (`at`, `project`, `sIslW/E`) | the road a walker walks |
| `seats` (`board`, `leave`, `recruit`) | riders and hired guns |
| `radio.canHear()` | who hears a broadcast |
| `inventory` (`add`, `spend`, `place`, `trunk`) | drinks, help, trades, bodies |
| `combat.kill`, `ai.move`, `society.deeds.direct` | deaths, walking, deeds |
| `rites.learn` (WEB_DEATH_RITES) | **a death is news through the rites' one path.** The rites decide when a household learns a death (it saw the killing, saw the body, found it at home, or was told by a witness or by you). `deathNews(R, fact)` only carries that into the knowledge model: a `death:<body>` copy in the household's town (`saw` or `said`, from whoever told them), so that town's barkeep and the grapevine pass it on. Once a funeral is set, the funeral becomes a `funeral` fact (a pull: go and stand at the grave) held by the town and read out on its set inside the radio's range, dated absolutely and ending when the funeral ends. There is no second detector |
| `rites` (WEB_DEATH_RITES) | a pull's dead go on the rites' clock (`rites.onDeath`, dated to when they died off screen); once rites holds the body, pulls never makes that character again, and a folded body can still be seen and found |

Shared-file hooks (exact):
| File | Hook |
|---|---|
| `web/src/main.js` | 2 imports; `this.pulls` and `this.pullsUI` constructed before the roadside; `this.pulls.update(simDt)` in the sim block; `this.pulls?.onKill(c, attacker)` in `onKill`; `it.amount ??` in the cash pickup (a spilled purse is its exact amount) |
| `web/src/systems/ai.js` | 1 line after the Grapevine branch: `if ((c.pullRec \|\| c.barRole) && g.pulls?.think(c, dt)) continue;` |
| `web/src/ui/dialogue.js` | 2 lines in the stranger branch: `g.pulls.talkFor(c)` before the small talk |
| `web/src/ui/charsheet.js` | `'pulls'` in `TABS`; the pulls branch hides the card body; one line shows the board's own element on its tab |
| `web/src/systems/rites.js` | 1 line at the end of `learn`: `this.g.pulls?.deathNews?.(R, fact)` |
| `web/src/data/hudlayout.js` | 1 row: `pulls` (`.pulls-chip`) |
| `web/src/data/panellayout.js` | 2 region rows on the sheet panel: `pulls` (`.pb-list`, a list, tab `pulls`) and `pulls_empty` (`.pb-empty`); the board is its own element in the panel, shown only on its tab |
| `web/src/agent/api.js` | import, `...pullsCommands`, `await pullsChecks(...)` before the perf budget; the snapshot excludes `pullRec`/`barRole` characters and saves `pulls`; restore calls `g.pulls.load` before the characters |
| `web/docs/COMMANDS.md` | regenerated |

| WORLD-VOICE (`WEB_WORLD_VOICE.md`) | reads this knowledge model: chronicle rows a town witnessed become `news` facts, a town's own market a `market` fact; feed stations air only copies their mast town holds; towns paint DON'T GO only from facts they hold; the grapevine's trucks set when the radio can know |

What other lanes can use:
- `g.pulls.k`, the knowledge model: `holder`, `record`, `see`, `tell`, `broadcast`, `sendWire`, `holds`, `copyOf`, `view`.
- The bounty guild (SITE-STORIES) should post through `pulls.post('bounty')` and hunt from copies, never from your true position.
- DEATH-RITES: already bridged (`rites.learn` calls `deathNews`).
- UI-EDITOR: the chip is the `pulls` row.

## 7. Tuning Knobs (`web/src/data/pulls.js`)
| knob | default | safe range | effect |
|---|---|---|---|
| `PULL_RULES.birthEvery` | [3, 7] h | [1, 24] | how often the road grows a pull |
| `PULL_RULES.maxRoad` | 8 | 2 to 16 | road pulls at once (each costs nothing until promoted) |
| `PULL_RULES.birthR` | [450, 2600] m | min > promoteR | how far along the road from you they are born |
| `PULL_RULES.promoteR` / `demoteR` | 170 / 260 m | keep promoteR > the view radius | where bodies appear and go |
| `CHANNELS.radio.range` | 2600 m | 800 to 6000 | how far a call carries |
| `CHANNELS.grapevine.speed` | 450 m/h | 150 to 2000 | how fast news moves between towns |
| `CHANNELS.*.conf` | 0.8 to 1 | (0, 1] | how much is lost in the telling |
| `PULL_KINDS.*.deadline` | per kind | at least 1 h | how long the clock gives you |
| `PULL_KINDS.hitchhiker.rob` | 0.12 | 0 to 0.4 | the risk of a ride |
| `BAR.price` / `BAR.stock` | 6 / [10, 24] | | rumours per bar before the shelf is dry |
| `BAR.fight` | after 2 wins, 0.35 | | sore losers |

## 8. Acceptance Criteria (`selftest only=pulls:`)
| check | proves |
|---|---|
| the rows validate | `validateKnowledge` and `validatePulls` pass; a broken row (an unknown channel, an item that doesn't exist) is caught |
| no road person spawns inside the player's view | 60 births at six spots: every one is past the birth radius, out of view, not live, on the shoulder (road distance = half width + shoulder ± 2 m) |
| a fact the player never heard is not on the board | a hitchhiker's home town holds the copy and you don't; a CB call goes unheard on foot without a set, then is heard in a car, with the distance right |
| a hitchhiker left behind is further down the road later | after 2 game hours, s moved `dir x 39 x 2` m (± 2) toward their town, still on the shoulder |
| a picked-up hitchhiker rides in a real seat | promoted more than 100 m out; boards a passenger seat (`occ[seat] === c`, seat > 0); let out by their town, they pay exactly `pay` out of their purse |
| a medic call expires and the caller dies if nobody comes | heard by radio; EXPIRED on the board with no outcome; you learn the death only by seeing the body; the body box holds their items |
| a grapevine fact reaches the next town only after travel time | not held 0.15 h before `sent + distance / 450`, held just after, source `grapevine` |
| a rumour bought in a bar is a fact the barkeep actually holds | the copy's source is that barkeep, who holds the fact; shelf −1, till +6, cash −6, one more rotgut in your pack; a barkeep with nothing new tells nothing new |
| a death is news through the death rites | before the family learns, their town holds nothing; told by a neighbour (`rites.tell`), the town holds `death:<body>` as `said` from that neighbour, the funeral is a fact with the funeral's own end, and the next town has neither until the grapevine's truck lands |
| rewards come out of real stock | a trader's count −1 and purse + price; the board shows the sighting; the chip counts it |

Plus: the draw calls stay under 150 (one instanced mesh for all bar furniture; road people are the instanced rig), `scenario name=stress` shows no regression, and `ip-lint` reports 0 deny.
