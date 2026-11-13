# WEB_DOOR_POUND — the shut door, and the sprinter beating on it

**Status:** BUILT 2026-11-12 on `feat/web-zed-pound` (stacked on `feat/web-zed-wallreach`).
**Code:** the door rules are in `web/src/systems/interiors.js` (`isShut`, `inDoorway`, `openDoorNear`, `shutDoor`,
`brace`, `doorHp`, `pound`, `shudder`); the infected's side is `web/src/systems/zombies.js` (`through`, `blocker`,
`work`, `thump`, `near`, `onNoise`); the player's keys are `web/src/main.js` (shut) and
`web/src/systems/actions.js doorKey` (lean); the shared rows travel in `web/src/net/shard.js` (`leafKeys`, `diffLeaves`,
`mergeLeaves`, `applyLeaf`, `heardShuts`, `heardPounds`) and `web/server/shard.mjs`. Rows: `DOOR` in
`web/src/data/interiors.js`, `sprinter.frenzy` in `web/src/data/infected.js`. Sounds: `web/tools/audio-make.mjs`
(`web/SOUNDS-MADE.md`). Agent surface: `web/src/agent/pound-api.js` (the `pound` command and six named checks);
`web/tools/shard-door-test.mjs` (two pages and a real shard).
**Builds on:** `WEB_ZOMBIES.md` §3.3 (thumping a locked or barricaded door), `WEB_MATERIALS.md` (a door's hp and how it
breaks), `WEB_GADGETS.md` (barricades), `WEB_REACH.md` (a shut door stops a hand as well).
**Source of the ask:** Robert's playtest, 2026-11-12: "I want you to improve the zombies, bro. Remember, we got three
different types of zombie: … the sprinters, that's beating on your door."

## 1. Overview
Before this, a door stopped the infected only if it was LOCKED. Any other door swung open for whoever walked into it,
the infected included, so running indoors bought nothing and nobody ever beat on your door. There was also no way to
shut a door behind you: a leaf stayed at whatever angle it was pushed to.

Now:
- **The infected cannot work a latch.** A door that is shut holds a shambler or a sprinter, locked or not, until they
  beat it off its hinges. The living still push it open by walking into it. The Echo is the exception (§3.2).
- **You can pull a door shut** (E at an open door). With the infected within 24 m it is the first thing E does.
- **They beat on it.** A shambler thumps. A **sprinter** in its burst hits the door at a run (a slam), then pounds it in
  a frenzy, more than three times as hard. The leaf shudders with every blow, splits at half its hp and comes off its
  hinges at zero. Every blow is a noise the others hear and walk to.
- **You can hold it.** With the infected about, E at a shut door leans on it and each blow does 0.45 of its damage. A
  lock, a wedge, planks or the room's furniture are beaten first, and then the leaf.
- **Steel holds.** A steel door never breaks to fists; it only shudders and rings.
- **They give up.** Once you are out of its senses a sprinter spends its burst, stops, searches and forgets.
- **Other players see and hear it.** What a door's leaf has left, a door off its hinges, a door being pulled shut and
  each blow are shared through the shard.

## 2. Player fantasy
You sprint for the house with one of them screaming behind you, get through the door, turn and slam it. A second later
the whole leaf jumps in its frame. Then it is fists, fast and uneven, and the prompt says how much door you have left.
You put your shoulder to it and the number falls slower. You know the sound is carrying, and that the ones down the
street are turning their heads. Either you find planks, or a back window, or you are standing there when it splits.

## 3. Detailed rules
### 3.1 Shut
- A door is **shut** when every leaf is within `DOOR.shutAngle` (0.14 rad, 8°) of closed and it is on its hinges
  (`interiors.isShut`). A door built closed is shut. A door ajar is not.
- To a shambler or a sprinter a shut door is a wall (`leafCircle`). To the living it swings as before.
- **Pulling it shut:** E at an open or ajar, unlocked door within `DOOR.shutReach` (2 m) with a clear hand's line
  (`openDoorNear`, WEB_REACH). The leaves go to closed at once, with the latch sound and a 7 m noise.
  - Refused while anything is within `DOOR.shutClear` (0.5 m) of the closed leaf's line: "you are standing in the
    doorway", "someone is in the doorway", "one of them is in the doorway", "a body lies in the doorway", "a vehicle is
    in the doorway".
  - **E's order:** with one of the infected within `DOOR.threat` (24 m, `zombies.near`), an open door in reach is what
    E does, before the person beside you, your dog, a crate or a bed. Otherwise it comes after all of them. A car beside
    the door keeps its own keys (F, C, G) either way.
  - **What counts as in the doorway:** a person or a body on that floor within 0.5 m of the leaf's line; a vehicle by its
    real footprint (its body's discs against the leaf's line), so a car parked along the wall beside the door does not
    block it and one across it does.
- A door ajar (past 8°) is E's to shut; it is no longer offered for a kick.

### 3.2 Beating on it
- **Who works a door.** One of the infected that is held up at a shut door (it moved under 0.25 m in a sense tick) and
  for whom that door is in the way (`zombies.through`): the door lies toward who it perceives or toward its remembered
  spot, it has no clear line to who it perceives, and nothing stands between it and the door. Then the door is its work.
  - With a clear line to its prey it leaves the door and goes for them.
  - One that remembers nothing never presses at a door or beats it (the old "no environmental attacks" rule of
    WEB_ZOMBIES §3.3): it goes round, as round any wall.
  - It must be within 2.6 m of the door to strike it.
- **A blow** (`zombies.thump` → `interiors.pound` for a shut door; a locked door's lock is beaten first, below):
  - takes `dmg` off the leaf's hp, which is the materials system's door record (`materials.hitDoor`, cause `pound`);
  - the leaf **shudders** for `DOOR.shake` s (drawn only: the leaf jumps up to `DOOR.shakeAngle` in its frame);
  - plays a fist-on-wood or fist-on-steel take, throws splinters and a puff of dust off the frame, and shakes the screen
    a little if you are within 9 m;
  - is a noise of `DOOR.poundNoise` (16 m), or `DOOR.frenzyNoise` (26 m) for a frenzy blow or a slam;
  - the first blow on a door within 26 m of you toasts "SOMETHING IS BEATING ON THE DOOR", or "A SPRINTER IS POUNDING
    ON THE DOOR".
- **By breed** (rows; leaf hp = 60 × width × 2.25, so 135 for a 1 m wooden door and 189 for a 1.4 m one):

| | every | dmg | per second | a 1 m wooden door (135) alone |
|---|---|---|---|---|
| Shambler (`door`) | 2.2 s | 6 | 2.7 | 50 s |
| Sprinter out of its burst (the shambler's row) | 2.2 s | 6 | 2.7 | 50 s |
| Sprinter in its burst (`frenzy`) | 0.42 s ±20% | 7 | 16.7 | a 30 slam, then 6.3 s |
| Echo | — | — | — | it is not held: it opens the door and walks in |

- **The slam:** as a bursting sprinter reaches the door it throws its whole body at it once for `frenzy.slam` (30), with
  a snarl. It slams again only if it left that door for `frenzy.slamCool` (4 s).
- **The Echo** is the one that still works doors (canon ruling 0.8). A latch does not hold it: walking, it pushes a shut
  door open like the living and leaves it open behind it, for the others; a shut door is never its "blocker". A LOCKED or
  barricaded door it works as before (26 every 1.4 s, only unobserved), and when the lock gives it swings the door open.
- **A locked door** (and a wedged, planked or furniture-barred one): the lock's hp is beaten first, with the same
  shudder, sound and lean. When it gives, the door is still SHUT, and now the leaf is beaten. So a locked wooden door is
  its lock (70) and then its leaf (135); it is never the weaker of the two. The old contact rule (`interiors.bang`: 6 off
  the lock per 1.1 s pressed against it) follows the same law now: only one that remembers something past the door does
  it, the lean and the shudder apply, and the lock giving leaves the door shut for all but an Echo.
- **Cracked:** at `DOOR.crackAt` (half) of its hp a breakable leaf splits: a crack sound, and the leaf is drawn darker.
- **Down:** at 0 the materials system takes it off its hinges for good (debris, a 30 m noise, the break sound).
  `doorBrokenDown` is emitted. A broken door can never be shut again.
- **Steel:** the steel material does not break (`MATERIALS.steel.breaks` is false). A steel door shudders and rings,
  and holds.
- **Their own noise is not news to them.** The infected beating a door do not hear that door's pounding as a new sound,
  and a door one of them gave up on is not news to it for 90 s, so two at one door do not keep calling each other back.
  Fists on a door bring a sprinter at a walk; they never set it screaming (only you, or a loud noise, do that).

### 3.3 Holding it
- **When E leans.** At an UNLOCKED shut door: as soon as the infected are within `DOOR.threat` (24 m), or the door was
  beaten within `DOOR.underAttack` (4 s). At a LOCKED or barred shut door: while it is being beaten (within 4 s of a
  blow); otherwise its lock is yours to work as before (kick, pick, pry). In those cases E at the door never kicks it (a
  boot would throw open the door that is keeping them out, or kick your own lock and planks off under their fists).
- **E's order:** such a door within the E key's own door reach (1.9 m, `interiors.shutDoorNear`) is what E does, before
  the person beside you or your dog, the same as shutting. A car beside it keeps its own keys (F, C, G).
- Within `DOOR.braceReach` (1.5 m), holding E **leans** on it from the first frame (`interiors.brace`); further off the
  prompt says to step up to it. You still open an unlocked door by walking into it.
- While leaned on, each blow does `DOOR.braceMul` (0.45) of its damage, to the leaf or to the lock.
- The prompt reads `LEANING ON THE DOOR · 62% left`, `steel: it will hold`, or for a locked or barred door `the lock holds · 240 left` / `the bar holds · 240 left`.
- **Barricades** (WEB_GADGETS, unchanged): a wedge (+25), planks (+300) or furniture (+420) lock the door and add to the
  lock's hp. That is beaten first, and then the leaf.

### 3.4 Giving up
- A sprinter's burst lasts while it perceives you. Behind a door that is smell (4.5 m; 5.6 m for the player, who
  smells ×1.25) or your footsteps.
- Out of its senses: the burst runs out in `burst` (6 s), it overheats for 3 s, and then it thumps at a shambler's pace
  for as long as its memory of you is fresh (`memory + search`, 44 s). Then it forgets, gives the door up and wanders
  off; that door being beaten by another is not news to it for 90 s.

### 3.5 Sound
Made for this with a text-to-sound-effects service (`tools/audio-make.mjs`; 50 takes, 485 KB, listed with their prompts
in `web/SOUNDS-MADE.md`; raw takes on the NAS at `N:\assets\audio\made\dsoa`):

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
| `shambler/groan`, `/notice`, `echo/murmur`, `/work` | 5, 3, 4, 3 | wired by WEB_BREEDS.md |

Each falls back to the library's take or the old synthesized thud when samples are off. A made kind never replaces a
library kind of the same name (`data/audiosets.js`).

### 3.6 Multiplayer
The shard's model is that each page simulates its own surroundings and reports what it changes in the shared world.
- **Kept by the shard** (`world.leaves[doorId] = { p }`): what the leaf has left; 0 is off its hinges. It only ever
  goes down: no patch raises it, removes it or puts a door back. A standing door is never sent as 0 (under 1 hp is
  sent as 1). Sent once a second for the doors loaded on that page whose hp fell (`leafKeys` / `diffLeaves`).
- **On the other page** (`mergeLeaves` → `applyLeaf`): a hurt leaf is as hurt, and a door off its hinges comes off them,
  if it is a door that can break (a steel door is never broken by a row). A row for a door not loaded on that page waits
  (`waitL`) and is applied when the door loads.
- **Relayed, not kept:** the doors a hand pulled shut this second (`shut: [ids]`; the other page shuts its copy once,
  unless something stands in it) and the blows struck (`pound: [{ d, k, n }]`; the other page's door shudders, sounds
  and reads as under attack). A door's swing is otherwise each page's own, so a door somebody opens is not re-shut.
- **Not shared (the shard's present limit):** the infected themselves. Each page has its own. Two players at one door
  see the same door and hear the same pounding, but the bodies outside are each page's own, and a lean only slows the
  blows of the page it is on. Sharing them needs one page (or the shard) to own each of the infected, which is the
  persistent-server work in `WEB_SHARD.md`.
- **A hostile page** can report doors as broken, as it already can report locks kicked in and windows broken. The shard
  bounds a patch (64 leaves, 16 shuts, 16 blows) and what it keeps (20,000 leaves).

### 3.7 The crowd at a door (Robert, 11-12: "multiple zombies knocking on the door, but not all of them knocking")
- **Only the front few can get their fists on it.** A door has `round(width × 2.2)` places, never under 2 or over 4 (a
  1.2 m door: 3). Boards over a window have 2. Rows: `DOOR.pounders`.
- **The rest wait.** Anyone else who reaches the door stands behind, facing it, hands down: no blows, no damage, no
  noise of their own. They are still at the door (they do not wander off, and they do not count as having given up).
- **Turns.** Whoever beat the door last frame keeps their place. When a place comes free (one dies, is pulled off, gives
  up or goes for somebody it can see) it stays empty for 0.6 s, then the first of the waiting to ask takes it. (A door
  that has had a crowd keeps that 0.6 s for the next arrival's first blow too.)
- **A sprinter in its burst shoulders in:** it always gets a place, one over the count at most.
- **An Echo** works doors by its own rule (it is a worker, not one of the crowd) and takes no place.
- **So a crowd does not break a door faster than its places can.** Twenty at a door land the blows of three. More
  bodies mean the door never gets a rest, not that it falls sooner.
- The `pound` command shows each door's `crowd: { cap, pounding, waiting }`.
- **Multiplayer:** places are decided on each page for the infected that page simulates (the infected are not shared
  yet, §3.6); the door's hp is the shared thing and still only goes down.

### 3.8 The sound budget (Robert, 11-12: "you don't gotta play all the sound")
- **Nothing is made at play time.** Every sound here is one of the shipped takes (`data/audio-made.json`, the library).
- **Groups with a cap** (`SPATIAL.groups`): at most 4 infected voices (groans, moans, screams, snarls, murmurs, working
  noises) and at most 3 door or board blows sound at once. When a group is full, a louder newcomer stops the quietest
  voice of the group and takes its place (louder means nearer, mostly); a quieter one is not played.
- **The herd's one voice** (`SPATIAL.crowd`): with 8 or more of them inside 28 m of you, the single idle groan slot
  speaks for the crowd: from the crowd's middle, twice as often, half again as loud. It is one voice, never one per
  body. (There is no separate crowd recording; it is the groan takes used as a bed.)
- A voice the budget refuses is simply not played: nothing synthesized stands in for it.
- **In the groups:** groans, the shambler's moan, the sprinter's running snarl, its slam cry and its wheeze, the Echo's
  murmur and working noise (infected); blows on doors and on boards (pound). **Left out on purpose:** the sprinter's
  scream (it is the warning that it has broken; it must always be heard) and the Choir-Touched's hum (one site special).
- Door blows were already one sound per blow; with three places a door makes at most three at once.
- **In a crowd the single-body warning is replaced.** With 8 or more round you the "one you cannot see" groan gives way
  to the crowd's voice from its middle, so one hidden behind you is not picked out.

## 4. Formulas
| Name | Formula | Variables | Example |
|---|---|---|---|
| Leaf hp | `hpM2 × width × DOOR.height` | wood hpM2 60, height 2.25 m, width 0.9–2 m | a 1 m wooden door: 135; a 1.4 m one: 189 |
| Blow | `took = dmg × (leaned ? braceMul : 1)` | dmg 6–30, braceMul 0.45 | a frenzy blow on a leaned door: 7 × 0.45 = 3.2 |
| Time for one sprinter, bare | `(hp − slam) / (dmg / every)` | slam 30, 16.7 per s | 1 m wood: (135 − 30) / 16.7 = 6.3 s |
| The same, leaned from the first blow | `(hp − slam × braceMul) / (16.7 × braceMul)` | — | (135 − 13.5) / 7.5 = 16.2 s |
| Three shamblers, bare | `hp / (3 × 2.7)` | — | 135 / 8.2 = 16.5 s |
| A locked door | `(lockHp − slam) / 16.7 + hp / 16.7` | wood lock 70 | (70 − 30) / 16.7 + 135 / 16.7 = 10.5 s |
| A planked door | `(lockHp + 300 − slam) / 16.7 + hp / 16.7` | — | 340 / 16.7 + 135 / 16.7 = 28.4 s |
| Frenzy floor | `frenzy.dmg / frenzy.every > 3 × shambler.door.dmg / every` | validator | 16.7 > 8.2 |
| Noise | `r = thump ? poundNoise : frenzyNoise`, heard by the infected within `r × 2 × sense.hear` | 16 / 26 m | a frenzy reaches a shambler 52 m off |

## 5. Edge cases
- **Something in the doorway** (you, anyone, a body, a car): the door will not shut. Clear it first.
- **A double door:** shut when both leaves are; one blow shudders both.
- **A door ajar** (more than 8° open): not shut. The infected push it open, and E pulls it shut.
- **A wild creature** (the Greyborn, the hot ground's): not held by a latch; it pushes a shut door open as before, and
  pressed against a LOCKED door it still wears the lock down by contact (the old rule, kept for them: they have no
  memory rows to ask).
- **The infected inside a shut house:** they stay in until they sense something past a door. A house with its doors
  shut can hold a surprise.
- **A herd, a migration or a lure walking with no memory of anyone:** it meets a shut door as it meets a wall and goes
  round it. A herd that remembers someone inside beats its way in.
- **Residents and other people:** walk through a shut door as ever (it swings and stays where it stops).
- **A door you shut, then a living person or an Echo opens:** it is open. The infected can walk in.
- **Leaning while the door breaks:** you are standing at the leaf when it goes; nothing extra happens to you.
- **Distances in the code** for "at the door" (2.6 m), the screen shake (9 m) and the first-blow toast (26 m) are
  taxicab distances (|dx| + |dz|), so they are a little shorter along a diagonal.
- **A streamed door re-made while it is being beaten** (another player's patch reloads the openings): it keeps who shut
  it, its crack and the blows in flight (`interiors.ringPound`), and a sprinter does not get a second slam (the slam is
  remembered by the door's id).
- **Old saves:** a door's hp is in the materials save already.
- **Samples off or still loading:** the old synthesized thud plays.
- **A streamed (ring) door:** shut and beaten like any other. Its hp record waits in the materials system while its
  building is away, and one of the infected whose door was re-made under it lets go and takes it up again.
- **Below the street:** doors there are held and beaten by the same rule; the noise of it travels that level's own
  corridors (`underground.noise`).

## 6. Dependencies
| System | What it needs from this | What this needs from it |
|---|---|---|
| `systems/zombies.js` (WEB_ZOMBIES.md §3.3) | `interiors.isShut`, `pound`, `braced`, `shudder`; the `zdoor` hint | `through`, `blocker`, `work`, `thump`, `near`, `fresh` |
| `systems/materials.js` (WEB_MATERIALS.md) | — | `doorRec`, `hitDoor` (cause `pound`), `breaksDoor`, `breakDoor`, its save |
| `systems/gadgets.js` (WEB_GADGETS.md) | — | barricades add to the lock's hp (unchanged) |
| `systems/actions.js` (WEB_TIMED_ACTIONS.md) | `underAttack`, `brace`, `doorHp` for the door prompt | `doorKey` |
| `main.js` E chain | `openDoorNear`, `shutDoor`; `zombies.near` | the chain's order |
| `systems/reach.js` (WEB_REACH.md) | a shut door stops a hand and a word | `reach.opening` for the door you shut and for `through` |
| `net/shard.js`, `server/shard.mjs` (WEB_SHARD.md) | `leafKeys`, `mergeLeaves`, `heardShuts`, `heardPounds`; `tools/shard-door-test.mjs` | the world patch (`leaves`, `shut`, `pound`) |
| `data/audiosets.js`, `tools/audio-make.mjs` (WEB_SOUND.md) | — | the made manifest merged over the library's |
| `systems/ai.js` | — | `stuck`: reset only for one that remembers something past the door |
| WEB_BREEDS.md | the sprinter's and the Echo's cards cite these rules | — |

## 7. Tuning knobs
| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `DOOR.shutAngle` | 0.14 rad | 0.05–0.4 (under `nearClosed` 0.45) | How closed counts as shut |
| `DOOR.shutReach` | 2.0 m | 1.5–2.6 | How close you stand to pull it shut |
| `DOOR.shutClear` | 0.5 m | 0.35–0.8 | How clear the doorway must be |
| `DOOR.threat` | 24 m | 12–40 | When the door outranks everything E could do, and when E leans instead of kicking |
| `DOOR.braceMul` | 0.45 | 0.25–0.8 | What your shoulder is worth |
| `DOOR.braceReach` | 1.5 m | 1.2–2 | Where you can lean from |
| `DOOR.crackAt` | 0.5 | 0.3–0.7 | When the leaf splits (the warning) |
| `DOOR.shake` / `shakeAngle` | 0.32 s / 0.07 rad | 0.15–0.6 / 0.03–0.12 | How hard a blow reads |
| `DOOR.poundNoise` / `frenzyNoise` | 16 / 26 m | 10–30 / 16–45 | How far the pounding pulls others |
| `sprinter.frenzy.every` / `dmg` | 0.42 s / 7 | 0.2–1.5 / 1–40, and over 3× a shambler | How long a door lasts against one |
| `sprinter.frenzy.slam` / `slamCool` | 30 / 4 s | 0–120 / 1–30 | The first hit |
| `GAVE_UP` (zombies.js) | 90 s | 30–300 | How long a door it gave up on stays not-news |
| wood `hpM2` (data/materials.js) | 60 | 40–120 | Every wooden door and wall in the game |
| `DOOR.pounders.perMetre / min / max` | 2.2 / 2 / 4 | 1.5–3 / 1–3 / 3–6 | How many can beat one door at once (how fast a crowd breaks it) |
| `DOOR.pounders.takeover` | 0.6 s | 0.2–2 | How long a place stands empty before one of the waiting takes it |
| `SPATIAL.groups.infected / pound` | 4 / 3 | 2–8 | How many of their voices and of door blows sound at once |
| `SPATIAL.crowd.at / r / rate / vol` | 8 / 28 m / 2 / 1.5 | 5–20 / 15–40 / 1–3 / 1–2 | When the herd speaks with one voice, how often and how loud |

## 8. Acceptance criteria (selftest, `node tools/dl.mjs selftest only="door pound:"`)
1. **Rows:** `validateInfected` is clean, and a frenzy no harder than a shambler is caught.
2. **The latch:** through an open door a shambler told of you walks in. With one of them 12 m out and a stranger at
   your back, E at the open door reads "Shut the door" (the urgent prompt), shuts it (`shutBy` is you) and opens no
   talk. E again from 1.75 m reads "Step up to the door"; at 1.1 m holding E leans on it at once; the door stays shut and
   no kick is recorded and no talk opens, with the stranger still at your back. Standing in the doorway, `shutDoor`
   refuses ("you are standing in the doorway"); a car parked along the wall 2.9 m out does not block the doorway, one
   across it does, and someone on the floor above does not. The shambler
   then never crosses the door line; within 40 s it has struck at least 4 blows, the leaf has shuddered, its hp has
   fallen and at least 3 `doorPound` events fired.
3. **A sprinter at the door:** it screams, slams, strikes at least 4 frenzy blows and has a wooden door off its hinges
   and is through in under 15 s. Leaned on, the door takes at least 1.5× as long. Locked, at least 1.2× as long, and it
   ends broken (the lock, then the leaf); locked AND leaned on, at least 1.3× the locked time with no kick recorded.
   Barred with planks, at least 2× as long and longer than the lock alone.
4. **The noise draws more:** a shambler resting 24 m off that remembers nothing after 4 s of quiet gets a `sound`
   memory within 12 s of the pounding starting and closes at least 6 m on the door.
5. **It gives up:** a steel door loses no hp and does not break. With TWO sprinters at it and you 150 m away, within
   `burst + overheat + memory + search + 30` s neither is at the door or remembers anything, and 6 s later neither has
   gone back; the door is still shut. A shambler with no memory whose wander leads at the shut door comes within 1.6 m
   of it and never presses at it or strikes it in 8 s; with the same door LOCKED, 5 s against it takes nothing off the
   lock.
6. **Shared:** a hurt leaf is in `leafKeys` as its hp and is sent once; a leaf at 0.3 hp is sent as 1; `mergeLeaves`
   on the door as built sets its hp and `heardShuts` shuts it; a row that would heal it does not; `heardPounds` makes it
   shudder and read as under attack; `p: 0` takes it off its hinges; a steel door is not broken by a row; a row for a
   door that is not loaded waits; a materials save and load keep the hurt leaf's hp.
7. **The crowd:** eight told you are behind a shut steel door: never more than its 3 places beat it at once, three or
   more wait with their hands down and land no blows, the blows over the watch are no more than three bodies' worth;
   `pound` reports the same; one taken off the door is replaced by one of the waiting; a full sound group refuses a
   quieter newcomer and stops its quietest voice for a louder one; with the herd switched on, eight round you are heard
   as `crowdHeard` (one voice, from the middle) and no single groans.

Two players: `node tools/shard-door-test.mjs` (a real shard and two game pages; 10/10 on 2026-11-12): a door B pulls shut
and something beats on is shut, as hurt (149 of 189) and heard on A; B opens it again and nothing re-shuts it; beaten off
its hinges on B it is off them on A; the shard keeps `p: 0`, and a later patch cannot put it back or remove it. The same
steps are section 9 of the long two-client proof (`tools/shard-test.mjs`), which on this base stops earlier at its
house-claim step (its page A now starts in Florida).

Before / after: `docs/renders/web/door-pound/zed-pound-before.jpg` (the infected walk through a closed door in 2 s),
`zed-pound-after-1-pounding.jpg` (a sprinter and a shambler beating the shut door, 83 of 189 left) and
`zed-pound-after-2-door-down.jpg` (off its hinges, all three inside).

Critic review 2026-11-12. Third pass FAIL, two items, fixed in the commit after: a locked or barred door being beaten
could not be leaned on and E kicked your own lock off; a car key beside the door also whistled the dog (and G could
board a train). Second pass FAIL, six items, fixed in the commit after: the old contact rule still flung a
locked door open and needed no memory; a car anywhere near counted as in the doorway; a streamed door lost its pound
state (and gave a sprinter a fresh slam) on every remote patch; a dog, a friend or a car could take the lean key; a
hunting Echo dithered at shut doors; the car's own keys were dead beside an open door. First pass FAIL, twelve items,
fixed in the next commit: a body that brushed a door stopping to
beat it with its prey in plain sight; herds with no memory pinned at doors; two at a steel door calling each other back
for ever; a locked or wedged door weaker than a shut one; the Echo stuck at a latch; E kicking open the door you had just
shut; shutting unavailable with a friend, a car or a dog beside you; a door shut on yourself; a door off its hinges
forgotten by the shard; a shut state that two pages kept re-sending; a remote patch wiping the blows in flight; a real
game named in this doc.

Critic review of §3.7 and §3.8, 2026-11-12, first pass FAIL, three items, fixed: a voice refused by the budget fell
through to a synthesized stand-in; boards, the wheeze and other sites were not in a group; two sprinters in their burst
could both shoulder in depending on the order they were thought in.
