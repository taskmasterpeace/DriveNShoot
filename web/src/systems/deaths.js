import * as THREE from 'three';
import { DEATH_CLIPS, BACK_DOT, BLADES, RAGDOLL as RG, VEHICLE_TOP, HOOD, HEADSHOT, SEVER, LIMB_BITS, SEVERED, BLOOD_ROWS } from '../data/deaths.js';
import { UAL_CLIPS } from '../data/deathclips-ual.js';
import { HIT_ODDS } from '../data/gear.js';
import { RIG } from './characters.js';
import { DECAL_Y } from '../engine/depthlayers.js';

// THE DEATH LIBRARY at run time (docs/design/WEB_DEATHS.md; rows data/deaths.js). combat.kill hands every death here:
// pick() chooses the clip by cause, hit part and which way the round came; the clip plays as 12 world points that the
// shared pose solver draws (systems/characters.js ragPose); on its last frames a verlet ragdoll takes over, pulled toward
// the clip less and less, and settles on what is really under each point (the land, a floor, a stair, a vehicle's hood,
// roof or deck). Settled, it is frozen (riding the vehicle it lies on) and left to death rites. Nothing here allocates
// per frame: a death allocates its two point arrays once.
const NP = 12, FPS = 30, N3 = NP * 3;
const AIR_PTS = [0, 1, 4, 5, 6, 7];
const { HIP_X, THIGH, SHIN, WAIST_UP, SHOULDER_X, SHOULDER_UP, UPPER, FORE } = RIG;
const TORSO_L = WAIST_UP + SHOULDER_UP;
// links: [a, b, length]; the torso quad and its diagonals hold it square.
const DIAG = Math.hypot(HIP_X + SHOULDER_X, TORSO_L), SIDE_L = Math.hypot(SHOULDER_X - HIP_X, TORSO_L);
const LINKS = [
  [0, 1, HIP_X * 2], [6, 7, SHOULDER_X * 2], [0, 6, SIDE_L], [1, 7, SIDE_L], [0, 7, DIAG], [1, 6, DIAG],
  [0, 2, THIGH], [1, 3, THIGH], [2, 4, SHIN], [3, 5, SHIN], [6, 8, UPPER], [7, 9, UPPER], [8, 10, FORE], [9, 11, FORE],
  [0, 4, 0.35, 'min'], [1, 5, 0.35, 'min'], [6, 10, 0.2, 'min'], [7, 11, 0.2, 'min'], // a knee or an elbow never folds flat
];
const RAD = new Float32Array(NP).fill(RG.radius); for (const i of [0, 1, 6, 7]) RAD[i] = RG.radiusTorso;
const LIMB_PTS = { armL: [6, 10, 8], armR: [7, 11, 9], legL: [0, 4, 2], legR: [1, 5, 3] }; // root, end, middle
const smooth = (x) => x * x * (3 - 2 * x);

// ---- the clips: procedural keys -> 12 points per frame at 30 fps -----------------------------------------------------
const _a = new Float32Array(N3);
// One procedural pose (data/deaths.js key fields) into out at o (body-local, the lowest point at its radius).
export function procPose(k, out, o = 0) {
  const P = _a;
  const set = (i, x, y, z) => { P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; };
  for (let s = 0; s < 2; s++) {
    const sx = s ? -1 : 1, f = k.flex[s], a = f - k.bend[s];
    const hx = sx * HIP_X, kx = hx, ky = -Math.cos(f) * THIGH, kz = Math.sin(f) * THIGH;
    set(s, hx, 0, 0); set(2 + s, kx, ky, kz); set(4 + s, kx, ky - Math.cos(a) * SHIN, kz + Math.sin(a) * SHIN);
  }
  const cl = Math.cos(k.lean), sl = Math.sin(k.lean), sy = TORSO_L * cl, sz = TORSO_L * sl;
  for (let s = 0; s < 2; s++) {
    const sx = s ? -1 : 1, [ap, as, af] = k.arm[s];
    const shx = sx * SHOULDER_X;
    set(6 + s, shx, sy, sz);
    // the arm in the torso's frame, then leant with it (Rx(lean): y' = y cos - z sin, z' = y sin + z cos)
    const ux = sx * Math.sin(as) * UPPER, uy = -Math.cos(ap) * Math.cos(as) * UPPER, uz = Math.sin(ap) * Math.cos(as) * UPPER;
    const b = ap + af, fx = sx * Math.sin(as) * 0.5 * FORE, fy = -Math.cos(b) * Math.cos(as) * FORE, fz = Math.sin(b) * Math.cos(as) * FORE;
    const ex = shx + ux, ey = sy + uy * cl - uz * sl, ez = sz + uy * sl + uz * cl;
    set(8 + s, ex, ey, ez); set(10 + s, ex + fx, ey + fy * cl - fz * sl, ez + fy * sl + fz * cl);
  }
  // the whole body: roll (about z), pitch (forward about x), yaw, then slide forward; resting on its lowest point
  const cr = Math.cos(k.roll), sr = Math.sin(k.roll), cp = Math.cos(k.pitch), spi = Math.sin(k.pitch), cy = Math.cos(k.yaw), syw = Math.sin(k.yaw);
  let lo = Infinity;
  for (let i = 0; i < NP; i++) {
    let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const x1 = x * cr - y * sr, y1 = x * sr + y * cr; x = x1; y = y1;
    const y2 = y * cp - z * spi, z2 = y * spi + z * cp; y = y2; z = z2;
    const x3 = x * cy + z * syw, z3 = -x * syw + z * cy;
    out[o + i * 3] = x3; out[o + i * 3 + 1] = y; out[o + i * 3 + 2] = z3 + k.slide;
    lo = Math.min(lo, y - RAD[i]);
  }
  for (let i = 0; i < NP; i++) out[o + i * 3 + 1] -= lo;
}

const FIELDS = ['pitch', 'roll', 'yaw', 'lean', 'slide'];
function fullKeys(keys) {
  const out = []; let prev = { t: 0, pitch: 0, roll: 0, yaw: 0, lean: 0, slide: 0, flex: [0, 0], bend: [0, 0], arm: [[0.1, 0.1, 0.2], [0.1, 0.1, 0.2]] };
  for (const k of keys) { const f = { ...prev, ...k, flex: [...(k.flex ?? prev.flex)], bend: [...(k.bend ?? prev.bend)], arm: (k.arm ?? prev.arm).map((a) => [...a]) }; out.push(f); prev = f; }
  return out;
}
function keyAt(K, t, tmp) {
  let i = 0; while (i < K.length - 1 && K[i + 1].t <= t) i++;
  const a = K[i], b = K[Math.min(K.length - 1, i + 1)], u = b === a ? 0 : smooth(Math.min(1, (t - a.t) / (b.t - a.t)));
  for (const f of FIELDS) tmp[f] = a[f] + (b[f] - a[f]) * u;
  for (let s = 0; s < 2; s++) { tmp.flex[s] = a.flex[s] + (b.flex[s] - a.flex[s]) * u; tmp.bend[s] = a.bend[s] + (b.bend[s] - a.bend[s]) * u; for (let j = 0; j < 3; j++) tmp.arm[s][j] = a.arm[s][j] + (b.arm[s][j] - a.arm[s][j]) * u; }
  return tmp;
}
export function compileClips(rows = DEATH_CLIPS, baked = UAL_CLIPS) {
  const out = {};
  for (const [id, r] of Object.entries(rows)) {
    let frames, n;
    if (r.src === 'proc') {
      const K = fullKeys(r.keys), tmp = { flex: [0, 0], bend: [0, 0], arm: [[0, 0, 0], [0, 0, 0]] };
      n = Math.max(2, Math.round(r.end * FPS) + 1); frames = new Float32Array(n * N3);
      for (let f = 0; f < n; f++) procPose(keyAt(K, (f / (n - 1)) * r.end, tmp), frames, f * N3);
    } else {
      const B = baked[r.src]; n = B.frames.length; frames = new Float32Array(n * N3);
      for (let f = 0; f < n; f++) frames.set(B.frames[f], f * N3);
    }
    const dur = r.src === 'proc' ? r.end : baked[r.src].dur;
    out[id] = { id, row: r, frames, n, dur, rag: r.rag, end: Math.min(r.end, dur), kick: r.kick, src: r.src };
  }
  return out;
}
export const CLIPS = compileClips();
// The clip's body-local frame at time t, into out (lerped between the two frames either side).
function clipAt(C, t, out) {
  const at = Math.max(0, Math.min(1, t / C.dur)) * (C.n - 1), i = Math.min(C.n - 2, Math.floor(at)), u = at - i, F = C.frames, a = i * N3, b = a + N3;
  for (let j = 0; j < N3; j++) out[j] = F[a + j] + (F[b + j] - F[a + j]) * u;
  return out;
}

const _loc = new Float32Array(N3), _loc2 = new Float32Array(N3), _pt = { x: 0, z: 0 }, _surf = { y: 0, vx: 0, vz: 0, v: null };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Deaths {
  constructor(game) {
    this.g = game;
    this.bodies = [];    // the characters with a death state (c.rag), dying or settled
    this.enabled = true;
    this.counts = { deaths: 0, settled: 0, onVehicle: 0, severed: 0, headshots: 0, crawlersFromSever: 0, pools: 0 };
    this.byClip = Object.fromEntries(Object.keys(CLIPS).map((k) => [k, 0]));
    this.acc = 0;
    // Severed limbs: one InstancedMesh of capsules (one draw call), two verlet points each.
    const S = SEVERED.max;
    this.pieces = Array.from({ length: S }, () => ({ on: false, a: new Float32Array(3), b: new Float32Array(3), qa: new Float32Array(3), qb: new Float32Array(3), len: 0.6, t: 0, still: 0, age: 0, color: '#555' }));
    this.pNext = 0;
    const geo = new THREE.CapsuleGeometry(0.065, 1, 3, 6); geo.translate(0, 0.5, 0);
    this.pMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), S);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.pMesh.castShadow = true; this.pMesh.frustumCulled = false;
    for (let i = 0; i < S; i++) { this.pMesh.setMatrixAt(i, ZERO); this.pMesh.setColorAt(i, new THREE.Color('#555')); }
    this.pMesh.count = 0; this.pMesh.visible = false;
    game.scene.add(this.pMesh);
  }

  // ---- picking the clip ------------------------------------------------------------------------------------------------
  // Which body part a hit landed on: the shooter's (c._hit, set by combat.damage / zombies.onHurt) or rolled as every hit is.
  part(c, cause) {
    if (c._hit) return c._hit;
    const o = HIT_ODDS[cause] ?? HIT_ODDS.bullet;
    if (o === 'all') return 'torso';
    let u = Math.random(); for (const k in o) if ((u -= o[k]) <= 0) return k;
    return 'torso';
  }
  blade(c, attacker) {
    const g = this.g;
    if (c._blade) return true;
    if (attacker === g.player && g.melee?.act?.kind === 'knife') return true;
    return !!attacker && BLADES.includes(attacker.melee ?? attacker.weapon);
  }
  pick(c, cause, part, dx, dz, face0, attacker) {
    if (cause === 'fire') return 'burn';
    if (cause === 'explosion') return 'blast';
    if (cause === 'vehicle') return 'runover';
    if (cause === 'bash') return this.blade(c, attacker) ? 'blade' : 'blunt';
    if (part === 'head') return 'head';
    if (part === 'legs') return 'leg';
    const d = Math.hypot(dx, dz);
    if (d < 0.1) return 'front';
    return (Math.sin(face0) * dx + Math.cos(face0) * dz) / d > BACK_DOT ? 'back' : 'front';
  }

  // ---- combat.kill's hook ------------------------------------------------------------------------------------------------
  onKill(c, attacker, dx, dz, cause, face0 = c.face) {
    const g = this.g;
    if (!this.enabled || c === g.player || c.inVehicle || c.ownMesh || c.hidden || c.fauna || c.underwater) return null;
    const part = this.part(c, cause), id = this.pick(c, cause, part, dx, dz, face0, attacker);
    const C = CLIPS[id], d = Math.hypot(dx, dz) || 1;
    let yaw = face0;
    if (id === 'front' || id === 'blast' || id === 'blunt' || id === 'blade') yaw = d > 0.1 ? Math.atan2(-dx / d, -dz / d) : face0; // facing whoever (or whatever) did it
    else if (id === 'back') yaw = Math.atan2(dx / d, dz / d);
    const gy = g.stunts?.heightAt(c.x, c.z, c.gy ?? 0) ?? c.gy ?? 0;
    const R = c.rag ?? { P: new Float32Array(N3), Q: new Float32Array(N3) };
    Object.assign(R, { clip: C, id, t: 0, phase: C.rag <= 0 ? 'rag' : 'clip', yaw, ox: c.x, oz: c.z, oy: gy, still: 0, age: 0, air: false, on: null, lv: R.lv ?? null, acc: 0, cx: c.x, cz: c.z, x0: c.x, z0: c.z, part, cause, pooled: false, maxY: 0, cross: null });
    c.rag = R; c.face = yaw;
    this.place(R, 0, R.P);
    R.Q.set(R.P);
    if (C.rag <= 0) this.toRag(R, 0);
    if (id === 'runover') this.runover(c, R, dx, dz);
    this.bodies.push(c);
    this.counts.deaths++; this.byClip[id]++;
    // limbs at the kill (a blast, a heavy round, a blade, a fast car)
    const dmg = c._hitDmg ?? 0;
    if (cause === 'explosion' && dmg >= SEVER.blastMin) {
      const n = SEVER.blastLimbs[0] + Math.floor(Math.random() * (SEVER.blastLimbs[1] - SEVER.blastLimbs[0] + 1)), ks = Object.keys(LIMB_BITS);
      for (let i = 0; i < n; i++) this.sever(c, ks[Math.floor(Math.random() * 4)], dx, dz, 6);
    } else if (cause === 'vehicle' && (this._carSp ?? 0) >= SEVER.vehicle.minSpeed && Math.random() < SEVER.vehicle.legs) this.sever(c, Math.random() < 0.5 ? 'legL' : 'legR', dx, dz, 4);
    else this.limbHit(c, part, dmg, cause, dx, dz, attacker);
    g.emit('deathClip', { id: c.id, clip: id, part, cause, faction: c.faction });
    return id;
  }

  // A hit on the living (zombies.onHurt) or the killing hit: a limb comes off by the SEVER rows.
  limbHit(c, part, dmg, cause, dx = 0, dz = 0, attacker = null) {
    if (part !== 'arms' && part !== 'legs') return null;
    const blade = cause === 'bash' && this.blade(c, attacker);
    const row = SEVER[part], p = blade ? SEVER.blade[part] : (cause === 'bullet' || cause === 'vehicle' || cause === 'explosion') && dmg >= row.min ? row.chance : 0;
    if (!(p > 0) || Math.random() >= p) return null;
    const side = Math.random() < 0.5 ? 'L' : 'R', limb = (part === 'arms' ? 'arm' : 'leg') + side;
    return this.sever(c, limb, dx, dz, 3) ? limb : null;
  }
  // Take a limb off: the body loses it (drawn without it), a piece lies where it fell, the stump bleeds. A leg gone makes
  // one of the living infected a crawler.
  sever(c, limb, dx = 0, dz = 0, fling = 3) {
    const g = this.g, bit = LIMB_BITS[limb];
    if (!bit || (c.lost ?? 0) & bit) return false;
    c.lost = (c.lost ?? 0) | bit;
    const arm = limb[0] === 'a', L = limb.endsWith('L');
    // where the limb is now: the body's points if it is dying, else the standing rig at c
    let ax, ay, az, bx, by, bz;
    const R = c.rag;
    if (R && !c.alive) { const [i0, i1] = LIMB_PTS[limb]; ax = R.P[i0 * 3]; ay = R.P[i0 * 3 + 1]; az = R.P[i0 * 3 + 2]; bx = R.P[i1 * 3]; by = R.P[i1 * 3 + 1]; bz = R.P[i1 * 3 + 2]; }
    else {
      const s = L ? 1 : -1, cx = Math.cos(c.face), sx = Math.sin(c.face), off = (arm ? SHOULDER_X : HIP_X) * s, gy = c.gy ?? 0;
      ax = c.x + off * cx; az = c.z - off * sx; ay = gy + (arm ? 1.48 : 0.92); bx = ax; bz = az; by = ay - (arm ? UPPER + FORE : THIGH + SHIN);
    }
    const P = this.pieces[this.pNext]; this.pNext = (this.pNext + 1) % this.pieces.length;
    P.on = true; P.t = 0; P.still = 0; P.age = 0; P.len = Math.hypot(bx - ax, by - ay, bz - az) || 0.6;
    P.a[0] = ax; P.a[1] = ay; P.a[2] = az; P.b[0] = bx; P.b[1] = by; P.b[2] = bz;
    const d = Math.hypot(dx, dz) || 1, k = RG.step;
    P.qa[0] = ax - (dx / d) * fling * k; P.qa[1] = ay - 2.5 * k; P.qa[2] = az - (dz / d) * fling * k;
    P.qb[0] = bx - (dx / d) * fling * 1.4 * k - (Math.random() - 0.5) * 2 * k; P.qb[1] = by - 1.5 * k; P.qb[2] = bz - (dz / d) * fling * 1.4 * k;
    const col = c.colors ?? {};
    P.color = arm ? (col.sleeves === 'short' ? col.skin : col.shirt) ?? '#555' : col.pants ?? '#444';
    g.fx.bloodSpray(ax, ay, az, dx / d, dz / d, 14, 1.1);
    g.fx.decal(ax, az, BLOOD_ROWS.stump, '#5a0606', undefined, g.fx.onFloor(c));
    this.counts.severed++;
    g.emit('limbOff', { id: c.id, limb, alive: c.alive });
    if (!arm && c.alive && c.faction === 'zombie' && !c.crawl) { g.zombies?.crawler(c, 'sever'); this.counts.crawlersFromSever++; }
    return true;
  }

  // ---- placing the clip in the world ---------------------------------------------------------------------------------
  // The clip's frame at t, in the world (the body's own origin and heading), into out. Each point kept above what is under it.
  place(R, t, out) {
    clipAt(R.clip, t, _loc);
    const cy = Math.cos(R.yaw), sy = Math.sin(R.yaw);
    for (let i = 0; i < NP; i++) {
      const x = _loc[i * 3], y = _loc[i * 3 + 1], z = _loc[i * 3 + 2];
      const wx = R.ox + x * cy + z * sy, wz = R.oz - x * sy + z * cy;
      let wy = R.oy + y;
      const f = this.surface(wx, wz, wy + 0.3) + RAD[i];
      if (wy < f) wy = f;
      out[i * 3] = wx; out[i * 3 + 1] = wy; out[i * 3 + 2] = wz;
    }
    return out;
  }
  // The clip hands over to the ragdoll: the points carry the clip's own speed plus the row's kick.
  toRag(R, t) {
    R.phase = 'rag';
    const h = 1 / FPS;
    if (t > h) {
      this.place(R, t - h, R.Q);
      const k = RG.step / h; // per physics step
      for (let j = 0; j < N3; j++) R.Q[j] = R.P[j] - (R.P[j] - R.Q[j]) * k;
    } else R.Q.set(R.P);
    const K = R.clip.kick, cy = Math.cos(R.yaw), sy = Math.sin(R.yaw), dt = RG.step;
    const fx = Math.sin(R.yaw), fz = Math.cos(R.yaw), rx = cy, rz = -sy; // forward and left in the world
    const px = (R.P[0] + R.P[3] + R.P[18] + R.P[21]) / 4, pz = (R.P[2] + R.P[5] + R.P[20] + R.P[23]) / 4;
    for (let i = 0; i < NP; i++) {
      let vx = fx * K.fwd + rx * K.side, vz = fz * K.fwd + rz * K.side;
      if (K.spin) { const ox = R.P[i * 3] - px, oz = R.P[i * 3 + 2] - pz; vx += -oz * K.spin; vz += ox * K.spin; }
      R.Q[i * 3] -= vx * dt; R.Q[i * 3 + 1] -= K.up * dt; R.Q[i * 3 + 2] -= vz * dt;
    }
  }
  // Run over: the car's speed carried, the legs swept, thrown up; it goes up and over the hood (HOOD).
  runover(c, R, dx, dz) {
    const g = this.g;
    let v = null, bd = 9;
    for (const o of g.vehicles) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < bd && g.vehiclesSys.speed(o) > 2) { bd = d; v = o; } }
    const sp = v ? g.vehiclesSys.speed(v) : 0;
    this._carSp = sp;
    R.car = v; R.carSp = sp;
    if (!v) return;
    const ux = v.vx / (sp || 1), uz = v.vz / (sp || 1), fast = sp >= HOOD.minSpeed, dt = RG.step;
    const carry = fast ? HOOD.carry : 0.4, up = fast ? HOOD.up + HOOD.upPerMs * sp : 1.2;
    const px = (R.P[0] + R.P[3]) / 2, pz = (R.P[2] + R.P[5]) / 2;
    for (let i = 0; i < NP; i++) {
      const leg = i >= 2 && i <= 5, hi = R.P[i * 3 + 1] - R.oy;
      const sweep = fast ? (leg ? HOOD.sweep : -HOOD.sweep * 0.25 * hi) : 0;
      const vx = ux * (sp * carry + sweep), vz = uz * (sp * carry + sweep), vy = up + (fast ? HOOD.spin * (hi - 0.9) * 0.5 : 0);
      R.Q[i * 3] = R.P[i * 3] - vx * dt; R.Q[i * 3 + 1] = R.P[i * 3 + 1] - vy * dt; R.Q[i * 3 + 2] = R.P[i * 3 + 2] - vz * dt;
    }
    // where the car is, for the over-the-hood measure (the selftest reads R.cross)
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    R.cross = { v, a0: (px - v.x) * fx + (pz - v.z) * fz, aMin: Infinity, maxRel: -Infinity, overTop: false, len: v.len };
    if (g.blood && BLOOD_ROWS.hoodSplash) g.blood.splash?.(c, -ux, -uz, 60, true); // onto the car that hit it
  }

  // ---- the surface under a point ------------------------------------------------------------------------------------
  // The highest thing under (x, z) at or below y: the land, a floor or a stair (stunts.heightAt), a vehicle's top. Sets
  // _surf.v and the surface's own velocity (a moving hood carries what lies on it).
  surface(x, z, y) {
    const g = this.g;
    let top = g.stunts ? g.stunts.heightAt(x, z, y) : 0;
    _surf.v = null; _surf.vx = 0; _surf.vz = 0;
    for (const v of g.vehicles) {
      if (v.dead && !v.wreck && v.sunk) continue;
      const dx = x - v.x, dz = z - v.z, reach = (v.len ?? 4) * 0.6 + 0.5;
      if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
      const fx = Math.sin(v.h), fz = Math.cos(v.h), along = dx * fx + dz * fz, across = dx * fz - dz * fx;
      const L = v.len ?? 4, W = v.wid ?? 2;
      if (Math.abs(along) > L / 2 + VEHICLE_TOP.within || Math.abs(across) > W / 2 + VEHICLE_TOP.within * 0.5) continue;
      const s = (L / 2 - along) / L, vy = v.y ?? 0;
      let h = (v.tall ?? 1.6) * 0.6;
      for (const b of VEHICLE_TOP.bands) if (s >= b[0] && s < b[1]) { h = (v.tall ?? 1.6) * b[2]; break; }
      let vt = vy + h;
      const D = v.deck;
      if (D?.floor && across >= D.floor[0] && across <= D.floor[1] && along >= D.floor[2] && along <= D.floor[3]) vt = g.decks?.floorYCached ? g.decks.floorYCached(v, D) : vy + D.y;
      if (vt > top && y > vt - 1.4) { top = vt; _surf.v = v; _surf.vx = v.vx ?? 0; _surf.vz = v.vz ?? 0; }
    }
    _surf.y = top;
    return top;
  }

  // ---- per frame ------------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g;
    if (!dt) return;
    let active = 0;
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const c = this.bodies[i], R = c.rag;
      if (!R || c.alive || !g.chars.includes(c)) { if (c.alive) { c.rag = null; c.lost = 0; } this.bodies.splice(i, 1); continue; }
      // someone moved the body (dragged, the harpoon, a check): every point goes with it
      const mx = c.x - R.cx, mz = c.z - R.cz;
      if (mx * mx + mz * mz > 1e-6) { for (let j = 0; j < NP; j++) { R.P[j * 3] += mx; R.P[j * 3 + 2] += mz; R.Q[j * 3] += mx; R.Q[j * 3 + 2] += mz; } R.ox += mx; R.oz += mz; if (R.lv) R.on = null; }
      if (c.dragged || c.carried) { R.cx = c.x; R.cz = c.z; continue; }
      if (R.phase === 'still') { if (R.on) this.ride(c, R); R.cx = c.x; R.cz = c.z; continue; }
      if (++active > RG.maxActive) { this.freeze(c, R); continue; }
      R.age += dt; R.t += dt;
      if (R.phase === 'clip') {
        this.place(R, R.t, R.P);
        if (R.t >= R.clip.rag) this.toRag(R, R.t);
      } else {
        R.acc += dt;
        let n = 0;
        while (R.acc >= RG.step && n < 6) { R.acc -= RG.step; n++; this.step(R, RG.step); }
        if (n === 6) R.acc = 0;
      }
      this.track(c, R);
      if (R.phase === 'rag' && (R.still >= RG.settleT || R.age > RG.maxT)) this.freeze(c, R);
    }
    if (this.pMesh.count || this.pieces.some((p) => p.on)) this.stepPieces(dt);
  }

  // One fixed step of the ragdoll: verlet, the pull of the clip while it blends, the links, what lies under each point.
  step(R, h) {
    const P = R.P, Q = R.Q, damp = 1 - RG.air * h, g2 = RG.gravity * h * h;
    let pull = 0;
    if (R.t < R.clip.end && R.clip.end > R.clip.rag) { pull = 0.22 * (1 - (R.t - R.clip.rag) / (R.clip.end - R.clip.rag)); this.place(R, R.t, _loc2); }
    let vmax = 0;
    for (let i = 0; i < NP; i++) {
      for (let a = 0; a < 3; a++) {
        const j = i * 3 + a, v = (P[j] - Q[j]) * damp;
        Q[j] = P[j]; P[j] += v - (a === 1 ? g2 : 0);
        if (pull > 0) P[j] += (_loc2[j] - P[j]) * pull;
      }
    }
    for (let it = 0; it < RG.iters; it++) {
      for (const L of LINKS) {
        const a = L[0] * 3, b = L[1] * 3;
        const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (L[3] === 'min' && d >= L[2]) continue;
        const k = ((d - L[2]) / d) * 0.5;
        P[a] += dx * k; P[a + 1] += dy * k; P[a + 2] += dz * k; P[b] -= dx * k; P[b + 1] -= dy * k; P[b + 2] -= dz * k;
      }
      this.collide(R, it === RG.iters - 1);
    }
    for (let j = 0; j < N3; j++) { const v = Math.abs(P[j] - Q[j]); if (v > vmax) vmax = v; }
    // still: slow relative to what it lies on (a body riding a moving bed is still on the bed)
    const rel = R.onSurf ? Math.max(0, vmax - Math.hypot(R.svx, R.svz) * h) : vmax;
    if (rel / h < RG.settleV) R.still += h; else R.still = 0;
  }
  collide(R, last) {
    const g = this.g, P = R.P, Q = R.Q, h = RG.step;
    R.onSurf = null; R.svx = 0; R.svz = 0;
    for (let i = 0; i < NP; i++) {
      const j = i * 3, f = this.surface(P[j], P[j + 2], P[j + 1] + 0.25) + RAD[i];
      if (P[j + 1] < f) {
        // pushed out onto the surface: it keeps a genuine upward speed (a body thrown off a hood), never the push itself
        const vy = P[j + 1] - Q[j + 1];
        P[j + 1] = f; Q[j + 1] = f - Math.max(0, Math.min(vy, 0.2));
        if (last) {
          // friction relative to the surface (a moving hood or bed drags what lies on it), a thud not a bounce
          const svx = _surf.vx * h, svz = _surf.vz * h, k = 1 - RG.friction;
          Q[j] = P[j] - (P[j] - Q[j] - svx) * k - svx; Q[j + 2] = P[j + 2] - (P[j + 2] - Q[j + 2] - svz) * k - svz;
          Q[j + 1] = P[j + 1] + (P[j + 1] - Q[j + 1] < 0 ? (Q[j + 1] - P[j + 1]) * RG.bounce : 0);
          if (_surf.v) { R.onSurf = _surf.v; R.svx = _surf.vx; R.svz = _surf.vz; }
        }
      }
      // walls: the torso and the hands are kept out of buildings
      if (last && (i < 2 || i === 6 || i === 7 || i >= 10) && g.statics?.resolveCircle) {
        _pt.x = P[j]; _pt.z = P[j + 2];
        if (g.statics.resolveCircle(_pt, RAD[i]) > 0) { P[j] = _pt.x; P[j + 2] = _pt.z; }
      }
    }
  }
  // After each update: the body's spot (c.x/z the pelvis), in the air or not (blood.js smears only on the ground), the car.
  track(c, R) {
    const P = R.P, px = (P[0] + P[3]) / 2, py = (P[1] + P[4]) / 2, pz = (P[2] + P[5]) / 2;
    // in the air: its lowest point (ankles, hips, shoulders) clear of what is under it, or lying on a vehicle
    let lift = Infinity, onCar = false;
    for (const i of AIR_PTS) { lift = Math.min(lift, P[i * 3 + 1] - this.surface(P[i * 3], P[i * 3 + 2], P[i * 3 + 1] + 0.3) - RAD[i]); if (_surf.v) onCar = true; }
    const f = this.surface(px, pz, py + 0.3);
    R.air = lift > 0.3 || onCar;
    c.x = px; c.z = pz; R.cx = px; R.cz = pz; c.gy = _surf.v ? 0 : Math.max(0, f);
    R.maxY = Math.max(R.maxY, py - R.oy);
    const X = R.cross;
    if (X && this.g.vehicles.includes(X.v)) {
      const v = X.v, fx = Math.sin(v.h), fz = Math.cos(v.h), a = (px - v.x) * fx + (pz - v.z) * fz;
      X.aMin = Math.min(X.aMin, a);
      const vt = (v.y ?? 0) + (v.tall ?? 1.6) * 0.55;
      if (Math.abs((px - v.x) * fz - (pz - v.z) * fx) < (v.wid ?? 2) / 2 + 0.4 && Math.abs(a) < (v.len ?? 4) / 2 + 0.3 && py > vt) X.overTop = true;
    }
  }
  // Settled (or out of time): frozen where it is, riding the vehicle it lies on; a pool spreads under it.
  freeze(c, R) {
    const g = this.g, P = R.P;
    R.phase = 'still'; this.counts.settled++;
    const px = (P[0] + P[3] + P[18] + P[21]) / 4, pz = (P[2] + P[5] + P[20] + P[23]) / 4, py = (P[1] + P[4] + P[19] + P[22]) / 4;
    this.surface(px, pz, py + 0.3);
    const v = _surf.v;
    if (v) {
      R.on = v; this.counts.onVehicle++;
      R.lv = R.lv ?? new Float32Array(N3);
      const ch = Math.cos(v.h), sh = Math.sin(v.h), vy = v.y ?? 0;
      for (let i = 0; i < NP; i++) { const dx = P[i * 3] - v.x, dz = P[i * 3 + 2] - v.z; R.lv[i * 3] = dx * ch - dz * sh; R.lv[i * 3 + 1] = P[i * 3 + 1] - vy; R.lv[i * 3 + 2] = dx * sh + dz * ch; }
      R.lh = v.h;
    } else if (!R.pooled && Math.hypot(px - R.x0, pz - R.z0) > 1.2) {
      // a pool where it came to rest (the kill already pooled where it fell), on the floor or stair it lies on
      R.pooled = true; this.counts.pools++;
      const fx = g.fx, gr = fx.ground ? fx.ground(px, pz) : 0, sy = _surf.y;
      const r = BLOOD_ROWS.pool, target = R.id === 'blast' || R.id === 'runover' ? BLOOD_ROWS.poolBig : r[0] + Math.random() * (r[1] - r[0]);
      const i = fx.decal(px, pz, 0.3, '#4e0303', Math.random() * 6, sy - gr + DECAL_Y);
      fx.growing.push({ i, x: px, z: pz, rot: Math.random() * 6, cur: 0.3, target, y: sy + DECAL_Y + (i % 7) * 0.002 });
      fx.pools.push({ x: px, z: pz, r: target * 0.4 }); if (fx.pools.length > 64) fx.pools.shift();
    }
    R.cx = c.x; R.cz = c.z;
    g.emit('bodySettled', { id: c.id, clip: R.id, onVehicle: v?.id ?? null, x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10, t: Math.round(R.age * 100) / 100 });
  }
  // A settled body on a vehicle goes where the vehicle goes (until the vehicle is gone: then it falls again).
  ride(c, R) {
    const v = R.on, g = this.g;
    if (!g.vehicles.includes(v)) { R.on = null; R.phase = 'rag'; R.still = 0; R.age = Math.max(0, RG.maxT - 3); return; }
    const ch = Math.cos(v.h), sh = Math.sin(v.h), vy = v.y ?? 0, P = R.P;
    for (let i = 0; i < NP; i++) { const lx = R.lv[i * 3], lz = R.lv[i * 3 + 2]; P[i * 3] = v.x + lx * ch + lz * sh; P[i * 3 + 1] = vy + R.lv[i * 3 + 1]; P[i * 3 + 2] = v.z - lx * sh + lz * ch; }
    R.Q.set(P);
    c.x = (P[0] + P[3]) / 2; c.z = (P[2] + P[5]) / 2;
  }

  // ---- the severed pieces ----------------------------------------------------------------------------------------------
  stepPieces(dt) {
    const g = this.g, M = this.pMesh;
    let n = 0;
    const h = Math.min(dt, 1 / 30), g2 = RG.gravity * h * h;
    for (const p of this.pieces) {
      if (!p.on) continue;
      p.age += dt;
      if (p.age > SEVERED.life) { p.on = false; continue; }
      if (p.still < 0.5) {
        for (const [X, Q] of [[p.a, p.qa], [p.b, p.qb]]) {
          for (let a = 0; a < 3; a++) { const v = (X[a] - Q[a]) * 0.99; Q[a] = X[a]; X[a] += v - (a === 1 ? g2 : 0); }
          const f = this.surface(X[0], X[2], X[1] + 0.2) + SEVERED.radius;
          if (X[1] < f) { X[1] = f; Q[0] = X[0] - (X[0] - Q[0]) * 0.5; Q[2] = X[2] - (X[2] - Q[2]) * 0.5; Q[1] = X[1]; }
        }
        const dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1], dz = p.b[2] - p.a[2], d = Math.hypot(dx, dy, dz) || 1e-6, k = ((d - p.len) / d) * 0.5;
        p.a[0] += dx * k; p.a[1] += dy * k; p.a[2] += dz * k; p.b[0] -= dx * k; p.b[1] -= dy * k; p.b[2] -= dz * k;
        const sp = Math.abs(p.a[0] - p.qa[0]) + Math.abs(p.a[1] - p.qa[1]) + Math.abs(p.b[0] - p.qb[0]) + Math.abs(p.b[1] - p.qb[1]);
        p.still = sp / h < 0.08 ? p.still + h : 0;
      }
      _p.set(p.a[0], p.a[1], p.a[2]); _d.set(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]);
      const len = _d.length() || 1; _d.divideScalar(len);
      _q.setFromUnitVectors(_up, _d); _s.set(1, len, 1);
      M.setMatrixAt(n, _m.compose(_p, _q, _s));
      M.setColorAt(n, _c.set(p.color));
      n++;
    }
    M.count = n; M.visible = n > 0;
    M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true;
  }

  // A body death rites folded and brings back (rites.link): it lies as it lay, wherever it is now (x0, z0: where it lay).
  restore(c, pose, x0 = c.x, z0 = c.z) {
    const P = new Float32Array(pose), dx = c.x - x0, dz = c.z - z0;
    for (let i = 0; i < NP; i++) { P[i * 3] += dx; P[i * 3 + 2] += dz; }
    c.rag = { P, Q: new Float32Array(P), clip: CLIPS.front, id: 'restored', t: 0, phase: 'still', yaw: c.face ?? 0, ox: c.x, oz: c.z, oy: 0, still: 1, age: 0, air: false, on: null, lv: null, acc: 0, cx: c.x, cz: c.z, x0: c.x, z0: c.z, part: null, cause: null, pooled: true, maxY: 0, cross: null };
    if (!this.bodies.includes(c)) this.bodies.push(c);
  }

  // ---- agents ------------------------------------------------------------------------------------------------------------
  view(c) {
    const R = c?.rag;
    if (!R) return null;
    const P = R.P, r2 = (v) => Math.round(v * 100) / 100;
    // rest: the best-supported point's gap over what is under it (a body draped over a car's edge hangs its limbs in the
    // air, but something touches); hang: the worst
    let lo = Infinity, hi = -Infinity, gap = Infinity, hang = 0;
    for (let i = 0; i < NP; i++) {
      const y = P[i * 3 + 1]; lo = Math.min(lo, y); hi = Math.max(hi, y);
      const f = this.surface(P[i * 3], P[i * 3 + 2], y + 0.3) + RAD[i]; gap = Math.min(gap, y - f); hang = Math.max(hang, y - f);
    }
    let stretch = 0;
    for (const L of LINKS) { if (L[3]) continue; const a = L[0] * 3, b = L[1] * 3; stretch = Math.max(stretch, Math.abs(Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]) - L[2]) / L[2]); }
    return {
      id: c.id, clip: R.id, part: R.part, cause: R.cause, phase: R.phase, t: r2(R.t), age: r2(R.age), air: R.air,
      onVehicle: R.on?.id ?? null, x: r2(c.x), z: r2(c.z), lowY: r2(lo), highY: r2(hi), maxLift: r2(R.maxY),
      restGap: r2(gap), hang: r2(hang), stretch: r2(stretch), lost: c.lost ?? 0, moved: r2(Math.hypot(c.x - R.x0, c.z - R.z0)),
      cross: R.cross ? { a0: r2(R.cross.a0), aMin: r2(R.cross.aMin), overTop: R.cross.overTop, len: R.cross.len } : null,
    };
  }
  points(c) { return c?.rag ? Array.from(c.rag.P, (v) => Math.round(v * 1000) / 1000) : null; }
}
const _c = new THREE.Color();
export { NP as DEATH_POINTS, LINKS as DEATH_LINKS };
