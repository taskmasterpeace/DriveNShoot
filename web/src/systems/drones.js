import { DRONES } from '../data/gadgets.js';

// DRONES (docs/design/WEB_GADGETS.md §4; rows in data/gadgets.js DRONES). Launched from the pack: the item leaves it and
// a drone lifts off where you stand. While it flies YOU fly it (WASD, Shift boosts, E brings it home, U drops a bomb)
// and your body stays put, frozen where you left it (main.js updatePlayer hands the keys here). Battery drains by the
// second (twice as fast boosting); the signal weakens past `weak` of its range and is lost past the range itself: then
// it flies itself home and lands, and so it does on a low battery. Landed beside you it goes back in the pack (charged
// again after `recharge` s). Every half second it MARKS the enemies under it (the minimap rings them for 8 s). It is a
// flier like the birds: anyone armed and hostile who sees it inside 35 m shoots at it, and at 0 hp it falls and breaks
// (what is left lies on the ground as scrap).
//
// The camera lane owns the rig: this only publishes g.droneCam { active, x, z, h } and main.js updateCamera follows it
// through one small hook while active.
const SHOOT_R = 35, MARK_FOR = 8;
const r1 = (v) => Math.round(v * 10) / 10;

export class Drones {
  constructor(game, gadgets) {
    this.g = game; this.gx = gadgets;
    this.rows = DRONES;
    this.d = null;            // the one in the air: { kind, def, x, z, y, h, vx, vz, battery, hp, bombs, state, pilot, ... }
    this.piloting = false;
    this.bombs = [];          // falling: { x, z, y, t, def, by }
    this.cool = {};           // kind -> game time it is charged again
    this.counts = { launched: 0, landed: 0, lost: 0, shotDown: 0, marked: 0, bombs: 0, crashed: 0 };
    game.droneCam = this.cam = { active: false, x: 0, z: 0, h: 40 };
  }

  launch(kind, pilot = this.g.player) {
    const g = this.g, def = DRONES[kind];
    if (!def) return { ok: false, why: `kinds: ${Object.keys(DRONES).join(', ')}` };
    if (this.d) return { ok: false, why: 'one drone in the air at a time' };
    if (pilot.inVehicle && g.vehiclesSys.speed(pilot.inVehicle) > 2) return { ok: false, why: 'stop the car first' };
    if ((this.cool[kind] ?? 0) > g.time) return { ok: false, why: `its battery is still charging (${Math.ceil(this.cool[kind] - g.time)} s)` };
    const x = pilot.x + Math.sin(pilot.face ?? 0) * 0.8, z = pilot.z + Math.cos(pilot.face ?? 0) * 0.8;
    this.d = { kind, def, x, z, y: 0.3, h: pilot.face ?? 0, vx: 0, vz: 0, battery: def.battery, hp: def.hp, bombs: def.bombs, state: 'fly', pilot, markT: 0, shotT: 0, buzzT: 0, signal: 1, t: 0, ix: 0, iz: 0, boost: false, why: null };
    this.piloting = pilot === g.player;
    this.counts.launched++;
    g.emit('droneLaunched', { kind, x: r1(x), z: r1(z) });
    return { ok: true, text: `${def.name.toUpperCase()} UP · WASD FLY · E HOME${def.bombs ? ' · U DROP' : ''}` };
  }

  // The keys while flying (main.js updatePlayer calls this instead of moving you).
  input(I) {
    const d = this.d;
    if (!d || d.state !== 'fly') return;
    d.ix = (I.key('KeyD') || I.key('ArrowRight') ? 1 : 0) - (I.key('KeyA') || I.key('ArrowLeft') ? 1 : 0);
    d.iz = (I.key('KeyS') || I.key('ArrowDown') ? 1 : 0) - (I.key('KeyW') || I.key('ArrowUp') ? 1 : 0);
    d.boost = I.key('ShiftLeft') || I.key('ShiftRight');
    if (I.hit('KeyE')) this.recall('called home');
  }

  // Fly it from outside (the drone command, a scenario): a direction held for the next frames, or a point to go to.
  steer(ix, iz, boost = false) { const d = this.d; if (!d) return; d.ix = ix; d.iz = iz; d.boost = boost; d.goto = null; }
  goTo(x, z) { const d = this.d; if (!d) return; d.goto = { x, z }; }

  recall(why) {
    const d = this.d;
    if (!d || d.state === 'down') return;
    if (d.state !== 'home') { d.state = 'home'; d.why = why; this.g.emit('droneReturning', { kind: d.kind, why }); }
  }

  dropBomb() {
    const g = this.g, d = this.d;
    if (!d || d.state === 'down') return { ok: false, why: 'no drone up' };
    if (!(d.bombs > 0)) { if (this.piloting) g.hud?.toast('NO BOMBS ON THIS ONE', 'warn'); return { ok: false, why: 'no bombs left' }; }
    d.bombs--; this.counts.bombs++;
    this.bombs.push({ x: d.x, z: d.z, y: d.def.alt, t: 0, def: d.def.bomb, by: d.pilot, vx: d.vx * 0.6, vz: d.vz * 0.6 });
    g.audio.clink?.(g.pan(d.x));
    g.emit('droneBomb', { x: r1(d.x), z: r1(d.z), left: d.bombs });
    return { ok: true, left: d.bombs };
  }

  // Shot at: a hit takes hp; at 0 it falls.
  hurt(dmg, by) {
    const d = this.d;
    if (!d || d.state === 'down') return;
    d.hp -= dmg;
    this.g.fx.sparks(d.x, d.y, d.z, 0, 0, 4);
    if (d.hp <= 0) { this.counts.shotDown++; this.crash('shot down', by); }
  }

  crash(why, by = null) {
    const g = this.g, d = this.d;
    d.state = 'down'; d.why = why; d.downT = 0;
    this.piloting = false;
    g.emit('droneDown', { kind: d.kind, why, by: by?.id ?? null, x: r1(d.x), z: r1(d.z) });
    if (d.pilot === g.player) g.hud?.toast(`DRONE ${why.toUpperCase()}`, 'hot');
  }

  land() {
    const g = this.g, d = this.d;
    this.counts.landed++;
    this.cool[d.kind] = g.time + (d.battery < d.def.battery * 0.5 ? d.def.recharge : d.def.recharge * 0.3);
    if (d.pilot === g.player) g.inventory?.stow(`drone_${d.kind}`, 1);
    g.emit('droneLanded', { kind: d.kind, why: d.why, battery: Math.round(d.battery), bombs: d.bombs });
    this.d = null; this.piloting = false;
  }

  update(dt) {
    const g = this.g, d = this.d;
    this.cam.active = false;
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.t += dt; b.x += b.vx * dt; b.z += b.vz * dt; b.y -= (9 + 20 * b.t) * dt;
      if (b.y <= 0.2) { this.gx.blast(b.x, b.z, b.def, b.by); this.bombs.splice(i, 1); }
    }
    if (!d) return;
    d.t += dt;
    const P = d.pilot, def = d.def;
    if (!P.alive) { if (d.state !== 'down') this.crash('lost its pilot'); }
    if (d.state === 'down') {
      d.y = Math.max(0.15, d.y - dt * 14); d.downT += dt;
      if (d.downT > 1.2) { this.counts.crashed++; if (d.pilot === g.player) g.inventory?.add(g.inventory.groundAt(d.x, d.z), 'scrap', 1); g.fx.explosion?.(d.x, d.z); this.d = null; }
      return;
    }
    const dx = d.x - P.x, dz = d.z - P.z, dist = Math.hypot(dx, dz);
    // Battery, signal.
    d.battery -= dt * (d.boost && d.state === 'fly' ? 2 : 1);
    d.signal = Math.max(0, 1 - Math.max(0, dist - def.range * def.weak) / (def.range * (1 - def.weak)));
    if (d.state === 'fly') {
      if (dist > def.range) { this.counts.lost++; g.emit('droneSignalLost', { kind: d.kind, d: r1(dist) }); if (this.piloting) g.hud?.toast('SIGNAL LOST · IT IS COMING HOME', 'hot'); this.recall('signal lost'); }
      else if (d.battery < def.battery * 0.12) this.recall('low battery');
    }
    if (d.battery <= 0) { this.crash('ran flat'); return; }
    // Where it wants to go.
    let ix = d.ix, iz = d.iz, sp = def.speed * (d.boost ? def.boost : 1);
    if (d.state === 'home') {
      if (dist < 1.6) { d.y -= dt * 6; if (d.y <= 0.35) { this.land(); return; } ix = iz = 0; }
      else { ix = -dx / dist; iz = -dz / dist; sp = def.speed; }
      this.piloting = false;
    } else if (d.goto) {
      const gx = d.goto.x - d.x, gz = d.goto.z - d.z, gd = Math.hypot(gx, gz);
      if (gd < 1) { ix = iz = 0; } else { ix = gx / gd; iz = gz / gd; }
    } else { const m = Math.hypot(ix, iz); if (m > 1) { ix /= m; iz /= m; } }
    const k = 1 - Math.exp(-dt * 4);
    d.vx += (ix * sp - d.vx) * k; d.vz += (iz * sp - d.vz) * k;
    d.x += d.vx * dt; d.z += d.vz * dt;
    if (d.state === 'fly') d.y += (def.alt - d.y) * (1 - Math.exp(-dt * 2));
    if (Math.hypot(d.vx, d.vz) > 0.5) d.h = Math.atan2(d.vx, d.vz);
    // Weak signal: a warning, a wobble.
    if (this.piloting) {
      g.hud?.prompt(`<b>DRONE</b> · battery ${Math.round((d.battery / def.battery) * 100)}% · signal ${d.signal < 1 ? `<b class="warn">${Math.round(d.signal * 100)}%</b>` : 'good'}${def.bombs ? ` · bombs ${d.bombs} <kbd>U</kbd>` : ''} · <kbd>E</kbd> home`);
      if (d.signal < 1) { d.vx += (Math.random() - 0.5) * (1 - d.signal) * 4; d.vz += (Math.random() - 0.5) * (1 - d.signal) * 4; }
    }
    // The buzz the dead hear (THE PULL: drone flyovers drag them).
    d.buzzT -= dt;
    if (d.buzzT <= 0) { d.buzzT = 2; g.zombies?.onNoise(d.x, d.z, 22); }
    // Marks: every enemy under it.
    d.markT -= dt;
    if (d.markT <= 0) {
      d.markT = def.markEvery;
      let n = 0;
      for (const c of g.chars) {
        if (!c.alive || Math.abs(c.x - d.x) > def.mark || Math.abs(c.z - d.z) > def.mark) continue;
        if (!this.gx.enemyOf(P, c) || Math.hypot(c.x - d.x, c.z - d.z) > def.mark) continue;
        if (!(c.marked > g.time)) n++;
        c.marked = g.time + MARK_FOR;
      }
      if (n) { this.counts.marked += n; g.emit('droneMarked', { n, x: r1(d.x), z: r1(d.z) }); }
    }
    // Shot at like any flier: the armed and hostile who can see it.
    d.shotT -= dt;
    if (d.shotT <= 0) {
      d.shotT = 0.6;
      for (const c of g.chars) {
        if (!c.alive || !c.weapon || c.inVehicle || c === P || Math.abs(c.x - d.x) > SHOOT_R || Math.abs(c.z - d.z) > SHOOT_R) continue;
        if (!g.ai.hostile(c, P) || (c.blind ?? 0) > 0 || !g.los(c.x, c.z, d.x, d.z)) continue;
        const r = Math.hypot(c.x - d.x, c.z - d.z);
        if (r > SHOOT_R) continue;
        g.audio.gun?.(c.weapon === 'shotgun' ? 'shotgun' : 'smg', Math.hypot(c.x - g.player.x, c.z - g.player.z), g.pan(c.x));
        g.fx.flash(c.x, 1.3, c.z, 0.8, 0.04);
        c.face = Math.atan2(d.x - c.x, d.z - c.z);
        if (Math.random() < 0.55 - r / 90) this.hurt(c.weapon === 'shotgun' ? 14 : 8, c);
        if (!this.d || this.d.state === 'down') return;
      }
    }
    if (this.piloting || d.state === 'home') { this.cam.active = this.piloting; this.cam.x = d.x; this.cam.z = d.z; this.cam.h = 46; }
  }

  // Into the gadgets' box mesh: a body, four rotors, a shadow on the ground. Falling bombs.
  draw(gx) {
    const d = this.d, t = this.g.time;
    for (const b of this.bombs) gx.put(b.x, b.y, b.z, t * 5, 0, 0, 0, 0.12, 0.32, 0.12, '#6a5a4a');
    if (!d) return;
    const y = d.y, h = d.h, spin = t * 40;
    gx.put(d.x, y, d.z, h, 0, 0, 0, 0.42, 0.14, 0.42, d.kind === 'bomber' ? '#5a5a48' : '#3a3a36');
    for (const [lx, lz] of [[0.32, 0.32], [-0.32, 0.32], [0.32, -0.32], [-0.32, -0.32]]) {
      gx.put(d.x, y, d.z, h, lx * 0.6, 0.02, lz * 0.6, 0.06, 0.04, 0.32, '#262626', 0, 0);
      gx.put(d.x, y, d.z, h, lx, 0.1, lz, 0.36, 0.01, 0.05, '#8a8478'); // the blur of a rotor
      gx.put(d.x, y, d.z, h + spin, lx, 0.1, lz, 0.05, 0.01, 0.36, '#8a8478');
    }
    gx.put(d.x, y, d.z, h, 0, -0.1, 0.18, 0.08, 0.06, 0.08, Math.sin(t * 8) > 0 ? '#ff3b2a' : '#3a1a14'); // the eye
    if (d.bombs > 0) gx.put(d.x, y, d.z, h, 0, -0.18, 0, 0.12, 0.2, 0.12, '#6a5a4a');
    gx.put(d.x, 0, d.z, h, 0, 0.03, 0, 0.5, 0.01, 0.5, '#151210'); // its shadow
  }

  drawMinimap(c, px, pz, scale, R) {
    const g = this.g;
    c.lineWidth = 1.8; c.strokeStyle = '#f5b21a';
    for (const ch of g.chars) {
      if (!(ch.marked > g.time) || !ch.alive) continue;
      const x = R + (ch.x - px) * scale, y = R + (ch.z - pz) * scale;
      if ((x - R) ** 2 + (y - R) ** 2 > (R - 16) ** 2) continue;
      c.beginPath(); c.arc(x, y, 4.5, 0, 6.3); c.stroke();
    }
    const d = this.d;
    if (!d) return;
    const x = R + (d.x - px) * scale, y = R + (d.z - pz) * scale;
    if ((x - R) ** 2 + (y - R) ** 2 > (R - 16) ** 2) return;
    c.fillStyle = d.signal < 1 ? '#ff5a3a' : '#f3e6cf';
    c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x + 4, y); c.lineTo(x, y + 4); c.lineTo(x - 4, y); c.closePath(); c.fill();
  }

  view() {
    const d = this.d, P = this.g.player;
    if (!d) return { up: false, cooling: Object.fromEntries(Object.entries(this.cool).filter(([, t]) => t > this.g.time).map(([k, t]) => [k, r1(t - this.g.time)])), counts: { ...this.counts } };
    return { up: true, kind: d.kind, state: d.state, why: d.why, x: r1(d.x), z: r1(d.z), alt: r1(d.y), d: r1(Math.hypot(d.x - d.pilot.x, d.z - d.pilot.z)), range: d.def.range,
      signal: +d.signal.toFixed(2), battery: Math.round(d.battery), hp: Math.round(d.hp), bombs: d.bombs, piloting: this.piloting, pilotAt: { x: r1(P.x), z: r1(P.z) }, counts: { ...this.counts } };
  }
}
