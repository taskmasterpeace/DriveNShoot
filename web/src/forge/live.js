// PUSH LIVE (docs/design/WEB_FORGE.md §3.2): the World Forge's rows go into a running game tab without a reload. The
// forge writes the file (tools/forge-io.mjs); this, in the game page, reads the file back from disk, puts its rows into
// the module the engine already holds (the same object every reader imported), rebuilds what was derived from them and
// lays out again only the chunks the change reaches. The streamer then streams them like any chunk: a pure function of
// the data, so the same rows give the same hash as a fresh boot would.
import USMAP from '../data/usmap.json';
import { reloadBrush, brushField } from '../world/brush.js';
import { SignAtlas } from '../world/signs.js';
import { C, chunkKey, chunkOf, toWorld } from '../world/geo.js';

export async function fetchRows(file) {
  const r = await fetch(`/forge/data?file=${file}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`/forge/data ${file}: HTTP ${r.status}`);
  const raw = await r.text();
  return { raw, doc: JSON.parse(raw), hash: r.headers.get('x-forge-hash') };
}
export async function patchRows(file, ops, opts = {}) {
  const r = await fetch('/forge/patch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file, ops, ...opts }) });
  const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
  return { status: r.status, ...j };
}
export async function restoreRows(file, raw, who = 'forge') {
  const r = await fetch('/forge/restore', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file, raw, who }) });
  return r.json();
}

// What a set of usmap rows covers in world metres (old and new geometry: both must be laid out again).
function rowsBox(W, doc, keys) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, any = false;
  const grow = (x, z, m) => { any = true; x0 = Math.min(x0, x - m); x1 = Math.max(x1, x + m); z0 = Math.min(z0, z - m); z1 = Math.max(z1, z + m); };
  for (const key of keys) {
    const [coll, ...rest] = key.split('/'), id = rest.join('/');
    const row = doc[coll]?.find((r) => r.id === id);
    // What the engine built from it (a town's streets and buildings, an exit's ramps and community).
    for (const rb of W.ribbons ?? []) if (rb.id === id || (rb.town && id.startsWith(`ST-${rb.town}-`)) || rb.exit === id) { grow(rb.x0, rb.z0, 0); grow(rb.x1, rb.z1, 0); }
    for (const b of W.buildings ?? []) if (b.place === id || id.startsWith(`ST-${b.place}-`) || (coll === 'placements' && b.id === id)) { grow(b.x0, b.z0, 8); grow(b.x1, b.z1, 8); }
    if (!row) continue;
    for (const p of row.pts ?? []) { const [x, z] = toWorld(p); grow(x, z, 120); }
    for (const p of [row.pos, row.dest]) if (p) { const [x, z] = toWorld(p); grow(x, z, 600); }
  }
  return any ? { x0, z0, x1, z1 } : null;
}

// Rebuild everything WorldIndex derived from the rows, in the constructor's order (the ring and its I-10 buckets stay).
function reindex(S) {
  const W = S.W, before = JSON.stringify(W.signs.map((s) => [s.id, s.lines]));
  W.buildings = []; W.warnings = [];
  W.buildCorridor(); W.buildExits(); W.buildTowns(); W.buildSigns(); W.bucketFeatures();
  W.mesaCache?.clear();
  const signs = JSON.stringify(W.signs.map((s) => [s.id, s.lines])) !== before;
  if (signs) {
    const old = S.atlas;
    S.atlas = W.signAtlas = new SignAtlas(W.signs);
    if (S.signMat) { S.signMat.map = S.signMat.emissiveMap = S.atlas.texture; S.signMat.needsUpdate = true; }
    old?.texture?.dispose?.();
  }
  return { signs };
}

// Drop the chunks in a set (or all), lay the pinned ones out again, and stream the player's neighbourhood back in.
function relayout(g, keys) {
  const S = g.streamer;
  if (S.building) S.abandonBuild();
  let n = 0;
  for (const key of [...S.layouts.keys()]) if (!keys || keys.has(key)) { S.evict(key); n++; }
  for (const key of S.pinned) if (!S.layouts.has(key)) { const [cx, cz] = key.split(',').map(Number); S.buildNow(cx, cz, null); }
  const f = S.focus();
  S.centre = null;
  const r = S.ensureHot(f.x, f.z, 'load');
  return { evicted: n, ms: r.ms };
}
const keysIn = (box) => {
  const out = new Set();
  if (!box) return out;
  for (let cx = chunkOf(box.x0); cx <= chunkOf(box.x1); cx++) for (let cz = chunkOf(box.z0); cz <= chunkOf(box.z1); cz++) out.add(chunkKey(cx, cz));
  return out;
};

// The usmap rows from disk into the running game. rows: the "coll/id" keys that changed (null: everything).
export async function pushUsmap(g, rows = null) {
  const t0 = performance.now(), S = g.streamer, W = S.W;
  const { doc, hash } = await fetchRows('usmap');
  const keys = rows ?? null;
  // I-10 inside the Phoenix ring is baked into the ring's own buckets at boot: that edit needs a reload.
  if (keys?.includes('interstates/I-10')) {
    const reach = (W.ring?.reach ?? 1900) + 2500;
    const near = (d) => (d?.interstates?.find((r) => r.id === 'I-10')?.pts ?? []).some((p) => { const [x, z] = toWorld(p); return Math.hypot(x, z) < reach; });
    const was = JSON.stringify(USMAP.interstates.find((r) => r.id === 'I-10')?.pts), now = JSON.stringify(doc.interstates.find((r) => r.id === 'I-10')?.pts);
    if (was !== now && (near(USMAP) || near(doc))) {
      const a = USMAP.interstates.find((r) => r.id === 'I-10').pts, b = doc.interstates.find((r) => r.id === 'I-10').pts;
      const moved = a.length !== b.length || a.some((p, i) => { const [x, z] = toWorld(p), [x2, z2] = toWorld(b[i]); return (Math.hypot(x, z) < reach || Math.hypot(x2, z2) < reach) && (p[0] !== b[i][0] || p[1] !== b[i][1]); });
      if (moved) return { ok: true, live: false, needsReload: true, reason: 'I-10 moved inside the Phoenix ring: the ring buckets the freeway at boot. Reload the game tab (the file is saved).' };
    }
  }
  const oldBox = keys ? rowsBox(W, USMAP, keys) : null;
  // The rows, in place: every module that imported usmap.json holds this same object.
  for (const k of Object.keys(doc)) USMAP[k] = doc[k];
  const rx = reindex(S);
  if (W.terrain && S.terrainAsset) { const { RealTerrain } = await import('../world/realterrain.js'); W.terrain = new RealTerrain(S.terrainAsset, W, S.terrainPacks ?? []); }
  const newBox = keys ? rowsBox(W, USMAP, keys) : null;
  const all = !keys || rx.signs || keys.some((k) => k.startsWith('interstates/I-10'));
  const set = all ? null : new Set([...keysIn(oldBox), ...keysIn(newBox)]);
  const r = relayout(g, set);
  g.emit?.('forgePush', { file: 'usmap', rows: keys?.length ?? 'all', chunks: set ? set.size : 'all' });
  return { ok: true, live: true, file: 'usmap', hash, rows: keys ?? 'all', chunks: set ? set.size : 'all', chunkKeys: set ? [...set].slice(0, 8) : undefined, evicted: r.evicted, signsRepainted: rx.signs, warnings: W.warnings.slice(0, 12), ms: +(performance.now() - t0).toFixed(1) };
}

// The brush rows from disk into the running game: only the chunks an added, removed or changed stroke reaches.
export async function pushBrush(g) {
  const t0 = performance.now(), S = g.streamer;
  const { doc, hash } = await fetchRows('brush');
  const before = new Map((brushField.data.strokes ?? []).map((s) => [s.id, JSON.stringify(s)]));
  const after = new Map((doc.strokes ?? []).map((s) => [s.id, JSON.stringify(s)]));
  const rulesChanged = JSON.stringify([brushField.data.knobs, brushField.data.palettes]) !== JSON.stringify([doc.knobs, doc.palettes]);
  const touched = [];
  for (const [id, j] of before) if (after.get(id) !== j) touched.push(JSON.parse(j));
  for (const [id, j] of after) if (before.get(id) !== j) touched.push(JSON.parse(j));
  const ruin = touched.some((s) => s.layer === 'ruin');
  const set = rulesChanged ? null : brushField.chunksOf(touched);
  reloadBrush(doc);
  // A ruin stroke changes the corridor's buildings, which WorldIndex built at boot: rebuild them too.
  if (ruin) reindex(S);
  const r = relayout(g, set);
  return { ok: true, live: true, file: 'brush', hash, version: doc.version, strokes: doc.strokes?.length ?? 0, changed: touched.map((s) => s.id), chunks: set ? set.size : 'all', chunkKeys: set ? [...set].slice(0, 8) : undefined, evicted: r.evicted, ms: +(performance.now() - t0).toFixed(1) };
}

