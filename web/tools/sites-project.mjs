#!/usr/bin/env node
// Bake every SITE row's world x,z (data/sites/*.js real.lat/lon) through the atlas projection (tools/atlas-project.mjs:
// the same quadratic fit through the usmap's real cities, the same inverse-distance correction, the same state law), into
// src/data/sites/xz.js. Off the mainland grid (AK, HI, PR, abroad): null. Run after the site rows change:
//   node tools/sites-project.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const U = JSON.parse(readFileSync(join(WEB, 'src/data/usmap.json'), 'utf8'));
const PHX = [-43250, 7250], K = 5.2;
// Real coordinates of the usmap towns that are real cities (id -> [lat, lon]).
const CITY_LL = {
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
const STATE_CODE = { ALABAMA: 'AL', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA', COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE',
  FLORIDA: 'FL', GEORGIA: 'GA', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA',
  MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT',
  NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI', WYOMING: 'WY' };
const LETTER = Object.fromEntries(Object.entries(U.state_legend).map(([ch, name]) => [STATE_CODE[name], ch]));
const OFF_GRID = new Set(['AK', 'HI', 'PR']);
const WATER = new Set(['ocean', 'island', 'water']);

// ---- 1. quadratic fit, normalised around the middle of the country
const N = (lat, lon) => [(lon + 96) / 15, (lat - 38) / 8];
const terms = ([x, y]) => [1, x, y, x * x, x * y, y * y];
function solve(A, b) { // Gaussian elimination with partial pivoting
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

// ---- 2. inverse-distance blend of the cities' leftover error
const km = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const REACH = 900; // km: a city's correction fades to nothing past this
function project(lat, lon) {
  const q = poly(lat, lon); let wx = 0, wy = 0, ws = 0;
  for (const p of pts) {
    const d = km([lat, lon], p.ll); if (d < 0.01) return [...p.u];
    if (d > REACH) continue; const w = (1 - d / REACH) ** 2 / (d * d); wx += w * p.r[0]; wy += w * p.r[1]; ws += w;
  }
  // a lone far city must not drag a point all the way: blend toward the bare fit by total weight
  const k = ws / (ws + 1 / (REACH * REACH / 16));
  return ws ? [q[0] + k * wx / ws, q[1] + k * wy / ws] : q;
}

// ---- 3. the state law
const cellOf = (u) => [Math.floor((u[0] - U.world_offset[0]) / U.cell_m), Math.floor((u[1] - U.world_offset[1]) / U.cell_m)];
const at = (c, r) => (r >= 0 && r < U.h && c >= 0 && c < U.w ? U.states_grid[r][c] : null);
function place(row) {
  if (!row.state || OFF_GRID.has(row.state)) return null;
  let u = project(row.lat, row.lon);
  const [c, r] = cellOf(u), here = at(c, r);
  if (here === null) return null;
  const want = LETTER[row.state];
  let snap = 0;
  if (want && here !== want && !(here === '.' && WATER.has(row.biome))) {
    let best = null; // nearest cell of the right state (rings outward)
    for (let d = 1; d < 40 && !best; d++)
      for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== d || at(c + dc, r + dr) !== want) continue;
        const dd = dr * dr + dc * dc; if (!best || dd < best.dd) best = { dc, dr, dd };
      }
    if (best) { u = [U.world_offset[0] + (c + best.dc + 0.5) * U.cell_m, U.world_offset[1] + (r + best.dr + 0.5) * U.cell_m]; snap = Math.round(Math.sqrt(best.dd) * 10) / 10; }
  }
  const r10 = (v) => Math.round(v / 10) * 10;
  return [r10((u[0] - PHX[0]) * K), r10((u[1] - PHX[1]) * K), snap];
}


const { SITES, BUNKER_REGIONS } = await import(pathToFileURL(join(WEB, 'src/data/sites/index.js')).href);
const out = {};
let placed = 0;
for (const s of SITES) { const v = place({ state: s.real?.state, lat: s.real?.lat, lon: s.real?.lon, biome: s.terrain?.water?.length ? 'water' : 'land' }); out[s.id] = v; if (v) placed++; }
const bk = (BUNKER_REGIONS ?? []).map((b) => place({ state: b.state, lat: b.lat, lon: b.lon, biome: 'land' }));
const body = Object.entries(out).map(([k, v]) => `  '${k}': ${v ? `[${v.join(', ')}]` : 'null'},`).join('\n');
const NL = String.fromCharCode(10);
const bunkers = bk.map((v) => '  ' + (v ? '[' + v.join(', ') + ']' : 'null') + ',').join(NL);
writeFileSync(join(WEB, 'src/data/sites/xz.js'), [
  '// Generated by tools/sites-project.mjs; do not edit by hand. [x, z, snap]: world metres (+x east, +z south, Phoenix 0,0) and',
  '// how many 500 m usmap cells the state law moved the point. null = off the mainland grid.',
  'export const SITES_XZ = {', body, '};',
  '// BUNKER_REGIONS (data/sites/index.js), in order: the real bases the vast vaults may stand at.',
  'export const BUNKER_XZ = [', bunkers, '];', ''].join(NL));
console.log(`sites ${SITES.length}, placed ${placed}, off grid ${SITES.length - placed}; bunker anchors ${bk.filter(Boolean).length}/${bk.length}`);
