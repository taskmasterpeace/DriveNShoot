# Windows, the rest: up a drainpipe, down it, and onto a lower roof (web engine)

**Status:** built 2026-11-13 on `feat/web-zed-windows2` (on top of `feat/web-zed-furnish`).
**Asked by:** the coordinator for Robert, 11-12: "climb in and up through a ground-floor window, climb down from an
upper one where there's something to hold, and land on a lower roof."
**Files:** rows `web/src/data/interiors.js` (`WINDOW_EXIT.pipe`, `WINDOW_EXIT.roof`); the pipes
`web/src/world/citygen/build.js` (`B.pipe`); the rule `web/src/systems/windowexit.js` (`find`'s roof landing and pipe,
`pipeDown`, `findUp`, `interactUp`, `pipeUp`); `web/src/main.js` (the E chain on the street); command and checks
`web/src/agent/windows2-api.js`.

## 1. Overview

`WEB_WINDOW_EXIT.md` gave you one way out of an upper window: hang and drop to the street. It listed three things it
did not do. This does them.

1. **Up.** Every town building with stairs and a floor above the street has a drainpipe on its back wall (a side wall
   if the back has no place for one). Stand at its foot and hold E: you climb it and go in over the sill of the lowest open window beside
   it. It is a way into a building whose doors are barred, and a way past whatever is on the street floor.
2. **Down.** Upstairs at a window with that pipe in reach, the way out is the pipe: slower than letting go, and it
   costs nothing.
3. **Onto a roof.** If the window looks onto a lower roof you can stand on, you drop onto the roof, not to the street.
   The drop is measured to the roof.

Climbing in through a broken street-floor window already worked and is unchanged.

The infected do not climb pipes. A sprinter in its burst that reaches the window you left still jumps after you, as
before.

## 2. Player fantasy

The front door is barred from inside and the street is filling up. You go round the back, up the pipe and in at the
first-floor window. Later, with them on the stairs, you go out of the same window and down the same pipe without a
scratch, or out of the side window onto the roof next door.

## 3. Detailed rules

1. **Where pipes are.** A building with two or more storeys and stairs inside, that is not a ruin and not an open
   deck, gets one pipe. It stands on the back wall beside an upstairs window: halfway to the next window or the one before (1.8 to 2.7 m
   from the window's centre) or, failing that, 1.65 m to either side of it; if the back wall has no place, on a side wall;
   never on the front; never in or within 0.9 m of a street-floor door or drive bay of that wall; never down the face
   of a fire escape's doors. It serves that window on every upstairs floor where the window exists. (Counted over 156
   built towns, seeds 1000 to 1185: all 3,873 such buildings have one, none at a door; a reviewer's four other seed
   sets gave 3,575 to 3,940, the same. About 1 in 120 serves only windows whose inside is the stair's opening: those
   work going down and offer nothing from the street.)
2. **It is not a wall.** A pipe has no collider. You cannot hide behind it and it stops no round.
3. **From the street** (`findUp`): on foot, outside, within 1.2 m (`grab`) of the pipe's foot (0.6 m out from the
   wall). The lowest upstairs floor whose window on the pipe is open (a body's line and a sight line both pass through
   it at chest height from just outside) is where you go. The prompt says "Drainpipe" and the height.
4. **The climb takes** `hold + height / speed` seconds of E held (1.0 s + height / 1.4 m/s: 4.1 s to a floor 4.4 m up).
   Letting go of E before the end leaves you where you were. A tap does nothing.
5. **You arrive** 1 m inside that window, on that floor, facing in, unhurt. The climb is heard 6 m (`noise`).
6. **From upstairs** (`find`): at a window in an outside wall (the old rule), on a floor the pipe serves (not from
   the roof: the pipe stops at the top window), if this wall's pipe is within 3.4 m (`reach`) of the window and its foot is clear (open ground, no car, not another building), the way out is the pipe.
   It takes `hold + height / speed` seconds and puts you at the pipe's foot, unhurt, on your feet.
7. **No pipe in reach:** the old drop, with its cost.
8. **Onto a lower roof:** if the spot you would land on, or a spot up to 3.2 m out across an alley (`jump`: 1.8, 2.5,
   3.2 m, the nearest that finds a building), is inside another building whose roof is a deck you can stand on (a town
   building whose top level is its roof), and that roof is at least 0.6 m (`min`) below your floor, and nothing solid
   stands between the window and it at chest height, you land on it: 0.9 m (`in`) inside its edge, at most 4.4 m
   (`reach`) from the window. Alleys in the towns are mostly 2 m wide (measured: of 156 taller-and-lower neighbour
   pairs within 6 m, 67 are under 2.5 m apart and 56 more under 4 m). A building across the alley that is not a lower
   roof changes nothing: the drop is to the alley as before. The drop is your floor less the
   roof less the hang (1.9 m). If the landing spot is the stair's opening, or something solid stands there, it is
   refused ("nothing to land on over there").
9. **A roof level with your floor or higher,** a fire escape, the next building's deck: not a drop (you walk, or it
   is a wall). Nothing is offered, as before.
10. **Who follows:** a sprinter in its burst jumps from the window you left and lands where a drop from that window
    lands (the street, or the roof you dropped onto). If you went down the pipe because a drop there had nowhere to
    land (a car or a wall under the window), nothing jumps after you. Nothing follows up a pipe.
11. **The hold belongs to one way out of one window.** Turning to another wall, or from a pipe to a drop, with E still
    down does nothing until you let go and press again.
12. The `pipes` command lists the pipes near you, what the street side offers where you stand and what the window you
    face offers.

## 4. Formulas

- Time on the pipe: `hold + h / speed`, `h` the height climbed in metres (`hold` 1.0 s, `speed` 1.4 m/s).
  Up to floor 2 of a shop (4.2 m): 4.0 s. Down from floor 4 of an office (10.8 m): 8.7 s.
- Drop onto a roof: `max(0, floor − roof − hang)`. From a floor at 7.6 m onto a roof at 4.2 m: `7.6 − 4.2 − 1.9 = 1.5 m`,
  inside the safe height: no hurt. The same window to the street would be `7.6 − 1.9 = 5.7 m`.
- Hurt is the ladders' fall rule as before: nothing up to `LADDER.fall.safe`, then `hpPerM` per metre.

## 5. Edge cases

- **Something solid stands across the window inside, or inside it is the stair's opening:** that floor is skipped and
  the next floor up is tried. If none is open the pipe offers nothing from the street.
- **Boards and glass drawn on upstairs windows are looks only** (the facade kit paints boards on about a quarter of
  upper windows and a pane on about a third; neither is a collider). You climb in through them, as a round and a
  sight line already pass them. This is wrong to the eye and is listed below.
- **A car or a wall at the pipe's foot:** from upstairs the pipe is not offered and the drop rule applies; from the
  street you cannot stand at the foot, so nothing is offered.
- **Buildings in a row with no gap:** a back wall pipe may stand against the neighbour. Its foot is inside that
  building and it is unusable from the street; from upstairs the window there looks at a wall or onto that roof.
- **The street-floor window under the pipe's window** is 1.5 m or more along the wall from the pipe's foot. The
  street-floor door and window rules are asked first; the pipe is offered only when none of them has E.
- **A roof and a pipe on the same window:** the roof wins (it is asked first). The pipe is on the back wall, where a
  roof within a jump is rare.
- **The roof across the alley takes away the drop into the alley** from that window: the prompt offers the roof only.
- **Hurt, carrying, armed:** anyone can climb. There is no strength or load test.
- **Being shot at on the pipe:** you are where you started until the hold completes; then you are where it ends.
  There is no body on the pipe in between.
- **Multiplayer:** the climb moves you like any other move; the other page sees you appear upstairs or at the foot.
- **Not covered yet:**
  - an upstairs window that is drawn boarded or glazed does not stop you (see above): it needs the facade kit's boards
    and panes to become real, which is its own piece of work;
  - the hand-built places (the first island's tower, the Phoenix ring) have no pipes;
  - no climbing animation and no time spent visibly on the pipe (you are moved when the hold completes);
  - people the game runs and the infected do not use pipes, in either direction;
  - you cannot climb a pipe to the roof, or past the lowest open window to a higher floor;
  - awnings, canopies and cars are not things to land on;
  - a roof that is not a deck (a pitched or sealed roof, any hand-built building's roof) is not landed on;
  - a pipe cannot be broken, greased or pulled down.

## 6. Dependencies

- `WEB_WINDOW_EXIT.md` (the window, the hang, the drop, the followers): this extends it; that doc's "not covered"
  list now points here for the first three items.
- `world/citygen/build.js` (the wall loop's window centres, the fire escape record), `world/storeys.js` (`at`,
  `heightAt`, a record's `Y`, `n`, `cg`), `systems/citygen.js` (`live`, `buildingAt`), `engine/collision.js` rays.
- `main.js`: on the street the pipe is asked after the ladders, the upstairs window rule and the street floor's door
  and window rules.
- `WEB_FURNISH.md`: the space inside every window is kept clear of furniture (`winKeep`), which is why you can stand
  where the climb puts you.
- Draw calls: none added (a pipe and its brackets are boxes in the town's one mesh: 2 to 6 a building).

## 7. Tuning knobs (`WINDOW_EXIT.pipe`, `WINDOW_EXIT.roof`)

| Knob | Value | Safe range | What it changes |
|---|---|---|---|
| `pipe.speed` | 1.4 m/s | 0.5–4 | How long a climb takes (how exposed you are) |
| `pipe.reach` | 3.4 m | 1–4 | How far along the wall from a window the pipe may be |
| `pipe.grab` | 1.2 m | 0.8–2 | How near the foot you must stand to start up |
| `pipe.foot` | 0.6 m | 0.4–1 | How far out from the wall the foot is |
| `pipe.noise` | 6 m | 0–20 | How far a climb is heard |
| `roof.min` | 0.6 m | 0.3–2 | How much lower a roof must be to count as a drop |
| `roof.in` | 0.9 m | 0.5–2 | How far inside the roof's edge you land |
| `roof.jump` | 1.8, 2.5, 3.2 m | each over `out`, at most 4 | How far across an alley a roof is looked for |
| `roof.reach` | 4.4 m | longest jump + `in` or more | The furthest landing spot from the window |

## 8. Acceptance criteria (selftest, `only="windows 2:"`)

1. **Rows and pipes:** the rows validate; a pipe slower than 0.5 m/s and a roof reach shorter than its longest jump
   are each caught; over 6 towns built headless at least nine in ten whole buildings with a floor above the street have a pipe;
   and no building without stairs has one; every pipe serves a real window hole on each floor it lists, stands on an
   outside wall that is not the front, never in or beside a street-floor door or bay, and no collider was made for one.
2. **Up and down:** in a live town at a pipe's foot the prompt names the pipe; a 0.2 s tap leaves you in the street;
   holding E for `hold + height / speed` (within 0.2 s) puts you on that floor, inside the building, with the health
   you had; facing the window from inside, the way out is the pipe and not blocked, the prompt names it, and the hold
   brings you to within 0.3 m of the pipe's foot with the health you had and on your feet; an infected set at the foot
   is still in the street four seconds later.
3. **Onto a lower roof:** at a window found in a live town that looks onto a lower walkable roof, the way out names
   the roof; the drop equals your floor less the roof less the hang (within 0.1 m) and is at least a metre less than
   the height to the street; after the hold you stand on that roof's level, at least `in` inside its edge, with that
   building under your feet, having lost what that drop costs (within 1); from a floor not above the roof the same
   window offers no roof.

Pictures: `docs/renders/web/windows2/` (the pipe from the street; upstairs after the climb; at a mill window over a
warehouse roof, and on that roof after the drop).
