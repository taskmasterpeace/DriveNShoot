# WEB_TOWNS_ROADS: town names, counters, exits and access roads, the lane rule, rulers, the map

**Status:** built 2026-11-12 on `feat/web-towns-roads` (from `integrate/deathlands` at `120d9354`). Answers the city and
map critic ([docs/reviews/CITY_MAP_CRITIC_2026-11-12.md](../reviews/CITY_MAP_CRITIC_2026-11-12.md), fixes 1-6 and the
map's M2) and Robert's asks on top of it: towns joined to the interstates (not only to a city), lane counts that depend on
things, and small details. **Rows:** `web/src/data/towns.js`, `web/src/data/lanes.js`. **Laid:** `web/src/world/townroads.js`
(boot, inside the streamer). **Live:** `web/src/systems/townlife.js`. **Agent:** the `towns` command and 12 checks in
`web/src/agent/towns-api.js` (`selftest only=towns:`). **Proof:** `docs/status/TOWNS_ROADS_STATUS.md`.

## 1. Overview

Before: the generated towns and SITE stamps were "good buildings, no town" (critic 4.0 and 4.6 of 10): named after their
archetype ("INTERSTATE EXIT CLUSTER"), nothing to buy, no road in, not on either map, and the 63 rulers the SITE rows name
never stood anywhere. After: every one of them has a real name, three counters, its own exit (or a shared one) and an
access road to its main street, a name board, a notice board, and a ruler where the row names one; both map views mark
them; the interstates widen near cities and narrow in the open by a rule.

## 2. Player Fantasy

You see a name on a green sign a mile out ("EXIT 10 · ADOBE FLATS · FUEL · FOOD · AMMO"), take the exit, pass a burned car
and a fuel canopy, read the notice board ("CURFEW NONE · Water costs here"), and buy plugs from Leopold Delacroix at his
counter - a man with a name, a flag and a job, whose shelf is what it is because nobody refills it for free. In THE SILVER
STRIP the Marshal stands at the saloon and tells you the rules on the gate. On the map, the places you can stop at are
marked; on the interstate, the road grows a lane as a city nears and loses it in the open.

## 3. Detailed Rules

### 3.1 Names (`TOWN_NAMES`, `townNameFor`)

Five name lists by region family (desert, plains, swamp, coast, forest; `TOWN_FAMILY` maps a biome to its family), picked
by the town's own seed, never twice in one plan (a family that runs dry borrows from `FAMILY_FALLBACK`). Our own names
(`tools/ip-lint.mjs` 0 deny). The archetype's name stays on the record as `archName`. Metros keep their city's name
("LOS ANGELES METRO"); SITE stamps keep their row's name.

### 3.2 Counters (`COUNTERS`, `REGION_ECON`; `systems/townlife.js`)

Every built town and peopled site: FUEL, FOOD & WATER, AMMO. The keeper is the town's own worker of the first fitting job
(`occ`, from `systems/workforce.js`: same name, flag and record; they leave their ordinary shift for the counter), else a
hand the town took on (seeded name and flag). They stand at the door of a fitting building (`at`), else on the main
street's kerb; the counter is their box in front of them (`systems/trade.js`: with them there, taking is buying; gone, it
is stealing). Hours per counter; shut in the town's curfew.

Stock law: the box's opening stock (`stock`, x the region's `REGION_ECON.stock`) rolls ONCE; the box is kept across
stamps and in the save (`inventory.registerRing`). After that only (a) what the town's workers made goes on it as it is
made (`takes`: flatbread, water, jerky, fuel cans, plugs, reloaded rounds) and (b) a delivery (`rites.takeDelivery`).
Prices: the trader's standing price x `REGION_ECON.price` (fuel x1.4 in the swamp, x1.35 in Florida; food x1.15 in the
desert).

### 3.3 Exits and access roads (`world/townroads.js layTownRoads`)

Planned once (citygen `planWorld`, before any exit is added, handed to CityGen as `W.townPlan`), then for each town and
site in the streamed world: the nearest interstate; the entry nearest the road (a main street's end or a gate); an exit
at that point or just past the town's footprint (`ok()`: not near the road's ends, 1.3 km from any other exit, not on a
bridge, not touching a pinned P1 chunk or the island, the cross road not running into any settlement or water). No room:
the nearest working exit on that road serves it. The access road leaves the cross road's end on the town's side and goes
to the entry NEAREST that end, routed sideways round the sea, a lagoon, a canal, a pinned chunk, the island and ring,
every other planned settlement and the town's own footprint (`routeAccess`). Rivers are crossed: the water plan runs
again after the roads (`W.applyWater`), so each crossing gets a deck or a ford; Florida's sloughs keep off any road by
their own rule. Signs on the interstate: 1 MILE, 1/2 MILE and the gore ("EXIT n · <TOWN> · FUEL · FOOD · AMMO").

### 3.4 Rulers and rules (`RULER`, `CLASS_RULES`)

A SITE row with `society.ruler` stands that ruler (seeded name, real flag, `rulerTitle`, handle = the row's ruler) and two
guards at its biggest hero building. They hold their spot, speak the row's house rules, curfew and where the counters
are; dead stays dead (`townlife.recs`, saved). A town without a row of its own gets its class's rules. Rules are printed
on the notice board and (gated towns) the checkpoint sign. Enforced today: the curfew shuts the counters; a raised gun
shuts a counter (systems/arms.js, as before). Not enforced yet: "guns checked at the gate" and the other gate rules
(see §8).

### 3.5 Lanes that depend on things (`data/lanes.js`)

`lanesFor({ cls, size, km, terrain, region })`: the class's open-road count (interstate 4, US highway 2, state 2, county
2, dirt 1), plus the first `LANE_PLACE` band the nearest place matches (a metro within 8 km or a city within 4 km: +2 on
interstate/US/state; a hamlet: county -1), held to the class's base on a bridge or a mountain grade (`LANE_TERRAIN`),
clamped to the class, even on a divided road. `placeSize` reads a place's size from what it was (usmap city, metro,
archetype extent, a site's footprint). Laid: every 200 m along each interstate; runs of 6 lanes at least 1.2 km long are
built as an added lane each way (the atlas's added-lane strip outside lane 2), tapered over 180 m, never through an
interchange (each exit's own ramps are its lanes there), near a pinned chunk or in the island and ring;
`section(s).extra` widens the road's edge for everything that reads it, and signs and mileposts move out with it. Access
roads: 2 lanes, a hamlet's 1 (the plain strip, 5.8 m). `relayLanes` runs again when the water re-plans (real terrain on).

### 3.6 The map and the roadside

COUNTRY view: generated towns (orange squares), SITE stamps (gold diamonds), bases (stars) with names and exit numbers,
under the fog rule. AREA view: the same, with names; every land letter has a colour (`AREA_RGB`: Florida's swamp, pine,
farm and prairie were desert brown). The roadside of each access road (`ACCESS_DETAIL`, metres from its start or end):
the town's name board, a billboard (big towns), a wreck, a fence run, mailboxes (small towns), a burned-out car, a gas
canopy with two pumps, a notice board (counters' hours, the first rule, the curfew, the region's note), and a checkpoint
(booth, sandbags, barrier arm, the rules) at a gated town. The doorway extras that were "Townsfolk" and "Town Guard" with
a flag from `Math.random` are seeded named people now.

## 4. Formulas

- **Lanes:** `lanes = clamp(rural + LANE_REGION[region] + add(place), min, max)`, then `= base` if terrain is bridge or
  mountain and lanes > base, then rounded up to even on a divided road. rural/min/max/base from `LANE_CLASSES`; add from
  the first `LANE_PLACE` band whose size equals the nearest place's and whose km >= the distance to its edge. Ranges:
  interstate 4-6, US 2-4, state 2-4, county 1-2, dirt 1. Example: I-10 at mile 28, Phoenix (metro) 1.4 km away, flat:
  4 + 0 + 2 = 6 (3 each way). The same point on a river deck: 6 > base 4, so 4. A county road 300 m from a hamlet: 2 - 1 = 1.
- **Price at a counter:** `buy = worth x PRICE_TIER[standing].buy x roles x sheet x deep x REGION_ECON[region].price[kind]`.
  Example: a fuel can (value 40, full) at neutral (1.3) in Florida (1.35): 40 x 1.3 x 1.35 = $70.2 -> $71; in the desert
  (1.0): $52.
- **Opening stock:** each `COUNTERS[kind].stock` row `[item, lo, hi]` rolls `round(lo x f) .. max(round(lo x f), round(hi x f))`
  with f = `REGION_ECON[region].stock[kind]` (0.3-2). Example: fuel cans [3, 6] in the swamp (f 0.6): 2-4 cans. Rolled once.
- **Added lane width:** `extra(s) = 3.6 x smooth(min(s - s0, s1 - s) / 180)` inside a run [s0, s1], 0 outside.

## 5. Edge Cases

- A town with no room for an exit (road end, another exit within 1.3 km, a bridge, a pinned chunk, water at the cross
  road's end): the nearest working exit within 30 km along the same road serves it; its own name board stands at the turn.
- A place more than 60 km from every interstate: reported `unserved` by `towns action=list` and fails the audit check
  (none today).
- A straight access road meets sea, a lagoon, a canal, a pinned chunk, the island, another settlement or its own town: a
  control point is put sideways (0.7-2.4 km either way, up to 6 times); what still crosses is counted by the audit and
  fails it (0 today). Rivers are not obstacles: the water plan decks or fords them.
- The keeper is killed: the counter is nobody's for good (saved); its box can be looted (stealing, as any trader's).
- The town's matching worker is dead before the town is built: a hired hand keeps the counter.
- Off hours or curfew: the keeper is not there; the box is shut (taking is stealing).
- The town is overrun: no counters and no ruler are stood up.
- Real terrain switched on after boot: the water re-plans its decks and `relayLanes` runs again, so no added lane stands
  on a new deck; signs and mileposts move from their base position, never twice.

## 6. Dependencies

- **Uses:** `systems/citygen.js` (planWorld, stamp/release hooks), `world/worldindex.js` (addExit, section, ribbons,
  bucketFeatures, applyWater), `world/rivers.js` (decks/fords for the new roads), `world/regions.js` (Florida water),
  `systems/workforce.js` (the keepers' records; produced stock), `systems/trade.js` (counters; `priceMul`),
  `systems/inventory.js` (registerRing), `ui/atlas.js` + `ui/qol.js` (the map views), `data/golden.json` (pinned chunks).
- **Used by:** `world/chunkgen.js` (mesas keep off `W.townAccess`), `world/roadscape.js` (county access roads get roadside
  scenes like any county road), `world/streamer.js` (runs the pass before the sign atlas), save/load (`townlife`).
  WEB_CITYGEN.md, WEB_OCCUPATIONS.md, WEB_TRADE.md and WEB_WORLD_MAP.md should name this doc (follow-up).

## 7. Tuning Knobs

| Knob | Where | Safe range | Effect |
|---|---|---|---|
| `LANE_PLACE[*].km` | data/lanes.js | 1-10 | how far a city widens the interstate |
| `LANE_LAY.minRun` / `taper` | data/lanes.js | 800-3000 / 100-300 m | shortest added lane worth building; its ease in/out |
| `REGION_ECON[*].price[*]` | data/towns.js | 0.5-2 | what a region charges per counter |
| `REGION_ECON[*].stock[*]` | data/towns.js | 0.3-2 | how full a region's opening shelves are |
| `COUNTERS[*].hours` | data/towns.js | 0-24 | when a counter is kept |
| `TOWNROADS.exitGap` / `reuseMax` | world/townroads.js | 1100-2500 m / 5-40 km | exit spacing; how far a shared exit may be |
| `ACCESS_DETAIL[*].m` | data/towns.js | 20-2000 m | where each roadside kit stands |

## 8. Acceptance Criteria

All of these are `selftest only=towns:` checks (12), each pass/fail:
1. The rows pass `validateTowns` and `validateLanes`.
2. The road pass ran at boot with no error.
3. No generated town carries an archetype name; no two share a name.
4. Every town and site in the streamed world reaches an exit by its own access road ending within 30 m of its entry, with
   no point in the sea, a lagoon, a canal or a pinned chunk; the national map has no town reached only through a city.
5. Nothing the pass laid touches a pinned P1 chunk.
6. I-10 has added-lane runs near cities, none on a bridge, 4 lanes wherever nothing widens it.
7. Both map views mark towns, sites and bases; the AREA view colours every land letter.
8. A built town has 3 counters, each kept by a named, flagged person in its hours.
9. Buying fuel takes cash and moves a real can off the shelf; a new day does not refill it.
10. Prices carry the region.
11. What a worker makes goes on the counter that sells it.
12. THE SILVER STRIP's Marshal stands on the ground with the row's rules.

## Appendix: not done / next

- A fuel can is 11 L: on foot you need a big pack to carry one off the counter (no "into the trunk" buy yet).
- Gate rules beyond the curfew are words, not law yet (guns checked, tolls, tithes): the next slice is a gate guard who
  asks and remembers.
- The national map's own county roads (usmap.json) are audited, not re-laid: none reaches the interstates only through a
  city today (`towns action=audit`).
- No town's road crosses a river without the water plan's deck or ford, but long roads (up to 22 km to far sites) are
  straight-ish lines bent round obstacles, not surveyed routes.
- Real 8-lane metro rings need a 4th lane strip in the road atlas.
