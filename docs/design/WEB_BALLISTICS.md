# WEB_BALLISTICS: bullet speed

Robert, 2026-10-28: "I also think we should [have] bullet speed."
Lane BALLISTICS of `WEB_DEPTH_PLAN.md`. Code: `web/src/systems/ballistics.js` (the flight), `web/src/systems/combat.js`
(`segment`, the one resolver), `web/src/data/ballistics.js` (rows + `validateRounds`), `web/src/systems/ai.js`
(`watch`, `leadAngle`), `web/src/agent/ballistics-api.js` (the `ballistics` command and the checks).

## 1. Overview

Every gun's round used to be a ray that landed the frame the trigger was pulled (`combat.hitscan`). Now a round is a
body in the air: it leaves the muzzle at its row's velocity, the air slows it, gravity pulls it down, and whatever the
shooter stands on (a car, a pickup's bed, a deck) carries it. It meets what is in its way **when it gets there**.

Each frame a round flies one straight swept segment (cut into sub-steps of at most 4 m), and each segment is resolved by
`combat.segment`, the very loop body the hitscan ran: people, cars, dogs, animals and the train in the same order, and
walls by what they are made of (`systems/materials.js`: through, off or into). Nothing about who can be hit, through
what, or for how much changed. What changed is *when*, and *where the target is by then*.

The rounds are a fixed pool of 256 (oldest-first recycle), their streaks one InstancedMesh (one draw call), and
nothing is allocated per frame or per shot.

## 2. Player Fantasy

- A rifle crack goes past your ear a beat before you hear the shot. A revolver round *whispers*.
- From a moving car you can feel the round carried forward: fire out of the side window at speed and the streak bends
  ahead of the car.
- A sprinting man at 35 m is not where the pistol was pointing when the round arrives. You lead him; so do the people
  shooting at you, and the good ones lead well.
- Tracers: every SMG burst draws a streak every third round, the rifle every second, every pellet of a shotgun. You see a
  burst walk onto a car.
- (GTA2 tightness: at the game's ranges a round still lands within a few frames. It changes *moving* fights, not
  standing ones.)

## 3. Detailed Rules

### 3.1 A round's life
1. `combat.fire` (every gun: the player's trigger, AI, crew, convoy gunners, deck riders, window shooters) rolls each
   pellet's spread and range jitter from **the shot's seed** (3.5), then calls `combat.hitscan` per pellet, as before.
2. `combat.hitscan` is the shot's entry. If the round has a row (`data/ballistics.js ROUNDS`) and is not fired up into
   the sky at a bird (fauna's `skyShot`), it is **launched** (`ballistics.launch`). Otherwise it is resolved instantly,
   exactly as before: vehicle mounts (`workshop.js`, which pass no ammo), sky shots, `ballistics on=false`.
3. Launch: velocity = muzzle velocity × the aimed line + the shooter's **platform velocity** (`inVehicle`, `firingFrom`,
   `onDeck.v`). Its line over the ground is that sum's direction; it starts 1.45 m above the floor it was fired on.
4. Each frame (`main.js` loop, after car combat): the round flies `n = ceil(speed·dt / 4 m)` sub-steps. Each sub-step's run
   and fall are closed-form (3.3). The run is a swept segment handed to `combat.segment`:
   - **miss**: it flies on.
   - **stop** (a person, car, dog, animal, train car, or a wall that stops it): it lands there.
   - **pass** (a wall it goes through or glances off): it carries on from the far side / the glance point, on the new line,
     with the damage and energy the materials law left it, inside the same sub-step (at most 4 walls, `PEN.segments`).
5. It ends: hit, **ground** (it has fallen below the floor it flies over: a puff of sparks and sometimes a mark),
   **range** (the gun's `range` reached: the same reach as before, so balance holds), or expired (4 s / under 5 m/s).

### 3.2 What did not change (the materials law and the hit order)
`combat.segment` is the old loop body verbatim, with the shooter's floor read from the floor it was **fired on**
(a round fired upstairs stays on that floor; one fired down from a window still reaches the street). Glass, boards and
doors (`interiors.onBullet`), door leaves (`materials.throughLeaf`), walls (`materials.bullet`), cars' plate
(`garage.absorb`), windows and whoever is behind them (`carCombat.onBulletHit`), dogs, fauna and the train are all as
they were. A mid-dive dodge still rolls on the victim's side.

### 3.3 Tracers and sound
- `tracerEvery` (per row): the Nth round a shooter fires of that kind draws a streak; the streak grows out of the muzzle
  to `tracerLen`, then runs ahead of its tail, and lingers 0.04 s at the impact (so a 3 m shot still draws muzzle to hit).
- A round that passes within 1.6 m of the player: faster than sound (343 m/s) it **cracks** (`audio.crack`, new); slower
  it **whispers** (the old `audio.whiz`). The pistol (305 m/s) is the subsonic round; the counters are in `ballistics`.

### 3.4 Leading (AI does not cheat)
- `ai.watch(c, t, dt)` runs every frame the shooter **sees** its target (`g.sees` / line of sight, the same test that lets
  it shoot). It keeps a velocity smoothed out of the positions it saw (time constant `LEAD.smooth`); half a second out of
  sight, or a new target, starts it over.
- `ai.leadAngle(c, t, tx, tz, round)` aims at where that velocity puts the target when the round gets there: the
  target's velocity minus the shooter's own platform velocity (the round inherits it), times the closed-form flight time,
  iterated twice. The lead is off by ±`LEAD.err` (re-rolled every 0.4 s), times the suppression penalty
  (`tactics.aimMul`); a person with `leadErr` set (a marksman) uses theirs. Under `LEAD.minSpeed` there is no lead.
- **Law 6 (NPCs never know what they weren't told or didn't see):** the lead is built only from `watch`, which only runs
  under sight. Out of sight, `ai.seenAt(c, t)` is where the shooter *believes* the target is: the last sighting carried
  on along the motion it saw for at most `LEAD.coast` (0.8 s), never the true position. Suppressive fire at a man who
  ducked behind cover (`ai.js`, the tactics brain's pinning element) and a convoy deck gunner who lost you aim there. A
  target that doubles back behind the wall is shot at where he was heading. Two seconds unseen (`LEAD.forget`) and the
  next sighting starts a fresh estimate. Firing at noise is the tactics brain's last-known point (`tac.lastX`), never the
  true position; this lane did not change that.
- The old "spread grows with a moving target" penalty stays: AI is still deliberately worse than you.
- Wired: the main AI fight loop (`ai.js`) and convoy gunners (`convoy.js`). Not yet: deck followers (`decks.js`, DECKS-STANCE's
  file) and crew deck gunners (`crew.js`): they fire at the live position (see 5).

### 3.5 Shard shape (law 5)
- **One seed per trigger pull.** `ballistics.seed(ch, …)` hashes the shooter's id with the pull's number; every pellet's
  spread and range jitter in `combat.fire` comes from it (mulberry32). The record (`ballistics.record()`, a ring of 64) is
  `{ seq, seed, by, ammo, round, x, z, ang, pvx, pvz, pellets, t }`: everything a remote page needs to fly the same
  rounds (`combat.fire(ch, wkey, ang, row, seed)` replays one).
- **The wire contract (v0.1, no live net path yet: `WEB_SHARD.md` §3.1 has no PvP over the wire):**
  1. The shooter's page sends `shot` = the record above (≈ 60 bytes) at the trigger pull.
  2. Every page that receives it flies the rounds locally for the **visuals and sound** (streaks, cracks, impacts on its
     own walls), with `ghost` damage: a remote's round never applies damage on a page that does not own the victim.
  3. **The victim's page is authoritative for a hit** (the Godot pattern, `WEB_SHARD.md` §3.9): the page that owns the
     victim (the victim player's own page; for an NPC, the area host's) resolves the flight against its own copy of the
     victim and, on a hit, applies the damage and sends `hit { seq, by, victim, part, dmg }`. The shooter's page shows the
     hit marker when that message arrives (not before: a success the server didn't see doesn't happen, law 1).
  4. World damage (a breached wall, a broken window) stays last-writer-wins per row (`WEB_SHARD.md`), sent by the page that
     owns the area.
  5. Lag: the victim resolves the round with the shooter's muzzle and time from the record; the victim's position is its
     own (no rewind). A round that takes longer than the victim's presence interval is simply judged by where they were.

### 3.6 Shotgun shells

A shotgun's fire modes are the shells it loads (`combat.js SHELLS`, the sawn-off and the pump):

| Mode | Box in the pack | Pellets | Damage each | Reach | Spread | Flight row |
|---|---|---|---|---|---|---|
| BUCK | `ammo_shells` | the gun's (8 / 7) | 14 / 15 | 22 / 26 m | x1 | `shells` |
| BIRD | `ammo_birdshot` | twice the gun's (16 / 14) | 27% of buck (4) | 65% of buck (14 / 17 m) | x1.45 | `birdshot` |
| SLUG | `ammo_slug` | 1 | 82 / 85 | 40 / 45 m | x0.11 | `slug` |

Each mode draws its own box (`g.inv.ammo[arms.ammoOf(k)]`). Switching to a different shell works the loaded shells back
into the pack (mag to 0) and cancels a reload under way; auto-reload or R then loads the new kind. With none of the new
kind on you the gun stays empty and the HUD's reserve reads 0. NPC shooters fire the weapon row as it stands (BUCK).
Birdshot does about 64 damage a pull against buck's 112, spread wide: it drops a dog or a bird and stings a man.

## 4. Formulas

Linear drag `k` (1/s), muzzle velocity `v0`, gravity `g = 9.81`.

- Speed after `x` m: `v(x) = v0 − k·x` (so no round flies further than `v0 / k`).
- Time to `d` m: `t(d) = −ln(1 − k·d / v0) / k`.
- Fall below the line, fired level: `drop(t) = (g/k)·t − (g/k²)·(1 − e^(−k·t))`.
- Per sub-step `h` (exact): `run = v·(1 − e^(−k·h))/k`, `v ← v·e^(−k·h)`, `vy ← (vy + g/k)·e^(−k·h) − g/k`.
- Damage carried: `dmg × (1 − falloff × (1 − v / v_launch))`, `falloff = 0.5`.
- Lead: `aim = target + (v_target − v_platform) × t(d') × (1 ± err)`, `d'` iterated twice, capped at 12 m.

**Example (the service rifle, v0 = 850, k = 0.64):** at 30 m, `t = −ln(1 − 0.0226)/0.64 = 0.036 s`; at 300 m,
`t = −ln(0.774)/0.64 = 0.400 s`, so the far shot lands **0.364 s** later. At 400 m: `t = 0.560 s`, `drop = 15.33·0.560 −
23.95·(1 − e^(−0.358)) = 1.38 m`, speed 594 m/s. Damage at its 68 m reach: `v = 806.5`, `24 × (1 − 0.5 × 0.051) = 23.4`.

**Example (lead):** a man sprinting across at 7 m/s, 35 m from a revolver: `t = −ln(1 − 0.55·35/305)/0.55 = 0.119 s`, so
the lead is 0.83 m, more than his 0.5 m body. Unled, a steady hand misses; led within ±35% it hits.

| Round | v0 m/s | drag | sonic | t(30 m) | reach v0/k | tracer |
|---|---|---|---|---|---|---|
| pistol | 305 | 0.55 | sub | 0.100 s | 555 m | every |
| smg | 380 | 0.9 | super | 0.080 s | 422 m | 1 in 3 |
| rifle | 850 | 0.64 | super | 0.036 s | 1328 m | 1 in 2 |
| shells (buck) | 400 | 2.2 | super | 0.082 s | 182 m | every pellet |
| birdshot | 370 | 3.4 | super at the muzzle | 0.095 s | 109 m | 1 pellet in 2 |
| slug | 450 | 1.1 | super | 0.068 s | 409 m | every |
| bolt | 90 | 0.12 | sub | 0.339 s | 750 m | every (no weapon yet) |

## 5. Edge Cases

- **Frame rate:** the flight is closed-form, and each sub-step's segment is swept, so a rifle round that flies 42 m in one
  20 fps frame still meets the 0.3 m wall in it (check: `no round passes a poured-concrete wall at any frame rate`).
- **Moving targets within a frame:** sub-steps ≤ 4 m, so a man moves at most ~3 cm per sub-step against a rifle round.
- **Point blank / hugging a wall:** unchanged (`fire` still starts the round at the hand when the barrel is past glass).
- **Own vehicle:** a round fired from a car's window inherits its velocity and its line skips its own car, as before.
- **Riding shooters must lead too:** a player firing from a moving bed aims behind a roadside target by the bed's speed ×
  flight time (≈1 m at 11 m/s and 30 m with the revolver). The decks check `shooting from the bed of a moving pickup` now
  aims that way (its claim, a hit from the moving bed, is unchanged).
- **Shooter dies mid-flight:** the round still lands and is credited to them.
- **Pool full (256 in the air):** the oldest round is dropped (`recycled` counter). The stress scene never reaches it.
- **Save/load:** rounds in flight are not saved (they are gone within a second).
- **Sky shots at birds** stay instant (their rise is solved by fauna's `skyAim`).
- **Vehicle mounts** (machine gun, autocannon in `workshop.js`) stay instant: a follow-up lane can give them `ammo`.
- **Terrain:** the ground test is "fallen below the floor it was fired on". On the real-elevation strip a round over a
  dip flies on; over a rise it meets the land late. At game ranges the drop is centimetres, so it never matters until
  ranges grow (the SITES-TERRAIN pad-height floors are the hook).
- **Deck followers / crew deck gunners** do not lead yet (owned by other lanes; one call each: `g.ai.watch` + `g.ai.leadAngle`).

## 6. Dependencies

- **Uses:** `combat.js` (fire, the resolver), `materials.js` (bullet, throughLeaf, punch), `interiors.js`, `garage.js`,
  `carcombat.js`, `vehicledamage.js`, `dogs.js`/`fauna.js`/`train.js` raycasts, `storeys.js` (floors), `decks.js`
  (covered), `fx.js` (sparks, decals, `up`), `audio.js` (whiz, new `crack`), `tactics.js` (aimMul).
- **Used by:** every gun; `ai.js` (lead); `convoy.js` (lead); the `ballistics` command; the shard (record + contract).
- Shared-file hooks: `main.js` (construct + one update call), `api.js` (commands, checks, the `fire` command settles its
  rounds), `arms.js` (a mode's `round`), `audio.js` (`crack`), `convoy.js` (lead).

## 7. Tuning Knobs (`data/ballistics.js`)

| Knob | Default | Safe range | Effect |
|---|---|---|---|
| `velocity` | 90-850 | 60-1200 | flight time; under 343 it whispers instead of cracks |
| `drag` | 0.12-3.4 | 0-4 | how fast it slows; reach = velocity / drag |
| `tracerEvery` | 1-3 | 0-10 | streak frequency (0: none) |
| `tracerW` / `tracerLen` | 0.02-0.055 / 0.6-4 | 0.015-0.08 / 0.4-6 | streak look: a pellet is a spark, a rifle round a needle. Robert (2026-10-29) rejected the first set (0.07-0.13 m wide, up to 10 m long) as planks |
| `BALLISTICS.cap` | 256 | 64-512 | rounds in the air before recycling |
| `BALLISTICS.maxStep` | 4 m | 1-8 | sub-step length (moving-target fidelity vs cost) |
| `BALLISTICS.falloff` | 0.5 | 0-1 | damage lost with speed |
| `BALLISTICS.nearMiss` | 1.6 m | 1-3 | crack / whisper radius |
| `LEAD.smooth` | 0.25 s | 0.1-0.6 | how fast a watcher's velocity estimate follows |
| `LEAD.err` | 0.35 | 0-1 | average lead error |
| `LEAD.maxLead` | 12 m | 4-30 | the most a shooter will lead |
| `LEAD.coast` | 0.8 s | 0-2 | how long an unseen target is believed to keep its last motion |
| `LEAD.forget` | 2 s | 0.5-5 | unseen this long, the motion estimate starts over |

## 8. Acceptance Criteria (the named selftest checks, `agent/ballistics-api.js`)

1. `ballistics: the round rows validate …` — `validateRounds` passes the rows, catches a broken row, and every gun and
   fire mode fires a round with a row.
2. `ballistics: a 300 m rifle round lands later than a 30 m one by the closed-form flight time …` — real rounds at real
   men down a clear line of the flats: each measured flight within one frame of `t(d)`, the gap ≈ 0.364 s, both hit.
3. `ballistics: a rifle round fired level is 1.38 m under its line at 400 m …` — the integrator at 20 and 144 fps agrees
   with the closed form within 2% (time within 1%).
4. `ballistics: no round passes a poured-concrete wall at any frame rate …` — rifle and pistol at dt 1/20 and 1/144: every
   round stops in the wall, the man behind is untouched.
5. `ballistics: a round fired out of a moving car's window carries the car's velocity …` — through the real
   `fireFromVehicle` path: the round's velocity = muzzle velocity along the gun's line + the car's 22 m/s, within 0.5 m/s.
6. `ballistics: an AI shooter leads a man running across its line …` — `ai.watch` + `ai.leadAngle` vs aiming at where
   he is: led > 60% hits and well over the unled count.
7. `ballistics: law 6 - out of sight, a shooter aims where the man was heading …` — seen running +z for 1 s, then
   doubling back unseen for 0.5 s: `seenAt` is the last sighting + 0.5 s of the seen motion (±0.6 m), > 4 m from the truth.
8. `ballistics: one seed flies one flight …` — a shotgun pull replayed from its record lays the same eight lines.
9. `ballistics: the sawn-off loads BUCK, BIRD or SLUG from its own box …` — 10 buck, 10 bird, 4 slug in the pack, 2 buck
   loaded: BUCK fires 8 pellets on `shells`; switching to BIRD puts the 2 back (buck 12, mag 0), the reload takes 2
   birdshot (8 left) and the pull flies 16 pellets on `birdshot`; SLUG puts those 2 back (birdshot 10), loads 2 slugs
   (2 left) and flies 1 on `slug`. Check 1 also requires every mode's `ammo` to have a pack item and a flight row.
Plus the existing combat, materials, security, roles checks green twice on fresh pages, `scenario name=stress` not
regressed, and tracer screenshots in `docs/renders/web/ballistics/`.
