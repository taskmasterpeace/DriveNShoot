// THE ROADSCAPE for agents (docs/design/WEB_ROADSCAPE.md; rows data/roadscape.js, placer world/roadscape.js): the `roadscape`
// command (what stands beside the road here and why, a stretch's statistics, the keep-out audit, the rows) and the
// selftest's named checks for the lane (each returns true or a JSON diagnostic).
import { validateRoadscape, ROAD_CLASSES, ROAD_BIOMES, SCENES, CADENCE, CLASS_OF } from '../data/roadscape.js';
import { placeRoadside, superInfo, resolveBlock, corridorRun, ribbonRun, chunkRoads, roadBiomeAtOf, cityDistOf, nothingChance, saltOf, clearEdge, RSC_DEBUG } from '../world/roadscape.js';
import { FLORA_KINDS } from '../world/flora.js';
import { regionWater } from '../world/regions.js';
import { STREAM } from '../data/streaming.js';

const r1 = (v) => Math.round(v * 10) / 10;
const EDGE_I = clearEdge('interstate', STREAM.median / 2 + STREAM.shoulderIn + 2 * STREAM.lane + STREAM.shoulderOut);
// A straight synthetic road (the pure checks): x along it, z across.
export const straightRun = (id, cls, half, L = 12000) => ({ id, salt: saltOf(id), cls, L, sA: 0, sB: L, at: (s, P) => { P.x = s; P.z = 0; P.tx = 1; P.tz = 0; return P; }, half: () => half, skip: () => false });
// FNV over a placement list (positions in cm, kinds, pools): "same seed, same roadside".
export const placementHash = (props) => { let h = 2166136261; const add = (v) => { h ^= v & 0xffff; h = Math.imul(h, 16777619); h ^= v >>> 16; h = Math.imul(h, 16777619); }; for (const p of props) { add(Math.round(p.x * 100)); add(Math.round(p.z * 100)); add(Math.round(p.sy * 100)); add(p.kind.length * 31 + p.kind.charCodeAt(0)); } return (h >>> 0).toString(16).padStart(8, '0'); };

// Why a point is out of bounds for a roadside prop (null: it is fine). Independent of the chunk generator's own test:
// it asks the world (the corridors, the ribbons, the water, the settlements) directly.
export function keepOutWhy(W, x, z, r = 0) {
  for (const cor of W.corridors ?? [W.i10]) { const q = cor.project(x, z, 200); if (q.d < EDGE_I + r - 0.05) return `in ${cor.id ?? 'I-10'}'s clear zone (${r1(q.d)} m from its centreline < ${r1(EDGE_I)})`; }
  const C = STREAM.C, F = W.featuresOf(Math.floor(x / C), Math.floor(z / C));
  for (const rb of F?.ribbons ?? []) {
    if (rb.mainline || x < rb.x0 || x > rb.x1 || z < rb.z0 || z > rb.z1) continue;
    const d = W.ribbonDist(rb, x, z), w = Math.max(rb.wl[0], rb.wr[0]) + (rb.kind === 'county' ? ROAD_CLASSES['two-lane'].clearZone : 0);
    if (d < w + r - 0.05) return `on ${rb.id} (${r1(d)} m < ${r1(w)})`;
  }
  if (W.water?.near(x, z)) { const q = W.water.sample(x, z); if (q.depth > 0) return `in water (${r1(q.depth)} m deep)`; }
  const RG = W.regionOf?.(x, z, 3000);
  if (RG?.water) { const q = regionWater(RG, x, z); if (q.d > 0) return `in ${RG.id}'s water (${r1(q.d)} m)`; }
  if (W.citygen?.solid(x, z, 0)) return 'on a settlement pad';
  if (W.ring?.solid(x, z, 0)) return 'in the Phoenix ring';
  if (RG) for (const H of RG.holdouts) if (H.solid(x, z, 0)) return `in ${H.id ?? 'a holdout'}`;
  for (const b of F?.buildings ?? []) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return `in building ${b.id ?? ''}`;
  return null;
}

export function roadscapeCommands(api, need) {
  const g = api.g, P = () => g.player, S = () => g.streamer, Wd = () => g.streamer.W;
  const corById = (id) => { const W = Wd(); return (W.corridors ?? [W.i10]).find((c) => (c.id ?? 'I-10').toLowerCase() === String(id).toLowerCase()); };
  return {
    roadscape: {
      group: 'world', budget: 120,
      desc: 'THE ROADSCAPE (docs/design/WEB_ROADSCAPE.md; rows data/roadscape.js, placer world/roadscape.js; the authored sites - stations, junkyards, farms, the dam - are the `roadside` command): what stands beside the open road by road class (interstate, divided, two-lane, rural, dirt: clear zone, ditch, nothing and service chances) and road biome (Florida flatwoods, swamp, forest hills, farm belt, plains, scrub, desert, mountains, snowy north, dead sprawl). action=at (default): at x,z (or you) the nearest road, its class and clear-zone edge, the road biome, metres to the nearest town, this super-block\'s nothing roll and the scenes of the slots here on both sides, and what the chunk placed. stats road=<I-10|I-95|I-75> from= to= (metres along it; default all; scene=<id> lists where that scene stands): the scenes along that stretch, the nothing fraction against the expected NOTHING chance per biome, prop counts by kind (pure placer, no layout). audit r=<chunks round you, default 1>: every roadside prop the resident chunks placed, checked against the world (a road or its clear zone, water, a settlement or the ring, a building) - bad ones listed. rows: the validator\'s report and the row counts.',
      args: { action: { type: 'string', default: 'at', enum: ['at', 'stats', 'audit', 'rows'] }, x: { type: 'number' }, z: { type: 'number' }, road: { type: 'string', default: 'I-10' }, from: { type: 'number' }, to: { type: 'number' }, r: { type: 'number', default: 1 }, seed: { type: 'number' }, scene: { type: 'string' } },
      run: async ({ action = 'at', x, z, road = 'I-10', from, to, r = 1, seed, scene }) => {
        const W = Wd(), px = x ?? P().x, pz = z ?? P().z, C = STREAM.C;
        if (action === 'rows') return { ...validateRoadscape(undefined, FLORA_KINDS), classes: Object.fromEntries(Object.entries(ROAD_CLASSES).map(([k, c]) => [k, { clearZone: c.clearZone, ditch: c.ditch, nothing: c.nothing, service: c.service }])), biomes: Object.fromEntries(Object.entries(ROAD_BIOMES).map(([k, b]) => [k, { label: b.label, nothing: b.nothing, bed: b.bed }])), scenes: Object.keys(SCENES), cadence: CADENCE };
        const biomeAt = roadBiomeAtOf(W), cityDistAt = cityDistOf(W);
        if (action === 'stats') {
          const cor = corById(road), rb = cor ? null : W.ribbons.find((q) => q.id === road && q.kind === 'county');
          need(cor || rb, `no corridor or county road "${road}" (corridors ${(W.corridors ?? []).map((c) => c.id ?? 'I-10').join(', ')}; county roads: ${W.ribbons.filter((q) => q.kind === 'county').map((q) => q.id).slice(0, 12).join(', ')}...)`);
          const L = (cor ?? rb).L, sA = Math.max(0, from ?? 0), sB = Math.min(L, to ?? L), run = cor ? corridorRun(W, cor, sA, sB) : Object.assign(ribbonRun(W, rb), { sA, sB });
          const res = placeRoadside({ seed: seed ?? W.seed, roads: [run], ox: 0, oz: 0, C: 0, all: true, biomeAt, cityDistAt });
          const ctx = { seed: seed ?? W.seed, biomeAt, cityDistAt, knobs: { nothing: 1 }, P: { x: 0, z: 0, tx: 0, tz: 1 } }, n = CADENCE.slot * CADENCE.blockSlots * CADENCE.superBlocks, byBiome = {};
          for (let sup = Math.floor(sA / n); sup * n < sB; sup++) {
            const I = superInfo(ctx, run, sup), b = (byBiome[I.biome] ??= { supers: 0, nothing: 0, expected: +nothingChance(I.biome, run.cls).toFixed(3) });
            b.supers++; if (I.nothing) b.nothing++;
          }
          for (const b of Object.values(byBiome)) b.fraction = +(b.nothing / b.supers).toFixed(3);
          const scenes = {}, kinds = {};
          for (const s of res.scenes) scenes[s.scene] = (scenes[s.scene] ?? 0) + 1;
          for (const p of res.props) kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
          const P0 = { x: 0, z: 0, tx: 0, tz: 1 }, where = scene ? res.scenes.filter((q) => q.scene === scene).slice(0, 24).map((q) => { const sm = (q.s0 + q.s1) / 2; run.at(sm, P0); return { s: Math.round(sm), mile: r1(sm / STREAM.mile), x: Math.round(P0.x), z: Math.round(P0.z), side: q.side > 0 ? 'right' : 'left', biome: biomeAt(P0.x, P0.z) }; }) : undefined;
          return { road: run.id, cls: run.cls, from: Math.round(sA), to: Math.round(sB), km: r1((sB - sA) / 1000), nothingByBiome: byBiome, scenes, props: res.props.length, kinds, hash: placementHash(res.props), where };
        }
        if (action === 'audit') {
          RSC_DEBUG.keep = true;
          const cx0 = Math.floor(px / C), cz0 = Math.floor(pz / C), bad = [], kinds = {};
          let n = 0, chunks = 0;
          try {
            const { layoutChunk, makeScratch } = await import('../world/chunkgen.js');
            const sc = makeScratch();
            for (let cx = cx0 - r; cx <= cx0 + r; cx++) for (let cz = cz0 - r; cz <= cz0 + r; cz++) {
              const tiles = { foot: { a: new Uint8Array(65536), any: false }, car: { a: new Uint8Array(16384), any: false } };
              const gen = layoutChunk(W, cx, cz, tiles, null, sc); let q; do q = gen.next(); while (!q.done);
              chunks++;
              for (const p of q.value.roadscape?.kept ?? []) { n++; kinds[p.kind] = (kinds[p.kind] ?? 0) + 1; const why = keepOutWhy(W, p.x, p.z, p.r); if (why) bad.push({ ...p, why }); }
            }
          } finally { RSC_DEBUG.keep = false; }
          return { at: { x: r1(px), z: r1(pz) }, chunks, props: n, kinds, bad: bad.slice(0, 20), badCount: bad.length };
        }
        // at
        let best = null;
        for (const cor of W.corridors ?? [W.i10]) { const q = cor.project(px, pz, 400); if (q.d < (best?.d ?? Infinity)) best = { d: q.d, s: q.s, side: q.side, cor }; }
        const roads = chunkRoads(W, Math.floor(px / C), Math.floor(pz / C), C, (a, b) => W.featuresOf(a, b));
        const ctx = { seed: W.seed, biomeAt, cityDistAt, knobs: {}, P: { x: 0, z: 0, tx: 0, tz: 1 } };
        let here = null;
        if (best) {
          const run = corridorRun(W, best.cor, best.s - 200, best.s + 200), A = Math.floor(best.s / CADENCE.slot), blk = Math.floor(A / CADENCE.blockSlots);
          const sup = Math.floor(blk / CADENCE.superBlocks), I = superInfo(ctx, run, sup);
          const sides = {};
          for (const side of [1, -1]) sides[side > 0 ? 'right' : 'left'] = resolveBlock(ctx, run, blk, side).scenes.filter((sc) => A >= sc.slot && A < sc.slot + sc.span).map((sc) => ({ scene: sc.id, label: SCENES[sc.id].label, one: SCENES[sc.id].side === 'one' }));
          here = { road: run.id, cls: run.cls, s: Math.round(best.s), mile: r1(best.s / STREAM.mile), d: r1(best.d), side: best.side > 0 ? 'right' : 'left', clearEdge: r1(clearEdge(run.cls, run.half(best.s))), inClearZone: best.d < clearEdge(run.cls, run.half(best.s)),
            skipped: run.skip(best.s), slot: A, superBlock: { id: sup, biome: I.biome, nothing: I.nothing, chance: +I.chance.toFixed(3) }, scenes: sides };
        }
        const L = S().layouts.get(`${Math.floor(px / C)},${Math.floor(pz / C)}`);
        return { at: { x: r1(px), z: r1(pz) }, biome: biomeAt(px, pz), townM: Math.round(cityDistAt(px, pz)), nearest: here, chunkRoads: roads.map((q) => `${q.id} (${q.cls})`), chunk: L ? { key: L.key, hash: L.hash, roadscape: L.roadscape ? { placed: L.roadscape.placed, scenes: L.roadscape.scenes, kinds: L.roadscape.kinds, dropped: L.roadscape.dropped } : null } : null };
      },
    },
  };
}

// ---- the named checks (WEB_ROADSCAPE.md §8) --------------------------------------------------------------------------------
export async function roadscapeChecks({ api, g, check, C }) {
  const W = g.streamer.W, seed = W.seed;
  const synth = (bio, cls, half, city = 1e9, sd = seed, L = 12000) => placeRoadside({ seed: sd, roads: [straightRun(`synthetic ${bio} ${cls}`, cls, half, L)], ox: 0, oz: 0, C: 0, all: true, biomeAt: () => bio, cityDistAt: () => city });
  const I10 = W.i10, run10 = (sA, sB) => corridorRun(W, I10, sA, sB);

  await check('roadscape: the rows validate (classes, road biomes, scenes, setbacks within reach, real flora species, no purple) and every DSOA biome letter maps to a road biome', async () => {
    const v = validateRoadscape(undefined, FLORA_KINDS);
    const letters = ['d', 'f', 'u', 'm', 'p', 'a', 'w', 'F', 's', '.'], unmapped = letters.filter((L) => !ROAD_BIOMES[roadBiomeAtOf({ biomeAt: () => L, regionOf: () => null, stateAt: () => null })(0, 0)]);
    return v.ok && !unmapped.length && v.counts.scenes >= 14 && v.counts.biomes >= 9 ? true : JSON.stringify({ errors: v.errors.slice(0, 6), unmapped });
  });

  await check('roadscape: a forest two-lane has a tree wall near its clear zone (Appalachian hills and Florida flatwoods: most slots walled on both sides, the front rank within 2.5 m of the clear zone\'s edge, nothing inside it)', async () => {
    const out = {};
    for (const bio of ['forest-hills', 'pine-flat']) {
      const res = synth(bio, 'two-lane', 4.6), trees = res.props.filter((p) => p.kind === 'tree'), walls = res.scenes.filter((s) => s.scene === 'tree-wall');
      const slots = 12000 / CADENCE.slot, walled = walls.reduce((a, s) => a + s.span, 0) / (2 * slots);
      // the front rank: per 10 m of road and side, the tree-wall tree nearest the road
      const best = new Map(); for (const p of trees) if (p.scene === 'tree-wall') { const k = Math.floor(p.x / 10) * 2 + (p.side > 0 ? 1 : 0), d = p.lat - p.edge; if (!(best.get(k) <= d)) best.set(k, d); }
      const front = [...best.values()].sort((a, b) => a - b);
      const inClear = res.props.filter((p) => p.lat < p.edge - 0.01 && !['lane', 'drive', 'apron'].includes(p.kind)).length;
      out[bio] = { walled: +walled.toFixed(2), trees: trees.length, nearest: r1(front[0]), median: r1(front[front.length >> 1]), inClear };
    }
    const ok = Object.values(out).every((o) => o.walled > 0.45 && o.nearest >= 0 && o.median < 2.5 && o.inClear === 0 && o.trees > 1500);
    return ok ? true : JSON.stringify(out);
  });

  await check('roadscape: an interstate near a town has sound walls (I-10 just outside the Phoenix ring), far from every town none (the open desert, and the pure placer at 30 km)', async () => {
    const cd = cityDistOf(W), near = [], far = [];
    // walk I-10 east and west of Phoenix: stretches whose centreline is 100-900 m from a town's edge, and 3 km+
    const res = placeRoadside({ seed, roads: [run10(0, I10.L)], ox: 0, oz: 0, C: 0, all: true, biomeAt: roadBiomeAtOf(W), cityDistAt: cd });
    for (const p of res.props) if (p.kind === 'soundwall') { const d = cd(p.x, p.z); (d < 1400 ? near : far).push(d); }
    const synthFar = synth('sprawl', 'interstate', 12.2, 30000).props.filter((p) => p.kind === 'soundwall').length, synthNear = synth('sprawl', 'interstate', 12.2, 300).props.filter((p) => p.kind === 'soundwall').length;
    return near.length >= 20 && far.length === 0 && synthFar === 0 && synthNear > 100 ? true : JSON.stringify({ near: near.length, far: far.length, farMin: far.length ? Math.round(Math.min(...far)) : null, synthNear, synthFar });
  });

  await check('roadscape: a desert interstate has its nothing-stretches at about NOTHING_CHANCE (I-10\'s desert super-blocks empty at 0.50 x 1.15, within the sampling error; an empty super-block carries no scene but a service stop)', async () => {
    const ctx = { seed, biomeAt: roadBiomeAtOf(W), cityDistAt: cityDistOf(W), knobs: { nothing: 1 }, P: { x: 0, z: 0, tx: 0, tz: 1 } };
    const n = CADENCE.slot * CADENCE.blockSlots * CADENCE.superBlocks, want = nothingChance('desert', 'interstate');
    let sup = 0, empty = 0, leak = 0;
    // I-10 and a long synthetic desert interstate (the corridor alone is only ~60 super-blocks)
    const runs = [run10(0, I10.L), straightRun('synthetic desert I', 'interstate', 12.2, 400000)];
    for (const run of runs) {
      const c2 = run === runs[0] ? ctx : { ...ctx, biomeAt: () => 'desert', cityDistAt: () => 1e9 };
      for (let k = 0; k * n < run.L; k++) {
        const I = superInfo(c2, run, k);
        if (I.biome !== 'desert') continue;
        sup++; if (I.nothing) { empty++; for (let b = k * CADENCE.superBlocks; b < (k + 1) * CADENCE.superBlocks; b++) for (const side of [1, -1]) leak += resolveBlock(c2, run, b, side).scenes.filter((s) => s.group !== 'service').length; }
      }
      run.memo = null;
    }
    const f = empty / sup, err = 2.6 * Math.sqrt((want * (1 - want)) / sup);
    return sup > 150 && Math.abs(f - want) < err && leak === 0 ? true : JSON.stringify({ supers: sup, empty, fraction: +f.toFixed(3), want: +want.toFixed(3), tolerance: +err.toFixed(3), leak });
  });

  await check('roadscape: farmland has field fences (posts and rails at the field edge, a crop in rows behind them) on its two-lanes and its interstates, and the plains keep a windmill and stock tank', async () => {
    const tl = synth('farmland', 'two-lane', 4.6), it = synth('farmland', 'interstate', 12.2), pl = synth('grassland', 'two-lane', 4.6);
    const c = (res, k) => res.props.filter((p) => p.kind === k).length;
    const o = { tlPosts: c(tl, 'fencepost'), tlRails: c(tl, 'fencerail'), tlCrop: c(tl, 'crop'), itPosts: c(it, 'fencepost'), windmills: c(pl, 'windmilldeck'), tanks: c(pl, 'stocktank') };
    return o.tlPosts > 100 && o.tlRails > 100 && o.tlCrop > 200 && o.itPosts > 30 && o.windmills > 0 && o.tanks > 0 ? true : JSON.stringify(o);
  });

  await check('roadscape: the same seed gives the same placements (twice over I-10 and a synthetic forest road, any chunk order: a chunk built sliced matches its resident hash), another seed a different roadside', async () => {
    const a = placeRoadside({ seed, roads: [run10(0, I10.L)], ox: 0, oz: 0, C: 0, all: true, biomeAt: roadBiomeAtOf(W), cityDistAt: cityDistOf(W) });
    const b = placeRoadside({ seed, roads: [run10(0, I10.L)], ox: 0, oz: 0, C: 0, all: true, biomeAt: roadBiomeAtOf(W), cityDistAt: cityDistOf(W) });
    const f1 = synth('forest-hills', 'two-lane', 4.6), f2 = synth('forest-hills', 'two-lane', 4.6), f3 = synth('forest-hills', 'two-lane', 4.6, 1e9, seed + 1);
    // chunk-by-chunk: the props a run of chunks keeps, in either order, are the whole run's (the seam law)
    const mid = I10.at(I10.L * 0.75), cx = Math.floor(mid.x / 256), cz = Math.floor(mid.z / 256), part = (order) => {
      const all = [];
      for (const [dx, dz] of order) { const ox = (cx + dx) * 256, oz = (cz + dz) * 256; all.push(...placeRoadside({ seed, roads: chunkRoads(W, cx + dx, cz + dz, 256, (p, q) => W.featuresOf(p, q)), ox, oz, C: 256, biomeAt: roadBiomeAtOf(W), cityDistAt: cityDistOf(W) }).props); }
      return all.map((p) => `${p.kind}:${Math.round(p.x * 100)},${Math.round(p.z * 100)}`).sort().join('|');
    };
    const ord = []; for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) ord.push([dx, dz]);
    const p1 = part(ord), p2 = part([...ord].reverse());
    const t = I10.at(I10.L * 0.75);
    await C('teleport', { x: t.x + 30, z: t.z + 30 });
    const ch = await C('chunk', { x: t.x, z: t.z, fresh: true, mode: 'sliced' });
    const ok = placementHash(a.props) === placementHash(b.props) && a.props.length > 500 && placementHash(f1.props) === placementHash(f2.props) && placementHash(f1.props) !== placementHash(f3.props) && p1 === p2 && p1.length > 0 && ch.fresh?.matches === true;
    return ok ? true : JSON.stringify({ a: placementHash(a.props), b: placementHash(b.props), n: a.props.length, f: [placementHash(f1.props), placementHash(f2.props), placementHash(f3.props)], order: p1 === p2, part: p1.length, fresh: ch.fresh });
  });

  await check('roadscape: nothing stands in a road, a clear zone, water or a settlement (every prop the chunks placed, audited against the world: I-10 by the Phoenix ring, the open desert, I-95 by Meridian and its canal, Alligator Alley)', async () => {
    const spots = [I10.at(Math.min(I10.L - 400, (W.ring ? 0 : 0) + I10.L * 0.62)), I10.at(I10.L * 0.85)];
    const I95 = W.corridors.find((c) => c.id === 'I-95'), I75 = W.corridors.find((c) => c.id === 'I-75'), M = W.holdouts?.[0];
    if (I95) { const X9 = I95.exits.find((X) => X.number === 9); spots.push(I95.at((X9?.s ?? 15000) + 1400)); spots.push(I95.at(I95.L * 0.5)); }
    if (I75) spots.push(I75.at(I75.L * 0.4));
    if (M) spots.push({ x: M.cx + (M.hw ?? 100) + 60, z: M.cz });
    const res = [];
    let props = 0, bad = 0;
    for (const p of spots) {
      await C('teleport', { x: p.x + 40, z: p.z + 40 });
      const a = await C('roadscape', { action: 'audit', x: p.x, z: p.z, r: 1 });
      props += a.props ?? 0; bad += a.badCount ?? 1;
      res.push({ at: a.at, props: a.props, bad: a.bad?.slice(0, 3), error: a.error });
    }
    return props > 800 && bad === 0 ? true : JSON.stringify({ props, bad, res: res.filter((q) => q.bad?.length || q.error) });
  });

  await check('roadscape: the real-terrain grading cuts a ditch beside an interstate\'s bed and raises the bed in the desert (and neither at an interchange)', async () => {
    const T = W.terrain;
    if (!T) return true; // ?terrain=flat: no grading to cut
    const R = T.roads[0], cl = R.cl, X = (W.exits ?? []).filter((q) => !q.cor || q.cor === W.i10);
    let n = 0, ditched = 0, bed = 0, bedN = 0, atExit = 0;
    for (let i = 40; i < cl.n - 40; i += 23) {
      const s = cl.s[i]; if (X.some((q) => Math.abs(q.s - s) < 1200) || R.dk[i] < 0.95) continue;
      const nx = -cl.tz[i], nz = cl.tx[i], x = cl.x[i], z = cl.z[i], wf = R.wf[i], dt = ROAD_CLASSES.interstate.ditch;
      const g = (u) => T.groundExact(x + nx * u, z + nz * u), mid = wf + dt.at + dt.width / 2;
      // the ditch's floor against the straight line between the bed's edge and the ditch's far lip
      const lip = (g(wf) + g(wf + dt.at + dt.width + 0.5)) / 2, floor = g(mid);
      n++; if (lip - floor > dt.depth * 0.6) ditched++;
      if (roadBiomeAtOf(W)(x, z) === 'desert') { bedN++; bed += R.bed[i]; }
    }
    for (const q of X) { const i = Math.round(q.s / STREAM.step); if (i > 0 && i < cl.n && R.dk[i] > 0.01) atExit++; }
    const ok = n > 20 && ditched / n > 0.9 && bedN > 10 && bed / bedN > 0.6 && atExit === 0;
    return ok ? true : JSON.stringify({ samples: n, ditched, bedN, bedMean: bedN ? r1(bed / bedN) : null, atExit });
  });
}
