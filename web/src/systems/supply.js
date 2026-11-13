// The supply law's working parts for the crew (docs/design/WEB_SUPPLY_LAW.md): the pool a job draws from (all the
// inputs or none), the scavenge run's targets and haul. Pure: an `inv` here is anything with take(box, i, n) and add(box, id, n,
// state) (systems/inventory.js Inventory), a box anything with slots; tools/supply-law.test.mjs runs them in node.
import { ITEMS } from '../data/items.js';
import { CREW_RUN } from '../data/supply.js';

// How many of an input the pool holds. 'any_food': any food item.
const match = (s, id) => (id === 'any_food' ? ITEMS[s.id]?.kind === 'food' : s.id === id);
export function poolCount(pool, id) { let n = 0; for (const b of pool) for (const s of b.slots) if (!s.hid && match(s, id)) n += s.n; return n; }
// What the pool is short of, { id: missing } (empty: it has everything).
export function poolShort(pool, inputs) {
  const short = {};
  for (const [id, n] of Object.entries(inputs ?? {})) { const have = poolCount(pool, id); if (have < n) short[id] = n - have; }
  return short;
}
// Take all the inputs or none (the old crew took a partial stack and called it whole). true: taken.
export function poolTake(inv, pool, inputs) {
  if (Object.keys(poolShort(pool, inputs)).length) return false;
  for (const [id, n] of Object.entries(inputs ?? {})) {
    let left = n;
    for (const b of pool) for (let i = b.slots.length - 1; i >= 0 && left > 0; i--) { const s = b.slots[i]; if (s.hid || !match(s, id)) continue; const t = inv.take(b, i, left); left -= t?.n ?? 0; }
  }
  return true;
}
// ---- the scavenge run -------------------------------------------------------------------------------------------------
// The unopened containers a run can reach from the base, nearest first: not owned (a keeper's shelf is theft), not
// one of CREW_RUN.skip, not on another floor than the street (a runner searches what is at hand), never opened.
export function runTargets(boxes, base, { reach = CREW_RUN.reach, n = CREW_RUN.boxes } = {}) {
  const out = [];
  for (const b of boxes) {
    if (b.rolled || b.owner || b.unseen || (b.y ?? 0) > 0.5 || CREW_RUN.skip.some((p) => b.id.startsWith(p))) continue;
    const d = Math.hypot(b.x - base.x, b.z - base.z);
    if (d <= reach) out.push({ b, d });
  }
  out.sort((a, b) => a.d - b.d || (a.b.id < b.b.id ? -1 : 1));
  return out.slice(0, n).map((o) => o.b);
}
// Carry what fits in `litres` out of box into `put(id, n, slot)` (returns how many went), most valuable first. Taken
// things leave the box; what does not fit stays in it. Returns [{ id, n }].
export function haul(inv, box, litres, put) {
  const order = box.slots.map((s, i) => ({ s, i, v: (ITEMS[s.id]?.value ?? 0) / Math.max(0.01, ITEMS[s.id]?.bulk ?? 0.01) })).sort((a, b) => b.v - a.v);
  const got = [], take = [];
  for (const { s, i } of order) {
    const bulk = ITEMS[s.id]?.bulk ?? 0, k = bulk > 0 ? Math.min(s.n, Math.floor(litres / bulk)) : s.n;
    if (k <= 0) continue;
    litres -= k * bulk; take.push([i, k]);
  }
  for (const [i, k] of take.sort((a, b) => b[0] - a[0])) {
    const t = inv.take(box, i, k); if (!t) continue;
    const went = put(t.id, t.n, t);
    if (went < t.n) box.slots.push({ ...t, n: t.n - went }); // no room at home: it stays where it was (straight back in: the box may be a ring box away, its kept slots only)
    if (went > 0) got.push({ id: t.id, n: went });
  }
  return got;
}
