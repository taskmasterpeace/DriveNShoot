// FUEL TYPES unit tests (src/data/fuels.js): pure rules, no browser. Run: node --test tools/fuels.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FUELS, ENGINE_FUEL, FUEL_RULES, engineFuel, canFuel, pour, burnOff, badShare, mixEffect, drain, tankFuel, validateFuels } from '../src/data/fuels.js';

const ROWS = {
  sedan: { fuelCap: 55 }, pickup: { fuelCap: 80 }, bike: { fuelCap: 18 }, semi: { fuelCap: 300 }, rig: { fuelCap: 160 },
  bullcar: { base: 'interceptor', fuelCap: 60 }, towtruck: { base: 'pickup', fuelCap: 95 }, patrol: { fuelCap: 95 },
  raft: { fuelCap: 0, noEngine: true }, boxtrailer: { fuelCap: 0, noEngine: true, trailer: true }, nocap: {},
  gunboat: { fuelCap: 120 }, jetski: { fuelCap: 20 }, custom: { fuel: 'diesel', fuelCap: 10 },
};
const ITEMS = {
  fuel_can: { fuel: 'gasoline', use: { act: 'refuel', litres: 10 } },
  diesel_can: { fuel: 'diesel', use: { act: 'refuel', litres: 10 } },
  siphon_hose: { use: { act: 'drain' } },
};

test('cars and bikes burn gasoline; rigs, semis, military trucks, a wrecker and work boats burn diesel', () => {
  for (const t of ['sedan', 'pickup', 'bike', 'bullcar', 'jetski', 'nocap']) assert.equal(engineFuel(t, ROWS), 'gasoline', t);
  for (const t of ['semi', 'rig', 'towtruck', 'patrol', 'gunboat']) assert.equal(engineFuel(t, ROWS), 'diesel', t);
});
test('no engine, no fuel: a raft and a trailer burn nothing', () => {
  assert.equal(engineFuel('raft', ROWS), null);
  assert.equal(engineFuel('boxtrailer', ROWS), null);
});
test('a row can say its own fuel', () => assert.equal(engineFuel('custom', ROWS), 'diesel'));
test('the red can is gasoline, the yellow can diesel, a hose is not a can', () => {
  assert.equal(canFuel(ITEMS.fuel_can), 'gasoline');
  assert.equal(canFuel(ITEMS.diesel_can), 'diesel');
  assert.equal(canFuel(ITEMS.siphon_hose), null);
  assert.equal(FUELS.gasoline.can, 'fuel_can'); assert.equal(FUELS.diesel.can, 'diesel_can');
});
test('the right fuel pours clean; the tank never overfills', () => {
  const v = { fuelType: 'gasoline', fuel: 50, fuelCap: 55 };
  const r = pour(v, 'gasoline', 10);
  assert.deepEqual(r, { poured: 5, wrong: false });
  assert.equal(v.fuel, 55); assert.equal(v.bad ?? 0, 0);
  assert.equal(mixEffect(v).power, 1);
});
test('a little diesel in a gas engine: it runs weak and wears; past the stall share it will not fire', () => {
  const v = { fuelType: 'gasoline', fuel: 40, fuelCap: 55 };
  pour(v, 'diesel', 5); // 5 of 45 = 11%
  const m = mixEffect(v);
  assert.ok(m.runs && m.power < 0.85 && m.power > 0.6, JSON.stringify(m));
  assert.ok(m.wear > 0);
  const w = { fuelType: 'gasoline', fuel: 5, fuelCap: 55 };
  pour(w, 'diesel', 10); // 10 of 15
  assert.equal(mixEffect(w).runs, false); assert.equal(mixEffect(w).power, 0);
});
test('gasoline in a diesel knocks it harder than diesel in a gas engine', () => {
  const a = { fuelType: 'diesel', fuel: 90, fuelCap: 300 }, b = { fuelType: 'gasoline', fuel: 90, fuelCap: 300 };
  pour(a, 'gasoline', 10); pour(b, 'diesel', 10);
  assert.ok(mixEffect(a).wear > mixEffect(b).wear);
  assert.ok(FUEL_RULES.wear.diesel > FUEL_RULES.wear.gasoline);
});
test('the mix burns in proportion: driving does not clean the tank, only topping up dilutes it', () => {
  const v = { fuelType: 'gasoline', fuel: 40, fuelCap: 80 };
  pour(v, 'diesel', 10);
  const s0 = badShare(v);
  burnOff(v, 25);
  assert.ok(Math.abs(badShare(v) - s0) < 1e-9);
  pour(v, 'gasoline', 50);
  assert.ok(badShare(v) < s0 / 2);
});
test('draining empties good and bad together', () => {
  const v = { fuelType: 'diesel', fuel: 30, bad: 12, fuelCap: 300 };
  assert.equal(drain(v), 30);
  assert.equal(v.fuel, 0); assert.equal(v.bad, 0); assert.equal(badShare(v), 0);
});
test('burning a tank dry clears the bad too', () => {
  const v = { fuelType: 'gasoline', fuel: 2, bad: 1, fuelCap: 55 };
  burnOff(v, 5);
  assert.equal(v.fuel, 0); assert.equal(v.bad, 0);
});
test('a station tank with no type (an old row) is gasoline', () => {
  assert.equal(tankFuel({}), 'gasoline'); assert.equal(tankFuel({ fuel: 'diesel' }), 'diesel');
});
test('validate: every fuel has its can, every listed engine a known fuel', () => {
  assert.deepEqual(validateFuels(ROWS, ITEMS), []);
  assert.ok(validateFuels(ROWS, { fuel_can: ITEMS.fuel_can }).length > 0);
  for (const f of Object.values(ENGINE_FUEL)) assert.ok(FUELS[f]);
});
test('never purple: the can colours are red and yellow', () => {
  for (const f of Object.values(FUELS)) {
    const n = parseInt(f.color.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    assert.ok(!(b > g && r > g), `${f.name} ${f.color} reads purple`);
  }
});
test('a generator takes either can, the diesel first', async () => {
  const { genCans, spendGenCans } = await import('../src/data/fuels.js');
  const have = { diesel_can: 1, fuel_can: 2 };
  const box = { count: (id) => have[id] ?? 0 };
  const inv = { carried: box, spend: (id, n) => { have[id] -= n; } };
  assert.equal(genCans(box), 3);
  assert.equal(spendGenCans(inv, 2), true);
  assert.deepEqual(have, { diesel_can: 0, fuel_can: 1 });
  assert.equal(spendGenCans(inv, 5), false);
  assert.equal(genCans(null), 0);
});
