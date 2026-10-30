import * as THREE from 'three';
import { makeRng } from '../engine/rng.js';
import { STEP } from '../engine/depthlayers.js';
import { MATERIALS, PUNCH, PEN, BLAST, RAM, FIRE, MATERIAL_RULES as R, PIECES } from '../data/materials.js';
import { roundRow } from '../data/ballistics.js';
import { DOOR } from '../data/interiors.js';
import { wallFinish } from '../world/surfaces.js';
import { Blood, DECAL_TILE as TILE } from './blood.js';

// What everything is made of, and what that means when it is shot, blown up, set on fire or driven into
// (docs/design/WEB_MATERIALS.md; rows in data/materials.js).
//
//   classify(box)  every collision box has a material by rule: its tag, and for a building's wall the building (Rust
//                  Haven or not, the island or the ring), outer wall or partition, and the finish the wall shader paints
//                  on that piece of it (world/surfaces.js wallFinish). Door leaves by their row, boarded windows, cars.
//   rounds         combat.hitscan hands every wall a round meets to bullet()/throughLeaf(): it glances off (steel at a
//                  shallow angle), stops, or goes on through with what energy is left (thin wood, drywall, sheet metal),
//                  and the hit sprays and marks the face by material. The one damage law stays in combat.js.
//   breaking       things that break (data/materials.js MATERIAL_RULES.breakable: the island's partitions, crates,
//                  shelves, furniture, stalls, tents; every door leaf; placed pieces) carry hp. A wall's hp is kept in
//                  1 m strips: a strip that goes opens a breach (MATERIALS.breach m wide, wider for a car) you see, walk
//                  and shoot through, the nav grid told. Blasts break by material in their radius; cars break what they
//                  ram; fire burns wood and cloth through and spreads along what burns. What is broken is in the save.
//   pieces         walls and shacks of any material stood on the island (`build`): for tests, and for holdouts later.
// Rendering: one InstancedMesh for every piece (placed walls, what is left of a breached partition, charred stubs; a
// pattern per material in its shader), one for debris on the floor, and the decal ring in systems/blood.js. Each is
// hidden while empty, so a world with nothing broken draws exactly what it drew before.

const ISL = 460;          // a box this far inside is the island's (statics.add); past it, the streamed ring's
const LOOK = { plaster: 0, planks: 1, sheet: 2, block: 3, brick: 4, sandbag: 5, plate: 6, mesh: 7, concrete: 8, cloth: 9, rubber: 10 };
const FIN_LOOK = [0, 0, 0, 0, 0, 0, 3, 3, 3, 4];
const FIN_NAME = ['stucco', 'stucco', 'stucco', 'stucco', 'stucco', 'stucco', 'concrete block', 'concrete block', 'concrete block', 'brick'];
const PIECE_MAX = 512, DEBRIS_MAX = 768;
const _o = new THREE.Object3D(), _c = new THREE.Color(), _c2 = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const CHAR = new THREE.Color('#14100d');
const _ctr = { x: 0, z: 0, half: 0 };
let scorches = 0;
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const BREAK_WALL = new Set(R.breakable.walls), BREAK_PROP = new Set(R.breakable.props);

// The piece shader: a pattern by material on the faces of a box, soot as it chars. Same idea as world/surfaces.js.
const P_VERT_HEAD = `attribute float aLook;\nattribute float aChar;\nvarying vec3 vPW;\nvarying vec3 vPN;\nvarying vec3 vPC;\nvarying vec3 vPS;\nvarying float vLook;\nvarying float vChar;`;
const P_VERT_BODY = `
  {
    vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
    vPW = wp.xyz;
    vPN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
    vPC = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vPS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vLook = aLook; vChar = aChar;
  }`;
const P_FRAG_HEAD = `varying vec3 vPW;\nvarying vec3 vPN;\nvarying vec3 vPC;\nvarying vec3 vPS;\nvarying float vLook;\nvarying float vChar;
float ph1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float pn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ph1(i), ph1(i + vec2(1.0, 0.0)), f.x), mix(ph1(i + vec2(0.0, 1.0)), ph1(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 pieceLook(vec3 c) {
  bool top = vPN.y > 0.5;
  float s = top ? (vPS.x >= vPS.z ? vPW.x : vPW.z) : (abs(vPN.x) > abs(vPN.z) ? vPW.z : vPW.x);
  float y = top ? (vPS.x >= vPS.z ? vPW.z : vPW.x) * 3.0 : vPW.y - (vPC.y - vPS.y * 0.5);
  float L = vLook, k = 1.0;
  if (L < 0.5) { k = 0.93 + 0.1 * pn(vec2(s, y) * 2.2) + 0.05 * pn(vec2(s, y) * 9.0); }
  else if (L < 1.5) { // planks, standing up, nailed edge to edge
    float b = floor(s / 0.17), f = fract(s / 0.17);
    k = (0.78 + 0.3 * ph1(vec2(b, 3.1))) * (0.9 + 0.12 * pn(vec2(b * 7.0, y * 6.0)));
    k *= 1.0 - 0.45 * smoothstep(0.07, 0.0, min(f, 1.0 - f));
  } else if (L < 2.5) { // corrugated sheet, a rusted sheet here and there
    k = 0.78 + 0.24 * (0.5 + 0.5 * sin(s * 6.2832 / 0.11));
    float rust = smoothstep(0.62, 0.8, pn(vec2(s * 0.8, y * 0.8) + 4.0));
    c = mix(c, vec3(0.42, 0.22, 0.12), rust * 0.7);
  } else if (L < 3.5 || (L > 3.5 && L < 4.5)) { // block or brick coursing
    float ch = L < 3.5 ? 0.2 : 0.075, cw = L < 3.5 ? 0.4 : 0.22;
    float course = fract(y / ch), row = floor(y / ch), jt = fract(s / cw + mod(row, 2.0) * 0.5);
    float mortar = max(smoothstep(0.08, 0.0, course), smoothstep(0.04, 0.0, min(jt, 1.0 - jt)));
    k = (0.9 + 0.14 * ph1(vec2(floor(s / cw + mod(row, 2.0) * 0.5), row))) * (1.0 - 0.25 * mortar);
  } else if (L < 5.5) { // sandbags: fat bags laid in courses, dark creases between them, a weave on the cloth
    float row = floor(y / 0.17), u = fract(s / 0.55 + mod(row, 2.0) * 0.5 + 0.13 * ph1(vec2(row, 1.7))), v = fract(y / 0.17);
    float bulge = sqrt(max(0.0, sin(u * 3.1416) * sin(v * 3.1416)));
    k = 0.42 + 0.68 * bulge + 0.07 * pn(vec2(s, y) * 14.0) + 0.04 * sin(s * 140.0) * sin(y * 140.0);
  } else if (L < 6.5) { // steel plate: rivets round the edge, streaks
    vec2 e = vec2(min(fract(s / 1.2), 1.0 - fract(s / 1.2)), min(fract(y / 1.0), 1.0 - fract(y / 1.0)));
    float rivet = step(min(e.x, e.y), 0.05) * step(0.6, fract(s * 6.0 + y * 6.0));
    k = 0.85 + 0.1 * pn(vec2(s * 0.5, y * 9.0)) + rivet * 0.25;
  } else if (L < 7.5) { // chain-link: diamonds of wire, the rest is air
    if (!top) { float u = s / 0.07, v = y / 0.07, w = min(abs(fract((u + v) * 0.5) - 0.5), abs(fract((u - v) * 0.5) - 0.5));
      if (w > 0.09 && fract(s / 3.0) > 0.02) discard; }
    k = 0.95;
  } else if (L < 8.5) { k = (0.9 + 0.08 * pn(vec2(s, y) * 3.0)) * (1.0 - 0.12 * smoothstep(0.03, 0.0, abs(fract(y / 0.6) - 0.5) - 0.47)); }
  else if (L < 9.5) { k = 0.82 + 0.18 * (0.5 + 0.5 * sin(s * 9.0 + y * 1.5)); }
  else { k = 0.9 + 0.1 * pn(vec2(s, y) * 8.0); }
  // The tops of plaster, block, brick and concrete stay plain, as the world's walls' do (world/surfaces.js).
  if (top && (L < 0.5 || (L > 2.5 && L < 4.5) || (L > 7.5 && L < 8.5))) k = 1.0;
  c *= k;
  // Soot: a burning piece blackens from the top down, unevenly (linear colour: charcoal is very dark).
  float soot = clamp(vChar * (1.25 - 0.35 * (top ? 0.0 : y / max(0.4, vPS.y))) * (0.75 + 0.5 * pn(vec2(s, y) * 3.0)), 0.0, 1.0);
  c = mix(c, vec3(0.007, 0.0058, 0.005), soot);
  return c;
}`;

export class Materials {
  constructor(game) {
    const g = (this.g = game);
    this.blood = g.blood = new Blood(g);
    this.cache = new WeakMap();     // box -> { key, why } (boxes without window holes; a holed wall is answered per piece)
    this.explicit = new WeakMap();  // box -> material key (pieces this system stood)
    this.boxRec = new WeakMap();    // box -> its breakable record
    this.mine = new WeakSet();      // boxes this system added to the island grid
    this.recs = new Map();          // key -> record (only things that took damage, are pieces, or burn)
    this.brokenDoors = new Set();   // door ids off their hinges (interiors.makeDoor reads it: the ring's attach again broken)
    this.burning = new Set();
    this.placed = new Map();        // piece id -> its row (what `build` made: in the save)
    this.nextId = 1;
    this.fireT = 0; this.ramT = 0;
    this.stats = { hits: 0, penetrated: 0, ricochets: 0, stopped: 0, broken: 0, breaches: 0, burnt: 0, ignited: 0, rams: 0 };
    this.last = null;               // the last round's story: what it met, what that was made of, and what happened
    this.pstats = { penetrated: 0, ricochets: 0, stopped: 0 }; this.plast = null; // the same, the player's rounds only
    this.log = [];                  // the last 40 things broken, breached or burnt: what, how, where, when (material view)
    this.out = { x: 0, z: 0, dx: 0, dz: 0, dmg: 0, energy: 0 };
    this.bIdx = null;               // island building index (built on first use)
    this._pc = { x: 0, z: 0 };
    this.debrisNext = 0;
    this.buildMeshes(g.scene);
  }

  // ---- what a thing is made of ---------------------------------------------------------------------------------------
  inIsland(b) { return b.minX > -ISL && b.maxX < ISL && b.minZ > -ISL && b.maxZ < ISL; }

  // The island building whose footprint holds (x, z), or the ring building there (streamer.ringBuildingAt).
  buildingAt(x, z, island) {
    if (!island) return this.g.streamer?.ringBuildingAt?.(x, z) ?? null;
    if (!this.bIdx) {
      this.bIdx = new Map();
      for (const b of this.g.world.buildings) for (let i = Math.floor(b.minX / 32); i <= Math.floor(b.maxX / 32); i++) for (let j = Math.floor(b.minZ / 32); j <= Math.floor(b.maxZ / 32); j++) {
        const k = i * 4096 + j; if (!this.bIdx.has(k)) this.bIdx.set(k, []); this.bIdx.get(k).push(b);
      }
    }
    const list = this.bIdx.get(Math.floor(x / 32) * 4096 + Math.floor(z / 32));
    if (list) for (const b of list) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return b;
    return null;
  }

  // The centre of the visible piece of a wall a point is on: a wall with windows is drawn as pieces between them, and
  // the shader paints each piece its own finish.
  pieceCentre(b, horiz, hx, hz) {
    let lo = horiz ? b.minX : b.minZ, hi = horiz ? b.maxX : b.maxZ;
    if (b.holes && hx !== null) {
      const a = horiz ? hx : hz, h = b.holes;
      for (let i = 0; i < h.length; i += 2) { if (h[i + 1] <= a) lo = Math.max(lo, h[i + 1]); else if (h[i] >= a) hi = Math.min(hi, h[i]); }
    }
    const m = (lo + hi) / 2, f = horiz ? (b.minZ + b.maxZ) / 2 : (b.minX + b.maxX) / 2;
    this._pc.x = horiz ? m : f; this._pc.z = horiz ? f : m;
    return this._pc;
  }

  classify(b, hx = null, hz = null) {
    const ex = this.explicit.get(b);
    if (ex) return { key: ex, why: 'a piece stood with build' };
    if (b.holes === null || hx === null) { const c = this.cache.get(b); if (c) return c; }
    const res = this.rule(b, hx, hz);
    if (b.holes === null) this.cache.set(b, res);
    return res;
  }

  rule(b, hx, hz) {
    const isl = this.inIsland(b), tr = R.tags[b.tag];
    if (typeof tr === 'string') return { key: tr, why: `a ${b.tag}` };
    if (tr && tr.island) return isl ? { key: tr.island, why: `a ${b.tag} on the island` } : { key: tr.ring, why: `a ${b.tag} in the ring` };
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    if (tr && tr.finish) { const f = wallFinish(cx, cz); return { key: R.finish.other[f], why: `a solid building, painted ${FIN_NAME[f]}` }; }
    if (b.tag === 'wall' || b.tag === 'storey-wall') {
      const horiz = b.maxX - b.minX >= b.maxZ - b.minZ, t = (horiz ? b.maxZ - b.minZ : b.maxX - b.minX) / 2 + 0.3;
      const A = this.buildingAt(horiz ? cx : cx - t, horiz ? cz - t : cz, isl), Aid = A ? A.id ?? A : null;
      const B = this.buildingAt(horiz ? cx : cx + t, horiz ? cz + t : cz, isl), Bid = B ? B.id ?? B : null;
      const bld = A ?? B;
      if (A && Aid === Bid) return { key: R.partition, why: `a partition between rooms of ${isl ? 'an island' : 'a ring'} building` };
      const p = this.pieceCentre(b, horiz, hx, hz), f = wallFinish(p.x, p.z);
      const town = isl && bld?.district === 'town';
      return { key: R.finish[town ? 'town' : 'other'][f], why: `${bld ? `${town ? 'a Rust Haven' : isl ? 'an island' : 'a ring'} building's outside wall` : 'a free-standing wall'}, painted ${FIN_NAME[f]}` };
    }
    return { key: R.unknown, why: `no rule names a ${b.tag}: ${R.unknown} by default` };
  }

  // A door leaf, a window, by their own rows.
  opMaterial(op) {
    if (op.kind === 'leaf') return R.doors[op.door.material] ?? 'wood';
    return op.state === 'boarded' ? R.boards : op.state === 'shattered' ? null : 'glass';
  }

  punch(ammo) { return PUNCH[ammo] ?? roundRow(ammo)?.punch ?? 1; } // a calibre's own punch (data/ballistics.js ROUNDS)

  // ---- rounds ---------------------------------------------------------------------------------------------------------
  // A round from (ox, oz) along (dx, dz) met box b at distance t (face normal nx, nz) with dmg damage and `energy`.
  // Returns this.out (where it carries on from, which way, with what) or null where it stops.
  bullet(b, ox, oz, dx, dz, t, nx, nz, dmg, energy, shooter, hy, ry) {
    const hx = ox + dx * t, hz = oz + dz * t;
    const { key } = this.classify(b, hx, hz), M = MATERIALS[key] ?? MATERIALS.concrete;
    this._hy = hy;
    this.stats.hits++;
    this.impact(M, hx, hy, hz, nx, nz, dx, dz, b.base > 0);
    // What it does to the thing itself.
    if (M.bulletMul > 0 && M.breaks) this.hitBox(b, hx, hz, dmg * M.bulletMul, 'bullet', shooter);
    const thick = Math.min(b.maxX - b.minX, b.maxZ - b.minZ);
    // Exit: the far side of the box along the round's line.
    const invX = dx !== 0 ? 1 / dx : 1e9, invZ = dz !== 0 ? 1 / dz : 1e9;
    const tx = Math.max((b.minX - ox) * invX, (b.maxX - ox) * invX), tz = Math.max((b.minZ - oz) * invZ, (b.maxZ - oz) * invZ);
    const exitT = Math.min(tx, tz);
    return this.carry(M, key, hx, hz, dx, dz, nx, nz, dmg, energy, thick > PEN.maxDepth ? Infinity : Math.max(0.02, exitT - t), thick, shooter, b.tag);
  }

  // A round met a door leaf (systems/interiors.js has already slapped it, or hit its lock). Glass and boards keep their
  // own rules there (they stop the round); a leaf is wood or steel.
  throughLeaf(op, ox, oz, dx, dz, t, nx, nz, dmg, energy, shooter, hy) {
    const hx = ox + dx * t, hz = oz + dz * t;
    const key = this.opMaterial(op), M = MATERIALS[key];
    this._hy = hy;
    this.stats.hits++;
    this.impact(M, hx, hy, hz, nx, nz, dx, dz, false);
    if (M.breaks) this.hitDoor(op.door, dmg * M.bulletMul, 'bullet', shooter, hx, hz);
    const cosI = Math.abs(dx * nx + dz * nz);
    return this.carry(M, key, hx, hz, dx, dz, nx, nz, dmg, energy, DOOR.thick / Math.max(0.2, cosI), DOOR.thick, shooter, 'door');
  }

  // Glance off, stop, or go through what is left of `path` metres of material M.
  carry(M, key, hx, hz, dx, dz, nx, nz, dmg, energy, path, thick, shooter, what) {
    const dn = dx * nx + dz * nz, graze = (Math.asin(Math.min(1, Math.abs(dn))) * 180) / Math.PI;
    const o = this.out, g = this.g;
    if (M.ricochet > 0 && graze < M.ricAngle && (graze < M.ricAngle * 0.5 || Math.random() < M.ricochet)) {
      let rx = dx - 2 * dn * nx, rz = dz - 2 * dn * nz;
      const j = (Math.random() - 0.5) * 2 * PEN.ricJitter, cj = Math.cos(j), sj = Math.sin(j);
      const qx = rx * cj - rz * sj, qz = rx * sj + rz * cj, ql = Math.hypot(qx, qz) || 1;
      rx = qx / ql; rz = qz / ql;
      if (rx * nx + rz * nz < 0.02) { rx += nx * 0.05; rz += nz * 0.05; const l = Math.hypot(rx, rz); rx /= l; rz /= l; } // never back into the face
      this.stats.ricochets++;
      this.last = { what, material: key, result: 'ricochet', graze: r1(graze), x: r1(hx), z: r1(hz), by: shooter?.id ?? null };
      if (shooter === g.player) { this.pstats.ricochets++; this.plast = this.last; }
      g.audio.ricochet?.(g.pan(hx), Math.hypot(hx - g.player.x, hz - g.player.z));
      if (shooter === g.player) g.emit('ricochet', { material: key, graze: r1(graze), x: r1(hx), z: r1(hz) });
      o.x = hx + nx * 0.03; o.z = hz + nz * 0.03; o.dx = rx; o.dz = rz; o.dmg = dmg * PEN.ricKeep; o.energy = energy * PEN.ricKeep;
      return o;
    }
    const slant = Math.min(PEN.maxSlant, Math.max(1, path / Math.max(0.02, Math.min(thick, path))));
    const soak = M.stop * slant;
    if (!(path < Infinity) || !(energy > soak)) {
      this.stats.stopped++;
      this.last = { what, material: key, result: 'stopped', graze: r1(graze), soak: Number.isFinite(soak) ? r1(soak) : 'all', energy: r1(energy), x: r1(hx), z: r1(hz), by: shooter?.id ?? null };
      if (shooter === g.player) { this.pstats.stopped++; this.plast = this.last; }
      return null;
    }
    const k = (energy - soak) / energy;
    this.stats.penetrated++;
    this.last = { what, material: key, result: 'through', graze: r1(graze), soak: r1(soak), energy: r1(energy), left: r2(k), x: r1(hx), z: r1(hz), by: shooter?.id ?? null };
    if (shooter === g.player) { this.pstats.penetrated++; this.plast = this.last; }
    if (shooter === g.player) g.emit('roundThrough', { material: key, left: r2(k), x: r1(hx), z: r1(hz) });
    o.x = hx + dx * (path + PEN.exitGap); o.z = hz + dz * (path + PEN.exitGap); o.dx = dx; o.dz = dz; o.dmg = dmg * k; o.energy = energy - soak;
    // The far face sprays too (splinters out the back of a plank wall).
    this.impact(M, o.x - dx * PEN.exitGap, this._hy ?? 1.3, o.z - dz * PEN.exitGap, dx, dz, -dx, -dz, true, true);
    return o;
  }

  // What a hit throws and the mark it leaves on face (nx, nz) at (x, y, z).
  impact(M, x, y, z, nx, nz, dx, dz, high = false, exit = false) {
    const g = this.g, fx = g.fx;
    const yy = high ? y : y + (Math.random() - 0.5) * 0.5;
    switch (M.spray) {
      case 'splinters': for (let k = 0; k < 6; k++) fx.spawn(3, x + nx * 0.05, yy, z + nz * 0.05, nx * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2.5, 1 + Math.random() * 2.5, nz * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2.5, 0.8, 0.04 + Math.random() * 0.05, M.tint, 18); break;
      case 'dust': fx.spawn(2, x + nx * 0.1, yy, z + nz * 0.1, nx * 1.4, 0.6, nz * 1.4, 0.8, 0.3, M.tint, -0.3); for (let k = 0; k < 3; k++) fx.spawn(3, x, yy, z, nx * 2.5 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, nz * 2.5 + (Math.random() - 0.5) * 2, 0.6, 0.03, M.tint, 18); break;
      case 'chips': fx.spawn(2, x + nx * 0.1, yy, z + nz * 0.1, nx * 1.6, 0.8, nz * 1.6, 0.9, 0.35, M.tint, -0.3); for (let k = 0; k < 4; k++) fx.spawn(3, x, yy, z, nx * 3 + (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, nz * 3 + (Math.random() - 0.5) * 3, 0.7, 0.04 + Math.random() * 0.03, M.tint, 18); break;
      case 'sparks': fx.sparks(x + nx * 0.05, yy, z + nz * 0.05, nx, nz, 5); break;
      case 'puff': fx.spawn(2, x + nx * 0.15, yy, z + nz * 0.15, nx * 1.2, 0.5, nz * 1.2, 1.0, 0.4, M.tint, -0.2); break;
      case 'fibres': for (let k = 0; k < 3; k++) fx.spawn(3, x, yy, z, nx * 1.5 + (Math.random() - 0.5), 0.5 + Math.random(), nz * 1.5 + (Math.random() - 0.5), 0.9, 0.025, M.tint, 6); break;
      case 'shards': for (let k = 0; k < 4; k++) fx.spawn(1, x, yy, z, nx * 2 + (Math.random() - 0.5) * 2, 1 + Math.random(), nz * 2 + (Math.random() - 0.5) * 2, 0.5, 0.04, M.tint, 18); break;
      default: break;
    }
    if (M.hole !== 'none' && !exit) {
      const tile = M.hole === 'wood' ? TILE.hole_wood : M.hole === 'metal' ? TILE.hole_metal : TILE.hole_masonry;
      this.blood.mark(tile, x, Math.max(0.25, yy), z, nx, nz, 0.2 + Math.random() * 0.1, M.tint);
    }
    if (Math.random() < 0.3) {
      const d = Math.hypot(x - g.player.x, z - g.player.z), pan = g.pan(x);
      if (M.sound === 'ricochet') g.audio.ricochet?.(pan, d); else if (M.sound === 'clink') g.audio.clink?.(pan); else g.audio.thud?.(pan);
    }
  }

  // ---- breakable records -----------------------------------------------------------------------------------------------
  keyOf(b) { return `${b.tag}@${b.minX.toFixed(2)},${b.minZ.toFixed(2)},${b.maxX.toFixed(2)},${b.maxZ.toFixed(2)}`; }

  breakable(b) {
    if (b.op || b.base > 0 || !this.inIsland(b)) return false;
    if (this.boxRec.has(b)) return true;
    const M = MATERIALS[this.classify(b).key];
    if (!M || !(M.breaks || M.fire)) return false;
    return BREAK_WALL.has(b.tag) ? M.breaks : BREAK_PROP.has(b.tag);
  }

  // The record for a box that can break (made on first damage), or null.
  recOf(b) {
    const have = this.boxRec.get(b);
    if (have) return have;
    if (!this.breakable(b)) return null;
    const key = this.keyOf(b), mat = this.classify(b).key, M = MATERIALS[mat];
    let rec;
    if (BREAK_WALL.has(b.tag)) {
      const horiz = b.maxX - b.minX >= b.maxZ - b.minZ, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      const W = this.g.world.walls;
      let vis = -1;
      if (W) for (let i = 0; i < W.items.length; i++) { const it = W.items[i]; if (Math.abs(it.cx - cx) < 0.02 && Math.abs(it.cz - cz) < 0.02 && Math.abs(it.sx - (b.maxX - b.minX)) < 0.02 && Math.abs(it.sz - (b.maxZ - b.minZ)) < 0.02) { vis = i; break; } }
      const color = vis >= 0 ? `#${W.items[vis].color.getHexString()}` : M.color;
      rec = this.wallRec({ key, mat, box: b, own: false, horiz, a0: horiz ? b.minX : b.minZ, a1: horiz ? b.maxX : b.maxZ, fixed: horiz ? cz : cx, t: horiz ? b.maxZ - b.minZ : b.maxX - b.minX, h: b.height, vis, color, look: FIN_LOOK[wallFinish(cx, cz)], tag: b.tag });
    } else {
      const long = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
      const hpMax = M.hpM2 * long * Math.min(2, b.height);
      rec = { key, kind: 'prop', mat, box: b, own: false, hp: hpMax, hpMax, props: null, broken: false, char: 0, heat: 0, burning: false, burnLeft: 0, ramT: -9, hidden: false };
    }
    this.recs.set(key, rec);
    this.boxRec.set(b, rec);
    return rec;
  }

  wallRec(o) {
    const M = MATERIALS[o.mat], len = o.a1 - o.a0, n = Math.max(1, Math.round(len));
    const cellHp = M.hpM2 * o.h * (len / n);
    return { kind: 'wall', ...o, n, cellHp, cells: new Float32Array(n).fill(cellHp), gaps: [], parts: [], hidden: false, broken: false, char: 0, heat: 0, burning: false, burnLeft: 0, ramT: -9, stubs: [] };
  }

  // Damage a box at (x, z): a wall's strip there, a prop as a whole. breachMin: at least this wide if it opens.
  hitBox(b, x, z, dmg, cause, by, breachMin = 0) {
    const rec = this.recOf(b);
    if (!rec || rec.broken || !(dmg > 0)) return null;
    if (rec.kind === 'wall') return this.hitWall(rec, rec.horiz ? x : z, dmg, cause, by, breachMin);
    rec.hp -= dmg;
    if (rec.hp <= 0) { this.breakProp(rec, cause, by); return 'broke'; }
    return null;
  }

  hitWall(rec, a, dmg, cause, by, breachMin = 0) {
    const M = MATERIALS[rec.mat];
    if (!M.breaks) return null;
    const i = Math.min(rec.n - 1, Math.max(0, Math.floor(((a - rec.a0) / (rec.a1 - rec.a0)) * rec.n)));
    if (rec.cells[i] <= 0) return null;
    rec.cells[i] -= dmg;
    if (rec.cells[i] > 0) return null;
    // The strip gives: a breach centred on it.
    // Centred on a half metre (the foot nav's cell centres), so a breach a walker fits through is one the nav grid opens.
    const cell = (rec.a1 - rec.a0) / rec.n, mid = Math.round(rec.a0 + (i + 0.5) * cell - 0.5) + 0.5, w = Math.max(M.breach, breachMin) / 2;
    this.openGap(rec, mid - w, mid + w);
    this.stats.breaches++;
    this.note(rec.key, rec.mat, cause, rec.horiz ? mid : rec.fixed, rec.horiz ? rec.fixed : mid, by);
    this.g.emit('breach', { material: rec.mat, x: r1(rec.horiz ? mid : rec.fixed), z: r1(rec.horiz ? rec.fixed : mid), width: r1(w * 2), cause, by: by?.id ?? null });
    this.burst(rec, rec.horiz ? mid : rec.fixed, rec.horiz ? rec.fixed : mid, w * 2, cause);
    return 'breach';
  }

  openGap(rec, lo, hi) {
    lo = Math.max(rec.a0, lo); hi = Math.min(rec.a1, hi);
    if (hi - lo < 0.05) return;
    rec.gaps.push([r2(lo), r2(hi)]);
    const cell = (rec.a1 - rec.a0) / rec.n;
    for (let k = 0; k < rec.n; k++) { const m = rec.a0 + (k + 0.5) * cell; if (m > lo && m < hi) rec.cells[k] = 0; }
    this.rebuildWall(rec);
    const x0 = rec.horiz ? lo : rec.fixed - rec.t / 2, x1 = rec.horiz ? hi : rec.fixed + rec.t / 2;
    const z0 = rec.horiz ? rec.fixed - rec.t / 2 : lo, z1 = rec.horiz ? rec.fixed + rec.t / 2 : hi;
    this.blood.clearIn(x0, z0, x1, z1);
    this.debris(`${rec.key}:${r2(lo)}`, x0, z0, x1, z1, rec.mat, rec.char > 0.6);
  }

  // The solid spans of a wall: [a0, a1] less its gaps.
  spans(rec) {
    const gs = rec.gaps.slice().sort((p, q) => p[0] - q[0]);
    const out = [];
    let cur = rec.a0;
    for (const [lo, hi] of gs) { if (lo > cur) out.push([cur, lo]); cur = Math.max(cur, hi); }
    if (rec.a1 > cur) out.push([cur, rec.a1]);
    return out.filter(([s, e]) => e - s >= 0.25);
  }

  // Lay a wall out again from its spans: its old pieces (and, the first time, the world's box and instance) go.
  rebuildWall(rec) {
    const g = this.g, S = g.statics;
    for (const p of rec.parts) { this.detach(p.box); this.freeSlot(p.slot); }
    rec.parts.length = 0;
    for (const s of rec.stubs) this.freeSlot(s);
    rec.stubs.length = 0;
    if (rec.box && !rec.hidden) { this.detach(rec.box); this.hideBatch(g.world.walls, rec.vis); rec.hidden = true; }
    const spans = this.spans(rec), t = rec.t / 2;
    if (!spans.length) rec.broken = true;
    for (const [s, e] of spans) {
      const x0 = rec.horiz ? s : rec.fixed - t, x1 = rec.horiz ? e : rec.fixed + t, z0 = rec.horiz ? rec.fixed - t : s, z1 = rec.horiz ? rec.fixed + t : e;
      const box = S.add(x0, z0, x1, z1, rec.tag ?? 'piece', rec.h);
      this.mine.add(box); this.explicit.set(box, rec.mat); this.boxRec.set(box, rec);
      const slot = this.allocSlot();
      if (slot >= 0) this.pieceWrite(slot, x0, 0, z0, x1, rec.h, z1, rec.color, rec.look, rec.char);
      rec.parts.push({ box, slot, s, e });
    }
    // What fire leaves of the burnt stretches: low charred stumps, nothing to stop anyone.
    if (rec.burntOut) {
      for (let a = rec.a0; a < rec.a1 - 0.05; a += 0.6) {
        const e = Math.min(rec.a1, a + 0.45), hh = 0.18 + (hashStr(rec.key + a.toFixed(1)) % 100) / 300;
        const slot = this.allocSlot();
        if (slot < 0) break;
        this.pieceWrite(slot, rec.horiz ? a : rec.fixed - t, 0, rec.horiz ? rec.fixed - t : a, rec.horiz ? e : rec.fixed + t, hh, rec.horiz ? rec.fixed + t : e, rec.color, rec.look, 1);
        rec.stubs.push(slot);
      }
    }
    this.navRefresh(rec.horiz ? rec.a0 : rec.fixed - t, rec.horiz ? rec.fixed - t : rec.a0, rec.horiz ? rec.a1 : rec.fixed + t, rec.horiz ? rec.fixed + t : rec.a1);
  }

  breakProp(rec, cause, by, quiet = false) {
    if (rec.broken) return;
    const g = this.g, b = rec.box;
    rec.broken = true; rec.hp = 0;
    this.detach(b);
    if (rec.own) { this.freeSlot(rec.slot); rec.slot = -1; }
    else for (const i of this.propsOf(rec)) this.hideBatch(g.world.props, i);
    this.navRefresh(b.minX, b.minZ, b.maxX, b.maxZ);
    this.blood.clearIn(b.minX, b.minZ, b.maxX, b.maxZ);
    this.stats.broken++;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    this.debris(rec.key, b.minX, b.minZ, b.maxX, b.maxZ, rec.mat, rec.char > 0.6 || cause === 'fire');
    if (!quiet) {
      this.note(rec.key, rec.mat, cause, cx, cz, by);
      this.burst(rec, cx, cz, Math.max(b.maxX - b.minX, b.maxZ - b.minZ), cause);
      g.emit('broke', { thing: b.tag, material: rec.mat, x: r1(cx), z: r1(cz), cause, by: by?.id ?? null });
    }
  }

  // The world's prop instances that make up a piece of furniture (its parts stand inside its footprint).
  propsOf(rec) {
    if (rec.props) return rec.props;
    const P = this.g.world.props, b = rec.box, out = [];
    if (P?.items) for (let i = 0; i < P.items.length; i++) {
      const it = P.items[i];
      if (it.cx > b.minX - 0.05 && it.cx < b.maxX + 0.05 && it.cz > b.minZ - 0.05 && it.cz < b.maxZ + 0.05 && it.cy < b.height + 0.4) out.push(i);
    }
    return (rec.props = out);
  }

  // ---- doors ---------------------------------------------------------------------------------------------------------
  doorRec(door) {
    const key = `door:${door.id}`;
    let rec = this.recs.get(key);
    if (!rec) {
      const mat = R.doors[door.material] ?? 'wood', M = MATERIALS[mat], hpMax = M.hpM2 * door.width * DOOR.height;
      rec = { key, kind: 'door', id: door.id, mat, hp: hpMax, hpMax, broken: this.brokenDoors.has(door.id), char: 0, heat: 0, burning: false, burnLeft: 0, x: door.x, z: door.z, w: door.width, axis: door.axis };
      this.recs.set(key, rec);
    }
    return rec;
  }

  hitDoor(door, dmg, cause, by, x = door.x, z = door.z) {
    const rec = this.doorRec(door), M = MATERIALS[rec.mat];
    if (rec.broken || !M.breaks || !(dmg > 0)) return null;
    rec.hp -= dmg;
    if (rec.hp <= 0) { this.breakDoor(rec, cause, by); return 'broke'; }
    return null;
  }

  breakDoor(rec, cause, by, quiet = false) {
    const g = this.g, I = g.interiors;
    rec.broken = true; rec.hp = 0;
    this.brokenDoors.add(rec.id);
    const door = I.byId.get(rec.id);
    if (door?.leaves) {
      door.broken = true;
      if (door.locked) { door.locked = false; door.lockHp = 0; door.kicks = 0; I.navBlock(door, false); I.syncLock(door); }
      for (const L of door.leaves) { L.w = 0; I.orient(L); }
      I.flush();
    }
    this.stats.broken++;
    const t = 0.3, ax = rec.axis === 'x';
    const x0 = ax ? rec.x - rec.w / 2 : rec.x - t, x1 = ax ? rec.x + rec.w / 2 : rec.x + t, z0 = ax ? rec.z - t : rec.z - rec.w / 2, z1 = ax ? rec.z + t : rec.z + rec.w / 2;
    this.debris(rec.key, x0 - (ax ? 0 : 0.8), z0 - (ax ? 0.8 : 0), x1 + (ax ? 0 : 0.8), z1 + (ax ? 0.8 : 0), rec.mat, rec.char > 0.6 || cause === 'fire');
    if (!quiet) {
      this.note(rec.key, rec.mat, cause, rec.x, rec.z, by);
      this.burst(rec, rec.x, rec.z, rec.w, cause);
      g.emit('doorBroken', { door: rec.id, material: rec.mat, cause, by: by?.id ?? null });
    }
  }

  note(key, mat, cause, x, z, by) {
    this.log.push({ key, mat, cause, x: r1(x), z: r1(z), by: by?.id ?? null, t: r1(this.g.time) });
    if (this.log.length > 40) this.log.shift();
  }

  // ---- blasts, fire, rams --------------------------------------------------------------------------------------------
  // A blast at (x, z) of radius r (systems/interiors.js blast calls this: grenades, pipe bombs, cars going up).
  blast(x, z, r, by, power = BLAST.powerPerM * r) {
    const g = this.g, S = g.statics, out = { broke: 0, breaches: 0 };
    const stamp = ++S.stamp;
    scorches = 0;
    for (let cx = S.ci(x - r); cx <= S.ci(x + r); cx++) for (let cz = S.ci(z - r); cz <= S.ci(z + r); cz++) {
      const list = S.cells[cz * S.n + cx];
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.mark === stamp) continue;
        b.mark = stamp;
        if (b.op || b.base > 0) continue;
        const qx = Math.max(b.minX, Math.min(x, b.maxX)), qz = Math.max(b.minZ, Math.min(z, b.maxZ)), d = Math.hypot(qx - x, qz - z);
        if (d > r) continue;
        const M = MATERIALS[this.classify(b, qx, qz).key];
        if (!M) continue;
        // A scorch on the face the blast met (masonry and steel just take this).
        if (d < r * 0.6 && d > 0.05 && scorches++ < 8) { const nx = (x - qx) / d, nz = (z - qz) / d; this.blood.add(TILE.scorch, qx + nx * 0.03, 1.0, qz + nz * 0.03, nx, 0, nz, 1.6 * (1 - d / r) + 0.6, 1.4 * (1 - d / r) + 0.5, Math.random() * 6.283, '#1a1512'); }
        if (!M.breaks || !this.breakable(b)) continue;
        const rec = this.recOf(b);
        if (!rec || rec.broken) continue;
        if (rec.kind === 'wall') {
          // Every strip in reach, by its own distance.
          const cell = (rec.a1 - rec.a0) / rec.n;
          for (let k = 0; k < rec.n; k++) {
            const m = rec.a0 + (k + 0.5) * cell, px = rec.horiz ? m : rec.fixed, pz = rec.horiz ? rec.fixed : m, dk = Math.hypot(px - x, pz - z);
            if (dk > r || rec.cells[k] <= 0) continue;
            if (this.hitWall(rec, m, power * (1 - dk / r) * (1 - M.blastRes), 'blast', by) === 'breach') out.breaches++;
            if (rec.broken) break;
          }
        } else if (this.hitBox(b, qx, qz, power * (1 - d / r) * (1 - M.blastRes), 'blast', by) === 'broke') out.broke++;
      }
    }
    for (const door of g.interiors.doors) {
      const d = Math.hypot(door.x - x, door.z - z);
      if (d > r || door.broken) continue;
      const M = MATERIALS[R.doors[door.material] ?? 'wood'];
      if (this.hitDoor(door, power * (1 - d / r) * (1 - M.blastRes), 'blast', by) === 'broke') out.broke++;
    }
    return out;
  }

  // Fires (systems/throwables.js patches, burning cars) set what burns in their reach going; what burns keeps a fire of
  // its own going (a patch over it, so it burns whoever stands in it and lights what is next to it) until it is gone.
  fireTick(dt) {
    const g = this.g, T = g.throwables;
    this.fireDt = dt;
    if (T?.fires) for (const f of T.fires) this.heatAround(f.x, f.z, f.r, f.by);
    for (const v of g.vehicles) if (v.onFire > 0 || v.burn > 0) this.heatAround(v.x, v.z, 2.6, v.fireBy ?? null);
    // What is burning burns down.
    for (const rec of this.burning) {
      const M = MATERIALS[rec.mat];
      rec.burnLeft -= dt;
      rec.char = Math.min(1, Math.max(rec.char, 1 - rec.burnLeft / M.fire.burn));
      this.paintChar(rec);
      if (rec.fireLeft !== undefined && (rec.fireLeft -= dt) <= 0) this.firePatch(rec);
      if (rec.burnLeft <= 0) this.burnOut(rec);
    }
  }

  // A thing in a fire's reach warms toward catching (MATERIALS fire.ignite seconds of flame).
  heat(rec, M, by) {
    if (rec.broken || rec.burning || !M.fire) return;
    rec.heat += this.fireDt / M.fire.ignite;
    if (rec.heat >= 1) this.ignite(rec, by);
  }

  heatAround(x, z, r, by) {
    const g = this.g, S = g.statics, stamp = ++S.stamp;
    for (let cx = S.ci(x - r); cx <= S.ci(x + r); cx++) for (let cz = S.ci(z - r); cz <= S.ci(z + r); cz++) {
      const list = S.cells[cz * S.n + cx];
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.mark === stamp) continue;
        b.mark = stamp;
        if (b.op || b.base > 0) continue;
        const qx = Math.max(b.minX, Math.min(x, b.maxX)), qz = Math.max(b.minZ, Math.min(z, b.maxZ));
        if ((qx - x) ** 2 + (qz - z) ** 2 > r * r) continue;
        const M = MATERIALS[this.classify(b, qx, qz).key];
        if (!M?.fire || !this.breakable(b)) continue;
        const rec = this.recOf(b);
        if (rec) this.heat(rec, M, by);
      }
    }
    for (const door of g.interiors.doors) {
      if (door.broken || (door.x - x) ** 2 + (door.z - z) ** 2 > (r + 0.6) ** 2) continue;
      const M = MATERIALS[R.doors[door.material] ?? 'wood'];
      if (M.fire) this.heat(this.doorRec(door), M, by);
    }
  }

  ignite(rec, by = null) {
    const M = MATERIALS[rec.mat];
    if (rec.burning || rec.broken || !M.fire) return;
    rec.burning = true; rec.burnLeft = rec.burnLeft > 0 ? rec.burnLeft : M.fire.burn; rec.by = by;
    this.burning.add(rec);
    this.stats.ignited++;
    this.firePatch(rec);
    const c = this.centreOf(rec);
    this.blood.scorch(c.x, c.z, c.half * 2 + 1.6);
    this.g.emit('ignitedThing', { thing: rec.kind, material: rec.mat, key: rec.key });
  }

  // The fire a burning thing keeps over itself (the patch is what burns people, cooks cars, lights the night and catches
  // what stands next to it).
  firePatch(rec) {
    const T = this.g.throwables;
    if (!T) return;
    const { x, z, half } = this.centreOf(rec);
    const dur = Math.max(2, Math.min(rec.burnLeft + 0.5, 8));
    rec.fireLeft = dur - 0.6;
    // Things burning side by side share one fire (a shack is one blaze, not five stacked on each other): grow a patch
    // of ours that is close enough to take this one in.
    for (const f of T.fires) {
      if (!f.mat) continue;
      const d = Math.hypot(f.x - x, f.z - z);
      if (d > FIRE.merge) continue;
      f.r = Math.min(FIRE.maxR, Math.max(f.r, d + half + FIRE.margin));
      f.dur = Math.max(f.dur, f.t + dur);
      return;
    }
    // Straight into the fire list (startFire would lay a scorch every time it is renewed; the burn mark is laid once).
    if (T.fires.length > 30) T.fires.shift();
    T.fires.push({ x, z, r: half + FIRE.margin, t: 0, dur, by: rec.by ?? null, mat: true });
  }

  centreOf(rec) {
    const c = _ctr;
    if (rec.kind === 'door') { c.x = rec.x; c.z = rec.z; c.half = rec.w / 2; }
    else if (rec.kind === 'wall') { const m = (rec.a0 + rec.a1) / 2; c.x = rec.horiz ? m : rec.fixed; c.z = rec.horiz ? rec.fixed : m; c.half = (rec.a1 - rec.a0) / 2; }
    else { const b = rec.box; c.x = (b.minX + b.maxX) / 2; c.z = (b.minZ + b.maxZ) / 2; c.half = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2; }
    return c;
  }

  burnOut(rec) {
    rec.burning = false; rec.burnLeft = 0; rec.char = 1;
    this.burning.delete(rec);
    this.stats.burnt++;
    if (rec.kind === 'wall') { rec.burntOut = true; this.openGap(rec, rec.a0 - 1, rec.a1 + 1); rec.broken = true; }
    else if (rec.kind === 'door') this.breakDoor(rec, 'fire', rec.by);
    else this.breakProp(rec, 'fire', rec.by);
    const { x, z, half } = this.centreOf(rec);
    this.blood.scorch(x, z, half * 2 + 1.0, '#0e0b09'); // ash where it stood
    for (let k = 0; k < 6; k++) this.g.fx.smoke(x + (Math.random() - 0.5) * half * 2, 1.2, z + (Math.random() - 0.5) * 1.2, true);
    this.g.emit('burntDown', { thing: rec.kind, material: rec.mat, x: r1(x), z: r1(z) });
  }

  // Charring shows: a piece's soot, a door leaf's colour, a piece of furniture's parts.
  paintChar(rec) {
    const g = this.g, M = MATERIALS[rec.mat], k = rec.char;
    if (rec.kind === 'wall') { for (const p of rec.parts) if (p.slot >= 0) this.aChar.array[p.slot] = k; this.aChar.needsUpdate = true; if (!rec.hidden && rec.box) this.rebuildWall(rec); return; }
    if (rec.kind === 'door') {
      const door = g.interiors.byId.get(rec.id);
      if (door?.leaves) { for (const L of door.leaves) g.interiors.leafMesh.setColorAt(L.slot, _c.set(door.color).lerp(CHAR, k * 0.9)); g.interiors.leafMesh.instanceColor.needsUpdate = true; }
      return;
    }
    if (rec.own) { if (rec.slot >= 0) { this.aChar.array[rec.slot] = k; this.aChar.needsUpdate = true; } return; }
    const P = g.world.props;
    for (const i of this.propsOf(rec)) P.mesh.setColorAt(i, _c.copy(P.items[i].color).lerp(_c2.set(M.fire?.char ?? '#1a1512'), k * 0.9));
    if (P.mesh.instanceColor) P.mesh.instanceColor.needsUpdate = true;
  }

  // Cars break what they drive into: speed squared (data/materials.js RAM), a breach at least a car wide.
  ramTick() {
    const g = this.g, S = g.statics, now = g.time, P = g.player;
    for (const v of g.vehicles) {
      // Who drives through things: you, and those out to hurt someone (raiders, a car chasing). The town's traffic and
      // the convoys keep to the road; a brush with a market stall is not a ram.
      const d0 = v.driver;
      if (v.dead || !d0 || !(d0 === P || d0.faction === 'raider' || (d0.target && d0.faction !== 'warden')) || Math.abs(v.x - P.x) > 160 || Math.abs(v.z - P.z) > 160) { v._mSpd = 0; continue; }
      const sp = Math.max(g.vehiclesSys.speed(v) + Math.max(0, v.impact ?? 0), v._mSpd ?? 0);
      v._mSpd = g.vehiclesSys.speed(v);
      if (sp < RAM.minSpeed || Math.abs(v.x) > ISL || Math.abs(v.z) > ISL) continue;
      const dmg = sp * sp * RAM.perSpeed2;
      for (const d of g.vehiclesSys.discs(v)) {
        const r = d.r + 0.35, stamp = ++S.stamp;
        for (let cx = S.ci(d.x - r); cx <= S.ci(d.x + r); cx++) for (let cz = S.ci(d.z - r); cz <= S.ci(d.z + r); cz++) {
          const list = S.cells[cz * S.n + cx];
          for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (b.mark === stamp) continue;
            b.mark = stamp;
            if (b.op || b.base > 0 || b.height < 0.3 || !(BREAK_WALL.has(b.tag) || BREAK_PROP.has(b.tag) || this.mine.has(b))) continue;
            const qx = Math.max(b.minX, Math.min(d.x, b.maxX)), qz = Math.max(b.minZ, Math.min(d.z, b.maxZ));
            if ((qx - d.x) ** 2 + (qz - d.z) ** 2 > r * r || !this.breakable(b)) continue;
            const rec = this.recOf(b);
            if (!rec || rec.broken || now - rec.ramT < RAM.every) continue;
            rec.ramT = now;
            const M = MATERIALS[rec.mat];
            this.stats.rams++;
            if (this.hitBox(b, qx, qz, dmg * (1 - M.blastRes * 0.5), 'ram', v.driver, RAM.breach)) g.emit('rammedThrough', { vehicle: v.id, material: rec.mat, speed: r1(sp) });
          }
        }
      }
    }
  }

  // ---- per frame -----------------------------------------------------------------------------------------------------
  update(dt) {
    this.blood.update(dt);
    if ((this.fireT -= dt) <= 0) { this.fireTick(FIRE.every - this.fireT); this.fireT = FIRE.every; }
    this.ramTick();
    // Flames on what is burning.
    if (this.burning.size) {
      const fx = this.g.fx;
      for (const rec of this.burning) {
        const { x, z, half } = this.centreOf(rec), along = rec.kind === 'wall' ? rec.horiz : rec.kind === 'door' ? rec.axis === 'x' : true;
        const n = FIRE.flamesPerM * half * 2 * dt, h = rec.kind === 'wall' ? rec.h : rec.kind === 'door' ? DOOR.height : rec.box.height;
        const cnt = Math.min(40, Math.floor(n) + (Math.random() < n % 1 ? 1 : 0));
        for (let k = 0; k < cnt; k++) {
          const a = (Math.random() - 0.5) * half * 2, px = along ? x + a : x + (Math.random() - 0.5) * 0.4, pz = along ? z + (Math.random() - 0.5) * 0.4 : z + a;
          fx.spawn(4, px, Math.random() * h * (1 - rec.char * 0.6), pz, 0, 2 + Math.random() * 2.5, 0, 0.5 + Math.random() * 0.4, 0.28 + Math.random() * 0.3, Math.random() < 0.5 ? '#ff9a2a' : '#ff5a1a', -2);
        }
        if (Math.random() < dt * FIRE.smokePerS) fx.smoke(x + (Math.random() - 0.5) * half, h + 0.5, z, true);
      }
    }
  }

  // ---- the island's collision grid and nav (this system's own edits) ---------------------------------------------------
  detach(b) {
    const S = this.g.statics;
    for (let x = S.ci(b.minX); x <= S.ci(b.maxX); x++) for (let z = S.ci(b.minZ); z <= S.ci(b.maxZ); z++) {
      const list = S.cells[z * S.n + x], i = list.indexOf(b);
      if (i >= 0) { list[i] = list[list.length - 1]; list.pop(); }
    }
    const i = S.boxes.indexOf(b);
    if (i >= 0) S.boxes.splice(i, 1);
  }
  attach(b) {
    const S = this.g.statics;
    if (S.boxes.includes(b)) return;
    S.boxes.push(b);
    for (let x = S.ci(b.minX); x <= S.ci(b.maxX); x++) for (let z = S.ci(b.minZ); z <= S.ci(b.maxZ); z++) S.cells[z * S.n + x].push(b);
  }

  // Re-rasterise the foot and car grids' cells round a rectangle from the boxes there now (the rule nav.js rasterise uses:
  // a cell is blocked when its centre is inside a box grown by the walker's radius; deep water as main.js bakes it).
  navRefresh(x0, z0, x1, z1) {
    const g = this.g, S = g.statics;
    for (const n of [g.nav.foot, g.nav.car]) {
      const r = n.radius, c = n.cell, lim = n === g.nav.foot ? 1.2 : 0.6;
      for (let gz = Math.floor((z0 - r) / c) - 1; gz <= Math.floor((z1 + r) / c) + 1; gz++) for (let gx = Math.floor((x0 - r) / c) - 1; gx <= Math.floor((x1 + r) / c) + 1; gx++) {
        const x = (gx + 0.5) * c, z = (gz + 0.5) * c;
        if (Math.abs(x) >= n.isl || Math.abs(z) >= n.isl) continue;
        if (n.getCell(x, z) === 3) continue; // a locked door's cells are interiors.js's
        let blocked = x > 290 && g.water.depthAt(x, z) > lim;
        if (!blocked) {
          const list = S.cells[S.ci(z) * S.n + S.ci(x)];
          for (let i = 0; i < list.length && !blocked; i++) { const b = list[i]; if (!b.op && b.base <= 0 && b.tag !== 'bound' && x >= b.minX - r && x <= b.maxX + r && z >= b.minZ - r && z <= b.maxZ + r) blocked = true; }
          // A box can reach a cell from a neighbouring 8 m bucket: look round when near a bucket's edge.
          if (!blocked) for (let ox = -1; ox <= 1 && !blocked; ox++) for (let oz = -1; oz <= 1 && !blocked; oz++) {
            if (!ox && !oz) continue;
            const l2 = S.cells[Math.min(S.n - 1, Math.max(0, S.ci(z) + oz)) * S.n + Math.min(S.n - 1, Math.max(0, S.ci(x) + ox))];
            for (let i = 0; i < l2.length; i++) { const b = l2[i]; if (!b.op && b.base <= 0 && b.tag !== 'bound' && x >= b.minX - r && x <= b.maxX + r && z >= b.minZ - r && z <= b.maxZ + r) { blocked = true; break; } }
          }
        }
        n.setCell(x, z, blocked ? 1 : 0);
      }
    }
  }

  // ---- rendering --------------------------------------------------------------------------------------------------------
  buildMeshes(scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.aLook = new THREE.InstancedBufferAttribute(new Float32Array(PIECE_MAX), 1);
    this.aChar = new THREE.InstancedBufferAttribute(new Float32Array(PIECE_MAX), 1);
    geo.setAttribute('aLook', this.aLook); geo.setAttribute('aChar', this.aChar);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0.06 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${P_VERT_HEAD}`).replace('#include <project_vertex>', `#include <project_vertex>\n${P_VERT_BODY}`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${P_FRAG_HEAD}`).replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = pieceLook(diffuseColor.rgb);');
    };
    mat.customProgramCacheKey = () => 'materialPiece1';
    this.pieceMesh = new THREE.InstancedMesh(geo, mat, PIECE_MAX);
    for (let i = 0; i < PIECE_MAX; i++) { this.pieceMesh.setMatrixAt(i, ZERO); this.pieceMesh.setColorAt(i, _c.set('#888')); }
    this.pieceMesh.castShadow = true; this.pieceMesh.receiveShadow = true;
    this.pieceMesh.frustumCulled = false;
    this.pieceMesh.visible = false;
    this.free = [];
    for (let i = PIECE_MAX - 1; i >= 0; i--) this.free.push(i);
    this.slotsUsed = 0;
    scene.add(this.pieceMesh);
    // Debris: what is left on the floor when something breaks (planks, sheet, chunks), a ring.
    this.debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), DEBRIS_MAX);
    for (let i = 0; i < DEBRIS_MAX; i++) { this.debrisMesh.setMatrixAt(i, ZERO); this.debrisMesh.setColorAt(i, _c.set('#666')); }
    this.debrisMesh.receiveShadow = true;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.visible = false;
    this.debrisMesh.count = 0;
    scene.add(this.debrisMesh);
  }

  allocSlot() {
    const s = this.free.pop();
    if (s === undefined) return -1;
    this.slotsUsed++;
    this.pieceMesh.visible = true;
    return s;
  }
  freeSlot(s) {
    if (s < 0 || s === undefined) return;
    this.pieceMesh.setMatrixAt(s, ZERO); this.pieceMesh.instanceMatrix.needsUpdate = true;
    this.free.push(s); this.slotsUsed--;
    if (this.slotsUsed <= 0) { this.slotsUsed = 0; this.pieceMesh.visible = false; }
  }
  pieceWrite(slot, x0, y0, z0, x1, y1, z1, color, look, char = 0) {
    _o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); _o.rotation.set(0, 0, 0); _o.scale.set(x1 - x0, y1 - y0, z1 - z0); _o.updateMatrix();
    this.pieceMesh.setMatrixAt(slot, _o.matrix); this.pieceMesh.setColorAt(slot, _c.set(color));
    this.aLook.array[slot] = LOOK[look] ?? look; this.aChar.array[slot] = char;
    this.pieceMesh.instanceMatrix.needsUpdate = true; this.pieceMesh.instanceColor.needsUpdate = true;
    this.aLook.needsUpdate = true; this.aChar.needsUpdate = true;
  }

  hideBatch(batch, idx) {
    if (!batch?.mesh || idx < 0) return;
    batch.mesh.setMatrixAt(idx, ZERO); batch.mesh.instanceMatrix.needsUpdate = true;
  }
  showBatch(batch, idx) {
    if (!batch?.mesh || idx < 0) return;
    const it = batch.items[idx];
    _o.position.set(it.cx, it.cy, it.cz); _o.rotation.set(0, it.rotY, 0); _o.scale.set(it.sx, it.sy, it.sz); _o.updateMatrix();
    batch.mesh.setMatrixAt(idx, _o.matrix); batch.mesh.setColorAt(idx, it.color);
    batch.mesh.instanceMatrix.needsUpdate = true; if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
  }

  // Bits on the floor where something broke, the same every time for the same thing (seeded by its key).
  debris(key, x0, z0, x1, z1, mat, charred) {
    const M = MATERIALS[mat] ?? MATERIALS.wood, rng = makeRng(hashStr(key) || 1), D = this.debrisMesh;
    const area = Math.max(0.5, (x1 - x0 + 0.6) * (z1 - z0 + 0.6)), n = Math.min(18, Math.round(4 + area * 2.5));
    const flat = M.look === 'planks' || M.look === 'sheet' || M.look === 'plate' || M.look === 'cloth';
    for (let k = 0; k < n; k++) {
      const i = this.debrisNext;
      this.debrisNext = (i + 1) % DEBRIS_MAX;
      const x = x0 - 0.3 + rng() * (x1 - x0 + 0.6), z = z0 - 0.3 + rng() * (z1 - z0 + 0.6);
      const sx = flat ? rng.range(0.5, 1.4) : rng.range(0.12, 0.35), sy = flat ? rng.range(0.03, 0.06) : rng.range(0.08, 0.22), sz = flat ? rng.range(0.1, 0.22) : rng.range(0.12, 0.35);
      rng(); // (the height it used to roll: kept, so every pile lies as it did)
      _o.position.set(x, (this.g.fx?.ground?.(x, z) ?? 0) + sy / 2 + 0.06 + k * STEP / 2, z); // on the land; each piece of a pile half a depth step over the last (engine/depthlayers.js) _o.rotation.set(rng.range(-0.15, 0.15), rng() * Math.PI, rng.range(-0.15, 0.15)); _o.scale.set(sx, sy, sz); _o.updateMatrix();
      D.setMatrixAt(i, _o.matrix);
      _c.set(M.color).multiplyScalar(0.7 + rng() * 0.45);
      if (charred) _c.lerp(_c2.set(M.fire?.char ?? '#1a1512'), 0.85 + rng() * 0.13);
      D.setColorAt(i, _c);
      if (i + 1 > D.count) D.count = i + 1;
    }
    D.visible = true;
    D.instanceMatrix.needsUpdate = true; D.instanceColor.needsUpdate = true;
  }

  // Bits flying when something breaks or is breached.
  burst(rec, x, z, w, cause) {
    const g = this.g, M = MATERIALS[rec.mat], fx = g.fx;
    const n = Math.min(30, Math.round(8 + w * 7));
    for (let k = 0; k < n; k++) fx.spawn(3, x + (Math.random() - 0.5) * w, 0.4 + Math.random() * 1.6, z + (Math.random() - 0.5) * w, (Math.random() - 0.5) * 7, 2 + Math.random() * 4, (Math.random() - 0.5) * 7, 1.4, 0.06 + Math.random() * 0.12, M.color, 20);
    for (let k = 0; k < 3; k++) fx.spawn(2, x + (Math.random() - 0.5) * w, 0.8, z + (Math.random() - 0.5) * w, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 1.2, 0.6, M.tint, -0.3);
    if (M.sound === 'clink' || M.sound === 'ricochet') g.audio.clink?.(g.pan(x)); else g.audio.thud?.(g.pan(x));
    g.noise(x, z, cause === 'bullet' ? 18 : 26, null);
  }

  // ---- pieces (`build`) ------------------------------------------------------------------------------------------------
  // Stand a piece on the island: a wall of a material, a crate, or a shack (four walls round a door gap).
  build(kind, x, z, axis = 'x', len = null, mat = null, id = null) {
    const P = PIECES[kind];
    if (!P) throw new Error(`no piece ${kind}; pieces: ${Object.keys(PIECES).join(', ')}`);
    if (Math.abs(x) > ISL - 12 || Math.abs(z) > ISL - 12) throw new Error('pieces stand on the island only (|x|, |z| < 448)');
    id = id ?? `P${this.nextId++}`;
    const m = mat ?? P.mat;
    if (!MATERIALS[m]) throw new Error(`no material ${m}`);
    const row = { id, kind, x: r2(x), z: r2(z), axis, len: len ?? P.len ?? null, mat: m };
    this.placed.set(id, row);
    row.recs = [];
    const wall = (sub, horiz, fixed, a0, a1, h, t) => {
      const key = `piece:${id}${sub}`;
      const rec = this.wallRec({ key, mat: m, box: null, own: true, horiz, a0, a1, fixed, t, h, vis: -1, color: MATERIALS[m].color, look: MATERIALS[m].look, tag: 'piece', id });
      this.recs.set(key, rec);
      row.recs.push(key);
      this.rebuildWall(rec);
      return rec;
    };
    if (P.prop) {
      const s = (len ?? P.len) / 2, key = `piece:${id}`;
      const b = this.g.statics.add(x - s, z - s, x + s, z + s, 'piece', P.h);
      this.mine.add(b); this.explicit.set(b, m);
      const M = MATERIALS[m], hpMax = M.hpM2 * s * 2 * Math.min(2, P.h);
      const rec = { key, kind: 'prop', mat: m, box: b, own: true, slot: this.allocSlot(), hp: hpMax, hpMax, props: [], broken: false, char: 0, heat: 0, burning: false, burnLeft: 0, ramT: -9, id };
      if (rec.slot >= 0) this.pieceWrite(rec.slot, x - s, 0, z - s, x + s, P.h, z + s, M.color, M.look);
      this.recs.set(key, rec); this.boxRec.set(b, rec); row.recs.push(key);
      this.navRefresh(b.minX, b.minZ, b.maxX, b.maxZ);
    } else if (P.shack) {
      const w = P.w / 2, d = P.d / 2, t = P.t, door = P.door / 2;
      wall('back', true, z + d, x - w, x + w, P.h, t);
      wall('front1', true, z - d, x - w, x - door, P.h, t);
      wall('front2', true, z - d, x + door, x + w, P.h, t);
      wall('w', false, x - w, z - d + t / 2, z + d - t / 2, P.h, t);
      wall('e', false, x + w, z - d + t / 2, z + d - t / 2, P.h, t);
    } else {
      const L = (len ?? P.len) / 2, horiz = axis !== 'z';
      wall('', horiz, horiz ? z : x, (horiz ? x : z) - L, (horiz ? x : z) + L, P.h, P.t);
    }
    return id;
  }

  unbuild(id) {
    const row = this.placed.get(id);
    if (!row) return false;
    for (const key of row.recs) this.dropRec(this.recs.get(key));
    this.placed.delete(id);
    return true;
  }

  // Undo everything this system did to a record: its pieces go, the world's box and instance come back.
  dropRec(rec) {
    if (!rec) return;
    const g = this.g;
    this.burning.delete(rec);
    if (rec.kind === 'wall') {
      for (const p of rec.parts) { this.detach(p.box); this.freeSlot(p.slot); }
      for (const s of rec.stubs) this.freeSlot(s);
      rec.parts.length = 0; rec.stubs.length = 0;
      if (rec.box && rec.hidden) { this.attach(rec.box); this.showBatch(g.world.walls, rec.vis); rec.hidden = false; }
      const t = rec.t / 2;
      this.navRefresh(rec.horiz ? rec.a0 : rec.fixed - t, rec.horiz ? rec.fixed - t : rec.a0, rec.horiz ? rec.a1 : rec.fixed + t, rec.horiz ? rec.fixed + t : rec.a1);
    } else if (rec.kind === 'prop') {
      const b = rec.box;
      if (rec.own) { this.detach(b); this.freeSlot(rec.slot); }
      else {
        if (rec.broken) this.attach(b);
        for (const i of this.propsOf(rec)) this.showBatch(g.world.props, i);
      }
      this.navRefresh(b.minX, b.minZ, b.maxX, b.maxZ);
      if (rec.box) this.boxRec.delete(rec.box);
    } else if (rec.kind === 'door') {
      this.brokenDoors.delete(rec.id);
      const door = g.interiors.byId.get(rec.id);
      if (door?.leaves) {
        door.broken = false;
        for (const L of door.leaves) { g.interiors.leafMesh.setColorAt(L.slot, _c.set(door.color)); g.interiors.orient(L); }
        g.interiors.leafMesh.instanceColor.needsUpdate = true;
        g.interiors.flush();
      }
    }
    this.recs.delete(rec.key);
  }

  // ---- save -----------------------------------------------------------------------------------------------------------
  save() {
    const recs = {};
    for (const [key, rec] of this.recs) {
      if (rec.kind === 'wall') {
        const changed = rec.gaps.length || rec.char > 0 || rec.burning || rec.cells.some((v) => v < rec.cellHp);
        if (!changed && !rec.own) continue;
        recs[key] = { c: Array.from(rec.cells, (v) => Math.round(v)), g: rec.gaps, ch: r2(rec.char), bu: rec.burning ? r1(rec.burnLeft) : 0, bo: rec.burntOut ? 1 : 0 };
      } else {
        if (!rec.own && !rec.broken && rec.hp >= rec.hpMax && !rec.char && !rec.burning) continue;
        recs[key] = { hp: Math.round(rec.hp), b: rec.broken ? 1 : 0, ch: r2(rec.char), bu: rec.burning ? r1(rec.burnLeft) : 0 };
      }
    }
    const placed = [...this.placed.values()].map(({ recs: _r, ...row }) => row);
    return { v: 1, next: this.nextId, placed, recs, blood: this.blood.save() };
  }

  reset() {
    for (const rec of [...this.recs.values()]) this.dropRec(rec);
    this.recs.clear(); this.placed.clear(); this.burning.clear(); this.brokenDoors.clear();
    for (const door of this.g.interiors.doors) if (door.broken) { door.broken = false; for (const L of door.leaves) this.g.interiors.orient(L); }
    this.g.interiors.flush();
    for (let i = 0; i < DEBRIS_MAX; i++) this.debrisMesh.setMatrixAt(i, ZERO);
    this.debrisMesh.count = 0; this.debrisMesh.visible = false; this.debrisNext = 0;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
  }

  load(s) {
    this.reset();
    if (!s) { this.blood.load(null); return; }
    this.nextId = s.next ?? 1;
    for (const row of s.placed ?? []) this.build(row.kind, row.x, row.z, row.axis, row.len, row.mat, row.id);
    // The island's own boxes by key (this system's pieces are not among them).
    const idx = new Map();
    for (const b of this.g.statics.boxes) if (!this.mine.has(b)) idx.set(this.keyOf(b), b);
    for (const [key, v] of Object.entries(s.recs ?? {})) {
      let rec = this.recs.get(key);
      if (!rec && key.startsWith('door:')) {
        const id = key.slice(5), door = this.g.interiors.byId.get(id);
        if (door?.leaves) rec = this.doorRec(door);
        else { // a ring door away from you: what happened to it waits until it attaches again
          if (v.b) this.brokenDoors.add(id);
          rec = { key, kind: 'door', id, mat: 'wood', hp: v.hp, hpMax: v.hp, broken: !!v.b, char: v.ch ?? 0, heat: 0, burning: false, burnLeft: 0, x: 0, z: 0, w: 1, axis: 'x' };
          this.recs.set(key, rec);
          continue;
        }
      }
      if (!rec) { const b = idx.get(key); if (b) rec = this.recOf(b); }
      if (!rec) continue;
      rec.char = v.ch ?? 0;
      if (rec.kind === 'wall') {
        if (v.c?.length === rec.n) rec.cells.set(v.c);
        rec.burntOut = !!v.bo;
        if (v.g?.length || rec.char) { rec.gaps = v.g ? v.g.map((q) => [q[0], q[1]]) : []; this.rebuildWall(rec); }
        if (v.g?.length) {
          const t = rec.t / 2;
          if (!this.spans(rec).length) rec.broken = true;
          // The same bits on the floor as when it went (seeded by the wall and the gap).
          for (const [lo, hi] of rec.gaps) this.debris(`${rec.key}:${r2(lo)}`, rec.horiz ? lo : rec.fixed - t, rec.horiz ? rec.fixed - t : lo, rec.horiz ? hi : rec.fixed + t, rec.horiz ? rec.fixed + t : hi, rec.mat, rec.char > 0.6);
        }
      } else {
        rec.hp = v.hp ?? rec.hp;
        if (v.b) { if (rec.kind === 'door') this.breakDoor(rec, 'load', null, true); else this.breakProp(rec, 'load', null, true); }
      }
      if (rec.char) this.paintChar(rec);
      if (v.bu > 0 && !rec.broken) { rec.burnLeft = v.bu; this.ignite(rec, null); }
    }
    this.stats.broken = 0;
    this.blood.load(s.blood ?? null);
  }

  // ---- what the agent sees ------------------------------------------------------------------------------------------
  rowView(key) {
    const M = MATERIALS[key];
    if (!M) return null;
    return { key, name: M.name, stop: Number.isFinite(M.stop) ? M.stop : 'everything', ricochet: M.ricochet, ricAngle: M.ricAngle, spray: M.spray, hpM2: M.hpM2, breaks: M.breaks, breach: M.breach, blastRes: M.blastRes, burns: !!M.fire, fire: M.fire, sound: M.sound };
  }
  recView(rec) {
    if (!rec) return null;
    const v = { kind: rec.kind, key: rec.key, broken: !!rec.broken, char: r2(rec.char), burning: !!rec.burning, burnLeft: rec.burning ? r1(rec.burnLeft) : 0 };
    if (rec.kind === 'wall') Object.assign(v, { length: r2(rec.a1 - rec.a0), height: r2(rec.h), strips: Array.from(rec.cells, (c) => Math.max(0, Math.round(c))), stripHp: Math.round(rec.cellHp), gaps: rec.gaps, spans: this.spans(rec).map(([a, b]) => [r2(a), r2(b)]) });
    else Object.assign(v, { hp: Math.max(0, Math.round(rec.hp)), hpMax: Math.round(rec.hpMax) });
    return v;
  }
  boxView(b, x = null, z = null) {
    const c = this.classify(b, x, z);
    const rec = this.boxRec.get(b) ?? (this.breakable(b) ? null : undefined);
    return { thing: b.tag, box: { x0: r2(b.minX), z0: r2(b.minZ), x1: r2(b.maxX), z1: r2(b.maxZ), h: r2(b.height) }, island: this.inIsland(b), material: c.key, why: c.why,
      row: this.rowView(c.key), breakable: this.breakable(b), state: rec ? this.recView(rec) : rec === null ? 'whole' : 'does not break' };
  }

  // What is at (x, z): a door or window there, else the box under the point or the nearest within 1.5 m.
  at(x, z) {
    const g = this.g, S = g.statics, I = g.interiors;
    for (const d of I.doors) if (Math.hypot(d.x - x, d.z - z) < d.width / 2 + 0.3) return this.opView(d.leaves[0]);
    for (const w of I.windows) if (Math.hypot(w.x - x, w.z - z) < w.half + 0.2) return this.opView(w);
    let best = null, bd = 1.5;
    const visit = (list) => { for (let i = 0; i < list.length; i++) { const b = list[i]; if (b.op) continue; const qx = Math.max(b.minX, Math.min(x, b.maxX)), qz = Math.max(b.minZ, Math.min(z, b.maxZ)), d = Math.hypot(qx - x, qz - z); if (d < bd || (d === 0 && best && b.height > best.height)) { bd = d; best = b; } } };
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      if (Math.abs(x) < 470 && Math.abs(z) < 470) visit(S.cells[Math.min(S.n - 1, Math.max(0, S.ci(z) + oz)) * S.n + Math.min(S.n - 1, Math.max(0, S.ci(x) + ox))]);
      visit(S.chunkCell(Math.floor(x / S.cell) + ox, Math.floor(z / S.cell) + oz));
    }
    if (best) return { at: { x: r1(x), z: r1(z) }, dist: r2(bd), ...this.boxView(best, x, z) };
    const v = g.vehicles.find((q) => Math.hypot(q.x - x, q.z - z) < q.len / 2 + 0.3);
    if (v) return this.vehicleView(v);
    return { at: { x: r1(x), z: r1(z) }, thing: null, material: null, why: 'nothing solid within 1.5 m: open ground' };
  }

  opView(op) {
    const g = this.g;
    if (op.kind === 'leaf') {
      const door = op.door, key = this.opMaterial(op), rec = this.recs.get(`door:${door.id}`);
      return { thing: 'door', id: door.id, material: key, why: `a ${door.material === 'metal' ? 'steel' : 'wooden'} door (its row in world/city.js or the ring)`, row: this.rowView(key),
        state: rec ? this.recView(rec) : door.broken ? 'broken' : 'whole', door: g.interiors.doorView(door) };
    }
    const key = this.opMaterial(op);
    return { thing: 'window', id: op.id, material: key, why: op.state === 'boarded' ? 'boards nailed across a window' : op.state === 'shattered' ? 'an empty window frame: nothing in it' : 'window glass', row: key ? this.rowView(key) : null, window: g.interiors.windowView(op) };
  }

  vehicleView(v) {
    const g = this.g, plates = v.plates ?? {};
    const facings = ['front', 'rear', 'left', 'right'].map((f) => ({ facing: f, material: (plates[f] ?? 0) > 0 ? R.car.plated : R.car.body }));
    return { thing: 'vehicle', id: v.id, name: v.name, material: R.car.body, why: 'a car: body panels, glass, tyres; plated facings are steel (systems/garage.js)',
      parts: { panels: facings, glass: R.car.glass, tyres: R.car.tyres }, rows: { [R.car.body]: this.rowView(R.car.body), [R.car.plated]: this.rowView(R.car.plated), glass: this.rowView('glass'), rubber: this.rowView('rubber') } };
  }

  pieceView(id) {
    const row = this.placed.get(id);
    if (!row) return null;
    const { recs, ...r } = row;
    return { ...r, material: row.mat, row: this.rowView(row.mat), parts: recs.map((k) => this.recView(this.recs.get(k))) };
  }

  // Every island box by material (what the rules say the island is made of).
  census() {
    const out = {};
    for (const b of this.g.statics.boxes) { if (b.op) continue; const k = this.classify(b).key; out[k] = (out[k] ?? 0) + 1; }
    return out;
  }
}
