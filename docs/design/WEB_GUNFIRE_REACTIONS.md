# WEB_GUNFIRE_REACTIONS — different people, different reactions to a shot

> Robert, 2026-10-29: "the sound of gunshots should make different people react different ways."

Code: `web/src/systems/reactions.js` · rows: `web/src/data/reactions.js` (`validateReactions`) · commands + checks:
`web/src/agent/reactions-api.js` (`react`) · renders: `docs/renders/web/gunfire-react/`.

## 1. Overview

Before this lane a shot did one thing to everyone in a 45 m circle: the unarmed ran away from the shooter's **true**
position, the armed turned on the shooter if hostile, and anyone within 14 m might cower. Everyone knew exactly where the
gun was.

Now a shot is **heard, never known** (WEB_DEPTH_PLAN §0 law 6). Every listener gets:

- a **loudness**: distance against a range set by the gun, walls in between, sleep, temperament and the town's nerves;
- a **band**: near, mid or far;
- a **heard bearing** with an error that grows with distance and doubles behind a building;
- a **guessed distance**, and from it a **heard spot**.

Their **profile** (child, parent, lawman, medic, veteran, trader, faithful, wire, hand, armed, civilian), shaded by
**temperament** (steady, nervous, brave, coward, drunk, devout, hothead), picks one of 16 **reactions**. Everything they
then do aims at the heard spot: run away from it, go and look at it, call it in. Return fire is the one exception, and
it needs the shooter **in sight**.

Repeated shots make a place **jumpy**. A jumpy place hears further, reacts faster and stays scared longer. A quiet place
relaxes.

## 2. Player Fantasy

You fire one round in a town street, and the street comes apart in a dozen different ways:

- the storekeeper bolts inside and you hear the door slam and bar;
- a mother sprints the length of the block to her boy and drags him indoors;
- the drunk on the corner says "fireworks";
- the preacher drops to his knees;
- the coward drops everything and runs;
- the radio operator keys up, and her guess of where it came from is on the air before you've moved;
- the deputies come walking. They walk toward where they *think* it was, and from far off they guess wrong. That gap is
  your exit.

Fire again, and the town is jumpier: faster to scatter and slower to calm. Leave it quiet for a few minutes and it
settles.

This lane makes **consequence** bite harder. A gunshot is a decision with a radius.

## 3. Detailed Rules

### 3.1 Who listens
These people are this system's:

- drifters and the law (`faction: drifter | warden`);
- named NPCs;
- the Phoenix ring's households (`c.res`);
- settlement workers (`c.occRec`).

These keep their own minds:

- fighters (raiders, soldiers, a base's garrison);
- your crew and followers;
- the infected, animals and dogs;
- witnesses running to tell (`c.telling`), crew candidates (`c.crewCand`);
- road people, story parties, hunters and anyone already in a fight (`c.target`).

### 3.2 Hearing (per listener, per shot: `onShot`)
1. `range = 45 m × earMul (3) × loud[gun] × temper.ear × (1 + earAdd × jumpy) × (wallMul 0.55 if no line of sight) × (asleep: sleepEar × TOWN_NIGHT.hearAsleep 0.45 / earMul 3, the town's own half an ear, about 20 m for a pistol)`.
2. If `d ≥ range`, they did not hear it. Nothing happens to them.
3. `loudness = 1 − d / range`. It is **near** at 0.62 or more, **mid** at 0.3 or more, and **far** below that.
4. `bound = min(errMax 70°, (errBase 5° + errPerM 0.22° × d) × (errWall 1.8 behind a wall))`.
   The error is `bound × u`, with `u` in [−1, 1] from a hash of (listener, shot). The heard bearing is the true bearing
   plus the error.
5. The guessed distance is `d × (1 + distErr 0.35 × u2)`, with ×1.5 on `distErr` behind a wall. The **heard spot** is
   the listener plus the heard bearing times the guessed distance.
6. Someone already doing a moving reaction **re-hears** it: they take the new bearing and keep going longer. A calm
   reaction or a freeze is reconsidered at the new loudness.

### 3.3 The pick (`react`)
- **Profile:** the first row of `PROFILES` whose `when` matches (`child`, `kin`, `armed`, `any: occ:|faction:|title:`).
  `c.rxProfile` forces one.
- **Temperament:** `c.rxTemper`, else a weighted hash of who they are (npc id, worker seed, name). Stable per person.
- **Weights:** start from the profile's row for the band (or `any`). Then:
  - the temperament's `swap` replaces picks;
  - a pick that needs a gun becomes `freeze` (or `cover` for return fire) for the unarmed;
  - calm picks and freeze are multiplied by `temper.calmMul × (1 − calmCut × jumpy)`;
  - scared picks are multiplied by `1 + scareAdd × jumpy`.

  A temperament's `override` (drunk → ignore, coward → drop_run) wins unless the profile is `firm` (child, parent).
- **Roll:** a hash of (listener, shot). `c.rxPick` forces it, for staging only.
- **Return fire** needs the shooter alive, within `seeR` (40 m; 18 m at night), in sight (`g.sees`) and **hostile** to
  them. Otherwise the armed go to look and the unarmed take cover.
- **run_kin** with no family becomes **hide**.

### 3.4 Timing
- **Awake:** `delay = lerp(delay 0.25..0.7 s) × temper.nerve × (1 − delayCut × jumpy)`.
- **Asleep:** `delay = lerp(wake 2.6..5 s) × temper.rouse`. They stay lying down until it passes, then `ai.wake(c, 'gunfire')`.
- Until the delay has passed, the awake carry on with whatever they were doing.
- **Duration:** `secs × (1 + secsAdd × jumpy)`.

### 3.5 The reactions

| Reaction | Body | Does | Notes |
|---|---|---|---|
| freeze | stands, faces the heard bearing | nothing | 2–4 s |
| cover | short dash away, then **crouch** | gets down | 5–9 s |
| flee | upright, 5.8 m/s | away from the **heard** bearing | |
| drop_run | 6.6 m/s | away; a worker drops the work | the coward's |
| hide | runs | to the nearest unlocked door within 24 m, through it, **slams and bars it** (shut and held with a plank across, never a saved lock; a kick breaks it) | no door: down where they are |
| hide_low | **prone-ish** (crouch + stoop) | under the nearest bed within 20 m | the child's |
| run_kin | sprint | to their family; there, the child follows and the parent hides them both, holding the door until the child is in | parents |
| look | **gun up** (aiming), 3.4 m/s | to the **heard spot**, then looks round | the law's, the armed |
| tend | **stoop** | a beat for the kit, then to the heard spot | medics |
| return_fire | aiming | `c.target = shooter`: the fight AI takes over | in sight and hostile only |
| call_in | stands | a `gunfire` fact (their guessed spot) into the knowledge model, radio broadcast within 400 m, carried to the nearest town | radio operators, the law |
| scream | **hands up**, runs | `zombies.onNoise(55 m)` | |
| wail | hands up, stays | the same noise, where they stand | a child |
| pray | **kneels** (crouch + hands up) | nothing | the devout |
| keep_working / ignore | as before | the bark, then carries on | calm |

### 3.6 Visible
- **Barks:** one line from the reaction's row, through `voice.speak` (a voiced clip, else a subtitle) and the floater.
  At most one every 0.45 s, and only within 70 m of you.
- **Body language:** on the pose solver's own flags (`crouch`, `handsUp`, `aiming`, `stoop`).
- **Doors:** a thud, the leaves slammed shut and held, and a plank across them, the moment the hider is in. The door comes unbarred when their reaction ends, or after
  300 s at most.

### 3.7 Memory: jumpiness
- A place is a 300 m grid cell. Each shot adds `perShot (0.16) × max(0.25, loudest ear's loudness)` to every cell
  someone heard it in, up to 1.
- It halves every 90 s of quiet. Decay is lazy: it is read as `j × 0.5^(quiet / halfLife)`.

## 4. Formulas (worked example)

A pistol shot, heard 60 m away in the open by a steady townsman, in a town that has been quiet (j = 0):

- **Range:** 45 × 3 × 1 × 1 × 1 = **135 m**.
- **Loudness:** 1 − 60/135 = **0.56**, so the **mid** band.
- **Bearing bound:** 5 + 0.22 × 60 = **18.2°**. With u = −0.4 they hear it 7.3° off the true line.
- **Guessed distance:** 60 × (1 ± 0.35), between **39 and 81 m**. Their heard spot can be 20 m from the truth.
- **Delay:** 0.25 + 0.45 × r. With r = 0.5, **0.48 s**.
- **Pick:** civilian, mid: flee 2, hide 2, freeze 1, so 40 / 40 / 20 %.

The same man **asleep**:

- range 135 × 0.45/3 = **20 m**, so at 60 m he sleeps through it. That is the town's own rule (`TOWN_NIGHT.hearAsleep`):
  gunfire at the wall does not wake the far side of town. The battery's "the town sleeps" check caught an earlier 81 m.
- At 15 m: loudness 1 − 15/20.25 = 0.26, so **far**, and he is up after **2.6–5 s**.

**Jumpiness:**

- Six shots, each heard at loudness 0.7, add 0.112 each, so the town sits at ≈ **0.67**.
- After 30 s of quiet: 0.67 × 0.5^(30/90) = **0.53**.
- At j = 0.53:
  - the next delay is × 0.73;
  - the reaction lasts × 1.42;
  - calm picks weigh × 0.55;
  - scared picks weigh × 1.53;
  - range × 1.13 (153 m for a pistol).

## 5. Edge Cases
- **The shooter is a friend, or you are shooting the dead.** Return fire needs `ai.hostile`, so the law goes to look
  instead. Nobody gets a grudge from hearing a shot. The deeds/witness system still owns crimes.
- **A hostile in sight** (`ai.scan` sets `c.target`). The reaction ends and the fight AI takes over. The fight comes
  first.
- **Rapid fire.** One reaction per person. Movers re-hear (new bearing, longer). Paths re-plan at most every 1.5 s, and
  only when the goal drifts more than 6 m. Per-shot scratch is pooled.
- **No door near** → down where they are. **No bed** → flat on the ground. **No family** → hide.
- **Family dead mid-run** → hide.
- **Door already barred by someone else** → the next door.
- **What a bar is.** The leaves are slammed shut and held (`jamT` kept topped up: a jammed leaf refuses every push), and
  the padlock slot's plank is drawn across the door. It is **not a lock**. A lock is saved and stamped into the nav grid
  (`interiors.setLocked`/`load`), and the battery caught both:
  - a bar as a lock sealed whole homes from every other walker's route while it held;
  - a save taken while one held reloaded it as a lock for good, sealing the cantina's floor plan.

  Now nothing about a bar is saved; a save mid-bar loads a plain closed door. Others stop at it like any shut door. A
  kick (`interiors.fling` zeroes `jamT`) or the door forced open breaks it (`barBroken`), and the plank comes off.
- **Crew candidates** (`c.crewCand`) are crew.js's: they do not take part.
- **A witness who heard the shot and then becomes a runner** (`witnesses.consider` sets `c.telling`), or someone
  taken on as crew mid-reaction: the reaction ends at once. The runner runs home to tell it, and the battery's witness
  check caught the hider who never did.
- **Below the street** (`c.ug`), in a seat, being dragged, captive → not this system's.
- **Underground shots** never reach the street (the existing `under.noise` short-circuit is untouched).
- **The 14 m flinch** (`ambient.onShot`, 55% cower) still happens first for the unarmed close by. The profiled reaction
  follows when the flinch ends. It is an instinct, then a decision.
- **Save/load.** Reactions are seconds-long and not saved. The barred doors unbar on clear. Jumpiness is not saved: a
  reload is a calm town. Staged test people brought back by a load are recognised by name and removed by `react clear`.
- **Multiplayer.** Reactions are host-side AI state like the rest of `ai.js`. Clients see the bodies move and the doors
  lock through the existing sync. A shot's hearing runs where the shot is simulated.

## 6. Dependencies

**This system reads:**
- `combat.fire` (the hook);
- `g.los` / `g.sees` (walls, sight);
- `ai.hostile` / `ai.night` / `ai.wake` / `ai.move`;
- `g.footPath`;
- `interiors.doors` / `setLocked`;
- `world.spawns.beds`;
- `OCCUPATIONS` (job keys);
- `voice.speak`, `feedback.floater`;
- `zombies.onNoise`;
- the knowledge model (`pulls.k`: `holder`, `record`, `put`, `broadcast`) and `pulls.nearestNode`.

**Other systems read from it:**
- `ai.update` hands a reacting person to `reactions.think` (after `cowerT`/`hold`, before workers, roads, residents);
- `ai.onNoise` skips anyone with `c.rx`;
- the knowledge model gets `gunfire` facts on the `heard` channel;
- events: `shotHeard`, `gunReact`, `reactEnd`, `doorSlam`, `kinReached`, `shotCalledIn`, `npcWoke` (why `gunfire`).

**Shared-file hooks (all minimal):**

| File | Hook |
|---|---|
| `web/src/main.js` | import; `this.reactions = new Reactions(this)`; `this.reactions.update(simDt)` after witnesses |
| `web/src/systems/combat.js` | `g.reactions?.onShot(ch.x, ch.z, 45, wkey, ch)` one line **before** `g.noise` |
| `web/src/systems/ai.js` | `onNoise`: `\|\| c.rx` in the skip; `update`: `if (c.rx && g.reactions.think(c, dt)) continue;` after the hold line |
| `web/src/data/pulls.js` | `CHANNELS.heard` row; `FACT_KINDS.gunfire` row |
| `web/src/agent/api.js` | import; `...reactionsCommands(api, need)`; `await reactionsChecks(api, check, C)` before the draw-call check |
| `web/src/systems/interiors.js` | none: barring uses its `orient`, `syncLock`, `flush` and the leaves' `jamT` |
| `web/docs/COMMANDS.md` | regenerated |

## 7. Tuning Knobs (`data/reactions.js REACT`)

| Knob | Default | Safe range | What it does |
|---|---|---|---|
| earMul | 3 | 2–5 | how far a shot carries (× the 45 m noise) |
| loud.{gun} | 1–1.3 | 0.6–2 | per gun; a future suppressor row goes < 1 |
| wallMul | 0.55 | 0.3–0.9 | a building between |
| sleepEar | 1 | 0.5–2 | × the town's asleep ear (TOWN_NIGHT.hearAsleep / earMul) |
| bands.near / mid | 0.62 / 0.3 | mid < near < 1 | the band cut points |
| errBase / errPerM / errWall / errMax | 5° / 0.22° / 1.8 / 70° | 0–15 / 0.05–0.5 / 1–3 / 30–120 | bearing error |
| distErr | 0.35 | 0–0.7 | distance guess |
| delay / wake | 0.25–0.7 / 2.6–5 s | wake must start after delay ends (validated) | reaction speed |
| seeR / seeRNight | 40 / 18 m | 15–70 / 8–30 | return fire needs sight inside this |
| doorR / bedR / kinR | 24 / 20 / 70 m | 10–40 / 8–30 / 30–120 | how far they go for cover |
| hop / shortLeg | 35 / 40 m | 20–60 / 20–80 | a look's longest planned leg; a leg this short is always path-planned (else, outside the nav window, straight) |
| jump.perShot / halfLife | 0.16 / 90 s | 0.05–0.4 / 30–600 | how fast a town gets jumpy and calms |
| jump.delayCut / secsAdd / calmCut / scareAdd / earAdd | 0.5 / 0.8 / 0.85 / 1 / 0.25 | 0–0.8 / 0–2 / 0–1 / 0–3 / 0–0.6 | what jumpiness does |
| maxPerShot | 48 | 16–80 | a cost cap |

`TEMPERAMENTS` (w, nerve, rouse, ear, override, swap, calmMul), `PROFILES` (when, firm, pick per band) and `REACTIONS`
(pose, move, secs, speed, lines) are all rows. Add a profile by adding a row above `civilian`; `validateReactions`
checks every name it uses.

## 8. Acceptance Criteria (the named selftest checks, `react:`)

1. **The rows are valid.** `validateReactions` is ok: 16 reactions, 7 temperaments, 11 profiles, a catch-all last, and
   wake slower than an awake delay.
2. **One real shot in a town street makes ≥ 4 different reactions.** A staged Phoenix street of ten flagged townsfolk
   (deputy, medic, trader, mother and child, drunk, veteran, coward, preacher, radio operator) and one real
   `combat.fire`. The drunk ignores it and the coward drops everything and runs. Typically 7–9 distinct.
3. **An unarmed parent goes to their child.** The mother runs to her boy (`kinReached`). He follows (`follow`). She gets
   them through a door that slams and bars (`doorSlam`; shut, held, never locked; both inside). A save taken then loads it
   unlocked and unstamped. It unbars when they come out.
4. **A deputy moves toward the HEARD bearing, never the true position, with error that grows with distance.** Deputies
   at 55 m and 115 m with a clear line. 12 real shots: every error is inside its bound, the far bound is bigger, and the
   far mean |error| is bigger. Then one more shot and 3 s: each walks within 12° of its heard bearing. At least one, with
   an error of 4° or more, walks closer to the heard line than to the true one.
5. **A person out of earshot does nothing.** At 230 m from a pistol in the open: no `gunReact`, no `rx`, no flee, no
   cower. One at 60 m hears it.
6. **Someone asleep wakes slower.** Two alike at 16 m (inside the asleep ear), one asleep. The awake one is moving within 1 s while the sleeper
   still lies asleep. The sleeper is up (`npcWoke` why `gunfire`) and reacting by 6 s.
7. **Repeated shots raise jumpiness, which then decays.** 0 before. Above 0.4 after 6 shots. After 30 s it has fallen by
   `0.5^(30/90)` (±0.06). The next reaction's delay is cut by `delayCut × j`.
8. **Calling it in carries what they HEARD.** A `gunfire` fact whose `where` is their guessed spot (not the true one),
   held by the caller, broadcast on the radio, text "Shots fired …".

Plus the battery's standing gates: under 150 draw calls (no new meshes: the labelled shot draws on a 2D canvas over the
JPEG, never in the scene), no per-frame allocation in `think`, and stress not regressed (fresh-page compare in the
hand-back).
