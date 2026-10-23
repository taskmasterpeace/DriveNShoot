import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../engine/rng.js';
import { sandTexture, asphaltTexture, concreteTexture, radialGlow } from './textures.js';
import { nearWater } from './water.js';
import { nearRail } from './rail.js';
import { DOOR_MATERIALS, WINDOW, WINDOW_MIX } from '../data/interiors.js';
import { roofSurface, wallSurface } from './surfaces.js';
import { HOLDOUT } from '../data/holdout.js';
import { PROGRAMMES, SCATTER } from '../data/floorplans.js';
import { FURNITURE } from '../data/ring.js';
import { floorplan } from './floorplan.js';
import { furnishRooms, placePiece } from './furnish.js';
import { hash32, rngOf } from './geo.js';
import { riseOf } from './storeys.js';
import { plantIsland } from './flora.js';

// ---------------------------------------------------------------------------
// World layout (units = metres, XZ ground plane, +Y up)
//   Road grid every 80m from -320..320. Centre 4 blocks = RUST HAVEN (walled
//   settlement). Ring of 32 blocks = OLD PHOENIX RUINS. Outer ring + beyond =
//   THE GLASS FLATS desert with raider camps.
// ---------------------------------------------------------------------------
export const HALF = 450;
export const GRID = 320;
export const SPACING = 80;
export const ROAD_W = 14;
export const TOWN = 88;
// The Phoenix island (docs/design/WEB_STREAMING.md §3.4): everything this file builds lies inside |x|,|z| <= 464. Past
// it the world is streamed (world/streamer.js); Route 66 meets I-10 at the island's edge.
export const ISLAND = 464;
export const roadLines = [];
for (let c = -GRID; c <= GRID; c += SPACING) roadLines.push(c);

export const H_NAMES = ['DEAD MAN RD', 'CINDER ST', 'ASH AVE', 'BONE ST', 'ROUTE 66', 'RUST ST', 'GALLOWS RD', 'SALT ST', 'LAST CHANCE RD'];
export const V_NAMES = ['VULTURE AVE', 'CACTUS ST', 'OLD MILL RD', 'HAVEN ST', 'CENTRAL AVE', 'IRON ST', 'MESA DR', 'COYOTE RD', 'END OF THE LINE'];

// Past the island the streamer names the place (the interstate and its mile, an exit, a dead town, the open desert)
// and the state (WorldIndex.nameAt / regionAt). Null until the streamer exists.
export const OUTSIDE = { name: null, region: null };
const outside = (x, z) => Math.abs(x) > ISLAND || Math.abs(z) > ISLAND;

export function locationName(x, z) {
  if (OUTSIDE.name && outside(x, z)) return OUTSIDE.name(x, z);
  for (let k = 0; k < roadLines.length; k++) {
    const c = roadLines[k];
    const span = k === 4 ? HALF : GRID + 8;
    if (Math.abs(z - c) < ROAD_W / 2 && Math.abs(x) < span) return H_NAMES[k];
    if (Math.abs(x - c) < ROAD_W / 2 && Math.abs(z) < GRID + 8) return V_NAMES[k];
  }
  return districtName(x, z);
}

export function districtName(x, z) {
  if (OUTSIDE.region && outside(x, z)) return OUTSIDE.region(x, z);
  const m = Math.max(Math.abs(x), Math.abs(z));
  if (m < TOWN) return 'RUST HAVEN';
  if (m < GRID - 70) return 'OLD PHOENIX RUINS';
  return 'THE GLASS FLATS';
}

// Collects boxes for one InstancedMesh. One draw call per batch, however many boxes.
class BoxBatch {
  constructor() { this.items = []; }
  add(cx, cy, cz, sx, sy, sz, color, rotY = 0) {
    this.items.push({ cx, cy, cz, sx, sy, sz, color: new THREE.Color(color), rotY });
    return this.items.length - 1;
  }
  build(geo, mat, { cast = true, receive = true } = {}) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, this.items.length));
    const o = new THREE.Object3D();
    this.items.forEach((b, i) => {
      o.position.set(b.cx, b.cy, b.cz);
      o.rotation.set(0, b.rotY, 0);
      o.scale.set(b.sx, b.sy, b.sz);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, b.color);
    });
    mesh.count = this.items.length;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.mesh = mesh;
    return mesh;
  }
}

// Rust Haven is rebuilt and painted: adobe, limewash, turquoise and sage trim, the colours a desert town paints itself.
// The ruins are bleached concrete and the last of the old paint. (Robert, 2026-10-23: "I want more colors". Lengths are
// free to change: a pick is one draw from the stream whatever the list, so the island's layout does not move.)
// Paving is UV-mapped from world position so its 8 m slabs line up across separate pieces (a block's sidewalk strips, a
// plaza square).
const SIDEWALK = 3.5;
const flatUV = (g) => { const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (SPACING - ROAD_W), -p.getZ(i) / (SPACING - ROAD_W)); };
const TOWN_COLORS = ['#c98a5a', '#7fa39a', '#d8b98a', '#b8624a', '#e2cfa8', '#6f9fb0', '#d29a52', '#9fb07c'];
const RUIN_COLORS = ['#a39b8d', '#b4a994', '#8e877c', '#c1b49b', '#9a8c78', '#857f76', '#a88e78'];
const ROOF_TOWN = ['#8a5a3a', '#6a7470', '#9a8060', '#7a5236', '#857868'];

export function buildWorld(scene, statics) {
  const rng = makeRng(1977);
  // Doors, locks and windows draw from their own stream: the main one must make exactly the same
  // calls as it always has, or every building, prop and spawn in the world would shift.
  const orng = makeRng(2718);
  const doorRows = [], windowRows = [];
  const walls = new BoxBatch();
  const roofs = new BoxBatch();
  const floors = new BoxBatch();
  const props = new BoxBatch();
  const barrels = [];
  const cacti = [];
  const trunks = [];
  const glows = []; // {x,z,r,color}
  const fires = []; // {x,z}
  const buildings = [];
  const spawns = { drifters: [], raiders: [], camps: [], wardens: [], loot: [], parking: [], shops: [], beds: [] };
  const sidewalkGeos = [];
  const townPlazas = [], townLots = [], liveTrees = []; // the holdout's open ground (data/holdout.js), filled after everything else

  // ---- ground --------------------------------------------------------------
  const sand = sandTexture();
  sand.repeat.set(HALF * 2 / 28, HALF * 2 / 28);
  const groundMat = new THREE.MeshStandardMaterial({ map: sand, roughness: 0.96, metalness: 0 });
  // The island's own ground stops at its edge (streamed chunks carry the sand on from there). Its UVs keep the old
  // 1,300 m plane's mapping, (x + 650) / 1300, so the sand lies exactly where it always did and the chunks match it.
  const groundGeo = new THREE.PlaneGeometry(ISLAND * 2, ISLAND * 2);
  { const uv = groundGeo.attributes.uv, k = (ISLAND * 2) / 1300, o = (650 - ISLAND) / 1300; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k + o, uv.getY(i) * k + o); }
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- roads (merged into a single mesh) -----------------------------------
  const roadGeos = [];
  const roadPiece = (cx, cz, len, vertical, y) => {
    const g = new THREE.PlaneGeometry(len, ROAD_W);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / ROAD_W));
    g.rotateX(-Math.PI / 2);
    if (vertical) g.rotateY(Math.PI / 2);
    g.translate(cx, y, cz);
    roadGeos.push(g);
  };
  roadLines.forEach((c, k) => {
    const lenH = k === 4 ? ISLAND * 2 : GRID * 2 + ROAD_W; // Route 66 ends at the island's edge, where I-10 picks it up
    roadPiece(0, c, lenH, false, 0.03);
    roadPiece(c, 0, GRID * 2 + ROAD_W, true, 0.04);
  });
  const asphalt = asphaltTexture();
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9 });
  const roads = new THREE.Mesh(mergeGeometries(roadGeos), roadMat);
  roads.receiveShadow = true;
  scene.add(roads);

  // ---- buildings -------------------------------------------------------------
  const WALL_T = 0.5;
  const addWall = (x0, z0, x1, z1, h, color, tag = 'wall') => {
    const minX = Math.min(x0, x1) - WALL_T / 2, maxX = Math.max(x0, x1) + WALL_T / 2;
    const minZ = Math.min(z0, z1) - WALL_T / 2, maxZ = Math.max(z0, z1) + WALL_T / 2;
    if (maxX - minX < 0.6 && maxZ - minZ < 0.6) return;
    walls.add((minX + maxX) / 2, h / 2, (minZ + maxZ) / 2, maxX - minX, h, maxZ - minZ, color);
    statics.add(minX, minZ, maxX, maxZ, tag, h);
  };

  // The visible piece of a wall span with EXACT extents along its axis (addWall grows a span by half
  // the wall's thickness at each end so corners overlap; the pieces between windows must not).
  const wallPiece = (horizontal, fixed, a0, a1, y0, y1, color) => {
    if (a1 - a0 < 0.05) return;
    const minX = horizontal ? a0 : fixed - WALL_T / 2, maxX = horizontal ? a1 : fixed + WALL_T / 2;
    const minZ = horizontal ? fixed - WALL_T / 2 : a0, maxZ = horizontal ? fixed + WALL_T / 2 : a1;
    walls.add((minX + maxX) / 2, (y0 + y1) / 2, (minZ + maxZ) / 2, maxX - minX, y1 - y0, maxZ - minZ, color);
  };

  // Door gaps: a shop's double front door keeps the old 2.6 m gap (2.1 m clear between the wall
  // ends); back doors and inner doorways are single doors in a 1.9 m gap (1.4 m clear), centred on a
  // half-metre so a 1 m nav cell always sits in the opening (walkers' paths go through it).
  const DOOR_GAP = 2.6, SINGLE_GAP = 1.9;
  const snapHalf = (v) => Math.round(v - 0.5) + 0.5;
  const OUT = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };

  // Side wall from a to b along one axis, with door gaps [{ at, w }]. The collapse rolls keep the old
  // 2.6 m geometry so the seeded ruins never move; intact spans are queued on the building (b.pend)
  // and built once its partition is known, so windows can be cut into them.
  const sideWithGaps = (bld, side, horizontal, fixed, a, b, gaps, h, color, ruined) => {
    let cur = a, curA = a, prev = null;
    const sorted = gaps.slice().sort((p, q) => p.at - q.at);
    const segs = [];
    for (const g of sorted) { segs.push({ s: cur, e: g.at - DOOR_GAP / 2, sa: curA, ea: g.at - g.w / 2, gl: prev, gr: g }); cur = g.at + DOOR_GAP / 2; curA = g.at + g.w / 2; prev = g; }
    segs.push({ s: cur, e: b, sa: curA, ea: b, gl: prev, gr: null });
    for (const sg of segs) {
      const { s, e } = sg;
      if (e - s < 0.3) continue;
      if (ruined && rng.chance(0.3)) {
        // Collapsed span: leave a low stub and rubble. A doorway in a fallen wall has no door left.
        if (sg.gl) sg.gl.broken = true;
        if (sg.gr) sg.gr.broken = true;
        const mid = (s + e) / 2, S = sg.sa, E = sg.ea;
        const hh = rng.range(0.6, 1.6);
        if (hh > 1.1) {
          if (horizontal) addWall(S, fixed, E, fixed, hh, color);
          else addWall(fixed, S, fixed, E, hh, color);
        } else {
          // Knee-high rubble: visible, but you can step over it (a breach in the ruin).
          const lx = horizontal ? (S + E) / 2 : fixed, lz = horizontal ? fixed : (S + E) / 2;
          walls.add(lx, hh / 2, lz, horizontal ? E - S : WALL_T, hh, horizontal ? WALL_T : E - S, color);
        }
        for (let r = 0; r < 3; r++) {
          const ox = horizontal ? mid + rng.range(-2, 2) : fixed + rng.range(-1.5, 1.5);
          const oz = horizontal ? fixed + rng.range(-1.5, 1.5) : mid + rng.range(-2, 2);
          props.add(ox, 0.25, oz, rng.range(0.6, 1.4), rng.range(0.3, 0.6), rng.range(0.6, 1.4), color, rng() * 3);
        }
        continue;
      }
      bld.pend.push({ side, horizontal, fixed, s: sg.sa, e: sg.ea, h, color });
    }
  };

  // Window: the wall gives way to a knee-high sill and an opening up to the wall top, so it reads from
  // the top-down camera. For collision the wall stays whole (nobody walks through a window, so the nav
  // grid is honest); the opening is a hole in it that sight, bullets and high throws pass (buildSpans).
  // The glass, boards and their state live in systems/interiors.js.
  const SILL_TINT = new THREE.Color('#c9b896');
  const addWindow = (bld, side, horizontal, fixed, c, color) => {
    const W2 = WINDOW.width / 2;
    wallPiece(horizontal, fixed, c - W2, c + W2, 0, WINDOW.sill, `#${new THREE.Color(color).lerp(SILL_TINT, 0.32).getHexString()}`);
    const x = horizontal ? c : fixed, z = horizontal ? fixed : c;
    const mix = WINDOW_MIX[bld.ruined ? 'ruined' : bld.district === 'town' ? 'town' : 'ruins'];
    const r = orng();
    const state = r < mix[0] ? 'intact' : r < mix[0] + mix[1] ? 'shattered' : 'boarded';
    windowRows.push({ id: `w${windowRows.length + 1}`, x, z, axis: horizontal ? 'x' : 'z', width: WINDOW.width, nx: OUT[side][0], nz: OUT[side][1],
      state, boardSide: orng.chance(0.75) ? -1 : 1, b: buildings.length, wallH: bld.h });
  };

  // Build a building's queued wall spans, windows cut in. A planned building (all of them now: docs/design/
  // WEB_FLOORPLANS.md "The island") gives each room's stretch of outside wall its own windows, between the partitions
  // that meet that wall, so no partition ends at a window: centred in equal sub-stretches of >= 3 m (0.7 m of wall to
  // each side), at most 3 a stretch; a stair hall's outside wall has none (its flight runs up it). Each span is ONE
  // collision box (as before windows) carrying its window openings as holes.
  const buildSpans = (bld, junctions, noWin) => {
    for (const sp of bld.pend) {
      const { side, horizontal, fixed, h, color } = sp;
      const p0 = sp.s - WALL_T / 2, p1 = sp.e + WALL_T / 2;
      const holes = [], at = [];
      if (!noWin(side, sp)) {
        const cuts = junctions.filter((j) => j.horizontal !== horizontal && Math.abs(j.wall - fixed) < 0.01 && j.at > sp.s + 0.05 && j.at < sp.e - 0.05).map((j) => j.at).sort((a, b) => a - b);
        let a = sp.s;
        for (const j of [...cuts, null]) {
          const b2 = j === null ? sp.e : j - WALL_T / 2, sl = b2 - a, n = Math.min(3, Math.floor(sl / 3.0));
          for (let k = 0; k < n; k++) at.push(a + (k + 0.5) * (sl / n));
          if (j !== null) a = j + WALL_T / 2;
        }
      }
      let cur = p0;
      for (const c of at) {
        if (!orng.chance(0.75)) continue;
        wallPiece(horizontal, fixed, cur, c - WINDOW.width / 2, 0, h, color);
        addWindow(bld, side, horizontal, fixed, c, color);
        holes.push(c - WINDOW.width / 2, c + WINDOW.width / 2);
        cur = c + WINDOW.width / 2;
      }
      wallPiece(horizontal, fixed, cur, p1, 0, h, color);
      const box = statics.add(horizontal ? p0 : fixed - WALL_T / 2, horizontal ? fixed - WALL_T / 2 : p0, horizontal ? p1 : fixed + WALL_T / 2, horizontal ? fixed + WALL_T / 2 : p1, 'wall', h);
      if (holes.length) { box.holes = holes; box.holeX = horizontal; box.sill = WINDOW.sill; }
    }
    bld.pend = null;
  };

  // A door row: the data systems/interiors.js hangs leaves from. width = the clear opening.
  const addDoor = (bld, kind, axis, x, z, gapW, nx, nz) => {
    const row = {
      id: `d${doorRows.length + 1}`, kind, x, z, axis, width: gapW - WALL_T, leaves: kind === 'front' ? 2 : 1, hinge: orng.chance(0.5) ? -1 : 1,
      material: orng.chance(bld.district === 'town' ? 0.3 : 0.5) ? 'metal' : 'wood', locked: false, open: 0, nx, nz, b: buildings.length,
    };
    row.color = orng.pick(DOOR_MATERIALS[row.material].colors);
    doorRows.push(row);
    return row;
  };

  // The old shell's furniture rolls, drawn and thrown away: the main stream makes exactly the calls it always did (the
  // count depends on where the old doors and the old partition's doorway were), so nothing placed after a building moves.
  const replayFurnish = (b, oldDoors, oldInner, district) => {
    const { minX, maxX, minZ, maxZ } = b;
    const n = Math.floor(((maxX - minX) * (maxZ - minZ)) / 70);
    for (let i = 0; i < n; i++) {
      const x = rng.range(minX + 1.6, maxX - 1.6), z = rng.range(minZ + 1.6, maxZ - 1.6);
      if (oldDoors.some((d) => Math.hypot(d.x - x, d.z - z) < 4.8) || oldInner.some((d) => Math.hypot(d.x - x, d.z - z) < 3.2)) continue;
      if (rng.int(0, 3) === 2) rng();
    }
    const lootN = district === 'town' ? 1 : rng.int(1, 2);
    for (let i = 0; i < lootN; i++) { rng(); rng(); }
    return lootN;
  };

  // ---- the island's floor plans (data/floorplans.js, the island rows; world/floorplan.js; WEB_FLOORPLANS.md "The
  // island"). The plan, its doors' places, the inner doors, the furniture and the keeper's post come from the building's
  // own streams (rngOf, seeded by where it stands); the main stream draws exactly what it always drew.
  const PR = PROGRAMMES;
  const pickRow = (r, rows) => { let t = 0; for (const q of rows) t += q[1]; let p = r() * t; for (const q of rows) if ((p -= q[1]) < 0) return q[0]; return rows[rows.length - 1][0]; };
  // The plan for a footprint: a stair hall when the building will rise (world/storeys.js riseOf), along a side wall (not the
  // one a back door was rolled for), else across the back; a building that cannot take one does not rise.
  const planFor = (b, kind, front, backSide, rises, seed, pr) => {
    const ns = front === 'N' || front === 'S';
    const opt = { x0: b.minX, z0: b.minZ, x1: b.maxX, z1: b.maxZ, front, kind, units: 1, seed, T: WALL_T, door: DOOR_GAP, innerDoor: SINGLE_GAP, backDoor: SINGLE_GAP };
    const sideOf = { lo: ns ? 'W' : 'N', hi: ns ? 'E' : 'S', back: { N: 'S', S: 'N', W: 'E', E: 'W' }[front] };
    if (rises) {
      const order = pr() < 0.5 ? ['lo', 'hi', 'back'] : ['hi', 'lo', 'back'];
      for (const st of order) {
        if (sideOf[st] === backSide) continue;
        const FP = floorplan({ ...opt, stair: st });
        if (FP.plans[0] !== 'open') return { FP, stairSide: sideOf[st] };
      }
    }
    return { FP: floorplan(opt), stairSide: null, noRise: rises };
  };
  // A back door's place on its wall (centre line `fixed`, from a to b): the plan's own (a kitchen's, a stock room's, the
  // hall's end) first, else the middle of the longest stretch of that wall between partitions, clear of every corner by
  // 1.65 m (the ruins' collapse rolls keep their count) and of the stair hall.
  const backAt = (FP, side, a, b, stairRoom) => {
    const ok = (at) => at > a + 1.65 && at < b - 1.65;
    const c = FP.back.find((q) => q.side === side && ok(q.at));
    if (c) return c.at;
    const horiz = side === 'N' || side === 'S', fixed = { N: FP.box.z0, S: FP.box.z1, W: FP.box.x0, E: FP.box.x1 }[side];
    const cuts = FP.inner.filter((P) => P.horizontal !== horiz && (Math.abs(P.a0 - fixed) < 0.01 || Math.abs(P.a1 - fixed) < 0.01)).map((P) => P.fixed).sort((p, q) => p - q);
    let best = null, lo = a + WALL_T / 2;
    for (const j of [...cuts, null]) {
      const hi = j === null ? b - WALL_T / 2 : j - WALL_T / 2, s0 = Math.max(lo + 0.35 + SINGLE_GAP / 2, a + 1.7), s1 = Math.min(hi - 0.35 - SINGLE_GAP / 2, b - 1.7);
      const mid = (lo + hi) / 2, inStair = stairRoom && (horiz ? mid > stairRoom.x0 && mid < stairRoom.x1 : mid > stairRoom.z0 && mid < stairRoom.z1);
      if (s1 >= s0 && !inStair) { const at = Math.min(s1, Math.max(s0, snapHalf(mid))); if (!best || hi - lo > best.len) best = { at, len: hi - lo }; }
      if (j !== null) lo = j + WALL_T / 2;
    }
    return best ? best.at : snapHalf((a + b) / 2);
  };

  const makeEnterable = (cx, cz, w, d, district, shopName, prog = null) => {
    const minX = cx - w / 2, maxX = cx + w / 2, minZ = cz - d / 2, maxZ = cz + d / 2;
    const ruined = district === 'ruins' && rng.chance(0.55);
    const h = district === 'town' ? rng.range(4.2, 5.2) : rng.range(4, 6);
    const color = district === 'town' ? rng.pick(TOWN_COLORS) : rng.pick(RUIN_COLORS);
    const b = { minX, maxX, minZ, maxZ, enterable: true, roofIdx: [], doors: [], innerDoors: [], ruined, district, h, shopName, inside: false, pend: [], color }; // color: world/storeys.js builds the floors above in it
    // Doors: always face the nearest road on at least one side. The rolls are the old ones (the main stream); where the
    // doors end up along their walls is the plan's.
    const nearestRoad = (v) => roadLines.reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best), roadLines[0]);
    const dxRoad = Math.abs(nearestRoad(cx) - cx) - w / 2, dzRoad = Math.abs(nearestRoad(cz) - cz) - d / 2;
    const old = { N: [], S: [], E: [], W: [] };
    const front = dxRoad < dzRoad ? (nearestRoad(cx) > cx ? 'E' : 'W') : (nearestRoad(cz) > cz ? 'S' : 'N');
    if (dxRoad < dzRoad) old[front].push(cz + rng.range(-d / 4, d / 4));
    else old[front].push(cx + rng.range(-w / 4, w / 4));
    let backSide = null;
    if (rng.chance(0.5)) { // back door
      const s = rng.pick(['N', 'S', 'E', 'W']);
      if (!old[s].length) { old[s].push((s === 'N' || s === 'S' ? cx : cz) + rng.range(-1.5, 1.5)); backSide = s; }
    }
    // The plan: its own stream, from where the building stands.
    const seed = hash32(0x15a1d, Math.round(cx * 100), Math.round(cz * 100));
    const pr = rngOf(seed ^ 0x9e3779b9);
    const kind = prog ?? pickRow(pr, PR.ruins);
    const rise = !ruined ? riseOf({ minX, maxX, minZ, maxZ, district }) : null;
    const { FP, stairSide, noRise } = planFor(b, kind, front, backSide, !!rise, seed, pr);
    FP.box = { x0: minX, z0: minZ, x1: maxX, z1: maxZ };
    const stairRoom = FP.rooms.find((r) => r.type === 'stair') ?? null;
    if (noRise) b.noRise = true; // the rise roll said yes, but no stair hall fits this plan: it stays one storey
    const sides = { N: [], S: [], E: [], W: [] };
    sides[front].push(FP.front[0]);
    if (backSide) { const horiz = backSide === 'N' || backSide === 'S'; sides[backSide].push(backAt(FP, backSide, horiz ? minX : minZ, horiz ? maxX : maxZ, stairRoom)); }
    // The shop front is a double door; a back door is a single one, its gap on a nav cell centre.
    const gaps = {};
    for (const s of ['N', 'S', 'W', 'E']) gaps[s] = sides[s].map((at) => (s === front ? { at, w: DOOR_GAP, kind: 'front', side: s } : { at: snapHalf(at), w: SINGLE_GAP, kind: 'back', side: s }));
    const s0 = statics.boxes.length;
    sideWithGaps(b, 'N', true, minZ, minX, maxX, gaps.N, h, color, ruined);
    sideWithGaps(b, 'S', true, maxZ, minX, maxX, gaps.S, h, color, ruined);
    sideWithGaps(b, 'W', false, minX, minZ, maxZ, gaps.W, h, color, ruined);
    sideWithGaps(b, 'E', false, maxX, minZ, maxZ, gaps.E, h, color, ruined);
    for (const x of sides.N) b.doors.push({ x, z: minZ - 1.2 });
    for (const x of sides.S) b.doors.push({ x, z: maxZ + 1.2 });
    for (const z of sides.W) b.doors.push({ x: minX - 1.2, z });
    for (const z of sides.E) b.doors.push({ x: maxX + 1.2, z });
    // The old partition's rolls (thrown away; the replayed furniture below needs where its doorway was).
    const oldInner = [];
    if (w > 15) {
      let px = cx + rng.range(-w / 6, w / 6);
      for (const dd of [...old.N, ...old.S]) if (Math.abs(dd - px) < 2.8) px = dd + (px >= dd ? 2.8 : -2.8);
      px = Math.min(maxX - 2, Math.max(minX + 2, px));
      oldInner.push({ x: px, z: cz + rng.range(-d / 4, d / 4) });
      if (ruined) rng();
    }
    // The plan's partitions with their doorways (a ruin may have lost some: the doorway goes with its wall).
    const inner = FP.inner.filter(() => !(ruined && pr() < PR.lose));
    const PH = h * 0.92;
    for (const P of inner) {
      const gs = P.gaps.slice().sort((p, q) => p.at - q.at);
      let cur = P.a0 + WALL_T / 2;
      const seg = (e) => {
        if (e - cur < 0.2) return;
        const x0 = P.horizontal ? cur : P.fixed - WALL_T / 2, x1 = P.horizontal ? e : P.fixed + WALL_T / 2, z0 = P.horizontal ? P.fixed - WALL_T / 2 : cur, z1 = P.horizontal ? P.fixed + WALL_T / 2 : e;
        walls.add((x0 + x1) / 2, PH / 2, (z0 + z1) / 2, x1 - x0, PH, z1 - z0, color);
        statics.add(x0, z0, x1, z1, 'wall', PH);
      };
      for (const gp of gs) { seg(gp.at - gp.w / 2); cur = gp.at + gp.w / 2; b.innerDoors.push({ x: P.horizontal ? gp.at : P.fixed, z: P.horizontal ? P.fixed : gp.at, horizontal: P.horizontal, w: gp.w }); }
      seg(P.a1 - WALL_T / 2);
    }
    const junctions = inner.flatMap((P) => [{ horizontal: P.horizontal, wall: P.a0, at: P.fixed }, { horizontal: P.horizontal, wall: P.a1, at: P.fixed }]);
    buildSpans(b, junctions, (side) => stairSide === side);
    const wallBoxes = statics.boxes.slice(s0).map((q) => ({ x0: q.minX, z0: q.minZ, x1: q.maxX, z1: q.maxZ, h: q.height, base: 0, tag: 'wall' }));
    // A leaf in every doorway (but one whose wall has fallen: nothing left to hang it on), and locks: some back and inner
    // doors (the rule that no room is ever locked off is kept below, once the furniture is in). Front doors never lock.
    const fixedOf = { N: minZ, S: maxZ, W: minX, E: maxX };
    const mine = [], gdoors = [];
    for (const s of ['N', 'S', 'W', 'E']) for (const g of gaps[s]) {
      const horiz = s === 'N' || s === 'S';
      const x = horiz ? g.at : fixedOf[s], z = horiz ? fixedOf[s] : g.at;
      gdoors.push({ x, z, nx: OUT[s][0], nz: OUT[s][1], w: g.w, kind: g.kind, barricade: false });
      const row = g.broken ? null : addDoor(b, g.kind, horiz ? 'x' : 'z', x, z, g.w, OUT[s][0], OUT[s][1]);
      if (row?.kind === 'back' && orng.chance(0.45)) row.locked = true;
      if (row) mine.push(row);
    }
    for (const dd of b.innerDoors) {
      const row = addDoor(b, 'inner', dd.horizontal ? 'x' : 'z', dd.x, dd.z, SINGLE_GAP, dd.horizontal ? 0 : 1, dd.horizontal ? 1 : 0);
      if (orng.chance(0.35)) row.locked = true;
      mine.push(row);
    }
    const rooms = FP.rooms.map((r) => ({ type: r.type, name: r.name, x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, ui: 0, unit: null, frontRoom: r.entry }));
    floors.add(cx, 0.07, cz, w, 0.1, d, district === 'town' ? rng.pick(['#8a6a4a', '#9a8670', '#7a6a58']) : '#6e665c');
    if (!ruined) {
      b.roofIdx.push(roofs.add(cx, h + 0.2, cz, w + 0.6, 0.4, d + 0.6, district === 'town' ? rng.pick(ROOF_TOWN) : rng.pick(RUIN_COLORS)));
      // Rooftop clutter: AC units, water tanks, solar scraps.
      const clutter = rng.int(1, 3);
      for (let i = 0; i < clutter; i++)
        b.roofIdx.push(roofs.add(cx + rng.range(-w / 3, w / 3), h + 0.8, cz + rng.range(-d / 3, d / 3), rng.range(1.2, 2.6), rng.range(0.8, 1.4), rng.range(1.2, 2.6), rng.pick(['#8a857c', '#9a8f7c', '#6a7a7a'])));
    } else {
      for (let i = 0; i < 4; i++)
        props.add(cx + rng.range(-w / 3, w / 3), 0.3, cz + rng.range(-d / 3, d / 3), rng.range(0.8, 2), rng.range(0.3, 0.7), rng.range(0.8, 2), color, rng() * 3);
    }
    const oldDoors = [...old.N.map((x) => ({ x, z: minZ - 1.2 })), ...old.S.map((x) => ({ x, z: maxZ + 1.2 })), ...old.W.map((z) => ({ x: minX - 1.2, z })), ...old.E.map((z) => ({ x: maxX + 1.2, z }))];
    const lootN = replayFurnish(b, oldDoors, oldInner, district);
    // The furniture: the ring's rows and placement, every piece proved on the nav probe (world/furnish.js).
    const row = PR.rows[kind];
    const g = { doors: gdoors, inner, boxes: wallBoxes.slice(), props: [], beds: [], boxesIn: [] };
    const frng = rngOf(seed ^ 0x46555231), K = { label: null, loot: row.loot }, Z = { loot: [[row.loot, 1]] };
    const fctx = furnishRooms({ x0: minX, z0: minZ, x1: maxX, z1: maxZ }, g, rooms, K, Z, frng);
    // The middle of a big public room (data/floorplans.js SCATTER): tables, benches, gondolas on a grid, each proved.
    for (const room of rooms) {
      const sc = SCATTER[room.type];
      if (!sc || !fctx.on) continue;
      const [t, every, inset, max] = sc, [fw, fd] = FURNITURE[t].size, longX = room.x1 - room.x0 >= room.z1 - room.z0;
      const sx = longX ? fw : fd, sz = longX ? fd : fw, spots = [];
      for (let x = room.x0 + inset + sx / 2; x <= room.x1 - inset - sx / 2 + 1e-6; x += every) for (let z = room.z0 + inset + sz / 2; z <= room.z1 - inset - sz / 2 + 1e-6; z += every) spots.push({ r: { x0: x - sx / 2, z0: z - sz / 2, x1: x + sx / 2, z1: z + sz / 2 } });
      for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(frng() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
      let n = 0;
      for (const c of spots) { if (n >= max) break; if (placePiece(t, room, g, K, Z, frng, fctx, { cands: [c], gap: 0.9 })) n++; }
    }
    for (const p of g.props) {
      const c = new THREE.Color(p[6]), k = p[8] ?? 1; // a part's shade (ring.js parts: x its own colour)
      if (k !== 1) c.setRGB(Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k));
      props.add(p[0], p[1], p[2], p[3], p[4], p[5], c, p[7]);
    }
    const furn = [];
    for (const q of g.boxes.slice(wallBoxes.length)) {
      const s = statics.add(q.x0, q.z0, q.x1, q.z1, q.tag, q.h);
      const x = (q.x0 + q.x1) / 2, z = (q.z0 + q.z1) / 2, box = g.boxesIn.find((c) => Math.abs(c.x - x) < 0.01 && Math.abs(c.z - z) < 0.01);
      const room = rooms.find((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
      if (box) { s.loot = box.table; s.label = box.label; s.room = room?.type ?? null; }
      furn.push({ x0: q.x0, z0: q.z0, x1: q.x1, z1: q.z1, tag: q.tag, h: q.h, room: room?.type ?? null });
    }
    const beds = g.beds.map((q) => ({ x: q.x, z: q.z, face: q.face, bedY: q.bedY, ...(q.mattress ? { mattress: true } : {}) }));
    for (const q of beds) spawns.beds.push(q);
    // The lock rule, on the furnished building's probe (its walls and every piece in it): a locked door's gap is shut, and
    // every open cell inside must still be reached from a door that is not locked (a front door never locks). A lock that
    // breaks it comes off, the last first (inner doors, then back doors).
    const P = fctx.probe;
    const gapOf = (r) => ({ x0: r.x - (r.axis === 'x' ? r.width / 2 : WALL_T / 2), x1: r.x + (r.axis === 'x' ? r.width / 2 : WALL_T / 2), z0: r.z - (r.axis === 'z' ? r.width / 2 : WALL_T / 2), z1: r.z + (r.axis === 'z' ? r.width / 2 : WALL_T / 2), base: 0 });
    const locked = mine.filter((r) => r.locked);
    for (const r of locked) P.add(gapOf(r));
    const ways = () => [...mine.filter((r) => !r.locked && r.kind !== 'inner').map((r) => [r.x, r.z]), ...gdoors.filter((d) => !mine.some((r) => r.x === d.x && r.z === d.z)).map((d) => [d.x, d.z])];
    for (let i = locked.length - 1; i >= 0 && !P.ok(ways(), rooms, WALL_T / 2); i--) { locked[i].locked = false; P.add(gapOf(locked[i]), -1); }
    for (const r of locked) if (r.locked) P.add(gapOf(r), -1);
    P.flood(ways());
    for (const r of mine) {
      // Ruins hang doors ajar; Rust Haven keeps them shut.
      if (!r.locked && (ruined ? orng.chance(0.5) : district !== 'town' && orng.chance(0.25))) r.open = (orng.chance(0.5) ? 1 : -1) * orng.range(0.5, 1.6);
    }
    // Reached floor (the probe's flood from the open doors), for the loot on the floor and the keeper's post.
    const open = (r) => { const out = []; for (let z = Math.ceil(r.z0 + 0.45 - 0.5) + 0.5; z < r.z1 - 0.45; z += 1) for (let x = Math.ceil(r.x0 + 0.45 - 0.5) + 0.5; x < r.x1 - 0.45; x += 1) if (P.reached(x, z)) out.push({ x, z }); return out; };
    const stay = rooms.filter((r) => r.type !== 'stair' && r.type !== 'corridor' && r.type !== 'hall');
    for (let i = 0; i < lootN; i++) {
      const cells = open(stay[Math.floor(pr() * stay.length)] ?? rooms[0]);
      if (cells.length) spawns.loot.push(cells[Math.floor(pr() * cells.length)]);
    }
    // The keeper's post: the open cell of the front room nearest its middle, a step in from the counter.
    const entry = rooms.find((r) => r.frontRoom) ?? rooms[0], ec = open(entry), mx = (entry.x0 + entry.x1) / 2, mz = (entry.z0 + entry.z1) / 2;
    ec.sort((p, q) => Math.hypot(p.x - mx, p.z - mz) - Math.hypot(q.x - mx, q.z - mz));
    b.post = ec[0] ?? { x: mx, z: mz };
    b.programme = kind;
    b.label = PR.names[spawns.shops.length] && district === 'town' ? PR.names[spawns.shops.length] : row.name;
    b.plan = { id: FP.plans[0], kind, rooms, inner, doors: gdoors, furniture: furn, beds, probeOn: !!fctx.on };
    if (stairRoom) b.stair = { side: stairSide, x0: stairRoom.x0, z0: stairRoom.z0, x1: stairRoom.x1, z1: stairRoom.z1 };
    buildings.push(b);
    return b;
  };

  const makeSolid = (cx, cz, w, d, h, color, ruinedTop) => {
    walls.add(cx, h / 2, cz, w, h, d, color);
    statics.addCentered(cx, cz, w, d, 'building', h);
    if (ruinedTop) {
      // Jagged broken crown so ruined towers read from above.
      for (let i = 0; i < 4; i++) {
        const sx = rng.range(w * 0.2, w * 0.5), sz = rng.range(d * 0.2, d * 0.5);
        const ox = rng.range(-w / 2 + sx / 2, w / 2 - sx / 2), oz = rng.range(-d / 2 + sz / 2, d / 2 - sz / 2);
        const hh = rng.range(1, 6);
        walls.add(cx + ox, h + hh / 2, cz + oz, sx, hh, sz, color);
      }
    } else {
      roofs.add(cx, h + 0.15, cz, w + 0.4, 0.3, d + 0.4, '#6a655e');
      for (let i = 0; i < rng.int(1, 4); i++)
        roofs.add(cx + rng.range(-w / 3, w / 3), h + 0.9, cz + rng.range(-d / 3, d / 3), rng.range(1.5, 3.5), rng.range(1, 2), rng.range(1.5, 3.5), '#7a746c');
    }
    buildings.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, enterable: false, roofIdx: [], doors: [], h });
  };

  // ---- wrecks, barrels, trees ----------------------------------------------------
  const wreck = (x, z, rot) => {
    if (nearWater(x, z, 4) || nearRail(x, z, 4)) return;
    const col = rng.pick(['#5a3a24', '#4a3020', '#6b4a2e', '#3d3a36', '#704020']);
    const along = Math.abs(Math.sin(rot)) > 0.7; // rotated ~90 degrees
    props.add(x, 0.55, z, 1.9, 0.8, 4.2, col, rot);
    props.add(x, 1.15, z, 1.6, 0.6, 2.0, '#2a2622', rot);
    if (along) statics.addCentered(x, z, 4.2, 1.9, 'wreck', 1.4);
    else statics.addCentered(x, z, 1.9, 4.2, 'wreck', 1.4);
  };
  const barrel = (x, z, fire = false) => {
    if (nearWater(x, z, 2) || nearRail(x, z, 2)) return;
    barrels.push({ x, z, fire, color: fire ? '#5a2e1a' : rng.pick(['#7a3a1c', '#3f5446', '#6d5a2a', '#4a4a48']) });
    statics.addCentered(x, z, 0.9, 0.9, 'barrel', 1.1);
    if (fire) { fires.push({ x, z }); glows.push({ x, z, r: 9, color: '#ff8a3a' }); }
  };
  const deadTree = (x, z) => {
    if (nearWater(x, z, 2) || nearRail(x, z, 2)) return;
    const h = rng.range(3, 6);
    trunks.push({ x, z, h });
    for (let i = 0; i < 3; i++) { rng(); rng.range(0.55, 0.9); } // the old box limbs' draws, kept so nothing after them moves (world/flora.js draws the tree)
    statics.addCentered(x, z, 0.6, 0.6, 'tree', h);
  };

  // ---- blocks ------------------------------------------------------------------
  for (let i = 0; i < roadLines.length - 1; i++)
    for (let j = 0; j < roadLines.length - 1; j++) {
      const x0 = roadLines[i] + 10, x1 = roadLines[i + 1] - 10;
      const z0 = roadLines[j] + 10, z1 = roadLines[j + 1] - 10;
      const bcx = (x0 + x1) / 2, bcz = (z0 + z1) / 2;
      const m = Math.max(Math.abs(bcx), Math.abs(bcz));
      const district = m < TOWN ? 'town' : m < GRID - 70 ? 'ruins' : 'desert';

      if (district !== 'desert') {
        // A sidewalk round the block, not a slab over all of it: the yards and lots inside are the desert ground (a
        // block that was one concrete slab read as a parking lot from the game camera).
        const B = SPACING - ROAD_W, SW = SIDEWALK;
        for (const [ox, oz, sw, sd] of [[0, -(B - SW) / 2, B, SW], [0, (B - SW) / 2, B, SW], [-(B - SW) / 2, 0, SW, B - 2 * SW], [(B - SW) / 2, 0, SW, B - 2 * SW]]) {
          const g = new THREE.PlaneGeometry(sw, sd);
          g.rotateX(-Math.PI / 2); g.translate(bcx + ox, 0.02, bcz + oz); flatUV(g);
          sidewalkGeos.push(g);
        }
      }

      if (district === 'town') {
        // 4 lots, every building enterable — this is the living settlement.
        const lot = (x1 - x0) / 2;
        let k = 0;
        for (let lx = 0; lx < 2; lx++)
          for (let lz = 0; lz < 2; lz++, k++) {
            const cx = x0 + lot * (lx + 0.5), cz = z0 + lot * (lz + 0.5);
            // Leave the plaza lot next to the centre crossroads open.
            const towardCentreX = Math.sign(-bcx) === Math.sign(cx - bcx);
            const towardCentreZ = Math.sign(-bcz) === Math.sign(cz - bcz);
            if (towardCentreX && towardCentreZ) {
              spawns.drifters.push({ x: cx, z: cz });
              barrel(cx, cz, true);
              spawns.parking.push({ x: cx + 6, z: cz + 6, rot: rng() * 6 });
              townPlazas.push({ x: cx, z: cz });
              continue;
            }
            const w = rng.range(16, 24), d = rng.range(14, 22);
            const b = makeEnterable(cx + rng.range(-2, 2), cz + rng.range(-2, 2), w, d, 'town', undefined, PROGRAMMES.shops[spawns.shops.length] ?? 'store');
            spawns.shops.push(b);
            townLots.push({ b, x: cx, z: cz, lot });
            for (const dr of b.doors) spawns.drifters.push({ x: dr.x, z: dr.z });
          }
        // Street lamps along the block edge (the only working lights left in Phoenix).
        for (let t = x0; t <= x1; t += 20) { glows.push({ x: t, z: z0 - 2.5, r: 11, color: '#ffc77a', lamp: true }); }
        for (let t = z0; t <= z1; t += 20) { glows.push({ x: x0 - 2.5, z: t, r: 11, color: '#ffc77a', lamp: true }); }
      } else if (district === 'ruins') {
        const kind = rng();
        if (kind < 0.18) {
          // Tower stump fills the block.
          makeSolid(bcx, bcz, rng.range(34, 52), rng.range(34, 52), rng.range(16, 42), rng.pick(RUIN_COLORS), rng.chance(0.6));
        } else {
          const lot = (x1 - x0) / 2;
          for (let lx = 0; lx < 2; lx++)
            for (let lz = 0; lz < 2; lz++) {
              const cx = x0 + lot * (lx + 0.5), cz = z0 + lot * (lz + 0.5);
              const r = rng();
              if (r < 0.5) {
                const b = makeEnterable(cx + rng.range(-2, 2), cz + rng.range(-2, 2), rng.range(13, 24), rng.range(12, 22), 'ruins');
                if (rng.chance(0.35)) spawns.raiders.push({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, squat: true });
              } else if (r < 0.8) {
                makeSolid(cx, cz, rng.range(14, 24), rng.range(14, 24), rng.range(7, 22), rng.pick(RUIN_COLORS), rng.chance(0.5));
              } else {
                // Empty lot: wrecks, barrels, a fire.
                for (let w2 = 0; w2 < rng.int(1, 3); w2++) wreck(cx + rng.range(-8, 8), cz + rng.range(-8, 8), rng.pick([0, Math.PI / 2]) + rng.range(-0.15, 0.15));
                barrel(cx + rng.range(-4, 4), cz + rng.range(-4, 4), rng.chance(0.5));
                spawns.drifters.push({ x: cx, z: cz });
              }
            }
        }
        // Abandoned cars along the curb.
        if (rng.chance(0.7)) wreck(x0 - 4.5 + 0.0, rng.range(z0 + 5, z1 - 5), rng.range(-0.1, 0.1));
        if (rng.chance(0.5)) wreck(rng.range(x0 + 5, x1 - 5), z0 - 4.5, Math.PI / 2 + rng.range(-0.1, 0.1));
      } else {
        // Desert block: scrub, dead trees, the odd shack, sometimes a raider camp.
        for (let t = 0; t < rng.int(2, 5); t++) deadTree(rng.range(x0, x1), rng.range(z0, z1));
        for (let t = 0; t < rng.int(3, 8); t++) {
          const x = rng.range(x0, x1), z = rng.range(z0, z1);
          cacti.push({ x, z, h: rng.range(1.4, 3.2) });
          statics.addCentered(x, z, 0.7, 0.7, 'cactus', 2);
        }
        if (rng.chance(0.35)) makeEnterable(bcx + rng.range(-12, 12), bcz + rng.range(-12, 12), rng.range(9, 13), rng.range(8, 12), 'ruins', undefined, 'shack');
        if (rng.chance(0.4)) wreck(rng.range(x0, x1), rng.range(z0, z1), rng() * Math.PI);
      }
    }

  // ---- raider camps in the flats (beyond the grid) -------------------------------
  const campSpots = [[-385, -140], [390, 120], [-150, 395], [170, -392], [-380, 330], [372, -330]];
  for (const [cx, cz] of campSpots) {
    spawns.camps.push({ x: cx, z: cz });
    // Junk-wall ring with two openings.
    const R = 14;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      if (Math.abs(Math.sin(a)) < 0.2) continue;
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
      const col = rng.pick(['#5a3a24', '#6b4a2e', '#4a4440', '#7a4a22']);
      props.add(x, 1.1, z, 5.2, 2.2, 0.5, col, -a + Math.PI / 2);
      statics.addCentered(x, z, 3, 3, 'junk', 2.2);
    }
    for (let t = 0; t < 3; t++) {
      const a = rng() * Math.PI * 2, d = rng.range(5, 9);
      const tx = cx + Math.cos(a) * d, tz = cz + Math.sin(a) * d;
      props.add(tx, 1.0, tz, 3.4, 2.0, 3.4, rng.pick(['#7c5a3a', '#5d4a34', '#8a6a44']), a);
      statics.addCentered(tx, tz, 3, 3, 'tent', 2);
    }
    barrel(cx, cz, true);
    barrel(cx + 3, cz - 2, true);
    wreck(cx + 20, cz + 6, 0.4);
    for (let r = 0; r < 4; r++) spawns.raiders.push({ x: cx + rng.range(-7, 7), z: cz + rng.range(-7, 7) });
  }

  // Scatter in the outer flats.
  for (let i = 0; i < 260; i++) {
    const x = rng.range(-HALF + 10, HALF - 10), z = rng.range(-HALF + 10, HALF - 10);
    if (Math.max(Math.abs(x), Math.abs(z)) < GRID + 12) continue;
    if (Math.abs(z) < 10) continue; // keep Route 66 clear
    if (statics.pointBlocked(x, z, 2) || nearWater(x, z, 4) || nearRail(x, z, 4)) continue;
    const r = rng();
    if (r < 0.55) { cacti.push({ x, z, h: rng.range(1.4, 3.4) }); statics.addCentered(x, z, 0.7, 0.7, 'cactus', 2); }
    else if (r < 0.85) deadTree(x, z);
    else props.add(x, 0.4, z, rng.range(1.5, 4), rng.range(0.5, 1.4), rng.range(1.5, 4), '#7e6248', rng() * 3); // boulders
  }
  // Wrecks strewn along Route 66 like an old evacuation jam.
  for (let x = -HALF + 20; x < HALF - 20; x += rng.range(18, 40)) {
    if (Math.abs(x) < TOWN + 10) continue;
    wreck(x, rng.pick([-9.5, 9.5]), Math.PI / 2 + rng.range(-0.2, 0.2)); // shoulders, lanes stay drivable
  }

  // ---- Rust Haven perimeter: corrugated wall with gates on every road --------------
  const gateHalf = 9;
  const wallLine = (horizontal, fixed) => {
    const gates = roadLines.filter((c) => Math.abs(c) <= TOWN);
    let s = -TOWN;
    const ends = [];
    for (const g of gates) { ends.push([s, g - gateHalf]); s = g + gateHalf; }
    ends.push([s, TOWN]);
    for (const [a, b] of ends) if (b - a > 0.5) {
      if (horizontal) addWall(a, fixed, b, fixed, 3.2, '#7a4524', 'townwall');
      else addWall(fixed, a, fixed, b, 3.2, '#7a4524', 'townwall');
    }
    for (const g of gates) {
      // Gate posts + watch-fire.
      const p1 = g - gateHalf - 0.6, p2 = g + gateHalf + 0.6;
      for (const p of [p1, p2]) {
        const x = horizontal ? p : fixed, z = horizontal ? fixed : p;
        walls.add(x, 2.6, z, 1.2, 5.2, 1.2, '#4a3020');
        glows.push({ x, z, r: 10, color: '#ffb060', lamp: true });
      }
      const gx = horizontal ? g : fixed + Math.sign(fixed) * -4, gz = horizontal ? fixed + Math.sign(fixed) * -4 : g;
      // Guards flank the gate, clear of the traffic lanes (road half-width is 7m).
      spawns.wardens.push({ x: gx + (horizontal ? 11 : 0), z: gz + (horizontal ? 0 : 11) });
    }
  };
  wallLine(true, -TOWN); wallLine(true, TOWN); wallLine(false, -TOWN); wallLine(false, TOWN);

  // No world boundary any more: the map goes on past the island (world/streamer.js).


  // ---- the holdout lives here (data/holdout.js) ------------------------------------------------------------------
  // The market round the plaza fire and the yards round each building. Its own stream after everything else, so no
  // building, spawn or prop placed above moves; what it adds that is solid (counters, tanks) joins the statics before
  // the nav grids are built, so the island's golden hash moved once, deliberately, for this.
  {
    const H = HOLDOUT, hr = makeRng(H.seed), M = H.market, Y = H.yard;
    const clearOf = (x, z, r) => !statics.pointBlocked(x, z, r)
      && !spawns.parking.some((p) => Math.hypot(p.x - x, p.z - z) < M.keepParking)
      && !glows.some((gl) => gl.lamp && Math.hypot(gl.x - x, gl.z - z) < 2.2);
    // A box in a frame turned by th about (ox, oz): local x across, local z forward.
    const put = (batch, ox, oz, th, lx, y, lz, sx, sy, sz, color) => {
      const c = Math.cos(th), s = Math.sin(th);
      return batch.add(ox + lx * c + lz * s, y, oz - lx * s + lz * c, sx, sy, sz, color, th);
    };
    for (const pz of townPlazas) {
      // The plaza stays paved (a square, not a yard) and the market stands in two rows facing an aisle across it.
      { const g = new THREE.PlaneGeometry(M.square, M.square); g.rotateX(-Math.PI / 2); g.translate(pz.x, 0.025, pz.z); flatUV(g); sidewalkGeos.push(g); }
      const alongX = hr.chance(0.5);
      for (const row of [-1, 1]) for (const at of M.slots) {
        if (!hr.chance(M.fill)) continue;
        const ax = alongX ? at : row * M.aisle, az = alongX ? row * M.aisle : at;
        const sx = pz.x + ax, sz = pz.z + az;
        if (!clearOf(sx, sz, 2.0)) continue;
        // Facing the aisle: local +z points at it.
        const th = alongX ? (row < 0 ? 0 : Math.PI) : (row < 0 ? Math.PI / 2 : -Math.PI / 2);
        const awn = hr.pick(M.awnings), wood = hr.pick(M.counter);
        put(props, sx, sz, th, 0, 0.45, 0.75, 2.8, 0.9, 0.7, wood);                          // the counter
        for (let k = 0; k < 4; k++) put(props, sx, sz, th, -1.05 + k * 0.7, 1.0, 0.75, 0.55, 0.22, 0.5, hr.pick(M.goods));
        put(props, sx, sz, th, hr.range(-0.9, 0.9), 0.4, -0.8, 0.8, 0.8, 0.8, '#7a5a34'); // stock behind
        put(props, sx, sz, th, 0, 0.02, 0, 3.0, 0.03, 2.6, hr.pick(M.rugs));                 // a rug or tarp underfoot
        for (const [px, pz2] of [[-1.45, 1.15], [1.45, 1.15], [-1.45, -1.15], [1.45, -1.15]]) put(props, sx, sz, th, px, 1.2, pz2, 0.1, 2.4, 0.1, Y.post);
        for (let k = 0; k < 3; k++) put(props, sx, sz, th, -1.05 + k * 1.05, 2.45, 0.15, 1.05, 0.08, 2.8, k % 2 ? M.canvas : awn); // striped canvas
        statics.addCentered(sx, sz, 2.2, 2.2, 'stall', 1.0);
      }
      // Palms at the square's corners.
      const P = H.trees.palm, e = M.square / 2 - P.inset;
      for (const [dx, dz] of [[-e, -e], [e, -e], [-e, e], [e, e]]) {
        const x = pz.x + dx, z = pz.z + dz;
        if (!clearOf(x, z, 1.0)) continue;
        const h = hr.range(P.h[0], P.h[1]);
        liveTrees.push({ kind: 'palm', x, z, h, trunk: P.trunk, color: hr.pick(P.fronds), rot: hr() * 6.28 });
        statics.addCentered(x, z, 0.5, 0.5, 'tree', h);
      }
    }
    for (const L of townLots) {
      const b = L.b, half = L.lot / 2, TR = H.trees;
      // A tree or two in the yard corners, clear of the walls, the doors and anything solid.
      const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (let i = 3; i > 0; i--) { const j = Math.floor(hr() * (i + 1)); [corners[i], corners[j]] = [corners[j], corners[i]]; } // a fixed number of draws (a sort's would vary by engine)
      let planted = 0, want = hr.int(TR.perLot[0], TR.perLot[1]);
      for (const [sx2, sz2] of corners) {
        if (planted >= want) break;
        const x = L.x + sx2 * (half - TR.inset), z = L.z + sz2 * (half - TR.inset);
        if (x > b.minX - TR.fromBuilding && x < b.maxX + TR.fromBuilding && z > b.minZ - TR.fromBuilding && z < b.maxZ + TR.fromBuilding) continue;
        if (b.doors.some((d) => Math.hypot(d.x - x, d.z - z) < Y.doorClear) || !clearOf(x, z, 1.2)) continue;
        let t = 0; for (const r of TR.yard) t += r[1];
        let p = hr() * t, kind = TR.yard[0][0]; for (const r of TR.yard) if ((p -= r[1]) < 0) { kind = r[0]; break; }
        const K = TR.kinds[kind], h = hr.range(K.h[0], K.h[1]), r = hr.range(K.r[0], K.r[1]);
        liveTrees.push({ kind, x, z, h, r, squash: K.squash, trunk: K.trunk, color: hr.pick(K.canopy), rot: hr() * 6.28 });
        statics.addCentered(x, z, 0.5, 0.5, 'tree', h);
        planted++;
      }
      const room = { W: b.minX - (L.x - half), E: L.x + half - b.maxX, N: b.minZ - (L.z - half), S: L.z + half - b.maxZ };
      for (const side of ['N', 'S', 'W', 'E']) {
        const m = room[side];
        if (m < Y.margin || !hr.chance(0.85)) continue;
        const horiz = side === 'N' || side === 'S';
        const lo = horiz ? b.minX : b.minZ, hi = horiz ? b.maxX : b.maxZ;
        const along = hr.range(lo + 2.5, hi - 2.5);
        const off = Math.min(m / 2, 2.2) + 0.6;
        const fixed = side === 'N' ? b.minZ - off : side === 'S' ? b.maxZ + off : side === 'W' ? b.minX - off : b.maxX + off;
        const x = horiz ? along : fixed, z = horiz ? fixed : along;
        if (b.doors.some((d) => Math.hypot(d.x - x, d.z - z) < Y.doorClear) || !clearOf(x, z, 1.4)) continue;
        const th = horiz ? 0 : Math.PI / 2; // local x runs along the wall
        let t = 0; for (const r of Y.kinds) t += r[1];
        let p = hr() * t, kind = Y.kinds[0][0]; for (const r of Y.kinds) if ((p -= r[1]) < 0) { kind = r[0]; break; }
        if (kind === 'garden') {
          const len = Math.min(hi - lo - 3, hr.range(4, 7));
          put(props, x, z, th, 0, 0.15, 0, len, 0.3, 1.5, Y.soil);
          for (let k = 0; k < 3; k++) for (let q = 0; q < Math.floor(len / 0.6); q++) put(props, x, z, th, -len / 2 + 0.3 + q * 0.6, 0.42, -0.45 + k * 0.45, 0.42, hr.range(0.2, 0.45), 0.34, hr.pick(Y.crops));
        } else if (kind === 'tank') {
          put(props, x, z, th, 0, 1.2, 0, 2.0, 2.4, 2.0, hr.pick(Y.tank));
          put(props, x, z, th, 0, 2.45, 0, 1.6, 0.1, 1.6, '#c9c2b0');
          statics.addCentered(x, z, 2.0, 2.0, 'tank', 2.4);
        } else if (kind === 'washing') {
          const len = Math.min(hi - lo - 3, hr.range(4, 6.5));
          for (const e of [-len / 2, len / 2]) put(props, x, z, th, e, 1.0, 0, 0.08, 2.0, 0.08, Y.post);
          put(props, x, z, th, 0, 1.95, 0, len, 0.03, 0.03, '#d9d2b8');
          for (let q = 0.6; q < len - 0.4; q += hr.range(0.55, 0.9)) put(props, x, z, th, -len / 2 + q, 1.6, 0, hr.range(0.4, 0.7), hr.range(0.5, 0.75), 0.04, hr.pick(Y.cloth));
        } else {
          const len = Math.min(hi - lo - 3, hr.range(3.5, 5));
          for (const [ex, ez] of [[-len / 2, -1], [len / 2, -1], [-len / 2, 1], [len / 2, 1]]) put(props, x, z, th, ex, 1.1, ez, 0.1, 2.2, 0.1, Y.post);
          put(props, x, z, th, 0, 2.25, 0, len + 0.4, 0.06, 2.4, hr.pick(Y.tarp));
          put(props, x, z, th, hr.range(-len / 3, len / 3), 0.25, 0, 1.2, 0.5, 0.6, '#5a4632'); // a bench in the shade
        }
      }
    }
  }

  // ---- build GPU batches ------------------------------------------------------------
  const box = new THREE.BoxGeometry(1, 1, 1);
  const wallMat = wallSurface(new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.04 })); // world/surfaces.js: stucco, block, brick, dirt
  scene.add(walls.build(box, wallMat));
  const roofMat = roofSurface(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1 })); // world/surfaces.js: what a roof looks like from above
  scene.add(roofs.build(box, roofMat));
  const floorMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  scene.add(floors.build(box, floorMat, { cast: false }));
  // Lamp fixtures: an arm and a hooded head on each pole (so light pools have a visible source).
  for (const gl of glows) if (gl.lamp) {
    props.add(gl.x, 5.45, gl.z + 0.55, 0.12, 0.12, 1.2, '#2b2a28');
    props.add(gl.x, 5.35, gl.z + 1.1, 0.42, 0.18, 0.6, '#c9a46a'); // warm housing, reads as a lamp from above
    props.add(gl.x, 5.22, gl.z + 1.1, 0.3, 0.06, 0.45, '#ffe2a8');
  }
  const propMat = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0.08 });
  scene.add(props.build(box, propMat));

  const concrete = concreteTexture();
  concrete.repeat.set((SPACING - ROAD_W) / 8, (SPACING - ROAD_W) / 8);
  const sidewalks = new THREE.Mesh(mergeGeometries(sidewalkGeos), new THREE.MeshStandardMaterial({ map: concrete, color: '#cfc3ab', roughness: 0.95 }));
  sidewalks.receiveShadow = true;
  scene.add(sidewalks);

  const o = new THREE.Object3D();
  const cyl = (list, geo, mat, fn) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach((it, i) => { fn(o, it); o.updateMatrix(); m.setMatrixAt(i, o.matrix); if (it.color) m.setColorAt(i, new THREE.Color(it.color)); });
    m.count = list.length; m.castShadow = true; m.receiveShadow = true;
    m.computeBoundingSphere();
    scene.add(m);
    return m;
  };
  cyl(barrels, new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.3 }), (o, b) => { o.position.set(b.x, 0.55, b.z); o.scale.set(1, 1, 1); o.rotation.set(0, 0, 0); });
  // Living trees (data/holdout.js), cacti and dead trees: Blender-built models (tools/blenderforge/gen_flora.py) drawn by
  // world/flora.js, one draw per species shared with the streamed world. Positions, turns and collision stay as laid out above.
  const flora = plantIsland(scene, { liveTrees, cacti, trunks });

  // Light pools: additive decals on the ground. Opacity driven by night factor.
  const glowMat = new THREE.MeshBasicMaterial({ map: radialGlow(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  const glowGeo = new THREE.PlaneGeometry(1, 1); glowGeo.rotateX(-Math.PI / 2);
  const glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, glows.length);
  glows.forEach((gl, i) => {
    o.position.set(gl.x, 0.12, gl.z); o.rotation.set(0, 0, 0); o.scale.set(gl.r * 2, 1, gl.r * 2); o.updateMatrix();
    glowMesh.setMatrixAt(i, o.matrix); glowMesh.setColorAt(i, new THREE.Color(gl.color));
  });
  glowMesh.renderOrder = 2;
  glowMesh.computeBoundingSphere();
  scene.add(glowMesh);
  // Lamp heads (posts) so the pools have a source.
  const lampList = glows.filter((g) => g.lamp);
  cyl(lampList, new THREE.CylinderGeometry(0.12, 0.15, 5.5, 5), new THREE.MeshStandardMaterial({ color: '#2b2a28' }), (o, l) => { o.position.set(l.x, 2.75, l.z); o.scale.set(1, 1, 1); });

  // Flames on fire barrels: additive quads, flickered per frame.
  const flameMat = new THREE.MeshBasicMaterial({ map: radialGlow(), color: '#ff9a40', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameGeo = new THREE.PlaneGeometry(1, 1); flameGeo.rotateX(-Math.PI / 2);
  const flames = new THREE.InstancedMesh(flameGeo, flameMat, Math.max(1, fires.length));
  flames.count = fires.length;
  flames.computeBoundingSphere();
  scene.add(flames);

  const minimap = drawMinimap(buildings, glows);

  return {
    buildings, spawns, glows, fires, roofs, props, glowMat, flames, groundMat, roadMat, minimap, // props: a set-piece clears its lot of loose rubble (bases.js)
    walls, // the wall batch: systems/materials.js hides a partition that is breached and draws what is left of it
    doors: doorRows, windows: windowRows, // data rows: systems/interiors.js hangs the leaves and glass
    flora, // world/flora.js: one pool per species, the streamer shares them
    updateFlames(time) {
      fires.forEach((f, i) => {
        const s = 1.4 + Math.sin(time * 13 + i * 7) * 0.25 + Math.sin(time * 29 + i) * 0.15;
        o.position.set(f.x, 1.25, f.z); o.rotation.set(0, time * 2 + i, 0); o.scale.set(s, 1, s); o.updateMatrix();
        flames.setMatrixAt(i, o.matrix);
      });
      flames.instanceMatrix.needsUpdate = true;
    },
    // A building that rose (world/storeys.js): its roof and the clutter on it move up by dy, onto the top storey.
    raiseRoof(b, dy) {
      const mesh = roofs.mesh;
      for (const idx of b.roofIdx) {
        const it = roofs.items[idx];
        it.cy += dy;
        o.position.set(it.cx, it.cy, it.cz); o.rotation.set(0, it.rotY, 0); o.scale.set(it.sx, it.sy, it.sz); o.updateMatrix();
        mesh.setMatrixAt(idx, o.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    },
    setRoofVisible(b, visible) {
      if (b.setRoof) { b.setRoof(visible); return; } // a building that keeps its own roofs (systems/bases.js)
      if (!b.roofIdx.length) return;
      const mesh = roofs.mesh;
      b.roofIdx.forEach((idx) => {
        const it = roofs.items[idx];
        o.position.set(it.cx, it.cy, it.cz); o.rotation.set(0, it.rotY, 0);
        const k = visible ? 1 : 0;
        o.scale.set(it.sx * k, it.sy * k, it.sz * k); o.updateMatrix();
        mesh.setMatrixAt(idx, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// Pre-rendered overview map; the HUD crops a window around the player.
function drawMinimap(buildings, glows) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const k = S / (HALF * 2);
  const P = (v) => (v + HALF) * k;
  g.fillStyle = '#3a2c1f'; g.fillRect(0, 0, S, S);
  // District tint.
  g.fillStyle = '#2d2925'; g.fillRect(P(-GRID + 70), P(-GRID + 70), (GRID - 70) * 2 * k, (GRID - 70) * 2 * k);
  g.fillStyle = '#2f2a24'; g.fillRect(P(-TOWN), P(-TOWN), TOWN * 2 * k, TOWN * 2 * k);
  g.fillStyle = '#16171a';
  roadLines.forEach((cc, i) => {
    const len = i === 4 ? HALF : GRID + 7;
    g.fillRect(P(-len), P(cc - ROAD_W / 2), len * 2 * k, ROAD_W * k);
    g.fillRect(P(cc - ROAD_W / 2), P(-GRID - 7), ROAD_W * k, (GRID * 2 + 14) * k);
  });
  for (const b of buildings) {
    g.fillStyle = b.enterable ? (b.district === 'town' ? '#9a6a42' : '#6c6358') : '#57524c';
    g.fillRect(P(b.minX), P(b.minZ), (b.maxX - b.minX) * k, (b.maxZ - b.minZ) * k);
  }
  g.strokeStyle = '#c9772e'; g.lineWidth = 2;
  g.strokeRect(P(-TOWN), P(-TOWN), TOWN * 2 * k, TOWN * 2 * k);
  return c;
}
