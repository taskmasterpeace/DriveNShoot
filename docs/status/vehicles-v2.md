# VEHICLES V2 STATUS (DSOA web)

Robert's 11-12 vehicle wishlist, built into the three.js game in `web/`. One branch per slice (`feat/web-veh-<slice>`),
each cut from `origin/integrate/deathlands` so it can merge on its own. The landing session merges; this lane never merges
into integrate itself.

Robert's words (11-12, voice): "we definitely need drones. We definitely need horses as mounts... a cavalry mounted
faction... wagons, but make sure you can drive into the wagons... old tanks and new tanks... fuel types. Regular gas and
diesel... the monster truck body... the bicycle, the 18-wheeler. You gotta be able to drive an SUV inside of it... cars hold
the doors open... tow stuff... if you got a chain you can do it... we do need guns on boats."

Before: `N:/knowledge/dsoa/dsoa_vehicles.json` (the 11-12 audit: 25 rows, one generic fuel, no boat guns, no aircraft,
wagons, tanks, bicycle or monster truck). Checks for every slice: `src/agent/vehicles2-api.js` (selftest `only=fuel types`
etc.) and node unit tests `web/tools/*.test.mjs`.

| # | Slice | Branch | State | Proof |
|---|---|---|---|---|
| 1 | Fuel types: gasoline and diesel per engine; red and yellow cans; a station's two tanks; the wrong fuel chokes the engine, a hose drains it | `feat/web-veh-fuel` | **pushed** (critic PASS; bus #31217) | selftest `only=fuel types` 5/5; node `tools/fuels.test.mjs` 14/14; roadside 12/12, milbases 7/7, underground 13/13, inventory 3/3; shots `docs/renders/web/vehicles-v2/fuel-{before,after}-*.png` |
| 2 | Guns on boats: CHASSIS rows for the boats; the raider gunboat gets its gun | `feat/web-veh-boatguns` | building | selftest `only=boat guns` 4/4 alone; node `tools/boatguns.test.mjs` 7/7; workshop 18/18, water 37/37, garage 3/3 |
| 3 | Doors: held or left open; closing takes a beat after you get in | `feat/web-veh-doors` | not started | |
| 4 | Chain towing: a chain or tow strap; hook the back of one vehicle to another and drive | `feat/web-veh-chain` | not started | |
| 5 | Box trailers you drive into: an SUV up the ramp into the 18-wheeler's box | `feat/web-veh-boxdrive` | not started | |
| 6 | Horses as mounts (port `feat/web-horses`) + a cavalry mounted faction with a post and patrols | `feat/web-veh-horses` | not started | |
| 7 | Wagons: horse-drawn, drive or walk into them | `feat/web-veh-wagons` | not started | |
| 8 | Tanks: an old tank and a modern tank | `feat/web-veh-tanks` | not started | |
| 9 | A real monster truck body | `feat/web-veh-monster` | not started | |
| 10 | A bicycle | `feat/web-veh-bicycle` | not started | |
| 11 | Drones: a recon drone, then an armed one (a real flying actor) | `feat/web-veh-drones` | not started | |

States: not started · building · tested · pushed.
