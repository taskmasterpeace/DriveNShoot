# WEB_DOOR_POUND — the shut door, and the sprinter beating on it

**Status:** BUILT 2026-11-12 on `feat/web-zed-pound` (stacked on `feat/web-zed-wallreach`).
**Code:** the door rules are in `web/src/systems/interiors.js` (`isShut`, `shutDoor`, `openDoorNear`, `brace`, `pound`,
`shudder`, `doorHp`); the infected's side is `web/src/systems/zombies.js` (`work`, `thump`, `blocker`, `near`); the
player's keys are `web/src/main.js` (shut) and `web/src/systems/actions.js doorKey` (lean); the shared rows travel in
`web/src/net/shard.js` (`leafKeys`, `mergeLeaves`, `heardPounds`) and `web/server/shard.mjs`. Rows: `DOOR` in
`web/src/data/interiors.js`, `sprinter.frenzy` in `web/src/data/infected.js`. Sounds: `web/tools/audio-make.mjs`
(`SOUNDS-MADE.md`). Agent surface: `web/src/agent/pound-api.js` (the `pound` command and six named checks).
**Builds on:** `WEB_ZOMBIES.md` §3.3 (thumping a locked or barricaded door), `WEB_MATERIALS.md` (a door's hp and how it
breaks), `WEB_GADGETS.md` (barricades), `WEB_REACH.md` (a shut door stops a hand as well).
**Source of the ask:** Robert's playtest, 2026-11-12: "I want you to improve the zombies, bro. Remember, we got three
different types of zombie: … the sprinters, that's beating on your door."

## 1. Overview
Before this, a door stopped the infected only if it was LOCKED. Any other door swung open for whoever walked into it,
the infected included, so running indoors bought nothing and nobody ever beat on your door. There was also no way to
shut a door behind you: a leaf stayed at whatever angle it was pushed to.

Now:
- **The infected cannot work a latch.** A door that is shut holds them, locked or not, until they beat it off its
  hinges. The living still push it open by walking into it.
- **You can pull a door shut** (E at an open door). With the infected within 24 m it is the first thing E does.
- **They beat on it.** A shambler thumps. A **sprinter** in its burst hits the door at a run (a slam), then pounds it in
  a frenzy, more than three times as hard. The leaf shudders with every blow, splits at half its hp and comes off its
  hinges at zero. Every blow is a noise the others hear and walk to.
- **You can hold it.** Hold E against a door being beaten and each blow does 0.45 of its damage. Planks, a wedge or the
  room's furniture (the barricades that already existed) are beaten first.
- **Steel holds.** A steel door never breaks to fists; it only shudders and rings.
- **They give up.** Once you are out of its senses a sprinter spends its burst, stops, searches and forgets.
- **Other players see and hear it.** A door somebody shut, how much its leaf has left, a door off its hinges and each
  blow are shared through the shard.

## 2. Player fantasy
You sprint for the house with one of them screaming behind you, get through the door, turn and slam it. A second later
the whole leaf jumps in its frame. Then it is fists, fast and uneven, and the HUD says how much door you have left. You
put your shoulder to it and the number falls slower. You know the sound is carrying, and that the ones down the street
are turning their heads. Either you find planks, or a back window, or you are standing there when it splits.

## 3. Detailed rules
### 3.1 Shut
- A door is **shut** when every leaf is within `DOOR.shutAngle` (0.14 rad, 8°) of closed and it is on its hinges
  (`interiors.isShut`). A door built closed is shut. A door ajar is not.
- To one of the infected (faction `zombie`, not a wild creature) a shut door is a wall (`leafCircle`). To everyone else
  it swings as before.
- **Pulling it shut:** E at an open, unlocked door within `DOOR.shutReach` (2 m) with a clear hand's line
  (`openDoorNear`, WEB_REACH). The leaves go to closed at once, with the latch sound and a 7 m noise.
  - Refused while a body stands within `DOOR.shutClear` (0.5 m) of the closed leaf's line: "someone is in the doorway",
    or "one of them is in the doorway".
  - **E's order:** with one of the infected within 24 m (`zombies.near`), an open door in reach is E's before a crate, a
    bed, a carcass or a roadside spot. Otherwise it comes after all of them. A person to talk to, a car, a dog and a
    shut door's own prompt always come first.
- A door somebody shut is remembered as theirs (`door.shutBy`) for sharing (§3.6).

### 3.2 Beating on it
- One of the infected pressed at a shut door with something still remembered past it works that door at once (the
  door's own collision sets `zdoor`; before, it had to be stuck for a sense tick). One that remembers nothing does not
  (Zomboid's "environmental attacks" rule, WEB_ZOMBIES §3.3, unchanged). It must be within 2.6 m of the door to beat it.
- **A blow** (`zombies.thump` → `interiors.pound` for a shut door; a locked door's lock is beaten as before):
  - takes `dmg` off the leaf's hp, which is the materials system's door record (`materials.hitDoor`, cause `pound`);
  - the leaf **shudders** for `DOOR.shake` s (drawn only: the leaf jumps up to `DOOR.shakeAngle` in its frame);
  - plays a fist-on-wood or fist-on-steel take, throws splinters and a puff of dust off the frame, and shakes the screen a
    little if you are within 9 m;
  - is a noise of `DOOR.poundNoise` (16 m), or `DOOR.frenzyNoise` (26 m) for a frenzy blow or a slam;
  - the first blow on a door within 26 m of you toasts "SOMETHING IS BEATING ON THE DOOR", or "A SPRINTER IS POUNDING
    ON THE DOOR".
- **By breed** (rows):

| | every | dmg | per second | a 1 m wooden door (135 hp) alone |
|---|---|---|---|---|
| Shambler (`door`) | 2.2 s | 6 | 2.7 | 50 s |
| Sprinter out of its burst (the shambler's row) | 2.2 s | 6 | 2.7 | 50 s |
| Sprinter in its burst (`frenzy`) | 0.42 s ±20% | 7 | 16.7 | a 30 slam, then 6.3 s |
| Echo (`door`) | 1.4 s | 26 | 18.6 | 7.3 s (it only works unobserved) |

- **The slam:** as a bursting sprinter reaches the door it throws its whole body at it once for `frenzy.slam` (30), with
  a snarl. It slams again only if it left that door for `frenzy.slamCool` (4 s).
- **Its own noise is not news to it.** The infected already beating a door do not hear that door's pounding as a new
  sound: it never renews their memory or sets a sprinter off again. Everyone else in earshot does hear it.
- **Cracked:** at `DOOR.crackAt` (half) of its hp a breakable leaf splits: a crack sound, and the leaf is drawn darker.
- **Down:** at 0 the materials system takes it off its hinges for good (debris, a 30 m noise, the break sound).
  `doorBrokenDown` is emitted. A broken door can never be shut again.
- **Steel:** the steel material does not break (`MATERIALS.steel.breaks` is false). A steel door shudders and rings,
  and holds.

### 3.3 Holding it
- At a shut door that was beaten within `DOOR.underAttack` (4 s), within `DOOR.braceReach` (1.5 m): **hold E** leans on
  it (`interiors.brace`). While leaned on, each blow does `DOOR.braceMul` (0.45) of its damage, to the leaf or to the
  lock. A tap still kicks the door open.
- The prompt reads `LEANING ON THE DOOR · 62% left`, or `steel: it will hold`.
- **Barricades** (WEB_GADGETS, unchanged): a wedge (+25), planks (+300) or furniture (+420) lock the door and are added
  to the lock's hp, which is beaten before the leaf matters. A frenzy takes a planked wooden door (370) in 22 s.

### 3.4 Giving up
- A sprinter's burst lasts while it perceives you. Behind a door that is smell (4.5 m) or your footsteps.
- Out of its senses: the burst runs out in `burst` (6 s), it overheats for 3 s, and then it thumps at a shambler's pace
  for as long as its memory of you is fresh (`memory + search`, 44 s). Then it forgets and wanders off.

### 3.5 Sound
Made for this with the ElevenLabs sound-effects API (`tools/audio-make.mjs`, 50 takes, 485 KB, listed with their
prompts in `web/SOUNDS-MADE.md`; raw takes on the NAS at `N:\\assets\\audio\\made\\dsoa`):

| Kind | Takes | Played when |
|---|---|---|
| `common/door.pound.wood`, `.metal` | 5, 4 | every blow |
| `common/door.frenzy.wood`, `.metal` | 3, 2 | a frenzy heard from another player's page |
| `common/door.crack` | 3 | the leaf splits |
| `common/door.break` | 3 | it comes off its hinges |
| `common/door.shut` | 3 | you pull it shut |
| `sprinter/scream` | 5 | the wind-up before the charge |
| `sprinter/chase` | 4 | every 1.3–2.2 s while it runs |
| `sprinter/rage` | 3 | the slam |
| `shambler/groan`, `/notice`, `echo/murmur`, `/work` | 5, 3, 4, 3 | made and shipped; wired by the breeds slice |

Each falls back to the old synthesized thud when samples are off.

### 3.6 Multiplayer
The shard's model is that each page simulates its own surroundings and reports what it changes in the shared world.
- **Kept by the shard** (`world.leaves[doorId] = { p, s }`): `p` what the leaf has left (0 = off its hinges, which the
  shard never undoes), `s` 1 when a hand shut it. Sent once a second when it changes (`leafKeys` / `diffLeaves`).
- **On the other page** (`mergeLeaves`): a door shut over there is shut here (unless somebody stands in it), a hurt leaf
  is as hurt, a door off its hinges comes off them.
- **Relayed, not kept** (`pound: [{ d, k, n }]`): the blows struck on a door this second. The other page's door
  shudders and sounds (`heardPounds`), and reads as under attack, so they can lean on it too. Its damage arrives as `p`.
- **Not shared (the shard's present limit):** the infected themselves. Each page has its own. Two players at one door
  see the same door and hear the same pounding, but the bodies outside are each page's own. Sharing them needs one
  page (or the shard) to own each of the infected, which is the persistent-server work in `WEB_SHARD.md`.

## 4. Formulas
| Name | Formula | Variables | Example |
|---|---|---|---|
| Leaf hp | `hpM2 × width × DOOR.height` | wood hpM2 60, height 2.25 m, width 0.9–2 m | a 1 m wooden door: 135 hp |
| Blow | `took = dmg × (leaned ? braceMul : 1)` | dmg 6–30, braceMul 0.45 | a frenzy blow on a leaned door: 7 × 0.45 = 3.2 |
| Time to break | `(hp − slam) / Σ(dmg / every)` | per attacker at the door | one sprinter, wood: (135 − 30) / 16.7 = 6.3 s; leaned: 135 / (16.7 × 0.45) = 18 s less the slam's 13.5 = 16 s; three shamblers: 135 / 8.2 = 16 s |
| Planked door | `(lockHp + 300) / Σ` then the lock bursts | wood lock 70 | (70 + 300 − 30) / 16.7 = 20 s |
| Frenzy floor | `frenzy.dmg / frenzy.every > 3 × shambler.door.dmg / every` | validator | 16.7 > 8.2 |
| Noise | `r = kind = thump ? poundNoise : frenzyNoise`, heard by the infected within `r × 2 × sense.hear` | 16 / 26 m | a frenzy reaches a shambler 52 m off |

## 5. Edge cases
- **A body in the doorway:** the door will not shut. Shove or shoot them clear first.
- **A double door:** shut when both leaves are; one blow shudders both.
- **A door ajar** (more than 8° open): not shut. The infected push it open.
- **A wild creature** (the Greyborn, the hot ground's): not held by a latch (they have their own minds and do not beat
  doors); they push a door open as before.
- **The infected inside a shut house:** they stay in until they sense something past the door. A house with its doors
  shut can hold a surprise.
- **Residents and other people:** walk through a shut door as ever (it swings and stays where it stops; it is not shut
  again behind them).
- **A door you shut, then a living person opens:** it is open. The infected can walk in.
- **Kicking it open yourself** with them outside: the door flies open and they come in.
- **Leaning while the door breaks:** you are standing at the leaf when it goes; nothing extra happens to you.
- **A locked door:** its lock is beaten first, as before (now with the shudder, the made sound and the lean); when the
  lock gives the door flies open on its hinges (it is not broken).
- **Old saves:** a door's hp is in the materials save already; `shutBy` is not saved (a loaded door is shut if its
  leaves are closed).
- **Samples off or still loading:** the old synthesized thud plays.
- **A ring (streamed) door:** shut and beaten like any other; its hp record waits in the materials system while its
  building is not attached.

## 6. Dependencies
| System | What it needs from this | What this needs from it |
|---|---|---|
| `systems/zombies.js` (WEB_ZOMBIES.md §3.3) | `interiors.isShut`, `pound`, `braced`, `shudder` | `work`, `thump`, `blocker`, `near`; the `zdoor` hint |
| `systems/materials.js` (WEB_MATERIALS.md) | — | `doorRec`, `hitDoor` (cause `pound`), `breaksDoor`, `breakDoor`, its save |
| `systems/gadgets.js` (WEB_GADGETS.md) | — | barricades add to the lock's hp (unchanged) |
| `systems/actions.js` (WEB_TIMED_ACTIONS.md) | `underAttack`, `brace`, `doorHp` for the door prompt | `press` (tap or hold), `kickOnce` |
| `main.js` E chain | `openDoorNear`, `shutDoor`; `zombies.near` | the chain's order |
| `systems/reach.js` (WEB_REACH.md) | a shut door stops a hand and a word | `reach.opening` for the door you shut |
| `net/shard.js`, `server/shard.mjs` (WEB_SHARD.md) | `leafKeys`, `mergeLeaves`, `heardPounds`; `tools/shard-door-test.mjs` | the world patch (`leaves`, `pound`) |
| `data/audiosets.js`, `tools/audio-make.mjs` (WEB_SOUND.md) | — | the made manifest merged over the library's |
| `systems/ai.js` | — | `stuck` reset so a pressed body does not detour |

## 7. Tuning knobs
| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `DOOR.shutAngle` | 0.14 rad | 0.05–0.4 (under `nearClosed` 0.45) | How closed counts as shut |
| `DOOR.shutReach` | 2.0 m | 1.5–2.6 | How close you stand to pull it shut |
| `DOOR.shutClear` | 0.5 m | 0.35–0.8 | How clear the doorway must be |
| `SHUT_URGENT` (main.js) | 24 m | 12–40 | When shutting the door outranks looting |
| `DOOR.braceMul` | 0.45 | 0.25–0.8 | What your shoulder is worth |
| `DOOR.braceReach` | 1.5 m | 1.2–2 | Where you can lean from |
| `DOOR.crackAt` | 0.5 | 0.3–0.7 | When the leaf splits (the warning) |
| `DOOR.shake` / `shakeAngle` | 0.32 s / 0.07 rad | 0.15–0.6 / 0.03–0.12 | How hard a blow reads |
| `DOOR.poundNoise` / `frenzyNoise` | 16 / 26 m | 10–30 / 16–45 | How far the pounding pulls others |
| `sprinter.frenzy.every` / `dmg` | 0.42 s / 7 | 0.2–1.5 / 1–40, and over 3× a shambler | How long a door lasts against one |
| `sprinter.frenzy.slam` / `slamCool` | 30 / 4 s | 0–120 / 1–30 | The first hit |
| wood `hpM2` (data/materials.js) | 60 | 40–120 | Every wooden door and wall in the game |

## 8. Acceptance criteria (selftest, `node tools/dl.mjs selftest only="door pound:"`)
1. **Rows:** `validateInfected` is clean, and a frenzy no harder than a shambler is caught.
2. **The latch:** through an open door a shambler told of you walks in. With one of them 12 m out, E at the open door
   reads "Shut the door" and shuts it (`shutBy` is you). The same shambler then never crosses the door line; within 40 s
   it has struck at least 4 blows, the leaf has shuddered, its hp has fallen and at least 3 `doorPound` events fired.
3. **A sprinter at the door:** it screams, slams, strikes at least 4 frenzy blows and has a wooden door off its hinges
   and is through in under 15 s. Leaning on the door (E held) it takes at least 1.5× as long. Barred with planks, at
   least 2× as long.
4. **The noise draws more:** a shambler resting 24 m off that remembers nothing gets a `sound` memory within 12 s of the
   pounding starting and closes at least 6 m on the door.
5. **It gives up:** a steel door loses no hp and does not break. With you 150 m away, within
   `burst + overheat + memory + search + 25` s the sprinter is no longer at the door and remembers nothing; the door is
   still shut.
6. **Shared:** a shut and hurt door appears in `leafKeys` as `hp|1`; `mergeLeaves` applied to the door as built shuts
   it and sets its hp; `heardPounds` makes it shudder and read as under attack; `p: 0` takes it off its hinges; a
   materials save and load keep the hurt leaf's hp.

Two players: `node tools/shard-door-test.mjs` (a real shard and two game pages; 9/9 on 2026-11-12): a door B pulls shut
and something beats on is shut, as hurt (149 of 189) and heard on A; beaten off its hinges on B it is off them on A; the
shard keeps `p: 0`, and a later patch cannot put it back. The same steps are section 9 of the long two-client proof
(`tools/shard-test.mjs`), which on this base stops earlier at its house-claim step (its page A now starts in Florida).

Before / after: `docs/renders/web/door-pound/zed-pound-before.jpg` (the infected walk through a closed door in 2 s),
`zed-pound-after-1-pounding.jpg` (a sprinter and a shambler beating the shut door, 83 of 189 left) and
`zed-pound-after-2-door-down.jpg` (off its hinges, all three inside).
