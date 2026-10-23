import * as THREE from 'three';
import { radialGlow } from '../world/textures.js';
import { UG, LIGHT, LIFT, ENTRANCES, PROPS } from '../data/underground.js';
import { ROCK, OPEN, POOL, DEEP, mergeRects } from '../world/undergen.js';

// How the underground looks (systems/underground.js builds a promoted level's meshes here, and a surface entrance's).
// One InstancedMesh a kind of thing a level: walls, floors, props (furniture, stairs, rails, frames, remains), strips
// (the emissive pieces: strip lights, keypad lights, screens, chem-light sticks: a basic material, so they glow without a
// light), glows (additive pools of light on the floor). Five draw calls a level, only the level you are on is drawn.
// Colours: concrete, earth, rust, olive, amber; nothing in hue 270-320.

const _o = new THREE.Object3D(), _c = new THREE.Color();
const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
// A lump of rock (a cave's wall, a boulder): a low-poly ball pushed about, flat-shaded; scaled per instance.
const ROCKG = (() => { const g = new THREE.IcosahedronGeometry(0.62, 1), P = g.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = 0.82 + 0.3 * hash(x * 3.1, z * 2.7, y * 5.3); P.setXYZ(i, x * k, y * k, z * k); } g.computeVertexNormals(); return g; })();

export function makeMaterials() {
  return {
    solid: new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.06 }),
    rock: new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0.02, flatShading: true }),
    floor: new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0.02 }),
    props: new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.18 }),
    strip: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
    glow: new THREE.MeshBasicMaterial({ map: radialGlow(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    black: new THREE.MeshBasicMaterial({ color: '#000000', fog: false }),
    water: new THREE.MeshStandardMaterial({ roughness: 0.12, metalness: 0.35, color: '#ffffff' }),
  };
}

// A batch of boxes: items are [cx, cy, cz, sx, sy, sz, colour, rotY?, rotX?].
function batch(items, mat, geo = BOX, opts = {}) {
  if (!items.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    _o.position.set(it[0], it[1], it[2]); _o.rotation.set(it[8] ?? 0, it[7] ?? 0, 0); _o.scale.set(it[3], it[4], it[5]); _o.updateMatrix();
    m.setMatrixAt(i, _o.matrix); m.setColorAt(i, _c.set(it[6]));
  });
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = false; m.receiveShadow = !!opts.receive;
  m.computeBoundingSphere();
  if (opts.order !== undefined) m.renderOrder = opts.order;
  return m;
}
const span = (x0, z0, x1, z1, y0, y1, col) => [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.max(0.02, x1 - x0), Math.max(0.02, y1 - y0), Math.max(0.02, z1 - z0), col];

// ---- a level ----------------------------------------------------------------------------------------------------------
// Returns { group, strips, stripItems, glows, glowItems } (strips and glows are repainted when the power changes).
export function buildLevel(L, plan, site, rec, lr, M) {
  const y = L.y, wallH = UG.wallH, built = !!L.walls, W = L.W, H = L.H;
  const walls = [], lumps = [], fill = [], floors = [], water = [], props = [], strips = [], stripItems = [], glows = [], glowItems = [];
  // The solid rock between the passages: black, a metre up (it stops your light where a wall would).
  { const mask = new Uint8Array(W * H); for (let q = 0; q < W * H; q++) if (L.cells[q] === ROCK && !L.edge[q]) mask[q] = 1; for (const [i0, j0, i1, j1] of mergeRects(mask, W, H)) fill.push(span(L.ox + i0, L.oz + j0, L.ox + i1, L.oz + j1, y, y + 1.2, '#000000'));
    // ...and the rock past the level's own grid, as far as any view reaches
    const R = 90, x0 = L.ox, z0 = L.oz, x1 = L.ox + W, z1 = L.oz + H;
    fill.push(span(x0 - R, z0 - R, x1 + R, z0, y, y + 1.2, '#000000'), span(x0 - R, z1, x1 + R, z1 + R, y, y + 1.2, '#000000'), span(x0 - R, z0, x0, z1, y, y + 1.2, '#000000'), span(x1, z0, x1 + R, z1, y, y + 1.2, '#000000')); }
  // Walls: a built level's concrete as merged runs; a cave's rock cell by cell, uneven.
  if (built) {
    for (const [x0, z0, x1, z1] of L.walls) {
      const k = hash(x0, z0);
      walls.push(span(x0, z0, x1, z1, y, y + wallH, k < 0.33 ? '#6e6a60' : k < 0.66 ? '#66625a' : '#726d63'));
    }
  } else {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const q = j * W + i;
      if (L.cells[q] !== ROCK || !L.edge[q]) continue;
      const x = L.ox + i + 0.5 + (hash(i, j, 7) - 0.5) * 0.3, z = L.oz + j + 0.5 + (hash(i, j, 8) - 0.5) * 0.3, k = hash(x, z), k2 = hash(x, z, 1);
      const h = 1.9 + k * 0.65, s = 1.35 + k2 * 0.45;
      lumps.push([x, y + h * 0.42, z, s, h, s * (0.85 + hash(i, j, 9) * 0.3), k < 0.25 ? '#5e4838' : k < 0.5 ? '#524133' : k < 0.75 ? '#685243' : '#4a3d31', k2 * 6.28]);
    }
  }
  // Floors.
  if (built) for (const [x0, z0, x1, z1, col] of L.floors) floors.push(span(x0, z0, x1, z1, y - 0.1, y, col));
  else {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const t = L.cells[j * W + i];
      if (t !== OPEN && t !== POOL && t !== DEEP) continue;
      const x = L.ox + i + 0.5, z = L.oz + j + 0.5, k = hash(x, z, 3);
      if (t === OPEN) { const v = 0.9 + 0.2 * (0.5 * k + 0.5 * hash(Math.floor(x / 3), Math.floor(z / 3), 4)); floors.push([x, y - 0.05, z, 1.01, 0.1, 1.01, `#${_c.setRGB(0.29 * v, 0.24 * v, 0.19 * v).getHexString()}`]); }
      else water.push([x, y + (t === POOL ? 0.04 : -0.06), z, 1.01, 0.04, 1.01, t === POOL ? '#30464a' : '#14232a']);
      if (t !== OPEN) floors.push([x, y - 0.25, z, 1.01, 0.1, 1.01, '#241e19']);
    }
  }
  // Props: furniture and fittings.
  for (const p of L.props) {
    const P = PROPS[p.kind], h = p.h, x0 = p.x0, z0 = p.z0, x1 = p.x1, z1 = p.z1;
    if (p.kind === 'rock') { const k = hash(x0, z0, 5); props.push([(x0 + x1) / 2, y + h / 2, (z0 + z1) / 2, x1 - x0, h, z1 - z0, k < 0.5 ? '#5d4a3a' : '#6b5644', k * 2]); continue; }
    if (p.kind === 'bunk' || p.kind === 'cot') {
      props.push(span(x0, z0, x1, z1, y + 0.3, y + 0.42, '#4a4f3e'));                              // the frame
      props.push(span(x0 + 0.05, z0 + 0.05, x1 - 0.05, z1 - 0.05, y + 0.42, y + 0.55, p.kind === 'cot' ? '#8a8a78' : '#6e6a52')); // the mattress
      if (p.kind === 'bunk') { props.push(span(x0, z0, x1, z1, y + 1.3, y + 1.42, '#4a4f3e')); props.push(span(x0 + 0.05, z0 + 0.05, x1 - 0.05, z1 - 0.05, y + 1.42, y + 1.55, '#76705a')); }
      continue;
    }
    if (p.kind === 'generator') {
      props.push(span(x0, z0, x1, z1, y, y + 0.25, '#3c3a34'));                                // the skid
      props.push(span(x0 + 0.15, z0 + 0.1, x1 - 0.5, z1 - 0.1, y + 0.25, y + 1.35, '#8a6e30'));   // the engine
      props.push(span(x1 - 0.5, z0 + 0.2, x1 - 0.05, z1 - 0.2, y + 0.25, y + 1.1, '#5a5a52'));    // the alternator
      props.push([x0 + 0.4, y + 1.9, (z0 + z1) / 2, 0.16, 1.1, 0.16, '#3a3632']);                // the exhaust
      const led = { kind: 'gen', x: x1 - 0.25, z: z0 + 0.1 };
      strips.push([led.x, y + 1.15, led.z, 0.12, 0.06, 0.04, LIGHT.stripOff]); stripItems.push(led);
      continue;
    }
    props.push(span(x0, z0, x1, z1, y, y + h, p.round ? '#6a3a24' : P?.color ?? '#5a5248'));
    if (p.screen) { const sx = (x0 + x1) / 2, sz = (z0 + z1) / 2; strips.push([sx, y + h + 0.01, sz, (x1 - x0) * 0.6, 0.02, (z1 - z0) * 0.5, LIGHT.stripOff]); stripItems.push({ kind: 'screen' }); }
  }
  // The flights that stand on this level (their stair mass) and the holes on it (their rails).
  for (const f of plan.flights) {
    if (f.to === L.k) stairs(f, props, y, wallH);
    if (f.from === L.k) holeRails(f, props, y);
  }
  for (const b of L.flightBoxes ?? []) if (b.tag === 'ug-flank' || b.tag === 'ug-endblock') props.push(span(b.x0, b.z0, b.x1, b.z1, Math.max(b.base, y), Math.min(b.top, y + wallH), '#5e5a50'));
  // The lift: its gate on this level (bars), and the shaft's black (no floor: the platform is drawn on its own).
  if (plan.lift) {
    const G = L.gate;
    for (let s = 0; s < 6; s++) {
      const t = (s + 0.5) / 6;
      const gx = G.x1 - G.x0 > G.z1 - G.z0 ? G.x0 + (G.x1 - G.x0) * t : (G.x0 + G.x1) / 2, gz = G.x1 - G.x0 > G.z1 - G.z0 ? (G.z0 + G.z1) / 2 : G.z0 + (G.z1 - G.z0) * t;
      props.push([gx, y + LIFT.gateH / 2, gz, 0.08, LIFT.gateH, 0.08, '#c9a032']);
    }
    props.push(span(G.x0, G.z0, G.x1, G.z1, y + LIFT.gateH - 0.08, y + LIFT.gateH, '#c9a032'));
    // the call panel beside the gate, its lamp in the strips
    const lb = L.lobby, panel = { kind: 'lift', x: lb.x + (plan.lift.axis === 'x' ? 0 : LIFT.w / 2 + 0.6), z: lb.z + (plan.lift.axis === 'x' ? LIFT.w / 2 + 0.6 : 0) };
    props.push([panel.x, y + 1.2, panel.z, 0.3, 0.5, 0.3, '#4a4c46']);
    strips.push([panel.x, y + 1.48, panel.z, 0.18, 0.04, 0.18, LIGHT.stripOff]); stripItems.push(panel);
  }
  // Doors: a blast door's frame and the hazard stripes before it; a keypad beside every keypad door, its lamp a strip.
  for (const d of L.doors) {
    const ax = d.axis === 'x', hw = d.width / 2;
    if (d.blast) {
      for (const s of [-1, 1]) props.push(ax ? [d.x + s * (hw + 0.2), y + 1.35, d.z, 0.4, 2.7, 0.7, '#7a7860'] : [d.x, y + 1.35, d.z + s * (hw + 0.2), 0.7, 2.7, 0.4, '#7a7860']);
      props.push(ax ? [d.x, y + 2.45, d.z, d.width + 0.8, 0.3, 0.7, '#7a7860'] : [d.x, y + 2.45, d.z, 0.7, 0.3, d.width + 0.8, '#7a7860']);
      for (let s = 0; s < 6; s++) { const t = -hw + (s + 0.5) * (d.width / 6); props.push(ax ? [d.x + t, y + 0.012, d.z + d.nz * 0.75, d.width / 6, 0.02, 0.6, s % 2 ? '#1c1a16' : '#d8a520'] : [d.x + d.nx * 0.75, y + 0.012, d.z + t, 0.6, 0.02, d.width / 6, s % 2 ? '#1c1a16' : '#d8a520']); }
    }
    if (d.keypad || d.blast) {
      const kx = ax ? d.x + (hw + 0.55) : d.x + d.nx * 0.32, kz = ax ? d.z + d.nz * 0.32 : d.z + (hw + 0.55);
      props.push([kx, y + 1.3, kz, 0.24, 0.34, 0.24, '#3e403a']);
      strips.push([kx, y + 1.5, kz, 0.14, 0.04, 0.14, LIGHT.stripOff]); stripItems.push({ kind: 'keypad', door: d.id, x: kx, z: kz });
    }
  }
  // Logs: paper on the floor, a terminal's screen (it glows when the power is on).
  for (const g of L.logs) {
    if (g.paper) props.push([g.x, y + 0.02, g.z, 0.3, 0.02, 0.22, '#d8d2bc', hash(g.x, g.z) * 3]);
    else { props.push([g.x, y + 0.45, g.z, 0.6, 0.9, 0.45, '#4a4e48']); strips.push([g.x, y + 0.92, g.z, 0.45, 0.02, 0.32, LIGHT.stripOff]); stripItems.push({ kind: 'screen', log: g.id }); }
  }
  // A cave's camp (a bedroll, a ring of dead fire) and its nest (stains and bones round what it keeps).
  if (L.camp) { props.push([L.camp.x - 1.1, y + 0.06, L.camp.z, 0.8, 0.12, 2.0, '#5d6a4a']); for (let s = 0; s < 7; s++) { const a = (s / 7) * 6.28; props.push([L.camp.x + 0.9 + Math.cos(a) * 0.45, y + 0.08, L.camp.z + Math.sin(a) * 0.45, 0.18, 0.16, 0.18, '#3a3430']); } props.push([L.camp.x + 0.9, y + 0.02, L.camp.z, 0.6, 0.02, 0.6, '#1e1a17']); }
  if (L.nest) {
    for (let s = 0; s < 14; s++) { const a = hash(s, L.nest.x) * 6.28, d = hash(s, L.nest.z) * L.nest.r * 0.8, x = L.nest.x + Math.cos(a) * d, z = L.nest.z + Math.sin(a) * d; props.push([x, y + 0.01, z, 0.8 + hash(s, 1) * 1.2, 0.015, 0.6 + hash(s, 2), '#3a120e', a]); }
    for (let s = 0; s < 18; s++) { const a = hash(s, 7) * 6.28, d = hash(s, 8) * L.nest.r * 0.7, x = L.nest.x + Math.cos(a) * d, z = L.nest.z + Math.sin(a) * d; props.push([x, y + 0.05, z, 0.5 + hash(s, 9) * 0.3, 0.07, 0.08, '#cfc6ad', a]); }
  }
  // Strip lights: the strip, and the pool it throws on the floor (both dark until the power is on).
  for (const l of L.lights) {
    const ax = l.along === 'x';
    strips.push([l.x, y + 2.32, l.z, ax ? l.len : 0.1, 0.07, ax ? 0.1 : l.len, LIGHT.stripOff]); stripItems.push({ kind: 'strip' });
    glows.push([l.x, y + 0.03, l.z, 6.5, 1, 6.5, '#000000']); glowItems.push({ kind: 'strip' });
  }
  // Chem lights: a stick on the floor and its green, amber or red pool.
  for (const gl of L.glows) {
    strips.push([gl.x, y + 0.04, gl.z, 0.18, 0.04, 0.04, LIGHT.chem[gl.c]]); stripItems.push({ kind: 'chem', c: gl.c });
    glows.push([gl.x, y + 0.03, gl.z, 4.6, 1, 4.6, LIGHT.chem[gl.c]]); glowItems.push({ kind: 'chem', c: gl.c });
  }
  // What the record adds: the dead where they fell (remains), the roof that came down (rubble).
  for (const o of lr?.occ ?? []) if (o.alive === false && o.kind !== 'drone') { props.push([o.x, y + 0.12, o.z, 0.6, 0.22, 1.7, '#3d3328', o.face ?? 0]); props.push([o.x + 0.3, y + 0.01, o.z, 1.2, 0.015, 1.0, '#3a110d', o.face ?? 0]); }
  for (const id of rec?.collapsed ?? []) { const C = L.collapses.find((c) => c.id === id); if (!C) continue; for (let s = 0; s < 9; s++) { const a = hash(s, C.x) * 6.28, d = hash(s, C.z) * C.r; props.push([C.x + Math.cos(a) * d, y + 0.5, C.z + Math.sin(a) * d, 0.9 + hash(s, 3) * 0.8, 1.0 + hash(s, 4) * 0.9, 0.8 + hash(s, 5) * 0.7, '#5d4c3c', a]); } }
  const group = new THREE.Group();
  group.name = `ug:${L.site}:${L.k}`;
  const add = (m) => { if (m) group.add(m); return m; };
  add(batch(walls, M.solid, BOX, { receive: true }));
  add(batch(lumps, M.rock, ROCKG, { receive: true }));
  add(batch(fill, M.black, BOX));
  add(batch(floors, M.floor, BOX, { receive: true }));
  add(batch(water, M.water, BOX));
  add(batch(props, M.props, BOX, { receive: true }));
  const sm = add(batch(strips, M.strip, BOX));
  const gm = add(batch(glows, M.glow, PLANE, { order: 2 }));
  group.visible = false;
  return { group, strips: sm, stripItems, stripBase: strips.map((s) => s[6]), glows: gm, glowItems, glowBase: glows.map((g) => g[6]) };
}

function stairs(f, props, y, wallH) {
  const steps = Math.max(6, Math.round(f.len / 0.32)), ax = f.axis === 'x';
  const ladder = f.look === 'ladder', rubble = f.look === 'rubble';
  for (let s = 0; s < steps; s++) {
    const t0 = s / steps, t1 = (s + 1) / steps;
    const a0 = f.aTop + f.u * f.len * t0, a1 = f.aTop + f.u * f.len * t1;
    const hTop = f.yTop + (f.yBot - f.yTop) * t1 + (f.yTop - f.yBot) / steps; // the tread's top
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    const yb = ladder ? hTop - 0.06 : Math.max(f.yBot - 0.1, hTop - 0.35);
    if (hTop > y + wallH) { props.push(ax ? [(lo + hi) / 2, y + 0.7, f.b0 + f.wc / 2, hi - lo + 0.02, 1.4, f.wc + 0.3, '#000000'] : [f.b0 + f.wc / 2, y + 0.7, (lo + hi) / 2, f.wc + 0.3, 1.4, hi - lo + 0.02, '#000000']); } // where the stair climbs into the rock, black under it (it stops your light; the treads above show as you climb)
    if (hTop < y - 0.2) continue;
    const col = rubble ? (s % 2 ? '#5a4838' : '#644f3d') : ladder ? '#8a7a52' : s % 2 ? '#5b564c' : '#635d52';
    if (ladder) props.push(ax ? [(lo + hi) / 2, hTop, f.b0 + f.wc / 2, 0.08, 0.06, f.wc - 0.1, col] : [f.b0 + f.wc / 2, hTop, (lo + hi) / 2, f.wc - 0.1, 0.06, 0.08, col]);
    else props.push(ax ? [(lo + hi) / 2, (yb + hTop) / 2, f.b0 + f.wc / 2, hi - lo + 0.02, hTop - yb, f.wc, col] : [f.b0 + f.wc / 2, (yb + hTop) / 2, (lo + hi) / 2, f.wc, hTop - yb, hi - lo + 0.02, col]);
  }
  if (ladder) for (const s of [0.05, f.wc - 0.05]) { const yc = (f.yTop + f.yBot) / 2, len = Math.hypot(f.len, f.yTop - f.yBot), ang = Math.atan2(f.yTop - f.yBot, f.len); props.push(ax ? [(f.aTop + f.aBot) / 2, yc, f.b0 + s, len, 0.07, 0.07, '#6a5e40', 0, 0] : [f.b0 + s, yc, (f.aTop + f.aBot) / 2, 0.07, 0.07, len, '#6a5e40']); void ang; }
}

function holeRails(f, props, y) {
  const R = f.rect, h = 1.0, t = 0.1;
  if (f.axis === 'x') { props.push(span(R.minX, R.minZ - t, R.maxX, R.minZ, y, y + h, '#3a3630'), span(R.minX, R.maxZ, R.maxX, R.maxZ + t, y, y + h, '#3a3630')); const xb = f.aBot; props.push(span(Math.min(xb, xb + f.u * t), R.minZ, Math.max(xb, xb + f.u * t), R.maxZ, y, y + h, '#3a3630')); }
  else { props.push(span(R.minX - t, R.minZ, R.minX, R.maxZ, y, y + h, '#3a3630'), span(R.maxX, R.minZ, R.maxX + t, R.maxZ, y, y + h, '#3a3630')); const zb = f.aBot; props.push(span(R.minX, Math.min(zb, zb + f.u * t), R.maxX, Math.max(zb, zb + f.u * t), y, y + h, '#3a3630')); }
}

// ---- a surface entrance ------------------------------------------------------------------------------------------------
// Returns { group, collar } (collar: the low walls round the opening, as boxes for the street's StaticWorld: extra).
export function buildEntrance(site, plan, M) {
  const E = ENTRANCES[site.entrance], f = plan.flights[0], ax = f.axis === 'x', y = plan.Y[0];
  const props = [], black = [], collar = [], rocks = [];
  const open = Math.min(f.len, f.open || 2.5), aOpen = f.aTop + f.u * open;
  const a0 = Math.min(f.aTop, aOpen), a1 = Math.max(f.aTop, aOpen), b0 = f.b0, b1 = f.b0 + f.wc;
  const rect = (A0, A1, B0, B1) => (ax ? { x0: A0, x1: A1, z0: B0, z1: B1 } : { x0: B0, x1: B1, z0: A0, z1: A1 });
  const H = E.collar, t = E.look === 'mouth' ? 0.9 : 0.3;
  // the opening, dark; the collar round it (its sides and its far lip; the near end is the way in)
  const O = rect(a0, a1, b0, b1);
  black.push(span(O.x0, O.z0, O.x1, O.z1, y + 0.02, y + 0.04, '#000000'));
  const sides = [rect(a0, a1, b0 - t, b0), rect(a0, a1, b1, b1 + t), f.u > 0 ? rect(a1, a1 + t, b0 - t, b1 + t) : rect(a0 - t, a0, b0 - t, b1 + t)];
  for (const s of sides) collar.push({ ...s, h: H });
  const coaming = E.look === 'mouth' ? '#6a5442' : E.look === 'culvert' ? '#8a8476' : '#6e6c62';
  if (E.look === 'mouth') {
    // a cave mouth: boulders round a dark pit that slopes into the hill, an overhang of rock at its far end
    for (const s of sides) { const n = Math.max(2, Math.round(Math.max(s.x1 - s.x0, s.z1 - s.z0) / 1.1)); for (let i = 0; i < n; i++) { const k = (i + 0.5) / n, x = s.x0 + (s.x1 - s.x0) * (ax ? k : 0.5), z = s.z0 + (s.z1 - s.z0) * (ax ? 0.5 : k); const r = 1.3 + hash(x, z) * 0.9; rocks.push([x, r * 0.35, z, r * 1.2, r * 0.9, r * 1.3, hash(x, z, 2) < 0.5 ? '#7a6048' : '#6a523e', hash(x, z, 1) * 6.28]); } }
    const ov = rect(f.u > 0 ? a1 - 1.4 : a0, f.u > 0 ? a1 : a0 + 1.4, b0 - 1.2, b1 + 1.2);
    for (let i = 0; i < 4; i++) { const k = (i + 0.5) / 4; const x = ax ? (ov.x0 + ov.x1) / 2 : ov.x0 + (ov.x1 - ov.x0) * k, z = ax ? ov.z0 + (ov.z1 - ov.z0) * k : (ov.z0 + ov.z1) / 2; rocks.push([x, y + 1.6, z, 2.2, 1.6, 2.0, '#634c3a', hash(x, z, 4) * 6.28]); }
  } else {
    for (const s of sides) props.push(span(s.x0, s.z0, s.x1, s.z1, y, y + (E.look === 'culvert' ? H : 0.55), coaming));
    if (E.look === 'hatch' || E.look === 'lift') {
      // a concrete apron round the opening (four pieces: the opening itself stays dark), the steps going down into it
      const m = 1.4, A0 = a0 - (f.u > 0 ? m : t), A1 = a1 + (f.u > 0 ? t : m), B0 = b0 - t - m, B1 = b1 + t + m;
      for (const r of [rect(A0, A1, B0, b0 - t), rect(A0, A1, b1 + t, B1), rect(A0, a0, b0 - t, b1 + t), rect(a1, A1, b0 - t, b1 + t)]) if (r.x1 - r.x0 > 0.05 && r.z1 - r.z0 > 0.05) props.push(span(r.x0, r.z0, r.x1, r.z1, y, y + 0.05, '#7c776c'));
      const steps = Math.floor(open / 0.5);
      for (let k = 0; k < steps; k++) { const s0 = f.aTop + f.u * k * 0.5, s1 = s0 + f.u * 0.5, r = rect(Math.min(s0, s1), Math.max(s0, s1), b0 + 0.05, b1 - 0.05), v = Math.max(0, 0.16 - k * 0.04); props.push(span(r.x0, r.z0, r.x1, r.z1, y + 0.02, y + 0.045 + 0.001 * k, `#${new THREE.Color(v, v * 0.97, v * 0.9).getHexString()}`)); }
    }
    if (E.look === 'hatch') {
      // the lid thrown open flat beside it, hazard paint on the far lip, two vent pipes
      const lid = rect(a0, a1, b0 - t - 1.45, b0 - t - 0.05);
      props.push(span(lid.x0, lid.z0, lid.x1, lid.z1, y + 0.05, y + 0.17, '#5f6a52'), span(lid.x0 + 0.2, lid.z0 + 0.2, lid.x1 - 0.2, lid.z1 - 0.2, y + 0.17, y + 0.2, '#56604a'));
      const lip = sides[2], n = 6;
      for (let i = 0; i < n; i++) { const k0 = i / n, k1 = (i + 1) / n; const r = ax ? { x0: lip.x0, x1: lip.x1, z0: lip.z0 + (lip.z1 - lip.z0) * k0, z1: lip.z0 + (lip.z1 - lip.z0) * k1 } : { x0: lip.x0 + (lip.x1 - lip.x0) * k0, x1: lip.x0 + (lip.x1 - lip.x0) * k1, z0: lip.z0, z1: lip.z1 }; props.push(span(r.x0, r.z0, r.x1, r.z1, y + 0.55, y + 0.58, i % 2 ? '#1c1a16' : '#d8a520')); }
      for (const s of [-1, 1]) { const p = ax ? [(a0 + a1) / 2 + s * 0.6, b1 + t + 0.8] : [b1 + t + 0.8, (a0 + a1) / 2 + s * 0.6]; props.push([p[0], y + 0.6, p[1], 0.22, 1.2, 0.22, '#5a5850']); props.push([p[0], y + 1.25, p[1], 0.36, 0.12, 0.36, '#4a4842']); }
    }
    if (E.look === 'culvert') { const hw = rect(f.u > 0 ? a1 : a0 - 0.5, f.u > 0 ? a1 + 0.5 : a0, b0 - 1.2, b1 + 1.2); props.push(span(hw.x0, hw.z0, hw.x1, hw.z1, y, y + 2.2, '#8a8476')); }
  }
  // the freight lift: a headframe over the shaft, a winch house, the platform (drawn by the system when the site is live)
  if (plan.lift) {
    const R = plan.lift.rect;
    for (const [x, z] of [[R.minX, R.minZ], [R.maxX, R.minZ], [R.minX, R.maxZ], [R.maxX, R.maxZ]]) props.push([x, y + 3.5, z, 0.28, 7, 0.28, '#7a5a32']);
    props.push(span(R.minX, R.minZ - 0.15, R.maxX, R.minZ + 0.15, y + 6.8, y + 7.1, '#7a5a32'), span(R.minX, R.maxZ - 0.15, R.maxX, R.maxZ + 0.15, y + 6.8, y + 7.1, '#7a5a32'));
    props.push([(R.minX + R.maxX) / 2, y + 7.3, (R.minZ + R.maxZ) / 2, 1.2, 0.5, 1.2, '#4c4a44']);
    black.push(span(R.minX, R.minZ, R.maxX, R.maxZ, y + 0.015, y + 0.03, '#000000'));
    const ax2 = plan.lift.axis === 'x', far = plan.lift.u > 0 ? (ax2 ? R.maxX : R.maxZ) : (ax2 ? R.minX : R.minZ);
    // three sides fenced on the street (the near side is the gate)
    const fence = ax2 ? [{ x0: R.minX, x1: R.maxX, z0: R.minZ - 0.12, z1: R.minZ }, { x0: R.minX, x1: R.maxX, z0: R.maxZ, z1: R.maxZ + 0.12 }, { x0: far - 0.12 * Math.max(0, -plan.lift.u), x1: far + 0.12 * Math.max(0, plan.lift.u), z0: R.minZ, z1: R.maxZ }]
      : [{ x0: R.minX - 0.12, x1: R.minX, z0: R.minZ, z1: R.maxZ }, { x0: R.maxX, x1: R.maxX + 0.12, z0: R.minZ, z1: R.maxZ }, { x0: R.minX, x1: R.maxX, z0: far - 0.12 * Math.max(0, -plan.lift.u), z1: far + 0.12 * Math.max(0, plan.lift.u) }];
    for (const s of fence) { collar.push({ ...s, h: 1.2 }); props.push(span(s.x0, s.z0, s.x1, s.z1, y, y + 1.2, '#c9a032')); }
    const pad = { x0: R.minX - 1.5, x1: R.maxX + 1.5, z0: R.minZ - 1.5, z1: R.maxZ + 1.5 };
    for (const r of [{ ...pad, z1: R.minZ }, { ...pad, z0: R.maxZ }, { x0: pad.x0, x1: R.minX, z0: R.minZ, z1: R.maxZ }, { x0: R.maxX, x1: pad.x1, z0: R.minZ, z1: R.maxZ }]) props.push(span(r.x0, r.z0, r.x1, r.z1, y, y + 0.05, '#7c776c'));
    for (const [x0, z0, x1, z1] of [[R.minX, R.minZ, R.maxX, R.minZ], [R.minX, R.maxZ, R.maxX, R.maxZ], [R.minX, R.minZ, R.minX, R.maxZ], [R.maxX, R.minZ, R.maxX, R.maxZ]]) { const len = Math.hypot(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, ry = Math.atan2(z1 - z0, x1 - x0); props.push([mx, y + 3.4, mz, len, 0.14, 0.14, '#6a4e2c', -ry]); props.push([mx, y + 5.4, mz, len, 0.14, 0.14, '#6a4e2c', -ry]); }
    const wh = ax2 ? { x0: R.minX - 0.5, x1: R.maxX + 0.5, z0: R.maxZ + 2.2, z1: R.maxZ + 5.2 } : { x0: R.maxX + 2.2, x1: R.maxX + 5.2, z0: R.minZ - 0.5, z1: R.maxZ + 0.5 };
    props.push(span(wh.x0, wh.z0, wh.x1, wh.z1, y, y + 3, '#6a6658'));
    collar.push({ ...wh, h: 3 });
  }
  const group = new THREE.Group();
  group.name = `ug-entrance:${site.id}`;
  const a = batch(props, M.props, BOX, { receive: true }); if (a) { a.castShadow = true; group.add(a); }
  const b = batch(black, M.black, BOX); if (b) group.add(b);
  const rk = batch(rocks, M.rock, ROCKG, { receive: true }); if (rk) { rk.castShadow = true; group.add(rk); }
  return { group, collar };
}

// The lift's platform (one mesh a live site; moved every frame it rides).
export function buildPlatform(plan, M) {
  const R = plan.lift.rect;
  const m = new THREE.Mesh(BOX, M.props);
  m.scale.set(R.maxX - R.minX - 0.1, 0.2, R.maxZ - R.minZ - 0.1);
  m.position.set((R.minX + R.maxX) / 2, plan.Y[0] - 0.1, (R.minZ + R.maxZ) / 2);
  m.receiveShadow = true;
  return m;
}

// Eyes that catch your light: a pair of tiny bright quads at each infected's head (one mesh, a fixed pool).
export function buildEyes(M, n = 48) {
  const geo = new THREE.PlaneGeometry(0.07, 0.05).rotateX(-Math.PI / 2);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: LIGHT.eye, toneMapped: false }), n * 2);
  m.count = 0; m.frustumCulled = false; m.renderOrder = 3;
  return m;
}

// The holdout's drone: a body, four rotors, a red lamp and the beam it sweeps the floor with (each a small pool).
export function buildDrones(M, n = 4) {
  const body = new THREE.InstancedMesh(BOX, M.props, n * 6);
  const beam = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), M.glow, n);
  body.count = 0; beam.count = 0; body.frustumCulled = false; beam.frustumCulled = false; beam.renderOrder = 2;
  for (let i = 0; i < n * 6; i++) body.setColorAt(i, _c.set(i % 6 === 0 ? '#4e5444' : i % 6 === 5 ? '#ff3a22' : '#2e2e2a'));
  for (let i = 0; i < n; i++) beam.setColorAt(i, _c.set('#ffe7b0'));
  return { body, beam };
}
export const _tmp = { o: _o, c: _c };
