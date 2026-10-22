import { rayCircle } from '../engine/collision.js';
import { MUZZLE_FORWARD } from './characters.js';

// Data-driven weapons. Add a row, get a gun.
export const WEAPONS = {
  pistol:  { name: '.45 REVOLVER', short: 'PISTOL', dmg: 38, rate: 0.26, mag: 6, reload: 1.3, spread: 0.025, range: 55, auto: false, pellets: 1, ammo: 'pistol', sound: 'pistol', shake: 0.25 },
  smg:     { name: 'RUST-9 SMG', short: 'SMG', dmg: 17, rate: 0.075, mag: 32, reload: 1.7, spread: 0.075, range: 42, auto: true, pellets: 1, ammo: 'smg', sound: 'smg', shake: 0.15 },
  shotgun: { name: 'SAWN-OFF', short: 'SHOTGUN', dmg: 14, rate: 0.75, mag: 2, reload: 1.9, spread: 0.2, range: 22, auto: false, pellets: 8, ammo: 'shells', sound: 'shotgun', shake: 0.6 },
};

export class Combat {
  constructor(game) {
    this.g = game;
  }

  // Fire `wkey` from character `ch` along angle `ang`. Returns true if a shot left the barrel.
  fire(ch, wkey, ang) {
    const w = WEAPONS[wkey];
    const g = this.g;
    const fx = Math.sin(ang), fz = Math.cos(ang);
    // The shot leaves the muzzle, on the body's centre line (the aim pose in characters.js).
    const ox = ch.x + fx * MUZZLE_FORWARD, oz = ch.z + fz * MUZZLE_FORWARD;
    // Muzzle can't poke through a wall we're hugging.
    if (!g.statics.lineOfSight(ch.x, ch.z, ox, oz)) return false;
    g.fx.flash(ox, 1.5, oz, w.pellets > 1 ? 2.2 : 1.4, 0.05);
    g.fx.light(ox, 1.8, oz, '#ffb35a', w.pellets > 1 ? 30 : 18, 0.07);
    g.audio.gun(w.sound, Math.hypot(ch.x - g.player.x, ch.z - g.player.z), g.pan(ch.x));
    g.noise(ch.x, ch.z, 45, ch);
    g.ambient?.eject(ch, ang);
    g.ambient?.onShot(ch.x, ch.z);
    for (let p = 0; p < w.pellets; p++) {
      const a = ang + (Math.random() - 0.5) * 2 * w.spread;
      this.hitscan(ch, ox, oz, Math.sin(a), Math.cos(a), w.range * (0.85 + Math.random() * 0.15), w.dmg);
    }
    return true;
  }

  hitscan(shooter, ox, oz, dx, dz, range, dmg) {
    const g = this.g;
    let best = g.statics.raycast(ox, oz, dx, dz, range);
    const wallHit = g.statics.hit.box ? { nx: g.statics.hit.nx, nz: g.statics.hit.nz } : null;
    let target = null, kind = null;
    for (const c of g.chars) {
      if (c === shooter || !c.alive || c.inVehicle || c.hidden) continue;
      if (c.dive > 0.25 && Math.random() < 0.6) continue; // mid-air dive: most rounds miss
      if (c.underwater) continue;                          // bullets don't reach under water
      const t = rayCircle(ox, oz, dx, dz, c.x, c.z, c.radius + 0.1, best);
      if (t >= 0 && t < best) { best = t; target = c; kind = 'char'; }
    }
    for (const v of g.vehicles) {
      if (v === shooter.inVehicle || v === shooter.firingFrom) continue;
      for (const s of [-1, 1]) {
        const cx = v.x + Math.sin(v.h) * v.len * 0.25 * s, cz = v.z + Math.cos(v.h) * v.len * 0.25 * s;
        const t = rayCircle(ox, oz, dx, dz, cx, cz, v.wid * 0.62, best);
        if (t >= 0 && t < best) { best = t; target = v; kind = 'veh'; }
      }
    }
    if (g.train && !shooter.onTrain && !target?.onTrain) {
      const th = g.train.raycast(ox, oz, dx, dz, best);
      if (th) { best = th.t; target = th.car; kind = 'train'; }
    }
    const hx = ox + dx * best, hz = oz + dz * best;
    // Near miss on the player: whiz.
    if (shooter !== g.player && target !== g.player && g.player.alive) {
      const px = g.player.x - ox, pz = g.player.z - oz, along = px * dx + pz * dz;
      if (along > 0 && along < best && Math.abs(px * dz - pz * dx) < 1.6) g.audio.whiz(g.pan(g.player.x + dx));
    }
    g.fx.tracer(ox, oz, hx, hz, 1.45);
    if (kind === 'char') {
      this.damage(target, dmg, shooter, dx, dz);
    } else if (kind === 'veh') {
      g.fx.sparks(hx, 1, hz, -dx, -dz, 5);
      g.vehiclesSys.damage(target, dmg * (target.armor ?? 0.5), shooter);
      g.carCombat.onBulletHit(target, shooter, dmg, dx, dz); // glass, then whoever's behind broken glass
      g.vehDamage.hit(target, hx, hz, dmg, 'bullet');        // dents, tyres, engine, tank
      if (shooter === g.player) g.qol.hit(false);
    } else if (kind === 'train') {
      g.fx.sparks(hx, 1.6, hz, -dx, -dz, 4);
      g.train.hitCar(target, dmg, shooter);
    } else if (wallHit) {
      g.fx.sparks(hx, 1.4, hz, wallHit.nx, wallHit.nz, 4);
      if (Math.random() < 0.3) g.audio.ricochet(g.pan(hx), Math.hypot(hx - g.player.x, hz - g.player.z));
      if (Math.random() < 0.3) g.fx.decal(hx + wallHit.nx * 0.2, hz + wallHit.nz * 0.2, 0.3, '#1a1714');
    }
  }

  damage(c, dmg, attacker, dx = 0, dz = 0, cause = 'bullet') {
    const g = this.g;
    if (!c.alive) {
      // Shooting corpses still sprays. Gratuitous, as ordered.
      g.fx.bloodSpray(c.x, 0.4, c.z, dx, dz, 6, 0.6);
      return;
    }
    if (c === g.player && g.godMode) return;
    // Continuous damage (burning, drowning) is "quiet": no blood, no hit sound, no event spam.
    const quiet = cause === 'fire' || cause === 'drown';
    if (quiet) {
      if (c === g.player) { dmg *= g.qol?.damageTaken() ?? 1; c.sinceHit = 0; g.hud.hurt(dmg * 0.5); }
      c.hp -= dmg; c.lastAttacker = attacker ?? c.lastAttacker;
      if (cause === 'fire') { c.charred = Math.min(1, (c.charred ?? 0) + dmg / 90); if (Math.random() < 0.05) g.charR.paint(c); }
      if (c.hp <= 0) this.kill(c, attacker, dx, dz, cause);
      return;
    }
    if (c === g.player) { dmg *= g.qol?.damageTaken() ?? 1; c.sinceHit = 0; g.emit('hurt', { amount: Math.round(dmg), by: attacker?.id ?? null, byFaction: attacker?.faction ?? null, cause, hp: Math.round(c.hp - dmg) }); }
    c.hp -= dmg;
    c.lastAttacker = attacker;
    c.bleed = Math.min(1, c.bleed + dmg / 120);
    c.blood = Math.min(1, c.blood + dmg / 140);
    g.charR.paint(c); // clothes soak through
    if (c.inVehicle && !c.seatPose) {
      // Hit through a window: a little blood out of the window toward the attacker, not out of the roof.
      const ax = attacker ? attacker.x - c.x : -dx, az = attacker ? attacker.z - c.z : -dz, al = Math.hypot(ax, az) || 1;
      g.fx.bloodSpray(c.x + (ax / al) * 1.1, 1.3, c.z + (az / al) * 1.1, ax / al, az / al, 3, 0.5);
    } else g.fx.bloodSpray(c.x, 1.3, c.z, dx, dz, cause === 'bullet' ? 10 : 18, cause === 'bullet' ? 1 : 1.4);
    g.audio.hit();
    if (c === g.player) g.hud.hurt(dmg);
    g.ai.onDamaged(c, attacker);
    if (attacker === g.player) g.qol.hit(c.hp <= 0);
    if (c.hp <= 0) this.kill(c, attacker, dx, dz, cause);
  }

  kill(c, attacker, dx, dz, cause) {
    if (cause === 'fire' || cause === 'drown') {
      // Burned or drowned: no blood bath, just the body (charred if it burned).
      const g = this.g;
      c.alive = false; c.hp = 0; c.deadTime = 0; c.speed = 0; c.aiming = false; c.burning = 0;
      if (cause === 'fire') { c.charred = 1; g.charR.paint(c); g.fx.decal(c.x, c.z, 1.6, '#151210'); }
      g.audio.death();
      if (c.npc && attacker !== g.player) { c.downedT = 45; g.emit('downed', { id: c.id, name: c.npc.name, backInSeconds: 45, by: attacker?.id ?? null }); }
      g.onKill(c, attacker, cause);
      return;
    }
    const g = this.g;
    c.alive = false;
    c.hp = 0;
    c.deadTime = 0;
    c.speed = 0;
    c.aiming = false;
    if (Math.hypot(dx, dz) > 0.1) c.face = Math.atan2(-dx, -dz); // feet toward the shooter
    g.fx.pool(c.x - dx * 0.8, c.z - dz * 0.8, 2.2 + Math.random() * 1.4);
    g.fx.bloodSpray(c.x, 1.0, c.z, dx, dz, 26, 1.3);
    if (cause === 'vehicle' || cause === 'explosion') g.fx.gibs(c.x, c.z, dx, dz, cause === 'explosion' ? 14 : 8);
    // Head pops: explosions, high-speed impacts, or a point-blank shotgun.
    const pointBlank = attacker && attacker.weapon === 'shotgun' && Math.hypot(attacker.x - c.x, attacker.z - c.z) < 5;
    if (cause === 'explosion' || (cause === 'vehicle' && Math.random() < 0.5) || pointBlank) {
      c.headless = true;
      c.neckSpray = 2.5;
      const hx = c.x - Math.sin(c.face) * 0.9, hz = c.z - Math.cos(c.face) * 0.9;
      g.fx.gibs(hx, hz, dx, dz, 10);
    }
    c.blood = 1;
    g.charR.paint(c);
    g.audio.death();
    // Named characters are essential: if anyone but the player drops them they're only
    // downed — Doc Reyes gets them back on their feet a bit later. The player's kills stick.
    if (c.npc && (attacker !== g.player || c.npc.essential)) { c.downedT = 45; g.hud.toast(`${c.npc.name} is down — Doc Reyes will patch them up`, 'warn'); g.emit('downed', { id: c.id, name: c.npc.name, backInSeconds: 45, by: attacker?.id ?? null }); }
    g.onKill(c, attacker, cause); // without the cause every kill logged as 'bullet': no ROADKILL or BLOWN UP in the feed
  }
}
