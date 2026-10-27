import * as THREE from 'three';
import { layoutTown, layoutRural, layoutBase } from '../world/citygen/layout.js';
import { layoutSite } from '../world/citygen/site.js';
import { buildTown, hashStr } from '../world/citygen/build.js';
import { ARCHETYPES, RURAL, PLACE, ROADS, MILITARY, OVERRUN } from '../data/citygen.js';
import { SITES, SITES_BY_ID } from '../data/sites/index.js';
import { ATLAS_BASES, ATLAS_XZ } from '../data/atlas.js';
import GOLDEN from '../data/golden.json';
import { makeRng } from '../engine/rng.js';
import { Overrun } from './overrun.js';

// PROCEDURAL CITIES (docs/design/WEB_CITYGEN.md): the settlements of the streamed country, planned once at boot from the
// corridors (a pure, seeded plan: towns of every archetype by biome, homesteads along the roads, real sites, military bases
// far apart at real base anchors), and BUILT only near you (world/citygen/ layout -> build: colliders, floors, stairs,
// roofs, loot, cover), torn down when you leave. One instanced mesh draws every live settlement (1 draw call).
//
// What the rest of the engine sees:
//   collision  a third tier in engine/collision.js (statics.cg): the live towns' boxes in an 8 m hash; movers, rays and
//              bullets meet them like any wall (window holes, floating lintels, parapets)
//   storeys    every storeyed building, fire escape and roof bridge is a record in world/storeys.js's grid (addExt): the
//              storeys law (heightAt, levelOf, sameFloor, steer, setView) treats them as its own
//   chunks     W.citygen.solid(): the chunk generator keeps its wild scatter out of a planned settlement
//   interior   buildingAt(x, z): main.js updateInterior's building (roof cut, floors above hidden)
//   loot       per-floor containers through inventory.registerRing (their own floor's height: box.y)
//   overrun    systems/overrun.js: infestation, hordes, falls and retakes
//
// APIs for other lanes (each one call, allocation-free where it runs per frame):
//   camera:  floorTags(x, z) -> { id, kind, levels: [y...], top } | null;  hideAbove(S, level) / showAll(S): the cutaway
//            (storeys.setView already drives these for the building you are in)
//   tactics: coverNear(x, z, r, y, out) -> out filled with { x, z, y, nx, nz, h (1 full / 0.5 half), kind } (kind: 1 wall,
//            2 ruin half-wall, 3 window frame, 4 pump, 5 parapet, 6 crate, 7 town wall, 8 wreck); COVER_KINDS names them
export const COVER_KINDS = ['', 'wall', 'half_wall', 'window_frame', 'pump', 'parapet', 'crate', 'town_wall', 'wreck'];
const CELL = 8, CAP = 90000, EMPTY = [];
const _o = new THREE.Object3D(), _c = new THREE.Color();

// The live towns' boxes, bucketed for engine/collision.js (statics.cg): cell(gx, gz) is the list in global 8 m cell.
class CgGrid {
  constructor() { this.map = new Map(); this.n = 0; this.x0 = Infinity; this.z0 = Infinity; this.x1 = -Infinity; this.z1 = -Infinity; }
  key(gx, gz) { return gx * 131072 + gz; }
  cell(gx, gz) { return this.map.get(gx * 131072 + gz) ?? EMPTY; }
  rebuild(towns) {
    this.map.clear(); this.n = 0; this.x0 = Infinity; this.z0 = Infinity; this.x1 = -Infinity; this.z1 = -Infinity;
    for (const t of towns) {
      for (const b of t.built.boxes) {
        for (let gx = Math.floor(b.minX / CELL); gx <= Math.floor(b.maxX / CELL); gx++) for (let gz = Math.floor(b.minZ / CELL); gz <= Math.floor(b.maxZ / CELL); gz++) {
          const k = this.key(gx, gz); let L = this.map.get(k); if (!L) this.map.set(k, (L = [])); L.push(b);
        }
        this.n++;
        if (b.minX < this.x0) this.x0 = b.minX; if (b.maxX > this.x1) this.x1 = b.maxX; if (b.minZ < this.z0) this.z0 = b.minZ; if (b.maxZ > this.z1) this.z1 = b.maxZ;
      }
    }
  }
}

// ---- the plan: where the country's settlements stand (pure: the world index, the rows, the seed) -----------------------
function biomeFor(W, x, z) {
  const ch = W.biomeAt?.(x, z) ?? 'd', R = W.regionOf?.(x, z);
  if (R && R.id === 'florida') return ch === 's' ? 'deep_south_swamp' : ch === 'F' ? 'temperate_forest' : ch === 'a' ? 'prairie_farm' : ch === 'w' ? 'river_delta' : ch === '.' ? 'atlantic_coast' : 'gulf_coast';
  return { d: x < -60000 ? 'desert_mojave' : 'desert_sonoran', f: 'desert_sonoran', u: 'desert_sonoran', m: 'high_plateau', p: 'great_plains', a: 'prairie_farm', w: 'badlands', F: 'northern_pine', s: 'deep_south_swamp', '.': 'gulf_coast' }[ch] ?? 'desert_sonoran';
}
const ARCH_W = { walled_stronghold: 0.5, hot_zone_ruin: 0.2, military_town: 0.3, interstate_exit: 1.6, boom_strip: 0.6 };
function archFor(rng, biome) {
  const c = Object.entries(ARCHETYPES).filter(([, a]) => a.biome.includes(biome));
  let t = 0; for (const [id] of c) t += ARCH_W[id] ?? 1;
  let p = rng() * t; for (const [id] of c) if ((p -= ARCH_W[id] ?? 1) < 0) return id;
  return c[0]?.[0] ?? 'interstate_exit';
}
const goldenChunks = new Set(Object.keys(GOLDEN.p1Chunks ?? {}));
export function planWorld(W, seed = 0xc17e) {
  const rng = makeRng(seed), out = [];
  const corridors = [W.i10, ...Object.values(W.regions ?? {}).flatMap((R) => R.corridors ?? [])].filter(Boolean);
  const exits = corridors.flatMap((c) => c.exits ?? []).map((X) => X.dest ?? X).filter((d) => Number.isFinite(d?.x));
  const holdouts = W.holdouts ?? [];
  const towns = (W.towns ?? []).filter((t) => t.built);
  const free = (x, z, half) => {
    if (Math.hypot(x, z) < PLACE.clear.island + half) return false;
    if (!W.inWorld(x, z, -half - 50)) return false;
    for (const d of exits) if (Math.hypot(d.x - x, d.z - z) < PLACE.clear.exit + half) return false;
    for (const H of holdouts) if (Math.hypot(H.cx - x, H.cz - z) < PLACE.clear.holdout + half + Math.max(H.hw, H.hd)) return false;
    for (const t of towns) if (Math.hypot(t.x - x, t.z - z) < 1600 + half) return false;
    for (const o of out) if (Math.abs(o.x - x) < o.half + half + 120 && Math.abs(o.z - z) < o.half + half + 120) return false;
    for (const cor of corridors) { const p = cor.project?.(x, z, half + 80); if (p && p.d < half + 60) return false; } // off the interstate
    for (let gx = Math.floor((x - half) / 256); gx <= Math.floor((x + half) / 256); gx++) for (let gz = Math.floor((z - half) / 256); gz <= Math.floor((z + half) / 256); gz++) if (goldenChunks.has(`${gx},${gz}`)) return false;
    for (const [dx, dz] of [[0, 0], [-half, -half], [half, -half], [-half, half], [half, half]]) if ((W.depthAt?.(x + dx, z + dz, 0) ?? 0) > 0.05) return false; // dry ground
    return true;
  };
  const sitesByRegion = { arizona: SITES.filter((s) => s.real.state === 'AZ' && s.kind !== 'military'), florida: SITES.filter((s) => s.real.state === 'FL' && s.kind !== 'military') };
  const siteUsed = new Set();
  for (const cor of corridors) {
    const L = cor.L ?? 0;
    if (!(L > 2000)) continue;
    const cs = makeRng(hashStr(cor.id ?? 'c') ^ seed);
    // towns: one per cityEvery along the road, alternating sides
    let side = cs() < 0.5 ? 1 : -1;
    for (let s = PLACE.cityEvery * cs.range(0.4, 0.9); s < L - 600; s += PLACE.cityEvery * cs.range(0.75, 1.25)) {
      side = -side;
      const f = cor.at(s), off = cs.range(PLACE.cityOff[0], PLACE.cityOff[1]);
      const x = Math.round(f.x + f.nx * side * off), z = Math.round(f.z + f.nz * side * off);
      const biome = biomeFor(W, x, z), R = W.regionOf?.(x, z), rid = R?.id ?? 'arizona';
      const pool = (sitesByRegion[rid] ?? []).filter((r) => !siteUsed.has(r.id));
      let rec;
      if (pool.length && cs() < 0.35) {
        const row = pool[Math.floor(cs() * pool.length)];
        rec = { kind: 'site', site: row.id, arch: row.layout, biome: row.biome, half: Math.max(...row.footprint) / 2 + 20, name: row.name };
      } else {
        const arch = archFor(cs, biome), A = ARCHETYPES[arch];
        rec = { kind: 'town', arch, biome, half: A.sizeM[1] / 2 + 30, name: A.name.toUpperCase() };
      }
      if (!free(x, z, rec.half)) continue;
      if (rec.kind === 'site') siteUsed.add(rec.site);
      out.push({ ...rec, id: `cg-${out.length}`, x, z, seed: hashStr(`${cor.id}:${Math.round(s)}`) ^ seed, cor: cor.id, s: Math.round(s) });
    }
    // homesteads: living outside a city, along the road
    for (let s = 600 + cs() * 900; s < L - 300; s += cs.range(1100, 2100)) {
      const f = cor.at(s), sd = cs() < 0.5 ? 1 : -1, biome = biomeFor(W, f.x, f.z);
      const opts = Object.entries(RURAL).filter(([, r]) => r.biome.includes(biome) && cs() < 1500 / r.every);
      if (!opts.length) continue;
      const [kind, R] = opts[Math.floor(cs() * opts.length)];
      const off = cs.range(R.off[0], R.off[1]) + 40, x = Math.round(f.x + f.nx * sd * off), z = Math.round(f.z + f.nz * sd * off);
      const half = Math.max(...R.parcel) / 2 + 10;
      if (!free(x, z, half)) continue;
      // the parcel's drive points back at the road
      const front = Math.abs(f.nx) > Math.abs(f.nz) ? (f.nx * sd > 0 ? 'W' : 'E') : (f.nz * sd > 0 ? 'N' : 'S');
      out.push({ kind: 'rural', arch: kind, biome, half, x, z, seed: hashStr(`${cor.id}:r${Math.round(s)}`) ^ seed, front, id: `cg-${out.length}`, name: R.name.toUpperCase(), cor: cor.id, s: Math.round(s) });
    }
  }
  // military bases: at real base anchors inside the streamed world, far apart (MILITARY.spacing)
  const bases = [];
  for (const B of ATLAS_BASES ?? []) {
    const xz = ATLAS_XZ?.bases?.[B.id];
    if (!xz) continue;
    let [x, z] = xz;
    if (!W.inWorld(x, z, -400)) continue;
    // the base stands beside its anchor (the underground's own bunker stays on the anchor): 900 m off, on free ground
    let ok = false;
    for (let a = 0; a < 8 && !ok; a++) { const xx = Math.round(x + Math.cos(a * Math.PI / 4) * 900), zz = Math.round(z + Math.sin(a * Math.PI / 4) * 900); if (free(xx, zz, MILITARY.size[0] / 2 + 20)) { x = xx; z = zz; ok = true; } }
    if (!ok) continue;
    if (bases.some((b) => Math.hypot(b.x - x, b.z - z) < MILITARY.spacing)) continue;
    const rec = { kind: 'base', arch: 'military_base', biome: biomeFor(W, x, z), half: MILITARY.size[0] / 2 + 20, x, z, seed: hashStr(B.id) ^ seed, id: `cg-${out.length}`, name: `${B.name.toUpperCase()} RESERVATION`, anchor: B.id };
    bases.push(rec); out.push(rec);
  }
  for (const r of out) {
    const A = ARCHETYPES[r.arch];
    r.infestation = 0; r.state = 'holding';
    r.walls = r.kind === 'base' ? MILITARY.fence : r.kind === 'site' ? (SITES_BY_ID.get(r.site)?.walls?.type ?? 'none') : A?.walls ?? 'none';
  }
  return out;
}

export class CityGen {
  constructor(g) {
    this.g = g;
    this.W = g.streamer?.W ?? null;
    this.enabled = true;
    this.plan = this.W ? planWorld(this.W) : [];
    this.byId = new Map(this.plan.map((r) => [r.id, r]));
    this.bucket = new Map(); // 1 km buckets -> plan records (chunk solid(), nearby queries)
    for (const r of this.plan) this.index(r);
    if (this.W) this.W.citygen = this;
    this.live = new Map();   // rec id -> { rec, T, built, base, blds, chars }
    this.grid = new CgGrid();
    g.statics.cg = this.grid;
    g.storeys.ext = this;
    this.bgrid = new Map();  // 16 m cells -> live building records (buildingAt)
    this.cover = [];         // live towns' cover arrays
    this.colorCache = new Map();
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02 }), CAP);
    this.mesh.name = 'citygen';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.visible = false;
    g.scene.add(this.mesh);
    this.items = [];         // flattened live items (index = instance)
    this.scanT = 0;
    this.counts = { stamped: 0, released: 0, audits: 0, buildMs: 0, maxMs: 0 };
    this.overrun = new Overrun(this);
  }

  index(r) {
    for (let bx = Math.floor((r.x - r.half) / 1000); bx <= Math.floor((r.x + r.half) / 1000); bx++) for (let bz = Math.floor((r.z - r.half) / 1000); bz <= Math.floor((r.z + r.half) / 1000); bz++) {
      const k = bx * 65536 + bz; let L = this.bucket.get(k); if (!L) this.bucket.set(k, (L = [])); if (!L.includes(r)) L.push(r);
    }
  }
  unindex(r) { for (const L of this.bucket.values()) { const i = L.indexOf(r); if (i >= 0) L.splice(i, 1); } }
  // The chunk generator's question (world/chunkgen.js blocked): is (x, z) inside a planned settlement (wild scatter keeps off)?
  solid(x, z, r = 0) {
    const L = this.bucket.get(Math.floor(x / 1000) * 65536 + Math.floor(z / 1000));
    if (!L) return false;
    for (const s of L) if (Math.abs(x - s.x) < s.half + 6 + r && Math.abs(z - s.z) < s.half + 6 + r) return true;
    return false;
  }
  near(x, z, R) {
    const out = [];
    for (let bx = Math.floor((x - R) / 1000); bx <= Math.floor((x + R) / 1000); bx++) for (let bz = Math.floor((z - R) / 1000); bz <= Math.floor((z + R) / 1000); bz++) {
      const L = this.bucket.get(bx * 65536 + bz); if (!L) continue;
      for (const s of L) if (!out.includes(s) && Math.hypot(s.x - x, s.z - z) < R + s.half) out.push(s);
    }
    return out;
  }
  recAt(x, z, m = 0) { for (const s of this.near(x, z, 10)) if (Math.abs(x - s.x) < s.half + m && Math.abs(z - s.z) < s.half + m) return s; return null; }

  // ---- stamping -------------------------------------------------------------------------------------------------------
  layoutOf(rec) {
    if (rec.kind === 'site') return layoutSite(SITES_BY_ID.get(rec.site), { x: rec.x, z: rec.z, seed: rec.seed });
    if (rec.kind === 'rural') return layoutRural({ kind: rec.arch, seed: rec.seed, x: rec.x, z: rec.z, biome: rec.biome, front: rec.front, id: rec.id, name: rec.name });
    if (rec.kind === 'base') return layoutBase({ seed: rec.seed, x: rec.x, z: rec.z, biome: rec.biome, id: rec.id, name: rec.name });
    return layoutTown({ arch: rec.arch, biome: rec.biome, seed: rec.seed, x: rec.x, z: rec.z, id: rec.id, name: rec.name, size: rec.size, walls: rec.wallsOverride });
  }
  stamp(rec) {
    if (this.live.has(rec.id)) return this.live.get(rec.id);
    const t0 = performance.now();
    const T = this.layoutOf(rec);
    const built = buildTown(T);
    const t = { rec, T, built, blds: built.blds, chars: [] };
    this.live.set(rec.id, t);
    rec.size = T.size; rec.half = Math.max(rec.half, Math.max(T.x1 - T.x0, T.z1 - T.z0) / 2 + 12); rec.name = T.name;
    rec.gates = T.gates; rec.defense = this.defenseOf(rec, T);
    for (const S of built.recs) this.g.storeys.addExt(S);
    for (const R of built.blds) { R.storey = R.S; R.setRoof = (v) => this.setRoof(R, v); R.rec = rec; }
    this.indexBlds();
    this.grid.rebuild(this.live.values());
    this.relayItems();
    // loot: each floor's containers at their own height
    const inv = this.g.inventory;
    if (inv) {
      inv.registerRing(built.loot);
      for (const q of built.loot) { const b = inv.boxes.get(q.id); if (b) { b.y = q.y; if (rec.state === 'overrun' && !b.rolled) b.kind = OVERRUN.loot.overrun; } }
    }
    if (T.bunker) this.bunkerFor(rec, T);
    this.overrun.populate(t);
    const ms = performance.now() - t0;
    this.counts.stamped++; this.counts.buildMs = +ms.toFixed(1); this.counts.maxMs = Math.max(this.counts.maxMs, +ms.toFixed(1));
    this.g.emit?.('settlementBuilt', { id: rec.id, name: rec.name, arch: rec.arch, buildings: T.buildings.length, ms: Math.round(ms) });
    return t;
  }
  release(id) {
    const t = this.live.get(id);
    if (!t) return;
    this.overrun.depopulate(t);
    for (const S of t.built.recs) this.g.storeys.removeExt(S);
    if (this.g.storeys.viewS?.cg && t.built.recs.includes(this.g.storeys.viewS)) this.g.storeys.setView(null, 0);
    this.g.inventory?.unregisterRing(t.built.loot);
    this.live.delete(id);
    this.indexBlds();
    this.grid.rebuild(this.live.values());
    this.relayItems();
    for (const c of this.g.chars) if (c.storey?.cg && !this.g.storeys.at(c.x, c.z)) { c.storey = null; c.gy = 0; }
    this.counts.released++;
  }
  // A base's vault: the underground lane's site row (data/underground.js KINDS.vault), entrance under the HQ's flank.
  bunkerFor(rec, T) {
    const U = this.g.under;
    if (!U) return;
    const id = `cg_${rec.id}_vault`;
    if (U.byId.has(id)) return;
    const row = { id, name: `${rec.name} · THE VAULT`, kind: 'vault', entrance: 'lift', x: T.bunker.x, z: T.bunker.z, dir: 'S', levels: T.bunker.levels, seed: rec.seed >>> 0, power: false, fuel: 0.3, place: true, base: rec.anchor ?? rec.id };
    U.sites.push(row); U.byId.set(id, row);
    rec.vault = id;
  }
  defenseOf(rec, T) {
    const A = ARCHETYPES[rec.arch];
    const site = rec.kind === 'site' ? SITES_BY_ID.get(rec.site) : null;
    const wall = T.wall ? ({ none: 0, earth_berm: 0.25, palisade: 0.25, car_husk: 0.3, container: 0.4, stone_terrace: 0.45, chainlink: 0.15 }[T.wall.type] ?? 0) : 0;
    const base = rec.kind === 'base' ? 0.55 : rec.kind === 'rural' ? 0.1 : site ? 0.35 : A?.defense ?? 0.25;
    return Math.min(1.5, base + wall + (rec.defenseBonus ?? 0));
  }

  // ---- the mesh --------------------------------------------------------------------------------------------------------
  colorOf(hex) { let c = this.colorCache.get(hex); if (!c) { c = new THREE.Color(hex); this.colorCache.set(hex, c); } return c; }
  relayItems() {
    const M = this.mesh, items = this.items;
    items.length = 0;
    for (const t of this.live.values()) { t.base = items.length; for (const it of t.built.items) { if (items.length >= CAP) break; it.idx = items.length; items.push(it); } }
    for (let i = 0; i < items.length; i++) this.place(i, true);
    M.count = items.length;
    M.visible = items.length > 0;
    M.instanceMatrix.needsUpdate = true;
    if (M.instanceColor) M.instanceColor.needsUpdate = true;
    this.viewR = null;
  }
  place(i, on) {
    const it = this.items[i], M = this.mesh;
    _o.position.set(it.cx, it.cy, it.cz); _o.rotation.set(0, 0, 0);
    if (on) _o.scale.set(it.sx, it.sy, it.sz); else _o.scale.set(0, 0, 0);
    _o.updateMatrix();
    M.setMatrixAt(i, _o.matrix);
    M.setColorAt(i, this.colorOf(it.col));
  }
  // The cutaway for one building: its pieces above `level` are not drawn (level -1: all drawn).
  hideAbove(S, level) {
    const R = S?.b;
    if (!R || R.i0 === undefined) return;
    let any = false;
    for (let i = R.i0; i < R.i1; i++) { const it = R.rec && this.live.get(R.rec.id)?.built.items[i]; if (!it || it.idx === undefined) continue; this.place(it.idx, level < 0 || it.lv <= level); any = true; }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
  showAll(S) { this.hideAbove(S, -1); }
  // A building without floors above (main.js setRoofVisible): its roof (level >= 1 pieces) hides while you are inside.
  setRoof(R, visible) { if (R.S) return; this.hideAbove({ b: R }, visible ? -1 : 0); }
  // Storeys.setView hands a citygen building to us (world/storeys.js).
  view(S, L) { this.hideAbove(S, L); }

  // ---- queries ----------------------------------------------------------------------------------------------------------
  indexBlds() {
    this.bgrid.clear(); this.cover.length = 0;
    for (const t of this.live.values()) {
      this.cover.push(t.built.cover);
      for (const R of t.blds) for (let cx = Math.floor(R.minX / 16); cx <= Math.floor(R.maxX / 16); cx++) for (let cz = Math.floor(R.minZ / 16); cz <= Math.floor(R.maxZ / 16); cz++) {
        const k = cx * 65536 + cz; let L = this.bgrid.get(k); if (!L) this.bgrid.set(k, (L = [])); L.push(R);
      }
    }
  }
  buildingAt(x, z) {
    if (!this.live.size) return null;
    const L = this.bgrid.get(Math.floor(x / 16) * 65536 + Math.floor(z / 16));
    if (!L) return null;
    for (const R of L) if (x > R.minX && x < R.maxX && z > R.minZ && z < R.maxZ) return R;
    return null;
  }
  floorTags(x, z) {
    const R = this.buildingAt(x, z);
    if (!R) return null;
    return { id: R.B.id, kind: R.B.kind, levels: R.S ? R.S.Y.slice() : [0], top: R.B.top, roof: !!(R.S && R.S.n === R.B.n) };
  }
  // Cover points within r of (x, z) at floor height y (any floor when y is undefined). out: an array reused by the caller.
  coverNear(x, z, r, y, out = []) {
    out.length = 0;
    for (const C of this.cover) for (let i = 0; i < C.length; i += 7) {
      const dx = C[i] - x, dz = C[i + 1] - z;
      if (dx * dx + dz * dz > r * r) continue;
      if (y !== undefined && Math.abs(C[i + 2] - y) > 1.6) continue;
      out.push({ x: C[i], z: C[i + 1], y: C[i + 2], nx: C[i + 3], nz: C[i + 4], h: C[i + 5], kind: COVER_KINDS[C[i + 6]] });
      if (out.length >= 64) return out;
    }
    return out;
  }
  // The surface under a car: a road row's grip inside a live settlement (vehicles.js roadGrip), 1 elsewhere.
  gripAt(x, z) {
    for (const t of this.live.values()) {
      const T = t.T;
      if (x < T.x0 - 70 || x > T.x1 + 70 || z < T.z0 - 70 || z > T.z1 + 70) continue;
      for (const r of T.roads) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return ROADS[r.row].grip;
      return t.rec.kind === 'rural' ? 0.8 : 0.85; // a town's yards and lots: packed dirt
    }
    return 1;
  }

  // ---- per frame (cheap): stamp what you come near, release what you leave, the overrun sim -------------------------------
  update(dt) {
    this.overrun.update(dt); // the hordes walk whether or not settlements build themselves (enabled)
    if (!this.enabled) return;
    const g = this.g, P = g.player;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.5;
      const px = P.inVehicle ? P.inVehicle.x : P.x, pz = P.inVehicle ? P.inVehicle.z : P.z;
      for (const [id, t] of this.live) if (!t.rec.pinned && Math.hypot(t.rec.x - px, t.rec.z - pz) > PLACE.releaseR + t.rec.half) this.release(id);
      const want = this.near(px, pz, PLACE.attachR).filter((r) => !this.live.has(r.id)).sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
      if (want.length && this.live.size < PLACE.maxLive) this.stamp(want[0]); // one a scan: a hitch never stacks
      // cars feel the street they are on
      for (const v of g.vehicles) v.roadGrip = this.live.size ? this.gripAt(v.x, v.z) : 1;
    }
  }
  onNoise(x, z, r) { this.overrun.onNoise(x, z, r); }

  // ---- for agents -------------------------------------------------------------------------------------------------------
  // Stamp a settlement anywhere (the `citygen` / `site` commands): an ad-hoc plan record, pinned until removed.
  stampAt(o) {
    const id = o.id ?? `cg-at-${(this.adhoc = (this.adhoc ?? 0) + 1)}`;
    const old = this.byId.get(id);
    if (old) this.remove(id);
    const A = ARCHETYPES[o.arch];
    const rec = { kind: o.site ? 'site' : o.rural ? 'rural' : o.base ? 'base' : 'town', arch: o.arch ?? (o.site ? SITES_BY_ID.get(o.site)?.layout : o.rural ?? 'military_base'), site: o.site, biome: o.biome ?? A?.biome?.[0] ?? SITES_BY_ID.get(o.site)?.biome ?? 'desert_sonoran',
      x: Math.round(o.x), z: Math.round(o.z), seed: (o.seed ?? 1) >>> 0, id, half: (A ? A.sizeM[1] / 2 : 300) + 30, name: o.name ?? (A ? A.name.toUpperCase() : 'SETTLEMENT'), pinned: true, adhoc: true,
      infestation: 0, state: 'holding', walls: A?.walls ?? 'none', size: o.size, wallsOverride: o.walls, defenseBonus: o.defense ?? 0, front: o.front };
    this.plan.push(rec); this.byId.set(id, rec); this.index(rec);
    return this.stamp(rec);
  }
  remove(id) {
    this.release(id);
    const rec = this.byId.get(id);
    if (!rec) return false;
    this.byId.delete(id); this.unindex(rec);
    const i = this.plan.indexOf(rec); if (i >= 0) this.plan.splice(i, 1);
    return true;
  }
  status() {
    const by = {}; for (const r of this.plan) by[r.kind] = (by[r.kind] ?? 0) + 1;
    const arch = {}; for (const r of this.plan) if (r.kind === 'town') arch[r.arch] = (arch[r.arch] ?? 0) + 1;
    return { planned: this.plan.length, byKind: by, archetypes: arch, live: [...this.live.values()].map((t) => this.liveView(t)), items: this.items.length, cap: CAP, boxes: this.grid.n, counts: this.counts, hordes: this.overrun.view() };
  }
  liveView(t) {
    const T = t.T, b = t.built;
    return { id: t.rec.id, name: t.rec.name, kind: t.rec.kind, arch: t.rec.arch, biome: T.biome, x: t.rec.x, z: t.rec.z, size: T.size, buildings: T.buildings.length, storeyed: b.blds.filter((R) => R.S).length, tallest: Math.max(0, ...T.buildings.map((B) => B.n)),
      driveIns: b.blds.filter((R) => R.B.drive).length, roofs: b.blds.filter((R) => R.S && R.S.n === R.B.n).length, escapes: b.blds.filter((R) => R.E).length, bridges: b.bridges.length, wall: T.wall?.type ?? 'none', gates: T.gates.length,
      boxes: b.boxes.length, items: b.items.length, loot: b.loot.length, cover: b.cover.length / 7, claimable: b.blds.filter((R) => R.B.claimable).length, vault: t.rec.vault ?? null, state: t.rec.state, infestation: +t.rec.infestation.toFixed(3), defense: +(t.rec.defense ?? 0).toFixed(2), residents: t.chars.filter((c) => c.alive).length };
  }
  marks() { return this.plan.map((r) => ({ id: r.id, name: r.name, kind: r.kind, x: r.x, z: r.z, state: r.state, infestation: +r.infestation.toFixed(2) })); }
  // The deed hook: claim a claimable building as your home (base building itself is a later lane).
  claim(R) { if (!R?.B?.claimable) return false; R.B.owner = 'player'; this.g.emit?.('deedClaimed', { building: R.B.id, kind: R.B.kind, town: R.rec?.id }); return true; }
}
