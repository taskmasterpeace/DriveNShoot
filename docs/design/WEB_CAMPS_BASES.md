# WEB_CAMPS_BASES: a camp for a night, a base for good, a house you rent or buy

Lane CAMPS-AND-BASES, 2026-10-29. Branch `feat/web-camps-bases`. Code: `web/src/systems/homes.js` (g.homes), the rows in `web/src/data/homes.js` (with `validateHomes`), and the commands and checks in `web/src/agent/homes-api.js`.

Robert, 2026-10-29: "we're going to make this world so big that you can actually have your own house... you got to be able to buy stuff for it. But if this is [a post-apocalyptic wasteland], how do we handle that? Like, what if [the hero] wanted to set up a camp? That's one thing, right? Building a base, that's another thing."

## 1. Overview
There are three ways to have a place, each on a longer clock than the one before:

| | Clock | What it is | Built on |
|---|---|---|---|
| **CAMP** | minutes to one night | A bedroll or tent from your pack, the wilds' fire pit, trip bells, the crew standing watch. Pitch it, sleep, strike it, move on | `outdoors.js` fire pit, `survival.js` sleep and prowl roll, `crew.js` members |
| **BASE** | days and weeks | A real building you CLAIM (empty, cleared or taken). You FORTIFY it with real planks and scrap, FURNISH it with pieces of the world you carried home, give its rooms uses, and keep a stash that persists. Burglars come while you're away | citygen's `claimable` kinds and its `claim` deed hook, interiors' window boards, gadgets' door bars, `survival.hold`, `crew.base` |
| **HOUSE** | the long arc | A town house RENTED or BOUGHT from whoever really owns it (a faction, a family or a landlord), with rent, tax or protection money. It can be taken back, burgled or burned | the owner is a real person at the door; `sitestories.js` names the town's holder |

All three follow the laws in `WEB_DEPTH_PLAN.md` §0:
- **Nobody cheats.** You deal with the owner in person. A burglar carries off only what he can lift.
- **No loot regeneration.** The sofa in your base is a sofa somebody's house no longer has.
- **Our own world.** None of the books' names are used.
- Every place is shard-shaped: it has an owner, it is saved, and another player can see it.

Scarcity + distance + consequence: a camp makes **distance** bite (you can't drive all night, and the road is where the danger is). A base makes **consequence** bite (what you leave behind can be taken). Furnishing makes **scarcity** bite (every piece is finite and heavy).

## 2. Player Fantasy
Night is coming on the interstate. You pull 40 m off the road behind a dune, pitch the tent, and choose between a cold camp nobody sees and a fire that cooks your rabbit but shows for 220 m. Your crew's gunner takes first watch.

Weeks later, the ranch house you cleared at the edge of the plains has boarded windows, barred doors, a yard wall and a tower. Its infirmary has the two beds you hauled out of a dead motel in a pickup. You come back from a long run and find a window pried and the rifle rounds gone. The log names the man who took them: Ash Pruitt, a drifter, who carried 24 kg.

In town you pay the Hollis family $2,400 for their bungalow, hand it over to Mrs Hollis herself, and pay the town's holder protection every week. Miss a payment and the house burns.

## 3. Detailed Rules
### 3.1 The camp
- **Pitch** (`camp action=pitch kit=bedroll|tent [fire] [bells]`, 20 s of work):
  - Where: dry ground, out of any vehicle, out from under a roof, at least 9 m off a road's edge (the island grid, the corridors, and a live town's streets: `roadDist`).
  - The kit leaves your pack and is drawn on the ground as one thing.
  - `fire=true` builds the wilds' fire pit (3 deadwood; a real fire in `throwables.fires` that cooks and keeps the infected back).
  - `bells=true` strings trip bells on 10 stakes at 18 m: out past a sleeper's own ear (`SLEEP.wakeR` 12 m), so the bells are the early warning.
- **Strike** (14 s, within 4 m): the same bedroll or tent and the same bells go back into the pack. The fire is kicked out (its wood is burnt; the ash ring stays as the wilds' pit).
- **Sleep** (`camp action=sleep`, or N at the camp): the pitched kit is your bed (bedroll quality). `survival.shelterKind()` reports `camp`, and `shelterFor('camp')` returns the camp's own rest and its **danger**, which survival rolls each game hour asleep the way it rolls any shelter (a prowler from 24 m).
- **Seen**: once a second, every hostile within `seenR` notices the camp. The infected remember the spot (`zombies.remember`). An armed hostile comes for you if you are at the camp.
- **The lookout**: crew members within 30 m of the camp each stand a 2-hour watch in turn. A watcher lowers the danger (×0.45) and wakes you when a hostile comes within 46 m (30 m at night).
- **The bells**: asleep, a hostile crossing the bell line rings them and wakes you (`wake('the bells')`).

### 3.2 The base
- **Claim** (`base action=claim`, standing in it): only citygen's claimable kinds (house, bungalow, cabin, trailer, adobe, rowhouse, stilt house, farmhouse, ranch house, motel, apartment block, truck stop). The claim says how it was got:
  - `empty`: nobody owns it (a fallen town, or 40% of rural homesteads).
  - `cleared`: a fallen town's house, with no hostile alive inside it (+2 m).
  - `taken`: its owner is hostile to you (a steal deed against them) or dead.
  - A friendly owner's house is refused with their name: rent or buy it.
- **Claiming makes it yours everywhere that asks:**
  - citygen's `B.owner = 'player'` (written back after every rebuild).
  - survival's hold (a night there is your hold; doors bar).
  - The crew's base (their base jobs, their stash).
  - `homes.ownerAt(x, z) = 'player'`.
  - Nobody will sell it to you.
  - Townsfolk whose home was in it move out to its door.
- **Fortify** (`base action=fortify kind=`), costs from your pack:
  - `board_windows`: 1 planks each, the interiors' own boards on each window.
  - `bar_doors`: 1 planks each, the gadgets' planks barricade.
  - `wall`: 8 scrap + 4 planks.
  - `gate`: needs the wall.
  - `watchtower`: 6 planks + 3 scrap.
  - `turret`: a **found** `turret_kit` + 30 rifle rounds.
  - Boards and bars go back on the openings each time the town is rebuilt (`reapply`).
- **Furnish**: see §3.4. Each placed piece has a room (`bunk, infirmary, armory, kitchen, kennel, workshop, lounge, storage`). A room works when it holds its kind:
  - bunk: crew beds, one per piece.
  - infirmary: +0.08 rest in your hold.
  - armory, kitchen and storage: more stash litres.
  - workshop: ×1.25 repair.
  - lounge: mood.
- **Stash**: one container `base:<town>:<building>` (240 L + the rooms' litres). It is saved by the homes system itself, so it survives any rebuild.
- **Raids**: once a game day, for each held base you are more than 150 m from, roll `raidOdds` (§4). A burglary sends one burglar record:
  - If the base's defense is at least `RAID.giveUp`, he leaves with nothing.
  - Otherwise he takes the best worth-per-kg he can carry (24 kg, 60 L).
  - The log and his record hold exactly what he took.

### 3.3 Owning a house in a town
- Every claimable house in a holding town has an owner, derived once and purely from its id:
  - a **faction**: the town's holder (from `sitestories`), dealt through its quartermaster
  - a **family**: a household, whose head deals
  - a **landlord**: one person who owns a share of the town
- Rural homesteads are a family's or empty. A fallen town's houses are nobody's.
- The owner is a **person**: promoted to the house's front door while you are within 80 m (removed past 130 m), with a name and a real flag.
- `home action=buy|rent id= from=<char>`: the money goes from your cash into **that owner's purse**. Rules:
  - Anyone but the owner is refused.
  - You must stand within 4 m.
  - A family sells but never lets (it's their home); a landlord or faction does both.
- **Rent**: due weekly to the owner, in person (`home action=pay`). If it's unpaid 2 days past due, the house is **taken back**: the base goes, and the stash's owner becomes them (taking from it is now a theft).
- **Tax / protection** on a bought house: 2.5% of the price a week to the town's holder, paid in town. If it's unpaid 3 days past due a payment is **missed**:
  - A missed payment triples the raid odds (protection withdrawn).
  - Two missed payments and the house is **burned**: the stash, the furniture and the fortifications are lost, and fires start if you are near.
- **Burgled**: as §3.2. Being paid up gives ×0.4 raid odds.

### 3.4 Furniture: the world's own pieces
- Every lived-in building holds `FURNISHED[kind]` pieces (a sofa, beds, a stove...), seeded from its id: the same pieces at the same spots on every visit, drawn in one instanced mesh.
- A piece has **one place**: where it was made, your arms, a vehicle's bed, a base room, or the ground (`moved`).
- **Lift** (3 s): into your arms. You walk at the piece's `slow` (a sofa ×0.55). Lifting somebody else's is a steal deed.
- **Load / unload**: a pickup's bed holds 1,800 L, a van 2,600 L. A car with no bed holds none.
- **Furnish** (3 s): set it down in a base room (outside a base: on the ground).
- A lifted piece is gone from where it stood for good. Nothing makes a new one.
- Traders sell furniture only as what's in their own buildings, bought from their owner (the same owner law).

## 4. Formulas (with an example)
**Seen**, how far off someone notices the camp:
`seenR = seen[day|night] × kit.hide × (lit ? fire[day|night] : 1)`.
A bedroll at night: cold 14 × 1 = **14 m**, lit 14 × 16 = **224 m**. By day, cold 40 m and lit 72 m (smoke). A tent hides ×0.85.

**Danger**, the prowl odds per game hour asleep:
`danger = 0.12 × road × town × horde × fire × lookout`
- road: ×2.2 within 60 m of a road
- town: ×1.7 within 450 m of a holding settlement's edge
- horde: ×2.6 with 6+ infected within 220 m
- fire: ×2.0 at night, ×1.2 by day
- lookout: ×0.45

Example: a lit fire at night, 40 m off I-10, with a watcher: 0.12 × 2.2 × 2.0 × 0.45 = **0.24** per hour, about one prowler in a 4-hour sleep. Cold, 300 m out, no watcher: **0.12**. Cold, out, with a watcher: **0.054**.

**Defense**: `min(0.85, 0.03 × boarded windows + 0.06 × barred doors + Σ parts)`, where wall 0.22, gate 0.06, watchtower 0.12, turret 0.15.
Example: a bungalow with 6 windows boarded, 2 doors barred and a tower = 0.18 + 0.12 + 0.12 = **0.42**.

**Raid odds** per day away:
`min(0.95, 0.22 × exposure × (1 − defense) × (worth > $60 ? 1 : 0.3) × protection × missedTax)`
- exposure: town 0.7, fallen town 1.5, open 1.0, ×1.8 with a horde near
- protection: ×0.4 when your tax is paid
- missedTax: ×3 after a missed payment

Example: that bungalow, in a town, tax paid: 0.22 × 0.7 × 0.58 × 0.4 = **3.6% a day**. The same house out in the open with nothing done to it: **22% a day**.

**Price** = `round(5.5 × floor area × storeys × kindMul × stateMul)`; rent = 6% of the price a week, and a family asks ×1.2.
Example: a 10 × 9 m one-storey house = 5.5 × 90 = **$495**, rent **$30 a week**. A family would ask $594.

## 5. Edge Cases
- **Pitching near a road** is refused with the distance. Pitching inside a building is refused (that's a bed, not a camp).
- **Striking while asleep** is refused. Moving more than 2.5 m stops any work (the job is lost and nothing is spent).
- **The fire goes out** on its own when its wood runs out (the wilds' clock); `lit()` follows it, and so does `seenR`.
- **A town torn down and rebuilt**: ownership lives in homes' records. `B.owner`, the boards and the bars are written back when its openings re-attach. Pieces regenerate from the seed, minus everything in `moved`.
- **The owner dies** (by your hand or anyone's): their house becomes `taken`-claimable, and no sale is possible.
- **Burglar rolls while you're home**: no raid ("watchers wait till you leave").
- **The base cap** (3 per player): claim, rent and buy all refuse past it.
- **A loaded piece and its vehicle**: if the vehicle is lost, its pieces stay recorded on it (`at: 'veh'`). See §8, could not do.
- **Load order**: homes loads after the inventory, so its stashes are placed before their slots are restored.

## 6. Dependencies
**Uses:**
- `outdoors.build('firepit')` and its camp list
- `survival.sleepAt`, `wake`, `claim`, `hold`, `shelterKind` and `shelterFor`
- `crew.members`, `crew.base`
- `citygen.live`, `buildingAt`, `near`, `claim`, `KINDS.claimable`
- `interiors.board` and `ringOpen`
- `gadgets.barricade`
- `inventory.place`, `add`, `take`, `stow`, `spend`, `boxes`
- `zombies.remember` and `zombies.spawn`
- `society.deeds.record` (steal, trade, pay)
- `stories.place` (the town's holder)
- `characters.outfit`
- `throwables.fires`

**Used by:**
- `survival.js` (the camp shelter, the infirmary's rest)
- `main.js` (`trySleep` at the camp; walking speed while hauling)
- the agent API and its save/load

**Shared-file hooks (every one):**

| File | Hook |
|---|---|
| `web/src/main.js` | import + `this.homes = new Homes(this)` · `this.homes.update(simDt)` · `trySleep`: `this.homes?.campBed(p) \|\|` · walking speed `* (p.haulSlow ?? 1)` |
| `web/src/systems/survival.js` | `shelterKind`: `g.homes?.shelterKind() ?? 'rough'` outside buildings · `shelterFor('camp')` → `g.homes.shelterFor()` · the hold's rest `+ g.homes?.restBonus()` |
| `web/src/agent/api.js` | import · `...homesCommands` · `await homesChecks` (before rites) · `homes: g.homes?.save()` · `g.homes?.load(s.homes)` |

**One `camp` command**: the wilds lane already had `camp` (`build=firepit|rack|catcher`, `fuel`, `hang`, `take`, `fill`). `homes-api.js` builds its row from `outdoorsCommands(...).camp` and adds `action=pitch|strike|sleep|status`; with no `action=` the row is exactly the wilds' one.

**The timed-actions lane**: every piece of work goes through `Homes.startJob(label, secs, done)`, one function. When `WEB_TIMED_ACTIONS` lands, that function becomes a call to its clock.

## 7. Tuning Knobs (safe ranges)

| Knob | Default | Safe range | Effect |
|---|---|---|---|
| `CAMP_RULES.seen.night` / `.day` | 14 / 40 m | 8–30 / 25–80 | how hidden a cold camp is |
| `CAMP_RULES.fire.night` | ×16 | 8–25 | how much of a beacon a fire is |
| `CAMP_RULES.danger` | 0.12 | 0.05–0.25 | the base prowl odds an hour |
| `CAMP_BELLS.r` | 18 m | 13–30 (must beat `SLEEP.wakeR` 12) | how early the bells warn |
| `road.mul`, `town.mul`, `horde.mul` | 2.2 / 1.7 / 2.6 | 1–4 | where camping is dangerous |
| `lookout.mul` | 0.45 | 0.2–0.8 | how much a watch is worth |
| `FORTIFY.*.def` | 0.03–0.22 | sum must be able to reach `RAID.giveUp` | how fast a base hardens |
| `RAID.base`, `carryKg`, `giveUp` | 0.22 / 24 kg / 0.6 | 0.05–0.4 / 10–40 / 0.4–0.85 | how much you lose |
| `TENURE.perM2`, `rentShare` | 5.5 / 0.06 | 2–15 / 0.03–0.12 | what a house costs |
| `TENURE.tax.share`, `burnAfter` | 0.025 / 2 | 0.01–0.06 / 1–4 | protection money's teeth |
| `FURNISHED.*.n` | 1–6 | 0–8 | how much furniture the world holds |
| `FURNITURE.*.slow` | 0.45–0.95 | 0.3–1 | how hard hauling is |

## 8. Acceptance Criteria (the named selftest checks, `homes:`)
1. **the rows validate**: `validateHomes`. A fire never hides a camp and shows far more by night, the risk factors only raise it, every fortification costs real items, every piece serves a room, the owner shares sum to 1, and every owner flag is drawn.
2. **a lit camp is seen farther at night than a cold one**: a real raider 110 m off at night marks a lit camp. After the fire burns out, a second raider at 110 m does not. Lit at night is more than 10× cold, and lit at night beats lit by day.
3. **risk rises near a road and with a fire at night**: the danger survival rolls asleep is the camp's, and both factors raise it.
4. **striking a camp returns its kit**: the bedroll, the tent and the bells are out of the pack while pitched, and back once struck.
5. **asleep in a belled camp, one of the infected walking in rings the bells and wakes you**.
6. **claiming a building marks it yours and others treat it so**: B.owner, the hold, the crew base and ownerAt all say so; a sale is refused; it is still yours after the town is torn down and rebuilt.
7. **fortifying spends real planks on the building's own windows and doors**: every window boarded and every door barred, exactly one planks each, defense up, and the bars are back up after the town is torn down and rebuilt.
8. **a piece of furniture placed in the base is the same piece you found and carried**: lifted (you slow down), walked to the base with `moveTo` (not teleported), and set in a room. The fid is the same, there is exactly one place in the world for it, it's gone from where it stood, and a second lift from there is refused.
9. **a burgled base loses exactly what the burglar carried off**: the stash's loss equals his log equals his pack, within his carry limit. Past the give-up defense, he takes nothing.
10. **a house can only be bought from its real owner**: someone else is refused. With the owner (a person at the door), cash falls by the price, the owner's purse rises by the same amount, and the house is yours.
11. **rent unpaid past the grace takes the house back**.
12. **a save carries it all**.

**Screenshots** (game camera, `docs/renders/web/camps-bases/`): a night camp, a cold camp, a fortified claimed house, a furnished room, and a town house for rent.

**Could not do / left for later:**
- Yard walls and the tower are drawn but don't collide.
- A loaded piece rides as a record, not as a mesh on the bed.
- The turret doesn't shoot yet (it counts toward defense).
- The kitchen's stove doesn't yet feed `fauna.cook`.
- A burglar is a record, not a walking person you can catch.
- `tent`, `trip_bells` and `turret_kit` are in no loot table yet (a content call, like the portable radio).


## Dependents added by WEB_FARMING (2026-10-29)
- WEB_FARMING.md: a held base's yard is where beds and a coop go, `homes.baseAt`, and losing the base removes the garden; a kitchen room is the stove bench.
