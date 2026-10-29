# WEB_CASINOS: the house, its tables, and taking its money

Lane CASINOS (`WEB_DEPTH_PLAN.md`, Robert 2026-10-29). Branch `feat/web-casinos`.
Code: `web/src/systems/casinos.js` (the rooms, the money, the people, the robbery, the drones), `web/src/systems/cards.js` (blackjack), `web/src/systems/chess.js` (chess and its NPC), `web/src/ui/tablepanel.js` (the table), `web/src/agent/casinos-api.js` (the `casino` command and 13 checks).
Rows: `web/src/data/casinos.js` (STAKES, BLACKJACK, CHESS_PLAYERS, CHESS_AT, EYE, DEALER_EYE, GUARD, CAMERA, CAGE, SAFE, WITNESS, SEC_DRONE, JAMMER, CASINO_NAMES) plus `validateCasinos`.
Renders: `docs/renders/web/casinos/`.

> Robert, 2026-10-29: "we should add some games in here, like Blackjack 21, chess. What if we had like different levels that people play for money in the game? And you could try to rob the place. It could be security people there... And I think that people with money should have security drones."

## 1. Overview
Every town built near you can hold a **gaming room**. There are three stakes:
- a saloon's **back room** card table, where the house is the bar's till;
- a town hotel's **gaming floor**;
- the **high-roller room** in the tallest hotel of a casino strip or a major city.

A room is a **record**, rolled once from its building's id. It holds the cage's cash, the safe's cash, its tables, its guards, its cameras and its drones. Near you (140 m) its people stand on their marks. Past 220 m they are written back to the record, and a dead guard stays dead.

At a table you play **blackjack** from a real shoe, or **chess** against the row's player.
- The house's money is real and finite. A bet goes into the cage, and a payout comes out of it.
- The only other ways the money moves: a guard walks cash from the safe to the cage (law 1), or somebody robs the place.

The same room is a **target**:
- the cashier's cage, held up at gunpoint;
- the back office's safe, opened with picks, a pry bar or a charge;
- three ways in (the front door, the back door, a storm drain).

The guards react only to what they, a watched camera, a drone or a running witness actually saw or heard (law 6). The Tally's board posts the robbery only when a witness walks in.

**The rich fly drones.** The house and its owner's home (the town's biggest house) fly security drones over the property:
- a loop, by line of sight only;
- they mark you and call the guards to where they saw you;
- you can shoot them down, jam them, or keep under a roof and in the dark.

Which of scarcity, distance and consequence this makes bite harder:
- **Scarcity:** the house can go broke. A cleaned-out room closes its tables until money is carried in.
- **Consequence:** a robbery leaves witnesses who run, a bounty on the board, and a room that bars you for a week.
- **Distance:** the rich rooms are only in the strips and the big cities.

## 2. Player Fantasy
You walk into the Brass Horseshoe in a borrowed duster. You pay the door man five dollars and sit at the third table. The shoe is six decks. You keep the count in your head; so does the dealer.

Three hands later the count is hot, and you push a hundred dollars where you had been betting ten. The pit boss walks over: "The house thanks you for your custom. Somewhere else."

Next week you come back through the storm drain. The cage guard is at the far end of the floor. You put a pistol in the cashier's face and walk out with the float. Nobody saw you go but the cashier, who runs to the guard. By the time they get to the door, you are a block away.

The cashier keeps running, all the way to the town board. The next morning there is a paper with your name on it, and the house paid for it.

## 3. Detailed Rules
### 3.1 Rooms (rows: `STAKES`)
| stakes | where | bet | the house | entry | tables | guards | cameras | drones |
|---|---|---|---|---|---|---|---|---|
| backroom | every saloon (the bar's own card table, `pulls.js` plan) | $1-$10 | the bar's till (`pulls.js` BAR) | anyone not hostile | 1 blackjack | none (the bar's own) | 0 | 0 |
| floor | a town's first hotel (not the strip's tallest) | $5-$100 | cage $700-1,600 · safe $1,800-4,200 | $5 a day at the door; at most 1 star; standing at least -30 | 3 blackjack, 1 chess | door, cage, office + 1 patrol (shotguns) | 2 | 1 |
| highroller | the tallest hotel of a `boom_strip` or major-city town | $50-$1,000 | cage $4,500-9,000 · safe $12,000-26,000 | show $500; dressed (coat or vest) or a $200 door; no stars; standing at least 0 | 4 blackjack, 2 chess | door, cage, 2 office + 2 patrol (SMGs) | 4 | 3 |

- **The layout** comes from the building's own front: the cage on the back wall (left), the office in the back corner (right) with the safe, the tables in the middle, and the door man at the door.
- Everything is drawn in one instanced mesh: a red carpet with a gold border, felt tables with a padded rail, chips and cards, the cage with brass bars, the office partition, the safe (ajar once opened) and the cameras. It is rebuilt only when a room opens or closes.
- **People:** each table has a dealer (a seated chess player at a chess table), plus a cashier and the guards. Every person carries a real flag (`randomFlag`).
  - A hook in `ai.js` keeps each of them on their mark.
  - A patroller walks a four-point loop.
  - A guard on an alarm goes to the **last seen** spot, never to your true position.

### 3.2 Blackjack (`systems/cards.js`; rows: `BLACKJACK`)
- **The shoe:** 52 × decks real cards, shuffled once (Fisher-Yates) and dealt from the front. At the cut card (`pen`), the dealer reshuffles before the next hand. A card is never dealt that is not in the shoe.
- **The deal:** you, the dealer, you, the dealer. The dealer peeks: a dealer natural ends the round at once.
- **Your moves:**
  - hit, stand;
  - double on your first two cards (any two if `doubleAny`, otherwise 9 to 11);
  - split a pair up to `splitMax` times; split aces get one card each (`splitAcesOneCard`).
- **The dealer** draws to 17. On a soft 17 they hit only if `dealerHitsSoft17` (the back room's row).
- **Settle:** a natural pays `bjPays`:1 (3:2 on the floor and in the high-roller room, 6:5 in the back room). A win pays 1:1 and a push returns the bet.
- **The money:**
  - The bet leaves your pocket into the house when you bet.
  - A double or a split takes a second bet the same way.
  - The payout (stake plus winnings) leaves the house into your pocket.
  - So the house moves by exactly (bets in − paid back).
  - The house must be able to cover `bet × (2 + bjPays)`, or the table refuses the bet ("the cage is short").

### 3.3 Chess (`systems/chess.js`; rows: `CHESS_PLAYERS`, `CHESS_AT`)
- **Full rules:** castling (never out of, through or into check), en passant, promotion (to a queen, or a knight by typing `n`), mate, stalemate, the fifty-move draw and bare kings.
  - Move generation is verified by perft (start position at depth 3 = 8,902; the "kiwipete" position at depth 2 = 2,039).
- **The NPC:**
  - alpha-beta search to the row's `depth` over material plus a little position;
  - plays the second-best move with the row's `blunder` chance;
  - only ever picks from the legal list.
- **Stakes:** both stakes go on the table when you sit: yours from your pocket, theirs from their own purse (rolled once from the row). The winner takes the pot; a draw splits it. Standing up in a game is a resignation.

| player | depth | blunder | stake | purse | found in |
|---|---|---|---|---|---|
| drunk | 1 | 0.35 | $2-10 | $10-40 | floor |
| regular | 2 | 0.12 | $10-50 | $60-200 | floor, high-roller |
| shark | 3 | 0.02 | $50-300 | $300-900 | high-roller |

### 3.4 The eye: counting and cheating (rows: `EYE`, `DEALER_EYE`)
- **The count:** the dealer keeps the Hi-Lo count of the shoe (2-6 is +1, 10 to ace is -1).
  - Before each hand: if the true count is at least `hot` (2) and your bet is at least `spread` (3) × your base (the smallest of your last ten bets here), suspicion rises by `eye × jump`.
  - Any other hand takes off `decay`.
  - At 1, the pit boss bars you for `barDays` (7 game days). The room refuses you a seat until then.
- **Palming a card (C at the table):** swaps your last card for an ace from your sleeve. The dealer catches it with chance `catch[0] + eye × catch[1]`.
  - Caught: the hand is forfeit, you are barred, and the guards are on you.
  - Not caught: the ace plays.

### 3.5 Robbery (rows: `CAGE`, `SAFE`, `GUARD`, `CAMERA`, `WITNESS`)
- **The cage:** stand at the cage with your gun up (`arms` raised) and the cashier alive, then hold E for `hold` (2.2 s). The whole cage is yours.
- **The safe:** hold E at it with your tool. The best one you carry is used.

| tool | needs | time | noise | spent |
|---|---|---|---|---|
| pick | lockpicks | 9 s | 0 m | 1 use |
| pry | crowbar | 5 s | 30 m | none |
| blow | breach_charge | 2 s | 90 m (and a blast) | the charge |

- **Who knows** (`whoKnows`, at the moment it happens):
  - a guard who **sees** it (inside his sight by day or night, with a line of sight);
  - a guard who **hears** it (inside `min(noise, hear)`: a blown safe, a gunshot);
  - a **camera**, if the office guard is alive at his post to watch the monitor and the camera's cone and sight line reach you.

  Any of these raises the **alarm**: every guard holds a grudge and goes to where you were seen.
- **Witnesses:** everyone else in the room who saw it (dealers, the cashier, patrons) becomes a runner.
  - If the house does not know yet, the runner goes first to the nearest guard. When they arrive, the alarm goes up at the spot **the witness saw**.
  - Then they run to the town's board (the Tally's `board:<place>`).
  - When they arrive, the house posts a bounty on you. It is paid out of the cage, then the safe, into the town's chest and then the guild's escrow (law 2), at `bounty × what was taken` (clamped to $40-$2,500).
  - Kill or stop a runner and the word never arrives.
- **Gunfire** anywhere a guard can hear it (`GUARD.hear` 45 m) raises the alarm (`onNoise`).
- **The alarm settles** after 90 s with nobody seeing you. You stay barred, and the bounty stays on the board.
- **The routes** (`casino action=plan`):
  - the front door (past the door man);
  - the building's back door (from the interiors' doors), if there is one;
  - the nearest storm drain way (understreet). A breach that comes up inside this very building is preferred.

### 3.6 The table panel (`ui/tablepanel.js`; regions: `data/panellayout.js` `table`)
- Green felt with a leather rail, real cards (suits in red and black), chips, the dealer's hidden card and the totals.
- Chess is drawn as a wooden board with the pieces. You click a piece, then a square, or type `e2e4` and press Enter.
- **Keys:** `[` `]` set the bet, SPACE deals, H hit, S stand, D double, P split, C palm. For chess, R resigns. ESC stands up.
- The world holds still while it is open. Its six regions are rows the HUD editor (F6) moves and sizes.

### 3.7 Security drones (rows: `SEC_DRONE`, `JAMMER`)
- **Who has them:** a room flies `STAKES[kind].drones`, and the owner's home (its town's biggest house) flies one.
  - A room's drones are on duty all day. A home's drones fly `hours` (18:00-07:00).
  - Off duty, a drone sits over the building.
- **The loop:** the property's four corners, 4 m out from the walls, at 7 m.
- **Seeing** (law 6): your body, inside its sight (30 m by day, 14 m at night, × 0.6 crouched), with a line of sight on the ground plane. A body inside a building or underground is under a roof and never seen.
- **An intruder:**
  - on a home's grounds while the drone flies;
  - at a room: a barred or wanted face, a gun up, or anyone once the alarm is out.
- **When it sees an intruder:** the drone tracks you, marks you (8 s) and raises the room's alarm at the spot it saw you. After 6 s without seeing you, it goes back to its loop.
- **Shooting it down:** your rounds (`combat.js` segment) meet a drone whose spot the round crosses. At 0 hp (26) it falls and breaks.
- **Jamming it:** a `jammer` in your pack within 22 m makes it lose you and fly home for 30 s.

## 4. Formulas
- **House edge, about** (`edgeOf`): `0.44 + deck adj + 0.22·H17 + 4.6·(1.5 − bjPays) + 0.09·(no double-any) − 0.03·(re-splits)`.
  The deck adjustments are 1 deck −0.48, 2 −0.19, 4 −0.06, 6 0 and 8 +0.02.
  **Example:** the back room (1 deck, H17, 6:5, double 9-11 only) = 0.44 − 0.48 + 0.22 + 1.38 + 0.09 = **1.65%**. The floor (6 decks, S17, 3:2, double any) = **0.44%**.
- **Cover rule:** a bet `b` needs `house ≥ b × (2 + bjPays)`.
  **Example:** a $1,000 high-roller bet needs $3,500 in the cage.
- **The eye:** `tc = running / (cards left / 52)`. Suspicion rises by `eye × 0.34` when `tc ≥ 2` and `bet ≥ 3 × base`, and falls by 0.05 otherwise.
  **Example:** in the high-roller room (eye 0.9) you bet $50 cold and $1,000 hot, every other hand. That adds +0.306 per hot hand and −0.05 per cold one, so you are barred on the 4th hot hand (0.306 + 0.256 + … ≥ 1).
- **Palm caught:** `p = 0.15 + eye × 0.6`. That is 0.36 in the back room, 0.51 on the floor and 0.69 in the high-roller room.
- **Guard sight:** `26 + (12 − 26) × night` m. At dusk (night 0.5) that is 19 m.
- **Drone sight:** `(30 + (14 − 30) × night) × (crouch ? 0.6 : 1)` m. At night crouched that is 8.4 m.
- **Bounty:** `clamp(round(took × 0.5), 40, 2500)`, paid out of `cage + safe`.
  **Example:** a $5,000 safe posts $2,500. A $60 back-room till posts $40.
- **Runner travel:** `distance / 3.2 m/s`. A board 120 m away hears in about 38 s, plus the path's bends.

## 5. Edge Cases
- **The house can't cover a bet:** the bet is refused ("the cage is short").
  - A floor's cage under `floatAt` gets a guard walking `carry` from the safe. Off screen, the office moves it at once.
  - With the safe empty or opened, the tables stay short until winnings refill the cage.
- **The cash carrier dies on the way:** the carried money is lost to the house (`v.lost`). It is never re-minted.
- **Standing up mid-hand:** every open hand stands and settles. Standing up mid-chess game is a resignation.
- **The back room has no cage:** `rob target=cage` answers that the till is the bar's (hold up the barkeep through `pulls.js`'s own paths).
- **The cashier is dead:** the cage can't be opened at gunpoint. The safe still can.
- **Nobody watches the monitor** (the office guard is dead or away from his post): the cameras record nothing.
- **A town without a sitestories place** (an ad-hoc stamp): the room opens one for the town (`placeOf`) so its board exists.
- **A runner who can't reach the board** (killed, or the town released): nothing is posted. The robbery stays in the chronicle, and the deeds' own witnesses still gossip.
- **A drone over a home in a town with no room:** a home exists only where a room flies drones. A home's alarm is its own and calls nobody.
- **The town is released** (you leave): its rooms, homes and drones are dropped from memory. They roll the same money again only from the same building id. Money already moved (robbed or won) is not tracked across a release; this is the persistent-shard gap (§6).
- **NPC rounds** never hit the house's drones (only your rounds are tested), so a guard firing at you can't down his own drone.

## 6. Dependencies (both ways)
- **citygen** (`systems/citygen.js` live towns, `data/citygen.js` ARCHETYPES `boom_strip` / `major`, KINDS `saloon` / `hotel`): rooms sit on its buildings. *citygen does not know about casinos.*
- **pulls** (`systems/pulls.js`): the back room is a saloon's card table (`plan(bar).tables[0]`, `layout(bar)`), and its house is the bar's till. The pulls doc lists cards against a drinker; that game stays, and the back room's blackjack is the house game beside it.
- **sitestories / the Tally** (`systems/sitestories.js` `post`, `nearestPlace`, `addPlace`, `boardOf`): a witness posts the bounty on arrival. WEB_SITE_STORIES lists casinos as a poster.
- **deeds** (`systems/deeds.js` `record('rob')`): the chronicle row the bounty cites, and the world-memory rumours.
- **ai** (`systems/ai.js`, one line): `c.casinoId && g.casinos.think(c, dt)`.
- **combat** (`systems/combat.js`, five lines): a drone in a round's path (`kind 'cdrone'`), only for your rounds.
- **main** (`main.js`, four lines): construct, update, E-interact first after gunpoint, `noise()` forwards to `onNoise`.
- **interiors / understreet** (read only): the back door and the drain way for `plan`.
- **drones** (`systems/drones.js`): the same frame (body, four rotors, red eye, shadow) and the same fly-and-mark idea. The house's drones are their own records, because the existing drone is a single player-flown bird.
- **gadgets** (`data/gadgets.js` `breach_charge`), **items** (`lockpicks`, `crowbar`; the `jammer` row is registered from `data/casinos.js`).
- **ui-editor** (`data/panellayout.js` `table` panel).

## 7. Tuning Knobs (`web/src/data/casinos.js`)
| knob | default | safe range | what it changes |
|---|---|---|---|
| STAKES.*.min / max | 1-10 / 5-100 / 50-1000 | max ≤ cage lo ÷ 4 | how fast money moves |
| STAKES.*.cage / safe | see §3.1 | cage lo ≥ 4 × max | how rich a robbery is; how long a lucky streak runs before the table goes short |
| STAKES.*.floatAt / carry | 300/600 · 2500/4000 | floatAt < carry | how often a guard walks money across the floor (a robbery window) |
| STAKES.*.entry | see §3.1 | fee 0-500 | who sits; dress gates the high-roller room |
| BLACKJACK.*.decks / pen | 1-8 / 0.6-0.75 | decks 1-8, pen 0.4-0.9 | counting value (deep pen, few decks = more) |
| BLACKJACK.*.dealerHitsSoft17 / bjPays | H17 6:5 back room | bjPays 1-2 | the edge (≈ +0.22% and +1.38%) |
| CHESS_PLAYERS.*.depth / blunder | 1-3 / 0.35-0.02 | depth 1-3 (4 is too slow in the page) | how hard each opponent is |
| EYE.spread / hot / jump / decay | 3 / 2 / 0.34 / 0.05 | jump 0.1-1 | how fast a counter gets barred |
| EYE.catch | [0.15, 0.6] | sum ≤ 0.95 | palming risk |
| GUARD.sight / hear | [26, 12] / 45 | sight 10-40 | how stealthy a robbery can be |
| CAGE.hold | 2.2 s | 1-5 | how long you stand at the cage |
| SAFE.*.time / noise | 9/0 · 5/30 · 2/90 | time 1-30 | quiet versus fast |
| WITNESS.speed / bounty | 3.2 / 0.5 | speed 2-5 | how long you have before the board knows |
| SEC_DRONE.sight / hp / jam / hours | [30, 14] / 26 / 22 / 18-7 | sight 10-50 | how hard the rich are to rob |

## 8. Acceptance Criteria (`selftest only=casinos:`, 13 checks)
| check | proves |
|---|---|
| the rows validate | `validateCasinos` passes the shipped rows; a broken set (bad `where`, purple felt, a cage too small for its max, 0 decks, depth 9, an unknown chess player, a safe tool that is not an item, a purple drone eye) trips at least 7 named errors |
| a casino strip has its rooms | a stamped `boom_strip` gives a high-roller room and a floor. The guard count matches the row (posts + patrol), the drone count matches, the owner's home exists, and the same building rolls the same cage and safe (rolled once) |
| blackjack deals from a real 52 × N shoe and pays 3:2 on a natural | the shoe holds 4 × decks of every rank and 13 × decks of every suit. 300 hands deal only cards from the deck set, the shoe reshuffles at its cut, and a natural on $100 through the real table moves the cage −$150 and your pocket +$150 |
| the dealer stands on 17 per the row | S17 (high-roller row): the dealer's A 6 stands at two cards. H17 (back-room row): the same A 6 draws the waiting 5. A hard 17 stands |
| the chess NPC never makes an illegal move and loses to a mate-in-one when skill is low | 7 games of random play against every row with no illegal reply. At the real table, the drunk (depth 1) takes the knight's bait (c6b4) and is mated by a1a8 ("you won"); the shark does not take it |
| the house pool changes by exactly the bets | 40 hands with hits, stands, doubles and splits. The cage delta = Σstaked − Σpaid to the dollar, your pocket moves by the opposite, and the room's stats agree |
| counting cards gets you shown the door | min bets cold, max bets on a hot shoe: barred, and `entry` refuses a seat |
| a robbery alerts guards only when someone sees or hears it | guards out of sight and earshot, cameras unwatched: the cage robbed, the alarm stays calm, and the cashier becomes a runner to a guard. Only on arrival is the house alert, at the spot the cashier saw (> 30 m from where you are by then) |
| the bounty board gets the robbery only after a witness reaches it | no bounty while the witness runs. On their arrival, a player bounty for the robbery's chronicle row is pinned on that board, and the house's cash went down by exactly the pay |
| a guard who sees it or hears it raises the alarm at once | the cage guard in sight: instant alarm. The office safe blown with the only guard behind a wall (no line of sight) inside earshot: instant alarm, named as heard |
| a security drone spots by line of sight only | open ground with a gun up: seen, tracked, marked, the alarm raised at your spot. Behind the building (inside range): not seen. Inside the building: not seen. A jammer in the pack: jammed, no alarm |
| a security drone can be shot down | your rounds through the real `combat.hitscan` path take its hp; it falls, and `dronesDown` +1 |
| draw calls stay under budget | a strip live with its rooms, tables and drones: < 150 |
