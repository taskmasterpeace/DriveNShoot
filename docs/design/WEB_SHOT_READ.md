# SHOT READ: seeing who is shooting at you, and enough rounds to answer

Lane: BALLISTICS (third pass), branch `feat/web-shot-read`, built on `play/845`.
Rows: `web/src/data/shotread.js` (`SHOT_READ`), `web/src/data/items.js` (`LOOT`). System: `web/src/systems/shotread.js`.
Checks: `web/src/agent/shotread-api.js`. Related: `WEB_BALLISTICS.md` (the flight), `WEB_CALIBERS.md` (the rows it draws from).

## 1. Overview

From Robert's playtest on 2026-10-29:
- "It doesn't feel like the AI is shooting back. If they are, I can't see where they're coming from."
- "I wish I had more ammo."

The enemy was firing. The player could not read it, for three reasons:
- Only one round in `tracerEvery` drew a streak, and the halved streaks were short and thin.
- A miss left nothing behind but a sound.
- Nothing pointed back at the shooter.

This pass makes every shot fired at the player readable in five ways:
1. **Muzzle flash:** a bigger flash at the shooter.
2. **Trail:** a streak on every round fired at you, short but visible.
3. **Sound:** the near-miss crack or whiz (it already existed; it now also places a marker).
4. **Impact puffs:** dust where a round lands near you.
5. **Marker:** a small chevron at the screen's edge pointing at where the shot came from. It is amber on a miss and red on a hit.

The rule against regeneration and free supplies stays. This pass only raises the world's first stock of common rounds, as loot-table rows that are rolled once.

## 2. Player Fantasy

You are walking down a street when a flash appears up the block, a bright streak cuts past your shoulder and the air cracks. Dust kicks up off the wall beside you, and an amber chevron at the screen's edge points up the street to where it came from. You know at once that someone is shooting at you and from where, so you can duck, turn and answer. On a hit the chevron goes red.

After that first fight you search the raider, find a magazine's worth of rounds, and have enough to fight again. You are not rich; you can fight a few more times.

## 3. Detailed Rules

### 3.1 A shot at you

A round is **at you** when all of these hold:
- the shooter is not the player, and is a character or vehicle (not a dog);
- the player is alive;
- the round's line passes within `reach` m of the player, ahead of the muzzle, inside the round's range plus `reach`.

The test is `ShotRead.at()`.
- `ballistics.launch` asks it for every flying round and marks the round `read`.
- `combat.fire` asks it once per pull to size the flash (that call is not counted).

What a round at you gets:
- **Muzzle flash:** the size and the light power are multiplied by `flashMul`. The light is still the fixed pool's one flash light, so the light count does not change.
- **Trail:**
  - It always draws, whatever the shooter's 1-in-`tracerEvery` count says. The count still advances.
  - Its length is `max(own, clamp(sp x lenT, minLen, maxLen))`, never longer than it has flown.
  - Its width is `tracerW x wMul`.
  - It stays drawn `fade` s after it lands, so a miss that whips past in two frames is seen.
- **Near miss:** a round passing within `BALLISTICS.nearMiss` m still cracks if it is faster than sound, else whizzes. Either way it now also raises the marker.
- **Impact:** any round fired by someone else that stops within `puffR` m of the player (in a wall, a car, the ground or the train):
  - kicks up `puffN` dust puffs (the shared particle pool);
  - raises the marker.
- **Hit:** a bullet wound on the player raises the marker in red. The existing red hurt arc (`ui/feedback.js`) still shows next to the player.

### 3.2 The marker

- **Pool:** there are `markMax` chevrons, one per shooter.
  - A burst from one shooter refreshes that shooter's marker. Its position updates at most every `markMin` s.
  - A new shooter takes a free chevron, or else the oldest one.
- **Origin (law 6):** it points at where the round was **fired from** (`F`, the shooter's spot at the trigger). It never points at where the shooter stands now: the player saw a flash and heard a crack there, and nothing more.
- **Placement:**
  - The bearing is on screen: the shot's origin projected through the camera, measured from the player's projected position.
  - The chevron sits on an ellipse at `markEdge` of the half screen.
- **Lifetime:** full strength for the first half of `markLife`, then it fades. A hit turns that shooter's chevron red until it fades.

### 3.3 More first-stock rounds (data rows; rolled once, never refilled)

| Table | Who rolls it | Change |
|---|---|---|
| `bedroom` | home bedrooms, wardrobes | + `.45` box (6–14), + shells (2–6) |
| `garage` | garages, a toolbox | + shells (3–8) |
| `person` | a passer-by's body | + `.45` (3–10), + 9mm (5–15) |
| `raider` | a raider's body | more 9mm, `.45` and shells; empty-roll weight 2 → 1 |
| `soldier` | a soldier's body | 5.56 4×10–40 → 5×20–50 |
| `gunsmith` | the gun shop, a roof crate | rolls 2–4 → 3–5; more `.45`, 9mm, shells, 5.56 |
| `trunk_patrol` (new) | a patrol car's trunk | 9mm, `.45`, shells, a few slugs, a bandage, a flare, the odd pump gun |

The patrol trunk is the one code hook in this part.
- `inventory.trunk(v)` rolls `LOOT['trunk_' + v.type]` when the trunk is first created, seeded by the car's id.
- A save holds every trunk that exists, so a loaded trunk keeps what was left in it. An emptied trunk stays empty.
- Nothing ever re-rolls.

## 4. Formulas

**At you.** Let `p` be the player relative to the muzzle and `d` the unit line.
- `along = p·d`
- `off = |p × d|`
- The round is at you when `0 < along ≤ range + reach` and `off ≤ reach`.
- Example: a raider 26 m north fires a 5.56 at a point 1.1 m east of you. Then `along ≈ 26` and `off ≈ 1.1 ≤ 5`, so the round is at you.

**Streak of a round at you.**
- `L = min(flown, max(own, min(maxLen, max(minLen, sp × lenT))))`, where `own = min(tracerLen, sp × streakT)`.
- 5.56 at 850 m/s: `own = min(1.9, 1.87) = 1.87`; `sp × lenT = 3.8`, capped to 3.2. So L = 3.2 m (it was 1.87 m).
- .45 at 305 m/s: `own = 0.67`; `sp × lenT = 1.37`. So L = 1.37 m (it was 0.67 m).
- Range: 1.1–3.2 m, against 2.2–4 m for the full tracers before the CALIBERS pass. It is shorter than the old streaks and no longer invisible.

**Width.** `tracerW × 1.8`. A 0.035 m streak becomes 0.063 m.

**Flash.** `size × 1.35`. A rifle's 1.4 becomes 1.89; a shotgun's 2.2 becomes 2.97.

**Expected common rounds per container.** Common rounds are `.45`, 9mm, buckshot and 5.56.
- `E = mean(rolls) × Σ(wᵢ / (none + Σw)) × mean(lo, hi)`.
- Measured by `expectedRounds()`, offline over the data rows.

| Table | Before | After |
|---|---|---|
| `bedroom` | 0 | 1.38 |
| `garage` | 0 | 0.41 |
| `person` | 0 | 0.92 |
| `raider` | 5.79 | 9.76 |
| `soldier` | 7.69 | 12.96 |
| `gunsmith` | 28.59 | 60.16 |
| `trunk_patrol` | none | 25.12 |

A first house of three to five containers turns up a box about one time in two. Two raider bodies give about a magazine and a half.

## 5. Edge Cases

- **Shotgun pellets at you:** every pellet is at you, so a buckshot blast draws all its pellets. That is a readable cone, short and wide.
- **Firefights near you that are not aimed at you:** a raider's round that hits a wall within 7 m of you still puffs and marks him. That is honest, because rounds are landing near you.
- **The player's own fire:** it never puffs, never marks and is never `read`. The tracer rules and the CALIBERS checks are unchanged for it.
- **Ghost rounds (a remote replay):** never `read`, never drawn as at you.
- **A dog's or an animal's bite:** not a shot. The shooter test excludes dogs, and only bullet wounds raise the hit marker.
- **The shooter straight above the camera (a zero-length bearing):** falls back to the world bearing.
- **The shot's origin behind the camera:** the projection flips, so the marker direction is flipped back.
- **God mode or clinic grace:** the hit is ignored before the marker. Near misses and puffs still read.
- **A patrol car the player owns, or a stolen one:** its trunk rolled once. Emptied, it stays empty across opens and saves.
- **Vehicle mounts (still hitscan):** their segments still crack, puff and mark (`combat.segment`). They do not draw the read streak, because they do not fly.
- **More than `markMax` shooters:** the oldest marker is reused.

## 6. Dependencies

- **`WEB_FEEL.md`:** the feel harness measures how many of a raider's shots you can place (on screen or marked) and
  holds it in a band (`data/feel.js` foeTold); it added `markReach` (below), which marks the shooter as a round at you
  leaves the muzzle.
- **`WEB_BALLISTICS.md`:**
  - `launch` marks `read`;
  - `streakLen` and `draw` apply minLen, lenT, maxLen and wMul;
  - `land` uses `fade`;
  - `groundHit` calls `impact`.
- **`WEB_CALIBERS.md`:** the per-calibre `tracerLen`, `tracerW` and `streakT` are the base the read streak grows from. The "half as long" check measures the player's own rounds, which this pass does not touch.
- **`systems/combat.js`:**
  - `fire` scales the flash;
  - `segment`'s near miss calls `nearMiss`, and its impacts call `impact`;
  - `damage` calls `hit`.
- **`ui/feedback.js`:** the red hurt arc beside the player stays. The marker is the far one, at the screen's edge.
- **`systems/inventory.js`:** `trunk()` rolls `trunk_<type>`; `roll()` takes a table name.
- **`data/items.js`:** the LOOT rows.
- **Shared-file hooks:**
  - `main.js`: construct, update;
  - `systems/ballistics.js`: import, the `read` flag, streak and width, fade, ground impact;
  - `systems/combat.js`: import, flash, near miss, impact, hit;
  - `systems/inventory.js`: the trunk roll, the `roll` table argument;
  - `data/items.js`: rows;
  - `agent/api.js`: import, command spread, the checks call.

## 7. Tuning Knobs (`data/shotread.js`)

| Knob | Value | Safe range | Affects |
|---|---|---|---|
| `reach` | 5 m | 2–10 | how near a line must pass to count as at you (bigger means more streaks) |
| `minLen` | 1.1 m | 0.6–2 | the shortest streak a round at you shows |
| `lenT` | 0.0045 s | 0.002–0.01 | the streak per unit of speed for a round at you |
| `maxLen` | 3.2 m | 2–5 | the cap (Robert: "a little too long" lives above about 4) |
| `markReach` | 5 m | 2.5–8 | a round whose line passes within this of you marks its shooter as it is fired (WEB_FEEL.md; 0 = near misses and hits only) |
| `wMul` | 1.8 | 1.2–3 | the streak's width |
| `fade` | 0.1 s | 0.04–0.25 | how long a missed round stays drawn after it lands |
| `flashMul` | 1.35 | 1–2 | the flash of a shot at you |
| `puffR` | 7 m | 3–12 | the radius of dust near you |
| `puffN` | 3 | 1–6 | puffs per landing (shared particle pool) |
| `markLife` | 1.8 s | 1–3 | how long a marker stays |
| `markMax` | 4 | 2–6 | markers at once |
| `markEdge` | 0.44 | 0.35–0.48 | how far toward the screen edge the ring sits |
| `markMin` | 0.25 s | 0.1–0.5 | the slowest a burst's marker moves |

Loot: row weights and counts in `data/items.js LOOT`. Keep `raider` and `person` low. Rounds come from fights, not from walking past houses.

## 8. Acceptance Criteria (named checks in `agent/shotread-api.js`)

1. **`shot read: the knobs validate, and the first stock holds more common rounds...`**
   - The validator passes and catches a bad row.
   - `expectedRounds`: bedroom ≥ 1, person ≥ 0.5, `trunk_patrol` ≥ 15, and raider, soldier and gunsmith ≥ 1.4× before.
   - Across 8 patrol cars, the average trunk holds ≥ 8 common rounds.
   - An emptied trunk is the same container and still empty.
2. **`shot read: a raider's rifle round that passes a metre beside you is drawn...`**
   - A round fired away from you is neither `read` nor a tracer.
   - A round 1.1 m beside you is `read`. Its streak is between `minLen` and `maxLen`, and its width is at least `tracerW × wMul`.
   - At least one near miss and one crack are counted.
   - An amber marker records the shooter's spot to within 1 m, and its screen bearing is within 12° of an independent projection.
   - The flash of the shot at you is at least `flashMul` × the flash of the shot away.
3. **`shot read: a round that slaps into the wall in front of you kicks up dust there...`**
   - A `.45` stopped by a block wall 4 m in front of you counts a puff and an amber marker.
   - A `.45` that hits you counts a hit and turns the marker red.
- **The rest of the battery:** every existing check still passes, including the CALIBERS check that the player's tracer is at most half as long as before.
- **Budgets:**
  - Stress does not regress.
  - Draw calls stay under 150: the markers are DOM elements, and the streaks are the same single instanced mesh.
  - Lights stay fixed.
  - ip-lint reports 0 deny.
