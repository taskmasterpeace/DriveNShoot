// WORLD ENGINE v0.1 · family D data: the land between cities (docs/presidium/WORLD-ENGINE-v0.1.md §2.D).
//
// Pure data + pure functions (DEC-0026): no DOM, no THREE, no storage. The
// archetypes in src/engine/world-engine/between-cities/ read this to decide
//   * which biome a country cell is (from the Köppen zone climate.js already
//     joins onto every sheet city, and the cell's latitude), and
//   * where the country road enters and leaves the cell, so the road continues
//     cell to cell (#104 TRAVEL-01 seams): ports sit at EDGE MIDPOINTS, exactly
//     where the district generator's centre lines put a city's exit roads
//     (world-district.js LINES[1] = 0), in the same 1344u World Cell (no rescale).
//
// ROUTING v0.1: a city-to-city route is a 4-connected line of World Cells from
// one city's anchor cell to the other's (world-city-cells.js footprints). Every
// cell on it knows the side it enters from and the side it leaves by, so two
// neighbouring route cells always agree on their shared port (tested). The route
// is a function of the two cities only, never of a recipe seed: rerolling one
// cell can never break the road with its neighbour.
import { cityFootprintIndex } from '../world-city-cells.js';
import { parseCellId, cellAddress, latLonFromWorld, isCellId, WORLD_CELL_SIZE } from '../world-address.js';
import { climateOf } from '../climate.js';
import { cellSpans } from '../world-district.js';

export const BETWEEN_CITIES_DATA_VERSION = 2;
const HALF = WORLD_CELL_SIZE / 2;

/** ROAD CLASS LADDER (DEC-0035 #180, docs/research/ROAD-BIOMES-2026-09-21.md), top down.
 * Each class is a recipe over World Cell road types (data/world-cell.js rows of the same
 * name: lanes, shoulders, lane paint, lighting:'none'). Units 0.19 m/u (#104 TRAVEL-01).
 *   carriageway  World Cell road type of each carriageway / the road itself
 *   divided      two one-way carriageways with a grass median of `median` u
 *   clearZone    mown, tree-free verge beyond the pavement edge (u)
 *   lighting     'masts-at-exits': voxel high-mast lights at the interchange only;
 *                'none': no lights at all (never the smooth auto street lamps)
 *   meander      lateral S-curve amplitude range (u); bend = corner radius range for
 *                a route that turns through the cell
 *   exit         the junction this class carries: a ramp pair to a lower class */
export const ROAD_CLASSES = Object.freeze({
  interstate: Object.freeze({ label: 'Interstate', rank: 5, carriageway: 'interstate', divided: true, median: 64, lanes: 6, sidewalk: false, clearZone: 48, lighting: 'masts-at-exits', meander: [4, 14], bend: [460, 520], exit: Object.freeze({ ramp: 'ramp', to: 'two-lane' }), note: '6 lanes (3 each way), grass median, wide shoulders, no sidewalk, exit with off- and on-ramp' }),
  divided: Object.freeze({ label: 'Divided highway', rank: 4, carriageway: 'divided', divided: true, median: 40, lanes: 4, sidewalk: false, clearZone: 30, lighting: 'none', meander: [8, 24], bend: [380, 440], note: '4 lanes (2 each way), grass median, shoulders, no sidewalk, no lights' }),
  'two-lane': Object.freeze({ label: 'Two-lane highway', rank: 3, carriageway: 'two-lane', divided: false, lanes: 2, sidewalk: false, clearZone: 9, lighting: 'none', meander: [24, 60], bend: [140, 220], note: 'one lane each way, narrow shoulders, no sidewalk, trees close to the car' }),
  rural: Object.freeze({ label: 'Rural route', rank: 2, carriageway: 'rural', divided: false, lanes: 2, sidewalk: false, clearZone: 14, lighting: 'none', meander: [0, 6], bend: [110, 160], note: 'two narrow lanes, centre line only, no shoulders' }),
  dirt: Object.freeze({ label: 'Dirt / forest road', rank: 1, carriageway: 'dirt', width: 22, divided: false, lanes: 1, sidewalk: false, clearZone: 4, lighting: 'none', meander: [40, 76], bend: [90, 140], note: 'single unpaved track' }),
});
export const ROAD_CLASS_IDS = Object.freeze(Object.keys(ROAD_CLASSES));
/** The road a biome is known for (its skin), used when the Road class input is 'auto'. */
export const BIOME_ROAD = Object.freeze({ forest: 'two-lane', farmland: 'rural', grassland: 'divided', desert: 'interstate', tundra: 'two-lane', wetland: 'two-lane' });

/** The biome archetypes family D ships (seven options in the panel's one
 * archetype dropdown, then Generate). `ground` = World Cell
 * ground materials (paint only), `rock` = authored rock kinds, flora = voxel
 * species ids in between-cities/flora.js. */
export const BIOME_KINDS = Object.freeze({
  forest: Object.freeze({ label: 'Forest', ground: ['grass', 'dirt'], rock: 'alpine-outcrop', note: 'a wall of trees close to the road, dense stands, outcrops, logs, a cabin clearing' }),
  farmland: Object.freeze({ label: 'Farmland', ground: ['grass', 'dirt'], rock: 'rock-talus', note: 'farm belt: crop fields, fences, silos and grain bins, farmhouse and barn, windbreaks, power line' }),
  grassland: Object.freeze({ label: 'Grassland', ground: ['grass'], rock: 'rock-talus', note: 'open prairie: long grass, groves and lone trees, cattle fence, windmill, stock tank' }),
  desert: Object.freeze({ label: 'Desert', ground: ['sand', 'dirt'], rock: 'rock-talus', note: 'desert highway: long sight lines, bedded buttes, sparse scrub, a truck stop at the exit' }),
  tundra: Object.freeze({ label: 'Snow / tundra', ground: ['snow', 'ice'], rock: 'alpine-outcrop', note: 'snowfield, snow poles, snow fence, drifts, fir clumps, frozen ponds' }),
  wetland: Object.freeze({ label: 'Wetland / swamp', ground: ['mud', 'grass'], rock: 'rock-talus', note: 'swamp: standing water, raised causeway, cattails and reeds, dead trees, mud islands, a stilt shack' }),
});
export const BIOME_IDS = Object.freeze(Object.keys(BIOME_KINDS));

/** Köppen zone -> biome for the 'auto' archetype (climate.js ZONES keys). */
export const KOPPEN_BIOME = Object.freeze({
  Af: 'forest', Am: 'wetland', Aw: 'grassland',
  BWh: 'desert', BWk: 'desert', BSh: 'grassland', BSk: 'grassland',
  Csa: 'grassland', Csb: 'farmland', Cfa: 'farmland', Cfb: 'forest', Cwa: 'farmland', Cwb: 'farmland',
  Dfa: 'farmland', Dfb: 'forest', Dwa: 'farmland', Dwb: 'forest', Dfc: 'forest', Dwc: 'forest',
  ET: 'tundra', EF: 'tundra', H: 'forest',
});
const coarse = k => ({ A: 'tropical', B: 'arid', C: 'temperate', D: 'continental', E: 'polar', H: 'highland' })[String(k || '')[0]] ?? 'temperate';

const SIDE_VEC = Object.freeze({ north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] });
export const OPPOSITE_SIDE = Object.freeze({ north: 'south', south: 'north', east: 'west', west: 'east' });
/** Cell-local port of a side: the edge midpoint (x, z in -672..672). */
export const portOf = side => ({ north: { x: 0, z: -HALF }, south: { x: 0, z: HALF }, east: { x: HALF, z: 0 }, west: { x: -HALF, z: 0 } })[side];
const sideOfStep = (di, dk) => Object.entries(SIDE_VEC).find(([, v]) => v[0] === di && v[1] === dk)?.[0] ?? null;
/** The side of a cell that faces direction (dx, dz) (dominant axis; ties go east/west). */
export const facingSide = (dx, dz) => (Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 'east' : 'west') : (dz >= 0 ? 'south' : 'north'));

// ---- city-to-city routes ------------------------------------------------------------------
const routes = new Map();
/** The 4-connected cell line between two city footprints (order-independent).
 * Returns {a, b, cells:[{i,k}], index: Map('i,k' -> n)}; cells[0] is a's anchor. */
export function cityRoute(fa, fb) {
  const [a, b] = fa.cityId < fb.cityId ? [fa, fb] : [fb, fa], key = `${a.cityId}|${b.cityId}`;
  if (routes.has(key)) return routes.get(key);
  let i = a.anchor.i, k = a.anchor.k, ix = 0, iz = 0;
  const di = b.anchor.i - i, dk = b.anchor.k - k, si = Math.sign(di), sk = Math.sign(dk), ni = Math.abs(di), nk = Math.abs(dk), cells = [{ i, k }];
  // Step along whichever axis keeps the path closest to the straight line (ties: x first).
  while (ix < ni || iz < nk) {
    if (iz >= nk || (ix < ni && (0.5 + ix) / ni <= (0.5 + iz) / nk)) { i += si; ix++; } else { k += sk; iz++; }
    cells.push({ i, k });
  }
  const route = { a, b, cells, index: new Map(cells.map((c, n) => [`${c.i},${c.k}`, n])) };
  routes.set(key, route);
  return route;
}
const dist2 = (f, i, k) => (f.anchor.i - i) ** 2 + (f.anchor.k - k) ** 2;

/**
 * Where the country road runs in this cell, and which two cities it links.
 * Pure function of the cell id (sheet cities + the World Cell grid).
 * @returns {{kind:'route'|'between'|'toward'|'city'|'lab', from, to, sides:[inSide,outSide], index?, length?, cityId?, existing:{ns,ew}}}
 */
export function cityLink(cellId, { near = 6 } = {}) {
  if (!isCellId(cellId)) return { kind: 'lab', from: null, to: null, sides: ['west', 'east'], existing: { ns: 0, ew: 0 } };
  const c = parseCellId(cellId), idx = cityFootprintIndex(), existing = existingLines(c.i, c.k);
  const owner = idx.cityAt(c.i, c.k);
  const brief = f => ({ cityId: f.cityId, name: f.name, country: f.country, anchor: f.anchor.id, i: f.anchor.i, k: f.anchor.k });
  if (owner) { const f = idx.footprints.find(x => x.cityId === owner); return { kind: 'city', cityId: owner, from: brief(f), to: null, sides: ['west', 'east'], existing }; }
  const cands = [...idx.footprints].sort((p, q) => dist2(p, c.i, c.k) - dist2(q, c.i, c.k) || (p.cityId < q.cityId ? -1 : 1)).slice(0, near);
  let best = null;
  for (let x = 0; x < cands.length; x++) for (let y = x + 1; y < cands.length; y++) {
    const r = cityRoute(cands[x], cands[y]), n = r.index.get(`${c.i},${c.k}`);
    if (n === undefined || n === 0 || n === r.cells.length - 1) continue;
    if (!best || r.cells.length < best.route.cells.length || (r.cells.length === best.route.cells.length && `${r.a.cityId}|${r.b.cityId}` < `${best.route.a.cityId}|${best.route.b.cityId}`)) best = { route: r, n };
  }
  if (best) {
    const { route, n } = best, p = route.cells[n - 1], q = route.cells[n + 1];
    const between = route.cells.filter(cc => !idx.cityAt(cc.i, cc.k));
    return { kind: 'route', from: brief(route.a), to: brief(route.b), sides: [sideOfStep(p.i - c.i, p.k - c.k), sideOfStep(q.i - c.i, q.k - c.k)],
      index: between.findIndex(cc => cc.i === c.i && cc.k === c.k), length: between.length, existing };
  }
  // Off every route: face the nearest city and the nearest city on the far side of the cell.
  const [a] = cands, toA = [a.anchor.i - c.i, a.anchor.k - c.k];
  const b = cands.slice(1).find(f => toA[0] * (f.anchor.i - c.i) + toA[1] * (f.anchor.k - c.k) < 0);
  if (b) return { kind: 'between', from: brief(a), to: brief(b), sides: [facingSide(...toA), facingSide(b.anchor.i - c.i, b.anchor.k - c.k)], existing };
  const s = facingSide(...toA);
  return { kind: 'toward', from: brief(a), to: null, sides: [s, OPPOSITE_SIDE[s]], existing };
}
/** District-generator centre-line roads this cell already carries (city exit roads
 * reach one cell into open country): max class on the centre N-S / E-W line. */
export function existingLines(i, k) {
  try { const s = cellSpans(i, k); return { ns: Math.max(...s.ns[1]), ew: Math.max(...s.ew[1]) }; } catch { return { ns: 0, ew: 0 }; }
}
/** Every between-cities cell id on the route linking two sheet cities (no city cells). */
export function routeCellIds(cityA, cityB) {
  const idx = cityFootprintIndex(), fa = idx.footprints.find(f => f.cityId === cityA || f.name === cityA), fb = idx.footprints.find(f => f.cityId === cityB || f.name === cityB);
  if (!fa || !fb) throw new RangeError(`Unknown city in ${cityA} / ${cityB}`);
  return cityRoute(fa, fb).cells.filter(c => !idx.cityAt(c.i, c.k)).map(c => cellAddress(c.i, c.k).id);
}

// ---- climate / geography -> biome -----------------------------------------------------------
/** Biome for a country cell from real data: the Köppen zone of the nearest sheet
 * city (climate.js), the cell's latitude (sinusoidal surface plane), and a
 * cell-hash split for wet lowlands. Lab / unknown cells read as temperate. */
export function biomeForCell(cellId) {
  if (!isCellId(cellId)) return { biome: 'grassland', climate: 'temperate', koppen: null, lat: null, near: null, why: 'lab cell: no geography' };
  const c = parseCellId(cellId), { lat } = latLonFromWorld(c.origin.x, c.origin.z), idx = cityFootprintIndex();
  const f = [...idx.footprints].sort((p, q) => dist2(p, c.i, c.k) - dist2(q, c.i, c.k) || (p.cityId < q.cityId ? -1 : 1))[0];
  const k = f ? climateOf({ name: f.name, country: f.country }).koppen : 'Cfb';
  let biome = KOPPEN_BIOME[k] ?? 'grassland', why = `Köppen ${k} (nearest city ${f?.name ?? 'none'})`;
  if (Math.abs(lat) >= 66) { biome = 'tundra'; why += `, latitude ${lat.toFixed(1)}° is polar`; }
  // Humid lowland zones are part wetland: a stable per-cell split (never the recipe seed).
  if (['Cfa', 'Am', 'Cfb', 'Dfa'].includes(k) && (hash(`${cellId}:wet`) % 100) < 18) { biome = 'wetland'; why += ', humid lowland (cell split 18%)'; }
  return { biome, climate: coarse(k), koppen: k, lat: +lat.toFixed(3), near: f ? { cityId: f.cityId, name: f.name, country: f.country } : null, why };
}
function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
