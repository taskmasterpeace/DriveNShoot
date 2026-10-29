// Real terrain (docs/design/WEB_TERRAIN.md, docs/design/WEB_SITES_TERRAIN.md): the land under the streamed world from
// public elevation data, with the roads, the towns and the sites laid on it. ON by default (main.js; ?terrain=flat
// turns it off, and then WorldIndex.terrain is null and nothing here runs).
//
//   the land  N(x, z)  baked by tools/terrain-bake.mjs (src/data/terrain/i10.bin: strip-mapped from the real I-10) and
//                      tools/terrain-sheet.mjs (the sheet packs: Florida, the rest of the dust-wall circle, the lower 48,
//                      through the rubber sheet); real heights in metres about the datum, held to each pack's grade
//   the roads y_r(s)   surveyed at boot, one profile per corridor (I-10, I-95, I-75...): the land under the centreline,
//                      smoothed into vertical curves, pinned flat through the pads it crosses, never steeper than g
//   the pads           Phoenix (the island and the ring, at 0: the golden hash never moves), the dead towns, the exit
//                      communities, the holdouts, every planned settlement and SITE (systems/citygen.js): flat, at the
//                      mean of the land they stand on, held clear of the road beds
//   the ground G(x,z)  the land, cut and filled to the road beds and the pads at the batter slope:
//                      G = P + clamp(G' - P, -m·δ, +m·δ) for each design surface P (δ = metres outside it)
//
// Everything is a pure function of (assets, data, seed). Chunks ask for their ground as a 33 x 33 grid (8 m), computed
// once and cached; heightAt and every instance read that same grid with the ground mesh's own triangle split, so a car,
// a cactus and the drawn ground agree to the millimetre.
import { TERRAIN, BIOME_CODES } from '../data/terrain.js';
import { BIOMES } from '../data/streaming.js';
import { C, chunkId } from './geo.js';
import { ROAD_CLASSES, ROAD_BIOMES, CLASS_OF } from '../data/roadscape.js';
import { roadBiomeOf } from './roadscape.js';
const DITCH = ROAD_CLASSES[CLASS_OF.corridor].ditch; // THE ROADSCAPE: the ditch beside an interstate's bed (docs/design/WEB_ROADSCAPE.md)

const STEP = 8, N_G = C / STEP + 1, PB = 2048; // pad buckets (m)
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const TERRAIN_MAGIC = 'DSOATER1';
const NONE = [];

// ---- the asset: 'DSOATER1', u32 header length, header JSON, then a gzip payload of Int16 row-deltas (heights in
// hUnit metres) followed by Uint8 biome codes. `inflate` is the platform's gunzip (bytes -> Promise<bytes>).
export async function decodeTerrain(buf, inflate) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const magic = String.fromCharCode(...u8.subarray(0, 8));
  if (magic !== TERRAIN_MAGIC) throw new Error(`not a terrain asset (${magic})`);
  const hl = u8[8] | (u8[9] << 8) | (u8[10] << 16) | (u8[11] << 24);
  const header = JSON.parse(new TextDecoder().decode(u8.subarray(12, 12 + hl)));
  const raw = await inflate(u8.subarray(12 + hl));
  const { nx, nz } = header, n = nx * nz;
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const heights = new Int16Array(n); // in hUnit metres (7 MB for the I-10 corridor, not 15 as floats)
  for (let j = 0; j < nz; j++) {
    let v = 0;
    for (let i = 0; i < nx; i++) { const k = j * nx + i; v = (i === 0 ? 0 : v) + dv.getInt16(k * 2, true); heights[k] = v; }
  }
  const biome = new Uint8Array(raw.buffer, raw.byteOffset + n * 2, n).slice();
  return { header, heights, biome, bytes: u8.byteLength };
}
// Browser gunzip (DecompressionStream).
export const inflateBrowser = async (bytes) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());

export async function loadTerrain(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`terrain asset ${url}: HTTP ${r.status}`);
  return decodeTerrain(await r.arrayBuffer(), inflateBrowser);
}
// The sheet packs the engine loads beside i10.bin (data/terrain.js TERRAIN_PACKS; the az pack is written as two bands).
export const PACK_FILES = ['fl', 'az-n', 'az-s', 'us'];

// One baked grid: its rectangle, its samples, its own grade.
function sourceOf(a) {
  const h = a.header;
  return { id: h.id ?? 'i10', name: h.name, x0: h.x0, z0: h.z0, cell: h.cell, nx: h.nx, nz: h.nz, x1: h.x0 + (h.nx - 1) * h.cell, z1: h.z0 + (h.nz - 1) * h.cell,
    H: a.heights, B: a.biome, hU: h.hUnit, g: h.g ?? TERRAIN.g, bytes: a.bytes, kind: h.mapping?.kind ?? 'strip' };
}

export class RealTerrain {
  // asset: the i10 strip (decoded); packs: the sheet packs (decoded), in priority order.
  constructor(asset, W, packs = []) {
    const h = asset.header;
    this.asset = asset; this.header = h; this.W = W;
    this.x0 = h.x0; this.z0 = h.z0; this.cell = h.cell; this.nx = h.nx; this.nz = h.nz;
    this.Hh = asset.heights; this.Bb = asset.biome; this.hU = h.hUnit;
    this.x1 = this.x0 + (this.nx - 1) * this.cell; this.z1 = this.z0 + (this.nz - 1) * this.cell;
    this.packs = packs.map(sourceOf);
    this.g = h.g ?? TERRAIN.g; // THE GRADE of the roads (and the look's hillshade scale)
    this.m = TERRAIN.batter;
    this.grids = new Map();
    this.gridMs = 0; this.gridsBuilt = 0;
    const t0 = performance.now();
    this.survey();
    this.surveyMs = +(performance.now() - t0).toFixed(1);
  }

  // ---- the land (the baked fields): the strip first, then the first pack whose rectangle holds the point; bilinear ---
  srcAt(x, z) {
    if (x >= this.x0 && x <= this.x1 && z >= this.z0 && z <= this.z1) return null; // the strip (its own fast path)
    const P = this.packs;
    for (let q = 0; q < P.length; q++) { const s = P[q]; if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return s; }
    return null;
  }
  landAt(x, z) {
    const s = this.srcAt(x, z);
    if (s) {
      let fx = (x - s.x0) / s.cell, fz = (z - s.z0) / s.cell;
      if (fx > s.nx - 1.0001) fx = s.nx - 1.0001; if (fz > s.nz - 1.0001) fz = s.nz - 1.0001;
      const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * s.nx + i, H = s.H;
      const a = H[k], b = H[k + 1], c = H[k + s.nx], d = H[k + s.nx + 1];
      return ((a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz) * s.hU;
    }
    let fx = (x - this.x0) / this.cell, fz = (z - this.z0) / this.cell;
    const nx = this.nx, nz = this.nz;
    if (fx < 0) fx = 0; else if (fx > nx - 1.0001) fx = nx - 1.0001;
    if (fz < 0) fz = 0; else if (fz > nz - 1.0001) fz = nz - 1.0001;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * nx + i, H = this.Hh;
    const a = H[k], b = H[k + 1], c = H[k + nx], d = H[k + nx + 1];
    return ((a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz) * this.hU;
  }
  // The grade of the land under (x, z): the strip's, or its pack's.
  gradeAt(x, z) { const s = this.srcAt(x, z); return s ? s.g : this.g; }
  // The real biome under (x, z) as a usmap letter, or null where the landcover has no data (Mexico, the sea, a region's
  // own rows, a pack's grid cells).
  biomeAt(x, z) {
    const s = this.srcAt(x, z) ?? this;
    const i = Math.round((x - s.x0) / s.cell), j = Math.round((z - s.z0) / s.cell);
    if (i < 0 || j < 0 || i >= s.nx || j >= s.nz) return null;
    const b = (s.B ?? s.Bb)[j * s.nx + i];
    return b === 255 ? null : BIOME_CODES[b];
  }
  // A biome tint blended between the four nearest samples (no squares where the cover changes); false where any is
  // missing (the caller keeps its usmap tint).
  tintAt(x, z, out) {
    const s = this.srcAt(x, z) ?? this, Bb = s.B ?? s.Bb;
    const fx = (x - s.x0) / s.cell, fz = (z - s.z0) / s.cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= s.nx - 1 || j >= s.nz - 1) return false;
    const tx = fx - i, tz = fz - j;
    let r = 0, g = 0, b = 0;
    for (let q = 0; q < 4; q++) {
      const c = Bb[(j + (q >> 1)) * s.nx + i + (q & 1)];
      if (c === 255) return false;
      const t = BIOMES[BIOME_CODES[c]].tint, w = (q & 1 ? tx : 1 - tx) * (q >> 1 ? tz : 1 - tz);
      r += t[0] * w; g += t[1] * w; b += t[2] * w;
    }
    out[0] = r; out[1] = g; out[2] = b;
    return true;
  }

  // ---- the survey: the road profiles, the pads, how far each reaches --------------------------------------------------
  survey() {
    const W = this.W, T = TERRAIN, m = this.m;
    // Pads: Phoenix (the island and the whole ring, at 0), the dead towns, the exit communities; then (sites lane) the
    // holdouts and every planned settlement and SITE.
    const pads = [];
    const R0 = (W.ring?.reach ?? 1900) + T.padMargin;
    pads.push({ id: 'phoenix', x: 0, z: 0, r: R0, P: 0, fixed: true });
    const extent = (cx, cz, place, ribs) => {
      let r = 0;
      for (const b of W.buildings ?? []) if (b.place === place) for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) r = Math.max(r, Math.hypot(x - cx, z - cz));
      for (const rb of ribs) for (let i = 0; i < rb.n; i++) r = Math.max(r, Math.hypot(rb.x[i] - cx, rb.z[i] - cz) + Math.max(rb.wl[i], rb.wr[i]));
      return r;
    };
    for (const t of W.towns ?? []) if (t.built) pads.push({ id: t.id, x: t.x, z: t.z, r: extent(t.x, t.z, t.id, W.ribbons.filter((rb) => rb.town === t.id)) + T.padMargin });
    for (const X of W.exits ?? []) if (X.community) pads.push({ id: X.id, x: X.dest.x, z: X.dest.z, r: extent(X.dest.x, X.dest.z, X.id, W.ribbons.filter((rb) => rb.exit === X.id && rb.kind === 'street')) + T.padMargin * 0.5 });
    const nBase = pads.length;
    for (const H of W.holdouts ?? []) pads.push({ id: `holdout:${H.id ?? H.row?.id ?? H.name}`, x: H.cx, z: H.cz, hx: H.hw + T.padMargin * 0.5, hz: H.hd + T.padMargin * 0.5, r: 0 });
    for (const rec of W.citygen?.plan ?? []) pads.push(this.padOfRec(rec));
    // A pad sits at the mean of the land it covers (a 9 x 9 sample of its disc or rectangle).
    for (const p of pads) if (!p.fixed) this.levelPad(p, false);
    this.pads = pads;
    this.nBase = nBase;

    // The roads: every corridor (I-10 first: its survey is exactly the strip's own), each with its own profile.
    this.roads = [];
    for (const cor of W.corridors ?? [W.i10]) {
      const cl = cor === W.i10 ? W.cl : cor.cl;
      if (!cl || cl.n < 2) continue;
      // Only roads that lie on baked land (the strip or a pack) are surveyed.
      const mid = Math.floor(cl.n / 2);
      if (cor !== W.i10 && !this.srcAt(cl.x[mid], cl.z[mid])) continue;
      this.roads.push(this.surveyRoad(cor, cl, cor === W.i10 ? (W.exits ?? []).filter((X) => !X.cor || X.cor === W.i10) : cor.exits ?? [], pads));
    }
    const r0 = this.roads[0];
    this.yr = r0.yr; this.wf = r0.wf; this.pinned = r0.pinned; this.rWin = r0.rWin; this.stats = r0.stats;
    // A settlement's pad keeps clear of every road bed (so neither batter cuts the other), then each pad's reach.
    for (let q = nBase; q < pads.length; q++) this.clearRoads(pads[q]);
    for (const p of pads) this.reachOf(p);
    this.bucketPads();
  }
  // A pad record for a planned settlement (systems/citygen.js plan record: a square of half-size `half`).
  padOfRec(rec) { return { id: `cg:${rec.id}`, rec, x: rec.x, z: rec.z, hx: rec.half, hz: rec.half, r: 0 }; }
  levelPad(p, clear = true) {
    let s = 0, k = 0;
    if (p.hx) { for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) { s += this.landAt(p.x + (a / 4) * p.hx, p.z + (b / 4) * p.hz); k++; } }
    else for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) { if (a * a + b * b > 16) continue; s += this.landAt(p.x + (a / 4) * p.r, p.z + (b / 4) * p.r); k++; }
    p.P = s / k;
    p.m = Math.max(this.m, this.gradeAt(p.x, p.z) + 0.1); // a pad on steep land cuts a steeper batter (it must meet the land)
    if (clear) this.clearRoads(p);
    if (p.rec) p.rec.y = p.P;
    return p;
  }
  // Hold the pad's level within 90% of what the batter allows from the nearest road bed.
  clearRoads(p) {
    for (const R of this.roads) {
      const cl = R.cl, segs = this.segsNear(R, p.x - (p.hx || p.r) - 200, p.z - (p.hz || p.r) - 200, p.x + (p.hx || p.r) + 200, p.z + (p.hz || p.r) + 200);
      for (const i of segs) {
        const de = this.padDist(p, cl.x[i], cl.z[i]) - R.wf[i];
        const lim = this.m * Math.max(0, de) * 0.9, df = p.P - R.yr[i];
        if (df > lim) p.P = R.yr[i] + lim; else if (df < -lim) p.P = R.yr[i] - lim;
      }
    }
    if (p.rec) p.rec.y = p.P;
  }
  // Metres from (x, z) to the edge of pad p (<= 0 inside).
  padDist(p, x, z) {
    if (p.hx) { const dx = Math.max(0, Math.abs(x - p.x) - p.hx), dz = Math.max(0, Math.abs(z - p.z) - p.hz); return dx > 0 || dz > 0 ? Math.hypot(dx, dz) : Math.max(Math.abs(x - p.x) - p.hx, Math.abs(z - p.z) - p.hz); }
    return Math.hypot(x - p.x, z - p.z) - p.r;
  }
  // How far a pad's batter reaches past its edge (from what the ground is at its rim before it): it has met the land
  // (never steeper than g) within db / (m - g).
  reachOf(p) {
    const m = p.m ?? this.m, gl = this.gradeAt(p.x, p.z);
    let db = 0;
    const ex = p.hx ? p.hx : p.r, ez = p.hz ? p.hz : p.r;
    for (let a = 0; a < 48; a++) {
      const t = (a / 48) * Math.PI * 2, x = p.x + Math.cos(t) * ex * (p.hx ? 1.42 : 1), z = p.z + Math.sin(t) * ez * (p.hx ? 1.42 : 1);
      db = Math.max(db, Math.abs(this.roadGround(x, z) - p.P));
    }
    p.inf = Math.max(ex, ez) * (p.hx ? 1.42 : 1) + db / Math.max(0.03, m - gl) + 40;
  }
  // The ground from the land and the road beds alone (no pads).
  roadGround(x, z) {
    let h = this.landAt(x, z);
    for (const R of this.roads ?? NONE) { const segs = this.segsNear(R, x - 1, z - 1, x + 1, z + 1); if (segs.length) h = this.roadClamp(R, x, z, segs, -1, h); }
    return h;
  }
  bucketPads() {
    this.padB = new Map();
    this.pads.forEach((p, q) => {
      for (let bx = Math.floor((p.x - p.inf) / PB); bx <= Math.floor((p.x + p.inf) / PB); bx++) for (let bz = Math.floor((p.z - p.inf) / PB); bz <= Math.floor((p.z + p.inf) / PB); bz++) {
        const k = bx * 65536 + bz; let L = this.padB.get(k); if (!L) this.padB.set(k, (L = [])); L.push(q);
      }
    });
    for (const L of this.padB.values()) L.sort((a, b) => a - b);
  }
  // The pads whose reach touches the rectangle, in their order (Phoenix first).
  padsNear(x0, z0, x1, z1) {
    const seen = this._ps ??= new Set(); seen.clear();
    const out = [];
    for (let bx = Math.floor(x0 / PB); bx <= Math.floor(x1 / PB); bx++) for (let bz = Math.floor(z0 / PB); bz <= Math.floor(z1 / PB); bz++) {
      const L = this.padB.get(bx * 65536 + bz); if (!L) continue;
      for (const q of L) { if (seen.has(q)) continue; seen.add(q); const p = this.pads[q]; if (p.x + p.inf > x0 && p.x - p.inf < x1 && p.z + p.inf > z0 && p.z - p.inf < z1) out.push(q); }
    }
    out.sort((a, b) => a - b);
    return out.map((q) => this.pads[q]);
  }

  // One corridor's profile: the land under its centreline, smoothed into vertical curves, pinned through its pads.
  surveyRoad(cor, cl, exits, pads) {
    const T = TERRAIN, g = this.g, m = this.m, n = cl.n;
    const R = { id: cor.id, cor, cl, segB: null };
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) y[i] = this.landAt(cl.x[i], cl.z[i]);
    const half = Math.max(1, Math.round(T.vcurve / 2 / (cl.s[1] - cl.s[0] || 8)));
    const box = (src) => {
      const out = new Float64Array(n), pre = new Float64Array(n + 1);
      for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + src[i];
      for (let i = 0; i < n; i++) { const a = Math.max(0, i - half), b = Math.min(n - 1, i + half); out[i] = (pre[b + 1] - pre[a]) / (b - a + 1); }
      return out;
    };
    let yr = box(box(y));
    // ...pinned flat through every (disc) pad it crosses, easing back to the land at the grade g (Phoenix last: it wins).
    const pinned = [];
    for (const p of [...pads.slice(1).filter((q) => !q.hx), pads[0]]) {
      let a = -1, b = -1;
      for (let i = 0; i < n; i++) if (Math.hypot(cl.x[i] - p.x, cl.z[i] - p.z) < p.r + T.formation) { if (a < 0) a = i; b = i; }
      if (a < 0) continue;
      const sa = cl.s[a], sb = cl.s[b];
      for (let i = 0; i < n; i++) {
        const s = cl.s[i], ds = s < sa ? sa - s : s > sb ? s - sb : 0, lim = g * ds, df = yr[i] - p.P;
        yr[i] = df > lim ? p.P + lim : df < -lim ? p.P - lim : yr[i];
      }
      pinned.push({ id: p.id, road: cor.id, s0: Math.round(sa), s1: Math.round(sb), P: +p.P.toFixed(2) });
    }
    R.yr = Float32Array.from(yr);
    R.pinned = pinned;
    const wf = (R.wf = new Float32Array(n));
    for (let i = 0; i < n; i++) {
      let k = 0;
      for (const X of exits) k = Math.max(k, sm((T.formationXs + 100 - Math.abs(cl.s[i] - X.s)) / 100));
      wf[i] = T.formation + (T.formationX - T.formation) * k;
    }
    // THE ROADSCAPE (data/roadscape.js): the road biome's raised bed (relief.js BED) and the weight of the ditch beside it, both
    // eased to nothing through an interchange, a pinned pad and wherever water is near (a crossing keeps its own levels).
    const dkR = new Float64Array(n), bedR = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const x = cl.x[i], z = cl.z[i], s = cl.s[i];
      let f = 1 - sm((wf[i] - T.formation) / 4);
      for (const p of pinned) { const ds = s < p.s0 ? p.s0 - s : s > p.s1 ? s - p.s1 : 0; f = Math.min(f, sm((ds - 120) / 280)); }
      if (this.W.water?.near(x, z)) f = 0;
      dkR[i] = f;
      const L = this.biomeAt(x, z) ?? this.W.biomeAt(x, z);
      bedR[i] = ROAD_BIOMES[roadBiomeOf(L, this.W.regionOf?.(x, z, 3000)?.id ?? null, this.W.stateAt(x, z))]?.bed ?? 0;
    }
    const dkS = box(box(dkR)), bedS = box(box(bedR));
    const dk = (R.dk = new Float32Array(n)), bed = (R.bed = new Float32Array(n));
    for (let i = 0; i < n; i++) { dk[i] = dkR[i] > 0 ? Math.min(dkR[i], dkS[i]) : 0; bed[i] = bedS[i] * dk[i]; R.yr[i] += bed[i]; }
    let dmax = 0, gmax = 0, cut = 0, fill = 0;
    for (let i = 0; i < n; i++) {
      const d = R.yr[i] - y[i];
      dmax = Math.max(dmax, Math.abs(d)); if (d > fill) fill = d; if (-d > cut) cut = -d;
      if (i) gmax = Math.max(gmax, Math.abs(R.yr[i] - R.yr[i - 1]) / (cl.s[i] - cl.s[i - 1] || 1));
    }
    let wmax = 0; for (let i = 0; i < n; i++) wmax = Math.max(wmax, wf[i]);
    R.rWin = wmax + (g * wmax + dmax) / (m - g) + 16;
    R.stats = { maxGrade: +gmax.toFixed(4), maxCut: +cut.toFixed(1), maxFill: +fill.toFixed(1), rWin: Math.round(R.rWin) };
    R.segB = new Map();
    for (let i = 0; i < n - 1; i++) {
      const k = Math.floor((cl.x[i] + cl.x[i + 1]) / 2 / 512) * 65536 + Math.floor((cl.z[i] + cl.z[i + 1]) / 2 / 512);
      let b = R.segB.get(k); if (!b) R.segB.set(k, (b = [])); b.push(i);
    }
    return R;
  }

  // The centreline segments of road R that can reach the rectangle (x0..x1, z0..z1).
  segsNear(R, x0, z0, x1, z1) {
    const W = R.rWin + 8, out = [], cl = R.cl;
    for (let bx = Math.floor((x0 - W) / 512); bx <= Math.floor((x1 + W) / 512); bx++) for (let bz = Math.floor((z0 - W) / 512); bz <= Math.floor((z1 + W) / 512); bz++) {
      const l = R.segB.get(bx * 65536 + bz);
      if (l) for (const i of l) { const x = cl.x[i], z = cl.z[i]; if (x > x0 - W && x < x1 + W && z > z0 - W && z < z1 + W) out.push(i); }
    }
    return out;
  }

  // The nearest centreline segment of road R to (x, z): a scan of `segs` when there is no hint, else a walk along the
  // centreline from the hint while the distance falls. Within the road's reach (rWin, well under the meander's 1.37 km
  // radius of curvature) the nearest point is unique, so both find the same one; past it the clamp does nothing.
  nearestSeg(R, x, z, segs, hint) {
    const cl = R.cl, o = this._ns ??= { i: -1, t: 0, d2: Infinity };
    let _t = 0;
    const test = (i) => {
      const ax = cl.x[i], az = cl.z[i], dx = cl.x[i + 1] - ax, dz = cl.z[i + 1] - az, l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - dx * t, ez = z - az - dz * t; _t = t;
      return ex * ex + ez * ez;
    };
    o.i = -1; o.d2 = Infinity;
    if (hint < 0) {
      for (let k = 0; k < segs.length; k++) { const d2 = test(segs[k]); if (d2 < o.d2) { o.d2 = d2; o.i = segs[k]; o.t = _t; } }
      return o;
    }
    let i = hint, d2 = test(i), t = _t;
    for (;;) {
      if (i > 0) { const a = test(i - 1); if (a < d2) { i--; d2 = a; t = _t; continue; } }
      if (i < cl.n - 2) { const b = test(i + 1); if (b < d2) { i++; d2 = b; t = _t; continue; } }
      break;
    }
    o.i = i; o.d2 = d2; o.t = t;
    return o;
  }
  // h cut and filled to road R's bed at (x, z); sets this.lastSeg.
  roadClamp(R, x, z, segs, hint, h) {
    const q = this.nearestSeg(R, x, z, segs, hint), bi = q.i, bt = q.t;
    this.lastSeg = bi;
    if (bi < 0) return h;
    const d = Math.sqrt(q.d2), yr = R.yr[bi] + (R.yr[bi + 1] - R.yr[bi]) * bt, wf = R.wf[bi] + (R.wf[bi + 1] - R.wf[bi]) * bt;
    const dd = d - wf;
    if (dd <= 0) return yr;
    const lim = this.m * dd, df = h - yr, g = df > lim ? yr + lim : df < -lim ? yr - lim : h;
    // THE ROADSCAPE: the ditch just past the bed (a cut's foot, a fill's toe), where the survey left it its weight
    const t = (dd - DITCH.at) / DITCH.width, k = R.dk ? R.dk[bi] : 0;
    return t > 0 && t < 1 && k > 0 ? g - DITCH.depth * Math.sin(Math.PI * t) * k : g;
  }

  // The ground at (x, z), exactly (no grid): the land, cut and filled to each road bed, then to every pad that reaches.
  // roadSegs: per road (this.roads order), the segments near; pads: the pads near, in order; hints: per road, or null.
  exact(x, z, roadSegs, pads, hints = null) {
    let h = this.landAt(x, z);
    for (let r = 0; r < roadSegs.length; r++) {
      const segs = roadSegs[r];
      if (!segs.length) continue;
      h = this.roadClamp(this.roads[r], x, z, segs, hints ? hints[r] : -1, h);
      if (hints) hints[r] = this.lastSeg;
    }
    for (let q = 0; q < pads.length; q++) {
      const p = pads[q], dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz >= p.inf * p.inf) continue;
      const dd = p.hx ? this.padDist(p, x, z) : Math.sqrt(dx * dx + dz * dz) - p.r;
      if (dd <= 0) { h = p.P; continue; }
      const lim = (p.m ?? this.m) * dd, df = h - p.P;
      if (df > lim) h = p.P + lim; else if (df < -lim) h = p.P - lim;
    }
    return h;
  }
  // The exact ground at one point (for agents and the checks): every road and pad that reaches it.
  groundExact(x, z) { return this.exact(x, z, this.roads.map((R) => this.segsNear(R, x - 1, z - 1, x + 1, z + 1)), this.padsNear(x - 1, z - 1, x + 1, z + 1)); }

  // ---- per chunk: the ground on the 8 m grid (the vertices of the drawn ground) ---------------------------------------
  gridOf(cx, cz) {
    const id = chunkId(cx, cz);
    let gr = this.grids.get(id);
    if (gr) return gr;
    const t0 = performance.now();
    const ox = cx * C, oz = cz * C;
    gr = new Float32Array(N_G * N_G);
    const p0 = this.pads[0];
    // Wholly inside Phoenix's pad: flat at 0 (the island and the ring never move).
    const far = Math.max(Math.hypot(ox, oz), Math.hypot(ox + C, oz), Math.hypot(ox, oz + C), Math.hypot(ox + C, oz + C));
    if (far >= p0.r) {
      const roadSegs = this.roads.map((R) => this.segsNear(R, ox, oz, ox + C, oz + C)), pads = this.padsNear(ox, oz, ox + C, oz + C);
      // Row by row, each vertex walking from the last one's segment (a boustrophedon keeps neighbours adjacent).
      const hints = this._hints ??= new Int32Array(64);
      hints.fill(-1);
      for (let j = 0; j < N_G; j++) for (let ii = 0; ii < N_G; ii++) {
        const i = j & 1 ? N_G - 1 - ii : ii;
        gr[j * N_G + i] = this.exact(ox + i * STEP, oz + j * STEP, roadSegs, pads, hints);
      }
    }
    if (this.grids.size >= TERRAIN.gridLRU) this.grids.delete(this.grids.keys().next().value);
    this.grids.set(id, gr);
    this.gridMs += performance.now() - t0; this.gridsBuilt++;
    return gr;
  }
  // Drop the cached grids that the rectangle touches (a pad came or went): the chunk keys whose layout must be redone.
  invalidate(x0, z0, x1, z1) {
    const out = [];
    for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) for (let cz = Math.floor(z0 / C); cz <= Math.floor(z1 / C); cz++) { this.grids.delete(chunkId(cx, cz)); out.push(`${cx},${cz}`); }
    return out;
  }
  // A settlement stamped after the survey (the citygen / site commands): its pad joins, levelled and held clear of the
  // roads; returns the chunk keys to lay out again. Re-adding the same record replaces its pad.
  addRecPad(rec) {
    const id = `cg:${rec.id}`, old = this.pads.findIndex((p) => p.id === id);
    const p = this.padOfRec(rec);
    this.levelPad(p); this.reachOf(p);
    if (old >= 0) { const o = this.pads[old]; this.pads[old] = p; this.bucketPads(); return this.invalidate(Math.min(o.x - o.inf, p.x - p.inf), Math.min(o.z - o.inf, p.z - p.inf), Math.max(o.x + o.inf, p.x + p.inf), Math.max(o.z + o.inf, p.z + p.inf)); }
    this.pads.push(p); this.bucketPads();
    return this.invalidate(p.x - p.inf, p.z - p.inf, p.x + p.inf, p.z + p.inf);
  }
  removeRecPad(recId) {
    const q = this.pads.findIndex((p) => p.id === `cg:${recId}`);
    if (q < 0) return [];
    const p = this.pads[q]; this.pads.splice(q, 1); this.bucketPads();
    return this.invalidate(p.x - p.inf, p.z - p.inf, p.x + p.inf, p.z + p.inf);
  }
  padOf(recId) { return this.pads.find((p) => p.id === `cg:${recId}`) ?? null; }

  // The ground at (x, z) as the drawn ground has it: the chunk's grid, split into triangles the way chunkgen splits
  // each cell (corner a = (i, j), b = (i+1, j), c = (i+1, j+1), d = (i, j+1); triangles a-d-c and a-c-b).
  at(x, z) {
    if (x * x + z * z < this.r0in2) return 0;
    const cx = Math.floor(x / C), cz = Math.floor(z / C), gr = this.gridOf(cx, cz);
    const fx = (x - cx * C) / STEP, fz = (z - cz * C) / STEP;
    let i = Math.floor(fx), j = Math.floor(fz);
    if (i > N_G - 2) i = N_G - 2; if (j > N_G - 2) j = N_G - 2;
    const tx = fx - i, tz = fz - j, k = j * N_G + i;
    const a = gr[k], b = gr[k + 1], c = gr[k + N_G + 1], d = gr[k + N_G];
    return tx >= tz ? a + (b - a) * tx + (c - b) * tz : a + (d - a) * tz + (c - d) * tx;
  }
  get r0in2() { const r = this.pads[0].r - 24; return r * r; }

  // Which baked asset answers at (x, z) (agents: the `terrain` and `sites` commands).
  coverAt(x, z) { const s = this.srcAt(x, z); if (s) return s.id; return x >= this.x0 && x <= this.x1 && z >= this.z0 && z <= this.z1 ? 'i10' : 'clamped'; }

  // What the agent `terrain` command reports.
  report() {
    return {
      asset: { name: this.header.name, cell: this.cell, nx: this.nx, nz: this.nz, bytes: this.asset.bytes, datum: this.header.datum, g: this.g, sources: this.header.sources?.map((s) => s.name) },
      packs: this.packs.map((s) => ({ id: s.id, name: s.name, x: [s.x0, s.x1], z: [s.z0, s.z1], cell: s.cell, samples: s.nx * s.nz, bytes: s.bytes, g: s.g })),
      road: this.stats, roads: this.roads.map((R) => ({ id: R.id, ...R.stats, pinned: R.pinned.length })), pinned: this.pinned,
      pads: this.pads.length, settlementPads: this.pads.filter((p) => p.rec).length, surveyMs: this.surveyMs,
      grids: { cached: this.grids.size, built: this.gridsBuilt, msTotal: +this.gridMs.toFixed(1), msEach: this.gridsBuilt ? +(this.gridMs / this.gridsBuilt).toFixed(2) : 0 },
    };
  }
}
