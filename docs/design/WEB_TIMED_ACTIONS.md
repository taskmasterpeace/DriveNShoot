# WEB_TIMED_ACTIONS: time, pose and noise for the things you do with your hands (2026-10-29)

Robert, 2026-10-29: "we need animations and time for doing certain things. I think searching people should take time. I think when you open a chest, that's different than searching a chest. And searching around a certain area... imagine if a character's looking down searching for something. But we need to have ladders. We need them to be able to break into stuff. Kick in doors or whatever. And use hardware to break in doors."

The behaviour is learned from the survival-sandbox genre (a held action with a bar, kneeling to loot, ducking under a half-open shutter, prying with a tool). No asset or code of any other game is used.

| File | What |
|---|---|
| `web/src/data/actions.js` | every row: ACTIONS, HURT, TOOLS, LOCK_KINDS, SLEDGE_HITS, PADLOCKS, BREAK_MARKS, CONCEAL, CONCEAL_SIZE, HIDDEN, LOOK, LADDER, LADDER_KINDS, LADDER_PLACE, ROLLUP, RING; `validateActions(rows, items, poses)` |
| `web/src/systems/actions.js` | `g.actions`: the runner, open vs search, look-around, break-ins, roll-ups, ladders, town dressing, the marks, the HUD ring, save/load |
| `web/src/systems/actposes.js` | the 13 action poses on the shared solver (`actLegs`, `actUpper`, `actArms`) |
| `web/src/agent/actions-api.js` | the `act` command and the 11 selftest checks |
| `web/src/data/items.js` | bolt cutters, sledgehammer, hammer and nails, aluminium ladder, door key, folded note |
| `web/src/data/hudlayout.js` | the `actring` row (the progress ring is a layout row the HUD editor moves) |

## 1. Overview
One system runs every interaction that takes time. Each is a row with a duration, a pose, a noise radius, rules for what stops it, and tool and skill modifiers.
Hold the interact key and it goes on. Let go and it stops; the row decides whether the progress is kept on the target.
A hit, walking off, or a hostile coming into sight cancels it. While it runs, a ring on the HUD fills and the body holds the pose on the shared solver, so the LSW bodies show it too.

Scarcity, distance, consequence: this lane makes **consequence** bite. Every second spent kneeling over a crate is a second you are not watching the street, and every loud verb tells the town where you are.

## 2. Player fantasy
You come in through the back lot with the lights off. The roll-up door is jammed half open, so you bend double and duck under it.
Inside, you open the desk and a crowbar is lying on top. You kneel and go through it properly, and four seconds later there is a door key taped under the drawer.
The office door is padlocked. A boot only rattles the chain, and the sound carries. The bolt cutters take it quietly in under two seconds.
On the way out you climb the wall ladder to the roof to look over the town. A shot knocks you off from two storeys up, and you land hurt in the alley.

## 3. Detailed rules
### 3.1 The runner
- `start(id, o)` sets the need: `row.dur × o.kindMul × factor(row)`. The factor is `(1 − mul × (attr − 5)) × deep.fx[row.fx]`.
  If the row keeps progress, a half-done target resumes where it left off (`prog` map, saved).
- `tick(dt, held)` runs once per frame. Released → `released`. A hit (the player's `sinceHit` dropped) → `damage`.
  Drifted further than `stop.move` → `moved`. A hostile within `stop.threat` m on the same floor with line of sight → `threat` (checked 4× a second).
- `per: once` fills one bar. `per: hit` repeats, and each hit does something (a kick, a sledge swing) until `onHit` says done. `per: rung` is the ladder. `per: scan` is look-around.
- A cancelled action needs the key to come up and go down again before it restarts.
- The noise is `g.noise(x, z, noise[0])` every `noise[1]` s while it runs, plus `bang` when it lands. The infected hear at 2× radius times their row's ear, and raiders, dogs and wildlife hear it too.
- Tap vs hold: a press shorter than `WINDOW.holdTap` (0.3 s) is a tap.
- `auto: true` (set from the pack, such as placing a ladder) runs without a key until it is done or something cancels it.

### 3.2 Open vs search
- Tap E at a container opens the PACK screen on it: **what is on top**.
  On the first look, `conceal(box)` decides each slot once, from the box's own seed. Guns and anything of bulk ≥ 1 L stay on top. HIDDEN items (keys, notes, rings, picks, photographs) are out of sight.
  Other small things (< 0.35 L) are hidden with the kind's `hide` chance, and mid-size things at a third of it. Hidden slots move to `box.hidden`; nothing is rolled twice.
- Hold E: `search_box` (4.0 s × the kind's `dur`) or `search_body` (6.5 s, the pat-down). When it lands, `reveal` moves everything hidden back into the slots, sets `box.searched`, and opens the PACK screen.
- Bodies (`body:*`) hide everything except the gun in the hand and a worn pack (`CONCEAL.body.hide = 1`).
- Only the world's own stock hides (`concealable`): a box rolled from its loot table on that first look, a body, or a crate the world stocked (`box.stocked`). What a person put in a box (your husk, a deck locker, a trunk, a ground pile) always shows, and those just open on a tap, as before.

### 3.3 Look around
- Hold E with nothing else in reach: head down, scanning (`lookdown`). Finds come nearest first within `LOOK.radius` (5 m, plus 0.35 m per Eye point over 5).
  Each find takes `base + perM × distance` s (0.8 + 0.45 × d). At most 6 finds per look.
- Only what is really there is found. The finds are **unseen ground piles** (`box.unseen`): not drawn, not in reach, not picked up, until someone looks.
  They come from `dropSmall` (a world placement), and each live town seeds up to 6 (pistol rounds, a key, a note, shells, a cell, a bandage). Each is seeded once by the town's id; once found or taken it is in `lostDone` and never seeded again.
  Tracks are reported when THE WILDS exposes `outdoors.tracksNear`.

### 3.4 Break-ins
- E at a door hands it to `doorKey`. On an unlocked door, a tap kicks it open (as before).
  On a locked one, a tap is one kick (`kickOnce`) and a hold runs the best verb you have for its lock kind, quietest first (`LOCK_KINDS`). `prefer` (the agent's `verb=`) goes first.
- `door`: pick (lockpicks, 2.6 s × lockMul, near silent), pry (crowbar, 1.3 s, noise 8 while working, bang 18, bursts it open), sledge (2–3 swings of 0.9 s, bang 36 each, takes it off its hinges), kick (0.6 s per kick, bang 30).
- `padlock` (`door.padlock`): cut (bolt cutters 1.6 s, quiet), pick (×1.2), sledge. **A boot never opens it**: the `interiors.kick` hook thuds, is heard at 60% of a kick, and leaves the kicks untouched.
- `bay` (a padlocked roll-up): cut / pick / sledge.
- Kicks are strength-based. Each Brawn point over 5 is a 10% chance a kick takes two out of the door. A boot on a locked door can turn an ankle: 7% per kick, −1.2% per Brawn point, 4 hp.
- Tools wear: `slot.wear` climbs by the row's `wear` (crowbar 0.05, cutters 0.08, sledge 0.04). At 1 the tool breaks and is gone. Picks keep their own `uses`.
- **Every break-in leaves a mark** (`BREAK_MARKS`, saved by door id). The marks come from the `doorUnlocked` event, so any hand on any path leaves one, including an agent's kick or an Echo's.
  Picked: a scratched keyway. Kicked: a splintered frame and a boot print. Pried: a gouged jamb. Cut: chain on the ground. Sledged: the leaf lies on the floor inside and the door is broken for good (`materials.brokenDoors`).
- Padlocks: a locked back-lot gate is padlocked with chance 0.6 (seeded by its id), drawn as a chain bar and a lock.

### 3.5 Roll-ups and ladders
- **Jammed roll-ups**: 30% of a town's unlocked bays are stuck half up (seeded by the bay's id). They stay a wall to a car, and the panel is drawn with a 0.95 m gap.
  A tap says it's jammed. A hold ducks you under (`duck_under`, 1.1 s, bent double): the action carries you from 1.1 m out on your side to 1.1 m out on the other. An agent's ad-hoc stamp is left alone (the citygen audit drives a car through every bay of its own test town).
- **Ladders** are world pieces `{ kind, x, z, nx, nz, y0, y1, tx, tz, retracted }`:
  - `wall`: on one-storey buildings with a roof you can stand on.
  - `dropdown`: the fire-escape ladder on taller ones. It is drawn up 1.6 m: hold E below to jump and pull it down (bang 9), or tap E at the top to kick it down.
  - `portable`: carried as an item and set against a wall from the pack (2 s, a roof within 4.8 m). Hold E at its foot to take it back.
  - `hatch`: rows only.
- Placement: `LADDER_PLACE`. 45% of the listed kinds (shops, warehouses, motels…) and 15% of the rest, on a side wall that is not the front, the escape or the stair core, with clear ground at its foot.
- Climbing: tap E at the foot (or the top). Then the key toward the wall (or W on an east-west ladder) climbs one rung (0.3 m) per 0.28 s (Quickness speeds it), each rung heard at 3 m. The key away climbs down.
  At the top you step over the parapet onto the roof deck (the storeys law holds you there). E at the bottom two rungs steps off.
- While climbing, `busyBody` is the whole player update: no walking and **no gun** (the trigger is counted as blocked).
- A hit knocks you off: down at the foot, on the floor for 1.2 s, and 9 hp per metre fallen past 2.2 m.

### 3.6 The poses (`systems/actposes.js`, on the shared solver)
`kneel` (left foot ahead, right knee down, hips 0.5 m, rummaging hands), `patdown` (the kneel, both hands patting and sweeping), `lookdown` (a 0.75 rad head bow, a slow torso sweep), `kick` (the boot driven out level), `pick` (deep crouch, hands together at the lock), `pry` (wide stance, heaving), `cut` (jaws squeezing), `sledge` (overhead to the door), `duck` (bent double, head up), `climb` (feet on alternate rungs, hands above the head), `reach`, `work`, `board`.
The characters.js hook is four lines: legs, upper body, head pitch, and an `act` arm mode. The gun is put away while the hands are busy.

## 4. Formulas (with an example)
- `need = dur × kindMul × max(0.5, 1 − mul × (attr − 5)) × fx`.
  Example: searching a dresser (dur 1.0) with Eye 7 is `4.0 × 1.0 × (1 − 0.05 × 2) = 3.6 s`. Picking a lock with Wits 7 and Quickness 5 (lockMul 0.9) is `2.6 × 0.9 = 2.34 s`.
- Look-around find time: `(0.8 + 0.45 d) × factor`. A key 3 m away with Eye 5 takes 2.15 s.
- Climb time: `rungs × 0.28 × factor`, with `rungs = round(h / 0.3)`. A 3.6 m roof is 12 rungs, 3.4 s.
- Fall damage: `max(0, h − 2.2) × 9`. Knocked off at 5 m, that is 25 hp.
- Kick hurt chance: `max(0.01, 0.07 − 0.012 (Brawn − 5))`.

## 5. Edge cases
- Letting go keeps a crate half searched. Walking back and holding again resumes it, but a pick's pins drop (pick keeps nothing).
- A threat already in sight when you start cancels at once. The row's `threat: 0` (kick, sledge, climb, duck) never cancels for a threat.
- The E chain that no longer reaches a target (walked off, a menu opened) lets it go next frame (`update`).
- A body box created with contents already in it (from rites or residents) is concealed the same way on first look; the split is per slot, by seed.
- Searching straight away, without opening first, rolls the box and reveals everything when it lands.
- A padlocked door that is unlocked by staging keeps `padlock` but it only matters while it is locked.
- A save keeps the marks, half-done searches, every box's searched or concealed state with its hidden slots, the ladders you set, the drop-downs pulled down, and the found lost things.
- A town released drops its ladders. Its unseen lost things go too, but are seeded again when it returns unless found or taken.

## 6. Dependencies (both ways) and the shared-file hooks
- Reads: `data/items.js` ITEMS, `data/interiors.js` WINDOW.holdTap, `g.deep` (attrs, fx), `g.interiors` (kick/unlock/setLocked/byId/ringOpen), `g.inventory` (open/place/add/take/stow/forceLock), `g.citygen` (live towns, setBay, place, mesh), `g.storeys.at`, `g.statics.lineOfSight`, `g.nav.foot`, `g.zombies.onNoise` via `g.noise`, `g.combat.damage`.
- Hooks in shared files, each minimal:
  - `systems/characters.js`: the actposes import, one `_AU` scratch object, `actLegs` after the prone legs, `actUpper` after the prone lean, the head pitch term, `mode = 'act'` and its case, and `act` among the two-hand grips.
  - `systems/interiors.js`: the padlock guard in `kick()`, and `playerInteract` hands a door to `g.actions.doorKey`.
  - `systems/inventory.js`: `nearest`, `groundAt` and `drawPiles` skip `unseen` piles; `act('place_ladder')`.
  - `systems/citygen.js`: the ROLLUP import, `place()` draws a jammed panel with its gap, and `bayInteract` asks `g.actions.bayKey` first.
  - `ui/inventory.js`: `pickOther` opens with `g.actions.openTop`.
  - `main.js`: import and construct, `busyBody` after the vault line, `ladderKey` before the doors in the E chain, the box prompt goes to `boxKey`, the empty E goes to `lookKey`, the old box tap line is removed, and `actions.update` after `updatePlayer`.
  - `agent/api.js`: import, the `act` command, `actionsChecks` after the kit checks, and `actions` in save and load.
  - `data/hudlayout.js`: the `actring` row. `data/items.js`: six item rows.
- For other lanes:
  - **CASINOS**: a safe is a lock kind row plus a `runLock`-style target. Use `g.actions.start('pick'|'pry'|'cut'|'sledge', { key, target, onDone })` from a held key, or add `LOCK_KINDS.safe`.
  - **GUNFIRE-REACT**: actions cancel on a hit (`sinceHit`) and on a hostile in sight. A gunshot near you is a threat only if the shooter is hostile and in sight.
  - **ZOMBIES**: every verb is heard through `g.noise`.
  - **UI-EDITOR**: `actring` is a row.
  - **LSW-BODIES**: the poses come through the same joints.

## 7. Tuning knobs (safe ranges)
| Knob | Default | Safe range | Effect |
|---|---|---|---|
| `ACTIONS.*.dur` | see table | 0.3–12 s | how long it takes |
| `ACTIONS.*.noise` | [r, every] | r 0–40 m, every 0.4–3 s | heard while working |
| `ACTIONS.*.bang` | 0–36 | 0–60 m | heard when it lands |
| `ACTIONS.*.stop.threat` | 10–12 | 0–25 m | how near a hostile cancels it |
| `ACTIONS.*.mul` | 0.03–0.06 | 0–0.1 | attribute speed-up per point |
| `CONCEAL.*.hide` | 0.3–0.6, body 1 | 0–1 | what only a search finds |
| `LOOK.radius`, `base`, `perM` | 5 m, 0.8 s, 0.45 s/m | 3–10, 0.3–2, 0.2–1 | look-around reach and pace |
| `LADDER.rung`, climb `dur` | 0.3 m, 0.28 s | 0.25–0.35, 0.18–0.5 | climb speed |
| `LADDER.fall` | safe 2.2 m, 9 hp/m | 1.5–3.5, 5–15 | the price of being shot off |
| `LADDER_PLACE.wallShare / anyShare` | 0.45 / 0.15 | 0–1 | how many buildings wear a ladder |
| `ROLLUP.jammed`, `gap` | 0.3, 0.95 m | 0–0.6, 0.8–1.2 | jammed roll-ups |
| `PADLOCKS.gate` | 0.6 | 0–1 | padlocked locked gates |
| `HURT.kick` | 7%, 4 hp | 0–20%, 0–10 | kicking costs |

## 8. Acceptance criteria (the selftest checks in `agent/actions-api.js`)
| # | Check | Proves |
|---|---|---|
| 1 | rows check | `validateActions`: every row in range, tools are items, poses exist, no boot on a padlock, no purple |
| 2 | open vs search | a tap opens at once with the crowbar on top and no key; holding E for the row's seconds (kneeling, the ring up) finds the hidden key |
| 3 | body vs crate | searching a body takes longer than searching a crate; opening takes no time; the pat-down pose |
| 4 | damage cancels | a hit stops a search: hidden still hidden, progress kept |
| 5 | kick vs pick | the pick (≤ 1.5 m) never reaches a zombie standing out of sight; the kick (30 m) does, and is louder |
| 6 | cutters vs padlock | four kicks leave a padlocked door locked with its kicks untouched; cutters take it in the row's time, wear, and leave a cut-chain mark |
| 7 | look-around | an unseen key in the radius is found (and was not in reach before); one outside it stays unseen; head-down pose |
| 8 | climb | a citygen building's drawn-up fire-escape ladder pulled down from below (held E), then climbed rung by rung on the held key with the trigger held: on the roof, every rung, no round fired |
| 9 | duck under | a jammed bay crossed bent double; it stays a wall to cars |
| 10 | knocked off | a hit on a climber drops them at the foot, knocked down, hurt past the safe height |
| 11 | portable ladder | set from the pack in ≥ 1.5 s without a key, climbed to a one-storey roof, draw calls < 150 |

Screenshots (game camera): `docs/renders/web/timed-actions/`.

## Not done / follow-ups
- The new tools (bolt cutters, sledge, hammer and nails, ladder) are in no loot table yet. Adding rows to the existing tables would reseed every container's roll, so it is a content call: a hardware-store table, or trader stock.
- Boarding a doorway is the existing door-barricade gadget's (`systems/gadgets.js`). The `board_door` row is ready for when it moves onto the runner.
- NPCs (crew, raiders) don't use the runner yet. The poses and rows are person-agnostic (`ch.act`), so an NPC search is `ch.act = { pose: 'patdown', … }` plus the same rows.
- Roof hatches are rows only, and the fire escapes citygen builds are full stairs. The drop-down ladder stands in for the fire escape's last flight on 2+ storey buildings.
- A tool can't be chosen at the door from the keyboard (the quietest one is used, and the agent passes `verb=`). A cycle key needs a free binding.
