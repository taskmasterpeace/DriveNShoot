// OPEN COUNTRY TERRAIN v1 (2026-10-03): the shape of the ground under the open country. Pure data + pure functions (no DOM, no THREE, no storage, no Math.random).
//
//   terrainAtCell(ci, ck, { seed, region })      height in metres at a point of the plane (cell coordinates: cell (i, k) spans i +- .5, k +- .5)
//   terrainAtLatLon(lat, lon, { seed })          the same, by place
//   terrainField(i, k, { seed, n })              one World Cell: an n x n height grid (shared edge samples), its relief class and slope, lakes, rivers, craters, the sea
//
// A HEIGHT IS A FUNCTION OF POSITION. It reads (seed, position) and a lattice of REGION PROFILES, nothing else: not the cell, not its kind, not a neighbour's output.
// So the terrain is continuous across every cell border (two cells sample the SAME points on their shared edge: bit-identical), and editing a cell (forcing its
// kind, rerolling its seed) cannot move a single sample: the locality law of open-country.js, kept. The open-country cell READS the field (trees stay off steep rock
// and above the treeline, a lake is a lake, mountain cells sit on mountains); the field never reads the cell.
//
// THE IDEA (taken from how a classic open-world generator builds land: terrain STAMPS blended through a biome map; nothing is copied). Stamps are CLASSES of landform:
//   plains · hills · mountains · mesa (the desert mountains: terraced, flat-topped) · ranges (basin and range: long ridges, flat basins) · plateau · dunes · canyon · crater · lake · river · the coast ("land border")
// A stamp here is a procedural kernel of the world position instead of a bitmap, so it has no tile seams and no resolution. WHICH stamps a place gets comes from the REGION
// (regions.js): its relief kind and amplitude, its base elevation, how much lake / river / crater / canyon it holds. Region profiles sit on a lattice (every 48 cells, 12 km) and
// are blended smoothly between nodes, so the Rockies climb out of the High Plains over ~12 km instead of stepping, and the Everglades lie down into the Gulf.
//   plains / hills / mountains: value-noise fbm, ridged multifractal (domain-warped, in massifs) for the high country
//   features (lake, crater): one per 6 km (lake) / 10 km (crater) supercell at most, position and size hashed from the supercell: bounded footprints, no neighbour reads
//   river: the zero set of a low-frequency noise (a winding line that wanders, branches and closes, like a drainage net); the valley is cut along it
//   canyon: the same trick on another noise, gated into provinces, with terraced walls
//   coast: the real borders.js shoreline: the land falls to sea level at the beach and the sea goes down to a shelf
//
// UNITS: heights are METRES above sea level; positions in cell coordinates (a cell is 255.36 m) or cell-local u (1344 per cell, 0.19 m each, x east, z south, +-672).
// LOD: `lod` = the shortest wavelength (m) worth evaluating; a map drawn 500 m per pixel passes 1000 and skips the octaves it could not show.
import { CELL_UNITS, METRES_PER_UNIT } from './world-scale.js';
import { worldFromLatLon } from './world-address.js';
import { fnv } from './road-kit.js';
import { ECOTYPES, LAB_REGION, cellLatLon, regionAt, coastInfo, landAt } from './regions.js';

export const TERRAIN_VERSION = 1;
export const CELL_M = CELL_UNITS * METRES_PER_UNIT;   // 255.36
export const NODE_CELLS = 48;                        // region profiles sit every 48 cells (12.3 km)
export const BASE_NODE_CELLS = 240;                  // base elevation is blended over a wider lattice (61 km): the plains rise to the Rockies over a hundred km, not at a border
const HALF = CELL_UNITS / 2, LAKE_SC = 24, CRATER_SC = 40;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, ss = t => (t = clamp(t, 0, 1), t * t * (3 - 2 * t));
const r2 = v => { const x = Math.round(v * 100) / 100; return x === 0 ? 0 : x; };

// ---- noise (value noise, integer hashed: deterministic everywhere) ---------------------------------------------------------------------------------------
const imix = h => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
const hv = (s, a, b, t) => imix(imix((s ^ Math.imul(t, 0x9e3779b1)) | 0) ^ Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1)) / 4294967296;
const vn = (s, t, x, z) => { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fz * fz * fz * (fz * (fz * 6 - 15) + 10); const a = hv(s, ix, iz, t), b = hv(s, ix + 1, iz, t), c = hv(s, ix, iz + 1, t), d = hv(s, ix + 1, iz + 1, t); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
/** fbm in [0, 1] around 0.5: `oct` octaves from wavelength `lam` (m), each rotated; octaves finer than `lod` are skipped. */
function fbm(s, t, X, Z, lam, oct, lod) {
  let sum = 0, amp = 1, tot = 0, w = lam, ang = t * 1.7;
  for (let o = 0; o < oct; o++) { if (w < lod) break; const c = Math.cos(ang), sn = Math.sin(ang); sum += amp * vn(s, t * 8 + o, (X * c - Z * sn) / w, (X * sn + Z * c) / w); tot += amp; amp *= .5; w *= .48; ang += 1.3; }
  return tot ? sum / tot : .5;
}
const seedInt = s => (typeof s === 'number' && Number.isInteger(s) ? s >>> 0 : fnv(String(s)));

// ---- region -> profile ---------------------------------------------------------------------------------------------------------------------------------
// profile vector indices
const BASE = 0, AMP = 1, PLAINS = 2, HILLS = 3, MOUNTAINS = 4, MESA = 5, RANGES = 6, PLATEAU = 7, DUNES = 8, LAKE = 9, RIVER = 10, CRATER = 11, CANYON = 12, COASTSLOPE = 13, NPROF = 14;
/** What each relief kind (regions.js ECOTYPES[...].relief.kind) is made of, as stamp weights. */
export const RELIEF_STAMPS = Object.freeze({
  flat: { plains: 1 }, rolling: { plains: .5, hills: .5 }, hills: { hills: 1 }, mountains: { mountains: 1 }, mesa: { mesa: .75, hills: .25 }, 'basin-and-range': { ranges: 1 }, dunes: { dunes: 1 }, plateau: { plateau: 1, hills: .15 },
});
/** Base elevation (m above sea level) by ecotype: the mean of the ground before the stamps. */
const BASE_BY_ECO = Object.freeze({ desert: 700, erg: 400, 'high-desert': 1600, sagebrush: 1500, shortgrass: 1100, prairie: 350, steppe: 600, savanna: 800, chaparral: 250, 'oak-hills': 400, cornbelt: 280, wheatbelt: 600, 'orchard-valley': 60, plantation: 80, paddies: 30, 'mixed-farm': 150,
  appalachian: 700, piedmont: 200, flatwoods: 25, 'northern-forest': 350, taiga: 300, rainforest: 400, mountain: 2000, alpine: 3000, jungle: 150, 'monsoon-forest': 300, swamp: 5, bayou: 3, marsh: 5, everglades: 3, 'tidal-marsh': 2, bog: 120, floodplain: 40, mangrove: 1, tundra: 150, polar: 800 });
/** Named regions whose real elevation is far from their ecotype's default: [base m, amplitude m]. Authored from the real map; anything unlisted uses its ecotype. */
const REGION_ELEV = Object.freeze({
  'rocky-mountains': [2500, 1000], 'sierra-nevada': [2200, 950], cascades: [1500, 950], 'high-plains-short': [1250, 45], 'great-plains-tall': [420, 32], 'corn-belt': [260, 18], 'southwest-high-desert': [1900, 230], 'great-basin': [1700, 420], mojave: [850, 150], sonoran: [450, 120],
  chihuahuan: [1250, 130], 'columbia-plateau': [650, 95], 'california-central-valley': [60, 8], 'california-coast': [250, 210], 'texas-hill-country': [450, 75], 'south-texas-brush': [120, 25], 'texas-coastal-prairie': [15, 6], 'louisiana-bayou': [2, 2], atchafalaya: [3, 1.5],
  'mississippi-bottomland': [40, 6], everglades: [2, .8], 'big-cypress': [3, 1], okefenokee: [37, 1.2], 'florida-central': [30, 9], 'florida-southeast': [4, 2], appalachians: [650, 280], piedmont: [180, 55], 'southeast-coastal-plain': [40, 12], 'new-england': [250, 140], 'mid-atlantic': [90, 45],
  ozarks: [330, 115], 'northern-forest': [300, 60], 'alaska-southcentral': [900, 900], hawaii: [500, 750], 'canadian-rockies': [2000, 950], 'tibetan-plateau': [4600, 380], himalaya: [4800, 1600], alps: [2000, 1050], 'andes-central': [3800, 950], 'altiplano-andes': [3800, 160], 'andes-north': [2800, 950],
  'andes-south': [1800, 950], atlas: [1600, 750], 'ethiopian-highlands': [2300, 550], 'iranian-plateau': [1400, 260], 'anatolian-plateau': [1100, 210], gobi: [1250, 130], 'mongolian-steppe': [1400, 160], 'tian-shan': [3200, 950], ural: [500, 210], caucasus: [2000, 1050], pyrenees: [1600, 850],
  carpathians: [800, 420], 'nz-alps': [1600, 950], 'great-dividing-range': [800, 360], kalahari: [1000, 45], highveld: [1500, 85], drakensberg: [2300, 650], sahara: [400, 130], namib: [300, 95], 'rub-al-khali': [300, 85], 'arabian-desert': [600, 130], 'siberian-taiga': [350, 85],
  'west-siberian-bog': [90, 5], 'ukrainian-steppe': [150, 32], 'pripet-marshes': [150, 5], 'mesopotamian-marshes': [3, 1], mesopotamia: [30, 6], 'nile-valley': [60, 4], sudd: [380, 2], okavango: [950, 2], pantanal: [100, 2], amazon: [100, 15], 'tabasco-swamps': [8, 2], 'sierra-madre-occidental': [2000, 900],
  'sierra-madre-oriental': [1500, 800], altiplano: [1900, 120], 'volcanic-belt': [2200, 800], 'chiapas-highlands': [1500, 700], 'sichuan-basin': [450, 90], 'north-china-plain': [40, 12], 'yangtze-plain': [15, 10], 'indo-gangetic': [150, 8], thar: [180, 30], deccan: [650, 90], 'western-ghats': [900, 400],
  'tasmania': [500, 280], 'new-zealand': [350, 400], japan: [400, 450], korea: [300, 260], 'british-isles': [120, 90], 'scandinavian-mountains': [1100, 600], iceland: [450, 380], 'european-plain': [120, 35], 'po-valley': [60, 8], 'pannonian-plain': [110, 20],
});
/** How much lake / river / crater / canyon an ecotype holds: [lake, river, crater, canyon] (0..1). */
const FEATURES = Object.freeze({
  desert: [.02, .15, .03, .12], erg: [.01, .05, .02, 0], 'high-desert': [.03, .2, .04, .4], sagebrush: [.05, .25, .02, .1], shortgrass: [.08, .35, 0, .05], prairie: [.14, .5, 0, 0], steppe: [.1, .4, .01, .03], savanna: [.08, .5, 0, 0], chaparral: [.04, .3, 0, .05], 'oak-hills': [.06, .5, 0, .1],
  cornbelt: [.05, .55, 0, 0], wheatbelt: [.05, .4, 0, .03], 'orchard-valley': [.03, .6, 0, 0], plantation: [.1, .7, 0, 0], paddies: [.1, .8, 0, 0], 'mixed-farm': [.1, .6, 0, 0], appalachian: [.08, .7, 0, .02], piedmont: [.08, .6, 0, 0], flatwoods: [.15, .5, 0, 0], 'northern-forest': [.4, .7, 0, 0], taiga: [.45, .6, 0, 0],
  rainforest: [.12, .9, 0, 0], mountain: [.12, .6, .01, .12], alpine: [.2, .3, 0, .08], jungle: [.1, .9, 0, 0], 'monsoon-forest': [.1, .8, 0, 0], swamp: [.25, .8, 0, 0], bayou: [.2, .9, 0, 0], marsh: [.3, .7, 0, 0], everglades: [.12, .5, 0, 0], 'tidal-marsh': [.1, .6, 0, 0], bog: [.5, .4, 0, 0], floodplain: [.15, 1, 0, 0],
  mangrove: [.05, .6, 0, 0], tundra: [.6, .4, .02, 0], polar: [.1, .1, 0, 0],
});
const NODE_CACHE = new Map(), PROFILE_CACHE = new Map(), BASE_CACHE = new Map();
/** Open water: flat at sea level (nodes over the sea pull a shore down to the waterline). */
const SEA_PROFILE = (() => { const p = new Float64Array(NPROF); p[PLAINS] = 1; p[AMP] = 1; p[COASTSLOPE] = .02; return p; })();
/** Continentality: land far from any sea sits higher than the shore. A region derived from the climate sheet only knows its ecotype's default base, so near a coast that base is scaled down (an authored region states its own elevation and is never scaled). */
const contFactor = (lat, lon) => { const c = coastInfo(lat, lon, 320); return lerp(.12, 1, ss(((c ? c.km : 999) - 12) / 280)); };
/** Base elevation of the region on coarse lattice node (a, b). */
function baseNode(a, b) { const key = `${a},${b}`; let v = BASE_CACHE.get(key); if (v === undefined) { const ll = cellLatLon(a * BASE_NODE_CELLS, b * BASE_NODE_CELLS); if (!ll) v = profileOfRegion(LAB_REGION)[BASE]; else if (landAt(ll.lat, ll.lon) === null) v = 0; else { const reg = regionAt(ll.lat, ll.lon); v = profileOfRegion(reg)[BASE]; if (reg.source === 'derived') v *= contFactor(ll.lat, ll.lon); } BASE_CACHE.set(key, v); } return v; }
/** The profile vector of a region: [base m, amp m, stamp weights x7, lake, river, crater, canyon, coast slope]. */
export function profileOfRegion(region) {
  const key = region.id; let p = PROFILE_CACHE.get(key); if (p) return p;
  const eco = ECOTYPES[region.ecotype] || ECOTYPES.prairie, rel = region.relief || eco.relief || { kind: 'rolling', ampM: 30 }, re = REGION_ELEV[region.id], base = re ? re[0] : (BASE_BY_ECO[region.ecotype] ?? 300), amp = re ? re[1] : (rel.ampM ?? 30);
  const wts = RELIEF_STAMPS[rel.kind] || RELIEF_STAMPS.rolling, f = FEATURES[region.ecotype] || [.05, .4, 0, 0];
  p = new Float64Array(NPROF); p[BASE] = base; p[AMP] = amp; p[PLAINS] = wts.plains || 0; p[HILLS] = wts.hills || 0; p[MOUNTAINS] = wts.mountains || 0; p[MESA] = wts.mesa || 0; p[RANGES] = wts.ranges || 0; p[PLATEAU] = wts.plateau || 0; p[DUNES] = wts.dunes || 0;
  p[LAKE] = f[0]; p[RIVER] = f[1]; p[CRATER] = f[2]; p[CANYON] = f[3]; p[COASTSLOPE] = clamp(.012 + amp / 900, .012, .6);
  PROFILE_CACHE.set(key, p); return p;
}
/** The region profile on lattice node (a, b): the region at that cell, and whether the sea is within 40 km. */
function nodeOf(a, b) {
  const key = `${a},${b}`; let n = NODE_CACHE.get(key); if (n) return n;
  const ll = cellLatLon(a * NODE_CELLS, b * NODE_CELLS), sea = !!ll && landAt(ll.lat, ll.lon) === null, region = ll ? regionAt(ll.lat, ll.lon) : LAB_REGION, coast = ll ? coastInfo(ll.lat, ll.lon, 40) : null;
  let p = sea ? SEA_PROFILE : profileOfRegion(region);
  if (!sea && ll && region.source === 'derived') { const f = contFactor(ll.lat, ll.lon); if (f < .995) { p = Float64Array.from(p); p[BASE] *= f; } }
  n = { p, region, coast: coast ? coast.km : 99, lat: ll ? ll.lat : 0 }; NODE_CACHE.set(key, n); return n;
}
/** Smoothly blended profile at a point (cell coordinates): bilinear (smoothstep) between the four lattice nodes. `out` is reused. */
function blendedProfile(ctx, ci, ck, out) {
  if (ctx.fixed) { out.set(ctx.fixed); return { coastNear: ctx.coastNear, lat: ctx.lat }; }
  const a = Math.floor(ci / NODE_CELLS), b = Math.floor(ck / NODE_CELLS), fx = ss(ci / NODE_CELLS - a), fz = ss(ck / NODE_CELLS - b), n00 = nodeOf(a, b), n10 = nodeOf(a + 1, b), n01 = nodeOf(a, b + 1), n11 = nodeOf(a + 1, b + 1);
  const w00 = (1 - fx) * (1 - fz), w10 = fx * (1 - fz), w01 = (1 - fx) * fz, w11 = fx * fz;
  for (let q = 0; q < NPROF; q++) out[q] = n00.p[q] * w00 + n10.p[q] * w10 + n01.p[q] * w01 + n11.p[q] * w11;
  { const A = Math.floor(ci / BASE_NODE_CELLS), Bz = Math.floor(ck / BASE_NODE_CELLS), gx = ss(ci / BASE_NODE_CELLS - A), gz = ss(ck / BASE_NODE_CELLS - Bz), coarse = baseNode(A, Bz) * (1 - gx) * (1 - gz) + baseNode(A + 1, Bz) * gx * (1 - gz) + baseNode(A, Bz + 1) * (1 - gx) * gz + baseNode(A + 1, Bz + 1) * gx * gz, low = 1 - ss((out[BASE] - 60) / 120); out[BASE] = out[BASE] * low + coarse * (1 - low); }
  return { coastNear: Math.min(n00.coast, n10.coast, n01.coast, n11.coast) < 27, lat: n00.lat * w00 + n10.lat * w10 + n01.lat * w01 + n11.lat * w11, region: (w00 >= w10 && w00 >= w01 && w00 >= w11 ? n00 : w10 >= w01 && w10 >= w11 ? n10 : w01 >= w11 ? n01 : n11).region };
}

// ---- the stamps ---------------------------------------------------------------------------------------------------------------------------------------------
/** The stamp classes, as data (the lab legend and the test read it). `s` = dimensionless height range before the region's amplitude scales it. */
export const STAMPS = Object.freeze({
  plains: { label: 'Plains', note: 'long low swells with a fine texture', s: [-.5, .5] },
  hills: { label: 'Hills', note: 'rolling fbm on a 3 km wavelength, rounded', s: [-1, 1] },
  mountains: { label: 'Mountains', note: 'domain-warped ridged multifractal in massifs', s: [-.15, .85] },
  mesa: { label: 'Mesa (desert mountains)', note: 'terraced shelves with steep risers: flat-topped buttes and benches', s: [-.7, .9] },
  ranges: { label: 'Basin and range', note: 'long NNW ridges standing out of flat basins', s: [-.1, .9] },
  plateau: { label: 'Plateau', note: 'a high flat top with eroded margins', s: [-.3, .6] },
  dunes: { label: 'Dunes', note: 'sawtooth crests with a gentle windward face', s: [-.3, .7] },
  canyon: { label: 'Canyon', note: 'incised along a noise zero set, in provinces, with terraced walls', s: [-1, 0] },
  crater: { label: 'Crater', note: 'bowl and raised rim, one per 10 km supercell at most', s: [-.5, .2] },
  lake: { label: 'Lake', note: 'a flat-floored basin, one per 6 km supercell at most', s: [-.3, 0] },
  river: { label: 'River', note: 'a valley cut along the zero set of a drainage noise', s: [-.5, 0] },
  coast: { label: 'Coast (land border)', note: 'the land falls to sea level at the real shoreline; the sea shelves away', s: [-1, 0] },
});
function stampValue(ctx, X, Z, P, lod, id) {
  const sd = ctx.sd;
  switch (id) {
    case PLAINS: return (fbm(sd, 1, X, Z, 5200, 3, lod) - .5) * 2.2 + (fbm(sd, 2, X, Z, 700, 3, lod) - .5) * .7;
    case HILLS: { const wx = X + 900 * (fbm(sd, 3, X, Z, 7000, 2, lod) - .5), wz = Z + 900 * (fbm(sd, 4, X + 77, Z, 7000, 2, lod) - .5); return (fbm(sd, 5, wx, wz, 3200, 5, lod) - .5) * 3.6 + (fbm(sd, 6, X, Z, 14000, 2, lod) - .5) * 1.6; }
    case MOUNTAINS: {
      const wx = X + 1600 * (fbm(sd, 7, X, Z, 9000, 2, lod) - .5) * 2, wz = Z + 1600 * (fbm(sd, 8, X + 31, Z + 17, 9000, 2, lod) - .5) * 2; let r = 0, a = 1, tot = 0, lam = 9500;
      for (let o = 0; o < 5; o++) { if (lam < lod) break; const n = vn(sd, 60 + o, wx / lam + o * .37, wz / lam - o * .21), rid = 1 - Math.abs(2 * n - 1); r += a * rid * rid; tot += a; a *= .5; lam /= 2.1; }
      const massif = ss((fbm(sd, 9, X, Z, 26000, 2, lod) - .22) / .45); return massif * (.1 + .9 * (tot ? r / tot : 0)) - .15 + (fbm(sd, 22, X, Z, 1700, 3, lod) - .5) * .5 * massif;
    }
    case MESA: { const t = clamp(.5 + (fbm(sd, 10, X, Z, 4200, 4, lod) - .5) * 3.2, 0, 1), q = t * 6, fl = Math.floor(q), fr = q - fl; return ((fl + ss((fr - .55) / .45)) / 6 - .45) * 1.3 + (fbm(sd, 11, X, Z, 600, 2, lod) - .5) * .06; }
    case RANGES: { const th = -.35, c = Math.cos(th), s = Math.sin(th), u = X * c + Z * s, v = -X * s + Z * c; let r = 0, a = 1, tot = 0, lu = 17000, lv = 3600; for (let o = 0; o < 3; o++) { if (lv < lod) break; const n = vn(sd, 70 + o, u / lu, v / lv), rid = 1 - Math.abs(2 * n - 1); r += a * rid * rid; tot += a; a *= .5; lu /= 2.2; lv /= 2.2; } const mask = ss((fbm(sd, 12, X, Z, 24000, 2, lod) - .35) / .3); return mask * (tot ? r / tot : 0) - .1 + (fbm(sd, 13, X, Z, 800, 2, lod) - .5) * .05; }
    case PLATEAU: { const p = ss((fbm(sd, 14, X, Z, 18000, 3, lod) - .48) / .06); return p * (.55 + (fbm(sd, 15, X, Z, 1200, 3, lod) - .5) * .1) + (1 - p) * (-.2 + (fbm(sd, 16, X, Z, 2600, 3, lod) - .5) * .3); }
    case DUNES: { const th = .6, lam = 520; if (lam < lod * .5) return (fbm(sd, 19, X, Z, 5000, 2, lod) - .5) * .3; const ph = (X * Math.cos(th) + Z * Math.sin(th)) / lam + 6 * (fbm(sd, 20, X, Z, 2600, 3, lod) - .5) + 3 * (fbm(sd, 23, X, Z, 9000, 2, lod) - .5), f = ph - Math.floor(ph), saw = f < .7 ? f / .7 : (1 - f) / .3, env = .3 + .7 * clamp(.5 + (fbm(sd, 21, X, Z, 5200, 2, lod) - .5) * 3, 0, 1); return (ss(saw) * env - .3) * .5; }
    default: return 0;
  }
}

// ---- features: lakes and craters (supercell lattices), rivers and canyons (zero sets) -------------------------------------------------------------------------
const featCache = new Map();
/** The lake of supercell (a, b) in metres: { x, z, R (radius), rot, ecc, depth, g0 (surface m) } or null. Position and size hashed from the supercell; g0 read from the ground there. */
function lakeOf(ctx, a, b, idx = 0) {
  const key = `L${ctx.sd}|${ctx.fixedId || ''}|${a},${b},${idx}`; let f = featCache.get(key); if (f !== undefined) return f;
  const sd = ctx.sd, SC = LAKE_SC * CELL_M, t = idx * 17, cx = (a + .1 + .8 * hv(sd, a, b, 301 + t)) * LAKE_SC, cz = (b + .1 + .8 * hv(sd, a, b, 302 + t)) * LAKE_SC, P = new Float64Array(NPROF), info = blendedProfile(ctx, cx, cz, P);
  const p = P[LAKE], chance = p * [1.2, .9, .7, .5][idx] * (p > .3 ? 1.5 : 1);
  if (hv(sd, a, b, 303 + t) >= chance || info.coastNear && ctxCoastCheck(ctx, cx, cz)) { f = null; }
  else {
    const Rmax = lerp(520, 1900, clamp(p * 1.4, 0, 1)) * (P[AMP] > 500 ? .35 : 1), R = Math.exp(lerp(Math.log(110), Math.log(Rmax), hv(sd, a, b, 304 + t) ** 1.3)) * (hv(sd, a, b, 308 + t) < .07 ? 2.3 : 1);
    f = { x: cx * CELL_M, z: cz * CELL_M, R, rot: hv(sd, a, b, 305 + t) * Math.PI, ecc: .15 + hv(sd, a, b, 306 + t) * .45, depth: clamp(R * .035, 2, 28), ph: hv(sd, a, b, 307 + t) * 6.283, SC, idx };
    const g = groundOnly(ctx, f.x, f.z, 0); f.g0 = g.h - .5;
    if (g.slope > .22 && P[AMP] < 500) f = null;                    // not on a steep face (a tarn in the mountains is the exception: those have their own amp)
  }
  featCache.set(key, f); if (featCache.size > 60000) featCache.clear(); return f;
}
function ctxCoastCheck(ctx, cx, cz) { const s = coastSample(ctx, cx, cz); return s && s.d < 3500; }
/** Radial position of a point in a lake's own frame: rho = 1 at the shore (wobbled outline). */
function lakeRho(f, X, Z) { const dx = X - f.x, dz = Z - f.z, c = Math.cos(f.rot), s = Math.sin(f.rot), u = (dx * c + dz * s) / (f.R * (1 + f.ecc)), v = (-dx * s + dz * c) / (f.R / (1 + f.ecc)), th = Math.atan2(v, u); return Math.hypot(u, v) / (1 + .12 * Math.sin(th * 3 + f.ph) + .07 * Math.sin(th * 5 + f.ph * 2)); }
function craterOf(ctx, a, b) {
  const key = `C${ctx.sd}|${ctx.fixedId || ''}|${a},${b}`; let f = featCache.get(key); if (f !== undefined) return f;
  const sd = ctx.sd, cx = (a + .2 + .6 * hv(sd, a, b, 311)) * CRATER_SC, cz = (b + .2 + .6 * hv(sd, a, b, 312)) * CRATER_SC, P = new Float64Array(NPROF); blendedProfile(ctx, cx, cz, P);
  if (hv(sd, a, b, 313) >= P[CRATER] * 1.4) f = null; else { const R = lerp(180, 1300, hv(sd, a, b, 314) ** 1.5); f = { x: cx * CELL_M, z: cz * CELL_M, R, depth: R * lerp(.08, .16, hv(sd, a, b, 315)), rim: R * lerp(.03, .06, hv(sd, a, b, 316)) }; }
  featCache.set(key, f); return f;
}
const K_RIVER = 5200;   // metres of ground per unit of the drainage noise, near its zero set (the carve width scale)
/** River half-width (m) for a profile: from a trickle in the desert to a real river in the wet country. */
const riverHalfWidth = p => lerp(1.2, 26, clamp(p, 0, 1) ** 1.3);
const riverLam = pRiver => lerp(26000, 9000, clamp(pRiver, 0, 1));
/** The drainage field: two FIXED wavelengths (a dry country has a river every ~26 km, a wet one every ~9 km) blended by the region's wetness. The wavelength itself must never vary with position: at a coordinate of millions of metres a position-varying wavelength multiplies the phase gradient by X and shatters the noise. */
function riverField(ctx, X, Z, lod, pRiver) { const w = ss(clamp(pRiver, 0, 1) * 1.3); return riverNoise(ctx, X, Z, lod, 26000) * (1 - w) + riverNoise(ctx, X, Z, lod, 9000) * w; }
function riverNoise(ctx, X, Z, lod, lam) { return fbm(ctx.sd, 31, X + 800 * (fbm(ctx.sd, 32, X, Z, 11000, 2, lod) - .5), Z, lam, 3, Math.max(lod, 2500)) - .5; }
function canyonGate(ctx, X, Z, lod) { return ss((fbm(ctx.sd, 33, X, Z, 42000, 2, lod) - .56) / .12); }
function canyonNoise(ctx, X, Z, lod) { return fbm(ctx.sd, 34, X + 700 * (fbm(ctx.sd, 35, X, Z, 9000, 2, lod) - .5), Z, 10500, 3, Math.max(lod, 1800)) - .5; }
/** Stepped canyon walls: the carve profile (0 at the rim .. 1 in the gorge) turned into shelves and cliffs. */
const terrace = t => { const k = 5, q = t * k, fl = Math.floor(q); return (fl + ss((q - fl - .6) / .4)) / k; };

// ---- the coast -------------------------------------------------------------------------------------------------------------------------------------------
const coastCache = new Map();
/** { d: metres to the real shoreline, land: bool } at a point (cell coordinates), or null where the sea is farther than 10 km (or off the planet). */
function coastSample(ctx, ci, ck) {
  const key = Math.round(ci * 8) * 100003 + Math.round(ck * 8); let v = coastCache.get(key); if (v !== undefined) return v;
  const ll = ctx.fixed ? null : cellLatLon(ci, ck); v = null;
  if (ll) { const c = coastInfo(ll.lat, ll.lon, 10); if (c) v = { d: c.km * 1000, land: landAt(ll.lat, ll.lon) !== null }; }
  coastCache.set(key, v); if (coastCache.size > 400000) coastCache.clear(); return v;
}
/** Treeline (m): where trees stop, by latitude (a Colorado slope ~3,150 m, Alaska's south coast ~1,300 m, Svalbard ~0). */
export const treelineM = lat => Math.max(0, 4000 - 45 * Math.max(0, Math.abs(lat) - 20) - 70 * Math.max(0, Math.abs(lat) - 55));

// ---- the height ------------------------------------------------------------------------------------------------------------------------------------------
const PROF = new Float64Array(NPROF);
function ground(ctx, X, Z, lod) {
  const ci = X / CELL_M, ck = Z / CELL_M, info = blendedProfile(ctx, ci, ck, PROF), P = PROF;
  let s = 0; for (let id = PLAINS; id <= DUNES; id++) { const w = P[id]; if (w > .015) s += w * stampValue(ctx, X, Z, P, lod, id); }
  let h = P[BASE] + P[AMP] * s + P[AMP] * .45 * (fbm(ctx.sd, 40, X, Z, 70000, 3, lod) - .5) * 2;
  const mountainous = clamp(P[MOUNTAINS] + P[RANGES] * .7, 0, 1);
  // river valleys
  const rw = riverHalfWidth(P[RIVER]), rn = riverField(ctx, X, Z, lod, P[RIVER]), dm = Math.abs(rn) * K_RIVER * riverLam(P[RIVER]) / 17000, vw = rw * 5.5;
  if (dm < vw) { const depth = clamp(P[AMP] * .12, 3, 55) * (1 - mountainous * .45) * (.5 + .5 * P[RIVER]), t = dm / vw, prof = (1 - ss(t)) ** 1.4; h -= depth * prof; if (dm < rw * 1.2) h -= clamp(depth * .25, 1, 8) * (1 - ss(dm / (rw * 1.2))); }
  // canyons
  if (P[CANYON] > .02) { const gate = canyonGate(ctx, X, Z, lod); if (gate > .01) { const cw = .003 + .012 * P[CANYON], d = Math.abs(canyonNoise(ctx, X, Z, lod)); if (d < cw) h -= clamp(P[AMP] * (.9 + P[CANYON]), 50, 300) * gate * terrace(1 - ss(d / cw)); } }
  return { h, info, P };
}
function groundOnly(ctx, X, Z, lod) {
  const g = ground(ctx, X, Z, lod), e = 60, gx = ground(ctx, X + e, Z, lod).h - ground(ctx, X - e, Z, lod).h, gz = ground(ctx, X, Z + e, lod).h - ground(ctx, X, Z - e, lod).h; return { h: g.h, slope: Math.hypot(gx, gz) / (2 * e) };
}
function makeCtx(seed, region) {
  const ctx = { sd: seedInt(seed), seed };
  if (region) { const r = typeof region === 'string' ? { id: `forced.${region}`, ecotype: region } : region; ctx.fixed = profileOfRegion(r); ctx.fixedId = r.id; ctx.coastNear = false; ctx.lat = 40; }
  return ctx;
}
/** A reusable sampler: `terrainSampler({ seed, region })(ci, ck, lod)` -> metres (a map draws tens of thousands of points through one). */
export function terrainSampler(opts = {}) { const ctx = makeCtx(opts.seed ?? 1, opts.region), features = opts.features !== false; return (ci, ck, lod = 0) => { const X = ci * CELL_M, Z = ck * CELL_M, g = ground(ctx, X, Z, lod); return shape(ctx, ci, ck, X, Z, g.h, g.info, g.P, lod, features); }; }
/** Height in metres at a point of the plane (cell coordinates ci, ck: cell (i, k) spans i - .5 .. i + .5). */
export function terrainAtCell(ci, ck, opts = {}) {
  const ctx = makeCtx(opts.seed ?? 1, opts.region), lod = opts.lod ?? 0, X = ci * CELL_M, Z = ck * CELL_M;
  const { h, info, P } = ground(ctx, X, Z, lod);
  return shape(ctx, ci, ck, X, Z, h, info, P, lod, opts.features !== false);
}
function shape(ctx, ci, ck, X, Z, h, info, P, lod, features) {
  const pLake = P[LAKE], pCrater = P[CRATER], coastSlope = P[COASTSLOPE];
  if (features) {
    const sa = Math.floor(ci / LAKE_SC), sb = Math.floor(ck / LAKE_SC);
    if (pLake > .005 || ctx.fixed) for (let a = sa - 1; a <= sa + 1; a++) for (let b = sb - 1; b <= sb + 1; b++) for (let q = 0; q < 4; q++) { const f = lakeOf(ctx, a, b, q); if (!f || Math.abs(X - f.x) > f.R * 2.6 || Math.abs(Z - f.z) > f.R * 2.6) continue; const rho = lakeRho(f, X, Z); if (rho > 1.5) continue; if (rho < 1) h = Math.min(h, f.g0 - f.depth * (1 - rho * rho * .85)); else h = lerp(Math.min(h, f.g0 + .3), h, ss((rho - 1) / .5)); }
    if (pCrater > .003) { const ca = Math.floor(ci / CRATER_SC), cb = Math.floor(ck / CRATER_SC); for (let a = ca - 1; a <= ca + 1; a++) for (let b = cb - 1; b <= cb + 1; b++) { const f = craterOf(ctx, a, b); if (!f) continue; const rho = Math.hypot(X - f.x, Z - f.z) / f.R; if (rho > 1.8) continue; h += -f.depth * (1 - ss(rho)) + f.rim * Math.exp(-(((rho - 1.05) / .2) ** 2)); } }
  }
  if (info.coastNear) { const c = coastSample(ctx, ci, ck); if (c) { if (c.land) h = Math.min(h, 1 + c.d * coastSlope * (.6 + .4 * ss(c.d / 4000))); else h = -(1.5 + Math.min(c.d, 20000) * .02); } }
  return h;
}

// ---- one World Cell ----------------------------------------------------------------------------------------------------------------------------------
/** A height grid of n x n samples over the cell, edge samples ON the cell edge (x = -672 .. +672 u), so neighbours share them exactly. Index = row (z) * n + col (x). */
export function terrainField(i, k, opts = {}) {
  const n = opts.n ?? 17, ctx = makeCtx(opts.seed ?? 1, opts.region), lod = opts.lod ?? 0, step = CELL_UNITS / (n - 1), heights = new Array(n * n), riv = new Array(n * n);
  let min = Infinity, max = -Infinity, sum = 0, feat = false; const shore = new Array(n * n).fill(1e5);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const ci = i + (c * step - HALF) / CELL_UNITS, ck = k + (r * step - HALF) / CELL_UNITS, X = ci * CELL_M, Z = ck * CELL_M;
    const g = ground(ctx, X, Z, lod), rv = riverField(ctx, X, Z, lod, g.P[RIVER]), h = shape(ctx, ci, ck, X, Z, g.h, g.info, g.P, lod, opts.features !== false);
    heights[r * n + c] = r2(h); if (h < min) min = h; if (h > max) max = h; sum += h; riv[r * n + c] = rv; if (g.info.coastNear) { feat = true; const cs = coastSample(ctx, ci, ck); if (cs) shore[r * n + c] = cs.land ? cs.d : -cs.d; }
  }
  const mean = sum / (n * n), stepM = step * METRES_PER_UNIT;
  // slope: central differences over the grid (degrees)
  const slopes = []; let smax = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const hx = heights[r * n + Math.min(n - 1, c + 1)] - heights[r * n + Math.max(0, c - 1)], hz = heights[Math.min(n - 1, r + 1) * n + c] - heights[Math.max(0, r - 1) * n + c], dx = (Math.min(n - 1, c + 1) - Math.max(0, c - 1)) * stepM, dz = (Math.min(n - 1, r + 1) - Math.max(0, r - 1)) * stepM, sl = Math.atan(Math.hypot(hx / dx, hz / dz)) * 180 / Math.PI; slopes.push(sl); if (sl > smax) smax = sl; }
  slopes.sort((a, b) => a - b); const p90 = slopes[Math.floor(slopes.length * .9)], P = new Float64Array(NPROF), info = blendedProfile(ctx, i, k, P);
  const field = { version: TERRAIN_VERSION, i, k, n, step: r2(step), seed: opts.seed ?? 1, heights, min: r2(min), max: r2(max), mean: r2(mean), range: r2(max - min), slopeP90: r2(p90), slopeMax: r2(smax), class: null, macro: 0, treelineM: Math.round(treelineM(info.lat)), lat: r2(info.lat) };
  field.class = reliefClass(p90); field.macro = r2(clamp((P[AMP] * (P[MOUNTAINS] + P[RANGES] * .8 + P[MESA] * .6 + P[HILLS] * .35 + P[PLATEAU] * .3 + P[DUNES] * .2 + P[PLAINS] * .05)) / 900, 0, 1)); field.profile = { baseM: r2(P[BASE]), ampM: r2(P[AMP]) };
  if (opts.features !== false) {
    field.lakes = lakesInCell(ctx, i, k, P); field.craters = cratersInCell(ctx, i, k);
    const wRiver = riverHalfWidth(P[RIVER]); field.rivers = contourLines(riv, n, 0, step).filter(l => l.length > 1).map(pts => ({ path: pts.map(p => [r2(p[0] - HALF), r2(p[1] - HALF)]), width: Math.round(wRiver * 2 / METRES_PER_UNIT), widthM: r2(wRiver * 2), dry: P[RIVER] < .25 && P[LAKE] < .1 }));
    field.sea = feat ? marchBelow(shore, n, 0, step).map(poly => poly.map(p => [r2(p[0] - HALF), r2(p[1] - HALF)])) : [];
    field.shore = feat && shore.some(v => v < 1e5) ? shore.map(v => (v >= 1e5 ? 99999 : Math.round(v))) : null;
  }
  return field;
}
const classOfSlope = [[2, 'flat'], [6, 'gentle'], [12, 'rolling'], [20, 'hilly'], [32, 'steep']];
/** Relief class of a cell from its 90th-percentile slope in degrees: flat, gentle, rolling, hilly, steep, cliffs. */
export function reliefClass(p90) { for (const [t, name] of classOfSlope) if (p90 < t) return name; return 'cliffs'; }
function lakesInCell(ctx, i, k, P) {
  const out = [], X0 = (i - .5) * CELL_M, Z0 = (k - .5) * CELL_M, sa = Math.floor(i / LAKE_SC), sb = Math.floor(k / LAKE_SC);
  for (let a = sa - 1; a <= sa + 1; a++) for (let b = sb - 1; b <= sb + 1; b++) for (let q = 0; q < 4; q++) {
    const f = lakeOf(ctx, a, b, q); if (!f || Math.abs(f.x - (X0 + CELL_M / 2)) > f.R * 2.4 + CELL_M / 2 || Math.abs(f.z - (Z0 + CELL_M / 2)) > f.R * 2.4 + CELL_M / 2) continue;
    const pts = []; for (let q = 0; q < 40; q++) { const th = q / 40 * Math.PI * 2, u = Math.cos(th), v = Math.sin(th), k2 = 1 + .12 * Math.sin(th * 3 + f.ph) + .07 * Math.sin(th * 5 + f.ph * 2), c = Math.cos(f.rot), s = Math.sin(f.rot); const lx = u * f.R * (1 + f.ecc) * k2, lz = v * f.R / (1 + f.ecc) * k2; pts.push([(f.x + lx * c - lz * s - (i * CELL_M)) / METRES_PER_UNIT, (f.z + lx * s + lz * c - (k * CELL_M)) / METRES_PER_UNIT]); }
    const clipped = clipRect(pts, -HALF, HALF); if (clipped.length >= 3) out.push({ id: `lake:${a},${b},${q}`, poly: clipped.map(p => [r2(p[0]), r2(p[1])]), surfaceM: r2(f.g0), depthM: r2(f.depth), radiusM: Math.round(f.R) });
  }
  return out;
}
function cratersInCell(ctx, i, k) {
  const out = [], ca = Math.floor(i / CRATER_SC), cb = Math.floor(k / CRATER_SC);
  for (let a = ca - 1; a <= ca + 1; a++) for (let b = cb - 1; b <= cb + 1; b++) { const f = craterOf(ctx, a, b); if (!f) continue; const dx = f.x - i * CELL_M, dz = f.z - k * CELL_M; if (Math.hypot(dx, dz) < f.R * 1.2 + CELL_M) out.push({ id: `crater:${a},${b}`, x: r2(dx / METRES_PER_UNIT), z: r2(dz / METRES_PER_UNIT), radiusM: Math.round(f.R), depthM: r2(f.depth), rimM: r2(f.rim) }); }
  return out;
}

// ---- grids, contours, shading ----------------------------------------------------------------------------------------------------------------------------
/** Sutherland-Hodgman clip of a polygon to the square [lo, hi]^2. */
export function clipRect(poly, lo, hi) {
  let out = poly;
  for (const [ax, sg] of [[0, 1], [0, -1], [1, 1], [1, -1]]) { const inp = out; out = []; const lim = sg === 1 ? hi : -lo, inside = p => sg * p[ax] <= lim;
    for (let a = 0; a < inp.length; a++) { const cur = inp[a], prv = inp[(a + inp.length - 1) % inp.length], ci = inside(cur), pi = inside(prv); if (ci !== pi) { const t = (sg * lim - prv[ax]) / (cur[ax] - prv[ax]); out.push([prv[0] + (cur[0] - prv[0]) * t, prv[1] + (cur[1] - prv[1]) * t]); } if (ci) out.push(cur); }
    if (!out.length) break; }
  return out;
}
/** Polygons (grid units * step, from the cell's top-left corner) covering where vals < level: one clipped quad per grid square, full runs merged along rows. */
export function marchBelow(vals, n, level, step) {
  const out = [];
  for (let r = 0; r < n - 1; r++) { let run = null;
    for (let c = 0; c < n - 1; c++) {
      const v = [vals[r * n + c], vals[r * n + c + 1], vals[(r + 1) * n + c + 1], vals[(r + 1) * n + c]], x0 = c * step, z0 = r * step, below = v.map(q => q < level), cnt = below.filter(Boolean).length;
      if (cnt === 4) { if (!run) run = [x0, z0, x0 + step, z0 + step]; else run[2] = x0 + step; continue; }
      if (run) { out.push([[run[0], run[1]], [run[2], run[1]], [run[2], run[3]], [run[0], run[3]]]); run = null; }
      if (cnt === 0) continue;
      const P = [[x0, z0], [x0 + step, z0], [x0 + step, z0 + step], [x0, z0 + step]], poly = [];
      for (let q = 0; q < 4; q++) { const a = q, b = (q + 1) % 4; if (below[a]) poly.push(P[a]); if (below[a] !== below[b]) { const t = (level - v[a]) / (v[b] - v[a]); poly.push([P[a][0] + (P[b][0] - P[a][0]) * t, P[a][1] + (P[b][1] - P[a][1]) * t]); } }
      if (poly.length >= 3) out.push(poly);
    }
    if (run) out.push([[run[0], run[1]], [run[2], run[1]], [run[2], run[3]], [run[0], run[3]]]); }
  return out;
}
/** Marching squares: the polylines where vals crosses `level` (grid coords * step). Chained into open or closed lines. */
export function contourLines(vals, n, level, step) {
  const segs = [], at = (r, c) => vals[r * n + c];
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
    const a = at(r, c), b = at(r, c + 1), d = at(r + 1, c + 1), e = at(r + 1, c), x0 = c * step, z0 = r * step, pts = [];
    const edge = (p, q, vp, vq, P, Q) => { if ((vp < level) !== (vq < level)) { const t = (level - vp) / (vq - vp); pts.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); } };
    edge(0, 1, a, b, [x0, z0], [x0 + step, z0]); edge(1, 2, b, d, [x0 + step, z0], [x0 + step, z0 + step]); edge(2, 3, d, e, [x0 + step, z0 + step], [x0, z0 + step]); edge(3, 0, e, a, [x0, z0 + step], [x0, z0]);
    if (pts.length === 2) segs.push([pts[0], pts[1]]); else if (pts.length === 4) { segs.push([pts[0], pts[1]], [pts[2], pts[3]]); }
  }
  const key = p => `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`, ends = new Map();
  segs.forEach((s, si) => { for (const p of s) { const kx = key(p); (ends.get(kx) || ends.set(kx, []).get(kx)).push(si); } });
  const used = new Array(segs.length).fill(false), lines = [];
  const next = (p, from) => { for (const si of ends.get(key(p)) || []) if (!used[si] && si !== from) return si; return -1; };
  for (let si = 0; si < segs.length; si++) {
    if (used[si]) continue; used[si] = true; let line = [segs[si][0], segs[si][1]], guard = 0;
    for (const dir of [1, 0]) { while (guard++ < 5000) { const tail = dir ? line[line.length - 1] : line[0], nx = next(tail, -1); if (nx < 0) break; used[nx] = true; const s = segs[nx], other = key(s[0]) === key(tail) ? s[1] : s[0]; if (dir) line.push(other); else line.unshift(other); } }
    lines.push(line);
  }
  return lines;
}
/** Bilinear height and slope (degrees) at a cell-local point (x, z in u). */
export function heightAt(field, x, z) {
  const n = field.n, fx = clamp((x + HALF) / CELL_UNITS * (n - 1), 0, n - 1 - 1e-9), fz = clamp((z + HALF) / CELL_UNITS * (n - 1), 0, n - 1 - 1e-9), c = Math.floor(fx), r = Math.floor(fz), tx = fx - c, tz = fz - r, h = field.heights;
  return lerp(lerp(h[r * n + c], h[r * n + c + 1], tx), lerp(h[(r + 1) * n + c], h[(r + 1) * n + c + 1], tx), tz);
}
export function slopeDegAt(field, x, z) { const e = field.step * 1.1, hx = heightAt(field, x + e, z) - heightAt(field, x - e, z), hz = heightAt(field, x, z + e) - heightAt(field, x, z - e); return Math.atan(Math.hypot(hx, hz) / (2 * e * METRES_PER_UNIT)) * 180 / Math.PI; }
/** Hillshade (0..1, light from the north-west by default) of a field's height grid. `exag` multiplies relief so a flat cell still reads. */
export function hillshade(field, { az = 315, alt = 40, exag = 1 } = {}) {
  const n = field.n, h = field.heights, stepM = field.step * METRES_PER_UNIT, out = new Array(n * n), A = az * Math.PI / 180, E = alt * Math.PI / 180, Lx = Math.sin(A) * Math.cos(E), Ly = Math.sin(E), Lz = -Math.cos(A) * Math.cos(E);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const c0 = Math.max(0, c - 1), c1 = Math.min(n - 1, c + 1), r0 = Math.max(0, r - 1), r1 = Math.min(n - 1, r + 1), dx = (h[r * n + c1] - h[r * n + c0]) / ((c1 - c0) * stepM) * exag, dz = (h[r1 * n + c] - h[r0 * n + c]) / ((r1 - r0) * stepM) * exag;
    out[r * n + c] = clamp((-dx * Lx + Ly - dz * Lz) / Math.sqrt(dx * dx + 1 + dz * dz), 0, 1);
  }
  return out;
}
/** Height in metres at a place: terrainAtCell on the planet plane. */
export function terrainAtLatLon(lat, lon, opts = {}) { const w = worldFromLatLon(lat, lon); return terrainAtCell(w.x / CELL_UNITS, w.z / CELL_UNITS, opts); }
/** Problems with a field (finite numbers, sane range, the same shared edges as its neighbours is the test's job). */
export function validateTerrain(f) {
  const bad = []; if (f.heights.length !== f.n * f.n) bad.push('wrong grid size'); if (f.heights.some(v => !Number.isFinite(v))) bad.push('non-finite height'); if (f.min < -400 || f.max > 9000) bad.push(`height out of range ${f.min}..${f.max}`);
  for (const l of f.lakes || []) for (const p of l.poly) if (Math.abs(p[0]) > HALF + .5 || Math.abs(p[1]) > HALF + .5) { bad.push(`lake ${l.id} leaves the cell`); break; }
  for (const r of f.rivers || []) for (const p of r.path) if (Math.abs(p[0]) > HALF + .5 || Math.abs(p[1]) > HALF + .5) { bad.push('river leaves the cell'); break; }
  return bad;
}
/** Internals the tests and the lab read (stamp evaluation, noise, the lattice profile). Not API. */
export const internals = { stampValue, makeCtx, fbm, vn, ground, blendedProfile, PLAINS, HILLS, MOUNTAINS, MESA, RANGES, PLATEAU, DUNES, NPROF };
