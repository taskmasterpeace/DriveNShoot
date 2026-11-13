# Rooms for generated buildings (web engine)

**Status:** built 2026-11-12 on `feat/web-zed-camera` (base `prep/g0-wave2`).
**Asked by:** Robert, 11-12: "improve all building interiors". The audit (`docs/status/INTERIORS_AUDIT.md`) found that
every country-town building (35 kinds), every military-base building and every ring tower was an empty box with crates.
**Files:** rows `web/src/data/cgrooms.js`; the rule `web/src/world/citygen/rooms.js`; called from
`web/src/world/citygen/build.js`; path grid `web/src/systems/backlots.js`; liftable pieces `web/src/systems/homes.js`;
agent command and checks `web/src/agent/cgrooms-api.js`.

## 1. Overview

Every building made by the town builder now has rooms on every floor you can reach: partition walls with doorways, and
furniture that suits what the building is. A gas station has a shop floor, a stock room and a restroom. A house has a
living room, a kitchen, a bedroom and a bathroom, and bedrooms upstairs. A school, a hospital, an office block, a
barracks and a motel have rooms off a corridor on every floor. One rule and three tables of rows do all 35 kinds, the
military bases and the ring's towers, because they are all built by the same builder.

The loot did not change. The same containers, with the same ids and the same tables, now live in a shelf, a locker, a
desk or a cupboard of their floor instead of a loose crate in the middle of it. Nothing was added.

## 2. Player fantasy

You push open the door of a dead gas station and it is a gas station: a counter, shelves along the back wall, a stock
room behind. You clear a school room by room down a corridor. A house upstairs has beds. Rooms give you corners to hold,
doors to watch, and something to search that is where it would be.

## 3. Detailed rules

1. **Layouts** (`KIND_ROOMS[kind].street` and `.up`): `hall` (one room), `split` (a front room and one or two rooms
   behind it), `home` (two rooms at the front, two at the back), `corridor` (a 2 m corridor down the long axis, rooms
   every 4.6 m both sides). A footprint too small for its layout is a hall of the layout's first room type.
2. **Every room has a doorway of its own** (1.4 m wide, 2.6 m high, open: no door leaf yet).
3. **Walls are only ever cut, never added to.** After the layout is drawn, every keep-clear rect is cut out of any
   partition that crosses it: the stair core and its landings (1.4 m round it), each outside door's swing, a car bay's
   lane (5.5 m in; wall to wall for a drive-through), a fire-escape door, and the space just inside every window. So a
   partition can never close a way that was open.
4. **Furniture** (`ROOM_TYPES[type].wall`, pieces from `PIECES`): stands against the room's walls, never in a
   keep-clear rect, a doorway or at a window. Two pieces on the same wall may stand side by side; any two others in a
   room keep a 1.4 m walkway between them, so a bed out from one wall and a cupboard on the next never close the way
   between two doorways. Pieces that hold loot are at least 0.6 m deep and partitions are 0.2 m thick, so a hand pressed
   to the far side of a partition is out of touch range of the container (the validator holds the sum). A room 4.2 m or more each way may get rows in its middle
   (`centre`: shop aisles, school desks, pews, tables).
5. **Loot:** the floor's containers are the same ones the builder always rolled (same ids, same tables, same count). Each
   takes the next piece on its floor that can hold one (`holds: true`); when there are more containers than such
   pieces, the rest are loose crates as before, moved off any new wall or piece.
6. **Ruins:** a ruin's top band is open to the sky; its partitions there are half walls (1.4 m).
7. **Partitions stop 0.24 m under the deck above**, so they never show through a floor or a roof.
8. **Path grid:** inner doorways are kept open in the foot path grid the same way outside doors are
   (`backlots.navOverlay`), so people and infected route through rooms on the street floor.
9. **Liftable pieces** (the base-building furniture, `homes.piecesOf`) now stand clear of the new walls and pieces.
   A base's stash and a searcher's waypoint use the clear floor nearest the building's middle (`R.clearSpot`), and a
   ring tower's infected are not stood inside a wall or a piece (`ringrise.floorSpot`).
10. **Its own dice.** The rooms use a generator seeded from the building's place, so nothing else the town builder
    rolls (ruin heights, loot tables, wrecks) moved.

## 4. Formulas

- Pieces against the walls of a room: `clamp(round(area / 4.5), 2, 9)`.
- Corridor rooms: `count = max(1, round(length / 4.6))`, each `length / count` long.
- `split`: the back band starts at `clamp(0.64 × depth, 2.6, depth − 2.6)`.
- `home`: the cross wall at half depth; the front pair split at 0.56 of the width, the back pair at 0.62.
- A layout needs 2.6 m per room each way (plus the corridor's 2 m), or it is a hall.

## 5. Edge cases

- **Car bays across the whole front** (a gas station with two bays): the lanes are kept clear, so the shop's counter and
  shelves stand along the back partition and the side walls past the lanes.
- **Saloons and hotel lobbies** stay one room at street level: the card tables (`systems/casinos.js`) own the middle.
- **Parking decks** get nothing.
- **A stair core in a small house** cuts most of a partition away: the house reads as two or three rooms, not four.
- **Old saves:** container ids are unchanged, so saved contents stay with their container; the container itself has
  moved a few metres into a piece. A liftable piece you never moved may stand a step or two from where it did.
- **A ruin with no stair** to an upper floor keeps that floor's rooms and loot out of reach, as its loot was before.
- **Cover:** a container that moved into a piece no longer has the cover point its loose crate had, and furniture
  registers no cover points. Furniture cannot be broken.
- **Not covered yet:** inner doors have no leaves (nothing to shut between rooms). No lights inside. People and infected
  upstairs still use the stair steering rule only (there is no path grid above the street), so they do not route round
  upstairs rooms well. `zombies.occupy` still places nobody. Ring towers were not looked at in the game (none was
  live where the pictures were taken); they are built by the same function and the headless check covers the kinds.
  The Phoenix island, the ring's houses and shops, the holdouts and the roadside stops already had rooms and are not
  touched.

## 6. Dependencies

- `world/citygen/build.js` (calls it after the walls, before the loot), `world/citygen/audit.js` (the walker that
  proves every floor is reached), `systems/backlots.js` (path grid), `systems/reach.js` (no loot through a partition:
  partitions are tagged `cg-wall`), `systems/homes.js`, `systems/casinos.js` (avoids `cg-furn`).
- Draw calls: none added. Partitions and pieces are instances in the town's one mesh. About 17 pieces and 6 rooms per
  building on average (705 buildings: 4,520 rooms, about 12,000 pieces). **Cost:** the town's instance count and
  collision boxes are up (the three largest towns together were 91k of the 120k instance cap, and are now about 116k;
  build time is up about 16%). The cap silently stops adding instances when it is reached; three of the very largest
  towns live at once is the case to watch.

## 7. Tuning knobs (`CG_ROOMS`)

| Knob | Value | Safe range | What it changes |
|---|---|---|---|
| `door` | 1.4 m | 1.3–1.6 | Doorway width. Under 1.3 the walk-through audit's 0.4 m walker can miss it |
| `lintel` | 2.6 m | 2.5–3 | Doorway height. Under 2.4 a head does not pass |
| `corridor` | 2.0 m | 1.6–3 | Corridor width |
| `bay` | 4.6 m | 3.5–7 | How long a room off a corridor is |
| `minRoom` | 2.6 m | 2.2–4 | Below this a layout is not used |
| `clear` / `pass` | 1.4 m | 1.3–2 | Kept free round stairs and doors; the walkway between facing pieces |
| `perPiece` | 4.5 m² | 3–10 | How full rooms are |
| `centreMin` | 4.2 m | 4–8 | How big a room must be to get rows in its middle |

## 8. Acceptance criteria (selftest, `only="cg rooms:"`)

1. **Rows:** every building kind has a rooms row; an unknown layout, an unknown piece and a purple piece are each
   caught.
2. **Headless, 8 towns and a base (705 buildings):** every building you can enter has a room on every floor you can
   reach; a house has a kitchen, a bedroom and a bathroom, a gas station a shop floor and a stock room, a school
   classrooms off a corridor; no piece stands in a partition, on another piece, at a street window or in a doorway;
   every room of every floor a stair reaches is walked into from the front door (about 1,900 upstairs rooms); every
   street-floor container is within reach of walked floor with no partition between; no container in a piece is within
   touch of the far side of a partition; container ids are unique.
3. **In a live town:** a container in a shelf is in reach from inside its room and not from the next room through the
   partition (why: wall); the `rooms` command names the rooms of the building you stand in.

Also kept green: `citygen:` (18, including the walk-through audit of every floor of every building and the shot out of
a floor-4 window), `homes:` (12), `casinos:`, `milbases:`, `storeys`.

Pictures: `docs/renders/web/cg-rooms/` (before and after: a town house, a gas station, a school on two floors, a police
station, a base headquarters, a base hospital).

Critic review 2026-11-12, first pass FAIL, three items, fixed in the next commit: a hand reached a wash basin through a
partition (thicker partitions, deeper holders, a validator rule and a check); the headless check claimed more than it
tested (it now tests doorways, windows, every room on every reachable floor, and a line test to each container, which
found and fixed a real trapped upstairs bathroom); a base's stash stood inside the new cross wall.

## Addendum 2026-11-12 (branch `feat/web-zed-innerdoors`): doors in the doorways

- **What:** the doorways between rooms in generated buildings now carry real door leaves, the same kind every other door
  in the game is: they swing, you shut them (E), lean on them, bar them, the infected cannot work the latch and beat
  them down (`WEB_DOOR_POUND.md`). Six in ten stand open, the rest ajar or shut (`RING_OPENINGS.innerOpen`), as in the
  ring's houses.
- **Where from:** the builder already recorded each street-floor doorway (`built.innerGaps`, used for the path grid);
  `systems/citygen.js openTown` hands them to `interiors.attachRing` as `innerDoors`.
- **Only round you.** Inner leaves are a record of their own per building (`cg:<building>:in`), hung when you are within
  `innerNear` (40 m) of the building and given back past `innerFar` (60 m). Outside doors keep their own record and
  their own distances (110 / 150 m). So a school's sixteen inner doors never take the leaves another building's
  outside doors need. The leaf pool went from 220 to 320 (`RING_OPENINGS.doors`).
- **Not covered:** upstairs doorways have no leaves (the door system hangs leaves on the street floor only, as for
  outside doors); ruins have none; a leaf's open or shut state is kept while its building is near and by the door
  system's own memory when you come back, as for ring doors.
- **Check:** `cg rooms: the doorways between rooms have doors` (inner leaves present, no more than the doorways, some
  open; one pulled shut blocks sight through it; 70 m away the inner leaves are gone and the outside doors are not).
- Pictures: `docs/renders/web/inner-doors/`.
