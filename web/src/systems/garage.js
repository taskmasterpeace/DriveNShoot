import * as THREE from 'three';
import { VEHICLES } from './vehicles.js';
import { PLATE, MOUNT_OK } from '../data/parts.js';
import { FACES6, ARMOR, CHASSIS, PERF, POWER, MOUNT_WEAPONS, UTILITY, PAINTS } from '../data/workshop.js';

// The garage: what a car WEARS (data/workshop.js rows; the old data/parts.js Kenji numbers are the 'plate' kind).
//   v.plates    = { front, rear, left, right, top, under } points; v.plateKind = { <face>: <ARMOR id> } (default 'plate')
//                 a hit on a plated face spends plate instead of hull; a face shot down to nothing is BREACHED and
//                 hits go through to the parts behind it (vehicledamage.breach)
//   v.mounts    = { <face>: { kind, ammo | charges, cool, ... } } one per mount point (hood, tail, pods, turret)
//   v.utility   = { <UTILITY id>: { charges? } }
//   v.power     = { e, cap, regen } for the energy guns
// Weight re-tunes the car from its base row (data/workshop.js PERF: slower off the line, a lower top speed, a lazier turn,
// longer stops). The counter, the guns and the screen are systems/workshop.js and ui/workshop.js.
// Plates and mounts are drawn by one InstancedMesh packed each frame from the cars near the player.
const MAX_INST = 420, MAX_SPIKES = 96, MAX_TYRES = 64, VIEW_R = 90, MAX_HAZARDS = 32;
const FACES = ['front', 'rear', 'left', 'right'];
const STEEL = new THREE.Color('#4b4945'), GUN = new THREE.Color('#1c1c1c'), RUST = new THREE.Color('#6a3a22'), BRASS = new THREE.Color('#9a7a3a'),
  TILE = new THREE.Color('#77705f'), BLADE = new THREE.Color('#5d5a54'), TIP = new THREE.Color('#9b2a1c'), TANK = new THREE.Color('#5a4a22'), COIL = new THREE.Color('#3f6f78'),
  RUBBER = new THREE.Color('#151413'), EDGE = new THREE.Color('#c9c2b2');
const KIND_TONE = { plate: STEEL, sheet: new THREE.Color('#6a665e'), ablative: TILE, spaced: new THREE.Color('#3e3c38'), ram: BLADE, plow: RUST, spikes: STEEL };
const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), ONE = new THREE.Vector3(1, 1, 1);
const EMPTY = Object.freeze({});

// Which trigger a mount answers (data/workshop.js MOUNT_WEAPONS group): 1 aimed (hood, pods), 2 the tail, 3 the turret.
export const groupOf = (face, W) => W?.group ?? (face === 'rear' ? 2 : face === 'top' ? 3 : 1);

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
    // Hub spikes are cones (one more instanced draw, only while a spiked car is near): tip along +x.
    this.spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 10).rotateZ(-Math.PI / 2).translate(0.5, 0, 0), new THREE.MeshStandardMaterial({ color: '#cfc8b8', roughness: 0.3, metalness: 0.8 }), MAX_SPIKES);
    this.spikes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.spikes.frustumCulled = false; this.spikes.castShadow = true; this.spikes.count = 0; this.spikes.visible = false;
    game.scene.add(this.spikes);
    // Monster tyres are cylinders (axle along x), tyre and hub as instance colours: one more draw, only near monsters.
    this.tyres = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 20).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.1 }), MAX_TYRES);
    this.tyres.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tyres.setColorAt(0, RUBBER);
    this.tyres.frustumCulled = false; this.tyres.castShadow = true; this.tyres.count = 0; this.tyres.visible = false;
    game.scene.add(this.tyres);
    this.hazards = [];
  }

  base(v) { return VEHICLES[v.type] ?? VEHICLES.sedan; }
  chassisKey(v) { return this.base(v).base ?? v.type; }
  chassis(v) { return CHASSIS[this.chassisKey(v)] ?? null; }
  maxFor(v) { return this.chassis(v)?.faces ?? null; }
  kindOf(v, face) { return v.plateKind?.[face] ?? 'plate'; }

  // Everything bolted on, in kilograms; the spaces the guns and gadgets take.
  kgOn(v) {
    let kg = 0;
    if (v.plates) for (const f of FACES6) kg += (v.plates[f] ?? 0) * (ARMOR[this.kindOf(v, f)]?.kg ?? PLATE.kg);
    for (const f in v.mounts ?? EMPTY) { const m = v.mounts[f]; if (m) kg += MOUNT_WEAPONS[m.kind]?.kg ?? 0; }
    for (const u in v.utility ?? EMPTY) kg += UTILITY[u]?.kg ?? 0;
    return kg;
  }
  spacesUsed(v) {
    let n = 0;
    for (const f in v.mounts ?? EMPTY) { const m = v.mounts[f]; if (m) n += MOUNT_WEAPONS[m.kind]?.size ?? 1; }
    for (const u in v.utility ?? EMPTY) n += UTILITY[u]?.space ?? 0;
    return n;
  }
  has(v, u) { return !!v.utility?.[u]; }
  // The fitted tread row's numbers (data/workshop.js UTILITY set 'tread'), or null on stock tyres.
  tread(v) { for (const u in v.utility ?? EMPTY) { const T = UTILITY[u]?.tread; if (T) return T; } return null; }

  // What the load does to the car (data/workshop.js PERF, the formula in docs/design/WEB_WORKSHOP.md §4). `extraKg` and
  // `extra` let the workshop screen preview a row before you pay for it, without touching the car.
  perf(v, extraKg = 0, util = v.utility ?? EMPTY) {
    const s = this.base(v), mass = s.mass + (this.kgOn(v) + extraKg) / 1000, ratio = s.mass / mass;
    let tread = null;
    for (const u in util) if (UTILITY[u]?.tread) tread = UTILITY[u].tread;
    const turbo = util.turbo ? UTILITY.turbo : null, mon = util.monster ? UTILITY.monster.monster : null, nitro = (v.nitroUntil ?? 0) > this.g.time ? UTILITY.nitrous.burst : null;
    return {
      mass, ratio,
      accel: s.accel * ratio * (turbo?.accel ?? 1) * (nitro?.accel ?? 1),
      maxSpeed: s.maxSpeed * (1 - PERF.topLoss * (1 - ratio)) * (turbo?.top ?? 1) * (nitro?.top ?? 1) * (mon?.top ?? 1),
      turn: s.turn * ratio ** PERF.turnExp * (mon?.turn ?? 1),
      brake: ratio ** PERF.brakeExp,
      grip: s.grip * (util.solidtyres ? UTILITY.solidtyres.grip : 1),
      paved: tread?.paved ?? 1, dirt: tread?.dirt ?? 1, // the tyres' grip on and off pavement (stock tyres: 1)
    };
  }
  retune(v) {
    const p = this.perf(v), s = this.base(v);
    v.mass = p.mass; v.accel = p.accel; v.maxSpeed = p.maxSpeed; v.turn = p.turn; v.brakeMul = p.brake; v.grip = p.grip;
    v.fuelCap = (s.fuelCap ?? 60) + (v.utility?.fueltank ? UTILITY.fueltank.fuel : 0);
    // Tyres: the tread's grip is sampled live (workshop.update: pavement or not); with no tread fitted it is 1.
    const T = this.tread(v);
    v.wadeLift = T?.wade ?? 0;
    v.liftY = v.utility?.monster ? UTILITY.monster.monster.lift : 0; // monster tyres: the body rides this much higher
    if (!T) { v.treadGrip = undefined; v.treadTop = undefined; }
    if (v.fuel > v.fuelCap) v.fuel = v.fuelCap;
    // Power: the alternator, plus a battery bank and a power plant.
    let cap = POWER.alternator.cap, regen = POWER.alternator.regen;
    for (const u in v.utility ?? EMPTY) { const P = UTILITY[u]?.power; if (P) { cap += P.cap; regen += P.regen; } }
    v.power ??= { e: cap };
    v.power.cap = cap; v.power.regen = regen; v.power.e = Math.min(v.power.e, cap);
  }

  // Add points to one face (or 'sides' / 'all'), of a kind (data/workshop.js ARMOR; default the old boiler plate). A face
  // carries one kind: changing it means stripping it first. Returns { ok, why, added }.
  plate(v, face, points, kind) {
    const max = this.maxFor(v);
    if (!max) return { ok: false, why: `a ${v.name} can't carry plate` };
    const faces = face === 'sides' ? ['left', 'right'] : face === 'all' ? FACES : [face];
    v.plates ??= { front: 0, rear: 0, left: 0, right: 0, top: 0, under: 0 };
    let added = 0;
    for (const f of faces) {
      if (!(f in max)) return { ok: false, why: `no face "${f}"` };
      v.plates[f] ??= 0;
      const k = kind ?? this.kindOf(v, f), A = ARMOR[k];
      if (!A) return { ok: false, why: `unknown plate kind ${k}; known: ${Object.keys(ARMOR).join(',')}` };
      if (!A.faces.includes(f)) return { ok: false, why: `${A.name} does not go on the ${f}` };
      if (v.plates[f] > 0 && this.kindOf(v, f) !== k && points > 0) return { ok: false, why: `the ${f} is ${ARMOR[this.kindOf(v, f)].name}: strip it first` };
      if (points > 0 && this.kgOn(v) + points * A.kg > (this.chassis(v)?.maxKg ?? Infinity)) return { ok: false, why: `over the ${v.name}'s load (${this.chassis(v).maxKg} kg)` };
      const n = Math.max(0, Math.min(max[f], v.plates[f] + points)) - v.plates[f];
      v.plates[f] += n; added += n;
      if (v.plates[f] > 0) { v.plateKind ??= {}; v.plateKind[f] = k; }
    }
    this.retune(v);
    return { ok: added !== 0, why: added ? '' : 'that face is full', added };
  }

  // Can this mount point take that row? (the counter checks the money and the clock on top)
  canMount(v, face, kind) {
    const W = MOUNT_WEAPONS[kind], C = this.chassis(v);
    if (!W) return `unknown mount; known: ${Object.keys(MOUNT_WEAPONS).join(',')}`;
    if (!C) return `a ${v.name} can't be worked on`;
    const P = C.mounts[face];
    if (!P) return `a ${v.name} has no ${face} mount`;
    if (!W.faces.includes(face)) return `a ${W.name} does not go on the ${face}`;
    if (P.drops && W.kind !== 'drop') return `the ${face} mount on a ${v.name} only takes droppers (what it pulls is in the way)`;
    if (W.size > P.size) return `the ${face} mount is too small for a ${W.name} (size ${P.size}, it needs ${W.size})`;
    const old = v.mounts?.[face], oldKg = old ? MOUNT_WEAPONS[old.kind]?.kg ?? 0 : 0, oldSz = old ? MOUNT_WEAPONS[old.kind]?.size ?? 1 : 0;
    if (this.spacesUsed(v) - oldSz + W.size > C.spaces) return `no room: ${C.spaces} spaces, ${this.spacesUsed(v) - oldSz} used`;
    if (this.kgOn(v) - oldKg + W.kg > C.maxKg) return `over the ${v.name}'s load (${C.maxKg} kg)`;
    return null;
  }
  setMount(v, face, kind) {
    const W = MOUNT_WEAPONS[kind];
    v.mounts ??= {};
    v.mounts[face] = W.kind === 'drop' ? { kind, charges: W.mag } : { kind, ammo: W.mag, cool: 0, alt: false };
    if (W.kind === 'harpoon') v.harpoonMount = face;
    this.retune(v);
  }
  unmount(v, face) {
    const m = v.mounts?.[face];
    if (!m) return null;
    delete v.mounts[face];
    if (v.harpoonMount === face) v.harpoonMount = null;
    if (!Object.keys(v.mounts).length) v.mounts = undefined;
    this.retune(v);
    return m.kind;
  }

  // The old Kenji verb: a gun goes on the hood, a dropper on the tail.
  mount(v, kind) {
    const W = MOUNT_WEAPONS[kind];
    if (!W) return { ok: false, why: `unknown mount; known: ${Object.keys(MOUNT_WEAPONS).join(',')}` };
    const legacy = MOUNT_OK[this.chassisKey(v)];
    if (legacy && ['mg', 'oil', 'caltrops', 'smoke'].includes(kind) && !legacy.includes(kind)) return { ok: false, why: `a ${v.name} can't take a ${W.name}` };
    const face = W.kind === 'drop' ? 'rear' : 'front', why = this.canMount(v, face, kind);
    if (why) return { ok: false, why };
    this.setMount(v, face, kind);
    return { ok: true, why: '' };
  }

  addUtility(v, id) {
    const U = UTILITY[id], C = this.chassis(v);
    if (!U) return { ok: false, why: `unknown utility; known: ${Object.keys(UTILITY).join(',')}` };
    if (!C) return { ok: false, why: `a ${v.name} can't be worked on` };
    if (v.utility?.[id]) return { ok: false, why: `already fitted: ${U.name}` };
    if (U.chassis && !U.chassis.includes(this.chassisKey(v))) return { ok: false, why: `${U.name} won't go on a ${v.name}` };
    if (U.glass && !this.g.carCombat?.layout(v)) return { ok: false, why: `a ${v.name} has no windshield to pull` };
    const swap = U.set ? Object.keys(v.utility ?? EMPTY).find((u) => UTILITY[u]?.set === U.set) : null; // one tread a car: the old set comes off
    const swapKg = swap ? UTILITY[swap].kg : 0;
    if (U.needs && !v.harpoon && !Object.values(v.mounts ?? EMPTY).some((m) => MOUNT_WEAPONS[m.kind]?.kind === U.needs)) return { ok: false, why: `the ${U.name.toLowerCase()} needs a ${U.needs} gun fitted first` }; // the winch rides a harpoon (WEB_GADGETS2.md)
    if (this.spacesUsed(v) + U.space > C.spaces) return { ok: false, why: `no room: ${C.spaces} spaces, ${this.spacesUsed(v)} used` };
    if (this.kgOn(v) - swapKg + U.kg > C.maxKg) return { ok: false, why: `over the ${v.name}'s load (${C.maxKg} kg)` };
    if (swap) delete v.utility[swap];
    v.utility ??= {};
    v.utility[id] = U.charges ? { charges: U.charges } : {};
    if (U.trunk) { const t = this.g.inventory?.trunk(v); if (t) t.cap += U.trunk; }
    if (U.openFront) this.g.carCombat?.pullWindshield(v, true);
    this.retune(v);
    return { ok: true, why: '', swapped: swap ?? undefined };
  }
  removeUtility(v, id) {
    if (!v.utility?.[id]) return false;
    delete v.utility[id];
    const U = UTILITY[id];
    if (U?.trunk) { const t = this.g.inventory?.trunk(v); if (t) t.cap = Math.max(0, t.cap - U.trunk); }
    if (U?.openFront) this.g.carCombat?.pullWindshield(v, false);
    if (!Object.keys(v.utility).length) v.utility = undefined;
    this.retune(v);
    return true;
  }

  refill(v) {
    let n = 0;
    for (const f in v.mounts ?? EMPTY) {
      const m = v.mounts[f], W = MOUNT_WEAPONS[m.kind];
      if (!W) continue;
      if ('charges' in m) { n += W.mag - m.charges; m.charges = W.mag; } else if (W.mag) { n += W.mag - m.ammo; m.ammo = W.mag; }
    }
    for (const u in v.utility ?? EMPTY) if (UTILITY[u]?.charges) { n += UTILITY[u].charges - v.utility[u].charges; v.utility[u].charges = UTILITY[u].charges; }
    return n;
  }

  // ---- THE BREACH --------------------------------------------------------------------------------------------------
  // How much of `dmg` (of `type`) the face's plate stops; spends the plate. Returns what gets through. A rail slug
  // punches through: plate takes a share of it and the rest goes on.
  soak(v, face, dmg, type = 'bullet', by = null) {
    const P = v.plates;
    if (!P || !(P[face] > 0)) return dmg;
    const A = ARMOR[this.kindOf(v, face)] ?? ARMOR.plate, per = A.absorb * (A.vs?.[type] ?? 1);
    const cap = P[face] * per, stopped = Math.min(cap, type === 'pierce' ? dmg * 0.35 : dmg);
    P[face] = Math.max(0, P[face] - stopped / per);
    if (P[face] < 0.05) this.breached(v, face, by);
    return dmg - stopped;
  }
  breached(v, face, by) {
    v.plates[face] = 0;
    this.retune(v);
    if (this.g.workshop) this.g.workshop.stats.breaches++;
    if (v.driver === this.g.player) this.g.hud?.toast?.(`${face === 'rear' ? 'BACK' : face.toUpperCase()} ARMOR BREACHED`, 'hot');
    this.g.emit('breach', { vehicle: v.id, face, by: by?.id ?? null });
  }

  // A bullet hit a vehicle at world (x, z) (systems/combat.js): if that face carries plate, the plate takes it and this
  // returns true. An armoured car's bare face is breached: the round reaches the parts behind it (vehicledamage.breach),
  // and the hull and glass take it as they always did (returns false).
  absorb(v, x, z, dmg, type = 'bullet', faceIn) {
    const P = v.plates;
    if (!P) return false;
    const D = this.g.vehDamage, face = faceIn ?? D.zoneOfLocal(v, D.toLocal(v, x, z).lx, D.toLocal(v, x, z).lz);
    if (!(P[face] > 0)) { D.breach?.(v, face, dmg, type); return false; }
    const A = ARMOR[this.kindOf(v, face)] ?? ARMOR.plate, per = A.absorb * (A.vs?.[type] ?? 1);
    P[face] = Math.max(0, P[face] - dmg / per);
    if (P[face] < 0.05) this.breached(v, face, null);
    this.g.audio.ricochet?.(this.g.pan(x), Math.hypot(x - this.g.player.x, z - this.g.player.z));
    return true;
  }

  // Collisions (minimal hooks in vehicles.js / vehicledamage.js): what a face takes and what it hands out.
  faceAt(v, x, z) { const D = this.g.vehDamage, l = D.toLocal(v, x, z); return D.zoneOfLocal(v, l.lx, l.lz); }
  crashMul(v, zone) {
    let k = 1;
    if (v.plates?.[zone] > 0) k *= ARMOR[this.kindOf(v, zone)]?.crash ?? 1;
    if (v.utility?.bumpers && (zone === 'front' || zone === 'rear')) k *= UTILITY.bumpers.crash;
    return k;
  }
  ramMul(v, x, z) {
    if (!v.plates) return v.utility?.monster && this.faceAt(v, x, z) === 'front' ? UTILITY.monster.monster.crush : 1; // monster tyres climb what they hit
    const f = this.faceAt(v, x, z);
    return (v.plates[f] > 0 ? ARMOR[this.kindOf(v, f)]?.ram ?? 1 : 1) * (v.utility?.monster && f === 'front' ? UTILITY.monster.monster.crush : 1);
  }

  // The driver squeezes the trigger (main.js handleShooting): if any aimed mount (hood, pods) has the aim in its arc it
  // fires (or waits on its rate) and this returns true; outside every arc the driver shoots out of the window instead.
  fireFront(v, shooter, ang) {
    const r = this.g.workshop?.fireMount(v, 1, ang, shooter);
    return !!r && r.inArc > 0;
  }

  // The tail (B): drop whatever it carries (and fire a tail gun straight back). Returns what was dropped, or null.
  drop(v) {
    const r = this.g.workshop?.fireMount(v, 2, v.h + Math.PI, v.driver ?? null);
    return r?.dropped ?? null;
  }

  hazard(kind, x, z, r, life, extra) {
    if (this.hazards.length >= MAX_HAZARDS) this.hazards.shift();
    const h = { kind, x, z, r, until: this.g.time + life, hit: new Set(), t0: this.g.time };
    if (extra) Object.assign(h, extra);
    this.hazards.push(h);
    return h;
  }

  update(dt) {
    const g = this.g, W = MOUNT_WEAPONS;
    // Hazards: oil spins whoever drives through it, caltrops take a tyre, a mine goes up, paint blinds.
    for (let i = this.hazards.length - 1; i >= 0; i--) if (this.hazards[i].until < g.time || this.hazards[i].spent) this.hazards.splice(i, 1);
    for (const v of g.vehicles) {
      if (v.gripT > 0) { v.gripT -= dt; if (v.gripT <= 0) v.gripMul = 1; }
      if (!this.hazards.length || v.dead || v.boat) continue;
      const sp = Math.hypot(v.vx, v.vz);
      for (const h of this.hazards) {
        if (Math.abs(v.x - h.x) > h.r + v.len || Math.abs(v.z - h.z) > h.r + v.len) continue;
        if (h.kind === 'mine') {
          if (h.owner === v || g.time - h.t0 < W.minedrop.mine.arm) continue;
          let near = false;
          for (const d of g.vehiclesSys.discs(v)) if (Math.hypot(d.x - h.x, d.z - h.z) < h.r + d.r * 0.5) { near = true; break; }
          if (near) { h.spent = true; g.workshop?.mineBlast(h, v); }
          continue;
        }
        if (h.kind === 'paint') {
          if (h.owner === v || Math.hypot(v.x - h.x, v.z - h.z) > h.r + v.wid * 0.5) continue;
          if (!h.hit.has(v.id)) { h.hit.add(v.id); v.blindUntil = g.time + W.paint.cloud.blind; g.emit('painted', { vehicle: v.id }); if (v.driver === g.player) g.hud?.toast?.('WINDSHIELD PAINTED — YOU ARE BLIND', 'hot'); }
          continue;
        }
        if (sp < 3 || Math.hypot(v.x - h.x, v.z - h.z) > h.r) continue;
        if (h.kind === 'oil') {
          v.gripMul = W.oil.slick.grip; v.gripT = 1.2;
          if (!h.hit.has(v.id)) { h.hit.add(v.id); v.av += (Math.random() < 0.5 ? -1 : 1) * W.oil.slick.spin; g.emit('slipped', { vehicle: v.id }); }
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
    const g = this.g, P = g.player, M = this.mesh, SP = this.spikes, TY = this.tyres;
    let n = 0, ns = 0, nt = 0;
    const tyre = (lx, ly, lz, w, r, col) => {
      if (nt >= MAX_TYRES) return;
      _q.identity();
      _l.compose(_p.set(lx, ly, lz), _q, _s.set(w, r, r));
      TY.setMatrixAt(nt, _l.premultiply(_m)); TY.setColorAt(nt++, col);
    };
    // A cone from the hub out: (lx, ly, lz) its base in the body frame, `len` long, pointing yaw (0 = +x) and tipped `tilt`.
    const spike = (lx, ly, lz, len, rad, yaw, tilt = 0) => {
      if (ns >= MAX_SPIKES) return;
      _q.setFromEuler(_e.set(0, yaw, tilt));
      _l.compose(_p.set(lx, ly, lz), _q, _s.set(len, rad, rad));
      SP.setMatrixAt(ns++, _l.premultiply(_m));
    };
    const put = (lx, ly, lz, sx, sy, sz, col, yaw = 0, pitch = 0) => {
      if (n >= MAX_INST) return;
      _q.setFromEuler(_e.set(pitch, yaw, 0));
      _l.compose(_p.set(lx, ly, lz), _q, _s.set(sx, sy, sz));
      M.setMatrixAt(n, _l.premultiply(_m));
      M.setColorAt(n++, col);
    };
    for (const v of g.vehicles) {
      if (!v.plates && !v.mounts && !v.utility) continue;
      if (Math.abs(v.x - P.x) > VIEW_R || Math.abs(v.z - P.z) > VIEW_R || v.sunk) continue;
      _m.compose(v.group.position, v.group.quaternion, ONE);
      const L = v.len, W = v.wid, pl = v.plates, roof = (v.tall ?? 1.8) * 0.94;
      if (pl) {
        const t = (pts) => 0.05 + Math.min(pts, 30) * 0.008, tone = (f) => KIND_TONE[this.kindOf(v, f)] ?? STEEL;
        if (pl.front > 0) {
          const k = this.kindOf(v, 'front');
          if (k === 'ram') put(0, 0.62, L / 2 + 0.3, W * 1.02, 0.42, 0.34, BLADE, 0, -0.35);
          else if (k === 'plow') for (let i = -2; i <= 2; i++) put(i * W * 0.2, 0.5, L / 2 + 0.38, 0.08, 0.56, 0.5, RUST, 0, -0.5);
          else put(0, 0.72, L / 2 + 0.16, W * 0.92, 0.5, t(pl.front), tone('front'));
          if (k === 'spikes') for (let i = -2; i <= 2; i++) put(i * W * 0.2, 0.6, L / 2 + 0.38, 0.06, 0.06, 0.5, STEEL);
        }
        if (pl.rear > 0) put(0, 0.74, -L / 2 - 0.14, W * 0.9, 0.48, t(pl.rear), tone('rear'));
        if (pl.left > 0) put(W / 2 + 0.04, 0.82, -0.1, t(pl.left), 0.52, L * 0.58, tone('left'));
        if (pl.right > 0) put(-W / 2 - 0.04, 0.82, -0.1, t(pl.right), 0.52, L * 0.58, tone('right'));
        for (const f of ['left', 'right']) if (pl[f] > 0 && this.kindOf(v, f) === 'spikes') for (let i = -1; i <= 1; i++) put((f === 'left' ? 1 : -1) * (W / 2 + 0.3), 0.8, i * L * 0.22, 0.5, 0.06, 0.06, STEEL);
        if (pl.top > 0) put(0, roof + 0.03, -0.25, W * 0.72, 0.05, L * 0.34, tone('top'));
        if (pl.under > 0) put(0, 0.28, 0, W * 0.94, 0.06, L * 0.86, tone('under'));
      }
      // Monster tyres stand out past the body and carry it 0.6 m higher (vehicles.js liftY); hub spikes are cones out of
      // the hub, one long blade straight out and four short ones round it.
      const U = v.utility;
      if (U?.monster || U?.hubspikes) {
        const MO = U.monster ? UTILITY.monster.monster : null;
        const r = 0.36 * (MO?.scale ?? 1), tw = MO ? 0.7 : 0.24, ax = L / 2 - Math.max(0.8, r * 0.95), cy = r - (MO?.lift ?? 0); // on the ground (or the roof it is climbing)
        const reach = U.hubspikes ? UTILITY.hubspikes.hub.reach : 0;
        for (const sx of [1, -1]) for (const az of [ax, -ax]) {
          const wx = sx * (W / 2 + (MO ? tw * 0.42 : 0.02));
          if (MO) { tyre(wx, cy, az, tw, r, RUBBER); tyre(wx + sx * tw * 0.5, cy, az, 0.06, r * 0.5, STEEL); }
          if (U.hubspikes) {
            const hx = wx + sx * (tw / 2 + 0.02), yaw = sx > 0 ? 0 : Math.PI;
            spike(hx, cy, az, reach + 0.15, 0.1, yaw);
            for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; spike(hx, cy + Math.sin(a) * r * 0.45, az + Math.cos(a) * r * 0.45, reach * 0.55, 0.06, yaw); }
          }
        }
      }
      const hy = (v.anchors?.head?.[0]?.[1] ?? 0.92) + 0.32;
      for (const f in v.mounts ?? EMPTY) {
        const m = v.mounts[f], Wr = MOUNT_WEAPONS[m.kind];
        if (!Wr) continue;
        // Where the mount sits and which way it points, in the body frame.
        const [mx, my, mz, yaw] = f === 'front' ? [0, hy, L / 2 - 0.62, 0] : f === 'rear' ? [0, 0.86, -L / 2 + 0.05, Math.PI]
          : f === 'left' ? [W / 2 + 0.12, 0.95, 0.2, Math.PI / 2] : f === 'right' ? [-W / 2 - 0.12, 0.95, 0.2, -Math.PI / 2]
          : [0, roof + 0.12, -0.15, (m.yaw ?? v.h) - v.h];
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        if (Wr.kind === 'drop') { put(mx, my, mz, 0.72, 0.32, 0.34, m.kind === 'smoke' || m.kind === 'flares' ? STEEL : m.kind === 'paint' ? TILE : RUST, yaw); continue; }
        if (f === 'top') put(mx, my - 0.06, mz, 0.7, 0.12, 0.7, STEEL, yaw); // the turret ring
        const body = Wr.kind === 'rocket' ? [0.5, 0.34, 0.7, RUST] : Wr.kind === 'flame' ? [0.42, 0.36, 0.6, TANK] : Wr.kind === 'rail' ? [0.36, 0.3, 0.9, COIL] : Wr.kind === 'beam' || Wr.kind === 'emp' ? [0.44, 0.34, 0.6, BRASS] : [0.62, 0.22, 0.42, GUN];
        put(mx, my, mz, body[0], body[1], body[2], body[3], yaw);
        const bl = Wr.kind === 'rail' ? 1.9 : Wr.kind === 'hitscan' ? (Wr.size > 1 ? 1.3 : 0.95) : Wr.kind === 'rocket' ? 0.2 : 0.7;
        const bx = mx + fx * (body[2] * 0.5 + bl * 0.5), bz = mz + fz * (body[2] * 0.5 + bl * 0.5);
        if (Wr.kind === 'rocket') { for (const o of [-0.13, 0.13]) put(bx + fz * o, my + 0.06, bz - fx * o, 0.14, 0.14, 0.22, TIP, yaw); continue; }
        if (m.kind === 'mg') for (const o of [-0.16, 0.16]) put(bx + fz * o, my + 0.05, bz - fx * o, 0.08, 0.08, bl, GUN, yaw);
        else put(bx, my + 0.04, bz, Wr.kind === 'rail' ? 0.14 : 0.1, Wr.kind === 'rail' ? 0.14 : 0.1, bl, Wr.kind === 'rail' ? BRASS : GUN, yaw);
      }
    }
    M.count = n;
    M.visible = n > 0;
    SP.count = ns; SP.visible = ns > 0; SP.instanceMatrix.needsUpdate = true;
    TY.count = nt; TY.visible = nt > 0; TY.instanceMatrix.needsUpdate = true; if (TY.instanceColor) TY.instanceColor.needsUpdate = true;
    M.instanceMatrix.needsUpdate = true;
    if (M.instanceColor) M.instanceColor.needsUpdate = true;
  }

  // Save/load (api.js snapshot): everything the car wears beyond plates and mounts.
  saveBuild(v) { return v.plateKind || v.utility || v.paintKey ? { plateKind: v.plateKind ? { ...v.plateKind } : undefined, utility: v.utility ? JSON.parse(JSON.stringify(v.utility)) : undefined, paintKey: v.paintKey } : undefined; }
  loadBuild(v, b) {
    v.plateKind = b?.plateKind ? { ...b.plateKind } : undefined; v.utility = b?.utility ? JSON.parse(JSON.stringify(b.utility)) : undefined;
    if (b?.paintKey && PAINTS[b.paintKey]) this.g.workshop?.paint(v, b.paintKey, true);
    this.g.carCombat?.pullWindshield(v, !!v.utility?.nowindshield);
  }

  view(v) {
    const s = this.base(v), C = this.chassis(v);
    return {
      vehicle: v.id, name: v.name, chassis: this.chassisKey(v),
      plates: v.plates ? Object.fromEntries(FACES6.map((f) => [f, +(v.plates[f] ?? 0).toFixed(1)])) : null, plateKind: v.plates ? Object.fromEntries(FACES6.map((f) => [f, this.kindOf(v, f)])) : null, plateMax: this.maxFor(v),
      mounts: v.mounts ? Object.fromEntries(Object.entries(v.mounts).map(([f, m]) => [f, 'charges' in m ? { kind: m.kind, charges: m.charges } : { kind: m.kind, ammo: m.ammo }])) : null,
      utility: v.utility ? Object.keys(v.utility) : [],
      kg: Math.round(this.kgOn(v)), maxKg: C?.maxKg ?? null, spaces: this.spacesUsed(v), maxSpaces: C?.spaces ?? null,
      mass: +v.mass.toFixed(3), accel: +v.accel.toFixed(2), maxSpeed: +v.maxSpeed.toFixed(2), turn: +v.turn.toFixed(3), brake: +(v.brakeMul ?? 1).toFixed(3),
      power: v.power ? { e: Math.round(v.power.e), cap: v.power.cap, regen: v.power.regen } : null,
      base: { mass: s.mass, accel: s.accel, maxSpeed: s.maxSpeed, turn: s.turn },
    };
  }
}
