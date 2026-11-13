// VEHICLES V2, damage you feel: the rows (data/damagefeel.js) in node. node --test tools/damagefeel.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAT, RIM, BRAKES, HEAT, FIXES, FEEL_ITEMS, encodeDm, decodeDm, DM_MAX, validateFeel } from '../src/data/damagefeel.js';
import { ITEMS, LOOT } from '../src/data/items.js';
import { cleanPresence } from '../src/net/protocol.js';

const all = { ...ITEMS, ...FEEL_ITEMS };
test('the rows validate against the real items and loot tables', () => assert.deepEqual(validateFeel(all, LOOT), []));
test('a front flat pulls the wheel, a rear one walks the tail', () => { assert.ok(FLAT.front.pull > FLAT.rear.pull); assert.ok(FLAT.rear.tail > 0); });
test('four flats are a crawl; a rim lasts a while then scrapes', () => { assert.ok(FLAT.allFour < 0.5); assert.ok(RIM.life > 500 && RIM.scrapeAt < 1); });
test('brakes fade before they fail; an engine seizes past the boil and frees well under it', () => { assert.ok(BRAKES.failAt < BRAKES.fadeAt); assert.ok(HEAT.seize > 1 && HEAT.restart < 1); });
test('a wheel change takes a spare AND a jack; every fix takes time', () => { assert.equal(FIXES.tyre.item, 'spare_tyre'); assert.equal(FIXES.tyre.tool, 'car_jack'); for (const F of Object.values(FIXES)) assert.ok(F.secs > 0); });
test('the damage word round-trips, and the shard cleaner keeps it', () => {
  const s = { flat: { FL: true, FR: false, RL: false, RR: true }, rimGone: { RR: true }, smoke: true, steam: false, leak: true, dragF: false, dragR: true, seized: false, pullL: true, pullR: false, brakes: true };
  const n = encodeDm(s), d = decodeDm(n);
  assert.ok(d.flat.FL && d.flat.RR && !d.flat.FR && d.rimGone.RR && d.smoke && d.leak && d.dragR && d.pullL && d.brakes && !d.steam);
  const m = cleanPresence({ x: 1, z: 2, v: { t: 'sedan', x: 1, z: 2, dm: n } });
  assert.equal(m.v.dm, n);
  assert.equal(cleanPresence({ x: 1, z: 2, v: { t: 'sedan', x: 1, z: 2, dm: DM_MAX + 5 } }).v.dm, 0);
});
