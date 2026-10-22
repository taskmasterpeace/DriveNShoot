# WEB_STOREYS — buildings with floors above and basements below (web engine)

**Status:** SPEC (2026-10-22). Not built. Build after the streaming (P1) and role-system branches are merged: it
touches `engine/collision.js`, `engine/nav.js`, `systems/characters.js`, `systems/interiors.js`, `world/city.js`,
`systems/ai.js`, `systems/combat.js` and `main.js`, all of which those branches also touch.

## 1. Overview

Every building in the web engine today is one storey: walls, a floor slab at 0, a roof that hides when you walk in.
Gameplay is flat: collision, sight and bullets are 2D, and the only height a person has is visual (a sentry's tower
deck, a dune under their boots). This system adds **levels**: an integer `lv` on every person, container, door,
window and static box (0 = the street, 1 = the first floor up, −1 = a basement), **stairs** that carry a person from
one level to the next, and the rendering rule that inside a building you see the level you are on and nothing above
it. Up to four storeys above ground and one basement; storey height 3.2 m.

A level is a separate layer of the same 2D world: two people on different levels do not collide, do not see each
other, and cannot shoot each other (v1; windows that look down to the street are a v2 rule below). The ground level is
the world as it is now, unchanged for every system that never asks about levels.

## 2. Player fantasy

Hotline Miami with a staircase. You kick the back door of the old Glass Flats motel, clear the lobby, and hear boots
on the floor above you. The stairs are a choke point: you can hold the bottom and make them come down to you, or go
up and meet them in a corridor that is three doors and a window wide. Upstairs you see only that floor, the street a
long way down past the glass. The basement under the clinic is black except for your flashlight, the rest of the
world a dark mass above you, and something down there has been waiting a long time.

## 3. Detailed rules

**Levels.** `lv` is an integer in −1..4. Every person (`c.lv`, default 0), container (`box.lv`), door and window
(`row.lv`), static box (`b.lvMask`, a bitmask over levels, default: level 0 only) and ground pile carries it.
Vehicles are always level 0.

**Buildings with storeys.** A building row gains `storeys` (1–5; 1 = today's building) and `basement` (bool).
- Exterior walls rise `storeys × 3.2 + 0.4` m and are one static box per wall run whose `lvMask` covers every storey
  (a wall is a wall on every floor). Window and door gaps are per storey: the ground storey keeps today's doors;
  upper storeys get windows on every side (one per 4 m of wall) and no outside doors (a fire-escape door is v2).
- Each upper storey has a floor slab at `k × 3.2` (a box batch, one instance per storey) with a hole over its
  stairwell, its own interior partition (re-rolled per storey from the building's seed) with a door, furniture and
  containers placed by the existing furnishing code at that level.
- A basement is a slab at −3.2, walls on level −1 only, no windows, one door from the stair landing, furniture
  rolled from the `cellar` table (tins, tools, a locked gun safe once safes exist).
- The roof sits on the top storey.

**Stairs.** A stairwell is a 1.4 × 4.4 m rectangle against an inside wall, chosen from the building seed so it never
blocks a door. Each flight is a row `{ x, z, ux, uz, len 4.4, w 1.4, from: lv, to: lv + 1 }` (u = the climbing
direction). A person whose centre is inside the flight's rectangle is **on the stair**: `t = clamp(((p − start) · u)
/ len, 0, 1)`; their visual height is `(from + t) × 3.2`; they collide with the stairwell's own walls (on both
levels). They leave the flight at the top end (t reaches 1 while moving +u) into level `to`, at the bottom end (t
reaches 0 while moving −u) into level `from`. The flight's other three sides are walls on level `from` (its
underside) and a railing on level `to` (the hole in the slab), so the only ways onto a flight are its two ends.
Running on stairs is allowed; a dive on stairs is refused (you stumble: knockdown 0.6 s at the bottom).

**Collision.** `resolveCircle(p, r, mover, minY, skip, lv)`: a static box is tested only if `b.lvMask` includes the
mover's level. Doors and windows (interiors) the same by `row.lv`. People collide with people on the same level.

**Sight.** `lineOfSight(ax, az, bx, bz, mode, lv)` tests only statics on that level. Two people see each other only
if they are on the same level (v1). A person on a stair counts as both its levels for sight within the stairwell
(the flight is open between floors), and as the nearer level everywhere else.

**Bullets and blasts.** A shot travels on the shooter's level: it hits people on that level and statics on that
level. A blast hits people on its level, and on the levels directly above and below at half damage if it is inside a
building (a grenade through a floor is a v2 joke; v1 is the shock through the slab). Fire spreads on its level.

**Noise** (`g.noise`): heard on the same level at full radius, one level away at half radius, two or more at none.

**The AI.** A person never targets someone on another level. A person whose target goes up or down a stair in the
same building and who has the target's last position follows: path to the flight's end on its own level (the
storey's own nav grid), climb it, carry on. A person with no target stays on its level. The player's level is
written into every deed and rumor (WEB_WORLD_MEMORY: "on the first floor of the motel").

**Navigation.** Level 0 keeps the world nav grid. Every upper storey and basement gets its own small `NavGrid` over
the building's footprint (nav.js gains an origin `ox, oz` so a grid can sit anywhere), built from that level's
statics. A* runs on one level; a path between levels is level A's path to a flight end, the flight, level B's path.

**Rendering.** Outside: every storey and the roof show. Inside a building on level L ≥ 0: that building's roof and
every storey above L hide (their wall tops, slabs, furniture, people and containers above L are not drawn); walls are
cut at L's ceiling (each storey's wall section is its own batch instance). The camera stays at the indoor height
(`ZOOM.indoor`) measured from L's floor. In a basement (L = −1): the building above ground hides entirely, and a dark
overlay (one mesh, the world minus the basement's footprint, black at 0.9) covers everything else; the flashlight
and the basement's own bulb are the light. People and piles on other levels are never drawn in a basement and drawn
but untargetable from upper storeys looking down.

**Containers and the PACK screen.** A container, pile or body is reachable only from its own level; dropping puts a
pile on your level; the dead leave their body on their level.

**Saves.** `lv` is saved with each person, pile and container; a save without it loads everyone at level 0.

**Which buildings get storeys** (v1, data rows): the Rust Haven saloon (2 storeys), the clinic (1 + basement), the
sheriff's office (1 + basement cells), the Glass Flats motel (2), the ruins' office blocks (3–4, upper floors ruined:
no slab over some cells, so the sky shows), Outpost Nine's command post (2). The radio station (WEB_WORLD_MEMORY)
gets a mast and a 2-storey building in v2.

**v2 (not in this build):** shooting from an upper window down at the street (and back up); fire escapes;
rappelling; collapsing floors; elevators; seeing a lower level through a floor hole.

## 4. Formulas

| Name | Formula | Variables and ranges | Example |
|---|---|---|---|
| Storey height | `H = 3.2` m | — | a 3-storey wall is `3·3.2 + 0.4 = 10` m |
| Level of a floor slab | `y = lv · H` | lv −1..4 | level 2 floor at 6.4 m |
| Stair progress | `t = clamp(((p − s) · u) / len, 0, 1)` | s = flight start, u = unit climb direction, len 4.4 m | 1.1 m up the flight: t = 0.25 |
| Height on a stair | `y = (from + t) · H` | t 0–1 | t 0.25 from level 0: 0.8 m |
| Stair pitch | `atan(H / len)` | 3.2 / 4.4 | 36°: a real stair's pitch (30–40°) |
| Level mask bit | `1 << (lv + 1)` | lv −1..4 → bits 0..5 | ground = 0b10 |
| Noise by level | `r · (1, 0.5, 0)[|Δlv|]` | Δlv clamped to 2 | an 18 m door bang is a 9 m bang upstairs |
| Blast through a slab | `dmg · 0.5` on the levels above and below | inside a building only | a frag's 60 → 30 upstairs |

## 5. Edge cases

- **Standing on the stair when a save is taken:** saved with `lv = from` and the exact x, z; on load the stair rule
  re-derives t from position, so they resume on the flight.
- **A door at the top of the flight:** forbidden by placement (the landing is 1.4 m deep and door-free).
- **Two people meet on a flight:** they collide normally (same flight = same level for collision).
- **Vehicles and stairs:** a vehicle is level 0 only; a stair's bottom landing is at least 1 m inside the building,
  so no car reaches one.
- **A building with a ruined slab cell:** that cell is a hole: walking into it from above drops you one level (fall
  damage 10 per storey, knockdown 1 s); from below it is just a gap in the ceiling (the sky shows).
- **The player dies upstairs:** the body and its container stay on that level; the respawn is at the clinic door at
  level 0.
- **An AI follower is on another level when you leave the building:** it follows the stair path out like any path.
- **The zoom out to HIGH inside a building:** inside, the zoom is capped at the indoor height (as today).
- **A raid while you are upstairs:** raiders path to the stairs like any follower; the director's ring and the
  "out of sight" rule use horizontal distance only, unchanged.
- **Explosions at the stair:** a blast on a flight counts for both its levels at full damage.
- **Old content packs** with buildings that name no storeys: one storey, as today.

## 6. Dependencies

- `engine/collision.js`: `lvMask` on boxes; `resolveCircle` and `lineOfSight` take a level. (WEB_JUMPS's `minY`
  stays: it is height within a level.)
- `engine/nav.js`: a grid with an origin; per-storey grids.
- `world/city.js`: storeys, slabs, stairs, per-storey walls, windows and furniture; the basement overlay.
- `systems/interiors.js`: doors and windows carry `lv`; their collision, rays and kicks filter by it.
- `systems/characters.js`: `c.lv`, the stair rule, visual height `lv · H` (+ stair t); hidden when above the player's
  level inside.
- `systems/ai.js`, `systems/combat.js`, `main.js` (`noise`, `onKill`, the roof-and-storey hiding, the camera).
- `systems/inventory.js` (WEB_INVENTORY): containers and piles carry `lv`; `nearest` filters by it.
- `systems/deeds.js` (WEB_WORLD_MEMORY): deeds record the level; witnesses only on the deed's level.
- `systems/stunts.js` (WEB_JUMPS): `heightAt` stays the ground's height; stairs are not ramps.
- `agent/api.js`: `teleport lv=`, `state` reports `lv`, a `storeys` command, the selftest checks below.

## 7. Tuning knobs

| Knob | Where | Value | Safe range | Affects |
|---|---|---|---|---|
| STOREY_H | data/buildings.js | 3.2 m | 2.8–3.6 | stair pitch (with the flight length), wall height |
| FLIGHT_LEN / FLIGHT_W | data/buildings.js | 4.4 / 1.4 m | 3.6–5.6 / 1.1–2 | how steep and how wide a stair fight is |
| windows per metre (upper) | data/buildings.js | 1 per 4 m | 1 per 2.5–6 m | how much an upper floor sees and is seen |
| basement darkness | data/buildings.js | 0.9 | 0.75–1 | how blind a basement is without a light |
| noise falloff by level | data/buildings.js | 1 / 0.5 / 0 | — | how much a floor muffles |
| slab blast share | data/buildings.js | 0.5 | 0–0.8 | grenades through floors |
| storeys per building row | data/buildings.js | per building | 1–5 | the skyline |

## 8. Acceptance criteria (selftest)

1. **Walk up and down:** the player walks (held keys, no teleports) from the saloon's front door to the flight's foot,
   up the flight, and on to the first floor: `lv` goes 0 → 1 exactly at the top end, visual height reads 3.2 m on the
   landing, and the walls of the ground floor no longer block (a box that exists only on level 0 under the landing is
   walked over); back down: `lv` 1 → 0 at the bottom end.
2. **Layers do not touch:** a drifter on level 1 standing directly above a drifter on level 0: no collision push, no
   line of sight between them, a shot by the one upstairs at the other's x, z hits nothing on level 0.
3. **Follow up the stairs:** a raider with a grudge, on level 0, reaches the player on level 1 by the stairs within
   20 s of the player arriving there.
4. **Rendering:** with the player on level 1 inside, the roof and level-2 instances are hidden and level 1's are
   shown; outside, all are shown; draw calls stay under 150 with every storeyed building in view.
5. **Basement:** at level −1 the overlay is visible, the building's above-ground instances are hidden, a crate there
   rolls `cellar` loot, and a level-0 noise of 18 m is heard downstairs only within 9 m.
6. **Saves:** a snapshot with the player on level 1 and a body on level 1 restores both on level 1.
7. **Perf:** stress scenario within 0.2 ms/frame of the pre-storeys baseline (A/B on the same machine load).
