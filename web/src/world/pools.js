import * as THREE from 'three';

// GPU side of the streamer (docs/design/WEB_STREAMING.md §3.5, F8).
//   Pool        - one global InstancedMesh per kind of repeated thing (cacti, shrubs, walls...). A hot chunk takes a
//                 range of its instances (first fit, freed neighbours merge back); freeing writes zero-scale matrices;
//                 uploads are partial (addUpdateRange). One draw call (+ one shadow call if it casts) however many
//                 chunks are hot; frustumCulled off, visible only while used.
//   SurfacePool - recycled merged-geometry slots, one Mesh per (slot, layer): ground, road, rock. Buffers are
//                 preallocated as DynamicDraw and reused through setDrawRange: no create/dispose churn, no shader
//                 recompile. Each slot mesh frustum-culls on its chunk's own bounds.

export class Pool {
  constructor(name, geo, mat, cap, { cast = true, receive = true, extra = null } = {}) {
    this.name = name; this.cap = cap;
    const m = (this.mesh = new THREE.InstancedMesh(geo, mat, cap));
    m.name = `pool:${name}`;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.instanceMatrix.array.fill(0); // zero scale: nothing drawn until a chunk writes it
    if (extra) {
      this.extra = new THREE.InstancedBufferAttribute(new Float32Array(cap * extra.size), extra.size);
      this.extra.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(extra.name, this.extra);
    }
    m.count = 0; m.frustumCulled = false; m.visible = false;
    m.castShadow = cast; m.receiveShadow = receive;
    this.free = [[0, cap]]; // sorted [start, length] runs
    this.used = 0; this.high = 0; this.full = 0; this.writes = 0;
  }

  // First fit. Returns the start index, or -1 when no run is long enough (the caller reports poolFull).
  alloc(n) {
    if (n <= 0) return -1;
    for (let i = 0; i < this.free.length; i++) {
      const r = this.free[i];
      if (r[1] < n) continue;
      const start = r[0];
      r[0] += n; r[1] -= n;
      if (!r[1]) this.free.splice(i, 1);
      this.used += n;
      if (start + n > this.high) this.high = start + n;
      return start;
    }
    this.full++;
    return -1;
  }

  // Write n instances at start: matrices (16 floats each), colours (3), the optional extra attribute.
  write(start, n, mats, cols, ext = null) {
    const m = this.mesh;
    m.instanceMatrix.array.set(mats.subarray(0, n * 16), start * 16);
    m.instanceMatrix.addUpdateRange(start * 16, n * 16);
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.array.set(cols.subarray(0, n * 3), start * 3);
    m.instanceColor.addUpdateRange(start * 3, n * 3);
    m.instanceColor.needsUpdate = true;
    if (this.extra && ext) {
      const k = this.extra.itemSize;
      this.extra.array.set(ext.subarray(0, n * k), start * k);
      this.extra.addUpdateRange(start * k, n * k);
      this.extra.needsUpdate = true;
    }
    m.count = this.high; m.visible = this.used > 0;
    this.writes++;
  }

  release(start, n) {
    if (start < 0 || n <= 0) return;
    const m = this.mesh;
    m.instanceMatrix.array.fill(0, start * 16, (start + n) * 16);
    m.instanceMatrix.addUpdateRange(start * 16, n * 16);
    m.instanceMatrix.needsUpdate = true;
    // Insert the run and merge it with its neighbours.
    let i = 0;
    while (i < this.free.length && this.free[i][0] < start) i++;
    this.free.splice(i, 0, [start, n]);
    if (i + 1 < this.free.length && this.free[i][0] + this.free[i][1] === this.free[i + 1][0]) { this.free[i][1] += this.free[i + 1][1]; this.free.splice(i + 1, 1); }
    if (i > 0 && this.free[i - 1][0] + this.free[i - 1][1] === this.free[i][0]) { this.free[i - 1][1] += this.free[i][1]; this.free.splice(i, 1); }
    this.used -= n;
    const last = this.free[this.free.length - 1];
    this.high = last && last[0] + last[1] === this.cap ? last[0] : this.cap;
    m.count = this.high; m.visible = this.used > 0;
  }

  view() { return { used: this.used, cap: this.cap, high: this.high, runs: this.free.length, full: this.full }; }
}

// Layers of a surface slot: what each stores per vertex. Every layer has position + normal; ground and road have uv;
// ground and rock have colour.
export const LAYERS = {
  ground: { uv: true, color: true, cast: false, receive: true },
  road: { uv: true, color: false, cast: false, receive: true },
  rock: { uv: false, color: true, cast: true, receive: true },
};

export class SurfacePool {
  // caps: { ground: [maxVerts, maxIndices], ... }; mats: { ground: material, ... }
  constructor(scene, slots, caps, mats) {
    this.slots = [];
    this.freeSlots = [];
    for (let s = 0; s < slots; s++) {
      const slot = { id: s, layers: {}, chunk: null };
      for (const [name, L] of Object.entries(LAYERS)) {
        const [mv, mi] = caps[name];
        const g = new THREE.BufferGeometry();
        const attr = (k, size) => { const a = new THREE.BufferAttribute(new Float32Array(mv * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); };
        attr('position', 3); attr('normal', 3);
        if (L.uv) attr('uv', 2);
        if (L.color) attr('color', 3);
        const idx = new THREE.BufferAttribute(new Uint32Array(mi), 1); idx.setUsage(THREE.DynamicDrawUsage); g.setIndex(idx);
        g.setDrawRange(0, 0);
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
        g.boundingBox = new THREE.Box3();
        const mesh = new THREE.Mesh(g, mats[name]);
        mesh.name = `surface:${name}:${s}`;
        mesh.castShadow = L.cast; mesh.receiveShadow = L.receive;
        mesh.visible = false; mesh.matrixAutoUpdate = false;
        scene.add(mesh);
        slot.layers[name] = { mesh, mv, mi, nv: 0, ni: 0 };
      }
      this.slots.push(slot);
      this.freeSlots.push(s);
    }
    this.uploads = 0; this.overflow = 0;
  }

  acquire() { const s = this.freeSlots.pop(); return s === undefined ? null : this.slots[s]; }
  release(slot) {
    for (const L of Object.values(slot.layers)) { L.mesh.visible = false; L.nv = 0; L.ni = 0; L.mesh.geometry.setDrawRange(0, 0); }
    slot.chunk = null;
    this.freeSlots.push(slot.id);
  }

  // Copy one layer's arrays (chunk-local positions) into the slot and place it at the chunk origin (ox, oz).
  upload(slot, name, d, ox, oz) {
    const L = slot.layers[name], g = L.mesh.geometry;
    if (!d || !d.nv) { L.mesh.visible = false; L.nv = 0; L.ni = 0; return; }
    if (d.nv > L.mv || d.ni > L.mi) { this.overflow++; L.mesh.visible = false; return; }
    const put = (k, src, size) => { const a = g.attributes[k]; a.array.set(src.subarray(0, d.nv * size)); a.clearUpdateRanges(); a.addUpdateRange(0, d.nv * size); a.needsUpdate = true; };
    put('position', d.pos, 3); put('normal', d.nrm, 3);
    if (g.attributes.uv) put('uv', d.uv, 2);
    if (g.attributes.color) put('color', d.col, 3);
    g.index.array.set(d.idx.subarray(0, d.ni));
    g.index.clearUpdateRanges(); g.index.addUpdateRange(0, d.ni); g.index.needsUpdate = true;
    g.setDrawRange(0, d.ni);
    g.boundingSphere.center.set(d.bounds.cx, d.bounds.cy, d.bounds.cz); g.boundingSphere.radius = d.bounds.r;
    g.boundingBox.min.set(d.bounds.cx - d.bounds.r, d.bounds.cy - d.bounds.r, d.bounds.cz - d.bounds.r);
    g.boundingBox.max.set(d.bounds.cx + d.bounds.r, d.bounds.cy + d.bounds.r, d.bounds.cz + d.bounds.r);
    L.mesh.position.set(ox, 0, oz); L.mesh.updateMatrix(); L.mesh.updateMatrixWorld(true);
    L.mesh.visible = true; L.nv = d.nv; L.ni = d.ni;
    this.uploads++;
  }

  view() {
    const used = this.slots.length - this.freeSlots.length;
    return { slots: this.slots.length, used, uploads: this.uploads, overflow: this.overflow };
  }
}
