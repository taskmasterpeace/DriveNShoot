import * as THREE from 'three';
import { deckOf, DECK_RULES as R, CAMP, PLACED } from '../data/decks.js';
import { STANCES, PRONE } from '../data/stance.js';
import { ITEMS } from '../data/items.js';

// Walkable vehicles (docs/design/WEB_WALK_VEHICLES.md, WEB_DECKS_STANCE.md): a vehicle row's `deck` (data/decks.js) is a
// floor that rides with the vehicle - a pickup's bed, a van's cargo box, an RV's coach, a boat's deck, the trundle's aisle -
// and its `roofDeck` a second one up top (a van's, an RV's, the trundle's roof), reached by its ladder. The people on
// them are on foot (not in a seat): they walk, crouch, lie prone, shoot, sleep, open its boxes, and the floor carries them.
//
// How a moving floor works here. A rider keeps their position in the VEHICLE's frame (c.onDeck.lx, lz). Each frame, in
// Vehicles.update:
//   capture(v)  before the vehicle moves: wherever the rider walked this frame (main.js / ai.js move them in the world,
//               as on the street) goes back into the vehicle's frame through the pose it had when they were last put
//               down. There they meet the deck's walls and furniture, and walk out of a door or dive over a rail.
//   carry(v)    after it moved: the frame position goes back out through the new pose. Pure 2D (x, z, heading) both
//               ways, so nothing drifts; the height comes from the body's full transform (pitch, a jump, springs).
// So a rider never slides however fast the floor goes: the floor's own motion is never applied to them as a velocity.
// What a moving floor does to people is written as events instead: a felt acceleration (filtered; a boat adds its chop),
// the speed a crash takes off in one frame, and a hard landing stagger them; past the open-deck lines they are thrown
// out (DECK_RULES). Every line is times the rider's FOOTING (systems/stance.js: QUICKNESS x the stance's brace, D3).
//
// Riders: c.onDeck = { v, lx, lz, D } (D: which of v's decks); c.perchY = the floor's height (characters.js and
// Game.standOn stand them on it); c.firingFrom = v (combat.js: their own vehicle never stops their rounds). v.deckRiders
// lists them (both decks). A prone rider's whole body (head, hips, feet: data/stance.js) stays on the floor and out of
// the furniture; its heading is kept in the vehicle's frame (c.onDeck.bh), so it turns with the vehicle.
const EDGES = ['front', 'rear', 'left', 'right'];
const NORMAL = { front: [0, 1], rear: [0, -1], left: [1, 0], right: [-1, 0] };
const ENDS = [1, -1], TURNS = [0, 0.26, -0.26, 0.52, -0.52, 0.79, -0.79, 1.05, -1.05, 1.31, -1.31, 1.57];
const _v = new THREE.Vector3(), L = { x: 0, z: 0 }, W = { x: 0, z: 0 }, Q = { x: 0, z: 0 }, E = { x: 0, z: 0 };

// Body frame <-> world, in the plane: +x the driver's left, +z forward (seats.doorPos, carcombat.sideOfLocal).
function toLocal(ref, x, z, out) { const dx = x - ref.x, dz = z - ref.z, c = Math.cos(ref.h), s = Math.sin(ref.h); out.x = dx * c - dz * s; out.z = dx * s + dz * c; return out; }
function toWorld(ref, lx, lz, out) { const c = Math.cos(ref.h), s = Math.sin(ref.h); out.x = ref.x + lx * c + lz * s; out.z = ref.z - lx * s + lz * c; return out; }
const edgeLine = (D, e) => (e === 'front' ? D.floor[3] : e === 'rear' ? D.floor[2] : e === 'left' ? D.floor[1] : D.floor[0]);
// Signed distance of a frame point past an edge (+ outside), and its coordinate along that edge.
const past = (D, e, p) => (e === 'front' ? p.z - D.floor[3] : e === 'rear' ? D.floor[2] - p.z : e === 'left' ? p.x - D.floor[1] : D.floor[0] - p.x);
const along = (e, p) => (e === 'front' || e === 'rear' ? p.x : p.z);
const solidBoxes = (D) => (D._solid ??= [...(D.fixtures ?? []), ...(D.containers ?? []), ...(D.beds ?? [])].filter((f) => (f.h ?? 1) >= R.stepH));
const centre = (b) => [(b.box[0] + b.box[1]) / 2, (b.box[2] + b.box[3]) / 2];
const boxDist = (b, p) => Math.hypot(Math.max(b.box[0] - p.x, 0, p.x - b.box[1]), Math.max(b.box[2] - p.z, 0, p.z - b.box[3]));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const deckOfRider = (c) => c.onDeck?.D ?? c.onDeck?.v.deck;

export class Decks {
  constructor(game) {
    this.g = game;
    this.list = [];               // vehicles with a deck
    this.awningMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    this.warnT = 0;
    this.sprayT = 0;
    this.hud = { show: false, share: 0, word: '', footing: 1 }; // the player's footing, for the HUD prompt (main.js)
  }

  // ---- vehicles --------------------------------------------------------------------------------------------------
  // Vehicles.spawn: give a vehicle with a deck its riders list, its roof (to cut away) and its camp gear.
  init(v, roofGeo) {
    const D = deckOf(v.deck), U = deckOf(v.roofDeck);
    if (!D && !U) { v.deck = null; v.roofDeck = null; return; }
    v.deck = D ?? U; v.roofDeck = D ? U : null; // a roof alone is the vehicle's deck
    v.deckRiders = [];
    v.tank = v.deck.tank ? { litres: v.deck.tank * 0.5, cap: v.deck.tank } : null;
    v.camp = false; v.campT = 0;
    if (roofGeo) { v.roof = new THREE.Mesh(roofGeo, v.mesh.material); v.roof.castShadow = true; v.roof.receiveShadow = true; v.group.add(v.roof); }
    if (v.deck.camp) { v.awning = new THREE.Mesh(awningGeometry(v), this.awningMat); v.awning.visible = false; v.awning.castShadow = true; v.group.add(v.awning); }
    this.list.push(v);
  }
  decksOf(v) { return v.roofDeck ? [v.deck, v.roofDeck] : [v.deck]; }
  deckByKey(v, key) { return this.decksOf(v).find((D) => D.key === key) ?? v.deck; }

  // Vehicles.remove: its riders step down where they are, its boxes go with it.
  drop(v) {
    if (!v.deck) return;
    for (const c of [...v.deckRiders]) this.dismount(c, 'gone');
    const inv = this.g.inventory;
    for (const row of v.deck.containers ?? []) { const b = inv?.boxes.get(`deck:${v._dkBoxes}:${row.id}`); if (b) { if (inv.opened === b) inv.opened = null; inv.boxes.delete(b.id); } }
    v.roof?.geometry.dispose(); v.awning?.geometry.dispose();
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
  }

  // A deck's containers are the inventory's boxes (the PACK screen opens them, a save keeps them), with ids from the
  // vehicle's id. Registered once the vehicle has its final id (a restored vehicle is spawned, then renamed).
  ensureBoxes(v) {
    const inv = this.g.inventory;
    if (!inv || v._dkBoxes === v.id) return;
    for (const row of v.deck.containers ?? []) {
      const old = v._dkBoxes && inv.boxes.get(`deck:${v._dkBoxes}:${row.id}`);
      const id = `deck:${v.id}:${row.id}`;
      let b = inv.boxes.get(id);
      if (!b) {
        b = inv.place(id, row.loot ?? 'trunk', v.x, v.z, row.cap, `${row.label} · ${v.name}`);
        if (!row.loot) b.rolled = true; // your own storage starts empty
        if (old) { b.slots = old.slots; b.rolled = old.rolled; }
      }
      b.deck = v; b.deckRow = row;
      if (old) inv.boxes.delete(old.id);
    }
    v._dkBoxes = v.id;
  }

  crew(D) { return D.crew ?? Math.max(2, Math.floor(((D.floor[1] - D.floor[0]) * (D.floor[3] - D.floor[2])) / 1.1)); }
  room(v, D = v?.deck) {
    if (!v?.deck || v.dead || !D) return false;
    let n = 0;
    for (const c of v.deckRiders) if (deckOfRider(c) === D) n++;
    return n < this.crew(D);
  }
  floorY(v, lx, lz, D = v.deck) { v.group.updateMatrix(); return _v.set(lx, D.y, lz).applyMatrix4(v.group.matrix).y; }

  // ---- on and off ------------------------------------------------------------------------------------------------
  // Put c on v's deck D (default its main one) at frame point (lx, lz) (pushed to the nearest free floor).
  // how: walked | climbed | seat | load | ladder | ...
  mount(c, v, lx, lz, how = 'climbed', D = v?.deck) {
    if (!v?.deck || v.dead || !D) return false;
    if (c.inVehicle) this.g.seats.leave(c, true);
    if (c.onDeck) this.dismount(c, 'switch', true);
    if (c.grabbing) this.g.carCombat.letGo(c);
    if (c.prone && !D.open) c.prone = false; // D2: no lying down in a cabin
    L.x = lx; L.z = lz;
    c.onDeck = { v, lx: L.x, lz: L.z, D, bh: wrap((c.proneH ?? c.face ?? 0) - v.h) };
    this.settle(v, c, L);
    c.onDeck.lx = L.x; c.onDeck.lz = L.z;
    v.deckRiders.push(c);
    c.firingFrom = v; c.dive = 0; c.vault = null; c.storey = null;
    toWorld(v, L.x, L.z, W);
    c.x = W.x; c.z = W.z;
    c.perchY = Math.max(0.05, this.floorY(v, L.x, L.z, D)); c.gy = c.perchY;
    if (c !== this.g.player) { c.wx = c.x; c.wz = c.z; }
    this.g.emit('deckBoard', { id: c.id, vehicle: v.id, how, deck: D.key });
    if (c === this.g.player && how !== 'load') this.g.hud.toast(D === v.roofDeck ? `ON THE ROOF OF THE ${v.name} · [E] AT THE LADDER TO CLIMB DOWN` : D.open ? `ON THE ${v.boat ? 'DECK' : 'BED'} OF THE ${v.name} · [SPACE] OVER THE SIDE` : `INSIDE THE ${v.name}`, 'job');
    return true;
  }

  // Off the deck, at world (x, z) if given (else where they stand). Stepping off a moving floor hurts past hopSafe.
  dismount(c, how = 'walked', silent = false, x, z) {
    const d = c.onDeck;
    if (!d) return;
    const v = d.v;
    c.onDeck = null; c.perchY = 0; c.stoop = false; c.proneLen = undefined;
    if (c.firingFrom === v) c.firingFrom = null;
    const i = v.deckRiders.indexOf(c);
    if (i >= 0) v.deckRiders.splice(i, 1);
    if (x !== undefined) { Q.x = x; Q.z = z; this.g.statics.resolveCircle(Q, 0.4); c.x = Q.x; c.z = Q.z; }
    if (c.prone) c.proneH = wrap(d.bh + v.h);
    c.gy = 0; this.g.standOn(c);
    if (c.prone) this.g.stance?.fitNow(c);
    if (silent) return;
    const sp = this.g.vehiclesSys.speed(v);
    if ((how === 'door' || how === 'vault') && sp > R.hopSafe && c.alive) {
      const dn = sp || 1;
      this.g.combat.damage(c, (sp - R.hopSafe) * R.hopHurt * (c === this.g.player ? 0.7 : 1), null, v.vx / dn, v.vz / dn, 'bullet');
      c.knockT = c.knockMax = 0.9;
      this.g.emit('deckFall', { id: c.id, vehicle: v.id, speed: Math.round(sp) });
    }
    this.g.emit('deckLeave', { id: c.id, vehicle: v.id, how, deck: d.D?.key });
  }

  // Push a frame point onto the free floor: out of the furniture, inside the walls (no doors, no rails). A prone rider's
  // head and feet too (the hips move so that all three are on the floor).
  settle(v, c, p) {
    const D = deckOfRider(c) ?? v.deck, r = R.radius;
    for (let it = 0; it < 3; it++) {
      for (const f of solidBoxes(D)) pushOut(f.box, p, r);
      p.x = Math.min(D.floor[1] - r, Math.max(D.floor[0] + r, p.x));
      p.z = Math.min(D.floor[3] - r, Math.max(D.floor[2] + r, p.z));
      for (const f of solidBoxes(D)) pushOut(f.box, p, r);
      if (!c.prone || !this.proneFit(D, c, p)) break;
    }
    if (c.prone) this.fitProne(D, c, p);
  }

  // The whole prone body onto the floor: the hips pushed until head and feet are clear; if the floor is too short that
  // way (a pickup bed with its toolbox), the body turns a little at a time until it lies the way it fits; if no way
  // does, the knees draw up (c.proneLen: a shorter body). Never anything over a rail or inside a box.
  fitProne(D, c, p) {
    const d = c.onDeck, base = d.bh, b = STANCES.prone.body;
    c.proneLen = b.len;
    for (const t of TURNS) {
      d.bh = base + t;
      const x0 = p.x, z0 = p.z;
      for (let it = 0; it < 4 && this.proneFit(D, c, p); it++);
      if (this.overhangAt(D, c, p.x, p.z) < 1e-3) return;
      p.x = x0; p.z = z0;
    }
    d.bh = base;
    for (let len = b.len - 0.1; len >= 0.3; len -= 0.1) {
      c.proneLen = len;
      for (let it = 0; it < 4 && this.proneFit(D, c, p); it++);
      if (this.overhangAt(D, c, p.x, p.z) < 1e-3) return;
    }
  }

  // A prone body on deck D at hips p: push the hips so that its head and feet circles are on the floor and out of the
  // furniture. Returns true if it moved them (call again until it doesn't). bh: the body's heading in the frame.
  proneFit(D, c, p) {
    const b = STANCES.prone.body, bh = c.onDeck?.bh ?? 0, fx = Math.sin(bh), fz = Math.cos(bh), len = c.proneLen ?? b.len;
    let moved = false;
    for (const k of ENDS) {
      E.x = p.x + fx * len * k; E.z = p.z + fz * len * k;
      const x0 = E.x, z0 = E.z;
      for (const f of solidBoxes(D)) pushOut(f.box, E, b.r);
      E.x = Math.min(D.floor[1] - b.r, Math.max(D.floor[0] + b.r, E.x));
      E.z = Math.min(D.floor[3] - b.r, Math.max(D.floor[2] + b.r, E.z));
      if (Math.abs(E.x - x0) > 1e-5 || Math.abs(E.z - z0) > 1e-5) { p.x += E.x - x0; p.z += E.z - z0; moved = true; }
    }
    return moved;
  }
  // The selftest's probe: is any of a prone rider's three circles off the floor or inside a fixture? (frame metres)
  proneOverhang(c) {
    const d = c.onDeck;
    return d?.D && c.prone ? this.overhangAt(d.D, c, d.lx, d.lz) : 0;
  }
  overhangAt(D, c, lx, lz) {
    const b = STANCES.prone.body, bh = c.onDeck.bh, fx = Math.sin(bh), fz = Math.cos(bh), len = c.proneLen ?? b.len;
    let worst = 0;
    for (let k = -1; k <= 1; k++) {
      const x = lx + fx * len * k, z = lz + fz * len * k, r = k ? b.r : R.radius;
      worst = Math.max(worst, D.floor[0] - (x - r), (x + r) - D.floor[1], D.floor[2] - (z - r), (z + r) - D.floor[3]);
      for (const f of solidBoxes(D)) { // inside a box: how deep
        const cx = Math.max(f.box[0], Math.min(f.box[1], x)), cz = Math.max(f.box[2], Math.min(f.box[3], z));
        worst = Math.max(worst, r - Math.hypot(x - cx, z - cz));
      }
    }
    return Math.max(0, worst);
  }

  // Can c climb aboard v from where they stand (E)? An open bed: from over its rails. A cabin: at one of its doors. A
  // roof: at the foot of its ladder. Returns the prompt, or null.
  canClimb(v, c) {
    if (!v?.deck || v.dead || c.onDeck || c.inVehicle || c.prone || this.g.vehiclesSys.speed(v) > R.doorWalkIn) return null;
    toLocal(v, c.x, c.z, L);
    const lad = this.ladderAt(v, L, 'at');
    if (lad && this.room(v, v.roofDeck) && this.g.vehiclesSys.speed(v) <= R.ladderSafe) return `Climb the ladder onto the ${v.name}'s roof`;
    const D = v.deck;
    if (D === v.roofDeck || !this.room(v)) return null;
    if (D.open) {
      const dx = Math.max(D.floor[0] - L.x, 0, L.x - D.floor[1]), dz = Math.max(D.floor[2] - L.z, 0, L.z - D.floor[3]);
      return Math.hypot(dx, dz) < R.climbReach && L.z < D.floor[3] + 0.3 ? (v.boat ? 'Climb aboard' : 'Climb into the bed') : null;
    }
    return this.doorAt(D, L, R.doorZone + 0.4) ? 'Step inside' : null;
  }
  climb(c, v) {
    toLocal(v, c.x, c.z, L);
    const lad = this.ladderAt(v, L, 'at');
    if (lad && this.room(v, v.roofDeck)) return this.mount(c, v, lad.top[0], lad.top[1], 'ladder', v.roofDeck);
    if (!this.room(v)) return false;
    return this.mount(c, v, L.x, L.z, 'climbed');
  }
  // The ladder of v's roof whose foot ('at') or top ('top') is within reach of frame point p.
  ladderAt(v, p, end) {
    for (const lad of v.roofDeck?.ladders ?? []) { const q = lad[end]; if (Math.hypot(q[0] - p.x, q[1] - p.z) < R.ladderReach) return lad; }
    return null;
  }
  // Down the ladder (E at its top): onto the ground at its foot.
  climbDown(c, lad) {
    const v = c.onDeck?.v;
    if (!v) return false;
    toWorld(v, lad.at[0], lad.at[1], W);
    this.dismount(c, 'ladder', true, W.x, W.z);
    this.g.emit('deckLeave', { id: c.id, vehicle: v.id, how: 'ladder', deck: v.roofDeck?.key });
    return true;
  }

  // The door of D whose outside zone holds frame point p (out to `zone` m past its edge), or null.
  doorAt(D, p, zone) {
    for (const d of D.doors ?? []) {
      const out = past(D, d.edge, p), a = along(d.edge, p);
      if (out > -0.3 && out < zone && a > d.span[0] && a < d.span[1]) return d;
    }
    return null;
  }

  // ---- the frame, each frame -------------------------------------------------------------------------------------
  // Before the vehicle moves (Vehicles.update): riders back into the frame; the player walking in through a door.
  capture(v) {
    if (!v.deck) return;
    this.ensureBoxes(v);
    const ref = v._dk;
    if (!ref) return;
    for (let i = v.deckRiders.length - 1; i >= 0; i--) {
      const c = v.deckRiders[i], d = c.onDeck;
      if (!d || d.v !== v || !this.g.chars.includes(c)) { v.deckRiders.splice(i, 1); if (d?.v === v) c.onDeck = null; continue; }
      if (c.inVehicle || c.onTrain || c.grabbing) { this.dismount(c, 'seat', true); continue; }
      toLocal(ref, c.x, c.z, L);
      if (Math.hypot(L.x - d.lx, L.z - d.lz) > 3) { this.dismount(c, 'moved', true); continue; } // teleported, respawned
      if (c.prone) d.bh = wrap((c.proneH ?? 0) - ref.h); // the body turned (stance.steer) this frame: into the frame
      const out = this.resolve(v, c, L);
      if (out) {
        const n = NORMAL[out.edge];
        toWorld(ref, L.x + n[0] * 0.3, L.z + n[1] * 0.3, W);
        this.dismount(c, out.how, false, W.x, W.z);
        continue;
      }
      d.lx = L.x; d.lz = L.z;
    }
    // The player walks in through a door (a cabin), or a dive drops them into an open bed from beside it.
    const p = this.g.player;
    if (!p.alive || p.onDeck || p.inVehicle || p.onTrain || p.grabbing || p.vault || p.prone || !(p.speed > 0.4) || p._rx === undefined) return;
    if (Math.abs(p.x - ref.x) > v.len || Math.abs(p.z - ref.z) > v.len || this.g.vehiclesSys.speed(v) > R.doorWalkIn || !this.room(v)) return;
    const D = v.deck;
    toLocal(ref, p.x, p.z, L);
    if (D.open) return; // an open bed: E climbs in (main.js), a walk into its side just meets the truck
    const door = this.doorAt(D, L, R.doorZone);
    if (!door) return;
    toLocal(ref, p._rx, p._rz, Q); // where they were last frame: walking toward the door?
    const n = NORMAL[door.edge];
    if ((L.x - Q.x) * n[0] + (L.z - Q.z) * n[1] >= -0.005) return;
    const inside = edgeLine(D, door.edge) - (n[0] || n[1]) * (R.radius + 0.08); // just in through it
    this.mount(p, v, n[0] ? inside : L.x, n[1] ? inside : L.z, 'walked');
  }

  // A rider's frame point against the deck: furniture pushes them out, walls stop them, a door lets them out, a dive
  // takes them over a rail. A prone body's head and feet meet the same walls (they never stick out over a rail).
  // Returns { how, edge } when they leave, else null (p moved onto the floor).
  resolve(v, c, p) {
    const D = deckOfRider(c), r = R.radius;
    for (const f of solidBoxes(D)) pushOut(f.box, p, r);
    for (const e of EDGES) {
      const over = past(D, e, p) + r;
      if (over <= 0) continue;
      const a = along(e, p);
      const door = !c.prone && (D.doors ?? []).find((d) => d.edge === e && a > d.span[0] + r * 0.5 && a < d.span[1] - r * 0.5);
      if (door) { if (past(D, e, p) > 0.05) return { how: 'door', edge: e }; continue; }
      if ((D.edges?.[e]?.h ?? 2) < R.railMax && c.dive > 0) { if (past(D, e, p) > 0.1) return { how: 'vault', edge: e }; continue; }
      const n = NORMAL[e];
      p.x -= n[0] * over; p.z -= n[1] * over;
    }
    if (c.prone) this.fitProne(D, c, p);
    return null;
  }

  // After the vehicle moved: the riders go with it; what the floor did to them; its boxes, beds, roof and camp.
  carry(v, dt) {
    if (!v.deck) return;
    const g = this.g, ref = v._dk;
    if ((v.dead || v.sunk) && v.deckRiders.length) for (const c of [...v.deckRiders]) this.dismount(c, 'wreck', !c.alive);
    // What the floor feels like: its own acceleration (filtered: one bad frame throws nobody), a crash, a landing.
    let felt = 0, ax = 0, az = 0, impact = 0, landing = 0;
    if (ref && dt > 0) {
      ax = (v.vx - ref.vx) / dt; az = (v.vz - ref.vz) / dt;
      const k = 1 - Math.exp(-dt * R.filter);
      v._dkAx = (v._dkAx ?? 0) + (ax - (v._dkAx ?? 0)) * k; v._dkAz = (v._dkAz ?? 0) + (az - (v._dkAz ?? 0)) * k;
      felt = Math.hypot(v._dkAx, v._dkAz);
      impact = Math.max(0, v.impact ?? 0);
      if (ref.air && !v.air) landing = Math.max(0, -(ref.vy ?? 0));
    }
    v.group.updateMatrix();
    const dh = ref ? v.h - ref.h : 0, sp = g.vehiclesSys.speed(v);
    // A boat on the water slaps the chop: a felt rocking on top of the turn, growing with speed (data/decks.js chop).
    const afloat = v.boat && !v.beached && (v.y ?? 0) > -5;
    v._dkChop = afloat ? sp * (0.55 + 0.45 * Math.sin(g.time * 2.6 + (v.slotSeed ??= Math.random() * 6))) : 0;
    const p = g.player;
    for (const c of [...v.deckRiders]) {
      const d = c.onDeck, D = d.D;
      toWorld(v, d.lx, d.lz, W);
      c.x = W.x; c.z = W.z;
      c.perchY = Math.max(0.05, _v.set(d.lx, D.y, d.lz).applyMatrix4(v.group.matrix).y);
      c.gy = c.perchY;
      if (c.prone) c.proneH = wrap(d.bh + v.h); // the body turns with the vehicle
      if (c !== g.player) { c.face += dh; c.wx = c.x; c.wz = c.z; }
      // A cabin lower than you stand: you stoop (the pose crouches; your head never comes through its roof).
      c.stoop = !c.prone && !!D.ceil && STANCES.stand.body.h > D.ceil;
      if (!c.alive) { const body = g.inventory?.boxes.get(`body:${c.id}`); if (body) { body.x = c.x; body.z = c.z; body.y = c.gy; } continue; }
      if (c.knockT > 0 || c.sleeping) continue;
      this.feel(v, c, felt + (D.chop ?? 0) * v._dkChop, impact, landing, sp, ref);
    }
    v._dk = { x: v.x, z: v.z, h: v.h, vx: v.vx, vz: v.vz, air: v.air, vy: v.vy };
    // Boxes ride along (the PACK screen and E find them where they are now), on the deck's floor.
    if (v._dkBoxes === v.id) for (const row of v.deck.containers ?? []) {
      const b = g.inventory.boxes.get(`deck:${v.id}:${row.id}`);
      if (!b) continue;
      const [cx, cz] = centre(row);
      toWorld(v, cx, cz, W); b.x = W.x; b.z = W.z; b.y = c0(this.floorYCached(v)); b.deck = v;
    }
    // The roof cuts away while the player is inside (a cabin), as a building's does - not while they stand on it.
    if (v.roof) { const inside = p.onDeck?.v === v && p.onDeck.D === v.deck && !v.deck.open; v.roof.visible = !inside; if (v.roof.material !== v.mesh.material) v.roof.material = v.mesh.material; }
    // Spray off the bow of a boat under way, over whoever is on its deck (fx particles: pooled).
    if (afloat && sp > 6 && v.deck.spray && v.deckRiders.length) {
      this.sprayT -= dt * Math.min(3, sp / 10);
      if (this.sprayT <= 0) {
        this.sprayT = 0.06;
        toWorld(v, (Math.random() - 0.5) * v.wid, v.len / 2 - 0.3, W);
        g.fx.spawn(2, W.x, (v.y ?? 0) + 0.7, W.z, -v.vx * 0.15 + (Math.random() - 0.5) * 3, 1.4 + Math.random() * 1.6, -v.vz * 0.15 + (Math.random() - 0.5) * 3, 0.5, 0.4, '#e6eef0', 2);
      }
    }
    this.campStep(v, dt, sp);
  }
  floorYCached(v, D = v.deck) { return _v.set(0, D.y, 0).applyMatrix4(v.group.matrix).y; }

  // A stagger (on your back for a moment) or, on an open deck past its lines, thrown out over the side. Every line is
  // times the rider's footing (QUICKNESS x the stance's brace, systems/stance.js) and the deck's own throwMul. Prone on
  // an open deck: never thrown out (D2), only staggered by a crash.
  feel(v, c, felt, impact, landing, sp, ref) {
    const D = deckOfRider(c), T = D.open ? R.open : R.cabin;
    const foot = this.g.stance ? this.g.stance.footing(c) : c.crouch ? R.braced : 1, brace = foot * (D.open ? D.throwMul ?? 1 : 1);
    c._dkCool = Math.max(0, (c._dkCool ?? 0) - 1 / 60);
    if (c === this.g.player && D.open) {
      const share = Math.max(felt / (T.throwA * brace), impact / (T.throwImpact * brace));
      const H = this.hud; H.share = share; H.footing = foot; H.word = this.g.stance?.band(share) ?? ''; H.show = share > R.footingShow || c.crouch || c.prone; H.v = v;
    }
    if (D.open && !c.prone) {
      const throwIt = impact > T.throwImpact * brace ? 'crash' : landing > T.throwLand * brace ? 'landing' : felt > T.throwA * brace && sp > T.throwMinSpeed ? 'turn' : null;
      if (throwIt) return this.throwOut(v, c, throwIt, ref);
    } else if (!D.open && impact > T.knockImpact * brace) return this.stagger(v, c, 'crash', 2);
    if (c._dkCool > 0) return;
    const why = impact > T.staggerImpact * brace ? 'crash' : landing > T.staggerLand * brace ? 'landing' : !c.prone && felt > T.staggerA * brace ? 'turn' : null;
    if (why) this.stagger(v, c, why, 1);
  }

  stagger(v, c, why, k) {
    c.knockT = c.knockMax = R.staggerT * k; c._dkCool = 1.2; c.dive = 0;
    this.g.emit('deckStagger', { id: c.id, vehicle: v.id, why, stance: this.g.stance?.kind(c) });
  }

  // Over the side: along the way the floor was going (a crash, a landing) or out of the turn (the felt force is the
  // floor's acceleration reversed), as far as the speed takes them, on their back, hurt.
  throwOut(v, c, why, ref) {
    const g = this.g, sp = Math.hypot(ref?.vx ?? v.vx, ref?.vz ?? v.vz), from = deckOfRider(c);
    let dx, dz;
    if (why === 'turn') { dx = -(v._dkAx ?? 0); dz = -(v._dkAz ?? 0); } else { dx = ref?.vx ?? v.vx; dz = ref?.vz ?? v.vz; }
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const far = 1.6 + sp * 0.12 + v.wid * 0.5;
    const stance = g.stance?.kind(c) ?? (c.crouch ? 'crouch' : 'stand');
    this.dismount(c, 'thrown', true, c.x + dx * far, c.z + dz * far);
    g.combat.damage(c, (R.throwHurt[0] + R.throwHurt[1] * sp) * (c === g.player ? 0.7 : 1) * (from === v.roofDeck ? 1.4 : 1), null, dx, dz, sp > 14 ? 'vehicle' : 'bullet');
    c.knockT = c.knockMax = R.throwT; c.dive = 0;
    g.fx.dust(c.x, c.z, 4);
    g.emit('thrown', { id: c.id, vehicle: v.id, speed: Math.round(sp), from: 'deck', deck: from?.key, why, stance });
    if (c === g.player) { g.hud.toast(`THROWN OFF THE ${v.name}`, 'hot'); this.hud.show = false; }
  }

  // ---- camp ------------------------------------------------------------------------------------------------------
  // A deck with `camp`, parked (no driver, still) for CAMP.after seconds, makes camp: the awning comes out, the stove
  // lights, and rain fills the tank. Drive off and it stows.
  campStep(v, dt, sp) {
    if (!v.deck.camp) return;
    const parked = !v.driver && !v.dead && sp < CAMP.still;
    v.campT = parked ? v.campT + dt : 0;
    const on = v.campT >= CAMP.after;
    if (on !== v.camp) {
      v.camp = on;
      if (v.awning) v.awning.visible = on;
      this.g.emit('camp', { vehicle: v.id, on });
      const p = this.g.player, near = p.onDeck?.v === v || Math.hypot(p.x - v.x, p.z - v.z) < 12;
      if (near && v.campShown !== on) { this.g.hud.toast(on ? `CAMP MADE · THE ${v.name}` : 'CAMP STRUCK', on ? 'job' : 'info'); v.campShown = on; }
    }
    const hrs = this.g.inventory?.hours?.() ?? 0;
    if (v.tank && on && (this.g.sky?.cur?.rain ?? 0) > 0.2 && v._dkHour !== undefined) v.tank.litres = Math.min(v.tank.cap, v.tank.litres + Math.max(0, hrs - v._dkHour) * CAMP.rainPerHour * this.g.sky.cur.rain);
    v._dkHour = hrs;
  }

  // ---- what the player can do on a deck (main.js: the interaction chain) -----------------------------------------
  // The deck's own things in reach of p: the wheel (F), the stove and the water tank (E), the ladder down (E). A box or
  // a bed nearer than any of them is left to the chain's own box and bed handling. { key, text, kind, v } | null.
  spot(p) {
    const d = p.onDeck;
    if (!d || !p.alive) return null;
    const v = d.v, D = d.D;
    L.x = d.lx; L.z = d.lz;
    let best = null, bd = Infinity;
    if (D.wheel) { const w = Math.hypot(D.wheel[0] - L.x, D.wheel[1] - L.z); if (w < R.wheelReach) { best = { key: 'KeyF', kind: 'wheel', v, text: `<kbd>F</kbd> Take the wheel${v.driver && v.driver !== p ? ` from ${v.driver.name ?? 'the driver'}` : ''}` }; bd = w; } }
    if (D === v.roofDeck) for (const lad of D.ladders ?? []) {
      const w = Math.hypot(lad.top[0] - L.x, lad.top[1] - L.z);
      if (w < R.ladderReach && w < bd) { bd = w; best = { key: 'KeyE', kind: 'ladder', v, lad, text: this.g.vehiclesSys.speed(v) > R.ladderSafe ? 'Ladder · wait for it to slow down' : '<kbd>E</kbd> Climb down the ladder' }; }
    }
    for (const f of D.fixtures ?? []) {
      if (f.kind !== 'stove' && f.kind !== 'tank') continue;
      const w = boxDist(f, L);
      if (w < R.useReach && w < bd) { bd = w; best = { key: 'KeyE', kind: f.kind, v, row: f, text: this.fixtureText(v, f) }; }
    }
    if (!best) return null;
    // A box or a bed nearer still wins (the chain opens it).
    for (const b of [...(D.containers ?? []), ...(D.beds ?? [])]) if (boxDist(b, L) + 0.05 < bd) return null;
    return best;
  }

  fixtureText(v, f) {
    if (f.kind === 'stove') return v.camp ? '<kbd>E</kbd> Cook a hot meal on the stove' : '<kbd>E</kbd> Stove · park up to make camp first';
    const t = v.tank, inv = this.g.inventory, pour = Object.keys(CAMP.pour).find((id) => inv.carried.count(id));
    if (t.litres >= CAMP.drink.litres && (this.g.needs?.water ?? 1) < 0.97) return `<kbd>E</kbd> Drink from the tank · ${t.litres.toFixed(1)} L`;
    if (pour && t.litres < t.cap - 0.2) return `<kbd>E</kbd> Pour a ${ITEMS[pour].name.toLowerCase()} into the tank · ${t.litres.toFixed(1)} L`;
    return `Water tank · ${t.litres.toFixed(1)} of ${t.cap} L`;
  }

  use(p, s) {
    const g = this.g, v = s.v;
    if (s.kind === 'wheel') { g.enterVehicle(v, 0); return { ok: true, did: 'wheel' }; }
    if (s.kind === 'ladder') { if (g.vehiclesSys.speed(v) > R.ladderSafe) return { ok: false, why: 'moving' }; this.climbDown(p, s.lad); return { ok: true, did: 'ladder' }; }
    if (s.kind === 'stove') return this.cook(v);
    if (s.kind === 'tank') return this.tankUse(v);
    return { ok: false };
  }

  // The stove: something from your pack, eaten hot (its own food plus CAMP.meal). Only in camp.
  cook(v) {
    const g = this.g, inv = g.inventory;
    if (!v.camp) { g.hud.toast('PARK UP AND MAKE CAMP FIRST', 'warn'); return { ok: false, why: 'not in camp' }; }
    const i = inv.best('food');
    if (i < 0) { g.hud.toast('NOTHING TO COOK', 'warn'); return { ok: false, why: 'no food' }; }
    const id = inv.carried.slots[i].id, r = inv.use(i);
    if (!r.ok) { g.hud.toast(String(r.why ?? 'CAN\'T COOK THAT').toUpperCase(), 'warn'); return r; }
    g.needs.food = Math.min(1, g.needs.food + CAMP.meal.food);
    g.player.hp = Math.min(g.player.maxHp, g.player.hp + CAMP.meal.hp);
    g.emit('cooked', { vehicle: v.id, item: id, food: +g.needs.food.toFixed(3) });
    g.emit('pickup', { kind: 'food', x: +g.player.x.toFixed(1), z: +g.player.z.toFixed(1), text: `HOT ${ITEMS[id]?.name?.toUpperCase() ?? 'MEAL'}` });
    return { ok: true, cooked: id, food: g.needs.food };
  }

  // The water tank: drink from it, or pour a carried bottle in.
  tankUse(v) {
    const g = this.g, t = v.tank, inv = g.inventory;
    if (!t) return { ok: false, why: 'no tank' };
    if (t.litres >= CAMP.drink.litres && (g.needs?.water ?? 1) < 0.97) {
      t.litres -= CAMP.drink.litres;
      g.survival.consume(CAMP.drink.kind);
      g.emit('pickup', { kind: 'water', x: +g.player.x.toFixed(1), z: +g.player.z.toFixed(1), text: '+ WATER' });
      return { ok: true, drank: CAMP.drink.litres, litres: +t.litres.toFixed(2), water: +g.needs.water.toFixed(3) };
    }
    const pour = Object.keys(CAMP.pour).find((id) => inv.carried.count(id));
    if (pour && t.litres < t.cap - 0.2) {
      const i = inv.carried.slots.findIndex((x) => x.id === pour);
      const sl = inv.carried.slots[i], it = ITEMS[pour], full = it.uses ? (sl.left ?? it.uses) / it.uses : 1;
      t.litres = Math.min(t.cap, t.litres + CAMP.pour[pour] * full);
      if (--sl.n <= 0) inv.carried.slots.splice(i, 1);
      inv.changed();
      g.emit('tankFilled', { vehicle: v.id, item: pour, litres: +t.litres.toFixed(2) });
      return { ok: true, poured: pour, litres: +t.litres.toFixed(2) };
    }
    g.hud.toast(t.litres < CAMP.drink.litres ? 'THE TANK IS DRY' : 'NOT THIRSTY', 'warn');
    return { ok: false, litres: t.litres };
  }

  // A deck's beds for the sleep code (main.js bedNear): the one within reach of (x, z) on the floor at height y.
  bedNear(x, z, y = 0) {
    let best = null, bd = 1.8;
    for (const v of this.list) {
      if (v.dead || !v.deck.beds?.length || Math.abs(v.x - x) > v.len || Math.abs(v.z - z) > v.len) continue;
      v._dkBeds ??= v.deck.beds.map((row) => ({ row, x: 0, z: 0, y: 0, face: 0, bedY: row.h, deck: v }));
      for (const b of v._dkBeds) {
        toWorld(v, b.row.at[0], b.row.at[1], W);
        b.x = W.x; b.z = W.z; b.face = v.h + (b.row.face ?? 0); b.y = this.floorYCached(v);
        if (Math.abs(b.y - y) > 1.6) continue;
        const d = Math.hypot(b.x - x, b.z - z);
        if (d < bd) { bd = d; best = b; }
      }
    }
    return best;
  }

  // ---- shooting --------------------------------------------------------------------------------------------------
  // combat.fire: may c shoot along ang from where they stand? An open deck: any way. A cabin: out of a window or a door.
  muzzleClear(c, ang) {
    const d = c.onDeck;
    if (!d || d.D.open) return true;
    const D = d.D, h = d.v.h, dx = Math.sin(ang - h), dz = Math.cos(ang - h);
    let te = Infinity, edge = null;
    for (const e of EDGES) {
      const n = NORMAL[e], pc = n[0] ? d.lx : d.lz, dc = n[0] ? dx : dz;
      if (dc * (n[0] || n[1]) <= 1e-6) continue; // heading away from this edge
      const t = (edgeLine(D, e) - pc) / dc;
      if (t >= 0 && t < te) { te = t; edge = e; }
    }
    if (!edge) return true;
    const a = edge === 'front' || edge === 'rear' ? d.lx + dx * te : d.lz + dz * te;
    const spans = [...(D.windows?.[edge] ?? []), ...(D.doors ?? []).filter((o) => o.edge === edge).map((o) => o.span)];
    if (spans.some(([s0, s1]) => a > s0 && a < s1)) return true;
    if (c === this.g.player && this.g.time - this.warnT > 2) { this.warnT = this.g.time; this.g.hud.toast('NO WINDOW THAT WAY', 'warn'); }
    return false;
  }

  // combat.hitscan: does v's body stand between a round and c, one of its own riders? A cabin's walls do; an open bed's
  // sides cover only a crouched rider, and only `cover` of the time; a prone one always (below the rail, D2). A rider
  // up on the roof has nothing round them.
  covered(v, c) {
    if (c.onDeck?.v !== v) return true;
    const D = c.onDeck.D;
    if (!D.open) return true;
    if (c.prone && PRONE.railHide && D !== v.roofDeck) return true;
    return !!c.crouch && Math.random() < (D.cover ?? 0.6);
  }

  // ---- followers on a deck (seats.followThink) -------------------------------------------------------------------
  // Shoot what is hostile out of the bed or a window; keep near you while you're aboard too; hop off when you have
  // left and the vehicle is stopped.
  followThink(c, dt) {
    const g = this.g, v = c.onDeck.v, p = g.player;
    const aboard = p.onDeck?.v === v || p.inVehicle === v;
    c.cool -= dt;
    if (c.weapon && c.cool <= 0) {
      let best = null, bd = 32;
      for (const o of g.chars) {
        if (!o.alive || o.inVehicle || o.onDeck?.v === v || !g.ai.hostile(c, o)) continue;
        const d = Math.hypot(o.x - c.x, o.z - c.z);
        if (d < bd && g.statics.lineOfSight(c.x, c.z, o.x, o.z)) { bd = d; best = o; }
      }
      if (best) {
        let ang = Math.atan2(best.x - c.x, best.z - c.z);
        if (c.prone) ang = g.stance.steer(c, ang, null, dt);
        c.face = ang; c.aiming = true;
        if (this.muzzleClear(c, ang) && g.combat.fire(c, c.weapon, ang + (Math.random() - 0.5) * (0.1 + g.vehiclesSys.speed(v) * 0.004))) c.cool = 0.35 + Math.random() * 0.4;
        else c.cool = 0.5;
      } else c.aiming = false;
    }
    if (!aboard) {
      if (g.vehiclesSys.speed(v) < 2) {
        if (c.prone) g.stance.setProne(c, false);
        const lad = c.onDeck.D === v.roofDeck ? v.roofDeck.ladders?.[0] : null;
        if (lad) { this.climbDown(c, lad); return true; }
        const x = this.exitPoint(v, c); this.dismount(c, 'walked', false, x.x, x.z);
      }
      return true;
    }
    // Riding with you on an open deck: get down when it goes fast (they know their own footing), stand when it slows.
    const D = c.onDeck.D, sp = g.vehiclesSys.speed(v);
    if (D.open && c.follower && !c.prone) c.crouch = sp > R.open.throwMinSpeed * 0.8 || !!p.crouch || !!p.prone;
    if (p.onDeck?.v === v && p.onDeck.D === D && !c.prone) {
      const dx = p.x - c.x, dz = p.z - c.z;
      if (Math.hypot(dx, dz) > 1.8) g.ai.move(c, dx, dz, 2.4, dt); else c.speed = 0;
    } else c.speed = 0;
    return true;
  }

  // Where to step off v: outside its nearest door, else over its nearest rail (world point).
  exitPoint(v, c) {
    const D = c.onDeck?.D ?? v.deck, d = c.onDeck;
    let best = null, bd = Infinity;
    for (const o of D.doors ?? []) {
      const n = NORMAL[o.edge], a = (o.span[0] + o.span[1]) / 2, e = edgeLine(D, o.edge);
      const lx = n[0] ? e + n[0] * 0.6 : a, lz = n[1] ? e + n[1] * 0.6 : a;
      const w = Math.hypot(lx - d.lx, lz - d.lz);
      if (w < bd) { bd = w; best = [lx, lz]; }
    }
    if (!best) {
      for (const e of EDGES) {
        if ((D.edges?.[e]?.h ?? 2) >= R.railMax) continue;
        const n = NORMAL[e], ed = edgeLine(D, e);
        const lx = n[0] ? ed + n[0] * (0.6 + v.wid * 0.1) : d.lx, lz = n[1] ? ed + n[1] * 0.8 : d.lz;
        const w = Math.hypot(lx - d.lx, lz - d.lz);
        if (w < bd) { bd = w; best = [lx, lz]; }
      }
    }
    return toWorld(v, best?.[0] ?? v.wid, best?.[1] ?? 0, { x: 0, z: 0 });
  }

  // ---- seats <-> deck --------------------------------------------------------------------------------------------
  // Seats.leave: someone getting up from a seat of a vehicle whose cab opens onto its deck stands up at its wheel (the
  // driver), or in the aisle beside their own seat (a seat row with `at`: the trundle's benches).
  // An ally aboard takes the wheel when you leave it, if there is somewhere to go (the GPS waypoint).
  fromSeat(c, v, seat) {
    const D = v.deck;
    if (!D?.seatsInside || !D.wheel || v.dead || D === v.roofDeck || !this.room(v)) return false;
    const row = v.seats?.[seat];
    if (seat > 0 && row?.at) this.mount(c, v, 0, row.at[2], 'seat');
    else this.mount(c, v, seat === 0 ? D.wheel[0] : -D.wheel[0], D.wheel[1], 'seat');
    // You got up from the wheel with somewhere to go: an ally in the other seat drives you there (as seats.cycle does).
    const g = this.g, wp = g.qol?.waypoint ?? g.qol?.objective?.()?.target;
    const ally = seat === 0 && c === g.player && wp ? v.occ?.find((o) => o && o.alive && o.faction === 'ally') : null;
    if (ally) { v.occ[ally.seat] = null; v.occ[0] = ally; ally.seat = 0; v.driver = ally; v.ai = 'chauffeur'; g.hud.toast(`${ally.name} takes the wheel`, 'job'); }
    return true;
  }

  // ---- what an agent sees ----------------------------------------------------------------------------------------
  view(v) {
    if (!v?.deck) return null;
    const D = v.deck, inv = this.g.inventory;
    return {
      key: D.key, open: !!D.open, floorY: +D.y.toFixed(2), crew: v.deckRiders.length, room: this.room(v),
      roof: v.roofDeck ? { key: v.roofDeck.key, floorY: +v.roofDeck.y.toFixed(2), room: this.room(v, v.roofDeck), ladders: v.roofDeck.ladders?.length ?? 0 } : null,
      riders: v.deckRiders.map((c) => ({ id: c.id, name: c.npc?.name ?? c.name, faction: c.faction, deck: c.onDeck.D.key, lx: +c.onDeck.lx.toFixed(2), lz: +c.onDeck.lz.toFixed(2), crouch: !!c.crouch, prone: !!c.prone, stoop: !!c.stoop, alive: c.alive })),
      doors: (D.doors ?? []).map((d) => d.id),
      boxes: (D.containers ?? []).map((row) => { const b = inv?.boxes.get(`deck:${v.id}:${row.id}`); return { id: `deck:${v.id}:${row.id}`, label: row.label, items: b?.slots.reduce((n, s) => n + s.n, 0) ?? 0, rolled: !!b?.rolled }; }),
      beds: (D.beds ?? []).map((b) => b.id),
      wheel: !!D.wheel, camp: !!v.camp, tank: v.tank ? { litres: +v.tank.litres.toFixed(2), cap: v.tank.cap } : null,
      roofHidden: v.roof ? !v.roof.visible : null, chop: D.chop ? +(v._dkChop ?? 0).toFixed(2) : undefined,
    };
  }

  // ---- save / load -----------------------------------------------------------------------------------------------
  save() {
    const inv = this.g.inventory, boxes = [], tanks = [], riders = [];
    for (const v of this.list) {
      if (v.tank) tanks.push({ v: v.id, litres: v.tank.litres });
      for (const row of v.deck.containers ?? []) { const b = inv.boxes.get(`deck:${v.id}:${row.id}`); if (b?.rolled) boxes.push({ id: b.id, slots: b.slots }); }
      for (const c of v.deckRiders) riders.push({ id: c.id, v: v.id, deck: c.onDeck.D.key, lx: c.onDeck.lx, lz: c.onDeck.lz, crouch: !!c.crouch, prone: !!c.prone });
    }
    return { riders, boxes, tanks };
  }

  // restore() (agent/api.js), after the vehicles, the people and the inventory: everyone off, the boxes under their
  // restored ids with the saved contents, the tanks, then the saved riders back aboard. An old save (null): all off.
  load(s) {
    const g = this.g;
    for (const c of g.chars) if (c.onDeck) this.dismount(c, 'load', true);
    for (const v of this.list) { v.deckRiders.length = 0; v._dk = null; this.ensureBoxes(v); }
    if (!s) return;
    for (const b of s.boxes ?? []) { const box = g.inventory.boxes.get(b.id); if (box) { box.slots = b.slots.map((x) => ({ ...x })); box.rolled = true; } }
    for (const t of s.tanks ?? []) { const v = this.list.find((x) => x.id === t.v); if (v?.tank) v.tank.litres = t.litres; }
    for (const r of s.riders ?? []) {
      const c = g.chars.find((x) => x.id === r.id), v = this.list.find((x) => x.id === r.v);
      if (c && v && c.alive && !c.inVehicle) { if (r.prone) { c.prone = true; c.proneH = c.face ?? 0; } this.mount(c, v, r.lx, r.lz, 'load', this.deckByKey(v, r.deck)); }
    }
    g.inventory.changed();
  }

  // The walkable vehicles the world starts with (data/decks.js PLACED): once, on the first frame, unless one is already
  // there (a restored save brought it back).
  placeWorld() {
    this.placed = true;
    for (const r of PLACED) {
      if (this.list.some((v) => v.type === r.type && Math.hypot(v.x - r.x, v.z - r.z) < 30)) continue;
      this.g.vehiclesSys.spawn(r.type, r.x, r.z, r.h, r.paint);
    }
  }

  stats() { return { decks: this.list.length, riders: this.list.reduce((n, v) => n + v.deckRiders.length, 0) }; }
}

const c0 = (y) => Math.max(0, y);

// Circle (frame point p, radius r) out of an axis-aligned box [x0, x1, z0, z1].
function pushOut(b, p, r) {
  const cx = Math.max(b[0], Math.min(b[1], p.x)), cz = Math.max(b[2], Math.min(b[3], p.z));
  let dx = p.x - cx, dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; return; }
  // Centre inside the box: out through the nearest face.
  const l = p.x - b[0], rr = b[1] - p.x, n = p.z - b[2], f = b[3] - p.z, m = Math.min(l, rr, n, f);
  if (m === l) p.x = b[0] - r; else if (m === rr) p.x = b[1] + r; else if (m === n) p.z = b[2] - r; else p.z = b[3] + r;
}

// The RV's camp gear (data/decks.js CAMP): an awning out over the door side on two poles, a mat and a folding chair
// under it. Vertex-coloured; the body frame (+x left, the door is on -x).
function awningGeometry(v) {
  const hw = v.wid / 2, parts = [];
  const box = (x0, x1, y0, y1, z0, z1, col) => {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).toNonIndexed();
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  const canvas = new THREE.PlaneGeometry(2.6, 3.2).toNonIndexed();
  canvas.rotateX(-Math.PI / 2); canvas.rotateZ(-0.12); canvas.translate(-hw - 1.3, 2.62, -0.9);
  const cc = new THREE.Color('#9a5a36'), n = canvas.attributes.position.count, ca = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { ca[i * 3] = cc.r; ca[i * 3 + 1] = cc.g; ca[i * 3 + 2] = cc.b; }
  canvas.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  canvas.deleteAttribute('uv'); canvas.deleteAttribute('normal'); canvas.computeVertexNormals();
  parts.push(canvas);
  for (let k = 0; k < 5; k++) parts.push(box(-hw - 2.6, -hw, 2.5 + k * 0.001, 2.52 + 0.04 + k * 0.001, -2.5 + k * 0.8, -2.42 + k * 0.8, '#e2d6bc')); // stripes
  for (const z of [-2.4, 0.6]) parts.push(box(-hw - 2.55, -hw - 2.49, 0, 2.5, z - 0.03, z + 0.03, '#6a645c'));          // poles
  parts.push(box(-hw - 2.2, -hw - 0.4, 0.01, 0.03, -2.0, 0.2, '#5a6b4a'));                                              // a mat
  parts.push(box(-hw - 1.7, -hw - 1.2, 0.42, 0.47, -1.4, -0.9, '#2f4a3a'), box(-hw - 1.72, -hw - 1.68, 0.42, 0.95, -1.4, -0.9, '#2f4a3a')); // folding chair
  for (const g of parts) { if (g.attributes.uv) g.deleteAttribute('uv'); if (!g.attributes.normal) g.computeVertexNormals(); }
  return mergeAll(parts);
}

function mergeAll(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
