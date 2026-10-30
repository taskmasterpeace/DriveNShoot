import * as THREE from 'three';
import { RAY_SOLID, RAY_SIGHT, RAY_BULLET } from '../engine/collision.js';
import { STEP } from '../engine/depthlayers.js';
import { DOOR, DOOR_MATERIALS, WINDOW, WINDOW_LOOK, WINDOW_MIX, RING_OPENINGS as RO } from '../data/interiors.js';
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
const drop = (arr, x) => { const i = arr.indexOf(x); if (i >= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); } };
const FRAME_N = 8; // frame pieces a ring window may need (frameItems)

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

    // ---- doors and windows: the island's at boot (the ring's attach near the player: ringScan) ------------------
    const reg = (op, x0, z0, x1, z1, h) => statics.addOp(op, x0, z0, x1, z1, h);
    for (const row of world.doors) this.makeDoor(row, reg, () => this.leaves.length);
    for (const row of world.windows) this.makeWindow(row, reg, this.windows.length);
    this.nIslandDoors = this.doors.length; this.nIslandLeaves = this.leaves.length; this.nIslandWindows = this.windows.length;
    // The ring's pool (data/interiors.js RING_OPENINGS): leaf and window slots after the island's, handed out and back.
    this.ringOpen = new Map();      // building id -> { doors, windows, boxes }
    this.ringState = new Map();     // opening id -> what happened to it (kept while its building is detached, and saved)
    this.ringT = 0;
    this.freeLeaf = []; this.freeWin = [];

    this.buildMeshes(game.scene);
    statics.ops = this;
    for (const d of this.doors) if (d.locked) this.navBlock(d, true);
  }

  // One door row: its leaves on their hinges, each an op registered by reg (the island grid, or the chunk ring).
  makeDoor(row, reg, slotOf) {
    const mat = DOOR_MATERIALS[row.material] ?? DOOR_MATERIALS.wood;
    const ux = row.axis === 'x' ? 1 : 0, uz = row.axis === 'x' ? 0 : 1;
    const door = {
      id: row.id, row, kind: row.kind, x: row.x, z: row.z, axis: row.axis, ux, uz, nx: row.nx, nz: row.nz, width: row.width,
      material: row.material, mat, color: row.color, locked: !!row.locked, lockHp: mat.lockHp, kicks: mat.kicks,
      bi: row.b, leaves: [], lockX: row.x, lockZ: row.z, nav: null, lockSlot: -1, boxes: [], y: row.y, // y: a door on raised ground (a settlement's pad, WEB_SITES_TERRAIN) or below the street
      broken: !!this.g.materials?.brokenDoors.has(row.id), // off its hinges for good (systems/materials.js)
    };
    const half = row.width / 2;
    // Hinges sit just inside each end of the opening, so an open leaf clears the wall's face.
    const ends = row.leaves === 2 ? [-1, 1] : [row.hinge];
    for (const e of ends) {
      const len = row.leaves === 2 ? half - 0.08 : row.width - 0.1;
      const hx = row.x + ux * e * (half - 0.06), hz = row.z + uz * e * (half - 0.06);
      // Closed, the leaf points from its hinge into the opening.
      const phi0 = Math.atan2(-uz * e, -ux * e);
      const L = { kind: 'leaf', door, hx, hz, phi0, len, th: 0, w: 0, slot: slotOf(), dx: 1, dz: 0, px: 0, pz: 1,
        pusher: null, pushT: -9, jamT: 0, active: false, isDirty: false, th0: 0 };
      door.leaves.push(L);
      this.leaves.push(L);
      door.boxes.push(reg(L, hx - len - 0.2, hz - len - 0.2, hx + len + 0.2, hz + len + 0.2, DOOR.height));
    }
    if (row.leaves === 1) { const L = door.leaves[0]; door.lockX = L.hx + Math.cos(L.phi0) * (L.len - 0.12); door.lockZ = L.hz + Math.sin(L.phi0) * (L.len - 0.12); }
    // Ruins hang some doors ajar (split between the leaves of a double door).
    door.leaves.forEach((L, k) => { L.th0 = L.th = (row.open ?? 0) * (k ? -0.8 : 1); this.orient(L); });
    this.doors.push(door);
    this.byId.set(door.id, door);
    return door;
  }

  makeWindow(row, reg, slot) {
    const ux = row.axis === 'x' ? 1 : 0, uz = row.axis === 'x' ? 0 : 1;
    const W = {
      kind: 'window', id: row.id, row, x: row.x, z: row.z, y: row.y ?? 0, axis: row.axis, ux, uz, nx: row.nx, nz: row.nz, width: row.width, half: row.width / 2,
      ax: row.x - ux * row.width / 2, az: row.z - uz * row.width / 2, state: row.state, hp: row.state === 'intact' ? WINDOW.hp : 0,
      boardHp: row.state === 'boarded' ? WINDOW.boardHp : 0, boardSide: row.boardSide ?? -1, hits: 0, slot, bi: row.b, planks: row.state === 'boarded' ? 3 : 0,
      roll: [frac(row.x * 7.3 + row.z * 3.1) * 0.3 - 0.15, frac(row.x * 1.7 + row.z * 9.7) * 0.3 - 0.15, frac(row.x * 5.1 + row.z * 2.3) * 0.3 - 0.15], // planks nailed up crooked
    };
    this.windows.push(W);
    this.byId.set(W.id, W);
    // Its entry covers the opening and the sill's faces: what a mover pressing against it overlaps.
    W.box = reg(W, row.x - ux * (W.half + 0.1) - uz * 0.5, row.z - uz * (W.half + 0.1) - ux * 0.5, row.x + ux * (W.half + 0.1) + uz * 0.5, row.z + uz * (W.half + 0.1) + ux * 0.5, WINDOW.top);
    return W;
  }

  // ---- geometry -----------------------------------------------------------------------------------
  // Recompute a leaf's direction (dx,dz), its swing direction (px,pz: where it moves as th grows) and
  // queue its instance matrix.
  orient(L) {
    const a = L.phi0 + L.th, c = Math.cos(a), s = Math.sin(a);
    L.dx = c; L.dz = s; L.px = -s; L.pz = c;
    if (!L.isDirty) { L.isDirty = true; this.dirty.push(L); }
  }

  wake(L) {
    if (L.active) return;
    L.active = true; this.active.push(L);
    // A shut leaf starting to swing is heard: its hinges, wood or steel (data/audiosets.js common door.open / door.metal).
    if (L.th < DOOR.nearClosed && L.th > -DOOR.nearClosed) this.g.audio?.sample?.('common', L.door?.mat?.name === 'steel door' ? 'door.metal' : 'door.open', { x: L.hx, z: L.hz, range: 35 });
  }

  // ---- StaticWorld hooks (hot: no allocation) -------------------------------------------------------
  circle(op, p, r, mover) {
    if (op.kind === 'leaf') return this.leafCircle(op, p, r, mover);
    if (mover) this.windowTouch(op, p, r, mover);
    return 0; // the sill (a static box) is what stops you
  }

  leafCircle(L, p, r, mover) {
    if (L.door.broken) return 0;
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
      if (rem > 0) {
        p.x += nx * rem; p.z += nz * rem;
        // A leaf open to its stop gives no more: someone walking into it goes round its free end, as round a wall's corner.
        // Pressed square on, the push-out alone held a resident against their own front door's leaf with their next
        // waypoint just behind it (docs/design/WEB_BATTERY_STABILITY.md §3.2). The people the AI walks only; you and cars as before.
        if (!veh && got === 0 && mover !== this.g.player) { p.x += L.dx * rem; p.z += L.dz * rem; }
      }
      return rem > 0 ? rem : 0;
    }
    if (mover && door.locked && mover.faction === 'zombie') this.bang(door, mover);
    p.x += nx * pen; p.z += nz * pen;
    return pen;
  }

  ray(op, x0, z0, dx, dz, maxT, mode) {
    if (op.kind === 'leaf') {
      if (op.door.broken) return Infinity;
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
    if ((this.ringT -= dt) <= 0) { this.ringT = RO.every; this.ringScan(); }
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
      g.statics.resolveBody(_p, c.radius ?? 0.4, c, null); // below the street: that level's walls (resolveBody routes them)
      const ox = _p.x - L.hx, oz = _p.z - L.hz, still = ox * L.px + oz * L.pz;
      if (still < rr && still > -rr && ox * L.dx + oz * L.dz < L.len) { L.th = prev; this.orient(L); L.w = 0; L.jamT = 0.2; return; }
      c.x = _p.x; c.z = _p.z;
    }
  }

  bash(L, c, speed, sg) {
    const g = this.g;
    const by = L.pusher && g.time - L.pushT < 1.5 && L.pusher !== c ? L.pusher : null;
    _p.x = c.x + L.px * sg * 0.75; _p.z = c.z + L.pz * sg * 0.75;
    g.statics.resolveBody(_p, c.radius ?? 0.4, c, null);
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
        door.lockHp -= dmg * (near ? 1 : 0.4) * (door.mat.bulletLock ?? 1); // a blast door's lock does not shoot off (systems/underground.js)
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
      g.fx.spawn(1, W.x + W.ux * a, W.y + WINDOW.sill + Math.random() * (WINDOW.top - WINDOW.sill), W.z + W.uz * a, dx * (2 + Math.random() * 5) + (Math.random() - 0.5) * 3, 0.5 + Math.random() * 3, dz * (2 + Math.random() * 5) + (Math.random() - 0.5) * 3, 0.9, 0.06, Math.random() < 0.5 ? '#cfe6ee' : '#9fc2d0', 18);
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
      if (door.ug) continue; // a door below the street: a blast up top never reaches it (a charge set on it does: systems/underground.js)
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
    this.g.materials?.blast(x, z, r, by); // what the blast breaks, by what it is made of (systems/materials.js)
  }

  // ---- locks & kicks ------------------------------------------------------------------------------
  // One kick: a locked door takes its material's 2-3, then bursts; an unlocked one flies open.
  kick(door, by) {
    const g = this.g;
    const t = g.time;
    if ((by.kickAt ?? -9) > t) return { kicked: false, wait: +(by.kickAt - t).toFixed(2) };
    by.kickAt = t + DOOR.kickCool;
    // A padlock and chain (systems/actions.js): a boot rattles it and is heard; it does not give (bolt cutters, picks, a sledge).
    if (door.padlock && door.locked) { g.audio.thud?.(g.pan(door.x)); g.noise(door.x, door.z, DOOR.kickNoise * 0.6, by); g.emit('doorKick', { door: door.id, by: by.id, locked: true, padlock: true, kicksLeft: door.kicks }); return { kicked: true, locked: true, padlock: true, kicksLeft: door.kicks, burst: false }; }
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
  // The cells are kept by world position (the nav grid's window moves; its pinned island store does not).
  navBlock(door, on) {
    const n = this.g.nav?.foot;
    if (!n || door.ug) return; // a door below the street is on its level's own grid (systems/underground.js), not the street's
    if (!on) { if (door.nav) for (let k = 0; k < door.nav.length; k += 2) if (n.getCell(door.nav[k], door.nav[k + 1]) === 3) n.setCell(door.nav[k], door.nav[k + 1], 0); door.nav = null; return; }
    if (door.nav) return;
    door.nav = [];
    const half = door.width / 2 + 0.1, across = 0.25 + n.radius, c = n.cell;
    for (let gz = Math.floor((door.z - 2) / c); gz <= Math.floor((door.z + 2) / c); gz++) for (let gx = Math.floor((door.x - 2) / c); gx <= Math.floor((door.x + 2) / c); gx++) {
      const x = (gx + 0.5) * c, z = (gz + 0.5) * c, wx = x - door.x, wz = z - door.z;
      const along = wx * door.ux + wz * door.uz, acr = wx * door.nx + wz * door.nz;
      if (along > half || along < -half || acr > across || acr < -across) continue;
      if (!n.getCell(x, z)) { n.setCell(x, z, 3); door.nav.push(x, z); }
    }
  }

  // ---- the player's interact key ----------------------------------------------------------------
  // Nearest door or window the interact key would act on (within reach, in front of it).
  nearest(p) {
    let best = null, bd = 1.9;
    const S = this.g.statics, x0 = S.ci(p.x - 2), x1 = S.ci(p.x + 2), z0 = S.ci(p.z - 2), z1 = S.ci(p.z + 2);
    const stamp = ++S.stamp;
    const lists = this._lists ?? (this._lists = []);
    lists.length = 0;
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) lists.push(S.cells[cz * S.n + cx]);
    if (this.ringOpen.size) for (let gx = Math.floor((p.x - 2) / S.cell); gx <= Math.floor((p.x + 2) / S.cell); gx++) for (let gz = Math.floor((p.z - 2) / S.cell); gz <= Math.floor((p.z + 2) / S.cell); gz++) lists.push(S.chunkCell(gx, gz));
    for (const list of lists) {
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
          if (door.broken || (!shut && !door.locked)) continue;
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
      if (g.actions) { g.actions.doorKey(p, I, dt, t); return ring; } // TIMED ACTIONS: tap kicks, hold works the lock with your best tool (systems/actions.js)
      // Carrying picks or a crowbar (inventory.js): a held E works the lock (picks quietly, a bar loudly);
      // a tap still kicks. Without either, E kicks on the press as before.
      const inv = g.inventory, tool = !t.locked || !inv ? null : inv.carried.slots.some((s) => s.id === 'lockpicks' && s.left > 0) ? 'pick' : inv.hasTag('pry') ? 'pry' : null;
      if (tool) {
        const need = (tool === 'pick' ? 2.6 : 1.3) * (g.deep?.fx.lockMul ?? 1), verb = tool === 'pick' ? 'Picking the lock' : 'Prying it';
        if (down && this.hold >= 0) {
          this.hold += dt;
          const k = (this.hold - WINDOW.holdTap) / need;
          if (k >= 1) { inv.forceLock(t, tool); this.hold = -1; }
          g.hud.prompt(k > 0 ? `${verb}… ${Math.round(Math.min(1, k) * 100)}%` : `<kbd>E</kbd> Kick · hold <kbd>E</kbd> ${tool === 'pick' ? 'Pick the lock (quiet)' : 'Pry it open (loud)'}`);
          return ring;
        }
        if (!down && this.hold > 0 && this.hold < WINDOW.holdTap) this.kick(t, p);
        if (!down) this.hold = 0;
        g.hud.prompt(`<kbd>E</kbd> Kick the door in · locked (${t.kicks} more) · hold <kbd>E</kbd> ${tool === 'pick' ? 'Pick the lock (quiet)' : 'Pry it open (loud)'}`);
        return ring;
      }
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
    const WR = RO.windows, LR = RO.doors * 2, NW = nw + WR; // the ring's pool after the island's slots
    // Leaves and padlocks: one mesh (the island's leaves, its padlocks, then the ring's leaf pool).
    // No shadow pass for leaves or boards: from the top-down camera it never reads, and each pass is a
    // draw call.
    this.leafMesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.18 }), nl + nd + LR);
    for (let i = nl + nd + LR - 1; i >= nl + nd; i--) { this.leafMesh.setMatrixAt(i, ZERO); this.leafMesh.setColorAt(i, _c.set('#8a6a44')); this.freeLeaf.push(i); }
    for (let i = NW - 1; i >= nw; i--) this.freeWin.push(i);
    this.leafMesh.receiveShadow = true;
    for (const L of this.leaves) { this.leafMesh.setColorAt(L.slot, _c.set(L.door.color)); this.writeLeaf(L); }
    this.doors.forEach((d, k) => { d.lockSlot = nl + k; this.leafMesh.setColorAt(d.lockSlot, _c.set(d.mat.lock)); this.syncLock(d, true); });
    this.leafMesh.instanceColor.needsUpdate = true;
    this.leafMesh.computeBoundingSphere();
    this.leafMesh.frustumCulled = false; // the ring's leaves attach anywhere
    scene.add(this.leafMesh);

    // Glass: the car glass's crack and shatter shader (clearer glass) on a thin slab, so it also
    // reads from straight above.
    const gGeo = new THREE.BoxGeometry(1, 1, 1);
    this.aCrack = new THREE.InstancedBufferAttribute(new Float32Array(NW), 1);
    const shape = new Float32Array(NW * 2);
    for (let i = 0; i < NW; i++) shape[i * 2] = 1;
    gGeo.setAttribute('aCrack', this.aCrack);
    gGeo.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 2));
    const gMat = glassMaterial({ map: windowGlassTexture(), opacity: 0.5 });
    gMat.forceSinglePass = true; // a thin slab needs no back-faces-first pass: one draw call, not two
    this.glassMesh = new THREE.InstancedMesh(gGeo, gMat, NW);
    for (let i = nw; i < NW; i++) this.glassMesh.setMatrixAt(i, ZERO);
    this.glassMesh.renderOrder = 2;
    for (const W of this.windows) this.placeGlass(W, true);
    this.glassMesh.computeBoundingSphere();
    this.glassMesh.frustumCulled = false;
    scene.add(this.glassMesh);

    this.buildFrames(scene);

    // Boards: three planks a window, nailed across the side they were put up from. Packed: only planks
    // that are up are instances (re-packed when a window is boarded or its boards break).
    this.boardMesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.92 }), NW * 3);
    this.boardMesh.receiveShadow = true;
    this.boardMesh.setColorAt(0, _c.set('#8a6a44'));
    this.packBoards();
    this.boardMesh.frustumCulled = false;
    scene.add(this.boardMesh);
  }

  // What makes a window read as one (data/interiors.js WINDOW_LOOK): the lintel closing the wall above it, the painted
  // frame, the sill, shutters; one static mesh. The mullion and transom are their own mesh: they go when the glass does.
  buildFrames(scene) {
    const items = [], nw = this.windows.length;
    for (const W of this.windows) this.frameItems(W, items);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 });
    // The island's frames packed, then FRAME_N slots for each of the ring's window slots (written when one attaches).
    this.frameBase = items.length;
    const total = items.length + RO.windows * FRAME_N;
    this.frameMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, total);
    items.forEach((it, i) => this.writeFrame(i, it));
    for (let i = items.length; i < total; i++) { this.frameMesh.setMatrixAt(i, ZERO); this.frameMesh.setColorAt(i, _c.set('#8a857c')); }
    this.frameMesh.count = total;
    this.frameMesh.receiveShadow = true; this.frameMesh.castShadow = true;
    this.frameMesh.computeBoundingSphere();
    this.frameMesh.frustumCulled = false; // ring windows come and go anywhere
    scene.add(this.frameMesh);
    // Mullion and transom: two bars a window, in the glass's plane.
    const NW = nw + RO.windows;
    this.barMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: WINDOW_LOOK.bars.color, roughness: 0.8 }), NW * 2);
    this.barMesh.count = NW * 2;
    for (let i = nw * 2; i < NW * 2; i++) this.barMesh.setMatrixAt(i, ZERO);
    for (const W of this.windows) this.syncBars(W, true);
    this.barMesh.frustumCulled = false;
    scene.add(this.barMesh);
  }

  // A window's frame pieces (WINDOW_LOOK), at most FRAME_N: lintel, two jambs, head, sill, two shutters.
  frameItems(W, items) {
    const L = WINDOW_LOOK, b = W.bi >= 0 ? this.g.world.buildings[W.bi] : null, town = b?.district === 'town';
    const hash = (k) => frac(W.x * (3.7 + k) + W.z * (1.3 + k * 2.1));
    // A box in the window's own frame: a along the wall from its centre, y up, n out of the wall.
    const put = (a, y, n, sa, sy, sn, color, roll = 0) => items.push({ x: W.x + W.ux * a + W.nx * n, y: W.y + y, z: W.z + W.uz * a + W.nz * n, sa, sy, sn, color, yaw: W.axis === 'x' ? 0 : Math.PI / 2, roll });
    const wallH = W.row.wallH ?? b?.h ?? WINDOW.top, T = W.row.t ?? 0.5;
    const pal = town ? L.frame.town : L.frame.ruins, frame = pal[Math.floor(hash(0) * pal.length)];
    const oh = WINDOW.top - WINDOW.sill, fw = L.frame.w;
    if (wallH > WINDOW.top + 0.05) put(0, (WINDOW.top + wallH - STEP) / 2, 0, W.width, wallH - WINDOW.top - STEP, T, W.row.color ?? b?.color ?? '#a39b8d'); // the lintel: the wall goes on over the window (a depth step under the wall's own top, which some buildings carry over the opening too)
    for (const s of [-1, 1]) put(s * (W.half - fw / 2), (WINDOW.sill + WINDOW.top) / 2, 0, fw, oh, L.frame.depth, frame);
    put(0, WINDOW.top - fw / 2 + STEP / 2, 0, W.width, fw + STEP, L.frame.depth, frame); // the head: a depth step over the jambs' and bars' tops it caps (engine/depthlayers.js)
    put(0, WINDOW.sill, L.sill.out, W.width + 0.24, L.sill.h, L.sill.depth, L.sill.color);
    // Shutters, outside, either side: Rust Haven paints them; a ruin's may hang off one hinge.
    if (hash(3) < (town ? L.shutter.town : L.shutter.ruins)) {
      const col = L.shutter.colors[Math.floor(hash(4) * L.shutter.colors.length)];
      for (const s of [-1, 1]) {
        const loose = !town && s > 0;
        put(s * (W.half + L.shutter.w / 2 + 0.04), (WINDOW.sill + WINDOW.top) / 2 - (loose ? 0.25 : 0), T / 2 + 0.05, L.shutter.w, oh, 0.05, col, loose ? 0.5 : 0);
      }
    }
    return items;
  }

  writeFrame(i, it) {
    if (!it) { this.frameMesh.setMatrixAt(i, ZERO); return; }
    _o.position.set(it.x, it.y, it.z); _o.rotation.set(0, it.yaw, it.roll); _o.scale.set(it.sa, it.sy, it.sn); _o.updateMatrix();
    this.frameMesh.setMatrixAt(i, _o.matrix); this.frameMesh.setColorAt(i, _c.set(it.color));
  }

  placeGlass(W, boot = false) {
    _o.position.set(W.x, W.y + (WINDOW.sill + WINDOW.top) / 2, W.z);
    _o.rotation.set(0, W.axis === 'x' ? 0 : Math.PI / 2, 0);
    _o.scale.set(W.width - 0.04, WINDOW.top - WINDOW.sill, 0.1);
    _o.updateMatrix();
    this.glassMesh.setMatrixAt(W.slot, _o.matrix);
    this.syncGlass(W, boot);
  }

  syncBars(W, boot = false) {
    if (!this.barMesh) return;
    const L = WINDOW_LOOK.bars, oh = WINDOW.top - WINDOW.sill, on = W.state !== 'shattered' ? 1 : 0;
    const yaw = W.axis === 'x' ? 0 : Math.PI / 2;
    _o.rotation.set(0, yaw, 0);
    _o.position.set(W.x, W.y + (WINDOW.sill + WINDOW.top) / 2, W.z); _o.scale.set(L.w * on, oh * on, 0.12 * on); _o.updateMatrix();
    this.barMesh.setMatrixAt(W.slot * 2, _o.matrix);
    _o.position.set(W.x, W.y + WINDOW.sill + oh * L.transom, W.z); _o.scale.set(W.width * on, L.w * on, 0.12 * on); _o.updateMatrix();
    this.barMesh.setMatrixAt(W.slot * 2 + 1, _o.matrix);
    if (!boot) this.barMesh.instanceMatrix.needsUpdate = true;
  }

  packBoards() {
    const M = this.boardMesh, planks = ['#8a6a44', '#7a5a3a', '#94744c', '#6b4e30'];
    const yaw = (W) => (W.axis === 'x' ? 0 : -Math.PI / 2);
    let n = 0;
    for (const W of this.windows) {
      const up = W.state === 'boarded' ? Math.ceil(3 * W.boardHp / WINDOW.boardHp) : 0;
      for (let k = 0; k < up; k++) {
        const off = W.boardSide * 0.32;
        _o.position.set(W.x + W.nx * off, W.y + WINDOW.sill + 0.3 + k * 0.5, W.z + W.nz * off);
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
    if (L.door.broken) { this.leafMesh.setMatrixAt(L.slot, ZERO); return; }
    _o.position.set(L.hx + L.dx * L.len / 2, (L.door.y ?? 0) + DOOR.height / 2 + 0.03, L.hz + L.dz * L.len / 2); // y: a door below the street hangs on its own floor
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
    if (door.lockSlot < 0) return; // a ring door: never locked, no padlock slot
    if (door.locked) {
      _o.position.set(door.x + door.nx * 0.32, (door.y ?? 0) + 1.15, door.z + door.nz * 0.32);
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
    if (!boot) { this.aCrack.needsUpdate = true; this.syncBars(W); }
  }

  // A window's boards changed (put up, splintered down a plank, torn off): re-pack the planks.
  syncBoards(W) {
    const up = W.state === 'boarded' ? Math.ceil(3 * W.boardHp / WINDOW.boardHp) : 0;
    if (up === W.planks) return;
    W.planks = up;
    if (this.boardMesh) this.packBoards();
  }

  // ---- the Phoenix ring's openings (streamed) -------------------------------------------------------------------------
  // A ring building's doors and windows are gaps in its walls until you come near (RING_OPENINGS): within `near` m its
  // rows (world/ring.js geo: doors, innerDoors, windows) become leaves and windows like the island's, their ops in the
  // chunk ring's cells (StaticWorld.addRingOp), their meshes in the pool slots; past `far` they detach, and whatever
  // happened to them waits in ringState under their ids.
  ringScan() {
    const g = this.g, S = g.streamer, RG = S?.W?.ring, P = g.player;
    if (!RG || !S.hot) return;
    const near = RO.near, far = RO.far, seen = this._seen ?? (this._seen = new Set());
    seen.clear();
    let builds = RO.buildPerScan; // a lot whose shell the ring's cache dropped is rebuilt here, a few a scan (0.1-1 ms each)
    for (const L of S.hot.values()) {
      const list = L.ring?.bld;
      if (!list) continue;
      for (const b of list) {
        if (seen.has(b.id)) continue;
        seen.add(b.id);
        const dx = Math.max(b.x0 - P.x, 0, P.x - b.x1), dz = Math.max(b.z0 - P.z, 0, P.z - b.z1);
        if (dx > near || dz > near || dx * dx + dz * dz > near * near || this.ringOpen.has(b.id)) continue;
        const lot = RG.lotById(b.id);
        if (!lot) continue;
        if (!lot.geo) { if (builds <= 0) continue; builds--; }
        this.attachRing(b.id, lot, RG.geo(lot));
      }
    }
    for (const [id, rec] of this.ringOpen) {
      if (id.startsWith('cg:')) continue; // a generated settlement's openings: citygen.openings() attaches and detaches those
      const dx = Math.max(rec.x0 - P.x, 0, P.x - rec.x1), dz = Math.max(rec.z0 - P.z, 0, P.z - rec.z1);
      if (!seen.has(id) || dx * dx + dz * dz > far * far) { this.detachRing(id); continue; }
      // A chunk slot that changed hands emptied its cells: put the openings back.
      for (const box of rec.boxes) if (g.statics.ringOpStale(box)) { g.statics.removeRingOp(box); g.statics.insertRingOp(box); }
    }
  }

  attachRing(id, lot, geo) {
    const g = this.g, st = g.statics, rec = { id, x0: lot.x0, z0: lot.z0, x1: lot.x1, z1: lot.z1, doors: [], windows: [], boxes: [] };
    const reg = (op, x0, z0, x1, z1, h) => { const b = st.addRingOp(op, x0, z0, x1, z1, h); rec.boxes.push(b); return b; };
    const h01 = (x, z, k) => frac(Math.sin(x * (12.9898 + k) + z * (78.233 - k)) * 43758.5453);
    const ruined = !!lot.ruined, RG = this.g.streamer.W.ring;
    // A house somebody lives in (systems/residents.js) keeps its doors standing open against the wall: its people come
    // and go all day (you can still shut them). The empty ones are as the dead city left them: shut, or ajar.
    const lived = !!RG.household?.(lot);
    // Doors: the front and back doors in the outer walls (a bay's roll-up and a barricaded door stay as they are), and
    // the inside doorways between rooms.
    const rows = [];
    geo.doors.forEach((d, k) => {
      if (d.kind === 'bay' || d.barricade) return;
      rows.push({ id: `${id}:d${k}`, kind: d.kind, x: d.x, z: d.z, y: lot.y, axis: d.nx ? 'z' : 'x', width: d.w - 0.1, nx: d.nx, nz: d.nz,
        leaves: d.kind === 'front' && d.w >= 2.3 ? 2 : 1, inner: false });
    });
    (geo.innerDoors ?? []).forEach((d, k) => rows.push({ id: `${id}:i${k}`, kind: 'inner', x: d.x, z: d.z, y: lot.y, axis: d.axis, width: d.w - 0.1,
      nx: d.axis === 'x' ? 0 : 1, nz: d.axis === 'x' ? 1 : 0, leaves: 1, inner: true }));
    for (const r of rows) {
      if (this.freeLeaf.length < r.leaves) break; // the pool is full: these stay gaps
      if (ruined && h01(r.x, r.z, 1) < 0.4) continue; // a ruin lost some of its doors
      if (lived && r.inner) continue; // a family's own rooms open into each other: no leaf to wedge against on the way to bed
      r.hinge = h01(r.x, r.z, 2) < 0.5 ? -1 : 1;
      r.material = h01(r.x, r.z, 3) < RO.metal && !r.inner ? 'metal' : 'wood';
      r.color = DOOR_MATERIALS[r.material].colors[Math.floor(h01(r.x, r.z, 4) * DOOR_MATERIALS[r.material].colors.length)];
      r.locked = false; r.b = -1;
      const swing = (h01(r.x, r.z, 5) < 0.5 ? 1 : -1) * (1.1 + 0.6 * h01(r.x, r.z, 6));
      r.open = lived ? Math.sign(swing) * RO.wide : r.inner ? (h01(r.x, r.z, 7) < RO.innerOpen ? swing : 0) : (h01(r.x, r.z, 8) < (ruined ? 0.5 : RO.ajar) ? swing * 0.7 : 0);
      const door = this.makeDoor(r, reg, () => this.freeLeaf.pop());
      door.ring = id;
      for (const L of door.leaves) this.leafMesh.setColorAt(L.slot, _c.set(door.color));
      const v = this.ringState.get(r.id);
      if (v) door.leaves.forEach((L, k) => { L.th = v.a[k] ?? L.th; this.orient(L); });
      rec.doors.push(door);
    }
    // Windows: glass, frame, boards.
    geo.windows.forEach((w, k) => {
      if (!this.freeWin.length) return;
      const mix = WINDOW_MIX[w.ruined ? 'ruined' : 'ruins'], q = h01(w.x, w.z, 9);
      const row = { ...w, y: lot.y ?? w.y, id: `${id}:w${k}`, state: q < mix[0] ? 'intact' : q < mix[0] + mix[1] ? 'shattered' : 'boarded', boardSide: h01(w.x, w.z, 10) < 0.75 ? -1 : 1, b: -1 };
      const W = this.makeWindow(row, reg, this.freeWin.pop());
      W.ring = id;
      const v = this.ringState.get(row.id);
      if (v) { W.state = v.s; W.hp = W.state === 'intact' ? v.hp : 0; W.boardHp = W.state === 'boarded' ? v.b : 0; W.boardSide = v.sd; }
      W.planks = W.state === 'boarded' ? Math.ceil(3 * W.boardHp / WINDOW.boardHp) : 0;
      this.placeGlass(W, true);
      this.syncBars(W, true);
      const items = this.frameItems(W, []), base = this.frameBase + (W.slot - this.nIslandWindows) * FRAME_N;
      for (let i = 0; i < FRAME_N; i++) this.writeFrame(base + i, items[i]);
      rec.windows.push(W);
    });
    this.ringOpen.set(id, rec);
    this.flushRing(rec.windows.some((W) => W.state === 'boarded'));
  }

  detachRing(id) {
    const rec = this.ringOpen.get(id);
    if (!rec) return;
    const st = this.g.statics;
    for (const b of rec.boxes) st.removeRingOp(b);
    for (const door of rec.doors) {
      const moved = door.leaves.some((L) => Math.abs(L.th - L.th0) > 0.01);
      if (moved) this.ringState.set(door.id, { a: door.leaves.map((L) => +L.th.toFixed(3)) }); else this.ringState.delete(door.id);
      for (const L of door.leaves) {
        this.leafMesh.setMatrixAt(L.slot, ZERO); this.freeLeaf.push(L.slot);
        L.active = false; L.isDirty = false;
        drop(this.leaves, L); drop(this.active, L); drop(this.dirty, L);
      }
      drop(this.doors, door); this.byId.delete(door.id);
    }
    let boards = false;
    for (const W of rec.windows) {
      if (W.state !== W.row.state || (W.state === 'intact' && W.hp < WINDOW.hp) || (W.state === 'boarded' && W.boardHp < WINDOW.boardHp))
        this.ringState.set(W.id, { s: W.state, hp: Math.round(W.hp), b: Math.round(W.boardHp), sd: W.boardSide });
      else this.ringState.delete(W.id);
      if (W.state === 'boarded') boards = true;
      this.glassMesh.setMatrixAt(W.slot, ZERO);
      this.barMesh.setMatrixAt(W.slot * 2, ZERO); this.barMesh.setMatrixAt(W.slot * 2 + 1, ZERO);
      const base = this.frameBase + (W.slot - this.nIslandWindows) * FRAME_N;
      for (let i = 0; i < FRAME_N; i++) this.frameMesh.setMatrixAt(base + i, ZERO);
      this.freeWin.push(W.slot);
      drop(this.windows, W); this.byId.delete(W.id);
      if (this.holdOn === W) { this.holdOn = null; this.hold = 0; }
    }
    this.ringOpen.delete(id);
    this.flushRing(boards);
  }

  flushRing(boards) {
    this.leafMesh.instanceMatrix.needsUpdate = true;
    if (this.leafMesh.instanceColor) this.leafMesh.instanceColor.needsUpdate = true;
    this.glassMesh.instanceMatrix.needsUpdate = true; this.aCrack.needsUpdate = true;
    this.barMesh.instanceMatrix.needsUpdate = true;
    this.frameMesh.instanceMatrix.needsUpdate = true;
    if (this.frameMesh.instanceColor) this.frameMesh.instanceColor.needsUpdate = true;
    if (boards) this.packBoards();
    this.flush();
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
      if (door.ug) continue; // the underground's doors are on its own records (systems/underground.js)
      const moved = door.leaves.some((L) => Math.abs(L.th - L.th0) > 0.01);
      if (moved || door.locked !== !!door.row.locked || (door.locked && (door.kicks !== door.mat.kicks || door.lockHp !== door.mat.lockHp)))
        d[door.id] = { a: door.leaves.map((L) => +L.th.toFixed(3)), l: door.locked ? 1 : 0, h: Math.round(door.lockHp), k: door.kicks };
    }
    for (const W of this.windows)
      if (W.state !== W.row.state || (W.state === 'intact' && W.hp < WINDOW.hp) || (W.state === 'boarded' && W.boardHp < WINDOW.boardHp))
        w[W.id] = { s: W.state, hp: Math.round(W.hp), b: Math.round(W.boardHp), sd: W.boardSide };
    // The ring's openings that are detached now: what happened to them waits in ringState (ids are `<lot>:d|i|w<k>`).
    for (const [id, v] of this.ringState) if (!this.byId.has(id)) (/:w\d+$/.test(id) ? w : d)[id] = v;
    return { d, w };
  }

  load(s) {
    // The ring's: detach every one (the save is the truth), keep the save's entries for when they attach again.
    for (const id of [...this.ringOpen.keys()]) this.detachRing(id);
    this.ringState.clear();
    for (const [k, v] of Object.entries(s?.d ?? {})) if (k.includes(':')) this.ringState.set(k, v);
    for (const [k, v] of Object.entries(s?.w ?? {})) if (k.includes(':')) this.ringState.set(k, v);
    this.ringT = 0;
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
