// DEATH RITES as COMMANDS rows (docs/design/WEB_DEATH_RITES.md; systems/rites.js, data/rites.js). buildCommands() in
// api.js spreads these into COMMANDS (help, the CLI, the MCP tools and docs/COMMANDS.md see them); ritesChecks is the
// selftest share. Every verb is honest by default: you must stand within reach of the body, the grave or the funeral
// (force=true only in tests).
import { DECAY, FORMULA, CEMETERY_KINDS, CEM_LAYOUT, LOOT_LAW, FUNERAL, BURIAL, RITES_ROWS, validateRites } from '../data/rites.js';
import { cemeteryInputs, graveCount } from '../systems/rites.js';
import { C as CHUNK } from '../world/geo.js';

const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const ACTIONS = ['summary', 'bodies', 'graves', 'cemetery', 'funeral', 'report', 'drag', 'drop', 'dig', 'bury', 'burn', 'mark', 'wait', 'law', 'validate'];

// Move the real game clock on by `hours` (6 h hops with a short step between, so the day rolls the way the world sees it:
// society.day, the sky, everything on the clock).
export async function waitHours(api, hours) {
  const g = api.g;
  let left = hours;
  while (left > 1e-6) {
    const h = Math.min(6, left);
    g.sky.time = (g.sky.time + h) % 24;
    await api._step(3);
    left -= h;
  }
  return { day: g.society?.day ?? 0, hour: r1(g.sky.time) };
}

export function ritesCommands(api, need) {
  const g = api.g, P = () => g.player, RT = () => g.rites;
  const body = (id) => {
    const R = id ? RT().bodies.get(id) ?? [...RT().bodies.values()].find((b) => b.box === id || b.name?.toLowerCase() === String(id).toLowerCase()) : RT().bodyNear(P().x, P().z, 6);
    need(R, id ? `no body ${id}; rites action=bodies lists them` : 'no body within 6 m (rites action=bodies)');
    return R;
  };
  const reach = (x, z, r, force, what) => need(force || Math.hypot(x - P().x, z - P().z) <= r, `${what} is ${r1(Math.hypot(x - P().x, z - P().z))} m away (within ${r} m: moveTo first)`);
  return {
    rites: {
      group: 'world',
      desc: 'DEATH RITES (docs/design/WEB_DEATH_RITES.md, rows in data/rites.js). action=summary (default): bodies by stage, folded, cemeteries by kind, graves dug, funerals. '
        + 'bodies [r=] [id=]: the dead near you (stage fresh|bloated|rotting|bones, decay hours, folded record or character, wet, what is on them). '
        + 'graves [cem=]: graves dug since the world began (cem=: that cemetery\'s history rows, oldest first). cemetery [id=|near=true|all=true]: one cemetery (size by the formula, kind, where, history), the nearest, or every planned place checked against the formula. '
        + 'funeral [id=] [do=attend|stone]: funerals (scheduled, under way, done; mourners and who arrived); do=stone pays the stonecutter. '
        + 'report id=: tell the dead\'s family (you must stand within 4 m of one of them): law 6, they know only what they were told - a death nobody reported gets no funeral. '
        + 'drag id= / drop: drag a body (within 2.2 m); dig [x z]: dig a grave (a shovel: 18 s, hands x3; loud); bury id=: into the open grave within reach (digs first if none); burn id=: a fuel can\'s worth; mark grave= kind=stone|cross. '
        + 'wait hours=: run the game clock on (the dead age by the air of each hour). law: every refill path and its state under the no-regeneration law, and deliveries waiting. validate: validateRites over the rows.',
      args: { action: { type: 'string', enum: ACTIONS, default: 'summary' }, id: { type: 'string' }, r: { type: 'number', default: 120 }, cem: { type: 'string' }, near: { type: 'boolean' }, all: { type: 'boolean' },
        do: { type: 'string', enum: ['attend', 'stone'] }, x: { type: 'number' }, z: { type: 'number' }, grave: { type: 'string' }, kind: { type: 'string', enum: ['stone', 'cross', 'mound'] }, hours: { type: 'number' }, force: { type: 'boolean', default: false }, seconds: { type: 'number', default: 0 } },
      run: async (a) => {
        const S = RT(), p = P();
        need(S, 'no rites system');
        switch (a.action) {
          case 'summary': return S.summary();
          case 'validate': return validateRites(RITES_ROWS);
          case 'law': return { rows: LOOT_LAW, deliveries: S.deliveries, trade: 'systems/trade.js: restock and keep take only deliveries (TRADE.law)' };
          case 'wait': need(a.hours > 0 && a.hours <= 24 * 30, 'hours= 0..720'); { const t = await waitHours(api, a.hours); return { ...t, summary: S.summary() }; }
          case 'bodies': {
            if (a.id) return S.bodyView(body(a.id));
            const out = [];
            for (const R of S.bodies.values()) { const v = S.bodyView(R); if (v.d <= a.r) out.push(v); }
            return { n: out.length, total: S.bodies.size, bodies: out.sort((x, y) => x.d - y.d).slice(0, 60) };
          }
          case 'graves': {
            if (a.cem) { const cem = S.cems.get(a.cem) ?? S.cems.get(`cem:${a.cem}`); need(cem, `no cemetery ${a.cem}`); return { cem: S.cemView(cem), history: S.gravesOf(cem).slice(0, 80), added: cem.added }; }
            return { n: S.graves.length, graves: S.graves.slice(-60) };
          }
          case 'cemetery': {
            if (a.all) {
              S.plan();
              const bad = [], kinds = {}; let n = 0;
              for (const rec of g.citygen?.plan ?? []) {
                const cem = S.cemFor(rec), I = cemeteryInputs(rec); n++;
                kinds[cem.kind] = (kinds[cem.kind] ?? 0) + 1;
                if (cem.count !== I.graves || cem.count !== graveCount(cem.pop, cem.years, cem.danger) || cem.count < FORMULA.min) bad.push(`${rec.id} ${cem.count} vs ${I.graves}`);
              }
              return { places: n, cemeteries: S.cems.size, kinds, bad: bad.slice(0, 20) };
            }
            let cem = a.id ? S.cems.get(a.id) ?? S.cems.get(`cem:${a.id}`) : null;
            if (!cem && a.id) { const rec = g.citygen?.byId?.get(a.id); if (rec) cem = S.cemFor(rec); }
            if (!cem) cem = S.cemAt(a.x ?? p.x, a.z ?? p.z);
            need(cem, 'no cemetery');
            return S.cemView(cem, true);
          }
          case 'funeral': {
            if (!a.id) return { funerals: S.funerals, rules: FUNERAL };
            const F = S.funerals.find((q) => q.id === a.id || q.id === `funeral:${a.id}`);
            need(F, `no funeral ${a.id}`);
            if (a.do === 'stone') { const at = S.funeralSpot(F); if (at) reach(at.x, at.z, FUNERAL.attendR, a.force, 'the funeral'); const r = S.payStone(F); need(r.ok, r.why); return { ...r, funeral: F }; }
            return { funeral: F, spot: S.funeralSpot(F) };
          }
          case 'report': {
            const R = body(a.id);
            need(R.news, `${R.name} has no family waiting on word`);
            const rec = g.residents?.recs.get(R.news.house);
            const near = rec?.members.find((m) => !m.dead && m.c?.alive && Math.hypot(m.c.x - p.x, m.c.z - p.z) <= 4);
            need(a.force || near, `stand with one of ${rec?.ownerName ?? 'the family'} first (within 4 m)`);
            const r = S.tell(R, 'player'); need(r.ok, r.why);
            return { ...r, told: near?.name ?? null, facts: R.news.facts };
          }
          case 'drag': { const R = body(a.id); const bx = R.c ? R.c.x : R.x, bz = R.c ? R.c.z : R.z; reach(bx, bz, 2.2, a.force, 'the body'); if (a.force && !R.c) { p.x = bx + 0.8; p.z = bz; } const r = S.startDrag(R, p); need(r.ok, r.why); return r; }
          case 'drop': need(S.drag, 'you are not dragging anyone'); S.stopDrag(); return { ok: true };
          case 'dig': {
            const x = a.x ?? p.x + Math.sin(p.face) * 1.5, z = a.z ?? p.z + Math.cos(p.face) * 1.5;
            reach(x, z, BURIAL.reach, a.force, 'that spot');
            const r = S.startDig(x, z, p); need(r.ok, r.why);
            if (a.seconds > 0) await api._step(Math.round(a.seconds * 60));
            return { ...r, digging: !!S.dig, holes: S.holes.slice(-3) };
          }
          case 'bury': {
            const R = body(a.id); const bx = R.c ? R.c.x : R.x, bz = R.c ? R.c.z : R.z; reach(bx, bz, BURIAL.reach + 1, a.force, 'the body');
            const r = S.bury(R, p);
            need(r.ok, r.why);
            if (S.dig && a.seconds > 0) await api._step(Math.round(a.seconds * 60));
            return { ...r, digging: !!S.dig, buried: R.buried ?? null };
          }
          case 'burn': { const R = body(a.id); const bx = R.c ? R.c.x : R.x, bz = R.c ? R.c.z : R.z; reach(bx, bz, BURIAL.reach, a.force, 'the body'); const r = S.burn(R, p); need(r.ok, r.why); if (a.seconds > 0) await api._step(Math.round(a.seconds * 60)); return { ...r, burned: !!R.burned }; }
          case 'mark': { const gr = S.graves.find((q) => q.id === a.grave); need(gr, `no grave ${a.grave}`); reach(gr.x, gr.z, BURIAL.reach, a.force, 'the grave'); return S.mark(gr, a.kind ?? 'cross'); }
        }
        return { ok: false };
      },
    },
  };
}

// ---- selftest -----------------------------------------------------------------------------------------------------------
export async function ritesChecks(api, check, C) {
  const g = api.g, S = g.rites, P = () => g.player;
  if (!S) { await check('rites: the death rites system is live', async () => 'no g.rites'); return; }
  const quiet = () => { const was = { z: g.zombies.enabled, r: g.raiderTimer, conv: g.convoy.next, air: g.survival.airAt }; g.zombies.enabled = false; g.raiderTimer = 1e9; g.convoy.despawn?.(); g.convoy.next = 1e9; return () => { g.zombies.enabled = was.z; g.raiderTimer = was.r; g.convoy.next = was.conv; g.survival.airAt = was.air; }; };
  const home = async (x = 30, z = -150) => { if (g.dialogue?.active) g.dialogue.close(); if (g.invUI?.open) g.invUI.toggle(false); const v = P().inVehicle; if (v) g.exitVehicle(true); if (S.drag) S.stopDrag(); S.dig = null; await C('teleport', { x, z }); };
  // a dead body here: a drifter with a pistol, killed (the real kill path: main.onKill, the body box, the record)
  const dead = (x, z, name = 'Test Dead') => {
    const c = g.addChar({ x, z, faction: 'drifter', weapon: 'pistol', hp: 40, name, flag: 'MX' });
    if (!c) return null;
    c.ritesTest = true;
    g.combat.kill(c, null, 0, 1, 'bullet');
    return S.bodies.get(c.id) ?? null;
  };
  const clean = () => { for (const c of [...g.chars]) if (c.ritesTest) g.removeChar(c); for (const [id, R] of S.bodies) if (R.test) S.bodies.delete(id); };
  const hour0 = g.sky.time;
  const restore = quiet();
  try {
    await check('rites: the rows are valid (validateRites: four stages in order, heat > 1 > cold, every cemetery kind laid out, funerals 1-2 days, the loot-law audit) and the formula works the example (THE SILVER STRIP: pop 85 x 80 yrs x 0.02 x 1.4 = 191)', async () => {
      const v = validateRites(RITES_ROWS);
      const ex = graveCount(85, 80, 0.4), min = graveCount(1, 1, 0);
      return v.ok && ex === 191 && min === FORMULA.min ? true : JSON.stringify({ v, ex, min });
    });

    await check('rites: a body ages through all 4 stages on the game clock (fresh -> bloated -> rotting -> bones) and lies where it fell with its loot', async () => {
      await home(30, -150);
      const R = dead(P().x + 6, P().z); if (!R) return 'no slot for a body';
      R.test = true;
      const box = g.inventory.boxes.get(R.box); if (!box) return 'no body box';
      g.inventory.open(box); const items0 = box.slots.map((s) => `${s.id}x${s.n}`).join(); g.inventory.opened = null;
      g.survival.airAt = () => 20; // a mild day: the clock alone
      const seen = [DECAY.stages[R.stage].id];
      for (let h = 0; h < 260; h += 6) { await waitHours(api, 6); const st = DECAY.stages[R.stage].id; if (seen.at(-1) !== st) seen.push(st); }
      const b2 = g.inventory.boxes.get(R.box), items1 = b2 ? b2.slots.map((s) => `${s.id}x${s.n}`).join() : null;
      const still = S.bodies.has(R.id) && Math.hypot(R.x - (P().x + 6), R.z - P().z) < 1.5;
      return seen.join() === 'fresh,bloated,rotting,bones' && items0 === items1 && still && !R.c ? true : JSON.stringify({ seen, items0, items1, still, c: !!R.c, decay: R.decay });
    });

    await check('rites: heat ages a body faster than cold (the same 12 game hours at 35 C and at 0 C: x1.5 against x0.5) and water on top (x1.3)', async () => {
      await home(30, -150);
      const a = dead(P().x + 5, P().z - 3, 'Hot Dead'), b = dead(P().x + 5, P().z + 3, 'Cold Dead'); if (!a || !b) return 'no slots';
      a.test = b.test = true;
      g.survival.airAt = () => 35; const a0 = a.decay; await waitHours(api, 12); const hot = a.decay - a0;
      g.survival.airAt = () => 0; const b0 = b.decay; await waitHours(api, 12); const cold = b.decay - b0;
      g.survival.airAt = () => 20; a.mul = undefined;
      const wet = S.climate(12) * 1 * DECAY.water;
      return hot > cold * 2.5 && Math.abs(hot - 18) < 1.5 && Math.abs(cold - 6) < 1 && wet > 1 ? true : JSON.stringify({ hot, cold, wet });
    });

    await check('rites: a far body survives a 2 km trip and is still there with its loot when you come back (folded to a record, drawn by the rites mesh, its box untouched)', async () => {
      await home(-40, -150);
      const x0 = P().x + 6, z0 = P().z;
      const R = dead(x0, z0, 'Far Dead'); if (!R) return 'no slot';
      R.test = true;
      const box = g.inventory.boxes.get(R.box); g.inventory.open(box); g.inventory.opened = null;
      const items0 = box.slots.map((s) => `${s.id}x${s.n}`).join();
      // out 2 km in 400 m legs (the streamed world pages under you), 100 s out there (past the 90 s fold), and back
      for (let k = 1; k <= 5; k++) { await C('teleport', { x: x0 + k * 400, z: z0 }); await api._step(30); }
      await api._step(100 * 60);
      const folded = !R.c && !g.chars.some((c) => c.riteId === R.id);
      for (let k = 4; k >= 0; k--) { await C('teleport', { x: x0 + k * 400 + (k ? 0 : -6), z: z0 }); await api._step(30); }
      await api._step(90);
      const b2 = g.inventory.boxes.get(R.box), items1 = b2 ? b2.slots.map((s) => `${s.id}x${s.n}`).join() : null;
      S.draw(P().x, P().z);
      const there = S.bodies.has(R.id) && Math.hypot(R.x - x0, R.z - z0) < 1.5, drawn = (S.drawnBodies ?? 0) > 0;
      return folded && there && items0 === items1 && items0.length > 0 && drawn ? true : JSON.stringify({ folded, there, items0, items1, drawn });
    });

    await check('rites: every planned settlement and site has a cemetery whose size matches the formula (towns at the edge, sites on site, battle sites a mass grave, bunkers a crypt, rural family plots, bases war graves) and its history has that many graves', async () => {
      S.plan();
      const bad = [], kinds = {};
      let sites = 0;
      for (const rec of g.citygen.plan) {
        const cem = S.cemFor(rec), I = cemeteryInputs(rec);
        kinds[cem.kind] = (kinds[cem.kind] ?? 0) + 1;
        if (rec.kind === 'site') sites++;
        const want = rec.kind === 'town' ? ['town_cemetery', 'boot_hill'] : rec.kind === 'rural' ? ['family_plot'] : rec.kind === 'base' ? ['war_graves'] : I.battle ? ['mass_grave', 'crypt'] : ['site_plot', 'crypt'];
        if (cem.count !== graveCount(I.pop, I.years, I.danger) || cem.count < FORMULA.min || !want.includes(cem.kind) || (rec.stamp === 'bunker' && cem.kind !== 'crypt')) bad.push(`${rec.id}:${cem.kind}:${cem.count}`);
        if (bad.length > 8) break;
      }
      const rows = g.citygen.siteRows().filter((r) => r.status === 'planned' || r.status === 'beyond');
      const missing = rows.filter((r) => !S.cems.has(`cem:${r.rec}`)).map((r) => r.id);
      // spot-check the history of a few: as many graves as the formula says, names, years in range, causes
      const hist = [...S.cems.values()].filter((c) => !c.ring).slice(0, 12).filter((c) => { const G = S.gravesOf(c); return G.length !== c.count || G.some((r) => !r.name || !r.cause || r.died > 100 || r.died < 100 - c.years - 1); }).map((c) => c.id);
      return !bad.length && !missing.length && !hist.length && sites >= 200 && kinds.mass_grave && kinds.crypt && kinds.family_plot ? true : JSON.stringify({ bad, missing: missing.slice(0, 8), hist, sites, kinds });
    });

    await check('rites: a town cemetery is laid out like one and keeps the wild off it - inside its keep-out ring no rock, scrub, cactus or tree of the chunk scatter, a wall round it with a gate on its town side, its graves in sections no wider than the cap either side of a path, in family plots that share a name, with mixed markers (stone, wood, cairn, iron) by the family\'s means', async () => {
      S.plan();
      const cem = S.cems.get('cem:cg-241'); // THE COURTHOUSE-SQUARE COUNTY SEAT: 206 graves by the formula, by a mesa
      if (!cem) return 'no cem:cg-241';
      await home(cem.x, cem.z - cem.d / 2 - 12); await api._step(30);
      S.resolve(cem); await api._step(10); // (its chunks laid out again, the yard drawn)
      const L = cem.L, K = CEMETERY_KINDS[cem.kind], G = S.gravesOf(cem), lay = CEM_LAYOUT;
      // the world's scatter in every laid-out chunk round it (instance positions and static boxes) inside the wall + keep
      const s = Math.sin(cem.a), c = Math.cos(cem.a), inside = (x, z) => { const dx = x - cem.x, dz = z - cem.z; return Math.abs(dx * c - dz * s) < cem.w / 2 + lay.keep - 0.5 && Math.abs(dx * s + dz * c) < cem.d / 2 + lay.keep - 0.5; };
      const scatter = [], R = Math.hypot(cem.w, cem.d) / 2 + lay.keep;
      let chunks = 0;
      for (const Lc of g.streamer.layouts.values()) {
        if (Lc.cx * CHUNK > cem.x + R || (Lc.cx + 1) * CHUNK < cem.x - R || Lc.cz * CHUNK > cem.z + R || (Lc.cz + 1) * CHUNK < cem.z - R) continue;
        chunks++;
        for (const [name, r] of Object.entries(Lc.inst ?? {})) for (let k = 0; k < r.n; k++) if (inside(r.m[k * 16 + 12], r.m[k * 16 + 14])) scatter.push(name);
        for (const b of Lc.boxes ?? []) if (inside((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2)) scatter.push(b.tag);
      }
      const keepOut = S.solid(cem.x, cem.z) && S.solid(cem.x + cem.w / 2 + lay.keep - 1, cem.z) && !S.solid(cem.x + cem.w / 2 + lay.keep + 6, cem.z + cem.d / 2 + lay.keep + 6) && g.streamer.W.rites === S;
      // the yard: sections under the cap, a main path from the gate, plots of 2..5 sharing a family name, mixed markers
      const secsOk = L.secs.length >= 2 && L.secs.every((q) => q.w <= lay.secW + 0.01) && L.paths.length >= 2 && L.paths[0][1] < -cem.d / 2 + 1;
      const plotsOk = L.plots.every((P) => P.k >= 1 && P.k <= lay.plot[1]) && L.plots.filter((P) => P.k >= lay.plot[0]).length > L.plots.length * 0.7;
      let fam = 0, famBad = 0;
      for (const P of L.plots) { const names = new Set(); for (let q = P.s0; q < P.s0 + P.k && q < G.length; q++) if (G[q].family) names.add(G[q].family); if (names.size === 1) fam++; if (names.size > 1) famBad++; }
      const markers = {};
      for (const r of G) markers[r.marker] = (markers[r.marker] ?? 0) + 1;
      const mixed = ['stone', 'cross', 'cairn', 'iron'].every((m) => markers[m] > 0);
      const rich = L.plots.filter((P) => P.wealth === 2), richStone = rich.length ? rich.reduce((t, P) => t + G.slice(P.s0, P.s0 + P.k).filter((r) => r.marker === 'stone' || r.marker === 'iron').length / P.k, 0) / rich.length : 0;
      const poor = L.plots.filter((P) => P.wealth === 0), poorStone = poor.length ? poor.reduce((t, P) => t + G.slice(P.s0, P.s0 + P.k).filter((r) => r.marker === 'stone' || r.marker === 'iron').length / P.k, 0) / poor.length : 1;
      const drawn = S.drawnCems.includes(cem.id) && K.wall === 'stone' && L.trees.length === K.trees;
      const v = { scatter: scatter.slice(0, 12), n: scatter.length, chunks, keepOut, secs: L.secs.length, cols: L.cols, paths: L.paths.length, plots: L.plots.length, fam, famBad, markers, richStone: r2(richStone), poorStone: r2(poorStone), drawn, near: S.drawnCems, count: G.length, formula: graveCount(cem.pop, cem.years, cem.danger) };
      return !scatter.length && chunks && keepOut && secsOk && plotsOk && fam > L.plots.length * 0.5 && !famBad && mixed && richStone > poorStone + 0.3 && drawn && G.length === v.formula ? true : JSON.stringify(v);
    });

    await check('rites: burying makes a grave row - drag the body (hold), dig with a shovel (loud, 18 s), bury it: a grave row with who/when/how/by whom, its things in the grave box, a chronicle row, the body gone from the street', async () => {
      // the check stages all it needs (earlier checks leave a full pack, open holes, bodies and graves behind): a flat
      // spot on the island's sand, off its streets, out of any cemetery, with no hole, body or grave within 10 m
      const flat = (x, z) => Math.max(...[[2, 0], [-2, 0], [0, 2], [0, -2], [8, 0]].map(([dx, dz]) => Math.abs(S.ground(x + dx, z + dz) - S.ground(x, z)))) < 0.15;
      const clear = (x, z) => [x, x + 8].every((qx) => (g.look?.surfaceUnder?.({ x: qx, z }) ?? 'sand') !== 'road' && (g.water?.depthAt?.(qx, z) ?? 0) < 0.01)
        && ((cm) => !(cm?.resolved && Math.abs(x - cm.x) < cm.w / 2 + 12 && Math.abs(z - cm.z) < cm.d / 2 + 12))(S.cemAt(x, z)) && ![...S.holes, ...S.graves, ...S.bodies.values()].some((q) => Math.hypot((q.c?.x ?? q.x) - x, (q.c?.z ?? q.z) - z) < 10);
      let spot = null;
      for (const [x, z] of [[30, -150], [60, -170], [-40, -190], [110, -130], [-90, -120], [150, 60], [-150, 90], [70, 200]]) if (flat(x, z) && clear(x, z)) { spot = { x, z }; break; }
      if (!spot) return 'no flat, clear spot off the street';
      await home(spot.x, spot.z); await api._step(10);
      const pack = g.inventory.carried, packWas = pack.slots, capWas = pack.cap; pack.slots = []; pack.cap = Math.max(capWas, 200); // an empty pack with room (no pack worn is only BODY_LITRES): the shovel and the cross always fit
      try {
        const R = dead(P().x + 1.2, P().z, 'Buried Dead'); if (!R) return 'no slot';
        R.test = true;
        const box = g.inventory.boxes.get(R.box); g.inventory.open(box); g.inventory.opened = null;
        const items0 = box.slots.map((s) => `${s.id}x${s.n}`).join();
        const tools = g.inventory.add(pack, 'shovel', 1) + g.inventory.add(pack, 'grave_cross', 1);
        const d = await C('rites', { action: 'drag', id: R.id });
        await C('moveTo', { x: P().x + 6, z: P().z, maxSeconds: 20 });
        const moved = Math.hypot(R.c ? R.c.x - (P().x) : R.x - P().x, R.c ? R.c.z - P().z : R.z - P().z) < 2.5;
        const seq0 = g.eventSeq; // (g.events keeps the last 500: count by sequence, not by what is still in the window)
        const b = await C('rites', { action: 'bury', id: R.id, seconds: 20 });
        for (let k = 0; k < 10 && S.dig; k++) await api._step(60);
        const gr = S.graves.find((q) => q.body === R.id);
        const gb = gr && g.inventory.boxes.get(gr.box), items1 = gb ? gb.slots.map((s) => `${s.id}x${s.n}`).join() : null;
        const chron = g.society.chronicle.query({ verb: 'buried', limit: 5 }).some((r) => r.o === R.id);
        const loud = g.events.some((e) => e.type === 'digStart' && e.seq > seq0 && e.shovel);
        const ok = tools === 2 && d.ok && moved && gr && gr.name === 'Buried Dead' && gr.cause && gr.by && gr.buriedBy === 'player' && gr.marker === 'cross' && items0 === items1 && !g.inventory.boxes.has(R.box) && chron && !R.c && loud;
        return ok ? true : JSON.stringify({ spot, tools, d, moved, b: b?.text, gr: gr && { id: gr.id, name: gr.name, cause: gr.cause, by: gr.by, buriedBy: gr.buriedBy, marker: gr.marker }, items0, items1, boxGone: !g.inventory.boxes.has(R.box), chron, c: !!R.c, loud });
      } finally { pack.slots = packWas; pack.cap = capWas; g.inventory.changed?.(); }
    });

    await check('rites: not everybody gets a funeral - when a family learns of a death they hold one by the FUNERAL.held roll (likelier the more of them are left), the rest are mourned at home: no funeral, the body stays where it fell', async () => {
      const H = FUNERAL.held, rec = (k) => ({ members: Array.from({ length: k + 1 }, (_, q) => ({ key: `m${q}`, dead: false })) });
      const share = (k) => { let n = 0; for (let q = 0; q < 400; q++) if (S.holdsFuneral({ id: `held-test:${q}`, member: 'm0' }, rec(k))) n++; return n / 400; };
      const s1 = share(1), s5 = share(5), forced = S.holdsFuneral({ id: 'x', funeral: true }, rec(0)) && !S.holdsFuneral({ id: 'x', funeral: false }, rec(9));
      const near = (v, want) => Math.abs(v - want) < 0.08;
      return near(s1, Math.min(H.max, H.base + H.mourner)) && near(s5, Math.min(H.max, H.base + H.mourner * 5)) && s1 < 1 && s5 > s1 && forced ? true : JSON.stringify({ s1, s5, forced });
    });

    await check('rites: a ring resident\'s death schedules a funeral within 1-2 game days at their quarter\'s yard; the family WALK there (no teleport, step by step) and stand at the grave', async () => {
      const RS = g.residents, RG = g.streamer?.W?.ring;
      if (!RS || !RG) return 'no ring';
      const sv = (await C('save')).save; // the household is put back after (a reused page's ring checks find them whole)
      try {
      // a family household in the ring near the road east of the island
      let found = null;
      for (const [x, z] of [[620, 40], [700, -120], [-640, 60], [560, 300], [-560, -260], [820, 200], [40, 620], [60, -640]]) {
        await home(x, z); await api._step(90);
        for (const rec of RS.live) if (rec.kind === 'family' && rec.members.filter((m) => m.c?.alive).length >= 2) { found = rec; break; }
        if (found) break;
      }
      if (!found) return `no family promoted near you (live ${RS.live.size})`;
      const victim = found.members.find((m) => m.c?.alive), vc = victim.c;
      // law 6: staged 150 m from home, out of their sight, nobody watching: a death nobody reported
      const home0 = { x: P().x, z: P().z };
      await C('teleport', { x: home0.x + 150, z: home0.z }); await api._step(5);
      vc.x = P().x + 2; vc.z = P().z; vc.res.route = null;
      g.combat.kill(vc, null, 0, 1, 'bullet');
      if (S.bodies.get(vc.id)) S.bodies.get(vc.id).funeral = true; // (staged: this family holds one - not everybody gets a funeral, FUNERAL.held)
      await waitHours(api, 3); await api._step(70);
      const unreported = !S.funerals.some((q) => q.body === vc.id) && S.summary().unreported.some((u) => u.id === vc.id);
      // then you walk back and tell one of them: the funeral is planned from that fact, its source on it
      const teller = found.members.find((m) => m !== victim && m.c?.alive);
      if (!teller) return 'nobody left to tell';
      await C('teleport', { x: teller.c.x + 1.5, z: teller.c.z }); await api._step(5);
      const told = await C('rites', { action: 'report', id: vc.id });
      const F = S.funerals.find((q) => q.body === vc.id);
      if (!unreported || !F || F.learned?.source !== 'told by you') return JSON.stringify({ unreported, told, F: F?.learned ?? null });
      const now = S.hours(), inDays = (F.start - now) / 24;
      const cem = S.cems.get(F.cem), spot = S.funeralSpot(F);
      if (!cem || !spot) return JSON.stringify({ cem: F.cem });
      // the clock runs on to just before they set out
      const mourner = found.members.find((m) => m !== victim && m.c?.alive);
      const lead = Math.hypot(spot.x - mourner.c.x, spot.z - mourner.c.z) / FUNERAL.walk / 60;
      await waitHours(api, Math.max(0, F.start - lead - 0.2 - S.hours()));
      await api._step(30);
      const c = mourner.c; if (!c?.alive) return 'mourner gone';
      await C('teleport', { x: c.x + 20, z: c.z }); await api._step(10); // you stand by to watch them go
      const d0 = Math.hypot(spot.x - c.x, spot.z - c.z);
      let jump = 0, path = 0, lastX = c.x, lastZ = c.z, where = new Set();
      for (let k = 0; k < 120; k++) { await api._step(30); if (!mourner.c) break; const st = Math.hypot(mourner.c.x - lastX, mourner.c.z - lastZ); jump = Math.max(jump, st); path += st; lastX = mourner.c.x; lastZ = mourner.c.z; where.add(mourner.c.res?.where); if (F.arrived.includes(mourner.key)) break; }
      const d1 = mourner.c ? Math.hypot(spot.x - mourner.c.x, spot.z - mourner.c.z) : d0;
      const walked = path > 10 || F.arrived.includes(mourner.key);
      return inDays >= 0.95 && inDays <= 2.05 && walked && jump < 1.5 && (where.has('to the funeral') || where.has('mourning') || where.has('fetching the body') || where.has('carrying the body')) ? true
        : JSON.stringify({ inDays, d0, d1, path, jump, where: [...where], arrived: F.arrived, cem: F.cem });
      } finally { await C('load', { save: sv }); await api._step(30); }
    });

    await check('rites: no container refills over 3 game days (a trader\'s emptied shelf, his keeps, a searched crate and a body all hold what they held; a delivery is the only way goods arrive)', async () => {
      await home(0, -40);
      const inv = g.inventory, T = g.trade, ike = g.chars.find((c) => c.npc?.id === 'ike');
      if (!ike) return 'no Ike';
      T.stock(ike); // his opening stock (once)
      const boxes = [...inv.boxes.values()].filter((b) => b.owner === ike.id);
      const was = boxes.map((b) => b.slots.map((s) => ({ ...s })));
      for (const b of boxes) b.slots = b.slots.filter((s) => s.id !== 'ammo_pistol'); // his pistol rounds sold out
      const crate = [...inv.boxes.values()].find((b) => b.kind !== 'ground' && !b.owner && !b.id.startsWith('body:') && b.rolled && b.slots.length) ?? null;
      const crateWas = crate ? crate.slots.map((s) => ({ ...s })) : null; if (crate) crate.slots = [];
      const count = () => boxes.reduce((a, b) => a + b.slots.reduce((q, s) => q + s.n, 0), 0), n0 = count();
      for (let d = 0; d < 3; d++) { await waitHours(api, 24); T.stock(ike); }
      const n1 = count(), pistols = boxes.reduce((a, b) => a + b.count('ammo_pistol'), 0), crateN = crate ? crate.slots.length : 0;
      // a courier's delivery is the one way in
      S.deliver('ike', [{ id: 'ammo_pistol', n: 12 }], { kind: 'courier', id: 'test' }); ike.keptDay = (g.society.day ?? 0) - 1; T.stock(ike);
      const after = boxes.reduce((a, b) => a + b.count('ammo_pistol'), 0);
      boxes.forEach((b, i) => { b.slots = was[i]; }); if (crate) crate.slots = crateWas;
      return n1 <= n0 && pistols === 0 && crateN === 0 && after === 12 ? true : JSON.stringify({ n0, n1, pistols, crateN, after });
    });
  } finally {
    restore(); clean();
    if (S.drag) S.stopDrag(); S.dig = null;
    g.sky.time = hour0;
    await home(0, -40);
  }
}
