// THE ITEM TABLES = THE OLD items.js, field by field. Run: node --import ./tools/tables/register-json.mjs --test tools/tables-items.test.mjs
// Fixture: tools/fixtures/tables/items.legacy.json (commit 1d214828): `inline` = the literals typed in items.js, `composed` = what the game saw
// after items.js folded in gear, gadgets, melee, maker and fan-nod rows. Both must still hold.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { tableObjects, tableOne } from '../src/data/tables/load.js';

const snap = JSON.parse(readFileSync(new URL('./fixtures/tables/items.legacy.json', import.meta.url), 'utf8'), (k, v) => (v === '__Infinity__' ? Infinity : v));
const F = 'items', I = snap.inline, C = snap.composed;
const same = (got, want, what) => { assert.deepEqual(Object.keys(got), Object.keys(want), `${what}: rows and order`); assert.deepStrictEqual(got, want, what); };
const itemMap = (t) => Object.fromEntries(Object.entries(tableObjects(F, t)).map(([k, v]) => [k, v.item]));

test('the tables equal the literals that were typed in items.js', () => {
  same(tableObjects(F, 'Items'), { ...I.ITEMS, ...I.GATOR_ITEMS }, 'ITEMS');
  same(tableObjects(F, 'LootTables'), I.LOOT, 'LOOT');
  same(itemMap('AmmoTypeItems'), I.AMMO_ITEM, 'AMMO_ITEM'); same(itemMap('GunItems'), I.GUN_ITEM, 'GUN_ITEM');
  same(tableObjects(F, 'GunWear'), I.GUN_WEAR, 'GUN_WEAR'); assert.deepStrictEqual(tableOne(F, 'GunCare'), I.GUN_CARE);
  same(tableObjects(F, 'GunFound'), I.GUN_FOUND, 'GUN_FOUND'); assert.deepStrictEqual(tableOne(F, 'StartKit'), I.START_KIT);
  assert.equal(tableOne(F, 'PackSettings').bodyLitres, I.BODY_LITRES);
});
test('items.js, loaded and folded the way the game does, equals what the game saw before', async () => {
  const m0 = await import('../src/data/items.js');
  const m = Object.fromEntries(Object.entries(m0).filter(([, v]) => typeof v !== 'function').map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])); // the snapshot is JSON: folded gear rows carry `tags: undefined`, which JSON drops
  same(m.ITEMS, C.ITEMS, 'ITEMS (composed)'); same(m.LOOT, C.LOOT, 'LOOT (composed)');
  same(m.AMMO_ITEM, C.AMMO_ITEM, 'AMMO_ITEM'); same(m.GUN_ITEM, C.GUN_ITEM, 'GUN_ITEM');
  same(m.GUN_WEAR, C.GUN_WEAR, 'GUN_WEAR'); assert.deepStrictEqual(m.GUN_CARE, C.GUN_CARE); same(m.GUN_FOUND, C.GUN_FOUND, 'GUN_FOUND');
  assert.deepStrictEqual(m.START_KIT, C.START_KIT); assert.equal(m.BODY_LITRES, C.BODY_LITRES);
  assert.equal(Object.keys(m.ITEMS).length, 204);
});
test('every loot row names an item that exists once everything is folded in', async () => {
  const { ITEMS, LOOT } = await import('../src/data/items.js');
  for (const [t, T] of Object.entries(LOOT)) for (const r of T.rows) assert.ok(ITEMS[r[0]], `${t}: ${r[0]}`);
});
