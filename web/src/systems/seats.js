// Seats & followers.
//  - Every vehicle has seat rows (driver, shotgun, back rows, exposed bed/pillion spots).
//  - Anyone can board a specific seat; seat 0 is the wheel (v.driver stays in sync).
//  - Followers (faction 'ally') walk with you, board when you board, shoot out of their
//    own window, and take the wheel when you slide over (chauffeur mode → GPS waypoint).

export class Seats {
  constructor(game) { this.g = game; }

  init(v) {
    v.seats = v.seats ?? [{ id: 'driver', side: 'left', row: 0 }, { id: 'shotgun', side: 'right', row: 0 }];
    v.occ = v.seats.map(() => null);
  }

  freeSeat(v, { passengerOnly = false } = {}) {
    if (!v.occ) this.init(v);
    for (let i = passengerOnly ? 1 : 0; i < v.seats.length; i++) if (!v.occ[i] || !v.occ[i].alive) return i;
    return -1;
  }

  board(c, v, seat = -1) {
    if (!v.occ) this.init(v);
    if (seat < 0) seat = this.freeSeat(v);
    if (seat < 0 || (v.occ[seat] && v.occ[seat].alive && v.occ[seat] !== c)) return false;
    if (c.inVehicle) this.leave(c, true);
    v.occ[seat] = c;
    c.inVehicle = v; c.seat = seat;
    if (seat === 0) v.driver = c;
    c.x = v.x; c.z = v.z;
    this.g.emit('boarded', { id: c.id, vehicle: v.id, seat: v.seats[seat].id });
    return true;
  }

  // Step out through the seat's own door.
  leave(c, silent = false) {
    const v = c.inVehicle;
    if (!v) return;
    if (!v.occ) this.init(v);
    const seat = c.seat ?? 0;
    if (v.occ[seat] === c) v.occ[seat] = null;
    if (v.driver === c) v.driver = null;
    c.inVehicle = null; c.seat = null; c.seatPose = null;
    const p = this.doorPos(v, seat, 1.0);
    const t = { x: p.x, z: p.z };
    this.g.statics.resolveCircle(t, 0.45);
    c.x = t.x; c.z = t.z;
    if (!silent) this.g.emit('leftVehicle', { id: c.id, vehicle: v.id });
  }

  doorPos(v, seat, out = 0.9) {
    const s = v.seats[seat] ?? v.seats[0];
    const lx = (s.side === 'left' ? 1 : -1) * (v.wid / 2 + out);
    const lz = v.len * (0.12 - s.row * 0.22);
    const c = Math.cos(v.h), sn = Math.sin(v.h);
    return { x: v.x + lx * c + lz * sn, z: v.z - lx * sn + lz * c };
  }

  // Player slides to the next seat (C). If an ally is aboard, they take the wheel.
  cycle(c) {
    const v = c.inVehicle;
    if (!v) return false;
    if (!v.occ) this.init(v);
    const from = c.seat ?? 0;
    for (let k = 1; k <= v.seats.length; k++) {
      const to = (from + k) % v.seats.length;
      if (v.occ[to] && v.occ[to].alive) continue;
      v.occ[from] = null; if (from === 0) v.driver = null;
      v.occ[to] = c; c.seat = to; if (to === 0) { v.driver = c; v.ai = null; }
      // Someone has to drive: an ally slides behind the wheel.
      if (from === 0) {
        const ally = v.occ.find((o, i) => o && o.alive && i !== to && o.faction === 'ally');
        if (ally) { v.occ[ally.seat] = null; v.occ[0] = ally; ally.seat = 0; v.driver = ally; v.ai = 'chauffeur'; this.g.hud.toast(`${ally.name} takes the wheel`, 'job'); }
      }
      this.g.emit('seatChanged', { id: c.id, vehicle: v.id, seat: v.seats[to].id });
      return true;
    }
    return false;
  }

  // Throw everyone out (bike crash, rollover).
  ejectAll(v, fling = 1) {
    if (!v.occ) return;
    for (const c of [...v.occ]) {
      if (!c) continue;
      this.leave(c, true);
      if (c === this.g.player) this.g.lastVehicle = v;
      const sp = this.g.vehiclesSys.speed(v);
      const d = Math.hypot(v.vx, v.vz) || 1;
      const t = { x: c.x + (v.vx / d) * (2 + sp * 0.15 * fling), z: c.z + (v.vz / d) * (2 + sp * 0.15 * fling) };
      this.g.statics.resolveCircle(t, 0.4);
      c.x = t.x; c.z = t.z;
      this.g.combat.damage(c, (c === this.g.player ? 0.7 : 1) * (6 + sp * 2), null, v.vx / d, v.vz / d, sp > 15 ? 'vehicle' : 'bullet');
      this.g.emit('thrown', { id: c.id, vehicle: v.id, speed: Math.round(sp) });
    }
  }

  occupants(v) { return (v.occ ?? []).map((c, i) => (c ? { id: c.id, name: c.npc?.name ?? c.name, seat: v.seats[i].id, faction: c.faction } : null)).filter(Boolean); }

  // Followers: allies follow the player, board/leave with them, shoot from windows.
  recruit(c) {
    c.faction = 'ally'; c.follower = true; c.grudge = null; c.target = null; c.flee = 0;
    c.weapon ??= 'pistol';
    c.mag = 99;
    this.g.emit('recruited', { id: c.id, name: c.npc?.name ?? c.name });
    this.g.hud.toast(`${c.npc?.name ?? c.name} rides with you`, 'job');
  }

  dismiss(c) { c.follower = false; c.faction = 'drifter'; if (c.inVehicle) this.leave(c); c.home = { x: c.x, z: c.z }; }

  // Called from AI.update for allies that have no current fight.
  followThink(c, dt) {
    const g = this.g, p = g.player;
    if (c.inVehicle) {
      // Passenger: shoot hostiles out of our window.
      c.cool -= dt;
      const v = c.inVehicle;
      if (v.driver === c) return; // chauffeur handled by vehicle AI
      if (!c.weapon || c.cool > 0) return;
      let best = null, bd = 32;
      for (const o of g.chars) {
        if (!o.alive || o.inVehicle || !g.ai.hostile(c, o)) continue;
        const d = Math.hypot(o.x - v.x, o.z - v.z);
        if (d < bd && g.statics.lineOfSight(v.x, v.z, o.x, o.z)) { bd = d; best = o; }
      }
      if (best) {
        const ang = Math.atan2(best.x - v.x, best.z - v.z);
        g.carCombat.fireFromVehicle(c, v, c.weapon, ang + (Math.random() - 0.5) * 0.12);
        c.cool = 0.35 + Math.random() * 0.4;
      }
      // Leave when the player leaves.
      if (!p.inVehicle && v.driver !== c) this.leave(c);
      return true;
    }
    // On foot: board the player's vehicle, else trail behind.
    if (p.inVehicle) {
      const v = p.inVehicle;
      const seat = this.freeSeat(v, { passengerOnly: true });
      if (seat < 0) return false;
      const d = Math.hypot(v.x - c.x, v.z - c.z);
      if (d < v.len * 0.5 + 2.5 && g.vehiclesSys.speed(v) < 4) { this.board(c, v, seat); return true; }
      g.ai.move(c, v.x - c.x, v.z - c.z, 6.2, dt);
      return true;
    }
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d > 4) g.ai.move(c, p.x - c.x, p.z - c.z, d > 12 ? 7 : 4.6, dt);
    else c.speed = 0;
    return true;
  }
}
