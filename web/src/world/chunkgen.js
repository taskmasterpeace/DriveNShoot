import * as THREE from 'three';
import { STREAM, BIOMES, FLORA } from '../data/streaming.js';
import { C, ISLAND, inIsland, hash32, rngOf, vnoise, Hasher } from './geo.js';
import { StaticWorld } from '../engine/collision.js';
import { ROAD_BANDS } from './textures.js';

// layoutChunk (docs/design/WEB_STREAMING.md §3.2): everything a chunk is, as plain arrays and records, built by a
// generator that yields between stages so the pump can run it in 0.5 ms slices. A layout is a pure function of
// (seed, cx, cz, dataHash): build order, sliced or synchronous, never changes the result (its hash proves it).
//   boxes  - collision, clipped to the chunk's own square (nothing listed twice across chunks)
//   nav    - foot (1 m, 256^2) and car (2 m, 128^2) tiles, rasterised with the same centre test as the island grid
//   surf   - ground (8 m grid, biome-tinted), road ribbons (one atlas), rock (mesas, fills, the bridge)
//   inst   - instance records per pool (matrices, colours, sign atlas rects)
//   mm     - a 128^2 minimap tile (2 m per pixel), painted in the HUD radar's palette
// Global features (rails, bridge parts, buildings, signs) come from WorldIndex: a chunk OWNS a feature's visual when
// its centre is inside, and clips every overlapping feature's collision to its square.

const N_G = C / 8 + 1;          // ground vertices per side (33)
const RAD_FOOT = 0.45, RAD_CAR = 1.9;
const BAND = ROAD_BANDS;
const UPER = { hwy: 24, county: 14, ramp: 18, aux: 18 };  // metres of road per texture repeat (lane dashes every 12 m)
const POOL_NAMES = ['props', 'walls', 'roofs', 'cacti', 'trunks', 'boulders', 'shrubs', 'signs', 'rails', 'barrels', 'glows'];

// ---- scratch writers (module-level: generation never allocates per instance) -------------------------------------------
class InstBuf {
  constructor(cap, extra = 0) { this.cap = cap; this.m = new Float32Array(cap * 16); this.c = new Float32Array(cap * 3); this.e = extra ? new Float32Array(cap * extra) : null; this.k = extra; this.n = 0; }
  reset() { this.n = 0; }
  // Yaw-only transform: T * Ry * S (column-major, as three.js stores it).
  push(x, y, z, rot, sx, sy, sz, r, g, b) {
    if (this.n >= this.cap) return -1;
    const i = this.n++, o = i * 16, m = this.m, c = Math.cos(rot), s = Math.sin(rot);
    m[o] = c * sx; m[o + 1] = 0; m[o + 2] = -s * sx; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = s * sz; m[o + 9] = 0; m[o + 10] = c * sz; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    this.c[i * 3] = r; this.c[i * 3 + 1] = g; this.c[i * 3 + 2] = b;
    return i;
  }
  pushMatrix(mat, r, g, b) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.m.set(mat.elements, i * 16);
    this.c[i * 3] = r; this.c[i * 3 + 1] = g; this.c[i * 3 + 2] = b;
    return i;
  }
  take() { return { n: this.n, m: this.m.slice(0, this.n * 16), c: this.c.slice(0, this.n * 3), e: this.e ? this.e.slice(0, this.n * this.k) : null }; }
}
class MeshBuf {
  constructor(maxV, maxI, uv, col) { this.pos = new Float32Array(maxV * 3); this.nrm = new Float32Array(maxV * 3); this.uv = uv ? new Float32Array(maxV * 2) : null; this.col = col ? new Float32Array(maxV * 3) : null; this.idx = new Uint32Array(maxI); this.maxV = maxV; this.maxI = maxI; this.nv = 0; this.ni = 0; this.over = false; }
  reset() { this.nv = 0; this.ni = 0; this.over = false; }
  room(v, i) { if (this.nv + v > this.maxV || this.ni + i > this.maxI) { this.over = true; return false; } return true; }
  v(x, y, z, nx, ny, nz, u = 0, w = 0, r = 1, g = 1, b = 1) {
    const i = this.nv++, o = i * 3;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
    this.nrm[o] = nx; this.nrm[o + 1] = ny; this.nrm[o + 2] = nz;
    if (this.uv) { this.uv[i * 2] = u; this.uv[i * 2 + 1] = w; }
    if (this.col) { this.col[o] = r; this.col[o + 1] = g; this.col[o + 2] = b; }
    return i;
  }
  tri(a, b, c) { this.idx[this.ni++] = a; this.idx[this.ni++] = b; this.idx[this.ni++] = c; }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  take(ox, oz) {
    if (!this.nv || !this.ni) return null;
    // Bounds over the vertices the triangles use (an island chunk's ground keeps its whole grid of vertices but draws
    // only the band outside the island: its bounds, and so its culling and its hot distance, are that band's).
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < this.ni; k++) { const i = this.idx[k], x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    return {
      nv: this.nv, ni: this.ni, pos: this.pos.slice(0, this.nv * 3), nrm: this.nrm.slice(0, this.nv * 3), uv: this.uv ? this.uv.slice(0, this.nv * 2) : null,
      col: this.col ? this.col.slice(0, this.nv * 3) : null, idx: this.idx.slice(0, this.ni),
      bounds: { cx, cy, cz, r: Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 0.5, wx0: x0 + ox, wx1: x1 + ox, wz0: z0 + oz, wz1: z1 + oz },
    };
  }
}
export const SURF_CAPS = { ground: [N_G * N_G, (N_G - 1) * (N_G - 1) * 6], road: [26000, 42000], rock: [44000, 90000] };
// Scratch buffers for one generator at a time. The streamer runs one build at a time and owns the shared set; anything
// that builds a layout beside it (the `chunk fresh=true` check) brings its own, so two builds never write the same arrays.
export function makeScratch() {
  return {
    INST: {
      props: new InstBuf(6000), walls: new InstBuf(1500), roofs: new InstBuf(1200), cacti: new InstBuf(1500), trunks: new InstBuf(800),
      boulders: new InstBuf(900), shrubs: new InstBuf(2400), signs: new InstBuf(64, 4), rails: new InstBuf(2500), barrels: new InstBuf(150), glows: new InstBuf(200),
    },
    SURF: { ground: new MeshBuf(...SURF_CAPS.ground, true, true), road: new MeshBuf(...SURF_CAPS.road, true, false), rock: new MeshBuf(...SURF_CAPS.rock, false, true) },
  };
}
const SHARED = makeScratch();

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const rgb = (hex) => { _c.set(hex); return [_c.r, _c.g, _c.b]; };
const COL = {};
const col = (hex) => (COL[hex] ??= rgb(hex));

// ---- mesas from relief (a pure function of the chunk; neighbours ask for each other's lists) -------------------------
// Rock where the painted relief says the land stands up: buttes on the flats, mesas and ridges where it is high.
export function mesasOf(W, cx, cz) {
  const key = `${cx},${cz}`;
  W.mesaCache ??= new Map();
  if (W.mesaCache.size > 4096) W.mesaCache.clear(); // a pure function: forgetting is free
  if (W.mesaCache.has(key)) return W.mesaCache.get(key);
  const rng = rngOf(hash32(W.seed, cx, cz, 4242));
  const out = [];
  const x0 = cx * C, z0 = cz * C;
  const rel = W.reliefAt(x0 + C / 2, z0 + C / 2), b = BIOMES[W.biomeAt(x0 + C / 2, z0 + C / 2)] ?? BIOMES.d;
  const lambda = b.rock * (0.06 + rel * rel * 1.4); // expected features in this chunk
  let n = 0; for (let L = Math.exp(-lambda), p = rng(); p > L && n < 3; p *= rng()) n++;
  for (let k = 0; k < n; k++) {
    const kind = rel > 0.45 && rng() < 0.45 ? 'ridge' : rng() < 0.55 ? 'mesa' : 'butte';
    const r = kind === 'mesa' ? rng.range(28, 72) : kind === 'ridge' ? rng.range(36, 80) : rng.range(14, 30);
    const x = x0 + rng.range(8, C - 8), z = z0 + rng.range(8, C - 8);
    const h = (kind === 'butte' ? rng.range(14, 30) : kind === 'mesa' ? rng.range(12, 26) : rng.range(18, 42)) * (0.75 + rel * 0.6);
    const m = { x, z, r, h, kind, rot: rng() * Math.PI, seed: rng() * 1000, id: `${key}:${k}` };
    // Keep rock off the road and its interchanges, out of the towns and the island.
    if (inIsland(x, z, r + 40)) continue;
    if (W.project(x, z, r + 120).d < r + 55) continue;
    if (W.exits.some((X) => Math.hypot(X.x - x, X.z - z) < 650 + r || Math.hypot(X.dest.x - x, X.dest.z - z) < 380 + r || (X.access && W.ribbonDist(X.access, x, z) < r + 30))) continue;
    if (W.towns.some((t) => t.built && Math.hypot(t.x - x, t.z - z) < 900 + r)) continue;
    out.push(m);
  }
  W.mesaCache.set(key, out);
  return out;
}
export function mesaHeight(p, x, z) {
  const dx = x - p.x, dz = z - p.z;
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  let lx = dx * c - dz * s, lz = dx * s + dz * c;
  if (p.kind === 'ridge') lz *= 2.2;
  const d = Math.hypot(lx, lz) / p.r;
  if (d >= 1) return 0;
  const n = Math.sin(lx * 0.21 + p.seed) * Math.cos(lz * 0.17 + p.seed * 1.3) * 0.5 + Math.sin(lx * 0.47 - lz * 0.39 + p.seed) * 0.25;
  if (p.kind === 'mesa' || p.kind === 'butte') {
    const cliff = p.kind === 'butte' ? 0.72 : 0.8;
    const top = d < cliff ? 1 : d < cliff + 0.1 ? 1 - ((d - cliff) / 0.1) * 0.75 : 0.25 * Math.pow(1 - (d - cliff - 0.1) / (1 - cliff - 0.1), 2);
    return Math.max(0, p.h * top + n * 1.6 * (d < cliff ? 0.3 : 1));
  }
  const ridged = 1 - Math.abs(Math.sin(lx * 0.09 + p.seed));
  return Math.max(0, p.h * Math.pow(1 - d, 1.6) * (0.75 + 0.35 * ridged) + n * 2.2 * (1 - d));
}

// ---- the generator --------------------------------------------------------------------------------------------------
// tiles: { foot: Uint8Array(65536), car: Uint8Array(16384) } recycled by the streamer; mm: a 128^2 canvas (or null).
export function* layoutChunk(W, cx, cz, tiles, mm, scratch = SHARED) {
  const INST = scratch.INST, SURF = scratch.SURF;
  const t0 = performance.now();
  let work = 0; // ms spent inside the generator (not counting the pauses between slices)
  let tSlice = performance.now();
  const pause = () => { work += performance.now() - tSlice; };
  const resume = () => { tSlice = performance.now(); };
  const ox = cx * C, oz = cz * C, X1 = ox + C, Z1 = oz + C;
  const seed = W.seed, rng = rngOf(hash32(seed, cx, cz, 7)), F = W.featuresOf(cx, cz) ?? { ribbons: [], pieces: [], rails: [], structs: [], buildings: [], signs: [], stops: [], posts: [] };
  const own = (x, z) => x >= ox && x < X1 && z >= oz && z < Z1;
  const isl = cx * C < ISLAND && X1 > -ISLAND && cz * C < ISLAND && Z1 > -ISLAND;
  const out = { cx, cz, key: `${cx},${cz}`, boxes: [], counts: {}, warnings: [], hash: '', edges: {}, buildMs: 0, workMs: 0 };
  for (const k of POOL_NAMES) INST[k].reset();
  for (const k of Object.keys(SURF)) SURF[k].reset();
  const boxes = out.boxes, halo = []; // halo: boxes from features that only reach this chunk's nav margin
  const centre = { x: ox + C / 2, z: oz + C / 2 };
  const biomeKey = W.biomeAt(centre.x, centre.z), state = W.stateAt(centre.x, centre.z) ?? '_';
  const flora = FLORA[state] ?? FLORA._;
  out.biome = BIOMES[biomeKey]?.name ?? biomeKey; out.state = state;

  // Collision: clip a box to the chunk square (and to the nav margin for the halo list).
  const addBox = (x0, z0, x1, z1, tag, height, base = 0) => {
    const ax0 = Math.max(x0, ox), az0 = Math.max(z0, oz), ax1 = Math.min(x1, X1), az1 = Math.min(z1, Z1);
    if (ax1 > ax0 && az1 > az0) boxes.push(StaticWorld.box(ax0, az0, ax1, az1, tag, height, base));
    else if (x1 > ox - 3 && x0 < X1 + 3 && z1 > oz - 3 && z0 < Z1 + 3 && !base) halo.push(StaticWorld.box(x0, z0, x1, z1, tag, height, base));
  };
  // An oriented box (centre, size along its axes, yaw) as AABB slices no thicker than a lane's edge.
  const addOriented = (x, z, sa, su, rot, tag, height, base = 0) => {
    const tx = Math.sin(rot), tz = Math.cos(rot), nx = tz, nz = -tx; // a along (tx,tz), u along (nx,nz)
    const long = sa >= su, L = long ? sa : su, Wd = long ? su : sa, ux = long ? tx : nx, uz = long ? tz : nz;
    const n = Math.max(1, Math.ceil(L / Math.max(1.2, Wd * 1.5)));
    for (let k = 0; k < n; k++) {
      const c0 = -L / 2 + (L / n) * k, c1 = c0 + L / n;
      // The slice's corners.
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const a of [c0, c1]) for (const w of [-Wd / 2, Wd / 2]) {
        const px = x + ux * a + (long ? nx : tx) * w, pz = z + uz * a + (long ? nz : tz) * w;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz);
      }
      addBox(x0, z0, x1, z1, tag, height, base);
    }
  };
  resume();

  // ---- keep-out: what scatter must stay off (the road, interchanges, buildings, mesas) --------------------------------
  const cl = W.cl, segs = [];
  for (let i = 0; i < cl.n - 1; i++) {
    const mx = (cl.x[i] + cl.x[i + 1]) / 2, mz = (cl.z[i] + cl.z[i + 1]) / 2;
    if (mx > ox - 80 && mx < X1 + 80 && mz > oz - 80 && mz < Z1 + 80) segs.push(i);
  }
  const roadD = (x, z) => {
    let best = Infinity;
    for (let k = 0; k < segs.length; k++) {
      const i = segs[k], ax = cl.x[i], az = cl.z[i], dx = cl.x[i + 1] - ax, dz = cl.z[i + 1] - az, l2 = dx * dx + dz * dz;
      let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) best = d;
    }
    return best;
  };
  const mesas = [];
  for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) for (const m of mesasOf(W, cx + ix, cz + iz)) if (m.x + m.r > ox - 2 && m.x - m.r < X1 + 2 && m.z + m.r > oz - 2 && m.z - m.r < Z1 + 2) mesas.push(m);
  const blocked = (x, z, r) => {
    if (inIsland(x, z, r + 3)) return true;
    if (segs.length && roadD(x, z) < 22 + r) return true;
    for (const rb of F.ribbons) if (!rb.mainline && x > rb.x0 && x < rb.x1 && z > rb.z0 && z < rb.z1 && W.ribbonDist(rb, x, z) < Math.max(rb.wl[0], rb.wr[0]) + 4 + rb.ymax * 2 + r) return true;
    for (const b of F.buildings) if (x > b.x0 - 4 - r && x < b.x1 + 4 + r && z > b.z0 - 4 - r && z < b.z1 + 4 + r) return true;
    for (const s of F.structs) if (Math.hypot(s.x - x, s.z - z) < Math.max(s.sa, s.su) / 2 + 3 + r) return true;
    for (const m of mesas) if (Math.hypot(m.x - x, m.z - z) < m.r * 0.95 + r) return true;
    return false;
  };
  yield;

  // ---- ground: an 8 m grid tinted by biome, relief and noise, fading to the island's plain sand at its edge ------------
  {
    const G = SURF.ground, idx = new Int32Array(N_G * N_G);
    const tintAt = (x, z, outc) => {
      // Bilinear biome tint between 500 m usmap cell centres (no hard squares where the biome changes).
      const u = (x / W.K + STREAM.PHX[0] - W.data.world_offset[0]) / W.data.cell_m - 0.5, v = (z / W.K + STREAM.PHX[1] - W.data.world_offset[1]) / W.data.cell_m - 0.5;
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < 4; k++) {
        const ii = Math.max(0, Math.min(W.data.w - 1, i + (k & 1))), jj = Math.max(0, Math.min(W.data.h - 1, j + (k >> 1)));
        const t = (BIOMES[W.data.grid[jj][ii]] ?? BIOMES.d).tint, wgt = (k & 1 ? fu : 1 - fu) * (k >> 1 ? fv : 1 - fv);
        r += t[0] * wgt; g += t[1] * wgt; b += t[2] * wgt;
      }
      const rel = W.reliefAt(x, z), n1 = vnoise(x, z, 340, seed) - 0.5, n2 = vnoise(x, z, 70, seed + 1) - 0.5, n3 = vnoise(x, z, 1400, seed + 2) - 0.5;
      const bright = 1 + n1 * 0.16 + n2 * 0.08 + n3 * 0.1;
      r *= bright; g *= bright * (1 - rel * 0.07); b *= bright * (1 - rel * 0.15);
      // At the island edge the ground fades to the island's own plain sand (no seam).
      const de = Math.max(Math.abs(x), Math.abs(z)) - ISLAND;
      const k = de < 0 ? 0 : de > 220 ? 1 : de / 220;
      outc[0] = 1 + (r - 1) * k; outc[1] = 1 + (g - 1) * k; outc[2] = 1 + (b - 1) * k;
    };
    const tc = [0, 0, 0];
    for (let j = 0; j < N_G; j++) for (let i = 0; i < N_G; i++) {
      const x = ox + i * 8, z = oz + j * 8;
      tintAt(x, z, tc);
      idx[j * N_G + i] = G.v(i * 8, 0, j * 8, 0, 1, 0, (x + 650) / 1300, (650 - z) / 1300, tc[0], tc[1], tc[2]);
    }
    for (let j = 0; j < N_G - 1; j++) for (let i = 0; i < N_G - 1; i++) {
      const x = ox + i * 8 + 4, z = oz + j * 8 + 4;
      if (Math.abs(x) < ISLAND && Math.abs(z) < ISLAND) continue; // the island's own ground plane is under there
      const a = idx[j * N_G + i], b = idx[j * N_G + i + 1], c = idx[(j + 1) * N_G + i + 1], d = idx[(j + 1) * N_G + i];
      G.tri(a, d, c); G.tri(a, c, b);
    }
    // The edge signature: the ground along each edge (what the neighbour must agree with).
    const edgeHash = (pick) => { const h = new Hasher(); for (let k = 0; k < N_G; k++) { const v = pick(k); h.num(G.col[v * 3]).num(G.col[v * 3 + 1]).num(G.col[v * 3 + 2]); } return h; };
    out.edges = { n: edgeHash((k) => idx[k]), s: edgeHash((k) => idx[(N_G - 1) * N_G + k]), w: edgeHash((k) => idx[k * N_G]), e: edgeHash((k) => idx[k * N_G + N_G - 1]) };
  }
  pause(); yield; resume();

  // ---- road ribbons: the segments whose midpoint is in this chunk --------------------------------------------------------
  const R = SURF.road, crossings = { n: [], s: [], w: [], e: [] };
  for (const rb of F.ribbons) {
    let prevA = -1, prevB = -1, prevI = -2, prevBand = null;
    for (let i = 0; i < rb.n - 1; i++) {
      const mx = (rb.x[i] + rb.x[i + 1]) / 2, mz = (rb.z[i] + rb.z[i + 1]) / 2;
      if (!own(mx, mz)) continue;
      // A ramp's stretch alongside the mainline is painted as an added lane.
      const band = rb.aux && i >= rb.aux[0] && i < rb.aux[1] ? 'aux' : rb.band;
      const [v0, v1] = BAND[band] ?? BAND.county, per = UPER[band] ?? 14;
      if (band !== prevBand) { prevI = -2; prevBand = band; }
      // The mainline inside the island is Route 66, already built; the island's own streets never reach here.
      if (rb.mainline && inIsland(mx, mz, -0.5)) continue;
      if (!R.room(4, 6)) break;
      // Edges at both ends of the segment (per-point normals from the neighbours: both chunks agree at a seam).
      const edge = (k) => {
        const k0 = Math.max(0, k - 1), k1 = Math.min(rb.n - 1, k + 1), tx = rb.x[k1] - rb.x[k0], tz = rb.z[k1] - rb.z[k0], l = Math.hypot(tx, tz) || 1;
        const nx = -tz / l, nz = tx / l;
        return [rb.x[k] - nx * rb.wl[k] - ox, rb.z[k] - nz * rb.wl[k] - oz, rb.x[k] + nx * rb.wr[k] - ox, rb.z[k] + nz * rb.wr[k] - oz, rb.y[k]];
      };
      let a, b;
      if (prevI === i - 1) { a = prevA; b = prevB; }
      else { const e0 = edge(i); a = R.v(e0[0], e0[4], e0[1], 0, 1, 0, rb.s[i] / per, v0); b = R.v(e0[2], e0[4], e0[3], 0, 1, 0, rb.s[i] / per, v1); }
      const e1 = edge(i + 1);
      const c = R.v(e1[2], e1[4], e1[3], 0, 1, 0, rb.s[i + 1] / per, v1), d = R.v(e1[0], e1[4], e1[1], 0, 1, 0, rb.s[i + 1] / per, v0);
      R.tri(a, c, d); R.tri(a, b, c); // wound to face up
      prevA = d; prevB = c; prevI = i;
    }
    // The seam signature: every segment with one end in this chunk and one out, named by its index, on the edge it
    // crosses. The neighbour lists the same segment on its opposite edge.
    for (let i = 0; i < rb.n - 1; i++) {
      const ia = own(rb.x[i], rb.z[i]), ib = own(rb.x[i + 1], rb.z[i + 1]);
      if (ia === ib) continue;
      const xo = ia ? rb.x[i + 1] : rb.x[i], zo = ia ? rb.z[i + 1] : rb.z[i];
      crossings[zo < oz ? 'n' : zo >= Z1 ? 's' : xo < ox ? 'w' : 'e'].push(`${rb.id}@${i}`);
    }
  }
  // Stop lines across each off-ramp at the cross road.
  for (const st of F.stops) {
    if (!own(st.x, st.z) || !R.room(4, 6)) continue;
    const tx = Math.sin(st.h), tz = Math.cos(st.h), nx = tz, nz = -tx, hw = st.w / 2 + 0.3, y = st.y + 0.05;
    const p = (a, u) => [st.x + tx * a + nx * u - ox, st.z + tz * a + nz * u - oz];
    const [ax, az] = p(-0.6, -hw), [bx, bz] = p(-0.6, hw), [cx2, cz2] = p(0.0, hw), [dx, dz] = p(0.0, -hw);
    const i0 = R.v(ax, y, az, 0, 1, 0, 0.5, BAND.white[0]), i1 = R.v(bx, y, bz, 0, 1, 0, 0.5, BAND.white[1]), i2 = R.v(cx2, y, cz2, 0, 1, 0, 0.6, BAND.white[1]), i3 = R.v(dx, y, dz, 0, 1, 0, 0.6, BAND.white[0]);
    R.quad(i0, i1, i2, i3); R.quad(i0, i3, i2, i1);
  }
  pause(); yield; resume();

  // ---- earthworks (the fills under ramps and the cross road) and the bridge -------------------------------------------
  const K = SURF.rock;
  const fillCol = col('#8d6c4c'), slopeCol = col('#7a5c40'), toeCol = col('#9a7a58');
  for (const p of F.pieces) {
    const rb = p.rib;
    for (let i = 0; i < rb.n - 1; i++) {
      const mx = (rb.x[i] + rb.x[i + 1]) / 2, mz = (rb.z[i] + rb.z[i + 1]) / 2;
      if (!own(mx, mz)) continue;
      const h0 = rb.y[i] - 0.04, h1 = rb.y[i + 1] - 0.04;
      if (h0 < 0.08 && h1 < 0.08) continue;
      if (p.kind === 'cross') { const X = p.exit, u = (mx - X.x) * X.nx + (mz - X.z) * X.nz; if (Math.abs(u) <= p.deck + 0.5) continue; } // the deck is a slab, not a fill
      if (!K.room(16, 24)) break;
      const nrm = (k) => { const k0 = Math.max(0, k - 1), k1 = Math.min(rb.n - 1, k + 1), tx = rb.x[k1] - rb.x[k0], tz = rb.z[k1] - rb.z[k0], l = Math.hypot(tx, tz) || 1; return [-tz / l, tx / l]; };
      const [n0x, n0z] = nrm(i), [n1x, n1z] = nrm(i + 1);
      for (const sd of [-1, 1]) {
        const w0 = (sd < 0 ? rb.wl[i] : rb.wr[i]) + 0.7, w1 = (sd < 0 ? rb.wl[i + 1] : rb.wr[i + 1]) + 0.7;
        const pt = (k, nx, nz, w, h) => [rb.x[k] + nx * sd * w - ox, h, rb.z[k] + nz * sd * w - oz];
        // Gravel shoulder on top, then a 2:1 slope down to the ground.
        const a = pt(i, n0x, n0z, 0, h0), b = pt(i + 1, n1x, n1z, 0, h1), c = pt(i + 1, n1x, n1z, w1, h1), d = pt(i, n0x, n0z, w0, h0);
        const e = pt(i + 1, n1x, n1z, w1 + 2 * h1, -0.02), f = pt(i, n0x, n0z, w0 + 2 * h0, -0.02);
        const up = [0, 1, 0], sl = [n0x * sd * 0.45, 0.89, n0z * sd * 0.45];
        const va = K.v(...a, ...up, 0, 0, ...fillCol), vb = K.v(...b, ...up, 0, 0, ...fillCol), vc = K.v(...c, ...up, 0, 0, ...fillCol), vd = K.v(...d, ...up, 0, 0, ...fillCol);
        const vc2 = K.v(...c, ...sl, 0, 0, ...slopeCol), vd2 = K.v(...d, ...sl, 0, 0, ...slopeCol), ve = K.v(...e, ...sl, 0, 0, ...toeCol), vf = K.v(...f, ...sl, 0, 0, ...toeCol);
        if (sd > 0) { K.quad(va, vb, vc, vd); K.quad(vd2, vc2, ve, vf); } else { K.quad(va, vd, vc, vb); K.quad(vd2, vf, ve, vc2); }
      }
    }
  }
  // Bridge parts and any other oriented structure: the visual where the centre is, collision clipped everywhere.
  const boxGeo = (x, y0, y1, z, sa, su, rot, rgbc) => {
    if (!K.room(24, 36)) return;
    const tx = Math.sin(rot), tz = Math.cos(rot), nx = tz, nz = -tx;
    const corner = (a, u, y) => [x + tx * a + nx * u - ox, y, z + tz * a + nz * u - oz];
    const faces = [
      [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [0, 1, 0]],       // top
      [[-1, -1, 0], [-1, 1, 0], [1, 1, 0], [1, -1, 0], [0, -1, 0]],      // bottom
      [[1, -1, 0], [1, 1, 0], [1, 1, 1], [1, -1, 1], [tx, 0, tz]],        // +a
      [[-1, 1, 0], [-1, -1, 0], [-1, -1, 1], [-1, 1, 1], [-tx, 0, -tz]],  // -a
      [[1, 1, 0], [-1, 1, 0], [-1, 1, 1], [1, 1, 1], [nx, 0, nz]],        // +u
      [[-1, -1, 0], [1, -1, 0], [1, -1, 1], [-1, -1, 1], [-nx, 0, -nz]],  // -u
    ];
    for (const f of faces) {
      const nn = f[4], shade = nn[1] > 0.5 ? 1 : nn[1] < -0.5 ? 0.55 : 0.82;
      const ids = f.slice(0, 4).map(([a, u, top]) => K.v(...corner(a * sa / 2, u * su / 2, top ? y1 : y0), nn[0], nn[1], nn[2], 0, 0, rgbc[0] * shade, rgbc[1] * shade, rgbc[2] * shade));
      K.quad(ids[0], ids[1], ids[2], ids[3]); // the rock material is double-sided and flat-shaded: winding never bites
    }
  };
  for (const s of F.structs) {
    if (own(s.x, s.z)) boxGeo(s.x, s.y0, s.y1, s.z, s.sa, s.su, s.rot, col(s.col));
    if (s.solid) addOriented(s.x, s.z, s.sa, s.su, s.rot, s.tag, s.y1, s.base);
  }
  pause(); yield; resume();

  // ---- mesas: rock heightfields (owned where their centre is), solid where they stand taller than a step ---------------
  {
    const cRock = new THREE.Color('#8a4a2e'), cBand = new THREE.Color('#a8603a'), cTop = new THREE.Color('#a8684a'), cBase = new THREE.Color('#9c7450'), cDark = new THREE.Color('#4a2c1c'), tmp = new THREE.Color();
    for (const m of mesas) {
      if (own(m.x, m.z)) {
        const step = m.r > 50 ? 2.6 : 2, seg = Math.max(16, Math.ceil((m.r * 2.1) / step)), span = m.r * 2.1;
        if (K.room((seg + 1) * (seg + 1), seg * seg * 6)) {
          const base = K.nv;
          for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
            const x = m.x - span / 2 + (i / seg) * span, z = m.z - span / 2 + (j / seg) * span;
            const h = mesaHeight(m, x, z), k = h / m.h;
            const slope = Math.min(1, (Math.abs(mesaHeight(m, x + 1.2, z) - h) + Math.abs(mesaHeight(m, x, z + 1.2) - h)) / 2.4);
            tmp.copy(cBase).lerp(cRock, Math.min(1, k * 1.4));
            if (Math.sin(h * 1.7 + m.seed) > 0.55) tmp.lerp(cBand, 0.5);
            if (k > 0.92) tmp.lerp(cTop, 0.6);
            tmp.lerp(cDark, slope * 0.55);
            K.v(x - ox, h > 0.02 ? h : -0.05, z - oz, 0, 1, 0, 0, 0, tmp.r, tmp.g, tmp.b);
          }
          for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
            const a = base + j * (seg + 1) + i, b = a + 1, c = a + seg + 2, d = a + seg + 1;
            K.tri(a, d, c); K.tri(a, c, b);
          }
          // Normals for a faceted look come from the shader (flatShading); keep a plausible up-normal per vertex.
        }
      }
      // Collision: the footprint where it stands taller than a step, 4 m cells, row-merged, clipped to this chunk.
      const CELL = 4;
      const gx0 = Math.floor(Math.max(m.x - m.r, ox - 4) / CELL), gx1 = Math.ceil(Math.min(m.x + m.r, X1 + 4) / CELL);
      const gz0 = Math.floor(Math.max(m.z - m.r, oz - 4) / CELL), gz1 = Math.ceil(Math.min(m.z + m.r, Z1 + 4) / CELL);
      for (let zc = gz0; zc <= gz1; zc++) {
        let run = null;
        for (let xc = gx0; xc <= gx1 + 1; xc++) {
          const solid = xc <= gx1 && mesaHeight(m, (xc + 0.5) * CELL, (zc + 0.5) * CELL) > 1.2;
          if (solid && run === null) run = xc;
          if (!solid && run !== null) { addBox(run * CELL, zc * CELL, xc * CELL, (zc + 1) * CELL, 'rock', 20); run = null; }
        }
      }
      pause(); yield; resume();
    }
  }

  // ---- rails: W-beam guardrails on posts along every tall fill --------------------------------------------------------
  const RAILC = col('#9a9890'), POSTC = col('#3a3632');
  for (const r of F.rails) {
    for (let k = 1; k < r.pts.length; k++) {
      const a = r.pts[k - 1], b = r.pts[k], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const len = Math.hypot(b.x - a.x, b.z - a.z), rot = Math.atan2(b.x - a.x, b.z - a.z), y = (a.y + b.y) / 2;
      if (own(mx, mz)) {
        _e.set(Math.atan2(a.y - b.y, len), rot, 0); _q.setFromEuler(_e);
        _m.compose(_p.set(mx, y + 0.62, mz), _q, _s.set(0.16, 0.32, len + 0.05));
        INST.rails.pushMatrix(_m, RAILC[0], RAILC[1], RAILC[2]);
        if (k % 1 === 0) INST.props.push(a.x, a.y + 0.36, a.z, rot, 0.14, 0.72, 0.14, POSTC[0], POSTC[1], POSTC[2]);
      }
      // Collision in pieces no longer than 1.5 m (an AABB of a diagonal rail stays thin).
      const n = Math.max(1, Math.ceil(len / 1.5));
      for (let q = 0; q < n; q++) {
        const t0 = q / n, t1 = (q + 1) / n;
        const x0 = a.x + (b.x - a.x) * t0, z0 = a.z + (b.z - a.z) * t0, x1 = a.x + (b.x - a.x) * t1, z1 = a.z + (b.z - a.z) * t1;
        addBox(Math.min(x0, x1) - 0.12, Math.min(z0, z1) - 0.12, Math.max(x0, x1) + 0.12, Math.max(z0, z1) + 0.12, 'rail', y + 0.95);
      }
    }
  }
  pause(); yield; resume();

  // ---- buildings: towns and exit communities, solid shells (P1: dead towns, nobody home) -----------------------------
  for (const b of F.buildings) {
    addBox(b.x0, b.z0, b.x1, b.z1, 'building', b.h);
    if (!own(b.cx, b.cz)) continue;
    const brng = rngOf(b.seed), wc = col(b.color), rc = col(b.roof), w = b.x1 - b.x0, d = b.z1 - b.z0;
    INST.walls.push(b.cx, b.h / 2, b.cz, 0, w, b.h, d, wc[0], wc[1], wc[2]);
    if (b.ruined) {
      for (let i = 0; i < 4; i++) {
        const sx = brng.range(w * 0.2, w * 0.5), sz = brng.range(d * 0.2, d * 0.5), hh = brng.range(1, 5);
        INST.walls.push(b.cx + brng.range(-w / 2 + sx / 2, w / 2 - sx / 2), b.h + hh / 2, b.cz + brng.range(-d / 2 + sz / 2, d / 2 - sz / 2), 0, sx, hh, sz, wc[0], wc[1], wc[2]);
      }
      for (let i = 0; i < 5; i++) INST.props.push(b.cx + brng.range(-w / 2 - 2, w / 2 + 2), 0.3, b.cz + brng.range(-d / 2 - 2, d / 2 + 2), brng() * 3, brng.range(0.8, 2.2), brng.range(0.3, 0.8), brng.range(0.8, 2.2), wc[0] * 0.8, wc[1] * 0.8, wc[2] * 0.8);
    } else {
      INST.roofs.push(b.cx, b.h + 0.2, b.cz, 0, w + 0.6, 0.4, d + 0.6, rc[0], rc[1], rc[2]);
      for (let i = 0, n = brng.int(1, 3); i < n; i++) INST.roofs.push(b.cx + brng.range(-w / 3, w / 3), b.h + 0.8, b.cz + brng.range(-d / 3, d / 3), 0, brng.range(1.2, 2.6), brng.range(0.8, 1.4), brng.range(1.2, 2.6), 0.37, 0.35, 0.33);
    }
    if (b.canopy) {
      // A fuel stop: a canopy on four posts over two pump islands, out front toward the street.
      const fx = b.cx + (w > d ? 0 : (w / 2 + 7) * (b.cx > b.x0 ? 1 : -1)), fz = b.cz + (w > d ? d / 2 + 7 : 0);
      INST.roofs.push(fx, 4.6, fz, 0, 10, 0.35, 7, 0.55, 0.5, 0.42);
      for (const [px, pz] of [[-4.4, -3], [4.4, -3], [-4.4, 3], [4.4, 3]]) { INST.props.push(fx + px, 2.3, fz + pz, 0, 0.3, 4.6, 0.3, 0.3, 0.29, 0.27); addBox(fx + px - 0.2, fz + pz - 0.2, fx + px + 0.2, fz + pz + 0.2, 'post', 4.6); }
      for (const px of [-2, 2]) { INST.props.push(fx + px, 0.7, fz, 0, 0.7, 1.4, 1.6, 0.62, 0.22, 0.13); addBox(fx + px - 0.4, fz - 0.85, fx + px + 0.4, fz + 0.85, 'pump', 1.4); }
    }
  }
  pause(); yield; resume();

  // ---- signs (faces from the atlas), stop signs, mileposts, power poles ------------------------------------------------
  const SIGNPOST = col('#5b5a55');
  const signAt = (x, z, rot, w, hgt, slot, lift = 1.7) => {
    // Posts on the ground, the panel laid back toward the sky so the top-down camera reads it (text upright on screen).
    for (const s of [-1, 1]) {
      const px = x + Math.cos(rot) * s * w * 0.32, pz = z - Math.sin(rot) * s * w * 0.32;
      INST.props.push(px, (lift + hgt * 0.4) / 2, pz, rot, 0.16, lift + hgt * 0.4, 0.16, SIGNPOST[0], SIGNPOST[1], SIGNPOST[2]);
      addBox(px - 0.15, pz - 0.15, px + 0.15, pz + 0.15, 'signpost', lift + hgt * 0.4);
    }
    _e.set(-1.22, 0, 0); _q.setFromEuler(_e); // tilt back ~70 degrees (the panel faces up and a little south, toward the camera)
    _m.compose(_p.set(x, lift + hgt * 0.32, z), _q, _s.set(w, hgt, 1));
    const i = INST.signs.pushMatrix(_m, 1, 1, 1);
    if (i >= 0) INST.signs.e.set(W.signAtlas?.rect(slot) ?? [0, 0, 1, 1], i * 4);
  };
  for (const s of F.signs) if (own(s.x, s.z)) signAt(s.x, s.z, s.h, s.w, s.hgt, s.id);
  for (const st of F.stops) {
    const sp = st.sign;
    if (!own(sp.x, sp.z)) continue;
    signAt(sp.x, sp.z, st.h, 1.1, 1.1, 'STOP', st.y + 1.6);
  }
  const MP = col('#2c5a3c');
  for (const m of F.posts) if (own(m.x, m.z)) { INST.props.push(m.x, 0.55, m.z, m.h, 0.08, 1.1, 0.08, 0.35, 0.34, 0.32); INST.props.push(m.x, 1.15, m.z, m.h, 0.36, 0.5, 0.06, MP[0], MP[1], MP[2]); }
  // Power poles along the north/east side of the interstate, every 70 m, skipping interchanges and the island.
  if (segs.length) {
    const POLE = col('#4a3a2a'), ARM = col('#3d3026');
    const sA = cl.s[segs[0]], sB = cl.s[segs[segs.length - 1] + 1];
    for (let s = Math.ceil(sA / 70) * 70; s < sB; s += 70) {
      const f = W.at(s), u = W.section(s).out + 24, x = f.x + f.nx * u, z = f.z + f.nz * u;
      if (!own(x, z) || inIsland(x, z, 30) || W.exits.some((X) => Math.abs(X.s - s) < 520)) continue;
      if (W.towns.some((t) => t.built && Math.hypot(t.x - x, t.z - z) < 700)) continue;
      const lean = (hash32(seed, Math.round(s)) % 100) / 100 - 0.5, rot = Math.atan2(f.tx, f.tz);
      INST.trunks.push(x, 4.6, z, rot, 0.62, 9.2, 0.62, POLE[0], POLE[1], POLE[2]);
      INST.props.push(x, 8.6, z, rot + Math.PI / 2 + lean * 0.12, 2.6, 0.14, 0.14, ARM[0], ARM[1], ARM[2]);
      for (const k of [-1, 0, 1]) INST.props.push(x + f.tx * k * 1.1, 8.78, z + f.tz * k * 1.1, 0, 0.1, 0.2, 0.1, 0.55, 0.52, 0.48);
      addBox(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 'pole', 9);
    }
  }
  pause(); yield; resume();

  // ---- wrecks on the shoulders and in the median: an old evacuation, cars left where they died ---------------------------
  const WRECK = ['#5a3a24', '#4a3020', '#6b4a2e', '#3d3a36', '#704020', '#4f5a52', '#6a5a3a'];
  const wreck = (x, z, rot, c) => {
    const along = Math.abs(Math.sin(rot)) > 0.7;
    const wc = col(c);
    INST.props.push(x, 0.55, z, rot, 1.9, 0.8, 4.2, wc[0], wc[1], wc[2]);
    INST.props.push(x, 1.15, z, rot, 1.6, 0.6, 2.0, 0.16, 0.15, 0.13);
    if (along) addBox(x - 2.1, z - 0.95, x + 2.1, z + 0.95, 'wreck', 1.4); else addBox(x - 0.95, z - 2.1, x + 0.95, z + 2.1, 'wreck', 1.4);
  };
  for (const i of segs) {
    const mx = (cl.x[i] + cl.x[i + 1]) / 2, mz = (cl.z[i] + cl.z[i + 1]) / 2;
    if (!own(mx, mz) || inIsland(mx, mz, 60)) continue;
    const h = hash32(seed, i, 99);
    if (h % 1000 > 11) continue; // about one every 700 m
    const s = cl.s[i], sec = W.section(s);
    if (W.exits.some((X) => Math.abs(X.s - s) < 600)) continue;
    const f = W.at(s), roadRot = Math.atan2(f.tx, f.tz);
    const rot = Math.round(roadRot / (Math.PI / 2)) * (Math.PI / 2) + ((h >> 10) % 100 - 50) / 400;
    const median = (h >> 4) % 3 === 0, side = (h >> 6) % 2 ? 1 : -1;
    const along = Math.abs(Math.sin(rot)) > 0.7, hx = along ? 2.1 : 0.95, hz = along ? 0.95 : 2.1;
    // Lateral reach of the axis-aligned footprint toward the lanes.
    const reach = Math.abs(f.nx) * hx + Math.abs(f.nz) * hz;
    const u = median ? 0 : side * (sec.lane2 + 0.5 + reach);
    if (median && reach > sec.med - 0.2) continue;
    wreck(f.x + f.nx * u, f.z + f.nz * u, rot, WRECK[h % WRECK.length]);
  }
  pause(); yield; resume();

  // ---- desert scatter: shrubs, cacti, boulders, trees by biome and state; a rare shack or camp ---------------------------
  const B = BIOMES[biomeKey] ?? BIOMES.d, ha = (C * C) / 10000;
  const rel = W.reliefAt(centre.x, centre.z);
  const shrubC = col(flora.shrub);
  const pois = (lam) => { let n = 0; const L = Math.exp(-Math.min(lam, 60)); for (let p = rng(); p > L; p *= rng()) n++; return lam > 60 ? Math.round(lam + (rng() - 0.5) * Math.sqrt(lam) * 2) : n; };
  const spot = (r) => { for (let t = 0; t < 4; t++) { const x = ox + rng.range(3, C - 3), z = oz + rng.range(3, C - 3); if (!blocked(x, z, r)) return [x, z]; } return null; };
  const nShrub = pois(B.shrubs * ha), nCact = pois(B.cacti * ha), nBould = pois(B.boulders * ha * (0.6 + rel * 1.6)), nTree = pois(B.trees * ha);
  for (let k = 0; k < nShrub; k++) {
    const p = spot(0.8); if (!p) continue;
    // Creosote and brittlebush: a low clump of two or three lumps, dusty olive, darker in the hollows.
    const s = rng.range(0.45, 1.25), v = rng.range(0.72, 1.08), lumps = rng.int(1, 3);
    for (let q = 0; q < lumps; q++) {
      const a = rng() * 6.28, d = q ? s * rng.range(0.45, 0.85) : 0, ss = s * (q ? rng.range(0.5, 0.8) : 1), t = rng.range(0.94, 1.06);
      INST.shrubs.push(p[0] + Math.cos(a) * d, ss * 0.2, p[1] + Math.sin(a) * d, rng() * 6.28, ss * rng.range(0.9, 1.3), ss * 0.52, ss * rng.range(0.9, 1.3), shrubC[0] * v, shrubC[1] * v * t, shrubC[2] * v);
    }
    if ((k & 63) === 63) { pause(); yield; resume(); }
  }
  const CACT = col('#56653a');
  for (let k = 0; k < nCact; k++) {
    const p = spot(1.2); if (!p) continue;
    const [x, z] = p, v = rng.range(0.85, 1.12);
    if (flora.cactus === 'saguaro' && rng() < 0.75) {
      // A saguaro: a tall trunk and up to three arms that bend up.
      const h = rng.range(4.5, 9.5);
      INST.cacti.push(x, h / 2, z, 0, 1.25, h, 1.25, CACT[0] * v, CACT[1] * v, CACT[2] * v);
      for (let a = 0, na = rng.int(0, 3); a < na; a++) {
        const ang = rng() * 6.28, ay = h * rng.range(0.42, 0.7), reach = rng.range(0.9, 1.4), up = rng.range(1.4, 2.6);
        const ex = x + Math.cos(ang) * reach, ez = z + Math.sin(ang) * reach;
        INST.cacti.push(x + Math.cos(ang) * reach * 0.5, ay, z + Math.sin(ang) * reach * 0.5, -ang + Math.PI / 2, 0.85, 0.85, reach, CACT[0] * v, CACT[1] * v, CACT[2] * v);
        INST.cacti.push(ex, ay + up / 2, ez, 0, 0.85, up, 0.85, CACT[0] * v, CACT[1] * v, CACT[2] * v);
      }
      addBox(x - 0.45, z - 0.45, x + 0.45, z + 0.45, 'cactus', h);
    } else {
      // Barrel cactus or cholla: low and stout.
      const h = rng.range(0.7, 2.2);
      INST.cacti.push(x, h / 2, z, 0, rng.range(1.0, 1.8), h, rng.range(1.0, 1.8), CACT[0] * v * 1.05, CACT[1] * v, CACT[2] * v * 0.9);
      if (h > 1.4) addBox(x - 0.4, z - 0.4, x + 0.4, z + 0.4, 'cactus', h);
    }
  }
  pause(); yield; resume();
  const ROCKC = [col('#7e6248'), col('#8a6a4e'), col('#6e5440'), col('#94735a')];
  for (let k = 0; k < nBould; k++) {
    const big = rng() < 0.25, r = big ? rng.range(1.6, 3.6) : rng.range(0.4, 1.3);
    const p = spot(r); if (!p) continue;
    const c = ROCKC[rng.int(0, 3)], v = rng.range(0.85, 1.1);
    INST.boulders.push(p[0], r * 0.35, p[1], rng() * 6.28, r * rng.range(0.9, 1.3), r * rng.range(0.55, 0.9), r * rng.range(0.9, 1.3), c[0] * v, c[1] * v, c[2] * v);
    if (big) addBox(p[0] - r * 0.8, p[1] - r * 0.8, p[0] + r * 0.8, p[1] + r * 0.8, 'boulder', r * 0.7);
  }
  const TRUNK = col('#3b2c20'), JOSH = col('#4a4628'), YUC = col('#5c6438'), PALO = col('#5d6a3c');
  for (let k = 0; k < nTree; k++) {
    const p = spot(1.5); if (!p) continue;
    const [x, z] = p;
    if (flora.tree === 'joshua' || flora.tree === 'yucca') {
      // Joshua trees and yucca: a shaggy trunk that forks into spiky heads.
      const h = flora.tree === 'joshua' ? rng.range(3, 6.5) : rng.range(1.2, 2.6), hc = flora.tree === 'joshua' ? JOSH : YUC;
      INST.trunks.push(x, h / 2, z, 0, 1.2, h, 1.2, 0.33, 0.27, 0.2);
      for (let a = 0, na = rng.int(1, flora.tree === 'joshua' ? 4 : 1); a < na; a++) {
        const ang = rng() * 6.28, rr = flora.tree === 'joshua' ? rng.range(0.6, 1.4) : 0;
        INST.shrubs.push(x + Math.cos(ang) * rr, h + 0.2, z + Math.sin(ang) * rr, ang, 0.9, 0.7, 0.9, hc[0], hc[1], hc[2]);
      }
      addBox(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 'tree', h);
    } else {
      // A dead mesquite or palo verde: a trunk and a few bare limbs (green-barked palo verde keeps a thin crown).
      const h = rng.range(2.5, 5.5);
      INST.trunks.push(x, h / 2, z, 0, 1, h, 1, TRUNK[0], TRUNK[1], TRUNK[2]);
      for (let i = 0; i < 3; i++) { const a = rng() * Math.PI * 2; INST.props.push(x + Math.cos(a) * 0.8, h * rng.range(0.55, 0.9), z + Math.sin(a) * 0.8, a, 1.8, 0.16, 0.16, TRUNK[0], TRUNK[1], TRUNK[2]); }
      if (flora.tree === 'paloverde' && rng() < 0.6) INST.shrubs.push(x, h * 0.85, z, rng() * 6, 2.6, 1.1, 2.6, PALO[0], PALO[1], PALO[2]);
      addBox(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 'tree', h);
    }
  }
  // A shack (5%) and a camp (2%): somebody tried to live out here.
  if (!isl && rng() < 0.05) {
    const p = spot(9);
    if (p) {
      const [x, z] = p, w = rng.range(6, 10), d = rng.range(5, 8), h = rng.range(2.6, 3.4), c = col(rng.pick(['#6e6a62', '#7c756a', '#857c6e', '#7a5a3a']));
      INST.walls.push(x, h / 2, z, 0, w, h, d, c[0], c[1], c[2]);
      INST.roofs.push(x, h + 0.15, z, 0, w + 0.8, 0.25, d + 0.8, 0.42, 0.37, 0.31);
      addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 'shack', h);
      for (let k = 0; k < 4; k++) INST.props.push(x + rng.range(-w, w), 0.4, z + d / 2 + rng.range(1, 5), rng() * 3, rng.range(0.6, 1.4), rng.range(0.4, 0.9), rng.range(0.6, 1.4), 0.45, 0.33, 0.22);
      if (rng() < 0.5) wreck(x + w / 2 + 4, z + rng.range(-3, 3), rng.pick([0, Math.PI / 2]), rng.pick(WRECK));
    }
  }
  if (!isl && rng() < 0.02) {
    const p = spot(16);
    if (p) {
      const [x, z] = p, BARREL = col('#5a2e1a');
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 7) {
        if (Math.abs(Math.sin(a)) < 0.2) continue;
        const jx = x + Math.cos(a) * 12, jz = z + Math.sin(a) * 12, jc = col(rng.pick(['#5a3a24', '#6b4a2e', '#4a4440', '#7a4a22']));
        INST.props.push(jx, 1.0, jz, -a + Math.PI / 2, 4.6, 2.0, 0.5, jc[0], jc[1], jc[2]);
        addBox(jx - 1.3, jz - 1.3, jx + 1.3, jz + 1.3, 'junk', 2);
      }
      for (let t = 0; t < 2; t++) { const a = rng() * 6.28, dd = rng.range(4, 7), tc = col(rng.pick(['#7c5a3a', '#5d4a34', '#8a6a44'])); INST.props.push(x + Math.cos(a) * dd, 1, z + Math.sin(a) * dd, a, 3.2, 2, 3.2, tc[0], tc[1], tc[2]); addBox(x + Math.cos(a) * dd - 1.4, z + Math.sin(a) * dd - 1.4, x + Math.cos(a) * dd + 1.4, z + Math.sin(a) * dd + 1.4, 'tent', 2); }
      INST.barrels.push(x, 0.55, z, 0, 1, 1, 1, BARREL[0], BARREL[1], BARREL[2]);
      addBox(x - 0.45, z - 0.45, x + 0.45, z + 0.45, 'barrel', 1.1);
      INST.glows.push(x, 0.12, z, 0, 18, 1, 18, 1, 0.54, 0.23);
    }
  }
  pause(); yield; resume();

  // ---- nav tiles: owned boxes plus the halo (features a little past the edge) -------------------------------------------
  {
    const foot = tiles.foot, car = tiles.car;
    foot.a.fill(0); car.a.fill(0);
    const rast = (tile, cell, radius) => {
      const n = C / cell, a = tile.a;
      let any = 0;
      const lo = (v, o) => Math.max(0, Math.ceil((v - o) / cell - 0.5)), hi = (v, o) => Math.min(n - 1, Math.floor((v - o) / cell - 0.5));
      for (const list of [boxes, halo]) for (const b of list) {
        if (b.base > 0) continue;
        const x0 = lo(b.minX - radius, ox), x1 = hi(b.maxX + radius, ox), z0 = lo(b.minZ - radius, oz), z1 = hi(b.maxZ + radius, oz);
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { a[z * n + x] = 1; any = 1; }
      }
      // Inside the island the pinned store answers: leave those cells to it.
      tile.any = !!any;
    };
    rast(foot, 1, RAD_FOOT);
    rast(car, 2, RAD_CAR);
  }
  pause(); yield; resume();

  // ---- the minimap tile: 2 m per pixel, in the HUD radar's greens ------------------------------------------------------
  if (mm) {
    const g = mm.getContext('2d'), k = mm.width / C;
    const tc = SURF.ground.col, base = (Math.round(N_G / 2) * N_G + Math.round(N_G / 2)) * 3;
    const lum = Math.min(1, ((tc[base] * 0.3 + tc[base + 1] * 0.59 + tc[base + 2] * 0.11) * 0.55 - 0.11) / 0.45);
    g.fillStyle = `rgb(${Math.round(22 + 70 * lum * 0.5)},${Math.round(32 + 88 * lum * 0.5)},${Math.round(14 + 34 * lum * 0.5)})`;
    g.fillRect(0, 0, mm.width, mm.height);
    for (const m of mesas) { g.fillStyle = 'rgba(92,70,40,0.85)'; g.beginPath(); g.ellipse((m.x - ox) * k, (m.z - oz) * k, m.r * k * 0.85, (m.kind === 'ridge' ? m.r / 2.2 : m.r) * k * 0.85, -m.rot, 0, 6.29); g.fill(); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const rb of F.ribbons) {
      if (rb.x1 < ox || rb.x0 > X1 || rb.z1 < oz || rb.z0 > Z1) continue;
      g.strokeStyle = rb.kind === 'hwy' ? '#8cae58' : '#708c48'; g.lineWidth = Math.max(1.5, (rb.wl[0] + rb.wr[0]) * k * (rb.kind === 'hwy' ? 1.6 : 1.1));
      g.beginPath();
      let started = false;
      for (let i = 0; i < rb.n; i++) {
        const x = rb.x[i], z = rb.z[i];
        if (x < ox - 20 || x > X1 + 20 || z < oz - 20 || z > Z1 + 20) { started = false; continue; }
        if (!started) { g.moveTo((x - ox) * k, (z - oz) * k); started = true; } else g.lineTo((x - ox) * k, (z - oz) * k);
      }
      g.stroke();
    }
    g.fillStyle = '#4c6a2c';
    for (const b of F.buildings) g.fillRect((b.x0 - ox) * k, (b.z0 - oz) * k, (b.x1 - b.x0) * k, (b.z1 - b.z0) * k);
    if (isl) g.clearRect(Math.max(0, (-ISLAND - ox) * k), Math.max(0, (-ISLAND - oz) * k), Math.max(0, (Math.min(X1, ISLAND) - Math.max(ox, -ISLAND)) * k), Math.max(0, (Math.min(Z1, ISLAND) - Math.max(oz, -ISLAND)) * k));
  }

  // ---- take the results, hash them -----------------------------------------------------------------------------------
  out.surf = { ground: SURF.ground.take(ox, oz), road: SURF.road.take(ox, oz), rock: SURF.rock.take(ox, oz) };
  out.inst = {};
  let n = 0;
  for (const k of POOL_NAMES) { if (INST[k].n) out.inst[k] = INST[k].take(); out.counts[k] = INST[k].n; n += INST[k].n; if (INST[k].n >= INST[k].cap) out.warnings.push(`instance cap ${k}`); }
  for (const k of Object.keys(SURF)) if (SURF[k].over) out.warnings.push(`surface cap ${k}`);
  out.instances = n;
  out.buildings = F.buildings.filter((b) => own(b.cx, b.cz)).length;
  out.tiles = tiles; out.mm = mm;
  // Content bounds (what the hot ring measures distance to): owned instances and surfaces, never the island interior.
  let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
  const grow = (x0, z0, x1, z1) => { if (x0 < bx0) bx0 = x0; if (z0 < bz0) bz0 = z0; if (x1 > bx1) bx1 = x1; if (z1 > bz1) bz1 = z1; };
  for (const s of Object.values(out.surf)) if (s) grow(s.bounds.wx0, s.bounds.wz0, s.bounds.wx1, s.bounds.wz1);
  for (const r of Object.values(out.inst)) for (let i = 0; i < r.n; i++) { const x = r.m[i * 16 + 12], z = r.m[i * 16 + 14]; grow(x - 3, z - 3, x + 3, z + 3); }
  out.bounds = bx0 === Infinity ? null : { x0: bx0, z0: bz0, x1: bx1, z1: bz1 };
  const H = new Hasher().int(cx).int(cz).str(W.dataHash);
  for (const b of boxes) H.num(b.minX).num(b.minZ).num(b.maxX).num(b.maxZ).num(b.height).num(b.base).str(b.tag);
  for (const k of POOL_NAMES) { const r = out.inst[k]; H.str(k).int(r?.n ?? 0); if (r) for (let i = 0; i < r.m.length; i += 7) H.num(r.m[i]); }
  for (const k of Object.keys(out.surf)) { const s = out.surf[k]; H.str(k).int(s?.nv ?? 0).int(s?.ni ?? 0); if (s) for (let i = 0; i < s.pos.length; i += 5) H.num(s.pos[i]); }
  out.hash = H.hex();
  out.edgeRoads = { n: crossings.n.length, s: crossings.s.length, w: crossings.w.length, e: crossings.e.length };
  for (const e of ['n', 's', 'w', 'e']) { const h = out.edges[e]; for (const c of crossings[e].sort()) h.str(c); out.edges[e] = h.hex(); }
  out.boxCount = boxes.length;
  out.isl = isl; // a chunk touching the island: its content is the band outside it
  pause();
  out.workMs = +work.toFixed(2);
  out.buildMs = +(performance.now() - t0).toFixed(2);
  return out;
}
