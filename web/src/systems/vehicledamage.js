import * as THREE from 'three';
import { PART } from './vehicles.js';

// Per-part vehicle damage you can SEE and FEEL.
//   zones   front/rear/left/right dent 0..1  → the mesh physically crumples there
//   parts   engine, radiator, fuel tank, lights, 4 tyres → handling, power, leaks
//   panels  bumpers, doors, hood → tear off as debris when a zone is caved in
// Local frame: +z forward, +x = driver's LEFT.

const DEBRIS_MAX = 140;
const _o = new THREE.Object3D();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const TYRES = ['FL', 'FR', 'RL', 'RR'];
const TYRE_PART = { FL: PART.wheelFL, FR: PART.wheelFR, RL: PART.wheelRL, RR: PART.wheelRR };

export class VehicleDamage {
  constructor(game) {
    this.g = game;
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.4 }), DEBRIS_MAX);
    this.debris.castShadow = true;
    this.debris.frustumCulled = false;
    for (let i = 0; i < DEBRIS_MAX; i++) { this.debris.setMatrixAt(i, ZERO); this.debris.setColorAt(i, _c.set('#555')); }
    game.scene.add(this.debris);
    this.pieces = [];
    this.next = 0;
  }

  init(v) {
    v.dmg = {
      engine: 1, radiator: 1, tank: 1, lights: 1,
      tyres: { FL: 1, FR: 1, RL: 1, RR: 1 },
      zones: { front: 0, rear: 0, left: 0, right: 0 },
      off: {}, // detached panels
      temp: 0, misfire: 0, dirty: false, deformT: 0,
    };
    v.fuel = v.fuelCap ?? 60;
    const pos = v.mesh.geometry.attributes.position;
    v.basePos = new Float32Array(pos.array);
    v.baseCol = new Float32Array(v.mesh.geometry.attributes.color.array);
  }

  // Which body zone faces local direction (lx, lz)?
  zoneOfLocal(v, lx, lz) {
    if (Math.abs(lz) / (v.len * 0.5) > Math.abs(lx) / (v.wid * 0.5)) return lz > 0 ? 'front' : 'rear';
    return lx > 0 ? 'left' : 'right';
  }
  toLocal(v, wx, wz) {
    const dx = wx - v.x, dz = wz - v.z;
    return { lx: dx * Math.cos(v.h) - dz * Math.sin(v.h), lz: dx * Math.sin(v.h) + dz * Math.cos(v.h) };
  }

  // A hit at world point (wx,wz) with strength (≈ impact speed in m/s for crashes).
  hit(v, wx, wz, strength, kind = 'crash') {
    if (!v.dmg || v.dead) return;
    const { lx, lz } = this.toLocal(v, wx, wz);
    const zone = this.zoneOfLocal(v, lx, lz);
    const d = v.dmg;
    let k = kind === 'crash' ? Math.max(0, strength - 4) * 0.035 : kind === 'blast' ? strength : strength * 0.004;
    if (kind === 'crash' && v.plates) k *= this.g.garage?.crashMul?.(v, zone) ?? 1; // a ram plate, a cowcatcher, I-beam bumpers (data/workshop.js)
    if (k <= 0) return;
    d.zones[zone] = Math.min(1, d.zones[zone] + k);
    d.dirty = true;
    // What lives behind that panel.
    if (zone === 'front') { d.engine = Math.max(0, d.engine - k * 0.55); d.radiator = Math.max(0, d.radiator - k * 0.9); d.lights = Math.max(0, d.lights - k * 0.8); }
    if (zone === 'rear') { d.tank = Math.max(0, d.tank - k * 0.7); }
    // The tyre on the struck corner.
    const tyre = (lz > 0 ? 'F' : 'R') + (lx > 0 ? 'L' : 'R');
    if (kind === 'bullet' && Math.random() < 0.12) this.popTyre(v, tyre);
    else if (kind !== 'bullet' && k > 0.18 && Math.random() < 0.5) d.tyres[tyre] = Math.max(0, d.tyres[tyre] - k);
    if (kind === 'bullet' && zone === 'front' && Math.random() < 0.25) d.engine = Math.max(0, d.engine - 0.04);
    if (kind === 'bullet' && zone === 'rear' && Math.random() < 0.3) d.tank = Math.max(0, d.tank - 0.06);
    // Panels tear off a caved-in zone.
    if (d.zones[zone] > 0.7 && (kind !== 'bullet')) {
      const drop = { front: ['bumperF', 'hood'], rear: ['bumperR'], left: ['doorL', 'doorL2'], right: ['doorR', 'doorR2'] }[zone];
      for (const p of drop) if (!d.off[p] && Math.random() < 0.6) this.detach(v, p, zone, strength);
    }
    if (v.driver === this.g.player && kind === 'crash' && k > 0.1) this.g.emit('vehicleDamage', { vehicle: v.id, zone, dent: +d.zones[zone].toFixed(2) });
  }

  popTyre(v, t) {
    if (!v.dmg || v.dmg.tyres[t] <= 0) return;
    if (v.utility?.solidtyres) return; // puncture-proof: no air to lose (data/workshop.js UTILITY)
    v.dmg.tyres[t] = 0;
    v.dmg.dirty = true;
    this.g.audio.tyrePop?.(this.g.pan(v.x));
    this.g.fx.dust(v.x, v.z, 3);
    this.g.emit('tyrePopped', { vehicle: v.id, tyre: t });
    if (v.driver === this.g.player) this.g.hud.toast(`TYRE BLOWN (${t})`, 'warn');
  }

  // THE BREACH (docs/design/WEB_WORKSHOP.md §3): a hit on an armoured car's BARE face (its plate shot away, or never
  // fitted) reaches the parts behind that face. Deterministic shares of the damage, so a breach always costs something.
  breach(v, face, dmg, type = 'bullet') {
    const d = v.dmg;
    if (!d || v.dead || !(dmg > 0)) return;
    const k = dmg * (type === 'blast' ? 1.4 : type === 'pierce' ? 1.8 : 1), cut = (x, f) => Math.max(0, x - k * f);
    let part = null;
    if (face === 'front') { d.engine = cut(d.engine, 0.004); d.radiator = cut(d.radiator, 0.006); part = 'engine'; }
    else if (face === 'rear') { d.tank = cut(d.tank, 0.006); part = 'tank'; }
    else if (face === 'under') { d.tank = cut(d.tank, 0.004); d.engine = cut(d.engine, 0.002); for (const t of TYRES) d.tyres[t] = cut(d.tyres[t], 0.004); part = 'underside'; }
    else if (face === 'left' || face === 'right') {
      const s = face === 'left' ? 'L' : 'R';
      for (const t of ['F' + s, 'R' + s]) { d.tyres[t] = cut(d.tyres[t], 0.008); if (d.tyres[t] <= 0) this.popTyre(v, t); }
      part = 'tyres';
    }
    if (face === 'top' || face === 'left' || face === 'right') { // the crew on that side, or everyone under the roof
      for (const o of v.occ ?? []) if (o?.alive && (face === 'top' || v.seats?.[o.seat]?.side === face)) { this.g.combat.damage(o, k * 0.3, null, 0, 0); part ??= 'crew'; }
    }
    d.dirty = true;
    this.g.emit('breachHit', { vehicle: v.id, face, part, dmg: Math.round(dmg) });
  }

  // Tear a panel off: its vertices collapse, a debris chunk flies.
  detach(v, partName, zone, strength) {
    const id = PART[partName];
    const pa = v.mesh.geometry.attributes.part;
    if (!pa) return;
    let any = false;
    for (let i = 0; i < pa.count; i++) if (pa.array[i] === id) { any = true; break; }
    if (!any) return;
    v.dmg.off[partName] = true;
    v.dmg.dirty = true;
    const { x, z } = this.panelWorld(v, zone);
    const i = this.next; this.next = (this.next + 1) % DEBRIS_MAX;
    const sx = partName.startsWith('door') ? 0.1 : v.wid * 0.9, sz = partName.startsWith('door') ? 1.1 : 0.3;
    this.pieces[i] = { x, z, y: 1, vx: v.vx * 0.6 + (Math.random() - 0.5) * 5, vz: v.vz * 0.6 + (Math.random() - 0.5) * 5, vy: 3 + Math.random() * 3, rot: v.h, spin: (Math.random() - 0.5) * 8, sx, sy: partName.startsWith('door') ? 0.6 : 0.25, sz, t: 0 };
    this.debris.setColorAt(i, _c.set(partName.startsWith('bumper') ? '#2e2c2a' : v.paint));
    this.debris.instanceColor.needsUpdate = true;
    this.g.audio.crash?.(0.3);
    this.g.emit('panelLost', { vehicle: v.id, part: partName });
  }

  panelWorld(v, zone) {
    const lx = zone === 'left' ? v.wid / 2 : zone === 'right' ? -v.wid / 2 : 0;
    const lz = zone === 'front' ? v.len / 2 : zone === 'rear' ? -v.len / 2 : 0;
    const c = Math.cos(v.h), s = Math.sin(v.h);
    return { x: v.x + lx * c + lz * s, z: v.z - lx * s + lz * c };
  }

  // Crumple the mesh: push vertices inward around each dented zone, flatten tyres,
  // collapse detached panels. Runs only when damage changed (not every frame).
  deform(v) {
    const d = v.dmg, geo = v.mesh.geometry, pos = geo.attributes.position, pa = geo.attributes.part, col = geo.attributes.color;
    const base = v.basePos, bc = v.baseCol, L = v.len, W = v.wid;
    for (let i = 0; i < pos.count; i++) {
      let x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      const part = pa ? pa.array[i] : 0;
      const name = PART_NAME[part];
      if (name && d.off[name]) { pos.array[i * 3] = 0; pos.array[i * 3 + 1] = 0.9; pos.array[i * 3 + 2] = 0; continue; }
      if (part >= PART.wheelFL && part <= PART.wheelRR) {
        const t = TYRES[part - PART.wheelFL];
        if (d.tyres[t] <= 0) y = y * 0.7; // flat: the tyre squats onto the rim
      } else {
        // Smooth, noisy inward crush per zone.
        const nz = z / (L / 2), nx = x / (W / 2);
        const noise = 0.7 + 0.3 * Math.sin(x * 9.1 + y * 7.3 + z * 5.7);
        const f = d.zones.front * Math.max(0, nz - 0.35) / 0.65, r = d.zones.rear * Math.max(0, -nz - 0.35) / 0.65;
        const l = d.zones.left * Math.max(0, nx - 0.3) / 0.7, rt = d.zones.right * Math.max(0, -nx - 0.3) / 0.7;
        z -= f * 0.7 * noise * (L / 4.6); z += r * 0.7 * noise * (L / 4.6);
        x -= l * 0.42 * noise; x += rt * 0.42 * noise;
        y -= (f + r + l + rt) * 0.18 * noise * Math.max(0, y - 0.5);
        // Scraped paint: crushed metal reads from above as bare, dark, scratched steel.
        const crush = Math.min(1, (f + r + l + rt) * 1.3) * (0.75 + 0.25 * Math.sin(x * 23 + z * 17));
        if (col && part !== PART.glass && part !== PART.light) {
          col.array[i * 3] = bc[i * 3] + (0.24 - bc[i * 3]) * crush;
          col.array[i * 3 + 1] = bc[i * 3 + 1] + (0.22 - bc[i * 3 + 1]) * crush;
          col.array[i * 3 + 2] = bc[i * 3 + 2] + (0.2 - bc[i * 3 + 2]) * crush;
        }
      }
      pos.array[i * 3] = x; pos.array[i * 3 + 1] = y; pos.array[i * 3 + 2] = z;
    }
    pos.needsUpdate = true;
    if (col) col.needsUpdate = true;
    geo.computeVertexNormals();
    d.dirty = false;
  }

  // Feel it: called from Vehicles.drive before forces apply. Returns modifiers.
  effects(v, dt) {
    const d = v.dmg, g = this.g;
    if (!d) return { power: 1, grip: 1, pull: 0, top: 1 };
    // Engine: power falls off, misfires, smoke; 0 = dead.
    let power = d.engine <= 0 ? 0 : 0.35 + 0.65 * d.engine;
    if ((v.empUntil ?? 0) > g.time) power = 0; // an EMP stalled it (systems/workshop.js)
    if (d.engine < 0.45 && v.throttle > 0) {
      d.misfire -= dt;
      if (d.misfire <= 0) { d.misfire = 0.4 + Math.random() * (d.engine * 3); power *= 0.1; g.audio.backfire?.(g.pan(v.x)); g.fx.smoke(v.x + Math.sin(v.h) * v.len * 0.4, 1.2, v.z + Math.cos(v.h) * v.len * 0.4, true); }
    }
    // Radiator: holed radiators overheat under throttle; boiling cooks the engine. A sound one sheds its heat: flat out
    // the temperature settles at 0.4, under the boil, so an hour on the interstate never cooks a healthy engine (it used
    // to climb 0.02 a second whatever the radiator, and every car died about a minute into a highway run). A holed one
    // can't keep up: half gone, it boils in about 20 s of throttle.
    const leakRate = 1 - d.radiator, cool = 0.05 * (1 - leakRate * 0.8);
    d.temp = Math.max(0, d.temp + dt * (v.throttle > 0 ? 0.02 + leakRate * 0.09 - cool * d.temp : -cool));
    if (d.temp > 1) { d.engine = Math.max(0, d.engine - dt * 0.05); if (Math.random() < dt * 8) g.fx.spawn(2, v.x + Math.sin(v.h) * v.len * 0.45, 1.4, v.z + Math.cos(v.h) * v.len * 0.45, 0, 2.5, 0, 1.2, 0.5, '#e8e4dc', -0.8); }
    if (d.temp > 1 && !d.warnedHot && v.driver === g.player) { d.warnedHot = true; g.hud.toast('ENGINE OVERHEATING', 'warn'); }
    if (d.temp < 0.8) d.warnedHot = false;
    // Fuel: burn by throttle, leak from a holed tank (leaving a dark trail).
    const burn = (0.012 + Math.max(0, v.throttle) * 0.05) * dt * (v.driver ? 1 : 0);
    const leak = d.tank < 0.65 ? (0.65 - d.tank) * 1.2 * dt : 0;
    v.fuel = Math.max(0, v.fuel - burn - leak);
    if (leak > 0) { d.trailT = (d.trailT ?? 0) - dt; if (d.trailT <= 0) { d.trailT = 0.18; g.fx.decal(v.x - Math.sin(v.h) * v.len * 0.45, v.z - Math.cos(v.h) * v.len * 0.45, 0.35 + Math.random() * 0.2, '#1c1a14'); g.fuelTrail?.push({ x: v.x, z: v.z, t: g.time }); } }
    if (v.fuel <= 0) power = 0;
    // Tyres: flats cost grip, pull the steering, cap speed, throw sparks off the rim.
    let grip = 1, pull = 0, top = 1;
    const flat = v.utility?.runflat ? 0.4 : 1; // run-flat inserts: a blown tyre still rolls (data/workshop.js UTILITY)
    for (const t of TYRES) if (d.tyres[t] <= 0) {
      grip -= 0.16 * flat; top -= 0.12 * flat;
      pull += (t[1] === 'L' ? 1 : -1) * 0.18 * flat; // drags toward the flat side
      if (Math.random() < dt * 10 * Math.min(1, g.vehiclesSys.speed(v) / 10)) g.fx.spawn(1, v.x, 0.3, v.z, (Math.random() - 0.5) * 4, 1, (Math.random() - 0.5) * 4, 0.25, 0.05, '#ffd060', 14);
    }
    // Lamps: one dies before the other (which one is fixed per car), both flicker once the wiring is
    // hurt, all dark at zero; a crushed tail takes the tail lamps. vehiclelights.js reads these.
    const flick = d.lights < 0.4 && Math.random() < 0.15, weakLeft = (v.id.charCodeAt(v.id.length - 1) & 1) === 0;
    v.lampL = !flick && d.lights > (weakLeft ? 0.55 : 0.05);
    v.lampR = !flick && d.lights > (weakLeft ? 0.05 : 0.55);
    v.tailsOn = d.zones.rear < 0.8;
    // Rebuild the crumpled mesh at most ~5x/s.
    d.deformT -= dt;
    if (d.dirty && d.deformT <= 0) { d.deformT = 0.2; this.deform(v); }
    const fx = { power, grip: Math.max(0.35, grip), pull, top: Math.max(0.5, top), brake: 1 };
    const out = g.upkeep ? g.upkeep.tick(v, dt, fx) : fx; // oil, the desert's heat, wear (systems/upkeep.js)
    if (v.brakeMul) out.brake = (out.brake ?? 1) * v.brakeMul; // a loaded car stops longer (garage.retune, data/workshop.js PERF)
    return out;
  }

  repair(v) {
    if (!v.dmg) return;
    v.dmg.engine = v.dmg.radiator = v.dmg.tank = v.dmg.lights = 1;
    for (const t of TYRES) v.dmg.tyres[t] = 1;
    for (const z of Object.keys(v.dmg.zones)) v.dmg.zones[z] = 0;
    v.dmg.off = {}; v.dmg.temp = 0; v.dmg.dirty = true; v.dmg.deformT = 0;
    if (v.baseCol) v.mesh.geometry.attributes.color.array.set(v.baseCol);
    v.hp = v.maxHp;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < DEBRIS_MAX; i++) {
      const p = this.pieces[i];
      if (!p) continue;
      p.t += dt;
      if (p.y > 0.12 || Math.abs(p.vx) + Math.abs(p.vz) > 0.2) {
        p.vy -= 20 * dt;
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
        if (p.y < 0.12) { p.y = 0.12; p.vy *= -0.3; p.vx *= 0.55; p.vz *= 0.55; p.spin *= 0.5; }
        const t = { x: p.x, z: p.z };
        if (this.g.statics.resolveCircle(t, 0.3)) { p.vx *= -0.4; p.vz *= -0.4; p.x = t.x; p.z = t.z; }
        any = true;
      }
      _o.position.set(p.x, p.y, p.z); _o.rotation.set(p.y > 0.2 ? p.t * 3 : 0, p.rot, 0); _o.scale.set(p.sx, p.sy, p.sz); _o.updateMatrix();
      this.debris.setMatrixAt(i, _o.matrix);
    }
    if (any || this.pieces.length) this.debris.instanceMatrix.needsUpdate = true;
  }

  view(v) {
    const d = v.dmg;
    if (!d) return {};
    const r2 = (x) => Math.round(x * 100) / 100;
    return { parts: { engine: r2(d.engine), radiator: r2(d.radiator), tank: r2(d.tank), lights: r2(d.lights), tyres: Object.fromEntries(TYRES.map((t) => [t, r2(d.tyres[t])])), dents: Object.fromEntries(Object.entries(d.zones).map(([k, x]) => [k, r2(x)])), panelsLost: Object.keys(d.off), engineTemp: r2(d.temp) }, fuel: Math.round(v.fuel), fuelCap: v.fuelCap };
  }
}

const PART_NAME = Object.fromEntries(Object.entries(PART).map(([k, v]) => [v, k]));
