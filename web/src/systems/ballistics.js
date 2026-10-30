import * as THREE from 'three';
import { ROUNDS, BALLISTICS as B, roundRow, calOf } from '../data/ballistics.js';
import { SHOT_READ as R } from '../data/shotread.js';

// BULLET SPEED (docs/design/WEB_BALLISTICS.md). A gun's round is no longer a ray that lands the frame it is fired: it is
// a body in the air with the speed its row gives it (data/ballistics.js ROUNDS), slowed by the air, pulled down by
// gravity, carried by whatever the shooter stands on (a car, a deck), and it meets what is in its way when it gets
// there. Each frame a round flies a straight swept segment (in sub-steps of at most B.maxStep m) and that segment is
// resolved by combat.segment, the very code the old hitscan ran: people, cars, dogs, animals and the train in the same
// order, walls by what they are made of (systems/materials.js: through, off or into), so nothing tunnels through a wall
// at any frame rate (a swept segment meets the wall whatever its length) and every material law holds as it was.
//
// The flight is solved in closed form per sub-step (linear drag): along its line s(h) = v (1 - e^-kh) / k, its speed
// v e^-kh; its fall vy' = (vy + g/k) e^-kh - g/k. A round's path is therefore the same at 20 fps and at 144 fps.
//
//   takes(ammo, slope)     combat.hitscan asks: does this round fly (a row for it, not a shot up at the sky)?
//   launch(...)            a round leaves the muzzle (combat.hitscan, on a gun's fire)
//   update(dt)             fly every round, resolve what each meets, draw the streaks (main.js loop)
//   flightTime(key, d)     the closed-form time a round takes to fly d m (the checks and the AI's lead use it)
//   dropAt(key, d)         how far below its line a round fired level has fallen after d m
//   seed / rand            the shot's seed and the generator its pellets' spread is rolled from (a remote replays it)
//   record(n)              the last shots fired (the shard contract: what a remote page needs to replay the flight)
//   inFlight(by)           rounds still in the air (fired by `by`, when given)
// Nothing is allocated per frame or per shot: the rounds are a fixed pool (oldest-first recycle), the streaks one
// InstancedMesh (one draw call), the shot records a ring.
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _o = new THREE.Object3D();
const REC = 64;

export class Ballistics {
  constructor(game, scene) {
    this.g = game;
    this.on = true;            // false: every gun is the old hitscan (a test's comparison; nothing in the game turns it off)
    this.cap = B.cap;
    this.pool = Array.from({ length: this.cap }, (_, i) => ({
      i, live: false, show: 0, id: 0, shooter: null, row: null, key: null, ammo: null,
      x: 0, z: 0, y: 0, dx: 0, dz: 1, sp: 0, sp0: 0, vy: 0, k: 0, t: 0, left: 0, dmg: 0, energy: 0, segs: 0,
      mx: 0, mz: 0, flown: 0, tracer: false, read: false, _drawn: false, fy: 0, ghost: false, hitKind: null, hitT: -1,
      F: { x: 0, z: 0, gy: 0, ug: null, storey: null }, // the floor it was fired on (combat.segment's floor rules)
    }));
    this.next = 0;
    this.live = 0;
    this.clock = 0;
    this.shotN = 0;
    this.stats = { launched: 0, recycled: 0, hit: 0, ground: 0, expired: 0, cracks: 0, whispers: 0 };
    // The shot ring (the shard contract): one record per trigger pull, reused.
    this.recs = Array.from({ length: REC }, () => ({ seq: 0, seed: 0, by: null, ammo: null, round: null, x: 0, z: 0, y: 0, ang: 0, pvx: 0, pvz: 0, pellets: 1, t: 0 }));
    this.recN = 0;
    this.rs = 1; // the spread generator's state (mulberry32)
    this.last = null; // the last round that came down: { kind, t, x, z, flown } (the checks read it)
    this._last = { kind: null, t: 0, x: 0, z: 0, flown: 0, by: null, id: 0 };
    // One streak per round slot: a stretched box drawn additive, warm (the old tracer's colour).
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), this.cap);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < this.cap; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.count = this.cap;
    scene?.add(this.mesh);
    this.drawn = 0;
  }

  // ---- the rows ------------------------------------------------------------------------------------------------------
  // The round a gun fires: its calibre (data/ballistics.js ROUNDS, docs/design/WEB_CALIBERS.md), a fire mode's own
  // (the slug), else what its ammo key names. Old names (an ammo key, 'rifle', 'slug') resolve to their calibre.
  rowKey(w) { return calOf(w?.cal ?? w?.round ?? w?.ammo); }
  takes(key, slope = 0) { return this.on && !slope && !!roundRow(key); }

  // Closed-form flight (linear drag): time to fly d m along the line; null if the round never gets there.
  flightTime(key, d, v0 = null) {
    const r = roundRow(key); if (!r) return null;
    const v = v0 ?? r.velocity, k = r.drag;
    if (k < 1e-6) return d / v;
    const f = 1 - (d * k) / v;
    return f <= 0 ? null : -Math.log(f) / k;
  }
  speedAt(key, d) { const r = roundRow(key); return r ? Math.max(0, r.velocity - r.drag * d) : 0; }
  // Below the line after d m, fired level: the fall under gravity with the same drag (vy' = -g - k vy).
  dropAt(key, d) {
    const r = roundRow(key), t = this.flightTime(key, d); if (!r || t === null) return null;
    const k = r.drag, gr = B.gravity;
    if (k < 1e-6) return 0.5 * gr * t * t;
    return (gr / k) * t - (gr / (k * k)) * (1 - Math.exp(-k * t));
  }

  // ---- the shot's seed ------------------------------------------------------------------------------------------------
  // One seed per trigger pull: the shooter's id hashed with the pull's number. combat.fire rolls every pellet's spread
  // and range from it, so a page that has the record (seed, muzzle, heading, platform velocity) flies the same rounds.
  seed(ch, ammo, round, x, z, ang, pellets) {
    const id = String(ch?.id ?? 'x');
    let h = 2166136261 ^ ++this.shotN;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    h >>>= 0;
    const r = this.recs[this.recN++ % REC];
    const pv = this.platformV(ch);
    r.seq = this.shotN; r.seed = h; r.by = ch?.id ?? null; r.ammo = ammo; r.round = round; r.x = x; r.z = z; r.y = 0; r.ang = ang;
    r.pvx = pv ? pv.vx : 0; r.pvz = pv ? pv.vz : 0; r.pellets = pellets; r.t = this.clock;
    this.rs = h || 1;
    return h;
  }
  reseed(s) { this.rs = s >>> 0 || 1; }
  // mulberry32: one float in [0, 1) off the shot's state.
  rand() {
    let t = (this.rs = (this.rs + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  record(n = 8) {
    const out = [];
    for (let k = 1; k <= Math.min(n, REC, this.recN); k++) {
      const r = this.recs[(this.recN - k) % REC];
      out.push({ seq: r.seq, seed: r.seed, by: r.by, ammo: r.ammo, round: r.round, x: +r.x.toFixed(3), z: +r.z.toFixed(3), ang: +r.ang.toFixed(5), pvx: +r.pvx.toFixed(3), pvz: +r.pvz.toFixed(3), pellets: r.pellets, t: +r.t.toFixed(3) });
    }
    return out;
  }

  // What the shooter stands on moves with them: a car they drive or ride in, a deck, a window they lean out of.
  platformV(ch) {
    const v = ch?.inVehicle ?? ch?.firingFrom ?? ch?.onDeck?.v ?? null;
    return v && Number.isFinite(v.vx) ? v : null;
  }

  // ---- a round leaves the muzzle --------------------------------------------------------------------------------------
  // (dx, dz): the aimed line (unit). The shooter's platform velocity adds to the muzzle's: the round's line and speed
  // over the ground are the sum (a passenger firing sideways out of a car at 25 m/s sends the round forward too).
  launch(shooter, ox, oz, dx, dz, range, dmg, ammo, key = ammo, opts = null) {
    key = calOf(key); const row = ROUNDS[key]; if (!row) return null;
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.cap;
    if (p.live) { this.stats.recycled++; this.live--; }
    const pv = opts?.noPlatform ? null : this.platformV(shooter);
    let vx = dx * row.velocity + (pv ? pv.vx : 0), vz = dz * row.velocity + (pv ? pv.vz : 0);
    if (opts?.pvx !== undefined) { vx = dx * row.velocity + opts.pvx; vz = dz * row.velocity + opts.pvz; }
    const sp = Math.hypot(vx, vz) || 1;
    const fy = shooter && (shooter.storey || shooter.ug) ? (shooter.gy ?? 0) - (shooter.storey?.y0 ?? 0) : 0; // the floor's height over its pad (WEB_SITES_TERRAIN)
    p.live = true; p.show = 0; p.id = ++this.stats.launched; p.shooter = shooter; p.row = row; p.key = key; p.ammo = ammo;
    p.x = ox; p.z = oz; p.mx = ox; p.mz = oz; p.y = opts?.y ?? 1.45; p.vy = 0; p.fy = fy;
    p.dx = vx / sp; p.dz = vz / sp; p.sp = sp; p.sp0 = sp; p.k = row.drag; p.t = 0; p.flown = 0;
    p.left = range; p.dmg = dmg; p.energy = dmg * (this.g.materials ? this.g.materials.punch(ammo) : 1); p.segs = 0;
    p.ghost = !!opts?.ghost; p.hitKind = null; p.hitT = -1;
    const F = p.F; F.x = shooter?.x ?? ox; F.z = shooter?.z ?? oz; F.gy = shooter?.gy ?? 0; F.ug = shooter?.ug ?? null; F.storey = shooter?.storey ?? null;
    // Every Nth round of this kind from this shooter draws its streak (the shooter's own count, per round kind).
    if (row.tracerEvery > 0 && shooter) { const c = (shooter._tracerN ??= {}); c[key] = ((c[key] ?? -1) + 1) % row.tracerEvery; p.tracer = c[key] === 0; }
    else p.tracer = row.tracerEvery === 1;
    // A round at the player always draws, a little longer and wider (data/shotread.js: the shot at you must read).
    p.read = !p.ghost && !!this.g.shotRead?.at(shooter, ox, oz, p.dx, p.dz, range);
    if (p.read) p.tracer = true;
    this.live++;
    return p;
  }

  inFlight(by = null) {
    if (!this.live) return 0;
    let n = 0;
    for (const p of this.pool) if (p.live && (!by || p.shooter === by)) n++;
    return n;
  }

  // ---- the flight -----------------------------------------------------------------------------------------------------
  update(dt) {
    if (dt > 0) {
      this.clock += dt;
      if (this.live) for (const p of this.pool) if (p.live) this.fly(p, dt);
    }
    this.draw(dt);
  }

  fly(p, dt) {
    const g = this.g, C = g.combat, gr = B.gravity;
    // Sub-steps short enough that the people and cars it is resolved against barely move within one.
    const n = Math.max(1, Math.ceil((p.sp * dt) / B.maxStep));
    const h = dt / n, e = Math.exp(-p.k * h);
    for (let s = 0; s < n && p.live; s++) {
      // This sub-step's run along the line and its fall (closed form, so the path never depends on the frame rate).
      let run = p.k < 1e-6 ? p.sp * h : (p.sp * (1 - e)) / p.k;
      const vy1 = p.k < 1e-6 ? p.vy - gr * h : (p.vy + gr / p.k) * e - gr / p.k;
      const y1 = p.k < 1e-6 ? p.y + p.vy * h - 0.5 * gr * h * h : p.y + ((p.vy + gr / p.k) * (1 - e)) / p.k - (gr / p.k) * h;
      // The ground: the share of the run before it falls through the floor it flies over (linear across the sub-step).
      let ground = false;
      if (y1 <= 0 && !p.ghost) { const f = p.y / Math.max(1e-6, p.y - y1); run *= Math.min(1, Math.max(0, f)); ground = true; }
      let range = false;
      if (run >= p.left) { run = p.left; range = true; }
      const sp1 = p.sp * e, t1 = p.t + h;
      // What it meets on this run: the same resolver the hitscan ran, segment by segment (a wall it passes or glances
      // off hands it on with what is left).
      let rem = run;
      while (rem > 1e-4 && p.live) {
        if (p.ghost) { this.advance(p, rem); rem = 0; break; }
        // The damage it carries now: slower, a little less (BALLISTICS.falloff).
        const fall = 1 - B.falloff * (1 - Math.min(1, p.sp / p.sp0));
        C.inFlight = p; // whiz or crack (combat.segment asks which)
        const r = C.segment(p.shooter, p.F, p.x, p.z, p.dx, p.dz, rem, p.dmg * fall, p.energy, p.ammo, 0, false);
        C.inFlight = null;
        const o = C.seg;
        if (r === 0) { this.advance(p, rem); rem = 0; break; }
        const used = Math.hypot(o.x - p.x, o.z - p.z);
        p.hitT = p.t + h * Math.min(1, (run - rem + used) / Math.max(1e-6, run));
        if (r === 1) { this.advance(p, used); this.land(p, o.kind ?? 'stopped'); break; }
        // Through or off a wall: on from the far side, which way it now flies, with what is left.
        p.flown += used; p.left -= used; rem -= used; p.x = o.x; p.z = o.z;
        if (o.dx * p.dx + o.dz * p.dz < 0.999) { p.mx = p.x; p.mz = p.z; } // a glance starts a new streak from the wall
        p.dx = o.dx; p.dz = o.dz; p.dmg = o.dmg / Math.max(0.05, fall); p.energy = o.energy;
        if (++p.segs >= 4 || rem < 0) { this.land(p, 'spent'); break; }
      }
      if (!p.live) break;
      p.sp = sp1; p.vy = vy1; p.y = y1; p.t = t1;
      if (ground) { this.groundHit(p); break; }
      if (range || p.left < 0.5) { this.land(p, 'range'); break; }
      if (p.t > B.maxLife || p.sp < 5) { this.stats.expired++; this.land(p, 'expired'); break; }
    }
  }

  advance(p, d) { p.x += p.dx * d; p.z += p.dz * d; p.flown += d; p.left -= d; }

  groundHit(p) {
    const g = this.g;
    if (!p.ghost) {
      g.fx.sparks(p.x, 0.1 + p.fy, p.z, -p.dx, -p.dz, 2);
      if (Math.random() < 0.25) g.fx.decal(p.x, p.z, 0.22, '#2a241c');
      g.shotRead?.impact(p.x, p.z, p.shooter, p.F); // dust where it lands near you (systems/shotread.js)
    }
    this.stats.ground++;
    this.land(p, 'ground');
  }

  land(p, kind) {
    if (kind !== 'range' && kind !== 'expired' && kind !== 'ground') this.stats.hit++;
    const L = this._last;
    L.kind = kind; L.t = p.hitT >= 0 ? p.hitT : p.t; L.x = p.x; L.z = p.z; L.flown = p.flown; L.by = p.shooter?.id ?? null; L.id = p.id; L.drop = 1.45 - p.y;
    this.last = L;
    p.hitKind = kind;
    p.live = false; this.live--;
    p.show = p.tracer ? (p.read ? R.fade : B.fade) : 0;
  }

  // ---- the streaks ----------------------------------------------------------------------------------------------------
  // A tracer round draws from max(muzzle, head - its length) to its head: out of the muzzle it grows, then it runs.
  // Its length is how far it flies in B.streakT at the speed it has now (capped by the row): a slow round barely streaks.
  // A round at the player (p.read) draws at least SHOT_READ.minLen and up to sp x lenT (capped at maxLen): short, but seen.
  streakLen(p) {
    const own = Math.min(p.row.tracerLen, p.sp * B.streakT), flown = Math.hypot(p.x - p.mx, p.z - p.mz);
    return Math.min(p.read ? Math.max(own, Math.min(R.maxLen, Math.max(R.minLen, p.sp * R.lenT))) : own, flown);
  }
  draw(dt) {
    if (!this.live && !this.drawn) return;
    const g = this.g, up = g.fx?.ground ? g.fx : null;
    let drawn = 0;
    for (let i = 0; i < this.cap; i++) {
      const p = this.pool[i];
      let on = p.tracer && (p.live || p.show > 0) && !p.ghost;
      if (!p.live && p.show > 0) { p.show -= dt; if (p.show <= 0) on = false; }
      if (!on) { if (p._drawn) { this.mesh.setMatrixAt(i, ZERO); p._drawn = false; } continue; }
      const back = this.streakLen(p);
      const ax = p.x - p.dx * back, az = p.z - p.dz * back;
      const y = up ? up.up(p.x, p.y + p.fy, p.z) : p.y + p.fy;
      _o.position.set((ax + p.x) / 2, y, (az + p.z) / 2);
      _o.rotation.set(0, Math.atan2(p.dx, p.dz), 0);
      const w = p.row.tracerW * (p.read ? R.wMul : 1);
      _o.scale.set(w, w, Math.max(0.05, back));
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
      p._drawn = true; drawn++;
    }
    if (drawn || this.drawn) this.mesh.instanceMatrix.needsUpdate = true;
    this.drawn = drawn;
  }

  // Everything gone (a fresh start, a load).
  clear() {
    for (const p of this.pool) { p.live = false; p.show = 0; }
    this.live = 0;
    this.draw(0);
  }

  view() {
    return {
      on: this.on, live: this.live, cap: this.cap, clock: +this.clock.toFixed(3), stats: { ...this.stats },
      rows: Object.fromEntries(Object.entries(ROUNDS).map(([k, r]) => [k, { ...r, supersonic: r.velocity > B.sound, maxRange: r.drag > 0 ? Math.round(r.velocity / r.drag) : null, t30: this.flightTime(k, 30), t300: this.flightTime(k, 300), drop100: this.dropAt(k, 100) }])),
      laws: { ...B }, last: this.last ? { ...this.last } : null, shots: this.record(6),
    };
  }
}
