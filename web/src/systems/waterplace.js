import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_PLACES, FLOODED, FERRIES } from '../data/sealife.js';
import { EXT } from '../world/water.js';
import { StaticWorld } from '../engine/collision.js';

// WATER-PLACE (WEB_DEPTH_PLAN Wave 2; rows in data/sealife.js WATER_PLACES and FERRIES; docs/design/WEB_WATER_LIFE.md).
// Places in the water, resolved off a region's coast at run time: THE DEEP WATER (a leviathan's disc of dark sea), THE
// DROWNED BLOCKS (a beach town the sea took - its roofs and its water tower out of the swell, its walls in the boats'
// way), GULL KEY (a sand key with a ruined shack: dry ground in open water - depthAt answers 0 on it through EXT.dry).
// And the cable ferry that shuttles a river on its own, a deck you stand on while the current leans on it.
//
// A place's mesh is ONE merged mesh (vertex colours), built when you come within `near` metres and dropped when you leave;
// its walls go into statics.extra (the movers meet them; the island hash and the nav grids never see them).
const NEAR = 900, FAR = 1200;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const _c = new THREE.Color();
function box(w, h, d, x, y, z, hex, ry = 0, rx = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  _c.set(hex);
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const k = 0.92 + ((i * 7919) % 17) / 170; c[i * 3] = _c.r * k; c[i * 3 + 1] = _c.g * k; c[i * 3 + 2] = _c.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g;
}

export class WaterPlace {
  constructor(game) {
    this.g = game;
    game.waterplace = this;
    this.places = null;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.02 });
    this.ferries = [];
    this.enabled = true; // false: no ferry comes (the battery; its own check turns it on)
    this.dry = [];   // { x, z, r } discs of dry ground in the water (EXT.dry)
    EXT.dry = (x, z) => { for (const d of this.dry) { const dx = x - d.x, dz = z - d.z; if (dx * dx + dz * dz < d.r * d.r) return true; } return false; };
  }

  // The rows, placed on the coast (once the streamed world and its regions exist).
  resolve() {
    if (this.places) return this.places;
    const W = this.g.streamer?.W;
    if (!W?.holdouts) return null;
    const out = [];
    for (const row of WATER_PLACES) {
      const H = W.holdouts.find((h) => h.id === row.near);
      const R = H && Object.values(W.regions ?? {}).find((r) => r.inBox?.(H.cx, H.cz) && r.shoreAt);
      if (!H || !R) continue;
      const z = H.cz + row.dz, sh = R.shoreAt(z);
      if (!sh) continue;
      const x = row.off >= 0 ? sh.x + row.off : sh.x - sh.b + row.off;
      out.push({ ...row, x, z, built: null, boxes: null, mesh: null });
    }
    this.places = out;
    for (const p of out) if (p.kind === 'ruins') { this.dry.push({ x: p.x, z: p.z, r: p.r }); this.g.waves?.calm.push({ x: p.x, z: p.z, r: p.r + 30, ramp: 70 }); }
    this.g.waves?.syncCalm?.();
    return out;
  }
  byId(id) { return (this.resolve() ?? []).find((p) => p.id === id) ?? null; }

  // The leviathans: one in each of its waters while you are near it (systems/sealife.js asks every director tick).
  leviathans(sys) {
    const P = this.resolve();
    if (!P) return;
    const pl = this.g.player, px = pl.inVehicle?.x ?? pl.x, pz = pl.inVehicle?.z ?? pl.z;
    for (const p of P) {
      if (p.kind !== 'leviathan') continue;
      const near = Math.hypot(px - p.x, pz - p.z) < p.r + 600;
      const live = sys.live.find((a) => a.place === p);
      if (near && !live && sys.spawning) {
        // Somewhere in its water you cannot see (it is deep anyway: a faint shape at most).
        for (let k = 0; k < 10; k++) {
          const an = Math.random() * Math.PI * 2, r = Math.random() * p.r * 0.7, x = p.x + Math.sin(an) * r, z = p.z + Math.cos(an) * r;
          if (sys.inView(x, z) || sys.depth(x, z) < 6) continue;
          sys.spawn(p.species, x, z, { place: p, hx: p.x, hz: p.z, r: p.r });
          break;
        }
      } else if (!near && live && !sys.inView(live.x, live.z, 0)) sys.remove(live);
    }
  }

  // ---- building the places -----------------------------------------------------------------------------------------
  build(p) {
    const parts = [], boxes = [], R = rng(p.seed ?? 1);
    if (p.kind === 'flooded') {
      // Lots along a drowned street grid: walls out of the sea, flat roofs, dark window bands; a water tower over it all.
      const F = FLOODED, st = F.street;
      for (let gx = -p.w / 2 + st; gx < p.w / 2 - 6; gx += F.size[1] + st) for (let gz = -p.d / 2 + st; gz < p.d / 2 - 6; gz += F.size[1] + st * 0.6) {
        if (R() < 0.18) continue; // a gap: a lot the sea took to the slab
        const w = F.size[0] + R() * (F.size[1] - F.size[0]), d = F.size[0] + R() * (F.size[1] - F.size[0]), h = F.height[0] + R() * (F.height[1] - F.height[0]);
        const cx = p.x + gx + w / 2, cz = p.z + gz + d / 2, base = -6, wall = F.colour[Math.floor(R() * F.colour.length)], roof = F.roof[Math.floor(R() * F.roof.length)];
        parts.push(box(w, h - base, d, cx, (h + base) / 2, cz, wall));
        parts.push(box(w + 0.3, 0.35, d + 0.3, cx, h + 0.17, cz, roof));
        // Window bands: the storeys above the water.
        for (let y = 1.6; y < h - 1; y += 3.1) for (const s of [-1, 1]) {
          parts.push(box(w * 0.86, 1.1, 0.12, cx, y, cz + s * (d / 2 + 0.05), '#1f2422'));
          parts.push(box(0.12, 1.1, d * 0.8, cx + s * (w / 2 + 0.05), y, cz, '#1f2422'));
        }
        if (R() < 0.4) parts.push(box(1.6, 1.4, 1.6, cx - w * 0.25, h + 0.9, cz + d * 0.2, '#5d5a52')); // a roof shed / an AC box
        if (R() < 0.25) parts.push(box(w * 0.5, 0.1, d * 0.4, cx, h + 0.4, cz, '#2e4a3a')); // a tarp, a green roof garden gone wild
        boxes.push(StaticWorld.box(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 'wall', h - base, base));
      }
      if (FLOODED.tower) {
        const tx = p.x - p.w * 0.1, tz = p.z + p.d * 0.05;
        for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) parts.push(box(0.35, 22, 0.35, tx + ox, 5, tz + oz, '#5a5650'));
        const tank = new THREE.CylinderGeometry(4.2, 4.2, 5.5, 14).toNonIndexed(); tank.translate(tx, 18, tz);
        _c.set('#8f8a7c'); const n = tank.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = _c.r; c[i * 3 + 1] = _c.g; c[i * 3 + 2] = _c.b; }
        tank.setAttribute('color', new THREE.BufferAttribute(c, 3)); tank.deleteAttribute('uv'); parts.push(tank);
        const cap = new THREE.ConeGeometry(4.5, 2.2, 14).toNonIndexed(); cap.translate(tx, 21.8, tz);
        _c.set('#6c5a48'); const n2 = cap.attributes.position.count, c2 = new Float32Array(n2 * 3); for (let i = 0; i < n2; i++) { c2[i * 3] = _c.r; c2[i * 3 + 1] = _c.g; c2[i * 3 + 2] = _c.b; }
        cap.setAttribute('color', new THREE.BufferAttribute(c2, 3)); cap.deleteAttribute('uv'); parts.push(cap);
        boxes.push(StaticWorld.box(tx - 2.3, tz - 2.3, tx + 2.3, tz + 2.3, 'tower', 22, -6));
      }
    } else if (p.kind === 'ruins') {
      // A sand key: a low mound, wet sand round its foot, the shell of a bait shack, a fallen mast, wreck boards.
      const r = p.r;
      const mound = new THREE.CylinderGeometry(r * 0.92, r * 1.12, 2.2, 56, 1).toNonIndexed(); mound.translate(p.x, -0.98, p.z);
      const n = mound.attributes.position.count, c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const y = mound.attributes.position.getY(i); _c.set(y > 0 ? '#8c7a5a' : '#5e523d'); c[i * 3] = _c.r; c[i * 3 + 1] = _c.g; c[i * 3 + 2] = _c.b; }
      mound.setAttribute('color', new THREE.BufferAttribute(c, 3)); mound.deleteAttribute('uv'); parts.push(mound);
      for (let k = 0; k < 9; k++) { const a = R() * Math.PI * 2, d = R() * r * 0.75; parts.push(box(1 + R() * 2.5, 0.25 + R() * 0.4, 0.8 + R() * 1.2, p.x + Math.sin(a) * d, 0.3, p.z + Math.cos(a) * d, R() < 0.5 ? '#9b8f78' : '#6f6455', R() * 3)); }
      const sx = p.x + r * 0.15, sz = p.z - r * 0.1, W = 8, D = 6, H = 2.8;
      for (const [w, d, ox, oz] of [[W, 0.3, 0, -D / 2], [W * 0.55, 0.3, -W * 0.22, D / 2], [0.3, D, -W / 2, 0], [0.3, D * 0.6, W / 2, -D * 0.2]]) {
        parts.push(box(w, H * (0.6 + R() * 0.4), d, sx + ox, H * 0.4 + 0.12, sz + oz, '#a59b86'));
        boxes.push(StaticWorld.box(sx + ox - w / 2, sz + oz - d / 2, sx + ox + w / 2, sz + oz + d / 2, 'wall', H, 0));
      }
      parts.push(box(W * 0.5, 0.15, D * 0.4, sx + 1, 0.2, sz + 0.5, '#4f4438', 0.3)); // a fallen roof sheet
      parts.push(box(0.35, 0.35, 18, p.x - r * 0.3, 0.5, p.z + r * 0.3, '#6a6660', 0.8, 0, 0.05)); // the radio mast, down across the sand
      boxes.push(StaticWorld.box(p.x - r * 0.3 - 0.5, p.z + r * 0.3 - 6, p.x - r * 0.3 + 0.5, p.z + r * 0.3 + 6, 'mast', 0.9, 0));
    }
    const m = new THREE.Mesh(mergeGeometries(parts), this.mat);
    m.castShadow = true; m.receiveShadow = true; m.name = `waterplace:${p.id}`;
    this.g.scene.add(m);
    for (const b of boxes) this.g.statics.extra.push(b);
    p.mesh = m; p.boxes = boxes; p.built = true;
    this.g.emit?.('waterplaceBuilt', { id: p.id, kind: p.kind, boxes: boxes.length });
  }
  unbuild(p) {
    if (!p.built) return;
    this.g.scene.remove(p.mesh); p.mesh.geometry.dispose();
    const ex = this.g.statics.extra;
    for (const b of p.boxes) { const i = ex.indexOf(b); if (i >= 0) ex.splice(i, 1); }
    p.mesh = null; p.boxes = null; p.built = null;
  }

  // ---- ferries ----------------------------------------------------------------------------------------------------------
  ferryStep(F, dt) {
    const g = this.g, p = g.player;
    const ax = F.a[0], az = F.a[1], bx = F.b[0], bz = F.b[1], mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const near = Math.hypot(p.x - mx, p.z - mz) < 350;
    if (!F.v || !g.vehicles.includes(F.v) || F.v.dead || F.v.sunk) {
      F.v = null;
      if (!near) return;
      const r = g.vehiclesSys.spawn?.('ferry', ax, az, Math.atan2(bx - ax, bz - az));
      if (!r) return;
      F.v = r; F.v.ferry = F; F.leg = 1; F.wait = F.row.wait; F.trips = 0;
    }
    const v = F.v;
    if (!near && !v.deckRiders?.length) { g.vehiclesSys.remove(v); F.v = null; return; }
    if (v.driver) return; // someone took the wheel: it is theirs to pole
    const tx = F.leg ? bx : ax, tz = F.leg ? bz : az, d = Math.hypot(tx - v.x, tz - v.z);
    const cur = g.waves?.currentAt(v.x, v.z, F.cur ??= {}) ?? { vx: 0, vz: 0 };
    v.h = Math.atan2(bx - ax, bz - az);
    if (F.wait > 0) { F.wait -= dt; v.vx = -cur.vx; v.vz = -cur.vz; return; } // the cable holds it at the landing
    if (d < 0.6) { F.leg = 1 - F.leg; F.wait = F.row.wait; F.trips++; g.emit?.('ferryLanding', { id: F.row.id, at: F.leg ? 'a' : 'b', trips: F.trips }); return; }
    const sp = Math.min(F.row.speed, d * 0.8 + 0.3);
    v.vx = ((tx - v.x) / d) * sp - cur.vx; v.vz = ((tz - v.z) / d) * sp - cur.vz; // the cable: the current never moves it off its line
  }

  update(dt) {
    const P = this.resolve(), pl = this.g.player, px = pl.inVehicle?.x ?? pl.x, pz = pl.inVehicle?.z ?? pl.z;
    if (P) for (const p of P) {
      if (p.kind === 'leviathan') continue;
      const d = Math.hypot(px - p.x, pz - p.z);
      if (!p.built && d < NEAR) this.build(p);
      else if (p.built && d > FAR) this.unbuild(p);
    }
    if (!this.ferries.length && FERRIES.length) this.ferries = FERRIES.map((row) => ({ row, a: row.a, b: row.b, v: null, leg: 1, wait: 0, trips: 0 }));
    if (this.enabled) for (const F of this.ferries) this.ferryStep(F, dt);
  }

  summary() {
    return { places: (this.places ?? []).map((p) => ({ id: p.id, kind: p.kind, name: p.name, x: Math.round(p.x), z: Math.round(p.z), r: p.r, built: !!p.built, walls: p.boxes?.length ?? 0 })),
      ferries: this.ferries.map((F) => ({ id: F.row.id, vehicle: F.v?.id ?? null, at: F.v ? [+F.v.x.toFixed(1), +F.v.z.toFixed(1)] : null, leg: F.leg ? 'to b' : 'to a', wait: +Math.max(0, F.wait).toFixed(1), trips: F.trips, riders: F.v?.deckRiders?.length ?? 0 })),
      dry: this.dry.length };
  }
}
