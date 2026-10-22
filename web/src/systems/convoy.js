import { HALF } from '../world/city.js';
import { makeRng } from '../engine/rng.js';
import { RAIL } from '../world/rail.js';

// Dustwolf war convoys: a formation that crosses the map on Route 66 — lead buggy,
// turret gun-truck (gunner standing in the bed), a loot hauler, and two weaving bike
// outriders. Leave them alone and they roll past. Get close and they break formation:
// buggy and bikes hunt you, the gun-truck pulls alongside and the gunner opens up,
// the hauler floors it. Kill the hauler and it spills its cargo.

const LANE = 3.5, CRUISE = 15, ENGAGE_R = 55;
const FORMATION = [
  { role: 'lead', type: 'buggy', paint: '#4a2018', gap: 0, crew: ['smg'] },
  { role: 'outrider', type: 'bike', paint: '#2a2622', gap: 9, side: 1, crew: ['smg'] },
  { role: 'gun', type: 'pickup', paint: '#5a3a1c', gap: 18, crew: ['pistol', null, 'smg'] }, // seat 2 = the bed gunner
  { role: 'outrider', type: 'bike', paint: '#2a2622', gap: 27, side: -1, crew: ['pistol'] },
  { role: 'hauler', type: 'rig', paint: '#6a4a2a', gap: 37, crew: ['shotgun', 'smg'], loot: true },
];

export class Convoy {
  constructor(game) {
    this.g = game;
    this.active = null;   // { dir, members:[{v, role, gap, side}], engaged, t, looted }
    this.next = 70;       // first convoy shortly after start
    this.count = 0;
    this.rng = makeRng(661);
  }

  // dir +1 = rolling east (spawn in the west), -1 = west.
  spawn(dir) {
    const g = this.g, p = g.player;
    if (this.active) this.despawn();
    if (!dir) dir = p.x > 0 ? 1 : -1; // come from the far side and cross toward the player
    const x0 = -dir * (HALF - 55), lane = dir * LANE; // whole formation starts inside the map wall
    const members = [];
    for (const f of FORMATION) {
      const x = x0 - dir * f.gap, z = lane + (f.side ?? 0) * 2.4;
      const v = g.vehiclesSys.spawn(f.type, x, z, dir > 0 ? Math.PI / 2 : -Math.PI / 2, f.paint, { ai: 'convoy' });
      v.convoy = true; v.vx = dir * CRUISE * 0.8;
      f.crew.forEach((w, i) => {
        if (!w) return;
        const c = g.spawnRaider(x, z, this.rng, w);
        if (c) { g.seats.board(c, v, i); c.convoy = true; }
      });
      members.push({ v, role: f.role, gap: f.gap, side: f.side ?? 0, loot: !!f.loot });
    }
    this.active = { dir, members, engaged: false, t: 0, looted: false, lane };
    this.count++;
    g.emit('convoySpotted', { dir: dir > 0 ? 'east' : 'west', vehicles: members.map((m) => m.v.id) });
    if (Math.abs(p.z) < 120) g.hud.toast(`DUSTWOLF CONVOY ON ROUTE 66 — rolling ${dir > 0 ? 'EAST' : 'WEST'}`, 'hot');
    return this.active;
  }

  despawn() {
    const a = this.active; if (!a) return;
    for (const m of a.members) {
      for (const o of [...(m.v.occ ?? [])]) if (o && o !== this.g.player) this.g.removeChar(o);
      if (!m.v.occ?.includes(this.g.player)) this.g.vehiclesSys.remove(m.v);
    }
    this.active = null;
  }

  lead() { return this.active?.members.find((m) => m.role === 'lead' && !m.v.dead && m.v.driver)?.v ?? this.active?.members.find((m) => !m.v.dead && m.v.driver)?.v; }

  // Called by Vehicles.aiDrive for v.ai === 'convoy'.
  drive(v, dt) {
    const a = this.active, g = this.g, vs = g.vehiclesSys;
    const m = a?.members.find((k) => k.v === v);
    if (!m) { v.ai = 'raider'; v.convoy = false; return; } // a straggler from a broken-up convoy goes feral
    const dir = a.dir, sp = vs.speed(v);
    const p = g.player, px = p.inVehicle ? p.inVehicle.x : p.x, pz = p.inVehicle ? p.inVehicle.z : p.z;
    let tx, tz, want = CRUISE;
    if (a.engaged && m.role === 'gun') {
      // Pull alongside the player and give the gunner a clean line.
      const side = Math.sign(v.z - pz) || 1;
      tx = px + dir * 4; tz = pz + side * 11;
      const d = Math.hypot(tx - v.x, tz - v.z);
      want = Math.min(32, 8 + d * 0.9);
    } else if (a.engaged && m.role === 'hauler') {
      tx = v.x + dir * 30; tz = a.lane; want = 30; // floor it
    } else {
      const L = this.lead();
      if (!L || L === v || m.role === 'lead') { tx = v.x + dir * 25; tz = a.lane; }
      else {
        const slotX = L.x - dir * m.gap;
        const weave = m.side ? m.side * (2.4 + Math.sin(a.t * 1.7 + m.gap) * 1.6) : 0;
        tx = slotX + dir * 12; tz = a.lane + weave;
        want = CRUISE + Math.max(-8, Math.min(10, (slotX - v.x) * dir * 0.7));
      }
    }
    // Level crossing: wait at the barrier while the freight is on it.
    const T = g.train, ahead = (RAIL.x - v.x) * dir;
    if (T?.present && T.head > -170 && T.head - T.length < 18 && ahead > 2 && ahead < 60) want = Math.min(want, Math.max(0, (ahead - 15) * 0.8));
    const h = Math.atan2(tx - v.x, tz - v.z);
    let diff = h - v.h; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    v.steer = Math.max(-1, Math.min(1, diff * 2.4));
    v.throttle = sp < want ? 0.85 : sp > want + 2 ? (want < 3 ? -1 : -0.5) : 0.1;
    v.handbrake = false;
    // Gunners: everyone aboard who isn't driving shoots once the convoy is in a fight.
    if (!a.engaged) return;
    const dP = Math.hypot(px - v.x, pz - v.z);
    for (const o of v.occ ?? []) {
      if (!o || o === v.driver || !o.alive || !o.weapon || dP > 45) continue;
      o.cool -= dt;
      if (o.cool <= 0 && g.statics.lineOfSight(v.x, v.z, px, pz)) {
        o.cool = 0.3 + Math.random() * 0.45;
        g.carCombat.fireFromVehicle(o, v, o.weapon, Math.atan2(px - v.x, pz - v.z) + (Math.random() - 0.5) * 0.22);
      }
    }
  }

  engage(why) {
    const a = this.active; if (!a || a.engaged) return;
    a.engaged = true;
    for (const m of a.members) if ((m.role === 'lead' || m.role === 'outrider') && !m.v.dead) m.v.ai = 'raider';
    this.g.emit('convoyEngaged', { why });
    this.g.hud.toast('THE CONVOY BREAKS FORMATION', 'hot');
  }

  update(dt) {
    const g = this.g, p = g.player;
    if (!this.active) {
      this.next -= dt;
      if (this.next <= 0) { this.next = 160 + this.rng() * 120; this.spawn(); }
      return;
    }
    const a = this.active;
    a.t += dt;
    const px = p.inVehicle ? p.inVehicle.x : p.x, pz = p.inVehicle ? p.inVehicle.z : p.z;
    let alive = 0, far = true, gone = true;
    for (const m of a.members) {
      const v = m.v;
      const d = Math.hypot(v.x - px, v.z - pz);
      if (d < 160) far = false;
      if (!v.dead) {
        alive++;
        if (d < ENGAGE_R && p.alive) this.engage('close');
        if (v.hitByPlayer) this.engage('shot');
        if (v.x * a.dir < HALF - 70) gone = false; // bunched up at the far edge = off the map
      }
      if (m.loot && v.dead && !a.looted) {
        a.looted = true;
        const kinds = ['cash', 'cash', 'cash', 'ammo', 'ammo', 'ammo', 'ammo', 'med', 'med', 'cash'];
        kinds.forEach((k, i) => { const r = 2.5 + (i % 3) * 1.6, ang = i * 2.1; g.dropPickup(v.x + Math.cos(ang) * r, v.z + Math.sin(ang) * r, k); });
        g.emit('convoyLooted', { x: Math.round(v.x), z: Math.round(v.z) });
        g.hud.toast('THE HAULER SPILLED ITS CARGO', 'job');
      }
    }
    // Rolled off the map, or dead and forgotten: clear it.
    if ((gone && far) || (alive === 0 && far)) this.despawn();
  }

  view() {
    const a = this.active;
    if (!a) return { active: false, nextIn: Math.round(this.next), total: this.count };
    return {
      active: true, dir: a.dir > 0 ? 'east' : 'west', engaged: a.engaged, looted: a.looted, total: this.count,
      members: a.members.map((m) => ({ id: m.v.id, role: m.role, type: m.v.type, x: Math.round(m.v.x), z: Math.round(m.v.z), hp: Math.round(m.v.hp), dead: m.v.dead, crew: (m.v.occ ?? []).filter(Boolean).map((o) => o.id) })),
    };
  }
}
