// THE BACK LOTS DRESSED (docs/design/WEB_BACK_LOTS.md §3.4; BACK-LOTS 2): what makes an alley and a yard look lived in and
// left, from data/backlots.js DRESS and YARD_DRESS. Pure, like build.js; runs at the end of buildBacklots on its own seed
// (the town's plan and every audit's geometry stay as they were: the dressing adds items, and colliders only where a row
// names a tag - a burned-out car, junk, tires, a woodpile - each kept off the lane, the walls' way round, every door's
// step, every bay's drive lane and every gate).
//   lanes    darker ruts (unpaved), oil stains and cracks (paved), puddles (more where it rains)
//   poles    sagging wires to the next pole on the same verge, a transformer can on every few
//   verges   trash bags round the dumpsters and bins and along the way, broken pallets, weeds at every fence's foot and
//            along the lane's edge
//   wrecks   burned-out cars on the back-lot ground beside the verge
//   doors    a step (a stoop for a home) outside every back door
//   across   washing lines strung over a residential lane, above a truck
//   yards    junk piles, tire stacks, woodpiles, a lawn chair, and the grass let go (gardens gone wild)
// Every piece is an item of citygen's one instanced mesh: no draw call is added.
import { DRESS, YARD_DRESS, YARD, GATES, FENCES } from '../../data/backlots.js';
import { makeRng } from '../../engine/rng.js';
import { frameOf } from './backlots.js';

export function dressTown(T, out, box) {
  const t0 = performance.now(), rng = makeRng(((T.seed >>> 0) ^ 0xd2e55) >>> 0 || 7);
  const vis = (cx, cy, cz, sx, sy, sz, col) => { out.items.push({ cx, cy, cz, sx, sy, sz, col, lv: 0, R: null }); };
  const pick = (a) => a[Math.floor(rng() * a.length)];
  // a clump of weeds: a few small stalk boxes of their own heights and greens round (x, z), spread along `ax` by `l`
  const tuft = (x, z, l, wd, hmax, ax, n = DRESS.weeds.tuft[0] + Math.floor(rng() * (DRESS.weeds.tuft[1] - DRESS.weeds.tuft[0] + 1))) => {
    for (let k = 0; k < n; k++) { const a = (rng() - 0.5) * l, o = (rng() - 0.5) * wd, s = 0.18 + rng() * 0.3, h = hmax * (0.45 + rng() * 0.55); vis(ax ? x + a : x + o, h / 2, ax ? z + o : z + a, s, h, s, pick(weedCols)); }
  };
  const dry = DRESS.weeds.dryBiomes.includes(T.biome), weedCols = dry ? DRESS.weeds.dry : DRESS.weeds.green;
  const wet = DRESS.puddle.wetBiomes.includes(T.biome);
  const counts = { oil: 0, cracks: 0, puddles: 0, wires: 0, bags: 0, weeds: 0, pallets: 0, burnt: 0, stoops: 0, lines: 0, junk: 0, wild: 0 };

  // ---- the keep-outs: every door's step, every bay's drive lane, every gate ----
  const keep = [];
  const sq = (x, z, r) => keep.push([x - r, z - r, x + r, z + r]);
  for (const B of T.buildings) for (const d of B.doors) {
    const [x, z] = d.side === 'N' ? [d.at, B.z0] : d.side === 'S' ? [d.at, B.z1] : d.side === 'W' ? [B.x0, d.at] : [B.x1, d.at];
    if (d.kind !== 'bay') { sq(x, z, 1.8); continue; }
    const hw = d.w / 2 + 1.5, L = 14;
    keep.push(d.side === 'N' ? [x - hw, z - L, x + hw, z] : d.side === 'S' ? [x - hw, z, x + hw, z + L] : d.side === 'W' ? [x - L, z - hw, x, z + hw] : [x, z - hw, x + L, z + hw]);
  }
  for (const q of out.gates) sq(q.x, q.z, q.w / 2 + 1.5);
  const kept = (x0, z0, x1, z1) => keep.some(([a, b, c, d]) => x1 > a && x0 < c && z1 > b && z0 < d);
  const lanes = (T.alleys ?? []).map((A) => A.lane);
  const inLane = (x0, z0, x1, z1) => lanes.some((L) => x1 > L.x0 && x0 < L.x1 && z1 > L.z0 && z0 < L.z1);
  // a collider stands only where nothing else stands, and a wall keeps its way round
  // the street-level boxes in a 4 m grid (a scan of every box per try costs a second a town)
  const C4 = 4, grid = new Map(), cellKey = (i, j) => i * 100003 + j;
  const ins = (b) => { if (b.base > 2.5) return; for (let i = Math.floor(b.minX / C4); i <= Math.floor(b.maxX / C4); i++) for (let j = Math.floor(b.minZ / C4); j <= Math.floor(b.maxZ / C4); j++) { const k = cellKey(i, j); let L = grid.get(k); if (!L) grid.set(k, (L = [])); L.push(b); } };
  for (const b of out.boxes) ins(b);
  const hitsBox = (x0, z0, x1, z1, m = 0.3, wallGap = 0) => {
    const r = Math.max(m, wallGap);
    for (let i = Math.floor((x0 - r) / C4); i <= Math.floor((x1 + r) / C4); i++) for (let j = Math.floor((z0 - r) / C4); j <= Math.floor((z1 + r) / C4); j++) {
      const L = grid.get(cellKey(i, j)); if (!L) continue;
      for (const b of L) { const g = b.wallish ?? (b.wallish = /^cg-(wall|half|flank)/.test(b.tag)) ? r : m; if (x1 + g > b.minX && x0 - g < b.maxX && z1 + g > b.minZ && z0 - g < b.maxZ) return true; }
    }
    return false;
  };
  const solid = (x0, z0, x1, z1, tag, h) => { const b = box(x0, z0, x1, z1, tag, h, 0); out.boxes.push(b); ins(b); return b; };

  // ---- the lanes ----
  for (const A of T.alleys ?? []) {
    const ax = A.axis === 'x', L = A.lane, a0 = ax ? L.x0 : L.z0, a1 = ax ? L.x1 : L.z1, v0 = ax ? L.z0 : L.x0, v1 = ax ? L.z1 : L.x1, len = a1 - a0, vc = (v0 + v1) / 2;
    const P = (a, v) => (ax ? [a, v] : [v, a]);
    const flat = (a, v, la, lv, y, col) => { const [x, z] = P(a, v); vis(x, y, z, ax ? la : lv, 0.02, ax ? lv : la, col); };
    if (DRESS.oil.rows.includes(A.row)) {
      for (let i = 0; i < Math.round(len / 100 * DRESS.oil.per100); i++) { flat(a0 + rng() * len, vc + (rng() - 0.5) * (v1 - v0) * 0.6, 0.8 + rng() * 0.9, 0.6 + rng() * 0.6, 0.088, pick(DRESS.oil.cols)); counts.oil++; }
      for (let i = 0; i < Math.round(len / 100 * DRESS.crack.per100); i++) { const l = 2 + rng() * 4; flat(a0 + rng() * (len - l) + l / 2, v0 + 0.4 + rng() * (v1 - v0 - 0.8), l, 0.07, 0.089, DRESS.crack.col); counts.cracks++; }
    }
    for (let i = 0; i < Math.round(len / 100 * DRESS.puddle.per100 * (wet ? DRESS.puddle.wet : 1)); i++) {
      const la = 1.2 + rng() * 1.8, lv = 0.8 + rng() * 1.2, c = pick(DRESS.puddle.cols), a = a0 + la + rng() * Math.max(0, len - 2 * la), v = vc + (rng() - 0.5) * 1.6;
      flat(a, v, la, lv, 0.09, c); flat(a + la * 0.3, v + lv * 0.2, la * 0.6, lv * 0.7, 0.091, c); counts.puddles++;
    }
    // weeds along the lane's edges (the verge side), in tufts with gaps
    for (const ve of [v0 - 0.15, v1 + 0.15]) for (let a = a0 + rng() * 2; a < a1 - 0.5; a += DRESS.weeds.every * (0.6 + rng() * 0.9)) {
      if (rng() < 0.35) continue;
      const l = 0.5 + rng() * 1.3, h = 0.12 + rng() * 0.25, [x, z] = P(a, ve);
      if (kept(x - 0.3, z - 0.3, x + 0.3, z + 0.3)) continue;
      tuft(x, z, l, 0.35, h + 0.15, ax); counts.weeds++;
    }
    // washing strung across a residential lane, above a truck
    if (DRESS.across.rows.includes(A.row)) for (let a = a0 + DRESS.across.every / 2; a < a1 - 6; a += DRESS.across.every * (0.8 + rng() * 0.5)) {
      if (rng() > DRESS.across.chance) continue;
      const H = DRESS.across.h, va = ax ? A.z0 + 0.35 : A.x0 + 0.35, vb = ax ? A.z1 - 0.35 : A.x1 - 0.35;
      const [xa, za] = P(a, va), [xb, zb] = P(a, vb);
      if (kept(Math.min(xa, xb) - 0.5, Math.min(za, zb) - 0.5, Math.max(xa, xb) + 0.5, Math.max(za, zb) + 0.5)) continue;
      for (const [x, z] of [[xa, za], [xb, zb]]) vis(x, (H + 0.2) / 2, z, 0.12, H + 0.2, 0.12, '#5e4a36');
      const [mx, mz] = P(a, (va + vb) / 2), span = vb - va;
      vis(mx, H, mz, ax ? 0.03 : span, 0.03, ax ? span : 0.03, '#b8b0a0');
      const n = 3 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) { const v = va + span * (k + 0.5 + (rng() - 0.5) * 0.4) / n, [x, z] = P(a, v), w = 0.5 + rng() * 0.4, hh = 0.5 + rng() * 0.4; vis(x, H - hh / 2 - 0.03, z, ax ? 0.04 : w, hh, ax ? w : 0.04, pick(DRESS.across.cols)); }
      counts.lines++;
    }
  }

  // ---- dock aprons: oil where the trucks stood, a pallet stack and a bag by the wall (never in the bay's lane) ----
  for (const D of T.docks ?? []) {
    const ap = D.apron, w = ap.x1 - ap.x0, d = ap.z1 - ap.z0;
    for (let i = 0; i < 3; i++) { const x = ap.x0 + w * (0.15 + rng() * 0.7), z = ap.z0 + d * (0.15 + rng() * 0.7); vis(x, 0.09, z, 0.9 + rng() * 1.1, 0.02, 0.7 + rng() * 0.8, pick(DRESS.oil.cols)); counts.oil++; }
    for (let t = 0; t < 6; t++) {
      const x = ap.x0 + 0.8 + rng() * Math.max(0, w - 1.6), z = ap.z0 + 0.8 + rng() * Math.max(0, d - 1.6);
      if (kept(x - 0.7, z - 0.7, x + 0.7, z + 0.7)) continue;
      for (let k = 0; k < 2 + Math.floor(rng() * 3); k++) vis(x, 0.08 + k * 0.15, z, 1.2, 0.13, 1.0, k % 2 ? DRESS.pallets.dark : DRESS.pallets.col);
      counts.pallets++; break;
    }
  }

  // ---- the poles' wires (to the next pole on the same verge of the same alley) ----
  const poles = (T.backProps ?? []).filter((q) => q.kind === 'pole');
  const byLine = new Map();
  for (const q of poles) { const k = `${q.along}:${q.along === 'x' ? q.z : q.x}`; (byLine.get(k) ?? byLine.set(k, []).get(k)).push(q); }
  for (const L of byLine.values()) {
    const ax = L[0].along === 'x';
    L.sort((p, q) => (ax ? p.x - q.x : p.z - q.z));
    L.forEach((q, i) => { if (i % DRESS.wires.transformerEvery === 1) vis(q.x + (ax ? 0 : 0.35), 6.6, q.z + (ax ? 0.35 : 0), 0.5, 0.8, 0.5, DRESS.wires.transformer); });
    for (let i = 0; i + 1 < L.length; i++) {
      const p = L[i], q = L[i + 1], span = ax ? q.x - p.x : q.z - p.z;
      if (span > DRESS.wires.maxSpan || span < 2) continue;
      const top = 8.5 - DRESS.wires.drop, S = DRESS.wires.segs;
      for (let w = 0; w < DRESS.wires.n; w++) {
        const off = (w - (DRESS.wires.n - 1) / 2) * 0.7;
        for (let s = 0; s < S; s++) {
          const t = (s + 0.5) / S, y = top - DRESS.wires.sag * 4 * t * (1 - t), a = (ax ? p.x : p.z) + span * t;
          vis(ax ? a : p.x + off, y, ax ? p.z + off : a, ax ? span / S + 0.02 : 0.035, 0.035, ax ? 0.035 : span / S + 0.02, DRESS.wires.col);
        }
      }
      counts.wires++;
    }
  }

  // ---- trash bags: round each dumpster and bin, and along the verges ----
  const bag = (x, z) => { const w = 0.55 + rng() * 0.25, d = 0.45 + rng() * 0.2, h = 0.4 + rng() * 0.18; vis(x, h / 2, z, w, h, d, pick(DRESS.bags.cols)); counts.bags++; };
  for (const q of T.backProps ?? []) {
    if (q.kind !== 'dumpster' && q.kind !== 'bin') continue;
    const n = DRESS.bags.atBin[0] + Math.floor(rng() * (DRESS.bags.atBin[1] - DRESS.bags.atBin[0] + 1)), ax = q.along === 'x', r = q.kind === 'dumpster' ? 1.35 : 0.7;
    for (let k = 0; k < n; k++) { const s = rng() < 0.5 ? -1 : 1, a = s * (r + 0.3 + rng() * 0.6), o = (rng() - 0.5) * 0.5, x = q.x + (ax ? a : o), z = q.z + (ax ? o : a); if (!kept(x - 0.3, z - 0.3, x + 0.3, z + 0.3)) bag(x, z); }
  }
  for (const A of T.alleys ?? []) {
    const ax = A.axis === 'x', a0 = ax ? A.x0 : A.z0, a1 = ax ? A.x1 : A.z1, len = a1 - a0;
    for (let i = 0; i < Math.round(len / 100 * DRESS.bags.per100); i++) {
      const v = rng() < 0.5 ? (ax ? A.z0 : A.x0) + A.verge / 2 : (ax ? A.z1 : A.x1) - A.verge / 2, a = a0 + 2 + rng() * (len - 4), n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) { const x = ax ? a + k * 0.6 : v + (rng() - 0.5) * 0.3, z = ax ? v + (rng() - 0.5) * 0.3 : a + k * 0.6; if (!kept(x - 0.3, z - 0.3, x + 0.3, z + 0.3)) bag(x, z); }
    }
    // broken pallets on the verge
    for (let i = 0; i < Math.round(len / 100 * DRESS.pallets.per100); i++) {
      const v = rng() < 0.5 ? (ax ? A.z0 : A.x0) + A.verge / 2 : (ax ? A.z1 : A.x1) - A.verge / 2, a = a0 + 2 + rng() * (len - 4), [x, z] = ax ? [a, v] : [v, a];
      if (kept(x - 0.7, z - 0.7, x + 0.7, z + 0.7)) continue;
      for (let k = 0; k < 3; k++) { const o = (k - 1) * 0.38 + (rng() - 0.5) * 0.1, l = k === 1 ? 0.7 + rng() * 0.4 : 1.1; vis(ax ? x + (rng() - 0.5) * 0.2 : x + o, 0.05 + k * 0.02, ax ? z + o : z + (rng() - 0.5) * 0.2, ax ? l : 0.14, 0.04, ax ? 0.14 : l, k === 1 ? DRESS.pallets.dark : DRESS.pallets.col); }
      vis(x + (ax ? 0.3 : 0), 0.12, z + (ax ? 0 : 0.3), ax ? 0.14 : 0.9, 0.1, ax ? 0.9 : 0.14, DRESS.pallets.col); // a stringer kicked loose
      counts.pallets++;
    }
  }

  // ---- weeds at every fence's foot ----
  for (const f of out.fences) {
    const b = f.box, horiz = f.horiz, len = horiz ? b.maxX - b.minX : b.maxZ - b.minZ, c = horiz ? (b.minZ + b.maxZ) / 2 : (b.minX + b.maxX) / 2;
    for (let a = 0.3; a < len - 0.3; a += DRESS.weeds.every * (0.5 + rng())) {
      if (rng() < 0.3) continue;
      const l = Math.min(len - a, 0.6 + rng() * 1.6), h = 0.18 + rng() * 0.32, side = rng() < 0.5 ? -1 : 1, x = horiz ? b.minX + a + l / 2 : c + side * 0.2, z = horiz ? c + side * 0.2 : b.minZ + a + l / 2;
      tuft(x, z, l, 0.3, h + 0.15, horiz); counts.weeds++;
    }
  }

  // ---- a step (a stoop) outside every back door ----
  const homes = new Set((T.yards ?? []).map((y) => y.b));
  for (const B of T.buildings) for (const d of B.doors) {
    if (d.kind !== 'door' || d.side === B.front) continue;
    const ns = d.side === 'N' || d.side === 'S', o = d.side === 'N' || d.side === 'W' ? -1 : 1, [x, z] = d.side === 'N' ? [d.at, B.z0] : d.side === 'S' ? [d.at, B.z1] : d.side === 'W' ? [B.x0, d.at] : [B.x1, d.at];
    const w = d.w + 0.5, S = DRESS.stoop, steps = homes.has(B.id) ? 2 : 1;
    for (let k = 0; k < steps; k++) { const dd = S.d * (steps - k), off = 0.2 + dd / 2; vis(ns ? x : x + o * off, S.h * (k + 1) / steps, ns ? z + o * off : z, ns ? w : dd, S.h * (k + 1) / steps * 1.0, ns ? dd : w, k ? S.step : S.col); }
    counts.stoops++;
  }

  // ---- burned-out cars on the back-lot ground beside a verge ----
  const BU = DRESS.burnt;
  const want = Math.min(BU.max, Math.ceil((T.alleys?.length ?? 0) / BU.perAlleys));
  const yardRects = (T.yards ?? []).map((y) => { const F = frameOf(y.front); return F.rect(y.l0 - 0.3, y.l1 + 0.3, F.vBack(T.buildings.find((q) => q.id === y.b) ?? { x0: 0, x1: 0, z0: 0, z1: 0 }), y.vY + F.s * 0.3); });
  const docks = (T.docks ?? []).map((D) => D.apron);
  for (let tries = 0; counts.burnt < want && tries < 220; tries++) {
    const A = T.alleys[Math.floor(rng() * T.alleys.length)];
    if (!A) break;
    const ax = A.axis === 'x', a = (ax ? A.x0 : A.z0) + 4 + rng() * Math.max(0, (ax ? A.x1 - A.x0 : A.z1 - A.z0) - 8), side = rng() < 0.5 ? -1 : 1;
    const v = side < 0 ? (ax ? A.z0 : A.x0) - BU.d / 2 - 0.25 : (ax ? A.z1 : A.x1) + BU.d / 2 + 0.25; // just past the verge, on the lot's ground
    const hx = ax ? BU.w / 2 : BU.d / 2, hz = ax ? BU.d / 2 : BU.w / 2, x = ax ? a : v, z = ax ? v : a;
    const r = [x - hx, z - hz, x + hx, z + hz];
    if (inLane(...r) || kept(r[0] - 0.4, r[1] - 0.4, r[2] + 0.4, r[3] + 0.4) || hitsBox(...r, 0.5, BU.wallGap)) continue;
    if (yardRects.some((q) => r[2] > q.x0 && r[0] < q.x1 && r[3] > q.z0 && r[1] < q.z1) || docks.some((q) => r[2] > q.x0 && r[0] < q.x1 && r[3] > q.z0 && r[1] < q.z1)) continue;
    if (!T.blocks.some((b) => r[0] >= b.x0 && r[2] <= b.x1 && r[1] >= b.z0 && r[3] <= b.z1)) continue; // on the block, never out in a street
    solid(...r, BU.tag, BU.h);
    vis(x, 0.45, z, hx * 2, 0.6, hz * 2, BU.body);
    vis(x, 1.0, z, hx * 1.05, 0.5, hz * 1.05, BU.top);
    for (let k = 0; k < 3; k++) vis(x + (rng() - 0.5) * hx * 1.4, 0.77, z + (rng() - 0.5) * hz * 1.4, 0.5 + rng() * 0.5, 0.02, 0.4 + rng() * 0.4, BU.rust);
    for (const [p, q] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) vis(x + p * hx * 0.66, 0.2, z + q * hz * 0.98, ax ? 0.5 : 0.18, 0.4, ax ? 0.18 : 0.5, '#151413'); // the rims
    out.cover.push(x + (ax ? 0 : side * (hx + 0.6)), z + (ax ? side * (hz + 0.6) : 0), 0, ax ? 0 : side, ax ? side : 0, 0.5, 8);
    counts.burnt++;
  }

  // ---- the yards let go ----
  for (const y of T.yards ?? []) {
    const H = T.buildings.find((q) => q.id === y.b);
    if (!H) continue;
    const F = frameOf(y.front), s = F.s, vB = F.vBack(H), vY = y.vY;
    const zu0 = y.l0 + 1.5, zu1 = y.l1 - 1.5, zv0 = vB + s * (0.2 + YARD.walk), zv1 = vY - s * 1.5;
    const lu = Math.min(zu0, zu1), hu = Math.max(zu0, zu1), lv = Math.min(zv0, zv1), hv = Math.max(zv0, zv1);
    if (hu - lu < 1.2 || hv - lv < 1.2) continue;
    const G = y.garage && T.buildings.find((q) => q.id === y.garage);
    const taken = y.props.map((p) => [p.x0, p.z0, p.x1, p.z1]);
    if (G) taken.push([G.x0 - 1.6, G.z0 - 1.6, G.x1 + 1.6, G.z1 + 1.6]);
    const freeAt = (r, m = 0.8) => !taken.some((q) => r[2] + m > q[0] && r[0] - m < q[2] && r[3] + m > q[1] && r[1] - m < q[3]) && !kept(...r);
    const place = (w, d) => {
      for (let t = 0; t < 8; t++) {
        const along = rng() < 0.5, pw = along ? w : d, pd = along ? d : w;
        if (hu - lu < pw + 0.2 || hv - lv < pd + 0.2) return null;
        const cu = lu + pw / 2 + rng() * (hu - lu - pw), cv = lv + pd / 2 + rng() * (hv - lv - pd), R = F.rect(cu - pw / 2, cu + pw / 2, cv - pd / 2, cv + pd / 2), r = [R.x0, R.z0, R.x1, R.z1];
        if (freeAt(r) && !hitsBox(...r, 0.6, 1.4)) { taken.push(r); return r; }
      }
      return null;
    };
    const poor = 1 - Math.max(0, Math.min(1, T.wealth));
    for (const [k, P] of Object.entries(YARD_DRESS)) {
      if (rng() > P.chance * (P.poor ? 0.6 + poor : 1)) continue;
      if (k === 'wild') {
        const n = P.patches[0] + Math.floor(rng() * (P.patches[1] - P.patches[0] + 1));
        for (let i = 0; i < n; i++) { const w = 1.2 + rng() * 2, d = 0.8 + rng() * 1.6, cu = lu + rng() * (hu - lu), cv = lv + rng() * (hv - lv), R = F.rect(cu - w / 2, cu + w / 2, cv - d / 2, cv + d / 2); if (kept(R.x0, R.z0, R.x1, R.z1)) continue; const h = P.h[0] + rng() * (P.h[1] - P.h[0]), wx = R.x1 - R.x0, wz = R.z1 - R.z0; vis((R.x0 + R.x1) / 2, 0.025, (R.z0 + R.z1) / 2, wx, 0.03, wz, '#6a6440'); for (let q = 0; q < P.per[0] + Math.floor(rng() * (P.per[1] - P.per[0] + 1)); q++) tuft(R.x0 + rng() * wx, R.z0 + rng() * wz, 0.7, 0.7, h, true, 3); counts.wild++; }
        continue;
      }
      if (k === 'chair') { const r = place(0.7, 0.7); if (r) { const cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2; vis(cx, 0.42, cz, 0.6, 0.06, 0.6, P.col); vis(cx, 0.75, cz - 0.27, 0.6, 0.6, 0.06, P.col); } continue; }
      const r = place(P.w, P.d);
      if (!r) continue;
      solid(...r, P.tag, P.h);
      const cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2, sx = r[2] - r[0], sz = r[3] - r[1];
      if (k === 'junk') { for (let i = 0; i < 4; i++) vis(cx + (rng() - 0.5) * sx * 0.6, 0.15 + rng() * P.h * 0.6, cz + (rng() - 0.5) * sz * 0.6, 0.3 + rng() * 0.7, 0.2 + rng() * 0.4, 0.3 + rng() * 0.6, pick(P.cols)); counts.junk++; }
      else if (k === 'tires') { const n = 3 + Math.floor(rng() * 3); for (let i = 0; i < n; i++) vis(cx + (rng() - 0.5) * 0.08, 0.12 + i * 0.22, cz + (rng() - 0.5) * 0.08, 0.8, 0.2, 0.8, i % 2 ? '#24221f' : P.col); vis(cx, n * 0.22 + 0.02, cz, 0.36, 0.03, 0.36, '#3a3a36'); }
      else if (k === 'woodpile') { for (let i = 0; i < 3; i++) vis(cx, 0.18 + i * 0.3, cz, sx - i * 0.15, 0.28, sz - i * 0.1, i % 2 ? '#8a6a44' : P.col); }
    }
  }
  counts.items = out.items.length; counts.ms = Math.round((performance.now() - t0) * 10) / 10;
  return counts;
}
