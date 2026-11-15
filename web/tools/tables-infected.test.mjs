// THE INFECTED TABLES = THE OLD JS, field by field. Run: node --import ./tools/tables/register-json.mjs --test tools/tables-infected.test.mjs
// Fixture: tools/fixtures/tables/infected.legacy.json (commit 1d214828). Null in the old data (the echo has `lunge: null`) = an empty cell = absent.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { tableObjects, tableOne } from '../src/data/tables/load.js';
import { breedOrder, choirSites } from '../src/data/tables/infected/index.js';

const snap = JSON.parse(readFileSync(new URL('./fixtures/tables/infected.legacy.json', import.meta.url), 'utf8'));
const strip = (o) => (Array.isArray(o) ? o.map(strip) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null).map(([k, v]) => [k, strip(v)])) : o);
const F = 'infected';
const same = (got, want, what) => { assert.deepEqual(Object.keys(got), Object.keys(want), `${what}: rows and order`); assert.deepStrictEqual(got, strip(want), what); };

test('the tables equal the old rows', () => {
  same(tableObjects(F, 'Infected'), snap.INFECTED, 'INFECTED'); assert.deepEqual(breedOrder(), snap.BREEDS);
  assert.deepStrictEqual(tableOne(F, 'FootstepSettings'), snap.FOOTSTEPS); assert.deepStrictEqual(tableOne(F, 'DriftSettings'), snap.DRIFT);
  same(tableObjects(F, 'InsideBuildings'), snap.INSIDE, 'INSIDE'); assert.deepStrictEqual(choirSites(), snap.CHOIR_SITES);
  same(tableObjects(F, 'BreedAnswers'), snap.BREED_ANSWERS, 'BREED_ANSWERS'); assert.deepStrictEqual(tableOne(F, 'EchoMind'), snap.ECHO_MIND);
  assert.deepStrictEqual(tableOne(F, 'WarningSettings'), snap.WARNINGS); assert.deepStrictEqual(tableOne(F, 'MigrationSettings'), snap.MIGRATION);
});
test('the echo has no lunge (null in the old row = absent): code that tests `!b.lunge` sees the same', () => assert.equal(tableObjects(F, 'Infected').echo.lunge, undefined));
test('the game modules (wrapped or not) still give the old data', async () => {
  const I = await import('../src/data/infected.js'), H = await import('../src/data/hordes.js');
  same(strip(I.INFECTED), snap.INFECTED, 'INFECTED'); assert.deepEqual(I.BREEDS, snap.BREEDS); assert.deepStrictEqual(I.FOOTSTEPS, snap.FOOTSTEPS); assert.deepStrictEqual(I.DRIFT, snap.DRIFT);
  same(I.INSIDE, snap.INSIDE, 'INSIDE'); assert.deepStrictEqual(I.CHOIR_SITES, snap.CHOIR_SITES);
  same(H.BREED_ANSWERS, snap.BREED_ANSWERS, 'BREED_ANSWERS'); assert.deepStrictEqual(H.ECHO_MIND, snap.ECHO_MIND); assert.deepStrictEqual(H.WARNINGS, snap.WARNINGS); assert.deepStrictEqual(H.MIGRATION, snap.MIGRATION);
});
