// THE RUBBER SHEET (docs/design/WEB_SITES_TERRAIN.md §4 F1): real lat/lon <-> usmap metres <-> world metres, the same
// projection tools/atlas-project.mjs and tools/sites-project.mjs bake the atlas and the SITE rows with (a quadratic fit
// through the usmap towns that are real cities, plus an inverse-distance blend of each city's leftover error), without the
// state law (the land must be continuous; the state law moves single points). `unproject` inverts it by Newton steps.
//   project(lat, lon)   -> [ux, uy] usmap metres
//   toWorld(lat, lon)   -> [x, z] world metres (WEB_STREAMING F3: (u - PHX) * K)
//   unproject(x, z)     -> [lat, lon] for a world point (the real place the sheet puts there)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const U = JSON.parse(readFileSync(join(WEB, 'src/data/usmap.json'), 'utf8'));
export const PHX = [-43250, 7250], K = 5.2;
// Real coordinates of the usmap towns that are real cities (id -> [lat, lon]); kept equal to atlas-project.mjs.
export const CITY_LL = {
  seattle: [47.6062, -122.3321], portland: [45.5152, -122.6784], sanfrancisco: [37.7749, -122.4194], losangeles: [34.0522, -118.2437],
  sandiego: [32.7157, -117.1611], vegas: [36.1699, -115.1398], phoenix: [33.4484, -112.0740], saltlake: [40.7608, -111.8910],
  denver: [39.7392, -104.9903], albuquerque: [35.0844, -106.6504], elpaso: [31.7619, -106.4850], billings: [45.7833, -108.5007],
  cheyenne: [41.1400, -104.8202], minneapolis: [44.9778, -93.2650], omaha: [41.2565, -95.9345], kansascity: [39.0997, -94.5786],
  oklahomacity: [35.4676, -97.5164], dallas: [32.7767, -96.7970], sanantonio: [29.4241, -98.4936], houston: [29.7604, -95.3698],
  stlouis: [38.6270, -90.1994], memphis: [35.1495, -90.0490], neworleans: [29.9511, -90.0715], detroit: [42.3314, -83.0458],
  cincinnati: [39.1031, -84.5120], nashville: [36.1627, -86.7816], atlanta: [33.7490, -84.3880], jacksonville: [30.3322, -81.6557],
  tampa: [27.9506, -82.4572], miami: [25.7617, -80.1918], richmond: [37.5407, -77.4360], washington: [38.9072, -77.0369],
  philadelphia: [39.9526, -75.1652], newyork: [40.7128, -74.0060], boston: [42.3601, -71.0589], chicago: [41.8781, -87.6298],
};

const N = (lat, lon) => [(lon + 96) / 15, (lat - 38) / 8];
const terms = ([x, y]) => [1, x, y, x * x, x * y, y * y];
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
const towns = Object.fromEntries(U.towns.map((t) => [t.id, t.pos]));
const pts = Object.entries(CITY_LL).filter(([id]) => towns[id]).map(([id, ll]) => ({ id, ll, u: towns[id] }));
const fit = (axis) => {
  const A = Array.from({ length: 6 }, () => Array(6).fill(0)), b = Array(6).fill(0);
  for (const p of pts) { const t = terms(N(...p.ll)); for (let i = 0; i < 6; i++) { b[i] += t[i] * p.u[axis]; for (let j = 0; j < 6; j++) A[i][j] += t[i] * t[j]; } }
  return solve(A, b);
};
const CX = fit(0), CY = fit(1);
const poly = (lat, lon) => { const t = terms(N(lat, lon)); return [t.reduce((s, v, i) => s + v * CX[i], 0), t.reduce((s, v, i) => s + v * CY[i], 0)]; };
for (const p of pts) { const q = poly(...p.ll); p.r = [p.u[0] - q[0], p.u[1] - q[1]]; }
const km = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const REACH = 900;
// The sheet must be smooth for the land: the atlas's exact snap at a city (d < 10 m) is skipped (the blend's weight
// already pins the city to within a metre there).
export function project(lat, lon) {
  const q = poly(lat, lon); let wx = 0, wy = 0, ws = 0;
  for (const p of pts) {
    const d = Math.max(0.05, km([lat, lon], p.ll));
    if (d > REACH) continue; const w = (1 - d / REACH) ** 2 / (d * d); wx += w * p.r[0]; wy += w * p.r[1]; ws += w;
  }
  const k = ws / (ws + 1 / (REACH * REACH / 16));
  return ws ? [q[0] + k * wx / ws, q[1] + k * wy / ws] : q;
}
export const toWorld = (lat, lon) => { const u = project(lat, lon); return [(u[0] - PHX[0]) * K, (u[1] - PHX[1]) * K]; };
// World (x, z) -> [lat, lon]: Newton on the forward map with a numeric Jacobian, from a start guess (the last answer
// when walking a grid). Converges to centimetres in 3-5 steps; the sheet is smooth and orientation-preserving here.
export function unproject(x, z, guess = null) {
  let lat = guess ? guess[0] : 38, lon = guess ? guess[1] : -96;
  for (let it = 0; it < 12; it++) {
    const f = toWorld(lat, lon), ex = f[0] - x, ez = f[1] - z;
    if (Math.abs(ex) < 0.05 && Math.abs(ez) < 0.05) break;
    const h = 1e-4, fa = toWorld(lat + h, lon), fo = toWorld(lat, lon + h);
    const a = (fa[0] - f[0]) / h, b = (fo[0] - f[0]) / h, c = (fa[1] - f[1]) / h, d = (fo[1] - f[1]) / h, det = a * d - b * c;
    let dLat = (d * ex - b * ez) / det, dLon = (-c * ex + a * ez) / det;
    const m = Math.max(Math.abs(dLat), Math.abs(dLon)); if (m > 2) { dLat *= 2 / m; dLon *= 2 / m; } // a damped step far from home
    lat -= dLat; lon -= dLon;
  }
  return [lat, lon];
}
export const USMAP = U;
