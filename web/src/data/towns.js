// TOWN LIFE (docs/design/WEB_TOWNS_ROADS.md): the rows that make a generated town a place you can stop at. Every
// generated town and every peopled SITE stamp gets: a real name from its region's list (never the archetype's), counters
// run by its own workers (fuel, food, ammo) with real opening stock that only a delivery refills, a notice board, house
// rules on the gate (a SITE row's own, or its class's), a curfew, prices that differ by region, and (a SITE row that
// names one) its ruler, standing at its biggest building. systems/townlife.js runs them; validateTowns() checks them.
//
// Laws (WEB_DEPTH_PLAN §0): nobody cheats (a keeper is a real person, killable; their counter is their boxes), no loot
// regeneration (a counter's opening stock rolls ONCE; after that only what a worker made or a delivery brought goes on
// it), our own world (every name here is ours: tools/ip-lint.mjs), tooling over hand-tuning (rows + validateTowns).

// ---- names ---------------------------------------------------------------------------------------------------------------
// By region family (a planned town's biome picks the family: TOWN_FAMILY). planWorld picks one by the record's seed and
// never gives one name to two places in the plan (a family that runs dry borrows from the next in FAMILY_FALLBACK).
export const TOWN_NAMES = {
  desert: ['MESQUITE WELLS', 'CINDER GAP', 'DRY FORK', 'SALTBUSH', 'OCOTILLO SPRINGS', 'TWO WATERS', 'RATTLER FLATS', 'YUCCA TANK', 'PALO SECO', 'TINAJA',
    'CREOSOTE', 'LAST PUMP', 'BURRO WELLS', 'SUNBLEACH', 'HALFWAY TANK', 'GREASEWOOD', 'CHOLLA BEND', 'DRY LAKE CROSSING', 'WINDMILL TWELVE', 'ADOBE FLATS'],
  plains: ['HAYSTACK', 'ELEVATOR SIX', 'SORGHUM CREEK', 'WINDROW', 'TWO SILOS', 'PRAIRIE BELL', 'CHAFF', 'MEADOWLARK', 'SECTION LINE', 'DRYLAND',
    'BUFFALO WALLOW', 'GRAIN CROSSING', 'SOD HOUSE', 'COTTONWOOD FORD'],
  swamp: ['SAWGRASS LANDING', 'GATOR BEND', 'CYPRESS KNEE', 'BLACKWATER FERRY', 'TUPELO ROW', 'HERON POINT', 'PALMETTO HOLLOW', 'OXBOW', 'COTTONMOUTH',
    'STILT ROW', 'MUDFISH', 'SPANISH MOSS', 'LILY PAD', 'TANNIN CREEK'],
  coast: ['SALT LANTERN', 'PELICAN PIER', 'BREAKWATER', 'SHRIMP BOAT', 'DUNE GRASS', 'MANGROVE KEY', 'CORAL ROW', 'TIDE MILL', 'SEAWALL', 'CONCH HARBOR',
    'WRACK LINE', 'SANDBAR', 'GULL ROCK', 'LOW TIDE'],
  forest: ['PINE KNOT', 'SAWMILL HOLLOW', 'TAMARACK', 'BIRCH FORK', 'KINDLING', 'LOGJAM', 'CEDAR BREAK', 'CHARCOAL PIT', 'HEMLOCK', 'TIMBER GAP',
    'TURPENTINE', 'SLASH PINE', 'RESIN CAMP', 'LONGLEAF'],
};
export const FAMILY_FALLBACK = { desert: 'plains', plains: 'forest', swamp: 'coast', coast: 'swamp', forest: 'plains' };
// A biome (data/citygen.js BIOMES, systems/citygen.js biomeFor) to its name family
export const TOWN_FAMILY = {
  desert_sonoran: 'desert', desert_mojave: 'desert', salt_flat: 'desert', high_plateau: 'desert', badlands: 'desert', hot_ground: 'desert',
  great_plains: 'plains', prairie_farm: 'plains', great_lakes_rust: 'plains',
  deep_south_swamp: 'swamp', river_delta: 'swamp',
  gulf_coast: 'coast', atlantic_coast: 'coast', pacific_rain: 'coast',
  temperate_forest: 'forest', northern_pine: 'forest', appalachian: 'forest', alpine: 'forest', tundra_north: 'forest',
};
// The one pure pick: a name for a planned town, by its seed, not in `taken` (a Set the caller keeps). The archetype's own
// name stays on the record as `archName` (what kind of place it is), never as what the place is called.
export function townNameFor(biome, seed, taken) {
  let fam = TOWN_FAMILY[biome] ?? 'desert';
  for (let hop = 0; hop < 5; hop++) {
    const L = TOWN_NAMES[fam], n = L.length, k0 = (seed >>> 0) % n;
    for (let k = 0; k < n; k++) { const nm = L[(k0 + k) % n]; if (!taken.has(nm)) { taken.add(nm); return nm; } }
    fam = FAMILY_FALLBACK[fam];
  }
  const nm = `${TOWN_NAMES.desert[(seed >>> 0) % TOWN_NAMES.desert.length]} ${['NORTH', 'SOUTH', 'EAST', 'WEST'][(seed >>> 3) & 3]}`;
  taken.add(nm); return nm;
}

// ---- counters ------------------------------------------------------------------------------------------------------------
// Every town and peopled site keeps one of each. A keeper is the town's own worker of the first matching job (their name,
// flag and record: kill them and the counter is unattended for good), else a hand the town took on for it (seeded, named,
// flagged). They stand at their counter in its hours; outside them the counter is shut (taking from it is stealing).
//   at       building kinds to keep it at (the first the built town has), else the main street's kerb
//   occ      the town's jobs (data/occupations.js) that can keep it, in order
//   hours    [open, close] game hours           deals  what they buy from you (data/trade.js deal kinds or item ids)
//   stock    the opening stock, rolled ONCE: [item, lo, hi] (x the region's stock factor); never rolled again
//   takes    what the town's workers make that goes on this counter when it is made (law 2: worked for, then sold)
//   sign     the board over it
export const COUNTERS = {
  fuel: { label: 'FUEL', sign: 'FUEL · CASH OR TRADE', at: ['gas_station', 'truck_stop', 'auto_shop', 'garage'], occ: ['fuel_seller', 'pumper', 'mechanic', 'chop_mechanic'],
    hours: [6, 22], deals: ['part', 'fuel_can', 'siphon_hose'], stock: [['fuel_can', 3, 6], ['siphon_hose', 0, 1], ['spark_plugs', 1, 3], ['duct_tape', 0, 2]], takes: ['fuel_can', 'spark_plugs'], title: 'fuel seller' },
  food: { label: 'FOOD & WATER', sign: 'FOOD · WATER · NO CREDIT', at: ['shop', 'diner', 'saloon', 'truck_stop', 'hotel', 'motel'], occ: ['storekeeper', 'company_clerk', 'innkeeper', 'barkeep', 'cook'],
    hours: [7, 21], deals: ['food', 'water'], stock: [['beans_tin', 3, 6], ['jerky', 2, 5], ['water_bottle', 3, 8], ['flatbread', 2, 4], ['peaches_tin', 0, 2]], takes: ['flatbread', 'water_bottle', 'dried_meat', 'jerky', 'cactus_fruit', 'honey'], title: 'storekeeper' },
  ammo: { label: 'AMMO', sign: 'AMMUNITION · COUNTED, NOT WEIGHED', at: ['guardhouse', 'barracks', 'warehouse', 'quonset', 'shop', 'auto_shop'], occ: ['quartermaster', 'armorer', 'guard', 'night_watch', 'hunter'],
    hours: [8, 20], deals: ['ammo', 'gun'], stock: [['ammo_pistol', 18, 48], ['ammo_shells', 6, 16], ['ammo_rifle', 10, 30], ['ammo_22lr', 0, 40], ['cleaning_kit', 0, 1]], takes: ['ammo_pistol'], title: 'ammo seller' },
};
export const COUNTER_KINDS = Object.keys(COUNTERS);

// ---- regions: what things cost and how much is on the shelf ---------------------------------------------------------------
// A town's region (its biome's family; Florida's box is 'florida'): price multiplier by counter (over the trader's
// standing price) and stock multiplier (how much opening stock it rolls). Fuel is dear and short in the swamp; water is
// dear in the desert; ammo is cheap near the bases.
export const REGION_ECON = {
  desert: { label: 'the desert', price: { fuel: 1.0, food: 1.15, ammo: 1.0 }, stock: { fuel: 1.0, food: 0.8, ammo: 1.0 }, note: 'Water costs here. Fuel is the one thing the desert has.' },
  plains: { label: 'the plains', price: { fuel: 1.1, food: 0.85, ammo: 1.05 }, stock: { fuel: 0.9, food: 1.3, ammo: 0.9 }, note: 'Grain is cheap. Everything that comes by road is not.' },
  forest: { label: 'the pines', price: { fuel: 1.15, food: 0.95, ammo: 1.1 }, stock: { fuel: 0.8, food: 1.1, ammo: 0.9 }, note: 'Wood is free. Fuel comes a long way.' },
  swamp: { label: 'the swamp', price: { fuel: 1.4, food: 0.9, ammo: 1.2 }, stock: { fuel: 0.6, food: 1.2, ammo: 0.8 }, note: 'Fuel comes by boat or not at all.' },
  coast: { label: 'the coast', price: { fuel: 1.25, food: 0.9, ammo: 1.15 }, stock: { fuel: 0.7, food: 1.2, ammo: 0.9 }, note: 'Fish is cheap. Fuel is a bargaining chip.' },
  florida: { label: 'Florida', price: { fuel: 1.35, food: 0.9, ammo: 1.2 }, stock: { fuel: 0.6, food: 1.2, ammo: 0.8 }, note: 'Every can of fuel came up I-95 on somebody\'s truck.' },
};
export const regionOf = (biome, inFlorida = false) => (inFlorida ? 'florida' : TOWN_FAMILY[biome] ?? 'desert');

// ---- the rules on the gate, the curfew, the notice board -----------------------------------------------------------------
// A town without a SITE row of its own gets its class's rules (data/occupations.js TOWN_CLASS: free, raider, warlord,
// garrison, company...). curfew: [from, to] game hours the counters are shut and strangers are told to be indoors (null:
// none). A SITE row's own society.houseRules go on its gate instead (up to 3, its words), and its curfew is the class's
// unless one of its rules names a curfew or "after dark".
export const CLASS_RULES = {
  free: { rules: ['NO SHOOTING INSIDE THE LIMITS', 'TRADE FAIR OR LEAVE'], curfew: null },
  raider: { rules: ['TOLL AT THE GATE', 'WHAT YOU DROP IS OURS'], curfew: null },
  warlord: { rules: ['GUNS CHECKED AT THE GATE', 'THE BOSS SPEAKS LAST'], curfew: [22, 5] },
  garrison: { rules: ['ALL ARRIVALS LOGGED', 'NO WEAPONS DRAWN'], curfew: [21, 5] },
  company: { rules: ['COMPANY SCRIP ONLY', 'WORK OR LEAVE'], curfew: [22, 5] },
  cult: { rules: ['ATTEND SERMON', 'NO GUNS ON HOLY GROUND'], curfew: [20, 6] },
  merchant: { rules: ['TRADE BEFORE TALK', 'NO FIGHTS INSIDE'], curfew: null },
};
export const NIGHT_CURFEW = [22, 5]; // a site rule that names a curfew or the dark
export const CURFEW_WORDS = /curfew|after_dark|after_sundown|by_dark|at_dusk|no_light_after_dark|lights_out/;
// The notice board by the gate: what any town pins up (filled from the town itself: its keepers, its region, its rules).
export const NOTICE = {
  lines: ['{name} · NOTICES', 'FUEL: {fuel} · FOOD: {food} · AMMO: {ammo}', '{rule0}', 'CURFEW: {curfew}', '{regionNote}'],
  shut: 'SHUT', none: 'NONE',
};
// Words a house rule's id reads as on a sign ("healer_s_word_is_law" -> "HEALER'S WORD IS LAW").
export const ruleText = (id) => String(id).replace(/_s_/g, "'S ").replace(/_/g, ' ').toUpperCase();

// ---- the ruler of a SITE row ----------------------------------------------------------------------------------------------
// A row with society.ruler stands that ruler at its biggest hero building (else its biggest building): a named, flagged,
// armed person of the site's faction who holds their spot and talks about their rules. Killed, they stay dead.
export const RULER = { hp: 160, weapon: 'pistol', guards: 2, guardWeapon: 'shotgun', lines: ['This is {site}. I am {title}. My rules are on the gate.', 'You read the board? Then you know.', 'Spend your money, keep your peace, and we get on.'] };

// ---- the roadside at a town's own exit (systems/townlife.js lays these by the access road) ---------------------------------
// Rows of detail by the town's access road: where along it (m metres from its start at the cross road, or from its end
// at the town's street), which side,
// what it is (a struct kit in world/townroads.js KITS), and when (always | walled | gated | fuel | big | small).
export const ACCESS_DETAIL = [
  { kit: 'town_sign', m: 30, from: 'start', side: 1, when: 'always' },     // "<TOWN> · POP <n>" at the turn off the cross road
  { kit: 'billboard', m: 90, from: 'start', side: -1, when: 'big' },      // "<TOWN>: FUEL · FOOD · AMMO" on a painted board
  { kit: 'wreck', m: 140, from: 'start', side: -1, when: 'always' },      // a hulk shoved onto the verge
  { kit: 'fence_run', m: 210, from: 'start', side: 1, when: 'always' },   // field fence posts along the road
  { kit: 'mailboxes', m: 260, from: 'end', side: -1, when: 'small' },     // a row of mailboxes where the homesteads' drives were
  { kit: 'burned_car', m: 200, from: 'end', side: 1, when: 'always' },    // a burned-out car, black on the shoulder
  { kit: 'canopy', m: 130, from: 'end', side: 1, when: 'fuel' },          // a gas station canopy and its two pumps before the town
  { kit: 'notice_board', m: 60, from: 'end', side: -1, when: 'always' },  // the board with the notices and the rules
  { kit: 'checkpoint', m: 30, from: 'end', side: 0, when: 'gated' },      // a booth, sandbags and a barrier arm across the way in
];
export const ACCESS_KITS = ['town_sign', 'mailboxes', 'wreck', 'burned_car', 'fence_run', 'billboard', 'canopy', 'notice_board', 'checkpoint'];

// ---- the check -----------------------------------------------------------------------------------------------------------
// items: ITEMS (data/items.js); deals: the deal kinds data/trade.js knows; occs: OCCUPATIONS; kinds: the citygen building kinds.
export function validateTowns({ items = null, occs = null, kinds = null } = {}) {
  const errors = [];
  const all = new Set();
  for (const [fam, L] of Object.entries(TOWN_NAMES)) {
    if (L.length < 10) errors.push(`TOWN_NAMES.${fam}: only ${L.length} names (want 10+)`);
    for (const n of L) { if (all.has(n)) errors.push(`TOWN_NAMES: "${n}" twice`); all.add(n); if (n !== n.toUpperCase()) errors.push(`TOWN_NAMES: "${n}" not upper case`); if (/V[I]LLE\b/.test(n)) errors.push(`TOWN_NAMES: "${n}" (no names with the genre's town suffix)`); }
    if (!TOWN_NAMES[FAMILY_FALLBACK[fam]]) errors.push(`FAMILY_FALLBACK.${fam}: no such family`);
  }
  for (const [b, f] of Object.entries(TOWN_FAMILY)) if (!TOWN_NAMES[f]) errors.push(`TOWN_FAMILY.${b}: no family ${f}`);
  for (const [k, C] of Object.entries(COUNTERS)) {
    if (!C.occ?.length) errors.push(`COUNTERS.${k}: no jobs`);
    if (occs) for (const o of C.occ) if (!occs[o]) errors.push(`COUNTERS.${k}: unknown job ${o}`);
    if (kinds) for (const a of C.at) if (!kinds.includes(a)) errors.push(`COUNTERS.${k}: unknown building kind ${a}`);
    if (!(C.hours[0] >= 0 && C.hours[1] <= 24 && C.hours[0] < C.hours[1])) errors.push(`COUNTERS.${k}: bad hours`);
    if (!C.stock.some(([, lo]) => lo > 0)) errors.push(`COUNTERS.${k}: an opening stock of nothing`);
    if (items) for (const [id, lo, hi] of C.stock) { if (!items[id]) errors.push(`COUNTERS.${k}: unknown item ${id}`); if (!(lo >= 0 && hi >= lo)) errors.push(`COUNTERS.${k}: bad range for ${id}`); }
    if (items) for (const id of C.takes) if (!items[id]) errors.push(`COUNTERS.${k}: takes an unknown item ${id}`);
    if (items) for (const d of C.deals) if (!items[d] && !['part', 'food', 'water', 'ammo', 'gun', 'tool', 'med', 'pack'].includes(d)) errors.push(`COUNTERS.${k}: unknown deal ${d}`);
  }
  // every counter kind must be sold somewhere: fuel, food and ammo are the three a town must have
  for (const need of ['fuel', 'food', 'ammo']) if (!COUNTERS[need]) errors.push(`COUNTERS: no ${need} counter`);
  for (const [r, E] of Object.entries(REGION_ECON)) for (const k of COUNTER_KINDS) {
    const p = E.price[k], s = E.stock[k];
    if (!(p >= 0.5 && p <= 2)) errors.push(`REGION_ECON.${r}.price.${k}: ${p} (0.5-2)`);
    if (!(s >= 0.3 && s <= 2)) errors.push(`REGION_ECON.${r}.stock.${k}: ${s} (0.3-2)`);
  }
  for (const f of Object.keys(TOWN_NAMES)) if (!REGION_ECON[f]) errors.push(`REGION_ECON: no row for ${f}`);
  for (const [c, R] of Object.entries(CLASS_RULES)) { if (!R.rules?.length) errors.push(`CLASS_RULES.${c}: no rules`); if (R.curfew && !(R.curfew.length === 2)) errors.push(`CLASS_RULES.${c}: bad curfew`); }
  for (const d of ACCESS_DETAIL) { if (!ACCESS_KITS.includes(d.kit)) errors.push(`ACCESS_DETAIL: unknown kit ${d.kit}`); if (!(d.m >= 0 && d.m <= 2000) || !['start', 'end'].includes(d.from)) errors.push(`ACCESS_DETAIL ${d.kit}: m ${d.m} from ${d.from}`); if (!['always', 'walled', 'gated', 'fuel', 'big', 'small'].includes(d.when)) errors.push(`ACCESS_DETAIL ${d.kit}: when ${d.when}`); }
  return { ok: !errors.length, errors };
}
