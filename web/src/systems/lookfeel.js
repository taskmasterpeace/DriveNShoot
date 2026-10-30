import * as THREE from 'three';
import { LOOK_REGIONS, TIME_GRADES, GRADE, HORIZONS, WIND, DECALS, IMPACT, WEAR, IDENTITY, applyGrade, composeGrade } from '../data/looks.js';
import { DECAL_Y, layerMesh } from '../engine/depthlayers.js';
import { WEAPONS } from './combat.js';
import { PART } from './vehiclebodies.js';
import { variantPatch } from '../world/flora.js';
import { roadLines, HALF } from '../world/city.js';
import { LampLight } from './lamplight.js';

// LOOK-FEEL (docs/design/WEB_LOOK_FEEL.md; rows in data/looks.js). Seven things, one system:
//   grade     ONE full-screen pass: the scene renders into a target, a triangle tone-maps it and looks it up in a 16^3 LUT
//             baked on the CPU from the region rows x the time-of-day rows, blended across state lines (a ring of samples
//             round the view) and through dawn and dusk. Rebuilt only when the blend moves. The crash dirt rides it.
//   horizon   a region's band resolves (rows), but the camera law keeps the horizon off screen: horizonVisible() proves it
//   wind      one uniform set: the flora (per species stiffness), bushes, and hanging cloth in the shared box batches
//   decals    HISTORY: one pooled InstancedMesh (an atlas of skid, scorch, oil, bonfire ring, blood trail) on the depth law;
//             laid by events (hard stops, crashes, blasts, leaking cars, the wounded) and seeded per cell (a crash story
//             beside a road: skids off the shoulder into the ditch; a camp's bonfire ring near a town)
//   impact    hit-stop (the sim runs at IMPACT.timeScale for 40-80 ms), camera kick by calibre, screen-edge crash dirt
//   wear      per vehicle: dust and mud by what is under the wheels, scraped metal along walls (sparks), dent tint by zone;
//             a garage repair washes it
// Settings (the pause menu): grade, hitStop, kick, dirt (0..1 each).

const N = GRADE.lut;
const _v2 = new THREE.Vector2(), _v0 = new THREE.Vector2(), _c = new THREE.Color(), _o = new THREE.Object3D();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const REGION_OF_STATE = {};
for (const [id, R] of Object.entries(LOOK_REGIONS)) for (const s of R.states) REGION_OF_STATE[s] = id;
export const regionOfState = (s) => REGION_OF_STATE[s] ?? 'default';
const REGION_IDS = Object.keys(LOOK_REGIONS), TIME_IDS = Object.keys(TIME_GRADES);
const blank = () => ({ ...IDENTITY, lift: [0, 0, 0], gain: [1, 1, 1] });

// Time of day: a smooth bump per phase round its centre (wrapping the clock), normalised.
export function timeWeights(hour, out = {}) {
  let sum = 0;
  for (const k of TIME_IDS) {
    const T = TIME_GRADES[k];
    let d = Math.abs(hour - T.centre); d = Math.min(d, 24 - d);
    const x = Math.max(0, 1 - d / (T.half * 2)), w = x * x * (3 - 2 * x);
    out[k] = w; sum += w;
  }
  for (const k of TIME_IDS) out[k] = sum > 0 ? out[k] / sum : (k === 'day' ? 1 : 0);
  return out;
}

// What the wind shader does to a vertex h m over a plant's foot (the JS twin of WIND_VERT: the checks read it).
export function windOffset(U, h, ix, iz, stiff = 1) {
  const w = U.uWind.value, G = U.uWindG.value, t = w.w;
  const gust = 1 + G.x * Math.sin(t * G.y * 6.2832 + (ix * w.x + iz * w.y) * 0.02);
  const ph = ix * 0.37 + iz * 0.23;
  const s = (w.z * gust * (h * h) / 100) * (0.75 + 0.25 * Math.sin(t * G.z + ph)) / stiff;
  return s + (0.12 * Math.sin(t * 3.1 + ph + h * 1.7) * w.z * h / 10) / stiff;
}

const U = {
  uWind: { value: new THREE.Vector4(0.95, 0.31, 0, 0) },   // dir x, dir z, strength (m at 10 m), time (s)
  uWindG: { value: new THREE.Vector4(WIND.gust, WIND.gustHz, WIND.swayHz, WIND.cloth) },
};
export const WIND_UNIFORMS = U;
const WIND_HEAD = 'uniform vec4 uWind; uniform vec4 uWindG; uniform float uStiff;\n';
// Plants: bend along the wind by height^2 (the foot stays planted), a slow own sway and a quick flutter in the crown.
const WIND_VERT = `#ifdef USE_INSTANCING
{ vec3 ip = instanceMatrix[3].xyz; float sc = length(instanceMatrix[1].xyz);
  float hh = max(0.0, transformed.y) * sc;
  float ph = ip.x * 0.37 + ip.z * 0.23;
  float gust = 1.0 + uWindG.x * sin(uWind.w * uWindG.y * 6.2832 + dot(ip.xz, uWind.xy) * 0.02);
  float sway = (uWind.z * gust * (hh * hh) / 100.0) * (0.75 + 0.25 * sin(uWind.w * uWindG.z + ph)) / uStiff;
  sway += (0.12 * sin(uWind.w * 3.1 + ph + hh * 1.7) * uWind.z * hh / 10.0) / uStiff;
  vec3 wl = (transpose(mat3(instanceMatrix)) * vec3(uWind.x, 0.0, uWind.y)) / max(1e-4, sc * sc);
  transformed += wl * sway; }
#endif
#include <project_vertex>`;
// Cloth in a shared box batch (a unit cube scaled per instance): a thin hanging panel (laundry, a flag, a hung sheet)
// swings its lower edge downwind and flutters. Told apart by shape (WIND.clothThin, its own height and area).
const CLOTH_VERT = `#ifdef USE_INSTANCING
{ float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz), sz = length(instanceMatrix[2].xyz);
  float thin = min(sx, sz), wide = max(sx, sz);
  if (thin < ${WIND.clothThin.toFixed(3)} && sy > 0.25 && sy < 1.45 && wide * sy < 2.2 && wide > 0.2) {
    vec3 ip = instanceMatrix[3].xyz; float low = clamp(0.5 - transformed.y, 0.0, 1.0);
    float ph = ip.x * 0.71 + ip.z * 0.53;
    float f = uWind.z * uWindG.w * low * (0.10 + 0.05 * sin(uWind.w * 4.3 + ph + transformed.x * 3.0));
    vec3 wl = (transpose(mat3(instanceMatrix)) * vec3(uWind.x, 0.0, uWind.y));
    transformed += vec3(wl.x / max(1e-4, sx * sx), 0.0, wl.z / max(1e-4, sz * sz)) * f;
  } }
#endif
#include <project_vertex>`;

function windPatch(mat, stiff, body, key) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey, uS = { value: stiff };
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uWind = U.uWind; sh.uniforms.uWindG = U.uWindG; sh.uniforms.uStiff = uS;
    sh.vertexShader = WIND_HEAD + sh.vertexShader.replace('#include <project_vertex>', body);
  };
  mat.customProgramCacheKey = () => `${prevKey ? prevKey.call(mat) : ''}|${key}`;
  mat.userData.wind = uS;
  mat.needsUpdate = true;
  return mat;
}
// Species stiffness (1 = a tree bends freely): cacti barely move, palms whip, the tumbleweed and creosote shiver.
const STIFF = { saguaro: 9, pricklypear: 8, joshua: 5, ocotillo: 1.6, fanpalm: 0.7, datepalm: 0.75, sabal: 0.8, deadtree: 2.6, tumbleweed: 0.6, creosote: 0.9 };

// ---- the history atlas (4 x 2 cells of 128 px): skid, scorch, oil, bonfire ring, blood trail -----------------------------
function historyAtlas() {
  const W = 512, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d'), rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const cell = (i, fn) => { x.save(); x.translate((i % 4) * 128, Math.floor(i / 4) * 128); fn(); x.restore(); };
  cell(0, () => { // a skid streak: dark rubber, tread lines along it
    const g = x.createLinearGradient(0, 0, 128, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.2, 'rgba(255,255,255,0.85)'); g.addColorStop(0.8, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(16, 0, 96, 128);
    x.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 7; k++) { x.fillStyle = `rgba(0,0,0,${0.25 + rnd() * 0.3})`; x.fillRect(24 + k * 12, 0, 3, 128); }
  });
  cell(1, () => { // scorch: soot, a ragged edge, a darker heart
    for (let k = 0; k < 60; k++) { const a = rnd() * 6.283, r = rnd() * 46, s = 10 + rnd() * 26; const gr = x.createRadialGradient(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 0, 64 + Math.cos(a) * r, 64 + Math.sin(a) * r, s); gr.addColorStop(0, `rgba(255,255,255,${0.25 + rnd() * 0.2})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); }
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 34); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  });
  cell(2, () => { // oil: a dark pool, a faint teal-and-amber sheen ring (never violet)
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 54); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr;
    x.beginPath(); for (let k = 0; k <= 24; k++) { const a = (k / 24) * 6.283, r = 40 + rnd() * 14; x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r * 0.8); } x.fill();
    x.globalCompositeOperation = 'source-atop'; x.lineWidth = 5;
    x.strokeStyle = 'rgba(90,150,140,0.55)'; x.beginPath(); x.ellipse(64, 64, 30, 22, 0.4, 0, 6.283); x.stroke();
    x.strokeStyle = 'rgba(190,150,70,0.45)'; x.beginPath(); x.ellipse(64, 64, 22, 15, 0.4, 0, 6.283); x.stroke();
  });
  cell(3, () => { // a bonfire ring: a ring of stones round charcoal and ash
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 40); gr.addColorStop(0, 'rgba(70,64,58,1)'); gr.addColorStop(0.55, 'rgba(40,36,32,0.95)'); gr.addColorStop(1, 'rgba(40,36,32,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 13; k++) { const a = (k / 13) * 6.283 + rnd() * 0.2, r = 42 + rnd() * 4, s = 7 + rnd() * 4; x.fillStyle = `rgb(${150 + rnd() * 40 | 0},${142 + rnd() * 36 | 0},${128 + rnd() * 30 | 0})`; x.beginPath(); x.ellipse(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, s, s * 0.8, a, 0, 6.283); x.fill(); }
    for (let k = 0; k < 9; k++) { x.fillStyle = 'rgba(20,16,12,0.9)'; x.save(); x.translate(64, 64); x.rotate(rnd() * 3.14); x.fillRect(-22, -2, 44, 4); x.restore(); }
  });
  cell(4, () => { // a blood trail: drops and smears along the cell
    for (let k = 0; k < 26; k++) { const y = rnd() * 128, xx = 64 + (rnd() - 0.5) * 30, s = 3 + rnd() * 9; x.fillStyle = `rgba(255,255,255,${0.5 + rnd() * 0.5})`; x.beginPath(); x.ellipse(xx, y, s * 0.6, s * (1 + rnd()), 0, 0, 6.283); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(56, 0, 16, 128);
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const CELL_OF = {}; for (const k of ['skid', 'scorch', 'oil', 'bonfire', 'blood']) CELL_OF[k] = DECALS[k].cell;
const SEED_CAP = 384;

// ---- the wear layer on a vehicle's body (a shader layer over the paint) ---------------------------------------------------
const WEAR_VERT_HEAD = 'attribute float part;\nvarying vec3 vWearP; varying vec3 vWearN; varying float vWearPart;\n';
const WEAR_VERT = '#include <begin_vertex>\nvWearP = position; vWearN = normal; vWearPart = part;';
const WEAR_FRAG_HEAD = `uniform vec4 uWear; uniform vec4 uScrape; uniform vec4 uDent; uniform vec3 uDustC; uniform vec3 uMudC; uniform vec3 uMetalC; uniform vec2 uBody;
varying vec3 vWearP; varying vec3 vWearN; varying float vWearPart;
float wHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wHash(i), wHash(i + vec3(1,0,0)), f.x), mix(wHash(i + vec3(0,1,0)), wHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wHash(i + vec3(0,0,1)), wHash(i + vec3(1,0,1)), f.x), mix(wHash(i + vec3(0,1,1)), wHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
// Travelled, never cheap (Robert loves the cars): the paint always shows through. Dust settles as a light patchy film on the
// tops and heavier low on the sides; mud is flung as specks round the wheel arches and over both ends (what the camera
// sees from above) and caked on the lower sides; a scrape is bright scored metal on the side or end it ran along; a dent
// dulls its zone. Glass and lamps stay clear (the glass is its own batch anyway: systems/carcombat.js).
const WEAR_FRAG = `#include <color_fragment>
float wearK = (abs(vWearPart - ${PART.glass.toFixed(1)}) < 0.5 || abs(vWearPart - ${PART.light.toFixed(1)}) < 0.5) ? 0.0 : 1.0;
vec3 wN = normalize(vWearN);
float wn = wNoise(vWearP * 2.3), wn2 = wNoise(vWearP * 7.9 + 3.0), wn3 = wNoise(vWearP * 23.0 + 7.0), wy = vWearP.y;
float top = smoothstep(0.55, 0.9, wN.y), side = 1.0 - top;
vec2 hb = max(uBody * 0.5, vec2(0.01));
float endZ = smoothstep(0.62, 0.98, abs(vWearP.z) / hb.y), edgeX = smoothstep(0.7, 0.98, abs(vWearP.x) / hb.x);
float arch = smoothstep(0.55, 0.0, abs(abs(vWearP.z) / hb.y - 0.62)) * edgeX;
float dustM = wearK * uWear.x * smoothstep(0.25, 0.75, wn * 0.65 + wn2 * 0.35 + uWear.x * 0.3 - 0.15) * (top * 0.38 + side * (0.35 + 0.4 * smoothstep(1.4, 0.3, wy)));
float speck = step(0.86 - uWear.y * 0.3, wn3 * 0.7 + wn2 * 0.3);
float mudM = wearK * uWear.y * max(side * smoothstep(0.85, 0.2, wy) * smoothstep(0.25, 0.6, wn2 + uWear.y * 0.3 - 0.1), speck * max(arch, endZ * 0.8) * (0.55 + 0.45 * wn));
vec4 zones = vec4(smoothstep(0.55, 0.95, vWearP.z / hb.y), smoothstep(0.55, 0.95, -vWearP.z / hb.y), smoothstep(0.6, 0.95, vWearP.x / hb.x), smoothstep(0.6, 0.95, -vWearP.x / hb.x));
vec4 faceK = vec4(step(0.6, wN.z), step(0.6, -wN.z), step(0.6, wN.x), step(0.6, -wN.x));
float scr = wearK * dot(uScrape * faceK, zones) * smoothstep(0.5, 0.8, fract((abs(wN.x) > 0.6 ? vWearP.y * 13.0 + vWearP.z * 0.6 : vWearP.y * 13.0 + vWearP.x * 0.6) + wn * 1.5)) * step(0.2, wy);
float dent = wearK * dot(uDent, zones);
diffuseColor.rgb = mix(diffuseColor.rgb, uDustC, clamp(dustM, 0.0, 1.0) * 0.6);
diffuseColor.rgb = mix(diffuseColor.rgb, uMudC, clamp(mudM, 0.0, 1.0) * 0.9);
diffuseColor.rgb = mix(diffuseColor.rgb, uMetalC, clamp(scr, 0.0, 1.0) * 0.8);
diffuseColor.rgb *= 1.0 - 0.16 * clamp(dent, 0.0, 1.0) * (0.6 + 0.4 * wn);`;
const WEAR_ROUGH = `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.95, clamp(dustM * 1.4 + mudM, 0.0, 1.0)); roughnessFactor = mix(roughnessFactor, 0.85, clamp(dent, 0.0, 1.0) * 0.5); roughnessFactor = mix(roughnessFactor, 0.3, clamp(scr, 0.0, 1.0));`;
const WEAR_METAL = `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.0, clamp(dustM + mudM, 0.0, 1.0)); metalnessFactor = mix(metalnessFactor, 0.85, clamp(scr, 0.0, 1.0));`;

export class LookFeel {
  constructor(g) {
    this.g = g;
    this.settings = { grade: 1, hitStop: 1, kick: 1, dirt: 1 };
    this.lamps = new LampLight(g); // headlights and the torch light the bodies standing in them (systems/lamplight.js)
    // ---- the grade pass
    const r = g.renderer;
    // The scene renders to the canvas exactly as it always has (tone mapping, sRGB and every additive glow blended where
    // they were authored); the finished frame is copied into this texture and the pass draws it back through the LUT. (A
    // linear HDR target changed how the glows add up: lamp pools and the flashlight came out bigger and brighter.)
    this.rt = new THREE.FramebufferTexture(4, 4);
    this.rt.name = 'look:frame'; this.rt.minFilter = this.rt.magFilter = THREE.NearestFilter; this.rt.generateMipmaps = false;
    this.lutData = new Uint8Array(N * N * N * 4);
    this.lut = new THREE.Data3DTexture(this.lutData, N, N, N);
    this.lut.format = THREE.RGBAFormat; this.lut.type = THREE.UnsignedByteType;
    this.lut.minFilter = this.lut.magFilter = THREE.LinearFilter; this.lut.wrapR = this.lut.wrapS = this.lut.wrapT = THREE.ClampToEdgeWrapping;
    this.lut.unpackAlignment = 1;
    this.passU = { tScene: { value: this.rt }, tLut: { value: this.lut }, uStrength: { value: 1 }, uDirt: { value: new THREE.Vector4(0, 0, 1, 0) } };
    this.passMat = new THREE.ShaderMaterial({
      uniforms: this.passU, depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `precision highp sampler3D;
uniform sampler2D tScene; uniform sampler3D tLut; uniform float uStrength; uniform vec4 uDirt; varying vec2 vUv;
float dHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float dNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(dHash(i), dHash(i + vec2(1, 0)), f.x), mix(dHash(i + vec2(0, 1)), dHash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb; // the finished frame, display space
  vec3 lc = texture(tLut, c * ${((N - 1) / N).toFixed(6)} + ${(0.5 / N).toFixed(6)}).rgb;
  c = mix(c, lc, uStrength);
  if (uDirt.x > 0.001) { // the screen-edge dirt: grit and a brown smear thrown up round the frame's edge
    vec2 q = (vUv - 0.5) * vec2(uDirt.z, 1.0) * 2.0; float e = smoothstep(0.55, 1.25, length(q));
    float n = dNoise(vUv * vec2(uDirt.z, 1.0) * 9.0 + uDirt.y) * 0.6 + dNoise(vUv * 31.0 + uDirt.y * 1.7) * 0.4;
    float k = clamp(e * smoothstep(0.35, 0.75, n + e * 0.3) * uDirt.x, 0.0, 0.85);
    c = mix(c, vec3(0.24, 0.18, 0.12), k);
  }
  gl_FragColor = vec4(c, 1.0);
}`,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.passMesh = new THREE.Mesh(tri, this.passMat); this.passMesh.frustumCulled = false;
    this.passScene = new THREE.Scene(); this.passScene.add(this.passMesh);
    this.passCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.blend = { weights: {}, time: {}, grade: blank(), sig: new Float32Array(16).fill(-9), at: { x: NaN, z: NaN, hour: NaN } };
    this.scratch = { a: blank(), b: blank(), out: [0, 0, 0] };
    this.gradeT = 0; this.rebuilds = 0; this.lastBuildMs = 0;
    this.bakeLut(this.blend.grade);
    this.passMs = 0; this.on = true;

    // ---- wind
    this.windStrength = 0; this.windWeather = 1; this.patchedWind = 0; this.windTargets = new WeakSet();

    // ---- history decals
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.aCell = new THREE.InstancedBufferAttribute(new Float32Array(DECALS.pool * 2), 2).setUsage(THREE.DynamicDrawUsage); // cell, alpha
    geo.setAttribute('aCell', this.aCell);
    const dm = new THREE.MeshLambertMaterial({ map: historyAtlas(), transparent: true });
    dm.userData.noCut = true;
    dm.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell; varying float vAlpha;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vec2((mod(aCell.x, 4.0) + uv.x) / 4.0, (1.0 - floor(aCell.x / 4.0)) * 0.5 + uv.y * 0.5);\n#endif\nvAlpha = aCell.y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vAlpha;');
    };
    dm.customProgramCacheKey = () => 'look-history';
    this.hist = layerMesh(new THREE.InstancedMesh(geo, dm, DECALS.pool), 'groundDecal');
    this.hist.name = 'look:history'; this.hist.frustumCulled = false; this.hist.receiveShadow = true;
    for (let i = 0; i < DECALS.pool; i++) { this.hist.setMatrixAt(i, ZERO); this.hist.setColorAt(i, _c.set(0, 0, 0)); }
    this.hist.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.scene.add(this.hist);
    this.dKind = new Uint8Array(DECALS.pool); this.dBorn = new Float32Array(DECALS.pool); this.dLife = new Float32Array(DECALS.pool); this.dA = new Float32Array(DECALS.pool);
    this.dX = new Float32Array(DECALS.pool); this.dZ = new Float32Array(DECALS.pool);
    this.evNext = SEED_CAP; this.seedFree = []; for (let i = SEED_CAP - 1; i >= 0; i--) this.seedFree.push(i);
    this.stories = new Map(); // cell key -> { slots, kind, x, z }
    this.hours = 0; this.fadeT = 0; this.seedT = 0; this.evT = 0; this.counts = { skid: 0, scorch: 0, oil: 0, bonfire: 0, blood: 0 };
    this.lastDecal = null;

    // ---- impact
    this.stopT = 0; this.stopMs = 0; this.lastStop = null; this.stops = 0;
    this.kick = { x: 0, z: 0 }; this.dirt = 0; this.dirtSeed = 0; this.lastKick = null;
    if (g.fx) g.fx.onBlast = (x, z) => this.onBlast(x, z); // fx.explosion's one hook

    // ---- wear
    this.dustC = new THREE.Color(WEAR.dustColor); this.mudC = new THREE.Color(WEAR.mudColor); this.metalC = new THREE.Color(WEAR.metal);
    this.wearT = 0; this.sparks = 0; this.wearRate = 1; // wearRate: a test knob (a check drives a minute's worth in seconds)
  }

  // ======== the grade ========================================================================================================
  // The region weights round (x, z): the state map sampled on a ring (data/looks.js GRADE.ring), the centre counting double.
  regionWeights(x, z, out = {}) {
    const W = this.g.streamer?.W;
    for (const k of REGION_IDS) out[k] = 0;
    const add = (px, pz, w) => { const s = W?.stateAt ? W.stateAt(px, pz) : null; out[regionOfState(s)] += w; };
    add(x, z, 1);
    for (let i = 0; i < GRADE.ringN; i++) { const a = (i / GRADE.ringN) * 6.2832, b = a + Math.PI / GRADE.ringN; add(x + Math.cos(a) * GRADE.ring, z + Math.sin(a) * GRADE.ring, 1); add(x + Math.cos(b) * GRADE.ring * 0.5, z + Math.sin(b) * GRADE.ring * 0.5, 1); }
    const tot = 1 + 2 * GRADE.ringN;
    for (const k of REGION_IDS) out[k] /= tot;
    return out;
  }
  // The blended grade at (x, z, hour): sum over regions x times of compose(region, time).
  gradeAt(x, z, hour, out = blank(), weights = null, tw = null) {
    const wr = weights ?? this.regionWeights(x, z, {}), wt = tw ?? timeWeights(hour, {});
    const acc = out; acc.temp = acc.tint = acc.bleach = 0; acc.sat = acc.con = acc.gamma = 0; acc.lift.fill(0); acc.gain.fill(0);
    const c = this.scratch.a;
    for (const rk of REGION_IDS) {
      const wR = wr[rk]; if (!(wR > 0)) continue;
      for (const tk of TIME_IDS) {
        const w = wR * wt[tk]; if (!(w > 0)) continue;
        composeGrade(LOOK_REGIONS[rk].grade, TIME_GRADES[tk].grade, 1, c);
        acc.temp += c.temp * w; acc.tint += c.tint * w; acc.bleach += c.bleach * w; acc.sat += c.sat * w; acc.con += c.con * w; acc.gamma += c.gamma * w;
        for (let i = 0; i < 3; i++) { acc.lift[i] += c.lift[i] * w; acc.gain[i] += c.gain[i] * w; }
      }
    }
    return acc;
  }
  sigOf(G, s) { s[0] = G.temp; s[1] = G.tint; s[2] = G.sat; s[3] = G.con; s[4] = G.gamma; s[5] = G.bleach; for (let i = 0; i < 3; i++) { s[6 + i] = G.lift[i]; s[9 + i] = G.gain[i]; } return s; }
  bakeLut(G) {
    const t0 = performance.now(), d = this.lutData, o = this.scratch.out;
    let i = 0;
    for (let b = 0; b < N; b++) for (let gg = 0; gg < N; gg++) for (let r = 0; r < N; r++) {
      applyGrade(G, r / (N - 1), gg / (N - 1), b / (N - 1), o);
      d[i++] = Math.round(o[0] * 255); d[i++] = Math.round(o[1] * 255); d[i++] = Math.round(o[2] * 255); d[i++] = 255;
    }
    this.lut.needsUpdate = true;
    this.rebuilds++; this.lastBuildMs = performance.now() - t0;
  }
  updateGrade(dt, force = false) {
    const g = this.g;
    if ((this.gradeT -= dt) > 0 && !force) return;
    this.gradeT = GRADE.rebuildS;
    const B = this.blend, L = g.camLook ?? g.player;
    B.at.x = L.x; B.at.z = L.z; B.at.hour = g.sky.time;
    this.regionWeights(L.x, L.z, B.weights); timeWeights(g.sky.time, B.time);
    const G = this.gradeAt(L.x, L.z, g.sky.time, this.scratch.b, B.weights, B.time);
    const s = this.sigOf(G, _sig);
    let moved = 0; for (let i = 0; i < 12; i++) moved = Math.max(moved, Math.abs(s[i] - B.sig[i]));
    if (moved > GRADE.eps || force) {
      B.sig.set(s); Object.assign(B.grade, { ...G, lift: [...G.lift], gain: [...G.gain] });
      this.bakeLut(B.grade);
    }
  }
  strength() { const below = this.g.sky.below ?? 0; return GRADE.strength * this.settings.grade * (1 - 0.6 * below) * (this.g.kit?.gradeMul() ?? 1); } // goggles and the heat scope make their own picture (systems/kit.js)

  // The frame (main.js render; the screenshot command). Without the grade and the dirt it is the plain render.
  render(cam = this.g.camera) {
    const g = this.g, r = g.renderer;
    const st = this.strength(), dirt = this.dirt * this.settings.dirt;
    if (!this.on || (st <= 0.001 && dirt <= 0.001)) { r.render(g.scene, cam); return; }
    r.getDrawingBufferSize(_v2);
    if (this.rt.image.width !== _v2.x || this.rt.image.height !== _v2.y) { this.rt.dispose(); this.rt = new THREE.FramebufferTexture(_v2.x, _v2.y); this.rt.name = 'look:frame'; this.rt.minFilter = this.rt.magFilter = THREE.NearestFilter; this.rt.generateMipmaps = false; this.passU.tScene.value = this.rt; }
    this.passU.uStrength.value = st;
    this.passU.uDirt.value.set(Math.min(1, dirt), this.dirtSeed, _v2.x / Math.max(1, _v2.y), 0);
    r.render(g.scene, cam);
    _v0.set(0, 0); r.copyFramebufferToTexture(this.rt, _v0);
    // The counters (perf, the stress gate) keep their meaning: the scene's calls (three counts from after its shadow pass)
    // plus this pass's one.
    const I = r.info.render, calls = I.calls, tris = I.triangles;
    const ac = r.autoClear; r.autoClear = false; r.render(this.passScene, this.passCam); r.autoClear = ac;
    I.calls += calls; I.triangles += tris;
  }

  // ======== the horizon ======================================================================================================
  // The highest a frame's top edge can look (degrees above the horizontal; negative = below it) in any view: the boom's
  // pitch plus half the vertical field, capped by the camera law (data/camera.js thetaSum). A band is visible only if > 0.
  horizonVisible(CAMERA) {
    const top = Math.min(CAMERA.thetaSum, Math.max(CAMERA.view.TOPDOWN.theta, CAMERA.view.ANGLED.foot.thetaClose, CAMERA.view.ANGLED.drive.thetaClose, CAMERA.view.ISO.theta, CAMERA.view.CHASE.theta) + CAMERA.vfov / 2);
    return { topEdgeOffVertical: top, aboveHorizontal: top - 90, visible: top > 90 };
  }
  horizonOf(regionId) { const R = LOOK_REGIONS[regionId]; return R ? { id: R.horizon, ...HORIZONS[R.horizon] } : null; }

  // ======== wind =============================================================================================================
  // Patch what sways (idempotent): every flora species (a material of its own for its stiffness), the streamed bushes, and
  // the cloth rule on the shared box batches (streamed props, citygen's batch).
  patchWind() {
    const g = this.g, F = g.world?.flora;
    if (F?.pools) for (const [kind, pool] of Object.entries(F.pools)) {
      const m = pool.mesh; if (this.windTargets.has(m)) continue;
      // A material of its own per species (its stiffness), cloned clean: the flora's variant patch, then the wind (the
      // cutaway patches it on its next scan, as it does every lit material).
      const base = F.material.clone(); base.onBeforeCompile = variantPatch; base.customProgramCacheKey = () => 'flora-variant';
      const mat = windPatch(base, STIFF[kind] ?? 1, WIND_VERT, 'wind-flora');
      const db = F.depthMaterial.clone(); db.onBeforeCompile = variantPatch; db.customProgramCacheKey = () => 'flora-variant-depth';
      const dep = windPatch(db, STIFF[kind] ?? 1, WIND_VERT, 'wind-flora-d');
      m.material = mat; m.customDepthMaterial = dep; this.windTargets.add(m); this.patchedWind++;
    }
    const P = g.streamer?.pools;
    if (P?.shrubs && !this.windTargets.has(P.shrubs.mesh)) { windPatch(P.shrubs.mesh.material, 3.5, WIND_VERT, 'wind-bush'); this.windTargets.add(P.shrubs.mesh); this.patchedWind++; }
    if (P?.props && !this.windTargets.has(P.props.mesh)) { windPatch(P.props.mesh.material, 1, CLOTH_VERT, 'wind-cloth'); this.windTargets.add(P.props.mesh); this.patchedWind++; }
    const cg = g.citygen?.mesh;
    if (cg && !this.windTargets.has(cg)) { windPatch(cg.material, 1, CLOTH_VERT, 'wind-cloth'); this.windTargets.add(cg); this.patchedWind++; }
  }
  windNow() {
    const g = this.g, B = this.blend.weights;
    let reg = 0, tot = 0;
    for (const k of REGION_IDS) { const w = B[k] ?? 0; reg += w * LOOK_REGIONS[k].wind; tot += w; }
    return { region: tot > 0 ? reg / tot : 1, weather: this.windWeather };
  }
  updateWind(dt) {
    const g = this.g, sky = g.sky;
    const wT = WIND.weather[sky.weatherKey] ?? 1;
    this.windWeather += (wT - this.windWeather) * (1 - Math.exp(-dt / 2.5));
    const B = this.blend.weights; let reg = 0, tot = 0;
    for (let i = 0; i < REGION_IDS.length; i++) { const w = B[REGION_IDS[i]] ?? 0; reg += w * LOOK_REGIONS[REGION_IDS[i]].wind; tot += w; }
    const wx = sky.windX ?? 6, wz = sky.windZ ?? 2, l = Math.hypot(wx, wz) || 1;
    this.windStrength = WIND.base * (tot > 0 ? reg / tot : 1) * this.windWeather * (g.player?.ug ? 0 : 1);
    U.uWind.value.set(wx / l, wz / l, this.windStrength, g.time ?? 0);
  }

  // ======== history decals ===================================================================================================
  // Lay one: kind (a DECALS row), at (x, z), turned rot, scaled s (x the row's size; a skid's length l), alpha a, seed slot.
  put(kind, x, z, rot = 0, s = 1, a = 1, slot = -1, len = 1) {
    const D = DECALS[kind]; if (!D) return -1;
    const i = slot >= 0 ? slot : this.evNext;
    if (slot < 0) this.evNext = this.evNext + 1 >= DECALS.pool ? SEED_CAP : this.evNext + 1;
    const G = this.g.fx?.ground, y = (G ? G(x, z) : 0) + DECAL_Y + 0.004 + (D.cell % 4) * 0.003 + (i % 5) * 0.0008; // over every floor and rug (engine/depthlayers.js DECAL_Y), a hair per kind, never y = 0
    _o.position.set(x, y, z); _o.rotation.set(0, rot, 0); _o.scale.set(D.w * s, 1, D.l * s * len); _o.updateMatrix();
    this.hist.setMatrixAt(i, _o.matrix); this.hist.setColorAt(i, _c.set(D.color));
    this.aCell.array[i * 2] = D.cell; this.aCell.array[i * 2 + 1] = D.opacity * a;
    this.dKind[i] = D.cell + 1; this.dBorn[i] = this.hours; this.dLife[i] = D.life; this.dA[i] = D.opacity * a; this.dX[i] = x; this.dZ[i] = z;
    this.hist.instanceMatrix.needsUpdate = true; this.hist.instanceColor.needsUpdate = true; this.aCell.needsUpdate = true;
    this.counts[kind]++; if (slot < 0) this.lastDecal = { kind, x: +x.toFixed(1), z: +z.toFixed(1), slot: i }; // (an event's; the seeded stories list themselves)
    return i;
  }
  clearSlot(i) { this.hist.setMatrixAt(i, ZERO); this.dKind[i] = 0; this.aCell.array[i * 2 + 1] = 0; this.hist.instanceMatrix.needsUpdate = true; this.aCell.needsUpdate = true; }
  // A public hook for other systems (the site-story lane's history when it lands): a story's mark at a place.
  history(kind, x, z, opts = {}) { return this.put(kind, x, z, opts.rot ?? Math.random() * 6.283, opts.size ?? 1, opts.alpha ?? 1, -1, opts.len ?? 1); }
  // Skid marks behind a car's rear wheels.
  skidMarks(v, a = 1) {
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    for (const s of [-1, 1]) this.put('skid', v.x - fx * v.len * 0.35 + fz * s * v.wid * 0.4, v.z - fz * v.len * 0.35 - fx * s * v.wid * 0.4, v.h, 1, a, -1, 1);
  }
  regionDecal(kind) { const B = this.blend.weights; let m = 0, t = 0; for (const k of REGION_IDS) { const w = B[k] ?? 0; m += w * (LOOK_REGIONS[k].decals?.[kind] ?? 1); t += w; } return t > 0 ? m / t : 1; }

  // Events: hard stops lay skids, leaking cars drip oil, the bleeding leave a trail. ~4 Hz over what is near the view.
  updateEvents(dt) {
    const g = this.g, L = g.camLook ?? g.player;
    for (const v of g.vehicles) {
      if (v.dead || v.boat || v.air || Math.abs(v.x - L.x) > 160 || Math.abs(v.z - L.z) > 160) { v._lfSp = undefined; continue; }
      const sp = Math.hypot(v.vx, v.vz), prev = v._lfSp ?? sp;
      v._lfSp = sp;
      if (dt > 0 && prev > DECALS.brakeMin && (prev - sp) / dt > DECALS.brakeDecel && !v.bike) {
        v._lfOdo = (v._lfOdo ?? 0) + sp * dt;
        if (v._lfOdo > DECALS.step) { v._lfOdo = 0; this.skidMarks(v, Math.min(1, 0.55 + (prev - sp) / dt / 30)); }
      }
      const d = v.dmg;
      if (d && (d.tank < 0.6 || d.radiator < 0.5)) {
        v._lfDrip = (v._lfDrip ?? DECALS.dripS) - dt;
        if (v._lfDrip <= 0) { v._lfDrip = DECALS.dripS * (sp > 3 ? 0.6 : 1.6); this.put('oil', v.x + (Math.random() - 0.5) * 0.6, v.z + (Math.random() - 0.5) * 0.6, Math.random() * 6.283, sp > 3 ? 0.35 : 0.6 + Math.random() * 0.4, 0.8); }
      }
    }
    if ((this.evT -= dt) > 0) return;
    this.evT = 0.25;
    for (const c of g.chars) {
      if (!c.alive || !(c.bleed > 0.25) || c.inVehicle || Math.abs(c.x - L.x) > 120 || Math.abs(c.z - L.z) > 120) continue;
      const lx = c._lfX ?? c.x, lz = c._lfZ ?? c.z, dd = Math.hypot(c.x - lx, c.z - lz);
      if (dd >= DECALS.trailM) { this.put('blood', (c.x + lx) / 2, (c.z + lz) / 2, Math.atan2(c.x - lx, c.z - lz), 0.8 + c.bleed * 0.5, 0.6 + c.bleed * 0.4, -1, dd / DECALS.blood.l); c._lfX = c.x; c._lfZ = c.z; }
      else if (c._lfX === undefined) { c._lfX = c.x; c._lfZ = c.z; }
    }
  }
  // Fades (a game-hour clock) once a second.
  updateFade(dt) {
    const sky = this.g.sky;
    this.hours += dt * sky.timeScale * (sky.fast ? 40 : 1);
    if ((this.fadeT -= dt) > 0) return;
    this.fadeT = 1;
    let dirty = false;
    for (let i = 0; i < DECALS.pool; i++) {
      if (!this.dKind[i] || !(this.dLife[i] > 0)) continue;
      const age = (this.hours - this.dBorn[i]) / this.dLife[i];
      if (age >= 1) { this.clearSlot(i); continue; }
      const row = KIND_ROW[this.dKind[i] - 1], f = row?.fade ?? 0.3;
      const a = this.dA[i] * Math.min(1, (1 - age) / f);
      if (Math.abs(this.aCell.array[i * 2 + 1] - a) > 0.01) { this.aCell.array[i * 2 + 1] = a; dirty = true; }
    }
    if (dirty) this.aCell.needsUpdate = true;
  }
  // Seeded history: per DECALS.cell, a pure roll from the cell (no RNG stream touched). Laid while the cell is within
  // DECALS.radius of the view, its slots given back when it leaves (it comes back the same when you return).
  updateSeeds(dt, force = false) {
    if ((this.seedT -= dt) > 0 && !force) return;
    this.seedT = 0.5;
    const g = this.g, W = g.streamer?.W, L = g.camLook ?? g.player, C = DECALS.cell;
    if (!W) return;
    for (const [k, st] of this.stories) if (Math.hypot(st.x - L.x, st.z - L.z) > DECALS.radius * 1.5) { for (const i of st.slots) { this.clearSlot(i); this.seedFree.push(i); } this.stories.delete(k); }
    this.seedFromSites(L);
    const r = Math.ceil(DECALS.radius / C), cx0 = Math.floor(L.x / C), cz0 = Math.floor(L.z / C);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const cx = cx0 + a, cz = cz0 + b, key = `${cx},${cz}`;
      if (this.stories.has(key) || this.stories.size >= DECALS.maxStories) continue;
      const mx = (cx + 0.5) * C, mz = (cz + 0.5) * C;
      if (Math.hypot(mx - L.x, mz - L.z) > DECALS.radius) continue;
      const h = cellHash(cx, cz);
      const st = this.seedStory(W, cx, cz, mx, mz, h);
      this.stories.set(key, st ?? { slots: [], kind: null, x: mx, z: mz });
    }
  }
  // SITE STORIES' history (systems/sitestories.js, g.stories): a place raided in the last DECALS.raidHours or fallen shows
  // it on the ground (scorch where it burned, blood dragged off, tyre tracks where the raiders' cars wheeled about); a
  // refugee or raider camp has its bonfire ring. Keyed by the place's state: when it changes, the marks are laid again.
  seedFromSites(L) {
    const S = this.g.stories; if (!S?.places) return;
    const now = S.hours?.() ?? 0, R2 = DECALS.radius;
    for (const [k, st] of this.stories) if (st.site && !S.places.has(st.site)) { for (const i of st.slots) { this.clearSlot(i); this.seedFree.push(i); } this.stories.delete(k); } // a place that is gone
    for (const p of S.places.values()) {
      if (Math.abs(p.x - L.x) > R2 + 60 || Math.abs(p.z - L.z) > R2 + 60) continue;
      const raided = p.fallen || (p.raidedAt !== null && p.raidedAt !== undefined && now - p.raidedAt < DECALS.raidHours);
      const camp = p.kind === 'refuge' || !!p.camp;
      const want = raided ? `raid:${p.fallen ? 'f' : ''}${Math.round(p.raidedAt ?? 0)}` : camp ? 'camp' : null, key = `site:${p.id}`;
      const had = this.stories.get(key);
      if (had && had.state === want) continue;
      if (had) { for (const i of had.slots) { this.clearSlot(i); this.seedFree.push(i); } this.stories.delete(key); }
      if (!want) continue;
      const rnd = rngOf((p.seed ?? cellHash(Math.round(p.x), Math.round(p.z))) ^ 0x5eed), slots = [];
      const take = (kind, x, z, rot, s, a, len = 1) => { const i = this.seedFree.pop(); if (i === undefined) return; this.put(kind, x, z, rot, s, a, i, len); this.dLife[i] = 0; slots.push(i); };
      const spread = Math.min(60, Math.max(14, (p.half ?? 40) * 0.4)), at = () => [p.x + (rnd() - 0.5) * 2 * spread, p.z + (rnd() - 0.5) * 2 * spread];
      if (raided) {
        for (let k = 0; k < (p.fallen ? 5 : 3); k++) { const [x, z] = at(); take('scorch', x, z, rnd() * 6.283, 0.7 + rnd() * 0.6, 0.9); }
        for (let k = 0; k < 3; k++) { const [x, z] = at(), a = rnd() * 6.283; for (let j = 0; j < 4; j++) take('blood', x + Math.sin(a) * j * 1.2, z + Math.cos(a) * j * 1.2, a, 1, 0.75 - j * 0.12, 1.4); }
        for (let k = 0; k < 4; k++) { const [x, z] = at(); let a = rnd() * 6.283; for (let j = 0; j < 6; j++) { a += (rnd() - 0.3) * 0.5; const ox = Math.cos(a) * 0.8, oz = -Math.sin(a) * 0.8, cx = x + Math.sin(a) * j * 1.6, cz = z + Math.cos(a) * j * 1.6; for (const w of [-1, 1]) take('skid', cx + ox * w, cz + oz * w, a, 1, 0.5, 1.5); } }
      } else {
        take('bonfire', p.x + 4, p.z + 3, rnd() * 6.283, 1, 1);
        take('scorch', p.x + 4, p.z + 3, rnd() * 6.283, 0.45, 0.5);
      }
      this.stories.set(key, { slots, kind: raided ? 'raided site' : 'site camp', state: want, x: p.x, z: p.z, at: { x: Math.round(p.x), z: Math.round(p.z) }, site: p.id });
    }
  }
  seedStory(W, cx, cz, mx, mz, h) {
    const rnd = rngOf(h), C = DECALS.cell, slots = [];
    const take = (kind, x, z, rot, s, a, len = 1) => { const i = this.seedFree.pop(); if (i === undefined) return; this.put(kind, x, z, rot, s, a, i, len); this.dLife[i] = 0; slots.push(i); };
    // A crash story beside a road: the car went off the shoulder here.
    if (rnd() < DECALS.roadStory * this.regionDecal('skid')) {
      const p0 = W.project ? W.project(mx, mz, C) : null, pa = W.projectAny ? W.projectAny(mx, mz, C) : null;
      const p = pa && pa.d < (p0?.d ?? Infinity) ? pa : p0;
      if (p && p.d < C * 0.7) {
        const cor = p.cor ?? W, f = cor.at(p.s), side = rnd() < 0.5 ? -1 : 1, dir = rnd() < 0.5 ? 1 : -1;
        const tx = f.tx * dir, tz = f.tz * dir, lane = 5 + rnd() * 4, out = 16 + rnd() * 10, len = 22 + rnd() * 14;
        // Two wheel tracks: straight in the lane, then bending out over the shoulder into the ditch.
        const n = 14, sx = f.x + f.nx * side * lane, sz = f.z + f.nz * side * lane;
        let px = sx, pz = sz;
        for (let k = 1; k <= n; k++) {
          const t = k / n, bend = t * t * (out - lane);
          const qx = sx + tx * len * t + f.nx * side * bend, qz = sz + tz * len * t + f.nz * side * bend;
          const rot = Math.atan2(qx - px, qz - pz), seg = Math.hypot(qx - px, qz - pz), ox = Math.cos(rot) * 0.8, oz = -Math.sin(rot) * 0.8;
          for (const w of [-1, 1]) take('skid', (px + qx) / 2 + ox * w, (pz + qz) / 2 + oz * w, rot, 1, 0.45 + 0.4 * (1 - t), seg / DECALS.skid.l);
          px = qx; pz = qz;
        }
        take('oil', px + f.nx * side * 1.5, pz + f.nz * side * 1.5, rnd() * 6.283, 1.3 + rnd(), 0.85);
        if (rnd() < 0.45 * this.regionDecal('scorch')) take('scorch', px + f.nx * side * 2, pz + f.nz * side * 2, rnd() * 6.283, 0.8 + rnd() * 0.5, 0.85);
        if (rnd() < 0.3 * this.regionDecal('blood')) { const bx = px + f.nx * side * 3, bz = pz + f.nz * side * 3; for (let k = 0; k < 4; k++) take('blood', bx + f.nx * side * k * 1.1, bz + f.nz * side * k * 1.1, Math.atan2(f.nx * side, f.nz * side), 1, 0.7 - k * 0.12, 1.4); }
        return { slots, kind: 'crash', x: mx, z: mz, at: { x: +px.toFixed(1), z: +pz.toFixed(1) }, road: cor.id ?? 'I-10' };
      }
    }
    // A camp's bonfire ring, near a town (people gathered outside the walls).
    if (rnd() < DECALS.campStory * this.regionDecal('bonfire') && W.towns?.length) {
      let near = Infinity; for (const t of W.towns) { const d = Math.hypot(t.x - mx, t.z - mz); if (d < near) near = d; }
      if (near > 120 && near < 900) {
        const x = mx + (rnd() - 0.5) * C * 0.6, z = mz + (rnd() - 0.5) * C * 0.6, P0 = W.project ? W.project(x, z, 40) : null;
        if (!P0 || P0.d > 30) {
          take('bonfire', x, z, rnd() * 6.283, 0.9 + rnd() * 0.4, 1);
          take('scorch', x, z, rnd() * 6.283, 0.5, 0.5);
          for (let k = 0; k < 3; k++) { const a = rnd() * 6.283; take('skid', x + Math.cos(a) * 7, z + Math.sin(a) * 7, a, 1, 0.35, 3); }
          return { slots, kind: 'camp', x: mx, z: mz, at: { x: +x.toFixed(1), z: +z.toFixed(1) } };
        }
      }
    }
    return slots.length ? { slots, kind: 'other', x: mx, z: mz } : null;
  }

  // ======== impact feel ======================================================================================================
  calibreOf(c) { const w = c?.weapon ? WEAPONS[c.weapon] : null; return IMPACT.calibre[w?.ammo] ?? IMPACT.calibre.default; }
  stop(ms, why) {
    const k = this.settings.hitStop; if (!(k > 0) || !(ms > 0)) return 0;
    const m = Math.min(IMPACT.maxStop, Math.max(IMPACT.minStop, ms)) * k;
    if (m / 1000 > this.stopT) { this.stopT = m / 1000; this.stopMs = m; }
    this.stops++; this.lastStop = { ms: Math.round(m), why };
    return m;
  }
  // main.js frame: the dt the sim runs at (a hit-stop slows it to a near freeze for its real milliseconds).
  warp(dt) {
    if (this.stopT <= 0) return dt;
    this.stopT -= dt;
    return dt * IMPACT.timeScale;
  }
  onShot(shooter, wkey, ang) {
    if (shooter !== this.g.player) return;
    const w = WEAPONS[wkey], C = IMPACT.calibre[w?.ammo] ?? IMPACT.calibre.default, k = C.kick * this.settings.kick;
    this.kick.x -= Math.sin(ang) * k; this.kick.z -= Math.cos(ang) * k;
    this.lastKick = { calibre: w?.ammo ?? 'default', m: +k.toFixed(3) };
  }
  onHit(c, dmg, attacker, cause) {
    const p = this.g.player;
    if (c !== p && attacker !== p) return;
    if (dmg < IMPACT.bigHit) return;
    const C = cause === 'bash' || cause === 'melee' ? { stop: 50 } : this.calibreOf(attacker);
    this.stop(Math.max(C.stop, IMPACT.minStop), `${cause} ${Math.round(dmg)}`);
  }
  onCrash(v, speed, o = null) {
    const p = this.g.player, mine = v.driver === p || p.inVehicle === v || (o && (o.driver === p || p.inVehicle === o));
    if (speed > IMPACT.crash.stopAt * 0.6) { this.skidMarks(v, 0.9); }
    if (!mine) return;
    if (speed >= IMPACT.crash.stopAt) this.stop(IMPACT.crash.stop, `crash ${speed.toFixed(1)} m/s`);
    if (speed >= IMPACT.crash.dirtAt) { this.dirt = Math.max(this.dirt, Math.min(1, IMPACT.crash.dirt * (speed / 20))); this.dirtSeed = Math.random() * 100; }
    // Cracked glass from the hit: the pane on the struck side takes a share of its strength.
    const cc = this.g.carCombat;
    if (cc && speed >= IMPACT.crash.dirtAt && v.windows && v._hitX !== undefined) {
      const side = cc.sideToward(v, v._hitX, v._hitZ), Wn = v.windows[side];
      if (Wn && Wn.hp > 0) cc.damageWindow(v, side, Wn.max * Math.min(0.6, speed / 40), null);
    }
  }
  onBlast(x, z) {
    this.put('scorch', x, z, Math.random() * 6.283, 1.1 + Math.random() * 0.4, 0.95);
    const p = this.g.player, d = Math.hypot(p.x - x, p.z - z);
    if (d < 30) { this.stop(IMPACT.explosion.stop * (1 - d / 40), 'blast'); const k = IMPACT.explosion.kick * this.settings.kick * (1 - d / 30), l = d || 1; this.kick.x += ((p.x - x) / l) * k; this.kick.z += ((p.z - z) / l) * k; }
  }
  updateImpact(dt) {
    const f = Math.exp(-dt * IMPACT.kickRecover);
    this.kick.x *= f; this.kick.z *= f;
    this.dirt = Math.max(0, this.dirt - dt / IMPACT.dirtFade);
  }

  // ======== vehicle wear =====================================================================================================
  dress(v) {
    const mat = v.mesh?.material; if (!mat || mat.userData.wear) return;
    const geo = v.mesh.geometry; geo.computeBoundingBox?.();
    const bb = geo.boundingBox, sx = bb ? bb.max.x - bb.min.x : v.wid, sz = bb ? bb.max.z - bb.min.z : v.len;
    const u = { uWear: { value: new THREE.Vector4(0, 0, 0, 0) }, uScrape: { value: new THREE.Vector4() }, uDent: { value: new THREE.Vector4() }, uDustC: { value: this.dustC }, uMudC: { value: this.mudC }, uMetalC: { value: this.metalC }, uBody: { value: new THREE.Vector2(sx, sz) } };
    mat.userData.wear = u;
    const hasPart = !!geo.attributes.part;
    if (!hasPart) geo.setAttribute('part', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = WEAR_VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', WEAR_VERT);
      sh.fragmentShader = WEAR_FRAG_HEAD + sh.fragmentShader.replace('#include <color_fragment>', WEAR_FRAG).replace('#include <roughnessmap_fragment>', WEAR_ROUGH).replace('#include <metalnessmap_fragment>', WEAR_METAL);
    };
    mat.customProgramCacheKey = () => 'dsoa-wear';
    mat.needsUpdate = true;
    v.grime ??= { dust: 0, mud: 0, scrape: [0, 0, 0, 0], surface: null }; // (v.wear is systems/upkeep.js's tyres, brakes, engine)
  }
  surfaceUnder(v) {
    const g = this.g, W = g.streamer?.W, sky = g.sky;
    if (g.water?.depthAt && g.water.depthAt(v.x, v.z) > 0.05) return 'mud';
    const wet = (sky.cur?.rain ?? 0) > 0.3;
    if (Math.abs(v.x) < HALF && Math.abs(v.z) < HALF) { // the Phoenix island: its streets are paved (main.js's footstep rule), the rest is sand
      let paved = false; for (let i = 0; i < roadLines.length; i++) if (Math.abs(v.z - roadLines[i]) < 7 || Math.abs(v.x - roadLines[i]) < 7) { paved = true; break; }
      return paved ? (wet ? 'wet' : 'road') : wet ? 'mud' : 'sand';
    }
    const p = W?.project ? W.project(v.x, v.z, 40) : null, pa = W?.projectAny ? W.projectAny(v.x, v.z, 40) : null;
    const d = Math.min(p?.d ?? Infinity, pa?.d ?? Infinity);
    if (d < 13) return wet ? 'wet' : 'road';
    const b = W?.biomeAt ? W.biomeAt(v.x, v.z) : 'd';
    const base = b === 's' || b === 'w' ? 'mud' : b === 'F' || b === 'f' || b === 'm' || b === 'p' ? 'grass' : b === 'd' || b === 'a' ? 'sand' : 'dirt';
    return wet && base !== 'mud' ? 'mud' : base;
  }
  updateWear(dt) {
    const g = this.g, L = g.camLook ?? g.player;
    this.wearT += dt;
    const step = this.wearT >= 0.25; if (step) this.wearT = 0;
    const rain = g.sky.cur?.rain ?? 0;
    for (const v of g.vehicles) {
      if (v.dead || !v.mesh) continue;
      const u = v.mesh.material.userData.wear; if (!u) { if (!v.dead) this.dress(v); continue; }
      if (Math.abs(v.x - L.x) > 220 || Math.abs(v.z - L.z) > 220) continue;
      const w = v.grime;
      if (step && !v.boat && !v.sheltered) { // sheltered: a car in a box trailer's hold (systems/semis.js)
        const sp = Math.hypot(v.vx, v.vz), k = Math.min(2, sp / 20) * 0.25 * this.wearRate; // per-second rows over a 0.25 s step, x speed / 20 m/s
        const s = (w.surface = this.surfaceUnder(v));
        if (sp > 2) { w.dust = clamp01(w.dust + (WEAR.dustBy[s] ?? 0) * k, WEAR.max.dust); w.mud = clamp01(w.mud + (WEAR.mudBy[s] ?? 0) * k, WEAR.max.mud); }
        if (rain > 0.3) { w.dust = Math.max(0, w.dust - WEAR.rainWash * 0.25 * rain); w.mud = Math.max(0, w.mud - WEAR.rainWash * 0.05 * rain); }
      }
      // Scrapes: a car sliding along a wall (systems/vehicles.js collide -> scrape(): the speed along it, where, which side).
      if (v._scrape > WEAR.scrapeAt) {
        const zi = SIDE_I[v._scrSide] ?? 2;
        w.scrape[zi] = Math.min(WEAR.max.scrape, w.scrape[zi] + WEAR.scrapeBy * dt * (v._scrape / 10));
        if ((v._sparkT = (v._sparkT ?? 0) - dt) <= 0) { v._sparkT = 0.05; g.fx.sparks(v._scrX, 0.6, v._scrZ, -v._scrNx, -v._scrNz, 4); this.sparks++; }
      }
      v._scrape = 0;
      const z = v.dmg?.zones;
      u.uWear.value.set(w.dust, w.mud, 0, 0);
      u.uScrape.value.set(w.scrape[0], w.scrape[1], w.scrape[2], w.scrape[3]);
      if (z) u.uDent.value.set(z.front, z.rear, z.left, z.right);
    }
  }
  clean(v) {
    if (!v?.grime) return false;
    v.grime.dust = 0; v.grime.mud = 0; v.grime.scrape.fill(0);
    const u = v.mesh?.material?.userData?.wear; if (u) { u.uWear.value.set(0, 0, 0, 0); u.uScrape.value.set(0, 0, 0, 0); }
    return true;
  }
  // systems/vehicles.js collide: a disc of v touching a wall at (x, z), the wall's normal (nx, nz) out toward the car.
  scrape(v, x, z, nx, nz) {
    const tan = Math.abs(-v.vx * nz + v.vz * nx);
    if (!(tan > (v._scrape ?? 0))) return;
    v._scrape = tan; v._scrX = x; v._scrZ = z; v._scrNx = nx; v._scrNz = nz;
    const L = this.g.vehDamage.toLocal(v, x, z); v._scrSide = this.g.vehDamage.zoneOfLocal(v, L.lx, L.lz);
  }
  wearView(v) {
    const w = v.grime ?? {};
    return { id: v.id, type: v.type, dust: r3(w.dust ?? 0), mud: r3(w.mud ?? 0), scrape: (w.scrape ?? [0, 0, 0, 0]).map(r3), surface: w.surface ?? null, dent: v.dmg ? Object.fromEntries(Object.entries(v.dmg.zones).map(([k, x]) => [k, r3(x)])) : null, glass: v.windows ? Object.fromEntries(Object.entries(v.windows).map(([k, x]) => [k, r3(x.hp / x.max)])) : null, dressed: !!v.mesh?.material?.userData?.wear };
  }

  // ======== the frame ========================================================================================================
  update(dt) {
    this.updateGrade(dt);
    this.updateWind(dt);
    this.updateImpact(dt);
    if (dt > 0) { this.updateEvents(dt); this.updateFade(dt); this.updateSeeds(dt); this.updateWear(dt); }
    this.lamps.update();
    if ((this.windScanT = (this.windScanT ?? 0) - dt) <= 0) { this.windScanT = 2; this.patchWind(); this.lamps.patch(); }
  }

  view() {
    const B = this.blend, top = Object.entries(B.weights).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).map(([k, w]) => ({ region: k, w: r3(w) }));
    return {
      settings: { ...this.settings },
      grade: { on: this.on, strength: r3(this.strength()), at: { x: Math.round(B.at.x), z: Math.round(B.at.z), hour: r3(B.at.hour) }, regions: top, time: Object.fromEntries(Object.entries(B.time).map(([k, w]) => [k, r3(w)])),
        params: { temp: r3(B.grade.temp), tint: r3(B.grade.tint), sat: r3(B.grade.sat), con: r3(B.grade.con), gamma: r3(B.grade.gamma), bleach: r3(B.grade.bleach), lift: B.grade.lift.map(r3), gain: B.grade.gain.map(r3) },
        lut: N, rebuilds: this.rebuilds, lastBuildMs: r3(this.lastBuildMs), frame: `${this.rt.image.width}x${this.rt.image.height}` },
      wind: { strength: r3(this.windStrength), weather: r3(this.windWeather), ...this.windNow(), patched: this.patchedWind },
      decals: { counts: { ...this.counts }, stories: [...this.stories.values()].filter((s) => s.kind).map((s) => ({ kind: s.kind, at: s.at, road: s.road, site: s.site })), seededSlots: SEED_CAP - this.seedFree.length, last: this.lastDecal },
      lamps: this.lamps.view(),
      impact: { stops: this.stops, lastStop: this.lastStop, lastKick: this.lastKick, dirt: r3(this.dirt), kick: { x: r3(this.kick.x), z: r3(this.kick.z) } },
    };
  }
}

const _sig = new Float32Array(16);
const KIND_ROW = ['skid', 'scorch', 'oil', 'bonfire', 'blood'].map((k) => DECALS[k]);
const SIDE_I = { front: 0, rear: 1, left: 2, right: 3 };
const clamp01 = (v, m = 1) => Math.max(0, Math.min(m, v));
const r3 = (v) => +(+v).toFixed(3);
function cellHash(cx, cz) {
  let h = Math.imul(cx | 0, 0x27d4eb2d) ^ Math.imul(cz | 0, 0x165667b1) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
function rngOf(seed) { let s = seed || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
