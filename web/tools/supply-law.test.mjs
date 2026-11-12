// Unit tests for THE SUPPLY LAW and THE STOCK LEDGER (docs/design/WEB_SUPPLY_LAW.md), in node, no browser:
//   node --test tools/supply-law.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from 'node:module';
// The data modules import JSON the way vite does (no attribute): the same hook tools/terrain-check.mjs uses.
register('data:text/javascript,' + encodeURIComponent(`export async function load(url, ctx, next) {
  if (url.endsWith('.json')) return next(url, { ...ctx, importAttributes: { type: 'json' } });
  return next(url, ctx);
}`));
const { ITEMS } = await import('../src/data/items.js');
const CJ = await import('../src/data/crewjobs.js');
const { RECIPE_BY_ID } = await import('../src/data/recipes.js');
const { validateSupply } = await import('../src/data/supply.js');
const { LOOT_LAW } = await import('../src/data/rites.js');
const { poolShort, poolTake, runTargets, haul } = await import('../src/systems/supply.js');
const { StockLedger, census, reconcile } = await import('../src/systems/stockLedger.js');

// A fake inventory with systems/inventory.js's add/take meaning (stacks ignored: one slot per add).
const box = (id, slots = [], extra = {}) => ({ id, slots, x: 0, z: 0, rolled: true, count(i) { let n = 0; for (const s of this.slots) if (s.id === i) n += s.n; return n; }, ...extra });
const inv = {
  take(b, i, n) { const s = b.slots[i]; if (!s) return null; const k = Math.min(n, s.n); s.n -= k; if (s.n <= 0) b.slots.splice(i, 1); return { id: s.id, n: k, left: s.left }; },
  add(b, id, n, st = {}) { b.slots.push({ id, n, ...(st.left !== undefined ? { left: st.left } : {}) }); return n; },
};
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('the rows: the run rows validate, the off-screen run table is gone, no crew job is on the LOOT_LAW todo list', () => {
  assert.deepEqual(validateSupply(), { ok: true, bad: [] });
  assert.equal(CJ.validateCrewJobs(undefined, { items: ITEMS }).ok, true);
  assert.ok(!('CREW_RUN_LOOT' in CJ), 'the crew_run table is retired');
  assert.ok(!CJ.CREW_JOB_BY_ID.scav_run.outputs?.table);
  assert.ok(!LOOT_LAW.some((r) => /crew/i.test(r.path) && r.state === 'todo'));
});

test('CRAFT AMMO runs the load_pistol row: brass, powder, primer and lead in, 8 rounds out (no scrap); FARM has no outputs of its own', () => {
  const J = CJ.CREW_JOB_BY_ID.ammo, R = RECIPE_BY_ID[J.recipe], ins = Object.fromEntries(R.inputs);
  assert.equal(J.recipe, 'load_pistol');
  assert.deepEqual(ins, { brass_case: 8, lead_shot: 1, gunpowder: 1, primer: 8 });
  assert.deepEqual(R.outputs, [['ammo_pistol', 8]]);
  assert.ok(!J.inputs?.scrap && !J.outputs);
  assert.ok(!CJ.CREW_JOB_BY_ID.farm.outputs, 'no ration from nowhere');
});

test('the pool takes all the inputs or none, across the pack and the stash', () => {
  const pack = box('you', [{ id: 'brass_case', n: 5 }, { id: 'primer', n: 8 }]), stash = box('crew:stash', [{ id: 'brass_case', n: 3 }, { id: 'gunpowder', n: 1 }]);
  const inputs = Object.fromEntries(RECIPE_BY_ID.load_pistol.inputs);
  assert.deepEqual(poolShort([pack, stash], inputs), { lead_shot: 1 });
  assert.equal(poolTake(inv, [pack, stash], inputs), false);
  assert.equal(pack.count('brass_case') + stash.count('brass_case'), 8, 'a short pool keeps everything');
  stash.slots.push({ id: 'lead_shot', n: 2 });
  assert.equal(poolTake(inv, [pack, stash], inputs), true);
  assert.equal(pack.count('brass_case') + stash.count('brass_case'), 0);
  assert.equal(pack.count('primer'), 0); assert.equal(stash.count('gunpowder'), 0); assert.equal(stash.count('lead_shot'), 1);
});

test('a scavenge run targets only unopened, unowned boxes in reach, nearest first; haul carries what fits and leaves the rest', () => {
  const B = [
    box('box:far', [], { x: 500, z: 0, rolled: false }),
    box('box:near', [], { x: 10, z: 0, rolled: false }),
    box('box:mid', [], { x: 50, z: 0, rolled: false }),
    box('box:opened', [], { x: 5, z: 0, rolled: true }),
    box('box:shop', [], { x: 6, z: 0, rolled: false, owner: 7 }),
    box('body:12', [], { x: 4, z: 0, rolled: false }),
    box('crew:stash', [], { x: 0, z: 0, rolled: false }),
  ];
  assert.deepEqual(runTargets(B, { x: 0, z: 0 }, { reach: 100, n: 3 }).map((b) => b.id), ['box:near', 'box:mid']);
  assert.deepEqual(runTargets(B.filter((b) => b.id === 'box:far'), { x: 0, z: 0 }, { reach: 100, n: 3 }), []);
  const src = box('box:near', [{ id: 'scrap', n: 10 }, { id: 'ammo_pistol', n: 20 }]), home = box('crew:stash', []);
  const got = haul(inv, src, 5, (id, n) => inv.add(home, id, n));
  assert.ok(got.some((g) => g.id === 'ammo_pistol' && g.n === 20));
  const scrapTaken = home.count('scrap');
  assert.ok(scrapTaken * ITEMS.scrap.bulk + 20 * ITEMS.ammo_pistol.bulk <= 5 + 1e-9);
  assert.equal(src.count('scrap') + scrapTaken, 10, 'nothing made, nothing lost: what did not fit stayed in the box');
});

test('the ledger: census counts holders and loaded rounds; reconcile flags untraced rises and minted stamps', () => {
  const c = census({ slots: [[{ id: 'gun_pistol', n: 1, loaded: 4 }, { id: 'ammo_pistol', n: 10 }]], ids: ['satchel'], rounds: [['ammo_pistol', 2]] }, (id) => (id === 'gun_pistol' ? 'ammo_pistol' : null));
  assert.equal(c.get('ammo_pistol'), 16); assert.equal(c.get('satchel'), 1);
  const before = new Map([['ammo_pistol', 10], ['scrap', 3]]), after = new Map([['ammo_pistol', 26], ['scrap', 1], ['rag', 2]]);
  const r = reconcile(before, after, [{ item: 'ammo_pistol', n: 8, origin: 'recipe' }, { item: 'rag', n: 2, origin: 'minted', src: 'give' }]);
  assert.deepEqual(r.rises, { ammo_pistol: 16, rag: 2 });
  assert.deepEqual(r.flags.map((f) => [f.item, f.n, f.origin]).sort(), [['ammo_pistol', 8, 'untraced'], ['rag', 2, 'minted']]);
});

test('the ledger on a fake game: the old crew jobs fail the audit, the new ones pass; the hourly census flags a leak', async () => {
  const carried = box('you', []), boxes = new Map(), g = { inventory: { carried, boxes, trunks: new Map() }, sky: { time: 6 }, society: { day: 0 }, events: [], emit(t, e) { this.events.push({ t, e }); } };
  const L = new StockLedger(g, { items: ITEMS });
  // the OLD farm plot: a ration from nothing
  let a = await L.audit(() => { carried.slots.push({ id: 'ration', n: 1 }); });
  assert.deepEqual(a.flags.map((f) => [f.item, f.origin]), [['ration', 'untraced']]);
  // the OLD ammo bench: 1 scrap in, 8 rounds out, unstamped
  carried.slots.push({ id: 'scrap', n: 1 }); L.rebase();
  a = await L.audit(() => { carried.slots.splice(carried.slots.findIndex((s) => s.id === 'scrap'), 1); carried.slots.push({ id: 'ammo_pistol', n: 8 }); });
  assert.ok(a.flags.some((f) => f.item === 'ammo_pistol' && f.origin === 'untraced'));
  // the NEW bench: the rounds stamped as a recipe, the parts gone
  a = await L.audit(() => { carried.slots.push({ id: 'ammo_pistol', n: 8 }); L.stamp('ammo_pistol', 8, 'recipe', 'crew:ammo'); });
  assert.deepEqual(a.flags, []);
  // a moved thing is no gain: a box's goods into the pack
  const b = box('box:1', [{ id: 'jerky', n: 3 }]); boxes.set(b.id, b);
  L.rebase();
  a = await L.audit(() => { b.slots.length = 0; carried.slots.push({ id: 'jerky', n: 3 }); });
  assert.deepEqual(a.flags, []);
  // the hourly census
  L.rebase(); carried.slots.push({ id: 'rag', n: 5 }); g.sky.time = 7.2; L.update();
  assert.ok(L.flags.some((f) => f.item === 'rag' && f.n === 5 && f.origin === 'untraced'));
  assert.ok(g.events.some((e) => e.t === 'stockFlag'));
  // an origin nobody wrote down is minted
  L.stamp('scrap', 1, 'because'); assert.equal(L.log.at(-1).origin, 'minted');
});
