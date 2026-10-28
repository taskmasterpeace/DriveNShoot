# WEB_ZOMBIES — three breeds, and minds that only know what they sensed

**Status:** BUILT 2026-10-28 on `feat/web-zombies` (Wave 2, `WEB_DEPTH_PLAN.md` §2, decision D1).
**Code:** rows in `web/src/data/infected.js` (`INFECTED`, `BREEDS`, `FOOTSTEPS`, `DRIFT`, `INSIDE`, `validateInfected`);
the brain is `web/src/systems/zombies.js`. Horde records drift in `web/src/systems/overrun.js`. The agent surface is
`web/src/agent/zombies-api.js` (the `zombies` command and 10 named checks).
**Builds on:** `WEB_INFECTED.md` (the kinds v1: the sprinter's burst, the Echo's watched-freeze, the Choir site) and the
canon in `THE_INFECTED.md`. Never "zombies" on screen.

## 1. Overview
Robert asked for "the 3 breeds of the zombies", things to learn from Project Zomboid, and "I don't want the characters to
cheat". This lane does three things:
- It makes the breeds rows. D1 names three: the **Shambler**, the **Sprinter** and the **Echo**. The **Choir-Touched**
  stays a rare site special (`site: true`), not a breed.
- It gives every one of the infected **senses with memory** (law 6). It knows only what it saw, heard or smelled. It
  keeps ONE last-known spot, walks there, searches round it, and forgets.
- It adds the behaviour Zomboid taught:
  - Hordes drift to big noises, as real walks on the world clock.
  - They thump doors and break boards.
  - Crawlers come from leg hits.
  - They lunge the last metres, fall down and get up grabbing.
  - They keep away from fire and come to lights at night.
  - Who is inside a building depends on what kind of building it is.

## 2. Player fantasy
- You fire one shot in the flats, and three minutes later the herd you never saw is in the street. It didn't know where
  you were: it heard a gun and walked to where it went off.
- You go flat in the tall grass and the dead walk past at twenty metres.
- You run, and the one that was "just a shambler" breaks.
- You lose them behind a wall. They stand where you were, turning, and then they drift off.
- The barricade holds against three of them for most of a minute. Then the murmuring starts at the door, "where's my—
  where's my—", and the planks go in under twenty seconds.
- One you shot through the knee drags itself after you.
- At night your flashlight is a dinner bell. A burning car is a wall they won't cross.

## 3. Detailed rules
### 3.1 Senses and memory (law 6)
- **The sense tick.** Every 0.4–0.7 s each of the infected runs one sense pass (`zombies.sense`). The nearest of the living
  it perceives this tick becomes `c.zsee`, along with how it perceived them (`c.zhow`: sight, sound or smell). Their
  position goes into its memory `c.zm` as `{ x, z, t, src, who }`.
  - `c.ztarget` is now *only* someone it perceives right now. It no longer means "someone it once picked".
- **Sight:**
  - Range is `sense.sight` by day and `sense.night` in the dark. A lit body is seen out to `sense.lit` at night: your
    flashlight, a driven car's headlights, or standing in a fire's glow.
  - It sees inside a cone of `sense.cone` degrees either side of its facing. Inside `sense.near` m it notices anything.
  - It needs a real line of sight (`g.sees` / `g.los`).
  - The stance rule is `g.stance.seenRange` (DECKS-STANCE): crouch ×0.6, prone ×0.25. A prone body in grass or behind
    low cover is never seen past 12 m.
  - Your gear's `seenMul` counts.
- **Hearing:**
  - *Footsteps* come from `FOOTSTEPS`, times `sense.steps`: a run 16 m, a walk 6 m, a crouch 2 m, a swim 3 m. Standing
    still and prone make no sound.
  - *Noises* go through `main.js noise()` → `zombies.onNoise(x, z, r×2)`. Any of the infected within `r × sense.hear`
    that perceives nobody remembers a spot off by up to `sense.scatter` m. A sound gives a direction and a rough
    distance, never a point.
- **Smell:** `sense.smell` m with no sight needed, and ×1.25 on the player (×`scentMul` for unwashed or fieldcraft). It
  works through a door, which is why they thump at the door you are behind.
- **Memory:**
  - It walks to the remembered spot at its own pace.
  - Within 1.5 m of the spot it **searches** for `sense.search` s, wandering within `sense.searchR` m of it.
  - Then it **forgets** (`infectedForgot`).
  - A spot older than `memory + search` s is forgotten anyway.
  - It never reads where anyone truly is.
- **Told:**
  - Another system can still point it at someone by setting `ztarget`: the director's bloody night, a sleeper's visitor,
    a nest, a check. That becomes ONE remembered fix (`src: 'told'`), and from there it must sense them itself.
  - The Choir-Touched shares what *it* perceives (`src: 'choir'`).
  - The Echo's phrase calls the infected within `echo.call` m that know of nothing better (`src: 'echo'`).
- **Hurt:**
  - Before, a hit set `ztarget = attacker`: a zombie shot from 200 m knew exactly where the shooter stood.
  - Now `ai.onDamaged` → `zombies.onHurt`. It remembers a spot up to 20 m back along the line the hit came from
    (`src: 'hurt'`): it knows the direction, not who or how far.

### 3.2 The breeds (rows)
| | Shambler | Sprinter | Echo | Choir-Touched (site) |
|---|---|---|---|---|
| role | the horde body | a shambler until it breaks | works doors and windows, calls | the amplifier |
| sight day / night / lit | 32 / 13 / 38 m | 34 / 14 / 40 | 26 / 12 / 34 | 45 / 30 / 45 |
| cone | ±65° | ±70° | ±60° | all round |
| smell | 4.5 m | 4.5 | 3 | 6 |
| memory + search | 25 + 12 s | 30 + 14 | 90 + 20 | 40 |
| door thump | 6 every 2.2 s | 6 every 2.0 s | 26 every 1.4 s | — |
| legs (crawler past) | 34 hp | 26 | 40 | — |
| lunge | 2.8 m at 5.5 m/s | 4 m at 10 m/s | never | — |
| fire / light | 6 m / 70 m | 6 / 70 | 8 / — | — |

The sprinter's burst, the Echo's watched-freeze and the Choir's aura are unchanged from `WEB_INFECTED.md` §3.

### 3.3 Doors and windows
- **Thumping:**
  - Stuck (it moved < 0.25 m in a sense tick while it wants to go > 1.2 m) while it still remembers something, it looks
    for a locked door or boarded window within 2.4 m (`blocker`).
  - It works that every `door.every` s (`work`):
    - A door: `thump` takes `door.dmg` off its `lockHp`. Planks (+300) and furniture (+420) are part of that hp, per
      `data/gadgets.js BARRICADES`.
    - A window: `damageBoards(door.dmg × 1.5)`.
  - Every thump is a 16 m noise, so the others hear it and come.
  - At 0 the door bursts (`interiors.unlock(…,'thumped')`, `doorBroken`) and the barricade record is cleared.
  - Zomboid's "environmental attacks" rule holds: one that remembers nothing never thumps.
- **The Echo** works the nearest boarded window or locked door to its post (12 m) whether it remembers anything or not.
  It thumps with its own `door` row (26 every 1.4 s, more than twice a shambler's, which the validator enforces).
  Boards go by the old `boards`/`workEvery`.
- **Glass:** the claw at glass and boards that `interiors.windowTouch` already did is unchanged.

### 3.4 Crawlers, lunges, falls
- **Crawlers:**
  - Every hit on one of the infected rolls a body part from `data/gear.js HIT_ODDS`, as every hit in the engine does.
    If the shooter knows the part, they set the one-shot `c.hitPart` before the hit.
  - Leg hits come off `legs`. Past it the body becomes a **crawler**: `crawl` m/s, prone body (DECKS-STANCE's capsule),
    a 1.0 m ankle bite at ×0.8. A sprinter crawler never bursts again.
- **Lunge:** a target it can *see*, between 1.3 m and `lunge.at`, and it throws itself the last metres at `lunge.speed`
  for `lunge.t` s. It cools down for `lunge.cool` s.
- **Fall:** a hit of `fall.dmg` or more knocks it down `fall.chance` of the time for `getUp` s (the `knockT` the AI
  already honours). As it rises, anyone inside `fall.grab` m gets lunged at: Zomboid's lesson about the ones on the floor.

### 3.5 Fire and light
- **Fire:**
  - On each sense tick, `nearFire` finds a fire patch (`throwables.fires`) or a burning car within reach.
  - Inside `fire` m past the fire's edge it backs out. At the edge it goes round, never through.
  - A sprinter mid-burst runs through.
- **Light:** at night, one of the infected that perceives nobody and remembers nothing looks for a light it has a line of
  sight to within `light` m:
  - your flashlight's pool, 6 m ahead of you;
  - a driven car;
  - a burning flare (`gadgets.list[].lit`);
  - a fire.
  It remembers the light (`src: 'light'`) and walks to it.

### 3.6 Horde drift (off-screen records)
- An `overrun.js` horde record that is walking (not besieging, not pinned to a siege) hears any noise of `DRIFT.minR` m or
  more within `r × DRIFT.perR`. A pistol's 45 m shot reaches 360 m, day or night.
- It turns to the noise (`H.drift`, `hordeHeard`) and walks:
  - out of range, the record moves at `OVERRUN.horde.speed` (1.4 m/s) on the 1 s overrun tick;
  - within 160 m of you its bodies stand up (the existing materialize) and walk there on their own feet. Each body
    remembers the spot as a heard sound.
- On arrival (`DRIFT.arrive`) it stays `DRIFT.linger` s (`hordeArrived`), then goes back to its road.
- A horde already drawn only turns to a louder noise, or a nearer one.
- No teleport: the selftest bounds every 2 s move.

### 3.7 Who is inside (INSIDE)
`zombies.occupy({x, z, w, d, kind})` fills a building's footprint with `n` bodies by its kind's breed mix (Zomboid's
zone outfits, as behaviour): a hospital 3–7, a school with more sprinters, a church with Echoes, a warehouse with Echoes.
v1 exposes it as `zombies occupy=<kind>`. Nothing calls it on its own yet (§5).

## 4. Formulas
| Name | Formula | Example |
|---|---|---|
| Sight range | `R = (night ? (lit ? lit : night) : sight) × seenMul`, then `stance.seenRange(o, R, 0.6, …)` | Prone in grass, day, cn 0.8: `32 × 0.25 × (1 − 0.6 × 0.8) = 4.2 m` (cap 12). A shambler at 20 m never sees you |
| Seen | `d < R ∧ (d < near ∨ cos∠ > cos(cone)) ∧ los` | Standing at 20 m in its ±65° cone by day: seen |
| Footsteps | `d < FOOTSTEPS[gait] × sense.steps` | Sprinting past at 15 m: heard (16). Walking: 6 m |
| Noise heard | `d < r × 2 × sense.hear` | A shot (45): shamblers to 90 m, sprinters to 108 m |
| Memory | fresh while `t − m.t < memory + search` | A shambler: 37 s after its last sense of you |
| Door time | `lockHp / Σ(dmg / every)` | Wood + planks (370): Echo `370 / 18.6 = 20 s`; three shamblers `370 / 8.2 = 45 s` |
| Crawler | `Σ leg-hit dmg ≥ legs` | One 40-dmg leg hit crawls a shambler (34) |
| Drift reach | `r × DRIFT.perR` | A shot (45) × 8 = 360 m; a horde 300 m off turns and walks there in ~3 min |

## 5. Edge cases
- **Water:** the dead don't swim (`ai.wades`). A horde drawn across the island's lake stops at the shore. The drift check
  runs south over dry flats.
- **Below the street:** the underground keeps its own noise corridors. Senses never cross levels (`c.ug`).
- **Old saves:** memory is not saved. A loaded game's infected start knowing nothing (they re-sense in < 1 s).
- **Sprinter crawler:** its burst is disarmed for good (`zs.t = 1e9`).
- **Locked door, nobody remembered:** they wander. Only the Echo works it.
- **A stray far noise:** it can re-aim a drawn horde only if it is as loud, or nearer.
- **Not wired:**
  - `occupy` is not called by citygen or the ring on its own. It needs a hook in their building attach, which is the
    BACK-LOTS / citygen owners' code.
  - The population far-fold does not fold the infected (they are not `amb`). Their off-screen life is the overrun
    records plus the existing daylight clean-up.

## 6. Dependencies
| System | Needs from this | This needs from it |
|---|---|---|
| `main.js noise()` | — | every shot, kick, smash → `onNoise` (unchanged hook) |
| `systems/ai.js` | `onHurt` (the ONE new hook; the old `ztarget = attacker` line removed) | `move`, `knockT`, `wades` |
| `systems/overrun.js` | `remember`, `DRIFT` | `onNoise` drift block, a drift step in `update`, `view().drift` |
| `systems/interiors.js` | — | `doors` / `windows`, `unlock`, `damageBoards` (no change to the file) |
| `systems/stance.js` | — | `seenRange`, `conceal` (DECKS-STANCE) |
| `systems/gadgets.js` | — | `barred`, `BARRICADES` hp, `list[].lit` flares |
| `systems/throwables.js` | — | `fires` |
| `data/gear.js` | — | `HIT_ODDS` |
| BALLISTICS (`combat.js`) | set `c.hitPart` when a round knows its hit zone | none (file not touched) |
| residents, director, survival, gadgets lure | `ztarget` still works: it becomes a "told" fix | — |

## 7. Tuning knobs
| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `sense.sight` / `night` / `lit` | 32 / 13 / 38 m | 20–45 / 8–20 / 25–55 | How far you can stand in the open |
| `sense.cone` | ±65° | 45–90 | Sneaking up behind |
| `sense.smell` | 4.5 m | 2–8 | Hiding behind a door; past 8 they smell you through walls everywhere |
| `sense.memory` / `search` | 25 / 12 s | 10–60 / 5–30 | How long losing them takes |
| `FOOTSTEPS.run` / `walk` | 16 / 6 m | 10–25 / 3–10 | Running is loud; walking is how you pass |
| `door.dmg / door.every` | shambler 6/2.2, Echo 26/1.4 | Echo > 2× shambler | How long a barricade holds |
| `legs` | 34 | 20–60 | Crawler frequency |
| `lunge.at` | 2.8 m | 2–4 | The last-metre danger |
| `fall.chance` | 0.5 | 0.2–0.8 | A shotgun knocks them flat |
| `fire` | 6 m | 3–10 | How wide a moat a fire makes |
| `light` | 70 m | 30–120 | Flashlight risk at night |
| `DRIFT.perR` | 8 | 4–12 | How far a shot pulls a horde (r × perR) |
| `DRIFT.linger` | 90 s | 30–300 | How long they stand where the shot was |

## 8. Acceptance criteria (selftest, `node tools/dl.mjs selftest only="infected minds"`)
1. **Breeds:** `validateInfected` is clean. There are exactly three breeds (shambler, sprinter, echo); choir is the only
   site special. A broken row (an Echo no better at doors) and a fourth breed are both caught.
2. **Memory:** it sees you at 20 m, and you go out of all its senses. It reaches where it LAST saw you, never comes within
   45 m of where you are, searches within `searchR + 3` of the spot, and forgets.
3. **Stance:** prone in grass (concealment 0.8), 20 m in front of a shambler looking at you: never spotted in 4 s. Standing
   on the same spot: spotted.
4. **Drift:**
   - A horde record 300 m south sits by day.
   - One shot's noise → it hears it. You then go 450 m north, so it stays a record the whole way (no bodies stand up).
   - It arrives within `DRIFT.arrive + 5` of the shot.
   - No move in any 2 s step is over 4.5 m (1.4 m/s × up to three 1 s ticks): it walked, it never jumped.
5. **Doors:** an Echo thumps a planked wooden door open in < 35 s. Three shamblers that smell you behind the same door take
   more than 1.5× as long, or are still at it at the cap, and they thump (> 3 thumps).
6. **Crawler:** a 40-dmg leg hit makes a crawler (prone, alive, top speed ≤ `crawl`, still closing). The same hit to the
   torso does not.
7. **Law 6:** shot from 60 m outside its senses, it remembers a spot ≤ 20 m back along the hit, which is > 35 m from you.
8. **Fire:** coming at you round a 2.2 m fire patch, it never comes within `r + 2` of it.
9. **Light:** at night, 45 m off, it stays put with your flashlight off and comes to you (light or sight) when it goes on.
10. **The Echo's call:** an Echo 22 m off calls a resting shambler (`src: 'echo'`), which closes on it.

## What we learned from Project Zomboid (behaviour only; no code or assets)
Read: `media/lua/shared/Sandbox/*.lua` (the presets' `ZombieLore`/`ZombieConfig`), `Translate/EN/Sandbox.json` (what each
option means), and `media/lua/shared/NPCs/ZombiesZoneDefinition.lua` (who is where).
- **Senses are separate dials:** sight (eagle / normal / poor), hearing (pinpoint / normal / poor) and memory
  (long / normal / short / none). Memory is "how long they remember a player after seeing or hearing them". So memory
  is its own clock, not a side effect of chasing. → `sense.memory` / `search`, rows per breed.
- **Follow Sound Distance** (100 tiles by default): a zombie walks toward the last sound it heard. Rally groups (20,
  ±50%) migrate together, and Redistribute Hours spreads them over a cell. → the drift rule and the horde records.
- **"Environmental attacks" (`ThumpNoChasing`):** whether zombies that haven't seen or heard you attack doors while they
  roam. Default off. → only one that remembers thumps; the Echo is the designed exception.
- **`FenceThumpersRequired`** (25): it takes a crowd to bring down a tall fence. → a shambler's thump is weak and the
  Echo's strong; a crowd adds up linearly.
- **Fence lunge** after climbing over or through a window; **fake dead** ones on the floor that reanimate and grab;
  **crawl under vehicles**; **drag down** by several at once. → lunge, the fall/get-up grab and crawlers. Dragging down
  and crawling under cars are not built.
- **`SpottedLogic`:** hiding behind cars, weather and traits matter to being seen. → `stance.seenRange` with cover and
  grass (DECKS-STANCE).
- **Zones** dress the dead by where they stand (hospital, police, wedding, farm). → `INSIDE` rows by building kind.
- **Day/night activity** (`ActiveOnly`). → our day/night is light-driven (night sight, lit, the light pull). The overrun
  already digs hordes in by day; a drift is the exception.
- **Zomboid's zombies don't fear fire:** they walk into it and burn. The fire fear is our call (the brief's), a moat you
  can build.
