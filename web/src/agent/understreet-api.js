// UNDER THE STREET for agents (docs/design/WEB_UNDERSTREET.md): the `understreet` command, and the selftest's drains
// checks (run inside runSelfTest, agent/api.js, with its check() and command caller; every check returns true or a JSON
// diagnostic).
import { layoutTown } from '../world/citygen/layout.js';
import { ARCHETYPES } from '../data/citygen.js';
import { ITEMS } from '../data/items.js';
import { genLevel, planSite, OPEN, flightHeight } from '../world/undergen.js';
import { drainSite, drainMap, CLS } from '../world/understreet.js';
import { validateUnderstreet, FLOOD, WAYS, SEWER } from '../data/understreet.js';
import { UG } from '../data/underground.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function understreetCommands(api, need) {
  const g = api.g;
  const rowOf = (id) => {
    const S = g.understreet, U = g.under;
    if (id) { const s = U.byId.get(id) ?? U.byId.get(`us_${id}`); need(s?.kind === 'drains', `no drain site "${id}" (understreet lists them)`); return s; }
    if (U.A?.site.kind === 'drains') return U.A.site;
    const p = g.player, s = S.siteFor(p.x, p.z) ?? S.rows().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    need(s, 'no town has drains yet: stand in a town (citygen action=stamp ... teleport=true)');
    return s;
  };
  const wayView = (P, w, r, from) => ({ id: w.id, kind: w.kind, top: w.top, bottom: w.bottom, yTop: w.yTop, open: !WAYS[w.kind].lid || r.open?.includes(w.id), bars: w.bars || undefined, store: w.store, dist: from ? r1(Math.hypot(w.top.x - from.x, w.top.z - from.z)) : undefined });
  return {
    understreet: {
      group: 'world',
      desc: 'The storm drains and sewers under every generated town (docs/design/WEB_UNDERSTREET.md; rows in data/understreet.js, made from the town\'s street plan by world/understreet.js, run by systems/understreet.js as the underground\'s `drains` sites). No args: every town\'s drains (id, town, pipes, ways by kind, outfall to water or a dry wash) and the live one (its water, the flood\'s target, lids open, who is stood up below, rats). action=map [id=] [x= z= r=]: the level as text (# rock . floor ~ the trunk\'s channel = a shaft or ramp + bars M a way\'s foot c box z infected p person ? note g generator), round you or (x, z). action=nearest [kind=manhole|grate|outfall|culvert|breach] [x= z=]: the nearest ways to you (top on the street, foot below, open, bars, the store a breach comes up in). action=flood [set=<m>]: the water now, where it is going and why (rain, storm), the depth where you stand; set= stages the level. action=enter id= way=<id> [level=1]: stand at that way\'s top on the street (level 0) or at its foot below (level 1). action=lid way= open=true|false: lift a lid or drop it (heard as if done by hand). action=proof: every town archetype x 2 seeds laid out, piped and proved (every pipe, chamber and way reached from the outfall\'s foot) and the rows validated.',
      args: { action: { type: 'string', default: 'list', enum: ['list', 'map', 'nearest', 'flood', 'enter', 'lid', 'proof'] }, id: { type: 'string' }, way: { type: 'string' }, kind: { type: 'string' }, level: { type: 'number', default: 0 }, x: { type: 'number' }, z: { type: 'number' }, r: { type: 'number', default: 30 }, set: { type: 'number' }, open: { type: 'boolean', default: true } },
      run: async ({ action, id, way, kind, level, x, z, r, set, open }) => {
        const S = g.understreet, U = g.under, p = g.player;
        if (action === 'list') return { ...S.status(), towns: S.rows().map((s) => { const town = s.town ?? (s.ring ? `ring ${s.ring.join(':')}` : s.id); const k = {}; for (const w of s.net.ways) k[w.kind] = (k[w.kind] ?? 0) + 1; return { id: s.id, town, pipes: s.net.pipes.length, ways: k, outfall: s.net.outfall, dist: r1(Math.hypot(s.x - p.x, s.z - p.z)) }; }) };
        if (action === 'proof') {
          const t0 = performance.now(), bad = [], out = { towns: 0, ways: 0, manholes: 0, pipes: 0 };
          for (const a of Object.keys(ARCHETYPES)) for (const seed of [7, 3301]) {
            const T = layoutTown({ arch: a, seed, x: 60000, z: 60000, id: `pf_${a}_${seed}` }), s = drainSite({ id: `pf_${a}_${seed}`, seed, y: 0 }, T);
            if (!s) { bad.push(`${a}#${seed}: no drains`); continue; }
            const L = genLevel(s, 1); out.towns++; out.ways += L.ways.length; out.pipes += s.net.pipes.length; out.manholes += L.ways.filter((w) => w.kind === 'manhole').length;
            if (!L.proof.ok) bad.push(`${a}#${seed}: ${L.proof.unreached.slice(0, 4).join(',')} sealed ${L.proof.sealed}`);
          }
          // the Phoenix ring: every district's own level proved, and its water reaching an outfall (its own, or through its
          // interceptor grille the next district's, toward the wash)
          const ring = { districts: 0, outfalls: 0, chained: 0, bad: [] };
          if (S.g.streamer?.W?.ring) {
            const rows = new Map(), get = (k, j) => { const key = `${k},${j}`; if (!rows.has(key)) rows.set(key, S.ringRow(k, j)); return rows.get(key); };
            for (let k = -7; k <= 6; k++) for (let j = -7; j <= 6; j++) {
              const s0 = get(k, j); if (!s0) continue;
              ring.districts++;
              const L = genLevel(s0, 1);
              if (!L.proof.ok) { ring.bad.push(`${s0.id}: ${L.proof.unreached.slice(0, 3).join(',')}`); continue; }
              if (s0.net.outfall) { ring.outfalls++; continue; }
              let ck = k, cj = j, ok = false;
              for (let n = 0; n < 16; n++) { const r = get(ck, cj), I = r?.net.intercept; if (!r) break; if (r.net.outfall) { ok = true; break; } ck += I.axis === 'x' ? I.s : 0; cj += I.axis === 'z' ? I.s : 0; }
              if (ok) ring.chained++; else ring.bad.push(`${s0.id}: its interceptor chain reaches no outfall`);
            }
          }
          return { ...out, unproved: bad, ring, rows: validateUnderstreet(undefined, ITEMS), ms: Math.round(performance.now() - t0) };
        }
        const s = rowOf(id), P = planSite(s), rec = S.rec(s);
        if (action === 'map') { const L = genLevel(s, 1), cx = x ?? p.x, cz = z ?? p.z; return { site: s.id, ox: L.ox, oz: L.oz, W: L.W, H: L.H, y: L.y, map: drainMap(L, cx, cz, Math.min(60, r)), legend: '# rock . floor ~ channel = shaft/ramp + bars M a way\'s foot c box z infected p person ? note g generator' }; }
        if (action === 'nearest') { const at = { x: x ?? p.x, z: z ?? p.z }; return { site: s.id, ways: P.ways.filter((w) => !kind || w.kind === kind).map((w) => wayView(P, w, rec, at)).sort((a, b) => a.dist - b.dist).slice(0, 8) }; }
        if (action === 'flood') {
          if (set !== undefined) rec.water = Math.max(0, Math.min(3, set));
          const c = g.sky?.cur ?? {};
          return { site: s.id, water: +rec.water.toFixed(2), target: +S.target().toFixed(2), weather: g.sky?.weatherKey, rain: +(c.rain ?? 0).toFixed(2), storm: +(c.storm ?? 0).toFixed(2), pumping: !!rec.power, here: p.ug === s.id ? { depth: +S.depthAt(p.x, p.z).toFixed(2), state: g.water.stateAt(p.x, p.z, p.gy) } : null, rules: { dry: FLOOD.dry, rain: FLOOD.rain, storm: FLOOD.storm, wade: FLOOD.wade, swim: FLOOD.swim, soffit: UG.wallH - FLOOD.air } };
        }
        if (action === 'enter') {
          const w = P.ways.find((q) => q.id === way) ?? P.ways[0];
          need(w, `no way "${way}"`);
          if (p.inVehicle) g.exitVehicle(true);
          if (Math.hypot(w.top.x - p.x, w.top.z - p.z) > 200) await api.call('teleport', { x: w.top.x, z: w.top.z });
          U.activate(s);
          if (level) { U.promote(1); U.A.wantT.set(1, g.time); p.x = w.bottom.x; p.z = w.bottom.z; p.gy = P.Y[1]; }
          else { p.x = w.top.x; p.z = w.top.z; p.gy = w.yTop; p.ug = null; }
          p.storey = null; g.standOn(p);
          g.camLook.x = p.x; g.camLook.z = p.z; g.camFloor = p.gy; g.updateCamera(0.016);
          return { site: s.id, way: w.id, kind: w.kind, level, x: r1(p.x), z: r1(p.z), gy: r1(p.gy), ug: p.ug ?? null };
        }
        if (action === 'lid') { need(U.A?.site === s, 'this drain site is not live: stand by one of its ways (understreet action=enter)'); return S.lid(way, open !== false, p); }
        return { site: s.id };
      },
    },
  };
}

// ---- the selftest (docs/design/WEB_UNDERSTREET.md §8) ----------------------------------------------------------------
export async function understreetChecks({ api, g, check, C }) {
  const U = g.under, S = g.understreet, p = g.player;
  const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  const setKeys = (dx, dz) => { const want = new Set(); if (dx > 0.15) want.add('KeyD'); if (dx < -0.15) want.add('KeyA'); if (dz > 0.15) want.add('KeyS'); if (dz < -0.15) want.add('KeyW'); for (const q of KEYS) { if (want.has(q)) g.input.down.add(q); else g.input.down.delete(q); } };
  const letGo = () => { for (const q of [...KEYS, 'KeyE']) g.input.down.delete(q); };
  // Walk (held keys) to each point in turn; until(): stop early. Returns true when the last point was reached.
  const walk = async (pts, seconds = 30, until = null) => {
    let i = 0;
    try {
      for (let f = 0; f < seconds * 60 && i < pts.length; f++) {
        const t = pts[i], dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
        if (d < (i === pts.length - 1 ? 0.35 : 0.22)) { i++; continue; } // to each cell centre: a 2 m pipe's corners snag a walker who cuts them
        setKeys(dx / d, dz / d);
        await api._step(1);
        if (until?.()) return true;
      }
    } finally { letGo(); }
    return i >= pts.length;
  };
  // Below: walk the level's own path to (tx, tz), finding it again every 2 s (a person in the way, a corner cut).
  const trace = [];
  const walkBelow = async (tx, tz, seconds = 90) => {
    trace.length = 0;
    for (let k = 0; k < seconds / 2; k++) {
      if (Math.hypot(tx - p.x, tz - p.z) < 0.5) return true;
      const LP = U.A?.levels.get(1), path = LP && U.findPath(LP, p.x, p.z, tx, tz);
      trace.push([r1(p.x), r1(p.z), r1(p.gy), path ? path.length : null]);
      if (!path) return false;
      await walk([...path, { x: tx, z: tz }], 2);
    }
    return Math.hypot(tx - p.x, tz - p.z) < 0.5;
  };
  const bfsFrom = (L, x, z) => { const W = L.W, H = L.H, d = new Int32Array(W * H).fill(-1), Q = new Int32Array(W * H), s0 = Math.floor(z - L.oz) * W + Math.floor(x - L.ox); if (s0 < 0 || s0 >= W * H) return d; d[s0] = 0; let h = 0, t = 0; Q[t++] = s0; while (h < t) { const q = Q[h++], i = q % W; for (const n of [i + 1 < W ? q + 1 : -1, i > 0 ? q - 1 : -1, q + W < W * H ? q + W : -1, q - W]) if (n >= 0 && d[n] < 0 && L.cells[n] === OPEN) { d[n] = d[q] + 1; Q[t++] = n; } } return d; };
  const holdE = async (seconds) => { g.input.down.add('KeyE'); g.input.pressed.add('KeyE'); try { for (let f = 0; f < seconds * 60; f++) await api._step(1); } finally { g.input.down.delete('KeyE'); } await api._step(2); };
  // One stamped town for the live checks (a county seat: a trunk, laterals, alleys, a pump station, stores to breach).
  let town = null;
  const live = async () => {
    staged = true;
    if (!town || !g.citygen.live.has(town.id)) town = await C('citygen', { action: 'stamp', archetype: 'county_seat', seed: 7, teleport: true });
    await api._step(4);
    return U.byId.get(`us_${town.id}`);
  };
  const clear = (r = 60) => { for (const c of [...g.chars]) if (c !== p && !c.npc && c.faction !== 'player' && Math.hypot(c.x - p.x, c.z - p.z) < r) g.removeChar(c); };
  const cellOpen = (L, x, z) => { const i = Math.floor(x - L.ox), j = Math.floor(z - L.oz); return i >= 0 && j >= 0 && i < L.W && j < L.H && L.cells[j * L.W + i] === OPEN; };
  const weatherWas = g.sky?.weatherKey, godWas = !!g.godMode, hourWas = g.sky?.time;
  let staged = false; // a check of ours ran (the teardown below puts back only what one of them changed)

  await check('understreet: the rows validate - pipes whole metres with a trunk channel between benches, a manhole shaft within 3 m of run, a storm that fills the trunk to the soffit (a flood can trap you), rain knee deep, a cut slower and quieter than a pry, every loot row a real item, no purple', async () => {
    const v = validateUnderstreet(undefined, ITEMS);
    return v.ok && v.counts.pipes >= 5 && v.counts.ways >= 5 ? true : JSON.stringify(v);
  });

  await check('understreet: every town has a connected drain network reaching an outfall - every town archetype x 2 seeds laid out and piped: a trunk under its main street, laterals under the rest, drains down its alleys, an outfall (its ramp to the bank or the wash), a culvert under the road; from the outfall\'s foot the flood reaches every pipe, chamber and way, and nothing is cut off; and every district of the Phoenix ring is proved the same way, its water reaching an outfall (its own into the river, the old wash or the desert past the edge, or the next district\'s through its interceptor grille)', async () => {
    const r = await C('understreet', { action: 'proof' });
    return r.ok !== false && !r.unproved.length && r.rows.ok && r.towns >= 50 && r.manholes > 500 && r.ring.districts >= 40 && !r.ring.bad.length && r.ring.outfalls >= 10 ? true : JSON.stringify({ unproved: r.unproved?.slice(0, 6), rows: r.rows?.bad?.slice(0, 6), towns: r.towns, manholes: r.manholes, ring: { ...r.ring, bad: r.ring?.bad?.slice(0, 6) } });
  });

  await check('understreet: every manhole connects to the network - in 10 archetypes x 2 seeds every manhole\'s lid is on a street or an alley (never in a building or a yard), its shaft lands on the level beside a pipe, and its foot is joined to the outfall', async () => {
    const bad = []; let n = 0;
    for (const a of ['county_seat', 'sonoran_sprawl', 'adobe_pueblo', 'rustbelt_mill', 'gulf_stilt_town', 'dead_suburb', 'appalachian_hollow', 'port_wharf', 'interstate_exit', 'swamp_ferry']) for (const seed of [11, 902]) {
      const T = layoutTown({ arch: a, seed, x: 70000, z: 70000, id: `mh_${a}` }), s = drainSite({ id: `mh_${a}_${seed}`, seed, y: 0 }, T), L = genLevel(s, 1);
      const onSurface = (x, z) => T.roads.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) || T.alleys.some((A) => x > A.x0 && x < A.x1 && z > A.z0 && z < A.z1);
      const inBuilding = (x, z) => T.buildings.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
      for (const w of L.ways) {
        if (w.kind !== 'manhole') continue;
        n++;
        const i = Math.floor(w.bottom.x - L.ox), j = Math.floor(w.bottom.z - L.oz), q = j * L.W + i;
        if (!onSurface(w.top.x, w.top.z) || inBuilding(w.top.x, w.top.z)) bad.push(`${a}#${seed} ${w.id}: lid at ${w.top.x},${w.top.z} off the street`);
        else if (L.cells[q] !== OPEN || L.dist[q] < 0) bad.push(`${a}#${seed} ${w.id}: foot not on the network`);
      }
    }
    return !bad.length && n > 200 ? true : JSON.stringify({ manholes: n, bad: bad.slice(0, 6), more: bad.length });
  });

  await check('understreet: a player walks street -> manhole -> tunnel -> a store\'s cellar -> inside the locked store without opening its doors - on held keys: lift the lid (hold E), climb down the shaft (below the street: ug, the view goes below), along the pipes on the level\'s own path to the breach\'s cellar, up through the floor, and stand inside the store with every one of its doors still locked and shut', async () => {
    const s = await live();
    if (!s) return 'no drains on the stamped town';
    await C('god', { on: true });
    const P = planSite(s), L = genLevel(s, 1);
    const breach = P.ways.find((w) => w.kind === 'breach');
    if (!breach) return 'no breach in the county seat';
    // the nearest manhole to the breach by the level's own walk (the flow field's steps are a good guess: pick the nearest by straight line, then path)
    const mhs = P.ways.filter((w) => w.kind === 'manhole').sort((a, b) => Math.hypot(a.bottom.x - breach.bottom.x, a.bottom.z - breach.bottom.z) - Math.hypot(b.bottom.x - breach.bottom.x, b.bottom.z - breach.bottom.z));
    const M = mhs[0];
    const rec = S.rec(s); rec.open = rec.open.filter((id) => id !== M.id);
    // the store: every door of it locked and shut (its openings are hung from the interiors pool near you)
    await C('understreet', { action: 'enter', id: s.id, way: breach.id, level: 0 });
    clear();
    const R = g.citygen.buildingAt(breach.top.x, breach.top.z);
    if (!R) return `no building at the breach's top ${breach.top.x},${breach.top.z}`;
    p.x = (R.B.x0 + R.B.x1) / 2 + (R.B.front === 'E' ? 14 : R.B.front === 'W' ? -14 : 0); p.z = (R.B.z0 + R.B.z1) / 2 + (R.B.front === 'S' ? 14 : R.B.front === 'N' ? -14 : 0); g.standOn(p);
    for (let i = 0; i < 40 && !R.open; i++) { g.citygen.openings(p.x, p.z); await api._step(5); } // its doors are hung (the battery may have settlements' own scan off)
    const doors = g.interiors.doors.filter((d) => d.x > R.B.x0 - 0.6 && d.x < R.B.x1 + 0.6 && d.z > R.B.z0 - 0.6 && d.z < R.B.z1 + 0.6 && !d.ug);
    for (const d of doors) { d.locked = true; d.lockHp = d.mat?.lockHp ?? 70; d.kicks = d.mat?.kicks ?? 2; for (const Lf of d.leaves) { Lf.th = 0; Lf.w = 0; g.interiors.orient(Lf); } }
    const tw = g.citygen.live.get(R.rec?.id); for (const b of tw?.built.bays ?? []) if (b.b === R.B.id) g.citygen.setBay(tw, b, false, true); // its roll-ups down and locked
    const before = doors.map((d) => ({ id: d.id, locked: d.locked, th: d.leaves.map((Lf) => +Lf.th.toFixed(2)) }));
    // 1. the lid: stand at its top, hold E
    p.x = M.top.x; p.z = M.top.z; p.gy = M.yTop; g.standOn(p);
    const f = P.flights.find((q) => q.id === M.flight);
    await holdE(WAYS.manhole.hand + 0.6);
    const lifted = rec.open.includes(M.id);
    // 2. down the shaft on held keys
    let wentUg = false;
    const down = await walk([f.topEdge, f.bottomEdge, f.bottom], 20, () => { if (p.ug) wentUg = true; return false; });
    await api._step(10);
    const atFoot = { ug: p.ug, gy: r1(p.gy), view: U.wasUnder, k: U.levelOf(p.gy) };
    // 3. along the pipes: the level's own A* to the breach's foot
    const along = await walkBelow(breach.bottom.x, breach.bottom.z, 120), path = { length: along ? 1 : 0 };
    // 4. up through the floor into the store
    const bf = P.flights.find((q) => q.id === breach.flight), inside = { x: breach.top.x + (bf.axis === 'x' ? -bf.u * 1.2 : 0), z: breach.top.z + (bf.axis === 'z' ? -bf.u * 1.2 : 0) };
    const up = await walk([bf.bottomEdge, bf.topEdge, breach.top, inside], 20);
    await api._step(10);
    const inStore = p.x > R.B.x0 && p.x < R.B.x1 && p.z > R.B.z0 && p.z < R.B.z1 && !p.ug && Math.abs(p.gy - breach.yTop) < 0.3;
    const after = doors.map((d) => ({ id: d.id, locked: d.locked, th: d.leaves.map((Lf) => +Lf.th.toFixed(2)) }));
    const untouched = doors.length > 0 && after.every((d, i) => d.locked && d.th.every((t, k) => Math.abs(t - before[i].th[k]) < 0.05));
    const ok = lifted && down && wentUg && atFoot.ug === s.id && atFoot.k === 1 && atFoot.view && along && inStore && untouched; // up: the last step past the stair's top may meet the store's own counter; inside is what counts
    return ok ? true : JSON.stringify({ lifted, down, wentUg, atFoot, trace: trace.slice(0, 12), along, up, inStore, at: [r1(p.x), r1(p.z), r1(p.gy)], store: R.B.id, doors: doors.length, untouched, after: after.slice(0, 3) });
  });

  await check('understreet: noise underground carries further along a pipe than through ground - a 30 m shot in the trunk turns an infected 45 m down the same pipe toward it (past the 30 m it carries in the open: a pipe is a speaking tube), not one 60 m down it, and not one on the street right over it (the ground between: only an open shaft lets it up)', async () => {
    const s = await live();
    const P = planSite(s), L = genLevel(s, 1), main = s.net.pipes.find((q) => q.cls === 'trunk');
    U.activate(s); U.promote(1); U.A.wantT.set(1, g.time);
    const pt = (a) => (main.axis === 'x' ? { x: a + 0.5, z: main.at + 0.5 } : { x: main.at + 0.5, z: a + 0.5 });
    // a source on the trunk's channel with 60 m of straight channel after it (no chamber, no crossing in between)
    const straight = (a, n) => { for (let k = 0; k <= n; k++) { const c = pt(a + k), q = Math.floor(c.z - L.oz) * L.W + Math.floor(c.x - L.ox); if (L.cells[q] !== OPEN || L.cls[q] !== CLS.channel) return false; } return true; };
    let a0 = null; for (let a = main.a0 + 6; a < main.a1 - 64 && a0 === null; a++) if (straight(a, 62)) a0 = a;
    if (a0 === null) return 'no 60 m straight run of trunk';
    const src = pt(a0), far = pt(a0 + 45), past = pt(a0 + 60);
    p.x = src.x; p.z = src.z + 0.9; p.gy = P.Y[1]; p.storey = null; g.standOn(p); // you, below, at the shot
    clear(90);
    const mk = (at, below) => { const c = g.zombies.spawn(at.x, at.z, false); c.gy = below ? P.Y[1] : P.Y[0]; g.standOn(c); c.wx = c.x; c.wz = c.z; c.timer = 99; c.ztarget = null; return c; };
    const A = mk(far, true), B = mk(past, true), Cst = mk({ x: src.x + 1, z: src.z + 1 }, false);
    await api._step(2);
    const w0 = [A, B, Cst].map((c) => ({ wx: c.wx, wz: c.wz, m: c.zm?.t ?? null }));
    U.noise(src.x, src.z, 30, p); // a shot below
    const heard = (c, i) => Math.hypot(c.wx - src.x, c.wz - src.z) < 4 && (c.wx !== w0[i].wx || c.wz !== w0[i].wz);
    const out = { at45: heard(A, 0), at60: heard(B, 1), street: heard(Cst, 2) || (Cst.zm?.t ?? null) !== w0[2].m, ug: [A.ug, B.ug, Cst.ug ?? null], carry: L.carry, reach: r1(30 / L.carry) };
    for (const c of [A, B, Cst]) if (g.chars.includes(c)) g.removeChar(c);
    return out.at45 && !out.at60 && !out.street && A.ug && !Cst.ug ? true : JSON.stringify(out);
  });

  await check('understreet: rain raises the water in the trunk - dry, a rain brings the trunk\'s channel up past wading depth (you wade), an acid storm takes it over swimming depth toward the soffit (you swim; the current carries you toward the outfall), and it falls again when the sky clears', async () => {
    const s = await live(), P = planSite(s), main = s.net.pipes.find((q) => q.cls === 'trunk'), rec = S.rec(s);
    const L = genLevel(s, 1), at = main.axis === 'x' ? { x: (main.a0 + main.a1) / 2 + 0.5, z: main.at + 0.5 } : { x: main.at + 0.5, z: (main.a0 + main.a1) / 2 + 0.5 };
    U.activate(s); U.promote(1); U.A.wantT.set(1, g.time);
    p.x = at.x; p.z = at.z; p.gy = P.Y[1]; p.storey = null; g.standOn(p); clear();
    await C('setWeather', { key: 'CLEAR', instant: true }); rec.water = FLOOD.dry; await api._step(10);
    const dry = { w: +rec.water.toFixed(2), state: g.water.stateAt(p.x, p.z, p.gy) };
    await C('setWeather', { key: 'RAIN', instant: true });
    for (let i = 0; i < 40 && rec.water < FLOOD.rain - 0.03; i++) await C('step', { seconds: 1 });
    const rain = { w: +rec.water.toFixed(2), state: g.water.stateAt(p.x, p.z, p.gy) };
    await C('setWeather', { key: 'STORM', instant: true });
    for (let i = 0; i < 90 && rec.water < FLOOD.swim + 0.2; i++) await C('step', { seconds: 1 });
    const x0 = p.x, z0 = p.z;
    await C('step', { seconds: 2 });
    const storm = { w: +rec.water.toFixed(2), state: g.water.stateAt(p.x, p.z, p.gy), carried: r1(Math.hypot(p.x - x0, p.z - z0)) };
    await C('setWeather', { key: 'CLEAR', instant: true });
    const top = rec.water; for (let i = 0; i < 20; i++) await C('step', { seconds: 1 });
    const clearing = +rec.water.toFixed(2);
    rec.water = FLOOD.dry;
    const ok = dry.state === 'dry' && rain.w > dry.w + 0.25 && rain.state === 'wade' && storm.w >= FLOOD.swim && storm.state === 'swim' && storm.carried > 0.5 && clearing < top - 0.05 && cellOpen(L, at.x, at.z);
    return ok ? true : JSON.stringify({ dry, rain, storm, clearing, top: +top.toFixed(2) });
  });

  await check('understreet: an infected follows a sound down a manhole - a shambler on the street by an open manhole hears a shot below come up the shaft, walks to it, climbs down the shaft (below the street: ug) and on along the pipe toward where the shot was', async () => {
    const s = await live(), P = planSite(s), rec = S.rec(s);
    await C('god', { on: true });
    const M = P.ways.find((w) => w.kind === 'manhole' && genLevel(s, 1).cls[Math.floor(w.bottom.z - genLevel(s, 1).oz) * genLevel(s, 1).W + Math.floor(w.bottom.x - genLevel(s, 1).ox)] !== CLS.junction);
    await C('understreet', { action: 'enter', id: s.id, way: M.id, level: 1 });
    if (!rec.open.includes(M.id)) S.lid(M.id, true, null);
    const L = U.A.levels.get(1).L;
    // you, 12 m along the pipe from the shaft's foot
    let spot = null;
    { const d = bfsFrom(L, M.bottom.x, M.bottom.z); for (let q = 0; q < d.length && !spot; q++) if (d[q] >= 11 && d[q] <= 14 && L.cls[q] !== CLS.stub) spot = { x: L.ox + (q % L.W) + 0.5, z: L.oz + Math.floor(q / L.W) + 0.5 }; }
    if (!spot) return 'no spot in the pipe near the manhole';
    p.x = spot.x; p.z = spot.z; p.gy = P.Y[1]; g.standOn(p);
    clear(40);
    await api._step(5);
    const side = M.top, z = g.zombies.spawn(side.x + 7, side.z + 3, false);
    z.gy = P.Y[0]; g.standOn(z); z.ztarget = null; z.wx = z.x; z.wz = z.z; z.timer = 99;
    await api._step(2);
    let wentDown = false, closest = Infinity;
    for (let k = 0; k < 6 && !wentDown; k++) {
      g.noise(p.x, p.z, 50, p); // a shot below, every few seconds
      for (let f = 0; f < 240; f++) { await api._step(1); if (z.ug === s.id) { wentDown = true; break; } }
    }
    for (let f = 0; f < 300 && wentDown; f++) { await api._step(1); closest = Math.min(closest, Math.hypot(z.x - p.x, z.z - p.z)); }
    const out = { wentDown, ug: z.ug, gy: r1(z.gy), at: [r1(z.x), r1(z.z)], you: [r1(p.x), r1(p.z)], closest: r1(closest), followed: S.counts.followedDown, alive: z.alive };
    if (g.chars.includes(z)) g.removeChar(z);
    return wentDown && z.alive && closest < 9 ? true : JSON.stringify(out);
  });

  await check('understreet: a horde can come up a manhole - four of the dead below by an open manhole\'s foot hear a shot on the street come down the shaft and climb up it into the street', async () => {
    const s = await live(), P = planSite(s), rec = S.rec(s);
    const M = P.ways.filter((w) => w.kind === 'manhole')[3] ?? P.ways.find((w) => w.kind === 'manhole');
    await C('understreet', { action: 'enter', id: s.id, way: M.id, level: 0 });
    if (!rec.open.includes(M.id)) S.lid(M.id, true, null);
    U.promote(1); U.A.wantT.set(1, g.time);
    const L = U.A.levels.get(1).L, y1 = P.Y[1];
    clear(50);
    const dead = [];
    { const d = bfsFrom(L, M.bottom.x, M.bottom.z); for (let q = 0; q < d.length && dead.length < 4; q++) if (d[q] >= 2 && d[q] <= 5 && (q % 3 === 0)) { const c = g.zombies.spawn(L.ox + (q % L.W) + 0.5, L.oz + Math.floor(q / L.W) + 0.5, false); c.gy = y1; g.standOn(c); c.wx = c.x; c.wz = c.z; c.timer = 99; dead.push(c); } }
    if (dead.length < 2) { for (const c of dead) g.removeChar(c); return 'no room at the foot'; }
    p.x = M.top.x + 6; p.z = M.top.z; p.gy = M.yTop; g.standOn(p);
    let up = 0;
    for (let k = 0; k < 5 && up < 1; k++) {
      g.noise(p.x, p.z, 60, p);
      for (let f = 0; f < 200; f++) { await api._step(1); up = dead.filter((c) => c.alive && !c.ug && c.gy > y1 + 3).length; if (up) break; }
    }
    const out = { up, below: dead.filter((c) => c.ug).length, at: dead.map((c) => [r1(c.x), r1(c.z), r1(c.gy)]) };
    for (const c of dead) if (g.chars.includes(c)) g.removeChar(c);
    return up >= 1 ? true : JSON.stringify(out);
  });

  await check('understreet: daylight falls through the grates - under a kerb grate the light pool is lit at noon and dark at midnight; the drains draw under 150 calls', async () => {
    const s = await live(), P = planSite(s);
    const L = genLevel(s, 1), G = L.grates[0];
    if (!G) return 'no grates';
    U.activate(s); U.promote(1); U.A.wantT.set(1, g.time);
    p.x = G.fx; p.z = G.fz + 1; p.gy = P.Y[1]; p.storey = null; g.standOn(p); clear();
    await C('setTime', { hour: 12 }); await api._step(30);
    const noon = S.below?.day ?? -1;
    g.render?.(); const calls = g.renderer.info.render.calls;
    await C('setTime', { hour: 0 }); await api._step(30);
    const night = S.below?.day ?? -1;
    await C('setTime', { hour: 12 });
    return noon > 0.4 && night < 0.15 && calls < 150 ? true : JSON.stringify({ noon, night, calls });
  });

  // put back what our checks changed (nothing, when none of them ran: `only=` batteries): the street, the town, the
  // weather, the hour, god as it was
  if (!staged) return;
  g.flashOverride = undefined; letGo();
  if (U.A?.site.kind === 'drains') { p.gy = U.A.plan.Y[0]; p.ug = null; U.deactivate(); }
  if (town) { await C('citygen', { action: 'remove', id: town.id }); town = null; }
  await C('teleport', { x: 0, z: -40 }); await api._step(3);
  if (weatherWas) await C('setWeather', { key: weatherWas, instant: true });
  if (hourWas !== undefined) await C('setTime', { hour: hourWas });
  await C('god', { on: godWas });
  void SEWER; void flightHeight;
}
