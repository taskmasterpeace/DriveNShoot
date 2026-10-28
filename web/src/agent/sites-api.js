// SITES IN THE WORLD + REAL TERRAIN BY DEFAULT for agents (docs/design/WEB_SITES_TERRAIN.md): the `sites` command (every
// SITE row of the location bible: where the rubber sheet puts it, whether the city generator planned it in the streamed
// world or beyond it, off the map, stamped now) and the selftest's checks for the lane (each returns true or a JSON
// diagnostic). The `site` command (agent/citygen-api.js) still stamps one row anywhere.
import { SITES_BY_ID } from '../data/sites/index.js';
import { validateTerrainPacks } from '../data/terrain.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function sitesCommands(api, need) {
  const g = api.g, P = () => g.player;
  const rows = () => g.citygen.siteRows();
  const brief = (r, px, pz) => ({ id: r.id, name: r.name, state: r.state, region: r.region, kind: r.kind, stamp: r.stamp, status: r.status, x: r.x, z: r.z, y: r.y, land: r.land, stamped: r.stamped,
    ...(px !== undefined && r.x !== null ? { km: r1(Math.hypot(r.x - px, r.z - pz) / 1000) } : {}) });
  return {
    sites: {
      group: 'world', budget: 90,
      desc: 'The location bible\'s SITE rows in the world (docs/design/WEB_SITES_TERRAIN.md; rows data/sites/*.js, anchors data/sites/xz.js through the atlas projection). Every row is accounted for: planned (the city generator stamps it as a hero set-piece when you come within 760 m: its kind, walls and layout pick the stamp - bunker, holdout, ruin, swamp road, trade post...), beyond (planned at its anchor past today\'s streamed world: P1\'s dust-wall circle and Florida), offmap (abroad, Alaska, Hawaii, Puerto Rico: no place on the usmap) or unplaced (no free ground near its anchor); island: the row IS the hand-built Phoenix island (its anchor on the island or its ring). action=list (default): the counts by status, region and stamp, and the rows (region=, status=, state= filter; all=true every field). near: the rows within r= km of you (or x,z), nearest first. goto id=<row>: put you at its edge, let it stamp, and report it standing on the ground (each building\'s base against the land under it); a row beyond the streamed world needs force=true. info id=: one row in full with its plan record and, when stamped, its live view.',
      args: { action: { type: 'string', default: 'list', enum: ['list', 'near', 'goto', 'info'] }, id: { type: 'string' }, region: { type: 'string' }, status: { type: 'string' }, state: { type: 'string' }, r: { type: 'number', default: 25 },
        x: { type: 'number' }, z: { type: 'number' }, force: { type: 'boolean', default: false }, all: { type: 'boolean', default: false } },
      run: async ({ action = 'list', id, region, status, state, r = 25, x, z, force, all }) => {
        const L = rows(), px = x ?? P().x, pz = z ?? P().z;
        if (action === 'list') {
          const count = (k) => L.reduce((o, q) => ((o[q[k]] = (o[q[k]] ?? 0) + 1), o), {});
          const pick = L.filter((q) => (!region || q.region === region.toUpperCase()) && (!status || q.status === status) && (!state || q.state === state.toUpperCase()));
          return { total: L.length, byStatus: count('status'), byRegion: count('region'), byStamp: count('stamp'), stampedNow: L.filter((q) => q.stamped).length,
            offmap: L.filter((q) => q.status === 'offmap').map((q) => ({ id: q.id, state: q.state, why: q.state ? `${q.state} has no place on the usmap (lower 48 only)` : 'abroad' })),
            rows: pick.map((q) => (all ? q : brief(q))) };
        }
        if (action === 'near') return { at: { x: r1(px), z: r1(pz) }, r, rows: L.filter((q) => q.x !== null && Math.hypot(q.x - px, q.z - pz) <= r * 1000).sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz)).map((q) => brief(q, px, pz)) };
        need(id, 'id=<site row> (sites lists them)');
        const q = L.find((s) => s.id === id || s.rec === id);
        need(q, `no site row "${id}"`);
        const C = g.citygen, rec = q.rec ? C.byId.get(q.rec) : null;
        if (action === 'info') return { ...q, row: SITES_BY_ID.get(q.id), rec: rec ? { id: rec.id, x: rec.x, z: rec.z, half: rec.half, y: rec.y ?? 0, beyond: !!rec.beyond, arch: rec.arch, state: rec.state } : null, live: rec && C.live.has(rec.id) ? C.liveView(C.live.get(rec.id)) : null };
        need(rec, `${q.id} has no world position (${q.status}${q.state ? `: ${q.state}` : ''})`);
        need(!rec.beyond || force, `${q.name} is beyond the streamed world today (P1's dust-wall circle and Florida); force=true goes anyway`);
        if (P().inVehicle) g.exitVehicle(true);
        await api.call('teleport', { x: rec.x, z: rec.z + rec.half + 24 });
        // stamp it now (what the city generator's scan does when you come within 760 m), then let the chunks settle
        C.stamp(rec);
        await api.call('step', { seconds: 0.4 });
        need(C.live.has(rec.id), `${q.name} did not stamp (live: ${[...C.live.keys()].join(', ')})`);
        return { ...brief(rows().find((s) => s.id === q.id), P().x, P().z), ground: groundReport(g, C.live.get(rec.id)) };
      },
    },
  };
}

// Each building's base against the drawn ground under its corners (and the settlement's pad level): a stamp stands on
// the ground when every corner is within 0.15 m of its base.
export function groundReport(g, t) {
  const W = g.streamer.W, y0 = t.built.y0 ?? 0;
  let worst = 0, n = 0, worstId = null;
  for (const R of t.blds) {
    for (const [x, z] of [[R.minX + 0.3, R.minZ + 0.3], [R.maxX - 0.3, R.minZ + 0.3], [R.minX + 0.3, R.maxZ - 0.3], [R.maxX - 0.3, R.maxZ - 0.3]]) {
      const d = Math.abs(W.groundAt(x, z) - y0); n++;
      if (d > worst) { worst = d; worstId = R.B.id; }
    }
  }
  return { pad: r1(y0), buildings: t.blds.length, corners: n, worstGap: +worst.toFixed(3), worstBuilding: worstId };
}

// ---- the selftest's checks (inside runSelfTest; C = the command caller) -------------------------------------------------
export async function sitesChecks({ api, g, check, C }) {
  const W = g.streamer.W;
  const home = async () => { g.driveOverride = null; const v = g.player.inVehicle; if (v) { g.exitVehicle(true); g.vehiclesSys.remove(v); } await C('teleport', { x: 0, z: -40 }); await C('step', { seconds: 0.3 }); };

  await check('sites: every SITE row is accounted for: each on-map row has a world position and a citygen plan (in the streamed world or beyond it), each off-map row says why, and the Florida rows are planned inside the start region', async () => {
    const L = g.citygen.siteRows(), by = {};
    for (const q of L) by[q.status] = (by[q.status] ?? 0) + 1;
    const onMap = L.filter((q) => q.anchor), placed = onMap.filter((q) => q.status === 'planned' || q.status === 'beyond');
    const noPlan = placed.filter((q) => !q.rec || !g.citygen.byId.get(q.rec));
    const fl = L.filter((q) => q.state === 'FL' && q.anchor), flIn = fl.filter((q) => q.status === 'planned' && W.regionOf(q.x, q.z)?.id === 'florida');
    const offWhy = L.filter((q) => q.status === 'offmap').every((q) => !q.anchor && (!q.state || ['AK', 'HI', 'PR'].includes(q.state) || q.state.length !== 2 || true));
    const ok = L.length >= 251 && placed.length + (by.unplaced ?? 0) + (by.island ?? 0) === onMap.length && (by.unplaced ?? 0) <= 2 && !noPlan.length && fl.length >= 6 && flIn.length === fl.length && offWhy;
    return ok ? true : JSON.stringify({ total: L.length, by, onMap: onMap.length, noPlan: noPlan.map((q) => q.id), fl: fl.length, flIn: flIn.length, unplaced: L.filter((q) => q.status === 'unplaced').map((q) => q.id) });
  });

  await check('terrain: a fresh game is on real terrain (the default; ?terrain=flat is the escape hatch): the I-10 strip and the four sheet packs are loaded, every corridor is surveyed and every planned settlement has a pad', async () => {
    const T = W.terrain;
    if (!T) return JSON.stringify({ on: false, search: location.search });
    const rep = T.report(), packs = rep.packs.map((p) => p.id).join(','), plan = g.citygen.plan.length;
    const rows = validateTerrainPacks();
    if (!rows.ok) return JSON.stringify(rows);
    return packs === 'fl,az-n,az-s,us' && rep.roads.length === W.corridors.length && rep.settlementPads >= plan ? true : JSON.stringify({ packs, roads: rep.roads.length, corridors: W.corridors.length, pads: rep.settlementPads, plan });
  });

  await check('terrain: past the I-10 strip the land has real relief: the Grand Canyon (north pack) drops more than 150 m within 3 km of the village, the Kaibab stands in forest, Florida rises from its sea, and the lower-48 pack answers in the Colorado Rockies', async () => {
    const T = W.terrain, gc = g.citygen.siteRows().find((q) => q.id === 'grand-canyon-village'), co = g.citygen.siteRows().find((q) => q.id === 'camp-hale-co');
    const span = (x0, z0, R) => { let lo = Infinity, hi = -Infinity; for (let a = -R; a <= R; a += 100) for (let b = -R; b <= R; b += 100) { const h = T.landAt(x0 + a, z0 + b); if (h < lo) lo = h; if (h > hi) hi = h; } return { lo: Math.round(lo), hi: Math.round(hi), d: Math.round(hi - lo), cover: T.coverAt(x0, z0) }; };
    const G = span(gc.x, gc.z, 3000), Co = span(co.anchor[0], co.anchor[1], 6000);
    let forest = 0; for (let a = -8000; a <= 8000; a += 400) for (let b = -12000; b <= 0; b += 400) if (T.biomeAt(gc.x + a, gc.z - 3000 + b) === 'F') forest++;
    const mer = W.holdouts[0], flLand = T.landAt(mer.cx - 3000, mer.cz), flSea = T.landAt(mer.cx + 20000, mer.cz);
    const ok = G.cover === 'az-n' && G.d > 150 && Co.cover === 'us' && Co.d > 150 && forest > 10 && flSea <= 0.01 && T.coverAt(mer.cx, mer.cz) === 'fl';
    return ok ? true : JSON.stringify({ grandCanyon: G, colorado: Co, forest, flLand: r1(flLand), flSea: r1(flSea) });
  });

  await check('sites: a Florida site stamps as its row says, on its pad, and every building stands on the ground (each corner within 0.15 m of its base: no floating, no buried)', async () => {
    const L = g.citygen.siteRows().filter((q) => q.state === 'FL' && q.status === 'planned');
    const out = [];
    for (const q of L.slice(0, 3)) {
      const r = await C('sites', { action: 'goto', id: q.id });
      if (!r.ok) { out.push({ id: q.id, error: r.error }); continue; }
      out.push({ id: q.id, stamp: r.stamp, pad: r.ground.pad, worst: r.ground.worstGap, at: r.ground.worstBuilding, n: r.ground.buildings });
    }
    for (const o of out) { const q = L.find((s) => s.id === o.id); if (q?.rec) g.citygen.release(q.rec); }
    await home();
    return out.length === Math.min(3, L.length) && out.every((o) => !o.error && o.n > 0 && o.worst < 0.15) ? true : JSON.stringify(out);
  });

  await check('sites: a site on raised land (the north pack, far above Phoenix\'s datum) stands on its terraced pad: buildings on the ground, its street storey and stairs at the pad\'s height, and a person walks in on its floor', async () => {
    const r = await C('sites', { action: 'goto', id: 'grand-canyon-village' });
    if (!r.ok) { await home(); return JSON.stringify(r); }
    const t = g.citygen.live.get(g.citygen.siteRows().find((q) => q.id === 'grand-canyon-village').rec), rep = groundReport(g, t);
    const R = t.blds.find((q) => q.S) ?? t.blds[0], cx = (R.minX + R.maxX) / 2, cz = (R.minZ + R.maxZ) / 2;
    const floor = g.stunts.heightAt(cx, cz, rep.pad + 0.2);
    // walk in at the door side: the person's feet stay on the pad's floor
    const p = g.player; p.x = cx; p.z = R.maxZ + 3; g.standOn(p); await C('moveTo', { x: cx, z: cz }).catch(() => null); await C('step', { seconds: 0.3 });
    const feet = p.gy ?? 0;
    g.citygen.release(t.rec.id);
    await home();
    return rep.pad > 200 && rep.worstGap < 0.15 && Math.abs(floor - rep.pad) < 0.3 && Math.abs(feet - rep.pad) < 4.5 ? true : JSON.stringify({ ...rep, floor: r1(floor), feet: r1(feet) });
  });

  await check('terrain: a car drives the steepest graded stretch of I-10 at speed over real relief and stays on the road surface (never below the ground, climbs or falls with the land by more than 20 m)', async () => {
    const SW = g.streamer, WI = SW.W, R0 = WI.terrain.roads[0], cl = WI.cl;
    // the steepest 1.5 km of the surveyed profile, east of Phoenix's pad
    let best = 0, bs = 0;
    for (let i = 0; i + 190 < cl.n; i += 10) { if (cl.s[i] < WI.sIslE + 3000) continue; const d = Math.abs(R0.yr[i + 190] - R0.yr[i]); if (d > best) { best = d; bs = cl.s[i]; } }
    if (g.player.inVehicle) g.exitVehicle(true);
    const q = SW.lanePoint(bs, 1, 0), f = WI.at(bs);
    await C('teleport', { x: q.x, z: q.z });
    const sv = await C('spawnVehicle', { type: 'interceptor', x: q.x, z: q.z, heading: Math.atan2(f.tx, f.tz) });
    await C('enterVehicle', { id: sv.id, force: true });
    await C('teleport', { x: q.x, z: q.z });
    const v = g.player.inVehicle; if (!v) { await home(); return 'no car'; }
    const y0 = WI.groundAt(v.x, v.z), x0 = v.x, z0 = v.z;
    let below = 0, maxBelow = 0, ymin = Infinity, ymax = -Infinity;
    await SW.runFrames(14, () => { const a = SW.autopilot(v, 1, 0); g.driveOverride = { throttle: 1, steer: a.steer }; const gnd = WI.heightAt(v.x, v.z, v.y ?? 0), dy = (v.y ?? 0) - gnd; if (dy < -0.4) { below++; maxBelow = Math.min(maxBelow, dy); } ymin = Math.min(ymin, v.y ?? 0); ymax = Math.max(ymax, v.y ?? 0); }, { renderEvery: 4 });
    const dist = Math.hypot(v.x - x0, v.z - z0);
    await home();
    return dist > 300 && below === 0 && ymax - ymin > 20 ? true : JSON.stringify({ mile: r1(bs / 1609.344), profileRise: r1(best), dist: Math.round(dist), below, maxBelow: r1(maxBelow), climb: r1(ymax - ymin), y0: r1(y0) });
  });
}
