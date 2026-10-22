import { WEAPONS } from './combat.js';
import { angleLerp } from '../engine/rng.js';

// On-foot AI: wander, flee, fight. Cheap per-character state machine,
// target scans are staggered so 150 NPCs cost almost nothing.
export class AI {
  constructor(game) {
    this.g = game;
    this.scanIdx = 0;
    this.tmp = { x: 0, z: 0 };
  }

  hostile(a, b) {
    if (!a.alive || !b.alive || a === b) return false;
    // The dead hunt every living thing; anyone armed (and the player) fights them.
    if (a.faction === 'zombie') return b.faction !== 'zombie';
    if (b.faction === 'zombie') return !!a.weapon || a === this.g.player;
    // Allies fight whoever the player fights.
    if (a.faction === 'ally') return b.faction === 'raider' || b.grudge === this.g.player || b.target === this.g.player;
    if (b.faction === 'ally' && a.faction === 'raider') return true;
    if (a.grudge === b) return true;
    if (a.faction === 'raider') return b.faction !== 'raider';
    if (a.faction === 'warden') return b.faction === 'raider' || (b === this.g.player && this.g.wanted > 0);
    return false;
  }

  onDamaged(c, attacker) {
    if (!attacker || attacker === c || c === this.g.player) return;
    if (attacker === this.g.player && c.faction !== 'raider' && c.faction !== 'zombie' && c.grudge !== attacker) this.g.raiseWanted(1);
    if (c.faction === 'zombie') { if (attacker.alive) c.ztarget = attacker; return; } // the dead don't flee
    if (c.faction !== attacker.faction || attacker === this.g.player) c.grudge = attacker;
    if (c.weapon) { c.target = attacker; c.state = 'fight'; }
    else { c.flee = 8; c.fleeX = attacker.x; c.fleeZ = attacker.z; }
    // Friends join in.
    for (const o of this.g.chars) {
      if (o === c || !o.alive || o.faction !== c.faction || !o.weapon || o === this.g.player) continue;
      if (Math.abs(o.x - c.x) + Math.abs(o.z - c.z) > 30) continue;
      if (attacker.faction === o.faction && attacker !== this.g.player) continue;
      o.grudge = attacker; o.target = attacker; o.state = 'fight';
    }
  }

  // Gunfire is heard: civilians scatter, fighters investigate.
  onNoise(x, z, r, src) {
    for (const c of this.g.chars) {
      if (!c.alive || c === this.g.player || c === src || c.inVehicle) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > r) continue;
      if (!c.weapon) { if (c.flee <= 0) { c.flee = 5 + Math.random() * 4; c.fleeX = x; c.fleeZ = z; } }
      else if (!c.target && src && this.hostile(c, src)) { c.target = src; c.state = 'fight'; }
    }
  }

  move(c, dx, dz, speed, dt) {
    const len = Math.hypot(dx, dz);
    if (len < 0.001) { c.speed = 0; return; }
    dx /= len; dz /= len;
    if (c.detour > 0) {
      c.detour -= dt;
      const cs = Math.cos(c.detourA), sn = Math.sin(c.detourA);
      const ndx = dx * cs - dz * sn, ndz = dx * sn + dz * cs;
      dx = ndx; dz = ndz;
    }
    const px = c.x, pz = c.z;
    const t = this.tmp;
    t.x = c.x + dx * speed * dt; t.z = c.z + dz * speed * dt;
    // Stay out of deep water (zombies can't swim at all: the river is a moat against them).
    const w = this.g.water;
    if (w && t.x > 290 && w.depthAt(t.x, t.z) > (c.faction === 'zombie' ? 0.6 : 1.2) && w.depthAt(px, pz) <= (c.faction === 'zombie' ? 0.6 : 1.2)) { c.speed = 0; c.stuck = (c.stuck || 0) + dt; return; }
    this.g.statics.resolveCircle(t, c.radius);
    c.x = t.x; c.z = t.z;
    const moved = Math.hypot(c.x - px, c.z - pz);
    c.speed = moved / dt;
    if (moved < speed * dt * 0.3) {
      c.stuck = (c.stuck || 0) + dt;
      if (c.stuck > 0.35) { c.detour = 0.7; c.detourA = (Math.random() < 0.5 ? 1 : -1) * (1 + Math.random()); c.stuck = 0; }
    } else c.stuck = 0;
    if (!c.aiming) c.face = angleLerp(c.face, Math.atan2(dx, dz), Math.min(1, dt * 10));
    c.walk += c.speed * dt * 2.2;
  }

  scan(c) {
    let best = null, bd = c.faction === 'raider' ? 34 : 30;
    for (const o of this.g.chars) {
      if (!this.hostile(c, o) || o.hidden || o.underwater) continue; // dived under: out of sight
      const d = Math.abs(o.x - c.x) + Math.abs(o.z - c.z);
      // Crouching targets are harder to spot; smoke hides everyone.
      if (d < bd * (o.crouch ? 0.6 : 1) && this.g.los(c.x, c.z, o.x, o.z)) { bd = d; best = o; }
    }
    if (best) { c.target = best; c.state = 'fight'; c.react = 0.45 + Math.random() * 0.5; }
  }

  update(dt) {
    const g = this.g;
    const chars = g.chars;
    // Stagger hostility scans: ~12 per frame.
    for (let k = 0; k < 12 && chars.length; k++) {
      this.scanIdx = (this.scanIdx + 1) % chars.length;
      const c = chars[this.scanIdx];
      if (c.alive && c.weapon && !c.target && c !== g.player && !c.inVehicle) this.scan(c);
    }

    for (const c of chars) {
      if (c === g.player || c.inVehicle) continue;
      if (!c.alive) {
        c.deadTime += dt;
        if (c.downedT > 0 && (c.downedT -= dt) <= 0) {
          // Revive essential NPC at home.
          c.alive = true; c.hp = c.maxHp; c.headless = false; c.blood = 0.3; c.neckSpray = 0; c.bleed = 0;
          c.x = c.home.x; c.z = c.home.z; c.target = null; c.grudge = null;
          g.charR.paint(c); g.emit('revived', { id: c.id, name: c.npc.name });
          continue;
        }
        if (c.neckSpray > 0) {
          // Arterial spray from the neck stump, weakening over a couple of seconds.
          c.neckSpray -= dt;
          const nx = -Math.sin(c.face), nz = -Math.cos(c.face);
          if (Math.random() < dt * 40 * Math.min(1, c.neckSpray)) g.fx.spawn(0, c.x + nx * 0.85, 0.3, c.z + nz * 0.85, nx * 3 + (Math.random() - 0.5) * 2, 2 + Math.random() * 3 * c.neckSpray, nz * 3 + (Math.random() - 0.5) * 2, 1, 0.08, '#7a0808');
        }
        continue;
      }
      if (c.dragged) continue;
      if (c.leapT > 0) continue;                               // diving out of a car's way (Ambient moves them)
      if (c.cowerT > 0) { c.speed = 0; c.walk = (c.walk ?? 0) + dt; continue; } // hands up, shaking
      if (c.faction === 'zombie') { g.zombies.think(c, dt); continue; }
      if (c.follower && c.inVehicle) { g.seats.followThink(c, dt); continue; }
      if (c.follower && !c.target && g.seats.followThink(c, dt)) continue;
      if (c.grabbing) { c.cool -= dt; continue; } // riding on a car: CarCombat drives them
      c.cool -= dt;
      if (c.reloading > 0) { c.reloading -= dt; if (c.reloading <= 0) c.mag = WEAPONS[c.weapon].mag; }
      c.aiming = false;

      // Bleeding out leaves a trail.
      if (c.bleed > 0.2 && Math.random() < dt * 4 * c.bleed) g.fx.decal(c.x, c.z, 0.25 + Math.random() * 0.3, '#5a0606');

      const pd = Math.hypot(g.player.x - c.x, g.player.z - c.z);
      // Far-away NPCs sleep (simulation LOD).
      if (pd > 150 && !c.target) continue;

      if (g.dialogue.active && g.dialogue.npc === c) {
        c.face = angleLerp(c.face, Math.atan2(g.player.x - c.x, g.player.z - c.z), Math.min(1, dt * 8));
        c.speed = 0;
        continue;
      }

      if (c.flee > 0) {
        c.flee -= dt;
        this.move(c, c.x - c.fleeX, c.z - c.fleeZ, 5.8, dt);
        continue;
      }

      if (c.target) {
        const t = c.target;
        const tx = t.inVehicle ? t.inVehicle.x : t.x, tz = t.inVehicle ? t.inVehicle.z : t.z;
        const d = Math.hypot(tx - c.x, tz - c.z);
        if (!t.alive || d > 70 || (!this.hostile(c, t) && c.grudge !== t)) { c.target = null; c.state = 'idle'; continue; }
        const w = WEAPONS[c.weapon];
        if (c.blind > 0) {
          // Flashbanged: stagger around, can't aim.
          c.blind -= dt; c.aiming = false;
          this.move(c, Math.sin(c.blind * 3), Math.cos(c.blind * 2), 1.2, dt);
          continue;
        }
        const los = !t.underwater && g.los(c.x, c.z, tx, tz); // under water: lost sight (they wait at the shore)
        // Dug-in target out of sight but close: lob a grenade over the cover.
        if (!los && d < 26 && d > 7 && (c.grenades ?? 0) > 0 && Math.random() < dt * 0.35) {
          c.grenades--;
          g.throwables.throw(c, 'frag', tx + (Math.random() - 0.5) * 3, tz + (Math.random() - 0.5) * 3, Math.random() * 0.8);
          g.emit('npcThrew', { by: c.id, type: 'frag' });
        }
        if (los && d < w.range * 0.9) {
          c.aiming = true;
          const want = Math.atan2(tx - c.x, tz - c.z);
          c.face = angleLerp(c.face, want, Math.min(1, dt * 7));
          // Strafe a little so firefights move.
          c.strafeT = (c.strafeT || 0) - dt;
          if (c.strafeT <= 0) { c.strafeT = 0.8 + Math.random() * 1.4; c.strafeDir = Math.random() < 0.5 ? -1 : 1; if (Math.random() < 0.3) c.strafeDir = 0; }
          if (c.strafeDir) this.move(c, Math.cos(want) * c.strafeDir, -Math.sin(want) * c.strafeDir, 2.2, dt);
          else c.speed = 0;
          c.aiming = true;
          if (c.mag <= 0 && c.reloading <= 0) { c.reloading = w.reload * 1.3; }
          else if ((c.react = (c.react ?? 0) - dt) <= 0 && c.cool <= 0 && c.reloading <= 0 && Math.abs(angleLerp(c.face, want, 1) - c.face) < 0.3) {
            // AI is deliberately worse than the player: reaction delay, burst discipline,
            // spread that grows with range and with a moving target.
            const tMoving = (t.inVehicle ? g.vehiclesSys.speed(t.inVehicle) : t.speed) > 2;
            const sloppy = 0.1 + d * 0.006 + (tMoving ? 0.1 : 0);
            if (g.combat.fire(c, c.weapon, c.face + (Math.random() - 0.5) * sloppy)) {
              c.mag--;
              if (w.auto) {
                c.burst = (c.burst ?? (3 + Math.floor(Math.random() * 3))) - 1;
                if (c.burst <= 0) { c.burst = undefined; c.cool = 0.8 + Math.random() * 0.7; } else c.cool = w.rate * 1.3;
              } else c.cool = w.rate * 2.6 + Math.random() * 0.4;
            }
          }
        } else {
          this.move(c, tx - c.x, tz - c.z, 4.6, dt);
        }
        continue;
      }

      // Idle wander.
      c.timer -= dt;
      const dh = Math.hypot(c.wx - c.x, c.wz - c.z);
      if (c.timer <= 0) {
        const r = c.npc ? 2.5 : c.faction === 'warden' ? 6 : 12;
        c.wx = c.home.x + (Math.random() - 0.5) * r * 2;
        c.wz = c.home.z + (Math.random() - 0.5) * r * 2;
        c.timer = 3 + Math.random() * 6;
      }
      // Named characters wait for you when you walk up to them (instead of wandering off).
      if (c.npc && pd < 6) { c.speed = 0; c.wx = c.x; c.wz = c.z; }
      else if (dh > 0.6) this.move(c, c.wx - c.x, c.wz - c.z, c.npc ? 1.2 : 1.6, dt);
      else c.speed = 0;
      if (c.npc && pd < 5) c.face = angleLerp(c.face, Math.atan2(g.player.x - c.x, g.player.z - c.z), Math.min(1, dt * 4));
    }

    // Cheap crowd separation (n^2 over awake characters; n is small).
    for (let i = 0; i < chars.length; i++) {
      const a = chars[i];
      if (!a.alive || a.inVehicle) continue;
      for (let j = i + 1; j < chars.length; j++) {
        const b = chars[j];
        if (!b.alive || b.inVehicle) continue;
        // Written so a NaN position FAILS the tests (every comparison with NaN is false): a NaN
        // neighbour used to slip through and make everyone it touched NaN, the player included.
        const dx = b.x - a.x, dz = b.z - a.z;
        if (!(Math.abs(dx) <= 1 && Math.abs(dz) <= 1)) continue;
        const d2 = dx * dx + dz * dz;
        if (!(d2 > 1e-6 && d2 <= 0.64)) continue;
        const d = Math.sqrt(d2), push = (0.8 - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        // The player has right of way: they shoulder NPCs aside instead of being blocked in doorways.
        const P = this.g.player;
        const wa = a === P ? 0 : b === P ? 2 : 1, wb = b === P ? 0 : a === P ? 2 : 1;
        const ta = { x: a.x - nx * push * wa, z: a.z - nz * push * wa }, tb = { x: b.x + nx * push * wb, z: b.z + nz * push * wb };
        // Never shove anyone through a wall.
        this.g.statics.resolveCircle(ta, a.radius); this.g.statics.resolveCircle(tb, b.radius);
        a.x = ta.x; a.z = ta.z; b.x = tb.x; b.z = tb.z;
      }
    }
  }
}
