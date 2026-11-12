// VEHICLES V2 slice 11: the sky drone rows (data/skydrones.js) in node. node --test tools/skydrones.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SKY_DRONES, NEST_RULES, DRONE_NESTS, validateSkyDrones } from '../src/data/skydrones.js';

test('the rows validate', () => assert.deepEqual(validateSkyDrones(), []));
test('a recon drone and an armed one', () => {
  const roles = Object.values(SKY_DRONES).map((D) => D.role);
  assert.ok(roles.includes('recon') && roles.includes('armed'));
});
test('the gun drone reaches you from its orbit and flies lower than the watcher', () => {
  const S = SKY_DRONES.striker, W = SKY_DRONES.watcher;
  assert.ok(S.gun.range > S.orbit + 4); assert.ok(S.alt < W.alt);
});
test('every drone leaves parts when it falls (nothing for free beyond what it was made of)', () => {
  for (const D of Object.values(SKY_DRONES)) { assert.ok(D.salvage.length > 0); for (const [, n] of D.salvage) assert.ok(n > 0 && n <= 12); }
});
test('a nest flies a watcher and builds a lost drone again after a day', () => {
  for (const N of DRONE_NESTS) assert.ok(N.flies.includes('watcher'), N.id);
  assert.equal(NEST_RULES.rebuild, 24);
});
test('validation catches a nest with a drone that does not exist', () => {
  DRONE_NESTS.push({ id: 'bad_nest', faction: 'raider', at: { x: 0, z: 0 }, loop: 10, flies: ['nope'] });
  try { assert.ok(validateSkyDrones().some((b) => b.includes('bad_nest'))); } finally { DRONE_NESTS.pop(); }
});
