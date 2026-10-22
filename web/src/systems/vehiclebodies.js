import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

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
  pickup:      { zA: 1.05, roofF: 0.45, roofR: -0.45, zC: -0.55, yB: 1.27, yR: 1.92, wB: 2.06, wR: 1.76, hp: 40 },
  van:         { zA: 2.25, roofF: 1.7, roofR: -2.665, zC: -2.665, yB: 1.32, yR: 2.02, wB: 2.15, wR: 2.0, sideRear: 0.95, hp: 40 },
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

export function buildBody(s, type, paint) {
  const base = s.base ?? type;
  const parts = [];
  if (base === 'rig') rigBody(parts, s, paint);
  else if (base === 'buggy') buggyBody(parts, s, paint);
  else if (base === 'van') vanBody(parts, s, paint);
  else if (base === 'bike') bikeBody(parts, s, paint);
  else if (base === 'atv') atvBody(parts, s, paint);
  else if (base === 'airboat' || base === 'jetski' || base === 'gunboat') boatBody(parts, s, base, paint);
  else if (base === 'patrol') patrolBody(parts, s, paint);
  else if (base === 'apc') apcBody(parts, s, paint);
  else carBody(parts, s, GREENHOUSE[base] ? base : 'sedan', paint);
  lenses(parts, s, type);
  return mergeGeometries(parts);
}

// ---- cars ----------------------------------------------------------------------------------------

// Sedan, LAWMAN (ex-trooper cruiser), pickup: a nose with a hood panel, a cabin tub under the glass,
// the greenhouse, then a trunk or an open bed.
function carBody(parts, s, base, paint) {
  const L = s.len, hw = s.wid / 2, G = GREENHOUSE[base];
  const lawman = base === 'interceptor', pickup = base === 'pickup';
  const skin = lawman ? CREAM : paint; // a faded trooper two-tone (cream roof + doors), not the all-black cop car
  const yHood = pickup ? 1.2 : 1.1, yFloor = pickup ? 0.72 : 0.62, r = pickup ? 0.46 : 0.42;
  // Nose: engine block, hood panel (PART.hood tears off), grille, bumper.
  parts.push(slab(-hw, hw, 0.42, yHood - 0.06, G.zA - 0.05, L / 2 - 0.06, paint));
  parts.push(slab(-hw + 0.07, hw - 0.07, yHood - 0.06, yHood, G.zA + 0.02, L / 2 - 0.16, paint, PART.hood));
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
    } else parts.push(slab(x0, x1, 0.42, G.yB, G.zC, G.zA, skin, front));
    parts.push(slab(sd * (hw + 0.01), sd * (hw + 0.035), G.yB - 0.18, G.yB - 0.13, G.zA - 0.45, G.zA - 0.25, CHROME, front)); // handle
    mirror(parts, sd, hw, G);
  }
  interior(parts, G, hw, yFloor, !pickup);
  greenhouse(parts, G, skin, skin, zB);
  // Tail: a trunk, or an open bed.
  if (pickup) bed(parts, L, hw, G, paint);
  else parts.push(slab(-hw, hw, 0.42, yHood - 0.02, -L / 2 + 0.06, G.zC + 0.05, paint));
  parts.push(slab(-hw - 0.03, hw + 0.03, 0.46, 0.7, -L / 2 - 0.12, -L / 2 + 0.08, BUMPER, PART.bumperR));
  parts.push(slab(-0.22, 0.22, 0.55, 0.68, -L / 2 - 0.14, -L / 2 - 0.12, PLATE, PART.bumperR));
  if (lawman) { lightBar(parts, G); pushBar(parts, L); spotlight(parts, hw, G); }
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
  parts.push(slab(-G.wR / 2, G.wR / 2, G.yR, G.yR + 0.07, G.roofR, G.roofF, roof));
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
  parts.push(slab(-hw + 0.16, hw - 0.16, 0.95, 1.28, z1 - 0.5, z1 - 0.1, '#7c776e'));                     // diamond-plate toolbox
}

function lightBar(parts, G) {
  const zc = (G.roofF + G.roofR) / 2 + 0.1, y = G.yR + 0.07;
  parts.push(slab(-0.66, 0.66, y, y + 0.1, zc - 0.13, zc + 0.13, '#1e1e1e'));
  parts.push(slab(0.06, 0.62, y + 0.1, y + 0.15, zc - 0.11, zc + 0.11, '#7a2119'));   // dead red lens (driver's side)
  parts.push(slab(-0.62, -0.06, y + 0.1, y + 0.15, zc - 0.11, zc + 0.11, '#23395f')); // dead blue lens
}

function pushBar(parts, L) {
  const z = L / 2 + 0.24, c = '#1b1b1b';
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
  // Cargo box: solid sides, a sliding-door seam on the kerb (right) side, split rear doors.
  parts.push(slab(-hw, hw, 0.42, G.yR, -L / 2 + 0.06, G.sideRear, paint));
  parts.push(slab(-hw - 0.012, -hw + 0.004, 0.5, G.yR - 0.1, -0.62, -0.58, '#151515', PART.doorR2));
  parts.push(slab(-0.015, 0.015, 0.5, G.yR - 0.08, -L / 2 + 0.03, -L / 2 + 0.065, '#151515', PART.bumperR));
  greenhouse(parts, G, '#cfc8bb', paint);
  parts.push(slab(-hw - 0.03, hw + 0.03, 0.46, 0.72, -L / 2 - 0.12, -L / 2 + 0.08, BUMPER, PART.bumperR));
  parts.push(slab(-0.22, 0.22, 0.55, 0.68, -L / 2 - 0.14, -L / 2 - 0.12, PLATE, PART.bumperR));
  // Roof rack with a load: two crates, a spare lying flat, a rolled tarp.
  const y = G.yR + 0.15;
  for (const x of [-hw + 0.25, hw - 0.25]) parts.push(beam([x, y, G.roofR + 0.25], [x, y, G.roofF - 0.35], 0.05, '#1e1e1e'));
  for (let k = 0; k < 5; k++) { const z = G.roofR + 0.25 + k * ((G.roofF - G.roofR - 0.6) / 4); parts.push(beam([-hw + 0.25, y, z], [hw - 0.25, y, z], 0.04, '#1e1e1e')); }
  parts.push(slab(-0.6, 0.15, y + 0.03, y + 0.43, -1.6, -0.9, '#6b5537'));
  parts.push(slab(0.25, 0.75, y + 0.03, y + 0.33, -1.5, -1.05, '#5c4a32'));
  parts.push(tag(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 14).translate(0.2, y + 0.14, 0.1).toNonIndexed(), TYRE, PART.body));
  parts.push(slab(-0.8, 0.8, y + 0.03, y + 0.25, -2.3, -1.85, '#4b5338'));
  axle(parts, L / 2 - 0.9, 0.42, 0.32, hw - 0.1, true);
  axle(parts, -L / 2 + 0.9, 0.42, 0.32, hw - 0.1, false);
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
  if (base === 'airboat' || base === 'gunboat') return { head: [[0, 0.95, L / 2 - 0.75]], tail: [[0, 0.9, -L / 2 + 0.25]], beamW: 6, beamL: 26, halo: 1 };
  if (base === 'rig') return { head: pair(W / 2 - 0.35, 1.3, L / 2 + 0.02), tail: pair(W / 2 - 0.3, 1.22, -L / 2 + 0.18), ...car };
  if (base === 'buggy') return { head: pair(0.3, 0.72, L / 2 - 0.02), tail: pair(0.32, 1.02, -L / 2 + 0.22), ...car };
  if (base === 'atv') return { head: pair(0.18, 0.68, L / 2 + 0.07), tail: [[0, 0.68, -L / 2 - 0.01]], beamW: 7, beamL: 15, halo: 0.85 };
  if (base === 'patrol') return { head: pair(W / 2 - 0.32, 1.02, L / 2 + 0.01), tail: pair(W / 2 - 0.22, 0.98, -L / 2 - 0.03), ...car };
  if (base === 'apc') return { head: pair(0.95, 1.08, L / 2 - 0.36), tail: pair(W / 2 - 0.3, 1.7, -L / 2 + 0.06), ...car };
  const y = base === 'pickup' ? 1.0 : base === 'van' ? 1.02 : 0.92;
  return { head: pair(W / 2 - 0.35, y, L / 2 + 0.02), tail: pair(W / 2 - 0.3, y, -L / 2 - 0.02), ...car };
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
