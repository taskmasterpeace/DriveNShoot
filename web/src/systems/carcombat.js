import * as THREE from 'three';
import { VEHICLES, DRIVING } from './vehicles.js';
import { glassLayout } from './vehiclebodies.js';
import { glassTexture, crackTexture } from '../world/textures.js';

// Car combat: breakable windows, shooting out of windows, people grabbing onto cars
// (zombies, raiders, the player), shaking them off, and being dragged out.
//
// Every pane of every vehicle is an instance of ONE InstancedMesh (1 draw call), packed afresh each
// frame: no per-vehicle slots to run out or leak, no ghost panes left hanging where a car despawned.
// Panes are unit quads the glass shader cuts into the trapezoids glassLayout() (vehiclebodies.js)
// fits between the pillars, raked like real glass so they read from the top-down camera; damage
// grows a crack web out from the impact point.
// Local vehicle frame: +z forward. 'left'/'right' are the DRIVER's left/right
// (left = up x forward = local +x in this y-up, +z-forward frame). Sides: front | rear | left | right.

const MAX_PANES = 384, SIDES = ['front', 'rear', 'left', 'right'];
const _m = new THREE.Matrix4(), _o = new THREE.Matrix4(), ONE = new THREE.Vector3(1, 1, 1);

// Tinted safety glass. Instance attributes: aShape (taper, skew) cuts the quad to its pane; aCrack
// (0 intact .. 1 about to give) reveals the crack web from the impact point outward, and 2 means shot
// out: only the crazed shards still caught in the frame are drawn (crack texture B), so a broken
// pane reads as broken from above instead of as a pane that was never there.
// Building windows (systems/interiors.js) use the same shader with clearer glass: pass map/opacity.
let crackMapShared = null; // the crack web is a seeded data texture: paint it once for every glass material
export function glassMaterial({ map = glassTexture(), opacity = 0.86 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.08, metalness: 0.3, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const crackMap = (crackMapShared ??= crackTexture());
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.crackMap = { value: crackMap };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCrack;\nattribute vec2 aShape;\nvarying float vCrack;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.x = transformed.x * mix(1.0, aShape.x, uv.y) + aShape.y * uv.y;\n  vCrack = aCrack;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D crackMap;\nvarying float vCrack;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  vec4 ck = texture2D(crackMap, vMapUv);
  if (vCrack > 1.5) {
    float edge = min(min(vMapUv.x, 1.0 - vMapUv.x), min(vMapUv.y, 1.0 - vMapUv.y));
    if (ck.b < 0.5 && edge > 0.016) discard;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.78, 0.8), 0.3); // crazed, so it catches light
  }
  float crack = vCrack > 0.0 ? ck.g * step(ck.r, vCrack) : 0.0;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.9, 0.93), crack * 0.9);
  diffuseColor.a = max(diffuseColor.a, crack * 0.95);`);
  };
  mat.customProgramCacheKey = () => 'dsoa-glass';
  return mat;
}

export class CarCombat {
  constructor(game) {
    this.g = game;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aCrack = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PANES), 1).setUsage(THREE.DynamicDrawUsage);
    this.aShape = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PANES * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCrack', this.aCrack);
    geo.setAttribute('aShape', this.aShape);
    this.mesh = new THREE.InstancedMesh(geo, glassMaterial(), MAX_PANES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.count = 0;
    game.scene.add(this.mesh);
  }

  layout(v) { return glassLayout(VEHICLES[v.type] ?? VEHICLES.interceptor, v.type); }

  // Lazily give each vehicle its windows + grabber list.
  ensure(v) {
    if (v.windows !== undefined) return;
    const lay = this.layout(v);
    v.grabbers = [];
    v.windows = lay ? Object.fromEntries(SIDES.map((s) => [s, { hp: lay.hp, max: lay.hp }])) : null;
  }

  // Which side of the car faces world point (x,z)?
  sideToward(v, x, z) { return this.sideOfLocal(v, x - v.x, z - v.z); }
  sideOfAngle(v, ang) { return this.sideOfLocal(v, Math.sin(ang), Math.cos(ang)); }
  sideOfLocal(v, dx, dz) {
    const lx = dx * Math.cos(v.h) - dz * Math.sin(v.h), lz = dx * Math.sin(v.h) + dz * Math.cos(v.h);
    if (Math.abs(lz) / (v.len * 0.5) > Math.abs(lx) / (v.wid * 0.5)) return lz > 0 ? 'front' : 'rear';
    return lx > 0 ? 'left' : 'right';
  }

  // World position of a window's centre, pushed `out` along its outward normal (or of the car's side
  // when it's an open vehicle).
  windowPos(v, side, out = 0) {
    const lay = this.layout(v);
    let lx = 0, lz = 0;
    if (lay) { const p = lay.panes[side], hn = Math.hypot(p.n.x, p.n.z) || 1; lx = p.c.x + (p.n.x / hn) * out; lz = p.c.z + (p.n.z / hn) * out; }
    else if (side === 'front') lz = v.len / 4 + out;
    else if (side === 'rear') lz = -v.len / 4 - out;
    else lx = (side === 'left' ? 1 : -1) * (v.wid / 2 + out);
    const c = Math.cos(v.h), s = Math.sin(v.h);
    return { x: v.x + lx * c + lz * s, z: v.z - lx * s + lz * c };
  }

  // Where someone hanging on the car stands: just outside the BODY (bumper / doors),
  // never inside the cabin footprint.
  hangPos(v, side, off) {
    let lx = 0, lz = 0;
    if (side === 'front') lz = v.len / 2 + 0.45;
    else if (side === 'rear') lz = -v.len / 2 - 0.45;
    else { lx = (side === 'left' ? 1 : -1) * (v.wid / 2 + 0.42); lz = off * Math.min(1.1, v.len * 0.18); }
    const c = Math.cos(v.h), s = Math.sin(v.h);
    return { x: v.x + lx * c + lz * s, z: v.z - lx * s + lz * c };
  }

  // A window is "open" to the outside if broken, or the car has no glass at all.
  exposed(v, side) { this.ensure(v); return !v.windows || v.windows[side].hp <= 0; }

  damageWindow(v, side, amount, by, outward = false) {
    this.ensure(v);
    if (!v.windows || v.dead) return false;
    const w = v.windows[side];
    if (w.hp <= 0) return false;
    w.hp -= amount;
    if (w.hp <= 0) { w.hp = 0; this.shatter(v, side, by, outward); return true; }
    this.g.audio.thud?.(this.g.pan(v.x));
    return false;
  }

  shatter(v, side, by, outward) {
    const g = this.g;
    const p = this.windowPos(v, side, 0.1);
    // Shards fly away from whoever broke it (outward when shot from inside).
    const fx = p.x - v.x, fz = p.z - v.z, d = Math.hypot(fx, fz) || 1;
    const k = outward ? 1 : -1;
    for (let i = 0; i < 16; i++) g.fx.spawn(1, p.x, (this.layout(v)?.panes[side].c.y ?? 1.5), p.z, (fx / d) * k * (2 + Math.random() * 4) + (Math.random() - 0.5) * 3, 1 + Math.random() * 3, (fz / d) * k * (2 + Math.random() * 4) + (Math.random() - 0.5) * 3, 0.9, 0.06, Math.random() < 0.5 ? '#cfe6ee' : '#9fc2d0', 18);
    g.fx.decal(p.x + (fx / d) * k * 0.8, p.z + (fz / d) * k * 0.8, 0.45, '#8f9ea4'); // glitter of glass on the road
    g.audio.glass?.(g.pan(p.x));
    g.emit('windowBroken', { vehicle: v.id, side, by: by?.id ?? null, fromInside: !!outward });
    if (v.driver === g.player && !outward) g.hud.toast(`${side.toUpperCase()} WINDOW SMASHED`, 'hot');
  }

  // Bullet hit a vehicle from outside: glass first, then whoever sits behind broken glass.
  onBulletHit(v, shooter, dmg, dx, dz) {
    this.ensure(v);
    const side = this.sideToward(v, shooter.x, shooter.z);
    if (v.windows && v.windows[side].hp > 0) {
      if (Math.random() < 0.45) this.damageWindow(v, side, dmg * 0.9, shooter);
      return;
    }
    // Open window (broken or no glass): the driver is exposed.
    if (v.driver && v.driver.alive && Math.random() < (v.windows ? 0.3 : 0.4)) this.g.combat.damage(v.driver, dmg * 0.8, shooter, dx, dz);
  }

  // Shoot out of a vehicle window. Knocks out that window first if it's intact.
  fireFromVehicle(ch, v, wkey, ang, w) {
    this.ensure(v);
    // Shooting from something that moves (vehicles.js DRIVING.shootSpread): the faster, the wilder; the one at the wheel
    // (or the bars) shoots one-handed. Any direction: a bike's rider and pillion turn at the waist (vehicles.js twist).
    const S = DRIVING.shootSpread, sp = this.g.vehiclesSys.speed(v);
    ang += (Math.random() - 0.5) * 2 * Math.min(S.max, sp * S.perMs) * (v.driver === ch ? S.driver : 1);
    ch.face = ang; ch.lastShotT = this.g.time;
    const side = this.sideOfAngle(v, ang);
    if (v.windows && v.windows[side].hp > 0 && !(v.utility?.gunports && v.driver !== ch)) this.damageWindow(v, side, 9999, ch, true); // gun ports: a passenger shoots through the door slot (data/workshop.js)
    const p = this.windowPos(v, side, -0.6); // just inside the frame: muzzle ends ~0.3m outside
    const sx = ch.x, sz = ch.z, wasIn = ch.inVehicle;
    ch.inVehicle = null; ch.firingFrom = v; ch.x = p.x; ch.z = p.z;
    let fired = false;
    try { fired = this.g.combat.fire(ch, wkey, ang, w); }
    finally {
      ch.firingFrom = null;
      if (wasIn && !v.dead && v.occ?.[ch.seat] === ch) { ch.inVehicle = v; ch.x = v.x; ch.z = v.z; }
      else if (!wasIn) { ch.x = sx; ch.z = sz; }
    }
    if (fired) this.g.emit('windowShot', { shooter: ch.id, vehicle: v.id, side });
    return fired;
  }

  // ---- grabbing ------------------------------------------------------------------------
  grabSlot(v) {
    // Two per side, one each on front/rear (hood/trunk). Returns a free {side, off} or null.
    const used = new Set(v.grabbers.map((gr) => `${gr.side}:${gr.off}`));
    for (const [side, off] of [['left', -1], ['left', 1], ['right', -1], ['right', 1], ['front', 0], ['rear', 0]])
      if (!used.has(`${side}:${off}`)) return { side, off };
    return null;
  }

  grab(c, v, preferSide) {
    this.ensure(v);
    if (c.grabbing || v.dead || v.grabbers.length >= 6) return false;
    let slot = this.grabSlot(v);
    if (preferSide) {
      const used = new Set(v.grabbers.map((gr) => `${gr.side}:${gr.off}`));
      for (const off of preferSide === 'front' || preferSide === 'rear' ? [0] : [-1, 1]) if (!used.has(`${preferSide}:${off}`)) { slot = { side: preferSide, off }; break; }
    }
    if (!slot) return false;
    c.grabbing = { v, side: slot.side, off: slot.off, grip: 1, t: 0, cool: 0.6 };
    v.grabbers.push(c.grabbing);
    c.grabbing.c = c;
    this.g.emit('grabbed', { vehicle: v.id, by: c.id, faction: c.faction, side: slot.side });
    if (v.driver === this.g.player && c !== this.g.player) this.g.hud.toast(c.faction === 'zombie' ? 'INFECTED ON THE CAR — SWERVE TO SHAKE IT' : 'SOMEONE GRABBED THE CAR', 'hot');
    if (c === this.g.player) this.g.hud.toast(`Hanging on the ${v.name} — [G] let go`, 'job');
    return true;
  }

  letGo(c, fling = 0) {
    const gr = c.grabbing;
    if (!gr) return;
    const v = gr.v;
    v.grabbers = v.grabbers.filter((x) => x !== gr);
    c.grabbing = null;
    const sp = this.g.vehiclesSys.speed(v);
    if (fling > 0 || sp > 9) {
      // Thrown off: tumble outward + along the car's travel, hit the dirt hard.
      const p = this.windowPos(v, gr.side, 1.8);
      const nx = p.x - v.x, nz = p.z - v.z, d = Math.hypot(nx, nz) || 1;
      const throwD = 1.5 + sp * 0.12 + fling;
      const t = { x: p.x + (nx / d) * throwD + v.vx * 0.15, z: p.z + (nz / d) * throwD + v.vz * 0.15 };
      this.g.statics.resolveCircle(t, 0.4);
      c.x = t.x; c.z = t.z;
      const dmg = (c === this.g.player ? 0.6 : 1) * (8 + sp * 2.2 + fling * 10);
      this.g.combat.damage(c, dmg, v.driver ?? null, nx / d, nz / d, sp > 14 ? 'vehicle' : 'bullet');
      this.g.fx.dust(c.x, c.z, 4);
      this.g.emit('flung', { id: c.id, vehicle: v.id, speed: Math.round(sp) });
    } else {
      const p = this.windowPos(v, gr.side, 1.3);
      const t = { x: p.x, z: p.z }; this.g.statics.resolveCircle(t, 0.4);
      c.x = t.x; c.z = t.z;
    }
  }

  // Zombie at a car: claw the window on its side; once open, reach in for the driver,
  // and sometimes latch on to the car.
  zombieAttack(z, v, dt) {
    this.ensure(v);
    z.zcool = (z.zcool ?? 0) - dt;
    if (z.zcool > 0) return;
    z.zcool = 0.8 + Math.random() * 0.4;
    const side = z.grabbing ? z.grabbing.side : this.sideToward(v, z.x, z.z);
    z.face = Math.atan2(v.x - z.x, v.z - z.z);
    if (!this.exposed(v, side)) {
      this.damageWindow(v, side, 7 + Math.random() * 5, z);
      if (Math.random() < 0.3) this.g.fx.spawn(1, z.x, 1.6, z.z, 0, 1, 0, 0.2, 0.05, '#e6eef0', 10);
    } else if (v.driver && v.driver.alive) {
      // Reaching through the broken window: only one arm fits through a window at a time.
      v.reach ??= {};
      const now = this.g.time;
      if ((v.reach[side] ?? -9) + 1.2 <= now) {
        v.reach[side] = now;
        const dx = v.x - z.x, dz = v.z - z.z, d = Math.hypot(dx, dz) || 1;
        this.g.combat.damage(v.driver, 8, z, dx / d, dz / d, 'bite');
      }
    }
    if (!z.grabbing && this.g.vehiclesSys.speed(v) < 7 && Math.random() < 0.35) this.grab(z, v, side);
  }

  update(dt) {
    const g = this.g;
    const M = this.mesh;
    let n = 0;
    for (const v of g.vehicles) {
      this.ensure(v);
      // Dead NPC driver: the car just rolls to a stop.
      if (v.driver && !v.driver.alive && v.driver !== g.player) { const d = v.driver; v.driver = null; if (v.occ) v.occ[0] = null; d.inVehicle = null; d.seat = null; }
      n = this.syncGlass(v, n);
      const sp = g.vehiclesSys.speed(v);
      // Raiders on foot jump onto the player's car when it's crawling.
      if (v.driver === g.player && sp < 5 && v.grabbers.length < 6) {
        for (const c of g.chars) {
          if (c.faction !== 'raider' || !c.alive || c.inVehicle || c.grabbing) continue;
          if (Math.abs(c.x - v.x) > v.len || Math.abs(c.z - v.z) > v.len) continue;
          let gap = Infinity;
          for (const d of g.vehiclesSys.discs(v)) gap = Math.min(gap, Math.hypot(d.x - c.x, d.z - c.z) - d.r);
          if (gap < 1.3 && Math.random() < dt * 1.5) this.grab(c, v, this.sideToward(v, c.x, c.z));
        }
      }
      if (!v.grabbers.length) continue;
      // Shake-off: hard cornering (centripetal), raw speed, and crashes.
      const latG = Math.abs(v.av) * sp;
      for (const gr of [...v.grabbers]) {
        const c = gr.c;
        if (!c.alive || v.dead) { this.letGo(c); continue; }
        gr.t += dt;
        if (c !== g.player) {
          if (latG > 13) gr.grip -= dt * 1.8 * (latG / 13);
          if (sp > 24) gr.grip -= dt * 0.7;
          if ((v.impact ?? 0) > 7) gr.grip = 0;
          if (gr.grip <= 0) { this.letGo(c, 1); continue; }
        } else if ((v.impact ?? 0) > 12) { this.letGo(c, 1); continue; }
        // Ride along at the slot.
        const p = this.hangPos(v, gr.side, gr.off);
        c.x = p.x; c.z = p.z;
        c.speed = 1.5; c.walk += dt * 6;
        if (c !== g.player) c.face = Math.atan2(v.x - c.x, v.z - c.z);
        // Hangers-on drag the car down.
        v.vx *= 1 - dt * 0.12; v.vz *= 1 - dt * 0.12;
        if (c.faction === 'zombie') this.zombieAttack(c, v, dt);
        else if (c !== g.player && c.faction === 'raider') this.raiderOnCar(c, gr, v, dt);
      }
    }
    M.count = n;
    M.instanceMatrix.needsUpdate = true;
    this.aCrack.needsUpdate = this.aShape.needsUpdate = true;
  }

  // Raider hanging on: smash the glass, then drag the driver out and take the wheel.
  raiderOnCar(r, gr, v, dt) {
    gr.cool -= dt;
    if (gr.cool > 0) return;
    gr.cool = 0.9 + Math.random() * 0.5;
    if (!this.exposed(v, gr.side)) { this.damageWindow(v, gr.side, 16, r); return; }
    if (!v.driver || this.g.vehiclesSys.speed(v) > 6) return;
    const victim = v.driver;
    gr.pull = (gr.pull ?? 0) + 1;
    if (gr.pull < 2) return; // one beat of struggle first
    this.letGo(r);
    if (victim === this.g.player) {
      this.g.exitVehicle(true);
      this.g.combat.damage(victim, 12, r, 0, 0);
      this.g.hud.toast(`${r.name ?? 'A raider'} DRAGGED YOU OUT`, 'hot');
    } else { this.g.seats.leave(victim); victim.flee = 6; victim.fleeX = v.x; victim.fleeZ = v.z; }
    this.g.seats.board(r, v, 0); v.ai = 'raider';
    this.g.emit('draggedOut', { vehicle: v.id, victim: victim.id, by: r.id });
  }

  // Write this vehicle's panes (a shot-out one as its rim of shards) from instance n on; returns the
  // next free instance. Uses the body group's real pose, so a gunboat's glass rolls with its hull.
  syncGlass(v, n) {
    const lay = this.layout(v);
    if (!lay || !v.windows || v.dead) return n;
    _m.compose(v.group.position, v.group.quaternion, ONE);
    for (let k = 0; k < 4; k++) {
      const w = v.windows[SIDES[k]];
      if (n >= MAX_PANES) break;
      const p = lay.panes[SIDES[k]];
      this.mesh.setMatrixAt(n, _o.multiplyMatrices(_m, p.m));
      this.aCrack.array[n] = w.hp <= 0 ? 2 : 1 - w.hp / w.max;
      this.aShape.array[n * 2] = p.taper; this.aShape.array[n * 2 + 1] = p.skew;
      n++;
    }
    return n;
  }

  // Tiny top-down diagram for the HUD: glass state per side + hangers-on.
  drawHud(ctx, v) {
    this.ensure(v);
    const W = 64, H = 96;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(16, 8, 32, 80);
    const col = (side) => {
      if (!v.windows) return 'rgba(245,178,26,0.9)';
      const w = v.windows[side];
      return w.hp <= 0 ? '#e8452a' : w.hp < w.max * 0.5 ? '#e6eef0' : '#7fa3b6';
    };
    ctx.fillStyle = col('front'); ctx.fillRect(20, 22, 24, 5);
    ctx.fillStyle = col('rear'); ctx.fillRect(20, 66, 24, 5);
    ctx.fillStyle = col('left'); ctx.fillRect(18, 30, 5, 32);
    ctx.fillStyle = col('right'); ctx.fillRect(41, 30, 5, 32);
    for (const gr of v.grabbers) {
      const pos = { front: [32, 4], rear: [32, 92], left: [8, 46 + gr.off * 12], right: [56, 46 + gr.off * 12] }[gr.side];
      ctx.fillStyle = gr.c.faction === 'zombie' ? '#8fbf5a' : '#ff4a3a';
      ctx.beginPath(); ctx.arc(pos[0], pos[1], 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  view(v) {
    this.ensure(v);
    return {
      windows: v.windows ? Object.fromEntries(SIDES.map((s) => [s, Math.round(v.windows[s].hp)])) : 'open (no glass)',
      grabbers: v.grabbers.map((gr) => ({ id: gr.c.id, faction: gr.c.faction, side: gr.side })),
    };
  }
}
