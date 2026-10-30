// THE WORLD TOOLS (docs/design/WEB_WORLD_TOOLS.md): the rows behind the World Forge's STAMP and TRAVEL tabs. Robert,
// 2026-10-30: "I want to do all the math... tools so that we can stamp and do regions... buildings outside of the
// cities... exits... neighborhoods... gated communities." The whole country opens only once these exist, so the next 48
// states are tool work, not hand placement.
//
// Two halves:
//   STAMPS   what a stamp row in src/data/stamps.json may say (the World Forge writes those rows through the row law,
//            src/forge/rows.js), and what each kind folds into: a REGION row (world/regions.js), citygen records (the
//            CITY and its NEIGHBOURHOODS, the BUILDINGS OUTSIDE CITIES: systems/citygen.js planWorld), exit rows (the
//            region's interchanges, world/worldindex.js addExit) and the state's MILITARY BASE (data/milbases.js rows).
//            world/stamps.js does the folding; validateStamps() is the check the forge, the `stamp` command and the
//            selftest all run.
//   TRAVEL   the travel math: how fast each vehicle row really goes on each road class, what it burns, and how far a
//            tank gets (world/travelmath.js answers `trip from= to= vehicle=` on the real road graph).
//
// Positions in stamp rows are usmap metres (the World Forge's map frame), as every other forge row; offsets inside a
// city are world metres. No purple (hue 270-320 is banned). Real places are ours to use; never a Deathlands name.

// ---- REGION LOOKS: a region stamp names one; it supplies the biome rows the chunk generator reads -------------------------
// A look is a full world/regions.js biome table (see data/regions.js REGIONS.florida.biomes for the fields), the ground
// texture, the wall (the region's edge where no neighbour region continues it), and `citygen`: which citygen biome
// (data/citygen.js BIOMES) a town on each usmap legend letter is built in. `from: 'florida'` starts from Florida's rows so
// two regions that share a border share their ground colours (a seam never shows a colour jump).
export const LOOKS = {
  // Georgia's Piedmont and coastal plain: longleaf and loblolly pine, hardwood bottoms, old cotton and peanut ground, red
  // clay showing through, the dead Atlanta sprawl. Shares Florida's tints on the letters both have (the seam law).
  southeast_pine: {
    name: 'Southeast pine and red clay', from: 'florida', ground: 'marsh',
    biomes: {
      F: { name: 'pine woods', tint: [0.38, 0.45, 0.26], shrubs: 34, trees: 19, boulders: 0.2, rock: 0, palmetto: 0.25,
        flora: [['slashpine', 8], ['liveoak', 2.5], ['deadtree', 0.5]], sloughs: 0.18 },
      a: { name: 'old cotton ground', tint: [0.5, 0.58, 0.33], shrubs: 16, trees: 4, boulders: 0.1, rock: 0, palmetto: 0.05,
        flora: [['liveoak', 2], ['slashpine', 1]], rows: true, sloughs: 0.05 },
      u: { name: 'the dead sprawl', tint: [0.56, 0.58, 0.42], shrubs: 20, trees: 7, boulders: 0.3, rock: 0, palmetto: 0.1, ruins: 1.3,
        flora: [['liveoak', 3], ['slashpine', 1.5], ['deadtree', 1.2]], sloughs: 0.08 },
      s: { name: 'blackwater swamp', tint: [0.33, 0.42, 0.24], shrubs: 42, trees: 13, boulders: 0.1, rock: 0, palmetto: 0.35,
        flora: [['cypress', 5], ['liveoak', 1.5], ['deadtree', 0.8]], sloughs: 0.9 },
      p: { name: 'old pasture', tint: [0.5, 0.52, 0.32], shrubs: 24, trees: 5, boulders: 0.1, rock: 0, palmetto: 0.1,
        flora: [['liveoak', 2], ['slashpine', 1]], sloughs: 0.25 },
    },
    citygen: { F: 'temperate_forest', a: 'prairie_farm', u: 'temperate_forest', s: 'deep_south_swamp', p: 'prairie_farm', w: 'river_delta', '.': 'atlantic_coast', f: 'temperate_forest' },
    wall: { name: 'THE KUDZU WALL', fade: 2500, color: '#4e5a3e', sign: ['KUDZU WALL AHEAD', 'NOTHING PAST HERE', 'TURN BACK'],
      toast: 'THE KUDZU WALL: VINE OVER EVERYTHING, NO ROAD THROUGH. TURN BACK.' },
  },
  // Florida's own rows, so a stamp can name them (REGIONS.florida keeps its hand-tuned rows; this is the pointer).
  florida: { name: 'Florida swamp and flatwoods', from: 'florida', ground: 'marsh', biomes: {},
    citygen: { s: 'deep_south_swamp', F: 'temperate_forest', a: 'prairie_farm', w: 'river_delta', '.': 'atlantic_coast', f: 'gulf_coast', p: 'gulf_coast', u: 'gulf_coast' } },
};

// ---- CLIMATES: the weather the region rolls toward (systems/weather keeps one global sky; these are the weights a
// regional pass reads) and what it does to the life rows. ----------------------------------------------------------------
export const CLIMATES = {
  humid_subtropical: { name: 'humid subtropical', weather: { CLEAR: 3, OVERCAST: 3, RAIN: 3, STORM: 1.5, FOG: 1 }, heat: 0.7, wet: 0.8 },
  subtropical_wet: { name: 'subtropical, wet', weather: { CLEAR: 3, RAIN: 3, STORM: 2, FOG: 1.4 }, heat: 0.85, wet: 1 },
  arid: { name: 'arid', weather: { CLEAR: 6, DUST: 2, OVERCAST: 1 }, heat: 1, wet: 0.1 },
  continental: { name: 'continental', weather: { CLEAR: 3, OVERCAST: 3, RAIN: 2, SNOW: 2, FOG: 1 }, heat: 0.4, wet: 0.6 },
};

// The factions a region can lean toward (data/society + systems/factions ids). A stamp's `lean` is { id: weight }.
// (the ids the game's characters carry: 'zombie' is the dead's share of the land.)
export const LEAN_FACTIONS = ['remnant', 'raider', 'warden', 'drifter', 'free_counties', 'zombie', 'meridian', 'rusthaven'];

// ---- CITY SIZES: a city stamp's size class -> the citygen inputs (and the neighbourhoods it tiles when the stamp names
// none). A city is a cluster of NEIGHBOURHOOD records (systems/citygen.js stamps each on its own: the 700 m cap of one
// layoutTown is why). ring: [kind, angle (deg, 0 = east, clockwise on the map), distance (m)] round the downtown. ------
export const CITY_SIZES = {
  metro: { name: 'metro', across: 3000, pop: [400, 900], ring: [['downtown', 0, 0], ['industrial', 0, 640], ['residential', 90, 620], ['residential', 200, 640], ['trailer_park', 290, 700], ['gated', 135, 1050]] },
  city: { name: 'city', across: 1500, pop: [150, 400], ring: [['downtown', 0, 0], ['residential', 90, 560], ['industrial', 270, 560], ['gated', 180, 640]] },
  town: { name: 'town', across: 700, pop: [40, 140], ring: [['downtown', 0, 0], ['residential', 180, 460]] },
  village: { name: 'village', across: 360, pop: [10, 40], ring: [['residential', 0, 0]] },
};

// ---- NEIGHBOURHOODS: a hood stamp's kind -> the citygen archetype that lays it (data/citygen.js ARCHETYPES hood_*).
// size: the hood's side (m) inside its archetype's sizeM; walls: forced wall row (a gated community's own); guards: the
// wardens it posts at its gates (systems/overrun.js populate stands them at T.gates). ------------------------------------
export const HOOD_KINDS = {
  downtown: { name: 'downtown', arch: 'hood_downtown', size: [420, 560] },
  residential: { name: 'residential', arch: 'hood_residential', size: [380, 520] },
  industrial: { name: 'industrial', arch: 'hood_industrial', size: [380, 520] },
  trailer_park: { name: 'trailer park', arch: 'hood_trailer_park', size: [200, 280] },
  gated: { name: 'gated community', arch: 'hood_gated', size: [240, 320], walls: 'stone_terrace', guards: 2 },
};

// ---- EXITS: what sits at an exit stamp (the community worldindex.community() builds at its dest, by usmap structure
// rows). archetype: the usmap exit archetype (sign style, tier); structures: the buildings, in order. ------------------
export const EXIT_OFFERS = {
  fuel: { archetype: 'service', tier: 'T1', tags: ['fuel'], structures: ['gas_station_small', 'market_stall', 'house_small'] },
  motel: { archetype: 'service', tier: 'T1', tags: ['rest', 'food'], structures: ['motel_strip', 'diner_roadside', 'trailer_single'] },
  truck_stop: { archetype: 'service', tier: 'T2', tags: ['fuel', 'food', 'rest', 'parts'], structures: ['truck_stop', 'diner_roadside', 'motel_strip', 'auto_shop', 'weigh_station'] },
  diner: { archetype: 'service', tier: 'T1', tags: ['food'], structures: ['diner_roadside', 'gas_station_small'] },
  town: { archetype: 'neighborhood', tier: 'T2', tags: ['shelter', 'scavenge', 'market'], structures: null }, // the archetype's own hint
  nothing: { archetype: 'dead', tier: 'T1', tags: [], structures: [] },
};

// ---- BUILDINGS OUTSIDE CITIES: kinds -> a citygen RURAL row (data/citygen.js), and how often each stands beside each road
// class. perKm: the expected count per km of road (both sides together); off: m off the road edge (the RURAL row's own
// when absent). An `outside` stamp is either ONE place (pos) or a DENSITY row for a region (a mix by road class) that
// world/stamps.js turns into places along the region's roads, deterministic in the stamp's seed. -------------------------
export const OUTSIDE_KINDS = {
  farm: { name: 'farm', rural: 'farmstead' },
  ranch: { name: 'ranch', rural: 'ranch' },
  compound: { name: 'compound', rural: 'compound' },
  church: { name: 'country church', rural: 'country_church' },
  school: { name: 'rural school', rural: 'rural_school' },
  prison: { name: 'prison', rural: 'prison_farm' },
  quarry: { name: 'quarry', rural: 'quarry' },
  junkyard: { name: 'junkyard', rural: 'junkyard_lot' },
  motel: { name: 'roadside motel', rural: 'roadside_motel' },
  trailer_park: { name: 'trailer park', rural: 'trailer_park' },
};
// Believable densities (per km of road, both sides): rural Georgia, a farm every couple of km of county road, a church
// every few, a prison a region. These are the defaults a density stamp starts from.
export const OUTSIDE_DENSITY = {
  interstate: { farm: 0.16, church: 0.05, junkyard: 0.04, motel: 0.05, trailer_park: 0.04, school: 0.02, quarry: 0.015, compound: 0.02, prison: 0.006 },
  county: { farm: 0.4, church: 0.12, school: 0.05, compound: 0.06, junkyard: 0.05, trailer_park: 0.06, quarry: 0.02, prison: 0.008 },
};
// The rules a density stamp keeps: never within `clearTown` of a town or a city stamp's footprint, `clearExit` of an
// exit's community, `apart` of another outside place; the most per region (the draw budget never sees them: citygen stamps
// at most PLACE.maxLive at once).
export const OUTSIDE_RULES = { clearTown: 1400, clearExit: 900, apart: 520, maxPerRegion: 120, step: 250 };

// ---- MILITARY BASE: one per state (data/milbases.js MB_STATES); a base stamp names the state's row and may move it to
// ground inside the drivable region (`at`, usmap metres) when the real installation sits past the region's edge. --------
export const BASE_RULES = { inState: true, edge: 1200 };

// ---- THE STAMP FILE's collections (src/forge/rows.js FILES.stamps) ----------------------------------------------------
//   regions  { id, name, state, box: {x0,x1,y0,y1} usmap, look, climate, danger 0-5, lean: {faction: w}, roads?: [ids] }
//   cities   { id, region, name, town?: usmap town id, pos?: [x,y] usmap, size: CITY_SIZES key, seed? }
//   hoods    { id, city, kind: HOOD_KINDS key, at: [dx, dz] world m from the city centre, size?, name? }
//   exits    { id, region, road, mile, name, offers: EXIT_OFFERS key, side: E|W|N|S, m?: world m off the road, risk? }
//   outside  { id, region, kind: OUTSIDE_KINDS key, pos: [x,y] }  ONE place
//            { id, region, mix: { kind: perKm } by road class, roads: ['interstate', ...], seed? }  a DENSITY row
//   bases    { id, state, milbase: data/milbases.js id, at?: [x,y] usmap }
export const STAMP_COLLS = ['regions', 'cities', 'hoods', 'exits', 'outside', 'bases'];

// ---- THE TRAVEL MATH ---------------------------------------------------------------------------------------------------
// Road classes: what the road lets a vehicle do. cap: the most a sane driver holds on it (m/s; null = the vehicle's
// own top); throttle: the extra throttle share it costs (washboard, grades); grip: the surface grip (data/citygen.js ROADS
// rows, vehicles.js roadGrip). sinuosity: built length / usmap polyline length x K (the built road meanders, fillets and
// climbs ramps: MEASURED on I-10, see `measured` below; county and dirt roads take the ratio of their curves).
export const ROAD_CLASSES = {
  interstate: { name: 'interstate', cap: null, throttle: 0, grip: 1.0, sinuosity: 1.0 },
  county: { name: 'county road', cap: 26, throttle: 0.05, grip: 0.9, sinuosity: 1.06 },
  dirt: { name: 'dirt road', cap: 16, throttle: 0.15, grip: 0.72, sinuosity: 1.12 },
  street: { name: 'town street', cap: 15, throttle: 0.05, grip: 0.95, sinuosity: 1.0 },
  ramp: { name: 'exit ramp', cap: 18, throttle: 0.1, grip: 1.0, sinuosity: 1.0 },
};
// The fuel law (systems/vehicledamage.js): litres a second = idle + perThrottle x throttle while somebody drives. The
// same for every rig: what differs is the tank (fuelCap) and how fast the rig goes for the throttle it holds.
export const FUEL_LAW = { idle: 0.012, perThrottle: 0.05 };
// How the driving model settles below a row's maxSpeed flat out (WEB_STREAMING §1.2 P1 lesson 1, measured on I-10):
// LAWMAN 37.5 of 46, DUNE BUGGY 35.5 of 40, MOTORCYCLE 44.7 of 52. Rows not measured take `other`. A rig's steady
// throttle at speed v is (v / vTop) ^ throttleExp (fit to the measured drive: `measured.throttleExp`).
export const SETTLE = { interceptor: 37.5 / 46, buggy: 35.5 / 40, bike: 44.7 / 52, other: 0.84 };
// Off the blacktop some rigs keep their pace: the share of the class cap they hold (1 = all of it).
export const OFFROAD = { buggy: { dirt: 1.15, county: 1.0 }, atv: { dirt: 1.2, county: 1.0 }, bike: { dirt: 0.9 }, rig: { dirt: 0.75 }, rv: { dirt: 0.7 }, apc: { dirt: 1.0 } };
// Driving modes a trip can be priced at: flat out (the 1:14 law's ten-minute Miami-Orlando), the long road's cruise
// (WEB_LONG_ROAD: 30 m/s on I-10), and careful (night, rain, a convoy's pace).
export const MODES = {
  flat: { name: 'flat out', target: Infinity },
  cruise: { name: 'cruise', target: 30 },
  careful: { name: 'careful', target: 20 },
};
// What the travel math is checked against (selftest `world-tools:`): the long road's measured I-10 (WEB_LONG_ROAD:
// Los Angeles to El Paso, 54.5 game miles, 49 min at 30 m/s), and the live drive the check makes itself.
export const MEASURED = {
  i10: { from: 'losangeles', to: 'elpaso', miles: 54.5, minutes: 49, speed: 30, source: 'WEB_LONG_ROAD.md (feat/web-long-road d662add3)' },
  throttleExp: 1.6, // the fitted exponent (world-tools:travel check re-measures it: drive at cruise, read the burn)
  tolerance: 0.1,   // Robert's 10%
};
// The national graph's joins: a road end within `snap` usmap m of another road meets it (the forge's own dead-end rule);
// a town within `townReach` usmap m of the network is reached by a street of that length.
export const NET_RULES = { snap: 70, townReach: 1600, joinBuilt: 3200 };

// The game mile (data/streaming.js STREAM.mile): signs, the odometer and this math all speak it.
export const GAME_MILE = 1609.344;

// ---- the check -----------------------------------------------------------------------------------------------------------
const isPt = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const hueOf = (hex) => {
  const n = parseInt(String(hex).slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.06) return -1;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
export const purple = (hex) => { const h = hueOf(hex); return h >= 270 && h <= 320; };

// validateStamps(doc, ctx) -> { ok, errors: [{coll, id, msg}], counts }. ctx (optional, the engine's view):
//   usmap      the usmap rows (towns, interstates, states_grid) to check names and boxes against
//   regions    existing REGIONS rows (data/regions.js) a stamp must not overlap except along a shared edge
//   milbases   MILBASES_BY_ID (data/milbases.js)
//   archetypes, rural   data/citygen.js ARCHETYPES and RURAL (the hood and outside rows must exist)
export function validateStamps(doc, ctx = {}) {
  const errors = [], E = (coll, id, msg) => errors.push({ coll, id: id ?? '?', msg });
  if (!doc || typeof doc !== 'object') return { ok: false, errors: [{ coll: '*', id: '*', msg: 'not a stamps document' }], counts: {} };
  const ids = new Set();
  for (const c of STAMP_COLLS) for (const r of doc[c] ?? []) { if (!r?.id) E(c, '?', 'row without an id'); else if (ids.has(`${c}/${r.id}`)) E(c, r.id, 'duplicate id'); ids.add(`${c}/${r.id}`); }
  const regions = new Map((doc.regions ?? []).map((r) => [r.id, r]));
  const knownRegion = (id) => regions.has(id) || !!ctx.regions?.[id];
  const towns = new Map((ctx.usmap?.towns ?? []).map((t) => [t.id, t]));
  const boxOf = (id) => regions.get(id)?.box ?? ctx.regions?.[id]?.box ?? null;
  const inBox = (b, p, m = 0) => b && p[0] >= b.x0 - m && p[0] <= b.x1 + m && p[1] >= b.y0 - m && p[1] <= b.y1 + m;
  for (const r of doc.regions ?? []) {
    const b = r.box;
    if (!b || ![b.x0, b.x1, b.y0, b.y1].every(Number.isFinite) || b.x0 >= b.x1 || b.y0 >= b.y1) { E('regions', r.id, 'box {x0,x1,y0,y1} (usmap m, x0<x1, y0<y1)'); continue; }
    if ((b.x1 - b.x0) * (b.y1 - b.y0) > 12000 * 12000) E('regions', r.id, 'box larger than 12 x 12 km usmap (62 km world a side): split it');
    if (!LOOKS[r.look]) E('regions', r.id, `look must be one of ${Object.keys(LOOKS).join(', ')}`);
    if (r.climate && !CLIMATES[r.climate]) E('regions', r.id, `climate must be one of ${Object.keys(CLIMATES).join(', ')}`);
    if (!(Number.isFinite(r.danger) && r.danger >= 0 && r.danger <= 5)) E('regions', r.id, 'danger 0..5');
    for (const k of Object.keys(r.lean ?? {})) if (!LEAN_FACTIONS.includes(k)) E('regions', r.id, `lean: unknown faction ${k}`);
    if (ctx.regions?.[r.id] && !ctx.regions[r.id].stamped) E('regions', r.id, 'a hand-authored region already has this id');
    // Overlap: two regions may share an edge, never land.
    const others = [...(doc.regions ?? []).filter((o) => o !== r).map((o) => [o.id, o.box]), ...Object.entries(ctx.regions ?? {}).filter(([id, o]) => o.box && !o.stamped && id !== r.id).map(([id, o]) => [id, o.box])];
    for (const [oid, o] of others) if (o && b.x0 < o.x1 - 1 && b.x1 > o.x0 + 1 && b.y0 < o.y1 - 1 && b.y1 > o.y0 + 1) E('regions', r.id, `overlaps region ${oid} (regions may share an edge, not ground)`);
    // State: the box should be mostly its state (the usmap state grid), so a region is a state, or a slice of one.
    const U = ctx.usmap;
    if (U && r.state) {
      const key = Object.entries(U.state_legend).find(([, v]) => v === r.state)?.[0];
      if (!key) E('regions', r.id, `state ${r.state} is not in the usmap state legend`);
      else {
        let n = 0, k = 0;
        for (let j = 0; j < U.h; j++) for (let i = 0; i < U.w; i++) {
          const x = U.world_offset[0] + (i + 0.5) * U.cell_m, y = U.world_offset[1] + (j + 0.5) * U.cell_m;
          if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
          n++; if (U.states_grid[j][i] === key) k++;
        }
        if (n && k / n < 0.5) E('regions', r.id, `only ${Math.round((100 * k) / n)}% of the box is ${r.state} (want half or more)`);
      }
    }
  }
  const cities = new Map((doc.cities ?? []).map((c) => [c.id, c]));
  for (const c of doc.cities ?? []) {
    if (!knownRegion(c.region)) E('cities', c.id, `region ${c.region}?`);
    if (!CITY_SIZES[c.size]) E('cities', c.id, `size must be one of ${Object.keys(CITY_SIZES).join(', ')}`);
    const p = c.pos ?? towns.get(c.town)?.pos;
    if (!isPt(p ?? null)) E('cities', c.id, c.town ? `town ${c.town} is not a usmap town` : 'pos [x, y] usmap m, or town');
    else if (boxOf(c.region) && !inBox(boxOf(c.region), p, -300)) E('cities', c.id, `stands outside region ${c.region} (keep 300 usmap m inside)`);
  }
  for (const h of doc.hoods ?? []) {
    if (!cities.has(h.city)) E('hoods', h.id, `city ${h.city}?`);
    if (!HOOD_KINDS[h.kind]) E('hoods', h.id, `kind must be one of ${Object.keys(HOOD_KINDS).join(', ')}`);
    else if (ctx.archetypes && !ctx.archetypes[HOOD_KINDS[h.kind].arch]) E('hoods', h.id, `archetype ${HOOD_KINDS[h.kind].arch} missing from data/citygen.js`);
    if (!isPt(h.at ?? null)) E('hoods', h.id, 'at [dx, dz] world m from the city centre');
    else { const C = cities.get(h.city); const S = CITY_SIZES[C?.size]; if (S && Math.hypot(h.at[0], h.at[1]) > S.across) E('hoods', h.id, `farther than ${S.across} m from its city centre`); }
  }
  // Hoods of one city must not overlap one another.
  const byCity = new Map();
  for (const h of doc.hoods ?? []) { if (!byCity.has(h.city)) byCity.set(h.city, []); byCity.get(h.city).push(h); }
  for (const [, list] of byCity) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], ha = (a.size ?? HOOD_KINDS[a.kind]?.size?.[1] ?? 400) / 2, hb = (b.size ?? HOOD_KINDS[b.kind]?.size?.[1] ?? 400) / 2;
    if (isPt(a.at) && isPt(b.at) && Math.abs(a.at[0] - b.at[0]) < ha + hb + 20 && Math.abs(a.at[1] - b.at[1]) < ha + hb + 20) E('hoods', b.id, `overlaps ${a.id} (keep 20 m of street between hoods)`);
  }
  for (const x of doc.exits ?? []) {
    if (!knownRegion(x.region)) E('exits', x.id, `region ${x.region}?`);
    if (!EXIT_OFFERS[x.offers]) E('exits', x.id, `offers must be one of ${Object.keys(EXIT_OFFERS).join(', ')}`);
    if (!(Number.isFinite(x.mile) && x.mile >= 1)) E('exits', x.id, 'mile >= 1 (an exit number is its milepost)');
    if (!['E', 'W', 'N', 'S'].includes(x.side ?? 'E')) E('exits', x.id, 'side E|W|N|S');
    if (!x.road) E('exits', x.id, 'road (an interstate id)');
    else if (ctx.usmap && !ctx.usmap.interstates.some((r) => r.id === x.road)) E('exits', x.id, `road ${x.road} is not a usmap interstate`);
    if (!x.name || x.name !== String(x.name).toUpperCase()) E('exits', x.id, 'name (upper case, as the sign reads)');
  }
  // Exits on one road keep a mile and a half apart (the interchange builder needs the room: 220 m lanes, 230 m gores).
  const byRoad = new Map();
  for (const x of doc.exits ?? []) { const k = `${x.region}/${x.road}`; if (!byRoad.has(k)) byRoad.set(k, []); byRoad.get(k).push(x); }
  for (const [, list] of byRoad) { list.sort((a, b) => a.mile - b.mile); for (let i = 1; i < list.length; i++) if (list[i].mile - list[i - 1].mile < 1.5) E('exits', list[i].id, `within 1.5 miles of ${list[i - 1].id}`); }
  for (const o of doc.outside ?? []) {
    if (!knownRegion(o.region)) E('outside', o.id, `region ${o.region}?`);
    if (o.mix) {
      for (const [cls, m] of Object.entries(o.mix)) {
        if (!OUTSIDE_DENSITY[cls]) E('outside', o.id, `mix: road class ${cls} (one of ${Object.keys(OUTSIDE_DENSITY).join(', ')})`);
        for (const [k, v] of Object.entries(m ?? {})) { if (!OUTSIDE_KINDS[k]) E('outside', o.id, `mix: kind ${k}?`); if (!(Number.isFinite(v) && v >= 0 && v <= 2)) E('outside', o.id, `mix: ${k} perKm 0..2`); }
      }
    } else {
      if (!OUTSIDE_KINDS[o.kind]) E('outside', o.id, `kind must be one of ${Object.keys(OUTSIDE_KINDS).join(', ')}`);
      else if (ctx.rural && !ctx.rural[OUTSIDE_KINDS[o.kind].rural]) E('outside', o.id, `rural row ${OUTSIDE_KINDS[o.kind].rural} missing from data/citygen.js`);
      if (!isPt(o.pos ?? null)) E('outside', o.id, 'pos [x, y] usmap m (or a mix: a density row)');
      else if (boxOf(o.region) && !inBox(boxOf(o.region), o.pos, -200)) E('outside', o.id, `stands outside region ${o.region}`);
    }
  }
  const states = new Map();
  for (const b of doc.bases ?? []) {
    if (!b.state) E('bases', b.id, 'state (two letters)');
    if (states.has(b.state)) E('bases', b.id, `a second base for ${b.state} (one stamped base a state: ${states.get(b.state)})`);
    states.set(b.state, b.id);
    const M = ctx.milbases?.get?.(b.milbase);
    if (ctx.milbases && !M) E('bases', b.id, `milbase ${b.milbase} is not a data/milbases.js row`);
    else if (M && M.state !== b.state) E('bases', b.id, `milbase ${b.milbase} is in ${M.state}, not ${b.state}`);
    if (b.at && !isPt(b.at)) E('bases', b.id, 'at [x, y] usmap m');
  }
  for (const L of Object.values(LOOKS)) for (const c of [L.wall?.color].filter(Boolean)) if (purple(c)) E('looks', L.name, `purple ${c}`);
  const counts = Object.fromEntries(STAMP_COLLS.map((c) => [c, (doc[c] ?? []).length]));
  return { ok: !errors.length, errors, counts };
}
