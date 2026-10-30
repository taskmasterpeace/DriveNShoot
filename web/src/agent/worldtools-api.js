// THE WORLD TOOLS as COMMANDS rows and selftest checks (docs/design/WEB_WORLD_TOOLS.md; rows in src/data/worldtools.js and
// src/data/stamps.json, the fold in src/world/stamps.js, the math in src/world/travelmath.js). buildCommands() in api.js
// spreads worldToolsCommands into COMMANDS; runSelfTest() calls worldToolsChecks (only=world-tools runs just these).
//   stamp       the stamp rows: list | validate | preview (fold a row without writing it) | add | set | remove | undo
//               (the World Forge's STAMP tab writes the same rows through the same row law: src/forge/rows.js)
//   trip        the travel math: from= to= vehicle= mode= on the real road graph (table=true: every pair of places=)
//   worldTools  what the tools hold: stamps by kind, the folded regions, the stamped records in citygen's plan, the net
import USMAP from '../data/usmap.json';
import { VEHICLES } from '../systems/vehicles.js';
import { STAMP_COLLS, LOOKS, CLIMATES, CITY_SIZES, HOOD_KINDS, EXIT_OFFERS, OUTSIDE_KINDS, OUTSIDE_DENSITY, MEASURED, ROAD_CLASSES, MODES, GAME_MILE, validateStamps } from '../data/worldtools.js';
import { STAMPS, stampedRegions, regionRow, resetFold, validateWithEngine } from '../world/stamps.js';
import { TravelNet } from '../world/travelmath.js';
import { planWorld } from '../systems/citygen.js';
import { fetchRows, patchRows } from '../forge/live.js';
import { toWorld, toUsmap, chunkOf } from '../world/geo.js';

const KIND_COLL = { region: 'regions', city: 'cities', hood: 'hoods', exit: 'exits', outside: 'outside', base: 'bases' };
const json = (v) => { if (v === undefined || v === null || v === '') return undefined; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return undefined; } };

// One TravelNet per WorldIndex (rebuilt when the world is: a push, a reload).
let NET = null, NET_W = null;
export function travelNet(g) {
  const W = g.streamer?.W; if (!W) return null;
  if (NET_W !== W || NET?.stale) { NET = new TravelNet(W, VEHICLES); NET_W = W; }
  return NET;
}

// The rows on disk back into the module the engine holds (every reader imported this same object), and the plan again.
// Region and exit stamps need the WorldIndex rebuilt (a page reload): the answer says so.
export async function pushStamps(g, changedColls = null) {
  const { doc } = await fetchRows('stamps');
  for (const c of STAMP_COLLS) { STAMPS[c].length = 0; STAMPS[c].push(...(doc[c] ?? [])); }
  resetFold();
  const C = g.citygen, out = { reload: false, replanned: false };
  const colls = changedColls ?? STAMP_COLLS;
  if (colls.some((c) => c === 'regions' || c === 'exits')) { out.reload = true; out.why = 'a region or exit stamp changed: the WorldIndex builds regions and interchanges at boot (reload the page; the rows are on disk)'; }
  if (C?.W && colls.some((c) => c === 'cities' || c === 'hoods' || c === 'outside' || c === 'bases')) {
    for (const id of [...C.live.keys()]) C.release(id);
    C.plan = planWorld(C.W); C.byId = new Map(C.plan.map((r) => [r.id, r])); C.bucket.clear(); for (const r of C.plan) C.index(r);
    out.replanned = true; out.planned = C.plan.length; out.stamped = C.plan.filter((r) => r.stampId).length;
  }
  if (NET) NET.stale = true;
  return out;
}

export function worldToolsCommands(api, need) {
  const g = api.g;
  const DEV = !!import.meta.env?.DEV;
  const report = () => g.citygen?.plan?.stampReport ?? null;
  const fold = (row, kind) => {
    if (kind === 'region') { const r = regionRow(row, { ...STAMPS, regions: [...STAMPS.regions.filter((q) => q.id !== row.id), row] }); return { box: r.box, corridors: r.corridors.map((c) => ({ id: c.id, pts: c.pts.length, from: c.pts[0], to: c.pts[c.pts.length - 1] })), exits: r.exits.length, wall: r.wall?.name, biomes: Object.keys(r.biomes), citygen: r.citygen }; }
    if (kind === 'city') { const S = CITY_SIZES[row.size]; return { size: row.size, across: S?.across, hoods: (STAMPS.hoods.filter((h) => h.city === row.id).length || S?.ring.length) ?? 0, ring: S?.ring }; }
    if (kind === 'exit') { const O = EXIT_OFFERS[row.offers]; return { archetype: O?.archetype, structures: O?.structures, tier: O?.tier }; }
    if (kind === 'outside') return row.mix ? { density: row.mix, defaults: OUTSIDE_DENSITY } : { rural: OUTSIDE_KINDS[row.kind]?.rural, world: row.pos ? toWorld(row.pos).map(Math.round) : null };
    if (kind === 'hood') return { arch: HOOD_KINDS[row.kind]?.arch, walls: HOOD_KINDS[row.kind]?.walls ?? 'none', guards: HOOD_KINDS[row.kind]?.guards ?? 0 };
    return {};
  };
  return {
    stamp: {
      group: 'world', desc: 'THE WORLD TOOLS\' stamps (docs/design/WEB_WORLD_TOOLS.md; rows in web/src/data/stamps.json, kinds in src/data/worldtools.js): the rows that lay out a state with tools, never hand placement. kind: region (box usmap m, look, climate, danger 0-5, lean {faction: w}; its interstates come from the usmap, spliced onto a neighbour region\'s line at a shared edge) | city (town=<usmap id> or pos, size metro|city|town|village; tiles its neighbourhoods) | hood (city, kind downtown|residential|industrial|trailer_park|gated, at=[dx,dz] world m) | exit (region, road, mile = its number, name, offers fuel|motel|truck_stop|diner|town|nothing, side E|W|N|S, m) | outside (region, kind farm|ranch|compound|church|school|prison|quarry|junkyard|motel|trailer_park, pos; or mix={interstate:{kind: perKm}}: a density row) | base (state, milbase=<data/milbases.js id>, at). op: list | validate (every row, with the engine\'s tables) | preview row=<json> (what it would fold into, nothing written) | add row=<json> | set id= row=<json fields> | remove id= | undo inverse=<json> (the ops an earlier write returned). Writes go through the World Forge\'s row law (field-preserving, checked; a bad row is refused with why), then into this game: cities, hoods, outside places and bases re-plan citygen live; regions and exits need a page reload (it says so).',
      args: { op: { type: 'string', default: 'list', enum: ['list', 'validate', 'preview', 'add', 'set', 'remove', 'undo'] }, kind: { type: 'string', enum: Object.keys(KIND_COLL) }, id: { type: 'string' }, row: { type: 'string' }, inverse: { type: 'string' }, push: { type: 'boolean', default: true } },
      run: async ({ op, kind, id, row, inverse, push }) => {
        if (op === 'list') return { ok: true, file: 'web/src/data/stamps.json', counts: Object.fromEntries(STAMP_COLLS.map((c) => [c, STAMPS[c].length])), rows: kind ? STAMPS[KIND_COLL[kind]] : STAMPS, folded: Object.keys(stampedRegions()), report: report() };
        if (op === 'validate') { const v = await validateWithEngine(); return { ok: v.ok, ...v }; }
        need(kind || op === 'undo', `kind: one of ${Object.keys(KIND_COLL).join(', ')}`);
        const coll = KIND_COLL[kind];
        if (op === 'preview') {
          const r = json(row); need(r && r.id, 'row=<json> with an id');
          const doc = { ...STAMPS, [coll]: [...STAMPS[coll].filter((q) => q.id !== r.id), r] };
          const [{ ARCHETYPES, RURAL }, { MILBASES_BY_ID }] = await Promise.all([import('../data/citygen.js'), import('../data/milbases.js')]);
          const { REGIONS } = await import('../data/regions.js');
          const v = validateStamps(doc, { usmap: USMAP, regions: REGIONS, milbases: MILBASES_BY_ID, archetypes: ARCHETYPES, rural: RURAL });
          return { ok: true, valid: v.ok, errors: v.errors.filter((e) => e.coll === coll && e.id === r.id), fold: fold(r, kind) };
        }
        need(DEV, 'stamps are written through the dev server (npm run dev / npm run agent)');
        let ops;
        if (op === 'add') { const r = json(row); need(r && r.id, 'row=<json> with an id'); ops = [{ op: STAMPS[coll].some((q) => q.id === r.id) ? 'set' : 'add', coll, ...(STAMPS[coll].some((q) => q.id === r.id) ? { id: r.id, set: r } : { row: r }) }]; }
        else if (op === 'set') { need(id, 'id='); const r = json(row); need(r, 'row=<json fields>'); ops = [{ op: 'set', coll, id, set: r }]; }
        else if (op === 'remove') { need(id, 'id='); ops = [{ op: 'remove', coll, id }]; }
        else { ops = json(inverse); need(Array.isArray(ops), 'inverse=<the json ops a write returned>'); }
        const res = await patchRows('stamps', ops, { who: 'agent' });
        need(res.ok, `${res.error ?? `HTTP ${res.status}`}`);
        const colls = [...new Set(ops.map((o) => o.coll))];
        const live = push ? await pushStamps(g, colls) : null;
        const v = await validateWithEngine();
        return { ok: true, written: ops.length, changed: res.changed, inverse: res.inverse, valid: v.ok, errors: v.errors.slice(0, 8), live };
      },
    },
    trip: {
      group: 'world', desc: 'THE TRAVEL MATH (docs/design/WEB_WORLD_TOOLS.md §4.1): from a place to a place on the real road graph (every built corridor as you drive it, meander and exits included; past the streamed world the usmap\'s interstates, county and dirt roads at x K and the class\'s measured sinuosity), for a vehicle row in a mode (flat = flat out, cruise = the long road\'s 30 m/s, careful = 20 m/s). Places: a town or holdout id or name, an exit name, or x,z world metres. Answers km, game miles, minutes, litres (the engine\'s own fuel law: idle + throttle), tanks and refuels, how far one tank gets on each road class, the share on built road, the roads in order and the path (world and usmap). table=true places=a,b,c vehicles=x,y: every pair, cruise and flat out. pace=true: what the vehicle holds on each class. Also: travel from= to= vehicle= (the same answer).',
      args: { from: { type: 'string' }, to: { type: 'string' }, vehicle: { type: 'string', default: 'interceptor' }, mode: { type: 'string', default: 'cruise', enum: Object.keys(MODES) }, table: { type: 'boolean', default: false }, places: { type: 'string' }, vehicles: { type: 'string' }, pace: { type: 'boolean', default: false }, path: { type: 'boolean', default: false } },
      run: async ({ from, to, vehicle, mode, table, places, vehicles, pace, path }) => {
        const N = travelNet(g); need(N, 'no streamed world (no WorldIndex)');
        if (pace) { need(VEHICLES[vehicle], `unknown vehicle; one of ${Object.keys(VEHICLES).join(', ')}`); return { ok: true, vehicle, name: VEHICLES[vehicle].name, fuelCap: VEHICLES[vehicle].fuelCap, classes: Object.fromEntries(Object.keys(ROAD_CLASSES).map((c) => { const p = N.pace(vehicle, c, mode); return [c, { mps: +p.v.toFixed(1), mph: +(p.v * 2.237).toFixed(0), throttle: +p.throttle.toFixed(2), litresPerMin: +(p.lps * 60).toFixed(2), tankKm: p.lpm > 0 ? +((VEHICLES[vehicle].fuelCap / p.lpm) / 1000).toFixed(1) : null }]; })), net: N.counts }; }
        if (table) {
          const P = (places ?? 'losangeles,phoenix,elpaso,miami,meridian,jacksonville,atlanta').split(',').map((s) => s.trim()).filter(Boolean);
          const V = (vehicles ?? 'interceptor,pickup,rig,bike').split(',').map((s) => s.trim()).filter(Boolean);
          return { ok: true, rows: N.table(P, V), net: N.counts };
        }
        need(from && to, 'from= to= (a town, a holdout, an exit name, or x,z)');
        const r = N.trip(from, to, vehicle, mode);
        if (r.ok && !path) { delete r.path; delete r.pathUsmap; }
        return r;
      },
    },
    worldTools: {
      group: 'world', desc: 'What THE WORLD TOOLS hold (docs/design/WEB_WORLD_TOOLS.md): the stamp rows by kind, the regions they fold into (box, corridors with their length, exits, open seams with their neighbour), the stamped records in citygen\'s plan (cities and their hoods, outside places by kind, the base moves) and the travel net (nodes, edges, places). The World Forge\'s STAMP and TRAVEL tabs show the same.',
      args: {},
      run: async () => {
        const W = g.streamer?.W, N = travelNet(g);
        const regions = Object.values(W?.regions ?? {}).map((R) => ({ id: R.id, stamped: !!R.row.stamped, corridors: R.corridors.map((c) => ({ id: c.id, km: +(c.L / 1000).toFixed(1), exits: c.exits.length })), open: R.open.map((o) => ({ side: o.side, with: o.with, km: +((o.a1 - o.a0) / 1000).toFixed(1) })) }));
        const plan = g.citygen?.plan ?? [];
        const by = {}; for (const r of plan) if (r.stampId) { const k = r.hood ? `hood:${r.hood}` : r.outside ? `outside:${r.outside}` : r.kind; by[k] = (by[k] ?? 0) + 1; }
        return { ok: true, stamps: Object.fromEntries(STAMP_COLLS.map((c) => [c, STAMPS[c].length])), regions, plan: { stamped: by, report: report(), bases: (plan.milbaseReport ?? []).filter((m) => m.moved) }, net: N?.counts ?? null, looks: Object.keys(LOOKS), climates: Object.keys(CLIMATES) };
      },
    },
  };
}

// ---- the selftest checks (names start "world-tools:") -----------------------------------------------------------------
export async function worldToolsChecks(api, check) {
  const g = api.g, C = (cmd, args) => api.call(cmd, args), W = g.streamer?.W;
  if (!W) { await check('world-tools: the streamed world is built', async () => 'no WorldIndex'); return; }
  await check('world-tools: the stamp rows validate with the engine\'s tables, and a bad row is refused with why', async () => {
    const v = await validateWithEngine(); if (!v.ok) return v.errors.slice(0, 3).map((e) => `${e.coll}/${e.id}: ${e.msg}`).join('; ');
    const bad = validateStamps({ regions: [{ id: 'x', box: { x0: 0, x1: -5, y0: 0, y1: 1 }, look: 'nowhere', danger: 9 }], exits: [{ id: 'e', region: 'nope', road: 'I-999', mile: 0, offers: 'gold', name: 'lower' }] }, { usmap: USMAP });
    const msgs = bad.errors.map((e) => e.msg).join(' | ');
    return (bad.errors.length >= 6 && /box/.test(msgs) && /offers/.test(msgs) && /region nope/.test(msgs)) || `refusals: ${msgs}`;
  });
  await check('world-tools: every stamped kind folds into the world (regions with corridors, exits on them, hoods and outside places in citygen\'s plan, the base row placed)', async () => {
    const regs = STAMPS.regions;
    for (const s of regs) { const R = W.regions[s.id]; if (!R) return `region ${s.id} not built`; if (!R.corridors.length) return `region ${s.id}: no corridor`; }
    for (const x of STAMPS.exits) { const R = W.regions[x.region]; const X = R?.exits.find((q) => q.row?.stamp === x.id); if (!X) return `exit ${x.id} not built (warnings: ${W.warnings.filter((w) => w.includes(x.name)).join('; ') || 'none'})`; }
    const plan = g.citygen?.plan ?? [], rep = plan.stampReport;
    for (const c of STAMPS.cities) { const n = plan.filter((r) => r.city === c.id).length; if (!n) return `city ${c.id}: no hood in the plan (${JSON.stringify(rep?.cities.find((q) => q.id === c.id)?.hoods ?? [])})`; }
    for (const o of STAMPS.outside) if (!o.mix && !plan.some((r) => r.stampId === o.id)) return `outside ${o.id} not placed`;
    for (const o of STAMPS.outside) if (o.mix && !(rep?.density.find((d) => d.id === o.id)?.placed > 0)) return `density ${o.id} placed nothing`;
    for (const b of STAMPS.bases) { const m = plan.milbaseReport?.find((q) => q.id === b.milbase); if (!m || m.status === 'offmap' || m.status === 'unplaced') return `base ${b.id}: ${m?.status ?? 'no report'}`; }
    return regs.length ? true : 'no region stamps yet (the proof state lays one)';
  });
  await check(`world-tools: the travel math matches the long road's measured I-10 (LA to El Paso ${MEASURED.i10.miles} mi in ${MEASURED.i10.minutes} min at ${MEASURED.i10.speed} m/s) within ${MEASURED.tolerance * 100}%`, async () => {
    const N = travelNet(g); if (!N) return 'no net';
    // the long road measured the whole corridor (LA mile 0 to the dust wall); El Paso stands at mile 51.4 on it
    const r = N.trip('losangeles', 'elpaso', 'interceptor', 'cruise'); if (!r.ok) return r.error;
    const whole = W.cl.L / GAME_MILE, wantMin = MEASURED.i10.minutes * (r.miles / MEASURED.i10.miles);
    const e1 = Math.abs(whole - MEASURED.i10.miles) / MEASURED.i10.miles, e2 = Math.abs(r.minutes - wantMin) / wantMin;
    return (e1 <= MEASURED.tolerance && e2 <= MEASURED.tolerance) || `road ${whole.toFixed(1)} mi vs ${MEASURED.i10.miles}; trip ${r.minutes} min vs ${wantMin.toFixed(1)}`;
  });
  await check('world-tools: a real drive matches the travel math within 10% (a LAWMAN on I-10 at cruise for 75 s: distance, time and fuel, the engine\'s own burn)', async () => {
    const S = g.streamer, N = travelNet(g); if (!N || !S.autopilot) return 'no autopilot';
    const godWas = g.god; const P = g.player, x0 = P.x, z0 = P.z;
    if (P.inVehicle) g.exitVehicle(true);
    const s0 = W.sIslE + 3000, q = S.lanePoint(s0, 1, 0), f = W.at(s0);
    await C('teleport', { x: q.x, z: q.z });
    const r = await C('spawnVehicle', { type: 'interceptor', x: q.x, z: q.z, heading: Math.atan2(f.tx, f.tz) });
    await C('enterVehicle', { id: r.id, force: true }); await C('teleport', { x: q.x, z: q.z });
    const v = P.inVehicle; if (!v) return 'not in the car';
    try {
      v.fuel = v.fuelCap; v.vx = Math.sin(v.h) * 30; v.vz = Math.cos(v.h) * 30;
      await S.runFrames(6, () => { const a = S.autopilot(v, 1, 0, MEASURED.i10.speed); g.driveOverride = { throttle: a.throttle, steer: a.steer }; });
      const sA = W.project(v.x, v.z, 600).s, fA = v.fuel; let thr = 0, n = 0;
      const secs = 75;
      await S.runFrames(secs, () => { const a = S.autopilot(v, 1, 0, MEASURED.i10.speed); g.driveOverride = { throttle: a.throttle, steer: a.steer }; thr += Math.max(0, v.throttle ?? a.throttle); n++; });
      const dist = W.project(v.x, v.z, 600).s - sA, burnt = fA - v.fuel, p = N.pace('interceptor', 'interstate', 'cruise');
      const wantT = dist / p.v, wantL = p.lps * secs;
      const eT = Math.abs(secs - wantT) / secs, eL = Math.abs(burnt - wantL) / Math.max(1e-6, burnt);
      api.worldToolsDrive = { secs, dist: +dist.toFixed(0), mps: +(dist / secs).toFixed(2), burnt: +burnt.toFixed(2), wantL: +wantL.toFixed(2), throttle: +(thr / n).toFixed(3), fit: +(Math.log(thr / n) / Math.log(p.v / p.top)).toFixed(2) };
      return (eT <= 0.1 && eL <= 0.1) || `drove ${dist.toFixed(0)} m in ${secs} s (math ${wantT.toFixed(1)} s), burnt ${burnt.toFixed(2)} L (math ${wantL.toFixed(2)} L; mean throttle ${(thr / n).toFixed(2)})`;
    } finally {
      g.driveOverride = null; if (P.inVehicle) g.exitVehicle(true); if (g.vehicles.includes(v)) g.vehiclesSys.remove(v); g.god = godWas;
      await C('teleport', { x: x0, z: z0 });
    }
  });
  if (!STAMPS.regions.length) return;
  await check('world-tools: the proof state streams with no dead seams (the shared edge is open: no wall, no fog; the road runs on one line across it; both chunks agree on their edge)', async () => {
    for (const s of STAMPS.regions) {
      const R = W.regions[s.id]; if (!R) return `${s.id} not built`;
      for (const o of R.open) {
        const N = W.regions[o.with];
        for (const cor of R.corridors) {
          const tw = N.corridors.find((c) => c.id === cor.id); if (!tw) continue;
          const a = cor.ends.start, b = tw.ends.end, gap = Math.hypot(a.x - b.x, a.z - b.z);
          if (gap > 1 && Math.hypot(cor.ends.end.x - tw.ends.start.x, cor.ends.end.z - tw.ends.start.z) > 1) return `${cor.id}: the two halves miss by ${gap.toFixed(1)} m at the ${o.side} edge`;
          if (R.edgeFade(a.x, a.z) > 0 || N.edgeFade(a.x, a.z) > 0) return `${cor.id}: fog at the seam`;
          // both sides of the seam lay out, and the edge between them matches (the streaming law's own signatures)
          const cx = chunkOf(a.x), czN = chunkOf(a.z - 1), czS = chunkOf(a.z + 1);
          const A = await C('chunk', { cx, cz: czN }), B = await C('chunk', { cx, cz: czS });
          if (!A.ok || !B.ok) return `chunk read failed: ${A.error ?? B.error}`;
          const ea = A.edges?.S ?? A.edge?.S, eb = B.edges?.N ?? B.edge?.N;
          if (ea && eb && JSON.stringify(ea) !== JSON.stringify(eb)) return `${cor.id}: chunk edges disagree at ${cx},${czN}|${czS}`;
          const pN = cor.project(a.x, a.z - 30, 200), pS = tw.project(a.x, a.z + 30, 200);
          if (!(pN.d < 6 && pS.d < 6)) return `${cor.id}: no road 30 m either side of the seam (${pN.d.toFixed(1)} / ${pS.d.toFixed(1)} m)`;
        }
      }
    }
    return true;
  });
  await check('world-tools: a car crosses the seam at speed without the wall stopping it (Florida to Georgia on I-75)', async () => {
    const S = g.streamer, R = Object.values(W.regions).find((q) => q.row.stamped && q.open.length); if (!R) return 'no stamped region with a seam';
    const cor = R.corridors.find((c) => W.regions[R.open[0].with]?.corridors.some((t) => t.id === c.id)); if (!cor) return 'no corridor across the seam';
    const P = g.player, x0 = P.x, z0 = P.z;
    if (P.inVehicle) g.exitVehicle(true);
    const tw = W.regions[R.open[0].with].corridors.find((t) => t.id === cor.id);
    const sB = tw.L - 500, q = S.lanePoint(sB, 1, 0, tw), f = tw.at(sB);
    await C('teleport', { x: q.x, z: q.z });
    const r = await C('spawnVehicle', { type: 'interceptor', x: q.x, z: q.z, heading: Math.atan2(f.tx, f.tz) });
    await C('enterVehicle', { id: r.id, force: true }); await C('teleport', { x: q.x, z: q.z });
    const v = P.inVehicle; if (!v) return 'not in the car';
    try {
      v.vx = Math.sin(v.h) * 30; v.vz = Math.cos(v.h) * 30;
      let crossed = false, stalls0 = S.byCause.cross;
      await S.runFrames(40, () => { const onTw = tw.project(v.x, v.z, 300).d < cor.project(v.x, v.z, 300).d; const a = S.autopilot(v, 1, 0, 30, onTw ? tw : cor); g.driveOverride = { throttle: a.throttle, steer: a.steer }; if (W.regionOf(v.x, v.z) === R) crossed = true; });
      const inR = cor.project(v.x, v.z, 400);
      return (crossed && inR.s > 200 && inR.d < 12 && S.byCause.cross - stalls0 === 0) || `crossed ${crossed}, ${inR.s.toFixed(0)} m into ${R.id} ${cor.id}, ${inR.d.toFixed(1)} m off it, cross stalls ${S.byCause.cross - stalls0}`;
    } finally {
      g.driveOverride = null; if (P.inVehicle) g.exitVehicle(true); if (g.vehicles.includes(v)) g.vehiclesSys.remove(v);
      await C('teleport', { x: x0, z: z0 });
    }
  });
  await check('world-tools: a stamped city stands up (its downtown built, a gated community walled with a gate and guards there) under 150 draw calls', async () => {
    const CG = g.citygen, plan = CG?.plan ?? [];
    const gated = plan.find((r) => r.gated), down = plan.find((r) => r.hood === 'downtown'); if (!gated || !down) return 'no stamped downtown or gated community';
    const P = g.player, x0 = P.x, z0 = P.z;
    try {
      await C('teleport', { x: gated.x, z: gated.z + gated.half + 30 });
      let t = CG.live.get(gated.id) ?? CG.stamp(gated);
      if (!t.T.wall || !t.T.gates.length) return 'the gated community has no wall or gate';
      const guards = t.chars.filter((c) => c.gateGuard && c.alive);
      if (!guards.length) return `no gate guards (free slots ${g.freeSlots?.length})`;
      if (!guards.every((c) => /^[a-z]{2}$/.test(c.flag ?? ''))) return 'a guard without a flag';
      await C('teleport', { x: down.x, z: down.z + 20 });
      t = CG.live.get(down.id) ?? CG.stamp(down);
      if (!(t.T.buildings.length > 20)) return `downtown has ${t.T.buildings.length} buildings`;
      const b = await C('bench', { frames: 60 });
      return b.drawCalls < 150 || `${b.drawCalls} draw calls at the downtown`;
    } finally { await C('teleport', { x: x0, z: z0 }); }
  });
}
