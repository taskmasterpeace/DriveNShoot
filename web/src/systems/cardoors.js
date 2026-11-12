// CAR DOORS (VEHICLES V2 slice 3; rows and the rules in data/cardoors.js). A car's side doors swing open when someone
// gets in or out, shut a beat after you sit (hold F through the beat to leave yours open), stay open when you get out,
// slam shut at speed and tear off if the open side is hit. The swing itself is vehicledamage.deform's: it turns the
// door panel's vertices round the door's front edge by v.doorA[part] (the hinge found once from the body's own vertices).
// State per car: v.doors = { <part>: { a, want, shutAt, by } } only once a door has moved; v.doorA mirrors the angles for
// deform. Seats.board / Seats.leave call onBoard / onLeave for everyone (NPCs too); the multiplayer presence carries the
// open doors as bits (net/shard.js) so a friend's open door is open on your screen.
import { PART } from './vehiclebodies.js';
import { DOORS, doorFor, DOOR_ZONE, DOOR_TYPES, DOOR_HEAR, stepDoor, doorBits, openFromBits } from '../data/cardoors.js';
import { VEHICLES } from './vehicles.js';

export class CarDoors {
  constructor(game) {
    this.g = game;
    this.stats = { opened: 0, shut: 0, leftOpen: 0, slammed: 0, torn: 0 };
  }

  // The door's hinge on this body: the front edge of the door's outer SKIN (null: the body has no such hinged door,
  // data/cardoors.js DOOR_TYPES). The skin is the |x| plane with the longest run along the car among the part's vertices:
  // a mirror or a handle tagged with the door sits further out but is short, and must not move the hinge off the pillar.
  hingeOf(v, part) {
    const geoId = v.mesh?.geometry?.uuid;
    if (!v._hinge || v._hinge.geo !== geoId) v._hinge = { geo: geoId };
    if (part in v._hinge) return v._hinge[part];
    const types = DOOR_TYPES[v.type] ?? DOOR_TYPES[VEHICLES[v.type]?.base];
    const pa = v.mesh?.geometry?.attributes?.part, base = v.basePos, id = PART[part];
    let out = null;
    if (types?.includes(part) && !v.open && pa && base && id !== undefined) {
      const runs = new Map(); // |x| to 1 cm -> [zMin, zMax, n]
      for (let i = 0; i < pa.count; i++) {
        if (pa.array[i] !== id) continue;
        const x = base[i * 3], z = base[i * 3 + 2], k = Math.round(Math.abs(x) * 100);
        const r = runs.get(k); if (r) { if (z < r[0]) r[0] = z; if (z > r[1]) r[1] = z; r[2]++; } else runs.set(k, [z, z, 1]);
      }
      let bestK = null, bestRun = 0;
      for (const [k, r] of runs) if (r[2] >= 2 && r[1] - r[0] > bestRun + 1e-6 || (r[2] >= 2 && Math.abs(r[1] - r[0] - bestRun) < 1e-6 && k > bestK)) { bestK = k; bestRun = r[1] - r[0]; }
      if (bestK !== null && bestRun > 0.4) out = { hx: (part.startsWith('doorL') ? 1 : -1) * bestK / 100, hz: runs.get(bestK)[1] };
    }
    return (v._hinge[part] = out);
  }
  has(v, part) { return !!this.hingeOf(v, part) && !v.dmg?.off?.[part]; }
  state(v, part) { v.doors ??= {}; v.doorA ??= {}; return (v.doors[part] ??= { a: 0, want: 0, shutAt: null, by: null }); }

  // Someone sat down: their door opens, and shuts a beat later (unless the player keeps F held through it).
  near(v) { const p = this.g.player; return !!p && Math.abs(v.x - p.x) < DOOR_HEAR && Math.abs(v.z - p.z) < DOOR_HEAR; }
  onBoard(c, v, seat) {
    const S = v.seats?.[seat], part = doorFor(S);
    if (S?.exposed || !this.near(v) || !this.has(v, part)) return; // a standing gunner has no door; a car far off swings nothing (and thunks nothing)
    const d = this.state(v, part);
    d.want = DOORS.open; d.by = c; d.shutAt = this.g.time + DOORS.swing * (1 - d.a / DOORS.open) + DOORS.beat;
    this.stats.opened++;
  }
  // Someone got out: their door opens and stays open.
  onLeave(c, v, seat) {
    const S = v.seats?.[seat], part = doorFor(S);
    if (S?.exposed || v.carriedBy || !this.near(v) || !this.has(v, part)) return; // in a box trailer's hold the door stays shut (its walls)
    const d = this.state(v, part);
    d.want = DOORS.open; d.shutAt = null; d.by = c;
    this.stats.opened++;
  }
  // Set a door by hand (the agent's `door` command; the multiplayer ghost).
  set(v, part, open) { if (!this.has(v, part)) return false; const d = this.state(v, part); d.want = open ? DOORS.open : 0; d.shutAt = null; return true; }

  // A crash on a side: an open door there is torn off its hinges (vehicledamage.hit calls this).
  struck(v, zone, k) {
    if (!v.doors || k < DOORS.tearK) return;
    for (const part in v.doors) {
      const d = v.doors[part];
      if (DOOR_ZONE[part] !== zone || d.a < DOORS.open * 0.3 || v.dmg?.off?.[part]) continue;
      this.g.vehDamage.detach(v, part, zone, 6);
      delete v.doors[part]; v.doorA[part] = 0;
      this.stats.torn++; this.g.emit('doorTorn', { vehicle: v.id, part });
    }
  }

  update(dt) {
    const g = this.g, t = g.time;
    for (const v of g.vehicles) {
      if (!v.doors) continue;
      let moved = false;
      const fast = !v.dead && Math.hypot(v.vx, v.vz) > DOORS.slamSpeed;
      for (const part in v.doors) {
        const d = v.doors[part];
        if (v.dmg?.off?.[part]) { delete v.doors[part]; v.doorA[part] = 0; continue; }
        if (d.shutAt !== null && t >= d.shutAt) {
          d.shutAt = null;
          if (d.by === g.player && g.player.inVehicle === v && g.controls?.held('vehicle')) { // the 'vehicle' verb held (its key, or the pad's) // held F through the beat: leave it open
            this.stats.leftOpen++; g.hud?.toast('DOOR LEFT OPEN', 'job'); g.emit('doorLeftOpen', { vehicle: v.id, part });
          } else { d.want = 0; this.stats.shut++; }
        }
        if (fast && d.want > 0) { d.want = 0; d.shutAt = null; this.stats.slammed++; if (this.near(v)) g.audio?.clank?.(); g.emit('doorSlammed', { vehicle: v.id, part }); }
        if (d.a !== d.want) {
          const was = d.a; d.a = stepDoor(d.a, d.want, dt);
          if (was > 0 && d.a === 0 && this.near(v)) g.audio?.clank?.(); // the thunk of it shutting
          v.doorA[part] = d.a; moved = true;
        }
      }
      if (moved && v.dmg) { v.dmg.dirty = true; g.vehDamage.deform(v); }
    }
  }

  // The doors as presence bits (net/shard.js) and back onto a ghost car.
  bits(v) { return doorBits(v?.doors); }
  applyBits(v, b) {
    const want = new Set(openFromBits(b ?? 0));
    for (const part of ['doorL', 'doorR', 'doorL2', 'doorR2']) {
      const open = want.has(part), cur = v.doors?.[part];
      if (open ? (cur?.want ?? 0) <= 0 : (cur?.want ?? 0) > 0) this.set(v, part, open);
      else if (cur) cur.shutAt = null; // a friend's car: their page decides when it shuts, not a beat here
    }
  }
  view(v) { return Object.fromEntries(Object.entries(v.doors ?? {}).map(([k, d]) => [k, { a: +d.a.toFixed(2), open: d.want > 0, shutIn: d.shutAt === null ? null : +(d.shutAt - this.g.time).toFixed(2) }])); }
}
