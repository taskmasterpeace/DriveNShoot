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
  float kind = floor(seed * 5.0);
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
    vec2 cell = floor(vec2(a / 1.25, b / 2.5));
    float r = rh1(cell + seed * 31.0);
    vec2 f = vec2(fract(a / 1.25), fract(b / 2.5));
    if (r < 0.20) c = vec3(0.16, 0.38, 0.62);            // blue tarp
    else if (r < 0.30) c = vec3(0.30, 0.48, 0.26);       // green tarp
    else if (r < 0.38) c = vec3(0.86, 0.50, 0.16);       // orange tarp
    else if (r < 0.55) c = vec3(0.52, 0.32, 0.20);       // rust sheet
    else if (r < 0.72) c = vec3(0.70, 0.56, 0.38);       // plywood
    else if (r < 0.84) {                                  // a solar panel: cells in a frame, a glint
      vec2 g = fract(vec2(a / 0.31, b / 0.31));
      float line = step(0.9, max(g.x, g.y));
      c = mix(vec3(0.07, 0.12, 0.20), vec3(0.62, 0.64, 0.66), line);
    } else c = vec3(0.64, 0.62, 0.58);                   // bare sheet metal
    // Tarps lie in folds; every sheet has a lapped edge.
    if (r < 0.38) c *= 0.86 + 0.18 * sin(a * 9.0 + b * 3.0 + r * 40.0);
    float edge = step(min(min(f.x, 1.0 - f.x) * 1.25, min(f.y, 1.0 - f.y) * 2.5), 0.06);
    c *= 1.0 - 0.28 * edge;
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
  mat.customProgramCacheKey = () => 'roofSurface4';
  return mat;
}
