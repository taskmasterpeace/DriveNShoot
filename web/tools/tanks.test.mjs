// TANKS unit tests (src/data/tanks.js). Run: node --test tools/tanks.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TANK_ROWS, TANK_GUNS, TANK_AMMO, TANK_CHASSIS, TANKS_PLACED, validateTanks } from '../src/data/tanks.js';

test('the rows validate', () => assert.deepEqual(validateTanks(), []));
test('an old tank and a new one: the new is faster, tougher and its gun hits harder and reaches further', () => {
  const o = TANK_ROWS.tank_old, n = TANK_ROWS.tank_new, go = TANK_GUNS.cannon75, gn = TANK_GUNS.cannon120;
  assert.ok(n.maxSpeed > o.maxSpeed && n.hp > o.hp && n.armor <= o.armor);
  assert.ok(gn.dmg > go.dmg && gn.range > go.range && gn.blast > go.blast);
});
test('a tank shrugs off what a car cannot: armour well under the armoured carrier\'s 0.06, hp in the thousands', () => {
  for (const r of Object.values(TANK_ROWS)) { assert.ok(r.armor < 0.06); assert.ok(r.hp >= 1500); }
});
test('the turret is the top mount at the hull\'s own spot, big enough for its gun', () => {
  for (const [t, C] of Object.entries(TANK_CHASSIS)) { assert.ok(C.mounts.top.at.length === 3 && C.mounts.top.arc >= Math.PI - 1e-9); }
  for (const W of Object.values(TANK_GUNS)) { assert.equal(W.faces.length, 1); assert.equal(W.faces[0], 'top'); assert.ok(W.turret.length === 3 && W.barrel > 2); }
});
test('no free loot: the old tank stands empty and dry; the outpost\'s has a few rounds, not a full rack', () => {
  const old = TANKS_PLACED.find((p) => p.type === 'tank_old'), neu = TANKS_PLACED.find((p) => p.type === 'tank_new');
  assert.equal(old.kit.rounds, 0); assert.equal(old.fuel, 0);
  assert.ok(neu.kit.rounds < TANK_GUNS[neu.kit.top].mag / 2);
});
test('every shell is an item you can carry (heavy), generic names, no purple', () => {
  for (const a of Object.values(TANK_AMMO)) { assert.ok(a.kg >= 9 && a.kind === 'ammo'); }
  for (const r of Object.values(TANK_ROWS)) assert.ok(!/[A-Z][a-z]+ [A-Z]\d/.test(r.name));
});
