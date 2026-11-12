// Selftest checks for THE WORLD FORGE (docs/design/WEB_FORGE.md §8): the page boots with every tab and mounts the
// observer and the Building Lab; a MAP edit to a road vertex round-trips to usmap.json with every other field and row
// preserved and the game streams the change; a BRUSH stroke of forest changes the tree count in a streamed chunk (and a
// rad stroke lays a hot zone), both pure functions of the rows. Every check puts the files back byte for byte and
// pushes them, so the battery leaves the repo and the world as it found them.
import { fetchRows, restoreRows, pushUsmap, pushBrush } from '../forge/live.js';
import { rowToWorld } from '../forge/frame.js';
import { chunkOf, chunkKey } from '../world/geo.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 100) => { const t0 = performance.now(); for (;;) { let v; try { v = await fn(); } catch { v = null; } if (v) return v; if (performance.now() - t0 > ms) return null; await sleep(step); } };

export async function forgeChecks(api, check, C) {
  const g = api.g;
  if (!import.meta.env?.DEV) return; // the forge is a dev-server tool: a production build has no /forge routes

  await check('THE WORLD FORGE boots with every tab and mounts OBSERVE and BUILDING', async () => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-3000px;top:0;width:1440px;height:900px;border:0;';
    f.src = '/forge.html?probe=1';
    document.body.appendChild(f);
    try {
      const F = await until(() => f.contentWindow?.FORGE?.ready && f.contentWindow.FORGE, 30000);
      if (!F) return `the forge page never set FORGE.ready (${f.contentWindow?.FORGE?.error ?? 'no error recorded'})`;
      const want = ['map', 'terrain', 'brush', 'town', 'building', 'site', 'life', 'voice', 'seasons', 'observe'];
      const have = F.tabs();
      const missing = want.filter((t) => !have.includes(t));
      if (missing.length) return `tabs missing: ${missing.join(', ')}`;
      const map = F.map?.stats?.();
      if (!map || map.interstates < 10 || map.towns < 50 || map.drawn < 100) return `MAP drew too little: ${JSON.stringify(map)}`;
      F.show('observe');
      const obs = await until(() => { const w = f.contentDocument.querySelector('#mount-observe iframe')?.contentWindow; return w?.OBS && w.document.querySelector('#map') ? w : null; }, 20000);
      if (!obs) return 'OBSERVE did not mount the observer (no window.OBS / #map in its frame)';
      F.show('building');
      const lab = await until(() => { const w = f.contentDocument.querySelector('#mount-building iframe')?.contentWindow; return w?.LAB ? w : null; }, 25000);
      if (!lab) return 'BUILDING did not mount the Building Lab (no window.LAB in its frame)';
      F.show('map');
      return true;
    } finally { f.src = 'about:blank'; f.remove(); await sleep(50); }
  });

  await check('MAP: a road vertex edit round-trips to usmap.json with every other field kept, and the game streams it', async () => {
    const W = g.streamer.W;
    const before = await fetchRows('usmap');
    // A street of a town the corridor builds (its ribbon is in the world now).
    const rb = W.ribbons.find((r) => r.town && r.kind === 'street' && before.doc.streets.some((s) => s.id === r.id && s.pts.length >= 2));
    if (!rb) return 'no built town street to edit';
    const id = rb.id, row0 = before.doc.streets.find((s) => s.id === id), i = row0.pts.length - 1;
    const w0 = rowToWorld(before.doc, 'streets', id, row0.pts[i]);
    const target = [w0[0] + 40, w0[1]];
    const ck0 = await C('chunk', { x: target[0], z: target[1], build: true });
    if (!ck0.ok) return `chunk: ${ck0.error}`;
    try {
      // Another tool's field on the row (the forge must never drop what it does not know).
      const p0 = await C('forgePatch', { file: 'usmap', ops: JSON.stringify([{ op: 'set', coll: 'streets', id, set: { forge_probe: { kept: true, by: 'selftest' } } }]), push: false });
      if (!p0.ok) return `probe field: ${p0.error}`;
      const e = await C('mapEdit', { op: 'move', coll: 'streets', id, i, dx: 40, dz: 0 });
      if (!e.ok) return `mapEdit: ${e.error}`;
      if (!e.live?.live) return `not pushed live: ${JSON.stringify(e.live)}`;
      const after = await fetchRows('usmap');
      const row = after.doc.streets.find((s) => s.id === id);
      const w1 = rowToWorld(after.doc, 'streets', id, row.pts[i]);
      if (Math.hypot(w1[0] - target[0], w1[1] - target[1]) > 0.8) return `vertex landed at ${w1.map(Math.round)}, wanted ${target.map(Math.round)}`;
      if (!row.forge_probe?.kept || row.lanes !== row0.lanes || row.pts.length !== row0.pts.length) return `the row lost a field: ${JSON.stringify(row).slice(0, 200)}`;
      for (let k = 0; k < row.pts.length; k++) if (k !== i && JSON.stringify(row.pts[k]) !== JSON.stringify(row0.pts[k])) return `vertex ${k} moved too`;
      // Every other row of every collection, every top-level key, the meta (bar the forge's own stamp): unchanged.
      const keys0 = Object.keys(before.doc), keys1 = Object.keys(after.doc);
      if (keys0.join() !== keys1.join()) return `top-level keys changed: ${keys1.join()}`;
      let other = 0;
      for (const k of keys0) {
        if (k === 'meta') { const m0 = { ...before.doc.meta }, m1 = { ...after.doc.meta }; delete m0.forge; delete m1.forge; if (JSON.stringify(m0) !== JSON.stringify(m1)) return 'meta changed'; continue; }
        const a = before.doc[k], b = after.doc[k];
        if (!Array.isArray(a)) { if (JSON.stringify(a) !== JSON.stringify(b)) return `${k} changed`; continue; }
        if (a.length !== b.length) return `${k}: ${a.length} rows became ${b.length}`;
        for (let n = 0; n < a.length; n++) { if (k === 'streets' && a[n].id === id) continue; if (JSON.stringify(a[n]) !== JSON.stringify(b[n])) return `${k}/${a[n].id} changed`; other++; }
      }
      if (!after.doc.meta.forge?.edits?.[`streets/${id}`]) return 'the edit is not stamped in meta.forge.edits (the importer would not carry it over)';
      // The game streams it: the engine's ribbon goes through the new point, the chunk there laid out again on it.
      const rb1 = g.streamer.W.ribbons.find((r) => r.id === id);
      let near = Infinity; for (let k = 0; k < rb1.n; k++) near = Math.min(near, Math.hypot(rb1.x[k] - target[0], rb1.z[k] - target[1]));
      if (near > 3.5) return `the live ribbon is ${near.toFixed(1)} m from the new vertex`;
      const ck1 = await C('chunk', { x: target[0], z: target[1], build: true });
      if (ck1.hash === ck0.hash) return `chunk ${ck1.key} kept its hash ${ck1.hash}: the edit did not stream`;
      const fresh = await C('chunk', { x: target[0], z: target[1], fresh: true, mode: 'sliced' });
      if (!fresh.fresh?.matches) return `the edited chunk is not a pure function: ${JSON.stringify(fresh.fresh ?? fresh).slice(0, 160)}`;
      return true;
    } finally {
      const r = await restoreRows('usmap', before.raw, 'selftest');
      const back = await fetchRows('usmap');
      await pushUsmap(g, null);
      if (!r.ok || back.raw !== before.raw) throw new Error('usmap.json was not restored byte for byte');
      const ck2 = await C('chunk', { x: target[0], z: target[1], build: true });
      if (ck2.hash !== ck0.hash) throw new Error(`restored, the chunk is ${ck2.hash}, not ${ck0.hash}`);
    }
  });

  await check('BRUSH: a forest stroke thickens a streamed chunk\'s trees and a rad stroke lays a hot zone (pure, and restored)', async () => {
    const W = g.streamer.W;
    const before = await fetchRows('brush');
    // Open desert beside I-10, 7 km east of Phoenix, clear of the exits.
    const f = W.at(W.sIslE + 7000), x = f.x + f.nx * 150, z = f.z + f.nz * 150;
    const rx = f.x - f.nx * 170, rz = f.z - f.nz * 170;
    const ck0 = await C('chunk', { x, z, build: true }), rk0 = await C('chunk', { x: rx, z: rz, build: true });
    const trees = (ck) => Object.entries(ck.instances ?? ck.pools ?? {}).filter(([k]) => k.startsWith('fl_')).reduce((s, [, n]) => s + (typeof n === 'number' ? n : n?.n ?? 0), 0);
    const t0 = trees(ck0);
    try {
      const p = await C('brushPaint', { layer: 'forest', v: 1, r: 260, x, z, id: 'selftest-forest' });
      if (!p.ok) return `brushPaint: ${p.error}`;
      if (!p.live?.live || !p.chunks.includes(chunkKey(chunkOf(x), chunkOf(z)))) return `not pushed to its chunk: ${JSON.stringify(p.live).slice(0, 160)}`;
      const at = await C('brush', { x, z });
      if (!(at.forest > 0.95)) return `brush at the centre reads forest ${at.forest}`;
      const ck1 = await C('chunk', { x, z, build: true });
      const t1 = trees(ck1);
      if (t1 < t0 + 150) return `trees ${t0} -> ${t1}: the stroke did not thicken the chunk`;
      if (ck1.hash === ck0.hash) return 'the chunk kept its hash';
      const fresh = await C('chunk', { x, z, fresh: true, mode: 'sliced' });
      if (!fresh.fresh?.matches) return `a painted chunk is not a pure function: ${JSON.stringify(fresh.fresh).slice(0, 160)}`;
      const r = await C('brushPaint', { layer: 'rad', v: 1, r: 200, x: rx, z: rz, id: 'selftest-rad' });
      if (!r.ok) return `rad: ${r.error}`;
      const ra = await C('brush', { x: rx, z: rz });
      const rk1 = await C('chunk', { x: rx, z: rz, build: true });
      const glow = (ck) => (ck.instances?.glows ?? ck.pools?.glows ?? 0), drums = (ck) => (ck.instances?.barrels ?? ck.pools?.barrels ?? 0);
      if (!(ra.rad > 0.95) || glow(rk1) <= glow(rk0) || drums(rk1) <= drums(rk0)) return `hot zone: rad ${ra.rad}, glows ${glow(rk0)} -> ${glow(rk1)}, drums ${drums(rk0)} -> ${drums(rk1)}`;
      return true;
    } finally {
      const r = await restoreRows('brush', before.raw, 'selftest');
      const back = await fetchRows('brush');
      await pushBrush(g);
      if (!r.ok || back.raw !== before.raw) throw new Error('brush.json was not restored byte for byte');
      const ck2 = await C('chunk', { x, z, build: true });
      if (ck2.hash !== ck0.hash) throw new Error(`restored, the forest chunk is ${ck2.hash}, not ${ck0.hash}`);
    }
  });
}
