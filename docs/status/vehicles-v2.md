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
| 2 | Guns on boats: CHASSIS rows for the boats; the raider gunboat gets its gun | `feat/web-veh-boatguns` | **pushed** (critic PASS; bus #31239) | selftest `only=boat guns` 6/6; node `tools/boatguns.test.mjs` 8/8; boat 17/17, workshop 18/18, water 38/38; shots `boats-{before,after}-*.png` (the lake gunboat's .50 sets an airboat burning) |
| 3 | Doors: held or left open; closing takes a beat after you get in | `feat/web-veh-doors` | **pushed** (critic PASS; bus #31275) | selftest `only=car doors` 7/7 (every hinged body's pillar check); node `tools/cardoors.test.mjs` 5/5; vehicle damage 2/2, walk vehicles 6/6, seats 2/2, semis 10/10, crew 30/30, police 13/13, draw calls 24/24; shots `doors-{before,after}-*.png` |
| 4 | Chain towing: a chain or tow strap; hook the back of one vehicle to another and drive | `feat/web-veh-chain` | **pushed** (critic PASS; bus #31277) | selftest `only=chain towing` 4/4 (fresh page); node `tools/chaintow.test.mjs` 5/5; walk vehicles 6/6, inventory 3/3, timed actions 11/11, move-tow 10/10; shots `chain-{before,after}-*.png` |
| 5 | Box trailers you drive into: an SUV up the ramp into the 18-wheeler's box (the ramp and hold already exist from the semis lane; this adds the SUV, a real body, placed in the world) | `feat/web-veh-suv` | **pushed** (critic PASS; bus #31293) | selftest `only=suv:` 2/2 (the built mesh's height checked against the door); node `tools/suv.test.mjs` 6/6; semis 10/10, workshop 19/19, draw calls 24/24, vehicle damage 2/2; shots `suv-{before,after}-*.png` |
| 6 | Horses as mounts (port `feat/web-horses`) + a cavalry mounted faction with a post and patrols | `feat/web-veh-horses-w2` (on `prep/g0-wave2`; replaces `feat/web-veh-horses`) | **pushed** (critic PASS; bus #31321) | horses ported onto today's integrate: `horses:` 14/14; the Cavalry Company `cavalry:` 5/5; node `tools/cavalry.test.mjs` 8/8; fauna 14/14, melee 11/11, milbases 7/7, move-tow 10/10, draw calls 24/24; shots `cavalry-{before,after}-*.png` |
| 7 | Wagons: horse-drawn, drive or walk into them | `feat/web-veh-wagons-w2` (on horses-w2; replaces `feat/web-veh-wagons`) | **pushed** (critic PASS; bus #31337) | `wagons:` 5/5; node `tools/wagons.test.mjs` 7/7; horses 14/14, cavalry 5/5, walk vehicles 6/6, semis 10/10; shots `wagons-{before,after}-*.png` |
| 8 | Tanks: an old tank and a modern tank | `feat/web-veh-tanks` (lands after boatguns) | **pushed** (critic PASS on second review; bus #31353) | `tanks:` 3/3 on a fresh harness; workshop 18/18, boat guns 6/6, vehicle damage 2/2, draw calls 21/21, milbases 7/7, drive 40/40; node `tools/tanks.test.mjs` 6/6 |
| 9 | A real monster truck body | `feat/web-veh-monster` | **pushed** (critic PASS on third review; bus #31384) | `monster truck:` 4/4 (body, tyres can't be sold or swapped, placed by Dust Bowl Station on fumes, save/load); workshop 18/18, draw calls 21/21, drive 40/40, vehicle damage 2/2; node `tools/monster.test.mjs` 6/6 |
| 10 | A bicycle | `feat/web-veh-bicycle` | **pushed** (critic PASS on second review; bus #31395) | `bicycle:` 4/4 (pedal on stamina, standing/winded/coasting, placed with a shard-claimable id, save/load); vehicle damage 2/2, drive 39/39, stunt 1/1, workshop 18/18, raft 2/2, hud 11/11; node `tools/bicycle.test.mjs` 6/6 |
| 11 | Drones: a recon drone, then an armed one (a real flying actor) | `feat/web-veh-drones` | not started | |

States: not started · building · tested · pushed.


**2026-11-12, shared fix:** world-placed vehicles (tanks, monster truck, wagons, bicycles) get a stable id `seed:<row>` registered with the shard's seed list, so in multiplayer taking one claims it for everyone and a fresh page never leans another (critic finding on the bicycle). Pushed on each of those branches.

**2026-11-12, rebase:** the landing session asked for horses/cavalry and wagons on `origin/prep/g0-wave2` (which already carries the horses port). Replayed only this lane's commits there as `feat/web-veh-horses-w2` and `feat/web-veh-wagons-w2`; slice files byte-identical to the reviewed ones; cavalry 5/5, wagons 5/5, horses 14/14 on a fresh page.
