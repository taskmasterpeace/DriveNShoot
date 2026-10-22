import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../engine/rng.js';
import { sandTexture, asphaltTexture, concreteTexture, radialGlow } from './textures.js';
import { nearWater } from './water.js';
import { nearRail } from './rail.js';
import { DOOR_MATERIALS, WINDOW, WINDOW_MIX } from '../data/interiors.js';

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
export const roadLines = [];
for (let c = -GRID; c <= GRID; c += SPACING) roadLines.push(c);

const H_NAMES = ['DEAD MAN RD', 'CINDER ST', 'ASH AVE', 'BONE ST', 'ROUTE 66', 'RUST ST', 'GALLOWS RD', 'SALT ST', 'LAST CHANCE RD'];
const V_NAMES = ['VULTURE AVE', 'CACTUS ST', 'OLD MILL RD', 'HAVEN ST', 'CENTRAL AVE', 'IRON ST', 'MESA DR', 'COYOTE RD', 'END OF THE LINE'];

export function locationName(x, z) {
  for (let k = 0; k < roadLines.length; k++) {
    const c = roadLines[k];
    const span = k === 4 ? HALF : GRID + 8;
    if (Math.abs(z - c) < ROAD_W / 2 && Math.abs(x) < span) return H_NAMES[k];
    if (Math.abs(x - c) < ROAD_W / 2 && Math.abs(z) < GRID + 8) return V_NAMES[k];
  }
  return districtName(x, z);
}

export function districtName(x, z) {
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

const TOWN_COLORS = ['#8a5a3c', '#6f7f78', '#9c8462', '#7b4a32', '#5d6b6a', '#a0703f', '#6b5e4d'];
const RUIN_COLORS = ['#6e6a62', '#7c756a', '#5f5a53', '#857c6e', '#6a625a', '#4f4b46'];
const ROOF_TOWN = ['#5a3a26', '#3f4a48', '#6a5440', '#4c3424', '#55493c'];

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
  const spawns = { drifters: [], raiders: [], camps: [], wardens: [], loot: [], parking: [], shops: [] };
  const sidewalkGeos = [];

  // ---- ground --------------------------------------------------------------
  const sand = sandTexture();
  sand.repeat.set(HALF * 2 / 28, HALF * 2 / 28);
  const groundMat = new THREE.MeshStandardMaterial({ map: sand, roughness: 0.96, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 400, HALF * 2 + 400), groundMat);
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
    const lenH = k === 4 ? HALF * 2 + 200 : GRID * 2 + ROAD_W;
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

  // Build a building's queued wall spans, windows cut in: centred in equal sub-spans of >= 5 m (so
  // >= 1.7 m of wall to each corner or door frame), at most 3 a span, never where the partition meets.
  // Each span is ONE collision box (as before windows) carrying its window openings as holes.
  const buildSpans = (bld, px) => {
    for (const sp of bld.pend) {
      const { side, horizontal, fixed, h, color } = sp;
      const p0 = sp.s - WALL_T / 2, p1 = sp.e + WALL_T / 2, len = p1 - p0;
      const n = Math.min(3, Math.floor(len / 5));
      const holes = [];
      let cur = p0;
      for (let k = 0; k < n; k++) {
        const c = p0 + (k + 0.5) * (len / n);
        if (horizontal && px !== null && Math.abs(c - px) < WINDOW.width / 2 + 0.7) continue;
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

  const furnish = (b, rng2, district) => {
    const { minX, maxX, minZ, maxZ } = b;
    const n = Math.floor(((maxX - minX) * (maxZ - minZ)) / 70);
    for (let i = 0; i < n; i++) {
      const x = rng2.range(minX + 1.6, maxX - 1.6), z = rng2.range(minZ + 1.6, maxZ - 1.6);
      // Keep doorways clear.
      // Keep outer doors and interior doorways clear.
      if (b.doors.some((d) => Math.hypot(d.x - x, d.z - z) < 4.8) || b.innerDoors.some((d) => Math.hypot(d.x - x, d.z - z) < 3.2)) continue;
      const kind = rng2.int(0, 3);
      if (kind === 0) { // crate stack
        props.add(x, 0.5, z, 1, 1, 1, '#7a5a34'); statics.addCentered(x, z, 1, 1, 'crate', 1);
      } else if (kind === 1) { // table
        props.add(x, 0.45, z, 1.8, 0.12, 1.1, '#5a3e28');
        statics.addCentered(x, z, 1.8, 1.1, 'table', 0.9);
      } else if (kind === 2) { // bedroll / mattress
        props.add(x, 0.12, z, 1, 0.22, 2, rng2.pick(['#6d6552', '#4f5a4f', '#7a6048']));
      } else { // shelf against nothing in particular
        props.add(x, 0.9, z, 2.2, 1.8, 0.5, '#4d3a29'); statics.addCentered(x, z, 2.2, 0.5, 'shelf', 1.8);
      }
    }
    // Loot inside every enterable building.
    const lootN = district === 'town' ? 1 : rng2.int(1, 2);
    for (let i = 0; i < lootN; i++)
      spawns.loot.push({ x: rng2.range(minX + 1.5, maxX - 1.5), z: rng2.range(minZ + 1.5, maxZ - 1.5) });
  };

  const makeEnterable = (cx, cz, w, d, district, shopName) => {
    const minX = cx - w / 2, maxX = cx + w / 2, minZ = cz - d / 2, maxZ = cz + d / 2;
    const ruined = district === 'ruins' && rng.chance(0.55);
    const h = district === 'town' ? rng.range(4.2, 5.2) : rng.range(4, 6);
    const color = district === 'town' ? rng.pick(TOWN_COLORS) : rng.pick(RUIN_COLORS);
    const b = { minX, maxX, minZ, maxZ, enterable: true, roofIdx: [], doors: [], innerDoors: [], ruined, district, h, shopName, inside: false, pend: [] };
    // Doors: always face the nearest road on at least one side.
    const nearestRoad = (v) => roadLines.reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best), roadLines[0]);
    const dxRoad = Math.abs(nearestRoad(cx) - cx) - w / 2, dzRoad = Math.abs(nearestRoad(cz) - cz) - d / 2;
    const sides = { N: [], S: [], E: [], W: [] };
    const front = dxRoad < dzRoad ? (nearestRoad(cx) > cx ? 'E' : 'W') : (nearestRoad(cz) > cz ? 'S' : 'N');
    if (dxRoad < dzRoad) sides[front].push(cz + rng.range(-d / 4, d / 4));
    else sides[front].push(cx + rng.range(-w / 4, w / 4));
    if (rng.chance(0.5)) { // back door
      const s = rng.pick(['N', 'S', 'E', 'W']);
      if (!sides[s].length) sides[s].push((s === 'N' || s === 'S' ? cx : cz) + rng.range(-1.5, 1.5));
    }
    // The shop front is a double door; a back door is a single one, its gap on a nav cell centre.
    const gaps = {};
    for (const s of ['N', 'S', 'W', 'E']) gaps[s] = sides[s].map((at) => (s === front ? { at, w: DOOR_GAP, kind: 'front', side: s } : { at: snapHalf(at), w: SINGLE_GAP, kind: 'back', side: s }));
    sideWithGaps(b, 'N', true, minZ, minX, maxX, gaps.N, h, color, ruined);
    sideWithGaps(b, 'S', true, maxZ, minX, maxX, gaps.S, h, color, ruined);
    sideWithGaps(b, 'W', false, minX, minZ, maxZ, gaps.W, h, color, ruined);
    sideWithGaps(b, 'E', false, maxX, minZ, maxZ, gaps.E, h, color, ruined);
    for (const x of sides.N) b.doors.push({ x, z: minZ - 1.2 });
    for (const x of sides.S) b.doors.push({ x, z: maxZ + 1.2 });
    for (const z of sides.W) b.doors.push({ x: minX - 1.2, z });
    for (const z of sides.E) b.doors.push({ x: maxX + 1.2, z });
    // Interior partition with a doorway for bigger buildings.
    let px = null, inner = null;
    if (w > 15) {
      px = cx + rng.range(-w / 6, w / 6);
      // Never run a partition into a doorway on the north/south walls.
      for (const d of [...sides.N, ...sides.S]) if (Math.abs(d - px) < 2.8) px = d + (px >= d ? 2.8 : -2.8);
      px = Math.min(maxX - 2, Math.max(minX + 2, px));
      const gap = cz + rng.range(-d / 4, d / 4);
      b.innerDoors.push({ x: px, z: gap });
      if (!(ruined && rng.chance(0.4))) {
        const gs = snapHalf(gap); // a single door, its gap on a nav cell centre like a back door's
        addWall(px, minZ, px, gs - SINGLE_GAP / 2, h * 0.92, color);
        addWall(px, gs + SINGLE_GAP / 2, px, maxZ, h * 0.92, color);
        inner = { at: gs };
      }
    }
    buildSpans(b, inner ? px : null);
    // Door leaves (ruins lose some), locks, and the rule that no room is ever locked off: every room
    // keeps an unlocked way in from outside. Front doors never lock.
    const fixedOf = { N: minZ, S: maxZ, W: minX, E: maxX };
    const roomOf = (x) => (inner && x > px ? 1 : 0);
    const entrances = [], mine = [];
    for (const s of ['N', 'S', 'W', 'E']) for (const g of gaps[s]) {
      const horiz = s === 'N' || s === 'S';
      const x = horiz ? g.at : fixedOf[s], z = horiz ? fixedOf[s] : g.at;
      const leaf = !g.broken && !(ruined && orng.chance(0.3));
      const row = leaf ? addDoor(b, g.kind, horiz ? 'x' : 'z', x, z, g.w, OUT[s][0], OUT[s][1]) : null;
      if (row?.kind === 'back' && orng.chance(0.45)) row.locked = true;
      if (row) mine.push(row);
      entrances.push({ room: roomOf(x), row });
    }
    let innerRow = null;
    if (inner && !(ruined && orng.chance(0.3))) {
      innerRow = addDoor(b, 'inner', 'z', px, inner.at, SINGLE_GAP, 1, 0);
      if (orng.chance(0.35)) innerRow.locked = true;
      mine.push(innerRow);
    }
    // A doorway whose leaf is gone, or an unlocked door, is a way in.
    const open = (room) => entrances.some((e) => e.room === room && !e.row?.locked);
    if (innerRow?.locked && !(open(0) && open(1))) innerRow.locked = false;
    for (const row of mine) {
      // Ruins hang doors ajar; Rust Haven keeps them shut.
      if (!row.locked && (ruined ? orng.chance(0.5) : district !== 'town' && orng.chance(0.25))) row.open = (orng.chance(0.5) ? 1 : -1) * orng.range(0.5, 1.6);
    }
    floors.add(cx, 0.07, cz, w, 0.1, d, district === 'town' ? rng.pick(['#5c4a3a', '#544638', '#4a4038']) : '#4a4540');
    if (!ruined) {
      b.roofIdx.push(roofs.add(cx, h + 0.2, cz, w + 0.6, 0.4, d + 0.6, district === 'town' ? rng.pick(ROOF_TOWN) : rng.pick(RUIN_COLORS)));
      // Rooftop clutter: AC units, water tanks, solar scraps.
      const clutter = rng.int(1, 3);
      for (let i = 0; i < clutter; i++)
        b.roofIdx.push(roofs.add(cx + rng.range(-w / 3, w / 3), h + 0.8, cz + rng.range(-d / 3, d / 3), rng.range(1.2, 2.6), rng.range(0.8, 1.4), rng.range(1.2, 2.6), rng.pick(['#5e5a54', '#6e665a', '#3d4544'])));
    } else {
      for (let i = 0; i < 4; i++)
        props.add(cx + rng.range(-w / 3, w / 3), 0.3, cz + rng.range(-d / 3, d / 3), rng.range(0.8, 2), rng.range(0.3, 0.7), rng.range(0.8, 2), color, rng() * 3);
    }
    furnish(b, rng, district);
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
      roofs.add(cx, h + 0.15, cz, w + 0.4, 0.3, d + 0.4, '#3a3734');
      for (let i = 0; i < rng.int(1, 4); i++)
        roofs.add(cx + rng.range(-w / 3, w / 3), h + 0.9, cz + rng.range(-d / 3, d / 3), rng.range(1.5, 3.5), rng.range(1, 2), rng.range(1.5, 3.5), '#55504a');
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
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2;
      props.add(x + Math.cos(a) * 0.8, h * rng.range(0.55, 0.9), z + Math.sin(a) * 0.8, 1.8, 0.16, 0.16, '#3b2c20', a);
    }
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
        const g = new THREE.PlaneGeometry(SPACING - ROAD_W, SPACING - ROAD_W);
        g.rotateX(-Math.PI / 2); g.translate(bcx, 0.02, bcz);
        sidewalkGeos.push(g);
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
              continue;
            }
            const w = rng.range(16, 24), d = rng.range(14, 22);
            const b = makeEnterable(cx + rng.range(-2, 2), cz + rng.range(-2, 2), w, d, 'town');
            spawns.shops.push(b);
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
        if (rng.chance(0.35)) makeEnterable(bcx + rng.range(-12, 12), bcz + rng.range(-12, 12), rng.range(9, 13), rng.range(8, 12), 'ruins');
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

  // World boundary.
  statics.add(-HALF - 20, -HALF - 20, HALF + 20, -HALF, 'bound', 20);
  statics.add(-HALF - 20, HALF, HALF + 20, HALF + 20, 'bound', 20);
  statics.add(-HALF - 20, -HALF, -HALF, HALF, 'bound', 20);
  statics.add(HALF, -HALF, HALF + 20, HALF, 'bound', 20);

  // ---- build GPU batches ------------------------------------------------------------
  const box = new THREE.BoxGeometry(1, 1, 1);
  const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.04 });
  scene.add(walls.build(box, wallMat));
  const roofMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1 });
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
  const sidewalks = new THREE.Mesh(mergeGeometries(sidewalkGeos), new THREE.MeshStandardMaterial({ map: concrete, color: '#a99c88', roughness: 0.95 }));
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
  cyl(cacti, new THREE.CylinderGeometry(0.3, 0.38, 1, 7), new THREE.MeshStandardMaterial({ color: '#56653a', roughness: 0.9 }), (o, c) => { o.position.set(c.x, c.h / 2, c.z); o.scale.set(1, c.h, 1); });
  cyl(trunks, new THREE.CylinderGeometry(0.16, 0.3, 1, 6), new THREE.MeshStandardMaterial({ color: '#3b2c20', roughness: 0.95 }), (o, t) => { o.position.set(t.x, t.h / 2, t.z); o.scale.set(1, t.h, 1); });

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
    buildings, spawns, glows, fires, roofs, glowMat, flames, groundMat, roadMat, minimap,
    doors: doorRows, windows: windowRows, // data rows: systems/interiors.js hangs the leaves and glass
    updateFlames(time) {
      fires.forEach((f, i) => {
        const s = 1.4 + Math.sin(time * 13 + i * 7) * 0.25 + Math.sin(time * 29 + i) * 0.15;
        o.position.set(f.x, 1.25, f.z); o.rotation.set(0, time * 2 + i, 0); o.scale.set(s, 1, s); o.updateMatrix();
        flames.setMatrixAt(i, o.matrix);
      });
      flames.instanceMatrix.needsUpdate = true;
    },
    setRoofVisible(b, visible) {
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
