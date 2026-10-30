import * as THREE from 'three';
import { coneTexture } from '../world/textures.js';
import { PART, buildBody, lampAnchors } from './vehiclebodies.js';
import { VehicleLights } from './vehiclelights.js';
import { roadLines, SPACING, GRID } from '../world/city.js';
import { clamp, angleLerp } from '../engine/rng.js';
import { STUNT } from '../data/stunts.js';
import { Decks } from './decks.js';

// Each vehicle is ONE merged, vertex-coloured mesh: 1 draw call per car (every lamp in the game
// shares 2 more, in vehiclelights.js).
// Seats: the driver is always seat 0. side = driver's left/right (left = local +x),
// row 0 = front. exposed seats (bike pillion, pickup bed) render their rider and
// can be shot / grabbed directly.
const S2 = [{ id: 'driver', side: 'left', row: 0 }, { id: 'shotgun', side: 'right', row: 0 }];
const S4 = [...S2, { id: 'backL', side: 'left', row: 1 }, { id: 'backR', side: 'right', row: 1 }];
// `reverse`: top speed backing up (m/s). `deck`: a floor you walk on while it drives (data/decks.js: the pickup's bed, the
// boats' decks; `roofDeck`: a roof you climb onto by its ladder),
// the van's cargo box, the RV's coach; systems/decks.js carries the people on it) - a walkable vehicle is a row.
export const VEHICLES = {
  rig:         { name: 'WHALER', len: 7.6, wid: 2.7, tall: 3.1, maxSpeed: 30, reverse: 11, accel: 13, turn: 1.5, grip: 5, mass: 4, hp: 450, harpoon: true, armor: 0.1, fuelCap: 160, seats: S2 },
  interceptor: { name: 'LAWMAN', len: 4.6, wid: 2.0, tall: 1.76, maxSpeed: 46, reverse: 15, accel: 22, turn: 2.4, grip: 6.5, mass: 1.4, hp: 180, armor: 0.3, fuelCap: 60, seats: S2 },
  // A town's patrol car (systems/security.js): a LAWMAN gone to seed - primer, mismatched panels, a dead lightbar, a welded ram bar (vehiclebodies.js look: 'rundown').
  bullcar: { name: 'BULL CAR', base: 'interceptor', look: 'rundown', len: 4.6, wid: 2.0, tall: 1.76, maxSpeed: 41, reverse: 14, accel: 19, turn: 2.3, grip: 6.2, mass: 1.55, hp: 210, armor: 0.36, fuelCap: 60, seats: S2 },
  buggy:       { name: 'DUNE BUGGY', len: 3.6, wid: 1.9, tall: 1.6, maxSpeed: 40, reverse: 14, accel: 26, turn: 2.9, grip: 5.2, mass: 1, hp: 110, armor: 0.45, fuelCap: 35, open: true, seats: S2 },
  // The pickup's bed is a deck now (data/decks.js pickupBed): stand in it, crouch behind its sides, shoot any way, fall
  // out. Its old standing seats (bedL, bedR) are gone: the bed is somewhere you are, not a seat.
  pickup:      { name: 'PICKUP', len: 5.0, wid: 2.2, tall: 1.95, maxSpeed: 36, reverse: 13, accel: 17, turn: 2.1, grip: 6, mass: 1.8, hp: 220, armor: 0.28, fuelCap: 80, seats: S2, deck: 'pickupBed' },
  sedan:       { name: 'SEDAN', len: 4.8, wid: 2.0, tall: 1.8, maxSpeed: 40, reverse: 14, accel: 18, turn: 2.2, grip: 6.2, mass: 1.5, hp: 170, armor: 0.32, fuelCap: 55, seats: S4 },
  // Two seats up front, then a cargo box you walk round in (data/decks.js vanCargo): a bench, a locker, a mattress.
  van:         { name: 'VAN', len: 5.4, wid: 2.25, tall: 2.1, maxSpeed: 32, reverse: 12, accel: 14, turn: 1.8, grip: 5.6, mass: 2.2, hp: 240, armor: 0.26, fuelCap: 75, seats: S2, deck: 'vanCargo', roofDeck: 'vanRoof' },
  // A home on wheels (data/decks.js rvCoach): slow, heavy, tall, and somewhere to live. Parked, it makes camp.
  rv:          { name: 'RV', len: 8.0, wid: 2.5, tall: 3.3, maxSpeed: 27, reverse: 10, accel: 10, turn: 1.35, grip: 5.4, mass: 3.6, hp: 380, armor: 0.22, fuelCap: 200, springs: 'rig', seats: S2, deck: 'rvCoach', roofDeck: 'rvRoof' },
  airboat:     { name: 'AIRBOAT', len: 4.6, wid: 2.4, tall: 2.2, maxSpeed: 34, reverse: 7, accel: 18, turn: 2.0, grip: 2.2, mass: 1.2, hp: 140, armor: 0.4, fuelCap: 50, open: true, boat: true, shallow: true,
                 seats: [{ id: 'driver', side: 'left', row: 1, exposed: 'stand' }, { id: 'bow', side: 'right', row: 0, exposed: 'stand' }], deck: 'airboatDeck' },
  jetski:      { name: 'WATERBIKE', len: 2.8, wid: 1.0, tall: 1.1, maxSpeed: 40, reverse: 5, accel: 26, turn: 3.2, grip: 2.6, mass: 0.5, hp: 60, armor: 0.6, fuelCap: 20, open: true, boat: true,
                 seats: [{ id: 'driver', side: 'left', row: 0, exposed: 'bike' }, { id: 'pillion', side: 'right', row: 1, exposed: 'bike' }] },
  gunboat:     { name: 'RAIDER GUNBOAT', len: 7.2, wid: 2.8, tall: 2.6, maxSpeed: 28, reverse: 6, accel: 12, turn: 1.3, grip: 1.8, mass: 3, hp: 380, armor: 0.15, fuelCap: 120, boat: true, seats: S4, deck: 'gunboatDeck' },
  // Water-place (docs/design/WEB_WATER_LIFE.md): a log-and-drum raft you pole across (it goes where the current takes it
  // unless you push), and a cable ferry that shuttles a river by itself (systems/waterplace.js); both decks you stand on.
  raft:        { name: 'RAFT', len: 4.4, wid: 2.8, tall: 0.6, maxSpeed: 3.2, reverse: 1.6, accel: 1.4, turn: 0.9, grip: 1.2, mass: 0.9, hp: 90, armor: 0.7, fuelCap: 0, open: true, boat: true, shallow: true, noEngine: true,
                 seats: [{ id: 'driver', side: 'left', row: 0, exposed: 'stand', at: [0.4, 0.42, -1.4] }], deck: 'raftDeck' },
  ferry:       { name: 'RIVER FERRY', len: 8.4, wid: 4.6, tall: 1.6, maxSpeed: 4, reverse: 4, accel: 1.2, turn: 0.4, grip: 1.5, mass: 6, hp: 600, armor: 0.3, fuelCap: 0, open: true, boat: true, shallow: true, noEngine: true,
                 seats: [{ id: 'driver', side: 'left', row: 0, exposed: 'stand', at: [1.6, 0.55, -3.2] }], deck: 'ferryDeck' },
  // A quad sits its rider like a bike but drives like a small car: no lean, no falling over.
  atv:         { name: 'ATV', len: 2.3, wid: 1.25, tall: 1.2, maxSpeed: 38, reverse: 12, accel: 28, turn: 3.0, grip: 5.8, mass: 0.35, hp: 85, armor: 0.6, fuelCap: 15, open: true, quad: true,
                 seats: [{ id: 'driver', side: 'left', row: 0, exposed: 'bike' }, { id: 'pillion', side: 'right', row: 1, exposed: 'bike' }] },
  // The rider and the pillion shoot any way they look (carcombat.fireFromVehicle; DRIVING.shootSpread when moving).
  bike:        { name: 'MOTORCYCLE', len: 2.15, wid: 0.8, tall: 1.25, maxSpeed: 52, reverse: 10, accel: 30, turn: 3.0, grip: 6.4, mass: 0.45, hp: 70, armor: 0.6, fuelCap: 18, open: true, bike: true,
                 seats: [{ id: 'driver', side: 'left', row: 0, exposed: 'bike' }, { id: 'pillion', side: 'right', row: 1, exposed: 'bike' }] },
  // Military (the Federal Remnant's motor pool, data/bases.js). Generic on purpose: no make, no model, no designation.
  // A seat's `at` puts an exposed rider exactly there in the body frame: the roof-ring gunner stands in the cab with
  // head and shoulders out of the hatch.
  patrol:      { name: 'PATROL TRUCK', len: 4.9, wid: 2.3, tall: 2.05, maxSpeed: 37, reverse: 13, accel: 17, turn: 2.0, grip: 6.6, mass: 2.4, hp: 330, armor: 0.2, fuelCap: 95,
                 seats: [...S4, { id: 'gunner', side: 'left', row: 1, exposed: 'stand', at: [0, 0.78, -0.35] }] },
  apc:         { name: 'ARMORED CARRIER', len: 7.0, wid: 2.85, tall: 2.6, maxSpeed: 26, reverse: 10, accel: 10, turn: 1.25, grip: 7.2, mass: 6, hp: 720, armor: 0.06, fuelCap: 220, springs: 'rig',
                 seats: [...S4, { id: 'rearL', side: 'left', row: 2 }, { id: 'rearR', side: 'right', row: 2 }, { id: 'hatch', side: 'left', row: 3, exposed: 'stand', at: [0, 1.3, 0.05] }] },
};

// How driving answers the wheel (docs/design/WEB_WALK_VEHICLES.md §Steering and reverse).
//   screenSteer   the keyboard's left and right are SCREEN-true: at the moment you press left, the car turns toward the
//                 left of the screen, whichever way it points and in reverse too (a car pointing down the screen turns
//                 clockwise). The choice is latched while the key is held, so holding it still turns a full circle.
//                 Agents and the AI keep the car's own frame (`steer` +1 = the car's left, counter-clockwise).
//   reverseAccel  backing up pulls at this share of the row's `accel` (it was 0.6, now brisker)
//   reverseShare / reverseCap   a row without `reverse` backs up at this share of its top speed, within these m/s
//   shootSpread   shooting from anything that moves: extra spread (radians, +-) per m/s, its cap, and x driver (one hand)
//   aimHold       an exposed rider (a bike, a quad, a deck seat) keeps aiming this long after a shot
export const DRIVING = {
  screenSteer: false, // Robert 10-29: A always turns the car's own left (classic), like walking; true = screen-true
  reverseAccel: 0.85, reverseShare: 0.4, reverseCap: [6, 15],
  shootSpread: { perMs: 0.004, max: 0.1, driver: 1.5 },
  aimHold: 1.2,
  // steerRate / steerReturn (1/s): the player's wheel turns toward the keys at steerRate and back to centre at
  // steerReturn, so a tapped key is a nudge, never a twitch (docs/design/WEB_FEEL.md); the AI steers its own curves.
  steerRate: 6, steerReturn: 10,
  // slide: how the car's weight follows the nose (docs/design/WEB_FEEL.md). `carry` is the share of each frame's turn the
  // velocity takes with it (1 = on rails, the old model: it never slid); the rest stays behind as sideways slip that
  // the row's `grip` pulls back in. On the handbrake only `hbCarry` follows and grip drops to `hbGrip` x: a real slide
  // you can hold, then catch by letting go. The player's car (and the feel probe) only; the AI keeps the rails for now.
  slide: { carry: 0.86, hbCarry: 0.35, hbGrip: 0.18 },
  parkBrake: 14, // m/s^2: a car its driver got out of brakes to a stop (it no longer rolls off out of reach)
};
export const reverseOf = (v) => v.reverse ?? clamp(v.maxSpeed * DRIVING.reverseShare, DRIVING.reverseCap[0], DRIVING.reverseCap[1]);

// Bodies (geometry, lamp anchors, glass layout) are built in vehiclebodies.js; PART is re-exported for damage.
export { PART };

const _v = new THREE.Vector3(), _seat = [0, 0, 0];

// Where an exposed seat's rider sits or stands, in the body's frame (+x the driver's left, +z forward, tyres on y=0).
// Astride machines put riders one behind the other on the centre line; a pickup's bed stands them side by side; an
// airboat stands its bow rider up front and its driver at the controls before the raised seat.
function seatLocal(v, si, seat, out) {
  if (seat.at) { out[0] = seat.at[0]; out[1] = seat.at[1]; out[2] = seat.at[2]; return out; } // the row says where
  if (v.bike) { out[0] = 0; out[1] = 0.12; out[2] = si === 0 ? -0.15 : -0.65; return out; }
  if (v.quad) { out[0] = 0; out[1] = 0.2; out[2] = si === 0 ? -0.22 : -0.72; return out; }
  if (v.type === 'jetski') { out[0] = 0; out[1] = 0.15; out[2] = si === 0 ? -0.05 : -0.6; return out; }
  if (v.type === 'airboat') { out[0] = seat.side === 'left' ? 0.35 : -0.35; out[1] = 0.67; out[2] = seat.row === 0 ? 1.0 : 0.35; return out; }
  out[0] = seat.side === 'left' ? 0.45 : -0.45; out[1] = 1.1; out[2] = -v.len / 2 + 1.0;
  return out;
}

export class Vehicles {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35 });
    this.wreckMat = new THREE.MeshStandardMaterial({ color: '#1a1714', roughness: 1 });
    this.coneMat = new THREE.MeshBasicMaterial({ map: coneTexture(), color: '#fff1cc', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }); // the train's headlight
    this.lights = new VehicleLights(game);
    this.decks = game.decks = new Decks(game); // walkable floors (data/decks.js): the pickup's bed, the van, the RV
    this.tmp = { x: 0, z: 0 };
    // Harpoon rope.
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.rope = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: '#d8d0c0' }));
    this.rope.frustumCulled = false;
    this.rope.visible = false;
    game.scene.add(this.rope);
    this.harpoon = null; // { from, x, z, dx, dz, dist, target, kind, len, state }
    const hg = new THREE.BoxGeometry(0.18, 0.18, 1.2);
    this.harpoonMesh = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ color: '#9a9590', metalness: 0.8, roughness: 0.3 }));
    this.harpoonMesh.visible = false;
    game.scene.add(this.harpoonMesh);
  }

  spawn(type, x, z, h, paint = '#6a2a1a', opts = {}) {
    const s = VEHICLES[type];
    const built = {};
    const geo = buildBody(s, type, paint, built); // built.roof: a walkable cabin's roof, apart (it cuts away inside)
    const mesh = new THREE.Mesh(geo, this.bodyMat.clone()); // own material: paint chars with damage
    mesh.castShadow = true; mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.rotation.order = 'YXZ'; // yaw, then wheelie pitch, then bike lean (local roll)
    group.add(mesh);
    this.g.scene.add(group);
    const v = {
      type, ...s, x, z, h, vx: 0, vz: 0, av: 0, hp: s.hp, maxHp: s.hp, group, mesh, anchors: lampAnchors(s, type),
      driver: null, ai: opts.ai ?? null, dead: false, steer: 0, throttle: 0, brake: 0, handbrake: false,
      skidT: 0, burn: 0, node: null, lights: true, paint, honk: 0, impact: 0,
    };
    this.nextVid = (this.nextVid ?? 0) + 1;
    v.id = `v${this.nextVid}`;
    v.seats = s.seats ?? VEHICLES.interceptor.seats;
    this.g.seats.init(v);
    this.g.vehDamage.init(v);
    v.lean = 0; v.wheelie = 0; v.fallen = false;
    // Vertical state (stunts.js): ride height and its speed, the ground under the wheels, body pitch/roll, in the air.
    v.y = 0; v.vy = 0; v.gy = 0; v.pitch = 0; v.roll = 0; v.air = false;
    const TW = this.g.streamer?.W; // real terrain (flag): it is made standing on the land, not under it
    if (TW?.terrain) { v.y = v.gy = TW.groundAt(x, z); }
    this.decks.init(v, built.roof); // a deck: its riders list, its roof to cut away, its camp gear
    this.list.push(v);
    this.g.vehicles = this.list;
    return v;
  }

  speed(v) { return Math.hypot(v.vx, v.vz); }

  // ---- steering for a person at the wheel --------------------------------------------------------------------------
  // Left is left (DRIVING.screenSteer). s: the input's left/right, +1 = screen-left (A), -1 = screen-right (D), any
  // value between for a stick. Returns the car-frame steer drive() uses (+1 = the car's left, counter-clockwise). At
  // the moment the input goes left (or right) we look at where the nose points ON SCREEN, through the real camera (so
  // any camera yaw or zoom is answered): nose up the screen, the car's left IS screen-left; nose down the screen, it is
  // screen-right, so the sign flips. drive() already turns the tail the car's way in reverse, so the same rule makes
  // a reversing car's tail swing to screen-left. Latched while held: hold A and the car keeps turning, full circle.
  screenSteer(v, s) {
    if (!s || !DRIVING.screenSteer || this.g.cam?.eff() === 'CHASE') { v.steerLatch = 0; return s; } // CHASE: the car's own left (systems/camrig.js)
    const dir = Math.sign(s);
    if (!v.steerLatch || v.steerDir !== dir) { v.steerDir = dir; v.steerLatch = this.noseUp(v) ? 1 : -1; }
    return s * v.steerLatch;
  }

  // Does v's nose point up the screen (through the camera that draws it)?
  noseUp(v) {
    const cam = this.g.camera;
    if (!cam) return Math.cos(v.h) <= 0;
    cam.updateMatrixWorld();
    _v.set(v.x, 0, v.z).project(cam); const y0 = _v.y;
    _v.set(v.x + Math.sin(v.h) * 2, 0, v.z + Math.cos(v.h) * 2).project(cam);
    return _v.y >= y0; // NDC y grows up the screen
  }

  // A car-frame steer that turns v toward world direction (dx, dz): for a stick that points where you want to go (the
  // controller's lane). Backing up, it swings the tail that way.
  steerToward(v, dx, dz) {
    const rev = v.vx * Math.sin(v.h) + v.vz * Math.cos(v.h) < -0.5;
    const want = Math.atan2(rev ? -dx : dx, rev ? -dz : dz);
    return clamp((angleLerp(v.h, want, 1) - v.h) * 2.5 * (rev ? -1 : 1), -1, 1);
  }

  // Take a vehicle out of the world entirely (despawn), occupants leave on foot first.
  remove(v) {
    for (const o of [...(v.occ ?? [])]) if (o) { if (o === this.g.player) this.g.exitVehicle(true); else this.g.seats.leave(o, true); }
    v.driver = null;
    this.decks.drop(v); // whoever stands on its deck steps down; its boxes go with it
    this.g.scene.remove(v.group);
    v.mesh.geometry.dispose(); v.mesh.material.dispose();
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
    if (this.g.lastVehicle === v) this.g.lastVehicle = null;
  }

  // A land vehicle that stayed in deep water floods and goes under. Everyone swims for it.
  sink(v) {
    if (v.sunk) return;
    v.sunk = true; v.dead = true; v.hp = 0;
    for (const o of [...(v.occ ?? [])]) if (o) { if (o === this.g.player) this.g.exitVehicle(true); else this.g.seats.leave(o, true); }
    v.driver = null;
    this.g.emit('vehicleSank', { vehicle: v.id });
    if (this.g.lastVehicle === v) this.g.hud.toast(`${v.name} SANK`, 'warn');
  }

  // Collision discs along the body's long axis (reused scratch array per vehicle).
  discs(v) {
    const n = Math.max(2, Math.round(v.len / v.wid) + 1), r = v.wid * 0.52;
    const fx = Math.sin(v.h), fz = Math.cos(v.h), span = v.len - r * 2;
    v._discs ??= Array.from({ length: n }, () => ({ x: 0, z: 0, r }));
    for (let k = 0; k < n; k++) { const o = (k / (n - 1) - 0.5) * span; const d = v._discs[k]; d.x = v.x + fx * o; d.z = v.z + fz * o; d.r = r; }
    return v._discs;
  }

  damage(v, amt, attacker) {
    if (v.dead || v.onFire) return;
    v.hp -= amt;
    if (attacker === this.g.player) v.hitByPlayer = true;
    if (v.driver === this.g.player) {
      // Aggregate per attacker so the log stays readable.
      const k = attacker?.id ?? 'impact';
      v.dmgLog ??= {}; v.dmgLog[k] = (v.dmgLog[k] ?? 0) + amt;
    }
    if (v.driver && attacker && v.driver !== this.g.player) this.g.ai.onDamaged(v.driver, attacker);
    if (v.hp <= 0) {
      // Catches fire first: a few seconds to bail out before it blows.
      v.hp = 0; v.onFire = 4; v.fireBy = attacker;
      if (v.driver === this.g.player) this.g.hud.toast('VEHICLE ON FIRE — BAIL OUT [F]', 'hot');
      for (const o of [...(v.occ ?? [])]) if (o && o !== this.g.player) { this.g.seats.leave(o); if (o.faction !== 'ally') { o.flee = 4; o.fleeX = v.x; o.fleeZ = v.z; } }
    }
  }

  explode(v, attacker) {
    const g = this.g;
    v.dead = true; v.hp = 0;
    v.mesh.material = this.wreckMat;
    v.burn = 25;
    g.fx.explosion(v.x, v.z);
    g.audio.explosion(Math.hypot(v.x - g.player.x, v.z - g.player.z));
    g.hud.shake(1.2);
    // Blast: hurt everyone close, throw the driver out dead.
    for (const c of g.chars) {
      if (!c.alive) continue;
      const cx = c.inVehicle ? c.inVehicle.x : c.x, cz = c.inVehicle ? c.inVehicle.z : c.z;
      const d = Math.hypot(cx - v.x, cz - v.z);
      if (c.inVehicle === v) {
        if (c === g.player) g.exitVehicle(true);
        else g.seats.leave(c, true);
        g.combat.damage(c, 999, attacker, 1, 0, 'explosion');
      } else if (d < 7 && !c.inVehicle) {
        g.combat.damage(c, 120 * (1 - d / 7), attacker, (cx - v.x) / (d || 1), (cz - v.z) / (d || 1), 'explosion');
      }
    }
    v.driver = null;
    g.interiors?.blast(v.x, v.z, 9, attacker); // windows blow in, doors fly, locks give
    if (v.dmg) { for (const z of Object.keys(v.dmg.zones)) v.dmg.zones[z] = Math.min(1, v.dmg.zones[z] + 0.45); v.dmg.dirty = true; v.dmg.deformT = 0; for (const p of ['hood', 'bumperF', 'doorL', 'doorR']) if (Math.random() < 0.6) g.vehDamage.detach(v, p, p === 'hood' || p === 'bumperF' ? 'front' : p === 'doorL' ? 'left' : 'right', 20); g.vehDamage.deform(v); }
    v.vx *= 0.3; v.vz *= 0.3;
    v.av = (Math.random() - 0.5) * 4;
    for (const o of this.list) {
      if (o === v || o.dead) continue;
      const d = Math.hypot(o.x - v.x, o.z - v.z);
      if (d < 9) this.damage(o, 60 * (1 - d / 9), attacker);
    }
  }

  // ---- driving model -----------------------------------------------------------
  drive(v, dt) {
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    const rx = fz, rz = -fx;
    let fwd = v.vx * fx + v.vz * fz;
    let side = v.vx * rx + v.vz * rz;
    const sp = Math.abs(fwd);
    const fxm = this.g.vehDamage.effects(v, dt); // engine/radiator/fuel/tyres/lights
    if (v.air) {
      // Off the ground there is nothing to push on: no throttle, no steering, no grip. The ramp chose your line;
      // a spin you took off with keeps turning. stunts.js flies the vertical half and lands it.
      const drag = Math.exp(-dt * STUNT.airDrag);
      v.vx *= drag; v.vz *= drag;
      v.h += v.av * dt; v.av *= Math.exp(-dt * 0.5);
      v.x += v.vx * dt; v.z += v.vz * dt;
      if (v.bike) { v.lean *= Math.exp(-dt * 2); v.wheelie = 0; }
      v.depth = 0;
      return { fwd, side };
    }
    let topSpeed = v.maxSpeed * fxm.top * (v.treadTop ?? 1); // treadTop: road tyres on pavement (workshop.js)
    const mud = this.g.towing ? this.g.towing.ground(v, dt, fxm) : 1; // soft ground holds a car that spins in it (systems/towing.js)
    // Water: boats need it, everything else drowns in it.
    const depth0 = this.g.water ? this.g.water.depthAt(v.x, v.z, false, v.boat ? -Infinity : v.y) : 0; // y: a car up on a river's deck is dry; a boat under it is not
    const wade = v.boat ? 0 : v.wadeLift ?? 0; // wadeLift: big tyres hold the hull out of a ford (garage.retune)
    const depth = wade ? Math.max(0, depth0 - wade) : depth0;
    v.depth = depth;
    if (v.boat) {
      const afloat = depth > (v.shallow ? 0.12 : 0.55);
      if (!afloat) { fwd *= Math.exp(-dt * 5); side *= Math.exp(-dt * 8); fxm.power *= 0.08; } // beached
    } else if (depth > 0.55) {
      fwd *= Math.exp(-dt * depth * 1.6); side *= Math.exp(-dt * depth * 2);
      fxm.power *= Math.max(0, 1 - depth * 0.6);
      if (depth > 1.1 && !v.dead) {
        v.flood = (v.flood ?? 0) + dt;
        if (v.dmg) v.dmg.engine = Math.max(0, v.dmg.engine - dt * 0.35);
        if (v.flood > 5) this.sink(v);
      }
      if (this.speed(v) > 4 && Math.random() < dt * 20) this.g.fx.spawn(2, v.x + (Math.random() - 0.5) * v.wid, v.y + 0.4, v.z + (Math.random() - 0.5) * v.len, (Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3, 0.7, 0.4, '#d8e4e4', 3);
    } else if (depth > 0.15) {
      // A ford (WEB_RIVERS: shallower than `ford`): the water drags at the wheels and sprays off them.
      fwd *= Math.exp(-dt * depth * 2.2); side *= Math.exp(-dt * depth * 1.4); fxm.power *= 1 - depth * 0.6;
      if (this.speed(v) > 3 && Math.random() < dt * (10 + this.speed(v))) this.g.fx.spawn(2, v.x + (Math.random() - 0.5) * v.wid, v.y + 0.3, v.z + (Math.random() - 0.5) * v.len, (Math.random() - 0.5) * 3.5, 2.6, (Math.random() - 0.5) * 3.5, 0.6, 0.35, '#d6dccc', 3);
    }
    if (!v.dead && v.driver && !v.fallen) {
      // Backing up: the row's own reverse speed (reverseOf), pulling at DRIVING.reverseAccel of its accel and tapering
      // near the top as the forward gears do. It was a flat 0.6 x accel to 35% of top speed for every rig.
      const rev = reverseOf(v) * fxm.top;
      if (v.throttle > 0) fwd += v.accel * fxm.power * v.throttle * dt * (1 - clamp(fwd / topSpeed, 0, 1) * 0.85);
      else if (v.throttle < 0) {
        if (fwd > 0.5) fwd -= v.accel * 2.2 * (fxm.brake ?? 1) * -v.throttle * dt; // the brakes (fxm.brake: worn, upkeep.js)
        else fwd -= (v.reverseAccel ?? v.accel * DRIVING.reverseAccel) * fxm.power * -v.throttle * dt * (1 - clamp(-fwd / rev, 0, 1) * 0.6);
      }
      if (fwd < -rev) fwd = -rev;
      // Steering bites with speed, softens at top speed.
      let st = v.steer;
      if (v.driver === this.g.player || v.feelProbe) { // the wheel eases toward the keys (DRIVING.steerRate)
        const back = Math.abs(v.steer) < Math.abs(v.steerIn ?? 0) || v.steer * (v.steerIn ?? 0) < 0, r = (back ? DRIVING.steerReturn : DRIVING.steerRate) * dt;
        v.steerIn = st = clamp(v.steer, (v.steerIn ?? 0) - r, (v.steerIn ?? 0) + r);
      }
      const steerAmt = (st + fxm.pull * clamp(sp / 10, 0, 1)) * v.turn * (v.driver === this.g.player ? this.g.deep?.fx.handling ?? 1 : 1) * clamp(sp / 7, 0, 1) * (1 - clamp(sp / v.maxSpeed, 0, 1) * 0.35) * (v.wheelie > 0.15 ? 0.35 : 1);
      // A plain lerp: av is a rate, not an angle. angleLerp wrapped the gap into ±π, so a car kicked past π rad/s (a
      // crash, a shove) settled on the target + 2πk instead and spun at ~28 rad/s for good, in place, at 16 m/s,
      // flattening anyone near it (a traffic LAWMAN spinning by the sheriff's corner ran bounty-run's player down).
      v.av += (steerAmt * Math.sign(fwd || 1) - v.av) * Math.min(1, dt * 10);
    } else {
      v.av *= Math.exp(-dt * 2);
      // Left in park (Seats.leave: you got out of the driver's seat): the brakes hold it. A car you stepped out of
      // used to coast on at 1.4/s drag - 7 m from 10 m/s - out of the 4 m you can get back in from.
      if (v.parked && !v.dead) { const s = Math.sign(fwd), b = DRIVING.parkBrake * dt; fwd = Math.abs(fwd) > b ? fwd - s * b : 0; }
    }
    // Turn about the rear axle, not the body's centre: the nose swings into the turn and the tail
    // follows, the way front-wheel steering looks. Rotating about the centre swings the tail out as
    // far as the nose swings in, which reads as forklift steering. A handbrake drift, a spin from a
    // hit or a driverless roll still turns about the centre of mass; a hull's stern swings out.
    const dh = v.av * dt;
    const pivot = !v.driver || v.dead || v.fallen || v.handbrake ? 0 : v.len * (v.boat ? -0.2 : v.bike ? 0.32 : 0.3);
    if (pivot) { v.x += pivot * (Math.sin(v.h + dh) - Math.sin(v.h)); v.z += pivot * (Math.cos(v.h + dh) - Math.cos(v.h)); }
    v.h += dh;
    // Rolling drag and lateral grip (handbrake = drift).
    const grip = (v.handbrake ? v.grip * DRIVING.slide.hbGrip : v.grip) * fxm.grip * (v.fallen ? 0.3 : 1) * (v.gripMul ?? 1) * (v.roadGrip ?? 1) * (v.treadGrip ?? 1); // gripMul: an oil slick (garage.js); roadGrip: the street's surface row (systems/citygen.js); treadGrip: the tyres on this ground (workshop.js)
    if (v.bike) {
      // Lean into the turn; wheelie on boost at low speed; a fallen bike just slides.
      const targetLean = v.fallen ? 1.35 : clamp(-v.av * sp * 0.032, -0.7, 0.7);
      v.lean += (targetLean - v.lean) * Math.min(1, dt * (v.fallen ? 3 : 8));
      const wantWheelie = !v.fallen && v.boost && v.throttle > 0 && sp > 3 && sp < 24;
      v.wheelie += ((wantWheelie ? 0.42 : 0) - v.wheelie) * Math.min(1, dt * (wantWheelie ? 2.5 : 6));
    }
    if (dh && (v.driver === this.g.player || v.feelProbe) && !v.boat) { // the weight lags the nose (DRIVING.slide)
      const a = (1 - (v.handbrake ? DRIVING.slide.hbCarry : DRIVING.slide.carry)) * dh, ca = Math.cos(a), sa = Math.sin(a), f0 = fwd;
      fwd = f0 * ca + side * sa; side = side * ca - f0 * sa;
    }
    fwd *= Math.exp(-dt * (v.driver && !v.dead ? (v.handbrake ? 1.2 : 0.18) : v.towedBy ? this.g.towing.drag(v) : 1.4)) * mud; // towed: it rolls in neutral (systems/towing.js)
    side *= Math.exp(-dt * grip);
    const nfx = Math.sin(v.h), nfz = Math.cos(v.h);
    v.vx = nfx * fwd + nfz * side;
    v.vz = nfz * fwd - nfx * side;
    v.x += v.vx * dt; v.z += v.vz * dt;

    // Skid marks + dust when sliding.
    v.skidT -= dt;
    if ((Math.abs(side) > 4.5 || (v.handbrake && sp > 6)) && v.skidT <= 0) {
      v.skidT = 0.035;
      for (const s of [-1, 1]) this.g.fx.skid(v.x - nfx * v.len * 0.35 + nfz * s * v.wid * 0.4, v.z - nfz * v.len * 0.35 - nfx * s * v.wid * 0.4, v.h);
      if (Math.random() < 0.5) this.g.fx.dust(v.x - nfx * v.len * 0.4, v.z - nfz * v.len * 0.4, 1);
      if (v.driver === this.g.player) this.g.audio.skid(Math.abs(side) / 10);
    }
    return { fwd, side };
  }

  collide(v, dt) {
    const g = this.g;
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    const r = v.wid * 0.55;
    const pre = this.speed(v);
    let hitN = 0;
    const n = Math.max(2, Math.round(v.len / v.wid));
    // Collision heights are measured from the ground the box stands on: on real terrain (flag) the car's height is
    // taken from the ground under it too (groundAt is 0 when the flag is off).
    const W = g.streamer?.W, vy0 = W?.terrain ? v.y - W.groundAt(v.x, v.z) : v.y, sinP = Math.sin(v.pitch), own = v.air ? v.toRamp : v.ramp; // a ramp never blocks the car using it
    for (let k = 0; k < n; k++) {
      const off = (k / (n - 1) - 0.5) * (v.len - r * 1.6);
      const t = this.tmp;
      t.x = v.x + fx * off; t.z = v.z + fz * off;
      const ox = t.x, oz = t.z;
      // Each disc rides as high as that end of the body: the nose of a car climbing a ramp, or the whole car in
      // the air, passes over whatever is lower than it (a wreck, a ramp's own lip). A car flings doors open and
      // smashes window glass.
      if (g.statics.resolveCircle(t, r, v, vy0 + sinP * off, own, vy0 + sinP * off + v.tall) > 0) { // topY: a bridge parapet overhead is not in the way
        const dx = t.x - ox, dz = t.z - oz;
        v.x += dx; v.z += dz;
        const d = Math.hypot(dx, dz) || 1;
        const nx = dx / d, nz = dz / d;
        const vn = v.vx * nx + v.vz * nz;
        g.look?.scrape(v, t.x - nx * r, t.z - nz * r, nx, nz); // scraped metal and sparks along the wall (systems/lookfeel.js)
        if (vn < 0) { v.vx -= vn * nx * 1.35; v.vz -= vn * nz * 1.35; if (-vn > hitN) { v._hitX = t.x - nx * r; v._hitZ = t.z - nz * r; } hitN = Math.max(hitN, -vn); }
        // Glancing hits spin the car.
        v.av += (off > 0 ? 1 : -1) * (nx * fz - nz * fx) * Math.min(3, -vn * 0.08);
      }
    }
    if (v.air && hitN > (v.airHit ?? 0)) v.airHit = hitN; // a jump that meets a wall on the way down is a crash
    if (hitN > 4 && v.dmg) g.vehDamage.hit(v, v._hitX, v._hitZ, hitN, 'crash'); // dent where it actually hit
    if (v.bike && hitN > 7 && v.occ?.some(Boolean)) { v.fallen = true; g.seats.ejectAll(v, 1.2); g.audio.crash(0.8); }
    if (hitN > 8) {
      this.damage(v, (hitN - 8) * 2.2 / v.mass * 2, null);
      g.fx.sparks(v.x + fx * v.len * 0.5, 0.8, v.z + fz * v.len * 0.5, -fx, -fz, 8);
      if (v.driver === g.player) { g.hud.shake(Math.min(1, hitN / 25)); g.audio.crash(hitN / 30); }
      g.look?.onCrash(v, hitN); // skids, the hit-stop, the screen dirt, cracked glass (systems/lookfeel.js)
    }
    // Vehicle vs vehicle: each body is a chain of discs along its length (a long rig is
    // 3-4 discs, a buggy 2), so cars can't slide into the side of a truck.
    for (const o of this.list) {
      if (o === v || g.semis?.linked(v, o)) continue; // a tractor and its trailer; a car in a hold (systems/semis.js)
      const reach = (v.len + o.len) * 0.5 + 1;
      if (Math.abs(o.x - v.x) > reach || Math.abs(o.z - v.z) > reach) continue;
      if (v.y > o.y + o.tall * 0.85 || o.y > v.y + v.tall * 0.85) continue; // one is flying over the other
      if ((v.climbing || o.climbing) && g.workshop?.climbs(v, o)) continue; // a monster truck up on (or going up onto) a car
      if (g.towing && (v.carriedBy === o || o.carriedBy === v || v.hauling === o || o.hauling === v || (g.towing.links.length && g.towing.linked(v, o)))) continue; // a hitch's two halves, a boat on its trailer (systems/towing.js)
      const vd = this.discs(v), od = this.discs(o);
      let best = null;
      for (const a of vd) for (const b of od) {
        const dx = b.x - a.x, dz = b.z - a.z, min = a.r + b.r, d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), pen = min - d;
        if (!best || pen > best.pen) best = { pen, nx: dx / d, nz: dz / d, px: (a.x + b.x) / 2, pz: (a.z + b.z) / 2 };
      }
      if (!best) continue;
      const { pen, nx, nz } = best;
      const tm = v.mass + o.mass;
      v.x -= nx * pen * (o.mass / tm); v.z -= nz * pen * (o.mass / tm);
      o.x += nx * pen * (v.mass / tm); o.z += nz * pen * (v.mass / tm);
      const rv = (o.vx - v.vx) * nx + (o.vz - v.vz) * nz;
      if (rv < 0 && g.workshop?.climbStart(v, o, -rv)) continue; // fast enough, nose-first, on monster tyres: up and over
      if (rv < 0) {
        const j = -1.4 * rv / (1 / v.mass + 1 / o.mass);
        v.vx -= (j / v.mass) * nx; v.vz -= (j / v.mass) * nz;
        o.vx += (j / o.mass) * nx; o.vz += (j / o.mass) * nz;
        // Off-centre hits spin the car that got hit.
        const lever = (best.px - o.x) * Math.cos(o.h) - (best.pz - o.z) * Math.sin(o.h);
        o.av += lever * -rv * 0.08 / o.mass + (Math.random() - 0.5) * -rv * 0.1 / o.mass;
        g.vehDamage.hit(v, best.px, best.pz, -rv, 'crash');
        g.vehDamage.hit(o, best.px, best.pz, -rv, 'crash');
        for (const b of [v, o]) if (b.bike && -rv > 5 && b.occ?.some(Boolean)) { b.fallen = true; g.seats.ejectAll(b, 1.4); }
        if (-rv > 6) {
          const G = g.garage; // a ram plate, a cowcatcher or spikes on the face that hit hand out more (data/workshop.js ARMOR ram)
          this.damage(o, -rv * 1.6 * (v.mass / o.mass) * (v.plates ? G.ramMul(v, best.px, best.pz) : 1), v.driver);
          this.damage(v, -rv * 1.6 * (o.mass / v.mass) * (o.plates ? G.ramMul(o, best.px, best.pz) : 1), o.driver);
          g.fx.sparks(best.px, 1, best.pz, nx, nz, 10);
          if (v.driver === g.player || o.driver === g.player) { g.hud.shake(Math.min(1, -rv / 20)); g.audio.crash(-rv / 25); }
          g.look?.onCrash(v, -rv, o);
        }
      }
    }
    // Run people over.
    const sp = this.speed(v);
    for (const c of g.chars) {
      if (!c.alive || c.inVehicle || c.dragged || c.grabbing || c.onDeck || (c.mv && sp < 2)) continue; // a deck's riders are up on a vehicle, not on the road; a vault goes over a parked one (systems/moves.js)
      const dx = c.x - v.x, dz = c.z - v.z;
      if (Math.abs(dx) > v.len || Math.abs(dz) > v.len) continue;
      const along = dx * fx + dz * fz, across = dx * fz - dz * fx;
      if (Math.abs(along) < v.len / 2 + 0.3 && Math.abs(across) < v.wid / 2 + 0.3) {
        if (v.y > 0.3 && Math.abs(v.y - (g.stunts?.heightAt(c.x, c.z, c.gy ?? 0) ?? 0)) > 1.5) continue; // over their head (or they are under the bridge)
        if (sp > 6) {
          const dn = sp || 1;
          g.combat.damage(c, sp * 7, v.driver, v.vx / dn, v.vz / dn, 'vehicle');
          if (v.driver === g.player) g.hud.shake(0.25);
        }
        // Shove out sideways.
        const push = v.wid / 2 + 0.35 - Math.abs(across);
        const s = across >= 0 ? 1 : -1;
        c.x += fz * push * s; c.z += -fx * push * s;
        if (!c.alive) { c.x += v.vx * dt; c.z += v.vz * dt; }
      }
    }
    v.impact = pre - this.speed(v);
  }

  // ---- traffic AI: follow the road grid lane by lane ---------------------------------
  pickNode(v) {
    // Snap to nearest intersection then choose a neighbour that isn't straight back.
    const snap = (val) => clamp(Math.round((val + GRID) / SPACING), 0, roadLines.length - 1);
    const i = snap(v.x), j = snap(v.z);
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => {
      const ni = i + a, nj = j + b;
      if (ni < 0 || nj < 0 || ni >= roadLines.length || nj >= roadLines.length) return false;
      if (v.from && v.from[0] === ni && v.from[1] === nj) return false;
      return true;
    });
    const [a, b] = opts[Math.floor(Math.random() * opts.length)];
    v.from = [i, j];
    v.node = [i + a, j + b];
  }

  aiDrive(v, dt) {
    const g = this.g;
    if (v.ai === 'traffic') {
      if (!v.node) this.pickNode(v);
      const tx0 = roadLines[v.node[0]], tz0 = roadLines[v.node[1]];
      const fx0 = roadLines[v.from[0]], fz0 = roadLines[v.from[1]];
      const dx = Math.sign(tx0 - fx0), dz = Math.sign(tz0 - fz0);
      // Drive on the right: lane offset perpendicular to travel.
      const tx = tx0 - dz * 3.5, tz = tz0 + dx * 3.5;
      const want = Math.atan2(tx - v.x, tz - v.z);
      const d = Math.hypot(tx - v.x, tz - v.z);
      if (d < 6) { this.pickNode(v); }
      const diff = angleLerp(v.h, want, 1) - v.h;
      v.steer = clamp(diff * 2.2, -1, 1);
      let target = 13 * (Math.abs(diff) > 0.5 ? 0.45 : 1);
      // Brake for anything ahead.
      const fx = Math.sin(v.h), fz = Math.cos(v.h);
      for (const o of this.list) {
        if (o === v) continue;
        const ox = o.x - v.x, oz = o.z - v.z;
        const along = ox * fx + oz * fz, across = Math.abs(ox * fz - oz * fx);
        if (along > 0 && along < 12 && across < 3) target = Math.min(target, Math.max(0, along - 6));
      }
      // Brake (and honk) for anyone on foot in the lane ahead — never run townsfolk over.
      for (const c of g.chars) {
        if (!c.alive || c.inVehicle) continue;
        const ox = c.x - v.x, oz = c.z - v.z;
        if (Math.abs(ox) > 14 || Math.abs(oz) > 14) continue;
        const along = ox * fx + oz * fz, across = Math.abs(ox * fz - oz * fx);
        if (along > 0 && along < 11 && across < v.wid * 0.5 + 1.2) {
          target = 0;
          v.honk -= dt;
          if (v.honk <= 0) { g.audio.horn(Math.hypot(c.x - g.player.x, c.z - g.player.z)); v.honk = 2.5; }
        }
      }
      const sp = this.speed(v);
      v.throttle = sp < target ? 0.7 : sp > target + 2 ? -0.6 : 0;
      v.handbrake = false;
    } else if (v.ai === 'boatPatrol') {
      // Circle the lake; close in and strafe the player when they're near the water.
      const L = g.water ? { x: 390, z: 398 } : { x: v.x, z: v.z };
      const p = g.player, px = p.inVehicle ? p.inVehicle.x : p.x, pz = p.inVehicle ? p.inVehicle.z : p.z;
      const pd = Math.hypot(px - v.x, pz - v.z), seen = !p.underwater; // dived under: lost
      let tx, tz;
      if (seen && pd < 60 && g.water.depthAt(px, pz) > 0.4) { tx = px; tz = pz; }
      else { v.patrolA = (v.patrolA ?? 0) + dt * 0.18; tx = L.x + Math.cos(v.patrolA) * 32; tz = L.z + Math.sin(v.patrolA) * 32; }
      const want = Math.atan2(tx - v.x, tz - v.z);
      v.steer = clamp((angleLerp(v.h, want, 1) - v.h) * 2, -1, 1);
      v.throttle = pd < 12 ? 0.3 : 0.75;
      for (const o of v.occ ?? []) if (o && o.alive && o.weapon && seen && pd < 35 && g.ai.hostile(o, p)) {
        o.cool -= dt;
        if (o.cool <= 0) { o.cool = 0.4 + Math.random() * 0.6; g.carCombat.fireFromVehicle(o, v, o.weapon, Math.atan2(px - v.x, pz - v.z) + (Math.random() - 0.5) * 0.2); }
      }
    } else if (v.ai === 'chauffeur') {
      // An ally at the wheel: drive the player's GPS route, or cruise the grid.
      const wp = g.qol.waypoint ?? g.qol.objective()?.target;
      if (!wp) { v.ai = 'traffic'; v.node = null; this.aiDrive(v, dt); v.ai = 'chauffeur'; return; }
      v.routeT = (v.routeT ?? 0) - dt;
      if (v.routeT <= 0 || !v.route) { v.routeT = 2; v.route = g.nav.car.find(v.x, v.z, wp.x, wp.z) ?? [{ x: wp.x, z: wp.z }]; v.ri = 0; }
      let tgt = v.route[v.ri] ?? { x: wp.x, z: wp.z };
      if (Math.hypot(tgt.x - v.x, tgt.z - v.z) < 8 && v.ri < v.route.length - 1) { v.ri++; tgt = v.route[v.ri]; }
      const dEnd = Math.hypot(wp.x - v.x, wp.z - v.z);
      const want = Math.atan2(tgt.x - v.x, tgt.z - v.z);
      const diff = angleLerp(v.h, want, 1) - v.h;
      v.steer = clamp(diff * 2.2, -1, 1);
      const sp = this.speed(v);
      v.throttle = dEnd < 10 ? (sp > 1 ? -1 : 0) : Math.abs(diff) > 0.7 && sp > 12 ? -0.3 : 0.85;
      v.handbrake = false;
    } else if (v.ai === 'convoy') {
      g.convoy.drive(v, dt);
    } else if (v.ai === 'semi') {
      g.semis.aiDrive(v, dt); // the freight's rigs and pilot cars (systems/semis.js)
    } else if (v.ai === 'raider') {
      // Hunt the player's vehicle; ram it.
      const p = g.player;
      const px = p.inVehicle ? p.inVehicle.x : p.x, pz = p.inVehicle ? p.inVehicle.z : p.z;
      const d = Math.hypot(px - v.x, pz - v.z);
      if (d > 140) { v.throttle = 0; return; }
      const lead = p.inVehicle ? 0.5 : 0;
      const tx = px + (p.inVehicle ? p.inVehicle.vx * lead : 0), tz = pz + (p.inVehicle ? p.inVehicle.vz * lead : 0);
      const want = Math.atan2(tx - v.x, tz - v.z);
      const diff = angleLerp(v.h, want, 1) - v.h;
      v.steer = clamp(diff * 2.5, -1, 1);
      if ((v.blindUntil ?? 0) > g.time) v.steer = clamp(v.steer + Math.sin(g.time * 7.3 + v.x) * 0.9, -1, 1); // painted glass: driving blind (systems/workshop.js)
      if (v.mounts) g.workshop?.aiFire(v, tx, tz, dt); // its own guns, rockets and droppers, through their arcs
      v.throttle = d < 8 && !p.inVehicle ? 0.3 : 1;
      v.handbrake = Math.abs(diff) > 1.2 && this.speed(v) > 12;
      // Passenger takes shots when lined up.
      if (v.driver && v.driver.weapon && d < 30) {
        v.driver.cool -= dt;
        if (v.driver.cool <= 0 && g.statics.lineOfSight(v.x, v.z, px, pz)) {
          v.driver.cool = 0.35 + Math.random() * 0.5;
          // Drive-by: fire from the window. firingFrom makes the shot ignore this car;
          // keep our own reference — the shot can set v.driver to null (fire, explosion).
          g.carCombat.fireFromVehicle(v.driver, v, 'smg', want + (Math.random() - 0.5) * 0.25);
        }
      }
    }
    g.gadgets?.steer(v, dt); // a chain or a strip in the road: brake, or go round it (systems/gadgets.js)
  }

  // ---- harpoon -------------------------------------------------------------------------
  // opts (a workshop mount, data/workshop.js): front = thrown off the nose, not the tail; grapple = { lengths, hook }: the
  // chain reaches lengths x this car's length and bites one throw in `hook`, the rest skid off and reel back in.
  fireHarpoon(v, ang, opts = {}) {
    if (this.harpoon) {
      if (this.harpoon.state === 'attached') this.yank();
      return;
    }
    const end = opts.front ? 1 : -1, off = opts.front ? v.len / 2 - 0.2 : 1.4;
    const ox = v.x + Math.sin(v.h) * off * end, oz = v.z + Math.cos(v.h) * off * end;
    const G = opts.grapple;
    this.harpoon = { from: v, x: ox, z: oz, dx: Math.sin(ang), dz: Math.cos(ang), dist: 0, target: null, kind: null, state: 'flying', len: 0,
      end, off, reach: G ? G.lengths * v.len : 48, hook: G ? G.hook : 1, grapple: !!G };
    this.g.audio.harpoon();
    this.g.hud.shake(0.3);
  }

  yank() {
    const h = this.harpoon;
    const g = this.g;
    if (g.kit?.winchYank(h)) { g.hud.shake(0.6); this.releaseHarpoon(); return; } // the winch pulls the near door off instead (systems/kit.js)
    const v = h.from;
    if (h.kind === 'veh') {
      const t = h.target;
      // Rip it sideways: violent lateral impulse + spin. Lighter targets fly.
      const dx = v.x - t.x, dz = v.z - t.z, d = Math.hypot(dx, dz) || 1;
      const perpX = -dz / d, perpZ = dx / d;
      const side = (t.vx * perpX + t.vz * perpZ) >= 0 ? 1 : -1;
      const k = 26 / t.mass;
      t.vx += (dx / d) * k * 0.7 + perpX * side * k; t.vz += (dz / d) * k * 0.7 + perpZ * side * k;
      t.av += side * 7 / t.mass;
      this.damage(t, 45, g.player);
      g.fx.sparks(t.x, 1, t.z, dx / d, dz / d, 16);
      g.hud.toast('YANKED!', 'hot');
    } else if (h.kind === 'char') {
      const c = h.target;
      if (c.alive) g.combat.damage(c, 999, g.player, (v.x - c.x) / 10, (v.z - c.z) / 10, 'explosion');
      g.fx.gibs(c.x, c.z, 0, 0, 12);
      c.dragged = null;
    }
    g.audio.yank();
    g.hud.shake(0.8);
    this.releaseHarpoon();
  }

  releaseHarpoon() {
    if (this.harpoon?.kind === 'char' && this.harpoon.target) this.harpoon.target.dragged = null;
    this.harpoon = null;
    this.rope.visible = false;
    this.harpoonMesh.visible = false;
  }

  updateHarpoon(dt) {
    const h = this.harpoon;
    if (!h) return;
    const g = this.g;
    const v = h.from;
    if (v.dead || v.driver !== g.player) { this.releaseHarpoon(); return; }
    const ax = v.x + Math.sin(v.h) * (h.off ?? 1.4) * (h.end ?? -1), az = v.z + Math.cos(v.h) * (h.off ?? 1.4) * (h.end ?? -1);
    let bx, bz;
    if (h.state === 'flying') {
      const step = 95 * dt;
      // Check walls, vehicles, people along this step.
      const wallT = g.statics.raycast(h.x, h.z, h.dx, h.dz, step);
      let hit = null, kind = null, best = wallT;
      for (const o of this.list) {
        if (o === v) continue;
        const d = Math.hypot(o.x - (h.x + h.dx * step * 0.5), o.z - (h.z + h.dz * step * 0.5));
        if (d < o.len * 0.55 + step * 0.5) { hit = o; kind = 'veh'; best = 0; break; }
      }
      if (!hit) for (const c of g.chars) {
        if (!c.alive || c.inVehicle || c === g.player) continue;
        const d = Math.hypot(c.x - (h.x + h.dx * step * 0.5), c.z - (h.z + h.dz * step * 0.5));
        if (d < 0.8 + step * 0.5) { hit = c; kind = 'char'; best = 0; break; }
      }
      if (hit && Math.random() >= h.hook) { // a grapple that didn't bite: it skids off and reels in
        g.fx.sparks(h.x, 1.2, h.z, -h.dx, -h.dz, 6); g.audio.clank();
        g.emit('grappleMiss', { vehicle: v.id, target: hit.id });
        if (v.driver === g.player) g.hud.toast('DIDN\'T BITE — REELING IN', 'warn');
        h.state = 'retract'; hit = null;
      }
      if (hit) {
        h.state = 'attached'; h.target = hit; h.kind = kind;
        g.emit('grappleHit', { vehicle: v.id, target: hit.id, kind, grapple: h.grapple });
        h.len = Math.max(6, Math.hypot(hit.x - ax, hit.z - az));
        if (kind === 'char') {
          hit.dragged = h; g.combat.damage(hit, 55, g.player, h.dx, h.dz, 'bullet');
          g.hud.toast(`HARPOONED ${hit.name ?? 'RAIDER'}`, 'hot');
        } else {
          this.damage(hit, 20, g.player);
          g.fx.sparks(hit.x, 1.2, hit.z, -h.dx, -h.dz, 12);
          g.hud.toast(h.grapple ? 'HOOKED — FIRE AGAIN TO YANK' : 'HOOKED — [H] TO YANK', 'hot');
          if (hit.driver && hit.driver !== g.player) g.ai.onDamaged(hit.driver, g.player);
        }
        g.audio.clank();
      } else if (wallT < step) {
        h.x += h.dx * wallT; h.z += h.dz * wallT;
        if (g.kit?.hookDoor(v, h.x, h.z)) { g.audio.clank(); this.releaseHarpoon(); return; } // a winch bites the door by the wall it struck (systems/kit.js)
        g.fx.sparks(h.x, 1.2, h.z, -h.dx, -h.dz, 8);
        g.audio.clank();
        h.state = 'retract';
      } else {
        h.x += h.dx * step; h.z += h.dz * step; h.dist += step;
        if (h.dist > h.reach) h.state = 'retract'; // the end of the chain
      }
      bx = h.x; bz = h.z;
    } else if (h.state === 'retract') {
      const dx = ax - h.x, dz = az - h.z, d = Math.hypot(dx, dz);
      if (d < 2) { this.releaseHarpoon(); return; }
      h.x += (dx / d) * 70 * dt; h.z += (dz / d) * 70 * dt;
      bx = h.x; bz = h.z;
    } else {
      const t = h.target;
      bx = t.x; bz = t.z;
      const dx = t.x - ax, dz = t.z - az, d = Math.hypot(dx, dz) || 1;
      if (h.kind === 'veh') {
        if (t.dead && d > h.len * 1.8) { this.releaseHarpoon(); return; }
        if (d > h.len) {
          // Rope goes taut: pull both, mostly the lighter one.
          const nx = dx / d, nz = dz / d;
          const rel = (t.vx - v.vx) * nx + (t.vz - v.vz) * nz;
          const tm = v.mass + t.mass;
          if (rel > 0) {
            t.vx -= nx * rel * (v.mass / tm); t.vz -= nz * rel * (v.mass / tm);
            v.vx += nx * rel * (t.mass / tm); v.vz += nz * rel * (t.mass / tm);
          }
          const pen = d - h.len;
          t.x -= nx * pen * (v.mass / tm); t.z -= nz * pen * (v.mass / tm);
          v.x += nx * pen * (t.mass / tm); v.z += nz * pen * (t.mass / tm);
          // Towed car fishtails.
          t.av += (Math.random() - 0.5) * 0.6;
          if (pen > 4) { g.fx.sparks(ax, 1.5, az, nx, nz, 3); this.releaseHarpoon(); g.hud.toast('CABLE SNAPPED', 'warn'); return; }
        }
      } else {
        // Dragging a body: leave a blood trail.
        if (d > h.len) {
          const nx = dx / d, nz = dz / d;
          t.x = ax + nx * h.len; t.z = az + nz * h.len;
          if (Math.random() < 0.6) g.fx.decal(t.x, t.z, 0.6 + Math.random() * 0.6, '#5a0505', Math.atan2(nx, nz));
          if (t.alive && Math.random() < dt * 2) g.combat.damage(t, 8, g.player, nx, nz);
          t.face = Math.atan2(-nx, -nz);
        }
      }
    }
    const p = this.rope.geometry.attributes.position.array;
    p[0] = ax; p[1] = 2.6; p[2] = az; p[3] = bx; p[4] = 1.2; p[5] = bz;
    this.rope.geometry.attributes.position.needsUpdate = true;
    this.rope.visible = true;
    if (h.state !== 'attached') {
      this.harpoonMesh.visible = true;
      this.harpoonMesh.position.set(bx, 1.4, bz);
      this.harpoonMesh.rotation.set(0, Math.atan2(h.dx, h.dz), 0);
    } else this.harpoonMesh.visible = false;
  }

  update(dt, night) {
    const g = this.g;
    this.coneMat.opacity = 0.04 + night * 0.62;
    if (!this.decks.placed) this.decks.placeWorld(); // the RV in the middle of nowhere (data/decks.js PLACED)
    g.towing?.pre(dt); // tow lines pull before anything drives (systems/towing.js)
    for (const v of this.list) {
      this.decks.capture(v); // its deck's riders back into its frame before it moves (systems/decks.js)
      if (v.driver && v.driver !== g.player && !v.dead) this.aiDrive(v, dt);
      if (!v.driver) { v.throttle = 0; v.steer = 0; }
      if (!g.semis?.tick(v, dt)) { // a trailer moves through its tractor, a car in a hold through its trailer (systems/semis.js)
        this.drive(v, dt);
        this.collide(v, dt);
        g.stunts?.step(v, dt); // the vertical half: ride the ground on its springs, fly, land
      }
      const lit = (!!v.driver || !!v.towedBy?.driver) && !v.dead;
      // Brake lights: braking (throttle against the direction of travel) or the handbrake flares them.
      const fwd = v.vx * Math.sin(v.h) + v.vz * Math.cos(v.h);
      v.braking = lit && (v.handbrake || (v.throttle < 0 && fwd > 0.5) || (v.throttle > 0 && fwd < -0.5));
      // Paint chars and darkens as the vehicle is damaged.
      if (!v.dead) { const dmg = 1 - v.hp / v.maxHp; v.mesh.material.color.setRGB(1 - dmg * 0.6, 1 - dmg * 0.65, 1 - dmg * 0.7); }
      // The body: ride height (a landing can sink it into its springs, but never the tyres into the dirt), pitched and
      // rolled to the ground or to the arc it is flying; a bike adds its lean and its wheelie.
      v.group.position.set(v.x, Math.max(v.y, v.gy - 0.07) + (v.liftY ?? 0) + (v.climbY ?? 0), v.z); // liftY: monster tyres; climbY: up on a car it is crushing (workshop.js)
      v.group.rotation.set(-v.pitch, v.h, v.roll);
      if (v.bike) { v.group.rotation.z += v.lean; v.group.rotation.x -= v.wheelie; v.group.position.y += v.wheelie * 0.25; }
      if (v.boat) {
        // Bob on the swell, bank into turns, throw a wake.
        const t = g.time + v.x * 0.1;
        const afloat = (v.depth ?? 0) > 0.12;
        // On the water's own surface (0 on the island; a streamed river's or lake's surface past it, world/rivers.js), on
        // the ground when beached. v.y follows, so a deck and the piers know where the hull is.
        const wy = g.water.surfaceAt ? g.water.surfaceAt(v.x, v.z, NaN) : 0, base = Number.isFinite(wy) ? wy : (g.stunts?.ext && g.stunts.outside(v.x, v.z) ? g.stunts.heightAt(v.x, v.z) : 0);
        if (afloat || g.stunts?.outside?.(v.x, v.z)) { v.y = base; v.gy = base; }
        if (g.waves) g.waves.ride(v, dt, base, afloat); // heave, pitch and roll off the real swell; a waterbike flies a crest (world/waves.js)
        else {
          v.group.position.y = afloat ? base - 0.18 + Math.sin(t * 2.1) * 0.06 : base + 0.05;
          v.group.rotation.x = afloat ? Math.sin(t * 1.7) * 0.03 - Math.min(0.12, this.speed(v) * 0.004) : 0;
          v.group.rotation.z = afloat ? Math.sin(t * 1.3) * 0.04 + clamp(-v.av * this.speed(v) * 0.01, -0.2, 0.2) : 0.06;
          v.lean = v.group.rotation.z; v.wheelie = -v.group.rotation.x;
        }
        const sp = this.speed(v);
        if (afloat && sp > 3 && Math.random() < dt * (10 + sp)) {
          const bx = v.x - Math.sin(v.h) * v.len * 0.5, bz = v.z - Math.cos(v.h) * v.len * 0.5;
          g.fx.spawn(2, bx + (Math.random() - 0.5) * v.wid, 0.15, bz + (Math.random() - 0.5) * v.wid, -Math.cos(v.h) * (Math.random() - 0.5) * 3, 0.4, Math.sin(v.h) * (Math.random() - 0.5) * 3, 1.6, 0.6, '#e6eeee', 0.2);
        }
      }
      // Going under: the hull settles a little more each frame (it used to restart from the surface every frame).
      if (v.sunk) { v.sinkFloor ??= v.group.position.y - 1.7; v.sinkY = Math.max(v.sinkFloor, (v.sinkY ?? v.group.position.y) - dt * 0.6); v.group.position.y = v.sinkY; } // 1.7 m under where it went down (the island's surface is 0)
      this.decks.carry(v, dt); // and out again through where it is now: the deck carries them
      // Everyone aboard rides with the car; exposed seats (saddle, truck bed, boat deck) show their rider, placed
      // through the body's own transform so a rider pitches over a jump and bobs with a hull.
      if (v.occ) {
        v.group.updateMatrix();
        for (let si = 0; si < v.occ.length; si++) {
          const o = v.occ[si];
          if (!o) continue;
          if (!o.alive && o !== g.player) { v.occ[si] = null; if (v.driver === o) v.driver = null; o.inVehicle = null; o.seat = null; o.seatPose = null; continue; }
          o.x = v.x; o.z = v.z;
          const seat = v.seats[si];
          if (!seat.exposed) { o.seatPose = null; continue; }
          seatLocal(v, si, seat, _seat);
          _v.set(_seat[0], _seat[1], _seat[2]).applyMatrix4(v.group.matrix);
          const sp = (o._seatPose ??= { x: 0, y: 0, z: 0, h: 0, lean: 0, pitch: 0, kind: '', twist: 0 });
          sp.x = _v.x; sp.y = _v.y; sp.z = _v.z;
          // Shooting from an exposed seat: a standing gunner turns whole; a rider astride (a bike, a quad) turns at the
          // waist, legs on the machine, up to all but straight back (characters.js twists the upper body).
          o.aiming = g.time - (o.lastShotT ?? -99) < DRIVING.aimHold;
          sp.h = o.aiming && seat.exposed === 'stand' ? o.face : v.h;
          sp.twist = o.aiming && seat.exposed === 'bike' ? clamp(angleLerp(v.h, o.face, 1) - v.h, -2.7, 2.7) : 0;
          sp.lean = v.group.rotation.z; sp.pitch = v.group.rotation.x; sp.kind = seat.exposed;
          o.seatPose = sp;
        }
      }
      if (v.onFire) {
        v.onFire -= dt;
        if (Math.random() < dt * 30) this.g.fx.spawn(4, v.x + (Math.random() - 0.5) * v.wid, 1.4, v.z + (Math.random() - 0.5) * v.len * 0.6, 0, 3, 0, 0.45, 0.3, '#ff7a1a', -1);
        if (v.onFire <= 0) { v.onFire = 0; this.explode(v, v.fireBy); }
      }
      // Damaged cars smoke; wrecks burn.
      if (!v.dead && v.hp < v.maxHp * 0.35 && Math.random() < dt * 8) g.fx.smoke(v.x + Math.sin(v.h) * v.len * 0.35, 1.4, v.z + Math.cos(v.h) * v.len * 0.35, true);
      if (v.burn > 0) {
        v.burn -= dt;
        if (Math.random() < dt * 20) g.fx.spawn(4, v.x + (Math.random() - 0.5) * v.wid, 1.5, v.z + (Math.random() - 0.5) * v.len * 0.6, 0, 3 + Math.random() * 2, 0, 0.5, 0.35, Math.random() < 0.5 ? '#ff9a2a' : '#ff5a1a', -1);
        if (Math.random() < dt * 6) g.fx.smoke(v.x, 2, v.z, true);
      }
    }
    g.towing?.post(dt); // bars place what they tow, boats ride their trailers, the lines are drawn
    g.stunts?.update(); // blob shadows under whatever is in the air
    this.lights.update(night, g.time);
    this.updateHarpoon(dt);
  }
}
