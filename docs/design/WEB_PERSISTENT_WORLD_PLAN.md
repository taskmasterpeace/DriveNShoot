# WEB_PERSISTENT_WORLD_PLAN — the shard never sleeps

**Status:** master plan, 2026-10-27. Nothing here is built unless a row says so. **Owner of every call marked ☐: Robert.**
**Engine:** the three.js web engine (`web/`, see `web/AGENTS.md`). **IP law (binding):** `WEB_FAN_SERVICE_BIBLE.md`. We
borrow shapes, verbs, loops and counts. We never borrow names. Every word a player reads comes from our vocabulary
(scrip, stamps, bricks, the Swap, Keyholders, bulls, pressings, husks, the trundle, the iron, poles, knots, THE
CAROUSEL) and must pass `node tools/ip-lint.mjs`.

**Read with:** `WEB_DEATHLANDS_GAP.md` (G1–G10), `WEB_SHARD.md` (v0 + roadmap §3.9), `WEB_CLONE_TRAVEL.md`,
`WEB_WORLD_MEMORY.md`, `WEB_ROLES.md`, `WEB_STREAMING.md` (tiers, K, chunks), `WEB_LOCATION_BIBLE.md`,
`WEB_WORLD_EDITOR_PLAN.md` §1.1 (Robert's 23 settled calls), `docs/research/GENRE_DEPTH.md` (stats, jobs, bases, hordes,
tactical AI, MP lessons, top 50).

**Robert, 2026-10-27, condensed:** *"When you start a server, it's always running, stuff is always going on. Even outside
the cities the world is so big, think Ultima Online. You should be able to set up your place and just be living somewhere.
Lock the door, lock the windows. Make the game fun, but brutal. Catch the bus back home, get off in the middle of nowhere,
find some transportation from there to your base. Factions, what's going on in the world. Life insurance gets you clones;
you choose which major city you come back in (LA, Miami, Houston, New York, Chicago). A crew of 1–6, starting solo. Sealed
bunkers in military bases, vast and far between. Cities can get overrun. Think of everything."*

---

## 1. Overview

### 1.1 What this document is
This is the one plan that ties every running lane into **one always-on game**. It does not re-plan what those lanes are
building inside. It says what the shard does with their output, in what order, and what nobody is building yet.

| Lane already running | What it hands this plan | Where it plugs in here |
|---|---|---|
| Camera views / aim / gun carry (G1, G2) | the tilted boom, the gun at the side | M1 look-and-feel gate; PvP readability §3.6 |
| Crew + tactical faction AI + crew jobs (G3, GENRE §2, §5) | crew records, orders, job ticks, doctrines | offline defense §3.2.6, crews of players §3.6.1, raids §3.5 |
| Procedural cities / storeys / bunkers / overrun (G4, G7, GENRE §4) | city archetypes, 6-storey buildings, bunker interiors, district infestation 0–5 | claimable stock §3.2.1, overrun events §3.5, Carousel sites §3.4.6 |
| Faction audio + LLM dialogue + deep stats + music/radio | voices, the stat sheet, stations | news channels §3.5.3, LLM fact sheet §4.10 |
| Gadgets / traps / security (patrol cars, mines, drones, road chains) | trap and lock rows, town security | locks and barricades §3.2.3, town patrols §3.6.4 |
| Wilds (hunting, fishing, tracking, birds) | fauna records, butcher/cook | food chain §3.7.3, the outside-the-city life §3.3 |
| Clone insurance + risky bus journeys + request stops | policies, husks, lines, EN_ROUTE rolls | §3.3.1, §3.4 |
| QoL pass (pause menu becomes tabs) | the tab shell | the WORLD, HOME, LEDGER and LAW tabs §3.6.6 |

### 1.2 The shape of the whole game, in one paragraph
One **shard** is a persistent United States, split into **regions** that each run on a server process. The server owns
the truth: every person, car, door, husk and stamp of scrip. The world keeps running when nobody is near. Factions trade
and fight. Buses run their timetables. Hordes migrate. Districts fall to the infected and are taken back. Weather fronts
cross. Seasons turn. A player lives somewhere real: a squatted motel room, a rented flat inside a walled holdout, or a
deeded farmhouse they boarded up themselves. They insure their life at one of five **metro vats**. When they die they come
up in that city with nothing, and they have to get back to their husk and their home. That trip is the game's signature
beat. It runs on a bus, a train, a stolen car or their own two feet.

### 1.3 Decisions that stay Robert's call ☐
1. **Shard clock: 8×** (one game day is 3 real hours). The offline game keeps today's 30× (`sky.js timeScale = 1/30`).
   See §4.1.
2. **Wipe policy:** campaign shards of 12 real weeks with a legacy carry-over, plus one permanent **Long Road** shard that
   never wipes. See §3.1.7.
3. **PvP default:** zoned (lawful towns, marked wastes, free-fire hot zones). GENRE §6 says ship PvE first. This plan
   ships the zones with PvP damage **off** until M6.
4. **Hosting:** one cloud box per shard (8 vCPU, 16 GB, NVMe), like LogNog's prod host. It is never this PC. Which provider
   is Robert's call.
5. **Florida ↔ Arizona link on day one:** add a Miami field to FIVE CITY AIR (today its cities are NY, LA, New Orleans,
   Ohio and Chicago), or open the shard with Florida only.
6. **Die flat stays final** (WEB_CLONE_TRAVEL §3.4). This plan adds an **heir** (§3.3.4) so the house and half the brine
   book survive the character.

---

## 2. Player Fantasy

*Tuesday, 9 p.m. You log in on the cot in the back of the boarded laundromat in Hialeah that you squatted three days ago
and deeded yesterday for 900 stamps. The window bars you welded are still on. Nobody tried them, but the card on the door
says the Ash Road boys walked past twice while you were gone, and Teo, your one hired guard, shot a Sprinter off the
loading dock at 4 a.m. The radio says the Gulf Line coach got hit at mile 212 and Houston is closing its east gate. The
broadsheet tacked by the pole says the Keyholder of Little River is facing a vote on Sunday.*

*You take the pickup north for a job. You hit a road chain under a dead overpass, the Ash Road boys come out of the
culvert, and you die in the cab with 600 stamps in your pocket. Black, then amber. You come up in the Miami vat, shaking,
with a loaner pistol and no bullets. Your husk is 41 game-miles up I-95. You buy a punch on the SALT LINE, ride two hours,
pull the cord at the request stop nearest the overpass, and walk the last two kilometres at dusk. The pickers have your
rifle, but your shotgun is still under the seat. The pickup has four tyres. You drive it home. Teo is still alive. The
bars are still on. The world went on the whole time, and you were part of it.*

What each fan should recognise (shapes only):
- **Ultima Online:** a shard that keeps going, a house you own and lock, a corpse run, murderers with a mark on their name.
- **Autoduel:** the clone and the car left in the ditch.
- **Project Zomboid:** a server where the door you broke stays broken and a city dies over thirty days.
- **The novels' world:** walled kingdoms with odd laws, dangerous roads between them, a machine in the ground.

| Feeling | Delivered by |
|---|---|
| "The world doesn't wait for me" | §3.1 the always-on shard, §3.5 world events |
| "This place is mine" | §3.2 living somewhere |
| "Dying hurt, but I can fix it" | §3.3 brutal but fun |
| "Getting there was the adventure" | §3.4 travel as gameplay |
| "I know what's going on, and I changed it" | §3.5 factions and events |
| "Other people are the best and worst part" | §3.6 multiplayer social |
| "Scrip means something" | §3.7 economy |

---

## 3. Detailed Rules

### 3.1 THE ALWAYS-ON SHARD

#### 3.1.1 Authority
- **Today (v0):** client-authoritative. Pages simulate their own surroundings. The shard stores characters and world rows
  with last-writer-wins (WEB_SHARD §3.1).
- **Target (M4):** **server-authoritative per region.** Each region runs one Node process, the **region sim**, which owns
  every entity and every roll. Pages send inputs (move, aim, fire, interact, drive) at 30 Hz and get state at 20 Hz. They
  predict their own player and car, and they draw everyone else 100 ms behind the server.
- **What makes it possible:** the **SIM-CORE SPLIT** (new lane, §8). Every system in `web/src/systems/` that changes state
  (ai, combat, vehicles, inventory, interiors, materials, deeds, factions, survival, clone, travel, dogs, fauna, zombies)
  gets a pure half that runs in Node without three.js or a GPU. Rendering stays in the page. The streamer's LAYOUT tier is
  already pure data (`layoutChunk` is a pure function of seed, cx, cz and dataHash), so the server builds collision and
  nav from the same rows the page draws.
- **The wire messages from v0 stay** (presence, world patches, character saves). They become server-generated instead of
  client-claimed (WEB_SHARD §3.9 step 4).

#### 3.1.2 Regions and scale
World frame from WEB_STREAMING §3.1: K = 5.2, a road scale near 1:14, a world of **390 × 221 km (86,190 km²)**. Coast to
coast on I-80 is about 2 real hours flat out, and Miami to Orlando is 10 minutes.

| Region | Process | Metro vat | Holdouts at launch | Opens at |
|---|---|---|---|---|
| **FL** Florida | `region-fl` | Miami (Meridian's bay is its branch until the Miami metro stands) | Meridian + 4 generated | M4 |
| **SW** Southwest (I-10, Phoenix, El Paso) | `region-sw` | none (Rust Haven keeps a local brine room) | Rust Haven + 4 | M4 |
| **CA** California | `region-ca` | Los Angeles | 5 | M7 |
| **GULF** Texas–Louisiana | `region-gulf` | Houston | 6 (New Orleans is a city) | M7 |
| **MW** Great Lakes | `region-mw` | Chicago | 6 (Ohio is a city) | M7 |
| **NE** Northeast | `region-ne` | New York | 6 | M7 |

- A region is a rectangle of whole 256 m chunks. A **seam** is a 512 m band where both processes hold the LAYOUT and the
  owning process hands an entity over when its centre crosses the midline (§4.3).
- **Players per shard:** a design target of **250 concurrent** (CCU), at most 80 per region process, and about 2,500
  monthly actives. A soft cap of 300 opens a queue (shown on the title's status line).
- **Density, the honest number:** 250 players over 86,190 km² is one per 345 km². That is far emptier than Ultima Online.
  It is deliberate (the wastes are vast) and it is fixed with **social gravity**: vat cities, knots, poles, the Swap,
  siege nights and world events pull people together. The acceptance test (§8.6) is that a median player meets another
  real player within 20 real minutes of logging in.

#### 3.1.3 What runs when no player is near: the simulation LOD tiers
The streaming tiers (Full / Ghost / Abstract, WEB_STREAMING §3.7) become server tiers. Each has a tick rate and a CPU
budget per region process.

| Tier | Where | What it holds | Tick | Budget per region |
|---|---|---|---|---|
| **S0 LIVE** | within 250 m of any player (the union of their bubbles) | full characters, cars with physics, doors, bullets, fire, the witness pass | 30 Hz physics, AI think 5 Hz, squad coordinator 1 Hz | ≤ 1.5 ms per bubble per tick; 80 bubbles ≈ 12 ms of a 33 ms tick |
| **S1 NEAR** | 250 m – 3.5 km of any player | ghost records: traffic, convoys, squads, herds as group records, residents on their day plan | 5 Hz, a fifth of the records per tick | ≤ 2 ms |
| **S2 REGIONAL** | the rest of the region | schedules: buses and trains at `position(t)`, caravans on graph edges, horde migration on the 256 m grid (GENRE §4.2 layer B), pickers on husks, crew jobs | 1 Hz; migration every 60 s; jobs every 10 game min (75 real s) | ≤ 3 ms per second |
| **S3 STRATEGIC** | the whole region | factions' income, stores and recruiting (`factionsim.js`), prices, weather fronts, district infestation, skirmishes, territory, elections, the newspaper | every game hour (7.5 real min) and every game dawn (3 real h) | ≤ 200 ms per tick, run in slices |
| **S4 SHARD** | across all regions (the **world service** process) | inter-region travel, air schedules, the Carousel network, cross-region wars, the shard chronicle, the clock, seasons | every game hour, every real day | ≤ 1 s per tick |

- **Promotion is honest.** When a player's bubble reaches an S2 record (a caravan, a herd, a squad), it is promoted from
  its record (same id, hp, cargo and seed) at the edge of S1, never in sight (WEB_STREAMING §3.7). Nothing fights in S2;
  an S2 conflict is resolved by the strategic formula (§4.5) and its result is written as if it had happened.
- **Everything is a record first.** Bodies exist only in S0. Out there, the dead are counts, a bus is `s` along its line,
  and a siege is a number until somebody drives up to it.

#### 3.1.4 The clock, day and night, seasons
- **Shard clock 8×:** 1 real second = 8 game seconds. 1 game hour = 7.5 real minutes. **1 game day = 3 real hours.** 8 game
  days pass per real day. See §4.1.
- **Night** runs from 20:00 to 05:00 game time: 9 game hours, or **67.5 real minutes** of truly dark night (Robert's
  "dark and scary" default, WEB_LOOK §3.1b). A player on for a 2-hour evening sees one night.
- **The clock never stops.** No player can sleep the world forward. On the shard, `N` (sleep) is a safe logout on a bed,
  and sleeping on a coach is "riding it out" (§3.4.2).
- **Seasons:** each lasts **3 real weeks** (168 game days). A campaign is spring, summer, autumn, winter: 12 real weeks.
  Seasons feed the existing rows: BURNOUT SEASON (bible F4: Sprinters ×0.5 in summer, ×2 in winter), crops, fishing,
  cold (WEB_SURVIVAL climate), and road washouts in spring.
- **Weather is regional on the shard.** Each region has a front (dust, rain, heat, ash, fog) rolled at S3 from the biome
  weights. Fronts cross seams in 2–6 game hours. That is a change from WEB_STREAMING's "weather stays global", and it is
  owned by the world-clock lane.

#### 3.1.5 Persistence
**Store:** SQLite (`node:sqlite`, as WEB_SHARD §3.9.2 planned), one database file per region plus one for the world
service. It is written as a **snapshot + an event log** (a write-ahead journal of game verbs).

| What | Kept as | Written | Kept for |
|---|---|---|---|
| Accounts, sessions, characters (WEB_SHARD §3.3 fields + crew, policy, deeds) | rows | on every change, coalesced to 2 s; on logout | forever (campaign shards: until the wipe) |
| World rows: doors, windows, barricades, claims, the named dead, taken cars | rows | on change, 2 s batches | forever |
| Entity records: parked cars, husks, claimed-building containers, named NPCs, convoys, squads, herds | rows with a version number | S2 tick, dirty rows only | until destroyed |
| District state: infestation 0–5, nests, hive HP, loot clock, owner faction | rows | every game dawn | forever |
| Factions: standing ledgers, stores, strength, relations, leaders, laws | rows | every game hour | forever |
| Economy: per-ruler money supply, trader stock, price indices | rows | every game hour | forever |
| The chronicle (WEB_WORLD_MEMORY §3.5) | the ring + tally + legend + digests, now per region | on insert | ring 4,096, digests 90 game days |
| **The event log** | append-only `{seq, t, region, actor, verb, args}` | fsync every 1 s | 7 real days, then folded into the weekly archive |
| **Snapshots** | the whole region (rows + records) | every 10 real minutes and on every graceful stop | the last 48 (8 real hours) + one a real day for 30 days |

- **Recovery:** load the newest snapshot, replay the log from its `seq`. A crash loses at most 1 s of verbs.
- **Unclaimed world loot is not object-level.** A district's containers are re-rolled from the seed on a **loot clock**
  (every 4 real days, scaled by infestation: an overrun district restocks richer, GENRE §6). Only claimed buildings keep
  object-level contents. That keeps the save to the size of §4.4.
- **Rollback policy:** a dupe or exploit is rolled back from the log for the actors involved, never the whole shard.

#### 3.1.6 Restarts
- **A daily rolling restart** at 05:00 server time, one region at a time, 4 minutes each. A 10-minute warning goes out on
  every radio ("THE WIRE GOES DOWN AT FIVE") and as a HUD toast. A player in a restarting region is held in a "the road is
  closed" fade and comes back where they were. The other regions keep running.
- **The world catches up after downtime:** missed S3 ticks are run in fast-forward on boot (capped at 24 game hours).
  Missed S2 schedules are recomputed from `position(t)`.
- **Data changes** (World Forge edits) land only on a restart (WEB_WORLD_EDITOR_PLAN §5), with the data hash checked.
  Pages carry the hash and are told to reload if theirs is old.
- **Unplanned crash:** the reconnect loop from WEB_SHARD §5 already handles it. With server authority, the page **does**
  take the server's copy back (the server is newer).

#### 3.1.7 Wipes and campaigns ☐
- **Campaign shards** (`DSOA-FL-1` and so on): 12 real weeks, the shard's year of four seasons (672 game days). Week 11 shows a
  countdown on the radio and the broadsheet. The last game day is the **Long Night**, a shard-wide siege.
- **Legacy carry-over** to the next campaign, per account: one character's name, flag, face and earned traits; one vehicle
  blueprint (not the car); cosmetics; the account's chronicle legend lines; a Legacy plaque in the next campaign's vat hall.
  No scrip, no items, no skills.
- **The Long Road shard** never wipes. It has a stricter economy (sinks ×1.2, §3.7) so it does not drift.
- **Hardcore Legacy** (optional per shard): no metro vats, every death is flat, the obituary airs (bible PZ row).

### 3.2 LIVING SOMEWHERE

#### 3.2.1 The ladder of a home
A home is claimed in one of four ways. Every one is a row on the shard's `claims` table, which grows out of v0's
`claims[key]` (WEB_SHARD §3.4).

| Rung | How you get it | Where | Protection | Upkeep | Cap |
|---|---|---|---|---|---|
| **SQUAT** | clear it (no hostiles within 30 m, GENRE §3.1), shut its doors, hold E on its door for 10 s ("plant your flag") | any building nobody holds, inside or outside a city | none from players; AI raids at full size; nothing is safe offline | none, but **lapses after 72 real hours** without a visit | 2 per character |
| **RENT** | pay a holdout's landlord (a Keyholder's office row) | a room or flat inside a walled holdout | the holdout's law: bulls answer a break-in within 45 s; cold-sealed offline (§3.2.6) | 8–40 stamps per **real** day in the holdout's scrip (§3.7) | 1 per character |
| **DEED** | buy it at a ruler's land office, or file on a squat you have held 3 real days (filing fee = 10% of its assessed value) | any building or plot outside a holdout's wall, or a lot inside one | cold-sealed offline; warm window (§3.2.6); your crew and traps | tax per real day (§4.6) | 1 per account (the **homestead**) + 1 outpost per 2 crew members |
| **CHARTER** | 6+ deeds by 3+ accounts within 300 m, a wall line, a water source, 5,000 stamps | a player-run holdout (§3.2.8) | its own gatemen, House Rules and law | the charter's levy | an account belongs to 1 charter |

- **Claimable stock is plentiful.** The Phoenix ring alone has 2,477 walk-ins. Each metro generates about 3,000 and each
  1.5 km city about 900. At launch (FL + SW) that is over 9,000 claimable buildings for 2,500 accounts, so land never runs
  out the way it did in Ultima. Military bases, Carousel stations, vats, poles, traders' shops and named NPCs' homes are
  **never claimable**.
- **Plots:** outside cities, an empty 40 × 40 m patch can be deeded and built on with the base-building rows (GENRE §3.2,
  §3.3). Building on a plot needs Carpentry 20 and materials. The Building Lab (`lab.html`) is the editor for authored
  plans (a later rung, Robert's "use our creator").
- **What a claim shows:** the door plate reads `ROBERT'S PLACE · DEED · SEALED` or `SQUAT · OPEN`, with the owner's cloth
  flag (the flag law). The map's HOME tab pins every claim you hold.

#### 3.2.2 Getting in, keys and permissions
- A claim has a **key ring**: owner, co-owners (up to 5, any account), friends (enter only), crew (AI and humans in your
  crew). A key is an item (`key:<claim>`). Copying one needs a keycutter (a trader) and 20 stamps. Changing the locks
  voids every copy and costs 60 stamps.
- **Doors** keep the v0 rule: a door's angle is local, its lock is world state. On the server, the angle becomes world
  state too (M4).

#### 3.2.3 Locks, windows, barricades (numbers; the security lane owns the rows)

| Thing | Tier | HP | Pick | Break in | Cost |
|---|---|---|---|---|---|
| Door latch | L0 | as built | none | kick 2–4 | free |
| Key lock | L1 | +150 | 20 s, lockpick, Mechanics 20 | crowbar 15 s (loud, 25 m) | 30 stamps |
| Deadbolt | L2 | +350 | 45 s, Mechanics 40 | crowbar 40 s; shotgun breach 3 shells | 90 |
| Barred from inside | L3 | +600 | cannot be picked | sledge 90 s (loud, 60 m); a charge | 2 planks + 1 bar; only works with someone inside or **sealed** |
| Steel door + padlock | L4 | 1,200 | 90 s, Mechanics 60 | cutting torch 120 s; 2 charges | 400 + a welder |
| Window glass | W0 | 10 | — | one hit | — |
| Boarded (3 boards) | W1 | 100 per board | — | infected ~20 s a board (GENRE §3.3) | 3 wood |
| Barred | W2 | 600, see-through | — | torch 60 s | 8 metal + welder |
| Steel shutter | W3 | 800, blocks sight | — | torch 90 s | 12 metal + welder |
| Wrecked-car wall | B | 1,500 a husk | — | — | tow a wreck (GENRE §3.3, the DSOA wall) |

- **Alarms** (security lane): a can line (free, 15 m noise) or an electric bell (power 1, rings your radio, §3.6.5).
- **Traps** (gadgets lane): landmines, punji pits, road chains, tripwire shotguns. A trap on a claim may only harm people
  who are **trespassing** on it. A trap set in a public road or a holdout street is a `trap` deed and makes you a criminal
  (§3.6.3). Each claim may hold traps worth at most 300 stamps per 100 m² (stops minefield griefing).

#### 3.2.4 Storage
- **Containers** keep the WEB_INVENTORY litre and kg law. A claim's storage is its furniture plus whatever you build.
- **The strongbox:** one per deed (40 L, 30 kg). It **can never be looted by anyone**, offline or online, and it survives
  the claim lapsing (it goes to the vat's left-luggage counter in the region's metro). It is the anti-despair box.
- **The vat locker:** every account has a 20 L locker at its policy's metro vat. It is lawful-zone safe. You come up next
  to it.
- **Car trunks** stay world containers. A locked car (keys, WEB_SHARD §3.5 "LOCKED - BIRCH'S CAR") follows the same lock
  tiers (L1 by default).

#### 3.2.5 Upkeep and decay (real days, because owners are offline in real time)
- **Rent and tax** come from the claim's **house ledger**, a pre-paid balance at the land office, then from the brine book.
  Short 3 real days → **LIEN** (the door plate says so; the strongbox stays safe). Short 10 real days → **FORECLOSED**: the
  claim drops to a squat-able building, its contents stay as a **ghost house** for 3 real days (others may loot it; looting
  it is not a crime), then the loot clock takes it. The strongbox goes to left luggage.
- **Wear:** walls, boards and locks lose 1% HP per real day (GENRE §3.4, adapted to real days). Weather and seasons scale it
  (×2 in winter for wood). Crew with the Builder job repair 50 HP per game hour.
- **No-visit decay** for deeds: no owner or co-owner inside for 21 real days → LIEN, whatever the ledger says. That frees
  land from quit players.

#### 3.2.6 Offline protection: cold and warm (GENRE §6 rule 1)
- **Warm window:** while any owner, co-owner or human crew member is online **in that region**, and for **30 real minutes**
  after the last one logs off, the claim is **WARM**: players can break in (a crime, §3.6.3), AI can raid it at full size.
- **Cold:** after that, the claim is **SEALED**. Doors and windows on a sealed claim take **no damage from players**.
  Players cannot enter it (doors auto-lock to their best tier at sealing time; an open window gets the claim's shutters if
  it has them, else it stays the one way in, which the HOME tab warns about in red).
- **AI still comes.** Infected sieges hit sealed claims at **50% size**. Faction raids are resolved at S2/S3 by the raid
  formula (§4.7) against the claim's **defense score**. A lost raid can take at most **25% of the value of unlocked
  storage**, never the strongbox, never the claim itself, never a crew member's life (they are "downed and dragged off" and
  come back at the next game dawn wounded, unless they are a dog).
- **AI crew defend it.** Crew left on GUARD fight with the crew lane's doctrine when the raid is promoted (somebody online
  is nearby) and add to the defense score when it is not.
- **WHILE YOU WERE GONE:** the first login after an absence shows one card: who came, what was lost, who fought, what the
  crew made, what is owed. It uses the chronicle's own records (no invented story).

#### 3.2.7 Raids when you are online
- **Players:** may break into a warm claim. Breaking a locked door of a claim is a **burglary** deed (weight 3). The owner is
  told at once if the claim has an alarm on a radio (§3.6.5), and at their next login if not.
- **Holdout law** inside a wall: bulls (the security lane's run-down town security, with patrol cars) answer a break-in in
  45 s. In player charters (§3.2.8) the charter's own gatemen answer.
- **AI:** the faction raid rule (GENRE §3.5) with wealth-scaled size, warned on the radio 1–3 game hours ahead (7.5–22.5
  real minutes) if anyone in the crew has a radio room.

#### 3.2.8 Neighbours, player towns and player-run holdouts
- **A neighbourhood:** 3+ claims by 2+ accounts within 150 m get a shared **street board** (notes, a watch rota) and a
  shared alarm channel.
- **A charter** (the player-run holdout): 6+ deeds by 3+ accounts inside one wall line, a water source (well, tower or
  river), and 5,000 stamps to the region's ruler. The founders pick a **Keyholder** (by vote of deed holders), 1–2 **House
  Rules** from the same table the holdout generator uses (G7), a levy (0–15% on its Swap, 0–30 stamps per real day per
  deed) and its gatemen (hired NPCs or players).
- **Charter tiers:** CAMP (6 deeds) → TOWN (15 deeds, a Swap, a clinic) → HOLDOUT (30 deeds, a brine room for local
  pressings, may print its own scrip backed by its stores, §3.7.1).
- **Politics:** an election every 2 real weeks, or a no-confidence vote on a petition of 1/3 of deed holders (the HOLDOUT
  VOTE shape from the bible's We're Alive row, plus our ballots). A Keyholder may jail, fine and exile inside the wall
  under the House Rules; exile voids a deed's charter protection but not the deed.
- **The ruler watches:** a charter that grows too strong (strength > 40% of its host ruler's) gets a ruler event (a tithe
  demand, an envoy, a siege if refused). That is how player towns become part of what is going on in the world (§3.5).

### 3.3 BRUTAL BUT FUN

#### 3.3.1 Death and insurance on the shard (extends WEB_CLONE_TRAVEL)
- **Life insurance = a policy.** You sign it at one of the **five metro vats** (LA, Miami, Houston, New York, Chicago). The
  policy names your **come-up city**. You pay a pressing (§4.8 prices) and a premium per **active day** (a game day during
  which you were logged in at least once) plus a dormant fee of 5 stamps per real day while away. A real week away costs 35
  stamps, not 1,120.
- **Changing your city** costs 25% of a pressing and takes effect at the next game dawn.
- **Local brine rooms** (Rust Haven, Meridian's bay, a HOLDOUT-tier charter) sell a **local pressing**: 60% of the price,
  you come up there. Holding a local pressing replaces your metro one (one pressing at a time, as today).
- **The husk** and **pickers** work as built. Shard numbers: `keepDays` becomes **48 real hours**, the pickers' odds are per
  game hour as now (so 16 game hours a real day), and **other players** may loot your husk after a **5-minute grace** (a
  `rob` of the dead: a criminal flag for 3 minutes, §3.6.3, unless they are in your crew).
- **Your car** stays where it was. A **tow policy** (a rider on your life policy, 4 stamps per active day) has a line tow
  truck drag a wrecked or abandoned car of yours to the metro's yard at the next game dawn. Its trunk comes too, minus the
  pickers' share.

#### 3.3.2 What you never lose
1. Your account and your characters' names, flags and faces.
2. Skills **as pressed** (xp after the pressing is lost; that is the brutality).
3. The brine book (the bank), the vat locker and the strongbox.
4. Your deed and the claim's built defenses (they only decay by the rules in §3.2.5).
5. Standing, roles, memories of you, quests and the chronicle's record of you (the world's memory survives your body).
6. Crew who were not with you. Crew who were with you are downed, not dead, unless they were killed before you died.
7. The discovered map, known recipes, the Carousel codes you learned, radio frequencies you found.
8. Cosmetics and legacy plaques.

#### 3.3.3 Anti-frustration rules (each is testable, §8)
- **No walk longer than 6 km on a road.** Every line has **request stops** every ~3 km between poles (the clone lane is
  building them). Any point on an interstate or highway in a launched region lies within 6 km (about 25 real minutes on
  foot) of a pole or a request stop.
- **No wait longer than 60 real minutes** for a coach on any launched line (the trundle every 8 game hours = 1 real hour
  at 8×; §4.2).
- **A husk run has a target:** median 15 real minutes, p90 40, hard ceiling 75. A death farther than that from your
  come-up city (by the router) offers a **salvage contract** at the vat: pay 30% of the husk's value and a picker crew
  brings its 3 best things to your locker at the next game dawn.
- **You can always afford to get home.** Broke at the vat: the **drifter's dole** gives one meal, one bottle and a punch on
  any line inside the region, once per real day. Or **work the line**: wash the coach (a 2-minute job at any pole) for a
  free punch.
- **Charity pressing:** a character with no pressing and under 50 stamps total gets one free pressing per real week, at the
  **least-busy metro** (the vat picks), brine-sick for 48 game hours. Dying flat is still possible; it only happens to the
  careless twice.
- **Green plate:** new characters cannot be hurt by players for 72 hours of play time, or until they hurt a player (GENRE
  §6 rule 2). They come up only in lawful zones.
- **Safe logout** happens on a bed in your claim, on a coach, in a vat hall, or in a rented room: instant. Anywhere else
  your body **lingers 60 s** in the world (no combat logging).
- **Warnings that land before the pain:** a red UNPRESSED tape on the HUD, LIEN on the door plate, the radio naming a road
  that is hot today, and the siege countdown from day 10 (§3.5).

#### 3.3.4 The heir (dying flat, softened) ☐
When a character dies flat on a shard, the account may make an **heir**: a new character, a new name, skills from the
point-buy (WEB_CREATOR), and the dead one's **deed, strongbox, 50% of the brine book and one surviving crew member** of
the player's choice. The radio airs the obituary (bible THE OBITUARY). The heir starts with an earned trait: **Survivor's
Kin** (GENRE §1.5 earned traits, ours).

#### 3.3.5 Pacing loops
| Loop | Real time | Game time | What fills it |
|---|---|---|---|
| **Minute** | 30–90 s | 4–12 game min | a fight, clearing a room, a drive between exits, a trade at a counter, a witness running |
| **Hour** (a run) | 30–60 min | 4–8 game h | a scavenge run, a job (FREIGHT PAPER, FLANK PAY), a husk run, a hunt, a bus trip |
| **Session** | 2–3 h | ≈ 1 game day | wake at home → upkeep (feed the crew, check the ledger) → one big run → back before dark (67.5 real min of night) or ride out the night inside |
| **Day** (real) | 24 h | 8 game days | the S3 world moves: 8 dawns of district spread, 8 newspapers, 1 real-day decay tick; your crew's jobs (capped, §4.9) |
| **Week** (real) | 7 days | 56 game days | **4 siege nights** per region (every 14 game days, §4.11); 1 Swap price cycle; faction war turns; an election every 2 weeks |
| **Season** | 3 weeks | 168 game days | weather, crops, Sprinter burnout, a big shard event (§3.5) |
| **Campaign** | 12 weeks | 1 game year | the Long Night, then the wipe and legacy |

#### 3.3.6 The first 30 minutes (a new player, solo, Florida)
| Real time | What happens | System |
|---|---|---|
| 0:00 | Title (SHARD DSOA-FL-1 · 143 IN THE WASTE). CREATE ACCOUNT, NEW CHARACTER, the point-buy, a flag. | WEB_SHARD login, WEB_CREATOR |
| 0:04 | Come up in the **Miami vat's** newcomer bay (the starter pressing, free; WEB_CLONE_TRAVEL §3.1). Green plate on. Brine-sick for 6 game hours only (newcomer's mercy). The vat keeper speaks (LLM, grounded): "You're pressed. Lose that body and you're back here. Lose the pressing and you're gone." | clone lane, LLM lane |
| 0:06 | The locker gives the starter kit: a pistol and 12 rounds, a canteen, a jerky, a knife, 120 stamps of Miami paper. A HUD line: FIND A PLACE TO SLEEP BEFORE DARK (game 14:00, so dark in 45 real minutes). | objectives (web port of THE FIRST RUN) |
| 0:08 | Walk out into the lawful zone. Real players at the Swap. The pole board shows the SALT LINE. A broadsheet by the pole lists three jobs and today's news. | economy, news |
| 0:12 | Take a job: carry two water drums to a farm 2 km out of town for 60 stamps, or ride the trundle one stop for 8 stamps. Either way: first trip out of the wall. | role jobs, travel |
| 0:18 | Outside the wall, the first danger: a Shambler pair at a dead gas station, or a Sprinter if it is late. The game teaches the noise law (a gunshot pulls them; GENRE §4.2). | infected, heat map |
| 0:22 | An empty motel room or a shotgun shack on the way back. Clear it, shut the door, **plant your flag**: SQUAT. Board one window with planks found inside. | §3.2.1 |
| 0:27 | Dusk. Get inside, bar the door (L3 from the inside), eat, sleep = safe logout or keep playing in the dark. | §3.2.3, survival |
| 0:30 | Toast: YOUR PLACE IS A SQUAT. VISIT EVERY 3 DAYS OR LOSE IT. A DEED COSTS 600 AT THE LAND OFFICE. The hook for the next session. | §3.2.5 |

Rules for the first 30 minutes: no faction raid, no hunter, no siege may target a character under 2 hours of play
(extends `ARRIVAL_GRACE`, WEB_WORLD_MEMORY §3.6); the first death before 2 hours of play keeps the starter pressing
(the vat "presses newcomers twice").

#### 3.3.7 The veteran week (a crew of 4: the player, a friend, 2 AI)
| Real day | Session | What they do |
|---|---|---|
| Mon | 2 h | Pay the ledger. The radio: the Gulf Line is cut at mile 212. They take FLANK PAY on a Houston convoy, ride guard 80 game-miles, beat off a Road Pack ambush. 900 stamps of Houston paper. |
| Tue | 1 h | The Swap at the knot changes Houston paper at a 14% spread (§4.12). Buy a deadbolt and two steel shutters. Weld them on. |
| Wed | 2.5 h | A district two blocks from their deed hits infestation 3. They burn out a nest before it spreads (§3.5.1). The broadsheet names them. Their deputy role ticks up. |
| Thu | 0.5 h | Log in to WHILE YOU WERE GONE: a Dustwolf-style raid on the sealed claim failed (defense 41 vs attack 33). The AI guard is wounded. Feed him, log off. |
| Fri | 3 h | Siege night at their holdout (day 14). Everybody online goes to the wall. 96 infected in 5 waves (§4.11). The friend dies at the gate, comes up in Miami, catches the SALT LINE back, pulls the cord at the request stop by the farm road, and walks in at dawn. |
| Sat | 2 h | The charter election. They vote out a Keyholder who taxed the well. A rival crew claims the cold depot they were scouting. A standoff at the gate, words not bullets (WEB_CONTROLLER gunpoint). |
| Sun | 3 h | A Carousel rumour on STATIC 1660 AM: a sealed station under a dead air base in the panhandle. They drive 2 real hours, find the blast door, and fail the code. Next week's goal. |

### 3.4 TRAVEL AS GAMEPLAY

#### 3.4.1 The modes
| Mode | Speed | Cost | Risk | Notes |
|---|---|---|---|---|
| **On foot** | 4 m/s jog, 6 m/s sprint (stamina) | none | high at night | the brutal baseline; the 6 km rule caps it |
| **The trundle** (bus) | 21 m/s cruise | 6 + 1.1 / mile (WEB_CLONE_TRAVEL §4) | 0.011 / mile, ×1.6 night | real coaches with a guard; poles + request stops |
| **The iron** (freight + passenger cars) | 17 m/s | 4 + 0.8 / mile | 0.02 / trip | stowaways risk the brakeman |
| **FIVE CITY AIR** | a fade; real wait + 1 real minute per game hour aloft | 700–2,200 | 0.06 / flight | the only fast inter-region link; arrivals halls |
| **Hitching** | the driver's speed | 0, or a cut | the driver may be a bandit (§4.13) | stand at a shoulder with a thumb (hold H); traffic and convoys stop by your standing |
| **Your own vehicle** | 25–46 m/s | fuel, wear, keys | being seen | the existing car game; tow policy (§3.3.1) |
| **Ride guard on a convoy** | the convoy's speed | you are **paid** | the convoy is the target | FLANK PAY, §3.4.5 |
| **THE CAROUSEL** | instant | an access key | ring-sickness, throws | bunker-only, rare, §3.4.6 |

#### 3.4.2 Riding on a shard
- **Coaches run in real time on the shard.** A 33-minute trundle ride takes 33 real minutes (4.4 game hours). Nobody can
  fast-forward the shared clock.
- **Riding it out:** sit in a coach seat and press N. You may log off. The coach is a safe logout. When it reaches your
  stop, your character is set down at the pole's lean-to and logged out there safely. Log in later and you stand at the
  pole. EN_ROUTE rolls still happen to an offline rider (one roll a ride, as now). An offline rider can lose scrip to an
  ambush, but never their life (the hp floor at 10, WEB_CLONE_TRAVEL §3.6).
- **Request stops** (the clone lane): a numbered steel sign every ~3 km. On a coach, pull the cord (F) and the coach stops at
  the next one. At a request stop, raise the flag (hold E) and the next coach stops for you if it has a seat.
- **Seats are limited:** 24 per coach. A full coach does not stop at request stops. A busy pole adds a **relief coach** at
  S2 when more than 16 punches are sold for one departure.

#### 3.4.3 Incidents
The EN_ROUTE table (ambush, breakdown, toll, herd, washout, rough air, shakedown) becomes a live event on the shard when a
player is aboard and awake: the ambush is promoted at S0 ahead of the coach, and the passengers fight it (or don't). Two
new rows: **a passenger who isn't** (a planted thief among the NPC riders, a `steal` on a random rider, catchable) and
**the line pays**: a coach that loses its driver or guard puts up a reward for the passenger who gets it to the next knot.

#### 3.4.4 Travel insurance and escorts
- **Line Guarantee:** +15% on the fare. If an ambush takes your scrip on that ride, the line refunds 50% of it at the next
  knot.
- **Escort hire:** at any knot, hire an NPC guard for one trip (20 stamps + 2 per mile) who rides with you and fights by the
  crew lane's doctrine. Or post an escort job on the board for players (§3.6.2).

#### 3.4.5 Convoys and FLANK PAY
- **Trade convoys** run on S2 schedules between holdouts and knots, carrying a ruler's cargo (the economy's caravans, §3.7).
  When a player is within the bubble they are real (`convoy.js`, now with an owning faction).
- **Riding guard:** sign the convoy master's paper at its departure board. Pay: `8 stamps × miles × danger` (danger 1–3, set
  by the region's road heat), paid at arrival. The code: don't loot the cargo, don't leave the convoy, don't shoot first.
  Break it and you lose the pay and 20 standing with the ruler. A player's own car may join (+50% pay; its wear is yours).
- **Raiding a convoy** is the other side: a `rob` on a ruler's goods, standing loss, the bounty board.

#### 3.4.6 THE CAROUSEL on the shard (gap G6, the underground lane)
- **Where:** one sealed station per region at launch, under a military base or a dead fort, "vast and far between": never
  within 40 km of a metro vat.
- **Finding it:** rumours (radio, broadsheets, a dying soldier's papers), a code puzzle, an occupier fight, and the power
  ladder (Godot's `carousel.gd`: power → codes → purge).
- **First light:** the first crew to power a station gets a shard-wide broadcast (THE MACHINE IS AWAKE AT …) and their names
  on its status board for the campaign (a plate, not a nemesis rule).
- **Jumps:** PAIR (between lit stations in different regions), ROULETTE (any lit station on the shard), BACKSPIN (your last
  ring, one stack of ring-sick). **Rigs never jump.** Crew and dogs do. Ring-sickness per WEB_DEATHLANDS_GAP §4.5.
- **Shard rules:** a station can be **held** by a crew or a charter (a CHARTER-tier claim on a Carousel is allowed only as
  a garrison, not a home). Holding it lets you tax jumps (0–50 stamps). Other players can take it back (the station is
  always a free-fire hot zone).

### 3.5 FACTIONS AND WORLD EVENTS

#### 3.5.1 What is going on in the world at any moment
The world service keeps a **world board**: the list of live events in every region, each a row with a state, a place, a
clock and the factions involved. A launched region should always hold **3–6 live events** (§4.14).

| Event | Frequency (per region) | Clock | How players change it |
|---|---|---|---|
| **Faction war** (FEUD MATH) | 1 live, flips every 2–4 real days | daily skirmishes at S3 (`factionsim.js`) | jobs for a side move its strength; supply runs; killing a field captain (successor list only, the patent rule) |
| **Siege of a holdout** | when a raid's points beat a holdout's defense (§4.7) | 6 game h warning (45 real min), then waves | defend the wall, run in ammo, or not (ANSWERED OR NOT) |
| **A district falls** (overrun, GENRE §4.2 layer C) | spread rolled every game dawn | level 0–5 | burn nests (800 HP), kill a hive (4,000 HP), garrison it |
| **Plague heart / hive** | a seed event every 5–8 game days in a level-4 district | while it stands | the hive fight; each kill makes the next stronger (GENRE §4.2) |
| **Siege night** | every 14 game days (≈ 42 real hours) | known from day 10 | §4.11 |
| **Convoys** | 6–12 a game day per region | their routes | ride guard, raid, or ignore |
| **Herd migration** | when a region cell passes 300 infected | 1–2 km/h along roads | lure, funnel, dodge (THE PULL) |
| **Elections and coups** | an election every 2 real weeks per charter and per AI holdout with a council; a coup roll when a Keyholder's standing with their own people < −40 | 3 game days of campaign | vote (deed holders), back a candidate with jobs, assassinate (a successor takes over) |
| **The cordon** (bible THE CORDON) | Remnant lines move weekly | per real week | detour, bribe, run it |
| **A Carousel discovery** | a rumour seeded per region per season | until lit | §3.4.6 |
| **Weather fronts** | 1–3 a game day | 2–12 game h | dust kills sight, rain kills grip, heat cooks engines |
| **Shortage** | when a ruler's store of a good < 20% (§3.7.3) | until resupplied | price spikes, a supply job pays ×2 |

#### 3.5.2 Escalation and calm
A **world director** at S4 keeps each region between a floor and a ceiling: at least one threat and one opportunity live,
never two sieges in one region at once, never a new siege within 6 game hours of the last ended one, and never anything
that targets a character under 2 hours of play.

#### 3.5.3 How players learn it
| Channel | What it carries | Built by |
|---|---|---|
| **The radio** | STATIC 1660 AM's morning digest (already shipped) becomes **per region** (one station each, our call signs), plus music stations and pirate frequencies; siege warnings; the obituary; THE WIRE (shard news) at the top of every game hour | faction audio + music/radio lane |
| **The broadsheet** | one page a game dawn per holdout (8 a real day), tacked by every pole and Swap: headlines from the world board, the chronicle's legend lines, prices, jobs, bounties, elections, classifieds players post (5 stamps, 120 characters, ip-linted and moderated) | world events lane (new) |
| **NPC talk** | the strangers' three live topics (shipped) now read the world board; named people mention events near them | dialogue lane |
| **The LLM layer** | free local dialogue (the Mac Mini's `qwen3.5`, or the shard box) given a **fact sheet** (§4.10): it may only say what the world board, the chronicle and the NPC's own memory hold. Cite-or-silence: no fact sheet line, no claim | LLM lane |
| **The map** | the WORLD tab: event pins, district tints by infestation, convoy lines you have heard of, the cordon | QoL lane |
| **Word of mouth** | real players. The street board, radio frequencies, the Swap | §3.6 |

Players learn only what reached them. A siege in another region is radio news a game hour later, not a map pin.

#### 3.5.4 How players change it
Every player verb that can move the world already exists as a deed (WEB_WORLD_MEMORY §3.1) or a job (WEB_ROLES). On the
shard, those deeds also feed **faction strength and stores** (S3), not just standing. The chain is: deed → standing and
strength → war outcome → territory → laws, prices and who holds the road. The chronicle records it. The broadsheet prints
it. YOUR HAND IN THE TAKEOVER (bible §3.4) fires when a player's jobs flipped a territory.

### 3.6 MULTIPLAYER SOCIAL

#### 3.6.1 Crews
- **A crew is up to 6 bodies:** humans and AI together (Robert: 1–6, starting solo). A human crew of 6 has no AI. The crew
  has a **leader**, a **crew ledger** (shared scrip, with per-member limits) and a **crew strongbox** at its homestead.
- **AI crew** follow the crew lane's rules (trust, orders, jobs). A player can **lend** an AI crew member to another player
  (GENRE §6). Loyalty stays with the owner.
- **A band** is an alliance of up to 4 crews (24 bodies). It shares a radio frequency and a map layer. Nothing bigger is
  allowed (GENRE §6 zerg cap). Siege hordes scale per player (§4.11), so a band pulls a big horde.

#### 3.6.2 Trading, boards and bounties
- **Hand to hand:** the trade window (both sides put things in, both confirm, then a 3 s lock before it lands; any change
  resets the lock).
- **The Swap's consignment board:** list an item at a price, the Swap holds it, takes a 5% cut. Lawful-zone only.
- **The job board** at every knot: post a job for players (escort, delivery, a hunt, a husk run for someone else) with the
  pay held in escrow by the board.
- **Bounties:** posted at a jail's board, only on a **marked** player (§3.6.3), paid from escrow, minimum 100 stamps. A
  bounty pays once, on a kill witnessed by the system (the server knows). A self-arranged bounty (a friend kills you for
  your own bounty) is blocked: no payout to crew or band members, or to an account that traded with the target in the last
  real day.

#### 3.6.3 PvP rules by zone, and the murderer mark
| Zone | Where | PvP damage | Law |
|---|---|---|---|
| **LAWFUL** | inside metro vats' walls, every AI holdout's wall, bus poles and coaches, knots, the Swap | **off**, except an accepted duel (F6 duel, from the Godot co-op) | stealing and breaking in still exist and are crimes; bulls respond |
| **PATROLLED** | interstates and the roads within 200 m of them in a ruler's held territory | on | every unprovoked hit on a non-criminal is **assault**; a kill is a **murder** count; patrol cars respond in 2–4 min |
| **WASTES** | everywhere else | on | murder counts still apply; nobody comes |
| **HOT** | districts at infestation ≥ 4, military bases, Carousel stations, the cordon | on | **free-fire**: no counts, no marks |

- **Grey (criminal):** stealing, burglary, looting another's husk, attacking a non-criminal. Grey lasts 3 real minutes.
  Anyone may attack a grey player without becoming grey.
- **Murder counts:** each unprovoked kill of a non-grey, non-red player outside HOT zones adds 1 count. Counts decay by 1 per
  **8 hours of online play** (play time, not wall time; the Ultima lesson that logging off does not clean you).
- **Red (murderer):** at 5 counts. A red name plate (red is a rust red, never a purple-adjacent hue), the lawful zones'
  bulls shoot on sight, the metro vats refuse a red's policy. A red comes up at a **black-market vat** (one per region, in a
  hot zone, 2× price). A bounty board posts them automatically.
- **Faction law is separate:** a player's standing with rulers still moves by deeds and witnesses (WEB_WORLD_MEMORY), so a
  murderer the system cannot see (unwitnessed, in the wastes) still gets a count but not a witnessed standing hit.

#### 3.6.4 Griefing defenses
- The green plate (72 h). Lawful zones around every come-up point. No PvP on coaches and at poles.
- **Husk grace:** your husk is yours alone for 5 real minutes.
- **No blocking:** player barricades, wrecks and traps cannot be placed within 6 m of a road centreline, a public door, a
  pole or a vat (the server refuses the placement). A charter's wall may cross a road only with a gate.
- **No camping the vat:** a vat's come-up hall is lawful, and the first 60 s after coming up give spawn protection even
  against AI.
- **Vehicle theft** needs a key or a hotwire (Mechanics 40, 30 s, loud, GENRE §6 rule 3). A stolen car is a `steal` deed.
- **Chat:** mute, block, report. A report snapshot attaches the last 60 s of the event log for the moderator.
- **Name law:** character names pass `randomName`'s famous-pair rule and the ip-lint deny list, and a slur list.

#### 3.6.5 Communication
| Channel | Range | Needs |
|---|---|---|
| Proximity text (bubbles over heads) | talk 20 m, shout 50 m (shouting is noise: heat 5, GENRE §4.2) | nothing |
| Proximity voice (WebRTC through an SFU on the shard box) | 25 m falloff, muffled through walls | opt-in setting; M8 |
| Handheld radio | 2 km, one of 40 frequencies | a radio item and batteries |
| Base radio room | 15 km, receives everything in range | the facility (GENRE §3.2) + power 2 |
| A broadcast tower | the whole region | capturing a tower site (a hot zone). A player-run station can play music and talk on its own frequency |
| Crew / band channel | anywhere | at least one radio per member; without one, crew news waits for camp |
| The broadsheet classifieds | the holdout | 5 stamps |

There is **no global chat.** Anything shard-wide goes over THE WIRE (system news) or a captured tower.

#### 3.6.6 The pause-menu tabs this plan needs (the QoL lane's tab shell)
WORLD (the world board as you know it), HOME (claims, ledgers, keys, WHILE YOU WERE GONE), LEDGER (brine book, policy,
scrip by ruler, bounties on you), LAW (your counts, grey time, which zone you stand in), CREW (the crew lane's panel).

### 3.7 ECONOMY

#### 3.7.1 Scrip per ruler (FIFTY PAPERS)
- Every AI ruler and every HOLDOUT-tier charter prints its own scrip. Units: 1 brick = 100 stamps (bible F7).
- **Money supply** is tracked per issuer at S3. A ruler prints to pay its wages and jobs (the faucet) and takes scrip back
  through tolls, rents, Swap cuts and its traders (the sink). A ruler whose supply grows faster than its stores sees its
  paper's **trust** fall, and the spread on it rises everywhere (§4.12).
- **Brine scrip:** the vats' own book is kept in **vat marks**, which every vat accepts at par. Any scrip can be paid into
  the brine book at the local spread. That makes the brine book the shard's one hard currency, and it is how a player
  carries value between regions without the Swap's cut.
- A charter's scrip is backed by its stores. If its stores fall below 25% of its paper in circulation, its paper's spread
  doubles.

#### 3.7.2 Prices (Miami stamps, the reference; other issuers × their exchange)
| Good | Price | Note |
|---|---|---|
| Water, 1 L clean | 2 | the floor good |
| A meal (cooked) | 4 | raw food 2 |
| Fuel, 1 L | 2 | siphoned fuel is free; distilled 1.5 to make |
| Pistol round | 1 | rifle 2, shell 3 |
| Bandage | 6 | antibiotics 40 |
| Lockpick | 8 | L1 lock 30, deadbolt 90, steel door 400 |
| Trundle, 10 miles | 17 | 6 + 1.1 × 10 |
| A used pistol | 80–160 | by condition |
| A used car | 900–4,000 | the LAWMAN 3,500 |
| A pressing (Miami) | 400 | §4.8 |
| A deed, small house | 600–1,200 | §4.6 |
| A night in a rented cot | 6 | safe logout |

#### 3.7.3 Production chains (what the world makes, and what players can make)
| Chain | Inputs → output | Who runs it |
|---|---|---|
| Water | rain barrel / well / river + purifier → clean litres | holdouts; crew Water job |
| Food | seeds + water + 14–28 game days → crops; hunting and fishing (wilds lane) → meat, fish; raw → cooked at a kitchen | farms, crew Cook/Farmer, players |
| Fuel | siphon wrecks (finite per district, refills on the loot clock) / crops + still → biodiesel | refineries (contested sites), crew Chemist |
| Ammo | brass + powder + lead → rounds at a gunsmith bench | Ike-type traders, crew Gunsmith |
| Meds | chemicals + alcohol → meds | clinics, crew Chemist |
| Parts | wrecks → parts (Towing/Salvage); scrap → plates, rams, spikes | junkyards, crew Mechanic/Fabricator |
| Power | generator (fuel, loud) / solar (quiet) | bases and holdouts |

A ruler's **stores** of each good rise with production and fall with consumption at S3. Shortages (§3.5.1) come from the
numbers, never from a script.

#### 3.7.4 Faucets and sinks per active player per game day (targets; §4.9 shows the arithmetic)
| Faucet | Stamps / game day |
|---|---|
| Jobs (role jobs, FREIGHT PAPER, FLANK PAY, board jobs) | 180 |
| Selling loot and salvage to traders (capped per trader per game day) | 140 |
| Bounties, convoy shares, events | 30 |
| **Total in** | **350** |

| Sink | Stamps / game day |
|---|---|
| Food and water (3 meals, 3 L) | 18 |
| Fuel (40 game-miles of driving) | 16 |
| Ammo (30 rounds) | 40 |
| Repairs and parts wear | 30 |
| Fares | 15 |
| Rent or deed tax (per real day ÷ 8 game days, then × the sessions) | 10 |
| Brine premium | 20 |
| Deaths (one pressing every 3 game days at 400) | 133 |
| Swap cuts, spreads, tolls | 25 |
| **Total out** | **307** |

Net **+43 stamps per active game day** (12% of income): about 2 real weeks of play to save a used car. The target band is
+5% to +20%. Outside it, the economy lane turns the knobs in §7.

---

## 4. Formulas

### 4.1 The shard clock
`g = 8` (game seconds per real second). Game hours per real second `= g / 3600 = 1/450`. One game day `= 24 · 3600 / g =
10,800 s = 3 real hours`. Night length `= 9 game h · 450 s = 4,050 s = 67.5 real minutes`.
- Range: `g` 4–16 (§7). Offline keeps `1/30` game h per real s (`g = 120`).
- **Needs drain** is per game hour in the survival rows. Those rows stay as they are: at `g = 8` a character needs about
  three meals a game day, which is **one meal per real hour of play** (offline it is one per 4 real minutes, 15× faster,
  because offline `g = 120`). Only the rows tuned per *real* second (stamina, bleeding) stay on real time. Acceptance
  §8.2 item 3.
- **Example:** the SUN LINE's 42 km takes `42,068 / 21 = 2,003 s` = 33.4 real minutes = `2,003 / 450 = 4.45` game hours on
  the shard (66.8 game hours offline: the offline game's timetable is why WEB_CLONE_TRAVEL's numbers look so long).

### 4.2 Coach frequency and the longest wait
`wait_max = every_game_h · 3600 / g` real seconds. SUN LINE every 8 game hours: `8 · 450 = 3,600 s` = **60 real minutes**.
- Range: `every` 2–8 game h on the shard → 15–60 real minutes.
- **Example:** a line with `every = 4` waits at most 30 real minutes. Rule §3.3.3 caps every launched line at `every ≤ 8`.

### 4.3 Seam handover
An entity at `x` belongs to region A while `x < seam_mid`, to B after `x ≥ seam_mid + h`, and keeps its owner inside the
hysteresis band `h = 32 m` (the streamer's centre-chunk rule). Both processes hold the LAYOUT for `seam_mid ± 256 m`.
Handover cost: one record message (≤ 2 KB for a car with its trunk), target ≤ 50 ms with no visible hitch.

### 4.4 Persistence sizing
`log_bytes_per_h = CCU · verbs_per_player_h · bytes_per_verb`. With 250 CCU, 200 verbs/h, 120 bytes: **6 MB per real
hour**, 144 MB a day, ~1 GB over 7 days of log. Snapshot per region: characters `2,500 · 64 KB = 160 MB` (worst case, at
the 256 KB cap far fewer), claims and containers `9,000 · 4 KB = 36 MB`, districts and factions under 5 MB → under
**250 MB** for the whole shard. 48 snapshots ≈ 12 GB on disk (well inside a 200 GB NVMe).

### 4.5 Off-screen fights at S2/S3
For two sides with strength `A` and `B` (Σ of members' combat power: `hp · dps · cover_mult`), the winner is A with
`p = A^1.5 / (A^1.5 + B^1.5)`; the loser loses `30–60%` of its strength, the winner `10 · B/A %` (capped 40%).
- **Example:** a Road Pack of strength 120 hits a convoy guard of 90: `p = 1,315 / (1,315 + 854) = 0.61`. If the pack wins,
  the convoy loses 45% and its cargo; the pack loses `10 · 0.75 = 7.5%`.
- The roll is seeded by `(event id, game hour)`, so replay is exact.

### 4.6 Deed price and tax
`assessed = clamp(base[kind] · floor_m2 · locMul, min[kind], max[kind])`, where `floor_m2` = footprint × storeys (every
floor counts), `base` per m² of floor: house 3.0, shop 4.0, warehouse 1.0, farmstead 1.5, compound 2.0; `locMul` 1.5
inside a holdout's wall, 1.0 in a city, 0.6 in the wastes, 0.4 next to a district at infestation ≥ 4.
Clamps (rows): house 600–1,200; shop 800–2,000; warehouse 800–3,000; farmstead 500–1,500; compound 2,500–8,000.
`tax_per_real_day = max(4, round(0.008 · assessed))`. Filing a squat = `round(0.10 · assessed)`.
- **Example:** a 2-storey house in Hialeah (a city) with a 110 m² footprint: `floor = 220`, `3.0 · 220 · 1.0 = 660`
  (inside the 600–1,200 clamp) → **660 stamps**. Tax `round(5.28) = 5 stamps per real day`. Filing it as a squat: 66.
- A 900 m² single-storey warehouse inside a wall: `1.0 · 900 · 1.5 = 1,350` → tax `round(10.8) = 11` per real day.
- The same house in the wastes: `3.0 · 220 · 0.6 = 396` → clamped up to **600**, tax 5. Land is cheap out there; the
  danger is the price.

### 4.7 Raid points vs defense score (sealed or warm claims, and holdouts)
`raid = (3 + wealth/200 + fame/20) · doctrine_mult`, clamped `≤ 1.4 · last_raid` (GENRE §3.5, Rimworld lesson). `wealth` =
the claim's stored value in stamps; `fame` = the owner's Known axis.
`defense = Σ barrier_hp / 100 + Σ guard (combat_skill/10 · weapon_mult) + traps_value / 50 + crew_dogs · 3`, ×0.5 for
anything left open.
Outcome: `p_hold = defense^1.5 / (defense^1.5 + (w · raid)^1.5)`, `w` = `raid.raiderWeight` = 2 (each raider is worth two
points of defense). Lost: take `min(0.25 · unlocked_value, raid · 40)` stamps of goods, best first, never the strongbox.
- `raid` range 3–60 (clamped by the 1.4× rule); `defense` range 0–150 for a homestead.
- **Example:** a claim holding 3,000 stamps of goods, all unlocked, owner fame 20, a Road Pack (×1.0):
  `raid = 3 + 3,000/200 + 20/20 = 3 + 15 + 1 = 19`, so the attack term is `2 · 19 = 38`.
  Defense: a deadbolted door (150 + 350 = 500 HP), 2 steel shutters (1,600), 6 boards (600) → `2,700 / 100 = 27`; one guard
  (skill 40, rifle ×1.2) → `4.8`; traps worth 200 → `4`; one dog → `3`. **Defense 38.8.**
  `p_hold = 38.8^1.5 / (38.8^1.5 + 38^1.5) = 241.7 / (241.7 + 234.2) = 0.51`.
  On a loss: `min(0.25 · 3,000, 19 · 40) = min(750, 760) = 750` stamps of goods.
  A second guard (+4.8 → 43.6): `287.9 / (287.9 + 234.2) = 0.55`. Moving 2,000 stamps of it into the strongbox and a
  locked chest instead cuts the worst loss to 250.

### 4.8 Pressing, premium and the city
`pressing = 400 · cityMul`: Miami 1.0, Houston 0.9, LA 1.25, Chicago 1.4, New York 1.6; local brine rooms `0.6 · 400 =
240`; black-market vat `2 · 400 · cityMul_nearest`.
`premium = 20 · active_days + 5 · dormant_real_days`.
- `active_days` = distinct game days with at least one login. A 2.5-hour session touches 1–2 game days (a game day is
  3 real hours).
- **Example:** a week of 4 evening sessions of 2.5 h touching 6 distinct game days, and 3 real days away:
  `20 · 6 + 5 · 3 = 135 stamps`, with a Houston policy the pressing itself is `400 · 0.9 = 360`.

### 4.9 Crew output while you are offline
`output = base · (0.5 + skill/100) · morale_mod · tool_mod · facility_mod · 0.5` (GENRE §2, halved offline), capped at
`72 real hours` of output (storage-limited) so an absent player is not an AFK farm.
- **Example:** a cook (skill 50, morale 0, basic kitchen) makes 4 meals per 8 game h online; offline `4 · 1.0 · 0.5 = 2`
  per 8 game h = 6 a game day = 48 a real day, inputs permitting (3 raw each 8 game h).

### 4.10 The LLM fact sheet
`facts(npc) = top_k(world_board ∪ chronicle(region, last 3 game days) ∪ npc.memory, score)`, `score = relevance ·
0.5^(age_h / 12) · (near ? 2 : 1)`, `k = 12`, ≤ 1,200 tokens. The model is told: answer only from these lines; if asked about
anything else, say you have not heard. A line it uses is logged with the reply (cite-or-silence, auditable).
Budget: `qwen3.5` at 16.5 tok/s → a 60-token reply in ~3.6 s; the voice lane hides it behind a canned opener ("Huh. Let me
think.") and caches answers per (npc, fact set) for 1 game hour.

### 4.11 Siege night size on the shard
`size = (20 + 6 · week_index + 0.4 · wealth/100 + 8 · crew_count) · diff`, per player online within 300 m, additive at
`0.75` per extra player (GENRE §4.2), `week_index` = siege count this campaign (1–24), `diff` 0.7/1.0/1.4.
- **Example:** siege 4, a holdout with 3 players (crews of 4, 4, 2 = 10 bodies) and wealth 3,000, diff 1.0: player 1:
  `20 + 24 + 12 + 32 = 88`; the next two at 0.75 each: `88 + 66 + 66 = 220` infected in 3–6 waves.

### 4.12 The spread on bad paper
`spread = clamp(0.05 + 0.04 · hops + 0.25 · (1 − trust) − 0.002 · standing, 0, 0.5)`, `hops` = border crossings from
the issuer's territory, `trust` ∈ [0, 1] (stores ÷ paper in circulation, capped 1), `standing` with the Swap's ruler.
- **Example:** Houston paper at Miami's Swap: 3 hops, trust 0.8, standing 25: `0.05 + 0.12 + 0.05 − 0.05 = 0.17` → 900
  Houston stamps fetch `900 · 0.83 = 747` Miami stamps. Paid into the brine book instead: the vat's spread is fixed at 0.08
  → 828 vat marks.

### 4.13 Hitching
`p_stop = clamp(0.15 + 0.004 · reading(driver_faction) + (night ? −0.1 : 0) + (armed_openly ? −0.1 : 0), 0.02, 0.8)` per
passing vehicle; the driver is a bandit with `p_bad = 0.05 + 0.1 · road_heat`.
- **Example:** noon, a drifter driver, reading +20, gun holstered: `0.15 + 0.08 = 0.23` a car. Ten cars an hour on I-95 →
  `1 − 0.77^10 = 93%` to get a ride within a game hour.

### 4.14 Event count per region
The world director keeps `live_events ∈ [3, 6]`; below 3 it seeds from the region's table weighted by
`w = base · season_mul · (1 + 0.2 · players_in_region / 20)`.

### 4.15 Murder count decay
`counts(t) = counts_0 − floor(play_hours / 8)`. Red at ≥ 5. **Example:** 6 counts, playing 2 h a night: red until 8 play
hours pass (4 nights), clean at 48 play hours (24 nights).

---

## 5. Edge Cases

- **A player logs off in the open with a horde 50 m away:** the body lingers 60 s and can die; if it dies, it is a death
  like any other (husk, come-up on next login).
- **The owner is online in another region:** the claim is cold. Warm needs an owner **in that region** (§3.2.6).
- **A co-owner is a griefer who empties the house:** co-owners can take from containers, but every take is logged; the owner
  can revoke a key, and the strongbox is owner-only.
- **Two characters on one account own claims:** the homestead limit is per account (1 deed); each character may squat 2 and
  rent 1.
- **A deed inside a district that goes to infestation 5:** the claim stands, but a hive's 300 m radius makes it unusable
  ("A HIVE HOLDS THIS STREET"): no crew jobs, no safe logout, no tax until the hive falls.
- **A charter's Keyholder quits the game:** after 7 real days absent the deed holders' vote opens automatically.
- **A player dies on a coach while riding it out offline:** cannot happen; offline riders' hp floors at 10. Online riders can
  die (as WEB_CLONE_TRAVEL §5).
- **A coach is destroyed with offline riders aboard:** they are set down at the nearest request stop, safe-logged, with a
  toast on login (THE COACH WENT DOWN AT MILE 212).
- **A region crashes mid-raid:** the raid restarts from the last snapshot's state; the event log's partial raid verbs are
  replayed; any loot moved stays moved.
- **The world service is down but regions are up:** regions keep running S0–S3; inter-region travel queues at the knot
  ("THE WIRE IS DOWN: NO FLIGHTS") until it returns.
- **Daylight saving and time zones:** the shard clock is server UTC; restart time is 05:00 in the shard's home zone (☐).
- **A bounty target joins the hunter's band:** payouts to band members are blocked (§3.6.2).
- **A player places a trap on a road:** the server refuses it within 6 m of a centreline; beyond that on a public plot it is
  a `trap` deed (grey) when armed.
- **A husk inside a sealed claim** (died at home in a raid): the husk stays inside; it is lootable only by key holders.
- **A player's policy city's region is down for a restart:** they come up when it is back, held in the fade (max 4 minutes);
  if longer than 10 minutes, the nearest up metro takes them (one-time free change).
- **Brine book in a scrip that collapses:** the brine book is in vat marks, so it cannot collapse. Pocket scrip can.
- **Hitching with a red player:** NPC drivers refuse reds (`p_stop = 0.02`).
- **A charter declares a House Rule that bans a whole flag (nationality):** refused. House Rules come from the table only,
  and no row targets an origin.
- **Overrun city with a vat inside** (Houston's east side falls): vats are walled lawful zones and never fall below level 2;
  the director treats a vat's district as a garrison (half-chance spread, GENRE §4.2).
- **A player stands on a request stop with the flag raised and the coach is full:** the board shows the next departure; the
  toast says COACH FULL.
- **An economy exploit** (a trader's buy cap is bypassed by many alts): sell caps are per trader per **account** per game
  day, and alts are tracked by IP and payment fingerprint for moderation.
- **Data change on restart removes a building someone deeded:** the validator refuses the forge push; if forced, the deed
  converts to a plot deed on the same lot and the contents go to left luggage.
- **The campaign wipe while a player is mid-run:** the Long Night ends with a fade; legacy is granted from the last state.

---

## 6. Dependencies (both ways; each doc gains a back-reference to this plan when its lane lands)

| This plan needs | From | That doc must note |
|---|---|---|
| Server authority, wire, accounts | `WEB_SHARD.md` §3.9 | this plan's M1–M4 are its roadmap steps 1–4 |
| Tiers, chunks, K, LAYOUT purity, save v2 | `WEB_STREAMING.md` §3.2, §3.7, §3.9 | its Full/Ghost/Abstract become S0/S1/S2; weather becomes regional on the shard |
| Policies, husks, lines, request stops, EN_ROUTE | `WEB_CLONE_TRAVEL.md` | shard numbers (§3.3.1, §3.4.2), the five metro vats, riding it out |
| Deeds, witnesses, factions, chronicle, director, faction sim | `WEB_WORLD_MEMORY.md` | the chronicle per region; faction strength fed by deeds; the world director (§3.5.2) |
| Roles and role jobs | `WEB_ROLES.md` | role jobs pay into the economy's faucet (§3.7.4) |
| Crew, trust, orders, jobs, doctrines | `WEB_DEATHLANDS_GAP.md` G3; `GENRE_DEPTH.md` §2, §5 | offline defense and offline output (§3.2.6, §4.9) |
| Storeys, holdouts, the Carousel, breadth | `WEB_DEATHLANDS_GAP.md` G4, G6, G7, G8 | claimable stock, charters, Carousel shard rules |
| Sites and city archetypes | `WEB_LOCATION_BIBLE.md` | claimable flags per site kind; vats, bases and stations never claimable |
| The 23 settled calls | `WEB_WORLD_EDITOR_PLAN.md` §1.1 | data changes land on restart (already there) |
| Names | `WEB_FAN_SERVICE_BIBLE.md` | the new words in §3 (homestead, strongbox, request stop, vat marks, the broadsheet, THE WIRE, the Long Night) go in §3.3's table after a lint pass |
| Base, horde and MP numbers | `GENRE_DEPTH.md` §3, §4, §6 | adapted to real days (§3.2.5) and per-player sieges (§4.11) |
| Trade counters | `WEB_TRADE.md` | per-account sell caps; prices read the issuer's scrip |
| Survival drains | `WEB_SURVIVAL.md` | a shard drain set (§4.1) |
| Look and night | `WEB_LOOK.md` | night is 67.5 real minutes on the shard |

**Who depends on this plan:** every lane in §1.1 reads §3 for its shard behaviour; the new lanes in §8 are defined here;
`WEB_SHARD.md` should point here as its master roadmap.

---

## 7. Tuning Knobs

| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `shard.clock` (g) | 8 | 4–16 | how long a day is (1.5–6 real h); travel in game hours; needs per real hour |
| `shard.ccuCap` | 300 | 100–500 | queue; per-region load |
| `region.maxPlayers` | 80 | 40–120 | tick budget (S0 bubbles × 1.5 ms) |
| `sim.liveR` (S0 radius) | 250 m | 180–350 | how far the full sim reaches; CPU |
| `sim.nearR` (S1) | 3.5 km | 2–5 km | ghost cost |
| `persist.snapshotMin` | 10 real min | 5–30 | crash recovery time vs disk |
| `persist.logDays` | 7 | 3–30 | rollback reach |
| `restart.hour` | 05:00 | any | who it inconveniences |
| `campaign.weeks` | 12 | 8–16 | how long a world lasts |
| `season.weeks` | 3 | 2–4 | weather and crop pace |
| `squat.lapseH` | 72 real h | 24–168 | how fast unattended squats free up |
| `claim.warmMin` | 30 real min | 0–60 | how long after logout you can be raided |
| `claim.sealedSiegeMul` | 0.5 | 0.25–1 | how hard AI hits offline homes |
| `claim.offlineLossCap` | 0.25 | 0.1–0.5 | worst offline loss |
| `raid.raiderWeight` | 2 | 1.5–3 | offline raid odds (§4.7) |
| `deed.taxRate` | 0.008 / real day | 0.003–0.02 | the land sink |
| `deed.lienDays` / `foreclose` | 3 / 10 real days | 2–7 / 7–21 | how forgiving the land office is |
| `deed.noVisitDays` | 21 | 14–45 | freeing land from quit players |
| `husk.keepRealH` | 48 | 24–96 | how long a husk run may take |
| `husk.playerGraceMin` | 5 | 0–15 | protection from husk vultures |
| `travel.maxWalkKm` | 6 | 3–10 | request stop spacing (the brutal walk) |
| `line.everyGameH` | ≤ 8 | 2–8 | longest coach wait (15–60 real min) |
| `dole.perRealDay` | 1 | 0–3 | the safety net |
| `charity.pressingDays` | 7 real | 3–30 | how often a broke player is saved |
| `greenPlate.playH` | 72 | 24–120 | new-player protection |
| `murder.redAt` / `decayPlayH` | 5 / 8 | 3–10 / 4–24 | how fast murderers are marked and forgiven |
| `grey.min` | 3 | 1–10 | how long a thief is fair game |
| `siege.everyGameDays` | 14 | 7–21 | 4 sieges per real week per region at 14 (8 at 7, 2.7 at 21) |
| `events.liveMin/Max` | 3 / 6 | 1–4 / 4–10 | how busy a region feels |
| `economy.netTarget` | +12% | +5% to +20% | saving speed |
| `trader.sellCapPerDay` | 400 stamps / account | 150–1,000 | the loot faucet |
| `spread.base/perHop/cap` | 0.05 / 0.04 / 0.5 | 0–0.1 / 0.02–0.08 / 0.3–0.7 | cost of carrying value between rulers |
| `vat.markSpread` | 0.08 | 0.03–0.15 | how hard the brine book is |
| `crew.offlineMul` / `capH` | 0.5 / 72 | 0–1 / 24–168 | AFK farming |
| `band.maxCrews` | 4 | 2–6 | zerg cap |
| `llm.factK` / `tokens` | 12 / 1,200 | 6–24 / 600–2,500 | grounding vs latency |

---

## 8. Acceptance Criteria (and the roadmap)

### 8.1 The roadmap, M1 to M8
Each milestone ends with a **soak**: the shard runs 72 real hours unattended with bots (`tools/shard-test.mjs` grown into a
bot swarm) and the exit criteria hold.

| M | Name | What lands | Exit criteria | Delivered by |
|---|---|---|---|---|
| **M1** | **Honest Two** (shard v0.1) | TLS (`wss://`) + CSP; plausibility checks on saves (cash and items change only through known verbs); husks and husk looting on the shard; claims v2 (squat + key ring); proximity text chat; the camera/aim and QoL tab shells merged; G10 housekeeping done | two strangers on two machines on the LAN play 2 h; a forged save that adds 1,000 stamps is refused; a husk dropped on page A is lootable on page B | shard team (new lane **NETCODE & HARDENING**), camera lane, QoL lane |
| **M2** | **The World Clock** | a Node **world service** that runs S2–S4 without any page: the shard clock at 8×, coach and train schedules, faction sim, prices, weather fronts, seasons, district infestation and spread, the world board; pages read it | with zero pages connected for 24 real hours, the world board shows ≥ 3 live events per region, 8 dawns passed, a district changed level, coaches are where `position(t)` says; on connect, the page shows it | **WORLD CLOCK** (new), faction AI lane (factionsim), cities/overrun lane (infestation rules) |
| **M3** | **Sim-Core Split** | ai, combat, vehicles, inventory, interiors, materials, deeds, survival, clone, travel, zombies, fauna, dogs split into a pure `sim/` half that runs in Node 22 without three.js; determinism tests (same inputs → same hash) | `node tools/sim-headless.mjs region=fl seconds=600` runs Meridian with 160 characters at ≥ 60 ticks/s on one core; offline selftest still green twice; the page and the headless sim agree on a 60 s replay hash | **SIM-CORE** (new, the biggest), every system owner reviews its split |
| **M4** | **One Region, Server-True** | region processes for FL and SW; inputs up, state down; client prediction for the player and car; 100 ms interpolation; server hit validation with ≤ 200 ms rewind; SQLite snapshot + event log; seams (FL/SW are not adjacent: the seam test runs on a split FL); the five-metro policy rule with Miami live | 40 bots + 2 humans in FL for 72 h; no desync over 0.5 m for the player; a kill on a laggy client (150 ms) validates; a `kill -9` of the region loses ≤ 1 s of verbs; restart and catch-up work | NETCODE, **PERSISTENCE** (new), clone lane (policies, metro vats) |
| **M5** | **Living Somewhere** | the claim ladder (squat, rent, deed), locks and window tiers, barricades, the strongbox and vat locker, upkeep and liens, cold/warm sealing, offline raids by the formula, WHILE YOU WERE GONE, AI crew guarding and working offline, neighbourhoods | §8.2 items 1–8 | **HOMESTEAD** (new), security lane (lock/trap rows), crew lane (guard + jobs offline) |
| **M6** | **Something Is Always Going On** | the world director, siege nights on the shard, events table §3.5.1, regional radio + THE WIRE, the broadsheet, LLM fact sheets, elections and coups, PvP zones + grey/red + bounties (PvP damage **on**), convoys with FLANK PAY, hitching | §8.2 items 9–16 | **WORLD EVENTS & NEWS** (new), **LAW & SOCIAL** (new), faction audio/LLM/radio lane, cities/overrun lane |
| **M7** | **Many Regions, One Country** | CA, GULF, MW, NE regions with LA, Houston, Chicago, New York vats; inter-region lines and FIVE CITY AIR (with Miami); the first Carousel stations (one per region) with PAIR/ROULETTE/BACKSPIN; charters to HOLDOUT tier with their own scrip; the full economy with spreads and vat marks | a character dies in Chicago, comes up in Miami (their policy), and gets back by air + coach + request stop + a hitch within 90 real minutes; a ROULETTE jump lands a crew in another region and their rig stays; scrip from 4 issuers trades at §4.12's spreads ± 1% | cities lane (metros), clone/bus lane (inter-region lines), underground/bunker lane (stations), **ECONOMY** (new) |
| **M8** | **The Public Shard** | the cloud box, monitoring and logs to LogNog, backups off-box nightly, an admin console (kick, ban, rollback a character from the log, broadcast), account recovery by email, moderation tools (reports with log snapshots), proximity voice, a load test at 300 CCU, the onboarding script (§3.3.6) tuned with 10 cold testers, the campaign/legacy machinery, the Long Road shard | §8.2 items 17–22; 300 bot CCU for 6 h with tick p99 < 33 ms; 10 new players finish the first 30 minutes without help, 8/10 log in again within 3 days | **LIVE OPS** (new), **FIRST HOUR** (new), every lane's polish |

### 8.2 Testable acceptance criteria
1. **Squat:** a character clears a building (no hostile within 30 m), holds E on its door 10 s → the shard has a `squat`
   claim row; 72 real hours with no visit (clock-faked in the test) → the row is gone.
2. **Deed:** filing a held squat charges exactly `0.10 · assessed` (§4.6 table) and the door plate reads DEED; the tax comes
   off the house ledger once per real day; 3 short days → LIEN; 10 → FORECLOSED and a ghost house; the strongbox moves to
   left luggage intact.
3. **Survival on the shard:** with the shard drain set, a character who eats once per real hour of play never drops below
   Hungry level 1 over a 3-hour session.
4. **Locks:** each tier in §3.2.3 takes its listed time ± 10% to pick or break with the listed tool, in a scripted test.
5. **Sealed:** 31 real minutes after the last owner logs off, a second player's 10 shotgun breaches on the claim's door do 0
   damage; at 29 minutes they do full damage and record a `burglary` deed (grey on the attacker).
6. **Offline raid:** the §4.7 example claim (defense 38.8, raid 19, weight 2) holds in 50% ± 3% of 1,000 seeded rolls; a
   lost raid never takes the strongbox and never more than 25% of unlocked value; WHILE YOU WERE GONE lists the raid with
   the chronicle's record id.
7. **Offline crew:** a cook left 24 real hours offline yields ≤ `48` meals (§4.9) and no more than 72 h of output however
   long the owner is away.
8. **Social gravity:** in a 72-hour bot soak with 60 bots on FL, the median bot "meets" (comes within 50 m of) another
   within 20 real minutes of logging in.
9. **World clock:** with no page connected, 24 real hours advance the region exactly 8 game days (± 1 game minute); 8
   broadsheets exist; at least one district changed level; the world board held 3–6 live events at every check (every
   real 10 min).
10. **Coaches:** every launched line has `every ≤ 8` game hours; a scripted wait at any pole never exceeds 60 real minutes;
    a rider who rides it out offline is set down at their pole within 4 m and logged out; logging back in finds them there.
11. **The 6 km rule:** a sweep of every road point (every 50 m) in a launched region finds a pole or request stop within
    6 km by road.
12. **Siege night:** the §4.11 example (siege 4, 3 players, 10 bodies, wealth 3,000) spawns 220 ± 5 infected over 3–6
    waves from the noisiest sides.
13. **Spread:** the §4.12 example converts 900 Houston stamps to 747 ± 1 Miami stamps at the Swap and 828 ± 1 vat marks.
14. **PvP zones:** a shot from player A to player B inside a holdout wall deals 0 damage; on a PATROLLED road it deals
    damage and adds 1 murder count to A if B was not grey; 5 counts → red plate; the Miami vat refuses A's policy renewal;
    8 play hours later counts drop by 1.
15. **Bounty abuse:** a bounty on a red player claimed by a band-mate of the target pays 0.
16. **LLM grounding:** 100 scripted questions to a grounded NPC; every factual claim in the replies maps to a fact-sheet
    line in the log; questions about absent facts get "haven't heard" ≥ 95% of the time.
17. **Crash safety:** `kill -9` on a region process; after restart, the newest character state differs from the pre-crash
    state by at most 1 s of verbs (compared against the log).
18. **Rollback:** a staged dupe (two trade windows racing) is detected by the ledger check and rolled back for the two
    actors only; every other character's state is byte-identical.
19. **Load:** 300 bot CCU for 6 hours across FL and SW: S0 tick p99 < 33 ms, S3 tick < 200 ms, memory flat (± 5%).
20. **Death and the way home (the signature test):** a character with a Miami policy dies 40 game-miles up I-95 with $600,
    a rifle and a pickup; they come up in Miami within 2.5 m of the vat with the kit only; they reach their husk by SALT LINE
    + request stop + walk in under 40 real minutes; the husk holds what the pickers' seeded rolls left; the pickup is there.
21. **First 30 minutes:** a fresh account reaches a planted SQUAT within 30 real minutes following only on-screen prompts
    (scripted bot run and 10 human testers, ≥ 8 succeed).
22. **IP and art law:** `node tools/ip-lint.mjs` → 0 deny with every new word in §3; no claim plate, red mark, faction
    colour or broadsheet ink uses hue 270–320; every person on a plate, card or bounty poster shows their real flag.

### 8.3 Lanes: what each running lane delivers, and what is unassigned

**Running lanes, mapped to milestones:**
| Lane | Delivers for | Milestone |
|---|---|---|
| Camera / aim / gun carry | readable PvP and the look gate | M1 |
| Crew + tactical AI + crew jobs | offline guards, offline output, bands' squad coordinator | M5, M6 |
| Procedural cities / storeys / bunkers / overrun | claimable stock, district infestation, metros, Carousel stations | M2, M5, M7 |
| Faction audio + LLM + deep stats + music/radio | regional stations, THE WIRE, grounded NPC talk, the stat sheet | M6 |
| Gadgets / traps / security | lock and trap rows, town bulls and patrol cars | M5, M6 |
| Wilds | the food chain, hunting jobs, the outside-the-city life | M6, M7 |
| Clone insurance + buses + request stops | policies, metro vats, riding it out, the 6 km rule | M4, M5, M7 |
| QoL (pause tabs) | WORLD, HOME, LEDGER, LAW tabs | M1, M5 |

**Unassigned — NEW lanes to start next (in order):**
1. **SIM-CORE** — split every stateful system into a pure, headless, deterministic `sim/` half that runs in Node. The
   critical path for everything server-side (M3). Start now; it is the longest.
2. **WORLD CLOCK** — the always-on world service: the 8× clock, S2–S4 ticks, schedules, faction sim and economy ticks,
   regional weather and seasons, the world board, catch-up after downtime (M2). It can start in parallel because S2–S4
   are already records, not bodies.
3. **PERSISTENCE** — SQLite per region, snapshots + the event log, recovery, per-actor rollback, migrations, the loot clock
   (M4).
4. **NETCODE & HARDENING** — TLS/CSP, save plausibility, input-up/state-down, prediction, interpolation, hit rewind,
   binary deltas, per-chunk interest sets, seams (M1 → M4).
5. **HOMESTEAD** — the claim ladder, key rings, lock/window/barricade application, storage, strongbox and locker, upkeep and
   liens, warm/cold sealing, offline raids, WHILE YOU WERE GONE, neighbourhoods and charters (M5, M7).
6. **WORLD EVENTS & NEWS** — the world director at shard scale, the event table, siege nights, elections and coups, the
   broadsheet, the LLM fact-sheet builder (M6).
7. **LAW & SOCIAL** — PvP zones, grey/red and murder counts, bounties, trade windows, the job board, chat and radio
   frequencies, griefing defenses, moderation hooks (M6, M8).
8. **ECONOMY** — scrip issuers and money supply, trust and spreads, vat marks, production chains and stores, price indices,
   sell caps, the faucet/sink dashboard (M6, M7).
9. **LIVE OPS** — hosting, deploys, restarts, monitoring to LogNog, backups, the admin console, account recovery, the
   campaign/legacy machinery, the Long Road shard (M8).
10. **FIRST HOUR** — the web port of THE FIRST RUN, the newcomer's mercy rules, the first-30-minutes script, cold
    playtests (M8).

Start 1–4 now (they block everything else), 5 and 8 once M2 exits, 6 and 7 at M4, 9 and 10 at M6.
