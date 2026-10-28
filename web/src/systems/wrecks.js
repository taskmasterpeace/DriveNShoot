// DEAD CARS (data/wrecks.js; world/wreckbody.js): every static car in the world is one of our vehicle bodies, dead, and
// they all draw in ONE batched mesh (three.js BatchedMesh: one draw call, plus its shadow).
// Owners hand their wrecks over in sets and take them back the same way:
//   chunks   world/streamer.js applyStep / release: a chunk's `wrecks` (chunkgen: the shoulders, the ring's kerbs, the
//            towners' chop shops, boneyards and hulks) show while the chunk is hot
//   towns    systems/citygen.js stamp / release: a town's street wrecks, burned-out alley cars, yard cars on blocks
//   island   world/city.js at boot (the Phoenix island's wrecks)
//   bases    systems/bases.js: a stripped truck in a base's motor pool
// A record: { x, z, y?, rot (yaw, rad: 0 = the car's nose to +z), type, state, paint, fit?: [len, wid] (the collider
// it must stand in), stack?: m up (a hulk on another), tilt? }. Collision is the owner's (its boxes are unchanged).
import * as THREE from 'three';
import { VEHICLES } from './vehicles.js';
import { WRECK_STATES, WRECK_PAINTS, WRECK_FIT } from '../data/wrecks.js';
import { deadBody } from '../world/wreckbody.js';

const MAX = 1400, VERTS = 150000;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

export class Wrecks {
  constructor(g) {
    this.g = g;
    this.geo = new Map();      // `${type}:${state}` -> batch geometry id
    this.sets = new Map();     // owner key -> [instance ids]
    this.recs = new Map();     // instance id -> its record (agents, checks)
    this.paints = WRECK_PAINTS.map((h) => new THREE.Color(h));
    this.mesh = null;
    if (g.scene) {
      this.mesh = new THREE.BatchedMesh(MAX, VERTS, 0, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.05 }));
      this.mesh.name = 'wrecks'; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
      this.mesh.sortObjects = false; // opaque: no per-frame sort
      this.mesh.frustumCulled = false; // its own bounds go stale as sets come and go: per-instance culling does the work (perObjectFrustumCulled)
      g.scene.add(this.mesh);
    }
    this.counts = { added: 0, removed: 0, full: 0, bodies: 0 };
  }

  // The batch entry for a type x state (built once).
  body(type, state) {
    const k = `${type}:${state}`;
    let id = this.geo.get(k);
    if (id === undefined) {
      const spec = VEHICLES[type] ?? VEHICLES.sedan, S = WRECK_STATES[state] ?? WRECK_STATES.rusted;
      const geo = deadBody(spec, VEHICLES[type] ? type : 'sedan', S);
      id = this.mesh.addGeometry(geo);
      geo.dispose();
      // a body added after the batch's first upload: send the whole buffers again (r170 uploads only the update ranges,
      // and a range added after the first upload was seen to leave the colours stale); at most one per type x state
      for (const a of Object.values(this.mesh.geometry.attributes)) { a.clearUpdateRanges(); a.needsUpdate = true; }
      this.geo.set(k, id); this.counts.bodies++;
    }
    return id;
  }

  add(key, list, y0 = 0) {
    if (!this.mesh || !list?.length) return;
    if (this.sets.has(key)) this.remove(key);
    const ids = [];
    for (const r of list) {
      if (this.mesh.instanceCount >= MAX) { this.counts.full++; break; }
      const spec = VEHICLES[r.type] ?? VEHICLES.sedan;
      const id = this.mesh.addInstance(this.body(r.type, r.state));
      let k = 1;
      if (r.fit) k = Math.max(WRECK_FIT.minScale, Math.min(1, (r.fit[0] + WRECK_FIT.overLen) / spec.len, (r.fit[1] + WRECK_FIT.overWid) / spec.wid));
      _p.set(r.x, (r.y ?? y0) + (r.stack ?? 0), r.z); _e.set(r.tilt ?? 0, r.rot ?? 0, 0, 'YXZ'); _q.setFromEuler(_e); _s.set(k, k, k);
      this.mesh.setMatrixAt(id, _m.compose(_p, _q, _s));
      this.mesh.setColorAt(id, r.state === 'burned' ? _c.setRGB(1, 1, 1) : this.paints[(r.paint ?? 0) % this.paints.length]);
      ids.push(id); this.recs.set(id, r);
    }
    this.sets.set(key, ids);
    this.counts.added += ids.length;
  }
  remove(key) {
    const ids = this.sets.get(key);
    if (!ids) return;
    for (const id of ids) { this.mesh.deleteInstance(id); this.recs.delete(id); }
    this.sets.delete(key);
    this.counts.removed += ids.length;
  }

  // A set-piece clears its lot (systems/bases.js clearLot): every wreck standing in one of the rects [x0, z0, x1, z1] goes.
  clearIn(rects) {
    let n = 0;
    for (const ids of this.sets.values()) for (let i = ids.length - 1; i >= 0; i--) {
      const r = this.recs.get(ids[i]);
      if (r && rects.some((q) => r.x > q[0] && r.x < q[2] && r.z > q[1] && r.z < q[3])) { this.mesh.deleteInstance(ids[i]); this.recs.delete(ids[i]); ids.splice(i, 1); n++; }
    }
    return n;
  }

  // The owners' hooks.
  chunkOn(L) { if (L.wrecks?.length) this.add(`chunk:${L.key}`, L.wrecks, 0); }
  chunkOff(L) { this.remove(`chunk:${L.key}`); }

  // Every live wreck (agents, the check that no car is built from boxes).
  list() { const out = []; for (const [key, ids] of this.sets) for (const id of ids) out.push({ key, ...this.recs.get(id) }); return out; }
  view() {
    const by = {}; for (const r of this.recs.values()) { const k = `${r.type}:${r.state}`; by[k] = (by[k] ?? 0) + 1; }
    return { live: this.recs.size, sets: this.sets.size, bodies: this.counts.bodies, byTypeState: by, cap: MAX, counts: this.counts };
  }
}
