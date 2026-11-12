// SKY DRONES (VEHICLES V2 slice 11; rows in data/skydrones.js). The factions' own drones, flown from NESTS at their bases.
//   WATCHER  lifts off when you come near its nest and flies a loop round it at its height, banking into the turn. When it
//            sees you (line of sight, a shorter look in the dark or crouched, nothing under a roof) it comes over you and
//            stays; if its people want you dead (your standing: ai.hostile) it radios it in every few seconds - the nest's
//            gun drone launches, and the faction's fighters inside radio range come for you. It loses you after a few
//            seconds out of sight and goes back to its loop; low on battery it flies home and charges on the pad.
//   GUN DRONE sits on the pad until a watcher calls, flies to where you were seen, circles you at its orbit and fires
//            bursts (a real round: combat.hitscan, so walls, cars and cover stop it). It gives up and goes home when it
//            has not seen you for a while.
// Both can be shot down (combat.js asks raycast() for a round crossing one): they fall, burst on the ground and leave what
// they were made of in a pile (the salvage rows); the nest builds a lost one again after NEST_RULES.rebuild game hours.
// One instanced mesh draws every pad and drone (written in place each frame, no allocation). Simulated only near you
// (NEST_RULES.wake); further off a nest's drones are on their pad.
import * as THREE from 'three';
import { SKY_DRONES, NEST_RULES, DRONE_NESTS } from '../data/skydrones.js';

const CAP = 160, _o = new THREE.Object3D(), _c = new THREE.Color();
const r1 = (v) => Math.round(v * 10) / 10;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// A sighting kept in place (no allocation a frame): where you were, and when.
const mark = (o, x, z, t) => { o ??= { x: 0, z: 0, t: 0 }; o.x = x; o.z = z; o.t = t; return o; };

export class SkyDrones {
  constructor(game) {
    this.g = game; game.skydrones = this;
    this.counts = { launched: 0, spotted: 0, calls: 0, shots: 0, down: 0, rebuilt: 0 };
    this.nests = DRONE_NESTS.map((N) => ({ ...N, awake: false, alert: null, proxy: { alive: true, faction: N.faction, fid: N.fid, fi: -1, weapon: 'drone', id: `nest:${N.id}` } }));
    this.drones = [];
    for (const N of this.nests) for (const kind of N.flies) this.drones.push(this.fresh(N, kind));
    this.mesh = null;
  }
  fresh(N, kind) {
    const D = SKY_DRONES[kind];
    return { id: `${N.id}:${kind}`, kind, D, nest: N, x: N.at.x + (kind === 'striker' ? 2.2 : -2.2), z: N.at.z, y: 0.25, h: 0, vx: 0, vz: 0, bank: 0,
      hp: D.hp, bat: D.battery, state: 'pad', seen: null, callT: 0, loopA: Math.random() * Math.PI * 2, gunT: 0, left: D.gun?.burst ?? 0, fall: 0, rebuildAt: 0, spokeAt: -99 };
  }
  hours() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }
  ground(x, z) { return this.g.fx?.ground?.(x, z) ?? 0; }

  // ---- looking --------------------------------------------------------------------------------------------------------
  sees(d, c) {
    const g = this.g;
    if (!c?.alive || c.ug || (c === g.player && g.insideBuilding)) return false;
    const night = g.sky?.night ?? 0, D = d.D;
    let r = D.sight[0] + (D.sight[1] - D.sight[0]) * night;
    if (!c.inVehicle && (c.crouch || c.prone)) r *= D.crouchMul;
    if (Math.hypot(c.x - d.x, c.z - d.z) > r) return false;
    return d.y > 5 || g.los(d.x, d.z, c.x, c.z); // from up high a wall hides nothing (a roof does: insideBuilding above); low, it looks like anyone
  }
  hostile(N) {
    const g = this.g, F = g.society?.factions;
    if (F && N.proxy.fi < 0 && N.fid) { N.proxy.fid = N.fid; N.proxy.fi = F.index?.[N.fid] ?? -1; }
    return !!g.ai?.hostile(N.proxy, g.player);
  }

  // ---- the sim --------------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g, P = g.player; if (!P || !(dt > 0)) return;
    const now = this.hours();
    for (const N of this.nests) {
      const awake = Math.hypot(P.x - N.at.x, P.z - N.at.z) < NEST_RULES.wake;
      if (!awake && N.awake) for (const d of this.drones) if (d.nest === N && d.state !== 'gone') this.dock(d); // out of mind: back on the pad
      N.awake = awake;
      if (N.alert && g.time - N.alert.t > NEST_RULES.giveUp) N.alert = null; // (a new one is made on the next call: every few seconds at most)
    }
    for (const d of this.drones) {
      if (d.state === 'gone') { if (now >= d.rebuildAt) { Object.assign(d, this.fresh(d.nest, d.kind)); d.bat = 0; this.counts.rebuilt++; g.emit?.('droneRebuilt', { drone: d.id }); } continue; }
      if (!d.nest.awake) { if (d.state === 'pad') d.bat = Math.min(d.D.battery, d.bat + dt * d.D.battery / d.D.recharge); continue; }
      if (d.state === 'falling') { this.falling(d, dt); continue; }
      if (d.state === 'pad') this.onPad(d, dt);
      else {
        d.bat -= dt;
        if (d.bat < d.D.battery * NEST_RULES.low && d.state !== 'home') d.state = 'home';
        if (d.D.role === 'recon') this.watch(d, dt); else this.hunt(d, dt);
      }
    }
    this.draw();
  }
  dock(d) { d.state = 'pad'; d.x = d.nest.at.x + (d.kind === 'striker' ? 2.2 : -2.2); d.z = d.nest.at.z; d.y = 0.25; d.vx = d.vz = 0; if (d.seen) d.seen.t = -1e9; }
  onPad(d, dt) {
    const N = d.nest, full = d.bat >= d.D.battery * 0.95;
    d.bat = Math.min(d.D.battery, d.bat + dt * d.D.battery / d.D.recharge);
    const go = d.D.role === 'recon' ? full : N.alert && d.bat >= d.D.battery * 0.5;
    if (go) { d.state = d.D.role === 'recon' ? 'patrol' : 'hunt'; this.counts.launched++; this.g.emit?.('droneLaunched', { drone: d.id, kind: d.kind }); }
  }
  // Fly toward (tx, tz) at the row's speed (or `k` of it), holding the row's height over the ground; bank into the turn.
  fly(d, tx, tz, dt, k = 1, alt = d.D.alt) {
    const dx = tx - d.x, dz = tz - d.z, dist = Math.hypot(dx, dz), sp = d.D.speed * k;
    const want = dist > 0.5 ? Math.min(sp, dist * 2.2) : 0, wx = dist > 0.01 ? dx / dist * want : 0, wz = dist > 0.01 ? dz / dist * want : 0;
    const a = Math.min(1, dt * 2.2);
    d.vx += (wx - d.vx) * a; d.vz += (wz - d.vz) * a;
    d.x += d.vx * dt; d.z += d.vz * dt;
    const spd = Math.hypot(d.vx, d.vz);
    if (spd > 0.4) { const h0 = d.h, h1 = Math.atan2(d.vx, d.vz), turn = wrap(h1 - h0); d.h = h0 + turn * Math.min(1, dt * 4); d.bank += (Math.max(-0.5, Math.min(0.5, -turn * 1.6)) - d.bank) * Math.min(1, dt * 5); }
    else d.bank *= Math.exp(-dt * 4);
    d.y += (alt - d.y) * Math.min(1, dt * 1.2);
    return dist;
  }
  goHome(d, dt) {
    const N = d.nest, px = N.at.x + (d.kind === 'striker' ? 2.2 : -2.2), dist = this.fly(d, px, N.at.z, dt, 1.1, dist2(d, px, N.at.z) < 3 ? 0.25 : d.D.alt);
    if (dist < 0.8 && d.y < 0.6) this.dock(d);
  }
  watch(d, dt) {
    const g = this.g, P = g.player, N = d.nest;
    if (d.state === 'home') return this.goHome(d, dt);
    const sees = this.sees(d, P);
    if (sees) {
      if (d.state !== 'track') { d.state = 'track'; this.counts.spotted++; g.emit?.('droneSpotted', { drone: d.id, x: r1(P.x), z: r1(P.z) }); if (g.time - d.spokeAt > 30) { d.spokeAt = g.time; g.hud?.toast?.(`A ${d.D.name} HAS YOU`, 'warn'); } }
      d.seen = mark(d.seen, P.x, P.z, g.time);
    }
    if (d.state === 'track') {
      if (!d.seen || g.time - d.seen.t > NEST_RULES.lose || Math.hypot(d.x - N.at.x, d.z - N.at.z) > NEST_RULES.wake * 0.8) { d.state = 'patrol'; if (d.seen) d.seen.t = -1e9; return; }
      this.fly(d, d.seen.x, d.seen.z, dt, 1.4); // a little quicker than its loop: it keeps up with a runner
      d.callT -= dt;
      if (sees && d.callT <= 0) { d.callT = d.D.call; if (this.hostile(N)) this.radio(d); }
      return;
    }
    d.loopA += dt * d.D.speed / N.loop; // the loop round the nest
    this.fly(d, N.at.x + Math.cos(d.loopA) * N.loop, N.at.z + Math.sin(d.loopA) * N.loop, dt);
  }
  // The call: the nest knows where you are; its gun drones go; its fighters in radio range come.
  radio(d) {
    const g = this.g, N = d.nest, P = g.player;
    N.alert = mark(N.alert, P.x, P.z, g.time); N.alert.by = d.id;
    this.counts.calls++; g.emit?.('droneCall', { drone: d.id, nest: N.id, x: r1(P.x), z: r1(P.z) });
    for (const o of this.drones) if (o.nest === N && o.D.role === 'armed' && o.state === 'hunt') o.seen = mark(o.seen, P.x, P.z, g.time);
    for (const c of g.chars) {
      if (!c.alive || c === P || c.fid !== N.fid || !c.weapon || c.target || c.ug) continue;
      if (Math.hypot(c.x - P.x, c.z - P.z) > NEST_RULES.radio || !g.ai?.hostile(c, P)) continue;
      c.target = P; c.state = 'fight';
    }
  }
  hunt(d, dt) {
    const g = this.g, P = g.player, N = d.nest, G = d.D.gun;
    if (d.state === 'home') return this.goHome(d, dt);
    const sees = this.sees(d, P);
    if (sees) d.seen = mark(d.seen, P.x, P.z, g.time);
    const last = d.seen && (!N.alert || d.seen.t >= N.alert.t) ? d.seen : N.alert ?? d.seen;
    if (!last || g.time - last.t > NEST_RULES.giveUp) { d.state = 'home'; return; }
    d.loopA += dt * d.D.speed * 0.6 / d.D.orbit; // circle where you are (or were)
    this.fly(d, last.x + Math.cos(d.loopA) * d.D.orbit, last.z + Math.sin(d.loopA) * d.D.orbit, dt);
    d.gunT -= dt;
    if (!sees || d.gunT > 0 || !this.hostile(N)) return;
    const dist = Math.hypot(P.x - d.x, P.z - d.z);
    if (dist > G.range) return;
    const a = Math.atan2(P.x - d.x, P.z - d.z) + (Math.random() - 0.5) * 2 * G.spread, dx = Math.sin(a), dz = Math.cos(a);
    const y = this.ground(d.x, d.z) + d.y;
    g.fx?.flash?.(d.x, y - 0.2, d.z, 0.7, 0.04);
    g.fx?.tracer?.(d.x, d.z, d.x + dx * Math.min(dist, G.range), d.z + dz * Math.min(dist, G.range), Math.max(1.3, y - 0.3), 0.05);
    g.audio?.gun?.('smg', dist, g.pan ? g.pan(d.x) : 0);
    g.noise?.(d.x, d.z, 40, null);
    g.combat?.hitscan(null, d.x, d.z, dx, dz, G.range, G.dmg, G.cal); // a real round: cover and cars stop it
    this.counts.shots++;
    d.left--; d.gunT = d.left > 0 ? G.rate : G.rest; if (d.left <= 0) d.left = G.burst;
  }
  falling(d, dt) {
    const g = this.g;
    d.fall += dt; d.vy = (d.vy ?? 0) - 9.8 * dt; d.y += d.vy * dt; d.x += d.vx * dt; d.z += d.vz * dt; d.h += dt * 6; d.bank += dt * 2;
    if (d.y > 0.2 && d.fall < 6) return;
    g.fx?.smoke?.(d.x, this.ground(d.x, d.z) + 0.5, d.z, true); g.fx?.sparks?.(d.x, this.ground(d.x, d.z) + 0.3, d.z, 0, 0, 10);
    g.audio?.crash?.(0.5);
    const pile = g.inventory?.groundAt?.(d.x, d.z);
    if (pile) for (const [id, n] of d.D.salvage) g.inventory.add(pile, id, n); // what it was made of
    g.emit?.('droneWreck', { drone: d.id, x: r1(d.x), z: r1(d.z) });
    d.state = 'gone'; d.rebuildAt = this.hours() + NEST_RULES.rebuild;
  }

  // ---- being shot (combat.js) -----------------------------------------------------------------------------------------
  // A round crossing a flying drone: seen from above, it passes under the guns' height only at the drone's own spot.
  raycast(ox, oz, dx, dz, max) {
    let best = null;
    for (const d of this.drones) {
      if (d.state === 'pad' || d.state === 'gone' || d.state === 'falling' || !d.nest.awake) continue;
      const px = d.x - ox, pz = d.z - oz, t = px * dx + pz * dz; if (t < 0 || t > max) continue;
      if (Math.abs(px * dz - pz * dx) > 0.9) continue;
      if (!best || t < best.t) best = { t, drone: d };
    }
    return best;
  }
  // The cursor on a drone in the air (main.js, after the birds): the camera ray passing within reach of its body puts the aim
  // on the drone's own spot at its height - the shot goes there, and raycast() above meets it.
  skyAim(ray, out) {
    let best = null, bd = Infinity;
    const o = ray.origin, v = ray.direction;
    for (const d of this.drones) {
      if (d.state === 'pad' || d.state === 'gone' || d.state === 'falling' || !d.nest.awake || d.y < 2.2) continue;
      const y = this.ground(d.x, d.z) + d.y, vx = d.x - o.x, vy = y - o.y, vz = d.z - o.z, t = vx * v.x + vy * v.y + vz * v.z;
      if (t <= 0) continue;
      const k = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - t * t));
      if (k < 1.3 && k < bd) { bd = k; best = d; }
    }
    if (best) { out.x = best.x; out.z = best.z; out.y = best.y; }
    return best;
  }
  hurt(d, dmg, by) {
    if (d.state === 'gone' || d.state === 'falling') return;
    const g = this.g;
    d.hp -= dmg; g.fx?.sparks?.(d.x, this.ground(d.x, d.z) + d.y, d.z, 0, 0, 4);
    if (by === g.player) { d.nest.alert = mark(d.nest.alert, g.player.x, g.player.z, g.time); d.nest.alert.by = 'shot'; d.seen = mark(d.seen, g.player.x, g.player.z, g.time); } // they know where it came from
    if (d.hp <= 0) {
      d.state = 'falling'; d.fall = 0; d.vy = 0; this.counts.down++;
      g.emit?.('droneDown', { drone: d.id, by: by?.id ?? null });
      if (by === g.player) g.hud?.toast?.(`${d.D.name} DOWN`, 'job');
    }
  }

  // ---- drawing --------------------------------------------------------------------------------------------------------
  // One box into the mesh: at (x, y, z) turned h and rolled `roll`, offset (lx, ly, lz) in its own frame, sized, coloured.
  put = (x, y, z, h, roll, lx, ly, lz, sx, sy, sz, col) => {
    if (this.n >= CAP) return;
    const c = Math.cos(h), s = Math.sin(h);
    _o.position.set(x + lx * c + lz * s, y + ly + lx * Math.sin(roll) * 0.6, z - lx * s + lz * c); _o.rotation.set(0, h, roll, 'YXZ'); _o.scale.set(sx, sy, sz); _o.updateMatrix();
    this.mesh.setMatrixAt(this.n, _o.matrix); this.mesh.setColorAt(this.n, _c.set(col)); this.n++;
  };
  ensureMesh() {
    if (this.mesh || !this.g.scene) return;
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.1 }), CAP);
    m.name = 'sky-drones'; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3); m.frustumCulled = false; m.count = 0; m.castShadow = true;
    m.material.userData.noCut = true; // the camera's cutaway would dither away a drone over your head
    this.g.scene.add(m); this.mesh = m;
  }
  draw() {
    let any = false; for (const N of this.nests) if (N.awake) any = true;
    if (!any) { if (this.mesh) this.mesh.count = 0; return; }
    this.ensureMesh(); if (!this.mesh) return;
    this.n = 0; const t = this.g.time ?? 0, M = this.mesh, put = this.put;
    for (const N of this.nests) {
      if (!N.awake) continue;
      const gy = this.ground(N.at.x, N.at.z);
      put(N.at.x, gy, N.at.z, 0, 0, 0, 0.08, 0, 7, 0.16, 3.4, '#2c2b28'); // the pad
      put(N.at.x, gy, N.at.z, 0, 0, 0, 0.17, 0, 6.4, 0.01, 0.14, '#d8a83a'); put(N.at.x, gy, N.at.z, 0, 0, 0, 0.17, 0, 0.14, 0.01, 2.8, '#d8a83a');
      put(N.at.x, gy, N.at.z, 0, 0, 3.8, 1.6, 0, 0.12, 3.2, 0.12, '#4a4842'); // the mast
      put(N.at.x, gy, N.at.z, 0, 0, 3.8, 3.25, 0, 0.5, 0.08, 0.08, '#4a4842'); // its aerial bar
      put(N.at.x, gy, N.at.z, 0, 0, 3.8, 0.45, 0.5, 0.5, 0.9, 0.4, '#3a3d34'); // the charger box
      put(N.at.x, gy, N.at.z, 0, 0, 3.8, 0.95, 0.5, 0.12, 0.1, 0.12, N.alert ? (Math.sin(t * 8) > 0 ? '#ff3b2a' : '#5a1a14') : '#5ad06a'); // its lamp: red while they hunt you
    }
    for (const d of this.drones) {
      if (d.state === 'gone' || !d.nest.awake) continue;
      const gy = this.ground(d.x, d.z), y = gy + d.y, spin = d.state === 'pad' ? 0 : t * 30, armed = d.D.role === 'armed', w = armed ? 1.35 : 1.1;
      put(d.x, y, d.z, d.h, d.bank, 0, 0, 0, w * 0.46, 0.22, w * 0.62, d.D.color); // the body pod
      put(d.x, y, d.z, d.h + Math.PI / 4, d.bank, 0, 0.04, 0, w * 1.75, 0.07, 0.11, '#232320'); // the X frame: one arm pair
      put(d.x, y, d.z, d.h - Math.PI / 4, d.bank, 0, 0.04, 0, w * 1.75, 0.07, 0.11, '#232320'); // and the other
      for (const [ax, az] of [[0.62, 0.62], [-0.62, 0.62], [0.62, -0.62], [-0.62, -0.62]]) {
        put(d.x, y, d.z, d.h, d.bank, ax * w, 0.1, az * w, 0.12, 0.12, 0.12, '#3a3a36'); // a motor
        put(d.x, y, d.z, d.h + spin + ax, d.bank, ax * w, 0.17, az * w, 0.78 * w, 0.012, 0.09, '#c8c2b4'); // its blades, a blur
        put(d.x, y, d.z, d.h + spin + ax + Math.PI / 2, d.bank, ax * w, 0.17, az * w, 0.78 * w, 0.012, 0.09, '#c8c2b4');
      }
      put(d.x, y, d.z, d.h, d.bank, 0, -0.14, w * 0.3, 0.16, 0.12, 0.16, d.state === 'track' || d.state === 'hunt' ? (Math.sin(t * 14) > 0 ? d.D.eye : '#3a1a14') : d.D.eye); // the eye
      if (armed) put(d.x, y, d.z, d.h, d.bank, 0, -0.2, w * 0.45, 0.09, 0.09, 0.75, '#1a1a18'); // the gun under its chin
      if (d.y > 1) put(d.x, gy + 0.04, d.z, d.h, 0, 0, 0, 0, w * 0.7, 0.01, w * 0.7, '#3a2c20'); // its shadow
    }
    M.count = this.n; M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true;
  }

  // ---- the agent, the save --------------------------------------------------------------------------------------------
  view() {
    return this.drones.map((d) => ({ id: d.id, kind: d.kind, nest: d.nest.id, state: d.state, x: r1(d.x), z: r1(d.z), y: r1(d.y), hp: Math.round(d.hp), bat: Math.round(d.bat), rebuildAt: d.state === 'gone' ? r1(d.rebuildAt) : null }));
  }
  save() { return { lost: this.drones.filter((d) => d.state === 'gone' || d.state === 'falling').map((d) => [d.id, r1(d.state === 'gone' ? d.rebuildAt : this.hours() + NEST_RULES.rebuild)]), hurt: this.drones.filter((d) => d.hp < d.D.hp && d.state !== 'gone').map((d) => [d.id, Math.round(d.hp)]) }; }
  load(s) {
    for (const d of this.drones) Object.assign(d, this.fresh(d.nest, d.kind));
    for (const [id, at] of s?.lost ?? []) { const d = this.drones.find((q) => q.id === id); if (d) { d.state = 'gone'; d.rebuildAt = at; } }
    for (const [id, hp] of s?.hurt ?? []) { const d = this.drones.find((q) => q.id === id); if (d && d.state !== 'gone') d.hp = hp; }
  }
}
function dist2(d, x, z) { return Math.hypot(d.x - x, d.z - z); }
