import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MIL_RULES, MIL_LINES, MIL_FACTIONS, MIL_HOLDS } from '../data/milbases.js';
import { BASE_RULES } from '../data/bases.js';
import { radialGlow } from '../world/textures.js';
import { chunkKey, chunkOf } from '../world/geo.js';
import { makeRng, angleLerp } from '../engine/rng.js';
import { outfit } from './characters.js';
import { randomName } from '../data/npcs.js';

// The streamed military bases' life (docs/design/WEB_BASES.md; rows in data/milbases.js, the ground in world/milbase.js).
//
// PEOPLE are records: a garrison post (the gate, a door, a tower deck, the yard), a patrol, or one of the dead inside an
// overrun base. A record comes to life (a character) within promoteR of you once its chunk is laid out, and goes back
// onto its record past demoteR: alive or dead, its hp. The trespass rule is OUTPOST NINE's own (systems/bases.js watch,
// warn, alarm, think): each base registers a site there that its soldiers answer to, with its holder's lines.
// DRONES hover a loop over the core: by day they see you as far as a sentry, at night only by your light (a flashlight
// carries spotLight metres); one that holds you in sight for `call` seconds calls it in (a garrison: the alarm; nobody
// home: a siren the infected come to).
// LIGHTS: one pool of additive ground glows (floodlights, searchlights, drone lamps) and one of searchlight beams for the
// base you are at, hidden by day: the fixed light count holds (no light objects).
// LOGS: the project's logs are in the base's RECORDS (a container): each search of one turns up the next.

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const lerp = (a, b, t) => a + (b - a) * t;
const r1 = (v) => Math.round(v * 10) / 10;
const FAR = 1e9;

// A quadcopter from boxes (rotor discs as flat boxes), vertex-coloured: one draw for every one in the air.
function droneGeometry() {
  const parts = [];
  const B = (w, h, l, x, y, z, col, ry = 0) => { const g = new THREE.BoxGeometry(w, h, l).toNonIndexed(); g.rotateY(ry); g.translate(x, y, z); const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
  B(0.7, 0.26, 1.0, 0, 0, 0, '#4a4f3c');                  // the body
  B(0.5, 0.12, 0.5, 0, 0.18, -0.05, '#3a3d30');           // the battery hump
  B(0.22, 0.2, 0.22, 0, -0.2, 0.42, '#1e1e1c');           // the camera turret
  B(0.12, 0.08, 0.12, 0, -0.26, 0.5, '#f4ecd2');          // its lamp
  for (const [x, z] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) {
    B(0.1, 0.08, 1.15, x / 2, 0.02, z / 2, '#2e302a', Math.atan2(x, z)); // the arm
    B(0.18, 0.18, 0.18, x, 0.08, z, '#2a2a26');                         // the motor
    B(0.95, 0.02, 0.95, x, 0.2, z, '#5a5c54', 0.4);                     // the rotor's blur
  }
  B(0.08, 0.08, 0.08, -0.38, 0.0, -0.5, '#c43a2a'); B(0.08, 0.08, 0.08, 0.38, 0.0, -0.5, '#3ac46a'); // nav lights (red, green)
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
}

export class MilBases {
  constructor(game) {
    this.g = game;
    this.W = game.streamer.W;
    const F = game.society.factions;
    // The factions the built bases bring in (never purple: Factions.register refuses it).
    for (const [id, def] of Object.entries(MIL_FACTIONS)) if (F.index[id] === undefined) F.register(id, { stars: false, forgivesSelfDefense: true, cohesion: 0.8, memoryDays: 21, hub: null, leaders: [],
      values: { 'kill:self': -10, 'hurt:self': -3, 'steal:self': -4, 'destroy:self': -3, 'trespass:self': -6, 'kill:enemy': 1, 'defend:self': 4, 'trade:self': 0.5, 'pay:self': 2 }, ...def });
    this.sites = [];
    this.byId = {};
    for (const B of this.W.milbases.filter((b) => b.built)) { const s = this.makeSite(B); this.sites.push(s); this.byId[s.id] = s; game.bases.byId[s.id] = s; }
    game.bases.ext = this;
    this.t = 0; this.scanT = 0;
    this.stats = { promoted: 0, demoted: 0, droneCalls: 0, logs: 0 };
    // Drones: one instanced mesh.
    this.droneMesh = new THREE.InstancedMesh(droneGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35 }), 8);
    this.droneMesh.count = 0; this.droneMesh.visible = false; this.droneMesh.frustumCulled = false; this.droneMesh.castShadow = true; this.droneMesh.name = 'milbases:drones';
    game.scene.add(this.droneMesh);
    // Lights: ground pools (floodlights, searchlights, drone lamps) and searchlight beams.
    const R = MIL_RULES;
    this.poolMat = new THREE.MeshBasicMaterial({ map: radialGlow(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    this.poolMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.poolMat, R.pools);
    this.poolMesh.renderOrder = 2; this.poolMesh.frustumCulled = false; this.poolMesh.visible = false; this.poolMesh.count = 0;
    this.poolMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.poolMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(R.pools * 3).fill(1), 3);
    game.scene.add(this.poolMesh);
    const cone = new THREE.CylinderGeometry(0.06, 1, 1, 14, 1, true), pos = cone.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const k = 0.18 + 0.82 * (pos.getY(i) + 0.5); col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k; }
    cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.beamMat = new THREE.MeshBasicMaterial({ color: '#f3f1e6', vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    this.beamMesh = new THREE.InstancedMesh(cone, this.beamMat, R.beams);
    this.beamMesh.renderOrder = 3; this.beamMesh.frustumCulled = false; this.beamMesh.visible = false; this.beamMesh.count = 0;
    this.beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    game.scene.add(this.beamMesh);
    this.lightSite = null;
  }

  // ---- a site: the record systems/bases.js reads (fence, guards, alert, pools, row.spoken), and the base's own state ------
  makeSite(B) {
    const H = MIL_HOLDS[B.row.hold], fid = H.faction === 'ruler' ? `ruler_${B.row.state}` : H.faction;
    const s = {
      id: B.id, B, streamed: true, name: B.name, faction: fid, hold: B.row.hold,
      row: { spoken: B.row.real, gate: { side: B.gate, at: 0, width: MIL_RULES.gateWidth } },
      fence: { x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1 },
      lines: MIL_LINES[B.row.hold] ?? MIL_LINES.remnant,
      guards: [], recs: [], vehicles: [], spawnedVehicles: false, drones: [], pools: [], towerState: new Map(),
      alert: 'calm', why: null, warnT: 0, outT: 0, coolT: 0, warnedAt: -1e9, cleared: false, shotWarned: false,
      seenBy: null, checkT: 0, lastSeen: { x: 0, z: 0, t: -1e9 }, alarms: 0, warnings: 0,
      live: false, logsRead: 0, lastOpened: null, logIds: new Set(), dist: Infinity,
    };
    const rng = makeRng(B.seed % 2147483647 || 7);
    const guns = H.guns ?? { rifle: 1 };
    const gun = () => { let r = rng(); for (const [w, p] of Object.entries(guns)) if ((r -= p) <= 0) return w; return Object.keys(guns)[0]; };
    const flag = () => (B.row.hold === 'remnant' || B.row.hold === 'contested' ? (rng() < 0.62 ? 'US' : null) : rng() < 0.7 ? 'US' : rng() < 0.6 ? 'MX' : null);
    const rec = (o) => s.recs.push({ id: `${B.id}:${s.recs.length}`, alive: true, hp: o.zombie ? null : BASE_RULES.hp, c: null, weapon: o.zombie ? null : gun(), name: randomName(rng), flag: flag(), runner: rng() < 0.25, ...o });
    const n = H.garrison ?? 0;
    if (n > 0) {
      const g0 = B.gateIn, gx = B.gateAt.x, gz = B.gateAt.z, face = Math.atan2(B.nx, B.nz);
      rec({ kind: 'post', role: 'gate', x: g0.x + B.tx * 6, z: g0.z + B.tz * 6, face });
      rec({ kind: 'post', role: 'gate', x: gx + B.nx * 6 - B.tx * 8, z: gz + B.nz * 6 - B.tz * 8, face });
      for (const k of ['armory', 'hq']) { const L = B.lotOf(k); if (!L) continue; const d = B.geo(L).doors.find((q) => q.kind === 'front') ?? null; if (d) rec({ kind: 'post', role: 'door', x: d.x + d.nx * 2.2 + (d.nz ? 1.6 : 0), z: d.z + d.nz * 2.2 + (d.nx ? 1.6 : 0), face: Math.atan2(d.nx, d.nz) }); }
      // Towers, nearest the core first (the far ones down a 3 km wire are manned too, but only the ones near you live).
      const ccx = (B.cantonW.x0 + B.cantonW.x1) / 2, ccz = (B.cantonW.z0 + B.cantonW.z1) / 2;
      const towers = B.towers.slice().sort((a, b) => Math.hypot(a.x - ccx, a.z - ccz) - Math.hypot(b.x - ccx, b.z - ccz));
      for (const t of towers.slice(0, Math.max(4, n - 6))) rec({ kind: 'tower', role: 'tower', tower: t.id, x: t.x, z: t.z, face: t.face });
      // Patrols: two walking the core's edge, one the yard (or the apron).
      const cw = B.cantonW, route = [[cw.x0 + 4, cw.z0 + 4], [cw.x1 - 4, cw.z0 + 4], [cw.x1 - 4, cw.z1 - 4], [cw.x0 + 4, cw.z1 - 4]].map(([x, z]) => ({ x, z }));
      for (let k = 0; k < 2; k++) rec({ kind: 'patrol', role: 'patrol', route, ri: k * 2, x: route[k * 2].x, z: route[k * 2].z, pace: 1.35 });
      if (B.yard) { const y = B.yard, yr = [[y.x1 + 6, y.z0 + 10], [y.x1 + 6, y.z1 - 10]].map(([x, z]) => ({ x, z })); rec({ kind: 'patrol', role: 'patrol', route: yr, ri: 0, x: yr[0].x, z: yr[0].z, pace: 1.2 }); }
    }
    if (H.infected) {
      const cw = B.cantonW;
      for (let k = 0; k < H.infected; k++) rec({ kind: 'infected', zombie: true, x: lerp(cw.x0 + 8, cw.x1 - 8, rng()), z: lerp(cw.z0 + 8, cw.z1 - 8, rng()) });
    }
    // Drones: a loop over the core (inset), each its own phase.
    const nd = B.B.drones ?? 0, cw = B.cantonW;
    const loop = [[cw.x0 + 10, cw.z0 + 10], [cw.x1 - 10, cw.z0 + 10], [cw.x1 - 10, cw.z1 - 10], [cw.x0 + 10, cw.z1 - 10]].map(([x, z]) => ({ x, z }));
    if (B.yard) loop.splice(3, 0, { x: (B.yard.x0 + B.yard.x1) / 2, z: (B.yard.z0 + B.yard.z1) / 2 });
    for (let k = 0; k < nd; k++) s.drones.push({ id: `${B.id}:drone${k}`, loop, seg: (k * 2) % loop.length, x: loop[(k * 2) % loop.length].x, z: loop[(k * 2) % loop.length].z, y: MIL_RULES.drone.alt, h: 0, alive: true, hp: MIL_RULES.drone.hp, seenT: 0, tracking: false, calls: 0, pool: null });
    // The records holding the project's logs.
    for (const L of B.lots) { if (L.yard) continue; for (const q of B.geo(L).boxesIn) if (q.log) s.logIds.add(q.id); }
    return s;
  }

  // ---- run ------------------------------------------------------------------------------------------------------------
  liveSites() { return this.sites.filter((s) => s.live && s.guards.length); }

  update(dt) {
    const g = this.g, P = g.player, px = P.inVehicle ? P.inVehicle.x : P.x, pz = P.inVehicle ? P.inVehicle.z : P.z;
    this.t += dt;
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 0.5;
      for (const s of this.sites) {
        const f = s.fence, d = Math.hypot(Math.max(f.x0 - px, 0, px - f.x1), Math.max(f.z0 - pz, 0, pz - f.z1));
        s.dist = d;
        if (d < MIL_RULES.demoteR + 200 || s.live) this.people(s, px, pz);
      }
    }
    let nearest = null;
    for (const s of this.sites) {
      if (!s.live) continue;
      for (let i = s.guards.length - 1; i >= 0; i--) { const c = s.guards[i]; if (!c.alive && c.rec) c.rec.alive = false; }
      if (s.guards.some((c) => c.alive)) g.bases.watch(s, dt);
      this.drones(s, dt, px, pz);
      this.logs(s);
      if (!nearest || s.dist < nearest.dist) nearest = s;
    }
    this.lights(nearest && nearest.dist < 500 ? nearest : null, dt, px, pz);
    this.drawDrones();
  }

  // Records <-> characters, near you.
  people(s, px, pz) {
    const g = this.g, R = MIL_RULES, S = g.streamer;
    let live = 0;
    for (const r of s.recs) if (r.c) live++;
    for (const r of s.recs) {
      const d = Math.hypot(r.x - px, r.z - pz);
      if (r.c) {
        if (!r.c.alive) r.alive = false;
        if (d > R.demoteR) this.demote(s, r);
        continue;
      }
      if (!r.alive || d > R.promoteR || live >= R.maxLive) continue;
      if (!S.layouts.get(chunkKey(chunkOf(r.x), chunkOf(r.z)))) continue; // its ground first
      if (this.promote(s, r)) live++;
    }
    s.guards = s.recs.filter((r) => r.c && !r.zombie).map((r) => r.c);
    s.live = s.recs.some((r) => r.c) || s.dist < R.promoteR || s.drones.length > 0 && s.dist < R.demoteR;
    if (s.live && !s.spawnedVehicles && s.dist < R.promoteR) this.vehiclesOf(s);
  }
  promote(s, r) {
    const g = this.g, H = MIL_HOLDS[s.hold];
    let c;
    if (r.zombie) {
      c = g.zombies.spawn(r.x, r.z, r.runner);
      if (!c) return false;
    } else {
      const rng = makeRng((r.id.length * 7919 + s.recs.indexOf(r) * 104729) % 2147483647 || 3);
      c = g.addChar({ x: r.x, z: r.z, faction: 'soldier', weapon: r.weapon, hp: r.hp ?? BASE_RULES.hp, colors: outfit(H.look ?? 'soldier', rng), name: r.name, flag: r.flag ?? g.randomFlag(rng) });
      if (!c) return false;
      c.fid = s.faction; g.society.factions.assign(c);
      c.grenades = rng() < 0.25 ? 1 : 0;
      c.baseId = s.id; c.face = r.face ?? 0;
      if (r.kind === 'tower') { c.post = { id: r.id, role: 'tower', x: r.x, z: r.z, face: r.face }; c.perch = true; c.perchY = MIL_RULES.tower.deck; }
      else if (r.kind === 'post') c.post = { id: r.id, role: r.role, x: r.x, z: r.z, face: r.face };
      else { c.route = r.route; c.ri = r.ri ?? 0; c.pace = r.pace; c.patrol = r.id; }
      // A trespasser the post is already after is theirs too.
      if (s.alert === 'hostile') { c.grudge = g.player; c.leash = BASE_RULES.leash; }
    }
    c.milRec = r.id;
    r.c = c;
    this.stats.promoted++;
    return true;
  }
  demote(s, r) {
    const g = this.g, c = r.c;
    if (!c) return;
    r.alive = c.alive || (c.downedT > 0);
    if (c.alive && c.hp !== undefined) r.hp = Math.max(1, c.hp);
    if (!c.perch && c.route) r.ri = c.ri;
    if (g.chars.includes(c)) g.removeChar(c);
    r.c = null;
    this.stats.demoted++;
  }
  vehiclesOf(s) {
    const g = this.g, B = s.B, list = B.B.vehicles ?? [];
    s.spawnedVehicles = true;
    let spots = B.parking.slice();
    const mp = B.lotOf('motorpool');
    if (!spots.length && mp) { const d = B.geo(mp).doors.find((q) => q.kind === 'bay') ?? B.geo(mp).doors[0]; if (d) for (let k = 0; k < 3; k++) spots.push({ x: d.x + d.nx * (8 + k * 0) + (d.nz ? (k - 1) * 6 : 0), z: d.z + d.nz * 8 + (d.nx ? (k - 1) * 6 : 0), h: Math.atan2(d.nx, d.nz) }); }
    list.forEach(([type, paint], k) => {
      const p = spots[k]; if (!p) return;
      const v = g.vehiclesSys.spawn(type, p.x, p.z, p.h ?? 0, paint);
      if (!v) return;
      v.owner = s.faction; v.baseId = s.id;
      s.vehicles.push(v);
    });
  }

  // ---- drones ---------------------------------------------------------------------------------------------------------
  drones(s, dt, px, pz) {
    const g = this.g, P = g.player, D = MIL_RULES.drone, night = g.sky.night;
    for (const d of s.drones) {
      if (!d.alive) continue;
      // Fly: the loop, or (tracking) over you.
      let tx, tz;
      if (d.tracking && P.alive && Math.hypot(px - d.x, pz - d.z) < 140) { tx = px; tz = pz; }
      else { const w = d.loop[d.seg]; tx = w.x; tz = w.z; if (Math.hypot(tx - d.x, tz - d.z) < 3) { d.seg = (d.seg + 1) % d.loop.length; } }
      const dx = tx - d.x, dz = tz - d.z, l = Math.hypot(dx, dz), sp = (d.tracking ? D.speed * 1.6 : D.speed) * dt;
      if (l > 0.5) { d.x += (dx / l) * Math.min(l, sp); d.z += (dz / l) * Math.min(l, sp); d.h = angleLerp(d.h, Math.atan2(dx, dz), Math.min(1, dt * 2)); }
      d.y = D.alt + Math.sin(this.t * 1.3 + d.seg) * 0.4;
      // Spot: by day as a sentry would; at night only by your light (or right under it).
      const flash = !P.inVehicle && P.alive && (g.flashOverride ?? night > 0.55);
      let range = lerp(D.spotDay, D.spotNight, night);
      if (flash && night > 0.3) range = Math.max(range, D.spotLight);
      if (P.inVehicle) range *= 1.4; else if (P.crouch) range *= 0.7;
      const dist = Math.hypot(px - d.x, pz - d.z);
      const inReach = this.insideFence(s, px, pz, 50);
      const seen = P.alive && !P.hidden && !P.underwater && !g.insideBuilding && dist < range && inReach;
      d.seenT = seen ? d.seenT + dt : Math.max(0, d.seenT - dt * 0.5);
      d.seenNow = seen; d.by = seen ? (flash && night > 0.3 && dist > lerp(D.spotDay, D.spotNight, night) ? 'flashlight' : 'sight') : d.by;
      if (seen && d.seenT >= D.call && !d.tracking) this.call(s, d, px, pz);
      if (d.tracking && (!P.alive || (!seen && d.seenT <= 0 && s.alert !== 'hostile'))) d.tracking = false;
    }
  }
  call(s, d, px, pz) {
    const g = this.g;
    d.tracking = true; d.calls++; this.stats.droneCalls++;
    g.emit('droneSpotted', { base: s.id, drone: d.id, x: r1(px), z: r1(pz), by: d.by });
    g.hud.subtitle(MIL_LINES.drone, 3);
    g.audio.siren?.(Math.hypot(px - d.x, pz - d.z));
    if (s.guards.some((c) => c.alive)) { if (s.alert !== 'hostile') g.bases.alarm(s, 'drone', null); }
    else { g.zombies?.onNoise(px, pz, 160); g.emit('baseSiren', { base: s.id, x: r1(px), z: r1(pz) }); } // nobody home: the siren calls the dead
  }
  insideFence(s, x, z, m = 0) { const f = s.fence; return x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m; }

  drawDrones() {
    const M = this.droneMesh, P = this.g.player;
    let n = 0;
    for (const s of this.sites) {
      if (!s.live) continue;
      for (const d of s.drones) {
        if (!d.alive || n >= M.instanceMatrix.count) continue;
        if (Math.abs(d.x - P.x) > 400 || Math.abs(d.z - P.z) > 400) continue;
        _e.set(Math.sin(this.t * 2 + d.seg) * 0.06, d.h, Math.cos(this.t * 1.7) * 0.06); _q.setFromEuler(_e);
        M.setMatrixAt(n++, _m.compose(_p.set(d.x, d.y, d.z), _q, _s.set(1.4, 1.4, 1.4)));
      }
    }
    M.count = n; M.visible = n > 0;
    if (n) M.instanceMatrix.needsUpdate = true;
  }

  // ---- lights for the base you are at ----------------------------------------------------------------------------------
  lights(s, dt, px, pz) {
    const g = this.g, night = g.sky.night, R = MIL_RULES, BR = BASE_RULES, on = !!s && night > 0.04;
    if (this.lightSite && this.lightSite !== s) for (const p of this.lightSite.pools) p.x = FAR;
    this.lightSite = s;
    this.poolMesh.visible = on; this.beamMesh.visible = on;
    if (!on) return;
    this.poolMat.opacity = Math.min(1, night * 0.95); this.beamMat.opacity = night * 0.2;
    const B = s.B, pools = s.pools;
    let np = 0, nb = 0;
    const pool = (kind, x, z, r, color, tower = null) => {
      if (np >= R.pools) return null;
      let p = pools[np];
      if (!p) pools[np] = p = { kind, x, z, r, color, tower };
      p.kind = kind; p.x = x; p.z = z; p.r = r; p.tower = tower;
      _e.set(0, 0, 0); _q.setFromEuler(_e);
      this.poolMesh.setMatrixAt(np, _m.compose(_p.set(x, 0.13, z), _q, _s.set(r * 2, 1, r * 2)));
      this.poolMesh.setColorAt(np, _c.set(color));
      np++;
      return p;
    };
    for (const f of B.floods) if (Math.abs(f.x - px) < R.lightsR && Math.abs(f.z - pz) < R.lightsR) pool('flood', f.x, f.z, f.r, '#ffe3b0');
    // Searchlights on the towers near you: a slow sweep across their arc; on the alarm, the beam finds you.
    const t = g.time;
    const near = B.towers.filter((q) => Math.abs(q.x - px) < R.lightsR && Math.abs(q.z - pz) < R.lightsR);
    for (const tw of near) {
      if (nb >= R.beams) break;
      let st = s.towerState.get(tw.id);
      if (!st) s.towerState.set(tw.id, (st = { x: tw.x + Math.sin(tw.face) * 14, z: tw.z + Math.cos(tw.face) * 14, phase: s.towerState.size * 1.9 }));
      const u = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / BR.sweepPeriod + st.phase);
      const h = lerp(tw.sweep[0], tw.sweep[1], u), reach = lerp(BR.beamReach[0], BR.beamReach[1], 0.5 + 0.5 * Math.sin(t * 0.37 + st.phase));
      let tx = tw.x + Math.sin(h) * reach, tz = tw.z + Math.cos(h) * reach;
      if (s.alert === 'hostile' && g.player.alive && Math.hypot(px - tw.x, pz - tw.z) < BR.beamReach[1] + 14) { tx = px; tz = pz; }
      const dx = tx - st.x, dz = tz - st.z, d = Math.hypot(dx, dz), step = Math.min(d, (s.alert === 'hostile' ? 16 : 7) * dt);
      if (d > 1e-4) { st.x += (dx / d) * step; st.z += (dz / d) * step; }
      if (!pool('search', st.x, st.z, BR.beamRadius, '#eef2ff', tw)) break;
      _dir.set(tw.lampX - st.x, R.tower.lamp, tw.lampZ - st.z);
      const len = _dir.length();
      _q.setFromUnitVectors(_up, _dir.multiplyScalar(1 / len));
      this.beamMesh.setMatrixAt(nb++, _m.compose(_p.set((tw.lampX + st.x) / 2, R.tower.lamp / 2, (tw.lampZ + st.z) / 2), _q, _s.set(BR.beamRadius * 0.9, len, BR.beamRadius * 0.9)));
    }
    // The drones' lamps on the ground below them.
    for (const d of s.drones) if (d.alive) d.pool = pool('search', d.x, d.z, MIL_RULES.drone.lightR, '#f4f0dc');
    for (let i = np; i < pools.length; i++) pools[i].x = FAR;
    this.poolMesh.count = np; this.beamMesh.count = nb;
    this.poolMesh.instanceMatrix.needsUpdate = true; if (this.poolMesh.instanceColor) this.poolMesh.instanceColor.needsUpdate = true;
    this.beamMesh.instanceMatrix.needsUpdate = true;
  }

  // ---- the project's logs, in its records -----------------------------------------------------------------------------
  logs(s) {
    const g = this.g, ob = g.inventory?.opened;
    if (!ob || ob === s.lastOpened) return;
    s.lastOpened = ob;
    const P = s.B.B.project;
    if (!P || !s.logIds.has(ob.id) || s.logsRead >= P.logs.length) return;
    const text = P.logs[s.logsRead++];
    this.stats.logs++;
    g.hud.subtitle(`${P.name}: ${text}`, 8);
    g.hud.toast(`${P.name} · LOG ${s.logsRead}/${P.logs.length}`, 'job');
    g.emit('baseLog', { base: s.id, project: P.name, n: s.logsRead, of: P.logs.length, text });
  }

  // ---- agent view, the underground hooks, save ------------------------------------------------------------------------
  hooks() { return this.W.milbases.filter((b) => b.built && b.hook).map((b) => ({ ...b.hook })); }
  view(s) {
    const g = this.g, P = g.player, F = g.society.factions, fi = F.index[s.faction], I = g.interiors, inv = g.inventory;
    const px = P.inVehicle ? P.inVehicle.x : P.x, pz = P.inVehicle ? P.inVehicle.z : P.z;
    const yardDoor = s.B.yard ? I?.byId.get(`mb:${s.id}.yard:d0`) : null;
    return {
      ...s.B.view(), faction: s.faction, live: s.live, alert: s.alert, why: s.why, warnings: s.warnings, alarms: s.alarms,
      graceLeft: s.alert === 'warned' ? r1(Math.max(0, BASE_RULES.grace - s.warnT)) : null,
      player: { inside: this.insideFence(s, px, pz), dist: r1(s.dist), seenBy: s.seenBy?.id ?? null, lit: g.bases.lit(s, px, pz), standing: fi === undefined ? null : r1(F.standing[fi]), tier: g.bases.tier(s) },
      garrison: s.recs.map((r) => ({ id: r.id, kind: r.kind, role: r.role ?? null, x: r1(r.x), z: r1(r.z), alive: r.alive, live: r.c ? r.c.id : null, weapon: r.weapon, hostileToPlayer: !!r.c && r.c.alive && g.ai.hostile(r.c, P) })),
      drones: s.drones.map((d) => ({ id: d.id, x: r1(d.x), z: r1(d.z), y: r1(d.y), alive: d.alive, tracking: d.tracking, seenT: r1(d.seenT), calls: d.calls })),
      vehicles: s.vehicles.map((v) => ({ id: v.id, type: v.type, x: r1(v.x), z: r1(v.z), dead: v.dead })),
      lights: { on: this.lightSite === s && this.poolMesh.visible, pools: this.lightSite === s ? this.poolMesh.count : 0, beams: this.lightSite === s ? this.beamMesh.count : 0 },
      project: s.B.B.project ? { name: s.B.B.project.name, line: s.B.B.project.line, logs: s.B.B.project.logs.length, read: s.logsRead, records: [...s.logIds] } : null,
      yardGate: s.B.yard ? { id: `mb:${s.id}.yard:d0`, attached: !!yardDoor, locked: yardDoor ? yardDoor.locked : !(I?.ringState.get(`mb:${s.id}.yard:d0`)?.u), x: r1(s.B.yard.gate.x), z: r1(s.B.yard.gate.z), kicksLeft: yardDoor?.locked ? yardDoor.kicks : null } : null,
      containers: inv ? [...inv.boxes.values()].filter((b) => b.ring && this.insideFence(s, b.x, b.z)).map((b) => ({ id: b.id, label: b.label, table: b.kind, x: r1(b.x), z: r1(b.z), searched: !!b.rolled })) : [],
    };
  }
  save() {
    const out = {};
    for (const s of this.sites) {
      out[s.id] = { alert: s.alert, why: s.why, warnedAgo: s.warnedAt > -1e8 ? this.g.time - s.warnedAt : null, warnings: s.warnings, alarms: s.alarms, logsRead: s.logsRead, veh: s.spawnedVehicles,
        recs: s.recs.map((r) => [r.alive ? 1 : 0, Math.round(r.c ? r.c.hp ?? 0 : r.hp ?? 0), r.c?.id ?? null]), drones: s.drones.map((d) => (d.alive ? 1 : 0)) };
    }
    return out;
  }
  // Restore: the characters came back with the save (by id); re-attach each to its record, the rest promote again near you.
  load(data) {
    const g = this.g;
    for (const s of this.sites) {
      const d = data?.[s.id];
      for (const r of s.recs) r.c = null;
      s.guards = []; s.live = false;
      if (!d) { s.alert = 'calm'; continue; }
      d.recs?.forEach(([alive, hp, cid], i) => {
        const r = s.recs[i]; if (!r) return;
        r.alive = !!alive; if (hp > 0 && !r.zombie) r.hp = hp;
        const c = cid ? g.chars.find((x) => x.id === cid) : null;
        if (c && c.alive && r.alive) {
          r.c = c; c.milRec = r.id;
          if (!r.zombie) {
            c.baseId = s.id; c.fid = s.faction; g.society.factions.assign(c); c._bp = null;
            if (r.kind === 'tower') { c.post = { id: r.id, role: 'tower', x: r.x, z: r.z, face: r.face }; c.perch = true; c.perchY = MIL_RULES.tower.deck; }
            else if (r.kind === 'post') c.post = { id: r.id, role: r.role, x: r.x, z: r.z, face: r.face };
            else { c.route = r.route; c.ri = r.ri ?? 0; c.pace = r.pace; c.patrol = r.id; }
          }
        } else if (c) g.removeChar(c);
      });
      d.drones?.forEach((a, i) => { if (s.drones[i]) s.drones[i].alive = !!a; });
      s.guards = s.recs.filter((r) => r.c && !r.zombie).map((r) => r.c);
      s.live = s.recs.some((r) => r.c);
      s.logsRead = d.logsRead ?? 0; s.spawnedVehicles = !!d.veh || s.spawnedVehicles;
      s.warnings = d.warnings ?? 0; s.alarms = d.alarms ?? 0;
      s.warnedAt = d.warnedAgo == null ? -1e9 : g.time - d.warnedAgo;
      s.alert = 'calm';
      if (d.alert === 'hostile' && s.guards.length) g.bases.alarm(s, d.why ?? 'loaded', null, true);
      else if (d.alert === 'warned') { s.alert = 'warned'; s.warnT = 0; }
    }
  }
}
