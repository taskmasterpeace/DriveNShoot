import * as THREE from 'three';
import { SEALIFE, SEA_RULES as SR } from '../data/sealife.js';
import { rayCircle } from '../engine/collision.js';

// SEA LIFE (docs/design/WEB_WATER_LIFE.md; rows in data/sealife.js). What lives in the water and what you see of it from
// above: a shark's fin cutting the surface while it cruises and its silhouette under it, a school of bait fish that
// scatters, gulls wheeling over the bait, and in a few deep places THE DEEP ONE - a vast shape passing under you, arms
// that come up for a swimmer or a small boat. You can shoot a shark (the water eats a round's damage with depth) or get
// out of the water; the deep one you run from (to shallow water, out of its water) or drive off with fire and blasts.
//
// THE LAW: nobody cheats. Every creature acts on stimuli in the water - blood (smell range), a splash, a kicking
// swimmer, an engine, a shot (hear range), something it can see through the murk (see range) - and goes to where the
// sense came from. It never reads the player's position. The deep one is announced by its shape: from its first sense
// to its first reach it rises for `rise` seconds under what it heard, a growing dark shadow, never a jump scare.
//
// Drawing (fixed draw calls, all pooled InstancedMeshes, hidden when empty): the silhouettes (one atlas of four shapes,
// faded and blurred with their depth: a shader samples the atlas at a mip bias = blur), the fins, the deep one's arms,
// the gulls. A diver under the surface (characters.js sinks their body under the opaque sheet) is drawn as a
// silhouette too: you see them go dark.
const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const angTo = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const CELL = { shark: 0, leviathan: 1, fish: 2, swimmer: 3 };
const VIS = { shark: [0.85, 2.6, 0.55], leviathan: [1.0, 6.5, 0.2], fish: [0.75, 1.6, 0.6], swimmer: [0.85, 1.8, 0.6] }; // [alpha at the surface, depth that takes 63% of it, blur per metre]
const MAXSIL = 220, MAXFIN = 12, MAXARM = 8 * 8, MAXGULL = 40;
const HIT = { t: 0, a: null, arm: -1 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _w = { h: 0, sx: 0, sz: 0, j: 1, vy: 0, amp: 0, kind: null, depth: 0 };
const _sense = { x: 0, z: 0, kind: null, who: null, str: 0, d: 0 };

export class Sealife {
  constructor(game) {
    this.g = game;
    game.sealife = this;
    this.enabled = true;
    this.spawning = true;   // false: the director rolls nothing (a test stages its own creatures)
    this.live = [];
    this.seq = 0; this.t = 0; this.tickT = 0;
    // Stimuli in the water: a fixed ring of records (no garbage). kind: blood | splash | kick | engine | shot.
    this.stim = Array.from({ length: 96 }, () => ({ x: 0, z: 0, kind: null, str: 0, t: -1e9, life: 0, src: null }));
    this.sNext = 0;
    this.stats = { spawned: 0, despawned: 0, bites: 0, kills: 0, grabs: 0, drags: 0, drivenOff: 0, scatters: 0, senses: { blood: 0, splash: 0, kick: 0, engine: 0, shot: 0, sight: 0 } };
    this.watch = new Map();  // character -> { hp, kickT, bloodT }: what the water learns from the people in it
    this.places = null;      // resolved leviathan waters (systems/waterplace.js resolves the rows)
    this.lastGrab = null; this.lastShape = null;
    this.r = game.scene ? new SeaRenderer(game.scene) : null;
  }

  // ---- the water, as the creatures know it ---------------------------------------------------------------------------
  waterAt(x, z, out = _w) { return this.g.waves ? this.g.waves.waveAt(x, z, this.g.waves.t, out) : (out.kind = null, out.depth = 0, out.h = 0, out); }
  depth(x, z) { return this.g.water?.depthAt(x, z, false, -Infinity) ?? 0; }
  surface(x, z) { return this.g.water?.surfaceAt?.(x, z, 0) ?? 0; }

  // Something happened in the water at (x, z). str ~1 is a normal event (a bleeding swimmer, a splash of a body going
  // in); the ranges a creature senses it at scale with sqrt(str).
  stimulus(x, z, kind, str = 1, src = null) {
    if (!(str > 0)) return;
    const s = this.stim[this.sNext]; this.sNext = (this.sNext + 1) % this.stim.length;
    s.x = x; s.z = z; s.kind = kind; s.str = str; s.t = this.t; s.src = src;
    s.life = kind === 'blood' ? SR.bloodLife : kind === 'engine' ? 1.6 : SR.splashLife;
    if (kind === 'blood' && this.g.waves) for (let i = 0; i < Math.min(4, 1 + str * 2); i++) this.g.waves.puff(x + (Math.random() - 0.5) * 1.5, z + (Math.random() - 0.5) * 1.5, this.surface(x, z), (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0.5 + str * 0.4, 0.35, 14 + str * 6, 0.65, 1);
  }
  // main.js noise(): a shot or a crash over the water carries into it.
  onNoise(x, z, r, src) {
    if (!this.enabled || !(r > 0)) return;
    if (this.depth(x, z) > 0.3 || this.depth(x + 6, z) > 0.3 || this.depth(x - 6, z) > 0.3 || this.depth(x, z + 6) > 0.3 || this.depth(x, z - 6) > 0.3) this.stimulus(x, z, 'shot', Math.min(2.5, (r / 40) * SR.shotHear), src);
  }

  // What creature `a` senses right now (the strongest stimulus by str / distance within its ranges, or someone it can
  // see in the water within `see`). Allocation-free: returns _sense or null.
  sense(a) {
    const S = a.S;
    let best = null, bw = 0;
    for (const s of this.stim) {
      if (!s.kind || this.t - s.t > s.life) continue;
      const range = (s.kind === 'blood' ? S.smell ?? 0 : (S.hear ?? 0) * (s.kind === 'engine' ? SR.engineHear : 1)) * Math.sqrt(s.str);
      const d = Math.hypot(s.x - a.x, s.z - a.z);
      if (d > range) continue;
      const w = (s.str * (s.kind === 'blood' ? 1.6 : 1)) / (4 + d);
      if (w > bw) { bw = w; best = s; }
    }
    // Sight: a person in the water (not on a deck, not in a boat) close enough to make out.
    let seen = null, sd = S.see ?? 0;
    const g = this.g;
    for (const c of this.inWater) { const d = Math.hypot(c.x - a.x, c.z - a.z); if (d < sd) { sd = d; seen = c; } }
    if (seen) { _sense.x = seen.x; _sense.z = seen.z; _sense.kind = 'sight'; _sense.who = seen; _sense.str = 1; _sense.d = sd; return _sense; }
    if (!best) return null;
    _sense.x = best.x; _sense.z = best.z; _sense.kind = best.kind; _sense.who = best.src && best.src.alive !== false ? best.src : null; _sense.str = best.str; _sense.d = Math.hypot(best.x - a.x, best.z - a.z);
    if (g) return _sense;
    return _sense;
  }

  // ---- the people in the water ---------------------------------------------------------------------------------------
  // Who is in the water near you this frame (alive, on foot, not on a deck): what a shark can see and strike, what bleeds
  // into the water and splashes it.
  scanPeople(dt) {
    const g = this.g, p = g.player, list = (this.inWater ??= []);
    list.length = 0;
    for (const c of g.chars) {
      if (c.inVehicle || c.onDeck || c.onTrain) continue;
      if (Math.abs(c.x - p.x) > 320 || Math.abs(c.z - p.z) > 320) continue;
      const d = this.depth(c.x, c.z);
      let w = this.watch.get(c);
      if (d < 0.35) { if (w) w.hp = c.hp; c.waveY = 0; continue; }
      c.waveY = this.g.waves ? this.g.waves.sheetAt(c.x, c.z) : 0; // a swimmer rides the swell as it is drawn (characters.js)
      if (!w) { w = { hp: c.hp, kickT: 0, bloodT: 0 }; this.watch.set(c, w); }
      if (c.alive) list.push(c);
      // Blood: every wound taken in the water; a body in it keeps bleeding a while.
      if (c.hp < w.hp - 0.5) { this.stimulus(c.x, c.z, 'blood', Math.min(3, 0.5 + (w.hp - c.hp) / 12), c); this.stats.senses.blood++; }
      w.hp = c.hp;
      if (!c.alive) { w.bloodT -= dt; if (w.bloodT <= 0) { w.bloodT = 6; this.stimulus(c.x, c.z, 'blood', 0.8, null); } continue; }
      // A swimmer kicking (moving, at the surface) splashes; faster splashes louder.
      const sp = c.speed ?? 0;
      w.kickT -= dt;
      if (sp > 1.2 && !c.underwater && w.kickT <= 0) { w.kickT = SR.kickEvery; this.stimulus(c.x, c.z, 'kick', Math.min(1.6, 0.35 + sp * 0.15), c); }
    }
    if (this.watch.size > 200) for (const c of this.watch.keys()) if (!g.chars.includes(c)) this.watch.delete(c);
    // Engines under way.
    this.engT = (this.engT ?? 0) - dt;
    if (this.engT <= 0) {
      this.engT = 1;
      for (const v of g.vehicles) if (v.boat && !v.dead && Math.abs(v.x - p.x) < 400 && Math.abs(v.z - p.z) < 400) { const sp = Math.hypot(v.vx, v.vz); if (sp > 2 && (v.depth ?? 0) > 0.3) this.stimulus(v.x, v.z, 'engine', Math.min(2, sp / 16), v); }
    }
  }

  // ---- making and putting away ---------------------------------------------------------------------------------------
  spawn(sp, x, z, o = {}) {
    const S = SEALIFE[sp];
    if (!S) return null;
    const a = { id: `sl${++this.seq}`, sp, S, form: S.form, x, z, h: o.h ?? Math.random() * TAU, v: 0, y: (S.depth?.[0] ?? 1), state: 'cruise', t: 0,
      hp: S.hp ?? Infinity, maxHp: S.hp ?? Infinity, home: { x: o.hx ?? x, z: o.hz ?? z, r: o.r ?? 80 }, place: o.place ?? null,
      tx: x, tz: z, target: null, mem: { x, z, kind: null, t: -1e9 }, laps: 0, ang: 0, rad: 0, biteCd: 0, dead: false, deadT: 0, born: this.t, wanderT: 0,
      rise: 0, arms: 0, grab: null, armDmg: 0, hurtFire: 0, awayT: 0, sinceSense: 0, alphaLog: 0 };
    if (S.form === 'school') { a.m = Array.from({ length: S.count }, (_, i) => ({ ox: (Math.random() - 0.5) * S.spread * 2, oz: (Math.random() - 0.5) * S.spread * 2, ph: i * 0.7, vx: 0, vz: 0, y: S.depth[0] + Math.random() * (S.depth[1] - S.depth[0]) })); a.y = S.depth[0]; }
    if (S.form === 'gulls') { a.b = Array.from({ length: S.count }, (_, i) => ({ ph: (i / S.count) * TAU, r: S.radius * (0.6 + Math.random() * 0.6), alt: S.alt[0] + Math.random() * (S.alt[1] - S.alt[0]), sp: 0.5 + Math.random() * 0.4 })); a.over = o.over ?? null; a.y = 0; }
    if (S.form === 'leviathan') { a.state = 'patrol'; a.y = S.depth[0]; a.armA = Array.from({ length: S.arms }, (_, i) => ({ ang: (i / S.arms) * TAU + 0.2, up: 0, hp: S.armHp, ph: i * 1.3 })); }
    this.live.push(a);
    this.stats.spawned++;
    this.g.emit?.('sealifeSpawn', { id: a.id, species: sp, x: Math.round(x), z: Math.round(z), state: a.state });
    return a;
  }
  remove(a) {
    const i = this.live.indexOf(a);
    if (i >= 0) this.live.splice(i, 1);
    if (a.grab) this.release(a, 'gone');
    this.stats.despawned++;
  }
  clear() { for (const a of [...this.live]) this.remove(a); for (const s of this.stim) s.kind = null; }
  // Out of the camera's view (with the director's pad): the only place a creature may appear or be put away.
  inView(x, z, pad = SR.spawnPad) {
    const c = this.g.camLook ?? this.g.player, r = (this.g.viewR ?? 30) * 1.8 + pad;
    return Math.abs(x - c.x) < r && Math.abs(z - c.z) < r;
  }

  // The director: keeps each species near you at its density over the water it lives in, spawning only out of view.
  direct() {
    const g = this.g, p = g.player;
    const ox = p.inVehicle?.x ?? p.x, oz = p.inVehicle?.z ?? p.z;
    for (const a of [...this.live]) {
      if (a.form === 'leviathan') continue; // its water keeps it (systems/waterplace.js)
      if (Math.hypot(a.x - ox, a.z - oz) > SR.despawn && !this.inView(a.x, a.z, 0)) this.remove(a);
      else if (a.dead && a.deadT > 40 && !this.inView(a.x, a.z, 0)) this.remove(a);
    }
    if (!this.spawning) return;
    for (const [sp, S] of Object.entries(SEALIFE)) {
      if (!(S.perKm2 > 0)) continue;
      // The water near you it could live in: a 9 x 9 sample over the spawn ring's square.
      const F = SR.spawnFar, step = (F * 2) / 8, ok = [];
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
        const x = ox - F + i * step, z = oz - F + j * step, w = this.waterAt(x, z);
        if (w.kind && S.waters.includes(w.kind) && w.depth >= S.minDepth) ok.push(x, z);
      }
      const km2 = (ok.length / 2 / 81) * ((F * 2) ** 2) / 1e6;
      const want = Math.min(S.max, Math.round(S.perKm2 * km2 + (km2 > 0 ? 0.35 : 0)));
      const have = this.live.filter((a) => a.sp === sp && !a.dead).length;
      for (let n = have; n < want; n++) {
        let placed = false;
        for (let k = 0; k < 12 && !placed; k++) {
          const i = Math.floor(Math.random() * (ok.length / 2)) * 2, x = ok[i] + (Math.random() - 0.5) * step, z = ok[i + 1] + (Math.random() - 0.5) * step;
          if (this.inView(x, z) || Math.hypot(x - ox, z - oz) > F + 20) continue;
          const w = this.waterAt(x, z);
          if (!w.kind || !S.waters.includes(w.kind) || w.depth < S.minDepth) continue;
          const a = this.spawn(sp, x, z, { hx: x, hz: z, r: 120 });
          if (a && S.form === 'school' && Math.random() < 0.5 && w.kind !== 'lake') this.spawn('gulls', x, z, { over: a });
          placed = true;
        }
      }
    }
  }

  // ---- the frame -------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.enabled) { this.r?.sync(this, dt, true); return; }
    this.t += dt;
    this.scanPeople(dt);
    this.tickT -= dt;
    if (this.tickT <= 0) { this.tickT = SR.tick; this.direct(); this.g.waterplace?.leviathans(this); }
    for (const a of [...this.live]) {
      if (a.form === 'shark') this.brainShark(a, dt);
      else if (a.form === 'leviathan') this.brainDeep(a, dt);
      else if (a.form === 'school') this.brainSchool(a, dt);
      else if (a.form === 'gulls') this.brainGulls(a, dt);
    }
    this.r?.sync(this, dt);
  }

  // Swim toward (tx, tz) at speed sp, turning at `turn` rad/s; never into water shallower than its minDepth (it turns
  // along the edge instead: shallow water is where you are safe).
  steer(a, tx, tz, sp, dt, turn = 2.4) {
    const want = Math.atan2(tx - a.x, tz - a.z);
    a.h += Math.max(-turn * dt, Math.min(turn * dt, angTo(a.h, want)));
    a.v += (sp - a.v) * Math.min(1, dt * 2.5);
    const nx = a.x + Math.sin(a.h) * a.v * dt, nz = a.z + Math.cos(a.h) * a.v * dt;
    const ahead = this.depth(a.x + Math.sin(a.h) * 3, a.z + Math.cos(a.h) * 3);
    if (ahead < a.S.minDepth) { a.h += turn * dt * 1.5 * (a.side ??= Math.random() < 0.5 ? -1 : 1); a.v *= Math.exp(-dt * 3); a.blocked = (a.blocked ?? 0) + dt; return false; }
    a.blocked = 0;
    a.x = nx; a.z = nz;
    if (a.form !== 'leviathan' && a.v > 1.4 && a.y < 0.55 && this.g.waves) this.g.waves.trail(a, a.x, a.z, Math.sin(a.h) * a.v, Math.cos(a.h) * a.v, a.h, a.S.len * 0.5, 0.5, dt, 'swim', this.surface(a.x, a.z));
    return true;
  }
  wander(a, dt, sp) {
    a.wanderT -= dt;
    if (a.wanderT <= 0 || Math.hypot(a.tx - a.x, a.tz - a.z) < 4 || (a.blocked ?? 0) > 1.5) {
      a.wanderT = 8 + Math.random() * 10;
      for (let k = 0; k < 6; k++) { const an = Math.random() * TAU, r = Math.random() * a.home.r, x = a.home.x + Math.sin(an) * r, z = a.home.z + Math.cos(an) * r; if (this.depth(x, z) >= a.S.minDepth) { a.tx = x; a.tz = z; break; } }
    }
    this.steer(a, a.tx, a.tz, sp, dt, 1.2);
  }
  // A person it is after is still fair game: alive, in water deep enough for it, not up on a deck or in a boat.
  inReach(a, c) { return c && c.alive && !c.inVehicle && !c.onDeck && this.depth(c.x, c.z) >= a.S.minDepth * 0.75; }

  brainShark(a, dt) {
    const S = a.S;
    if (a.dead) { a.deadT += dt; a.y = Math.min(0.9, 0.05 + a.deadT * 0.02); return; }
    a.biteCd -= dt; a.t += dt;
    const s = a.state === 'flee' ? null : this.sense(a);
    if (s) { a.mem.x = s.x; a.mem.z = s.z; a.mem.kind = s.kind; a.mem.t = this.t; if (s.who && s.who.alive !== undefined && this.inReach(a, s.who)) a.target = s.who; }
    const dy = (want) => { a.y += (want - a.y) * Math.min(1, dt * 1.2); };
    switch (a.state) {
      case 'cruise': {
        dy(S.depth[0]);
        this.wander(a, dt, S.cruise);
        if (s) this.setState(a, s.kind === 'sight' ? 'circle' : 'investigate', s.kind);
        break;
      }
      case 'investigate': {
        dy(0.7);
        this.steer(a, a.mem.x, a.mem.z, S.swim, dt);
        if (a.target && this.inReach(a, a.target) && Math.hypot(a.target.x - a.x, a.target.z - a.z) < S.see * 1.6) this.setState(a, 'circle', 'close');
        else if (Math.hypot(a.mem.x - a.x, a.mem.z - a.z) < 4) this.setState(a, 'search');
        break;
      }
      case 'search': {
        dy(S.depth[0]);
        a.ang += dt * 0.6;
        this.steer(a, a.mem.x + Math.sin(a.ang) * 9, a.mem.z + Math.cos(a.ang) * 9, S.cruise * 1.3, dt);
        if (a.target && this.inReach(a, a.target) && Math.hypot(a.target.x - a.x, a.target.z - a.z) < S.see * 1.6) this.setState(a, 'circle', 'found');
        else if (this.t - a.mem.t > S.search) { a.target = null; this.setState(a, 'cruise'); }
        else if (s && Math.hypot(s.x - a.x, s.z - a.z) > 8) this.setState(a, 'investigate', s.kind);
        break;
      }
      case 'circle': {
        dy(S.depth[0]); // fin up: you see it coming round
        const c = a.target;
        if (!this.inReach(a, c)) { a.target = null; this.setState(a, 'search'); break; }
        const [laps, r0, r1] = S.circle;
        const k = clamp01(a.laps / laps), r = r0 + (r1 - r0) * k;
        a.ang += (S.swim / Math.max(2, r)) * dt; a.laps += (S.swim / Math.max(2, r)) * dt / TAU;
        this.steer(a, c.x + Math.sin(a.ang) * r, c.z + Math.cos(a.ang) * r, S.swim, dt, 3.2);
        if (a.laps >= laps && a.biteCd <= 0) this.setState(a, 'strike');
        break;
      }
      case 'strike': {
        dy(0.55);
        const c = a.target;
        if (!this.inReach(a, c)) { a.target = null; this.setState(a, 'search'); break; }
        this.steer(a, c.x, c.z, S.strike, dt, 4.5);
        if (Math.hypot(c.x - a.x, c.z - a.z) < 1.5 && a.biteCd <= 0) {
          a.biteCd = S.biteCd;
          const k = Math.hypot(c.x - a.x, c.z - a.z) || 1;
          this.g.combat.damage(c, S.bite, null, (c.x - a.x) / k, (c.z - a.z) / k, 'bite');
          this.stimulus(c.x, c.z, 'blood', 1.4, c);
          this.g.waves?.splash(c.x, c.z, 0.9, this.surface(c.x, c.z));
          this.stats.bites++;
          this.g.emit?.('sharkBite', { id: a.id, target: c.id, dmg: S.bite, hp: Math.round(c.hp) });
          if (c === this.g.player) this.g.hud?.toast?.('SHARK - GET OUT OF THE WATER', 'hot');
          a.laps = S.circle[0] - 1; // back off one lap, come round again
          this.setState(a, 'circle', 'bit');
        } else if (a.t > 4) { a.laps = S.circle[0] - 1; this.setState(a, 'circle', 'missed'); }
        break;
      }
      case 'flee': {
        dy(S.depth[1]);
        this.steer(a, a.x + Math.sin(a.fleeH) * 50, a.z + Math.cos(a.fleeH) * 50, S.swim, dt, 1.5);
        if (a.t > 30 && !this.inView(a.x, a.z, 0)) this.remove(a);
        break;
      }
    }
  }
  setState(a, st, why = null) {
    if (a.state === st) return;
    a.state = st; a.t = 0;
    if (st === 'circle' && why !== 'bit' && why !== 'missed') a.laps = 0;
    if (st === 'circle') a.ang = Math.atan2(a.x - (a.target?.x ?? a.x), a.z - (a.target?.z ?? a.z));
    if (st === 'investigate' || st === 'circle') { const k = a.mem.kind; if (k && this.stats.senses[k] !== undefined && why === k) this.stats.senses[k]++; }
    this.g.emit?.('sealifeState', { id: a.id, species: a.sp, state: st, why, x: Math.round(a.x), z: Math.round(a.z), mem: a.mem.kind });
  }

  // ---- THE DEEP ONE ----------------------------------------------------------------------------------------------------
  // patrol (deep, a slow loop) -> rise (it heard something in its water: it swims under it, rising, its shape growing)
  // -> reach (arms up through the surface) -> hold (a swimmer held and hurt, a small boat dragged and pulled under) ->
  // sink (back down). Out of its water (shallower than minDepth, or off its disc) it lets go and sinks. Fire and blasts
  // in reach hurt it; enough and it goes away for a while. Rounds into an arm make that arm let go.
  brainDeep(a, dt) {
    const S = a.S, P = a.place;
    a.t += dt;
    const dy = (want, k = 0.6) => { a.y += (want - a.y) * Math.min(1, dt * k); };
    const inWater = (x, z) => this.depth(x, z) >= S.minDepth && (!P || Math.hypot(x - P.x, z - P.z) < P.r + 30);
    if (a.state === 'away') {
      dy(9, 0.3); a.arms = Math.max(0, a.arms - dt);
      this.steer(a, P ? P.x + Math.sin(a.t * 0.05) * P.r * 0.8 : a.x, P ? P.z + Math.cos(a.t * 0.05) * P.r * 0.8 : a.z, S.cruise, dt, 0.4);
      if (a.t > S.away) this.deepState(a, 'patrol');
      return;
    }
    // Fire on the water over it, a blast in reach: it is hurt, and enough drives it off.
    const fires = this.g.throwables?.fires ?? [];
    for (const f of fires) if (Math.hypot(f.x - a.x, f.z - a.z) < S.reach + f.r && a.y < 5) { a.hurtFire += 22 * dt; }
    if (a.hurtFire >= S.driveOff) { this.driveOff(a, 'fire'); return; }
    const s = a.state === 'patrol' || a.state === 'rise' ? this.sense(a) : null;
    if (s && inWater(s.x, s.z)) { a.mem.x = s.x; a.mem.z = s.z; a.mem.kind = s.kind; a.mem.t = this.t; a.target = s.who && (s.who.alive !== undefined || s.who.boat) ? s.who : a.target; }
    const tgt = a.target, tx = tgt ? tgt.x : a.mem.x, tz = tgt ? tgt.z : a.mem.z;
    switch (a.state) {
      case 'patrol': {
        dy(S.depth[0], 0.3);
        a.arms = Math.max(0, a.arms - dt * 0.6);
        a.ang += dt * (S.cruise / Math.max(40, (P?.r ?? 200) * 0.5));
        this.steer(a, (P?.x ?? a.home.x) + Math.sin(a.ang) * (P?.r ?? 200) * 0.5, (P?.z ?? a.home.z) + Math.cos(a.ang) * (P?.r ?? 200) * 0.5, S.cruise, dt, 0.5);
        if (s && inWater(s.x, s.z)) this.deepState(a, 'rise', s.kind);
        break;
      }
      case 'rise': {
        // Under what it heard, coming up: the shape grows and darkens for `rise` seconds before an arm breaks water.
        dy(S.depth[1], 1 / Math.max(1, S.rise * 0.45));
        this.steer(a, tx, tz, S.swim, dt, 0.9);
        if (!inWater(tx, tz)) { this.deepState(a, 'sink', 'left its water'); break; }
        if (this.t - a.mem.t > 12) { this.deepState(a, 'sink', 'lost it'); break; }
        if (a.t >= S.rise && Math.hypot(tx - a.x, tz - a.z) < S.reach * 0.8) this.deepState(a, 'reach');
        break;
      }
      case 'reach': {
        dy(S.depth[1], 0.8);
        a.arms = Math.min(1, a.arms + dt * 0.9);
        this.steer(a, tx, tz, S.swim * 0.6, dt, 0.9);
        if (!tgt || !inWater(tx, tz)) { this.deepState(a, 'sink', tgt ? 'left its water' : 'nothing'); break; }
        const d = Math.hypot(tx - a.x, tz - a.z);
        const grabbable = tgt.boat ? S.boatMax.includes(tgt.type) || true : this.inReachDeep(tgt);
        if (a.arms >= 0.85 && d < S.reach && grabbable) this.grab(a, tgt);
        else if (a.t > 7) this.deepState(a, 'sink', 'missed');
        break;
      }
      case 'hold': {
        const G = a.grab;
        if (!G || !G.who || (G.who.alive === false) || G.who.dead) { this.release(a, 'gone'); this.deepState(a, 'sink', 'done'); break; }
        const w = G.who, wx = w.x, wz = w.z;
        if (!inWater(wx, wz)) { this.release(a, 'out of its water'); this.deepState(a, 'sink', 'left its water'); break; }
        G.t += dt;
        const k = Math.hypot(a.x - wx, a.z - wz) || 1;
        if (w.boat) {
          const small = S.boatMax.includes(w.type);
          // Hauled toward the body: the hull's own way is eaten; a big hull is only shaken.
          const pull = small ? S.drag : S.drag * 0.25;
          w.vx = w.vx * Math.exp(-dt * (small ? 2.5 : 0.6)) + ((a.x - wx) / k) * pull * dt * 8;
          w.vz = w.vz * Math.exp(-dt * (small ? 2.5 : 0.6)) + ((a.z - wz) / k) * pull * dt * 8;
          w.waveFelt = (w.waveFelt ?? 0) + 6;
          if (small && G.t > S.grabHold) { this.stats.drags++; this.g.emit?.('leviathanDrag', { id: a.id, vehicle: w.id, type: w.type }); this.g.vehiclesSys?.sink?.(w); this.release(a, 'dragged under'); this.deepState(a, 'sink', 'took it'); }
          else if (!small && G.t > S.grabHold) { this.release(a, 'too big'); this.deepState(a, 'sink', 'too big'); }
        } else {
          w.x += ((a.x - wx) / k) * S.drag * dt; w.z += ((a.z - wz) / k) * S.drag * dt;
          w.speed = 0;
          this.g.combat.damage(w, S.grab * dt, null, 0, 0, 'drown');
          if (w.breath !== undefined) w.breath = Math.max(0, w.breath - dt / 8);
          if (G.t > S.grabHold) { this.release(a, 'let go'); this.deepState(a, 'sink', 'let go'); }
        }
        break;
      }
      case 'sink': {
        dy(S.depth[0], 0.4);
        a.arms = Math.max(0, a.arms - dt * 0.8);
        this.steer(a, P?.x ?? a.home.x, P?.z ?? a.home.z, S.cruise, dt, 0.5);
        if (a.t > 10 && a.arms <= 0) { a.target = null; this.deepState(a, 'patrol'); }
        break;
      }
    }
  }
  inReachDeep(c) { return c && c.alive && !c.inVehicle && !c.onDeck && this.depth(c.x, c.z) > 1.0; }
  deepState(a, st, why = null) {
    if (a.state === st) return;
    a.state = st; a.t = 0;
    if (st === 'rise') { a.riseFrom = this.t; this.stats.senses[a.mem.kind] = (this.stats.senses[a.mem.kind] ?? 0) + 1; }
    this.g.emit?.('leviathanState', { id: a.id, state: st, why, depth: +a.y.toFixed(1), x: Math.round(a.x), z: Math.round(a.z) });
  }
  grab(a, who) {
    a.grab = { who, t: 0 };
    if (!who.boat) who.heldBy = a;
    a.state = 'hold'; a.t = 0;
    // What it looked like before it reached: how long the shape had been rising under its quarry, how dark it was.
    this.lastGrab = { id: a.id, who: who.id, boat: !!who.boat, type: who.type ?? null, riseSecs: +(this.t - (a.riseFrom ?? this.t)).toFixed(2), shapeAlpha: +(a.alphaLog ?? 0).toFixed(3), depth: +a.y.toFixed(2), t: +this.t.toFixed(2) };
    this.stats.grabs++;
    this.g.emit?.('leviathanGrab', this.lastGrab);
    if (who === this.g.player || who.driver === this.g.player || who.occ?.includes?.(this.g.player)) this.g.hud?.toast?.('SOMETHING HAS YOU - SHOOT THE ARM, BURN IT, GET TO SHALLOW WATER', 'hot');
  }
  release(a, why) {
    const G = a.grab;
    if (G?.who && G.who.heldBy === a) G.who.heldBy = null;
    a.grab = null;
    this.g.emit?.('leviathanRelease', { id: a.id, why });
  }
  driveOff(a, cause) {
    if (a.grab) this.release(a, cause);
    a.hurtFire = 0; a.target = null;
    this.stats.drivenOff++;
    this.deepState(a, 'away', cause);
    this.g.emit?.('leviathanDrivenOff', { id: a.id, cause });
  }
  // A blast (systems/throwables.js): sharks in it are hurt; the deep one's arms and body take it toward driving it off.
  blast(x, z, r, dmg, by) {
    for (const a of this.live) {
      const d = Math.hypot(a.x - x, a.z - z);
      if (a.form === 'leviathan') { if (a.state !== 'away' && d < r + a.S.reach && a.y < 7) { a.hurtFire += dmg * 1.2 * (1 - Math.min(1, Math.max(0, d - a.S.reach) / r)); if (a.hurtFire >= a.S.driveOff) this.driveOff(a, 'blast'); } continue; }
      if (a.form === 'school' && d < r * 3) { a.scatterT = 3; a.sx = x; a.sz = z; continue; }
      if (a.form === 'shark' && d < r) this.hurt(a, dmg * (1 - d / r) * Math.exp(-0.5 * a.y), by, 0, 0, 'blast');
    }
  }

  // ---- fish and gulls ----------------------------------------------------------------------------------------------------
  brainSchool(a, dt) {
    const S = a.S, g = this.g;
    a.scatterT = Math.max(0, (a.scatterT ?? 0) - dt);
    // Anything moving close: a swimmer, a hull, a shark. They see it and go.
    if (!a.scatterT) {
      let thr = null;
      for (const c of this.inWater) if (Math.hypot(c.x - a.x, c.z - a.z) < S.scatter && (c.speed ?? 0) > 0.6) thr = c;
      for (const v of g.vehicles) if (v.boat && Math.hypot(v.x - a.x, v.z - a.z) < S.scatter + v.len * 0.5 && Math.hypot(v.vx, v.vz) > 1) thr = v;
      for (const o of this.live) if (o.form === 'shark' && !o.dead && Math.hypot(o.x - a.x, o.z - a.z) < S.scatter) thr = o;
      if (thr) { a.scatterT = 2.5; a.sx = thr.x; a.sz = thr.z; this.stats.scatters++; g.emit?.('schoolScatter', { id: a.id, by: thr.id ?? null }); }
    }
    if (a.scatterT) { const an = Math.atan2(a.x - a.sx, a.z - a.sz); this.steer(a, a.x + Math.sin(an) * 20, a.z + Math.cos(an) * 20, S.swim * 0.6, dt, 4); }
    else this.wander(a, dt, S.cruise);
    for (const m of a.m) {
      m.ph += dt * (a.scatterT ? 6 : 1.4);
      const spread = a.scatterT ? S.spread * (1 + (2.5 - a.scatterT) * 1.5) : S.spread;
      const lx = Math.sin(m.ph * 0.7 + m.oz) * spread * 0.5 + m.ox * (spread / S.spread) * 0.6, lz = Math.cos(m.ph * 0.6 + m.ox) * spread * 0.5 + m.oz * (spread / S.spread) * 0.6;
      m.vx = lx; m.vz = lz;
    }
  }
  brainGulls(a, dt) {
    const o = a.over, g = this.g;
    if (!o || !this.live.includes(o)) { a.leave = true; }
    if (!a.leave) { a.x += ((o.x - a.x)) * Math.min(1, dt * 0.5); a.z += ((o.z - a.z)) * Math.min(1, dt * 0.5); }
    // Someone close flushes them.
    const p = g.player;
    if (!a.leave && Math.hypot(p.x - a.x, p.z - a.z) < 6) { a.leave = true; g.emit?.('gullsFlush', { id: a.id }); }
    if (a.leave) { a.x += Math.sin(a.h) * 9 * dt; a.z += Math.cos(a.h) * 9 * dt; a.y += dt * 2; if (!this.inView(a.x, a.z, 0)) this.remove(a); }
    for (const b of a.b) b.ph += dt * b.sp * (a.leave ? 0.2 : 1);
  }

  // ---- rounds into the water -------------------------------------------------------------------------------------------
  // systems/combat.js: a shark near the surface (its fin, its back) takes a round; deeper the water stops it. An arm of
  // the deep one up through the surface takes one too (and lets go). Returns HIT or null.
  raycast(ox, oz, dx, dz, maxT) {
    let bt = maxT, best = null, arm = -1;
    for (const a of this.live) {
      if (a.form === 'shark') {
        if (a.dead || a.y > 1.6) continue;
        const t = rayCircle(ox, oz, dx, dz, a.x, a.z, 0.55, bt);
        if (t >= 0.3 && t < bt) { bt = t; best = a; arm = -1; }
      } else if (a.form === 'leviathan' && a.arms > 0.3) {
        for (let i = 0; i < a.armA.length; i++) {
          const A = a.armA[i];
          if (A.hp <= 0 || A.up < 0.3) continue;
          const t = rayCircle(ox, oz, dx, dz, A.tx ?? a.x, A.tz ?? a.z, 0.6, bt);
          if (t >= 0.3 && t < bt) { bt = t; best = a; arm = i; }
        }
      }
    }
    if (!best) return null;
    HIT.t = bt; HIT.a = best; HIT.arm = arm;
    return HIT;
  }
  hurt(a, dmg, by = null, dx = 0, dz = 0, cause = 'bullet', arm = -1) {
    if (!a || a.dead || !(dmg > 0)) return;
    const g = this.g;
    if (a.form === 'leviathan') {
      if (a.S.onlyBy.includes(cause)) { a.hurtFire += dmg; if (a.hurtFire >= a.S.driveOff) this.driveOff(a, cause); return; }
      const A = a.armA[arm >= 0 ? arm : 0];
      A.hp -= dmg; A.flinch = 1;
      g.fx?.bloodSpray?.(A.tx ?? a.x, 0.6, A.tz ?? a.z, dx, dz, 3, 0.4);
      if (A.hp <= 0 && a.grab) { this.release(a, 'arm shot'); this.deepState(a, 'sink', 'arm shot'); A.hp = a.S.armHp; this.g.emit?.('leviathanArmShot', { id: a.id, arm }); }
      return;
    }
    const k = cause === 'bullet' ? Math.exp(-(a.S.bulletDepthK ?? 1.4) * Math.max(0, a.y - 0.2)) : 1;
    a.hp -= dmg * k;
    this.stimulus(a.x, a.z, 'blood', 1.2, null);
    g.fx?.bloodSpray?.(a.x, 0.2, a.z, dx, dz, 3, 0.35);
    if (by === g.player) g.emit?.('sealifeHit', { id: a.id, species: a.sp, dmg: Math.round(dmg * k), hp: Math.max(0, Math.round(a.hp)), depth: +a.y.toFixed(2) });
    if (a.hp <= 0) { a.dead = true; a.deadT = 0; a.state = 'dead'; this.stats.kills++; g.emit?.('sealifeKilled', { id: a.id, species: a.sp, cause }); this.g.waves?.splash(a.x, a.z, 1.0, this.surface(a.x, a.z)); return; }
    if (a.hp / a.maxHp < a.S.flee) { a.fleeH = Math.atan2(a.x - (by?.x ?? a.x - dx), a.z - (by?.z ?? a.z - dz)); this.setState(a, 'flee', 'hurt'); }
    else if (by && this.inReach(a, by)) { a.target = by; a.laps = a.S.circle[0]; this.setState(a, 'strike', 'hurt'); }
  }

  // ---- what the creature looks like from above (for the renderer and the agent) ------------------------------------
  // Silhouette alpha and blur for a shape at depth y (VIS rows): what you can see of it through the water.
  shapeOf(kind, y) { const V = VIS[kind]; return { a: V[0] * Math.exp(-Math.max(0, y) / V[1]), blur: Math.max(0, y) * V[2] }; }
  view(a) {
    const kind = a.form === 'leviathan' ? 'leviathan' : a.form === 'school' ? 'fish' : 'shark';
    const sh = this.shapeOf(kind, a.y);
    return { id: a.id, species: a.sp, form: a.form, state: a.state, x: +a.x.toFixed(1), z: +a.z.toFixed(1), depth: +a.y.toFixed(2), speed: +a.v.toFixed(1), hp: Number.isFinite(a.hp) ? Math.round(a.hp) : null,
      finUp: a.form === 'shark' && !a.dead && a.y < 0.55, shape: { alpha: +sh.a.toFixed(3), blur: +sh.blur.toFixed(2) }, dead: !!a.dead,
      target: a.target?.id ?? null, sensed: a.mem.kind, sensedAgo: a.mem.t > -1e8 ? +(this.t - a.mem.t).toFixed(1) : null, arms: a.arms ? +a.arms.toFixed(2) : undefined, grab: a.grab ? a.grab.who.id : undefined };
  }
  summary() { return { enabled: this.enabled, live: this.live.length, bySpecies: this.live.reduce((o, a) => ((o[a.sp] = (o[a.sp] ?? 0) + 1), o), {}), stats: this.stats, lastGrab: this.lastGrab }; }
}

// ---- drawing -------------------------------------------------------------------------------------------------------------
// The four shapes, white on clear, nose at the top of each 256 px cell (a silhouette's yaw = heading + pi).
function shapeAtlas() {
  const W = 1024, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineCap = 'round'; x.lineJoin = 'round';
  // shark: a torpedo, pectoral fins swept back, a forked tail
  x.save(); x.translate(128, 128);
  x.beginPath(); x.ellipse(0, -8, 22, 78, 0, 0, TAU); x.fill();
  x.beginPath(); x.moveTo(-14, -30); x.lineTo(-62, 8); x.lineTo(-12, -6); x.fill();
  x.beginPath(); x.moveTo(14, -30); x.lineTo(62, 8); x.lineTo(12, -6); x.fill();
  x.beginPath(); x.moveTo(-6, 60); x.lineTo(-30, 104); x.lineTo(0, 84); x.lineTo(26, 108); x.lineTo(6, 60); x.fill();
  x.restore();
  // the deep one: a mantle and eight arms trailing and curling
  x.save(); x.translate(384, 78); x.scale(0.62, 0.62); // padded: a heavy blur never meets the cell's edge
  x.beginPath(); x.ellipse(0, 0, 44, 60, 0, 0, TAU); x.fill();
  for (let i = 0; i < 8; i++) {
    const s = i < 4 ? -1 : 1, k = (i % 4) / 3, a0 = s * (0.35 + k * 0.9);
    x.lineWidth = 16 - k * 4;
    x.beginPath(); x.moveTo(Math.sin(a0) * 30, 30 + Math.cos(a0) * 10);
    const ex = s * (20 + k * 70), ey = 150 - k * 30;
    x.bezierCurveTo(s * (10 + k * 50), 70, ex - s * 30, 110, ex, ey);
    x.stroke();
    x.lineWidth = 5; x.beginPath(); x.moveTo(ex, ey); x.quadraticCurveTo(ex + s * 14, ey + 14, ex + s * 4, ey + 24); x.stroke();
  }
  x.restore();
  // a fish
  x.save(); x.translate(640, 128);
  x.beginPath(); x.ellipse(0, -10, 20, 64, 0, 0, TAU); x.fill();
  x.beginPath(); x.moveTo(0, 46); x.lineTo(-26, 92); x.lineTo(26, 92); x.fill();
  x.restore();
  // a swimmer (a person seen from above, arms out)
  x.save(); x.translate(896, 128);
  x.beginPath(); x.ellipse(0, -62, 18, 20, 0, 0, TAU); x.fill();
  x.beginPath(); x.ellipse(0, -6, 26, 46, 0, 0, TAU); x.fill();
  x.lineWidth = 14; x.beginPath(); x.moveTo(-20, -30); x.lineTo(-62, -70); x.moveTo(20, -30); x.lineTo(62, -70); x.stroke();
  x.beginPath(); x.moveTo(-10, 36); x.lineTo(-22, 100); x.moveTo(10, 36); x.lineTo(24, 100); x.stroke();
  x.restore();
  const t = new THREE.CanvasTexture(cv);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 1;
  return t;
}
function finGeo() {
  // A dorsal fin: a swept triangle with thickness (local +z forward, standing up from y 0).
  const g = new THREE.BufferGeometry();
  const P = [0, 0, 0.35, 0, 0, -0.35, -0.02, 0.62, -0.32, 0.06, 0, 0, -0.06, 0, 0];
  const v = new Float32Array([
    0.04, 0, 0.32, 0.04, 0, -0.3, 0, 0.6, -0.36,
    -0.04, 0, -0.3, -0.04, 0, 0.32, 0, 0.6, -0.36,
    0.04, 0, 0.32, 0, 0.6, -0.36, -0.04, 0, 0.32,
  ]);
  void P;
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

class SeaRenderer {
  constructor(scene) {
    const atlas = shapeAtlas();
    this.silU = { uMap: { value: atlas }, uCol: { value: new THREE.Color('#041311') } };
    const silMat = new THREE.ShaderMaterial({
      uniforms: this.silU, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vI;
        void main() {
          #ifdef USE_INSTANCING_COLOR
          vI = instanceColor;
          #else
          vI = vec3(1.0, 0.0, 0.0);
          #endif
          vUv = vec2((floor(vI.b * 4.0 + 0.5) + uv.x) / 4.0, uv.y);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform vec3 uCol;
        varying vec2 vUv; varying vec3 vI;
        void main() {
          float a = texture(uMap, vUv, vI.g * 4.5).a * vI.r;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uCol, a);
        }`,
    });
    const mk = (geo, mat, n, order, shadow = false) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.visible = false; m.frustumCulled = false; m.renderOrder = order; m.castShadow = shadow;
      scene.add(m); return m;
    };
    this.sil = mk(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), silMat, MAXSIL, 2);
    this.sil.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXSIL * 3), 3); this.sil.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.sil.name = 'sealife:silhouettes';
    this.fin = mk(finGeo(), new THREE.MeshStandardMaterial({ color: SEALIFE.shark.colour.fin, roughness: 0.55, side: THREE.DoubleSide }), MAXFIN, 4, true);
    this.fin.name = 'sealife:fins';
    const armG = new THREE.CylinderGeometry(0.3, 0.52, 1, 8, 1).translate(0, 0.5, 0);
    this.arm = mk(armG, new THREE.MeshStandardMaterial({ color: SEALIFE.leviathan.colour.arm, roughness: 0.42, metalness: 0.05 }), MAXARM, 4, true);
    this.arm.name = 'sealife:arms';
    this.gull = mk(new THREE.BoxGeometry(1, 0.08, 0.32), new THREE.MeshStandardMaterial({ color: SEALIFE.gulls.colour.body, roughness: 0.8 }), MAXGULL * 3, 5, true);
    this.gull.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXGULL * 3 * 3), 3);
    this.gull.name = 'sealife:gulls';
    this.cWing = new THREE.Color(SEALIFE.gulls.colour.wing); this.cBody = new THREE.Color(SEALIFE.gulls.colour.body);
    this.counts = { sil: 0, fin: 0, arm: 0, gull: 0 };
  }
  // One silhouette: kind, at (x, z) facing h, len metres, depth y.
  silhouette(sys, kind, x, z, h, len, y, aMul = 1) {
    const i = this.ns; if (i >= MAXSIL) return 0;
    const V = sys.shapeOf(kind, y), a = V.a * aMul;
    if (a < 0.02) return 0;
    const g = sys.g, s0 = g.water?.surfaceAt?.(x, z, 0) ?? 0;
    const W = sys.g.waves, wy = W ? W.sheetAt(x, z) : 0;
    const grow = 1 + Math.max(0, y) * 0.05;
    const big = kind === 'leviathan' ? 1.55 : 1; // the deep one's shape is drawn small in its cell (padding for the blur)
    const wid = (kind === 'leviathan' ? len * 0.9 : kind === 'swimmer' ? len * 0.9 : len * 0.6) * big; len *= big;
    _p.set(x, s0 + wy + 0.05, z);
    _q.setFromEuler(_e.set(0, h + Math.PI, 0));
    _s.set(wid * grow, 1, len * grow);
    _m.compose(_p, _q, _s);
    this.sil.setMatrixAt(i, _m);
    this.sil.instanceColor.setXYZ(i, a, V.blur, CELL[kind] / 4);
    this.ns++;
    return a;
  }
  sync(sys, dt, off = false) {
    this.ns = 0; let nf = 0, na = 0, ng = 0;
    const g = sys.g;
    if (!off) {
      for (const a of sys.live) {
        if (a.form === 'shark') {
          const al = this.silhouette(sys, 'shark', a.x, a.z, a.h + Math.sin(sys.t * 3 + a.x) * 0.08, a.S.len, a.y, a.dead ? 0.7 : 1);
          a.alphaLog = al;
          if (!a.dead && a.y < 0.55 && nf < MAXFIN) {
            const s0 = g.water?.surfaceAt?.(a.x, a.z, 0) ?? 0, w = g.waves ? g.waves.sheetAt(a.x, a.z) : 0;
            _p.set(a.x + Math.sin(a.h) * a.S.len * 0.08, s0 + w - 0.12 + (0.55 - a.y) * 0.9, a.z + Math.cos(a.h) * a.S.len * 0.08);
            _q.setFromEuler(_e.set(0, a.h, 0)); const k = a.S.len / 2.9; _s.set(k, k, k);
            _m.compose(_p, _q, _s); this.fin.setMatrixAt(nf++, _m);
          }
        } else if (a.form === 'school') {
          for (const m of a.m) if (this.ns < MAXSIL) this.silhouette(sys, 'fish', a.x + m.vx, a.z + m.vz, a.h + Math.sin(m.ph) * 0.3, a.S.len, m.y, 1);
        } else if (a.form === 'leviathan') {
          a.alphaLog = this.silhouette(sys, 'leviathan', a.x, a.z, a.h, a.S.len, a.y, 1);
          if (a.arms > 0.02) na = this.arms(sys, a, na);
        } else if (a.form === 'gulls') {
          for (const b of a.b) {
            if (ng + 3 > MAXGULL * 3) break;
            const gx = a.x + Math.sin(b.ph) * b.r, gz = a.z + Math.cos(b.ph) * b.r, gy = b.alt + a.y, hh = b.ph + Math.PI / 2, flap = Math.sin(sys.t * 9 + b.r * 3) * 0.5;
            _q.setFromEuler(_e.set(0, hh, 0)); _s.set(0.18, 0.12, 0.42); _p.set(gx, gy, gz); _m.compose(_p, _q, _s); this.gull.setMatrixAt(ng, _m); this.gull.setColorAt(ng++, this.cBody);
            for (const sd of [-1, 1]) {
              _q.setFromEuler(_e.set(0, hh, sd * flap, 'YXZ')); _s.set(0.55, 1, 0.9);
              _p.set(gx + Math.cos(hh) * sd * 0.3, gy, gz - Math.sin(hh) * sd * 0.3); _m.compose(_p, _q, _s); this.gull.setMatrixAt(ng, _m); this.gull.setColorAt(ng++, this.cWing);
            }
          }
        }
      }
      // A diver: you see them go dark (characters.js sinks their body under the sheet).
      for (const c of sys.inWater ?? []) if (c.underwater && this.ns < MAXSIL) this.silhouette(sys, 'swimmer', c.x, c.z, c.face ?? 0, 1.8, c.diveD ?? 0.8, 1);
    }
    const fin = (m, n) => { m.count = n; m.visible = n > 0; if (n) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } };
    fin(this.sil, this.ns); fin(this.fin, nf); fin(this.arm, na); fin(this.gull, ng);
    this.counts.sil = this.ns; this.counts.fin = nf; this.counts.arm = na; this.counts.gull = ng;
  }
  // The deep one's arms: each a chain of tapered segments from under the body up through the surface toward its quarry
  // (or swaying over it), swinging, curling at the tip.
  arms(sys, a, n) {
    const S = a.S, g = sys.g, t = sys.t, tgt = a.grab?.who ?? a.target;
    const s0 = g.water?.surfaceAt?.(a.x, a.z, 0) ?? 0;
    const SEG = 8;
    for (let i = 0; i < a.armA.length; i++) {
      const A = a.armA[i];
      A.flinch = Math.max(0, (A.flinch ?? 0) - 1 / 60);
      const up = a.arms * (0.75 + 0.25 * Math.sin(t * 1.3 + A.ph)) * (1 - (A.flinch ?? 0) * 0.6);
      A.up = up;
      // The base under the mantle's rim; the tip at the quarry (held: wrapped round it), else swaying round it.
      const ba = A.ang + a.h, bx = a.x + Math.sin(ba) * S.len * 0.12, bz = a.z + Math.cos(ba) * S.len * 0.12, by = s0 - Math.min(a.y, 3) ;
      const held = !!a.grab, hx = tgt ? tgt.x : a.x, hz = tgt ? tgt.z : a.z;
      const sway = held ? 0.9 : 2.6 + Math.sin(t * 0.9 + A.ph) * 1.4;
      const tx = hx + Math.sin(ba + t * 0.4) * sway, tz = hz + Math.cos(ba + t * 0.4) * sway, ty = s0 + up * (held ? 1.6 : 3.2 + Math.sin(t * 1.7 + A.ph) * 0.8);
      A.tx = tx; A.tz = tz;
      let px = bx, py = by, pz = bz;
      for (let k = 1; k <= SEG && n < MAXARM; k++) {
        const u = k / SEG, curl = Math.sin(u * Math.PI) * 2.2;
        const qx = bx + (tx - bx) * u + Math.sin(ba + 1.6) * curl, qz = bz + (tz - bz) * u + Math.cos(ba + 1.6) * curl, qy = by + (ty - by) * Math.sin(u * Math.PI * 0.5) + (u > 0.85 ? Math.sin(t * 3 + A.ph) * 0.3 : 0);
        const dx = qx - px, dy = qy - py, dz = qz - pz, L = Math.hypot(dx, dy, dz) || 0.01;
        _p.set(px, py, pz);
        _q.setFromUnitVectors(_up, _s.set(dx / L, dy / L, dz / L));
        const th = 1.15 - u * 0.75;
        _s.set(th, L, th);
        _m.compose(_p, _q, _s); this.arm.setMatrixAt(n++, _m);
        px = qx; py = qy; pz = qz;
      }
    }
    return n;
  }
}
const _up = new THREE.Vector3(0, 1, 0);
