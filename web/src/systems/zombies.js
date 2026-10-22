import { outfit } from './characters.js';

// The infected (canon: docs/design/THE_INFECTED.md - shamblers, and the rare sprinter; never "zombies" on screen). They hunt by smell (no line of sight needed), swarm to
// noise (gunfire, engines, horns), claw at cars until the glass gives, reach in for the
// driver, and latch onto slow vehicles. Night brings hordes; Rust Haven's wall keeps
// them out of town.

const SMELL = 45;          // metres: notice the living without seeing them
const BITE = 13;
const CAP_NIGHT = 30;

export class Zombies {
  constructor(game) {
    this.g = game;
    this.spawnT = 8;
    this.groanT = 3;
    this.enabled = true;
  }

  spawn(x, z, runner = Math.random() < 0.2) {
    const g = this.g;
    const c = g.addChar({ x, z, faction: 'zombie', weapon: null, hp: runner ? 55 : 75, colors: outfit('zombie'), name: runner ? 'Sprinter' : 'Shambler', flag: g.randomFlag(Math.random) });
    if (!c) return null;
    c.zSpeed = runner ? 5.2 + Math.random() * 0.6 : 2.0 + Math.random() * 0.7;
    c.runner = runner;
    c.blood = 0.45 + Math.random() * 0.3;
    g.charR.paint(c);
    c.timer = Math.random() * 2;
    return c;
  }

  horde(x, z, count = 8, runners = 0.2, radius = 8) {
    const ids = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
      const c = this.spawn(x + Math.cos(a) * r, z + Math.sin(a) * r, Math.random() < runners);
      if (c) ids.push(c.id);
    }
    return ids;
  }

  // Noise draws every infected in range toward it.
  onNoise(x, z, r) {
    for (const c of this.g.chars) {
      if (c.faction !== 'zombie' || !c.alive || c.ztarget) continue;
      if (Math.abs(c.x - x) > r || Math.abs(c.z - z) > r) continue;
      c.wx = x + (Math.random() - 0.5) * 6; c.wz = z + (Math.random() - 0.5) * 6; c.timer = 10;
    }
  }

  pickTarget(c) {
    let best = null, bd = SMELL;
    for (const o of this.g.chars) {
      if (!o.alive || o.faction === 'zombie' || o.hidden || o.underwater || o === c) continue; // no scent under water
      const ox = o.inVehicle ? o.inVehicle.x : o.x, oz = o.inVehicle ? o.inVehicle.z : o.z;
      let d = Math.abs(ox - c.x) + Math.abs(oz - c.z);
      if (o === this.g.player) d *= 0.8; // the living hero smells best
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // Per-zombie brain (called from AI.update instead of the normal state machine).
  think(c, dt) {
    const g = this.g;
    if (c.grabbing) return; // CarCombat drives grabbers
    c.aiming = false;
    // One of the infected made by anything but spawn() (an old save, a content pack) still needs a pace,
    // or it walks at NaN m/s and its NaN spreads through crowd separation. 0 is a real pace (one staged
    // to stand still); only a missing or broken one is repaired.
    if (!(c.zSpeed >= 0)) c.zSpeed = c.runner ? 5.5 : 2.35;
    if (!Number.isFinite(c.timer)) c.timer = 0;
    c.zt = (c.zt ?? 0) - dt;
    if (c.zt <= 0) {
      c.zt = 0.4 + Math.random() * 0.3;
      if (!c.ztarget || !c.ztarget.alive || Math.hypot(c.ztarget.x - c.x, c.ztarget.z - c.z) > SMELL * 1.4) c.ztarget = this.pickTarget(c);
    }
    const t = c.ztarget;
    if (!t) {
      // Shamble around; drift toward the last noise.
      c.timer -= dt;
      if (c.timer <= 0) { c.wx = c.x + (Math.random() - 0.5) * 16; c.wz = c.z + (Math.random() - 0.5) * 16; c.timer = 4 + Math.random() * 5; }
      if (Math.hypot(c.wx - c.x, c.wz - c.z) > 0.8) g.ai.move(c, c.wx - c.x, c.wz - c.z, Math.min(1.3, c.zSpeed), dt);
      else c.speed = 0;
      return;
    }
    if (t.inVehicle) {
      const v = t.inVehicle;
      // Distance to the car's body (chain of discs), not its centre.
      let gap = Infinity;
      for (const d of g.vehiclesSys.discs(v)) gap = Math.min(gap, Math.hypot(d.x - c.x, d.z - c.z) - d.r);
      if (gap < 0.95) { c.speed = 0; g.carCombat.zombieAttack(c, v, dt); }
      else g.ai.move(c, v.x - c.x, v.z - c.z, c.zSpeed, dt);
      return;
    }
    const d = Math.hypot(t.x - c.x, t.z - c.z);
    if (d < 1.25) {
      c.speed = 0;
      c.face = Math.atan2(t.x - c.x, t.z - c.z);
      c.cool -= dt;
      if (c.cool <= 0) {
        c.cool = 0.85 + Math.random() * 0.3;
        g.combat.damage(t, BITE, c, (t.x - c.x) / (d || 1), (t.z - c.z) / (d || 1), 'bite');
        if (t === g.player && t.alive && !g.godMode) g.survival?.bitten(); // BITE FEVER (canon: never a turn)
        if (t.grabbing && t === g.player && Math.random() < 0.3) g.carCombat.letGo(t, 0.5);
      }
    } else {
      g.ai.move(c, t.x - c.x, t.z - c.z, c.zSpeed, dt);
      // The unarmed living run.
      if (!t.weapon && t !== g.player && d < 12 && t.flee <= 0) { t.flee = 5; t.fleeX = c.x; t.fleeZ = c.z; }
    }
  }

  update(dt) {
    const g = this.g;
    if (!this.enabled) return;
    // Groans from the infected nearby.
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = 1.5 + Math.random() * 2.5;
      let near = null, nd = 30;
      for (const c of g.chars) if (c.faction === 'zombie' && c.alive) { const d = Math.hypot(c.x - g.player.x, c.z - g.player.z); if (d < nd) { nd = d; near = c; } }
      if (near) g.audio.groan?.(g.pan(near.x), nd);
    }
    // Engines and horns carry: driving fast drags the dead after you.
    const pv = g.player.inVehicle;
    if (pv && g.vehiclesSys.speed(pv) > 5 && Math.random() < dt) this.onNoise(pv.x, pv.z, 60);
    // Night hordes, spawned out of sight, never inside Rust Haven's wall.
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 7;
    const night = g.sky.night;
    const alive = g.chars.reduce((n, c) => n + (c.faction === 'zombie' && c.alive ? 1 : 0), 0);
    if (night < 0.6) {
      // Daylight: the far-off infected crawl back into the ruins.
      for (const c of [...g.chars]) if (c.faction === 'zombie' && c.alive && !c.grabbing && Math.hypot(c.x - g.player.x, c.z - g.player.z) > Math.max(140, (g.viewR ?? 0) + 20) && Math.random() < 0.3) g.removeChar(c);
      return;
    }
    if (alive >= CAP_NIGHT) return;
    const px = g.player.x, pz = g.player.z;
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2, r = Math.max(55, (g.viewR ?? 0) + 8) + Math.random() * 55; // out of sight at any zoom
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (Math.max(Math.abs(x), Math.abs(z)) < 92 || Math.max(Math.abs(x), Math.abs(z)) > 440) continue;
      if (!g.nav.foot.free(x, z)) continue;
      this.horde(x, z, 3 + Math.floor(Math.random() * 4), 0.15, 5);
      g.emit('hordeSpawned', { x: Math.round(x), z: Math.round(z) });
      break;
    }
  }
}
