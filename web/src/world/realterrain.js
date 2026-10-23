// Real terrain (docs/design/WEB_TERRAIN.md), behind a flag: the land under the streamed world from public elevation data,
// with the road and the towns laid on it. OFF by default; WorldIndex.terrain is null and nothing here runs.
//
//   the land  N(x, z)  baked by tools/terrain-bake.mjs (src/data/terrain/*.bin): real heights in metres about Phoenix's,
//                      strip-mapped from the real I-10 onto ours and held to THE GRADE g (rows: data/terrain.js)
//   the road  y_r(s)   surveyed at boot: the land under the centreline, smoothed into vertical curves, pinned flat
//                      through Phoenix and the towns it runs through, never steeper than g
//   the pads           Phoenix (the island and the ring, at 0: the golden hash never moves), the dead towns, the exit
//                      communities: flat, at the mean of the land they stand on
//   the ground G(x,z)  the land, cut and filled to the road bed and the pads at the batter slope:
//                      G = P + clamp(G' - P, -m·δ, +m·δ) for each design surface P (δ = metres outside it)
//
// Everything is a pure function of (asset, data, seed). Chunks ask for their ground as a 33 x 33 grid (8 m), computed
// once and cached; heightAt and every instance read that same grid with the ground mesh's own triangle split, so a car,
// a cactus and the drawn ground agree to the millimetre.
import { TERRAIN, BIOME_CODES } from '../data/terrain.js';
import { BIOMES } from '../data/streaming.js';
import { C, chunkId } from './geo.js';

const STEP = 8, N_G = C / STEP + 1;
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const TERRAIN_MAGIC = 'DSOATER1';

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

export class RealTerrain {
  constructor(asset, W) {
    const h = asset.header;
    this.asset = asset; this.header = h; this.W = W;
    this.x0 = h.x0; this.z0 = h.z0; this.cell = h.cell; this.nx = h.nx; this.nz = h.nz;
    this.Hh = asset.heights; this.Bb = asset.biome; this.hU = h.hUnit;
    this.g = h.g ?? TERRAIN.g;
    this.m = TERRAIN.batter;
    this.grids = new Map();
    this.gridMs = 0; this.gridsBuilt = 0;
    const t0 = performance.now();
    this.survey();
    this.surveyMs = +(performance.now() - t0).toFixed(1);
  }

  // ---- the land (the baked field): bilinear, clamped to the bake's rectangle ------------------------------------------
  landAt(x, z) {
    let fx = (x - this.x0) / this.cell, fz = (z - this.z0) / this.cell;
    const nx = this.nx, nz = this.nz;
    if (fx < 0) fx = 0; else if (fx > nx - 1.0001) fx = nx - 1.0001;
    if (fz < 0) fz = 0; else if (fz > nz - 1.0001) fz = nz - 1.0001;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * nx + i, H = this.Hh;
    const a = H[k], b = H[k + 1], c = H[k + nx], d = H[k + nx + 1];
    return ((a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz) * this.hU;
  }
  // The real biome under (x, z) as a usmap letter, or null where the landcover has no data (Mexico, the sea).
  biomeAt(x, z) {
    const i = Math.round((x - this.x0) / this.cell), j = Math.round((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return null;
    const b = this.Bb[j * this.nx + i];
    return b === 255 ? null : BIOME_CODES[b];
  }
  // A biome tint blended between the four nearest samples (no squares where the cover changes); false where any is
  // missing (the caller keeps its usmap tint).
  tintAt(x, z, out) {
    const fx = (x - this.x0) / this.cell, fz = (z - this.z0) / this.cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.nx - 1 || j >= this.nz - 1) return false;
    const tx = fx - i, tz = fz - j;
    let r = 0, g = 0, b = 0;
    for (let q = 0; q < 4; q++) {
      const c = this.Bb[(j + (q >> 1)) * this.nx + i + (q & 1)];
      if (c === 255) return false;
      const t = BIOMES[BIOME_CODES[c]].tint, w = (q & 1 ? tx : 1 - tx) * (q >> 1 ? tz : 1 - tz);
      r += t[0] * w; g += t[1] * w; b += t[2] * w;
    }
    out[0] = r; out[1] = g; out[2] = b;
    return true;
  }

  // ---- the survey: the road profile, the pads, how far each reaches ---------------------------------------------------
  survey() {
    const W = this.W, cl = W.cl, n = cl.n, T = TERRAIN, g = this.g, m = this.m;
    // Pads: Phoenix (the island and the whole ring, at 0), the dead towns, the exit communities.
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
    // A pad sits at the mean of the land it covers (a 9 x 9 sample of its disc).
    for (const p of pads) {
      if (p.fixed) continue;
      let s = 0, k = 0;
      for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) { if (a * a + b * b > 16) continue; s += this.landAt(p.x + (a / 4) * p.r, p.z + (b / 4) * p.r); k++; }
      p.P = s / k;
    }
    this.pads = pads;

    // The road profile: the land under the centreline...
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) y[i] = this.landAt(cl.x[i], cl.z[i]);
    // ...smoothed twice over the vertical-curve length (a triangle kernel: crests and sags become curves)...
    const half = Math.max(1, Math.round(T.vcurve / 2 / (cl.s[1] - cl.s[0] || 8)));
    const box = (src) => {
      const out = new Float64Array(n), pre = new Float64Array(n + 1);
      for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + src[i];
      for (let i = 0; i < n; i++) { const a = Math.max(0, i - half), b = Math.min(n - 1, i + half); out[i] = (pre[b + 1] - pre[a]) / (b - a + 1); }
      return out;
    };
    let yr = box(box(y));
    // ...pinned flat through every pad it crosses, easing back to the land at the grade g (Phoenix last: it wins).
    const pinned = [];
    for (const p of [...pads.slice(1), pads[0]]) {
      let a = -1, b = -1;
      for (let i = 0; i < n; i++) if (Math.hypot(cl.x[i] - p.x, cl.z[i] - p.z) < p.r + T.formation) { if (a < 0) a = i; b = i; }
      if (a < 0) continue;
      const sa = cl.s[a], sb = cl.s[b];
      for (let i = 0; i < n; i++) {
        const s = cl.s[i], ds = s < sa ? sa - s : s > sb ? s - sb : 0, lim = g * ds, df = yr[i] - p.P;
        yr[i] = df > lim ? p.P + lim : df < -lim ? p.P - lim : yr[i];
      }
      pinned.push({ id: p.id, s0: Math.round(sa), s1: Math.round(sb), P: +p.P.toFixed(2) });
    }
    this.yr = Float32Array.from(yr);
    this.pinned = pinned;
    // The road bed's half-width: wider through each interchange.
    const wf = (this.wf = new Float32Array(n));
    for (let i = 0; i < n; i++) {
      let k = 0;
      for (const X of W.exits ?? []) k = Math.max(k, sm((T.formationXs + 100 - Math.abs(cl.s[i] - X.s)) / 100));
      wf[i] = T.formation + (T.formationX - T.formation) * k;
    }
    // How far the road can reach into the land: past this the cut or fill has met the land (the land is never steeper
    // than g, the batter is m > g, so a batter starting dy away meets it within dy / (m - g)).
    let dmax = 0, gmax = 0, cut = 0, fill = 0;
    for (let i = 0; i < n; i++) {
      const d = this.yr[i] - y[i];
      dmax = Math.max(dmax, Math.abs(d)); if (d > fill) fill = d; if (-d > cut) cut = -d;
      if (i) gmax = Math.max(gmax, Math.abs(this.yr[i] - this.yr[i - 1]) / (cl.s[i] - cl.s[i - 1] || 1));
    }
    let wmax = 0; for (let i = 0; i < n; i++) wmax = Math.max(wmax, wf[i]);
    this.rWin = wmax + (g * wmax + dmax) / (m - g) + 16;
    this.stats = { maxGrade: +gmax.toFixed(4), maxCut: +cut.toFixed(1), maxFill: +fill.toFixed(1), rWin: Math.round(this.rWin) };
    // Each pad's reach (from what the ground is at its rim before it), sampled round its edge.
    for (const p of pads) {
      let db = 0;
      for (let a = 0; a < 48; a++) { const t = (a / 48) * Math.PI * 2, x = p.x + Math.cos(t) * p.r, z = p.z + Math.sin(t) * p.r; db = Math.max(db, Math.abs(this.exact(x, z, this.segsNear(x - 1, z - 1, x + 1, z + 1), 0) - p.P)); }
      p.inf = p.r + db / (m - g) + 40;
    }
    // Buckets of centreline segments (512 m) for the per-chunk segment lists.
    this.segB = new Map();
    for (let i = 0; i < n - 1; i++) {
      const k = Math.floor((cl.x[i] + cl.x[i + 1]) / 2 / 512) * 65536 + Math.floor((cl.z[i] + cl.z[i + 1]) / 2 / 512);
      let b = this.segB.get(k); if (!b) this.segB.set(k, (b = [])); b.push(i);
    }
  }

  // The centreline segments that can reach the rectangle (x0..x1, z0..z1).
  segsNear(x0, z0, x1, z1) {
    const R = this.rWin + 8, out = [], cl = this.W.cl;
    if (!this.segB) { // during the survey itself: scan (once per pad rim point, a few hundred calls)
      for (let i = 0; i < cl.n - 1; i++) { const x = cl.x[i], z = cl.z[i]; if (x > x0 - R && x < x1 + R && z > z0 - R && z < z1 + R) out.push(i); }
      return out;
    }
    for (let bx = Math.floor((x0 - R) / 512); bx <= Math.floor((x1 + R) / 512); bx++) for (let bz = Math.floor((z0 - R) / 512); bz <= Math.floor((z1 + R) / 512); bz++) {
      const l = this.segB.get(bx * 65536 + bz);
      if (l) for (const i of l) { const x = cl.x[i], z = cl.z[i]; if (x > x0 - R && x < x1 + R && z > z0 - R && z < z1 + R) out.push(i); }
    }
    return out;
  }

  // The ground at (x, z), exactly (no grid): the land, cut and filled to the road bed, then to every pad that reaches.
  // nPads: how many pads to apply (the survey asks for the road alone while measuring the pads).
  // The nearest centreline segment to (x, z): a scan of `segs` when there is no hint, else a walk along the centreline
  // from the hint while the distance falls. Within the road's reach (rWin, well under the meander's 1.37 km radius of
  // curvature) the nearest point is unique, so both find the same one; past it the clamp does nothing either way.
  nearestSeg(x, z, segs, hint) {
    const cl = this.W.cl, o = this._ns ??= { i: -1, t: 0, d2: Infinity };
    const test = (i) => {
      const ax = cl.x[i], az = cl.z[i], dx = cl.x[i + 1] - ax, dz = cl.z[i + 1] - az, l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - dx * t, ez = z - az - dz * t; _t = t;
      return ex * ex + ez * ez;
    };
    let _t = 0;
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

  exact(x, z, segs, nPads = this.pads.length, hint = -1) {
    let h = this.landAt(x, z);
    this.lastSeg = -1;
    if (segs.length) {
      const q = this.nearestSeg(x, z, segs, hint), best = q.d2, bi = q.i, bt = q.t;
      this.lastSeg = bi;
      if (bi >= 0) {
        const d = Math.sqrt(best), yr = this.yr[bi] + (this.yr[bi + 1] - this.yr[bi]) * bt, wf = this.wf[bi] + (this.wf[bi + 1] - this.wf[bi]) * bt;
        const dd = d - wf;
        if (dd <= 0) h = yr;
        else { const lim = this.m * dd, df = h - yr; if (df > lim) h = yr + lim; else if (df < -lim) h = yr - lim; }
      }
    }
    for (let q = 0; q < nPads; q++) {
      const p = this.pads[q], dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz >= p.inf * p.inf) continue;
      const dd = Math.sqrt(dx * dx + dz * dz) - p.r;
      if (dd <= 0) { h = p.P; continue; }
      const lim = this.m * dd, df = h - p.P;
      if (df > lim) h = p.P + lim; else if (df < -lim) h = p.P - lim;
    }
    return h;
  }

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
      const segs = this.segsNear(ox, oz, ox + C, oz + C), np = this.pads.length;
      // Row by row, each vertex walking from the last one's segment (a boustrophedon keeps neighbours adjacent).
      let hint = -1;
      for (let j = 0; j < N_G; j++) for (let ii = 0; ii < N_G; ii++) {
        const i = j & 1 ? N_G - 1 - ii : ii;
        gr[j * N_G + i] = this.exact(ox + i * STEP, oz + j * STEP, segs, np, hint);
        hint = this.lastSeg;
      }
    }
    if (this.grids.size >= TERRAIN.gridLRU) this.grids.delete(this.grids.keys().next().value);
    this.grids.set(id, gr);
    this.gridMs += performance.now() - t0; this.gridsBuilt++;
    return gr;
  }

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

  // What the agent `terrain` command reports.
  report() {
    return {
      asset: { name: this.header.name, cell: this.cell, nx: this.nx, nz: this.nz, bytes: this.asset.bytes, datum: this.header.datum, g: this.g, sources: this.header.sources?.map((s) => s.name) },
      road: this.stats, pinned: this.pinned, pads: this.pads.length, surveyMs: this.surveyMs,
      grids: { cached: this.grids.size, built: this.gridsBuilt, msTotal: +this.gridMs.toFixed(1), msEach: this.gridsBuilt ? +(this.gridMs / this.gridsBuilt).toFixed(2) : 0 },
    };
  }
}
