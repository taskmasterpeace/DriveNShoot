import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Pool } from './pools.js';

// Flora (docs/design/WEB_LOOK.md "Trees"): the trees and desert plants, authored in Blender by
// tools/blenderforge/gen_flora.py and drawn here as ONE InstancedMesh per species for the whole world.
//   - Each species' GLB (public/models/flora/<kind>.glb) holds three seeded variants, nodes <kind>_v0.._v2. The loader
//     merges each variant's parts into one geometry with vertex colours and packs the three into one geometry; a
//     per-vertex `fvar` says which variant a vertex belongs to and a per-instance `aVar` picks one (the others collapse
//     to a point in the vertex shader). Three variants, one draw (+ one shadow draw) per species in view.
//   - A species' mesh is a streamer Pool (world/pools.js): the island takes a permanent range of it at boot
//     (flora.add), streamed chunks take and give back ranges like any pool (chunkgen INST.fl_<kind>, streamer.pools).
//   - The GLBs load asynchronously; until a species has loaded its mesh draws a degenerate placeholder (nothing on
//     screen), then the real geometry is swapped in. Instances, collision and positions never wait for it.
// SPECIES: h is the model's height in metres (gen_flora.py scales every variant to exactly that), so a caller asking
// for a tree H metres tall passes scale = H / h. cap: instances the world can hold at once (island + hot chunks).
export const SPECIES = {
  paloverde: { h: 4.6, cap: 3000 },
  mesquite: { h: 4.4, cap: 2000 },
  fanpalm: { h: 11.0, cap: 300 },
  datepalm: { h: 9.5, cap: 300 },
  citrus: { h: 3.6, cap: 2000 },
  saguaro: { h: 7.5, cap: 3000 },
  joshua: { h: 5.4, cap: 2000 },
  ocotillo: { h: 4.6, cap: 600 },
  deadtree: { h: 5.2, cap: 3000 },
  tumbleweed: { h: 0.9, cap: 600 },
  creosote: { h: 1.5, cap: 600 },
  pricklypear: { h: 1.3, cap: 600 },
  // Florida (docs/design/WEB_FLORIDA.md §3.2): the cabbage palm, the flatwoods' slash pine, the swamp's bald cypress,
  // the lagoon's red mangrove, the live oak with its moss. Streamed chunks only (the island never plants them).
  sabal: { h: 9.0, cap: 2400 },
  slashpine: { h: 16.0, cap: 2400 },
  cypress: { h: 13.0, cap: 2400 },
  mangrove: { h: 4.5, cap: 2400 },
  liveoak: { h: 9.0, cap: 1200 },
};
// The species the Phoenix island and P1 laid out before Florida: chunk hashes count only these when a chunk plants none
// of the newer ones (world/chunkgen.js), so every P1 layout keeps its hash.
export const P1_FLORA = ['paloverde', 'mesquite', 'fanpalm', 'datepalm', 'citrus', 'saguaro', 'joshua', 'ocotillo', 'deadtree', 'tumbleweed', 'creosote', 'pricklypear'];
export const FLORA_KINDS = Object.keys(SPECIES);
export const VARIANTS = 3;
export const poolName = (kind) => `fl_${kind}`;

// A variant and a turn from where the plant stands (no RNG stream is touched: placing flora never moves anything else).
export function floraHash(x, z) {
  let h = Math.imul(Math.round(x * 10) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(z * 10) | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const floraVariant = (x, z) => Math.floor(floraHash(x, z) * VARIANTS) % VARIANTS;

// Collapse every vertex not of this instance's variant (the depth material gets the same patch, so shadows agree).
function variantPatch(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float fvar;\n#ifdef USE_INSTANCING\nattribute float aVar;\n#endif')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\ntransformed *= step(abs(fvar - aVar), 0.5);\n#endif');
}

function placeholder() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(1), 3));
  g.setAttribute('fvar', new THREE.BufferAttribute(new Float32Array(3), 1));
  return g;
}

// One variant node (a Mesh or a Group of them) -> a plain indexed geometry: position, normal, colour (vec3 float), fvar.
function bake(node, v) {
  const parts = [];
  node.updateMatrixWorld(true);
  node.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.geometry, n = src.attributes.position.count;
    const g = new THREE.BufferGeometry();
    const f32 = (a, size) => { const out = new Float32Array(n * size); for (let i = 0; i < n; i++) { out[i * size] = a.getX(i); if (size > 1) out[i * size + 1] = a.getY(i); if (size > 2) out[i * size + 2] = a.getZ(i); } return out; };
    g.setAttribute('position', new THREE.BufferAttribute(f32(src.attributes.position, 3), 3));
    if (src.attributes.normal) g.setAttribute('normal', new THREE.BufferAttribute(f32(src.attributes.normal, 3), 3));
    const c = src.attributes.color, base = o.material?.color ?? new THREE.Color(1, 1, 1);
    const col = c ? f32(c, 3) : new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = (c ? col[i * 3] : 1) * base.r; col[i * 3 + 1] = (c ? col[i * 3 + 1] : 1) * base.g; col[i * 3 + 2] = (c ? col[i * 3 + 2] : 1) * base.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('fvar', new THREE.BufferAttribute(new Float32Array(n).fill(v), 1));
    g.setIndex(src.index ? Array.from(src.index.array) : [...Array(n).keys()]);
    g.applyMatrix4(o.matrixWorld);
    if (!src.attributes.normal) g.computeVertexNormals();
    parts.push(g);
  });
  return parts.length === 1 ? parts[0] : mergeGeometries(parts);
}

export class Flora {
  constructor(scene) {
    this.scene = scene;
    const mat = (this.material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
    mat.onBeforeCompile = variantPatch;
    mat.customProgramCacheKey = () => 'flora-variant';
    const depth = (this.depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
    depth.onBeforeCompile = variantPatch;
    depth.customProgramCacheKey = () => 'flora-variant-depth';
    this.pools = {};
    this.pending = {};
    this.loaded = {};
    this.statics = 0; // permanent (island) instances placed
    for (const [kind, S] of Object.entries(SPECIES)) {
      const p = new Pool(poolName(kind), placeholder(), mat, S.cap, { extra: { name: 'aVar', size: 1 } });
      p.mesh.customDepthMaterial = depth;
      p.mesh.name = `flora:${kind}`;
      scene.add(p.mesh);
      this.pools[kind] = p;
      this.pending[kind] = [];
    }
    this.ready = null;
  }

  // Plant one: at (x, z) on the ground (opts.y lifts it), scale x its model's height, turned rot radians about +y.
  // opts.variant (0-2; default from where it stands), opts.tint: a colour multiplier (a THREE.Color, a hex, or a number
  // for brightness). Island placements batch up and go to the GPU on flush() (buildWorld calls it once at the end).
  add(kind, x, z, scale = 1, rot = 0, opts = {}) {
    const list = this.pending[kind];
    if (!list) throw new Error(`flora: no species "${kind}" (have ${FLORA_KINDS.join(', ')})`);
    let r = 1, g = 1, b = 1;
    const t = opts.tint;
    if (typeof t === 'number' && t < 16) { r = g = b = t; } else if (t !== undefined) { const c = t instanceof THREE.Color ? t : new THREE.Color(t); r = c.r; g = c.g; b = c.b; }
    list.push(x, opts.y ?? 0, z, rot, scale, r, g, b, opts.variant ?? floraVariant(x, z));
    return this;
  }

  flush() {
    for (const [kind, list] of Object.entries(this.pending)) {
      const n = list.length / 9;
      if (!n) continue;
      const pool = this.pools[kind], start = pool.alloc(n);
      if (start < 0) { console.warn(`flora: ${kind} pool full (${n} more wanted)`); list.length = 0; continue; }
      const m = new Float32Array(n * 16), c = new Float32Array(n * 3), e = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const [x, y, z, rot, s, r, g, b, v] = list.slice(i * 9, i * 9 + 9), o = i * 16, co = Math.cos(rot), si = Math.sin(rot);
        m[o] = co * s; m[o + 2] = -si * s; m[o + 5] = s; m[o + 8] = si * s; m[o + 10] = co * s;
        m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
        c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b; e[i] = v;
      }
      pool.write(start, n, m, c, e);
      this.statics += n;
      list.length = 0;
    }
  }

  // Fetch every species' GLB and swap its geometry in. Resolves when all are in (failures warn and keep the placeholder).
  load(base = (import.meta.env?.BASE_URL ?? '/') + 'models/flora/') {
    if (this.ready) return this.ready;
    const loader = new GLTFLoader();
    this.ready = Promise.all(FLORA_KINDS.map(async (kind) => {
      try {
        const gltf = await loader.loadAsync(`${base}${kind}.glb`);
        const vars = [];
        for (let v = 0; v < VARIANTS; v++) {
          const node = gltf.scene.getObjectByName(`${kind}_v${v}`);
          if (node) vars.push(bake(node, v));
        }
        if (!vars.length) throw new Error('no variant nodes');
        const geo = mergeGeometries(vars);
        for (const g of vars) g.dispose();
        gltf.scene.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
        const pool = this.pools[kind], old = pool.mesh.geometry;
        geo.setAttribute('aVar', pool.extra);
        geo.computeBoundingSphere();
        pool.mesh.geometry = geo;
        old.dispose();
        this.loaded[kind] = { variants: vars.length, triangles: geo.index.count / 3 };
      } catch (err) {
        console.warn(`flora: ${kind} did not load (${err?.message ?? err}); it stays invisible`);
        this.loaded[kind] = { error: String(err?.message ?? err) };
      }
    }));
    return this.ready;
  }

  view() {
    return Object.fromEntries(FLORA_KINDS.map((k) => [k, { ...this.pools[k].view(), loaded: this.loaded[k] ?? null }]));
  }
}

// How tall a canopy row stands (data/holdout.js, data/ring.js YARD: h = the crown's centre, r its radius, squash its
// flattening) -> the model's scale. The crown's top is about h + 0.7 r squash.
export const crownScale = (kind, h, r, squash) => (h + 0.7 * r * squash) / SPECIES[kind].h;

// The island's plants (world/city.js buildWorld): its living trees, its desert cacti and its dead trees, as city.js
// laid them out (positions, turns and collision are city.js's; this only says what each one looks like).
//   palm      -> a fan palm (Washingtonia) or, one in three, a date palm, its crown where the row's crown was
//   paloverde, citrus, mesquite -> the species, crown top where the row's canopy top was
//   cactus    -> a saguaro when tall (2.3 m+), else a prickly pear or an ocotillo
//   dead tree -> the bleached dead tree at the row's height
export function plantIsland(scene, { liveTrees, cacti, trunks }) {
  const flora = new Flora(scene);
  for (const t of liveTrees) {
    const shade = 0.92 + 0.16 * floraHash(t.z, t.x);
    if (t.kind === 'palm') {
      const date = floraHash(t.x + 7, t.z) < 0.34, kind = date ? 'datepalm' : 'fanpalm';
      flora.add(kind, t.x, t.z, (t.h + (date ? 1.2 : 2.0)) / SPECIES[kind].h, t.rot, { tint: shade });
    } else if (SPECIES[t.kind]) flora.add(t.kind, t.x, t.z, crownScale(t.kind, t.h, t.r, t.squash), t.rot, { tint: shade });
  }
  for (const c of cacti) {
    const k = floraHash(c.x, c.z), rot = k * 6.283;
    if (c.h >= 2.3) flora.add('saguaro', c.x, c.z, 0.75 + (c.h - 2.3) * 0.22, rot);
    else if (k < 0.55) flora.add('pricklypear', c.x, c.z, c.h / SPECIES.pricklypear.h * 0.85, rot);
    else flora.add('ocotillo', c.x, c.z, c.h * 1.6 / SPECIES.ocotillo.h, rot);
  }
  for (const t of trunks) flora.add('deadtree', t.x, t.z, t.h / SPECIES.deadtree.h, floraHash(t.z, t.x) * 6.283);
  flora.flush();
  flora.load();
  return flora;
}
