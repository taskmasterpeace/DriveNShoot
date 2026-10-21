import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { coneTexture, radialGlow } from '../world/textures.js';
import { roadLines, SPACING, GRID } from '../world/city.js';
import { clamp, angleLerp } from '../engine/rng.js';

// Each vehicle is ONE merged, vertex-coloured mesh (+1 for lights): ~2 draw calls per car.
// Seats: the driver is always seat 0. side = driver's left/right (left = local +x),
// row 0 = front. exposed seats (bike pillion, pickup bed) render their rider and
// can be shot / grabbed directly.
const S2 = [{ id: 'driver', side: 'left', row: 0 }, { id: 'shotgun', side: 'right', row: 0 }];
const S4 = [...S2, { id: 'backL', side: 'left', row: 1 }, { id: 'backR', side: 'right', row: 1 }];
export const VEHICLES = {
  rig:         { name: 'WAR RIG', len: 7.6, wid: 2.7, maxSpeed: 30, accel: 13, turn: 1.5, grip: 5, mass: 4, hp: 450, harpoon: true, armor: 0.1, fuelCap: 160, seats: S2 },
  interceptor: { name: 'INTERCEPTOR', len: 4.6, wid: 2.0, maxSpeed: 46, accel: 22, turn: 2.4, grip: 6.5, mass: 1.4, hp: 180, armor: 0.3, fuelCap: 60, seats: S2 },
  buggy:       { name: 'DUNE BUGGY', len: 3.6, wid: 1.9, maxSpeed: 40, accel: 26, turn: 2.9, grip: 5.2, mass: 1, hp: 110, armor: 0.45, fuelCap: 35, open: true, seats: S2 },
  pickup:      { name: 'PICKUP', len: 5.0, wid: 2.2, maxSpeed: 36, accel: 17, turn: 2.1, grip: 6, mass: 1.8, hp: 220, armor: 0.28, fuelCap: 80,
                 seats: [...S2, { id: 'bedL', side: 'left', row: 2, exposed: 'stand' }, { id: 'bedR', side: 'right', row: 2, exposed: 'stand' }] },
  sedan:       { name: 'SEDAN', len: 4.8, wid: 2.0, maxSpeed: 40, accel: 18, turn: 2.2, grip: 6.2, mass: 1.5, hp: 170, armor: 0.32, fuelCap: 55, seats: S4 },
  van:         { name: 'VAN', len: 5.4, wid: 2.25, maxSpeed: 32, accel: 14, turn: 1.8, grip: 5.6, mass: 2.2, hp: 240, armor: 0.26, fuelCap: 75,
                 seats: [...S4, { id: 'rearL', side: 'left', row: 2 }, { id: 'rearR', side: 'right', row: 2 }] },
  bike:        { name: 'MOTORCYCLE', len: 2.15, wid: 0.8, maxSpeed: 52, accel: 30, turn: 3.0, grip: 6.4, mass: 0.45, hp: 70, armor: 0.6, fuelCap: 18, open: true, bike: true,
                 seats: [{ id: 'driver', side: 'left', row: 0, exposed: 'bike' }, { id: 'pillion', side: 'right', row: 1, exposed: 'bike' }] },
};

// Part ids baked into a per-vertex attribute so damage can dent / drop exact pieces.
export const PART = { body: 0, bumperF: 1, bumperR: 2, doorL: 3, doorR: 4, doorL2: 5, doorR2: 6, hood: 7, glass: 8, wheelFL: 10, wheelFR: 11, wheelRL: 12, wheelRR: 13, light: 14, frame: 15 };

function coloredBox(sx, sy, sz, x, y, z, color, part = PART.body, rotX = 0) {
  // Chunky parts get bevelled edges so silhouettes read as vehicles, not crates.
  const m = Math.min(sx, sy, sz);
  let g = m > 0.3 ? new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(0.14, m * 0.22)) : new THREE.BoxGeometry(sx, sy, sz);
  if (g.index) g = g.toNonIndexed();
  if (rotX) g.rotateX(rotX);
  g.translate(x, y, z);
  return tag(g, color, part);
}

function tag(g, color, part) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3), pa = new Float32Array(n);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; pa[i] = part; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.setAttribute('part', new THREE.BufferAttribute(pa, 1));
  return g;
}

function buildBody(type, paint) {
  const s = VEHICLES[type] ?? VEHICLES.interceptor;
  const base = s.base ?? type; // content-pack vehicles reuse a stock body
  const L = s.len, W = s.wid;
  const parts = [];
  const wheel = '#141312';
  // Wheels: tyre + hub, tagged per corner so a flat tyre can visibly sag.
  const wheelAt = (x, y, z, r = 0.46, part = PART.wheelFL, w = 0.38) => {
    const t = new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2).translate(x, y, z).toNonIndexed();
    const h = new THREE.CylinderGeometry(r * 0.45, r * 0.45, w + 0.02, 8).rotateZ(Math.PI / 2).translate(x, y, z).toNonIndexed();
    parts.push(tag(t, wheel, part), tag(h, '#6a645c', part));
  };
  const wheels = (y, inset, front, back, r) => {
    wheelAt(W / 2 - inset, y, front, r, PART.wheelFL); wheelAt(-W / 2 + inset, y, front, r, PART.wheelFR);
    wheelAt(W / 2 - inset, y, back, r, PART.wheelRL); wheelAt(-W / 2 + inset, y, back, r, PART.wheelRR);
  };
  const bumpers = (y = 0.7, h = 0.28) => {
    parts.push(coloredBox(W + 0.06, h, 0.26, 0, y, L / 2 + 0.04, '#2e2c2a', PART.bumperF));
    parts.push(coloredBox(W + 0.06, h, 0.26, 0, y, -L / 2 - 0.04, '#2e2c2a', PART.bumperR));
  };
  const door = (side, z, len, part, y = 1.0, h = 0.62) => {
    // side: +1 = driver's left (local +x)
    parts.push(coloredBox(0.08, h, len, side * (W / 2 + 0.02), y, z, paint, part));
    parts.push(coloredBox(0.05, 0.05, 0.2, side * (W / 2 + 0.07), y + 0.08, z - len * 0.25, '#8a8580', part)); // handle
  };

  if (base === 'rig') {
    parts.push(coloredBox(W, 1.5, 3.0, 0, 1.6, L / 2 - 1.5, paint));
    parts.push(coloredBox(W - 0.3, 0.9, 1.9, 0, 2.7, L / 2 - 1.8, '#2a3a44', PART.glass));
    parts.push(coloredBox(W + 0.2, 0.4, 0.4, 0, 0.9, L / 2 + 0.1, '#5a5550', PART.bumperF));
    for (let i = -2; i <= 2; i++) parts.push(coloredBox(0.15, 0.15, 0.8, i * 0.5, 0.9, L / 2 + 0.5, '#8a8580', PART.bumperF));
    parts.push(coloredBox(W, 0.6, L - 3.2, 0, 1.2, -1.4, '#3b3632'));
    parts.push(coloredBox(W, 0.9, 0.2, 0, 1.9, -L / 2 + 0.2, '#4a3a2a', PART.bumperR));
    parts.push(coloredBox(0.2, 0.9, L - 3.4, -W / 2 + 0.1, 1.9, -1.4, '#4a3a2a'));
    parts.push(coloredBox(0.2, 0.9, L - 3.4, W / 2 - 0.1, 1.9, -1.4, '#4a3a2a'));
    parts.push(coloredBox(1.1, 0.9, 1.1, 0, 2.1, -1.8, '#2d2a28'));
    parts.push(coloredBox(0.3, 0.3, 2.4, 0, 2.7, -1.4, '#6a6560'));
    parts.push(coloredBox(0.8, 0.8, 0.8, -0.7, 1.9, -3.2, '#7a3a1c'));
    parts.push(coloredBox(0.8, 0.8, 0.8, 0.7, 1.9, -3.2, '#7a3a1c'));
    door(1, L / 2 - 1.6, 1.3, PART.doorL, 1.6, 1.0); door(-1, L / 2 - 1.6, 1.3, PART.doorR, 1.6, 1.0);
    wheels(0.55, 0.15, L / 2 - 1.2, -L / 2 + 1.4, 0.55);
    wheelAt(W / 2 - 0.15, 0.55, -L / 2 + 2.6, 0.55, PART.wheelRL); wheelAt(-W / 2 + 0.15, 0.55, -L / 2 + 2.6, 0.55, PART.wheelRR);
  } else if (base === 'buggy') {
    parts.push(coloredBox(W - 0.4, 0.5, L - 0.6, 0, 0.75, 0, paint));
    for (const [x, z] of [[-0.7, 0.3], [0.7, 0.3], [-0.7, -0.9], [0.7, -0.9]]) parts.push(coloredBox(0.12, 1.1, 0.12, x, 1.5, z, '#2a2a2a', PART.frame));
    parts.push(coloredBox(1.6, 0.12, 1.4, 0, 2.05, -0.3, '#2a2a2a', PART.frame));
    parts.push(coloredBox(1.2, 0.6, 0.8, 0, 1.0, -L / 2 + 0.5, '#3a3632'));
    parts.push(coloredBox(0.5, 0.5, 0.5, 0.45, 1.05, 0.0, '#1d1b19')); // seats
    parts.push(coloredBox(0.5, 0.5, 0.5, -0.45, 1.05, 0.0, '#1d1b19'));
    wheels(0.5, 0.0, L / 2 - 0.7, -L / 2 + 0.7, 0.5);
    bumpers(0.6, 0.22);
  } else if (base === 'bike') {
    // Motorcycle: wheels in line, frame, tank, saddle, bars, exhaust.
    wheelAt(0, 0.38, L / 2 - 0.38, 0.38, PART.wheelFL, 0.16);
    wheelAt(0, 0.38, -L / 2 + 0.38, 0.38, PART.wheelRL, 0.2);
    parts.push(coloredBox(0.16, 0.16, L - 0.7, 0, 0.62, 0, '#2a2826', PART.frame));
    parts.push(coloredBox(0.42, 0.3, 0.6, 0, 0.92, 0.28, paint));                 // tank
    parts.push(coloredBox(0.34, 0.12, 0.75, 0, 0.88, -0.35, '#1a1816'));           // saddle
    parts.push(coloredBox(0.36, 0.3, 0.42, 0, 0.55, 0.05, '#3a3632'));             // engine
    parts.push(coloredBox(0.72, 0.06, 0.06, 0, 1.1, L / 2 - 0.55, '#8a8580', PART.frame)); // bars
    parts.push(coloredBox(0.06, 0.5, 0.06, 0, 0.82, L / 2 - 0.5, '#8a8580', PART.frame));  // fork
    parts.push(coloredBox(0.1, 0.1, 0.7, -0.22, 0.42, -0.45, '#9a948c', PART.frame));     // exhaust
    parts.push(coloredBox(0.2, 0.14, 0.08, 0, 0.98, L / 2 - 0.42, '#fff6d8', PART.light));
    parts.push(coloredBox(0.18, 0.1, 0.06, 0, 0.82, -L / 2 + 0.2, '#b01010', PART.light));
    return mergeGeometries(parts);
  } else if (base === 'van') {
    parts.push(coloredBox(W, 1.5, L, 0, 1.25, 0, paint));
    parts.push(coloredBox(W - 0.2, 0.08, L - 0.6, 0, 2.04, -0.1, '#cfc8bb'));       // roof
    parts.push(coloredBox(W - 0.3, 0.55, 0.1, 0, 1.6, L / 2 - 0.4, '#2a3a44', PART.glass));
    door(1, L / 2 - 1.0, 1.0, PART.doorL, 1.25, 1.2); door(-1, L / 2 - 1.0, 1.0, PART.doorR, 1.25, 1.2);
    door(-1, -0.5, 1.4, PART.doorR2, 1.25, 1.2); // sliding door
    bumpers(0.55, 0.3);
    wheels(0.45, 0.05, L / 2 - 0.9, -L / 2 + 0.9);
  } else {
    // Cars: interceptor / pickup / sedan share a body; the cabin differs.
    const cabZ = base === 'pickup' ? 0.5 : -0.2;
    const cabL = base === 'pickup' ? 1.8 : base === 'sedan' ? 2.6 : 2.2;
    parts.push(coloredBox(W, 0.8, L, 0, 0.85, 0, paint));
    parts.push(coloredBox(W - 0.25, 0.65, cabL, 0, 1.55, cabZ, '#2a3a44', PART.glass));
    parts.push(coloredBox(W - 0.35, 0.08, cabL - 0.4, 0, 1.9, cabZ, paint));
    parts.push(coloredBox(W - 0.3, 0.06, (L / 2 - (cabZ + cabL / 2)) * 0.85, 0, 1.27, cabZ + cabL / 2 + (L / 2 - (cabZ + cabL / 2)) / 2, paint, PART.hood));
    if (base === 'pickup') {
      parts.push(coloredBox(W - 0.2, 0.3, 1.8, 0, 1.35, -L / 2 + 1.0, '#3a3530'));
      parts.push(coloredBox(0.1, 0.4, 2.2, W / 2 - 0.1, 1.45, -L / 2 + 1.2, paint)); // bed rails
      parts.push(coloredBox(0.1, 0.4, 2.2, -W / 2 + 0.1, 1.45, -L / 2 + 1.2, paint));
    }
    if (base === 'interceptor') {
      parts.push(coloredBox(0.6, 0.35, 1.0, 0, 1.4, L / 2 - 1.0, '#6a6560'));
      parts.push(coloredBox(W + 0.1, 0.2, 0.3, 0, 1.0, -L / 2 + 0.1, '#222'));
    }
    if (base === 'sedan') {
      door(1, cabZ + cabL / 4, cabL / 2 - 0.05, PART.doorL); door(-1, cabZ + cabL / 4, cabL / 2 - 0.05, PART.doorR);
      door(1, cabZ - cabL / 4, cabL / 2 - 0.05, PART.doorL2); door(-1, cabZ - cabL / 4, cabL / 2 - 0.05, PART.doorR2);
    } else {
      door(1, cabZ, cabL - 0.2, PART.doorL); door(-1, cabZ, cabL - 0.2, PART.doorR);
    }
    bumpers();
    wheels(0.45, 0.05, L / 2 - 0.9, -L / 2 + 0.9);
  }
  parts.push(coloredBox(0.35, 0.18, 0.08, -W / 2 + 0.35, 1.0, L / 2 + 0.02, '#fff6d8', PART.light));
  parts.push(coloredBox(0.35, 0.18, 0.08, W / 2 - 0.35, 1.0, L / 2 + 0.02, '#fff6d8', PART.light));
  parts.push(coloredBox(0.35, 0.16, 0.08, -W / 2 + 0.3, 1.0, -L / 2 - 0.02, '#b01010', PART.light));
  parts.push(coloredBox(0.35, 0.16, 0.08, W / 2 - 0.3, 1.0, -L / 2 - 0.02, '#b01010', PART.light));
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
    group.rotation.order = 'YXZ'; // yaw, then wheelie pitch, then bike lean (local roll)
    group.add(mesh, coneMesh, tailMesh);
    this.g.scene.add(group);
    const v = {
      type, ...s, x, z, h, vx: 0, vz: 0, av: 0, hp: s.hp, maxHp: s.hp, group, mesh, coneMesh, tailMesh,
      driver: null, ai: opts.ai ?? null, dead: false, steer: 0, throttle: 0, brake: 0, handbrake: false,
      skidT: 0, burn: 0, node: null, lights: true, paint, honk: 0, impact: 0,
    };
    v.id = `v${this.list.length + 1}`;
    v.seats = s.seats ?? VEHICLES.interceptor.seats;
    this.g.seats.init(v);
    this.g.vehDamage.init(v);
    v.lean = 0; v.wheelie = 0; v.fallen = false;
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
      for (const o of [...(v.occ ?? [])]) if (o && o !== this.g.player) { this.g.seats.leave(o); if (o.faction !== 'ally') { o.flee = 4; o.fleeX = v.x; o.fleeZ = v.z; } }
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
        else g.seats.leave(c, true);
        g.combat.damage(c, 999, attacker, 1, 0, 'explosion');
      } else if (d < 7 && !c.inVehicle) {
        g.combat.damage(c, 120 * (1 - d / 7), attacker, (cx - v.x) / (d || 1), (cz - v.z) / (d || 1), 'explosion');
      }
    }
    v.driver = null;
    if (v.dmg) { for (const z of Object.keys(v.dmg.zones)) v.dmg.zones[z] = Math.min(1, v.dmg.zones[z] + 0.45); v.dmg.dirty = true; v.dmg.deformT = 0; for (const p of ['hood', 'bumperF', 'doorL', 'doorR']) if (Math.random() < 0.6) g.vehDamage.detach(v, p, p === 'hood' || p === 'bumperF' ? 'front' : p === 'doorL' ? 'left' : 'right', 20); g.vehDamage.deform(v); }
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
    const fxm = this.g.vehDamage.effects(v, dt); // engine/radiator/fuel/tyres/lights
    const topSpeed = v.maxSpeed * fxm.top;
    if (!v.dead && v.driver && !v.fallen) {
      if (v.throttle > 0) fwd += v.accel * fxm.power * v.throttle * dt * (1 - clamp(fwd / topSpeed, 0, 1) * 0.85);
      else if (v.throttle < 0) fwd += (fwd > 0.5 ? -v.accel * 2.2 : -v.accel * 0.6) * -v.throttle * dt;
      if (fwd < -v.maxSpeed * 0.35) fwd = -v.maxSpeed * 0.35;
      // Steering bites with speed, softens at top speed.
      const steerAmt = (v.steer + fxm.pull * clamp(sp / 10, 0, 1)) * v.turn * clamp(sp / 7, 0, 1) * (1 - clamp(sp / v.maxSpeed, 0, 1) * 0.35) * (v.wheelie > 0.15 ? 0.35 : 1);
      v.av = angleLerp(v.av, steerAmt * Math.sign(fwd || 1), Math.min(1, dt * 10));
    } else {
      v.av *= Math.exp(-dt * 2);
    }
    v.h += v.av * dt;
    // Rolling drag and lateral grip (handbrake = drift).
    const grip = (v.handbrake ? v.grip * 0.18 : v.grip) * fxm.grip * (v.fallen ? 0.3 : 1);
    if (v.bike) {
      // Lean into the turn; wheelie on boost at low speed; a fallen bike just slides.
      const targetLean = v.fallen ? 1.35 : clamp(-v.av * sp * 0.032, -0.7, 0.7);
      v.lean += (targetLean - v.lean) * Math.min(1, dt * (v.fallen ? 3 : 8));
      const wantWheelie = !v.fallen && v.boost && v.throttle > 0 && sp > 3 && sp < 24;
      v.wheelie += ((wantWheelie ? 0.42 : 0) - v.wheelie) * Math.min(1, dt * (wantWheelie ? 2.5 : 6));
    }
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
        if (vn < 0) { v.vx -= vn * nx * 1.35; v.vz -= vn * nz * 1.35; if (-vn > hitN) { v._hitX = t.x - nx * r; v._hitZ = t.z - nz * r; } hitN = Math.max(hitN, -vn); }
        // Glancing hits spin the car.
        v.av += (off > 0 ? 1 : -1) * (nx * fz - nz * fx) * Math.min(3, -vn * 0.08);
      }
    }
    if (hitN > 4 && v.dmg) g.vehDamage.hit(v, v._hitX, v._hitZ, hitN, 'crash'); // dent where it actually hit
    if (v.bike && hitN > 7 && v.occ?.some(Boolean)) { v.fallen = true; g.seats.ejectAll(v, 1.2); g.audio.crash(0.8); }
    if (hitN > 4 && v.dmg) g.vehDamage.hit(v, v._hitX, v._hitZ, hitN, 'crash'); // dent where it actually hit
    if (v.bike && hitN > 7 && v.occ?.some(Boolean)) { v.fallen = true; g.seats.ejectAll(v, 1.2); g.audio.crash(0.8); }
    if (hitN > 4 && v.dmg) g.vehDamage.hit(v, v._hitX, v._hitZ, hitN, 'crash'); // dent where it actually hit
    if (v.bike && hitN > 7 && v.occ?.some(Boolean)) { v.fallen = true; g.seats.ejectAll(v, 1.2); g.audio.crash(0.8); }
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
        g.vehDamage.hit(v, best.px, best.pz, -rv, 'crash');
        g.vehDamage.hit(o, best.px, best.pz, -rv, 'crash');
        for (const b of [v, o]) if (b.bike && -rv > 5 && b.occ?.some(Boolean)) { b.fallen = true; g.seats.ejectAll(b, 1.4); }
        g.vehDamage.hit(v, best.px, best.pz, -rv, 'crash');
        g.vehDamage.hit(o, best.px, best.pz, -rv, 'crash');
        for (const b of [v, o]) if (b.bike && -rv > 5 && b.occ?.some(Boolean)) { b.fallen = true; g.seats.ejectAll(b, 1.4); }
        g.vehDamage.hit(v, best.px, best.pz, -rv, 'crash');
        g.vehDamage.hit(o, best.px, best.pz, -rv, 'crash');
        for (const b of [v, o]) if (b.bike && -rv > 5 && b.occ?.some(Boolean)) { b.fallen = true; g.seats.ejectAll(b, 1.4); }
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
    } else if (v.ai === 'chauffeur') {
      // An ally at the wheel: drive the player's GPS route, or cruise the grid.
      const wp = g.qol.waypoint ?? g.qol.objective()?.target;
      if (!wp) { v.ai = 'traffic'; v.node = null; this.aiDrive(v, dt); v.ai = 'chauffeur'; return; }
      v.routeT = (v.routeT ?? 0) - dt;
      if (v.routeT <= 0 || !v.route) { v.routeT = 2; v.route = g.nav.car.find(v.x, v.z, wp.x, wp.z) ?? [{ x: wp.x, z: wp.z }]; v.ri = 0; }
      let tgt = v.route[v.ri] ?? { x: wp.x, z: wp.z };
      if (Math.hypot(tgt.x - v.x, tgt.z - v.z) < 8 && v.ri < v.route.length - 1) { v.ri++; tgt = v.route[v.ri]; }
      const dEnd = Math.hypot(wp.x - v.x, wp.z - v.z);
      const want = Math.atan2(tgt.x - v.x, tgt.z - v.z);
      const diff = angleLerp(v.h, want, 1) - v.h;
      v.steer = clamp(diff * 2.2, -1, 1);
      const sp = this.speed(v);
      v.throttle = dEnd < 10 ? (sp > 1 ? -1 : 0) : Math.abs(diff) > 0.7 && sp > 12 ? -0.3 : 0.85;
      v.handbrake = false;
    } else if (v.ai === 'chauffeur') {
      // An ally at the wheel: drive the player's GPS route, or cruise the grid.
      const wp = g.qol.waypoint ?? g.qol.objective()?.target;
      if (!wp) { v.ai = 'traffic'; v.node = null; this.aiDrive(v, dt); v.ai = 'chauffeur'; return; }
      v.routeT = (v.routeT ?? 0) - dt;
      if (v.routeT <= 0 || !v.route) { v.routeT = 2; v.route = g.nav.car.find(v.x, v.z, wp.x, wp.z) ?? [{ x: wp.x, z: wp.z }]; v.ri = 0; }
      let tgt = v.route[v.ri] ?? { x: wp.x, z: wp.z };
      if (Math.hypot(tgt.x - v.x, tgt.z - v.z) < 8 && v.ri < v.route.length - 1) { v.ri++; tgt = v.route[v.ri]; }
      const dEnd = Math.hypot(wp.x - v.x, wp.z - v.z);
      const want = Math.atan2(tgt.x - v.x, tgt.z - v.z);
      const diff = angleLerp(v.h, want, 1) - v.h;
      v.steer = clamp(diff * 2.2, -1, 1);
      const sp = this.speed(v);
      v.throttle = dEnd < 10 ? (sp > 1 ? -1 : 0) : Math.abs(diff) > 0.7 && sp > 12 ? -0.3 : 0.85;
      v.handbrake = false;
    } else if (v.ai === 'chauffeur') {
      // An ally at the wheel: drive the player's GPS route, or cruise the grid.
      const wp = g.qol.waypoint ?? g.qol.objective()?.target;
      if (!wp) { v.ai = 'traffic'; v.node = null; this.aiDrive(v, dt); v.ai = 'chauffeur'; return; }
      v.routeT = (v.routeT ?? 0) - dt;
      if (v.routeT <= 0 || !v.route) { v.routeT = 2; v.route = g.nav.car.find(v.x, v.z, wp.x, wp.z) ?? [{ x: wp.x, z: wp.z }]; v.ri = 0; }
      let tgt = v.route[v.ri] ?? { x: wp.x, z: wp.z };
      if (Math.hypot(tgt.x - v.x, tgt.z - v.z) < 8 && v.ri < v.route.length - 1) { v.ri++; tgt = v.route[v.ri]; }
      const dEnd = Math.hypot(wp.x - v.x, wp.z - v.z);
      const want = Math.atan2(tgt.x - v.x, tgt.z - v.z);
      const diff = angleLerp(v.h, want, 1) - v.h;
      v.steer = clamp(diff * 2.2, -1, 1);
      const sp = this.speed(v);
      v.throttle = dEnd < 10 ? (sp > 1 ? -1 : 0) : Math.abs(diff) > 0.7 && sp > 12 ? -0.3 : 0.85;
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
      // Everyone aboard rides with the car; exposed seats (bike, truck bed) show their rider.
      if (v.occ) for (let si = 0; si < v.occ.length; si++) {
        const o = v.occ[si];
        if (!o) continue;
        if (!o.alive && o !== g.player) { v.occ[si] = null; if (v.driver === o) v.driver = null; o.inVehicle = null; o.seat = null; o.seatPose = null; continue; }
        o.x = v.x; o.z = v.z;
        const seat = v.seats[si];
        if (seat.exposed) {
          const lx = v.bike ? 0 : (seat.side === 'left' ? 0.45 : -0.45), lz = v.bike ? (si === 0 ? -0.15 : -0.65) : -v.len / 2 + 1.0;
          const c = Math.cos(v.h), sn = Math.sin(v.h);
          o.seatPose = { x: v.x + lx * c + lz * sn, z: v.z - lx * sn + lz * c, y: v.bike ? 0.12 : 1.1, h: o.aiming && seat.exposed === 'stand' ? o.face : v.h, lean: v.lean ?? 0, pitch: -(v.wheelie ?? 0), kind: seat.exposed };
        } else o.seatPose = null;
      }
      const lit = !!v.driver && !v.dead;
      v.coneMesh.visible = lit; v.tailMesh.visible = lit || v.throttle < 0;
      // Paint chars and darkens as the vehicle is damaged.
      if (!v.dead) { const dmg = 1 - v.hp / v.maxHp; v.mesh.material.color.setRGB(1 - dmg * 0.6, 1 - dmg * 0.65, 1 - dmg * 0.7); }
      v.group.position.set(v.x, 0, v.z);
      v.group.rotation.y = v.h;
      if (v.bike) { v.group.rotation.z = v.lean; v.group.rotation.x = -v.wheelie; v.group.position.y = v.wheelie * 0.25; }
      if (v.bike) { v.group.rotation.z = v.lean; v.group.rotation.x = -v.wheelie; v.group.position.y = v.wheelie * 0.25; }
      if (v.bike) { v.group.rotation.z = v.lean; v.group.rotation.x = -v.wheelie; v.group.position.y = v.wheelie * 0.25; }
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
