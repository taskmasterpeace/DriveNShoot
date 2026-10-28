// BACK LOTS AND ALLEYS for agents (docs/design/WEB_BACK_LOTS.md): the `backlots` command and the selftest's back-lot checks
// (run inside runSelfTest with its check() and command caller; every check returns true or a JSON diagnostic).
import { ARCHETYPES, KINDS } from '../data/citygen.js';
import { MATERIAL_RULES } from '../data/materials.js';
import { validateBacklots, FENCES, LOCKS, YARD } from '../data/backlots.js';
import { layoutTown } from '../world/citygen/layout.js';
import { buildTown } from '../world/citygen/build.js';
import { auditAlleys, auditLoops, auditYards, auditBacks } from '../world/citygen/backaudit.js';
import { TownProbe } from '../world/citygen/audit.js';
import { freeSpot } from './citygen-api.js';

const r1 = (v) => Math.round(v * 10) / 10;

// The nearest of each back-lot thing to (x, z) in the live towns (for the camera and for agents).
function nearest(g, x, z) {
  let alley = null, yard = null, dock = null, gate = null, ad = Infinity, yd = Infinity, dd = Infinity, gd = Infinity;
  for (const t of g.citygen.live.values()) {
    for (const A of t.T.alleys ?? []) { const cx = Math.max(A.lane.x0, Math.min(A.lane.x1, x)), cz = Math.max(A.lane.z0, Math.min(A.lane.z1, z)), d = Math.hypot(cx - x, cz - z); if (d < ad) { ad = d; alley = { id: A.id, row: A.row, axis: A.axis, x: r1(cx), z: r1(cz), lane: A.lane, town: t.rec.id }; } }
    for (const y of t.T.yards ?? []) { const B = t.T.buildings.find((q) => q.id === y.b), d = B ? Math.hypot((B.x0 + B.x1) / 2 - x, (B.z0 + B.z1) / 2 - z) : Infinity; if (d < yd) { yd = d; yard = { id: y.id, b: y.b, kind: B.kind, fence: y.fence, props: y.props.map((p) => p.kind), garage: y.garage, x: r1((B.x0 + B.x1) / 2), z: r1((B.z0 + B.z1) / 2), gates: y.gates }; } }
    for (const D of t.T.docks ?? []) { const d = Math.hypot((D.apron.x0 + D.apron.x1) / 2 - x, (D.apron.z0 + D.apron.z1) / 2 - z); if (d < dd) { dd = d; dock = { b: D.b, side: D.side, at: D.at, platform: !!D.platform, x: r1((D.apron.x0 + D.apron.x1) / 2), z: r1((D.apron.z0 + D.apron.z1) / 2) }; } }
    for (const q of t.built.gates) { const d = Math.hypot(q.x - x, q.z - z); if (d < gd) { gd = d; gate = { ...q }; } }
  }
  return { alley, yard, dock, gate };
}

export function backlotsCommands(api, need) {
  const g = api.g, P = () => g.player;
  return {
    backlots: {
      group: 'world', budget: 60,
      desc: 'BACK LOTS AND ALLEYS (docs/design/WEB_BACK_LOTS.md; rows in data/backlots.js): every block of a generated town has a service alley (paved in the core, gravel/dirt at the edge, a car wide) with poles, dumpsters and bins on its verges; yard homes have fenced back yards (picket / privacy / chain-link / adobe / split rail by region and wealth) with side gates and an alley gate, sheds, dog runs, clotheslines, gardens, burn barrels, cars on blocks and garages on the alley; commercial lots have loading docks; every building has a back door. No args: the live towns\' totals, the rows check and what is nearest you (alley, yard, dock, gate). action=audit id= (default every live town): the four audits (every alley driven end to end by a car; a loop walked round every building with its doors shut; every yard closed by its fences and gates and opened by its alley gate; every back door facing its alley). action=climb / action=kick: climb or kick the fence panel nearest you (as hold-E / tap-E do). action=gates: hang the yard gates near you now. action=lock / action=unlock: the nearest gate.',
      args: { action: { type: 'string', default: 'status', enum: ['status', 'audit', 'climb', 'kick', 'gates', 'lock', 'unlock'] }, id: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' } },
      run: async ({ action, id, x, z }) => {
        const BL = g.backlots, CG = g.citygen;
        const px = x ?? P().x, pz = z ?? P().z;
        if (action === 'status') return { ...BL.view(), rows: validateBacklots(undefined, MATERIAL_RULES.tags, Object.keys(KINDS)), near: nearest(g, px, pz) };
        if (action === 'audit') {
          const list = id ? [CG.live.get(id)] : [...CG.live.values()];
          need(list.length && list[0], 'nothing built (stamp a town, or go near one)');
          return { audits: list.map((t) => { const al = auditAlleys(t.built, t.T), lo = auditLoops(t.built, t.T), y = auditYards(t.built, t.T), b = auditBacks(t.T); return { town: t.rec.id, alleys: { n: al.alleys, ok: al.ok, bad: al.bad.slice(0, 6) }, loops: { n: lo.buildings, ok: lo.ok, bad: lo.bad.slice(0, 6) }, yards: { homes: y.homes, enclosed: y.enclosed, ok: y.ok, bad: y.bad.slice(0, 6) }, backs: { n: b.onBlocks, facing: b.facing, ok: b.ok, bad: b.bad.slice(0, 6) } }; }) };
        }
        if (action === 'gates') { BL.hang(px, pz); return BL.view(); }
        if (action === 'climb' || action === 'kick') {
          const f = BL.fenceNear(P(), 1.4);
          need(f, 'no fence panel within reach (stand at a yard fence)');
          if (action === 'kick') return { fence: f.id, kind: f.fence, ...BL.kick(f, P()) };
          const ok = BL.climb(f, P());
          if (ok) await api._step(Math.round(60 * 0.8));
          return { fence: f.id, kind: f.fence, climbed: ok, x: r1(P().x), z: r1(P().z), climbSeconds: FENCES[f.fence].climb };
        }
        const n = nearest(g, px, pz).gate;
        need(n, 'no yard gate near you');
        BL.hang(n.x, n.z);
        const door = [...g.interiors.ringOpen.values()].flatMap((r) => r.doors).find((d) => d.gate && Math.hypot(d.x - n.x, d.z - n.z) < 0.6);
        need(door, 'the gate has no leaf (the leaf pool is full here)');
        g.interiors.setLocked(door, action === 'lock');
        return { gate: door.id, locked: door.locked };
      },
    },
  };
}

// ---- the selftest's checks ---------------------------------------------------------------------------------------------
export async function backlotsChecks({ api, g, check, C }) {
  const p = g.player, CG = g.citygen, BL = g.backlots, I = g.interiors;
  const archs = ['sonoran_sprawl', 'dead_suburb', 'county_seat', 'plains_grain_town', 'rustbelt_mill', 'gulf_stilt_town', 'pacific_timber_port', 'oasis_ring', 'boom_strip', 'appalachian_hollow'];
  const stand = async (x, z) => {
    if (p.inVehicle) g.exitVehicle(true);
    if (Math.hypot(p.x - x, p.z - z) > 120) await C('teleport', { x, z });
    p.x = x; p.z = z; p.gy = 0; g.standOn(p); p.vx = 0; p.vz = 0; p.vault = null;
    g.camLook.x = p.x; g.camLook.z = p.z; g.camFloor = p.gy;
    await api._step(2);
  };
  const clearNear = (r = 40) => { for (const c of [...g.chars]) if (c !== p && !c.npc && (c.faction === 'zombie' || c.faction === 'raider' || c.cgTown) && Math.hypot(c.x - p.x, c.z - p.z) < r) g.removeChar(c); };
  const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  const hold = (dx, dz) => { const want = new Set(); if (dx > 0.2) want.add('KeyD'); if (dx < -0.2) want.add('KeyA'); if (dz > 0.2) want.add('KeyS'); if (dz < -0.2) want.add('KeyW'); for (const q of KEYS) { if (want.has(q)) g.input.down.add(q); else g.input.down.delete(q); } };
  const letGo = () => { for (const q of [...KEYS, 'KeyE']) g.input.down.delete(q); };

  await check('back lots: the rows validate - alleys a car wide (>= 4.5 m) with verges, every fence climbable and every breakable one heard, lock odds 0..1 for every building kind\'s class, kick > pry > pick, no purple, every collision tag (fences, sheds, dumpsters, poles, docks) ruled in data/materials.js', async () => {
    const v = validateBacklots(undefined, MATERIAL_RULES.tags, Object.keys(KINDS));
    return v.ok && v.alleys >= 3 && v.fences >= 5 && v.tags >= 10 ? true : JSON.stringify(v);
  });

  await check('back lots: every town block has an alley a car can drive - in 10 archetypes x 2 seeds, every block but a courthouse green has a service alley >= 4.5 m wide, and a car\'s 1.1 m circle drives each one end to end on the town\'s own colliders (poles, dumpsters and bins stay on the verges)', async () => {
    const bad = []; let n = 0;
    for (const a of archs) for (const seed of [7, 3301]) {
      const T = layoutTown({ arch: a, seed, x: 50000, z: 50000 }), A = auditAlleys(buildTown(T), T);
      n += A.alleys;
      if (!A.ok) bad.push(`${a}#${seed}: ${A.unalleyed ? `${A.unalleyed} blocks without an alley; ` : ''}${A.bad.slice(0, 2).join(' | ')}`);
    }
    return !bad.length && n > 200 ? true : JSON.stringify({ alleys: n, bad: bad.slice(0, 6) });
  });

  await check('back lots: a person can walk a loop round every building of a test town - with every door and bay shut (no cutting through), from each building\'s front step a 0.4 m person on foot reaches all four sides and all four corners of it (no sealed gaps between neighbours, yard fences, docks, escapes or canopies), in 4 towns', async () => {
    const bad = []; let n = 0;
    for (const [a, seed] of [['dead_suburb', 21], ['sonoran_sprawl', 9182], ['county_seat', 44], ['gulf_stilt_town', 5]]) {
      const T = layoutTown({ arch: a, seed, x: 60000, z: 60000 }), L = auditLoops(buildTown(T), T);
      n += L.buildings;
      if (!L.ok) bad.push(`${a}#${seed}: ${L.bad.slice(0, 3).join(' | ')} (${L.bad.length})`);
    }
    return !bad.length && n > 250 ? true : JSON.stringify({ buildings: n, bad });
  });

  await check('back lots: every house has a fenced yard with a gate - every yard home on a res/farm lot of 10 archetypes has fence panels and an alley gate; from inside the yard with its gates shut a person reaches neither the alley lane nor the street; with the alley gate open it reaches the alley', async () => {
    const bad = []; let homes = 0, enclosed = 0;
    for (const a of archs) {
      const T = layoutTown({ arch: a, seed: 7, x: 70000, z: 70000 }), Y = auditYards(buildTown(T), T);
      homes += Y.homes; enclosed += Y.enclosed;
      if (!Y.ok) bad.push(`${a}: ${Y.bad.slice(0, 3).join(' | ')}`);
    }
    return !bad.length && homes > 150 && enclosed === homes ? true : JSON.stringify({ homes, enclosed, bad: bad.slice(0, 6) });
  });

  await check('back lots: back doors face the alley - every building in 10 archetypes has a door or a bay on its back wall (a dock on commercial lots), and on a block the back wall faces that block\'s alley', async () => {
    const bad = []; let n = 0, docks = 0;
    for (const a of archs) for (const seed of [7, 3301]) {
      const T = layoutTown({ arch: a, seed, x: 80000, z: 80000 }), B = auditBacks(T);
      n += B.facing; docks += T.docks.length;
      if (!B.ok) bad.push(`${a}#${seed}: ${B.bad.slice(0, 3).join(' | ')}`);
    }
    return !bad.length && n > 600 && docks > 50 ? true : JSON.stringify({ facing: n, docks, bad: bad.slice(0, 6) });
  });

  // ---- live: a town stamped in the streamed world ----
  let t = CG.live.get('bl-selftest');
  if (!t) { const s = freeSpot(g, 9000, -7000, 230); if (s) t = CG.stampAt({ id: 'bl-selftest', arch: 'dead_suburb', seed: 21, x: s.x, z: s.z }); }
  const yardOf = (pred) => (t?.T.yards ?? []).filter(pred).sort((a, b) => Math.hypot(a.gates[0].x - t.rec.x, a.gates[0].z - t.rec.z) - Math.hypot(b.gates[0].x - t.rec.x, b.gates[0].z - t.rec.z))[0];

  await check('back lots: kicking a back door is louder than picking it (and a bar is in between) - a locked back door in a stamped town: a kick is heard 30 m off, a crowbar 18 m, picks not at all; lock odds come from the rows (a holding town locks more back doors than an overrun one)', async () => {
    if (!t) return 'no ground for a stamp';
    const R = t.blds.find((q) => !q.B.outbuilding && q.B.doors.some((d) => d.side !== q.B.front && d.kind === 'door'));
    await stand((R.minX + R.maxX) / 2, R.maxZ + 6);
    clearNear(60);
    CG.openings(p.x, p.z);
    await api._step(2);
    const rec = I.ringOpen.get(R.open), backs = rec?.doors.filter((d) => d.kind === 'back') ?? [];
    if (!backs.length) return JSON.stringify({ open: R.open, doors: rec?.doors.map((d) => d.kind) });
    const door = backs[0], heard = [];
    const was = g.noise;
    g.noise = function (x, z, r, src) { heard.push(r); return was.call(this, x, z, r, src); };
    const loud = async (fn) => { heard.length = 0; I.setLocked(door, true); fn(); await api._step(2); return Math.max(0, ...heard); };
    let kick, pry, pick;
    try {
      p.kickAt = -9;
      await stand(door.x + door.nx * 1.3, door.z + door.nz * 1.3);
      kick = await loud(() => I.kick(door, p));
      pry = await loud(() => g.inventory.forceLock(door, 'pry', false));
      pick = await loud(() => g.inventory.forceLock(door, 'pick', false));
    } finally { delete g.noise; if (g.noise !== was) g.noise = was; }
    I.setLocked(door, false);
    const odds = [BL.backLock({ kind: 'house' }, { state: 'holding' }), BL.backLock({ kind: 'house' }, { state: 'overrun' }), BL.backLock({ kind: 'police_station' }, { state: 'holding' })];
    return kick > pry && pry > pick && kick >= 30 && odds[0] > odds[1] && odds[2] > odds[0] && odds[0] === LOCKS.home.holding ? true : JSON.stringify({ kick, pry, pick, odds });
  });

  await check('back lots: climbing a fence is slower than the gate - in a stamped town, walking in through a yard\'s alley gate (held keys, the leaf shoved open) takes less time than climbing the fence panel beside it (held E: the climb row\'s seconds, then the drop); kicking a picket panel twice breaks it (heard), a chain-link one never gives', async () => {
    if (!t) return 'no ground for a stamp';
    const y = yardOf((q) => q.gates.some((g2) => g2.kind === 'alley'));
    if (!y) return 'no yard';
    const gt = y.gates.find((q) => q.kind === 'alley'), nx = gt.nx, nz = gt.nz;
    await stand(gt.x + nx * 1.8, gt.z + nz * 1.8);
    clearNear(60);
    BL.hang(p.x, p.z, 80);
    await api._step(2);
    const leaf = [...I.ringOpen.values()].flatMap((r) => r.doors).find((d) => d.gate && Math.hypot(d.x - gt.x, d.z - gt.z) < 0.6);
    if (leaf?.locked) I.setLocked(leaf, false);
    // through the gate on held keys
    let tGate = null;
    for (let f = 0; f < 60 * 8; f++) {
      const along = (p.x - gt.x) * nx + (p.z - gt.z) * nz;
      if (along < -1.2) { tGate = f / 60; break; }
      hold(gt.x - nx * 2 - p.x, gt.z - nz * 2 - p.z);
      await api._step(1);
    }
    letGo();
    // over a panel of the same back fence, 2.5 m or more from any gate, on held E
    const F = FENCES[y.fence], line = nz !== 0 ? gt.z : gt.x;
    const panels = t.built.fences.filter((f) => f.yard === y.id && !f.broken && (nz !== 0 ? f.horiz && Math.abs((f.box.minZ + f.box.maxZ) / 2 - line) < 0.2 : !f.horiz && Math.abs((f.box.minX + f.box.maxX) / 2 - line) < 0.2));
    let spot = null;
    for (const f of panels) { const b = f.box; for (let a = 0.6; a < 1; a += 0.1) { const x = nz !== 0 ? b.minX + (b.maxX - b.minX) * a : line, z = nz !== 0 ? line : b.minZ + (b.maxZ - b.minZ) * a; if (t.built.gates.every((q) => Math.hypot(q.x - x, q.z - z) > 2.6) && t.built.bays.every((q) => Math.hypot(q.x - x, q.z - z) > q.w / 2 + 3.2)) { spot = { x, z, f }; break; } } if (spot) break; }
    if (!spot) return JSON.stringify({ tGate, panels: panels.length });
    await stand(spot.x + nx * 0.85, spot.z + nz * 0.85);
    let tClimb = null;
    for (let f = 0; f < 60 * 8; f++) {
      const along = (p.x - spot.x) * nx + (p.z - spot.z) * nz;
      if (along < -0.5 && !p.vault) { tClimb = f / 60; break; }
      g.input.down.add('KeyE');
      await api._step(1);
    }
    letGo();
    // the boot: a picket (or board) panel goes, chain-link never
    const pk = t.built.fences.find((f) => !f.broken && FENCES[f.fence].kicks > 0), ch = t.built.fences.find((f) => !f.broken && FENCES[f.fence].kicks === 0);
    let broke = null, held = null;
    if (pk) { for (let k = 0; k < FENCES[pk.fence].kicks + 1 && !pk.broken; k++) { BL.kickAt = -9; BL.kick(pk, p); } broke = pk.broken && pk.box.base > 50; }
    if (ch) { for (let k = 0; k < 4; k++) { BL.kickAt = -9; BL.kick(ch, p); } held = !ch.broken; }
    return tGate !== null && tClimb !== null && tClimb > tGate && tClimb >= F.climb && broke !== false && held !== false ? true : JSON.stringify({ tGate, tClimb, climbRow: F.climb, fence: y.fence, broke, held, leaf: !!leaf });
  });

  await check('back lots: AI pathing uses the alleys - in a stamped town the foot nav grid holds the town\'s walls and fences (engine/nav.js overlay): a route from one end of a block\'s alley to the other stays in the alley, and a route from the street in front of a yard home to its back yard (whose straight line meets a wall or fence) never passes through a wall or a fence panel - it goes by the doors, the gates and the alley', async () => {
    if (!t) return 'no ground for a stamp';
    const A = (t.T.alleys ?? []).filter((q) => (q.axis === 'x' ? q.x1 - q.x0 : q.z1 - q.z0) > 50).sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - t.rec.x, (a.z0 + a.z1) / 2 - t.rec.z) - Math.hypot((b.x0 + b.x1) / 2 - t.rec.x, (b.z0 + b.z1) / 2 - t.rec.z))[0];
    if (!A) return 'no long alley';
    const L = A.lane, ax = A.axis === 'x';
    const sx = ax ? L.x0 + 2 : (L.x0 + L.x1) / 2, sz = ax ? (L.z0 + L.z1) / 2 : L.z0 + 2, ex = ax ? L.x1 - 2 : sx, ez = ax ? sz : L.z1 - 2;
    await stand(sx, sz);
    BL.dirtyNav();
    const route = g.footPath(sx, sz, ex, ez);
    const inCorr = (x, z) => x > A.x0 - 1.2 && x < A.x1 + 1.2 && z > A.z0 - 1.2 && z < A.z1 + 1.2;
    const along = (pts, ok) => { let px2 = pts.from.x, pz2 = pts.from.z; for (const q of pts.list) { for (let k = 0; k <= 10; k++) { const x = px2 + (q.x - px2) * k / 10, z = pz2 + (q.z - pz2) * k / 10; if (!ok(x, z)) return false; } px2 = q.x; pz2 = q.z; } return true; };
    const alleyOk = !!route && along({ from: { x: sx, z: sz }, list: route }, inCorr);
    // round a house: street in front -> inside its alley gate
    const y = yardOf(() => true), H = t.T.buildings.find((q) => q.id === y.b), gt = y.gates.find((q) => q.kind === 'alley');
    for (const d of [...I.ringOpen.values()].flatMap((r) => r.doors)) if (d.gate && d.locked) I.setLocked(d, false);
    // a line across the house well clear of its doors: the street 4 m in front, the yard 1.4 m behind the back wall
    const hx = H.front === 'N' || H.front === 'S', u0 = hx ? H.x0 : H.z0, u1 = hx ? H.x1 : H.z1;
    let u = (u0 + u1) / 2, best = -1;
    for (let a = u0 + 1; a <= u1 - 1; a += 0.25) { const m = Math.min(...H.doors.map((d) => Math.abs(d.at - a))); if (m > best) { best = m; u = a; } }
    const sF = H.front === 'N' || H.front === 'W' ? -1 : 1, vF = H.front === 'N' ? H.z0 : H.front === 'S' ? H.z1 : H.front === 'W' ? H.x0 : H.x1, vB = H.front === 'N' ? H.z1 : H.front === 'S' ? H.z0 : H.front === 'W' ? H.x1 : H.x0;
    const fx = hx ? u : vF + sF * 4, fz = hx ? vF + sF * 4 : u, tx = hx ? u : vB - sF * 1.4, tz = hx ? vB - sF * 1.4 : u;
    await stand(fx, fz);
    BL.dirtyNav();
    const r2 = g.footPath(fx, fz, tx, tz);
    // through doors and gates is fine (a house is enterable): through a wall or a fence panel is not
    const walls = t.built.boxes.filter((b) => b.base < 2.5 && (b.tag.startsWith('cg-wall') || b.tag === 'cg-half' || b.tag === 'cg-townwall' || b.fence));
    const probe = new TownProbe({ boxes: walls, recs: [] }), solid = (x, z) => probe.blocked(x, z, 0, 0.05);
    let hit = null;
    const fine = (pts) => { let px2 = pts.from.x, pz2 = pts.from.z; for (const q of pts.list) { const L2 = Math.hypot(q.x - px2, q.z - pz2), k2 = Math.max(1, Math.ceil(L2 / 0.04)); for (let k = 0; k <= k2; k++) { const x = px2 + (q.x - px2) * k / k2, z = pz2 + (q.z - pz2) * k / k2; if (solid(x, z)) { hit = { x: r1(x), z: r1(z), box: t.built.boxes.filter((b) => b.base < 2.5 && x > b.minX - 0.06 && x < b.maxX + 0.06 && z > b.minZ - 0.06 && z < b.maxZ + 0.06).map((b) => `${b.tag} ${r1(b.minX)},${r1(b.minZ)},${r1(b.maxX)},${r1(b.maxZ)}`) }; return false; } } px2 = q.x; pz2 = q.z; } return true; };
    const roundOk = !!r2 && fine({ from: { x: fx, z: fz }, list: r2 });
    const hit1 = hit;
    // the straight line would have met a wall or a fence (the route had to find its way)
    const straightThrough = !fine({ from: { x: fx, z: fz }, list: [{ x: tx, z: tz }] });
    return alleyOk && roundOk && straightThrough ? true : JSON.stringify({ alley: A.id, route: route?.length ?? null, alleyOk, r2: r2?.map((q) => [r1(q.x), r1(q.z)]).slice(0, 8) ?? null, roundOk, straightThrough, hit: hit1, from: [r1(fx), r1(fz)], house: [H.x0, H.z0, H.x1, H.z1, H.front], doors: H.doors.map((d) => `${d.side}@${d.at}`) });
  });

  await check('back lots: draw calls stay under 150 standing in an alley of a stamped town (alleys, fences, yard things and verge props are items of the one instanced town mesh; gates are leaves of the interiors pool)', async () => {
    if (!t) return 'no ground for a stamp';
    const A = t.T.alleys[0];
    await stand((A.lane.x0 + A.lane.x1) / 2, (A.lane.z0 + A.lane.z1) / 2);
    BL.hang(p.x, p.z);
    await api._step(20);
    g.render(0);
    const perf = await C('perf');
    return perf.drawCalls < 150 && t.built.fences.length > 50 ? true : JSON.stringify({ drawCalls: perf.drawCalls, fences: t.built.fences.length });
  });

  letGo();
  if (CG.live.has('bl-selftest')) CG.remove('bl-selftest');
  void ARCHETYPES; void YARD;
}
