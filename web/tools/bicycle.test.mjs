// VEHICLES V2 slice 10: the bicycle rows (data/bicycle.js) in node. node --test tools/bicycle.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { BICYCLE_ROW, PEDAL, BICYCLES, validateBicycle, hue } from '../src/data/bicycle.js';

test('the rows validate', () => assert.deepEqual(validateBicycle(), []));
test('no engine, no tank, one rider, leans like a bike', () => {
  assert.equal(BICYCLE_ROW.fuelCap, 0); assert.ok(BICYCLE_ROW.noEngine && BICYCLE_ROW.pedal && BICYCLE_ROW.bike);
  assert.equal(BICYCLE_ROW.seats.length, 1);
});
test('a bicycle is slower than anything with a motor (top speed under 15 m/s)', () => assert.ok(BICYCLE_ROW.maxSpeed < 15));
test('the legs: standing pushes harder and drains faster, winded is weak, coasting recovers', () => {
  assert.ok(PEDAL.stand > 1 && PEDAL.standDrain > PEDAL.drain && PEDAL.winded < 0.5 && PEDAL.regen > 0);
});
test('the no-purple law catches a purple frame', () => { assert.ok(hue('#8a2be2') >= 260 && hue('#8a2be2') <= 330); assert.equal(hue('#444444'), -1); });
test('each bicycle is placed once, none in Rust Haven where the start and the checks stage', () => {
  assert.equal(new Set(BICYCLES.map((b) => b.id)).size, BICYCLES.length);
  for (const b of BICYCLES) assert.ok(Math.hypot(b.near.x, b.near.z + 40) > 250, b.id);
});
