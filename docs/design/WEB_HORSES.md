# WEB_HORSES — horses: the other kind of distance (web engine)

**Status:** BUILT on `feat/web-horses` (2026-10-29). Code: `web/src/data/horses.js` (BREEDS, GAITS, CARE, HERDS, STABLES,
HITCHES, HORSE_ITEMS, `validateHorses`), `web/src/systems/horses.js` (the ledger, the saddle, the care, the fright, the
tack renderer), `web/src/agent/horses-api.js` (COMMANDS), `web/src/agent/horses-selftest.js` (the checks). Hooks:
`main.js` (construct, update, draw, the saddle branch in `updatePlayer`, the E prompt, noise), `systems/fauna.js` (the
`a.ctl` and `a.gentle` hooks), `systems/characters.js` (the rider's pose), `systems/combat.js` (spread tax),
`systems/melee.js` (saddle rule and damage tax), `data/hudlayout.js` (the footing chip shows on foot), `agent/api.js`
(registration and the save).

## 1. Overview

Fuel is scarce. A horse is the second kind of distance: quiet (a walk is heard from 3 m, a gallop from 30), it goes where
a car cannot (forest, dunes, a ford, the length of a town's street), and it has to be looked after: feed, water, wind,
hooves, a rest when it limps. It can be shot out from under you, stolen, spooked, left tied to starve, or buried.

It is **not a second animal system.** A horse is the fauna layer's four-legged body (`data/fauna.js` SPECIES rows
`horse_<breed>`, drawn by the dogs' quad rig, butchered by its yield rows, killed by the same bullets, hit by the same
cars, bitten by the same infected) with a **record on top of it** in the horse ledger (`g.horses`): owner, name, feed,
water, stamina, hoof, lameness, bond, tack and saddlebags. The ledger is the horse's life; the fauna body is its presence
near you (within 260 m; written back past 380 m). A horse that is far away still gets hungry on the game clock.

Three kinds of horse, one record:

| Owner | What it is | Brain |
|---|---|---|
| `wild` | a herd member placed once from a HERD row | the fauna layer's prey brain: grazes, bolts at a bang or a person |
| `stable:<id>` | a ranch horse with a price | the ledger (tied at the rails); buy it or take it (theft) |
| `player` | yours | the ledger; tied, loose near where you left it, or ridden |

## 2. Player Fantasy

You walk out of the walled town at dawn with no fuel and a long way to go. You buy a quarter horse from the ranch hand at
Cottonwood Stables, and a pair of saddlebags, and fill them with water and cans. You trot the streets, canter the washes,
and put your hand down on its neck when a shot goes off and it holds because you have raised it. A mustang you gentled with
oats for three evenings comes to your whistle. You tie it at the rail in town, buy it hay; at the ford you let it drink.
You come out of a fight with a limp in its near fore and walk it home. Later you dig it a grave.

## 3. Detailed Rules

**Mount and dismount.** E beside a horse (within 3.2 m): *mount* a horse of yours, *buy* a stable's horse (E, cash from
`g.cash`) or *take* it (F, a `steal` deed), *offer feed* / *halter* a wild one. Swinging up takes `mountSecs` (0.9 s: you
are in the saddle at once, but cannot steer until it is done; a TIMED ACTION when that lane lands). E in the saddle gets
down on the horse's near side; within 3.4 m of a hitching rail the horse is tied there. The rider is drawn in the saddle
(`characters.js`, pose kind `ride`: seated on the back, upright, waist-twisting to aim) and the saddle, horn, cantle,
blanket and saddlebags are boxes in one instanced mesh.

**Steering and gaits.** The same keys and stick as walking, camera-relative; the horse turns at 3.4 rad/s standing and
1.5 rad/s flat out, and slows into a hard corner. Gait: **walk** (Ctrl, or a light stick tilt), **trot** (default),
**canter** (Shift / L3), **gallop** (hold Space / A). Speeds are per breed (quarter horse 2.0 / 5.2 / 8.8 / 13.0 m/s).
Starts take 4.6 m/s², stops 8.5 m/s². The pad uses the existing `ride` mapping: left stick steers, right stick aims,
RT fires.

**Stamina (the wind).** A tank 0..1. Per second: stand -0.09, walk -0.045, trot +0.002, canter +0.011, gallop +0.03, all
x the breed's `tire` x the terrain's `tire` x the load. Empty: **BLOWN**, it walks until the tank is back to 0.35. Oats
give +0.25. A blown gallop can lame it.

**Terrain and water.** Terrain by biome letter under the hooves (`CARE.terrain`: desert 0.82x speed 1.25x tire, swamp
0.72x / 1.35x, mountains 0.78x / 1.35x, plains and farmland 1x / 1x). Water by depth: a ford (> 0.35 m) 0.62x speed, 1.6x
tire, no gallop; out of its depth (> 1.15 m) it swims at 0.4x, 2.6x tire. A horse stood in water drinks.

**Load.** Rider (70 kg) + pack + saddlebags over the breed's `carryKg` slows it 0.6% a kg (max 45%) and tires it 1% a kg.

**Jumps.** Tap Space at a trot or better with 0.07 of the tank: a hop 0.55 s long, 1.0 m high, clears a box up to 1.05 m
(the collision grid's own heights: a rail fence, a hedge, a low wall). A tall wall stops it (the stride breaks, speed
halves). `horseRideTo hop=true` hops on its own.

**Noise by gait** (heard by AI, dogs, the infected, other animals through `g.noise`): walk 3 m, trot 9, canter 17,
gallop 30. A horse's own hoofbeats never frighten it.

**Fright.** A bang within 55 m (a gun, a blast, 100 m+ is "loud" x1.4), a fire within 7 m, the infected within 11 m, or a
hit. `chance = spook x (1 - bond/100)^1.4 x (own gun 0.45) x loud`. Unridden: it bolts (1.6-3.2 s) away from the noise
and comes back; tied to a post it plunges and holds, tied to a rope it may break loose. **Ridden**: the bolt overrides the
reins; a rider whose horse is below 60 bond and `chance > 0.55` is **thrown** (6-16 damage scaled by speed, knocked down
1.1 s). A hit of 22+ or a horse under 30% hp also throws. Each horse has a 6 s cool-down between frights.

**Care.** `feed` and `water` are tanks 0..1 draining by breed per game day (quarter horse 0.40 / 0.65). Below 0.3 it is
hungry or thirsty (x0.85 speed); at 0 it loses 4 hp (starving) or 9 hp (thirst) per game hour and its bond falls 5 a day.
Feed: hay (+0.5), oats (+0.3, +0.25 wind), grass (a hungry horse standing on plains, flatwoods, scrub, farmland or wash
eats `0.35 x patch/hour`, and the patch thins `0.12/hour`: it is `outdoors.patch`, the same patch foraging uses), water at
a ford or lake, or a canteen. Brush it (+3 bond, once per 12 hours); a hoof pick restores its hooves.

**Lameness.** A bad step on rough ground at a gallop (0.8%/s), a stone when the hoof is worn, a blown gallop, or a
leg wound lames it: it cannot canter, speed x0.55, and it heals only at rest and fed over 10 game hours; a bandage
halves what is left.

**Bond** (0..100): `wild` 0, `shy` 10, `familiar` 30, `trusted` 60, `soulbound` 85. Oats from the hand +8 (a wild one
that lets you close), feeding +1.5, brushing +3, riding +1.2 per km. Neglect costs 5 a day.

**Taming.** A wild horse bolts from a person as any prey does, **except** from someone slow (under 2.6 m/s) with feed in
their pack, within 24 m: it lets them come. E offers feed (+8 bond); at 25 it will take a **lead rope**, and is yours.

**Tack.** *Saddle* (needed to shoot or swing from the saddle at full effect; bags buckle to it), *saddlebags* (a litre
container per breed: pony 26, mustang 36, quarter 48, draft 90: the PACK screen opens them beside the horse; they empty
onto the ground where the horse dies), *lead rope* (ties it anywhere), *horse brush*, *hoof pick*. Items use verbs
`horsefeed` and `horsetack`; the stable sells them.

**Tying.** Tie at a hitching rail (free) or with a rope. A tied horse stays within 0.4 m of its tie point. A loose horse
stays within ~7 m of where it was left, grazes, and walks to water within 36 m when thirsty.

**Ownership, theft, stock.** A stable's horse has a price (`BREEDS.price`). *Buy* spends cash and changes the owner.
*Take* is a `steal` deed (`m` 3, label the horse and the ranch), witnessed by anyone who sees it (the keeper, if he is
there), recorded in the chronicle and carried by word. A stolen horse keeps `stolen = { from, day }`. A stable's stock
is finite: sold or taken, a horse does not come back. Killing the keeper leaves the stable unminded (`handDead`, saved).

**Combat from the saddle.** Spread x1.9 at a trot, x3.0 at a gallop, x1.25 standing, x1.6 bareback, x1.8 more while the
horse is bolting; melee needs a saddle, is not bolting, and hits at x0.55. A hit horse throws its rider (above).

**Death.** A horse that dies is a fauna carcass: butcher it (raw meat x5-8, a hide, bone; 22 s with a blade). With a shovel
(or a crowbar) a horse of yours can be **buried**: a mound and a marker in the world, its name on the record, the bond's
last use. Its saddlebags spill where it fell.

**The world's horses (placed once, never regenerated).** HERD rows: four wild herds (the Dry Wash and east plains west of
Phoenix, two in the Florida flatwoods). STABLE rows: Cottonwood Stables (2.5 km west of Rust Haven) and Pine Ridge Ranch
(Florida): three horses at the rails each, a keeper, tack and feed on the shelves. HITCH rows: a rail at Rust Haven's gate.

## 4. Formulas

```
speed(gait)     = breed.speed[gait] x terrain.v x (ford 0.62 | swim 0.4) x load.v x lame.v x hunger.v
load.v          = 1 - min(0.45, max(0, (pack_kg + bag_kg + 70 - breed.carryKg)) x 0.006)
drain per s     = GAITS[gait].drain x breed.tire x terrain.tire x (ford 1.6 | swim 2.6) x (1 + over_kg x 0.01)
feed(t)         = feed - breed.feedDay x dh / 24                  (dh: game hours)
graze gain      = 0.35 x patch.r x dh     patch.r -= 0.12 x dh
fright chance   = clamp(spook x (1 - bond/100)^1.4 x mul x loud, 0, 0.98)
```

**Worked example.** A quarter horse (`gallop 13.0`, `tire 1.0`, `carryKg 130`), you carry 16 kg, 2 L of water in the bags
(2.1 kg), over farmland (`v 1`, `tire 1`): `load.v = 1` (70+16+2 < 130). Gallop speed `13.0 m/s`; the tank drains
`0.03 x 1.0 x 1.0 = 0.03/s`, so a full tank is **33 s = 430 m** of gallop, then it is blown for ~12 s at 2.0 m/s while the
tank refills to 0.35 at `0.045/s` (walking). The same ride through desert (`0.82 / 1.25`): `10.7 m/s`, drain `0.0375/s`,
**27 s = 285 m**. A game day of 12 real minutes starves it from full in `1 / 0.40 = 2.5` days (30 real minutes) if nobody
feeds it; thirst takes `1 / 0.65 = 1.5` days. Oats at 0.50 bond (`(1 - 0.5)^1.4 = 0.38`), a mustang (`spook 0.65`) hearing a
shot (`mul 1, loud 1`): `0.65 x 0.38 = 0.25`: a one in four chance it bolts.

## 5. Edge Cases

- The rider dies in the saddle: dismounted, horse stands. The horse dies under the rider: thrown without damage, bags spill.
- Fauna disabled (`fauna on=false`): ledger runs, no bodies spawn; riding needs a body.
- Teleporting while mounted: the player snaps back to the horse next frame (the horse is the position).
- A saved game while mounted comes back mounted (the body is made first); an old save without `horses` lays the herds again.
- Deep water: the rider keeps their seat; the saddlebags' contents are not damaged in this build (see Dependencies).
- A hop into a wall: no hop crosses a box above 1.05 m; the horse stops against it and loses its speed.
- Out of fauna body budget (44 live): the horse stays a record until a slot frees; a ridden horse always has one.
- Thrown into a wall / water: the rider is placed on the nearest clear point.
- Stable keeper dead: the horses are still there, nobody sees a taking.

## 6. Dependencies

**Uses:** `systems/fauna.js` (the body, the herd brain, butchering, damage), `systems/dogs.js` (the quad renderer and bond
tiers' shape), `systems/outdoors.js` (`patch`, the same grazing/foraging patches), `systems/inventory.js` (saddlebags are a
Container; items), `systems/deeds.js` (theft), `systems/combat.js` / `melee.js` (the accuracy and melee tax), `systems/radio.js` (the fallback headline is the nearest loose herd, `radioLine`), `systems/characters.js`
(the seated rider), `engine/collision.js` (hop heights), `data/items.js` (feed and tack rows), the stable keeper is an
ordinary character (`g.addChar`).
**Used by (hooks other lanes can read):** `g.horses.mine()`, `g.horses.strayNear(x, z)` (pulls and the radio can mention a
stray), `g.horses.nearFor(p)` (the E prompt), `p.mount` (the rider's record: other systems treat a mounted player as
not-in-a-vehicle, not-on-foot-combat), `g.horses.aimTax`, `H.owner` (a faction/crew lane can hand a horse to a follower).
**Not done (other lanes' hooks):** timed-action mount (uses the fixed 0.9 s), camps/bases stall block, towing (a horse
cannot tow a car yet), seasons (winter feed), crafting (saddle, saddlebags and ropes are found, not made), a pulls-board
listing of a horse for sale (the radio line is done; `strayNear` is the data call for a pull), horses for crew followers,
wet saddlebags in deep water.

## 7. Tuning Knobs

All in `data/horses.js` (`CARE`, `GAITS`, `BREEDS`); safe ranges.

| Knob | Default | Safe range | Effect |
|---|---|---|---|
| `GAITS.gallop.drain` | 0.03 /s | 0.015-0.06 | a gallop's length (33 s default) |
| `GAITS.canter.drain` | 0.011 /s | 0.005-0.025 | canter endurance |
| `BREEDS.*.speed` | quarter 13.0 gallop | gallop 9-16 (the sprinting player is 7.6, a car 20+) | how much faster than walking it is |
| `BREEDS.*.feedDay` / `waterDay` | 0.4 / 0.65 | 0.2-0.8 / 0.4-1.2 | how often it needs feeding (a game day is 12 real minutes) |
| `BREEDS.*.spook` | 0.15-0.65 | 0.1-0.8 | bolt odds |
| `CARE.fright.throwAt` | 0.55 | 0.4-0.8 | how often a bolt throws a green rider |
| `CARE.fright.gun` | 55 m | 30-80 | the distance a bang is felt |
| `CARE.lame.hoursToHeal` | 10 | 4-24 | how long a limp lasts |
| `CARE.lame.gallopRough` | 0.008 /s | 0-0.02 | rough-ground lame odds |
| `CARE.tameBond` / `oatsBond` | 25 / 8 | 15-40 / 4-12 | how many feedings to gentle a wild horse |
| `CARE.rider.aimTax` | 1.9 | 1.2-3 | shooting from the saddle |
| `CARE.hop.h` / `rise` | 1.15 / 1.0 | 0.8-1.4 | the obstacle height a hop clears |
| `CARE.overload.perKg` | 0.006 | 0.002-0.012 | load slow-down |
| `CARE.liveR` / `dropR` | 260 / 380 | 200-320 / 300-460 | where a horse has a body |
| `HERDS[].count` | 4-5 | 1-12 | wild herd size |

## 8. Acceptance Criteria

All as named selftest checks (`only=horses`):

1. **rows**: the breed, herd, stable and gait rows validate; every breed is a fauna species with a butcher row; a purple coat and a non-rising speed table are refused.
2. **mount and dismount**: swing up beside it, drawn in the saddle, it carries you, E gets down, a rail ties it, bareback and saddled differ.
3. **stamina**: a gallop drains the tank at its gait's rate (within 25% along the biomes crossed), empty is BLOWN and it can only walk, rest refills and it runs again.
4. **feed**: hunger and thirst run on the game clock at the breed's rate; hay and oats fill the tank and oats add wind; the starving lose hp at the formula's rate; a plains horse grazes and the patch thins.
5. **fright**: a bang bolts an unbonded horse and it runs away from the noise; a raised one holds; a ridden bolt overrides the reins; a hard fright throws an unbonded rider.
6. **theft**: a stable's horse is refused without the cash, taken under the keeper's eye as a steal deed naming the horse, or bought with real cash and no deed.
7. **saddlebags**: capacity by breed in litres; the PACK screen finds them beside the horse; weight slows a light breed more than a draft; a dead horse spills them.
8. **wild and tame**: a tied horse stays put, a loose one stays near, a wild one bolts from a person but lets one with oats close and is gentled to a rope.
9. **obstacles**: it hops a 0.9 m fence and a 3 m wall stops it.
10. **combat and death**: a hit throws the rider; a dead horse butchers into meat and a hide; a horse of yours can be buried.
11. **noise and HUD**: noise by gait; the footing chip says its wind, feed and water.
12. **lameness**: a lame horse cannot canter, heals only at rest and fed, a bandage halves the time.
13. **save**: the ledger, tack, bags and a mounted state round-trip; the herds are not laid again; a dead wild horse stays dead.
14. **stray**: `strayNear` names the nearest wild horse and its herd, and the radio's fallback headline (`radioLine`) says where a loose herd is.
Plus: `node --check` on every edited file, `ip-lint` 0 deny, `scenario name=stress` not regressed, golden hashes unmoved, under 150 draw calls (the tack, rails and graves are one instanced mesh).
