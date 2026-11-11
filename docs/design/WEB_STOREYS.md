# WEB_STOREYS — buildings with floors above and basements below (web engine)

**Status:** v1 BUILT (2026-10-22, `world/storeys.js`, data `data/storeys.js`): upper storeys on the streaming vertical
model, as §0 below records. Basements, shooting between floors (an upper window down at the street), noise and blasts
through floors are v2 (§0.4). **v2 BUILT (2026-11-11, branch `feat/web-storeys`): the ring rises (2-6 storeys), the
facade kit, roofs as places, fights between floors, per-floor danger - §9 below (its own eight sections).** Basements
landed with `feat/web-underground` (systems/underground.js).

## 0. As built (v1) - where it differs from the spec below
1. **Heights.** A building's street storey keeps the wall height city.js rolled for it (4.2-6 m; its RNG must not
   move), so floor 1 stands on that wall top: `Y[1] = h`, `Y[k] = h + (k-1)·3.2`. Every flight keeps the one pitch
   (3.2 / 4.4 = 36°), so the street flight is longer: `h / 0.727` = 5.8-8.3 m. Upper flights switch back in a second
   1.4 m band beside the first.
2. **No `lv` field.** A person's floor is where their `gy` sits (`storeys.levelOf`); the sim keeps `gy` (`main.js
   standOn`, called from the player's and `ai.move`'s movement), so someone off screen climbs too. `c.storey` names the
   storeyed building they are in.
3. **Collision, sight, bullets by height range, inside storeyed buildings only.** `statics.resolveBody(p, r, c)` asks
   only the boxes across `[gy + 0.25, gy + 2.4]` once a person is off the street floor; `g.sees(a, b)` and the shot
   (`combat`) run at the floor's eye height (`gy + 1.2/1.3`); `storeys.sameFloor(a, b)` gates sight, bullets, bites,
   reach (talk, search, beds, cars, doors), crowd shoves and witnesses. Everywhere else - dunes, ramps, bridge decks -
   the old flat rules hold exactly.
4. **v1 leaves out:** basements (and the dark overlay), shooting up or down through windows, noise and blasts muffled by
   floors (they still reach every floor), ruined slabs, fire escapes. Blood pools and footprints upstairs are drawn on
   the street floor's ground (under the slab). Melee and throws do not check floors.
5. **Which buildings:** by district, not shop (shop names are assigned after the world is built): 30% of the intact town
   houses rise one storey, 45% of the larger ruins 1-3 (`RISE`), rolled from each building's own seed (its position);
   18 buildings in Phoenix today, the Clinic among them. A staircase goes along an inside wall from a corner, clear of
   that wall's doors, the partition, furniture and beds; a building with no such wall stays one storey.
6. **The island's golden hash does not move:** storeys build with their own seed after the city, and `hashIsland` skips
   `storey*` boxes; `storeys.view().hash` guards them instead.
7. **Agent API:** `storeys` (the list, floors, flights with landings), `teleport floor=k`, `state` reports `gy` and
   `floor`; saves carry `gy` (an old save loads you on the street floor).


**Build on the streaming branch's vertical model, not a parallel one** (read once it lands): static boxes carry a
`base` (they can float: a bridge parapet) as well as a `height`, and `resolveCircle(p, r, mover, minY, skip, topY)`
skips a box that starts at or above the mover's top or ends at or below its feet; people remember the height they
stand at (`c.gy`), and `heightAt(x, z, y)` answers a **deck** only for someone already up near it (`y > deckH − 2.2`),
so traffic passes under a bridge while the cross road goes over. A storey's floor is exactly such a deck (with a hole
at the stairwell), a flight of stairs is a ramp between two decks, and a storey's walls are boxes with
`base = k·3.2, height = (k+1)·3.2`. The integer `lv` below then becomes a derived name for `floor(gy / 3.2)` (for
saves, deeds and the rendering rule) rather than a second source of truth, and `lvMask` is not needed: the y-range
does that job. Rays (sight, bullets) need a height argument (`gy + 1.2`) so they meet only the boxes that span it.

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

---

## 9. STOREYS v2 - the ring rises, the facade kit, floors as places to fight (2026-11-11)

Robert's grade card: "Buildings - C. All walk-in; stairs; floors as places. Max 4 storeys, only 18 buildings; no
facades." This section is v2's own spec, in the eight sections. Code: `world/ringrise.js` (the ring's towers),
`world/facades.js` (the facade kit), `world/storeys.js` `across` / `floorShare` (fights between floors), rows in
`data/storeys.js` (`MAX_ABOVE`, `RING_RISE`, `ACROSS`, `DANGER`, `FACADE`), agent commands `rise`, `facades`, `floors`,
checks in `src/agent/storeys-checks.js` (names start `storeys v2:`).

### 9.1 Overview
- **The ring rises.** A share of the Phoenix ring's lots stand 2-6 storeys by zone (§9.3): the DOWNTOWN belt of hotels,
  offices and apartment blocks that rings the walled island (4-6 storeys: the skyline you drive past on the first ring
  street), the Strip (2-3), the dead houses (2), the Burn's adobe shells (2-3, top floors open to the sky). The yards stay
  one tall storey. A lot that rises is built by the generated-town builder (`world/citygen/build.js`): a switchback stair
  core to every floor and up to the roof, a parapet, window bays on every floor, fire escapes, plank bridges between
  facing roofs, per-floor loot. It is built when its ring chunk turns HOT and released when it cools, through
  `citygen.stampRing` (collision tier, the one instanced mesh, the storeys law, doors and windows near you, loot) - but
  never as a settlement (no residents, hordes, road grip, no place against `PLACE.maxLive`).
- **The cap is six storeys everywhere** (`MAX_ABOVE = 5` floors above the street; `VERT.maxStoreys = 6` for generated
  kinds; the island's tower is clamped by it).
- **The facade kit** dresses every storeyed building - the island's, every live town's, every ring tower's - in five
  instanced meshes for the whole world.
- **Roofs are places:** a stair to the roof, a parapet to fight behind, HVAC boxes, water tanks and sandbag nests that
  are colliders and cover, plank bridges to the next roof, a rifleman perched on a tall roof.
- **Fights between floors:** someone at an upper window (or a roof's edge) sees and is seen from the street and from
  other buildings, and rounds cross both ways through the window holes; noise and blasts carry one floor at half.
- **The cutaway** (`systems/cutaway.js`, already built by the camera lane: Bayer dither in a screen circle round the
  player, walls on the camera side down to knee height, the floors above hidden by `setView`) is reused, not rebuilt; v2
  adds the facade kit to `setView` (a building's kit above your floor hides with its walls) and a pixel test against a
  real six-storey ring tower.

### 9.2 Player fantasy
"I can climb that ruin and fight floor by floor." You drive the first ring street at noon and the island's wall is on
your left and a row of six-storey hotels and apartment blocks on your right, their windows boarded, blown black or
holding a last shard of glass, a water tank on every roof. A crack from up there: a rifleman behind sandbags. You leave
the car under the overhang of the next block, go in by the back door, climb six flights past rooms where the infected
stand in the dark (more of them the higher you go, and the gun crates with them), come out on the roof, cross the
planks to his roof and finish it at the parapet. At night the same street is black but for a few warm windows.

### 9.3 Detailed rules
**Which lots rise** (`ringrise.riseOf`, from the lot's own seed: the ring's rng is never read). A block is DOWNTOWN when
its centre is within `belt` (170 m) of the island's edge (Chebyshev) and its zone is the Strip or the dead houses.
| zone | share | storeys (incl. street) | ring kind -> generated kind | escape | bridges |
|---|---|---|---|---|---|
| downtown | 0.62 | 4-6 | mall -> hotel, diner/shop -> office, house/bungalow/duplex -> apartment | 0.85 | 0.85 |
| strip | 0.40 | 2-3 | mall, diner -> shop | 0.6 | 0.5 |
| residential | 0.20 | 2 | house, bungalow -> house; duplex -> rowhouse | - | - |
| industrial | never | 1 (the warehouse's 6-7.4 m bay) | - | - | - |
| ruins (the Burn) | 0.12 | 2-3, 60% ruined (open top floor) | house, bungalow -> adobe; shop -> shop | 0.3 | - |
A fuel stop never rises (its canopy). A downtown footprint grows inside its lot to a floor plate of at most 24 x 20 m,
keeping 3.1 m each side (a fire escape's 2.8 m) and 2.5 m to the lot's back; under 10 m it keeps the ring's footprint.
The lot becomes an EMPTY lot carrying `rise` (its row): the ring never builds its one-storey shell, the scatter keeps off
it (`ring.solid`), `ring.survey` counts it as a building (`risers`, `byStoreys`, `tallest`).

**Building it** (`ringrise.chunkTown`, `RingRise.chunkOn`): the chunk that holds a tower's centre owns it. Its towers
become one generated-town plan (`makeBuilding` per row, the storeys forced), then roof bridges (`roofBridges` with the
rows' share: facing roofs 1.5-7 m apart, within 3.2 m of height, one per roof), then fire escapes: 3+ storeys, a side
wall (never the front, never a side a bridge lands on) whose side yard is at least 3.1 m deep. `buildTown` makes it
solid; the facade kit dresses it (its roof clutter and lean-to posts join the colliders first); `citygen.stampRing`
registers it. Going cold: its people go, its kit, its collision, its loot registration.

**Upstairs is more dangerous** (`DANGER`, `RingRise.populate`, once per build, from the building's seed): floor k >= 1
holds up to 2 infected at chance `0.08 + 0.1 k` each; a building of 4+ storeys whose stairs reach the roof has a raider
rifleman perched on it (share 0.45) in the facade kit's sandbag nest, facing the street (perched: he turns and shoots,
never steps off). At most 6 a chunk; never while free character slots are 32 or fewer (a building waits, `update` tries
again each second). Loot is the generated builder's: containers on every floor, the gunsmith table on floor k >= 2 at
`0.18 k`, a crate on a reached roof half the time (the gunsmith's).

**The facade kit** (`FACADE`; every roll the building's own id). Each upper window bay: glass 34% (a cracked pane left
in its top 28-54%: sight and rounds pass under it), boarded 26% (three planks outside with a firing slit at sill +
0.18..0.55 m: eye height is free), blown 14% (soot up the wall over it), else open; a lamp behind 20% of the glass bays
and 28% of the open ones after dark (amber, not tone-mapped: never bleached white). Roof bridges get rope rails on posts. A ledge at every floor line (0.14 proud, 0.16 tall), a cornice at the top (0.28
proud, 0.4 tall). The roof: 1-3 HVAC boxes, a water tank on legs on 4+ storeys, a sandbag horseshoe behind the
street-side parapet (always on 4+ storeys with a walkable roof, else 22%): colliders on a walkable roof (`fk-hvac`,
`fk-tank`, `sandbags`). A hotel's rooftop sign on its street edge. Damage on 32% (always on a ruin): 1-3
rebar-and-hole patches by the corners. Homes: a laundry line between two windows of one floor (45%). Shops, offices,
hotels: a hand-painted sign over the street door (16 boards, plain trade words, no brands). Ring towers: a tin
lean-to against a side wall (30%) and the ring's block yard wall (1.8 m, `fk-wall`) down both sides from the back
corners and across the lot's back (the side with a fire escape stays open, the front always does).

**Across floors** (`storeys.across(a, b)`; `ACROSS.window`). Two people on different floors of DIFFERENT places see and
shoot each other when the higher one is up a storeyed building and within `reach` (2.4 m) of the outside wall the line
between them leaves by (`roof` 3.0 m from the edge on a roof, an escape landing or a bridge), within `range` (70 m),
and - when the lower one is up another building - they are at their own window too. The sight line then runs at the
higher one's floor height (`main.sees` -> `losAt`: only what stands at that height meets it, so the window hole lets it
through and a taller building does not); two floors of ONE building never (the slab). A round fired UP from the street
(`combat.segment`): it climbs over what stands at street height and reaches the person at the window if nothing at
their floor's height stands between. Down was v1.5 (WEB_CITYGEN §3.3) and is unchanged.

**Floors muffle** (`storeys.floorShare`): inside a storeyed building a noise reaches `[1, 0.5, 0] x` its radius by floors
apart (same / one / two+: one floor = up to `LEVEL.same + 4.6` m apart, so a 4.2-6 m street storey counts as one), and
a blast does `[1, 0.5, 0]` of its harm; a blast goes off on the thrower's floor when it lands inside their own
building, else on the street. Outside the storeyed buildings both keep the old flat rule.

### 9.4 Formulas
| Name | Formula | Variables and ranges | Example |
|---|---|---|---|
| Belt test | `max(|cx|, |cz|) - 464 <= 170` | block centre (m) | block centre (520, 120): 56 -> downtown |
| Floor heights | `Y[0] = 0, Y[1] = h0, Y[k] = h0 + 3.2 (k - 1)` | h0 by kind: hotel 4.6, office 4.4, apartment 3.8 | 6-storey hotel: roof at 4.6 + 16 = 20.6 m |
| Floor plate (downtown) | `w = min(24, lotW - 2 x 3.1)`, `d = min(20, lotBack - 2.5 - front)` | lot 64 x 36 (strip) | hotel 24 x 20 |
| Escape room | `room = lot side - (wall + 0.2) >= 3.1` | 2.8 m of flights + 0.3 | a 3.1 m side yard: yes |
| Danger upstairs | `p(k) = min(0.9, 0.08 + 0.1 k)` per try, 2 tries a floor | k = 1..5 | floor 5: 0.58 each, 1.16 expected |
| Rich loot | `p(gunsmith) = 0.18 k` for k >= 2 | per container | floor 4: 0.72 |
| Window reach | `exit(hi -> lo) <= 2.4` (roof 3.0) | exit: distance along the line to the outside face | 0.75 m inside a window: 0.95 -> yes |
| Noise by floors | `r' = r x [1, 0.5, 0][n]`, `n = 0 if dy <= 1.6, 1 if dy <= 6.2, else 2` | dy: height between | a 30 m shot on floor 1: 15 m heard on floor 2, 0 on 3 |
| Lamp opacity | `min(0.92, (night - 0.15) x 1.6)` when `night > 0.15` | sky.night 0..1 | full night: 0.92 |
| Draw calls | `+5` (kit, glass, lit, tank, sign) `+2` shadow (kit, tank) | lit hidden by day, empty meshes hidden | see §9.8 #11 |

### 9.5 Edge cases
- **A chunk turns hot while the street is crowded:** a tower's people wait (`pending`) until free slots exceed 32; the
  building is there at once.
- **A tower straddles two chunks:** the chunk holding its centre owns it; the other chunk's collision tier still meets
  it (citygen's 8 m grid is global).
- **The player is inside a tower when its chunk cools:** the chunk cannot cool while you are in it (hot radius 224 m);
  a teleport away releases it, and `releaseRing` puts anyone left on a released floor back on the ground (`c.storey`).
- **A shot fired from the street at someone two floors inside, not at a window:** `across` refuses (more than 2.4 m from
  the wall along the line), so no sight and no hit.
- **Standing right behind a yard wall:** the cutaway keeps what is within 0.8 m of your depth (the wall in front of your
  knees stays): by design, a wall you lean on still covers your legs.
- **A sniper's roof is a ruin:** no rifleman (a ruin's roof is open sky, `S.n !== B.n`).
- **Two facing roofs both want a bridge on one side:** one bridge a roof (`roofBridges`), and no escape on a side a bridge
  lands on.
- **Agents' saves:** a tower is rebuilt from data on load (pure), its loot rides the ring containers' record (`ringKept`
  through `inventory.registerRing`), so a looted crate stays looted.
- **The camera boom inside a tower** (ANGLED close with a tower south of you): the circle shows you; the rest of the frame
  is the tower's inside. A boom that pulls in short of walls is a camera-lane follow-up.

### 9.6 Dependencies (both ways)
| v2 uses | how | noted there |
|---|---|---|
| `world/ring.js` | `makeBlock` -> `riseBlock`; `solid` and `survey` read `L.rise` | ring.js comments |
| `world/streamer.js` | `ringOn` / `ringOff` -> `ringrise.chunkOn/Off` | streamer.js comments |
| `systems/citygen.js` | `stampRing` / `releaseRing` / `extra`; `stamp` -> `facades.addTown`, `release` -> `facades.remove` | `WEB_CITYGEN.md` (ring towers are generated buildings) |
| `world/citygen/build.js`, `layout.js` | `buildTown`, `makeBuilding`, `roofBridges(share)`; `out.upWins` (upper bays for the kit) | build.js header |
| `systems/cutaway.js` (`WEB_CAMERA.md` §3.4) | unchanged; facade materials are patched like any | `WEB_CAMERA.md` |
| `main.js` `sees`, `systems/combat.js`, `systems/ai.js` `onNoise`, `systems/throwables.js` `explode` | the across-floors law | comments at each |
| `data/materials.js` | `fk-hvac`, `fk-tank`, `fk-wall` | rows there |
| `WEB_DEATHLANDS_GAP.md` G4 | acceptance #3, #8 | G4 |

### 9.7 Tuning knobs
| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `MAX_ABOVE` | 5 | 3-7 | the skyline's cap; above 5 the tilted camera needs >= 60 m of boom to see the roofs |
| `RING_RISE.belt` | 170 m | 80-320 | how deep the downtown belt is (1-4 block rows) |
| `RING_RISE.downtown.share` | 0.62 | 0.3-0.9 | skyline density downtown (more = more draw-free instances, more build ms per chunk) |
| `RING_RISE.*.storeys` | see §9.3 | 2-6 | each zone's height |
| `RING_RISE.downtown.grow` | 24 x 20, side 3.1, back 2.5 | w 14-28, d 12-22, side >= 3.1 | floor plate; side < 3.1 loses fire escapes |
| `RING_RISE.*.escape / bridges` | 0.85 / 0.85 downtown | 0-1 | outside stairs, roof-to-roof routes |
| `ACROSS.window.reach / roof / range` | 2.4 / 3.0 / 70 m | 1.2-3.5 / 2-5 / 40-120 | how close to a window you must be to fight through it |
| `ACROSS.noise / blast` | [1, 0.5, 0] | each 0-1 | how much a floor muffles |
| `DANGER.infected` | base 0.08, perFloor 0.1, max 2 | base 0-0.3, perFloor 0-0.2 | how infested the upper floors are |
| `DANGER.sniper.share` | 0.45 | 0-1 | rooftop riflemen on 4+ storeys |
| `DANGER.reserve` | 32 | 16-60 | free slots kept for the street before a tower is peopled |
| `FACADE.window` | 0.34 / 0.26 / 0.14, lit 0.20 | each 0-0.6 | how dead or lived-in a facade reads |

### 9.8 Acceptance criteria (selftest `only=storeys v2`)
1. **Rows:** the cap is 6 everywhere (MAX_ABOVE 5, VERT.maxStoreys 6, no island building over it); zone ranges as §9.3;
   floor shares [1, 0.5, 0].
2. **#8a:** a six-storey building stands in Phoenix downtown (the island's tower) and in the ring (a downtown tower with
   7 floor heights and a roof its stairs reach).
3. **#8b:** the walkability audit (`world/citygen/audit.js`) reaches every floor of every live ring tower from its street
   door, and a tower's front door is reached from the ring street on the foot nav grid.
4. **#8c:** from a floor-4 window of a ring tower a shot hits a staged street target; the street target sees the window
   and its round reaches a person standing there; from the pier beside the window, neither.
5. **#3:** with a real six-storey ring tower between the camera and you (ANGLED, D 20), >= 90% of your screen circle shows
   you (pixel test against the tower removed), and with the cutaway off it does not.
6. **Roof bridge:** walked on held keys from one roof across the planks onto the next (height and building change).
7. **Fire escape:** walked on held keys from its foot to its top landing (the storeys law's steer).
8. **Floors muffle:** noise and blast shares 1 / 0.5 / 0 by floors apart in a tower; a raider on the shooter's floor turns,
   one two floors up does not; the street keeps the flat rule.
9. **Facade kit:** the island and every live ring chunk dressed (glass, boards, soot, ledges, tanks, HVAC, nests, signs)
   in 5 meshes, nothing over capacity; lamps off at noon, on at 23:00.
10. **Danger and loot:** upper-floor containers, a roof crate, infected upstairs or a rooftop rifleman, and the rifleman
    sees the street from his nest.
11. **Budget:** under 150 draw calls with the downtown belt in the widest drive view (ANGLED, TOPDOWN, ISO at D 175).
12. **Perf:** `scenario name=stress` ABBA with fresh browsers vs the base commit: under 150 draw calls, ms/frame inside
    noise (results in the hand-back and §9.9).
