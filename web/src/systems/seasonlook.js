import * as THREE from 'three';
import { PALETTE, SNOW, LEAF } from '../data/seasons.js';
import { variantPatch } from '../world/flora.js';

// SEASON LOOK (docs/design/WEB_SEASONS.md §3.5). What the date and the cover do to the picture, with no new draw call per
// material and no per-frame allocation:
//   snow     one shared uniform set and one fragment patch CHAINED onto every lit material the scene shows (ground, roofs,
//            roads, rock, vehicles, props): an up-facing surface (the face normal from screen derivatives, so it needs no
//            normal attribute and works on flat-shaded and instanced batches alike) whitens by the cover, broken up by
//            noise so a thin cover lies in patches and a thaw opens bare ground first.
//   leaf     the same patch turns GREENS toward amber and rust in autumn and grey in the frost; the deciduous trees (oak,
//            bald cypress, mesquite, palo verde) also lose leaf blocks to the cover (vertex flag + a discard on a world
//            block hash, in the shadow pass too) so a winter wood is bare trunks.
//   fall     snowflakes: ONE Points object in a box that follows the camera (drawRange by the weather's snow weight).
//   breath   an InstancedMesh of 14 puffs at the player's mouth under SNOW.breathC.
// A material is wrapped once (a WeakSet); the walk over the scene runs every 1.2 s and only touches what it has not seen.

const U = {
  uSn: { value: new THREE.Vector4(0, 0, 0, 1) },        // snow cover, leaf turn, frost grey, leaf cover
  uSnIn: { value: 0 },                                   // 1 while the player is under a roof or below the street: indoorable surfaces shed their snow
  uSnUp: { value: new THREE.Vector3(0, 1, 0) },          // world up in view space
  uSnInv: { value: new THREE.Matrix3() },                // view space -> world (rotation)
  uSnCol: { value: new THREE.Color(PALETTE.snow) },
  uLeafCol: { value: new THREE.Color(PALETTE.amber) },
  uFrostMul: { value: new THREE.Color(PALETTE.frost) },
};
export const SEASON_UNIFORMS = U;

const HEAD = /* glsl */`
uniform vec4 uSn; uniform float uSnIn; uniform vec3 uSnUp; uniform mat3 uSnInv; uniform vec3 uSnCol; uniform vec3 uLeafCol; uniform vec3 uFrostMul;
float snH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float snN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(snH(i), snH(i + vec2(1.0, 0.0)), f.x), mix(snH(i + vec2(0.0, 1.0)), snH(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
const BODY = /* glsl */`
{
  vec3 sdx = dFdx(vViewPosition), sdy = dFdy(vViewPosition);
  vec3 sn = normalize(cross(sdx, sdy));
  float sUp = dot(sn, uSnUp);
  vec3 swp = cameraPosition + uSnInv * (-vViewPosition);
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  float gm = smoothstep(0.004, 0.05, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
  diffuseColor.rgb = mix(diffuseColor.rgb, uLeafCol * (0.35 + 1.5 * lum), gm * uSn.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * uFrostMul * 1.6, gm * uSn.z);
  float nz = snN(swp.xz * 0.33) * 0.55 + snN(swp.xz * 1.6) * 0.3 + snN(swp.xz * 6.0) * 0.15;
  float scv = uSn.x * (1.0 - SN_INK * uSnIn);
  float sm = smoothstep(nz - 0.14, nz + 0.14, scv * 1.18 - 0.08) * smoothstep(0.45, 0.8, sUp) * step(0.002, scv);
  diffuseColor.rgb = mix(diffuseColor.rgb, uSnCol * (0.9 + 0.1 * nz), sm * 0.95);
}
`;
const KEY = '|snow1';
// Outdoor-always surfaces keep their snow when you step inside; everything else (floors, furniture, walls, cars, props) sheds it.
const NOSNOW = /^(lsw|fauna|sealife|season|char|dogs?|drone)/;
const OUTDOOR = /surface:(ground|road|rock)|roofs|flora:|stunts|wrecks|pool:(boulders|trunks|cacti|shrubs)|^Scene$/;

// Chain the snow patch onto a material (idempotent). The program key keeps whatever the material already used.
export function snowSurface(mat, indoorable = false) {
  if (mat.userData.seasonSnow) return mat;
  mat.userData.seasonSnow = true;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    if (!sh.fragmentShader.includes('vViewPosition') || !sh.fragmentShader.includes('#include <color_fragment>') || sh.fragmentShader.includes('uSnUp')) return;
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nconst float SN_INK = ${indoorable ? '1.0' : '0.0'};\n${HEAD}`).replace('#include <color_fragment>', `#include <color_fragment>\n${BODY}`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : String(prev)) + KEY + (indoorable ? 'i' : '');
  mat.needsUpdate = true;
  return mat;
}

// Deciduous leaf loss: vertices coloured green are leaf (flora vertex colours); a leaf fragment is dropped when the hash of its
// world block is above the cover. The shadow pass drops the same blocks.
const LEAF_V = '#include <common>\nvarying vec3 vLfW; varying float vLfLeaf;\n';
function leafPatch(depth) {
  return (sh) => {
    variantPatch(sh);
    sh.uniforms.uSnLeaf = U.uSn;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `${LEAF_V}${depth ? 'attribute vec3 color;\n' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 lw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          lw = instanceMatrix * lw;
          #endif
          vLfW = (modelMatrix * lw).xyz; vLfLeaf = step(0.03, color.g - max(color.r, color.b)); }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLfW; varying float vLfLeaf; uniform vec4 uSnLeaf;\nfloat lfH(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }\n`)
      .replace('void main() {', 'void main() {\n  if (vLfLeaf > 0.5 && lfH(floor(vLfW * vec3(1.6, 1.2, 1.6))) > uSnLeaf.w) discard;\n');
  };
}
const DECIDUOUS = ['oak', 'cypress', 'mesquite', 'paloverde'];

const FALL_N = 2200, BOX = 90, BOX_H = 42, PUFFS = 14;

export class SeasonLook {
  constructor(g) {
    this.g = g;
    this.seen = new WeakSet();
    this.walkT = 0;
    this.patched = 0;
    // snowfall
    const pos = new Float32Array(FALL_N * 3);
    this.seed = new Float32Array(FALL_N * 3);
    for (let i = 0; i < FALL_N; i++) { this.seed[i * 3] = (Math.random() - 0.5) * BOX; this.seed[i * 3 + 1] = Math.random() * BOX_H; this.seed[i * 3 + 2] = (Math.random() - 0.5) * BOX; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.flakes = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#f4f8fb', size: 0.28, transparent: true, opacity: 0.85, depthWrite: false, fog: true }));
    this.flakes.frustumCulled = false; this.flakes.visible = false; this.flakes.name = 'season:snowfall';
    g.scene.add(this.flakes);
    // breath
    this.puff = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: '#e8eef2', transparent: true, opacity: 0.4, depthWrite: false, fog: true }), PUFFS);
    this.puff.frustumCulled = false; this.puff.count = 0; this.puff.name = 'season:breath';
    this.puff.userData.noSnow = true; g.scene.add(this.puff);
    this.puffs = Array.from({ length: PUFFS }, () => ({ t: 9, x: 0, y: 0, z: 0, vx: 0, vz: 0 }));
    this.breathT = 0; this.puffN = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  // The shared uniforms follow the date and the cover; the camera's matrices keep the world-up test honest.
  update(dt) {
    const g = this.g, S = g.seasons, cam = g.camera;
    if (!S || !cam) return;
    const H = S.here, cal = S.calendar();
    const sc = U.uSn.value;
    const k = 1 - Math.exp(-dt / 1.5);
    const want = S.live === false ? 0 : S.cover;
    sc.x += (want - sc.x) * k;
    // Leaf turn / frost: the zone's curve at this date (LEAF rows), the turn colour by the season (amber to rust).
    const frostT = H.frost ? 0.55 : 0, turnT = H.turn ?? 0;
    sc.y += (turnT - sc.y) * k; sc.z += (frostT * (1 - sc.x) - sc.z) * k;
    sc.w += ((H.cover ?? 1) - sc.w) * k;
    this._c.set(cal.season === 'autumn' && cal.seasonT > 0.55 ? PALETTE.rust : PALETTE.amber); U.uLeafCol.value.lerp(this._c, k);
    const inside = g.insideBuilding || g.player?.ug || (g.sky.below ?? 0) > 0.3 ? 1 : 0;
    U.uSnIn.value += (inside - U.uSnIn.value) * (1 - Math.exp(-dt / 0.25));
    cam.updateMatrixWorld?.();
    U.uSnInv.value.setFromMatrix4(cam.matrixWorld);
    U.uSnUp.value.set(0, 1, 0).transformDirection(cam.matrixWorldInverse);
    this.walkT -= dt;
    if (this.walkT <= 0) { this.walkT = 1.2; this.walk(); }
    this.fall(dt, g.camLook ?? cam.position);
    this.breath(dt);
  }

  walk() {
    const seen = this.seen;
    this.g.scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      if (o.userData.noSnow || o.isSkinnedMesh || NOSNOW.test(o.name ?? '')) return; // bodies, animals and our own sprites keep their colours
      if (o.name?.startsWith('flora:') && !o.userData.leafy) {
        o.userData.leafy = true;
        const kind = o.name.slice(6);
        if (DECIDUOUS.includes(kind)) {
          const m = o.material.clone(); m.onBeforeCompile = leafPatch(false); m.customProgramCacheKey = () => 'flora-variant|leaf1';
          const d = o.customDepthMaterial.clone(); d.onBeforeCompile = leafPatch(true); d.customProgramCacheKey = () => 'flora-variant-depth|leaf1';
          o.material = m; o.customDepthMaterial = d;
        }
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || seen.has(m)) continue;
        seen.add(m);
        if (!m.isMeshStandardMaterial && !m.isMeshLambertMaterial && !m.isMeshPhongMaterial) continue;
        if (m.transparent || m.userData.noSnow || m.isMeshPhysicalMaterial && m.transmission > 0) continue; // water, glass, decals
        snowSurface(m, !OUTDOOR.test(o.name ?? '')); this.patched++;
      }
    });
  }

  fall(dt, c) {
    const w = this.g.sky.cur?.snow ?? 0, n = Math.floor(Math.min(1, w / 2.2) * FALL_N * (w > 1.05 ? 1 : 0.55 + 0.45 * Math.min(1, w)));
    this.flakes.visible = n > 8 && !(this.g.sky.below > 0.5);
    this.flakes.geometry.setDrawRange(0, n);
    if (!this.flakes.visible) return;
    const pos = this.flakes.geometry.attributes.position.array, s = this.seed, t = performance.now() * 0.001;
    const speed = 2.2 + w * 1.1, drift = 0.6 + w * 1.6;
    for (let i = 0; i < n; i++) {
      let y = s[i * 3 + 1] - speed * dt;
      if (y < 0) y += BOX_H;
      let x = s[i * 3] + (drift + Math.sin(t * 0.7 + i) * 0.5) * dt, z = s[i * 3 + 2] + Math.cos(t * 0.5 + i * 1.3) * 0.4 * dt;
      if (x > BOX / 2) x -= BOX; if (x < -BOX / 2) x += BOX; if (z > BOX / 2) z -= BOX; if (z < -BOX / 2) z += BOX;
      s[i * 3] = x; s[i * 3 + 1] = y; s[i * 3 + 2] = z;
      pos[i * 3] = c.x + x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = c.z + z;
    }
    this.flakes.geometry.attributes.position.needsUpdate = true;
    this.flakes.material.size = 0.22 + Math.min(0.2, w * 0.08);
  }

  // The player's breath in the cold: a puff every ~2.3 s (quicker when running), rising, spreading and thinning.
  breath(dt) {
    const g = this.g, p = g.player, air = g.needs?.air ?? 20, on = p?.alive && !p.inVehicle && air < SNOW.breathC && !(g.sky.below > 0.5);
    const P = this.puffs;
    this.breathT -= dt;
    if (on && this.breathT <= 0) {
      this.breathT = (2.4 - Math.min(1.2, (p.speed ?? 0) * 0.12)) * (0.8 + Math.random() * 0.4);
      const q = P[this.puffN++ % PUFFS], f = p.face ?? 0;
      q.t = 0; q.x = p.x + Math.sin(f) * 0.28; q.z = p.z + Math.cos(f) * 0.28; q.y = (p.gy ?? 0) + (p.crouch ? 1.0 : 1.5);
      q.vx = Math.sin(f) * 0.5 + (Math.random() - 0.5) * 0.2; q.vz = Math.cos(f) * 0.5 + (Math.random() - 0.5) * 0.2;
    }
    let n = 0;
    for (let i = 0; i < PUFFS; i++) {
      const q = P[i]; if (q.t >= 1.6) continue;
      q.t += dt; q.x += q.vx * dt; q.z += q.vz * dt; q.y += 0.35 * dt;
      const k = q.t / 1.6, size = (0.5 + 2.4 * k) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      this._p.set(q.x, q.y, q.z); this._s.set(size, size * 0.8, size);
      this.puff.setMatrixAt(n++, this._m.compose(this._p, this._q, this._s));
    }
    this.puff.count = n; this.puff.visible = n > 0;
    if (n) this.puff.instanceMatrix.needsUpdate = true;
  }

  // Debug: every patched material as { mesh, kind, key, n } (what the snow touches).
  list() {
    const m = new Map();
    this.g.scene.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const x of mats) { if (!x?.userData?.seasonSnow) continue; const k = `${o.name || o.parent?.name || o.type}|${x.type}|${x.name}|${x.color?.getHexString?.()}`; const r = m.get(k) ?? { k, n: 0, inst: o.isInstancedMesh ? o.count : 1 }; r.n++; m.set(k, r); }
    });
    return [...m.values()];
  }

  view() { return { patched: this.patched, cover: +U.uSn.value.x.toFixed(3), turn: +U.uSn.value.y.toFixed(3), frost: +U.uSn.value.z.toFixed(3), leaf: +U.uSn.value.w.toFixed(3), flakes: this.flakes.visible ? this.flakes.geometry.drawRange.count : 0, puffs: this.puff.count }; }
}
