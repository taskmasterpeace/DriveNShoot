# Out of an upper window (web engine)

**Status:** first version built 2026-11-12 on `feat/web-zed-camera` (base `prep/g0-wave2`).
**Asked by:** Robert, 11-12: "Upstairs, downstairs. You got to be able to get out the window. You got to be able to
climb."
**Files:** rows `web/src/data/interiors.js` (`WINDOW_EXIT`, `validateWindowExit`); the rule
`web/src/systems/windowexit.js`; the E chain and the frame call in `web/src/main.js`; command and checks
`web/src/agent/windowexit-api.js`. The fall's cost is the ladders' row (`web/src/data/actions.js` `LADDER.fall`).

## 1. Overview

Upstairs, at a window in an outside wall, hold E for a second: you climb over the sill, hang by your hands and drop to
the street. From one floor up it costs nothing. From higher it hurts, more per metre, and puts you on the ground for a
moment. A sprinter in its burst that reaches the same window jumps after you. The herd and the Echoes cannot: they come
round by the stairs or lose you.

This is the way OUT. The way in (and up) through an upper window is not built; see §5.

## 2. Player fantasy

They are on the stairs and the door will not hold. You back to the window, look down, and go. You hit the street hard,
get up limping, and hear the one that screams come out of the window after you.

## 3. Detailed rules

1. **Where.** You are on a floor at least `minUp` (2.4 m) above the street, inside a building with storeys, standing
   within `reach` (1.3 m) of the inside of an outside wall and facing it, and the line straight out at chest height is
   open (a window opening: glass and boards stop it). A partition's doorway is not a window. Street-floor windows are
   climbed through as before (`WEB_INTERIORS`).
2. **The prompt** says the drop and what it will cost: "Way out · hold E Climb out and drop 7.3 m (it will hurt: about
   46)". If there is nothing to land on (a wall, another building, a roof, a car under the window) it says so and E
   does nothing.
3. **Hold E for `hold` (1 s).** A tap does nothing: nobody falls out of a window by brushing a key. Letting go resets it.
4. **The drop.** You land `out` (1.1 m) from the wall, on the street, facing away from it. The fall is your floor's
   height less `hang` (1.9 m: you hang by your hands first).
5. **The cost** is the ladders' fall rule: nothing up to `LADDER.fall.safe` (2.2 m), then `hpPerM` (9) per metre, through
   the ordinary damage call (so difficulty and armour apply as to any hurt). You are down `down.clean` (0.4 s) after a
   clean landing, `down.hurt` (1.2 s) after one that hurt.
6. **It is heard:** the landing carries `noise[0] + noise[1] × drop` metres (8 + 2 per metre).
7. **Who follows.** For `follow.secs` (25 s) after you go, one of `follow.kinds` (the sprinter) that is in its burst, on
   the floor you left, and within `follow.reach` (1.7 m) of that window, jumps: the same landing, the same fall, the same
   cost to it. A crawler does not. The herd and the Echoes never do.
8. The `windowExit` command reads all of it for the window you face.

## 4. Formulas

- `drop = max(0, floorHeight − groundHeight − hang)`
- `cost = max(0, drop − safe) × hpPerM` (before the damage call's own modifiers)
- Examples: one floor up at 3.6 m: drop 1.7 m, cost 0. Floor 3 of the island tower at 9.2 m: drop 7.3 m, cost
  `(7.3 − 2.2) × 9 = 46` (32 on the normal difficulty). Floor 6 at 18.8 m: drop 16.9 m, cost 132: it kills.

## 5. Edge cases

- **A drop that would kill** is allowed and the prompt says the number. Nothing stops you.
- **Something under the window:** refused, with the reason. A car parked there blocks it (you do not land on roofs).
- **Low walls are ways out too.** Anything in an outside wall that is open at chest height is offered: a window, a
  roof's parapet, a ruin's half wall, a parking deck's waist-high side. The prompt says "Way out", the drop and the
  cost are the same rule.
- **A fire-escape door or the next building's deck** beyond the opening is somewhere to walk, not a drop: nothing is
  offered there.
- **Upper-floor glass:** generated buildings have open holes upstairs (no glass yet), so there is nothing to break
  first. Where glass or boards stand in an upper window, the line is not open and the window is not offered.
- **Multiplayer:** the drop moves you like any other move; the other page sees you on the street. Only the sprinters
  YOUR page simulates follow you out; one simulated on another player's page does not follow you.
- **Not covered yet:**
  - **Climbing IN or UP through a window.** The portable ladder and the fixed ladders exist (`systems/actions.js`), and a
    ladder set under a window would be the way, but ladders do not open onto windows yet.
  - **Climbing down** (a drainpipe, knotted sheets): no. The hang is the only help.
  - **Landing on a lower roof next door, a balcony or a car.** Refused today.
  - **The herd following.** Shamblers stop at the sill. They still know where they last saw you and take the stairs.
  - **Third-person hand-over:** the camera simply follows you down; there is no climbing animation, you are moved.
  - **A hurt leg.** The fall does not injure a limb; it only costs health and a moment on the ground.

## 6. Dependencies

- `systems/windowexit.js` reads `engine/collision.js` rays, `world/storeys.js` (`at`, the record's footprint),
  `systems/citygen.js` (`buildingAt`), `data/actions.js` (`LADDER.fall`), `systems/combat.js` (`damage`),
  `systems/zombies.js` (a sprinter's burst state).
- `main.js`: the E chain asks it only upstairs, after ladders and before the street floor's door and window rules; the
  frame calls `update` for the followers.

## 7. Tuning knobs (`WINDOW_EXIT`, `LADDER.fall`)

| Knob | Value | Safe range | What it changes |
|---|---|---|---|
| `hold` | 1.0 s | 0.3–5 | How long you commit before you are out |
| `hang` | 1.9 m | 1–2.4 | How much of the height you save by hanging first |
| `minUp` | 2.4 m | 2–4 | How high before a window is a way out |
| `out` | 1.1 m | 0.7–2 | How far from the wall you land |
| `down.clean / hurt` | 0.4 / 1.2 s | 0–4 | Time on the ground after landing |
| `follow.kinds / secs / reach` | sprinter / 25 s / 1.7 m | – / 5–120 / 1–3 | Who jumps after you, for how long, from how near the sill |
| `LADDER.fall.safe / hpPerM` | 2.2 m / 9 | 1.5–4 / 4–20 | What a fall costs (shared with ladders) |

## 8. Acceptance criteria (selftest, `only="window exit:"`)

1. **Rows:** validate; a hang longer than a storey, a hold of no time and an unknown follower kind are each caught. On
   the street floor a window is not a way out; in the middle of an upper floor nothing is offered.
2. **The drop:** on floor 3 of the six-storey tower the prompt offers the drop and its cost and the command agrees; a
   tap leaves you where you are; E held puts you on the street outside the building, hurt (more than 5, no more than
   the rule's number) and down, with one `windowExit` event; from one floor up in a low building the drop costs nothing.
3. **Who follows:** after you go, a shambler at the sill stays; a sprinter in its burst at the sill lands outside hurt,
   with its own `windowExit` event; after the follow time has passed a second sprinter stays.

Pictures: `docs/renders/web/window-exit/`.
