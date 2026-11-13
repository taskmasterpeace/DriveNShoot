# Vertical aim: the round goes where you look (web engine)

**Status:** built 2026-11-12 on `feat/web-zed-vaim` (on top of `feat/web-zed-camera`).
**Asked by:** Robert, 11-12: "an over-the-shoulder third-person where you aiming up and down as well". The first version
of the body views (`WEB_CAMERA_BODY.md`) only looked up and down; the round stayed on your floor.
**Files:** rows `web/src/data/camera.js` (`CAMERA.body.aim3`); `web/src/systems/camrig.js` (`aimPoint3`);
`web/src/main.js` (`g.aim3`); `web/src/systems/combat.js` (`fire`, `segment`, `capOf`, `atHeight`, `nearFlight`,
`stairLine`); checks `web/src/agent/vaim-api.js`.

## 1. Overview

In THIRD and SHOULDER you aim where the middle of the screen is. The game finds the point that line lands on (a body, a
wall, the ground, the deck over your head) and fires the round from your muzzle at that point, so the round climbs or
falls on the way. Look down from a window and you hit the street. Look up from the street and you hit the window. Look
level out of a third-floor window and the round passes over the street's heads.

Top-down, angled, iso and chase shooting are untouched: the flat rule, the flying rounds, everything.

## 2. Player fantasy

From an upstairs window you put the reticle on the one in the street and it drops. From the street you look up at the
rifleman in the window and shoot him out of it. In a stairwell you hold the landing above by aiming up it.

## 3. Detailed rules

1. **The aim point** (`camrig.aimPoint3`): the view's centre line, starting just past your back, runs until the first of:
   the ground or the floor you stand on, the deck over your head (indoors, in a building with storeys), a wall that
   stops a round at that height, a body or a car at that height, or 60 m. The reticle is drawn on that point, which is
   the middle of the screen.
2. **The shot** leaves your muzzle (1.45 m over your feet) toward that point: its heading is the flat direction to it,
   its slope is the height difference over the flat distance. Spread still applies to the heading.
3. **A round with a height:**
   - looking down, it stops in your own floor while it is over it, or in the street past the building's edge;
   - looking up indoors, it stops in the deck over your head;
   - it takes a body only when it passes between that body's feet and its head (1.85 m standing, 1.2 crouched, 0.5
     prone). A level shot from a third floor passes over everyone in the street.
4. **Between floors:**
   - **Down and out:** from upstairs, anyone outside your building below you can be hit (the old window rule), now only
     if you actually aim down at them.
   - **Up and in:** from the street or a lower floor of another building, anyone upstairs can be hit if the rising round
     reaches them through an opening at their floor's height. They no longer have to stand at the window: the line
     decides.
   - **One building, two floors:** only up or down its stairs. Both of you must be within 1.6 m of a flight; then the
     round passes the well. Anywhere else the floor stops it.
5. **Walls** stop the round as before, tested at the height it is fired from; for a body upstairs in another building
   the wall test is at that body's floor height (so a window lets it in and the wall beside it does not).
6. **It lands at once.** A round with a height does not use the flying-round model (travel time, drop over distance):
   it is resolved the moment you fire, like a shot at a bird already was.

## 4. Formulas

- `slope = (aimPoint.y − (feet + 1.45)) / max(1.5, flat distance to the aim point)`
- Height of the round `t` metres along: `feet + 1.45 + slope × t`.
- It reaches the ground at `t = (1.45 + height above the street) / −slope` when `slope < 0`.
- Example: from floor 3 of the tower (9.2 m up) at a body 10 m out in the street: the centre line lands on its chest at
  about −46°; `slope = (1.0 − 10.6) / 10 = −0.96`; at the body the round is 1.0 m over the street: a hit. With the view
  level, `slope ≈ 0`: the round is 10.6 m up when it passes: a miss.

## 5. Edge cases

- **Looking straight down at your feet:** the aim point is under you; you keep facing the way the view faces and the
  round goes into the floor.
- **A body behind a window sill:** aim at its feet from below and the wall under the window takes the round. Aim at its
  chest.
- **The shoulder view at a narrow window:** the lens is 0.55 m to one side of you; the line from the lens may meet the
  window's edge when your own line would not. Swap shoulders (`;`) or step across.
- **Looking up outdoors:** nothing stops the round but its range.
- **Multiplayer:** the shot is resolved on the shooter's page, as every shot is. The other page is shown the shot by its
  heading; it does not see its slope (a tracer drawn level).
- **Not covered yet:**
  - no travel time or bullet drop for these shots (rule 6);
  - dogs, animals, drones, the train and the sea are hit by the flat rule only (the height test is for people and the
    aim point's cars);
  - cars are hit by the flat rule: a level shot from a third floor still "hits" a car on the line below. Bodies are right.
  - a ricochet keeps the round's height line; glass and doors are met at the fired height, not the round's height there;
  - AI shooters and other players' pages do not use vertical aim;
  - a floor is only "open" at the stairs: there are no holes in floors, balconies or atriums.
  - no ceiling stops a round on a building's top floor, on a flight of stairs, or in a one-storey building;
  - at the stairs you can shoot between floors and the people the game runs cannot shoot back that way;
  - looking down a stairwell the reticle stops on your own floor while the round goes on down the well;
  - birds on the wing cannot be hit from these views; a shot up from the street still sparks on the street wall it
    flies over.

## 6. Dependencies

- `systems/camrig.js` (the body views: `WEB_CAMERA_BODY.md`), `engine/collision.js` (`raycast` at a height),
  `world/storeys.js` (`levelOf`, `at`, `across`, the record's `flights`, `Y`, `b`), `systems/combat.js`.
- `WEB_CAMERA_BODY.md` §3.4 is replaced by this for where the round goes.

## 7. Tuning knobs (`CAMERA.body.aim3`)

| Knob | Value | Safe range | What it changes |
|---|---|---|---|
| `reach` | 60 m | 20–200 | How far the centre line is followed |
| `step` | 1.5 m | 0.5–3 | How finely it is tested for walls (smaller: thin walls at a slant are never skipped; more work each frame) |
| `muzzle` | 1.45 m | 1.2–1.7 | The height the round leaves from |
| `body.stand / crouch / prone` | 1.85 / 1.2 / 0.5 m | – | How tall a target is to a round with a height |
| `stair` | 1.6 m | 0.5–4 | How near a flight both ends must be to shoot between floors of one building |

## 8. Acceptance criteria (selftest, `only="vertical aim:"`)

1. **Open ground:** in SHOULDER, with the centre line on a body 10 m off, it is hit; tipped 22° over its head it is not;
   tipped down at the dirt the round stops in the ground; on TOPDOWN there is no aim height and the flat shot hits.
2. **Between floors:** from a third-floor window a body in the street is not hit with the view level and is hit looking
   down at it; from the street a body at that window is not hit level and is hit looking up at it; a body on the floor
   below you, away from the stairs, cannot be aimed at (the line meets your floor) and a shot at where it is stops in
   your floor.
3. **Rows and rules:** the rows are sane; two people on different floors of one building are a line only when both are
   at its stairs; a body is "at the height" of a round from its feet to its head by its stance.

Pictures: `docs/renders/web/vertical-aim/`.
