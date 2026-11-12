# WEB_START_DOORS — the start town has doors (and what "interiors" a new player can reach)

**Status:** BUILT 2026-11-12 on `feat/web-zed-interiors` (cut from `prep/g0-wave2`, with `feat/web-zed-breeds` merged in).
The upstairs part is NOT built: §5 says why and proposes it.
**Code:** `web/src/systems/interiors.js` `ringScan` (the holdout loop) and `attachRing` (`held`); one check in
`web/src/agent/pound-api.js` (`interiors: a holdout has doors`).
**Builds on:** `WEB_FLORIDA.md` §3.4 (Meridian's buildings are lots handed to the ring's own `geo()`), the ring's
openings (`data/interiors.js RING_OPENINGS`, `WINDOW_MIX`), `WEB_DOOR_POUND.md` (what a door is for now),
`WEB_STOREYS.md` §9 (the buildings that rise).
**Source of the ask:** Robert's playtest, 2026-11-12: "I haven't seen the interiors. We can go upstairs".

## 1. Overview
A new game starts on the clinic's doorstep in Meridian, Florida. What was found there, in the running game:
- **Interiors exist and are walk-in.** All 59 of Meridian's lots are built by the ring's `geo()`: rooms with partitions,
  counters, chairs, beds (151 within 150 m of the start) and 535 containers. Walk through a doorway and the roof cuts
  away. Nothing announces this, and from the street the buildings are roofs.
- **There were no doors and no windows.** `interiors.doors` and `interiors.windows` held 0 entries for the whole town.
  The door system only attached leaves and glass to the Phoenix ring's lots (`ringScan` walked `chunk.ring.bld`, and a
  holdout's lots are not in it). Every doorway and window in the start town was a bare gap. So there was nothing to
  shut, kick, lock, board or lean on where a new player stands.
- **There are no stairs within reach of the start.** The buildings that rise are the island's 19 (Phoenix) and the
  Phoenix ring's towers (`world/ringrise.js`, on `prep/g0-wave2`). Meridian's lots are one storey. The nearest staircase
  to a Florida start is 222 km west.
- **The infected already path indoors and take stairs** (`world/storeys.js steer`, used by `zombies.think`); with the
  shut-door rule they are also held by doors.

Built here: a holdout's buildings get their door leaves and glass through the same door system as the ring.

## 2. Player fantasy
You step back into the clinic you woke up outside, and the door behind you is a door: it stands open the way the town
keeps it, you pull it shut, and through the glass you can see the street. Every house in town has a front door you can
shut, a back door, shutters, and a window somebody boarded.

## 3. Detailed rules
- **Attach.** `interiors.ringScan` (every `RING_OPENINGS.every` 0.5 s) also walks each holdout (`streamer.W.holdouts`)
  whose bounds are within `near` (110 m) of the player. Each non-empty lot within 110 m is attached with
  `attachRing(lot.id, lot, H.geo(lot))`: its front and back doors, its inside doorways and its windows, from the same
  `geo()` rows that drew the walls. Past `far` (150 m) it is detached and its state waits in `ringState`, as for a ring
  building.
- **A held town's doors stand open.** A holdout's lot counts as lived-in (`held`: its zone starts with `holdout`), so its
  outer doors are built open against the wall (`RING_OPENINGS.wide`) and its inside doorways carry no leaf, exactly as a
  ring house with a household. You can shut them.
- **A held town keeps its glass.** Windows use the `town` mix (`WINDOW_MIX.town`: 72% intact, 28% boarded, none
  smashed). A burnt lot (`zone: holdout_burnt`, `ruined`) uses the ruined mix and may have lost doors, like any ruin.
- **Pools.** Leaves and panes come from the ring's pools (220 door leaves, 480 windows). Meridian takes 99 doors and 381
  windows when all of it is near; when a pool runs out, the rest stay gaps (the ring's own rule).
- **Everything a door does now applies:** E shuts an open door (first in line with the infected near), the infected
  cannot work a latch, hold E leans, locks and barricades, kicks, picks; windows smash, are climbed and boarded.

## 4. Formulas
| Name | Formula | Variables | Example |
|---|---|---|---|
| Attach | `rectDist(player, lot) < near` | near 110 m | at the clinic doorstep 48 of Meridian's 59 lots are attached |
| Detach | `rectDist(player, lot) > far` | far 150 m | 420 m east of the start: 0 of its doors remain |
| Window state | `q < mix[0] → intact; < mix[0] + mix[1] → shattered; else boarded` | town mix [0.72, 0, 0.28] | 381 windows: 258 intact, 100 boarded, 23 shattered (all 23 on burnt lots) |

## 5. Edge cases, and what is not built
- **The town's people and its doors:** they walk through doors as the living do (a leaf swings and stays where it
  stops). A door you shut on a keeper's route is pushed open again when they next pass.
- **Residents asleep, doors open:** a holdout's doors are open at night too. Shutting them is the player's business.
- **The pool is full** (another large town attached at the same time): the last lots keep gaps; they get their doors
  when you walk nearer and others detach.
- **A save taken in Meridian:** the doors you moved are in `ringState` and come back as you left them.
- **NOT BUILT: going upstairs near the start.** No building within reach of a Florida start has a second floor.
  Proposed (needs the storeys lane's agreement, since it touches `world/holdout.js` and `world/ringrise.js`):
  1. Let a holdout lot carry a `rise` row as a Phoenix ring lot does (`ringrise.riseOf`), built by the generated-town
     builder with its stair core, and stamped through `citygen.stampRing` when its chunk is hot.
  2. Rows for Meridian: the BOARDING HOUSE and the TOWN HALL two storeys, one HOUSE on the back row two storeys
     (`data/holdouts.js`: a `storeys` field on the lot's programme row).
  3. Checks: from the clinic door a walk of under 60 s reaches a stair foot; the upper floor has rooms and a bed; one of
     the infected told of you upstairs climbs the flight (the existing `storeys` checks, staged at Meridian).
- **NOT BUILT: who is inside.** `zombies.occupy` (the `INSIDE` rows: who stands in which kind of building) is still
  called by nothing. Meridian is a holdout (never the infected inside); the dead houses outside its wall and along I-95
  are where it belongs. With the shut-door rule those would be houses that hold a surprise.

## 6. Dependencies
| System | What it needs from this | What this needs from it |
|---|---|---|
| `world/holdout.js` (WEB_FLORIDA.md) | — | `holdouts`, `lots`, `geo(L)`, the lot's bounds and zone |
| `systems/interiors.js` | the holdout loop in `ringScan`; `held` in `attachRing` | `attachRing` / `detachRing`, the leaf and pane pools |
| `data/interiors.js` | — | `RING_OPENINGS`, `WINDOW_MIX.town` |
| `systems/regions.js` (the start) | the clinic's front door as a real door (`WEB_FIRST_MINUTE.md`) | `clinic(id)` |
| `WEB_DOOR_POUND.md` | doors to shut and lean on in the start town | `isShut`, `shutDoor`, `openDoorNear` |
| `WEB_STOREYS.md` §9 | — | (proposed) `ringrise` for a holdout lot |

## 7. Tuning knobs
| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `RING_OPENINGS.near` / `far` | 110 / 150 m | 80–160 / near + 30 or more | How far ahead a town's doors exist |
| `RING_OPENINGS.doors` / `windows` | 220 / 480 | 150–400 / 300–800 | How many leaves and panes can exist at once (Meridian alone: 99 / 381) |
| `WINDOW_MIX.town` | [0.72, 0, 0.28] | sums to 1 | How boarded a held town looks |
| `RING_OPENINGS.wide` | 1.75 rad | 1.2–1.83 | How far open a lived building's door stands |

## 8. Acceptance criteria (selftest, `only="interiors: a holdout has doors"`)
At the new-game start (`region action=start`): Meridian's buildings carry at least 40 doors and 100 windows; no window
of an unburnt building is shattered; the clinic's front door is within 6 m and stands open as built; with one of the
infected 7 m out in the street, E reads "Shut the door" and shuts it, and for 12 s the shambler does not cross the door
line and the door stays shut; 420 m away none of the town's doors remain attached.

Pictures: `docs/renders/web/start-doors/zed-startdoors-before.jpg` (0 doors, 0 windows),
`zed-startdoors-after-1-street.jpg` (99 doors, 381 windows) and `zed-startdoors-after-2-inside.jpg` (inside the clinic,
its door pulled shut).
