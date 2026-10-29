// OCCUPATIONS as an agent surface and selftest checks (docs/design/WEB_OCCUPATIONS.md). api.js's `town` command hands
// every action but its night report to townJobs(); runSelfTest() calls rolesChecks with the citygen stage (the workforce
// is off for the rest of the battery, the way the pulls are; these checks turn it on).
import { OCCUPATIONS, GOAL, validateOccupations } from '../data/occupations.js';
import { ITEMS } from '../data/items.js';
import { KINDS } from '../data/citygen.js';
import { evaluate, profileOf, mixOf, shannon, workplaceOf, onShift } from '../world/occupations.js';
import { freeSpot } from './citygen-api.js';

const r1 = (v) => Math.round(v * 10) / 10;
const DEALS = ['gun', 'ammo', 'tool', 'med', 'part', 'pack', 'water', 'food', 'valuable', 'paper', 'hide'];
const DOCK = Object.entries(OCCUPATIONS).filter(([, o]) => o.out === 'dock' || /pier|wharf|dock|slip|harbor/.test(o.hero ?? '')).map(([id]) => id).concat(['harbourmaster', 'shipwright']);
// The plan records the mix is made for (towns and sites), as the fixture keeps them
const recOf = (g, r) => ({ id: r.id, kind: r.kind, arch: r.arch, site: r.site ?? undefined, biome: r.biome, x: r.x, z: r.z, seed: r.seed, walls: r.walls, region: g.streamer?.W?.regionOf?.(r.x, r.z)?.id ?? null, name: r.name, beyond: r.beyond ?? undefined });
const planned = (g) => (g.citygen?.plan ?? []).filter((r) => (r.kind === 'town' || r.kind === 'site') && !r.adhoc);

// The settlement an action means: id=, else the one you stand in, else the nearest within 3 km
function pick(g, id) {
  const CG = g.citygen, p = g.player;
  if (id) return CG.byId.get(id) ?? null;
  return CG.recAt(p.x, p.z, 20) ?? CG.near(p.x, p.z, 3000).filter((r) => r.kind === 'town' || r.kind === 'site').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0] ?? null;
}

export async function townJobs(api, need, { action, id }) {
  const g = api.g, CG = g.citygen, WF = g.workforce;
  need(CG && WF, 'citygen and the workforce must be running');
  if (action === 'validate') return validateOccupations(OCCUPATIONS, { items: ITEMS, kinds: KINDS, deals: DEALS });
  if (action === 'dump') return { note: 'citygen plan records (towns + sites); tools/role-diversity.mjs --refresh writes them to tools/fixtures/settlements.json', records: planned(g).map((r) => recOf(g, r)) };
  if (action === 'diversity') {
    const R = evaluate(planned(g).map((r) => recOf(g, r)));
    return { goal: GOAL, ...R.summary, fails: R.towns.filter((t) => !(t.pass.H && t.pass.cap && t.pass.jac)).slice(0, 30).map((t) => ({ id: t.id, name: t.name, key: t.key, H: t.H, maxShare: t.maxShare, top: t.top, nb: t.nb, jd: t.jd })) };
  }
  const rec = pick(g, id);
  need(rec, id ? `no settlement ${id}` : 'no town or site within 3 km (id=cg-N)');
  const P = profileOf(recOf(g, rec));
  need(P, `${rec.id} has no workforce (a homestead, a base, or nobody lives there)`);
  const t = CG.live.get(rec.id), B = t ? WF.book(t) : WF.towns.get(rec.id) ?? null;
  if (action === 'promote') { need(t, `${rec.id} is not built (go there, or citygen action=stamp)`); WF.t = 0; WF.update(1); return { promoted: B.workers.filter((w) => w.c).length, live: WF.live.size }; }
  if (action === 'who') {
    if (!B) { const jobs = mixOf(P); return { id: rec.id, name: rec.name, built: false, note: 'not built: the roster only (the people appear when it is)', roster: jobs.map((j) => ({ job: j.id, n: j.n })) }; }
    return { id: rec.id, name: rec.name, built: !!t, hour: r1(g.sky.time), live: B.workers.filter((w) => w.c).length, workers: B.workers.map((w) => WF.view(w)) };
  }
  // jobs
  const jobs = mixOf(P), H = shannon(jobs);
  const all = evaluate(planned(g).map((r) => recOf(g, r))).towns.find((q) => q.id === rec.id);
  return {
    id: rec.id, name: rec.name, kind: P.key, cls: P.cls, wealth: P.wealth, workforce: P.n, tags: [...P.tags].sort(), H: +H.toFixed(3), maxShare: jobs[0]?.share ?? 0,
    neighbour: all ? { id: all.nb, km: all.nbKm, jaccard: all.jd } : null, meets: all ? all.pass : null,
    jobs: jobs.map((j) => { const o = OCCUPATIONS[j.id], wp = workplaceOf(o, P); return { id: j.id, name: o.name, n: j.n, share: j.share, at: wp?.at ?? wp?.hero ?? wp?.out, shift: o.shift, makes: o.makes ? `${o.makes[2]} max, one per ${o.makes[1]} h worked: ${o.makes[3]}` : null }; }),
    stock: B ? Object.values(B.stock) : [], made: B ? B.made.slice(-10) : [], built: !!t,
  };
}

export async function rolesChecks({ api, g, check, C }) {
  const WF = g.workforce, CG = g.citygen, p = g.player;
  const was = { wf: WF.enabled, zombies: g.zombies.enabled, raiders: g.raiderTimer, hour: g.sky.time, day: g.society.day };
  g.zombies.enabled = false; g.raiderTimer = 1e9;
  let T = null;
  const stand = async (x, z) => { if (p.inVehicle) g.exitVehicle(true); await C('teleport', { x, z }); g.camLook.x = p.x; g.camLook.z = p.z; await C('step', { seconds: 0.2 }); };
  try {
    await check('occupations: the occupation rows validate - 40+ jobs, each with a real workplace, shift, items it carries and makes, known tags and three things to say; a broken row is caught', async () => {
      const v = validateOccupations(OCCUPATIONS, { items: ITEMS, kinds: KINDS, deals: DEALS });
      const bad = validateOccupations({ x: { name: 'x', at: ['spaceport'], shift: [8, 8], carry: ['moonbeam'], makes: ['stardust', 0, 0], base: -1, fit: { lunar: 1 }, talk: [] } }, { items: ITEMS, kinds: KINDS, deals: DEALS });
      return v.ok && Object.keys(OCCUPATIONS).length >= 40 && !bad.ok && bad.errors.length >= 7 ? true : JSON.stringify({ v: v.errors.slice(0, 5), bad: bad.errors.length });
    });
    await check('occupations: every peopled settlement in the live plan meets the diversity goal - Shannon >= 1.6, no job over 25%, its nearest same-kind neighbour >= 0.3 apart (Jaccard)', async () => {
      const R = evaluate(planned(g).map((r) => recOf(g, r))), S = R.summary;
      const bad = R.towns.filter((t) => !(t.pass.H && t.pass.cap && t.pass.jac));
      return S.settlements > 100 && !bad.length ? true : JSON.stringify({ ...S, bad: bad.slice(0, 6).map((t) => `${t.id} H${t.H} top ${t.top} ${t.maxShare} jd ${t.jd}`) });
    });
    await check('occupations: a port has dock work and the dry desert has none - every port town keeps dockhands and a harbourmaster, no settlement on dry desert ground has a dock job', async () => {
      let ports = 0, deserts = 0; const bad = [];
      for (const r of planned(g)) {
        const P = profileOf(recOf(g, r)); if (!P) continue;
        const set = mixOf(P).map((j) => j.id);
        if (P.arch === 'port_wharf') { ports++; if (!set.includes('dockhand') || !set.includes('harbourmaster')) bad.push(`${r.id} port: ${set.slice(0, 6)}`); }
        if (P.tags.has('desert') && !P.tags.has('water')) { deserts++; const d = set.filter((j) => DOCK.includes(j)); if (d.length) bad.push(`${r.id} desert: ${d}`); }
      }
      return ports > 0 && deserts > 0 && !bad.length ? true : JSON.stringify({ ports, deserts, bad: bad.slice(0, 6) });
    });

    // a built port town for the live checks (pinned, removed at the end)
    const s = freeSpot(g, 9000, -12000, 240);
    if (s) T = CG.stampAt({ id: 'cg-roles-port', arch: 'port_wharf', biome: 'gulf_coast', seed: 4417, x: s.x, z: s.z });
    WF.enabled = true;

    await check('occupations: a worker walks from home to their workplace at the start of the shift, works there (the work pose, facing the job) and carries a real flag and a name', async () => {
      if (!T) return 'no free ground for the test town';
      const B = WF.book(T);
      // the worker whose home is a fair walk from the job (a day shift starting at a whole hour)
      const cand = B.workers.filter((w) => w.work && w.home && w.shift[0] >= 5 && w.shift[0] <= 9).map((w) => [Math.hypot(w.work.x - w.home.x, w.work.z - w.home.z), w]).filter(([d]) => d > 12 && d < 90).sort((a, b) => a[0] - b[0]);
      if (!cand.length) return `no worker with a walk to work (${B.workers.length} workers)`;
      const w = cand[0][1];
      for (const q of WF.live) WF.demote(q);
      g.sky.time = w.shift[0] - 0.05;
      await stand(w.home.x + 3, w.home.z + 3);
      WF.t = 0; WF.update(0.01);
      if (!w.c) WF.promote(w);
      const c = w.c;
      if (!c) return 'not promoted (no character slot)';
      const atHome = Math.hypot(c.x - w.home.x, c.z - w.home.z);
      if (atHome > 3) return `before the shift they were not at home (${r1(atHome)} m)`;
      g.sky.time = w.shift[0] + 0.01;
      const d0 = Math.hypot(c.x - w.work.x, c.z - w.work.z);
      let best = d0;
      for (let k = 0; k < 10 && w.state !== 'working'; k++) { await C('step', { seconds: 15 }); best = Math.min(best, Math.hypot(c.x - w.work.x, c.z - w.work.z)); }
      const ok = w.state === 'working' && c.work && Math.hypot(c.x - w.work.x, c.z - w.work.z) < 2.2 && /^[A-Z]{2}$/.test(c.flag ?? '') && c.name === w.name;
      const talk = WF.talkFor(c);
      return ok && talk?.choices?.length >= 2 ? true : JSON.stringify({ job: w.occ, state: w.state, work: !!c.work, d0: r1(d0), best: r1(best), now: r1(Math.hypot(c.x - w.work.x, c.z - w.work.z)), flag: c.flag, talk: !!talk });
    });

    await check('occupations: produced goods appear only after work happened - a job left unworked through its shift makes nothing; the same hours worked at the bench make one unit per row hours, banked to the worker who did them', async () => {
      if (!T) return 'no test town';
      const B = WF.book(T);
      const w = B.workers.find((q) => OCCUPATIONS[q.occ].makes && q.alive && OCCUPATIONS[q.occ].shift[0] < OCCUPATIONS[q.occ].shift[1] && OCCUPATIONS[q.occ].shift[1] - OCCUPATIONS[q.occ].shift[0] >= 6);
      if (!w) return 'no maker with a long day shift';
      const [item, per] = OCCUPATIONS[w.occ].makes;
      const key = `${w.work.bid ?? w.work.label}|${item}`;
      const stockOf = () => B.stock[key]?.n ?? 0;
      const run = async (hours) => { const n = Math.round(hours / 0.25); for (let i = 0; i < n; i++) { g.sky.time += 0.25; B.lastGh = WF.gh() - 0.25; if (w.c) WF.think(w.c, 0.05); WF.produce(); } };
      for (const q of WF.live) WF.demote(q);
      delete B.stock[key]; w.workH = 0; w.made = 0;
      // A: on shift, the worker away (folded into the record): the hours pass, nothing is made
      g.sky.time = w.shift[0] + 0.1;
      await run(Math.min(per * 2, w.shift[1] - w.shift[0] - 1) );
      const a = { stock: stockOf(), workH: w.workH };
      // B: the same hours with the worker at the bench, on shift
      g.sky.time = w.shift[0] + 0.1;
      await stand(w.work.x + 3, w.work.z + 3);
      WF.promote(w, { ...w.work, at: 'work' });
      if (!w.c) return 'not promoted';
      w.c.x = w.work.x; w.c.z = w.work.z; WF.think(w.c, 0.05);
      const hours = Math.min(per * 2, w.shift[1] - w.shift[0] - 1);
      await run(hours);
      const want = Math.floor(hours / per + 1e-6);
      const b = { stock: stockOf(), made: w.made, by: B.made.filter((m) => m.by === w.id).length };
      return a.stock === 0 && a.workH === 0 && want >= 1 && b.stock === want && b.made === want && b.by >= want ? true : JSON.stringify({ job: w.occ, per, hours, want, a, b, state: w.state });
    });

    await check('occupations: a dead worker stays dead and their work goes undone - folded and built again, the record keeps the death', async () => {
      if (!T) return 'no test town';
      const B = WF.book(T), w = B.workers.find((q) => q.c) ?? B.workers[0];
      if (!w.c) WF.promote(w); if (!w.c) return 'not promoted';
      w.c.hp = 0; w.c.alive = false;
      WF.demote(w);
      WF.t = 0; WF.update(0.01);
      return !w.alive && !w.c ? true : JSON.stringify({ alive: w.alive, c: !!w.c });
    });
  } finally {
    for (const q of [...WF.live]) WF.demote(q);
    if (T) { CG.remove('cg-roles-port'); WF.towns.delete('cg-roles-port'); }
    WF.enabled = was.wf; g.zombies.enabled = was.zombies; g.raiderTimer = was.raiders; g.sky.time = was.hour; g.society.day = was.day;
  }
}
