// THE TOWN PLAN (docs/design/WEB_CITYGEN.md §3.2): a pure function of an archetype row (data/citygen.js), a biome, a seed
// and where the town stands. No three.js, no game: node runs it too (the selftest's 20-stamp audit and tools).
//   streets  axis-aligned lines by the archetype's block plan (grid, organic, square, radial, linear, canyon), each a ROADS
//            row (main street, side streets, tracks) - so a car's grip changes with the surface it is on
//   blocks   the land between the streets, zoned by the archetype's mix: the core in the middle, commercial on the main
//            street, civic near the core, industrial and rail on one flank, farm at the edge, homes in between
//   lots     each block's frontage cut into lots; a lot gets a KINDS building that fits it (or stays empty: density falls
//            off from core to edge), turned to face its street, with its storeys (zone x kind, taller toward the core),
//            damage (a ruined building is cut off at a lower floor and left open to the sky), doors (a front door; roll-up
//            bays you drive into; a second set on the back wall for a drive-through), a fire escape, roof access
//   bridges  planks between adjacent roofs a few metres apart (and a few metres of height), so a fight crosses the block
//   wall     only when the archetype (or the stamp) says so: a perimeter of its WALLS row with gates where streets leave
//   wrecks   dead cars in the streets (cover, and loot for later)
import { ARCHETYPES, KINDS, ROADS, BIOMES, WALLS, VERT, RURAL, MILITARY } from '../../data/citygen.js';
import { makeRng } from '../../engine/rng.js';

const SIDES = ['N', 'E', 'S', 'W'];
const pickW = (rng, obj) => { let t = 0; for (const k in obj) t += obj[k]; let p = rng() * t; for (const k in obj) if ((p -= obj[k]) < 0) return k; return Object.keys(obj)[0]; };
const r1 = (v) => Math.round(v * 10) / 10;

// A building record from a kind, a footprint and the rolls. Pure data: world/citygen/build.js makes it solid.
export function makeBuilding(rng, kindId, x0, z0, x1, z1, front, o = {}) {
  const K = KINDS[kindId];
  let n = o.storeys ?? rng.int(K.storeys[0], K.storeys[1]);
  n = Math.max(1, Math.min(VERT.maxStoreys, n));
  const ruined = !!o.ruined;
  const h0 = K.h0;
  const Y = [0];
  for (let k = 1; k <= n; k++) Y.push(k === 1 ? h0 : h0 + (k - 1) * VERT.up);
  // roof access: a stair or ladder on up to the roof deck (Y[n]); a ruin's top floor is open to the sky and reached anyway
  const roofAccess = ruined ? n >= 2 || K.roof !== 'none' : K.roof !== 'none';
  const along = front === 'N' || front === 'S' ? 'x' : 'z';
  const len = along === 'x' ? x1 - x0 : z1 - z0;
  const doors = [];
  const bays = K.bays ? K.bays : null;
  if (bays) {
    let [cnt, bw, bh] = bays, gap = (len - cnt * bw) / (cnt + 1);
    while (cnt > 1 && gap < 1.2) { cnt--; gap = (len - cnt * bw) / (cnt + 1); } // a narrow lot: fewer bays
    if (gap >= 1.2) {
      for (let i = 0; i < cnt; i++) {
        const c = (along === 'x' ? x0 : z0) + gap * (i + 1) + bw * (i + 0.5);
        doors.push({ side: front, at: r1(c), w: bw, h: bh, kind: 'bay' });
        if (K.through) doors.push({ side: SIDES[(SIDES.indexOf(front) + 2) % 4], at: r1(c), w: bw, h: bh, kind: 'bay' });
      }
    }
  }
  const mid = (along === 'x' ? x0 + x1 : z0 + z1) / 2;
  if (!doors.some((d) => d.side === front)) doors.push({ side: front, at: r1(mid + rng.range(-0.25, 0.25) * len * 0.5), w: 1.6, h: 2.6, kind: 'door' });
  else if (len > 14) doors.push({ side: front, at: r1((along === 'x' ? x0 : z0) + 1.6), w: 1.4, h: 2.6, kind: 'door' }); // a man door beside the bays
  if (kindId === 'motel') for (let a = (along === 'x' ? x0 : z0) + 3.5; a < (along === 'x' ? x1 : z1) - 3; a += 4.2) if (!doors.some((d) => d.side === front && Math.abs(d.at - a) < 2)) doors.push({ side: front, at: r1(a), w: 1.2, h: 2.6, kind: 'door' });
  if (rng.chance(0.45) && !K.through) doors.push({ side: SIDES[(SIDES.indexOf(front) + 2) % 4], at: r1(mid + rng.range(-0.3, 0.3) * len * 0.5), w: 1.4, h: 2.6, kind: 'door' });
  // the fire escape: outside stairs on a side wall (never the front), for three floors and up
  const escape = n >= 3 && rng.chance(K.escape) ? { side: rng.chance(0.5) ? SIDES[(SIDES.indexOf(front) + 1) % 4] : SIDES[(SIDES.indexOf(front) + 3) % 4] } : null;
  return {
    id: o.id ?? null, kind: kindId, name: K.name, zone: o.zone ?? K.zone[0], x0: r1(x0), z0: r1(z0), x1: r1(x1), z1: r1(z1), front, n, h0, Y,
    top: Y[n], roof: K.roof, roofAccess, parapet: ruined ? 0.7 : (roofAccess ? Math.max(0.6, K.parapet || 0.9) : 0), ruined, doors, escape,
    color: o.color ?? '#a89a82', roofColor: o.roofColor ?? '#6a5a4a', claimable: !!K.claimable, loot: K.loot, cover: K.cover,
    drive: !!bays, open: !!K.open, fortified: !!K.fortified, steeple: !!K.steeple, canopy: !!K.canopy, stilts: K.stilts ?? 0, wealth: o.wealth ?? 0.4,
  };
}

// ---- the town -------------------------------------------------------------------------------------------------------
// opts: { arch, biome?, seed, x, z, size?, density? (scale), damage?, wealth?, walls? (a WALLS id to force), id?, name? }
export function layoutTown(opts) {
  const A = ARCHETYPES[opts.arch];
  if (!A) throw new Error(`no archetype "${opts.arch}"`);
  const rng = makeRng((opts.seed >>> 0) || 1);
  const biome = opts.biome && BIOMES[opts.biome] ? opts.biome : A.biome[0];
  const BI = BIOMES[biome];
  const S = Math.round(opts.size ?? rng.int(A.sizeM[0], A.sizeM[1])), half = S / 2;
  const cx = Math.round(opts.x ?? 0), cz = Math.round(opts.z ?? 0);
  const damage = opts.damage ?? A.damage, wealth = opts.wealth ?? A.wealth, dens = opts.density ?? 1;
  const rowMain = A.roads[0], rowSide = A.roads[1], rowTrack = A.roads[2];
  const sw = (id) => ROADS[id].w + 2 * ROADS[id].walk;
  const T = { id: opts.id ?? `town-${opts.seed}`, name: opts.name ?? A.name.toUpperCase(), arch: opts.arch, biome, seed: opts.seed, cx, cz, size: S,
    x0: cx - half, z0: cz - half, x1: cx + half, z1: cz + half, damage, wealth, roads: [], blocks: [], buildings: [], bridges: [], wall: null, gates: [], wrecks: [], lamps: [] };

  // ---- streets ----
  const jit = A.blocks === 'organic' ? 0.25 : A.blocks === 'canyon' ? 0.15 : 0.08;
  const lines = (lo, hi, step) => { const out = []; for (let v = lo; v <= hi + 0.1; v += step * (1 + rng.range(-jit, jit))) out.push(Math.round(v)); if (out[out.length - 1] < hi - step * 0.4) out.push(Math.round(hi)); else out[out.length - 1] = Math.round(hi); return out; };
  const bm = () => rng.int(A.blockM[0], A.blockM[1]);
  let xs, zs, linear = A.blocks === 'linear' || A.blocks === 'canyon' || A.blocks === 'island';
  if (linear) {
    const depth = A.blocks === 'canyon' ? Math.round(A.blockM[1] * 0.8) : bm();
    xs = lines(-half, half, Math.round(bm() * 1.6)).map((v) => v + cx);
    const mw = sw(rowMain) / 2;
    zs = [cz - mw - depth * 2 - sw(rowSide), cz - mw - depth, cz, cz + mw + depth, cz + mw + depth * 2 + sw(rowSide)].map(Math.round);
    T.z0 = zs[0]; T.z1 = zs[4];
  } else {
    const b = bm();
    xs = lines(-half, half, b).map((v) => v + cx);
    zs = lines(-half, half, b).map((v) => v + cz);
  }
  const nearest = (arr, v) => arr.reduce((a, q) => (Math.abs(q - v) < Math.abs(a - v) ? q : a), arr[0]);
  const mainZ = linear ? cz : nearest(zs.slice(1, -1).length ? zs.slice(1, -1) : zs, cz);
  const mainX = A.blocks === 'square' || A.blocks === 'radial' ? nearest(xs.slice(1, -1).length ? xs.slice(1, -1) : xs, cx) : null;
  const roadOf = (axis, v, edge) => (axis === 'z' && v === mainZ) || (axis === 'x' && v === mainX) ? rowMain : edge ? rowTrack : rowSide;
  for (const z of zs) {
    const row = roadOf('z', z, z === zs[0] || z === zs[zs.length - 1]), w = sw(row);
    T.roads.push({ axis: 'x', x0: T.x0 - (z === mainZ ? 60 : 0), x1: T.x1 + (z === mainZ ? 60 : 0), z0: z - w / 2, z1: z + w / 2, row, main: z === mainZ, at: z });
  }
  for (const x of xs) {
    const row = roadOf('x', x, x === xs[0] || x === xs[xs.length - 1]), w = sw(row);
    // organic: some cross streets stop short (cul-de-sacs); linear: cross streets only span the town's depth
    let z0 = T.z0, z1 = T.z1;
    if (A.blocks === 'organic' && x !== xs[0] && x !== xs[xs.length - 1] && rng.chance(0.35)) { if (rng.chance(0.5)) z0 = mainZ; else z1 = mainZ; }
    T.roads.push({ axis: 'z', x0: x - w / 2, x1: x + w / 2, z0, z1, row, main: x === mainX, at: x });
  }

  // ---- blocks ----
  const halfW = (axis, v) => { const r = T.roads.find((q) => q.axis === axis && q.at === v); return r ? (ROADS[r.row].w + 2 * ROADS[r.row].walk) / 2 : 3; };
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
    const b = { x0: xs[i] + halfW('z', xs[i]), x1: xs[i + 1] - halfW('z', xs[i + 1]), z0: zs[j] + halfW('x', zs[j]), z1: zs[j + 1] - halfW('x', zs[j + 1]) };
    if (b.x1 - b.x0 < 14 || b.z1 - b.z0 < 14) continue;
    b.cx = (b.x0 + b.x1) / 2; b.cz = (b.z0 + b.z1) / 2;
    b.d = Math.max(Math.abs(b.cx - cx), Math.abs(b.cz - cz)) / half;
    b.onMain = Math.abs(b.z0 - halfW('x', mainZ) - mainZ) < 1 || Math.abs(b.z1 + halfW('x', mainZ) - mainZ) < 1 || (mainX !== null && (Math.abs(b.x0 - halfW('z', mainX) - mainX) < 1 || Math.abs(b.x1 + halfW('z', mainX) - mainX) < 1));
    T.blocks.push(b);
  }
  // zoning: the core in the middle, commercial on the main street, civic by the core, industry/rail on the +x flank, farm
  // at the edge, homes in the rest. A courthouse square keeps its middle block as the green (a courthouse and a lawn).
  const left = [...T.blocks].sort((a, b) => a.d - b.d);
  const want = (z) => Math.round((A.zoning[z] ?? 0) * T.blocks.length);
  const take = (z, n, order) => { for (let i = 0; i < n && order.length; i++) { const b = order.shift(); b.zone = z; left.splice(left.indexOf(b), 1); } };
  if (A.blocks === 'square' && left.length) { const g = left[0]; g.zone = 'core'; g.green = true; left.shift(); }
  take('core', Math.max(A.zoning.core ? 1 : 0, want('core') - (A.blocks === 'square' ? 1 : 0)), [...left]);
  take('commercial', want('commercial'), [...left.filter((b) => b.onMain), ...left.filter((b) => !b.onMain)]);
  take('civic', want('civic'), [...left]);
  const flank = [...left].sort((a, b) => b.cx - a.cx);
  take('industrial', want('industrial'), flank);
  take('rail', want('rail'), [...left].sort((a, b) => b.cx - a.cx));
  take('farm', want('farm'), [...left].sort((a, b) => b.d - a.d));
  take('military', want('military'), [...left]);
  for (const b of left) b.zone = A.zoning.res ? 'res' : Object.keys(A.zoning)[0];
  for (const b of T.blocks) if (!A.kinds[b.zone]) b.zone = Object.keys(A.kinds)[0];

  // ---- lots and buildings ----
  let nid = 0;
  const color = () => rng.pick(BI.walls), roofC = () => rng.pick(BI.roof);
  for (const b of T.blocks) {
    if (b.green) { // the square: one civic building in its middle, lawn round it
      const k = A.kinds.core.courthouse ? 'courthouse' : A.kinds.civic?.church ? 'church' : pickW(rng, A.kinds.core);
      const K = KINDS[k], w = Math.min(rng.int(K.w[0], K.w[1]), b.x1 - b.x0 - 16), d = Math.min(rng.int(K.d[0], K.d[1]), b.z1 - b.z0 - 16);
      if (w >= 8 && d >= 8) { const B = makeBuilding(rng, k, Math.round(b.cx - w / 2), Math.round(b.cz - d / 2), Math.round(b.cx + w / 2), Math.round(b.cz + d / 2), 'S', { zone: 'civic', color: color(), roofColor: roofC(), wealth, storeys: clampSt(rng, k, A.storeys.civic ?? A.storeys.core, 0), id: `${T.id}.b${nid++}` }); T.buildings.push(B); }
      continue;
    }
    const W = b.x1 - b.x0, D = b.z1 - b.z0, alongX = W >= D;
    const deep = alongX ? D : W, fronts = deep >= 30 ? (alongX ? ['N', 'S'] : ['W', 'E']) : [alongX ? (Math.abs(b.z0 - mainZ) < Math.abs(b.z1 - mainZ) ? 'N' : 'S') : 'W'];
    const lotDepth = fronts.length === 2 ? deep / 2 - 1 : deep - 2;
    const dz = (b.zone === 'core' || b.zone === 'commercial') ? A.density.core : A.density.edge;
    const fill = Math.min(0.98, (A.density.core + (A.density.edge - A.density.core) * b.d) * dens);
    for (const front of fronts) {
      const a0 = alongX ? b.x0 : b.z0, a1 = alongX ? b.x1 : b.z1;
      let cur = a0 + (b.zone === 'res' ? rng.range(1, 3) : 0.6);
      let guard = 0;
      while (cur < a1 - 5 && guard++ < 60) {
        if (!rng.chance(fill)) { cur += rng.int(8, 14); continue; } // an empty lot: a yard, a vacant pad, a wreck
        let k = null, w = 0, d = 0;
        for (let t = 0; t < 6 && !k; t++) {
          const c = pickW(rng, A.kinds[b.zone]), K = KINDS[c];
          const ww = rng.int(Math.ceil(K.w[0]), Math.floor(K.w[1])), dd = rng.int(Math.ceil(K.d[0]), Math.floor(K.d[1]));
          if (dd <= lotDepth - (b.zone === 'res' ? 3 : 0.5) && cur + ww <= a1 - 0.5) { k = c; w = ww; d = dd; }
        }
        if (!k) break;
        const setback = b.zone === 'res' || b.zone === 'farm' ? rng.range(2.5, 5) : rng.range(0.4, 1.2);
        let x0, z0, x1, z1;
        if (alongX) { x0 = cur; x1 = cur + w; if (front === 'N') { z0 = b.z0 + setback; z1 = z0 + d; } else { z1 = b.z1 - setback; z0 = z1 - d; } }
        else { z0 = cur; z1 = cur + w; if (front === 'W') { x0 = b.x0 + setback; x1 = x0 + d; } else { x1 = b.x1 - setback; x0 = x1 - d; } }
        x0 = Math.round(x0); z0 = Math.round(z0); x1 = Math.round(x1); z1 = Math.round(z1);
        const ruined = rng.chance(damage * 0.45);
        let st = clampSt(rng, k, A.storeys[b.zone], b.d);
        if (ruined && st > 1) st = Math.max(1, st - rng.int(1, st - 1)); // cut off the top: the floor below is open to the sky
        T.buildings.push(makeBuilding(rng, k, x0, z0, x1, z1, front, { zone: b.zone, ruined, storeys: st, color: color(), roofColor: roofC(), wealth, id: `${T.id}.b${nid++}` }));
        cur += w + (b.zone === 'res' || b.zone === 'farm' ? rng.range(3, 7) : b.zone === 'core' ? rng.range(0.6, 1.4) : rng.range(1.5, 4));
        void dz;
      }
    }
  }
  // one landmark-tall building in a core: the archetype's top storey on its biggest core building (the skyline)
  const core = T.buildings.filter((B) => B.zone === 'core' && !B.ruined && KINDS[B.kind].storeys[1] >= (A.storeys.core?.[1] ?? 0));
  if (core.length && A.storeys.core) {
    const B = core.sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))[0];
    const n = Math.min(KINDS[B.kind].storeys[1], A.storeys.core[1]);
    if (n > B.n) Object.assign(B, makeBuilding(makeRng(opts.seed ^ 0x7a11), B.kind, B.x0, B.z0, B.x1, B.z1, B.front, { ...B, storeys: n, ruined: false }));
  }

  // the law (a police station with patrol bays) in every town of size, and the cloning center in a major city: each
  // takes the lot of the building nearest the middle that can hold it (a civic/commercial one for the law, a core one
  // for the tower), exactly once
  const swap = (kind, zones, o = {}) => {
    const K = KINDS[kind];
    const fits = (B, m) => !B.hero && Math.min(B.x1 - B.x0, B.z1 - B.z0) >= m && Math.max(B.x1 - B.x0, B.z1 - B.z0) >= K.w[0] - 2;
    const byD = (a, b) => Math.hypot((a.x0 + a.x1) / 2 - cx, (a.z0 + a.z1) / 2 - cz) - Math.hypot((b.x0 + b.x1) / 2 - cx, (b.z0 + b.z1) / 2 - cz);
    // the right zone at its size first; then any zone; then any lot big enough to stand it smaller (the law has to be somewhere)
    const lot = T.buildings.filter((B) => zones.includes(B.zone) && fits(B, K.d[0] - 2)).sort(byD)[0]
      ?? T.buildings.filter((B) => fits(B, K.d[0] - 2)).sort(byD)[0] ?? T.buildings.filter((B) => !B.hero && Math.min(B.x1 - B.x0, B.z1 - B.z0) >= 10).sort(byD)[0];
    if (!lot) return null;
    Object.assign(lot, makeBuilding(rng, kind, lot.x0, lot.z0, lot.x1, lot.z1, lot.front, { ...lot, ruined: false, storeys: o.storeys, id: lot.id }));
    lot.hero = kind;
    return lot;
  };
  if (A.major) T.cloneCenter = swap('cloning_center', ['core', 'commercial', 'civic'], { storeys: Math.min(6, Math.max(4, A.storeys.core?.[1] ?? 5)) });
  if (T.buildings.length >= 30) T.police = swap('police_station', ['civic', 'commercial', 'core']);
  clearBays(T.buildings, T.wall ? { x0: T.wall.x0 + T.wall.t, z0: T.wall.z0 + T.wall.t, x1: T.wall.x1 - T.wall.t, z1: T.wall.z1 - T.wall.t } : null);

  // ---- bridges between roofs ----
  T.bridges = roofBridges(rng, T.buildings, T.id);

  // ---- the wall (most towns: none) ----
  const wallId = opts.walls ?? A.walls;
  if (wallId && wallId !== 'none' && WALLS[wallId]) {
    const Wr = WALLS[wallId], m = 10;
    T.wall = { type: wallId, h: Wr.h, t: Wr.t, x0: T.x0 - m, z0: T.z0 - m, x1: T.x1 + m, z1: T.z1 + m, gates: [], towers: !!Wr.towers, look: Wr.look, gateW: Wr.gateW };
    for (const r of T.roads) {
      if (r.axis === 'x' && (r.main || rng.chance(0.25))) T.wall.gates.push({ side: 'W', at: r.at, w: Math.max(Wr.gateW, r.z1 - r.z0) }, { side: 'E', at: r.at, w: Math.max(Wr.gateW, r.z1 - r.z0) });
      if (r.axis === 'z' && r.main) T.wall.gates.push({ side: 'N', at: r.at, w: Math.max(Wr.gateW, r.x1 - r.x0) }, { side: 'S', at: r.at, w: Math.max(Wr.gateW, r.x1 - r.x0) });
    }
    T.gates = T.wall.gates.map((g) => ({ ...g, x: g.side === 'W' ? T.wall.x0 : g.side === 'E' ? T.wall.x1 : g.at, z: g.side === 'N' ? T.wall.z0 : g.side === 'S' ? T.wall.z1 : g.at, open: true }));
  }

  // ---- wrecks in the streets (cover) ----
  for (const r of T.roads) {
    const L = r.axis === 'x' ? r.x1 - r.x0 : r.z1 - r.z0, n = Math.floor((L / 45) * (0.3 + damage));
    for (let i = 0; i < n; i++) {
      const a = (r.axis === 'x' ? r.x0 : r.z0) + rng.range(0.1, 0.9) * L, off = rng.range(-0.3, 0.3) * (r.axis === 'x' ? r.z1 - r.z0 : r.x1 - r.x0);
      const x = r.axis === 'x' ? a : (r.x0 + r.x1) / 2 + off, z = r.axis === 'x' ? (r.z0 + r.z1) / 2 + off : a;
      if (T.buildings.some((B) => x > B.x0 - 3 && x < B.x1 + 3 && z > B.z0 - 3 && z < B.z1 + 3)) continue;
      T.wrecks.push({ x: r1(x), z: r1(z), along: rng.chance(0.75) ? r.axis : (r.axis === 'x' ? 'z' : 'x'), c: rng.pick(['#5a4a3a', '#6a3a2a', '#4a4a44', '#7a6a4a']) });
    }
  }
  return T;
}

// A roll-up bay needs room to drive up to it: 6 m clear outside it (no other building, no fence). A blocked back bay is
// walled up; a blocked front bay too (its building keeps a man door).
export function clearBays(list, bounds = null) {
  for (const B of list) {
    if (!B.doors.some((d) => d.kind === 'bay')) continue;
    const keep = [];
    for (const d of B.doors) {
      if (d.kind !== 'bay') { keep.push(d); continue; }
      const hw = d.w / 2 + 1.3, D = 6.5;
      const r = d.side === 'N' ? [d.at - hw, B.z0 - D, d.at + hw, B.z0] : d.side === 'S' ? [d.at - hw, B.z1, d.at + hw, B.z1 + D] : d.side === 'W' ? [B.x0 - D, d.at - hw, B.x0, d.at + hw] : [B.x1, d.at - hw, B.x1 + D, d.at + hw];
      if (list.some((o) => o !== B && r[2] > o.x0 - 0.3 && r[0] < o.x1 + 0.3 && r[3] > o.z0 - 0.3 && r[1] < o.z1 + 0.3)) continue;
      if (bounds && (r[0] < bounds.x0 + 1 || r[2] > bounds.x1 - 1 || r[1] < bounds.z0 + 1 || r[3] > bounds.z1 - 1)) continue; // the fence or the town wall
      keep.push(d);
    }
    // a through-bay whose partner went is still a bay (drive in, back out); a building that lost every bay keeps a door
    if (!keep.some((d) => d.side === B.front)) keep.push({ side: B.front, at: B.front === 'N' || B.front === 'S' ? (B.x0 + B.x1) / 2 : (B.z0 + B.z1) / 2, w: 1.6, h: 2.6, kind: 'door' });
    B.doors = keep;
    B.drive = keep.some((d) => d.kind === 'bay');
  }
}

function clampSt(rng, k, zr, d) {
  const K = KINDS[k];
  const lo = Math.max(K.storeys[0], zr?.[0] ?? 1), hi = Math.min(K.storeys[1], zr?.[1] ?? K.storeys[1]);
  if (lo > hi) return Math.min(K.storeys[1], Math.max(K.storeys[0], zr?.[1] ?? 1));
  // taller toward the core: the roll leans high by (1 - d)
  const t = Math.min(1, rng() * 0.7 + (1 - Math.min(1, d)) * 0.5);
  return Math.max(lo, Math.min(hi, lo + Math.floor(t * (hi - lo + 1))));
}

// Planks between two roofs you can reach, facing across a gap of at most VERT.bridge.maxGap with at least 3 m of shared
// edge and roofs within 3.2 m of each other: a bridge is a narrow flight from one roof to the other (level or sloped).
export function roofBridges(rng, buildings, tid = 't') {
  const out = [], V = VERT.bridge, up = buildings.filter((B) => B.roofAccess && !B.open);
  for (let i = 0; i < up.length; i++) for (let j = i + 1; j < up.length; j++) {
    const a = up[i], b = up[j];
    if (Math.abs(a.top - b.top) > 3.2) continue;
    let br = null;
    // x gap (a west of b or b west of a), overlapping in z
    const oz0 = Math.max(a.z0, b.z0), oz1 = Math.min(a.z1, b.z1), ox0 = Math.max(a.x0, b.x0), ox1 = Math.min(a.x1, b.x1);
    if (oz1 - oz0 >= 3) {
      const [w, e] = a.x1 <= b.x0 ? [a, b] : b.x1 <= a.x0 ? [b, a] : [null, null];
      if (w && e.x0 - w.x1 >= 1.5 && e.x0 - w.x1 <= V.maxGap) { const zc = Math.round((oz0 + oz1) / 2); br = { axis: 'x', x0: w.x1 + VERT.wall / 2, x1: e.x0 - VERT.wall / 2, z0: zc - V.w / 2, z1: zc + V.w / 2, from: w, to: e }; }
    }
    if (!br && ox1 - ox0 >= 3) {
      const [n, s] = a.z1 <= b.z0 ? [a, b] : b.z1 <= a.z0 ? [b, a] : [null, null];
      if (n && s.z0 - n.z1 >= 1.5 && s.z0 - n.z1 <= V.maxGap) { const xc = Math.round((ox0 + ox1) / 2); br = { axis: 'z', z0: n.z1 + VERT.wall / 2, z1: s.z0 - VERT.wall / 2, x0: xc - V.w / 2, x1: xc + V.w / 2, from: n, to: s }; }
    }
    if (!br || !rng.chance(V.share)) continue;
    // nothing else may stand in the gap under the planks (another building between the two)
    if (buildings.some((B) => B !== br.from && B !== br.to && br.x1 > B.x0 && br.x0 < B.x1 && br.z1 > B.z0 && br.z0 < B.z1)) continue;
    if (out.some((q) => q.from === br.from || q.to === br.to || q.from === br.to || q.to === br.from)) continue; // one bridge a roof keeps the parapet whole
    br.id = `${tid}.br${out.length}`;
    br.yFrom = br.from.top; br.yTo = br.to.top;
    out.push(br);
  }
  return out;
}

// ---- a homestead (RURAL row): a parcel off the road with its buildings, every main one claimable ----------------------
export function layoutRural(opts) {
  const R = RURAL[opts.kind];
  if (!R) throw new Error(`no rural kind "${opts.kind}"`);
  const rng = makeRng((opts.seed >>> 0) || 1), BI = BIOMES[opts.biome] ?? BIOMES.great_plains;
  const [pw, pd] = R.parcel, cx = Math.round(opts.x), cz = Math.round(opts.z);
  const T = { id: opts.id ?? `rural-${opts.seed}`, name: (opts.name ?? R.name).toUpperCase(), arch: opts.kind, rural: true, biome: opts.biome, seed: opts.seed, cx, cz, size: Math.max(pw, pd),
    x0: cx - pw / 2, z0: cz - pd / 2, x1: cx + pw / 2, z1: cz + pd / 2, damage: 0.35, wealth: 0.35, roads: [], blocks: [], buildings: [], bridges: [], wall: null, gates: [], wrecks: [], lamps: [] };
  // a drive from the parcel's road side (front = toward the road: opts.front, default N)
  const front = opts.front ?? 'N';
  const dw = ROADS.gravel.w;
  T.roads.push(front === 'N' || front === 'S' ? { axis: 'z', x0: cx - dw / 2, x1: cx + dw / 2, z0: front === 'N' ? T.z0 - 40 : cz, z1: front === 'N' ? cz : T.z1 + 40, row: 'gravel', at: cx } : { axis: 'x', z0: cz - dw / 2, z1: cz + dw / 2, x0: front === 'W' ? T.x0 - 40 : cx, x1: front === 'W' ? cx : T.x1 + 40, row: 'gravel', at: cz });
  // the yard: buildings in slots round the drive's end
  const slots = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [-1, 0], [1, 0]];
  let si = 0, nid = 0;
  for (const [k, c] of R.buildings) {
    const n = Array.isArray(c) ? rng.int(c[0], c[1]) : c;
    for (let i = 0; i < n && si < slots.length; i++) {
      const K = KINDS[k], [sx, sz] = slots[si++];
      const w = rng.int(Math.ceil(K.w[0]), Math.floor(K.w[1])), d = rng.int(Math.ceil(K.d[0]), Math.floor(K.d[1]));
      const qx = cx + sx * (pw / 4 + 2), qz = cz + sz * (pd / 4 + 2);
      const x0 = Math.round(Math.max(T.x0 + 2, Math.min(T.x1 - 2 - w, qx - w / 2))), z0 = Math.round(Math.max(T.z0 + 2, Math.min(T.z1 - 2 - d, qz - d / 2)));
      const B = makeBuilding(rng, k, x0, z0, x0 + w, z0 + d, sx === 0 ? (sz > 0 ? 'N' : 'S') : sx > 0 ? 'W' : 'E', { zone: 'farm', color: rng.pick(BI.walls), roofColor: rng.pick(BI.roof), ruined: rng.chance(0.15), id: `${T.id}.b${nid++}` });
      if (T.buildings.some((o) => B.x1 + 3 > o.x0 && B.x0 - 3 < o.x1 && B.z1 + 3 > o.z0 && B.z0 - 3 < o.z1) || overDrive(B, T.roads[0])) { si++; i--; if (si >= slots.length) break; continue; }
      T.buildings.push(B);
    }
  }
  if (R.fence !== 'none') {
    clearBays(T.buildings, T);
    const Wr = WALLS[R.fence];
    T.wall = { type: R.fence, h: Wr.h * 0.5, t: Wr.t, x0: T.x0, z0: T.z0, x1: T.x1, z1: T.z1, gates: [{ side: front, at: front === 'N' || front === 'S' ? cx : cz, w: 8 }], towers: false, look: Wr.look, gateW: 8, fence: true };
    T.gates = T.wall.gates.map((g) => ({ ...g, x: g.side === 'W' ? T.x0 : g.side === 'E' ? T.x1 : g.at, z: g.side === 'N' ? T.z0 : g.side === 'S' ? T.z1 : g.at, open: true }));
  }
  return T;
}
const overDrive = (B, r) => r && B.x1 + 1 > r.x0 && B.x0 - 1 < r.x1 && B.z1 + 1 > r.z0 && B.z0 - 1 < r.z1;

// ---- a military base (MILITARY): fence and gates, a runway with hangars, a housing grid, the HQ over the vault --------
export function layoutBase(opts) {
  const M = MILITARY, rng = makeRng((opts.seed >>> 0) || 1), BI = BIOMES[opts.biome] ?? BIOMES.desert_sonoran;
  const [W, D] = M.size, cx = Math.round(opts.x), cz = Math.round(opts.z);
  const T = { id: opts.id ?? `base-${opts.seed}`, name: (opts.name ?? 'MILITARY RESERVATION').toUpperCase(), arch: 'military_base', military: true, biome: opts.biome, seed: opts.seed, cx, cz, size: W,
    x0: cx - W / 2, z0: cz - D / 2, x1: cx + W / 2, z1: cz + D / 2, damage: 0.3, wealth: 0.7, roads: [], blocks: [], buildings: [], bridges: [], wall: null, gates: [], wrecks: [], lamps: [], runway: null };
  const olive = ['#6a6a4e', '#7a7458', '#5e5e48', '#8a8266'];
  // the main road runs W-E through the gate; the runway along the north edge, hangars south of it
  T.roads.push({ axis: 'x', x0: T.x0 - 80, x1: T.x1, z0: cz - 5, z1: cz + 5, row: 'blacktop2', main: true, at: cz });
  T.roads.push({ axis: 'z', x0: cx - 4, x1: cx + 4, z0: T.z0 + 70, z1: T.z1 - 20, row: 'blacktop2', at: cx });
  const [rl, rw] = M.runway;
  T.runway = { x0: cx - rl / 2, x1: cx + rl / 2, z0: T.z0 + 24, z1: T.z0 + 24 + rw };
  T.roads.push({ axis: 'x', x0: T.runway.x0, x1: T.runway.x1, z0: T.runway.z0, z1: T.runway.z1, row: 'blacktop4', at: (T.runway.z0 + T.runway.z1) / 2, runway: true });
  let nid = 0;
  const add = (k, x0, z0, w, d, front, o = {}) => { const B = makeBuilding(rng, k, Math.round(x0), Math.round(z0), Math.round(x0 + w), Math.round(z0 + d), front, { zone: 'military', color: rng.pick(olive), roofColor: '#5a5848', id: `${T.id}.b${nid++}`, ...o }); T.buildings.push(B); return B; };
  for (let i = 0; i < M.hangars; i++) add('quonset', cx - rl / 2 + 40 + i * ((rl - 100) / Math.max(1, M.hangars - 1)), T.runway.z1 + 14, 22, 30, 'N');
  // housing grid: barracks rows south-west, houses south-east
  const [rows, cols] = M.housing;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) add('barracks', T.x0 + 40 + c * 40, cz + 22 + r * 28, 30, 11, 'N');
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) add(rng.chance(0.5) ? 'house' : 'bungalow', cx + 30 + c * 26, cz + 24 + r * 26, 10, 9, 'N', { claimable: true });
  T.hq = add('hq', cx - 60, cz - 40, 28, 20, 'S', { storeys: 3 });
  add('warehouse', cx + 40, cz - 52, 30, 24, 'S');
  add('auto_shop', cx + 90, cz - 46, 18, 14, 'S');
  add('guardhouse', T.x0 + 6, cz - 14, 6, 6, 'E');
  T.wall = { type: M.fence, h: WALLS[M.fence].h, t: WALLS[M.fence].t, x0: T.x0, z0: T.z0, x1: T.x1, z1: T.z1, gates: [{ side: 'W', at: cz, w: 12 }, { side: 'E', at: cz, w: 12 }], towers: true, look: WALLS[M.fence].look, gateW: 12 };
  T.gates = T.wall.gates.map((g) => ({ ...g, x: g.side === 'W' ? T.x0 : T.x1, z: g.at, open: false }));
  T.bunker = { x: Math.round(T.hq.x0 - 8) + 0.5, z: Math.round((T.hq.z0 + T.hq.z1) / 2) + 0.5, levels: M.bunker.levels[0] + rng.int(0, M.bunker.levels[1] - M.bunker.levels[0]) };
  T.bridges = [];
  return T;
}
