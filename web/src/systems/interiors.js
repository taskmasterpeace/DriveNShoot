import * as THREE from 'three';
import { RAY_SOLID, RAY_SIGHT, RAY_BULLET } from '../engine/collision.js';
import { DOOR, DOOR_MATERIALS, WINDOW } from '../data/interiors.js';
import { glassMaterial } from './carcombat.js';
import { windowGlassTexture } from '../world/textures.js';

// Doors and windows of every enterable building, for close-quarters fights.
//
// DOORS hang real leaves in the gaps world/city.js leaves (a shop's double door, a single back or
// inner door). A leaf swings when someone walks or drives into it, keeps its angle (damped, no
// spring), and while it is near closed it blocks sight and bullets; it always blocks movement. Swung
// fast into a person it knocks them down (the door bash). Some back and inner doors start LOCKED: they
// don't swing for anyone, nobody's path runs through them, and the player kicks them in (2-3 loud
// kicks), shoots the lock off, or a blast blows them.
// WINDOWS are glass in a sill-height gap of an outer wall. Intact glass stops walkers and bullets but
// not sight; rounds crack it, then shatter it (the car-glass look and sound); a broken window is
// climbed through (slowly; a dive goes straight through, even through intact glass) or boarded up,
// and boards stop sight and most rounds until heavy damage breaks them.
//
// Every leaf and window is an `op` in the StaticWorld's spatial hash, so movement, sight, bullets and
// throws meet them through the queries the game already makes. One InstancedMesh each for leaves (and
// padlocks), glass panes and boards. Only doors near the player and in motion are simulated.

const HT = DOOR.thick / 2;
const _o = new THREE.Object3D(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _p = { x: 0, z: 0 };
const r1 = (v) => Math.round(v * 10) / 10;
const frac = (v) => v - Math.floor(v);

export class Interiors {
  constructor(game) {
    this.g = game;
    this.dt = 1 / 60;
    this.nx = 0; this.nz = 0;          // normal of the last ray hit (StaticWorld reads it)
    this.doors = []; this.leaves = []; this.windows = [];
    this.byId = new Map();
    this.active = [];                  // leaves in motion near the player
    this.dirty = [];                   // leaves whose instance matrix needs writing
    this.hold = 0; this.holdOn = null; // interact key held at a window (tap = climb, hold = board)
    this.ring = { x: 0, z: 0, len: 2.2 };
    const statics = game.statics;
    const world = game.world;

    // ---- doors ----------------------------------------------------------------------------------
    for (const row of world.doors) {
      const mat = DOOR_MATERIALS[row.material] ?? DOOR_MATERIALS.wood;
      const ux = row.axis === 'x' ? 1 : 0, uz = row.axis === 'x' ? 0 : 1;
      const door = {
        id: row.id, row, kind: row.kind, x: row.x, z: row.z, axis: row.axis, ux, uz, nx: row.nx, nz: row.nz, width: row.width,
        material: row.material, mat, color: row.color, locked: !!row.locked, lockHp: mat.lockHp, kicks: mat.kicks,
        bi: row.b, leaves: [], lockX: row.x, lockZ: row.z, nav: null, lockSlot: -1,
      };
      const half = row.width / 2;
      // Hinges sit just inside each end of the opening, so an open leaf clears the wall's face.
      const ends = row.leaves === 2 ? [-1, 1] : [row.hinge];
      for (const e of ends) {
        const len = row.leaves === 2 ? half - 0.08 : row.width - 0.1;
        const hx = row.x + ux * e * (half - 0.06), hz = row.z + uz * e * (half - 0.06);
        // Closed, the leaf points from its hinge into the opening.
        const phi0 = Math.atan2(-uz * e, -ux * e);
        const L = { kind: 'leaf', door, hx, hz, phi0, len, th: 0, w: 0, slot: this.leaves.length, dx: 1, dz: 0, px: 0, pz: 1,
          pusher: null, pushT: -9, jamT: 0, active: false, isDirty: false, th0: 0 };
        door.leaves.push(L);
        this.leaves.push(L);
        statics.addOp(L, hx - len - 0.2, hz - len - 0.2, hx + len + 0.2, hz + len + 0.2, DOOR.height);
      }
      if (row.leaves === 1) { const L = door.leaves[0]; door.lockX = L.hx + Math.cos(L.phi0) * (L.len - 0.12); door.lockZ = L.hz + Math.sin(L.phi0) * (L.len - 0.12); }
      // Ruins hang some doors ajar (split between the leaves of a double door).
      door.leaves.forEach((L, k) => { L.th0 = L.th = (row.open ?? 0) * (k ? -0.8 : 1); this.orient(L); });
      this.doors.push(door);
      this.byId.set(door.id, door);
    }

    // ---- windows --------------------------------------------------------------------------------
    for (const row of world.windows) {
      const ux = row.axis === 'x' ? 1 : 0, uz = row.axis === 'x' ? 0 : 1;
      const W = {
        kind: 'window', id: row.id, row, x: row.x, z: row.z, axis: row.axis, ux, uz, nx: row.nx, nz: row.nz, width: row.width, half: row.width / 2,
        ax: row.x - ux * row.width / 2, az: row.z - uz * row.width / 2, state: row.state, hp: row.state === 'intact' ? WINDOW.hp : 0,
        boardHp: row.state === 'boarded' ? WINDOW.boardHp : 0, boardSide: row.boardSide ?? -1, hits: 0, slot: this.windows.length, bi: row.b, planks: row.state === 'boarded' ? 3 : 0,
        roll: [frac(row.x * 7.3 + row.z * 3.1) * 0.3 - 0.15, frac(row.x * 1.7 + row.z * 9.7) * 0.3 - 0.15, frac(row.x * 5.1 + row.z * 2.3) * 0.3 - 0.15], // planks nailed up crooked
      };
      this.windows.push(W);
      this.byId.set(W.id, W);
      // Its entry covers the opening and the sill's faces: what a mover pressing against it overlaps.
      statics.addOp(W, row.x - ux * (W.half + 0.1) - uz * 0.5, row.z - uz * (W.half + 0.1) - ux * 0.5, row.x + ux * (W.half + 0.1) + uz * 0.5, row.z + uz * (W.half + 0.1) + ux * 0.5, WINDOW.top);
    }

    this.buildMeshes(game.scene);
    statics.ops = this;
    for (const d of this.doors) if (d.locked) this.navBlock(d, true);
  }

  // ---- geometry -----------------------------------------------------------------------------------
  // Recompute a leaf's direction (dx,dz), its swing direction (px,pz: where it moves as th grows) and
  // queue its instance matrix.
  orient(L) {
    const a = L.phi0 + L.th, c = Math.cos(a), s = Math.sin(a);
    L.dx = c; L.dz = s; L.px = -s; L.pz = c;
    if (!L.isDirty) { L.isDirty = true; this.dirty.push(L); }
  }

  wake(L) { if (!L.active) { L.active = true; this.active.push(L); } }

  // ---- StaticWorld hooks (hot: no allocation) -------------------------------------------------------
  circle(op, p, r, mover) {
    if (op.kind === 'leaf') return this.leafCircle(op, p, r, mover);
    if (mover) this.windowTouch(op, p, r, mover);
    return 0; // the sill (a static box) is what stops you
  }

  leafCircle(L, p, r, mover) {
    const ex = p.x - L.hx, ez = p.z - L.hz;
    let s = ex * L.dx + ez * L.dz;
    if (s < 0) s = 0; else if (s > L.len) s = L.len;
    const qx = L.hx + L.dx * s, qz = L.hz + L.dz * s;
    let nx = p.x - qx, nz = p.z - qz;
    const R = r + HT, d2 = nx * nx + nz * nz;
    if (d2 >= R * R) return 0;
    const side = ex * L.px + ez * L.pz >= 0 ? 1 : -1; // the mover's side of the leaf
    const d = Math.sqrt(d2);
    if (d > 1e-6) { nx /= d; nz /= d; } else { nx = L.px * side; nz = L.pz * side; }
    const pen = R - d, door = L.door;
    if (mover && !door.locked && L.jamT <= 0 && mover.alive !== false && !mover.dead) {
      // The leaf gives way: it turns away from the mover, who keeps most of their stride.
      const veh = mover.len !== undefined;
      const arm = s > 0.3 ? s : 0.3, broad = Math.abs(nx * L.px + nz * L.pz);
      let th = L.th - side * pen * (veh ? 1 : DOOR.yieldPerson) * broad / arm;
      if (th > DOOR.maxAngle) th = DOOR.maxAngle; else if (th < -DOOR.maxAngle) th = -DOOR.maxAngle;
      const got = th - L.th;
      if (got !== 0) {
        L.th = th; this.orient(L);
        const P = this.g.player;
        if (Math.abs(L.hx - P.x) < DOOR.simRadius && Math.abs(L.hz - P.z) < DOOR.simRadius) {
          // It keeps the speed it was shoved at: a sprint or a car flings it.
          let w = got / this.dt;
          if (w > DOOR.maxSpin) w = DOOR.maxSpin; else if (w < -DOOR.maxSpin) w = -DOOR.maxSpin;
          if (w * L.w <= 0 || Math.abs(w) > Math.abs(L.w)) L.w = w;
          this.wake(L);
        }
        L.pusher = veh ? (mover.driver ?? null) : mover; L.pushT = this.g.time;
      }
      const rem = pen - Math.abs(got) * arm * broad;
      if (rem > 0) { p.x += nx * rem; p.z += nz * rem; }
      return rem > 0 ? rem : 0;
    }
    if (mover && door.locked && mover.faction === 'zombie') this.bang(door, mover);
    p.x += nx * pen; p.z += nz * pen;
    return pen;
  }

  ray(op, x0, z0, dx, dz, maxT, mode) {
    if (op.kind === 'leaf') {
      if (mode !== RAY_SOLID && (op.th > DOOR.nearClosed || op.th < -DOOR.nearClosed)) return Infinity;
      return this.segRay(op.hx, op.hz, op.dx, op.dz, op.len, x0, z0, dx, dz, maxT);
    }
    const W = op;
    if (W.state === 'shattered') return Infinity;
    if (mode === RAY_SIGHT && W.state === 'intact') return Infinity; // glass: seen through
    const t = this.segRay(W.ax, W.az, W.ux, W.uz, W.width, x0, z0, dx, dz, maxT);
    // Every Nth round finds a gap between the planks.
    if (t < maxT && mode === RAY_BULLET && W.state === 'boarded' && ++W.hits % WINDOW.leakEvery === 0) return Infinity;
    return t;
  }

  // Ray vs a segment from (ax,az) along unit (ux,uz) for len. Sets this.nx/nz (facing the ray) on a hit.
  segRay(ax, az, ux, uz, len, x0, z0, dx, dz, maxT) {
    const den = dx * uz - dz * ux;
    if (den > -1e-9 && den < 1e-9) return Infinity;
    const ex = ax - x0, ez = az - z0;
    const t = (ex * uz - ez * ux) / den;
    if (t < 0 || t > maxT) return Infinity;
    const s = (ex * dz - ez * dx) / den;
    if (s < 0 || s > len) return Infinity;
    let nx = -uz, nz = ux;
    if (nx * dx + nz * dz > 0) { nx = -nx; nz = -nz; }
    this.nx = nx; this.nz = nz;
    return t;
  }

  // A mover pressed against a window: climb through a broken one, claw at it if infected, smash it
  // with a car.
  windowTouch(W, p, r, mover) {
    const ex = p.x - W.x, ez = p.z - W.z;
    const along = ex * W.ux + ez * W.uz, across = ex * W.nx + ez * W.nz;
    if (along > W.half || along < -W.half || across > r + 0.4 || across < -r - 0.4) return;
    const g = this.g, side = across >= 0 ? 1 : -1; // +1: they stand outside
    if (mover.len !== undefined) {
      const sp = g.vehiclesSys.speed(mover);
      if (W.state === 'intact' && sp > 2) this.shatter(W, -W.nx * side, -W.nz * side, mover.driver ?? null);
      else if (W.state === 'boarded' && sp > 6) this.damageBoards(W, 9999, mover.driver ?? null);
      return;
    }
    if (mover.alive === false || mover.vault || mover.knockT > 0) return;
    if (mover.dive > 0.2) {
      // Diving into a window: straight through. Intact glass cuts you on the way.
      if (W.state === 'intact') {
        this.shatter(W, -W.nx * side, -W.nz * side, mover);
        g.combat.damage(mover, WINDOW.diveCut, null, -W.nx * side, -W.nz * side, 'glass');
      }
      if (W.state === 'shattered') this.startVault(mover, W, side, 0.35);
      return;
    }
    if (W.state === 'shattered') {
      if (mover !== g.player && !mover.target && !mover.ztarget) return; // wanderers don't climb
      if (mover._vw !== W || g.time - mover._vwT > 0.1) { mover._vw = W; mover._vwP = 0; }
      mover._vwT = g.time; mover._vwP += this.dt;
      if (mover._vwP >= WINDOW.vaultPush) this.startVault(mover, W, side, WINDOW.vaultTime);
    } else if (mover.faction === 'zombie') {
      mover.stuck = 0; // working at it, not stuck: no detour along the wall
      mover._claw = (mover._claw ?? 0) + this.dt;
      if (mover._claw >= WINDOW.clawEvery) {
        mover._claw = 0;
        if (W.state === 'intact') this.damageGlass(W, WINDOW.clawGlass, -W.nx * side, -W.nz * side, mover);
        else this.damageBoards(W, WINDOW.clawBoards, mover);
      }
    }
  }

  // The infected beat on a locked door until the lock gives.
  bang(door, z) {
    const g = this.g;
    z.stuck = 0; // beating on it, not stuck: no detour along the wall
    z._bang = (z._bang ?? 0) + this.dt;
    if (z._bang < 1.1) return;
    z._bang = 0;
    door.lockHp -= 6;
    g.audio.thud?.(g.pan(door.x));
    if (door.lockHp <= 0) this.unlock(door, 'battered', z, true);
  }

  // ---- simulation ---------------------------------------------------------------------------------
  update(dt) {
    if (!(dt > 0)) return;
    this.dt = dt;
    const g = this.g, P = g.player, time = g.time, A = this.active;
    for (let i = A.length - 1; i >= 0; i--) {
      const L = A[i];
      L.jamT -= dt;
      const far = Math.abs(L.hx - P.x) > DOOR.simRadius || Math.abs(L.hz - P.z) > DOOR.simRadius;
      if (far || (L.w < 0.03 && L.w > -0.03 && time - L.pushT > 0.4)) {
        L.w = 0; L.active = false; A[i] = A[A.length - 1]; A.pop();
        continue;
      }
      if (L.w === 0) continue;
      const prev = L.th;
      let th = L.th + L.w * dt;
      if (th > DOOR.maxAngle || th < -DOOR.maxAngle) {
        // Hits its stop: a bang, a little bounce back.
        th = th > 0 ? DOOR.maxAngle : -DOOR.maxAngle;
        if (Math.abs(L.w) > 4 && Math.abs(L.hx - P.x) + Math.abs(L.hz - P.z) < 40) g.audio.thud?.(g.pan(L.hx));
        L.w = -L.w * 0.18;
      }
      L.w *= Math.exp(-DOOR.damping * dt);
      L.th = th; this.orient(L);
      if (L.w > 0.5 || L.w < -0.5) this.sweep(L, prev);
    }
    this.flush();
  }

  // The swinging leaf meets whoever stands in its way: fast enough, they go down (the door bash);
  // slow, it shoves them along, or stops against them if they can't give.
  sweep(L, prev) {
    const g = this.g, reach = L.len + 0.6, time = g.time;
    for (let i = 0; i < g.chars.length; i++) {
      const c = g.chars[i];
      if (!c.alive || c.inVehicle || c.vault || c.hidden) continue;
      const ex = c.x - L.hx, ez = c.z - L.hz;
      if (ex > reach || ex < -reach || ez > reach || ez < -reach) continue;
      let s = ex * L.dx + ez * L.dz;
      if (s < -0.1 || s > L.len + 0.15) continue;
      const off = ex * L.px + ez * L.pz, rr = (c.radius ?? 0.4) + HT;
      if (off >= rr || off <= -rr) continue;
      if ((L.w > 0) !== (off > 0)) continue; // behind the swing: the pusher's side
      if (c === L.pusher && time - L.pushT < 0.5) continue;
      if (s < 0.2) s = 0.2; else if (s > L.len) s = L.len;
      const speed = Math.abs(L.w) * s, sg = L.w > 0 ? 1 : -1;
      if (speed > DOOR.bashSpeed && !(c.knockT > 0) && (c.knockCool ?? 0) <= time) { this.bash(L, c, speed, sg); continue; }
      const need = rr - Math.abs(off) + 0.01;
      _p.x = c.x + L.px * sg * need; _p.z = c.z + L.pz * sg * need;
      g.statics.resolveCircle(_p, c.radius ?? 0.4);
      const ox = _p.x - L.hx, oz = _p.z - L.hz, still = ox * L.px + oz * L.pz;
      if (still < rr && still > -rr && ox * L.dx + oz * L.dz < L.len) { L.th = prev; this.orient(L); L.w = 0; L.jamT = 0.2; return; }
      c.x = _p.x; c.z = _p.z;
    }
  }

  bash(L, c, speed, sg) {
    const g = this.g;
    const by = L.pusher && g.time - L.pushT < 1.5 && L.pusher !== c ? L.pusher : null;
    _p.x = c.x + L.px * sg * 0.75; _p.z = c.z + L.pz * sg * 0.75;
    g.statics.resolveCircle(_p, c.radius ?? 0.4);
    c.x = _p.x; c.z = _p.z;
    c.face = Math.atan2(-L.px * sg, -L.pz * sg); // facing the door, so they go over backwards
    this.knockDown(c, DOOR.knockDown);
    g.combat.damage(c, DOOR.bashDamage, by, L.px * sg, L.pz * sg, 'bash');
    L.w *= -0.25; // the leaf bounces off the body
    g.audio.thud?.(g.pan(c.x)); g.audio.hit?.();
    g.noise(c.x, c.z, 14, by ?? c);
    if (Math.abs(c.x - g.player.x) + Math.abs(c.z - g.player.z) < 30) g.hud.shake(0.35);
    if (c === g.player) g.hud.toast('DOOR TO THE FACE', 'hot');
    g.emit('doorBash', { door: L.door.id, victim: c.id, victimName: c.npc?.name ?? c.name, by: by?.id ?? null, speed: r1(speed) });
  }

  knockDown(c, secs) {
    c.knockT = secs; c.knockMax = secs; c.knockCool = this.g.time + secs + 0.6;
    c.dive = 0; c.vault = null; c.vaultY = 0; c.speed = 0; c.aiming = false; c.leapT = 0;
  }

  // Climbing through a broken window: across the sill in `dur` seconds, no shooting on the way.
  startVault(c, W, side, dur) {
    const r = c.radius ?? 0.4, ex = c.x - W.x, ez = c.z - W.z;
    let along = ex * W.ux + ez * W.uz;
    const lim = W.half - r * 0.6; if (along > lim) along = lim; else if (along < -lim) along = -lim;
    const out = 0.25 + r + 0.3;
    c.vault = { w: W.id, t: 0, dur, x0: c.x, z0: c.z, x1: W.x + W.ux * along - W.nx * side * out, z1: W.z + W.uz * along - W.nz * side * out };
    c._vwP = 0; c.dive = 0; c.speed = 0;
    this.g.audio.throwWhoosh?.(this.g.pan(c.x));
  }

  stepVault(c, dt) {
    const v = c.vault;
    v.t += dt;
    const k = Math.min(1, v.t / v.dur), e = k * k * (3 - 2 * k);
    c.x = v.x0 + (v.x1 - v.x0) * e; c.z = v.z0 + (v.z1 - v.z0) * e;
    c.vaultY = Math.sin(Math.PI * k) * 0.5;
    c.speed = 0; c.aiming = false; c.walk += dt * 2;
    if (k >= 1) { c.vault = null; c.vaultY = 0; this.g.emit('vaulted', { id: c.id, window: v.w, x: r1(c.x), z: r1(c.z) }); }
  }

  // ---- damage -------------------------------------------------------------------------------------
  onBullet(op, hx, hz, dx, dz, dmg, shooter) {
    const g = this.g;
    if (op.kind === 'leaf') {
      const L = op, door = L.door, metal = door.material === 'metal';
      if (metal) g.fx.sparks(hx, 1.3, hz, -dx, -dz, 4);
      else for (let k = 0; k < 5; k++) g.fx.spawn(3, hx - dx * 0.1, 1 + Math.random() * 0.8, hz - dz * 0.1, -dx * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, -dz * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2, 0.7, 0.05 + Math.random() * 0.05, '#8a6a44', 18);
      if (metal) g.audio.ricochet?.(g.pan(hx), Math.hypot(hx - g.player.x, hz - g.player.z)); else g.audio.thud?.(g.pan(hx));
      if (door.locked) {
        // Rounds into the lock (or near it) break it.
        const near = Math.hypot(hx - door.lockX, hz - door.lockZ) < 0.6;
        door.lockHp -= dmg * (near ? 1 : 0.4);
        g.emit('lockHit', { door: door.id, lockHp: Math.max(0, Math.round(door.lockHp)), by: shooter?.id ?? null });
        if (door.lockHp <= 0) {
          // The lock's shot off: the door swings ajar the way the rounds were going.
          this.unlock(door, 'shot', shooter, false);
          for (const l of door.leaves) { l.w = (dx * l.px + dz * l.pz > 0 ? 1 : -1) * 1.6; l.pusher = shooter; l.pushT = g.time; this.wake(l); }
        }
        return;
      }
      // A round slaps the leaf: it flinches the way the bullet was going.
      L.w += (dx * L.px + dz * L.pz > 0 ? 1 : -1) * dmg * door.mat.bulletSlap;
      L.pushT = g.time; this.wake(L);
      return;
    }
    const W = op;
    if (W.state === 'intact') this.damageGlass(W, dmg, dx, dz, shooter);
    else if (W.state === 'boarded') this.damageBoards(W, dmg * WINDOW.boardBulletMul, shooter, hx, hz, dx, dz);
  }

  damageGlass(W, dmg, dx, dz, by) {
    const g = this.g;
    if (W.state !== 'intact') return;
    W.hp -= dmg;
    if (W.hp <= 0) { this.shatter(W, dx, dz, by); return; }
    for (let k = 0; k < 4; k++) g.fx.spawn(1, W.x, 1.5 + Math.random() * 0.6, W.z, dx * 2 + (Math.random() - 0.5) * 2, 1 + Math.random(), dz * 2 + (Math.random() - 0.5) * 2, 0.5, 0.04, '#cfe6ee', 18);
    g.audio.clink?.(g.pan(W.x));
    this.syncGlass(W);
    g.emit('windowCracked', { window: W.id, crack: +(1 - W.hp / WINDOW.hp).toFixed(2), by: by?.id ?? null });
  }

  // The car glass's shatter, at building scale: shards fly with the blow, glitter on both sides.
  shatter(W, dx, dz, by) {
    const g = this.g;
    if (W.state === 'shattered') return;
    const was = W.state;
    W.state = 'shattered'; W.hp = 0; W.boardHp = 0;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    for (let i = 0; i < 22; i++) {
      const a = (Math.random() - 0.5) * W.width;
      g.fx.spawn(1, W.x + W.ux * a, WINDOW.sill + Math.random() * (WINDOW.top - WINDOW.sill), W.z + W.uz * a, dx * (2 + Math.random() * 5) + (Math.random() - 0.5) * 3, 0.5 + Math.random() * 3, dz * (2 + Math.random() * 5) + (Math.random() - 0.5) * 3, 0.9, 0.06, Math.random() < 0.5 ? '#cfe6ee' : '#9fc2d0', 18);
    }
    for (const k of [0.7, -0.5]) g.fx.decal(W.x + dx * k, W.z + dz * k, 0.55, '#8f9ea4'); // glass on the floor
    g.audio.glass?.(g.pan(W.x));
    g.noise(W.x, W.z, WINDOW.smashNoise, by ?? null);
    this.syncGlass(W); this.syncBoards(W);
    g.emit('windowShattered', { window: W.id, by: by?.id ?? null, was });
  }

  damageBoards(W, dmg, by, hx = W.x, hz = W.z, dx = 0, dz = 0) {
    const g = this.g;
    if (W.state !== 'boarded') return;
    W.boardHp -= dmg;
    for (let k = 0; k < 4; k++) g.fx.spawn(3, hx, 1.2 + Math.random(), hz, -dx * 2 + (Math.random() - 0.5) * 3, 1 + Math.random() * 2, -dz * 2 + (Math.random() - 0.5) * 3, 0.8, 0.06 + Math.random() * 0.06, '#7a5a3a', 18);
    g.audio.thud?.(g.pan(W.x));
    if (W.boardHp <= 0) {
      W.boardHp = 0; W.state = 'shattered';
      for (let k = 0; k < 10; k++) g.fx.spawn(3, W.x, 1.6, W.z, (Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6, 1.4, 0.12 + Math.random() * 0.1, '#6b4e30', 20);
      g.noise(W.x, W.z, WINDOW.smashNoise, by ?? null);
      g.emit('boardsBroken', { window: W.id, by: by?.id ?? null });
    } else g.emit('boardsHit', { window: W.id, boardHp: Math.round(W.boardHp), by: by?.id ?? null });
    this.syncBoards(W); this.syncGlass(W);
  }

  board(W, side, by = null) {
    W.state = 'boarded'; W.boardHp = WINDOW.boardHp; W.boardSide = side >= 0 ? 1 : -1; W.hits = 0;
    this.syncBoards(W); this.syncGlass(W);
    this.g.audio.thud?.(this.g.pan(W.x));
    this.g.emit('windowBoarded', { window: W.id, by: by?.id ?? null, side: W.boardSide > 0 ? 'outside' : 'inside' });
  }

  unboard(W, by = null) {
    if (W.state !== 'boarded') return;
    W.state = 'shattered'; W.boardHp = 0;
    this.syncBoards(W); this.syncGlass(W);
    this.g.emit('windowUnboarded', { window: W.id, by: by?.id ?? null });
  }

  // A thrown thing meets a door or window: glass breaks and lets it through (a molotov through the
  // front window), boards and leaves bounce it. Returns true if it carries on.
  thrownHit(op, p, ux, uz) {
    if (op.kind === 'window') {
      if (op.state === 'intact') { this.shatter(op, ux, uz, p.owner ?? null); return true; }
      if (op.state === 'boarded') this.damageBoards(op, 8, p.owner ?? null);
      return false;
    }
    op.w += (ux * op.px + uz * op.pz > 0 ? 1 : -1) * 1.2; op.pushT = this.g.time; this.wake(op);
    return false;
  }

  // Grenades, car bombs: glass goes, boards splinter, doors fly, locks give.
  blast(x, z, r, by) {
    const R = r + 2;
    for (const W of this.windows) {
      const dx = W.x - x, dz = W.z - z;
      if (dx > R || dx < -R || dz > R || dz < -R) continue;
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      const f = 1 - d / R;
      if (W.state === 'intact') this.shatter(W, dx, dz, by);
      else if (W.state === 'boarded') this.damageBoards(W, 260 * f, by);
    }
    for (const door of this.doors) {
      const dx = door.x - x, dz = door.z - z;
      if (dx > R || dx < -R || dz > R || dz < -R) continue;
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      const f = 1 - d / R;
      if (door.locked) { door.lockHp -= 140 * f; if (door.lockHp <= 0) this.unlock(door, 'blast', by, true, x, z); continue; }
      for (const L of door.leaves) {
        const side = (x - L.hx) * L.px + (z - L.hz) * L.pz >= 0 ? 1 : -1;
        L.w -= side * 12 * f; L.pusher = by; L.pushT = this.g.time; this.wake(L);
      }
    }
  }

  // ---- locks & kicks ------------------------------------------------------------------------------
  // One kick: a locked door takes its material's 2-3, then bursts; an unlocked one flies open.
  kick(door, by) {
    const g = this.g;
    const t = g.time;
    if ((by.kickAt ?? -9) > t) return { kicked: false, wait: +(by.kickAt - t).toFixed(2) };
    by.kickAt = t + DOOR.kickCool;
    g.audio.thud?.(g.pan(door.x)); g.audio.burst?.({ dur: 0.25, freq: 260, vol: 0.7, decay: 0.22, pitchDrop: 0.5, pan: g.pan(door.x) });
    g.noise(door.x, door.z, DOOR.kickNoise, by);
    g.fx.dust(door.x, door.z, 2);
    if (by === g.player) g.hud.shake(0.3);
    let burst = !door.locked;
    if (door.locked) {
      door.kicks--;
      door.lockHp -= door.mat.lockHp / door.mat.kicks;
      if (door.kicks <= 0) { this.unlock(door, 'kicked', by, false); burst = true; }
    }
    g.emit('doorKick', { door: door.id, by: by.id, locked: door.locked, kicksLeft: door.locked ? door.kicks : 0 });
    if (burst) this.fling(door, by.x, by.z, by, DOOR.kickSpin);
    return { kicked: true, locked: door.locked, kicksLeft: door.locked ? door.kicks : 0, burst };
  }

  // Swing every leaf away from (fromX, fromZ) at `spin` rad/s.
  fling(door, fromX, fromZ, by, spin) {
    for (const L of door.leaves) {
      const side = (fromX - L.hx) * L.px + (fromZ - L.hz) * L.pz >= 0 ? 1 : -1;
      L.w = -side * spin; L.pusher = by; L.pushT = this.g.time; L.jamT = 0;
      this.wake(L);
    }
  }

  unlock(door, how, by, burst, fromX = by?.x ?? door.x, fromZ = by?.z ?? door.z) {
    if (!door.locked) return;
    door.locked = false; door.lockHp = 0; door.kicks = 0;
    this.navBlock(door, false);
    this.syncLock(door);
    for (let k = 0; k < 8; k++) this.g.fx.spawn(3, door.lockX, 1.1, door.lockZ, (Math.random() - 0.5) * 5, 1 + Math.random() * 3, (Math.random() - 0.5) * 5, 1, 0.07, door.material === 'metal' ? '#4a4a48' : '#7a5a3a', 18);
    this.g.emit('doorUnlocked', { door: door.id, how, by: by?.id ?? null });
    if (burst) this.fling(door, fromX, fromZ, by, DOOR.kickSpin);
  }

  setLocked(door, on) {
    if (on) {
      for (const L of door.leaves) { L.th = 0; L.w = 0; this.orient(L); }
      door.locked = true; door.lockHp = door.mat.lockHp; door.kicks = door.mat.kicks;
      this.navBlock(door, true);
    } else { door.locked = false; this.navBlock(door, false); }
    this.syncLock(door);
    this.flush();
  }

  // Nobody's walking route runs through a locked door: its opening is blocked on the foot nav grid
  // until the lock gives (only cells the walls left open, and only those, are restored).
  navBlock(door, on) {
    const n = this.g.nav?.foot;
    if (!n) return;
    if (!on) { if (door.nav) for (const i of door.nav) if (n.blocked[i] === 3) n.blocked[i] = 0; door.nav = null; return; }
    if (door.nav) return;
    door.nav = [];
    const half = door.width / 2 + 0.1, across = 0.25 + n.radius;
    const x0 = n.ci(door.x - 2), x1 = n.ci(door.x + 2), z0 = n.ci(door.z - 2), z1 = n.ci(door.z + 2);
    for (let zc = z0; zc <= z1; zc++) for (let xc = x0; xc <= x1; xc++) {
      const wx = n.wx(xc) - door.x, wz = n.wx(zc) - door.z;
      const along = wx * door.ux + wz * door.uz, acr = wx * door.nx + wz * door.nz;
      if (along > half || along < -half || acr > across || acr < -across) continue;
      const i = zc * n.n + xc;
      if (!n.blocked[i]) { n.blocked[i] = 3; door.nav.push(i); }
    }
  }

  // ---- the player's interact key ----------------------------------------------------------------
  // Nearest door or window the interact key would act on (within reach, in front of it).
  nearest(p) {
    let best = null, bd = 1.9;
    const S = this.g.statics, x0 = S.ci(p.x - 2), x1 = S.ci(p.x + 2), z0 = S.ci(p.z - 2), z1 = S.ci(p.z + 2);
    const stamp = ++S.stamp;
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const list = S.cells[cz * S.n + cx];
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (!b.op || b.mark === stamp) continue;
        b.mark = stamp;
        const op = b.op;
        if (op.kind === 'leaf') {
          const door = op.door;
          if (door._seen === stamp) continue;
          door._seen = stamp;
          let shut = true;
          for (const L of door.leaves) if (L.th > 0.3 || L.th < -0.3) shut = false;
          if (!shut && !door.locked) continue;
          const d = Math.hypot(p.x - door.x, p.z - door.z);
          if (d < bd) { bd = d; best = door; }
        } else {
          const ex = p.x - op.x, ez = p.z - op.z, along = ex * op.ux + ez * op.uz, across = ex * op.nx + ez * op.nz;
          if (along > op.half + 0.3 || along < -op.half - 0.3 || across > 1.5 || across < -1.5) continue;
          const d = Math.hypot(ex, ez) - 0.25;
          if (d < bd) { bd = d; best = op; }
        }
      }
    }
    return best;
  }

  // Called by the player update when no person or vehicle claims the key. Shows the prompt, drives
  // the ring, and acts: kick a door, smash glass, tap to climb through / hold to board a broken
  // window, hold to pull boards off. Returns the ring target or null.
  playerInteract(p, I, dt) {
    const g = this.g, t = this.nearest(p);
    const down = I.key('KeyE'), hit = I.hit('KeyE');
    if (!t) { this.hold = 0; this.holdOn = null; return null; }
    if (this.holdOn !== t) { this.hold = 0; this.holdOn = t; }
    const ring = this.ring;
    if (t.leaves) {
      ring.x = t.x; ring.z = t.z; ring.len = 2.4;
      g.hud.prompt(t.locked ? `<kbd>E</kbd> Kick the door in · locked (${t.kicks} more)` : '<kbd>E</kbd> Kick the door open');
      if (hit) this.kick(t, p);
      return ring;
    }
    const W = t, side = (p.x - W.x) * W.nx + (p.z - W.z) * W.nz >= 0 ? 1 : -1;
    ring.x = W.x + W.nx * side * 0.4; ring.z = W.z + W.nz * side * 0.4; ring.len = 2.2;
    if (W.state === 'intact') {
      g.hud.prompt('<kbd>E</kbd> Smash the glass');
      if (hit) { this.shatter(W, -W.nx * side, -W.nz * side, p); this.hold = -1; } // -1: this press is spent
      return ring;
    }
    if (W.state === 'shattered') {
      if (down && this.hold >= 0) {
        this.hold += dt;
        const k = (this.hold - WINDOW.holdTap) / WINDOW.boardTime;
        if (k >= 1) { this.board(W, side, p); this.hold = -1; }
        g.hud.prompt(k > 0 ? `Boarding it up… ${Math.round(Math.min(1, k) * 100)}%` : '<kbd>E</kbd> Climb through · hold <kbd>E</kbd> Board it up');
        return ring;
      }
      if (!down && this.hold > 0 && this.hold < WINDOW.holdTap) this.startVault(p, W, side, WINDOW.vaultTime);
      if (!down) this.hold = 0;
      g.hud.prompt('<kbd>E</kbd> Climb through · hold <kbd>E</kbd> Board it up');
      return ring;
    }
    // Boarded.
    if (W.boardSide !== side) { g.hud.prompt('Boarded up from the other side'); this.hold = 0; return ring; }
    if (down && this.hold >= 0) {
      this.hold += dt;
      const k = this.hold / WINDOW.unboardTime;
      if (k >= 1) { this.unboard(W, p); this.hold = -1; }
      g.hud.prompt(`Pulling the boards off… ${Math.round(Math.min(1, k) * 100)}%`);
      return ring;
    }
    if (!down) this.hold = 0;
    g.hud.prompt('hold <kbd>E</kbd> Pull the boards off');
    return ring;
  }

  // ---- rendering ----------------------------------------------------------------------------------
  buildMeshes(scene) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const nd = this.doors.length, nl = this.leaves.length, nw = this.windows.length;
    // Leaves and padlocks: one mesh.
    // No shadow pass for leaves or boards: from the top-down camera it never reads, and each pass is a
    // draw call.
    this.leafMesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.18 }), Math.max(1, nl + nd));
    this.leafMesh.receiveShadow = true;
    for (const L of this.leaves) { this.leafMesh.setColorAt(L.slot, _c.set(L.door.color)); this.writeLeaf(L); }
    this.doors.forEach((d, k) => { d.lockSlot = nl + k; this.leafMesh.setColorAt(d.lockSlot, _c.set(d.mat.lock)); this.syncLock(d, true); });
    this.leafMesh.instanceColor.needsUpdate = true;
    this.leafMesh.computeBoundingSphere();
    scene.add(this.leafMesh);

    // Glass: the car glass's crack and shatter shader (clearer glass) on a thin slab, so it also
    // reads from straight above.
    const gGeo = new THREE.BoxGeometry(1, 1, 1);
    this.aCrack = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, nw)), 1);
    const shape = new Float32Array(Math.max(1, nw) * 2);
    for (let i = 0; i < nw; i++) shape[i * 2] = 1;
    gGeo.setAttribute('aCrack', this.aCrack);
    gGeo.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 2));
    const gMat = glassMaterial({ map: windowGlassTexture(), opacity: 0.5 });
    gMat.forceSinglePass = true; // a thin slab needs no back-faces-first pass: one draw call, not two
    this.glassMesh = new THREE.InstancedMesh(gGeo, gMat, Math.max(1, nw));
    this.glassMesh.renderOrder = 2;
    for (const W of this.windows) {
      _o.position.set(W.x, (WINDOW.sill + WINDOW.top) / 2, W.z);
      _o.rotation.set(0, W.axis === 'x' ? 0 : Math.PI / 2, 0);
      _o.scale.set(W.width - 0.04, WINDOW.top - WINDOW.sill, 0.1);
      _o.updateMatrix();
      this.glassMesh.setMatrixAt(W.slot, _o.matrix);
      this.syncGlass(W, true);
    }
    this.glassMesh.computeBoundingSphere();
    scene.add(this.glassMesh);

    // Boards: three planks a window, nailed across the side they were put up from. Packed: only planks
    // that are up are instances (re-packed when a window is boarded or its boards break).
    this.boardMesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.92 }), Math.max(1, nw * 3));
    this.boardMesh.receiveShadow = true;
    this.boardMesh.setColorAt(0, _c.set('#8a6a44'));
    this.packBoards();
    this.boardMesh.frustumCulled = false;
    scene.add(this.boardMesh);
  }

  packBoards() {
    const M = this.boardMesh, planks = ['#8a6a44', '#7a5a3a', '#94744c', '#6b4e30'];
    const yaw = (W) => (W.axis === 'x' ? 0 : -Math.PI / 2);
    let n = 0;
    for (const W of this.windows) {
      const up = W.state === 'boarded' ? Math.ceil(3 * W.boardHp / WINDOW.boardHp) : 0;
      for (let k = 0; k < up; k++) {
        const off = W.boardSide * 0.32;
        _o.position.set(W.x + W.nx * off, WINDOW.sill + 0.3 + k * 0.5, W.z + W.nz * off);
        _o.rotation.set(0, yaw(W), W.roll[k]);
        _o.scale.set(W.width + 0.5, 0.3, 0.12);
        _o.updateMatrix();
        M.setMatrixAt(n, _o.matrix);
        M.setColorAt(n, _c.set(planks[(W.slot + k) % planks.length]));
        n++;
      }
    }
    M.count = n;
    M.instanceMatrix.needsUpdate = true;
    M.instanceColor.needsUpdate = true;
  }

  writeLeaf(L) {
    _o.position.set(L.hx + L.dx * L.len / 2, DOOR.height / 2 + 0.03, L.hz + L.dz * L.len / 2);
    _o.rotation.set(0, Math.atan2(-L.dz, L.dx), 0);
    _o.scale.set(L.len, DOOR.height, DOOR.thick);
    _o.updateMatrix();
    this.leafMesh.setMatrixAt(L.slot, _o.matrix);
  }

  flush() {
    if (!this.dirty.length) return;
    for (const L of this.dirty) { this.writeLeaf(L); L.isDirty = false; }
    this.dirty.length = 0;
    this.leafMesh.instanceMatrix.needsUpdate = true;
  }

  // A locked door is chained shut: a rust-orange chain bar across the opening on its outer face, past
  // the frame onto the wall, so it reads from straight above. Gone (in pieces) once the lock is.
  syncLock(door, boot = false) {
    if (door.locked) {
      _o.position.set(door.x + door.nx * 0.32, 1.15, door.z + door.nz * 0.32);
      _o.rotation.set(0, door.axis === 'x' ? 0 : Math.PI / 2, 0);
      _o.scale.set(door.width + 0.5, 0.16, 0.14);
      _o.updateMatrix();
      this.leafMesh.setMatrixAt(door.lockSlot, _o.matrix);
    } else this.leafMesh.setMatrixAt(door.lockSlot, ZERO);
    if (!boot) this.leafMesh.instanceMatrix.needsUpdate = true;
  }

  syncGlass(W, boot = false) {
    // 0..1 the crack web spreading; 2 shot out (the shards still in the frame).
    this.aCrack.array[W.slot] = W.state === 'intact' ? 1 - W.hp / WINDOW.hp : 2;
    if (!boot) this.aCrack.needsUpdate = true;
  }

  // A window's boards changed (put up, splintered down a plank, torn off): re-pack the planks.
  syncBoards(W) {
    const up = W.state === 'boarded' ? Math.ceil(3 * W.boardHp / WINDOW.boardHp) : 0;
    if (up === W.planks) return;
    W.planks = up;
    if (this.boardMesh) this.packBoards();
  }

  // ---- agent views + save -------------------------------------------------------------------------
  doorView(d) {
    const p = this.g.player, b = this.g.world.buildings[d.bi];
    let widest = 0;
    for (const L of d.leaves) if (Math.abs(L.th) > Math.abs(widest)) widest = L.th;
    const a = Math.abs(widest);
    return {
      id: d.id, kind: d.kind, x: r1(d.x), z: r1(d.z), axis: d.axis, width: r1(d.width), leaves: d.leaves.length, material: d.material,
      locked: d.locked, state: a < 0.12 ? 'closed' : a < 1.2 ? 'ajar' : 'open', angle: Math.round((widest * 180) / Math.PI),
      angles: d.leaves.map((L) => Math.round((L.th * 180) / Math.PI)), moving: d.leaves.some((L) => L.w !== 0),
      kicksLeft: d.locked ? d.kicks : 0, lockHp: d.locked ? Math.max(0, Math.round(d.lockHp)) : 0,
      outside: d.kind === 'inner' ? null : { x: r1(d.x + d.nx * 2.5), z: r1(d.z + d.nz * 2.5) }, inside: d.kind === 'inner' ? null : { x: r1(d.x - d.nx * 2.5), z: r1(d.z - d.nz * 2.5) },
      kickFrom: { x: r1(d.x + d.nx * 1.3), z: r1(d.z + d.nz * 1.3) }, // within a boot's reach, on its outer (or +x) side
      building: b ? { x: r1((b.minX + b.maxX) / 2), z: r1((b.minZ + b.maxZ) / 2), name: b.shopName ?? null } : null,
      dist: r1(Math.hypot(d.x - p.x, d.z - p.z)),
    };
  }

  windowView(W) {
    const p = this.g.player;
    return {
      id: W.id, x: r1(W.x), z: r1(W.z), axis: W.axis, width: W.width, state: W.state === 'intact' && W.hp < WINDOW.hp ? 'cracked' : W.state,
      glassHp: Math.max(0, Math.round(W.hp)), crack: W.state === 'intact' ? +(1 - W.hp / WINDOW.hp).toFixed(2) : 1, boardHp: Math.round(W.boardHp),
      boardedFrom: W.state === 'boarded' ? (W.boardSide > 0 ? 'outside' : 'inside') : null,
      outside: { x: r1(W.x + W.nx * 2.2), z: r1(W.z + W.nz * 2.2) }, inside: { x: r1(W.x - W.nx * 2.2), z: r1(W.z - W.nz * 2.2) },
      dist: r1(Math.hypot(W.x - p.x, W.z - p.z)),
    };
  }

  // Only what changed from how the world was built.
  save() {
    const d = {}, w = {};
    for (const door of this.doors) {
      const moved = door.leaves.some((L) => Math.abs(L.th - L.th0) > 0.01);
      if (moved || door.locked !== !!door.row.locked || (door.locked && (door.kicks !== door.mat.kicks || door.lockHp !== door.mat.lockHp)))
        d[door.id] = { a: door.leaves.map((L) => +L.th.toFixed(3)), l: door.locked ? 1 : 0, h: Math.round(door.lockHp), k: door.kicks };
    }
    for (const W of this.windows)
      if (W.state !== W.row.state || (W.state === 'intact' && W.hp < WINDOW.hp) || (W.state === 'boarded' && W.boardHp < WINDOW.boardHp))
        w[W.id] = { s: W.state, hp: Math.round(W.hp), b: Math.round(W.boardHp), sd: W.boardSide };
    return { d, w };
  }

  load(s) {
    for (const door of this.doors) {
      const v = s?.d?.[door.id];
      door.leaves.forEach((L, k) => { L.th = v ? v.a[k] ?? 0 : L.th0; L.w = 0; L.jamT = 0; this.orient(L); });
      const locked = v ? !!v.l : !!door.row.locked;
      door.locked = locked; door.lockHp = locked ? v?.h ?? door.mat.lockHp : 0; door.kicks = locked ? v?.k ?? door.mat.kicks : 0;
      this.navBlock(door, false); if (locked) this.navBlock(door, true);
      this.syncLock(door);
    }
    for (const W of this.windows) {
      const v = s?.w?.[W.id];
      W.state = v ? v.s : W.row.state;
      W.hp = W.state === 'intact' ? v?.hp ?? WINDOW.hp : 0;
      W.boardHp = W.state === 'boarded' ? v?.b ?? WINDOW.boardHp : 0;
      W.boardSide = v?.sd ?? W.row.boardSide ?? -1; W.hits = 0;
      W.planks = W.state === 'boarded' ? Math.ceil(3 * W.boardHp / WINDOW.boardHp) : 0;
      this.syncGlass(W);
    }
    this.packBoards();
    for (const L of this.active) L.active = false;
    this.active.length = 0;
    this.flush();
  }
}
