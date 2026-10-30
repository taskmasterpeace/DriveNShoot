import * as THREE from 'three';
import { StaticWorld, RAY_SOLID, RAY_SIGHT } from '../engine/collision.js';
import { LOOT, ITEMS } from '../data/items.js';
import { DOOR_MATERIALS } from '../data/interiors.js';
import * as ATLAS from '../data/atlas.js';
import { WEAPONS } from './combat.js';
import { outfit } from './characters.js';
import { randomName } from '../data/npcs.js';
import { UG, LIGHT, LIFT, GENERATOR, NOISE, COLLAPSE, BLAST, HOLDOUT, LOGS, KINDS, PROJECTS, UG_LOOT, LOCAL_SITES, underSites } from '../data/underground.js';
import { hexPanels } from '../data/fannods.js';
import { planSite, genLevel, flightHeight, siteCodes, ROCK, OPEN, POOL, STAIR, HOLE, SHAFT } from '../world/undergen.js';
import { makeMaterials, buildLevel, buildEntrance, buildPlatform, buildEyes, buildDrones } from './underlook.js';

// THE UNDERGROUND at runtime (docs/design/WEB_UNDERGROUND.md). Sites are rows (data/underground.js); a level is a record
// (world/undergen.js makes it, a pure function) until you go down, then geometry, colliders, doors, containers and people
// (promoted), written back when you leave (demoted) - the Phoenix ring's law (WEB_STREAMING §1.3).
//
// THE SAME LAW AS STOREYS, ONE MORE WORLD. A basement is a negative storey: its floor is a height, flights are slopes
// between two decks, a person's level is where their feet are (c.gy). Under the surface a person is `ug` (their site's
// id, kept by main.js standOn): their collision, sight and rounds go to the UnderWorld (below: its own StaticWorld,
// height-ranged), their noise carries down its corridors (a flood over the level's cells) and not up to the street, and
// sameFloor (world/storeys.js) keeps the street and the underground apart. The street's StaticWorld, its nav grids and
// the island's golden hash never see a box of it: the collars round an open entrance are `extra` boxes, outside the hash.
//
// THE VIEW. Below, only the level you are on is drawn: a clipping plane on the renderer (one plane, installed at boot so
// no shader ever recompiles) cuts everything above your ceiling, a black occluder under your floor hides the levels
// below, the sky's light goes to a breath (systems/sky.js), the fog and the sky go black, the sun's shadow map stops
// updating. The light is what you bring: the flashlight's cone, chem lights somebody cracked, the strips a running
// generator lights, and the eyes of the infected catching your beam.

const _v = new THREE.Vector3();
const EMPTY = [];
const r1 = (v) => Math.round(v * 10) / 10;
const DRONE_GUN = { ...WEAPONS.smg, name: 'DRONE GUN', dmg: HOLDOUT.drone.dmg, spread: HOLDOUT.drone.spread, range: HOLDOUT.drone.range, pellets: 1 };

// ---- the UnderWorld: a StaticWorld of its own, a uniform grid round the live site, boxes with a base and a top --------
export class UnderWorld extends StaticWorld {
  constructor() { super(8, 8); this.gc = 4; this.gx = 0; this.gz = 0; this.gnx = 0; this.gnz = 0; this.grid = []; }
  setBounds(x0, z0, x1, z1) {
    this.gx = Math.floor(x0) - 8; this.gz = Math.floor(z0) - 8;
    this.gnx = Math.ceil((x1 - x0 + 16) / this.gc) + 1; this.gnz = Math.ceil((z1 - z0 + 16) / this.gc) + 1;
    this.grid = []; for (let i = 0; i < this.gnx * this.gnz; i++) this.grid.push([]);
    this.boxes = [];
  }
  clearAll() { this.grid = []; this.gnx = this.gnz = 0; this.boxes = []; }
  gi(x) { const c = Math.floor((x - this.gx) / this.gc); return c < 0 ? 0 : c >= this.gnx ? this.gnx - 1 : c; }
  gj(z) { const c = Math.floor((z - this.gz) / this.gc); return c < 0 ? 0 : c >= this.gnz ? this.gnz - 1 : c; }
  put(b) { if (!this.gnx) return; b.cells = []; for (let j = this.gj(b.minZ); j <= this.gj(b.maxZ); j++) for (let i = this.gi(b.minX); i <= this.gi(b.maxX); i++) { const L = this.grid[j * this.gnx + i]; L.push(b); b.cells.push(L); } }
  addBox(minX, minZ, maxX, maxZ, tag, base, top) {
    const b = { minX, minZ, maxX, maxZ, tag, height: top, mark: 0, op: null, holes: null, holeX: false, sill: 0, base, owner: null, cells: null };
    this.boxes.push(b); this.put(b); return b;
  }
  addOp(op, minX, minZ, maxX, maxZ, height = 2.3) {
    const b = { minX, minZ, maxX, maxZ, tag: op.kind, height, mark: 0, op, holes: null, holeX: false, sill: 0, base: 0, owner: null, cells: null };
    this.put(b); return b;
  }
  remove(b) {
    for (const L of b.cells ?? EMPTY) { const i = L.indexOf(b); if (i >= 0) { L[i] = L[L.length - 1]; L.pop(); } }
    b.cells = null;
    if (!b.op) { const i = this.boxes.indexOf(b); if (i >= 0) { this.boxes[i] = this.boxes[this.boxes.length - 1]; this.boxes.pop(); } }
  }
  resolveCircle(p, r, mover = null, minY = -Infinity, skip = null, topY = 2.5) {
    if (!this.gnx) return 0;
    const stamp = ++this.stamp;
    let pushed = 0;
    for (let j = this.gj(p.z - r); j <= this.gj(p.z + r); j++) for (let i = this.gi(p.x - r); i <= this.gi(p.x + r); i++) {
      const L = this.grid[j * this.gnx + i];
      for (let k = 0; k < L.length; k++) pushed += this.circleBox(L[k], stamp, p, r, mover, minY, skip, topY);
    }
    return pushed;
  }
  // y: the ray's height (always given below ground); a box counts only if the ray passes through its height range.
  raycast(x0, z0, dx, dz, maxDist, mode = RAY_SOLID, y = -1) {
    const stamp = ++this.stamp;
    this.best = maxDist; this.hit.box = null;
    if (!this.gnx) { this.hit.t = maxDist; return maxDist; }
    const invX = dx !== 0 ? 1 / dx : 1e9, invZ = dz !== 0 ? 1 / dz : 1e9, step = this.gc * 0.5;
    let last = -1;
    for (let s = 0; s <= maxDist + step; s += step) {
      if (s > this.best + this.gc) break;
      const px = x0 + dx * Math.min(s, maxDist), pz = z0 + dz * Math.min(s, maxDist), ci = this.gi(px), cj = this.gj(pz), id = cj * this.gnx + ci;
      if (id === last) continue;
      last = id;
      for (let oj = -1; oj <= 1; oj++) for (let oi = -1; oi <= 1; oi++) {
        const a = ci + oi, b = cj + oj;
        if (a < 0 || b < 0 || a >= this.gnx || b >= this.gnz) continue;
        this.rayList(this.grid[b * this.gnx + a], stamp, x0, z0, dx, dz, invX, invZ, mode, y);
      }
    }
    this.hit.t = this.best;
    return this.best;
  }
  rayList(list, stamp, x0, z0, dx, dz, invX, invZ, mode, y) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.mark === stamp) continue;
      b.mark = stamp;
      if (b.height <= y || b.base > y) continue; // over it or under it
      const best = this.best;
      if (b.op !== null) {
        if (!this.ops) continue;
        const t = this.ops.ray(b.op, x0, z0, dx, dz, best, mode);
        if (t < best) { this.best = t; this.hit.nx = this.ops.nx; this.hit.nz = this.ops.nz; this.hit.box = b; }
        continue;
      }
      const t1 = (b.minX - x0) * invX, t2 = (b.maxX - x0) * invX;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), nxv = t1 < t2 ? -1 : 1, nzv = 0;
      const t3 = (b.minZ - z0) * invZ, t4 = (b.maxZ - z0) * invZ;
      const tzmin = Math.min(t3, t4), tzmax = Math.max(t3, t4);
      if (tzmin > tmin) { tmin = tzmin; nxv = 0; nzv = t3 < t4 ? -1 : 1; }
      tmax = Math.min(tmax, tzmax);
      if (tmax < 0 || tmin > tmax) continue;
      if (tmin < 0) tmin = 0;
      if (tmin < best) { this.best = tmin; this.hit.nx = nxv; this.hit.nz = nzv; this.hit.box = b; }
    }
  }
}

// ---- the system -----------------------------------------------------------------------------------------------------
export class Underground {
  constructor(game) {
    const g = this.g = game;
    this.U = new UnderWorld();
    this.U.ops = g.interiors;
    g.statics.under = this.U;
    // Rows the rest of the engine reads by name: the blast door's material, the levels' loot tables.
    if (!DOOR_MATERIALS.blast) DOOR_MATERIALS.blast = BLAST.material;
    DOOR_MATERIALS.blast.bulletLock = 0; // rounds do not shoot a blast door's lock off
    for (const [k, T] of Object.entries(UG_LOOT)) if (!LOOT[k]) LOOT[k] = T;
    this.sites = [...LOCAL_SITES, ...underSites(ATLAS)];
    this.byId = new Map(this.sites.map((s) => [s.id, s]));
    this.recs = new Map();    // site id -> its record (power, fuel, lift, alert, codes learned, logs read, collapses, placement)
    this.lvl = new Map();     // `${site}:${k}` -> a level's record (who lives there now, its doors)
    this.attached = new Map(); // site id -> { row, plan, ent, collar, gate }
    this.A = null;            // the live site: { site, row, plan, rec, levels: Map(k -> promoted level) }
    this.M = makeMaterials();
    this.scanT = 0; this.genT = 0; this.below = 0; this.viewK = 0; this.lastHour = null; this.adoptT = 0;
    this.counts = { promoted: 0, demoted: 0, attached: 0, collapses: 0, charges: 0, logs: 0 };
    // One clipping plane on the renderer for good (a plane added later would recompile every material).
    this.clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
    g.renderer.clippingPlanes = [this.clip];
    // The occluder under the level you are on, the eyes, the drones: one mesh each, live whatever site.
    this.occluder = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.M.black);
    this.occluder.visible = false; this.occluder.renderOrder = -1; g.scene.add(this.occluder);
    this.eyes = buildEyes(this.M); g.scene.add(this.eyes);
    this.drones = buildDrones(this.M); g.scene.add(this.drones.body, this.drones.beam);
    this.charges = [];
    this.prevGround = undefined;
  }

  // ---- rows ------------------------------------------------------------------------------------------------------
  rec(site) {
    let r = this.recs.get(site.id);
    if (!r) {
      r = { power: !!site.power, fuel: site.fuel ?? (site.power ? 0.7 : 0), alert: 'calm', warnT: 0, read: [], codes: [], collapsed: [], place: null, lift: null, touched: false };
      this.recs.set(site.id, r);
    }
    return r;
  }
  // The row a site's levels are made from: a far site's entrance moved to the clear ground found when you first came near.
  rowOf(site) { const r = this.recs.get(site.id); return r?.place ? { ...site, x: r.place.x, z: r.place.z } : site; }
  lrec(site, k) { const key = `${site.id}:${k}`; let r = this.lvl.get(key); if (!r) { r = { occ: null, doors: {} }; this.lvl.set(key, r); } return r; }
  codes(site) { return siteCodes(this.rowOf(site)); }

  // A site that must be placed (the atlas and the bases) finds ground near its point the first time its chunk is laid
  // out: the entrance's footprint (and the lift's) clear of every box, dry.
  place(site) {
    const r = this.rec(site);
    if (!site.place || r.place) return true;
    const g = this.g, S = g.statics;
    const far = Math.abs(site.x) > 456 || Math.abs(site.z) > 456;
    if (far) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!S.hasChunk(Math.floor((site.x + dx * 60) / 256), Math.floor((site.z + dz * 60) / 256))) return false;
    for (let ring = 0; ring <= 16; ring++) {
      for (let s = 0; s < Math.max(1, ring * 8); s++) {
        const a = (s / Math.max(1, ring * 8)) * Math.PI * 2, x = Math.round(site.x + Math.cos(a) * ring * 5) + 0.5, z = Math.round(site.z + Math.sin(a) * ring * 5) + 0.5;
        if (this.clearAt({ ...site, x, z })) { r.place = { x, z }; return true; }
      }
    }
    r.place = { x: site.x, z: site.z }; // nowhere better: where the atlas put it
    return true;
  }
  clearAt(row) {
    const g = this.g, P = planSite(row), f = P.flights[0], R = f.rect;
    const x0 = Math.min(R.minX, P.lift?.rect.minX ?? Infinity) - 3, x1 = Math.max(R.maxX, P.lift?.rect.maxX ?? -Infinity) + 3;
    const z0 = Math.min(R.minZ, P.lift?.rect.minZ ?? Infinity) - 3, z1 = Math.max(R.maxZ, P.lift?.rect.maxZ ?? -Infinity) + 3;
    for (let x = x0; x <= x1; x += 1) for (let z = z0; z <= z1; z += 1) {
      if (g.statics.pointBlocked(x, z, 0.4)) return false;
      if (g.water?.stateAt?.(x, z) && g.water.stateAt(x, z) !== 'dry') return false;
    }
    return true;
  }

  // ---- surface entrances -----------------------------------------------------------------------------------------------
  attach(site) {
    const g = this.g, row = this.rowOf(site), plan = planSite(row), ent = plan.drains ? this.ext.buildWays(row, plan) : buildEntrance(row, plan, this.M), r = this.rec(site); // a town's drains: all its ways (systems/understreet.js)
    g.scene.add(ent.group);
    const collar = ent.collar.map((b) => StaticWorld.box(b.x0, b.z0, b.x1, b.z1, 'ug-collar', b.h));
    for (const b of collar) g.statics.extra.push(b);
    let gate = null;
    if (plan.lift) {
      const R = plan.lift.rect, ax = plan.lift.axis === 'x', near = plan.lift.u > 0 ? (ax ? R.minX : R.minZ) : (ax ? R.maxX : R.maxZ);
      gate = ax ? StaticWorld.box(near - 0.12, R.minZ, near + 0.12, R.maxZ, 'ug-gate', LIFT.gateH) : StaticWorld.box(R.minX, near - 0.12, R.maxX, near + 0.12, 'ug-gate', LIFT.gateH);
      if (!r.lift) r.lift = { y: site.power ? plan.Y[0] : plan.Y[plan.n], target: null, stop: site.power ? 0 : plan.n };
    }
    this.attached.set(site.id, { row, plan, ent, collar, gate, gateOn: false });
    this.counts.attached++;
    this.syncSurfaceGate(site.id);
  }
  detach(id) {
    const T = this.attached.get(id);
    if (!T) return;
    if (this.A?.site.id === id) this.deactivate();
    this.g.scene.remove(T.ent.group);
    for (const m of T.ent.group.children) m.dispose?.();
    const ex = this.g.statics.extra;
    for (const b of [...T.collar, T.gate]) { const i = ex.indexOf(b); if (i >= 0) ex.splice(i, 1); }
    this.attached.delete(id);
    if (T.plan.drains) this.ext?.detached(id);
  }
  syncSurfaceGate(id) {
    const T = this.attached.get(id);
    if (!T?.gate) return;
    const r = this.rec(this.byId.get(id)), at = r.lift && Math.abs(r.lift.y - T.plan.Y[0]) < 0.05 && r.lift.target === null;
    const ex = this.g.statics.extra, i = ex.indexOf(T.gate);
    if (!at && i < 0) ex.push(T.gate);
    if (at && i >= 0) ex.splice(i, 1);
  }
  entTop(T) { const f = T.plan.flights[0]; return f.top; }

  // ---- the live site ---------------------------------------------------------------------------------------------------
  activate(site) {
    if (this.A?.site === site) return this.A;
    if (this.A) this.deactivate();
    if (!this.attached.has(site.id)) { this.place(site); this.attach(site); }
    const T = this.attached.get(site.id), plan = T.plan, row = T.row, rec = this.rec(site);
    const f0 = plan.flights[0].rect;
    const A = { site, row, plan, rec, T, levels: new Map(), wantT: new Map(),
      x0: Math.min(plan.ox, f0.minX) - 1, z0: Math.min(plan.oz, f0.minZ) - 1, x1: Math.max(plan.ox + plan.W, f0.maxX) + 1, z1: Math.max(plan.oz + plan.H, f0.maxZ) + 1 };
    this.A = A;
    rec.touched = true;
    this.U.setBounds(A.x0, A.z0, A.x1, A.z1);
    this.U.y0 = plan.Y[0]; // rays at an underground height route here (engine/collision.js raycast)
    if (plan.lift) {
      A.platform = buildPlatform(plan, this.M); this.g.scene.add(A.platform);
      const R = plan.lift.rect;
      A.liftR = R;
      // the shaft's gates, one a level (shut unless the platform stands there)
      A.gates = [];
    }
    this.g.emit('ugActive', { site: site.id });
    return A;
  }
  deactivate() {
    const A = this.A;
    if (!A) return;
    for (const k of [...A.levels.keys()]) this.demote(k);
    if (A.platform) { this.g.scene.remove(A.platform); }
    this.U.clearAll();
    this.U.y0 = 0;
    this.A = null;
    this.occluder.visible = false;
  }

  // The street's height over the live site (0 for the authored sites; a town's pad on real terrain for its drains).
  get y0() { return this.A?.plan.Y[0] ?? 0; }
  levelOf(y) {
    const A = this.A;
    if (!A || y > A.plan.Y[0] - UG.below) return 0;
    let best = 0, bd = 3.6;
    for (let k = 1; k <= A.plan.n; k++) { const d = Math.abs(A.plan.Y[k] - y); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  inBox(x, z) { const A = this.A; return !!A && x > A.x0 && x < A.x1 && z > A.z0 && z < A.z1; }

  // ---- promote / demote a level ------------------------------------------------------------------------------------
  promote(k) {
    const A = this.A, g = this.g;
    if (!A || A.levels.has(k)) return A?.levels.get(k);
    const site = A.site, L = genLevel(A.row, k), lr = this.lrec(site, k), y = L.y, U = this.U, I = g.interiors;
    const P = { k, L, lr, boxes: [], doors: [], occ: [], beds: [], logs: L.logs, look: null, walk: null, t0: g.time };
    // Colliders: the rock and the water, the flights' flanks and blocks, a roof that came down, the lift's gate here.
    for (const b of L.colliders) P.boxes.push(U.addBox(b.x0, b.z0, b.x1, b.z1, b.tag, b.base, b.top));
    for (const b of L.flightBoxes ?? []) P.boxes.push(U.addBox(b.x0, b.z0, b.x1, b.z1, b.tag, b.base, b.top));
    for (const id of A.rec.collapsed) { const C = L.collapses.find((c) => c.id === id); if (C) P.boxes.push(U.addBox(C.x - C.r, C.z - C.r, C.x + C.r, C.z + C.r, 'ug-rubble', y, y + UG.wallH)); }
    if (L.gate) { P.gate = U.addBox(L.gate.x0, L.gate.z0, L.gate.x1, L.gate.z1, 'ug-gate', y, y + LIFT.gateH); }
    // Furniture is solid (cover).
    for (const p of L.props) if (p.kind === 'glasshex') { for (const pn of hexPanels((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2)) for (const b of pn.boxes) P.boxes.push(U.addBox(b.x0, b.z0, b.x1, b.z1, 'ug-glass', y, y + p.h)); } // the glass room's chamber: a collider a panel, its door side open (data/fannods.js)
    else if (p.kind !== 'rock' || p.h > 0.5) P.boxes.push(U.addBox(p.x0, p.z0, p.x1, p.z1, PROP_TAG[p.kind] ?? p.kind, y, y + p.h)); // tagged as what it is (data/materials.js reads the tag)
    // Doors: leaves from the interiors pool, their ops in the UnderWorld at this level's heights.
    for (const d of L.doors) {
      const saved = lr.doors[d.id];
      const need = d.leaves ?? 1;
      const locked = saved ? !!saved.l : !!d.locked;
      if (I.freeLeaf.length < need) { if (locked) P.boxes.push(U.addBox(d.x - (d.axis === 'x' ? d.width / 2 : 0.15), d.z - (d.axis === 'x' ? 0.15 : d.width / 2), d.x + (d.axis === 'x' ? d.width / 2 : 0.15), d.z + (d.axis === 'x' ? 0.15 : d.width / 2), 'ug-door', y, y + 2.3)); continue; }
      const mat = DOOR_MATERIALS[d.material] ?? DOOR_MATERIALS.wood;
      const row = { id: d.id, kind: 'inner', x: d.x, z: d.z, axis: d.axis, width: d.width, nx: d.nx, nz: d.nz, leaves: need, hinge: d.hinge, material: d.material, color: mat.colors[Math.abs(Math.round(d.x * 7 + d.z * 3)) % mat.colors.length], locked, open: saved?.a?.[0] ?? 0, b: -1 };
      const reg = (op, x0, z0, x1, z1, h) => { const b = U.addOp(op, x0, z0, x1, z1, h); b.base = y; b.height = y + h; P.boxes.push(b); return b; };
      const door = I.makeDoor(row, reg, () => I.freeLeaf.pop());
      door.y = y; door.ug = site.id; door.blast = !!d.blast; door.keypad = d.keypad; door.room = d.room;
      if (saved) { door.lockHp = locked ? saved.h ?? door.mat.lockHp : 0; door.kicks = locked ? saved.k ?? door.mat.kicks : 0; door.leaves.forEach((Lf, i) => { Lf.th = saved.a?.[i] ?? Lf.th; I.orient(Lf); }); }
      for (const Lf of door.leaves) I.leafMesh.setColorAt(Lf.slot, new THREE.Color(door.color));
      P.doors.push(door);
    }
    if (I.leafMesh.instanceColor) I.leafMesh.instanceColor.needsUpdate = true;
    I.flush(); I.leafMesh.instanceMatrix.needsUpdate = true;
    // Containers (the inventory's ring law: what anyone took stays taken, in ringKept and in the save).
    g.inventory.registerRing(L.boxes.map((b) => ({ id: b.id, table: b.table, x: b.x, z: b.z, cap: b.cap, label: b.label })));
    for (const b of L.boxes) { const box = g.inventory.boxes.get(b.id); if (box) box.y = y; }
    // Beds.
    for (const p of L.props) if (p.bed) { const bed = { x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2, face: p.x1 - p.x0 > p.z1 - p.z0 ? Math.PI / 2 : 0, bedY: 0.55, y, ring: true, ug: site.id }; g.world.spawns.beds.push(bed); P.beds.push(bed); }
    // The look.
    P.look = buildLevel(L, A.plan, site, A.rec, lr, this.M);
    g.scene.add(P.look.group);
    // The walk grid (its own A*: 1 m cells, doors shut by their locks).
    this.makeWalk(P);
    A.levels.set(k, P);
    // People: as the record has them, or as the level was made.
    const list = lr.occ ?? L.spawns.map((s, i) => ({ i, kind: s.kind, x: s.x, z: s.z, hp: null, alive: true, face: 0, weapon: s.weapon }));
    if (!lr.occ) lr.occ = list;
    list.forEach((o, i) => { if (o.alive !== false && !o.gone && (!A.plan.drains || this.ext.wantOcc(P, o))) this.spawnOcc(P, o, L.spawns[o.i] ?? null, i); }); // a town's drains stand up only who is near you (systems/understreet.js lazy)
    this.paint(P);
    if (A.plan.drains) this.ext.onPromote(P);
    this.counts.promoted++;
    g.emit('ugPromote', { site: site.id, level: k, people: P.occ.length, doors: P.doors.length, boxes: L.boxes.length });
    return P;
  }

  spawnOcc(P, o, spawn, idx) {
    const g = this.g, A = this.A, y = P.L.y;
    let c = null;
    if (o.kind === 'shambler' || o.kind === 'sprinter') c = g.zombies.spawn(o.x, o.z, o.kind === 'sprinter');
    else if (o.kind === 'echo' || o.kind === 'choir') c = g.zombies.spawnKind(o.kind, o.x, o.z, { x: o.x, z: o.z });
    else if (o.kind === 'soldier' || o.kind === 'drone') {
      const drone = o.kind === 'drone', rng = Math.random;
      c = g.addChar({ x: o.x, z: o.z, faction: 'soldier', weapon: drone ? null : o.weapon ?? 'rifle', hp: drone ? HOLDOUT.drone.hp : 110, colors: outfit('soldier', rng), name: drone ? 'Remnant Drone' : randomName(rng), flag: drone ? 'US' : g.randomFlag(rng) });
      if (c) { c.fid = 'remnant'; g.society.factions.assign(c); c.grenades = 0; if (drone) { c.ownMesh = true; c.drone = true; c.radius = 0.5; } }
    } else c = g.addChar({ x: o.x, z: o.z, faction: o.kind === 'raider' ? 'raider' : 'drifter', weapon: o.weapon ?? null, colors: outfit(o.kind === 'raider' ? 'raider' : 'drifter'), name: o.name ?? randomName(Math.random), flag: 'US' });
    if (!c) return null;
    c.x = o.x; c.z = o.z; c.gy = y; c.ug = A.site.id; c.storey = null; c.face = o.face ?? 0;
    if (o.hp !== null && o.hp !== undefined) c.hp = o.hp;
    c.ugOcc = { k: P.k, i: idx };
    c.ugRole = o.kind === 'drone' ? 'drone' : o.kind === 'soldier' ? 'soldier' : c.faction === 'zombie' ? 'infected' : 'other';
    c.ugPost = spawn?.post ? { x: spawn.post.x, z: spawn.post.z } : { x: o.x, z: o.z };
    c.ugRoute = spawn?.route ?? null; c.ugLeg = 0;
    c.home = { x: o.x, z: o.z };
    g.charR.paint(c);
    P.occ.push(c);
    return c;
  }

  demote(k, write = true) {
    const A = this.A, g = this.g;
    const P = A?.levels.get(k);
    if (!P) return;
    if (write) this.writeBack(P);
    for (const c of P.occ) if (g.chars.includes(c)) g.removeChar(c);
    for (const c of g.chars) if (c !== g.player && c.ug === A.site.id && this.levelOf(c.gy) === k && !c.ugOcc) g.removeChar(c); // adopted strays go with the level (written back above)
    // Doors back to the pool.
    const I = g.interiors;
    for (const door of P.doors) {
      for (const Lf of door.leaves) { I.leafMesh.setMatrixAt(Lf.slot, ZERO_M); I.freeLeaf.push(Lf.slot); Lf.active = false; Lf.isDirty = false; drop(I.leaves, Lf); drop(I.active, Lf); drop(I.dirty, Lf); }
      drop(I.doors, door); I.byId.delete(door.id);
      if (I.holdOn === door) { I.holdOn = null; I.hold = 0; }
    }
    I.leafMesh.instanceMatrix.needsUpdate = true;
    for (const b of P.boxes) this.U.remove(b);
    if (P.gate) this.U.remove(P.gate);
    g.inventory.unregisterRing(P.L.boxes.map((b) => ({ id: b.id })));
    const beds = g.world.spawns.beds;
    for (const b of P.beds) { const i = beds.indexOf(b); if (i >= 0) beds.splice(i, 1); }
    g.scene.remove(P.look.group);
    for (const m of P.look.group.children) m.dispose?.();
    if (A.plan.drains) this.ext.onDemote(P);
    A.levels.delete(k);
    this.counts.demoted++;
    g.emit('ugDemote', { site: A.site.id, level: k });
  }

  // The level's record from what is there now: everyone on it (alive or not, where they stand, their hp), its doors.
  writeBack(P) {
    const A = this.A, g = this.g, lr = P.lr;
    const occ = lr.occ ?? [];
    for (const c of P.occ) {
      const o = occ[c.ugOcc.i];
      if (!o) continue;
      if (!g.chars.includes(c)) { if (!c.alive) { o.alive = false; o.x = r1(c.x); o.z = r1(c.z); } continue; } // somebody else tidied them away: as they were, unless dead
      if (c.ug !== A.site.id) { o.alive = false; o.gone = true; continue; } // they went up top: not down here any more
      o.x = r1(c.x); o.z = r1(c.z); o.hp = Math.round(c.hp); o.alive = c.alive; o.face = +(c.face ?? 0).toFixed(2);
    }
    // Strays who came down after you (a chaser, a follower) and are on this level: they live here now.
    for (const c of g.chars) {
      if (c === g.player || c.ugOcc || c.ug !== A.site.id || this.levelOf(c.gy) !== P.k || !c.alive) continue;
      occ.push({ i: occ.length, kind: c.faction === 'zombie' ? (c.zkind === 'sprinter' ? 'sprinter' : 'shambler') : c.faction === 'soldier' ? 'soldier' : c.faction === 'raider' ? 'raider' : 'drifter', x: r1(c.x), z: r1(c.z), hp: Math.round(c.hp), alive: true, face: 0, weapon: c.weapon, name: c.name, adopted: true });
    }
    lr.occ = occ;
    for (const d of P.doors) lr.doors[d.id] = { l: d.locked ? 1 : 0, h: Math.round(d.lockHp ?? 0), k: d.kicks ?? 0, a: d.leaves.map((Lf) => +Lf.th.toFixed(3)) };
    lr.touched = true;
  }

  // ---- the walk grid and paths -----------------------------------------------------------------------------------
  makeWalk(P) {
    const L = P.L, n = L.W * L.H, walk = new Uint8Array(n);
    for (let q = 0; q < n; q++) { const t = L.cells[q]; walk[q] = t === OPEN ? 1 : t === POOL ? 2 : 0; }
    for (const p of L.props) for (let j = Math.floor(p.z0 - L.oz); j < Math.ceil(p.z1 - L.oz); j++) for (let i = Math.floor(p.x0 - L.ox); i < Math.ceil(p.x1 - L.ox); i++) { const q = j * L.W + i; if (q >= 0 && q < n && p.h > 0.5) walk[q] = 0; }
    for (const id of this.A.rec.collapsed) { const C = L.collapses.find((c) => c.id === id); if (C) for (let j = Math.floor(C.z - C.r - L.oz); j < Math.ceil(C.z + C.r - L.oz); j++) for (let i = Math.floor(C.x - C.r - L.ox); i < Math.ceil(C.x + C.r - L.ox); i++) { const q = j * L.W + i; if (q >= 0 && q < n) walk[q] = 0; } }
    // a door's own cells (shut while it is locked)
    P.doorCells = P.doors.map((d) => { const out = []; for (let s = -1; s <= 0; s++) { const x = d.axis === 'x' ? d.x + s + 0.5 : d.x, z = d.axis === 'x' ? d.z : d.z + s + 0.5; const q = Math.floor(z - L.oz) * L.W + Math.floor(x - L.ox); if (q >= 0 && q < n) out.push(q); } return { d, cells: out }; });
    P.walk = walk; P.g = new Float32Array(n); P.came = new Int32Array(n); P.seen = new Uint32Array(n); P.stamp = 0; P.heap = new Int32Array(Math.min(n * 4, 7200)); // the open list is capped at the F buffer's 7200
  }
  cellOf(P, x, z) { const L = P.L, i = Math.floor(x - L.ox), j = Math.floor(z - L.oz); return i < 0 || j < 0 || i >= L.W || j >= L.H ? -1 : j * L.W + i; }
  walkable(P, q) { if (q < 0 || !P.walk[q]) return false; return true; }
  // A* on the level's cells (8 neighbours, no corner cutting, locked doors shut). Returns world points or null.
  findPath(P, sx, sz, tx, tz) {
    const L = P.L, W = L.W, H = L.H, walk = P.walk;
    for (const D of P.doorCells) for (const q of D.cells) walk[q] = D.d.locked ? 0 : 1;
    let s = this.cellOf(P, sx, sz), t = this.cellOf(P, tx, tz);
    if (s < 0) return null;
    if (!walk[s]) s = this.nearWalk(P, s);
    if (t < 0 || !walk[t]) t = this.nearWalk(P, t < 0 ? this.cellOf(P, Math.max(L.ox, Math.min(L.ox + W - 1, tx)), Math.max(L.oz, Math.min(L.oz + H - 1, tz))) : t);
    if (s < 0 || t < 0) return null;
    if (s === t) return [];
    const st = ++P.stamp, G = P.g, C = P.came, S = P.seen, Hp = P.heap;
    const ti = t % W, tj = (t - ti) / W;
    const h = (q) => { const i = q % W, j = (q - i) / W, dx = Math.abs(i - ti), dz = Math.abs(j - tj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    let hn = 0;
    const F = this._F ?? (this._F = new Float32Array(3600 * 2));
    const push = (q, f) => { let i = hn++; Hp[i] = q; F[i] = f; while (i > 0) { const p = (i - 1) >> 1; if (F[p] <= F[i]) break; [Hp[p], Hp[i]] = [Hp[i], Hp[p]]; [F[p], F[i]] = [F[i], F[p]]; i = p; } };
    const pop = () => { const q = Hp[0]; hn--; if (hn > 0) { Hp[0] = Hp[hn]; F[0] = F[hn]; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < hn && F[a] < F[m]) m = a; if (b < hn && F[b] < F[m]) m = b; if (m === i) break; [Hp[m], Hp[i]] = [Hp[i], Hp[m]]; [F[m], F[i]] = [F[i], F[m]]; i = m; } } return q; };
    S[s] = st; G[s] = 0; C[s] = -1; push(s, h(s));
    let found = false, iter = 0;
    while (hn > 0 && iter++ < 8000) {
      if (hn > F.length - 16) break;
      const q = pop();
      if (q === t) { found = true; break; }
      const qi = q % W, qj = (q - qi) / W;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = qi + di, b = qj + dj;
        if (a < 0 || b < 0 || a >= W || b >= H) continue;
        const n2 = b * W + a;
        if (!walk[n2]) continue;
        if (di && dj && (!walk[qj * W + a] || !walk[b * W + qi])) continue;
        const ng = G[q] + (di && dj ? 1.414 : 1) * (walk[n2] === 2 ? 2 : 1);
        if (S[n2] === st && ng >= G[n2]) continue;
        S[n2] = st; G[n2] = ng; C[n2] = q; push(n2, ng + h(n2));
      }
    }
    if (!found) return null;
    const cells = [];
    for (let q = t; q !== s && q >= 0; q = C[q]) cells.push(q);
    cells.reverse();
    // string-pull: keep only the turns the grid needs
    const out = [];
    let ax = sx, az = sz;
    for (let i = 0; i < cells.length; i++) {
      const q = cells[i], nxt = cells[i + 1];
      if (nxt === undefined) { out.push({ x: L.ox + (q % W) + 0.5, z: L.oz + Math.floor(q / W) + 0.5 }); break; }
      const nx = L.ox + (nxt % W) + 0.5, nz = L.oz + Math.floor(nxt / W) + 0.5;
      if (!this.clearLine(P, ax, az, nx, nz)) { const p = { x: L.ox + (q % W) + 0.5, z: L.oz + Math.floor(q / W) + 0.5 }; out.push(p); ax = p.x; az = p.z; }
    }
    return out;
  }
  nearWalk(P, q) {
    if (q < 0) return -1;
    const L = P.L, W = L.W, qi = q % W, qj = (q - qi) / W;
    for (let r = 1; r <= 4; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const a = qi + di, b = qj + dj; if (a < 0 || b < 0 || a >= W || b >= L.H) continue; const n2 = b * W + a; if (P.walk[n2]) return n2; }
    return -1;
  }
  clearLine(P, ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.35);
    for (let s = 0; s <= n; s++) {
      const x = ax + ((bx - ax) * s) / n, z = az + ((bz - az) * s) / n;
      for (const [ox, oz] of [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) { const q = this.cellOf(P, x + ox, z + oz); if (q < 0 || !P.walk[q]) return false; }
    }
    return true;
  }

  // ---- hooks the engine calls ------------------------------------------------------------------------------------------
  // stunts.heightAt: the floor or flight under (x, z) for someone at y, or null (not ours).
  heightAt(x, z, y) {
    const A = this.A;
    if (!A || x < A.x0 || x > A.x1 || z < A.z0 || z > A.z1) return null;
    const G = A.plan.fgrid, F = G ? G.get(Math.floor(x / A.plan.fcell) * 65536 + Math.floor(z / A.plan.fcell)) ?? EMPTY : A.plan.flights; // a town's drains: only the ways in this 16 m cell
    for (let i = 0; i < F.length; i++) { const f = F[i], R0 = f.rect; if (x < R0.minX || x > R0.maxX || z < R0.minZ || z > R0.maxZ || (f.lid && !this.ext?.isOpen(f))) continue; const h = flightHeight(f, x, z, y); if (h !== null) return h; } // a shut lid is no way (systems/understreet.js)
    const R = A.liftR;
    if (R && x > R.minX && x < R.maxX && z > R.minZ && z < R.maxZ) { const ly = A.rec.lift.y; if (Math.abs(ly - y) < 2.2) return ly; }
    if (y > A.plan.Y[0] - UG.below) return null;
    if (A.plan.drains && !this.ext.under(x, z, y)) return null; // a town's drains: only someone really down there (low ground off the pad is not)
    let best = null, bd = 3.6;
    for (let k = 1; k <= A.plan.n; k++) { const d = Math.abs(A.plan.Y[k] - y); if (d < bd) { bd = d; best = A.plan.Y[k]; } }
    return best;
  }
  // main.js standOn: which site a person is under (their `ug`), or null.
  siteOf(c) {
    const A = this.A;
    if (!A || (c.gy ?? 0) > A.plan.Y[0] - UG.below || !this.inBox(c.x, c.z)) return null;
    if (A.plan.drains && !this.ext.under(c.x, c.z, c.gy ?? 0)) return null; // standing on ground lower than the street (a ring district, off a pad): still up top
    return A.site.id;
  }
  // A person on a flight walks it at the flight's pace (a ladder is slow).
  speedMul(c) {
    const A = this.A;
    if (!A || !c.ug) return 1;
    for (const f of A.plan.flights) { const R = f.rect; if (c.x > R.minX && c.x < R.maxX && c.z > R.minZ && c.z < R.maxZ && flightHeight(f, c.x, c.z, c.gy ?? 0) !== null) return f.speed; }
    return 1;
  }
  // ai.move: the next point on the level's own grid toward (tx, tz), or null (straight on is fine).
  waypoint(c, tx, tz) {
    const A = this.A;
    if (!A || c.ug !== A.site.id) return null;
    const k = this.levelOf(c.gy), P = A.levels.get(k);
    if (!P || Math.abs((c.gy ?? 0) - P.L.y) > 0.3) return null; // on a flight: straight up or down it
    for (const f of A.plan.flights) { const R = f.rect; if (tx > R.minX - 1 && tx < R.maxX + 1 && tz > R.minZ - 1 && tz < R.maxZ + 1 && Math.hypot(c.x - (f.to === k ? f.bottom.x : f.top.x), c.z - (f.to === k ? f.bottom.z : f.top.z)) < 1.6) return null; }
    const t = this.g.time, W = c.ugWay;
    const tq = this.cellOf(P, tx, tz);
    if (!W || W.k !== k || W.tq !== tq || t - W.t > 1.5 || !W.path) {
      if (this.clearLine(P, c.x, c.z, tx, tz)) { c.ugWay = { k, tq, t, path: [], i: 0 }; return null; }
      c.ugWay = { k, tq, t, path: this.findPath(P, c.x, c.z, tx, tz), i: 0 };
    }
    const p = c.ugWay.path;
    if (!p || !p.length) return null;
    while (c.ugWay.i < p.length - 1 && Math.hypot(p[c.ugWay.i].x - c.x, p[c.ugWay.i].z - c.z) < 0.6) c.ugWay.i++;
    return p[c.ugWay.i];
  }
  // storeys.steer: the way to a target on another level (or up top): the flight toward it. undefined: not ours.
  steer(c, tx, tz, ty = 0) {
    const A = this.A;
    if (!A) return undefined;
    const cU = c.ug === A.site.id, tU = ty < A.plan.Y[0] - UG.below && this.inBox(tx, tz);
    if (!cU && !tU) return undefined;
    const ck = cU ? this.levelOf(c.gy) : 0, tk = tU ? this.levelOf(ty) : 0;
    const F = A.plan.flights;
    for (const f of F) { const R = f.rect; if (c.x >= R.minX && c.x <= R.maxX && c.z >= R.minZ && c.z <= R.maxZ && flightHeight(f, c.x, c.z, c.gy ?? 0) !== null) return tk > f.from ? f.bottom : f.top; }
    if (ck === tk) return null;
    if (A.plan.drains) return this.ext.steer(c, ck, tk, tx, tz); // many ways: the nearest open one toward the target
    const down = tk > ck, f = down ? F.find((q) => q.from === ck) : F.find((q) => q.to === ck);
    if (!f) return null;
    const near = down ? f.top : f.bottom, far = down ? f.bottom : f.top;
    return Math.hypot(near.x - c.x, near.z - c.z) < 0.9 ? far : near;
  }

  // ai.update, before anyone else's mind: the holdout's people and its drone, the dead kept near their nest.
  think(c, dt) {
    if (!c.ugRole || !this.A || c.ug !== this.A.site.id) return false;
    if (c.ugRole === 'drone') { this.drone(c, dt); return true; }
    if (c.ugRole === 'soldier') { if (c.target) return false; this.soldier(c, dt); return true; }
    if (c.ugRole === 'infected' && !c.ztarget && c.timer <= dt && c.ugPost && c.zkind !== 'echo' && c.zkind !== 'choir') {
      c.timer = 4 + Math.random() * 5; c.wx = c.ugPost.x + (Math.random() - 0.5) * 7; c.wz = c.ugPost.z + (Math.random() - 0.5) * 7; // they keep to their own rooms
    }
    return false;
  }

  friendly() { const F = this.g.society?.factions, i = F?.index?.remnant; const t = i === undefined ? 'neutral' : F.tiers[i]; return t === 'friendly' || t === 'allied'; }
  hostileNow() {
    const A = this.A, p = this.g.player;
    A.rec.alert = 'hostile';
    for (const P of A.levels.values()) for (const c of P.occ) if (c.alive && (c.ugRole === 'soldier' || c.ugRole === 'drone')) { c.grudge = p; if (this.g.sees(c, p)) { c.target = p; c.state = 'fight'; } }
    this.g.emit('ugAlert', { site: A.site.id, alert: 'hostile' });
  }
  // A holdout soldier at their post (or on their round): a trespasser in sight is challenged once, then shot if they stay.
  soldier(c, dt) {
    const g = this.g, A = this.A, p = g.player, rec = A.rec;
    c.ugChk = (c.ugChk ?? Math.random() * 0.3) - dt;
    if (c.ugChk <= 0) {
      c.ugChk = 0.3;
      if (p.alive && rec.alert !== 'hostile' && Math.hypot(p.x - c.x, p.z - c.z) < 24 && g.sees(c, p)) {
        if (this.friendly()) { if (!c.ugHailed) { c.ugHailed = true; g.feedback?.floater(c.x, c.z, HOLDOUT.hailOk, 'bark'); } }
        else if (rec.alert === 'calm') { rec.alert = 'warned'; rec.warnT = HOLDOUT.warn; g.feedback?.floater(c.x, c.z, HOLDOUT.hail, 'bark'); g.hud.toast(`"${HOLDOUT.hail}"`, 'hot'); g.emit('ugAlert', { site: A.site.id, alert: 'warned', by: c.id }); }
        else if (rec.alert === 'warned' && rec.warnT <= 0) this.hostileNow();
        if (rec.alert !== 'calm') c.face = Math.atan2(p.x - c.x, p.z - c.z);
      }
    }
    if (rec.alert === 'hostile') { if (g.sees(c, p)) { c.target = p; c.grudge = p; c.state = 'fight'; return; } }
    // the round, or the post
    const R = c.ugRoute;
    if (R && rec.alert !== 'warned') {
      const T = R[c.ugLeg % R.length];
      if (Math.hypot(T.x - c.x, T.z - c.z) < 0.8) c.ugLeg++;
      else g.ai.move(c, T.x - c.x, T.z - c.z, 1.3, dt);
      return;
    }
    const post = c.ugPost;
    if (Math.hypot(post.x - c.x, post.z - c.z) > 0.6 && rec.alert !== 'warned') g.ai.move(c, post.x - c.x, post.z - c.z, 1.3, dt);
    else c.speed = 0;
  }
  // The drone: flies its corridor end to end; its beam picks you out; it challenges once, then hunts you.
  drone(c, dt) {
    const g = this.g, A = this.A, p = g.player, rec = A.rec, D = HOLDOUT.drone;
    if (!c.alive) return;
    const d = Math.hypot(p.x - c.x, p.z - c.z), hostile = rec.alert === 'hostile' || c.grudge === p;
    const see = p.alive && d < D.beam + (hostile ? 8 : 0) && g.sees(c, p);
    const ang = Math.atan2(p.x - c.x, p.z - c.z);
    let da = Math.abs(ang - c.face); if (da > Math.PI) da = Math.PI * 2 - da;
    const inBeam = see && (hostile || da < (D.cone * Math.PI) / 180);
    if (inBeam && !hostile && !this.friendly()) {
      if (rec.alert === 'calm') { rec.alert = 'warned'; rec.warnT = HOLDOUT.warn; g.audio.beep?.(g.pan(c.x)); g.feedback?.floater(c.x, c.z, 'TRESPASSER. STAND STILL.', 'bark'); g.emit('ugAlert', { site: A.site.id, alert: 'warned', by: c.id }); }
      else if (rec.alert === 'warned' && rec.warnT <= 0) this.hostileNow();
    }
    if (hostile && see) {
      c.face = Math.atan2(p.x - c.x, p.z - c.z);
      const want = d > 9 ? 1 : d < 6 ? -1 : 0;
      if (want) g.ai.move(c, (p.x - c.x) * want, (p.z - c.z) * want, D.pace, dt); else c.speed = 0;
      c.face = ang; c.aiming = true;
      c.ugShot = (c.ugShot ?? 0) - dt;
      if (c.ugShot <= 0) {
        if (g.combat.fire(c, 'smg', ang + (Math.random() - 0.5) * 0.06, DRONE_GUN)) {
          c.ugBurst = (c.ugBurst ?? D.burst) - 1;
          if (c.ugBurst <= 0) { c.ugBurst = D.burst; c.ugShot = D.rest; } else c.ugShot = D.rate;
        }
      }
      return;
    }
    if (hostile) { g.ai.move(c, p.x - c.x, p.z - c.z, D.pace, dt); return; }
    const R = c.ugRoute;
    if (!R) return;
    const T = R[c.ugLeg % R.length];
    if (Math.hypot(T.x - c.x, T.z - c.z) < 0.7) { c.ugLeg++; c.ugPause = 1.2; }
    if ((c.ugPause = (c.ugPause ?? 0) - dt) > 0) { c.face += dt * 1.2; c.speed = 0; return; } // a slow look round at each end
    g.ai.move(c, T.x - c.x, T.z - c.z, D.pace * 0.7, dt);
  }

  // ---- sound ---------------------------------------------------------------------------------------------------------
  // main.js noise: an underground noise is ours (true: the street never hears it, but at the hatch a share of it climbs
  // the shaft); a street noise is not (false), though a share of one at the hatch's top goes down it.
  noise(x, z, r, src) {
    const A = this.A;
    if (!A) return false;
    if (src?.ug === A.site.id) { this.levelNoise(this.levelOf(src.gy ?? 0), x, z, r, src); return true; }
    if (src?.ug) return true; // another site's (never live): nobody hears it
    if (this.climbing) return false; // a noise that just climbed a shaft does not echo back down (it would re-flood the buffer mid-loop)
    if (A.plan.drains) { this.ext.streetNoise(x, z, r, src); return false; } // down the nearest open shafts
    // street noise at the entrance's top: a share goes down the stair
    const top = A.plan.flights[0].top, d = Math.hypot(top.x - x, top.z - z);
    if (d < r && A.levels.has(1)) { const b = A.plan.flights[0].bottom; this.levelNoise(1, b.x, b.z, (r - d) * NOISE.shaft, src, true); }
    return false;
  }
  // Flood the level's cells from the noise out to r metres: whoever stands on a reached cell hears it. At a flight's foot
  // or head it carries on to the next level at NOISE.level of what is left; at the entrance's foot, up to the street.
  levelNoise(k, x, z, r, src, fromStreet = false) {
    const A = this.A, g = this.g, P = A.levels.get(k);
    if (!P || r <= 0.5) return;
    const L = P.L, W = L.W, H = L.H, carry = L.carry ?? 1; // a pipe carries sound: a metre of it costs `carry` (data/understreet.js)
    if (!this._dist || this._dist.length < W * H) { this._dist = new Float32Array(Math.max(3600, W * H)); this._q = new Int32Array(Math.max(7200, W * H)); }
    const dist = this._dist, q = this._q, QL = q.length; // a ring: a cell can be queued again when a shorter way reaches it
    dist.fill(Infinity, 0, W * H);
    let s = this.cellOf(P, x, z);
    if (s < 0) return;
    if (!L.cells[s]) s = this.nearWalk(P, s);
    if (s < 0) return;
    let h = 0, t = 0; dist[s] = 0; q[t++] = s;
    const pass = (c) => c === OPEN || c === POOL || c === STAIR || c === HOLE || c === SHAFT;
    if (L.kind === 'drains') { // a town's pipes run square: one visit a cell, four ways, `carry` a metre (a town-sized level: no re-queueing)
      while (h < t) {
        const p = q[h++], pi = p % W, dp = dist[p] + carry;
        if (dp > r) continue;
        if (pi + 1 < W && dist[p + 1] === Infinity && pass(L.cells[p + 1])) { dist[p + 1] = dp; q[t++] = p + 1; }
        if (pi > 0 && dist[p - 1] === Infinity && pass(L.cells[p - 1])) { dist[p - 1] = dp; q[t++] = p - 1; }
        if (p + W < W * H && dist[p + W] === Infinity && pass(L.cells[p + W])) { dist[p + W] = dp; q[t++] = p + W; }
        if (p - W >= 0 && dist[p - W] === Infinity && pass(L.cells[p - W])) { dist[p - W] = dp; q[t++] = p - W; }
      }
      h = t;
    }
    while (h < t) {
      const p = q[h++ % QL], pi = p % W, pj = (p - pi) / W, dp = dist[p];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = pi + di, b = pj + dj;
        if (a < 0 || b < 0 || a >= W || b >= H) continue;
        const n = b * W + a, nd = dp + (di && dj ? 1.414 : 1) * carry;
        if (nd > r || nd >= dist[n] || !pass(L.cells[n])) continue;
        dist[n] = nd; if (t - h < QL) q[t++ % QL] = n;
      }
    }
    const heard = (cx, cz) => { const c2 = this.cellOf(P, cx, cz); return c2 >= 0 ? dist[c2] : Infinity; };
    // listeners on this level
    for (const c of g.chars) {
      if (!c.alive || c === g.player || c === src || c.ug !== A.site.id || this.levelOf(c.gy) !== k) continue;
      const dd = heard(c.x, c.z);
      if (dd > r) continue;
      if (c.faction === 'zombie') {
        if (c.zkind === 'sprinter' && dd < 20) g.zombies.burst(c, 'noise');
        if (c.ztarget || c.zkind === 'echo' || c.zkind === 'choir') continue;
        c.wx = x + (Math.random() - 0.5) * 4; c.wz = z + (Math.random() - 0.5) * 4; c.timer = 10;
      } else if (c.ugRole === 'soldier' || c.ugRole === 'drone') {
        if (src === g.player && !this.friendly() && A.rec.alert !== 'hostile') this.hostileNow();
      } else if (!c.weapon) { if (c.flee <= 0) { c.flee = 5; c.fleeX = x; c.fleeZ = z; } }
      else if (src && !c.target && g.ai.hostile(c, src)) { c.target = src; c.state = 'fight'; }
    }
    if (src === g.player || !src) g.survival?.heard?.(x, z, r);
    // a cracked roof within reach of a loud enough noise may come down
    if (r >= COLLAPSE.minNoise) for (const C of L.collapses) if (!A.rec.collapsed.includes(C.id) && heard(C.x, C.z) < COLLAPSE.r && Math.random() < COLLAPSE.chance) this.collapse(P, C);
    if (fromStreet) return;
    // on to the levels a flight joins (and, from the entrance's foot, the street)
    for (const f of A.plan.flights) {
      const end = f.to === k ? f.bottom : f.from === k ? f.top : null;
      if (!end) continue;
      const dd = heard(end.x, end.z);
      if (dd >= r) continue;
      const left = (r - dd) * NOISE.level, other = f.to === k ? f.from : f.to, at = f.to === k ? f.top : f.bottom;
      if (other === 0) { if (left > 4 && (!f.lid || this.ext?.isOpen(f))) { this.climbing = true; g.noise(at.x, at.z, (r - dd) * NOISE.shaft, null); this.climbing = false; if (A.plan.drains) this.ext.climbed(f, x, z, (r - dd) * NOISE.shaft); } } // a shut lid keeps it down; what climbs a shaft never comes back down another (and never floods this buffer again mid-loop)
      else if (A.levels.has(other)) this.levelNoise(other, at.x, at.z, left, src, true);
    }
  }

  collapse(P, C) {
    const A = this.A, g = this.g, y = P.L.y;
    A.rec.collapsed.push(C.id);
    this.counts.collapses++;
    P.boxes.push(this.U.addBox(C.x - C.r, C.z - C.r, C.x + C.r, C.z + C.r, 'ug-rubble', y, y + UG.wallH));
    for (const c of g.chars) if (c.alive && c.ug === A.site.id && this.levelOf(c.gy) === P.k && Math.hypot(c.x - C.x, c.z - C.z) < C.r + 0.8) { g.combat.damage(c, COLLAPSE.dmg, null, 0, 0, 'explosion'); const t = { x: c.x, z: c.z }; this.U.resolveCircle(t, 0.45, null, y + 0.25, null, y + 2.4); c.x = t.x; c.z = t.z; }
    g.audio.explosion?.(Math.hypot(C.x - g.player.x, C.z - g.player.z) * 0.6);
    g.hud.shake(0.9);
    for (let i = 0; i < 30; i++) g.fx.dust(C.x + (Math.random() - 0.5) * C.r * 2, C.z + (Math.random() - 0.5) * C.r * 2, 2);
    if (g.player.ug === A.site.id) g.hud.toast('THE ROOF COMES DOWN', 'hot');
    g.emit('ugCollapse', { site: A.site.id, level: P.k, id: C.id, x: C.x, z: C.z });
    this.rebuildLook(P); this.makeWalk(P);
  }
  rebuildLook(P) {
    const g = this.g, vis = P.look.group.visible;
    g.scene.remove(P.look.group); for (const m of P.look.group.children) m.dispose?.();
    P.look = buildLevel(P.L, this.A.plan, this.A.site, this.A.rec, P.lr, this.M);
    P.look.group.visible = vis; g.scene.add(P.look.group); this.paint(P);
  }

  // ---- power, the lift, the keypads ------------------------------------------------------------------------------------
  setPower(on, why = '') {
    const A = this.A, g = this.g;
    if (!A || A.rec.power === on) return;
    A.rec.power = on;
    for (const P of A.levels.values()) this.paint(P);
    g.emit('ugPower', { site: A.site.id, on, why });
    if (g.player.ug === A.site.id) g.hud.toast(on ? 'THE GENERATOR CATCHES · LIGHTS' : 'THE GENERATOR DIES', on ? 'job' : 'warn');
  }
  // Repaint a level's emissive pieces for the power state and its keypads' locks.
  paint(P) {
    const A = this.A, on = A.rec.power, S = P.look.strips, G = P.look.glows, c = _c;
    if (S) {
      P.look.stripItems.forEach((it, i) => {
        if (it.kind === 'chem') c.set(LIGHT.chem[it.c]);
        else if (it.kind === 'keypad') { const d = P.doors.find((q) => q.id === it.door); c.set(!on ? LIGHT.stripOff : d?.locked ? '#ff3a22' : '#5cff6a'); }
        else if (it.kind === 'gen') c.set(on ? '#5cff6a' : A.rec.fuel > 0 ? '#ffb020' : '#ff3a22');
        else if (it.kind === 'lift') c.set(on ? '#ffd040' : LIGHT.stripOff);
        else if (it.kind === 'screen') c.set(on ? '#7ad8b0' : LIGHT.stripOff);
        else if (it.kind === 'deadpad') c.set(LIGHT.stripOff); // the glass room's keypad: no power reaches it (data/fannods.js)
        else c.set(on ? LIGHT.strip : LIGHT.stripOff);
        S.setColorAt(i, c);
      });
      S.instanceColor.needsUpdate = true;
    }
    if (G) { P.look.glowItems.forEach((it, i) => { G.setColorAt(i, c.set(it.kind === 'chem' ? LIGHT.chem[it.c] : on ? '#8a6a3a' : '#000000')); }); G.instanceColor.needsUpdate = true; }
  }
  callLift(stop) {
    const A = this.A;
    if (!A?.plan.lift) return { ok: false, why: 'no lift here' };
    if (!A.rec.power) return { ok: false, why: 'no power: the lift is dead' };
    if (stop < 0 || stop > A.plan.n) return { ok: false, why: `stops 0..${A.plan.n}` };
    A.rec.lift.target = stop;
    this.g.audio.burst?.({ dur: 0.6, freq: 120, vol: 0.4, decay: 0.5 });
    this.g.emit('ugLift', { site: A.site.id, to: stop });
    return { ok: true, to: stop };
  }
  learn(site, group) { const r = this.rec(site); if (group && !r.codes.includes(group)) r.codes.push(group); }
  readLog(P, g0) {
    const A = this.A, g = this.g, row = LOGS[g0.id];
    if (!row) return null;
    if (!row.paper && !A.rec.power) { g.hud.toast('THE SCREEN IS DEAD · NO POWER', 'warn'); return { ok: false, why: 'no power' }; }
    const code = row.code ? this.codes(A.site)[row.code] : null, text = row.text.replace('{code}', code ?? '');
    if (!A.rec.read.includes(g0.id)) A.rec.read.push(g0.id);
    if (row.code) this.learn(A.site, row.code);
    this.counts.logs++;
    g.hud.toast(row.title, 'job');
    g.hud.subtitle(text, 9);
    g.emit('ugLog', { site: A.site.id, id: g0.id, title: row.title, code: row.code ?? null });
    return { ok: true, title: row.title, text, code: row.code ?? null };
  }
  // Open a keypad door with its code (power on, the code learned).
  keypad(door, by) {
    const A = this.A, g = this.g;
    if (!door.locked) return { ok: true, already: true };
    if (!A.rec.power) return { ok: false, why: 'the keypad is dead: no power' };
    if (!door.keypad || !A.rec.codes.includes(door.keypad)) return { ok: false, why: 'you do not know the code' };
    g.interiors.unlock(door, 'code', by, false);
    g.audio.burst?.({ dur: 0.08, freq: 1800, vol: 0.25, decay: 0.06 });
    for (const P of A.levels.values()) this.paint(P);
    g.emit('ugKeypad', { site: A.site.id, door: door.id });
    return { ok: true, code: this.codes(A.site)[door.keypad] };
  }
  crank(door, by) { const g = this.g; g.noise(door.x, door.z, BLAST.crankNoise, by); g.interiors.unlock(door, 'cranked', by, false); for (const P of this.A.levels.values()) this.paint(P); g.emit('ugCrank', { door: door.id }); return { ok: true }; }
  plant(door, by, kind) {
    const g = this.g, C = BLAST.charge;
    g.inv.throwables[kind] = Math.max(0, (g.inv.throwables[kind] ?? 0) - 1);
    this.charges.push({ door, by, t: C.fuse, beep: 0, x: door.x + door.nx * 0.4, z: door.z + door.nz * 0.4, y: door.y, kind });
    this.counts.charges++;
    g.hud.toast(`CHARGE SET · ${C.fuse} SECONDS · GET BACK`, 'hot');
    g.emit('ugCharge', { door: door.id, kind });
    return { ok: true, fuse: C.fuse };
  }
  detonate(ch) {
    const g = this.g, A = this.A, C = BLAST.charge, d = ch.door;
    g.fx.explosion?.(ch.x, ch.z);
    g.audio.explosion(Math.hypot(ch.x - g.player.x, ch.z - g.player.z));
    g.hud.shake(Math.max(0, 1.4 - Math.hypot(ch.x - g.player.x, ch.z - g.player.z) / 20));
    if (d.locked) g.interiors.unlock(d, 'blast', ch.by, true, ch.x + d.nx, ch.z + d.nz);
    for (const c of g.chars) {
      if (!c.alive || c.ug !== A?.site.id || Math.abs((c.gy ?? 0) - ch.y) > 2) continue;
      const dd = Math.hypot(c.x - ch.x, c.z - ch.z);
      if (dd > C.r || !g.statics.lineOfSight(ch.x, ch.z, c.x, c.z, RAY_SIGHT, ch.y + 1 - this.y0)) continue;
      const f = 1 - dd / C.r;
      g.combat.damage(c, C.dmg * f * f + 8 * f, ch.by, (c.x - ch.x) / (dd || 1), (c.z - ch.z) / (dd || 1), f > 0.5 ? 'explosion' : 'bullet');
    }
    if (A) { this.levelNoise(this.levelOf(ch.y), ch.x, ch.z, 80, ch.by); for (const P of A.levels.values()) this.paint(P); }
    g.emit('ugBlast', { door: d.id, x: r1(ch.x), z: r1(ch.z) });
  }
  startGenerator(by) {
    const A = this.A, g = this.g;
    if (A.rec.power) return { ok: true, already: true };
    if (A.rec.fuel <= 0.001) {
      if (g.inventory.carried.count('fuel_can') > 0) { g.inventory.spend('fuel_can', 1); A.rec.fuel = Math.min(1, A.rec.fuel + GENERATOR.can); g.hud.toast('YOU POUR THE CAN INTO THE DAY TANK', 'job'); }
      else return { ok: false, why: 'the tank is dry: a fuel can fills it' };
    }
    this.setPower(true, 'started');
    this.levelNoise(this.levelOf(by.gy ?? 0), by.x, by.z, GENERATOR.noise + 10, null);
    return { ok: true, fuel: +A.rec.fuel.toFixed(2) };
  }

  // ---- the E key below -------------------------------------------------------------------------------------------------
  // What a key does near the player (main.js asks before the doors and the boxes): the lift, the generator, a keypad or
  // a blast door, a door down here, a log. Returns the ring target (or null: nothing of ours in reach).
  playerInteract(p, I, dt) {
    const A = this.A, g = this.g;
    if (!A || p.ug !== A.site.id) { this.holdT = 0; this.holdOn = null; return null; }
    const P = A.levels.get(this.levelOf(p.gy));
    if (!P) return null;
    if (A.plan.drains) { const x = this.ext.interact(p, I, dt); if (x) return x; } // lids from below, the outfall's bars
    const down = I.key('KeyE'), hit = I.hit('KeyE'), y = P.L.y;
    const ring = this._ring ?? (this._ring = { x: 0, z: 0, len: 2 });
    // A held E counts for one thing at a time: a new thing in reach starts the count again (a finished hold waits for E up).
    const hold = (key, need, label, done) => {
      if (this.holdOn !== key) { this.holdOn = key; this.holdT = 0; }
      if (down && this.holdT >= 0) { this.holdT = (this.holdT ?? 0) + dt; const k = Math.min(1, this.holdT / need); g.hud.prompt(`${label}… ${Math.round(k * 100)}%`); if (k >= 1) { this.holdT = -1; done(); } return true; }
      if (!down) this.holdT = 0;
      return false;
    };
    // the lift: its panel at the gate, or standing on the platform
    if (A.plan.lift) {
      const R = A.liftR, on = p.x > R.minX && p.x < R.maxX && p.z > R.minZ && p.z < R.maxZ, lb = P.L.lobby;
      if (on || (lb && Math.hypot(lb.x - p.x, lb.z - p.z) < 2.2)) {
        const stop = A.rec.lift.stop, next = on ? (stop + 1) % (A.plan.n + 1) : P.k;
        ring.x = (R.minX + R.maxX) / 2; ring.z = (R.minZ + R.maxZ) / 2; ring.len = 3.4;
        g.hud.prompt(!A.rec.power ? 'The lift: NO POWER' : on ? `<kbd>E</kbd> Send the lift to ${next ? `level ${next}` : 'the surface'}` : '<kbd>E</kbd> Call the lift');
        if (hit) { const r = this.callLift(next); if (!r.ok) g.hud.toast(r.why.toUpperCase(), 'warn'); }
        return ring;
      }
    }
    // the generator
    const G = P.L.generator;
    if (G && Math.hypot(G.x - p.x, G.z - p.z) < 2.4) {
      ring.x = G.x; ring.z = G.z; ring.len = 2.8;
      if (A.rec.power) { g.hud.prompt(`The generator runs · tank ${Math.round(A.rec.fuel * 100)}% · hold <kbd>E</kbd> Shut it down`); hold('gen-off', 1.2, 'Shutting it down', () => this.setPower(false, 'shut down')); return ring; }
      const dry = A.rec.fuel <= 0.001, can = g.inventory.carried.count('fuel_can') > 0;
      if (!hold('gen', GENERATOR.hold, dry && can ? 'Pouring the can, cranking' : 'Priming, cranking', () => { const r = this.startGenerator(p); if (!r.ok) g.hud.toast(r.why.toUpperCase(), 'warn'); }))
        g.hud.prompt(dry && !can ? 'The generator · DRY · a fuel can fills it' : `hold <kbd>E</kbd> Start the generator · tank ${Math.round(A.rec.fuel * 100)}%${dry ? ' (pour your can)' : ''}`);
      return ring;
    }
    // doors down here
    let door = null, bd = 2.2;
    for (const d of P.doors) { const dd = Math.hypot(d.x - p.x, d.z - p.z); if (dd < bd) { let shut = true; for (const Lf of d.leaves) if (Lf.th > 0.3 || Lf.th < -0.3) shut = false; if (shut || d.locked) { bd = dd; door = d; } } }
    if (door) {
      ring.x = door.x; ring.z = door.z; ring.len = 2.4;
      const inv = g.inventory, bar = inv.hasTag('pry'), picks = inv.carried.slots.some((s) => s.id === 'lockpicks' && s.left > 0);
      const charge = BLAST.charge.uses.find((k) => (g.inv.throwables[k] ?? 0) > 0);
      if (door.locked && (door.keypad || door.blast)) {
        const known = door.keypad && A.rec.codes.includes(door.keypad), code = known ? this.codes(A.site)[door.keypad] : null;
        const what = door.blast ? 'BLAST DOOR' : 'KEYPAD';
        if (A.rec.power) {
          if (known && hit) { this.keypad(door, p); return ring; }
          if (charge && hold(`charge:${door.id}`, BLAST.charge.hold, 'Setting the charge', () => this.plant(door, p, charge))) return ring;
          g.hud.prompt(known ? `<kbd>E</kbd> Key in ${code}` : `${what} · the keypad wants a code${charge ? ` · hold <kbd>E</kbd> Set a charge (${charge})` : ''}`);
          return ring;
        }
        if (bar && hold(`crank:${door.id}`, BLAST.crank, 'Cranking the manual release (loud)', () => this.crank(door, p))) return ring;
        if (!bar && charge && hold(`charge:${door.id}`, BLAST.charge.hold, 'Setting the charge', () => this.plant(door, p, charge))) return ring;
        g.hud.prompt(`${what} · keypad dead (no power)${bar ? ' · hold <kbd>E</kbd> Crank the manual release' : charge ? ` · hold <kbd>E</kbd> Set a charge (${charge})` : ' · a crowbar or a charge'}`);
        return ring;
      }
      // an ordinary door: the interiors rules (kick; picks or a bar on a held E)
      const tool = door.locked ? (picks ? 'pick' : bar ? 'pry' : null) : null;
      if (tool && hold(`${tool}:${door.id}`, tool === 'pick' ? 2.6 : 1.3, tool === 'pick' ? 'Picking the lock' : 'Prying it', () => inv.forceLock(door, tool))) return ring;
      if (hit && !tool) g.interiors.kick(door, p);
      if (!down && this.holdTap > 0 && this.holdTap < 0.3 && tool) g.interiors.kick(door, p);
      this.holdTap = down ? (this.holdTap ?? 0) + dt : 0;
      g.hud.prompt(door.locked ? `<kbd>E</kbd> Kick it in · locked (${door.kicks} more)${tool ? ` · hold <kbd>E</kbd> ${tool === 'pick' ? 'Pick the lock (quiet)' : 'Pry it (loud)'}` : ''}` : '<kbd>E</kbd> Kick the door open');
      return ring;
    }
    // a log
    let log = null, bl = 1.6;
    for (const lg of P.logs) { const dd = Math.hypot(lg.x - p.x, lg.z - p.z); if (dd < bl) { bl = dd; log = lg; } }
    if (log) {
      ring.x = log.x; ring.z = log.z; ring.len = 1.4;
      const row = LOGS[log.id];
      g.hud.prompt(`<kbd>E</kbd> Read ${row.paper ? 'the note' : 'the terminal'} · ${row.title}${A.rec.read.includes(log.id) ? ' (read)' : ''}`);
      if (hit) this.readLog(P, log);
      return ring;
    }
    void y;
    return null;
  }

  // ---- every frame -------------------------------------------------------------------------------------------------
  update(simDt, dt) {
    const g = this.g, p = g.player;
    // Entrances near you attach (a few checks a second).
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 0.5;
      for (const s of this.sites) {
        const dx = s.x - p.x, dz = s.z - p.z;
        const aR = s.attachR ?? UG.attachR, near = Math.abs(dx) < aR && Math.abs(dz) < aR && dx * dx + dz * dz < aR * aR; // a town's drains: its half-size and a pad
        if (near && !this.attached.has(s.id) && this.place(s)) this.attach(s);
        else if (this.attached.has(s.id) && Math.abs(dx) + Math.abs(dz) > (s.attachR ? aR + 60 : UG.releaseR) * 1.3 && this.A?.site !== s) this.detach(s.id);
      }
    }
    // The live site: the one you are under, or whose entrance you stand at.
    const at = (T) => { if (T.plan.drains) return this.ext.nearWay(T, p); const t = this.entTop(T); return Math.hypot(t.x - p.x, t.z - p.z) < UG.promoteNear || (T.plan.lift && Math.hypot(T.plan.lift.street.x - p.x, T.plan.lift.street.z - p.z) < UG.promoteNear); };
    if (!this.A || (this.A.plan.drains && !p.ug)) { // a town's drains give way to a site's own entrance you walk up to
      for (const [id, T] of this.attached) { if (this.A?.site.id === id || (this.A && T.plan.drains)) continue; if (at(T)) { this.activate(this.byId.get(id)); break; } }
    }
    if (this.A && !p.ug) {
      const T = this.A.T, far = T.plan.drains ? !this.ext.nearWay(T, p, UG.promoteNear * 3.5) : Math.hypot(this.entTop(T).x - p.x, this.entTop(T).z - p.z) > UG.promoteNear * 3.5;
      if (far && !this.hunted(1)) this.deactivate();
    }
    const A = this.A;
    if (A) {
      // Which levels are wanted: yours, the one a flight you stand near leads to; level 1 while you are at the entrance.
      const k = p.ug === A.site.id ? this.levelOf(p.gy) : 0, t = g.time;
      const want = (n) => { if (n >= 1 && n <= A.plan.n) { A.wantT.set(n, t); if (!A.levels.has(n)) this.promote(n); } };
      if (k === 0) want(1); else want(k);
      for (const f of A.plan.flights) {
        const R = f.rect, onIt = p.x > R.minX - 0.5 && p.x < R.maxX + 0.5 && p.z > R.minZ - 0.5 && p.z < R.maxZ + 0.5;
        if (onIt || (f.from === k && Math.hypot(f.top.x - p.x, f.top.z - p.z) < 12) || (f.to === k && Math.hypot(f.bottom.x - p.x, f.bottom.z - p.z) < 12)) { want(f.from); want(f.to); }
      }
      if (A.plan.lift && A.rec.lift.target !== null) { want(A.rec.lift.target); }
      for (const [n] of A.levels) if (t - (A.wantT.get(n) ?? 0) > UG.demoteAfter && !this.hunted(n)) this.demote(n);
      if (simDt > 0) this.sim(simDt);
    }
    this.drawDrones(dt);
    this.drawEyes();
  }

  // Somebody on level n is after you, within huntKeep (the level stays live so the chase carries on).
  hunted(n) {
    const A = this.A, P = A?.levels.get(n), p = this.g.player;
    if (!P) return false;
    for (const c of P.occ) if (c.alive && (c.target === p || c.ztarget === p) && Math.hypot(c.x - p.x, c.z - p.z) < UG.huntKeep) return true;
    return false;
  }

  sim(dt) {
    const A = this.A, g = this.g, rec = A.rec;
    if (rec.warnT > 0) rec.warnT -= dt;
    // The generator: it burns its tank on the game clock, and it is loud.
    const hour = (g.society?.day ?? 0) * 24 + g.sky.time;
    if (this.lastHour !== null && rec.power) {
      rec.fuel = Math.max(0, rec.fuel - Math.max(0, hour - this.lastHour) * GENERATOR.burn);
      if (rec.fuel <= 0) this.setPower(false, 'out of fuel');
    }
    this.lastHour = hour;
    if (rec.power) {
      for (const P of A.levels.values()) if (P.L.generator && (this.genT -= dt) <= 0) { this.genT = GENERATOR.every; this.levelNoise(P.k, P.L.generator.x, P.L.generator.z, GENERATOR.noise, null); }
    }
    // The lift: toward its target, at its pace, with everyone standing on it.
    if (A.plan.lift && rec.lift.target !== null && rec.power) {
      const want = A.plan.Y[rec.lift.target], L = rec.lift, R = A.liftR, step = LIFT.speed * dt;
      const ny = Math.abs(want - L.y) <= step ? want : L.y + Math.sign(want - L.y) * step;
      for (const c of g.chars) if (c.alive && !c.inVehicle && c.x > R.minX && c.x < R.maxX && c.z > R.minZ && c.z < R.maxZ && Math.abs((c.gy ?? 0) - L.y) < 0.6) { c.gy = ny; g.standOn(c); }
      L.y = ny;
      if (ny === want) { L.stop = L.target; L.target = null; g.emit('ugLiftArrived', { site: A.site.id, stop: L.stop }); }
    }
    if (A.plan.lift) {
      const L = rec.lift;
      for (const P of A.levels.values()) if (P.gate) { const open = L.target === null && Math.abs(L.y - P.L.y) < 0.05; P.gate.height = open ? P.gate.base : P.gate.base + LIFT.gateH; }
      this.syncSurfaceGate(A.site.id);
      A.platform.position.y = L.y - 0.1;
    }
    // Charges.
    for (let i = this.charges.length - 1; i >= 0; i--) {
      const ch = this.charges[i];
      ch.t -= dt; ch.beep -= dt;
      if (ch.beep <= 0) { ch.beep = Math.max(0.15, ch.t / 4); g.audio.beep?.(g.pan(ch.x)); g.fx.spark?.(ch.x, ch.y + 0.4, ch.z); }
      if (ch.t <= 0) { this.charges.splice(i, 1); this.detonate(ch); }
    }
    // Who is down here: people who walk off the level (up the stair) are no longer its; people who came down join it.
    if ((this.adoptT -= dt) <= 0) {
      this.adoptT = 0.5;
      for (const P of A.levels.values()) for (let i = P.occ.length - 1; i >= 0; i--) { const c = P.occ[i]; if (!g.chars.includes(c)) continue; if (c.ug !== A.site.id) { const o = P.lr.occ[c.ugOcc.i]; if (o) { o.alive = false; o.gone = true; } c.ugOcc = null; c.ugRole = null; P.occ.splice(i, 1); } }
    }
  }

  // ---- what you see --------------------------------------------------------------------------------------------------
  // main.js updateCamera, every frame after the camera moves: the clipping plane, which level's meshes show, the
  // occluder, the light (systems/sky.js reads below/belowFill), the shadow map, the effects' ground.
  view(cam) {
    const g = this.g, p = g.player, A = this.A, S = g.sky;
    const under = !!A && p.ug === A.site.id && (p.gy ?? 0) < A.plan.Y[0] - UG.viewBelow;
    const k = under ? this.levelOf(p.gy) : 0;
    if (k !== this.viewK || under !== this.wasUnder) {
      if (A) for (const [n, P] of A.levels) P.look.group.visible = under && n === k;
      if (A?.T) A.T.ent.group.visible = !under;
      g.renderer.shadowMap.autoUpdate = !under;
      // the effects' ground (blood, decals, flashes land on your floor; fx.js's own hook, chained to whatever had it)
      if (under && !this.groundHook) {
        const prev = this.prevGround = g.fx.ground;
        this.groundHook = (x, z) => (this.A && this.inBox(x, z) ? this.A.plan.Y[this.viewK] ?? 0 : prev ? prev(x, z) : 0);
        g.fx.ground = this.groundHook;
      } else if (!under && this.groundHook) { if (g.fx.ground === this.groundHook) g.fx.ground = this.prevGround ?? null; this.groundHook = null; }
      this.viewK = k; this.wasUnder = under;
    }
    if (under) {
      const P = A.levels.get(k);
      if (P && !P.look.group.visible) P.look.group.visible = true;
      const fy = A.plan.Y[k] ?? p.gy;
      this.clip.constant = Math.min((p.gy ?? 0) + UG.clipMin, A.plan.Y[0] - 0.05);
      // the occluder: under your floor, wide enough for the widest view
      this.occluder.visible = true;
      this.occluder.position.set(cam.position.x, fy - 0.16, cam.position.z);
      const s = Math.max(120, g.viewR * 3); this.occluder.scale.set(s, 1, s);
      if (A.platform) A.platform.visible = Math.abs(A.rec.lift.y - fy) < 4;
    } else {
      this.clip.constant = 1e6;
      this.occluder.visible = false;
      if (A?.platform) A.platform.visible = true;
    }
    // your lamp below: the flashlight's spill (a borrowed fire light, see LIGHT.lamp)
    const lamp = g.throwables?.fireLights?.[1];
    if (lamp) {
      const on = under && g.flashMat?.opacity > 0, Lm = LIGHT.lamp;
      if (on) {
        if (!this.lampWas) this.lampWas = { color: lamp.color.getHex(), distance: lamp.distance, decay: lamp.decay };
        lamp.color.set(Lm.color); lamp.distance = Lm.distance; lamp.decay = Lm.decay;
        lamp.position.set(p.x + Math.sin(p.face) * Lm.ahead, (p.gy ?? 0) + Lm.up, p.z + Math.cos(p.face) * Lm.ahead);
        lamp.intensity = Lm.intensity * (this.A?.rec.power ? 0.45 : 1); // under the strips your lamp matters less
      } else if (this.lampWas) { lamp.color.setHex(this.lampWas.color); lamp.distance = this.lampWas.distance; lamp.decay = this.lampWas.decay; lamp.intensity = 0; this.lampWas = null; }
    }
    // the light below (eased so the step from the street is not a jump cut)
    const target = under ? 1 : 0;
    this.below += (target - this.below) * Math.min(1, (1 / 60) * 10);
    if (Math.abs(target - this.below) < 0.01) this.below = target;
    S.below = this.below;
    S.belowFill = A?.rec.power ? LIGHT.powered : LIGHT.dark;
    S.belowSky = A?.rec.power ? LIGHT.poweredSky : LIGHT.sky;
    S.belowGround = A?.rec.power ? LIGHT.poweredGround : LIGHT.ground;
  }
  get coneOpacity() { return this.g.player.ug ? LIGHT.cone : 0.55; }

  drawEyes() {
    const g = this.g, p = g.player, A = this.A, M = this.eyes;
    let n = 0;
    const lit = g.flashMat?.opacity > 0;
    if (A && p.ug && lit) {
      for (const c of g.chars) {
        if (n >= 96 || !c.alive || c.faction !== 'zombie' || c.ug !== A.site.id || this.levelOf(c.gy) !== this.viewK) continue;
        const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
        if (d > LIGHT.eyeR || d < 1) continue;
        // your light reaches them (in front of you, or close enough for its spill) and they are looking back at you
        let da = Math.abs(Math.atan2(dx, dz) - p.face); if (da > Math.PI) da = Math.PI * 2 - da;
        if (da > (LIGHT.eyeCone * Math.PI) / 180 && d > 5) continue;
        const fx = Math.sin(c.face), fz = Math.cos(c.face);
        if ((-dx * fx - dz * fz) / d < 0.35) continue;
        if (!this.g.statics.lineOfSight(p.x, p.z, c.x, c.z, RAY_SIGHT, (p.gy ?? 0) + 1.5 - this.y0)) continue;
        const y = (c.gy ?? 0) + 1.55;
        for (const s of [-1, 1]) { _o.position.set(c.x + fx * 0.24 + fz * 0.08 * s, y, c.z + fz * 0.24 - fx * 0.08 * s); _o.rotation.set(0, c.face, 0); _o.scale.set(1, 1, 1); _o.updateMatrix(); M.setMatrixAt(n++, _o.matrix); }
      }
    }
    M.count = n; M.visible = n > 0;
    if (n) M.instanceMatrix.needsUpdate = true;
  }
  drawDrones(dt) {
    const g = this.g, A = this.A, B = this.drones.body, Bm = this.drones.beam;
    let n = 0, m = 0;
    if (A) for (const P of A.levels.values()) for (const c of P.occ) {
      if (c.ugRole !== 'drone' || !g.chars.includes(c)) continue;
      if (P.k !== this.viewK && g.player.ug) continue;
      if (n + 8 > B.instanceMatrix.count) break;
      const t = g.time * 9, alive = c.alive, y = (c.gy ?? 0) + (alive ? HOLDOUT.drone.alt + Math.sin(g.time * 2.1 + c.slot) * 0.08 : 0.15);
      const put = (x, yy, z, sx, sy, sz, ry = c.face) => { _o.position.set(x, yy, z); _o.rotation.set(alive ? 0 : 0.4, ry, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix(); B.setMatrixAt(n++, _o.matrix); };
      put(c.x, y, c.z, 0.62, 0.22, 0.8);                                                   // the body
      put(c.x, y + 0.04, c.z, 1.25, 0.05, 0.1, c.face + 0.785); put(c.x, y + 0.04, c.z, 1.25, 0.05, 0.1, c.face - 0.785); // the arms
      for (const [ox, oz] of [[0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]]) { const cs = Math.cos(c.face), sn = Math.sin(c.face); put(c.x + ox * cs + oz * sn, y + 0.1, c.z - ox * sn + oz * cs, 0.5, 0.02, 0.08, alive ? t + ox : 0); } // the rotors, a blur
      put(c.x + Math.sin(c.face) * 0.36, y - 0.06, c.z + Math.cos(c.face) * 0.36, 0.14, 0.12, 0.14); // the gun's eye
      if (alive) { const fx = Math.sin(c.face), fz = Math.cos(c.face); _o.position.set(c.x + fx * 3.6, (c.gy ?? 0) + 0.04, c.z + fz * 3.6); _o.rotation.set(0, c.face, 0); _o.scale.set(3.2, 1, 6); _o.updateMatrix(); Bm.setMatrixAt(m++, _o.matrix); }
    }
    B.count = n; Bm.count = m; B.visible = n > 0; Bm.visible = m > 0;
    if (n) B.instanceMatrix.needsUpdate = true;
    if (m) Bm.instanceMatrix.needsUpdate = true;
    void dt;
  }

  // ---- save / load -------------------------------------------------------------------------------------------------
  save() {
    if (this.A) for (const P of this.A.levels.values()) this.writeBack(P);
    const sites = {}, levels = {};
    for (const [id, r] of this.recs) if (r.touched || r.place) sites[id] = JSON.parse(JSON.stringify(r));
    for (const [key, r] of this.lvl) if (r.touched || r.occ) levels[key] = JSON.parse(JSON.stringify(r));
    return { v: 1, sites, levels };
  }
  // Everything goes (no write-back: the save is the truth), then the records come back; if the save has you below,
  // your site goes live and your level is promoted now, so the restore finds the floor under your feet.
  load(s, player = null) {
    this.reset();
    for (const [id, r] of Object.entries(s?.sites ?? {})) this.recs.set(id, r);
    for (const [key, r] of Object.entries(s?.levels ?? {})) this.lvl.set(key, r);
    if (player) {
      for (const site of this.sites) {
        const row = this.rowOf(site), P = planSite(row);
        if ((player.gy ?? 0) > P.Y[0] - UG.below) continue;
        if (player.x < P.ox - 2 || player.x > P.ox + P.W + 2 || player.z < P.oz - 2 || player.z > P.oz + P.H + 2) continue;
        this.activate(site);
        const k = this.levelOf(player.gy);
        if (k) this.promote(k);
        this.A.wantT.set(k, this.g.time);
        break;
      }
    }
  }
  reset() {
    const g = this.g;
    if (this.A) {
      // the people are already gone (restore removed everyone not in the save): only take down what is still standing
      for (const P of this.A.levels.values()) for (const c of P.occ) if (!g.chars.includes(c)) c.ugOcc = c.ugOcc ?? null;
      this.deactivate();
    }
    for (const id of [...this.attached.keys()]) this.detach(id);
    this.recs.clear(); this.lvl.clear(); this.charges.length = 0;
    this.viewK = 0; this.wasUnder = undefined;
  }

  // ---- for the agent -------------------------------------------------------------------------------------------------
  siteView(s, detail = false) {
    const p = this.g.player, r = this.recs.get(s.id), row = this.rowOf(s), T = this.attached.get(s.id);
    const out = { id: s.id, name: s.name, kind: s.kind, entrance: s.entrance, x: r1(row.x), z: r1(row.z), levels: s.levels, project: s.project ? PROJECTS[s.project].name : null, holdout: !!s.holdout,
      dist: r1(Math.hypot(row.x - p.x, row.z - p.z)), attached: !!T, live: this.A?.site === s, power: !!(r?.power ?? s.power), fuel: +(r?.fuel ?? s.fuel ?? 0).toFixed(2), placed: s.place ? !!r?.place : true };
    if (!detail) return out;
    const plan = planSite(row);
    out.frame = { ox: plan.ox, oz: plan.oz, size: plan.W, floors: plan.Y.map(r1) };
    out.flights = plan.flights.map((f) => ({ id: f.id, kind: f.kind, from: f.from, to: f.to, top: [r1(f.top.x), r1(f.top.z)], bottom: [r1(f.bottom.x), r1(f.bottom.z)], len: f.len, pitch: +f.pitch.toFixed(2), axis: f.axis, u: f.u }));
    out.lift = plan.lift ? { rect: plan.lift.rect, stop: r?.lift?.stop ?? null, y: r1(r?.lift?.y ?? 0), target: r?.lift?.target ?? null } : null;
    out.record = r ? { alert: r.alert, codes: r.codes, read: r.read, collapsed: r.collapsed, touched: r.touched } : null;
    out.levelsDetail = [];
    for (let k = 1; k <= s.levels; k++) {
      const L = genLevel(row, k), P = this.A?.site === s ? this.A.levels.get(k) : null;
      out.levelsDetail.push({ k, y: r1(L.y), hash: L.hash, proof: L.proof, rooms: L.rooms.map((q) => ({ id: q.id, type: q.type, label: q.label, x: r1((q.x0 + q.x1) / 2), z: r1((q.z0 + q.z1) / 2), sealed: q.sealed || undefined })), chambers: L.chambers?.length,
        doors: L.doors.map((d) => { const live = P?.doors.find((q) => q.id === d.id); return { id: d.id, x: d.x, z: d.z, material: d.material, blast: d.blast || undefined, keypad: d.keypad ?? undefined, locked: live ? live.locked : this.lvl.get(`${s.id}:${k}`)?.doors?.[d.id] ? !!this.lvl.get(`${s.id}:${k}`).doors[d.id].l : d.locked }; }),
        boxes: L.boxes.map((b) => ({ id: b.id, label: b.label, x: b.x, z: b.z, table: b.table })), logs: L.logs.map((l) => ({ id: l.id, x: l.x, z: l.z, title: LOGS[l.id].title, read: !!r?.read.includes(l.id) })),
        generator: L.generator, arrival: L.arrival, departure: L.departure, lobby: L.lobby, collapses: L.collapses, nest: L.nest ?? null,
        people: P ? P.occ.map((c) => ({ id: c.id, role: c.ugRole, kind: c.zkind ?? c.faction, alive: c.alive, hp: Math.round(c.hp), x: r1(c.x), z: r1(c.z) })) : (this.lvl.get(`${s.id}:${k}`)?.occ ?? L.spawns).map((o) => ({ kind: o.kind, alive: o.alive !== false, x: o.x, z: o.z })),
        promoted: !!P });
    }
    return out;
  }
  status() {
    const A = this.A, p = this.g.player;
    return { sites: this.sites.length, attached: [...this.attached.keys()], live: A ? { site: A.site.id, levels: [...A.levels.keys()], power: A.rec.power, fuel: +A.rec.fuel.toFixed(2), alert: A.rec.alert } : null,
      you: { ug: p.ug ?? null, level: this.levelOf(p.gy ?? 0), gy: r1(p.gy ?? 0), view: this.wasUnder ? this.viewK : 0, clip: this.clip.constant > 1e5 ? null : r1(this.clip.constant) }, counts: { ...this.counts, boxes: this.U.boxes.length } };
  }
}

const _o = new THREE.Object3D(), _c = new THREE.Color();
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
// A prop's collision tag: the name data/materials.js MATERIAL_RULES already knows it by.
const PROP_TAG = { locker: 'lockers', rack: 'racks', cot: 'bunk', labbench: 'desk', console: 'milbox', cabinet: 'lockers', maptable: 'table', sink: 'milbox', counter: 'table', pylon: 'milbox', bunk: 'bunk', crate: 'crate', drum: 'drum', desk: 'desk', table: 'table', bench: 'bench', shelf: 'shelf', pump: 'pump', generator: 'generator' };
function drop(arr, x) { const i = arr.indexOf(x); if (i >= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); } }
void _v; void KINDS; void ITEMS; void ROCK;
