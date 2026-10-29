// DEAD CARS for agents (data/wrecks.js; systems/wrecks.js): the `wrecks` command and the selftest's check that no static
// car is built from raw boxes any more - every car-shaped collider in the live world has one of our vehicle bodies, dead,
// standing in it.
import { VEHICLES } from '../systems/vehicles.js';
import { validateWrecks, WRECK_STATES } from '../data/wrecks.js';

const r1 = (v) => Math.round(v * 10) / 10;
// Every collider tag a static car stands in.
export const CAR_TAGS = new Set(['wreck', 'cg-wreck', 'bl-burnt', 'bl-carblocks', 'hulk', 'chassis', 'car']);

// The live car colliders: the island's, the hot chunks' (centred in a hot chunk: a neighbour's box reaching in is its
// own chunk's), the live towns'. -> [{ src, x, z, b }]
export function carColliders(g) {
  const out = [], seen = new Set();
  // (a car is under 2.4 m across: a base's helicopter wreck shares the 'wreck' tag and is not a car)
  const push = (src, b) => { if (!CAR_TAGS.has(b.tag) || seen.has(b) || Math.min(b.maxX - b.minX, b.maxZ - b.minZ) > 2.4) return; seen.add(b); out.push({ src, x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, b }); };
  for (const b of g.statics.boxes) push('island', b);
  const S = g.streamer;
  if (S) for (const key of S.hot.keys()) {
    const L = S.layouts.get(key);
    if (!L?.hot?.done) continue;
    for (const b of L.boxes ?? []) { const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2; if (Math.floor(x / 256) === L.cx && Math.floor(z / 256) === L.cz) push(`chunk ${key}`, b); }
  }
  for (const t of g.citygen?.live.values() ?? []) for (const b of t.built.boxes) push(`town ${t.rec.id}`, b);
  return out;
}

// Each collider and the wreck standing in it (or null).
export function auditWrecks(g) {
  const W = g.wrecks, recs = W.list(), cols = carColliders(g), bad = [];
  const grid = new Map(), k = (x, z) => Math.floor(x / 8) * 100003 + Math.floor(z / 8);
  for (const r of recs) { const q = k(r.x, r.z); (grid.get(q) ?? grid.set(q, []).get(q)).push(r); }
  let matched = 0;
  for (const c of cols) {
    const b = c.b;
    let hit = null;
    for (let i = -1; i <= 1 && !hit; i++) for (let j = -1; j <= 1 && !hit; j++) for (const r of grid.get(k(c.x + i * 8, c.z + j * 8)) ?? []) if (r.x > b.minX - 0.35 && r.x < b.maxX + 0.35 && r.z > b.minZ - 0.35 && r.z < b.maxZ + 0.35) { hit = r; break; }
    if (hit) matched++; else bad.push(`${c.src}: a ${b.tag} at ${r1(c.x)},${r1(c.z)} has no body`);
  }
  const notOurs = recs.filter((r) => !VEHICLES[r.type] || !WRECK_STATES[r.state]).map((r) => `${r.key}: ${r.type}/${r.state}`);
  return { colliders: cols.length, matched, wrecks: recs.length, bad, notOurs, ok: !bad.length && !notOurs.length };
}

export function wrecksCommands(api, need) {
  const g = api.g, P = () => g.player;
  return {
    wrecks: {
      group: 'world',
      desc: 'DEAD CARS (data/wrecks.js; systems/wrecks.js): every static car in the world - a wreck on the shoulder, a hulk in a boneyard, a car on blocks in a yard or a chop shop, a burned-out shell in an alley, a base\'s stripped truck - is one of our own vehicle bodies (sedan, pickup, van, LAWMAN) in a dead state (rusted and abandoned, burned out, stripped on blocks), all in one batched mesh. No args: the live wrecks by type x state, the rows check, and the nearest 12 to x,z (default you). action=audit: every car-shaped collider in the live world (island, hot chunks, live towns) and the body standing in it (none may be raw boxes).',
      args: { action: { type: 'string', default: 'status', enum: ['status', 'audit'] }, x: { type: 'number' }, z: { type: 'number' } },
      run: async ({ action, x, z }) => {
        need(g.wrecks, 'no wreck system');
        if (action === 'audit') { const A = auditWrecks(g); return { ...A, bad: A.bad.slice(0, 12), notOurs: A.notOurs.slice(0, 12) }; }
        const px = x ?? P().x, pz = z ?? P().z;
        const near = g.wrecks.list().map((r) => ({ key: r.key, type: r.type, state: r.state, x: r1(r.x), z: r1(r.z), stack: r.stack ?? 0, d: r1(Math.hypot(r.x - px, r.z - pz)) })).sort((a, b) => a.d - b.d).slice(0, 12);
        return { ...g.wrecks.view(), rows: validateWrecks(VEHICLES), near };
      },
    },
  };
}

export async function wrecksChecks({ api, g, check, C }) {
  await check('wrecks: no static car is built from raw boxes - every car-shaped collider in the live world (the island, the hot chunks along the road, a live town\'s streets, alleys and yards) has one of our vehicle bodies (sedan, pickup, van, LAWMAN; vehiclebodies.js) standing in it in a dead state (rusted, burned out, stripped on blocks); the rows validate; every dead car of the world is in one batched mesh (one draw call)', async () => {
    const v = validateWrecks(VEHICLES);
    // somewhere with chunk wrecks and a town: the road west of the island, and a town stamped near it
    const keep = { x: g.player.x, z: g.player.z };
    await C('teleport', { x: -1400, z: 0 });
    await api._step(30);
    const A = auditWrecks(g);
    const states = new Set(g.wrecks.list().map((r) => r.state)), types = new Set(g.wrecks.list().map((r) => r.type));
    let batches = 0; g.scene.traverse((o) => { if (o.isBatchedMesh && o.name === 'wrecks') batches++; });
    await C('teleport', keep);
    return v.ok && A.ok && A.colliders >= 10 && A.matched === A.colliders && types.size >= 2 && batches === 1 ? true : JSON.stringify({ rows: v, colliders: A.colliders, matched: A.matched, wrecks: A.wrecks, bad: A.bad.slice(0, 6), notOurs: A.notOurs.slice(0, 4), states: [...states], types: [...types], batches });
  });
}
