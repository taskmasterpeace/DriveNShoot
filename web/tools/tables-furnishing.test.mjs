// THE FURNISHING TABLES = THE JS ROWS THEY WERE DERIVED FROM (nothing reads the tables yet; the JS is the source of truth until the interiors
// furnishing pass lands). Fails when floorplans.js or ring.js moved on: re-run tools/tables/gen-furnishing.mjs.
// Run: node --import ./tools/tables/register-json.mjs --test tools/tables-furnishing.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tableObjects, tableOne, loadFamily } from '../src/data/tables/load.js';
import { ROOMS, PROGRAMMES, SCATTER, FRONTS, PLAN_RULES, planRows, furniturePieces, namesRows } from './tables/furnishing-shapes.mjs';

const F = 'furnishing';
const strip = (o) => (Array.isArray(o) ? o.map(strip) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, strip(v)])) : o);
const same = (got, want, what) => { assert.deepEqual(Object.keys(got), Object.keys(want), `${what}: rows and order`); assert.deepStrictEqual(got, strip(want), what); };

test('room types, furniture pieces, plan layouts equal the JS rows', () => {
  const rooms = Object.fromEntries(Object.entries(ROOMS).map(([k, r]) => [k, { ...r, rare: r.rare, furniture: r.furniture, via: r.via }]));
  const got = tableObjects(F, 'RoomTypes');
  for (const k of Object.keys(rooms)) { if (rooms[k].via === undefined) assert.equal(got[k].via, undefined, `${k}.via`); if (rooms[k].rare === undefined) assert.equal(got[k].rare, undefined, `${k}.rare`); }
  same(got, rooms, 'ROOMS');
  same(tableObjects(F, 'Furniture'), furniturePieces(), 'FURNITURE (without parts)');
  same(tableObjects(F, 'PlanLayouts'), planRows(), 'PLANS');
});
test('programmes, scatter, fronts, plan rules', () => {
  same(tableObjects(F, 'ProgrammeRows'), PROGRAMMES.rows, 'PROGRAMMES.rows');
  const p = tableOne(F, 'ProgrammeSettings');
  assert.deepStrictEqual({ shops: p.shops, names: p.names, ruins: p.ruins, lose: p.lose, working: p.working }, { shops: PROGRAMMES.shops, names: namesRows(PROGRAMMES.names), ruins: PROGRAMMES.ruins, lose: PROGRAMMES.lose, working: PROGRAMMES.working });
  same(tableObjects(F, 'RoomScatter'), Object.fromEntries(Object.entries(SCATTER).map(([k, [piece, every, inset, max]]) => [k, { piece, every, inset, max }])), 'SCATTER');
  same(tableObjects(F, 'RoomFronts'), Object.fromEntries(Object.entries(FRONTS).map(([k, room]) => [k, { room }])), 'FRONTS');
  assert.deepStrictEqual(tableOne(F, 'PlanRules'), PLAN_RULES);
});
test('every piece a room asks for exists, every room a plan names exists, every loot table is a real one', async () => {
  const T = loadFamily(F), pieces = new Set(T.get('Furniture').rows.map((r) => r.name)), rooms = new Set(T.get('RoomTypes').rows.map((r) => r.name));
  for (const r of T.get('RoomTypesFurniture').rows) assert.ok(pieces.has(r.cells.Piece), `${r.name}: piece ${r.cells.Piece}`);
  for (const r of T.get('RoomTypesRare').rows) assert.ok(pieces.has(r.cells.Piece), `${r.name}: rare piece ${r.cells.Piece}`);
  for (const r of T.get('PlanLayoutsRooms').rows) assert.ok(rooms.has(r.cells.Room), `${r.name}: room ${r.cells.Room}`);
  for (const r of T.get('RoomTypesVia').rows) assert.ok(rooms.has(r.cells.Value), `${r.name}: via ${r.cells.Value}`);
  const { LOOT } = await import('../src/data/items.js');
  for (const r of T.get('RoomTypes').rows) if (r.cells.Loot) assert.ok(LOOT[r.cells.Loot], `room ${r.name}: loot table ${r.cells.Loot}`);
});
