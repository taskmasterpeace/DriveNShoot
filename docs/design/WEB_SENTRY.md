# The sentry gun (web engine)

**Status:** built 2026-11-12 on `feat/web-zed-sentry` (on top of `feat/web-zed-topdown`).
**Asked by:** Robert, 11-12: "We need crafting, like turrets and all that stuff." The coordinator's brief: a sentry gun
built from real parts (no free matter), which needs ammo, can be broken, and helps hold a door.
**Files:** rows `web/src/data/gadgets.js` (`GADGETS.turret_kit`, its `sentry` block); the recipe
`web/src/data/recipes.js` (`build_turret`); the rule `web/src/systems/gadgets.js` (`sentry`, `sentryLoad`,
`sentryBreak`, the prompt, the save, the look); command and checks `web/src/agent/sentry-api.js`.

## 1. Overview

The turret kit you build at a forge (a service rifle on a steel tripod with a trip) is now a thing you set down. USE it
from the pack and it stands in front of you facing the way you face, takes the rifle rounds out of your pockets up to
its 60, and after three seconds of setting up it watches a 110 degree fan to 16 m. Anything hostile that it can see in
that fan on its own floor gets a round every 0.4 s. Every round is one of yours, every round is heard 45 m off, and the
infected that reach it tear it down.

It is the same item a base's turret takes (`FORTIFY.turret`): build one, and either mount it at your base or carry it
to the door you mean to hold.

## 2. Player fantasy

You shut the door, set the gun down four steps inside facing it, and feed it your last sixty rounds. The door comes off
its hinges and the gun starts. You stand behind it with a pistol and count what it has left.

## 3. Detailed rules

1. **What it is made of:** `build_turret` at a forge: a service rifle, 12 scrap, a lead pipe, 2 trap triggers, 2 battery
   cells, 4 cord (23.8 kg in, a 22 kg kit out), mechanics 35, 8 hours, taught by the gunsmith's notebook. There is no
   hand recipe and it is in no loot table.
2. **Setting it down:** USE it from the pack. It stands 1.1 m in front of you, facing your facing, on your floor. It arms
   in 3 s (`arm`). It is 30 bulk: it takes a frame ruck to carry.
3. **Rounds:** on being set down it takes rifle rounds from your pockets, up to its magazine (60). Tap E at it to top it
   up. With none it does not fire, and says so once ("SENTRY GUN · EMPTY").
4. **What it shoots:** the nearest of its owner's enemies (the infected, raiders, anyone hostile to you: the same test
   the crawler mine uses) within 16 m, inside its fan (55 degrees either side of the way it faces), on its own floor,
   with a clear line of sight. It turns onto the target at 3.2 rad/s, then fires.
5. **A round:** lands with a chance that falls with range (92% at its feet, 55% at 16 m), does 30, and costs one of
   the rounds in it. It is as loud as a rifle shot: 45 m, and the infected come to the noise.
6. **It does not shoot through a shut door or a wall** (no line of sight), nor behind itself, nor at another floor.
7. **It can be torn down:** each of the infected within 1.5 m of it (up to three at once) takes 9 hp a second off its
   160. At 0 it is gone. What lies where it stood: 5 scrap and every round it still held. The rifle is ruined.
8. **Taking it up:** hold E beside it. You get the kit and every unfired round back.
9. **The save** keeps its place, facing, rounds, hp and floor.
10. The `sentry` command lists every sentry set and the rows.

## 4. Formulas

- Hit chance at `d` m: `0.92 + (0.55 − 0.92) × d / 16`.
- Rounds to drop a shambler (100 hp): about 4 hits, 5 to 7 rounds; a full magazine is about 9 shamblers at mid range.
- Time to tear it down: `160 / (n × 9)` s for `n` infected at it (n ≤ 3): 17.8 s for one, 5.9 s for three.
- It fires 2.5 rounds a second: a full magazine lasts 24 s of continuous fire.

## 5. Edge cases

- **Behind it:** nothing behind the fan is shot; three at its back will take it down in six seconds. Put its back to a
  wall.
- **You in its fan:** it never fires at you or your allies, and a round it fires resolves only on the body it chose: it
  cannot hit you by accident. (Friendly fire from a sentry is not modelled.)
- **Two sentries** work independently and may pick the same target.
- **Upstairs:** it watches its own floor. It does not shoot down a stairwell or out of a window at the street.
- **Multiplayer:** a sentry is a placed gadget; the gadgets are per page today (like mines), so another player does not
  see or benefit from yours. The same limit as every other gadget.
- **Not covered yet:** it cannot be repaired; raiders do not shoot at it (only the infected at arm's length hurt it);
  it does not track cars; it has no on/off switch (take it up); rounds other than rifle rounds do not fit; nothing draws
  the fan on the ground.

## 6. Dependencies

- `systems/gadgets.js` (placement, pick-up, save, the per-frame loop, `enemyOf`), `systems/combat.js` (`damage`),
  `engine/collision.js` (`lineOfSight`), `world/storeys.js` (`at`), `systems/inventory.js` (the pile it leaves),
  `data/recipes.js`, `data/homes.js` (`FORTIFY.turret` takes the same item).
- `WEB_DOOR_POUND.md` §3.9 says the sentry gun was not built; this is it.

## 7. Tuning knobs (`GADGETS.turret_kit.sentry`)

| Knob | Value | Safe range | What it changes |
|---|---|---|---|
| `range` | 16 m | 8–30 | How far it reaches |
| `arc` | 110° | 40–170 | How wide a fan it covers (under a half circle: it has a back) |
| `every` | 0.4 s | 0.15–1.5 | Rounds per second (ammunition burn) |
| `dmg` | 30 | 15–60 | Per round |
| `hitNear` / `hitFar` | 0.92 / 0.55 | – | How well it shoots, near and at its range |
| `mag` | 60 | 20–150 | Rounds it holds |
| `noise` | 45 m | 20–80 | How far each round is heard (how much more it draws) |
| `hp`, `claw`, `maxClaw`, `reach` | 160, 9/s, 3, 1.5 m | – | How long it stands against the infected at it |

## 8. Acceptance criteria (selftest, `only="sentry:"`)

1. **Rows:** the sentry is the built kit (one item, the base turret takes the same), a thing you carry and USE; its
   recipe eats more than it makes and needs a rifle; there is no hand recipe; the numbers are sane.
2. **Your rounds, its fan:** set down with no rifle rounds it is empty, does not fire at an infected 8 m in front of it,
   and says so once; loaded from 100 it takes 60 and leaves 40; it kills the one in front with two or more rounds, one
   `sentryShot` event and one round fewer per shot; one standing behind it loses nothing; a body 6 m off behind a real
   wall is not seen and not shot; a save record carries its rounds and hp; taking it up gives the kit and its 17 rounds
   back.
3. **Torn down:** three infected at its back break it in `hp / (3 × claw)` seconds (within 1.2 s); it fired nothing at
   them; what lies there is exactly its 5 scrap and its 9 unfired rounds, and no kit.

Pictures: `docs/renders/web/sentry/sentry-holding-a-door.jpg` (the gun inside a room firing through the doorway).
