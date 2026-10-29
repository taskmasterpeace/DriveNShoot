import * as THREE from 'three';
import { radialGlow } from '../world/textures.js';
import { GADGETS, BARRICADES } from '../data/gadgets.js';
import { ITEMS } from '../data/items.js';
import { Drones } from './drones.js';
import { Security } from './security.js';

// GADGETS (docs/design/WEB_GADGETS.md; rows in data/gadgets.js). Things you throw across a road, bury, string, stick on
// a car or a door, or set down to go hunting: each one is a record with a place, an owner, a kind and a state
// (flying -> arming -> armed -> spent). Triggers are checked against the live world every frame (gadgets are few), the
// effects go through the systems that already own them: blasts through throwables.explode (people, cars, glass, doors,
// the infected's ears), tyres through vehicledamage.popTyre, smoke into throwables.smokes (sight), noise through g.noise,
// light through the fx pool's fixed lights. Friendly fire is on: a mine does not know whose foot it is.
//
// It also owns the door verbs the interiors left open (barricade, wedge, lock and unlock with keys, breach) and builds
// the two systems that live beside it: g.drones (systems/drones.js) and g.security (systems/security.js).
//
// Drawing: every part of every gadget, drone and barricade is one instance of one box mesh; flares and blinking eyes are
// a second, additive glow mesh. Two draw calls, hidden when empty.
const MAX_PARTS = 900, MAX_GLOW = 48, G = 20;
const _o = new THREE.Object3D(), _c = new THREE.Color(), SAND = new THREE.Color('#a88c62');
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const TYRES = ['FL', 'FR', 'RL', 'RR'];
const WHEEL = { x: 0, z: 0 }, _q = { x: 0, z: 0, ux: 0, uz: 0 };
const r1 = (v) => Math.round(v * 10) / 10;

export class Gadgets {
  constructor(game) {
    this.g = game;
    this.list = [];      // { id, kind, def, x, y, z, vx, vy, vz, ux, uz, rot, owner, of, state, t, armAt, ref, hits, seen, ... }
    this.barred = [];    // doors held shut: { door, kind, by, at }
    this.seq = 0;
    this.counts = { placed: 0, thrown: 0, triggered: 0, tyres: 0, kills: 0, avoided: 0, spotted: 0, barricades: 0, breaches: 0, crafted: 0 };
    this.lastDet = null;
    this.parts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.15 }), MAX_PARTS);
    this.parts.castShadow = true; this.parts.count = 0; this.parts.frustumCulled = false;
    for (let i = 0; i < MAX_PARTS; i++) this.parts.setMatrixAt(i, ZERO);
    this.parts.setColorAt(0, _c.set('#444'));
    this.glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialGlow(), color: '#ff5a2a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), MAX_GLOW);
    this.glow.count = 0; this.glow.frustumCulled = false; this.glow.renderOrder = 3;
    this.glow.setColorAt(0, _c.set('#ff5a2a'));
    game.scene.add(this.parts, this.glow);
    this.n = 0; this.ng = 0;
    this.pickHold = 0;
    game.drones = this.drones = new Drones(game, this);
    game.security = this.security = new Security(game, this);
  }

  // ---- making them ---------------------------------------------------------------------------------------------------
  // From the pack (inventory.act 'gadget' / 'drone' / 'barricade' / 'wedge' / 'keys'). The slot is spent by inventory.use
  // after this returns ok.
  useItem(verb, id) {
    const g = this.g, P = g.player;
    if (verb === 'drone') return this.drones.launch(id.replace(/^drone_/, ''), P);
    if (verb === 'barricade' || verb === 'wedge') {
      const door = this.doorInReach(P);
      if (!door) return { ok: false, why: 'no door within reach' };
      return this.barricade(door, verb === 'wedge' ? 'wedge' : 'planks', P, false);
    }
    if (verb === 'keys') {
      const door = this.doorInReach(P);
      if (!door) return { ok: false, why: 'no door within reach' };
      return this.keyTurn(door, P, true);
    }
    const def = GADGETS[id];
    if (!def) return { ok: false, why: 'not a gadget' };
    if (P.inVehicle && def.verb !== 'throw') return { ok: false, why: 'not from in here' };
    let r;
    if (def.verb === 'throw') r = this.throwOne(id, P, g.aim.x, g.aim.z);
    else if (def.verb === 'attach') r = this.attach(id, P);
    else r = this.place(id, P.x + Math.sin(P.face) * 1.1, P.z + Math.cos(P.face) * 1.1, P.face, P);
    return r?.ok === false ? r : { ok: true, text: `${def.name.toUpperCase()} ${def.verb === 'throw' ? 'THROWN' : def.verb === 'attach' ? 'SET' : 'PLACED'}` };
  }

  make(kind, x, z, rot, owner, extra = {}) {
    const def = GADGETS[kind];
    const ux = Math.cos(rot), uz = -Math.sin(rot); // across the facing: the line a chain, a strip or a wire lies along
    const p = {
      id: `G${++this.seq}`, kind, def, x, y: 0.05, z, vx: 0, vy: 0, vz: 0, ux, uz, rot, owner: owner ?? null,
      of: owner?.faction === 'player' ? 'player' : owner?.faction ?? null, state: 'arming', t: 0, armAt: def.arm ?? 0,
      ref: null, hits: new Set(), seen: 0, life: def.life ?? Infinity, beep: 0, fuse: def.fuse ?? 0, rearmAt: 0, wailT: 0, lureT: 0, lit: 0,
      tx: null, hunt: null, lastSeen: 0, ...extra,
    };
    this.list.push(p);
    return p;
  }

  place(kind, x, z, rot, owner, extra = {}) {
    const def = GADGETS[kind];
    if (!def) return { ok: false, why: `unknown gadget ${kind}` };
    const q = { x, z }; this.g.statics.resolveCircle(q, 0.25); // never inside a wall
    const p = this.make(kind, q.x, q.z, rot, owner, extra);
    this.counts.placed++;
    this.g.audio.clink?.(this.g.pan(q.x));
    this.g.emit('gadgetPlaced', { id: p.id, kind, x: r1(q.x), z: r1(q.z), by: owner?.id ?? null });
    return p;
  }

  // An arc to (tx, tz): the same launch the grenades use. A chain or a strip lands lying across the throw.
  throwOne(kind, who, tx, tz) {
    const def = GADGETS[kind], g = this.g;
    if (!def) return { ok: false, why: `unknown gadget ${kind}` };
    const v = who.inVehicle, a = Math.atan2(tx - who.x, tz - who.z);
    const ox = (v ?? who).x + Math.sin(a) * (v ? v.wid * 0.6 : 0.5), oz = (v ?? who).z + Math.cos(a) * (v ? v.wid * 0.6 : 0.5);
    const l = g.throwables.launch(ox, oz, tx, tz, 1.5);
    // A chain or a strip swung from the roadside unrolls ALONG the throw: across the lane you threw it over.
    const p = this.make(kind, ox, oz, def.trigger === 'tyre' ? a + Math.PI / 2 : a, who, { state: 'flying', y: l.y, vx: l.vx + (v?.vx ?? 0), vy: l.vy, vz: l.vz + (v?.vz ?? 0) });
    this.counts.thrown++;
    g.audio.throwWhoosh?.(g.pan(ox));
    g.emit('gadgetThrown', { id: p.id, kind, by: who.id, x: r1(tx), z: r1(tz) });
    return p;
  }

  // Stuck on the car or the door in reach (a car alarm, a breach charge).
  attach(kind, who, target = null) {
    const g = this.g, def = GADGETS[kind];
    if (kind === 'breach_charge') {
      const door = target ?? this.doorInReach(who);
      if (!door) return { ok: false, why: 'no door within reach to set it on' };
      const p = this.make(kind, door.x + door.nx * 0.12 * Math.sign((who.x - door.x) * door.nx + (who.z - door.z) * door.nz || 1), door.z + door.nz * 0.12 * Math.sign((who.x - door.x) * door.nx + (who.z - door.z) * door.nz || 1), Math.atan2(door.nx, door.nz), who, { ref: door, state: 'armed' });
      this.counts.placed++;
      g.audio.clink?.(g.pan(door.x));
      g.emit('gadgetPlaced', { id: p.id, kind, door: door.id, by: who?.id ?? null });
      return p;
    }
    const car = target ?? g.vehicles.filter((c) => !c.dead && Math.hypot(c.x - who.x, c.z - who.z) < Math.max(3.6, c.len * 0.7)).sort((a, b) => Math.hypot(a.x - who.x, a.z - who.z) - Math.hypot(b.x - who.x, b.z - who.z))[0];
    if (!car) return { ok: false, why: `no car within reach to fit the ${def.name.toLowerCase()} to` };
    const p = this.make(kind, car.x, car.z, car.h, who, { ref: car, ox: 0, oz: 0 });
    this.counts.placed++;
    g.emit('gadgetPlaced', { id: p.id, kind, vehicle: car.id, by: who?.id ?? null });
    return p;
  }

  remove(p) { const i = this.list.indexOf(p); if (i >= 0) this.list.splice(i, 1); }
  byId(id) { return this.list.find((p) => p.id === id) ?? null; }

  // Back into the pack: a chain, a strip, bells (and anything not yet armed) - not a spent one.
  pickUp(p, who = this.g.player) {
    if (!p || p.state === 'spent' || p.state === 'flying') return { ok: false, why: 'nothing to take back' };
    if (!(p.def.pickup || p.state === 'arming' || p.kind === 'remote_charge' || p.kind === 'car_mine')) return { ok: false, why: `a set ${p.def.name.toLowerCase()} does not come back` };
    if (who === this.g.player) this.g.inventory?.stow(p.kind, 1);
    this.remove(p);
    this.g.emit('gadgetPicked', { id: p.id, kind: p.kind });
    return { ok: true, kind: p.kind };
  }

  // ---- triggers ------------------------------------------------------------------------------------------------------
  wheel(v, k) {
    const lx = (k & 1 ? -1 : 1) * (v.wid / 2 - 0.12), lz = (k < 2 ? 1 : -1) * (v.len / 2 - 0.92);
    const c = Math.cos(v.h), s = Math.sin(v.h);
    WHEEL.x = v.x + lx * c + lz * s; WHEEL.z = v.z - lx * s + lz * c;
    return WHEEL;
  }

  // Distance from (x, z) to the line a gadget lies along (half length L), in metres.
  lineDist(p, x, z, L) {
    const dx = x - p.x, dz = z - p.z;
    let s = dx * p.ux + dz * p.uz; if (s < -L) s = -L; else if (s > L) s = L;
    return Math.hypot(dx - p.ux * s, dz - p.uz * s);
  }

  // Who would set off a pressure plate or a wire: anyone on foot (not mid-leap), any car's wheels.
  // A faction that SAW the gadget steps around it (p.seen: a bitmask of faction indices).
  stepsAround(p, c) { return c.fi >= 0 && c.fi < 31 && (p.seen & (1 << c.fi)) !== 0; }

  checkTrigger(p) {
    const g = this.g, def = p.def;
    switch (def.trigger) {
      case 'tyre': {
        const L = def.len / 2 + 0.4;
        for (const v of g.vehicles) {
          if (v.dead || v.boat || Math.abs(v.x - p.x) > L + v.len || Math.abs(v.z - p.z) > L + v.len) continue;
          for (let k = 0; k < 4; k++) {
            const w = this.wheel(v, k), key = v.id + TYRES[k];
            if (p.hits.has(key) || this.lineDist(p, w.x, w.z, def.len / 2) > def.wid / 2 + 0.18) continue;
            p.hits.add(key);
            if ((v.dmg?.tyres[TYRES[k]] ?? 0) > 0 && [...p.hits].filter((h) => h.startsWith(v.id)).length <= def.effect.tyres) {
              g.vehDamage.popTyre(v, TYRES[k]); this.counts.tyres++;
              if (def.effect.drag) { v.vx *= 1 - def.effect.drag * 0.25; v.vz *= 1 - def.effect.drag * 0.25; v.av += (Math.random() - 0.5) * def.effect.drag * 2; }
              g.emit('gadgetTyre', { id: p.id, kind: p.kind, vehicle: v.id, tyre: TYRES[k] });
            }
          }
        }
        return null; // a strip stays where it is, armed, until somebody takes it back
      }
      case 'pressure': {
        const r = def.r;
        for (const c of g.chars) {
          if (!c.alive || c.inVehicle || c.leapT > 0 || Math.abs(c.x - p.x) > r || Math.abs(c.z - p.z) > r) continue;
          if (Math.hypot(c.x - p.x, c.z - p.z) > r) continue;
          if (this.stepsAround(p, c)) { const q = { x: c.x, z: c.z }, d = Math.hypot(q.x - p.x, q.z - p.z) || 1; c.x = p.x + ((q.x - p.x) / d) * (r + 0.1); c.z = p.z + ((q.z - p.z) / d) * (r + 0.1); continue; }
          return c;
        }
        for (const v of g.vehicles) {
          if (v.dead || v.boat || Math.abs(v.x - p.x) > v.len || Math.abs(v.z - p.z) > v.len) continue;
          for (let k = 0; k < 4; k++) { const w = this.wheel(v, k); if (Math.hypot(w.x - p.x, w.z - p.z) < r + 0.25) return v; }
        }
        return null;
      }
      case 'wire': {
        const L = def.wire / 2, off = p.kind === 'fan_mine' ? 1.1 : 0, cx = p.x + Math.sin(p.rot) * off, cz = p.z + Math.cos(p.rot) * off;
        const q = _q; q.x = cx; q.z = cz; q.ux = p.ux; q.uz = p.uz;
        for (const c of g.chars) {
          if (!c.alive || c.inVehicle || Math.abs(c.x - cx) > L + 1 || Math.abs(c.z - cz) > L + 1) continue;
          if (this.lineDist(q, c.x, c.z, L) < 0.32 && !this.stepsAround(p, c)) return c;
        }
        for (const v of g.vehicles) if (!v.dead && !v.boat && Math.abs(v.x - cx) < L + v.len && Math.abs(v.z - cz) < L + v.len && this.lineDist(q, v.x, v.z, L) < v.wid / 2) return v;
        return null;
      }
      case 'touch': {
        const car = p.ref;
        if (!car || car.dead) return car ?? null;
        const ownerIn = car.driver && (car.driver === p.owner || car.driver.faction === 'ally');
        if (car.driver && !ownerIn) return car.driver;
        if ((car.hp ?? 0) < (p.hp0 ??= car.hp)) return car; // somebody hit it
        for (const c of g.chars) {
          if (!c.alive || c.inVehicle || c === p.owner || c.faction === 'ally' || c.faction === 'zombie') continue;
          if (Math.abs(c.x - car.x) < car.len && Math.abs(c.z - car.z) < car.len && Math.hypot(c.x - car.x, c.z - car.z) < Math.max(def.r, car.len * 0.6)) return c;
        }
        return null;
      }
      case 'hunt': return this.hunt(p);
      default: return null;
    }
  }

  // Is t a fair target for a crawler set by owner? The infected always; for the player: anyone who shoots on sight.
  enemyOf(owner, t) {
    const g = this.g;
    if (!t?.alive || t === owner || t.faction === 'ally') return false;
    if (t.faction === 'zombie') return true;
    if (!owner) return t.faction === 'raider';
    return g.ai.hostile(t, owner) || g.ai.hostile(owner, t) || (owner === g.player && t.faction === 'raider');
  }

  // A crawler: picks the nearest enemy (a person, or a car with one at the wheel) inside its hunt radius, walks to it,
  // sits on it. Returns the thing it reached (it blows) or null.
  hunt(p) {
    const g = this.g, def = p.def, R = def.hunt;
    p.huntT = (p.huntT ?? 0) - this.dt;
    if (p.huntT <= 0 || (p.hunt && (p.hunt.dead || p.hunt.alive === false))) {
      p.huntT = 0.4; let best = null, bd = R;
      for (const c of g.chars) {
        if (Math.abs(c.x - p.x) > bd || Math.abs(c.z - p.z) > bd || !this.enemyOf(p.owner, c)) continue;
        const tx = c.inVehicle ? c.inVehicle.x : c.x, tz = c.inVehicle ? c.inVehicle.z : c.z, d = Math.hypot(tx - p.x, tz - p.z);
        if (d < bd && g.statics.lineOfSight(p.x, p.z, tx, tz)) { bd = d; best = c.inVehicle ?? c; }
      }
      if (best !== p.hunt) { p.hunt = best; if (best) g.emit('crawlerHunt', { id: p.id, target: best.id }); }
    }
    const t = p.hunt;
    if (!t) return null;
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
    if (d < def.r + (t.len ? t.wid * 0.5 : 0.3)) return t;
    const step = Math.min(d, def.speed * this.dt);
    const q = { x: p.x + (dx / d) * step, z: p.z + (dz / d) * step };
    g.statics.resolveCircle(q, 0.25);
    p.x = q.x; p.z = q.z; p.rot = Math.atan2(dx, dz);
    p.tick = (p.tick ?? 0) - this.dt;
    if (p.tick <= 0) { p.tick = 0.35; g.audio.clink?.(g.pan(p.x)); }
    return null;
  }

  // ---- effects -------------------------------------------------------------------------------------------------------
  fire(p, who = null) {
    const g = this.g, def = p.def, e = def.effect, by = p.owner;
    this.counts.triggered++;
    g.emit('gadgetTriggered', { id: p.id, kind: p.kind, by: who?.id ?? null, x: r1(p.x), z: r1(p.z) });
    if (e.blast) this.blast(p.x, p.z, e.blast, by);
    if (e.cone) this.cone(p, e.cone, by);
    if (e.breach && p.ref) this.breach(p.ref, by);
    if (e.smoke) g.throwables.smokes.push({ x: p.x, z: p.z, r: e.smoke.r, t: 0, dur: e.smoke.dur });
    if (e.gas) { p.gasT = e.gas.dur; g.audio.hiss?.(g.pan(p.x)); }
    if (e.noise) { g.noise(p.x, p.z, e.noise, by); g.zombies?.onNoise(p.x, p.z, e.noise * 1.5); }
    if (e.lure) { p.lureT = e.lure.dur; g.noise(p.x, p.z, Math.min(60, e.lure.r), by); }
    if (e.light) { p.lit = e.light.dur; g.audio.hiss?.(g.pan(p.x)); }
    if (e.wail) { p.wailT = e.wail; if (p.owner === g.player) g.hud?.toast(`CAR ALARM · ${this.where(p)}`, 'hot'); }
    if (e.alert) {
      g.audio.clink?.(g.pan(p.x)); g.audio.clink?.(g.pan(p.x));
      if (p.owner === g.player) g.hud?.toast(`BELLS · ${this.where(p)}`, 'warn');
      g.emit('bells', { id: p.id, by: who?.id ?? null, byFaction: who?.faction ?? null });
    }
    const keeps = e.lure || e.light || e.gas || e.wail;
    if (def.rearm) { p.state = 'tripped'; p.rearmAt = g.time + def.rearm; }
    else p.state = keeps ? 'burning' : 'spent';
    if (p.state === 'spent') this.remove(p);
  }

  where(p) {
    const P = this.g.player, d = Math.hypot(p.x - P.x, p.z - P.z), a = Math.atan2(p.x - P.x, -(p.z - P.z));
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return `${Math.round(d)} M ${dirs[(Math.round(a / (Math.PI / 4)) + 8) % 8]}`;
  }

  // A blast: the grenade's (people, glass, doors, the infected's ears, cars), then what a buried charge does to the
  // car on top of it: the floor comes up, the tyres go.
  blast(x, z, b, by) {
    const g = this.g;
    const before = new Set(); for (const c of g.chars) if (c.alive) before.add(c);
    g.throwables.explode(x, z, { blast: { r: b.r, dmg: b.dmg } }, by);
    for (const v of g.vehicles) {
      if (v.dead || v.boat) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d > b.r + v.len / 2) continue;
      const f = Math.max(0, 1 - Math.max(0, d - v.wid / 2) / b.r);
      g.vehiclesSys.damage(v, (b.car ?? 0) * f, by);
      for (let k = 0; k < 4; k++) { const w = this.wheel(v, k); if (Math.hypot(w.x - x, w.z - z) < b.r * 0.5) g.vehDamage.popTyre(v, TYRES[k]); }
      v.vy = Math.max(v.vy ?? 0, 6 * f); v.air = f > 0.4 || v.air;
    }
    for (const c of before) if (!c.alive) { this.counts.kills++; g.emit('gadgetKill', { id: c.id, faction: c.faction, by: by?.id ?? null }); }
  }

  // A fan of steel the way it faces: everyone and every car inside the cone and the line of sight.
  cone(p, k, by) {
    const g = this.g, half = (k.deg * Math.PI) / 360, fx = Math.sin(p.rot), fz = Math.cos(p.rot);
    g.fx.explosion(p.x, p.z);
    g.audio.explosion(Math.hypot(p.x - g.player.x, p.z - g.player.z));
    g.noise(p.x, p.z, 80, by);
    for (let i = 0; i < 14; i++) { const a = p.rot + (Math.random() - 0.5) * 2 * half; g.fx.sparks(p.x, 0.6, p.z, Math.sin(a), Math.cos(a), 2); }
    for (const c of g.chars) {
      if (!c.alive || c.inVehicle) continue;
      const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
      if (d > k.r || d < 0.01 || (dx * fx + dz * fz) / d < Math.cos(half)) continue;
      if (!g.statics.lineOfSight(p.x, p.z, c.x, c.z)) continue;
      g.combat.damage(c, k.dmg * (1 - (d / k.r) * 0.6), by, dx / d, dz / d, 'explosion');
      if (!c.alive) { this.counts.kills++; g.emit('gadgetKill', { id: c.id, faction: c.faction, by: by?.id ?? null }); }
    }
    for (const v of g.vehicles) {
      if (v.dead) continue;
      const dx = v.x - p.x, dz = v.z - p.z, d = Math.hypot(dx, dz);
      if (d > k.r + v.len / 2 || (dx * fx + dz * fz) / (d || 1) < Math.cos(half)) continue;
      g.vehiclesSys.damage(v, k.dmg * 0.5 * (1 - d / (k.r + v.len)), by);
      g.vehDamage.hit(v, p.x, p.z, 0.4, 'bullet');
      if (v.windows) for (const s of Object.keys(v.windows)) if (Math.random() < 0.6) g.carCombat.damageWindow(v, s, 9999, by);
    }
    g.interiors?.blast(p.x + fx * 2, p.z + fz * 2, 3, by);
  }

  breach(door, by) {
    const g = this.g, I = g.interiors;
    if (door.locked) I.unlock(door, 'breach', by, true, door.x + door.nx * 2, door.z + door.nz * 2);
    else I.fling(door, door.x + door.nx * 2, door.z + door.nz * 2, by, 14);
    this.counts.breaches++;
    g.emit('breach', { door: door.id, by: by?.id ?? null, how: 'charge' });
  }

  // ---- doors -----------------------------------------------------------------------------------------------------------
  doorInReach(who) {
    const I = this.g.interiors;
    const t = I?.nearest(who);
    if (t?.leaves) return t;
    let best = null, bd = 2.4;
    for (const d of I?.doors ?? []) { const k = Math.hypot(d.x - who.x, d.z - who.z); if (k < bd && !d.broken) { bd = k; best = d; } }
    return best;
  }

  // Hold a door shut: a wedge, planks or the room's furniture. Locks it (systems/interiors.js) and adds the barricade's
  // hp and kicks to what a boot or the infected's fists must take off. spend: take what it needs from the pack (false
  // when inventory.use spends it).
  barricade(door, kind = 'planks', by = this.g.player, spend = true) {
    const g = this.g, B = BARRICADES[kind];
    if (!B) return { ok: false, why: `kinds: ${Object.keys(BARRICADES).join(', ')}` };
    if (door.broken) return { ok: false, why: 'that door is off its hinges' };
    if (this.barred.some((b) => b.door === door && b.kind === kind)) return { ok: false, why: `it is already ${B.name}` };
    if (spend && B.needs && by === g.player) {
      if (!g.inventory?.carried.count(B.needs)) return { ok: false, why: `you need ${ITEMS[B.needs]?.name.toLowerCase() ?? B.needs}` };
      g.inventory.spend(B.needs, 1);
    }
    const I = g.interiors;
    if (!door.locked) I.setLocked(door, true);
    door.lockHp += B.hp; door.kicks += B.kicks;
    this.barred.push({ door, kind, by: by?.id ?? null, at: g.time });
    door.barricade = kind;
    this.counts.barricades++;
    g.noise(door.x, door.z, B.noise, by);
    for (let k = 0; k < 3; k++) g.audio.thud?.(g.pan(door.x));
    g.emit('barricaded', { door: door.id, kind, by: by?.id ?? null, lockHp: Math.round(door.lockHp), kicks: door.kicks });
    return { ok: true, text: `DOOR ${B.name.toUpperCase()}`, took: B.time, lockHp: Math.round(door.lockHp), kicks: door.kicks };
  }

  unbarricade(door, by = this.g.player) {
    const had = this.barred.filter((b) => b.door === door);
    if (!had.length) return { ok: false, why: 'nothing holds that door' };
    this.barred = this.barred.filter((b) => b.door !== door);
    door.barricade = null;
    this.g.interiors.setLocked(door, false);
    this.g.emit('unbarricaded', { door: door.id, by: by?.id ?? null });
    return { ok: true, text: 'BARRICADE DOWN' };
  }

  // A key turns a lock both ways, quietly: the bull's ring fits any door in town; a door key only the door it names.
  keyTurn(door, by = this.g.player, needKey = true) {
    const g = this.g, inv = g.inventory;
    if (needKey && by === g.player) {
      const ring = inv?.hasTag('keys'), own = inv?.carried.slots.some((s) => s.id === 'door_key' && (!s.door || s.door === door.id));
      if (!ring && !own) return { ok: false, why: 'no key that fits' };
    }
    if (door.barricade) return { ok: false, why: `it is ${BARRICADES[door.barricade].name} from inside` };
    if (door.locked) { g.interiors.setLocked(door, false); g.emit('doorUnlocked', { door: door.id, how: 'key', by: by?.id ?? null }); g.audio.clink?.(g.pan(door.x)); return { ok: true, text: 'UNLOCKED', locked: false }; }
    const open = door.leaves.some((L) => Math.abs(L.th) > 0.12);
    if (open) return { ok: false, why: 'shut it first' };
    g.interiors.setLocked(door, true);
    g.emit('doorLocked', { door: door.id, how: 'key', by: by?.id ?? null });
    g.audio.clink?.(g.pan(door.x));
    return { ok: true, text: 'LOCKED', locked: true };
  }

  // ---- AI: drivers who see a chain or a strip ahead brake, or steer round the end of it (vehicles.aiDrive calls this
  // last, so it has the final word on the wheel). A buried mine is seen only once a faction has spotted it.
  steer(v, dt) {
    if (!this.list.length || v.driver === this.g.player) return;
    const g = this.g, fx = Math.sin(v.h), fz = Math.cos(v.h), sp = Math.hypot(v.vx, v.vz), night = g.sky?.night ?? 0;
    for (const p of this.list) {
      if (p.state !== 'armed' && p.state !== 'arming') continue;
      const def = p.def;
      if (!(def.trigger === 'tyre' || (def.trigger === 'pressure' && this.stepsAround(p, v.driver ?? {})))) continue;
      const spot = def.notice.spot * (night > 0.5 ? (v.lights ? 0.6 : 0.3) : 1);
      const dx = p.x - v.x, dz = p.z - v.z, along = dx * fx + dz * fz;
      if (along < 1 || along > spot + sp * 0.3) continue;
      // Both ends of it, across the car's path (+ = the car's left).
      const L = (def.len ?? 1) / 2, e1 = (dx + p.ux * L) * fz - (dz + p.uz * L) * fx, e2 = (dx - p.ux * L) * fz - (dz - p.uz * L) * fx;
      const lo = Math.min(e1, e2), hi = Math.max(e1, e2), half = v.wid / 2 + 0.6;
      if (hi < -half || lo > half) continue; // it is not in the way
      if (!g.statics.lineOfSight(v.x, v.z, p.x, p.z)) continue;
      // Round the nearer end, if there is room (a strip half across a lane), else stand on the brakes.
      const left = hi + half, right = lo - half, side = Math.abs(left) < Math.abs(right) ? left : right, room = Math.abs(side) < Math.max(1.5, along * 0.18);
      if (room) { v.steer = Math.max(-1, Math.min(1, Math.sign(side) * 1)); v.throttle = Math.min(v.throttle, sp > 9 ? -0.4 : 0.3); }
      else { v.throttle = sp > 0.5 ? -1 : 0; v.handbrake = false; }
      const key = `avoid:${v.id}`;
      if (!p.hits.has(key)) { p.hits.add(key); this.counts.avoided++; g.emit('gadgetAvoided', { id: p.id, kind: p.kind, vehicle: v.id, how: room ? 'swerve' : 'brake', along: r1(along) }); }
    }
  }

  // People on foot who see one: a careful look turns into the whole faction knowing (they step around it after).
  notice(dt) {
    const g = this.g, night = g.sky?.night ?? 0;
    for (const p of this.list) {
      if (p.state !== 'armed') continue;
      const spot = p.def.notice.spot * (1 - 0.65 * night);
      if (spot < 1) continue;
      for (const c of g.chars) {
        if (!c.alive || c.inVehicle || c === g.player || c.faction === 'zombie' || !(c.fi >= 0) || c.fi > 30 || c.sleeping) continue;
        if (Math.abs(c.x - p.x) > spot || Math.abs(c.z - p.z) > spot) continue;
        if ((p.seen & (1 << c.fi)) || p.owner === c) continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d > spot || Math.random() > dt * 1.4 * (1 - d / spot)) continue;
        if (!g.los(c.x, c.z, p.x, p.z)) continue;
        p.seen |= 1 << c.fi; this.counts.spotted++;
        g.emit('gadgetSpotted', { id: p.id, kind: p.kind, by: c.id, faction: c.faction, d: r1(d) });
      }
    }
  }

  // ---- the loop ------------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g, P = g.player;
    this.dt = dt;
    this.security.update(dt);
    this.drones.update(dt);
    // ` (the detonate row; the workshop has U): every remote charge you set goes up (a drone in the air drops its bomb).
    if (g.input.hit('Backquote') && !g.dialogue?.active) { if (this.drones.piloting) this.drones.dropBomb(); else this.detonate(P); }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i], def = p.def;
      p.t += dt;
      if (p.state === 'flying') { this.fly(p, dt); continue; }
      if (p.ref && p.ref.len !== undefined) { // on a car: rides along
        const v = p.ref; p.x = v.x; p.z = v.z; p.rot = v.h;
        if (v.dead && p.state !== 'burning') { this.remove(p); continue; }
      }
      if (p.state === 'arming') { if (p.t >= p.armAt) { p.state = 'armed'; g.emit('gadgetArmed', { id: p.id, kind: p.kind }); } else continue; }
      if (p.state === 'tripped') { if (g.time >= p.rearmAt) p.state = 'armed'; continue; }
      if (p.state === 'burning') { this.burn(p, dt); continue; }
      if (p.state !== 'armed') continue;
      if (def.trigger === 'timer') { p.fuse -= dt; if (p.fuse <= 0) this.fire(p); continue; }
      if (def.trigger === 'remote' || def.trigger === 'impact') continue;
      if (p.t > p.life + p.armAt) { this.fire(p); continue; } // a crawler that found nothing: it sits down and goes
      if (Math.abs(p.x - P.x) > 300 || Math.abs(p.z - P.z) > 300) continue; // far off: nothing walks there that matters
      const who = this.checkTrigger(p);
      if (who) this.fire(p, who);
    }
    this.noticeT = (this.noticeT ?? 0) - dt;
    if (this.noticeT <= 0) { this.noticeT = 0.5; this.notice(0.5); }
    this.barricades();
    this.pickupPrompt(dt);
    this.draw();
  }

  fly(p, dt) {
    const g = this.g;
    p.vy -= G * dt;
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 0.01) {
      const ux = p.vx / sp, uz = p.vz / sp, step = sp * dt;
      const hit = g.statics.raycast(p.x, p.z, ux, uz, step + 0.1, 0, p.y);
      if (hit < step + 0.1 && g.statics.hit.box && p.y < (g.statics.hit.box.height ?? 3)) { p.vx *= -0.2; p.vz *= -0.2; }
    }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y > 0.06) return;
    p.y = 0.05; p.vx = p.vy = p.vz = 0;
    if (p.def.trigger === 'impact') { g.audio.glass?.(g.pan(p.x)); this.fire(p); return; }
    p.state = 'arming'; p.t = 0;
    g.audio.clink?.(g.pan(p.x));
    g.emit('gadgetLanded', { id: p.id, kind: p.kind, x: r1(p.x), z: r1(p.z) });
  }

  // What keeps going after it went: a lure ticking, a flare burning on the pooled lights, gas, an alarm wailing.
  burn(p, dt) {
    const g = this.g, e = p.def.effect;
    let live = false;
    if (p.lureT > 0) {
      live = true; p.lureT -= dt; p.beep -= dt;
      if (p.beep <= 0) {
        p.beep = 1;
        g.zombies?.onNoise(p.x, p.z, e.lure.r);
        const R = e.lure.r;
        for (const c of g.chars) if (c.alive && c.faction === 'zombie' && !c.ztarget && Math.abs(c.x - p.x) < R && Math.abs(c.z - p.z) < R) { c.wx = p.x; c.wz = p.z; c.timer = 4; c.lured = p.id; }
        if (p.kind === 'noise_maker') g.audio.clink?.(g.pan(p.x));
      }
    }
    if (p.lit > 0) {
      live = true; p.lit -= dt; p.flick = (p.flick ?? 0) - dt;
      if (p.flick <= 0) { p.flick = 0.2; g.fx.light(p.x, 1.2, p.z, '#ff4a26', 46 + Math.random() * 14, 0.32); }
      if (Math.random() < dt * 8) g.fx.spawn(4, p.x, 0.25, p.z, (Math.random() - 0.5), 1.5, (Math.random() - 0.5), 0.4, 0.14, '#ff6a2a', -1);
      if (Math.random() < dt * 3) g.fx.smoke(p.x, 0.8, p.z, false);
    }
    if (p.gasT > 0) {
      live = true; p.gasT -= dt; p.tickT = (p.tickT ?? 0) - dt;
      if (p.tickT <= 0) {
        p.tickT = 1;
        for (const c of g.chars) {
          if (!c.alive || c.inVehicle || Math.abs(c.x - p.x) > e.gas.r || Math.abs(c.z - p.z) > e.gas.r || Math.hypot(c.x - p.x, c.z - p.z) > e.gas.r) continue;
          if (c.faction === 'zombie') continue; // nothing left in there to burn
          g.combat.damage(c, e.gas.dps, p.owner, 0, 0, 'gas');
          c.blind = Math.max(c.blind ?? 0, e.gas.blind);
          if (c === g.player) g.hud?.flashbang?.(0.4);
          g.emit('gassed', { id: c.id });
        }
      }
    }
    if (p.wailT > 0) {
      live = true; p.wailT -= dt; p.beep -= dt;
      if (p.beep <= 0) { p.beep = 0.9; g.noise(p.x, p.z, e.noise, null); g.zombies?.onNoise(p.x, p.z, e.lure?.r ?? e.noise); g.audio.horn?.(Math.hypot(p.x - g.player.x, p.z - g.player.z)); }
    }
    if (!live) { p.state = 'spent'; this.remove(p); }
  }

  // Detonate: every remote charge `who` set. Returns how many went.
  detonate(who = this.g.player, id = null) {
    let n = 0;
    for (const p of [...this.list]) if (p.def.trigger === 'remote' && p.state === 'armed' && p.owner === who && (!id || p.id === id)) { this.fire(p); n++; }
    if (who === this.g.player && !n && !id) this.g.hud?.toast('NOTHING TO SET OFF', 'warn');
    this.g.emit('detonate', { by: who?.id ?? null, n });
    return n;
  }

  // A door that was barricaded and now is not locked: the barricade gave (a boot, a breach, the infected).
  barricades() {
    for (let i = this.barred.length - 1; i >= 0; i--) {
      const b = this.barred[i];
      if (b.door.locked) continue;
      this.barred.splice(i, 1); b.door.barricade = null;
      this.g.emit('barricadeBroken', { door: b.door.id, kind: b.kind, held: r1(this.g.time - b.at) });
    }
  }

  // Hold E over your own chain, strip, bells or an unarmed thing: it goes back in the pack.
  pickupPrompt(dt) {
    const g = this.g, P = g.player;
    if (!P.alive || P.inVehicle || this.drones.piloting) return;
    let near = null, nd = 1.5;
    for (const p of this.list) {
      if (p.owner !== P || p.ref || p.state === 'flying' || p.state === 'burning' || !(p.def.pickup || p.state === 'arming')) continue;
      const d = Math.hypot(p.x - P.x, p.z - P.z); if (d < nd) { nd = d; near = p; }
    }
    if (!near) { this.pickHold = 0; return; }
    if (g.input.key('KeyE')) {
      this.pickHold += dt;
      g.hud?.prompt(`Taking up the ${near.def.name.toLowerCase()}… ${Math.round(Math.min(1, this.pickHold / 0.9) * 100)}%`);
      if (this.pickHold >= 0.9) { this.pickUp(near, P); this.pickHold = 0; }
    } else { this.pickHold = 0; g.hud?.prompt(`Hold <kbd>E</kbd> Take up the <b>${near.def.name.toLowerCase()}</b>`); }
  }

  // Craft one from what you carry (the row's source.craft).
  craft(kind) {
    const g = this.g, inv = g.inventory, def = GADGETS[kind] ?? null;
    const src = def?.source ?? (kind.startsWith('drone_') ? this.drones.rows[kind.slice(6)]?.source : null);
    if (!src?.craft) return { ok: false, why: `nothing called ${kind} to make` };
    const short = src.craft.filter(([id, n]) => inv.carried.count(id) < n);
    if (short.length) return { ok: false, why: `short of ${short.map(([id, n]) => `${n - inv.carried.count(id)} ${ITEMS[id]?.name.toLowerCase() ?? id}`).join(', ')}` };
    for (const [id, n] of src.craft) inv.spend(id, n);
    inv.stow(kind, 1);
    this.counts.crafted++;
    g.emit('crafted', { item: kind });
    return { ok: true, text: `${ITEMS[kind]?.name.toUpperCase() ?? kind} MADE` };
  }

  // ---- drawing -------------------------------------------------------------------------------------------------------
  put(x, y, z, rot, lx, ly, lz, sx, sy, sz, col, hide = 0, rx = 0) {
    if (this.n >= MAX_PARTS) return;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    _o.position.set(x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs);
    _o.rotation.set(rx, rot, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix();
    this.parts.setMatrixAt(this.n, _o.matrix);
    _c.set(col); if (hide) _c.lerp(SAND, hide);
    this.parts.setColorAt(this.n++, _c);
  }

  shine(x, z, s, col, y = 0.12) {
    if (this.ng >= MAX_GLOW) return;
    _o.position.set(x, y, z); _o.rotation.set(0, 0, 0); _o.scale.set(s, 1, s); _o.updateMatrix();
    this.glow.setMatrixAt(this.ng, _o.matrix); this.glow.setColorAt(this.ng++, _c.set(col));
  }

  draw() {
    const g = this.g, t = g.time, P = g.player;
    this.n = 0; this.ng = 0;
    for (const p of this.list) {
      if (Math.abs(p.x - P.x) > 160 || Math.abs(p.z - P.z) > 160) continue;
      const gy = (g.stunts?.heightAt(p.x, p.z, 0) ?? 0) + (p.state === 'flying' ? p.y : 0), a = p.state === 'flying' ? p.t * 8 : p.rot;
      const blink = Math.sin(t * 6) > 0.6;
      switch (p.kind) {
        case 'road_chain': {
          const L = p.def.len, n = 9;
          if (p.state === 'flying') { this.put(p.x, gy, p.z, a, 0, 0, 0, 0.5, 0.3, 0.5, '#3a3632'); break; }
          this.put(p.x, gy, p.z, p.rot + Math.PI / 2, 0, 0.05, 0, 0.12, 0.08, L, '#3a3632');
          for (let k = 0; k < n; k++) { const s = (k / (n - 1) - 0.5) * L; this.put(p.x + p.ux * s, gy, p.z + p.uz * s, p.rot + k, 0, 0.12, 0, 0.05, 0.16, 0.05, '#8a8478'); }
          break;
        }
        case 'spike_strip': {
          const L = p.def.len;
          if (p.state === 'flying') { this.put(p.x, gy, p.z, a, 0, 0, 0, 0.6, 0.15, 0.3, '#1d1b19'); break; }
          this.put(p.x, gy, p.z, p.rot + Math.PI / 2, 0, 0.03, 0, 0.32, 0.05, L, '#1d1b19');
          for (let k = 0; k < 8; k++) { const s = (k / 7 - 0.5) * (L - 0.3); this.put(p.x + p.ux * s, gy, p.z + p.uz * s, p.rot, 0, 0.09, 0, 0.05, 0.1, 0.05, '#a7a39b'); }
          break;
        }
        case 'car_mine': this.put(p.x, gy, p.z, p.rot, 0, 0.02, 0, 0.42, 0.05, 0.42, '#4a4a3a', p.state === 'armed' ? 0.75 : 0); this.put(p.x, gy, p.z, p.rot, 0, 0.07, 0, 0.04, 0.08, 0.04, '#7a7a68', p.state === 'armed' ? 0.4 : 0); break;
        case 'fan_mine': {
          this.put(p.x, gy, p.z, p.rot, 0, 0.32, 0, 0.42, 0.24, 0.09, '#4a5a3a');
          this.put(p.x, gy, p.z, p.rot, -0.14, 0.12, 0, 0.03, 0.22, 0.03, '#2a2a24'); this.put(p.x, gy, p.z, p.rot, 0.14, 0.12, 0, 0.03, 0.22, 0.03, '#2a2a24');
          if (p.state !== 'flying') this.put(p.x + Math.sin(p.rot) * 1.1, gy, p.z + Math.cos(p.rot) * 1.1, p.rot + Math.PI / 2, 0, 0.18, 0, 0.012, 0.012, p.def.wire, '#b9b5a6');
          break;
        }
        case 'crawler_mine': {
          const step = p.hunt ? Math.sin(t * 22) * 0.06 : 0;
          this.put(p.x, gy, p.z, p.rot, 0, 0.22, 0, 0.38, 0.16, 0.42, '#5a4a3a');
          for (let k = 0; k < 6; k++) { const sd = k < 3 ? 1 : -1, lz = ((k % 3) - 1) * 0.16; this.put(p.x, gy, p.z, p.rot, sd * 0.27, 0.12 + (k % 2 ? step : -step), lz, 0.2, 0.03, 0.03, '#2b2825'); }
          this.put(p.x, gy, p.z, p.rot, 0, 0.3, 0.2, 0.08, 0.05, 0.05, blink || p.hunt ? '#ff3b2a' : '#5a1a14');
          if (p.state === 'armed' && (blink || p.hunt)) this.shine(p.x, p.z, 1.2, '#ff3b2a', gy + 0.1);
          break;
        }
        case 'noise_maker': this.put(p.x, gy, p.z, a + (p.lureT > 0 ? Math.sin(t * 30) * 0.2 : 0), 0, 0.1, 0, 0.18, 0.14, 0.12, '#8a8478'); break;
        case 'bottle_lure': this.put(p.x, gy, p.z, a, 0, 0.1, 0, 0.08, 0.26, 0.08, '#4a6a3a', 0, Math.PI / 2); break;
        case 'signal_flare':
          this.put(p.x, gy, p.z, a, 0, 0.05, 0, 0.05, 0.05, 0.32, '#b0301e');
          if (p.lit > 0) { this.shine(p.x, p.z, 14 + Math.sin(t * 23) * 1.2, '#ff4a26'); this.shine(p.x, p.z, 3.2, '#ffd08a', 0.14); }
          break;
        case 'smoke_canister': case 'gas_can': this.put(p.x, gy, p.z, a, 0, 0.12, 0, 0.14, 0.24, 0.14, p.kind === 'gas_can' ? '#c9a24a' : '#8a8a86'); break;
        case 'remote_charge':
          this.put(p.x, gy, p.z, p.rot, 0, 0.09, 0, 0.32, 0.16, 0.2, '#7a5a3a'); this.put(p.x, gy, p.z, p.rot, 0, 0.19, 0, 0.06, 0.04, 0.06, blink && p.state === 'armed' ? '#ff3b2a' : '#3a2020');
          if (blink && p.state === 'armed') this.shine(p.x, p.z, 0.9, '#ff3b2a', gy + 0.2);
          break;
        case 'breach_charge': this.put(p.x, 0, p.z, p.rot, 0, 1.1, 0, 0.9, 1.9, 0.05, '#6a5a3a'); if (blink) this.shine(p.x, p.z, 0.9, '#ff3b2a', 1.1); break;
        case 'car_alarm': if (p.ref) { const v = p.ref; this.put(v.x, (v.y ?? 0), v.z, v.h, 0, 1.15, 0.9, 0.08, 0.04, 0.08, blink || p.wailT > 0 ? '#ff3b2a' : '#3a2020'); if (p.wailT > 0 && blink) this.shine(v.x, v.z, 6, '#ff5a2a'); } break;
        case 'tripwire_bells': {
          const L = p.def.wire / 2;
          for (const s of [-L, L]) this.put(p.x + p.ux * s, gy, p.z + p.uz * s, p.rot, 0, 0.18, 0, 0.05, 0.36, 0.05, '#6a4c30');
          this.put(p.x, gy, p.z, p.rot + Math.PI / 2, 0, 0.22, 0, 0.01, 0.01, p.def.wire, '#d8d0b8', 0.3);
          for (let k = 0; k < 3; k++) this.put(p.x + p.ux * (L - 0.15 - k * 0.1), gy, p.z + p.uz * (L - 0.15 - k * 0.1), p.rot, 0, 0.14 + (p.state === 'tripped' ? Math.sin(t * 40 + k) * 0.03 : 0), 0, 0.06, 0.08, 0.06, '#b9a046');
          break;
        }
      }
    }
    // Barricades: boards across the door.
    for (const b of this.barred) {
      const d = b.door, rot = Math.atan2(d.nx, d.nz);
      if (Math.abs(d.x - P.x) > 120 || Math.abs(d.z - P.z) > 120) continue;
      if (b.kind === 'wedge') { this.put(d.x, 0, d.z, rot, 0, 0.04, -0.12, 0.12, 0.06, 0.16, '#3a3028'); continue; }
      const col = b.kind === 'planks' ? '#8f6a42' : '#5a4632', n = b.kind === 'planks' ? 3 : 2;
      for (let k = 0; k < n; k++) this.put(d.x, 0, d.z, rot, 0, 0.55 + k * 0.6, -0.14, d.width + 0.3, b.kind === 'planks' ? 0.18 : 0.7, 0.05, col, 0, 0);
      if (b.kind === 'furniture') this.put(d.x, 0, d.z, rot, 0.2, 0.55, -0.6, d.width * 0.8, 1.1, 0.6, '#5a3e26');
    }
    this.drones.draw(this);
    this.security.draw(this);
    this.parts.count = this.n; this.parts.visible = this.n > 0;
    this.parts.instanceMatrix.needsUpdate = true; if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
    this.glow.count = this.ng; this.glow.visible = this.ng > 0;
    this.glow.instanceMatrix.needsUpdate = true; if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
  }

  // The minimap's share (ui/hud.js drawMinimap calls this before it draws you): your gadgets, the drone, what it marked.
  drawMinimap(c, px, pz, scale, R) {
    const g = this.g;
    c.lineWidth = 1.6;
    for (const p of this.list) {
      if (p.owner !== g.player) continue;
      const x = R + (p.x - px) * scale, y = R + (p.z - pz) * scale;
      if ((x - R) ** 2 + (y - R) ** 2 > (R - 16) ** 2) continue;
      c.strokeStyle = p.state === 'armed' ? '#f5b21a' : '#9a8a6a'; c.strokeRect(x - 2.5, y - 2.5, 5, 5);
    }
    this.drones.drawMinimap(c, px, pz, scale, R);
    g.kit?.drawMinimap(c, px, pz, scale, R); // cars the glass marked (systems/kit.js)
  }

  view(p) {
    const P = this.g.player;
    return { id: p.id, kind: p.kind, name: p.def.name, state: p.state, x: r1(p.x), z: r1(p.z), heading: +p.rot.toFixed(2), owner: p.owner?.id ?? null, d: r1(Math.hypot(p.x - P.x, p.z - P.z)),
      trigger: p.def.trigger, on: p.ref ? p.ref.id : null, hunting: p.hunt?.id ?? null, tell: p.def.notice.tell, seenBy: p.seen ? this.g.society?.factions?.rows.filter((r, i) => p.seen & (1 << i)).map((r) => r.id) ?? [] : [], hits: p.hits.size };
  }
}
