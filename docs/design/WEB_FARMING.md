# WEB_FARMING: a house, and a garden behind it

Lane FARMING, 2026-10-29. Branch `feat/web-farming`. Code: `web/src/systems/farming.js` (g.farming), `web/src/systems/cooking.js` (g.cooking), rows in `web/src/data/farming.js` and `web/src/data/cooking.js` (each with an exported `validate*`), the commands and checks in `web/src/agent/farming-api.js`, the panel in `web/src/ui/gardenpanel.js`, the forge tab in `web/src/forge/tab-crops.js`.

Robert, 2026-10-29, after reading the Project Zomboid study (`docs/research/PZ_GAP_ANALYSIS.md`): "I like having a house and then a garden."

## 1. Overview
A base that is a HOME. You claim, rent or buy a house (`WEB_CAMPS_BASES`), dig beds in its yard, sow them from real seed, carry water to them, tend them on the game clock, pick what ripens, cook it into meals and eat what you grew. A flock of hens in the yard lays eggs. Your crew can do the tending as a job, from real stock.

It is the one **legitimate way new stock is made** under the depth plan (`WEB_DEPTH_PLAN` laws 1 and 2: nobody cheats, no loot regeneration). So it is bounded on every side:
- no seed, no crop; no water carried, no growth;
- a harvest is the crop row's yield for the bed's soil and health, never more than the row and your skill allow;
- garden food reaches a trader's shelf only by a **courier** that carries it there (a `producer` delivery, `rites.deliver`);
- an unattended garden withers, a frost or blight takes it, deer and raiders and the dead cost you.

| | Clock | What it costs | What it gives |
|---|---|---|---|
| **BED** | 6 to 30 game days a crop | a seed packet, about 1.5 L of water a day, compost now and then, planks for a fence | 3 to 14 portions of produce and saved seed |
| **HENS** | a day at a time | feed (grain or corn) and 0.25 L of water a hen a day, planks and scrap for the coop | eggs, meat, feathers, chicks |
| **KITCHEN** | an hour at the fire | the ingredients, a pot for stews, a fire or a stove (a deadwood a batch) | meals at a quality: food, hp, morale, well fed |

Scarcity + distance + consequence: the garden makes **scarcity** bite harder (every seed is found, every litre carried) and **consequence** bite harder (what you grow can be trampled, stolen or lost with the house).

## 2. Player Fantasy
You clear a ranch house on the edge of the plains and put a bar on the door. Behind it, in the evening, you break ground with a hoe you found in a garage: a bed, eight strokes, a board edge round it. You have four seed packets from a kitchen drawer. Tomatoes in April. You fill a bucket at the stock tank, carry it, pour five litres, and the dark soil goes darker.

A week on, the beds are green fans and you have stopped sleeping through the dry afternoons because the tomatoes are the whole point. A rain catcher by the fence trickles into the thirsty bed on its own. One night a raider's boots are in the corn; the crew finds the stalks pulled and the log says who. You put up a fence the next day, four planks. In June the tomatoes come all at once. You cook a stew with a pot you carried home from a kitchen, eat it hot by the fire pit, and for six hours you are well fed and a little less afraid of the dark. You save the seed.

## 3. Detailed Rules
### 3.1 Where a bed may go
- **In the yard of a place you hold** (`homes.baseAt(x, z, 18)`, the base `held`: claimed, rented or bought). Out in the open there is no garden: you have no claim to the ground.
- Not on a floor (`citygen.buildingAt`), not in water, not on a solid, not within 3 m of a road, not within 3.4 m of another bed, not within 6.2 m of a coop (its run needs room). Eight beds a household.
- A garden **goes with its house**: lose the place (rent unpaid, burned, given up) and its beds and coop go with it, with a line in the garden log.
- *Town allotments* (a shared plot in a held town) are not built; see §5.

### 3.2 The work (timed jobs)
Every verb is a timed job on the lane's work clock (stand still within 2.5 m; moving off, a car or death stops it). The timed-actions lane's clock replaces `startJob` when it lands.

| Verb | Needs | Work | Result |
|---|---|---|---|
| `till` (crouch + E with a hoe or shovel; `garden action=till`; the pack's `dig`) | a hoe (x1) or a shovel (x1.35); a yard | 8 s | a bare bed with the biome's soil richness (0.30 desert, 0.5 swamp, 0.6 elsewhere) |
| `sow` (E at a bare bed; the pack's seed packet) | one seed packet of that crop; the right region; the bed not resting | 3 s | the packet is spent; the crop starts. **Off-season sowing is allowed**, slow and frost-risky, and the prompt says so |
| `water` (E when the bed is under 35% wet; the pack's bucket pours 1 L) | a bucket or water can with water left, or a rain catcher with 1+ L within reach | 3 s | each litre is 20% of a bed; the source runs down by exactly what was poured |
| `fertilise` | one compost | instant | soil +0.35 (max 1.0) |
| `compost` | three food portions that have **rotted** in your pack | instant | one compost |
| `harvest` (E at a ripe bed) | room in your pack | 4 s | produce + saved seed (§4.4); the soil is spent |
| `clear` | none | 4 s | pulls a dead or blighted crop. After blight the bed **rests 48 game hours** |
| `fence` | 4 planks | 10 s | the bed is fenced (§3.4) |
| `scarecrow` | 2 rags, 2 deadwood | 6 s | pests x0.5 on its bed and every bed within 9 m |

### 3.3 Growth, water and the calendar
A bed grows only while it holds a crop, and the garden is simulated on the **game clock** in hour steps, off screen too (a long absence plays at most 60 days). Each hour:
- **Water** falls by `evap x month heat x biome x the crop's thirst`; live rain adds; a rain catcher within 9 m of a thirsty bed (< 50%) moves up to 1 L of its own tank a hour into it (a litre is a litre).
- Under **10%** wet the crop takes damage (`0.02 x thirst` health an hour) and, below 5% health, **wilts** (cause: dry). Under 12% wet it does not grow at all; at 40% and above it grows at full pace.
- Growth is `hours / (days x 24) x pace` (§4.1). At 1.0 the crop is **ripe** and keeps `hold` days on the plant before it rots there.
- **Perennials** (the orange tree, Florida only) return to 55% growth after a harvest instead of dying.

Once a game day, per bed, seeded by (bed, day, tag) so a saved game replays the same weather:
- **Rain** by biome (4% a day in desert, 40% in swamp) wets an open bed.
- **Frost** (the month's chance x the region x (1 - the crop's hardiness)) kills the crop outright. Tomato (0 hardy) in December is a 45% night; collards (85%) 7%.
- **Blight**: 3.5% a day, x2 on a wet day, x2.2 if the bed grew the same crop last, +25% if a bed within 7 m has it. A blighted crop loses health every hour; pull it (the bed rests).
- **Pests** (rabbits, deer, crows): 12% a day by biome, x0.12 if the bed is fenced, x0.5 under a scarecrow. A hit costs 22% health, or 30% of a ripe crop's yield.

The **calendar** is the seasons lane's (`systems/seasons.js`, `g.seasons`, merged from `feat/web-seasons` 746a4e19). With it present: the month is `calendar().month + 1`; the calendar's share of the pace is the place's `growthFactor(x, z)` (clamped 0.1 to 1.4) times 1.1 in a crop's best month, 1.0 in a sowing month and 0.6 otherwise; the night's frost chance is 0.40 when the place's mean air is under 3 C (`read(x, z).frost`), 0.08 under 6 C, else 0, times (1 - hardiness). Without it (a bare `{month}` stub, or nothing) the row's own month tables and a fixed April hold, so the garden is never blocked. Long absences are simulated on the climate of the day you return (not each past day's).

### 3.4 What the world does to it
- **The dead** within 2.2 m of a growing or ripe bed trample it (the crop is lost; a fence does not stop them).
- **A hostile human** within 2.6 m of a **ripe** bed lifts it: the item moves from the bed into his carried list, the bed goes bare, and the theft is a **STEAL deed** in the chronicle with the thief as actor and "your garden" as the target (a witness near him or the log names who). Kill him and the stolen produce is on his body. A fence turns back a hungry stranger but not a raider.
- **Prey animals** (deer, rabbits, birds from the fauna system) within 3.2 m of an unfenced, unwatched bed graze it live in front of you.
- **Picking a bed that is not yours** (a gifted or a neighbour's) is a STEAL deed against its owner.

### 3.5 Hens
- A **coop** (6 planks, 14 s) in the yard holds six birds. A **hen** or **rooster** is an item you find or buy; put it in. (No cows or goats; see §5.)
- Each game day a hen eats `0.5` feed (a chicken-feed unit; an ear of corn counts 0.5) and drinks `0.25` L from the trough you filled. Fed and watered, a hen over 20 days old lays on 70% of days; a hen unfed 2 days stops laying and dies at 5.
- **Nights**: a fox, coyote or raccoon takes a hen on 16% of nights (x0.15 if the coop is latched and wired, x0.35 with a bonded dog within 30 m, x3 with the infected within 45 m).
- With a rooster and a laying hen a day brings a chick 12% of the time; a chick is a hen in 44 days.
- Eggs are **raw** (cook them). A hen can be dressed for raw fowl and feathers.

### 3.6 Cooking
A recipe (`data/cooking.js`, shaped `{id, inputs, tools, hours, skill, bench, output}`) turns real ingredients into meals:
- the bench is a **fire** (a fire pit, a camp stove, a burning car) or a **stove** (the kitchen of a base you hold; burns 1 deadwood a batch). Stews and soups need a **pot**;
- the ingredients leave your pack when the cooking finishes; the batch is 1 to 4;
- **Quality** is a number, `0.42 + 0.045 x cooking level + 0.1 herbs + freshness - bench`, and the tier it falls in (`off`, `poor` under 0.55, `good`, `fine` from 0.80) is the **item you hold**, so it survives the pack, a trade and a save;
- cooking anything **rotten** makes an `off` meal; eating it poisons you;
- a good meal restores food and hp, lifts morale (`A hot meal`, +6; a fine one `A proper supper`, +11) and keeps you **well fed** (a little hp back every game hour) for 6 (good) or 12 (fine) hours;
- the **crew's COOK job** makes the best recipe their stock allows, falling back to the plain meal only when none fits.

### 3.7 The crew's FARM job
`data/crewjobs.js` `farm` (base job, every 3 game hours): picks a ripe bed into the crew stash, else waters the thirstiest bed from **real water** (a bucket in the pack or stash, or a catcher beside it), else collects eggs and feeds the hens; with no water it says so and waits. The old stub that handed out a ration from nothing is gone.

### 3.8 The market (how garden food reaches a shelf)
`garden action=consign trader= item= n=`: the produce leaves your pack and a crew member carries it. It arrives after `distance / 4.5 km/h` game hours as a **`producer` delivery** (`rites.deliver`), which the trade system puts on that trader's shelf on the next look (`trade.delivered`). If the courier dies, it is lost.

### 3.9 Surfaces
- **Prompts at the bed** (E): the verb and the numbers: `Pick the tomatoes (~9)`, `Water the corn (22% wet)`, `Sow beans (off season)`, `Take the eggs (3)`.
- **The garden panel and chip**: `GARDEN n` chip (the next thing that needs you: ripe, dry, blight, eggs; click opens) and a card per bed: crop, stage, growth bar, days left, water bar, soil, fenced/scarecrow, risks (`DRY`, `BLIGHT`, `FROST 45%/night`, `OFF SEASON`, `PESTS 12%/day`, `ROTS IN 3 D`), the hens (feed and water against need), the seed you carry, produce on the road to market.
- **The pack's own verbs**: a hoe digs, a seed packet sows the bed beside you, a bucket pours a litre, compost dresses the bed, a hen goes into the coop, a sack of feed feeds it.
- **The world**: one instanced mesh, boxes only (§4.5), under the draw budget.
- **Commands**: `garden` (status, till, sow, water, fertilise, compost, harvest, clear, fence, scarecrow, coop, latch, stock, feed, eggs, slaughter, consign, panel, age, crewtend, log) and `meal` (list, cook).
- **The CROPS forge tab** (`forge.html`): every crop with its numbers and a month strip, the garden rules, the recipes, the live validators. Read-and-validate; rows are edited in `data/farming.js` and `data/cooking.js` (a writer is a follow-up).

## 4. Formulas (with an example)
### 4.1 Pace
`pace = month x wet x (0.6 + 0.4 x soil) x (0.5 + 0.5 x health)`
- month: **1.15** in a best month, **1.0** in a sowing month, **0.6** a month either side of the window, **0.25** off season
- wet: `clamp((water - 0.12) / (0.40 - 0.12), 0, 1)`

`days to ripe = crop.days / pace`.

**Example**: tomatoes (12 days), sown in April (plain month), soil 0.60, healthy, kept wet: `pace = 1.0 x 1 x 0.84 x 1.0 = 0.84`, so **14.3 days**. In May (best): `1.15 x 0.84 = 0.966`, **12.4 days**. In December: `0.25 x 0.84 = 0.21`, **57 days**, if a 45% frost does not take it first (it will).

### 4.2 Water
`evap an hour = 0.012 x heat[month] x biome.evap x crop.thirst` (heat 0.85 in April, 1.5 in July). Tomatoes in April, plains: `0.012 x 0.85 x 1.0 x 1.2 = 0.0122` an hour, so a full bed is at 40% after 49 h and at the 10% "dry" line after 74 h: **about 1.6 L a day** to hold it wet. A desert July bed (`x1.7 x 1.5`) drinks about 5 L a day.

### 4.3 Risks a day
`frost = FROST[month] x biome.frost x (1 - hardy)` · `blight = 0.035 x (rain day ? 2 : 1) x (same crop again ? 2.2 : 1) + (neighbour blighted ? 0.25 : 0)` · `pests = 0.12 x biome.pest x (fence ? 0.12 : 1) x (scarecrow ? 0.5 : 1)`. Fenced pests: **1.4% a day**, so over a 14-day crop a fenced bed loses to pests 18% of the time, an open one 84%.

### 4.4 Yield and seed
`yield = round(avg(crop.yield) x (0.7 + 0.5 x soil) x clamp(health, 0.2, 1) x (1 - loss) x (1 + 0.07 x farming level))`.
Tomatoes: avg 8.5, soil 0.6 (x1.0), health 1, no loss, skill 0: **9** (skill 5: x1.35 = 11). Seeds saved: the row's range (tomato 1-2) plus 1 at farming level 5. Each harvest costs the soil `crop.drain` (tomato 0.18): a bed you do not dress with compost gets poorer, slower and smaller.

### 4.5 Drawing
One `InstancedMesh` (1,500 boxes), redrawn every 0.5 s (0.12 s while a hen is in view). A bed is the soil block, four boards, three tilled rows and six plants (a stem, 2 to 5 leaf blades, up to 3 fruit): about 45 boxes. Stages: seed (a mound and a pale seed), sprout (two cotyledon leaves), mid (blades at 68% height), ripe (full height with fruit: red tomatoes, yellow squash on the ground, an ear of corn on the stalk, a green melon), wilted (a brown tilted stem and flat dead leaves). A tree draws one trunk and a canopy. Eight beds, two fences, a scarecrow and a coop with six hens is about 480 instances and **one draw call**.

### 4.6 Quality
`q = 0.42 + 0.045 x cooking level + 0.10 (herbs) + 0.14 x (freshness - 0.5) + 0.05 (stove) + 0.03 (pot)`; a rotten ingredient forces `off`. A level-0 cook at a fire with fresh potatoes and peppers: `0.49` (poor). At level 4 with herbs: `0.42 + 0.18 + 0.10 + 0.07 = 0.77` (good, just under fine).

## 5. Edge Cases
- **No seasons system** (a stub or nothing): fixed April; every crop with April in its window grows at plain pace; frost is 2% a night; the panel says "calendar fixed".
- **Save and load**: beds, coops (hens, eggs, troughs), consignments, the log and stats ride the save (`farming`, `cooking` blocks); the world clock and the garden's own `skew` (the `age` test hook) are saved with it. Growth catches up on load by the game clock.
- **Long absences**: up to 60 days are simulated hour by hour on return. A bed left dry for 5 days is dead; a ripe bed unpicked for `hold` days rots.
- **A full pack**: harvest refuses with "make room" rather than leaving fruit on the plant; eggs stop at the pack's limit.
- **Where seed comes from**: NOT the world's loot tables (adding rows there moved the pinned P1 chunk hash `-6,0`, so it is forbidden for this lane). Seed packets, a hoe, a bucket, feed and a hen or two are on Mags' counter (`TRADERS.mags.keeps`) and in the crew's scavenge-run table (`CREW_RUN_LOOT`). A check asserts no loot table carries them.
- **Houses**: a garden's beds and coop are removed with the base (§3.1). An evicted tenant loses the garden with the house; a burned house too.
- **Two hostiles at one bed**: the first takes it; the second finds a bare bed.
- **Off-season sowing** is allowed (it teaches); frost then usually wins.
- **Blight in a fenced bed**: a fence does not stop blight; the neighbour spread (7 m) is why beds are 3.4 m apart and not 7.
- **Citrus outside Florida** is refused ("only grows in florida").
- **Not built (say so)**: town allotments (a shared plot in a held town), a hose off a well (only buckets and catchers carry water), cows and goats (hens only: the minimal husbandry slice), stove power (a stove burns wood; electricity is a later lane), hens on the fauna rig (they are drawn boxes with a wander, not `data/fauna.js` species), a compost bin (compost is a verb on rotten food), crop rotation bonuses beyond the blight rule, greenhouses and cold frames.
- **Multiplayer**: every bed records its `owner`; a second player's bed in the same yard is that player's, and picking someone else's is a theft. Nothing here is client-authoritative about stock: all of it is plain records on the shard side.

## 6. Dependencies (both ways)
**Uses**
- `WEB_CAMPS_BASES`: `homes.baseAt` (the yard), `homes.gives(b).cook` (a kitchen), `homes.roadDist`, `homes.bases` (lose the house, lose the garden).
- `WEB_WILDS`: the fire pit and fire (`throwables.fires`, `fauna.heatNear`), the rain catcher (`outdoors.camp`), the biome and region (`fauna.biomeAt/regionAt`), the cooking skill (`outdoors.lv('cooking')`), `raw_fowl` and feathers.
- `WEB_INVENTORY`: items with `spoils`, freshness stamped `made`, `inventory.act` (one hook), the pack's `use`.
- `WEB_CREW`: the `farm` and `cook` job rows and `crew.jobCycle`.
- `WEB_TRADE` and `WEB_DEATH_RITES`: `rites.deliver` (`producer`) and `trade.delivered`.
- `WEB_WORLD_MEMORY`: `deeds.record('steal')` and the chronicle.
- `WEB_VOICE_STATS`: the deep sheet's `farming` skill row (now taught by `cropSown`, `cropHarvested`, `coopEgg`) and `cooking` (`mealCooked`); morale mods `meal_good`, `meal_fine`.
- `WEB_SURVIVAL`: `sicken('poisoning')` (off meals).
- `WEB_FORGE`: the tab list.
- The seasons lane: `calendar().month`, `read(x, z)`, `growthFactor(x, z)` (§3.3); the panel could show its `plantingWindow` as a follow-up.

**Used by / hooks other lanes should know**
- The crafting lane: `data/cooking.js` recipes are already `{id, inputs, tools, hours, skill, bench, output}`.
- The seasons lane: replace the shim by reading its month; frost and heat tables can move into its rows.
- Site stories and pulls: a held garden's surplus is a natural source for a courier pull.
- Shared files touched (minimal hooks): see the hand-back list in the lane report (`main.js`, `systems/fauna.js`, `systems/inventory.js`, `systems/crew.js`, `data/crewjobs.js`, `agent/api.js`, `forge/forge.js`, `forge/help.js`).

## 7. Tuning Knobs (safe ranges)
| Knob (`data/farming.js` unless noted) | Now | Safe range | What it does |
|---|---|---|---|
| `GARDEN.evapPerHour` | 0.012 | 0.006 to 0.02 | how much water a day costs (April bed: 1.6 L a day for tomatoes) |
| `GARDEN.litrePerWater` | 0.2 | 0.1 to 0.34 | a bed is 5 L at 0.2 |
| `GARDEN.dryDmgPerHour` | 0.02 | 0.01 to 0.04 | how long a dry bed lives (about 2 days) |
| `GARDEN.bestRate / offSeasonRate` | 1.15 / 0.25 | 1.0-1.3 / 0.1-0.5 | how much the calendar matters |
| `GARDEN.blight.perDay` | 0.035 | 0.01 to 0.08 | blight a day |
| `GARDEN.pest.perDay / fence / scarecrow` | 0.12 / 0.12 / 0.5 | 0.04-0.25 / 0.05-0.3 / 0.3-0.8 | pests and what stops them |
| `GARDEN.maxPlots` | 8 | 4 to 16 | beds a household keeps (draws scale: 45 boxes a bed) |
| `GARDEN.yieldSkill` | 0.07 | 0.03 to 0.12 | yield x (1 + this x level) |
| `CROPS[x].days / yield / thirst / hardy / hold` | per row | days 4-40, yield 2-20, thirst 0.5-1.6, hardy 0-1, hold 2-30 | pace, size, thirst, cold, shelf life on the vine |
| `FROST[month]` | per month | 0 to 0.7 | killing frost chances |
| `CLIMATE[biome]` | per biome | rain 0-0.5, evap 0.5-2 | where it is easy |
| `COOP.lay / predator.perNight / feedPerHen / waterPerHen` | 0.7 / 0.16 / 0.5 / 0.25 | 0.4-0.9 / 0.05-0.35 / 0.3-1 / 0.1-0.5 | eggs and the fox |
| `COOP.slots` | 6 | 3 to 12 | birds a coop holds |
| `QUALITY.base / perLevel / tiers / wellFedH` (`data/cooking.js`) | 0.42 / 0.045 / 0.55, 0.80 / 6, 12 | base 0.3-0.5; tiers 0.4-0.9 | how good a meal comes out and how long it carries you |
| `GARDEN.tillSecs, sowSecs, waterSecs, harvestSecs` | 8, 3, 3, 4 | 2 to 20 | the timed jobs |

## 8. Acceptance Criteria
Proved by `selftest only=farming:|cooking:` (36 checks), each through the real path (commands, the pack's own verbs, the job clock, a spawned raider, the crew's job cycle), staging positions the documented exception:
1. **Rows**: `validateFarming` and `validateCooking` are clean (seeds and produce are items, best months are planting months, no purple, build costs are real, no recipe without ingredients, no meal out of nothing) and an empty recipe is refused.
2. **Calendar shim**: fixed April until `g.seasons` exists; then its month.
3. **A house first**: claiming a ranch house makes its yard count; a house you do not hold has none.
4. **Digging**: a hoe or shovel (no tool refused), a timed job, in the yard only, not too close to another bed; a shovel is slower.
5. **No seed, no crop**; the packet leaves the pack. **Watering** pours real litres out of a real bucket (a litre is a fifth of a bed) and refuses with none. A **rain catcher** waters a bed litre for litre.
6. **The full cycle**: sow, water, wait, harvest on the game clock passes seed, sprout, mid and ripe in 6 to 20 days, picks produce equal to the formula and bounded by the row, saves seed, leaves the bed bare and the soil spent. Skill raises the yield. The calendar changes the pace (best faster than plain; off season x0.25).
7. **Loss**: a dry bed withers in the game clock with no produce; frost takes tomatoes and spares hardy crops; blight damages, is cured by pulling, and the bed rests; pests hit an open bed several times as often as a fenced one (a fence costs 4 planks); a scarecrow halves them on its bed and its neighbour.
8. **Theft**: a raider walks off with a ripe crop, it is a STEAL deed in the chronicle with him as actor, it is on his body when he dies; the dead trample a bed.
9. **No stock from nothing**: bare beds, an empty coop and 30 garden days add no food; an unsown bed does not grow; sowing without seed is refused.
10. **Hens**: a coop costs 6 planks; a hen from your pack goes in and is not minted; unfed hens lay nothing and starve, fed hens lay; a latched coop has far lower predator odds; eggs are raw; a hen can be dressed.
11. **Crew**: the farm job waters from a real bucket, picks into the pack, says when there is no water, and no longer produces a ration from nothing; the COOK job cooks a real recipe from the stock.
12. **Market**: produce leaves the pack, travels hours, arrives as a `producer` delivery and lands on the shelf.
13. **Save**: the garden round-trips through `F.save/load` and the world save carries `farming` and `cooking`.
14. **Draw and surfaces**: one instanced mesh with stages, fences, a scarecrow, hens; draw calls under 150; the chip and panel show the beds; the prompt names the verb; the pack's own use verbs reach the garden without double counting.
15. **House**: a garden goes with its house.
16. **Cooking**: a recipe refuses without ingredients, a fire or a pot; consumes the ingredients; quality rises with level, herbs, stove and freshness; a rotten ingredient makes an `off` meal that poisons; a fine meal lifts food, hp and morale and keeps you well fed.

Looked at by eye (docs/renders/web/farming/, game camera): ripe tomatoes, mid squash, a fenced ripe corn bed and a wilted bed read clearly with raised boards; the hens and the coop read poorly from straight above (see the lane report's critique: bigger hens, a roof with a hatch, wet/dry soil contrast).
