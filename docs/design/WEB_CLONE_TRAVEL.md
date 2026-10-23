# WEB_CLONE_TRAVEL: the brine, the husk, and the long way back

Rows: `web/src/data/clones.js` (rules, vats, slang) and `web/src/data/travel.js` (nodes, lines, what the road turns up).
Systems: `web/src/systems/clone.js` (g.clone), `web/src/systems/travel.js` (g.travel), `web/src/ui/travelpanel.js` (the boards, the
brine counter, the arrivals hall, the cards). Agent rows and the selftest: `web/src/agent/clone-api.js` (`clone`, `travel`).

## 1. Overview

Robert's settled call (EM3 Briefing, WEB_WORLD_EDITOR_PLAN §1.1): death is cloning, as Autoduel had it. "You wake as your clone
and then travel back to where you died": buses and bus stations, trains, one rare airline (New York, Los Angeles, New Orleans,
Ohio, Chicago), travel ports, and slang of our own.

The loop:
1. You buy a **pressing** (a backup) at a vat's counter. It holds your skills and xp as they are that hour, your face and flag.
2. You die. Your **husk** (the body) lies where you fell with everything you carried and wore and the scrip in your pockets.
   Your car stays where you left it, trunk and all. Both are marked on your map.
3. After four seconds of black you **come up** in the vat that holds your pressing: its skills, nothing on you but the vat's
   loaner pistol (empty), a bottle and a rag, brine-sick for a game day. The pressing is used up. Your **brine book**
   (scrip banked at the vats) is untouched.
4. You get back to your husk: on foot, by **trundle** (the bus on I-10, pole to pole), by **the iron** (the freight), or by
   **Five City Air**. Every ride costs a fare and game time, and the road can turn something up.
5. Meanwhile **pickers** work your husk on the clock, the best thing first. Reach it and you take back what is left.
6. No pressing in the brine when you die: you **die flat**. On a shard that character is over; on a local save it is flagged
   in the lineage and a fresh drifter walks in (the character creator opens instead once it lands: `g.creator?.open`).

It is the first rung of "human-made" on the content ladder (WEB_WORLD_EDITOR_PLAN §3.3): the clone travel network.

## 2. Player fantasy

You were careless at mile 31 and the Dustwolves made you pay. The lights go out, then amber: you are floating, and Doc Reyes
is draining the tank. You stand up in her back room in a body that has never been anywhere, shaking, with a clinic loaner in
your hand and a waypoint on your map: your husk, thirty miles east, your pickup beside it with two canteens and thirty rifle
rounds in the bed. You count your scrip. The trundle leaves the Rust Haven pole at 14:00. You buy a punch, sit on the bench
under the rusted lean-to, read the board, and watch the coach come in off Route 66 with bags lashed to its roof and a guard
on the step with a sawn-off. You sleep most of the way. You wake at the Sand Trap pole a day and a half later and walk the
last mile in the heat, hoping the pickers were lazy.

What each fan should recognise:
- **Autoduel:** the clone, the backup that only knows what you knew when it was taken, the car left in the ditch.
- **Ultima Online:** the body as a lootable thing in a shared, persistent world; the run back to your corpse.
- **Project Zomboid:** the cost is time and stuff; the clock never stops while you travel.
- **The novels' world (never their words):** walled towns linked by dangerous roads; travel itself is the adventure.

## 3. Detailed rules

### 3.1 Pressings and the vats
- A **vat** is a row: a usmap town id, where in it the vat stands (`at`, or its knot's counter via `port`), and multipliers on
  price and upkeep. One per metro row plus the holdouts that run one: Rust Haven (the clinic's middle room), Los Angeles,
  El Paso, Meridian (Florida, off the map until it streams), New York, Chicago, New Orleans, Ohio.
- You press at the vat whose counter you stand at (E at the tank in Reyes's back room, or Reyes's choice "The brine room"),
  or in the arrivals hall of an off-map city that has a vat. The scan takes an hour in the chair (the clock runs).
- A pressing records: the vat, the game hour, `skills.save()` (every skill's level and xp), your name, flag and colours.
- One pressing at a time. Pressing again replaces it (wherever it was); the old body is poured out.
- **Starter pressing:** a new character starts pressed once at Rust Haven, free (Rust Haven presses newcomers: it needs bodies); it pays no brine money (the town covers it). Once it is used, every pressing after is bought and kept.
- **Brine money:** each new game day while you hold a pressing, the vat's upkeep comes out of the brine book. A day it cannot
  is owed; after `graceDays` owed days the vat drains your pressing (toast, `pressingLost` event). Putting scrip in settles
  what is owed first.
- **Brine book:** deposit and withdraw at a vat counter (or through its keeper). Pressings and upkeep are paid from your pockets
  first, then the book. The book survives every death.

### 3.2 Dying and the husk
- `main.js onKill` (the player) calls `clone.onDeath`: a container `husk:<n>` is placed where you fell (on your floor if you
  were upstairs) holding: every carried stack, the worn pack (as an item), every worn gear piece (as items), every gun you
  carried (as gun items with their condition and loaded rounds). Your carried scrip goes on the husk record; throwables too.
- **Your car:** the vehicle you died in, or your last vehicle if it stood within `carRange`. It stays where it is; its trunk is
  its own container; the husk record points at it.
- Both are on the big map (all three views: island, metro, region) as YOUR HUSK and YOUR <CAR>, and the minimap pins the husk
  to its rim when it is off the dial. Waking sets the GPS waypoint on the husk.
- Within `promoteR` of you the husk is drawn as a real dead body (the character renderer, your colours and flag); farther, it
  is only a record (no draw calls).
- **The pickers:** every game hour a seeded roll per husk (odds by where it lies, more at night) takes the best thing on it
  (or a share of the pocket scrip, when that is worth more); the trunk is picked at half the rate; after `carStripDays` the car's
  rear tyres are gone; after `keepDays` the husk itself is gone. **Caught at it:** when you come within drawing range and something
  was taken in the last `seen.fresh` hours, the picker may still be crouched over your husk (seeded per husk and hour, `seen.odds`),
  carrying what they took. Seen within `seen.fleeR` they run (the AI's flee); past `seen.goneR` they are gone with it; drop them
  and what they took is on their body (killing a picker is still killing a drifter: the world's witnesses and standing apply).
- **Taking it back:** open your husk (E, "Go through your husk"): the scrip and throwables come back at once; take the rest on
  the PACK screen, or `clone action=reclaim` takes all that fits (guns slung, the pack worn, armour back on, the rest pocketed).

### 3.3 Coming up
- When the black is over (`wakeDelay`), with a pressing: you stand in front of its vat (on the map) or in its city's arrivals
  hall (off the map); hp at `wakeHp`; wounds, infection and fever gone (a new body); water and food topped to 0.6, rest 0.8;
  skills exactly the pressing's; the vat's kit (loaner pistol, empty; a bottle; a rag; no pack, no gear); brine-sick for
  `sickHours`; wanted stars cleared; whoever was after you lets it go; RESPAWN_GRACE seconds on your feet.
- The pressing is used. Until you are pressed again, the next death is flat.
- Kept: name, face, flag, skills as pressed, the brine book, the world's memory of you (standing, roles, deeds), quests, your
  house. Lost: everything carried and worn, pocket scrip (on the husk), xp earned after the pressing, the pressing itself.

### 3.4 Dying flat
- On a shard (`g.shard.state === 'inworld'`): the lineage records the character, `clone.flat` is set and sent with the character
  save; the shard marks the character `gone` and refuses to let it `enter` again. The player stays down.
- On a local save: the lineage records it, and a fresh drifter walks in at the clinic door: a new name, every skill 0, the start
  kit and a pistol, no scrip, no brine book, every faction's standing back to its start, roles cleared, quests as a new game,
  and the starter pressing. If the character creator exists (`g.creator.open`) it opens.

### 3.5 The travel network
- **Nodes** (data/travel.js NODES) resolve against the world: a town or an exit is projected onto I-10 (its arc length `s`), a
  point is used as given. A road node gets two **poles** (one on each carriageway's outer shoulder: a post with the line's
  roundel, a bench under a rusted lean-to, a ticket box) and a **board** (the schedule, legible from the street camera). A
  node whose town is not built (past the dust wall) is **off the map**.
- **Knots** (travel ports) are nodes where lines meet: Los Angeles (the trundle's terminus and the field), the Iron Crossing (the
  trundle and the iron, Dust Bowl Station 110 m down the line), El Paso (the trundle's other terminus).
- **The trundle (SUN LINE):** LA, Furnace Mile 9, the Iron Crossing, Rust Haven, the Sand Trap, Las Palmas, El Paso. It leaves
  each end at 06:00, 14:00 and 22:00; its time at every pole follows from the road distance at its cruise plus a dwell at each
  pole. Near you it is a real vehicle (the `bus` row, one draw call): a named driver and a guard with a shotgun, made real
  `busSpawnAhead` up the road when it is due at the pole you wait at, driving the outer lane on the corridor's autopilot,
  rounding a stopped car or wreck by the inner (or a clear oncoming) lane, stopping for anyone on foot (and honking), braking
  to each pole and dwelling there. Its driver can be killed (it is stranded; take the wheel and it is yours, not the line's),
  it can be shot to pieces, its guard shoots anything coming for it.
- **The iron (IRON LINE):** Dust Bowl Station on the island, the North and South Yard halts in the ring. The freight
  (systems/train.js) runs south and loops back in from the north. Board it at the station (G, as before); with an iron punch the
  ride is yours, and when the freight runs off the island you step off at your halt (a fade, the rest of the trip on the clock).
  Without one you are a stowaway: dropped at the South Yard halt, and the brakeman may throw you off first.
- **Five City Air:** one field on the map (Los Angeles, at its knot, off the far side of the road), four past the dust. Flights
  are rows (from, to, hour, every N days, hours aloft, fare). Boarding is a fade: the wait and the flight go by on the clock.
  Landing past the dust holds you in that city's **arrivals hall** (the world is paused, you cannot be hurt) until you fly back
  onto the map; a hall city with a vat lets you get pressed there.
- **Punches:** bought at the board you stand at (E: the panel; 1-9 buys). A punch names its line, from, to and (for the trundle)
  direction; up to `punchMax`. Boarding the trundle (C at the dwelling coach) with a punch going its way starts the ride; without
  one the driver puts you off. At your stop the guard walks you off at the pole; F at any earlier pole gets you off there.
- **Riding:** in real time (the clock runs as you ride; ambushes, breakdowns, tolls and herds can come at you on the road), or
  asleep: N aboard, or N at the board with a punch, sleeps through it. The clock runs the wait and the whole trip, your needs
  drain as if dozing in a seat (never below a floor), the husks' pickers get those hours, and the road rolls once.

### 3.6 What the road turns up (EN_ROUTE rows)
ambush (Dustwolves: a share of your pocket scrip, a few hp), breakdown (hours lost), toll (a holdout checkpoint's toll; can't
pay: put off one pole short), herd (the dead on the road: hours lost, a scratch), washout (the iron creeps for hours), rough air
(a hard landing), shakedown (the crew shakes down the cabin). A skipped trip is never lethal (hp floors at 10 or what you had).
In real time on the trundle, one roll each 200 m (one thing per ride): Dustwolves spawned up the road coming for the coach, the
coach stopping to fix a belt or pay a toll, a herd on the road ahead.

## 4. Formulas

| What | Formula | Variables |
|---|---|---|
| Pressing price | `round(price * vat.priceMul)` | price 400; Rust Haven x1, LA x1.25, El Paso x0.9, NY x1.6, Chicago x1.4, New Orleans x1.2, Ohio x1.1 |
| Brine money / day | `round(upkeepPerDay * vat.upkeepMul)` | 20 |
| Pressing drained | owed days > `graceDays` | graceDays 2 (drained on the third unpaid dawn) |
| Wake hp | `maxHp * wakeHp` | wakeHp 0.6 |
| Brine sickness | `N.sick = { kind: 'brine', until: now + sickHours }` | 24 h; stamina regen x0.6, max stamina 0.7, sway x1.3, speed x0.9, healing x0.6, vignette 0.22, water drain x1.2 |
| Picker odds an hour | `perHour[where] * (night ? 1.5 : 1)` | haven 0.01, ring 0.06, road 0.09, wild 0.04; night = 20:00-05:00 |
| A pick takes | the pocket scrip's share `floor(cash * 0.35)` if `cash * 0.35 >=` the best stack's worth, else the stack worth most (`value * n`) | seeded by husk id and game hour |
| Trunk pick | `odds * trunkMul` | trunkMul 0.5 |
| Car stripped | `hour - diedAt >= carStripDays * 24` (rear tyres popped) | 4 days |
| Husk gone | `hour - diedAt > keepDays * 24` | 10 days |
| Trundle fare | `round(base + perMile * miles)` | base 6, perMile 1.1, a game mile 1,609 m of built road |
| Trundle time at pole i (east) | `dep + (s_i - s_0) / speed * ts + i * dwell * ts` | speed 21 m/s, dwell 14 s, ts = 1/30 game h per real s; deps 06, 14, 22 |
| Iron fare / time | `round(4 + 0.8 * miles)`; `metres / 17 * ts (+ loopHours 3 round the loop)` | |
| Trip risk | `min(0.9, (1 - (1 - perMile)^miles) * (night ? nightMul : 1))`; air: `perFlight` | trundle 0.011 / mile, night x1.6; iron 0.02, x1.4; air 0.06 |
| Napping drain | `need -= drainPerHour * SLEEP.drain * hours`, floored at 0.18; `rest += SLEEP.perHour * 0.6 * hours` | |

**Worked example.** You die on I-10 at mile 31 (the Sand Trap, `road`) at 13:00 with $380, a vest, an SMG and a pack; you come up
in Rust Haven. Eastbound trundles reach the Rust Haven pole at 02:10, 10:10 and 18:10 (each end's 06/14/22 departure plus
`(42228 - 160) / 21 / 30 = 66.8 h` of road and three 0.47 h dwells). You buy a punch to the Sand Trap: `round(6 + 1.1 * 5.43) =
$12`, and sleep through it: the wait (13:00 to 18:10, 5.2 h) plus `8738 / 21 / 30 + 0.47 = 14.3 h` on the road. The road rolls
`1 - 0.989^5.43 = 5.8%`. The pickers had 19.5 hours at the road's odds, 9 of them night: `10.5 * 0.09 + 9 * 0.135 = 2.2` picks
expected: the SMG (worth most) and a share of the scrip are likely gone when you walk up at 08:30.

## 5. Edge cases

- **Dying aboard the trundle:** you are thrown out with the husk where the coach was; the ride ends; the coach drives on.
- **Dying on the iron's roof:** the husk lies beside the track where you fell.
- **Dying upstairs:** the husk lies on that floor (its container on that storey).
- **Two deaths before you reach the first husk:** two husks, each picked on its own clock, both on the map.
- **Your car is gone** (burned, sunk, taken): the husk keeps the record (`car.there: false`); nothing is invented.
- **Pressed while holding a pressing:** replaced; the new one pays the full price.
- **Brine book short:** owed, then drained after `graceDays`; a later deposit settles what is owed first.
- **Off-map vat:** you come up in that city's arrivals hall and must fly back onto the map. A vat in an off-map town with no field
  (Meridian today) cannot be pressed at (you cannot stand at its counter), so you can never come up stranded there.
- **No punch:** the driver puts you off; the board says where to buy one. Riding past your stop cannot happen: the guard walks
  you off at it. Getting off early (F at a pole) ends the ride; the punch is spent.
- **The driver dies:** the coach coasts to a stop, `stranded`; you can take the wheel (it is a stolen coach now, not the line's)
  or walk. The coach is cleared once it is out of your sight.
- **A toll you cannot pay on a slept trip:** put off at the pole before your stop.
- **The arrivals hall:** the world is paused for you, you cannot be hurt, Esc does not close it; only a flight out (or a load)
  does. A save taken in a hall loads in the hall.
- **Save while riding the trundle:** the coach is travel's own record (not a world vehicle in the save); a load makes it again
  where it was, its crew re-seated, you aboard as a passenger.
- **A save from before this system:** no `clone`/`travel` sections: no husks, your current pressing and punches stay as they are.
- **God mode / the selftest:** `clone action=die` turns god off for the killing blow.
- **Die flat on a shard:** the shard refuses the character from then on (`gone`); the account makes a new one.

## 6. Dependencies

Uses:
- `main.js`: onKill (the husk), updatePlayer (the waking replaces the clinic doorstep and its 15% fee), the E chain (a board or the
  vat counter takes E before a box or a bed), N aboard (sleep through the ride), the frame order (travel, then clone, after convoys).
- `systems/inventory.js` (containers, trunks, sling, wear), `systems/gear.js`, `systems/skills.js` (save/load: the pressing),
  `systems/survival.js` (the sickness slot and its rows; NEEDS and SLEEP numbers for napping), `systems/society.js` (the day
  and the hourly world ticks while the clock runs).
- `world/worldindex.js` + `world/streamer.js` (I-10 arc length, sections, lanes, `autopilot`, `locate`), `systems/train.js`
  (the freight's state; riders), `systems/vehicles.js` (the `bus` row registered by travel.js) + `vehiclebodies.js` (`busBody`),
  `systems/seats.js`, `systems/carcombat.js` (the guard's fire), `ui/qol.js` (map layers), `ui/hud.js` (the minimap pin),
  `data/npcs.js` (Doc Reyes's brine-room choice), `agent/api.js` (snapshot/restore, COMMANDS, the battery).
- `net/shard.js` + `server/shard.mjs`: the character record carries `clone`; a flat character is `gone` and cannot enter.

Used by:
- **The World Forge MAP tab** edits `data/travel.js` (nodes, lines, flights) and `data/clones.js` (vats) as rows.
- **The character creator** (when it lands): opened by dying flat (`g.creator.open({ why: 'diedFlat' })`).
- **Florida:** Meridian's vat is a row already; Florida's lines are new rows (nodes by town or exit; nothing here is I-10 specific
  except the rows themselves; the trundle drives whatever corridor `W.project`/`autopilot` serve).
- **Later:** other players looting your husk on a shard (needs the shard's world patch to carry husks), the journal/memory law
  of the Godot CLONING.md, black-market vats.

## 7. Tuning knobs

| Knob | Value | Safe range | What it changes |
|---|---|---|---|
| `price` | 400 | 150-1500 | how much a life costs |
| `upkeepPerDay` | 20 | 5-80 | the slow drain of staying insured |
| `graceDays` | 2 | 0-7 | how forgiving the vat is |
| `starterPressing` | true | bool | a first death that is not the last |
| `wakeHp` | 0.6 | 0.3-1 | how rough the new body starts |
| `sickHours` / `sick` | 24 / see §4 | 6-48 | how long you are fragile after |
| `husk.carRange` | 350 m | 50-1000 | what counts as "your car where you fell" |
| `husk.keepDays` | 10 | 2-30 | how long a husk lasts |
| `pick.perHour` | 0.01-0.09 | 0-0.3 | how fast the pickers strip you |
| `pick.night` | 1.5 | 1-3 | night pickers |
| `pick.cashShare` | 0.35 | 0.1-1 | how much scrip a pick takes |
| `pick.carStripDays` | 4 | 1-14 | when your car loses its wheels |
| `pick.seen` | fresh 8 h, odds 0.7, armed 0.4, fleeR 22 m, goneR 140 m | odds 0-1 | catching a picker at it |
| SUN LINE `every` / `first` | 8 h / 06:00 | 2-24 h | how often the trundle runs |
| SUN LINE `speed` | 21 m/s | 15-30 | trip length in game hours |
| SUN LINE `dwell` | 14 s | 6-40 | time at each pole |
| fares | 6 + 1.1/mile; iron 4 + 0.8/mile; air 700-2200 | x0.3-x3 | travel as a cost |
| risk | 0.011 / mile (x1.6 night); iron 0.02; air 0.06/flight | 0-0.05 | how dangerous the road is |
| `busSpawnAhead` / `dueRealS` | 700 m / 50 s | 400-1200 / 20-120 | where the coach appears and when |
| `napFloor` | 0.18 | 0.05-0.4 | the line feeds you thin, never nothing |
| `stowawayRisk` | 0.35 | 0-1 | fare-dodging the iron |

## 8. Acceptance criteria (each is a `selftest` check, `src/agent/clone-api.js`)

1. A pressing costs exactly its row's price, takes an hour on the clock, and holds the skills and xp of that hour; xp earned
   after does not change it.
2. Brine money: a day's upkeep comes out of the brine book; the grace days count up while it is short; the next unpaid dawn
   drains the pressing (`pressingLost`).
3. Dying (an honest lethal hit) wakes you within 2.5 m of the pressing's vat with the pressing's skills, the kit only (rag,
   water bottle, an empty loaner pistol, no pack, no gear), brine-sick for 24 h, no pocket scrip, the brine book untouched,
   the pressing used up, hp at 60%.
4. The husk lies where you fell holding the vest, the canteen, both guns, the rounds, the pack and the $600; the pickup is
   where it was with its trunk; the map draws YOUR HUSK and YOUR PICKUP; the big map and minimap draws run.
5. The pickers run on the clock: 96 game hours take at least one thing, the first the husk loses is the best thing (or the
   scrip's share when that is worth more), and the same hours from the same state take exactly the same things.
6. With a pick an hour old, walking into range finds the picker crouched at the husk carrying the taken stack; within sight
   they run; dropped, the stack is on their body.
7. Walking up to the husk shows "Go through your husk" and reclaiming returns the $600, the vest (worn), the SMG, the pack
   (worn), the canteen, the rounds; the trunk still holds its things.
8. With no pressing: on a shard you stay down, `flat` is set and the lineage records you; locally the lineage records you, a
   fresh drifter (new name, skills 0, $0) stands at the clinic, `diedFlat` fired, the starter pressing made.
9. A punch from the Iron Crossing to Rust Haven costs `round(6 + 1.1 * miles)`; waiting makes the trundle real; it stops at the
   pole; you board; it carries you in real time; you step off within 4 m of the Rust Haven pole; the clock ran 0.15-2 h; the
   punch is spent.
10. Sleeping through Rust Haven to Los Angeles runs the clock exactly the wait plus the timetable's road time (plus the event's
   delay); a seed that rolls an event applies it (delay, scrip, hp); a quiet seed rolls nothing; you stand at the LA pole.
11. Los Angeles to Chicago costs the row's $1,400; you land in Chicago's arrivals hall (open, the clock moved by the wait and
   5 h); a flight back costs its row's fare and puts you at the LA field counter with the hall closed.
12. A pressing, the brine book, a husk (its items, scrip and car), punches, brine sickness and the arrivals hall all come back
    from a save and a load.
13. The trundle at its pole, the poles, the board and the vat in view stay under 150 draw calls.
Plus: the whole battery green twice on fresh pages; `scenario name=stress` not regressed; `node tools/ip-lint.mjs` 0 deny.

## Our words (the slang glossary)

All ours. Checked with `node tools/ip-lint.mjs` (the deny list of the novels' coined words): none of these is theirs. The
rows live in `data/clones.js` SLANG.

| Word | Means | In a sentence |
|---|---|---|
| **rerun** | a clone | "She is on her third rerun and still drives like that." |
| **the brine** | the vat and what fills it | "Came up out of the brine shaking." |
| **brine room** | a clinic's vat room | "Reyes keeps the brine room behind the ward." |
| **pressing** | a backup scan | "Get pressed before you take that road." / "a cold pressing" (an old one) |
| **come up** | to wake as your clone | "He came up in El Paso with nothing." |
| **husk** | the body you left where you fell | "Your husk is at mile 31." |
| **husk run** | the trip back to your own body | "Two days on a husk run, and the pickers beat me there." |
| **picker** | a scavenger who strips husks | "Pickers walk the interstate at night." |
| **die flat** | to die with no pressing in the brine: the end of you | "No pressing? Then you died flat." |
| **brine money** | the vat's upkeep | "Pay your brine money or the tank goes cold." |
| **brine book** | your account at the vats | "Keep a hundred in the brine book." |
| **brine-sick** | clone sickness, the first day | "Brine-sick and already shooting." |
| **punch** | a ticket | "No punch, no ride." |
| **the pole** | a bus stop: post, bench, board | "Wait at the Rust Haven pole." |
| **the trundle** | the bus | "The trundle leaves at fourteen hundred." |
| **ride the iron** | take the train | "Ride the iron to the south yard." |
| **sky ticket** | a fare on the one airline | "A sky ticket to Chicago costs a car." |
| **the knot** | a travel port, where lines meet | "Meet me at the LA knot." |
