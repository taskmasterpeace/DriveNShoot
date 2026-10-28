import * as THREE from 'three';
import { SWELL, WAVES, KIND_OF_WK, KIND_OF_L1 } from '../data/waves.js';
import { WATER } from '../data/water.js';
import { regionAt, regionWater } from './regions.js';
import { RIVER as ISLAND_RIVER, LAKE as ISLAND_LAKE } from './water.js';

// WAVES (docs/design/WEB_WATER_LIFE.md; rows in data/waves.js). One sum of Gerstner waves, evaluated twice from the
// same rows: on the GPU, where it lifts every water sheet (the streamed world's region and L1 sheets through world/
// water.js streamMat, the island's river and lake through its mat) and shades every pixel of it (slopes, crest light,
// whitecaps where the surface pinches, surf bands in the shallows, Beer-Lambert absorption by depth); and here, in
// waveAt(x, z, t), where hulls sample it (ride: bow, stern, port, starboard -> heave, pitch, roll; a waterbike leaves a
// crest it takes fast enough). depthAt stays THE water authority (dry | wade | swim); waveAt only says how the surface
// over that depth is moving. Wakes and splashes are one pooled InstancedMesh of foam puffs.
//
// The GPU lifts the sheet with the long components only (a 4 m sheet cannot carry a 5 m wave: it would alias); the
// pixel shader and waveAt use all of them, so the light, the foam and the hull all see the chop.

const TAU = Math.PI * 2;
const KINDS = ['ocean', 'lagoon', 'lake', 'river', 'canal', 'swamp'];
const KI = Object.fromEntries(KINDS.map((k, i) => [k, i]));
const N = SWELL.length;
const OCEAN_AMP = WAVES.kind.ocean.amp;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

// The components, precomputed: wave vector, angular speed, phase, amplitude share, the horizontal (Gerstner) reach and
// whether the 4 m sheet carries it. Steepness is budgeted so q x share over the sum is qBudget: a crest never folds.
const QS = SWELL.reduce((s, w) => s + w.q * w.a, 0);
const COMP = SWELL.map((w, i) => {
  const k = TAU / w.L;
  return { kx: k * Math.sin(w.dir), kz: k * Math.cos(w.dir), k, om: Math.sqrt(9.81 * k) * WAVES.speedK, ph: i * 1.731 + 0.4, a: w.a,
    st: (w.q * w.a * WAVES.qBudget) / QS, vert: w.L >= 16, short: i >= 2 };
});

// Allocation-free answers.
const _k = { kind: null, depth: 0 }, _rw = { d: 0, k: 0, s: 0 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

// The GLSL both sheets share: the components as uniforms, the kind's amp/chop/shoal/foam, noise for the foam's lace.
const GLSL_COMMON = /* glsl */`
uniform float uWT, uWhite, uCrest, uShoreFoam, uShoreBands, uOceanAmp;
uniform vec4 uWC[${N}];   // kx, kz, omega, phase
uniform vec4 uWS[${N}];   // share, steep, carried by the sheet (1/0), short (1/0)
uniform float uKA[6], uKC[6], uKS[6], uKF[6];
uniform vec3 uWFoam;
uniform vec3 uIsleLake;   // the island lake: x, z, r (its depth is analytic)
uniform vec4 uCalm[4];    // still water round a key: x, z, r, ramp (systems/waterplace.js)
float wwCalm(vec2 p) { float k = 1.0; for (int i = 0; i < 4; i++) { if (uCalm[i].z <= 0.0) continue; k *= smoothstep(uCalm[i].z, uCalm[i].z + uCalm[i].w, length(p - uCalm[i].xy)); } return k; }
float wwH(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float wwN(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f); return mix(mix(wwH(i), wwH(i + vec2(1.0, 0.0)), f.x), mix(wwH(i + vec2(0.0, 1.0)), wwH(i + 1.0), f.x), f.y); }
float wwF(vec2 q) { return wwN(q) * 0.55 + wwN(q * 2.13 + 7.1) * 0.3 + wwN(q * 4.7 - 3.3) * 0.15; }
`;
// Which kind a sheet's vertex is (world/chunkgen.js vertex colours: blue 1 wash bed, 0.4 + k/100 a region's water,
// 0.1-0.35 an L1 lake, below that an L1 river); -1 = no waves (a dry wash's bed).
const GLSL_KIND_STREAM = /* glsl */`
int wwKind(vec3 c) {
  if (c.b > 0.95) return -1;
  if (c.b > 0.35) { int k = int(floor((c.b - 0.4) * 100.0 + 0.5)); return k >= 4 ? 0 : k == 3 ? 1 : k == 2 ? 4 : 5; }
  if (c.b > 0.1) return 2;
  return 3;
}`;
const GLSL_KIND_ISLAND = /* glsl */`
int wwKind(vec3 c) { return 2; }`;

export class Waves {
  constructor(game) {
    this.g = game;
    game.waves = this;
    this.t = 0;
    this.sea = 1;           // the sea state (weather), x every kind's amp
    this.stats = { puffs: 0, splashes: 0, airs: 0, rides: 0 };
    this.lastAir = null;
    // Uniforms (shared by every water material: one set, written once a frame).
    const arr = (n) => new Array(n).fill(0);
    this.U = {
      uWT: { value: 0 }, uWhite: { value: WAVES.whitecap }, uCrest: { value: WAVES.crestLift }, uShoreFoam: { value: WAVES.shoreFoam },
      uShoreBands: { value: WAVES.shoreBands }, uOceanAmp: { value: OCEAN_AMP },
      uWC: { value: COMP.map((c) => new THREE.Vector4(c.kx, c.kz, c.om, c.ph)) },
      uWS: { value: COMP.map((c) => new THREE.Vector4(c.a, c.st, c.vert ? 1 : 0, c.short ? 1 : 0)) },
      uKA: { value: arr(6) }, uKC: { value: KINDS.map((k) => WAVES.kind[k].chop) }, uKS: { value: KINDS.map((k) => WAVES.kind[k].shoal) },
      uKF: { value: KINDS.map((k) => WAVES.kind[k].foam) }, uWFoam: { value: new THREE.Color('#e9f1ee') },
      uIsleLake: { value: new THREE.Vector3(ISLAND_LAKE.x, ISLAND_LAKE.z, ISLAND_LAKE.r) },
      uAbsO: { value: WAVES.absorb.ocean }, uAbsL: { value: WAVES.absorb.lagoon },
      uCalm: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 1)) },
    };
    this.setSea(1);
    this.calm = []; // still-water discs { x, z, r, ramp } (a key in open water: systems/waterplace.js); the shader takes 4
    const W = game.water;
    if (W?.streamMat) this.install(W.streamMat, 'stream');
    if (W?.mat) this.install(W.mat, 'island');
    this.buildWake(game.scene);
  }

  // ---- the sum (JS side: the same rows as the shader) -----------------------------------------------------------------
  setSea(k) {
    this.sea = k;
    const A = this.U.uKA.value;
    for (let i = 0; i < 6; i++) A[i] = WAVES.kind[KINDS[i]].amp * k;
  }
  // The water kind and depth at (x, z): the island's own lake and river, a region's water (Florida's sea, lagoon,
  // canals, sloughs), L1's rows; the deeper wins, as in depthAt. null kind: dry, or a dry wash.
  kindAt(x, z, out = _k) {
    out.kind = null; out.depth = 0;
    const g = this.g;
    if (Math.abs(x) <= 464 && Math.abs(z) <= 464) {
      const d = g.water?.depthAt(x, z, true) ?? 0;
      if (d > 0) { out.depth = d; out.kind = Math.hypot(x - ISLAND_LAKE.x, z - ISLAND_LAKE.z) < ISLAND_LAKE.r + 2 ? 'lake' : 'river'; }
      return out;
    }
    const WI = g.streamer?.W;
    if (!WI) return out;
    const Rg = WI.regions ? regionAt(WI.regions, x, z) : null;
    if (Rg?.water) { regionWater(Rg, x, z, _rw); if (_rw.d > 0) { out.depth = _rw.d; out.kind = KIND_OF_WK[_rw.k] ?? 'lagoon'; } }
    const Rv = WI.water;
    if (Rv) {
      const q = Rv.sample(x, z);
      if (q.depth > out.depth) { const kk = KIND_OF_L1[q.body?.kind ?? q.kind]; if (kk) { out.depth = q.depth; out.kind = kk; } }
    }
    return out;
  }
  // The amplitude here: the kind's, times the sea state, faded in from the shore over the kind's shoal depth.
  ampAt(kind, depth, x, z) {
    const K = WAVES.kind[kind];
    if (!K) return 0;
    let a = K.amp * this.sea * smooth(depth / K.shoal);
    if (x !== undefined) for (const c of this.calm) { const d = Math.hypot(x - c.x, z - c.z); if (d < c.r + c.ramp) a *= smooth((d - c.r) / c.ramp); }
    return a;
  }
  syncCalm() { const U = this.U.uCalm.value; for (let i = 0; i < 4; i++) { const c = this.calm[i]; if (c) U[i].set(c.x, c.z, c.r, c.ramp); else U[i].set(0, 0, 0, 1); } }
  // The surface's height above its rest level at (x, z) at time t (default now), its slopes and how pinched it is.
  // out: { h, sx, sz, j (Jacobian: under WAVES.whitecap it is breaking white), vy (m/s up), amp, kind, depth }.
  // The drawn sheet's height above its rest level (the long components only, as the vertex shader lifts it), plus a
  // margin: where a layer drawn ON the water (foam, a silhouette, a swimmer's back) goes so a crest never buries it.
  sheetAt(x, z, t = this.t) {
    const kq = this.kindAt(x, z);
    if (!kq.kind) return 0;
    const amp = this.ampAt(kq.kind, kq.depth, x, z);
    return amp > 0 ? this.sum(x, z, t, amp, 1, _sh, true).h + amp * 0.12 : 0;
  }
  waveAt(x, z, t = this.t, out = {}) {
    const kq = this.kindAt(x, z);
    out.kind = kq.kind; out.depth = kq.depth; out.h = 0; out.sx = 0; out.sz = 0; out.j = 1; out.vy = 0; out.amp = 0;
    if (!kq.kind) return out;
    const amp = this.ampAt(kq.kind, kq.depth, x, z), chop = WAVES.kind[kq.kind].chop;
    out.amp = amp;
    if (amp <= 0) return out;
    this.sum(x, z, t, amp, chop, out);
    return out;
  }
  // The sum itself, for a known amp and chop (the hull sampler calls it four times per boat without re-asking the kind).
  sum(x, z, t, amp, chop, out, sheet = false) {
    const an = Math.min(2, amp / OCEAN_AMP);
    let h = 0, sx = 0, sz = 0, j = 1, vy = 0;
    for (let i = 0; i < N; i++) {
      const c = COMP[i];
      if (sheet && !c.vert) continue; // only what the sheet itself carries (its drawn height)
      const A = amp * c.a * (c.short ? chop : 1), th = c.kx * x + c.kz * z - c.om * t + c.ph;
      const s = Math.sin(th), co = Math.cos(th);
      h += A * s; sx += A * c.kx * co; sz += A * c.kz * co; vy -= A * c.om * co;
      j -= c.st * an * (c.short ? chop : 1) * s;
    }
    out.h = h + amp; out.sx = sx; out.sz = sz; out.j = j; out.vy = vy; // + amp: troughs at the rest level (see the shader)
    return out;
  }
  // The current at (x, z): rivers run downstream (the island's Colorado Remnant toward its lake; an L1 river along its
  // own points, which are in flow order), fastest mid-channel. out: { vx, vz, speed }.
  currentAt(x, z, out = {}) {
    out.vx = 0; out.vz = 0; out.speed = 0;
    const g = this.g, base = WATER.flow * WAVES.current.river, ek = WAVES.current.edgeK;
    if (Math.abs(x) <= 464 && Math.abs(z) <= 464) {
      const d = g.water?.depthAt(x, z, true) ?? 0;
      if (d <= 0 || Math.hypot(x - ISLAND_LAKE.x, z - ISLAND_LAKE.z) < ISLAND_LAKE.r) return out;
      let best = Infinity, tx = 0, tz = 1;
      for (let i = 0; i < ISLAND_RIVER.length - 1; i++) {
        const [ax, az] = ISLAND_RIVER[i], [bx, bz] = ISLAND_RIVER[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
        const tt = clamp01(((x - ax) * dx + (z - az) * dz) / l2), dd = Math.hypot(x - ax - dx * tt, z - az - dz * tt);
        if (dd < best) { best = dd; const l = Math.sqrt(l2); tx = dx / l; tz = dz / l; }
      }
      const sp = base * (ek + (1 - ek) * clamp01(d / 2.8));
      out.vx = tx * sp; out.vz = tz * sp; out.speed = sp;
      return out;
    }
    const Rv = g.streamer?.W?.water;
    if (!Rv) return out;
    const q = Rv.sample(x, z), kind = q.body?.kind;
    if (!(q.depth > 0) || !(kind === 'river' || kind === 'creek' || kind === 'canal')) return out;
    const sp = base * (kind === 'canal' ? 0.3 : 1) * (ek + (1 - ek) * clamp01(q.depth / 2));
    out.vx = (q.tx ?? 0) * sp; out.vz = (q.tz ?? 1) * sp; out.speed = sp;
    return out;
  }

  // ---- the shader --------------------------------------------------------------------------------------------------
  // Chained after the material's own onBeforeCompile (world/water.js colours the sheet; this lifts and shades it).
  install(mat, mode) {
    const prev = mat.onBeforeCompile, U = this.U, island = mode === 'island';
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(mat, sh, r);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${GLSL_COMMON}\n${island ? GLSL_KIND_ISLAND : GLSL_KIND_STREAM}
varying vec2 vWXZ; varying float vWA, vWK, vWD;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec2 wxz = (modelMatrix * vec4(position, 1.0)).xz;
  vWXZ = wxz;
  #ifdef USE_COLOR
  vec3 wc0 = color;
  #else
  vec3 wc0 = vec3(0.0, 2.0, 0.0);
  #endif
  int wk = wwKind(wc0);
  float wd = wc0.g;
  ${island ? `float wl = length(wxz - uIsleLake.xy); wk = wl < uIsleLake.z + 2.0 ? 2 : 3; wd = wk == 2 ? clamp((1.0 - wl / uIsleLake.z) * 11.2, 0.0, 7.0) : 2.0;` : ''}
  vWK = float(wk); vWD = wd;
  float wa = wk < 0 ? 0.0 : uKA[wk] * smoothstep(0.0, uKS[wk], wd) * wwCalm(wxz);
  vWA = wa;
  // The troughs rest on the sheet's own level and the crests rise above it: a region's sheet lies on flat ground (no
  // carved bed under the sea), so a trough below it would show the sand through the water.
  transformed.y += wa;
  if (wa > 0.0) {
    float an = min(2.0, wa / uOceanAmp), ch = uKC[wk];
    for (int i = 0; i < ${N}; i++) {
      if (uWS[i].z < 0.5) continue;
      vec4 C = uWC[i]; vec4 S = uWS[i];
      float A = wa * S.x * (S.w > 0.5 ? ch : 1.0), th = C.x * wxz.x + C.y * wxz.y - C.z * uWT + C.w;
      float kk = length(C.xy), H = S.y * an / kk * (S.w > 0.5 ? ch : 1.0);
      transformed.y += A * sin(th);
      transformed.xz -= (C.xy / kk) * H * cos(th);
    }
  }
}`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${GLSL_COMMON}\nuniform float uAbsO, uAbsL;\nvarying vec2 vWXZ; varying float vWA, vWK, vWD;`)
        // Beer-Lambert: a region's water darkens toward its deep colour by 1 - e^(-d/absorb), not a straight ramp.
        .replace('min(1.0, wDepth / (k >= 3 ? 6.0 : 2.2))', '1.0 - exp(-wDepth / (k >= 3 ? uAbsO : uAbsL))')
        // The tiled ripple map is the river's; on the sea and the lagoon it is turned down (the waves and the fine
        // noise below carry the surface there, so no 7 m checker shows through).
        .replace('(vColor.b > 0.1 && vColor.b < 0.35 ? 0.4 : 1.0)', '(vColor.b > 0.1 && vColor.b < 0.35 ? 0.4 : vColor.b > 0.425 && vColor.b < 0.95 ? 0.18 : 1.0)')
        .replace('#include <emissivemap_fragment>', `
{
  int wk = int(floor(vWK + 0.5));
  if (wk >= 0 && vWA > 0.0005) {
    float an = min(2.0, vWA / uOceanAmp), ch = uKC[wk], h = 0.0, sx = 0.0, sz = 0.0, J = 1.0;
    for (int i = 0; i < ${N}; i++) {
      vec4 C = uWC[i]; vec4 S = uWS[i];
      float m = S.w > 0.5 ? ch : 1.0, A = vWA * S.x * m, th = C.x * vWXZ.x + C.y * vWXZ.y - C.z * uWT + C.w;
      float s = sin(th), c = cos(th);
      h += A * s; sx += A * C.x * c; sz += A * C.y * c; J -= S.y * an * m * s;
    }
    // The surface's own slope bends the light (the ripple map rides on top of it).
    // Fine chop that never tiles: the slope of drifting noise, half a metre to a few metres across.
    vec2 rq = vWXZ * 0.9 + vec2(uWT * 0.35, -uWT * 0.22), e = vec2(0.13, 0.0);
    float r0 = wwF(rq), rgx = wwF(rq + e.xy) - r0, rgz = wwF(rq + e.yx) - r0;
    float rk = 0.55 * min(1.0, an * 1.5 + 0.2) * (1.0 - smoothstep(0.0, 0.6, float(wk) - 1.5));
    sx += rgx * rk * 4.0; sz += rgz * rk * 4.0;
    vec3 nW = normalize(vec3(-sx, 1.0, -sz));
    vec3 vUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    vec3 nV = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
    normal = normalize(nV + (normal - vUp) * 0.6);
    // Crests catch the light through their thin water (lighter, greener), troughs sit dark: the swell reads from above.
    float hn = clamp(h / max(vWA, 0.02), -1.2, 1.2);
    diffuseColor.rgb *= 1.0 + uCrest * hn * min(1.0, an * 1.6 + 0.25);
    diffuseColor.rgb += vec3(0.0, 0.025, 0.02) * max(0.0, hn) * an;
    // Whitecaps: where the surface pinches (the Jacobian under uWhite), broken into lace by drifting noise, streaked
    // along the swell.
    vec2 fq = vWXZ * 0.33 + vec2(uWT * 0.21, uWT * 0.05);
    float lace = wwF(vec2(fq.x * 0.6, fq.y * 1.7)) * 0.65 + wwF(vWXZ * 1.1 - uWT * 0.3) * 0.35;
    float cap = (1.0 - smoothstep(uWhite - 0.22, uWhite, J)) * smoothstep(0.34, 0.62, lace) * uKF[wk];
    cap = max(cap, (1.0 - smoothstep(uWhite - 0.05, uWhite + 0.18, J)) * smoothstep(0.62, 0.8, lace) * 0.45 * uKF[wk]); // the film a crest leaves
    // Surf: bands running up the shallows toward the sand, a solid line where it meets it.
    float sf = 0.0;
    if (wk <= 1) {
      float sb = sin(vWD * uShoreBands * 6.2832 + uWT * 1.6 + wwN(vWXZ * 0.08) * 6.0);
      sf = smoothstep(0.55, 0.95, sb) * (1.0 - smoothstep(0.0, uShoreFoam, vWD)) * smoothstep(0.25, 0.7, lace + 0.2);
      sf = max(sf, 1.0 - smoothstep(0.03, 0.16, vWD));
    }
    float foam = clamp(max(cap, sf), 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, uWFoam, foam * 0.92);
    roughnessFactor = mix(roughnessFactor, 0.85, foam);
  }
}
#include <emissivemap_fragment>`);
    };
    const pk = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => `${pk ? pk() : ''}|dsoa-waves-1-${mode}`;
    mat.needsUpdate = true;
  }

  // ---- wakes and splashes: one pooled InstancedMesh of foam puffs ------------------------------------------------
  buildWake(scene) {
    if (!scene) return;
    const P = WAVES.wake.pool;
    // A foam puff: a soft blob eaten into lace by noise (canvas, 128 px; mipmapped so a far puff stays soft).
    const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const x = cv.getContext('2d'), im = x.createImageData(S, S);
    const hsh = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
    const vn = (px, py) => { const i = Math.floor(px), j = Math.floor(py), fx = px - i, fy = py - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (hsh(i, j) * (1 - u) + hsh(i + 1, j) * u) * (1 - v) + (hsh(i, j + 1) * (1 - u) + hsh(i + 1, j + 1) * u) * v; };
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const dx = i / S - 0.5, dy = j / S - 0.5, r = Math.sqrt(dx * dx + dy * dy) * 2;
      const n = vn(i / 9, j / 9) * 0.6 + vn(i / 4, j / 4) * 0.4;
      const a = Math.max(0, 1 - r) ** 1.2 * Math.min(1, Math.max(0, (n - 0.28) * 2.4));
      const k = (j * S + i) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = 255; im.data[k + 3] = Math.round(a * 255);
    }
    x.putImageData(im, 0, 0);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    this.wakeU = { uMap: { value: tex }, uLum: { value: 1 }, uCol: { value: new THREE.Color('#eef4f2') }, uBlood: { value: new THREE.Color('#5c0f0b') } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.wakeU, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      vertexShader: /* glsl */`
        varying vec2 vUv; varying float vA, vR;
        void main() {
          vUv = uv;
          #ifdef USE_INSTANCING_COLOR
          vA = instanceColor.r; vR = instanceColor.g;
          #else
          vA = 1.0; vR = 0.0;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform float uLum; uniform vec3 uCol, uBlood;
        varying vec2 vUv; varying float vA, vR;
        // Foam is white; blood in the water (vR) is a dark red cloud, thinner at its edge.
        void main() { float a = texture2D(uMap, vUv).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(mix(uCol, uBlood, vR) * uLum, a * (1.0 - vR * 0.35)); }`,
    });
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(geo, mat, P);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(P * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.count = 0; m.frustumCulled = false; m.renderOrder = 3; m.visible = false; m.name = 'waves:wake';
    scene.add(m);
    this.wake = m;
    // The puffs as typed arrays (no objects per puff).
    this.pf = { x: new Float32Array(P), z: new Float32Array(P), vx: new Float32Array(P), vz: new Float32Array(P), r: new Float32Array(P),
      grow: new Float32Array(P), age: new Float32Array(P), life: new Float32Array(P), a: new Float32Array(P), rot: new Float32Array(P), y: new Float32Array(P), red: new Float32Array(P) };
    this.pNext = 0; this.pAlive = 0;
    this.emitT = new Map(); // mover -> seconds to its next puff (a WeakMap would do; the key set is small and pruned)
  }
  // One puff: at (x, z) on the water at height y0 (the surface's rest level), drifting (vx, vz), r metres, growing,
  // living `life` seconds, `a` opaque.
  puff(x, z, y0, vx, vz, r, grow, life, a, red = 0) {
    const P = this.pf; if (!P) return;
    const i = this.pNext; this.pNext = (i + 1) % WAVES.wake.pool;
    P.x[i] = x; P.z[i] = z; P.y[i] = y0; P.vx[i] = vx; P.vz[i] = vz; P.r[i] = r; P.grow[i] = grow; P.age[i] = 0; P.life[i] = life; P.a[i] = a; P.red[i] = red; P.rot[i] = Math.random() * TAU;
    this.stats.puffs++;
  }
  // A splash: something went in (a body, a diver, a hull that landed). A ring of foam and a burst of spray.
  splash(x, z, size = 1, y0 = NaN) {
    const g = this.g, base = Number.isFinite(y0) ? y0 : (g.water?.surfaceAt?.(x, z, 0) ?? 0), n = Math.round(WAVES.wake.splash * Math.min(2, size));
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; this.puff(x + Math.sin(a) * 0.4 * size, z + Math.cos(a) * 0.4 * size, base, Math.sin(a) * 1.6 * size, Math.cos(a) * 1.6 * size, 0.7 * size, 1.1 * size, 1.6 + size * 0.6, 0.85); }
    this.puff(x, z, base, 0, 0, 0.8 * size, 1.0 * size, 2.0, 0.7);
    for (let i = 0; i < 10 * size; i++) g.fx?.spawn?.(2, x + (Math.random() - 0.5) * size, base + 0.2, z + (Math.random() - 0.5) * size, (Math.random() - 0.5) * 4, 2.5 + Math.random() * 3 * size, (Math.random() - 0.5) * 4, 0.7, 0.35, '#e8f0f0', 14);
    this.stats.splashes++;
    g.sealife?.stimulus?.(x, z, 'splash', 0.6 + size * 0.5); // something heard it under the water
    g.emit?.('splash', { x: +x.toFixed(1), z: +z.toFixed(1), size: +size.toFixed(2) });
  }
  // A mover leaves its wake: a boat's stern puff and the two arms of its V, a swimmer's kick. id: any stable key.
  trail(key, x, z, vx, vz, h, len, wid, dt, kind = 'boat', y0 = 0) {
    const sp = Math.hypot(vx, vz), Wk = WAVES.wake;
    if (sp < Wk.minSpeed) return;
    let t = (this.emitT.get(key) ?? 0) - dt;
    if (t > 0) { this.emitT.set(key, t); return; }
    this.emitT.set(key, kind === 'swim' ? Wk.swimEvery : Wk.every);
    const fx = Math.sin(h), fz = Math.cos(h), rx = fz, rz = -fx;
    if (kind === 'swim') { this.puff(x - fx * 0.5, z - fz * 0.5, y0, -vx * 0.1, -vz * 0.1, 0.45, 0.5, 1.8, 0.55); return; }
    const sx = x - fx * len * 0.5, sz = z - fz * len * 0.5, k = Math.min(1.4, sp / 18);
    // The stern's churn: wide and white, left behind (it barely moves).
    this.puff(sx, sz, y0, vx * 0.05, vz * 0.05, wid * (0.7 + k * 0.6), Wk.grow * (0.4 + k * 0.3), Wk.life * (0.6 + k * 0.5), 0.9);
    // The V's two arms, running out to the sides.
    const out = Wk.vee * (sp / 10);
    for (const s of [-1, 1]) this.puff(sx + rx * s * wid * 0.45, sz + rz * s * wid * 0.45, y0, rx * s * out + vx * 0.08, rz * s * out + vz * 0.08, wid * (0.5 + k * 0.4), Wk.grow * 0.45, Wk.life * (0.8 + k * 0.4), 0.75);
  }
  stepWake(dt) {
    const m = this.wake, P = this.pf;
    if (!m) return;
    const n = WAVES.wake.pool;
    let c = 0;
    const g = this.g, cam = g.camLook ?? g.player, R2 = ((g.viewR ?? 30) * 2.6) ** 2;
    for (let i = 0; i < n; i++) {
      if (P.life[i] <= 0) continue;
      P.age[i] += dt;
      if (P.age[i] >= P.life[i]) { P.life[i] = 0; continue; }
      P.x[i] += P.vx[i] * dt; P.z[i] += P.vz[i] * dt; P.vx[i] *= Math.exp(-dt * 0.35); P.vz[i] *= Math.exp(-dt * 0.35);
      P.r[i] += P.grow[i] * dt;
      const dx = P.x[i] - (cam?.x ?? 0), dz = P.z[i] - (cam?.z ?? 0);
      if (dx * dx + dz * dz > R2) continue;
      const u = P.age[i] / P.life[i], a = P.a[i] * (u < 0.08 ? u / 0.08 : 1 - smooth((u - 0.08) / 0.92));
      // On the moving surface: the wave under it, plus a hair above it (the z-fight law: a layer on top of the water).
      const pa = this._puffAmp(P.x[i], P.z[i]);
      this.sum(P.x[i], P.z[i], this.t, pa, 1, _w, true);
      _p.set(P.x[i], P.y[i] + _w.h + pa * 0.12 + 0.06, P.z[i]);
      _q.setFromEuler(_e.set(0, P.rot[i] + u * 0.6, 0));
      _s.set(P.r[i] * 2, 1, P.r[i] * 2);
      _m.compose(_p, _q, _s);
      m.setMatrixAt(c, _m);
      m.instanceColor.setXYZ(c, a, P.red[i], 0);
      c++;
    }
    m.count = c; m.visible = c > 0;
    this.pAlive = c;
    if (c) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    const sky = g.sky;
    this.wakeU.uLum.value = sky ? 0.18 + 0.82 * (1 - (sky.night ?? 0)) : 1;
  }
  // A puff's wave amp: the kind under the last mover is cached (a puff never needs its own kind lookup per frame).
  _puffAmp() { return this._lastAmp ?? 0; }

  // ---- hulls riding it ------------------------------------------------------------------------------------------------
  // Called by systems/vehicles.js for a boat each frame after it moved: its heave, pitch and roll from four samples of
  // the surface (bow, stern, port, starboard), a waterbike's flight off a crest, the felt motion a deck rider takes, the
  // river's current on its hull, and its wake. base: the water's rest level under it; afloat: it has water under it.
  ride(v, dt, base, afloat) {
    const g = this.g, R = WAVES.ride, sp = Math.hypot(v.vx, v.vz);
    if (!afloat) { v.group.position.y = base + 0.05; v.group.rotation.x = 0; v.group.rotation.z = 0.06; v.lean = 0.06; v.wheelie = 0; v.waveAir = false; v.hullVy = 0; return; }
    const kq = this.kindAt(v.x, v.z), amp = this.ampAt(kq.kind, kq.depth, v.x, v.z), chop = kq.kind ? WAVES.kind[kq.kind].chop : 0;
    this._lastAmp = amp;
    const fx = Math.sin(v.h), fz = Math.cos(v.h), rx = fz, rz = -fx, L = v.len * R.sample, Wd = v.wid * R.sample, t = this.t;
    const hb = this.sum(v.x + fx * L, v.z + fz * L, t, amp, chop, _w).h, hs = this.sum(v.x - fx * L, v.z - fz * L, t, amp, chop, _w).h;
    const hp = this.sum(v.x - rx * Wd, v.z - rz * Wd, t, amp, chop, _w).h, hr = this.sum(v.x + rx * Wd, v.z + rz * Wd, t, amp, chop, _w).h;
    const c = this.sum(v.x, v.z, t, amp, chop, _w), heave = (hb + hs + hp + hr) * 0.25 * 0.6 + c.h * 0.4;
    // The hull's own wave-pitch and roll (the bow up when the bow's water is higher), plus speed squatting the stern and
    // a lean into the turn.
    const pitch = Math.atan2(hb - hs, 2 * L) - Math.min(0.12, sp * 0.004);
    const roll = Math.atan2(hp - hr, 2 * Wd) + Math.max(-0.2, Math.min(0.2, -v.av * sp * 0.01));
    const target = base - 0.18 + heave;
    // Vertical: a hull settles onto the water under it; a waterbike fast over a crest keeps going up (it flies).
    const prevY = v.hullY ?? target, prevT = v.hullT ?? target, tVy = dt > 0 ? (target - prevT) / dt : 0;
    let y = prevY, vy = v.hullVy ?? 0;
    const bike = v.type === 'jetski';
    if (v.waveAir) {
      vy -= 9.81 * dt; y += vy * dt;
      if (y <= target) { // back in: a slap, spray, a jolt the rider feels
        v.waveAir = false; const hit = -vy; y = target; vy = tVy;
        this.splash(v.x, v.z, Math.min(1.6, 0.5 + hit * 0.25), base);
        v.waveLand = hit; g.emit?.('waveLand', { id: v.id, vy: +hit.toFixed(2) });
      }
    } else if (bike && sp > R.airSpeed && v.prevTVy > 0.6 && tVy < v.prevTVy - 0.2 && c.j < 1) {
      // Cresting: the water falls away under a hull still rising at the speed it climbed the face.
      v.waveAir = true; vy = v.prevTVy * R.airLift * Math.min(1.6, sp / R.airSpeed); y = target + 0.02;
      this.stats.airs++; this.lastAir = { id: v.id, speed: +sp.toFixed(1), vy: +vy.toFixed(2), t: +this.t.toFixed(2) };
      g.emit?.('waveAir', this.lastAir);
    } else { const k = 1 - Math.exp(-dt * R.follow); vy = (target - y) / Math.max(dt, 1e-3) * k; y += (target - y) * k; }
    v.prevTVy = tVy; v.hullT = target; v.hullY = y; v.hullVy = vy;
    // What the deck feels: the hull's vertical acceleration and how fast it rolls and pitches (filtered).
    const acc = dt > 0 ? Math.abs(vy - (v._wVyPrev ?? vy)) / dt : 0, rr = dt > 0 ? (Math.abs(roll - (v.waveRoll ?? roll)) + Math.abs(pitch - (v.wavePitch ?? pitch))) / dt : 0;
    v._wVyPrev = vy;
    v.waveFelt = (v.waveFelt ?? 0) + ((v.waveAir ? 0 : (acc * 0.15 + rr * 2.2) * R.feltK) - (v.waveFelt ?? 0)) * Math.min(1, dt * 3);
    v.waveH = heave; v.wavePitch = pitch; v.waveRoll = roll; v.waveVy = vy;
    v.group.position.y = y;
    v.group.rotation.x = v.waveAir ? -Math.max(-0.35, Math.min(0.35, vy * 0.05)) : -pitch;
    v.group.rotation.z = roll;
    v.lean = roll; v.wheelie = -v.group.rotation.x;
    this.stats.rides++;
    // The river carries what floats on it: all of it when it drifts, less under way (a driven hull fights it).
    const cur = this.currentAt(v.x, v.z, _cur);
    if (cur.speed > 0) { const k = v.driver && Math.abs(v.throttle ?? 0) > 0.05 ? 0.6 : 1; v.x += cur.vx * dt * k; v.z += cur.vz * dt * k; }
    if (!v.waveAir) this.trail(v, v.x, v.z, v.vx, v.vz, v.h, v.len, v.wid, dt, 'boat', base);
  }

  // ---- a swimmer --------------------------------------------------------------------------------------------------------
  // Called from main.js's water block for the player each frame: the current carries a swimmer, a kick leaves a wake, a
  // fall or a run into deep water splashes.
  swimmer(p, wet, dt) {
    const was = this._wetP;
    this._wetP = wet;
    if (wet === 'dry') { p.waveY = 0; return; }
    p.waveY = this.sheetAt(p.x, p.z); // on the swell as it is drawn (characters.js)
    const base = this.g.water?.surfaceAt?.(p.x, p.z, 0) ?? 0;
    if (was === 'dry' && wet === 'swim' || (was === 'wade' && wet === 'swim' && (p.speed ?? 0) > 5)) this.splash(p.x, p.z, 0.8, base);
    if (wet === 'swim') {
      const cur = this.currentAt(p.x, p.z, _cur);
      if (cur.speed > 0) { p.x += cur.vx * dt; p.z += cur.vz * dt; }
      this._lastAmp = this.ampAt(this.kindAt(p.x, p.z).kind, 2, p.x, p.z);
      if (!p.underwater) { const vx = Math.sin(p.face ?? 0) * (p.speed ?? 0), vz = Math.cos(p.face ?? 0) * (p.speed ?? 0); this.trail(p, p.x, p.z, vx, vz, p.face ?? 0, 0.8, 0.5, dt, 'swim', base); }
    }
  }

  update(dt) {
    this.t += dt;
    this.U.uWT.value = this.t;
    const c = this.g.sky?.cur, S = WAVES.sea;
    const k = c ? 1 + (c.storm ?? 0) * S.storm + Math.min(1, c.rain ?? 0) * S.rain + (c.clouds ?? 0) * S.clouds : 1;
    if (Math.abs(k - this.sea) > 0.002) this.setSea(k);
    this.stepWake(dt);
    if (this.emitT.size > 64) for (const key of this.emitT.keys()) if (key.dead || key.alive === false || (key.boat && !this.g.vehicles.includes(key))) this.emitT.delete(key);
  }

  summary() {
    return { t: +this.t.toFixed(2), sea: +this.sea.toFixed(2), puffsAlive: this.pAlive, stats: { ...this.stats }, lastAir: this.lastAir };
  }
}
const _w = { h: 0, sx: 0, sz: 0, j: 1, vy: 0 }, _sh = { h: 0, sx: 0, sz: 0, j: 1, vy: 0 }, _cur = { vx: 0, vz: 0, speed: 0 };
