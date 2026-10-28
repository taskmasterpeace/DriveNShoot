// BACK LOTS AND ALLEYS, PLANNED (docs/design/WEB_BACK_LOTS.md §3): pure data like layout.js (no three.js, no game), from
// the rows in data/backlots.js. layout.js calls in at three points:
//   alleyFor(b, ...)   a block's service alley: the drivable lane and its two verges, down the middle of a two-sided block
//                      (between the two rows of lots) or along the back of a one-sided one; the lots' back line
//   planYards(...)     every yard home's fenced back yard: lot-line fences, the side gates beside the house, the back fence
//                      on the alley with its gate, a detached garage whose roll-up opens onto the lane, and the yard's things
//                      (shed, dog run, clothesline, garden, burn barrel, a car on blocks)
//   planDocks(...)     commercial lots' loading docks: a back roll-up bay on the alley, a raised platform beside it, an apron
//   alleyProps(...)    utility poles, dumpsters and bins on the verges (never in the lane, never in front of a bay or gate)
// build.js turns these into boxes and items; systems/backlots.js runs the fences and gates.
import { ALLEYS, ALLEY_PLAN, FENCES, FENCE_PICK, GATES, YARD, YARD_PROPS, GARAGE, DOCKS, ALLEY_PROPS } from '../../data/backlots.js';

const r1 = (v) => Math.round(v * 10) / 10;
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
// A lot's local frame: u along its street, v across (world z for a N/S front, world x for W/E); s: the sign of "back".
export function frameOf(front) {
  const ax = front === 'N' || front === 'S', s = front === 'N' || front === 'W' ? 1 : -1;
  return {
    ax, s,
    rect: (u0, u1, v0, v1) => (ax ? { x0: Math.min(u0, u1), x1: Math.max(u0, u1), z0: Math.min(v0, v1), z1: Math.max(v0, v1) } : { x0: Math.min(v0, v1), x1: Math.max(v0, v1), z0: Math.min(u0, u1), z1: Math.max(u0, u1) }),
    pt: (u, v) => (ax ? [u, v] : [v, u]),
    u0: (B) => (ax ? B.x0 : B.z0), u1: (B) => (ax ? B.x1 : B.z1),
    vFront: (B) => (ax ? (s > 0 ? B.z0 : B.z1) : (s > 0 ? B.x0 : B.x1)), vBack: (B) => (ax ? (s > 0 ? B.z1 : B.z0) : (s > 0 ? B.x1 : B.x0)),
  };
}

export const alleyRowFor = (zone, d) => (zone === 'farm' ? 'dirt' : zone === 'res' ? (d > ALLEY_PLAN.dirtPast ? 'dirt' : 'gravel') : 'paved');

// A block's alley. alongX: the block's long side runs along x; fronts: the plan's fronts (two: a lane down the middle).
// Returns { alley, lotDepth, backV: { N|S|E|W: the v of that front's lots' back line } }.
export function alleyFor(b, fronts, alongX, id) {
  const row = alleyRowFor(b.zone, b.d), A = ALLEYS[row], cw = A.w + 2 * A.verge;
  const deep = alongX ? b.z1 - b.z0 : b.x1 - b.x0, lo = alongX ? b.z0 : b.x0, hi = alongX ? b.z1 : b.x1;
  let c0, c1;
  if (fronts.length === 2) { const m = (lo + hi) / 2; c0 = m - cw / 2; c1 = m + cw / 2; }
  else if (fronts[0] === 'N' || fronts[0] === 'W') { c1 = hi; c0 = hi - cw; } // the lots face N (W): the lane runs along the back (S / E) edge
  else { c0 = lo; c1 = lo + cw; }
  const backV = {};
  for (const f of fronts) backV[f] = f === 'N' || f === 'W' ? c0 : c1;
  const lotDepth = fronts.length === 2 ? (deep - cw) / 2 - 0.5 : deep - cw - 1;
  const a0 = alongX ? b.x0 : b.z0, a1 = alongX ? b.x1 : b.z1;
  const lane = alongX ? { x0: a0, x1: a1, z0: c0 + A.verge, z1: c1 - A.verge } : { x0: c0 + A.verge, x1: c1 - A.verge, z0: a0, z1: a1 };
  const corr = alongX ? { x0: a0, x1: a1, z0: c0, z1: c1 } : { x0: c0, x1: c1, z0: a0, z1: a1 };
  return { alley: { id, row, axis: alongX ? 'x' : 'z', ...corr, lane, verge: A.verge, w: A.w, zone: b.zone }, lotDepth, backV };
}

export function fenceFor(biome, wealth) {
  const row = FENCE_PICK.find((p) => p.biomes.includes(biome)) ?? FENCE_PICK.find((p) => p.biomes.includes('*'));
  return wealth < row.poorBelow ? row.poor : wealth > row.richAbove ? row.rich : row.mid;
}

// lots: [{ B, front, backV, block, alley }] in order along each block front (layout.js collects them); the lot lines are
// the middles of the gaps (or the block's ends). Yards for the yard homes; returns the garages (new buildings) to add.
export function planYards(rng, T, lots, makeGarage) {
  T.yards = T.yards ?? [];
  const garages = [];
  const byRun = new Map();
  for (const L of lots) { const k = `${L.block}:${L.front}`; (byRun.get(k) ?? byRun.set(k, []).get(k)).push(L); }
  for (const run of byRun.values()) {
    const F = frameOf(run[0].front);
    run.sort((a, b) => F.u0(a.B) - F.u0(b.B));
    for (let i = 0; i < run.length; i++) {
      const L = run[i], B = L.B;
      L.l0 = i === 0 ? L.a0 + 0.15 : (F.u1(run[i - 1].B) + F.u0(B)) / 2;
      L.l1 = i === run.length - 1 ? L.a1 - 0.15 : (F.u1(B) + F.u0(run[i + 1].B)) / 2;
      L.l0 = Math.max(L.l0, F.u0(B) - 6); L.l1 = Math.min(L.l1, F.u1(B) + 6); // past an empty lot the yard keeps 6 m
    }
    for (let i = 0; i < run.length; i++) {
      const L = run[i], B = L.B;
      if (!YARD.kinds.includes(B.kind) || B.hero || (B.zone !== 'res' && B.zone !== 'farm')) continue; // a terrace in the core backs straight onto the alley
      const s = F.s, vB = F.vBack(B), vY = L.backV, depth = (vY - vB) * s;
      if (depth < YARD.minYard - 0.01) continue;
      const fence = fenceFor(T.biome, Math.max(0, Math.min(1, T.wealth + rng.range(-0.18, 0.18)))), FR = FENCES[fence];
      const y = { id: `${B.id}.yard`, b: B.id, front: L.front, fence, l0: r1(L.l0), l1: r1(L.l1), vB, vY, segs: [], gates: [], props: [], garage: null, alley: L.alley };
      const hu0 = F.u0(B) - 0.2, hu1 = F.u1(B) + 0.2, vC = vB - s * YARD.sideGateAt;
      // side crossings from the house's side walls to the lot lines, each a gate (a wide side yard: a gate and a panel)
      for (const [from, to, sideN] of [[L.l0, hu0, -1], [hu1, L.l1, 1]]) {
        const w = to - from;
        if (w < 0.9) continue;
        if (w <= GATES.side.max) y.gates.push({ kind: 'side', u: (from + to) / 2, v: vC, w: r1(w - 0.1) });
        else { const gu = sideN < 0 ? to - GATES.side.w / 2 : from + GATES.side.w / 2; y.gates.push({ kind: 'side', u: gu, v: vC, w: GATES.side.w }); y.segs.push(sideN < 0 ? [from, gu - GATES.side.w / 2, vC, vC] : [gu + GATES.side.w / 2, to, vC, vC]); }
      }
      // the lot lines: from the crossing back to the alley (a neighbour's yard shares the line: drawn once, spanning both)
      const prev = i > 0 && run[i - 1].yard && Math.abs(run[i - 1].yard.l1 - L.l0) < 0.05 ? run[i - 1].yard : null;
      if (prev) { prev.right = null; y.segs.push([L.l0, L.l0, Math.abs(prev.vC - vY) > Math.abs(vC - vY) ? prev.vC : vC, vY]); }
      else y.segs.push([L.l0, L.l0, vC, vY]);
      y.right = [L.l1, L.l1, vC, vY]; y.vC = vC;
      // a detached garage on the alley: its bay wall on the back line, a way round it to each lot line
      let gar = null;
      const gw = 7, gd = 8;
      if (depth >= GARAGE.needYard && L.l1 - L.l0 >= gw + 2 * GARAGE.side + GATES.w + 1.5 && rng.chance(GARAGE.chance)) {
        const left = rng.chance(0.5), ga0 = left ? L.l0 + GARAGE.side + 0.2 : L.l1 - GARAGE.side - 0.2 - gw;
        const vg1 = vY - s * 0.25, vg0 = vg1 - s * gd;
        const R = F.rect(ga0, ga0 + gw, vg0, vg1);
        gar = makeGarage(R.x0, R.z0, R.x1, R.z1, OPP[L.front], B);
        if (gar) { garages.push(gar); y.garage = gar.id; y.gu = [ga0 - 0.2, ga0 + gw + 0.2]; }
      }
      // the back fence on the alley, the gate in the widest stretch (beside the garage when there is one)
      const spans = y.gu ? [[L.l0, y.gu[0]], [y.gu[1], L.l1]] : [[L.l0, L.l1]];
      const wide = spans.reduce((a, q) => (q[1] - q[0] > a[1] - a[0] ? q : a), spans[0]);
      const hc = (F.u0(B) + F.u1(B)) / 2, gu = Math.max(wide[0] + GATES.w / 2 + 0.4, Math.min(wide[1] - GATES.w / 2 - 0.4, y.gu ? (wide[0] + wide[1]) / 2 : hc));
      y.gates.push({ kind: 'alley', u: r1(gu), v: vY, w: GATES.w });
      for (const [p, q] of spans) {
        if (p === wide[0]) { if (gu - GATES.w / 2 - p > 0.05) y.segs.push([p, gu - GATES.w / 2, vY, vY]); if (q - gu - GATES.w / 2 > 0.05) y.segs.push([gu + GATES.w / 2, q, vY, vY]); }
        else if (q - p > 0.05) y.segs.push([p, q, vY, vY]);
      }
      // the yard's things: inside the fences, off the lot lines (a way down each side), off the walk behind the house,
      // clear of the alley gate and the garage
      const zu0 = L.l0 + 1.5, zu1 = L.l1 - 1.5, zv0 = vB + s * (0.2 + YARD.walk), zv1 = vY - s * 1.5; // a climb over the back fence lands clear
      const taken = [];
      if (y.gu) taken.push({ u0: y.gu[0] - 1.2, u1: y.gu[1] + 1.2, v0: Math.min(vY, vY - s * (gd + 1.8)), v1: Math.max(vY, vY - s * (gd + 1.8)) });
      taken.push({ u0: gu - 1.6, u1: gu + 1.6, v0: Math.min(vY, vY - s * 2.6), v1: Math.max(vY, vY - s * 2.6) });
      for (const [k, P] of Object.entries(YARD_PROPS)) {
        if (!rng.chance(Math.max(0, Math.min(1, P.chance + P.lean * (T.wealth - 0.4))))) continue;
        for (let t = 0; t < 8; t++) {
          const along = rng.chance(0.5), pw = along ? P.w : P.d, pd = along ? P.d : P.w; // turned along the yard or across it
          const lu = Math.min(zu0, zu1), hu = Math.max(zu0, zu1), lv = Math.min(zv0, zv1), hv = Math.max(zv0, zv1);
          if (hu - lu < pw + 0.2 || hv - lv < pd + 0.2) break;
          const cu = rng.range(lu + pw / 2, hu - pw / 2), cv = rng.range(lv + pd / 2, hv - pd / 2);
          const q = { u0: cu - pw / 2, u1: cu + pw / 2, v0: cv - pd / 2, v1: cv + pd / 2 };
          if (taken.some((o) => q.u1 + 0.9 > o.u0 && q.u0 - 0.9 < o.u1 && q.v1 + 0.9 > o.v0 && q.v0 - 0.9 < o.v1)) continue;
          taken.push(q);
          const R = F.rect(q.u0, q.u1, q.v0, q.v1);
          y.props.push({ kind: k, ...R, along: F.ax === along ? 'x' : 'z' });
          break;
        }
      }
      L.yard = y;
      // a yard home's fire escape would stand in its side yard: it has none
      B.escape = null;
    }
    // world coordinates for the build (after the run: a shared lot line is drawn by the yard on its right)
    for (const L of run) {
      const y = L.yard; if (!y) continue;
      const t = FENCES[y.fence].t / 2, s = F.s;
      if (y.right) y.segs.push(y.right);
      y.segs = y.segs.map(([u0, u1, v0, v1]) => (u0 === u1 ? F.rect(u0 - t, u0 + t, v0, v1) : F.rect(u0, u1, v0 - t, v0 + t))).filter((r) => r.x1 - r.x0 > 0.05 && r.z1 - r.z0 > 0.05);
      y.gates = y.gates.map((g) => { const [x, z] = F.pt(g.u, g.v), out = g.kind === 'alley' ? s : -s; return { kind: g.kind, x: r1(x), z: r1(z), w: g.w, nx: F.ax ? 0 : out, nz: F.ax ? out : 0 }; });
      delete y.right;
      T.yards.push(y);
    }
  }
  return garages;
}

// Docks: the back wall of a commercial lot gets a roll-up bay at one end (the truck backs up the apron from the alley) and a
// man door at the other; the raised platform stands beside the bay when the back lot is deep enough for it.
export function planDocks(T, lots) {
  T.docks = T.docks ?? [];
  for (const L of lots) {
    const B = L.B;
    if (!DOCKS.kinds.includes(B.kind) || B.ruined || B.hero || B.fortified) continue;
    const F = frameOf(B.front), len = F.u1(B) - F.u0(B);
    if (len < DOCKS.minLen) continue;
    const back = OPP[B.front], [bw, bh] = DOCKS.bay, clear = (L.backV - F.vBack(B)) * F.s;
    const left = (B.x0 + B.z0) % 2 === 0;
    const bayAt = left ? F.u0(B) + 1.4 + bw / 2 : F.u1(B) - 1.4 - bw / 2, doorAt = left ? F.u1(B) - 1.6 : F.u0(B) + 1.6;
    B.doors = B.doors.filter((d) => d.side !== back);
    B.doors.push({ side: back, at: r1(bayAt), w: bw, h: bh, kind: 'bay', dock: true }, { side: back, at: r1(doorAt), w: 1.4, h: 2.6, kind: 'door' });
    const [dl, dd, dh] = DOCKS.dock;
    const plat = clear >= dd + 2.4 ? (() => { const u0 = left ? bayAt + bw / 2 + 0.3 : bayAt - bw / 2 - 0.3 - dl, vb = F.vBack(B) + F.s * 0.2; return F.rect(u0, u0 + dl, vb, vb + F.s * dd); })() : null;
    // the platform must leave the man door's swing alone
    if (plat) { const du = doorAt; const pu0 = F.ax ? plat.x0 : plat.z0, pu1 = F.ax ? plat.x1 : plat.z1; if (du + 1.2 > pu0 && du - 1.2 < pu1) plat.skip = true; }
    T.docks.push({ b: B.id, side: back, at: r1(bayAt), w: bw, h: bh, platform: plat && !plat.skip ? { ...plat, h: dh } : null, apron: { ...F.rect(F.u0(B), F.u1(B), F.vBack(B), L.backV), front: B.front }, alley: L.alley });
  }
}

// Verge props: poles every so often along one verge, a dumpster behind each dock lot, a bin by most yard gates.
export function alleyProps(rng, T) {
  const out = [], keep = []; // [x0, z0, x1, z1]: a bay's drive lane out to the far side of the alley, a door's or gate's step
  const sq = (x, z, r) => keep.push([x - r, z - r, x + r, z + r]);
  for (const B of T.buildings) for (const d of B.doors) if (d.kind === 'bay' || d.side !== B.front) {
    const [x, z] = d.side === 'N' ? [d.at, B.z0] : d.side === 'S' ? [d.at, B.z1] : d.side === 'W' ? [B.x0, d.at] : [B.x1, d.at];
    if (d.kind !== 'bay') { sq(x, z, 1.6); continue; }
    const hw = d.w / 2 + 1.5, L = 14;
    keep.push(d.side === 'N' ? [x - hw, z - L, x + hw, z] : d.side === 'S' ? [x - hw, z, x + hw, z + L] : d.side === 'W' ? [x - L, z - hw, x, z + hw] : [x, z - hw, x + L, z + hw]);
  }
  for (const y of T.yards ?? []) for (const g of y.gates) sq(g.x, g.z, g.w / 2 + 1.4);
  const free = (x, z, r) => !keep.some(([a, b, c, d]) => x + r > a && x - r < c && z + r > b && z - r < d);
  for (const A of T.alleys ?? []) {
    const ax = A.axis === 'x', a0 = ax ? A.x0 : A.z0, a1 = ax ? A.x1 : A.z1, vLo = (ax ? A.z0 : A.x0) + A.verge / 2, vHi = (ax ? A.z1 : A.x1) - A.verge / 2;
    const P = ALLEY_PROPS.pole, side = rng.chance(0.5) ? vLo : vHi;
    for (let a = a0 + 3 + rng.range(0, 6); a < a1 - 3; a += ALLEY_PLAN.poleEvery) {
      for (const da of [0, 3, -3, 6]) { const x = ax ? a + da : side, z = ax ? side : a + da; if (free(x, z, 0.4)) { out.push({ kind: 'pole', x: r1(x), z: r1(z), along: A.axis }); break; } }
    }
  }
  for (const D of T.docks ?? []) {
    const A = D.alley; if (!A) continue;
    const ax = A.axis === 'x', P = ALLEY_PROPS.dumpster;
    const near = D.side === 'N' || D.side === 'W' ? (ax ? A.z1 : A.x1) - A.verge / 2 : (ax ? A.z0 : A.x0) + A.verge / 2; // the verge on the lot's side
    const ap = D.apron, u0 = ax ? ap.x0 : ap.z0, u1 = ax ? ap.x1 : ap.z1;
    for (let t = 0; t < 6; t++) { const u = rng.range(u0 + 1.2, u1 - 1.2), x = ax ? u : near, z = ax ? near : u; if (free(x, z, 1.2)) { out.push({ kind: 'dumpster', x: r1(x), z: r1(z), along: A.axis }); sq(x, z, 1.4); break; } }
  }
  for (const y of T.yards ?? []) {
    if (!rng.chance(ALLEY_PLAN.binChance)) continue;
    const g = y.gates.find((q) => q.kind === 'alley'), A = y.alley; if (!g || !A) continue;
    const ax = A.axis === 'x', v = ax ? g.z + g.nz * (A.verge / 2) : g.x + g.nx * (A.verge / 2);
    for (const du of [1.9, -1.9, 2.8]) { const x = ax ? g.x + du : v, z = ax ? v : g.z + du; if (free(x, z, 0.4)) { out.push({ kind: 'bin', x: r1(x), z: r1(z), along: A.axis }); break; } }
  }
  return out;
}

// After a plan's lots change hands (a site's hero buildings, a ruin remade, the law's station): a yard whose home is no
// longer a yard home goes (with its garage); call before clearBays. finishBacklots (after clearBays): a dock whose bay
// went goes, and the verge props are placed against the doors and bays that stand now.
export function reconcileBacklots(T) {
  const keepY = [], drop = new Set();
  for (const y of T.yards ?? []) { const B = T.buildings.find((q) => q.id === y.b); if (B && YARD.kinds.includes(B.kind) && !B.hero) keepY.push(y); else if (y.garage) drop.add(y.garage); }
  T.yards = keepY;
  if (drop.size) T.buildings = T.buildings.filter((B) => !drop.has(B.id));
}
export function finishBacklots(rng, T) {
  // a gas station's canopy (build.js: four posts 11 m out from its front) over a dock's drive lane: that dock is walled up
  const canopyOf = (B) => { const F = frameOf(B.front), c = (F.u0(B) + F.u1(B)) / 2, v = F.vFront(B) - F.s * 11; return F.rect(c - 9, c + 9, v - 5, v + 5); };
  for (const B of T.buildings) if (B.canopy) { const c = canopyOf(B); if ((T.alleys ?? []).some((A) => c.x1 > A.x0 && c.x0 < A.x1 && c.z1 > A.z0 && c.z0 < A.z1)) B.canopy = false; } // pumps over an alley: none
  const canopies = T.buildings.filter((B) => B.canopy).map(canopyOf);
  if (canopies.length) for (const D of T.docks ?? []) {
    const B = T.buildings.find((q) => q.id === D.b), d = B?.doors.find((q) => q.dock);
    if (!d) continue;
    const [x, z] = d.side === 'N' ? [d.at, B.z0] : d.side === 'S' ? [d.at, B.z1] : d.side === 'W' ? [B.x0, d.at] : [B.x1, d.at], hw = d.w / 2 + 1.5, L = 8;
    const r = d.side === 'N' ? [x - hw, z - L, x + hw, z] : d.side === 'S' ? [x - hw, z, x + hw, z + L] : d.side === 'W' ? [x - L, z - hw, x, z + hw] : [x, z - hw, x + L, z + hw];
    if (canopies.some((c) => r[2] > c.x0 && r[0] < c.x1 && r[3] > c.z0 && r[1] < c.z1)) { B.doors = B.doors.filter((q) => q !== d); B.drive = B.doors.some((q) => q.kind === 'bay'); }
  }
  T.docks = (T.docks ?? []).filter((D) => { const B = T.buildings.find((q) => q.id === D.b); return B && !B.hero && B.doors.some((d) => d.dock); });
  T.backProps = alleyProps(rng, T);
}
