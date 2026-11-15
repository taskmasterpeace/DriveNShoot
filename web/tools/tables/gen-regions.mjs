// Builds src/data/tables/regions/*.csv + schemas (REGION CHARACTER: one row per region, new data; nothing reads it yet).
// Run: node --import ./tools/tables/register-json.mjs tools/tables/gen-regions.mjs
// Facts come from the repo's own data where it has them (the site catalogue src/data/sites, the rulers in data/atlas.js,
// the species in world/flora.js); the rest is authored here and marked `design` or a real source in each row's Source.
// After the first run the CSVs are the source of truth: edit them; re-running overwrites hand edits.
import { writeFileSync, mkdirSync } from 'node:fs';
import { csvCell } from './extract.mjs';
import { SITES, SITE_REGIONS } from '../../src/data/sites/index.js';
import { RULERS } from '../../src/data/atlas.js';
import { SPECIES } from '../../src/world/flora.js';

const OUT = new URL('../../src/data/tables/regions/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const REGIONS = ['FL', 'SW', 'CA', 'GULF', 'MW', 'NE', 'SE', 'NW', 'PLAINS', 'AK', 'HI']; // INTL (off the map) has no climate of its own
const BAND = ['hot_desert', 'semi_arid', 'mediterranean', 'humid_subtropical', 'humid_continental', 'marine_west_coast', 'subarctic_tundra', 'tropical_oceanic'];
const KOPPEN = 'real: Koppen-Geiger climate classification (Peel, Finlayson and McMahon 2007), the class covering most of the region';
const PHYS = 'real: USGS physiographic provinces, the dominant landform of the region';

// climate, terrain, dialect, note: per region. `dialect`: a tag for the voice/barks systems; no data existed, so it is design.
const R = {
  FL: { band: 'humid_subtropical', terrain: 'flat_coastal_plain', dialect: 'florida_mix', note: 'Flat, wet, hurricane coast; the south is tropical savanna. The start region (data/regions.js).' },
  SW: { band: 'hot_desert', terrain: 'basin_and_range_plateau', dialect: 'southwest_borderland', note: 'Hot desert basins in the south, cold high plateau and alpine ranges in the north (AZ NM NV UT CO).' },
  CA: { band: 'mediterranean', terrain: 'coast_ranges_valley_desert', dialect: 'west_coast', note: 'Dry-summer coast and Central Valley, Mojave to the east, rain forest in the far north.' },
  GULF: { band: 'humid_subtropical', terrain: 'delta_and_coastal_plain', dialect: 'gulf_creole', note: 'Bayou, delta and pine flatwoods; hurricane and flood country.' },
  MW: { band: 'humid_continental', terrain: 'glaciated_plain_and_lakes', dialect: 'inland_north', note: 'Lake shore industry, prairie farm and hardwood forest; hard winters.' },
  NE: { band: 'humid_continental', terrain: 'ridge_valley_and_coast', dialect: 'northeast_coastal', note: 'Dense old cities on a drowned coast, the Appalachian ridges inland.' },
  SE: { band: 'humid_subtropical', terrain: 'appalachian_ridges_and_piedmont', dialect: 'southern_highland', note: 'Hollows, ridges, red-clay piedmont; mild winters on the coast side, cold on the ridges.' },
  NW: { band: 'marine_west_coast', terrain: 'cordillera_and_basalt_plateau', dialect: 'northwest_mountain', note: 'Wet coast ranges, dry basalt plateau and the northern Rockies to the east.' },
  PLAINS: { band: 'semi_arid', terrain: 'open_plains_and_badlands', dialect: 'plains_midland', note: 'Open grass, wind, farm towns and badlands; wide temperature swings.' },
  AK: { band: 'subarctic_tundra', terrain: 'mountain_and_tundra', dialect: 'alaskan_frontier', note: 'Mountains, tundra, long dark winters.' },
  HI: { band: 'tropical_oceanic', terrain: 'volcanic_islands', dialect: 'island_pidgin', note: 'Volcanic islands; no site rows in the catalogue yet.' },
};
const VEH = {
  FL: { airboat: 3, sedan: 2, pickup: 2, skiff: 2, jetski: 1, rv: 1 }, SW: { pickup: 3, buggy: 2, atv: 2, bike: 2, van: 1, patrol: 1 },
  CA: { sedan: 3, van: 2, bike: 2, pickup: 1, rv: 1, interceptor: 1 }, GULF: { airboat: 3, pickup: 3, skiff: 2, barge: 1, sedan: 1 },
  MW: { pickup: 3, sedan: 2, van: 2, semi: 2, towtruck: 1 }, NE: { sedan: 3, van: 2, bullcar: 1, interceptor: 1, towtruck: 1, ferry: 1 },
  SE: { pickup: 4, atv: 2, sedan: 1, bike: 1 }, NW: { pickup: 3, atv: 2, patrol: 1, rig: 1, bike: 1 },
  PLAINS: { pickup: 3, semi: 2, rig: 1, patrol: 1, atv: 1, van: 1 }, AK: { atv: 3, pickup: 2, skiff: 2, raft: 1 }, HI: { jetski: 2, bike: 2, skiff: 2, sedan: 1 },
};
// Biomes (the site catalogue's own vocabulary) -> what grows: species keys that exist in world/flora.js SPECIES.
const BIOME = {
  desert_sonoran: ['Sonoran desert: saguaro, paloverde, creosote scrub.', { saguaro: 4, paloverde: 3, mesquite: 2, ocotillo: 2, creosote: 3, pricklypear: 2 }],
  desert_mojave: ['Mojave desert: Joshua tree and creosote.', { joshua: 4, creosote: 4, tumbleweed: 2, pricklypear: 1 }],
  high_plateau: ['Cold high desert and pinyon plateau.', { pine: 3, tumbleweed: 2, oak: 1, deadtree: 1 }],
  alpine: ['Conifer mountains above the tree line of the plains.', { pine: 5, deadtree: 1 }],
  salt_flat: ['Dry lake bed and salt pan: almost nothing grows.', { tumbleweed: 1, deadtree: 1 }],
  great_plains: ['Short and tall grass prairie, wind-bent trees along water.', { tumbleweed: 2, oak: 1, deadtree: 1 }],
  prairie_farm: ['Farm country: field edges, shelter belts, oak groves.', { oak: 2, tumbleweed: 1 }],
  badlands: ['Eroded clay and rock, sparse scrub.', { tumbleweed: 2, deadtree: 1, pine: 1 }],
  temperate_forest: ['Eastern hardwood forest.', { oak: 6, pine: 2 }],
  northern_pine: ['Northern pine and spruce.', { pine: 7, oak: 1 }],
  appalachian: ['Hardwood ridges with pine on the dry slopes.', { oak: 5, pine: 3, deadtree: 1 }],
  great_lakes_rust: ['Lake-shore industrial belt: second growth over dead yards.', { oak: 3, pine: 2, deadtree: 2 }],
  atlantic_coast: ['Mid-Atlantic and New England coast: oak, pine, salt marsh edge.', { oak: 3, pine: 3, sabal: 2, liveoak: 1 }],
  gulf_coast: ['Gulf coast: live oak, palmetto, slash pine, cypress in the wet.', { liveoak: 3, sabal: 3, slashpine: 3, cypress: 2 }],
  deep_south_swamp: ['Cypress swamp and slough.', { cypress: 6, sabal: 2, slashpine: 2, deadtree: 1 }],
  pacific_rain: ['Pacific coast rain forest: big conifers.', { pine: 6, oak: 2 }],
  tundra_north: ['Tundra and taiga: stunted spruce, dead snags.', { pine: 2, deadtree: 2 }],
  river_delta: ['River delta: cypress and palm over mud.', { cypress: 3, sabal: 1 }],
};

// ---- derive from the site catalogue ----------------------------------------------------------------------------------
const bySite = (r) => SITES.filter((s) => s.region === r);
const count = (list) => { const m = new Map(); for (const x of list) if (x) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)); };
const id = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const TOP = 8;

const tables = [];
function table(name, description, cols, rows, parent) {
  tables.push({ name, description, cols, rows });
  void parent;
}
const C = (name, type, extra = {}) => ({ name, type, path: null, required: true, ...extra });
const NAME = C('Name', 'string', { description: 'Row key.' });
const SRC = C('Source', 'string', { description: 'Where the fact came from: a real source, a repo file, or `design`.' });

table('Biomes', 'The site catalogue\'s biome vocabulary, one row per biome (src/data/sites/validate.js BIOMES). Joined by RegionBiomes and BiomeFlora.',
  [NAME, C('Description', 'string'), SRC],
  Object.entries(BIOME).map(([k, [d]]) => [k, d, 'design: after the real ecoregion (flora keys are world/flora.js SPECIES)']));

table('BiomeFlora', 'What grows in a biome: a species key (world/flora.js SPECIES) and a relative weight. Weights are relative within a biome.',
  [NAME, C('Biome', 'string', { ref: { table: 'Biomes', column: 'Name' } }), C('Species', 'string', { enum: Object.keys(SPECIES) }), C('Weight', 'float', { unit: '', min: 0 }), SRC],
  Object.entries(BIOME).flatMap(([b, [, f]]) => Object.entries(f).map(([sp, w]) => [`${b}_${sp}`, b, sp, w, 'design: species present in the real biome; weights after data/regions.js Florida rows where they exist'])));

table('Regions', 'One row per region of the country: climate band, terrain, dialect tag, and the count of site rows that back the derived tables. Region ids are the site catalogue\'s (src/data/sites/index.js SITE_REGIONS). NOTHING READS THIS YET (docs/design/WEB_REGION_CHARACTER.md says who should).',
  [NAME, C('Label', 'string'), C('ClimateBand', 'string', { enum: BAND }), C('Terrain', 'string'), C('DialectTag', 'string'), C('SiteRows', 'int', { unit: 'count', min: 0, description: 'Site rows in src/data/sites for this region when derived.' }), C('Note', 'string'), SRC],
  REGIONS.map((r) => [r, SITE_REGIONS[r].label, R[r].band, R[r].terrain, R[r].dialect, bySite(r).length, R[r].note,
    `climate: ${KOPPEN}; terrain: ${PHYS}; dialect: design (tags only; no data existed); SiteRows: derived from src/data/sites`]));

table('RegionStates', 'Which states are in a region, and who rules each (the canon rulers).',
  [NAME, C('Region', 'string', { ref: { table: 'Regions', column: 'Name' } }), C('State', 'string'), C('Ruler', 'string', { required: false }), SRC],
  REGIONS.flatMap((r) => SITE_REGIONS[r].states.map((st) => [`${r}_${st}`, r, st, RULERS[st] ?? (st === 'DC' ? 'no ruler: the Capitol Dead Zone' : ''), 'docs/DIVIDED_STATES.md (the fifty rulers), data/atlas.js RULERS'])));

table('RegionBiomes', 'Biomes in a region and how many of its site rows use each. Derived from the site catalogue.',
  [NAME, C('Region', 'string', { ref: { table: 'Regions', column: 'Name' } }), C('Biome', 'string', { ref: { table: 'Biomes', column: 'Name' } }), C('SiteCount', 'int', { unit: 'count', min: 1 }), SRC],
  REGIONS.flatMap((r) => count(bySite(r).map((s) => s.biome)).map(([b, n]) => [`${r}_${b}`, r, b, n, `derived: src/data/sites (${n} of ${bySite(r).length} ${r} site rows)`])));

const derive = (name, desc, colName, pick, limit = TOP) => table(name, desc,
  [NAME, C('Region', 'string', { ref: { table: 'Regions', column: 'Name' } }), C(colName, 'string'), C('SiteCount', 'int', { unit: 'count', min: 1 }), SRC],
  REGIONS.flatMap((r) => count(bySite(r).flatMap(pick)).slice(0, limit).map(([v, n]) => [`${r}_${id(v)}`, r, id(v), n, `derived: src/data/sites (${n} of ${bySite(r).length} ${r} site rows)`])));

derive('RegionFactions', 'Who holds ground in a region: the faction id of each site row\'s society, with the number of sites. Local holdout families appear under their own ids.', 'Faction', (s) => [s.society?.faction]);
derive('RegionScarcity', 'What a region\'s sites WANT (economy.wants): the goods that are scarce there, by how many sites want them.', 'Good', (s) => s.economy?.wants ?? []);
derive('RegionSupplies', 'What a region makes or loots (economy.makes + loot): the goods that are plentiful there.', 'Good', (s) => [...(s.economy?.makes ?? []), ...(s.loot ?? [])]);
derive('RegionHazards', 'Hazards named by a region\'s site rows.', 'Hazard', (s) => s.hazards ?? []);
derive('RegionCreatures', 'Creatures named by a region\'s site rows.', 'Creature', (s) => s.creatures ?? []);
derive('RegionKinds', 'What kinds of place the region has (site `kind`): holdout, ruin, trade, military ...', 'Kind', (s) => [s.kind], 12);

table('RegionVehicles', 'The vehicles you see in a region: a Vehicles row key (tables/vehicles/Vehicles.csv) and a relative weight.',
  [NAME, C('Region', 'string', { ref: { table: 'Regions', column: 'Name' } }), C('Vehicle', 'string', { ref: { family: 'vehicles', table: 'Vehicles', column: 'Name' }, description: 'A Name in vehicles/Vehicles.csv (a cross-family key, checked at load).' }), C('Weight', 'float', { unit: '', min: 0 }), SRC],
  REGIONS.flatMap((r) => Object.entries(VEH[r]).map(([v, w]) => [`${r}_${v}`, r, v, w, 'design: what fits the region\'s roads, water and weather'])));

// ---- write ------------------------------------------------------------------------------------------------------------
for (const t of tables) {
  const cols = t.cols.map((c) => {
    const o = { ...c };
    if ((o.type === 'float' || o.type === 'int') && o.unit === undefined) o.unit = '';
    return o;
  });
  for (const row of t.rows) if (row.length !== cols.length) throw new Error(`${t.name}: row width ${row.length} != ${cols.length}: ${row}`);
  const lines = [cols.map((c) => csvCell(c.name)).join(','), ...t.rows.map((r) => r.map(csvCell).join(','))];
  writeFileSync(OUT + `${t.name}.csv`, lines.join('\n') + '\n');
  const schema = { $comment: 'Hand-editable. path null = a table-only column (nothing builds a game object from this table yet).', table: t.name, family: 'regions', key: 'Name', rowStruct: `FDsoa${t.name}Row`, description: t.description, columns: cols.map((c) => ({ required: false, ...c })) };
  writeFileSync(OUT + `${t.name}.schema.json`, JSON.stringify(schema, null, 2) + '\n');
}
console.log(tables.map((t) => `${t.name}:${t.rows.length}`).join(' '), 'rows', tables.reduce((a, t) => a + t.rows.length, 0));
void BAND;
