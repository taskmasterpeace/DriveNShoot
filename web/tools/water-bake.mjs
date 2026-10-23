#!/usr/bin/env node
// THE WATER BAKE (docs/design/WEB_RIVERS.md): real rivers, washes, canals and lakes along the I-10 corridor, laid onto our
// world as L1 rows (src/data/water/i10.json). The engine (src/world/rivers.js) carves them, fills them, and bridges them.
//   node tools/water-bake.mjs              (from web/) fetch what is missing, write src/data/water/i10.json + the map
//   node tools/water-bake.mjs --offline    use only the cache (fails if something is missing)
//
// Sources (public domain; every download is recorded in .water-cache/manifest.json and in the rows' meta):
//   rivers, washes, canals   USGS National Hydrography Dataset (NHD), flowlines, from the USGS National Map's public
//                            ArcGIS service (hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer, layers 4 and 6)
//   lakes, playas            NHD waterbodies (layer 10)
//   the road (for the map)   TIGER/Line 2023 primary roads (shared with the terrain bake's cache when it is there)
//
// The mapping is the terrain's strip map (tools/strip-map.mjs, run INVERSE): a real point finds its arc length along the
// real I-10 and its offset off it, and lands at the same arc length along our road, the offset compressed by the same
// sigma. So with real terrain on, every river lies in its own valley. Widths and depths are NOT compressed (like heights):
// they are gameplay numbers per row (a boat must fit, a car must be able to drown), from the table below.
import { register } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';

register('data:text/javascript,' + encodeURIComponent(`export async function load(url, ctx, next) {
  if (url.endsWith('.json')) return next(url, { ...ctx, importAttributes: { type: 'json' } });
  return next(url, ctx);
}`));

const WEB = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(WEB, '.water-cache');
const TERRAIN_CACHE = join(WEB, '.terrain-cache');
const OUT = join(WEB, 'src/data/water/i10.json');
const RENDERS = join(WEB, '../docs/renders/web/rivers');
const OFFLINE = process.argv.includes('--offline');
const log = (...a) => console.log('[water]', ...a);
mkdirSync(CACHE, { recursive: true }); mkdirSync(dirname(OUT), { recursive: true }); mkdirSync(RENDERS, { recursive: true });

const { WorldIndex } = await import(pathToFileURL(join(WEB, 'src/world/worldindex.js')).href);
const { TERRAIN } = await import(pathToFileURL(join(WEB, 'src/data/terrain.js')).href);
const { STREAM } = await import(pathToFileURL(join(WEB, 'src/data/streaming.js')).href);
const { WATER } = await import(pathToFileURL(join(WEB, 'src/data/water.js')).href);
const { buildStripMap } = await import(pathToFileURL(join(WEB, 'tools/strip-map.mjs')).href);

const SOURCES = {
  nhd: {
    name: 'USGS National Hydrography Dataset (NHD), flowlines and waterbodies', url: 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer',
    licence: 'Public domain (U.S. Geological Survey); USGS-authored data carry no copyright, credit requested',
    attribution: 'National Hydrography Dataset, U.S. Geological Survey (accessed through The National Map).',
  },
  tiger: {
    name: 'TIGER/Line 2023 Primary Roads', url: 'https://www2.census.gov/geo/tiger/TIGER2023/PRIMARYROADS/tl_2023_us_primaryroads.zip',
    licence: 'Public domain (U.S. Census Bureau)', attribution: 'TIGER/Line Shapefiles, U.S. Census Bureau (2023).',
  },
};
const MANIFEST = join(CACHE, 'manifest.json');
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { files: {} };
const ledger = { nhd: { files: 0, bytes: 0, fetchedNow: 0 }, tiger: { files: 0, bytes: 0, fetchedNow: 0 } };
async function cached(src, rel, url) {
  const p = join(CACHE, rel);
  if (!existsSync(p)) {
    if (OFFLINE) throw new Error(`--offline and ${rel} is not cached`);
    mkdirSync(dirname(p), { recursive: true });
    let lastErr;
    for (let a = 0; a < 4; a++) {
      try {
        const r = await fetch(url, { headers: { 'user-agent': 'dsoa-water-bake/1 (game hydrography from public data)' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const b = Buffer.from(await r.arrayBuffer());
        writeFileSync(p, b);
        manifest.files[rel] = { src, url, bytes: b.length, fetched: new Date().toISOString() };
        ledger[src].fetchedNow += b.length;
        break;
      } catch (e) { lastErr = e; await new Promise((res) => setTimeout(res, 800 * (a + 1))); }
    }
    if (!existsSync(p)) throw new Error(`fetch ${url}: ${lastErr?.message}`);
  }
  const b = readFileSync(p);
  ledger[src].files++; ledger[src].bytes += b.length;
  manifest.files[rel] ??= { src, url, bytes: b.length, fetched: 'before this run' };
  return b;
}

// ---- what to bake: every named river, wash and canal the corridor meets, and the lakes in reach ------------------------
// kind: river (water in it), wash (a dry sand channel), canal (water, steep concrete sides). w and d are GAME metres (the
// gameplay scale, not the compression): a river is wide enough for a boat and deep enough to drown a car; a wash is a dry
// bed `bed` metres below its banks. layer: NHD small-scale flowlines (4) or large-scale (6) where the small scale lacks it.
const RIVERS = [
  { id: 'colorado', gnis: 'Colorado River', name: 'THE COLORADO', kind: 'river', flow: 'perennial', w: 44, d: 3.4, note: 'the AZ/CA line at Blythe: the one big river I-10 crosses' },
  { id: 'riogrande', gnis: 'Rio Grande', name: 'THE RIO GRANDE', kind: 'river', flow: 'perennial', w: 30, d: 2.6, note: 'I-10 crosses it at Las Cruces, then runs down its valley to El Paso' },
  { id: 'sanpedro', gnis: 'San Pedro River', name: 'SAN PEDRO RIVER', kind: 'river', flow: 'intermittent', w: 18, d: 1.1, note: 'one of the last rivers in the desert that still runs; shallow, with fords' },
  { id: 'cap', gnis: 'Central Arizona Project Aqueduct', layer: 6, like: true, name: 'THE AQUEDUCT', kind: 'canal', flow: 'perennial', w: 16, d: 2.8, note: 'the Central Arizona Project canal: concrete, steep-sided, still full in places' },
  { id: 'gila', gnis: 'Gila River', name: 'GILA WASH', kind: 'wash', flow: 'ephemeral', w: 36, bed: 1.6, note: 'dammed upstream long before the war; a wide dry bed at I-10' },
  { id: 'santacruz', gnis: 'Santa Cruz River', name: 'SANTA CRUZ WASH', kind: 'wash', flow: 'ephemeral', w: 26, bed: 1.4 },
  { id: 'rillito', gnis: 'Rillito River', name: 'RILLITO WASH', kind: 'wash', flow: 'ephemeral', w: 20, bed: 1.2 },
  { id: 'cienega', gnis: 'Cienega Creek', name: 'CIENEGA CREEK', kind: 'wash', flow: 'intermittent', w: 14, bed: 1.1 },
  { id: 'sansimon', gnis: 'San Simon River', name: 'SAN SIMON WASH', kind: 'wash', flow: 'ephemeral', w: 20, bed: 1.2 },
  { id: 'hassayampa', gnis: 'Hassayampa River', name: 'HASSAYAMPA WASH', kind: 'wash', flow: 'ephemeral', w: 28, bed: 1.4 },
  { id: 'centennial', gnis: 'Centennial Wash', name: 'CENTENNIAL WASH', kind: 'wash', flow: 'ephemeral', w: 20, bed: 1.2 },
  { id: 'aguafria', gnis: 'Agua Fria River', name: 'AGUA FRIA WASH', kind: 'wash', flow: 'ephemeral', w: 26, bed: 1.4 },
  { id: 'salt', gnis: 'Salt River', name: 'SALT WASH', kind: 'wash', flow: 'ephemeral', w: 32, bed: 1.6 },
  { id: 'whitewater', gnis: 'Whitewater River', name: 'WHITEWATER WASH', kind: 'wash', flow: 'ephemeral', w: 24, bed: 1.3 },
  { id: 'sangorgonio', gnis: 'San Gorgonio River', name: 'SAN GORGONIO WASH', kind: 'wash', flow: 'ephemeral', w: 18, bed: 1.1 },
  { id: 'santaana', gnis: 'Santa Ana River', name: 'SANTA ANA WASH', kind: 'wash', flow: 'ephemeral', w: 28, bed: 1.4 },
  { id: 'sangabriel', gnis: 'San Gabriel River', name: 'SAN GABRIEL RIVER', kind: 'canal', flow: 'perennial', w: 16, d: 1.4, note: 'a concrete flood channel with a trickle in it' },
  { id: 'lariver', gnis: 'Los Angeles River', name: 'THE LA RIVER', kind: 'canal', flow: 'perennial', w: 18, d: 1.2, note: 'the concrete channel' },
];
const LAKES = [
  { id: 'salton', gnis: 'Salton Sea', name: 'THE SALTON SEA', kind: 'lake', d: 4.5, shelf: 0.05, note: 'a dead inland sea south of Indio' },
];
const BOX = '-118.75,30.6,-104.6,34.4';
const nhdQuery = (layer, where, offset) => `${SOURCES.nhd.url}/${layer}/query?where=${encodeURIComponent(where)}&geometry=${encodeURIComponent(BOX)}&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&outFields=${layer === 6 ? 'gnis_name,fcode' : 'GNIS_NAME,FCODE'}&returnGeometry=true&maxAllowableOffset=${offset}&f=geojson`;

// ---- the strip map --------------------------------------------------------------------------------------------------
const W = new WorldIndex();
const tigerRel = 'tiger/tl_2023_us_primaryroads.zip';
const tigerZip = existsSync(join(TERRAIN_CACHE, tigerRel)) ? readFileSync(join(TERRAIN_CACHE, tigerRel)) : await cached('tiger', tigerRel, SOURCES.tiger.url);
if (existsSync(join(TERRAIN_CACHE, tigerRel))) { ledger.tiger.files++; ledger.tiger.bytes += tigerZip.length; }
const M = buildStripMap({ W, TERRAIN, tigerZip, log });
// It must be the terrain asset's map: same anchors (within 2 m), or the rivers would miss their valleys.
{
  const b = readFileSync(join(WEB, 'src/data/terrain/i10.bin')), hl = b.readUInt32LE(8), hdr = JSON.parse(b.subarray(12, 12 + hl).toString());
  for (const a of hdr.mapping.anchors) {
    const g = M.anchorsGame[a.town], r = M.anchorsReal[a.town];
    if (Math.abs(g - a.sGame) > 2 || Math.abs(r - a.rReal) > 2) throw new Error(`strip map disagrees with the terrain asset at ${a.town}: game ${g} vs ${a.sGame}, real ${r} vs ${a.rReal}`);
  }
  log(`strip map agrees with the terrain asset (anchors ${hdr.mapping.anchors.map((a) => a.town).join(', ')}); compression 1:${M.sigmaW.toFixed(2)} west, 1:${M.sigmaE.toFixed(2)} east`);
  // Round trip: world -> real -> world, inside the band.
  let worst = 0;
  for (let k = 0; k < 400; k++) {
    const s = 1000 + ((W.cl.L - 2000) * k) / 400, f = W.at(s), d = ((k * 37) % 9000) - 4500;
    const x = f.x + f.nx * d, z = f.z + f.nz * d, [mx, my] = M.strip(x, z), [lon, lat] = M.toLL(mx, my), q = M.toWorld(lon, lat);
    if (q) worst = Math.max(worst, Math.hypot(q.x - x, q.z - z));
  }
  log(`inverse round trip: worst ${worst.toFixed(2)} m over 400 points in the band`);
  if (worst > 5) throw new Error(`the inverse strip map is off by ${worst.toFixed(1)} m`);
}

// Where water may stand: inside the band, past Phoenix's pad (the island and the ring keep their own water), inside the
// dust wall, and on the baked land's rectangle.
const keep = (x, z, q) => q.inBand && Math.hypot(x, z) > WATER.phoenixClear && Math.hypot(x, z) < STREAM.dustWall - WATER.wallClear && Math.abs(q.d) < WATER.bakeBand;

// ---- rivers -----------------------------------------------------------------------------------------------------------
// NHD flowlines come as many short pieces, digitised downstream. Join them end to start into chains (the longest
// continuous run of the named river), map each vertex, keep the runs that stay in reach, resample, simplify.
function chains(lines) {
  const key = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const byStart = new Map();
  lines.forEach((l, i) => { const k = key(l[0]); (byStart.get(k) ?? byStart.set(k, []).get(k)).push(i); });
  const hasPred = new Set(lines.map((l) => key(l[l.length - 1])));
  const used = new Set(), out = [];
  const order = lines.map((_, i) => i).sort((a, b) => (hasPred.has(key(lines[a][0])) ? 1 : 0) - (hasPred.has(key(lines[b][0])) ? 1 : 0));
  for (const i0 of order) {
    if (used.has(i0)) continue;
    let chain = [...lines[i0]]; used.add(i0);
    for (;;) {
      const nx = (byStart.get(key(chain[chain.length - 1])) ?? []).find((j) => !used.has(j));
      if (nx === undefined) break;
      used.add(nx); chain = chain.concat(lines[nx].slice(1));
    }
    out.push(chain);
  }
  return out;
}
const resample = (pts, step) => {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.max(2, Math.ceil(L / step) + 1), out = []; let j = 0;
  for (let i = 0; i < n; i++) { const t = (i / (n - 1)) * L; while (j < cum.length - 2 && cum[j + 1] < t) j++; const f = (t - cum[j]) / (cum[j + 1] - cum[j] || 1); out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f]); }
  return out;
};
// Chaikin twice: the NHD's generalised kinks become curves (a river does not turn a corner).
const chaikin = (p) => { const o = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } o.push(p[p.length - 1]); return o; };
function simplify(pts, tol) { // Douglas-Peucker
  if (pts.length < 3) return pts;
  const keepI = new Uint8Array(pts.length); keepI[0] = keepI[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, az] = pts[a], [bx, bz] = pts[b], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / l; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keepI[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keepI[i]);
}
const hashStr = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

const rivers = [], report = [];
for (const R of RIVERS) {
  const layer = R.layer ?? 4, f = layer === 6 ? 'gnis_name' : 'GNIS_NAME';
  const where = R.like ? `${f} LIKE '${R.gnis.replace(/'/g, "''")}%'` : `${f}='${R.gnis.replace(/'/g, "''")}'`;
  const b = await cached('nhd', `nhd/${R.id}.geojson`, nhdQuery(layer, where, 0.0005));
  const gj = JSON.parse(b.toString('utf8'));
  const lines = [];
  for (const ft of gj.features ?? []) { const g = ft.geometry; if (!g) continue; if (g.type === 'LineString') lines.push(g.coordinates); else if (g.type === 'MultiLineString') lines.push(...g.coordinates); }
  const runs = [];
  for (const ch of chains(lines)) {
    let run = [];
    const flush = () => { if (run.length > 1) runs.push(run); run = []; };
    for (const [lon, lat] of ch) {
      const q = M.toWorld(lon, lat);
      if (!q || !keep(q.x, q.z, q)) { flush(); continue; }
      run.push([q.x, q.z]);
    }
    flush();
  }
  let kept = 0, k = 0;
  for (const run of runs) {
    let L = 0; for (let i = 1; i < run.length; i++) L += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]);
    if (L < WATER.minRun) continue;
    const pts = simplify(chaikin(chaikin(resample(run, 24))), 1.2).map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
    const id = runs.length > 1 ? `${R.id}-${++k}` : R.id;
    // A river (not a canal) gets a ford: a gravel bar FORD_OFF metres downstream of where it comes nearest the road (or
    // upstream, if it ends first), where a car can cross off the road and a walker wades.
    let fords;
    if (R.kind === 'river') {
      let ni = 0, nd = Infinity;
      pts.forEach((p, i) => { const d = W.project(p[0], p[1], 3000).d; if (d < nd) { nd = d; ni = i; } });
      const walk = (dir) => { let acc = 0, i = ni; while (i + dir >= 0 && i + dir < pts.length && acc < WATER.fordOff) { acc += Math.hypot(pts[i + dir][0] - pts[i][0], pts[i + dir][1] - pts[i][1]); i += dir; } return acc >= WATER.fordOff ? i : -1; };
      const fi = walk(1) >= 0 ? walk(1) : walk(-1);
      if (fi >= 0) fords = [{ i: fi, d: WATER.fordDepth, len: 30 }];
    }
    rivers.push({ id, name: R.name, kind: R.kind, flow: R.flow, w: R.w, ...(R.d ? { d: R.d } : {}), ...(R.bed ? { bed: R.bed } : {}), seed: hashStr(id) % 100000,
      src: `USGS NHD flowlines "${R.gnis}" (layer ${layer}), strip-mapped onto I-10`, ...(R.note ? { note: R.note } : {}), ...(fords ? { fords } : {}), pts });
    kept += L;
  }
  report.push(`${R.id}: ${lines.length} NHD pieces, ${runs.length} runs in reach, ${(kept / 1000).toFixed(1)} km kept`);
}
// ---- lakes -------------------------------------------------------------------------------------------------------------
const lakes = [];
for (const Lk of LAKES) {
  const b = await cached('nhd', `nhd/lake-${Lk.id}.geojson`, nhdQuery(10, `GNIS_NAME='${Lk.gnis}'`, 0.002).replace('outFields=GNIS_NAME,FCODE', 'outFields=GNIS_NAME,FTYPE'));
  const gj = JSON.parse(b.toString('utf8'));
  let best = null;
  for (const ft of gj.features ?? []) {
    const g = ft.geometry; if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) { const ring = poly[0]; if (!best || ring.length > best.length) best = ring; }
  }
  if (!best) { report.push(`${Lk.id}: not found`); continue; }
  const pts = [];
  for (const [lon, lat] of best) { const q = M.toWorld(lon, lat); if (q && Math.hypot(q.x, q.z) < STREAM.dustWall) pts.push([Math.round(q.x), Math.round(q.z)]); }
  // A ring: drop the closing point, cut it at the vertex farthest from the first, simplify both halves (DP on a closed
  // ring would see a zero-length chord and keep nothing).
  if (pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  let far = 0; for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i;
  const simp = far > 0 ? [...simplify(pts.slice(0, far + 1), 6), ...simplify([...pts.slice(far), pts[0]], 6).slice(1, -1)] : pts;
  if (simp.length < 4) { report.push(`${Lk.id}: out of reach`); continue; }
  lakes.push({ id: Lk.id, name: Lk.name, kind: Lk.kind, d: Lk.d, ...(Lk.shelf ? { shelf: Lk.shelf } : {}), src: `USGS NHD waterbody "${Lk.gnis}" (layer 10), strip-mapped onto I-10`, note: Lk.note, pts: simp });
  report.push(`${Lk.id}: ${best.length} NHD vertices -> ${simp.length}`);
}
for (const r of report) log(r);

// ---- write the rows -----------------------------------------------------------------------------------------------------
const rows = {
  meta: { note: 'GENERATED by tools/water-bake.mjs from public hydrography. Do not edit by hand: change the tables in the tool (or add authored rows in src/data/water.js) and re-run it.',
    region: 'I-10 Los Angeles - Phoenix - El Paso', generated: new Date().toISOString().slice(0, 10), dataHash: W.dataHash,
    mapping: { kind: 'strip (inverse)', anchors: Object.keys(M.anchorsGame).map((k) => ({ town: k, sGame: Math.round(M.anchorsGame[k]), rReal: Math.round(M.anchorsReal[k]) })) },
    sources: Object.entries(SOURCES).map(([k, s]) => ({ id: k, name: s.name, url: s.url, licence: s.licence, attribution: s.attribution, files: ledger[k].files, bytes: ledger[k].bytes })) },
  rivers, lakes,
};
writeFileSync(OUT, JSON.stringify(rows));
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
log(`wrote ${OUT.replace(WEB, '')}: ${rivers.length} rivers/washes/canals, ${lakes.length} lakes, ${(JSON.stringify(rows).length / 1024).toFixed(0)} KB`);
for (const [k, l] of Object.entries(ledger)) log(`source ${k}: ${l.files} files, ${(l.bytes / 1048576).toFixed(1)} MB used, ${(l.fetchedNow / 1048576).toFixed(1)} MB fetched this run`);

// ---- the map: the corridor, every river and lake, every crossing ------------------------------------------------------
{
  const cl = W.cl;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < cl.n; i++) { x0 = Math.min(x0, cl.x[i]); x1 = Math.max(x1, cl.x[i]); z0 = Math.min(z0, cl.z[i]); z1 = Math.max(z1, cl.z[i]); }
  x0 -= 6000; x1 += 6000; z0 -= 7000; z1 += 7000;
  const Wd = 1800, k = Wd / (x1 - x0), Ht = Math.round((z1 - z0) * k) + 60;
  const X = (x) => ((x - x0) * k).toFixed(1), Z = (z) => ((z - z0) * k + 40).toFixed(1);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Ht}" viewBox="0 0 ${Wd} ${Ht}" font-family="Inter, system-ui, sans-serif"><rect width="100%" height="100%" fill="#1b1714"/>`;
  svg += `<text x="16" y="26" fill="#f2ece0" font-size="17" font-weight="600">L1 water on the I-10 corridor (USGS NHD, strip-mapped): rivers blue-green, washes sand, canals teal, lakes filled</text>`;
  svg += `<path d="${Array.from({ length: Math.ceil(cl.n / 4) }, (_, j) => `${j ? 'L' : 'M'}${X(cl.x[j * 4])},${Z(cl.z[j * 4])}`).join('')}" fill="none" stroke="#e8e2cc" stroke-width="2"/>`;
  for (const L of lakes) svg += `<path d="${L.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0])},${Z(p[1])}`).join('')}Z" fill="${L.kind === 'playa' ? '#cfc6b0' : '#4f6a52'}" stroke="#2c3a2c"/>`;
  for (const R of rivers) svg += `<path d="${R.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0])},${Z(p[1])}`).join('')}" fill="none" stroke="${R.kind === 'wash' ? '#c8a878' : R.kind === 'canal' ? '#5aa098' : '#6aa080'}" stroke-width="${R.kind === 'wash' ? 1.4 : 2.4}"/>`;
  const seen = new Set();
  for (const R of rivers) { if (seen.has(R.name)) continue; seen.add(R.name); const p = R.pts[Math.floor(R.pts.length / 2)]; svg += `<text x="${X(p[0])}" y="${Z(p[1]) - 4}" fill="#d8c8b0" font-size="10">${R.name}</text>`; }
  for (const t of W.towns.filter((t) => t.built || t.id === 'phoenix')) svg += `<circle cx="${X(t.x)}" cy="${Z(t.z)}" r="4" fill="#e8a33c"/><text x="${X(t.x) + 6}" y="${Z(t.z) + 14}" fill="#e8a33c" font-size="12">${t.name}</text>`;
  svg += '</svg>';
  writeFileSync(join(RENDERS, 'l1-water-map.svg'), svg);
  log(`wrote docs/renders/web/rivers/l1-water-map.svg`);
}
void gunzipSync;
