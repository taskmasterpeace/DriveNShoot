import * as THREE from 'three';
import { CAMERA } from '../data/camera.js';

// The cutaway (docs/design/WEB_CAMERA.md §3.4): "cut the top off". Inside a circle on screen round the player, every
// fragment that is NEARER the camera than the player and HIGHER than the line (knee height over your feet; over the
// car's roof at the wheel) is dithered away on a 4x4 Bayer pattern - walls on the camera side of your room drop to
// knee height, the storeys above you, roofs, trees and overpass decks open a hole. A roof or a deck you stand on is
// at your feet, under the line: it stays. No transparency, no sort: a `discard` in each lit material's fragment
// shader, all reading ONE shared uniform set (no per-material state, no per-frame allocation).
//   scan()      walk the scene (once a second): patch any mesh material not seen yet (characters and FX opt out:
//               material.userData.noCut)
//   update()    after the camera moves: the player's centre, depth and the circle's radius in pixels
const U = {
  uCut: { value: new THREE.Vector4(0, 0, 1, 0) },  // centre x, y (NDC), radius (NDC y units), the player's view depth (m)
  uCutY: { value: 0.6 },                           // world y: only fragments above it are cut
  uCutOn: { value: 0 },
};
const KINDS = new Set(['MeshStandardMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshBasicMaterial', 'MeshPhysicalMaterial', 'MeshToonMaterial']);
const _p = new THREE.Vector3(), _q = new THREE.Vector3();

const VERT_HEAD = 'varying float vCutY; varying vec4 vCutClip; varying float vCutAsp;\n';
const VERT_BODY = `#include <project_vertex>
{ vec4 cw = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  cw = instanceMatrix * cw;
#endif
  vCutY = (modelMatrix * cw).y; vCutClip = gl_Position; vCutAsp = projectionMatrix[1][1] / projectionMatrix[0][0]; }`;
const FRAG_HEAD = `varying float vCutY; varying vec4 vCutClip; varying float vCutAsp;
uniform vec4 uCut; uniform float uCutY; uniform float uCutOn;
float cutBayer(vec2 p) { ivec2 i = ivec2(mod(p, 4.0)); int k = i.x + i.y * 4;
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return (float(b[k]) + 0.5) / 16.0; }
`;
const FRAG_BODY = `#include <clipping_planes_fragment>
if (uCutOn > 0.5 && vCutY > uCutY && vCutClip.w < uCut.w) {
  vec2 cd = vCutClip.xy / vCutClip.w - uCut.xy; cd.x *= vCutAsp;
  float r = length(cd) / uCut.z;
  if (r < 1.0 && cutBayer(gl_FragCoord.xy) < smoothstep(1.0, ${(1 - CAMERA.cutaway.soft).toFixed(2)}, r)) discard;
}`;

function patch(mat) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uCut = U.uCut; sh.uniforms.uCutY = U.uCutY; sh.uniforms.uCutOn = U.uCutOn;
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <project_vertex>', VERT_BODY);
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <clipping_planes_fragment>', FRAG_BODY);
  };
  mat.customProgramCacheKey = () => `${prevKey ? prevKey.call(mat) : ''}|cut1`;
  mat.needsUpdate = true;
}

export class Cutaway {
  constructor(g) {
    this.g = g;
    this.seen = new WeakSet();
    this.patched = 0;
    this.scanT = 0;
    this.on = true;
    this.visit = (o) => {
      if (!o.isMesh) return;
      const M = o.material;
      if (Array.isArray(M)) { for (let i = 0; i < M.length; i++) this.take(M[i]); } else this.take(M);
    };
  }
  take(m) {
    if (!m || this.seen.has(m)) return;
    this.seen.add(m);
    if (m.userData?.noCut || !KINDS.has(m.type)) return;
    patch(m); this.patched++;
  }
  scan() { this.g.scene.traverse(this.visit); }

  // After the camera is placed (main.js updateCamera).
  update(dt) {
    const g = this.g, p = g.player, cam = g.camera, C = CAMERA.cutaway;
    if ((this.scanT -= dt) <= 0) { this.scanT = 1; this.scan(); }
    const v = p.inVehicle;
    U.uCutOn.value = this.on && p.alive !== false ? 1 : 0;
    const feet = v ? (v.y ?? v.gy ?? 0) : p.gy ?? 0;
    U.uCutY.value = feet + (v ? C.carClear : C.knee);
    // The player's centre on screen (NDC, so any render size agrees: the game canvas, a screenshot), the view depth
    // (m along the camera's look) only nearer fragments are cut at, and the radius: C.radius m to the side, through
    // the camera, in NDC y units (the shader scales x by the aspect).
    const x = v ? v.x : p.x, z = v ? v.z : p.z;
    _p.set(x, feet + 1.0, z).project(cam);
    const cx = _p.x, cy = _p.y;
    _q.setFromMatrixColumn(cam.matrixWorld, 2); // the camera's back axis
    const depth = -_q.dot(_p.set(x, feet + 1.0, z).sub(cam.position)) - 0.8;
    _q.setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(v ? C.radius * 1.4 : C.radius);
    _q.add(_p.set(x, feet + 1.0, z)).project(cam);
    U.uCut.value.set(cx, cy, Math.max(0.02, Math.abs(_q.x - cx) * cam.aspect), depth);
  }

  status() { return { on: !!this.on, patched: this.patched, line: +U.uCutY.value.toFixed(2), circle: U.uCut.value.toArray().map((n) => +n.toFixed(3)) }; }
}
export const CUT_UNIFORMS = U;
