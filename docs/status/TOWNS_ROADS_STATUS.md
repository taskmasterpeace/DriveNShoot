# TOWNS AND ROADS: status (feat/web-towns-roads)

Robert's ask (2026-11-12): fix the towns and roads the city/map critic flagged and add depth; towns joined to the
interstates (not only to a city); lane counts that depend on things; small details. Design: `docs/design/WEB_TOWNS_ROADS.md`.
Proof is from the running game on its own port (3471), driven through the agent API; "before" pictures are the same spot on
an untouched copy of `integrate/deathlands` (port 3473). Every picture below was looked at.

Checks: `node tools/dl.mjs selftest only=towns:` (13 checks). `node tools/dl.mjs towns action=audit` (every road).

| # | Item | Proof check | State | Pictures |
|---|---|---|---|---|
| 1 | Town workers sell from a counter: fuel, food, ammo in every town, real stock, no regeneration | towns checks 8-12: 3 counters each kept by a named, flagged person; bought fuel takes cash and moves a real can; a new day does not refill; what a worker made goes on the shelf; region prices; a save and load keeps the shelf as left | **Done** | `towns-roads/after-counter-talk.jpg` (Leopold Delacroix, fuel seller of Adobe Flats, real flag and model), `after-counter-open.jpg` (his counter: 3 fuel cans, plugs, tape), `after-counter-bought.jpg` (bought 3 plugs: $120 -> $73, shelf one row shorter) |
| 2 | Every generated town has a real name from its region's list | towns check 3 (no archetype names, none twice); `ip-lint` 0 deny | **Done** | `after-country-az.jpg` (HALFWAY TANK, YUCCA TANK, ...) vs `before-country-az.jpg` (none shown) |
| 3 | Towns, sites and bases on both map views; Florida not desert brown | towns check 7 | **Done** | `before-area-florida.jpg` (all brown) -> `after-area-florida.jpg` (swamp and pine green, towns and sites named); `before-country-az.jpg` -> `after-country-az.jpg` (squares, diamonds, stars with exit numbers) |
| 4 | Every town gets an exit and an access road; none reached only through a city | towns checks 4-5; audit: 50/50 places in the streamed world reach an exit by their own road (33 new exits, 17 shared), 0 in sea/lagoon/canal/pinned chunks; national map: no town only through a city | **Done** | `after-town-exit.jpg`, `after-town-road-overview.jpg` (Adobe Flats' road meets its main street's end; an earlier version cut a corner of the town - found in the picture and fixed) |
| 5 | Each site's named ruler and gate rules exist in the world | towns check 13 (the Marshal of THE SILVER STRIP, named, flagged, with the row's rules) | **Done** (rules printed and spoken; only the curfew is enforced - see "left") | `after-ruler-silver-strip.jpg`, `after-ruler-rules.jpg` ("Guns checked at gate. No fires after dark. Curfew 22:00-05:00.") |
| 6 | Lane counts depend on things: rule, data table, validator | towns checks 1, 6; `towns action=lanes` | **Done**: I-10 6 lanes near cities (8 runs), 4 in the open and on every bridge; I-95 and I-75 the same rule; a hamlet's access road 1 lane, a town's 2 | `after-lanes-taper.jpg` (I-10 at mile 28 nearing Phoenix: the third lane tapering in on each side) |
| 7 | Small details and depth | towns checks 1, 7; the kits are rows (`ACCESS_DETAIL`) | **Done**: name boards with population, interstate signs with the town's name and 1 MILE / 1/2 MILE, wrecks, burned cars, fences, mailboxes, a billboard for big towns, a fuel canopy, a notice board (hours, rule, curfew, the region's note), a checkpoint at gated towns, curfews, prices by region, seeded doorway people instead of "Townsfolk" | `after-roadside-sign-wreck.jpg`, `after-roadside-canopy-board.jpg`, `after-checkpoint-notice.jpg` (THE SILVER STRIP CHECKPOINT: GUNS CHECKED AT GATE) |

## Passes

- **Pass 1 (2026-11-12):** all seven built; `only=towns:` 12/12 then; audit clean; pictures above. Related checks run on the
  same tab (results below). Bus #31208.
- **Independent review 1 (a separate agent, code read): FAIL, 2 blockers.** Both fixed in pass 2:
  1. *Counter stock grew back after a save and load when the town was away* (the load only kept `ring:` boxes): the load
     now keeps town counter (`tl:`) and town building (`cg:`) boxes too. New check 12 proves it: buy, leave, save, load,
     return: the shelf is exactly as left.
  2. *Loading a save inside a built town left its counters with no keeper* (the save leaves these people out): the load
     now stands every live town up again from the loaded records. Check 12 proves the keepers are back.
- **Pass 2 (should-fixes from the review):** wrecks now sit past the added lane, not in it; keepers, rulers and guards
  stop "holding" and fight or run as soon as one of them is hurt (they were statues); a road that cannot be routed clean
  is not laid (it is reported instead); Florida's town exits join the region's exit list (travel reads it); a killed hired
  keeper stays dead even if the town unloads that second, and a wounded one keeps the wound; the region-price check now
  prices a real can (desert vs Florida) instead of comparing constants; selling at a counter carries the region too.
  New: a site cut off by a lagoon may cross it on a causeway (up to 1.5 km, the water keeps off it); the router tries the
  town's other entries when something (THE THOUSAND WINGS: Davis-Monthan's fence) blocks the first; the audit fails any
  road that runs through another settlement. `only=towns:` 13/13; audit clean (50/50).
- Not changed from the review: Florida's interstates have no bridges in the world model (only I-10's river decks), so
  "no added lane on a bridge" holds there trivially; the `swamp` row in `LANE_TERRAIN` is ready for when a causeway
  interstate exists. Keepers and rulers are made on each machine like the town workers already are (not yet synced over
  the network).
- **Related checks (my own tab, `only=` the 13 groups this touches: streaming, florida, worldmap, roadside, roadscape,
  citygen, occupations, long-road, water, travel, milbases, pulls, towns).** First run 113/118: five were mine and are
  fixed - I had sorted the shared exit list across all roads (a Florida exit became "exit 0" in I-10's ramp drive); a new
  exit stood 450 m from a roadside billboard (exits now keep 700 m off billboards and roadside sites); the "next exit"
  billboards still named the old next exit (they are relabelled with the town exits now); and the long road made no
  wayside travellers at all, because its "keep off ramps" test compared Florida exits' miles against I-10's and the town
  signs filled every dead stretch (it now plans its beats on the road as it was before the town exits: 6 beats with
  travellers, wrecks and caches, against 9 on the base - three stretches now have a town instead). Last run: **129/131**;
  the two misses (pulls: a bottle "no room in your pack", a medic call's body) came from my tab's pack being stuffed by
  earlier aborted runs; on a fresh tab `pulls:` + `towns:` = **23/23**. The junkyard-strip check fails on the untouched
  base too when run alone (not from this branch).
- **Independent review 2 (same reviewer, the fixes): PASS, no blockers.** Its should-fixes also done: the towns are stood
  up after the id counter on a load (no id clash); an exit is only built where its town's road routes clean; a causeway's
  water lookup holds only its wet stretches (cheap); a keeper seated after an alarm does not freeze; relabelled
  billboards take the service line of the exit they now name; the towns checks put the game back as they found it.

## Left / honest gaps

- A fuel can is 11 litres: with the starting satchel you cannot carry one off the counter (the check makes room to prove
  the sale). Buying straight into a car's trunk is not built.
- Gate rules other than the curfew are spoken and printed, not enforced (no guard takes your gun at the gate yet).
- Far sites get long access roads (up to 22 km) bent round obstacles; they are not surveyed routes and cross rivers on the
  water plan's decks and fords.
- The road pass's boot cost is not measured (the agent tab's clock read 1 ms; needs a real timing on a normal tab).
- The full batteries were not run here (the landing session owns them).
