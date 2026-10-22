import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RAIL, STATION, CROSSINGS } from '../world/rail.js';
import { radialGlow } from '../world/textures.js';

// The Iron Line freight: locomotive + 5 cars on one straight track. It stops at Dust Bowl
// Station, flashes the Route 66 crossing, smashes anything on the rails, can be boarded
// (walk the roofs and shoot), and its tanker car can be blown sky-high.

const CARS = [
  { kind: 'loco', len: 14, color: '#5a2a1a' },
  { kind: 'box', len: 12, color: '#6a4a2e' },
  { kind: 'tanker', len: 12, color: '#2e2c2a' },
  { kind: 'flat', len: 12, color: '#4a4440' },
  { kind: 'box', len: 12, color: '#3e4a46' },
  { kind: 'caboose', len: 9, color: '#7a2a1c' },
];
const GAP = 1.4, W = 3.0, CRUISE = 17;

function box(sx, sy, sz, x, y, z, color) {
  let g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
  g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function cyl(r, len, x, y, z, color) {
  let g = new THREE.CylinderGeometry(r, r, len, 14).toNonIndexed();
  g.rotateX(Math.PI / 2); g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

export class Train {
  constructor(game) {
    this.g = game;
    // Car offsets behind the nose (train runs toward +z).
    let off = 0;
    this.cars = CARS.map((c) => { const o = { ...c, center: -(off + c.len / 2), hp: c.kind === 'tanker' ? 140 : 9999 }; off += c.len + GAP; return o; });
    this.length = off - GAP;
    this.head = STATION.z - 250; // starts north of the station, heading south
    this.speed = CRUISE;
    this.state = 'running'; this.dwell = 0; this.away = 0;
    this.buildTrack(game);
    this.buildTrain(game);
    this.buildCrossings(game);
    this.hornT = 0;
  }

  buildTrack(game) {
    const len = RAIL.z1 - RAIL.z0;
    const steel = new THREE.MeshStandardMaterial({ color: '#7a726a', roughness: 0.4, metalness: 0.7 });
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, len), steel);
      r.position.set(RAIL.x + s * RAIL.gauge / 2, 0.2, (RAIL.z0 + RAIL.z1) / 2); r.receiveShadow = true;
      game.scene.add(r);
    }
    const n = Math.floor(len / 1.1);
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: '#3a2a1e', roughness: 0.95 }), n);
    const o = new THREE.Object3D();
    for (let i = 0; i < n; i++) { o.position.set(RAIL.x, 0.08, RAIL.z0 + i * 1.1); o.rotation.set(0, (Math.random() - 0.5) * 0.04, 0); o.updateMatrix(); sleepers.setMatrixAt(i, o.matrix); }
    sleepers.receiveShadow = true;
    game.scene.add(sleepers);
    const ballast = new THREE.Mesh(new THREE.PlaneGeometry(4.2, len).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#5e564c', roughness: 1 }));
    ballast.position.set(RAIL.x, 0.025, (RAIL.z0 + RAIL.z1) / 2); ballast.receiveShadow = true;
    game.scene.add(ballast);
    // Station platform + shelter.
    const conc = new THREE.MeshStandardMaterial({ color: '#7a7268', roughness: 0.95 });
    const plat = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 50), conc);
    plat.position.set(RAIL.x - 5.2, 0.3, STATION.z - 22); plat.receiveShadow = true; plat.castShadow = true;
    game.scene.add(plat);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 50), new THREE.MeshStandardMaterial({ color: '#d8b440', roughness: 0.8 }));
    edge.position.set(RAIL.x - 2.95, 0.61, STATION.z - 22); game.scene.add(edge);
    const bench = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.9 });
    for (const dz of [-34, -26, -18, -10]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 2.2), bench); b.position.set(RAIL.x - 7, 0.85, STATION.z + dz); b.castShadow = true; game.scene.add(b); }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.25, 18), new THREE.MeshStandardMaterial({ color: '#6a3a24', roughness: 0.8 }));
    roof.position.set(RAIL.x - 5.4, 3.4, STATION.z - 22); roof.castShadow = true;
    game.scene.add(roof);
    for (const z of [-30, -14]) game.statics.addCentered(RAIL.x - 7.6, STATION.z + z, 0.4, 0.4, 'post', 3.4);
  }

  buildTrain(game) {
    const parts = [];
    for (const c of this.cars) {
      const z = c.center;
      parts.push(box(W - 0.4, 0.4, c.len, 0, 0.95, z, '#1e1c1a'));                                   // chassis
      for (const dz of [-c.len / 2 + 2, c.len / 2 - 2]) for (const s of [-1, 1]) parts.push(cyl(0.45, 0.3, s * 1.0, 0.5, z + dz, '#141312')); // bogies
      if (c.kind === 'loco') {
        parts.push(box(W, 2.6, c.len - 4, 0, 2.4, z - 2, c.color));
        for (const s of [-1, 1]) {
          parts.push(box(0.06, 0.32, c.len - 0.6, s * (W / 2 + 0.03), 1.45, z, '#d8a43a'));            // warning stripe
          parts.push(box(0.05, 0.05, c.len - 5, s * (W / 2 + 0.25), 2.6, z - 2, '#b8b0a4'));            // handrail
        }
        for (let k = 0; k < 3; k++) parts.push(box(1.6, 0.18, 1.6, 0, 3.78, z - 6 + k * 2.2, '#1a1918')); // roof grilles
        parts.push(box(0.5, 0.7, 0.5, 0.6, 4.1, z - 0.8, '#1a1918'));                                       // exhaust stacks
        parts.push(box(W, 3.2, 3.6, 0, 2.7, z + c.len / 2 - 2.3, c.color));                    // cab
        parts.push(box(W - 0.3, 0.8, 0.1, 0, 3.6, z + c.len / 2 - 0.45, '#2a3a44'));          // windshield
        parts.push(box(W + 0.2, 0.5, 0.6, 0, 0.9, z + c.len / 2 + 0.1, '#c9a24a'));           // cowcatcher
        parts.push(cyl(0.35, 1.2, 0, 4.1, z - 1, '#2a2826').rotateX(0));
      } else if (c.kind === 'tanker') {
        parts.push(cyl(1.35, c.len - 1.2, 0, 2.6, z, c.color));
        for (const dz of [-c.len / 2 + 1.2, -1.6, 1.6, c.len / 2 - 1.2]) parts.push(cyl(1.42, 0.22, 0, 2.6, z + dz, '#5a4a3a')); // bands
        parts.push(box(0.8, 0.5, 0.8, 0, 4.0, z, '#3a3632'));
        parts.push(box(2.0, 0.08, 2.4, 0, 4.0, z, '#6a5a48'));                                           // dome walkway
        parts.push(box(W + 0.1, 0.5, 2.2, 0, 2.6, z, '#b8301e'));                                        // HAZMAT red band
      } else if (c.kind === 'flat') {
        parts.push(box(W, 0.3, c.len, 0, 1.35, z, c.color));
        parts.push(box(1.9, 1.3, 4.2, 0, 2.15, z - 2.5, '#6a3a1c'));                           // wrecks chained down
        parts.push(box(1.9, 1.1, 4.0, 0, 2.05, z + 2.8, '#3a4a46'));
      } else {
        parts.push(box(W, 3.0, c.len - 0.4, 0, 2.6, z, c.color));
        const rib = new THREE.Color(c.color).multiplyScalar(0.72).getStyle();
        for (let dz = -c.len / 2 + 0.9; dz < c.len / 2 - 0.5; dz += 1.25) parts.push(box(W + 0.1, 3.0, 0.12, 0, 2.6, z + dz, rib)); // ribs
        if (c.kind === 'box') for (const s of [-1, 1]) parts.push(box(0.08, 2.5, 2.6, s * (W / 2 + 0.05), 2.45, z, '#2a2420')); // sliding doors
        parts.push(box(0.9, 0.12, c.len - 0.4, 0, 4.15, z, '#8a7a62'));                         // roof walkway
        if (c.kind === 'caboose') for (const s of [-1, 1]) parts.push(box(0.08, 0.5, 0.9, s * 0.92, 4.7, z, '#e8c060')); // lit cupola windows
        if (c.kind === 'caboose') parts.push(box(1.8, 1.0, 2.6, 0, 4.6, z, c.color));
      }
    }
    this.geo = mergeGeometries(parts);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.35 }));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    game.scene.add(this.mesh);
    // Headlight cone.
    const cone = new THREE.Mesh(new THREE.PlaneGeometry(10, 34).rotateX(-Math.PI / 2).translate(0, 0.2, 17 + 1), game.vehiclesSys.coneMat);
    cone.renderOrder = 3;
    this.mesh.add(cone);
  }

  buildCrossings(game) {
    this.crossLights = [];
    const glowMat = new THREE.MeshBasicMaterial({ map: radialGlow(), color: '#ff2a1a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const pole = new THREE.MeshStandardMaterial({ color: '#d8d4cc', roughness: 0.6 });
    for (const c of CROSSINGS) for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6), pole);
      post.position.set(RAIL.x + s * 4.2, 1.6, c.z + s * 8.5); game.scene.add(post);
      game.statics.addCentered(RAIL.x + s * 4.2, c.z + s * 8.5, 0.3, 0.3, 'post', 3);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2), glowMat.clone());
      glow.position.set(RAIL.x + s * 4.2, 3.3, c.z + s * 8.5); glow.material.opacity = 0; game.scene.add(glow);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 7.2), new THREE.MeshStandardMaterial({ color: '#e8e2d4' }));
      arm.position.set(RAIL.x + s * 4.2, 1.1, c.z + s * 8.5 - s * 3.6); game.scene.add(arm);
      this.crossLights.push({ glow, arm, s, z: c.z });
    }
  }

  carZ(c) { return this.head + c.center; }
  get present() { return this.state !== 'away'; }

  // Is anything of the train within d metres (z-wise) of world z?
  near(z, d) { return this.present && z > this.head - this.length - d && z < this.head + d; }

  // Bullets: train bodies stop rounds; the tanker can be holed.
  raycast(ox, oz, dx, dz, maxT) {
    if (!this.present || Math.abs(dx) < 1e-4) return null;
    const t = (RAIL.x + (ox < RAIL.x ? -W / 2 : W / 2) - ox) / dx;
    if (t < 0 || t > maxT) return null;
    const z = oz + dz * t;
    for (const c of this.cars) { const cz = this.carZ(c); if (Math.abs(z - cz) < c.len / 2) return { t, car: c, x: ox + dx * t, z }; }
    return null;
  }

  hitCar(c, dmg, by) {
    if (c.kind !== 'tanker' || c.blown) return;
    c.hp -= dmg;
    if (c.hp <= 0) {
      c.blown = true;
      const z = this.carZ(c), g = this.g;
      for (let k = -1; k <= 1; k++) g.throwables.explode(RAIL.x, z + k * 4, { blast: { r: 12, dmg: 220 } }, by);
      g.throwables.startFire(RAIL.x + 4, z, 4, 20, by); g.throwables.startFire(RAIL.x - 4, z, 4, 20, by);
      // Char the tanker's vertices.
      const col = this.geo.attributes.color, pos = this.geo.attributes.position;
      for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getZ(i) - c.center) < c.len / 2) { col.setXYZ(i, 0.08, 0.07, 0.06); }
      col.needsUpdate = true;
      g.emit('tankerExploded', { z: Math.round(z) });
      g.hud.toast('THE TANKER WENT UP', 'hot');
    }
  }

  board(c) {
    // Stand on the roof of the car nearest you.
    let best = null, bd = 99;
    for (const car of this.cars) { const d = Math.abs(this.carZ(car) - c.z); if (d < bd) { bd = d; best = car; } }
    c.onTrain = { off: Math.max(-this.length + 1, Math.min(-0.5, c.z - this.head)) };
    if (c === this.g.player) this.g.hud.toast('On the train — WASD walk the roofs, [G] jump off', 'job');
    this.g.emit('boardedTrain', { id: c.id, car: best?.kind });
  }

  leave(c) {
    if (!c.onTrain) return;
    const side = Math.sin(c.face ?? 0) < 0 ? -1 : 1; // jump toward where you're aiming
    c.onTrain = null; c.seatPose = null;
    const t = { x: RAIL.x + side * 3.4, z: c.z };
    this.g.statics.resolveCircle(t, 0.45);
    c.x = t.x; c.z = t.z;
    if (this.speed > 6) { this.g.combat.damage(c, this.speed * 1.4, null, side, 0, 'bullet'); this.g.fx.dust(c.x, c.z, 5); }
    this.g.emit('leftTrain', { id: c.id, speed: Math.round(this.speed) });
  }

  canBoard(c) {
    if (!this.present || c.onTrain) return false;
    if (Math.abs(c.x - RAIL.x) > W / 2 + 2.4) return false;
    if (!(c.z < this.head + 0.5 && c.z > this.head - this.length - 0.5)) return false;
    const v = c.inVehicle;
    return this.speed < 7 || (v && Math.abs(this.g.vehiclesSys.speed(v) - this.speed) < 6); // jump across from a car pacing it
  }

  update(dt) {
    const g = this.g;
    // Schedule: run south, stop at the station, wrap around after leaving the map.
    if (this.state === 'away') { this.away -= dt; if (this.away <= 0) { this.state = 'running'; this.head = RAIL.z0 - 10; this.speed = CRUISE; for (const c of this.cars) if (c.kind === 'tanker' && c.blown) { c.blown = false; c.hp = 140; this.recolor(); } } }
    else {
      const stopAt = STATION.z;
      if (this.state === 'running') {
        const toStop = stopAt - this.head;
        const brake = (this.speed * this.speed) / (2 * 2.4);
        if (toStop > 0 && toStop < brake + 2) this.speed = Math.max(0, this.speed - 2.4 * dt);
        else this.speed = Math.min(CRUISE, this.speed + 1.4 * dt);
        if (toStop > -1 && toStop < 1.5 && this.speed < 0.6) { this.state = 'dwell'; this.speed = 0; this.dwell = 14; g.emit('trainArrived', { station: STATION.name }); }
      } else if (this.state === 'dwell') {
        this.dwell -= dt;
        if (this.dwell <= 0) { this.state = 'leaving'; g.emit('trainDeparted', { station: STATION.name }); }
      } else if (this.state === 'leaving') {
        this.speed = Math.min(CRUISE, this.speed + 1.4 * dt);
        if (this.speed >= CRUISE) this.state = 'running2';
      } else this.speed = Math.min(CRUISE, this.speed + 1.4 * dt);
      this.head += this.speed * dt;
      if (this.head - this.length > RAIL.z1 + 20) { this.state = 'away'; this.away = 25; this.head = -9999; }
    }
    const present = this.present;
    this.mesh.visible = present;
    this.mesh.position.set(RAIL.x, 0, this.head);
    // Horn: approaching the crossing or someone near the track.
    this.hornT -= dt;
    if (present && this.hornT <= 0 && this.speed > 5) {
      const pz = g.player.z, px = g.player.x;
      const nearPlayer = Math.abs(px - RAIL.x) < 40 && pz > this.head - 10 && pz < this.head + 120;
      const nearCross = CROSSINGS.some((c) => c.z > this.head && c.z - this.head < 140);
      if (nearPlayer || nearCross) { g.audio.trainHorn?.(g.pan(RAIL.x), Math.hypot(px - RAIL.x, pz - this.head)); this.hornT = 5; }
    }
    // Crossing lights + barriers.
    for (const L of this.crossLights) {
      const active = present && L.z < this.head + 160 && L.z > this.head - this.length - 15;
      const blink = active && Math.floor(g.time * 2.4 + (L.s > 0 ? 0 : 0.5) * 2) % 2 === 0;
      L.glow.material.opacity = blink ? 0.95 : 0;
      // Top-down the barrier reads as an arm extending across the lane from its post.
      const sc = L.arm.scale.z + ((active ? 1 : 0.12) - L.arm.scale.z) * Math.min(1, dt * 2.5);
      L.arm.scale.z = sc; L.arm.position.z = L.z + L.s * 8.5 - L.s * 3.6 * sc;
    }
    if (!present) return;
    // Collisions: people die, vehicles get thrown off the rails.
    for (const car of this.cars) {
      const cz = this.carZ(car), half = car.len / 2;
      for (const c of g.chars) {
        if (!c.alive || c.inVehicle || c.onTrain) continue;
        if (Math.abs(c.x - RAIL.x) < W / 2 + 0.4 && Math.abs(c.z - cz) < half + 0.4) {
          if (this.speed > 3) { g.combat.damage(c, 999, null, Math.sign(c.x - RAIL.x) || 1, 0.6, 'vehicle'); g.emit('trainHit', { id: c.id }); }
          c.x = RAIL.x + (Math.sign(c.x - RAIL.x) || 1) * (W / 2 + 0.6 + (this.speed > 3 ? 3 : 0));
        }
      }
      for (const v of g.vehicles) {
        if (v.dead && v.sunk) continue;
        for (const d of g.vehiclesSys.discs(v)) {
          const dx = d.x - RAIL.x;
          if (Math.abs(dx) < W / 2 + d.r && Math.abs(d.z - cz) < half + d.r) {
            const s = Math.sign(dx) || 1;
            const push = W / 2 + d.r - Math.abs(dx);
            v.x += s * push;
            if (this.speed > 2) {
              const rel = this.speed;
              v.vx = s * (6 + rel * 0.5) / Math.sqrt(v.mass); v.vz = rel * 0.85; v.av += s * rel * 0.12 / v.mass;
              g.vehiclesSys.damage(v, 30 + rel * 6 / Math.sqrt(v.mass), null);
              g.vehDamage.hit(v, d.x - s * d.r, d.z, rel * 1.5, 'crash');
              g.fx.sparks(RAIL.x + s * W / 2, 1.2, d.z, s, 0, 14);
              if (v.occ?.includes(g.player)) { g.hud.shake(1); g.audio.crash(1); }
              g.emit('trainHit', { vehicle: v.id, speed: Math.round(rel) });
            }
            break;
          }
        }
      }
    }
    // Riders on the roof.
    for (const c of g.chars) {
      if (!c.onTrain) continue;
      c.onTrain.off = Math.max(-this.length + 0.8, Math.min(-0.6, c.onTrain.off));
      c.x = RAIL.x; c.z = this.head + c.onTrain.off;
      c.seatPose = { x: c.x, z: c.z, y: 4.2, h: c.face, lean: 0, pitch: 0, kind: 'stand' };
    }
  }

  recolor() {
    // A fresh tanker after a respawn: rebuild the merged mesh once.
    this.g.scene.remove(this.mesh);
    this.geo.dispose();
    this.buildTrain(this.g);
  }

  view() {
    return { present: this.present, state: this.state, headZ: Math.round(this.head), speed: Math.round(this.speed), x: RAIL.x, length: Math.round(this.length), station: { ...STATION }, tanker: this.cars.find((c) => c.kind === 'tanker')?.blown ? 'blown' : 'intact', riders: this.g.chars.filter((c) => c.onTrain).map((c) => c.id) };
  }
}
