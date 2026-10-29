import * as THREE from 'three';
import { LSW_RULES, FACET_FRAMES, facetRecipe } from '../data/lswbodies.js';
import { VOICES, genderOf } from '../data/voices.js';
import { FLAGS, FLAG_KEYS } from '../ui/portrait.js';

// LSW-BODIES (docs/design/WEB_LSW_BODIES.md): the people nearest the camera wear Living Superweapon's FACETED bodies
// (the cubed modular-hero kit, public/models/lsw-faceted/), everyone else the classic instanced rig.
// Every person gets their own body from a recipe (data/lswbodies.js facetRecipe: LSW's civilian generator for DSOA):
// which of the kit's 46 modules show (hair style, glasses...), a frame, muscle, head size and one of LSW's baked faces.
// No second animation system: CharacterRenderer.pose() solves the joints exactly as before, and drive() turns that
// solution into 53 skin matrices per person (bind-space calibration, LSW's own retarget method):
//   rigid regions  pelvis / trunk / head  =  DSOA frame * scale * T(-bind origin)
//   limb segments  thigh, shin, upper arm, forearm  =  T(DSOA joint) * swing(parent) * stretch along the bone * T(-bind joint)
//   hands, feet    ride their segment / DSOA's foot frame; fingers close by a precomputed curl when the hand holds something
// The arms are re-solved by two-bone IK from the kit's shoulder to DSOA's hand point (the grip), bending toward DSOA's
// elbow, so a hand on a gun stays on it whatever the shoulder width.
// The whole kit is ONE InstancedMesh draw: skin matrices in a float texture (a row per instance), the recipe as
// per-instance attributes (a module bitmask, morph weights, the face), colours read off the classic rig.
// One mesh + its shadow pass + one flag-patch draw = 3 draw calls. Nothing here allocates per frame.

const NB = 53; // bones in ual-deform-v1
const XT = 9;  // extra texels per instance row after the bones: shirt, trousers, boots, skin, forearm, hair, trim colours, the module mask, the morph weights + face
const ROW = NB * 4 + XT;
const PELVIS = 0, TORSO = 1, HEAD = 2;
const UPPER = [3, 4], FORE = [5, 6], HAND = [7, 8], THIGH = [9, 10], CALF = [11, 12], FOOT = [13, 14];
const NG = 15;
const ANKLE_Y = 0.08; // DSOA's ankle above the sole (characters.js)
// The names DSOA's checks and tools use -> the kit's bones.
const ALIAS = { Head: 'DEF-head', neck_01: 'DEF-neck', pelvis: 'DEF-hips' };
for (const [s, S] of [['l', 'L'], ['r', 'R']]) Object.assign(ALIAS, { [`clavicle_${s}`]: `DEF-shoulder.${S}`, [`upperarm_${s}`]: `DEF-upper_arm.${S}`, [`lowerarm_${s}`]: `DEF-forearm.${S}`, [`hand_${s}`]: `DEF-hand.${S}`, [`thigh_${s}`]: `DEF-thigh.${S}`, [`calf_${s}`]: `DEF-shin.${S}`, [`foot_${s}`]: `DEF-foot.${S}`, [`ball_${s}`]: `DEF-toe.${S}` });
// Which colour a module wears: 0 shirt, 1 trousers, 2 boots, 3 skin, 4 forearm (sleeve or skin), 5 hair, 6 trim, 7 the face texture.
const SRC = { head: 3, neck: 3, expression: 7, hair: 5, glasses: 6, torso: 0, arms: 0, deltoids: 0, forearms: 4, hands: 3, handTips: 3, legs: 1, waist: 1, calves: 1, boots: 2, shoes: 2 };
const BODY = ['head', 'neck', 'expression', 'torso', 'waist', 'legs', 'arms', 'deltoids', 'forearms', 'hands', 'handTips', 'boots'];
const FACES = ['worker', 'cop-off-duty', 'nurse', 'kid', 'elder', 'gang-member'];

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

// One colour from a classic instanced mesh (row idx) into the instance texture row at float offset o.
function copy4(d, o, mesh, idx) { const s = mesh.instanceColor.array; d[o] = s[idx * 3]; d[o + 1] = s[idx * 3 + 1]; d[o + 2] = s[idx * 3 + 2]; d[o + 3] = 1; }

// The skinning patch, shared by the lit material and the shadow (depth) material: the recipe's modules only (bitmask),
// the muscle and waist morphs, then 4-bone skinning from the texture row. The shadow pass leaves the face quad out.
// Everything per instance rides the bone texture row (WebGL's 16-attribute limit): 53 mat4, then XT texels of recipe and
// colour. The morph deltas ride a second texture, fetched by gl_VertexID.
const VERT_HEAD = `uniform highp sampler2D lswBones; uniform highp sampler2D lswMorphs;
attribute vec4 aBone; attribute vec4 aWeight; attribute vec2 aPS;
vec4 lswX(int j) { return texelFetch(lswBones, ivec2(${NB * 4} + j, gl_InstanceID), 0); }
vec3 lswMorph(int m) { int t = gl_VertexID * 3 + m; return texelFetch(lswMorphs, ivec2(t % 1024, t / 1024), 0).xyz; }
mat4 lswBone(float b) { int x = int(b + 0.5) * 4; int y = gl_InstanceID;
  return mat4(texelFetch(lswBones, ivec2(x, y), 0), texelFetch(lswBones, ivec2(x + 1, y), 0), texelFetch(lswBones, ivec2(x + 2, y), 0), texelFetch(lswBones, ivec2(x + 3, y), 0)); }
float lswShown(vec4 mask) { float p = aPS.x, m = p < 22.5 ? mask.x : mask.y, b = p < 22.5 ? p : p - 23.0; return mod(floor(m / exp2(b) + 0.001), 2.0); }
`;
const VERT_MAIN = 'void main() {\n  mat4 lswM = lswBone(aBone.x) * aWeight.x + lswBone(aBone.y) * aWeight.y + lswBone(aBone.z) * aWeight.z + lswBone(aBone.w) * aWeight.w;';
function skinPatch(shader, tex, morphs, shadow) {
  shader.uniforms.lswBones = { value: tex }; shader.uniforms.lswMorphs = { value: morphs };
  shader.vertexShader = VERT_HEAD + shader.vertexShader
    .replace('void main() {', VERT_MAIN)
    .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(mat3(lswM) * normal);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif')
    .replace('#include <begin_vertex>', `vec4 lswW = lswX(8);
  vec3 lswP = position + lswMorph(0) * lswW.x + lswMorph(1) * lswW.y + lswMorph(2) * lswW.z;
  vec3 transformed = lswShown(lswX(7)) ${shadow ? '* step(aPS.y, 6.5) ' : ''}> 0.5 ? (lswM * vec4(lswP, 1.0)).xyz : vec3(0.0);`);
}

export class LswBodies {
  constructor(scene, maxChars, rules = LSW_RULES) {
    this.scene = scene; this.rules = rules;
    this.mode = rules.default; this.nearN = rules.near;
    this.ready = false; this.error = null;
    this.near = new Uint8Array(maxChars);   // slot -> 1: this frame they wear a faceted body
    this.was = new Uint8Array(maxChars);    // last frame's set (hysteresis)
    this.drawn = new Uint8Array(maxChars);  // slot -> 1: posed onto a GPU row this frame
    this.meshOf = new Int8Array(maxChars).fill(-1); this.recipeOf = new Array(maxChars).fill(null); this.flagOf = new Int16Array(maxChars).fill(-1);
    this.keyOf = new Array(maxChars).fill(null); // what the recipe was worked out from (a slot is reused by a new person)
    this.look = new Float32Array(maxChars * 8); // per slot: mask x, mask y, muscle small, large, waist, face, frame x, frame z
    this.instOf = new Int16Array(maxChars).fill(-1); // slot -> GPU row this frame
    this.solver = new Float32Array(maxChars * 24); // the solver's joints (world) per side: hip, knee, ankle, grip - what the checks compare the bones to
    this.flagAt = new Int16Array(maxChars).fill(-1); // slot -> flag patch row this frame
    this.candD = new Float64Array(rules.maxNear); this.candS = new Int16Array(rules.maxNear);
    this.hairKey = new Array(maxChars).fill(null); this.hairRGB = new Float32Array(maxChars * 3);
    this.bodies = []; // one: the kit
    this.focus = null; // a Vector3 (the camera); nearest to it wear faceted bodies
    this.t = 0;
    this.stats = { frames: 0, ms: 0, last: 0, drawn: 0 };
    this.headUp = 0.7; this.hatScale = new THREE.Matrix4(); this.gearScale = new THREE.Matrix4();
    this.loaded = this.load().catch((e) => { this.error = String(e?.message ?? e); console.warn('[lsw-bodies]', this.error); });
  }

  async load(base = ((typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/') + 'models/lsw-faceted/') {
    const meta = await (await fetch(`${base}kit.json`)).json();
    const buf = await fetch(`${base}${meta.file}`).then((r) => { if (!r.ok) throw new Error(`kit: ${r.status}`); return r.arrayBuffer(); });
    const faceImgs = await Promise.all(FACES.map((f) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(`face ${f}`)); im.src = `${base}${meta.faces[f].file}`; })));
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
    // The faces: LSW's six baked faces in a 3 x 2 atlas.
    const fc = document.createElement('canvas'); fc.width = 3 * 128; fc.height = 2 * 128;
    const fx = fc.getContext('2d');
    faceImgs.forEach((im, i) => fx.drawImage(im, (i % 3) * 128, Math.floor(i / 3) * 128, 128, 128));
    const faceTex = new THREE.CanvasTexture(fc); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.flipY = false;
    this.bodies.push(this.buildBody(meta, buf, maxNear, faceTex));
    const fg = new THREE.PlaneGeometry(R.flag.w, R.flag.h).rotateX(-Math.PI / 2);
    const fuv = new THREE.InstancedBufferAttribute(new Float32Array(maxNear * 2), 2); fuv.setUsage(THREE.DynamicDrawUsage);
    fg.setAttribute('iFlag', fuv);
    const fm = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.9 });
    fm.onBeforeCompile = (sh) => {
      sh.uniforms.lswCell = { value: new THREE.Vector2(...this.flagCell) };
      sh.vertexShader = 'attribute vec2 iFlag; uniform vec2 lswCell;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vec2(uv.x, 1.0 - uv.y) * lswCell + iFlag;');
    };
    fm.userData.noCut = true;
    atlas.flipY = false;
    this.flagMesh = new THREE.InstancedMesh(fg, fm, maxNear);
    this.flagMesh.frustumCulled = false; this.flagMesh.castShadow = false; this.flagMesh.count = 0; this.flagMesh.visible = false;
    this.flagMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flagMesh.name = 'lsw-flag-patches';
    this.scene.add(this.flagMesh);
    this.flagN = 0;
    // Head and gear: hats, scars and gear are the classic rig's (instanced, packed); they scale to the kit's head and trunk.
    const B = this.bodies[0];
    this.headUp = B.headC.y - B.waistO.y;
    const hs = R.headScale;
    const k = hs * Math.max(B.headHalfX / 0.19, (B.faceZ - B.headC.z) / 0.185);
    this.hatScale.makeScale(k, k, k);
    this.headSkin = hs / k; // the kit's head inside the scaled head frame
    this.gearScale.makeScale((B.chestHalfX * R.width) / 0.27, (B.shoulderY - B.waistO.y) / 0.5, (B.chestHalfZ * R.width) / 0.15);
    this.ready = true;
  }

  buildBody(info, buf, maxNear, faceTex) {
    const L = info.layout, R = this.rules;
    const view = (k, T) => new T(buf, L[k].offset, L[k].length);
    const pos = view('position', Float32Array), part = view('part', Uint8Array), nv = pos.length / 3;
    const mods = info.modules, src = new Uint8Array(nv);
    for (let v = 0; v < nv; v++) src[v] = SRC[mods[part[v]].slot] ?? 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(view('normal', Float32Array), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(view('uv', Float32Array), 2));
    geo.setAttribute('aWeight', new THREE.BufferAttribute(view('weight', Float32Array), 4));
    geo.setAttribute('aBone', new THREE.BufferAttribute(view('bone', Uint8Array), 4));
    const ps = new Uint8Array(nv * 2);
    for (let v = 0; v < nv; v++) { ps[v * 2] = part[v]; ps[v * 2 + 1] = src[v]; }
    geo.setAttribute('aPS', new THREE.BufferAttribute(ps, 2));
    // The three morphs (muscleSmall, muscleLarge, waistNarrow) as a float texture: texel = vertex * 3 + morph.
    const mrows = Math.ceil((nv * 3) / 1024), md = new Float32Array(1024 * mrows * 4);
    info.morphs.forEach((mn, mi) => { const d = view(mn, Float32Array); for (let v = 0; v < nv; v++) md.set(d.subarray(v * 3, v * 3 + 3), (v * 3 + mi) * 4); });
    const morphs = new THREE.DataTexture(md, 1024, mrows, THREE.RGBAFormat, THREE.FloatType);
    morphs.minFilter = morphs.magFilter = THREE.NearestFilter; morphs.generateMipmaps = false; morphs.needsUpdate = true;
    geo.setIndex(new THREE.BufferAttribute(view('index', Uint16Array), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1e5);
    const J = {}, names = info.joints.map((j) => j.name);
    info.joints.forEach((j) => { J[j.name] = new THREE.Vector3(...j.p); });
    for (const [a, n] of Object.entries(ALIAS)) J[a] = J[n];
    // Modules by slot (and hair by variant): the recipe's bitmask is built from these.
    const modOf = {};
    mods.forEach((m, i) => { const k = m.slot === 'hair' ? `hair.${m.variant}` : m.slot; (modOf[k] ??= []).push(i); });
    const inMod = (v, ...slots) => slots.includes(mods[part[v]].slot);
    const vec = (...a) => new THREE.Vector3(...a);
    // Bind anchors (kit metres, +z forward, +x the body's left like DSOA).
    const pelvisO = vec(0, (J.thigh_l.y + J.thigh_r.y) / 2, (J.thigh_l.z + J.thigh_r.z) / 2);
    const waistO = pelvisO.clone().add(vec(0, R.waistUp, 0));
    let top = -1e9, headHalfX = 0, faceZ = -1e9, chestHalfX = 0, chestHalfZ = 0, backZ = 1e9;
    for (let v = 0; v < nv; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      if (inMod(v, 'head')) { top = Math.max(top, y); headHalfX = Math.max(headHalfX, Math.abs(x)); faceZ = Math.max(faceZ, z); backZ = Math.min(backZ, z); }
      if (inMod(v, 'torso') && y > 1.22 && y < 1.36) { chestHalfX = Math.max(chestHalfX, Math.abs(x)); chestHalfZ = Math.max(chestHalfZ, Math.abs(z - waistO.z)); }
    }
    const headC = vec(0, (J.Head.y + top) / 2, (faceZ + backZ) / 2);
    // The flag patch sits on top of the left shoulder: the highest torso/deltoid surface near the anchor (bind space).
    const fa = vec(J.clavicle_l.x + R.flag.at[0], 0, J.clavicle_l.z + R.flag.at[2]);
    let fy = -1e9;
    for (let v = 0; v < nv; v++) if (inMod(v, 'torso', 'deltoids') && Math.abs(pos[v * 3] - fa.x) < 0.04 && Math.abs(pos[v * 3 + 2] - fa.z) < 0.05 && pos[v * 3 + 1] < J.neck_01.y + 0.05) fy = Math.max(fy, pos[v * 3 + 1]);
    fa.y = (fy > 0 ? fy : J.clavicle_l.y + R.flag.at[1]) + 0.012;
    // Bone -> group, and the finger curls (bind space), precomputed for the closed and the relaxed hand.
    const group = new Int8Array(NB), curl = [new Float32Array(NB * 16), new Float32Array(NB * 16)];
    const eye = new THREE.Matrix4().elements;
    for (let b = 0; b < NB; b++) { curl[0].set(eye, b * 16); curl[1].set(eye, b * 16); }
    names.forEach((n, b) => {
      const s = n.endsWith('.R') ? 1 : 0;
      group[b] = n === 'root' || n === 'DEF-hips' ? PELVIS : n === 'DEF-head' ? HEAD : /^DEF-(spine|neck|shoulder)/.test(n) ? TORSO
        : n.startsWith('DEF-upper_arm') ? UPPER[s] : n.startsWith('DEF-forearm') ? FORE[s] : n.startsWith('DEF-thigh') ? THIGH[s] : n.startsWith('DEF-shin') ? CALF[s]
          : /^DEF-(foot|toe)/.test(n) ? FOOT[s] : HAND[s];
      const f = /^DEF-(f_index|f_middle|f_ring|f_pinky|thumb)\.0(\d)\.[LR]$/.exec(n);
      if (!f) return;
      // Chain of rotations about each finger joint from the knuckle out; left fingers point +x, right -x, palms down.
      const sign = s ? 1 : -1, thumb = f[1] === 'thumb';
      for (let lvl = 0; lvl < 2; lvl++) {
        const C = new THREE.Matrix4();
        for (let k = 1; k <= Math.min(3, Number(f[2])); k++) {
          const p = J[`DEF-${f[1]}.0${k}.${s ? 'R' : 'L'}`];
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
    // GPU side: the instance texture (a row per instance: 53 mat4, then the colours and the recipe), the material and its shadow twin.
    const data = new Float32Array(ROW * maxNear * 4);
    const tex = new THREE.DataTexture(data, ROW, maxNear, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.78 });
    mat.onBeforeCompile = (sh) => {
      skinPatch(sh, tex, morphs, false);
      sh.uniforms.lswFaces = { value: faceTex };
      // The colour is per module (LSW's material slots), resolved per vertex: one varying, no per-fragment branching.
      sh.vertexShader = 'varying vec3 vLook; varying vec3 vFace;\n'
        + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  float lswS = aPS.y; vLook = lswX(int(min(lswS, 6.0) + 0.5)).rgb;
  float lswF = lswW.w; vFace = vec3((uv + vec2(mod(lswF, 3.0), floor(lswF / 3.0))) * vec2(1.0 / 3.0, 0.5), step(6.5, lswS));`);
      sh.fragmentShader = 'uniform sampler2D lswFaces; varying vec3 vLook; varying vec3 vFace;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb = vLook;
  if (vFace.z > 0.5) { vec4 fc = texture2D(lswFaces, vFace.xy); if (fc.a < 0.5) discard; diffuseColor.rgb = fc.rgb; }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = 0.78;`);
    };
    mat.customProgramCacheKey = () => 'lsw-faceted';
    mat.userData.noCut = true;
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (sh) => skinPatch(sh, tex, morphs, true);
    depth.customProgramCacheKey = () => 'lsw-faceted-depth';
    const mesh = new THREE.InstancedMesh(geo, mat, maxNear);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false;
    mesh.count = 0; mesh.visible = false; mesh.name = 'lsw-faceted';
    for (let i = 0; i < maxNear; i++) mesh.setMatrixAt(i, _m.identity()); // skin matrices are already world space
    this.scene.add(mesh);
    return { names, mesh, tex, data, modOf, group, curl, J, segs, pelvisO, waistO, headC, headHalfX, faceZ, chestHalfX, chestHalfZ, shoulderY: J.upperarm_l.y, flagAt: fa, count: 0, G: Array.from({ length: NG }, () => new THREE.Matrix4()) };
  }

  setMode(m) { if (m === 'lsw' || m === 'classic') this.mode = m; return this.mode; }

  // Who a person is in the kit: their recipe (sex from the voice) baked to a module bitmask, morph weights, face, frame.
  // Cached per slot against who holds it.
  identify(ch) {
    const i = ch.slot, key = ch.colors;
    if (this.keyOf[i] === key && this.meshOf[i] >= 0) return;
    const B = this.bodies[0];
    if (!B) return;
    this.keyOf[i] = key;
    const named = ch.npc?.id && VOICES[ch.npc.id];
    const r = facetRecipe(ch, (named ? named.gender : genderOf(ch.npc?.name ?? ch.name ?? '')) === 'f');
    this.recipeOf[i] = r; this.meshOf[i] = 0;
    let mx = 0, my = 0;
    const on = (k) => { for (const m of B.modOf[k] ?? []) { if (m < 23) mx += 2 ** m; else my += 2 ** (m - 23); } };
    for (const k of BODY) on(k);
    if (r.hair) on(`hair.${r.hair}`);
    if (r.glasses) on('glasses');
    const o = i * 8, L = this.look, fr = FACET_FRAMES[r.frame];
    L[o] = mx; L[o + 1] = my;
    L[o + 2] = r.muscle < 1 ? (1 - r.muscle) / 0.2 : 0; L[o + 3] = r.muscle > 1 ? (r.muscle - 1) / 0.3 : 0; // LSW applyModularRecipe
    L[o + 4] = r.female ? 1 : 0; L[o + 5] = FACES.indexOf(r.face); L[o + 6] = fr[0]; L[o + 7] = fr[2];
    const fk = FLAG_KEYS.indexOf(ch.flag ?? 'US');
    this.flagOf[i] = fk < 0 ? FLAG_KEYS.indexOf('US') : fk;
  }

  // The faceted head wears its own hair module for DSOA's hair styles (short, long, bald): the classic hair piece steps aside.
  ownsHair(ch) { this.identify(ch); return this.recipeOf[ch.slot]?.hair !== undefined; }

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
    const i = ch.slot, B = this.bodies[this.meshOf[i]], R = this.rules;
    if (!B || B.count >= R.maxNear) return false;
    const k = B.count++, Gm = B.G, lo = i * 8, r = this.recipeOf[i];
    const wx = R.width * this.look[lo + 6], wz = R.width * this.look[lo + 7], wL = R.width * (this.look[lo + 6] + this.look[lo + 7]) / 2;
    const bh = ch.build?.h ?? 1;
    // Pelvis: the leg frame at the hip joints.
    _m.copy(LF).multiply(_n.makeTranslation(0, hipY, 0)).multiply(_s.makeScale(wx, 1, wz));
    Gm[PELVIS].copy(_m).multiply(_n.makeTranslation(-B.pelvisO.x, -B.pelvisO.y, -B.pelvisO.z));
    // Trunk: DSOA's upper-body frame (lean, twist, prone, seat) at the waist; an idle chest breathes.
    const br = ch.alive && !(ch.speed > 0.4) ? 1 + R.breath * Math.sin(this.t * Math.PI * 0.5 + i) : 1;
    _m.copy(G).multiply(_s.makeScale(wx, br, wz));
    Gm[TORSO].copy(_m).multiply(_n.makeTranslation(-B.waistO.x, -B.waistO.y, -B.waistO.z));
    // Head: the classic head frame (already scaled for the hats), the kit's head inside it at the recipe's proportions.
    if (ch.headless) Gm[HEAD].makeScale(0, 0, 0);
    else Gm[HEAD].copy(H).multiply(_s.makeScale(this.headSkin * r.head[0], this.headSkin * r.head[1], this.headSkin * r.head[2])).multiply(_n.makeTranslation(-B.headC.x, -B.headC.y, -B.headC.z));
    rotOf(G, _qt); rotOf(LF, _ql);
    for (let s = 0; s < 2; s++) {
      // ---- arm: the kit's shoulder -> DSOA's grip, bending toward DSOA's elbow ----------------------------------------
      const su = B.segs.upper[s], sf = B.segs.fore[s];
      _sh.copy(su.a).applyMatrix4(Gm[TORSO]);
      _hw.copy(hand[s]).applyMatrix4(G); _ew.copy(el[s]).applyMatrix4(G);
      const so = i * 24 + s * 12;
      _wr.copy(_hw).sub(_ew).normalize().multiplyScalar(-R.palm * bh);
      // a hanging arm hangs from the kit's (narrower) shoulder: its hand point moves with it, and that is what's recorded
      if (!ik && gunHand !== s) { _a.copy(_sh); _b.set(s ? -0.33 : 0.33, 0.56, 0).applyMatrix4(G); _hw.addScaledVector(_a.sub(_b), 0.7); }
      _hw.toArray(this.solver, so + 9); _wr.add(_hw);
      let reach = (0.3 + 0.3 - R.palm) * bh / (su.len + sf.len);
      const want = _wr.distanceTo(_sh) / ((su.len + sf.len) * reach * 0.995); // a grip past the arm's reach (bars, a sprawl): the arm stretches to it
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
      // Foot: DSOA's boot frame (the leg frame pitched at the ankle), the kit's sole on the ground.
      _m.copy(LF).multiply(_n.makeRotationX(footPitch[s]));
      rotOf(_m, _q);
      _s.makeScale(wL * R.boot[0], R.boot[1], R.boot[2]);
      Gm[FOOT[s]].compose(_c, _q, _one).multiply(_n.makeTranslation(0, B.segs.foot[s].y * R.boot[1] - ANKLE_Y, 0)).multiply(_s).multiply(_n.makeTranslation(-B.segs.foot[s].x, -B.segs.foot[s].y, -B.segs.foot[s].z));
    }
    // Write the 53 skin matrices into this instance's texture row.
    const base = k * ROW * 4, D = B.data;
    for (let b = 0; b < NB; b++) {
      const g = B.group[b], M = Gm[g];
      if (g === HAND[0] || g === HAND[1]) {
        const cv = B.curl[grip[g === HAND[0] ? 0 : 1] ? 0 : 1];
        _m.fromArray(cv, b * 16).premultiply(M);
        D.set(_m.elements, base + b * 16);
      } else D.set(M.elements, base + b * 16);
    }
    // The recipe and the colours (read straight off the classic rig's instance colours: blood, soot, rot and all).
    this.colours(ch, D, base + NB * 16);
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

  // The row's extra texels: colours read straight off the classic rig's instance colours (blood, soot, rot and all),
  // then the recipe (module mask, morph weights, face).
  colours(ch, D, o) {
    const M = this.charMeshes, i = ch.slot, L = this.look, lo = i * 8;
    copy4(D, o, M.torso, i); copy4(D, o + 4, M.hips, i); copy4(D, o + 8, M.boot, i * 2); copy4(D, o + 12, M.head, i); copy4(D, o + 16, M.fore, i * 2);
    const hx = ch.colors?.hair ?? '#1b1410';
    if (this.hairKey[i] !== hx) { this.hairKey[i] = hx; _col.set(hx); this.hairRGB[i * 3] = _col.r; this.hairRGB[i * 3 + 1] = _col.g; this.hairRGB[i * 3 + 2] = _col.b; }
    D[o + 20] = this.hairRGB[i * 3]; D[o + 21] = this.hairRGB[i * 3 + 1]; D[o + 22] = this.hairRGB[i * 3 + 2];
    D[o + 24] = 0.45; D[o + 25] = 0.34; D[o + 26] = 0.13; // glasses frames: LSW's elder gold, darkened to read
    D[o + 28] = L[lo]; D[o + 29] = L[lo + 1];
    D[o + 32] = L[lo + 2]; D[o + 33] = L[lo + 3]; D[o + 34] = L[lo + 4]; D[o + 35] = L[lo + 5];
  }

  // A drawn person's colour j (0 shirt, 1 trousers, 2 boots, 3 skin, 4 forearm, 5 hair, 6 trim) as the GPU has it.
  colourOf(ch, j) { if (!this.drawn[ch.slot]) return null; const o = (this.instOf[ch.slot] * ROW + NB * 4 + j) * 4, D = this.bodies[0].data; return [D[o], D[o + 1], D[o + 2]]; }

  // After the pose pass: counts, uploads.
  finish(dt) {
    this.t += dt;
    let drawn = 0;
    for (const B of this.bodies) {
      B.mesh.count = B.count; B.mesh.visible = B.count > 0; drawn += B.count;
      if (B.count) B.tex.needsUpdate = true;
    }
    if (this.flagMesh) {
      this.flagMesh.count = this.flagN; this.flagMesh.visible = this.flagN > 0;
      if (this.flagN) { this.flagMesh.instanceMatrix.needsUpdate = true; this.flagMesh.geometry.attributes.iFlag.needsUpdate = true; }
    }
    this.stats.frames++; this.stats.drawn = drawn;
  }

  // Where a near person's bones are this frame (world), for the agent and the selftest: joint name (DSOA's or the
  // kit's) -> [x, y, z].
  bones(ch, names) {
    if (!this.drawn[ch.slot]) return null;
    const B = this.bodies[this.meshOf[ch.slot]], k = this.instOf[ch.slot], out = {};
    for (const n of names) {
      const b = B.names.indexOf(ALIAS[n] ?? n);
      if (b < 0) continue;
      _m.fromArray(B.data, k * ROW * 4 + b * 16);
      const p = _a.copy(B.J[n]).applyMatrix4(_m);
      out[n] = [p.x, p.y, p.z];
    }
    return out;
  }
}
