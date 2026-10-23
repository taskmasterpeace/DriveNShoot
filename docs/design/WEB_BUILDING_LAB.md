# WEB_BUILDING_LAB — making places fast, on the engine's own generators

**Status:** BUILT 2026-10-23 (`web/lab.html`, `web/src/lab/`, the loader `web/src/world/authored.js`, rows in
`web/src/data/authored.js`, the big plans in a marked block of `web/src/data/floorplans.js` and `web/src/data/ring.js`).

Robert, 2026-10-23: "use our plans, make the foundation, make stairs and all of that... I'm wondering if you can customize
our tool to be able to do stuff faster." His Floor Plan Lab in the other game (`D:/lsw/floorplan.html`) is the model: a
seed-driven 2D plan beside a live 3D building, size/room/door controls, reroll, export. This is that, for DIVIDED STATES,
with one difference that matters: **nothing in the lab is a mock**. The plan comes from `floorplan()`, the 3D building
from the ring's own `geo()`, the furniture from the ring's own `furnish()`, the check from the ring's own `NavProbe`, and
what the lab exports is a row the engine loads and stands in the world.

## 1. Overview

Open it: `cd web && npm run dev`, then **http://localhost:3141/lab.html** (any harness port works: it is the same Vite
server as the game). `npm run build` builds it as a second page.

| Part | Where | What it does |
|---|---|---|
| The page | `web/lab.html`, `src/lab/lab.css` | warm-umber drafting table: kinds and footprint on the left, the plan in the middle, the 3D building and the proof on the right |
| The wiring | `src/lab/lab.js` | footprint -> `floorplan()` -> an authored row -> `Ring.geo()` + the floors above -> plan, 3D, proof. Undo/redo, pins, export, "Place in the game" |
| The plan | `src/lab/plan2d.js` | one floor in ink on paper over the 1 m nav grid: typed rooms with sizes, walls, doorways and door swings, windows, furniture as the ring placed it, stairs (UP/DN with landings), the proof's findings in red; hit-testing |
| The 3D | `src/lab/view3d.js` | the building as the game builds it, in the game's materials (`world/surfaces.js` walls and roofs), one InstancedMesh per material; roof on, or a dollhouse cut 1.5 m above the floor being edited |
| The edits | `src/lab/edit.js` | pure functions on a row: move a wall (a partition, or an outside wall: the footprint), move/add/remove a doorway, split a room, carve a hall, take a wall out, retype a room, move/turn/re-place stairs |
| The loader | `src/world/authored.js` | the row format; quarter turns and whole-metre moves; storeys and stairs (`placeFlight`, `addStorey`); the floors above as geometry; the reachability proof (`prove`); standing a row in the ring (`placeAuthored`, `addAuthored`, `removeAuthored`) |
| The hooks | `src/world/ring.js` | `geo()`: a lot with `authored` takes its plan, doors and heights from the row (and two hooks: stairs and shell before the furniture, the roof lifted after); `makeBlock()`: authored rows placed after the generator lays the lots; `furnish()`: a building's `g.clear` zones (stair landings) kept clear |
| The rows | `src/data/authored.js` | `AUTHORED` (stood in the ring; empty: the ring is exactly the generator's) and `LAB_SAMPLES` (fixtures the selftest uses) |
| The command | `author` (`src/agent/api.js`) | stands a row live (`row=` JSON or `sample=`, at `x= z=` or `lot=`), returns where, its rooms and the proof; `remove=`, `list=true` |
| Big plans | `src/data/floorplans.js` BIG BUILDINGS block, `src/data/ring.js` BIG BUILDINGS block | office floor, school wing, motel, warehouse with mezzanine, hospital ward: room rows, plan rows, kind rows, two furniture rows |

## 2. Player fantasy

For Robert and whoever builds the world: pick "Office floor", see a real 32 x 14 m office floor laid out by the same
code the city uses, its corridor and offices labelled in metres, its furniture placed and proved, its 3D shell in the
city's stucco and patchwork roofs. Drag the corridor wall a metre, carve a hall through the open office, add a storey and
watch the stairs find a wall by the storeys rules. Every edit is checked the instant it lands, by the rule the game's
walkers use; a sealed room goes red before it ever ships. Export, paste, and it stands in Phoenix.

For the player: hand-made places among the generated ones - the school with its classrooms off the long hall, the
two-storey offices, the warehouse with stairs up to its mezzanine - that read as real buildings from the top-down camera
and that you can always walk into and through.

## 3. Detailed rules

**Generate.** A kind (every key with both a `PLANS` and a `KINDS` row shows - the other agent's clinic, cantina or
boarding house appear by themselves once their rows land), a width and depth (6-60 m), a front (N/E/S/W), a zone (its
palette and loot), units (for duplexes, malls and motels) and a seed. `floorplan()` lays the plan exactly as it does for
a ring lot. `rowFromPlan()` turns it into an authored row: the plan's rooms and partitions, a front door per unit at the
plan's spot, a back door where the kind's `back` odds say (the plan's best spot), the street storey's height rolled from
the kind's `h`. A plan row with `up` (the depot's) also gets its mezzanine and a flight. Reroll = a new seed. Pin = keep
the row (and the recipe) in this browser (localStorage, 24 at most).

**The row** (v1, `world/authored.js` header): the footprint (wall centre lines) in its own frame, `front`, `h` (the
street storey's height: floor 1 stands on it), `top` (the wall top: the roof), `seed`, `units`, `walkway`, and `floors[]`
each with `y`, `deck` (null: the whole floor; a rect: a mezzanine), `rooms[]` (type and inner faces), `walls[]` (partitions:
centre line, span, doorway gaps) and, on floor 0, `doors[]` (side, position along it, width, front|bay|back). `flights[]`
are the runs (landings not included), each with `from` (its floor), `axis` and `dir` (the way up).

**Edit** (Select is the default tool):
- **Drag a wall.** A partition moves on its own floor; the rooms on both sides follow (each keeps 1.2 m), so do the walls
  that end on it, and their doorways stay inside them. An outside wall moves the footprint on every floor (6-60 m).
  Snapped to 5 cm.
- **Drag a doorway** (a gap or an outside door) along its wall: it lands on a nav cell centre (whole metres + 0.5, the
  rule the generator's doors keep), clear of the wall's ends by the jamb.
- **Door tool:** click a wall to add a doorway (inside 1.8 m; outside a back door 1.8 m, or a front door 2.4 m on the
  front side); click a doorway to take it out. The last front door stays.
- **Wall tool:** click in a room to split it across its long side (Shift: the other way), a doorway in the new wall.
- **Hall tool:** press in a room and drag along where the hall runs (or click: along the room's long side). The strip is
  1.3 m (`hall`), 1.8 m (`corr18`) or 2.4 m (`corr24`) wide, centred on a nav cell centre, a doorway from each side room.
  A side too thin to be a room (under 1.2 m) goes into the hall.
- **Retype a room** (click it, "Change type..."): any ROOMS row, grouped Home / Shop & diner / Big buildings. Its floor,
  furniture, loot and minimum size follow.
- **Delete** takes out the selected doorway, or the selected partition when it sits between exactly two rooms of the same
  span (they become one).
- **Stairs:** "+ Storey" adds a floor on top, a copy of the floor below (rooms and doorways) or one open room; a flight is
  placed by `placeFlight()`. When the copied walls leave the stairs nowhere to land, the new floor is one open room (a
  toast says so). Drag a flight to move it (0.25 m steps); the inspector turns it round or re-places it by the rules.
  "Remove top" takes the top floor and its flight off.
- Undo/redo (Ctrl+Z, Ctrl+Shift+Z), keys V W D H, R reroll, [ ] floor, Del, Esc.

**Validate** after every edit (`prove()`), shown live: the plan's red hatch on a room nothing reaches, red cells for floor
sealed off, a cross on a doorway not clear on both sides, a ring on a bed with no floor beside it, and in 3D a red volume
over each unreachable room; the panel's verdict, six checks, the problem list (click: go to its floor) and a per-floor
table. Floor 0 is flooded from its outside doors; each floor above from the heads of the flights whose feet were reached
below. A floor nothing reaches is one problem, not one per room.

**Storeys** (the rules of `data/storeys.js`, as `world/storeys.js` keeps them on the island): every flight has the one
pitch (3.2 : 4.4, 36 degrees) and is 1.4 m wide (`FLIGHT.w`) with a 1.4 m landing beyond each end (`FLIGHT.landing`);
floor 1 stands on the street storey's walls (`h`), each floor above 3.2 m (`STOREY.up`) higher. A flight goes along a wall
of a room on its floor: its foot's landing in that room, its head's landing in a room of the floor above and on its deck,
clear of every doorway's clearance and every partition on both floors, with a person's width to pass beside it, and only
where the nav rule itself (a NavProbe flood of both floors with the run in place) still reaches every room and the foot,
and from the head every room above. Upstairs, a flight's hole is cut out of the deck (and out of the floor finish) and
railed on three sides; a mezzanine's open edges are railed, open where a flight's head lands.

**Export** (a modal): the row as JSON (one room/wall/door per line), the same pasted into `data/authored.js` with a
`site`, the recipe (kind/size/seed: regenerates the plan, not the edits), and **Place in the game**, which sends the row
to the running game over the agent bridge (the `author` command) and reports the proof and a teleport point.

**The loader** (`placeAuthored`, called from `Ring.makeBlock` when there are authored rows):
- `site: { lot: 'R<k>.<j>.<n>' }` replaces that lot's building: the row is turned to face the lot's street and centred
  on the old building; it must fit the lot (0.5 m inside it) or it is left out with a reason in `ring.authoredErrors`.
- `site: { x, z, front? }` stands it with its footprint centred there (rounded to whole metres), turned to `front` (its
  own by default). It must lie 1 m inside the block's lot area (inside its streets and walks). The block's lots whose
  ground or building it covers (its footprint plus a 3 m yard) are cleared; it becomes lot `R<k>.<j>.<50+i>`.
- The lot takes the row's kind, footprint, seed and front, `hh = null` (nobody lives there), `ruined = false`.
- In the game, `geo()` builds the **street storey** on its own path: walls with the row's doorways and a window per room's
  stretch of outside wall, the floor finishes, furniture by room proved on the probe, containers (ids from their position,
  loot by room), beds, collision and nav, the roof that hides when you walk in. On top of that, from the row: each flight
  up from floor 0 is a solid run with its steps drawn (its foot's landing kept clear of furniture), the outside walls rise
  to the wall top with a window every 4 m on each floor's band, the roof sits on the wall top, and a motel's covered
  walkway (slab, canopy, posts) runs along its front.
- `addAuthored()` (the `author` command) adds a row live, drops that block's cache and the ownership and quarter caches,
  and the chunks round the block are laid out again; `removeAuthored()` gives the block back to the generator.

**Big plans** (data, `PLANS`): `offices` (offices-4x2 / 6x2 / 8x2: a 1.8 m corridor along the building, offices off both
sides, a lobby with the front door, a break room, restrooms, an open office that takes the spare metres), `school`
(wing-4 / 6 / 8: an entrance hall across the front, a 2.4 m hall running back, classrooms 6.8-9.6 m with rows of desks,
an art room and a library at the far end), `motel` (one unit per room: a 3.4-4.4 m room with a double bed, its bath
behind; units = width / 4.2 m; a covered walkway along the front), `depot` (a warehouse: the shop floor with a roll-up
bay, offices, restroom and stock rooms along the back, a mezzanine over them at 3.4 m in a 6-7.2 m shed), `hospital`
(ward-6 / 8: reception across the front, a 2.4 m corridor, two-bed wards 3.8-6 m, a nurses' station, a treatment room,
day rooms at the far end).

## 4. Formulas

- Nav cell centre: `cell(v) = floor(v) + 0.5`. Doorways and outside doors are placed on it; a hall's centre line too.
- Placement: `k = (SIDES.indexOf(site.front) - SIDES.indexOf(row.front)) mod 4` quarter turns clockwise, `(x, z) -> (-z, x)`
  each; a door on N/S keeps its position, on E/W negates it; a flight on x keeps `dir`, on z negates it. Then
  `t = round(site - turned centre)` (whole metres), so every cell centre stays a cell centre.
- Floor heights: `y0 = 0`, `y1 = h`, `yk = h + (k - 1) * 3.2`. Wall top: `top = max(h, shed, y_last + 3.2)` (a depot's
  `shed` is its rolled wall height, its mezzanine at `KINDS.depot.mezz = 3.4`).
- A flight: `rise = y(from + 1) - y(from)`, `run = rise / (3.2 / 4.4)` (4.84 m for a 3.52 m storey); it needs
  `run + 1.4` m along a wall in one room (plus 1.4 m more above it when the floor above has the same walls), and the room
  `>= 1.4 + 1.9` m across.
- Standable landing (the nav rule): a cell centre more than 0.46 m from the room's walls and from the run, inside the
  landing.
- The probe: 1 m cells on whole metres; a box grown by 0.45 m blocks a cell whose centre is in it; 8 neighbours, no
  corner cutting; a window of the footprint plus 2 m (64 x 64 cells: footprints up to 60 m).
- Steps drawn: `n = max(4, round(rise / 0.18))` boxes, each from its floor to `(i + 1) * rise / n`.
- Edits: rooms keep 1.2 m; walls snap to 0.05 m, flights to 0.25 m; hall widths 1.3 / 1.8 / 2.4 m.

## 5. Edge cases

- **Nothing fits**: `floorplan()` falls back to one open room (the plan reads `open`); the lab shows it, the proof passes.
- **A plan with too much room**: every big row has a room with no `max` (open office, library, art room, day room) so the
  spare metres go there rather than into a 20 m lobby.
- **Stairs that will not fit** (most houses: a 4.4-4.8 m run plus a 1.4 m landing in one room, clear of the living room's
  doorways; every motel room): "+ Storey" says why and adds nothing. Make room - drag a partition, carve a 2.4 m hall - and
  try again, or place the flight by hand and let the proof judge it.
- **A flight dragged somewhere bad** (into a corridor, across a doorway's approach): the proof shows the sealed rooms, the
  unreachable foot, the floors above cut off.
- **Lots**: a row too big for its lot, or a site outside the ring's city or past its block's streets, is left out
  (`author list=true` shows why); the generator's building stays.
- **People**: the loader clears a block's lots without asking who lived there. The selftest picks a block nobody lives in;
  place rows where no household is (`residents x= z=`), or the household record points at a lot that is gone.
- **Saves**: authored rows are data, not save state. A row added live with `author` is gone on reload; rows in
  `AUTHORED` are always there. Containers keep position-based ids, so what you took from one is kept like any ring box.
- **Footprints over 60 m** are refused (the probe's window).
- **The island** never takes authored rows (its golden hash): they stand in the ring only.

## 6. Dependencies

- `world/floorplan.js` (`floorplan()`, `NavProbe`, `planRng`; unchanged), `data/floorplans.js` (`ROOMS`, `PLANS`,
  `PLAN_RULES`), `data/ring.js` (`RING`, `KINDS`, `ZONES`, `FURNITURE`), `data/storeys.js` (`STOREY`, `FLIGHT`, `RAIL`,
  `WINDOWS`; read, not changed), `world/ring.js` (`Ring.geo`, `furnish`, `placeOne`, `makeBlock`), `world/surfaces.js`
  and `world/textures.js` (the lab's materials and sand), three.js + OrbitControls.
- The game: `world/chunkgen.js` lays an authored lot out like any other (no change), the streamer re-lays the chunks
  (`evict`), `agent/api.js` (`author`, the selftest check).
- Not touched: `world/city.js`, `world/storeys.js`, `systems/interiors.js`, `systems/inventory.js`, `systems/dogs.js`.

## 7. Tuning knobs

- Room rows (BIG BUILDINGS in `data/floorplans.js`): `min`, `max`, `fix` (corridor widths 1.8 / 2.4), `grow`, `via`,
  `back`, `floor`, `loot`, `furniture`.
- Plan rows: which rooms, in what tree, at what weight; `up` for floors a generated plan comes with.
- Kind rows (BIG BUILDINGS in `data/ring.js`): footprint ranges, `h`, `back` odds, `bay`, `label`, `loot`; `mezz` (a
  depot's mezzanine height), `unitW` (a motel room's width), `walkway` (its covered walk's depth).
- Furniture rows: `deskrows` (a classroom's 4 x 3 desks and chairs, walked between), `dbed` (a double wherever it stands).
- Stairs: `FLIGHT.pitch`, `FLIGHT.w`, `FLIGHT.landing`, `STOREY.up`, `RAIL`, `WINDOWS` in `data/storeys.js` (shared
  with the island's storeys: change them there and both follow).
- The lab: edit minimum 1.2 m and snaps (`src/lab/edit.js`), the 1.9 m pass-beside allowance and the ROOM_PREF order
  stairs try rooms in (`world/authored.js`).

## 8. Acceptance criteria (as measured 2026-10-23)

- [x] A page served by Vite (`/lab.html`) on the real generators: `floorplan()`, `Ring.geo()`, `furnish()`, `NavProbe`.
- [x] Footprint: kind (12, the ring's 7 and 5 big ones), width, depth, front, units, zone, seed; the plan in 2D with room
  types and sizes in metres. 300 generated plans (12 kinds x 25 seeds): 300 pass the proof; build + proof 3 ms on average,
  27 ms at most.
- [x] 3D as the game builds it: walls with doorways and windows, furniture by room, roof on or a cutaway, the game's
  wall and roof surfaces; reroll; pin.
- [x] Edits: drag a partition (and an outside wall), move a doorway, add/remove one, retype a room, split a room, carve a
  hallway, add/remove a storey with its staircase, move/turn/re-place stairs; each proved live; problems in red.
- [x] Export: a v1 row; the loader stands it at a world position or on a lot (`data/authored.js`, `author`).
- [x] The ring unchanged with no authored rows: a hash of every ring building's geometry (walls, boxes, floor, roof,
  props, decor, containers, beds, doors, rooms, canopy, trees, plan, partitions; 2,476 buildings, 15,160 rooms) is
  `4044705943` before and after.
- [x] Big plans: offices, school, motel, depot (mezzanine), hospital, at real sizes.
- [x] `selftest`: the new check ("building lab: ...") - `LAB_SAMPLES.office2`, a two-storey office floor edited by hand,
  stood at a world position in a ring block: no other lot left under it, walked into on `moveTo` from its street, every
  street-floor room reached by A* from the street, its stairs' run solid, the proof passing on both floors, and removed
  the block is the generator's again (same lot ids). Full battery green twice on fresh pages.
- [x] Screenshots (`docs/renders/web/building-lab/`): `lab-house.jpg`, `office-floor-corridor.jpg`,
  `two-storey-stairs.jpg`, `validation-unreachable-room.jpg`; also `warehouse-mezzanine.jpg`, `school-wing.jpg`,
  `hospital-ward.jpg`, `motel.jpg`. Each is a URL state: `lab.html?kind=house&seed=1717`,
  `?kind=offices&seed=4242&roof=0`, `?kind=offices&seed=131&storey=copy&floor=1&roof=0`,
  `?kind=house&seed=1717&demo=seal&roof=0`, `?kind=depot&seed=262&floor=1&roof=0`, `?kind=school&seed=3333&roof=0`,
  `?kind=hospital&seed=44444&roof=0`, `?kind=motel&seed=222&roof=0`.
- [x] `node tools/ip-lint.mjs`: 0 deny.

## 9. Open

- **Upstairs in the ring is not walkable yet.** The game builds an authored building's street storey; its floors above are
  in the row (and in the lab, and proved), the shell rises to them and the stairs' run is there, but the ring has no
  storeys system (`world/storeys.js` is the island's). The run is solid until it does. Next: let `storeys.js` take ring
  buildings (a deck per floor from the row, the flight as its slope) - its owner's lane.
- **Stairs in houses** rarely fit straight with both landings; a quarter-turn flight (a landing at the turn) would. Not in
  the storeys rules today.
- **Door leaves, locks and glass** are still island-only (`systems/interiors.js`); authored buildings have gaps like every
  ring building.
- The lab's own placement of a household (`residents`) in an authored building: none - `hh` is null.
