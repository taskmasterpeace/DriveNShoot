#!/usr/bin/env node
// Derive world x/z for every atlas row (docs/design/WEB_ATLAS.md §4 F1) from its real lat/lon, and write them into the
// generated block at the end of src/data/atlas.js (and the tables of docs/design/WEB_ATLAS.md). usmap.json is a hand-drawn map, not a projection, so this fits one:
//   1. a quadratic in (lon, lat) through the usmap towns whose real coordinates we know (CITY_LL below), least squares;
//   2. plus an inverse-distance blend of each city's leftover error, so a real city lands exactly on its usmap town and
//      places near it keep their offset from it;
//   3. then the state law: if the point lands in the wrong state's cell of states_grid, it moves to the nearest cell of
//      its own state (counted as `snap`, in 500 m cells). Water rows may sit in ocean cells; abroad, Alaska, Hawaii and
//      Puerto Rico are off the grid (null).
//   world = (u - PHX) * K       (WEB_STREAMING.md §4 F3: PHX = (-43250, 7250), K = 5.2)
//   node tools/atlas-project.mjs           rewrite the block and print the fit report
//   node tools/atlas-project.mjs --check   exit 1 if the block in atlas.js is stale
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const ATLAS = join(WEB, 'src/data/atlas.js');
const U = JSON.parse(readFileSync(join(WEB, 'src/data/usmap.json'), 'utf8'));
const { ATLAS_SITES, ATLAS_BASES } = await import(pathToFileURL(ATLAS).href);

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

const out = { sites: {}, bases: {} };
for (const s of ATLAS_SITES) out.sites[s.id] = place(s);
for (const b of ATLAS_BASES) out.bases[b.id] = place({ ...b, biome: b.kind === 'navy' ? 'water' : 'land' });
const fmt = (o) => '{\n' + Object.entries(o).map(([k, v]) => `    ${k}: ${v ? `[${v.join(', ')}]` : 'null'},`).join('\n') + '\n  }';
const block = '// <generated:xz> written by tools/atlas-project.mjs; do not edit by hand. [x, z, snap]: world metres (+x east, +z\n' +
  '// south, Phoenix 0,0) and how many 500 m usmap cells the state law moved the point (0 = none). null = off the mainland grid.\n' +
  `export const ATLAS_XZ = {\n  sites: ${fmt(out.sites)},\n  bases: ${fmt(out.bases)},\n};\n// </generated:xz>`;
const src = readFileSync(ATLAS, 'utf8');
const re = /\/\/ <generated:xz>[\s\S]*?\/\/ <\/generated:xz>/;
if (!re.test(src)) { console.error('atlas.js has no <generated:xz> block'); process.exit(2); }
const next = src.replace(re, () => block);

// ---- the doc's tables (docs/design/WEB_ATLAS.md, between <!-- atlas:NAME --> and <!-- /atlas:NAME --> markers)
const DOC = join(WEB, '../docs/design/WEB_ATLAS.md');
const { ATLAS_CAST, ATLAS_SITUATIONS, HOLDERS, RULERS, footprint } = await import(pathToFileURL(ATLAS).href);
const holder = (h, st) => (h === 'ruler' ? (RULERS[st] ?? 'the local ruler') : HOLDERS[h]?.name ?? h);
const cell = (s) => String(s).replace(/\|/g, '/').replace(/\n/g, ' ');
const xz = (v) => (v ? `${(v[0] / 1000).toFixed(1)}, ${(v[1] / 1000).toFixed(1)}${v[2] ? ` (moved ${v[2]})` : ''}` : 'off grid');
const tables = {
  sites: ['| # | Site | Real place | lat, lon | world x, z (km) | DSOA kind | Combat | Biome: terrain | Held by | Placement |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...ATLAS_SITES.map((s, i) => `| ${i + 1} | **${s.name}** | ${cell(s.real)} | ${s.lat.toFixed(3)}, ${s.lon.toFixed(3)} | ${xz(out.sites[s.id])} | ${s.kind} | ${ATLAS_SITUATIONS[s.situation].name} | ${s.biome}: ${cell(s.terrain)} | ${cell(holder(s.holder, s.state))} | ${s.conf} |`)],
  site_lines: ['| Site | What it is in DSOA |', '|---|---|', ...ATLAS_SITES.map((s) => `| ${s.name} | ${cell(s.what)} |`)],
  cast: ['| Archetype | Group | Role in our world | Kit (engine ids; *new* = not built) | Moves | Cover | Retreat | Ammo | Faction |',
    '|---|---|---|---|---|---|---|---|---|',
    ...ATLAS_CAST.map((c) => { const k = c.kit; const kit = [...(k.guns ?? []).map((g) => `gun ${g}`), ...(k.throw ?? []).map((t) => `throw ${t}`), ...(k.veh ?? []).map((v) => `veh ${v}`), ...(k.new ?? []).map((n) => `*${n}*`)].join(', ');
      return `| **${c.name}** | ${c.group} | ${cell(c.role)} | ${cell(kit)} | ${cell(c.fight.move)} | ${cell(c.fight.cover)} | ${cell(c.fight.retreat)} | ${cell(c.fight.ammo)} | ${cell(HOLDERS[c.holder]?.name ?? c.holder)} |`; })],
  situations: ['| Situation | The shape | Sites | What our engine already does | What is missing |', '|---|---|---|---|---|',
    ...Object.entries(ATLAS_SITUATIONS).map(([id, t]) => `| **${t.name}** (\`${id}\`) | ${cell(t.shape)} | ${ATLAS_SITES.filter((s) => s.situation === id).length} | ${cell(t.have.join('; '))} | ${cell(t.missing.join('; '))} |`)],
  bases: ['| State | Installation | lat, lon | Real area (km²) | Source | Fence side at 1:14 (m) | Built (m) | Kind | DSOA | Held by | world x, z (km) | Ring row |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...ATLAS_BASES.map((b) => { const f = footprint(b.area_km2); return `| ${b.state} | **${b.name}** | ${b.lat.toFixed(3)}, ${b.lon.toFixed(3)} | ${b.area_km2} | ${b.areaSrc} | ${f.side_m} | ${f.built_m} | ${b.kind} | ${b.dsoa} | ${cell(holder(b.holder, b.state))} | ${xz(out.bases[b.id])} | ${b.carousel ?? ''} |`; })],
  base_lines: ['| Installation | In DSOA |', '|---|---|', ...ATLAS_BASES.map((b) => `| ${b.name} (${b.state}) | ${cell(b.what)} |`)],
};
let doc = readFileSync(DOC, 'utf8');
const docNext = Object.entries(tables).reduce((d, [k, rows]) => d.replace(new RegExp(`<!-- atlas:${k} -->[\\s\\S]*?<!-- /atlas:${k} -->`), () => `<!-- atlas:${k} -->\n${rows.join('\n')}\n<!-- /atlas:${k} -->`), doc);

if (process.argv.includes('--check')) {
  const ok = next === src && docNext === doc;
  console.log(ok ? 'atlas xz and doc tables up to date' : 'STALE: run node tools/atlas-project.mjs');
  process.exit(ok ? 0 : 1);
}
writeFileSync(ATLAS, next);
writeFileSync(DOC, docNext);

// ---- report
const rms = Math.sqrt(pts.reduce((s, p) => s + p.r[0] ** 2 + p.r[1] ** 2, 0) / pts.length);
const worst = [...pts].sort((a, b) => Math.hypot(...b.r) - Math.hypot(...a.r)).slice(0, 4).map((p) => `${p.id} ${Math.round(Math.hypot(...p.r))} m`);
const orl = project(28.5383, -81.3792);
const all = [...Object.entries(out.sites), ...Object.entries(out.bases)];
const on = all.filter(([, v]) => v), snapped = on.filter(([, v]) => v[2] > 0);
console.log(`fit: ${pts.length} cities, quadratic rms ${Math.round(rms)} usmap m before the city blend (worst: ${worst.join(', ')})`);
console.log(`check: Orlando lands at usmap (${Math.round(orl[0])}, ${Math.round(orl[1])}); WEB_STREAMING plans (-3570, 15790)`);
console.log(`rows: ${ATLAS_SITES.length} sites + ${ATLAS_BASES.length} bases; ${on.length} on the grid, ${all.length - on.length} off it; ${snapped.length} moved by the state law` +
  (snapped.length ? ` (largest ${Math.max(...snapped.map(([, v]) => v[2]))} cells: ${snapped.sort((a, b) => b[1][2] - a[1][2]).slice(0, 6).map(([k, v]) => `${k} ${v[2]}`).join(', ')})` : ''));
