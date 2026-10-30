# WEB_LONG_ROAD: making the drive between towns the best part of the game

**Status:** first cut on `feat/web-long-road`, measured and green 2026-10-30. Before: 6 dead stretches on I-10 (20 of 49 minutes of driving, the worst 257 s). After: 0. `selftest only=long-road` passes 7/7 and ip-lint shows 0 deny. Report and screenshots: [docs/renders/web/long-road/emptiness.md](../renders/web/long-road/emptiness.md). **Rows:**
`web/src/data/longroad.js`. **Live:** `web/src/systems/longroad.js`. **Agent:** the `longRoad` command and the
`long-road:` selftest checks in `web/src/agent/longroad-api.js`.

## 1. Overview
Robert, playtest 2026-10-29: *"That bitch was empty, bro... we should pride ourselves on long distance."* This lane
measures how empty the road is, then fills ONLY the dead stretches. It uses systems that already exist: THE ROADSIDE's
sites, the signs, the towns, the batched dead cars in `systems/wrecks.js`, and `addChar` for people. It does not build
a second copy of any of them.

## 2. Player fantasy
Every minute or two of I-10 there is something worth lifting your foot for. A trader works the shoulder off a pickup
bed. A family's van has its hood up; they left Quartzsite and are making for Phoenix. Two burned cars across the
shoulder mark where somebody once held the road. A sedan is pulled half across the shoulder with men in the brush
behind it. At the town where you stop, the trip log tells you how far you came, what you met and what it cost.

## 3. Detailed rules
- **Gap audit** (`audit`): every feature within `sight` m of the centreline becomes an `s` position along the road.
  A gap longer than `maxGapS` s at `cruise` m/s is DEAD.
- **Wayside** (`build`): this is a pure function of the rows, the seed and the road. The road is audited WITHOUT
  beats, and only dead gaps are filled, with one beat every `everyS` s (jittered). There are no beats within
  `townClear` of a town or within `edge` of either end of the road. Beats stand on the real shoulder: `WorldIndex.section(s).out` plus `offset` (5-12 m) m from the centreline. None stands within `rampClear` (900 m) of an exit. A spot inside a town's reach or by a ramp slides 300 m on and tries again.
- **Rhythm:** never the same kind twice running, never an ambush within two beats of the last. Wrecks weigh light, because chunkgen already strews dead cars on every shoulder.
- **One person, one place:** a name is used once along the road. A family beat is ONE household (`household` rows: parents in pairs, their kid at the same index). The kind is weighted by the biome there (`BIOME_MIX`). Every beat carries `source` (the audit mile
  range that called for it).
- **Travellers:** every person at a beat has a role row (`TRAVELLERS`), a real flag, an ORIGIN (the nearest real town
  behind them in their direction of travel) and a DESTINATION (the nearest ahead). The open road is the fallback past
  the last town. Their line says both.
- **No teleport, nothing in view:** a beat is made real only when the player is inside `wake` (460 m) and outside
  `view` (120 m), or 1.5x the camera's live `viewR` if that is wider (HIGH zoom shows 54 m). Past `far` (760 m) it goes back to its record.
- **Nothing regenerates:** a traveller who died stays dead (`dead`). A cache taken stays taken (`taken`, E beside it on
  foot). Both ride the save.
- **Trip log:** a journey starts when you drive off at more than 6 m/s. It ends when you have been stopped for 12 s
  within 1.6 km of a town other than the one you left, after more than 4 km. The log holds from, to, miles, minutes,
  the beats met (passed within 90 m), what you found, fuel used and damage. It shows as a toast and the last 12 ride
  the save.

## 4. Formulas
seconds = Δs / cruise. A beat goes every everyS·cruise·(1 ± jitter/2) metres. A gap counts as dead when Δs/cruise > maxGapS.

## 5. Edge cases
- A teleport or respawn is not distance: a sample jump over 400 m is dropped.
- A short hop under 4 km is not a journey.
- Hostile raiders spawn 6 m further back, behind the wreck.
- The addChar budget can refuse a person; that beat then simply has fewer people.

## 6. Dependencies
WorldIndex (`project`, `at`, `signs`, `towns`, `exits`, `holdouts`, `biomeAt`), THE ROADSIDE (`sites`, `billboards`,
`hazards`), `systems/wrecks.js` (`add`/`remove` by owner key), `addChar`/`removeChar`, inventory, HUD toast, the save.

## 7. Tuning knobs
Everything lives in `LONG_ROAD` (cruise, maxGapS, everyS, jitter, sight, wake, view, far, metPass, tripMinM, tripStopS),
`BIOME_MIX`, the `WAYSIDE` rows (wrecks, people, cache) and the `TRAVELLERS` rows (names with flags, portrait, line).
`validateLongRoad(ITEMS)` checks them all, and the World Forge can call it.

## 8. Acceptance criteria and what is left
Named checks (`selftest only=long-road`): the rows validate · no dead stretch on I-10 longer than maxGapS · the
wayside fills only stretches that were dead, each beat with a source · every traveller has an origin, a destination
and a flag · nothing spawns in view (promote at 60 m: no; inside wake and outside view: yes; past far: back) · a cache
is taken once and stays taken through a save round trip · a journey ends in a trip log.

**Measured** (2026-10-30): 7/7 checks green; the audit and screenshots are in the report.

**Left:**
1. Driven route logs that count moving things: traffic, semis, convoys, fauna and radio lines (`look` sampled along a real drive).
2. Point the radio (world voice) and the pulls board at beats down the road ("a stall at mile 39 has water"). Both are rows to add now that the beats exist.
3. Fuel and breakdowns as a distance decision: stall traders sell fuel by the litre through the existing trade counter (they have only a line today, no counter).
4. Beats that need meshes: signs, pull-offs with a fire ring, a dog (the dogs system's strays).
5. Back roads and the Florida corridors (`W.corridors`): the audit and the placement walk only the I-10 centreline.
6. A trip log that shows on the journal and on a page at journey's end, not only as a toast.
7. Raiders at an ambush stand 6 m out on the x axis only. They should stand behind the wreck relative to the road.
