// THE CAVALRY COMPANY unit tests (src/data/cavalry.js; the loop maths in src/systems/cavalry.js). Run: node --test tools/cavalry.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCavalry, COMPANY, RIDER, CAVALRY_POSTS, CAVALRY } from '../src/data/cavalry.js';
import { BREEDS } from '../src/data/horses.js';

test('the rows validate against the horses\' breeds', () => assert.deepEqual(validateCavalry(BREEDS), []));
test('the company is at war with the Dustwolves and the infected, not with Rust Haven or the drifters', () => {
  assert.ok(COMPANY.relations.dustwolves <= -50 && COMPANY.relations.infected <= -50);
  assert.ok(COMPANY.relations.rusthaven > -50 && COMPANY.relations.drifters > -50);
});
test('wary of you at the start, not shooting on sight', () => assert.ok(COMPANY.start < 0 && COMPANY.start > -50));
test('every trooper has a flag (everybody is from somewhere)', () => { assert.equal(RIDER.names.length, RIDER.flags.length); for (const f of RIDER.flags) assert.match(f, /^[A-Z]{2}$/); });
test('the patrol loops stay where the riders are bodies (inside liveR of the post)', () => {
  for (const P of CAVALRY_POSTS) for (const T of P.patrols) for (const [x, z] of T.route) assert.ok(Math.hypot(x, z) <= CAVALRY.liveR);
});
test('nobody is placed twice: a post is a row, its people a list (the dead stay dead)', () => {
  const ids = CAVALRY_POSTS.map((p) => p.id); assert.equal(new Set(ids).size, ids.length);
  assert.ok(CAVALRY.dropR > CAVALRY.liveR);
});
test('a purple coat would be refused', async () => {
  const m = await import('../src/data/cavalry.js');
  const keep = m.RIDER.colors.coat; m.RIDER.colors.coat = '#8a2be2';
  try { assert.ok(m.validateCavalry(BREEDS).some((b) => /purple/.test(b))); } finally { m.RIDER.colors.coat = keep; }
});
