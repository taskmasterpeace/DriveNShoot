// THE Z-FIGHT DETECTOR (docs/design/WEB_DEPTH_LAYERS.md): walks the live scene graph round a spot and finds every pair of
// visible, depth-writing faces that lie in (nearly) the same plane and overlap - a floor on a pad, a road on a road, a
// roof's top on a wall's top, a sign flat on a wall - closer than the depth buffer can keep apart from the game camera,
// with no polygonOffset between them. Any orientation: the faces are grouped by normal and plane offset, candidate pairs
// overlap in 3D, and the smaller face of each pair is sampled (0.5 m) against the other (inside it, and within the gap
// of its plane).
// Decals (transparent, depthWrite false) are checked apart: one buried under the top surface it should lie on is never
// drawn, whatever its polygonOffset.
//
// Pure reading: nothing in the scene is touched. An agent command (tens of ms), never per frame.
import * as THREE from 'three';
import { DEPTH, LAYERS, nearFor } from '../engine/depthlayers.js';

const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _s = new THREE.Sphere();
const JX = 0.137, JZ = 0.291; // the decal grid's sample jitter inside its cell: never on a grid line, so never on a shared edge

// What a mesh is, for the report: its depth-layer name, else its name, else its parent's, else colour and vertex count.
export function labelOf(o) {
  if (o.userData?.depthLayer) return o.userData.depthLayer;
  if (o.name) return o.name;
  for (let p = o.parent; p; p = p.parent) if (p.name) return `${p.name}/${o.type}`;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  return `${o.isInstancedMesh ? 'inst' : 'mesh'}#${m?.color?.getHexString?.() ?? '?'}:${o.geometry?.attributes?.position?.count ?? 0}v`;
}
// The separation a material buys: polygonOffset factor/units (more negative = drawn nearer).
const offKey = (m) => (m.polygonOffset ? `${m.polygonOffsetFactor}/${m.polygonOffsetUnits}` : '0/0');
const isDecal = (m) => m.transparent && !m.depthWrite;
const PROTO_BC = String(THREE.Material.prototype.onBeforeCompile);
const plainMat = (m) => m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile;
// Two faces of one instanced batch with one instance colour draw the same pixel whichever wins when the material's shading
// of that face depends on nothing per instance but the colour: a plain material, the cutaway's screen-space dither
// (systems/cutaway.js, '|cut1'), and the TOP of a wall (world/surfaces.js wallSurface paints only the sides).
function twinSafe(m, up) {
  if (plainMat(m)) return true;
  // (the wind's patches, systems/lookfeel.js '|wind-*', only move vertices: shading still depends on the colour alone)
  const key = String(m.customProgramCacheKey?.() ?? '').replace(/\|(cut1|wind-[a-z-]+)/g, '');
  return key === '' || key === String(m.onBeforeCompile) || key === PROTO_BC || (up && key === 'wallSurface1'); // (an unkeyed patch keys on its own source: the cutaway's wrapper)
}
const sameColour = (A, B) => { const c = A.o.instanceColor; if (!c) return true; const a = c.array, i = A.inst * 3, j = B.inst * 3; return a[i] === a[j] && a[i + 1] === a[j + 1] && a[i + 2] === a[j + 2]; };
const visibleUp = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

// The minimum gap the depth buffer resolves at distance `dist` (m) from a camera with near plane `near`: a 24-bit buffer,
// x8 for the interpolation error across a big triangle; never below the law's floor (DEPTH.eps).
export const depthGap = (dist, near) => Math.max(DEPTH.eps, 8 * dist * dist / (near * 16777216));

// Triangles of one mesh (or one instance) in world space into a flat store (9 floats each) + per-triangle plane and bounds.
function collect(geo, M, S, tag, box, minNy) {
  const pos = geo.attributes.position; if (!pos) return;
  const idx = geo.index, dr = geo.drawRange, n = Math.min(idx ? idx.count : pos.count, dr.start + dr.count); // (a pooled slot draws only its range)
  for (let t = dr.start; t + 2 < n; t += 3) {
    const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
    _a.fromBufferAttribute(pos, i0).applyMatrix4(M); _b.fromBufferAttribute(pos, i1).applyMatrix4(M); _c.fromBufferAttribute(pos, i2).applyMatrix4(M);
    const bx0 = Math.min(_a.x, _b.x, _c.x), bx1 = Math.max(_a.x, _b.x, _c.x), bz0 = Math.min(_a.z, _b.z, _c.z), bz1 = Math.max(_a.z, _b.z, _c.z);
    if (bx1 < box.x0 || bx0 > box.x1 || bz1 < box.z0 || bz0 > box.z1) continue;
    const ux = _b.x - _a.x, uy = _b.y - _a.y, uz = _b.z - _a.z, vx = _c.x - _a.x, vy = _c.y - _a.y, vz = _c.z - _a.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz); if (len < 1e-8) continue;
    const f = S.flip ? -1 / len : 1 / len; nx *= f; ny *= f; nz *= f;
    if (ny < minNy) continue; // facing the ground: never seen from the top-down camera
    S.v.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
    S.n.push(nx, ny, nz, nx * _a.x + ny * _a.y + nz * _a.z, len / 2);
    S.bb.push(bx0, Math.min(_a.y, _b.y, _c.y), bz0, bx1, Math.max(_a.y, _b.y, _c.y), bz1);
    S.tag.push(tag);
  }
}

// Is p inside triangle k (projected along its plane's dominant axis), strictly (edges excluded)?
function inside(S, k, px, py, pz) {
  const v = S.v, o = k * 9, N = S.n, q = k * 5, ax = Math.abs(N[q]), ay = Math.abs(N[q + 1]), az = Math.abs(N[q + 2]);
  let i0 = 0, i1 = 2; if (ax >= ay && ax >= az) { i0 = 1; i1 = 2; } else if (az >= ay) { i0 = 0; i1 = 1; }
  const pu = i0 === 0 ? px : py, pw = i1 === 2 ? pz : py;
  const au = v[o + i0], aw = v[o + i1], bu = v[o + 3 + i0], bw = v[o + 3 + i1], cu = v[o + 6 + i0], cw = v[o + 6 + i1];
  const d = (bw - cw) * (au - cu) + (cu - bu) * (aw - cw); if (Math.abs(d) < 1e-12) return false;
  const l1 = ((bw - cw) * (pu - cu) + (cu - bu) * (pw - cw)) / d, l2 = ((cw - aw) * (pu - cu) + (au - cu) * (pw - cw)) / d, l3 = 1 - l1 - l2;
  return l1 > 1e-4 && l2 > 1e-4 && l3 > 1e-4;
}

// zfightScan(g, { x, z, r }) -> { fights, pairs: [{pair, samples, dyMax, facing, at}], decals: {...}, ... }
export function zfightScan(g, { x, z, r = 24, spacing = 0.5, minNy = -0.25, decalCell = 0.5 } = {}) {
  const t0 = performance.now();
  const scene = g.scene, cam = g.camera;
  scene.updateMatrixWorld();
  const box = { x0: x - r, x1: x + r, z0: z - r, z1: z + r };
  const S = { v: [], n: [], bb: [], tag: [], flip: false };
  const D = { v: [], n: [], bb: [], tag: [], flip: false }; // decals
  const tags = []; // { o, inst, label, off, m }
  let meshes = 0;
  // People and cars are not layers: two standing on one spot (a body over a body) overlap for as long as they do (systems/characters.js).
  // Vehicles too: a car body is one merged mesh of parts (systems/vehiclebodies.js), checked as an asset, not a layer.
  const actors = new Set(Object.values(g.charR?.meshes ?? {}));
  for (const v of g.vehicles ?? []) v.mesh?.traverse?.((o) => actors.add(o));
  const nearS = (sph) => sph.center.x + sph.radius >= box.x0 && sph.center.x - sph.radius <= box.x1 && sph.center.z + sph.radius >= box.z0 && sph.center.z - sph.radius <= box.z1;
  scene.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || actors.has(o) || !visibleUp(o)) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.visible === false || m.colorWrite === false || m.depthTest === false) return;
    if (m.blending === THREE.AdditiveBlending) return; // glows: light, not a surface
    const geo = o.geometry; if (!geo?.attributes?.position) return;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const decal = isDecal(m) && (m.polygonOffset || LAYERS[o.userData?.depthLayer]?.write === false), into = decal ? D : (m.transparent ? null : S); // (a decal says so: its layer row or its polygonOffset; glass and smoke do not)
    if (!into) return; // a see-through sheet that still writes depth (glass, water): sorted after the opaque world
    const off = offKey(m), label = labelOf(o);
    meshes++;
    const add = (M, inst) => {
      _s.copy(geo.boundingSphere).applyMatrix4(M); if (!nearS(_s)) return;
      const tag = tags.length; tags.push({ o, inst, label, off, m });
      into.flip = M.determinant() < 0;
      collect(geo, M, into, tag, box, decal ? 0.5 : minNy);
    };
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, _mi);
        if (_mi.elements[0] === 0 && _mi.elements[5] === 0 && _mi.elements[10] === 0) continue; // a parked (zero-scaled) slot
        add(_m.multiplyMatrices(o.matrixWorld, _mi), i);
      }
    } else add(o.matrixWorld, -1);
  });
  const nT = S.tag.length;
  const W = g.streamer?.W, gy = W?.terrain ? W.groundAt(x, z) : groundUnder(S, x, z);
  const dist = cam.position.distanceTo(_a.set(x, gy, z));
  const gap = depthGap(dist, cam.near);
  // ---- candidate pairs: same facing (normal key), plane offsets within the gap -----------------------------------------
  const Q = 12, groups = new Map();
  for (let k = 0; k < nT; k++) {
    const q = k * 5, key = `${Math.round(S.n[q] * Q)},${Math.round(S.n[q + 1] * Q)},${Math.round(S.n[q + 2] * Q)}`;
    let G = groups.get(key); if (!G) groups.set(key, (G = { n: [S.n[q], S.n[q + 1], S.n[q + 2]], list: [] })); G.list.push(k);
  }
  for (const G of groups.values()) G.list.sort((a, b) => S.n[a * 5 + 3] - S.n[b * 5 + 3]);
  const keys = [...groups.keys()];
  const pairs = new Map();
  let fights = 0, wallFights = 0, twins = 0, separated = 0;
  const bb = S.bb;
  const bbOver = (a, b, pad) => { const A = a * 6, B = b * 6; return bb[A] <= bb[B + 3] + pad && bb[B] <= bb[A + 3] + pad && bb[A + 1] <= bb[B + 4] + pad && bb[B + 1] <= bb[A + 4] + pad && bb[A + 2] <= bb[B + 5] + pad && bb[B + 2] <= bb[A + 5] + pad; };
  const test = (a, b) => {
    if (S.tag[a] === S.tag[b] && tags[S.tag[a]].inst >= 0) return; // two faces of one instance (a box's own faces never fight)
    if (!bbOver(a, b, gap)) return;
    // sample the smaller face against the bigger
    let s = a, t = b; if (S.n[a * 5 + 4] > S.n[b * 5 + 4]) { s = b; t = a; }
    const o = s * 9, v = S.v, area = S.n[s * 5 + 4], tn = t * 5, nx = S.n[tn], ny = S.n[tn + 1], nz = S.n[tn + 2], d = S.n[tn + 3];
    const e = Math.max(Math.hypot(v[o + 3] - v[o], v[o + 4] - v[o + 1], v[o + 5] - v[o + 2]), Math.hypot(v[o + 6] - v[o], v[o + 7] - v[o + 1], v[o + 8] - v[o + 2]), Math.hypot(v[o + 6] - v[o + 3], v[o + 7] - v[o + 4], v[o + 8] - v[o + 5]));
    const n = Math.max(1, Math.min(300, Math.ceil(e / Math.max(spacing, Math.sqrt(area / 6000)))));
    let hits = 0, hd = -1, hx = 0, hy = 0, hz = 0;
    for (let i = 0; i < n; i++) for (let j = 0; i + j < n; j++) {
      const l1 = (i + 1 / 3) / n, l2 = (j + 1 / 3) / n, l3 = 1 - l1 - l2;
      const px = l1 * v[o] + l2 * v[o + 3] + l3 * v[o + 6], py = l1 * v[o + 1] + l2 * v[o + 4] + l3 * v[o + 7], pz = l1 * v[o + 2] + l2 * v[o + 5] + l3 * v[o + 8];
      if (px < box.x0 || px > box.x1 || pz < box.z0 || pz > box.z1) continue;
      const dd = Math.abs(nx * px + ny * py + nz * pz - d); if (dd >= gap - 1e-4) continue; // (a row lifted by exactly eps passes)
      if (!inside(S, t, px, py, pz)) continue;
      hits++; if (dd > hd) { hd = dd; hx = px; hy = py; hz = pz; }
    }
    if (!hits) return;
    const A = tags[S.tag[a]], B = tags[S.tag[b]];
    if (A.off !== B.off) { separated += hits; return; } // the law's polygonOffset keeps them apart
    // Twins: two instances of one plain instanced material with the same instance colour draw the same pixel whichever
    // wins (two crossing kerbs): invisible, counted apart.
    if (A.o === B.o && A.o.isInstancedMesh && twinSafe(A.m, ny > 0.9) && sameColour(A, B)) { twins += hits; return; }
    const up = ny > 0.7; // what the top-down camera looks at; a wall's face shows at sin(8 deg) of its height
    if (up) fights += hits; else wallFights += hits;
    const key = `${up ? '' : 'wall: '}${A.label < B.label ? `${A.label} | ${B.label}` : `${B.label} | ${A.label}`}`;
    let p = pairs.get(key);
    if (!p) pairs.set(key, (p = { pair: key, samples: 0, dyMax: -1, facing: up ? 'up' : 'wall', at: null }));
    p.samples += hits; if (hd > p.dyMax) { p.dyMax = +hd.toFixed(4); p.at = { x: +hx.toFixed(2), y: +hy.toFixed(3), z: +hz.toFixed(2), inst: [A.inst, B.inst], obj: [A.o.id, B.o.id] }; }
  };
  for (let gi = 0; gi < keys.length; gi++) {
    const G = groups.get(keys[gi]);
    for (let gj = gi; gj < keys.length; gj++) {
      const H = groups.get(keys[gj]);
      if (G.n[0] * H.n[0] + G.n[1] * H.n[1] + G.n[2] * H.n[2] < 0.995) continue; // not parallel enough to fight
      const L = G.list, M = H.list, slack = gap + 0.5; // (0.5: near-parallel planes drift apart across a big face)
      for (let i = 0, j0 = 0; i < L.length; i++) {
        const a = L[i], da = S.n[a * 5 + 3];
        while (j0 < M.length && S.n[M[j0] * 5 + 3] < da - slack) j0++;
        for (let j = j0; j < M.length; j++) {
          const b = M[j]; if (S.n[b * 5 + 3] > da + slack) break;
          if (gi === gj && b <= a) continue;
          test(a, b);
        }
      }
    }
  }
  const list = [...pairs.values()].sort((a, b) => b.samples - a.samples);
  return {
    ok: true, x, z, r, spacing, meshes, tris: nT, near: cam.near, far: cam.far, camDist: +dist.toFixed(1), gap: +gap.toFixed(4),
    fights, wallFights, twins, separated, pairs: list.slice(0, 30), decals: decalCheck(S, D, tags, box, decalCell), ms: +(performance.now() - t0).toFixed(1),
  };
}

// The height of the top up-facing face over (x, z) (the camera's distance is measured to it).
function groundUnder(S, x, z) {
  let best = -Infinity;
  for (let k = 0; k < S.tag.length; k++) {
    const b = k * 6; if (S.bb[b] > x || S.bb[b + 3] < x || S.bb[b + 2] > z || S.bb[b + 5] < z || S.n[k * 5 + 1] < 0.9) continue;
    const q = k * 5, y = (S.n[q + 3] - S.n[q] * x - S.n[q + 2] * z) / S.n[q + 1];
    if (y > best && inside(S, k, x, y, z)) best = y;
  }
  return Number.isFinite(best) ? best : 0;
}

// Decals on up-facing ground: each 0.5 m sample of a decal against the top opaque face over it. Buried more than 4 mm
// = never drawn there (polygonOffset buys depth slope, not centimetres).
function decalCheck(S, D, tags, box, cell) {
  const bury = 0.004, out = new Map(); let cells = 0, buried = 0;
  for (let k = 0; k < D.tag.length; k++) {
    const q = k * 5; if (D.n[q + 1] < 0.5) continue;
    const bx0 = D.bb[k * 6], bx1 = D.bb[k * 6 + 3], bz0 = D.bb[k * 6 + 2], bz1 = D.bb[k * 6 + 5];
    for (let px = bx0 + cell * JX; px < bx1; px += cell) for (let pz = bz0 + cell * JZ; pz < bz1; pz += cell) {
      if (px < box.x0 || px > box.x1 || pz < box.z0 || pz > box.z1) continue;
      const y = (D.n[q + 3] - D.n[q] * px - D.n[q + 2] * pz) / D.n[q + 1];
      if (!inside(D, k, px, y, pz)) continue;
      // the top opaque up face here, at most 0.5 m over the decal (higher = something standing on it: a person, a car, a crate)
      let top = -Infinity, topTag = -1;
      for (let t = 0; t < S.tag.length; t++) {
        const b = t * 6; if (S.bb[b] > px || S.bb[b + 3] < px || S.bb[b + 2] > pz || S.bb[b + 5] < pz || S.n[t * 5 + 1] < 0.5 || S.n[t * 5 + 4] < 0.5) continue; // (a floor, a road, a rug: a face over half a square metre; blood under a body, a crate or a broken board is just under it)
        const r = t * 5, yt = (S.n[r + 3] - S.n[r] * px - S.n[r + 2] * pz) / S.n[r + 1];
        if (yt > top && yt < y + 0.5 && inside(S, t, px, yt, pz)) { top = yt; topTag = S.tag[t]; }
      }
      if (topTag < 0) continue;
      cells++;
      if (y < top - bury) {
        buried++;
        const key = `${tags[D.tag[k]].label} under ${tags[topTag].label}`;
        let b = out.get(key); if (!b) out.set(key, (b = { pair: key, cells: 0, depth: 0, at: null }));
        b.cells++; if (top - y > b.depth) { b.depth = +(top - y).toFixed(4); b.at = { x: +px.toFixed(2), z: +pz.toFixed(2), y: +y.toFixed(3), top: +top.toFixed(3) }; }
      }
    }
  }
  return { cells, buried, worst: [...out.values()].sort((a, b) => b.cells - a.cells).slice(0, 12) };
}

// ---- the agent side ---------------------------------------------------------------------------------------------------
export function zfightCommands(api) {
  const g = api.g;
  return {
    zfight: {
      group: 'observe', budget: 120,
      desc: 'THE Z-FIGHT DETECTOR (docs/design/WEB_DEPTH_LAYERS.md; rows src/engine/depthlayers.js): walks the live scene round x,z (default the camera\'s look point) over a square of half-side r m, and lists every pair of visible, depth-writing faces (any orientation: floors, roads, roof tops, walls) lying in one plane closer than the depth buffer resolves from the game camera (gap = max(DEPTH.eps, 8 d²/(near·2^24))) with no polygonOffset between them (pairs: labels, samples at 0.5 m, the worst spot), plus decals buried under the surface they should lie on. layers=true returns the depth-layer rows, the camera\'s near/far and the shadow bias.',
      args: { x: { type: 'number' }, z: { type: 'number' }, r: { type: 'number', default: 24 }, layers: { type: 'boolean', default: false } },
      run: async ({ x, z, r = 24, layers = false }) => {
        if (layers) { const { LAYERS, DEPTH: DP } = await import('../engine/depthlayers.js'); return { ok: true, DEPTH: DP, LAYERS, near: g.camera.near, far: g.camera.far, shadow: { bias: g.sky.sun.shadow.bias, normalBias: g.sky.sun.shadow.normalBias } }; }
        return zfightScan(g, { x: x ?? g.camLook.x, z: z ?? g.camLook.z, r: Math.min(60, r) });
      },
    },
  };
}

// The spots the battery scans (docs/design/WEB_DEPTH_LAYERS.md §8): a Phoenix street, a ring house you stand inside (its
// roof cut away), the Phoenix ring's densest blocks, Meridian (Florida, a holdout on real terrain), the interstate in the
// Arizona hills, Meridian's town cemetery (death rites' plots), and a stamped Florida county seat's police station and roofs.
export const ZFIGHT_SPOTS = [
  { id: 'phoenix street', at: { x: 0, z: -70 } },
  { id: 'ring house interior (cutaway)', at: { x: 598, z: 300 } },
  { id: 'ring dense blocks', at: { x: -896, z: -384 } },
  { id: 'meridian (florida)', at: { town: 'meridian' } },
  { id: 'i-10 mile 30 (real terrain)', at: { mile: 30, dir: 'east' } },
  { id: 'meridian town cemetery (death rites)', at: { x: 222692, z: 55845 } },
  { id: 'county seat police station + roofs', stamp: { archetype: 'county_seat', at: '222600,56160' }, at: { x: 222582, z: 56160 } },
];

export async function zfightChecks({ g, check, C }) {
  const home = { x: g.player.x, z: g.player.z };
  await check("zfight: no two visible, depth-writing, up-facing faces share a plane (closer than the depth gap, no polygonOffset between them) at seven spots - a Phoenix street, a ring house interior with its roof cut away, the ring's densest blocks, Meridian on Florida's real terrain, I-10 in the Arizona hills, Meridian's cemetery, a stamped county seat's police station and roofs - and no ground decal is buried under the floor it lies on", async () => {
    const out = {};
    let bad = 0;
    for (const S of ZFIGHT_SPOTS) {
      let stamp = null;
      if (S.stamp) { await C('teleport', S.at); stamp = await C('citygen', { action: 'stamp', ...S.stamp }); }
      await C('teleport', S.at); await C('step', { seconds: 0.6 });
      const z = zfightScan(g, { x: g.player.x, z: g.player.z, r: 40 });
      out[S.id] = { up: z.fights, walls: z.wallFights, buried: z.decals.buried, tris: z.tris, worst: z.pairs.find((q) => q.facing === 'up')?.pair };
      if (z.fights || z.decals.buried) bad++;
      if (stamp?.id) await C('citygen', { action: 'remove', id: stamp.id });
    }
    await C('teleport', home);
    return bad ? JSON.stringify(out) : true;
  });

  await check("zfight: blood shows on a ring shop's floor and on open sand from the widest game zoom (a red decal changes the pixel under it from 140 m up; hidden, it does not), and the camera's near plane follows the boom (>= 6x the old 1 m at the widest zoom)", async () => {
    const THREEv = (await import('three'));
    const W = 384, H = 216, rt = new THREEv.WebGLRenderTarget(W, H), buf = new Uint8Array(W * H * 4), cam = g.camera;
    const near0 = cam.near, pos0 = cam.position.clone(), q0 = cam.quaternion.clone(), asp0 = cam.aspect;
    const res = {};
    try {
      await C('setTime', { hour: 12 }); await C('setWeather', { key: 'CLEAR', instant: true });
      for (const [id, at] of [['ring floor', { x: 598, z: 300 }], ['open sand', { x: 300, z: 640 }]]) {
        await C('teleport', at); await C('step', { seconds: 0.5 });
        const x = g.player.x + 2.5, z = g.player.z + 2.5, gy = g.fx.ground ? g.fx.ground(x, z) : 0;
        const i = g.fx.decal(x, z, 2.2, '#ff0000', 0);
        const shot = (vis) => {
          g.fx.dMesh.visible = vis; const h = 140;
          cam.near = nearFor(h); cam.aspect = W / H; cam.position.set(x, gy + h, z + h * 0.14); cam.lookAt(x, gy, z); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
          g.renderer.setRenderTarget(rt); g.renderer.render(g.scene, cam); g.renderer.setRenderTarget(null);
          g.renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
          // the reddest pixel inside the decal's footprint on screen (a splat has gaps; furniture can stand on part of it)
          const c = new THREEv.Vector3(x, gy, z).project(cam), e = new THREEv.Vector3(x + 1, gy, z).project(cam);
          const px = (c.x / 2 + 0.5) * W, py = (c.y / 2 + 0.5) * H, rp = Math.max(1, Math.abs(e.x - c.x) / 2 * W);
          let best = -999;
          for (let yy = Math.floor(py - rp); yy <= py + rp; yy++) for (let xx = Math.floor(px - rp); xx <= px + rp; xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const k = (yy * W + xx) * 4; best = Math.max(best, buf[k] - buf[k + 1]);
          }
          return best;
        };
        const on = shot(true), off = shot(false);
        g.fx.dMesh.visible = true; g.fx.dMesh.setMatrixAt(i, new THREEv.Matrix4().makeScale(0, 0, 0)); g.fx.dMesh.instanceMatrix.needsUpdate = true;
        res[id] = { on, off, redder: on - off, near: +nearFor(140).toFixed(2) };
      }
    } finally {
      cam.near = near0; cam.aspect = asp0; cam.position.copy(pos0); cam.quaternion.copy(q0); cam.updateProjectionMatrix(); rt.dispose();
      await C('teleport', home);
    }
    const ok = Object.values(res).every((r) => r.redder > 30) && nearFor(175) >= 6;
    return ok ? true : JSON.stringify(res);
  });
}
