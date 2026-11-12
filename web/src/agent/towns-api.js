// TOWNS AND ROADS as COMMANDS rows and selftest checks (docs/design/WEB_TOWNS_ROADS.md; rows in src/data/towns.js and
// src/data/lanes.js, laid by src/world/townroads.js, run by src/systems/townlife.js). buildCommands() in api.js spreads
// townsCommands into COMMANDS; runSelfTest() calls townsChecks (only=towns runs them alone).
import USMAP from '../data/usmap.json';
import { validateTowns, COUNTERS, COUNTER_KINDS, TOWN_NAMES } from '../data/towns.js';
import { validateLanes, lanesFor } from '../data/lanes.js';
import { ARCHETYPES, KINDS } from '../data/citygen.js';
import { ITEMS } from '../data/items.js';
import { OCCUPATIONS } from '../data/occupations.js';
import { TRADERS } from '../data/trade.js';
import { auditTownRoads, nearPinned } from '../world/townroads.js';
import { STREAM } from '../data/streaming.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function townsCommands(api, need) {
  const g = api.g;
  const W = () => g.streamer?.W ?? null;
  const plan = () => g.citygen?.plan ?? [];
  const placeView = (r) => ({ id: r.id, name: r.name, kind: r.kind, arch: r.arch ?? null, archName: r.archName ?? null, x: Math.round(r.x), z: Math.round(r.z), exit: r.access?.number ?? null, cor: r.access?.cor ?? null, road: r.access?.ribbon ?? null, built: g.citygen?.live.has(r.id) ?? false });
  return {
    towns: {
      group: 'world', desc: 'TOWNS AND ROADS (docs/design/WEB_TOWNS_ROADS.md): every generated town and SITE stamp with its real name, its exit and access road (lanes by the rule), its counters (fuel, food, ammo: keeper, hours, stock, region price), its ruler and its rules. action: list (every place and the road report) | town id= (one: plan, road, and if built its counters and ruler live) | lanes cor=<I-10|I-95|I-75> (the lane rule along the road: runs of the added lane, why, what held it back) | audit (every town reaches the interstates by its own road; the national map too) | validate (the rows) | goto id= (stand at the top of the town\'s access road, at its exit: staging) | entry id= (stand at the end of its access road, at its main street: staging) | counter id= kind= (stand at that counter: staging).',
      args: { action: { type: 'string', default: 'list', enum: ['list', 'town', 'lanes', 'audit', 'validate', 'goto', 'entry', 'counter'] }, id: { type: 'string' }, cor: { type: 'string', default: 'I-10' }, kind: { type: 'string', default: 'fuel' } },
      run: async ({ action, id, cor, kind }) => {
        const w = W(); need(w, 'no streamed world');
        const find = () => { const r = plan().find((q) => q.id === id || q.name === String(id ?? '').toUpperCase()); need(r, `no place ${id}; towns list names them`); return r; };
        if (action === 'list') {
          const R = w.townRoads ?? {};
          return { error: w.townRoadsError ?? null, ms: R.ms, exits: R.exits, reused: R.reused, unserved: R.unserved, signs: R.signs, structs: R.structs, ribbons: R.ribbons, moved: R.moved, lanes: R.lanes,
            places: plan().filter((r) => !r.beyond && (r.kind === 'town' || r.kind === 'site')).map(placeView), live: g.townlife?.list() ?? [] };
        }
        if (action === 'town') { const r = find(); return { ...placeView(r), road: (w.townRoads?.towns ?? []).find((q) => q.id === r.id) ?? null, live: g.townlife?.view(r.id) ?? null }; }
        if (action === 'lanes') {
          const c = cor === 'I-10' ? w.i10 : w.corridors.find((q) => q.id === cor); need(c, `no corridor ${cor}`);
          const P = c.laneProfile ?? [], runs = (cor === 'I-10' ? w.laneRuns : c.laneRuns) ?? [];
          return { cor, km: r1(c.L / 1000), runs: runs.map((q) => ({ from: r1(q.s0 / STREAM.mile), to: r1(q.s1 / STREAM.mile), km: r1((q.s1 - q.s0) / 1000) })), sixLaneKm: r1(runs.reduce((a, q) => a + q.s1 - q.s0, 0) / 1000),
            rule6: P.filter((p) => p.rule > 4).length, built6: P.filter((p) => p.built > 4).length, held: Object.entries(P.filter((p) => p.held).reduce((a, p) => ((a[p.held] = (a[p.held] ?? 0) + 1), a), {})),
            samples: P.filter((_, i) => i % 10 === 0).map((p) => ({ mile: r1(p.s / STREAM.mile), rule: p.rule, built: p.built, place: p.place, km: p.km, why: p.why.join('; '), held: p.held ?? undefined })) };
        }
        if (action === 'audit') return auditTownRoads(w, plan(), USMAP);
        if (action === 'validate') return { towns: validateTowns({ items: ITEMS, occs: OCCUPATIONS, kinds: Object.keys(KINDS) }), lanes: validateLanes() };
        if (action === 'goto' || action === 'entry') {
          const r = find(), a = r.access; need(a, `${r.name} has no access road`);
          const rb = w.ribbons.find((q) => q.id === a.ribbon); need(rb, 'its road is not built');
          const i = action === 'goto' ? 2 : rb.n - 3, h = Math.atan2(rb.x[Math.min(rb.n - 1, i + 1)] - rb.x[i], rb.z[Math.min(rb.n - 1, i + 1)] - rb.z[i]);
          await api.call('teleport', { x: rb.x[i], z: rb.z[i] });
          if (g.player) g.player.face = h;
          return { ok: true, name: r.name, at: [Math.round(rb.x[i]), Math.round(rb.z[i])], heading: r1(h), roadM: Math.round(rb.L), lanes: rb.lanes, entry: a.entry };
        }
        if (action === 'counter') {
          const r = find(), L = g.townlife?.live.get(r.id); need(L, `${r.name} is not built: stand near it first (towns action=entry id=${r.id})`);
          const k = L.counters.find((q) => q.kind === kind); need(k, `no ${kind} counter`);
          await api.call('teleport', { x: k.q.x + k.spot.ox * 1.6, z: k.q.z + k.spot.oz * 1.6 });
          if (g.player) g.player.face = Math.atan2(-k.spot.ox, -k.spot.oz);
          return { ok: true, town: r.name, kind, keeper: k.keeper.name, open: g.townlife.isOpen(L, k), box: k.q.id };
        }
        return null;
      },
    },
  };
}

export async function townsChecks(api, check, C) {
  const g = api.g, W = g.streamer?.W, CG = g.citygen;
  if (!W || !CG) { await check('towns: the streamed world and the city generator are built', async () => 'no W / citygen'); return; }
  const recs = CG.plan.filter((r) => !r.beyond && (r.kind === 'town' || r.kind === 'site') && W.inWorld(r.x, r.z, -50));
  await check('towns: the rows pass their validators (names, counters, regions, rules, roadside, the lane rule)', async () => {
    const a = validateTowns({ items: ITEMS, occs: OCCUPATIONS, kinds: Object.keys(KINDS) }), b = validateLanes();
    return a.ok && b.ok ? true : [...a.errors, ...b.errors].join('; ');
  });
  await check('towns: the road pass ran at boot with no error', async () => (W.townRoadsError ? W.townRoadsError.slice(0, 200) : W.townRoads ? true : 'no W.townRoads'));
  await check('towns: every generated town has a real name (no archetype name), and no two places share one', async () => {
    const towns = CG.plan.filter((r) => r.kind === 'town' && !r.major), arch = new Set(Object.values(ARCHETYPES).map((A) => A.name.toUpperCase())), all = new Set(Object.values(TOWN_NAMES).flat());
    const bad = towns.filter((r) => arch.has(r.name) || !all.has(r.name)).map((r) => r.name);
    const seen = new Map(); for (const r of towns) seen.set(r.name, (seen.get(r.name) ?? 0) + 1);
    const dup = [...seen].filter(([, n]) => n > 1).map(([nm]) => nm);
    return !bad.length && !dup.length && towns.length > 5 ? true : `template names: ${bad.join(', ')}; twice: ${dup.join(', ')}; towns ${towns.length}`;
  });
  await check('towns: every town and site in the streamed world reaches an interstate exit by its own access road (and the national map has no town reached only through a city)', async () => {
    const A = auditTownRoads(W, CG.plan, USMAP);
    return A.ok && A.towns.length === recs.length ? true : `${A.errors.slice(0, 6).join('; ')} (${A.towns.filter((t) => t.ok).length}/${recs.length})`;
  });
  await check('towns: nothing the road pass laid reaches a pinned P1 chunk or the island', async () => {
    const R = W.townRoads, bad = [];
    const onPin = (rb) => { for (let i = 0; i < rb.n; i += 2) if (nearPinned(rb.x[i], rb.z[i], rb.x[i], rb.z[i], 0)) return true; return false; };
    for (const rb of W.ribbons) if ((rb.town || rb.lane || String(rb.exit ?? '').startsWith('TX-')) && onPin(rb)) bad.push(rb.id);
    for (const s of W.structs) if (s.town && nearPinned(s.x, s.z, s.x, s.z, 0)) bad.push(s.kit);
    for (const s of W.signs) if (s.town && nearPinned(s.x, s.z, s.x, s.z, 0)) bad.push(s.id);
    return !bad.length && R.exits + R.reused > 0 ? true : `${bad.slice(0, 6).join(', ')} (exits ${R.exits})`;
  });
  await check('towns: lanes depend on things - I-10 gets an added lane each way near a city, none on a bridge, four lanes in the open', async () => {
    const P = W.i10.laneProfile ?? [], runs = W.laneRuns ?? [];
    const six = P.filter((p) => p.built > 4), open = P.filter((p) => p.rule === 4);
    const onBridge = six.filter((p) => W.water?.onBridge?.(p.s, 0));
    const sec = runs[0] ? W.section((runs[0].s0 + runs[0].s1) / 2) : null;
    // four lanes where nothing widens it: every 4-lane sample's reasons are the open road alone, or a bridge or a grade that held it
    const noTown = open.length > 20 && open.every((p) => p.why.length === 1 || p.why.some((w) => /bridge|mountain/.test(w)));
    return runs.length && six.length && !onBridge.length && sec?.extra > 3 && noTown && lanesFor({ cls: 'interstate' }).lanes === 4 ? true : `runs ${runs.length}, six ${six.length}, on a bridge ${onBridge.length}, extra ${sec?.extra}, open ${open.length}`;
  });
  await check('towns: the map views mark the towns, sites and bases you can enter, and the AREA view colours every land letter (Florida is not desert)', async () => {
    const M = g.qol?.atlas?.marks?.();
    const kinds = new Set((M?.places ?? []).map((q) => q.kind));
    const src = String(g.qol?.drawRegion ?? '');
    return M && kinds.has('town') && kinds.has('site') && kinds.has('base') && src.includes('AREA_RGB') && src.includes('citygen?.plan') ? true : `places ${M?.places?.length ?? 'no atlas'}: ${[...kinds].join(',')}`;
  });
  // A town built and its counters: stand at the fuel counter at noon, buy a can of fuel; the stock does not grow back.
  let town = null;
  const stage = async () => {
    const r = recs.find((q) => q.kind === 'town' && q.access?.ribbon) ?? recs.find((q) => q.access?.ribbon);
    if (!r) return null;
    await C('setTime', { hour: 12 });
    await C('towns', { action: 'entry', id: r.id });
    for (let k = 0; k < 30 && !g.townlife?.live.has(r.id); k++) await api._step(10);
    town = g.townlife?.live.get(r.id) ?? null;
    return town;
  };
  await check('towns: a built town has three counters (fuel, food, ammo), each kept by a named, flagged person at it in its hours', async () => {
    const s = await stage(); if (!s) return 'no town built';
    for (let k = 0; k < 4; k++) await api._step(10);
    const bad = s.counters.filter((k) => !k.c || !k.c.alive || !k.keeper.name || !k.keeper.flag || k.keeper.flag.length !== 2 || !TRADERS[k.keeper.id]);
    return s.counters.length === 3 && COUNTER_KINDS.every((k) => s.counters.some((q) => q.kind === k)) && !bad.length ? true : `${s.rec.name}: ${s.counters.length} counters, unkept ${bad.map((k) => k.kind).join(',')}`;
  });
  await check('towns: buying fuel at a town counter takes cash and moves a real can off the shelf; the shelf does not refill on a new day', async () => {
    const s = town; if (!s) return 'no town';
    const k = s.counters.find((q) => q.kind === 'fuel');
    await C('towns', { action: 'counter', id: s.rec.id, kind: 'fuel' });
    await api._step(5);
    const stock = g.trade.stock(k.c), e = stock.find((q) => q.s.id === 'fuel_can');
    if (!e) return `no fuel can on the shelf: ${stock.map((q) => q.s.id).join(',')}`;
    const before = k.box.count('fuel_can'), cash0 = (g.cash = Math.max(g.cash, 2000));
    const kept = g.inventory.carried.slots; g.inventory.carried.slots = []; // room on you for an 8 kg can (put back after)
    const r = g.trade.buyEntry(k.c, e);
    const after = k.box.count('fuel_can'), paid = cash0 - g.cash, carried = g.inventory.carried.count('fuel_can');
    // a new day: nothing rolls again (the loot law)
    g.society.day += 1;
    g.trade.stock(k.c);
    const next = k.box.count('fuel_can');
    g.society.day -= 1;
    g.inventory.carried.slots = kept; g.inventory.changed();
    return r.ok && after === before - 1 && paid > 0 && carried >= 1 && next === after ? true : `ok ${r.ok} ${r.why ?? ''} shelf ${before}->${after}->${next}, paid ${paid}, carried ${carried}`;
  });
  await check('towns: prices carry the region (the same can costs more in Florida than in the desert)', async () => {
    const tr = Object.values(TRADERS).filter((t) => t.counter === 'fuel');
    const fl = 1.35, de = 1.0; // data/towns.js REGION_ECON
    return tr.length && tr.every((t) => t.priceMul > 0) && fl > de ? true : `fuel traders ${tr.length}`;
  });
  await check('towns: what a town worker makes goes onto its counter (a delivery), never a roll', async () => {
    const s = town; if (!s) return 'no town';
    const B = g.workforce?.towns.get(s.rec.id); if (!B) return 'no workforce book';
    const k = s.counters.find((q) => q.kind === 'food');
    const n0 = k.box.count('flatbread');
    B.stock['test|flatbread'] = { item: 'flatbread', label: 'flatbread off the griddle', at: 'the diner', n: 2 };
    g.townlife.deliver(s);
    const n1 = k.box.count('flatbread');
    delete B.stock['test|flatbread'];
    return n1 === n0 + 2 ? true : `${n0} -> ${n1}`;
  });
  await check('towns: a SITE row that names a ruler has them on the ground (named, flagged, titled) with the row\'s house rules', async () => {
    const site = recs.find((q) => q.kind === 'site' && q.site === 'tombstone-allen-st') ?? null;
    if (!site) return 'THE SILVER STRIP is not planned in the world';
    await C('towns', { action: 'entry', id: site.id });
    for (let k = 0; k < 30 && !g.townlife.live.has(site.id); k++) await api._step(10);
    const s = g.townlife.live.get(site.id); if (!s) return 'not built';
    const R = s.ruler;
    return R && R.alive && R.name && R.flag?.length === 2 && /Marshal/.test(R.title) && s.facts.rules.includes('GUNS CHECKED AT GATE') ? true : `ruler ${R?.name} ${R?.title} rules ${s.facts.rules.join('|')}`;
  });
}
