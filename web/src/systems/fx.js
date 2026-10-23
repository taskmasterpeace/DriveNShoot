import * as THREE from 'three';
import { splatTexture, radialGlow } from '../world/textures.js';

// Blood, sparks, smoke, decals, tracers and muzzle lights.
// Everything is a fixed-size InstancedMesh ring buffer: no allocation after boot.

const P_MAX = 2400, D_MAX = 1200, T_MAX = 128, LIGHTS = 4;
const _o = new THREE.Object3D();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class FX {
  constructor(scene) {
    this.scene = scene;
    // --- particles (struct-of-arrays) ---
    this.p = {
      x: new Float32Array(P_MAX), y: new Float32Array(P_MAX), z: new Float32Array(P_MAX),
      vx: new Float32Array(P_MAX), vy: new Float32Array(P_MAX), vz: new Float32Array(P_MAX),
      life: new Float32Array(P_MAX), max: new Float32Array(P_MAX), size: new Float32Array(P_MAX),
      grav: new Float32Array(P_MAX), kind: new Uint8Array(P_MAX), grow: new Float32Array(P_MAX),
    };
    this.pNext = 0;
    this.pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), P_MAX);
    this.pMesh.frustumCulled = false;
    for (let i = 0; i < P_MAX; i++) { this.pMesh.setMatrixAt(i, ZERO); this.pMesh.setColorAt(i, _c.set(0, 0, 0)); }
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.pMesh);
    this.pDirty = false;
    this.active = new Uint8Array(P_MAX);

    // Smoke / dust puffs: soft round sprites (never solid cubes). Same index space as particles.
    const softGeo = new THREE.PlaneGeometry(1, 1); softGeo.rotateX(-Math.PI / 2);
    this.softMesh = new THREE.InstancedMesh(softGeo, new THREE.MeshLambertMaterial({ map: radialGlow(), transparent: true, depthWrite: false, opacity: 0.55 }), P_MAX);
    this.softMesh.frustumCulled = false;
    for (let i = 0; i < P_MAX; i++) { this.softMesh.setMatrixAt(i, ZERO); this.softMesh.setColorAt(i, _c.set(0, 0, 0)); }
    this.softMesh.renderOrder = 4;
    // Flames: soft additive glows (never cubes). Same index space as particles.
    this.flameMesh = new THREE.InstancedMesh(softGeo, new THREE.MeshBasicMaterial({ map: radialGlow(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), P_MAX);
    this.flameMesh.frustumCulled = false;
    for (let i = 0; i < P_MAX; i++) { this.flameMesh.setMatrixAt(i, ZERO); this.flameMesh.setColorAt(i, _c.set(0, 0, 0)); }
    this.flameMesh.renderOrder = 5;
    scene.add(this.flameMesh);
    scene.add(this.softMesh);
    // --- decals: blood pools, splats, skid marks, scorch ---
    const dGeo = new THREE.PlaneGeometry(1, 1); dGeo.rotateX(-Math.PI / 2);
    this.dMesh = new THREE.InstancedMesh(dGeo, new THREE.MeshLambertMaterial({
      map: splatTexture(5), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }), D_MAX);
    this.dMesh.frustumCulled = false;
    this.dMesh.receiveShadow = true;
    for (let i = 0; i < D_MAX; i++) { this.dMesh.setMatrixAt(i, ZERO); this.dMesh.setColorAt(i, _c.set(0, 0, 0)); }
    scene.add(this.dMesh);
    this.dNext = 0;
    // Which decals are blood, when they were laid (systems/blood.js's game-hour clock) and their fresh colour: blood.js
    // dries them darker over game hours and rain washes the outdoor ones away.
    this.dBlood = new Uint8Array(D_MAX); this.dBorn = new Float32Array(D_MAX); this.dRGB = new Float32Array(D_MAX * 3);
    this.dSize = new Float32Array(D_MAX); this.clock = 0;
    this.growing = []; // {i,x,z,rot,cur,target,y}
    this.pools = [];   // {x,z,r}
    // Skids use a plain quad (no splat shape).
    this.sMesh = new THREE.InstancedMesh(dGeo, new THREE.MeshLambertMaterial({ color: '#111', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), 900);
    this.sMesh.frustumCulled = false;
    for (let i = 0; i < 900; i++) this.sMesh.setMatrixAt(i, ZERO);
    scene.add(this.sMesh);
    this.sNext = 0;

    // --- tracers ---
    this.tMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), T_MAX);
    this.tMesh.frustumCulled = false;
    for (let i = 0; i < T_MAX; i++) this.tMesh.setMatrixAt(i, ZERO);
    scene.add(this.tMesh);
    this.tracers = Array.from({ length: T_MAX }, () => ({ life: 0, ax: 0, az: 0, bx: 0, bz: 0, y: 0, w: 0.06 }));
    this.tNext = 0;

    // --- flash sprites (muzzle / explosion) ---
    this.fMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialGlow(), color: '#ffcf7a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 48);
    this.fMesh.frustumCulled = false;
    for (let i = 0; i < 48; i++) this.fMesh.setMatrixAt(i, ZERO);
    scene.add(this.fMesh);
    this.flashes = Array.from({ length: 48 }, () => ({ life: 0, max: 0, x: 0, y: 0, z: 0, s: 1 }));
    this.fNext = 0;

    // --- dynamic point lights: fixed count so shaders never recompile ---
    this.lights = [];
    for (let i = 0; i < LIGHTS; i++) {
      const l = new THREE.PointLight('#ffb35a', 0, 18, 1.6);
      l.position.set(0, -100, 0);
      scene.add(l);
      this.lights.push({ l, life: 0, max: 1, power: 0 });
    }
    this.lNext = 0;
  }

  // kind: 0 blood, 1 spark, 2 smoke, 3 debris, 4 fire, 5 gib
  spawn(kind, x, y, z, vx, vy, vz, life, size, color, grav = 22) {
    const p = this.p, i = this.pNext;
    this.pNext = (i + 1) % P_MAX;
    p.x[i] = x; p.y[i] = y; p.z[i] = z; p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
    p.life[i] = life; p.max[i] = life; p.size[i] = size; p.grav[i] = grav; p.kind[i] = kind;
    p.grow[i] = kind === 2 ? 1.8 : 0;
    this.active[i] = 1;
    if (kind === 2) {
      this.softMesh.setColorAt(i, _c.set(color)); this.softMesh.instanceColor.needsUpdate = true;
      this.pMesh.setMatrixAt(i, ZERO); this.flameMesh.setMatrixAt(i, ZERO);
    } else if (kind === 4) {
      this.flameMesh.setColorAt(i, _c.set(color)); this.flameMesh.instanceColor.needsUpdate = true;
      this.pMesh.setMatrixAt(i, ZERO); this.softMesh.setMatrixAt(i, ZERO);
    } else {
      this.pMesh.setColorAt(i, _c.set(color)); this.pMesh.instanceColor.needsUpdate = true;
      this.softMesh.setMatrixAt(i, ZERO); this.flameMesh.setMatrixAt(i, ZERO);
    }
  }

  // Directional blood spray from a wound. dir is the bullet direction.
  bloodSpray(x, y, z, dx, dz, amount = 12, force = 1) {
    for (let k = 0; k < amount; k++) {
      const sp = (4 + Math.random() * 9) * force;
      const ax = dx + (Math.random() - 0.5) * 0.9, az = dz + (Math.random() - 0.5) * 0.9;
      this.spawn(0, x, y, z, ax * sp, Math.random() * 5 + 1, az * sp, 1.2, 0.07 + Math.random() * 0.1,
        Math.random() < 0.5 ? '#8a0b0b' : '#5c0505');
    }
    // Exit splatter on the ground behind the target.
    const d = 1 + Math.random() * 2.2;
    this.decal(x + dx * d, z + dz * d, 0.7 + Math.random() * 1.1, '#6a0606');
  }

  gibs(x, z, dx = 0, dz = 0, n = 10) {
    for (let k = 0; k < n; k++) {
      this.spawn(5, x, 1, z, dx * 8 + (Math.random() - 0.5) * 12, 4 + Math.random() * 8, dz * 8 + (Math.random() - 0.5) * 12, 3, 0.18 + Math.random() * 0.22,
        Math.random() < 0.6 ? '#6e0d0d' : '#a33a2a');
    }
    this.bloodSpray(x, 1, z, dx, dz, 40, 1.6);
    this.pool(x, z, 3.6);
  }

  sparks(x, y, z, nx, nz, n = 6) {
    for (let k = 0; k < n; k++)
      this.spawn(1, x, y, z, nx * 6 + (Math.random() - 0.5) * 7, Math.random() * 5, nz * 6 + (Math.random() - 0.5) * 7, 0.25 + Math.random() * 0.2, 0.05, '#ffd060', 14);
    this.spawn(2, x, y, z, nx * 1.5, 1.2, nz * 1.5, 0.7, 0.35, '#8b7d6a', -0.5);
  }

  smoke(x, y, z, dark = true) {
    this.spawn(2, x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), (Math.random() - 0.5) * 1.5, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5,
      1.6 + Math.random(), 0.6 + Math.random() * 0.5, dark ? '#2b2724' : '#9a8b78', -0.6);
  }

  dust(x, z, n = 1) {
    for (let k = 0; k < n; k++)
      this.spawn(2, x + (Math.random() - 0.5) * 1.2, 0.3, z + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2,
        0.9 + Math.random() * 0.6, 0.6 + Math.random() * 0.6, '#a48462', -0.4);
  }

  explosion(x, z) {
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2, s = 6 + Math.random() * 16;
      this.spawn(4, x, 1, z, Math.cos(a) * s, 3 + Math.random() * 10, Math.sin(a) * s, 0.5 + Math.random() * 0.6, 0.25 + Math.random() * 0.3, Math.random() < 0.5 ? '#ffb030' : '#ff5a1a', 8);
    }
    for (let k = 0; k < 18; k++) this.smoke(x, 1.5, z, true);
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2, s = 5 + Math.random() * 12;
      this.spawn(3, x, 1, z, Math.cos(a) * s, 6 + Math.random() * 10, Math.sin(a) * s, 2.5, 0.25 + Math.random() * 0.35, '#2a2724');
    }
    this.flash(x, 2, z, 14, 0.35);
    this.light(x, 3, z, '#ff9a3a', 60, 0.6);
    if (this.scorch) this.scorch(x, z, 7.5, '#151210'); // a soft burn (systems/blood.js), not an ink splat
    else this.decal(x, z, 7, '#151210', Math.random() * 6, 0.12);
  }

  decal(x, z, size, color, rot = Math.random() * Math.PI * 2, y = 0.13) {
    const i = this.dNext;
    this.dNext = (i + 1) % D_MAX;
    _o.position.set(x, y + (i % 7) * 0.002, z); _o.rotation.set(0, rot, 0); _o.scale.set(size, 1, size); _o.updateMatrix();
    this.dMesh.setMatrixAt(i, _o.matrix);
    this.dMesh.setColorAt(i, _c.set(color));
    this.markDecal(i, size);
    this.dMesh.instanceMatrix.needsUpdate = true;
    this.dMesh.instanceColor.needsUpdate = true;
    return i;
  }

  // Bookkeeping for drying (systems/blood.js): a decal whose colour (in _c) is blood red is blood.
  markDecal(i, size) {
    const blood = _c.r > 0.02 && _c.r > _c.g * 4 && _c.r > _c.b * 4;
    this.dBlood[i] = blood ? 1 : 0;
    if (blood) { this.dBorn[i] = this.clock; this.dRGB[i * 3] = _c.r; this.dRGB[i * 3 + 1] = _c.g; this.dRGB[i * 3 + 2] = _c.b; this.dSize[i] = size; }
  }

  // A pool that keeps spreading under a body for a few seconds.
  // Recent pools, for bloody footprints.
  inPool(x, z) {
    for (const p of this.pools) if ((p.x - x) ** 2 + (p.z - z) ** 2 < p.r * p.r) return true;
    return false;
  }

  footprint(x, z, rot, strength = 1) {
    const i = this.dNext;
    this.dNext = (i + 1) % D_MAX;
    _o.position.set(x, 0.135 + (i % 7) * 0.002, z); _o.rotation.set(0, rot, 0); _o.scale.set(0.16, 1, 0.32); _o.updateMatrix();
    this.dMesh.setMatrixAt(i, _o.matrix);
    this.dMesh.setColorAt(i, _c.set('#5a0606').multiplyScalar(0.6 + strength * 0.4));
    this.markDecal(i, 0.32);
    this.dMesh.instanceMatrix.needsUpdate = true;
    this.dMesh.instanceColor.needsUpdate = true;
  }

  pool(x, z, target = 2.6) {
    this.pools.push({ x, z, r: target * 0.4 });
    if (this.pools.length > 64) this.pools.shift();
    const i = this.decal(x, z, 0.3, '#4e0303');
    this.growing.push({ i, x, z, rot: Math.random() * 6, cur: 0.3, target, y: 0.14 + (i % 7) * 0.002 });
    if (this.growing.length > 40) this.growing.shift();
  }

  skid(x, z, rot) {
    const i = this.sNext;
    this.sNext = (i + 1) % 900;
    _o.position.set(x, 0.1, z); _o.rotation.set(0, rot, 0); _o.scale.set(0.32, 1, 0.9); _o.updateMatrix();
    this.sMesh.setMatrixAt(i, _o.matrix);
    this.sMesh.instanceMatrix.needsUpdate = true;
  }

  tracer(ax, az, bx, bz, y = 1.3, w = 0.06) {
    const t = this.tracers[this.tNext];
    this.tNext = (this.tNext + 1) % T_MAX;
    t.life = 0.06; t.ax = ax; t.az = az; t.bx = bx; t.bz = bz; t.y = y; t.w = w;
  }

  flash(x, y, z, s, life = 0.05) {
    const f = this.flashes[this.fNext];
    this.fNext = (this.fNext + 1) % 48;
    f.life = life; f.max = life; f.x = x; f.y = y; f.z = z; f.s = s;
  }

  light(x, y, z, color, power, life) {
    const L = this.lights[this.lNext];
    this.lNext = (this.lNext + 1) % LIGHTS;
    L.l.position.set(x, y, z); L.l.color.set(color); L.power = power; L.life = life; L.max = life;
  }

  update(dt) {
    const p = this.p;
    const m = this.pMesh;
    for (let i = 0; i < P_MAX; i++) {
      if (!this.active[i]) continue;
      p.life[i] -= dt;
      if (p.life[i] <= 0) {
        this.active[i] = 0;
        m.setMatrixAt(i, ZERO);
        this.softMesh.setMatrixAt(i, ZERO); this.flameMesh.setMatrixAt(i, ZERO);
        // Blood that lands leaves a drop.
        continue;
      }
      p.vy[i] -= p.grav[i] * dt;
      p.x[i] += p.vx[i] * dt; p.y[i] += p.vy[i] * dt; p.z[i] += p.vz[i] * dt;
      if (p.y[i] < 0.08) {
        if (p.kind[i] === 0) {
          // Blood droplet hits the ground: small stain, then dies.
          if (Math.random() < 0.35) this.decal(p.x[i], p.z[i], 0.18 + Math.random() * 0.3, '#5a0606');
          p.life[i] = 0; this.active[i] = 0; m.setMatrixAt(i, ZERO); continue;
        }
        p.y[i] = 0.08; p.vy[i] *= -0.25; p.vx[i] *= 0.6; p.vz[i] *= 0.6;
        if (p.kind[i] === 5 && Math.abs(p.vy[i]) < 1 && Math.random() < 0.08) this.decal(p.x[i], p.z[i], 0.4, '#5a0606');
      }
      if (p.kind[i] === 2) { p.vx[i] *= 0.98; p.vz[i] *= 0.98; }
      const t = p.life[i] / p.max[i];
      let s = p.size[i];
      if (p.kind[i] === 4) {
        // Flame tongue: flares up, then shrinks and fades as it rises.
        const fs = s * 3.2 * Math.sin(Math.PI * Math.min(1, (1 - t) * 1.2 + 0.05));
        _o.position.set(p.x[i], p.y[i], p.z[i]); _o.rotation.set(0, i * 1.7, 0); _o.scale.set(fs, 1, fs); _o.updateMatrix();
        this.flameMesh.setMatrixAt(i, _o.matrix);
        continue;
      }
      if (p.kind[i] === 2) {
        // Puff grows then thins out at the end of its life.
        s *= (1 + (1 - t) * p.grow[i] * 1.6) * 2.2 * Math.min(1, t * 3);
        _o.position.set(p.x[i], p.y[i], p.z[i]); _o.rotation.set(0, i, 0); _o.scale.set(s, 1, s); _o.updateMatrix();
        this.softMesh.setMatrixAt(i, _o.matrix);
        continue;
      }
      else if (p.kind[i] === 1 || p.kind[i] === 4) s *= t;
      _o.position.set(p.x[i], p.y[i], p.z[i]);
      _o.rotation.set(p.vx[i] * 0.3, p.life[i] * 6, 0);
      _o.scale.set(s, s, s);
      _o.updateMatrix();
      m.setMatrixAt(i, _o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    this.softMesh.instanceMatrix.needsUpdate = true;
    this.flameMesh.instanceMatrix.needsUpdate = true;

    // Growing pools.
    if (this.growing.length) {
      for (let k = this.growing.length - 1; k >= 0; k--) {
        const g = this.growing[k];
        g.cur += (g.target - g.cur) * dt * 0.45;
        _o.position.set(g.x, g.y, g.z); _o.rotation.set(0, g.rot, 0); _o.scale.set(g.cur, 1, g.cur); _o.updateMatrix();
        this.dMesh.setMatrixAt(g.i, _o.matrix);
        if (g.target - g.cur < 0.02) this.growing.splice(k, 1);
      }
      this.dMesh.instanceMatrix.needsUpdate = true;
    }

    // Tracers.
    for (let i = 0; i < T_MAX; i++) {
      const t = this.tracers[i];
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { this.tMesh.setMatrixAt(i, ZERO); continue; }
      const dx = t.bx - t.ax, dz = t.bz - t.az, len = Math.hypot(dx, dz);
      _o.position.set((t.ax + t.bx) / 2, t.y, (t.az + t.bz) / 2);
      _o.rotation.set(0, Math.atan2(dx, dz), 0);
      _o.scale.set(t.w, t.w, len);
      _o.updateMatrix();
      this.tMesh.setMatrixAt(i, _o.matrix);
    }
    this.tMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < 48; i++) {
      const f = this.flashes[i];
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { this.fMesh.setMatrixAt(i, ZERO); continue; }
      const s = f.s * (0.6 + 0.4 * (f.life / f.max));
      _o.position.set(f.x, f.y, f.z); _o.rotation.set(0, Math.random() * 6, 0); _o.scale.set(s, 1, s); _o.updateMatrix();
      this.fMesh.setMatrixAt(i, _o.matrix);
    }
    this.fMesh.instanceMatrix.needsUpdate = true;

    for (const L of this.lights) {
      if (L.life <= 0) { L.l.intensity = 0; continue; }
      L.life -= dt;
      L.l.intensity = Math.max(0, L.power * (L.life / L.max));
    }
  }
}
