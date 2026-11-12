// VEHICLES V2 slice 9: the monster truck rows (data/monster.js) in node. node --test tools/monster.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MONSTER_ROW, MONSTER_GLASS, MONSTER_CHASSIS, MONSTERS, validateMonster } from '../src/data/monster.js';

const UTILITY = { monster: { chassis: [] } };
test('the rows validate against a workshop with MONSTER TYRES', () => assert.deepEqual(validateMonster(UTILITY), []));
test('without MONSTER TYRES in the workshop it says so', () => assert.ok(validateMonster({}).length > 0));
test('its tyres are built in, not loose loot', () => assert.deepEqual(MONSTER_ROW.builtIn.utility, ['monster']));
test('the cab glass sits inside the body and above the hood', () => {
  assert.ok(MONSTER_GLASS.zA < MONSTER_ROW.len / 2 && MONSTER_GLASS.zC > -MONSTER_ROW.len / 2);
  assert.ok(MONSTER_GLASS.yR < MONSTER_ROW.tall && MONSTER_GLASS.wB <= MONSTER_ROW.wid);
});
test('the chassis has a top mount and every face armour cap', () => {
  assert.ok(MONSTER_CHASSIS.mounts.top && MONSTER_CHASSIS.maxKg > 0);
  for (const f of ['front', 'rear', 'left', 'right', 'top', 'under']) assert.ok(MONSTER_CHASSIS.faces[f] > 0, f);
});
test('the Dust Bowl truck is parked on fumes, once', () => {
  assert.equal(new Set(MONSTERS.map((m) => m.id)).size, MONSTERS.length);
  for (const M of MONSTERS) assert.ok(M.fuel <= 0.5, M.id);
  const full = [{ ...MONSTERS[0], fuel: 1 }];
  assert.ok(full[0].fuel > 0.5);
});
