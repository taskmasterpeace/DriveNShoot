import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roadLines } from '../world/city.js';

// Ambient detail: the small things that make the wasteland feel lived-in and reactive.
//  - tyre tracks pressed into the sand (ring buffer), dust plumes scaled to speed off-road
//  - brass: shell casings that eject, bounce and pile up where fights happened
//  - tumbleweeds rolling downwind, bouncing off walls and wrecks
//  - vultures circling over the dead (their shadows sweep the ground); gunfire scatters them
//  - the horn: people in front of a honking car leap out of the way
//  - civilians cower (crouch, hands up, a bark) when bullets fly close
// Fixed-size instanced meshes throughout: 4 extra draw calls total.

const TRACK_MAX = 1400, BRASS_MAX = 240, WEEDS = 9, BIRDS = 7;
const _o = new THREE.Object3D(), _c = new THREE.Color();
const COWER_BARKS = ["Don't shoot!", 'Please — I got kids!', 'Not me! NOT ME!', 'Get down!', 'Oh God, oh God…', "I ain't got nothing!"];
const onRoad = (x, z) => roadLines.some((c) => Math.abs(z - c) < 7 || Math.abs(x - c) < 7) || Math.abs(z) < 7;

export class Ambient {
  constructor(game) {
    this.g = game;
    const scene = game.scene;
    // Tyre tracks: faint darker sand, slightly transparent so they read as impressions.
    this.tracks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#5e4228', transparent: true, opacity: 0.28, depthWrite: false }), TRACK_MAX);
    this.tracks.frustumCulled = false; this.tracks.renderOrder = 1;
    for (let i = 0; i < TRACK_MAX; i++) { _o.position.set(0, -50, 0); _o.scale.set(0.001, 1, 0.001); _o.updateMatrix(); this.tracks.setMatrixAt(i, _o.matrix); }
    this.tNext = 0;
    scene.add(this.tracks);
    // Brass.
    this.brass = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.11, 6).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.85, roughness: 0.3 }), BRASS_MAX);
    this.brass.frustumCulled = false; this.brass.count = 0;
    this.shells = []; this.bNext = 0;
    scene.add(this.brass);
    // Tumbleweeds: a scruffy ball of twigs.
    const twigs = [];
    for (let k = 0; k < 7; k++) { const t = new THREE.TorusGeometry(0.42 + (k % 3) * 0.06, 0.035, 3, 9); t.rotateX(k * 0.9); t.rotateY(k * 1.7); twigs.push(t); }
    this.weedMesh = new THREE.InstancedMesh(mergeGeometries(twigs), new THREE.MeshStandardMaterial({ color: '#8a6a40', roughness: 1 }), WEEDS);
    this.weedMesh.castShadow = true; this.weedMesh.frustumCulled = false;
    scene.add(this.weedMesh);
    this.weeds = Array.from({ length: WEEDS }, () => ({ x: 9999, z: 9999, rx: 0, rz: 0, s: 0.8 + Math.random() * 0.6, v: 0, hop: Math.random() * 6 }));
    // Vultures: body + wings in one geometry; wings flap by scaling X.
    const body = new THREE.BoxGeometry(0.28, 0.16, 0.9);
    const wing = new THREE.BoxGeometry(2.6, 0.04, 0.55); wing.translate(0, 0.05, -0.05);
    const head = new THREE.BoxGeometry(0.14, 0.12, 0.22); head.translate(0, 0.04, 0.52);
    this.birdMesh = new THREE.InstancedMesh(mergeGeometries([body, wing, head]), new THREE.MeshStandardMaterial({ color: '#1e1a17', roughness: 0.9 }), BIRDS);
    this.birdMesh.castShadow = true; this.birdMesh.frustumCulled = false;
    scene.add(this.birdMesh);
    this.birds = Array.from({ length: BIRDS }, (_, i) => ({ a: (i / BIRDS) * Math.PI * 2, r: 9 + Math.random() * 6, h: 15 + Math.random() * 6, cx: 0, cz: 0, x: 0, z: 0, y: 30, spook: 0, flap: Math.random() * 6, sp: 0.35 + Math.random() * 0.2 }));
    this.dustT = 0;
    this.cowerSeq = 0;
  }

  // ---- hooks ---------------------------------------------------------------------------
  // Called from Combat.fire: brass flies out to the shooter's right.
  eject(ch, ang) {
    const rx = Math.cos(ang), rz = -Math.sin(ang); // shooter's right
    const s = { x: ch.x + rx * 0.3, z: ch.z + rz * 0.3, y: 1.3, vx: rx * (2 + Math.random() * 1.5) - Math.sin(ang) * 0.6, vz: rz * (2 + Math.random() * 1.5) - Math.cos(ang) * 0.6, vy: 2.4 + Math.random(), spin: Math.random() * 6, rot: Math.random() * 6, rest: false, i: this.bNext };
    this.bNext = (this.bNext + 1) % BRASS_MAX;
    this.shells[s.i] = s;
    this.brass.count = Math.min(BRASS_MAX, Math.max(this.brass.count, s.i + 1));
  }

  // Player's horn: anyone ahead of the car leaps aside.
  honk(v) {
    const g = this.g, fx = Math.sin(v.h), fz = Math.cos(v.h);
    let n = 0;
    for (const c of g.chars) {
      if (!c.alive || c.inVehicle || c === g.player || c.faction === 'zombie' || c.leapT > 0) continue;
      const ox = c.x - v.x, oz = c.z - v.z, along = ox * fx + oz * fz, across = ox * fz - oz * fx;
      if (along < 0 || along > 22 || Math.abs(across) > 4.5) continue;
      const side = across >= 0 ? 1 : -1;
      c.leapDx = fz * side; c.leapDz = -fx * side; c.leapT = 0.55; c.dive = 0.55;
      c.flee = Math.max(c.flee ?? 0, 3); c.fleeX = v.x; c.fleeZ = v.z;
      if (Math.random() < 0.5) g.feedback?.floater(c.x, c.z, Math.random() < 0.5 ? 'HEY!' : 'WATCH IT!', 'bark');
      n++;
    }
    g.emit('honk', { vehicle: v.id, dodged: n });
    return n;
  }

  // Gunfire close to unarmed people: they cower.
  onShot(x, z) {
    const g = this.g;
    for (const c of g.chars) {
      if (!c.alive || c.weapon || c.inVehicle || c === g.player || c.faction === 'zombie' || c.npc?.essential) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > 14 || c.cowerT > 0) continue;
      if (Math.random() < 0.55) {
        c.cowerT = 2.5 + Math.random() * 2; c.flee = 0;
        if (Math.random() < 0.6 && ++this.cowerSeq % 2) g.feedback?.floater(c.x, c.z, COWER_BARKS[Math.floor(Math.random() * COWER_BARKS.length)], 'bark');
      }
    }
    for (const b of this.birds) if (Math.hypot(b.x - x, b.z - z) < 50) b.spook = 4;
  }

  // ---- per frame -----------------------------------------------------------------------
  update(dt) {
    const g = this.g, p = g.player;
    // Tyre tracks + dust: every moving land vehicle off the tarmac.
    this.dustT -= dt;
    let wrote = false;
    for (const v of g.vehicles) {
      if (v.dead || v.boat || v.fallen) continue;
      const sp = g.vehiclesSys.speed(v);
      if (sp < 1.5 || Math.abs(v.x - p.x) > 80 || Math.abs(v.z - p.z) > 80) continue;
      if (g.water?.depthAt(v.x, v.z) > 0.05 || onRoad(v.x, v.z)) continue;
      v.trackD = (v.trackD ?? 0) + sp * dt;
      if (v.trackD > 0.9) {
        v.trackD = 0;
        const fx = Math.sin(v.h), fz = Math.cos(v.h), half = v.bike ? 0 : v.wid * 0.38;
        for (const s of v.bike ? [0] : [-1, 1]) for (const ax of v.bike ? [0.3] : [0.35, -0.35]) {
          const x = v.x + fx * v.len * ax + fz * s * half, z = v.z + fz * v.len * ax - fx * s * half;
          _o.position.set(x, 0.035 + (this.tNext % 5) * 0.001, z); _o.rotation.set(0, v.h, 0); _o.scale.set(v.bike ? 0.18 : 0.3, 1, 1.05); _o.updateMatrix();
          this.tracks.setMatrixAt(this.tNext, _o.matrix); this.tNext = (this.tNext + 1) % TRACK_MAX; this.laid = (this.laid ?? 0) + 1;
        }
        wrote = true;
      }
      if (sp > 9 && this.dustT <= 0) {
        const n = sp > 22 ? 2 : 1;
        g.fx.dust(v.x - Math.sin(v.h) * v.len * 0.55, v.z - Math.cos(v.h) * v.len * 0.55, n);
      }
    }
    if (this.dustT <= 0) this.dustT = 0.06;
    if (wrote) this.tracks.instanceMatrix.needsUpdate = true;

    // Brass physics (only the ones still moving).
    let moved = false;
    for (const s of this.shells) {
      if (!s || s.rest) continue;
      s.vy -= 22 * dt; s.x += s.vx * dt; s.z += s.vz * dt; s.y += s.vy * dt; s.rot += s.spin * dt;
      if (s.y < 0.04) {
        s.y = 0.04;
        if (Math.abs(s.vy) < 1.2) { s.rest = true; s.vx = s.vz = 0; }
        else { s.vy *= -0.35; s.vx *= 0.5; s.vz *= 0.5; s.spin *= 0.6; if (Math.random() < 0.3 && Math.hypot(s.x - p.x, s.z - p.z) < 16) g.audio.clink?.(g.pan(s.x)); }
      }
      _o.position.set(s.x, s.y, s.z); _o.rotation.set(0, s.rot, 0); _o.scale.set(1, 1, 1); _o.updateMatrix();
      this.brass.setMatrixAt(s.i, _o.matrix); moved = true;
    }
    if (moved) this.brass.instanceMatrix.needsUpdate = true;

    // Leaping out of the way / cowering.
    for (const c of g.chars) {
      if (c.leapT > 0) {
        c.leapT -= dt; c.dive = Math.max(0, c.leapT);
        const t = { x: c.x + c.leapDx * 8 * dt, z: c.z + c.leapDz * 8 * dt };
        g.statics.resolveCircle(t, c.radius ?? 0.45); c.x = t.x; c.z = t.z;
        if (c.leapT <= 0) c.dive = 0;
      }
      if (c.cowerT > 0) { c.cowerT -= dt; c.crouch = c.cowerT > 0; c.speed = 0; c.handsUp = c.cowerT > 0; }
    }

    this.updateWeeds(dt);
    this.updateBirds(dt);
  }

  updateWeeds(dt) {
    const g = this.g, p = g.player, wx = g.sky.windX ?? 6, wz = g.sky.windZ ?? 2, wl = Math.hypot(wx, wz) || 1;
    const gust = g.sky.weather === 'dust' ? 2.2 : 1;
    for (let i = 0; i < WEEDS; i++) {
      const w = this.weeds[i];
      const dx = w.x - p.x, dz = w.z - p.z;
      if (dx * dx + dz * dz > 85 * 85) {
        // Respawn upwind, just outside view, in open desert.
        for (let k = 0; k < 6; k++) {
          const a = Math.atan2(-wz, -wx) + (Math.random() - 0.5) * 1.6;
          const x = p.x + Math.cos(a) * 62, z = p.z + Math.sin(a) * 62;
          if (Math.max(Math.abs(x), Math.abs(z)) < 95 || g.water?.depthAt(x, z) > 0 || g.statics.pointBlocked(x, z, 0.8)) continue;
          w.x = x; w.z = z; w.v = 0; break;
        }
      }
      w.hop += dt * (3 + w.v);
      w.v = Math.min(wl * 0.55 * gust, w.v + dt * 2);
      const t = { x: w.x + (wx / wl) * w.v * dt + Math.sin(w.hop * 0.7 + i) * 0.4 * dt, z: w.z + (wz / wl) * w.v * dt };
      if (g.statics.resolveCircle(t, 0.5 * w.s) > 0) w.v *= 0.3;
      w.x = t.x; w.z = t.z;
      w.rx += (wz / wl) * w.v * dt / (0.5 * w.s); w.rz -= (wx / wl) * w.v * dt / (0.5 * w.s);
      const y = 0.5 * w.s + Math.abs(Math.sin(w.hop)) * 0.35 * gust;
      _o.position.set(w.x, y, w.z); _o.rotation.set(w.rx, 0, w.rz); _o.scale.setScalar(w.s); _o.updateMatrix();
      this.weedMesh.setMatrixAt(i, _o.matrix);
    }
    this.weedMesh.instanceMatrix.needsUpdate = true;
  }

  updateBirds(dt) {
    const g = this.g, p = g.player;
    // Circle the freshest dead near the player; otherwise drift high over the desert.
    const dead = g.chars.filter((c) => !c.alive && c.deadTime > 4 && c.deadTime < 240 && Math.abs(c.x - p.x) < 70 && Math.abs(c.z - p.z) < 70);
    this.birds.forEach((b, i) => {
      const tgt = dead.length ? dead[i % dead.length] : null;
      const cx = tgt ? tgt.x : p.x + Math.sin(i * 2.3 + g.time * 0.01) * 55, cz = tgt ? tgt.z : p.z + Math.cos(i * 1.7) * 55;
      b.cx += (cx - b.cx) * Math.min(1, dt * 0.25); b.cz += (cz - b.cz) * Math.min(1, dt * 0.25);
      b.spook = Math.max(0, b.spook - dt);
      const r = b.r * (b.spook > 0 ? 2.4 : 1), h = (tgt ? b.h : b.h + 10) + (b.spook > 0 ? 10 : 0);
      b.a += dt * b.sp * (b.spook > 0 ? 2.2 : 1);
      const nx = b.cx + Math.cos(b.a) * r, nz = b.cz + Math.sin(b.a) * r;
      const head = Math.atan2(nx - b.x, nz - b.z);
      b.x = nx; b.z = nz; b.y += (h - b.y) * Math.min(1, dt * 0.8);
      b.flap += dt * (b.spook > 0 ? 9 : 2.2);
      const glide = b.spook > 0 ? 1 : Math.sin(b.flap * 0.25) > 0.6 ? 1 : 0; // vultures mostly soar
      _o.position.set(b.x, b.y, b.z); _o.rotation.set(0, head, Math.sin(b.a) * 0.25);
      _o.scale.set(1 - glide * Math.abs(Math.sin(b.flap)) * 0.55, 1, 1); _o.updateMatrix();
      this.birdMesh.setMatrixAt(i, _o.matrix);
    });
    this.birdMesh.instanceMatrix.needsUpdate = true;
  }

  view() {
    const p = this.g.player;
    return {
      tracks: Math.min(TRACK_MAX, this.laid ?? 0),
      brass: this.shells.filter(Boolean).length,
      brassAtRest: this.shells.filter((s) => s?.rest).length,
      tumbleweeds: this.weeds.filter((w) => Math.hypot(w.x - p.x, w.z - p.z) < 85).map((w) => ({ x: Math.round(w.x), z: Math.round(w.z) })),
      vultures: this.birds.map((b) => ({ x: Math.round(b.x), z: Math.round(b.z), y: Math.round(b.y), spooked: b.spook > 0 })),
      cowering: this.g.chars.filter((c) => c.cowerT > 0).map((c) => c.id),
    };
  }
}
