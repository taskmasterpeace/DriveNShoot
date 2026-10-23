// L1 WATER and its L2 crossings in the streamed world (docs/design/WEB_RIVERS.md; rows: data/water.js).
//
//   Rivers      every river, creek, canal and wash row resampled every 8 m, bucketed per 256 m chunk; every lake and
//               playa as a polygon with an inside mask. A pure function of the rows, the seed's world (towns, exits:
//               the clear zones) and the ground (flat, or the real terrain when that flag is on).
//   sample()    THE query, allocation-free: at (x, z) the water depth, the carved ground (the bed, for drawing), the
//               floor a mover stands on (a wader's feet, a swimmer's surface), the water's surface, which body.
//   depthAt()   THE WATER AUTHORITY outside the island (world/water.js asks it past |x|,|z| 464): 0 on dry land, on a
//               bridge deck for someone up on it, and inside a culvert's fill.
//   plan()      L2: every road that crosses a body gets a DECK (water deeper than `ford`, or ground more than `gorge`
//               below the road), a CULVERT (a dry wash under the interstate) or a FORD (the road dips through), with
//               piers, parapets, approach fills and guardrails as WorldIndex features every chunk clips against.
//
// Heights. G0 is the ground before water (0, or the terrain's ground with the road bed and pads cut and filled). A
// river's surface Y and a wash's bed level are absolute (flat: G0 - drop; terrain: the lowest land across the channel,
// never rising downstream). Everything handed to the engine is relative to G0 at that point (bedRel, floorRel <= 0), the
// way every other relief in the streamed world is (WorldIndex.heightAt = G0 + relief).
import { WATER, WATER_ROWS } from '../data/water.js';
import { C, chunkOf } from './geo.js';

const STEP = 8;            // resample step along a river (m)
const REACH = 60;          // bucket reach past a channel's edge: the widest bank a carve can need (m)
const MAX_CARVE = 18;      // m: a carve never cuts deeper than this below the land (a fold of the strip map, not a canyon)
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const bkey = (cx, cz) => cx * 100003 + cz;
const EMPTY_RIB = { n: 0, x: [], z: [], y: [], wl: [], wr: [] };
const _sp = { t: 0, d: 0 };
function segPoint(px, pz, ax, az, bx, bz, out) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  out.t = t; out.d = Math.hypot(px - ax - dx * t, pz - az - dz * t);
  return out;
}
// Segment-segment intersection: the parameters (ta on a, tb on b) or null.
function segX(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const ta = ((cx - ax) * sz - (cz - az) * sx) / den, tb = ((cx - ax) * rz - (cz - az) * rx) / den;
  return ta >= 0 && ta <= 1 && tb >= 0 && tb <= 1 ? [ta, tb] : null;
}
// A ribbon record (the shape WorldIndex's ribbons have) for an approach fill.
function rib(id, pts, halfW) {
  const n = pts.length, x = new Float64Array(n), z = new Float64Array(n), y = new Float64Array(n), s = new Float64Array(n), wl = new Float64Array(n), wr = new Float64Array(n);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, ymax = 0;
  for (let i = 0; i < n; i++) {
    x[i] = pts[i].x; z[i] = pts[i].z; y[i] = pts[i].y; wl[i] = wr[i] = halfW;
    if (i) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
    const w = halfW + 2 * y[i] + 2;
    x0 = Math.min(x0, x[i] - w); x1 = Math.max(x1, x[i] + w); z0 = Math.min(z0, z[i] - w); z1 = Math.max(z1, z[i] + w); ymax = Math.max(ymax, y[i]);
  }
  return { id, kind: 'fill', band: 'county', x, z, y, s, wl, wr, n, L: s[n - 1], x0, z0, x1, z1, ymax, water: true };
}

export class Rivers {
  constructor(W, rows = WATER_ROWS) {
    const t0 = performance.now();
    this.W = W; this.rows = rows; this.T = null;
    this.bodies = []; this.lakes = []; this.buckets = new Map();
    this.decks = []; this.culverts = []; this.fords = []; this.bridges = []; this.warnings = [];
    this.mainDecks = [];
    this.q = { depth: 0, bedRel: 0, floorRel: 0, surf: NaN, G0: 0, body: null, s: 0, u: 0, tx: 0, tz: 1, near: false, kind: '', dist: Infinity, dry: null };
    this.zones = [{ x: 0, z: 0, r: WATER.phoenixClear, id: 'phoenix' }];
    for (const t of W.towns ?? []) if (t.built) this.zones.push({ x: t.x, z: t.z, r: WATER.townClear, id: t.id });
    for (const X of W.exits ?? []) { this.zones.push({ x: X.x, z: X.z, r: WATER.exitClear, id: X.id }); if (X.community) this.zones.push({ x: X.dest.x, z: X.dest.z, r: WATER.exitClear, id: `${X.id} community` }); }
    for (const r of rows.rivers ?? []) this.addRiver(r);
    for (const l of rows.lakes ?? []) this.addLake(l);
    this.setGround(null);
    this.buildMs = +(performance.now() - t0).toFixed(1);
  }

  // 0 inside a clear zone (a town, an interchange, Phoenix's pad), 1 past 150 m outside it.
  zoneFade(x, z) {
    let f = 1;
    for (const Z of this.zones) { const d = Math.hypot(x - Z.x, z - Z.z) - Z.r; if (d < 150) f = Math.min(f, smooth(d / 150)); }
    return f;
  }
  bucket(x0, z0, x1, z1) {
    const out = [];
    for (let cx = chunkOf(x0); cx <= chunkOf(x1); cx++) for (let cz = chunkOf(z0); cz <= chunkOf(z1); cz++) {
      const k = bkey(cx, cz); let b = this.buckets.get(k);
      if (!b) this.buckets.set(k, (b = { rv: [], lk: [], dk: [], cv: [] }));
      out.push(b);
    }
    return out;
  }

  // ---- rows -> bodies -----------------------------------------------------------------------------------------------
  addRiver(row) {
    const P = row.pts, cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = cum[cum.length - 1], n = Math.max(2, Math.ceil(L / STEP) + 1);
    const x = new Float64Array(n), z = new Float64Array(n), s = new Float64Array(n), w = new Float64Array(n), d = new Float64Array(n), bed = new Float64Array(n), f = new Float64Array(n);
    const wet = (row.d ?? 0) > 0, kind = row.kind, seed = row.seed ?? 0;
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * L;
      while (j < P.length - 2 && cum[j + 1] < t) j++;
      const a = P[j], b = P[j + 1], u = (t - cum[j]) / (cum[j + 1] - cum[j] || 1);
      x[i] = a[0] + (b[0] - a[0]) * u; z[i] = a[1] + (b[1] - a[1]) * u; s[i] = t;
      const wa = a[2] ?? row.w, wb = b[2] ?? row.w, da = a[3] ?? row.d ?? 0, db = b[3] ?? row.d ?? 0;
      // A river is never one width: a slow swell and narrowing along it (seeded, +-14%).
      const vary = 1 + 0.1 * Math.sin(t / 310 + seed) + 0.04 * Math.sin(t / 97 + seed * 1.7);
      const fade = this.zoneFade(x[i], z[i]);
      f[i] = fade;
      w[i] = (wa + (wb - wa) * u) * vary * (0.3 + 0.7 * fade);
      d[i] = (da + (db - da) * u) * fade;
      bed[i] = (row.bed ?? 0) * fade;
    }
    // Fords: a gravel bar where the depth comes up to f.d over f.len (12 m to ease in and out).
    for (const fd of row.fords ?? []) {
      const sf = cum[Math.max(0, Math.min(P.length - 1, fd.i))];
      for (let i = 0; i < n; i++) { const k = smooth((Math.abs(s[i] - sf) - fd.len / 2) / 12); d[i] = Math.min(d[i], fd.d + (d[i] - fd.d) * k); }
      const fi = Math.round(sf / (L / (n - 1)));
      this.fords.push({ id: `${row.id}-ford-${fd.i}`, river: row.id, name: row.name, kind: 'river ford', x: x[Math.min(n - 1, fi)], z: z[Math.min(n - 1, fi)], d: fd.d, len: fd.len, road: null });
    }
    const tx = new Float64Array(n), tz = new Float64Array(n);
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = x[b] - x[a], dz = z[b] - z[a], l = Math.hypot(dx, dz) || 1; tx[i] = dx / l; tz[i] = dz / l; }
    const drop = WATER.drop[kind] ?? 1, bankRun = WATER.bankRun[kind] ?? 2.5;
    const body = { row, id: row.id, name: row.name ?? row.id, kind, wet, n, x, z, s, w, d, bed, f, tx, tz, Y: new Float64Array(n), drop, bankRun, L, clearance: WATER.clearance[kind] ?? 0 };
    this.bodies.push(body);
    // Buckets: each segment in every chunk its channel and banks reach.
    const per = new Map();
    for (let i = 0; i < n - 1; i++) {
      if (f[i] <= 0 && f[i + 1] <= 0) continue;
      const r = Math.max(w[i], w[i + 1]) / 2 + REACH;
      for (const B of this.bucket(Math.min(x[i], x[i + 1]) - r, Math.min(z[i], z[i + 1]) - r, Math.max(x[i], x[i + 1]) + r, Math.max(z[i], z[i + 1]) + r)) {
        let e = per.get(B); if (!e) { per.set(B, (e = { b: body, segs: [] })); B.rv.push(e); }
        e.segs.push(i);
      }
    }
  }

  addLake(row) {
    const P = row.pts, n = P.length;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const inside = (px, pz) => { let c = false; for (let i = 0, k = n - 1; i < n; k = i++) { const [ax, az] = P[i], [bx, bz] = P[k]; if ((az > pz) !== (bz > pz) && px < ((bx - ax) * (pz - az)) / (bz - az) + ax) c = !c; } return c; };
    // The inside mask at 8 m, filled by scanlines (each row's crossings of the ring, sorted, spans between pairs).
    const M = 8, mw = Math.ceil((x1 - x0) / M) + 1, mh = Math.ceil((z1 - z0) / M) + 1, mask = new Uint8Array(mw * mh), xs = [];
    for (let j = 0; j < mh; j++) {
      const pz = z0 + j * M; xs.length = 0;
      for (let i = 0, k = n - 1; i < n; k = i++) { const [ax, az] = P[i], [bx, bz] = P[k]; if ((az > pz) !== (bz > pz)) xs.push(((bx - ax) * (pz - az)) / (bz - az) + ax); }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) { const i0 = Math.max(0, Math.ceil((xs[q] - x0) / M)), i1 = Math.min(mw - 1, Math.floor((xs[q + 1] - x0) / M)); for (let i = i0; i <= i1; i++) mask[j * mw + i] = 1; }
    }
    const kind = row.kind, dry = kind === 'playa', shelf = row.shelf ?? 0.06;
    const lake = { row, id: row.id, name: row.name ?? row.id, kind, wet: !dry, d: row.d, shelf, P, x0, z0, x1, z1, M, mw, mh, mask, Y: 0, drop: dry ? 0.3 : WATER.drop.lake, bankRun: WATER.bankRun.lake, clearance: WATER.clearance.lake, inside };
    this.lakes.push(lake);
    // Edges bucketed with the shelf's reach (deeper than d past it), so a query far from every edge is the full depth.
    const reach = (dry ? 20 : row.d / shelf) + REACH;
    const per = new Map();
    for (let i = 0; i < n; i++) {
      const [ax, az] = P[i], [bx, bz] = P[(i + 1) % n];
      for (const B of this.bucket(Math.min(ax, bx) - reach, Math.min(az, bz) - reach, Math.max(ax, bx) + reach, Math.max(az, bz) + reach)) {
        let e = per.get(B); if (!e) { per.set(B, (e = { l: lake, edges: [] })); B.lk.push(e); }
        e.edges.push(i);
      }
    }
    // Chunks wholly inside (no edge near): the lake still answers there.
    for (const B of this.bucket(x0, z0, x1, z1)) if (!per.has(B)) { const e = { l: lake, edges: [] }; per.set(B, e); B.lk.push(e); }
  }
  lakeInside(l, x, z) {
    const i = Math.round((x - l.x0) / l.M), j = Math.round((z - l.z0) / l.M);
    if (i < 0 || j < 0 || i >= l.mw || j >= l.mh) return false;
    return l.mask[j * l.mw + i] === 1;
  }

  // ---- the ground under the water: flat, or the real land (the terrain flag) --------------------------------------
  setGround(T) {
    this.T = T ?? null;
    const land = T ? (x, z) => T.landAt(x, z) : () => 0;
    for (const b of this.bodies) {
      const n = b.n, lm = (this._lm && this._lm.length >= n) ? this._lm : (this._lm = new Float64Array(Math.max(n, 4096))), mn = (this._mn && this._mn.length >= n) ? this._mn : (this._mn = new Float64Array(Math.max(n, 4096)));
      for (let i = 0; i < n; i++) {
        if (!T) { lm[i] = 0; continue; }
        // The land under the channel: a river or a wash finds the lowest of its bed (its valley); a canal is dug into the
        // land where it runs (along the contours, on the ground's own level).
        const nx = -b.tz[i], nz = b.tx[i], hw = b.w[i] / 2, c = land(b.x[i], b.z[i]);
        lm[i] = b.kind === 'canal' ? c : Math.min(c, land(b.x[i] + nx * hw, b.z[i] + nz * hw), land(b.x[i] - nx * hw, b.z[i] - nz * hw));
      }
      if (T) {
        // Smoothed along the channel: the lowest within +-96 m (the valley floor, not one fold of the strip map), then a
        // mean over +-200 m (a surface that runs level, not a staircase).
        for (let i = 0; i < n; i++) { let m = Infinity; for (let k = Math.max(0, i - 12); k <= Math.min(n - 1, i + 12); k++) if (lm[k] < m) m = lm[k]; mn[i] = m; }
        for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - 25); k <= Math.min(n - 1, i + 25); k++) { s += mn[k]; c++; } lm[i] = s / c; }
      }
      // A wet channel's surface sits `drop` under it; a wash's bed `bed` under it. Both fade to the land at a clear zone.
      for (let i = 0; i < n; i++) b.Y[i] = lm[i] - (b.wet ? b.drop : b.bed[i]) * b.f[i];
    }
    for (const l of this.lakes) {
      let lo = Infinity;
      if (T) { for (let j = 0; j < l.mh; j += 4) for (let i = 0; i < l.mw; i += 4) if (l.mask[j * l.mw + i]) lo = Math.min(lo, land(l.x0 + i * l.M, l.z0 + j * l.M)); }
      l.Y = (T && lo < Infinity ? lo : 0) - l.drop;
    }
  }

  // ---- THE QUERY ---------------------------------------------------------------------------------------------------
  // Fills and returns this.q (reused: read it before the next call). Culverts keep the road's fill whole.
  sample(x, z) {
    const q = this.q;
    q.depth = 0; q.bedRel = 0; q.floorRel = 0; q.surf = NaN; q.body = null; q.near = false; q.kind = ''; q.dist = Infinity; q.s = 0; q.u = 0; q.dry = null; q.edge = -Infinity;
    const B = this.buckets.get(bkey(chunkOf(x), chunkOf(z)));
    q.G0 = 0;
    if (!B) return q;
    for (let k = 0; k < B.cv.length; k++) if (this.inCulvert(B.cv[k], x, z)) return q;
    const T = this.T, G0 = T ? T.at(x, z) : 0;
    q.G0 = G0;
    let ground = G0, sd = Infinity;
    for (let k = 0; k < B.rv.length; k++) {
      const e = B.rv[k], b = e.b, segs = e.segs;
      let best = Infinity, bi = -1, bt = 0;
      for (let m = 0; m < segs.length; m++) { const i = segs[m]; segPoint(x, z, b.x[i], b.z[i], b.x[i + 1], b.z[i + 1], _sp); if (_sp.d < best) { best = _sp.d; bi = i; bt = _sp.t; } }
      if (bi < 0) continue;
      const f = b.f[bi] + (b.f[bi + 1] - b.f[bi]) * bt;
      if (f <= 0) continue;
      const hw = (b.w[bi] + (b.w[bi + 1] - b.w[bi]) * bt) / 2;
      if (best > hw + REACH) continue;
      q.near = true;
      const Y = b.Y[bi] + (b.Y[bi + 1] - b.Y[bi]) * bt;
      let g, dep = 0;
      if (b.wet) {
        const dc = b.d[bi] + (b.d[bi + 1] - b.d[bi]) * bt, t = best / hw;
        // A shelf from the water's edge to full depth (linear: the ground's 8 m grid then puts the shoreline where it
        // should be, not on its own diagonal), then the bed; a canal drops at its concrete walls.
        if (best < hw) { dep = b.kind === 'canal' ? dc * Math.min(1, (hw - best) / 1.5) : dc * Math.min(1, (hw - best) / Math.max(3, hw * 0.45)) * (1 - 0.15 * t * t); g = Y - dep; }
        else g = Y + (best - hw) / b.bankRun;
      } else {
        const bd = b.bed[bi] + (b.bed[bi + 1] - b.bed[bi]) * bt, hb = Math.max(2, hw - bd * b.bankRun);
        g = Y + Math.max(0, best - hb) / b.bankRun;
        if (best < hw + 1 && (q.dry === null || best < sd)) { q.dry = b; sd = best; }
      }
      if (g < G0 - MAX_CARVE) g = G0 - MAX_CARVE;
      if (g < ground) ground = g;
      if (b.wet) {
        const real = best < hw ? Y - Math.min(G0, g) : 0;
        if (real > q.depth || (q.body === null && best < q.dist) || (q.depth === 0 && real === 0 && best < q.dist)) {
          if (real >= q.depth) {
            q.depth = real; q.body = b; q.surf = Y; q.dist = best; q.kind = b.kind; q.edge = hw - best;
            q.s = b.s[bi] + (b.s[bi + 1] - b.s[bi]) * bt; q.tx = b.tx[bi]; q.tz = b.tz[bi];
            q.u = (x - b.x[bi] - (b.x[bi + 1] - b.x[bi]) * bt) * -b.tz[bi] + (z - b.z[bi] - (b.z[bi + 1] - b.z[bi]) * bt) * b.tx[bi];
          }
        }
      }
    }
    for (let k = 0; k < B.lk.length; k++) {
      const e = B.lk[k], l = e.l, edges = e.edges;
      let best = Infinity;
      for (let m = 0; m < edges.length; m++) { const i = edges[m], a = l.P[i], c = l.P[(i + 1) % l.P.length]; segPoint(x, z, a[0], a[1], c[0], c[1], _sp); if (_sp.d < best) best = _sp.d; }
      const inside = this.lakeInside(l, x, z);
      if (!inside && best > REACH) continue;
      q.near = true;
      let g, dep = 0;
      if (inside) { dep = l.wet ? Math.min(l.d, best * l.shelf) : l.drop; g = l.Y - (l.wet ? dep : 0); }
      else g = l.Y + best / l.bankRun;
      if (g < G0 - MAX_CARVE) g = G0 - MAX_CARVE;
      if (g < ground) ground = g;
      if (!l.wet) { if (inside) q.dry = l; continue; }
      const real = inside ? l.Y - Math.min(G0, g) : 0;
      if (real > q.depth || (q.body === null && !inside)) {
        q.depth = real; q.body = l; q.surf = l.Y; q.kind = l.kind; q.dist = inside ? 0 : best; q.s = 0; q.u = 0; q.tx = 0; q.tz = 1; q.edge = inside ? best : -best;
      }
    }
    q.bedRel = ground - G0;
    if (q.depth > 0) {
      const sink = q.depth < WATER.swimDepth ? Math.min(WATER.wadeSink, q.depth * 0.5) : 0;
      q.floorRel = q.surf - sink - G0;
    } else q.floorRel = q.bedRel;
    return q;
  }

  // Is (x, z) on any water-related ground at all (cheap: one bucket lookup)?
  near(x, z) { return this.buckets.has(bkey(chunkOf(x), chunkOf(z))); }
  inChunk(cx, cz) { return this.buckets.has(bkey(cx, cz)); }
  nearFord(x, z, r) { for (const f of this.fords) if (Math.abs(f.x - x) < r && Math.abs(f.z - z) < r) return f; return null; }
  // Every dry wash segment whose midpoint is in chunk (cx, cz) and that is not under a culvert's fill: its two ends, the
  // bed level and the flat bed's half-width at each, the right normals, the arc lengths (chunkgen draws the bed's strip).
  washStrips(cx, cz, fn) {
    const B = this.buckets.get(bkey(cx, cz));
    if (!B) return;
    const x0 = cx * C, z0 = cz * C;
    for (const e of B.rv) {
      const b = e.b;
      if (b.wet) continue;
      for (const i of e.segs) {
        const mx = (b.x[i] + b.x[i + 1]) / 2, mz = (b.z[i] + b.z[i + 1]) / 2;
        if (mx < x0 || mx >= x0 + C || mz < z0 || mz >= z0 + C || b.f[i] <= 0.3 || b.f[i + 1] <= 0.3) continue;
        if (this.sample(mx, mz).dry !== b) continue; // a culvert's fill, or another channel deeper here
        const hb = (k) => Math.max(2, b.w[k] / 2 - b.bed[k] * b.bankRun);
        fn(b.x[i], b.z[i], b.x[i + 1], b.z[i + 1], b.Y[i], b.Y[i + 1], hb(i), hb(i + 1), -b.tz[i], b.tx[i], -b.tz[i + 1], b.tx[i + 1], b.s[i], b.s[i + 1]);
      }
    }
  }
  // Points along every channel's banks in chunk (cx, cz), every ~`step` m: fn(x, z, body, u) with u the signed offset
  // from the centreline (for brush along washes and thickets along rivers). Pure: the same points every time.
  banks(cx, cz, step, fn) {
    const B = this.buckets.get(bkey(cx, cz));
    if (!B) return;
    const x0 = cx * C, z0 = cz * C;
    for (const e of B.rv) {
      const b = e.b;
      for (const i of e.segs) {
        const L = b.s[i + 1] - b.s[i];
        for (let t = 0; t < L; t += step) {
          const f = t / L, x = b.x[i] + (b.x[i + 1] - b.x[i]) * f, z = b.z[i] + (b.z[i + 1] - b.z[i]) * f;
          if (x < x0 - 30 || x > x0 + C + 30 || z < z0 - 30 || z > z0 + C + 30 || b.f[i] <= 0.5) continue;
          const hw = b.w[i] / 2;
          for (const sg of [-1, 1]) fn(x, z, b, sg * hw, -b.tz[i] * sg, b.tx[i] * sg, b.s[i] + t);
        }
      }
    }
  }

  // ---- decks and culverts (L2) --------------------------------------------------------------------------------------
  // A deck or culvert record holds its road's axis as a slice of points (ax: x, z, s) and an extent along it.
  axisPoint(r, x, z) {
    const A = r.ax;
    let best = Infinity, bi = -1, bt = 0;
    for (let i = 0; i < A.n - 1; i++) { segPoint(x, z, A.x[i], A.z[i], A.x[i + 1], A.z[i + 1], _sp); if (_sp.d < best) { best = _sp.d; bi = i; bt = _sp.t; } }
    const o = (this._ap ??= { s: 0, d: Infinity });
    if (bi < 0) { o.d = Infinity; return o; }
    o.s = A.s[bi] + (A.s[bi + 1] - A.s[bi]) * bt; o.d = best;
    return o;
  }
  inCulvert(c, x, z) {
    if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) return false;
    const o = this.axisPoint(c, x, z);
    return o.d <= c.halfW && o.s >= c.s0 && o.s <= c.s1;
  }
  // The deck at (x, z): its top relative to the ground there, if someone at absolute height y is up on it (or y is not
  // given: the 2-D question "is this the deck"); -1 otherwise.
  deckAt(x, z, y) {
    const B = this.buckets.get(bkey(chunkOf(x), chunkOf(z)));
    if (!B || !B.dk.length) return -1;
    for (let k = 0; k < B.dk.length; k++) {
      const D = B.dk[k];
      if (x < D.x0 || x > D.x1 || z < D.z0 || z > D.z1) continue;
      const o = this.axisPoint(D, x, z);
      if (o.d > D.halfW + 0.6 || o.s < D.s0 || o.s > D.s1 || o.d < D.gap - 0.2) continue;
      const h = D.lift;
      if (y === undefined) return h;
      const g0 = this.T ? this.T.at(x, z) : 0;
      if (y - g0 > h - 2.2) return h;
    }
    return -1;
  }
  // Movers' relief for a deck piece (WorldIndex.rampAt): the deck's height, or -1 (open below / off it).
  deckRel(p, x, z, yRel) {
    const D = p.deck, o = this.axisPoint(D, x, z);
    if (o.d > D.halfW + 0.6 || o.s < D.s0 || o.s > D.s1 || o.d < D.gap - 0.2) return -1;
    return yRel > D.lift - 2.2 ? D.lift : -1;
  }

  // ---- THE WATER AUTHORITY (world/water.js asks past the island) ---------------------------------------------------
  // y: the asker's absolute height (a deck counts only for someone up on it); undefined = 2-D (a deck is dry ground).
  // Two sources answer, the deeper wins: L1's rows (sample) and a region's own water (Florida's sea, lagoon, canals and
  // sloughs: world/regions.js, plugged in as this.region by WorldIndex). ignoreDeck: the water under a deck (drawing).
  depthAt(x, z, y, ignoreDeck = false) {
    if (!ignoreDeck && this.deckAt(x, z, y) >= 0) return 0;
    const d = this.sample(x, z).depth, r = this.region ? this.region(x, z) : 0;
    return r > d ? r : d;
  }
  // The water's surface at (x, z), absolute, or NaN where there is no water near (a region's sheet lies on its flat
  // ground: 0).
  surfaceAt(x, z) {
    const q = this.sample(x, z);
    if (q.depth > 0 || q.near) return q.surf;
    return this.region && this.region(x, z) > 0 ? 0 : NaN;
  }
  // Keep scatter, poles and wrecks off the water, the banks and the bridges.
  keepOut(x, z, r = 0) {
    if (!this.near(x, z)) return false;
    if (this.deckAt(x, z) >= 0 || this.deckAt(x + r, z) >= 0 || this.deckAt(x - r, z) >= 0) return true;
    for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) { const q = this.sample(x + ox, z + oz); if (q.depth > 0 || q.bedRel < -0.25) return true; }
    return false;
  }
  // The mainline's deck lift at corridor arc length s (the approach fills ease in and out on a smoothstep).
  liftAt(s) {
    let h = 0;
    for (const D of this.mainDecks) {
      if (s < D.s0 - D.ramp || s > D.s1 + D.ramp) continue;
      const k = s < D.s0 ? smooth((s - (D.s0 - D.ramp)) / D.ramp) : s > D.s1 ? smooth((D.s1 + D.ramp - s) / D.ramp) : 1;
      h = Math.max(h, D.lift * k);
    }
    return h;
  }
  // On a deck or an approach fill of the mainline (signs and wrecks stay off; the road paint goes up).
  onBridge(s, margin = 0) { for (const D of this.mainDecks) if (s > D.s0 - D.ramp - margin && s < D.s1 + D.ramp + margin) return D; return null; }

  // ---- L2: the plan -------------------------------------------------------------------------------------------------
  // Every crossing of a road and a body, classified and built. Mutates W's non-mainline ribbons' heights (restored first
  // on a re-plan) and returns the features WorldIndex adds: { pieces, structs, rails }.
  plan(W) {
    this.decks = []; this.culverts = []; this.bridges = []; this.mainDecks = []; this.warnings = [];
    this.fords = this.fords.filter((f) => !f.road);
    for (const B of this.buckets.values()) { B.dk.length = 0; B.cv.length = 0; }
    const out = { pieces: [], structs: [], rails: [] };
    const cl = W.cl;
    // The axis of a road: the corridor centreline (the mainline) or a ribbon's own points.
    const mainAxis = { id: 'I-10', x: cl.x, z: cl.z, s: cl.s, n: cl.n, main: true, halfW: (s) => W.section(s).out + 1.2, buckets: W.clBuckets };
    const axes = [mainAxis];
    for (const rb of W.ribbons) {
      if (rb.mainline || rb.water) continue;
      rb.y0 ??= Float64Array.from(rb.y);
      rb.y.set(rb.y0); // a re-plan starts from the ribbon as it was laid
      axes.push({ id: rb.id, x: rb.x, z: rb.z, s: rb.s, n: rb.n, rb, halfW: () => Math.max(rb.wl[0], rb.wr[0]) + 0.8, interchange: rb.kind === 'ramp' || !!rb.deck || rb.kind === 'hwy' });
    }
    for (const A of axes) {
      const hits = [];
      // A short road's box first: only the channel segments inside it are tested against its points.
      let ax0 = -Infinity, ax1 = Infinity, az0 = -Infinity, az1 = Infinity;
      if (!A.main) { ax0 = Infinity; ax1 = -Infinity; az0 = Infinity; az1 = -Infinity; for (let i = 0; i < A.n; i++) { ax0 = Math.min(ax0, A.x[i]); ax1 = Math.max(ax1, A.x[i]); az0 = Math.min(az0, A.z[i]); az1 = Math.max(az1, A.z[i]); } }
      for (const b of this.bodies) {
        for (let i = 0; i < b.n - 1; i++) {
          if (b.f[i] <= 0 && b.f[i + 1] <= 0) continue;
          const bx0 = Math.min(b.x[i], b.x[i + 1]), bx1 = Math.max(b.x[i], b.x[i + 1]), bz0 = Math.min(b.z[i], b.z[i + 1]), bz1 = Math.max(b.z[i], b.z[i + 1]);
          if (bx1 < ax0 || bx0 > ax1 || bz1 < az0 || bz0 > az1) continue;
          const cand = A.main ? this.clSegs(W, bx0, bz0, bx1, bz1) : null;
          const lo = A.main ? 0 : 0, hi = A.main ? cand.length : A.n - 1;
          for (let m = lo; m < hi; m++) {
            const a = A.main ? cand[m] : m;
            if (!A.main && (Math.max(A.x[a], A.x[a + 1]) < bx0 || Math.min(A.x[a], A.x[a + 1]) > bx1 || Math.max(A.z[a], A.z[a + 1]) < bz0 || Math.min(A.z[a], A.z[a + 1]) > bz1)) continue;
            const hit = segX(A.x[a], A.z[a], A.x[a + 1], A.z[a + 1], b.x[i], b.z[i], b.x[i + 1], b.z[i + 1]);
            if (!hit) continue;
            const s = A.s[a] + (A.s[a + 1] - A.s[a]) * hit[0];
            if (hits.some((h) => h.b === b && Math.abs(h.s - s) < 30)) continue;
            hits.push({ b, i, s, x: A.x[a] + (A.x[a + 1] - A.x[a]) * hit[0], z: A.z[a] + (A.z[a + 1] - A.z[a]) * hit[0], sin: Math.abs((A.x[a + 1] - A.x[a]) * b.tz[i] - (A.z[a + 1] - A.z[a]) * b.tx[i]) / (Math.hypot(A.x[a + 1] - A.x[a], A.z[a + 1] - A.z[a]) || 1) });
          }
        }
      }
      for (const L of this.lakes) for (let a = 0; a < A.n - 1; a++) if (L.inside(A.x[a], A.z[a]) !== L.inside(A.x[a + 1], A.z[a + 1])) hits.push({ b: L, i: 0, s: A.s[a], x: A.x[a], z: A.z[a], sin: 1 });
      hits.sort((p, q) => p.s - q.s);
      for (const h of hits) this.crossing(W, A, h, out);
    }
    // Formation guards: the interstate keeps its road bed wherever a channel or a lake shore comes near it and no deck
    // spans it, so a wash running beside the road never undercuts the shoulder. Culvert-like records, 160 m at most each
    // (a sample inside one walks only its own few axis points).
    {
      const iv = [];
      const near = (x, z, r) => { const p = W.project(x, z, r + 80); if (p.d < r + W.section(p.s).out + 4) iv.push([p.s - r - 30, p.s + r + 30]); };
      // How far a channel's cut reaches: its half-width plus its banks, as deep as it cuts below the ground there (real
      // terrain: down from a road's fill to a valley floor, up to MAX_CARVE).
      const cut = (b, i) => Math.min(MAX_CARVE, Math.max(0.5, (this.T ? this.T.at(b.x[i], b.z[i]) : 0) - b.Y[i] + (b.wet ? b.d[i] : 0)));
      for (const b of this.bodies) for (let i = 0; i < b.n; i += 4) if (b.f[i] > 0) near(b.x[i], b.z[i], b.w[i] / 2 + cut(b, i) * b.bankRun + 4);
      for (const L of this.lakes) for (const [x, z] of L.P) near(x, z, 70);
      iv.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const v of iv) { const m = merged[merged.length - 1]; if (m && v[0] <= m[1]) m[1] = Math.max(m[1], v[1]); else merged.push([v[0], v[1]]); }
      for (const [a0, a1] of merged) {
        let spans = [[Math.max(0, a0), Math.min(cl.L, a1)]];
        for (const D of this.mainDecks) spans = spans.flatMap(([p, q]) => (q <= D.s0 || p >= D.s1 ? [[p, q]] : [[p, Math.min(q, D.s0)], [Math.max(p, D.s1), q]].filter(([u, v]) => v - u > 1)));
        for (const [p, q] of spans) for (let s = p; s < q; s += 160) {
          const e = Math.min(q, s + 160), hw = W.section((s + e) / 2).out + 3;
          const Gd = { id: `guard:${Math.round(s)}`, kind: 'guard', road: 'I-10', s0: s, s1: e, halfW: hw, ax: this.slice(mainAxis, s - 8, e + 8) };
          this.bbox(Gd, hw + 2); this.culverts.push(Gd);
          for (const B of this.bucket(Gd.x0, Gd.z0, Gd.x1, Gd.z1)) B.cv.push(Gd);
        }
      }
    }
    // Lift the non-mainline ribbons over their decks (the mainline's lift is read by WorldIndex.buildMainline).
    for (const D of this.decks) if (D.rb) for (let i = 0; i < D.rb.n; i++) D.rb.y[i] = D.rb.y0[i] + this.ribLift(D.rb, i);
    for (const D of this.decks) if (D.rb) { const r = D.rb; r.ymax = 0; for (let i = 0; i < r.n; i++) { const wd = Math.max(r.wl[i], r.wr[i]) + 2 * r.y[i] + 2; r.x0 = Math.min(r.x0, r.x[i] - wd); r.x1 = Math.max(r.x1, r.x[i] + wd); r.z0 = Math.min(r.z0, r.z[i] - wd); r.z1 = Math.max(r.z1, r.z[i] + wd); r.ymax = Math.max(r.ymax, r.y[i]); } }
    return out;
  }
  ribLift(rb, i) { let h = 0; for (const D of this.decks) if (D.rb === rb) { const s = rb.s[i]; if (s < D.s0 - D.ramp || s > D.s1 + D.ramp) continue; const k = s < D.s0 ? smooth((s - (D.s0 - D.ramp)) / D.ramp) : s > D.s1 ? smooth((D.s1 + D.ramp - s) / D.ramp) : 1; h = Math.max(h, D.lift * k); } return h; }
  clSegs(W, x0, z0, x1, z1) {
    const out = (this._cs ??= []); out.length = 0;
    const B = 1024;
    for (let bx = Math.floor((x0 - 8) / B); bx <= Math.floor((x1 + 8) / B); bx++) for (let bz = Math.floor((z0 - 8) / B); bz <= Math.floor((z1 + 8) / B); bz++) {
      const list = W.clBuckets.get(`${bx},${bz}`);
      if (list) for (const i of list) out.push(i);
    }
    return out;
  }

  // One crossing: measure it along the road, decide deck / culvert / ford, and build it.
  crossing(W, A, h, out) {
    const b = h.b, isLake = !!b.P;
    const at = (s) => { const i = Math.max(0, Math.min(A.n - 2, A.main ? Math.floor(s / 8) : this.axisIndex(A, s))); const f = Math.max(0, Math.min(1, (s - A.s[i]) / ((A.s[i + 1] - A.s[i]) || 1))); const x = A.x[i] + (A.x[i + 1] - A.x[i]) * f, z = A.z[i] + (A.z[i + 1] - A.z[i]) * f, tx = A.x[i + 1] - A.x[i], tz = A.z[i + 1] - A.z[i], l = Math.hypot(tx, tz) || 1; return { x, z, tx: tx / l, tz: tz / l, nx: -tz / l, nz: tx / l, i }; };
    const G = (x, z) => (this.T ? this.T.at(x, z) : 0);
    // Walk out from the crossing both ways while the road's width still has water under it, or ground more than `gorge`
    // below the road's own level.
    let maxDepth = 0, maxDrop = 0, sA = h.s, sB = h.s;
    const wetAt = (s) => {
      const p = at(s), road = G(p.x, p.z), hw = A.halfW(s);
      let any = false;
      for (let u = -hw; u <= hw + 0.01; u += Math.max(2, hw / 4)) {
        const x = p.x + p.nx * u, z = p.z + p.nz * u, q = this.sample(x, z);
        const drop = road - (q.G0 + q.bedRel);
        if (q.depth > 0.05) { any = true; maxDepth = Math.max(maxDepth, q.depth); }
        if (drop > WATER.gorge) { any = true; maxDrop = Math.max(maxDrop, drop); }
        if (q.bedRel < -0.3) any = true; // in the channel or on its banks: the crossing reaches this far
      }
      return any;
    };
    wetAt(h.s);
    for (let s = h.s; s > h.s - 700 && s > 0; s -= 2) { if (wetAt(s)) sA = s; else if (h.s - s > 6 && s < sA - 8) break; }
    for (let s = h.s; s < h.s + 700 && s < A.s[A.n - 1]; s += 2) { if (wetAt(s)) sB = s; else if (s - h.s > 6 && s > sB + 8) break; }
    const deck = maxDepth > WATER.ford || maxDrop > WATER.gorge;
    const name = b.name.replace(/^THE /, '');
    if (A.interchange) { this.warnings.push(`${b.id} crosses ${A.id} (an interchange piece): left at grade`); return; }
    if (deck) {
      const p = at(h.s), road = G(p.x, p.z);
      const surf = b.wet ? (isLake ? b.Y : b.Y[Math.min(b.n - 1, h.i)]) : road;
      const lift = b.wet ? Math.max(0, surf + b.clearance + WATER.deckThick - road) : 0; // a dry gorge: the deck at the road's own level
      const s0 = Math.max(0, sA - WATER.approach), s1 = Math.min(A.s[A.n - 1], sB + WATER.approach), ramp = Math.max(20, (1.5 * lift) / WATER.rampGrade);
      // Merge with a deck already on this road that the new one overlaps (a confluence, a braided bed).
      const prev = this.decks.find((D) => D.road === A.id && s0 < D.s1 + D.ramp && s1 > D.s0 - D.ramp);
      if (prev) { this.unbuild(prev, out); prev.s0 = Math.min(prev.s0, s0); prev.s1 = Math.max(prev.s1, s1); prev.lift = Math.max(prev.lift, lift); prev.ramp = Math.max(20, (1.5 * prev.lift) / WATER.rampGrade); prev.rivers.push(b.id); prev.name = `${prev.name.replace(/ BRIDGE$/, '')} & ${name} BRIDGE`; this.build(W, A, prev, at, out); return; }
      const D = { id: `bridge:${A.id}:${b.id}:${Math.round(h.s)}`, kind: 'deck', name: `${name} BRIDGE`, road: A.id, river: b.id, rivers: [b.id], x: h.x, z: h.z, s: h.s, s0, s1, lift, ramp, depth: +maxDepth.toFixed(2), drop: +maxDrop.toFixed(2), angle: +(Math.asin(Math.min(1, h.sin)) * 180 / Math.PI).toFixed(0),
        main: !!A.main, rb: A.rb ?? null, hp: WATER.deckHp, hpMax: WATER.deckHp, state: 'standing' };
      this.build(W, A, D, at, out);
      return;
    }
    if (!b.wet && A.main) {
      // A dry wash under the interstate: a culvert in a fill (the road at grade, headwalls either side).
      const bw = isLake ? 60 : b.w[Math.min(b.n - 1, h.i)], hw = A.halfW(h.s) + WATER.culvertMargin, along = Math.max(10, bw / Math.max(0.3, h.sin) / 2 + 20);
      const Cv = { id: `culvert:${A.id}:${b.id}:${Math.round(h.s)}`, kind: 'culvert', name: `${name} CULVERT`, road: A.id, river: b.id, x: h.x, z: h.z, s: h.s, s0: h.s - along, s1: h.s + along, halfW: hw, ax: this.slice(A, h.s - along - 16, h.s + along + 16) };
      this.bbox(Cv, hw + 2);
      this.culverts.push(Cv);
      for (const B of this.bucket(Cv.x0, Cv.z0, Cv.x1, Cv.z1)) B.cv.push(Cv);
      this.bridges.push(Cv);
      // Headwalls: a concrete face either side where the fill meets the wash, with the pipes' dark mouths.
      const bedRel = -Math.max(0.6, isLake ? b.drop : b.bed[Math.min(b.n - 1, h.i)]);
      for (const su of [-1, 1]) {
        const p = at(h.s), u = su * hw, rot = Math.atan2(p.tx, p.tz);
        out.structs.push({ water: true, x: p.x + p.nx * u, z: p.z + p.nz * u, y0: bedRel - 0.3, y1: 0.35, sa: along * 2 * 0.55, su: 0.6, rot, col: '#8a847a', tag: 'headwall', solid: true, base: 0 });
        for (const k of [-1, 0, 1]) out.structs.push({ water: true, x: p.x + p.nx * (u + su * 0.32) + p.tx * k * 2.6, z: p.z + p.nz * (u + su * 0.32) + p.tz * k * 2.6, y0: bedRel + 0.05, y1: bedRel + 1.15, sa: 1.5, su: 0.08, rot, col: '#1c1a17', tag: 'culvert', solid: false, base: 0 });
      }
      return;
    }
    // A ford: the road dips through (a county road over a wash, or shallow water anywhere).
    const Fd = { id: `ford:${A.id}:${b.id}:${Math.round(h.s)}`, kind: 'ford', name: `${name} FORD`, road: A.id, river: b.id, x: h.x, z: h.z, s: h.s, d: +maxDepth.toFixed(2) };
    this.fords.push(Fd); this.bridges.push(Fd);
    // Depth posts either side: white boards with black bands, the way every desert dip has them.
    const p = at(h.s);
    for (const su of [-1, 1]) for (const k of [-1, 1]) {
      const ext = (sB - sA) / 2 + 4, u = su * (A.halfW(h.s) + 0.8), c = p, x = c.x + c.nx * u + c.tx * k * ext, z = c.z + c.nz * u + c.tz * k * ext;
      out.structs.push({ water: true, x, z, y0: -0.2, y1: 1.6, sa: 0.18, su: 0.18, rot: Math.atan2(c.tx, c.tz), col: '#e8e4d8', tag: 'depthpost', solid: false, base: 0, onGround: true });
    }
  }
  axisIndex(A, s) { let lo = 0, hi = A.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A.s[m] <= s) lo = m; else hi = m; } return lo; }
  slice(A, s0, s1) {
    const i0 = Math.max(0, A.main ? Math.floor(s0 / 8) : this.axisIndex(A, s0)), i1 = Math.min(A.n - 1, (A.main ? Math.ceil(s1 / 8) : this.axisIndex(A, s1) + 1));
    const n = i1 - i0 + 1;
    return { x: A.x.subarray ? A.x.subarray(i0, i1 + 1) : A.x.slice(i0, i1 + 1), z: A.z.subarray ? A.z.subarray(i0, i1 + 1) : A.z.slice(i0, i1 + 1), s: A.s.subarray ? A.s.subarray(i0, i1 + 1) : A.s.slice(i0, i1 + 1), n };
  }
  bbox(r, pad) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < r.ax.n; i++) { x0 = Math.min(x0, r.ax.x[i]); x1 = Math.max(x1, r.ax.x[i]); z0 = Math.min(z0, r.ax.z[i]); z1 = Math.max(z1, r.ax.z[i]); }
    r.x0 = x0 - pad; r.z0 = z0 - pad; r.x1 = x1 + pad; r.z1 = z1 + pad;
  }
  unbuild(D, out) {
    for (const k of ['pieces', 'structs', 'rails']) { const keep = out[k].filter((f) => f.bridge !== D.id); out[k].length = 0; out[k].push(...keep); }
    for (const B of this.buckets.values()) { const i = B.dk.indexOf(D); if (i >= 0) B.dk.splice(i, 1); }
    this.decks = this.decks.filter((x) => x !== D); this.bridges = this.bridges.filter((x) => x !== D); this.mainDecks = this.mainDecks.filter((x) => x !== D);
  }

  // Build a deck: register it (movers, depthAt), then its parts as WorldIndex features.
  build(W, A, D, at, out) {
    D.halfW = A.halfW(D.s); D.gap = D.main ? Math.max(0.8, W.section(D.s).med - 0.5) : 0; // the open median between twin spans
    D.ax = this.slice(A, D.s0 - 4, D.s1 + 4);
    this.bbox(D, D.halfW + 2);
    this.decks.push(D); this.bridges.push(D);
    if (D.main) this.mainDecks.push(D);
    for (const B of this.bucket(D.x0, D.z0, D.x1, D.z1)) B.dk.push(D);
    const S = WATER, H = D.lift, hw = D.halfW, tag = D.id;
    const push = (k, f) => { f.bridge = tag; f.water = true; out[k].push(f); };
    // The deck piece (movers on top; open below) and the two approach fills (solid ground, 2:1 sides, like the exits').
    push('pieces', { kind: 'deck', deck: D, rib: EMPTY_RIB, halfW: hw, x0: D.x0, z0: D.z0, x1: D.x1, z1: D.z1 });
    for (const end of [-1, 1]) {
      if (H < 0.2) continue;
      // The fill climbs on a smoothstep to the deck's end, then runs on under it as a spill-through slope at 2:1 down to
      // the bank (the abutment sits on its top), so nothing under the deck end is open air.
      const pts = [], nRamp = Math.max(2, Math.ceil(D.ramp / 8)), spill = 2 * H, nSp = Math.max(1, Math.ceil(spill / 2));
      const fillAt = (s) => { const kk = s < D.s0 ? smooth((s - (D.s0 - D.ramp)) / D.ramp) : s > D.s1 ? smooth((D.s1 + D.ramp - s) / D.ramp) : 1, p = at(s); return { x: p.x, z: p.z, y: H * kk + 0.04 }; };
      const spillAt = (t) => { const s = end < 0 ? D.s0 + t : D.s1 - t, p = at(s); return { x: p.x, z: p.z, y: Math.max(0.04, H + 0.04 - t / 2), spill: true }; };
      if (end < 0) { for (let k = 0; k <= nRamp; k++) pts.push(fillAt(D.s0 - D.ramp + (D.ramp * k) / nRamp)); for (let k = 1; k <= nSp; k++) pts.push(spillAt((spill * k) / nSp)); }
      else { for (let k = nSp; k >= 1; k--) pts.push(spillAt((spill * k) / nSp)); for (let k = 0; k <= nRamp; k++) pts.push(fillAt(D.s1 + (D.ramp * k) / nRamp)); }
      const r = rib(`${tag} fill ${end}`, pts, hw + 0.4);
      push('pieces', { kind: 'fill', rib: r, halfW: hw + 0.4, x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 });
      // Guardrails where the fill stands taller than railH (the parapets take over on the deck).
      for (const sg of [1, -1]) {
        let run = [];
        const flush = () => { if (run.length > 1) push('rails', { pts: run }); run = []; };
        for (let i = 0; i < r.n; i++) {
          if (pts[i].spill) { flush(); continue; }
          const i0 = Math.max(0, i - 1), i1 = Math.min(r.n - 1, i + 1), tx = r.x[i1] - r.x[i0], tz = r.z[i1] - r.z[i0], tl = Math.hypot(tx, tz) || 1;
          const y = r.y[i] - 0.04;
          if (y < S.railH) { flush(); continue; }
          run.push({ x: r.x[i] + (-tz / tl) * sg * (hw + 0.75), z: r.z[i] + (tx / tl) * sg * (hw + 0.75), y });
        }
        flush();
      }
    }
    // The slab, the parapets and (on the interstate) a median barrier, one box per 8 m of road.
    const segs = Math.max(1, Math.ceil((D.s1 - D.s0) / 8));
    for (let k = 0; k < segs; k++) {
      const sa = D.s0 + ((D.s1 - D.s0) * k) / segs, sb = D.s0 + ((D.s1 - D.s0) * (k + 1)) / segs, pa = at(sa), pb = at(sb);
      const cx = (pa.x + pb.x) / 2, cz = (pa.z + pb.z) / 2, len = Math.hypot(pb.x - pa.x, pb.z - pa.z) + 0.35, rot = Math.atan2(pb.x - pa.x, pb.z - pa.z);
      const nx = Math.cos(rot), nz = -Math.sin(rot); // the box frame's u axis (boxGeo: n = (cos rot, -sin rot))
      if (D.gap) {
        // Twin spans, one per carriageway, with the median open between them (the river shows through).
        const w1 = hw + 0.6 - D.gap, uc = D.gap + w1 / 2;
        for (const sg of [-1, 1]) {
          push('structs', { x: cx + nx * sg * uc, z: cz + nz * sg * uc, y0: H - S.deckThick, y1: H - 0.01, sa: len, su: w1, rot, col: '#8f897d', tag: 'deck', solid: false, base: 0 });
          push('structs', { x: cx + nx * sg * (D.gap + 0.22), z: cz + nz * sg * (D.gap + 0.22), y0: H - 0.01, y1: H + 0.95, sa: len, su: 0.45, rot, col: '#a49e92', tag: 'parapet', solid: true, base: Math.max(0.01, H - 0.5) });
        }
      } else push('structs', { x: cx, z: cz, y0: H - S.deckThick, y1: H - 0.01, sa: len, su: 2 * hw + 1.2, rot, col: '#8f897d', tag: 'deck', solid: false, base: 0 });
      for (const sg of [-1, 1]) push('structs', { x: cx + nx * sg * (hw + 0.35), z: cz + nz * sg * (hw + 0.35), y0: H - 0.01, y1: H + 0.95, sa: len, su: 0.45, rot, col: '#a49e92', tag: 'parapet', solid: true, base: Math.max(0.01, H - 0.5) });
    }
    // Pier bents every `span`: a cap beam under the slab (seen from the bank) on three columns (the edges and the middle,
    // where nobody walks on the deck: the parapets and the barrier are over them). Columns stand on the carved bed.
    const nb = Math.max(1, Math.round((D.s1 - D.s0) / S.span));
    for (let k = 1; k < nb; k++) {
      const s = D.s0 + ((D.s1 - D.s0) * k) / nb, p = at(s), rot = Math.atan2(p.tx, p.tz);
      let bed = 0;
      for (const u of [-hw, 0, hw]) bed = Math.min(bed, this.sample(p.x + p.nx * u, p.z + p.nz * u).bedRel);
      const capT = H - S.deckThick;
      push('structs', { x: p.x, z: p.z, y0: capT - 0.9, y1: capT, sa: 1.4, su: 2 * hw + 0.8, rot, col: '#7f796e', tag: 'pier cap', solid: false, base: 0 });
      for (const u of [-(hw + 0.35), 0, hw + 0.35]) {
        if (!D.main && u === 0) continue;
        const x = p.x + p.nx * u, z = p.z + p.nz * u, bu = this.sample(x, z).bedRel;
        push('structs', { x, z, y0: Math.min(bu, bed) - 0.6, y1: capT - 0.9, sa: 1.1, su: 1.1, rot, col: '#77716a', tag: 'pier', solid: true, base: 0 });
      }
    }
    // Abutments where the deck meets its fills: a concrete seat on top of the spill-through slope (a dry gorge's deck,
    // with no fill, gets a wall down to the bank).
    for (const s of [D.s0, D.s1]) {
      const p = at(s), rot = Math.atan2(p.tx, p.tz);
      let bed = 0;
      for (const u of [-hw, 0, hw]) bed = Math.min(bed, this.sample(p.x + p.nx * u, p.z + p.nz * u).bedRel);
      push('structs', { x: p.x, z: p.z, y0: H >= 0.2 ? Math.max(bed, H - 2.4) : bed - 0.5, y1: H - 0.05, sa: 1.4, su: 2 * hw + 1.2, rot, col: '#837d72', tag: 'abutment', solid: false, base: 0 });
    }
  }

  // ---- signs: none on a bridge or in the water (guide signs move off the deck, mileposts there are left out) ------------
  fixSigns(W) {
    W.signs0 ??= W.signs.map((s) => ({ ...s }));
    W.mileposts0 ??= W.mileposts.map((m) => ({ ...m }));
    const bad = (x, z) => this.keepOut(x, z, 1.5);
    W.signs = W.signs0.map((s0) => {
      const s = { ...s0 };
      if (s.s === undefined || !bad(s.x, s.z)) return s;
      const D = this.onBridge(s.s, 40);
      if (!D) return s;
      // Move it back toward the traffic it is for, off the approach fill.
      const ns = s.dir > 0 ? D.s0 - D.ramp - 40 : D.s1 + D.ramp + 40, f = W.at(ns), u = (s.x - W.at(s.s).x) * f.nx + (s.z - W.at(s.s).z) * f.nz;
      s.s = ns; s.x = f.x + f.nx * u; s.z = f.z + f.nz * u;
      return s;
    });
    W.mileposts = W.mileposts0.filter((m) => !bad(m.x, m.z) && !this.onBridge(m.mile * 1609.344, 10));
  }

  // ---- reports ------------------------------------------------------------------------------------------------------
  list() {
    const r1 = (v) => Math.round(v * 10) / 10;
    return this.bodies.map((b) => ({ id: b.id, name: b.name, kind: b.kind, wet: b.wet, km: r1(b.L / 1000), w: r1(b.row.w), d: b.row.d ?? 0, bed: b.row.bed ?? 0, from: [Math.round(b.x[0]), Math.round(b.z[0])], to: [Math.round(b.x[b.n - 1]), Math.round(b.z[b.n - 1])], src: b.row.src }))
      .concat(this.lakes.map((l) => ({ id: l.id, name: l.name, kind: l.kind, wet: l.wet, d: l.d, centre: [Math.round((l.x0 + l.x1) / 2), Math.round((l.z0 + l.z1) / 2)], size: [Math.round(l.x1 - l.x0), Math.round(l.z1 - l.z0)], src: l.row.src })));
  }
  bridgeList() {
    const r1 = (v) => Math.round(v * 10) / 10;
    return this.bridges.map((B) => ({ id: B.id, kind: B.kind, name: B.name, road: B.road, river: B.river, x: r1(B.x), z: r1(B.z), mile: B.road === 'I-10' ? r1(B.s / 1609.344) : null,
      ...(B.kind === 'deck' ? { length: r1(B.s1 - B.s0), lift: r1(B.lift), ramp: r1(B.ramp), piers: Math.max(0, Math.round((B.s1 - B.s0) / WATER.span) - 1), depth: B.depth, drop: B.drop, angle: B.angle, hp: B.hp, state: B.state } : {}),
      ...(B.kind === 'ford' ? { depth: B.d } : {}) }));
  }
}
export const WATER_STEP = STEP;
export { C as CHUNK };
