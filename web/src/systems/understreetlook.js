import * as THREE from 'three';
import { radialGlow } from '../world/textures.js';
import { LAYERS, layerMesh } from '../engine/depthlayers.js';
import { FLOOD } from '../data/understreet.js';
import { UG } from '../data/underground.js';
import { CLS, LIFT_OF } from '../world/understreet.js';
import { mergeRects, OPEN } from '../world/undergen.js';

// How UNDER THE STREET looks (systems/understreet.js builds these): the ways on the street (manhole lids, kerb grates, the
// outfall's headwall, the culvert's mouths, a breach's hole in a store's floor) as one InstancedMesh a town; and below,
// over what the underground's own buildLevel draws (walls, floors, flights, props, strips), the drains' own: the water
// (merged runs by floor class, raised and lowered with the flood), the daylight falling through the grates (additive
// pools and shafts, brighter at noon), and the rats. Concrete, brick, iron, silt and murk: nothing in hue 270-320.

const _o = new THREE.Object3D(), _c = new THREE.Color();
const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const DISC = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const span = (x0, z0, x1, z1, y0, y1, col) => [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.max(0.02, x1 - x0), Math.max(0.02, y1 - y0), Math.max(0.02, z1 - z0), col];
// The two street layers (engine/depthlayers.js rows usHole / usLid): over every citygen street and kerb (to 0.112).
export const HOLE_Y = LAYERS.usHole.lift, LID_Y = LAYERS.usLid.lift;

export function makeLookMaterials() {
  return {
    iron: new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.55 }),
    solid: new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.05 }),
    water: new THREE.MeshStandardMaterial({ color: FLOOD.colour, roughness: 0.18, metalness: 0.25 }),
    glow: new THREE.MeshBasicMaterial({ map: radialGlow(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    shaft: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    rat: new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }),
  };
}

function batch(items, mat, geo = BOX) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  items.forEach((it, i) => { _o.position.set(it[0], it[1], it[2]); _o.rotation.set(it[8] ?? 0, it[7] ?? 0, 0); _o.scale.set(it[3], it[4], it[5]); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix); m.setColorAt(i, _c.set(it[6])); });
  m.count = items.length;
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = false; m.receiveShadow = true; m.computeBoundingSphere();
  return m;
}

// ---- on the street ------------------------------------------------------------------------------------------------------
// plan: the drain site's plan (its ways); open(way): is its lid off. Returns { group, collar: [{x0,z0,x1,z1,h}], lids:
// Map(way id -> instance indices), mesh } (the lids move when one is lifted: setLid).
export function buildWays(site, plan, M, open) {
  const items = [], lids = new Map(), collar = [];
  const add = (it) => { items.push(it); return items.length - 1; };
  const L = { lights: site.net.lights };
  for (const w of plan.ways) {
    const f = plan.flights.find((q) => q.id === w.flight), R = f.rect, y = f.yTop, ax = f.axis === 'x';
    const cx = (R.minX + R.maxX) / 2, cz = (R.minZ + R.maxZ) / 2;
    if (w.kind === 'manhole' || w.kind === 'grate') {
      // the shaft's mouth (black), its iron frame, and the lid (a disc for a manhole, bars for a grate)
      const top = f.topEdge, hx = ax ? top.x + f.u * 0.5 : top.x, hz = ax ? top.z : top.z + f.u * 0.5;
      const ids = [];
      ids.push(add([hx, y + HOLE_Y - 0.004, hz, 0.86, 0.008, 0.86, '#020202']));
      ids.push(add([hx, y + HOLE_Y, hz, 0.98, 0.012, 0.98, '#2e2b26'])); // frame (a ring under the lid)
      if (w.kind === 'manhole') { ids.push(add([hx, y + LID_Y, hz, 0.84, 0.03, 0.84, '#3a3630', 0, 0, 'disc'])); ids.push(add([hx, y + LID_Y + 0.018, hz, 0.5, 0.01, 0.5, '#4a453c', hash(hx, hz) * 3, 0, 'disc'])); }
      else for (let i = 0; i < 5; i++) { const t = -0.36 + i * 0.18; ids.push(add(ax ? [hx, y + LID_Y, hz + t, 0.9, 0.04, 0.07, '#33302a'] : [hx + t, y + LID_Y, hz, 0.07, 0.04, 0.9, '#33302a'])); }
      lids.set(w.id, { ids: ids.slice(2), base: ids.slice(2).map((i) => items[i].slice()), hx, hz, y, ax, u: f.u });
      continue;
    }
    // ramps (outfall, culvert, breach): the opening dark, stepped bands going down, a lip round three sides (the collar)
    const a0 = Math.min(f.aTop, f.aBot), a1 = Math.max(f.aTop, f.aBot), b0 = f.b0, b1 = f.b0 + f.wc;
    const rect = (A0, A1, B0, B1) => (ax ? { x0: A0, x1: A1, z0: B0, z1: B1 } : { x0: B0, x1: B1, z0: A0, z1: A1 });
    const O = rect(a0, a1, b0, b1);
    add(span(O.x0, O.z0, O.x1, O.z1, y + HOLE_Y - 0.01, y + HOLE_Y, '#020202'));
    const n = Math.floor(f.len / 0.5);
    for (let k = 0; k < n; k++) { const s0 = f.aTop + f.u * k * 0.5, s1 = s0 + f.u * 0.5, r = rect(Math.min(s0, s1), Math.max(s0, s1), b0 + 0.05, b1 - 0.05), v = Math.max(0, 0.2 - k * 0.025); add(span(r.x0, r.z0, r.x1, r.z1, y + HOLE_Y, y + HOLE_Y + 0.002 + 0.0005 * k, `#${_c.setRGB(v, v * 0.96, v * 0.88).getHexString()}`)); }
    const t = w.kind === 'breach' ? 0.22 : 0.4, H = w.kind === 'breach' ? 0.42 : w.kind === 'outfall' ? 1.1 : 0.9;
    const sides = [rect(a0, a1, b0 - t, b0), rect(a0, a1, b1, b1 + t), f.u > 0 ? rect(a1, a1 + t, b0 - t, b1 + t) : rect(a0 - t, a0, b0 - t, b1 + t)];
    const col = w.kind === 'breach' ? '#6e5e4c' : w.kind === 'outfall' ? '#8a8476' : '#8f8a7e';
    for (const s of sides) { collar.push({ ...s, h: H }); add(span(s.x0, s.z0, s.x1, s.z1, y, y + H, col)); }
    if (w.kind === 'breach') { // broken floor: chunks of slab round the hole
      for (let i = 0; i < 9; i++) { const k = hash(cx, cz, i), side = i % 2 ? 1 : -1, a = a0 + (a1 - a0) * k, b = side > 0 ? b1 + t + 0.15 : b0 - t - 0.15; const p = ax ? [a, b] : [b, a]; add([p[0], y + 0.12, p[1], 0.35 + k * 0.4, 0.16, 0.3 + hash(k, i) * 0.3, '#7a6e5e', k * 6]); }
    } else {
      // a headwall over the top of the opening (the far end, where it goes under), wing walls flaring out, an apron
      const far = f.u > 0 ? a1 : a0, hw = rect(Math.min(far, far + f.u * 0.6), Math.max(far, far + f.u * 0.6), b0 - 1.0, b1 + 1.0);
      add(span(hw.x0, hw.z0, hw.x1, hw.z1, y, y + (w.kind === 'outfall' ? 2.0 : 1.6), '#8a8476'));
      const ap = rect(Math.min(f.aTop, f.aTop - f.u * 2.2), Math.max(f.aTop, f.aTop - f.u * 2.2), b0 - 0.6, b1 + 0.6);
      add(span(ap.x0, ap.z0, ap.x1, ap.z1, y, y + HOLE_Y - 0.012, '#6f6a60'));
      if (w.kind === 'outfall' && w.bars) { for (let i = 0; i < 7; i++) { const bb = b0 + 0.2 + i * ((f.wc - 0.4) / 6); const p = ax ? [far - f.u * 0.1, bb] : [bb, far - f.u * 0.1]; add([p[0], y + 0.6, p[1], 0.06, 1.2, 0.06, '#4e463c']); } }
    }
  }
  // the light-only kerb grates (the loose ones are ways above)
  for (const g of L.lights) {
    if (g.loose) continue;
    const ax = g.axis === 'x', y = site.y ?? 0;
    add([g.x, y + HOLE_Y - 0.004, g.z, ax ? 0.9 : 0.5, 0.008, ax ? 0.5 : 0.9, '#050505']);
    for (let i = 0; i < 6; i++) { const t = -0.36 + i * 0.145; add(ax ? [g.x + t, y + LID_Y, g.z, 0.06, 0.035, 0.52, '#34312b'] : [g.x, y + LID_Y, g.z + t, 0.52, 0.035, 0.06, '#34312b']); }
  }
  // discs drawn as boxes would read as squares: lids go in their own disc batch
  const boxes = items.filter((it) => it[9] !== 'disc'), discs = items.filter((it) => it[9] === 'disc');
  const idx = items.map((it) => (it[9] === 'disc' ? -1 - discs.indexOf(it) : boxes.indexOf(it)));
  const group = new THREE.Group(); group.name = `us:${site.id}:street`;
  const mb = batch(boxes, M.iron), md = batch(discs, M.iron, DISC);
  layerMesh(mb, 'usLid'); layerMesh(md, 'usLid');
  group.add(mb, md);
  for (const [, l] of lids) l.ids = l.ids.map((i) => idx[i]);
  const out = { group, collar, lids, mb, md };
  for (const w of plan.ways) if (lids.has(w.id)) setLid(out, w.id, open(w.id));
  return out;
}
// A lid off (slid aside onto the street, the hole showing) or back on.
export function setLid(E, id, off) {
  const l = E.lids.get(id);
  if (!l) return;
  l.ids.forEach((ix, n) => {
    const it = l.base[n], m = ix < 0 ? E.md : E.mb, i = ix < 0 ? -1 - ix : ix;
    const dx = off ? (l.ax ? 0 : 0.95) : 0, dz = off ? (l.ax ? 0.95 : 0) : 0;
    _o.position.set(it[0] + dx, it[1] + (off ? 0.01 : 0), it[2] + dz); _o.rotation.set(0, (it[7] ?? 0) + (off ? 0.4 : 0), 0); _o.scale.set(it[3], it[4], it[5]); _o.updateMatrix();
    m.setMatrixAt(i, _o.matrix);
    m.instanceMatrix.needsUpdate = true;
  });
}

// ---- below ------------------------------------------------------------------------------------------------------------
// The water: one box per merged run of each floor class (lift), at the flood's height; setWater moves them. The grates'
// light: a pool on the floor under each and a faint shaft; setDay colours them by the daylight. The rats: setRats.
export function buildBelow(L, M) {
  const W = L.W, H = L.H, y = L.y, water = [], wlift = [], glows = [], shafts = [], deco = [];
  for (let c = 1; c < LIFT_OF.length; c++) {
    const mask = new Uint8Array(W * H); let any = false;
    for (let q = 0; q < W * H; q++) if (L.cells[q] === OPEN && L.cls[q] === c) { mask[q] = 1; any = true; }
    if (!any) continue;
    for (const R of mergeRects(mask, W, H)) { water.push([L.ox + (R[0] + R[2]) / 2, y, L.oz + (R[1] + R[3]) / 2, R[2] - R[0], 0.04, R[3] - R[1], FLOOD.colour]); wlift.push(LIFT_OF[c]); }
  }
  for (const g of L.grates) {
    glows.push([g.fx, y + 0.06, g.fz, g.loose ? 4.2 : 3.6, 1, g.loose ? 4.2 : 3.6, '#000000']);
    shafts.push([g.fx, y + UG.wallH / 2 + 0.2, g.fz, 0.7, UG.wallH + 0.4, 0.7, '#000000']);
  }
  // what the water left: silt at the trunk's walls, a weir across each junction's low side, rubbish in the channel
  for (const r of L.rooms) if (r.type === 'junction') { const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2; deco.push([cx, y + 0.18, r.z0 + 0.6, r.x1 - r.x0 - 0.4, 0.36, 0.3, '#6a6458'], [cx, y + 0.18, r.z1 - 0.6, r.x1 - r.x0 - 0.4, 0.36, 0.3, '#6a6458']); }
  for (let i = 0; i < 160; i++) {
    const q = Math.floor(hash(i, L.ox, 3) * W * H);
    for (let t = 0; t < 40; t++) { const qq = (q + t * 7919) % (W * H); if (L.cells[qq] === OPEN && (L.cls[qq] === CLS.channel || L.cls[qq] === CLS.lateral)) { const x = L.ox + (qq % W) + hash(i, 1) * 0.8 + 0.1, z = L.oz + Math.floor(qq / W) + hash(i, 2) * 0.8 + 0.1, k = hash(i, 4); deco.push([x, y + 0.03, z, 0.2 + k * 0.5, 0.06, 0.15 + hash(i, 5) * 0.4, k < 0.3 ? '#5a4a36' : k < 0.6 ? '#3e3a32' : '#6a5e48', k * 6]); break; } }
  }
  const group = new THREE.Group(); group.name = `us:${L.site}:below`;
  const mw = batch(water, M.water); group.add(mw);
  const mg = batch(glows, M.glow, PLANE); mg.renderOrder = 2; group.add(mg);
  const ms = batch(shafts, M.shaft); ms.renderOrder = 2; group.add(ms);
  const md = batch(deco, M.solid); group.add(md);
  const rats = new THREE.InstancedMesh(BOX, M.rat, 72); rats.count = 0; rats.frustumCulled = false; group.add(rats);
  group.visible = false;
  return { group, mw, water, wlift, mg, glows, ms, shafts, rats, level: -1, day: -1 };
}
export function setWater(B, level, y) {
  if (Math.abs(level - B.level) < 0.01) return;
  B.level = level;
  B.water.forEach((it, i) => {
    const d = level - B.wlift[i];
    _o.position.set(it[0], y + Math.max(B.wlift[i], level) - 0.02, it[2]); _o.rotation.set(0, 0, 0);
    if (d > 0.02) _o.scale.set(it[3], 0.04, it[5]); else _o.scale.set(0, 0, 0);
    _o.updateMatrix(); B.mw.setMatrixAt(i, _o.matrix);
  });
  B.mw.instanceMatrix.needsUpdate = true;
}
export function setDay(B, day) {
  if (Math.abs(day - B.day) < 0.02) return;
  B.day = day;
  _c.setRGB(1.0 * day, 0.92 * day, 0.74 * day);
  for (let i = 0; i < B.glows.length; i++) B.mg.setColorAt(i, _c);
  for (let i = 0; i < B.shafts.length; i++) B.ms.setColorAt(i, _c);
  if (B.mg.instanceColor) B.mg.instanceColor.needsUpdate = true;
  if (B.ms.instanceColor) B.ms.instanceColor.needsUpdate = true;
}
// rats: [{ x, z, a, alive }] -> two boxes each (a body, a tail), at the floor (over the water's surface when it is up)
export function setRats(B, rats, n, y, level) {
  const m = B.rats; let k = 0;
  const yy = y + Math.max(0, Math.min(0.3, level)) + 0.06;
  for (let i = 0; i < n; i++) {
    const r = rats[i], s = Math.sin(r.a), c = Math.cos(r.a);
    _o.rotation.set(0, r.a, 0);
    _o.position.set(r.x, yy, r.z); _o.scale.set(0.11, 0.1, 0.26); _o.updateMatrix(); m.setMatrixAt(k, _o.matrix); m.setColorAt(k++, _c.set('#3a3028'));
    _o.position.set(r.x - s * 0.24, yy - 0.03, r.z - c * 0.24); _o.scale.set(0.025, 0.02, 0.24); _o.updateMatrix(); m.setMatrixAt(k, _o.matrix); m.setColorAt(k++, _c.set('#6a5448'));
  }
  m.count = k;
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
}
