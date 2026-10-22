// WorldIndex (docs/design/WEB_STREAMING.md §3.6, §3.8, P1): a read-only index over the imported usmap rows, built once at
// boot. P1 holds the biome / relief / state samplers, the I-10 corridor from Los Angeles to El Paso through Phoenix (its
// centreline with rounded corners and a seeded meander, spliced onto Route 66 at the island edge), its interchanges
// (real-size ramps: Robert, 2026-10-22), its signs (game miles along the built road), the towns and exit communities
// (as global features every chunk clips against), and the ride-height relief of the ramps and bridges.
// Everything here is a pure function of (data, K, seed): two boots build the same world.
import USMAP from '../data/usmap.json';
import { STREAM, KIT_OF } from '../data/streaming.js';
import { toWorld, toWorldX, toWorldZ, toUsmap, C, ISLAND, inIsland, hash32, rngOf, chunkOf } from './geo.js';

const TAU = Math.PI * 2;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const BUCKET = 1024; // metres per spatial bucket for road and feature lookups

// Distance from p to segment ab, with the parameter t (0..1) of the closest point.
function segPoint(px, pz, ax, az, bx, bz, out) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t, qz = az + dz * t;
  out.t = t; out.d = Math.hypot(px - qx, pz - qz);
  return out;
}
const _sp = { t: 0, d: 0 };

// Resample a polyline [{x,z}] at a fixed step (the last point is kept). Returns {x:Float64Array, z, s}.
function resample(pts, step) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const L = cum[cum.length - 1], n = Math.max(2, Math.ceil(L / step) + 1);
  const x = new Float64Array(n), z = new Float64Array(n), s = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = Math.min(L, (i / (n - 1)) * L);
    while (j < cum.length - 2 && cum[j + 1] < t) j++;
    const seg = cum[j + 1] - cum[j] || 1, f = (t - cum[j]) / seg;
    x[i] = pts[j].x + (pts[j + 1].x - pts[j].x) * f; z[i] = pts[j].z + (pts[j + 1].z - pts[j].z) * f; s[i] = t;
  }
  return { x, z, s, n, L };
}

// Fillet every interior corner of a polyline with radius R (limited by the room each side), sampled every ~6 m of arc.
// Vertices flagged `keep` stay exactly where they are (the island edges).
function fillet(pts, R) {
  const out = [pts[0]];
  let used = 0; // tangent length already consumed at the start of the current segment
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1], B = pts[i], Cc = pts[i + 1];
    const l1 = Math.hypot(B.x - A.x, B.z - A.z), l2 = Math.hypot(Cc.x - B.x, Cc.z - B.z);
    const u1x = (B.x - A.x) / l1, u1z = (B.z - A.z) / l1, u2x = (Cc.x - B.x) / l2, u2z = (Cc.z - B.z) / l2;
    const cross = u1x * u2z - u1z * u2x, dot = Math.max(-1, Math.min(1, u1x * u2x + u1z * u2z));
    const th = Math.acos(dot);
    if (B.keep || th < 1e-4) { out.push(B); used = 0; continue; }
    let t = R * Math.tan(th / 2);
    const room = Math.min(l1 - used, (l2 / 2));
    if (t > room) t = Math.max(0, room);
    const r = t / Math.tan(th / 2);
    const p0x = B.x - u1x * t, p0z = B.z - u1z * t;
    // Arc centre: to the left or right of the incoming direction.
    const sgn = cross > 0 ? 1 : -1, nx = -u1z * sgn, nz = u1x * sgn;
    const cx = p0x + nx * r, cz = p0z + nz * r;
    const a0 = Math.atan2(p0z - cz, p0x - cx), steps = Math.max(2, Math.ceil((th * r) / 6));
    for (let k = 0; k <= steps; k++) {
      const a = a0 + sgn * th * (k / steps);
      out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
    }
    used = t;
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// A ribbon: a centreline with heights, a paved half-width each side, and what kind of road it is.
// band: which strip of the road atlas paints it (hwy = one carriageway, county = two-way, ramp = one-way lane).
function ribbon(id, kind, band, pts, opts = {}) {
  const n = pts.length, x = new Float64Array(n), z = new Float64Array(n), y = new Float64Array(n), s = new Float64Array(n);
  const wl = new Float64Array(n), wr = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    x[i] = p.x; z[i] = p.z; y[i] = p.y ?? 0; wl[i] = p.wl ?? opts.halfW ?? 3; wr[i] = p.wr ?? opts.halfW ?? 3;
    if (i) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
  }
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, ymax = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.max(wl[i], wr[i]) + 2 * y[i] + 2;
    x0 = Math.min(x0, x[i] - w); x1 = Math.max(x1, x[i] + w); z0 = Math.min(z0, z[i] - w); z1 = Math.max(z1, z[i] + w); ymax = Math.max(ymax, y[i]);
  }
  return { id, kind, band, x, z, y, s, wl, wr, n, L: s[n - 1], x0, z0, x1, z1, ymax, ...opts };
}

export class WorldIndex {
  constructor() {
    const t0 = performance.now();
    const D = USMAP;
    this.data = D;
    this.dataHash = D.meta.dataHash;
    this.K = STREAM.K;
    this.seed = STREAM.seed;
    this.warnings = [];
    this.structById = Object.fromEntries(D.structures.map((s) => [s.id, s]));
    this.archById = Object.fromEntries(D.exit_archetypes.map((a) => [a.id, a]));
    this.buildCorridor();
    this.buildExits();
    this.buildTowns();
    this.buildSigns();
    this.bucketFeatures();
    this.buildMs = +(performance.now() - t0).toFixed(1);
  }

  // ---- samplers over the 500 m usmap grids -----------------------------------------------------------------------
  cell(x, z) {
    const D = this.data, [ux, uy] = toUsmap(x, z);
    const i = Math.floor((ux - D.world_offset[0]) / D.cell_m), j = Math.floor((uy - D.world_offset[1]) / D.cell_m);
    return i < 0 || j < 0 || i >= D.w || j >= D.h ? null : [i, j];
  }
  biomeAt(x, z) { const c = this.cell(x, z); return c ? this.data.grid[c[1]][c[0]] : '.'; }
  stateAt(x, z) { const c = this.cell(x, z); const k = c ? this.data.states_grid[c[1]][c[0]] : '.'; return this.data.state_legend[k] ?? null; }
  // Relief 0..1, bilinear between cell centres (the digits run 0-9).
  reliefAt(x, z) {
    const D = this.data, [ux, uy] = toUsmap(x, z);
    const fx = (ux - D.world_offset[0]) / D.cell_m - 0.5, fy = (uy - D.world_offset[1]) / D.cell_m - 0.5;
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
    const g = (a, b) => { a = Math.max(0, Math.min(D.w - 1, a)); b = Math.max(0, Math.min(D.h - 1, b)); return (D.relief[b].charCodeAt(a) - 48) / 9; };
    return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - ty) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * ty;
  }

  // ---- the corridor (I-10, Los Angeles .. the dust wall past El Paso) -------------------------------------------------
  buildCorridor() {
    const S = STREAM, D = this.data;
    const row = D.interstates.find((r) => r.id === 'I-10');
    this.road = { id: row.id, nickname: row.nickname, lanes: row.lanes, divided: row.divided };
    const W = row.pts.map((p) => ({ x: toWorldX(p[0]), z: toWorldZ(p[1]) }));
    // The island splice (§3.4): the usmap points inside the island go; Route 66 (z = 0) carries the road through it,
    // and a straight lead-out each side lets the median open before the first corner.
    const lead = S.spliceLead + 50, isl = ISLAND;
    const west = [], east = [];
    for (const p of W) { if (inIsland(p.x, p.z, lead)) continue; (p.x < 0 ? west : east).push(p); }
    const pts = [...west, { x: -isl - lead, z: 0 }, { x: -isl, z: 0, keep: true }, { x: isl, z: 0, keep: true }, { x: isl + lead, z: 0 }];
    // East: run past El Paso to the dust wall (and a little into it, so the road fades into the dust).
    const R = S.dustWall + 300;
    for (let i = 0; i < east.length; i++) {
      const p = east[i], prev = i ? east[i - 1] : pts[pts.length - 1];
      if (Math.hypot(p.x, p.z) <= R) { pts.push(p); continue; }
      const a = Math.hypot(prev.x, prev.z), b = Math.hypot(p.x, p.z), f = (R - a) / (b - a);
      pts.push({ x: prev.x + (p.x - prev.x) * f, z: prev.z + (p.z - prev.z) * f });
      break;
    }
    const base = resample(fillet(pts, S.cornerR), 4);
    // Where the exits are on the base curve (the meander is tapered to nothing around each one).
    const exitRows = D.exits.filter((e) => e.highway_id === 'I-10');
    const proj = (L, x, z) => { let best = Infinity, bs = 0; for (let i = 1; i < L.n; i++) { segPoint(x, z, L.x[i - 1], L.z[i - 1], L.x[i], L.z[i], _sp); if (_sp.d < best) { best = _sp.d; bs = L.s[i - 1] + (L.s[i] - L.s[i - 1]) * _sp.t; } } return { s: bs, d: best }; };
    const exitS = exitRows.map((e) => { const [x, z] = toWorld(e.pos); return proj(base, x, z).s; });
    const sIslW = proj(base, -isl, 0).s, sIslE = proj(base, isl, 0).s;
    // The meander: two seeded sines, faded out at the island, at every exit and near the ends (§3.8, F12).
    const rng = rngOf(hash32(this.seed, 1010));
    const l1 = rng.range(S.meanderL[0], S.meanderL[1]), l2 = rng.range(S.meanderL[0], S.meanderL[1]) * 1.7, p1 = rng() * TAU, p2 = rng() * TAU;
    const taper = (s) => {
      let k = smooth((Math.min(s, base.L - s) - 300) / 900);
      if (s > sIslW - 1200 && s < sIslE + 1200) k = Math.min(k, smooth(Math.max(sIslW - s, s - sIslE) / 1200 - 0.15));
      for (const se of exitS) k = Math.min(k, smooth((Math.abs(s - se) - 900) / 700));
      return k;
    };
    const off = [];
    for (let i = 0; i < base.n; i++) {
      const s = base.s[i], i0 = Math.max(0, i - 1), i1 = Math.min(base.n - 1, i + 1);
      const tx = base.x[i1] - base.x[i0], tz = base.z[i1] - base.z[i0], tl = Math.hypot(tx, tz) || 1;
      const m = S.meanderA * taper(s) * (0.68 * Math.sin((TAU * s) / l1 + p1) + 0.32 * Math.sin((TAU * s) / l2 + p2));
      off.push({ x: base.x[i] - (tz / tl) * m, z: base.z[i] + (tx / tl) * m }); // right normal of travel east = (-tz, tx)
    }
    const c = resample(off, S.step);
    // Tangents and right-hand normals (N points to the right of travel in +s: the eastbound side).
    c.tx = new Float64Array(c.n); c.tz = new Float64Array(c.n);
    for (let i = 0; i < c.n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(c.n - 1, i + 1), dx = c.x[i1] - c.x[i0], dz = c.z[i1] - c.z[i0], l = Math.hypot(dx, dz) || 1;
      c.tx[i] = dx / l; c.tz[i] = dz / l;
    }
    this.cl = c;
    this.sIslW = this.project(-isl, 0).s; this.sIslE = this.project(isl, 0).s;
    // Buckets of segment indices for nearest-road queries.
    this.clBuckets = new Map();
    for (let i = 0; i < c.n - 1; i++) {
      const mx = (c.x[i] + c.x[i + 1]) / 2, mz = (c.z[i] + c.z[i + 1]) / 2;
      const k = `${Math.floor(mx / BUCKET)},${Math.floor(mz / BUCKET)}`;
      let b = this.clBuckets.get(k); if (!b) this.clBuckets.set(k, (b = [])); b.push(i);
    }
    // Where the corridor reaches: its ends and the town it ends at.
    this.ends = { west: { x: c.x[0], z: c.z[0] }, east: { x: c.x[c.n - 1], z: c.z[c.n - 1] } };
  }

  // Nearest point on the corridor centreline: {s, d, side (+1 right of eastbound), i (segment), x, z}.
  project(x, z, maxD = Infinity) {
    const c = this.cl;
    let best = Infinity, bi = -1, bt = 0;
    const bx = Math.floor(x / BUCKET), bz = Math.floor(z / BUCKET), r = maxD === Infinity ? 99 : Math.ceil(maxD / BUCKET);
    if (r < 99) {
      for (let ox = -r; ox <= r; ox++) for (let oz = -r; oz <= r; oz++) {
        const list = this.clBuckets.get(`${bx + ox},${bz + oz}`);
        if (!list) continue;
        for (const i of list) { segPoint(x, z, c.x[i], c.z[i], c.x[i + 1], c.z[i + 1], _sp); if (_sp.d < best) { best = _sp.d; bi = i; bt = _sp.t; } }
      }
    } else for (let i = 0; i < c.n - 1; i++) { segPoint(x, z, c.x[i], c.z[i], c.x[i + 1], c.z[i + 1], _sp); if (_sp.d < best) { best = _sp.d; bi = i; bt = _sp.t; } }
    if (bi < 0) return { s: 0, d: Infinity, side: 0, i: -1, x: 0, z: 0 };
    const px = c.x[bi] + (c.x[bi + 1] - c.x[bi]) * bt, pz = c.z[bi] + (c.z[bi + 1] - c.z[bi]) * bt;
    const nx = -c.tz[bi], nz = c.tx[bi];
    return { s: c.s[bi] + (c.s[bi + 1] - c.s[bi]) * bt, d: best, side: (x - px) * nx + (z - pz) * nz >= 0 ? 1 : -1, i: bi, x: px, z: pz };
  }

  // Point, tangent and right normal at arc length s.
  at(s) {
    const c = this.cl, i = Math.max(0, Math.min(c.n - 2, Math.floor(s / STREAM.step)));
    const f = Math.max(0, Math.min(1, (s - c.s[i]) / (c.s[i + 1] - c.s[i] || 1)));
    const tx = c.tx[i] + (c.tx[i + 1] - c.tx[i]) * f, tz = c.tz[i] + (c.tz[i + 1] - c.tz[i]) * f, l = Math.hypot(tx, tz) || 1;
    return { x: c.x[i] + (c.x[i + 1] - c.x[i]) * f, z: c.z[i] + (c.z[i + 1] - c.z[i]) * f, tx: tx / l, tz: tz / l, nx: -tz / l, nz: tx / l };
  }

  // The mainline cross-section at s, per side, in metres from the centreline: the dirt median, then the paved
  // carriageway [inner shoulder | two lanes | outer shoulder]. At the island edge it is Route 66's (14 m, no median).
  section(s) {
    const S = STREAM, d = Math.min(Math.abs(s - this.sIslW), Math.abs(s - this.sIslE));
    const inIsl = s > this.sIslW && s < this.sIslE;
    const k = inIsl ? 0 : smooth(d / S.spliceLead);
    const med = (S.median / 2) * k, sIn = S.shoulderIn * k, lane = 3.5 + (S.lane - 3.5) * k, sOut = S.shoulderOut * k;
    return { med, in0: med, lane0: med + sIn, lane1: med + sIn + lane, lane2: med + sIn + 2 * lane, out: med + sIn + 2 * lane + sOut };
  }

  // ---- interchanges -----------------------------------------------------------------------------------------------
  buildExits() {
    const S = STREAM, R = S.ramp, X = S.crossRoad, D = this.data;
    this.exits = []; this.ribbons = []; this.pieces = []; this.rails = []; this.structs = []; this.stops = [];
    // The mainline as two ribbons (one per carriageway), each painted inner shoulder -> outer shoulder.
    const c = this.cl;
    for (const side of [1, -1]) {
      const pts = [];
      for (let i = 0; i < c.n; i++) {
        const sec = this.section(c.s[i]);
        pts.push({ x: c.x[i] + -c.tz[i] * side * sec.med, z: c.z[i] + c.tx[i] * side * sec.med, y: 0.03, wl: 0, wr: sec.out - sec.med });
      }
      // Eastbound: the ribbon's own right is +N (outward). Westbound runs the other way so its right is -N, also outward.
      this.ribbons.push(ribbon(side > 0 ? 'I-10 E' : 'I-10 W', 'hwy', 'hwy', side > 0 ? pts : pts.reverse(), { mainline: true }));
    }
    for (const e of D.exits.filter((r) => r.highway_id === 'I-10')) {
      const [ex, ez] = toWorld(e.pos);
      if (Math.hypot(ex, ez) > S.dustWall - 1500 || inIsland(ex, ez, 600)) continue; // past the P1 wall or inside Phoenix
      const p = this.project(ex, ez, 2048);
      if (p.d > 400) { this.warnings.push(`exit ${e.id} is ${Math.round(p.d)} m off I-10: skipped`); continue; }
      if (!e.dest) { this.warnings.push(`exit ${e.id} has no dest: skipped`); continue; }
      const f = this.at(p.s), arch = this.archById[e.archetype] ?? {};
      const [dx0, dz0] = toWorld(e.dest);
      let dx = dx0, dz = dz0;
      if (S.access.maxM) { const ax = dx - f.x, az = dz - f.z, l = Math.hypot(ax, az); if (l > S.access.maxM) { dx = f.x + (ax / l) * S.access.maxM; dz = f.z + (az / l) * S.access.maxM; } }
      const sigma = (dx - f.x) * f.nx + (dz - f.z) * f.nz >= 0 ? 1 : -1;
      const X0 = { id: e.id, number: e.exit_number, name: e.name, archetype: e.archetype, tier: e.community_tier, tags: e.service_tags, risk: e.risk_rating,
        s: p.s, x: f.x, z: f.z, tx: f.tx, tz: f.tz, nx: f.nx, nz: f.nz, side: sigma, dest: { x: dx, z: dz }, dead: e.archetype === 'dead', signStyle: arch.sign_style ?? 'services', row: e };
      // Local frame: L(a, u) = C + a*T + u*N.
      const L = (a, u, y = 0, wl, wr) => ({ x: f.x + f.tx * a + f.nx * u, z: f.z + f.tz * a + f.nz * u, y, wl, wr });
      const Wb = this.section(p.s).out + R.shoulder + 2.4;   // the bridge spans the paved mainline plus a clear zone
      const hx = (u) => { const a = Math.abs(u); return a <= Wb ? R.deckH : Math.max(0, R.deckH - R.grade * (a - Wb)); };
      X0.Wb = Wb; X0.hx = hx;
      // The cross road: straight across the interstate along N, on a deck over it and fills either side.
      const cr = [];
      for (let u = -X.reach; u <= X.reach + 0.01; u += 4) cr.push(L(0, u, hx(u) + 0.035, X.halfW, X.halfW));
      const cross = ribbon(`${e.id} cross road`, 'county', 'county', cr, { exit: e.id, deck: Wb });
      this.ribbons.push(cross);
      this.pieces.push({ kind: 'cross', exit: X0, rib: cross, halfW: X.halfW + 0.6, deck: Wb, x0: cross.x0, z0: cross.z0, x1: cross.x1, z1: cross.z1 });
      // Four ramps (a diamond): decel lane and gore, an S-curve that climbs to a stop at the cross road; on-ramps mirror.
      const sec = this.section(p.s), u0 = sec.lane2 + R.laneW / 2, ut = R.terminal, ht = hx(ut), lw = R.laneW / 2, so = R.shoulder;
      const at = X.halfW + 0.6, far = R.gore + R.aux + R.taper, climb0 = R.gore - 40;
      for (const dir of [1, -1]) for (const kind of ['off', 'on']) {
        // q = metres from the cross road along the mainline. An off-ramp is upstream of it (a = -dir*q) and is driven from
        // far to near; an on-ramp is downstream (a = +dir*q) and driven from near to far. Eastbound ramps sit on +N,
        // westbound on -N, so the ribbon's right (in the direction of travel) is always the outside of the ramp.
        const pts = [];
        const qs = [];
        for (let q = far; q > at; q -= 4) qs.push(q);
        qs.push(at);
        if (kind === 'on') qs.reverse();
        for (const q of qs) {
          let u, h, w = lw;
          if (q >= R.gore) { u = u0; h = 0; w = lw * Math.min(1, (far - q) / R.taper); } // the aux lane and its taper
          else {
            u = u0 + (ut - u0) * smooth((R.gore - q) / (R.gore - at));                       // the S-curve out to the terminal
            h = q < climb0 ? ht * smooth((climb0 - q) / (climb0 - at)) : 0;                    // and the climb to the cross road
          }
          pts.push(L((kind === 'off' ? -dir : dir) * q, dir * u, h + 0.04, w, w + so));
        }
        // The part alongside the mainline (taper and auxiliary lane, up to the gore) is painted as an added lane: a
        // dashed line where it meets the through lanes. Past the gore it is a ramp (yellow left edge, white right).
        const nAux = qs.filter((q) => q >= R.gore).length;
        const aux = kind === 'off' ? [0, nAux - 1] : [pts.length - nAux, pts.length - 1];
        const rib = ribbon(`${e.id} ${dir > 0 ? 'EB' : 'WB'} ${kind}-ramp`, 'ramp', 'ramp', pts, { exit: e.id, dir, rampKind: kind, aux });
        this.ribbons.push(rib);
        this.pieces.push({ kind: 'ramp', exit: X0, rib, halfW: lw + so, x0: rib.x0, z0: rib.z0, x1: rib.x1, z1: rib.z1 });
        if (kind === 'off') {
          // The stop: a stop line across the lane and a STOP sign on the right, at the cross road.
          const ea = -dir * at, sp = L(ea, dir * ut), hd = Math.atan2(f.tx * dir, f.tz * dir);
          this.stops.push({ exit: e.id, dir, x: sp.x, z: sp.z, y: ht, h: hd, w: R.laneW, sign: L(ea - dir * 1.2, dir * (ut + lw + so + 0.6)) });
        }
      }
      // Bridge structure and rails (features every chunk clips against).
      this.bridge(X0, L, Wb, hx);
      // The access road from the cross road's end on the community's side to dest (a dead exit has none).
      if (!X0.dead) {
        const pA = L(0, sigma * X.reach), pts = [{ x: pA.x, z: pA.z }];
        const ddx = dx - pA.x, ddz = dz - pA.z, dl = Math.hypot(ddx, ddz);
        if (dl > 40) {
          // A short straight continuing the cross road, then a rounded turn toward the community.
          const pB = L(0, sigma * (X.reach + Math.min(160, dl * 0.3)));
          const path = fillet([pA, pB, { x: dx, z: dz }], S.access.cornerR);
          const rs = resample(path, 6);
          const ap = [];
          for (let i = 0; i < rs.n; i++) ap.push({ x: rs.x[i], z: rs.z[i], y: 0.032, wl: S.access.halfW, wr: S.access.halfW });
          const acc = ribbon(`${e.id} access`, 'county', 'county', ap, { exit: e.id });
          this.ribbons.push(acc);
          X0.access = acc;
        }
        this.community(X0);
      }
      this.exits.push(X0);
    }
    this.exits.sort((a, b) => a.s - b.s);
  }

  // The bridge: deck slab, parapets, the median pier and the abutment faces; guardrails along every fill taller than
  // R.rail (ramps and the cross road), with gaps where the ramps join.
  bridge(X0, L, Wb, hx) {
    const R = STREAM.ramp, X = STREAM.crossRoad, H = R.deckH, hw = X.halfW;
    const box = (a0, a1, u0, u1, y0, y1, col, tag, solid = true, base = 0) => {
      // A box in the exit frame (a along T, u along N) as an oriented record (cx, cz, sx, sz, rot) for the visual,
      // plus its AABB for collision.
      const ca = (a0 + a1) / 2, cu = (u0 + u1) / 2, p = L(ca, cu);
      const rot = Math.atan2(X0.tx, X0.tz);
      this.structs.push({ exit: X0.id, x: p.x, z: p.z, y0, y1, sa: a1 - a0, su: u1 - u0, rot, col, tag, solid, base, tx: X0.tx, tz: X0.tz });
    };
    // Deck slab over the interstate, the parapets on it (floating: traffic passes under), the median pier.
    box(-hw - 0.5, hw + 0.5, -Wb - 0.6, Wb + 0.6, H - 1.1, H - 0.02, '#8d877c', 'deck', false);
    for (const sa of [-1, 1]) box(sa * (hw + 0.25) - 0.25, sa * (hw + 0.25) + 0.25, -Wb - 0.6, Wb + 0.6, H - 0.6, H + 0.85, '#a39d90', 'parapet', true, H - 0.6);
    box(-hw - 0.2, hw + 0.2, -0.7, 0.7, 0, H - 1.1, '#7e786e', 'pier', true);
    // Abutment faces where the fills end (vertical concrete beside each outer shoulder).
    for (const su of [-1, 1]) {
      const span = hw + 0.6 + 2 * H;
      box(-span, span, su > 0 ? Wb - 0.5 : -Wb - 0.1, su > 0 ? Wb + 0.1 : -Wb + 0.5, 0, H - 0.05, '#837d72', 'abutment', true);
    }
    // Rails: along both edges of the cross road's fills, and of each ramp, wherever the fill is taller than R.rail.
    const joins = this.ribbons.filter((r) => r.exit === X0.id && r.kind === 'ramp');
    const railAlong = (rib, sideSign, gapTest) => {
      let run = [];
      const flush = () => { if (run.length > 1) this.rails.push({ exit: X0.id, pts: run }); run = []; };
      for (let i = 0; i < rib.n; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(rib.n - 1, i + 1), tx = rib.x[i1] - rib.x[i0], tz = rib.z[i1] - rib.z[i0], tl = Math.hypot(tx, tz) || 1;
        const nx = -tz / tl, nz = tx / tl, w = (sideSign > 0 ? rib.wr[i] : rib.wl[i]) + 0.35;
        const px = rib.x[i] + nx * sideSign * w, pz = rib.z[i] + nz * sideSign * w, h = rib.y[i] - 0.035;
        if (h < R.rail || (gapTest && gapTest(px, pz))) { flush(); continue; }
        run.push({ x: px, z: pz, y: h });
      }
      flush();
    };
    const cross = this.ribbons.find((r) => r.exit === X0.id && r.kind === 'county' && r.deck);
    // The cross road's rails stop where a ramp comes in, and over the deck the parapets take over.
    const nearRamp = (px, pz) => joins.some((r) => { for (let i = Math.max(0, r.rampKind === 'off' ? r.n - 6 : 0); i < (r.rampKind === 'off' ? r.n : Math.min(r.n, 6)); i++) if (Math.hypot(r.x[i] - px, r.z[i] - pz) < R.laneW + 3) return true; return false; });
    const overDeck = (px, pz) => Math.abs((px - X0.x) * X0.nx + (pz - X0.z) * X0.nz) < Wb + 0.6;
    for (const sg of [1, -1]) railAlong(cross, sg, (px, pz) => nearRamp(px, pz) || overDeck(px, pz));
    for (const r of joins) for (const sg of [1, -1]) railAlong(r, sg, (px, pz) => Math.abs((px - X0.x) * X0.tx + (pz - X0.z) * X0.tz) < X.halfW + 1.2);
  }

  // A community at an exit's dest: buildings from the archetype's structures_hint, sized by tier, on an axis-aligned
  // main street (collision is axis-aligned boxes, so the town is too).
  community(X0) {
    const T = { T1: [4, 8], T2: [10, 20], T3: [25, 50] }[X0.tier] ?? [4, 8];
    const rng = rngOf(hash32(this.seed, ...[...X0.id].map((ch) => ch.charCodeAt(0))));
    const hint = this.archById[X0.archetype]?.structures_hint?.length ? this.archById[X0.archetype].structures_hint : ['house_small', 'ruined_house', 'trailer_single'];
    const n = rng.int(T[0], T[1]);
    const acc = X0.access;
    const dirX = acc ? acc.x[acc.n - 1] - acc.x[acc.n - 2] : X0.nx * X0.side, dirZ = acc ? acc.z[acc.n - 1] - acc.z[acc.n - 2] : X0.nz * X0.side;
    const ew = Math.abs(dirX) >= Math.abs(dirZ); // main street runs east-west (or north-south)
    const sgn = ew ? Math.sign(dirX) || 1 : Math.sign(dirZ) || 1;
    const o = { x: X0.dest.x, z: X0.dest.z };
    const len = 40 + Math.ceil(n / 2) * 26;
    const pts = [];
    for (let t = 0; t <= len; t += 6) pts.push({ x: o.x + (ew ? sgn * t : 0), z: o.z + (ew ? 0 : sgn * t), y: 0.033, wl: 4.6, wr: 4.6 });
    this.ribbons.push(ribbon(`${X0.id} main street`, 'street', 'county', pts, { exit: X0.id }));
    let t = 22;
    for (let k = 0; k < n; k++) {
      const id = hint[k % hint.length], st = this.structById[id] ?? { footprint_m: [10, 10], category: 'residential', floors: 1 };
      const [fw, fd] = st.footprint_m, side = k % 2 ? 1 : -1;
      const along = t + fw / 2, across = 4.6 + 5 + fd / 2;
      const cx = o.x + (ew ? sgn * along : side * across), cz = o.z + (ew ? side * across : sgn * along);
      this.addBuilding({ id: `${X0.id}-${k}`, kind: id, cx, cz, w: ew ? fw : fd, d: ew ? fd : fw, st, rng, place: X0.id });
      if (k % 2) t += fw + rng.range(6, 14);
    }
    X0.community = { x: o.x, z: o.z, n, street: ew ? 'east-west' : 'north-south' };
  }

  addBuilding(b) {
    const kit = KIT_OF(b.st.category);
    const floors = b.st.floors ?? 1;
    const ruined = b.rng.chance(kit.ruin);
    const h = kit.storey * floors * b.rng.range(0.9, 1.15);
    this.buildings ??= [];
    this.buildings.push({ ...b, rng: undefined, h, ruined, color: b.rng.pick(kit.walls), roof: kit.roof, canopy: !!kit.canopy && b.kind.startsWith('gas'), seed: b.rng.int(0, 1e9),
      x0: b.cx - b.w / 2, x1: b.cx + b.w / 2, z0: b.cz - b.d / 2, z1: b.cz + b.d / 2, name: b.st.display_name });
  }

  // ---- towns: the corridor's ends (Los Angeles, El Paso) from their placement rows ------------------------------------
  buildTowns() {
    const S = STREAM, D = this.data;
    this.buildings ??= [];
    this.towns = D.towns.map((t) => { const [x, z] = toWorld(t.pos); return { id: t.id, name: t.name, kind: t.kind, x, z, landmark: t.landmark, landmark_kind: t.landmark_kind }; });
    this.townStreets = [];
    for (const t of this.towns) {
      if (inIsland(t.x, t.z, 200) || Math.hypot(t.x, t.z) > S.dustWall - 1000) continue;
      const slots = D.placements.filter((p) => p.id.startsWith(`${t.id}-`));
      const streets = D.streets.filter((r) => r.id.startsWith(`ST-${t.id}-`));
      if (!slots.length && !streets.length) continue;
      // The town grid's angle (its main street), so it can be laid square to the world (collision is axis-aligned).
      const main = streets.find((r) => r.id.endsWith('-main'));
      let ang = 0;
      if (main) { const a = main.pts[0], b = main.pts[main.pts.length - 1]; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
      const snap = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2), rot = snap - ang; // rotate the layout square
      const cosr = Math.cos(rot), sinr = Math.sin(rot), [tu, tv] = toUsmap(t.x, t.z);
      const local = (p) => { const dx = (p[0] - tu) * S.townScale, dz = (p[1] - tv) * S.townScale; return { x: t.x + dx * cosr - dz * sinr, z: t.z + dx * sinr + dz * cosr }; };
      t.built = true; t.slots = slots.length;
      for (const r of streets) {
        const pts = resample(r.pts.map(local), 6), sp = [];
        for (let i = 0; i < pts.n; i++) sp.push({ x: pts.x[i], z: pts.z[i], y: 0.031, wl: 4.6, wr: 4.6 });
        this.ribbons.push(ribbon(r.id, 'street', 'county', sp, { town: t.id }));
      }
      const rng = rngOf(hash32(this.seed, ...[...t.id].map((ch) => ch.charCodeAt(0))));
      for (const p of slots) {
        const st = this.structById[p.building] ?? { footprint_m: [10, 10], category: 'residential', floors: 1, display_name: p.building };
        const q = local(p.pos);
        const r90 = Math.round((p.rot + rot) / (Math.PI / 2)) & 1; // quarter turns: swap the footprint
        const [fw, fd] = st.footprint_m;
        // Keep buildings off the interstate and off the streets.
        const pr = this.project(q.x, q.z, 200);
        if (pr.d < 30 + Math.max(fw, fd) / 2) continue;
        if (this.ribbons.some((rb) => rb.town === t.id && this.ribbonDist(rb, q.x, q.z) < 4.6 + Math.max(fw, fd) / 2 + 1)) continue;
        this.addBuilding({ id: p.id, kind: p.building, cx: q.x, cz: q.z, w: r90 ? fd : fw, d: r90 ? fw : fd, st, rng, place: t.id });
      }
    }
  }

  ribbonDist(r, x, z) {
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) return Infinity;
    let best = Infinity;
    for (let i = 1; i < r.n; i++) { segPoint(x, z, r.x[i - 1], r.z[i - 1], r.x[i], r.z[i], _sp); if (_sp.d < best) best = _sp.d; }
    return best;
  }

  // ---- signs: game miles along the built road (Robert, 2026-10-22) -----------------------------------------------------
  // Each sign: {id, x, z, y, h (heading the face looks along), w, hgt, style, lines[], s, dir}. Faces go into one atlas.
  buildSigns() {
    const S = STREAM, MI = S.mile, signs = (this.signs = []);
    const miles = (m) => { const v = m / MI; return v < 0.75 ? '1/2' : v < 9.5 ? String(Math.round(v)) : String(Math.round(v)); };
    const place = (s, dir, off, style, lines, id, w = 7.2, hgt = 3.6) => {
      if (s < 40 || s > this.cl.L - 40) return;
      const f = this.at(s);
      if (inIsland(f.x, f.z, 30)) return;
      const sec = this.section(s), u = dir * (sec.out + off);
      // The face looks back at the traffic it is for (toward -dir along the road): drivers coming at it read it.
      signs.push({ id, x: f.x + f.nx * u, z: f.z + f.nz * u, y: 0, h: Math.atan2(-f.tx * dir, -f.tz * dir), w, hgt, style, lines, s, dir });
    };
    // Only the towns the road actually reaches (a town off in the desert is not on this road's signs).
    const towns = this.towns.filter((t) => t.built || t.id === 'phoenix').map((t) => ({ ...t, ...this.project(t.x, t.z, 2048) })).filter((t) => t.d < 1500);
    for (const X of this.exits) {
      const style = X.dead ? 'faded' : 'guide';
      for (const dir of [1, -1]) {
        const g = X.s - dir * S.ramp.gore;
        const nm = X.name;
        place(g - dir * MI, dir, 3.2, style, [`EXIT ${X.number}`, nm, '1 MILE'], `${X.id}-${dir > 0 ? 'E' : 'W'}-1`);
        place(g - dir * MI / 2, dir, 3.2, style, [`EXIT ${X.number}`, nm, '1/2 MILE'], `${X.id}-${dir > 0 ? 'E' : 'W'}-half`);
        place(g + dir * 18, dir, 6.5, style, [`EXIT ${X.number}`, nm, X.dead ? 'NO SERVICES' : X.tags?.filter((t) => t !== 'unknown').slice(0, 3).join(' · ').toUpperCase() || ''], `${X.id}-${dir > 0 ? 'E' : 'W'}-gore`, 6.4, 3.4);
        // Past the on-ramp: how far to what is next, in game miles along this road.
        const sd = X.s + dir * (S.ramp.gore + S.ramp.aux + S.ramp.taper + 350);
        const ahead = [...this.exits.filter((o) => (o.s - sd) * dir > 400).sort((a, b) => (a.s - b.s) * dir).slice(0, 1).map((o) => [o.name, Math.abs(o.s - sd)]),
          ...towns.filter((t) => (t.s - sd) * dir > 400).sort((a, b) => (a.s - b.s) * dir).slice(0, 2).map((t) => [t.name, Math.abs(t.s - sd)])];
        if (ahead.length) place(sd, dir, 3.2, 'guide', ahead.map(([n, m]) => `${n}  ${miles(m)}`), `${X.id}-${dir > 0 ? 'E' : 'W'}-dist`, 7.8, 3.6);
      }
    }
    // Leaving Phoenix on Route 66: the interstate shield and the miles to the next places.
    for (const dir of [1, -1]) {
      const s0 = dir > 0 ? this.sIslE + 420 : this.sIslW - 420;
      const ahead = [...this.exits.filter((o) => (o.s - s0) * dir > 0).sort((a, b) => (a.s - b.s) * dir).slice(0, 1).map((o) => [o.name, Math.abs(o.s - s0)]),
        ...towns.filter((t) => (t.s - s0) * dir > 400).sort((a, b) => (a.s - b.s) * dir).slice(0, 1).map((t) => [t.name, Math.abs(t.s - s0)])];
      place(s0, dir, 3.2, 'guide', [`I-10 ${dir > 0 ? 'EAST' : 'WEST'} · ${this.road.nickname}`, ...ahead.map(([n, m]) => `${n}  ${miles(m)}`)], `phx-${dir > 0 ? 'E' : 'W'}`, 8.6, 4.0);
    }
    // State lines along the corridor.
    let prev = this.stateAt(this.cl.x[0], this.cl.z[0]);
    for (let s = 200; s < this.cl.L; s += 100) {
      const f = this.at(s), st = this.stateAt(f.x, f.z);
      if (st && prev && st !== prev && !inIsland(f.x, f.z, 400)) {
        place(s + 120, 1, 3.2, 'state', ['STATE LINE', `${st}`, 'NO LAW BUT THE ROAD'], `state-${st}-E`, 6.4, 3.2);
        place(s - 120, -1, 3.2, 'state', ['STATE LINE', `${prev}`, 'NO LAW BUT THE ROAD'], `state-${prev}-W`, 6.4, 3.2);
      }
      if (st) prev = st;
    }
    // The dust wall: the last warning before the edge of the world.
    for (const dir of [1, -1]) {
      // Arc length where the road meets the fade, from each end.
      let s = dir > 0 ? this.cl.L : 0;
      for (let k = 0; k < this.cl.n; k++) { const i = dir > 0 ? this.cl.n - 1 - k : k; if (Math.hypot(this.cl.x[i], this.cl.z[i]) < S.dustWall - S.dustFade - 600) { s = this.cl.s[i]; break; } }
      if ((dir > 0 && s < this.cl.L - 100) || (dir < 0 && s > 100)) place(s, dir, 3.2, 'warn', ['DUST WALL AHEAD', 'NOTHING PAST HERE', 'TURN BACK'], `dust-${dir > 0 ? 'E' : 'W'}`, 6.4, 3.2);
    }
    // Mileposts: every game mile on each side, numbered from the west end of the corridor (they carry no face).
    this.mileposts = [];
    for (let m = 1; m * MI < this.cl.L; m++) for (const dir of [1, -1]) {
      const f = this.at(m * MI);
      if (inIsland(f.x, f.z, 60)) continue;
      const u = dir * (this.section(m * MI).out + 1.6);
      this.mileposts.push({ x: f.x + f.nx * u, z: f.z + f.nz * u, h: Math.atan2(-f.tx * dir, -f.tz * dir), mile: m });
    }
  }

  // ---- per-chunk feature buckets: everything a chunk must clip against or own ----------------------------------------
  bucketFeatures() {
    const B = (this.chunkFeat = new Map());
    const add = (x0, z0, x1, z1, f) => {
      for (let cx = chunkOf(x0); cx <= chunkOf(x1); cx++) for (let cz = chunkOf(z0); cz <= chunkOf(z1); cz++) {
        const k = `${cx},${cz}`; let b = B.get(k);
        if (!b) B.set(k, (b = { ribbons: [], pieces: [], rails: [], structs: [], buildings: [], signs: [], stops: [], posts: [] }));
        b[f.list].push(f.item);
      }
    };
    for (const r of this.ribbons) add(r.x0, r.z0, r.x1, r.z1, { list: 'ribbons', item: r });
    for (const p of this.pieces) add(p.x0, p.z0, p.x1, p.z1, { list: 'pieces', item: p });
    for (const r of this.rails) {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const q of r.pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
      r.x0 = x0; r.z0 = z0; r.x1 = x1; r.z1 = z1;
      add(x0 - 2, z0 - 2, x1 + 2, z1 + 2, { list: 'rails', item: r });
    }
    for (const s of this.structs) { const e = Math.max(Math.abs(s.sa), Math.abs(s.su)); add(s.x - e, s.z - e, s.x + e, s.z + e, { list: 'structs', item: s }); }
    for (const b of this.buildings) add(b.x0 - 3, b.z0 - 3, b.x1 + 3, b.z1 + 3, { list: 'buildings', item: b });
    for (const s of this.signs) add(s.x - 6, s.z - 6, s.x + 6, s.z + 6, { list: 'signs', item: s });
    for (const s of this.stops) add(s.x - 6, s.z - 6, s.x + 6, s.z + 6, { list: 'stops', item: s });
    for (const m of this.mileposts) add(m.x, m.z, m.x, m.z, { list: 'posts', item: m });
    // Relief pieces bucketed at 256 m for the per-vehicle height query.
    this.reliefBuckets = new Map();
    for (const p of this.pieces) for (let cx = chunkOf(p.x0); cx <= chunkOf(p.x1); cx++) for (let cz = chunkOf(p.z0); cz <= chunkOf(p.z1); cz++) {
      const k = cx * 100003 + cz; let b = this.reliefBuckets.get(k); if (!b) this.reliefBuckets.set(k, (b = [])); b.push(p);
    }
  }
  featuresOf(cx, cz) { return this.chunkFeat.get(`${cx},${cz}`) ?? null; }

  // ---- the ride-height relief of ramps, fills and the deck ----------------------------------------------------------
  // y: how high the asker is now (a car's ride height, a person's last ground). Fills are solid ground, so they count
  // whatever y is; the deck over the interstate is open below, so it counts only for someone already up near it.
  nearRelief(x, z) { return this.reliefBuckets.get(chunkOf(x) * 100003 + chunkOf(z)) ?? null; }
  heightAt(x, z, y = 0) {
    const list = this.nearRelief(x, z);
    if (!list) return 0;
    let best = 0;
    for (let k = 0; k < list.length; k++) {
      const p = list[k];
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      const h = p.kind === 'cross' ? this.crossHeight(p, x, z, y) : this.ribbonHeight(p, x, z);
      if (h > best) best = h;
    }
    return best;
  }
  crossHeight(p, x, z, y) {
    const X = p.exit, a = (x - X.x) * X.tx + (z - X.z) * X.tz, u = (x - X.x) * X.nx + (z - X.z) * X.nz;
    if (Math.abs(u) > STREAM.crossRoad.reach + 2) return 0;
    const h = X.hx(u), aa = Math.abs(a);
    if (Math.abs(u) <= p.deck) return aa <= p.halfW + 0.5 && y > h - 2.2 ? h : 0; // the deck: only for those already up
    if (aa <= p.halfW) return h;
    const sl = aa - p.halfW;
    return sl < 2 * h ? h - sl / 2 : 0; // 2:1 side slopes
  }
  ribbonHeight(p, x, z) {
    const r = p.rib;
    let best = Infinity, bi = 0, bt = 0;
    for (let i = 1; i < r.n; i++) {
      if (r.y[i] < 0.2 && r.y[i - 1] < 0.2) continue; // flat: the open ground carries it
      segPoint(x, z, r.x[i - 1], r.z[i - 1], r.x[i], r.z[i], _sp);
      if (_sp.d < best) { best = _sp.d; bi = i; bt = _sp.t; }
    }
    if (best === Infinity) return 0;
    const h = r.y[bi - 1] + (r.y[bi] - r.y[bi - 1]) * bt - 0.04;
    if (h <= 0) return 0;
    if (best <= p.halfW) return h;
    const sl = best - p.halfW;
    return sl < 2 * h ? h - sl / 2 : 0;
  }

  // ---- places and names --------------------------------------------------------------------------------------------
  // locate: a town, an exit (by name, id or number) or an exit's community. Phoenix is the island at the origin.
  locate(name) {
    const q = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const t = this.towns.find((x) => norm(x.id) === q || norm(x.name) === q) ?? this.towns.find((x) => norm(x.name).startsWith(q));
    if (t) return { kind: t.kind === 'city' ? 'city' : 'town', id: t.id, name: t.name, x: t.x, z: t.z, built: !!t.built || t.id === 'phoenix', inP1: !!t.built || t.id === 'phoenix' };
    const X = this.exits.find((x) => norm(x.name) === q || norm(x.id) === q || `exit ${x.number}` === q);
    if (X) return { kind: 'exit', id: X.id, name: X.name, x: X.x, z: X.z, built: true, inP1: true, community: X.community ? { x: X.dest.x, z: X.dest.z } : null };
    const row = this.data.exits.find((x) => norm(x.name) === q || norm(x.id) === q);
    if (row) { const [x, z] = toWorld(row.pos); return { kind: 'exit', id: row.id, name: row.name, x, z, built: false, inP1: false }; }
    return null;
  }

  // What the HUD street sign says out here (city.js answers inside the island).
  nameAt(x, z) {
    // The HUD asks every frame: the answer only changes when you have moved a few metres.
    if (Math.abs(x - this._nx) < 4 && Math.abs(z - this._nz) < 4) return this._nn;
    this._nx = x; this._nz = z;
    return (this._nn = this.nameAtNow(x, z));
  }
  nameAtNow(x, z) {
    const pr = this.project(x, z, 2048);
    for (const X of this.exits) {
      if (Math.hypot(x - X.dest.x, z - X.dest.z) < 260 && !X.dead) return X.name;
      if (Math.abs(pr.s - X.s) < 700 && pr.d > 14 && pr.d < 340) return `EXIT ${X.number} · ${X.name}`;
    }
    for (const t of this.towns) if (t.built && Math.hypot(x - t.x, z - t.z) < 800) return t.name;
    if (pr.d < 16) return `I-10 ${pr.side > 0 ? 'EAST' : 'WEST'} · MILE ${Math.floor(pr.s / STREAM.mile)}`;
    const b = this.biomeAt(x, z);
    return b === 'm' ? 'THE HIGH ROCK' : b === 'f' ? 'THE SCRUBLANDS' : b === 'u' ? 'THE DEAD SPRAWL' : b === 'w' ? 'A DRY RIVERBED' : 'THE OPEN DESERT';
  }
  regionAt(x, z) { return this.stateAt(x, z) ?? 'NO MAN\'S LAND'; }
}
