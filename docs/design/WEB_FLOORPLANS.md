# Floor plans for the Phoenix ring (built 2026-10-23)

Robert, 2026-10-23: "the layouts of the houses need to be better... then we'll also know the rooms... going inside the
houses will be a little bit better... but of course we got to size it to make it make sense."

Before this, a ring house was two rooms (a front room and a back room split by one wall) and a duplex two of those. Beds
went "in the back room", couches "in the front room", and nothing knew what a kitchen or a bathroom was. Now every house,
bungalow, duplex, workshop, diner, fuel stop and strip-mall unit in the ring (2,377 of its 2,476 buildings; the 99
warehouses keep the old shell) has a real floor plan: typed rooms at real sizes, a doorway between rooms that belong
together, and furniture that says what each room is from above.

## How it works

| Part | Where | What it does |
|---|---|---|
| Room types | `web/src/data/floorplans.js` `ROOMS` | per type: minimum size, how far it grows, which rooms its doorway may open onto (`via`), whether a back door may go in its outside wall, a floor finish, its loot table, its furniture list |
| Layouts | `web/src/data/floorplans.js` `PLANS` | per kind, slicing trees in the building's own frame (`u` along the front wall, `v` from the front to the back) with weights |
| The solver | `web/src/world/floorplan.js` `floorplan()` | pure, seeded, no three.js. It fits a tree to the footprint (minimums first, the spare metres shared by `grow`, jittered by the seed), nudges a hall so a 1 m nav cell's centre runs down it, joins the rooms with doorways as a spanning tree from the entry room (a room joins the neighbour its `via` row ranks best: a bedroom off the hall, else the living room, never off the kitchen), puts the front door in the entry room's front wall and lists where a back door may go. A tree that doesn't fit or can't be joined is skipped; plans are tried in weighted random order and the first that fits wins. Returns rooms and partitions in the `inner` format `geo()` already used |
| The shell | `web/src/world/ring.js` `geo()` | builds the walls, doorways, windows (one per room's stretch of outside wall, so no partition ends at a window), floor finishes, furniture, containers and beds on the existing path (collision, nav, roof, streaming) |
| Furniture | `ring.js` `furnish()` / `placeOne()` | each room's list against its walls (a rug or a dining table in the middle), clear of every doorway (1.3 m inside an outside door, 1 m each side of an inside one), kitchen units running on from each other, a bed's head to the wall away from the door, nightstands by the bed, the TV facing the couch |
| The proof | `floorplan.js` `NavProbe` | rasterises the building exactly as the foot nav grid does (1 m cells, boxes grown by 0.45 m, 8 neighbours, no corner cutting) and floods from the doors. A furnished building is kept only if every open cell inside is reached, every room has one, and every bed has a reached cell within 1.05 m (the resident's last step to a bed is a straight line). The whole building is proved once; if that fails, a room at a time; if a room fails, a piece at a time |

Furniture is new rows in `FURNITURE` (`web/src/data/ring.js`): double and single beds (frame, headboard, sheet, pillows,
a blanket in one of six colours), nightstand, dresser, couch, armchair, TV, rug, kitchen cupboard, stove (dark cooktop and
burners), fridge, sink, dining table with chairs, tub, toilet, medicine cabinet, diner booth, desk, filing cabinet. Each
row has `parts`: the boxes it is drawn with, in its own frame, so it reads from above. A double bed is two sleeping spots.
Containers roll their room's table: a fridge or cupboard `kitchen`, a dresser or nightstand `bedroom`, a medicine
cabinet `bathroom`, a desk or filing cabinet `office`, a mall unit's shelves what that unit sold.

## Sizes, and why

A small American ranch house (the 1950s-70s stock of a Phoenix suburb) is about 90-130 m2: the front door opens into the
living room, the kitchen is beside it (and has the back door), two or three bedrooms and a bathroom are down a short hall.
Room minimums (interior, both ways): living room 4.0 m, kitchen 3.0, dining room 3.4, bedroom 3.0 (a double bed with
its head to the wall and a walk round it), bathroom 2.4 by at least 3.0 (a 1.6 m tub across one end leaves a nav cell
free; it never grows past 2.9 across), hall exactly 1.3 m clear (the walker's 0.45 m radius on a 1 m grid needs the
hall's centre within 0.16 m of a cell centre, so the solver moves the hall to make it so).

To fit that, the footprints changed (`KINDS`): a house is now 11.8-12.9 x 8.8-10.5 m (104-135 m2; it was 9-12.5 x
8-10.5), a bungalow 13-15.5 x 9.6-12, a duplex 16.5-19.5 x 9.6-11. Workshops, diners and fuel stops kept their sizes.

The layouts (`PLANS`):
- **side hall** (the common shallow ranch): the day rooms on one side (living room in front, kitchen behind it beside
  the bath or a third bedroom), a hall running front to back, the bedrooms (and bath) on the other side.
- **across hall** (deep lots): living room and kitchen across the front, a hall along the house, bedrooms and bath across
  the back; the bungalow version adds a dining room between living room and kitchen.
- **compact** (the fallback when nothing else fits): living room and kitchen in front, one bedroom and the bath behind.
- **duplex units**: each a one-bedroom flat (two-bedroom plans exist, but a duplex lot is 20 m wide, so a duplex is at
  most 17.5 m and a unit 8.75: room for one bedroom at real sizes).
- **workshop**: the shop floor (roll-up bay) in front; office, restroom and stock room along the back.
- **diner**: the dining room (booths, counter) in front; kitchen (with the back door), restroom and a stock room or office
  behind. **fuel stop**: the sales floor in front; stock room (and sometimes an office) and restroom behind. **strip mall
  unit**: sales floor, stock room and restroom.

What the ring has now (all of it, `selftest` and `ring` read the same): 1,092 houses - 893 with two bedrooms, 168 with
three, 31 compact one-bedrooms; 541 bungalows - 391 with three bedrooms, 147 with two (most with a dining room), 3
compact; 243 duplexes = 486 one-bedroom flats; 153 workshops, 151 diners, 117 fuel stops, 80 strip malls. Room sizes
seen (interior, short x long): house living room 4.2-6.2 x 5.9-7.7, kitchen 3.0-4.6 x 3.2-5.7, bedroom 3.0-3.8 x 3.0-5,
bath 2.4-2.9 x 3.0-3.8; bungalow dining room 3.5-4.4 x 3.8-5.5. Per building on average: house 6.1 rooms, 2.7 beds, 11
containers; bungalow 7.2 rooms.

Things fixed on the way:
- **Lots**: a building was placed with its left edge where its centre should be (`layLots`: `uc = u0 + off`), so it sat
  half a width into the next lot, and that lot's yard fence ran through it (it sealed a bedroom). Now it is centred.
- **Residents** (`systems/residents.js walk`): a resident moved on to the next waypoint as soon as it was within 1.1 m of
  the current one, which cut a doorway's corner into its jamb and wedged them short of their bed (the lead's 3-of-4
  asleep failure, house R-1.7.1). Now they skip ahead only when three rays a shoulder's width apart are clear, and walk
  right up to the point otherwise. They spend the day in their living room, kitchen and bedrooms (`home.stay`), not in
  the hall or the bathroom.
- **Pools**: a dense ring chunk now holds up to 3,639 props and 1,716 walls (it was 610 and 866): `POOLS.props`
  24,000 -> 40,000, `walls` 12,000 -> 20,000. A pool draws only to its high-water mark; over the densest chunk at the
  widest zoom it holds about 10,500 props and 5,400 walls.
- **Streaming**: the ring stage of a chunk layout yields after every building (it was every three).

## Proof

- `selftest` **135/135 twice on fresh pages** (131 + 4 new: `only="floor plans"`): every room of every planned building
  in the densest, the strip's and the yards' ring chunks reached by A* from the street through its doorways, and every
  bed there with an open cell beside it; every house, bungalow and duplex unit in the whole ring with a living room that
  holds its front door, a kitchen, a bathroom and a bedroom with a bed, every shop and diner unit a restroom and a back
  room, every room at least its row's size; no furniture in any doorway's clearance (41,842 solid pieces, 12,138 inside doorways and 4,400 outside doors);
  the same plan (rooms, walls, doors, furniture, beds, containers) from the same lot on a fresh ring, twice.
- `selftest only="scavenger family"` (the lead's flake): 5 of 5 on fresh pages after the waypoint fix.
- `scenario name=stress`, ABBA with a fresh Chrome per leg, 16 legs against 97995d9b: **4.63 against 4.86 ms per frame
  (mean), medians 4.58 against 4.52**, 70-71 draw calls on both. No cost: stress stands in the island.
- `scenario name=stream-drive`, one run each way: **0 cross and 0 promote stalls** in every phase on both builds; the
  gate 2,601 m on the bike; draw calls 79 / 75 / 118 / 86 on both. The perf phase's own pass fails on both builds the
  same way on this machine (frame p95 8.6 / 8.5 ms against an 8 ms line, heap +32.7 MB by the floor method without
  `--expose-gc`).
- Cost of a building's shell (`geo`, every building of the ring built on a fresh ring, in the page): **0.26 ms on
  average (house 0.22, bungalow 0.30, duplex 0.39, mall 0.71; max 3.8) against 0.035** before - about 7x, 640 ms for
  the whole ring against 90-125. The furniture and its proofs are most of it. A dense ring chunk laid out cold: p50 24.5
  ms of work (ring stage 19.7) against 6-9 (4), in slices of p50 2.8 ms, max 5.6 (before p50 1-1.5, max 4.5-8). In
  stream-drive the ring's layouts were p50 3.4, p95 13, max 16.1 ms against 2.6 / 4.5 / 5.5, and never stalled a crossing.

Renders (`screenshot zoom=16 tilt=0`, standing inside so the roof is hidden; noon), in `docs/renders/web/floorplans/`:
`house-R0.-8.0.jpg` (across hall, 2 bed), `house-R0.-8.1.jpg` and `house-R0.-8.4.jpg` (side hall, 2 bed),
`house-R0.-7.0.jpg` (side hall, 3 bed), `bungalow-R0.-10.4.jpg` (across hall, 3 bed), `bungalow-R0.-7.1.jpg`,
`duplex-R0.-7.3.jpg` and `duplex-R0.-7.3-overview.jpg` (two mirrored flats), `shop-R3.-9.0.jpg` (+ overview),
`diner-R0.11.2.jpg` (+ overview), `gas-R7.7.2.jpg` (squatters: their mattresses in the stock room, crates behind the
boarded front door), `mall-unit-R-1.-7.0.jpg` and `mall-R-1.-7.0-overview.jpg`.

Read as a critic: bedrooms (a bed with pillows and a coloured blanket, nightstands, a dresser, carpet), bathrooms (white
tile, a tub, a toilet, a cabinet) and living rooms (rug, couch, armchairs, TV) read at a glance. Kitchens read by the
stove's dark top, the white fridge and the run of cupboards on linoleum, less strongly when the tall walls hide them at an
angle. The workshop and stock rooms read as storage. Strip-mall sales floors look empty: shelves only go on walls, and
their walls are mostly doors and glass.

## Open

- **Loot volume**: a house holds about 11 containers now (fridge, cupboards, dressers, nightstands, medicine cabinet),
  3.2x what a ring building held before. Each rolls its table (with its "none" weight), but the ring has much more to
  find. Worth a pass on the tables' weights.
- **Shop floors** want gondola shelving in rows down the middle (they keep the middle open today, like every room).
- **Duplexes** are one-bedroom flats because their lots cap them at 17.5 m; two-bedroom flats need wider duplex lots.
- **The compact fallback** (34 houses and bungalows) gives a long bedroom (3 x 9 m in the worst case).
- **Cost**: a shell is ~7x what it was. Candidates if it matters: a cheaper probe (flood only around the piece), fewer
  parts per piece, or building furniture only when a chunk goes hot (collision boxes would have to come later too).
- Warehouses keep the old shell (one floor and a corner office). The ring still has no door leaves, locks or glass, and
  no upstairs (`storeys.js` is the island's).
