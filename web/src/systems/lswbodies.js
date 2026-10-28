import * as THREE from 'three';
import { LSW_BODIES, LSW_RULES, BUILD_TO_BODY } from '../data/lswbodies.js';
import { VOICES, genderOf } from '../data/voices.js';
import { FLAGS, FLAG_KEYS } from '../ui/portrait.js';

// LSW-BODIES (docs/design/WEB_LSW_BODIES.md): the people nearest the camera wear Robert's Living Superweapon bodies
// (Quaternius Universal Base Characters, CC0, public/models/lsw/), everyone else the classic instanced rig.
// No second animation system: CharacterRenderer.pose() solves the joints exactly as before, and drive() turns that
// solution into 65 skin matrices per person (bind-space calibration, LSW's own retarget method):
//   rigid regions  pelvis / trunk / head  =  DSOA frame * scale * T(-bind origin)
//   limb segments  thigh, calf, upper arm, forearm  =  T(DSOA joint) * swing(parent) * stretch along the bone * T(-bind joint)
//   hands, feet    ride their segment / DSOA's foot frame; fingers close by a precomputed curl when the hand holds something
// The arms are re-solved by two-bone IK from the LSW shoulder to DSOA's hand point (the grip), bending toward DSOA's
// elbow, so a hand on a gun stays on it whatever the shoulder width.
// Every body of one mesh is ONE InstancedMesh draw: the skin matrices live in a float texture (a row per instance) and
// the vertex shader skins from it. Two meshes (male, female) + their shadow passes + one flag-patch draw = 5 draw calls.
// Nothing here allocates per frame.

const NB = 65; // bones in the Quaternius rig
const PELVIS = 0, TORSO = 1, HEAD = 2;
const UPPER = [3, 4], FORE = [5, 6], HAND = [7, 8], THIGH = [9, 10], CALF = [11, 12], FOOT = [13, 14];
const NG = 15;
const ANKLE_Y = 0.08; // DSOA's ankle above the sole (characters.js): the booted source foot is lifted so its sole meets the ground

const _m = new THREE.Matrix4(), _n = new THREE.Matrix4(), _s = new THREE.Matrix4(), _r = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _ql = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _sh = new THREE.Vector3(), _el = new THREE.Vector3(), _wr = new THREE.Vector3(), _hw = new THREE.Vector3(), _ew = new THREE.Vector3();
const _pole = new THREE.Vector3(), _dir = new THREE.Vector3(), _nn = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _col = new THREE.Color();

// Two-bone IK in world space (as characters.js ik2): from a toward target, bending toward the pole.
function ik2(a, target, la, lb, pole, outMid, outEnd) {
  _dir.subVectors(target, a);
  let d = _dir.length();
  if (d < 1e-5) { _dir.set(0, -1, 0); d = 1e-5; } else _dir.divideScalar(d);
  d = Math.min(la + lb - 1e-4, Math.max(Math.abs(la - lb) + 1e-4, d));
  const ca = (la * la + d * d - lb * lb) / (2 * la * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  _nn.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_nn.lengthSq() < 1e-8) _nn.set(0, 0, 1); else _nn.normalize();
  outMid.copy(a).addScaledVector(_dir, la * ca).addScaledVector(_nn, la * sa);
  outEnd.copy(a).addScaledVector(_dir, d);
}

// The rotation part of a frame that may carry a build scale: Gram-Schmidt on its x and y columns.
function rotOf(M, out) {
  const e = M.elements;
  _x.set(e[0], e[1], e[2]).normalize(); _y.set(e[4], e[5], e[6]);
  _y.addScaledVector(_x, -_y.dot(_x)).normalize(); _z.crossVectors(_x, _y);
  _r.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_r);
}

// Stretch L along the unit bind direction d, W across it: W I + (L - W) d dT (bind space).
function stretch(out, d, L, W) {
  const k = L - W, e = out.elements;
  e[0] = W + k * d.x * d.x; e[1] = k * d.x * d.y; e[2] = k * d.x * d.z; e[3] = 0;
  e[4] = k * d.y * d.x; e[5] = W + k * d.y * d.y; e[6] = k * d.y * d.z; e[7] = 0;
  e[8] = k * d.z * d.x; e[9] = k * d.z * d.y; e[10] = W + k * d.z * d.z; e[11] = 0;
  e[12] = 0; e[13] = 0; e[14] = 0; e[15] = 1;
  return out;
}

// One colour from a classic instanced mesh (row idx) into an LSW instance attribute (row k).
function copy3(attr, k, mesh, idx) { const s = mesh.instanceColor.array, d = attr.array; d[k * 3] = s[idx * 3]; d[k * 3 + 1] = s[idx * 3 + 1]; d[k * 3 + 2] = s[idx * 3 + 2]; }

// The skinning patch, shared by the lit material and the shadow (depth) material.
const VERT_HEAD = `uniform highp sampler2D lswBones;
attribute vec4 aBone; attribute vec4 aWeight; attribute float aPart;
mat4 lswBone(float b) { int x = int(b + 0.5) * 4; int y = gl_InstanceID;
  return mat4(texelFetch(lswBones, ivec2(x, y), 0), texelFetch(lswBones, ivec2(x + 1, y), 0), texelFetch(lswBones, ivec2(x + 2, y), 0), texelFetch(lswBones, ivec2(x + 3, y), 0)); }
`;
const VERT_MAIN = 'void main() {\n  mat4 lswM = lswBone(aBone.x) * aWeight.x + lswBone(aBone.y) * aWeight.y + lswBone(aBone.z) * aWeight.z + lswBone(aBone.w) * aWeight.w;';
function skinPatch(shader, tex) {
  shader.uniforms.lswBones = { value: tex };
  shader.vertexShader = VERT_HEAD + shader.vertexShader
    .replace('void main() {', VERT_MAIN)
    .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(mat3(lswM) * normal);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif')
    .replace('#include <begin_vertex>', 'vec3 transformed = (lswM * vec4(position, 1.0)).xyz;');
}

export class LswBodies {
  constructor(scene, maxChars, rules = LSW_RULES) {
    this.scene = scene; this.rules = rules;
    this.mode = rules.default; this.nearN = rules.near;
    this.ready = false; this.error = null;
    this.near = new Uint8Array(maxChars);   // slot -> 1: this frame they wear an LSW body
    this.was = new Uint8Array(maxChars);    // last frame's set (hysteresis)
    this.drawn = new Uint8Array(maxChars);  // slot -> 1: posed onto a GPU row this frame
    this.meshOf = new Int8Array(maxChars).fill(-1); this.rowOf = new Array(maxChars).fill(null); this.flagOf = new Int16Array(maxChars).fill(-1);
    this.keyOf = new Array(maxChars).fill(null); // what meshOf/rowOf/flagOf were worked out from (a slot is reused by a new person)
    this.instOf = new Int16Array(maxChars).fill(-1); // slot -> GPU row this frame
    this.solver = new Float32Array(maxChars * 24); // the solver's joints (world) per side: hip, knee, ankle, grip - what the checks compare the bones to
    this.flagAt = new Int16Array(maxChars).fill(-1); // slot -> flag patch row this frame
    this.candD = new Float64Array(rules.maxNear); this.candS = new Int16Array(rules.maxNear);
    this.hairKey = new Array(maxChars).fill(null); this.hairRGB = new Float32Array(maxChars * 3);
    this.bodies = []; // per source mesh
    this.focus = null; // a Vector3 (the camera); nearest to it wear LSW bodies
    this.t = 0;
    this.stats = { frames: 0, ms: 0, last: 0, drawn: 0 };
    this.headUp = 0.7; this.hatScale = new THREE.Matrix4(); this.gearScale = new THREE.Matrix4();
    this.loaded = this.load().catch((e) => { this.error = String(e?.message ?? e); console.warn('[lsw-bodies]', this.error); });
  }

  async load(base = ((typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/') + 'models/lsw/') {
    const meta = await (await fetch(`${base}bodies.json`)).json();
    const ids = ['superhero-male', 'superhero-female'];
    const bufs = await Promise.all(ids.map((id) => fetch(`${base}${meta.bodies[id].file}`).then((r) => { if (!r.ok) throw new Error(`${id}: ${r.status}`); return r.arrayBuffer(); })));
    const R = this.rules, maxNear = R.maxNear;
    // The flag patch: every flag drawn once into an atlas (ui/portrait.js FLAGS: real geometry, never letters).
    const cols = 6, rows = Math.ceil(FLAG_KEYS.length / cols), fw = 96, fh = 64;
    const cv = document.createElement('canvas'); cv.width = cols * fw; cv.height = rows * fh;
    const cg = cv.getContext('2d');
    FLAG_KEYS.forEach((k, i) => {
      cg.save(); cg.translate((i % cols) * fw, Math.floor(i / cols) * fh);
      cg.beginPath(); cg.rect(0, 0, fw, fh); cg.clip(); FLAGS[k].draw(cg, fw, fh);
      cg.strokeStyle = 'rgba(20,14,8,0.85)'; cg.lineWidth = 6; cg.strokeRect(0, 0, fw, fh); // a stitched border, so it reads as a patch
      cg.restore();
    });
    const atlas = new THREE.CanvasTexture(cv); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4;
    this.flagCell = [1 / cols, 1 / rows]; this.flagCols = cols;
    ids.forEach((id, mi) => this.bodies.push(this.buildBody(meta.bodies[id], bufs[mi], maxNear)));
    const fg = new THREE.PlaneGeometry(R.flag.w, R.flag.h).rotateX(-Math.PI / 2);
    const fuv = new THREE.InstancedBufferAttribute(new Float32Array(maxNear * 2 * 2), 2); fuv.setUsage(THREE.DynamicDrawUsage);
    fg.setAttribute('iFlag', fuv);
    const fm = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.9 });
    fm.onBeforeCompile = (sh) => {
      sh.uniforms.lswCell = { value: new THREE.Vector2(...this.flagCell) };
      sh.vertexShader = 'attribute vec2 iFlag; uniform vec2 lswCell;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vec2(uv.x, 1.0 - uv.y) * lswCell + iFlag;');
    };
    fm.userData.noCut = true;
    atlas.flipY = false;
    this.flagMesh = new THREE.InstancedMesh(fg, fm, maxNear * 2);
    this.flagMesh.frustumCulled = false; this.flagMesh.castShadow = false; this.flagMesh.count = 0; this.flagMesh.visible = false;
    this.flagMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flagMesh.name = 'lsw-flag-patches';
    this.scene.add(this.flagMesh);
    this.flagN = 0;
    // Head and gear: hats, hair, scars and gear are the classic rig's (instanced, packed); they scale to the LSW head and trunk.
    const B = this.bodies[0];
    this.headUp = B.headC.y - B.waistO.y;
    const hs = R.headScale;
    const k = hs * Math.max(B.headHalfX / 0.19, (B.faceZ - B.headC.z) / 0.185);
    this.hatScale.makeScale(k, k, k);
    this.headSkin = hs / k; // the LSW head inside the scaled head frame
    this.gearScale.makeScale((B.chestHalfX * R.width) / 0.27, (B.shoulderY - B.waistO.y) / 0.5, (B.chestHalfZ * R.width) / 0.15);
    this.ready = true;
  }

  buildBody(info, buf, maxNear) {
    const L = info.layout, R = this.rules;
    const view = (k, T) => new T(buf, L[k].offset, L[k].length);
    const pos = view('position', Float32Array);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(view('normal', Float32Array), 3));
    geo.setAttribute('aWeight', new THREE.BufferAttribute(view('weight', Float32Array), 4));
    geo.setAttribute('aBone', new THREE.BufferAttribute(view('bone', Uint8Array), 4));
    geo.setAttribute('aPart', new THREE.BufferAttribute(view('part', Uint8Array), 1));
    geo.setIndex(new THREE.BufferAttribute(view('index', Uint16Array), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1e5);
    const J = {}, names = info.joints.map((j) => j.name);
    info.joints.forEach((j) => { J[j.name] = new THREE.Vector3(...j.p); });
    const vec = (...a) => new THREE.Vector3(...a);
    // Bind anchors (source metres, +z forward, +x the body's left like DSOA).
    const pelvisO = vec(0, (J.thigh_l.y + J.thigh_r.y) / 2, (J.thigh_l.z + J.thigh_r.z) / 2);
    const waistO = pelvisO.clone().add(vec(0, R.waistUp, 0));
    let top = -1e9, headHalfX = 0, faceZ = -1e9, chestHalfX = 0, chestHalfZ = 0, backZ = 1e9;
    const part = view('part', Uint8Array);
    for (let v = 0; v < pos.length / 3; v++) {
      if (part[v]) continue;
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      top = Math.max(top, y);
      if (y > J.Head.y + 0.04) { headHalfX = Math.max(headHalfX, Math.abs(x)); faceZ = Math.max(faceZ, z); backZ = Math.min(backZ, z); }
      if (y > 1.24 && y < 1.36 && Math.abs(x) < 0.3) { chestHalfX = Math.max(chestHalfX, Math.abs(x)); chestHalfZ = Math.max(chestHalfZ, Math.abs(z - waistO.z)); }
    }
    const headC = vec(0, (J.Head.y + top) / 2, (faceZ + backZ) / 2);
    // The flag patch sits on top of the left shoulder: the highest body surface near the anchor (bind space).
    const fa = vec(J.clavicle_l.x + R.flag.at[0], 0, J.clavicle_l.z + R.flag.at[2]);
    let fy = -1e9;
    for (let v = 0; v < pos.length / 3; v++) if (!part[v] && Math.abs(pos[v * 3] - fa.x) < 0.03 && Math.abs(pos[v * 3 + 2] - fa.z) < 0.03 && pos[v * 3 + 1] < J.neck_01.y + 0.05) fy = Math.max(fy, pos[v * 3 + 1]);
    fa.y = (fy > 0 ? fy : J.clavicle_l.y + R.flag.at[1]) + 0.012;
    // Bone -> group, and the finger curls (bind space), precomputed for the closed and the relaxed hand.
    const group = new Int8Array(NB), curl = [new Float32Array(NB * 16), new Float32Array(NB * 16)];
    const eye = new THREE.Matrix4().elements;
    for (let b = 0; b < NB; b++) { curl[0].set(eye, b * 16); curl[1].set(eye, b * 16); }
    names.forEach((n, b) => {
      const s = n.endsWith('_r') ? 1 : 0;
      group[b] = n === 'root' || n === 'pelvis' ? PELVIS : n === 'Head' ? HEAD : n.startsWith('spine') || n.startsWith('clavicle') || n === 'neck_01' ? TORSO
        : n.startsWith('upperarm') ? UPPER[s] : n.startsWith('lowerarm') ? FORE[s] : n.startsWith('thigh') ? THIGH[s] : n.startsWith('calf') ? CALF[s]
          : /^(foot|ball)/.test(n) ? FOOT[s] : HAND[s];
      const f = /^(index|middle|ring|pinky|thumb)_0(\d)/.exec(n);
      if (!f) return;
      // Chain of rotations about each finger joint from the knuckle out; left fingers point +x, right -x, palms down.
      const sign = s ? 1 : -1, thumb = f[1] === 'thumb';
      for (let lvl = 0; lvl < 2; lvl++) {
        const C = new THREE.Matrix4();
        for (let k = 1; k <= Math.min(3, Number(f[2])); k++) {
          const jn = `${f[1]}_0${k}_${s ? 'r' : 'l'}`, p = J[jn];
          const amt = (lvl === 0 ? R.grip[k - 1] : R.relax * R.grip[k - 1]) * (thumb ? 0.45 : 1);
          C.multiply(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)).multiply(new THREE.Matrix4().makeRotationZ(sign * amt)).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
        }
        curl[lvl].set(C.elements, b * 16);
      }
    });
    const seg = (a, b) => { const d = J[b].clone().sub(J[a]); const len = d.length(); return { a: J[a], dir: d.divideScalar(len), len }; };
    const S = ['l', 'r'];
    const segs = {
      upper: S.map((s) => seg(`upperarm_${s}`, `lowerarm_${s}`)), fore: S.map((s) => seg(`lowerarm_${s}`, `hand_${s}`)),
      thigh: S.map((s) => seg(`thigh_${s}`, `calf_${s}`)), calf: S.map((s) => seg(`calf_${s}`, `foot_${s}`)),
      hand: S.map((s) => J[`hand_${s}`]), foot: S.map((s) => J[`foot_${s}`]),
    };
    // GPU side: the bone texture (a row of 65 mat4 per instance), the material and its shadow twin.
    const data = new Float32Array(NB * 4 * maxNear * 4);
    const tex = new THREE.DataTexture(data, NB * 4, maxNear, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const cut = { waist: pelvisO.y + 0.07, boot: J.foot_l.y + 0.11, neck: J.neck_01.y + 0.01, elbow: Math.abs(J.lowerarm_l.x), wrist: Math.abs(J.hand_l.x) - 0.015 };
    const inst = {};
    for (const k of ['iShirt', 'iPants', 'iBoots', 'iSkin', 'iFore', 'iHair']) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(maxNear * 3), 3); a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(k, a); inst[k] = a;
    }
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    mat.onBeforeCompile = (sh) => {
      skinPatch(sh, tex);
      // A shirt hides the source's sculpted chest and abs: on the clothed trunk the normal leans to a smooth barrel.
      sh.vertexShader = sh.vertexShader.replace('vec3 objectNormal = normalize(mat3(lswM) * normal);', `float lswTrunk = step(${cut.waist.toFixed(3)}, position.y) * step(position.y, ${(cut.neck - 0.04).toFixed(3)}) * (1.0 - smoothstep(0.17, 0.24, abs(position.x)));
  vec3 lswN = normalize(mix(normal, normalize(vec3(position.x, 0.15 * normal.y, position.z - ${pelvisO.z.toFixed(3)})), 0.7 * lswTrunk));
  vec3 objectNormal = normalize(mat3(lswM) * lswN);`);
      sh.vertexShader = 'attribute vec3 iShirt, iPants, iBoots, iSkin, iFore, iHair;\nvarying vec3 vShirt, vPants, vBoots, vSkin, vFore, vHair, vBind; varying float vPart;\n'
        + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvShirt = iShirt; vPants = iPants; vBoots = iBoots; vSkin = iSkin; vFore = iFore; vHair = iHair; vBind = position; vPart = aPart;');
      sh.fragmentShader = `varying vec3 vShirt, vPants, vBoots, vSkin, vFore, vHair, vBind; varying float vPart;
const vec4 lswCut = vec4(${cut.waist.toFixed(4)}, ${cut.boot.toFixed(4)}, ${cut.neck.toFixed(4)}, ${cut.wrist.toFixed(4)}); const float lswElbow = ${cut.elbow.toFixed(4)};
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  // Cloth by bind-space region, cut per fragment (whole-triangle regions saw-tooth on diagonal edges: LSW hero-skin.js).
  float ax = abs(vBind.x);
  float legs = 1.0 - smoothstep(lswCut.x - 0.004, lswCut.x + 0.004, vBind.y - ax * 0.08);
  float boot = 1.0 - smoothstep(lswCut.y - 0.004, lswCut.y + 0.004, vBind.y);
  float head = smoothstep(lswCut.z - 0.004, lswCut.z + 0.004, vBind.y) * (1.0 - smoothstep(0.17, 0.19, ax));
  float hand = smoothstep(lswCut.w - 0.004, lswCut.w + 0.004, ax);
  float fore = smoothstep(lswElbow - 0.004, lswElbow + 0.004, ax) * (1.0 - hand);
  vec3 lc = mix(mix(vShirt, vPants, legs), vBoots, boot);
  lc = mix(lc, vFore, fore);
  lc = mix(lc, vSkin, max(head, hand));
  lc = mix(lc, vec3(0.05, 0.04, 0.035), step(0.5, vPart) * (1.0 - step(1.5, vPart)));
  lc = mix(lc, vHair, step(1.5, vPart));
  // Cloth cues, so a shirt never reads as bare anatomy: a belt, hems at the cuffs and boot tops, a collar, a weave.
  float cloth = (1.0 - max(head, hand)) * (1.0 - step(0.5, vPart));
  float belt = (1.0 - smoothstep(0.018, 0.024, abs(vBind.y - ax * 0.08 - lswCut.x - 0.012))) * step(ax, 0.3);
  float hem = (1.0 - smoothstep(0.006, 0.012, abs(ax - lswElbow))) * step(1.2, vBind.y) * step(0.02, distance(vFore, vShirt)); // a short sleeve's edge
  hem = max(hem, max(1.0 - smoothstep(0.008, 0.014, abs(vBind.y - lswCut.y)), 1.0 - smoothstep(0.006, 0.012, abs(ax - lswCut.w))));
  float collar = (1.0 - smoothstep(0.008, 0.016, abs(vBind.y - lswCut.z + 0.01))) * step(ax, 0.17);
  float weave = 0.93 + 0.07 * sin(vBind.x * 900.0) * sin(vBind.y * 900.0 + vBind.z * 600.0);
  lc *= mix(1.0, weave, cloth);
  lc = mix(lc, lc * 0.55, max(hem, collar) * cloth);
  lc = mix(lc, vec3(0.13, 0.1, 0.075), belt * cloth);
  diffuseColor.rgb = lc;`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(0.95, 0.6, max(head, hand)); // matte cloth, a little sheen on skin`);
    };
    mat.customProgramCacheKey = () => `lsw-body-${info.vertices}`;
    mat.userData.noCut = true;
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (sh) => skinPatch(sh, tex);
    depth.customProgramCacheKey = () => `lsw-depth-${info.vertices}`;
    const mesh = new THREE.InstancedMesh(geo, mat, maxNear);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false;
    mesh.count = 0; mesh.visible = false; mesh.name = `lsw-body-${info.vertices}`;
    for (let i = 0; i < maxNear; i++) mesh.setMatrixAt(i, _m.identity()); // skin matrices are already world space
    this.scene.add(mesh);
    return { names, mesh, tex, data, inst, instList: Object.values(inst), group, curl, J, segs, pelvisO, waistO, headC, headHalfX, faceZ, chestHalfX, chestHalfZ, shoulderY: J.upperarm_l.y, flagAt: fa, count: 0, G: Array.from({ length: NG }, () => new THREE.Matrix4()) };
  }

  setMode(m) { if (m === 'lsw' || m === 'classic') this.mode = m; return this.mode; }

  // Which body a person wears: the mesh by sex (their voice), the row by build. Cached per slot against who holds it.
  identify(ch) {
    const i = ch.slot, key = ch.colors;
    if (this.keyOf[i] === key && this.meshOf[i] >= 0) return;
    this.keyOf[i] = key;
    const named = ch.npc?.id && VOICES[ch.npc.id];
    const f = (named ? named.gender : genderOf(ch.npc?.name ?? ch.name ?? '')) === 'f';
    const b = ch.build ? (ch.build.w >= 1.08 ? 'heavy' : ch.build.w <= 0.92 ? 'lean' : 'standard') : BUILD_TO_BODY[ch.look?.build] ?? 'standard';
    const rk = f ? `${b}-female` : b;
    this.rowOf[i] = LSW_BODIES[rk] ?? LSW_BODIES.standard;
    this.meshOf[i] = this.rowOf[i].mesh === 'superhero-female' ? 1 : 0;
    const fk = FLAG_KEYS.indexOf(ch.flag ?? 'US');
    this.flagOf[i] = fk < 0 ? FLAG_KEYS.indexOf('US') : fk;
  }

  // Before the pose pass: pick the nearest people to the camera (with hysteresis) and reset the GPU rows.
  choose(chars, cull) {
    this.near.fill(0); this.drawn.fill(0); this.flagAt.fill(-1);
    for (const B of this.bodies) B.count = 0;
    this.flagN = 0;
    if (!this.ready || this.mode !== 'lsw' || this.nearN <= 0 || !this.focus) { this.was.fill(0); return; }
    const fx = this.focus.x, fz = this.focus.z, K = Math.min(this.nearN, this.rules.maxNear), keep2 = this.rules.keep * this.rules.keep;
    const D = this.candD, Sl = this.candS;
    let n = 0;
    for (const ch of chars) {
      if (ch.hidden || ch.ownMesh || (ch.inVehicle && !ch.seatPose)) continue;
      if (cull && (ch.gy ?? 0) > cull.y && ch.x > cull.b.minX && ch.x < cull.b.maxX && ch.z > cull.b.minZ && ch.z < cull.b.maxZ) continue;
      const dx = ch.x - fx, dz = ch.z - fz;
      let d = dx * dx + dz * dz;
      if (this.was[ch.slot]) d *= keep2;
      if (n === K && d >= D[K - 1]) continue;
      let j = n < K ? n++ : K - 1;
      while (j > 0 && D[j - 1] > d) { D[j] = D[j - 1]; Sl[j] = Sl[j - 1]; j--; }
      D[j] = d; Sl[j] = ch.slot;
    }
    this.was.fill(0);
    for (let j = 0; j < n; j++) { this.near[Sl[j]] = 1; this.was[Sl[j]] = 1; }
  }

  // The pose pass hands over its solution for one near person (all frames world-space except where noted):
  //   LF leg frame, hipY, hip/knee/ankle (leg frame), footPitch[2], G upper-body frame, H head frame (with hatScale),
  //   el/hand (upper-body frame), ik (arms were IK-solved: the hand point is exact), gunHand (a gun in that fist: 0/1/-1),
  //   grip[2] (a hand closed on something).
  drive(ch, LF, hipY, hip, knee, ankle, footPitch, G, H, el, hand, ik, gunHand, grip) {
    const t0 = performance.now();
    this.identify(ch);
    const i = ch.slot, B = this.bodies[this.meshOf[i]], row = this.rowOf[i], R = this.rules;
    if (!B || B.count >= R.maxNear) return false;
    const k = B.count++, Gm = B.G, wL = R.width * row.limb, wC = R.width * row.chest;
    const bh = ch.build?.h ?? 1;
    // Pelvis: the leg frame at the hip joints.
    _m.copy(LF).multiply(_n.makeTranslation(0, hipY, 0)).multiply(_s.makeScale(wC, 1, wC));
    Gm[PELVIS].copy(_m).multiply(_n.makeTranslation(-B.pelvisO.x, -B.pelvisO.y, -B.pelvisO.z));
    // Trunk: DSOA's upper-body frame (lean, twist, prone, seat) at the waist; an idle chest breathes.
    const br = ch.alive && !(ch.speed > 0.4) ? 1 + R.breath * Math.sin(this.t * Math.PI * 0.5 + i) : 1;
    _m.copy(G).multiply(_s.makeScale(wC, br, wC));
    Gm[TORSO].copy(_m).multiply(_n.makeTranslation(-B.waistO.x, -B.waistO.y, -B.waistO.z));
    // Head: the classic head frame (already scaled for the hats), the LSW head inside it.
    if (ch.headless) Gm[HEAD].makeScale(0, 0, 0);
    else Gm[HEAD].copy(H).multiply(_s.makeScale(this.headSkin, this.headSkin, this.headSkin)).multiply(_n.makeTranslation(-B.headC.x, -B.headC.y, -B.headC.z));
    rotOf(G, _qt); rotOf(LF, _ql);
    for (let s = 0; s < 2; s++) {
      // ---- arm: LSW shoulder -> DSOA's grip, bending toward DSOA's elbow --------------------------------------------
      const su = B.segs.upper[s], sf = B.segs.fore[s];
      _sh.copy(su.a).applyMatrix4(Gm[TORSO]);
      _hw.copy(hand[s]).applyMatrix4(G); _ew.copy(el[s]).applyMatrix4(G);
      const so = i * 24 + s * 12; _hw.toArray(this.solver, so + 9);
      _wr.copy(_hw).sub(_ew).normalize().multiplyScalar(-R.palm * bh).add(_hw);
      if (!ik && gunHand !== s) { _a.copy(_sh); _b.set(s ? -0.33 : 0.33, 0.56, 0).applyMatrix4(G); _wr.addScaledVector(_a.sub(_b), 0.7); } // a hanging arm hangs from the LSW shoulder
      let reach = (0.3 + 0.3 - R.palm) * bh / (su.len + sf.len);
      const want = _wr.distanceTo(_sh) / ((su.len + sf.len) * reach * 0.995); // a grip past the LSW arm's reach (bars, a sprawl): the arm stretches to it
      if (want > 1) reach *= Math.min(R.stretch, want);
      _pole.subVectors(_ew, _sh);
      ik2(_sh, _wr, su.len * reach, sf.len * reach, _pole, _el, _wr);
      this.segment(Gm[UPPER[s]], _qt, su, _sh, _el, wL, _q);
      this.segment(Gm[FORE[s]], _q, sf, _el, _wr, wL, _q2);
      _s.makeScale(wL, wL, wL); Gm[HAND[s]].compose(_wr, _q2, _one).multiply(_s).multiply(_n.makeTranslation(-B.segs.hand[s].x, -B.segs.hand[s].y, -B.segs.hand[s].z));
      // ---- leg: DSOA's hip, knee and ankle exactly ---------------------------------------------------------------
      _a.copy(hip[s]).applyMatrix4(LF); _b.copy(knee[s]).applyMatrix4(LF); _c.copy(ankle[s]).applyMatrix4(LF);
      _a.toArray(this.solver, so); _b.toArray(this.solver, so + 3); _c.toArray(this.solver, so + 6);
      this.segment(Gm[THIGH[s]], _ql, B.segs.thigh[s], _a, _b, wL, _q);
      this.segment(Gm[CALF[s]], _q, B.segs.calf[s], _b, _c, wL, _q2);
      // Foot: DSOA's boot frame (the leg frame pitched at the ankle).
      _m.copy(LF).multiply(_n.makeRotationX(footPitch[s]));
      rotOf(_m, _q);
      _s.makeScale(wL * R.boot[0], R.boot[1], R.boot[2]); // bare source feet, booted: wider, a heel and a toe cap
      Gm[FOOT[s]].compose(_c, _q, _one).multiply(_n.makeTranslation(0, B.segs.foot[s].y * R.boot[1] - ANKLE_Y, 0)).multiply(_s).multiply(_n.makeTranslation(-B.segs.foot[s].x, -B.segs.foot[s].y, -B.segs.foot[s].z));
    }
    // Write the 65 skin matrices into this instance's texture row.
    const base = k * NB * 16, D = B.data;
    for (let b = 0; b < NB; b++) {
      const g = B.group[b], M = Gm[g];
      if (g === HAND[0] || g === HAND[1]) {
        const cv = B.curl[grip[g === HAND[0] ? 0 : 1] ? 0 : 1];
        _m.fromArray(cv, b * 16).premultiply(M);
        D.set(_m.elements, base + b * 16);
      } else D.set(M.elements, base + b * 16);
    }
    // Colours: read straight off the classic rig's instance colours (blood, soot and all), so the hand-off never pops.
    this.colours(ch, B.inst, k);
    this.instOf[i] = k; this.drawn[i] = 1;
    // The flag patch on the left shoulder, riding the trunk.
    if (this.flagMesh && this.flagN < this.flagMesh.instanceMatrix.count) {
      const f = this.flagN++; this.flagAt[i] = f;
      _m.copy(Gm[TORSO]).multiply(_n.makeTranslation(B.flagAt.x, B.flagAt.y, B.flagAt.z)).multiply(_r.makeRotationZ(-0.42)); // tilted out over the shoulder, toward the camera
      this.flagMesh.setMatrixAt(f, _m);
      const fi = this.flagOf[i], fa = this.flagMesh.geometry.attributes.iFlag;
      fa.array[f * 2] = (fi % this.flagCols) * this.flagCell[0]; fa.array[f * 2 + 1] = Math.floor(fi / this.flagCols) * this.flagCell[1];
    }
    this.stats.ms += performance.now() - t0;
    return true;
  }

  // out = T(pA) * Rseg * stretch * T(-bind A), Rseg = the swing that turns the bind bone onto pA->pB, under the parent.
  segment(out, parentQ, sg, pA, pB, W, outQ) {
    _d.copy(sg.dir).applyQuaternion(parentQ);
    _e.subVectors(pB, pA);
    const len = _e.length();
    if (len < 1e-6) _e.copy(_d); else _e.divideScalar(len);
    outQ.setFromUnitVectors(_d, _e).multiply(parentQ);
    stretch(_s, sg.dir, len / sg.len, W);
    out.compose(pA, outQ, _one).multiply(_s).multiply(_n.makeTranslation(-sg.a.x, -sg.a.y, -sg.a.z));
  }

  colours(ch, inst, k) {
    const M = this.charMeshes, i = ch.slot;
    copy3(inst.iShirt, k, M.torso, i); copy3(inst.iPants, k, M.hips, i); copy3(inst.iBoots, k, M.boot, i * 2); copy3(inst.iSkin, k, M.head, i); copy3(inst.iFore, k, M.fore, i * 2);
    const hx = ch.colors?.hair ?? '#1b1410';
    if (this.hairKey[i] !== hx) { this.hairKey[i] = hx; _col.set(hx); this.hairRGB[i * 3] = _col.r; this.hairRGB[i * 3 + 1] = _col.g; this.hairRGB[i * 3 + 2] = _col.b; }
    const d = inst.iHair.array; d[k * 3] = this.hairRGB[i * 3]; d[k * 3 + 1] = this.hairRGB[i * 3 + 1]; d[k * 3 + 2] = this.hairRGB[i * 3 + 2];
  }

  // After the pose pass: counts, uploads.
  finish(dt) {
    this.t += dt;
    let drawn = 0;
    for (const B of this.bodies) {
      B.mesh.count = B.count; B.mesh.visible = B.count > 0; drawn += B.count;
      if (B.count) { B.tex.needsUpdate = true; for (let a = 0; a < B.instList.length; a++) B.instList[a].needsUpdate = true; }
    }
    if (this.flagMesh) {
      this.flagMesh.count = this.flagN; this.flagMesh.visible = this.flagN > 0;
      if (this.flagN) { this.flagMesh.instanceMatrix.needsUpdate = true; this.flagMesh.geometry.attributes.iFlag.needsUpdate = true; }
    }
    this.stats.frames++; this.stats.drawn = drawn;
  }

  // Where a near person's LSW bones are this frame (world), for the agent and the selftest: joint name -> [x, y, z].
  bones(ch, names) {
    if (!this.drawn[ch.slot]) return null;
    const B = this.bodies[this.meshOf[ch.slot]], k = this.instOf[ch.slot], out = {};
    for (const n of names) {
      const b = B.names.indexOf(n);
      if (b < 0) continue;
      _m.fromArray(B.data, (k * NB + b) * 16);
      const p = _a.copy(B.J[n]).applyMatrix4(_m);
      out[n] = [p.x, p.y, p.z];
    }
    return out;
  }
}
