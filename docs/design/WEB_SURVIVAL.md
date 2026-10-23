# WEB_SURVIVAL — water, food, rest, sleep and bite fever (web engine)

**Status:** water and food SHIPPED 2026-10-22 (earlier in the session); rest, sleep, microsleeps and BITE FEVER SHIPPED
2026-10-22 late. Code: `web/src/data/survival.js` (NEEDS, STAGES, EFFECTS, SLEEP, FEVER), `web/src/systems/survival.js`,
hooks in `main.js` (beds, input while asleep or blacked out), `systems/zombies.js` (a bite), `systems/combat.js`
(sway, pain wakes), `systems/inventory.js` (antibiotics, the bedroll), `ui/hud.js` (the REST dial, ailments, the sleep
screen, the blackout). Agent commands `needs`, `sleep`, `fever`; selftest "survival: …", "rest: …", "fever: …".

## 1. Overview

The player's body runs on three needs, each 0 (empty) to 1 (full), draining on the game clock (a game hour is 30
real seconds; T runs it x40): **water**, **food** and **rest**. Each wears in pips as it falls (0–4), and each pip
costs something: stamina recovery, the stamina cap, health, the steadiness of your aim, the dark at the edges of the
screen, and at the bottom of rest, microsleeps. Water and food are restored by eating and drinking (WEB_INVENTORY);
rest only by **sleep**, in a bed, on a bedroll or on the bare ground, while the night runs x40 and anything dangerous
wakes you. A bite from the infected leaves a dirty wound: **BITE FEVER**, 36 game hours of taxes on the body that only
antibiotics and a full night's sleep break early. It never kills, and the player never turns (canon:
docs/design/THE_INFECTED.md §3.6).

## 2. Player fantasy

You have been awake since yesterday morning. Your hands won't hold the sights still, the edges of the world are going
dark, and twice on the drive back the road simply wasn't there for a second. There is a mattress in the back room of
the boarded-up house on the edge of town, and you lie down on it with the door shut and your rifle beside you; you
wake at two in the morning to something dragging its feet past the window. The bite on your forearm is hot. You have
one blister pack of antibiotics. You take it, and you need one good night's sleep somewhere safe.

## 3. Detailed rules

**Needs** (`NEEDS`): water 40 game hours from full to empty at rest (x2 sprinting, x1.25 in the day's heat); food 80
(x1.3 sprinting); rest 20 awake (x1.35 sprinting). Pips at 0.35, 0.18, 0.06 and 0. Words: THIRSTY / PARCHED /
DEHYDRATED / DYING OF THIRST; PECKISH / HUNGRY / WEAK WITH HUNGER / STARVING; TIRED / WEARY / EXHAUSTED / DEAD ON YOUR
FEET. A pip that worsens while awake toasts its word.

**Effects** (`EFFECTS`, multiplied across needs): staminaRegen and maxStamina (the movement code), hpPerMin (thirst and
hunger at pip 3–4 hurt), vignette (the darkened edges), sway (the player's weapon spread x sway; rest pip 2: x1.15,
pip 3: x1.35, pip 4: x1.6), microsleep (rest pip 4).

**Microsleeps:** dead on your feet, every 35–80 s (uniform) your eyes close for 1.4 s: the screen goes black, the keys do
nothing, and a car you are driving loses gas and steering (it coasts on in a straight line).

**Sleeping.** **N** sleeps wherever you can: a **bed** (every mattress in a building, `world.spawns.beds`, within
1.8 m; E there too), a **bedroll** you carry (also from the PACK screen: it sleeps you where you stand), or the
**seat of a parked car** (driver or passenger, under 0.4 m/s; the car is held on the handbrake while you sleep). The
bare ground is agent-only in v1. The first TIRED toast says "N TO SLEEP". Allowed when
REST is below 0.85, not in a vehicle, and with nobody hostile and none of the infected within 18 m. Asleep: you lie on
it (the body flat on its back on the mattress), time runs x40, REST refills `1/7 x quality` per game hour (bed 1,
bedroll 0.8, a car seat 0.65, ground 0.5), water and food drain at half their waking rate, and nothing else you do counts. You wake:
**rested** (REST ≥ 0.995, or 11 game hours), **woken** (hurt; a hostile or one of the infected within 12 m, checked
twice a second; a noise that reaches you, at most 40 m), or **getting up** (E). A **full night** is one you wake from
rested after at least 3 game hours. The sleep screen shows the clock running and the REST bar filling.

**The town sleeps too** (`TOWN_NIGHT`, systems/ai.js): from 22:00 to 06:00 the town's own people (drifters and named
townsfolk; never the wardens on night shift, soldiers, raiders or your followers) claim a bed within 25 m of home that
nobody has claimed tonight, else a floor spot of their own (a body's length clear of other sleepers and the walls),
walk there (25 s, then the floor where they stand), lie down on a rolled-out bedroll (one instanced draw call for every
floor sleeper, the player's bedroll too) and sleep till dawn. A noise wakes them only within 45% of its reach (asleep,
behind walls: gunfire at the town wall doesn't wake the far side of town); pain, a fight they are pulled into, or
someone standing at the bedside for 1.5 s wakes them (the bedside intruder is a `trespass` deed), and a
woken sleeper stays up 45 s. Asleep they **witness nothing** (deeds.js) and a **trader keeps no counter** (trade.js):
night burglary is a choice the town gives you. E at a sleeper wakes them ("Wake Doc Reyes") and opens the talk.

**BITE FEVER** (`FEVER`): a bite from the infected that lands on the player (not in god mode) starts it, or starts its
clock again (a new dirty wound undoes a treatment). It lasts 36 game hours. While it runs: stamina regen x0.75, food
drains x1.3, sway x1.1, the edges darken (0.12). **Antibiotics** (an item: clinics, armories, Doc Reyes's shelves)
treat it; a full night's sleep after the treatment breaks it ("THE FEVER BROKE"). Untreated it passes on its own at
36 h ("THE FEVER PASSED"). It never takes health by itself.

**Ailments:** beside the vitals, stamped tags for what is wrong with you right now: FEVER · DIRTY WOUND (FEVER ·
TREATED once treated), BLEEDING, and any need two pips down or worse, in its own words; red at pip 3+.

**The HUD:** three dials on the status plate (FOOD, WATER, REST), each pulsing below 0.22.

**Saves:** water, food, rest and the fever (its end hour and whether it is treated) are saved; a save from before has
REST 0.9 and no fever. A load never resumes a sleep.

## 4. Formulas

| Name | Formula | Variables and ranges | Example |
|---|---|---|---|
| Drain (awake) | `need −= drainPerHour · sprint? · heat? · feverFood? · h` | h = dt · timeScale · (fast ? 40 : 1) game hours | rest, 4 h awake walking: 4/20 = −0.2 |
| Drain (asleep) | water/food `−= drainPerHour · 0.5 · h`; rest `+= h · quality / 7` | quality 0.5–1 | bed from 0.3: 0.7·7 = 4.9 h to rested |
| Pip | count of lines `[0.35, 0.18, 0.06, 0]` with need ≤ line | 0–4 | rest 0.05 → pip 3 |
| Sway | `Π sway(pip) · (fever ? 1.1 : 1)` | 1–1.76 | exhausted and fevered: 1.35·1.1 = 1.49 |
| Stamina regen | `Π staminaRegen(pip) · (fever ? 0.75 : 1)` | 0.1–1 | tired + fever: 0.92·0.75 = 0.69 |
| Fever food drain | `1/80 · 1.3` per game hour | — | 2 h fast-forwarded: 0.0325 |
| Full night | woke rested AND slept ≥ 3 h | — | from REST 0.84 in a bed: 1.1 h, not full |
| Microsleep | every U(35, 80) s at REST pip 4, 1.4 s long | — | ~1 blackout a minute |

## 5. Edge cases

- **Hurt while asleep:** woken at once ("WOKEN · HURT"), not a full night.
- **Danger already close:** you cannot lie down ("NOT WITH THE INFECTED THIS CLOSE"); danger at 12–18 m after you lie
  down wakes you only when it comes within 12 m.
- **A gunshot far away:** heard only within its own noise radius and at most 40 m.
- **Dying asleep:** the sleep ends with no toast; the respawn rules as ever.
- **Microsleep at the wheel:** gas and steering go to zero for 1.4 s; the car coasts. No crash is forced; the road
  decides.
- **T while asleep:** ignored (sleep forces x40; waking returns to x1).
- **Bitten again while treated:** the treatment is undone (a new wound); take antibiotics again.
- **Antibiotics with no fever:** they still heal 4; the fever line says nothing.
- **Sleeping with the PACK screen open (a bedroll):** the screen closes.
- **Old saves:** no `rest` → 0.9; no `fever` → none.

## 6. Dependencies

- `systems/combat.js` reads `g.needs.sway` for the player's spread; `damage` on the player calls `survival.hurt()`.
- `systems/zombies.js` calls `survival.bitten()` when a bite lands on the player.
- `systems/inventory.js` (WEB_INVENTORY): antibiotics' `cure` calls `survival.antibiotics()`; the bedroll's `act: 'sleep'`
  calls `survival.sleepAt('bedroll')`; the item rows (`bedroll`, `antibiotics`) and loot live in `data/items.js`.
- `main.js`: input while asleep (E only) or in a microsleep (none), beds (`bedNear`, the E prompt), `noise` →
  `survival.heard`, T ignored asleep, stamina from `staminaRegen`/`maxStamina`.
- `world/city.js`: every mattress registers a bed (`spawns.beds`).
- `systems/characters.js`: a sleeping person lies flat (`ch.sleeping`, `ch.bedY`).
- `ui/hud.js`: the dials, ailments (words from `NEEDS`), the sleep screen, the blackout, the tired edges.
- `agent/api.js`: `needs` (rest=), `sleep`, `fever`, snapshot/restore through `survival.save/load`.
- THE_INFECTED.md §3.6 (canon for the fever: never a turn); WEB_FAN_SERVICE_BIBLE (the survival-sim genre row).

## 7. Tuning knobs

| Knob | Where | Value | Safe range | Affects |
|---|---|---|---|---|
| rest.drainPerHour | data/survival.js | 1/20 | 1/30–1/14 | how often you must sleep (once a game day) |
| SLEEP.perHour | data/survival.js | 1/7 | 1/10–1/5 | how long a night takes |
| SLEEP.quality | data/survival.js | bed 1, bedroll 0.8, car 0.65, ground 0.5 | 0.3–1.2 | why a bed is worth finding |
| SLEEP.drain | data/survival.js | 0.5 | 0.2–1 | what a night costs in water and food |
| SLEEP.wakeR / wakeNoise | data/survival.js | 12 / 40 m | 6–20 / 20–80 | how jumpy sleep is |
| SLEEP.fullNight | data/survival.js | 3 h | 2–6 | what counts as a night (the fever cure) |
| TOWN_NIGHT.from / to | data/survival.js | 22 / 6 | 20–24 / 4–8 | how long the town is asleep (the burglar's window) |
| TOWN_NIGHT.bedR / giveUp | data/survival.js | 25 m / 25 s | 10–40 / 10–60 | how far they go for a bed |
| TOWN_NIGHT.wakeStand / restless / hearAsleep | data/survival.js | 1.5 s / 45 s / 0.45 | 0.5–4 / 15–120 / 0.2–1 | how lightly they sleep |
| SLEEP.microsleep | data/survival.js | every 35–80 s, 1.4 s | — | how dangerous no sleep is |
| EFFECTS.rest[*].sway | data/survival.js | 1.15–1.6 | 1–2 | how tiredness spoils your aim |
| FEVER.hours | data/survival.js | 36 | 24–48 (canon knob) | the fever's shadow |
| FEVER.staminaRegen / foodDrain | data/survival.js | 0.75 / 1.3 | 0.6–0.9 / 1.1–1.5 (canon) | its taxes |

## 8. Acceptance criteria (selftest)

1. **Rest:** REST 0.05 → pip 3, sway ≥ 1.35, stamina regen ≤ 0.6; REST 0 with a microsleep due → blackout > 0, and a
   held move key moves the player less than 5 cm; 1.6 s later the blackout is over. In a bed from REST 0.3 the agent's
   `sleep` wakes **rested** after 4.9 ± 0.6 game hours, a full night, REST > 0.99, the player no longer lying down. On
   the bare ground, one of the infected spawned 20 m away walks up and wakes the player (not rested, not a full night).
2. **Fever:** a shambler's landed bite (god mode off) starts a fever ending 36 ± 0.5 game hours from now; stamina regen
   reads exactly 0.75 with every need full; over a fast-forwarded stretch food falls by `hours · 1.3/80` (± 6%);
   antibiotics mark it treated; a night in a bed (a full night) clears it; a second, untreated fever whose clock is run
   out passes and has taken no health.
3. **The town sleeps:** at 23:00 with the player near his shop, Ike goes to bed within 30 s and at least 60% of the
   town's sleepers within 150 m are asleep; his shelf has no counter (`trade.at` is null), a witness pass at his shelf
   does not include him, and a 30 m noise in the shop wakes him (restless).
4. **A parked car:** N refuses while the car rolls (6 m/s); parked, the player sleeps in the seat, wakes rested after
   0.7 / (0.65/7) = 7.5 ± 0.8 game hours (a bed takes 4.9), still in the car, the car moved under 0.6 m.
5. **Survival (water):** thirst wears in pips, slows stamina recovery, and a found bottle drunk with V fixes it.
