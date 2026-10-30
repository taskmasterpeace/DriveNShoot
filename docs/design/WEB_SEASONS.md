# WEB_SEASONS: the map gets a WHEN

**Status:** SHIPPED on `feat/web-seasons` (checks in `src/agent/seasons-api.js`, rows in `src/data/seasons.js` + `seasons.json`,
system `src/systems/seasons.js`, look `src/systems/seasonlook.js`, forge tab SEASONS).
**Ask (Robert, after the Project Zomboid study):** "I think we need seasons." Winter makes the north a hard trip, summer
cooks the desert, planting windows decide farming.

## 1. Overview

A compressed year of four seasons, **seven game days each** (a game day is 12 real minutes, so a season is about 84 minutes
and a year about 5.6 hours; `CALENDAR.seasonDays` is the knob). The calendar day is `society.day` plus the sky's hour, so it
is saved with the game and **moves only while a page is simulating**: nobody can sleep the world forward, and an empty shard
does not age. A world-clock lane can replace the source with `g.seasons.clockSource = () => shardDay`.

Where you stand picks a **climate zone** by state (12 rows: Florida has two seasons, wet and dry; the Rockies have four) and
the zone, the latitude, the height of the ground and the biome give the day's mean air. That one number feeds survival
(CLIMATE), the sky's weather odds (rain falls as snow in the cold), the snow cover, the length of the day, what the land
yields, the road's grip, the passes, a trader's prices, the radio's forecast and the farming lane's planting windows.

The playable box today is Arizona and Florida, so **snow lies only where a zone is snowy** (none in either box; a hard cold
snap can still drop a dusting on the Phoenix dawn). The north arrives with the map; every number is already there, and
`season action=pin x= z=` shows any place's climate (and its snow, over whatever ground you stand on) right now.

## 2. Player Fantasy

You learn the year the way a survivor does. The first autumn the leaves turn and the nights bite and you do not know why your
hands are slow; by the second you have a coat, a stack of deadwood and a plan to be home before the pass shuts. A forecast is
a thing you are *told* (the radio's weather bulletin, a barkeep), with an age and a confidence, never a menu. The HUD line
says "SNOW - NIGHT - DEEP WINTER": the part of the day and the year in words; the full date appears only if you carry a watch
(law 6). Summer in the south-west is a water problem; winter in the north is a fuel problem; spring is mud and planting;
autumn is the harvest and the last chance.

## 3. Detailed Rules

**3.1 Calendar.** `calendarOf(t)`: `yearDays = 4 x seasonDays`; `f = (t + start x yearDays) mod yearDays / yearDays` (0 = 1 March);
season = quarter of f; month = 12ths of f. `start` is 0.17 (mid-spring) for a person's new game and 0.65 (mid-October, where the
desert air sits on the old CLIMATE baseline) for the agent harness and selftest. Events: `seasonChange` and `newMonth`
(`g.emit`), plus `g.seasons.onSeasonChange(fn)`; a jump across seasons fires once for the season it lands in.

**3.2 Climate.** `meanAir = zone.mean + (lat - zone.lat0) x -0.55 + max(0, relief - zone.relief0) x -8 + biome + zone.amp x cos(2pi(f - warmest))`
(warmest 0.4, late July). `temp` is that mean minus the survival baseline (23.5 C); `survival.airAt` adds it and narrows the
daily swing in the cold (`range`). Weather: each zone's local season names an odds row (CLEAR, OVERCAST, RAIN, STORM, DUST,
FOG, ASHFALL); `pickWeather` rolls it and the **air decides the kind**: RAIN at or under 1 C is SNOW, a STORM at or under -9 C is a
BLIZZARD, dust and ash do not blow in a freeze. The agent battery's profile keeps the old random sky.

**3.3 Snow.** `cover = pack + fresh x (1 - pack)`. The *pack* follows the day's mean (`packFor`: full at -6 C, none at +2.5 C, scaled
by the zone's `snowy`) at 0.12 an hour, and snaps to the new place's pack when you move 1.5 km. *Fresh* snow builds 0.55 an hour
at weight 1 (a blizzard 2.2) and melts 0.045 per degree an hour over -0.5 C, faster in sun. Look: one patch chained onto every
lit material (125 here) whitens up-facing faces by the cover, broken up by noise so thin cover lies in patches; indoors the
indoorable surfaces (floors, furniture, cars) shed it. Snowfall is one Points object; breath puffs show under 7 C.

**3.4 Leaf.** The same patch turns greens amber then rust (autumn) and grey (frost); the deciduous trees (oak, bald cypress,
mesquite, palo verde) drop leaf blocks by the zone's `LEAF` curve (a winter wood is bare trunks, in the shadow pass too);
evergreens, palms and the desert keep theirs.

**3.5 Light.** Day length is declination x latitude, clamped 6 to 18 h; the sky's sun path runs from the new sunrise over the new
length (`sky.sunRise`, `sky.dayLen`). Seattle midwinter is 9 h of day, midsummer 15. Snow and frost cool the colour grade.

**3.6 Hooks (the cold costs, the land yields).** Warmth worn (`WARM` rows; 5 winter pieces added to GEAR: wool coat, parka, knit cap,
insulated boots, wool gloves) and a fire beside you add to what you *feel*; a coat in a desert noon is a cost. Foraging, fishing
and snares multiply by season rows (and deep snow thins the forager again); prey migrates or sleeps (`FAUNA_SEASON`). Snow holds
a track 2.4x as long; deep snow slows a person on foot to 0.88; the road gives `ROAD_GRIP` (wet .88, slush .7, packed .5, ice .34,
closed .3) through `seasons.grip` (read in systems/vehicles.js). Passes (Donner, Raton, Vail, Teton, Snoqualmie, Cumberland, the Mogollon Rim) close when
their pack passes `at`. A counter's worth moves with scarcity (`PRICES`: fuel and warm clothes in winter, water in the heat).

**3.7 Farming-facing API.** `plantingWindow(crop|row, x, z)` scans the year ahead for the first hard frost and answers `{open, why,
needDays, untilFrost, opensInDays, closesInDays}`; `growthFactor(x, z)` = heat curve x zone moisture.

**3.8 Surfaces.** HUD sub-line; radio bulletin (every third STATIC 1660 bulletin is the forecast); `season` command; forge tab.

## 4. Formulas (with an example)

`meanAir` for Minneapolis (plains_north: mean 6.5 at lat 45, amp 17.5, relief0 0.25) on 15 January (f = 0.875, warmest 0.4):
`6.5 + (45.1 - 45) x -0.55 + 0 + 17.5 x cos(2pi x 0.475) = 6.5 - 0.06 - 17.5 x 0.987 = -10.8 C`.
Phoenix is `23.5 + 11.5 x cos(2pi x 0.475) = 12.2 C` that day: a 23-degree gap. `packFor(-10.8, 1) = 1` (full), so the
Minneapolis cover is 1 and `ROAD_GRIP` gives `ice` (0.34) under -3 C, `packed` (0.5) above; the walker moves at 0.88.
Day length at 45.1 N on f = 0.8: `dec = 23.44 sin(2pi(0.8 - 0.05)) = -23.4`, `24/pi acos(-tan(45.1) tan(-23.4)) = 9.3 h`.

**Variables.** `f` year fraction 0..1 (0 = 1 March); `zone.mean` annual mean air at `lat0`, -10..28 C; `zone.amp` half the summer-winter
swing, 3..20 C; `lat` latitude 20..55 (from the usmap y: `47.6 - (y + 18000) / 1766`); `relief` 0..1 from the usmap relief grid; `warmest` 0.35..0.55;
`packFor(m, snowy) = snowy x smoothstep(2.5, -6, m)` in 0..1; `fresh` 0..0.9; `cover` 0..1; `dayLen` 6..18 h; `temp = meanAir - 23.5` C,
-40..+15 in practice. Planting: a crop is `open` when the day's mean air is in `[sowC, maxC]` and the first hard frost (mean under 3 C)
is at least `days / growthFactor` game days away.

## 5. Edge Cases

- **Jumping the clock** (`season set`, `advance`, sleeping x40): the calendar derives from the day, so events fire once and the pack
  eases to the new date (2 game hours to settle; checks use `update(dt)` with large dt).
- **Midnight frame:** the sky wraps before the society counts the day; `dayFloat` adds the pending day so the calendar never steps back.
- **No state under you** (past the map, the squall line): the zone falls back to the south-west.
- **Fresh snow vs. place changes:** crossing a zone halves the fresh snow; a far move snaps the pack to the new place.
- **Indoors / below the street:** indoorable surfaces shed snow; the floor, the furniture and the cars show their own colour.
- **Agent battery:** `PROFILES.battery` keeps climate off and the sky random, so a cold snap cannot fail a door check.
- **Saves:** `seasons` is an additive snapshot key (shift, year length, snow); an old save loads with the calendar at its start.
- **Short seasons** (`seasonDays` 2): odds blend over 4% of the year; planting windows scan in half-days.

## 6. Dependencies (both ways)

**Reads:** `society.day`, `sky.time`, `streamer.W.stateAt / reliefAt / biomeAt`, `throwables.fires`, `gear.worn`, `data/survival.js CLIMATE`,
`data/items.js`, `data/gear.js`, `data/streaming.js`.
**Read by:** `survival.airAt` and the felt air (`temp`, `range`, worn warmth, fire), `sky` (picker, SNOW and BLIZZARD, sunrise and day
length), `lookfeel.gradeAt` (`gradeTemp`), `vehicles` (`seasons.grip`), `outdoors` (track life, fish, snares, forage), `trade.worth`
(`priceMul`), `radio` (forecast bulletin), `hud` (season words), `main` (walker speed), `forgetools` (`forgePush file=seasons`),
the **farming lane** (calendar, plantingWindow, growthFactor). Open: the barkeep's forecast line and the pulls boards do not
speak the season yet (`forecast('barkeep')` and `hear()` are ready for them); the passes close the grip and the board text but
no barricade is placed on the road; frozen water edges do not crack yet.

## 7. Tuning Knobs (safe ranges)

| Knob | Default | Safe range | Effect |
|---|---|---|---|
| `CALENDAR.seasonDays` | 7 | 3 to 30 | length of a year (4x); under 3 the odds blend too hard |
| `CALENDAR.warmest` | 0.4 | 0.35 to 0.55 | the warmest day, as a year fraction |
| zone `mean` / `amp` | per row | mean -10 to 28, amp 3 to 20 | the climate; the forge tab edits these |
| zone `snowy` | per row | 0 to 1 | how readily the ground keeps snow |
| `SNOW.build` / `meltPerC` / `packRate` | 0.55 / 0.045 / 0.12 | 0.2 to 1 / 0.02 to 0.1 / 0.05 to 0.4 | how fast it builds, melts, follows the season |
| `SNOW.trackHold`, `SNOW.walk` | 2.4, 0.88 | 1 to 4, 0.7 to 1 | tracks and walking in snow |
| `ROAD_GRIP` | see rows | 0.2 to 1 | the road under ice and snow |
| `WARM` rows, `FIRE.warm` | see rows | 0 to 15, 5 to 20 | what a coat and a fire are worth in degrees |
| `PRICES.*.mul` / `cold` | see rows | 0.5 to 2 / 0 to 1 | scarcity drift |
| `TUNE.placeEvery`, `cellM` | 0.5 s, 400 m | 0.25 to 2, 200 to 1000 | how often the place is read |

## 8. Acceptance Criteria

All are named checks (`node tools/dl.mjs selftest only=seasons`): rows whole (and a planted fault caught); calendar pure and
the year turns over; the calendar advances only with the sky clock and the date is saved and loaded; the season event fires
once; climate by place (Phoenix, Minneapolis, Miami two seasons, Denver four); the air you feel follows the date; day length by
latitude and the sky's sunrise; weather odds follow the season and the cold turns rain to snow; snow builds and melts; the pack
follows the cold and the road reads it; yields and migration; planting windows and growth; passes, forecast and the chip;
clothes, fire and prices; the look (125 materials wrapped, flakes, breath, under 150 draw calls, a cooler grade); the cold's
costs (tracks, walking, grip, HUD words, radio); and the forge rows round trip. Screenshots from the game camera are in
`docs/renders/web/seasons/`. Stress and the golden hashes do not move (no chunk content changed).
