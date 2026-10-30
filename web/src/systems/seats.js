import { TURRET_SEAT } from '../data/decks.js';

// Seats & followers.
//  - Every vehicle has seat rows (driver, shotgun, back rows, exposed bed/pillion spots).
//  - Anyone can board a specific seat; seat 0 is the wheel (v.driver stays in sync).
//  - Followers (faction 'ally') walk with you, board when you board, shoot out of their
//    own window, and take the wheel when you slide over (chauffeur mode → GPS waypoint).
//  - THE TURRET SEAT (data/decks.js TURRET_SEAT): a passenger mans the roof turret (the workshop's `top` mount, group 3)
//    and aims and fires it on their own while the driver drives; one owner at a time (v.turretBy, a character id).

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
    if (seat < 0 || !v.seats[seat] || (v.occ[seat] && v.occ[seat].alive && v.occ[seat] !== c)) return false; // no such seat (a row without it), or taken
    if (c.inVehicle) this.leave(c, true);
    // Off any other vehicle's deck first: on a deck and in a seat at once kept the deck's window rules on a bike rider's gun
    // (combat.fire's muzzleClear), and some directions never fired. (The same van's wheel, from its deck, is the deck's own path.)
    if (c.onDeck && c.onDeck.v !== v) this.g.decks?.dismount(c, 'boarded', true);
    if (c.onDeck) this.g.decks.dismount(c, 'seat', true); // off the deck and into the seat
    v.occ[seat] = c;
    c.inVehicle = v; c.seat = seat;
    if (seat === 0) { v.driver = c; v.parked = false; }
    c.x = v.x; c.z = v.z;
    this.g.emit('boarded', { id: c.id, vehicle: v.id, seat: v.seats[seat].id });
    return true;
  }

  // Step out through the seat's own door. inside: a vehicle whose cab opens onto its deck (data/decks.js seatsInside:
  // the van, the RV) puts you on your feet at its wheel instead (main.js exitVehicle passes it for a chosen exit).
  leave(c, silent = false, inside = false) {
    const v = c.inVehicle;
    if (!v) return;
    if (!v.occ) this.init(v);
    const seat = c.seat ?? 0;
    if (v.occ[seat] === c) v.occ[seat] = null;
    if (v.driver === c) { v.driver = null; v.parked = true; } // getting out of the driver's seat leaves it braked (vehicles.js)
    c.inVehicle = null; c.seat = null; c.seatPose = null;
    if (v.turretBy === c.id) this.releaseTurret(v, 'left');
    if (v.carriedBy && this.g.semis?.exitInto(c, v, seat)) { if (!silent) this.g.emit('leftVehicle', { id: c.id, vehicle: v.id, to: 'hold' }); return; } // out onto a trailer's floor (systems/semis.js)
    if (inside && this.g.decks?.fromSeat(c, v, seat)) { if (!silent) this.g.emit('leftVehicle', { id: c.id, vehicle: v.id, to: 'deck' }); return; }
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
      v.parked = false; // thrown off: nobody's foot on the brake, it slides on
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

  // ---- the turret seat ---------------------------------------------------------------------------------------------
  // Who mans v's roof turret, or null. An owner who has left the vehicle, died, or a wrecked vehicle frees it.
  turretOwner(v) {
    if (!v?.turretBy) return null;
    const c = this.g.chars.find((o) => o.id === v.turretBy);
    if (!c || !c.alive || c.inVehicle !== v || v.dead || !v.mounts?.top) { this.releaseTurret(v, !c?.alive ? 'down' : 'gone'); return null; }
    return c;
  }
  // May c fire v's turret right now? A passenger takes it if nobody mans it; the driver fires it only while it's free
  // (a passenger on it owns its aim). Shard-shaped: the claim is v.turretBy, which a save and the agent view carry.
  turretFor(c, v) {
    if (!v?.mounts?.top || c.inVehicle !== v || v.dead) return false;
    const own = this.turretOwner(v);
    if (own) return own === c || (c === this.g.player && own.follower && this.takeTurret(c, v).ok);
    if (v.driver === c) return true; // free: the driver works it from the wheel, as before
    return this.takeTurret(c, v).ok;
  }
  takeTurret(c, v) {
    if (!v?.mounts?.top) return { ok: false, why: 'no roof turret on it (the workshop fits one: a top mount)' };
    if (c.inVehicle !== v) return { ok: false, why: 'not aboard' };
    if (v.driver === c) return { ok: false, why: 'the driver cannot man it and drive (it fires from the wheel only while nobody mans it)' };
    const own = this.turretOwner(v);
    if (own && own !== c && !(c === this.g.player && own.follower)) return { ok: false, why: `${own.npc?.name ?? own.name ?? own.id} is on it` }; // your own crew gives it up to you
    if (own !== c) { v.turretBy = c.id; this.g.emit('turretSeat', { id: c.id, vehicle: v.id, on: true }); if (c === this.g.player) this.g.hud.toast('ON THE ROOF TURRET · AIM AND HOLD RMB', 'job'); }
    return { ok: true, by: c.id };
  }
  releaseTurret(v, why = 'released') {
    if (!v?.turretBy) return;
    const id = v.turretBy;
    v.turretBy = null;
    this.g.emit('turretSeat', { id, vehicle: v.id, on: false, why });
  }
  // A crew passenger on the turret: the nearest hostile in range, through the mount's own rate (systems/workshop.js).
  crewTurret(c, v, dt) {
    const g = this.g, T = TURRET_SEAT;
    c.turretCool = (c.turretCool ?? 0) - dt;
    if (c.turretCool > 0) return true;
    let best = null, bd = T.crewRange;
    for (const o of g.chars) {
      if (!o.alive || o.inVehicle === v || o.onDeck?.v === v || !g.ai.hostile(c, o)) continue;
      const d = Math.hypot(o.x - v.x, o.z - v.z);
      if (d < bd && g.statics.lineOfSight(v.x, v.z, o.x, o.z)) { bd = d; best = o; }
    }
    if (!best) { c.turretCool = 0.3; return false; }
    const ang = Math.atan2(best.x - v.x, best.z - v.z) + (Math.random() - 0.5) * 2 * T.crewSpread;
    g.workshop.fireMount(v, 3, ang, c);
    c.turretCool = T.crewCool[0] + Math.random() * (T.crewCool[1] - T.crewCool[0]);
    return true;
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
    if (c.onDeck) return g.decks.followThink(c, dt); // aboard a deck (systems/decks.js): shoot from it, hop off when you do
    if (c.inVehicle) {
      // Passenger: shoot hostiles out of our window.
      c.cool -= dt;
      const v = c.inVehicle;
      if (v.driver === c) return; // chauffeur handled by vehicle AI
      // A roof turret nobody mans: the crew passenger takes it (you keep it if you're on it); else the window.
      const gunner = v.mounts?.top && !v.dead ? this.turretOwner(v) : null;
      if (v.mounts?.top && !v.dead && (gunner === c || (!gunner && this.takeTurret(c, v).ok))) {
        this.crewTurret(c, v, dt);
        if (!p.inVehicle && v.driver !== c) this.leave(c);
        return true;
      }
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
    // On foot: board the player's vehicle (a seat, else its deck: the pickup's bed, the van, the RV), else trail behind.
    if (p.inVehicle || p.onDeck) {
      const v = p.inVehicle ?? p.onDeck.v;
      const seat = p.inVehicle ? this.freeSeat(v, { passengerOnly: true }) : -1;
      if (seat < 0 && !g.decks.room(v)) return false;
      const d = Math.hypot(v.x - c.x, v.z - c.z);
      if (d < v.len * 0.5 + 2.5 && g.vehiclesSys.speed(v) < 4) {
        if (seat >= 0) this.board(c, v, seat);
        else g.decks.climb(c, v);
        return true;
      }
      g.ai.move(c, v.x - c.x, v.z - c.z, 6.2, dt);
      return true;
    }
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d > 4) g.ai.move(c, p.x - c.x, p.z - c.z, d > 12 ? 7 : 4.6, dt);
    else c.speed = 0;
    return true;
  }
}
