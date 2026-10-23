import * as THREE from 'three';
import { STREAM, BIOMES, FLORA } from '../data/streaming.js';
import { C, ISLAND, inIsland, hash32, rngOf, vnoise, Hasher } from './geo.js';
import { StaticWorld } from '../engine/collision.js';
import { ROAD_BANDS } from './textures.js';
import { RING } from '../data/ring.js';
import { SPECIES, FLORA_KINDS, P1_FLORA, poolName, floraVariant, floraHash, crownScale } from './flora.js';
import { brushField, brushStage } from './brush.js'; // THE BRUSH: painted density rows (docs/design/WEB_FORGE.md §3.4)
import { regionWater, WK } from './regions.js';
import { WATER } from '../data/water.js';

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
const POOL_NAMES = ['props', 'walls', 'roofs', 'floors', 'cacti', 'trunks', 'boulders', 'shrubs', 'signs', 'rails', 'barrels', 'glows', ...FLORA_KINDS.map(poolName), 'signsfl']; // fl_<kind>: world/flora.js; signsfl: a region's own sign atlas
// The pools every P1 layout hashed (an empty one too). A pool added since counts in a chunk's hash only when the chunk
// uses it, so every P1 chunk keeps the hash it had (docs/design/WEB_FLORIDA.md §5).
const P1_POOLS = new Set(['props', 'walls', 'roofs', 'floors', 'cacti', 'trunks', 'boulders', 'shrubs', 'signs', 'rails', 'barrels', 'glows', ...P1_FLORA.map(poolName)]);
const WG = 65; // a region chunk's water grid: 4 m samples, 65 x 65 (its edges shared with the neighbours')
// (A region's water colours by kind live in data/water.js WATER.colour.region: the one water shader mixes them.)
const URBAN = [0.9, 0.87, 0.82]; // the ring's ground: dust over old concrete and yards (data/ring.js zones tint their blocks)
const ROCK_TONE = [0.9, 0.8, 0.72]; // real terrain (flag): steep ground goes to bare, ruddier rock
const HILLSHADE = 0.24;            // real terrain (flag): how much a slope at the full grade lightens or darkens

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
  // flr: a ground's FLOOR channel (world/surfaces.js groundSurface): per vertex [forest floor, town floor] weights 0..1.
  constructor(maxV, maxI, uv, col, flr = false) { this.pos = new Float32Array(maxV * 3); this.nrm = new Float32Array(maxV * 3); this.uv = uv ? new Float32Array(maxV * 2) : null; this.col = col ? new Float32Array(maxV * 3) : null; this.flr = flr ? new Float32Array(maxV * 2) : null; this.idx = new Uint32Array(maxI); this.maxV = maxV; this.maxI = maxI; this.nv = 0; this.ni = 0; this.over = false; }
  reset() { this.nv = 0; this.ni = 0; this.over = false; }
  room(v, i) { if (this.nv + v > this.maxV || this.ni + i > this.maxI) { this.over = true; return false; } return true; }
  v(x, y, z, nx, ny, nz, u = 0, w = 0, r = 1, g = 1, b = 1) {
    const i = this.nv++, o = i * 3;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
    this.nrm[o] = nx; this.nrm[o + 1] = ny; this.nrm[o + 2] = nz;
    if (this.uv) { this.uv[i * 2] = u; this.uv[i * 2 + 1] = w; }
    if (this.col) { this.col[o] = r; this.col[o + 1] = g; this.col[o + 2] = b; }
    if (this.flr) { this.flr[i * 2] = 0; this.flr[i * 2 + 1] = 0; }
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
      col: this.col ? this.col.slice(0, this.nv * 3) : null, flr: this.flr ? this.flr.slice(0, this.nv * 2) : null, idx: this.idx.slice(0, this.ni),
      bounds: { cx, cy, cz, r: Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 0.5, wx0: x0 + ox, wx1: x1 + ox, wz0: z0 + oz, wz1: z1 + oz },
    };
  }
}
// water: ONE layer (world/water.js streamMat) for both sources of water: a region's 4 m sheet (the sea, the lagoon, the
// canals, the sloughs; marching-squares shores) and L1's 8 m sheet and wash-bed strips (rivers, washes, lakes).
export const SURF_CAPS = { ground: [N_G * N_G, (N_G - 1) * (N_G - 1) * 6], road: [26000, 42000], rock: [44000, 90000], water: [WG * WG * 2 + N_G * N_G + 4000, (WG - 1) * (WG - 1) * 9 + (N_G - 1) * (N_G - 1) * 6 + 8000] };
// Scratch buffers for one generator at a time. The streamer runs one build at a time and owns the shared set; anything
// that builds a layout beside it (the `chunk fresh=true` check) brings its own, so two builds never write the same arrays.
export function makeScratch() {
  return {
    INST: {
      props: new InstBuf(6000), walls: new InstBuf(4000), roofs: new InstBuf(1200), floors: new InstBuf(400), cacti: new InstBuf(1500), trunks: new InstBuf(800),
      boulders: new InstBuf(900), shrubs: new InstBuf(2400), signs: new InstBuf(64, 4), signsfl: new InstBuf(64, 4), rails: new InstBuf(2500), barrels: new InstBuf(150), glows: new InstBuf(200),
      ...Object.fromEntries(FLORA_KINDS.map((k) => [poolName(k), new InstBuf(SPECIES[k].chunk ?? 400, 1)])), // extra: the variant (world/flora.js); a forest species holds more
    },
    SURF: { ground: new MeshBuf(...SURF_CAPS.ground, true, true, true), road: new MeshBuf(...SURF_CAPS.road, true, false), rock: new MeshBuf(...SURF_CAPS.rock, false, true), water: new MeshBuf(...SURF_CAPS.water, true, true) },
    // L1 water's per-chunk grid (the ground's 33 x 33 vertices plus a ring): carve, surface, depth, flow coordinates.
    // (LW, not WG: WG is a region's 4 m water grid size.)
    LW: { carve: new Float32Array(35 * 35), surf: new Float32Array(35 * 35), depth: new Float32Array(35 * 35), u: new Float32Array(35 * 35), s: new Float32Array(35 * 35), edge: new Float32Array(35 * 35), kind: new Uint8Array(35 * 35) },
  };
}
const SHARED = makeScratch();

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const rgb = (hex) => { _c.set(hex); return [_c.r, _c.g, _c.b]; };
const smoothT = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
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
  const RGN = W.regionOf?.(x0 + C / 2, z0 + C / 2, 3000);
  const rel = W.reliefAt(x0 + C / 2, z0 + C / 2), b = (RGN ? RGN.biome(W.biomeAt(x0 + C / 2, z0 + C / 2)) : BIOMES[W.biomeAt(x0 + C / 2, z0 + C / 2)]) ?? BIOMES.d;
  const lambda = b.rock * (0.06 + rel * rel * 1.4); // expected features in this chunk
  let n = 0; for (let L = Math.exp(-lambda), p = rng(); p > L && n < 3; p *= rng()) n++;
  for (let k = 0; k < n; k++) {
    const kind = rel > 0.45 && rng() < 0.45 ? 'ridge' : rng() < 0.55 ? 'mesa' : 'butte';
    const r = kind === 'mesa' ? rng.range(28, 72) : kind === 'ridge' ? rng.range(36, 80) : rng.range(14, 30);
    const x = x0 + rng.range(8, C - 8), z = z0 + rng.range(8, C - 8);
    const h = (kind === 'butte' ? rng.range(14, 30) : kind === 'mesa' ? rng.range(12, 26) : rng.range(18, 42)) * (0.75 + rel * 0.6);
    const m = { x, z, r, h, kind, rot: rng() * Math.PI, seed: rng() * 1000, id: `${key}:${k}` };
    // Keep rock off the road and its interchanges, out of the towns and the island (by its lobed reach, not r).
    const R = r * MESA_REACH;
    if (inIsland(x, z, R + 40)) continue;
    if (W.ring && W.ring.depth(x, z) > -(R + 160)) continue; // no mesa in the Phoenix ring or at its edge
    if (W.project(x, z, R + 120).d < R + 55) continue;
    if (W.exits.some((X) => Math.hypot(X.x - x, X.z - z) < 650 + R || Math.hypot(X.dest.x - x, X.dest.z - z) < 380 + R || (X.access && W.ribbonDist(X.access, x, z) < R + 30))) continue;
    if (W.towns.some((t) => t.built && Math.hypot(t.x - x, t.z - z) < 900 + R)) continue;
    out.push(m);
  }
  W.mesaCache.set(key, out);
  return out;
}
// The outline is lobed, not a circle: erosion bites into a mesa's rim unevenly. lobe(t) scales the radius by direction
// (between 0.725 and 1.275), so a feature reaches at most MESA_REACH * r from its centre.
export const mesaLobe = (p, t) => 1 + 0.15 * Math.sin(3 * t + p.seed) + 0.08 * Math.sin(5 * t + p.seed * 1.7) + 0.045 * Math.sin(11 * t + p.seed * 2.3);
export const MESA_REACH = 1.3;
let _lx = 0, _lz = 0;
// Distance from the centre in the feature's own frame, as a fraction of the outline in that direction (1 = the foot).
export function mesaNorm(p, x, z) {
  const dx = x - p.x, dz = z - p.z;
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  _lx = dx * c - dz * s; _lz = dx * s + dz * c;
  if (p.kind === 'ridge') _lz *= 2.2;
  return Math.hypot(_lx, _lz) / (p.r * mesaLobe(p, Math.atan2(_lz, _lx)));
}
export function mesaHeight(p, x, z) {
  const d = mesaNorm(p, x, z), lx = _lx, lz = _lz;
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
  // Real terrain (flag, world/realterrain.js; null when off): this chunk's ground on the 8 m grid. Everything is laid out
  // on flat ground as before and lifted onto it at the end (the lift pass below); collision heights stay measured from it.
  const T = W.terrain ?? null, TG = T ? T.gridOf(cx, cz) : null;
  for (const k of POOL_NAMES) INST[k].reset();
  for (const k of Object.keys(SURF)) SURF[k].reset();
  const boxes = out.boxes, halo = []; // halo: boxes from features that only reach this chunk's nav margin
  const centre = { x: ox + C / 2, z: oz + C / 2 };
  const biomeKey = W.biomeAt(centre.x, centre.z), state = W.stateAt(centre.x, centre.z) ?? '_';
  const flora = FLORA[state] ?? FLORA._;
  const BR = brushField.chunk(cx, cz); // THE BRUSH (world/brush.js): the painted strokes that reach this chunk, or null
  out.biome = BIOMES[biomeKey]?.name ?? biomeKey; out.state = state;
  // A region past P1 (world/regions.js: Florida) lays out with its own rows: biome look, flora, water, life.
  const RGN = W.regionOf?.(centre.x, centre.z, 3000) ?? null, RB = RGN ? RGN.biome(biomeKey) : null;
  out.region = RGN?.id ?? null;
  if (RB) out.biome = RB.name;
  // A plant from world/flora.js: scale x its model's height, the variant and a shade from where it stands (no draws on rng).
  const plant = (kind, x, z, scale, rot, shade = 1) => { const b = INST[poolName(kind)], i = b.push(x, 0, z, rot, scale, scale, scale, shade, shade, shade); if (i >= 0) b.e[i] = floraVariant(x, z); };

  // A region's wild, as a sub-generator (its own draws on the chunk's stream: P1 chunks never run it).
  const TREE_H = { sabal: [6.5, 10.5], slashpine: [12, 18], cypress: [9, 15], liveoak: [7, 10], deadtree: [4, 7], fanpalm: [8, 12], citrus: [2.6, 3.6], mangrove: [3, 5.2] };
  function* regionScatter() {
    const B = RB, ha = (C * C) / 10000, Rr = RGN.row;
    let cityF = 0; for (const T of RGN.holdouts) cityF = Math.max(cityF, T.cityK(centre.x, centre.z));
    const wild = 1 - 0.85 * cityF;
    const pois = (lam) => { let n = 0; const L = Math.exp(-Math.min(lam, 60)); for (let p = rng(); p > L; p *= rng()) n++; return lam > 60 ? Math.round(lam + (rng() - 0.5) * Math.sqrt(lam) * 2) : n; };
    const spot = (r, wet = 0) => { for (let t = 0; t < 5; t++) { const x = ox + rng.range(3, C - 3), z = oz + rng.range(3, C - 3); if (!blocked(x, z, r) && waterAt(x, z) <= wet) return [x, z]; } return null; };
    const pick = (rows) => { let t = 0; for (const r of rows) t += r[1]; let p = rng() * t; for (const r of rows) if ((p -= r[1]) < 0) return r[0]; return rows[rows.length - 1][0]; };
    const isle = RGN.shoreAt ? (x) => { const s2 = RGN.shoreAt(centre.z); return x > s2.x - s2.b - 10; } : () => false;
    const tree = (kind, x, z) => {
      if (!SPECIES[kind]) return;
      // The barrier island keeps only palms, and few of them (sea oats and dunes are its cover).
      if (kind !== 'mangrove' && isle(x)) { if (rng() < 0.8) return; kind = rng() < 0.7 ? 'sabal' : 'fanpalm'; }
      const H = TREE_H[kind] ?? [4, 8], h = rng.range(H[0], H[1]);
      plant(kind, x, z, h / SPECIES[kind].h, floraHash(z, x) * 6.283, 0.88 + 0.22 * floraHash(x, z));
      const r = kind === 'liveoak' ? 0.6 : kind === 'mangrove' ? 0.8 : 0.35;
      addBox(x - r, z - r, x + r, z + r, 'tree', Math.min(h, 6));
    };
    const PALM = col(Rr.shrubs.palmetto), SAW = col(Rr.shrubs.sawgrass);
    // Palmetto (low fans in clumps) and sawgrass (tall tussocks that stand in the shallows).
    for (let k = 0, n = pois(B.shrubs * ha * wild); k < n; k++) {
      const palm = rng() < B.palmetto, p = spot(palm ? 0.9 : 0.6, palm ? 0 : 0.45);
      if (!p) continue;
      const s = rng.range(0.7, 1.25), v = rng.range(0.74, 1.1), c = palm ? PALM : SAW;
      if (palm) {
        // Saw palmetto: fans of stiff fronds from a low crown, a starburst from above (one to three crowns a clump).
        for (let cr = 0, nc = rng() < 0.7 ? 1 : 2; cr < nc; cr++) {
          const a0 = rng() * 6.28, d0 = cr ? s * rng.range(0.7, 1.2) : 0, x0 = p[0] + Math.cos(a0) * d0, z0 = p[1] + Math.sin(a0) * d0, nf = rng.int(5, 7), ss = s * (cr ? rng.range(0.7, 0.9) : 1);
          for (let f = 0; f < nf; f++) {
            const yaw = (f / nf) * 6.283 + rng.range(-0.25, 0.25), len = ss * rng.range(1.0, 1.4), pitch = rng.range(0.32, 0.62), tv = v * rng.range(0.86, 1.1);
            _e.set(-pitch, yaw, 0, 'YXZ'); _q.setFromEuler(_e);
            const cx2 = x0 + Math.sin(yaw) * Math.cos(pitch) * len * 0.5, cz2 = z0 + Math.cos(yaw) * Math.cos(pitch) * len * 0.5, cy = 0.12 + Math.sin(pitch) * len * 0.5;
            _m.compose(_p.set(cx2, cy, cz2), _q, _s.set(ss * 0.42, 0.05, len));
            INST.props.pushMatrix(_m, c[0] * tv, c[1] * tv, c[2] * tv * 0.92);
          }
        }
      } else {
        // Sawgrass: a tussock of tall flat blades, leaning out (it stands in the shallows too).
        for (let b = 0, nb = rng.int(3, 5); b < nb; b++) {
          const yaw = rng() * 6.283, lean = rng.range(0.15, 0.55), h = s * rng.range(0.9, 1.6), tv = v * rng.range(0.85, 1.1);
          _e.set(lean, yaw, 0, 'YXZ'); _q.setFromEuler(_e);
          _m.compose(_p.set(p[0] + Math.sin(yaw) * Math.sin(lean) * h * 0.5, h * 0.5, p[1] + Math.cos(yaw) * Math.sin(lean) * h * 0.5), _q, _s.set(0.16, h, 0.05));
          INST.props.pushMatrix(_m, c[0] * tv, c[1] * tv, c[2] * tv);
        }
      }
      if ((k & 63) === 63) { pause(); yield; resume(); }
    }
    pause(); yield; resume();
    // Trees by the biome's rows (cypress may stand in a slough's shallows).
    // In stands (hammocks), not sprinkled: a slow noise decides where the trees crowd and where the marsh stays open.
    for (let k = 0, n = pois(B.trees * ha * wild * 2.6); k < n; k++) {
      const kind = pick(B.flora), p = spot(1.4, kind === 'cypress' ? 0.9 : 0);
      if (!p) continue;
      const stand = vnoise(p[0], p[1], 150, seed + 5);
      if (stand < 0.47 && rng() < 0.85) continue;
      tree(kind, p[0], p[1]);
    }
    // Groves: an old citrus grove's rows, gone wild (farmland cells).
    if (B.rows && rng() < 0.7) {
      const ang = rng() < 0.5, x0 = ox + rng.range(10, 60), z0 = oz + rng.range(10, 60), wR = rng.range(90, 170), dR = rng.range(80, 160);
      for (let a = 0; a < wR; a += 6.5) for (let b = 0; b < dR; b += 5.5) {
        const x = ang ? x0 + a : x0 + b, z = ang ? z0 + b : z0 + a;
        if (x > X1 - 3 || z > Z1 - 3 || rng() < 0.18 || blocked(x, z, 1.4) || waterAt(x, z) > 0) continue;
        tree(rng() < 0.08 ? 'deadtree' : 'citrus', x + rng.range(-0.5, 0.5), z + rng.range(-0.5, 0.5));
      }
    }
    pause(); yield; resume();
    if (wat?.any) {
      // Cypress domes: the sloughs ringed and studded with cypress standing in the water.
      for (let k = 0, made = 0; k < 90 && made < 26; k++) {
        const x = ox + rng.range(2, C - 2), z = oz + rng.range(2, C - 2), d = waterAt(x, z);
        if (waterKind(x, z) !== WK.swamp || d < 0.03 || d > 0.95 || blocked(x, z, 1.2)) continue;
        tree(rng() < 0.85 ? 'cypress' : 'deadtree', x, z); made++;
      }
      // Mangroves on the lagoon's and the inlets' shallow edges.
      for (let k = 0, made = 0; k < 160 && made < 70; k++) {
        const x = ox + rng.range(2, C - 2), z = oz + rng.range(2, C - 2), d = waterAt(x, z), wk = waterKind(x, z);
        if ((wk !== WK.lagoon && wk !== WK.canal) || d < 0.02 || d > 0.75 || blocked(x, z, 1.6)) continue;
        if (wk === WK.canal && rng() < 0.7) continue;
        tree('mangrove', x, z); made++;
      }
      // Where the alligators lie up (systems/regions.js reads a hot chunk's lairs): water deep enough to sink in, a bank
      // within a few metres.
      out.life = [];
      for (let k = 0; k < 90 && out.life.length < 2; k++) {
        const x = ox + rng.range(8, C - 8), z = oz + rng.range(8, C - 8), d = waterAt(x, z), wk = waterKind(x, z);
        if (d < 0.3 || d > 1.8 || wk === WK.ocean) continue;
        if (Math.min(depthNear(x + 16, z), depthNear(x - 16, z), depthNear(x, z + 16), depthNear(x, z - 16)) > 0) continue;
        out.life.push({ kind: 'gator', x: +x.toFixed(1), z: +z.toFixed(1), water: ['', 'slough', 'canal', 'lagoon', 'sea'][wk] });
      }
    }
    // The barrier island and the beach: sea oats in the dunes, a few palms, driftwood.
    const sh = RGN.shoreAt?.(centre.z);
    if (sh && X1 > sh.x - sh.b - 40 && ox < sh.x + 10) {
      const OATS = col('#c8bd8a');
      for (let k = 0; k < 220; k++) {
        const x = ox + rng.range(2, C - 2), z = oz + rng.range(2, C - 2), s2 = RGN.shoreAt(z);
        if (x < s2.x - s2.b + 6 || x > s2.x - 14 || waterAt(x, z) > 0 || blocked(x, z, 0.5)) continue;
        const s = rng.range(0.5, 1.0);
        INST.shrubs.push(x, s * 0.4, z, rng() * 6, s * 0.8, s * 0.7, s * 0.8, OATS[0], OATS[1], OATS[2]);
        if (rng() < 0.035) tree(rng() < 0.7 ? 'sabal' : 'fanpalm', x, z);
        if (rng() < 0.03) INST.props.push(x, 0.12, z + 2, rng() * 3, rng.range(1.5, 3.2), 0.22, 0.3, 0.62, 0.56, 0.48); // driftwood
      }
    }
    pause(); yield; resume();
    // The dead suburbs: block houses on their old lots, roofs fallen in, the yards gone to palmetto (solid shells, looks
    // only inside: the walk-in houses are the holdouts' and the ring's).
    if (B.ruins) {
      const WALL = ['#d9c7a6', '#c9b08a', '#b9c2b0', '#d8b48c', '#a8b8b0', '#cfc2a8', '#9c9484'], n = pois(B.ruins * ha * wild);
      for (let k = 0; k < n; k++) {
        const w = rng.range(10, 14), d = rng.range(8, 11), p = spot(Math.max(w, d) / 2 + 3, 0);
        if (!p) continue;
        const [x, z] = p, turn = rng() < 0.5, sx = turn ? d : w, sz = turn ? w : d, h = rng.range(2.6, 3.2), c = col(rng.pick(WALL)), burnt = rng() < 0.35, v = burnt ? 0.55 : 1;
        INST.walls.push(x, h / 2, z, 0, sx, h, sz, c[0] * v, c[1] * v, c[2] * v);
        if (!burnt && rng() < 0.6) INST.roofs.push(x + rng.range(-1, 1), h + 0.15, z + rng.range(-1, 1), rng.range(-0.06, 0.06), sx * rng.range(0.5, 0.85), 0.25, sz * rng.range(0.5, 0.9), 0.42, 0.38, 0.34);
        for (let q = 0; q < 5; q++) INST.props.push(x + rng.range(-sx / 2 - 2, sx / 2 + 2), 0.25, z + rng.range(-sz / 2 - 2, sz / 2 + 2), rng() * 3, rng.range(0.8, 2.2), rng.range(0.25, 0.6), rng.range(0.8, 2.2), c[0] * 0.7, c[1] * 0.7, c[2] * 0.7);
        addBox(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, 'ruin', h);
        if (rng() < 0.3) wreck(x + sx / 2 + 3, z + rng.range(-2, 2), rng.pick([0, Math.PI / 2]), rng.pick(['#5a3a24', '#4a3020', '#6b4a2e', '#3d3a36', '#704020']));
      }
    }
    // A fishing camp on stilts by the water (rare), a pale limestone rock or two.
    if (wat?.any && rng() < 0.06 && cityF < 0.1) {
      const p = spot(7, 0);
      if (p) {
        const [x, z] = p, w = rng.range(5, 7), d = rng.range(4, 6), c = col(rng.pick(['#7a6a52', '#6e6a62', '#8a7a5a', '#6a7a6e']));
        for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) INST.props.push(x + px * (w / 2 - 0.3), 0.6, z + pz * (d / 2 - 0.3), 0, 0.25, 1.2, 0.25, 0.3, 0.26, 0.22);
        INST.walls.push(x, 2.4, z, 0, w, 2.4, d, c[0], c[1], c[2]);
        INST.roofs.push(x, 3.75, z, 0, w + 0.8, 0.25, d + 0.8, 0.5, 0.52, 0.5);
        addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 'shack', 3.6);
      }
    }
    for (let k = 0, n = pois(B.boulders * ha * wild); k < n; k++) {
      const r = rng.range(0.4, 1.1), p = spot(r); if (!p) continue;
      INST.boulders.push(p[0], r * 0.3, p[1], rng() * 6.28, r * 1.2, r * 0.6, r * 1.1, 0.78, 0.76, 0.68);
    }
  }

  // Collision: clip a box to the chunk square (and to the nav margin for the halo list).
  const addBox = (x0, z0, x1, z1, tag, height, base = 0) => {
    const ax0 = Math.max(x0, ox), az0 = Math.max(z0, oz), ax1 = Math.min(x1, X1), az1 = Math.min(z1, Z1);
    let b = null;
    if (ax1 > ax0 && az1 > az0) boxes.push((b = StaticWorld.box(ax0, az0, ax1, az1, tag, height, base)));
    else if (x1 > ox - 3 && x0 < X1 + 3 && z1 > oz - 3 && z0 < Z1 + 3 && !base) halo.push(StaticWorld.box(x0, z0, x1, z1, tag, height, base));
    return b;
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
  // Every interstate near the chunk (I-10, and a region's: docs/design/WEB_FLORIDA.md §3.1), its segments in reach.
  const segL = [];
  for (const cor of W.corridors ?? [W.i10]) {
    const cl = cor.cl, segs = [], m = cor === W.i10 ? 80 : 170;
    if (cor !== W.i10 && (cor.bbox.x1 < ox - m || cor.bbox.x0 > X1 + m || cor.bbox.z1 < oz - m || cor.bbox.z0 > Z1 + m)) continue;
    for (let i = 0; i < cl.n - 1; i++) {
      const mx = (cl.x[i] + cl.x[i + 1]) / 2, mz = (cl.z[i] + cl.z[i + 1]) / 2;
      if (mx > ox - m && mx < X1 + m && mz > oz - m && mz < Z1 + m) segs.push(i);
    }
    if (segs.length) segL.push({ cor, cl, segs, near: cor === W.i10 ? segs : segs.filter((i) => { const mx = (cl.x[i] + cl.x[i + 1]) / 2, mz = (cl.z[i] + cl.z[i + 1]) / 2; return mx > ox - 80 && mx < X1 + 80 && mz > oz - 80 && mz < Z1 + 80; }) });
  }
  const roadD = (x, z) => {
    let best = Infinity;
    for (const q of segL) {
      const cl = q.cl, segs = q.near;
      for (let k = 0; k < segs.length; k++) {
        const i = segs[k], ax = cl.x[i], az = cl.z[i], dx = cl.x[i + 1] - ax, dz = cl.z[i + 1] - az, l2 = dx * dx + dz * dz;
        let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d < best) best = d;
      }
    }
    return best;
  };
  const anySegs = segL.some((q) => q.near.length);
  // The same corridor's projection from its segments in reach (the water's canal rule), shaped like cor.project's.
  const _pj = { s: 0, d: Infinity, side: 0 };
  const projLocal = (cor, x, z) => {
    const q = segL.find((o) => o.cor === cor);
    _pj.d = Infinity; _pj.s = 0; _pj.side = 0;
    if (!q) return _pj;
    const cl = q.cl;
    let bi = -1, bt = 0;
    for (const i of q.segs) {
      const ax = cl.x[i], az = cl.z[i], dx = cl.x[i + 1] - ax, dz = cl.z[i + 1] - az, l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < _pj.d) { _pj.d = d; bi = i; bt = t; }
    }
    if (bi < 0 || _pj.d > 140) { _pj.d = Infinity; return _pj; }
    const px = cl.x[bi] + (cl.x[bi + 1] - cl.x[bi]) * bt, pz = cl.z[bi] + (cl.z[bi + 1] - cl.z[bi]) * bt;
    _pj.s = cl.s[bi] + (cl.s[bi + 1] - cl.s[bi]) * bt;
    _pj.side = (x - px) * -cl.tz[bi] + (z - pz) * cl.tx[bi] >= 0 ? 1 : -1;
    return _pj;
  };
  const mesas = [];
  for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) for (const m of mesasOf(W, cx + ix, cz + iz)) { const R = m.r * MESA_REACH; if (m.x + R > ox - 2 && m.x - R < X1 + 2 && m.z + R > oz - 2 && m.z - R < Z1 + 2) mesas.push(m); }
  const blocked = (x, z, r) => {
    if (inIsland(x, z, r + 3)) return true;
    if (anySegs && roadD(x, z) < 22 + r) return true;
    for (const rb of F.ribbons) if (!rb.mainline && x > rb.x0 && x < rb.x1 && z > rb.z0 && z < rb.z1 && W.ribbonDist(rb, x, z) < Math.max(rb.wl[0], rb.wr[0]) + 4 + rb.ymax * 2 + r) return true;
    for (const b of F.buildings) if (x > b.x0 - 4 - r && x < b.x1 + 4 + r && z > b.z0 - 4 - r && z < b.z1 + 4 + r) return true;
    for (const s of F.structs) if (Math.hypot(s.x - x, s.z - z) < Math.max(s.sa, s.su) / 2 + 3 + r) return true;
    for (const m of mesas) if (Math.hypot(m.x - x, m.z - z) < m.r * MESA_REACH + r && mesaNorm(m, x, z) < 0.95 + (r * (m.kind === 'ridge' ? 2.2 : 1)) / (m.r * 0.72)) return true;
    if (W.ring && W.ring.solid(x, z, r)) return true; // the ring's streets, walks, paved lots and buildings
    if ((WT && (wetNear(x, z, r) || WT.nearFord(x, z, 40 + r))) || onFill(x, z, r)) return true; // the water, its banks, a ford's way across, the bridges and their fills
    if (RGN) for (const T of RGN.holdouts) if (T.solid(x, z, r)) return true; // a holdout: inside its wall, its roads
    return false;
  };
  yield;

  // Real terrain (flag): the eight neighbours' ground grids (the ground's normals at the seams read them), a slice each.
  if (T) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { if (dx || dz) { T.gridOf(cx + dx, cz + dz); pause(); yield; resume(); } }

  // ---- L1 water (world/rivers.js): the chunk's water grid, once, on the ground's 8 m vertices plus a ring --------------
  // carve (the channel and its banks cut into the ground, <= 0), the surface, the depth, and where along the river.
  // Only a chunk some water reaches has one; every other chunk lays out exactly as it did before rivers.
  const WT = W.water && W.water.inChunk(cx, cz) ? W.water : null, NW = N_G + 2, LW = WT ? scratch.LW ?? SHARED.LW : null;
  if (WT) {
    for (let j = -1; j <= N_G; j++) {
      for (let i = -1; i <= N_G; i++) {
        const q = WT.sample(ox + i * 8, oz + j * 8), k = (j + 1) * NW + i + 1;
        LW.carve[k] = q.bedRel; LW.surf[k] = q.near ? q.surf : NaN; LW.depth[k] = q.depth; LW.u[k] = q.u; LW.s[k] = q.s; LW.edge[k] = Math.max(-40, q.edge);
        LW.kind[k] = q.body ? (q.body.P ? 2 : 1) : q.dry ? (q.dry.P ? 4 : 3) : 0;
      }
      if ((j & 7) === 7) { pause(); yield; resume(); }
    }
  }
  // Water or a cut bank within r of (x, z), from the grid (scatter, poles and wrecks keep off).
  const wetNear = (x, z, r) => {
    if (!WT) return false;
    const i0 = Math.max(-1, Math.floor((x - r - ox) / 8)), i1 = Math.min(N_G, Math.ceil((x + r - ox) / 8)), j0 = Math.max(-1, Math.floor((z - r - oz) / 8)), j1 = Math.min(N_G, Math.ceil((z + r - oz) / 8));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = (j + 1) * NW + i + 1; if (LW.depth[k] > 0 || LW.carve[k] < -0.3) return true; }
    return false;
  };
  const onFill = (x, z, r) => { for (const p of F.pieces) if (p.water && x > p.x0 - r && x < p.x1 + r && z > p.z0 - r && z < p.z1 + r && (p.kind === 'deck' ? W.water.deckAt(x, z) >= 0 : W.ribbonDist(p.rib, x, z) < p.halfW + 2 * p.rib.ymax + r)) return true; return false; };

  // ---- water (a region's: the sea, the lagoon, the canals, the sloughs; world/regions.js is the authority) -------------
  // A 4 m grid of depths and kinds, shared at the edges with the neighbours, cached by the region while the layout lives
  // (world/water.js reads it), drawn as a sheet, and blocked in the nav tiles where it is too deep to wade or drive.
  let wat = null;
  if (RGN?.water) {
    const d = new Float32Array(WG * WG), k = new Uint8Array(WG * WG), sg = new Float32Array(WG * WG), o = { d: 0, k: 0, s: 0 }, ctx = { proj: projLocal, ribbons: F.ribbons, towns: W.towns.filter((t) => t.built && t.region === RGN && Math.hypot(t.x - centre.x, t.z - centre.z) < 1000) };
    let any = false;
    for (let j = 0; j < WG; j++) {
      for (let i = 0; i < WG; i++) {
        const x = ox + i * 4, z = oz + j * 4;
        ctx.ribbons = i === WG - 1 || j === WG - 1 ? (W.featuresOf(Math.floor(x / C), Math.floor(z / C))?.ribbons ?? []) : F.ribbons;
        regionWater(RGN, x, z, o, ctx);
        d[j * WG + i] = o.d; k[j * WG + i] = o.d > 0 ? o.k : 0; sg[j * WG + i] = o.d > 0 ? Math.max(o.s, 0.01) : Math.min(o.s, 0);
        if (o.d > 0) any = true;
      }
      if ((j & 1) === 1) { pause(); yield; resume(); }
    }
    wat = { d, k, s: sg, any };
  }
  out.water = wat;
  const waterAt = (x, z) => { // bilinear depth inside this chunk (0 outside it or with no water)
    if (!wat?.any) return 0;
    const fx = (x - ox) / 4, fz = (z - oz) / 4;
    if (fx < 0 || fz < 0 || fx > WG - 1 || fz > WG - 1) return 0;
    const i = Math.min(WG - 2, Math.floor(fx)), j = Math.min(WG - 2, Math.floor(fz)), tx = fx - i, tz = fz - j, D = wat.d;
    return (D[j * WG + i] * (1 - tx) + D[j * WG + i + 1] * tx) * (1 - tz) + (D[(j + 1) * WG + i] * (1 - tx) + D[(j + 1) * WG + i + 1] * tx) * tz;
  };
  // Depth a little past the chunk too (the same pure answer the neighbour gets: seams agree).
  const _dn = { d: 0, k: 0 }, _dctx = { proj: projLocal, ribbons: null, towns: RGN ? W.towns.filter((t) => t.built && t.region === RGN && Math.hypot(t.x - centre.x, t.z - centre.z) < 1000) : null };
  const depthNear = (x, z) => {
    if (x >= ox && x <= X1 && z >= oz && z <= Z1) return waterAt(x, z);
    if (!RGN?.water) return 0;
    _dctx.ribbons = W.featuresOf(Math.floor(x / C), Math.floor(z / C))?.ribbons ?? [];
    return regionWater(RGN, x, z, _dn, _dctx).d;
  };
  const waterKind = (x, z) => { if (!wat?.any) return 0; const i = Math.max(0, Math.min(WG - 1, Math.round((x - ox) / 4))), j = Math.max(0, Math.min(WG - 1, Math.round((z - oz) / 4))); return wat.k[j * WG + i]; };

  // ---- ground: an 8 m grid tinted by biome, relief and noise, fading to the island's plain sand at its edge ------------
  {
    const G = SURF.ground, idx = new Int32Array(N_G * N_G);
    const tintRegion = (x, z, outc) => {
      // A region's ground (Florida: green, wet, flat): its biome rows' tints between cell centres, noise, the town, the
      // beach and the wet ground round the water. The texture under it is neutral (streamer: the region's ground material).
      const u = (x / W.K + STREAM.PHX[0] - W.data.world_offset[0]) / W.data.cell_m - 0.5, v = (z / W.K + STREAM.PHX[1] - W.data.world_offset[1]) / W.data.cell_m - 0.5;
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < 4; k++) {
        const ii = Math.max(0, Math.min(W.data.w - 1, i + (k & 1))), jj = Math.max(0, Math.min(W.data.h - 1, j + (k >> 1)));
        const t = RGN.biome(W.data.grid[jj][ii]).tint, wgt = (k & 1 ? fu : 1 - fu) * (k >> 1 ? fv : 1 - fv);
        r += t[0] * wgt; g += t[1] * wgt; b += t[2] * wgt;
      }
      const n1 = vnoise(x, z, 260, seed) - 0.5, n2 = vnoise(x, z, 46, seed + 1) - 0.5, n3 = vnoise(x, z, 1100, seed + 2) - 0.5, n4 = vnoise(x, z, 120, seed + 3) - 0.5;
      const bright = 1 + n1 * 0.3 + n2 * 0.14 + n3 * 0.16;
      r *= bright * (1 + n4 * 0.12); g *= bright; b *= bright * (1 - n4 * 0.1);
      const R = RGN.row;
      // The beach and the barrier island: sand, dunes greyed by sea oats toward the lagoon side.
      const sh = RGN.shoreAt?.(z);
      if (sh) {
        const dx = x - sh.x;
        let sk = 0;
        if (dx > -sh.b - 4) sk = dx > -18 ? 1 : 0.55 + 0.45 * smoothT((dx + sh.b) / Math.max(30, sh.b * 0.5));
        else { const ms = x - (sh.x - sh.b - sh.l); if (ms > -22 && ms < 6) sk = 0.45 * (1 - Math.abs(ms + 8) / 14); } // the mainland's shore
        if (sk > 0) { const s = R.sand; r += (s[0] * bright - r) * sk; g += (s[1] * bright - g) * sk; b += (s[2] * bright - b) * sk; }
      }
      // Wet ground and mud round the water (the bank), from the 4 m grid where this vertex has it.
      const wd = waterAt(x, z);
      if (wd > 0) { const m = R.mud, k2 = Math.min(1, 0.55 + wd * 0.4); r += (m[0] - r) * k2; g += (m[1] - g) * k2; b += (m[2] - b) * k2; }
      else if (depthNear(x + 8, z) + depthNear(x - 8, z) + depthNear(x, z + 8) + depthNear(x, z - 8) > 0) { const m = R.wet; r += (m[0] - r) * 0.35; g += (m[1] - g) * 0.35; b += (m[2] - b) * 0.35; }
      // Inside a holdout's wall: packed sand and worn grass.
      let ck = 0; for (const T of RGN.holdouts) ck = Math.max(ck, T.cityK(x, z));
      if (ck > 0) { const worn = vnoise(x, z, 22, seed + 9), tk = worn > 0.55 ? [0.8, 0.74, 0.56] : [0.62, 0.68, 0.44], k2 = ck * (worn > 0.55 ? 0.8 : 0.5); r += (tk[0] * bright - r) * k2; g += (tk[1] * bright - g) * k2; b += (tk[2] * bright - b) * k2; } // kept grass, worn to dirt where people walk
      outc[0] = r ** 2.2; outc[1] = g ** 2.2; outc[2] = b ** 2.2; // the rows are display colours: to linear
    };
    const tintAt = RGN ? tintRegion : (x, z, outc) => {
      // Bilinear biome tint between 500 m usmap cell centres (no hard squares where the biome changes).
      const u = (x / W.K + STREAM.PHX[0] - W.data.world_offset[0]) / W.data.cell_m - 0.5, v = (z / W.K + STREAM.PHX[1] - W.data.world_offset[1]) / W.data.cell_m - 0.5;
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      let r = 0, g = 0, b = 0;
      if (T && T.tintAt(x, z, outc)) { r = outc[0]; g = outc[1]; b = outc[2]; } // the real landcover's tint (flag)
      else for (let k = 0; k < 4; k++) {
        const ii = Math.max(0, Math.min(W.data.w - 1, i + (k & 1))), jj = Math.max(0, Math.min(W.data.h - 1, j + (k >> 1)));
        const t = (BIOMES[W.data.grid[jj][ii]] ?? BIOMES.d).tint, wgt = (k & 1 ? fu : 1 - fu) * (k >> 1 ? fv : 1 - fv);
        r += t[0] * wgt; g += t[1] * wgt; b += t[2] * wgt;
      }
      const rel = W.reliefAt(x, z), n1 = vnoise(x, z, 340, seed) - 0.5, n2 = vnoise(x, z, 70, seed + 1) - 0.5, n3 = vnoise(x, z, 1400, seed + 2) - 0.5;
      const bright = 1 + n1 * 0.16 + n2 * 0.08 + n3 * 0.1;
      r *= bright; g *= bright * (1 - rel * 0.07); b *= bright * (1 - rel * 0.15);
      // The Phoenix ring: the desert goes grey-brown with the dust of a dead city.
      const ck = W.ring ? W.ring.cityK(x, z) * 0.55 : 0;
      if (ck > 0) { r += (URBAN[0] * bright - r) * ck; g += (URBAN[1] * bright - g) * ck; b += (URBAN[2] * bright - b) * ck; }
      if (BR) { BT[0] = r; BT[1] = g; BT[2] = b; BR.tint(x, z, BT); r = BT[0]; g = BT[1]; b = BT[2]; } // painted: leaf litter, sick ground
      // At the island edge the ground fades to the island's own plain sand (no seam).
      const de = Math.max(Math.abs(x), Math.abs(z)) - ISLAND;
      const k = de < 0 ? 0 : de > 220 ? 1 : de / 220;
      outc[0] = 1 + (r - 1) * k; outc[1] = 1 + (g - 1) * k; outc[2] = 1 + (b - 1) * k;
    };
    const tc = [0, 0, 0], BT = [0, 0, 0];
    // Real terrain: a vertex's height from the grid, its normal from its neighbours' (across a seam, the neighbour chunk's
    // grid: both chunks agree on every edge vertex and its normal), and steep ground going to bare rock.
    const hAt = TG ? (i, j) => {
      const di = i < 0 ? -1 : i >= N_G ? 1 : 0, dj = j < 0 ? -1 : j >= N_G ? 1 : 0;
      const gr = di || dj ? T.gridOf(cx + di, cz + dj) : TG;
      return gr[(dj < 0 ? N_G - 2 : dj > 0 ? 1 : j) * N_G + (di < 0 ? N_G - 2 : di > 0 ? 1 : i)];
    } : null;
    // The FLOOR channel (world/surfaces.js groundSurface): a painted wood's forest floor, a holdout's packed-earth yard.
    // Colour only (the layout hash never reads it); zero everywhere else, so P1's ground draws exactly as before.
    const FW = BR && BR.layers.has('forest'), HO = RGN?.holdouts?.length ? RGN.holdouts : null;
    const floorAt = (v, x, z) => {
      if (FW) G.flr[v * 2] = BR.sample('forest', x, z, 0);
      if (HO) { let ck = 0; for (const T2 of HO) ck = Math.max(ck, T2.cityK(x, z)); G.flr[v * 2 + 1] = ck; }
    };
    // L1 water: the carve (<= 0) at grid vertex (i, j), -1..N_G; and the tint of a wash's sand, a river's mud, a playa's crust.
    const cv = LW ? (i, j) => LW.carve[(j + 1) * NW + i + 1] : null;
    const wetTint = (i, j, out) => {
      const k = (j + 1) * NW + i + 1, c = LW.carve[k], kind = LW.kind[k];
      // A river's or a lake's banks go to wet mud for 12 m out from the water's edge (LW.edge < 0 out there).
      const e = LW.edge[k], tint = kind === 3 ? WATER.washTint : kind === 4 ? WATER.playaTint : (kind === 1 || kind === 2) && e > -12 ? WATER.bankTint : null;
      if (!tint) return;
      const a = kind === 4 ? 1 : kind === 3 ? Math.min(1, -c / 0.5) : Math.min(1, Math.max(0, 1 + e / 12));
      for (let q = 0; q < 3; q++) out[q] *= 1 + (tint[q] - 1) * a;
      // A wash's cut banks: darker, the shadowed lip of the channel (the bed itself stays pale).
      if (kind === 3 && c < -0.15 && c > -1.0) for (let q = 0; q < 3; q++) out[q] *= WATER.washBank[q];
    };
    for (let j = 0; j < N_G; j++) for (let i = 0; i < N_G; i++) {
      const x = ox + i * 8, z = oz + j * 8;
      tintAt(x, z, tc);
      if (LW) {
        // A chunk the water reaches: the ground is cut (and its normals come from the cut ground, the land's too).
        wetTint(i, j, tc);
        const hh = (a, b) => (TG ? hAt(a, b) : 0) + cv(a, b);
        const sx = (hh(i + 1, j) - hh(i - 1, j)) / 16, sz = (hh(i, j + 1) - hh(i, j - 1)) / 16, l = Math.hypot(sx, 1, sz);
        if (TG) {
          const rock = Math.min(1, Math.hypot(sx, sz) / T.g) * 0.3, hs = 1 + HILLSHADE * Math.max(-1, Math.min(1, (0.7071 * (sx + sz)) / T.g));
          for (let c = 0; c < 3; c++) tc[c] = (tc[c] + (tc[c] * ROCK_TONE[c] - tc[c]) * rock) * hs;
        } else {
          // Flat ground: the cut banks still read from straight above (the map-maker's light from the north-west).
          const hs = 1 + HILLSHADE * 1.3 * Math.max(-1, Math.min(1, (0.7071 * (sx + sz)) / 0.25));
          for (let c = 0; c < 3; c++) tc[c] *= hs;
        }
        idx[j * N_G + i] = G.v(i * 8, hh(i, j), j * 8, -sx / l, 1 / l, -sz / l, (x + 650) / 1300, (650 - z) / 1300, tc[0], tc[1], tc[2]);
        if (FW || HO) floorAt(idx[j * N_G + i], x, z);
        continue;
      }
      if (TG) {
        const sx = (hAt(i + 1, j) - hAt(i - 1, j)) / 16, sz = (hAt(i, j + 1) - hAt(i, j - 1)) / 16, l = Math.hypot(sx, 1, sz);
        const rock = Math.min(1, Math.hypot(sx, sz) / T.g) * 0.3;
        // A map-maker's hillshade (light from the north-west, whatever the sun is doing): a slope at the full grade is
        // HILLSHADE brighter facing the light and as much darker facing away, so the land reads from straight above.
        const hs = 1 + HILLSHADE * Math.max(-1, Math.min(1, (0.7071 * (sx + sz)) / T.g));
        for (let c = 0; c < 3; c++) tc[c] = (tc[c] + (tc[c] * ROCK_TONE[c] - tc[c]) * rock) * hs;
        idx[j * N_G + i] = G.v(i * 8, TG[j * N_G + i], j * 8, -sx / l, 1 / l, -sz / l, (x + 650) / 1300, (650 - z) / 1300, tc[0], tc[1], tc[2]);
        if (FW || HO) floorAt(idx[j * N_G + i], x, z);
        continue;
      }
      idx[j * N_G + i] = G.v(i * 8, 0, j * 8, 0, 1, 0, (x + 650) / 1300, (650 - z) / 1300, tc[0], tc[1], tc[2]);
      if (FW || HO) floorAt(idx[j * N_G + i], x, z);
      if (RGN && i === N_G - 1 && (j & 7) === 7) { pause(); yield; resume(); } // a region's tint asks the water: slices
    }
    for (let j = 0; j < N_G - 1; j++) for (let i = 0; i < N_G - 1; i++) {
      const x = ox + i * 8 + 4, z = oz + j * 8 + 4;
      if (Math.abs(x) < ISLAND && Math.abs(z) < ISLAND) continue; // the island's own ground plane is under there
      const a = idx[j * N_G + i], b = idx[j * N_G + i + 1], c = idx[(j + 1) * N_G + i + 1], d = idx[(j + 1) * N_G + i];
      // Near water, each cell splits along its flatter diagonal, so a shoreline crossing the grid aslant follows the bank
      // instead of sawing along the grid's own diagonal. (Real terrain's T.at keeps the fixed split; the carve on top is
      // the only difference, and movers stand on the analytic floor there.)
      if (LW && (cv(i, j) || cv(i + 1, j) || cv(i, j + 1) || cv(i + 1, j + 1)) && Math.abs(G.pos[a * 3 + 1] - G.pos[c * 3 + 1]) > Math.abs(G.pos[b * 3 + 1] - G.pos[d * 3 + 1]) + 1e-6) { G.tri(a, d, b); G.tri(b, d, c); continue; }
      G.tri(a, d, c); G.tri(a, c, b);
    }
    // The edge signature: the ground along each edge (what the neighbour must agree with).
    const edgeHash = (pick) => { const h = new Hasher(); for (let k = 0; k < N_G; k++) { const v = pick(k); h.num(G.col[v * 3]).num(G.col[v * 3 + 1]).num(G.col[v * 3 + 2]); if (TG || G.pos[v * 3 + 1] !== 0) h.num(G.pos[v * 3 + 1]).num(G.nrm[v * 3]).num(G.nrm[v * 3 + 2]); } return h; }; // (a carved vertex: its height too)
    out.edges = { n: edgeHash((k) => idx[k]), s: edgeHash((k) => idx[(N_G - 1) * N_G + k]), w: edgeHash((k) => idx[k * N_G]), e: edgeHash((k) => idx[k * N_G + N_G - 1]) };
  }
  pause(); yield; resume();

  // ---- L1 water: the sheet, on the same 8 m grid, wherever a cell has water at a corner -------------------------------
  // Flat across the channel at the surface; where the cut bank stands above it the ground hides it, so the shoreline is
  // where the ground meets the water. Colour by depth (muddy green-brown, darker deeper, pale at the edge); UVs run along
  // a river (s) and across it (u), so the ripples flow downstream when world/water.js scrolls them.
  if (LW) {
    const Wb = SURF.water, vid = (scratch.wid ??= new Int32Array(N_G * N_G));
    vid.fill(-1);
    const dep = (i, j) => LW.depth[(j + 1) * NW + i + 1];
    const surfOf = (i, j) => {
      const k = (j + 1) * NW + i + 1;
      if (Number.isFinite(LW.surf[k])) return LW.surf[k];
      for (let r = 1; r <= 2; r++) for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) { const ii = i + a, jj = j + b; if (ii < -1 || jj < -1 || ii > N_G || jj > N_G) continue; const v = LW.surf[(jj + 1) * NW + ii + 1]; if (Number.isFinite(v)) return v; }
      return NaN;
    };
    const vert = (i, j) => {
      const n = j * N_G + i;
      if (vid[n] >= 0) return vid[n];
      const k = (j + 1) * NW + i + 1, d = LW.depth[k], y = surfOf(i, j);
      if (!Number.isFinite(y)) return -1;
      // The colour is worked out per pixel (world/water.js streamMat): the vertex carries the signed distance from the
      // water's edge (r, metres, + in the water) and the depth (g), both near-linear across the channel, so the 8 m grid
      // interpolates them exactly and the foam line and the depth bands follow the real shore, not the grid.
      const x = ox + i * 8, z = oz + j * 8, river = LW.kind[k] === 1;
      return (vid[n] = Wb.v(i * 8, y, j * 8, 0, 1, 0, river ? LW.u[k] / 7 : x / 16, river ? LW.s[k] / 7 : z / 16, LW.edge[k], d, river ? 0 : 0.2)); // blue 0.2: a lake (calmer ripples)
    };
    // A cell with water at a corner, or next to one: the sheet runs on under the cut bank, so the shoreline is always
    // where the ground comes up through it (never the sheet's own square edge).
    const wetCell = (i, j) => dep(i, j) > 0 || dep(i + 1, j) > 0 || dep(i, j + 1) > 0 || dep(i + 1, j + 1) > 0;
    for (let j = 0; j < N_G - 1; j++) for (let i = 0; i < N_G - 1; i++) {
      let any = false;
      for (let b = -1; b <= 1 && !any; b++) for (let a = -1; a <= 1 && !any; a++) { const ii = i + a, jj = j + b; if (ii >= -1 && jj >= -1 && ii < N_G && jj < N_G && wetCell(ii, jj)) any = true; }
      if (!any) continue;
      if (Math.abs(ox + i * 8 + 4) < ISLAND && Math.abs(oz + j * 8 + 4) < ISLAND) continue;
      if (!Wb.room(4, 6)) break;
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i + 1, j + 1), d = vert(i, j + 1);
      if (a < 0 || b < 0 || c < 0 || d < 0) continue;
      Wb.tri(a, d, c); Wb.tri(a, c, b);
    }
    // A dry wash's bed: a strip along the channel at the bed's own level, in the same layer (its vertex colour says
    // "dry": blue = 1, red = metres in from the bed's edge), so it reads as pale sand and gravel with a dark lip where
    // the cut bank comes up through it. Not under a culvert's fill.
    WT.washStrips(cx, cz, (x0, z0, x1, z1, y0, y1, hb0, hb1, nx0, nz0, nx1, nz1, s0, s1) => {
      if (!Wb.room(6, 12)) return;
      const v = (x, z, y, nx, nz, u, s, e) => Wb.v(x + nx * u - ox, y + 0.03, z + nz * u - oz, 0, 1, 0, u / 6, s / 6, e, 0, 1);
      const a0 = v(x0, z0, y0, nx0, nz0, -hb0 - 0.6, s0, 0), m0 = v(x0, z0, y0, nx0, nz0, 0, s0, hb0 + 0.6), b0 = v(x0, z0, y0, nx0, nz0, hb0 + 0.6, s0, 0);
      const a1 = v(x1, z1, y1, nx1, nz1, -hb1 - 0.6, s1, 0), m1 = v(x1, z1, y1, nx1, nz1, 0, s1, hb1 + 0.6), b1 = v(x1, z1, y1, nx1, nz1, hb1 + 0.6, s1, 0);
      // Wound to face up (n is the right of travel: +z when travel is +x).
      Wb.tri(a0, m0, m1); Wb.tri(a0, m1, a1); Wb.tri(m0, b0, b1); Wb.tri(m0, b1, m1);
    });
    pause(); yield; resume();
  }
  // ---- the water sheet: every 4 m cell with water at a corner, tinted by kind and depth, world-space UVs (world/water.js
  // material: ripples and glints run on across chunk seams) --------------------------------------------------------------
  // The one water material (world/water.js streamMat) works the colour out per pixel: a region's vertex carries (0, depth,
  // 0.4 + kind / 100) and the shader mixes data/water.js colour.region's shallow and deep for that kind, as this used to per vertex.
  if (wat?.any) {
    const Wm = SURF.water, vid = new Int32Array(WG * WG).fill(-1);
    const D = wat.d, K = wat.k, SG = wat.s, Y = 0.015;
    const mode = (kind) => 0.4 + (kind || 1) * 0.01;
    const vert = (q, kind) => {
      if (vid[q] >= 0) return vid[q];
      const i = q % WG, j = (q - i) / WG;
      return (vid[q] = Wm.v(i * 4, Y, j * 4, 0, 1, 0, (ox + i * 4) / 7, (oz + j * 4) / 7, 0, D[q], mode(K[q] || kind)));
    };
    const poly = [], CI = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let j = 0; j < WG - 1; j++) for (let i = 0; i < WG - 1; i++) {
      const q = [j * WG + i, j * WG + i + 1, (j + 1) * WG + i + 1, (j + 1) * WG + i];
      const wet = q.map((v) => SG[v] > 0), n = wet.filter(Boolean).length;
      if (!n) continue;
      if (!Wm.room(8, 18)) break;
      const kind = K[q[0]] || K[q[1]] || K[q[2]] || K[q[3]];
      if (n === 4) { const [va, vb, vc, vd] = q.map((v) => vert(v, kind)); Wm.tri(va, vd, vc); Wm.tri(va, vc, vb); continue; } // wound to face up
      // The shore crosses this cell: cut it on the zero line of the signed margin (marching squares), so the water's edge
      // is a line, not a staircase of 4 m squares.
      poly.length = 0;
      for (let c = 0; c < 4; c++) {
        const c2 = (c + 1) & 3;
        if (wet[c]) poly.push(vert(q[c], kind));
        if (wet[c] !== wet[c2]) {
          const s0 = SG[q[c]], s1 = SG[q[c2]], t = Math.max(0, Math.min(1, s0 / (s0 - s1)));
          const x = (i + CI[c][0] + (CI[c2][0] - CI[c][0]) * t) * 4, z = (j + CI[c][1] + (CI[c2][1] - CI[c][1]) * t) * 4;
          poly.push(Wm.v(x, Y, z, 0, 1, 0, (ox + x) / 7, (oz + z) / 7, 0, 0, mode(kind)));
        }
      }
      for (let p = 1; p < poly.length - 1; p++) Wm.tri(poly[0], poly[p + 1], poly[p]);
    }
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
  // (A region's fills are grassed over: Florida's embankments are green, not desert dirt.)
  const fillCol = col(RGN ? '#8e8a74' : '#8d6c4c'), slopeCol = col(RGN ? '#5e7a3e' : '#7a5c40'), toeCol = col(RGN ? '#6a8a46' : '#9a7a58');
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
    const shrubTop = col(flora.shrub), ROCKT = [col('#7a4a32'), col('#8a5a3c'), col('#6a4430')];
    for (const m of mesas) {
      if (own(m.x, m.z)) {
        // A polar mesh in the feature's own frame: rings bunched at the cliff band, so the rim is crisp with a few hundred
        // vertices (a square grid fine enough for that costs thousands, and a coarse one saws the rim into steps). The
        // outermost ring sits just under the ground: no flat skirt to catch shadow acne.
        const cliff = m.kind === 'butte' ? 0.72 : m.kind === 'mesa' ? 0.8 : null;
        const rings = cliff ? [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6].filter((q) => q < cliff - 0.15).concat([cliff - 0.12, cliff - 0.05, cliff - 0.015, cliff, cliff + 0.015, cliff + 0.035, cliff + 0.06, cliff + 0.085, cliff + 0.1, cliff + 0.14, cliff + 0.19, 0.93, 0.97, 1.0, 1.02])
          : [0, 0.08, 0.16, 0.24, 0.32, 0.4, 0.48, 0.56, 0.64, 0.72, 0.8, 0.86, 0.92, 0.96, 1.0, 1.02];
        const SEG = 72, R = rings.length, c0 = Math.cos(m.rot), s0 = Math.sin(m.rot), sq = m.kind === 'ridge' ? 1 / 2.2 : 1;
        if (K.room(1 + (R - 1) * SEG, (R - 1) * SEG * 6)) {
          const vtx = (lx, lz) => {
            const dx = lx * c0 + lz * s0, dz = -lx * s0 + lz * c0, x = m.x + dx, z = m.z + dz;
            const h = mesaHeight(m, x, z), k = h / m.h;
            const slope = Math.min(1, (Math.abs(mesaHeight(m, x + 1.2, z) - h) + Math.abs(mesaHeight(m, x, z + 1.2) - h)) / 2.4);
            tmp.copy(cBase).lerp(cRock, Math.min(1, k * 1.4));
            if (k > 0.92) {
              // The cap: weathered rock in patches of desert varnish, never one flat colour.
              tmp.lerp(cTop, 0.6).multiplyScalar(0.86 + vnoise(x, z, 22, m.seed) * 0.26);
            } else if (Math.sin(h * 1.7 + m.seed) > 0.55) tmp.lerp(cBand, 0.5); // strata show on the faces only
            tmp.lerp(cDark, slope * 0.55);
            return K.v(x - ox, h > 0.02 ? h : -0.4, z - oz, 0, 1, 0, 0, 0, tmp.r, tmp.g, tmp.b);
          };
          const centre = vtx(0, 0), first = K.nv;
          for (let ri = 1; ri < R; ri++) for (let a = 0; a < SEG; a++) {
            const t = (a / SEG) * Math.PI * 2, d = rings[ri] * m.r * mesaLobe(m, t); // t is the angle mesaNorm measures
            vtx(Math.cos(t) * d, Math.sin(t) * d * sq);
          }
          for (let a = 0; a < SEG; a++) K.tri(centre, first + ((a + 1) % SEG), first + a);
          for (let ri = 1; ri < R - 1; ri++) for (let a = 0; a < SEG; a++) {
            const i0 = first + (ri - 1) * SEG, i1 = first + ri * SEG, b = (a + 1) % SEG;
            K.tri(i0 + a, i0 + b, i1 + b); K.tri(i0 + a, i1 + b, i1 + a);
          }
        }
        // Scrub holding on to the cap and the flanks, and the talus: rock the cliff has shed, piled at its foot.
        const mr = rngOf(hash32(seed, Math.floor(m.seed * 1000), 991));
        const place = (q, t) => { const d = q * m.r * mesaLobe(m, t), lx = Math.cos(t) * d, lz = Math.sin(t) * d * sq; _p.set(m.x + lx * c0 + lz * s0, 0, m.z - lx * s0 + lz * c0); _p.y = mesaHeight(m, _p.x, _p.z); return _p; };
        for (let k = 0, n = Math.round(m.r * m.r * 0.006); k < n; k++) {
          const q = cliff ? Math.sqrt(mr()) * (cliff - 0.06) : mr.range(0.05, 0.9), p = place(q, mr() * Math.PI * 2);
          const ss = mr.range(0.5, 1.2), v = mr.range(0.7, 1.0);
          INST.shrubs.push(p.x, p.y + ss * 0.18, p.z, mr() * 6.28, ss * mr.range(0.9, 1.3), ss * 0.5, ss * mr.range(0.9, 1.3), shrubTop[0] * v, shrubTop[1] * v, shrubTop[2] * v);
        }
        for (let k = 0, n = Math.round(m.r * (cliff ? 0.9 : 0.35)); k < n; k++) {
          const q = cliff ? mr.range(cliff + 0.09, 1.08) : mr.range(0.6, 1.05), p = place(q, mr() * Math.PI * 2);
          const r = mr.range(0.45, 1.5) * (q < 1 ? 1 : 0.7), c = ROCKT[mr.int(0, 2)], v = mr.range(0.82, 1.08);
          INST.boulders.push(p.x, p.y + r * 0.3, p.z, mr() * 6.28, r * mr.range(0.9, 1.3), r * mr.range(0.55, 0.85), r * mr.range(0.9, 1.3), c[0] * v, c[1] * v, c[2] * v);
        }
      }
      // Collision: the footprint where it stands taller than a step, 4 m cells, row-merged, clipped to this chunk.
      const CELL = 4;
      const RR = m.r * MESA_REACH;
      const gx0 = Math.floor(Math.max(m.x - RR, ox - 4) / CELL), gx1 = Math.ceil(Math.min(m.x + RR, X1 + 4) / CELL);
      const gz0 = Math.floor(Math.max(m.z - RR, oz - 4) / CELL), gz1 = Math.ceil(Math.min(m.z + RR, Z1 + 4) / CELL);
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
        // On real terrain the rail is pitched to the ground under its ends (and the lift pass leaves it alone).
        const ya = T ? a.y + T.at(a.x, a.z) : a.y, yb = T ? b.y + T.at(b.x, b.z) : b.y;
        _e.set(Math.atan2(ya - yb, len), rot, 0); _q.setFromEuler(_e);
        _m.compose(_p.set(mx, (T ? (ya + yb) / 2 : y) + 0.62, mz), _q, _s.set(0.16, 0.32, len + 0.05));
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
  const signAt = (x, z, rot, w, hgt, slot, lift = 1.7, region = null) => {
    // Posts on the ground, the panel laid back toward the sky so the top-down camera reads it (text upright on screen).
    for (const s of [-1, 1]) {
      const px = x + Math.cos(rot) * s * w * 0.32, pz = z - Math.sin(rot) * s * w * 0.32;
      INST.props.push(px, (lift + hgt * 0.4) / 2, pz, rot, 0.16, lift + hgt * 0.4, 0.16, SIGNPOST[0], SIGNPOST[1], SIGNPOST[2]);
      addBox(px - 0.15, pz - 0.15, px + 0.15, pz + 0.15, 'signpost', lift + hgt * 0.4);
    }
    _e.set(-1.22, 0, 0); _q.setFromEuler(_e); // tilt back ~70 degrees (the panel faces up and a little south, toward the camera)
    _m.compose(_p.set(x, lift + hgt * 0.32, z), _q, _s.set(w, hgt, 1));
    // A region's faces are in its own atlas (world/signs.js), drawn by its own pool.
    const buf = region ? INST.signsfl : INST.signs, atlas = region ? W.signAtlasFL : W.signAtlas;
    const i = buf.pushMatrix(_m, 1, 1, 1);
    if (i >= 0) buf.e.set(atlas?.rect(slot) ?? [0, 0, 1, 1], i * 4);
  };
  for (const s of F.signs) if (own(s.x, s.z)) signAt(s.x, s.z, s.h, s.w, s.hgt, s.id, s.lift ?? 1.7, s.region ?? null);
  for (const st of F.stops) {
    const sp = st.sign;
    if (!own(sp.x, sp.z)) continue;
    signAt(sp.x, sp.z, st.h, 1.1, 1.1, 'STOP', st.y + 1.6, RGN ? RGN.id : null);
  }
  const MP = col('#2c5a3c');
  for (const m of F.posts) if (own(m.x, m.z)) { INST.props.push(m.x, 0.55, m.z, m.h, 0.08, 1.1, 0.08, 0.35, 0.34, 0.32); INST.props.push(m.x, 1.15, m.z, m.h, 0.36, 0.5, 0.06, MP[0], MP[1], MP[2]); }
  // Power poles along the north/east side of the interstate, every 70 m, skipping interchanges and the island (a
  // region's corridor: on the side away from its canal).
  for (const q of segL) if (q.near.length) {
    const cor = q.cor, cl = q.cl, segs = q.near, i10 = cor === W.i10, pside = i10 || !cor.canal ? 1 : -cor.canal.side;
    const POLE = col('#4a3a2a'), ARM = col('#3d3026');
    const sA = cl.s[segs[0]], sB = cl.s[segs[segs.length - 1] + 1];
    for (let s = Math.ceil(sA / 70) * 70; s < sB; s += 70) {
      const f = cor.at(s), u = pside * (cor.section(s).out + 24), x = f.x + f.nx * u, z = f.z + f.nz * u;
      if (!own(x, z) || inIsland(x, z, 30) || cor.exits.some((X) => Math.abs(X.s - s) < 520) || W.ring?.inCity(x, z, 80)) continue;
      if ((i10 && W.water?.onBridge(s, 40)) || wetNear(x, z, 3)) continue; // not in a river, not beside a bridge (L1 water, world/rivers.js)
      if (W.towns.some((t) => t.built && Math.hypot(t.x - x, t.z - z) < 700)) continue;
      if (!i10 && (s < cor.mainlineFrom || blocked(x, z, 0.5) || depthNear(x, z) > 0)) continue;
      const lean = ((i10 ? hash32(seed, Math.round(s)) : hash32(seed, Math.round(s), cor.salt)) % 100) / 100 - 0.5, rot = Math.atan2(f.tx, f.tz);
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
  for (const q of segL) for (const i of q.near) {
    const cor = q.cor, cl = q.cl;
    const mx = (cl.x[i] + cl.x[i + 1]) / 2, mz = (cl.z[i] + cl.z[i + 1]) / 2;
    if (!own(mx, mz) || inIsland(mx, mz, 60)) continue;
    const h = cor === W.i10 ? hash32(seed, i, 99) : hash32(seed, i, 99, cor.salt);
    if (h % 1000 > 11) continue; // about one every 700 m
    const s = cl.s[i], sec = cor.section(s);
    if (cor.exits.some((X) => Math.abs(X.s - s) < 600) || (cor !== W.i10 && s < cor.mainlineFrom)) continue;
    if (cor === W.i10 && W.water?.onBridge(s, 30)) continue; // a wreck is never left on a river bridge's deck or its approach
    const f = cor.at(s), roadRot = Math.atan2(f.tx, f.tz);
    const rot = Math.round(roadRot / (Math.PI / 2)) * (Math.PI / 2) + ((h >> 10) % 100 - 50) / 400;
    const median = (h >> 4) % 3 === 0, side = (h >> 6) % 2 ? 1 : -1;
    const along = Math.abs(Math.sin(rot)) > 0.7, hx = along ? 2.1 : 0.95, hz = along ? 0.95 : 2.1;
    // Lateral reach of the axis-aligned footprint toward the lanes.
    const reach = Math.abs(f.nx) * hx + Math.abs(f.nz) * hz;
    const u = median ? 0 : side * (sec.lane2 + 0.5 + reach);
    if (median && reach > sec.med - 0.2) continue;
    wreck(f.x + f.nx * u, f.z + f.nz * u, rot, WRECK[h % WRECK.length]);
  }
  // Dead towns: cars left at the kerb of their streets (the streets are laid square, so the cars are too).
  for (const rb of F.ribbons) {
    if (rb.kind !== 'street') continue;
    for (let i = 0; i < rb.n - 1; i++) {
      const mx = (rb.x[i] + rb.x[i + 1]) / 2, mz = (rb.z[i] + rb.z[i + 1]) / 2;
      if (!own(mx, mz)) continue;
      const h = hash32(seed, i, rb.n, 77);
      if (h % 100 > 9) continue;
      const tx = rb.x[i + 1] - rb.x[i], tz = rb.z[i + 1] - rb.z[i], tl = Math.hypot(tx, tz) || 1, side = (h >> 8) & 1 ? 1 : -1;
      const x = mx - (tz / tl) * side * 5.8, z = mz + (tx / tl) * side * 5.8, rot = Math.atan2(tx, tz) + ((h >> 12) % 100 - 50) / 500;
      if (!own(x, z) || F.buildings.some((b) => x > b.x0 - 3 && x < b.x1 + 3 && z > b.z0 - 3 && z < b.z1 + 3) || roadD(x, z) < 20) continue;
      wreck(x, z, rot, WRECK[h % WRECK.length]);
    }
  }
  pause(); yield; resume();

  // ---- the Phoenix ring (world/ring.js, data/ring.js): streets, walks, walk-in shells, furniture, containers ------------
  // A building is drawn by the chunk holding its centre (which also holds its containers, beds and roof slots); its
  // collision is clipped into every chunk it reaches. Roof instances are recorded per building so the streamer can hide
  // one when you walk in.
  // A region's holdouts (world/holdout.js: Meridian) answer the same questions as the ring and go through the same stage.
  out.ring = null;
  let ringStreets = null;
  const ringRail = [];
  for (const RG of W.towners ?? [W.ring]) if (RG && RG.touches(cx, cz)) {
    const rs = (out.ring ??= { owned: 0, near: 0, boxes: [], beds: [], roofs: {}, bld: [], decor: 0, streets: 0, ms: 0 });
    pause(); const w0 = work; resume();
    // A flat quad of the road layer clipped to this chunk; u along `axis` in metres / per, v across the band from the
    // rect's own edge (so a strip clipped at a chunk seam carries on in the neighbour without a jump).
    const quad = (x0, z0, x1, z1, y, band, axis, per) => {
      const a0 = Math.max(x0, ox), a1 = Math.min(x1, X1), b0 = Math.max(z0, oz), b1 = Math.min(z1, Z1);
      if (a1 - a0 < 0.05 || b1 - b0 < 0.05 || !R.room(4, 6)) return;
      const v0 = BAND[band][0] + 0.002, v1 = BAND[band][1] - 0.002; // two texels in: no bleed from the next band
      const vx = (x, z) => v0 + (v1 - v0) * (axis === 'z' ? (x - x0) / (x1 - x0) : (z - z0) / (z1 - z0));
      const vtx = (x, z) => R.v(x - ox, y, z - oz, 0, 1, 0, (axis === 'z' ? z : x) / per, vx(x, z));
      const p0 = vtx(a0, b0), p1 = vtx(a1, b0), p2 = vtx(a1, b1), p3 = vtx(a0, b1);
      R.tri(p0, p3, p2); R.tri(p0, p2, p1); // wound to face up
    };
    // Strips of a band across a wide pad (a yard, a parking lot): `w` metres each, along its longer side.
    const pad = (p, y, band, per, w) => {
      const along = p.x1 - p.x0 >= p.z1 - p.z0 ? 'x' : 'z', span = along === 'x' ? p.z1 - p.z0 : p.x1 - p.x0, n = Math.max(1, Math.round(span / w));
      for (let k = 0; k < n; k++) {
        const s0 = (span / n) * k, s1 = (span / n) * (k + 1);
        if (along === 'x') quad(p.x0, p.z0 + s0, p.x1, p.z0 + s1, y, band, 'x', per); else quad(p.x0 + s0, p.z0, p.x0 + s1, p.z1, y, band, 'z', per);
      }
    };
    const rgStreets = RG.streets(ox, oz, X1, Z1);
    ringStreets = ringStreets ? ringStreets.concat(rgStreets) : rgStreets;
    for (const s of rgStreets) {
      quad(s.x0, s.z0, s.x1, s.z1, s.axis === 'z' ? 0.036 : 0.032, 'street', s.axis, 21); rs.streets++;
      // Seams: a street that runs on over an edge (not one that starts there) is named on it.
      if (s.axis === 'z') { if (s.open0) crossings.n.push(`ring:z${s.line}`); if (s.open1) crossings.s.push(`ring:z${s.line}`); }
      else { if (s.open0) crossings.w.push(`ring:x${s.line}`); if (s.open1) crossings.e.push(`ring:x${s.line}`); }
    }
    RG.blocksOver(ox - 4, oz - 4, X1 + 4, Z1 + 4, (b) => {
      for (const p of RG.pads(b)) {
        if (p.band === 'walk') quad(p.x0, p.z0, p.x1, p.z1, 0.026, 'walk', p.x1 - p.x0 >= p.z1 - p.z0 ? 'x' : 'z', 6);
        else if (p.band === 'yard') pad(p, 0.022, 'yard', 12, 6);
        else pad(p, 0.024, 'lot', 10.8, 5.5);
      }
    });
    pause(); yield; resume();
    // Buildings: this chunk's own (drawn here) and its neighbours' that reach into it (collision only).
    const { mine, near } = RG.around(cx, cz, 4);
    pause(); yield; resume();
    const I = (pool, e, k = 1) => { const c = col(e[6]), s = (e[8] ?? 1) * k; return INST[pool].push(e[0], e[1], e[2], e[7] ?? 0, e[3], e[4], e[5], Math.min(1, c[0] * s), Math.min(1, c[1] * s), Math.min(1, c[2] * s)); };
    for (const list of [mine, near]) for (const L of list) {
      const had = !!L.geo, geo = RG.geo(L), own2 = list === mine;
      for (const q of geo.boxes) {
        const b = addBox(q.x0, q.z0, q.x1, q.z1, q.tag, q.h);
        if (b && q.holes) { b.holes = q.holes; b.holeX = q.holeX; b.sill = RING.sill; }
      }
      if (L.lot.x1 > ox && L.lot.x0 < X1 && L.lot.z1 > oz && L.lot.z0 < Z1 || own2) rs.bld.push({ id: L.id, x0: L.x0, z0: L.z0, x1: L.x1, z1: L.z1, owner: L.owner, kind: L.kind, zone: L.zone, ruined: !!L.ruined, roof: !L.ruined });
      if (!own2) { rs.near++; if (!had) { pause(); yield; resume(); } continue; } // (a neighbour's shell built just now: a slice of its own)
      rs.owned++;
      for (const e of geo.walls) I('walls', e);
      I('floors', geo.floor);
      const r0 = INST.roofs.n;
      for (const e of geo.roof) I('roofs', e);
      if (INST.roofs.n > r0) rs.roofs[L.id] = [r0, INST.roofs.n - r0];
      for (const e of geo.canopy) I('roofs', e);
      for (const e of geo.props) I('props', e);
      for (const [kind, x, z, h, r, sq] of geo.flora ?? []) // yard trees (ring.js yardOf): a ruin's are dead trees
        plant(kind, x, z, kind === 'deadtree' ? h * 1.15 / SPECIES.deadtree.h : crownScale(kind, h, r, sq), floraHash(z, x) * 6.283, 0.92 + 0.16 * floraHash(x, z));
      for (const e of geo.decor) { if (rs.decor >= RING.budget.decor) break; I('props', e); rs.decor++; }
      for (const q of geo.boxesIn) rs.boxes.push(q);
      for (const q of geo.beds) rs.beds.push(q);
      pause(); yield; resume(); // a yield a building: a planned one (rooms, furniture, its nav probe) is 0.1-1 ms of work
    }
    // Cars left at the kerb (whole inside this chunk), and the Iron Line running on through the yards.
    for (const w of RG.wrecks(cx, cz)) wreck(w.x, w.z, w.rot, w.color);
    // A holdout's own pieces: its wall, gates and towers, the market, gardens, pit and boneyard, lamps, trees (its centre
    // in this chunk draws it; every box that reaches in is solid here).
    if (RG.extras) {
      const ex = RG.extras(cx, cz);
      for (const it of ex.items) I(it.pool, it.e);
      for (const q of ex.boxes) addBox(q.x0, q.z0, q.x1, q.z1, q.tag, q.h);
      for (const [kind, x, z, h, v] of ex.flora) if (SPECIES[kind]) { const b = INST[poolName(kind)], i = b.push(x, 0, z, floraHash(z, x) * 6.283, h / SPECIES[kind].h, h / SPECIES[kind].h, h / SPECIES[kind].h, 1, 1, 1); if (i >= 0) b.e[i] = v; addBox(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 'tree', h); }
      pause(); yield; resume();
    }
    for (const [s0, s1] of RG.railIn(cx, cz) ?? []) {
      ringRail.push([s0, s1]);
      const x = RING.rail.x, len = s1 - s0, zc = (s0 + s1) / 2;
      INST.props.push(x, 0.08, zc, 0, 3.6, 0.16, len, 0.36, 0.32, 0.28);                    // ballast
      for (const g2 of [-0.8, 0.8]) INST.props.push(x + g2, 0.24, zc, 0, 0.12, 0.14, len, 0.42, 0.38, 0.34); // rails, gone to rust
      for (let z = Math.ceil(s0 / 2.6) * 2.6; z < s1; z += 2.6) INST.props.push(x, 0.15, z, 0, 2.5, 0.1, 0.26, 0.3, 0.24, 0.18);
      // Boxcars left on a siding, here and there (whole inside the chunk, solid).
      for (let z = Math.ceil(s0 / 70) * 70; z < s1 - 8; z += 70) {
        const h = hash32(seed, Math.round(z), 4141);
        if (h % 100 > 38 || z - 8 < oz || z + 8 > Z1 || Math.abs(z) < 540) continue;
        const sx = x + (h & 1 ? 5.5 : -5.5), bc = col(['#6a3a22', '#5a4a36', '#704a2a', '#4f5248'][h % 4]);
        INST.props.push(sx, 2.1, z, 0, 3.0, 3.6, 13.5, bc[0], bc[1], bc[2]);
        INST.props.push(sx, 3.95, z, 0, 2.8, 0.1, 13.2, bc[0] * 0.8, bc[1] * 0.8, bc[2] * 0.8);
        addBox(sx - 1.5, z - 6.75, sx + 1.5, z + 6.75, 'boxcar', 3.9);
      }
    }
    pause(); rs.ms = +(work - w0).toFixed(2); yield; resume();
  }

  // ---- a region's wild (Florida: palmetto and sawgrass, pines, cypress in the sloughs, mangroves on the lagoon) ----------
  if (RGN) yield* regionScatter();
  // ---- desert scatter: shrubs, cacti, boulders, trees by biome and state; a rare shack or camp ---------------------------
  else {
  const B = BIOMES[biomeKey] ?? BIOMES.d, ha = (C * C) / 10000;
  const rel = W.reliefAt(centre.x, centre.z);
  const shrubC = col(flora.shrub);
  const pois = (lam) => { let n = 0; const L = Math.exp(-Math.min(lam, 60)); for (let p = rng(); p > L; p *= rng()) n++; return lam > 60 ? Math.round(lam + (rng() - 0.5) * Math.sqrt(lam) * 2) : n; };
  const spot = (r) => { for (let t = 0; t < 4; t++) { const x = ox + rng.range(3, C - 3), z = oz + rng.range(3, C - 3); if (!blocked(x, z, r)) return [x, z]; } return null; };
  // In the Phoenix ring the desert is mostly paved over: weeds in the yards and the lots, no more.
  const cityF = W.ring ? W.ring.cityK(centre.x, centre.z) : 0, wild = 1 - 0.75 * cityF;
  const nShrub = pois(B.shrubs * ha * wild), nCact = pois(B.cacti * ha * wild), nBould = pois(B.boulders * ha * (0.6 + rel * 1.6) * wild), nTree = pois(B.trees * ha * wild);
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
      // A saguaro (world/flora.js: ribs, arms that leave level and turn up). The old box arms' draws are kept so
      // nothing laid out after it moves.
      const h = rng.range(4.5, 9.5);
      for (let a = 0, na = rng.int(0, 3); a < na; a++) { rng(); rng.range(0.42, 0.7); rng.range(0.9, 1.4); rng.range(1.4, 2.6); }
      plant('saguaro', x, z, h / SPECIES.saguaro.h, floraHash(z, x) * 6.283, v);
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
  const YUC = col('#5c6438');
  for (let k = 0; k < nTree; k++) {
    const p = spot(1.5); if (!p) continue;
    const [x, z] = p;
    if (flora.tree === 'joshua') {
      // A Joshua tree (world/flora.js); the old trunk-and-heads draws are kept so nothing after it moves.
      const h = rng.range(3, 6.5);
      for (let a = 0, na = rng.int(1, 4); a < na; a++) { rng(); rng.range(0.6, 1.4); }
      plant('joshua', x, z, h / SPECIES.joshua.h, floraHash(z, x) * 6.283, 0.92 + 0.16 * floraHash(x, z));
      addBox(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 'tree', h);
    } else if (flora.tree === 'yucca') {
      // Yucca: a shaggy trunk under a spiky head (no flora model for it yet).
      const h = rng.range(1.2, 2.6);
      INST.trunks.push(x, h / 2, z, 0, 1.2, h, 1.2, 0.33, 0.27, 0.2);
      for (let a = 0, na = rng.int(1, 1); a < na; a++) { const ang = rng() * 6.28; INST.shrubs.push(x, h + 0.2, z, ang, 0.9, 0.7, 0.9, YUC[0], YUC[1], YUC[2]); }
      addBox(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 'tree', h);
    } else {
      // A dead mesquite or palo verde, or a green-barked palo verde still alive (world/flora.js). The old box limbs'
      // draws are kept so nothing after it moves.
      const h = rng.range(2.5, 5.5);
      for (let i = 0; i < 3; i++) { rng(); rng.range(0.55, 0.9); }
      const live = flora.tree === 'paloverde' && rng() < 0.6;
      if (live) rng(); // the old crown's turn
      plant(live ? 'paloverde' : 'deadtree', x, z, live ? (h + 0.8) / SPECIES.paloverde.h : h / SPECIES.deadtree.h, floraHash(z, x) * 6.283, 0.92 + 0.16 * floraHash(x, z));
      addBox(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 'tree', h);
    }
  }
  // ---- L1 water: brush down the dry washes, mesquite thickets along the rivers (their own seed: nothing else moves) -----
  if (WT) {
    const br = rngOf(hash32(seed, cx, cz, 5150)), SHB = col('#5f5b3b'), SHR = col('#556038');
    const depthNear = (x, z) => { const i = Math.round((x - ox) / 8), j = Math.round((z - oz) / 8); return i < -1 || j < -1 || i > N_G || j > N_G ? 0 : LW.depth[(j + 1) * NW + i + 1]; };
    const tree = (kind, x, y, z, h) => { const b = INST[poolName(kind)], sc = h / SPECIES[kind].h, sh = 0.9 + 0.18 * floraHash(x, z), i = b.push(x, y, z, floraHash(z, x) * 6.283, sc, sc, sc, sh, sh, sh); if (i >= 0) b.e[i] = floraVariant(x, z); addBox(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 'tree', y + h); };
    WT.banks(cx, cz, 7, (x, z, b, u, nx, nz) => {
      const wash = !b.wet, hw = Math.abs(u);
      for (const off of wash ? [0.3, 0.75, 1.0, 1.15] : [1.1, 1.3, 1.6, 2.0]) {
        if (br() > (wash ? (off < 0.9 ? 0.22 : 0.7) : 0.55)) continue; // a wash: brush lines its banks, a little grows in the bed
        const d = (wash ? hw * off : hw + (off - 1) * 22) + br.range(-1.6, 1.6), px = x + nx * d, pz = z + nz * d;
        if (!own(px, pz) || inIsland(px, pz, 4) || (anySegs && roadD(px, pz) < 26) || onFill(px, pz, 2) || depthNear(px, pz) > 1 || WT.nearFord(px, pz, 45)) continue; // a ford's banks are kept clear (the way across)
        if (F.buildings.some((bd) => px > bd.x0 - 4 && px < bd.x1 + 4 && pz > bd.z0 - 4 && pz < bd.z1 + 4)) continue;
        const sq = WT.sample(px, pz);
        if (sq.depth > 0) continue;
        const y = sq.bedRel, r = br();
        if (wash ? r < 0.1 : r < 0.32) tree(wash ? (r < 0.05 ? 'paloverde' : 'mesquite') : r < 0.26 ? 'mesquite' : 'deadtree', px, y, pz, br.range(3, 5.5));
        else if (wash && r > 0.93) { const tb = INST[poolName('tumbleweed')], ti = tb.push(px, y, pz, br() * 6.28, 1, 1, 1, 1, 1, 1); if (ti >= 0) tb.e[ti] = floraVariant(px, pz); }
        else if (wash && off < 0.9 && r > 0.55) { const rr = br.range(0.25, 0.7), v = br.range(0.85, 1.05); INST.boulders.push(px, y + rr * 0.25, pz, br() * 6.28, rr * 1.2, rr * 0.5, rr, 0.66 * v, 0.6 * v, 0.52 * v); } // river cobbles in a wash's bed
        else { const ss = br.range(0.6, 1.4), c = wash ? SHB : SHR, v = br.range(0.78, 1.06); INST.shrubs.push(px, y + ss * 0.2, pz, br() * 6.28, ss * br.range(0.9, 1.3), ss * 0.55, ss * br.range(0.9, 1.3), c[0] * v, c[1] * v, c[2] * v); }
      }
    });
    pause(); yield; resume();
  }

  // A shack (5%) and a camp (2%): somebody tried to live out here.
  if (!isl && rng() < 0.05 && cityF < 0.2) {
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
  if (!isl && rng() < 0.02 && cityF < 0.2) {
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
  } // (the desert)
  // THE BRUSH (world/brush.js): woods, undergrowth and hot zones where strokes reach (its own random stream).
  if (BR) out.brush = yield* brushStage(BR, { INST, addBox, blocked, boxes, ox, oz, cx, cz, seed, state, pause, resume });
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
      // Water too deep to plan a walk (1.2 m) or a drive (0.6 m) through, as the island's store does (you can still swim
      // it, or take a boat).
      if (wat?.any) {
        const lim = cell === 1 ? 1.2 : 0.6, D = wat.d, per = 4 / cell;
        for (let j = 0; j < WG - 1; j++) for (let i = 0; i < WG - 1; i++) {
          const q = j * WG + i, mx = Math.max(D[q], D[q + 1], D[q + WG], D[q + WG + 1]);
          if (mx <= lim) continue; // a 4 m cell with nothing too deep: its nav cells stay as they are
          const mn = Math.min(D[q], D[q + 1], D[q + WG], D[q + WG + 1]);
          for (let z = j * per; z < (j + 1) * per; z++) for (let x = i * per; x < (i + 1) * per; x++)
            if (mn > lim || waterAt(ox + (x + 0.5) * cell, oz + (z + 0.5) * cell) > lim) { a[z * n + x] = 1; any = 1; }
        }
      }
      // Inside the island the pinned store answers: leave those cells to it.
      tile.any = !!any;
    };
    rast(foot, 1, RAD_FOOT);
    rast(car, 2, RAD_CAR);
    // L1 water: walkers do not plan through water deeper than 1.2 m, drivers through more than `ford` (you can still
    // swim it, or boat it). A deck is dry ground here (depthAt in 2-D): routes go over the bridge.
    if (WT) {
      // Depth at the corners of a 4 m lattice; a cell takes its deepest corner (conservative: a route never grazes deep
      // water at a cell's edge), each 1 m / 2 m nav cell its 4 m cell's.
      const n4 = C / 4, m4 = n4 + 1, d4 = (scratch.d4 ??= new Float32Array(m4 * m4));
      for (let j = 0; j < m4; j++) { for (let i = 0; i < m4; i++) d4[j * m4 + i] = WT.depthAt(ox + i * 4, oz + j * 4); if ((j & 3) === 3) { pause(); yield; resume(); } }
      const cell = (i, j) => { const k = j * m4 + i; return Math.max(d4[k], d4[k + 1], d4[k + m4], d4[k + m4 + 1]); };
      const fa = foot.a, ca = car.a;
      for (let z = 0; z < C; z++) for (let x = 0; x < C; x++) if (cell(x >> 2, z >> 2) > 1.2) { fa[z * C + x] = 1; foot.any = true; }
      for (let z = 0; z < C / 2; z++) for (let x = 0; x < C / 2; x++) if (cell(x >> 1, z >> 1) > WATER.ford) { ca[z * (C / 2) + x] = 1; car.any = true; }
    }
  }
  pause(); yield; resume();

  // ---- the minimap tile: 2 m per pixel, in the HUD radar's greens ------------------------------------------------------
  if (mm) {
    const g = mm.getContext('2d'), k = mm.width / C;
    const tc = SURF.ground.col, base = (Math.round(N_G / 2) * N_G + Math.round(N_G / 2)) * 3;
    const lum = Math.min(1, ((tc[base] * 0.3 + tc[base + 1] * 0.59 + tc[base + 2] * 0.11) * 0.55 - 0.11) / 0.45);
    g.fillStyle = `rgb(${Math.round(22 + 70 * lum * 0.5)},${Math.round(32 + 88 * lum * 0.5)},${Math.round(14 + 34 * lum * 0.5)})`;
    g.fillRect(0, 0, mm.width, mm.height);
    if (wat?.any) { // a region's water, in the island map's water colour
      g.fillStyle = '#2f5a5c';
      for (let j = 0; j < WG - 1; j++) for (let i = 0; i < WG - 1; i++) { const q = j * WG + i; if (wat.d[q] + wat.d[q + 1] + wat.d[q + WG] + wat.d[q + WG + 1] > 0.6) g.fillRect(i * 4 * k, j * 4 * k, 4 * k + 0.5, 4 * k + 0.5); }
    }
    for (const m of mesas) { g.fillStyle = 'rgba(92,70,40,0.85)'; g.beginPath(); g.ellipse((m.x - ox) * k, (m.z - oz) * k, m.r * k * 0.85, (m.kind === 'ridge' ? m.r / 2.2 : m.r) * k * 0.85, -m.rot, 0, 6.29); g.fill(); }
    // L1 water: open water in the island map's water colour, dry washes and playas in pale sand.
    if (WT) for (let j = 0; j < N_G; j++) for (let i = 0; i < N_G; i++) {
      const q = (j + 1) * NW + i + 1, kd = LW.kind[q];
      const fill = LW.depth[q] > 0 ? '#2f5a5c' : (kd === 3 && LW.carve[q] < -0.3) ? '#7d7048' : kd === 4 ? '#a59f88' : null;
      if (fill) { g.fillStyle = fill; g.fillRect((i * 8 - 4) * k, (j * 8 - 4) * k, 8 * k + 0.5, 8 * k + 0.5); }
    }
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
    // The Phoenix ring: its streets, the Iron Line through the yards, every building (a ruin paler, open to the sky).
    if (out.ring) {
      g.fillStyle = '#7d9150';
      for (const s of ringStreets) g.fillRect((s.x0 - ox) * k, (s.z0 - oz) * k, (s.x1 - s.x0) * k, (s.z1 - s.z0) * k);
      g.fillStyle = '#6a5a40';
      for (const [s0, s1] of ringRail) g.fillRect((RING.rail.x - 1.5 - ox) * k, (s0 - oz) * k, 3 * k, (s1 - s0) * k);
      for (const b of out.ring.bld) { g.fillStyle = b.ruined ? '#4f6234' : '#6a8a3e'; g.fillRect((b.x0 - ox) * k, (b.z0 - oz) * k, (b.x1 - b.x0) * k, (b.z1 - b.z0) * k); }
    }
    if (isl) g.clearRect(Math.max(0, (-ISLAND - ox) * k), Math.max(0, (-ISLAND - oz) * k), Math.max(0, (Math.min(X1, ISLAND) - Math.max(ox, -ISLAND)) * k), Math.max(0, (Math.min(Z1, ISLAND) - Math.max(oz, -ISLAND)) * k));
  }

  // ---- L1 water: a road dips where it fords (a county road through a wash, shallow water); never on a deck or a culvert
  if (WT) {
    const p = SURF.road.pos;
    for (let i = 0; i < SURF.road.nv; i++) { const x = p[i * 3] + ox, z = p[i * 3 + 2] + oz; if (WT.deckAt(x, z) >= 0) continue; p[i * 3 + 1] += WT.sample(x, z).floorRel; }
    pause(); yield; resume();
  }

  // ---- real terrain (flag): lift everything onto the ground ------------------------------------------------------------
  // Every instance and every road, rock and fill vertex was laid out over flat ground: each goes up by the ground under
  // it (the same grid and triangles the drawn ground uses, so nothing floats or sinks). The rails were pitched above.
  // Collision boxes keep heights measured from the ground (movers ask from their own ground: vehicles.js, stunts.js).
  if (T) {
    for (const k of POOL_NAMES) {
      if (k === 'rails') continue;
      const B2 = INST[k], m = B2.m;
      for (let i = 0; i < B2.n; i++) { const o = i * 16; m[o + 13] += T.at(m[o + 12], m[o + 14]); }
    }
    for (const L2 of [SURF.road, SURF.rock]) { const p = L2.pos; for (let i = 0; i < L2.nv; i++) p[i * 3 + 1] += T.at(p[i * 3] + ox, p[i * 3 + 2] + oz); }
    pause(); yield; resume();
  }

  // ---- take the results, hash them -----------------------------------------------------------------------------------
  out.surf = { ground: SURF.ground.take(ox, oz), road: SURF.road.take(ox, oz), rock: SURF.rock.take(ox, oz) };
  // ONE water layer: a region's sheet and L1's sheet and wash beds both wrote into SURF.water (only a chunk with water
  // has the layer, so a dry P1 chunk keeps its hash).
  if (SURF.water.nv) out.surf.water = SURF.water.take(ox, oz);
  out.l1water = WT ? { depthMax: 0, cells: 0 } : null; // L1's stats (out.water is a region's 4 m grid: the streamer caches it)
  if (WT) for (let k = 0; k < LW.depth.length; k++) if (LW.depth[k] > 0) { out.l1water.cells++; if (LW.depth[k] > out.l1water.depthMax) out.l1water.depthMax = +LW.depth[k].toFixed(2); }
  out.inst = {};
  let n = 0;
  for (const k of POOL_NAMES) { if (INST[k].n) out.inst[k] = INST[k].take(); out.counts[k] = INST[k].n; n += INST[k].n; if (INST[k].n >= INST[k].cap) out.warnings.push(`instance cap ${k}`); }
  for (const k of Object.keys(SURF)) if (SURF[k].over) out.warnings.push(`surface cap ${k}`);
  out.instances = n;
  out.buildings = F.buildings.filter((b) => own(b.cx, b.cz)).length + (out.ring?.owned ?? 0);
  out.tiles = tiles; out.mm = mm;
  // Content bounds (what the hot ring measures distance to): owned instances and surfaces, never the island interior.
  let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
  const grow = (x0, z0, x1, z1) => { if (x0 < bx0) bx0 = x0; if (z0 < bz0) bz0 = z0; if (x1 > bx1) bx1 = x1; if (z1 > bz1) bz1 = z1; };
  for (const s of Object.values(out.surf)) if (s) grow(s.bounds.wx0, s.bounds.wz0, s.bounds.wx1, s.bounds.wz1);
  for (const r of Object.values(out.inst)) for (let i = 0; i < r.n; i++) { const x = r.m[i * 16 + 12], z = r.m[i * 16 + 14]; grow(x - 3, z - 3, x + 3, z + 3); }
  out.bounds = bx0 === Infinity ? null : { x0: bx0, z0: bz0, x1: bx1, z1: bz1 };
  const H = new Hasher().int(cx).int(cz).str(W.dataHash);
  if (BR) H.str(BR.hash); // the painted strokes are data too
  for (const b of boxes) H.num(b.minX).num(b.minZ).num(b.maxX).num(b.maxZ).num(b.height).num(b.base).str(b.tag);
  for (const k of POOL_NAMES) { const r = out.inst[k]; if (!r && !P1_POOLS.has(k)) continue; H.str(k).int(r?.n ?? 0); if (r) for (let i = 0; i < r.m.length; i += 7) H.num(r.m[i]); }
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
