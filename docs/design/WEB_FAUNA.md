# WEB_FAUNA: regional animals, the hot ground's creatures, and the hunt (web engine, layer L5)

**Status:** BUILT 2026-10-23 on `feat/web-fauna`. Rows: `web/src/data/fauna.js` (PHASES, ACTIVE, SPECIES, HABITATS,
PRESENCE, FAUNA_RULES, FAUNA_ITEMS, REGION_OF_STATE, `habitatsFromRegion`). Code: `web/src/systems/fauna.js` (the
director, the records, the brains, the hunting loop, the renderer). Agent commands `fauna`, `faunaSpawn`, `faunaKill`,
`butcher`, `cook` (`web/src/agent/faunatools.js`); selftest "fauna: ..." (13, `web/src/agent/faunatools-selftest.js`).
The plan it executes: `docs/design/WEB_WORLD_EDITOR_PLAN.md` §3.1 L5 Life and §3.3 rung 4 ("then regional stuff like
the animals"). Screenshots: `docs/renders/web/fauna/`.

## 1. Overview

The wild is a layer of the world like the brush or the buildings: rows in, a pure roll out. Every streamed chunk near
you (256 m) is given animals by one formula from what lies under it - its biome letters, whether it is hot ground,
whether it has a water's edge - the phase of the day, and how much of man is about. What the formula gives is a set of
**records** for that chunk (species, group, where, hp, dead or not, butchered or not), rolled from the chunk, the day
and the phase: the same chunk on the same day in the same phase rolls the same animals. Records get **bodies** while
their chunk is within 300 m of you, never where you can see them appear, and go back to records past 420 m (an animal
following you moves house to the chunk it is in instead of vanishing). Animals are never Characters: they take none of
the 160 character slots, the same as the dogs.

Every animal has one brain by its temper:
- **prey** (mule deer, white-tailed deer, jackrabbits, wading birds) graze in a herd round a leader, lift their heads at
  something, and bolt as a herd when it comes too close, at a gunshot, or at a car (across the car's path, to the side
  the herd is on: the deer that crosses in front of you). Caught in a beam at night a deer freezes, then bolts.
- **predators** (coyote packs, the Florida panther) pick their quarry by weakness (hurt, alone, asleep; a dog; game),
  stalk it from their own flanks, low and slow, then rush in hit-and-run. They keep off fire, back out of your flashlight
  or a car's headlights, scatter at a gunshot, leave when they are hurt, and lie up by day (nocturnal) and keep away
  from people. Coyote packs yip at night.
- **territorial** (javelina, wild hogs) graze like prey but the boldest two of the herd huff and stamp at anything on
  their ground, then charge it: a person, a dog, one of the infected. Shot, a hog turns on whoever did it.
- **ambush**: a **rattlesnake** lies coiled and rattles at anything that comes within 4.2 m; it strikes only after the
  warning has run its second, at what is in reach. A **cottonmouth** gapes white and hisses instead. A **gator** basks
  on the bank by day and lies in the water at the edge by night with only its back and eyes out; anything on the bank
  within 4.5 m and it lunges off the edge, bites, holds and rolls (the death roll: damage over 2.2 s, dragging toward the
  water) and lets go when it has taken 30 damage or the roll ends (you shorten it with E). By day it slides into the
  water when someone walks close.
- **scavengers** (vultures, twinbacks) go to the dead first. Any body - a person, one of the infected, a carcass - draws
  vultures within two game hours: they come in high from out of sight, circle it, and come down to it when nobody is
  near, going back up when somebody comes. Their real shadows cross the ground.
- **the swarm** (cinders) rises off hot seeps at night and goes for anything warm; fire turns it, bullets go through it.

The hot ground's own creatures from `systems/hotground.js` (the Glasslings, the Lantern) stay its characters (its AI,
the one damage law) and get their real bodies here: the Glassling a pale six-legged crawler with plates of fused glass on
its back (buried, a few glass edges in the sand), the Lantern a small pale body slung between four long jointed stilts
with a lamp for a head. Two creatures are ours: the **twinback** (a hairless two-headed scavenger that runs the hot
ground in twos and threes; its bite adds to your dose, its meat is hot) and the **cinder swarm**.

The hunt: shoot an animal or trap it (the Greyborn's traps catch game, and snare wire sets your own), stand at the carcass
with a blade and press E to butcher it (seconds of work, shortened by dexterity; moving off stops it), and what comes
off it goes in your pack: meat that spoils on the game clock, a hide (torn on a failed skill check), bone. Cook the raw
meat at a fire (a road flare, a molotov's fire, a burning car) or a camped RV's stove: it becomes a cooked cut, fresh
again and worth three times the food. Eaten raw it may turn your stomach. Hides sell to Mags.

## 2. Player fantasy

Dawn on the flats past mile 40, and six mule deer are working the brush 50 m off the road, heads down, big ears
turning. You get out of the car and one head comes up, then all of them. You crouch. You have the rifle and four rounds.
The shot rolls off the mesas and the herd goes as one, bounding away north, except the buck. Ten seconds of a knife and
a pocketful of red meat later the vultures have found the gut pile and you can see their shadows sliding over the sand
before you see them. That night, camped by the RV with the meat on the stove, the coyotes start up out in the dark, and
when you swing the flashlight round there are four green eyes thirty paces out, and then there aren't.

In Florida it is the wading birds that tell you: the egrets on the far bank go up all at once, and something you can't
see has just come out of the sawgrass.

## 3. Detailed rules

**Records and bodies.** A chunk's records are rolled when it comes alive with a roll id older than the current day and
phase (`${day}:${phase}`); carcasses (and a test's own animals) carry over a re-roll. The director beats every 0.5 s:
it rolls and promotes the chunks within `liveR` (300 m) of you, demotes those past `dropR` (420 m), drops records not
seen for `recordHours` (30 game hours) once there are more than 160 chunks on file, and calls the vultures. A record
whose spot is in your view (the camera's ground radius x 1.8 + 12 m) waits: it walks in later. When the phase turns
while a chunk is alive, the new roll binds to the animals already about (same species keep their bodies); the rest drift
off and are gone once they are out of sight. Save and load keep every chunk's records (who is hurt, dead, butchered,
where) and the gunfire heat.

**Groups.** Records in one group share one brain object: a herd's alarm (one bolts, all bolt), a pack's quarry, mode
(roam, stalk, attack, feed) and yip timer, kept by its leader.

**Senses.** Four times a second an animal looks round: people and the infected it can see (sight x its night share in the
dark, a crouched player at 0.55 of that) or smell (half its smell range, no sight line needed), dogs, the predators and
gators prey fear, and cars it hears coming (a fast car reads nearer). The nearest is its threat. At night it also asks
whether it is lit: 1 in your flashlight's beam (16 m, 30 degrees), 2 in a driven car's headlights (26 m).

**Predator quarry score** (the pack leader, once a second): for a person
`(hurt x 2 + 0.8 if alone + 2 if asleep + 0.3 x night) x 0.5`, quartered for a whole upright person, cut to 0.3 for a
scavenger unless they are badly hurt; a dog `0.45 + 0.8 x hurt`; game `0.6 + 0.8 x hurt` (+0.4 small, -0.3 big unless
a panther); one of the infected `0.2 + 0.3 x hurt` (packs only). Over 0.35 it becomes the quarry and the pack stalks
for 4-8 s; over 0.85 (or game, a dog, a sleeper) it attacks. A pack smaller than the species' `courage` never goes for a
person.

**Fear.** Fire: an animal never goes within `fire` m past a fire's edge (a burning car is a fire of 6 m), a predator backs
off from it, a swarm flees it. A beam at night: predators back out of it inside `beam` m; prey freeze in it for a moment.
Gunfire (the noise of a shot, 45 m): prey bolt, predators back off 4 s, hogs run unless already charging, a gator goes
under. Every loud noise also heats the presence grid (below).

**Roads and cars.** A calm animal steps aside from a car coming at it inside 6 m; a panicking one does not look. A car
that hits an animal hurts it by `2.4 x speed` (a buggy at 24 m/s kills a deer; at 19 m/s it limps off), throws it, and
puts a dent of `0.55 x speed x the animal's size` into the car (`vehicledamage.hit`, crash strength) and a little damage
into the car's health: a rabbit leaves nothing, a deer crumples a corner, a gator is a wall.

**The infected.** They do not hunt animals, but one within 1.15 m bites (9 every 1.3 s); hogs charge them, packs
sometimes take a lone, hurt one, and scavengers eat what they leave.

**Dogs.** A dog of yours on heel within 26 m of game that bolts goes after it (a hunter 85% of the time, the rest 35%).
SIC (hold C) on game under your aim sends them all; a dog's bite on an animal goes through `fauna.hurt`. Coyotes and
twinbacks hunt dogs.

**Traps.** An armed trap (the Greyborn's, your snare) under an animal springs: its damage lands, and its hold or knockdown
time holds the animal x20 (game stays in a snare until you come; a gator only x2).

**Butchering.** E at a carcass within 2.4 m with a blade on you (knife 1, machete 0.9, fire axe 1.25, can opener 2.2,
anything else with the blade tag 1.5): time = species time x blade x max(0.5, 1 - 0.04 x dexterity). You stay within
1.4 m of where you started, or it stops. Meat: the row's range (+1 at dexterity 5), less what the scavengers ate
(`picked`, up to 60%). The hide's skill check: `(0.55 + 0.05 x dexterity) / blade`, capped at 97%; a failure is a torn
hide. 3 dexterity xp. Everything goes into your pack (what will not fit lands at your feet), fresh on the game clock.

**Cooking and eating.** E with raw meat on you within 3.2 m of a fire (or 7 m of a camped RV) cooks every raw cut you
carry into its cooked row, fresh (the RV's own stove, which eats one thing hot, also counts as cooked). Raw meat eaten
raw: a 35% chance of food poisoning (`survival.sicken('poisoning')`); hot meat adds 40 rad whatever you do to it.

**Snare wire.** Used from the PACK screen it sets a snare a stride ahead of you (spotted, so you see its ring).

**Drawing.** Four-legged game: one more `DogRenderer` (`systems/dogs.js`, exported for this) with head kinds for deer,
hogs, cats, hares and the twinback, and per-row proportions (`legK`, `lenK`, `wideK`, `deepK`, `neckK`, `neckUp`,
`neckR`, `rump`, `collar`, `tailR`) and per-animal antlers and a tail colour (the white-tail's flag). Everything else:
one rounded-box InstancedMesh posed per part (snakes along their trail or wound in a coil; gators in overlapped
segments with a dorsal ridge, an opening jaw and a roll; birds' bodies, heads, tails and primaries; the Glassling; the
Lantern), one InstancedMesh of tapered wing panels, one additive InstancedMesh for eyeshine, the swarm and the Lantern's
lamp. The hot ground's creatures are marked `c.ownMesh` (, the engine's flag: `characters.js` skips them).

## 4. Formulas

Per habitat row, for the chunk at (cx, cz):

```
expected = perKm2 x KM2 x share x ACTIVE[active][phase] x (1 - presence)
```

- `KM2` = 0.256 km x 0.256 km = 0.065536.
- `share`: the fraction of the chunk's 3 x 3 sample points whose biome letter is in the row's `biomes` (a non-hot row on
  ground that is more than half hot is cut to 0.2); for `hot` rows the fraction of points with `hotAt > 0.25`; for
  `near: 'water'` rows, times the water's-edge share `min(1, min(wet, dry) / 64 x 6)` of an 8 x 8 scan (0 with no water).
- `phase`: night 20-5, dawn 5-8, day 8-17, dusk 17-20. `ACTIVE`: diurnal 0.1/0.8/1/0.7, nocturnal 1.3/0.6/0.15/0.9,
  crepuscular 0.5/1.5/0.35/1.5, any 1 (night/dawn/day/dusk).
- `presence` = the largest of: Rust Haven `1 - clamp((d - 110) / 170)`; the island's ruins 0.45 within 260 m; a built
  corridor town `0.9 x (1 - clamp((d - 260) / 340))`; I-10 (off the island) `0.3 x (1 - clamp((d - 30) / 90))`; the
  noise heat `min(1, heat x 0.5)`, where every loud noise (r >= 30) adds `0.9 x min(2, r / 60)` to its 64 m cell and the
  heat halves every 2.5 game hours (capped at 4).
- The pool budget: if the rows' total is over `chunkBudget` (9), every row is scaled by `9 / total`.

The roll: groups `G = expected / mean group size`, `floor(G)` groups plus one more with chance `G - floor(G)`, each of
`size` uniform in the row's range (a chunk never past 9 animals). Its expectation is the formula's number.

**Worked example.** Chunk (5, 1), open desert east of the island, 1 km off I-10 (presence 0.275 from the road), at 23:00:
coyote = 4.5 x 0.065536 x 1 x 1.3 x 0.725 = **0.278 animals**, groups of 2-4 (mean 3): 0.093 packs, so a pack about one
night in eleven. The same chunk at noon: 4.5 x 0.065536 x 1 x 0.15 x 0.725 = 0.032 (night/day = 8.67, the selftest's
ratio). Jackrabbits there at dawn: 14 x 0.065536 x 1.5 x 0.725 = 0.998. A gunfight that heats the cell to 1.2 lifts
presence to 0.6 and every row there falls by (1 - 0.6) / (1 - 0.275) = 0.55.

Other numbers: car hit damage `2.4 x speed`; car dent `0.55 x speed x size` (crash strength; vehicledamage's zone damage
is `(strength - 4) x 0.035`); butcher time `T x blade x max(0.5, 1 - 0.04 dex)`; hide chance `(0.55 + 0.05 dex) / blade`.

## 5. Edge cases

- **A record's spot is in view when its chunk comes alive:** it is not given a body until it is out of view (no pop-in);
  a carcass is drawn at once (it never moves).
- **A pack follows you past its chunk's drop radius:** its animals move house to the chunk they are in.
- **The phase turns while you watch:** animals the new roll still has keep their bodies; the others leave once out of
  sight. Nothing vanishes on screen.
- **The quarry gets in a car, dies, or gets 75 m away:** the pack drops it and roams (or feeds on it, if dead).
- **A carcass is butchered:** it is a little rack of bones until it is out of sight and 30 s old, then gone; its record
  keeps `butchered`. Vultures over it leave. An unbutchered carcass lies 20 game hours, then its record goes.
- **A body is recycled by the population code (out of sight, 90 s dead):** vultures over it fly off and are removed out
  of sight.
- **The butchering is interrupted** (you move 1.4 m, get in a car, die, the carcass goes): `butcherStop`, nothing taken,
  start again with E.
- **No blade:** E is offered as text only ("you need a blade"); `butcher` errors with the reason.
- **Pack full:** butchered goods that do not fit land at your feet (`inventory.stow`), with the usual toast.
- **Raw meat on the RV stove:** the stove eats it hot (its own rule): no food poisoning.
- **Snakes and the infected:** a snake strikes whatever is in reach after its warning, the infected included (damage only).
- **Bullets and the swarm:** rounds pass through it (`onlyBy`: fire and explosions).
- **Animals in water:** land animals stop at 0.75 m of water, wading birds at 0.55 m, a gator swims anywhere.
- **The battery:** the animals are off for every check but their own (each stages its animals with the director's own
  spawning off), so a coyote pack never wanders into an unrelated check at night.
- **A save from before fauna:** loads without the block; chunks roll fresh.
- **Florida not landed / no region layer:** every chunk is the West unless the state under it is FLORIDA
  (`REGION_OF_STATE`); a region layer's `regionAt(x, z)` (returning an id or `{ id }`) wins when there is one.

## 6. Dependencies

**Reads:** `world/worldindex.js` (`biomeAt`, `stateAt`, `towns`, `project` for I-10), `world/brush.js` (`radAt`),
`systems/hotground.js` (`at`, its zones and creatures), `world/water.js` (`depthAt`), `systems/sky.js` (`time`,
`night`, `timeScale`), `systems/inventory.js` (`hours`, `stow`, `add`, `take`, `freshness`, `carried`), `systems/skills.js`
(dexterity level, `gain`), `systems/traps.js` (`list`, `spring`, `place`), `systems/throwables.js` (`fires`,
`startFire`), `systems/dogs.js` (`dogs`, `mine`, `hurt`; `DogRenderer`), `systems/survival.js` (`sicken`), the game's
`chars`, `vehicles`, `statics` (`resolveCircle`, `lineOfSight`), `flashMat`, `aim`, `events`.

**Written into (shared files, each a hook):** `main.js` (construct, update, draw, `noise`, the E chain: butcher and
cook), `systems/combat.js` (a round's line crosses an animal), `systems/throwables.js` (blasts), `systems/dogs.js`
(`DogRenderer` exported with optional proportion knobs and head kinds; a dog's bite on game; SIC on game under the aim),
`systems/inventory.js` (the `snare` act), `systems/regions.js` (its lair gators wait while this layer is on; its canal job counts this layer's gators),
`data/trade.js` (Mags deals in hides), `agent/api.js` (the commands, the checks, save/load, the battery turns the
animals off).

**Feeds / is read by:** the vultures read every death; the dogs read game; the hot ground's dose takes twinback bites,
hot meat and the swarm's stings. Florida (`data/regions.js`) is taken over at import: its `FAUNA.gator` row becomes the
gator species' numbers (`speciesFromRegionRow`: hp, bite, bite interval, lunge speed and range, notice, size, colours,
drag) and its `life.fauna` rows become habitat rows (`habitatsFromRegion`: biomes s w F p, 3.2 a km², at a water's
edge). The region is `WorldIndex.regionOf(x, z).id` (else the state through `REGION_OF_STATE`). `systems/regions.js`
spawns its own lair gators (characters of faction `fauna`) only while this layer is off (the battery, `fauna on=false`);
its sheriff's canal job counts this layer's gator kills too (`faunaKilled` with species gator). A walled holdout
(`WorldIndex.holdouts`: Meridian) is presence 1 inside its walls, fading over the town fade past them. Characters with
`c.fauna` (the region's own animals) are skipped by this layer's senses; an animal of this layer carries `isFauna`.

## 7. Tuning knobs

| Knob | Where | Value | Safe range | What it changes |
|---|---|---|---|---|
| `perKm2` | HABITATS rows | 0.25 - 22 | 0 - 40 | how alive a biome is per species |
| `ACTIVE` | data/fauna.js | see §4 | 0 - 2 | who is about when |
| `PRESENCE.*` | data/fauna.js | see §4 | radii 0 - 600 m, v 0 - 1 | how far towns, roads and gunfire push the wild back |
| `heat.halfLife` | PRESENCE | 2.5 game h | 0.5 - 12 | how long a gunfight empties an area |
| `chunkBudget` | FAUNA_RULES | 9 | 4 - 16 | animals a chunk at most |
| `maxLive` and per-form caps | FAUNA_RULES | 44; quads 40, birds 40, snakes 12, gators 10 | renderers' pools | bodies at once |
| `liveR` / `dropR` | FAUNA_RULES | 300 / 420 m | liveR > the widest view; dropR > liveR + 100 | where records get bodies |
| `alarm` | prey rows | 14 - 28 m | 8 - 40 | how close you get before they bolt |
| `stalk`, `courage` | predator rows | 10 - 16 m; 1 - 2 | 6 - 25; 1 - 4 | how a pack hunts |
| `fear.fire/beam/gun` | species rows | 3 - 9 / 0 - 18 / 0 - 90 m | 0 - 30 / 0 - 25 / 0 - 120 | what an animal keeps off |
| `territory` | hog, javelina | 9, 7 m | 4 - 15 | how close before a charge |
| `warn.r`, `warn.hold` | snakes | 4.2 m, 1.0 s | 2 - 6 m, 0.3 - 2 s | the rattle's reach and how long it warns |
| `attack.reach/roll/rollDps` | gator | 4.5 m, 2.2 s, 9/s | 3 - 6, 1 - 4, 4 - 20 | the lunge and the death roll |
| `vulture.arrive/circle` | FAUNA_RULES | 30 - 75 / 60 - 180 game min | 10 - 240 | how soon the sky gives a body away, how long they circle |
| `carHitK`, `carDent` | FAUNA_RULES | 2.4, 0.55 | 1 - 4, 0.2 - 1 | roadkill and the dent |
| `butcher.*` | FAUNA_RULES | base 0.55, perDex 0.05, timeDex 0.04 | 0.3 - 0.9, 0 - 0.1, 0 - 0.06 | the knife skill check |
| `cook.rawSick`, `hotDose` | FAUNA_RULES | 0.35, 40 rad | 0 - 1, 0 - 120 | the cost of eating it raw, or hot |
| `spoils` | FAUNA_ITEMS | raw 8 - 12, cooked 40 - 48 game h | 4 - 120 | how fast meat turns (2 game min = 1 s) |

## 8. Acceptance criteria (selftest "fauna: ...", all must pass; staged in the open desert at 1500, 900)

1. **The formula:** a desert chunk's coyotes at 23:00 over noon equal `ACTIVE.nocturnal.night / day` (8.67, within 1%);
   jackrabbits at dawn beat noon; a built corridor town's chunk has presence >= 0.85 and at most 15% of the far chunk's
   animals; heating the far chunk cuts every row by exactly (1 - p1) / (1 - p0); 600 rolls of the night chunk average
   each row's expected number within 15%; the director's own chunk comes alive with a valid roll inside the budget.
2. **Prey:** a mule deer herd of 5 34 m away grazes calm for 2 s, bolts at one pistol shot (at least 4 of 5 fleeing, the
   herd's mean distance up 10 m, a `faunaFlee` event); a fresh herd 55 m ahead of a car you drive at it runs from the car
   (`faunaFlee` with `from: 'car'`, at least 3 of 4 running).
3. **Predators:** a coyote pack of 3 takes a lone man on foot at 30/100 hp as its quarry at night (stalk or attack, a
   `faunaStalk` event naming him) and closes at least 8 m; a fire at his feet keeps every coyote more than 2.5 m past its
   edge (`faunaBackoff` from fire); with you as the quarry and your flashlight on the nearest at 11 m it backs out of the
   beam (`faunaBackoff` from flashlight, farther after 2 s).
4. **The rattlesnake:** you walk up to it (`moveTo`); it rattles at <= 4.2 m (`rattle` event, the rattle heard:
   `audio.counts['fauna:rattle']`), and its strike on you comes after the rattle and at least `warn.hold` later.
5. **The gator:** lying in the river at the edge at night (`lurk`, in water), it lunges at a man 4.1 m off on the bank
   (`faunaLunge` from the water), holds and rolls him (`faunaRoll`), he is hurt and dragged at least 0.3 m toward the water (the region row's drag, 0.6 m/s).
6. **The hunt:** a pinned mule deer shot with the rifle dies by your hand (`faunaKilled` by you); `butcher` with a knife
   gives at least 3 raw venison and exactly one hide (clean or torn), fresh; 13 game hours on it is stale, 25 rotten;
   `cook` at a struck flare turns every raw cut into cooked venison, fresh; eating one takes food from 0.30 to 0.66.
7. **Vultures:** a body left in the open draws them (`vulturesCalled` for it) and at least 2 circle over it (state
   circle, above 5 m, within their circle radius + 3 m) within 120 game minutes, drawn (a dozen parts each) and casting
   shadows.
8. **Hogs:** a hog huffs a warning (`faunaWarn`) at a man on its ground and then charges him (`faunaCharge`, after the
   warning) and hits him; a hog charges one of the infected and hurts it.
9. **Traps and dogs:** a snare under a jackrabbit springs and holds it; a dog of yours SIC'd at a white-tail under your
   aim runs it down and bites it (`dogBite` on the deer, its hp down).
10. **Roadkill:** a deer standing 40 m ahead of a buggy you drive at it is hit (`faunaCarHit`), killed (`roadkill`) and
    the car takes a dent.
11. **The hot ground:** at night beside the Fused Flat its creatures are awake, every one `ownMesh` with its stand-in
    person's torso instance zero-scaled and more than 20 fauna parts drawn; the density there lists twinbacks and the
    cinder swarm; a swarm 6 m off stings you (`faunaAttack`) and glows (more than 20 sparks).
12. **Records:** a javelina killed and one hurt to 25 hp 106 m off; you go 900 m away (both gone as bodies), save, load,
    come back: the carcass is where it fell, the hurt one has 25 hp.
13. **Budget:** every kind of animal at once (at least 32 bodies: deer, coyotes, javelina, hares, rattlesnake, hogs,
    white-tails, a panther, a cottonmouth, wading birds, twinbacks, a swarm, vultures, a gator) at the widest zoom (HIGH)
    by night: under 150 draw calls, parts and glows within their pools.

Also, for the whole battery: under 150 draw calls, no runtime errors, `scenario name=stress` not regressed (the hand-back
has the A/B), `node tools/ip-lint.mjs` 0 deny.
