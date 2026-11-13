# Interiors audit: every building type the world makes (2026-11-12)

Asked by Robert, 11-12: "improve all building interiors and camera controls for DSOA". This is the list of what is there
today, by building type, read from the code and checked in the running game (branch `feat/web-zed-camera`, built on
`prep/g0-wave2`). Pictures are in `docs/status/interiors-audit/`. Nothing is fixed in this file; the order to fix is at
the end.

## The short answer

There are two kinds of building in this world.

- **Planned buildings** have rooms, inner doors and furniture from the floor-plan rows (`web/src/data/floorplans.js`).
  These are the Phoenix island, the ring of dead suburbs round it, the walled holdout towns, and the roadside fuel
  stops, junkyard offices and farmhouses.
- **Open boxes** have outer walls, a front door, windows, stairs and crates, and nothing else. No rooms, no furniture,
  no beds, no counter. These are **every building in every streamed country town (35 kinds), every military base
  building, and every tall building on the ring**. That is most of the map by count, and it is all of the tall ones
  except the island's.

No building anywhere has a light inside. At night you see by your own torch.

## By type

"Rooms" means inner walls from a floor plan. "Stairs" means floors above the street you can walk up to.

| Type | Where | Walk in | Rooms | Furniture | Doors that work | Windows | Stairs | Roof hides inside | Light at night | Picture |
|---|---|---|---|---|---|---|---|---|---|---|
| Rust Haven shops (clinic, gunsmith, mechanic, water, radio, store, cantina, boarding house) | Phoenix island | yes | yes | yes | yes, outer and inner | glass, breakable | 3 in 10 have one floor up with living quarters | yes | none | `island-clinic.jpg`, `island-store.jpg` |
| Old Phoenix ruins (house, office, shop) | island ruins | yes; about half have lost the roof | yes, some walls fallen | yes | yes | yes | under half get 1–3 floors up; one is the 6-storey tower | yes | none | `island-ruin-house.jpg` |
| The 6-storey tower (the tallest on the island) | island ruins | yes | street floor only | street floor: yes. Floors 2–6: crates, a shelf, a mattress | street floor | yes | yes, 6 floors | yes, shows your floor only | none | `island-tower-f0.jpg`, `-f3.jpg`, `-f5.jpg` |
| Desert shack | island edge | yes | 1–2 | yes | yes | yes | no | yes | none | `island-shack.jpg` |
| Tower stumps and solid blocks (33 of 113 island buildings) | island ruins | **no: solid** | – | – | – | painted | – | – | – | – |
| Ring house, bungalow, duplex | the ring | yes | yes | yes | yes, when within 110 m | yes | 1 in 5 get a second floor (an open box upstairs) | yes | none | `ring-house.jpg` |
| Ring shop, gas station, diner, mall | the ring | yes | yes | yes | yes; roll-up bays are open gaps | yes | on the strip and downtown, as open-box towers | yes | none | `ring-gas.jpg` |
| Ring warehouse | ring industrial | yes | **one corner office only** | racks and crates | yes | few | never | yes | none | `ring-warehouse.jpg` |
| Ring towers (hotel, office, apartments; 2–6 floors) | ring downtown and strip | yes | **none** | **none**: crates per floor | street door only | holes upstairs, no glass | yes | yes | none | – (none was live where I stood) |
| Holdout town buildings (clinic, clone wing, sheriff, town hall, chapel, homes) | Meridian and the generated walled towns | yes | yes | yes | yes (since `feat/web-zed-interiors`) | yes | **none in any holdout** | yes | none | `N:/knowledge/dsoa/proof/zed-startdoors-after-2-inside.jpg` |
| Holdout back-yard shacks and sheds | holdouts | **no: solid** | – | – | – | – | – | – | – | – |
| Roadside fuel-stop kiosk, junkyard office, farmhouse | along the interstates | yes | yes | yes | **no: door gaps with no door, window gaps with no glass** | gaps | no | yes | none | `roadside-fuel-stop.jpg` |
| Country-town buildings, 35 kinds (house, bungalow, garage, shop, gas station, saloon, motel, school, hospital, office, hotel, church, police station …) | every streamed town | yes | **none** | **none**: 2–6 crates | front door only; no inner doors | street floor glass; holes upstairs | yes, 1–6 floors | yes | none | `town-house-night.jpg`, `town-gas-station.jpg`, `town-school-f0.jpg`, `town-school-f2.jpg`, `town-police.jpg` |
| Military base buildings (HQ, hospital, barracks, hangars, control tower, armory, quartermaster) | every base | yes | **none** | **none**: crates | front door | yes | yes, up to 4 | yes | none | `base-hq-f0.jpg`, `base-hospital.jpg`, `base-control-tower-f3.jpg` |
| Base igloos, pump house, tanks | bases | **no: solid** (a crate at the igloo door) | – | – | – | – | – | – | – | – |
| Outpost Nine (barracks, command post, armory, motor pool) | island | yes | one room each | yes, hand placed | yes | yes | no | yes | none | – |
| Casino rooms | inside country-town saloons and hotels | yes | none | card tables, a cage | as host | as host | as host | yes | none | – |
| A home you have claimed | any country-town building | yes | none (rooms are a list, not walls) | 1–6 pieces dropped at random spots | as host | as host | as host | yes | none | – |
| Underground (bunkers, vaults, tunnels, stations, drains) | under the map | yes | yes, typed rooms | yes | blast and keypad doors | – | levels down | n/a | **yes**: strip lights | – |

### What the pictures show

- `island-clinic.jpg`: the standard to reach. Wards with beds, a waiting room, a corridor, doors, glass.
- `town-gas-station.jpg`: four walls and a door. No counter, no shelves, no back room, no pumps inside the lot.
- `town-house-night.jpg`: a house is one room with five crates and a staircase. No kitchen, bed or bathroom.
- `base-hq-f0.jpg`: a base headquarters is one hall with three crates.
- `island-tower-f3.jpg`: the tallest building's upper floors are a bare slab with a few boxes.
- `roadside-fuel-stop.jpg`: good rooms and shelves, but every opening is a bare gap.

## Other things found

1. **Who is inside.** The rule that puts infected inside buildings (`zombies.occupy`) is called by nothing in world
   generation. Only ring towers get infected per floor.
2. **Upstairs pathing.** People and infected climb stairs through one steering rule (`storeys.steer`); there is no
   path grid above the street. It works for following you up a flight. It is weak for finding their way round rooms
   upstairs, which will matter once upper floors have rooms.
3. **Windows.** You can break glass and climb through a broken street-floor window. There is no climbing out of an
   upper window, no drop, no climb down.
4. **Loot through walls** is closed by the reach rule (`feat/web-zed-wallreach`).
5. **Shells on purpose.** Solid stumps, sheds and igloos have a painted face. None of them shows an open door into
   nothing, but none looks boarded up either; they look like blank boxes.

## Fix order (worst first; each fix reaches every building of that type)

1. **Country-town and base buildings get floor plans.** Give each of the 35 kinds a plan (or a small family of plans)
   from the same floor-plan rows the island uses, on the street floor first: a gas station gets a counter, shelves and a
   back room; a house gets a kitchen, beds and a bathroom; a school gets classrooms off a corridor. Furniture from the
   existing furniture rows, inner doors through the existing door path. This is the largest single gain: it is most of
   the buildings in the game.
2. **Upper floors get rooms** in those same buildings and in the ring towers, starting with the plans that repeat
   well (apartments, hotel rooms, offices, wards, classrooms), and glass in the upper windows.
3. **Roadside buildings get doors and glass** (their ids are not found by the door scan today; a small fix).
4. **Lights inside.** A fixed, small number of lamps for the building you are in (the light budget is fixed), so a
   room can be lit, dark, or lit by your torch.
5. **Ring warehouses** get a plan (loading floor, office, cage).
6. **Solid shells look boarded up** (planks over the door and windows from the existing board pieces).
7. **Claimed homes** place furniture against walls.
8. **Infected inside buildings** by the existing `INSIDE` rows, once rooms exist to put them in.

The camera work (three views, floors shown one at a time in every view) is being done together with items 1 and 2 and
tested in the school (3 floors), a base control tower (4) and the island tower (6).
