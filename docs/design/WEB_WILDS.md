# WEB_WILDS: living off the land - birds out of the sky, tracks, fishing, foraging, trapping, the camp, outdoor skills

**Status:** BUILT 2026-10-27 on `feat/web-wilds` (the WILDS + SURVIVAL SKILLS lane, harness :3407). Rows:
`web/src/data/outdoors.js` (BIRDS + BIRD_HABITATS, the extra butcher yields, TRACK_KINDS, TRACK_OF, GROUND_HOLD, TRACKS,
FISH, FISH_TRASH, FISHING, FORAGE, FORAGING, TRAPPING, CAMP, OUTDOOR_SKILLS, OUTDOOR_XP, OUTDOOR_PER_LEVEL, TALENTS, FX0,
DOG_TRAITS, DOG_TRAIL, OUTDOOR_ITEMS; `FAUNA_RULES.wingLag`). Code: `web/src/systems/outdoors.js` (one class, made and
stepped by `systems/wilds.js`, on the game as `g.outdoors`), plus small hooks listed in §6. Agent commands `track`,
`hunt`, `fish`, `forage`, `trap`, `camp`, `outdoors` (`web/src/agent/outdoors-api.js`; `butcher` and `cook` stay in
`faunatools.js`); selftest "wilds: ..." (13, `web/src/agent/outdoors-selftest.js`); scenario `wilds-day`. Renders:
`docs/renders/web/wilds/`. Builds on WEB_FAUNA (the animals), WEB_DOGS (SEEK), WEB_SURVIVAL (food, water, sickness),
WEB_RIVERS (THE water authority), WEB_INVENTORY (items, spoilage).

## 1. Overview

Robert, 2026-10-27: *"Make sure we have the place, skills, talents, animals, tracking, fishing, dogs, being able to
shoot the birds, because remember, where your mouse is, is where I think you should be aiming."* *"You should be able
to live in a city or outside of a city."*

The wilds are a second way to live. A town feeds you through trade; the land feeds you through skill. Everything here is
rows over one system:

- **Birds out of the sky.** Crows and doves feed on open ground, ducks and geese rest at the water's edge, vultures
  circle the dead. The cursor on a bird in flight aims at the bird *at its height* (`fauna.skyAim`: the mouse ray, not
  the ground under it), the round rises to meet it (`fauna.skyShot` -> one `slope` through `combat.hitscan`), and a bird
  hit falls and lies as a carcass to butcher (feathers, a little meat). A bird on the wing has moved on by the time the
  shot goes (`wingLag`): a rifle bullet misses a fast bird, buckshot catches it - shotguns are the bird gun.
- **THE QUIET.** A flock lifts as one at a gunshot or a threat and settles again further off; birds going up near you
  that you did not put up get a toast ("SOMETHING IS COMING") and a `theQuiet` event. Animals flee before you see why.
- **Tracks.** Every mover leaves sign - boots, paws, hooves, a belly drag, a snake's wave, bird feet, tyres - and every
  wounded thing leaves blood. One pooled ring of 640 records, drawn as **one** instanced decal mesh. What you can read is
  your TRACKING level against the sign's age, the ground (sand and mud hold, rock and pavement barely) and the rain.
  The decals (WEB_ZOMBIES.md §3.8, 2026-10-28) are shapes from a four-cell print atlas: a boot sole, a scuff, a drag
  and a splat. They MULTIPLY the ground, so a print can only darken it, and an old print fades toward white (away),
  never pale. Boots and tyres alternate left and right. The infected leave their own kinds: `scuff`, a crawler's
  `drag`, the wounded's `smear`. Blood kinds carry `blood: true`.
- **Fishing.** A rod, a hook and bait; cast at water (the water authority says river, lake, creek, canal, swamp or sea),
  wait for the bite, strike inside the window. Fish by water and region; now and then a boot. Fish traps and gill nets
  fill on the game clock.
- **Foraging.** Crouch and search: what the biome grows (cactus fruit, mesquite pods, yucca root, cattail, sage,
  creosote, willow bark, puffballs - and pale caps that poison you), grubs for bait, deadwood for a fire. Patches thin
  and grow back.
- **Trapping.** Snares on game trails fill on the game clock while you are away.
- **The camp kit.** A fire pit (a real fire: cook on it), a drying rack (raw meat to dried meat over hours), a rain
  catcher (water in the rain). With a bedroll (WEB_SURVIVAL) a player can live out here on hunting, fishing and
  foraging alone.
- **Dogs.** Any dog of yours can be put on a trail (SEEK with nothing buried near, or `track dog=true`) and follows it
  print by print to its end; a tracker breed (bloodhound, shepherd, coyote-cross) smells further and older; a bird dog
  (pointer, lab) flushes ground birds as it ranges and fetches what you shoot down.
- **Hunted by sign.** A hunter who loses sight of you, or a skip tracer told to, works YOUR prints (`c.trailing`).
  The Pathfinder talent makes your own sign fade fast.
- **Eight outdoor skills** (TRACKING, HUNTING, FISHING, FORAGING, TRAPPING, ANIMAL HANDLING, COOKING, OUTDOORSMAN) are
  rows in the skills table (they grow by doing, like STRENGTH), each with three talents at levels 3, 6 and 9 that move a
  number you can measure (24 talents, `outdoors talents=true`).

## 2. Player fantasy

You leave Rust Haven with a satchel, a knife, a sawn-off and a coil of wire. At dawn the crows go up off the flats all
at once, and you crouch, because you did not put them up. By the water you read the mud: *"Mule deer x2 · hoof prints ·
40 min · heading NE · one bleeding."* Somebody else shot at it. You follow the blood. At noon a duck comes over low and
the second barrel drops it in the reeds; your pointer brings it back. The line goes in off the old dock and a catfish
comes out. The fire pit takes three deadwood; the duck goes on it, the rest of the venison on the rack. You set two
snares where the rabbits run. Tomorrow you will check them - unless the man whose boot prints you crossed at the wash
has found yours first.

## 3. Detailed rules

### 3.1 Birds and the aim
- Bird rows (`BIRDS`) are fauna SPECIES rows (form `bird`): `ground: true` birds perch in the open; `wader: true` birds
  keep to a bank. Their HABITAT rows put water birds `near: 'water'` only.
- The aim: main.js meets the mouse ray with the ground as before, then `fauna.skyAim(ray, g.aim)`: the nearest flying bird
  (alt > 2.2 m) whose distance from the ray is under `0.7 + span x 0.5` m takes the aim (x, z, and `y` = its altitude).
  Agents set `aimOverride = { x, z, y }` (the `hunt shoot=` command does).
- The shot: `combat.fire` asks `fauna.skyShot(ch)` for the player: the heading to the aim point minus the bird's
  velocity x `wingLag` x (1 - 0.06 x HUNTING, floor 0.3), and the rise `slope = (aim.y - 1.45 - floor) / planar distance`.
  Each pellet gets its own rise spread (the weapon's spread, the same as its sideways spread).
- `fauna.raycast(..., slope)`: a flying bird is hit where the round's height `1.45 + slope x t` is within
  `0.35 + span x 0.3` m of its altitude and the planar ray passes within `0.3 + span x 0.3` m. A round aimed up passes
  over people, cars, dogs and ground animals once it is past 2.6 m (`combat.hitscan` `over`). With no bird under the
  cursor `slope` is 0 and every shot behaves exactly as before.
- A bird killed in the air falls (gravity 13 m/s², drawn falling) and lies as a carcass; `birdLanded` fires when it
  touches down; a fetching dog goes for it.

### 3.2 Tracks
- Deposit (every 0.2 s): the player, people within 160 m (the infected as `infected`), dogs, live fauna (not birds in
  the air, swarms or stilts), moving vehicles. A print every `every` metres of travel (boot 1.5, hoof 1.8, tyre 3...),
  laid with its heading. Blood every 2 m while an animal is under 70% hp, a person bleeds, or a dog is down or under half.
  A jump of more than 25 m (a teleport, a ride) lays nothing.
- A print stores x, z, heading, game hour, kind, maker id, species, and its **hold** (the ground's `GROUND_HOLD` x the
  maker's own life multiplier: the Pathfinder's 0.4).
- Visible to a reader of level L if `age <= min(lifeH, (ageH + perLevelH x L + talentH) x base x bloodK) x hold x rainK`.
- Reading (`read`): prints within the radius that the reader can see, grouped by maker then by species: what, how many
  (Count-the-feet; "one"/"more than one" before it), freshest and oldest age, heading (the mean of each maker's newest
  print, as a compass point; +z is south), and blood (Read-the-blood says how many are bleeding).
- Drawn: the newest visible prints within 55 m of where the camera looks, faded toward the ground colour with age, at
  most 420, refreshed four times a second. One draw call.

### 3.3 Fishing
- `cast`: rod + hook + bait (grubs, raw game or fowl, a panfish, a crayfish; each its own wait factor) and water at least
  0.45 m deep 2.5-9 m ahead. The bait goes in. Wait = 5-16 s x (1 - 0.05 x FISHING) x bait x hour (dawn and dusk 0.7).
- Bite: a window of 0.65 + 0.04 x FISHING s to strike (E). Late: it gets away, 15% of the time with the hook. Early: the
  bait comes off. Moving more than 1.2 m reels in.
- Catch: trash at 12% - 0.9% a level (floor 2%); else a FISH row for the water kind and region by weight (rare rows x the
  Read-the-water talent); Two-hooks lands two 25% of the time.
- Fish traps (0.18 a game hour, hold 3) and gill nets (0.4, hold 6) set in water fill lazily when checked.

### 3.4 Foraging
- A search: 6 s standing still (x (1 - 0.03 x OUTDOORSMAN)); crouch + E in the game, `forage` for agents.
- Rows for the biome under you (and the region; `wet` rows only within 12 m of water). `rolls` tries (2, +1 Full-basket):
  each picks a row by its chance and succeeds at `min(0.95, p x 1.6 x (1 + 0.06 x FORAGING) x richness)`.
- A 48 m patch starts at richness 1, loses 0.34 a search, regrows 0.5 a game day (x2 Desert-pantry).
- Pale caps: picked unless you have Mushroom-lore; eaten, food poisoning (`poisoned` event).

### 3.5 Trapping
- A snare (snare wire) on dry ground a stride ahead; at most 4 (+2 Trapline). It fills lazily: `acc += hours x 0.06 x
  biomeGame x (1 + 0.08 x TRAPPING) x No-scent`; at acc >= 1 (or a small chance on the way) it holds one animal: a
  jackrabbit (3 in 4) or a ground bird. Checked (E at it, `trap check`): the meat and pelt into your pack (+ sinew and
  bone with Field-dressed). (The PACK screen's snare wire still sets the Greyborn-style live snare of WEB_FAUNA.)

### 3.6 The camp kit
- Fire pit: 3 deadwood (2 with Fire-starter), lit at once with 3 x 1.5 game hours of fire (x1.5 Camp-cook); each deadwood
  adds 1.5 h. It is a real entry in `throwables.fires` (cooking finds it; animals keep off it; it burns what stands in it).
- Drying rack: 4 deadwood; holds 8 raw cuts; each is dried meat after 6 game hours (x0.6 Smoke-and-salt).
- Rain catcher: a tarp; fills `1.6 L a game hour x rain (0..1.6) x Weather-eye` up to 12 L; E fills every refillable
  water container you carry (0.25 L a use).
- Built 1.5 m ahead on dry ground; at most 12 pieces; saved with the traps and the forage patches (tracks are not saved).

### 3.7 Dogs and the hunted
- `trackOrder(who)`: your dogs start at that maker's print nearest you (within 12 m) that a dog can still smell
  (`trailAgeH` 1.2 h; +3 h for a tracker; x Cold-trail). Each step: the next print in time within the dog's nose
  (9 m x tracker 1.6 x (1 + 0.05 x ANIMAL HANDLING)). No next print: the end - it points at the maker if it is there
  (alive or a carcass within 8 m), else where the scent runs out; `dogTrailEnd` fires; it waits for you or 10 s.
- SEEK (three whistles) with no cache or box near puts them on the freshest trail.
- Fetch: a bird you shot lands within 60 m of a bird dog (or any dog with the Fetch talent): it fetches it to your feet.
- A bird dog flushes ground birds within 9 m as it ranges.
- `c.trailing = <id>`: ai.js hands the character to `outdoors.trailStep` before its idle wander: every 0.6 s it takes
  the newest print of its quarry within its nose (22 m) that its own skill (`trackSkill`, 5) can read, walks to it, and
  attacks if hostile and it sees the quarry within 30 m. 25 s without sign: it gives up (`trailEnd`). A director hunter
  (`hunterOf`) that loses its target is put on your trail.

### 3.8 Skills and talents
- Eight SKILLS rows (added to `data/skills.js` at boot from `data/outdoors.js`; the stats lane owns that table's shape:
  these are rows only). XP by doing (OUTDOOR_XP): reading sign, a dog trail, a kill, a bird shot down, a butchering,
  a catch, a find, a snare set or emptied, a cut cooked, a rack emptied, a camp piece built.
- Per level (OUTDOOR_PER_LEVEL): butcher time -4%, hide chance +4 pts, bite wait -5%, strike window +0.04 s, trash
  -0.9 pts, forage chance +6%, snare rate +8%, dog nose +5%, cooked food keeps +3 game h, camp work -3%.
- Talents (TALENTS: skill, level, fx): an fx key whose default is 1 multiplies, 0 adds. `fx` is rebuilt twice a second.

## 4. Formulas

```
skyAim:      k = |(bird - rayOrigin) x rayDir|;  aim = bird if k < 0.7 + span*0.5 (nearest)
skyShot:     lag = wingLag(0.06 s) * max(0.3, 1 - 0.06*HUNTING);  target = aim - birdVelocity*lag
             slope = (aim.y - 1.45 - floor) / max(1, planar distance to target);  pellet slope += U(-1,1)*spread
hit (sky):   planar ray within 0.3 + 0.3*span  AND  |1.45 + slope*t - alt| <= 0.35 + 0.3*span
track seen:  age <= min(lifeH, (0.35 + 0.4*L + oldSignH) * base * (blood ? 1.6*bloodAgeMul : 1)) * hold * (rain ? 0.35 : 1)
fish wait:   U(5,16) * max(0.35, 1 - 0.05*FSH) * bait * hourMul;   window = 0.65 + 0.04*FSH
forage hit:  min(0.95, p * 1.6 * (1 + 0.06*FRG) * richness)
snare acc:   hours * 0.06 * biomeGame * (1 + 0.08*TRP) * noScent
dog nose:    9 * (tracker 1.6) * (owned-nose 1 | 0.7) * (1 + 0.05*ANM);  trail age 1.2 (+3 tracker) * coldTrail
```

Variables: `span` a bird's wingspan (m, 0.45 dove .. 1.75 vulture); `alt` its altitude (m, 2.2..14 when it counts as
flying); `t` the planar distance along the round (m); `L`, `HUNTING`, `FSH`, `FRG`, `TRP`, `ANM` skill levels (0..10);
`base` 0.5..1, `lifeH` 4..30 h, `hold` 0.35..1.25 (TRACK_KINDS, GROUND_HOLD); `p` a forage row's chance (0.14..0.7);
`richness` 0..1; `biomeGame` 0.25..1.2.

Worked examples:
- **Duck pass-shot.** A duck crossing at 14 m/s, alt 7 m, 9 m out; HUNTING 0: lag 0.06 s -> the pattern centres 0.84 m
  behind it. Sawn-off spread 0.2 rad: at 9 m a pellet lands within +-1.8 m sideways and +-1.8 m in height; the duck's
  window is +-0.57 m x +-0.62 m -> ~0.11 of pellets near the centre, 8 pellets ~ 50-60% a shot (the scenario sees about
  one in two). A rifle on semi (0.019 rad): +-0.17 m around a point 0.84 m behind the bird -> a miss nearly every time.
  At HUNTING 10 the lag is 0.3 x 0.06 = 0.018 s (0.25 m) and the rifle starts to connect.
- **Reading a deer line.** 1.5 h old hoof prints on desert sand (hold 1, base 0.9): level 0 sees up to
  0.35 x 0.9 = 0.32 h (nothing); level 5 sees (0.35 + 2.0) x 0.9 = 2.1 h (all of it). In rain level 5 sees 0.74 h.
- **Blood.** Level 6 with Read-the-blood (x1.5): blood (base 1, x1.6) on sand reads to (0.35 + 2.4) x 1.6 x 1.5 = 6.6 h,
  capped at its lifeH 10 h.
- **Fishing wait.** Grubs at dusk, FISHING 4: 5..16 s x 0.8 x 1 x 0.7 = 2.8..9 s; window 0.81 s.
- **Snare.** Desert (biomeGame 1), TRAPPING 0, away 12 h: acc 0.72 (no catch but a ~11% chance); 30 h: 1.8 -> a catch.
  TRAPPING 3 (No-scent 1.4, +24%): 12 h -> 1.25 -> a catch.
- **Forage.** Cactus fruit (p 0.45), FORAGING 0, a fresh patch: min(0.95, 0.72) = 72% for the try that picks it; the
  third search of one patch (richness 0.32) 23%.

## 5. Edge cases

- No bird under the cursor: `g.aim.y = 0`, `skyShot` null, `slope` 0: every existing shot path is byte-for-byte as before.
- A shot aimed at a bird past a person: the person is hit only while the round is under 2.6 m; past that it goes over.
- Upstairs (world/storeys.js): the existing `up` rule still skips animals; the sky aim adds the floor height to 1.45.
- A dead bird mid-fall is drawn where it is (the bird renderer used to pin the dead to the ground at once).
- The track pool is a ring: past 640 the oldest go first; a teleport or a ride lays no line across the map.
- Rain shortens what everyone can read (x0.35) while it rains (the weather now, not the weather then).
- Fishing: moving, dying or getting in a car reels in; a cast on a too-shallow edge says so; a dry wash has no water.
- A snare holds one animal until it is emptied; fish traps stop at their hold.
- A camp fire pit cleared out of `throwables.fires` (a test stage) is put back on the next camp tick while it has fuel.
- The skip tracer's walk is the AI's own `move`; a wall between prints it walks around as any wanderer does.
- Saves: the camp (fuel, rack slots, water), the traps (and what they hold), the forage patches. Tracks are not saved.

## 6. Dependencies (and every shared-file hook)

- **Used by CAMPS AND BASES** (`WEB_CAMPS_BASES.md`): a pitched camp's fire is `outdoors.build('firepit')`; striking it kicks the pit out (fuel 0, the ash ring stays).
| File | Hook |
|---|---|
| `systems/wilds.js` | makes `Outdoors` (g.outdoors), steps it before the glints flush, saves/loads it |
| `systems/fauna.js` | `skyAim`, `skyShot`, `raycast(..., slope)`; dead birds drawn falling; `die` -> `outdoors.onBirdDown` + hunting xp; ground flocks resettle and THE QUIET toast/event for ground birds; HUNTING in butcher time, hide chance and yields (meat, sinew, bone talents); COOKING keeps cooked food longer; Iron gut x rawSick; pale caps poison; Still hunter x the player's notice distance; Calm hand x territorial distances; `nearFor`/`interact` fall through to `outdoors`; bird voices |
| `systems/combat.js` | `fire`: `skyShot` for the player (heading + slope per pellet); `hitscan(..., slope)`: `over` cut-off for people, cars, dogs; `slope` to `fauna.raycast` |
| `main.js` | one line after the mouse meets the ground: `aim.y` from `aimOverride.y`, else `fauna.skyAim(_ray.ray, aim)` |
| `systems/inventory.js` | `act()` falls through to `outdoors.act` (rod, fish trap, net, tarp) |
| `systems/dogs.js` | SEEK `kind: 'track' | 'fetch'` answered by `outdoors.dogSeek`; the SEEK whistle with nothing buried near -> `outdoors.trackOrder()` |
| `systems/ai.js` | `if (c.trailing && g.outdoors?.trailStep(c, dt)) continue;` before the idle wander |
| `agent/api.js` | spreads `outdoorsCommands`; runs `outdoorsChecks` after the fauna checks |
| `data/skills.js`, `data/fauna.js`, `data/dogs.js`, `data/items.js` | untouched: rows are added at boot from `data/outdoors.js` (skills, species, habitats, yields, breed traits, items, loot, `FAUNA_RULES.wingLag`) |

For the camera/aim lane: the one aim hook is the `main.js` line above (`g.aim.y`). Whatever the aim-at-mouse work does
to the ground point, call `fauna.skyAim(ray, aim)` after it with the same camera ray; `combat.fire` reads `g.aim`.

## 7. Tuning knobs

All in `web/src/data/outdoors.js`: bird rows (hp, alarm, fear.gun, span), `FAUNA_RULES.wingLag`; TRACK_KINDS (`every`,
`base`, `lifeH`), GROUND_HOLD, TRACKS (`pool`, `draw`, `drawR`, `ageH`, `perLevelH`, `rainMul`, `wounded`); FISH weights
and waters, FISH_TRASH, FISHING (`biteS`, `window`, `trash`, `hookLoss`, bait factors, hour factors, trap rates);
FORAGE chances and counts, FORAGING (`seconds`, `rolls`, `take`, `regrowPerDay`); TRAPPING (`perHour`, `biomeGame`,
`maxSnares`, catch rows); CAMP (costs, hours, cap); OUTDOOR_XP; OUTDOOR_PER_LEVEL; TALENTS; DOG_TRAITS and DOG_TRAIL.

| Knob | Now | Safe range | What it moves |
|---|---|---|---|
| `FAUNA_RULES.wingLag` | 0.06 s | 0.03..0.1 | how much a shotgun beats a rifle at birds (0: rifles hit flyers as easily as standing targets; 0.1+: even buckshot misses fast ducks) |
| bird `fear.gun` / `alarm` | 90..110 / 12..22 m | 60..140 / 8..30 | how close you get before a flock lifts (THE QUIET's reach) |
| `TRACKS.ageH` / `perLevelH` | 0.35 / 0.4 h | 0.2..0.6 / 0.25..0.6 | how much sign a beginner sees / what each TRACKING level is worth |
| `TRACKS.rainMul` | 0.35 | 0.2..0.7 | how badly rain hides sign |
| `TRACKS.pool` / `draw` | 640 / 420 | 400..1500 / 200..600 | how much sign the world remembers / what is drawn (one draw call at any size; cost is the instance upload 4x a second) |
| `FISHING.biteS` | 5..16 s | 3..30 s | the pace of fishing (too long and it is a chore) |
| `FISHING.window` | 0.65 s | 0.4..1.0 | the strike's difficulty |
| `FISHING.trash` | 0.12 | 0..0.25 | boots per cast |
| `FORAGING.take` / `regrowPerDay` | 0.34 / 0.5 | 0.2..0.5 / 0.25..1 | how fast one spot runs out / comes back (moving on matters) |
| `TRAPPING.perHour` | 0.06 | 0.03..0.12 | about one snared rabbit a night (12-17 h) at 0.06 |
| `CAMP.firepit.hoursPerWood` | 1.5 h | 1..3 | how much deadwood a night at camp costs (~6 for a night) |
| `CAMP.rack.hours` | 6 h | 3..12 | a rack loaded at noon is ready by evening |
| `OUTDOOR_PER_LEVEL.*` | see §3.8 | x0.5..x1.5 | how much each level is worth against its talents |

## 8. Acceptance criteria (selftest "wilds: ...", all must pass)

1. The mouse ray on a flying vulture aims at it at its height; two shots fired flat pass under it; `hunt shoot=` with
   a sawn-off brings it down; it falls to the ground and butchers into 2+ feathers.
2. THE QUIET: six crows feeding on the ground all lift at a gunshot (`birdsScatter`) and settle again 20+ m off.
3. A rifle-wounded mule deer runs off leaving 3+ blood drops (`track follow= kind=blood`) leading away from you, and the
   ground mid-trail reads "Mule deer ... bleeding" at level 6.
4. Fishing off the island dock lands a lake fish (catfish, carp, bass, panfish) within 6 casts; the water reads `lake`;
   in the dry desert there is nothing to cast into.
5. A mule deer butchers into venison 3+, one hide, bone and sinew; at HUNTING 6 it takes under 80% of the time and gives
   venison 4+, sinew 2+, bone 2+.
6. A line of deer prints 1.2-1.5 game hours old is invisible at TRACKING 0 and reads "Mule deer, one, heading E" at 5
   (both through `track level=` and the player's own skill).
7. A bloodhound of yours put on an 18-print staged trail (`track dog=true`) follows 12+ prints and ends within 4 m of
   its last one (`dogTrailEnd`).
8. Five desert searches turn up 2+ finds, all desert rows; three more on one spot leave its patch under 5% richness.
9. All eight skills are skill rows; at level 9 the talents read Count-the-feet 1, Two-hooks 0.25, Trapline +2,
   Mushroom-lore 1, Iron-gut 0, Pathfinder 0.4, Old-sign +3 h, and bite wait < -40%.
10. A desert snare after 30 game hours gives a rabbit or bird; a fish trap off the dock after 12 gives 2+ fish.
11. A fire pit is lit (a real fire) and cooks 2 venison; a rack refuses early and gives 2 dried meat after 7 h; a rain
    catcher in RAIN holds 3+ L after 4 h and refills an empty bottle to 3 uses.
12. A skip tracer put on your trail 44 m back walks your prints to within 8 m of where you stand.
13. 400 tracks + a goose flock aloft + a camp and a snare on screen: tracks drawn 300-420 in one instanced mesh, the frame
    under 150 draw calls.

Scenario `wilds-day` (`node tools/dl.mjs scenario name=wilds-day`): a day on the island lake's west bank - forage,
a snare, a duck pass-shot (about one in two), butchered, fishing off the dock, a fire pit and cooking, a rack, an
evening's take, supper; the summary lists what came in, food before and after, and the xp each skill earned.

## Not done (next)

- Warmth from a camp fire (survival's cold model does not read fires yet); sleeping at your camp as a better bedroll.
- Seasons and ice (no season clock exists: "ice/none" is only "none where dry" today).
- Tracks on interior floors and storeys (prints are ground-level only), and tracks surviving a save.
- Leading a crossing bird by hand (the aim snaps to the bird; the lag is the miss model), and visual wing-shot feedback.
- A fishing UI beyond the toast and the float (a tension bar), and a visible net/trap model.
