// CHAIN TOWING ON FOOT unit tests (src/data/towing.js TOW_FOOT and the lines it uses). Run: node --test tools/chaintow.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LINES, TOW, TOW_FOOT, TOW_ITEMS } from '../src/data/towing.js';
import { ITEMS } from '../src/data/items.js';

test('the lines you carry on foot are items you can find (a chain and a rope), not minted', () => {
  for (const k of ['chain', 'rope']) {
    const id = LINES[k].item;
    assert.ok(id, k);
    assert.ok(ITEMS[id] || TOW_ITEMS[id], `${id} is an item row`);
  }
});
test('you can work an end from where you stand, but not from across a car', () => {
  assert.ok(TOW_FOOT.reach > 1 && TOW_FOOT.reach < 2.5);
  assert.ok(TOW_FOOT.reach < TOW.reach + 1);
});
test('the leash is the line plus a little slack: a 4 m chain keeps you within ~4.6 m of its hook', () => {
  assert.ok(TOW_FOOT.leash > 0 && TOW_FOOT.leash < 1.5);
  assert.ok(LINES.chain.len + TOW_FOOT.leash < 6);
});
test('hooking takes a beat (bent over the hook), but not long', () => assert.ok(TOW_FOOT.hookTime >= 0.5 && TOW_FOOT.hookTime <= 3));
test('a chain is stronger than a rope (what you hook decides what you can pull)', () => assert.ok(LINES.chain.breakLoad > LINES.rope.breakLoad));
