// THE MILITARY BASES (docs/design/WEB_MILITARY_BASES.md; WEB_DEPTH_PLAN §2 Wave 2). Robert: "We also need the large
// military bases in each state, plan for that also." One LARGE base per state at a real installation's real point, plus
// the biggest ones by real footprint (and the ones the drivable world reaches today: Arizona and Florida). Real public
// places are ours to use; nothing here names a book.
//
// A row is: where (real lat/lon -> world x/z by the atlas projection), how big (the real area -> a footprint class and a
// built side), what shape (army post, air base, naval station, depot; a proving ground is an army post with ranges), and
// its STATE: held by a faction (patrols, a quartermaster who trades, the gate rule), overrun (a horde inside that pours out
// at a noise), or sealed (nobody home: restore the generator, find the code, open the blast door). world/citygen/milbase.js
// lays a row out (through citygen's stamp path, on its real-terrain pad); systems/milbases.js runs it. A new base = a row.
//
// The atlas (data/atlas.js ATLAS_BASES) already names the fifty state bases with lat/lon and area; a row with `atlas`
// names that atlas row and must agree with it (validateMilbases). x/z come from the atlas's own projected block where it
// has one, else from projectLL below (a local affine fit through the nearest projected atlas points: 126 m mean error,
// leave-one-out, against the atlas's own fit).
import { ATLAS_SITES, ATLAS_BASES, ATLAS_XZ, FOOTPRINT } from './atlas.js';

// ---- footprint classes: the real area folds by the road law (1:FOOTPRINT.S) into a side, held to the class's range ------
//   side    [min, max] built side along x (m); aspect: depth / side; label: what the HUD and the map call it
export const MB_CLASSES = {
  fort:    { label: 'ARMY POST', side: [480, 620], aspect: 0.78 },
  airbase: { label: 'AIR BASE', side: [560, 720], aspect: 0.72 },
  naval:   { label: 'NAVAL STATION', side: [420, 540], aspect: 0.8 },
  depot:   { label: 'DEPOT', side: [420, 580], aspect: 0.78 },
  proving: { label: 'PROVING GROUND', side: [600, 720], aspect: 0.75 },
};

// ---- shapes: what a branch builds (counts and sizes; world/citygen/milbase.js reads every number here) --------------------
//   barracks   [quads, per quad]: barracks blocks round a parade square; housing: [rows, cols] of family houses
//   motor      motor pools: shops, and the apron's rows x cols of dead vehicles (wrecks of OUR bodies: systems/wrecks.js)
//   hangars    quonset hangars along the runway; runway [length share of the side, width]; tower: a control tower
//   piers      [count, length, width] on the harbour edge; drydock [w, d]; warehouses: count
//   igloos     [rows, per row] earth-covered magazines; ranges: firing ranges (berms and target frames)
//   fuel       tanks in the fuel farm (each inside a berm)
export const MB_SHAPES = {
  army:  { barracks: [2, 4], housing: [2, 4], motor: { shops: 2, rows: 3, cols: 6 }, ranges: 2, fuel: 3, warehouses: 1 },
  air:   { barracks: [1, 4], housing: [2, 3], motor: { shops: 1, rows: 2, cols: 6 }, hangars: 4, runway: [0.86, 40], tower: true, fuel: 4, warehouses: 1 },
  naval: { barracks: [1, 4], housing: [1, 4], motor: { shops: 1, rows: 2, cols: 5 }, piers: [4, 110, 14], drydock: [36, 120], warehouses: 4, fuel: 3 },
  depot: { barracks: [1, 2], housing: [0, 0], motor: { shops: 1, rows: 2, cols: 5 }, igloos: [5, 7], warehouses: 3, fuel: 2 },
};

// What a dead military vehicle in the motor pool is (VEHICLES rows) and what happened to it (data/wrecks.js states).
export const MB_MOTOR = { types: { patrol: 4, apc: 2, pickup: 2, van: 1 }, states: { rusted: 4, stripped: 3, burned: 2 }, paints: [2, 5, 6], gap: [9.5, 6.5],
  // [len, wid, tall] of each type's VEHICLES row (the collider a dead one stands in; the selftest checks they still agree)
  sizes: { patrol: [4.9, 2.3, 2.05], apc: [7.0, 2.85, 2.6], pickup: [5.0, 2.2, 1.95], van: [5.4, 2.25, 2.1] } };

// ---- the rules (metres, seconds) ---------------------------------------------------------------------------------------
//   fence      outer and inner chain-link (see-through: sight and rounds pass, walkers and cars do not), `inset` apart; gate
//              width; a tower every `towerEvery` m along the outer run plus the corners
//   approach   each gate's road runs `len` m out; checkpoints at `checks` m out (a jersey-barrier chicane and a booth)
//   garrison   a held base: soldiers per gate, per tower (at its foot, watching out), on the perimeter patrol and in the yard
//   horde      an overrun base: infected inside, sprinter share, and the relay: one that heard a noise moans, and those
//              within `relay` m hear it after `relayDelay` s (law 6: they heard it; that is all they know)
//   sealed     the puzzle: the generator takes `fuel` fuel cans (E with one in your pack); the code is on the duty log in the
//              command post; the blast door wants both
export const MB_RULES = {
  fence: { inset: 10, h: 3.0, gate: 14, towerEvery: 170, tower: 3.4, towerH: 6.5 },
  approach: { len: 150, checks: [55, 115] },
  garrison: { gate: 2, tower: 1, patrol: 3, yard: 2, hp: 140, weapons: { rifle: 0.75, smg: 0.25 }, quartermaster: true },
  horde: { bodies: 34, sprinters: 0.15, relay: 38, relayDelay: [0.5, 1.4], hops: 6, clusters: 4 },
  sealed: { fuel: 1 },
  spacing: 12000, // never two planned bases nearer than this (m)
};

// The armory: the best loot in the world, rolled ONCE the first time a crate is opened, never refilled (law 2). The
// command post's safe and the hospital's stores, likewise. [item, weight, min, max] as data/items.js LOOT.
export const MB_LOOT = {
  mb_armory: { rolls: [3, 5], none: 0, rows: [['gun_rifle', 3, 1, 1], ['gun_auto', 2, 1, 1], ['gun_pump', 2, 1, 1], ['ammo_rifle', 6, 30, 90], ['ammo_shells', 3, 8, 24], ['ammo_smg', 3, 30, 90], ['cleaning_kit', 2, 1, 1], ['first_aid', 1, 1, 1]] },
  mb_hospital: { rolls: [2, 4], none: 1, rows: [['antibiotics', 3, 1, 3], ['first_aid', 3, 1, 1], ['suture_kit', 2, 1, 1], ['painkillers', 3, 1, 2], ['bandage', 4, 2, 6]] },
  mb_command: { rolls: [1, 3], none: 1, rows: [['road_atlas', 2, 1, 1], ['radio_portable', 2, 1, 1], ['wristwatch', 1, 1, 1], ['ammo_pistol', 2, 12, 36], ['gun_pistol', 1, 1, 1]] },
  mb_fuel: { rolls: [1, 2], none: 1, rows: [['fuel_can', 4, 1, 1], ['siphon_hose', 1, 1, 1], ['spark_plugs', 2, 1, 2]] },
  mb_qm: { rolls: [3, 5], none: 0, rows: [['ammo_rifle', 4, 30, 60], ['ammo_pistol', 3, 12, 36], ['ration', 4, 2, 4], ['canteen', 2, 1, 1], ['bandage', 3, 2, 4], ['gun_rifle', 1, 1, 1], ['ruck', 1, 1, 1]] },
};

// The quartermaster's counter (data/trade.js TRADERS shape; systems/milbases.js registers it).
export const MB_TRADER = { id: 'mb_quartermaster', name: 'Quartermaster', deals: ['gun', 'ammo', 'food', 'water', 'med', 'pack'] };

// What the garrison says ({base} is the base's name).
export const MB_LINES = {
  warn: 'Restricted installation. You have one chance to turn around.',
  cleared: 'You check out. Keep your weapon down inside the wire.',
  returned: 'You were told once.',
  alarm: 'Contact! Open fire!',
  qm: 'Quartermaster. I trade what the garrison can spare. Nothing from the armory.',
  log: 'DUTY LOG · {base}. Generator on the bunker apron runs dry, fuel it before you try the door. Blast door code {code}. Burn this page.',
};

// ---- the projection ------------------------------------------------------------------------------------------------------
const ANCHORS = (() => {
  const pts = [];
  for (const S of ATLAS_SITES) { const v = ATLAS_XZ.sites?.[S.id]; if (v && !v[2]) pts.push([S.lat, S.lon, v[0], v[1]]); }
  for (const B of ATLAS_BASES) { const v = ATLAS_XZ.bases?.[B.id]; if (v && !v[2]) pts.push([B.lat, B.lon, v[0], v[1]]); }
  return pts;
})();
// lat/lon -> [x, z] world metres: a weighted least-squares affine through the k nearest projected atlas points.
export function projectLL(lat, lon, k = 8) {
  const c = Math.cos((lat * Math.PI) / 180);
  const near = ANCHORS.map((p) => [p, Math.hypot(p[0] - lat, (p[1] - lon) * c)]).sort((a, b) => a[1] - b[1]).slice(0, k);
  const fit = (col) => {
    const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (const [p, d] of near) { const w = 1 / (d * d + 0.05), r = [1, p[1] - lon, p[0] - lat]; for (let i = 0; i < 3; i++) { M[i][3] += w * r[i] * p[col]; for (let j = 0; j < 3; j++) M[i][j] += w * r[i] * r[j]; } }
    for (let q = 0; q < 3; q++) {
      let pv = q; for (let r = q + 1; r < 3; r++) if (Math.abs(M[r][q]) > Math.abs(M[pv][q])) pv = r;
      [M[q], M[pv]] = [M[pv], M[q]];
      for (let r = 0; r < 3; r++) if (r !== q) { const f = M[r][q] / M[q][q]; for (let s = q; s < 4; s++) M[r][s] -= f * M[q][s]; }
    }
    return M[0][3] / M[0][0];
  };
  return [Math.round(fit(2)), Math.round(fit(3))];
}

// The built side of a base: the real area folded by the road law, held to its class's range (m).
export function builtSide(area_km2, cls) {
  const C = MB_CLASSES[cls], side = Math.sqrt((area_km2 * 1e6) / (FOOTPRINT.S * FOOTPRINT.S));
  const w = Math.round(Math.min(C.side[1], Math.max(C.side[0], side)) / 10) * 10;
  return [w, Math.round((w * C.aspect) / 10) * 10];
}

// ---- the rows -----------------------------------------------------------------------------------------------------------
// R(state, id, name, lat, lon, area_km2, class, shape, status, holder, extra)
//   status   held | overrun | sealed; holder: a data/society.js faction (remnant, dustwolves; the only ones that walk the
//            drivable world today), 'ruler' (the state's ruler) or 'contested' (planned rows: they wait for those factions),
//            'infected' for an overrun base, null for a sealed one
//   extra    state: true = the state's one large base (the atlas row of the same id); big: true = one of the big ones by
//            real footprint, or one the drivable world reaches; drive: 'arizona' | 'florida' (built today)
const R = (state, id, name, lat, lon, area_km2, cls, shape, status, holder, extra = {}) =>
  ({ state, id, name, lat, lon, area_km2, cls, shape, status, holder, ...extra });

export const MILBASES = [
  // ---- the fifty: one large base per state (the atlas's own rows: data/atlas.js ATLAS_BASES) ----
  R('AL', 'redstone', 'REDSTONE ARSENAL', 34.6842, -86.654, 147.6, 'fort', 'army', 'held', 'ruler', { atlas: true }),
  R('AK', 'jber', 'JOINT BASE ELMENDORF-RICHARDSON', 61.2514, -149.8064, 259, 'airbase', 'air', 'sealed', null, { atlas: true }),
  // The Remnant holds the boneyard in the drivable world today (the atlas gives it to the state's ruler, who does not walk it yet).
  R('AZ', 'davis_monthan', 'DAVIS-MONTHAN AIR FORCE BASE', 32.1636, -110.8494, 43.56, 'airbase', 'air', 'held', 'remnant', { atlas: true, drive: 'arizona' }),
  R('AR', 'pine_bluff', 'PINE BLUFF ARSENAL', 34.3325, -92.0867, 54.6, 'depot', 'depot', 'overrun', 'infected', { atlas: true }),
  R('CA', 'fort_irwin', 'FORT IRWIN NATIONAL TRAINING CENTER', 35.2464, -116.6819, 2579.77, 'proving', 'army', 'held', 'dustwolves', { atlas: true }),
  R('CO', 'cheyenne_mountain', 'CHEYENNE MOUNTAIN COMPLEX', 38.7425, -104.8483, 0.0206, 'depot', 'depot', 'sealed', null, { atlas: true }),
  R('CT', 'subase_new_london', 'NAVAL SUBMARINE BASE NEW LONDON', 41.398, -72.087, 2.78, 'naval', 'naval', 'held', 'ruler', { atlas: true }),
  R('DE', 'dover', 'DOVER AIR FORCE BASE', 39.1283, -75.4647, 15.78, 'airbase', 'air', 'held', 'remnant', { atlas: true }),
  R('FL', 'eglin', 'EGLIN AIR FORCE BASE', 30.4894, -86.5422, 1874.2, 'airbase', 'air', 'held', 'contested', { atlas: true }),
  R('GA', 'fort_benning', 'FORT BENNING', 32.3661, -84.9692, 736.5, 'fort', 'army', 'overrun', 'infected', { atlas: true }),
  R('HI', 'pearl_harbor', 'JOINT BASE PEARL HARBOR-HICKAM', 21.3489, -157.9436, 113.3, 'naval', 'naval', 'held', 'contested', { atlas: true }),
  R('ID', 'mountain_home', 'MOUNTAIN HOME AIR FORCE BASE', 43.04, -115.87, 25.6, 'airbase', 'air', 'held', 'ruler', { atlas: true }),
  R('IL', 'rock_island', 'ROCK ISLAND ARSENAL', 41.5169, -90.5419, 3.83, 'depot', 'depot', 'held', 'dustwolves', { atlas: true }),
  R('IN', 'crane', 'NAVAL SUPPORT ACTIVITY CRANE', 38.8701, -86.8344, 250.9, 'depot', 'depot', 'held', 'ruler', { atlas: true }),
  R('IA', 'iowa_aap', 'IOWA ARMY AMMUNITION PLANT', 40.7906, -91.2447, 76.9, 'depot', 'depot', 'sealed', null, { atlas: true }),
  R('KS', 'fort_leavenworth', 'FORT LEAVENWORTH', 39.355, -94.9211, 22.7, 'fort', 'army', 'sealed', null, { atlas: true }),
  R('KY', 'fort_knox', 'FORT KNOX', 37.9, -85.95, 440, 'fort', 'army', 'held', 'ruler', { atlas: true }),
  R('LA', 'fort_polk', 'FORT POLK', 31.0726, -93.0806, 801.3, 'fort', 'army', 'overrun', 'infected', { atlas: true }),
  R('ME', 'portsmouth_nsy', 'PORTSMOUTH NAVAL SHIPYARD', 43.0789, -70.7342, 1.125, 'naval', 'naval', 'held', 'ruler', { atlas: true }),
  R('MD', 'fort_meade', 'FORT GEORGE G. MEADE', 39.1069, -76.7431, 20.5, 'fort', 'army', 'held', 'contested', { atlas: true }),
  R('MA', 'jb_cape_cod', 'JOINT BASE CAPE COD', 41.7042, -70.5417, 89, 'fort', 'army', 'held', 'remnant', { atlas: true }),
  R('MI', 'camp_grayling', 'CAMP GRAYLING', 44.6344, -84.7725, 594.9, 'fort', 'army', 'held', 'ruler', { atlas: true }),
  R('MN', 'camp_ripley', 'CAMP RIPLEY', 46.0759, -94.3474, 214.5, 'fort', 'army', 'held', 'ruler', { atlas: true }),
  R('MS', 'camp_shelby', 'CAMP SHELBY', 31.1878, -89.1992, 525, 'fort', 'army', 'sealed', null, { atlas: true }),
  R('MO', 'fort_leonard_wood', 'FORT LEONARD WOOD', 37.7725, -92.1139, 252.8, 'fort', 'army', 'held', 'remnant', { atlas: true }),
  R('MT', 'malmstrom', 'MALMSTROM AIR FORCE BASE', 47.5047, -111.1872, 13.5, 'airbase', 'air', 'held', 'ruler', { atlas: true }),
  R('NE', 'offutt', 'OFFUTT AIR FORCE BASE', 41.1194, -95.9086, 11.3, 'airbase', 'air', 'held', 'remnant', { atlas: true }),
  R('NV', 'nellis', 'NELLIS AIR FORCE BASE', 36.2362, -115.0343, 45.7, 'airbase', 'air', 'held', 'dustwolves', { atlas: true }),
  R('NH', 'pease', 'PEASE AIR NATIONAL GUARD BASE', 43.0781, -70.8233, 0.89, 'airbase', 'air', 'sealed', null, { atlas: true }),
  R('NJ', 'jb_mdl', 'JOINT BASE MCGUIRE-DIX-LAKEHURST', 40.0156, -74.5917, 170, 'airbase', 'air', 'held', 'remnant', { atlas: true }),
  R('NM', 'white_sands', 'WHITE SANDS MISSILE RANGE', 32.3356, -106.4058, 8300, 'proving', 'army', 'held', 'ruler', { atlas: true }),
  R('NY', 'fort_drum', 'FORT DRUM', 44.0542, -75.7869, 434.09, 'fort', 'army', 'held', 'remnant', { atlas: true }),
  R('NC', 'fort_bragg', 'FORT BRAGG', 35.1392, -78.9992, 650, 'fort', 'army', 'held', 'ruler', { atlas: true }),
  R('ND', 'minot', 'MINOT AIR FORCE BASE', 48.4158, -101.3581, 20, 'airbase', 'air', 'held', 'ruler', { atlas: true }),
  R('OH', 'wright_patterson', 'WRIGHT-PATTERSON AIR FORCE BASE', 39.8231, -84.0494, 25.9, 'airbase', 'air', 'held', 'ruler', { atlas: true }),
  R('OK', 'fort_sill', 'FORT SILL', 34.6711, -98.3897, 380.4, 'fort', 'army', 'held', 'ruler', { atlas: true }),
  R('OR', 'umatilla', 'UMATILLA CHEMICAL DEPOT', 45.8431, -119.4381, 69.4, 'depot', 'depot', 'overrun', 'infected', { atlas: true }),
  R('PA', 'fort_indiantown_gap', 'FORT INDIANTOWN GAP', 40.437, -76.5761, 73, 'fort', 'army', 'held', 'remnant', { atlas: true }),
  R('RI', 'ns_newport', 'NAVAL STATION NEWPORT', 41.5222, -71.3089, 4.3, 'naval', 'naval', 'held', 'dustwolves', { atlas: true }),
  R('SC', 'fort_jackson', 'FORT JACKSON', 34.0392, -80.8222, 210.4, 'fort', 'army', 'held', 'ruler', { atlas: true }),
  R('SD', 'ellsworth', 'ELLSWORTH AIR FORCE BASE', 44.1464, -103.0747, 19.66, 'airbase', 'air', 'held', 'dustwolves', { atlas: true }),
  R('TN', 'fort_campbell', 'FORT CAMPBELL', 36.65, -87.4667, 414, 'fort', 'army', 'overrun', 'infected', { atlas: true }),
  R('TX', 'fort_hood', 'FORT HOOD', 31.1397, -97.7658, 866, 'fort', 'army', 'held', 'ruler', { atlas: true }),
  R('UT', 'dugway', 'DUGWAY PROVING GROUND', 40.2208, -112.7442, 3243.58, 'proving', 'army', 'overrun', 'infected', { atlas: true }),
  R('VT', 'camp_ethan_allen', 'CAMP ETHAN ALLEN TRAINING SITE', 44.4796, -72.9508, 45.4, 'fort', 'army', 'held', 'ruler', { atlas: true }),
  R('VA', 'ns_norfolk', 'NAVAL STATION NORFOLK', 36.945, -76.3131, 13.76, 'naval', 'naval', 'held', 'dustwolves', { atlas: true }),
  R('WA', 'yakima_tc', 'YAKIMA TRAINING CENTER', 46.7611, -120.1914, 1323.3, 'fort', 'army', 'sealed', null, { atlas: true }),
  R('WV', 'camp_dawson', 'CAMP DAWSON', 39.4453, -79.67, 16.906, 'fort', 'army', 'held', 'ruler', { atlas: true }),
  R('WI', 'fort_mccoy', 'FORT MCCOY', 44.0097, -90.6833, 242.8, 'fort', 'army', 'overrun', 'infected', { atlas: true }),
  R('WY', 'fe_warren', 'FRANCIS E. WARREN AIR FORCE BASE', 41.1331, -104.8669, 13, 'airbase', 'air', 'held', 'ruler', { atlas: true }),

  // ---- the big ones the drivable world reaches today (real installations, real points and areas) ----
  R('AZ', 'yuma_pg', 'YUMA PROVING GROUND', 32.8456, -114.3997, 3367, 'proving', 'army', 'overrun', 'infected', { big: true, drive: 'arizona' }),
  R('AZ', 'fort_huachuca', 'FORT HUACHUCA', 31.5547, -110.35, 296.5, 'fort', 'army', 'held', 'dustwolves', { big: true, drive: 'arizona' }),
  R('AZ', 'navajo_depot', 'NAVAJO ARMY DEPOT', 35.2216, -111.8277, 114.7, 'depot', 'depot', 'sealed', null, { big: true, drive: 'arizona' }),
  R('FL', 'nas_jacksonville', 'NAVAL AIR STATION JACKSONVILLE', 30.2358, -81.6806, 15.8, 'naval', 'naval', 'overrun', 'infected', { big: true, drive: 'florida' }),
  R('FL', 'camp_blanding', 'CAMP BLANDING', 29.9516, -81.9784, 295, 'fort', 'army', 'held', 'remnant', { big: true, drive: 'florida' }),
  R('FL', 'avon_park', 'AVON PARK AIR FORCE RANGE', 27.6464, -81.3214, 429, 'airbase', 'air', 'sealed', null, { big: true, drive: 'florida' }),
];

// Derived per row (pure): world x/z, built size, the atlas row it stands for.
for (const M of MILBASES) {
  const v = M.atlas ? ATLAS_XZ.bases?.[M.id] : null;
  M.xz = v ? [v[0], v[1]] : M.state === 'AK' || M.state === 'HI' ? null : projectLL(M.lat, M.lon);
  M.size = builtSide(M.area_km2, M.cls);
}
export const MILBASES_BY_ID = new Map(MILBASES.map((M) => [M.id, M]));

// ---- the World Forge's check (and the selftest's) -------------------------------------------------------------------------
// factions: data/society.js FACTIONS (a held drivable base's holder must walk the world). Returns a list of problems.
export const MB_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
export function validateMilbases(rows = MILBASES, factions = null) {
  const bad = [], ids = new Set(), perState = {};
  const atlas = new Map(ATLAS_BASES.map((B) => [B.id, B]));
  for (const M of rows) {
    if (!M.id || ids.has(M.id)) bad.push(`${M.id}: missing or duplicate id`);
    ids.add(M.id);
    if (!MB_STATES.includes(M.state)) bad.push(`${M.id}: no state ${M.state}`);
    if (!(M.lat > 18 && M.lat < 72 && M.lon > -170 && M.lon < -65)) bad.push(`${M.id}: lat/lon ${M.lat},${M.lon} not in the United States`);
    if (!(M.area_km2 > 0)) bad.push(`${M.id}: area`);
    if (!MB_CLASSES[M.cls]) bad.push(`${M.id}: no class ${M.cls}`);
    if (!MB_SHAPES[M.shape]) bad.push(`${M.id}: no shape ${M.shape}`);
    if (!['held', 'overrun', 'sealed'].includes(M.status)) bad.push(`${M.id}: status ${M.status}`);
    if (M.status === 'held' && !(M.holder === 'ruler' || M.holder === 'contested' || !factions || factions[M.holder])) bad.push(`${M.id}: holder ${M.holder} is not a faction`);
    if (M.status === 'held' && !M.holder) bad.push(`${M.id}: a held base needs a holder`);
    if (M.status === 'held' && M.drive && (M.holder === 'ruler' || M.holder === 'contested')) bad.push(`${M.id}: a drivable held base needs a faction that walks the world (${M.holder})`);
    if (M.status === 'overrun' && M.holder !== 'infected') bad.push(`${M.id}: an overrun base is the infected's`);
    if (M.status === 'sealed' && M.holder) bad.push(`${M.id}: a sealed base has nobody home`);
    if (M.atlas) {
      perState[M.state] = (perState[M.state] ?? 0) + 1;
      const A = atlas.get(M.id);
      if (!A) bad.push(`${M.id}: no atlas row`);
      else {
        if (A.state !== M.state) bad.push(`${M.id}: atlas says ${A.state}`);
        if (Math.abs(A.lat - M.lat) > 0.01 || Math.abs(A.lon - M.lon) > 0.01) bad.push(`${M.id}: lat/lon disagree with the atlas`);
        if (Math.abs(A.area_km2 - M.area_km2) > 0.5) bad.push(`${M.id}: area disagrees with the atlas`);
      }
    } else if (!M.big) bad.push(`${M.id}: neither a state row (atlas) nor a big one`);
    if (M.drive && !M.xz) bad.push(`${M.id}: drivable but off the grid`);
    const [w, d] = M.size ?? [];
    if (!(w >= 400 && w <= 760 && d >= 300 && d <= 600)) bad.push(`${M.id}: built size ${w}x${d} out of range`);
  }
  for (const s of MB_STATES) if (perState[s] !== 1) bad.push(`state ${s}: ${perState[s] ?? 0} state rows (one each)`);
  const drive = rows.filter((M) => M.drive);
  for (const sh of Object.keys(MB_SHAPES)) if (!drive.some((M) => M.shape === sh)) bad.push(`no drivable ${sh} base`);
  for (const st of ['held', 'overrun', 'sealed']) if (!drive.some((M) => M.status === st)) bad.push(`no drivable ${st} base`);
  for (const [k, T] of Object.entries(MB_LOOT)) if (!T.rows.length) bad.push(`loot ${k}: empty`);
  return bad;
}
