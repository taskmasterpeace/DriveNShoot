import * as THREE from 'three';
import { VEHICLES } from './vehicles.js';
import { PLATE, PLATE_MAX, LOAD, MOUNTS, MOUNT_OK } from '../data/parts.js';

// The garage: armour by facing, a gun on the hood, a dropper on the tail (data/parts.js).
//   v.plates = { front, rear, left, right } points; a bullet from a plated side spends plate instead of hull,
//              and a face shot down to nothing is breached (hits go through to the parts behind it).
//   v.mounts = { front: { kind, ammo, cool }, rear: { kind, charges } }
// Weight re-tunes the car from its base row: heavier means slower off the line, a lower top speed, a lazier turn.
// Plates and mounts are drawn by one InstancedMesh packed each frame from the cars near the player.
const MAX_INST = 320, VIEW_R = 90, MAX_HAZARDS = 24;
const FACES = ['front', 'rear', 'left', 'right'];
const STEEL = new THREE.Color('#4b4945'), GUN = new THREE.Color('#1c1c1c'), RUST = new THREE.Color('#6a3a22');
const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1);

export class Garage {
  constructor(game) {
    this.g = game;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.45 }), MAX_INST);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, STEEL);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    game.scene.add(this.mesh);
    this.hazards = [];
  }

  base(v) { return VEHICLES[v.type] ?? VEHICLES.sedan; }
  maxFor(v) { return PLATE_MAX[this.base(v).base ?? v.type] ?? null; }

  kgOn(v) {
    let kg = 0;
    if (v.plates) for (const f of FACES) kg += (v.plates[f] ?? 0) * PLATE.kg;
    for (const slot of ['front', 'rear']) { const m = v.mounts?.[slot]; if (m) kg += MOUNTS[m.kind]?.kg ?? 0; }
    return kg;
  }

  // Weight re-tunes the car from its base row.
  retune(v) {
    const s = this.base(v), mass = s.mass + this.kgOn(v) / 1000, ratio = s.mass / mass;
    v.mass = mass;
    v.accel = s.accel * ratio;
    v.maxSpeed = s.maxSpeed * (1 - LOAD.topLossPerMassRatio * (1 - ratio));
    v.turn = s.turn * ratio ** LOAD.turnExp;
  }

  // Add points to one face (or 'sides' for left and right). Returns { ok, why, added }.
  plate(v, face, points) {
    const max = this.maxFor(v);
    if (!max) return { ok: false, why: `a ${v.name} can't carry plate` };
    const faces = face === 'sides' ? ['left', 'right'] : face === 'all' ? FACES : [face];
    v.plates ??= { front: 0, rear: 0, left: 0, right: 0 };
    let added = 0;
    for (const f of faces) {
      if (!(f in max)) return { ok: false, why: `no face "${f}"` };
      const n = Math.max(0, Math.min(max[f], (v.plates[f] ?? 0) + points)) - (v.plates[f] ?? 0);
      v.plates[f] += n; added += n;
    }
    this.retune(v);
    return { ok: added !== 0, why: added ? '' : 'that face is full', added };
  }

  mount(v, kind) {
    const def = MOUNTS[kind];
    if (!def) return { ok: false, why: `unknown mount; known: ${Object.keys(MOUNTS).join(',')}` };
    if (!(MOUNT_OK[this.base(v).base ?? v.type] ?? []).includes(kind)) return { ok: false, why: `a ${v.name} can't take a ${def.name}` };
    v.mounts ??= {};
    v.mounts[def.slot] = def.slot === 'front' ? { kind, ammo: def.ammo, cool: 0, alt: false } : { kind, charges: def.charges };
    this.retune(v);
    return { ok: true, why: '' };
  }

  refill(v) {
    let n = 0;
    const f = v.mounts?.front, r = v.mounts?.rear;
    if (f) { n += MOUNTS[f.kind].ammo - f.ammo; f.ammo = MOUNTS[f.kind].ammo; }
    if (r) { n += MOUNTS[r.kind].charges - r.charges; r.charges = MOUNTS[r.kind].charges; }
    return n;
  }

  // A bullet hit a vehicle at world (x, z): if that face carries plate, the plate takes it. Returns true if absorbed.
  absorb(v, x, z, dmg) {
    const P = v.plates;
    if (!P) return false;
    const D = this.g.vehDamage, { lx, lz } = D.toLocal(v, x, z), face = D.zoneOfLocal(v, lx, lz);
    if (!(P[face] > 0)) return false;
    P[face] = Math.max(0, P[face] - dmg / PLATE.absorb);
    if (P[face] < 0.05) {
      P[face] = 0;
      this.retune(v);
      if (v.driver === this.g.player) this.g.hud?.toast?.(`${face.toUpperCase()} ARMOR BREACHED`, 'hot');
      this.g.emit('breach', { vehicle: v.id, face });
    }
    this.g.audio.ricochet?.(this.g.pan(x), Math.hypot(x - this.g.player.x, z - this.g.player.z));
    return true;
  }

  // The driver squeezes the trigger: if the aim is within the hood gun's arc, the gun fires (or waits on its rate)
  // and this returns true; outside the arc it returns false and the driver shoots out of the window instead.
  fireFront(v, shooter, ang) {
    const g = this.g, m = v.mounts?.front, def = m && MOUNTS[m.kind];
    if (!def) return false;
    const off = Math.atan2(Math.sin(ang - v.h), Math.cos(ang - v.h));
    if (Math.abs(off) > def.arc) return false;
    if (g.time < m.cool) return true;
    if (m.ammo <= 0) {
      if (g.time > (m.dry ?? 0)) { g.audio.empty(); m.dry = g.time + 0.5; if (shooter === g.player) g.hud?.toast?.(`${def.name} DRY — REFILL AT A GARAGE`, 'warn'); }
      return true;
    }
    m.cool = g.time + def.rate; m.ammo--;
    // Bolted to the frame: a few degrees of give toward the aim, then the spread.
    const a = v.h + Math.max(-0.07, Math.min(0.07, off)) + (Math.random() - 0.5) * 2 * def.spread;
    const lx = (m.alt = !m.alt) ? 0.32 : -0.32, lz = v.len / 2 + 0.55, c = Math.cos(v.h), s = Math.sin(v.h);
    const ox = v.x + lx * c + lz * s, oz = v.z - lx * s + lz * c;
    g.fx.flash(ox, 1.25, oz, 1.1, 0.04);
    g.audio.gun('smg', Math.hypot(ox - g.player.x, oz - g.player.z), g.pan(ox));
    g.noise(ox, oz, 55, shooter);
    g.combat.hitscan(shooter, ox, oz, Math.sin(a), Math.cos(a), def.range, def.dmg);
    return true;
  }

  // Drop whatever the tail carries. Returns what was dropped, or null.
  drop(v) {
    const g = this.g, m = v.mounts?.rear, def = m && MOUNTS[m.kind];
    if (!def) return null;
    if (m.charges <= 0) { if (v.driver === g.player) g.hud?.toast?.(`${def.name} EMPTY`, 'warn'); return null; }
    m.charges--;
    const back = -(v.len / 2 + 1.6), x = v.x + Math.sin(v.h) * back, z = v.z + Math.cos(v.h) * back;
    if (m.kind === 'oil') { this.hazard('oil', x, z, def.slick.r, def.slick.life); g.fx.decal(x, z, def.slick.r * 1.15, '#0d0b09'); }
    else if (m.kind === 'caltrops') { this.hazard('caltrops', x, z, def.field.r, def.field.life); for (let i = 0; i < 6; i++) g.fx.decal(x + (Math.random() - 0.5) * 4, z + (Math.random() - 0.5) * 4, 0.25, '#2a2724'); }
    else if (m.kind === 'smoke') { g.throwables.smokes.push({ x, z, r: 5.5, t: 0, dur: 14 }); g.audio.hiss?.(g.pan(x)); }
    g.audio.clink?.(g.pan(x));
    g.emit('dropped', { vehicle: v.id, kind: m.kind, x: +x.toFixed(1), z: +z.toFixed(1), left: m.charges });
    return m.kind;
  }

  hazard(kind, x, z, r, life) {
    if (this.hazards.length >= MAX_HAZARDS) this.hazards.shift();
    this.hazards.push({ kind, x, z, r, until: this.g.time + life, hit: new Set() });
  }

  update(dt) {
    const g = this.g;
    // Hazards: oil spins whoever drives through it, caltrops take a tyre.
    for (let i = this.hazards.length - 1; i >= 0; i--) if (this.hazards[i].until < g.time) this.hazards.splice(i, 1);
    for (const v of g.vehicles) {
      if (v.gripT > 0) { v.gripT -= dt; if (v.gripT <= 0) v.gripMul = 1; }
      if (!this.hazards.length || v.dead || v.boat) continue;
      const sp = Math.hypot(v.vx, v.vz);
      if (sp < 3) continue;
      for (const h of this.hazards) {
        if (Math.abs(v.x - h.x) > h.r + 2 || Math.abs(v.z - h.z) > h.r + 2 || Math.hypot(v.x - h.x, v.z - h.z) > h.r) continue;
        if (h.kind === 'oil') {
          v.gripMul = MOUNTS.oil.slick.grip; v.gripT = 1.2;
          if (!h.hit.has(v.id)) { h.hit.add(v.id); v.av += (Math.random() < 0.5 ? -1 : 1) * MOUNTS.oil.slick.spin; g.emit('slipped', { vehicle: v.id }); }
        } else if (h.kind === 'caltrops' && !h.hit.has(v.id)) {
          h.hit.add(v.id);
          const t = ['FL', 'FR', 'RL', 'RR'][Math.floor(Math.random() * 4)];
          g.vehDamage.popTyre(v, t); g.emit('caltrops', { vehicle: v.id, tyre: t });
        }
      }
    }
    this.pack();
  }

  // Plates and mounts on every car near the player: one instanced draw.
  pack() {
    const g = this.g, P = g.player, M = this.mesh;
    let n = 0;
    const put = (lx, ly, lz, sx, sy, sz, col) => {
      if (n >= MAX_INST) return;
      _l.compose(_p.set(lx, ly, lz), _q.identity(), _s.set(sx, sy, sz));
      M.setMatrixAt(n, _l.premultiply(_m));
      M.setColorAt(n++, col);
    };
    for (const v of g.vehicles) {
      if (!v.plates && !v.mounts) continue;
      if (Math.abs(v.x - P.x) > VIEW_R || Math.abs(v.z - P.z) > VIEW_R || v.sunk) continue;
      _m.compose(v.group.position, v.group.quaternion, ONE);
      const L = v.len, W = v.wid, pl = v.plates;
      if (pl) {
        const t = (pts) => 0.05 + pts * 0.008;
        if (pl.front > 0) put(0, 0.72, L / 2 + 0.16, W * 0.92, 0.5, t(pl.front), STEEL);
        if (pl.rear > 0) put(0, 0.74, -L / 2 - 0.14, W * 0.9, 0.48, t(pl.rear), STEEL);
        if (pl.left > 0) put(W / 2 + 0.04, 0.82, -0.1, t(pl.left), 0.52, L * 0.58, STEEL);
        if (pl.right > 0) put(-W / 2 - 0.04, 0.82, -0.1, t(pl.right), 0.52, L * 0.58, STEEL);
      }
      const f = v.mounts?.front, r = v.mounts?.rear, hy = (v.anchors?.head?.[0]?.[1] ?? 0.92) + 0.32;
      if (f) {
        put(0, hy, L / 2 - 0.62, 0.62, 0.22, 0.42, GUN);
        put(0.32, hy + 0.05, L / 2 - 0.05, 0.08, 0.08, 0.95, GUN);
        put(-0.32, hy + 0.05, L / 2 - 0.05, 0.08, 0.08, 0.95, GUN);
      }
      if (r) put(0, 0.86, -L / 2 + 0.05, 0.72, 0.32, 0.34, r.kind === 'smoke' ? STEEL : RUST);
    }
    M.count = n;
    M.visible = n > 0;
    M.instanceMatrix.needsUpdate = true;
    if (M.instanceColor) M.instanceColor.needsUpdate = true;
  }

  view(v) {
    const s = this.base(v);
    return {
      vehicle: v.id, name: v.name, plates: v.plates ? Object.fromEntries(FACES.map((f) => [f, +v.plates[f].toFixed(1)])) : null, plateMax: this.maxFor(v),
      mounts: v.mounts ? { front: v.mounts.front ? { kind: v.mounts.front.kind, ammo: v.mounts.front.ammo } : null, rear: v.mounts.rear ? { kind: v.mounts.rear.kind, charges: v.mounts.rear.charges } : null } : null,
      kg: this.kgOn(v), mass: +v.mass.toFixed(3), accel: +v.accel.toFixed(2), maxSpeed: +v.maxSpeed.toFixed(2), turn: +v.turn.toFixed(3),
      base: { mass: s.mass, accel: s.accel, maxSpeed: s.maxSpeed, turn: s.turn },
    };
  }
}
