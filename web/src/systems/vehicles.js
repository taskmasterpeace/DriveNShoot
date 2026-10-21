import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { coneTexture, radialGlow } from '../world/textures.js';
import { roadLines, SPACING, GRID } from '../world/city.js';
import { clamp, angleLerp } from '../engine/rng.js';

// Each vehicle is ONE merged, vertex-coloured mesh (+1 for lights): ~2 draw calls per car.
export const VEHICLES = {
  rig:         { name: 'WAR RIG', len: 7.6, wid: 2.7, maxSpeed: 30, accel: 13, turn: 1.5, grip: 5, mass: 4, hp: 450, harpoon: true, armor: 0.1 },
  interceptor: { name: 'INTERCEPTOR', len: 4.6, wid: 2.0, maxSpeed: 46, accel: 22, turn: 2.4, grip: 6.5, mass: 1.4, hp: 180, armor: 0.3 },
  buggy:       { name: 'DUNE BUGGY', len: 3.6, wid: 1.9, maxSpeed: 40, accel: 26, turn: 2.9, grip: 5.2, mass: 1, hp: 110, armor: 0.45 },
  pickup:      { name: 'PICKUP', len: 5.0, wid: 2.2, maxSpeed: 36, accel: 17, turn: 2.1, grip: 6, mass: 1.8, hp: 220, armor: 0.28 },
};

function coloredBox(sx, sy, sz, x, y, z, color, rotX = 0) {
  // Chunky parts get bevelled edges so silhouettes read as vehicles, not crates.
  const m = Math.min(sx, sy, sz);
  let g = m > 0.3 ? new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(0.14, m * 0.22)) : new THREE.BoxGeometry(sx, sy, sz);
  if (g.index) g = g.toNonIndexed();
  if (rotX) g.rotateX(rotX);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function buildBody(type, paint) {
  const s = VEHICLES[type];
  const L = s.len, W = s.wid;
  const parts = [];
  const wheel = '#141312';
  const wheelAt = (x, y, z, r = 0.46) => {
    let t = new THREE.CylinderGeometry(r, r, 0.38, 14).rotateZ(Math.PI / 2).translate(x, y, z).toNonIndexed();
    let h = new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.4, 8).rotateZ(Math.PI / 2).translate(x, y, z).toNonIndexed();
    const tint = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    parts.push(tint(t, wheel), tint(h, '#6a645c'));
  };
  const wheels = (y, inset, front, back) => {
    for (const zz of [front, back]) for (const xx of [-1, 1]) wheelAt(xx * (W / 2 - inset), y, zz);
  };
  if (type === 'rig') {
    parts.push(coloredBox(W, 1.5, 3.0, 0, 1.6, L / 2 - 1.5, paint));          // cab
    parts.push(coloredBox(W - 0.3, 0.9, 1.9, 0, 2.7, L / 2 - 1.8, '#2a3a44'));  // cab glass
    parts.push(coloredBox(W + 0.2, 0.4, 0.4, 0, 0.9, L / 2 + 0.1, '#5a5550'));  // ram bar
    for (let i = -2; i <= 2; i++) parts.push(coloredBox(0.15, 0.15, 0.8, i * 0.5, 0.9, L / 2 + 0.5, '#8a8580')); // spikes
    parts.push(coloredBox(W, 0.6, L - 3.2, 0, 1.2, -1.4, '#3b3632'));          // flatbed
    parts.push(coloredBox(W, 0.9, 0.2, 0, 1.9, -L / 2 + 0.2, '#4a3a2a'));
    parts.push(coloredBox(0.2, 0.9, L - 3.4, -W / 2 + 0.1, 1.9, -1.4, '#4a3a2a'));
    parts.push(coloredBox(0.2, 0.9, L - 3.4, W / 2 - 0.1, 1.9, -1.4, '#4a3a2a'));
    parts.push(coloredBox(1.1, 0.9, 1.1, 0, 2.1, -1.8, '#2d2a28'));             // harpoon turret base
    parts.push(coloredBox(0.3, 0.3, 2.4, 0, 2.7, -1.4, '#6a6560'));             // harpoon barrel
    parts.push(coloredBox(0.8, 0.8, 0.8, -0.7, 1.9, -3.2, '#7a3a1c'));           // fuel drums
    parts.push(coloredBox(0.8, 0.8, 0.8, 0.7, 1.9, -3.2, '#7a3a1c'));
    wheels(0.55, 0.15, L / 2 - 1.2, -L / 2 + 1.4);
    wheelAt(-W / 2 + 0.15, 0.55, -L / 2 + 2.6); wheelAt(W / 2 - 0.15, 0.55, -L / 2 + 2.6);
  } else if (type === 'buggy') {
    parts.push(coloredBox(W - 0.4, 0.5, L - 0.6, 0, 0.75, 0, paint));
    parts.push(coloredBox(0.12, 1.1, 0.12, -0.7, 1.5, 0.3, '#2a2a2a'));
    parts.push(coloredBox(0.12, 1.1, 0.12, 0.7, 1.5, 0.3, '#2a2a2a'));
    parts.push(coloredBox(0.12, 1.1, 0.12, -0.7, 1.5, -0.9, '#2a2a2a'));
    parts.push(coloredBox(0.12, 1.1, 0.12, 0.7, 1.5, -0.9, '#2a2a2a'));
    parts.push(coloredBox(1.6, 0.12, 1.4, 0, 2.05, -0.3, '#2a2a2a'));
    parts.push(coloredBox(1.2, 0.6, 0.8, 0, 1.0, -L / 2 + 0.5, '#3a3632'));  // engine
    wheels(0.5, 0.0, L / 2 - 0.7, -L / 2 + 0.7);
  } else {
    const cabZ = type === 'pickup' ? 0.5 : -0.2;
    const cabL = type === 'pickup' ? 1.8 : 2.2;
    parts.push(coloredBox(W, 0.8, L, 0, 0.85, 0, paint));
    parts.push(coloredBox(W - 0.25, 0.65, cabL, 0, 1.55, cabZ, '#2a3a44'));
    parts.push(coloredBox(W - 0.35, 0.08, cabL - 0.4, 0, 1.9, cabZ, paint));
    if (type === 'pickup') parts.push(coloredBox(W - 0.2, 0.3, 1.8, 0, 1.35, -L / 2 + 1.0, '#3a3530'));
    if (type === 'interceptor') {
      parts.push(coloredBox(0.6, 0.35, 1.0, 0, 1.4, L / 2 - 1.0, '#6a6560')); // blower
      parts.push(coloredBox(W + 0.1, 0.2, 0.3, 0, 1.0, -L / 2 + 0.1, '#222'));
    }
    wheels(0.45, 0.05, L / 2 - 0.9, -L / 2 + 0.9);
  }
  // Headlights / taillights as small boxes in the body.
  parts.push(coloredBox(0.35, 0.18, 0.08, -W / 2 + 0.35, 1.0, L / 2 + 0.02, '#fff6d8'));
  parts.push(coloredBox(0.35, 0.18, 0.08, W / 2 - 0.35, 1.0, L / 2 + 0.02, '#fff6d8'));
  parts.push(coloredBox(0.35, 0.16, 0.08, -W / 2 + 0.3, 1.0, -L / 2 - 0.02, '#b01010'));
  parts.push(coloredBox(0.35, 0.16, 0.08, W / 2 - 0.3, 1.0, -L / 2 - 0.02, '#b01010'));
  return mergeGeometries(parts);
}

const _v = new THREE.Vector3();

export class Vehicles {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35 });
    this.wreckMat = new THREE.MeshStandardMaterial({ color: '#1a1714', roughness: 1 });
    this.coneMat = new THREE.MeshBasicMaterial({ map: coneTexture(), color: '#fff1cc', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    this.tailMat = new THREE.MeshBasicMaterial({ map: radialGlow(), color: '#ff2a1a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    this.tmp = { x: 0, z: 0 };
    // Harpoon rope.
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.rope = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: '#d8d0c0' }));
    this.rope.frustumCulled = false;
    this.rope.visible = false;
    game.scene.add(this.rope);
    this.harpoon = null; // { from, x, z, dx, dz, dist, target, kind, len, state }
    const hg = new THREE.BoxGeometry(0.18, 0.18, 1.2);
    this.harpoonMesh = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ color: '#9a9590', metalness: 0.8, roughness: 0.3 }));
    this.harpoonMesh.visible = false;
    game.scene.add(this.harpoonMesh);
  }

  spawn(type, x, z, h, paint = '#6a2a1a', opts = {}) {
    const s = VEHICLES[type];
    const geo = buildBody(type, paint);
    const mesh = new THREE.Mesh(geo, this.bodyMat.clone()); // own material: paint chars with damage
    mesh.castShadow = true; mesh.receiveShadow = true;
    // Light cones: two headlight cones + taillight glow, one merged mesh.
    const cones = [];
    for (const sx of [-1, 1]) {
      const c = new THREE.PlaneGeometry(9, 22);
      c.rotateX(-Math.PI / 2);
      c.translate(sx * (s.wid / 2 - 0.4), 0.15, s.len / 2 + 10.5);
      cones.push(c);
    }
    const coneMesh = new THREE.Mesh(mergeGeometries(cones), this.coneMat);
    coneMesh.renderOrder = 3;
    const tails = [];
    for (const sx of [-1, 1]) {
      const t = new THREE.PlaneGeometry(2.2, 2.2);
      t.rotateX(-Math.PI / 2);
      t.translate(sx * (s.wid / 2 - 0.3), 0.2, -s.len / 2 - 0.6);
      tails.push(t);
    }
    const tailMesh = new THREE.Mesh(mergeGeometries(tails), this.tailMat);
    tailMesh.renderOrder = 3;
    const group = new THREE.Group();
    group.add(mesh, coneMesh, tailMesh);
    this.g.scene.add(group);
    const v = {
      type, ...s, x, z, h, vx: 0, vz: 0, av: 0, hp: s.hp, maxHp: s.hp, group, mesh, coneMesh, tailMesh,
      driver: null, ai: opts.ai ?? null, dead: false, steer: 0, throttle: 0, brake: 0, handbrake: false,
      skidT: 0, burn: 0, node: null, lights: true, paint, honk: 0, impact: 0,
    };
    v.id = `v${this.list.length + 1}`;
    this.list.push(v);
    this.g.vehicles = this.list;
    return v;
  }

  speed(v) { return Math.hypot(v.vx, v.vz); }

  // Collision discs along the body's long axis (reused scratch array per vehicle).
  discs(v) {
    const n = Math.max(2, Math.round(v.len / v.wid) + 1), r = v.wid * 0.52;
    const fx = Math.sin(v.h), fz = Math.cos(v.h), span = v.len - r * 2;
    v._discs ??= Array.from({ length: n }, () => ({ x: 0, z: 0, r }));
    for (let k = 0; k < n; k++) { const o = (k / (n - 1) - 0.5) * span; const d = v._discs[k]; d.x = v.x + fx * o; d.z = v.z + fz * o; d.r = r; }
    return v._discs;
  }

  damage(v, amt, attacker) {
    if (v.dead || v.onFire) return;
    v.hp -= amt;
    if (v.driver === this.g.player) {
      // Aggregate per attacker so the log stays readable.
      const k = attacker?.id ?? 'impact';
      v.dmgLog ??= {}; v.dmgLog[k] = (v.dmgLog[k] ?? 0) + amt;
    }
    if (v.driver && attacker && v.driver !== this.g.player) this.g.ai.onDamaged(v.driver, attacker);
    if (v.hp <= 0) {
      // Catches fire first: a few seconds to bail out before it blows.
      v.hp = 0; v.onFire = 4; v.fireBy = attacker;
      if (v.driver === this.g.player) this.g.hud.toast('VEHICLE ON FIRE — BAIL OUT [F]', 'hot');
      if (v.driver && v.driver !== this.g.player) { const d = v.driver; d.inVehicle = null; v.driver = null; d.x = v.x + 2.5; d.z = v.z; d.flee = 4; d.fleeX = v.x; d.fleeZ = v.z; }
    }
  }

  explode(v, attacker) {
    const g = this.g;
    v.dead = true; v.hp = 0;
    v.mesh.material = this.wreckMat;
    v.coneMesh.visible = false; v.tailMesh.visible = false;
    v.burn = 25;
    g.fx.explosion(v.x, v.z);
    g.audio.explosion(Math.hypot(v.x - g.player.x, v.z - g.player.z));
    g.hud.shake(1.2);
    // Blast: hurt everyone close, throw the driver out dead.
    for (const c of g.chars) {
      if (!c.alive) continue;
      const cx = c.inVehicle ? c.inVehicle.x : c.x, cz = c.inVehicle ? c.inVehicle.z : c.z;
      const d = Math.hypot(cx - v.x, cz - v.z);
      if (c.inVehicle === v) {
        if (c === g.player) g.exitVehicle(true);
        else { c.inVehicle = null; c.x = v.x + 2; c.z = v.z; }
        g.combat.damage(c, 999, attacker, 1, 0, 'explosion');
      } else if (d < 7 && !c.inVehicle) {
        g.combat.damage(c, 120 * (1 - d / 7), attacker, (cx - v.x) / (d || 1), (cz - v.z) / (d || 1), 'explosion');
      }
    }
    v.driver = null;
    v.vx *= 0.3; v.vz *= 0.3;
    v.av = (Math.random() - 0.5) * 4;
    for (const o of this.list) {
      if (o === v || o.dead) continue;
      const d = Math.hypot(o.x - v.x, o.z - v.z);
      if (d < 9) this.damage(o, 60 * (1 - d / 9), attacker);
    }
  }

  // ---- driving model -----------------------------------------------------------
  drive(v, dt) {
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    const rx = fz, rz = -fx;
    let fwd = v.vx * fx + v.vz * fz;
    let side = v.vx * rx + v.vz * rz;
    const sp = Math.abs(fwd);
    if (!v.dead && v.driver) {
      if (v.throttle > 0) fwd += v.accel * v.throttle * dt * (1 - clamp(fwd / v.maxSpeed, 0, 1) * 0.85);
      else if (v.throttle < 0) fwd += (fwd > 0.5 ? -v.accel * 2.2 : -v.accel * 0.6) * -v.throttle * dt;
      if (fwd < -v.maxSpeed * 0.35) fwd = -v.maxSpeed * 0.35;
      // Steering bites with speed, softens at top speed.
      const steerAmt = v.steer * v.turn * clamp(sp / 7, 0, 1) * (1 - clamp(sp / v.maxSpeed, 0, 1) * 0.35);
      v.av = angleLerp(v.av, steerAmt * Math.sign(fwd || 1), Math.min(1, dt * 10));
    } else {
      v.av *= Math.exp(-dt * 2);
    }
    v.h += v.av * dt;
    // Rolling drag and lateral grip (handbrake = drift).
    const grip = v.handbrake ? v.grip * 0.18 : v.grip;
    fwd *= Math.exp(-dt * (v.driver && !v.dead ? (v.handbrake ? 1.2 : 0.18) : 1.4));
    side *= Math.exp(-dt * grip);
    const nfx = Math.sin(v.h), nfz = Math.cos(v.h);
    v.vx = nfx * fwd + nfz * side;
    v.vz = nfz * fwd - nfx * side;
    v.x += v.vx * dt; v.z += v.vz * dt;

    // Skid marks + dust when sliding.
    v.skidT -= dt;
    if ((Math.abs(side) > 4.5 || (v.handbrake && sp > 6)) && v.skidT <= 0) {
      v.skidT = 0.035;
      for (const s of [-1, 1]) this.g.fx.skid(v.x - nfx * v.len * 0.35 + nfz * s * v.wid * 0.4, v.z - nfz * v.len * 0.35 - nfx * s * v.wid * 0.4, v.h);
      if (Math.random() < 0.5) this.g.fx.dust(v.x - nfx * v.len * 0.4, v.z - nfz * v.len * 0.4, 1);
      if (v.driver === this.g.player) this.g.audio.skid(Math.abs(side) / 10);
    }
    return { fwd, side };
  }

  collide(v, dt) {
    const g = this.g;
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    const r = v.wid * 0.55;
    const pre = this.speed(v);
    let hitN = 0;
    const n = Math.max(2, Math.round(v.len / v.wid));
    for (let k = 0; k < n; k++) {
      const off = (k / (n - 1) - 0.5) * (v.len - r * 1.6);
      const t = this.tmp;
      t.x = v.x + fx * off; t.z = v.z + fz * off;
      const ox = t.x, oz = t.z;
      if (g.statics.resolveCircle(t, r) > 0) {
        const dx = t.x - ox, dz = t.z - oz;
        v.x += dx; v.z += dz;
        const d = Math.hypot(dx, dz) || 1;
        const nx = dx / d, nz = dz / d;
        const vn = v.vx * nx + v.vz * nz;
        if (vn < 0) { v.vx -= vn * nx * 1.35; v.vz -= vn * nz * 1.35; hitN = Math.max(hitN, -vn); }
        // Glancing hits spin the car.
        v.av += (off > 0 ? 1 : -1) * (nx * fz - nz * fx) * Math.min(3, -vn * 0.08);
      }
    }
    if (hitN > 8) {
      this.damage(v, (hitN - 8) * 2.2 / v.mass * 2, null);
      g.fx.sparks(v.x + fx * v.len * 0.5, 0.8, v.z + fz * v.len * 0.5, -fx, -fz, 8);
      if (v.driver === g.player) { g.hud.shake(Math.min(1, hitN / 25)); g.audio.crash(hitN / 30); }
    }
    // Vehicle vs vehicle: each body is a chain of discs along its length (a long rig is
    // 3-4 discs, a buggy 2), so cars can't slide into the side of a truck.
    for (const o of this.list) {
      if (o === v) continue;
      const reach = (v.len + o.len) * 0.5 + 1;
      if (Math.abs(o.x - v.x) > reach || Math.abs(o.z - v.z) > reach) continue;
      const vd = this.discs(v), od = this.discs(o);
      let best = null;
      for (const a of vd) for (const b of od) {
        const dx = b.x - a.x, dz = b.z - a.z, min = a.r + b.r, d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), pen = min - d;
        if (!best || pen > best.pen) best = { pen, nx: dx / d, nz: dz / d, px: (a.x + b.x) / 2, pz: (a.z + b.z) / 2 };
      }
      if (!best) continue;
      const { pen, nx, nz } = best;
      const tm = v.mass + o.mass;
      v.x -= nx * pen * (o.mass / tm); v.z -= nz * pen * (o.mass / tm);
      o.x += nx * pen * (v.mass / tm); o.z += nz * pen * (v.mass / tm);
      const rv = (o.vx - v.vx) * nx + (o.vz - v.vz) * nz;
      if (rv < 0) {
        const j = -1.4 * rv / (1 / v.mass + 1 / o.mass);
        v.vx -= (j / v.mass) * nx; v.vz -= (j / v.mass) * nz;
        o.vx += (j / o.mass) * nx; o.vz += (j / o.mass) * nz;
        // Off-centre hits spin the car that got hit.
        const lever = (best.px - o.x) * Math.cos(o.h) - (best.pz - o.z) * Math.sin(o.h);
        o.av += lever * -rv * 0.08 / o.mass + (Math.random() - 0.5) * -rv * 0.1 / o.mass;
        if (-rv > 6) {
          this.damage(o, -rv * 1.6 * (v.mass / o.mass), v.driver);
          this.damage(v, -rv * 1.6 * (o.mass / v.mass), o.driver);
          g.fx.sparks(best.px, 1, best.pz, nx, nz, 10);
          if (v.driver === g.player || o.driver === g.player) { g.hud.shake(Math.min(1, -rv / 20)); g.audio.crash(-rv / 25); }
        }
      }
    }
    // Run people over.
    const sp = this.speed(v);
    for (const c of g.chars) {
      if (!c.alive || c.inVehicle || c.dragged || c.grabbing) continue;
      const dx = c.x - v.x, dz = c.z - v.z;
      if (Math.abs(dx) > v.len || Math.abs(dz) > v.len) continue;
      const along = dx * fx + dz * fz, across = dx * fz - dz * fx;
      if (Math.abs(along) < v.len / 2 + 0.3 && Math.abs(across) < v.wid / 2 + 0.3) {
        if (sp > 6) {
          const dn = sp || 1;
          g.combat.damage(c, sp * 7, v.driver, v.vx / dn, v.vz / dn, 'vehicle');
          if (v.driver === g.player) g.hud.shake(0.25);
        }
        // Shove out sideways.
        const push = v.wid / 2 + 0.35 - Math.abs(across);
        const s = across >= 0 ? 1 : -1;
        c.x += fz * push * s; c.z += -fx * push * s;
        if (!c.alive) { c.x += v.vx * dt; c.z += v.vz * dt; }
      }
    }
    v.impact = pre - this.speed(v);
  }

  // ---- traffic AI: follow the road grid lane by lane ---------------------------------
  pickNode(v) {
    // Snap to nearest intersection then choose a neighbour that isn't straight back.
    const snap = (val) => clamp(Math.round((val + GRID) / SPACING), 0, roadLines.length - 1);
    const i = snap(v.x), j = snap(v.z);
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => {
      const ni = i + a, nj = j + b;
      if (ni < 0 || nj < 0 || ni >= roadLines.length || nj >= roadLines.length) return false;
      if (v.from && v.from[0] === ni && v.from[1] === nj) return false;
      return true;
    });
    const [a, b] = opts[Math.floor(Math.random() * opts.length)];
    v.from = [i, j];
    v.node = [i + a, j + b];
  }

  aiDrive(v, dt) {
    const g = this.g;
    if (v.ai === 'traffic') {
      if (!v.node) this.pickNode(v);
      const tx0 = roadLines[v.node[0]], tz0 = roadLines[v.node[1]];
      const fx0 = roadLines[v.from[0]], fz0 = roadLines[v.from[1]];
      const dx = Math.sign(tx0 - fx0), dz = Math.sign(tz0 - fz0);
      // Drive on the right: lane offset perpendicular to travel.
      const tx = tx0 - dz * 3.5, tz = tz0 + dx * 3.5;
      const want = Math.atan2(tx - v.x, tz - v.z);
      const d = Math.hypot(tx - v.x, tz - v.z);
      if (d < 6) { this.pickNode(v); }
      const diff = angleLerp(v.h, want, 1) - v.h;
      v.steer = clamp(diff * 2.2, -1, 1);
      let target = 13 * (Math.abs(diff) > 0.5 ? 0.45 : 1);
      // Brake for anything ahead.
      const fx = Math.sin(v.h), fz = Math.cos(v.h);
      for (const o of this.list) {
        if (o === v) continue;
        const ox = o.x - v.x, oz = o.z - v.z;
        const along = ox * fx + oz * fz, across = Math.abs(ox * fz - oz * fx);
        if (along > 0 && along < 12 && across < 3) target = Math.min(target, Math.max(0, along - 6));
      }
      // Brake (and honk) for anyone on foot in the lane ahead — never run townsfolk over.
      for (const c of g.chars) {
        if (!c.alive || c.inVehicle) continue;
        const ox = c.x - v.x, oz = c.z - v.z;
        if (Math.abs(ox) > 14 || Math.abs(oz) > 14) continue;
        const along = ox * fx + oz * fz, across = Math.abs(ox * fz - oz * fx);
        if (along > 0 && along < 11 && across < v.wid * 0.5 + 1.2) {
          target = 0;
          v.honk -= dt;
          if (v.honk <= 0) { g.audio.horn(Math.hypot(c.x - g.player.x, c.z - g.player.z)); v.honk = 2.5; }
        }
      }
      const sp = this.speed(v);
      v.throttle = sp < target ? 0.7 : sp > target + 2 ? -0.6 : 0;
      v.handbrake = false;
    } else if (v.ai === 'raider') {
      // Hunt the player's vehicle; ram it.
      const p = g.player;
      const px = p.inVehicle ? p.inVehicle.x : p.x, pz = p.inVehicle ? p.inVehicle.z : p.z;
      const d = Math.hypot(px - v.x, pz - v.z);
      if (d > 140) { v.throttle = 0; return; }
      const lead = p.inVehicle ? 0.5 : 0;
      const tx = px + (p.inVehicle ? p.inVehicle.vx * lead : 0), tz = pz + (p.inVehicle ? p.inVehicle.vz * lead : 0);
      const want = Math.atan2(tx - v.x, tz - v.z);
      const diff = angleLerp(v.h, want, 1) - v.h;
      v.steer = clamp(diff * 2.5, -1, 1);
      v.throttle = d < 8 && !p.inVehicle ? 0.3 : 1;
      v.handbrake = Math.abs(diff) > 1.2 && this.speed(v) > 12;
      // Passenger takes shots when lined up.
      if (v.driver && v.driver.weapon && d < 30) {
        v.driver.cool -= dt;
        if (v.driver.cool <= 0 && g.statics.lineOfSight(v.x, v.z, px, pz)) {
          v.driver.cool = 0.35 + Math.random() * 0.5;
          // Drive-by: fire from the window. firingFrom makes the shot ignore this car;
          // keep our own reference — the shot can set v.driver to null (fire, explosion).
          g.carCombat.fireFromVehicle(v.driver, v, 'smg', want + (Math.random() - 0.5) * 0.25);
        }
      }
    }
  }

  // ---- harpoon -------------------------------------------------------------------------
  fireHarpoon(v, ang) {
    if (this.harpoon) {
      if (this.harpoon.state === 'attached') this.yank();
      return;
    }
    const ox = v.x - Math.sin(v.h) * 1.4, oz = v.z - Math.cos(v.h) * 1.4;
    this.harpoon = { from: v, x: ox, z: oz, dx: Math.sin(ang), dz: Math.cos(ang), dist: 0, target: null, kind: null, state: 'flying', len: 0 };
    this.g.audio.harpoon();
    this.g.hud.shake(0.3);
  }

  yank() {
    const h = this.harpoon;
    const g = this.g;
    const v = h.from;
    if (h.kind === 'veh') {
      const t = h.target;
      // Rip it sideways: violent lateral impulse + spin. Lighter targets fly.
      const dx = v.x - t.x, dz = v.z - t.z, d = Math.hypot(dx, dz) || 1;
      const perpX = -dz / d, perpZ = dx / d;
      const side = (t.vx * perpX + t.vz * perpZ) >= 0 ? 1 : -1;
      const k = 26 / t.mass;
      t.vx += (dx / d) * k * 0.7 + perpX * side * k; t.vz += (dz / d) * k * 0.7 + perpZ * side * k;
      t.av += side * 7 / t.mass;
      this.damage(t, 45, g.player);
      g.fx.sparks(t.x, 1, t.z, dx / d, dz / d, 16);
      g.hud.toast('YANKED!', 'hot');
    } else if (h.kind === 'char') {
      const c = h.target;
      if (c.alive) g.combat.damage(c, 999, g.player, (v.x - c.x) / 10, (v.z - c.z) / 10, 'explosion');
      g.fx.gibs(c.x, c.z, 0, 0, 12);
      c.dragged = null;
    }
    g.audio.yank();
    g.hud.shake(0.8);
    this.releaseHarpoon();
  }

  releaseHarpoon() {
    if (this.harpoon?.kind === 'char' && this.harpoon.target) this.harpoon.target.dragged = null;
    this.harpoon = null;
    this.rope.visible = false;
    this.harpoonMesh.visible = false;
  }

  updateHarpoon(dt) {
    const h = this.harpoon;
    if (!h) return;
    const g = this.g;
    const v = h.from;
    if (v.dead || v.driver !== g.player) { this.releaseHarpoon(); return; }
    const ax = v.x - Math.sin(v.h) * 1.4, az = v.z - Math.cos(v.h) * 1.4;
    let bx, bz;
    if (h.state === 'flying') {
      const step = 95 * dt;
      // Check walls, vehicles, people along this step.
      const wallT = g.statics.raycast(h.x, h.z, h.dx, h.dz, step);
      let hit = null, kind = null, best = wallT;
      for (const o of this.list) {
        if (o === v) continue;
        const d = Math.hypot(o.x - (h.x + h.dx * step * 0.5), o.z - (h.z + h.dz * step * 0.5));
        if (d < o.len * 0.55 + step * 0.5) { hit = o; kind = 'veh'; best = 0; break; }
      }
      if (!hit) for (const c of g.chars) {
        if (!c.alive || c.inVehicle || c === g.player) continue;
        const d = Math.hypot(c.x - (h.x + h.dx * step * 0.5), c.z - (h.z + h.dz * step * 0.5));
        if (d < 0.8 + step * 0.5) { hit = c; kind = 'char'; best = 0; break; }
      }
      if (hit) {
        h.state = 'attached'; h.target = hit; h.kind = kind;
        h.len = Math.max(6, Math.hypot(hit.x - ax, hit.z - az));
        if (kind === 'char') {
          hit.dragged = h; g.combat.damage(hit, 55, g.player, h.dx, h.dz, 'bullet');
          g.hud.toast(`HARPOONED ${hit.name ?? 'RAIDER'}`, 'hot');
        } else {
          this.damage(hit, 20, g.player);
          g.fx.sparks(hit.x, 1.2, hit.z, -h.dx, -h.dz, 12);
          g.hud.toast('HOOKED — [H] TO YANK', 'hot');
          if (hit.driver && hit.driver !== g.player) g.ai.onDamaged(hit.driver, g.player);
        }
        g.audio.clank();
      } else if (wallT < step) {
        h.x += h.dx * wallT; h.z += h.dz * wallT;
        g.fx.sparks(h.x, 1.2, h.z, -h.dx, -h.dz, 8);
        g.audio.clank();
        h.state = 'retract';
      } else {
        h.x += h.dx * step; h.z += h.dz * step; h.dist += step;
        if (h.dist > 48) h.state = 'retract';
      }
      bx = h.x; bz = h.z;
    } else if (h.state === 'retract') {
      const dx = ax - h.x, dz = az - h.z, d = Math.hypot(dx, dz);
      if (d < 2) { this.releaseHarpoon(); return; }
      h.x += (dx / d) * 70 * dt; h.z += (dz / d) * 70 * dt;
      bx = h.x; bz = h.z;
    } else {
      const t = h.target;
      bx = t.x; bz = t.z;
      const dx = t.x - ax, dz = t.z - az, d = Math.hypot(dx, dz) || 1;
      if (h.kind === 'veh') {
        if (t.dead && d > h.len * 1.8) { this.releaseHarpoon(); return; }
        if (d > h.len) {
          // Rope goes taut: pull both, mostly the lighter one.
          const nx = dx / d, nz = dz / d;
          const rel = (t.vx - v.vx) * nx + (t.vz - v.vz) * nz;
          const tm = v.mass + t.mass;
          if (rel > 0) {
            t.vx -= nx * rel * (v.mass / tm); t.vz -= nz * rel * (v.mass / tm);
            v.vx += nx * rel * (t.mass / tm); v.vz += nz * rel * (t.mass / tm);
          }
          const pen = d - h.len;
          t.x -= nx * pen * (v.mass / tm); t.z -= nz * pen * (v.mass / tm);
          v.x += nx * pen * (t.mass / tm); v.z += nz * pen * (t.mass / tm);
          // Towed car fishtails.
          t.av += (Math.random() - 0.5) * 0.6;
          if (pen > 4) { g.fx.sparks(ax, 1.5, az, nx, nz, 3); this.releaseHarpoon(); g.hud.toast('CABLE SNAPPED', 'warn'); return; }
        }
      } else {
        // Dragging a body: leave a blood trail.
        if (d > h.len) {
          const nx = dx / d, nz = dz / d;
          t.x = ax + nx * h.len; t.z = az + nz * h.len;
          if (Math.random() < 0.6) g.fx.decal(t.x, t.z, 0.6 + Math.random() * 0.6, '#5a0505', Math.atan2(nx, nz));
          if (t.alive && Math.random() < dt * 2) g.combat.damage(t, 8, g.player, nx, nz);
          t.face = Math.atan2(-nx, -nz);
        }
      }
    }
    const p = this.rope.geometry.attributes.position.array;
    p[0] = ax; p[1] = 2.6; p[2] = az; p[3] = bx; p[4] = 1.2; p[5] = bz;
    this.rope.geometry.attributes.position.needsUpdate = true;
    this.rope.visible = true;
    if (h.state !== 'attached') {
      this.harpoonMesh.visible = true;
      this.harpoonMesh.position.set(bx, 1.4, bz);
      this.harpoonMesh.rotation.set(0, Math.atan2(h.dx, h.dz), 0);
    } else this.harpoonMesh.visible = false;
  }

  update(dt, night) {
    const g = this.g;
    this.coneMat.opacity = 0.04 + night * 0.62;
    this.tailMat.opacity = 0.2 + night * 0.7;
    for (const v of this.list) {
      if (v.driver && v.driver !== g.player && !v.dead) this.aiDrive(v, dt);
      if (!v.driver) { v.throttle = 0; v.steer = 0; }
      this.drive(v, dt);
      this.collide(v, dt);
      if (v.driver && v.driver !== g.player) { v.driver.x = v.x; v.driver.z = v.z; }
      const lit = !!v.driver && !v.dead;
      v.coneMesh.visible = lit; v.tailMesh.visible = lit || v.throttle < 0;
      // Paint chars and darkens as the vehicle is damaged.
      if (!v.dead) { const dmg = 1 - v.hp / v.maxHp; v.mesh.material.color.setRGB(1 - dmg * 0.6, 1 - dmg * 0.65, 1 - dmg * 0.7); }
      v.group.position.set(v.x, 0, v.z);
      v.group.rotation.y = v.h;
      if (v.onFire) {
        v.onFire -= dt;
        if (Math.random() < dt * 30) this.g.fx.spawn(4, v.x + (Math.random() - 0.5) * v.wid, 1.4, v.z + (Math.random() - 0.5) * v.len * 0.6, 0, 3, 0, 0.45, 0.3, '#ff7a1a', -1);
        if (v.onFire <= 0) { v.onFire = 0; this.explode(v, v.fireBy); }
      }
      // Damaged cars smoke; wrecks burn.
      if (!v.dead && v.hp < v.maxHp * 0.35 && Math.random() < dt * 8) g.fx.smoke(v.x + Math.sin(v.h) * v.len * 0.35, 1.4, v.z + Math.cos(v.h) * v.len * 0.35, true);
      if (v.burn > 0) {
        v.burn -= dt;
        if (Math.random() < dt * 20) g.fx.spawn(4, v.x + (Math.random() - 0.5) * v.wid, 1.5, v.z + (Math.random() - 0.5) * v.len * 0.6, 0, 3 + Math.random() * 2, 0, 0.5, 0.35, Math.random() < 0.5 ? '#ff9a2a' : '#ff5a1a', -1);
        if (Math.random() < dt * 6) g.fx.smoke(v.x, 2, v.z, true);
      }
    }
    this.updateHarpoon(dt);
  }
}
