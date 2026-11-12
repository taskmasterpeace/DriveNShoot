// GUNS ON BOATS unit tests (src/data/workshop.js CHASSIS boat rows, BOAT_KIT). Run: node --test tools/boatguns.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHASSIS, MOUNT_WEAPONS, BOAT_KIT, validateWorkshop } from '../src/data/workshop.js';

const BOATS = ['gunboat', 'barge', 'airboat', 'skiff', 'jetski'];

test('the workshop rows still validate with the boats in', () => assert.deepEqual(validateWorkshop(), { ok: true, bad: [] }));
test('every powered boat has a chassis row with at least one gun mount', () => {
  for (const b of BOATS) { assert.ok(CHASSIS[b], b); assert.ok(Object.keys(CHASSIS[b].mounts).length > 0, b); }
});
test('no plate below the waterline', () => { for (const b of BOATS) assert.equal(CHASSIS[b].faces.under, 0, b); });
test('the airboat takes nothing on its stern (the fan cage)', () => assert.equal(CHASSIS.airboat.mounts.rear, undefined));
test('the gunboat\'s pintle is a swivel mount on the foredeck, forward of the middle', () => {
  const t = CHASSIS.gunboat.mounts.top;
  assert.ok(t && t.arc >= Math.PI - 1e-9 && t.size >= 2);
  assert.equal(t.at.length, 3); assert.ok(t.at[2] > 0);
});
test('BOAT_KIT fits its own boat: size, face, spaces, weight', () => {
  for (const [boat, kit] of Object.entries(BOAT_KIT)) {
    const C = CHASSIS[boat]; let kg = 0, sp = 0;
    for (const [face, kind] of Object.entries(kit)) {
      const W = MOUNT_WEAPONS[kind]; assert.ok(W, kind);
      assert.ok(C.mounts[face], `${boat} ${face}`); assert.ok(W.faces.includes(face), `${kind} on ${face}`);
      assert.ok(W.size <= C.mounts[face].size, `${kind} size`); kg += W.kg; sp += W.size;
    }
    assert.ok(kg <= C.maxKg && sp <= C.spaces);
  }
});
test('a jetski is light: one small gun at most', () => { assert.equal(CHASSIS.jetski.spaces, 1); assert.equal(CHASSIS.jetski.mounts.front.size, 1); });
test('a hull refuses tyres, bumpers, road plates and road droppers; the dock bench works on boats', async () => {
  const { BOAT_REFUSES, WORKSHOPS, ARMOR, UTILITY } = await import('../src/data/workshop.js');
  for (const b of BOATS) assert.equal(CHASSIS[b].boat, true, b);
  for (const k of BOAT_REFUSES.plates) assert.ok(ARMOR[k], k);
  for (const k of BOAT_REFUSES.utility) assert.ok(UTILITY[k], k);
  for (const k of BOAT_REFUSES.drops) assert.equal(MOUNT_WEAPONS[k]?.kind, 'drop', k);
  assert.ok(WORKSHOPS.dock && WORKSHOPS.dock.boats && Number.isFinite(WORKSHOPS.dock.x));
  assert.equal(CHASSIS.sedan.boat, undefined);
});
