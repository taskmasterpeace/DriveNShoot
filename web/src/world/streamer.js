import * as THREE from 'three';
import { STREAM, POOLS } from '../data/streaming.js';
import { C, chunkOf, chunkKey, chunkId, islandChunk, inIsland, Hasher, hash32, rngOf } from './geo.js';
import { WorldIndex } from './worldindex.js';
import { layoutChunk, SURF_CAPS } from './chunkgen.js';
import { Pool, SurfacePool } from './pools.js';
import { SignAtlas } from './signs.js';
import { roadAtlasTexture, radialGlow } from './textures.js';
import { roofSurface, wallSurface } from './surfaces.js';
import { poolName } from './flora.js';
import GOLDEN from '../data/golden.json';
import { EXT as WATER_EXT } from './water.js';

// The streamer (docs/design/WEB_STREAMING.md §3.2-3.3, P1 "Streamed Arizona").
//   LAYOUT tier - pure data per 256 m chunk (chunkgen.js), a 5 x 5 ring around the centre chunk plus a prefetch along
//                 the road ahead, an LRU of 64; collision registered the moment a layout exists, nav tiles with it.
//   HOT tier    - the chunks whose content is within 224 m: surfaces uploaded, pool ranges written. A chunk leaves
//                 HOT past 300 m, and only once everything that should be hot is.
//   pump        - resumes layout generators in 0.5 ms slices until 2.5 ms of the frame are spent, at most one surface
//                 upload and two pool writes per frame (sliced mode: real time, bench, perf scenarios). `step` runs in
//                 sync mode: everything needed is built in the frame it is needed, so agent runs stay reproducible.
//   stall guard - a chunk needed NOW (hot, under the player) that has no layout is built on the spot, and the event
//                 streamStall {key, ms, cause} says so. Perf gates count `cross` stalls; teleport/screenshot/load stalls
//                 carry their own cause.
// Also here: the P1 dust wall (a fog fade and a hard stop for vehicles at 45 km), the minimap window (5 x 5 tiles),
// and the ride-height relief of ramps and bridges (stunts.js asks it outside the island).

const R_HOT = 224, R_REL = 300;
const SURF_ORDER = ['ground', 'road', 'rock', 'water'];
const _fog = new THREE.Color(), DUST = new THREE.Color('#a87a4c');
// A weathered boulder: a subdivided icosahedron pushed in and out by a hash of each vertex's position (shared corners
// move together, so no cracks), flattened a little. Scaled and turned per instance, one shape reads as many.
function lumpyRock() {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 991) * 78.233 + Math.round(z * 983) * 37.719) * 43758.5453;
    const k = 0.78 + (h - Math.floor(h)) * 0.38;
    p.setXYZ(i, x * k, y * k * (y > 0 ? 0.85 : 0.6), z * k);
  }
  g.computeVertexNormals();
  return g;
}

// A region's ground texture (Florida): near-neutral grass and earth speckle, so the chunk's vertex colours (its biome
// rows, the beach, the mud) carry the colour and this only carries the grain. Repeats every ~40 m, as the island's sand.
function marshTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), rng = rngOf(hash32(1977, 0x464c));
  g.fillStyle = '#c9c9be'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 9000; k++) { // grass blades and earth specks, wrapped at the edges so the tile is seamless
    const x = rng() * S, y = rng() * S, l = rng.range(1.5, 5), a = rng() * 6.28, v = rng.range(0.72, 1.12), warm = rng() < 0.3;
    g.strokeStyle = warm ? `rgba(${Math.round(190 * v)},${Math.round(176 * v)},${Math.round(150 * v)},0.55)` : `rgba(${Math.round(176 * v)},${Math.round(196 * v)},${Math.round(168 * v)},0.5)`;
    g.lineWidth = rng.range(0.6, 1.4);
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); g.stroke(); }
  }
  for (let k = 0; k < 60; k++) { const x = rng() * S, y = rng() * S, r = rng.range(6, 22); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(120,120,104,${rng.range(0.08, 0.18)})`); gr.addColorStop(1, 'rgba(120,120,104,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.repeat.set(33, 33);
  return t;
}

// Yield to the page without timer throttling (a MessageChannel task, not setTimeout).
const _mc = new MessageChannel(), _q = [];
_mc.port1.onmessage = () => _q.shift()?.();
const yieldPage = () => new Promise((r) => { _q.push(r); _mc.port2.postMessage(0); });

export class Streamer {
  constructor(game) {
    const t0 = performance.now();
    this.g = game;
    this.W = new WorldIndex();
    // P1's faces in its own atlas, exactly as before; a region's (Florida) in a second, smaller one with repeats shared.
    this.W.signAtlas = this.atlas = new SignAtlas(this.W.signs.filter((s) => !s.region));
    this.W.signAtlasFL = this.atlasFL = new SignAtlas(this.W.signs.filter((s) => s.region), { scale: 0.75, dedupe: true });
    this.region = null; // the region the player is in (world/regions.js), null on P1's corridor
    this.layouts = new Map();   // key -> layout (insertion order = LRU order)
    this.byId = new Map();      // the same layouts by integer chunk id (the per-frame paths never build a string key)
    this.hot = new Map();       // key -> layout that is on the GPU
    this.pinned = new Set();    // island chunks: never evicted
    this.centre = null;         // { cx, cz }
    this.wanted = [];           // chunk keys to lay out, nearest first
    this.building = null;       // { key, cx, cz, gen, tiles, mm, t0 }
    this.sync = false;          // set by api._step
    this.mode = 'sliced';
    this.stalls = 0; this.byCause = { cross: 0, promote: 0, teleport: 0, screenshot: 0, load: 0, query: 0, test: 0 };
    this.stallLog = [];
    this.pumpRing = new Float32Array(600); this.pumpI = 0; this.pumpN = 0; this.pumpMax = 0;
    this.built = 0; this.evicted = 0; this.applied = 0; this.released = 0;
    this.freeTiles = []; this.freeMM = [];
    this.frameUploads = 0; this.frameWrites = 0;
    this.buildCosts = [];
    this.makeGPU(game.scene);
    this.mm = { canvas: document.createElement('canvas'), cx: null, cz: null, dirty: true };
    this.mm.canvas.width = this.mm.canvas.height = 640;
    this.wall = { fade: 0 };
    this.islandHash = this.hashIsland();
    this.golden = GOLDEN;
    // Phoenix's chunks are pinned: laid out now, kept forever (their content is only the band outside the island).
    for (let cx = -2; cx <= 1; cx++) for (let cz = -2; cz <= 1; cz++) if (islandChunk(cx, cz)) { this.pinned.add(chunkKey(cx, cz)); this.buildNow(cx, cz, null); }
    // The nav grids read streamed tiles through these.
    for (const k of ['foot', 'car']) { const grid = game.nav[k]; grid.tiles = (cx, cz) => this.layouts.get(chunkKey(cx, cz))?.tiles?.[k] ?? null; grid.dirty = true; }
    // Stunts asks for ramp and bridge heights outside the island.
    if (game.stunts) game.stunts.ext = this.W;
    // The water authority past the island: a region's sea, lagoon, canals and sloughs (world/water.js asks here).
    WATER_EXT.depth = this.W.depthAt;
    this.bootMs = +(performance.now() - t0).toFixed(1);
  }

  // ---- GPU: pools, surface slots, their materials ---------------------------------------------------------------------
  makeGPU(scene) {
    const g = this.g, w = g.world;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const sign = std({ map: this.atlas.texture, roughness: 0.62, metalness: 0.05, emissive: '#ffffff', emissiveMap: this.atlas.texture, emissiveIntensity: 0, side: THREE.DoubleSide });
    sign.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aRect;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = aRect.xy + vMapUv * aRect.zw;\n#endif\n#ifdef USE_EMISSIVEMAP\n  vEmissiveMapUv = aRect.xy + vEmissiveMapUv * aRect.zw;\n#endif');
    };
    this.signMat = sign;
    const signFL = sign.clone(); signFL.map = this.atlasFL.texture; signFL.emissiveMap = this.atlasFL.texture; signFL.onBeforeCompile = sign.onBeforeCompile;
    this.signMatFL = signFL;
    const glowMat = new THREE.MeshBasicMaterial({ map: radialGlow(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    this.glowMat = glowMat;
    const flatPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const P = (name, geo, mat, o) => new Pool(name, geo, mat, POOLS[name], o);
    this.pools = {
      props: P('props', box, std({ roughness: 0.88, metalness: 0.08 })),
      walls: P('walls', box, wallSurface(std({ roughness: 0.92, metalness: 0.04 }))), // world/surfaces.js
      roofs: P('roofs', box, roofSurface(std({ roughness: 0.85, metalness: 0.1 }))), // world/surfaces.js
      floors: P('floors', box, std({ roughness: 0.95 }), { cast: false }), // the Phoenix ring's floors (world/ring.js)
      cacti: P('cacti', new THREE.CylinderGeometry(0.3, 0.38, 1, 7), std({ roughness: 0.9 })),
      trunks: P('trunks', new THREE.CylinderGeometry(0.16, 0.3, 1, 6), std({ roughness: 0.95 })),
      boulders: P('boulders', lumpyRock(), std({ roughness: 0.95, flatShading: true })),
      shrubs: P('shrubs', new THREE.IcosahedronGeometry(1, 1), std({ roughness: 1, flatShading: true })),
      signs: P('signs', new THREE.PlaneGeometry(1, 1), sign, { extra: { name: 'aRect', size: 4 } }),
      rails: P('rails', box, std({ roughness: 0.45, metalness: 0.55 }), { cast: false }),
      barrels: P('barrels', new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), std({ roughness: 0.7, metalness: 0.3 })),
      glows: P('glows', flatPlane, glowMat, { cast: false, receive: false }),
      signsfl: P('signsfl', new THREE.PlaneGeometry(1, 1), signFL, { extra: { name: 'aRect', size: 4 } }),
    };
    // Trees and desert plants (world/flora.js): one pool per species, shared with the island (it holds a permanent range).
    for (const [k, p] of Object.entries(w.flora.pools)) this.pools[poolName(k)] = p;
    this.pools.glows.mesh.renderOrder = 2;
    for (const p of Object.values(this.pools)) scene.add(p.mesh);
    // Surfaces share the island's ground and road look (sky.js tints them every frame: synced in update()).
    this.groundMat = w.groundMat.clone(); this.groundMat.vertexColors = true;
    this.roadMat = new THREE.MeshStandardMaterial({ map: roadAtlasTexture(), roughness: 0.9 });
    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, flatShading: true, side: THREE.DoubleSide });
    // A region's ground (Florida): a neutral grass-and-earth texture its vertex colours paint (world/regions.js rows);
    // its water sheets share the island's water material (ripples, glints, world-space UVs).
    this.groundMatFL = new THREE.MeshStandardMaterial({ map: marshTexture(), roughness: 0.94, metalness: 0, vertexColors: true });
    // (Its own copy: rougher, softer ripples than the island's lake: still swamp water, a wide lagoon. The normal map is
    // the island's, so the ripples run at the same pace.)
    this.waterMat = g.water?.mat ? g.water.mat.clone() : new THREE.MeshStandardMaterial({ color: '#4f7f7a', roughness: 0.2, vertexColors: true });
    this.waterMat.roughness = 0.5; this.waterMat.normalScale?.set(0.18, 0.18);
    this.surfaces = new SurfacePool(scene, STREAM.hotMax, SURF_CAPS, { ground: this.groundMat, road: this.roadMat, rock: this.rockMat, water: this.waterMat });
    for (const s of this.surfaces.slots) s.layers.water.mesh.renderOrder = 1;
  }

  // Compile every streamed material now, once, so the first chunk that goes hot in a session doesn't hitch the frame it
  // shows up in (a pool or a surface layer seen for the first time would compile its shader right then).
  warmup() {
    const objs = [...Object.values(this.pools).map((p) => p.mesh), ...this.surfaces.slots.flatMap((s) => Object.values(s.layers).map((L) => L.mesh))];
    const was = objs.map((o) => o.visible);
    for (const o of objs) o.visible = true;
    try { this.g.renderer.compile(this.g.scene, this.g.camera); } catch { /* a headless context without the extension: fine, it compiles on first use */ }
    objs.forEach((o, i) => { o.visible = was[i]; });
    // And the big textures go up now: the sign atlas is ~19 MB with its mipmaps, a 60 ms hitch the first time a sign
    // came into view at speed.
    for (const t of [this.atlas.texture, this.roadMat.map, this.atlasFL.texture, this.groundMatFL.map]) try { this.g.renderer.initTexture(t); } catch { /* uploads on first use instead */ }
  }

  // ---- the golden hash of the island (§3.4): its static boxes and buildings, as city.js / terrain / stunts / bases made them
  hashIsland() {
    const g = this.g, H = new Hasher();
    let max = 0;
    for (const b of g.statics.boxes) { if (b.tag.startsWith('storey') || b.storeyLv) continue; // the floors above: world/storeys.js keeps its own hash
      H.num(b.minX).num(b.minZ).num(b.maxX).num(b.maxZ).num(b.height).str(b.tag); max = Math.max(max, Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minZ), Math.abs(b.maxZ)); }
    for (const b of g.world.buildings) H.num(b.minX).num(b.minZ).num(b.maxX).num(b.maxZ).int(b.enterable ? 1 : 0).int(b.doors?.length ?? 0);
    this.islandExtent = +max.toFixed(2);
    return H.hex();
  }

  // ---- layouts ----------------------------------------------------------------------------------------------------------
  takeTiles() { return this.freeTiles.pop() ?? { foot: { a: new Uint8Array(C * C), any: false }, car: { a: new Uint8Array((C / 2) * (C / 2)), any: false } }; }
  takeMM() { const c = this.freeMM.pop(); if (c) return c; const m = document.createElement('canvas'); m.width = m.height = 128; return m; }

  startBuild(cx, cz) {
    const key = chunkKey(cx, cz), tiles = this.takeTiles(), mm = this.takeMM();
    this.building = { key, cx, cz, gen: layoutChunk(this.W, cx, cz, tiles, mm), tiles, mm, t0: performance.now() };
  }
  finishBuild(L) {
    const b = this.building;
    this.building = null;
    this.layouts.set(b.key, L); this.byId.set(chunkId(L.cx, L.cz), L);
    this.built++;
    this.buildCosts.push(L.workMs); if (this.buildCosts.length > 200) this.buildCosts.shift();
    this.g.statics.registerChunk(L.cx, L.cz, L.boxes);
    for (const k of ['foot', 'car']) this.g.nav[k].invalidate(L.cx, L.cz);
    // A region chunk's water grid answers the depth queries while the layout lives (world/regions.js makeDepthAt).
    if (L.region && L.water) this.W.regions[L.region]?.cache.set(chunkId(L.cx, L.cz), L.water);
    this.mm.dirty = true;
    return L;
  }
  // Build one chunk to completion right now (sync mode, a stall, or boot). Returns the layout.
  buildNow(cx, cz, cause) {
    const key = chunkKey(cx, cz);
    const have = this.layouts.get(key);
    if (have) { this.touch(key, have); return have; }
    const t0 = performance.now();
    if (!this.building || this.building.key !== key) {
      if (this.building) this.abandonBuild(); // a half-built chunk elsewhere waits: restart it later
      this.startBuild(cx, cz);
    }
    let r;
    do r = this.building.gen.next(); while (!r.done);
    const L = this.finishBuild(r.value);
    if (cause) this.stall(key, performance.now() - t0, cause);
    return L;
  }
  abandonBuild() { const b = this.building; this.building = null; if (b) { this.freeTiles.push(b.tiles); this.freeMM.push(b.mm); } }
  touch(key, L) { this.layouts.delete(key); this.layouts.set(key, L); }

  stall(key, ms, cause) {
    this.stalls++;
    this.byCause[cause] = (this.byCause[cause] ?? 0) + 1;
    const e = { key, ms: +ms.toFixed(2), cause };
    this.stallLog.push(e); if (this.stallLog.length > 40) this.stallLog.shift();
    this.g.emit('streamStall', e);
  }

  evict(key) {
    const L = this.layouts.get(key);
    if (!L) return;
    if (this.hot.has(key)) this.release(L);
    this.g.statics.unregisterChunk(L.cx, L.cz);
    for (const k of ['foot', 'car']) this.g.nav[k].invalidate(L.cx, L.cz);
    this.freeTiles.push(L.tiles); this.freeMM.push(L.mm);
    L.tiles = null; L.mm = null;
    if (L.region) this.W.regions[L.region]?.cache.delete(chunkId(L.cx, L.cz));
    this.layouts.delete(key); this.byId.delete(chunkId(L.cx, L.cz));
    this.evicted++;
    this.mm.dirty = true;
  }

  // ---- hot: on the GPU --------------------------------------------------------------------------------------------------
  // Apply a chunk in steps (3 surface uploads, then each pool's range): sliced mode spends at most the per-frame caps.
  applyStep(L, sync) {
    if (!L.hot) { L.hot = { slot: null, step: 0, ranges: {}, missing: [] }; this.ringOn(L); }
    const h = L.hot;
    const ox = L.cx * C, oz = L.cz * C;
    if (!h.slot) { h.slot = this.surfaces.acquire(); if (!h.slot) return false; h.slot.chunk = L.key; h.slot.layers.ground.mesh.material = L.region ? this.groundMatFL : this.groundMat; }
    const order = SURF_ORDER;
    while (h.step < order.length) {
      if (!sync && this.frameUploads >= STREAM.surfUploads) return false;
      this.surfaces.upload(h.slot, order[h.step], L.surf[order[h.step]], ox, oz);
      if (L.surf[order[h.step]]) this.frameUploads++;
      h.step++;
    }
    const names = Object.keys(L.inst);
    while (h.step < order.length + names.length) {
      const name = names[h.step - order.length], r = L.inst[name], pool = this.pools[name];
      if (!sync && this.frameWrites >= STREAM.poolWrites) return false;
      const start = pool.alloc(r.n);
      if (start < 0) { h.missing.push(name); this.g.emit('poolFull', { pool: name, key: L.key }); }
      else { pool.write(start, r.n, r.m, r.c, r.e); h.ranges[name] = [start, r.n]; }
      this.frameWrites++;
      h.step++;
    }
    if (!h.done) { h.done = true; this.applied++; }
    return true;
  }
  release(L) {
    const h = L.hot;
    if (!h) return;
    if (h.slot) this.surfaces.release(h.slot);
    for (const [name, [start, n]] of Object.entries(h.ranges)) this.pools[name].release(start, n);
    this.ringOff(L);
    L.hot = null;
    this.hot.delete(L.key);
    this.released++;
    // A pool that was full may have room now.
    for (const o of this.hot.values()) if (o.hot?.missing.length) {
      const miss = o.hot.missing; o.hot.missing = [];
      for (const name of miss) { const r = o.inst[name], start = this.pools[name].alloc(r.n); if (start < 0) o.hot.missing.push(name); else { this.pools[name].write(start, r.n, r.m, r.c, r.e); o.hot.ranges[name] = [start, r.n]; } }
    }
  }

  // ---- the Phoenix ring's live parts (world/ring.js) -------------------------------------------------------------------
  // A chunk going hot registers its buildings' containers (crates, shelves, racks: rolled the first time anyone opens
  // one, ids from their positions) and beds; going cold takes them back out. What was taken from a box is kept by the
  // inventory (ringKept), so the same box comes back with the same contents. Only the hot chunks' boxes are ever
  // registered: the ones you are nowhere near do not pile up.
  ringOn(L) {
    const R = L.ring;
    if (!R) return;
    this.g.inventory?.registerRing(R.boxes);
    const beds = this.g.world?.spawns?.beds;
    if (beds) for (const b of R.beds) beds.push({ ...b, ring: L.key });
    this.g.residents?.chunkOn(L); // R2: the households' shelves are theirs (systems/residents.js)
  }
  ringOff(L) {
    const R = L.ring;
    if (!R) return;
    this.g.residents?.chunkOff(L); // R2: its people go back onto their records (their bodies' boxes first)
    this.g.inventory?.unregisterRing(R.boxes);
    const beds = this.g.world?.spawns?.beds;
    if (beds && R.beds.length) for (let i = beds.length - 1; i >= 0; i--) if (beds[i].ring === L.key) beds.splice(i, 1);
  }
  // Hide or show one ring building's roof (its instances in the owner chunk's range of the roofs pool).
  setRingRoof(id, owner, visible) {
    const L = this.layouts.get(owner), idx = L?.ring?.roofs[id], rg = L?.hot?.ranges?.roofs;
    if (!idx || !rg) return false;
    const pool = this.pools.roofs, arr = pool.mesh.instanceMatrix.array, src = L.inst.roofs.m, at = rg[0] + idx[0];
    if (visible) arr.set(src.subarray(idx[0] * 16, (idx[0] + idx[1]) * 16), at * 16);
    else arr.fill(0, at * 16, (at + idx[1]) * 16);
    pool.mesh.instanceMatrix.addUpdateRange(at * 16, idx[1] * 16);
    pool.mesh.instanceMatrix.needsUpdate = true;
    return true;
  }
  // The ring building you are standing in (any chunk's), as a record main.updateInterior and the deed witnesses read:
  // bounds, enterable, a roof that hides through setRoof. The same object while you stay in the same building.
  ringBuildingAt(x, z) {
    const L = this.byId.get(chunkId(chunkOf(x), chunkOf(z)));
    const list = L?.ring?.bld;
    if (!list) return null;
    for (const b of list) {
      if (!(x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)) continue;
      let rec = this.ringRec;
      if (rec?.id !== b.id) {
        const S = this;
        rec = this.ringRec = { id: b.id, ring: true, enterable: true, roofIdx: b.roof ? [0] : [], doors: [], minX: b.x0, maxX: b.x1, minZ: b.z0, maxZ: b.z1, district: b.zone, kind: b.kind, ruined: b.ruined, owner: b.owner, shopName: null,
          setRoof(v) { S.setRingRoof(b.id, b.owner, v); this.roofHidden = !v; } };
      }
      return rec;
    }
    return null;
  }

  // Distance from (x, z) to a chunk's content (an island chunk's content is only its band outside the island).
  contentDist(L, x, z) {
    const b = L.bounds;
    if (!b) return Infinity;
    const dx = x < b.x0 ? b.x0 - x : x > b.x1 ? x - b.x1 : 0, dz = z < b.z0 ? b.z0 - z : z > b.z1 ? z - b.z1 : 0;
    const d = Math.hypot(dx, dz);
    // An island chunk's content is an L-shaped band outside the island, whose box is the whole chunk: from inside
    // Phoenix it is at least as far as the island's nearest edge.
    if (!L.isl) return d;
    const I = STREAM.island, ex = Math.min(I - Math.abs(x), I - Math.abs(z));
    return ex > 0 ? Math.max(d, ex) : d;
  }

  // ---- per frame (no allocation on this path: scratch objects, integer keys, one comparator) -----------------------------
  focus() {
    const p = this.g.player, v = p.inVehicle, f = (this._f ??= { x: 0, z: 0, vx: 0, vz: 0 });
    if (v) { f.x = v.x; f.z = v.z; f.vx = v.vx; f.vz = v.vz; } else { f.x = p.x; f.z = p.z; f.vx = 0; f.vz = 0; }
    return f;
  }

  update(dt) {
    const t0 = performance.now();
    const sync = this.sync;
    this.mode = sync ? 'sync' : 'sliced';
    this.frameUploads = 0; this.frameWrites = 0;
    const f = this.focus();
    if (!Number.isFinite(f.x) || !Number.isFinite(f.z)) return;
    // The centre chunk, with hysteresis: it moves only 32 m past an edge.
    const pcx = chunkOf(f.x), pcz = chunkOf(f.z);
    let changed = false;
    if (!this.centre) { this.centre = { cx: pcx, cz: pcz }; changed = true; }
    else {
      const c = this.centre, H = STREAM.hys;
      if (f.x < c.cx * C - H || f.x >= (c.cx + 1) * C + H || f.z < c.cz * C - H || f.z >= (c.cz + 1) * C + H) { c.cx = pcx; c.cz = pcz; changed = true; }
    }
    if (changed || !this.wantT || (this.wantT -= dt) <= 0) { this.plan(f); this.wantT = 0.25; }
    // The pump: layouts for the wanted list (nearest first).
    this.pump(sync, t0);
    // Hot: what should be on the GPU now. A needed chunk with no layout is a stall.
    this.updateHot(f, sync);
    this.lru();
    this.dustWall(f);
    const ms = performance.now() - t0;
    this.pumpRing[this.pumpI] = ms; this.pumpI = (this.pumpI + 1) % this.pumpRing.length; this.pumpN = Math.min(this.pumpRing.length, this.pumpN + 1);
    if (ms > this.pumpMax) this.pumpMax = ms;
  }

  // What to lay out: the ring around the centre, then the road ahead (max(600 m, 12 s of speed)).
  // (Four times a second, or when the centre moves: the only place here that builds keys and lists.)
  plan(f) {
    const c = this.centre, want = new Map(), r = STREAM.rL;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const cx = c.cx + dx, cz = c.cz + dz;
      want.set(chunkKey(cx, cz), { cx, cz, key: chunkKey(cx, cz), d: Math.hypot((cx + 0.5) * C - f.x, (cz + 0.5) * C - f.z) });
    }
    const sp = Math.hypot(f.vx, f.vz);
    if (sp > 2) {
      const reach = Math.max(STREAM.prefetchMin, STREAM.prefetchS * sp), ux = f.vx / sp, uz = f.vz / sp;
      for (let s = 128; s <= reach; s += 96) {
        const x = f.x + ux * s, z = f.z + uz * s;
        for (const [ox, oz] of [[0, 0], [-uz * 128, ux * 128], [uz * 128, -ux * 128]]) {
          const cx = chunkOf(x + ox), cz = chunkOf(z + oz), k = chunkKey(cx, cz);
          if (!want.has(k)) want.set(k, { cx, cz, key: k, d: s * 0.8 + 140 });
        }
      }
    }
    this.wanted = [...want.values()].filter((w) => this.W.inWorld(w.cx * C + C / 2, w.cz * C + C / 2, 1200)).sort((a, b) => a.d - b.d);
    // Collision for the ring: a cached layout coming back into it re-takes its slot.
    const rr = STREAM.rL + 1;
    for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
      const L = this.byId.get(chunkId(c.cx + dx, c.cz + dz));
      if (L && !this.g.statics.hasChunk(L.cx, L.cz)) this.g.statics.registerChunk(L.cx, L.cz, L.boxes);
    }
  }

  pump(sync, t0) {
    const budget = sync ? Infinity : STREAM.pumpMs, slice = STREAM.sliceMs;
    while (performance.now() - t0 < budget) {
      if (!this.building) {
        let next = null;
        for (let i = 0; i < this.wanted.length; i++) if (!this.layouts.has(this.wanted[i].key)) { next = this.wanted[i]; break; }
        if (!next) break;
        this.startBuild(next.cx, next.cz);
      }
      const s0 = performance.now();
      let r;
      do r = this.building.gen.next(); while (!r.done && (sync || performance.now() - s0 < slice));
      if (r.done) this.finishBuild(r.value);
      if (!sync && performance.now() - t0 >= budget) break;
    }
  }

  updateHot(f, sync) {
    const c = this.centre;
    const target = (this._target ??= []);
    target.length = 0;
    this._fx = f.x; this._fz = f.z;
    for (let dx = -STREAM.rH; dx <= STREAM.rH; dx++) for (let dz = -STREAM.rH; dz <= STREAM.rH; dz++) {
      const cx = c.cx + dx, cz = c.cz + dz;
      let L = this.byId.get(chunkId(cx, cz));
      // Under the player or within the hot radius and not laid out yet: build it now (a stall).
      if (!L) {
        const near = Math.max(Math.abs(f.x - (cx + 0.5) * C), Math.abs(f.z - (cz + 0.5) * C)) <= C / 2 + R_HOT;
        if (!near) continue;
        if (!this.W.inWorld(cx * C + C / 2, cz * C + C / 2, 1200)) continue;
        L = this.buildNow(cx, cz, sync ? null : 'cross');
      }
      if (this.contentDist(L, f.x, f.z) <= R_HOT) target.push(L);
    }
    // Nearest first; apply as the per-frame caps allow (sync: everything now).
    target.sort((this._byNear ??= (a, b) => this.contentDist(a, this._fx, this._fz) - this.contentDist(b, this._fx, this._fz)));
    let allHot = true;
    for (const L of target) {
      if (L.hot?.done) continue;
      if (!this.hot.has(L.key) && this.hot.size >= STREAM.hotMax) { this.dropFarthestHot(f, target); if (this.hot.size >= STREAM.hotMax) { allHot = false; continue; } }
      this.hot.set(L.key, L);
      if (!this.applyStep(L, sync)) allHot = false;
      // The ground under the player must never be missing: finish it now if it is the chunk you stand in.
      if (!L.hot?.done && !sync && Math.abs(f.x - (L.cx + 0.5) * C) <= C / 2 && Math.abs(f.z - (L.cz + 0.5) * C) <= C / 2) {
        const t0 = performance.now(); this.applyStep(L, true); this.stall(L.key, performance.now() - t0, 'cross');
      }
    }
    // Release what has fallen behind, once everything that should be hot is.
    if (allHot || sync) for (const L of this.hot.values()) if (!target.includes(L) && this.contentDist(L, f.x, f.z) > R_REL) this.release(L); // deleting while iterating a Map is safe
  }
  dropFarthestHot(f, keep) {
    let worst = null, wd = -1;
    for (const L of this.hot.values()) { if (keep.includes(L)) continue; const d = this.contentDist(L, f.x, f.z); if (d > wd) { wd = d; worst = L; } }
    if (worst) this.release(worst);
  }

  lru() {
    if (this.layouts.size <= STREAM.lru) return;
    const c = this.centre, r = STREAM.rL + 1;
    for (const [key, L] of this.layouts) {
      if (this.layouts.size <= STREAM.lru) break;
      if (this.pinned.has(key) || this.hot.has(key) || (Math.abs(L.cx - c.cx) <= r && Math.abs(L.cz - c.cz) <= r)) continue;
      this.evict(key);
    }
  }

  // ---- the stall guard's front door: anything that needs a place NOW --------------------------------------------------
  // teleport, screenshot, load: the destination's hot ring is built first, then the old ring goes through the LRU.
  ensureHot(x, z, cause = 'teleport') {
    if (!Number.isFinite(x) || !Number.isFinite(z)) { this.g.emit('error', { msg: `ensureHot(${x}, ${z}): not a place` }); return { ok: false }; }
    const t0 = performance.now(), before = this.built;
    this.centre = { cx: chunkOf(x), cz: chunkOf(z) };
    const f = { x, z, vx: 0, vz: 0 };
    this.plan(f);
    const wasSync = this.sync;
    this.sync = true;
    // Lay out the hot neighbourhood synchronously (counted once, as one stall of this cause), then apply it.
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const cx = this.centre.cx + dx, cz = this.centre.cz + dz;
      if (!this.W.inWorld(cx * C + C / 2, cz * C + C / 2, 1200)) continue;
      if (!this.layouts.has(chunkKey(cx, cz))) this.buildNow(cx, cz, null);
    }
    this.updateHot(f, true);
    for (const k of ['foot', 'car']) this.g.nav[k].dirty = true;
    this.sync = wasSync;
    const ms = performance.now() - t0;
    if (this.built > before) this.stall(chunkKey(this.centre.cx, this.centre.cz), ms, cause);
    return { ok: true, built: this.built - before, ms: +ms.toFixed(1) };
  }

  // An agent's route query (path, moveTo, drive) over ground that is not laid out yet: lay out every chunk between the two
  // ends (plus a margin), so the nav window sees real ground there instead of unknown, blocked chunks. One window at
  // most: ends farther apart are the road graph's job (P3). Each chunk built is a `query` stall (expected, not a gate).
  ensureSpan(ax, az, bx, bz, margin = 64) {
    if (![ax, az, bx, bz].every(Number.isFinite)) return false;
    const x0 = chunkOf(Math.min(ax, bx) - margin), x1 = chunkOf(Math.max(ax, bx) + margin);
    const z0 = chunkOf(Math.min(az, bz) - margin), z1 = chunkOf(Math.max(az, bz) + margin);
    if (x1 - x0 > 3 || z1 - z0 > 3) return false;
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      if (this.layouts.has(chunkKey(cx, cz)) || !this.W.inWorld(cx * C + C / 2, cz * C + C / 2, 1200)) continue;
      this.buildNow(cx, cz, 'query');
    }
    return true;
  }

  // ---- real terrain (docs/design/WEB_TERRAIN.md), behind a flag: OFF by default -------------------------------------------
  // on: load the baked asset (once), survey the road and the pads onto it, and lay every chunk out again on the land.
  // off: back to the flat world, every chunk laid out again exactly as before. The island never changes (it stands on
  // Phoenix's pad at 0), so its golden hash holds either way.
  async setTerrain(on) {
    const W = this.W;
    if (!!on === !!W.terrain) return { on: !!W.terrain, changed: false };
    let T = null;
    if (on) {
      const { loadTerrain, RealTerrain } = await import('./realterrain.js');
      this.terrainAsset ??= await loadTerrain(new URL('../data/terrain/i10.bin', import.meta.url).href);
      T = new RealTerrain(this.terrainAsset, W);
    }
    W.terrain = T;
    W.mesaCache?.clear(); // mesas read the biome, which reads the landcover now
    if (this.g.fx) this.g.fx.ground = T ? (x, z) => T.at(x, z) : null; // blood, skids, smoke, tracers on the land
    // Lay out every chunk again: drop them all (the pinned island chunks are built again at once), then let the
    // streamer plan the ring round the player as on any arrival.
    if (this.building) this.abandonBuild();
    for (const key of [...this.layouts.keys()]) this.evict(key);
    for (const key of this.pinned) { const [cx, cz] = key.split(',').map(Number); this.buildNow(cx, cz, null); }
    const f = this.focus();
    this.centre = null;
    const r = this.ensureHot(f.x, f.z, 'load');
    // Whatever stands on the ground goes onto the new ground (cars drop or rise onto it in stunts.step; people here).
    for (const ch of this.g.chars) if (!ch.inVehicle && !ch.storey) ch.gy = this.g.stunts?.heightAt(ch.x, ch.z, ch.gy ?? 0) ?? 0;
    this.g.emit('terrain', { on: !!T });
    return { on: !!T, changed: true, ms: r.ms, ...(T ? T.report() : {}) };
  }

  ensureLayout(x, z, cause = 'test') {
    const cx = chunkOf(x), cz = chunkOf(z);
    if (this.layouts.has(chunkKey(cx, cz))) return this.layouts.get(chunkKey(cx, cz));
    return this.buildNow(cx, cz, cause);
  }

  // ---- the P1 edge of the world: fog thickens into a dust wall, vehicles cannot pass it ----------------------------------
  dustWall(f) {
    // In a region (Florida): its own edge (the squall line), the same rule on its box. Else P1's dust wall.
    const RG = this.W.regionOf(f.x, f.z, 4000);
    if (RG !== this.region) { this.region = RG; this.g.emit('regionChanged', { region: RG?.id ?? 'arizona' }); }
    if (RG) return this.regionWall(RG, f);
    const S = STREAM, d = Math.hypot(f.x, f.z);
    this.wall.fade = Math.max(0, Math.min(1, (d - (S.dustWall - S.dustFade)) / S.dustFade));
    const lim = S.dustWall;
    for (const v of this.g.vehicles) {
      const r = Math.hypot(v.x, v.z);
      if (r <= lim) continue;
      const nx = v.x / r, nz = v.z / r, vn = v.vx * nx + v.vz * nz;
      v.x = nx * lim; v.z = nz * lim;
      if (vn > 0) { v.vx -= nx * vn * 1.6; v.vz -= nz * vn * 1.6; }
      if (v.driver === this.g.player && !this.wall.warned) { this.wall.warned = true; this.g.hud.toast('THE DUST WALL: NOTHING GETS THROUGH. TURN BACK.', 'warn'); }
    }
    for (const ch of this.g.chars) {
      if (ch.inVehicle) continue;
      const r = Math.hypot(ch.x, ch.z);
      if (r > lim) { ch.x *= lim / r; ch.z *= lim / r; }
    }
    if (d < lim - S.dustFade) this.wall.warned = false;
  }
  // A region's edge: a box, faded over wall.fade metres; past it nothing gets through (vehicles held, people too).
  regionWall(RG, f) {
    this.wall.fade = RG.edgeFade(f.x, f.z);
    const clampIn = (o) => { const x = Math.max(RG.x0, Math.min(RG.x1, o.x)), z = Math.max(RG.z0, Math.min(RG.z1, o.z)); const out = x !== o.x || z !== o.z; o.x = x; o.z = z; return out; };
    for (const v of this.g.vehicles) {
      if (!RG.inBox(v.x, v.z, 3000) || RG.inBox(v.x, v.z)) continue;
      const nx = v.x < RG.x0 ? 1 : v.x > RG.x1 ? -1 : 0, nz = v.z < RG.z0 ? 1 : v.z > RG.z1 ? -1 : 0;
      clampIn(v);
      if (nx && v.vx * nx < 0) v.vx *= -0.4; if (nz && v.vz * nz < 0) v.vz *= -0.4;
      if (v.driver === this.g.player && !this.wall.warned) { this.wall.warned = true; this.g.hud.toast(RG.wall.toast, 'warn'); }
    }
    for (const ch of this.g.chars) if (!ch.inVehicle && RG.inBox(ch.x, ch.z, 3000) && !RG.inBox(ch.x, ch.z)) clampIn(ch);
    if (this.wall.fade < 0.5) this.wall.warned = false;
  }

  // After the sky has set this frame's fog: the wall thickens it toward a dust storm's brown (and the surfaces follow
  // the sky's wet/dry tint like the island's ground and roads).
  postSky() {
    const w = this.g.world, sky = this.g.sky;
    this.groundMat.color.copy(w.groundMat.color); this.groundMat.roughness = w.groundMat.roughness;
    this.groundMatFL.color.copy(w.groundMat.color); this.groundMatFL.roughness = Math.min(0.94, w.groundMat.roughness + 0.02);
    this.roadMat.color.copy(w.roadMat.color); this.roadMat.roughness = w.roadMat.roughness; this.roadMat.metalness = w.roadMat.metalness;
    this.glowMat.opacity = 0.03 + sky.night * 0.8;
    this.signMat.emissiveIntensity = sky.night * 0.32; // retroreflective faces catch the headlights
    this.signMatFL.emissiveIntensity = sky.night * 0.32;
    const k = this.wall.fade;
    if (k > 0) {
      sky.fog.density += k * k * 0.03;
      _fog.copy(this.region ? (this._wallCol ??= new THREE.Color(this.region.wall.color)) : DUST).multiplyScalar(1 - sky.night * 0.7);
      sky.fog.color.lerp(_fog, k * 0.85);
      this.g.scene.background.copy(sky.fog.color);
    }
  }

  // ---- the minimap window: 5 x 5 tiles (1,280 m at 2 m per pixel) around the centre chunk ---------------------------
  minimap(islandTinted) {
    const M = this.mm, c = this.centre;
    if (!c) return null;
    if (M.cx !== c.cx || M.cz !== c.cz || M.dirty) {
      const g = M.canvas.getContext('2d');
      g.fillStyle = '#0c1209'; g.fillRect(0, 0, 640, 640);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const L = this.layouts.get(chunkKey(c.cx + dx, c.cz + dz));
        if (L?.mm) g.drawImage(L.mm, (dx + 2) * 128, (dz + 2) * 128);
      }
      // Phoenix from the island's own (tinted) map, where the window covers it.
      if (islandTinted) {
        const HALF = 450, k = islandTinted.width / (HALF * 2), wx0 = (c.cx - 2) * C, wz0 = (c.cz - 2) * C;
        const x0 = Math.max(-HALF, wx0), x1 = Math.min(HALF, wx0 + 5 * C), z0 = Math.max(-HALF, wz0), z1 = Math.min(HALF, wz0 + 5 * C);
        if (x1 > x0 && z1 > z0) g.drawImage(islandTinted, (x0 + HALF) * k, (z0 + HALF) * k, (x1 - x0) * k, (z1 - z0) * k, (x0 - wx0) / 2, (z0 - wz0) / 2, (x1 - x0) / 2, (z1 - z0) / 2);
      }
      M.cx = c.cx; M.cz = c.cz; M.dirty = false;
      M.x0 = (c.cx - 2) * C; M.z0 = (c.cz - 2) * C;
    }
    return M;
  }

  // ---- a lane-keeping driver for tests and scenarios (pure pursuit along I-10) ------------------------------------------
  // dir +1 east / -1 west; lane 0 inner, 1 outer. Returns {throttle, steer} for game.driveOverride and how far off the
  // lane centre the car is. Full throttle unless `speed` asks for less.
  // cor: any corridor (default I-10; a region's: W.corridors, docs/design/WEB_FLORIDA.md §3.1).
  lanePoint(s, dir, lane = 0, cor = null) {
    const W = cor ?? this.W, L = cor ? cor.L : this.W.cl.L, f = W.at(Math.max(0, Math.min(L, s))), sec = W.section(s), lw = (sec.lane2 - sec.lane0) / 2;
    const u = dir * (sec.lane0 + lw * (lane + 0.5));
    return { x: f.x + f.nx * u, z: f.z + f.nz * u };
  }
  autopilot(v, dir = 1, lane = 0, speed = Infinity, cor = null) {
    const W = cor ?? this.W, pr = W.project(v.x, v.z, 600), sp = Math.hypot(v.vx, v.vz);
    const q = this.lanePoint(pr.s + dir * Math.max(22, sp * 0.95), dir, lane, cor), here = this.lanePoint(pr.s, dir, lane, cor);
    const want = Math.atan2(q.x - v.x, q.z - v.z);
    const diff = Math.atan2(Math.sin(want - v.h), Math.cos(want - v.h));
    const throttle = sp > speed + 1 ? -0.4 : sp < speed - 1 ? 1 : 0.2;
    return { throttle, steer: Math.max(-1, Math.min(1, diff * 2.2)), off: Math.hypot(v.x - here.x, v.z - here.z), s: pr.s, d: pr.d };
  }

  // Run frames the way the real-time loop does (sliced streaming, a render every `renderEvery` frames with GPU-synced
  // timings, as `bench` measures), at a fixed 60 Hz step, with the rAF loop held off so this is the only clock running.
  // each(i) runs before frame i (return false to stop). Yields to the page every ~30 ms so the agent bridge stays alive.
  async runFrames(seconds, each, { renderEvery = 1, sync = false } = {}) {
    const g = this.g, r = g.renderer, gl = r.getContext(), px = new Uint8Array(4), n = Math.round(seconds * 60);
    const ms = new Float32Array(Math.ceil(n / renderEvery) + 1);
    let calls = 0, tris = 0, k = 0, slice = performance.now(), i = 0;
    const was = { paused: g.paused, hold: g.holdLoop, sync: this.sync };
    g.paused = false; g.holdLoop = true; this.sync = sync;
    try {
      for (; i < n; i++) {
        if (each && each(i) === false) break;
        const t0 = performance.now();
        try { g.frame(1 / 60); } catch (e) { g.reportError(e); }
        if (i % renderEvery === 0) {
          g.render(1 / 60);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // force the GPU to finish, so the time is honest
          calls = Math.max(calls, r.info.render.calls); tris = Math.max(tris, r.info.render.triangles);
          ms[k++] = performance.now() - t0;
        }
        if (performance.now() - slice > 30) { await yieldPage(); slice = performance.now(); }
      }
    } finally { g.paused = was.paused; g.holdLoop = was.hold; this.sync = was.sync; }
    const a = Array.from(ms.subarray(0, k)).sort((x, y) => x - y);
    const st = (q) => +(a[Math.min(a.length - 1, Math.floor(a.length * q))] ?? 0).toFixed(2);
    return { frames: i, seconds: +(i / 60).toFixed(2), maxDrawCalls: calls, maxTriangles: tris, frameMs: { avg: +(a.reduce((s, v) => s + v, 0) / Math.max(1, a.length)).toFixed(2), p95: st(0.95), max: st(1) } };
  }

  // ---- reports ----------------------------------------------------------------------------------------------------------
  pumpStats() {
    const n = this.pumpN, a = Array.from(this.pumpRing.subarray(0, n)).sort((x, y) => x - y);
    return { p95: n ? +a[Math.floor(n * 0.95)].toFixed(2) : 0, max: +this.pumpMax.toFixed(2), avg: n ? +(a.reduce((s, v) => s + v, 0) / n).toFixed(3) : 0 };
  }
  view() {
    const pools = Object.fromEntries(Object.entries(this.pools).map(([k, p]) => [k, { used: p.used, cap: p.cap }]));
    const costs = [...this.buildCosts].sort((a, b) => a - b);
    return {
      k: STREAM.K, seed: STREAM.seed, dataHash: this.W.dataHash, ro: { x: 0, z: 0 },
      islandHash: this.islandHash, golden: this.golden.islandHash, islandExtent: this.islandExtent,
      layout: { resident: this.layouts.size, cap: STREAM.lru, pinned: this.pinned.size, built: this.built, evicted: this.evicted, building: this.building?.key ?? null,
        buildMs: costs.length ? { p50: +costs[Math.floor(costs.length / 2)].toFixed(2), p95: +costs[Math.floor(costs.length * 0.95)].toFixed(2), max: +costs[costs.length - 1].toFixed(2) } : null },
      hot: { count: this.hot.size, max: STREAM.hotMax, applied: this.applied, released: this.released, surfaces: this.surfaces.view() },
      centre: this.centre ? [this.centre.cx, this.centre.cz] : null,
      pools,
      stream: { stalls: this.stalls, byCause: { ...this.byCause }, recent: this.stallLog.slice(-8), pumpMs: this.pumpStats(), mode: this.mode },
      collision: { chunkBoxes: this.g.statics.chunkBoxes },
      nav: { foot: { ox: this.g.nav.foot.ox, oz: this.g.nav.foot.oz, recentres: this.g.nav.foot.recentres }, car: { ox: this.g.nav.car.ox, oz: this.g.nav.car.oz, recentres: this.g.nav.car.recentres } },
      dustWall: { radius: STREAM.dustWall, fade: +this.wall.fade.toFixed(3) },
      corridor: { road: this.W.road.id, nickname: this.W.road.nickname, km: +(this.W.cl.L / 1000).toFixed(2), west: this.W.ends.west, east: this.W.ends.east, exits: this.W.exits.length, signs: this.W.signs.length },
      warnings: this.W.warnings, bootMs: this.bootMs, indexMs: this.W.buildMs,
      region: this.region?.id ?? 'arizona',
      regions: Object.fromEntries(Object.values(this.W.regions).map((R) => [R.id, { name: R.name, box: [Math.round(R.x0), Math.round(R.z0), Math.round(R.x1), Math.round(R.z1)], wall: R.wall.name,
        corridors: R.corridors.map((c) => ({ id: c.id, km: +(c.L / 1000).toFixed(2), miles: +(c.L / STREAM.mile).toFixed(1), from: c.startTown, trimmedAt: Math.round(c.mainlineFrom), exits: c.exits.map((X) => ({ id: X.id, number: X.number, name: X.name, archetype: X.archetype, holdout: X.holdout ?? null, town: X.town ?? null })) })),
        holdouts: R.holdouts.map((h) => h.id), waterChunks: R.cache.size, signFaces: this.atlasFL.count }])),
    };
  }
  chunkView(x, z) {
    const cx = chunkOf(x), cz = chunkOf(z), key = chunkKey(cx, cz), L = this.layouts.get(key);
    const tier = this.hot.get(key)?.hot?.done ? 'hot' : L ? 'layout' : 'none';
    if (!L) return { key, tier, cx, cz };
    const R = L.ring;
    return { key, tier, cx, cz, hash: L.hash, buildMs: L.buildMs, workMs: L.workMs, biome: L.biome, state: L.state, region: L.region ?? null, water: L.water ? { wet: L.water.d.reduce((n, v) => n + (v > 0 ? 1 : 0), 0), deep: L.water.d.reduce((n, v) => n + (v > 1.3 ? 1 : 0), 0), max: +Math.max(...L.water.d).toFixed(2) } : null, life: L.life ?? null, boxes: L.boxCount, buildings: L.buildings,
      instances: { ...L.counts }, surfaces: Object.fromEntries(Object.entries(L.surf).map(([k, s]) => [k, s ? s.nv : 0])), edges: { ...L.edges }, edgeRoads: { ...L.edgeRoads }, pinned: this.pinned.has(key), warnings: L.warnings,
      ring: R ? { buildings: R.owned, reaching: R.near, containers: R.boxes.length, beds: R.beds.length, streets: R.streets, decor: R.decor, ms: R.ms, zones: [...new Set(R.bld.map((b) => b.zone))] } : null };
  }
}
