# WEB_CALIBERS: real calibres, casings and forensics

Robert, 2026-10-29: "I think the tracer is a little too long, bro." · "There should be so many guns in the world and
different types." · "If they find a body, they know what kind of gun it came from."
Lane BALLISTICS (second pass; the flight itself is `WEB_BALLISTICS.md`). Code: `web/src/data/ballistics.js` (`ROUNDS`, one
row per calibre, `validateRounds`), `web/src/systems/combat.js` (`WEAPONS[k].cal`, the wound hook in `segment`),
`web/src/systems/forensics.js` (wounds, casings, investigators), `web/src/systems/ambient.js` (casings),
`web/src/agent/calibers-api.js` (the `calibers` and `forensics` commands, `validateCalibers`, the checks).

## 1. Overview

A round used to be keyed by the box it came out of (`pistol`, `smg`, `rifle`, `shells`). Now every round is a **real
calibre**: 9mm, .45 ACP, .357 Magnum, .22 LR, 5.56, 7.62x39, 7.62x51 (.308), .50 BMG (12.7mm), and 12 gauge as
buckshot, birdshot and slug, plus the crossbow bolt. A calibre row carries everything that round is: muzzle velocity,
drag (and so its drop), its typical damage, how hard it punches through walls, its report, the casing it drops, and its
tracer. Every gun names one (`cal`), every shotgun shell names one, and the vehicle mounts that fire bullets name one.

Seven new guns stand on the calibres: a .22 rifle, a .357 Magnum, a 7.62x39 surplus carbine, a .308 battle rifle, a
5.56 **light machine gun**, a .308 **medium machine gun** and a .50 **anti-materiel rifle**. A .50 **heavy machine gun**
mounts on a car (`MOUNT_WEAPONS.hmg`), and the two belt-fed mounts already in the workshop are .308. Each new gun is an
item with its own ammo box, and each turns up in gun shops, gun safes, armour caches and military loot.

Tracers are half as long again (the cap) **and** scale with speed: a streak is as long as the round flies in 2.2 ms, so
a .45 barely streaks (0.67 m), a 5.56 draws a needle (1.9 m), and every streak shortens as the air slows it.

Fired guns drop a casing **of their calibre**: little brass for a 9mm, grey lacquered steel for 7.62x39, a fat case
for a .50, a red, green or black hull for buck, bird or slug. A bullet wound **remembers** its calibre, the way it came
from and its range. Going through a body reads them back ("two 7.62 wounds from the north, close range"). An NPC
investigator can examine a body or the ground, and knows only what they examined (law 6).

## 2. Player Fantasy

You come over a rise and find a man face-down by his truck. You go through his pockets and see three holes: **".308,
from the west, from a distance"**. Somebody with a battle rifle sat out on that ridge. Ten metres off, in the dirt,
there's a scatter of green hulls: someone peppered his dog with birdshot first. You know the gun before you know who.

On the other side of the trigger, guns finally feel different from each other. The .22 pops and barely kicks. The
carbine chatters and the steel cases rattle on the road. The light machine gun hoses rounds that walk off target, and
the .50 slams. Its round goes **through the block wall** your 9mm only chipped and hits the man behind it.

## 3. Detailed Rules

### 3.1 The calibre is the round
- `combat.fire` resolves the gun's calibre once: `calOf(w.cal ?? w.round ?? w.ammo)`. A shotgun shell's mode carries
  its own `cal`, and `arms.row` folds it in. That calibre is the round's flight row (`systems/ballistics.js`), its
  punch through walls (`materials.punch` falls back to the row's `punch`), its report (`w.sound ?? row.sound`), its
  casing (`ambient.eject(ch, ang, cal)`) and the calibre stamped on any wound it makes.
- **`ammo` stays the pack's box.** The pack's ammo keys are unchanged (`pistol`, `smg`, `rifle`, `shells`, `birdshot`,
  `slug`), so saves, traders and loot keep working. The five new calibres have new keys (`22lr`, `357mag`, `762x39`,
  `762x51`, `50bmg`). `ROUND_OF` maps each old key to its calibre, so any caller that still asks by ammo key
  (`flightTime('pistol')`, a content pack) resolves.
- A content-pack gun (`registerWeapon`) that names a different `ammo` from its base fires that ammo's calibre. The
  example pack's nail repeater loads `smg`, so it fires 9mm.

### 3.2 Casings (pooled, depth law)
The ring of 240 instanced casings (`ambient.brass`, one draw call) now carries an instance colour and a scale per
casing. A casing rests on the real ground at `0.035 x size` (its radius), so a fat .50 case does not sink into it.
Each casing remembers `cal` and the game time `t`. `forensics.casingsNear(x, z, r)` counts the ones lying within r m
by calibre. A bolt has `casing: null` and drops nothing.

### 3.3 Wounds
`combat.segment`, on a round meeting a person, calls `forensics.wound(target, cal, dx, dz, shooter, hx, hz, round)`
before the damage. The wound stores `{ cal, fx, fz (where it came FROM), d (range), t, by }` on `c.shotBy`, at most 8
per person (oldest first). The range is how far the round has flown so far plus this segment, so a ricochet or a
round through a wall measures its real path. A hitscan round (a vehicle mount) measures from its shooter.

### 3.4 Reading a body (the player)
`inventory.open(box)` on a `body:` box calls `forensics.onSearch(box)`. The TIMED-ACTIONS lane's timed search ends in
the same `open`, so it needs no extra hook. The search report has one line per calibre: how many wounds, the way most
of them came from (8-point compass, the mean of their lines), and the range band of the closest. Bands: close range
under 3 m (powder burns), from nearby under 25 m, from a distance beyond that. Lines that disagree by more than about
70% read "from more than one way". The player sees it as a toast; it is stored per body (`forensics.found`) and goes
out as a `forensics` event.

### 3.5 Investigators (law 6)
`forensics.examine(who, body)` gives a body's report to `who`, but only if they stand within 3 m of it.
`forensics.examineScene(who, x, z, r)` gives them the casings lying within r m of where they stand. Either way the
clue goes on `who.clues` (at most 12) and a `clue` event fires. **Nobody learns anything they did not examine.** A
bystander 30 m off gets `null` and an empty clue list. The SWAT/police lane and the bounty guild hook in here: an
investigator walks to the body, calls `examine`, and reasons only from `cluesOf(themselves)`.

### 3.6 The guns

| Gun | Calibre | dmg | Rate (s) | Mag | Reach (m) | Model | Found in |
|---|---|---|---|---|---|---|---|
| .22 RIFLE `rimfire` | .22 LR | 12 | 0.30 | 10 | 50 | rifle | gunsmith, gun safe |
| .357 MAGNUM `magnum` | .357 | 46 | 0.32 | 6 | 58 | revolver | gunsmith, gun safe |
| SURPLUS CARBINE `carbine` | 7.62x39 | 29 | 0.10 | 30 | 62 | rifle | gunsmith, gun safe |
| BATTLE RIFLE `battle` | .308 | 40 | 0.14 | 20 | 85 | rifle | military |
| LIGHT MACHINE GUN `lmg` | 5.56 | 22 | 0.075 | 100 | 72 | rifle | military |
| MEDIUM MACHINE GUN `mmg` | .308 | 36 | 0.095 | 100 | 85 | rifle | armour cache |
| ANTI-MATERIEL RIFLE `amr` | .50 | 120 | 1.4 | 5 | 140 | rifle | armour cache |
| HEAVY MACHINE GUN (mount `hmg`) | .50 | 60 | 0.13 | 100 | 90 | car ring | workshop |

The existing guns map to: .45 REVOLVER .45 ACP, RUST-9 SMG and SELF-LOADER 9mm, SERVICE RIFLE 5.56, SAWN-OFF and
PUMP 12 gauge (buck, bird, slug), MACHINE GUN and TWIN MG mounts .308. New guns reuse the existing models, so they add
no draw calls.

## 4. Formulas

| | Formula | Notes |
|---|---|---|
| Streak length | `min(tracerLen, speed x streakT, flown)` | streakT 0.0022 s; tracerLen caps are half the old lengths |
| Wall | through if `dmg x punch > stop x path` | `systems/materials.js carry`; punch is the calibre's |
| Wound range | `round.flown + |hit - segment start|` | hitscan: `|shooter - hit|` |
| Wound direction | `compass(mean of -dx, mean of -dz)` | north is -z; "more than one way" if `|mean| < 0.3` |

| Calibre | v (m/s) | drag | dmg | punch | Casing | Streak at the muzzle (m) |
|---|---|---|---|---|---|---|
| .22 LR | 330 | 1.0 | 12 | 0.45 | 0.4, brass | none (tracerEvery 0) |
| 9mm | 380 | 0.9 | 19 | 1.0 | 0.55, brass | 0.84 |
| .45 ACP | 305 | 0.55 | 36 | 1.0 | 0.65, brass | 0.67 |
| .357 Magnum | 440 | 0.6 | 46 | 1.4 | 0.7, brass | 0.97 |
| 5.56 | 850 | 0.64 | 24 | 1.9 | 0.85, brass | 1.87 |
| 7.62x39 | 715 | 0.75 | 30 | 2.0 | 0.85, steel | 1.57 |
| 7.62x51 (.308) | 840 | 0.5 | 38 | 2.6 | 1.0, brass | 1.85 |
| .50 BMG | 890 | 0.32 | 110 | 6.0 | 1.7, brass | 1.96 |
| 12 ga buck / bird / slug | 400 / 370 / 450 | 2.2 / 3.4 / 1.1 | 14 / 4 / 82 | 0.5 / 0.25 / 1.3 | 1.1, red / green / black hull | 0.55 / 0.3 / 0.9 |

A 9mm (19 x 1.0) stops in a concrete-block wall (stop 170). A .50 (110 x 6 = 660) goes through it with about three
quarters of its energy left.

## 5. Edge Cases

- **A mount's round.** Mounts still land at once (`round` null): their calibre drives punch and wounds, but not flight.
  Making mounts fly is a follow-up; the workshop's checks assume they land at once.
- **Saves.** `c.shotBy` and the casings are not saved. A body loaded from a save reads "no gunshot wounds", and the
  ground is clean after a load. Saving them belongs with the rites' body record when a lane needs it.
- **A pruned body.** `bodyChar` finds the character through the rites record first (`R.box === box.id`, `R.c`), then
  through `g.chars`. A body whose character is gone reads no wounds.
- **Melee, fire, blasts.** Only bullets leave a calibre. A man knifed and shot reads only the shots.
- **Revolvers eject.** For now every gun drops its casing at the shot, revolvers included (the brass check fires a
  revolver). Revolvers and the break-action keeping their brass until reload is a later realism pass.
- **Content packs.** A pack gun with no gun item (`content: true`) is exempt from the gun-item rule; it still must
  resolve to a calibre.
- **Sound.** `heavy` (the .50) is a new synth branch in `audio.gun`. A sample set may add `shot.heavy`; until then the
  synth plays.

## 6. Dependencies

- `WEB_BALLISTICS.md`: the flight and the one resolver (`combat.segment`). Calibres are its rows.
- `systems/materials.js`: `punch()` reads the calibre's punch (one line).
- `systems/inventory.js`: `open()` calls `forensics.onSearch` (one line). TIMED-ACTIONS ends its timed search in `open`.
- `systems/rites.js`: the body record (`R.c`) is how a searched box finds its character.
- `systems/outdoors.js`: `compass()`.
- SWAT/police and the bounty guild: consumers of `examine` / `examineScene` / `cluesOf` (not wired by this lane).

Shared-file hooks (each one line or one row): `main.js` (construct `Forensics`), `systems/inventory.js` (`open`),
`systems/materials.js` (`punch`), `systems/audio.js` (`heavy`), `systems/workshop.js` (mount passes its `cal`),
`systems/arms.js` (`r.cal`), `systems/ambient.js` (casing colour and size), `data/items.js`, `data/gear.js` and
`data/workshop.js` (rows), `agent/api.js` (import, command spread, checks call, `registerWeapon` calibre).

## 7. Tuning Knobs (`data/ballistics.js`)

| Knob | Now | Safe range | Effect |
|---|---|---|---|
| `BALLISTICS.streakT` | 0.0022 s | 0.001-0.004 | streak length per m/s; raise if streaks get lost at the far zoom |
| `ROUNDS[c].tracerLen` | 0.3-2.2 m | 0.2-4 | the cap; half of the second pass's lengths (`TRACER_BEFORE`) |
| `ROUNDS[c].punch` | 0.25-6 | 0.1-12 | wall penetration |
| `ROUNDS[c].dmg` | 4-110 | guns 0.5x-1.6x of it | a calibre's typical hit; a gun's row is its barrel |
| `ROUNDS[c].casing` | size 0.4-1.7 | 0.1-3 | visibility of the brass; colour per calibre |
| `forensics RANGES` | 3 / 25 m | | the close and nearby bands |

## 8. Acceptance Criteria (the named selftest checks, `agent/calibers-api.js`)

1. **calibers: every gun, shell and bullet mount resolves to a calibre row**, loads a box that exists, and the light,
   medium and heavy machine guns are there (`validateCalibers`, each gun's expected calibre, the `hmg` .50 mount).
2. **calibers: a .50 goes through a concrete-block wall that stops a 9mm**: the man behind it is hurt by the .50 only.
3. **calibers: a fired gun drops a casing of its calibre**: a carbine's steel 7.62x39, a birdshot's green hull, a .50's
   fat case. Each lands with the right colour, lies at rest, and is read back off the ground by calibre.
4. **calibers: going through a body you read its wounds**: two 7.62 wounds from the north, close range, the true
   calibre and line. An investigator who examines it knows it; a bystander who did not knows nothing (law 6).
5. **calibers: the tracer is shorter than before, measured in flight**: at most half its old length, and slow rounds
   streak shortest (a .45 under a metre, the 5.56 longest).

The `ballistics:` checks keep passing on calibre keys. Renders: `docs/renders/web/ballistics/06-calibers-tracers.jpg`
(.45, 9mm, 7.62x39, 5.56, .308 and .50 fired at once across a road, one frame later) and `07-casings.jpg` (three
casings of each calibre at the shooters' feet: .45, 9mm, steel 7.62x39, .308, .50, then red buck, green bird and
black slug hulls).
