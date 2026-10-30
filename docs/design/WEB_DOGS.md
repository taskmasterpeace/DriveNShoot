# WEB_DOGS — dogs that behave like dogs (web engine)

**Status:** SHIPPED 2026-10-23 on `feat/web-dogs-gear`. Code: `web/src/data/dogs.js` (DOG_TYPES, BREEDS, BOND, WHISTLE,
GAIT, DOG_RULES, STRAY_PACKS, LONE_STRAYS, CACHES), `web/src/systems/dogs.js` (the brains, the body, the renderer),
hooks in `main.js` (E on a dog, C whistles, the update and draw, gunfire into `onNoise`), `systems/combat.js` (a dog on
a bullet's line takes the round), `systems/throwables.js` (blasts), `systems/audio.js` (barks, growls, yelps, the
whistle), `ui/inventory.js` (your dogs on the PACK screen). Agent commands `dogs`, `dog`, `whistle`, `cache`; selftest
"dogs: …" (8). Ported from the original game's `game/proto3d/dog.gd`, `quadruped.gd` and `buried_cache.gd` (the
reference spec): its four types, its breeds as multipliers, the bond from stray to soulbound, the whistle's five verbs,
the jump, the pounce, the dig, the bandage save and the grave.

## 1. Overview

Dogs are records in `systems/dogs.js`, not people: they never take one of the 160 character slots, and every dog in
the world is drawn by five InstancedMeshes (body, two head variants for pricked and dropped ears, one tapered limb for
legs, neck, tail and saddle, and one box for caches and graves). The one damage law still reaches them: a bullet whose
line crosses a dog hits the dog (`combat.js` hitscan), a blast throws and hurts them, fire burns them, a car runs them
down, the infected bite them.

There are two lives a dog can have:

- **Strays** pack up round their ground on the island (four packs and two loners). They wander at a walk, the pack
  keeping with its leader at a trot; they put their noses down and go to what they smell (the dead, a dropped tin, a
  pile with food in it) and eat there; they stop to mark; they bark at a threat long before it is on screen and growl
  when it is close; gunfire puts them flat and shaking and then they run; they keep off fire and, at night, out of a
  lit car's beam; and they keep their distance from you until you have fed them.
- **Yours.** Feed a stray (jerky, dried meat, a ration) and its bond rises; at 15 it follows you. It heels at your side,
  guards a spot, seeks out a buried cache or an unsearched box, goes at a man on SIC and pounces, clears a low wall,
  digs up a cache, jumps in your car with you, goes down when it is shot and can be bandaged, or dies: a grave, a
  collar on its remains, its name with the fallen. It remembers who fed it and who shot it.

## 2. Player fantasy

Four dogs are working a dead man in the road outside the old tyre shop, and when you get out of the car they lift
their heads and the big one growls. You stand still with jerky in your hand. The thin brown one with the white socks
comes in sideways, takes it and backs off. Two days and three strips of jerky later she is at your knee when you walk
and asleep against the wheel when you sleep in the cab. The night the Dustwolves come up the wash she is barking at
the dark behind you before you see anything, and when you whistle long and low she goes, low and fast, and takes the
first one off his feet. The one after shoots her. You have forty-five seconds and one bandage.

## 3. Detailed rules

**Types and breeds** (`DOG_TYPES`, `BREEDS`). Four types, each its own job: GUARD (security: a wide threat circle, the
hardest bite, the likeliest knockdown), HUNTER (the nose: finds caches and points out boxes nobody has been through),
COMPANION (instant obedience, a close heel), LAP DOG (cuddle: small, slow to obey, will not bite, barks). Twelve
breeds, three per type; a breed is multipliers over its type's numbers plus a coat (body, mask, legs, a darker saddle)
and a build (lean, heavy, long). The type's numbers: heel distance, top speed, threat radius and how much further it
counts behind you, nose radius, obedience delay, bite and knockdown chance, hp.

**Strays.** A stray more than 238 m (1.4 × `simR`, Manhattan) from you holds still. Otherwise, in order:
- **Cowering** (gunfire within `gunR`, 32 m: a noise of radius ≥ 40): flat, shaking, tail tucked for 2–3.2 s, then it
  **flees** (5 s) away from the shot.
- **Fleeing** from whatever scared it: the shot, a fire, a lit beam, a car, the one who shot it.
- **A threat** (any of the infected; a man with a gun out hunting): it faces it and barks (`WOOF`) every ~0.8 s,
  growls (`grrr`) inside 10 m; one of the infected inside 7 m, or a gun inside 9 m, and it runs. Its pack turns to the
  same threat.
- **You.** With bond under 3 it keeps `wary` (6.5 m) from you, backing off; shot by you it keeps 14 m and growls. Stand
  still within 9 m carrying something a dog eats and it comes in slowly, sits at 2.4 m and begs. Fed once (bond ≥ 3) it
  tags along 5 m behind you within 30 m.
- **A smell** within `scentR` (34 m): a body (dead less than 900 s of sim time), a
  food pickup, a ground pile with food in it. Nose down, it trots there, then eats for 6–11 s; a pickup is gone after,
  a pile loses one food item. The same smell does not draw it again for 140 s.
- **Marking** every 22–50 s: it stops and lifts a hind leg for 1.6 s.
- **The pack:** the leader roams within 26 m of its ground at a walk (and sometimes a trot), pausing to nose about;
  the rest keep 2.2–5.5 m from it.

**Bond** (0..100, tiers STRAY 0, COMPANION 15, PARTNER 45, SOULBOUND 80). Feeding adds the food's `dog.bond` (jerky 6,
a ration 8, dried meat 10; half for a stray that has been shot by you) and mends its `dog.hp`. At 15 a stray is
**yours** (`adopt`): it leaves its pack (the pack picks another leader). Time at heel within 8 m of you adds 0.6 a
minute; a bandage save adds 15; a dug cache 2. Your damage to it takes 0.6 bond a point. A dog of yours not fed for 2
game days says so once a day when you are near, and each day past that loses 3 bond (never below COMPANION).

**The whistle** (C on foot; a car in reach takes C for its passenger seat instead). Taps 0.38 s apart: 1 HEEL, 2 GUARD
(this spot), 3 SEEK, 4 SHIELD (only a soulbound dog answers); a hold of 0.5 s is SIC. Each dog acts after its type's
obey delay × (1 − 0.12 × tier) (a collie at once).
- **HEEL:** a spot beside and a little behind you on the side it likes, tighter with the bond (followDist × (1 −
  0.12 × tier)); two dogs share your heels, more line up a pace behind each pair. It matches your pace and sprints
  (×1.35 its speed) to catch up; standing still it sits. Behind a wall from you it takes an A* path (one path query a
  frame for all dogs). Left more than 95 m behind it finds you (put down out of sight behind you). Within 14 m when you
  take a car, it rides with you (hidden in the cab) and hops out beside you.
- **GUARD:** stands at the post; anything hostile within its threat radius of the post it attacks; then back.
- **SHIELD:** guard, with the post on your hip, at 0.6 of the radius.
- **SEEK:** the nearest buried cache within 45 m of you, else the nearest unsearched, unowned box (not a body): it
  goes; at a cache it **digs** for 2.2 s (front paws scraping, dust) and the cache becomes a searchable box
  (`cache:<id>`, rolled from its table); at a box it stands pointing and barking until you come (12 s at most).
- **SIC:** the person nearest your aim (within 5 m of it), else the nearest threat within 45 m. It chases (with an A*
  path past walls); inside 1.6–3.8 m on open ground with a clear line it **pounces** (leaves the ground at 4.4 m/s up and
  ×1.1 its speed forward, every 2.2 s); a pounce that lands bites, with ×1.6 the knockdown chance; on the ground it
  bites within 1.5 m every 0.8 s. It never follows anyone into fire. A lap dog chases and barks but does not bite.
- **E on your dog:** stay / follow; with food and it hurt or unfed today, E feeds it.

**Senses.** Yours measures threats from you, and counts the blind side behind where you look further (× rearMul); a new
threat gets a `!` floater over it, a `dogAlert` event, and a toast if it is behind you. The hunter's nose finds caches
within its nose radius (it goes and digs on its own) and points out unsearched boxes.

**The jump.** Moving at more than 1.4 m/s, it looks 0.9 m + 0.22 × speed ahead; a box no taller than 1.3 m (not a door,
not a window's wall, not floating) and it leaps: 5.8 m/s up, at least 6 m/s on. In the air anything lower than it
passes under it.

**Hurt, down, dead.** Bullets, blasts (falling off with distance, a throw), fire (7/s in the flames), cars (2.6 × speed),
the infected (9 every 1.3 s when one is within 1.15 m). A stray at 0 hp dies (its body lies 400 s). Yours goes
**down**: 45 s to bleed out (each hit on it takes 8 s off); E with a bandage, rag, suture kit or first-aid kit
stabilizes it at 30 hp (+15 bond, `saves` +1). Bled out: a grave (stone and mound), its remains as a container with a
**dog collar** in it, its name, breed and tier in the fallen.

**Memory** (`mem`): times fed, times saved, times shot by you, the day it was last fed. Saved and loaded with every dog.

**Fear of fire and light** (the original's howlers broke off a charge into a lit beam; its dogs shied from fire): every
dog keeps `fireR` (4.5 m) past a fire's edge and 10.5 m from a burning car; at night (night > 0.3) a stray inside a lit
car's beam (20 m, cos > 0.55) runs out of it sideways, a dog of yours below PARTNER shies sideways, a PARTNER or better
holds. A road flare (a new item) is a small fire for a minute: something to keep strays and worse off you.

**The body.** A rounded barrel (deeper at the chest, darker on top), a saddle for the breeds that have one, a head with
skull, muzzle, nose, eyes and pricked or dropped ears, two-segment legs with a real elbow, stifle and hock, a neck and a
tail. Gaits by speed (`GAIT`): the walk (a lateral four-beat), the trot (diagonal pairs), the lope (a rotary gallop with
the body rocking); the stride is driven by distance covered, so feet never skate. Poses blend: sit, crouch (cowering),
the leap (fores reach, hinds trail), the dig, eating, marking (a hind leg out to the side), lying on its side (down or
dead). The tail reads morale: wide and quick near you and well, stiff and up when alert, tucked when afraid.

## 4. Formulas

| Name | Formula | Example |
|---|---|---|
| Breed numbers | `type[k] × breed.mods[k]` (obey: replaced) | bloodhound nose 24 × 1.4 = 33.6 m |
| Tier | highest `i` with `bond ≥ BOND_AT[i]` | bond 50: PARTNER |
| Obey delay | `obey × (1 − 0.12 × tier)` | shepherd PARTNER: 0.5 × 0.76 = 0.38 s |
| Heel spot | `you + left·side − forward·back`, `side = 0.55·fd`, `back = 0.5·fd + 1.1·⌊rank/2⌋`, `fd = followDist × (1 − 0.12 × tier)` | mutt COMPANION: fd 2.29, 1.26 m aside, 1.14 m back |
| Heel speed | `min(1.35·speed, max(pace × 1.25, gap > 12 ? 1.35·speed : gap > 5 ? speed : …))`, arrival `min(v, 3·gap + pace)` | running at 7.6 m/s: up to 9.5 m/s |
| Bite | `bite × (1 + 0.08 × tier)` | guard SOULBOUND: 16 × 1.24 = 19.8 |
| Knockdown | `biteKd` (× 1.6 from a pounce) | guard pounce: 72% |
| Jump look-ahead | `0.9 + 0.22 × speed` m; clears `h ≤ 1.3` | at 6 m/s: 2.2 m |
| Leap apex | `leapV² / 2g` = 5.8² / 26 | 1.29 m |
| Car hit | `2.6 × speed` | 15 m/s: 39 |
| Blast | `dmg·f² + 10f`, `f = 1 − d/r` | the frag's own law |

## 5. Edge cases

- **A stray in a test's way:** the packs live 90 m+ from the selftest stage and from Rust Haven's checks; test dogs are
  made and removed by the checks themselves.
- **A dog never steals E from a person or a car;** it does take E from a crate behind it (step round it).
- **C next to a car** is the passenger seat, not the whistle.
- **SIC on someone who gets in a car** or goes 70 m off: the dog gives up and heels.
- **A downed dog shot again** loses 8 s of its clock, not hp.
- **Shot twice by you,** a stray will not eat from your hand; once, it forgives at half the bond per meal.
- **Your car destroyed with the dog in it:** it is thrown out beside the wreck, hurt (20).
- **A save from before dogs:** the world's strays are as they spawned; a save with dogs restores every dog (yours, the
  strays, the dead), the dug caches, graves and the fallen.
- **Deep water:** a dog stops at the bank (depth > 0.7 m); it does not swim yet.
- **Upstairs:** dogs live on the street floor (no stairs for four legs yet).
- **Past the island:** the strays are on the island; yours follows you anywhere, its collisions the streamed chunks'.
- **Noise:** barks are not noise to the AI or the infected yet (a tuning question: a barking dog that draws the dead
  is a choice for later).

## 6. Dependencies

- `systems/combat.js`: `hitscan` asks `dogs.raycast` for the nearest dog on the line; a bite goes through
  `combat.damage(…, 'bite')` (the target fights back at you: you set the dog on them, it is your deed).
- `systems/throwables.js`: `explode` calls `dogs.blast`; `fires` are what dogs keep off.
- `main.js`: construction, `update` after the infected, `draw` after the people, `noise` → `onNoise`, E and C on foot.
- `systems/ai.js`: `hostile()` decides what yours treats as a threat; `knockT` puts a bitten man down.
- `systems/inventory.js`: dug caches and a dead dog's remains are containers; food items carry a `dog` row.
- `data/items.js`: `dried_meat`, `dog_collar`, `flare`; `dog` amounts on jerky and the ration. `data/gear.js` LOOT:
  `buried_cache`, `cache_rare`, `armor_cache` (what the caches hold).
- `ui/feedback.js` floaters (`!`, `WOOF`, `grrr`, `DUG UP`); `ui/hud.js` toasts and prompts; `ui/inventory.js`.
- `agent/api.js`: the commands, the save (`dogs` key) and the selftest checks.

- **WEB_WILDS** (`systems/outdoors.js`): SEEK also takes `kind: track` (a scent trail, print by print) and `kind: fetch` (a shot bird); the three-whistle SEEK with nothing buried near puts the dogs on the freshest trail; breeds carry `traits` (tracker, bird_dog) from `data/outdoors.js`.

## 7. Tuning knobs

| Knob | Where | Value | Safe range | Affects |
|---|---|---|---|---|
| DOG_TYPES.* | data/dogs.js | per type | — | each type's job |
| BREEDS.*.mods | data/dogs.js | multipliers | 0.7–1.5 | a breed's character |
| BOND.adoptAt | data/dogs.js | 15 | 10–30 | how many meals a stray takes (jerky: 3) |
| BOND.heelPerMin / saved / dug | data/dogs.js | 0.6 / 15 / 2 | — | how fast PARTNER and SOULBOUND come |
| BOND.hungryDays / hungryLoss | data/dogs.js | 2 / 3 | 1–4 / 1–6 | what neglect costs |
| WHISTLE.tapWindow / hold | data/dogs.js | 0.38 / 0.5 s | 0.25–0.5 / 0.35–0.8 | how the C key reads |
| DOG_RULES.jumpMax / leapV | data/dogs.js | 1.3 m / 5.8 | 1–1.6 / 5–7 | what a dog clears |
| DOG_RULES.pounceR / pounceCd | data/dogs.js | 1.6–3.8 m / 2.2 s | — | how often SIC leaves the ground |
| DOG_RULES.gunR / cower | data/dogs.js | 32 m / 2–3.2 s | 20–45 | how jumpy strays are |
| DOG_RULES.scentR / scentCd / scavenge | data/dogs.js | 34 m / 140 s / 6–11 s | — | how strays work the dead |
| DOG_RULES.fireR / beamR / beamNight | data/dogs.js | 4.5 m / 20 m / 0.3 | — | the fears |
| DOG_RULES.simR / drawR / maxDogs | data/dogs.js | 170 / 130 m / 32 | — | cost |
| STRAY_PACKS / LONE_STRAYS / CACHES | data/dogs.js | 4 packs, 2 loners, 6 caches | — | the island's dogs |
| GAIT.* | data/dogs.js | walk / trot / lope | — | the look of the stride |

## 8. Acceptance criteria (selftest "dogs: …")

1. A stray 20 m from a body sniffs, trots to it (within 1.8 m) and eats (`ate` ≥ 1) within 30 s, the player kept away.
2. Fed jerky three times (not yours after the first, yours after the third), a dog heels within 4 m of you for every
   sample while you run (> 5 m/s) for 6.5 s.
3. Whistled SIC at a man 14 m off, yours pounces (≥ 1) and bites (≥ 1) and he is hurt, within 8 s.
4. With a 1 m wall between it and you, yours jumps it (≥ 1 jump) and lands on your side within 8 s.
5. Whistled to seek, yours goes to a buried cache 11 m off, digs it up, and the cache is a box with loot in it.
6. A shot fired: a stray 9 m off cowers, then flees; a dog of yours at PARTNER does not cower.
7. A stray keeps off a fire lit beside it (out past its edge + 3 m within 3 s), and at night runs out of a lit car's
   beam that falls on it (within 4 s).
8. Yours shot down is downed (not dead); a bandage brings it up (saves 1); a save and load keeps it yours with its
   bond and its memory.
Also: the draw-call budget (selftest "perf budget") holds with dogs on screen (measured 75–86 by day and night, at the
closest and widest zoom, over a pack and over Rust Haven).

**Used by GADGETS-2** (`WEB_GADGETS2.md`): DOG_GEAR (vest, lamp, bark collar). `dogs.hurt` takes the vest share (`g.kit.dogSoak`), and the collar marks only what `dogs.sense` set as `d.threat`.


> **See also WEB_HORSES.md:** horses are a `quad` body of this layer (`SPECIES horse_<breed>`) with a ledger record on top (`systems/horses.js`); `fauna.js` gives them two hooks (`a.ctl`: the ledger moves it; `a.gentle`: a wild horse tolerates a slow person with feed).
