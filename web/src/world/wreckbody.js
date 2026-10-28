// A DEAD BODY from one of our real vehicle bodies (systems/vehiclebodies.js buildBody: one merged, vertex-coloured mesh
// with a per-vertex `part` id) and a WRECK_STATES row (data/wrecks.js): the same car you drive, rusted and abandoned,
// burned out, or stripped and up on blocks. Pure geometry work, once per type x state (systems/wrecks.js caches it).
//   paint     the body is built in a neutral paint (WRECK_BASE): the instance tint gives each wreck its old colour
//   skin      the painted panels (the vertices that kept the neutral paint) fade, then rust through in blotches
//   burn      everything goes toward char; the tops (a roof, a hood) go to ash
//   tyres     flat (squashed to the rims, the body sagging), gone (no wheels: on its belly) or blocks (no wheels, cinder
//             blocks under the axles)
//   doors     taken (the door panels go); hood: stood open on its hinge
//   scorch    a burned patch on the ground under a burned-out car
// Returns a non-indexed BufferGeometry with position, normal and color only (one layout for every batch entry).
import * as THREE from 'three';
import { buildBody, PART } from '../systems/vehiclebodies.js';

export const WRECK_BASE = '#b8b0a0';
const WHEELS = [PART.wheelFL, PART.wheelFR, PART.wheelRL, PART.wheelRR], DOORS = [PART.doorL, PART.doorR, PART.doorL2, PART.doorR2];
const hash = (i, j, l, k) => { const v = Math.sin(i * 12.9898 + j * 78.233 + l * 37.719 + k * 4.31) * 43758.5453; return v - Math.floor(v); };
// smooth value noise (trilinear between lattice hashes): blotches that run across a panel, never a triangle's diagonal
const cell = (x, y, z, s, k) => {
  const fx = x / s, fy = y / s, fz = z / s, i = Math.floor(fx), j = Math.floor(fy), l = Math.floor(fz), u = fx - i, v = fy - j, w = fz - l;
  const a = (p, q, r) => hash(i + p, j + q, l + r, k), L = (p0, p1, t) => p0 + (p1 - p0) * t * t * (3 - 2 * t);
  return L(L(L(a(0, 0, 0), a(1, 0, 0), u), L(a(0, 1, 0), a(1, 1, 0), u), v), L(L(a(0, 0, 1), a(1, 0, 1), u), L(a(0, 1, 1), a(1, 1, 1), u), v), w);
};

export function deadBody(spec, type, S) {
  const src = buildBody(spec, type, WRECK_BASE);
  const P = src.attributes.position.array, N = src.attributes.normal.array, C = src.attributes.color.array, part = src.attributes.part.array;
  const base = new THREE.Color(WRECK_BASE), rust = new THREE.Color(S.rustCol), char = new THREE.Color(S.charCol ?? '#1b1917'), ash = new THREE.Color(S.ash ?? '#5e5a54');
  const drop = new Set([...(S.tyres !== 'flat' ? WHEELS : []), ...(S.doors ? [] : DOORS), ...(S.glass ? [] : [PART.glass])]);
  // the wheels' centres (blocks go under them) and the hood's hinge (its rear top edge)
  const wc = new Map();
  let hz0 = Infinity, hy1 = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < part.length; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    if (WHEELS.includes(part[i])) { const w = wc.get(part[i]) ?? { x: 0, z: 0, y1: 0, n: 0 }; w.x += x; w.z += z; w.y1 = Math.max(w.y1, y); w.n++; wc.set(part[i], w); }
    if (part[i] === PART.hood) { hz0 = Math.min(hz0, z); hy1 = Math.max(hy1, y); }
  }
  const sag = S.tyres === 'blocks' ? 0 : S.sag;
  const pos = [], nor = [], col = [];
  const c = new THREE.Color(), v = new THREE.Color(), g0 = new THREE.Color(), ca = Math.cos(S.hood), sa = Math.sin(S.hood);
  for (let t = 0; t < part.length; t += 3) {
    const pid = part[t];
    if (drop.has(pid)) continue;
    // the look per vertex (smooth noise): the triangle's own skin test and its facing
    c.setRGB(C[t * 3], C[t * 3 + 1], C[t * 3 + 2]);
    const skin = Math.abs(c.r - base.r) + Math.abs(c.g - base.g) + Math.abs(c.b - base.b) < 0.06;
    const up = (N[t * 3 + 1] + N[t * 3 + 4] + N[t * 3 + 7]) / 3;
    for (let k = 0; k < 3; k++) {
      const i = t + k;
      let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
      if (pid === PART.hood && S.hood) { // up on its hinge: the front edge lifts
        const dy = y - hy1, dz = z - hz0;
        y = hy1 + dy * ca + dz * sa; z = hz0 + dz * ca - dy * sa;
        const ny2 = ny * ca + nz * sa, nz2 = nz * ca - ny * sa; ny = ny2; nz = nz2;
      }
      if (WHEELS.includes(pid)) y *= 0.72; // flat: down on the rims
      else y = Math.max(0.02, y - sag);
      if (S.squash) { y *= S.squash; ny /= S.squash; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; } // crushed: everything driven flat
      const vx = P[i * 3], vy = P[i * 3 + 1], vz = P[i * 3 + 2];
      v.setRGB(C[i * 3], C[i * 3 + 1], C[i * 3 + 2]);
      if (skin) {
        const lum = v.r * 0.3 + v.g * 0.59 + v.b * 0.11;
        v.lerp(g0.setRGB(lum, lum, lum), S.fade).multiplyScalar(0.94 - 0.16 * cell(vx, vy, vz, 0.9, 3));
        const rr = cell(vx, vy, vz, 0.55, 1);
        if (rr < S.rust) v.lerp(rust, Math.min(1, (S.rust - rr) / 0.12) * (0.75 + 0.25 * cell(vx, vy, vz, 0.2, 2)));
      } else if (WHEELS.includes(pid)) v.multiplyScalar(0.8); // perished rubber
      else v.multiplyScalar(0.82).lerp(rust, S.rust * 0.35 * cell(vx, vy, vz, 0.6, 5)); // chrome and trim gone dull
      if (S.char) {
        v.lerp(char, S.char * (0.85 + 0.15 * cell(vx, vy, vz, 0.5, 7)));
        if (up > 0.6) v.lerp(ash, 0.55 * Math.max(0, Math.min(1, (0.6 - cell(vx, vy, vz, 0.5, 8)) / 0.15)));
        else if (skin) { const r2 = cell(vx, vy, vz, 0.4, 9); if (r2 < S.rust) v.lerp(rust, 0.6 * Math.min(1, (S.rust - r2) / 0.1)); }
      }
      pos.push(x, y, z); nor.push(nx, ny, nz); col.push(v.r, v.g, v.b);
    }
  }
  const quad = (x0, x1, z0, z1, y, cc) => { for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]) { pos.push(x, y, z); nor.push(0, 1, 0); col.push(cc.r, cc.g, cc.b); } };
  const box = (x0, x1, y0, y1, z0, z1, cc) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed(); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const a = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < a.length; i += 3) { pos.push(a[i], a[i + 1], a[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(cc.r, cc.g, cc.b); }
  };
  if (S.tyres === 'blocks') { const bc = new THREE.Color(S.blockCol); for (const w of wc.values()) { const x = w.x / w.n, z = w.z / w.n; box(x - 0.24, x + 0.24, 0, 0.42, z - 0.22, z + 0.22, bc); } }
  if (S.scorch) { quad(minX - S.scorch, maxX + S.scorch, minZ - S.scorch * 0.7, maxZ + S.scorch * 0.7, 0.025, new THREE.Color('#171512')); quad(minX - S.scorch * 0.4, maxX + S.scorch * 1.4, minZ + 0.4, maxZ - 0.3, 0.03, new THREE.Color('#0f0e0c')); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingBox(); g.computeBoundingSphere();
  src.dispose();
  return g;
}
