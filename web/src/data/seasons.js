import OVERRIDES from './seasons.json';
// SEASONS as rows (docs/design/WEB_SEASONS.md). The map has a WHEN as well as a WHERE: a compressed year of four seasons
// (seven game days each by default: a game day is 12 real minutes, so a season is ~84 minutes and a year ~5.6 hours), a
// climate zone per state (Florida has a wet and a dry season, the Rockies have four), and rows for everything the
// season moves: the air, the weather odds, the snow, the leaves, the light, what the land yields, what moves and what
// sleeps, what the passes do, what a trader asks, what the radio says. systems/seasons.js is the one consumer; the
// farming lane reads plantingWindow() / growthFactor(); survival, sky, lookfeel, outdoors, trade and radio each take one
// small hook. Adding a zone, a crop, a pass or a price drift is adding a ROW; validateSeasons(rows) is the World Forge's
// check. Our own words; real places and months are ours to use; no purple (hue 270-320 is refused in the palette rows).

// ---- 1. the calendar --------------------------------------------------------------------------------------------------
// seasonDays: game days in a season (year = 4x). The calendar day is the society's day counter (saved, and it only moves
// while a page is simulating: nobody can sleep the world forward and nothing ages in an empty shard), plus `start`.
// start: where in the year day 0 falls, as a fraction of the year (0 = the first of March, the spring equinox is ~0.05).
// A person's new game opens in mid-spring; the agent harness and the selftest open in mid-October (the air then sits at
// the desert baseline of data/survival.js CLIMATE, so checks written against it keep their numbers).
export const CALENDAR = {
  seasonDays: 7,
  start: { player: 0.17, agent: 0.65 },
  seasons: ['spring', 'summer', 'autumn', 'winter'],
  labels: { spring: 'SPRING', summer: 'SUMMER', autumn: 'AUTUMN', winter: 'WINTER' },
  months: ['March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February'],
  // Day words with no watch: the part of the day and the season (law 6: nobody knows what they weren't told).
  seasonWords: {
    spring: ['EARLY SPRING', 'SPRING', 'LATE SPRING'], summer: ['EARLY SUMMER', 'HIGH SUMMER', 'LATE SUMMER'],
    autumn: ['EARLY AUTUMN', 'AUTUMN', 'LATE AUTUMN'], winter: ['EARLY WINTER', 'DEEP WINTER', 'LATE WINTER'],
  },
  warmest: 0.4,     // the year fraction of the warmest day (late July); the coldest is half a year on
  equinox: 0.05,    // the year fraction of the spring equinox (the sun's declination turns here)
  tilt: 23.44,      // degrees: the sun's reach north and south (daylight length by latitude)
};

// ---- 2. latitude ------------------------------------------------------------------------------------------------------
// The usmap is a flattened country (data/usmap.json): usmap y runs south, so latitude falls with it. Two towns fix the
// line (Seattle y -18000 at 47.6 N, Miami y 20500 at 25.8 N); Phoenix lands on 33.3 N and Denver on 39.7 N.
export const GEO = { lat0: 47.6, y0: -18000, mPerDeg: 1766, lon0: -122.3, x0: -56500, mPerDegLon: 1296 };

// ---- 3. weather odds --------------------------------------------------------------------------------------------------
// Weights over data sky WEATHER keys, in this order. RAIN falls as SNOW when the air is under SNOW.fallC (the sky picks
// the kind from the temperature, so a row only says how wet the season is); STORM is the acid storm and falls as a
// BLIZZARD in a hard freeze.
const KEYS = ['CLEAR', 'OVERCAST', 'RAIN', 'STORM', 'DUST', 'FOG', 'ASHFALL'];
const W = (...v) => Object.fromEntries(KEYS.map((k, i) => [k, v[i] ?? 0]));
export const ODDS = {
  arid_dry: W(0.58, 0.16, 0.04, 0.02, 0.12, 0.03, 0.05),
  arid_monsoon: W(0.28, 0.16, 0.16, 0.18, 0.17, 0.01, 0.04),
  arid_winter: W(0.4, 0.24, 0.2, 0.03, 0.04, 0.06, 0.03),
  arid_spring: W(0.5, 0.18, 0.08, 0.03, 0.16, 0.03, 0.02),
  tropic_wet: W(0.22, 0.2, 0.3, 0.16, 0, 0.1, 0.02),
  tropic_dry: W(0.52, 0.2, 0.08, 0.02, 0, 0.16, 0.02),
  med_dry: W(0.7, 0.12, 0.02, 0, 0.06, 0.07, 0.03),
  med_wet: W(0.3, 0.27, 0.27, 0.03, 0, 0.12, 0.01),
  spring_wet: W(0.3, 0.25, 0.28, 0.07, 0.02, 0.07, 0.01),
  summer_mixed: W(0.45, 0.18, 0.14, 0.1, 0.04, 0.07, 0.02),
  summer_humid: W(0.34, 0.2, 0.22, 0.14, 0, 0.09, 0.01),
  autumn_mixed: W(0.34, 0.28, 0.18, 0.04, 0.02, 0.12, 0.02),
  winter_cold: W(0.25, 0.3, 0.28, 0.01, 0, 0.14, 0.02),
  winter_gray: W(0.14, 0.38, 0.3, 0.01, 0, 0.16, 0.01),
  plains_spring: W(0.34, 0.2, 0.16, 0.14, 0.06, 0.08, 0.02),
  mountain_winter: W(0.22, 0.28, 0.38, 0.02, 0, 0.1, 0),
};

// ---- 4. climate zones -------------------------------------------------------------------------------------------------
// One row per climate. mean: the annual mean air (deg C) at lat0; amp: half the July-January swing; relief0: the relief
// (0..1) the mean was read at (higher ground is colder by LAPSE a unit). local: the zone's own seasons as ranges of the year
// fraction (wrapping), each with its odds row. leaf: the foliage curve (LEAF). snowy: 0..1 how readily the ground keeps snow
// when it is cold enough (a desert wash keeps none); growth: the zone's moisture factor by local season (the farming
// lane's growthFactor); fuel: how much a cold day here costs a house (heating demand, PRICES).
const FOUR = (o) => [
  { id: 'spring', label: 'SPRING', from: 0, to: 0.25, odds: o[0] }, { id: 'summer', label: 'SUMMER', from: 0.25, to: 0.5, odds: o[1] },
  { id: 'autumn', label: 'AUTUMN', from: 0.5, to: 0.75, odds: o[2] }, { id: 'winter', label: 'WINTER', from: 0.75, to: 1, odds: o[3] },
];
export const ZONES = {
  southwest: { name: 'THE SOUTHWEST', states: ['ARIZONA', 'NEW MEXICO'], lat0: 33.4, mean: 23.5, amp: 11.5, relief0: 0.22, leaf: 'desert', snowy: 0.12,
    local: FOUR(['arid_spring', 'arid_monsoon', 'arid_dry', 'arid_winter']), growth: { spring: 0.7, summer: 0.55, autumn: 0.75, winter: 0.6 }, fuel: 0.25 },
  basin: { name: 'THE BASIN AND RANGE', states: ['NEVADA', 'UTAH'], lat0: 39.5, mean: 11, amp: 14, relief0: 0.4, leaf: 'high_desert', snowy: 0.75,
    local: FOUR(['arid_spring', 'arid_dry', 'arid_dry', 'mountain_winter']), growth: { spring: 0.7, summer: 0.6, autumn: 0.7, winter: 0.25 }, fuel: 0.85 },
  california: { name: 'THE COAST AND VALLEYS', states: ['CALIFORNIA'], lat0: 37, mean: 16.5, amp: 6.5, relief0: 0.3, leaf: 'evergreen', snowy: 0.3,
    local: [{ id: 'wet', label: 'WET SEASON', from: 0.78, to: 1.18, odds: 'med_wet' }, { id: 'dry', label: 'DRY SEASON', from: 0.18, to: 0.78, odds: 'med_dry' }],
    growth: { wet: 1, dry: 0.65 }, fuel: 0.4 },
  pacific_nw: { name: 'THE WET COAST', states: ['OREGON', 'WASHINGTON'], lat0: 46, mean: 10.5, amp: 7.5, relief0: 0.35, leaf: 'conifer', snowy: 0.7,
    local: FOUR(['spring_wet', 'med_dry', 'autumn_mixed', 'winter_gray']), growth: { spring: 1, summer: 0.8, autumn: 0.9, winter: 0.35 }, fuel: 0.8 },
  rockies: { name: 'THE ROCKIES', states: ['COLORADO', 'WYOMING', 'MONTANA', 'IDAHO'], lat0: 43, mean: 6.5, amp: 13.5, relief0: 0.55, leaf: 'conifer', snowy: 1,
    local: FOUR(['spring_wet', 'summer_mixed', 'autumn_mixed', 'mountain_winter']), growth: { spring: 0.75, summer: 0.9, autumn: 0.7, winter: 0.1 }, fuel: 1 },
  plains_south: { name: 'THE SOUTHERN PLAINS', states: ['TEXAS', 'OKLAHOMA', 'KANSAS', 'ARKANSAS'], lat0: 33.5, mean: 17.5, amp: 12.5, relief0: 0.25, leaf: 'deciduous', snowy: 0.45,
    local: FOUR(['plains_spring', 'summer_mixed', 'autumn_mixed', 'arid_winter']), growth: { spring: 0.95, summer: 0.8, autumn: 0.85, winter: 0.4 }, fuel: 0.5 },
  plains_north: { name: 'THE NORTHERN PLAINS', states: ['NEBRASKA', 'SOUTH DAKOTA', 'NORTH DAKOTA', 'MINNESOTA', 'IOWA'], lat0: 45, mean: 6.5, amp: 17.5, relief0: 0.25, leaf: 'deciduous', snowy: 1,
    local: FOUR(['plains_spring', 'summer_mixed', 'autumn_mixed', 'winter_cold']), growth: { spring: 0.8, summer: 1, autumn: 0.75, winter: 0 }, fuel: 1 },
  midwest: { name: 'THE MIDWEST', states: ['ILLINOIS', 'INDIANA', 'OHIO', 'MICHIGAN', 'WISCONSIN', 'MISSOURI', 'KENTUCKY'], lat0: 41, mean: 10.5, amp: 15.5, relief0: 0.2, leaf: 'deciduous', snowy: 0.95,
    local: FOUR(['spring_wet', 'summer_humid', 'autumn_mixed', 'winter_cold']), growth: { spring: 0.95, summer: 1, autumn: 0.8, winter: 0.05 }, fuel: 0.9 },
  mid_atlantic: { name: 'THE MID-ATLANTIC', states: ['VIRGINIA', 'WEST VIRGINIA', 'MARYLAND', 'DELAWARE', 'NORTH CAROLINA', 'TENNESSEE', 'NEW JERSEY'], lat0: 37, mean: 13.5, amp: 12, relief0: 0.3, leaf: 'deciduous', snowy: 0.7,
    local: FOUR(['spring_wet', 'summer_humid', 'autumn_mixed', 'winter_gray']), growth: { spring: 1, summer: 1, autumn: 0.85, winter: 0.2 }, fuel: 0.7 },
  northeast: { name: 'THE NORTHEAST', states: ['NEW YORK', 'PENNSYLVANIA', 'CONNECTICUT', 'RHODE ISLAND', 'MASSACHUSETTS', 'VERMONT', 'NEW HAMPSHIRE', 'MAINE'], lat0: 43.5, mean: 8.5, amp: 14, relief0: 0.3, leaf: 'deciduous', snowy: 1,
    local: FOUR(['spring_wet', 'summer_humid', 'autumn_mixed', 'winter_cold']), growth: { spring: 0.9, summer: 1, autumn: 0.8, winter: 0.05 }, fuel: 0.95 },
  gulf: { name: 'THE DEEP SOUTH', states: ['LOUISIANA', 'MISSISSIPPI', 'ALABAMA', 'GEORGIA', 'SOUTH CAROLINA'], lat0: 32.5, mean: 19, amp: 9.5, relief0: 0.2, leaf: 'deciduous', snowy: 0.12,
    local: FOUR(['spring_wet', 'summer_humid', 'autumn_mixed', 'winter_gray']), growth: { spring: 1, summer: 1, autumn: 0.95, winter: 0.5 }, fuel: 0.35 },
  florida: { name: 'FLORIDA', states: ['FLORIDA'], lat0: 28, mean: 23.5, amp: 5.5, warmest: 0.5, relief0: 0.1, leaf: 'subtropical', snowy: 0,
    // Two seasons: wet from mid-May to the end of October (the afternoon storms, the hurricane months), dry the rest.
    local: [{ id: 'wet', label: 'WET SEASON', from: 0.2, to: 0.67, odds: 'tropic_wet' }, { id: 'dry', label: 'DRY SEASON', from: 0.67, to: 1.2, odds: 'tropic_dry' }],
    growth: { wet: 1, dry: 0.75 }, fuel: 0.05 },
};
export const DEFAULT_ZONE = 'southwest';
// A degree of latitude and a unit of relief move the zone's mean; biome letters (usmap legend) nudge it.
export const LAPSE = { perDegLat: -0.55, perRelief: -8 };
export const BIOME_C = { d: 1.5, s: 0.5, '.': 0.8, m: -2, F: -0.5, u: 1 }; // the desert holds heat, the forest and the peaks lose it
// Daily swing about the day's mean (deg C half-range): the base is data/survival.js CLIMATE (the desert's 17.5); it shrinks
// in the cold months and under cloud, and by the zone (humid air holds the night's heat).
export const RANGE = { winterMul: 0.6, humid: 0.55, zones: { florida: 0.5, gulf: 0.6, northeast: 0.7, midwest: 0.75, pacific_nw: 0.6, california: 0.8 } };

// ---- 5. the leaf ------------------------------------------------------------------------------------------------------
// Foliage cover (0 bare .. 1 full) by calendar season at its centre (blended between), and the colour the green turns.
// `green` is the cover of the green itself; `turn` how much of the cover has turned colour (amber, rust) in autumn.
export const LEAF = {
  deciduous: { cover: { spring: 0.75, summer: 1, autumn: 0.5, winter: 0.04 }, turn: { spring: 0, summer: 0, autumn: 0.85, winter: 0.3 } },
  subtropical: { cover: { spring: 0.95, summer: 1, autumn: 1, winter: 0.9 }, turn: { spring: 0, summer: 0, autumn: 0.05, winter: 0.12 } },
  evergreen: { cover: { spring: 1, summer: 1, autumn: 1, winter: 1 }, turn: { spring: 0, summer: 0.1, autumn: 0.05, winter: 0 } },
  conifer: { cover: { spring: 1, summer: 1, autumn: 1, winter: 1 }, turn: { spring: 0, summer: 0, autumn: 0.08, winter: 0 } },
  high_desert: { cover: { spring: 0.8, summer: 0.9, autumn: 0.7, winter: 0.5 }, turn: { spring: 0, summer: 0.2, autumn: 0.5, winter: 0.3 } },
  desert: { cover: { spring: 1, summer: 1, autumn: 1, winter: 1 }, turn: { spring: 0, summer: 0.15, autumn: 0.1, winter: 0.05 } },
};
// The colours the land wears (multiplied into foliage by the look layer; hex). amber = turned leaf, dry = summer-dry grass,
// frost = winter grey-green, spring = new green. Checked for purple by validateSeasons.
export const PALETTE = { spring: '#9bbf5a', summer: '#7a9a46', dry: '#b9a85a', amber: '#c98a2e', rust: '#a4502a', frost: '#8a9486', snow: '#b4c0cc', ice: '#bcd6e4' };

// ---- 6. snow ----------------------------------------------------------------------------------------------------------
// The ground keeps a cover (0 bare .. 1 deep). A zone's own `snowy` and the day's mean air set the SEASONAL PACK (the
// standing snow of a hard winter); a snowfall adds FRESH snow on top, which melts when the air climbs. All of it per hour.
export const SNOW = {
  fallC: 1,              // at or under this air temperature (deg C) rain falls as snow; at -9 a storm is a blizzard
  blizzardC: -9,
  packFullC: -6,         // the day's mean air at which the pack is deepest
  packNoneC: 2.5,        // ... and above which there is none
  build: 0.55,           // fresh cover added an hour of snowfall at weight 1 (a blizzard is 2.2)
  meltPerC: 0.045,       // fresh cover lost an hour per degree C over -0.5
  sunMelt: 1.5,          // melt multiplier in full noon sun
  freshMax: 0.9,         // the most fresh snow that can lie on the pack
  packRate: 0.12,        // an hour: how fast the pack follows the season (the thaw takes days, not minutes)
  snapM: 1500,           // metres from where the pack was last read: past this the pack is the NEW place's (you drove there)
  slick: 0.55,           // cover above which a road is snowpacked (grip rows)
  deep: 0.8,             // cover above which walking slows (SNOW.walk)
  walk: 0.88,            // foot speed at full cover (a boot in deep snow)
  trackHold: 2.4,        // a print lasts this much longer in snow (outdoors TRACKS: the ground holds a mark)
  breathC: 7,            // under this air temperature your breath shows
  iceC: -3,              // the day's mean air under which still shallow water freezes at its edges
  iceDepth: 1.1,         // metres: water shallower than this skins over
};
// Road grip by condition (v.seasonGrip, multiplied into the lateral grip in systems/vehicles.js). Wet pavement is the
// rain's (data weather); these are ice and snow. The snow chain / winter tyre rows would lift them (a later gear row).
export const ROAD_GRIP = { clear: 1, wet: 0.88, slush: 0.7, packed: 0.5, ice: 0.34, closed: 0.3 };

// ---- 7. daylight ------------------------------------------------------------------------------------------------------
// Day length is the real thing (declination x latitude); the sun path in systems/sky.js runs from sunrise over dayLen hours.
export const LIGHT = { min: 6, max: 18, ease: 0.8 };   // clamp the day (hours) so a far-north midsummer never turns the night off

// ---- 8. what the land yields ------------------------------------------------------------------------------------------
// Multipliers by season for what the outdoors layer rolls (systems/outdoors.js asks seasons.yield(kind, id, x, z)). A row
// may name an item or a class (`*` = everything of that kind). Numbers are multiplied (a zone's `growth` rides on top for
// forage). Snow cover cuts forage again (SNOW_YIELD).
export const YIELDS = {
  forage: {
    '*': { spring: 1.1, summer: 1.25, autumn: 1.1, winter: 0.35 },
    wild_berries: { spring: 0.6, summer: 1.6, autumn: 1.2, winter: 0 },
    cactus_fruit: { spring: 0.5, summer: 1.5, autumn: 1.3, winter: 0.2 },
    mesquite_pods: { spring: 0.3, summer: 1.4, autumn: 1.5, winter: 0.1 },
    wild_onion: { spring: 1.6, summer: 0.9, autumn: 0.8, winter: 0.3 },
    puffball: { spring: 1.3, summer: 0.5, autumn: 1.8, winter: 0.1 },
    pale_cap: { spring: 1.2, summer: 0.5, autumn: 1.8, winter: 0 },
    juniper_berries: { spring: 0.4, summer: 0.8, autumn: 1.6, winter: 1.2 },
    cattail_root: { spring: 1, summer: 0.9, autumn: 1.2, winter: 1.3 },
    deadwood: { spring: 1, summer: 0.8, autumn: 1.2, winter: 0.9 },   // the fire's fuel is never out of season; snow buries it (SNOW_YIELD)
    grubs: { spring: 1.2, summer: 1.3, autumn: 0.9, winter: 0.1 },
  },
  fish: {
    '*': { spring: 1.1, summer: 1, autumn: 1.05, winter: 0.55 },
    trout: { spring: 1.5, summer: 0.7, autumn: 1.3, winter: 0.5 },
    bass: { spring: 1.5, summer: 1.1, autumn: 0.9, winter: 0.2 },
    catfish: { spring: 0.9, summer: 1.4, autumn: 1, winter: 0.4 },
    mullet: { spring: 1, summer: 1, autumn: 1.6, winter: 0.9 },     // the autumn run
  },
  snare: { '*': { spring: 1.1, summer: 0.85, autumn: 1.25, winter: 0.6 } },   // the small game is thin in winter, fat and out in autumn
  hunt: { '*': { spring: 1, summer: 0.9, autumn: 1.2, winter: 0.7 } },
};
export const SNOW_YIELD = { forage: 0.55, deadwood: 0.5, snare: 0.85 };   // x (1 - cover * this) so deep snow thins what is on the ground

// ---- 9. what moves and what sleeps ------------------------------------------------------------------------------------
// By fauna species/form (data/fauna.js): `sleep` = the share that hibernates (absent) in the cold, `leave` = the share that
// has migrated away (birds go south), `active` = a multiplier on how far it ranges. Per calendar season. Consumed through
// seasons.fauna(kind, x, z) (a spawn weight multiplier: 0 = none out).
export const FAUNA_SEASON = {
  snake: { spring: 0.8, summer: 1.2, autumn: 0.5, winter: 0, why: 'sleeps below ten degrees' },
  gator: { spring: 0.8, summer: 1.2, autumn: 1, winter: 0.5, why: 'sluggish in the cold, never gone' },
  goose: { spring: 1.3, summer: 0.4, autumn: 1.6, winter: 0.5, why: 'migrates: north in spring, south in autumn' },
  duck: { spring: 1.2, summer: 0.6, autumn: 1.5, winter: 0.8, why: 'migrates through' },
  dove: { spring: 1, summer: 1.2, autumn: 0.8, winter: 0.2, why: 'goes south' },
  crow: { spring: 1, summer: 1, autumn: 1.1, winter: 1, why: 'stays' },
  '*': { spring: 1, summer: 1, autumn: 1, winter: 0.8 },
};

// ---- 10. the passes ---------------------------------------------------------------------------------------------------
// A pass is a road through high ground the winter can close. lat/lon place it (GEO turns them into usmap metres); r: its
// reach (usmap metres); `cold`: degrees C the pass sits colder than the zone's mean (its altitude); `at`: the cover above which it is closed. Closed means the plows are not coming: the board says so,
// the radio says so, the grip is ROAD_GRIP.closed, and a trader with a cargo will not run it. Rows are the real names of
// real places (ours to use). More are added as the map is built out.
export const PASSES = [
  { id: 'donner', name: 'Donner Pass', road: 'I-80', lat: 39.31, lon: -120.33, r: 14000, cold: 12, at: 0.62 },
  { id: 'raton', name: 'Raton Pass', road: 'I-25', lat: 36.99, lon: -104.49, r: 12000, cold: 8, at: 0.7 },
  { id: 'vail', name: 'Vail Pass', road: 'I-70', lat: 39.53, lon: -106.22, r: 12000, cold: 3, at: 0.55 },
  { id: 'teton', name: 'Teton Pass', road: 'WY-22', lat: 43.5, lon: -110.95, r: 10000, cold: 4, at: 0.55 },
  { id: 'snoqualmie', name: 'Snoqualmie Pass', road: 'I-90', lat: 47.42, lon: -121.41, r: 11000, cold: 9, at: 0.6 },
  { id: 'cumberland', name: 'Cumberland Gap', road: 'US-25E', lat: 36.6, lon: -83.7, r: 9000, cold: 4, at: 0.8 },
  { id: 'mogollon', name: 'the Mogollon Rim', road: 'AZ-87', lat: 34.3, lon: -111.4, r: 12000, cold: 12, at: 0.8 },
];

// ---- 11. prices -------------------------------------------------------------------------------------------------------
// What a trader asks drifts with scarcity. A row: items (by id or `kind` of data/items.js), season multipliers, and
// `cold`: extra on top per unit of the zone's fuel demand when it is cold. systems/trade.js multiplies the counter's price
// by seasons.priceMul(item, x, z) (a buy only; what they pay you drifts the other way at SELL_BACK of the swing).
export const PRICES = [
  { id: 'fuel', kinds: ['fuel'], items: ['gas_can', 'fuel_can', 'diesel', 'deadwood', 'propane'], mul: { spring: 0.95, summer: 1, autumn: 1.05, winter: 1.2 }, cold: 0.45, why: 'a cold house burns what a car would' },
  { id: 'food', kinds: ['food'], items: [], mul: { spring: 1.15, summer: 0.9, autumn: 0.8, winter: 1.3 }, cold: 0.1, why: 'the lean months, and the harvest glut' },
  { id: 'water', kinds: ['water'], items: [], mul: { spring: 0.95, summer: 1.25, autumn: 1, winter: 0.95 }, hot: 0.25, why: 'the heat sells water' },
  { id: 'warm', kinds: [], items: ['leather_duster', 'brush_poncho', 'wool_coat', 'parka', 'knit_cap', 'insulated_boots', 'wool_gloves'], mul: { spring: 0.9, summer: 0.75, autumn: 1.1, winter: 1.4 }, cold: 0.25, why: 'a coat costs most when it is cold' },
  { id: 'seed', kinds: [], items: ['seed_packet', 'seeds'], mul: { spring: 0.9, summer: 1.2, autumn: 1.3, winter: 1.1 }, why: 'seed is cheap when it can go in the ground' },
];
export const SELL_BACK = 0.5;

// ---- 12. warmth worn --------------------------------------------------------------------------------------------------
// Degrees C a worn piece adds to what you FEEL in the cold (never in the heat: a coat in a desert noon is a cost, COAT_HOT).
// Keyed by data/gear.js id; the winter pieces below are added to the GEAR catalog at boot (systems/seasons.js) so a
// shop, a cache or a dead man's closet can have them.
export const WARM = {
  leather_vest: 1.5, scrap_vest: 1, soft_vest: 1.5, service_armor: 2, composite_shell: 2.5, leather_cap: 1.5, riot_helmet: 0.5, combat_helmet: 0.5,
  armored_collar: 1, arm_guards: 0.5, work_gloves: 1.5, padded_leggings: 3, plate_leggings: 1, flex_base: 2.5, leather_duster: 4.5, brush_poncho: 3,
  combat_boots: 2, trail_boots: 2, dust_mask: 0.5,
  wool_coat: 7, parka: 11, knit_cap: 2.5, insulated_boots: 4, wool_gloves: 3,
};
export const COAT_HOT = 0.35;    // the share of a piece's warmth that is a cost when the air is over 28 C (heavy things in the heat)
export const WINTER_GEAR = {
  wool_coat: { name: 'Wool coat', slot: 'coat', tier: 2, stealth: 0, look: { gear: 'poncho', color: '#4a4a44' }, desc: 'Heavy grey wool, a button gone. It is the difference between a cold night and a long one.' },
  parka: { name: 'Insulated parka', slot: 'coat', tier: 3, stealth: -0.02, look: { gear: 'poncho', color: '#5a4a2e' }, desc: 'A hooded parka stuffed with something that still holds heat. Smells of smoke and diesel.' },
  knit_cap: { name: 'Knit cap', slot: 'head', tier: 1, look: { gear: 'cap', color: '#5a5448' }, desc: 'A wool cap pulled to the eyebrows. Most of the heat goes out the top.' },
  insulated_boots: { name: 'Insulated boots', slot: 'feet', tier: 2, look: { color: '#3a2e22' }, desc: 'Boots with a felt liner. Dry feet are most of winter.' },
  wool_gloves: { name: 'Wool gloves', slot: 'hands', tier: 1, look: { color: '#4a463e' }, desc: 'Gloves darned at every finger.' },
};
// Fire: a lit fire pit, a campfire or a burning drum warms whoever stands near it (degrees C added to felt, falling off
// with distance). A house with the stove lit is the indoor shelter's `to` pulled up by HEARTH.
export const FIRE = { warm: 14, r: 7, falloff: 1.6 };
export const HEARTH = 6;

// ---- 13. the forecast -------------------------------------------------------------------------------------------------
// A forecast is a knowledge channel (law 6): the radio and a barkeep have it, the world does not hand it to you. It
// carries an age and a confidence; the further ahead, the less sure. `hours`: how far ahead each source can see.
export const FORECAST = {
  radio: { hours: 12, conf: 0.8, station: ['relay', 'static', 'kdst'] },
  barkeep: { hours: 6, conf: 0.55 },
  weatherman: { hours: 24, conf: 0.9 },   // a holdout's keeper of the glass, when one exists
  lines: {
    CLEAR: ['clear skies', 'a clear day'], OVERCAST: ['heavy cloud', 'a gray day'], RAIN: ['rain moving in', 'rain on the way'], STORM: ['an acid storm', 'the green sky coming'],
    DUST: ['a dust wall', 'wind and dust'], FOG: ['fog off the water', 'fog in the low ground'], ASHFALL: ['ash on the wind'], SNOW: ['snow', 'snow moving in'], BLIZZARD: ['a blizzard', 'a whiteout'],
  },
};

// ---- 14. crops (the farming lane reads these through plantingWindow / growthFactor) -------------------------------------
// sowC: the day's mean air (C) a seed needs to come up; maxC: above this it bolts or burns; frostKill: a hard frost
// kills it; days: game days to harvest at growth factor 1 (the garden lane may override). Rows are examples and the
// garden lane's own crop ids resolve here by name; an unknown crop falls back to `default`.
export const CROPS = {
  default: { sowC: 10, maxC: 32, frostKill: true, days: 6 },
  lettuce: { sowC: 5, maxC: 20, frostKill: false, days: 3 },
  potato: { sowC: 8, maxC: 28, frostKill: true, days: 7 },
  carrot: { sowC: 6, maxC: 28, frostKill: false, days: 6 },
  beans: { sowC: 14, maxC: 33, frostKill: true, days: 5 },
  tomato: { sowC: 16, maxC: 34, frostKill: true, days: 7 },
  corn: { sowC: 16, maxC: 35, frostKill: true, days: 9 },
  squash: { sowC: 15, maxC: 36, frostKill: true, days: 8 },
  pumpkin: { sowC: 15, maxC: 33, frostKill: true, days: 10 },
  wheat: { sowC: 4, maxC: 26, frostKill: false, days: 12 },
};
export const FROST_C = 3;   // a day whose mean air is under this has a hard frost at night

// ---- 15. tuning --------------------------------------------------------------------------------------------------------
export const TUNE = {
  placeEvery: 0.5,          // s between place reads (state, relief, biome) while the player moves
  cellM: 400,               // m the player must move before the place is read again
  freshCarry: 0.5,          // the share of fresh snow kept when the zone changes (it does not teleport)
  pullFall: 0.6,            // s the snowflakes take to settle after the weather stops (look layer)
};

// ---- forge overrides -----------------------------------------------------------------------------------------------------
// data/seasons.json is what the World Forge SEASONS tab writes: a zone's mean / amp / lat0 / snowy / warmest and the calendar's
// seasonDays / warmest. They win over the rows above (applySeasonRows also runs when the forge pushes live).
export const FORGE_FIELDS = ['mean', 'amp', 'lat0', 'snowy', 'warmest'];
export function applySeasonRows(doc) {
  if (!doc) return 0;
  let n = 0;
  for (const k of ['seasonDays', 'warmest']) if (doc.calendar?.[k] !== undefined && Number.isFinite(doc.calendar[k])) { CALENDAR[k] = doc.calendar[k]; n++; }
  for (const r of doc.zones ?? []) { const z = ZONES[r.id]; if (!z) continue; for (const f of FORGE_FIELDS) if (r[f] !== undefined && Number.isFinite(r[f])) { z[f] = r[f]; n++; } }
  return n;
}
applySeasonRows(OVERRIDES);

// ---- validation -------------------------------------------------------------------------------------------------------
const hueOfHex = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? ''); if (!m) return null;
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.04) return { h: 0, s: 0 };
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: d / (mx || 1) };
};
export function validateSeasons(rows = { CALENDAR, ZONES, ODDS, LEAF, PALETTE, SNOW, YIELDS, PASSES, PRICES, WARM, CROPS }) {
  const out = [], bad = (m) => out.push(m);
  const { CALENDAR: C = CALENDAR, ZONES: Z = ZONES, ODDS: O = ODDS, LEAF: L = LEAF, PALETTE: P = PALETTE, SNOW: S = SNOW, YIELDS: Y = YIELDS, PASSES: PS = PASSES, PRICES: PR = PRICES, WARM: WM = WARM, CROPS: CR = CROPS } = rows;
  if (!(C.seasonDays >= 2 && C.seasonDays <= 120)) bad(`CALENDAR.seasonDays ${C.seasonDays}: 2..120`);
  if ((C.seasons ?? []).length !== 4) bad('CALENDAR.seasons must name four seasons');
  if ((C.months ?? []).length !== 12) bad('CALENDAR.months must name twelve months');
  for (const k of ['player', 'agent']) { const v = C.start?.[k]; if (!(v >= 0 && v < 1)) bad(`CALENDAR.start.${k} ${v}: 0..1`); }
  const states = new Map();
  for (const [id, z] of Object.entries(Z)) {
    for (const k of ['name', 'states', 'lat0', 'mean', 'amp', 'local', 'leaf']) if (z[k] === undefined) bad(`zone ${id}: no ${k}`);
    if (z.leaf && !L[z.leaf]) bad(`zone ${id}: leaf "${z.leaf}" is not a LEAF row`);
    if (!(z.amp >= 0 && z.amp <= 30)) bad(`zone ${id}: amp ${z.amp} (0..30)`);
    if (!(z.mean > -25 && z.mean < 35)) bad(`zone ${id}: mean ${z.mean}`);
    for (const s of z.states ?? []) { if (states.has(s)) bad(`state ${s} is in zones ${states.get(s)} and ${id}`); states.set(s, id); }
    // The local seasons must cover the year: sample 48 points and every one needs exactly one season.
    for (let i = 0; i < 48; i++) {
      const f = (i + 0.5) / 48, hit = (z.local ?? []).filter((s) => inRange(f, s.from, s.to));
      if (hit.length !== 1) { bad(`zone ${id}: year fraction ${f.toFixed(3)} is covered by ${hit.length} local seasons`); break; }
    }
    for (const s of z.local ?? []) {
      const o = typeof s.odds === 'string' ? O[s.odds] : s.odds;
      if (!o) bad(`zone ${id} ${s.id}: odds "${s.odds}" is not an ODDS row`);
      else { let tot = 0; for (const k of Object.keys(o)) { if (!(k in O.arid_dry)) bad(`zone ${id} ${s.id}: odds key ${k}`); tot += o[k]; } if (!(tot > 0.5 && tot < 1.5)) bad(`zone ${id} ${s.id}: odds sum ${tot.toFixed(2)} (about 1)`); }
      if (z.growth && z.growth[s.id] === undefined) bad(`zone ${id} ${s.id}: no growth value`);
    }
  }
  for (const [k, v] of Object.entries(P)) { const h = hueOfHex(v); if (!h) bad(`PALETTE.${k}: "${v}" is not #rrggbb`); else if (h.s > 0.12 && h.h >= 270 && h.h <= 320) bad(`PALETTE.${k} ${v}: purple (hue ${Math.round(h.h)})`); }
  for (const [k, v] of Object.entries(L)) for (const q of C.seasons ?? []) if (!(v.cover?.[q] >= 0 && v.cover[q] <= 1)) bad(`LEAF.${k}.cover.${q}`);
  if (!(S.packNoneC > S.packFullC)) bad('SNOW.packNoneC must be above packFullC');
  for (const kind of Object.keys(Y)) for (const [id, row] of Object.entries(Y[kind])) for (const q of C.seasons ?? []) if (!(row[q] >= 0 && row[q] <= 4)) bad(`YIELDS.${kind}.${id}.${q}: 0..4`);
  const seenPass = new Set();
  for (const p of PS) { if (seenPass.has(p.id)) bad(`pass ${p.id} twice`); seenPass.add(p.id); if (!(p.at > 0 && p.at <= 1)) bad(`pass ${p.id}: at ${p.at}`); if (!(p.lat > 20 && p.lat < 55)) bad(`pass ${p.id}: lat`); }
  for (const r of PR) for (const q of C.seasons ?? []) if (!(r.mul?.[q] > 0 && r.mul[q] < 4)) bad(`PRICES.${r.id}.mul.${q}`);
  for (const [k, v] of Object.entries(WM)) if (!(v >= 0 && v <= 20)) bad(`WARM.${k}: ${v}`);
  for (const [k, v] of Object.entries(CR)) if (!(v.sowC < v.maxC && v.days > 0)) bad(`CROPS.${k}`);
  return out;
}
export function inRange(f, from, to) { return to > 1 ? (f >= from && f < 1) || f < to - 1 : f >= from && f < to; }
