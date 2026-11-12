// THE SUV unit tests (src/data/suv.js against the LONGHAULER's hold, data/trailers.js). Run: node --test tools/suv.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SUV_ROW, SUV_GLASS, SUV_CHASSIS } from '../src/data/suv.js';
import { TRAILERS, FREIGHT, fitsHold } from '../src/data/trailers.js';

test('the SUV fits the box trailer\'s hold (width, length, under the door, the weight)', () => assert.equal(fitsHold(TRAILERS.box, SUV_ROW), null));
test('it is taller than a sedan and still clears the door with room', () => { assert.ok(SUV_ROW.tall > 1.8); assert.ok(SUV_ROW.tall < TRAILERS.box.hold.h - 0.15); });
test('the freight\'s box rig carries one beside its sedan, inside the hold\'s car count and weight', () => {
  const r = FREIGHT.rigs.boxes.find((q) => q.cargo?.includes('suv'));
  assert.ok(r); assert.ok(r.cargo.length <= TRAILERS[r.trailer].maxCargo.cars);
  const mass = r.cargo.reduce((m, t) => m + (t === 'suv' ? SUV_ROW.mass : t === 'sedan' ? 1.5 : 0), 0);
  assert.ok(mass <= TRAILERS[r.trailer].maxCargo.mass, `mass ${mass}`);
});
test('four seats, two rows (four doors)', () => { assert.equal(SUV_ROW.seats.length, 4); assert.deepEqual([...new Set(SUV_ROW.seats.map((s) => s.row))], [0, 1]); });
test('the glass runs back to the tailgate and narrows to the roof', () => {
  const G = SUV_GLASS; assert.ok(G.roofF < G.zA && G.roofR < G.roofF && G.zC < G.roofR && G.yR > G.yB && G.wR < G.wB);
  assert.ok(G.zC > -SUV_ROW.len / 2 && G.wB <= SUV_ROW.wid);
});
test('a generic name (no make, no model) and a chassis row the workshop reads', () => {
  assert.equal(SUV_ROW.name, 'SUV');
  assert.ok(SUV_CHASSIS.maxKg > 0 && SUV_CHASSIS.mounts.front && SUV_CHASSIS.faces.under > 0);
});
