import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { deckOf } from '../data/decks.js';
import { RUNDOWN } from '../data/gadgets.js';
import { TRAILERS } from '../data/trailers.js';

// Vehicle bodies, built to measurements in code: ONE merged, vertex-coloured mesh per vehicle with a
// per-vertex `part` id, so damage (vehicledamage.js) can dent, scrape and drop exact pieces.
// Local frame: +x = the driver's left, +y up, +z forward; tyres stand on y = 0.
// Two tables keep the moving parts honest, so the look and the behaviour can't drift apart:
//   lampAnchors() - where the lenses are, and where the light leaves (vehiclelights.js);
//   glassLayout() - the greenhouse the pillars and roof are built around and the panes are cut to
//                   (carcombat.js draws, cracks and shatters them: 1 draw call for every pane).
// Closed cars have a real cabin tub under the glass (floor, dash, seats, wheel), seen through the
// tint and plainly once a pane is shot out.

export const PART = { body: 0, bumperF: 1, bumperR: 2, doorL: 3, doorR: 4, doorL2: 5, doorR2: 6, hood: 7, glass: 8, wheelFL: 10, wheelFR: 11, wheelRL: 12, wheelRR: 13, light: 14, frame: 15 };

const TYRE = '#141312', HUB = '#6a645c', RUBBER = '#151413', CHROME = '#a7a39b', BUMPER = '#2e2c2a', CAGE = '#262626';
// Interior tones stay dark but warm, so a shot-out pane opens onto seats and a dash, not a black hole.
const SEAT = '#4a3a2c', DASH = '#2b2825', CARPET = '#3d362f', WHEEL = '#1d1b19', GRILLE = '#111111', PLATE = '#d6cdb2', CREAM = '#d9d2c2', MIRROR = '#7d8a90';

// The cabin's glass in the body frame. The windshield runs from its foot (zA, yB) up to the roof's
// front edge (roofF, yR); the roof to roofR; the rear glass down to its foot (zC, yB). Side glass
// spans belt yB to roof yR, wB wide at the belt narrowing to wR at the roof (tumblehome); sideRear
// stops it early (the van's cargo box). hp = glass toughness. Types without a row are open.
const GREENHOUSE = {
  sedan:       { zA: 1.05, roofF: 0.35, roofR: -0.85, zC: -1.5, yB: 1.17, yR: 1.8, wB: 1.86, wR: 1.56, hp: 35 },
  interceptor: { zA: 0.95, roofF: 0.3, roofR: -0.6, zC: -1.2, yB: 1.17, yR: 1.76, wB: 1.86, wR: 1.56, hp: 35 },
  // The pickup's cab sits 0.25 m further forward than it used to: the bed behind it is a floor you stand in now
  // (data/decks.js pickupBed), and 1.27 m of it was not enough to turn round in.
  pickup:      { zA: 1.3, roofF: 0.7, roofR: -0.2, zC: -0.3, yB: 1.27, yR: 1.92, wB: 2.06, wR: 1.76, hp: 40 },
  van:         { zA: 2.25, roofF: 1.7, roofR: -2.665, zC: -2.665, yB: 1.32, yR: 2.02, wB: 2.15, wR: 2.0, sideRear: 0.95, hp: 40 },
  // The RV's cab: a van's windshield and doors; behind the seats a glass partition into the coach (the rear pane).
  rv:          { zA: 3.2, roofF: 2.62, roofR: 1.85, zC: 1.85, yB: 1.45, yR: 2.2, wB: 2.34, wR: 2.18, sideRear: 1.97, hp: 40 },
  // The LONGHAULER's sleeper cab (docs/design/WEB_SEMIS.md): a conventional's long nose, a tall flat screen, a sleeper behind.
  semi:        { zA: 1.7, roofF: 1.28, roofR: 0.35, zC: 0.28, yB: 2.05, yR: 2.92, wB: 2.42, wR: 2.22, hp: 80 },
  rig:         { zA: 2.62, roofF: 2.18, roofR: 1.25, zC: 1.18, yB: 2.0, yR: 2.78, wB: 2.5, wR: 2.3, hp: 80 },
  gunboat:     { zA: 1.42, roofF: 1.1, roofR: -0.45, zC: -0.62, yB: 1.75, yR: 2.25, wB: 2.42, wR: 2.2, hp: 60 },
  // Military: thick laminated glass. The carrier's "greenhouse" is its driver's cupola: slits of armoured glass.
  patrol:      { zA: 0.92, roofF: 0.74, roofR: -1.22, zC: -1.32, yB: 1.36, yR: 1.96, wB: 2.14, wR: 2.0, hp: 75 },
  apc:         { zA: 2.12, roofF: 2.02, roofR: 1.42, zC: 1.32, yB: 2.17, yR: 2.44, wB: 0.96, wR: 0.88, hp: 320 },
};

function tag(g, color, part) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3), pa = new Float32Array(n);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; pa[i] = part; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.setAttribute('part', new THREE.BufferAttribute(pa, 1));
  return g;
}

function coloredBox(sx, sy, sz, x, y, z, color, part = PART.body, rotX = 0) {
  // Chunky parts get bevelled edges so silhouettes read as vehicles, not crates.
  const m = Math.min(sx, sy, sz);
  let g = m > 0.3 ? new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(0.14, m * 0.22)) : new THREE.BoxGeometry(sx, sy, sz);
  if (g.index) g = g.toNonIndexed();
  if (rotX) g.rotateX(rotX);
  g.translate(x, y, z);
  return tag(g, color, part);
}

// Box from min/max extents: bodies are built to measurements (the order of the bounds doesn't matter).
function slab(x0, x1, y0, y1, z0, z1, color, part = PART.body) {
  return coloredBox(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, color, part);
}

const _q = new THREE.Quaternion(), _fwd = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3();
// A square-section bar from p0 to p1: pillars, cage tubes, push bars, exhaust stacks.
function beam(p0, p1, t, color, part = PART.frame) {
  _d.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const g = new THREE.BoxGeometry(t, t, _d.length()).toNonIndexed();
  g.applyQuaternion(_q.setFromUnitVectors(_fwd, _d.normalize()));
  g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
  return tag(g, color, part);
}

// Tyre + hub, tagged per corner so a flat visibly squats; an axle is a matched pair.
function wheel(parts, x, z, r, w, part) {
  const t = new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2).translate(x, r, z).toNonIndexed();
  const h = new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 8).rotateZ(Math.PI / 2).translate(x, r, z).toNonIndexed();
  parts.push(tag(t, TYRE, part), tag(h, HUB, part));
}
function axle(parts, z, r, w, x, front) {
  wheel(parts, x, z, r, w, front ? PART.wheelFL : PART.wheelRL);
  wheel(parts, -x, z, r, w, front ? PART.wheelFR : PART.wheelRR);
}

// A walkable vehicle's roof (data/decks.js: a cabin deck) is built apart from the body and handed back in out.roof, so it
// can hide while someone is inside (systems/decks.js): the coach seen from above with its roof cut away, as a building's
// is. Everything a builder pushes into ROOF while it runs ends up there (the greenhouse's roof panel too).
let ROOF = null;
export function buildBody(s, type, paint, out = null) {
  const base = s.base ?? type;
  const parts = [];
  const roof = ROOF = deckOf(s.deck)?.open === false ? [] : null;
  if (base === 'rig') rigBody(parts, s, paint);
  else if (base === 'buggy') buggyBody(parts, s, paint);
  else if (base === 'van') vanBody(parts, s, paint);
  else if (base === 'rv') rvBody(parts, s, paint);
  else if (base === 'bike') bikeBody(parts, s, paint);
  else if (base === 'atv') atvBody(parts, s, paint);
  else if (base === 'airboat' || base === 'jetski' || base === 'gunboat') boatBody(parts, s, base, paint);
  else if (base === 'raft' || base === 'ferry') raftBody(parts, s, base);
  else if (base === 'patrol') patrolBody(parts, s, paint);
  else if (base === 'apc') apcBody(parts, s, paint);
  else if (base === 'bus') busBody(parts, s, paint);
  else if (base === 'semi') semiBody(parts, s, paint); // SEMIS (docs/design/WEB_SEMIS.md): the tractor and its trailers
  else if (base === 'boxtrailer') boxTrailerBody(parts, s, paint);
  else if (base === 'widetrailer') wideTrailerBody(parts, s, paint);
  else carBody(parts, s, GREENHOUSE[base] ? base : 'sedan', paint);
  lenses(parts, s, type);
  ROOF = null;
  if (out) out.roof = roof?.length ? mergeGeometries(roof) : null;
  return mergeGeometries(parts);
}

// ---- cars ----------------------------------------------------------------------------------------

// Sedan, LAWMAN (ex-trooper cruiser), pickup: a nose with a hood panel, a cabin tub under the glass,
// the greenhouse, then a trunk or an open bed.
function carBody(parts, s, base, paint) {
  const L = s.len, hw = s.wid / 2, G = GREENHOUSE[base];
  const lawman = base === 'interceptor', pickup = base === 'pickup';
  const skin = lawman ? CREAM : paint; // a faded trooper two-tone (cream roof + doors), not the all-black cop car
  const rd = s.look === 'rundown' ? RUNDOWN : null; // a town's patrol car gone to seed (systems/security.js): primer, swapped panels
  const yHood = pickup ? 1.2 : 1.1, yFloor = pickup ? 0.72 : 0.62, r = pickup ? 0.46 : 0.42;
  // Nose: engine block, hood panel (PART.hood tears off), grille, bumper.
  parts.push(slab(-hw, hw, 0.42, yHood - 0.06, G.zA - 0.05, L / 2 - 0.06, paint));
  parts.push(slab(-hw + 0.07, hw - 0.07, yHood - 0.06, yHood, G.zA + 0.02, L / 2 - 0.16, rd ? rd.primer : paint, PART.hood));
  if (lawman) parts.push(slab(-0.32, 0.32, yHood, yHood + 0.05, G.zA + 0.3, L / 2 - 0.45, paint, PART.hood)); // power bulge
  grille(parts, hw, L, yHood);
  parts.push(slab(-hw - 0.03, hw + 0.03, 0.46, 0.7, L / 2 - 0.08, L / 2 + 0.12, BUMPER, PART.bumperF));
  // Cabin tub: floor, doors (front/rear on the sedan), handles, mirrors, then the interior.
  const zB = base === 'sedan' ? (G.roofF + G.roofR) / 2 - 0.05 : undefined;
  parts.push(slab(-hw + 0.1, hw - 0.1, 0.42, yFloor, G.zC, G.zA, CARPET));
  for (const sd of [1, -1]) {
    const x0 = sd * (hw - 0.1), x1 = sd * hw, front = sd > 0 ? PART.doorL : PART.doorR;
    if (zB !== undefined) {
      parts.push(slab(x0, x1, 0.42, G.yB, zB, G.zA, skin, front));
      parts.push(slab(x0, x1, 0.42, G.yB, G.zC, zB, skin, sd > 0 ? PART.doorL2 : PART.doorR2));
    } else parts.push(slab(x0, x1, 0.42, G.yB, G.zC, G.zA, rd ? rd.panels[sd > 0 ? 0 : 1] : skin, front));
    parts.push(slab(sd * (hw + 0.01), sd * (hw + 0.035), G.yB - 0.18, G.yB - 0.13, G.zA - 0.45, G.zA - 0.25, CHROME, front)); // handle
    mirror(parts, sd, hw, G);
  }
  interior(parts, G, hw, yFloor, !pickup);
  greenhouse(parts, G, skin, skin, zB);
  // Tail: a trunk, or an open bed.
  if (pickup) bed(parts, L, hw, G, paint);
  else parts.push(slab(-hw, hw, 0.42, yHood - 0.02, -L / 2 + 0.06, G.zC + 0.05, rd ? rd.panels[2] : paint));
  parts.push(slab(-hw - 0.03, hw + 0.03, 0.46, 0.7, -L / 2 - 0.12, -L / 2 + 0.08, BUMPER, PART.bumperR));
  parts.push(slab(-0.22, 0.22, 0.55, 0.68, -L / 2 - 0.14, -L / 2 - 0.12, PLATE, PART.bumperR));
  if (lawman) { lightBar(parts, G, rd); pushBar(parts, L, rd); spotlight(parts, hw, G); }
  axle(parts, L / 2 - 0.92, r, 0.32, hw - 0.1, true);
  axle(parts, -L / 2 + 0.92, r, 0.32, hw - 0.1, false);
}

function grille(parts, hw, L, yHood) {
  parts.push(slab(-hw + 0.45, hw - 0.45, 0.66, yHood - 0.12, L / 2 - 0.1, L / 2 - 0.02, GRILLE));
  for (let k = 0; k < 3; k++) { const y = 0.71 + k * ((yHood - 0.86) / 2); parts.push(slab(-hw + 0.47, hw - 0.47, y, y + 0.025, L / 2 - 0.035, L / 2, CHROME)); }
}

function mirror(parts, sd, hw, G) {
  const part = sd > 0 ? PART.doorL : PART.doorR;
  parts.push(slab(sd * (hw - 0.02), sd * (hw + 0.2), G.yB + 0.02, G.yB + 0.15, G.zA - 0.28, G.zA - 0.16, BUMPER, part));
  parts.push(slab(sd * (hw + 0.04), sd * (hw + 0.19), G.yB + 0.04, G.yB + 0.13, G.zA - 0.29, G.zA - 0.28, MIRROR, part));
}

// What you see through the glass, and all of it once a pane is shot out. Driver sits on the left (+x).
function interior(parts, G, hw, yFloor, rearBench) {
  const zs = G.zA - 0.95, sx = Math.min(0.45, hw - 0.5);
  parts.push(slab(-hw + 0.11, hw - 0.11, G.yB - 0.32, G.yB - 0.03, G.zA - 0.4, G.zA - 0.02, DASH));
  const sw = new THREE.TorusGeometry(0.16, 0.022, 5, 14).rotateX(-0.95).translate(sx, G.yB - 0.12, G.zA - 0.52).toNonIndexed();
  parts.push(tag(sw, WHEEL, PART.body));
  for (const x of [sx, -sx]) {
    parts.push(slab(x - 0.23, x + 0.23, yFloor, yFloor + 0.17, zs - 0.26, zs + 0.24, SEAT));      // cushion
    parts.push(slab(x - 0.23, x + 0.23, yFloor + 0.17, G.yB + 0.22, zs - 0.38, zs - 0.25, SEAT));  // backrest
    parts.push(slab(x - 0.12, x + 0.12, G.yB + 0.22, G.yB + 0.36, zs - 0.37, zs - 0.27, SEAT));   // headrest
  }
  parts.push(slab(-0.09, 0.09, yFloor, yFloor + 0.28, zs - 0.22, G.zA - 0.42, DASH));              // console
  if (rearBench && G.zC < zs - 0.9) {
    parts.push(slab(-hw + 0.14, hw - 0.14, yFloor, yFloor + 0.17, G.zC + 0.3, G.zC + 0.78, SEAT));
    parts.push(slab(-hw + 0.14, hw - 0.14, yFloor + 0.17, G.yB + 0.12, G.zC + 0.12, G.zC + 0.3, SEAT));
  }
}

// Roof panel, A/C (and B) pillars, the beltline seal: the frame the panes are cut to fit.
function greenhouse(parts, G, roof, pillar, zB) {
  const bx = G.wB / 2 - 0.035, rx = G.wR / 2 - 0.035, top = G.yR + 0.02;
  (ROOF ?? parts).push(slab(-G.wR / 2, G.wR / 2, G.yR, G.yR + 0.07, G.roofR, G.roofF, roof));
  for (const sd of [1, -1]) {
    parts.push(beam([sd * bx, G.yB, G.zA], [sd * rx, top, G.roofF], 0.07, pillar, PART.body));
    parts.push(beam([sd * bx, G.yB, G.zC], [sd * rx, top, G.roofR], 0.07, pillar, PART.body));
    if (zB !== undefined) parts.push(beam([sd * bx, G.yB, zB], [sd * rx, top, zB], 0.08, pillar, PART.body));
    if (G.sideRear !== undefined) parts.push(beam([sd * bx, G.yB, G.sideRear], [sd * rx, top, G.sideRear], 0.08, pillar, PART.body));
    parts.push(slab(sd * (G.wB / 2 - 0.03), sd * (G.wB / 2 + 0.03), G.yB - 0.03, G.yB + 0.015, G.sideRear ?? G.zC, G.zA, RUBBER));
  }
}

function bed(parts, L, hw, G, paint) {
  const z0 = -L / 2 + 0.06, z1 = G.zC - 0.12, top = 1.38;
  parts.push(slab(-hw + 0.08, hw - 0.08, 0.42, 0.92, z0, z1, '#3a3530'));                                  // floor
  for (let k = 0; k < 5; k++) { const x = -hw + 0.3 + k * ((2 * hw - 0.6) / 4); parts.push(slab(x - 0.03, x + 0.03, 0.92, 0.95, z0 + 0.1, z1 - 0.1, '#2a2622')); } // ribs
  for (const sd of [1, -1]) parts.push(slab(sd * (hw - 0.08), sd * hw, 0.42, top, z0, z1, paint));       // sides
  parts.push(slab(-hw + 0.08, hw - 0.08, 0.92, top, z1 - 0.08, z1, paint));                                // bulkhead
  parts.push(slab(-hw + 0.08, hw - 0.08, 0.92, top - 0.04, z0, z0 + 0.07, paint, PART.bumperR));           // tailgate
  parts.push(slab(-hw + 0.16, hw - 0.16, 0.93, 1.29, z1 - 0.42, z1 - 0.04, '#7c776e'));                    // diamond-plate toolbox (data/decks.js pickupBed: a container)
  parts.push(slab(-hw + 0.2, hw - 0.2, 1.29, 1.3, z1 - 0.38, z1 - 0.08, '#9a958b'));                       // its lid
}

function lightBar(parts, G, rd = null) {
  const zc = (G.roofF + G.roofR) / 2 + 0.1, y = G.yR + 0.07;
  parts.push(slab(-0.66, 0.66, y, y + 0.1, zc - 0.13, zc + 0.13, '#1e1e1e'));
  parts.push(slab(0.06, 0.62, y + 0.1, y + 0.15, zc - 0.11, zc + 0.11, '#7a2119'));   // dead red lens (driver's side)
  if (rd) { parts.push(slab(-0.62, -0.06, y + 0.1, y + 0.12, zc - 0.11, zc + 0.11, '#2a2622')); parts.push(slab(-0.5, -0.2, y + 0.12, y + 0.16, zc - 0.04, zc + 0.04, rd.rust)); } // busted: the blue lens gone, a wire hanging
  else parts.push(slab(-0.62, -0.06, y + 0.1, y + 0.15, zc - 0.11, zc + 0.11, '#23395f')); // dead blue lens
}

function pushBar(parts, L, rd = null) {
  const z = L / 2 + 0.24, c = '#1b1b1b';
  if (rd) { parts.push(slab(-0.78, 0.78, 0.42, 0.66, z + 0.04, z + 0.16, rd.rust, PART.bumperF)); parts.push(slab(-0.7, 0.7, 0.78, 0.86, z, z + 0.08, rd.primer, PART.bumperF)); } // a welded ram plate
  parts.push(beam([-0.62, 0.62, z], [0.62, 0.62, z], 0.07, c, PART.bumperF));
  parts.push(beam([-0.62, 0.95, z - 0.04], [0.62, 0.95, z - 0.04], 0.07, c, PART.bumperF));
  for (const x of [-0.55, 0.55]) {
    parts.push(beam([x, 0.45, z], [x, 1.0, z - 0.06], 0.08, c, PART.bumperF));
    parts.push(beam([x, 0.62, z], [x, 0.62, L / 2 + 0.1], 0.06, c, PART.bumperF));
  }
}

function spotlight(parts, hw, G) {
  const g = new THREE.CylinderGeometry(0.075, 0.06, 0.16, 10).rotateX(Math.PI / 2).translate(hw + 0.05, G.yB + 0.22, G.zA - 0.12).toNonIndexed();
  parts.push(tag(g, CHROME, PART.doorL));
}

// ---- the van ---------------------------------------------------------------------------------------

// A short nose, a glazed cab, then a solid cargo box under one long roof, with a loaded roof rack.
function vanBody(parts, s, paint) {
  const L = s.len, hw = s.wid / 2, G = GREENHOUSE.van, yFloor = 0.6;
  parts.push(slab(-hw, hw, 0.42, 1.2, G.zA - 0.05, L / 2 - 0.06, paint));
  parts.push(slab(-hw + 0.07, hw - 0.07, 1.2, 1.25, G.zA + 0.02, L / 2 - 0.14, paint, PART.hood));
  grille(parts, hw, L, 1.25);
  parts.push(slab(-hw - 0.03, hw + 0.03, 0.46, 0.72, L / 2 - 0.08, L / 2 + 0.12, BUMPER, PART.bumperF));
  parts.push(slab(-hw + 0.1, hw - 0.1, 0.42, yFloor, G.sideRear, G.zA, CARPET));
  for (const sd of [1, -1]) {
    parts.push(slab(sd * (hw - 0.1), sd * hw, 0.42, G.yB, G.sideRear, G.zA, paint, sd > 0 ? PART.doorL : PART.doorR));
    mirror(parts, sd, hw, G);
  }
  interior(parts, G, hw, yFloor, false);
  // The cargo box, hollow now (data/decks.js vanCargo: a floor you walk): a floor at 0.62, walls up to the roof, the
  // sliding door run back open on the kerb (right) side, the split rear doors swung round flat against the sides.
  const zr = -L / 2 + 0.06, zs = G.sideRear, top = G.yR, yf = 0.62, wall = '#4b4640';
  parts.push(slab(-hw + 0.06, hw - 0.06, 0.42, yf, zr, zs, '#3a3530'));                                  // cargo floor
  for (let k = 0; k < 6; k++) { const z = zr + 0.3 + k * ((zs - zr - 0.6) / 5); parts.push(slab(-hw + 0.1, hw - 0.1, yf, yf + 0.012, z - 0.025, z + 0.025, '#2a2622')); } // floor battens
  parts.push(slab(hw - 0.08, hw, 0.42, top, zr, zs, paint));                                              // left wall
  parts.push(slab(hw - 0.1, hw - 0.08, yf, top - 0.05, zr + 0.05, zs, wall));                             // its lining
  parts.push(slab(-hw, -hw + 0.08, 0.42, top, zr, -0.55, paint));                                        // right wall, behind the door
  parts.push(slab(-hw, -hw + 0.08, 0.42, top, 0.5, zs, paint));                                          // and in front of it
  parts.push(slab(-hw, -hw + 0.08, top - 0.16, top, -0.55, 0.5, paint));                                 // over the door
  parts.push(slab(-hw - 0.07, -hw - 0.01, 0.5, top - 0.12, -1.65, -0.55, paint, PART.doorR2));           // the sliding door, run back
  parts.push(slab(-hw - 0.075, -hw - 0.068, 1.1, 1.16, -0.95, -0.75, CHROME, PART.doorR2));              // its handle
  for (const sd of [1, -1]) {
    parts.push(slab(sd * 0.82, sd * hw, 0.42, top, zr, zr + 0.08, paint, PART.bumperR));                 // rear corner posts
    parts.push(slab(sd * (hw + 0.01), sd * (hw + 0.06), 0.5, top - 0.1, zr - 0.02, zr + 0.8, paint, PART.bumperR)); // rear door, swung flat
    parts.push(slab(sd * (hw + 0.06), sd * (hw + 0.075), 1.1, 1.6, zr + 0.6, zr + 0.75, '#22313a', PART.bumperR)); // its window
  }
  parts.push(slab(-0.82, 0.82, top - 0.14, top, zr, zr + 0.08, paint));                                   // over the rear doors
  // Inside: a bench down the driver's side, a steel locker at the back, a mattress on the floor across from it, a
  // jerry can, a crate, a lantern. Seen from above once the roof cuts away.
  parts.push(slab(0.56, 1.0, yf, yf + 0.42, -0.95, 0.35, SEAT));                                          // bench
  parts.push(slab(0.92, 1.0, yf + 0.42, yf + 0.95, -0.95, 0.35, SEAT));                                   // its back
  parts.push(slab(0.5, 1.0, yf, yf + 1.25, -2.56, -1.72, '#5d5850'));                                     // locker
  for (const z of [-2.43, -2.15, -1.86]) parts.push(slab(0.49, 0.5, yf + 0.1, yf + 1.15, z - 0.005, z + 0.005, '#2c2a27')); // its door seams
  parts.push(slab(0.5, 0.97, yf + 1.25, yf + 1.27, -2.53, -1.75, '#7a756c'));
  parts.push(slab(-1.0, -0.12, yf, yf + 0.16, -2.56, -0.95, '#8c816b'));                                  // mattress
  parts.push(slab(-0.98, -0.14, yf + 0.16, yf + 0.19, -1.85, -0.97, '#56663f'));                          // a blanket over half of it
  parts.push(slab(-0.92, -0.2, yf + 0.16, yf + 0.24, -2.52, -2.22, '#ddd5c2'));                           // pillow
  parts.push(slab(0.1, 0.42, yf, yf + 0.42, -2.55, -2.25, '#7a2a1c'));                                    // jerry can
  parts.push(slab(0.06, 0.48, yf, yf + 0.36, -2.2, -1.82, '#6b5537'));                                    // crate
  parts.push(tag(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 8).translate(0.75, yf + 0.53, 0.1).toNonIndexed(), '#c9a24a', PART.body)); // lantern on the bench
  greenhouse(parts, G, '#cfc8bb', paint);
  parts.push(slab(-hw - 0.03, hw + 0.03, 0.46, 0.72, -L / 2 - 0.12, -L / 2 + 0.08, BUMPER, PART.bumperR));
  parts.push(slab(-0.22, 0.22, 0.55, 0.68, -L / 2 - 0.14, -L / 2 - 0.12, PLATE, PART.bumperR));
  // A ladder up the left flank by the back (data/decks.js vanRoof): E at its foot climbs onto the roof.
  for (const z of [-2.42, -1.98]) parts.push(beam([hw + 0.07, 0.45, z], [hw + 0.07, G.yR + 0.12, z], 0.03, CHROME));
  for (let k = 0; k < 5; k++) { const y = 0.65 + k * 0.32; parts.push(beam([hw + 0.07, y, -2.42], [hw + 0.07, y, -1.98], 0.025, CHROME)); }
  // The roof rack and its load ride the roof panel (greenhouse() put it in ROOF): they lift away with it.
  const R = ROOF ?? parts;
  const y = G.yR + 0.15;
  for (const x of [-hw + 0.25, hw - 0.25]) R.push(beam([x, y, G.roofR + 0.25], [x, y, G.roofF - 0.35], 0.05, '#1e1e1e'));
  for (let k = 0; k < 5; k++) { const z = G.roofR + 0.25 + k * ((G.roofF - G.roofR - 0.6) / 4); R.push(beam([-hw + 0.25, y, z], [hw - 0.25, y, z], 0.04, '#1e1e1e')); }
  R.push(slab(-0.6, 0.15, y + 0.03, y + 0.43, -1.6, -0.9, '#6b5537'));
  R.push(slab(0.25, 0.75, y + 0.03, y + 0.33, -1.5, -1.05, '#5c4a32'));
  R.push(tag(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 14).translate(0.2, y + 0.14, 0.1).toNonIndexed(), TYRE, PART.body));
  R.push(slab(-0.8, 0.8, y + 0.03, y + 0.25, -2.3, -1.85, '#4b5338'));
  axle(parts, L / 2 - 0.9, 0.42, 0.32, hw - 0.1, true);
  axle(parts, -L / 2 + 0.9, 0.42, 0.32, hw - 0.1, false);
}

// ---- the RV --------------------------------------------------------------------------------------------

// A home on wheels (data/decks.js rvCoach): a van's cab, then a tall coach you walk round in. Built to the deck's
// numbers so what you see is what you bump into: the bed across the back, the wardrobe, the kitchenette down the
// driver's side (stove, sink, cupboards), the dinette across from it, a locker by the door on the kerb side. The coach
// roof, the bunk over the cab and the cab's own roof lift away while you are inside (ROOF). Painted window strips,
// a faded stripe, a ladder and a spare on the back wall, a solar panel and a vent on the roof.
function rvBody(parts, s, paint) {
  const L = s.len, hw = s.wid / 2, G = GREENHOUSE.rv, yCab = 0.75, yf = 0.95, top = 3.05;
  const zr = -L / 2 + 0.1, zc = G.zC, low = '#5d4c3a', cream = '#d8cfbd', glass = '#1f2b33', stripe = '#b8742c';
  const R = ROOF ?? parts;
  // Nose, hood, grille, bumper; the cab tub, its doors, mirrors, seats and dash; the greenhouse.
  parts.push(slab(-hw + 0.05, hw - 0.05, 0.42, 1.38, G.zA - 0.05, L / 2 - 0.06, paint));
  parts.push(slab(-hw + 0.1, hw - 0.1, 1.38, 1.43, G.zA + 0.02, L / 2 - 0.15, paint, PART.hood));
  grille(parts, hw - 0.05, L, 1.43);
  parts.push(slab(-hw - 0.02, hw + 0.02, 0.46, 0.74, L / 2 - 0.08, L / 2 + 0.12, BUMPER, PART.bumperF));
  parts.push(slab(-hw + 0.1, hw - 0.1, 0.42, yCab, zc, G.zA, CARPET));
  for (const sd of [1, -1]) {
    parts.push(slab(sd * (hw - 0.1), sd * hw, 0.42, G.yB, zc + 0.1, G.zA, paint, sd > 0 ? PART.doorL : PART.doorR));
    mirror(parts, sd, hw, G);
  }
  interior(parts, G, hw, yCab, false);
  greenhouse(parts, G, cream, paint);
  // The coach: a skirt, the floor, the walls (a door gap on the kerb side), the back wall.
  parts.push(slab(-hw, hw, 0.42, 0.88, zr, zc, low));
  parts.push(slab(-hw + 0.08, hw - 0.08, 0.88, yf, zr + 0.08, zc, '#6e6250'));                             // linoleum
  parts.push(slab(hw - 0.08, hw, 0.88, top, zr, zc + 0.12, paint));                                         // left wall
  parts.push(slab(-hw, -hw + 0.08, 0.88, top, zr, 0.62, paint));                                            // right wall, behind the door
  parts.push(slab(-hw, -hw + 0.08, 0.88, top, 1.48, zc + 0.12, paint));                                     // and in front of it
  parts.push(slab(-hw, -hw + 0.08, 2.7, top, 0.62, 1.48, paint));                                           // over the door
  parts.push(slab(-hw - 0.07, -hw - 0.01, yf, 2.68, -0.24, 0.62, paint, PART.doorR2));                     // the door, open flat against the wall
  parts.push(slab(-hw - 0.08, -hw - 0.07, 1.9, 2.35, -0.12, 0.3, glass, PART.doorR2));                      // its window
  parts.push(slab(-hw - 0.36, -hw, 0.45, 0.6, 0.66, 1.44, '#2a2724'));                                      // the step
  parts.push(slab(-hw, hw, 0.88, top, zr, zr + 0.08, paint, PART.bumperR));                                 // back wall
  parts.push(slab(-hw + 0.08, hw - 0.08, 2.75, top, zc - 0.04, zc + 0.12, paint));                          // header over the cab
  for (const sd of [1, -1]) {
    // Windows (painted glass in a pale frame) where the deck says you can shoot out, and the stripe down the side.
    for (const [z0, z1] of sd > 0 ? [[-3.5, -2.6], [-1.55, -0.35], [0.6, 1.5]] : [[-3.5, -2.6], [-2.2, -1.05]]) {
      parts.push(slab(sd * hw, sd * (hw + 0.012), 1.62, 2.48, z0 - 0.05, z1 + 0.05, cream));
      parts.push(slab(sd * (hw + 0.012), sd * (hw + 0.022), 1.67, 2.43, z0, z1, glass));
    }
    parts.push(slab(sd * hw, sd * (hw + 0.012), 1.18, 1.34, zr + 0.1, zc + 0.1, stripe));
    parts.push(slab(sd * hw, sd * (hw + 0.012), 1.38, 1.44, zr + 0.1, zc + 0.1, '#8a5a2a'));
  }
  parts.push(slab(-0.85, 0.85, 1.62, 2.48, zr - 0.012, zr, cream));                                         // rear window
  parts.push(slab(-0.8, 0.8, 1.67, 2.43, zr - 0.022, zr - 0.012, glass));
  // The tail: bumper, plate, a spare on the back wall, a ladder up to the roof.
  parts.push(slab(-hw - 0.02, hw + 0.02, 0.46, 0.72, -L / 2 - 0.12, -L / 2 + 0.1, BUMPER, PART.bumperR));
  parts.push(slab(-0.22, 0.22, 0.55, 0.68, -L / 2 - 0.14, -L / 2 - 0.12, PLATE, PART.bumperR));
  parts.push(tag(new THREE.CylinderGeometry(0.42, 0.42, 0.26, 14).rotateX(Math.PI / 2).translate(-0.55, 1.3, zr - 0.15).toNonIndexed(), TYRE, PART.bumperR));
  for (const x of [0.55, 0.95]) parts.push(beam([x, 0.8, zr - 0.08], [x, top + 0.1, zr - 0.08], 0.04, CHROME));
  for (let k = 0; k < 7; k++) { const y = 1.0 + k * 0.3; parts.push(beam([0.55, y, zr - 0.08], [0.95, y, zr - 0.08], 0.03, CHROME)); }
  // Inside (body frame, floor at yf): the bed, the wardrobe, the kitchenette, the dinette, the locker, a rug, a cooler.
  parts.push(slab(-1.17, 1.17, yf, yf + 0.4, zr + 0.08, -2.42, '#4a3f33'));                                 // bed frame
  parts.push(slab(-1.12, 1.12, yf + 0.4, yf + 0.57, zr + 0.12, -2.46, '#c8bda3'));                          // mattress
  parts.push(slab(-0.55, 1.12, yf + 0.57, yf + 0.61, zr + 0.14, -2.48, '#5c6b4a'));                         // a blanket, turned down
  for (const z of [-3.6, -2.95]) parts.push(slab(-1.08, -0.72, yf + 0.57, yf + 0.66, z - 0.25, z + 0.25, '#e2dccb')); // pillows
  parts.push(slab(0.66, 1.17, yf, yf + 1.9, -2.38, -1.86, '#7a6248'));                                      // wardrobe
  parts.push(slab(0.65, 0.66, yf + 0.1, yf + 1.8, -2.125, -2.115, '#3a2e22'));
  parts.push(slab(0.62, 1.17, yf, yf + 0.88, -1.62, -0.2, '#8a7458'));                                      // counter and cupboards
  parts.push(slab(0.6, 1.17, yf + 0.88, yf + 0.92, -1.64, -0.18, '#bdb3a0'));                               // worktop
  for (const z of [-1.37, -0.91, -0.46]) parts.push(slab(0.61, 0.62, yf + 0.1, yf + 0.8, z - 0.005, z + 0.005, '#4a3c2c'));
  for (const [x, z] of [[0.95, -0.6], [0.95, -0.33], [0.78, -0.6], [0.78, -0.33]])                       // stove: four burners
    parts.push(tag(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 10).translate(x, yf + 0.93, z).toNonIndexed(), '#1c1a18', PART.body));
  parts.push(slab(0.72, 1.06, yf + 0.86, yf + 0.925, -1.05, -0.8, '#8e9696'));                              // sink
  parts.push(beam([1.08, yf + 0.92, -0.92], [1.0, yf + 1.12, -0.92], 0.03, CHROME));                         // tap
  parts.push(slab(-1.17, -0.5, yf + 0.66, yf + 0.74, -2.05, -1.3, '#9a7a52'));                              // table
  parts.push(slab(-0.86, -0.8, yf, yf + 0.66, -1.7, -1.64, '#3a2e22'));
  for (const [z0, z1, zb] of [[-2.36, -2.08, -2.36], [-1.27, -0.98, -1.06]]) {                             // dinette benches
    parts.push(slab(-1.17, -0.5, yf, yf + 0.45, z0, z1, SEAT));
    parts.push(slab(-1.17, -0.5, yf + 0.45, yf + 1.0, zb, zb + 0.08, SEAT));
  }
  parts.push(tag(new THREE.CylinderGeometry(0.06, 0.08, 0.2, 8).translate(-0.8, yf + 0.84, -1.5).toNonIndexed(), '#c9a24a', PART.body)); // lantern
  parts.push(slab(0.66, 1.17, yf, yf + 1.8, 0.05, 0.62, '#6b5a44'));                                        // locker
  parts.push(slab(0.65, 0.66, yf + 0.1, yf + 1.7, 0.33, 0.34, '#3a2e22'));
  parts.push(slab(-0.42, 0.5, yf, yf + 0.012, -1.95, 1.3, '#6a3b2a'));                                      // rug
  parts.push(slab(-1.1, -0.75, yf, yf + 0.4, 1.55, 1.78, '#3f6a6e'));                                       // a cooler by the cab
  // The roof (it lifts away while you are inside): the coach roof, the bunk over the cab, a vent, a solar panel.
  R.push(slab(-hw, hw, top, top + 0.1, zr, zc + 0.12, cream));
  R.push(slab(-hw + 0.04, hw - 0.04, 2.24, top + 0.06, zc, G.roofF + 0.42, cream));
  R.push(slab(-hw + 0.1, hw - 0.1, 2.3, 2.62, G.roofF + 0.42, G.roofF + 0.5, glass));                        // the bunk's front window
  R.push(slab(-0.35, 0.35, top + 0.1, top + 0.32, -1.2, -0.6, '#bdb6a8'));                                  // vent hood
  R.push(slab(-0.95, 0.95, top + 0.1, top + 0.16, -3.4, -1.9, '#2a3640'));                                  // solar panel
  for (let k = 0; k < 4; k++) { const z = -3.38 + k * 0.37; R.push(slab(-0.93, 0.93, top + 0.16, top + 0.17, z, z + 0.01, '#55646e')); }
  axle(parts, L / 2 - 0.95, 0.5, 0.34, hw - 0.14, true);
  axle(parts, -1.75, 0.52, 0.44, hw - 0.18, false);
}

// ---- the trundle (the SUN LINE's coach, systems/travel.js) -------------------------------------------------------------
// A long steel coach in two tones, its window band behind welded mesh and a few plated panes, a ram bar, the destination
// board lit amber over the windshield, and a roof rack loaded with riders' bags: from the street camera, the roof is it.
function busBody(parts, s, paint) {
  const L = s.len, hw = s.wid / 2, BONE = '#d8cdb4', GLASS = '#22282a', PLATE = '#5a5550', RACK = '#1e1e1e';
  const zF = L / 2, zR = -L / 2;
  parts.push(slab(-hw + 0.25, hw - 0.25, 0.42, 0.62, zR + 0.4, zF - 0.4, '#222222', PART.frame));        // chassis
  // Hollow (data/decks.js busAisle: an aisle you walk): a floor at 0.65, the lower walls up to the window band, the
  // band's glass as thin panes on both sides, the upper walls, and the roof (ROOF: it lifts away while you are inside).
  const yf = 0.65, R = ROOF ?? parts, FLOOR = '#3a3834', SEAT = '#8a5232', SEATBACK = '#6a3a24';
  parts.push(slab(-hw, hw, 0.55, yf, zR + 0.05, zF - 0.12, '#2e2a26'));                                    // the floor pan
  parts.push(slab(-hw + 0.08, hw - 0.08, yf, yf + 0.01, zR + 0.12, zF - 0.6, FLOOR));                     // ribbed floor
  parts.push(slab(hw - 0.08, hw, 0.55, 1.3, zR + 0.05, zF - 0.12, paint));                                 // lower walls: the driver's side
  parts.push(slab(-hw, -hw + 0.08, 0.55, 1.3, zR + 0.05, zF - 2.0, paint));                                // kerb side, behind the door
  parts.push(slab(-hw, -hw + 0.08, 0.55, 1.3, zF - 1.0, zF - 0.12, paint));                                // and in front of it
  parts.push(slab(-hw, hw, 0.55, 2.92, zR + 0.05, zR + 0.15, paint, PART.bumperR));                        // back wall
  parts.push(slab(-hw - 0.01, hw + 0.01, 1.08, 1.16, zR + 0.1, zF - 0.2, '#3a2a1e'));                    // a dark rub strip
  // The window band: dark glass panes, paint pillars, steel mesh over the front panes, plates welded over two of them.
  for (const sd of [1, -1]) parts.push(slab(sd * (hw - 0.05), sd * (hw - 0.02), 1.3, 2.32, zR + 0.15, zF - 0.6, GLASS));
  for (let z = zR + 0.3; z < zF - 0.7; z += 1.4) for (const sd of [1, -1]) parts.push(slab(sd * (hw - 0.04), sd * hw, 1.3, 2.32, z, z + 0.16, paint));
  for (const sd of [1, -1]) {
    parts.push(slab(sd * (hw - 0.01), sd * (hw + 0.04), 1.32, 2.28, zR + 1.9, zR + 3.2, PLATE));
    parts.push(slab(sd * (hw - 0.01), sd * (hw + 0.04), 1.32, 2.28, zR + 5.4, zR + 6.6, PLATE));
    for (let y = 1.42; y < 2.3; y += 0.22) parts.push(slab(sd * hw, sd * (hw + 0.025), y, y + 0.03, zF - 3.6, zF - 0.75, '#4a4642'));
    parts.push(slab(sd * (hw - 0.08), sd * hw, 2.32, 2.92, zR + 0.05, zF - 0.15, BONE));                    // upper walls
  }
  // The door on the kerb (right) side, up front.
  parts.push(slab(-hw - 0.02, -hw + 0.02, 0.6, 2.3, zF - 2.0, zF - 1.0, '#3a3532', PART.doorR));
  // Inside: four rows of benches either side of the aisle, the driver's seat and dash, the luggage racks at the back.
  for (const z of [2.6, 1.1, -0.4, -1.9]) for (const sd of [1, -1]) {
    parts.push(slab(sd * 0.36, sd * (hw - 0.08), yf, yf + 0.45, z - 0.3, z + 0.3, SEAT));
    parts.push(slab(sd * 0.36, sd * (hw - 0.08), yf + 0.45, yf + 1.0, z - 0.32, z - 0.22, SEATBACK));
  }
  parts.push(slab(0.3, hw - 0.08, yf, yf + 0.5, 4.0, 4.5, SEAT));                                          // the driver's seat
  parts.push(slab(0.3, hw - 0.08, yf + 0.5, yf + 1.0, 4.0, 4.08, SEAT));
  parts.push(slab(-hw + 0.08, hw - 0.08, yf, yf + 1.0, 4.6, zF - 0.62, '#2a2826'));                        // the dash
  parts.push(slab(-hw + 0.08, hw - 0.08, yf, yf + 0.9, zR + 0.15, -4.3, '#3a3128'));                       // luggage racks
  for (const [x, z, c] of [[-0.6, -4.7, '#6b5537'], [0.1, -4.8, '#4b5338'], [0.7, -4.6, '#5c4a32']]) parts.push(slab(x - 0.3, x + 0.3, yf + 0.9, yf + 1.25, z - 0.25, z + 0.25, c));
  R.push(slab(-hw - 0.01, hw + 0.01, 2.85, 2.92, zR + 0.05, zF - 0.15, BONE));                            // the ceiling
  R.push(slab(-hw + 0.04, hw - 0.04, 2.92, 3.0, zR + 0.15, zF - 0.3, paint));                              // roof skin: the line's colour, read from above
  // The nose: windshield, the amber destination board, grille, the ram bar, bumpers.
  parts.push(slab(-hw + 0.12, hw - 0.12, 1.35, 2.3, zF - 0.62, zF - 0.5, GLASS));
  parts.push(slab(-hw + 0.2, hw - 0.2, 2.42, 2.78, zF - 0.2, zF - 0.1, '#e0a030', PART.light));
  parts.push(slab(-hw + 0.5, hw - 0.5, 0.65, 1.05, zF - 0.14, zF - 0.06, GRILLE));
  parts.push(slab(-hw - 0.04, hw + 0.04, 0.5, 0.78, zF - 0.1, zF + 0.16, BUMPER, PART.bumperF));
  for (const x of [-0.9, -0.3, 0.3, 0.9]) parts.push(slab(x - 0.05, x + 0.05, 0.55, 1.2, zF + 0.16, zF + 0.32, '#4a4642', PART.bumperF));
  parts.push(slab(-hw + 0.1, hw - 0.1, 1.1, 1.18, zF + 0.16, zF + 0.32, '#4a4642', PART.bumperF));
  // The tail: engine grille, ladder to the rack, bumper.
  parts.push(slab(-hw + 0.3, hw - 0.3, 0.7, 1.9, zR - 0.02, zR + 0.06, GRILLE, PART.bumperR));
  for (const x of [0.6, 1.0]) parts.push(slab(x - 0.03, x + 0.03, 1.2, 3.0, zR - 0.08, zR - 0.02, RACK, PART.bumperR));
  parts.push(slab(-hw - 0.03, hw + 0.03, 0.5, 0.78, zR - 0.16, zR + 0.06, BUMPER, PART.bumperR));
  // The roof: rack rails, cross bars, the riders' bags and crates, a spare, a hatch, a sand stripe down the middle.
  const y = 3.05;
  for (const x of [-hw + 0.2, hw - 0.2]) R.push(beam([x, y + 0.12, zR + 0.6], [x, y + 0.12, zF - 1.2], 0.06, RACK));
  for (let z = zR + 0.6; z <= zF - 1.1; z += 1.15) R.push(beam([-hw + 0.2, y + 0.12, z], [hw - 0.2, y + 0.12, z], 0.05, RACK));
  R.push(slab(-0.22, 0.22, 3.0, 3.03, zR + 0.4, zF - 0.5, BONE));                                   // the line's stripe
  R.push(slab(-hw + 0.04, hw - 0.04, 3.0, 3.03, zF - 0.75, zF - 0.32, BONE));                         // a bone nose band
  const bags = [[-0.7, -3.6, 0.9, 0.5, 0.45, '#5c4a32'], [0.45, -3.3, 0.7, 0.6, 0.4, '#6b5537'], [-0.4, -2.1, 0.8, 0.5, 0.35, '#4b5338'], [0.6, -1.4, 0.6, 0.7, 0.4, '#7a5a3a'],
    [-0.6, 0.2, 0.7, 0.45, 0.5, '#3e4a46'], [0.5, 0.9, 0.8, 0.55, 0.42, '#5c4a32'], [-0.5, 1.9, 0.6, 0.6, 0.38, '#6a4a32']];
  for (const [x, z, w, d, h, c] of bags) R.push(slab(x - w / 2, x + w / 2, y, y + h, z - d / 2, z + d / 2, c));
  R.push(tag(new THREE.CylinderGeometry(0.5, 0.5, 0.26, 14).translate(0.35, y + 0.15, 2.9).toNonIndexed(), TYRE, PART.body));
  R.push(slab(-0.45, 0.45, 3.0, 3.12, zF - 2.6, zF - 1.8, '#4a4642'));
  // Wheels: one steer axle, a doubled rear.
  axle(parts, zF - 1.9, 0.55, 0.38, hw - 0.12, true);
  axle(parts, zR + 2.0, 0.55, 0.38, hw - 0.12, false);
  axle(parts, zR + 3.15, 0.55, 0.38, hw - 0.12, false);
}

// ---- the Whaler -------------------------------------------------------------------------------------

// A long-nose armoured cab (the harpoon truck), then the flatbed with its rails, turret and drums.
function rigBody(parts, s, paint) {
  const L = s.len, hw = s.wid / 2, G = GREENHOUSE.rig, yFloor = 1.15;
  parts.push(slab(-0.5, 0.5, 0.62, 0.86, -L / 2 + 0.2, L / 2 - 0.1, '#222222', PART.frame));            // ladder frame
  parts.push(slab(-hw + 0.15, hw - 0.15, 0.8, 1.84, G.zA - 0.05, L / 2 - 0.05, paint));                // nose
  parts.push(slab(-hw + 0.2, hw - 0.2, 1.84, 1.9, G.zA + 0.03, L / 2 - 0.15, paint, PART.hood));
  parts.push(slab(-hw + 0.4, hw - 0.4, 0.95, 1.7, L / 2 - 0.08, L / 2, GRILLE));
  for (let k = 0; k < 5; k++) { const y = 1.0 + k * 0.16; parts.push(slab(-hw + 0.42, hw - 0.42, y, y + 0.03, L / 2 - 0.03, L / 2 + 0.01, CHROME)); }
  parts.push(slab(-hw - 0.1, hw + 0.1, 0.7, 1.1, L / 2 - 0.1, L / 2 + 0.3, '#5a5550', PART.bumperF));    // ram bumper
  for (let i = -2; i <= 2; i++) parts.push(coloredBox(0.15, 0.15, 0.8, i * 0.5, 0.9, L / 2 + 0.5, '#8a8580', PART.bumperF));
  // Steer axle under the long nose, with flared fenders: the shoulders a conventional truck is read by.
  const zf = L / 2 - 0.75;
  for (const sd of [1, -1]) {
    parts.push(slab(sd * (hw - 0.42), sd * (hw + 0.06), 1.1, 1.22, zf - 0.64, zf + 0.6, paint));
    parts.push(slab(sd * (hw - 0.42), sd * (hw + 0.06), 0.74, 1.16, zf + 0.54, zf + 0.64, paint));
  }
  // Cab: floor, armoured doors, mirrors, exhaust stacks, interior, back wall.
  parts.push(slab(-hw + 0.12, hw - 0.12, 0.8, yFloor, G.zC, G.zA, CARPET));
  for (const sd of [1, -1]) {
    const part = sd > 0 ? PART.doorL : PART.doorR;
    parts.push(slab(sd * (hw - 0.12), sd * hw, 0.8, G.yB, G.zC, G.zA, paint, part));
    parts.push(slab(sd * hw, sd * (hw + 0.05), 1.0, G.yB - 0.12, G.zC + 0.12, G.zA - 0.12, '#46423c', part)); // bolt-on plate
    mirror(parts, sd, hw, G);
    parts.push(beam([sd * (hw - 0.3), 1.2, G.zC - 0.24], [sd * (hw - 0.3), 3.15, G.zC - 0.24], 0.14, CHROME));
  }
  interior(parts, G, hw, yFloor, false);
  parts.push(slab(-hw + 0.12, hw - 0.12, yFloor, G.yB, G.zC, G.zC + 0.1, paint));
  greenhouse(parts, G, paint, paint);
  // The flatbed: deck, rear wall, side rails, harpoon turret and barrel, fuel drums.
  parts.push(slab(-hw, hw, 0.9, 1.5, -L / 2 + 0.2, G.zC - 0.4, '#3b3632'));
  parts.push(slab(-hw, hw, 1.45, 2.35, -L / 2 + 0.1, -L / 2 + 0.3, '#4a3a2a', PART.bumperR));
  for (const sd of [1, -1]) parts.push(slab(sd * (hw - 0.2), sd * hw, 1.45, 2.35, -L / 2 + 0.3, G.zC - 0.45, '#4a3a2a'));
  parts.push(slab(-0.55, 0.55, 1.65, 2.55, -2.35, -1.25, '#2d2a28'));
  parts.push(slab(-0.15, 0.15, 2.55, 2.85, -2.6, -0.2, '#6a6560'));
  for (const x of [-0.7, 0.7]) parts.push(slab(x - 0.4, x + 0.4, 1.5, 2.3, -3.6, -2.8, '#7a3a1c'));
  axle(parts, zf, 0.55, 0.42, hw - 0.18, true);
  axle(parts, -L / 2 + 1.4, 0.55, 0.42, hw - 0.15, false);
  axle(parts, -L / 2 + 2.6, 0.55, 0.42, hw - 0.15, false);
}

// ---- the buggy --------------------------------------------------------------------------------------

// An open tube-frame: tub, nose cone, roll cage, harnessed buckets, rear engine, fat rears.
function buggyBody(parts, s, paint) {
  const L = s.len, hw = s.wid / 2;
  parts.push(slab(-hw + 0.22, hw - 0.22, 0.42, 0.92, -L / 2 + 0.35, L / 2 - 0.4, paint));
  parts.push(slab(-0.52, 0.52, 0.48, 0.86, L / 2 - 0.45, L / 2 - 0.04, paint, PART.hood));
  const pF = 0.32, pR = -0.92, yT = 1.95, xo = 0.68, xi = 0.6;
  for (const sd of [1, -1]) {
    parts.push(beam([sd * xo, 0.92, pF + 0.08], [sd * xi, yT, pF], 0.07, CAGE));
    parts.push(beam([sd * xo, 0.92, pR - 0.08], [sd * xi, yT, pR], 0.07, CAGE));
    parts.push(beam([sd * xi, yT, pF], [sd * xi, yT, pR], 0.07, CAGE));
    parts.push(beam([sd * xo, 0.92, pF + 0.08], [sd * 0.5, 0.75, L / 2 - 0.35], 0.06, CAGE));
  }
  parts.push(beam([-xi, yT, pF], [xi, yT, pF], 0.07, CAGE));
  parts.push(beam([-xi, yT, pR], [xi, yT, pR], 0.07, CAGE));
  parts.push(beam([xi, yT, pR], [-xo, 0.92, pR - 0.08], 0.06, CAGE));
  for (const x of [0.36, -0.36]) {
    parts.push(slab(x - 0.22, x + 0.22, 0.92, 1.06, -0.55, -0.05, '#1d1b19'));
    parts.push(slab(x - 0.22, x + 0.22, 1.06, 1.62, -0.66, -0.54, '#1d1b19'));
    parts.push(slab(x - 0.12, x - 0.08, 1.06, 1.63, -0.67, -0.1, '#8a6a2a')); // harness
    parts.push(slab(x + 0.08, x + 0.12, 1.06, 1.63, -0.67, -0.1, '#8a6a2a'));
  }
  parts.push(tag(new THREE.TorusGeometry(0.15, 0.022, 5, 14).rotateX(-0.95).translate(0.36, 1.32, 0.18).toNonIndexed(), WHEEL, PART.frame));
  parts.push(slab(-0.48, 0.48, 0.62, 1.22, -L / 2 + 0.25, -L / 2 + 0.95, '#3a3632'));                 // air-cooled engine
  for (const x of [-0.22, 0.22]) parts.push(beam([x, 0.95, -L / 2 + 0.3], [x * 1.4, 1.25, -L / 2 - 0.12], 0.08, CHROME));
  parts.push(tag(new THREE.TorusGeometry(0.34, 0.11, 6, 16).translate(0, 1.5, pR - 0.1).toNonIndexed(), TYRE, PART.frame)); // spare on the hoop
  parts.push(beam([-0.72, 0.62, L / 2 + 0.06], [0.72, 0.62, L / 2 + 0.06], 0.07, CAGE, PART.bumperF));     // nerf bars
  parts.push(beam([-0.72, 0.62, -L / 2 - 0.06], [0.72, 0.62, -L / 2 - 0.06], 0.07, CAGE, PART.bumperR));
  axle(parts, L / 2 - 0.68, 0.42, 0.26, hw - 0.1, true);
  axle(parts, -L / 2 + 0.72, 0.55, 0.46, hw - 0.12, false);
}

// ---- the ATV ----------------------------------------------------------------------------------------

// A four-wheeler: tube frame, plastic fenders over fat tyres, a straddle seat, wide bars, racks front and back with
// a jerry can strapped on. The rider sits it like a bike (seat pose 'bike'), but it doesn't lean.
function atvBody(parts, s, paint) {
  const L = s.len, hw = s.wid / 2, za = L / 2 - 0.45;
  parts.push(slab(-0.26, 0.26, 0.32, 0.5, -0.95, 0.95, CAGE, PART.frame));                         // frame rails
  parts.push(slab(-hw + 0.02, hw - 0.02, 0.6, 0.7, za - 0.38, L / 2 - 0.02, paint, PART.bumperF));  // front fenders
  parts.push(slab(-0.32, 0.32, 0.5, 0.74, L / 2 - 0.12, L / 2 + 0.06, paint, PART.bumperF));        // nose cowl
  parts.push(slab(-hw + 0.02, hw - 0.02, 0.62, 0.72, -L / 2 + 0.02, -za + 0.38, paint, PART.bumperR)); // rear fenders
  parts.push(slab(-0.24, 0.24, 0.58, 0.84, 0.02, 0.5, paint, PART.hood));                           // tank / body
  parts.push(slab(-0.2, 0.2, 0.76, 0.9, -0.62, 0.08, '#1a1816'));                                  // seat
  parts.push(slab(-0.22, 0.22, 0.28, 0.56, -0.24, 0.3, '#3a3632'));                                 // engine
  parts.push(beam([0, 0.72, 0.5], [0, 1.0, 0.42], 0.05, CHROME));                                   // steering stem
  parts.push(beam([-0.38, 1.02, 0.42], [0.38, 1.02, 0.42], 0.045, CHROME));                         // bars
  for (const x of [-0.38, 0.38]) parts.push(slab(x - 0.05, x + 0.05, 0.99, 1.05, 0.36, 0.48, '#151413')); // grips
  for (const zr of [[za - 0.25, L / 2 - 0.08], [-L / 2 + 0.08, -za + 0.25]]) {                      // racks
    const y = zr[0] > 0 ? 0.76 : 0.78;
    for (const x of [-0.42, 0.42]) parts.push(beam([x, y, zr[0]], [x, y, zr[1]], 0.035, CAGE));
    for (let k = 0; k < 3; k++) { const z = zr[0] + (k / 2) * (zr[1] - zr[0]); parts.push(beam([-0.42, y, z], [0.42, y, z], 0.03, CAGE)); }
  }
  parts.push(slab(-0.18, 0.18, 0.8, 1.12, -L / 2 + 0.2, -L / 2 + 0.42, '#7a2a1c'));                // jerry can on the back rack
  parts.push(beam([-0.24, 0.45, -0.28], [-0.3, 0.6, -L / 2 - 0.02], 0.06, CHROME));                // exhaust
  axle(parts, za, 0.33, 0.27, hw - 0.14, true);
  axle(parts, -za, 0.35, 0.3, hw - 0.15, false);
}

// ---- military (the Federal Remnant's motor pool) ----------------------------------------------------
// Generic shapes, no make or model: a high-riding four-door utility truck and an eight-wheeled armoured carrier.

// The patrol truck: flat hood and slab fenders, a four-door armoured cab with a ring mount on the roof, a canvas-topped
// cargo box behind, a winch bumper and brush guard in front, big off-road tyres, the spare on the tail.
function patrolBody(parts, s, paint) {
  const L = s.len, hw = s.wid / 2, G = GREENHOUSE.patrol, yHood = 1.24, yFloor = 0.78, r = 0.5, zf = L / 2 - 0.98, zr = -L / 2 + 1.0;
  const dark = '#3c3f2e', plate = '#4e523a', canvas = '#7b7456';
  // Tub, hood (tears off), a raised intake, the grille.
  parts.push(slab(-hw + 0.06, hw - 0.06, 0.62, yHood - 0.06, -L / 2 + 0.12, L / 2 - 0.06, paint));
  parts.push(slab(-hw + 0.1, hw - 0.1, yHood - 0.06, yHood, G.zA + 0.02, L / 2 - 0.18, paint, PART.hood));
  parts.push(slab(-0.4, 0.4, yHood, yHood + 0.06, G.zA + 0.25, L / 2 - 0.45, plate, PART.hood));
  parts.push(slab(-hw + 0.3, hw - 0.3, 0.72, yHood - 0.1, L / 2 - 0.1, L / 2 - 0.02, GRILLE));
  for (let k = 0; k < 7; k++) { const x = -hw + 0.38 + k * ((2 * hw - 0.76) / 6); parts.push(slab(x - 0.025, x + 0.025, 0.74, yHood - 0.13, L / 2 - 0.04, L / 2 + 0.005, dark)); }
  // Slab fenders over the wheels, flat-topped and wide.
  for (const sd of [1, -1]) for (const z of [zf, zr]) {
    parts.push(slab(sd * (hw - 0.4), sd * (hw + 0.06), 1.04, 1.12, z - 0.62, z + 0.62, paint));
    parts.push(slab(sd * (hw - 0.02), sd * (hw + 0.06), 0.82, 1.06, z - 0.62, z - 0.54, paint));
  }
  // Winch bumper, brush guard, tow hooks.
  parts.push(slab(-hw - 0.02, hw + 0.02, 0.5, 0.82, L / 2 - 0.04, L / 2 + 0.24, '#2b2d26', PART.bumperF));
  parts.push(tag(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 10).rotateZ(Math.PI / 2).translate(0, 0.66, L / 2 + 0.14).toNonIndexed(), '#1c1c1a', PART.bumperF));
  for (const x of [-0.6, 0.6]) parts.push(beam([x, 0.8, L / 2 + 0.2], [x, 1.32, L / 2 + 0.06], 0.07, '#232320', PART.bumperF));
  parts.push(beam([-0.6, 1.3, L / 2 + 0.08], [0.6, 1.3, L / 2 + 0.08], 0.07, '#232320', PART.bumperF));
  for (const x of [-0.8, 0.8]) parts.push(slab(x - 0.06, x + 0.06, 0.55, 0.7, L / 2 + 0.24, L / 2 + 0.34, '#8a2e20', PART.bumperF));
  // The cab: floor, four armoured doors (a bolted plate on each), mirrors, the interior, the glass frame.
  const zB = (G.roofF + G.roofR) / 2 - 0.05;
  parts.push(slab(-hw + 0.1, hw - 0.1, 0.62, yFloor, G.zC, G.zA, CARPET));
  for (const sd of [1, -1]) {
    const x0 = sd * (hw - 0.1), x1 = sd * hw;
    parts.push(slab(x0, x1, 0.62, G.yB, zB, G.zA, paint, sd > 0 ? PART.doorL : PART.doorR));
    parts.push(slab(x0, x1, 0.62, G.yB, G.zC, zB, paint, sd > 0 ? PART.doorL2 : PART.doorR2));
    parts.push(slab(x1, sd * (hw + 0.035), 0.75, G.yB - 0.1, zB + 0.08, G.zA - 0.08, plate, sd > 0 ? PART.doorL : PART.doorR));
    parts.push(slab(x1, sd * (hw + 0.035), 0.75, G.yB - 0.1, G.zC + 0.08, zB - 0.08, plate, sd > 0 ? PART.doorL2 : PART.doorR2));
    parts.push(slab(sd * (hw + 0.01), sd * (hw + 0.045), G.yB - 0.2, G.yB - 0.15, G.zA - 0.45, G.zA - 0.28, '#1c1c1a', sd > 0 ? PART.doorL : PART.doorR)); // handle
    mirror(parts, sd, hw, G);
  }
  interior(parts, G, hw, yFloor, true);
  greenhouse(parts, G, paint, paint, zB);
  // Roof: an armour plate, the ring mount with a gun on its pintle and a shield in front of it.
  parts.push(slab(-G.wR / 2 + 0.05, G.wR / 2 - 0.05, G.yR + 0.07, G.yR + 0.12, G.roofR + 0.1, G.roofF - 0.1, plate));
  const rz = -0.35, ry = G.yR + 0.2;
  parts.push(tag(new THREE.TorusGeometry(0.55, 0.06, 6, 20).rotateX(Math.PI / 2).translate(0, ry, rz).toNonIndexed(), '#2a2b25', PART.frame));
  parts.push(slab(-0.05, 0.05, ry, ry + 0.42, rz + 0.45, rz + 0.55, '#222220'));
  parts.push(beam([0, ry + 0.45, rz + 0.3], [0, ry + 0.48, rz + 1.45], 0.07, '#1a1a18'));
  parts.push(slab(-0.12, 0.12, ry + 0.36, ry + 0.56, rz + 0.25, rz + 0.62, '#1a1a18'));
  parts.push(slab(-0.42, 0.42, ry + 0.15, ry + 0.75, rz + 0.66, rz + 0.7, plate));
  // The cargo box: low steel sides, a canvas top on bows.
  const zb0 = -L / 2 + 0.12, zb1 = G.zC - 0.1;
  for (const sd of [1, -1]) parts.push(slab(sd * (hw - 0.08), sd * hw, 0.62, yHood + 0.05, zb0, zb1, paint));
  parts.push(slab(-hw + 0.08, hw - 0.08, 0.62, yHood + 0.05, zb0, zb0 + 0.08, paint, PART.bumperR));
  parts.push(slab(-hw + 0.04, hw - 0.04, yHood + 0.05, 1.82, zb0 + 0.02, zb1, canvas));
  parts.push(slab(-hw + 0.24, hw - 0.24, 1.82, 1.9, zb0 + 0.02, zb1, canvas));
  for (let k = 0; k < 3; k++) { const z = zb0 + 0.15 + k * ((zb1 - zb0 - 0.3) / 2); parts.push(slab(-hw + 0.02, hw - 0.02, 1.84, 1.91, z - 0.04, z + 0.04, '#5d5842')); }
  // The tail: bumper and plate, the spare on a carrier, jerry cans, a whip antenna on the corner.
  parts.push(slab(-hw - 0.02, hw + 0.02, 0.5, 0.74, -L / 2 - 0.12, -L / 2 + 0.1, '#2b2d26', PART.bumperR));
  parts.push(slab(-0.22, 0.22, 0.55, 0.68, -L / 2 - 0.14, -L / 2 - 0.12, PLATE, PART.bumperR));
  parts.push(tag(new THREE.CylinderGeometry(0.44, 0.44, 0.3, 14).rotateX(Math.PI / 2).translate(-0.55, 1.05, -L / 2 - 0.08).toNonIndexed(), TYRE, PART.bumperR));
  for (const x of [0.45, 0.75]) parts.push(slab(x - 0.12, x + 0.12, 0.8, 1.25, -L / 2 - 0.14, -L / 2 - 0.02, '#4e5438'));
  parts.push(beam([hw - 0.15, yHood, -L / 2 + 0.25], [hw - 0.25, yHood + 2.1, -L / 2 + 0.45], 0.025, '#111'));
  axle(parts, zf, r, 0.36, hw - 0.12, true);
  axle(parts, zr, r, 0.36, hw - 0.12, false);
}

// The armoured carrier: a boat-shaped hull on eight wheels (four axles), a long sloped glacis, the driver's cupola with
// its vision slits, a small turret behind it, roof hatches, stowage bins down the sides, a ramp at the back.
function apcBody(parts, s, paint) {
  const L = s.len, hw = s.wid / 2, G = GREENHOUSE.apc, r = 0.58, top = G.yB;
  const dark = '#45432f', bins = '#5e5a40', hatch = '#585540';
  const axles = [L / 2 - 1.15, L / 2 - 2.55, -L / 2 + 2.45, -L / 2 + 1.05];
  // Lower hull between the wheels, the upper hull over them, a sloped glacis in front.
  parts.push(slab(-hw + 0.38, hw - 0.38, 0.45, 1.35, -L / 2 + 0.35, L / 2 - 0.55, paint));
  parts.push(slab(-hw, hw, 1.25, top, -L / 2 + 0.12, L / 2 - 1.35, paint));
  const gl = Math.hypot(1.35, top - 0.62), ga = Math.atan2(top - 0.62, 1.35);
  parts.push(coloredBox(2 * hw - 0.04, 0.14, gl, 0, (top + 0.62) / 2 - 0.06, L / 2 - 0.68, paint, PART.hood, ga));
  parts.push(slab(-hw + 0.38, hw - 0.38, 0.45, 0.66, L / 2 - 0.6, L / 2 - 0.02, dark, PART.bumperF));
  for (const sd of [1, -1]) parts.push(coloredBox(0.12, 0.6, gl, sd * (hw - 0.06), (top + 0.62) / 2 - 0.3, L / 2 - 0.68, paint, PART.bumperF, ga)); // the glacis' side cheeks
  // Sponson lips over the wheels (dark skirts), stowage bins on top of them, vision blocks.
  for (const sd of [1, -1]) {
    parts.push(slab(sd * (hw - 0.04), sd * (hw + 0.04), 1.2, 1.32, -L / 2 + 0.2, L / 2 - 1.4, dark, sd > 0 ? PART.doorL : PART.doorR));
    for (const z of [-1.8, -0.2, 1.1]) parts.push(slab(sd * (hw - 0.5), sd * (hw - 0.06), top, top + 0.32, z - 0.55, z + 0.55, bins, sd > 0 ? PART.doorL : PART.doorR));
    for (const z of [-1.2, 0.4]) parts.push(slab(sd * hw, sd * (hw + 0.03), 1.75, 1.92, z - 0.12, z + 0.12, '#1f2526'));
  }
  // Rear: the ramp door with its hinge line and a towing pintle.
  parts.push(slab(-hw + 0.3, hw - 0.3, 0.5, top - 0.05, -L / 2 + 0.05, -L / 2 + 0.16, dark, PART.bumperR));
  parts.push(slab(-hw + 0.32, hw - 0.32, 0.52, 0.6, -L / 2 + 0.02, -L / 2 + 0.06, '#2a2a26', PART.bumperR));
  parts.push(slab(-0.15, 0.15, 0.6, 0.78, -L / 2 - 0.12, -L / 2 + 0.05, '#1c1c1a', PART.bumperR));
  // Roof: the driver's cupola (glass slits from glassLayout, carcombat draws them), two troop hatches, the turret.
  parts.push(slab(-G.wB / 2, G.wB / 2, top - 0.02, top + 0.02, G.zC, G.zA, dark));
  greenhouse(parts, G, paint, paint);
  for (const z of [-1.0, -2.3]) for (const sd of [1, -1]) parts.push(slab(sd * 0.12, sd * 0.88, top, top + 0.06, z - 0.42, z + 0.42, hatch));
  const tz = 0.25, ty = top;
  parts.push(tag(new THREE.CylinderGeometry(0.62, 0.72, 0.42, 14).translate(0, ty + 0.21, tz).toNonIndexed(), paint, PART.frame));
  parts.push(tag(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 12).translate(0, ty + 0.46, tz - 0.12).toNonIndexed(), hatch, PART.frame));
  parts.push(slab(-0.24, 0.24, ty + 0.12, ty + 0.36, tz + 0.5, tz + 0.82, dark));
  parts.push(beam([0, ty + 0.25, tz + 0.8], [0, ty + 0.27, tz + 2.65], 0.11, '#1c1c1a'));
  parts.push(slab(-0.55, -0.32, ty + 0.15, ty + 0.36, tz - 0.1, tz + 0.25, dark)); // smoke dischargers
  parts.push(slab(0.32, 0.55, ty + 0.15, ty + 0.36, tz - 0.1, tz + 0.25, dark));
  // Lamp guards on the glacis, a tow cable along the side, an exhaust grille.
  for (const x of [-0.95, 0.95]) parts.push(slab(x - 0.2, x + 0.2, 1.0, 1.04, L / 2 - 0.42, L / 2 - 0.18, '#222220', PART.bumperF));
  parts.push(beam([-hw + 0.15, top + 0.05, -L / 2 + 0.6], [-hw + 0.15, top + 0.05, L / 2 - 1.6], 0.06, '#2a2622'));
  parts.push(slab(0.5, 1.15, top, top + 0.03, -L / 2 + 0.5, -L / 2 + 1.1, '#1c1c1a'));
  for (let i = 0; i < axles.length; i++) axle(parts, axles[i], r, 0.46, hw - 0.24, i < 2);
}

// ---- motorcycle, boats ------------------------------------------------------------------------------

function bikeBody(parts, s, paint) {
  const L = s.len;
  wheel(parts, 0, L / 2 - 0.38, 0.38, 0.16, PART.wheelFL);
  wheel(parts, 0, -L / 2 + 0.38, 0.38, 0.2, PART.wheelRL);
  parts.push(coloredBox(0.16, 0.16, L - 0.7, 0, 0.62, 0, '#2a2826', PART.frame));
  parts.push(coloredBox(0.42, 0.3, 0.6, 0, 0.92, 0.28, paint));                         // tank
  parts.push(coloredBox(0.34, 0.12, 0.75, 0, 0.88, -0.35, '#1a1816'));                   // saddle
  parts.push(coloredBox(0.36, 0.3, 0.42, 0, 0.55, 0.05, '#3a3632'));                     // engine
  parts.push(coloredBox(0.72, 0.06, 0.06, 0, 1.1, L / 2 - 0.55, '#8a8580', PART.frame)); // bars
  parts.push(coloredBox(0.06, 0.5, 0.06, 0, 0.82, L / 2 - 0.5, '#8a8580', PART.frame));  // fork
  parts.push(coloredBox(0.1, 0.1, 0.7, -0.22, 0.42, -0.45, '#9a948c', PART.frame));     // exhaust
}

function boatBody(parts, s, base, paint) {
  const L = s.len, W = s.wid, hullC = base === 'gunboat' ? '#3a3632' : paint;
  // Flat-bottomed hulls with a raked bow (two angled boxes), decks, fittings.
  parts.push(coloredBox(W, base === 'jetski' ? 0.45 : 0.7, L * 0.78, 0, 0.32, -L * 0.1, hullC));
  for (const sd of [-1, 1]) { const g = new THREE.BoxGeometry(W * 0.62, base === 'jetski' ? 0.45 : 0.7, L * 0.36).toNonIndexed(); g.rotateY(sd * 0.42); g.translate(sd * W * 0.2, 0.32, L * 0.32); parts.push(tag(g, hullC, PART.bumperF)); }
  if (base === 'airboat') {
    parts.push(coloredBox(0.9, 0.9, 0.9, 0, 1.0, -0.4, '#2a2826'));                     // raised driver seat
    const ring = new THREE.TorusGeometry(1.05, 0.08, 6, 20).toNonIndexed(); ring.translate(0, 1.5, -L / 2 + 0.5); parts.push(tag(ring, '#8a8580', PART.frame));
    for (let k = 0; k < 3; k++) { const b = new THREE.BoxGeometry(0.16, 1.9, 0.06).toNonIndexed(); b.rotateZ(k * Math.PI / 3); b.translate(0, 1.5, -L / 2 + 0.55); parts.push(tag(b, '#5a5550', PART.frame)); }
    parts.push(coloredBox(0.5, 0.5, 0.5, 0, 1.1, -L / 2 + 0.95, '#3a3632'));          // engine
  } else if (base === 'jetski') {
    parts.push(coloredBox(0.4, 0.2, 1.1, 0, 0.7, -0.2, '#1a1816'));                    // saddle
    parts.push(coloredBox(0.7, 0.06, 0.06, 0, 1.0, 0.55, '#8a8580', PART.frame));       // bars
  } else {
    const G = GREENHOUSE.gunboat;
    parts.push(slab(-G.wB / 2, G.wB / 2, 0.85, G.yB, G.zC, G.zA, '#4a3a2a'));         // cabin walls
    greenhouse(parts, G, '#4a3a2a', '#4a3a2a');
    parts.push(coloredBox(0.6, 0.5, 0.6, 0, 0.95, L / 2 - 1.3, '#2d2a28'));            // gun mount
    parts.push(coloredBox(0.14, 0.14, 1.4, 0, 1.25, L / 2 - 0.8, '#6a6560'));          // barrel
    parts.push(coloredBox(0.8, 0.6, 0.8, 0, 0.8, -L / 2 + 0.7, '#7a3a1c'));            // fuel drums
  }
}

// A raft: logs lashed over oil drums, a pole; a ferry: a plank deck on two steel pontoons, rails, the cable post.
function raftBody(parts, s, base) {
  const L = s.len, W = s.wid;
  if (base === 'raft') {
    for (let i = 0; i < 6; i++) parts.push(coloredBox(W / 6 - 0.04, 0.3, L * (0.94 + (i % 2) * 0.05), -W / 2 + (i + 0.5) * (W / 6), 0.22, 0, i % 2 ? '#6b5236' : '#7a5e3e'));
    for (const z of [-L * 0.32, L * 0.32]) parts.push(coloredBox(W * 1.02, 0.08, 0.16, 0, 0.39, z, '#4a3a28'));
    for (const [x, z] of [[-0.8, -1.3], [0.8, -1.3], [-0.8, 1.3], [0.8, 1.3]]) parts.push(coloredBox(0.6, 0.5, 0.6, x, 0.0, z, '#3d4a44'));
    parts.push(coloredBox(0.07, 0.07, 3.6, 0.7, 0.5, -0.2, '#8a7458', PART.frame)); // the pole
  } else {
    for (const sd of [-1, 1]) parts.push(coloredBox(0.9, 0.7, L * 0.98, sd * (W / 2 - 0.5), 0.1, 0, '#4b4f4a'));
    parts.push(coloredBox(W, 0.14, L, 0, 0.48, 0, '#7d6446'));
    for (const sd of [-1, 1]) { parts.push(coloredBox(0.08, 0.08, L, sd * (W / 2 - 0.05), 1.4, 0, '#6a6660', PART.frame)); for (let z = -L / 2 + 0.3; z <= L / 2; z += 1.6) parts.push(coloredBox(0.08, 0.9, 0.08, sd * (W / 2 - 0.05), 0.98, z, '#6a6660', PART.frame)); }
    parts.push(coloredBox(0.3, 1.8, 0.3, W / 2 - 0.3, 1.4, -L / 2 + 0.4, '#5a5650', PART.frame)); // the cable post
  }
}

// ---- lamps ------------------------------------------------------------------------------------------

function lenses(parts, s, type) {
  const A = lampAnchors(s, type), small = (s.base ?? type) === 'bike';
  for (const [x, y, z] of A.head) parts.push(coloredBox(small ? 0.2 : 0.35, small ? 0.14 : 0.16, 0.08, x, y, z, '#fff6d8', PART.light));
  for (const [x, y, z] of A.tail) parts.push(coloredBox(small ? 0.18 : 0.32, small ? 0.1 : 0.14, 0.08, x, y, z, '#b01010', PART.light));
}

// Lens anchors [x, y, z] in the body frame plus the beam footprint: buildBody puts the lenses here and
// vehiclelights.js throws the light from here.
export function lampAnchors(s, type) {
  const base = s.base ?? type, L = s.len, W = s.wid;
  const pair = (x, y, z) => [[x, y, z], [-x, y, z]];
  const car = { beamW: 6 + W * 2.4, beamL: 15 + W * 2, halo: 1.15 };
  if (base === 'bike') return { head: [[0, 0.98, L / 2 - 0.42]], tail: [[0, 0.82, -L / 2 + 0.2]], beamW: 7, beamL: 16, halo: 0.8 };
  if (base === 'jetski') return { head: [[0, 0.75, L / 2 - 0.45]], tail: [], beamW: 5, beamL: 20, halo: 0.7 };
  if (base === 'raft' || base === 'ferry') return { head: [], tail: [], beamW: 4, beamL: 8, halo: 0.5 };
  if (base === 'airboat' || base === 'gunboat') return { head: [[0, 0.95, L / 2 - 0.75]], tail: [[0, 0.9, -L / 2 + 0.25]], beamW: 6, beamL: 26, halo: 1 };
  if (base === 'rig') return { head: pair(W / 2 - 0.35, 1.3, L / 2 + 0.02), tail: pair(W / 2 - 0.3, 1.22, -L / 2 + 0.18), ...car };
  if (base === 'buggy') return { head: pair(0.3, 0.72, L / 2 - 0.02), tail: pair(0.32, 1.02, -L / 2 + 0.22), ...car };
  if (base === 'atv') return { head: pair(0.18, 0.68, L / 2 + 0.07), tail: [[0, 0.68, -L / 2 - 0.01]], beamW: 7, beamL: 15, halo: 0.85 };
  if (base === 'patrol') return { head: pair(W / 2 - 0.32, 1.02, L / 2 + 0.01), tail: pair(W / 2 - 0.22, 0.98, -L / 2 - 0.03), ...car };
  if (base === 'apc') return { head: pair(0.95, 1.08, L / 2 - 0.36), tail: pair(W / 2 - 0.3, 1.7, -L / 2 + 0.06), ...car };
  if (base === 'rv') return { head: pair(W / 2 - 0.38, 1.05, L / 2 + 0.02), tail: pair(W / 2 - 0.25, 1.2, -L / 2 - 0.02), ...car };
  if (base === 'bus') return { head: pair(W / 2 - 0.35, 0.95, L / 2 + 0.17), tail: pair(W / 2 - 0.3, 1.0, -L / 2 - 0.04), ...car };
  if (base === 'semi') return { head: pair(W / 2 - 0.24, 1.2, L / 2 - 0.36), tail: pair(W / 2 - 0.42, 0.95, -L / 2 + 0.05), ...car };
  if (base === 'boxtrailer') return { head: [], tail: pair(W / 2 - 0.32, 0.98, -L / 2 - 0.09), ...car };
  if (base === 'widetrailer') return { head: [], tail: pair(W / 2 - 0.4, 0.78, -L / 2 - 0.09), ...car };
  const y = base === 'pickup' ? 1.0 : base === 'van' ? 1.02 : 0.92;
  return { head: pair(W / 2 - 0.35, y, L / 2 + 0.02), tail: pair(W / 2 - 0.3, y, -L / 2 - 0.02), ...car };
}

// ---- SEMIS: the LONGHAULER tractor and its trailers (docs/design/WEB_SEMIS.md; data/trailers.js) --------------------

const STEEL = '#2a2826', AMBER = '#f0a020', DECKWOOD = '#6b543a';

// A conventional sleeper tractor: the long square-nosed hood with its chrome grille and air cleaners, a flat screen, a tall
// sleeper with a roof fairing, stacks at its back corners, saddle tanks under the doors, then the deck plate and the fifth
// wheel the trailer's kingpin locks into (`tractor.fifth`), tandem drive axles on duals, mud flaps.
function semiBody(parts, s, paint) {
  const L = s.len, hw = s.wid / 2, G = GREENHOUSE.semi, yFloor = 1.25, zf = L / 2 - 1.05, zS = -1.15, F = s.tractor?.fifth ?? -2.35;
  for (const sd of [1, -1]) parts.push(slab(sd * 0.36, sd * 0.52, 0.62, 0.92, -L / 2 + 0.05, L / 2 - 0.3, STEEL, PART.frame)); // ladder frame rails
  // The hood, its spine, the grille in its chrome surround, the bumper.
  parts.push(slab(-hw + 0.22, hw - 0.22, 0.95, 1.95, G.zA - 0.05, L / 2 - 0.12, paint));
  parts.push(slab(-hw + 0.28, hw - 0.28, 1.95, 2.02, G.zA + 0.05, L / 2 - 0.25, paint, PART.hood));
  parts.push(slab(-0.07, 0.07, 2.02, 2.05, G.zA + 0.1, L / 2 - 0.3, CHROME, PART.hood));
  parts.push(slab(-hw + 0.32, hw - 0.32, 1.0, 1.92, L / 2 - 0.14, L / 2 - 0.06, CHROME));
  parts.push(slab(-hw + 0.4, hw - 0.4, 1.06, 1.86, L / 2 - 0.08, L / 2 - 0.03, GRILLE));
  for (let k = 0; k < 7; k++) { const y = 1.1 + k * 0.11; parts.push(slab(-hw + 0.42, hw - 0.42, y, y + 0.025, L / 2 - 0.04, L / 2, CHROME)); }
  parts.push(slab(-hw - 0.05, hw + 0.05, 0.55, 0.95, L / 2 - 0.12, L / 2 + 0.18, CHROME, PART.bumperF));
  parts.push(slab(-0.22, 0.22, 0.66, 0.84, L / 2 + 0.18, L / 2 + 0.2, PLATE, PART.bumperF));
  // Fenders over the steer axle, the air cleaners standing beside the hood.
  for (const sd of [1, -1]) {
    parts.push(slab(sd * (hw - 0.44), sd * (hw + 0.04), 1.05, 1.2, zf - 0.7, zf + 0.62, paint));
    parts.push(slab(sd * (hw - 0.44), sd * (hw + 0.04), 0.7, 1.12, zf + 0.55, zf + 0.66, paint));
    parts.push(tag(new THREE.CylinderGeometry(0.17, 0.17, 0.95, 12).translate(sd * (hw - 0.02), 1.5, G.zA + 0.32).toNonIndexed(), CHROME, PART.body));
  }
  // The cab: floor, doors, two chrome steps, a grab bar, the tall mirrors on their arms; inside, the seats and dash.
  parts.push(slab(-hw + 0.1, hw - 0.1, 0.9, yFloor, G.zC, G.zA, CARPET));
  for (const sd of [1, -1]) {
    const part = sd > 0 ? PART.doorL : PART.doorR;
    parts.push(slab(sd * (hw - 0.1), sd * hw, 0.95, G.yB, G.zC + 0.05, G.zA, paint, part));
    for (const y of [0.52, 0.86]) parts.push(slab(sd * (hw - 0.05), sd * (hw + 0.1), y, y + 0.06, G.zC + 0.25, G.zA - 0.2, CHROME));
    parts.push(beam([sd * (hw + 0.04), 1.2, G.zC + 0.12], [sd * (hw + 0.04), 2.0, G.zC + 0.12], 0.04, CHROME));
    parts.push(beam([sd * (hw - 0.02), G.yB + 0.05, G.zA - 0.12], [sd * (hw + 0.28), G.yB + 0.28, G.zA - 0.05], 0.04, CHROME, part));
    parts.push(slab(sd * (hw + 0.24), sd * (hw + 0.36), G.yB + 0.18, G.yB + 0.75, G.zA - 0.12, G.zA + 0.02, BUMPER, part));
    parts.push(slab(sd * (hw + 0.25), sd * (hw + 0.35), G.yB + 0.22, G.yB + 0.71, G.zA - 0.13, G.zA - 0.12, MIRROR, part));
  }
  interior(parts, G, hw, yFloor, false);
  greenhouse(parts, G, paint, paint);
  parts.push(slab(-hw + 0.15, hw - 0.15, G.yR - 0.02, G.yR + 0.05, G.roofF, G.roofF + 0.3, paint)); // sun visor
  for (let k = -2; k <= 2; k++) parts.push(slab(k * 0.32 - 0.05, k * 0.32 + 0.05, G.yR + 0.07, G.yR + 0.12, G.roofF - 0.05, G.roofF + 0.03, AMBER, PART.light)); // cab clearance lamps
  // The sleeper, its raised roof and the fairing that sweeps up to it, a bunk window each side, cab extenders.
  parts.push(slab(-hw + 0.06, hw - 0.06, 0.95, 3.25, zS, G.zC + 0.02, paint));
  parts.push(slab(-hw + 0.04, hw - 0.04, 3.25, 3.6, zS, G.roofR + 0.05, paint));
  { const z0 = G.roofR + 0.05, z1 = G.roofF, y0 = 3.6, y1 = G.yR + 0.07, len = Math.hypot(z1 - z0, y0 - y1); parts.push(coloredBox(2 * hw - 0.24, 0.08, len, 0, (y0 + y1) / 2, (z0 + z1) / 2, paint, PART.body, Math.atan2(y0 - y1, z1 - z0))); }
  for (const sd of [1, -1]) {
    parts.push(slab(sd * hw, sd * (hw + 0.012), 2.3, 2.66, -0.78, -0.24, '#1f2b33'));
    parts.push(slab(sd * (hw - 0.04), sd * (hw + 0.02), 1.0, 3.5, zS - 0.32, zS, paint));
    parts.push(slab(sd * hw, sd * (hw + 0.012), 1.25, 1.42, zS, G.zA, '#8a3a1c')); // the stripe along the cab and sleeper
  }
  // Stacks at the sleeper's back corners, with heat shields; air lines coiled behind.
  for (const sd of [1, -1]) {
    parts.push(beam([sd * (hw - 0.22), 1.1, zS - 0.2], [sd * (hw - 0.22), 4.05, zS - 0.2], 0.17, CHROME));
    parts.push(slab(sd * (hw - 0.32), sd * (hw - 0.12), 1.6, 2.6, zS - 0.32, zS - 0.08, '#9a958b'));
  }
  parts.push(tag(new THREE.TorusGeometry(0.17, 0.025, 5, 14).translate(0.32, 1.75, zS - 0.08).toNonIndexed(), '#b02a1a', PART.frame));
  parts.push(tag(new THREE.TorusGeometry(0.17, 0.025, 5, 14).translate(-0.32, 1.75, zS - 0.08).toNonIndexed(), '#2a4a7a', PART.frame));
  // Saddle tanks under the sleeper, strapped.
  for (const sd of [1, -1]) {
    parts.push(tag(new THREE.CylinderGeometry(0.34, 0.34, 1.25, 14).rotateX(Math.PI / 2).translate(sd * (hw - 0.4), 0.82, -0.4).toNonIndexed(), CHROME, PART.body));
    for (const z of [-0.85, 0.05]) parts.push(slab(sd * (hw - 0.76), sd * (hw - 0.04), 0.46, 1.19, z - 0.04, z + 0.04, STEEL));
  }
  // The deck plate behind the sleeper and the fifth wheel (its jaw slot facing the trailer).
  parts.push(slab(-hw + 0.3, hw - 0.3, 0.92, 1.0, -L / 2 + 0.2, zS - 0.05, '#3a3632'));
  parts.push(tag(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 18).translate(0, 1.06, F).toNonIndexed(), '#2f2d2a', PART.frame));
  parts.push(slab(-0.09, 0.09, 1.12, 1.135, F - 0.62, F - 0.08, '#0e0e0e', PART.frame));
  for (const sd of [1, -1]) parts.push(slab(sd * 0.48, sd * 0.62, 0.95, 1.08, F - 0.3, F + 0.3, STEEL, PART.frame)); // its mounts
  // The tail: a crossmember, mud flaps behind the drive axles.
  parts.push(slab(-hw + 0.4, hw - 0.4, 0.6, 0.76, -L / 2, -L / 2 + 0.12, STEEL, PART.bumperR));
  for (const sd of [1, -1]) parts.push(slab(sd * (hw - 0.62), sd * (hw - 0.04), 0.2, 0.95, -L / 2 + 0.06, -L / 2 + 0.1, '#111111', PART.bumperR));
  axle(parts, zf, 0.53, 0.36, hw - 0.2, true);
  axle(parts, -1.78, 0.53, 0.62, hw - 0.33, false);
  axle(parts, -2.98, 0.53, 0.62, hw - 0.33, false);
}

// A long dry box: the oak floor on its rails, corrugated walls with a stripe and amber side markers, the front wall over
// the upper coupler and its kingpin, the rear frame round the opening (the roll-up door and the slide-out ramp are
// their own meshes: holdDoorGeometry, rampGeometry), the ramp's pocket under the floor, landing gear, the underride
// bar, tandem axles on duals. The roof (with its bows) cuts away while you are inside (systems/decks.js).
function boxTrailerBody(parts, s, paint) {
  const T = TRAILERS[s.trailer] ?? TRAILERS.box, L = s.len, hw = s.wid / 2, F = T.floorY, top = s.tall - 0.02, H = T.hold;
  const rib = '#a59d8d', rail = '#7d776c', R = ROOF ?? parts;
  parts.push(slab(-hw, hw, 1.1, F - 0.02, -L / 2, L / 2, '#3b3632'));                                         // the floor's rails
  parts.push(slab(H.x0, H.x1, F - 0.02, F, -L / 2 + 0.12, L / 2 - 0.08, DECKWOOD));                            // oak floor
  for (let k = 1; k < 8; k++) { const x = H.x0 + k * (H.x1 - H.x0) / 8; parts.push(slab(x - 0.01, x + 0.01, F, F + 0.004, -L / 2 + 0.14, L / 2 - 0.1, '#4f3d2a')); }
  for (const sd of [1, -1]) {
    parts.push(slab(sd * (H.x1 - 0.12), sd * H.x1, F, F + 0.05, -L / 2 + 0.2, L / 2 - 0.15, '#8a857a'));       // tie-down track
    parts.push(slab(sd * H.x1, sd * hw, F, top, -L / 2 + 0.15, L / 2, paint));                                 // the wall
    for (let z = -L / 2 + 0.6; z < L / 2 - 0.3; z += 0.9) parts.push(slab(sd * hw, sd * (hw + 0.03), F + 0.05, top - 0.12, z - 0.04, z + 0.04, rib));
    parts.push(slab(sd * hw, sd * (hw + 0.04), top - 0.12, top, -L / 2, L / 2, rail));
    parts.push(slab(sd * hw, sd * (hw + 0.04), F - 0.2, F + 0.06, -L / 2, L / 2, rail));
    parts.push(slab(sd * (hw + 0.03), sd * (hw + 0.035), 2.15, 2.42, -L / 2 + 0.3, L / 2 - 0.3, '#8a3a1c'));    // a faded stripe
    for (const z of [L / 2 - 0.35, 0, -L / 2 + 0.35]) parts.push(slab(sd * (hw + 0.04), sd * (hw + 0.07), F - 0.12, F, z - 0.07, z + 0.07, AMBER, PART.light));
  }
  // The front wall, the upper coupler plate and its kingpin, the glad hands.
  parts.push(slab(-hw, hw, F, top, L / 2 - 0.08, L / 2, paint));
  for (let x = -hw + 0.4; x < hw - 0.2; x += 0.55) parts.push(slab(x - 0.04, x + 0.04, F + 0.05, top - 0.12, L / 2, L / 2 + 0.03, rib));
  parts.push(slab(-hw + 0.25, hw - 0.25, 1.08, 1.12, T.kingpin - 1.1, L / 2 - 0.05, '#2b2a28'));
  parts.push(tag(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8).translate(0, 1.02, T.kingpin).toNonIndexed(), CHROME, PART.frame));
  parts.push(slab(0.25, 0.4, 1.45, 1.6, L / 2, L / 2 + 0.06, '#b02a1a'));
  parts.push(slab(-0.4, -0.25, 1.45, 1.6, L / 2, L / 2 + 0.06, '#2a4a7a'));
  // The rear frame round the opening: corner posts, the header, the sill the ramp hinges from, hinge knuckles.
  for (const sd of [1, -1]) parts.push(slab(sd * (H.x1 - 0.06), sd * (hw + 0.04), F - 0.25, top, -L / 2, -L / 2 + 0.16, rail, PART.bumperR));
  parts.push(slab(-hw, hw, F + H.h, top, -L / 2, -L / 2 + 0.16, rail, PART.bumperR));
  parts.push(slab(-hw, hw, F - 0.26, F, -L / 2 - 0.05, -L / 2 + 0.16, STEEL, PART.bumperR));
  for (const sd of [1, -1]) parts.push(slab(sd * (hw - 0.32), sd * (hw - 0.04), 0.86, 1.06, -L / 2 - 0.06, -L / 2 - 0.02, '#1b1a18', PART.bumperR)); // lamp boxes
  // The ramp's pocket under the floor, the underride bar on its uprights, the landing gear, the axles and mud flaps.
  parts.push(slab(-T.ramp.width / 2 - 0.08, T.ramp.width / 2 + 0.08, 0.86, 1.1, -L / 2 + 0.1, -L / 2 + T.ramp.len + 0.1, '#24221f'));
  parts.push(slab(-hw + 0.15, hw - 0.15, 0.42, 0.58, -L / 2 + 0.22, -L / 2 + 0.36, '#b8b2a6', PART.bumperR));
  for (const sd of [1, -1]) parts.push(slab(sd * 0.85, sd * 0.97, 0.5, 1.1, -L / 2 + 0.24, -L / 2 + 0.34, STEEL, PART.bumperR));
  for (const sd of [1, -1]) {
    const x = sd * (hw - 0.45), z = L / 2 - 2.4;
    parts.push(slab(x - 0.07, x + 0.07, 0.25, 1.1, z - 0.07, z + 0.07, '#5a5650', PART.frame));
    parts.push(slab(x - 0.16, x + 0.16, 0.18, 0.25, z - 0.2, z + 0.2, STEEL, PART.frame));
  }
  parts.push(beam([-(hw - 0.45), 0.7, L / 2 - 2.4], [hw - 0.45, 0.7, L / 2 - 2.4], 0.06, '#5a5650'));
  const a0 = T.axle - 0.58, a1 = T.axle + 0.58;
  axle(parts, a0, 0.5, 0.6, hw - 0.35, false);
  axle(parts, a1, 0.5, 0.6, hw - 0.35, false);
  for (const sd of [1, -1]) parts.push(slab(sd * (hw - 0.66), sd * (hw - 0.06), 0.22, 0.95, a0 - 0.62, a0 - 0.58, '#111111'));
  parts.push(slab(-0.7, 0.7, 0.75, 1.1, a0 - 0.2, a1 + 0.2, STEEL, PART.frame));                                   // the slider box over the axles
  // Inside: the chain box at the front corner (TRAILER_DECKS.boxHold container), a coiled strap on the wall.
  parts.push(slab(0.96, H.x1, F, F + 0.8, 5.45, 6.0, '#4a463e'));
  parts.push(slab(1.0, H.x1 - 0.04, F + 0.8, F + 0.83, 5.5, 5.96, '#6e6a62'));
  parts.push(tag(new THREE.TorusGeometry(0.2, 0.05, 5, 12).rotateY(Math.PI / 2).translate(H.x1 - 0.06, F + 1.5, 4.6).toNonIndexed(), '#c8962a', PART.body));
  // The roof (it lifts away while you are inside), its bows, a vent.
  R.push(slab(-hw, hw, top, top + 0.06, -L / 2, L / 2, '#bdb6a8'));
  for (let z = -L / 2 + 0.5; z < L / 2 - 0.3; z += 1.0) R.push(slab(-hw + 0.05, hw - 0.05, top + 0.06, top + 0.075, z - 0.03, z + 0.03, '#a8a194'));
  R.push(slab(-0.3, 0.3, top + 0.06, top + 0.2, L / 2 - 2.2, L / 2 - 1.7, '#8a857a'));
}

// The wide-load lowboy: a gooseneck over the tractor's fifth wheel, then a drop deck wider than a lane with hazard
// chevrons along its rails (they read from above), amber markers down both sides, red flags at its four corners, a beacon
// on the neck, small wheels in pairs under the back, and a pair of folding ramps at the tail (rampGeometry). The WIDE LOAD
// banners are textured, their own mesh (systems/semis.js).
function wideTrailerBody(parts, s, paint) {
  const T = TRAILERS[s.trailer] ?? TRAILERS.wide, L = s.len, hw = s.wid / 2, F = T.floorY, H = T.hold, front = H.z1;
  const neck = 1.25, yel = '#d8a81e', blk = '#1a1816';
  // The gooseneck: its raised deck over the kingpin, its sides, the bulkhead face that steps down to the well.
  parts.push(slab(-neck, neck, 1.18, 1.62, front + 0.2, L / 2, paint));
  parts.push(slab(-neck + 0.05, neck - 0.05, 1.62, 1.66, front + 0.25, L / 2 - 0.05, '#4a4038'));
  parts.push(slab(-hw + 0.1, hw - 0.1, F - 0.2, F + 0.85, front, front + 0.2, paint));
  for (let k = 0; k < 9; k++) { const x0 = -hw + 0.25 + k * ((2 * hw - 0.5) / 9); parts.push(slab(x0, x0 + 0.28, F + 0.55, F + 0.8, front - 0.012, front, k % 2 ? blk : yel)); }
  for (const sd of [1, -1]) parts.push(beam([sd * neck, 1.4, front + 0.25], [sd * (hw - 0.3), F + 0.3, front + 0.05], 0.12, paint));
  parts.push(slab(-neck + 0.2, neck - 0.2, 1.08, 1.18, T.kingpin - 0.8, L / 2 - 0.1, '#2b2a28'));
  parts.push(tag(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8).translate(0, 1.02, T.kingpin).toNonIndexed(), CHROME, PART.frame));
  parts.push(tag(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 10).translate(0, 1.77, L / 2 - 0.35).toNonIndexed(), AMBER, PART.light)); // beacon
  // The deck: steel under a plank floor, planks across, the main beams under it.
  parts.push(slab(-hw + 0.15, hw - 0.15, F - 0.2, F - 0.01, -L / 2, front, '#4a4038'));
  for (let z = -L / 2 + 0.2; z < front; z += 0.32) parts.push(slab(H.x0 + 0.02, H.x1 - 0.02, F - 0.01, F, z, z + 0.29, (Math.round(z * 3) % 2) ? DECKWOOD : '#5e4a33'));
  for (const sd of [1, -1]) parts.push(slab(sd * 0.9, sd * 1.2, 0.45, F - 0.2, -L / 2 + 0.3, L / 2 - 0.4, STEEL, PART.frame));
  // The side rails: chevrons on top, stake pockets, amber markers, and a red flag on a staff at each corner.
  for (const sd of [1, -1]) {
    parts.push(slab(sd * (hw - 0.18), sd * (hw - 0.02), F - 0.35, F + 0.3, -L / 2, front, paint));
    for (let z = -L / 2, k = 0; z < front - 0.05; z += 0.5, k++) parts.push(slab(sd * (hw - 0.18), sd * (hw - 0.02), F + 0.3, F + 0.32, z, Math.min(front, z + 0.5), k % 2 ? blk : yel));
    for (let z = -L / 2 + 0.8; z < front; z += 1.2) parts.push(slab(sd * (hw - 0.02), sd * (hw + 0.03), F - 0.3, F + 0.2, z - 0.07, z + 0.07, '#26241f'));
    for (let z = -L / 2 + 0.4; z < front; z += 1.6) parts.push(slab(sd * (hw + 0.03), sd * (hw + 0.06), F - 0.1, F + 0.04, z - 0.08, z + 0.08, AMBER, PART.light));
    for (const z of [front - 0.1, -L / 2 + 0.12]) {
      parts.push(beam([sd * (hw - 0.1), F + 0.3, z], [sd * (hw - 0.1), 2.35, z], 0.035, '#2a2622'));
      parts.push(slab(sd * (hw - 0.12), sd * (hw - 0.08), 1.85, 2.3, z - (z > 0 ? 0.55 : -0.05), z + (z > 0 ? 0.05 : 0.55), '#d8401a'));
    }
  }
  // The tail: the hinge bar the ramps fold from, lamp boxes, the axles (two pairs of small wheels each side).
  parts.push(slab(-hw + 0.1, hw - 0.1, F - 0.28, F, -L / 2 - 0.06, -L / 2 + 0.1, STEEL, PART.bumperR));
  for (const sd of [1, -1]) parts.push(slab(sd * (hw - 0.55), sd * (hw - 0.22), 0.66, 0.88, -L / 2 - 0.08, -L / 2 - 0.04, '#1b1a18', PART.bumperR));
  for (const z of [T.axle - 0.5, T.axle + 0.5]) for (const sd of [1, -1]) for (const x of [hw - 0.55, 1.55]) wheel(parts, sd * x, z, 0.38, 0.3, sd > 0 ? PART.wheelRL : PART.wheelRR);
}

// The drop ramp of trailer row `s` (data/trailers.js TRAILERS[s.trailer].ramp), in its hinge's frame: the hinge on the
// x axis at y = 0 (its top face), the ramp running back along -z for `len`. A box's is one diamond-plate slab with curbs;
// a lowboy's is a pair of plates, a gap between them. Its mesh is the trailer group's child (systems/semis.js poses it).
export function rampGeometry(s) {
  const R = (TRAILERS[s.trailer] ?? TRAILERS.box).ramp, parts = [], hw = R.width / 2, plate = '#5c5852', bump = '#77736a';
  const spans = R.kind === 'flip' ? [[-hw, -0.4], [0.4, hw]] : [[-hw, hw]];
  for (const [x0, x1] of spans) {
    parts.push(slab(x0, x1, -0.09, 0, -R.len, 0, plate));
    for (let z = -R.len + 0.2; z < -0.1; z += 0.28) parts.push(slab(x0 + 0.08, x1 - 0.08, 0, 0.015, z, z + 0.05, bump));
    for (const x of [x0, x1 - 0.06]) parts.push(slab(x, x + 0.06, 0, 0.08, -R.len, 0, '#3e3b36'));
    parts.push(slab(x0, x1, -0.05, 0.005, -R.len - 0.12, -R.len, '#8e8a80')); // the tip's lip
  }
  for (let x = -hw + 0.2; x < hw - 0.1; x += 0.6) parts.push(tag(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8).rotateZ(Math.PI / 2).translate(x, -0.05, 0).toNonIndexed(), CHROME, PART.frame));
  return mergeGeometries(parts);
}
// A box trailer's roll-up door, hanging down from its top edge (y = 0) across the opening: slats, a handle, a pull strap.
// systems/semis.js sets it in the header and scales it up into the roof as the ramp comes down.
export function holdDoorGeometry(s) {
  const T = TRAILERS[s.trailer] ?? TRAILERS.box, H = T.hold, parts = [], w0 = H.x0 + 0.02, w1 = H.x1 - 0.02;
  parts.push(slab(w0, w1, -H.h, 0, -0.04, 0, '#b4ad9f'));
  for (let y = -H.h + 0.2; y < -0.05; y += 0.25) parts.push(slab(w0, w1, y, y + 0.025, -0.06, -0.04, '#8f897d'));
  parts.push(slab(-0.25, 0.25, -H.h + 0.1, -H.h + 0.16, -0.09, -0.04, CHROME));
  parts.push(slab(0.6, 0.66, -H.h + 0.05, -H.h + 0.6, -0.08, -0.06, '#c8962a'));
  return mergeGeometries(parts);
}

// ---- glass ------------------------------------------------------------------------------------------

const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _bm = new THREE.Vector3(), _tm = new THREE.Vector3(), _up = new THREE.Vector3();
const _layouts = {};

// One pane from its four corners (bottom-left/right, top-left/right along the pane's own X). The unit
// quad is shaped in carcombat's glass shader: x' = x * mix(1, taper, uv.y) + skew * uv.y, so the
// placement puts the quad's origin at the bottom edge's centre, half a pane-height up.
function pane(bl, br, tl, tr) {
  _X.subVectors(br, bl); const wb = _X.length(); _X.normalize();
  _bm.addVectors(bl, br).multiplyScalar(0.5); _tm.addVectors(tl, tr).multiplyScalar(0.5);
  _up.subVectors(_tm, _bm);
  const along = _up.dot(_X);
  _Y.copy(_up).addScaledVector(_X, -along); const h = _Y.length(); _Y.normalize();
  _Z.crossVectors(_X, _Y);
  const m = new THREE.Matrix4().makeBasis(_X, _Y, _Z).scale(new THREE.Vector3(wb, h, 1));
  m.setPosition(_bm.x + _Y.x * h / 2, _bm.y + _Y.y * h / 2, _bm.z + _Y.z * h / 2);
  const c = new THREE.Vector3().addVectors(_bm, _tm).multiplyScalar(0.5);
  return { m, taper: tl.distanceTo(tr) / wb, skew: along / wb, c, n: _Z.clone() };
}

// The four panes of a glazed vehicle (local frame), or null for an open one. Cached per body type.
export function glassLayout(s, type) {
  const base = s.base ?? type, G = GREENHOUSE[base];
  if (!G) return null;
  if (_layouts[base]) return _layouts[base];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const bx = G.wB / 2 - 0.07, rx = G.wR / 2 - 0.07; // inside the pillars
  const sF = G.zA - 0.09, sR = G.sideRear ?? G.zC + 0.09, tF = G.roofF - 0.04, tR = G.sideRear ?? G.roofR + 0.04;
  _layouts[base] = {
    hp: G.hp,
    panes: {
      front: pane(V(-bx, G.yB, G.zA), V(bx, G.yB, G.zA), V(-rx, G.yR, G.roofF), V(rx, G.yR, G.roofF)),
      rear: pane(V(bx, G.yB, G.zC), V(-bx, G.yB, G.zC), V(rx, G.yR, G.roofR), V(-rx, G.yR, G.roofR)),
      left: pane(V(G.wB / 2, G.yB, sF), V(G.wB / 2, G.yB, sR), V(G.wR / 2, G.yR, tF), V(G.wR / 2, G.yR, tR)),
      right: pane(V(-G.wB / 2, G.yB, sR), V(-G.wB / 2, G.yB, sF), V(-G.wR / 2, G.yR, tR), V(-G.wR / 2, G.yR, tF)),
    },
  };
  return _layouts[base];
}
