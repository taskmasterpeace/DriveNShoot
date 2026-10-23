import * as THREE from 'three';
import { radialGlow } from '../world/textures.js';

// Throwables: frag, molotov, smoke, flashbang, pipe bomb, sticky charge, rock.
// Real arcs (gravity), bounce + roll off ground and walls, cook timers, sticking,
// fire that spreads along fuel trails, smoke that blocks sight, flashes that blind.

export const THROWABLES = {
  frag:    { name: 'FRAG GRENADE', color: '#3d4a32', size: 0.14, fuse: 2.8, cook: true, bounce: 0.38, blast: { r: 7, dmg: 150 } },
  molotov: { name: 'MOLOTOV', color: '#c9a24a', size: 0.12, long: true, impact: true, fire: { r: 3.4, dur: 10 } },
  smoke:   { name: 'SMOKE', color: '#8a8a86', size: 0.13, fuse: 1.4, bounce: 0.3, smoke: { r: 7, dur: 18 } },
  flash:   { name: 'FLASHBANG', color: '#c8c8c0', size: 0.12, fuse: 1.6, bounce: 0.35, flash: { r: 12, dur: 4 } },
  pipe:    { name: 'PIPE BOMB', color: '#7a6a5a', size: 0.12, long: true, fuse: 5.5, bounce: 0.2, lure: 70, blast: { r: 8.5, dmg: 170 } },
  sticky:  { name: 'STICKY CHARGE', color: '#6a2a1a', size: 0.13, fuse: 2.6, sticky: true, bounce: 0.1, blast: { r: 5.5, dmg: 170 } },
  rock:    { name: 'ROCK', color: '#7e6248', size: 0.1, impact: true, noise: 26, bounce: 0.4 },
};
export const THROW_ORDER = ['frag', 'molotov', 'smoke', 'flash', 'pipe', 'sticky', 'rock'];

const G = 20, MAXP = 48, ARC = 28;
const _o = new THREE.Object3D(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Throwables {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.fires = [];   // {x,z,r,t,dur,by}
    this.smokes = [];  // {x,z,r,t,dur}
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }), MAXP);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    for (let i = 0; i < MAXP; i++) { this.mesh.setMatrixAt(i, ZERO); this.mesh.setColorAt(i, _c.set('#444')); }
    game.scene.add(this.mesh);
    // Arc preview dots while aiming.
    this.arc = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: '#f5b21a', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }), ARC + 1);
    this.arc.frustumCulled = false; this.arc.count = 0; this.arc.renderOrder = 6;
    game.scene.add(this.arc);
    // Fire glow on the ground under burning patches.
    this.fireGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialGlow(), color: '#ff7a1a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 32);
    this.fireGlow.frustumCulled = false; this.fireGlow.count = 0;
    game.scene.add(this.fireGlow);
    // Two dedicated flickering fire lights (fixed count: no shader recompiles) that
    // follow the fires/burning cars nearest the player.
    this.fireLights = [0, 1].map(() => { const l = new THREE.PointLight('#ff8a3a', 0, 22, 1.5); l.position.set(0, -50, 0); game.scene.add(l); return l; });
  }

  // Launch speed so a ~38° lob released at height `from` comes down ON the target, ground distance d
  // away (capped). It used to solve for a throw from the ground: released from the hand it landed
  // ~1.5 m long at 12 m, and the preview arc ended past the cursor.
  launch(ox, oz, tx, tz, from = 1.6) {
    const dx = tx - ox, dz = tz - oz, d = Math.min(30, Math.max(2, Math.hypot(dx, dz)));
    const th = 0.66, c = Math.cos(th), v0 = Math.min(26, Math.sqrt((G * d * d) / (2 * c * c * (d * Math.tan(th) + from))));
    const h = Math.atan2(dx, dz);
    return { vx: Math.sin(h) * Math.cos(th) * v0, vz: Math.cos(h) * Math.cos(th) * v0, vy: Math.sin(th) * v0, y: from };
  }

  // Thrower can be on foot or in a vehicle (then it goes out of the window on that side).
  throw(who, type, tx, tz, cooked = 0) {
    const def = THROWABLES[type];
    if (!def) return null;
    const g = this.g;
    let ox = who.x, oz = who.z, y = 1.6;
    const v = who.inVehicle;
    if (v) {
      const side = g.carCombat.sideOfAngle(v, Math.atan2(tx - v.x, tz - v.z));
      if (v.windows && v.windows[side]?.hp > 0) g.carCombat.damageWindow(v, side, 9999, who, true);
      const p = g.carCombat.windowPos(v, side, 0.4); ox = p.x; oz = p.z; y = 1.5;
    } else {
      const a = Math.atan2(tx - ox, tz - oz);
      ox += Math.sin(a) * 0.5; oz += Math.cos(a) * 0.5;
    }
    const l = this.launch(ox, oz, tx, tz, y);
    if (v) { l.vx += v.vx; l.vz += v.vz; } // inherits the car's speed
    const p = { type, def, x: ox, y: l.y, z: oz, vx: l.vx, vy: l.vy, vz: l.vz, t: cooked, owner: who, stuck: null, rest: false, beep: 0 };
    this.list.push(p);
    if (this.list.length > MAXP) this.list.shift();
    g.audio.throwWhoosh?.(g.pan(ox));
    g.emit('thrown_item', { by: who.id, type, x: Math.round(tx), z: Math.round(tz) });
    return p;
  }

  // Predicted path for the aim preview (ground + gravity only).
  previewArc(ox, oz, tx, tz) {
    const l = this.launch(ox, oz, tx, tz);
    let x = ox, y = l.y, z = oz, vx = l.vx, vy = l.vy, vz = l.vz;
    const pts = [];
    for (let i = 0; i < 80 && pts.length < ARC; i++) {
      const dt = 0.04;
      vy -= G * dt; x += vx * dt; y += vy * dt; z += vz * dt;
      if (i % 2 === 0) pts.push([x, Math.max(0.1, y), z]);
      if (y < 0.1) break;
    }
    return pts;
  }

  showArc(pts) {
    this.arc.count = pts ? pts.length : 0;
    if (!pts) return;
    pts.forEach(([x, y, z], i) => { _o.position.set(x, y, z); _o.rotation.set(0, 0, 0); _o.scale.setScalar(i === pts.length - 1 ? 2.2 : 1); _o.updateMatrix(); this.arc.setMatrixAt(i, _o.matrix); });
    this.arc.instanceMatrix.needsUpdate = true;
  }

  // ---- effects ---------------------------------------------------------------------------
  explode(x, z, def, by) {
    const g = this.g, { r, dmg } = def.blast;
    g.fx.explosion(x, z);
    g.audio.explosion(Math.hypot(x - g.player.x, z - g.player.z));
    g.hud.shake(Math.max(0, 1.2 - Math.hypot(x - g.player.x, z - g.player.z) / 30));
    g.noise(x, z, 80, by);
    g.interiors?.blast(x, z, r, by); // glass blows in, boards splinter, doors fly open, locks give
    for (const c of g.chars) {
      if (!c.alive || c.inVehicle) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > r || !g.statics.lineOfSight(x, z, c.x, c.z)) continue;
      const f = 1 - d / r;
      g.combat.damage(c, dmg * f * f + 10 * f, by, (c.x - x) / (d || 1), (c.z - z) / (d || 1), f > 0.5 ? 'explosion' : 'bullet');
    }
    g.dogs?.blast(x, z, r, dmg, by); // and any dog in reach (systems/dogs.js)
    for (const v of g.vehicles) {
      const d = Math.hypot(v.x - x, v.z - z);
      if (d > r + v.len / 2 || v.dead) continue;
      const f = Math.max(0, 1 - Math.max(0, d - v.len / 2) / r);
      g.vehiclesSys.damage(v, dmg * f * 0.8, by);
      g.vehDamage.hit(v, x, z, f * 0.6, 'blast');
      if (v.windows) for (const s of Object.keys(v.windows)) if (Math.random() < f) g.carCombat.damageWindow(v, s, 9999, by);
      for (const o of v.occ ?? []) if (o && f > 0.6 && (!v.windows || Math.random() < f)) g.combat.damage(o, dmg * f * 0.5, by, 0, 0, 'explosion');
      v.vx += ((v.x - x) / (d || 1)) * f * 9 / v.mass; v.vz += ((v.z - z) / (d || 1)) * f * 9 / v.mass; v.av += (Math.random() - 0.5) * f * 4;
    }
    this.igniteNear(x, z, r * 0.6, by);
  }

  startFire(x, z, r, dur, by) {
    if (this.fires.length > 30) this.fires.shift();
    this.fires.push({ x, z, r, t: 0, dur, by });
    this.g.fx.decal(x, z, r * 2, '#141210');
    this.g.emit('fire', { x: Math.round(x), z: Math.round(z) });
  }

  // Fire spreads along leaking-fuel trails.
  igniteNear(x, z, r, by) {
    const trail = this.g.fuelTrail;
    if (!trail) return;
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i];
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) { trail.splice(i, 1); this.startFire(p.x, p.z, 1.6, 6, by); }
    }
  }

  // Smoke clouds block sight lines (used by AI targeting).
  blocksSight(ax, az, bx, bz) {
    for (const s of this.smokes) {
      const rr = s.r * Math.min(1, s.t / 1.5);
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.z - az) * dz) / len2));
      const px = ax + dx * t - s.x, pz = az + dz * t - s.z;
      if (px * px + pz * pz < rr * rr) return true;
    }
    return false;
  }

  detonate(p) {
    const g = this.g, def = p.def;
    if (def.blast) this.explode(p.x, p.z, def, p.owner);
    if (def.fire) { this.startFire(p.x, p.z, def.fire.r, def.fire.dur, p.owner); g.audio.glass?.(g.pan(p.x)); g.audio.whoomp?.(g.pan(p.x)); }
    if (def.smoke) { this.smokes.push({ x: p.x, z: p.z, r: def.smoke.r, t: 0, dur: def.smoke.dur }); g.audio.hiss?.(g.pan(p.x)); }
    if (def.flash) {
      g.fx.flash(p.x, 2, p.z, 30, 0.25); g.fx.light(p.x, 3, p.z, '#ffffff', 120, 0.4);
      g.audio.bang?.(Math.hypot(p.x - g.player.x, p.z - g.player.z));
      for (const c of g.chars) {
        if (!c.alive) continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d > def.flash.r || (!c.inVehicle && !g.statics.lineOfSight(p.x, p.z, c.x, c.z))) continue;
        c.blind = def.flash.dur * (1 - d / def.flash.r) + 0.8;
        if (c === g.player) g.hud.flashbang(c.blind);
      }
    }
    if (def.noise) { g.noise(p.x, p.z, def.noise, p.owner); g.zombies.onNoise(p.x, p.z, def.noise * 1.5); g.audio.thud?.(g.pan(p.x)); }
    g.emit('detonated', { kind: p.type, x: Math.round(p.x), z: Math.round(p.z) });
  }

  update(dt) {
    const g = this.g;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i], def = p.def;
      p.t += dt;
      if (p.stuck) {
        const s = p.stuck;
        p.x = s.ref.x + s.ox; p.z = s.ref.z + s.oz; p.y = 1.1;
      } else if (!p.rest) {
        p.vy -= G * dt;
        // Walls: raycast the horizontal step, reflect.
        const sp = Math.hypot(p.vx, p.vz);
        if (sp > 0.01) {
          const step = sp * dt, ux = p.vx / sp, uz = p.vz / sp;
          const hitT = g.statics.raycast(p.x, p.z, ux, uz, step + 0.1, 0, p.y); // flies over sills and crates lower than it
          const op = g.statics.hit.box?.op;
          if (hitT < step + 0.1 && g.statics.hit.box && p.y < (g.statics.hit.box.height ?? 3) && !(op && g.interiors.thrownHit(op, p, ux, uz))) {
            if (def.impact) { p.x += ux * hitT; p.z += uz * hitT; this.detonate(p); this.list.splice(i, 1); continue; }
            const nx = g.statics.hit.nx, nz = g.statics.hit.nz;
            if (nx) p.vx = -p.vx * (def.bounce ?? 0.3); if (nz) p.vz = -p.vz * (def.bounce ?? 0.3);
            g.audio.clink?.(g.pan(p.x));
          }
        }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        // Hit a person or a car in flight.
        if (p.t > 0.08) {
          for (const c of g.chars) {
            if (!c.alive || c.inVehicle || c === p.owner) continue;
            if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 < 0.36 && p.y < 2) {
              if (def.impact) { this.detonate(p); this.list.splice(i, 1); p.done = true; break; }
              if (def.sticky) { p.stuck = { ref: c, ox: p.x - c.x, oz: p.z - c.z }; g.hud.toast(c === g.player ? 'STUCK TO YOU!' : 'STUCK!', 'hot'); break; }
              p.vx *= -0.3; p.vz *= -0.3;
            }
          }
          if (p.done) continue;
          for (const v of g.vehicles) {
            if (v === p.owner.inVehicle || v.dead) continue;
            let hit = false;
            for (const d of g.vehiclesSys.discs(v)) if ((d.x - p.x) ** 2 + (d.z - p.z) ** 2 < d.r * d.r && p.y < 2.2) { hit = true; break; }
            if (!hit) continue;
            if (def.impact) { this.detonate(p); this.list.splice(i, 1); p.done = true; break; }
            if (def.sticky) { p.stuck = { ref: v, ox: p.x - v.x, oz: p.z - v.z }; break; }
            // Through a broken window: it lands inside the car.
            const side = g.carCombat.sideToward(v, p.x - p.vx * 0.05, p.z - p.vz * 0.05);
            if (g.carCombat.exposed(v, side) && v.occ?.some(Boolean)) { p.stuck = { ref: v, ox: 0, oz: 0 }; g.hud.toast('GRENADE IN THE CAR!', 'hot'); break; }
            p.vx = -p.vx * 0.3; p.vz = -p.vz * 0.3;
          }
          if (p.done) continue;
        }
        // Ground: bounce, roll, settle.
        if (p.y < def.size) {
          if (def.impact) { p.y = 0.1; this.detonate(p); this.list.splice(i, 1); continue; }
          p.y = def.size; p.vy = -p.vy * (def.bounce ?? 0.3); p.vx *= 0.62; p.vz *= 0.62;
          if (Math.abs(p.vy) < 0.8) p.vy = 0;
          if (Math.hypot(p.vx, p.vz) < 0.25 && p.vy === 0) p.rest = true;
          if (Math.abs(p.vy) > 1) g.audio.clink?.(g.pan(p.x));
        }
      }
      if (def.lure) { p.beep -= dt; if (p.beep <= 0) { p.beep = Math.max(0.12, 0.6 - p.t * 0.08); g.audio.beep?.(g.pan(p.x)); g.zombies.onNoise(p.x, p.z, def.lure); } }
      if (def.fuse && p.t >= def.fuse) { this.detonate(p); this.list.splice(i, 1); continue; }
      if (p.t > 30) this.list.splice(i, 1);
    }
    // Render projectiles.
    this.list.forEach((p, k) => {
      const s = p.def.size;
      _o.position.set(p.x, p.y, p.z); _o.rotation.set(p.t * 9, p.t * 5, 0); _o.scale.set(s, p.def.long ? s * 2.6 : s, s); _o.updateMatrix();
      this.mesh.setMatrixAt(k, _o.matrix); this.mesh.setColorAt(k, _c.set(p.def.color));
    });
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.updateFires(dt);
    this.updateSmoke(dt);
  }

  updateFires(dt) {
    const g = this.g;
    let n = 0;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt;
      if (f.t > f.dur) { this.fires.splice(i, 1); continue; }
      const k = Math.min(1, f.t * 3) * Math.min(1, (f.dur - f.t) / 2);
      // Flames.
      for (let j = 0; j < 3; j++) if (Math.random() < dt * 40 * k) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * f.r;
        g.fx.spawn(4, f.x + Math.cos(a) * r, 0.3, f.z + Math.sin(a) * r, 0, 2 + Math.random() * 3, 0, 0.5 + Math.random() * 0.4, 0.3 + Math.random() * 0.3, Math.random() < 0.5 ? '#ff9a2a' : '#ff5a1a', -2);
      }
      if (Math.random() < dt * 4) g.fx.smoke(f.x, 1.5, f.z, true);
      // Burn whoever stands in it; cars in it cook.
      for (const c of g.chars) if (c.alive && !c.inVehicle && (c.x - f.x) ** 2 + (c.z - f.z) ** 2 < f.r * f.r) { if (!(c.burning > 0)) g.emit('ignited', { id: c.id }); c.burning = 4; c.burnBy = f.by; }
      for (const v of g.vehicles) if (!v.dead && (v.x - f.x) ** 2 + (v.z - f.z) ** 2 < (f.r + v.wid / 2) ** 2) { g.vehiclesSys.damage(v, 14 * dt, f.by); if (v.dmg) v.dmg.temp += dt * 0.2; }
      if (Math.random() < dt) this.igniteNear(f.x, f.z, f.r + 0.5, f.by);
      if (n < 32) { _o.position.set(f.x, 0.16, f.z); _o.rotation.set(0, f.t, 0); const s = f.r * 2.4 * k * (0.9 + Math.random() * 0.2); _o.scale.set(s, 1, s); _o.updateMatrix(); this.fireGlow.setMatrixAt(n++, _o.matrix); }
    }
    this.fireGlow.count = n;
    this.fireGlow.instanceMatrix.needsUpdate = true;
    // Light the nearest two fire sources (patches + burning vehicles).
    const px = g.player.x, pz = g.player.z;
    const src = this.fires.map((f) => ({ x: f.x, z: f.z, k: Math.min(1, f.t * 3) * Math.min(1, (f.dur - f.t) / 2) }));
    for (const v of g.vehicles) if (v.onFire > 0 || v.burn > 0) src.push({ x: v.x, z: v.z, k: 1 });
    src.sort((a, b) => (a.x - px) ** 2 + (a.z - pz) ** 2 - ((b.x - px) ** 2 + (b.z - pz) ** 2));
    this.fireLights.forEach((l, i) => {
      const f = src[i];
      if (!f || (f.x - px) ** 2 + (f.z - pz) ** 2 > 90 * 90) { l.intensity = 0; return; }
      l.position.set(f.x, 2.2, f.z);
      l.intensity = f.k * (34 + Math.sin(g.time * 23 + i * 5) * 8 + Math.random() * 6);
    });
    // Burning people: damage over time, panic, flames on the body.
    for (const c of g.chars) {
      if (!(c.burning > 0) || !c.alive) continue;
      c.burning -= dt;
      g.combat.damage(c, 11 * dt, c.burnBy ?? null, 0, 0, 'fire');
      if (Math.random() < dt * 30) g.fx.spawn(4, c.x + (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 1.2, c.z + (Math.random() - 0.5) * 0.6, 0, 2, 0, 0.4, 0.22, Math.random() < 0.5 ? '#ff9a2a' : '#ff5a1a', -2);
      if (c !== g.player && c.faction !== 'zombie' && c.alive) { c.flee = 1; c.fleeX = c.x + (Math.random() - 0.5) * 6; c.fleeZ = c.z + (Math.random() - 0.5) * 6; }
    }
  }

  updateSmoke(dt) {
    const g = this.g;
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt;
      if (s.t > s.dur) { this.smokes.splice(i, 1); continue; }
      const k = Math.min(1, s.t / 1.5) * Math.min(1, (s.dur - s.t) / 3);
      if (Math.random() < dt * 26 * k) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * s.r * 0.8;
        g.fx.spawn(2, s.x + Math.cos(a) * r, 0.5 + Math.random() * 1.5, s.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6, 3 + Math.random() * 2, 1.4 + Math.random() * 1.2, Math.random() < 0.5 ? '#b8b4ac' : '#9a968e', -0.1);
      }
    }
  }
}
