// THE MILITARY BASE PLAN (docs/design/WEB_MILITARY_BASES.md §3): a pure function of a data/milbases.js row, a seed and
// where it stands. No three.js, no game: node runs it too (the selftest stamps it headless). It speaks citygen's own
// language - a town plan T (roads, blocks, KINDS buildings) that world/citygen/build.js makes solid - plus the pieces only a
// base has, laid by buildMilbase on top of buildTown's output:
//   the wire     two chain-link fences `inset` apart (see-through: sight and rounds pass, walkers and cars do not), a gap
//                for each gate (west and east, on the main road), watchtowers at the corners and every `towerEvery` m; a
//                gate leaf that rolls shut (held: open; sealed: chained shut, with a cut in the wire on the south run)
//   the approach each gate's road runs out `len` m, with checkpoints: a jersey-barrier chicane, sandbags, a dead vehicle
//   the yard     a command post (three storeys) beside the bunker portal (its blast door over the underground level), an
//                armory (one locked steel door, the best loot rolled once), a hospital, a quartermaster's store, barracks
//                quads round parade squares, family housing, motor pools of REAL dead vehicles on an apron, a fuel farm
//   the branch   air base: a runway, a taxiway, hangars, a control tower; naval: the harbour's quay and piers, a dry dock
//                with a dead hull, warehouses; depot: rows of earth-covered igloos; army post: ranges (a proving ground: more)
// T.mb carries what systems/milbases.js runs: the fences (the perimeter check), gates, towers, posts and the patrol loop,
// the armory, the quartermaster, the blast door, the generator, the duty log, the bunker hatch, the horde's clusters.
import { MB_CLASSES, MB_SHAPES, MB_MOTOR, MB_RULES } from '../../data/milbases.js';
import { BIOMES } from '../../data/citygen.js';
import { makeRng } from '../../engine/rng.js';
import { makeBuilding, layoutBase } from './layout.js';
import { buildTown } from './build.js';

const OLIVE = ['#6a6a4e', '#7a7458', '#5e5e48', '#8a8266', '#727056'];
const pickW = (rng, obj) => { let t = 0; for (const k in obj) t += obj[k]; let p = rng() * t; for (const k in obj) if ((p -= obj[k]) < 0) return k; return Object.keys(obj)[0]; };

// opts: { row (a MILBASES row), seed, x, z, biome?, id?, name? }
export function layoutMilbase(opts) {
  const M = opts.row, S = MB_SHAPES[M.shape], C = MB_CLASSES[M.cls], F = MB_RULES.fence, A = MB_RULES.approach;
  const rng = makeRng((opts.seed >>> 0) || 1);
  const [W, D] = M.size, cx = Math.round(opts.x), cz = Math.round(opts.z);
  const biome = opts.biome && BIOMES[opts.biome] ? opts.biome : 'desert_sonoran';
  const T = { id: opts.id ?? `mb-${M.id}`, name: opts.name ?? M.name, arch: 'milbase', military: true, milbase: M.id, biome, seed: opts.seed, cx, cz, size: W,
    x0: cx - W / 2, z0: cz - D / 2, x1: cx + W / 2, z1: cz + D / 2, damage: M.status === 'overrun' ? 0.45 : 0.2, wealth: 0.7,
    roads: [], blocks: [], buildings: [], bridges: [], wall: null, gates: [], wrecks: [], lamps: [], runway: null, alleys: [], yards: [], docks: [], backProps: [] };
  const mb = T.mb = { id: M.id, status: M.status, holder: M.holder, shape: M.shape, cls: M.cls, label: C.label,
    fences: [], gates: [], towers: [], posts: [], patrol: [], clusters: [], pieces: [], wrecks: [], loot: [], barriers: [], breach: null,
    armory: null, hospital: null, hq: null, qm: null, blast: null, generator: null, log: null, hatch: null, runway: null, piers: [], drydock: null, igloos: [], hangars: [], tanks: [], motor: [] };
  // the wire: outer fence on the base's edge, inner fence `inset` inside it; the ring road just inside the inner fence
  const outer = { x0: T.x0, z0: T.z0, x1: T.x1, z1: T.z1 }, inner = { x0: T.x0 + F.inset, z0: T.z0 + F.inset, x1: T.x1 - F.inset, z1: T.z1 - F.inset };
  mb.fences.push({ ...outer, kind: 'outer' }, { ...inner, kind: 'inner' });
  for (const side of ['W', 'E']) mb.gates.push({ side, at: cz, w: F.gate, x: side === 'W' ? T.x0 : T.x1, z: cz, open: M.status !== 'sealed' });
  T.gates = mb.gates.map((g) => ({ side: g.side, at: g.at, w: g.w, x: g.x, z: g.z, open: g.open }));
  if (M.status === 'sealed') mb.breach = { side: 'S', at: Math.round(cx + W * 0.18), w: 3 }; // the way in on foot: a cut in both fences
  const ring = 22, ix0 = T.x0 + ring + 10, iz0 = T.z0 + ring + 10, ix1 = T.x1 - ring - 10, iz1 = T.z1 - ring - 10; // usable yard
  // roads: the main road W-E through both gates and out along the approaches, the cross road N-S, the ring road
  T.roads.push({ axis: 'x', x0: T.x0 - A.len, x1: T.x1 + A.len, z0: cz - 5, z1: cz + 5, row: 'blacktop2', main: true, at: cz });
  T.roads.push({ axis: 'z', x0: cx - 4, x1: cx + 4, z0: T.z0 + ring - 4, z1: T.z1 - ring + 4, row: 'blacktop2', at: cx });
  for (const z of [T.z0 + ring, T.z1 - ring]) T.roads.push({ axis: 'x', x0: T.x0 + ring - 4, x1: T.x1 - ring + 4, z0: z - 4, z1: z + 4, row: 'gravel', at: z });
  for (const x of [T.x0 + ring, T.x1 - ring]) T.roads.push({ axis: 'z', x0: x - 3, x1: x + 3, z0: T.z0 + ring - 4, z1: T.z1 - ring + 4, row: 'gravel', at: x });
  T.blocks.push({ x0: T.x0, z0: T.z0, x1: T.x1, z1: T.z1 }); // the base's own ground under everything

  let nid = 0;
  const add = (k, x0, z0, w, d, front, o = {}) => {
    const B = makeBuilding(rng, k, Math.round(x0), Math.round(z0), Math.round(x0 + w), Math.round(z0 + d), front, { zone: 'military', color: rng.pick(OLIVE), roofColor: '#56584a', id: `${T.id}.b${nid++}`, ...o });
    if (o.name) B.name = o.name;
    if (o.loot) B.loot = o.loot;
    T.buildings.push(B); return B;
  };
  const piece = (kind, x0, z0, x1, z1, h, col, o = {}) => { const p = { kind, x0, z0, x1, z1, h, col, ...o }; mb.pieces.push(p); return p; };
  const N = cz - 8, Sz = cz + 8; // the main road's kerbs
  // ---- the command block (south-west): HQ, the bunker portal beside it, the armory, the hospital ----
  const hq = mb.hq = add('hq', ix0, Sz + 6, 28, 20, 'N', { storeys: 3, name: 'COMMAND POST', loot: 'mb_command' });
  // the bunker portal: a poured head on the apron east of the HQ, its blast door facing the road; the hatch inside it
  const px0 = hq.x1 + 10, pz0 = Sz + 10, pw = 12, pd = 10;
  piece('portal', px0, pz0, px0 + pw, pz0 + pd, 4.2, '#7a786e', { door: { side: 'N', at: px0 + pw / 2, w: 4 } });
  mb.blast = { x: px0 + pw / 2, z: pz0, w: 4, open: M.status !== 'sealed' };
  mb.hatch = { x: Math.round(px0 + pw / 2) + 0.5, z: Math.round(pz0 + pd / 2) + 0.5 };
  mb.generator = { x: px0 + pw + 3, z: pz0 + 2 };
  piece('generator', mb.generator.x - 1, mb.generator.z - 0.5, mb.generator.x + 1, mb.generator.z + 0.5, 1.3, '#4e5a44');
  mb.log = { x: (hq.x0 + hq.x1) / 2 + 3, z: hq.z0 + 2.2 }; // a duty board inside the HQ's front door
  const arm = mb.armory = add('clinic', ix0, hq.z1 + 14, 16, 11, 'N', { storeys: 1, name: 'ARMORY', loot: 'mb_armory' });
  mb.hospital = add('hospital', arm.x1 + 14, hq.z1 + 14, 30, 22, 'N', { storeys: 2, name: 'BASE HOSPITAL', loot: 'mb_hospital' });
  mb.qm = add('shop', px0 + pw + 12, Sz + 6, 16, 12, 'N', { storeys: 1, name: 'QUARTERMASTER', loot: 'military' });
  mb.clusters.push({ x: (hq.x0 + hq.x1) / 2, z: hq.z1 + 7 });
  // ---- the barracks quads and the family housing (south-east) ----
  const [quads, per] = S.barracks;
  let qx = cx + 16;
  for (let q = 0; q < quads && qx + 92 < ix1; q++, qx += 104) {
    const qz = Sz + 10;
    add('barracks', qx, qz, 30, 11, 'S', { storeys: 2 });
    if (per > 1) add('barracks', qx + 50, qz, 30, 11, 'S', { storeys: 2 });
    if (per > 2) add('barracks', qx, qz + 52, 30, 11, 'N', { storeys: 2 });
    if (per > 3) add('barracks', qx + 50, qz + 52, 30, 11, 'N', { storeys: 2 });
    piece('square', qx + 4, qz + 16, qx + 76, qz + 47, 0, '#8e8a78');
    mb.clusters.push({ x: qx + 40, z: qz + 31 });
  }
  const [hr, hc] = S.housing;
  for (let r = 0; r < hr; r++) for (let c = 0; c < hc; c++) {
    const hx = cx + 20 + c * 24, hz = iz1 - 24 - r * 24;
    if (hz < Sz + 80 || hx + 11 > ix1) continue;
    add(rng.chance(0.5) ? 'house' : 'bungalow', hx, hz, 11, 9, 'N', { claimable: true });
  }
  // ---- the north half: the branch's own ----
  const nz0 = iz0, nz1 = N - 6;
  const motorAt = (x0, z0, w) => { // a motor pool: shops along the back, the apron of dead vehicles in front
    const shops = S.motor.shops, sw = 20;
    for (let i = 0; i < shops; i++) mb.motor.push(add('auto_shop', x0 + i * (sw + 8), z0, sw, 14, 'S', { name: 'MOTOR POOL' }));
    const ax0 = x0, az0 = z0 + 20, ax1 = x0 + w, az1 = az0 + S.motor.rows * MB_MOTOR.gap[0] + 6;
    piece('apron', ax0, az0, ax1, az1, 0, '#8a8578');
    mb.apron = { x0: ax0, z0: az0, x1: ax1, z1: az1 };
    for (let r = 0; r < S.motor.rows; r++) for (let c = 0; c < S.motor.cols; c++) {
      const x = ax0 + 6 + c * MB_MOTOR.gap[1], z = az0 + 6 + r * MB_MOTOR.gap[0];
      if (x > ax1 - 4) continue;
      if (rng.chance(0.12)) continue; // an empty bay
      const type = pickW(rng, MB_MOTOR.types), state = pickW(rng, MB_MOTOR.states);
      mb.wrecks.push({ x, z, rot: rng.chance(0.85) ? 0 : Math.PI, type, state, paint: rng.pick(MB_MOTOR.paints) });
    }
    mb.clusters.push({ x: (ax0 + ax1) / 2, z: (az0 + az1) / 2 });
    return az1;
  };
  const fuelFarm = (x0, z0, n) => { // tanks in berms, a pump house
    for (let i = 0; i < n; i++) {
      const tx = x0 + i * 22;
      piece('berm', tx, z0, tx + 18, z0 + 18, 0.9, '#8a7a5e', { ring: true, gapSide: 'S' });
      piece('tank', tx + 4, z0 + 4, tx + 14, z0 + 14, 6, '#9a9a8e');
      mb.tanks.push({ x: tx + 9, z: z0 + 9 });
    }
    piece('pumphouse', x0, z0 + 24, x0 + 6, z0 + 29, 2.8, '#6e6a58');
    mb.loot.push({ id: `mb:${M.id}:fuel`, table: 'mb_fuel', x: x0 + 3, z: z0 + 30.2, cap: 40, label: 'FUEL FARM · PUMP HOUSE' });
  };
  if (M.shape === 'air') {
    const rl = Math.round((ix1 - ix0) * S.runway[0]), rw = S.runway[1], rx0 = Math.round(cx - rl / 2);
    mb.runway = T.runway = { x0: rx0, x1: rx0 + rl, z0: nz0, z1: nz0 + rw };
    T.roads.push({ axis: 'x', x0: rx0, x1: rx0 + rl, z0: nz0, z1: nz0 + rw, row: 'blacktop4', at: nz0 + rw / 2, runway: true });
    T.roads.push({ axis: 'x', x0: rx0 + 30, x1: rx0 + rl - 30, z0: nz0 + rw + 10, z1: nz0 + rw + 20, row: 'blacktop2', at: nz0 + rw + 15 }); // the taxiway
    for (let k = 0; k < 9; k++) piece('mark', rx0 + 20 + k * 6, nz0 + 3, rx0 + 23 + k * 6, nz0 + rw - 3, 0, '#d8d2bc'); // the threshold stripes
    const hz = nz0 + rw + 26, hn = S.hangars, step = Math.min(56, (ix1 - ix0 - 60) / hn);
    for (let i = 0; i < hn; i++) mb.hangars.push(add('quonset', ix0 + 30 + i * step, hz, 34, 40, 'N', { name: 'HANGAR' }));
    const tw = add('office', ix1 - 22, hz + 6, 12, 12, 'N', { storeys: 4, name: 'CONTROL TOWER' });
    mb.tower = tw;
    mb.clusters.push({ x: ix0 + 30 + step, z: hz - 4 });
    const mz = hz + 48;
    if (mz + 50 < nz1) { motorAt(ix0, mz, Math.min(140, (cx - ix0) - 20)); fuelFarm(cx + 30, mz, S.fuel); }
    else { motorAt(ix0, Sz + 120 > iz1 - 60 ? hz + 46 : hz + 46, 120); }
  } else if (M.shape === 'naval') {
    // the harbour: the north band is water; a quay wall along it, piers running out into it, a dry dock with a dead hull
    const qz = nz0 + Math.round((nz1 - nz0) * 0.42);
    piece('harbour', T.x0 + F.inset + 1, T.z0 + F.inset + 1, T.x1 - F.inset - 1, qz, 0, '#3e5560', { water: true });
    piece('quay', T.x0 + F.inset + 1, qz - 0.6, T.x1 - F.inset - 1, qz, 0.9, '#8a8a80', { rail: true });
    const [pn, pl, pw2] = S.piers, pstep = Math.min(70, (ix1 - ix0 - 160) / pn);
    for (let i = 0; i < pn; i++) {
      const x0 = ix0 + 10 + i * pstep, z1 = qz, z0 = Math.max(T.z0 + F.inset + 4, qz - pl);
      mb.piers.push(piece('pier', x0, z0, x0 + pw2, z1, 0, '#8e8676', { deck: true }));
    }
    const [dw, dd] = S.drydock, dx0 = ix1 - dd - 10, dz0 = qz - dw - 2;
    mb.drydock = piece('drydock', dx0, Math.max(T.z0 + F.inset + 4, dz0), dx0 + dd, qz, 0, '#5e5e58', { rail: true });
    piece('hull', dx0 + 12, Math.max(T.z0 + F.inset + 10, dz0 + 8), dx0 + dd - 12, qz - 8, 7, '#6a6c66');
    const wz = qz + 14;
    let wx = ix0;
    for (let i = 0; i < S.warehouses; i++, wx += 44) { if (wx + 32 > cx) break; add('warehouse', wx, wz, 32, 24, 'N', { name: 'NAVAL STORES' }); }
    mb.clusters.push({ x: ix0 + 60, z: wz + 30 });
    // the motor pool and the fuel farm beside the stores, along the quay road
    wx = Math.max(wx, cx + 10); // east of the cross road
    const mw = Math.min(120, ix1 - wx - 10);
    motorAt(wx, wz, mw);
    const fn = Math.min(S.fuel, Math.floor((ix1 - (wx + mw + 10)) / 22));
    if (fn > 0) fuelFarm(wx + mw + 10, wz, fn);
  } else if (M.shape === 'depot') {
    // the magazine field: rows of earth-covered igloos, doors to the south, a crate at each door
    const [rows, perRow] = S.igloos, gx = 30, gz = 32;
    let k = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < perRow; c++) {
      const x0 = cx + 10 + c * gx, z0 = nz0 + r * gz;
      if (x0 + 12 > ix1 || z0 + 18 > nz1) continue;
      mb.igloos.push(piece('igloo', x0, z0, x0 + 12, z0 + 18, 4.2, '#7a7a52', { door: 'S' }));
      if ((r * 7 + c * 3) % 4 === 0) mb.loot.push({ id: `mb:${M.id}:igloo${k}`, table: 'military', x: x0 + 6, z: z0 + 19.4, cap: 50, label: `MAGAZINE ${k + 1}` });
      k++;
    }
    for (let i = 0; i < S.warehouses; i++) { const x = ix0 + i * 44; if (x + 32 > cx - 6) break; add('warehouse', x, nz0, 32, 24, 'S', { name: 'DEPOT STORES' }); }
    mb.clusters.push({ x: cx + 60, z: nz0 + 50 });
    motorAt(ix0, nz0 + 40, Math.min(120, cx - ix0 - 20));
    fuelFarm(ix0, Math.min(nz1 - 32, nz0 + 110), S.fuel);
  } else { // army post (a proving ground: wider ranges, test stands)
    const end = motorAt(ix0, nz0, Math.min(150, cx - ix0 - 30));
    fuelFarm(ix0, end + 10, S.fuel);
    const ranges = S.ranges + (M.cls === 'proving' ? 1 : 0);
    for (let i = 0; i < ranges; i++) {
      const rz = nz0 + i * 44, rx0 = cx + 20, rx1 = ix1 - 6;
      if (rz + 30 > nz1) break;
      piece('range', rx0, rz, rx1, rz + 30, 0, '#a8946c');
      piece('berm', rx1 - 6, rz, rx1, rz + 30, 2.6, '#8a7656');
      for (let t = 0; t < 6; t++) piece('target', rx1 - 14, rz + 3 + t * 4.5, rx1 - 13.6, rz + 4.6 + t * 4.5, 1.8, '#c8bc9a');
      piece('firingline', rx0 + 6, rz + 1, rx0 + 9, rz + 29, 0.9, '#7a6a52');
    }
    if (M.cls === 'proving') piece('teststand', cx + 30, nz1 - 30, cx + 46, nz1 - 14, 9, '#8a8a7e');
    for (let i = 0; i < S.warehouses; i++) add('warehouse', cx - 60 + i * 40, end + 6, 30, 22, 'S', { name: 'SUPPLY' });
  }
  // ---- the approach: each gate's road out, its checkpoints; the gatehouses inside the wire ----
  for (const g of mb.gates) {
    const sgn = g.side === 'W' ? -1 : 1, gx = g.x;
    add('guardhouse', g.side === 'W' ? T.x0 + ring + 6 : T.x1 - ring - 12, cz - 15, 6, 6, 'S', { name: 'GATEHOUSE' });
    for (const [k, d] of A.checks.entries()) {
      const x = gx + sgn * d;
      // the chicane: a barrier on the north half, then 9 m on one on the south half (a car slaloms, nobody rushes it)
      mb.barriers.push({ x0: x - 2, z0: cz - 5, x1: x + 2, z1: cz - 0.6 }, { x0: x + sgn * 9 - 2, z0: cz + 0.6, x1: x + sgn * 9 + 2, z1: cz + 5 });
      piece('sandbags', x - 3, cz - 9, x + 3, cz - 7.6, 1.1, '#9a8a62');
      if (k === 0) piece('booth', x - 1.4, cz + 7, x + 1.4, cz + 9.8, 2.7, '#6e6a58');
      if (k === 1) mb.wrecks.push({ x: x + sgn * 16, z: cz + 7.5, rot: Math.PI / 2, type: rng.chance(0.5) ? 'apc' : 'patrol', state: 'burned', paint: 2 });
    }
    mb.posts.push({ role: 'gate', x: gx - sgn * 4, z: cz + 6.5, face: g.side === 'W' ? -Math.PI / 2 : Math.PI / 2 });
    mb.posts.push({ role: 'gate', x: gx + sgn * (A.checks[0] - 4), z: cz - 6.5, face: g.side === 'W' ? -Math.PI / 2 : Math.PI / 2 });
  }
  // ---- watchtowers: the corners and every towerEvery m along the outer run ----
  const tw2 = F.tower / 2;
  const towerAt = (x, z, face) => { mb.towers.push({ x, z, face }); };
  for (const [x, z] of [[T.x0, T.z0], [T.x1, T.z0], [T.x0, T.z1], [T.x1, T.z1]]) towerAt(x + (x === T.x0 ? tw2 + 0.6 : -tw2 - 0.6), z + (z === T.z0 ? tw2 + 0.6 : -tw2 - 0.6), Math.atan2(x - cx, z - cz));
  for (let x = T.x0 + F.towerEvery; x < T.x1 - F.towerEvery * 0.5; x += F.towerEvery) { towerAt(x, T.z0 + tw2 + 0.6, Math.PI); towerAt(x, T.z1 - tw2 - 0.6, 0); }
  for (let z = T.z0 + F.towerEvery; z < T.z1 - F.towerEvery * 0.5; z += F.towerEvery) if (Math.abs(z - cz) > F.gate) { towerAt(T.x0 + tw2 + 0.6, z, -Math.PI / 2); towerAt(T.x1 - tw2 - 0.6, z, Math.PI / 2); }
  for (const t of mb.towers) {
    const ox = Math.sign(cx - t.x) * (tw2 + 1.2), oz = Math.sign(cz - t.z) * (tw2 + 1.2);
    t.post = { role: 'tower', x: t.x + (Math.abs(t.x - T.x0) < 10 || Math.abs(t.x - T.x1) < 10 ? ox : 0), z: t.z + (Math.abs(t.z - T.z0) < 10 || Math.abs(t.z - T.z1) < 10 ? oz : 0), face: t.face };
  }
  // ---- the garrison's walks: the ring road loop; yard posts at the HQ and the armory doors ----
  const r = ring;
  mb.patrol = [[T.x0 + r, T.z0 + r], [cx, T.z0 + r], [T.x1 - r, T.z0 + r], [T.x1 - r, cz - 12], [T.x1 - r, T.z1 - r], [cx, T.z1 - r], [T.x0 + r, T.z1 - r], [T.x0 + r, cz + 12]].map(([x, z]) => ({ x, z }));
  mb.posts.push({ role: 'yard', x: (hq.x0 + hq.x1) / 2, z: hq.z0 - 3, face: Math.PI });
  mb.posts.push({ role: 'door', x: (arm.x0 + arm.x1) / 2 + 4, z: arm.z0 - 2.5, face: Math.PI });
  mb.posts.push({ role: 'qm', x: (mb.qm.x0 + mb.qm.x1) / 2, z: mb.qm.z0 - 2.4, face: Math.PI });
  mb.qmBoxes = [0, 1].map((i) => ({ id: `mb:${M.id}:qm${i}`, table: 'mb_qm', x: mb.qm.x0 + 4 + i * 6, z: mb.qm.z0 + 3, cap: 60, label: 'QUARTERMASTER · COUNTER' }));
  return T;
}

// ---- making it solid ---------------------------------------------------------------------------------------------------
// buildTown(T) builds the roads, the buildings and the dead cars; this lays the base's own pieces on its output (the same
// arrays: out.boxes go into citygen's collision grid, out.items into its one instanced mesh, out.wrecks to the wrecks
// batch, out.loot to the containers). Returns out, with out.mb: what the run needs (item and box indices).
const box = (minX, minZ, maxX, maxZ, tag, height, base = 0) => ({ minX, minZ, maxX, maxZ, tag, height, mark: 0, op: null, holes: null, holeX: false, sill: 0, base, owner: null });
export function buildMilbase(T) {
  const out = buildTown(T), mb = T.mb, F = MB_RULES.fence;
  const run = out.mb = { gateLeaves: [], blast: null, fenceBoxes: 0 };
  const vis = (cx, cy, cz, sx, sy, sz, col, o = null) => { out.items.push({ cx, cy, cz, sx, sy, sz, col, lv: 0, R: null, ...(o ?? {}) }); return out.items.length - 1; };
  const solid = (x0, z0, x1, z1, tag, h, col, base = 0) => { const b = box(x0, z0, x1, z1, tag, h + base, base); out.boxes.push(b); vis((x0 + x1) / 2, base + h / 2, (z0 + z1) / 2, x1 - x0, h, z1 - z0, col); return b; };
  const cover = (x, z, nx, nz, h, kind) => out.cover.push(x, z, 0, nx, nz, h, kind);
  // a see-through run of chain-link: a box whose whole length is a hole (engine/collision.js): it stops walkers and cars,
  // not sight or rounds; drawn as posts, a top rail and a thin mesh panel
  const wire = (horiz, fixed, a, b, h) => {
    if (b - a < 0.3) return;
    const t = 0.15, bx = horiz ? box(a, fixed - t, b, fixed + t, 'mb-fence', h) : box(fixed - t, a, fixed + t, b, 'mb-fence', h);
    bx.holes = [a - 0.01, b + 0.01]; bx.holeX = horiz; bx.sill = 0;
    out.boxes.push(bx); run.fenceBoxes++;
    if (horiz) vis((a + b) / 2, h / 2, fixed, b - a, h, 0.04, '#8a8c84'); else vis(fixed, h / 2, (a + b) / 2, 0.04, h, b - a, '#8a8c84');
    if (horiz) vis((a + b) / 2, h + 0.08, fixed, b - a, 0.16, 0.16, '#5e605a'); else vis(fixed, h + 0.08, (a + b) / 2, 0.16, 0.16, b - a, '#5e605a'); // the top rail and its wire coil
    for (let p = a; p <= b + 0.01; p += 3.2) { const x = horiz ? p : fixed, z = horiz ? fixed : p; vis(x, (h + 0.3) / 2, z, 0.12, h + 0.3, 0.12, '#4e504a'); }
  };
  for (const f of mb.fences) {
    for (const s of ['N', 'S', 'W', 'E']) {
      const horiz = s === 'N' || s === 'S', fixed = s === 'N' ? f.z0 : s === 'S' ? f.z1 : s === 'W' ? f.x0 : f.x1, a0 = horiz ? f.x0 : f.z0, a1 = horiz ? f.x1 : f.z1;
      const cuts = mb.gates.filter((g) => g.side === s).map((g) => [g.at - g.w / 2, g.at + g.w / 2]);
      if (mb.breach && mb.breach.side === s) cuts.push([mb.breach.at - mb.breach.w / 2, mb.breach.at + mb.breach.w / 2]);
      cuts.sort((p, q) => p[0] - q[0]);
      let cur = a0;
      for (const [a, b] of cuts) { wire(horiz, fixed, cur, a, F.h); cur = b; }
      wire(horiz, fixed, cur, a1, F.h);
    }
  }
  // the gate leaves (the outer fence's gap): a rolling chain-link leaf; open = rolled aside (passable, not drawn)
  for (const g of mb.gates) {
    const b = box(g.x - 0.15, g.at - g.w / 2, g.x + 0.15, g.at + g.w / 2, 'mb-fence', F.h);
    b.holes = [g.at - g.w / 2 - 0.01, g.at + g.w / 2 + 0.01]; b.holeX = false; b.base = g.open ? 99 : 0;
    out.boxes.push(b);
    const it = vis(g.x, F.h / 2, g.at, 0.1, F.h, g.w, '#9a9c92', { rollup: true, down: !g.open });
    run.gateLeaves.push({ side: g.side, box: b, panel: it, open: g.open, x: g.x, z: g.at, w: g.w });
  }
  // watchtowers: a steel frame, a deck, a roof
  for (const t of mb.towers) {
    const s = F.tower / 2;
    out.boxes.push(box(t.x - s * 0.6, t.z - s * 0.6, t.x + s * 0.6, t.z + s * 0.6, 'tower', F.towerH));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) vis(t.x + dx * s * 0.85, F.towerH / 2, t.z + dz * s * 0.85, 0.22, F.towerH, 0.22, '#4a4840');
    vis(t.x, F.towerH - 1.4, t.z, F.tower, 0.2, F.tower, '#5a5442');
    vis(t.x, F.towerH - 0.85, t.z, F.tower, 1.0, 0.12, '#5a5442'); vis(t.x, F.towerH + 0.4, t.z, F.tower + 0.4, 0.14, F.tower + 0.4, '#4a4a3e');
    cover(t.x + Math.sin(t.face) * (s + 0.6), t.z + Math.cos(t.face) * (s + 0.6), Math.sin(t.face), Math.cos(t.face), 1, 1);
  }
  // the checkpoints' jersey barriers: half cover (kneel behind them), concrete
  for (const q of mb.barriers) {
    solid(q.x0, q.z0, q.x1, q.z1, 'barrier', 0.95, '#a8a49a');
    cover((q.x0 + q.x1) / 2, q.z0 - 0.7, 0, -1, 0.5, 2); cover((q.x0 + q.x1) / 2, q.z1 + 0.7, 0, 1, 0.5, 2);
  }
  // the yard's own pieces
  for (const p of mb.pieces) {
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, w = p.x1 - p.x0, d = p.z1 - p.z0;
    if (p.kind === 'apron' || p.kind === 'square' || p.kind === 'range' || p.kind === 'mark' || p.kind === 'pier') { vis(cx, p.kind === 'mark' ? 0.105 : 0.048, cz, w, 0.02, d, p.col); continue; }
    if (p.kind === 'harbour') { vis(cx, 0.03, cz, w, 0.02, d, p.col); continue; }
    if (p.kind === 'drydock') { vis(cx, 0.05, cz, w, 0.02, d, p.col); continue; }
    if (p.kind === 'quay') {
      // the quay wall runs the harbour's edge, broken where each pier and the dry dock meet it; the piers carry rails
      const gaps = [...mb.piers.map((q) => [q.x0, q.x1]), mb.drydock ? [mb.drydock.x0, mb.drydock.x1] : null].filter(Boolean).sort((a, b) => a[0] - b[0]);
      let cur = p.x0;
      for (const [a, b] of gaps) { if (a > cur) solid(cur, p.z0, a, p.z1, 'barrier', p.h, p.col); cur = Math.max(cur, b); }
      if (p.x1 > cur) solid(cur, p.z0, p.x1, p.z1, 'barrier', p.h, p.col);
      for (const q of mb.piers) { solid(q.x0, q.z0, q.x0 + 0.4, q.z1, 'barrier', 0.9, '#7a7a70'); solid(q.x1 - 0.4, q.z0, q.x1, q.z1, 'barrier', 0.9, '#7a7a70'); solid(q.x0, q.z0, q.x1, q.z0 + 0.4, 'barrier', 0.9, '#7a7a70'); }
      if (mb.drydock) { const q = mb.drydock; solid(q.x0, q.z0, q.x0 + 1.2, q.z1, 'barrier', 1.1, '#7a7a70'); solid(q.x1 - 1.2, q.z0, q.x1, q.z1, 'barrier', 1.1, '#7a7a70'); solid(q.x0, q.z0, q.x1, q.z0 + 1.2, 'barrier', 1.1, '#7a7a70'); }
      continue;
    }
    if (p.kind === 'berm' && p.ring) { // a low earth ring round a tank, open to the south
      solid(p.x0, p.z0, p.x1, p.z0 + 1.4, 'barrier', p.h, p.col); solid(p.x0, p.z0, p.x0 + 1.4, p.z1, 'barrier', p.h, p.col); solid(p.x1 - 1.4, p.z0, p.x1, p.z1, 'barrier', p.h, p.col);
      solid(p.x0, p.z1 - 1.4, cx - 2.5, p.z1, 'barrier', p.h, p.col); solid(cx + 2.5, p.z1 - 1.4, p.x1, p.z1, 'barrier', p.h, p.col);
      continue;
    }
    if (p.kind === 'tank') { solid(p.x0, p.z0, p.x1, p.z1, 'tank', p.h, p.col); vis(cx, p.h + 0.4, cz, w - 2, 0.8, d - 2, '#b0b0a4'); vis(cx, p.h * 0.55, p.z1 + 0.02, w, 0.5, 0.04, '#8a3a2a'); continue; }
    if (p.kind === 'igloo') { // earth over a concrete arch: a stepped mound, its concrete headwall and steel door
      solid(p.x0, p.z0, p.x1, p.z1, 'barrier', p.h * 0.6, p.col);
      vis(cx, p.h * 0.6 + p.h * 0.2, cz - 1, w - 3, p.h * 0.4, d - 4, '#6e7048');
      vis(cx, p.h * 0.45, p.z1 + 0.3, w + 1, p.h * 0.9, 0.6, '#a8a49a'); vis(cx, 1.3, p.z1 + 0.62, 3.6, 2.6, 0.06, '#5e6052');
      out.boxes.push(box(p.x0 - 0.5, p.z1, p.x1 + 0.5, p.z1 + 0.6, 'barrier', p.h * 0.9));
      cover(cx - 4, p.z1 + 1.2, 0, 1, 1, 7); cover(cx + 4, p.z1 + 1.2, 0, 1, 1, 7);
      continue;
    }
    if (p.kind === 'portal') {
      // three poured walls and a roof slab; the blast door in the open side (a box that rolls aside when it opens)
      const t = 0.8, dr = p.door, dx0 = dr.at - dr.w / 2, dx1 = dr.at + dr.w / 2;
      solid(p.x0, p.z1 - t, p.x1, p.z1, 'barrier', p.h, p.col); solid(p.x0, p.z0, p.x0 + t, p.z1, 'barrier', p.h, p.col); solid(p.x1 - t, p.z0, p.x1, p.z1, 'barrier', p.h, p.col);
      solid(p.x0, p.z0, dx0, p.z0 + t, 'barrier', p.h, p.col); solid(dx1, p.z0, p.x1, p.z0 + t, 'barrier', p.h, p.col);
      vis(cx, p.h + 0.2, cz, w, 0.4, d, '#6e6c64'); // the roof slab (drawn; the cutaway is the citygen roof's job only for KINDS)
      const b = box(dx0, p.z0, dx1, p.z0 + t, 'mb-blast', p.h - 0.6);
      b.base = mb.blast.open ? 99 : 0;
      out.boxes.push(b);
      const it = vis(dr.at, (p.h - 0.6) / 2, p.z0 + t / 2, dr.w, p.h - 0.6, t * 0.9, '#5a5e58', { rollup: true, down: !mb.blast.open });
      vis(dx1 + 0.7, 1.3, p.z0 - 0.05, 0.5, 0.6, 0.1, '#3a3a36'); // the keypad
      run.blast = { box: b, panel: it, x: dr.at, z: p.z0, w: dr.w, open: mb.blast.open };
      cover(dx0 - 1.2, p.z0 - 0.7, 0, -1, 1, 7); cover(dx1 + 1.2, p.z0 - 0.7, 0, -1, 1, 7);
      continue;
    }
    if (p.kind === 'hull') { solid(p.x0, p.z0, p.x1, p.z1, 'barrier', p.h, p.col); vis(cx, p.h + 1.6, cz + d * 0.1, w * 0.18, 3.2, d * 0.4, '#5e605a'); continue; } // a dead hull on the blocks, its superstructure
    if (p.kind === 'target') { solid(p.x0, p.z0, p.x1, p.z1, 'post', p.h, p.col); continue; }
    if (p.kind === 'sandbags') { solid(p.x0, p.z0, p.x1, p.z1, 'sandbags', p.h, p.col); cover(cx, p.z1 + 0.7, 0, 1, 0.5, 2); continue; }
    // the rest: a solid block (berm, firing line, booth, pump house, generator, test stand)
    const tag = p.kind === 'generator' ? 'generator' : p.kind === 'booth' || p.kind === 'pumphouse' ? 'shed' : p.kind === 'teststand' ? 'tower' : 'barrier';
    solid(p.x0, p.z0, p.x1, p.z1, tag, p.h, p.col);
  }
  // the motor pool's dead vehicles: our bodies (systems/wrecks.js), each in its own collider at its real size
  for (const w of mb.wrecks) {
    const [len, wid, tall] = MB_MOTOR.sizes[w.type] ?? MB_MOTOR.sizes.patrol, V = { len, wid, tall }, along = Math.abs(Math.sin(w.rot)) > 0.5 ? 'x' : 'z';
    const lx = along === 'x' ? V.len / 2 : V.wid / 2, lz = along === 'x' ? V.wid / 2 : V.len / 2;
    out.boxes.push(box(w.x - lx, w.z - lz, w.x + lx, w.z + lz, 'wreck', Math.min(2.4, V.tall)));
    out.wrecks.push({ x: w.x, z: w.z, rot: w.rot, type: w.type, state: w.state, paint: w.paint, mil: true });
    cover(w.x + (along === 'x' ? 0 : lx + 0.8), w.z + (along === 'x' ? lz + 0.8 : 0), along === 'x' ? 0 : 1, along === 'x' ? 1 : 0, 0.5, 8);
  }
  // the base's own containers (the armory's, the hospital's, the command post's are their buildings' floors: re-tabled here)
  for (const q of out.loot) {
    const B = T.buildings.find((b) => b.id === q.b);
    if (B?.loot && B.loot.startsWith('mb_')) { q.table = B.loot; q.label = `${B.name.toUpperCase()}${q.k ? ` · FLOOR ${q.k + 1}` : ''}`; }
  }
  for (const q of mb.loot) out.loot.push({ ...q, y: 0, b: null, k: 0 });
  return out;
}

// The generic reservation (citygen's MILITARY row) stays citygen's: layoutBase. Re-exported so one module answers "a base".
export { layoutBase };
