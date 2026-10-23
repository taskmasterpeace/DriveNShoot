// THE ROADSIDE as COMMANDS rows and selftest checks (docs/design/WEB_ROADSIDE.md; rows in src/data/roadside.js, laid out
// by src/world/roadside.js, worked by src/systems/roadside.js). buildCommands() in api.js spreads roadsideCommands into
// COMMANDS (help, the CLI, the MCP tools, docs/COMMANDS.md); runSelfTest() calls roadsideChecks near the end.
import { validateRoadside, ROADSIDE_RULES as RR, POWER_LINES, BILLBOARDS, SITES } from '../data/roadside.js';
import { STREAM } from '../data/streaming.js';
import GOLDEN from '../data/golden.json';

const r1 = (v) => Math.round(v * 10) / 10;
const pinned = () => Object.keys(GOLDEN.p1Chunks ?? {});

export function roadsideCommands(api, need) {
  const g = api.g;
  const RS = () => g.streamer?.W?.roadside ?? null;
  const sys = () => g.roadside;
  const spotView = (sp) => {
    const S = sys(), o = { id: sp.id, kind: sp.kind, site: sp.site, x: sp.x, z: sp.z, y: sp.y || undefined };
    if (sp.kind === 'tank') Object.assign(o, { litres: S.litres(sp), guarded: !!sp.guarded });
    if (sp.kind === 'hulk') Object.assign(o, { scrap: S.scrapLeft(sp), stack: sp.stack });
    if (sp.kind === 'water') Object.assign(o, { source: sp.source, litres: r1(S.waterNow(sp)), cap: sp.cap });
    if (sp.kind === 'wheel') o.gates = S.gates(sp.site);
    return o;
  };
  const siteView = (s, full = false) => {
    const S = sys(), o = { id: s.id, kind: s.kind, name: s.name, x: Math.round(s.x), z: Math.round(s.z), state: s.state ?? undefined };
    if (s.kind === 'farm') Object.assign(o, { fields: s.fields, rows: s.rows, trees: s.trees, crops: s.crops });
    if (s.kind === 'dam') Object.assign(o, { gates: S.gates(s.id), road: s.road, crest: s.crest, river: s.river });
    if (s.keepers) o.keepers = { row: s.keepers, live: (S.live[s.id]?.chars ?? []).map((c) => ({ id: c.id, name: c.name, flag: c.flag, alive: c.alive })), dead: Object.keys(S.dead) };
    if (s.dog) o.dog = { ...s.dog, id: S.dogs[s.id] ?? null };
    if (full) o.spots = RS().spots.filter((q) => q.site === s.id).map(spotView);
    return o;
  };
  return {
    roadside: {
      group: 'world', desc: 'THE ROADSIDE (docs/design/WEB_ROADSIDE.md, rows in src/data/roadside.js): power lines and pylons (one down across I-10 at mile 11), billboards (the real next exit and its distance), gas stations (siphon a looted tank with a hose; a holdout\'s counter sells fuel and water), junkyards (strip hulks for scrap on the game clock), farm belts (crops by state, a farmstead, a stock tank), the dam on the Colorado (its gates fill the cistern). action: list (every site, line, billboard, hazard; the build) | near x z r (sites and their spots near a point, with what is left) | site id= (one in full) | at x z (what stands there) | siphon id=<tank> | strip id=<hulk> (then step: a piece of scrap a quarter game hour) | water id=<tank> | gates id=<dam> open= | billboards | validate (the rows against the map, the island and the pinned P1 chunks). force=true acts from anywhere.',
      args: { action: { type: 'string', default: 'list', enum: ['list', 'near', 'site', 'at', 'siphon', 'strip', 'water', 'gates', 'billboards', 'validate'] }, id: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' }, r: { type: 'number', default: 400 }, open: { type: 'boolean' }, force: { type: 'boolean', default: false } },
      run: async ({ action, id, x, z, r, open, force }) => {
        const R = RS(), S = sys();
        need(R && S, 'the roadside is not built (no streamer)');
        const P = g.player, px = x ?? P.x, pz = z ?? P.z;
        if (action === 'list') return { buildMs: R.buildMs, chunks: R.chunks, sites: R.sites.map((s) => siteView(s)), lines: R.lines, pylons: R.pylons.length, billboards: R.billboards.length, hazards: R.hazards.map((h) => ({ id: h.id, kind: h.kind, x: Math.round(h.x), z: Math.round(h.z), road: h.road, mile: r1(h.s / STREAM.mile) })), roads: R.addedRibbons.map((rb) => rb.id), warnings: R.warnings, sys: S.view() };
        if (action === 'near') return { at: [Math.round(px), Math.round(pz)], sites: R.near(px, pz, r).map((s) => siteView(s)), spots: R.spots.filter((q) => Math.hypot(q.x - px, q.z - pz) < Math.min(r, 120)).map(spotView), name: R.nameAt(px, pz) };
        if (action === 'site') { const s = R.siteById(id); need(s, `no site ${id}; sites: ${R.sites.map((q) => q.id).join(', ')}`); return siteView(s, true); }
        if (action === 'at') {
          const boxes = R.boxes.filter((b) => px > b.x0 - 0.2 && px < b.x1 + 0.2 && pz > b.z0 - 0.2 && pz < b.z1 + 0.2).map((b) => ({ tag: b.tag, h: b.h, base: b.base || undefined }));
          const spot = S.spotNear({ x: px, z: pz, gy: P.gy ?? 0, alive: true, inVehicle: null });
          return { at: [Math.round(px), Math.round(pz)], name: R.nameAt(px, pz), solid: R.solid(px, pz), boxes, spot: spot ? spotView(spot.sp) : null, hazard: R.hazards.find((h) => Math.hypot(h.x - px, h.z - pz) < h.len) ?? null };
        }
        if (action === 'siphon') { need(id, 'id=<tank id> (roadside action=near lists them)'); const out = S.siphon(id, { force }); need(out.ok, out.why); return out; }
        if (action === 'strip') { need(id, 'id=<hulk id>'); const out = S.strip(id, { force }); need(out.ok, out.why); return out; }
        if (action === 'water') { need(id, 'id=<water tank id>'); const out = S.fillWater(id, { force }); need(out.ok, out.why); return out; }
        if (action === 'gates') { const s = R.siteById(id ?? 'palo_verde'); need(s?.kind === 'dam', `no dam ${id}`); const out = S.turnWheel(s.id, { force, open }); need(out.ok, out.why); return out; }
        if (action === 'billboards') return R.billboards.map((b) => ({ id: b.id, road: b.road, mile: b.mile, dir: b.dir, kind: b.kind, next: b.next, lines: b.lines, x: Math.round(b.x), z: Math.round(b.z) }));
        if (action === 'validate') return validateRoadside(g.streamer.W, { lines: POWER_LINES, billboards: BILLBOARDS, sites: SITES }, { footprints: R.footprints, warnings: R.warnings }, pinned());
        return null;
      },
    },
  };
}

// ---- the selftest checks ------------------------------------------------------------------------------------------------
export async function roadsideChecks(api, check, C) {
  const g = api.g, SW = g.streamer, W = SW?.W, R = W?.roadside, S = g.roadside;
  if (!R || !S) { await check('roadside: the roadside is built', async () => 'no W.roadside / g.roadside'); return; }
  const convoyNext = g.convoy.next; g.convoy.despawn(); g.convoy.next = 1e9;
  const zoom0 = g.zoomLevel, saved0 = S.save();
  const home = async () => {
    g.driveOverride = null;
    const v = g.player.inVehicle;
    if (v) { g.exitVehicle(true); g.vehiclesSys.remove(v); }
    if (g.needs) { g.needs.rest = Math.max(g.needs.rest, 0.9); g.needs.blackout = 0; }
  };
  const give = (id, n = 1) => { const I = g.inventory; const k = I.add(I.carried, id, n); I.changed(); return k; };
  const count = (id) => g.inventory.carried.count(id);
  const tapE = async () => { g.input.down.add('KeyE'); g.input.pressed.add('KeyE'); await api._step(1); g.input.down.delete('KeyE'); await api._step(1); };
  const site = (id) => R.siteById(id);
  try {
    await check('roadside: the rows validate against the map (no errors), nothing reaches the island or a pinned P1 chunk, and the layout is a few milliseconds of boot', async () => {
      const v = validateRoadside(W, { lines: POWER_LINES, billboards: BILLBOARDS, sites: SITES }, { footprints: R.footprints, warnings: R.warnings }, pinned());
      const pin = new Set(pinned()), hit = R.chunkKeys().filter((k) => pin.has(k));
      const kinds = new Set(R.sites.map((s) => s.kind));
      const ok = v.ok && !hit.length && ['station', 'junkyard', 'farm', 'substation', 'dam'].every((k) => kinds.has(k)) && R.pylons.length > 150 && R.hazards.length >= 1 && R.billboards.length >= 15 && R.buildMs < 120;
      return ok ? true : JSON.stringify({ errors: v.errors.slice(0, 6), pinnedHit: hit, kinds: [...kinds], pylons: R.pylons.length, hazards: R.hazards.length, bills: R.billboards.length, ms: R.buildMs });
    });
    await check('roadside: every next-exit billboard names the real next exit ahead and its real distance in game miles, and stands drawn in its chunk', async () => {
      const bad = [];
      let drawn = 0;
      for (const b of R.billboards.filter((q) => q.kind === 'exit')) {
        const cor = W.corridors.find((c) => c.id === b.road), dir = b.dir === cor.dirs[0][0] ? 1 : -1;
        const X = cor.exits.filter((o) => (o.s - b.s) * dir > 0).sort((p, q) => Math.abs(p.s - b.s) - Math.abs(q.s - b.s))[0];
        const miles = Math.max(1, Math.round(Math.abs(X.s - b.s) / STREAM.mile));
        if (!b.next || b.next.id !== X.id || b.next.miles !== miles || !b.lines.includes(`EXIT ${X.number}`) || !b.lines.includes(X.name) || !b.lines.includes(`${miles} ${miles === 1 ? 'MILE' : 'MILES'}`)) bad.push({ id: b.id, next: b.next, want: { id: X.id, miles } });
      }
      // Drawn: the board's chunk built fresh carries its face in the bills pool, with the right atlas rect.
      for (const id of ['i10e_m12', 'i95n_m6']) {
        const b = R.billboards.find((q) => q.id === id);
        const c = await C('chunk', { x: b.x, z: b.z, fresh: true, mode: 'sync' });
        if (c.fresh?.matches && (c.instances?.bills ?? 0) > 0) drawn++; else bad.push({ id, matches: c.fresh?.matches, bills: c.instances?.bills });
      }
      return !bad.length && drawn === 2 ? true : JSON.stringify(bad.slice(0, 4));
    });
    await check('roadside: a downed power line lies across a lane of I-10 at mile 11 (solid, and a car driven at it in that lane stops against it, never past)', async () => {
      await home();
      const h = R.hazards[0], dir = -1, lane = 1; // westbound, the outer lane (the tower fell from the north side)
      const q = SW.lanePoint(h.s, dir, lane);
      await C('teleport', { x: q.x, z: q.z - 30 });
      await C('step', { seconds: 0.2 });
      const L = SW.layouts.get(`${Math.floor(q.x / 256)},${Math.floor(q.z / 256)}`);
      const across = (L?.boxes ?? []).some((b) => b.tag === 'pylon' && q.x > b.minX - 0.4 && q.x < b.maxX + 0.4 && q.z > b.minZ - 0.4 && q.z < b.maxZ + 0.4);
      // A car 110 m back up the westbound outer lane, driven at it at 18 m/s.
      const s0 = h.s + 110, p0 = SW.lanePoint(s0, dir, lane), f0 = W.at(s0);
      await C('teleport', { x: p0.x, z: p0.z });
      const r = await C('spawnVehicle', { type: 'interceptor', x: p0.x, z: p0.z, heading: Math.atan2(f0.tx * dir, f0.tz * dir) });
      await C('enterVehicle', { id: r.id, force: true });
      const v = g.player.inVehicle;
      let minS = Infinity, maxSp = 0;
      await SW.runFrames(9, () => { const a = SW.autopilot(v, dir, lane, 18); g.driveOverride = { throttle: a.throttle, steer: a.steer }; minS = Math.min(minS, a.s); maxSp = Math.max(maxSp, Math.hypot(v.vx, v.vz)); }, { renderEvery: 30 });
      g.driveOverride = null;
      const pr = W.project(v.x, v.z), sp = Math.hypot(v.vx, v.vz), stopped = pr.s > h.s - 2 && minS > h.s - 4 && sp < 4;
      await home();
      return across && stopped && maxSp > 12 ? true : JSON.stringify({ across, minS: Math.round(minS), at: Math.round(h.s), endS: Math.round(pr.s), speed: r1(sp), maxSp: r1(maxSp) });
    });
    await check('roadside: a looted station\'s underground tank siphons once with the hose (E at its fill caps): the fuel goes into the car beside it and the tank is dry after, through a save and a load', async () => {
      await home();
      const st = site('furnace_fuel'), tank = R.tanks.find((t) => t.site === st.id && t.kind === 'tank');
      const litres0 = S.litres(tank);
      await C('teleport', { x: tank.x + 2, z: tank.z + 2 });
      const r = await C('spawnVehicle', { type: 'pickup', x: tank.x + 4.5, z: tank.z, heading: 0 });
      const v = g.vehicles.find((q) => q.id === r.id); v.fuel = 0;
      await C('teleport', { x: tank.x + 0.6, z: tank.z + 0.4 });
      await api._step(2);
      const I = g.inventory; for (let i = I.carried.slots.length - 1; i >= 0; i--) if (I.carried.slots[i].id === 'siphon_hose') I.carried.slots.splice(i, 1);
      const noHose = S.spotNear(g.player)?.label ?? '';
      give('siphon_hose');
      const fuel0 = v.fuel, prompt = S.spotNear(g.player);
      await tapE();
      const got = v.fuel - fuel0, after = S.litres(tank);
      const again = S.siphon(tank.id);
      const sv = (await C('save')).save;
      S.tank[tank.id] = litres0; // tamper: the load must put it back to dry
      await C('load', { save: sv });
      const afterLoad = S.litres(tank);
      g.vehiclesSys.remove(v);
      const ok = litres0 > 5 && prompt?.kind === 'tank' && /hose/.test(noHose) && Math.abs(got - litres0) < 0.2 && after <= 0.05 && !again.ok && /dry/.test(again.why) && afterLoad <= 0.05;
      return ok ? true : JSON.stringify({ litres0, prompt: prompt?.kind, noHose, got: r1(got), after, again, afterLoad });
    });
    await check('roadside: a junkyard hulk strips into scrap over game time with a wrench (a piece every quarter game hour, none by hand), and stays stripped', async () => {
      await home();
      const jy = site('furnace_boneyard');
      // Stand beside a hulk with scrap on it: the one E works is the nearest hulk in reach (spotNear), so that is the one timed.
      let hk = null;
      for (const q of R.hulks.filter((o) => o.site === jy.id && S.scrapLeft(o) > 0)) {
        for (const [dx, dz] of [[2.6, 0], [-2.6, 0], [0, 3.2], [0, -3.2]]) {
          await C('teleport', { x: q.x + dx, z: q.z + dz }); await api._step(2);
          const sp = S.spotNear(g.player)?.sp;
          if (sp?.kind === 'hulk' && S.scrapLeft(sp) > 0) { hk = sp; break; }
        }
        if (hk) break;
      }
      if (!hk) return 'no hulk to stand at';
      // By hand: refused.
      const I = g.inventory; const tools = I.carried.slots.filter((s) => ['wrench', 'crowbar'].includes(s.id));
      for (const s of tools) I.carried.slots.splice(I.carried.slots.indexOf(s), 1);
      const hand = S.strip(hk.id);
      give('wrench');
      // Scrap you got: in your pack, or on the ground at your feet when the pack is full (a battery-worn pack often is).
      const scrapAll = () => count('scrap') + (I.groundAt(g.player.x, g.player.z).slots.find((q) => q.id === 'scrap')?.n ?? 0);
      const scrap0 = scrapAll(), left0 = S.scrapLeft(hk);
      // Anyone at your elbow (a follower, a stray, your dog) takes E first, as everywhere: step them back a few metres.
      for (const c of g.chars) if (c !== g.player && c.alive && Math.hypot(c.x - g.player.x, c.z - g.player.z) < 4) { c.x += 12; c.z += 12; }
      if (g.dialogue.active) g.dialogue.close?.();
      await tapE();
      const why = S.job ? null : { dialogue: !!g.dialogue.active, near: g.chars.filter((c) => c !== g.player && Math.hypot(c.x - g.player.x, c.z - g.player.z) < 4).map((c) => c.name), veh: !!g.player.inVehicle, spot: S.spotNear(g.player)?.id };
      const started = S.job?.id === hk.id;
      // On the game clock (whatever its rate is right now): 1.5 pieces' worth of game hours, then the rest.
      const hrs = () => S.hours(), until = async (dh) => { const h0 = hrs(); for (let k = 0; k < 600 && hrs() - h0 < dh; k++) await C('step', { seconds: 0.5 }); };
      await until(RR.hulk.hoursPer * 1.5);
      const mid = scrapAll() - scrap0;
      await until(RR.hulk.hoursPer * (left0 + 0.5));
      const got = scrapAll() - scrap0;
      const done = S.scrapLeft(hk), job = S.job;
      const again = S.strip(hk.id);
      for (const s of tools) I.carried.slots.push(s);
      I.changed();
      const ok = !hand.ok && started && mid === 1 && got === left0 && done === 0 && !job && !again.ok;
      return ok ? true : JSON.stringify({ hand: hand.why, started, why, mid, got, left0, done, job, again: again.why });
    });
    await check('roadside: the dam - a car drives up the abutment onto the crest road; with the gates shut the cistern stays dry, opened it fills on the clock and fills your bottles', async () => {
      await home();
      const dm = site('palo_verde'), rib = W.ribbons.find((q) => q.id === dm.road);
      // Up the east abutment: start at the foot of the ramp, drive along the road to the crest.
      let i0 = 0; while (i0 < rib.n - 1 && rib.y[i0] < 0.2) i0++;
      const iS = Math.max(0, i0 - 12), sx = rib.x[iS], sz = rib.z[iS], hd = Math.atan2(rib.x[iS + 1] - sx, rib.z[iS + 1] - sz);
      await C('teleport', { x: sx, z: sz });
      const r = await C('spawnVehicle', { type: 'pickup', x: sx, z: sz, heading: hd });
      await C('enterVehicle', { id: r.id, force: true });
      const v = g.player.inVehicle;
      let maxY = 0, k = iS;
      await SW.runFrames(32, () => {
        while (k < rib.n - 2 && Math.hypot(rib.x[k] - v.x, rib.z[k] - v.z) < 9) k++;
        const want = Math.atan2(rib.x[k] - v.x, rib.z[k] - v.z), diff = Math.atan2(Math.sin(want - v.h), Math.cos(want - v.h));
        g.driveOverride = { throttle: Math.hypot(v.vx, v.vz) < 11 ? 1 : 0.1, steer: Math.max(-1, Math.min(1, diff * 2.2)) };
        maxY = Math.max(maxY, (v.y ?? 0));
      }, { renderEvery: 30 });
      g.driveOverride = null;
      const crestY = maxY;
      await home();
      // The cistern and the gates.
      const cs = R.tanks.find((t) => t.site === dm.id && t.source === 'cistern');
      S.setGates(dm.id, false); S.setWater(cs, 0);
      await C('step', { seconds: 30 });
      const shut = S.waterNow(cs);
      S.setGates(dm.id, true);
      await C('step', { seconds: 60 }); // two game hours
      const open = S.waterNow(cs);
      await C('teleport', { x: cs.x + 4.4, z: cs.z }); await api._step(2);
      const I = g.inventory; give('water_bottle'); const b = I.carried.slots.filter((s) => s.id === 'water_bottle').pop(); b.left = 0;
      const fill = S.fillWater(cs.id);
      S.setGates(dm.id, false);
      const ok = crestY > RR.dam.crest - 1 && shut === 0 && open > 30 && fill.ok && b.left === 3;
      return ok ? true : JSON.stringify({ crestY: r1(crestY), shut, open: r1(open), fill, bottle: b.left });
    });
    await check('roadside: chunks stay pure - a station\'s, a junkyard\'s, a farm\'s, the downed line\'s, the dam\'s and a billboard\'s chunk hash the same built sync and sliced, and agree with their neighbours at the seams', async () => {
      const pts = [site('furnace_fuel'), site('furnace_boneyard'), site('furnace_fields'), R.hazards[0], site('palo_verde'), R.billboards[0], site('sebastian_post')];
      const bad = [];
      for (const p of pts) {
        const a = await C('chunk', { x: p.x, z: p.z, build: true });
        const fs = (await C('chunk', { x: p.x, z: p.z, fresh: true, mode: 'sync' })).fresh, fl = (await C('chunk', { x: p.x, z: p.z, fresh: true, mode: 'sliced' })).fresh;
        const e = await C('chunk', { x: p.x + 256, z: p.z, build: true }), s = await C('chunk', { x: p.x, z: p.z + 256, build: true });
        if (!(fs.matches && fl.matches && a.edges.e === e.edges.w && a.edges.s === s.edges.n)) bad.push({ at: a.key, sync: fs.matches, sliced: fl.matches, e: a.edges.e === e.edges.w, s: a.edges.s === s.edges.n });
      }
      return !bad.length ? true : JSON.stringify(bad);
    });
    await check('roadside: under 150 draw calls at the widest zoom over the FURNACE MILE 9 cluster (a farm belt, a station and a junkyard on one screen), every pool under capacity', async () => {
      await home();
      const a = site('furnace_fuel'), b = site('furnace_boneyard'), c = site('furnace_fields');
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2 + 60;
      const full0 = Object.fromEntries(Object.entries(SW.pools).map(([k, q]) => [k, q.full]));
      await C('teleport', { x, z });
      g.zoomLevel = 4;
      await C('step', { seconds: 3 });
      SW.ensureHot?.(x, z, 'test');
      await C('step', { seconds: 1 });
      g.render(0);
      // Every pool took every instance it was asked for while the cluster came in (no failed allocation), and no hot chunk is missing a pool.
      const p = await C('perf'), full = Object.entries(SW.pools).filter(([k, q]) => q.full > full0[k]).map(([k, q]) => `${k} ${q.used}/${q.cap}`), missing = [...SW.hot.values()].flatMap((h) => h.hot?.missing ?? []);
      const near = Math.hypot(c.x - x, c.z - z) < c.r + 200;
      g.zoomLevel = zoom0;
      return p.drawCalls < 150 && !full.length && !missing.length && near ? true : JSON.stringify({ drawCalls: p.drawCalls, full, missing, near });
    });
    await check('roadside: every collision box the roadside lays out has a material by rule (none left to the default)', async () => {
      const M = g.materials, unknown = {};
      for (const b of R.boxes) { const c = M.classify({ tag: b.tag, minX: b.x0, minZ: b.z0, maxX: b.x1, maxZ: b.z1, height: b.h }); if (c.why?.startsWith('no rule')) unknown[b.tag] = (unknown[b.tag] ?? 0) + 1; }
      return !Object.keys(unknown).length ? true : JSON.stringify(unknown);
    });
    await check('roadside: a holdout station\'s keepers come in when you near it (real flags, the counter\'s dialogue), its tank is theirs (no siphon while they live), and they go back onto their record when you leave', async () => {
      await home();
      const st = site('palmas_post'), tank = R.tanks.find((t) => t.site === st.id && t.kind === 'tank');
      await C('teleport', { x: st.front.x, z: st.front.z + 6 });
      await C('step', { seconds: 1.2 });
      const live = S.live[st.id]?.chars ?? [];
      const keeper = live.find((c) => c.keeper === 'palmas_keeper');
      if (!g.inventory.hasTag('hose')) give('siphon_hose');
      const sip = S.siphon(tank.id, { force: true });
      const flags = live.every((c) => !!c.flag), talk = keeper?.npc?.nodes?.hi?.choices?.length >= 4;
      await C('teleport', { x: st.x, z: st.z + 600 });
      await C('step', { seconds: 1.2 });
      const gone = !S.live[st.id] && !g.chars.some((c) => c.roadside === st.id);
      return live.length === 2 && keeper && flags && talk && !sip.ok && gone ? true : JSON.stringify({ live: live.map((c) => c.name), flags, talk, sip: sip.why, gone });
    });
  } finally {
    await home();
    S.load(saved0);
    g.zoomLevel = zoom0;
    g.convoy.next = convoyNext;
    await C('teleport', { x: 0, z: -40 });
  }
}
