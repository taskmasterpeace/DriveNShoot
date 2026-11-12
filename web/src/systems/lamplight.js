import * as THREE from 'three';
import { LAMPS } from '../data/looks.js';

// LAMP LIGHT ON BODIES (docs/design/WEB_LOOK_FEEL.md, "Lamps"). The headlights and the torch are additive cones painted on
// the ground: they brighten the road but light nothing standing on it, so at night a man in a headlight pool stayed a black
// shape. This lights the BODIES in their own shader: people (the box bodies and the LSW bodies), dogs and the fauna. A fixed
// uniform array of lamps (LAMPS.max, the nearest to the camera), each a cone with a distance falloff; no scene light is
// added, so the light count and the program count stay fixed (one extra program variant per patched material).
//   uLampP[i] = (x, y, z, range)   the lens, world space
//   uLampD[i] = (dx, dz, cos, I)   the beam's heading on the ground, the cone's edge, the peak irradiance (0 = unused)

const N = LAMPS.max;
export const LAMP_UNIFORMS = {
  uLampP: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
  uLampD: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
  uLampC: { value: new THREE.Color(LAMPS.color) },
  uLampWrap: { value: LAMPS.wrap },
};
const U = LAMP_UNIFORMS;

const LAMP_VERT_HEAD = 'varying vec3 vLampW;\n';
const LAMP_VERT = `#include <project_vertex>
  { vec4 lampW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
    lampW = instanceMatrix * lampW;
#endif
    vLampW = (modelMatrix * lampW).xyz; }`;
const LAMP_FRAG_HEAD = `varying vec3 vLampW; uniform vec4 uLampP[${N}]; uniform vec4 uLampD[${N}]; uniform vec3 uLampC; uniform float uLampWrap;\n`;
// The cone's edge softens over the outer 45% of its angle; the falloff is (1 - d / range)^2; the lit side is the side
// facing the lens, wrapped a little so a body in profile still shows its colours.
const LAMP_FRAG = `#include <lights_fragment_end>
  { vec3 lampSum = vec3(0.0);
    for (int i = 0; i < ${N}; i++) {
      vec4 P = uLampP[i]; vec4 D = uLampD[i];
      if (D.w <= 0.0) continue;
      vec3 tl = P.xyz - vLampW; float d = length(tl);
      float lh = length(tl.xz);
      float cone = lh < 0.05 ? 0.0 : smoothstep(D.z, mix(D.z, 1.0, 0.45), dot(-tl.xz / lh, D.xy));
      float fall = clamp(1.0 - d / P.w, 0.0, 1.0);
      vec3 lv = normalize((viewMatrix * vec4(tl, 0.0)).xyz);
      float nl = clamp((dot(normal, lv) + uLampWrap) / (1.0 + uLampWrap), 0.0, 1.0);
      lampSum += D.w * cone * fall * fall * nl;
    }
    reflectedLight.directDiffuse += lampSum * uLampC * BRDF_Lambert(material.diffuseColor);
  }`;

// Chain onto a material's own patch (the LSW bodies have one); the key keeps its programs apart from the unlit twin.
export function lampPatch(mat) {
  if (mat.userData.lamp || !mat.isMeshStandardMaterial) return false;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = LAMP_VERT_HEAD + sh.vertexShader.replace('#include <project_vertex>', LAMP_VERT);
    sh.fragmentShader = LAMP_FRAG_HEAD + sh.fragmentShader.replace('#include <lights_fragment_end>', LAMP_FRAG);
    mat.userData.lampCompiled = sh.fragmentShader.includes('lampSum');
  };
  mat.customProgramCacheKey = () => `${prevKey ? prevKey.call(mat) : ''}|lamp`;
  mat.userData.lamp = true;
  mat.needsUpdate = true;
  return true;
}

// The same light on the CPU (for the checks and `look action=lamps`): what reaches a point facing the lens.
export function lampAt(x, y, z) {
  let s = 0;
  for (let i = 0; i < N; i++) {
    const P = U.uLampP.value[i], D = U.uLampD.value[i];
    if (D.w <= 0) continue;
    const tx = P.x - x, ty = P.y - y, tz = P.z - z, d = Math.hypot(tx, ty, tz), lh = Math.hypot(tx, tz);
    if (lh < 0.05) continue;
    const c = (-tx * D.x - tz * D.y) / lh, e0 = D.z, e1 = D.z + (1 - D.z) * 0.45;
    const t = Math.min(1, Math.max(0, (c - e0) / (e1 - e0))), cone = t * t * (3 - 2 * t);
    const f = Math.min(1, Math.max(0, 1 - d / P.w));
    s += D.w * cone * f * f;
  }
  return s;
}

export class LampLight {
  constructor(g) {
    this.g = g;
    this.on = 1; // `look action=lamps on=0` for the before/after
    this.patched = 0; this.n = 0;
    this.list = []; // the frame's lamps, reused: { kind, x, y, z, dx, dz, cos, I, range, d2, id }
    for (let i = 0; i < 48; i++) this.list.push({ kind: '', x: 0, y: 0, z: 0, dx: 0, dz: 1, cos: 0.8, I: 0, range: 1, d2: 0, id: null });
  }

  // Every 2 s with the wind scan: anything new that wears a body gets the lamp layer (each material once).
  patch() {
    const g = this.g, mats = [];
    const add = (m) => { if (m) for (const x of [m.material].flat()) mats.push(x); };
    const C = g.charR;
    if (C) { for (const k in C.meshes) add(C.meshes[k]); add(C.lsw?.flagMesh); }
    for (const o of g.scene?.children ?? []) if (o.name === 'lsw-faceted') add(o);
    for (const R of [g.dogs?.r, g.fauna?.r?.quad]) if (R) { add(R.body); add(R.limb); add(R.prop); for (const k in R.heads ?? {}) add(R.heads[k]); }
    const F = g.fauna?.r; if (F) { add(F.parts); add(F.wing); }
    for (const m of mats) if (lampPatch(m)) this.patched++;
  }

  // After the vehicles and the torch have their frame (lookfeel.update runs after fx.update).
  update() {
    const g = this.g, L = this.list, night = g.sky?.night ?? 0, p = g.player;
    const cx = g.camLook?.x ?? p?.x ?? 0, cz = g.camLook?.z ?? p?.z ?? 0, reach2 = LAMPS.reach * LAMPS.reach;
    let n = 0;
    const push = (kind, x, y, z, h, row, k, range, id) => {
      if (n >= L.length) return;
      const d2 = (x - cx) ** 2 + (z - cz) ** 2;
      if (d2 > reach2) return;
      const o = L[n++];
      o.kind = kind; o.x = x; o.y = y; o.z = z; o.dx = Math.sin(h); o.dz = Math.cos(h); o.cos = row.cos; o.I = row.I * k; o.range = range; o.d2 = d2; o.id = id;
    };
    if (this.on && night > LAMPS.night) {
      // Headlamps: one lamp per vehicle at the middle of its lit lenses (a smashed one halves it), the same rule as the beams.
      const k = Math.min(1, (night - LAMPS.night) / 0.4);
      for (const v of g.vehicles ?? []) {
        const A = v.anchors;
        if (v.dead || v.sunk || !A || !A.head.length || !(v.driver ?? v.towedBy?.driver)) continue;
        let lx = 0, ly = 0, lz = 0, m = 0;
        for (let i = 0; i < A.head.length; i++) {
          if (i === 0 ? v.lampL === false : v.lampR === false) continue;
          lx += A.head[i][0]; ly += A.head[i][1]; lz += A.head[i][2]; m++;
        }
        if (!m) continue;
        lx /= m; ly /= m; lz /= m;
        const single = A.head.length === 1, row = single ? LAMPS.bike : LAMPS.head, eye = !single && m === 1 ? 0.55 : 1;
        const s = Math.sin(v.h), c = Math.cos(v.h);
        push('head', v.x + c * lx + s * lz, (v.y ?? v.gy ?? 0) + ly, v.z - s * lx + c * lz, v.h, row, k * eye, Math.max(row.range, (A.beamL ?? 0) * 1.15), v.id);
      }
    }
    // The torch: lit when its cone is drawn (main.js: night or below the street, a charged light), as strong as the cone.
    const fo = g.flashMat?.opacity ?? 0;
    if (this.on && p && fo > 0.05) {
      const row = LAMPS.torch, reach = g.flashlight?.scale.z ?? 1, s = Math.sin(p.face), c = Math.cos(p.face);
      const O = g.flashlight?.userData.origin; // the hand, the muzzle or the brow (main.js): the light leaves from there
      if (O?.ok) push('torch', O.x, O.y, O.z, p.face, row, Math.min(1.2, fo / 0.75), row.range * reach, 'player');
      else push('torch', p.x + s * 0.35, (p.gy ?? 0) + row.y, p.z + c * 0.35, p.face, row, Math.min(1.2, fo / 0.75), row.range * reach, 'player');
    }
    // The nearest N to the camera win the uniform slots (insertion sort on a short list: no allocation).
    for (let i = 1; i < n; i++) { const o = L[i]; let j = i - 1; while (j >= 0 && L[j].d2 > o.d2) { L[j + 1] = L[j]; j--; } L[j + 1] = o; }
    this.n = Math.min(n, N); this.seen = n;
    for (let i = 0; i < N; i++) {
      const P = U.uLampP.value[i], D = U.uLampD.value[i];
      if (i >= this.n) { D.w = 0; continue; }
      const o = L[i];
      P.set(o.x, o.y, o.z, o.range); D.set(o.dx, o.dz, o.cos, o.I);
    }
  }

  view() {
    const out = [];
    for (let i = 0; i < this.n; i++) { const o = this.list[i]; out.push({ kind: o.kind, id: o.id, at: [Math.round(o.x * 10) / 10, Math.round(o.y * 100) / 100, Math.round(o.z * 10) / 10], I: Math.round(o.I * 100) / 100, range: Math.round(o.range * 10) / 10 }); }
    return { on: !!this.on, lamps: out, considered: this.seen ?? 0, patched: this.patched };
  }
}
