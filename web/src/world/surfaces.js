// Roof surfaces. The camera looks almost straight down, so in a town a roof is half of what is on screen; a flat slab of
// one colour read as a brown hole (Robert, 2026-10-23: "we can't just have the top of the buildings looking all boring").
// roofSurface(mat) patches a MeshStandardMaterial for an InstancedMesh of unit boxes (the island's roofs batch, the
// streamed roofs pool) so the TOP face of every roof-sized instance draws one of five roofs, picked by a hash of where
// the instance stands (the same roof every load, no data, no extra draw call, no texture):
//   0 corrugated sheet  ribs, sheet seams, a few sheets replaced in fresh galvanised or rust
//   1 cool-coated flat  the white elastomeric coat Phoenix puts on flat roofs, gone patchy over grey membrane
//   2 clay tile         barrel-tile courses in terracotta
//   3 rebuilt patchwork sheets and tarps of whatever was found: blue and green tarp, rust, plywood, a solar panel or two
//   4 tar and gravel    speckled, with darker patch repairs
// Every roof gets a rim (a lit coping and a dark gutter line inside it) so it reads as a roof, not a slab, and dust that
// settles thicker toward the middle. Small instances (AC units, tanks, vents: under SMALL m across) get a grille.
// The instance colour still tints the result (ROOF_MIX of it), so a district's palette shows through.
const SMALL = 3.2;
const ROOF_MIX = 0.3;
const BIG_ROOF = 520; // m²

const VERT_HEAD = /* glsl */`
varying vec3 vRoofW;
varying vec2 vRoofC;
varying vec2 vRoofS;
varying vec2 vRoofAx;
varying float vRoofUp;
`;
const VERT_BODY = /* glsl */`
  {
    vec4 rp = vec4(transformed, 1.0);
    vRoofC = vec2(0.0); vRoofS = vec2(1.0); vRoofAx = vec2(1.0, 0.0);
    #ifdef USE_INSTANCING
      rp = instanceMatrix * rp;
      vec4 rc = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vRoofC = rc.xz;
      vRoofS = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz));
      vRoofAx = normalize(instanceMatrix[0].xz + vec2(1e-6, 0.0));
    #endif
    vRoofW = (modelMatrix * rp).xyz;
    vRoofUp = objectNormal.y;
  }
`;

const FRAG_HEAD = /* glsl */`
varying vec3 vRoofW;
varying vec2 vRoofC;
varying vec2 vRoofS;
varying vec2 vRoofAx;
varying float vRoofUp;
float rh1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float rn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rh1(i), rh1(i + vec2(1.0, 0.0)), f.x), mix(rh1(i + vec2(0.0, 1.0)), rh1(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 roofTop(vec3 tint) {
  vec2 p = vRoofW.xz - vRoofC;
  vec2 az = vec2(-vRoofAx.y, vRoofAx.x);
  // Local coordinates along the instance's own axes, origin at a corner (u across x, v across z), and the size.
  float u = dot(p, vRoofAx) + vRoofS.x * 0.5, v = dot(p, az) + vRoofS.y * 0.5;
  vec2 S = vRoofS;
  float seed = rh1(floor(vRoofC * 0.5) + 0.37);
  vec3 c;
  if (min(S.x, S.y) < ${SMALL.toFixed(1)}) {
    // AC unit, tank, vent: a grille of slats and a lighter frame.
    float slat = step(0.5, fract(u * 6.0));
    float frame = step(min(min(u, S.x - u), min(v, S.y - v)), 0.12);
    return tint * mix(0.70 + 0.30 * slat, 1.35, frame);
  }
  // Ribs and courses run across the long side.
  bool alongU = S.x >= S.y;
  float a = alongU ? u : v, b = alongU ? v : u;
  // A big roof (a tower, a warehouse) is flat membrane or tar; sheet, tile and patchwork are for houses and shops.
  float kind = S.x * S.y > ${BIG_ROOF.toFixed(1)} ? (seed < 0.55 ? 1.0 : 4.0) : floor(seed * 5.0);
  if (kind < 1.0) {
    float rib = 0.5 + 0.5 * sin(a * 6.2832 / 0.22);
    vec2 sheet = floor(vec2(a / 0.9, b / 2.4));
    float sh = rh1(sheet + seed * 17.0);
    vec3 base = vec3(0.56, 0.55, 0.52);
    if (sh > 0.86) base = vec3(0.70, 0.72, 0.73);        // a fresh galvanised sheet
    else if (sh < 0.22) base = vec3(0.52, 0.32, 0.20);   // rusted through
    float seam = smoothstep(0.06, 0.0, abs(fract(b / 2.4) - 0.5) - 0.47);
    c = base * (0.80 + 0.28 * rib) * (1.0 - 0.25 * seam);
  } else if (kind < 2.0) {
    // Peeling: two scales of noise, so the bare membrane shows in flakes along the laps, not in camouflage blobs.
    float n2 = rn(vec2(u, v) * 0.6 + seed * 9.0) * 0.65 + rn(vec2(u, v) * 2.3 + 3.1) * 0.35;
    float coat = smoothstep(0.30, 0.42, n2);
    vec3 membrane = vec3(0.44, 0.43, 0.42) * (0.85 + 0.3 * rn(vec2(u, v) * 3.1));
    c = mix(membrane, vec3(0.68, 0.67, 0.63), coat);
    float lap = smoothstep(0.04, 0.0, abs(fract(a / 1.0) - 0.5) - 0.46);
    c *= 1.0 - 0.10 * lap;
  } else if (kind < 3.0) {
    float course = fract(b / 0.34);
    float barrel = 0.5 + 0.5 * cos(a * 6.2832 / 0.3 + step(0.5, fract(b / 0.68)) * 3.1416);
    float t = rh1(floor(vec2(a / 0.3, b / 0.34)) + seed * 5.0);
    vec3 clay = mix(vec3(0.72, 0.36, 0.20), vec3(0.82, 0.50, 0.30), t);
    c = clay * (0.72 + 0.34 * barrel) * (0.82 + 0.18 * smoothstep(0.0, 0.25, course));
  } else if (kind < 4.0) {
    // Rebuilt from salvage: corrugated sheets of every age laid in staggered courses (0.9 x 2.4 m, the size sheets come
    // in), ribbed and lapped; a plywood patch here and there; one tarp lashed over a leak; on some, a bank of salvaged
    // solar panels. One patched roof, not a quilt of coloured squares (the old cells read as a quilt from the camera).
    float row = floor(b / 2.4);
    float aa = a + step(0.5, fract(row * 0.5)) * 0.45;
    vec2 cell = vec2(floor(aa / 0.9), row);
    float r = rh1(cell + seed * 31.0), s2 = rh1(vec2(seed * 7.3, 4.4));
    float rib = 0.5 + 0.5 * sin(a * 6.2832 / 0.22);
    // Mostly the same weathered sheet (a shade either way per sheet), so it reads as ONE roof from the camera; the
    // replaced and rusted sheets are the exception, not a mosaic.
    vec3 base = vec3(0.56, 0.55, 0.52) * (0.93 + 0.14 * rh1(cell + 7.7));                    // weathered galvanised
    if (r < 0.16) base = mix(vec3(0.50, 0.33, 0.22), vec3(0.58, 0.39, 0.26), rh1(cell + 3.1)); // rusted through
    else if (r < 0.22) base = vec3(0.66, 0.68, 0.68);                                          // a fresher sheet
    else if (r < 0.26) base = vec3(0.47, 0.45, 0.42);                                          // an older, darker one
    else if (r < 0.29) { base = vec3(0.60, 0.51, 0.38); rib = 0.55; }                          // a plywood patch
    base = mix(base, vec3(0.52, 0.38, 0.27), 0.35 * smoothstep(0.55, 0.85, rn(vec2(u, v) * 0.35 + seed * 5.0))); // rust bleeding across sheets
    c = base * (0.80 + 0.28 * rib);
    float lap = max(smoothstep(0.05, 0.0, abs(fract(b / 2.4) - 0.5) - 0.45), smoothstep(0.04, 0.0, abs(fract(aa / 0.9) - 0.5) - 0.46));
    c *= 1.0 - 0.22 * lap;
    // One tarp lashed over a leak: a rough-edged patch, sun-faded, in folds.
    vec2 tq = vec2(u, v) - S * vec2(0.25 + 0.5 * rh1(vec2(seed, 1.7)), 0.25 + 0.5 * rh1(vec2(seed, 5.3)));
    float trad = min(S.x, S.y) * (0.09 + 0.08 * rh1(vec2(seed, 9.1)));
    float tarp = step(max(abs(tq.x), abs(tq.y) * 1.3) + 0.4 * rn(vec2(u, v) * 1.1 + seed * 13.0), trad) * step(0.45, s2);
    vec3 tcol = s2 > 0.8 ? vec3(0.28, 0.42, 0.54) : s2 > 0.55 ? vec3(0.38, 0.46, 0.33) : vec3(0.64, 0.48, 0.30);
    c = mix(c, tcol * (0.86 + 0.16 * sin(u * 7.0 + v * 2.3)), tarp);
    // A bank of salvaged solar panels (two rows of three) on some.
    vec2 pq = vec2(u, v) - vec2(S.x * 0.62, S.y * 0.2);
    if (s2 > 0.62 && pq.x > 0.0 && pq.x < 3.1 && pq.y > 0.0 && pq.y < 3.3) {
      vec2 g = vec2(fract(pq.x / 1.03), fract(pq.y / 1.65)), gg = fract(pq / 0.32);
      c = mix(vec3(0.08, 0.12, 0.19), vec3(0.58, 0.60, 0.62), max(step(0.92, max(g.x, g.y)), 0.35 * step(0.9, max(gg.x, gg.y))));
    }
  } else {
    float grit = rh1(floor(vec2(u, v) * 9.0));
    vec3 tar = vec3(0.42, 0.40, 0.37) * (0.82 + 0.3 * grit);
    float patchy = step(0.72, rn(vec2(u, v) * 0.45 + seed * 3.0));
    c = mix(tar, vec3(0.26, 0.25, 0.24), patchy);
  }
  // Dust settles toward the middle; the rim is a lit coping with a dark gutter inside it.
  float edgeD = min(min(u, S.x - u), min(v, S.y - v));
  c = mix(c, vec3(0.78, 0.68, 0.52), 0.22 * rn(vec2(u, v) * 0.25 + 4.0) * smoothstep(0.5, 4.0, edgeD));
  c = mix(c, vec3(0.74, 0.70, 0.62), step(edgeD, 0.28));
  c *= 1.0 - 0.45 * smoothstep(0.55, 0.32, edgeD) * step(0.28, edgeD);
  // The colours above are written as they should look on screen; the shader works in linear light. The instance colour
  // then shifts the hue (not the brightness) by ROOF_MIX.
  c = pow(c, vec3(2.2));
  vec3 hue = tint / max(dot(tint, vec3(0.3333)), 0.02);
  return c * mix(vec3(1.0), hue, ${ROOF_MIX.toFixed(2)});
}
`;

const FRAG_BODY = /* glsl */`
  if (vRoofUp > 0.5) diffuseColor.rgb = roofTop(diffuseColor.rgb);
`;

export function roofSurface(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_BODY}`);
  };
  mat.customProgramCacheKey = () => 'roofSurface8';
  return mat;
}

// Wall surfaces. From the game camera a wall shows as a band under every roof edge; one flat colour read as cardboard.
// wallSurface(mat) gives the SIDE faces of every instance of a walls batch (the island's walls, the streamed walls pool) a
// finish picked by a hash of the instance's centre, over its own colour: 0-5 stucco (Phoenix is a stucco city: a trowel
// texture and patched repairs), 6-8 concrete block (coursing every 0.2 m, joints every 0.4 m staggered), 9 brick. Every
// wall gets a dirt band at its foot (splash and dust) and grime streaks run down from its top. No texture, no draw call.
const WALL_VERT_HEAD = /* glsl */`
varying vec3 vWallW;
varying vec3 vWallN;
varying vec3 vWallC;
varying float vWallH;
`;
const WALL_VERT_BODY = /* glsl */`
  {
    vec4 wp = vec4(transformed, 1.0);
    mat4 im = mat4(1.0);
    #ifdef USE_INSTANCING
      im = instanceMatrix;
    #endif
    wp = modelMatrix * im * wp;
    vWallW = wp.xyz;
    vWallN = normalize(mat3(modelMatrix) * mat3(im) * objectNormal);
    vec4 wc = modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0);
    vWallC = wc.xyz;
    vWallH = length(im[1].xyz);
  }
`;
const WALL_FRAG_HEAD = /* glsl */`
varying vec3 vWallW;
varying vec3 vWallN;
varying vec3 vWallC;
varying float vWallH;
float wh1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float wn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wh1(i), wh1(i + vec2(1.0, 0.0)), f.x), mix(wh1(i + vec2(0.0, 1.0)), wh1(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 wallSide(vec3 c) {
  // Along the face (world x or z, whichever the face runs on) and up it from the instance's foot.
  float s = abs(vWallN.x) > abs(vWallN.z) ? vWallW.z : vWallW.x;
  float y = vWallW.y - (vWallC.y - vWallH * 0.5);
  // The finish is an exact integer hash of the instance's 4 m cell, so wallFinish() below (systems/materials.js: what a
  // wall is made of) reads the same finish the shader paints.
  vec2 fq = floor(vWallC.xz * 0.25 + 0.0371);
  float kind = mod(mod(fq.x * 37.0 + fq.y * 101.0 + fq.x * fq.y * 3.0, 9973.0) * 7.0, 10.0);
  float k = 1.0;
  if (kind < 6.0) {
    k = 0.93 + 0.1 * wn(vec2(s, y) * 2.2) + 0.05 * wn(vec2(s, y) * 9.0);       // trowelled stucco
    float rep = step(0.78, wn(vec2(s * 0.35, y * 0.6) + kind * 3.0));
    k *= mix(1.0, 1.08, rep);                                                    // a patched repair, lighter
  } else if (kind < 9.0) {
    float course = fract(y / 0.2), row = floor(y / 0.2);
    float joint = fract(s / 0.4 + mod(row, 2.0) * 0.5);
    float mortar = max(smoothstep(0.06, 0.0, course), smoothstep(0.035, 0.0, min(joint, 1.0 - joint)));
    k = (0.92 + 0.12 * wh1(vec2(floor(s / 0.4 + mod(row, 2.0) * 0.5), row))) * (1.0 - 0.22 * mortar);
  } else {
    float course = fract(y / 0.15), row = floor(y / 0.15);
    float joint = fract(s / 0.3 + mod(row, 2.0) * 0.5);
    float mortar = max(smoothstep(0.1, 0.0, course), smoothstep(0.05, 0.0, min(joint, 1.0 - joint)));
    vec3 brick = vec3(0.62, 0.32, 0.22) * (0.85 + 0.25 * wh1(vec2(floor(s / 0.3 + mod(row, 2.0) * 0.5), row)));
    c = mix(c, brick * 0.55, 0.65);
    k = 1.0 - 0.3 * mortar;
  }
  // Dirt splashed up the foot, grime run down from the top.
  k *= mix(0.7, 1.0, smoothstep(0.0, 0.7, y));
  float streak = wn(vec2(s * 1.7, 0.0)) * smoothstep(1.4, 0.0, vWallH - y);
  k *= 1.0 - 0.18 * streak;
  return c * k;
}
`;
const WALL_FRAG_BODY = /* glsl */`
  if (abs(vWallN.y) < 0.5) diffuseColor.rgb = wallSide(diffuseColor.rgb);
`;

// The finish wallSurface paints on a wall piece whose centre is (cx, cz): 0-5 stucco, 6-8 concrete block, 9 brick. The
// shader's arithmetic, in float32, on small integers: exact on both sides.
const f32 = Math.fround, FQ = f32(0.0371);
const pmod = (a, m) => ((a % m) + m) % m;
export function wallFinish(cx, cz) {
  const qx = Math.floor(f32(f32(f32(cx) * 0.25) + FQ)), qz = Math.floor(f32(f32(f32(cz) * 0.25) + FQ));
  return pmod(pmod(qx * 37 + qz * 101 + qx * qz * 3, 9973) * 7, 10);
}

export function wallSurface(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${WALL_VERT_HEAD}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WALL_VERT_BODY}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${WALL_FRAG_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${WALL_FRAG_BODY}`);
  };
  mat.customProgramCacheKey = () => 'wallSurface1';
  return mat;
}

// Ground surfaces (docs/design/WEB_LOOK.md §3.7): the streamed ground's material (world/streamer.js), patched so that
//   - the sand stops tiling: the 28 m sand tile repeated as a regular egg-crate of dune blotches from any height. A second
//     sample of the same texture on a rotated, larger lattice is blended in by a world-space noise, so no two 28 m cells
//     match. It fades in past the island's edge (464 to 684 m out), where the island's own ground meets the chunks', so
//     that seam is untouched;
//   - a FLOOR channel (the ground layer's aFloor attribute, chunkgen.js: [forest, town] weights 0..1 per vertex) paints a
//     procedural floor over the sand: under a painted wood, dark leaf litter, needles, bare loam and moss; inside a
//     holdout's wall, packed sand and grey earth, trampled grass, worn foot paths, grit, litter and puddles (which also go
//     glossy). World-space, so it runs on across chunk seams; detail finer than a pixel fades out (no shimmer at the
//     widest zoom). No texture, no draw call, no data: the layout hash never reads it.
// Noise lattices wrap every WRAP metres (the world runs past 230 km: float32 can't hash those coordinates finely), each
// lattice size divides WRAP, so the wrap is seamless.
const WRAP = 2048;
const GROUND_VERT_HEAD = /* glsl */`
attribute vec2 aFloor;
varying vec2 vGW;
varying vec2 vFloor;
`;
const GROUND_VERT_BODY = /* glsl */`
  {
    vec4 gw = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      gw = instanceMatrix * gw;
    #endif
    vGW = (modelMatrix * gw).xz;
    vFloor = aFloor;
  }
`;
const GROUND_FRAG_HEAD = /* glsl */`
varying vec2 vGW;
varying vec2 vFloor;
float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Value noise on a lattice of cell s metres, periodic every ${WRAP} m (w: the wrapped world position).
float gn(vec2 w, float s) {
  vec2 p = w / s, i = floor(p), f = fract(p), P = vec2(${WRAP.toFixed(1)} / s);
  f = f * f * (3.0 - 2.0 * f);
  vec2 i1 = mod(i + 1.0, P); i = mod(i, P);
  return mix(mix(gh(i), gh(vec2(i1.x, i.y)), f.x), mix(gh(vec2(i.x, i1.y)), gh(i1), f.x), f.y);
}
float gfbm(vec2 w, float s) { return gn(w, s) * 0.5 + gn(w + 17.0, s * 0.5) * 0.3 + gn(w + 41.0, s * 0.25) * 0.2; }
// One feature per cell of s metres: a hash in [0,1), and the distance (in cells) from a random point in the cell.
vec2 gcell(vec2 w, float s, float salt) {
  vec2 p = w / s, i = mod(floor(p), vec2(${WRAP.toFixed(1)} / s)), f = fract(p);
  float h = gh(i + salt);
  vec2 c = vec2(0.25 + 0.5 * gh(i + salt + 7.1), 0.25 + 0.5 * gh(i + salt + 3.7));
  return vec2(h, length(f - c));
}
float gPuddle = 0.0;
vec3 forestFloor(vec2 w, float px) {
  float det = 1.0 - smoothstep(0.06, 0.3, px);     // fine detail where a pixel is smaller than it
  vec2 q = w + 5.0 * vec2(gn(w, 16.0), gn(w + 9.0, 16.0)); // a warp: no ruled patches
  vec3 leaves = mix(vec3(0.23, 0.20, 0.14), vec3(0.29, 0.24, 0.16), gn(q, 2.0));
  vec3 needles = vec3(0.20, 0.18, 0.12);
  vec3 loam = vec3(0.13, 0.11, 0.08);
  vec3 moss = vec3(0.20, 0.26, 0.12);
  vec3 c = mix(leaves, needles, smoothstep(0.38, 0.62, gfbm(q, 16.0)));
  c = mix(c, loam, smoothstep(0.52, 0.78, gfbm(q + 31.0, 8.0)) * 0.8);
  c = mix(c, moss, smoothstep(0.46, 0.7, gfbm(q + 63.0, 8.0)) * 0.9);
  // single leaves: a leaf-sized fleck per 0.25 m cell, a shade of its own
  vec2 lf = gcell(w, 0.25, 3.0);
  c *= mix(1.0, 0.78 + 0.42 * lf.x, det * smoothstep(0.42, 0.3, lf.y));
  // fallen twigs: thin dark lines along a ridge of the noise
  float tw = 1.0 - smoothstep(0.0, 0.035, abs(gn(q + 77.0, 2.0) - 0.5));
  c *= 1.0 - 0.35 * tw * det * step(0.55, gn(w, 4.0));
  // the broad shading of a wood's floor: deeper in the hollows
  c *= 0.82 + 0.3 * gn(q, 32.0);
  return c;
}
vec3 townFloor(vec2 w, float px) {
  float det = 1.0 - smoothstep(0.06, 0.3, px);
  vec2 q = w + 7.0 * vec2(gn(w, 32.0), gn(w + 5.0, 32.0));
  vec3 sand = vec3(0.60, 0.53, 0.41), earth = vec3(0.44, 0.39, 0.31), grass = vec3(0.40, 0.45, 0.26), mud = vec3(0.32, 0.27, 0.21);
  vec3 c = mix(sand, earth, 0.15 + 0.6 * smoothstep(0.3, 0.75, gfbm(q, 8.0)));
  c = mix(c, grass, smoothstep(0.6, 0.82, gfbm(q + 23.0, 8.0)) * (0.55 + 0.45 * gn(w, 1.0)));
  // foot paths: the ridges of a slow noise, packed darker and swept of grass
  float ridge = abs(gfbm(q + 51.0, 64.0) - 0.5);
  float path = 1.0 - smoothstep(0.012, 0.04, ridge);
  c = mix(c, earth * 0.86, path * 0.75);
  // tyre ruts and drag marks: short dark streaks
  c *= 1.0 - 0.12 * smoothstep(0.7, 0.9, gn(vec2(q.x * 0.25, q.y), 2.0)) * det;
  // grit and pebbles
  vec2 gr = gcell(w, 0.2, 9.0);
  c *= mix(1.0, 0.82 + 0.34 * gr.x, det * smoothstep(0.38, 0.22, gr.y));
  // litter: a scrap of paper, a rusted can, green glass, a rag (rare, small, square-ish)
  vec2 lp = w / 1.3, li = mod(floor(lp), vec2(${WRAP.toFixed(1)} / 1.3)), lf2 = fract(lp) - 0.5;
  float lh = gh(li + 13.0), la = gh(li + 5.3) * 3.1416;
  vec2 lr = mat2(cos(la), -sin(la), sin(la), cos(la)) * lf2;
  float bit = det * step(max(abs(lr.x) * 1.6, abs(lr.y) * 2.4), 0.16);
  float kind = fract(lh * 13.7);
  if (lh > 0.955) c = mix(c, kind < 0.35 ? vec3(0.70, 0.67, 0.59) : kind < 0.6 ? vec3(0.50, 0.42, 0.30) : kind < 0.85 ? vec3(0.42, 0.27, 0.17) : vec3(0.27, 0.36, 0.28), bit);
  // puddles in the low spots (and the damp ring round them)
  // puddles: small (a metre or three), only in the low corners of the yard (a slow mask), a damp rim round each
  float pm = smoothstep(0.7, 0.82, gn(w + 13.0, 48.0)), pn = gfbm(q + 91.0, 2.5);
  float damp = smoothstep(0.54, 0.6, pn) * pm, pd = smoothstep(0.6, 0.62, pn) * pm;
  c = mix(c, mud, damp * 0.4);
  c = mix(c, vec3(0.29, 0.27, 0.23), pd * 0.8);
  gPuddle = pd;
  c *= 0.94 + 0.1 * gn(q, 24.0);
  return c;
}
`;
const GROUND_MAP = /* glsl */`
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  {
    vec2 gw = mod(vGW, ${WRAP.toFixed(1)});
    float edge = smoothstep(464.0, 684.0, max(abs(vGW.x), abs(vGW.y)));
    vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.613 + vec2(0.37, 0.71);
    vec2 uv3 = mat2(0.28, 0.96, -0.96, 0.28) * vMapUv * 1.37 + vec2(0.11, 0.53);
    vec4 s2 = texture2D( map, uv2 ), s3 = texture2D( map, uv3 );
    // One value noise per weight (the full screen of desert pays for these: keep them cheap).
    // Never one lattice alone: the base tile is always at least a third under the others, so no 28 m cell shows bare.
    float k = (0.35 + 0.55 * smoothstep(0.25, 0.75, gn(gw + 3.0, 64.0))) * edge, k3 = (0.25 + 0.45 * smoothstep(0.3, 0.8, gn(gw + 211.0, 128.0))) * edge;
    sampledDiffuseColor = mix(mix(sampledDiffuseColor, s2, k), s3, k3);
    sampledDiffuseColor.rgb *= 1.0 + (gn(gw + 97.0, 256.0) - 0.5) * 0.22 * edge; // broad dune light and shade
  }
  diffuseColor *= sampledDiffuseColor;
#endif
`;
const GROUND_COLOR = /* glsl */`
  if (vFloor.x + vFloor.y > 0.002) {
    vec2 gw = mod(vGW, ${WRAP.toFixed(1)});
    float px = length(fwidth(vGW));
    if (vFloor.x > 0.001) diffuseColor.rgb = mix(diffuseColor.rgb, pow(forestFloor(gw, px), vec3(2.2)), smoothstep(0.0, 0.7, vFloor.x));
    if (vFloor.y > 0.001) { float tk = smoothstep(0.0, 0.9, vFloor.y); diffuseColor.rgb = mix(diffuseColor.rgb, pow(townFloor(gw, px), vec3(2.2)), tk); gPuddle *= tk; }
  }
`;
const GROUND_ROUGH = /* glsl */`
  roughnessFactor = mix(roughnessFactor, 0.16, gPuddle);
`;
export function groundSurface(mat, key = 'groundSurface1') {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${GROUND_VERT_HEAD}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${GROUND_VERT_BODY}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${GROUND_FRAG_HEAD}`)
      .replace('#include <map_fragment>', GROUND_MAP)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${GROUND_COLOR}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${GROUND_ROUGH}`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
