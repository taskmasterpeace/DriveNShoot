// THE BRUSH (docs/design/WEB_FORGE.md §3.4): density painted over the land as data rows (src/data/brush.json), read by
// the chunk generator. A stroke is a capsule along a polyline (usmap metres, the map's own frame; world = (u - PHX) x K)
// with a radius, a value 0..1, an op (add, sub, set) and a soft edge; strokes apply in file order. Layers:
//   forest  tree stems, 0 none .. 1 a closed wood             canopy  crown size and the share of tall canopy trees
//   brush   undergrowth                                        ruin    the corridor buildings' ruined share (worldindex)
//   rad     radiation: poisoned ground, dead trees, glowing seeps, leaking drums (radAt for the systems that care)
// A chunk no stroke reaches is built exactly as before: the stage below never runs and draws nothing from the chunk's
// own random stream (it has its own), so painting one place never moves a tree anywhere else. A chunk is still a pure
// function of the data: the strokes that reach it go into its hash.
import * as THREE from 'three';
import BRUSH from '../data/brush.json';
import { toWorldX, toWorldZ, C, hash32, rngOf } from './geo.js';
import { STREAM } from '../data/streaming.js';
import { SPECIES, FLORA_KINDS, floraHash, floraVariant, poolName } from './flora.js';

const _q = new THREE.Quaternion(), _eu = new THREE.Euler(), _mx = new THREE.Matrix4(), _v3 = new THREE.Vector3(), _sc = new THREE.Vector3(); // the floor's logs (no per-instance allocation)
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const keyOf = (cx, cz) => `${cx},${cz}`;
// Instance colours are LINEAR (three.js colour management, as chunkgen's col() gives them): sRGB hex -> linear.
const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const hexRgb = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)]; };
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }

// One stroke in world metres: its segments, bounds and falloff.
function compile(s, order) {
  const K = STREAM.K, n = s.pts.length, x = new Float64Array(n), z = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = toWorldX(s.pts[i][0]); z[i] = toWorldZ(s.pts[i][1]); }
  const r = s.r * K, soft = s.soft ?? 0.5;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, x[i]); x1 = Math.max(x1, x[i]); z0 = Math.min(z0, z[i]); z1 = Math.max(z1, z[i]); }
  return { id: s.id, layer: s.layer, op: s.op ?? 'add', v: s.v, r, ri: r * (1 - soft), x, z, n, order, x0: x0 - r, z0: z0 - r, x1: x1 + r, z1: z1 + r, json: JSON.stringify(s) };
}
// Distance from (px, pz) to the stroke's polyline (a single point is a disc).
function dist(s, px, pz) {
  if (s.n === 1) return Math.hypot(px - s.x[0], pz - s.z[0]);
  let best = Infinity;
  for (let i = 1; i < s.n; i++) {
    const ax = s.x[i - 1], az = s.z[i - 1], dx = s.x[i] - ax, dz = s.z[i] - az, l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(px - ax - dx * t, pz - az - dz * t);
    if (d < best) best = d;
  }
  return best;
}
// One layer at a point over a list of strokes (in order). base: the value with no paint (null = "not painted").
function sampleList(list, layer, px, pz, base) {
  let v = base ?? 0, hit = false;
  for (let k = 0; k < list.length; k++) {
    const s = list[k];
    if (s.layer !== layer || px < s.x0 || px > s.x1 || pz < s.z0 || pz > s.z1) continue;
    const d = dist(s, px, pz);
    if (d >= s.r) continue;
    const f = d <= s.ri ? 1 : 1 - sm((d - s.ri) / (s.r - s.ri || 1));
    if (f <= 0) continue;
    hit = true;
    if (s.op === 'sub') v = Math.max(0, v - s.v * f);
    else if (s.op === 'set') v += (s.v - v) * f;
    else v = Math.min(1, v + s.v * f);
  }
  return hit ? v : base;
}

export class BrushField {
  constructor(data = BRUSH) { this.load(data); }
  load(data) {
    this.data = data;
    this.knobs = data.knobs ?? {};
    this.palettes = data.palettes ?? {};
    this.strokes = (data.strokes ?? []).map(compile);
    this.version = data.version ?? 0;
    // Strokes by chunk (inclusive of the edges, so both chunks on a seam agree on the ground there).
    this.byChunk = new Map();
    for (const s of this.strokes) {
      for (let cx = Math.floor((s.x0 - 9) / C); cx <= Math.floor((s.x1 + 9) / C); cx++) for (let cz = Math.floor((s.z0 - 9) / C); cz <= Math.floor((s.z1 + 9) / C); cz++) {
        if (dist(s, (cx + 0.5) * C, (cz + 0.5) * C) > s.r + C * 0.72 + 9) continue; // the capsule never reaches this chunk
        const k = keyOf(cx, cz); let b = this.byChunk.get(k); if (!b) this.byChunk.set(k, (b = [])); b.push(s);
      }
    }
    this.rulesHash = fnv(JSON.stringify([this.knobs, this.palettes]));
    this.chunks = new Map(); // key -> ChunkBrush (or null), cached
    this.hash = fnv(JSON.stringify([this.rulesHash, this.strokes.map((s) => s.json)]));
    return this;
  }
  // What the chunk generator asks: null when no stroke reaches this chunk (the zero-cost path).
  chunk(cx, cz) {
    const k = keyOf(cx, cz);
    if (this.chunks.has(k)) return this.chunks.get(k);
    const list = this.byChunk.get(k) ?? null;
    const cb = list ? new ChunkBrush(this, cx, cz, list) : null;
    if (this.chunks.size > 2048) this.chunks.clear();
    this.chunks.set(k, cb);
    return cb;
  }
  // Every layer at a world point (the agent's `brush x z`, the forge's inspector).
  at(x, z) {
    const list = this.byChunk.get(keyOf(Math.floor(x / C), Math.floor(z / C))) ?? [];
    const o = {};
    for (const L of ['forest', 'canopy', 'brush', 'ruin', 'rad']) o[L] = sampleList(list, L, x, z, L === 'canopy' || L === 'ruin' ? null : 0);
    o.strokes = list.filter((s) => x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && dist(s, x, z) < s.r).map((s) => s.id);
    return o;
  }
  // One layer at a point, no allocation (systems/stance.js: how hidden a prone body is).
  layerAt(layer, x, z) { const list = this.byChunk.get(keyOf(Math.floor(x / C), Math.floor(z / C))); return list ? sampleList(list, layer, x, z, 0) : 0; }
  radAt(x, z) { const list = this.byChunk.get(keyOf(Math.floor(x / C), Math.floor(z / C))); return list ? sampleList(list, 'rad', x, z, 0) : 0; }
  ruinAt(x, z) { const list = this.byChunk.get(keyOf(Math.floor(x / C), Math.floor(z / C))); return list ? sampleList(list, 'ruin', x, z, null) : null; }
  // The chunks a set of strokes touches (the forge's push: lay out only what changed).
  chunksOf(rows) {
    const out = new Set();
    for (const r of rows) {
      const s = compile(r, 0);
      for (let cx = Math.floor((s.x0 - 9) / C); cx <= Math.floor((s.x1 + 9) / C); cx++) for (let cz = Math.floor((s.z0 - 9) / C); cz <= Math.floor((s.z1 + 9) / C); cz++) {
        // Only the chunks the capsule itself reaches (its centre within r + half a chunk's diagonal), not its whole box.
        if (dist(s, (cx + 0.5) * C, (cz + 0.5) * C) <= s.r + C * 0.72 + 9) out.add(keyOf(cx, cz));
      }
    }
    return out;
  }
}

// The strokes that reach one chunk, and what the generator does with them.
class ChunkBrush {
  constructor(F, cx, cz, list) {
    this.F = F; this.cx = cx; this.cz = cz; this.list = list;
    this.layers = new Set(list.map((s) => s.layer));
    this.hash = fnv(F.rulesHash + list.map((s) => s.json).join('|'));
    const K = F.knobs;
    this.tF = K.tintForest ?? [0.58, 0.68, 0.46]; this.tR = K.tintRad ?? [1, 0.94, 0.5];
    this.kF = K.tintForestK ?? 0.6; this.kR = K.tintRadK ?? 0.55;
  }
  sample(layer, x, z, base = 0) { return sampleList(this.list, layer, x, z, base); }
  // The ground under the paint: leaf litter under a wood, yellowed, sick earth in a hot zone. Multiplies the tint.
  tint(x, z, c) {
    if (this.layers.has('forest')) { const f = this.sample('forest', x, z, 0) * this.kF; if (f > 0) for (let i = 0; i < 3; i++) c[i] *= 1 + (this.tF[i] - 1) * f; }
    if (this.layers.has('rad')) { const r = this.sample('rad', x, z, 0) * this.kR; if (r > 0) for (let i = 0; i < 3; i++) c[i] *= 1 + (this.tR[i] - 1) * r; }
    return c;
  }
}

export const brushField = new BrushField();
// Live re-load (the forge's push, src/forge/live.js): the module's rows are replaced in place, so every reader sees them.
export function reloadBrush(data) {
  for (const k of Object.keys(BRUSH)) delete BRUSH[k];
  Object.assign(BRUSH, data);
  return brushField.load(BRUSH);
}

// ---- the stage the chunk generator runs (world/chunkgen.js), only where strokes reach -----------------------------------
// ctx: { INST, plant, addBox, blocked, ox, oz, cx, cz, seed, state, pause, resume }. Its own random stream (never the
// chunk's), a fixed number of draws per grid cell, so a stroke changes only the cells it covers.
export function* brushStage(B, ctx) {
  const { INST, addBox, blocked, ox, oz, cx, cz, seed, pause, resume, boxes } = ctx;
  const K = B.F.knobs, rng = rngOf(hash32(seed, cx, cz, 0xb2054));
  const have = (k) => FLORA_KINDS.includes(k);
  const pal0 = B.F.palettes[ctx.state] ?? B.F.palettes._ ?? {};
  const canopyKinds = (pal0.canopy ?? []).filter(have), underKinds = (pal0.under ?? []).filter(have);
  if (!canopyKinds.length) canopyKinds.push(...['mesquite', 'paloverde'].filter(have));
  if (!underKinds.length) underKinds.push(...canopyKinds);
  const shrubC = hexRgb(pal0.shrub ?? '#3f4a2c');
  const n = { trees: 0, under: 0, dead: 0, shrubs: 0, glows: 0, drums: 0 };
  const L = B.layers;
  let k = 0;
  const tick = function* () { if ((++k & 63) === 63) { pause(); yield; resume(); } };
  // A plant (world/flora.js), its crown spread wider than it stands tall where the row says (a canopy, not a wall).
  const plant = (kind, x, z, s, spread, rot, shade) => { const b = INST[poolName(kind)], i = b.push(x, 0, z, rot, s * spread, s, s * spread, shade, shade, shade); if (i >= 0) b.e[i] = floraVariant(x, z); };
  // Under a wood the desert gives way: cacti and desert plants go (and their collision with them), rocks and the desert
  // shrubs take moss and shade. Only what this chunk laid out before the stage, only where the wood is.
  if (L.has('forest')) {
    const gone = [];
    for (const name of ['cacti', 'fl_saguaro', 'fl_joshua', 'fl_pricklypear', 'fl_ocotillo', 'fl_tumbleweed']) {
      const b = INST[name]; if (!b?.n) continue;
      let w = 0;
      for (let i = 0; i < b.n; i++) {
        const x = b.m[i * 16 + 12], z = b.m[i * 16 + 14];
        if (B.sample('forest', x, z, 0) > 0.35) { gone.push(x, z); continue; }
        if (w !== i) { b.m.copyWithin(w * 16, i * 16, i * 16 + 16); b.c.copyWithin(w * 3, i * 3, i * 3 + 3); if (b.e) b.e.copyWithin(w * b.k, i * b.k, i * b.k + b.k); }
        w++;
      }
      b.n = w;
    }
    if (gone.length && boxes) for (let i = boxes.length - 1; i >= 0; i--) {
      const bx = boxes[i]; if (bx.tag !== 'cactus' && bx.tag !== 'tree') continue;
      const mx = (bx.minX + bx.maxX) / 2, mz = (bx.minZ + bx.maxZ) / 2;
      for (let q = 0; q < gone.length; q += 2) if (Math.abs(gone[q] - mx) < 0.2 && Math.abs(gone[q + 1] - mz) < 0.2) { boxes.splice(i, 1); break; }
    }
    const MOSS = K.moss ?? [0.5, 0.58, 0.42];
    for (const name of ['boulders', 'shrubs']) {
      const b = INST[name];
      for (let i = 0; i < b.n; i++) {
        const f = B.sample('forest', b.m[i * 16 + 12], b.m[i * 16 + 14], 0);
        if (f > 0) for (let c = 0; c < 3; c++) b.c[i * 3 + c] *= 1 + (MOSS[c] - 1) * f;
      }
    }
    n.cleared = gone.length / 2;
  }
  // A hot zone withers what grows in it: the desert's shrubs go a dead grey-brown (no draws, colour only).
  if (L.has('rad')) {
    const SICK = K.radWither ?? [0.11, 0.085, 0.045], b = INST.shrubs; // linear: dead grey-brown
    for (let i = 0; i < b.n; i++) { const r = B.sample('rad', b.m[i * 16 + 12], b.m[i * 16 + 14], 0); if (r > 0) for (let c = 0; c < 3; c++) b.c[i * 3 + c] += (SICK[c] - b.c[i * 3 + c]) * r; }
  }
  // Trees on a jittered grid (forest), each cell four draws whatever happens there.
  if (L.has('forest')) {
    const cell = 100 / Math.sqrt(K.forestPerHa ?? 92), N = Math.floor(C / cell), step = C / N;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = ox + (i + 0.12 + rng() * 0.76) * step, z = oz + (j + 0.12 + rng() * 0.76) * step;
      const a = rng(), b = rng(), c = rng(), d = rng();
      const f = B.sample('forest', x, z, 0);
      if (f <= 0.002 || a >= Math.pow(f, K.forestGamma ?? 1.15)) continue;
      const can = B.sample('canopy', x, z, null) ?? (K.canopyDefault ?? 0.7) * f;
      const rad = L.has('rad') ? B.sample('rad', x, z, 0) : 0;
      const dead = rad > 0 && b < rad * (K.radDead ?? 0.85);
      const tall = !dead && c < 0.4 + 0.55 * can;
      const kind = dead ? (have('deadtree') ? 'deadtree' : canopyKinds[0]) : tall ? canopyKinds[Math.floor(d * canopyKinds.length) % canopyKinds.length] : underKinds[Math.floor(d * underKinds.length) % underKinds.length];
      if (blocked(x, z, tall ? 1.4 : 1)) continue;
      // Under the camera (34 m up) a 20 m tree is a wall: canopy trees stand 0.6-1.05 of their model, the understory
      // (young trees, scrub) half that. Canopies are shaded deeper than desert flora: a wood reads dark from above.
      const span = (K.crownMax ?? 1.05) - (K.crownMin ?? 0.62);
      const scale = tall ? ((K.crownMin ?? 0.62) + span * ((d * 7.31) % 1)) * (0.85 + 0.25 * can) : 0.42 + 0.3 * ((d * 5.17) % 1);
      const shade = (dead ? 0.92 : tall ? 0.6 + 0.24 * floraHash(x, z) : 0.72 + 0.2 * floraHash(x, z)) * (K.shade?.[kind] ?? 1);
      plant(kind, x, z, scale, tall ? (K.spread?.[kind] ?? 1) : 1, floraHash(z, x) * 6.283, shade);
      const h = (SPECIES[kind]?.h ?? 5) * scale, tr = Math.min(0.55, 0.22 + 0.04 * h);
      addBox(x - tr, z - tr, x + tr, z + tr, 'tree', h);
      if (dead) n.dead++; else if (tall) n.trees++; else n.under++;
      yield* tick();
    }
    // Undergrowth under the wood: low dark clumps (they hold the ground between the trunks from above).
    const per = (K.underShrubPerHa ?? 70) * (C * C) / 10000;
    for (let q = 0; q < per; q++) {
      const x = ox + rng() * C, z = oz + rng() * C, s = 0.6 + rng() * 1.1, a = rng() * 6.283, v = 0.78 + rng() * 0.3;
      const f = B.sample('forest', x, z, 0);
      if (rng() >= f || blocked(x, z, 0.6)) continue;
      INST.shrubs.push(x, s * 0.22, z, a, s * 1.25, s * 0.6, s * 1.15, shrubC[0] * v, shrubC[1] * v, shrubC[2] * v);
      n.shrubs++;
      yield* tick();
    }
    // THE FLOOR (docs/design/WEB_LOOK.md §3.7): what lies between the trunks, so a wood reads as a wood from above.
    // The ground's own floor (leaf litter, needles, loam, moss) is the ground shader's (world/surfaces.js); here, on a
    // stream of its own after everything above (no tree moves for it): ferns in rosettes, fallen logs, stumps.
    const rf = rngOf(hash32(seed, cx, cz, 0xf1002)), FERN = K.fern ?? ['#3f5a26', '#4a6a2c', '#36502a', '#557434'];
    const fernC = FERN.map(hexRgb), logC = hexRgb(K.logColor ?? '#857462'), mossC = hexRgb(K.mossColor ?? '#5a6a34');
    for (let q = 0, m = Math.round((K.fernPerHa ?? 150) * (C * C) / 10000); q < m; q++) {
      const x = ox + rf() * C, z = oz + rf() * C, s = 1.0 + rf() * 0.9, a0 = rf() * 6.283, nf = 5 + Math.floor(rf() * 3), c = fernC[Math.floor(rf() * fernC.length)], v = 0.8 + rf() * 0.35;
      const f = B.sample('forest', x, z, 0);
      if (rf() >= f || blocked(x, z, 0.5)) continue;
      // A rosette of fronds: flat strips from the heart, each reaching out from its own centre.
      for (let k = 0; k < nf; k++) {
        const a = a0 + (k / nf) * 6.283 + (rf() - 0.5) * 0.4, L = s * (0.75 + rf() * 0.4);
        INST.props.push(x + Math.sin(a) * L * 0.5, 0.16 + 0.07 * (k & 1), z + Math.cos(a) * L * 0.5, a, 0.3 * s, 0.05, L, c[0] * v, c[1] * v, c[2] * v);
      }
      n.ferns = (n.ferns ?? 0) + 1;
      yield* tick();
    }
    for (let q = 0, m = Math.round((K.logPerHa ?? 8) * (C * C) / 10000); q < m; q++) {
      const x = ox + rf() * C, z = oz + rf() * C, L = 3.5 + rf() * 5.5, r = 0.28 + rf() * 0.2, yaw = rf() * 3.1416, stump = rf() < 0.3, v = 0.75 + rf() * 0.3, mo = rf();
      const f = B.sample('forest', x, z, 0), dx = Math.cos(yaw) * L / 2, dz = -Math.sin(yaw) * L / 2; // the log's axis (laid down below)
      if (rf() >= f || blocked(x, z, 1.2) || (!stump && (blocked(x + dx, z + dz, 0.8) || blocked(x - dx, z - dz, 0.8)))) continue;
      const cr = (logC[0] + (mossC[0] - logC[0]) * mo * 0.6) * v, cg = (logC[1] + (mossC[1] - logC[1]) * mo * 0.6) * v, cb = (logC[2] + (mossC[2] - logC[2]) * mo * 0.6) * v;
      if (stump) { // a cut or broken stump: short, wide, a lighter top
        INST.trunks.push(x, 0.3, z, yaw, r * 3.2, 0.6, r * 3.2, cr, cg, cb);
        addBox(x - r * 0.9, z - r * 0.9, x + r * 0.9, z + r * 0.9, 'stump', 0.6);
      } else { // a fallen trunk on its side (the trunks pool's cylinder, laid down), and its collision along it
        _q.setFromEuler(_eu.set(0, yaw, Math.PI / 2, 'YXZ'));
        _mx.compose(_v3.set(x, r * 0.8, z), _q, _sc.set(r * 3.2, L, r * 3.2));
        INST.trunks.pushMatrix(_mx, cr, cg, cb);
        const hx = Math.abs(Math.cos(yaw)) * L / 2 + r, hz = Math.abs(Math.sin(yaw)) * L / 2 + r;
        if (Math.min(hx, hz) < 1.2) addBox(x - hx, z - hz, x + hx, z + hz, 'log', r * 3.2); // a diagonal log stays looks-only
      }
      n.logs = (n.logs ?? 0) + 1;
    }
  }
  // Undergrowth on its own (brush): olive clumps, creosote and the odd tumbleweed.
  if (L.has('brush')) {
    const per = (K.brushPerHa ?? 150) * (C * C) / 10000;
    for (let q = 0; q < per; q++) {
      const x = ox + rng() * C, z = oz + rng() * C, s = 0.5 + rng() * 1.0, a = rng() * 6.283, v = 0.8 + rng() * 0.3, pick = rng();
      const b = B.sample('brush', x, z, 0);
      if (rng() >= b || blocked(x, z, 0.6)) continue;
      if (pick < 0.22 && have('creosote')) plant('creosote', x, z, 0.7 + s * 0.4, 1, a, v);
      else if (pick < 0.27 && have('tumbleweed')) plant('tumbleweed', x, z, 0.8 + s * 0.4, 1, a, v);
      else INST.shrubs.push(x, s * 0.2, z, a, s * 1.2, s * 0.55, s * 1.2, shrubC[0] * v * 1.12, shrubC[1] * v * 1.08, shrubC[2] * v);
      n.shrubs++;
      yield* tick();
    }
  }
  // A hot zone: seeps that glow at night, leaking drums, and (above, in the wood) dead trees.
  if (L.has('rad')) {
    const ha = (C * C) / 10000;
    for (let q = 0, m = Math.ceil((K.radGlowPerHa ?? 1.6) * ha); q < m; q++) {
      const x = ox + rng() * C, z = oz + rng() * C, s = 6 + rng() * 10, v = rng();
      const r = B.sample('rad', x, z, 0);
      if (v >= r || blocked(x, z, 2)) continue;
      INST.glows.push(x, 0.11, z, 0, s, 1, s, 0.3, 0.85, 0.06); // acid green (additive, linear)
      n.glows++;
    }
    for (let q = 0, m = Math.ceil((K.radDrumPerHa ?? 0.7) * ha); q < m; q++) {
      const x = ox + rng() * C, z = oz + rng() * C, cnt = 1 + Math.floor(rng() * 4), v = rng(), rot = rng() * 6.283;
      const r = B.sample('rad', x, z, 0);
      if (v >= r || blocked(x, z, 2.2)) continue;
      for (let d = 0; d < cnt; d++) {
        const px = x + Math.cos(rot + d * 1.9) * (d ? 1.1 : 0), pz = z + Math.sin(rot + d * 1.9) * (d ? 1.1 : 0), tip = d === 3;
        INST.barrels.push(px, tip ? 0.45 : 0.55, pz, rot + d, 1, tip ? 0.82 : 1, 1, 0.2 + 0.05 * d, 0.13 + 0.03 * d, 0.03); // rusted yellow drums (linear)
        addBox(px - 0.45, pz - 0.45, px + 0.45, pz + 0.45, 'barrel', 1.1);
      }
      INST.glows.push(x, 0.12, z, 0, 7, 1, 7, 0.28, 0.8, 0.05);
      n.drums++;
    }
  }
  return n;
}
