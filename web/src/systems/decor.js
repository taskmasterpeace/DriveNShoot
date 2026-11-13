// THE DETAIL ON THE FURNITURE (docs/design/WEB_FURNISH.md; rows data/cgrooms.js PIECES[*].parts, DECOR).
// A town's furniture is one box a piece in the town's one mesh. What makes a counter a counter (the register), a shelf a
// shelf (the goods), a cooler a cooler (glass, bottles, a red header) is drawn HERE, in one small pool of boxes, and only
// for the buildings near you: a town has tens of thousands of pieces and you stand in one building at a time.
// Looks only: no collider, nothing to loot, nothing saved. One draw call.
import * as THREE from 'three';
import { PIECES, DECOR } from '../data/cgrooms.js';

const _o = new THREE.Object3D(), _c = new THREE.Color();
const frac = (v) => v - Math.floor(v);
const byD2 = (a, b) => a.d2 - b.d2;
const hash = (x, z, k) => frac(Math.sin(x * (12.9898 + k) + z * (78.233 - k * 0.7)) * 43758.5453);

export class Decor {
  constructor(game) {
    this.g = game;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.03 }), DECOR.max);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.castShadow = false; this.mesh.receiveShadow = true;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DECOR.max * 3).fill(1), 3);
    game.scene.add(this.mesh);
    this.free = []; for (let i = DECOR.max - 1; i >= 0; i--) this.free.push(i);
    this.hi = 0;            // one past the highest slot ever used (mesh.count)
    this.open = new Map();  // building record R -> { R, slots: [], lv: [], m: [], cut }
    this.list = [];         // the same records, in an array: walked every frame without making an iterator
    this.cand = [];         // scratch: the buildings to dress this scan, nearest first
    this.t = 0;
    this.pal = {}; for (const [k, list] of Object.entries(DECOR.palettes)) this.pal[k] = list.map((c) => new THREE.Color(c));
    this.cols = new Map();  // '#rrggbb' -> Color (parsed once)
    this.counts = { dressed: 0, given: 0, short: 0 };
    for (let i = 0; i < DECOR.max; i++) this.zero(i);
  }

  zero(i) { _o.position.set(0, -200, 0); _o.rotation.set(0, 0, 0); _o.scale.set(0, 0, 0); _o.updateMatrix(); this.mesh.setMatrixAt(i, _o.matrix); }
  colour(col, x, z, i) {
    const P = this.pal[col];
    if (P) return P[Math.floor(hash(x, z, i + 1) * P.length) % P.length];
    let c = this.cols.get(col); if (!c) { c = new THREE.Color(col); this.cols.set(col, c); }
    return c;
  }

  // The parts of one piece box, in the world: fn(cx, cy, cz, sx, sy, sz, colour).
  // dy: how far the town was raised onto its pad (systems/citygen.js liftBuilt: what is drawn goes up, the collision
  // boxes stay measured from the ground).
  partsOf(b, fn, dy = 0) {
    const P = PIECES[b.piece];
    if (!P?.parts) return 0;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, dx = b.maxX - b.minX, dz = b.maxZ - b.minZ, y0 = (b.base ?? 0) + dy;
    const side = b.side ?? -1, alongX = side < 0 ? dx >= dz : side < 2, W = alongX ? dx : dz, D = alongX ? dz : dx;
    const out = side === 1 || side === 3 ? -1 : 1; // which way "into the room" points on the across axis
    let n = 0;
    for (let i = 0; i < P.parts.length; i++) {
      const [u, v, y, su, sv, sy, col] = P.parts[i];
      const x = alongX ? cx + u * W : cx + out * v * D, z = alongX ? cz + out * v * D : cz + u * W;
      fn(x, y0 + y + sy / 2, z, alongX ? su * W : sv * D, sy, alongX ? sv * D : su * W, this.colour(col, cx, cz, i));
      n++;
    }
    return n;
  }

  dress(R, dy = 0) {
    const floors = R.B.floorSolids;
    if (!floors) return false;
    let need = 0;
    for (const sol of floors) if (sol) for (const b of sol) if (b.piece) need += PIECES[b.piece]?.parts?.length ?? 0;
    if (!need) { const e = { R, slots: [], lv: [], cut: -1 }; this.open.set(R, e); this.list.push(e); return true; }
    if (this.free.length < need) { this.counts.short++; return false; }
    const rec = { R, slots: [], lv: [], cut: -2 };
    for (let k = 0; k < floors.length; k++) {
      const sol = floors[k]; if (!sol) continue;
      for (const b of sol) {
        if (!b.piece) continue;
        this.partsOf(b, (x, y, z, sx, sy, sz, c) => {
          const i = this.free.pop(); rec.slots.push(i); rec.lv.push(k);
          if (i >= this.hi) this.hi = i + 1;
          (rec.m ??= []).push(x, y, z, sx, sy, sz);
          this.mesh.setColorAt(i, c);
        }, dy);
      }
    }
    this.open.set(R, rec); this.list.push(rec);
    this.counts.dressed++;
    this.show(R, rec);
    this.mesh.count = this.hi; this.mesh.instanceColor.needsUpdate = true;
    return true;
  }

  // Draw a building's parts as its cutaway stands (systems/citygen.js hideAbove keeps R.cut: -1 everything, else the
  // highest level drawn).
  show(R, rec) {
    const cut = R.cut ?? -1;
    if (rec.cut === cut) return;
    rec.cut = cut;
    const m = rec.m; if (!m) return;
    for (let j = 0; j < rec.slots.length; j++) {
      const on = cut < 0 || rec.lv[j] <= cut, q = j * 6;
      _o.position.set(m[q], m[q + 1], m[q + 2]); _o.rotation.set(0, 0, 0);
      if (on) _o.scale.set(m[q + 3], m[q + 4], m[q + 5]); else _o.scale.set(0, 0, 0);
      _o.updateMatrix(); this.mesh.setMatrixAt(rec.slots[j], _o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  give(R) {
    const rec = this.open.get(R); if (!rec) return;
    for (const i of rec.slots) { this.zero(i); this.free.push(i); }
    if (rec.slots.length) this.mesh.instanceMatrix.needsUpdate = true;
    this.open.delete(R); const li = this.list.indexOf(rec); if (li >= 0) this.list.splice(li, 1); this.counts.given++;
  }

  update(dt) {
    this.t -= dt;
    const CG = this.g.citygen;
    if (!CG) return;
    // the cutaway follows you at once (a floor's detail must not hang in the air for half a second)
    const L = this.list;
    for (let i = 0; i < L.length; i++) if ((L[i].R.cut ?? -1) !== L[i].cut) this.show(L[i].R, L[i]);
    if (this.t > 0) return;
    this.t = DECOR.every;
    const P = this.g.player, px = P.x, pz = P.z, N2 = DECOR.near * DECOR.near, F2 = DECOR.far * DECOR.far;
    // given back: past DECOR.far from you, wherever in its town it stands (or its town is gone: forget() did that)
    for (let i = L.length - 1; i >= 0; i--) {
      const R = L[i].R, dx = Math.max(R.minX - px, 0, px - R.maxX), dz = Math.max(R.minZ - pz, 0, pz - R.maxZ);
      if (dx * dx + dz * dz > F2 || R.live === false) this.give(R);
    }
    // dressed: within DECOR.near, the nearest first (so when the pool is short it is the far ones that go without)
    const cand = this.cand; cand.length = 0;
    for (const t of CG.live.values()) {
      if (Math.abs(t.rec.x - px) > t.rec.half + DECOR.near || Math.abs(t.rec.z - pz) > t.rec.half + DECOR.near) continue;
      const dy = t.built.y0 ?? 0;
      for (const R of t.blds) {
        if (this.open.has(R)) continue;
        const dx = Math.max(R.minX - px, 0, px - R.maxX), dz = Math.max(R.minZ - pz, 0, pz - R.maxZ), d2 = dx * dx + dz * dz;
        if (d2 < N2) { R.live = true; R.d2 = d2; R.dy = dy; cand.push(R); }
      }
    }
    if (cand.length > 1) cand.sort(byD2);
    for (let i = 0; i < cand.length; i++) this.dress(cand[i], cand[i].dy);
    cand.length = 0;
  }

  // A town was taken down or rebuilt (systems/citygen.js release / remove): its buildings' detail goes back to the pool.
  forget(t) { for (const R of t.blds ?? []) { R.live = false; if (this.open.has(R)) this.give(R); } }

  view() {
    let parts = 0; for (const rec of this.open.values()) parts += rec.slots.length;
    return { buildings: this.open.size, parts, free: this.free.length, max: DECOR.max, counts: this.counts };
  }
}
