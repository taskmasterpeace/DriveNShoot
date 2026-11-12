// CAR DOORS unit tests (src/data/cardoors.js + the presence's door bits in src/net/protocol.js). Run: node --test tools/cardoors.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOORS, doorFor, stepDoor, hingeRotate, doorBits, openFromBits, DOOR_BIT } from '../src/data/cardoors.js';
import { cleanPresence } from '../src/net/protocol.js';

test('a seat uses the door on its own side and row', () => {
  assert.equal(doorFor({ side: 'left', row: 0 }), 'doorL');
  assert.equal(doorFor({ side: 'right', row: 0 }), 'doorR');
  assert.equal(doorFor({ side: 'left', row: 1 }), 'doorL2');
  assert.equal(doorFor({ side: 'right', row: 1 }), 'doorR2');
  assert.equal(doorFor(undefined), 'doorL');
});
test('a door swings shut to open in the swing time and never overshoots', () => {
  let a = 0, t = 0; const dt = 1 / 60;
  while (a < DOORS.open && t < 2) { a = stepDoor(a, DOORS.open, dt); t += dt; }
  assert.equal(a, DOORS.open);
  assert.ok(Math.abs(t - DOORS.swing) < 2 * dt, `took ${t}`);
  assert.equal(stepDoor(0.1, 0, 1), 0);
});
test('the hinge swings a left door\'s back edge outward (+x) and keeps it the same length', () => {
  const [x, z] = hingeRotate(1, -1, 1, 0, Math.PI / 2, 1); // back edge 1 m behind the hinge, swung 90 degrees
  assert.ok(Math.abs(x - 2) < 1e-9 && Math.abs(z) < 1e-9, `${x},${z}`);
  const [x2, z2] = hingeRotate(-1, -1, -1, 0, DOORS.open, -1); // a right door goes to -x
  assert.ok(x2 < -1);
  assert.ok(Math.abs(Math.hypot(x2 + 1, z2) - 1) < 1e-9);
  const [x0, z0] = hingeRotate(0.9, -0.6, 1, 0, 0, 1); // shut: untouched
  assert.deepEqual([x0, z0], [0.9, -0.6]);
});
test('open doors to bits and back; a half-open door counts once it is past half way', () => {
  const doors = { doorL: { a: DOORS.open }, doorR2: { a: DOORS.open * 0.6 }, doorR: { a: DOORS.open * 0.4 } };
  const b = doorBits(doors);
  assert.equal(b, DOOR_BIT.doorL | DOOR_BIT.doorR2);
  assert.deepEqual(openFromBits(b).sort(), ['doorL', 'doorR2']);
  assert.equal(doorBits(undefined), 0);
});
test('the shard relays the door bits and drops nonsense', () => {
  const base = { x: 1, z: 2, v: { t: 'sedan', x: 1, z: 2, h: 0, c: '#334455', seat: 0 } };
  assert.equal(cleanPresence({ ...base, v: { ...base.v, d: 5 } }).v.d, 5);
  assert.equal(cleanPresence({ ...base, v: { ...base.v, d: 99 } }).v.d, undefined);
  assert.equal(cleanPresence({ ...base, v: { ...base.v, d: 'x' } }).v.d, undefined);
  assert.equal(cleanPresence(base).v.d, undefined);
});
