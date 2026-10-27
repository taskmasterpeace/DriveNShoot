// THE SITE STAMPER (docs/design/WEB_LOCATION_BIBLE.md §3.1, §4): any SITE row -> a town plan at (x, z). Generic: the row's
// layout id picks the street plan (an archetype that lays it), its footprint the size, its density the fill, its walls the
// wall, and its STRUCTURES the hero buildings (the real ones, miniaturised: plans scale by sqrt(s) so they stay walkable,
// storeys as the row says, capped at 6). Military rows get the base layout and its vault. Pure.
import { layoutTown, layoutBase, makeBuilding, roofBridges, clearBays } from './layout.js';
import { ARCHETYPES, KINDS, BIOMES, WALLS } from '../../data/citygen.js';
import { makeRng } from '../../engine/rng.js';

// §3.4 layout ids -> the archetype whose street plan lays it
export const LAYOUT_ARCH = {
  grid_downtown: 'sonoran_sprawl', main_street_strip: 'plains_grain_town', courthouse_square: 'county_seat', river_fork_terraced: 'delta_river_town',
  mesa_pueblo: 'adobe_pueblo', canyon_stack: 'alpine_mining_stack', star_fort: 'walled_stronghold', bastion_fort: 'walled_stronghold',
  company_town: 'company_town', mill_town_river: 'rustbelt_mill', port_wharf: 'port_wharf', stilt_village: 'gulf_stilt_town',
  interchange_ring: 'interstate_exit', campus_quad: 'college_town', mall_island: 'boom_strip', refinery_maze: 'refinery_town',
  rail_yard: 'plains_grain_town', dam_and_spillway: 'company_town', military_base_grid: 'military_base', missile_field: 'military_base',
  prison_compound: 'walled_stronghold', stadium_bowl: 'sonoran_sprawl', amusement_park: 'boom_strip', cemetery_hill: 'county_seat',
  mine_head: 'appalachian_hollow', plantation_row: 'delta_river_town', oasis_ring: 'oasis_ring', tank_farm: 'salt_works',
  airport_apron: 'military_base', cooling_tower_field: 'hot_zone_ruin',
};
// real-architecture words -> a building programme
export const STRUCTURE_KIND = {
  armory_hall: 'warehouse', adobe_church: 'church', mission_church: 'church', cigar_factory: 'mill', fort_curtain: 'barracks', hotel_grand: 'hotel',
  mine_headframe: 'grain_elevator', depot: 'shop', arcade_block: 'shop', boardinghouse: 'rowhouse', jail: 'courthouse', bank: 'shop', mill_hall: 'mill',
  cannery: 'warehouse', lighthouse: 'grain_elevator', blockhouse: 'guardhouse', gantry: 'grain_elevator', hangar: 'quonset',
};
export const kindOf = (k) => (KINDS[k] ? k : STRUCTURE_KIND[k] ?? null);

export function layoutSite(row, { x, z, seed = 1 } = {}) {
  const rng = makeRng((seed ^ hashS(row.id)) >>> 0);
  const biome = BIOMES[row.biome] ? row.biome : 'desert_sonoran';
  const archId = LAYOUT_ARCH[row.layout] ?? 'county_seat';
  const size = Math.max(150, Math.min(600, Math.max(row.footprint?.[0] ?? 300, row.footprint?.[1] ?? 300)));
  let T;
  if (archId === 'military_base' || row.kind === 'military') {
    T = layoutBase({ x, z, seed, biome, id: `site-${row.id}`, name: row.name });
    if (row.underground?.levels) T.bunker.levels = Math.max(5, Math.min(8, row.underground.levels));
  } else {
    const A = ARCHETYPES[archId];
    const archDens = (A.density.core + A.density.edge) / 2;
    const walls = row.walls?.type && WALLS[row.walls.type] ? row.walls.type : 'none';
    T = layoutTown({ arch: archId, biome, seed, x, z, size, density: Math.max(0.3, Math.min(1.6, (row.density ?? archDens) / archDens)), walls, id: `site-${row.id}`, name: row.name });
  }
  T.site = row; T.name = row.name;
  // the hero buildings: the row's structures take the lots nearest the middle (or the edge for a heightProfile that says so)
  const want = [];
  for (const s of row.structures ?? []) {
    const k = kindOf(s.kind);
    if (!k) continue;
    const n = Array.isArray(s.count) ? rng.int(s.count[0], s.count[1]) : s.count ?? 1;
    for (let i = 0; i < n; i++) want.push({ k, s });
  }
  const used = new Set();
  const order = [...T.buildings].sort((a, b) => dist(a, T) - dist(b, T));
  if (row.heightProfile === 'edge_tall') order.reverse();
  for (const w of want) {
    const K = KINDS[w.k];
    // a real plan scaled to stay walkable: never smaller than the kind's own minimum, never bigger than the lot it takes
    const pw = Math.max(K.w[0], Math.min(K.w[1] * 1.4, w.s.plan?.[0] ?? K.w[0])), pd = Math.max(K.d[0], Math.min(K.d[1] * 1.4, w.s.plan?.[1] ?? K.d[0]));
    const lot = order.find((B) => !used.has(B) && B.x1 - B.x0 + 4 >= Math.min(pw, pd) && B.z1 - B.z0 + 4 >= Math.min(pw, pd));
    if (!lot) continue;
    used.add(lot);
    const st = Array.isArray(w.s.storeys) ? rng.int(w.s.storeys[0], Math.min(6, w.s.storeys[1])) : Math.min(6, w.s.storeys ?? 1);
    Object.assign(lot, makeBuilding(rng, w.k, lot.x0, lot.z0, lot.x1, lot.z1, lot.front, { ...lot, storeys: st, ruined: false, id: lot.id }));
    lot.hero = w.s.kind;
  }
  clearBays(T.buildings, T.wall ? { x0: T.wall.x0 + T.wall.t, z0: T.wall.z0 + T.wall.t, x1: T.wall.x1 - T.wall.t, z1: T.wall.z1 - T.wall.t } : null);
  T.bridges = roofBridges(rng, T.buildings, T.id);
  return T;
}
const dist = (B, T) => Math.hypot((B.x0 + B.x1) / 2 - T.cx, (B.z0 + B.z1) / 2 - T.cz);
function hashS(s) { let v = 2166136261; for (let i = 0; i < s.length; i++) { v ^= s.charCodeAt(i); v = Math.imul(v, 16777619); } return v >>> 0; }

// The check the World Forge's SITE tab and the selftest run on rows (schema §3.1).
const KINDS_OK = new Set(['holdout', 'ruin', 'station', 'fort', 'industrial', 'camp', 'landmark', 'trade', 'farm', 'military']);
export function validateSites(rows) {
  const errs = [], ids = new Set();
  for (const r of rows) {
    if (!/^[a-z0-9-]+$/.test(r.id ?? '')) errs.push(`${r.id}: id`);
    if (ids.has(r.id)) errs.push(`${r.id}: duplicate`); ids.add(r.id);
    if (!r.name) errs.push(`${r.id}: name`);
    if (!r.real?.place || !r.real?.state || !Number.isFinite(r.real?.lat) || !Number.isFinite(r.real?.lon) || !r.real?.refs?.length) errs.push(`${r.id}: real`);
    if (!BIOMES[r.biome]) errs.push(`${r.id}: biome ${r.biome}`);
    if (!KINDS_OK.has(r.kind)) errs.push(`${r.id}: kind ${r.kind}`);
    if (!LAYOUT_ARCH[r.layout]) errs.push(`${r.id}: layout ${r.layout}`);
    if (!(r.footprint?.[0] >= 100 && r.footprint?.[0] <= 700)) errs.push(`${r.id}: footprint`);
    for (const s of r.structures ?? []) if (!kindOf(s.kind)) errs.push(`${r.id}: structure ${s.kind} has no programme`);
    for (const c of r.palette ?? []) { const n = parseInt(c.slice(1), 16), R = (n >> 16) / 255, G = ((n >> 8) & 255) / 255, B = (n & 255) / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn; if (d > 0.06) { let h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4; h = (h * 60 + 360) % 360; if (h >= 270 && h <= 320) errs.push(`${r.id}: purple ${c}`); } }
  }
  return { ok: !errs.length, errs, rows: rows.length, states: new Set(rows.map((r) => r.real?.state)).size };
}
