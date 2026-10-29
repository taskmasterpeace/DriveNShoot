import * as THREE from 'three';
import { VEHICLES } from './vehicles.js';
import { rampGeometry, holdDoorGeometry } from './vehiclebodies.js';
import { TRAILERS, TRAILER_DECKS, HITCH, CARRY, FREIGHT, CLEARANCE, fitsHold, fitsRoad, fitsUnder } from '../data/trailers.js';
import { makeRng, clamp, angleLerp } from '../engine/rng.js';
import { outfit } from './characters.js';

// SEMIS (docs/design/WEB_SEMIS.md; rows in data/trailers.js): tractor-trailers you drive a car INTO.
//
// THE HITCH. A trailer is its own vehicle (a row with `trailer`), joined to a tractor (a row with `tractor`) at its kingpin.
// While hitched it does not drive: each frame, after the tractor moved, its axles TRACK - they stay where they were and the
// trailer turns to point from them at the kingpin (a no-slip trailer), so it cuts inside a bend and, backing up, swings
// the other way. Braking hard at speed, an empty trailer's locked axles shove the kingpin: the articulation grows until
// the cab's corner meets the trailer's nose (the jackknife). Through a fast bend a light trailer's tail slides out (swing).
// Unhitched, it is an ordinary driverless vehicle, its landing gear down (braked): a trailer you leave parked.
//
// THE HOLD. A car on a trailer keeps its pose in the TRAILER's frame (the decks law, systems/decks.js, extended to
// vehicles). Each frame, after the trailer moved: the car is put back in that frame, the floor's own acceleration is applied
// to it backwards (a parked car's brake holds; a rolling one shifts; chocks hold it fast), it drives there as it would on
// the street (its driver's throttle and wheel, vehicles.js drive()), the walls and the closed door stop it, and it goes
// back out into the world through the trailer's new pose. So nothing slides however fast the truck goes, and a car can
// drive up a ramp behind a moving truck, ride inside, and drive back down onto the road at a matched speed.
// The people on the floor walk round it (decks.js resolve: v.cargoBoxes); its driver gets out onto that floor.
//
// Order: Vehicles.update runs the list in order, so a tractor comes before its trailer and a trailer before its cargo
// (Semis.order, outside the update loop). Hooks in shared files (each one line): vehicles.js update (tick) / collide
// (linked) / aiDrive ('semi'), vehiclelights.js (a towed trailer is lit by its tractor), decks.js (a door that `needs`
// a flag; v.cargoBoxes), seats.js leave (out onto the hold's floor), main.js (the system, trailers aren't "Drive" targets).

const S2 = [{ id: 'driver', side: 'left', row: 0 }, { id: 'shotgun', side: 'right', row: 0 }];
// The rows (as systems/travel.js adds the trundle's): a sleeper tractor, `tractor.fifth` its fifth wheel's local z; the two
// trailers, each naming its TRAILERS row and its hold deck. No engine, no seats: a trailer moves when something pulls it.
VEHICLES.semi ??= { name: 'LONGHAULER', len: 7.4, wid: 2.6, tall: 3.95, maxSpeed: 31, reverse: 7, accel: 11, turn: 1.4, grip: 6.4, mass: 5, hp: 520, armor: 0.12, fuelCap: 300, springs: 'rig', seats: S2, tractor: { fifth: -2.35 } };
VEHICLES.boxtrailer ??= { name: 'BOX TRAILER', len: 12.4, wid: 3.2, tall: 4.0, maxSpeed: 31, reverse: 7, accel: 0, turn: 0, grip: 5.5, mass: 4, hp: 600, armor: 0.2, fuelCap: 0, noEngine: true, springs: 'rig', seats: [], trailer: 'box', deck: TRAILER_DECKS.boxHold };
VEHICLES.widetrailer ??= { name: 'WIDE-LOAD LOWBOY', len: 14.2, wid: 5.6, tall: 1.8, maxSpeed: 31, reverse: 7, accel: 0, turn: 0, grip: 5.5, mass: 5, hp: 700, armor: 0.15, fuelCap: 0, noEngine: true, springs: 'rig', seats: [], trailer: 'wide', deck: TRAILER_DECKS.wideDeck };

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3(), L = { x: 0, z: 0 }, W = { x: 0, z: 0 }, NONE = [];
// Body frame <-> world, in the plane (+x the driver's left, +z forward), as decks.js.
function toLocal(ref, x, z, out) { const dx = x - ref.x, dz = z - ref.z, c = Math.cos(ref.h), s = Math.sin(ref.h); out.x = dx * c - dz * s; out.z = dx * s + dz * c; return out; }
function toWorld(ref, lx, lz, out) { const c = Math.cos(ref.h), s = Math.sin(ref.h); out.x = ref.x + lx * c + lz * s; out.z = ref.z - lx * s + lz * c; return out; }
const CREW_FLAGS = ['US', 'MX', 'CA', 'PH', 'NG', 'IN', 'PL', 'VN', 'GT', 'UA'];

export class Semis {
  constructor(game) {
    this.g = game;
    this.trailers = [];        // every trailer in the world
    this.freight = null;       // { kind, dir, lane, members: [{ v, role, gap }] }
    this.next = FREIGHT.every[0];
    this.rng = makeRng(4141);
    this.count = 0;
    this.stats = { hitches: 0, boards: 0, unloads: 0, jackknifes: 0, refused: 0, blocked: 0 };
    this.bannerMat = null;
    this.gHeld = 0;
  }

  // ---- vehicles in a rig ----------------------------------------------------------------------------------------------
  row(T) { return TRAILERS[T.trailer]; }
  // Are a and b one rig (a tractor and its trailer)? A car in a hold meets nothing in the world (its hold stops it).
  linked(a, b) {
    if (a.towedBy === b || b.towedBy === a || a.carriedBy || b.carriedBy) return true;
    const K = a.tractor ? a : b.tractor ? b : null, T = K === a ? b : a; // a tractor backing under a loose trailer's nose
    if (!K || !T.trailer || T.towedBy || Math.abs(wrap(K.h - T.h)) > HITCH.reachAngle) return false;
    const f = this.fifth(K, W), fx = f.x, fz = f.z, k = this.kingpin(T, L);
    return Math.hypot(fx - k.x, fz - k.z) < 4.5;
  }
  loadOf(T) { let m = 0; for (const C of T.cargo ?? NONE) m += C.mass; return m / Math.max(0.5, T.mass); }
  cargoMass(T) { let m = 0; for (const C of T.cargo ?? NONE) m += C.mass; return m; }

  // Vehicles.update, every vehicle, in place of drive/collide/stunts: true if this moved it.
  tick(v, dt) {
    if (v.trailer) { if (!v._sm) this.initTrailer(v); this.trailerTick(v, dt); return true; }
    if (v.carriedBy) { this.carryTick(v, dt); return true; }
    return false;
  }

  // A trailer's moving parts: the ramp (and the box's roll-up door), the WIDE LOAD banners. Children of its group; they
  // share its material (its damage tint).
  initTrailer(T) {
    const R = this.row(T);
    T._sm = true; T.cargo = []; T.cargoBoxes = []; T.rampT = 0; T.rampWant = 0; T.rampDown = false;
    if (!T.towedBy) T.parked = true; // the landing gear is down
    T.rampMesh = new THREE.Mesh(rampGeometry(T), T.mesh.material);
    T.rampMesh.castShadow = true; T.rampMesh.receiveShadow = true;
    T.group.add(T.rampMesh);
    if (R.ramp.door) { T.doorMesh = new THREE.Mesh(holdDoorGeometry(T), T.mesh.material); T.doorMesh.castShadow = true; T.group.add(T.doorMesh); }
    if (R.wide) { T.banner = new THREE.Mesh(this.bannerGeo(T), this.banner()); T.group.add(T.banner); }
    this.poseRamp(T);
    this.trailers.push(T);
  }

  // ---- the hitch ------------------------------------------------------------------------------------------------------
  fifth(K, out) { const f = K.tractor.fifth; out.x = K.x + Math.sin(K.h) * f; out.z = K.z + Math.cos(K.h) * f; return out; }
  kingpin(T, out) { const k = this.row(T).kingpin; out.x = T.x + Math.sin(T.h) * k; out.z = T.z + Math.cos(T.h) * k; return out; }

  // Can tractor K couple trailer T where they stand? -> null, or why not.
  canHitch(K, T) {
    if (!K?.tractor) return 'not a tractor';
    if (!T?.trailer) return 'not a trailer';
    if (K.towing) return `already pulling the ${K.towing.name}`;
    if (T.towedBy) return 'that trailer is already hitched';
    if (K.dead || T.dead) return 'wrecked';
    const a = this.fifth(K, { x: 0, z: 0 }), b = this.kingpin(T, { x: 0, z: 0 }), d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d > HITCH.reach) return `the fifth wheel is ${d.toFixed(1)} m from the kingpin (back up to within ${HITCH.reach})`;
    if (Math.abs(wrap(K.h - T.h)) > HITCH.reachAngle) return 'square up to the trailer first';
    return null;
  }
  hitch(K, T, force = false) {
    const why = force ? (K.towing || T.towedBy ? 'already hitched' : null) : this.canHitch(K, T);
    if (why) return { ok: false, why };
    if (!T._sm) this.initTrailer(T);
    T.towedBy = K; K.towing = T; T.parked = false; T.jkOn = false; T.jackknifed = false;
    K._smAccel0 ??= K.accel;
    if (force) { this.fifth(K, W); T.h = K.h; T.x = W.x - Math.sin(T.h) * this.row(T).kingpin; T.z = W.z - Math.cos(T.h) * this.row(T).kingpin; }
    if (this.row(T).wide) this.tractorBanner(K, true);
    this.order(T);
    this.stats.hitches++;
    this.g.emit('semiHitch', { tractor: K.id, trailer: T.id });
    if (K.driver === this.g.player) this.g.hud.toast(`HITCHED THE ${T.name} · [G] THE RAMP · HOLD [G] TO UNHITCH`, 'job');
    return { ok: true };
  }
  unhitch(K, why = 'unhitched') {
    const T = K?.towing;
    if (!T) return { ok: false, why: 'not pulling anything' };
    T.towedBy = null; K.towing = null; T.parked = true; T.jkOn = false; T.jackknifed = false;
    if (K._smAccel0 !== undefined) { K.accel = K._smAccel0; delete K._smAccel0; }
    this.tractorBanner(K, false);
    this.g.emit('semiUnhitch', { tractor: K.id, trailer: T.id, why });
    if (K.driver === this.g.player) this.g.hud.toast(`UNHITCHED · THE ${T.name} STANDS ON ITS LANDING GEAR`, 'job');
    return { ok: true };
  }

  trailerTick(T, dt) {
    const g = this.g, vs = g.vehiclesSys, K = T.towedBy;
    const px = T.x, pz = T.z, ph = T.h, pvx = T.vx, pvz = T.vz;
    if (K && (!vs.list.includes(K) || K.sunk)) this.unhitch(K, 'lost');
    if (!T.towedBy) {
      vs.drive(T, dt); vs.collide(T, dt); g.stunts?.step(T, dt); // parked: its brakes hold it, anything can shove it
    } else {
      const R = this.row(T);
      K.accel = K._smAccel0 / (1 + (T.mass + this.cargoMass(T)) / HITCH.pull.pullMass); // a loaded rig pulls (and stops) slower
      this.follow(T, K, R, dt);
      if (dt > 0) { T.vx = (T.x - px) / dt; T.vz = (T.z - pz) / dt; }
      vs.collide(T, dt);   // walls, cars, people: its own tractor and cargo excepted (linked)
      g.stunts?.step(T, dt);
      this.pin(T, K, R);   // whatever pushed it, the kingpin stays in the fifth wheel
      if (dt > 0) { T.vx = (T.x - px) / dt; T.vz = (T.z - pz) / dt; T.av = wrap(T.h - ph) / dt; }
      T.throttle = K.throttle; T.handbrake = K.handbrake;
    }
    if (dt > 0) { const k = Math.min(1, dt * 20); T._ax = (T._ax ?? 0) + ((T.vx - pvx) / dt - (T._ax ?? 0)) * k; T._az = (T._az ?? 0) + ((T.vz - pvz) / dt - (T._az ?? 0)) * k; }
    for (let i = T.cargo.length - 1; i >= 0; i--) if (!vs.list.includes(T.cargo[i])) { T.cargo[i].carriedBy = null; T.cargo.splice(i, 1); this.boxes(T); }
  }

  // The axles track; the brakes and the bends push them. Places the trailer from the kingpin.
  follow(T, K, R, dt) {
    const g = this.g, J = HITCH.jackknife, kp = this.fifth(K, W), kx = kp.x, kz = kp.z;
    const ax = T.x + Math.sin(T.h) * R.axle, az = T.z + Math.cos(T.h) * R.axle;
    let h = Math.atan2(kx - ax, kz - az);
    const sp = Math.hypot(K.vx, K.vz), fwd = K.vx * Math.sin(K.h) + K.vz * Math.cos(K.h);
    const sp0 = K._smSp ?? sp; K._smSp = sp;
    const dec = dt > 0 ? (sp0 - sp) / dt : 0;
    K._smDec = (K._smDec ?? 0) + (dec - (K._smDec ?? 0)) * Math.min(1, dt * 10);
    const load = this.loadOf(T), line = J.brakeA * (1 + load * J.loadBite);
    let phi = wrap(K.h - h);
    // The jackknife: braking harder than the trailer's locked axles can, at speed, they shove the kingpin and the rig folds.
    if (!T.jkOn && fwd > J.minSpeed && K._smDec > line) { T.jkOn = true; T.jkSign = Math.abs(phi) > J.seedAngle ? Math.sign(phi) : this.rng() < 0.5 ? -1 : 1; }
    if (T.jkOn) {
      const s = Math.abs(phi) > J.seedAngle ? Math.sign(phi) : T.jkSign;
      const w = s * (J.gain * Math.max(0, K._smDec - line) + J.sustain * sp * Math.abs(Math.sin(phi)) + (sp > 3 ? J.kick : 0));
      h -= w * dt * (1 - J.cabShare);
      const dk = w * dt * J.cabShare; // the cab folds about the kingpin the other way
      K.h += dk; K.x = kx - Math.sin(K.h) * K.tractor.fifth; K.z = kz - Math.cos(K.h) * K.tractor.fifth;
      if (sp < 2.5 || (K._smDec < line * 0.3 && Math.abs(phi) < J.seedAngle * 4)) T.jkOn = false;
    }
    // Trailer swing: through a fast bend a light trailer's axles let go and its tail slides out of the bend.
    const aL = sp * Math.abs(T.av ?? 0), grip = HITCH.swing.grip * (1 + load * J.loadBite);
    if (fwd > 4 && aL > grip) h += Math.sign(T.av) * (aL - grip) * HITCH.swing.k * dt;
    // The stop: the cab's corner against the trailer's nose.
    phi = wrap(K.h - h);
    if (Math.abs(phi) > HITCH.yawLimit) {
      h = K.h - Math.sign(phi) * HITCH.yawLimit;
      if (!T.jackknifed && sp > 3) {
        T.jackknifed = true; this.stats.jackknifes++;
        g.emit('jackknife', { tractor: K.id, trailer: T.id, speed: Math.round(sp), loaded: T.cargo.length });
        if (K.driver === g.player) { g.hud.toast('JACKKNIFED', 'hot'); g.hud.shake(0.8); g.audio?.crash?.(0.6); }
        g.vehDamage?.hit(K, kx, kz, 6, 'crash');
      }
      const k = Math.exp(-dt * J.scrub); K.vx *= k; K.vz *= k; // both scrub sideways down the road
      if (sp > 3 && Math.random() < dt * 30) { g.fx.skid(ax, az, h + Math.PI / 2); g.fx.dust(ax, az, 1); }
    }
    if (T.jackknifed && Math.abs(wrap(K.h - h)) < J.clearAt) T.jackknifed = false;
    T.h = h; T.x = kx - Math.sin(h) * R.kingpin; T.z = kz - Math.cos(h) * R.kingpin;
    T.phi = wrap(K.h - h);
  }
  // After something pushed the trailer: its axles where they were pushed to, its kingpin back in the fifth wheel.
  pin(T, K, R) {
    const kp = this.fifth(K, W), ax = T.x + Math.sin(T.h) * R.axle, az = T.z + Math.cos(T.h) * R.axle;
    let h = Math.atan2(kp.x - ax, kp.z - az);
    const phi = wrap(K.h - h);
    if (Math.abs(phi) > HITCH.yawLimit) h = K.h - Math.sign(phi) * HITCH.yawLimit;
    T.h = h; T.x = kp.x - Math.sin(h) * R.kingpin; T.z = kp.z - Math.cos(h) * R.kingpin; T.phi = wrap(K.h - h);
  }

  // ---- the ramp -------------------------------------------------------------------------------------------------------
  rampAngle(R) { return Math.asin(Math.min(0.95, R.floorY / R.ramp.len)); }
  tipZ(T, R = this.row(T)) { return R.ramp.hinge - R.ramp.len * Math.cos(this.rampAngle(R)); }
  // Height of the floor (frame z) above the trailer's ground plane: the hold's floor, the ramp down to the road, else 0.
  floorAt(T, R, lz) {
    if (lz >= R.ramp.hinge) return R.floorY;
    if (!T.rampDown) return 0;
    const tip = this.tipZ(T, R);
    return lz >= tip ? R.floorY * (lz - tip) / (R.ramp.hinge - tip) : 0;
  }
  // Lower (down = true) or raise the ramp. -> { ok, why }
  setRamp(T, down) {
    const R = this.row(T), sp = this.g.vehiclesSys.speed(T);
    if (down && sp > CARRY.rampSafe) return { ok: false, why: `too fast to drop the ramp (${sp.toFixed(1)} m/s, under ${CARRY.rampSafe})` };
    if (!down && T.cargo.some((C) => C.carry.lz < R.ramp.hinge + C.len * 0.3)) return { ok: false, why: 'a car is on the ramp' };
    T.rampWant = down ? 1 : 0;
    this.g.emit('semiRamp', { trailer: T.id, down: !!down });
    return { ok: true };
  }
  poseRamp(T) {
    const R = this.row(T), F = R.floorY, t = T.rampT, th = this.rampAngle(R), m = T.rampMesh;
    if (R.ramp.kind === 'slide') {
      const a = clamp(t / 0.35, 0, 1), b = clamp((t - 0.35) / 0.45, 0, 1), c = clamp((t - 0.8) / 0.2, 0, 1);
      if (T.doorMesh) { T.doorMesh.position.set(0, F + R.hold.h, R.ramp.hinge + 0.14); T.doorMesh.scale.y = Math.max(0.03, 1 - a); }
      m.position.set(0, c > 0 ? F : F - 0.2, R.ramp.hinge + R.ramp.len * (1 - b));
      m.rotation.x = -c * th;
    } else {
      m.position.set(0, F, R.ramp.hinge);
      m.rotation.x = 1.45 + (-th - 1.45) * t;
    }
    T.rampDown = t >= 1;
  }

  // ---- a car in a hold ------------------------------------------------------------------------------------------------
  // Can vehicle C go into trailer T's hold? -> null, or why not.
  canLoad(C, T) {
    const R = this.row(T);
    const why = fitsHold(R, VEHICLES[C.type] ?? C);
    if (why) return why;
    if (T.cargo.length >= R.maxCargo.cars) return 'the hold is full';
    if (this.cargoMass(T) + C.mass > R.maxCargo.mass) return 'too much weight in the hold';
    return null;
  }
  // C rolls aboard (its pose and its motion into the trailer's frame).
  board(C, T, how = 'ramp') {
    toLocal(T, C.x, C.z, L);
    const c = Math.cos(T.h), s = Math.sin(T.h), rx = C.x - T.x, rz = C.z - T.z;
    const fvx = T.vx + T.av * rz, fvz = T.vz - T.av * rx; // the floor's velocity under it
    const dvx = C.vx - fvx, dvz = C.vz - fvz;
    C.carry = { lx: L.x, lz: L.z, lh: wrap(C.h - T.h), lvx: dvx * c - dvz * s, lvz: dvx * s + dvz * c, lav: (C.av ?? 0) - (T.av ?? 0), chocked: false, box: [0, 0, 0, 0] };
    C.carriedBy = T; C.air = false; C.vy = 0;
    T.cargo.push(C); this.boxes(T); this.order(T);
    this.stats.boards++;
    this.g.emit('semiBoard', { vehicle: C.id, type: C.type, trailer: T.id, how, speed: +this.g.vehiclesSys.speed(T).toFixed(1) });
    if (C.driver === this.g.player) this.g.hud.toast(`UP THE RAMP INTO THE ${T.name}`, 'job');
  }
  release(C, how = 'ramp') {
    const T = C.carriedBy;
    C.carriedBy = null; C.carry = null; C._smCool = this.g.time + CARRY.board.cool;
    if (T) { const i = T.cargo.indexOf(C); if (i >= 0) T.cargo.splice(i, 1); this.boxes(T); }
    if (!C.driver) C.parked = true;
    this.stats.unloads++;
    this.g.emit('semiUnload', { vehicle: C.id, trailer: T?.id, how, speed: +this.g.vehiclesSys.speed(C).toFixed(1) });
    if (C.driver === this.g.player && how === 'ramp') this.g.hud.toast('DOWN THE RAMP AND OUT', 'job');
  }
  // Put C straight into T's hold, chocked (the freight's cargo; an agent's `semi action=load`).
  load(C, T) {
    const why = this.canLoad(C, T);
    if (why) return { ok: false, why };
    const R = this.row(T), H = R.hold;
    let z = H.z1 - C.len / 2 - 0.4;
    for (const O of T.cargo) z = Math.min(z, O.carry.lz - O.len / 2 - C.len / 2 - 0.5);
    if (z - C.len / 2 < H.z0) return { ok: false, why: 'no room left in the hold' };
    toWorld(T, 0, z, W); C.x = W.x; C.z = W.z; C.h = T.h; C.vx = T.vx; C.vz = T.vz; C.av = T.av ?? 0;
    this.board(C, T, 'load');
    C.carry.lvx = C.carry.lvz = C.carry.lav = 0; C.carry.chocked = true; C.parked = true;
    return { ok: true };
  }
  chock(C, on = true) { if (!C?.carry) return false; C.carry.chocked = !!on; if (on) { C.carry.lvx = C.carry.lvz = C.carry.lav = 0; } this.g.emit('semiChock', { vehicle: C.id, on: !!on }); return true; }
  boxes(T) { T.cargoBoxes.length = 0; for (const C of T.cargo) T.cargoBoxes.push(C.carry.box); }

  carryTick(C, dt) {
    const g = this.g, vs = g.vehiclesSys, T = C.carriedBy, d = C.carry;
    if (!T || !vs.list.includes(T) || T.sunk) { this.release(C, 'gone'); vs.drive(C, dt); vs.collide(C, dt); g.stunts?.step(C, dt); return; }
    const R = this.row(T), c = Math.cos(T.h), s = Math.sin(T.h);
    const tax = T._ax ?? 0, taz = T._az ?? 0, ax = tax * c - taz * s, az = tax * s + taz * c;
    // Into the frame: the car where it stood on the floor, moving as it moved across it.
    C.x = d.lx; C.z = d.lz; C.h = d.lh; C.vx = d.lvx; C.vz = d.lvz; C.av = d.lav; C.air = false;
    if (d.chocked) { C.vx = 0; C.vz = 0; C.av = 0; }
    else {
      // The floor pulls out from under it: along its length its brakes hold up to brakeHold (unless its driver is on the
      // pedals), across it its tyres up to tyreHold; past those it shifts by the excess.
      const ch = Math.cos(d.lh), sh = Math.sin(d.lh), along = -ax * sh - az * ch, across = -ax * ch + az * sh;
      const ea = C.throttle ? along : Math.sign(along) * Math.max(0, Math.abs(along) - CARRY.brakeHold), ec = Math.sign(across) * Math.max(0, Math.abs(across) - CARRY.tyreHold);
      C.vx += (ea * sh + ec * ch) * dt; C.vz += (ea * ch - ec * sh) * dt;
      const sk = C.skidT; C.skidT = 1e9; vs.drive(C, dt); C.skidT = sk; // no skid marks drawn at frame coordinates
    }
    this.walls(C, T, R, d);
    d.lx = C.x; d.lz = C.z; d.lh = wrap(C.h); d.lvx = C.vx; d.lvz = C.vz; d.lav = C.av;
    // Back out into the world through the trailer's pose; its velocity the floor's plus its own across it.
    toWorld(T, d.lx, d.lz, W);
    const rx = W.x - T.x, rz = W.z - T.z;
    C.x = W.x; C.z = W.z; C.h = T.h + d.lh;
    C.vx = T.vx + (T.av ?? 0) * rz + d.lvx * c + d.lvz * s;
    C.vz = T.vz - (T.av ?? 0) * rx - d.lvx * s + d.lvz * c;
    C.av = (T.av ?? 0) + d.lav;
    // On the floor, or on the ramp: each axle's height, pitched between them.
    const ch = Math.cos(d.lh), wb = C.len * 0.32;
    const hF = this.floorAt(T, R, d.lz + ch * wb), hR = this.floorAt(T, R, d.lz - ch * wb);
    T.group.updateMatrix();
    _v.set(d.lx, (hF + hR) / 2, d.lz).applyMatrix4(T.group.matrix);
    C.y = _v.y; C.gy = C.y; C.vy = 0;
    C.pitch = (T.pitch ?? 0) + Math.atan2(hF - hR, 2 * wb) * Math.sign(ch || 1); C.roll = T.roll ?? 0;
    if (g.player.inVehicle === C && T.roof) T.roof.visible = false; // the roof cuts away over you, in the car as on foot
    if (d.lz + ch * C.len / 2 < this.tipZ(T, R) - 0.3) this.release(C, 'ramp'); // its nose off the end of the ramp: on the road
  }

  // The hold's walls, its closed door, the ramp's curbs and the other cars (frame coordinates; C.x/z/h are frame values here).
  walls(C, T, R, d) {
    const H = R.hold, B = CARRY.wallBounce;
    const onRamp = C.z - C.len / 2 < R.ramp.hinge;
    const x0 = onRamp ? Math.max(H.x0, -R.ramp.width / 2) : H.x0, x1 = onRamp ? Math.min(H.x1, R.ramp.width / 2) : H.x1;
    let sn = Math.abs(Math.sin(C.h)), cs = Math.abs(Math.cos(C.h));
    let ex = sn * C.len / 2 + cs * C.wid / 2;
    for (let k = 0; k < 6 && ex > (x1 - x0) / 2; k++) { C.h *= 0.7; C.av = 0; sn = Math.abs(Math.sin(C.h)); cs = Math.abs(Math.cos(C.h)); ex = sn * C.len / 2 + cs * C.wid / 2; } // no room to turn: it squares up
    const ez = cs * C.len / 2 + sn * C.wid / 2;
    let hit = 0;
    if (C.x - ex < x0) { C.x = x0 + ex; if (C.vx < 0) { hit = Math.max(hit, -C.vx); C.vx *= -B; } }
    if (C.x + ex > x1) { C.x = x1 - ex; if (C.vx > 0) { hit = Math.max(hit, C.vx); C.vx *= -B; } }
    if (C.z + ez > H.z1) { C.z = H.z1 - ez; if (C.vz > 0) { hit = Math.max(hit, C.vz); C.vz *= -B; } }
    if (!T.rampDown && C.z - ez < H.z0) { C.z = H.z0 + ez; if (C.vz < 0) { hit = Math.max(hit, -C.vz); C.vz *= -B; } }
    for (const O of T.cargo) {
      if (O === C || !O.carry) continue;
      const od = O.carry;
      if (Math.abs(od.lx - C.x) > (O.wid + C.wid) / 2) continue;
      const gap = (O.len + C.len) / 2 + 0.1, dz = C.z - od.lz;
      if (Math.abs(dz) >= gap) continue;
      const sg = dz >= 0 ? 1 : -1;
      C.z = od.lz + sg * gap;
      if ((C.vz - od.lvz) * sg < 0) { hit = Math.max(hit, Math.abs(C.vz - od.lvz)); C.vz = od.lvz; }
    }
    C.impact = hit;
    if (hit > CARRY.wallHurt) { this.g.vehiclesSys.damage(C, (hit - CARRY.wallHurt) * 3, null); this.g.emit('semiCargoHit', { vehicle: C.id, trailer: T.id, speed: +hit.toFixed(1) }); }
    const b = d.box; b[0] = C.x - ex; b[1] = C.x + ex; b[2] = C.z - ez; b[3] = C.z + ez;
  }

  // seats.leave: getting out of a car in a hold puts you on its floor beside your door (not out on the road). -> bool
  exitInto(c, v, seat) {
    const T = v.carriedBy, d = v.carry;
    if (!T?.deck || !d) return false;
    const R = this.row(T), side = v.seats?.[seat]?.side === 'right' ? -1 : 1;
    const ox = side * (v.wid / 2 + 0.32), oz = v.len * 0.12, cs = Math.cos(d.lh), sn = Math.sin(d.lh);
    const lx = d.lx + ox * cs + oz * sn, lz = d.lz - ox * sn + oz * cs;
    if (lz < R.ramp.hinge + 0.3) return false; // still on the ramp: you step down onto the road
    return this.g.decks.mount(c, T, lx, lz, 'seat');
  }

  // ---- each frame, outside the vehicles' loop -------------------------------------------------------------------------
  update(dt) {
    const g = this.g, vs = g.vehiclesSys;
    for (let i = this.trailers.length - 1; i >= 0; i--) {
      const T = this.trailers[i];
      if (!vs.list.includes(T)) { this.trailers.splice(i, 1); T.rampMesh?.geometry.dispose(); T.doorMesh?.geometry.dispose(); T.banner?.geometry.dispose(); continue; }
      const R = this.row(T);
      if (T.rampT !== T.rampWant) {
        if (T.rampWant < T.rampT && T.cargo.some((C) => C.carry.lz < R.ramp.hinge + C.len * 0.3)) T.rampWant = 1; // a car on it: it stays down
        const step = dt / R.ramp.secs;
        T.rampT = T.rampWant > T.rampT ? Math.min(T.rampWant, T.rampT + step) : Math.max(T.rampWant, T.rampT - step);
        this.poseRamp(T);
      }
      // A ramp down on the move drags its tip: sparks off the road.
      const sp = vs.speed(T);
      if (T.rampDown && sp > 2 && Math.random() < dt * sp * HITCH.sparks) { toWorld(T, (Math.random() - 0.5) * R.ramp.width, this.tipZ(T, R), W); g.fx.sparks(W.x, 0.1, W.z, -T.vx / (sp || 1), -T.vz / (sp || 1), 3); }
      if (T.rampDown) { this.boardAt(T, R); this.rampWalkers(T, R); }
      else if (T._smWalk) this.rampWalkers(T, R);
      if (T.towedBy || T.cargo.length) this.order(T);
      // Chocks: a car left parked in a hold with the ramp up is chocked by whoever closed it.
      if (!T.rampWant) for (const C of T.cargo) if (!C.driver && !C.carry.chocked && Math.hypot(C.carry.lvx, C.carry.lvz) < 0.3) this.chock(C, true);
    }
    this.playerVerbs(dt);
    this.freightStep(dt);
  }

  // Cars square to a down ramp, nose over its tip, at a matched speed: up they go (if they fit).
  boardAt(T, R) {
    const g = this.g, tip = this.tipZ(T, R);
    for (const C of g.vehiclesSys.list) {
      if (C === T || C.carriedBy || C.trailer || C.tractor || C.dead || C.boat || !C.driver || (C._smCool ?? 0) > g.time) continue;
      if (Math.abs(C.x - T.x) > T.len || Math.abs(C.z - T.z) > T.len) continue;
      toLocal(T, C.x, C.z, L);
      const lh = wrap(C.h - T.h), front = L.z + Math.cos(lh) * C.len / 2;
      if (front < tip - 0.2 || L.z > R.ramp.hinge || Math.abs(L.x) > R.ramp.width / 2 || Math.abs(lh) > CARRY.board.angle) continue;
      const why = this.canLoad(C, T);
      if (why) {
        if ((C._smRefT ?? 0) < g.time) { C._smRefT = g.time + 3; this.stats.refused++; g.emit('semiRefused', { vehicle: C.id, type: C.type, trailer: T.id, why }); if (C.driver === g.player) g.hud.toast(`WON'T GO IN THE ${T.name}: ${why.toUpperCase()}`, 'warn'); }
        continue;
      }
      if (Math.hypot(C.vx - T.vx, C.vz - T.vz) > CARRY.board.speed) continue; // too fast: match its speed
      this.board(C, T, 'ramp');
    }
  }
  // People on foot on a down ramp walk up its slope (perched on it), and in at the top through the hold's door.
  rampWalkers(T, R) {
    const g = this.g, tip = this.tipZ(T, R);
    T._smWalk = false;
    for (const c of g.chars) {
      if (c._smRamp !== T && (!c.alive || c.inVehicle || c.onDeck || Math.abs(c.x - T.x) > T.len || Math.abs(c.z - T.z) > T.len)) continue;
      toLocal(T, c.x, c.z, L);
      const on = T.rampDown && c.alive && !c.inVehicle && !c.onDeck && L.z > tip && L.z < R.ramp.hinge && Math.abs(L.x) < R.ramp.width / 2;
      if (on) { _v.set(L.x, this.floorAt(T, R, L.z), L.z).applyMatrix4(T.group.matrix); c.perchY = Math.max(0.05, _v.y); c.gy = c.perchY; c._smRamp = T; T._smWalk = true; }
      else if (c._smRamp === T) { c._smRamp = null; if (!c.onDeck) { c.perchY = 0; g.standOn(c); } }
    }
  }

  // The player's verbs. At the wheel of a tractor: [G] couples a trailer in reach, else works the ramp of the one it pulls;
  // hold [G] to unhitch. At the wheel of a car in a hold: [G] works that trailer's ramp (you call for it).
  playerVerbs(dt) {
    const g = this.g, p = g.player, v = p.inVehicle, I = g.input;
    if (!v || p.seat !== 0 || !I) { this.gHeld = 0; return; }
    const T = v.towing ?? v.carriedBy ?? null;
    const near = v.tractor && !v.towing ? this.nearTrailer(v) : null;
    if (!v.tractor && !v.carriedBy) return;
    if (near) g.hud.prompt(near.why ? `${near.T.name}: ${near.why}` : `<kbd>G</kbd> Hitch the ${near.T.name}`);
    else if (T) g.hud.prompt(`<kbd>G</kbd> ${T.rampWant ? 'Raise' : 'Drop'} the ${T.name}'s ramp${v.towing ? ' · hold <kbd>G</kbd> to unhitch' : ''}`);
    if (I.key?.('KeyG')) { this.gHeld += dt; if (v.towing && this.gHeld > 0.6 && this.gHeld - dt <= 0.6) this.unhitch(v); return; }
    const tapped = this.gHeld > 0 && this.gHeld < 0.6; this.gHeld = 0;
    if (!tapped) return;
    if (near && !near.why) this.hitch(v, near.T);
    else if (T) { const r = this.setRamp(T, !T.rampWant); if (!r.ok) g.hud.toast(r.why.toUpperCase(), 'warn'); }
  }
  // The trailer nearest tractor K's fifth wheel (within 6 m of its kingpin), and why it can't couple yet (or null).
  nearTrailer(K) {
    const a = this.fifth(K, { x: 0, z: 0 });
    let best = null, bd = 6;
    for (const T of this.trailers) {
      if (T.towedBy || T.dead) continue;
      const b = this.kingpin(T, L), d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < bd) { bd = d; best = T; }
    }
    return best ? { T: best, why: this.canHitch(K, best) } : null;
  }

  // Keep the update order: a tractor before its trailer, a trailer before its cargo.
  order(T) {
    const list = this.g.vehiclesSys.list;
    const after = (a, b) => { const i = list.indexOf(a), j = list.indexOf(b); if (i < 0 || j < 0 || i > j) return; list.splice(i, 1); list.splice(list.indexOf(b) + 1, 0, a); };
    if (T.towedBy) after(T, T.towedBy);
    for (const C of T.cargo) after(C, T);
  }

  // ---- a whole rig ----------------------------------------------------------------------------------------------------
  // Spawn a tractor and its trailer, hitched, square on heading h (the tractor's centre at x, z).
  spawnRig(trailer, x, z, h, paint = '#7a4a24', opts = {}) {
    const vs = this.g.vehiclesSys, R = TRAILERS[trailer];
    if (!R) return null;
    const K = vs.spawn('semi', x, z, h, paint, opts);
    const f = K.tractor.fifth, kx = x + Math.sin(h) * f, kz = z + Math.cos(h) * f;
    const T = vs.spawn(R.vehicle, kx - Math.sin(h) * R.kingpin, kz - Math.cos(h) * R.kingpin, h, opts.trailerPaint ?? '#c9c2b2');
    this.initTrailer(T);
    this.hitch(K, T, true);
    return { K, T };
  }
  // A rig's measure: widest body, front of the tractor to the tail of the trailer, tallest point, wide or not.
  dims(K) {
    const T = K.towing, R = T ? this.row(T) : null;
    let tall = K.tall;
    if (T) { tall = Math.max(tall, T.tall); for (const C of T.cargo) tall = Math.max(tall, R.floorY + C.tall); }
    return { wid: Math.max(K.wid, T?.wid ?? 0), len: T ? K.len / 2 - K.tractor.fifth + R.kingpin + T.len / 2 : K.len, tall, wide: !!R?.wide };
  }
  fit(K, cls) { return fitsRoad(this.dims(K), cls); }
  under(K, kind) { return fitsUnder(this.dims(K).tall, kind); }

  // The lowest thing overhead within r of (x, z) (a box's base above head height), or Infinity. Reads the collision grid
  // (the island's cells, the streamed chunks', a live town's, the extras) without touching anything.
  overhead(x, z, r = 1.5) {
    const S = this.g.statics;
    let low = Infinity;
    const scan = (list) => { if (!list) return; for (const b of list) if (b.base > 0.6 && b.base < low && x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) low = b.base; };
    if (Math.abs(x) < 470 && Math.abs(z) < 470) scan(S.cells[S.ci(z) * S.n + S.ci(x)]);
    if (S.chunkBoxes > 0) scan(S.chunkCell(Math.floor(x / S.cell), Math.floor(z / S.cell)));
    if (S.cg?.n > 0) scan(S.cg.cell(Math.floor(x / S.cell), Math.floor(z / S.cell)));
    scan(S.extra);
    return low;
  }
  // Is there anything ahead of rig K lower than it, within `ahead` m? -> the distance to it, or 0.
  lowAhead(K, ahead = 26) {
    const tall = this.dims(K).tall + CLEARANCE.margin, fx = Math.sin(K.h), fz = Math.cos(K.h);
    for (let d = K.len / 2 + 2; d <= ahead; d += 4) if (this.overhead(K.x + fx * d, K.z + fz * d) < tall) return d;
    return 0;
  }

  // ---- the freight: hauler crews on the interstate --------------------------------------------------------------------
  get W() { return this.g.streamer?.W ?? null; }
  outside(x, z) { return Math.abs(x) > 464 || Math.abs(z) > 464; }
  lanePoint(s, dir) {
    const W = this.W, f = W.at(s), sec = W.section(s), u = dir * (sec.lane0 + (sec.lane1 - sec.lane0) / 2);
    return { x: f.x + f.nx * u, z: f.z + f.nz * u, h: Math.atan2(f.tx * dir, f.tz * dir) };
  }
  // A freight run of `kind` (FREIGHT.rigs): out on the corridor it rolls in along I-10 from `back` m behind you (near: from
  // just ahead of you); on the island it rolls along Route 66. -> the run.
  spawnFreight(kind = 'boxes', { dir = 0, near = false } = {}) {
    const g = this.g, p = g.player, rows = FREIGHT.rigs[kind];
    if (!rows) return null;
    if (this.freight) this.despawnFreight();
    const px = p.inVehicle ? p.inVehicle.x : p.x, pz = p.inVehicle ? p.inVehicle.z : p.z;
    const W = this.W, pr = W && this.outside(px, pz) ? W.project(px, pz, 2048) : null, onRoad = pr && pr.d < 1500;
    if (!dir) dir = this.rng() < 0.5 ? 1 : -1;
    const wide = rows.some((r) => r.trailer && TRAILERS[r.trailer].wide);
    const F = { kind, dir, lane: dir * 3.5, cruise: wide ? FREIGHT.wideCruise : FREIGHT.cruise, members: [], t: 0, road: onRoad ? 'I-10' : 'ROUTE 66' };
    const start = near ? 40 : 700;
    for (const r of rows) {
      let x, z, h;
      if (onRoad) { const q = this.lanePoint(Math.max(10, Math.min(W.cl.L - 10, pr.s + dir * (near ? start - r.gap : -start - r.gap))), dir); x = q.x; z = q.z; h = q.h; }
      else { x = (near ? px + dir * start : -dir * 380) - dir * r.gap; z = F.lane; h = dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      let v;
      if (r.role === 'rig') {
        const rig = this.spawnRig(r.trailer, x, z, h, r.paint, { ai: 'semi' });
        v = rig.K;
        for (const t of r.cargo ?? []) { const C = g.vehiclesSys.spawn(t, rig.T.x, rig.T.z, h, '#5a5248'); const ok = this.load(C, rig.T); if (!ok.ok) g.vehiclesSys.remove(C); }
      } else v = g.vehiclesSys.spawn(r.type, x, z, h, r.paint, { ai: 'semi' });
      v.freight = true; v.vx = Math.sin(h) * F.cruise * 0.8; v.vz = Math.cos(h) * F.cruise * 0.8;
      const crew = g.addChar({ x, z, faction: 'drifter', colors: outfit('drifter'), name: r.role === 'rig' ? 'Hauler' : 'Pilot driver', flag: CREW_FLAGS[Math.floor(this.rng() * CREW_FLAGS.length)], hp: 120 });
      if (crew) { crew.freight = true; g.seats.board(crew, v, 0); v.ai = 'semi'; }
      F.members.push({ v, role: r.role, gap: r.gap });
    }
    this.freight = F; this.count++;
    g.emit('freightSpotted', { kind, dir: dir > 0 ? 'east' : 'west', road: F.road, vehicles: F.members.map((m) => m.v.id) });
    if (wide && (onRoad || near)) g.hud.toast(`WIDE LOAD ON ${F.road} — escorted, rolling ${dir > 0 ? 'EAST' : 'WEST'}`, 'job');
    return F;
  }
  despawnFreight() {
    const F = this.freight; if (!F) return;
    const g = this.g, vs = g.vehiclesSys;
    for (const m of F.members) {
      const K = m.v, T = K.towing;
      const all = [K, T, ...(T?.cargo ?? [])].filter(Boolean);
      if (all.some((v) => v.occ?.includes(g.player)) || (T && g.player.onDeck?.v === T)) continue; // you're aboard: it's yours now
      for (const v of all) { for (const o of [...(v.occ ?? []), ...(v.deckRiders ?? [])]) if (o && o !== g.player) { if (o.onDeck) g.decks.dismount(o, 'gone', true); g.removeChar(o); } }
      if (T) { for (const C of [...T.cargo]) { C.carriedBy = null; vs.remove(C); } this.unhitch(K, 'gone'); vs.remove(T); }
      vs.remove(K);
    }
    this.freight = null;
  }
  freightStep(dt) {
    const g = this.g, F = this.freight, p = g.player;
    if (!F) {
      if (!this.W || !this.outside(p.x, p.z)) return; // the freight runs the interstate, out past Phoenix
      this.next -= dt;
      if (this.next <= 0) { this.next = FREIGHT.every[0] + this.rng() * (FREIGHT.every[1] - FREIGHT.every[0]); this.spawnFreight(this.rng() < 0.4 ? 'wideload' : 'boxes'); }
      return;
    }
    F.t += dt;
    const px = p.inVehicle ? p.inVehicle.x : p.x, pz = p.inVehicle ? p.inVehicle.z : p.z;
    if (F.members.every((m) => m.v.dead || Math.hypot(m.v.x - px, m.v.z - pz) > FREIGHT.goneR)) this.despawnFreight();
  }

  // Vehicles.aiDrive for v.ai === 'semi': hold the formation's slot along the road, the wide load's pace; stop short of
  // anything overhead lower than the rig.
  aiDrive(v, dt) {
    const g = this.g, F = this.freight, m = F?.members.find((k) => k.v === v);
    if (!m) { v.ai = 'traffic'; return; }
    const dir = F.dir, sp = g.vehiclesSys.speed(v), lead = F.members.find((k) => !k.v.dead && k.v.driver)?.v ?? v;
    let tx, tz, want = F.cruise;
    const W = this.W;
    if (W && (this.outside(v.x, v.z) || this.outside(lead.x, lead.z))) {
      const sv = W.project(v.x, v.z, 400).s, ls = W.project(lead.x, lead.z, 400).s;
      const q = this.lanePoint(sv + dir * (12 + v.len), dir);
      tx = q.x; tz = q.z;
      if (lead !== v) want = F.cruise + clamp(((ls - dir * m.gap) - sv) * dir * 0.6, -6, 6);
    } else {
      tx = v.x + dir * (14 + v.len); tz = F.lane;
      if (lead !== v) want = F.cruise + clamp(((lead.x - dir * m.gap) - v.x) * dir * 0.6, -6, 6);
    }
    v._smLowT = (v._smLowT ?? 0) - dt;
    if (v._smLowT <= 0) {
      v._smLowT = 0.3;
      const d = v.tractor ? this.lowAhead(v) : 0;
      if (d && !v._smLow) { this.stats.blocked++; g.emit('semiBlocked', { tractor: v.id, why: 'low clearance', ahead: Math.round(d), tall: +this.dims(v).tall.toFixed(2) }); }
      v._smLow = d;
    }
    if (v._smLow) { want = Math.min(want, Math.max(0, (v._smLow - v.len / 2 - 6) * 0.5)); if (want < 1) want = 0; }
    const hw = Math.atan2(tx - v.x, tz - v.z), diff = angleLerp(v.h, hw, 1) - v.h;
    v.steer = clamp(diff * 2.2, -1, 1);
    v.throttle = sp < want ? 0.8 : sp > want + 1.5 ? (want < 1 ? -1 : -0.4) : 0.1;
    v.handbrake = false;
  }

  // ---- WIDE LOAD ------------------------------------------------------------------------------------------------------
  banner() {
    if (this.bannerMat) return this.bannerMat;
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const x = cv.getContext('2d');
    x.fillStyle = '#e8b81e'; x.fillRect(0, 0, 512, 128);
    x.fillStyle = '#16130f'; x.fillRect(0, 0, 512, 10); x.fillRect(0, 118, 512, 10);
    x.font = 'bold 84px Impact, "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('WIDE LOAD', 256, 68);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    this.bannerMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
    return this.bannerMat;
  }
  // The trailer's: hung across its tail under the deck, and laid flat on the gooseneck (the camera reads it from above).
  bannerGeo(T) {
    const R = this.row(T), L = T.len, parts = [];
    parts.push(new THREE.PlaneGeometry(3.4, 0.85).rotateY(Math.PI).translate(0, 0.3, -L / 2 - 0.1));
    parts.push(new THREE.PlaneGeometry(2.3, 0.58).rotateX(-Math.PI / 2).translate(0, 1.672, R.kingpin - 0.2));
    return mergePlanes(parts);
  }
  // The tractor pulling a wide load wears one on its bumper and one on its sleeper roof.
  tractorBanner(K, on) {
    if (!on) { if (K.banner) { K.group.remove(K.banner); K.banner.geometry.dispose(); K.banner = null; } return; }
    if (K.banner) return;
    const parts = [new THREE.PlaneGeometry(2.4, 0.6).translate(0, 0.52, K.len / 2 + 0.22), new THREE.PlaneGeometry(2.2, 0.55).rotateX(-Math.PI / 2).translate(0, 3.62, -0.4)];
    K.banner = new THREE.Mesh(mergePlanes(parts), this.banner());
    K.group.add(K.banner);
  }

  // ---- what an agent sees ---------------------------------------------------------------------------------------------
  view(v) {
    if (!v) return null;
    const r2 = (n) => Math.round(n * 100) / 100;
    if (v.tractor) {
      const T = v.towing;
      return { id: v.id, kind: 'tractor', name: v.name, towing: T?.id ?? null, phi: T ? r2(T.phi ?? 0) : null, jackknifed: !!T?.jackknifed, accel: r2(v.accel), dims: this.dims(v), speed: r2(this.g.vehiclesSys.speed(v)), x: r2(v.x), z: r2(v.z), h: r2(v.h) };
    }
    if (v.trailer) {
      const R = this.row(v);
      return {
        id: v.id, kind: 'trailer', row: v.trailer, name: v.name, towedBy: v.towedBy?.id ?? null, parked: !!v.parked, phi: r2(v.phi ?? 0), jackknifed: !!v.jackknifed,
        ramp: { t: r2(v.rampT ?? 0), want: v.rampWant ?? 0, down: !!v.rampDown, tipZ: r2(this.tipZ(v, R)) },
        cargo: (v.cargo ?? []).map((C) => ({ id: C.id, type: C.type, lx: r2(C.carry.lx), lz: r2(C.carry.lz), lh: r2(C.carry.lh), chocked: !!C.carry.chocked, driver: C.driver?.id ?? null })),
        riders: (v.deckRiders ?? []).map((c) => c.id), roofHidden: v.roof ? !v.roof.visible : null,
        x: r2(v.x), z: r2(v.z), h: r2(v.h), y: r2(v.y ?? 0), speed: r2(this.g.vehiclesSys.speed(v)),
      };
    }
    if (v.carriedBy) return { id: v.id, kind: 'cargo', in: v.carriedBy.id, ...v.carry, box: undefined };
    return null;
  }
  status() {
    const F = this.freight;
    return {
      trailers: this.trailers.map((T) => this.view(T)),
      tractors: this.g.vehiclesSys.list.filter((v) => v.tractor).map((v) => this.view(v)),
      freight: F ? { kind: F.kind, dir: F.dir > 0 ? 'east' : 'west', road: F.road, members: F.members.map((m) => ({ id: m.v.id, role: m.role, type: m.v.type, trailer: m.v.towing?.id, x: Math.round(m.v.x), z: Math.round(m.v.z), low: m.v._smLow || 0 })) } : null,
      nextFreightIn: F ? null : Math.round(this.next), runs: this.count, stats: { ...this.stats },
    };
  }
}

// A handful of planes as one geometry (position, normal, uv: all of PlaneGeometry's).
function mergePlanes(list) {
  let n = 0;
  const flat = list.map((g) => g.toNonIndexed());
  for (const g of flat) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of flat) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
