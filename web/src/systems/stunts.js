import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RAMPS, PROPS, JUMPS, SITES, STUNT } from '../data/stunts.js';
import { radialGlow } from '../world/textures.js';
import { makeRng } from '../engine/rng.js';
import { HALF as WORLD_HALF } from '../world/city.js';
import { K } from './chronicle.js';

// Jumps (docs/design/WEB_JUMPS.md). The world is flat except where a ramp row (data/stunts.js) says otherwise. A
// vehicle rides that ground on its springs; it flies when the ground falls away faster than gravity and the springs
// can follow. Takeoff is physics, not a trigger volume: a berm crawled over is a bump, the same berm at 90 km/h is air.
// Per vehicle per frame, after drive() and collide() have moved it across the map (step):
//   on the ground - a spring-damper holds the body on the surface (implicit damping: stable at any frame time),
//                   climbing costs speed and rolling down gives it back, the body pitches and rolls to the slope;
//   in the air    - ballistic; a car's nose follows its arc, a rider throws a bike's or quad's nose with gas/brake;
//   landing       - the closing speed INTO the surface decides it: soaked, hard (it costs the car), or a crash.
// Off the ramps, which is nearly everywhere, a vehicle costs one array lookup.

const CELL = 16, HALF = 464, N = Math.ceil((HALF * 2) / CELL);
const TABLE_A = 0.3;   // fraction of a table's length that is slope, at each end
const SHOULDER = 0.6;  // dirt keeps its full height out to 60% of the half-width, then slumps to nothing at the edge
const MAX_SHADOWS = 24;
// Springs per kind of machine: k stiffness (1/s²), c damping (1/s), travel = how far the wheels hang below the body
// before they leave the ground, bump = how far the body can sink into its springs before it hits the stops.
const SUSPENSION = {
  car: { k: 420, c: 26, travel: 0.22, bump: 0.18 },
  rig: { k: 380, c: 30, travel: 0.18, bump: 0.14 },
  buggy: { k: 210, c: 17, travel: 0.36, bump: 0.26 }, // long-travel desert springs
  quad: { k: 230, c: 18, travel: 0.3, bump: 0.22 },
  bike: { k: 175, c: 15, travel: 0.33, bump: 0.24 },
};
const springsOf = (v) => SUSPENSION[v.springs ?? (v.bike ? 'bike' : v.quad ? 'quad' : v.type === 'buggy' ? 'buggy' : v.type === 'rig' ? 'rig' : 'car')]; // a row may name its springs

// Height fraction along a ramp (s: 0 at the foot/back .. 1 at the lip/front) and across it (u: -1..1), and slopes.
// A kicker's `curve` (0 straight .. 1 all bowl, default 0.65) sets how much the slope steepens toward its lip.
function prof(r, s) {
  if (r.kind === 'kicker') { const c = r.curve ?? 0.65; return (1 - c) * s + c * s * s; }
  if (r.kind === 'berm') { // crest at c: skew > 0 makes a long windward back and a short, steep slip face in front
    const c = 0.5 + (r.skew ?? 0);
    return s < c ? 0.5 - 0.5 * Math.cos((Math.PI * s) / c) : 0.5 - 0.5 * Math.cos((Math.PI * (1 - s)) / (1 - c));
  }
  return s < TABLE_A ? 0.5 - 0.5 * Math.cos((Math.PI * s) / TABLE_A) : s > 1 - TABLE_A ? 0.5 - 0.5 * Math.cos((Math.PI * (1 - s)) / TABLE_A) : 1;
}
function dprof(r, s) {
  if (r.kind === 'kicker') { const c = r.curve ?? 0.65; return 1 - c + 2 * c * s; }
  if (r.kind === 'berm') {
    const c = 0.5 + (r.skew ?? 0);
    return s < c ? ((0.5 * Math.PI) / c) * Math.sin((Math.PI * s) / c) : ((-0.5 * Math.PI) / (1 - c)) * Math.sin((Math.PI * (1 - s)) / (1 - c));
  }
  const k = (0.5 * Math.PI) / TABLE_A;
  return s < TABLE_A ? k * Math.sin((Math.PI * s) / TABLE_A) : s > 1 - TABLE_A ? -k * Math.sin((Math.PI * (1 - s)) / TABLE_A) : 0;
}
function side(kind, u) {
  if (kind === 'kicker') return 1;
  const a = Math.abs(u);
  return a < SHOULDER ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (a - SHOULDER)) / (1 - SHOULDER));
}
function dside(kind, u) {
  if (kind === 'kicker') return 0;
  const a = Math.abs(u);
  return a < SHOULDER ? 0 : ((-0.5 * Math.PI) / (1 - SHOULDER)) * Math.sin((Math.PI * (a - SHOULDER)) / (1 - SHOULDER)) * Math.sign(u);
}

const spoken = (s) => s.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase()); // 'WRECK ROW' -> 'Wreck Row', for the radio
const _sl = { gx: 0, gz: 0 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _c = new THREE.Color();

export class Stunts {
  constructor(game) {
    this.g = game;
    this.ramps = []; this.byId = {};
    this.cells = new Array(N * N).fill(null);
    this.hitRamp = null; this.hitS = 0; this.hitU = 0;
    this.ext = null; // the streamed world's relief (world/streamer.js sets it): ramps and bridges past the island
    for (const row of RAMPS) this.add(row);
    this.jumps = JUMPS;
    this.fromRamp = Object.fromEntries(JUMPS.map((j) => [j.from, j]));
    this.records = { air: 0, dist: 0, height: 0 };
    this.cleared = {}; // jump id -> { n, day, best }
    this.count = 0; this.last = null; this.warnings = [];
    this.sites = SITES;
    this.build(game.scene, game.statics);
    this.initShadows(game.scene);
    this.drawOnMinimap(game.world.minimap);
  }

  // The map shows them: steel decks as dark bars, dirt as a darker smudge of sand (qol.js labels the sites).
  drawOnMinimap(canvas) {
    const g = canvas.getContext('2d'), k = canvas.width / (WORLD_HALF * 2);
    for (const r of this.ramps) {
      g.save();
      g.translate((r.x + WORLD_HALF) * k, (r.z + WORLD_HALF) * k);
      g.rotate(-r.h);
      if (r.kind === 'kicker') { g.fillStyle = '#2e2a26'; g.fillRect((-r.wid / 2) * k, (-r.len / 2) * k, r.wid * k, r.len * k); }
      else { g.fillStyle = 'rgba(92,64,40,0.55)'; g.beginPath(); g.ellipse(0, 0, (r.wid / 2) * k, (r.len / 2) * k, 0, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
  }

  ci(v) { const c = Math.floor((v + HALF) / CELL); return c < 0 ? 0 : c >= N ? N - 1 : c; }

  add(row) {
    const fx = Math.sin(row.h), fz = Math.cos(row.h);
    const r = { ...row, fx, fz, rx: fz, rz: -fx, hl: row.len / 2, hw: row.wid / 2, square: Math.abs(Math.sin(2 * row.h)) < 1e-6 };
    const ex = Math.abs(fx) * r.hl + Math.abs(fz) * r.hw, ez = Math.abs(fz) * r.hl + Math.abs(fx) * r.hw;
    for (let cx = this.ci(r.x - ex); cx <= this.ci(r.x + ex); cx++)
      for (let cz = this.ci(r.z - ez); cz <= this.ci(r.z + ez); cz++) (this.cells[cz * N + cx] ??= []).push(r);
    this.ramps.push(r); this.byId[r.id] = r;
    return r;
  }

  // Past the island (|x| or |z| >= 464) the streamed world answers: exit ramps, their fills and the bridge decks
  // (world/worldindex.js heightAt). y is how high the asker stands now: a deck counts only for someone already up on it,
  // so traffic passes under a bridge while the cross road goes over.
  outside(x, z) { return x >= HALF || x < -HALF || z >= HALF || z < -HALF; }

  // Ground height at (x, z), and which ramp made it (hitRamp, hitS, hitU) - or 0 and null on the open ground.
  heightAt(x, z, y = 0) {
    this.hitRamp = null;
    if (this.ext && this.outside(x, z)) return this.ext.heightAt(x, z, y);
    const list = this.cells[this.ci(z) * N + this.ci(x)];
    if (!list) return 0;
    let best = 0;
    for (let i = 0; i < list.length; i++) {
      const r = list[i], dx = x - r.x, dz = z - r.z;
      const along = dx * r.fx + dz * r.fz, across = dx * r.rx + dz * r.rz;
      if (along <= -r.hl || along >= r.hl || across <= -r.hw || across >= r.hw) continue;
      const s = (along + r.hl) / r.len, u = across / r.hw, h = r.rise * prof(r, s) * side(r.kind, u);
      if (h > best) { best = h; this.hitRamp = r; this.hitS = s; this.hitU = u; }
    }
    return best;
  }

  // Height plus the exact slope (out.gx, out.gz: rise per metre east and south). Analytic, so a kicker's lip
  // doesn't smear into a cliff the way a finite difference across it would.
  surface(x, z, out, y = 0) {
    if (this.ext && this.outside(x, z)) {
      // Streamed relief is smooth (fills and ramps), so central differences give its slope.
      const E = this.ext, h = E.heightAt(x, z, y), e = 0.6;
      this.hitRamp = null;
      if (h <= 0 && !E.nearRelief(x, z)) { out.gx = 0; out.gz = 0; return 0; }
      out.gx = (E.heightAt(x + e, z, y) - E.heightAt(x - e, z, y)) / (2 * e);
      out.gz = (E.heightAt(x, z + e, y) - E.heightAt(x, z - e, y)) / (2 * e);
      return h;
    }
    const h = this.heightAt(x, z), r = this.hitRamp;
    if (!r) { out.gx = 0; out.gz = 0; return 0; }
    const s = this.hitS, u = this.hitU;
    const ds = (r.rise * dprof(r, s) * side(r.kind, u)) / r.len, du = (r.rise * prof(r, s) * dside(r.kind, u)) / r.hw;
    out.gx = ds * r.fx + du * r.rx; out.gz = ds * r.fz + du * r.rz;
    return h;
  }

  // ---- vehicles -----------------------------------------------------------------------------------------------
  step(v, dt) {
    if (v.boat || v.sunk) return;
    const near = this.outside(v.x, v.z) ? (this.ext ? this.ext.nearRelief(v.x, v.z) : null) : this.cells[this.ci(v.z) * N + this.ci(v.x)];
    if (!near && !v.air) {
      // The open ground: settle onto it (a car coming off the edge of a site lands here first) and stop paying.
      if (v.y === 0 && v.vy === 0) { this.level(v, dt); return; }
      if (Math.abs(v.y) < 0.004 && Math.abs(v.vy) < 0.06) { v.y = 0; v.vy = 0; v.gy = 0; this.level(v, dt); return; }
    }
    const S = STUNT, G = S.gravity, sp = springsOf(v);
    const gh = this.surface(v.x, v.z, _sl, v.y), ramp = this.hitRamp, rs = this.hitS;
    const vg = _sl.gx * v.vx + _sl.gz * v.vz; // how fast the ground under the car is rising
    // A ledge taller than a tyre climbs, met on the ground: it's a wall (kickers are boxed in; this catches the rest).
    if (!v.air && gh - v.y > S.step + sp.bump) {
      v.x -= v.vx * dt; v.z -= v.vz * dt; v.vx *= -0.25; v.vz *= -0.25;
      this.g.vehiclesSys.damage(v, 4, null);
      return;
    }
    v.vy -= G * dt;
    const wasAir = v.air;
    if (v.y - gh < sp.travel) {
      // Wheels on the ground: spring + damper toward riding height. The damper is implicit, so a long frame can't
      // blow it up; the ground only ever pushes.
      const vyC = (v.vy + (sp.k * (gh + G / sp.k - v.y) + sp.c * vg) * dt) / (1 + sp.c * dt);
      if (vyC > v.vy) v.vy = vyC;
    }
    v.y += v.vy * dt;
    const vyIn = v.vy; // the landing is judged on the speed it came down at, before the stops take it
    if (v.y < gh - sp.bump) { v.y = gh - sp.bump; if (v.vy < vg) v.vy = vg; } // on the bump stops
    v.gy = gh;
    const off = v.y - gh > sp.travel;
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    if (!wasAir && off) this.takeoff(v);
    else if (wasAir && !off) this.land(v, gh, fx, fz, vyIn);
    if (v.air) { this.fly(v, dt, gh); return; }
    // On the ground: remember the ramp (the takeoff needs to know what threw it), pay for the hill, sit on the slope.
    v.ramp = ramp; v.rampS = rs;
    const up = _sl.gx * fx + _sl.gz * fz, left = _sl.gx * fz - _sl.gz * fx;
    if (up) { const a = ((G * up) / Math.sqrt(1 + up * up)) * dt; v.vx -= fx * a; v.vz -= fz * a; }
    const k = Math.min(1, dt * 14);
    v.pitch += (Math.atan(up) - v.pitch) * k;
    v.roll += (Math.atan(left) - v.roll) * k;
  }

  level(v, dt) {
    v.ramp = null;
    if (!v.pitch && !v.roll) return;
    const k = Math.min(1, dt * 14);
    v.pitch -= v.pitch * k; v.roll -= v.roll * k;
    if (Math.abs(v.pitch) < 1e-4) v.pitch = 0;
    if (Math.abs(v.roll) < 1e-4) v.roll = 0;
  }

  takeoff(v) {
    v.air = true; v.airT = 0;
    v.toX = v.x; v.toZ = v.z; v.peak = 0; v.toRamp = v.ramp; v.toRampS = v.rampS;
    v.toSpeed = Math.hypot(v.vx, v.vz); v.toVy = v.vy;
    v.pitchV = 0; v.airHit = 0; // the hardest wall the car meets in flight (vehicles.js collide)
    if (v.bike) { v.pitch += v.wheelie; v.wheelie = 0; } // a wheelie off the lip is just more nose up
  }

  fly(v, dt, gh) {
    v.airT += dt;
    if (v.y - gh > v.peak) v.peak = v.y - gh;
    const u = Math.hypot(v.vx, v.vz);
    if ((v.bike || v.quad) && v.driver && !v.fallen) {
      // A bike drifts nose-down along its arc on its own, more slowly than a car; the rider adds to it: gas spins
      // the rear wheel up and lifts the front, the brake stops the wheel and drops the nose. Do nothing and you land
      // rough; ride it and you land clean; fight it and you go over the bars.
      v.pitchV += (v.throttle * STUNT.airPitch - v.pitchV * 1.5) * dt;
      v.pitch += ((Math.atan2(v.vy, Math.max(4, u)) * 0.75 - v.pitch) * 1.1 + v.pitchV) * dt;
      v.pitch = Math.max(-1.2, Math.min(1.2, v.pitch));
    } else {
      // A car is a brick: its nose drifts down the arc it is flying.
      v.pitch += (Math.atan2(v.vy, Math.max(4, u)) * 0.75 - v.pitch) * Math.min(1, dt * 1.8);
    }
    v.roll *= Math.exp(-dt * 0.8);
  }

  // Touchdown. vn = closing speed into the surface (m/s); miss = how far the nose is off the slope (radians). Hitting
  // something on the way down (a wreck, a landing deck's face) makes it a crash whatever the touchdown was like.
  land(v, gh, fx, fz, vyIn = v.vy) {
    const g = this.g;
    v.air = false;
    const L = Math.sqrt(1 + _sl.gx * _sl.gx + _sl.gz * _sl.gz);
    const vn = Math.max(0, (_sl.gx * v.vx + _sl.gz * v.vz - vyIn) / L);
    const miss = Math.abs(v.pitch - Math.atan(_sl.gx * fx + _sl.gz * fz));
    const S = STUNT, bikeLike = v.bike || v.quad;
    const crash = vn > S.crashVn || (v.airHit ?? 0) > 6 || (v.bike && (vn > S.bikeVn || miss > S.bikeMiss)) || (v.quad && miss > 1.0) || (!bikeLike && miss > 0.9 && vn > S.cleanVn);
    const grade = crash ? 'crash' : vn < S.cleanVn && miss < 0.35 ? 'clean' : vn < S.hardVn && miss < 0.6 ? 'rough' : 'hard';
    // The hit scrubs speed; a rough one more than a clean one.
    const keep = 1 - Math.min(0.5, Math.max(0, vn - 2) * 0.03 + miss * 0.22);
    v.vx *= keep; v.vz *= keep;
    // Damage: past the hard line, the frame and the end that hit first pay. Bikes and quads throw their riders.
    if (vn > S.hardVn || crash) {
      const hurt = (Math.max(0, vn - S.hardVn) ** 2 * 2.2 + (miss > 0.5 ? miss * Math.hypot(v.vx, v.vz) * 0.9 : 0)) / Math.max(0.4, Math.sqrt(v.mass));
      if (hurt > 0.5) g.vehiclesSys.damage(v, hurt, null);
      if (v.dmg) {
        const end = v.pitch < -0.15 ? 1 : v.pitch > 0.15 ? -1 : 0;
        g.vehDamage.hit(v, v.x + fx * end * v.len * 0.45, v.z + fz * end * v.len * 0.45, vn + miss * 6, 'crash');
      }
    }
    if (crash && v.bike && v.occ?.some(Boolean)) { v.fallen = true; g.seats.ejectAll(v, 1.4); }
    if (crash && v.quad && v.occ?.some(Boolean)) g.seats.ejectAll(v, 1.2);
    // What it looks and sounds like.
    const dust = Math.min(14, 3 + vn * 1.4);
    for (let k = 0; k < dust; k++) {
      const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * v.wid * 0.6;
      g.fx.spawn(2, v.x + Math.cos(a) * r, gh + 0.25, v.z + Math.sin(a) * r, Math.cos(a) * (1 + vn * 0.35), 0.6 + Math.random() * 1.4, Math.sin(a) * (1 + vn * 0.35), 0.9 + Math.random() * 0.6, 0.55 + vn * 0.06, '#b89870', -0.5);
    }
    if (vn > S.hardVn) g.fx.sparks(v.x, gh + 0.2, v.z, -fx, -fz, Math.round(vn));
    const mine = v.driver === g.player;
    if (mine || Math.hypot(v.x - g.player.x, v.z - g.player.z) < 60) g.audio.land?.(Math.min(1, vn / 12));
    if (mine) g.hud.shake(Math.min(0.9, vn / 14));
    this.score(v, vn, miss, grade, gh);
  }

  // The jump as a result: the HUD calls it for the player, named jumps pay and get talked about, everyone's jumps
  // are events an agent can read.
  score(v, vn, miss, grade, gh) {
    const g = this.g, airT = v.airT ?? 0;
    if (airT < 0.25 && grade !== 'crash') return; // a hop, not a jump
    const dist = Math.hypot(v.x - v.toX, v.z - v.toZ), height = v.peak ?? 0;
    const J = v.toRamp ? this.fromRamp[v.toRamp.id] : null, from = J ? this.byId[J.from] : null;
    const landedOn = this.hitRamp;
    // Cleared: came down past the line (the landing deck's lip, the table's far slope) without crashing. Overshooting
    // the deck still clears it; the landing grade says what that cost.
    const along = from ? (v.x - from.x) * from.fx + (v.z - from.z) * from.fz : 0;
    const cleared = !!J && grade !== 'crash' && along >= J.clear;
    const mine = v.driver === g.player;
    const res = {
      vehicle: v.id, type: v.type, by: v.driver?.id ?? null, ramp: v.toRamp?.id ?? null, jump: J?.id ?? null, cleared,
      air: +airT.toFixed(2), dist: +dist.toFixed(1), height: +height.toFixed(2), vn: +vn.toFixed(2), miss: +miss.toFixed(2), landing: grade,
      takeoffSpeed: +(v.toSpeed ?? 0).toFixed(1), landedOn: landedOn?.id ?? null, pay: 0, record: false,
    };
    this.count++;
    if (mine) {
      const R = this.records;
      if (grade !== 'crash' && (airT > R.air || dist > R.dist)) { res.record = R.air > 0 || R.dist > 0; R.air = Math.max(R.air, airT); R.dist = Math.max(R.dist, dist); R.height = Math.max(R.height, height); }
      if (J) {
        const day = g.society?.day ?? 0, c = (this.cleared[J.id] ??= { n: 0, day: -1, best: 0 });
        if (cleared) {
          const fresh = c.day !== day;
          res.pay = c.n === 0 ? J.first : fresh ? J.again : 0;
          c.n++; c.day = day; c.best = Math.max(c.best, dist);
          if (res.pay) g.give({ cash: res.pay });
          // A feat: the legend keeps it if anyone saw it, so the radio can tell it. A clean one is told bigger.
          if (fresh) g.society?.deeds?.record('stunt', { x: v.x, z: v.z, m: grade === 'clean' ? 1.5 : 1, src: 'stunt', label: spoken(J.name), flags: K.feat });
          g.hud.toast(`${J.name} CLEARED · ${dist.toFixed(0)} M · ${grade.toUpperCase()}${res.pay ? ` · +$${res.pay}` : ''}`, 'job');
        } else g.hud.toast(`${J.name} · ${grade === 'crash' ? 'WIPED OUT' : J.land === J.from && landedOn?.id === J.land ? 'CASED IT' : 'SHORT'}`, 'warn');
      } else if (airT >= STUNT.showAir) g.hud.toast(`AIR ${airT.toFixed(1)} S · ${dist.toFixed(0)} M · ${grade === 'crash' ? 'WIPED OUT' : grade.toUpperCase()}${res.record ? ' · BEST YET' : ''}`, grade === 'crash' ? 'warn' : 'info');
    }
    this.last = res;
    g.emit('jump', res);
  }

  // Lip to lip: how far a named jump asks you to fly.
  gapOf(J) {
    const a = this.byId[J.from], b = this.byId[J.land];
    if (!a || !b || a === b) return 0;
    return Math.hypot(b.x + b.fx * b.hl - (a.x + a.fx * a.hl), b.z + b.fz * b.hl - (a.z + a.fz * a.hl));
  }

  // ---- after vehicles have moved: blob shadows under anything off the ground -----------------------------------
  update() {
    const gm = this.g.world.groundMat; // the dirt stays the floor's colour in rain and shine
    this.dirtMat.color.copy(gm.color); this.dirtMat.roughness = gm.roughness;
    let n = 0;
    for (const v of this.g.vehicles) {
      if (!v.air || v.dead || n >= MAX_SHADOWS) continue;
      const gh = v.gy ?? 0, alt = Math.max(0, v.y - gh);
      _p.set(v.x, gh + 0.05, v.z);
      _q.setFromEuler(_e.set(0, v.h, 0));
      _s.set(v.wid * (1.25 + alt * 0.06), 1, v.len * (1.1 + alt * 0.05));
      this.shadows.setMatrixAt(n, _m.compose(_p, _q, _s));
      this.shadows.setColorAt(n++, _c.setScalar(Math.max(0.15, 0.7 / (1 + alt * 0.35))));
    }
    this.shadows.count = n;
    this.shadows.visible = n > 0; // no jumpers, no draw call
    if (n) { this.shadows.instanceMatrix.needsUpdate = true; this.shadows.instanceColor.needsUpdate = true; }
  }

  initShadows(scene) {
    const mat = new THREE.MeshBasicMaterial({ map: radialGlow(), color: '#000000', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    // Instance colour is the blob's strength: alpha *= r. (Black stays black.)
    // (Instance colours reach the fragment shader as USE_COLOR / vColor; USE_INSTANCING_COLOR is vertex-only.)
    mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n#ifdef USE_COLOR\n  diffuseColor.a *= vColor.r;\n#endif'); };
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(geo, mat, MAX_SHADOWS);
    this.shadows.setColorAt(0, _c.setScalar(1));
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shadows.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.shadows.count = 0; this.shadows.visible = false; this.shadows.frustumCulled = false; this.shadows.renderOrder = 2;
    scene.add(this.shadows);
  }

  // ---- build: one steel mesh, one dirt mesh and one letters mesh per site; solid parts into the static world ----
  build(scene, statics) {
    // Dirt wears the desert floor's own texture and mapping, tinted per vertex (packed, tyre-worn, wind-polished); it
    // follows the floor's wet/dry state every frame (update), so a dune darkens in the rain like the ground around it.
    this.dirtMat = this.g.world.groundMat.clone();
    this.dirtMat.vertexColors = true;
    const steelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.32 });
    this.meshes = [];
    for (const site of Object.keys(SITES)) {
      const rng = makeRng(site.length * 977 + 13);
      const steel = [], dirt = [], letters = [];
      for (const r of this.ramps) {
        if (r.site !== site) continue;
        if (r.kind === 'kicker') {
          this.kickerGeo(r, steel, rng);
          if (r.square) this.kickerSolids(r, statics);
          else this.warnings.push(`kicker ${r.id} is not square to the map: no solid sides`);
        } else dirt.push(this.dirtGeo(r, SITES[site].worn));
      }
      for (const p of PROPS) {
        if (p.site !== site) continue;
        if (p.kind === 'wreck') this.wreckGeo(p, steel, statics, rng);
        else if (p.kind === 'bleachers') this.bleacherGeo(p, steel, statics, rng);
        else if (p.kind === 'letters') letters.push(p);
      }
      const add = (geos, mat, opts = {}) => {
        if (!geos.length) return;
        const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
        mesh.castShadow = opts.cast ?? true; mesh.receiveShadow = true; mesh.name = `stunts:${site}:${opts.tag}`;
        scene.add(mesh); this.meshes.push(mesh);
      };
      add(steel, steelMat, { tag: 'steel' });
      add(dirt, this.dirtMat, { tag: 'dirt' });
      if (letters.length) { const mat = this.lettersMat(letters, rng); add([this.lettersGeo(letters)], mat, { tag: 'letters', cast: false }); } // the atlas lays out the UVs first
    }
  }

  // A steel kicker: deck plates following the concave curve, worn tyre tracks, a bright lip, guard rails, legs and
  // cross braces under it, and a plate across the lip face. Built in the ramp's frame, then placed.
  kickerGeo(r, out, rng) {
    const parts = [], segs = 9, L = r.len, W = r.wid;
    const deck = '#4e4239', rust = '#6b4a32', track = '#2b2723', rail = '#3a3430', leg = '#2f2b28', lip = '#9a9288';
    const hAt = (s) => r.rise * prof(r, s), zAt = (s) => s * L - L / 2;
    for (let i = 0; i < segs; i++) {
      const s0 = i / segs, s1 = (i + 1) / segs, y0 = hAt(s0), y1 = hAt(s1), z0 = zAt(s0), z1 = zAt(s1);
      const len = Math.hypot(z1 - z0, y1 - y0), ang = Math.atan2(y1 - y0, z1 - z0), ym = (y0 + y1) / 2, zm = (z0 + z1) / 2;
      const plate = (x, w, t, col, lift) => parts.push(box(w, t, len + 0.02, col).rotateX(-ang).translate(x, ym - t / 2 + lift, zm));
      plate(0, W, 0.08, rng() < 0.35 ? rust : deck, 0);
      for (const sx of [-1, 1]) plate(sx * W * 0.2, 0.55, 0.012, track, 0.006); // where every tyre has run
      for (const sx of [-1, 1]) plate(sx * (W / 2 - 0.06), 0.12, 0.28, rail, 0.28); // guard rails
    }
    parts.push(box(W, 0.06, 0.18, lip).translate(0, r.rise - 0.02, L / 2 - 0.09));
    parts.push(box(W, r.rise - 0.04, 0.06, leg).translate(0, (r.rise - 0.04) / 2, L / 2 - 0.03)); // the lip face
    for (const s of [0.4, 0.7, 1]) {
      const y = hAt(s) - 0.06;
      if (y < 0.15) continue;
      for (const sx of [-1, 1]) parts.push(box(0.14, y, 0.14, leg).translate(sx * (W / 2 - 0.12), y / 2, zAt(s) - (s === 1 ? 0.12 : 0)));
      parts.push(box(W - 0.3, 0.1, 0.1, leg).translate(0, y * 0.45, zAt(s) - (s === 1 ? 0.12 : 0)));
    }
    for (const sx of [-1, 1]) { // a diagonal brace each side
      const a = [sx * (W / 2 - 0.12), 0.1, zAt(0.4)], b = [sx * (W / 2 - 0.12), hAt(1) - 0.2, zAt(1) - 0.12];
      parts.push(bar(a, b, 0.09, leg));
    }
    out.push(this.place(mergeGeometries(parts), r.x, r.z, r.h));
  }

  // Solid sides and lip for a square kicker: what a car meets coming at the ramp from outside, and what stops people
  // walking through its frame. They belong to the ramp (box.owner), so the car riding its deck or flying off it
  // ignores them (vehicles.js collide). The side rails start where the deck is taller than a tyre climbs; a car that
  // comes in low over the lip face (short of a landing deck) still has to be above most of it.
  kickerSolids(r, statics) {
    const c = r.curve ?? 0.65, k = STUNT.step / r.rise; // where the deck first stands taller than a tyre climbs
    const s0 = c > 1e-3 ? (-(1 - c) + Math.sqrt((1 - c) ** 2 + 4 * c * k)) / (2 * c) : k, a0 = s0 * r.len - r.hl;
    this.solid(statics, r, r.hl, r.hl + 0.35, -r.hw - 0.15, r.hw + 0.15, r.rise - 0.3);  // the lip face
    this.solid(statics, r, a0, r.hl, r.hw, r.hw + 0.3, r.rise - 0.15);                    // left side
    this.solid(statics, r, a0, r.hl, -r.hw - 0.3, -r.hw, r.rise - 0.15);                  // right side
  }

  // A box given in a ramp's frame (along a0..a1, across c0..c1), added to the static world as its AABB.
  solid(statics, r, a0, a1, c0, c1, height) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const a of [a0, a1]) for (const c of [c0, c1]) {
      const x = r.x + a * r.fx + c * r.rx, z = r.z + a * r.fz + c * r.rz;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    const b = statics.add(x0, z0, x1, z1, 'ramp', height);
    b.owner = r;
    return b;
  }

  // Dirt: a grid that follows the profile exactly, in the ground's own texture and UVs, so a dune is the desert floor
  // lifted, not a prop sat on it. Tinted where it stands up: packed and darker on a worked mound (two ruts where every
  // tyre has run), sun-bleached on a wild crest; the tint fades to nothing at the foot, so it meets the floor clean.
  dirtGeo(r, worn) {
    const na = r.kind === 'table' ? 40 : 28, nc = 16, pos = [], uv = [], col = [], idx = [];
    for (let i = 0; i <= na; i++) for (let j = 0; j <= nc; j++) {
      const s = i / na, u = (j / nc) * 2 - 1, along = s * r.len - r.hl, across = u * r.hw;
      const x = r.x + along * r.fx + across * r.rx, z = r.z + along * r.fz + across * r.rz;
      const k = prof(r, s) * side(r.kind, u); // 0 at the foot .. 1 on top
      pos.push(x, r.rise * k + 0.012, z);
      uv.push((x + 650) / 1300, (650 - z) / 1300); // the ground plane's mapping (city.js): same texture, same scale
      const t = Math.min(1, k * 2.2);
      let cr = 1, cg = 1, cb = 1;
      if (worn) {
        const rut = Math.max(0, 1 - Math.abs(Math.abs(u) - 0.24) / 0.09); // two tyre ruts down the middle
        const d = 1 - t * (0.12 + rut * 0.2);
        cr = d; cg = d * 0.95; cb = d * 0.9;
      } else { const b = 1 + t * k * 0.16; cr = b; cg = b * 0.99; cb = b * 0.94; } // wind-polished crests catch the light
      col.push(cr, cg, cb);
    }
    for (let i = 0; i < na; i++) for (let j = 0; j < nc; j++) {
      const a = i * (nc + 1) + j, b = a + nc + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1); // wound so the faces look up
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo.toNonIndexed();
  }

  // A dead car for the row: crushed flat by whatever drove over it at the last show. Long axis along p.h.
  wreckGeo(p, out, statics, rng) {
    const parts = [], body = p.paint ?? '#5a3a24';
    const dark = '#' + new THREE.Color(body).multiplyScalar(0.55).getHexString();
    parts.push(box(1.86, 0.62, 4.3, body).translate(0, 0.62, 0));
    parts.push(box(1.62, 0.34, 1.9, dark).translate(0, 1.1, -0.2)); // the cab, roof pushed down to the belt line
    parts.push(box(1.7, 0.05, 1.3, '#2a2622').translate(0, 0.95, 1.35)); // hood seam
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.26, 0.62, 0.62, '#151413').translate(sx * 0.86, 0.32, sz * 1.35));
    if (rng() < 0.6) parts.push(box(0.9, 0.04, 0.8, '#6b4a32').translate((rng() - 0.5) * 0.6, 0.95, -1.6 + rng() * 0.5)); // rust bloom
    out.push(this.place(mergeGeometries(parts), p.x, p.z, p.h));
    const along = Math.abs(Math.sin(p.h)) > 0.7;
    statics.addCentered(p.x, p.z, along ? 4.3 : 1.86, along ? 1.86 : 4.3, 'wreck', 1.4);
  }

  // Bleachers facing p.h: tiers of planks rising away from the field, a steel frame, a back rail.
  bleacherGeo(p, out, statics, rng) {
    const parts = [], L = p.len, D = p.depth, T = p.tiers, step = D / T, wood = ['#7d6a52', '#6e5c46', '#86725a'], frame = '#33302c';
    for (let t = 0; t < T; t++) {
      const y = 0.45 + t * 0.5, z = D / 2 - step * (t + 0.5); // the front tier is lowest
      parts.push(box(L, 0.07, step * 0.55, wood[t % 3]).translate(0, y, z - step * 0.1));
      parts.push(box(L, 0.05, step * 0.3, wood[(t + 1) % 3]).translate(0, y - 0.24, z + step * 0.3));
      for (let x = -L / 2 + 0.3; x <= L / 2 - 0.2; x += 4) parts.push(box(0.1, y, 0.1, frame).translate(x, y / 2, z));
    }
    const top = 0.45 + (T - 1) * 0.5;
    parts.push(box(L, 0.06, 0.06, frame).translate(0, top + 1, -D / 2 + 0.1));
    for (let x = -L / 2 + 0.3; x <= L / 2 - 0.2; x += 4) parts.push(box(0.07, 1, 0.07, frame).translate(x, top + 0.5, -D / 2 + 0.1));
    for (const sx of [-1, 1]) parts.push(bar([sx * (L / 2 - 0.05), 0.05, D / 2], [sx * (L / 2 - 0.05), top, -D / 2 + 0.2], 0.12, frame));
    // Missing planks: nobody has fixed anything here in years.
    for (let k = 0; k < 5; k++) { const t = Math.floor(rng() * T); parts.push(box(0.9, 0.08, step * 0.56, '#1f1c19').translate((rng() - 0.5) * (L - 2), 0.455 + t * 0.5, D / 2 - step * (t + 0.5) - step * 0.1)); }
    out.push(this.place(mergeGeometries(parts), p.x, p.z, p.h));
    const along = Math.abs(Math.sin(p.h)) > 0.7;
    statics.addCentered(p.x, p.z, along ? D : L, along ? L : D, 'bleachers', top + 0.3);
  }

  // Whitewashed stones laid out as letters, one atlas per site: each prop is a row of the canvas.
  lettersMat(props, rng) {
    const W = 1024, rowH = 150, c = document.createElement('canvas'), m = document.createElement('canvas');
    c.width = m.width = W; c.height = m.height = rowH * props.length;
    const g = c.getContext('2d'), mg = m.getContext('2d');
    mg.fillStyle = '#fff'; mg.textAlign = 'center'; mg.textBaseline = 'middle';
    props.forEach((p, i) => {
      mg.font = '900 112px "Arial Black", Impact, sans-serif';
      const w = mg.measureText(p.lines[0]).width;
      const k = Math.min(1, (W - 40) / w);
      mg.font = `900 ${Math.floor(112 * k)}px "Arial Black", Impact, sans-serif`;
      mg.fillText(p.lines[0], W / 2, rowH * (i + 0.5));
      p._uv = [0, 1 - (rowH * (i + 1)) / c.height, 1, 1 - (rowH * i) / c.height];
      p._aspect = rowH / W;
    });
    const mask = mg.getImageData(0, 0, W, c.height).data;
    const cell = 7;
    for (let y = 0; y < c.height; y += cell) for (let x = 0; x < W; x += cell) {
      const jx = x + rng() * cell * 0.6, jy = y + rng() * cell * 0.6;
      if (mask[(Math.floor(jy) * W + Math.floor(jx)) * 4 + 3] < 128) continue;
      const r = 2.4 + rng() * 1.8, sh = 200 + Math.floor(rng() * 40);
      g.fillStyle = 'rgba(40,28,18,0.55)'; g.beginPath(); g.ellipse(jx + 1.2, jy + 1.4, r, r * 0.8, rng() * 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgb(${sh + 18},${sh + 10},${sh - 8})`; g.beginPath(); g.ellipse(jx, jy, r, r * (0.7 + rng() * 0.3), rng() * 3, 0, Math.PI * 2); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 });
  }

  lettersGeo(props) {
    const geos = props.map((p) => {
      const g = new THREE.PlaneGeometry(p.w, p.w * p._aspect).rotateX(-Math.PI / 2);
      const uv = g.attributes.uv, [u0, v0, u1, v1] = p._uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
      g.rotateY(p.h ?? 0).translate(p.x, 0.03, p.z);
      return g.toNonIndexed();
    });
    return mergeGeometries(geos);
  }

  place(geo, x, z, h) { return geo.rotateY(h).translate(x, 0, z); }

  // ---- agent view ------------------------------------------------------------------------------------------
  view() {
    return {
      sites: Object.fromEntries(Object.entries(SITES).map(([k, s]) => [k, { name: s.name, x: s.x, z: s.z }])),
      ramps: this.ramps.map((r) => ({ id: r.id, site: r.site, kind: r.kind, x: r.x, z: r.z, heading: +r.h.toFixed(3), len: r.len, wid: r.wid, rise: r.rise })),
      jumps: this.jumps.map((j) => ({ id: j.id, name: j.name, from: j.from, land: j.land, gap: +this.gapOf(j).toFixed(1), first: j.first, again: j.again, cleared: this.cleared[j.id]?.n ?? 0 })),
      records: { ...this.records, air: +this.records.air.toFixed(2), dist: +this.records.dist.toFixed(1), height: +this.records.height.toFixed(2) },
      airborne: this.g.vehicles.filter((v) => v.air).map((v) => ({ id: v.id, y: +v.y.toFixed(2), air: +(v.airT ?? 0).toFixed(2) })),
      jumpsSeen: this.count, last: this.last, warnings: this.warnings,
    };
  }

  save() { return { records: this.records, cleared: this.cleared }; }
  load(s) { if (!s) return; this.records = { air: 0, dist: 0, height: 0, ...s.records }; this.cleared = { ...s.cleared }; }
}

// Vertex-coloured box (non-indexed, ready to merge).
function box(sx, sy, sz, color) {
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
  return paint(g, color);
}
function paint(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const _fwd = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3(), _bq = new THREE.Quaternion();
function bar(p0, p1, t, color) {
  _d.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const g = new THREE.BoxGeometry(t, t, _d.length()).toNonIndexed();
  g.applyQuaternion(_bq.setFromUnitVectors(_fwd, _d.normalize()));
  g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
  return paint(g, color);
}
