# The furnishing pass: a building reads as what it is (web engine)

**Status:** built 2026-11-13 on `feat/web-zed-furnish` (on top of `feat/web-zed-lamps`).
**Asked by:** the coordinator for Robert, 11-12: "a furnishing pass so a gas station reads as one at a glance (pumps
and sign outside, counter with register, shelves with goods, a cooler) and likewise for the most common 8 building
kinds."
**Files:** rows `web/src/data/cgrooms.js` (`PIECES[*].parts`, new pieces `cooler`, `tyres`, `drum`, `pallet`, `DECOR`,
`FRONTS`, `ROOM_TYPES`), `web/src/data/citygen.js` (`KINDS.gas_station`); the rules `web/src/systems/decor.js` (the
detail near you), `web/src/world/citygen/build.js` (canopy, pumps, price sign, sign boards, awnings),
`web/src/world/citygen/rooms.js` (pieces know what they are; rows of shelving); command and checks
`web/src/agent/furnish-api.js`.

## 1. Overview

Every piece of furniture in a generated town was one plain box, so a counter, a shelf and a fridge were three boxes of
three browns. And the generated gas station was a two-bay garage with its only door at the back: one pump under a
canopy, if the street had room for the canopy at all (about one in five did).

This pass does three things.

1. **Detail on the furniture.** Each piece has up to six small parts: a register and a tray of goods on a counter,
   three bands of goods and a row of boxes on a shelf, glass, bottles and a red header on a drinks cooler, a pillow and
   a blanket on a bed, burners on a stove, a sink in a kitchen cupboard, a toolbox and a vice on a workbench. They are
   drawn only for the buildings within 45 m of you, from one small pool, in one draw call.
2. **The gas station is a shop.** It has a front door on the street, a shop floor with a counter by the door, a
   cooler, shelves and (where there is room) rows of shelving, a stock room and a restroom. Outside it has a canopy
   with a red band, two pumps on an island and a price sign on a mast. On a street too tight for a forecourt it gets a
   lean-to canopy against its front wall instead, with a pump each side of the door.
3. **Street faces.** Shops, diners, saloons, auto shops, warehouses, motels, hotels, truck stops and gas stations
   wear a sign board over the front door; shops, diners, saloons and hotels an awning as well.

The eight most common kinds in the towns (counted over 312 built towns) are house, shop, garage, rowhouse, auto shop,
saloon, trailer and warehouse; the gas station is fifteenth. What each now shows:

| Kind (share of buildings) | Inside | Outside |
|---|---|---|
| house, rowhouse, trailer, bungalow, cabin (about 40%) | made beds, a sofa with a back and arms, a stove with burners, a sink, a fridge with a handle, a cistern, a mirror | unchanged |
| shop (14%) | counter with a register, cooler, shelves and rows of shelving with goods | sign board and awning |
| garage, auto shop (12%) | workbench with a toolbox and a vice under a pegboard, racks with boxes, a tyre stack, an oil drum | auto shop: sign board |
| saloon (4%) | the bar with bottles, booth benches | sign board and awning |
| warehouse (4%) | racks with crates, pallets of crates in the middle | sign board |
| gas station (3%) | as a shop | canopy, two pumps, price sign, sign board |
| diner (3%) | counter with a register, booths, tables with plates | sign board and awning |

## 2. Player fantasy

You come down a road you have never driven and know the gas station from four hundred metres by its sign. Inside, the
cooler is where a cooler is and the till is by the door, so you go straight to them.

## 3. Detailed rules

1. **Parts are rows.** `PIECES[piece].parts` is a list of `[u, v, y, su, sv, sy, colour]`: where the part sits along
   the wall (`u`) and out from it (`v`), each from -0.5 to 0.5 of the piece; its underside in metres above the floor;
   its size as a share of the piece (`su`, `sv`) and its height in metres; and a colour or a palette name.
2. **Palettes** (`DECOR.palettes`: `goods`, `bottles`, `cloth`): a part with a palette name takes one of the palette's
   colours, chosen by where the piece stands. The same shelf always has the same goods. No palette holds a purple.
3. **Drawn near you.** Every 0.4 s the buildings of the live towns within 45 m of you (`near`, measured to the
   footprint) are dressed, the nearest first: all the parts of all their pieces, every floor. Past 65 m (`far`) they
   are given back. The pool holds 6,000 parts (`max`); a building that does not fit goes without until others are
   given back.
4. **The cutaway.** When a building is cut away to the floor you stand on, the parts of the floors above are not drawn,
   exactly as its furniture is not.
5. **Looks only.** A part has no collider, holds nothing, stops no round and is not saved. What you can loot is what
   you could loot before: the piece's own container.
6. **Pieces know what they are.** Each furniture box carries its piece name and the wall it backs onto (the builder's
   own data, used by the detail and by the `decor` command).
7. **Rows in the middle of a room** (shop shelving, classroom desks, tables, pews, pallets) now stand `aisle` (1.3 m)
   from each other and the walkway (1.4 m) from anything on a wall. Before, each row had to be the walkway from the
   next, so a second row almost never fitted.
8. **A shop floor that cannot fit its counter** on any wall (all windows and doorways) still gets the rest of its
   list. Only shop floors do this (`retry`): in a room with drive bays the small pieces that would then fit pinch the
   lane a car needs.
9. **The gas station** (`KINDS.gas_station`): no drive bays. Its canopy has two forms, the first that fits:
   - **forecourt:** 15 x 9 m, 11 m out in front, four posts, the pumps on one island in the middle, the price sign on a
     mast over the street side;
   - **lean-to:** 10 x 5 m against the front wall, centred on the front door, two posts, one pump each side of the
     door, the price sign at one end. It must clear every other building and the strip in front of every neighbour's
     door (5 m) and bay (13 m).
   A station with room for neither has no pumps; it still has the shop, the sign board and the shop floor.
10. **Sign boards and awnings** (`FRONTS`): a board 0.7 m tall over the front door at about 3.2 m, a pale stripe
    across it, and for some kinds a 1.2 m awning at 2.8 m. On a building with drive bays in its front (auto shop,
    warehouse, truck stop) the board goes on the middle of the face above the tallest bay; if there is no room there
    under the roof it has no board. No lettering. No collider: all of it is over head height.
11. The `decor` command says how many buildings are dressed and how many parts are drawn and free, and for the
    building you stand in its kind, its pieces by name and what it wears outside.

## 4. Formulas

- A part's place, for a piece of width `W` along its wall and depth `D`, centre `(cx, cz)`, floor `y0`:
  along the wall `u × W`, out from it `v × D` (toward the room), so on a north wall it is at
  `(cx + u W, y0 + y + sy / 2, cz + v D)` with size `(su W, sy, sv D)`.
- Parts drawn for a building: the sum over its pieces of the piece's part count. A gas station's street floor
  (counter 3, cooler 5, two shelves 8, an aisle 5, two basins 2, three toilets 3) is 26 or 27.
- Counted over 312 built towns (26 town types, 12 seeds each): 556 whole gas stations: 216 with a forecourt canopy,
  219 with a lean-to, 121 with no pumps (78% have pumps); 3,101 whole shops: 2,918 with a counter (94%), none bare;
  1,689 buildings with drive bays in their front that have a sign-board row: 766 have room for the board over the
  bays, and none has a board across a bay.
- The towns' own box count did not grow from the parts (they are not in the town mesh). It grew a little from rows of
  shelving and the outside dressing: the largest town went from 46,067 to 46,519 boxes (ceiling 48,000).

## 5. Edge cases

- **The pool is full** (a dense block of tall buildings): each scan dresses the nearest undressed buildings first; one
  that does not fit stays plain and is tried again each scan. It is counted (`counts.short`). A building dressed
  earlier is not stripped to make room for a nearer one: it keeps its parts until you are 65 m from it. The most
  measured within 45 m of one spot in the test towns was 4,809 parts.
- **A building you are in the middle of leaving** keeps its detail to 65 m, so walking round a block does not make it
  flicker.
- **A town taken down or rebuilt** gives all its detail back at once.
- **A ruin** keeps its furniture and so its detail; it wears no sign board or awning.
- **The roof is on** (you are outside, looking down): the detail is drawn under it and not seen, as the furniture is.
- **An awning in the top-down view** covers the doorstep under it. The door is still where it was.
- **Town layouts moved.** A gas station without bays has no drive lane, so in a town with one the dead cars and some
  lots fall differently than before for the same seed. Every one of the 312 test towns still passes the town audit.
- **Save games:** nothing new is saved. A town is rebuilt from its seed, so a save made before this pass loads into
  the new layout of any town that has a gas station (the same thing any change to the town rows does).
- **Not covered yet:**
  - the hand-built places (the first island, the Phoenix ring's own lots and risers) have their own furniture and are
    not dressed by this;
  - sign boards carry no words or symbols; a shop and a diner differ by colour and awning only;
  - pumps are scenery: you cannot draw fuel from one;
  - a station on a lot under 10 m wide, or boxed in on every side, has no pumps (one in five);
  - the cooler is not cold and holds what any container of that building holds;
  - houses got no outside dressing (no porch, mailbox or fence here: the back lots pass owns yards);
  - people the game runs do not stand behind counters because of this pass;
  - classrooms, wards, offices and churches got their parts (monitors, pillows, pew backs) but no outside dressing
    beyond what they had (the steeple).

## 6. Dependencies

- `world/citygen/rooms.js` and `data/cgrooms.js` (`WEB_CG_ROOMS.md`: the rooms and pieces this dresses; that doc now
  points here for parts, rows of shelving and the retry rule).
- `systems/citygen.js`: `hideAbove` records each building's cut (`R.cut`); `release` and `releaseRing` call
  `decor.forget`; `liftBuilt`'s raise (`built.y0`) is added to every part.
- `world/citygen/build.js` (`doorXZ`, the canopy), `world/citygen/layout.js` (a kind without `bays` gets a front door).
- `WEB_CITYGEN.md` (the town audit: lanes, bays, front steps) is what the outside dressing must not break.
- A pump's cover point is where it always was (a metre south of the pump).
- Checks that read a town's layout: `citygen: a shot out of a floor-4 window` now picks the first window whose line to
  the street is clear at ground level (the layout moved a dead car onto the old line).
- Draw calls: +1 (the detail). Lights: none.

## 7. Tuning knobs

| Knob | Value | Safe range | What it changes |
|---|---|---|---|
| `DECOR.near` / `far` | 45 / 65 m | 25–80, far > near | How far off a building's detail appears and goes |
| `DECOR.max` | 6,000 | 1,000–20,000 | Parts drawn at once (memory and one draw call's size) |
| `DECOR.every` | 0.4 s | 0.1–1 | How often the buildings round you are looked at |
| `DECOR.palettes.*` | 5–8 colours each | never purple | The goods, bottles and cloth colours |
| `PIECES[*].parts` | up to 6 a piece | – | What each piece shows |
| `CG_ROOMS.aisle` | 1.3 m | 1.0–1.6 | The gap between rows in the middle of a room |
| `CG_ROOMS.centreEdge` / `centreMin` | 2.1 / 4.8 m | – | How far rows keep from the walls; the smallest room that gets rows |
| `FRONTS[kind]` | board, awning, price, pumps | never purple | What a kind wears on its street face |

## 8. Acceptance criteria (selftest, `only="furnish:"`)

1. **Rows:** every part validates; a purple part, an unknown palette, a malformed part and a part that tops out
   through the ceiling are each caught; a shop
   floor lists a counter and a cooler, a workshop tyres and a drum, a warehouse pallets; the gas station row has no
   bays, a canopy, two pumps, a board and a price sign; at least 24 pieces have parts.
2. **Eight towns built headless:** every town passes the town audit; no sign board hangs across an open drive bay; every furniture box has a piece name and a wall;
   the number of pump colliders equals the pumps the buildings say they have; every whole gas station has a front door
   on its street side, a counter, and a cooler or shelves; at least half have pumps and every one with pumps has two;
   no shop is bare and nine in ten have a counter; every town with a shop has one with two or more rows of shelving.
3. **In a live town:** standing in a gas station, the parts drawn for it equal the parts its pieces name (8 or more),
   every one is inside the footprint between the floor and the roof (the town's raised ground counted), and the detail
   is one mesh in the scene; standing on the street floor of a building with furnished floors above, the game's own cutaway
   hides every upstairs part and keeps the street floor's; 90 m away the building's parts are back in the pool; back inside it is dressed again; with
   the town removed nothing of it is left dressed.

Pictures: `docs/renders/web/furnish/` (a gas station before and after inside; from the street with its forecourt; a
lean-to on a tight street; a shop, a house, an auto shop, a diner and a trailer after).
