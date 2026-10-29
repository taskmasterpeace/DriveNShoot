# WEB_UNDERGROUND: caves, bunker levels and the secret facilities (web engine)

**Status:** v1 BUILT (2026-10-23). Rows `web/src/data/underground.js`; generator `web/src/world/undergen.js` (pure);
runtime `web/src/systems/underground.js` (+ `underlook.js`, the meshes); agent `web/src/agent/underground-api.js`
(`underground`, `generator`, 11 selftest checks). Screenshots `docs/renders/web/underground/`.

## 1. Overview

A **site** is a surface entrance (a hatch, a cave mouth, a freight lift, a culvert) and one to three **levels** under it.
A level is a record until somebody goes down: `genLevel(site, k)` makes it as a pure function of the site row, its depth
and its seed (cells, rooms or chambers, doors with locks and keypads, props, boxes, lights, who lives there, the logs),
and NavProbe (the ring's own reachability rule, `world/floorplan.js`) proves every room, the way down and the lift are
reached from where you come in. Near you it is **promoted** (colliders on its own StaticWorld, door leaves from the
interiors pool, containers on the inventory's ring law, people), and **written back** to its record when you leave
(who is alive and where, their hp, every door's lock and angle; the boxes keep what you left in them through
`inventory.ringKept` and the save).

Basements are **negative storeys of the storeys law** (`docs/design/WEB_STOREYS.md`): a floor is a height
(`Y[k] = -(depth + (k-1)·step)`), a flight of stairs is a slope between two decks entered at its two ends, a person's
level is where their feet are (`c.gy`). Under the surface a person is `ug` (their site's id, kept by `main.js standOn`):
their collision, sight and rounds go to the **UnderWorld** (a StaticWorld of its own, height-ranged), their noise floods
the level's corridors, and `storeys.sameFloor` keeps the street and the underground apart. The street never sees a box
of it: the island's golden hash, the pinned P1 and Florida chunk hashes and the street's nav grids do not move.

Sites (68 today): three authored near Phoenix - **OUTPOST NINE · DOWNSTAIRS** (the Federal Remnant's holdout under its
own outpost: soldiers, a drone, power on), **RED ROCK CAVE** (a cave under the mesa south of Rust Haven: chambers, pools,
a cracked roof, a nest), **THE LULL** (a secret facility under the Glass Flats: PROJECT LULLABY, dead power, a freight
lift, Ward C) - plus every atlas place with something sealed under it (`data/atlas.js`: a station, a depot, a lab, a bunker
or tunnel fight) and every one of the fifty state bases, placed on clear ground near their atlas point the first time
you come near.

## 2. Player fantasy

You find a hatch in the yard of a military post, its lid thrown back, steps going down into black. Halfway down the
street's sound stops. At the bottom there is nothing but your flashlight's cone and what it touches: a corridor of poured
concrete, a door with a keypad whose lamp is dead. Somewhere ahead a generator room, a note taped to a desk that tells
you how to start it, a fuel can you carried down for exactly this. You crank it, and the strips come on one by one along
the walls - and every infected on the level hears it too. A cave under a mesa is worse: no power at all, chem lights an
earlier party cracked at every turn, a cracked roof over a pool that a log tells you not to shoot near, eyes in the dark
catching your beam. And in a facility three levels down, behind a blast door whose code you learned from a note somebody
should have burned, the thing they put to sleep is awake.

## 3. Detailed rules

**Kinds** (`KINDS`): `bunker` and `facility` and `tunnels` are built (a corridor spine joining the anchors, rooms off it
from the level's programme, one-metre concrete walls); `cave` is natural (chambers on a spanning tree of wandering
passages, a loop or two, squeezes a metre wide, pools with a shallow skirt and a deep middle). A facility adds its
**project**'s rooms (`PROJECTS`: LULLABY, THE SEED LIBRARY, THE CLOUD FARM, THE LISTENING ROOM) and its sealed room on
the bottom level, behind a blast door, with whoever has waited there since the door shut.

**Anchors** (`planSite`): every level shares one 1 m grid frame (<= 60 m: NavProbe's window less its pad). The entrance
flight descends from the street to level 1 (its first metres open to the sky behind a collar, the rest covered); each
level's way down is a flight to the next, placed far from where you arrive; a lift shaft (a `lift` entrance) runs through
every level beside the ladderway. On the upper floor a flight is a railed hole; on the lower floor its stair mass is
walled on three sides (flanks over the flight's whole height range, a block under its top end).

**Going down.** A flight is a slope: `y = yTop + (yBot - yTop)·t`, entered at its ends only (the continuity rule: you are
on it only if you are within 0.75 m of its height there). Walking speed on it is the flight's (`FLIGHTS.speed`: a ladder
0.42, a stair 0.8). Below `UG.below` (0.5 m) you are `ug`; below `UG.viewBelow` (2 m: your head under the surface) the
view goes below. The lift (power only) carries everyone standing on its platform; its gate on a level is shut unless the
platform stands there.

**The view below.** A clipping plane on the renderer (installed at boot, at +1e6 on the street, so no shader ever
recompiles) cuts everything over `min(gy + clipMin, -0.05)`; only the current level's meshes are drawn; a black occluder
under its floor hides the levels below; black rock fills everything that is not passage, out past the grid. The sky goes
to a breath (`sky.below`): no sun, the hemisphere fill at `LIGHT.dark` (0.02) or `LIGHT.powered` (0.5) with the
generator on, black fog and background, the shadow map stops updating. The light is what you bring: the flashlight comes
on by itself below (L still switches it), its cone at your floor, and its spill - the second of the fire lights, borrowed
(nothing burns below: throws are the street's), so the light count never changes. Chem lights glow on their own; the
strips, the screens and the keypads' lamps are emissive and light up with the power; the infected's eyes catch your beam.

**Things inside.** Containers by room (`ROOMS.loot` -> `UG_LOOT`, registered into `LOOT`): the armory has rifles. Doors
are interiors rows (every door has a lock): wood and steel doors kick, pick and pry by the interiors rules; a **keypad**
door (an armory, a vault, a sealed room) opens with its code once the power is on and a log has taught it; a **blast
door** does not kick (40 kicks), shrugs off rounds at its lock, cranks open by hand with a crowbar while the power is
off (`BLAST.crank` s of E, loud), or blows to a charge set on it (hold E with a frag or a pipe bomb: `BLAST.charge`).
**Logs** (`LOGS`, our own words) lie as paper or glow on terminals (a terminal needs power); a log with `code` teaches
its keypad group. **The generator**: hold E beside it to prime and crank; a dry tank takes a fuel can from your pack; it
burns `GENERATOR.burn` of the tank a game hour and is heard `GENERATOR.noise` m down the corridors every 4 s.

**Who lives there.** The infected by room or chamber (`KINDS.infected`), a nest in a cave's far chamber, the sealed
room's own; they keep near their post until something draws them. A **Remnant holdout** (a bunker row with `holdout`):
soldiers at posts by room (`HOLDOUT.posts`), one walking the spine, a **drone** flying the longest corridor end to end. A
trespasser in a soldier's sight (or the drone's beam) is challenged once ("HALT. THIS LEVEL IS CLOSED."); still there
after `HOLDOUT.warn` s, or firing a shot they hear, and the whole holdout is hostile. A friend of the Remnant is waved by.
AI below walks the level's own A* grid (`ai.move` asks `waypoint`), takes the stairs to a target on another level
(`storeys.steer` asks `steer`), and a chaser from the street follows you down the hatch (it joins the level's record).

**Sound below** is a flood over the level's cells from the noise out to its radius: whoever stands on a reached cell
hears it (the dead turn toward it, a sprinter bursts, the holdout's soldiers go hostile at your shot). At a flight's end
it carries on to the next level at `NOISE.level` of what is left; at the entrance's foot a `NOISE.shaft` share climbs
to the street. A street noise never reaches below except down the hatch the same way. A loud noise near a cracked span
of a cave's roof may bring it down (`COLLAPSE`): rubble fills the span for good and hurts whoever is under it; spans
only lie on loop passages, so a fall never seals a chamber off.

**Persistence.** `under.save()` writes the live levels back and returns every touched site's record (power, fuel, the
lift, the alert, codes learned, logs read, roofs down, its placement) and every touched level's record (who lives there,
its doors). `restore` loads it before the player stands again; if the save has you below, your site goes live and your
level is promoted first, so the floor is under your feet. Boxes ride the inventory's own save (`ring:ug:` ids).

**Agent.** `underground` (list, `id=` in full, `action=enter|map|proof|read|keypad|lift|power`), `generator`
(`status|start|stop`, `fuel=`). `state.player.under` names your site and level.

## 4. Formulas

| Name | Formula | Variables | Example |
|---|---|---|---|
| Floor height | `Y[k] = Y[0] - depth - (k-1)·step` | depth 7.5, step 7 | level 3 at -21.5 m |
| Flight length | `len = ceil(rise / pitch)`; pitch then `rise / len` | FLIGHTS rows | a hatch's companion stair: 7.5 / 1.0 -> 8 m, 43° |
| Height on a flight | `t = clamp((a - aTop)·u / len, 0, 1)`, `y = yTop + (yBot - yTop)·t`, only if `|y - y_you| < 0.75` | a along the axis, u down-way | 2 m down an 8 m stair: -1.88 m |
| Clip height | `c = min(gy + clipMin, -0.05)` | clipMin 2.75 | on level 1: -4.75 m |
| Noise below | heard if flood distance `d <= r` (1 a step, 1.414 a diagonal step) | r the noise's radius | a 45 m shot heard 30 m round two corners |
| Noise onward | `r' = (r - d_end)·NOISE.level` (next level), `(r - d_end)·NOISE.shaft` (street) | level 0.5, shaft 0.35 | a shot 10 m from the stair: 17.5 m on the level below |
| Collapse | chance `COLLAPSE.chance` if `r >= minNoise` and the span within `COLLAPSE.r` by flood | 0.4, 30, 9 | one shot by the pool: 40% |
| Generator fuel | `fuel -= burn·Δh`, a can `+0.5` | burn 0.015 a game hour | half a tank: 33 game hours |
| Lift ride | `t = Δy / speed` | speed 1.8 m/s | level 3 to level 1: 7.8 s |
| Charge | `dmg·f² + 8f`, `f = 1 - d / r` | dmg 75, r 6.5 | 2 m off: 37 |
| Drone burst | 4 rounds 0.11 s apart, then 1.1 s | dmg 8, spread 0.09 | 32 a burst if all land |
| Light below | hemi `= lerp(sky, fill, below)`, sun `·(1 - below)` | fill 0.02 / 0.5 | powered bunker: 0.5 |

## 5. Edge cases (exactly what happens)

- **Crossing a hatch's opening from the side**: the collar (an `extra` box on the street's StaticWorld) stops you; its
  near end is the way in. Over the covered part of the shaft you walk on the ground (the continuity rule).
- **A far site whose chunks are not laid out yet**: it waits (no entrance) until they are, then finds clear dry ground
  within 80 m of its atlas point and keeps that spot in its record (and in saves).
- **Teleporting out of a level's frame while below**: you land on the street (your height follows the ground there).
- **Throwing below**: refused with a toast ("set it on a door"); a frag or pipe bomb is a charge on a blast door instead.
  (v2: throws below on the UnderWorld.)
- **A dog**: does not go down hatches; it keeps to the street over you.
- **A soldier from the street chases you down**: it joins the level (`adopted` in the record) and lives there after.
- **An occupant tidied away by another system** (a dawn sweep): the record keeps them as they were, unless dead.
- **No door leaf left in the pool**: a door stays a gap; a locked one becomes a solid box until the level is promoted again.
- **The generator runs dry**: power off, the strips go dark, keypads die, the lift stops where it is (its gates shut).
- **A blast door unlocked**: its lamp goes green; it swings like any steel door.
- **Real terrain on (`?terrain=real`)**: the levels are under 0, not under the terrain there (v2).
- **Two sites near each other**: both entrances attach; only the one you are at (or under) is live.
- **Save taken on a flight or the lift**: you load on the nearest level's floor height at your x, z.

## 6. Dependencies

Uses: `engine/collision.js` (StaticWorld: the UnderWorld subclass; `resolveBody` and `raycast` route below by height;
`extra` boxes), `world/floorplan.js` (NavProbe), `world/storeys.js` (`sameFloor`, `steer` call ours), `systems/stunts.js`
(`heightAt` asks ours first), `systems/interiors.js` (door leaves and ops; kick, pick, pry, unlock; `door.y`),
`systems/inventory.js` (ring boxes, ringKept), `systems/zombies.js`, `systems/ai.js` (`move`, `think`), `systems/combat.js`
(rounds at your floor's height), `systems/sky.js` (`below`), `systems/fx.js` (`ground`), `systems/throwables.js` (a fire
light borrowed as the lamp), `data/items.js` (`LOOT` takes `UG_LOOT`), `data/interiors.js` (`DOOR_MATERIALS.blast`),
`data/materials.js` (rules for `ug-*` tags), `data/atlas.js` (sites and bases).

Used by: `main.js` (construct, `update`, `standOn` -> `siteOf`, `noise`, the camera's `view`, the E key, the flashlight),
`agent/api.js` (commands, checks, `snapshot` / `restore`), the World Forge's SITE tab (to come: it edits these rows and
runs `validateUnderground`), UNDER THE STREET (`docs/design/WEB_UNDERSTREET.md`: a town's drains are sites of kind
`drains` made by `world/understreet.js` through `GEN`, run through `under.ext`; heights below are over the live site's
street `y0`, so a site on a raised pad works).

## 7. Tuning knobs

| Knob | Where | Value | Safe range | Affects |
|---|---|---|---|---|
| UG.depth / UG.step | data/underground.js | 7.5 / 7 m | 6.5-10 / 6-9 | stair lengths; must clear `clipMin + 2.6` |
| UG.clipMin | " | 2.75 m | 2.65-3.2 | how much over your floor shows (walls are 2.6) |
| UG.viewBelow | " | 2.0 m | 1.6-2.4 | when the view goes below |
| UG.attachR / releaseR | " | 140 / 190 m | 80-250 | when an entrance appears |
| UG.demoteAfter / huntKeep | " | 8 s / 30 m | 4-30 / 15-60 | how long a level you left stays live |
| FLIGHTS.*.pitch / speed | " | 0.42-1.73 / 0.42-0.85 | pitch 0.4-1.8 | stair length, climb pace |
| LIGHT.dark / powered / cone | " | 0.02 / 0.5 / 0.9 | 0-0.06 / 0.3-0.8 / 0.6-1 | how dark, how lit |
| LIGHT.lamp.intensity / distance | " | 26 / 15 m | 15-40 / 10-20 | the flashlight's spill |
| GENERATOR.burn / noise / hold | " | 0.015 / 24 m / 2.4 s | 0.005-0.05 / 15-40 / 1-4 | fuel, the cost of light |
| NOISE.level / shaft | " | 0.5 / 0.35 | 0.3-0.7 / 0.2-0.5 | sound between floors |
| COLLAPSE.chance / r / dmg | " | 0.4 / 9 / 45 | 0.1-0.7 / 5-12 / 20-80 | a cracked roof's danger |
| BLAST.crank / charge.fuse | " | 9 s / 4 s | 5-15 / 3-6 | breaching |
| HOLDOUT.warn / drone.dmg | " | 5 s / 8 | 3-10 / 5-14 | the holdout's patience and bite |
| KINDS.*.size | " | 44-58 m | 20-60 | a level's extent (NavProbe's window) |

## 8. Acceptance criteria (the selftest: `selftest only=underground`)

1. The rows validate and every level of every site (all 68: 141 levels) is made and proved by NavProbe: every room or
   chamber, the way down and the lift reached from the arrival.
2. A level is a pure function of its row: the same seed makes the same hash, another seed another; the island's golden
   hash is unmoved.
3. Walk down Outpost Nine's hatch on held keys: `ug` set below the surface, level 1 at the foot (gy = -7.5), only level 1
   drawn, the clip under the player's ceiling and under 0, the occluder shown, the street hidden, the sun out; walk back
   up on held keys to the street as it was (clip off, light restored).
4. Dark below: the cave's first level, flashlight off, mean luma < 4; on, more than 2.5x that and over 6.
5. A locked blast door blocks a walk into it on held keys; with no power or code the keypad refuses; with power and the
   code read from the duty officer's card it opens and you walk through.
6. Restoring the Lull's generator by holding E beside it (a fuel can poured into its dry tank) turns the strips from dark
   to lit and runs the lift, which refused before.
7. A level remembers: an item taken from a box and an infected killed stay so after the level is written back (you went
   away) and promoted again.
8. Save and load: on the Lull's second level with power on, a door forced, a code learned: the load puts you back on that
   level, live, with all three.
9. The holdout: four or more soldiers with rifles or SMGs, a drone that flies its corridor (more than 2 m in 4 s); a
   trespasser in sight is challenged, then the holdout turns hostile and takes aim.
10. Sound: a 45 m shot below turns a listener in the same chamber toward it and not one of the dead stood on the street
    right over it; a street shot over that listener does not reach it.
11. Draw calls under 150 below (the cave, the holdout, the facility's third level).

Perf: `scenario name=stress` before/after on the same machine (in the hand-back). No per-frame allocations below
(levels allocate when promoted); one clipping plane, fixed light count.
