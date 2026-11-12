// WAGONS unit tests (src/data/wagons.js). Run: node --test tools/wagons.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WAGON_ROW, WAGON_DECK, TEAM, WAGONS, validateWagons, teamPace } from '../src/data/wagons.js';
import { BREEDS } from '../src/data/horses.js';

test('the rows validate against the horses\' breeds', () => assert.deepEqual(validateWagons(BREEDS), []));
test('no team, no pace: a wagon does not move on its own', () => assert.deepEqual(teamPace([], BREEDS), { maxSpeed: 0, accel: 0 }));
test('a draft horse pulls hardest; a pony least; a pair more than one', () => {
  const p = (b) => teamPace(b, BREEDS);
  assert.ok(p(['draft']).accel > p(['quarter']).accel && p(['quarter']).accel > p(['pony']).accel);
  assert.ok(p(['draft', 'draft']).accel > p(['draft']).accel);
});
test('the team goes at the slowest horse\'s pace (a pony holds a draft back)', () => {
  assert.ok(teamPace(['draft', 'pony'], BREEDS).maxSpeed <= teamPace(['draft'], BREEDS).maxSpeed);
  for (const b of Object.keys(BREEDS)) assert.ok(teamPace([b], BREEDS).maxSpeed < BREEDS[b].speed.canter);
});
test('the bed is a floor you can walk into from the back, under the bonnet', () => {
  assert.ok(WAGON_DECK.doors.some((d) => d.edge === 'rear')); assert.ok(WAGON_DECK.ceil > 1.6 && WAGON_DECK.open === false);
  assert.ok(WAGON_ROW.tall - WAGON_DECK.y >= WAGON_DECK.ceil);
});
test('driven from the box: two exposed seats up front', () => {
  assert.equal(WAGON_ROW.seats.length, 2); for (const s of WAGON_ROW.seats) { assert.ok(s.exposed); assert.ok(s.at[2] > 0); }
});
test('one placed wagon per row, a team of at most two', () => { assert.equal(new Set(WAGONS.map((w) => w.id)).size, WAGONS.length); assert.equal(TEAM.max, 2); });
