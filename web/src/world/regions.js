// Regions of the streamed world (docs/design/WEB_FLORIDA.md; rows in data/regions.js). A region is a box of the one plane
// the streamer may lay out (WEB_STREAMING §3.1: one K, one frame), with its own look (biome rows, ground texture, flora),
// its water (THE depth authority past the island: world/water.js asks here), its edge (the squall line, as P1's dust
// wall) and its life. Arizona is P1 exactly as it was (a 45 km circle round Phoenix, data/streaming.js); a region row
// with a `box` is laid out by the same chunk generator with its own rows. Everything is a pure function of the rows,
// the seed and K: two boots build the same Florida.
import { REGIONS } from '../data/regions.js';
import { stampedRegions, sharedEdges } from './stamps.js'; // THE WORLD TOOLS: region stamps (docs/design/WEB_WORLD_TOOLS.md)
import { STREAM } from '../data/streaming.js';
import { toWorldX, toWorldZ, toUsmap, hash32, vnoise, chunkOf, chunkId, C } from './geo.js';

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// Water kinds (per sample): what colour the sheet is.
export const WK = { none: 0, swamp: 1, canal: 2, lagoon: 3, ocean: 4 };

export class Region {
  constructor(id, row, W) {
    this.id = id; this.row = row; this.W = W; this.name = row.name;
    const b = row.box;
    this.x0 = toWorldX(b.x0); this.x1 = toWorldX(b.x1); this.z0 = toWorldZ(b.y0); this.z1 = toWorldZ(b.y1);
    this.wall = row.wall;
    this.seed = hash32(W.seed, ...[...id].map((c) => c.charCodeAt(0)));
    this.biomes = row.biomes;
    this.water = row.water ?? null;
    this.corridors = []; this.exits = []; this.holdouts = [];
    // The Atlantic shore (world x as a function of z), sampled once every 8 m along the region's z range: the per-point
    // query reads it (no noise per call on the hot path).
    const A = this.water?.atlantic;
    if (A) {
      const n = Math.ceil((this.z1 - this.z0) / 8) + 2;
      this.shore = new Float64Array(n); this.barrierW = new Float32Array(n); this.lagoonW = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const z = this.z0 + i * 8, [, uy] = toUsmap(0, z);
        const bay = A.bay ? A.bay.u * smooth((uy - A.bay.y0) / (A.bay.y1 - A.bay.y0)) : 0;
        const wob = (vnoise(0, z, A.noise.wave[0], this.seed + 11) - 0.5) * 2 * A.noise.amp[0] + (vnoise(0, z, A.noise.wave[1], this.seed + 12) - 0.5) * 2 * A.noise.amp[1];
        this.shore[i] = toWorldX(A.u + bay) + wob;
        this.barrierW[i] = A.barrier[0] + (A.barrier[1] - A.barrier[0]) * vnoise(1, z, 3100, this.seed + 13);
        this.lagoonW[i] = A.lagoon[0] + (A.lagoon[1] - A.lagoon[0]) * vnoise(2, z, 4300, this.seed + 14);
      }
      // Inlets: a gap in the barrier island every inletEvery metres (seeded jitter), where the lagoon meets the sea.
      this.inlets = [];
      for (let z = this.z0 + A.inletEvery * 0.6; z < this.z1; z += A.inletEvery) this.inlets.push(z + (vnoise(3, z, 500, this.seed + 15) - 0.5) * A.inletEvery * 0.5);
    }
    this.cache = new Map(); // chunk id -> water grid (set by chunkgen layouts; dropped with them)
    // Edges shared with a neighbour region (THE WORLD TOOLS' seam law): no wall, no fog, the road runs on through.
    // { side: N|S|W|E, a0, a1 } world metres along the edge (x for N/S, z for W/E). Set by buildRegions.
    this.open = [];
  }
  // Is this side open (a neighbour region continues it) at the point's coordinate along that side?
  openAt(side, x, z) { const t = side === 'N' || side === 'S' ? x : z; for (const o of this.open) if (o.side === side && t >= o.a0 - 1 && t <= o.a1 + 1) return true; return false; }
  // Inside the box held m metres in from every WALLED side (an open side holds nothing back): a corridor's clip.
  inClip(x, z, m) {
    return x >= this.x0 + (this.openAt('W', x, z) ? 0 : m) && x <= this.x1 - (this.openAt('E', x, z) ? 0 : m) && z >= this.z0 + (this.openAt('N', x, z) ? 0 : m) && z <= this.z1 - (this.openAt('S', x, z) ? 0 : m);
  }

  inBox(x, z, pad = 0) { return x >= this.x0 - pad && x <= this.x1 + pad && z >= this.z0 - pad && z <= this.z1 + pad; }
  // 0 well inside .. 1 at (and past) the edge: the squall line's fog.
  edgeFade(x, z) {
    const o = this.open.length, d = Math.min(o && this.openAt('W', x, z) ? Infinity : x - this.x0, o && this.openAt('E', x, z) ? Infinity : this.x1 - x,
      o && this.openAt('N', x, z) ? Infinity : z - this.z0, o && this.openAt('S', x, z) ? Infinity : this.z1 - z), F = this.wall.fade;
    return clamp01((F - d) / F);
  }
  // A biome row for a usmap legend letter (null rows fall back to scrub).
  biome(key) { return this.biomes[key] ?? this.biomes.f; }

  // ---- the Atlantic: the open beach, the barrier island, the lagoon, the mainland -------------------------------------
  shoreAt(z) {
    if (!this.shore) return null;
    const f = (z - this.z0) / 8, i = Math.max(0, Math.min(this.shore.length - 2, Math.floor(f))), t = clamp01(f - i);
    return { x: this.shore[i] + (this.shore[i + 1] - this.shore[i]) * t, b: this.barrierW[i] + (this.barrierW[i + 1] - this.barrierW[i]) * t, l: this.lagoonW[i] + (this.lagoonW[i + 1] - this.lagoonW[i]) * t };
  }
  // The mainland's lagoon shore at z (world x): holdouts and the coast road keep back from it.
  mainlandShore(z) { const s = this.shoreAt(z); return s ? s.x - s.b - s.l : Infinity; }
  // { d, k }: depth and kind from the sea and the lagoon (0 on land).
  atlantic(x, z, out) {
    const A = this.water.atlantic, s = this.shoreAt(z);
    // out.s: a signed margin (metres; > 0 in the water): the water sheet's shoreline is its zero line (world/chunkgen.js).
    out.d = 0; out.k = 0; out.s = -1e3;
    if (!s) return out;
    const dx = x - s.x;
    const a = dx + s.b + s.l, bnk = -s.b - dx, lag = Math.min(a, bnk); // the lagoon: from the mainland shore, the island's back
    let inl = -1e3;
    for (const iz of this.inlets) { const e = A.inlet / 2 - Math.abs(z - iz); if (e > inl) inl = e; }
    out.s = Math.max(dx, lag, dx > -s.b && dx <= 0 ? inl : -1e3);
    if (dx > 0) { out.d = Math.min(A.ocean.max, 0.15 + Math.max(0, dx - 2) / A.ocean.slope); if (dx < A.beach * 0.25) out.d *= smooth(dx / (A.beach * 0.25)); out.k = WK.ocean; return out; }
    if (dx > -s.b) {
      // The barrier island: dry sand and dunes, except at an inlet.
      if (inl > 0) { out.d = A.inletDepth * smooth((inl / (A.inlet / 2)) * 3); out.k = WK.lagoon; }
      return out;
    }
    if (lag > 0) {
      const core = smooth(lag / 60), lv = vnoise(x, z, 900, this.seed + 21);
      out.d = Math.max(0.03, (A.lagoonDepth[0] + (A.lagoonDepth[1] - A.lagoonDepth[0]) * lv) * core);
      out.k = WK.lagoon;
    }
    return out;
  }
  // The Gulf (and any other grid ocean west of the Atlantic logic): a smoothed field over the 500 m cells.
  gulf(x, z, out) {
    out.d = 0; out.k = 0; out.s = -1e3;
    const G = this.water.gulf, D = this.W.data, [ux, uy] = toUsmap(x, z);
    if (ux > (this.water.atlantic?.u ?? 1e9) - 2500) return out; // the east coast is the Atlantic rows' business
    const fx = (ux - D.world_offset[0]) / D.cell_m - 0.5, fy = (uy - D.world_offset[1]) / D.cell_m - 0.5;
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
    const sea = (a, b) => { if (a < 0 || b < 0 || a >= D.w || b >= D.h) return 1; return D.grid[b][a] === '.' ? 1 : 0; };
    const o = (sea(i, j) * (1 - tx) + sea(i + 1, j) * tx) * (1 - ty) + (sea(i, j + 1) * (1 - tx) + sea(i + 1, j + 1) * tx) * ty;
    if (o <= 0) return out;
    const v = o + (vnoise(x, z, G.wave, this.seed + 31) - 0.5) * 2 * G.amp;
    out.s = (v - 0.5) * D.cell_m * this.W.K;
    if (v <= 0.5) return out;
    out.d = Math.min(G.max, out.s / G.slope);
    out.k = WK.ocean;
    return out;
  }
  // Sloughs and gator holes: still water where two noises pool, scaled by the biome (its `sloughs`). Signed (metres of
  // depth; negative on dry ground), so the shoreline is a contour.
  sloughRaw(x, z, biomeKey) {
    const S = this.water.slough, B = this.biome(biomeKey);
    const k = B?.sloughs ?? 0;
    if (k <= 0) return -1;
    const n = vnoise(x, z, S.wave, this.seed + 41) * 0.62 + vnoise(x, z, S.wave * 0.41, this.seed + 42) * 0.38;
    const cut = S.cut + (1 - Math.min(1, k)) * 0.13 - Math.max(0, k - 1) * 0.06;
    return (n - cut) * S.depth;
  }
}

export function buildRegions(W) {
  const out = {};
  for (const [id, row] of Object.entries({ ...REGIONS, ...stampedRegions() })) if (row.box) out[id] = new Region(id, row, W);
  // The seam law: where two boxes share an edge, both keep it open over the shared length.
  const all = Object.values(out);
  for (const a of all) for (const b of all) if (a !== b) for (const e of sharedEdges(a.row.box, b.row.box)) {
    const ns = e.side === 'N' || e.side === 'S';
    a.open.push({ side: e.side, a0: ns ? toWorldX(e.x0) : toWorldZ(e.y0), a1: ns ? toWorldX(e.x1) : toWorldZ(e.y1), with: b.id });
  }
  return out;
}

// The region a world point is in (null: P1 Arizona or nowhere). A handful of box tests.
export function regionAt(regions, x, z, pad = 0) {
  // The region the point is IN wins over one it is merely near (two regions share an edge: THE WORLD TOOLS' seam law).
  if (pad > 0) for (const k in regions) { const R = regions[k]; if (R.inBox(x, z, 0)) return R; }
  for (const k in regions) { const R = regions[k]; if (R.inBox(x, z, pad)) return R; }
  return null;
}

// Water depth at a world point inside region R (pure). ctx: optional chunk-local helpers (segs for the canals, the
// chunk's ribbons) so a layout's 4 m grid is cheap; without it the corridors' own buckets answer.
// Distance from a point to a ribbon's centreline (no bounding-box shortcut: a slough keeps its distance from a road).
function ribbonD(r, x, z) {
  let best = Infinity;
  for (let i = 1; i < r.n; i++) {
    const ax = r.x[i - 1], az = r.z[i - 1], dx = r.x[i] - ax, dz = r.z[i] - az, l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) best = d;
  }
  return best;
}
// out: { d: depth (m), k: kind (WK), s: a signed margin > 0 in the water: the sheet's shoreline is its zero line }.
const _o = { d: 0, k: 0, s: 0 };
const CLR = 0.03; // how fast a slough shallows out toward a road, a town or a street (metres of depth per metre)
export function regionWater(R, x, z, out = { d: 0, k: 0, s: 0 }, ctx = null) {
  out.d = 0; out.k = 0; out.s = -1e3;
  const Wt = R.water;
  if (!Wt || !R.inBox(x, z)) return out;
  for (const h of R.holdouts) if (h.onPier(x, z)) return out; // the pier's deck is dry
  const take = () => { if (_o.d > out.d) { out.d = _o.d; out.k = _o.k; } if (_o.s > out.s) out.s = _o.s; };
  if (Wt.atlantic) { R.atlantic(x, z, _o); take(); if (out.k === WK.ocean) return out; }
  if (Wt.gulf) { R.gulf(x, z, _o); take(); if (out.k === WK.ocean && out.d > 0.3) return out; }
  const W = R.W;
  // The corridors: canals beside them, and no slough within clearRoad of a road.
  let nearRoad = Infinity;
  for (const cor of R.corridors) {
    const pr = ctx?.proj ? ctx.proj(cor, x, z) : cor.project(x, z, 140);
    if (pr.d === Infinity) continue;
    if (pr.d < nearRoad) nearRoad = pr.d;
    const cn = cor.canal;
    if (!cn || pr.d > cn.off + cn.half + 12) continue;
    if (pr.side !== cn.side || cor.noCanal(pr.s, x, z)) continue;
    const e = Math.abs(pr.d - cn.off), sg = cn.half - e;
    if (sg > out.s) out.s = sg;
    if (sg <= 0) continue;
    const d = cn.depth * (1 - (e / cn.half) ** 2);
    if (d > out.d) { out.d = d; out.k = WK.canal; }
  }
  if (out.d > 0) return out;
  const S = Wt.slough;
  let s = R.sloughRaw(x, z, W.biomeAt(x, z));
  s = Math.min(s, (nearRoad - S.clearRoad) * CLR);
  const sh = R.shoreAt?.(z);
  if (sh) s = Math.min(s, (sh.x - sh.b - sh.l - 40 - x) * CLR); // no slough on the barrier island or at the lagoon's edge
  if (s > -0.5) {
    // Clear of towns, holdouts and every other paved ribbon (exit roads, access roads, streets), shallowing toward them.
    for (const h of R.holdouts) s = Math.min(s, Math.max(Math.abs(x - h.cx) - h.hw - S.clearTown, Math.abs(z - h.cz) - h.hd - S.clearTown) * CLR);
    for (const t of ctx?.towns ?? W.towns) if (t.built && t.region === R) s = Math.min(s, (Math.hypot(t.x - x, t.z - z) - 420 - S.clearTown) * CLR);
    if (s > -0.5) {
      const rbs = ctx?.ribbons ?? W.featuresOf(chunkOf(x), chunkOf(z))?.ribbons ?? [];
      for (const rb of rbs) if (!rb.mainline && x > rb.x0 - 60 && x < rb.x1 + 60 && z > rb.z0 - 60 && z < rb.z1 + 60) s = Math.min(s, (ribbonD(rb, x, z) - 34) * CLR);
    }
  }
  if (s > out.s) out.s = s;
  if (s <= 0) return out;
  out.d = Math.min(S.max, s); out.k = WK.swamp;
  return out;
}

// The runtime depth query (world/water.js EXT): a laid-out chunk's 4 m grid when there is one, else the pure function.
export function makeDepthAt(W) {
  const out = { d: 0, k: 0 };
  return (x, z) => {
    const R = regionAt(W.regions, x, z);
    if (!R || !R.water) return 0;
    for (const h of R.holdouts) if (h.onPier(x, z)) return 0; // the pier's deck (narrower than the grid's 4 m)
    const g = R.cache.get(chunkId(chunkOf(x), chunkOf(z)));
    if (g) {
      if (!g.any) return 0;
      const ox = chunkOf(x) * C, oz = chunkOf(z) * C, fx = (x - ox) / 4, fz = (z - oz) / 4;
      const i = Math.min(63, Math.floor(fx)), j = Math.min(63, Math.floor(fz)), tx = fx - i, tz = fz - j, d = g.d, n = 65;
      const a = d[j * n + i], b = d[j * n + i + 1], c = d[(j + 1) * n + i], e = d[(j + 1) * n + i + 1];
      return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + e * tx) * tz;
    }
    return regionWater(R, x, z, out).d;
  };
}

export { STREAM };
