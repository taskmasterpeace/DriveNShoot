#!/usr/bin/env node
// Offline checks of the real-terrain asset and world/realterrain.js (docs/design/WEB_TERRAIN.md §8), no browser:
//   node tools/terrain-check.mjs          (from web/)  exit 1 on a failure
// - the chunk grids (hinted nearest-segment walk) equal the brute-force ground at every sampled vertex
// - neighbouring chunks agree on every shared edge vertex (no holes, no steps)
// - the road bed under the centreline is the surveyed profile, never steeper than the grade (+3%, the chamfer's error)
// - the steepest ground anywhere sampled is drivable (the batter, + the grid's diagonal)
// - the same chunks build to the same heights twice (a pure function)
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
register('data:text/javascript,' + encodeURIComponent(`export async function load(url, ctx, next) {
  if (url.endsWith('.json')) return next(url, { ...ctx, importAttributes: { type: 'json' } });
  return next(url, ctx);
}`));
const WEB = fileURLToPath(new URL('..', import.meta.url));
const mod = (p) => import(pathToFileURL(join(WEB, p)).href);
const { WorldIndex } = await mod('src/world/worldindex.js');
const { RealTerrain, decodeTerrain } = await mod('src/world/realterrain.js');
const { TERRAIN } = await mod('src/data/terrain.js');
const inflate = async (b) => new Uint8Array(gunzipSync(b));
const asset = await decodeTerrain(readFileSync(join(WEB, 'src/data/terrain/i10.bin')), inflate);
const W = new WorldIndex(), T = new RealTerrain(asset, W), T2 = new RealTerrain(await decodeTerrain(readFileSync(join(WEB, 'src/data/terrain/i10.bin')), inflate), W);
const cl = W.cl, N = 33;
let hintVsBrute = 0, seam = 0, twice = 0, grids = 0;
const t0 = performance.now();
for (let i = 0; i < cl.n; i += 160) {
  const cx = Math.floor(cl.x[i] / 256) + ((i / 160) % 3) - 1, cz = Math.floor(cl.z[i] / 256) + (((i / 320) % 3) | 0) - 1;
  const g = T.gridOf(cx, cz), g2 = T2.gridOf(cx, cz); grids++;
  const segs = T.segsNear(cx * 256, cz * 256, cx * 256 + 256, cz * 256 + 256);
  for (let j = 0; j < N; j += 4) for (let k = 0; k < N; k += 4) hintVsBrute = Math.max(hintVsBrute, Math.abs(T.exact(cx * 256 + k * 8, cz * 256 + j * 8, segs) - g[j * N + k]));
  for (let q = 0; q < g.length; q++) twice = Math.max(twice, Math.abs(g[q] - g2[q]));
  const ge = T.gridOf(cx + 1, cz), gs = T.gridOf(cx, cz + 1);
  for (let j = 0; j < N; j++) seam = Math.max(seam, Math.abs(g[j * N + N - 1] - ge[j * N]), Math.abs(g[(N - 1) * N + j] - gs[j]));
}
const msGrid = (performance.now() - t0) / grids / 3;
let bed = 0, grade = 0, prev = null;
for (let i = 0; i < cl.n; i += 4) { const h = T.at(cl.x[i], cl.z[i]); bed = Math.max(bed, Math.abs(h - T.yr[i])); if (prev) grade = Math.max(grade, Math.abs(h - prev.h) / (cl.s[i] - prev.s)); prev = { h, s: cl.s[i] }; }
let slope = 0;
for (const [, g] of T.grids) for (let j = 0; j < N - 1; j++) for (let k = 0; k < N - 1; k++) { const a = g[j * N + k]; slope = Math.max(slope, Math.abs(g[j * N + k + 1] - a) / 8, Math.abs(g[(j + 1) * N + k] - a) / 8); }
const res = {
  grids, msPerGrid: +msGrid.toFixed(2), hintVsBrute: +hintVsBrute.toFixed(5), seam, twice, roadBedVsSurvey: +bed.toFixed(3), roadGradeMax: +grade.toFixed(4), groundSlopeMax: +slope.toFixed(3),
  survey: T.stats, surveyMs: T.surveyMs, pads: T.pads.map((p) => `${p.id} r ${Math.round(p.r)} m at ${Math.round(p.P)} m`),
};
const fails = [];
if (hintVsBrute > 0.001) fails.push('grid != brute force');
if (seam > 0) fails.push('a seam');
if (twice > 0) fails.push('not a pure function');
if (bed > 0.3) fails.push('road bed off its survey'); // the 8 m triangles against the profile's curves
if (grade > T.g * 1.03 + 0.001) fails.push('road steeper than the grade');
if (slope > TERRAIN.batter * 1.5) fails.push('ground steeper than the batter allows');
console.log(JSON.stringify({ ok: !fails.length, fails, ...res }, null, 1));
process.exitCode = fails.length ? 1 : 0;
