// THE VEHICLE TABLES = THE OLD JS, field by field. Run: node --import ./tools/tables/register-json.mjs --test tools/tables-vehicles.test.mjs
// The fixture is the JS literals as they were before the tables (commit 1d214828, tools/tables/snapshot-vehicles.mjs).
// Each table-loaded object must deep-equal the old one (nulls in the old data were "absent": a null cell is empty).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { tableObjects, tableOne } from '../src/data/tables/load.js';

const snap = JSON.parse(readFileSync(new URL('./fixtures/tables/vehicles.legacy.json', import.meta.url), 'utf8'), (k, v) => (v === '__Infinity__' ? Infinity : v));
const strip = (o) => (Array.isArray(o) ? o.map(strip) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null).map(([k, v]) => [k, strip(v)])) : o);
const F = 'vehicles';
const same = (got, want, what) => { assert.deepEqual(Object.keys(got), Object.keys(want), `${what}: same rows, same order`); assert.deepStrictEqual(got, strip(want), what); };
const one = (t, key, what) => assert.deepStrictEqual(tableOne(F, t), strip(key), what);

test('vehicle bodies: every row of VEHICLES, the semis and the towing bodies', async () => {
  const all = tableObjects(F, 'Vehicles');
  const want = { ...snap.VEHICLES, ...snap.SEMI_VEHICLES, ...snap.TOW_VEHICLES };
  const norm = JSON.parse(JSON.stringify(want, (k, v) => (v === Infinity ? '__Infinity__' : v)), (k, v) => (v === '__Infinity__' ? Infinity : v));
  for (const v of Object.values(norm)) if (v.deck && typeof v.deck === 'object') v.deck = v.deck.key; // a trailer's deck is a key; systems/semis.js resolves it
  assert.deepEqual(Object.keys(all), Object.keys(norm));
  assert.deepStrictEqual(all, strip(norm));
  assert.equal(Object.keys(snap.VEHICLES).length, 17);
});
test('driving, towing, mud, the boat trailer, tow items', () => {
  one('Driving', snap.DRIVING, 'DRIVING'); one('TowSettings', snap.TOW, 'TOW'); one('MudSettings', snap.MUD, 'MUD'); one('BoatTrailerSettings', snap.TRAILER, 'TRAILER');
  same(tableObjects(F, 'TowLines'), snap.LINES, 'LINES'); same(tableObjects(F, 'TowItems'), snap.TOW_ITEMS, 'TOW_ITEMS');
});
test('trailers, hitch, carry, road fit, clearance', () => {
  const T = tableObjects(F, 'Trailers');
  assert.deepStrictEqual(T, snap.TRAILERS);
  assert.equal(T.wide.hold.h, Infinity);
  one('HitchSettings', snap.HITCH, 'HITCH'); one('CarrySettings', snap.CARRY, 'CARRY'); same(tableObjects(F, 'RoadFit'), snap.ROAD_FIT, 'ROAD_FIT');
  const c = tableObjects(F, 'Clearance'), k = tableOne(F, 'TrailerConstants');
  assert.deepStrictEqual({ ...Object.fromEntries(Object.entries(c).map(([n, r]) => [n, r.clearance])), margin: k.clearanceMargin }, snap.CLEARANCE);
  assert.equal(k.laneW, snap.LANE_W); assert.equal(k.fitMargin, snap.FIT_MARGIN);
});
test('old garage parts', () => {
  one('PlateSettings', snap.PLATE, 'PLATE'); same(tableObjects(F, 'PlateMax'), snap.PLATE_MAX, 'PLATE_MAX'); one('LoadSettings', snap.LOAD, 'LOAD'); same(tableObjects(F, 'PartMounts'), snap.MOUNTS, 'MOUNTS');
  assert.deepStrictEqual(Object.fromEntries(Object.entries(tableObjects(F, 'PartMountOk')).map(([k, v]) => [k, v.ok])), snap.MOUNT_OK);
});
test('workshop rows', () => {
  same(tableObjects(F, 'ArmorTypes'), snap.ARMOR, 'ARMOR'); same(tableObjects(F, 'Chassis'), snap.CHASSIS, 'CHASSIS'); one('PerfSettings', snap.PERF, 'PERF'); one('PowerSettings', snap.POWER, 'POWER');
  same(tableObjects(F, 'MountWeapons'), snap.MOUNT_WEAPONS, 'MOUNT_WEAPONS'); same(tableObjects(F, 'Utility'), snap.UTILITY, 'UTILITY'); same(tableObjects(F, 'AmmoItems'), snap.AMMO_ITEMS, 'AMMO_ITEMS');
  same(tableObjects(F, 'Paints'), snap.PAINTS, 'PAINTS'); one('RepairPrices', snap.REPAIR, 'REPAIR'); same(tableObjects(F, 'Workshops'), snap.WORKSHOPS, 'WORKSHOPS'); same(tableObjects(F, 'Arenas'), snap.ARENAS, 'ARENAS'); one('Loaner', snap.LOANER, 'LOANER');
});

// ---- the wrappers: the game's own modules, loaded through the tables, equal the old data ----
test('the JS modules the game imports give the old data (thin wrappers over the tables)', async () => {
  const { VEHICLES, DRIVING } = await import('../src/systems/vehicles.js');
  const T = await import('../src/data/towing.js'), TR = await import('../src/data/trailers.js'), P = await import('../src/data/parts.js'), W = await import('../src/data/workshop.js');
  same(Object.fromEntries(Object.entries(VEHICLES).filter(([k]) => k in snap.VEHICLES)), snap.VEHICLES, 'VEHICLES (core)');
  assert.deepEqual(Object.keys(snap.VEHICLES), Object.keys(VEHICLES).filter((k) => k in snap.VEHICLES), 'VEHICLES key order');
  assert.deepStrictEqual(DRIVING, snap.DRIVING);
  same(T.TOW_VEHICLES, snap.TOW_VEHICLES, 'TOW_VEHICLES'); same(T.LINES, snap.LINES, 'LINES'); assert.deepStrictEqual(T.TOW, snap.TOW); assert.deepStrictEqual(T.MUD, snap.MUD); assert.deepStrictEqual(T.TRAILER, snap.TRAILER); same(T.TOW_ITEMS, snap.TOW_ITEMS, 'TOW_ITEMS');
  assert.deepStrictEqual(TR.TRAILERS, snap.TRAILERS); assert.deepStrictEqual(TR.HITCH, snap.HITCH); assert.deepStrictEqual(TR.CARRY, snap.CARRY); same(TR.ROAD_FIT, snap.ROAD_FIT, 'ROAD_FIT'); assert.deepStrictEqual(TR.CLEARANCE, snap.CLEARANCE); assert.equal(TR.LANE_W, snap.LANE_W); assert.equal(TR.FIT_MARGIN, snap.FIT_MARGIN);
  assert.deepStrictEqual(P.PLATE, snap.PLATE); same(P.PLATE_MAX, snap.PLATE_MAX, 'PLATE_MAX'); assert.deepStrictEqual(P.LOAD, snap.LOAD); same(P.MOUNTS, snap.MOUNTS, 'MOUNTS'); assert.deepStrictEqual(P.MOUNT_OK, snap.MOUNT_OK);
  for (const k of ['ARMOR', 'CHASSIS', 'MOUNT_WEAPONS', 'UTILITY', 'AMMO_ITEMS', 'PAINTS', 'WORKSHOPS', 'ARENAS']) same(W[k], snap[k], k);
  for (const k of ['PERF', 'POWER', 'REPAIR', 'LOANER']) assert.deepStrictEqual(W[k], strip(snap[k]), k);
});
test('semis.js still registers the tractor and the two trailers, with the hold decks resolved', async () => {
  const { VEHICLES } = await import('../src/systems/vehicles.js');
  await import('../src/systems/semis.js');
  const { TRAILER_DECKS } = await import('../src/data/trailers.js');
  for (const k of ['semi', 'boxtrailer', 'widetrailer']) assert.deepStrictEqual(VEHICLES[k], snap.SEMI_VEHICLES[k], k);
  assert.equal(VEHICLES.boxtrailer.deck, TRAILER_DECKS.boxHold);
});
