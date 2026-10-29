# WEB_SITE_STORIES: places that live, and the Tally

Lane SITE-STORIES + BOUNTY GUILD (Wave 2 of `WEB_DEPTH_PLAN.md`). Branch `feat/web-site-stories`.
Code: `web/src/systems/sitestories.js`, `web/src/data/sitestories.js` (rows plus `validateSiteStories`), `web/src/agent/sitestories-api.js` (the `site` story actions, the `bounty` command, 10 checks).
Renders: `docs/renders/web/site-stories/`.

## 1. Overview
Robert: "Sites of story... where it can generate its own stories and where it could like maybe even affect each other... Maybe there's a bounty hunting faction."

Every planned town, every SITE row (in the streamed world and beyond it), Rust Haven and the six Dustwolf camps carry a **living state**: an owner, a problem, people, a stock of goods with a price for each, a chest of coin, and a clock.
Each game day a place eats, makes, sickens or heals, and decides what to send. What it sends is a **mover**: a party on a real road between two places.
When a mover arrives, the load changes hands, the raid is fought, the sick bring the sickness, the refugees are taken in. **Chains of these events are stories**: chronicle rows, each caused by the one before.
Every telling event is a fact the place holds. It reaches anyone else only through the knowledge model's doors (law 6).
**The Tally** is the bounty hunters' guild. It has halls in three towns and a board in every place. Its hunters ride in pairs and track from sightings and tips, never from where their mark really is.

Which of scarcity, distance and consequence this makes bite harder:
- **Scarcity:** goods move only on trucks. A dry well, a raid or a toll empties a place's stock and its prices climb.
- **Distance:** news, bounties and sickness travel at a truck's pace, or a walker's.
- **Consequence:** the world goes on without you. Places fall and refugees make camps. A deed of yours becomes a posting, and the posting becomes two riders asking about you in the next town.

## 2. Player Fantasy
You pull into the Dead Suburb and the people at the gate tell you the Silver Strip fell three days ago: Dustwolves, and a raid boss they call Greer the Knife.
Half a day down the road you pass a column of walkers on the shoulder with what they could carry. Two days later they are a camp of lean-tos off the I-10, and the board at the next town has a paper on it: WANTED, Greer the Knife, $150 at any Tally House, posted by the woman who led them out.
You take it, ride to the Strip, and put him down in the street he took. Then you collect at the Tally House in Rust Haven.
Six days after that, you shoot a man in a crowded square. Nobody follows you out. But a trader who read that square's board drives east, and two days later a pair of tallymen in a dusty sedan are asking the barkeep in Casino Strip whether he has seen your face.

## 3. Detailed Rules
### 3.1 Places (rows: `PLACE_KINDS`, `GOODS`, `WALL_DEFENSE`)
- **Built once** the city plan is ready, seeded from each place's id, so a fresh world is the same world:
  - the 17 planned towns and Rust Haven (the pulls' nodes; their holder is `town:<id>`);
  - all 232 SITE rows (holder `site:<id>`);
  - the six Dustwolf camps on the island.
- **Owner:**
  - A SITE row's `society.faction` names who holds it. `raider` belongs to the Dustwolves, `soldier`/`remnant` to the Remnant, `warden` to Rust Haven and `meridian` to Meridian.
  - Any other name is a local family or council (e.g. "Free Counties"). Raiding families (`highway_raiders`, `river_gangs`, `keys_pirates`...) send raids.
  - Drifter rows and towns get a named family; a row with no people belongs to no one.
- **People:** rolled from the row's `society.pop` (towns 50 to 140, metros 180 to 260, Rust Haven 160 to 200).
- **Stock:** food, water, fuel, rounds, medicine and scrap. Each good has a base price; the price for a place is `base × clamp(sqrt(wants / stock), 0.5, 3.5)`.
- **Links:** the four nearest places within 32 km. A place trades with, raids and hears about its links.
- **Goods come from work** (WEB_OCCUPATIONS):
  - A town or site's daily make is its occupation mix (`profileOf` → `mixOf`, the same roster its workers are built from). Each job makes `workers × shift hours ÷ hours per unit` of its `makes` item, counted as a good: food, water, medicine and rounds by the item's kind, fuel cans as fuel, anything else (plugs, planks, hides, watches) as scrap trade goods. Its people are the profile's people.
  - A good no job makes is bought or done without. Only water still comes from the ground (a well) where nobody carries it.
  - **Built near you, a town makes nothing by formula:** each tick it takes exactly the units its real workers banked on their shelves (`harvest`, law 2). A take from a shelf is never counted as work.
  - Places with no workforce (Rust Haven, the camps, the bases, a dead ruin) make by their kind's row (`PLACE_KINDS`).
- **Military bases** (WEB_MILITARY_BASES) are places of kind `military`:
  - a held base is its holder's: a faction (the Remnant, the Dustwolves, who raid) or a warlord's family (`ruler`), with 30 to 70 people;
  - an overrun one has fallen to the infected;
  - a sealed or contested one is no one's and empty.
- **Every hour (the world clock):** people eat (`GOODS.eat`) and the place makes (halved for a fallen place, no water with a dry well). A short place loses people. Its problem grows and kills, and medicine heals a sickness.
- **Every day at 06:00:** prices are reset; a problem that has run its course clears; a new one may rise. A place inside the world then sends at most one of: a raid (raiders), a trader (anyone with surplus), a feud raid, diggers for a cache.

### 3.2 Problems (rows: `PROBLEMS`)
| problem | does | spreads / ends |
|---|---|---|
| sickness | kills 3% a day at full severity | rides with travellers out of the place (odds = severity); medicine heals it; runs 6 to 14 days |
| raider toll | a fifth of every load into the place is taken | 4 to 10 days |
| dry well | no water made: the place lives on traders | 5 to 12 days |
| feud | two linked places shoot at each other: feud raids. **Each side asks a friend** (the same owner, or a neighbour) **for guns: an allies party rides to stand with it** | 6 to 16 days |
| buried cache | a rumour: diggers ride out from the nearest town, and half the time come home with rounds, scrap and medicine | 4 to 8 days |
| infected nest | kills 4% a day; below a quarter of its people, the place **falls to the infected** | 8 to 20 days |

### 3.3 Movers (rows: `MOVERS`)
| kind | rides | does on arrival |
|---|---|---|
| trader | a pickup, 2 people, up to 10 units of one good | sells the load into the place's stock at its price, out of its chest; drives home with the coin (and sells what it dug, for diggers) |
| raiders | a buggy, 4 to 6 people (they leave the place's people) | fight (3.5); home with what they took, or they hold the fallen place |
| refugees | on foot, 4 to 9 people, with a little food, water and coin | taken in by the town they reach; **if they walk 22 to 34 game hours without getting there, they make a camp where they stand**, a new place (`refuge`) |
| allies | a pickup, 3 to 4 guns | join the place's defense |
| seekers | a sedan, 2 to 3 diggers | dig the cache; home with what they found |
| hunters | a sedan, two tallymen | see 3.4 |

- **The road:** if one corridor passes within 3 km of both ends, the route runs along it (in the lane for its direction; walkers on the shoulder). Otherwise it is the straight track across the land.
- **Pace (law 1):** off screen a party covers `pace / sky.timeScale` m per game hour, the pace its bodies keep on screen (a car 12 m/s = 360 m per game hour, on foot 1.3 m/s = 39 m per game hour). It never jumps. A party does not leave its gate while you are looking at the gate.
- **On screen:** within 170 m it becomes real people (flags, guns, seats) and a real car whose driver steers along the route (`steer`, the only per-frame code). Past 260 m it is written back to the record. At most three parties are live at once.
- **What travels with a party (law 6):**
  - When it leaves, it takes the place's fresh news (heard in the last 48 h) as `said`, and every posting on the place's board as `board`.
  - Where it arrives, it tells the news to the place's people, and pins the postings on the board there, as `said` from the party's leader.
  - A party leaving a sick place may carry the sickness.

### 3.4 The Tally (rows: `GUILD`, `GUILD_WORDS`)
- **Halls:** Rust Haven, plus the towns furthest from every other hall (today a Florida exit cluster on I-95 and one on I-75). Each hall has a hall holder (`hall:<town>`), two hunter pairs, and on screen a **TALLY** sign in brass letters with two lanterns and a step.
- **Boards:** every place has one (`board:<id>`, the same holder the pulls' saloon board reads). On screen it is a roofed plank with a paper for each posting.
- **A bounty is posted by a real person or place, for a real deed** (a chronicle row):
  - **On you:** a killing of a party's person that someone saw (the row's witnesses). Killing a tallyman is posted by the Tally itself.
  - **On an NPC:** the leader of the refugees a raid drove out posts the raid boss who now holds the fallen place, when they make camp or are taken in.
  - The pay comes out of the poster's chest into the guild's **escrow** (law 2). A poster who cannot pay posts nothing.
- **Reaching boards:** the posting is on the poster's board (and the hall's book, if it is a hall town) at once. Every other board gets it only when a traveller who read it arrives (3.3).
- **Hunters**, every game hour:
  - At a hall they hear its book; at any place they read its board. A posting they hold that no other pair has taken becomes their contract.
  - An NPC mark lives at the place he holds. They ride there, and on arrival they fight his garrison (by the record): the mark dies and the pair collects, or one of them dies.
  - **On you: they ride only on a tip.** A tip is a sighting copy they hold (`sight:player`), fresher than 96 h: one a place made when you stood in it, carried to them by the grapevine or a traveller, or told by the people of the place they stand in. They ride to **where you were seen**. Arriving there with nothing newer, they ask again.
  - **With no tip, they ride their own round:** their hall's town and its linked towns, in an order shuffled by the pair's own seed, asking 6 to 12 h at each. The round never reads your position.
  - **On screen,** a hunter who sees you inside 60 m holds a `saw` sighting. If you are his mark, the pair gets out and fights.
- **What you can do:**
  - **Take** a bounty at a board that has it pinned.
  - **Claim** it at a Tally House when the mark died by your hand: the escrow less the guild's 15% cut.
  - **Pay off** your own name at a Tally House, for 1.5× the bounty. It goes to the poster (with their escrow back), less the cut.
  - **Kill a hunter:** his partner holds a `saw` sighting of you if he was there, keeps hunting you without a contract (a grudge), and the Tally posts your name out of the hall's chest.
- **Closed bounties are facts too.** "Paid off" and "collected" are struck at the hall where it happened, and a pair on that contract quits only when the word reaches it.

### 3.5 The raid
`attack = alive raiders × 4 × [0.7, 1.3]` against `defense = people × guard share × 2 + wall + rounds / 4 (≤ 10) + allies × 4`.
- **attack ≤ defense:** repelled. The raiders lose up to 40% and ride home.
- **Otherwise raided:** the place loses people and goods (up to the buggy's 16 units) go with the raiders.
- **The place falls** when `attack > 1.6 × defense` or its remaining guards are under 4:
  - its owner becomes the raiders' owner;
  - the raid boss stays as its master, with the rest as his garrison;
  - a place with a radio broadcasts its fall;
  - 30% to 60% of its people (4 to 9, one party) walk out toward the nearest town that has not fallen.

### 3.6 Stories
- Every event is a chronicle row (`src: 'story'`, `a: 'arc:<id>'`, `v` the verb, `p` the place) with the weight in `STORY_VERBS`.
- A row joins its cause's arc. A raid's departure joins the arc of the place it is aimed at, so a camp that is raided continues the story that made it.
- Telling events (weight 2 and over) are `story` facts the place holds (a pull kind, so they show on the board).
- **Standing in a place, its people tell you its own news** (`said`, from the place's name).

### 3.7 Sightings
A place with people that you stand in (within 420 m) records a sighting of you every 6 game hours, or sooner if you moved 250 m. The sighting is a fact it holds with where you stood. A town's sightings ride the grapevine to the next towns, and travellers carry any place's sightings.

## 4. Formulas
- **Off-screen pace:** `m per game hour = pace m/s / (1/30 h per s)`. A trader's pickup does 360 m/h.
  **Example:** Dead Suburb to its linked exit cluster west is 8.2 km by I-10: about 23 game hours.
- **Price:** `price = base × clamp(sqrt(wants / max(0.5, stock)), 0.5, 3.5)`, with `wants = max(4, people × eat × 7)`.
  **Example:** water (base 3) in a town of 100 that eats 0.15 a head a day wants 105. With 10 in stock the price is 3 × sqrt(10.5) = 9.7; with 900 it is 1.5.
- **Trader choice:** a good with `spare = stock − 2 × wants` of at least 3. Send it where `(their price − our price) × min(spare, 10)` is largest, if that is over 2.
- **Raid:** see 3.5. **Example:** 6 raiders roll 1.0, so attack 24. Against a holdout of 14 people with no wall and no rounds, defense = 14 × 0.25 × 2 = 7. It is raided (24 > 7) and falls (24 > 11.2).
- **Hunter tip lag:** a sighting in town A reaches town B on the grapevine at `distance / 450 m per hour`.
  **Example:** Delta River Town to the Tally House at exit cluster cg-290 is 7.8 km, so 17.3 h, plus up to an hour for the next truck.
- **Pay-off:** `cost = round(pay × 1.5)`. The poster gets `escrow + cost × 0.85`.

## 5. Edge Cases
- **A party you are watching does not leave its gate** until you look away. A party already on the road is promoted wherever it is (it was there).
- **The clock set back** (a load) restarts the places' clock from the new hour. Nothing runs twice.
- **A live car that sticks** (a wall, a ditch) backs up for 1.5 s and tries again. Its record moves only as far as its bodies do.
- **A party arriving at a place that fell meanwhile:** a trader sells to its new masters; a refugee party is taken in by whoever is there.
- **A place beyond the streamed world** keeps its own troubles but sends nobody, so nothing drives off the map.
- **A camp made too near another place** (under 400 m): the refugees walk on.
- **Nobody can pay:** a poster whose chest holds under $10 posts nothing. The deed stands, but the board stays empty.
- **A hunter pair taking a closed bounty:** they act on what they hold, so they ride on a paid bounty until the word of it reaches them.
- **The sickness at a place with medicine:** each hour it spends 0.25 medicine and the severity drops. A place with no medicine sickens until the problem runs its course.
- **Killing an NPC mark's guards** does not close the bounty. Only the master's death does.

## 6. Dependencies
| Uses | For |
|---|---|
| `pulls.k` (systems/knowledge.js) | every fact: places, boards, halls, parties and hunters are holders; `see`, `tell`, `put`, `broadcast`; the grapevine (`pulls.spread`) carries town facts |
| `pulls` (nodes, `cors`, `halfW`, `inView`, `me`, `board`) | towns, the corridors a route runs on, your board |
| `citygen` (plan, `byId`, live towns) | places, a town's buildings for the hall and the board |
| `world/occupations.js` (`profileOf`, `mixOf`), `workforce` (`towns`, each town's `stock`) | what a place's work makes off screen; what its workers really banked when it is built |
| `data/milbases.js` (`MILBASES_BY_ID`: status, holder) | the bases as places and who holds them |
| `data/sites` (`society`, `walls`, `economy`) | owner, people, walls |
| `society` (chronicle, factions, day) | story rows; the Tally faction (registered at runtime); deeds (a kill row with its witnesses) |
| `vehiclesSys.spawn`, `seats.board/leave`, `ai.move`, `addChar` | live parties |
| `FACT_KINDS` (data/pulls.js) | three kinds added at load: `story` and `posting` (pulls, shown on the board), `sighting` |

Shared-file hooks (exact):
| File | Hook |
|---|---|
| `web/src/main.js` | 1 import; `this.stories = new SiteStories(this)` after the pulls; `this.stories.update(simDt)` after `pulls.update`; `this.stories?.onKill(c, attacker)` after `pulls.onKill` |
| `web/src/systems/ai.js` | 1 line after the pulls' line: `if ((c.storyM \|\| c.storyCamp \|\| c.storyGarrison) && g.stories?.think(c, dt)) continue;` |
| `web/src/agent/api.js` | 1 import; `...siteStoriesCommands(api, need)` after the pulls' (it extends `site`); the system off for the battery (`storiesWas`, `sleep()`) and `siteStoriesChecks` after the pulls' checks; the snapshot skips `storyMover`/`storyGarrison`/`storyCamp` characters and `storyCar` vehicles and saves `stories`; restore calls `g.stories.load` before the pulls |
| `web/docs/COMMANDS.md` | regenerated |
| `docs/design/WEB_PULLS.md` | one line in §6 "What other lanes can use": site stories builds on the knowledge model |
| `docs/design/INDEX.md` | one row |

What other lanes can use:
- `g.stories.post({ target, by, deed, pay })` posts a bounty for any real deed.
- `g.stories.story(place, verb, words, { arc, cause })` writes a story row.
- `g.stories.send(kind, from, to)` sends a party.
- ROLES-DIVERSITY can read `place.owner`/`problem`/`stock`, so a town in a dry spell has water carriers.

## 7. Tuning Knobs (`web/src/data/sitestories.js`)
| knob | default | safe range | effect |
|---|---|---|---|
| `STORY_RULES.linkKm` / `links` | 32 / 4 | 10 to 60 / 2 to 6 | how far places reach each other |
| `STORY_RULES.drive` / `walk` | 12 / 1.3 m/s | the on-screen pace | how long news and goods take |
| `STORY_RULES.maxLive` | 3 | 1 to 6 | parties on screen at once (each a car and people) |
| `STORY_RULES.campAfter` | [22, 34] h | 6 to 96 | how far refugees walk before they camp |
| `STORY_RULES.maxMovers` | 40 | 10 to 120 | parties on the roads at once |
| `PROBLEMS.*.chance` | 0.003 to 0.004 | 0 to 0.02 | how often troubles rise (about one place in 40 has one at a time) |
| `PROBLEMS.*.lasts` | per row | at least 1 day | how long they last |
| `ECON.raidChance` / `raidMin` | 0.35 / 18 | 0 to 1 / 8 to 40 | how often raiders ride, and how many stay home |
| `ECON.fleeShare` | [0.3, 0.6] | | how many walk out of a fallen place |
| `GUILD.halls` / `hunters` | 3 / 2 | 1 to 8 / 1 to 4 | halls and pairs per hall |
| `GUILD.waitAsk` | [6, 12] h | 1 to 48 | how long a pair asks before riding its round |
| `GUILD.tipFresh` | 96 h | 12 to 400 | how stale a tip they will still ride on |
| `GUILD.payOff` / `cut` | 1.5 / 0.15 | ≥ 1 / 0 to 0.5 | the price of your name |
| `GUILD.townSeesR` / `sightEvery` | 420 m / 6 h | | how a place records you |

## 8. Acceptance Criteria (`selftest only=stories:`, 12 checks)
| check | proves |
|---|---|
| the rows validate | `validateSiteStories`: goods are real items, place kinds make known goods, problems name `{place}` and last, movers fit their cars, the guild colour is not purple; a broken row set trips 11 named errors |
| every place has a living state | towns = pulls' nodes, sites = the plan's site records, each with an owner, people and a priced stock; 3 halls in towns; 6 pairs with real flags; the clock running |
| a trader's goods leave one site's stock and arrive in another's | the load comes off A's stock at once (exactly n); the route rides I-10; the record never moves faster than 360 m/h; the same n units land in B's stock at arrival; B's chest pays exactly the sale's cost, into the trader's purse |
| a raid on a site changes its state and spawns refugees who walk the road | a Dustwolf camp's raid rides to a weak holdout. It falls: new owner, fewer people, food carried off, a raid boss holding it. 4+ refugees with real flags, promoted 150 m ahead of you, walk on foot (8 m+ in 12 s) along their route (within 8 m of it) toward a town |
| a story chain writes 3+ linked chronicle rows | the arc holds raidout, raided, fell, fled and then camped or joined; every row's cause is in the arc; the rows are in the chronicle; the fall is a fact the place holds and you did not, until you stand there and its people tell you (`said`, from the place's name), with its age on your board |
| a hunter never moves toward the player before he has a tip or a sighting | the pair's round is identical computed with you in Phoenix and in Miami. For 20 h with nothing, every ride is a round ride. You are seen in a Florida town 7.8 km from the hall, then you go back to Phoenix. The sighting reaches the pair only after the grapevine's lag (≥ km / 0.45 − 1.5 h), not as `saw`. They then ride to where you were seen, over 100 km from where you are |
| a bounty posted on you reaches a far board only after a traveller carries it | on the poster's board at once; the trader holds it as `board`; the far board does not have it at any step while he drives; it is pinned when he arrives, `from` his holder by his name |
| the Tally: take, claim, pay off | a town board without the posting refuses the take; the poster's board allows it. The master stands in his fallen place; you kill him and collect at Rust Haven exactly the escrow × 0.85. Your own posting paid off costs exactly 1.5× and the poster's chest grows. A pair on that contract keeps it until the word reaches its hall, then drops it |
| kill a tallyman | the partner holds a `saw` sighting of you and a grudge; the Tally posts your name with the kill row as the deed, escrow paid |
| a place's goods come from its people's work | a far town's food over 24 h equals its jobs' make less what its people eat (±0.6), and its fuel does not move (no fuel job). Built near you, a maker staged at the bench banks real units; the place's make by formula is 0, and it takes exactly the units banked |
| military bases are places with owners | every base record is a place: held is its holder's (faction, or the warlord's family), with people and a defense; overrun has fallen to the infected; sealed or contested is empty and no one's; a Dustwolf base raids |
| draws | one instanced mesh draws a hall's sign and a board; the frame stays under 150 draw calls |

Plus: `scenario name=stress` shows no regression (the system holds no live bodies during stress), and `ip-lint` reports 0 deny.
