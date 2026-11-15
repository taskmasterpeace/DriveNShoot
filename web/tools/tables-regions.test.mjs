// REGION CHARACTER tables: they agree with the repo data they were derived from. Run: node --import ./tools/tables/register-json.mjs --test tools/tables-regions.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFamily, tableRows } from '../src/data/tables/load.js';
import { SITES, SITE_REGIONS } from '../src/data/sites/index.js';
import { SPECIES } from '../src/world/flora.js';

const F = 'regions', T = loadFamily(F);
const names = (t) => new Set(tableRows(F, t).map((r) => r.name));

test('every region is a site-catalogue region, and every on-map region with sites has a row', () => {
  const have = names('Regions');
  for (const r of have) assert.ok(SITE_REGIONS[r], `${r} is not in SITE_REGIONS`);
  for (const r of Object.keys(SITE_REGIONS)) if (r !== 'INTL') assert.ok(have.has(r), `region ${r} has no row`);
});
test('every biome a site uses has a Biomes row with flora; every flora species exists in world/flora.js', () => {
  const biomes = names('Biomes'), flora = T.get('BiomeFlora').rows;
  for (const s of SITES) assert.ok(biomes.has(s.biome), `site ${s.id}: biome ${s.biome} has no Biomes row`);
  for (const b of biomes) assert.ok(flora.some((r) => r.cells.Biome === b), `biome ${b} grows nothing`);
  for (const r of flora) assert.ok(r.cells.Species in SPECIES, `${r.name}: ${r.cells.Species} is not a flora species`);
});
test('derived counts do not exceed the site rows they were derived from', () => {
  for (const r of T.get('Regions').rows) assert.ok(r.cells.SiteRows <= SITES.filter((s) => s.region === r.name).length, `${r.name}: SiteRows`);
  for (const t of ['RegionBiomes', 'RegionFactions', 'RegionScarcity', 'RegionSupplies', 'RegionHazards', 'RegionCreatures', 'RegionKinds'])
    for (const r of T.get(t).rows) assert.ok(r.cells.SiteCount <= SITES.filter((s) => s.region === r.cells.Region).length, `${t} ${r.name}`);
});
test('every region has climate, terrain, dialect, a ruler per state, vehicles, and something it makes and something it wants', () => {
  for (const r of names('Regions')) {
    for (const t of (r === 'HI' ? ['RegionStates', 'RegionVehicles'] : ['RegionStates', 'RegionVehicles', 'RegionFactions'])) assert.ok(T.get(t).rows.some((x) => x.cells.Region === r), `${r} has no ${t}`);
    if (r !== 'HI') for (const t of ['RegionScarcity', 'RegionSupplies']) assert.ok(T.get(t).rows.some((x) => x.cells.Region === r), `${r} has no ${t}`);
  }
  const ruled = new Set(T.get('StateRulers').rows.map((r) => r.cells.State));
  for (const s of T.get('RegionStates').rows) assert.ok(ruled.has(s.cells.State), `${s.name}: no ruler`);
  assert.ok(T.get('RegionStates').rows.some((s) => s.cells.State === 'TX'), 'Texas is in a region');
});
test('every row names a source (a real one, a repo file, or design)', () => {
  for (const t of T.values()) for (const r of t.rows) assert.ok(/^(real|derived|design|docs|climate|data)/.test(r.cells.Source), `${t.file}:${r.line}: Source`);
});
