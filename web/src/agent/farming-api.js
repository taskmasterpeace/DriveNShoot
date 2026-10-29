// THE HOUSE GARDEN and COOKING as COMMANDS rows (docs/design/WEB_FARMING.md; systems/farming.js, systems/cooking.js, rows in
// data/farming.js and data/cooking.js). buildCommands() in api.js spreads these into COMMANDS; farmingChecks is the selftest
// share. Every verb is the player's own: you stand at the bed, with the seed and the bucket in your pack. Work takes game
// seconds on the work clock (wait=true steps until it is done).
import { CROPS, GARDEN, COOP, calendar, validateFarming } from '../data/farming.js';
import { RECIPES, QUALITY, validateCooking } from '../data/cooking.js';
import { ITEMS } from '../data/items.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function farmingCommands(api, need) {
  const g = api.g, F = () => g.farming, K = () => g.cooking, P = () => g.player;
  const work = async (res, wait) => {
    if (!res?.ok || !res.secs || !wait) return res;
    const S = F(); S.lastJob = null; let k = 0;
    while (S.job && k++ < 900) await api._step(30);
    return S.lastJob ?? { ok: false, why: 'stopped (you moved off, or it was interrupted)' };
  };
  const reach = GARDEN.reach + 1.2;
  const bedOf = (a) => {
    const S = F(); need(S, 'no farming system');
    if (a.plot) { const p = S.plots.find((q) => q.id === a.plot); need(p, `no bed ${a.plot} (garden)`); const d = Math.hypot(p.x - P().x, p.z - P().z); need(a.force || d <= reach, `bed ${p.id} is ${r1(d)} m away: moveTo x=${p.x} z=${p.z} first`); return p; }
    return S.plotNear(P().x, P().z);
  };
  const coopOf = (a) => {
    const S = F(); need(S, 'no farming system');
    if (a.coop) { const c = S.coops.find((q) => q.id === a.coop); need(c, `no coop ${a.coop}`); return c; }
    return S.coopNear(P().x, P().z);
  };
  return {
    garden: {
      group: 'world',
      desc: 'THE HOUSE GARDEN (docs/design/WEB_FARMING.md; rows in data/farming.js). Beds are dug in the yard of a place you hold, sown from a real seed packet, watered from a real bucket (or a rain catcher beside them), grown on the GAME clock by crop row, and picked into your pack. A raid, a drought, a frost, blight or pests still cost you. '
        + 'action=status (default): the calendar, every bed (crop, stage, growth, days left, water, soil, risks), the hens, the seed in your pack, the garden log. '
        + 'till [x z]: dig a bed (hoe or shovel; the yard of a held place; ahead of you by default). sow crop=beans|squash|corn|tomato|pepper|potato|greens|herbs|melon|citrus [plot=]: one seed packet. water [plot=] [litres=]: bucket or catcher. fertilise: a compost. compost: rotten food in your pack -> compost (3:1). harvest: ripe -> produce + saved seed. clear: pull dead or blighted plants. fence (4 planks) / scarecrow (2 rag, 2 deadwood). '
        + 'coop: build one (6 planks). latch: wire it (2 scrap). stock sex=hen|rooster: a hen from your pack. feed: chicken feed or corn into the trough, bucket water into the trough. eggs: collect. slaughter: dress a bird. '
        + 'consign trader= item= n=: a crew member carries produce to a trader (the only way garden food reaches a shelf). panel open=true|false: the garden panel. age days=N: let the garden alone live N days (a test hook; the world clock does not move). crewtend: one cycle of the crew farm job. Work takes game seconds: wait=true (default) steps until it is done.',
      args: {
        action: { type: 'string', enum: ['status', 'till', 'sow', 'water', 'fertilise', 'compost', 'harvest', 'clear', 'fence', 'scarecrow', 'coop', 'latch', 'stock', 'feed', 'eggs', 'slaughter', 'consign', 'panel', 'age', 'crewtend', 'log'], default: 'status' },
        crop: { type: 'string', enum: Object.keys(CROPS) }, plot: { type: 'string' }, coop_id: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' }, litres: { type: 'number' },
        sex: { type: 'string', enum: ['hen', 'rooster'] }, trader: { type: 'string' }, item: { type: 'string' }, n: { type: 'number', default: 1 }, days: { type: 'number', default: 1 }, open: { type: 'boolean' },
        wait: { type: 'boolean', default: true }, force: { type: 'boolean', default: false },
      },
      run: async (a) => {
        const S = F(); need(S, 'no farming system');
        const w = (r) => work(r, a.wait !== false);
        switch (a.action) {
          case 'till': return w(S.till(a.x, a.z));
          case 'sow': { const p = bedOf(a); need(p, 'no bed within reach (garden action=till)'); let c = a.crop; if (!c) { const s = S.seedsCarried()[0]; need(s, 'you carry no seed'); c = s.crop; } return w(S.sow(p, c)); }
          case 'water': { const p = bedOf(a); need(p, 'no bed within reach'); return w(S.water(p, a.litres ?? null)); }
          case 'fertilise': { const p = bedOf(a); need(p, 'no bed within reach'); return S.fertilise(p); }
          case 'compost': return S.compost();
          case 'harvest': { const p = bedOf(a); need(p, 'no bed within reach'); return w(S.harvest(p)); }
          case 'clear': { const p = bedOf(a); need(p, 'no bed within reach'); return w(S.clear(p)); }
          case 'fence': { const p = bedOf(a); need(p, 'no bed within reach'); return w(S.fence(p)); }
          case 'scarecrow': { const p = bedOf(a); need(p, 'no bed within reach'); return w(S.scarecrow(p)); }
          case 'coop': return w(S.buildCoop(a.x, a.z));
          case 'latch': return w(S.secureCoop(coopOf({ coop: a.coop_id })));
          case 'stock': return S.stock(coopOf({ coop: a.coop_id }), a.sex ?? 'hen');
          case 'feed': return S.feedCoop(coopOf({ coop: a.coop_id }));
          case 'eggs': return S.collectEggs(coopOf({ coop: a.coop_id }));
          case 'slaughter': return S.slaughter(coopOf({ coop: a.coop_id }), a.sex ?? null);
          case 'consign': need(a.trader && a.item, 'trader= and item='); return S.consignTo(a.trader, a.item, a.n);
          case 'panel': { const U = g.gardenUI; need(U, 'no panel'); return { open: U.toggle(a.open ?? !U.open) }; }
          case 'age': S.age(a.days); return { ok: true, aged: a.days, plots: S.plots.map((p) => S.plotView(p)) };
          case 'crewtend': return S.crewTend({ id: 'agent' }, 1);
          case 'log': return { log: S.log };
          default: return S.view();
        }
      },
    },
    meal: {
      group: 'world',
      desc: 'COOKING MEALS (docs/design/WEB_FARMING.md §3.5; rows in data/cooking.js). action=list (default): every recipe, what you have of each input, the tools and the bench it needs, whether you can make it now, your cooking level, the bench under you, and whether you are well fed. '
        + 'cook recipe=<id> [batches=1-4]: take the ingredients from your pack and cook at a fire, a camp stove or a held base\'s kitchen (a stove burns a deadwood a batch). The meal is made at a QUALITY (cook level + herbs + freshness + bench) and its tier (off|poor|good|fine) is the item: good and fine meals lift morale and keep you well fed; cooking rotten food makes an `off` meal that poisons you. Eat with `item use`.',
      args: { action: { type: 'string', enum: ['list', 'cook'], default: 'list' }, recipe: { type: 'string' }, batches: { type: 'number', default: 1 }, wait: { type: 'boolean', default: true } },
      run: async (a) => {
        const C = K(); need(C, 'no cooking system');
        if (a.action === 'cook' || a.recipe) { need(a.recipe, `recipe= one of ${RECIPES.map((r) => r.id).join(', ')}`); return work(C.cook(a.recipe, a.batches), a.wait !== false); }
        return C.view();
      },
    },
  };
}

export async function farmingChecks(api, check, C) {
  const g = api.g, F = g.farming, K = g.cooking, S = g.homes, P = () => g.player;
  if (!F || !K) { await check('farming: the house garden is live', async () => 'no g.farming'); return; }
  const inv = g.inventory, cnt = (id) => inv.carried.count(id);
  const give = (id, n) => { const k = n - cnt(id); if (k > 0) inv.add(inv.carried, id, k); return cnt(id) >= n; };
  const drop = (id) => { for (let i = inv.carried.slots.length - 1; i >= 0; i--) if (inv.carried.slots[i].id === id) inv.take(inv.carried, i, inv.carried.slots[i].n); };
  const pack0 = inv.carried.slots.map((x) => ({ ...x })), cap0 = inv.carried.cap; inv.carried.cap += 600;
  const was = { z: g.zombies.enabled, r: g.raiderTimer, conv: g.convoy.next, cg: g.citygen.enabled, seasons: g.seasons, god: !!g.godMode, plots: F.save(), cook: K.save(), crewBase: g.crew?.base ?? null };
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.convoy.despawn?.(); g.convoy.next = 1e9;
  await C('god', { on: true });
  F.load(null); K.load(null);
  const tmp = [], stamped = [], r2 = (v) => Math.round(v * 100) / 100;
  const spawn = (o) => { const c = g.addChar(o); if (c) { c.farmTest = true; tmp.push(c); } return c; };
  const sweep = () => { for (const c of tmp.splice(0)) if (g.chars.includes(c)) g.removeChar(c); };
  const out = async () => { if (g.dialogue?.active) g.dialogue.close(); if (g.invUI?.open) g.invUI.toggle(false); if (P().inVehicle) g.exitVehicle(true); F.job = null; };
  const evSince = (seq, type) => (g.events ?? []).filter((e) => e.seq > seq && e.type === type);
  const seq0 = () => g.events?.[g.events.length - 1]?.seq ?? 0;
  const calm = { frost: 0, rain: 0, evap: 1, pest: 0, blight: 0 }; // weather held still: the checks are about the rules, not the dice
  let house = null, base = null, synthetic = false;
  const yardSpot = (k = 0) => { // an open spot in the held house's yard, k-th of a ring
    const b = base; if (!b) return null;
    const cx = (b.rect.x0 + b.rect.x1) / 2, cz = (b.rect.z0 + b.rect.z1) / 2, hw = (b.rect.x1 - b.rect.x0) / 2 + 4.5, hd = (b.rect.z1 - b.rect.z0) / 2 + 4.5;
    let n = 0;
    for (let r = 0; r < 14; r += 3.4) for (let a = 0; a < 24; a++) {
      const th = (a / 24) * Math.PI * 2, x = cx + Math.sin(th) * (hw + r), z = cz + Math.cos(th) * (hd + r);
      const ok = F.siteOk(x, z); if (ok.ok && n++ >= k) return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
    }
    return null;
  };
  // Stand so that the bed dug "ahead" lands on the spot.
  const standFor = async (s) => { P().face = 0; await C('teleport', { x: s.x, z: s.z - 1.9 }); P().face = 0; await api._step(4); };
  const dig = async (k = 0) => {
    const s = yardSpot(k); if (!s) return null;
    give('hoe', 1); await standFor(s);
    const r = await C('garden', { action: 'till', x: s.x, z: s.z }); if (!r.ok) return { err: r.why };
    return F.plots[F.plots.length - 1];
  };
  const refill = () => { const s = inv.carried.slots.find((q) => q.id === 'bucket'); if (s) s.left = ITEMS.bucket.uses; else { give('bucket', 1); } };
  const near = async (p) => { await C('teleport', { x: p.x, z: p.z - 1.6 }); await api._step(3); };
  try {
    await check('farming: the rows validate (validateFarming + validateCooking: every seed and produce is an item, plant months and best months agree, no purple, build costs are real items, no recipe without ingredients, no meal out of nothing)', async () => {
      const v = validateFarming(), c = validateCooking();
      const empty = validateCooking([{ id: 'x', name: 'X', inputs: {}, tools: [], hours: 1, skill: 'cooking', bench: 'any', output: { n: 1 }, food: 0.2, keepH: 10 }]);
      return v.ok && c.ok && !empty.ok ? true : JSON.stringify({ v: v.bad, c: c.bad, emptyRefused: !empty.ok });
    });
    await check('farming: the calendar shim holds a fixed spring until the seasons lane lands, then reads its month', async () => {
      g.seasons = undefined; const a = calendar(g);
      g.seasons = { month: 12 }; const b = calendar(g);
      g.seasons = { calendar: () => ({ month: 7 }) }; const c = calendar(g);
      g.seasons = was.seasons;
      return a.fixed && a.month === 4 && !b.fixed && b.month === 12 && c.month === 7 ? true : JSON.stringify({ a, b, c });
    });

    // ---- a house, then its yard ----
    for (let seed = 1; seed < 12 && !house; seed++) {
      const t = await C('citygen', { action: 'stamp', rural: 'ranch', seed, at: `${3100 + seed * 170},${620 + seed * 20}` }); stamped.push(t.id);
      await C('teleport', { x: t.x ?? 3100 + seed * 170, z: (t.z ?? 620) + 40 }); await api._step(6);
      const L = g.citygen.live.get(t.id);
      const e = L?.blds.find((q) => q.B.claimable && !S.ownerOf(q));
      if (e) house = e;
    }
    await check('farming: a garden starts at a house you hold - claim a ranch house, and its yard counts (baseAt); a house you do not hold has no yard to dig', async () => {
      await out();
      let r = null;
      if (house) {
        await C('teleport', { x: (house.minX + house.maxX) / 2, z: (house.minZ + house.maxZ) / 2 }); await api._step(6);
        r = await C('base', { action: 'claim' });
        if (r.ok) base = S.bases.get(r.id);
      }
      if (!base) { // the fallback: a synthetic held base around a spot of open ground (the claim itself is homes' own check)
        synthetic = true; await C('teleport', { x: 3000, z: 1100 }); await api._step(6);
        const x = P().x, z = P().z;
        base = { id: 'farmtest:house', kind: 'house', name: 'FARMTEST HOUSE', town: null, how: 'empty', day: 0, x, z, rect: { x0: x - 5, z0: z - 4, x1: x + 5, z1: z + 4 }, front: 'S', stash: 'base:farmtest', fort: { windows: 0, doors: 0, parts: [] }, pieces: [], state: 'held' };
        S.bases.set(base.id, base); S.stashOf(base);
      }
      const far = F.siteOk(base.x + 300, base.z + 300);
      const inside = !!yardSpot(0);
      return inside && !far.ok && /hold/.test(far.why) ? true : JSON.stringify({ claim: r?.why, synthetic, inside, far });
    });

    // ---- digging ----
    await check('farming: digging a bed takes a hoe or a shovel and a timed job in the yard of a place you hold (no tool, no yard, no room, no bed)', async () => {
      await out(); drop('hoe'); drop('shovel');
      const s = yardSpot(0); if (!s) return 'no open yard ground';
      await standFor(s);
      const noTool = await C('garden', { action: 'till', x: s.x, z: s.z });
      give('hoe', 1);
      const outside = await C('garden', { action: 'till', x: base.x + 400, z: base.z + 400 });
      const t0 = F.plots.length, w0 = performance.now();
      const ok = await C('garden', { action: 'till', x: s.x, z: s.z });
      const p = F.plots[F.plots.length - 1];
      const again = await C('garden', { action: 'till', x: s.x, z: s.z });
      return !noTool.ok && /hoe or a shovel/.test(noTool.why) && !outside.ok && ok.ok && F.plots.length === t0 + 1 && p?.fert > 0 && p.state === 'bare' && cnt('hoe') === 1 && !again.ok && /close/.test(again.why) ? true
        : JSON.stringify({ noTool: noTool.why, outside: outside.why, ok: ok.ok, t0, n: F.plots.length, fert: p?.fert, state: p?.state, hoe: cnt('hoe'), again: again.why ?? again });
    });
    await check('farming: a shovel digs too, slower than a hoe (the work seconds are a row: hoe x1, shovel x1.35)', async () => {
      const a = GARDEN.tillSecs * GARDEN.toolSkillTime.hoe, b = GARDEN.tillSecs * GARDEN.toolSkillTime.shovel;
      drop('hoe'); give('shovel', 1);
      const s = yardSpot(0); if (!s) { drop('shovel'); return 'no ground'; }
      await standFor(s);
      const r = F.till(s.x, s.z); const secs = r.secs; F.job = null;
      drop('shovel');
      return r.ok && secs > a * 0.6 && b > a ? true : JSON.stringify({ r, a, b });
    });

    // ---- seed, water, growth, harvest: the real path ----
    let bed = null;
    await check('farming: no seed, no crop - a bed is sown only from a real seed packet, and the packet leaves the pack', async () => {
      await out(); bed = F.plots[0]; if (!bed) return 'no bed';
      await near(bed); drop('seed_beans');
      const r0 = await C('garden', { action: 'sow', crop: 'beans' });
      give('seed_beans', 2);
      const r1_ = await C('garden', { action: 'sow', crop: 'beans' });
      return !r0.ok && /no .*seed/.test(r0.why) && r1_.ok && bed.state === 'growing' && bed.crop === 'beans' && cnt('seed_beans') === 1 ? true : JSON.stringify({ r0, r1_, state: bed.state, left: cnt('seed_beans') });
    });
    await check('farming: watering pours real water from a bucket (a litre is a fifth of a bed; the bucket runs down) and refuses with none', async () => {
      await out(); await near(bed); drop('bucket'); bed.water = 0.15;
      const none = await C('garden', { action: 'water' });
      give('bucket', 1); const b = inv.carried.slots.find((s) => s.id === 'bucket'); const l0 = b.left;
      const r = await C('garden', { action: 'water' });
      return !none.ok && /no water/.test(none.why) && r.ok && r.litres === 5 && b.left === l0 - 5 && bed.water >= 0.99 ? true : JSON.stringify({ none: none.why, r, left: b.left, l0, water: bed.water });
    });
    await check('farming: a rain catcher beside a bed waters it from its own tank, litre for litre', async () => {
      const cat = { id: 'farmtest:catcher', kind: 'catcher', x: bed.x + 2, z: bed.z, face: 0, water: 6, lastAt: F.hours() };
      g.outdoors.camp.push(cat);
      F.clim = () => ({ ...calm, evap: 0.01 }); bed.water = 0.1;
      const w0 = cat.water; F.age(1);
      delete F.clim; g.outdoors.camp.splice(g.outdoors.camp.indexOf(cat), 1);
      return bed.water > 0.5 && cat.water < w0 && Math.abs((w0 - cat.water) * GARDEN.litrePerWater - (bed.water - 0.1)) < 0.12 ? true : JSON.stringify({ water: bed.water, tank: cat.water, w0 });
    });
    await check('farming: sow, water, wait, harvest on the game clock - it passes seed, sprout, mid and ripe; picking gives produce bounded by the crop row plus saved seed; the bed goes bare and the soil is spent', async () => {
      await out(); await near(bed);
      Object.assign(bed, { progress: 0, health: 1, fert: 0.6, water: 0.9, state: 'growing', crop: 'beans', ripeAt: null }); const stages = new Set([F.stageOf(bed)]);
      F.clim = () => ({ ...calm, evap: 1, pest: 0 });
      let days = 0;
      while (bed.state === 'growing' && days++ < 24) { F.age(1); stages.add(F.stageOf(bed)); if (bed.water < 0.4) { refill(); await C('garden', { action: 'water' }); } }
      delete F.clim;
      const ripe = bed.state === 'ripe', exp = F.expected(bed), fert0 = bed.fert, p0 = cnt('bean_pods'), s0 = cnt('seed_beans');
      const r = await C('garden', { action: 'harvest' });
      const got = cnt('bean_pods') - p0, hi = Math.ceil(CROPS.beans.yield[1] * 1.7);
      return ripe && ['seed', 'sprout', 'mid', 'ripe'].every((s) => stages.has(s)) && days >= 6 && days <= 20 && r.ok && got >= 1 && got <= hi && got === exp && cnt('seed_beans') > s0 && bed.state === 'bare' && bed.crop === null && bed.fert < fert0 ? true
        : JSON.stringify({ ripe, stages: [...stages], days, r, got, hi, exp, seeds: cnt('seed_beans') - s0, state: bed.state, fert: [fert0, bed.fert] });
    });
    await check('farming: farming skill raises the yield (the deep sheet\'s farming row now learns from sowing and picking)', async () => {
      const lv0 = F.farmLv(); const y0 = (() => { Object.assign(bed, { crop: 'beans', state: 'ripe', health: 1, loss: 0, fert: 0.6 }); return F.expected(bed); })();
      const sk = g.deep.skill.farming; g.deep.skill.farming = 80; const y1 = F.expected(bed); g.deep.skill.farming = sk;
      const xp0 = g.deep.skill.farming; g.emit('cropHarvested', { id: 'x' }); await api._step(4); const grew = g.deep.skill.farming > xp0;
      Object.assign(bed, { crop: null, state: 'bare', loss: 0 });
      return y1 > y0 && grew ? true : JSON.stringify({ lv0, y0, y1, grew });
    });
    await check('farming: pace follows the calendar - best months faster than a plain planting month, an off-season sowing at a quarter pace', async () => {
      Object.assign(bed, { crop: 'beans', state: 'growing', water: 0.9, health: 1, fert: 0.6, progress: 0.2 });
      const best = F.rate(bed, 5), plain = F.rate(bed, 8), off = F.rate(bed, 12);
      Object.assign(bed, { crop: null, state: 'bare', progress: 0 });
      return best > plain && Math.abs(off / plain - GARDEN.offSeasonRate) < 0.01 ? true : JSON.stringify({ best, plain, off });
    });

    // ---- the ways a garden is lost ----
    await check('farming: drought withers an unwatered bed on the game clock - no produce, a dead crop to pull', async () => {
      await out(); await near(bed); give('seed_beans', 1);
      await C('garden', { action: 'sow', crop: 'beans' });
      bed.water = 0.5; F.clim = () => ({ ...calm, evap: 1.2, pest: 0 });
      const w0 = F.stats.withered; F.age(9); delete F.clim;
      const p0 = cnt('bean_pods'); const h = await C('garden', { action: 'harvest' });
      const stages = [bed.state, bed.why];
      const cl = await C('garden', { action: 'clear' });
      return bed.state === 'bare' && stages[0] === 'wilted' && stages[1] === 'dry' && !h.ok && cnt('bean_pods') === p0 && F.stats.withered === w0 + 1 && cl.ok ? true : JSON.stringify({ stages, h: h.why, cl, withered: F.stats.withered - w0 });
    });
    await check('farming: a killing frost takes tender crops and spares hardy ones (tomato 0 hardy vs collards 0.85: the odds are the row x the month x the region)', async () => {
      g.seasons = { month: 12 }; F.clim = () => ({ ...calm, frost: 1, evap: 0.02 });
      const a = F.plots[0]; Object.assign(a, { crop: 'tomato', state: 'growing', water: 0.9, health: 1, progress: 0.3 });
      const oT = F.frostOdds(a, 12); a.crop = 'greens'; const oG = F.frostOdds(a, 12); a.crop = 'tomato';
      const f0 = F.stats.frosted; F.age(14);
      const dead = a.state === 'wilted' && a.why === 'frost';
      delete F.clim; g.seasons = was.seasons; Object.assign(a, { crop: null, state: 'bare', why: null });
      return dead && F.stats.frosted === f0 + 1 && oG < oT * 0.2 && oT > 0.3 ? true : JSON.stringify({ dead, oT, oG, frosted: F.stats.frosted - f0 });
    });
    await check('farming: blight rots a bed, spreads to its neighbour, and is cured by pulling and burning (the bed rests two game days); planting the same crop again doubles the odds', async () => {
      const a = F.plots[0]; Object.assign(a, { crop: 'potato', state: 'growing', water: 0.9, health: 1, progress: 0.4, blight: true, last: 'potato' });
      const h0 = a.health; F.clim = () => ({ ...calm, evap: 0.02, pest: 0 }); F.age(1); delete F.clim;
      const dmg = a.blight && a.health < h0;
      await out(); await near(a); const cl = await C('garden', { action: 'clear' });
      give('seed_beans', 1); const resow = await C('garden', { action: 'sow', crop: 'beans' });
      const B = GARDEN.blight, rep = (B.perDay * B.repeatMul) / B.perDay;
      return dmg && cl.ok && a.state === 'bare' && !a.blight && !resow.ok && /resting/.test(resow.why) && a.restUntil > F.hours() + 40 && rep === B.repeatMul ? true : JSON.stringify({ dmg, cl, state: a.state, resow: resow.why, rest: a.restUntil - F.hours() });
    });
    await check('farming: pests take far more from an open bed than from a fenced one, and a fence costs 4 real planks', async () => {
      await out(); const a = F.plots[0]; let b = await dig(1); if (!b || b.err) b = F.plots[1]; if (!b) return 'no second bed';
      give('planks', 4); await near(b); const p0 = cnt('planks'); const f = await C('garden', { action: 'fence', plot: b.id });
      F.clim = () => ({ ...calm, pest: 1 });
      const hits = { [a.id]: 0, [b.id]: 0 }, h = (e) => { hits[e.id] = (hits[e.id] ?? 0) + 1; };
      const s0 = seq0();
      for (let d = 1; d <= 160; d++) { for (const p of [a, b]) Object.assign(p, { crop: 'melon', state: 'growing', health: 1, loss: 0, blight: false, water: 0.9, progress: 0.2 }); F.dayPass(5000 + d, { month: 4 }); }
      for (const e of evSince(s0, 'cropPests')) h(e);
      delete F.clim; for (const p of [a, b]) Object.assign(p, { crop: null, state: 'bare' });
      return f.ok && p0 - cnt('planks') === 4 && b.fenced && hits[a.id] >= 8 && hits[b.id] * 3 <= hits[a.id] ? true : JSON.stringify({ f: f.why, planks: p0 - cnt('planks'), open: hits[a.id], fenced: hits[b.id], odds: [F.pestOdds(a), F.pestOdds(b)] });
    });
    await check('farming: a scarecrow (2 rags, 2 deadwood) halves the pests on its own bed and on beds near it', async () => {
      const a = F.plots[0]; give('rag', 2); give('deadwood', 2); await out(); await near(a);
      const nb = F.plots.find((q) => q !== a && !q.fenced) ?? F.plots[1];
      const o0 = F.pestOdds(a), n0 = F.pestOdds(nb); const r = await C('garden', { action: 'scarecrow', plot: a.id });
      const o1 = F.pestOdds(a), n1 = F.pestOdds(nb);
      return r.ok && a.scarecrow && Math.abs(o1 / o0 - GARDEN.pest.scarecrow) < 0.01 && Math.abs(n1 / n0 - GARDEN.pest.scarecrow) < 0.01 ? true : JSON.stringify({ r, o0, o1, n0, n1, fencedNb: nb.fenced });
    });
    await check('farming: a raider walks off with a ripe crop (the item moves bed -> thief), it is a witnessed STEAL deed in the chronicle, and killing him puts it on his body', async () => {
      await out(); const a = F.plots[0]; await near(a);
      Object.assign(a, { crop: 'beans', state: 'ripe', progress: 1, health: 1, loss: 0, fert: 0.6, fenced: false, ripeAt: F.hours() });
      const exp = F.expected(a), st0 = F.stats.stolen, seq = seq0();
      const th = spawn({ x: a.x + 1.2, z: a.z, faction: 'raider', weapon: 'smg', hp: 60, name: 'Garden Thief', flag: 'MX' }); if (!th) return 'no slot';
      await api._step(150);
      const gone = a.state === 'bare' && F.stats.stolen === st0 + exp;
      const deed = g.society.deeds.chron.query({ verb: 'steal', limit: 8 }).some((d) => d.a === th.id);
      const took = F.thieves.find((t) => t.c === th)?.items.reduce((s, x) => s + x.n, 0);
      th.hp = 0; g.combat.damage(th, 999, P(), 0, 0, 'test'); await api._step(200);
      const box = inv.boxes.get(`body:${th.id}`), onBody = box ? box.slots.filter((s) => s.id === 'bean_pods').reduce((s, x) => s + x.n, 0) : -1;
      sweep();
      return gone && deed && took === exp && onBody >= exp ? true : JSON.stringify({ gone, deed, exp, took, onBody, stolen: F.stats.stolen - st0 });
    });
    await check('farming: the infected trample a growing bed; a fence does not stop a raider but turns back a hungry stranger', async () => {
      const a = F.plots[0]; await near(a);
      Object.assign(a, { crop: 'corn', state: 'growing', progress: 0.5, health: 1 });
      const t0 = F.stats.trampled; const z = spawn({ x: a.x + 1, z: a.z, faction: 'zombie', hp: 30, name: 'Walker', flag: 'US' });
      await api._step(150); const trampled = a.state === 'wilted' && a.why === 'trampled' && F.stats.trampled === t0 + 1; sweep();
      Object.assign(a, { crop: null, state: 'bare', why: null });
      return z && trampled ? true : JSON.stringify({ z: !!z, state: a.state, why: a.why });
    });
    await check('farming: stock is never made from nothing - a bare bed, an empty coop and thirty garden days add no food, and an unsown bed refuses to grow', async () => {
      await out();
      const food = () => inv.carried.slots.reduce((s, x) => s + (['bean_pods', 'squash', 'corn_ear', 'tomato', 'pepper', 'potato', 'greens', 'herbs', 'melon', 'orange', 'egg'].includes(x.id) ? x.n : 0), 0);
      const co = F.coops[0] ?? null; const f0 = food(), eg0 = F.stats.eggs;
      for (const p of F.plots) Object.assign(p, { crop: null, state: 'bare', progress: 0 });
      F.age(30);
      const sown = await C('garden', { action: 'sow', crop: 'beans', plot: F.plots[0].id, force: true }); drop('seed_beans');
      const none = await C('garden', { action: 'sow', crop: 'beans', plot: F.plots[0].id, force: true });
      const harvest = await C('garden', { action: 'harvest', plot: F.plots[0].id, force: true });
      return food() === f0 && F.stats.eggs === eg0 && !none.ok && !harvest.ok && F.plots.every((p) => p.progress === 0) ? true : JSON.stringify({ f0, f1: food(), none: none.why, harvest: harvest.why });
    });

    // ---- the hens ----
    let coop = null;
    await check('farming: a coop takes 6 planks and a timed job in the yard; a hen from your pack goes in and is not minted', async () => {
      await out(); const s = yardSpot(4); if (!s) return 'no ground for a coop';
      give('planks', 6); await C('teleport', { x: s.x, z: s.z - 2.4 }); P().face = 0; await api._step(3);
      const p0 = cnt('planks'); const r = await C('garden', { action: 'coop', x: s.x, z: s.z }); coop = F.coops[0];
      give('hen', 1); const st = await C('garden', { action: 'stock', coop_id: coop?.id, sex: 'hen' });
      const again = await C('garden', { action: 'stock', coop_id: coop?.id });
      return r.ok && coop && p0 - cnt('planks') === 6 && st.ok && coop.hens.length === 1 && cnt('hen') === 0 && !again.ok ? true : JSON.stringify({ r, planks: p0 - cnt('planks'), st, again: again.why, hens: coop?.hens.length });
    });
    await check('farming: hens lay only when fed and watered; unfed they stop laying and starve; a fox takes fewer from a latched coop', async () => {
      if (!coop) return 'no coop';
      await C('teleport', { x: coop.x, z: coop.z - 2 }); await api._step(3);
      coop.hens[0].age = 40; const e0 = F.stats.eggs, calmP = { ...calm, pest: 0 };
      F.clim = () => calmP; F.age(4); const unfedEggs = F.stats.eggs - e0; const lost0 = F.stats.henLost; F.age(3); const starved = coop.hens.length === 0 && F.stats.henLost === lost0 + 1;
      give('hen', 1); await C('garden', { action: 'stock', coop_id: coop.id }); coop.hens[0].age = 40; give('chicken_feed', 4); refill();
      let eggs = 0, p0 = cnt('egg');
      for (let d = 0; d < 8; d++) { await C('garden', { action: 'feed', coop_id: coop.id }); refill(); F.age(1); }
      const laid = F.stats.eggs - e0 - unfedEggs; const got = await C('garden', { action: 'eggs', coop_id: coop.id });
      delete F.clim;
      const open = F.predatorOdds(coop); coop.secure = true; const latched = F.predatorOdds(coop); coop.secure = false;
      return unfedEggs === 0 && starved && laid >= 1 && got.ok && cnt('egg') - p0 === got.n && latched < open * 0.2 ? true : JSON.stringify({ unfedEggs, starved, laid, got, open, latched });
    });
    await check('farming: a laid egg is raw and wants a fire (it cooks to a boiled egg) and a hen can be dressed for meat and feathers', async () => {
      if (!coop) return 'no coop';
      const raw = ITEMS.egg.raw && ITEMS.egg.cooks === 'boiled_egg' && ITEMS[ITEMS.egg.cooks];
      if (!coop.hens.length) { give('hen', 1); await C('garden', { action: 'stock', coop_id: coop.id }); }
      const f0 = cnt('raw_fowl'); const r = await C('garden', { action: 'slaughter', coop_id: coop.id, sex: 'hen' });
      return raw && r.ok && cnt('raw_fowl') >= f0 + 2 ? true : JSON.stringify({ raw: !!raw, r, fowl: cnt('raw_fowl') - f0 });
    });

    // ---- the crew, the market, the book ----
    await check('farming: the crew FARM job works the real stock - it waters from a bucket (or a catcher), picks ripe beds into the pack, and says so when there is no water', async () => {
      await out(); const a = F.plots[0]; Object.assign(a, { crop: 'tomato', state: 'growing', water: 0.1, progress: 0.4, health: 1, fenced: false });
      for (const p of F.plots) if (p !== a) Object.assign(p, { crop: null, state: 'bare' });
      drop('bucket'); if (g.inventory.boxes.get('crew:stash')) g.inventory.boxes.get('crew:stash').slots.length = 0;
      const none = F.crewTend({ id: 'tester' }, 1);
      give('bucket', 1); const b = inv.carried.slots.find((s) => s.id === 'bucket'), l0 = b.left;
      const wat = F.crewTend({ id: 'tester' }, 1);
      Object.assign(a, { state: 'ripe', progress: 1, ripeAt: F.hours() }); const p0 = cnt('tomato'), exp = F.expected(a);
      const pick = F.crewTend({ id: 'tester' }, 1);
      return !none.ok && /no water/.test(none.why) && wat.ok && b.left < l0 && a.water > 0.1 && pick.ok && (cnt('tomato') - p0 === exp || (inv.boxes.get('crew:stash')?.slots.some((s) => s.id === 'tomato'))) ? true : JSON.stringify({ none, wat, left: [l0, b.left], pick, got: cnt('tomato') - p0, exp });
    });
    await check('farming: the crew farm job row runs the real crew cycle (data/crewjobs.js farm -> crewTend), not a ration out of nothing', async () => {
      const J = (await import('../data/crewjobs.js')).CREW_JOB_BY_ID.farm; if (!g.crew) return 'no crew';
      const r0 = cnt('ration'); const a = F.plots[0]; Object.assign(a, { crop: 'tomato', state: 'ripe', progress: 1, health: 1, ripeAt: F.hours() });
      const ok = g.crew.jobCycle({ id: 'tester', row: { skills: { cook: 3 } }, needs: { food: 0.5 } }, J);
      return J.effect === 'farm' && !J.outputs?.ration && ok === true && cnt('ration') === r0 ? true : JSON.stringify({ ok, rations: cnt('ration') - r0, J });
    });
    await check('farming: garden food reaches a trader\'s shelf only by a courier - the produce leaves your pack, travels hours, and arrives as a PRODUCER delivery that the shelf takes', async () => {
      const j = await C('crewJoin', { spawn: 'sleeper' }); if (!j.ok) return `no crew member: ${j.why}`;
      const t = g.chars.find((c) => c.npc?.id && c.alive && c !== P()); if (!t) return 'no trader to send to';
      give('tomato', 6); const c0 = cnt('tomato'); const r = F.consignTo(t.npc.id, 'tomato', 4);
      const left = c0 - cnt('tomato'), early = g.rites.deliveries.filter((d) => d.trader === t.npc.id).length;
      F.last -= 0; const M = F.consign[0]; if (M) M.arriveAt = F.hours() - 1; F.marketPass();
      const dl = g.rites.deliveries.find((d) => d.trader === t.npc.id && d.source.kind === 'producer');
      const shelf = inv.place('farmtest:shelf', 'crate', t.x, t.z, 99, 'TEST SHELF'); shelf.rolled = true;
      g.trade.delivered(t.npc.id, [shelf]);
      const on = shelf.slots.filter((s) => s.id === 'tomato').reduce((s, x) => s + x.n, 0);
      inv.boxes.delete('farmtest:shelf'); await C('crewJoin', { leave: String(j.rec) });
      return r.ok && left === 4 && early === 0 && dl && on === 4 && F.consign.length === 0 ? true : JSON.stringify({ r, left, early, dl: !!dl, on, consign: F.consign.length });
    });
    await check('farming: the garden is in the save and survives a round trip - beds, coops, hens, eggs, the log (and the world save carries a farming block)', async () => {
      const before = JSON.stringify({ p: F.plots.map((p) => F.plotView(p)).map(({ dist, ...q }) => q), c: F.coops.map((c) => F.coopView(c)).map(({ dist, ...q }) => q) });
      const s = JSON.parse(JSON.stringify(F.save())); F.load(s);
      const after = JSON.stringify({ p: F.plots.map((p) => F.plotView(p)).map(({ dist, ...q }) => q), c: F.coops.map((c) => F.coopView(c)).map(({ dist, ...q }) => q) });
      const sv = (await C('save')).save;
      return before === after && F.plots.length >= 2 && sv?.farming?.plots?.length === F.plots.length && sv?.cooking ? true : JSON.stringify({ same: before === after, n: F.plots.length, block: !!sv?.farming, cook: !!sv?.cooking });
    });
    await check('farming: beds draw as ONE instanced mesh with stages, fences, a scarecrow and the coop\'s hens, well inside the budget', async () => {
      await out(); await near(F.plots[0]);
      Object.assign(F.plots[0], { crop: 'corn', state: 'growing', progress: 1, health: 1, ripeAt: F.hours() }); F.plots[0].state = 'ripe';
      F.draw(); const n1 = F.mesh.count; Object.assign(F.plots[0], { crop: null, state: 'bare' }); F.draw(); const n0 = F.mesh.count;
      const perf = await C('perf');
      return F.mesh.visible && n1 > n0 && n1 > 20 && n1 < 1500 && perf.drawCalls < 150 ? true : JSON.stringify({ n0, n1, calls: perf.drawCalls });
    });
    await check('farming: the garden panel and chip show beds, days left, water and risks - and the prompt at a bed names the verb', async () => {
      const U = g.gardenUI; if (!U?.chip) return 'no panel';
      U.toggle(true); U.refresh();
      const chip = U.chip.textContent, panel = U.panel.textContent, shown = U.chip.style.display !== 'none';
      U.toggle(false);
      const a = F.plots[0]; await near(a); Object.assign(a, { crop: 'tomato', state: 'ripe', progress: 1, health: 1, ripeAt: F.hours() });
      const pr = F.nearFor(P()); Object.assign(a, { crop: null, state: 'bare' });
      return shown && /GARDEN/.test(chip) && /THE GARDEN/.test(panel) && /WATER/.test(panel) && pr?.verb === 'harvest' && /Pick/.test(pr.text) ? true : JSON.stringify({ shown, chip, panel: panel.slice(0, 120), pr });
    });
    await check('farming: the pack\'s own use verbs reach the garden - a seed packet sows the bed beside you, a bucket pours a litre, a hoe digs, a hen goes into the coop (no double counting)', async () => {
      await out(); const a = F.plots[0]; await near(a); Object.assign(a, { crop: null, state: 'bare', water: 0.1, restUntil: 0 });
      give('seed_squash', 1); give('bucket', 1); refill(); const b = inv.carried.slots.find((s) => s.id === 'bucket'); const l0 = b.left;
      const si = inv.carried.slots.findIndex((s) => s.id === 'seed_squash'); const r = inv.use(si);
      const bi = inv.carried.slots.findIndex((s) => s.id === 'bucket'); const w = inv.use(bi);
      const used = l0 - b.left;
      return r.ok && a.crop === 'squash' && cnt('seed_squash') === 0 && w.ok && used === 1 && Math.abs(a.water - 0.3) < 0.02 ? true : JSON.stringify({ r, w, crop: a.crop, left: cnt('seed_squash'), used, water: a.water });
    });

    // ---- cooking ----
    const fire = { x: 0, z: 0, r: 0.6, t: 1, dur: 1e9, by: null };
    const lightFire = () => { fire.x = P().x + 0.5; fire.z = P().z; if (!g.throwables.fires.includes(fire)) g.throwables.fires.push(fire); };
    const putOut = () => { const i = g.throwables.fires.indexOf(fire); if (i >= 0) g.throwables.fires.splice(i, 1); };
    await check('cooking: a recipe needs real ingredients, the right tool and a fire - nothing is cooked from nothing, and the food is gone from the pack when it is', async () => {
      await out(); await C('teleport', { x: base.x - 30, z: base.z - 30 }); await api._step(4);
      for (const id of ['potato', 'pepper', 'tomato', 'cook_pot', 'herbs', 'greens']) drop(id);
      for (const r of RECIPES) for (const k of Object.keys(r.inputs)) drop(k);
      const noFire = await C('meal', { action: 'cook', recipe: 'hash' });
      lightFire();
      const noFood = await C('meal', { action: 'cook', recipe: 'hash' });
      give('potato', 2); give('pepper', 1);
      const noPot = await C('meal', { action: 'cook', recipe: 'boiled_potatoes' });
      const ok = await C('meal', { action: 'cook', recipe: 'hash' });
      putOut();
      const made = ['off', 'poor', 'good', 'fine'].reduce((s, t) => s + cnt(`hash__${t}`), 0);
      return !noFire.ok && /fire/.test(noFire.why) && !noFood.ok && /needs 2 potato/i.test(noFood.why) && !noPot.ok && /pot/.test(noPot.why) && ok.ok && made === 2 && cnt('potato') === 0 && cnt('pepper') === 0 ? true : JSON.stringify({ noFire: noFire.why, noFood: noFood.why, noPot: noPot.why, ok, made });
    });
    await check('cooking: quality is a number from the cook\'s level, herbs, freshness and the bench, and the tier it falls in is the item (off | poor | good | fine)', async () => {
      const q = (o) => K.quality({ fresh: 1, herbs: false, ...o.inp }, o.lvl ?? 0, o.bench ?? 'fire', o.pot ?? false);
      const lo = q({ lvl: 0 }), hi = q({ lvl: 9 }), herb = q({ lvl: 0, inp: { herbs: true } }), stove = q({ lvl: 0, bench: 'stove' }), stale = q({ lvl: 0, inp: { fresh: 0.5 } });
      return hi > lo && herb > lo && stove > lo && stale < lo && K.tierOf(lo, false) === 'poor' && K.tierOf(hi, false) !== 'poor' && K.tierOf(0.95, false) === 'fine' && K.tierOf(0.99, true) === 'off' ? true : JSON.stringify({ lo, hi, herb, stove, stale });
    });
    await check('cooking: cooking food that has gone rotten makes an OFF meal and eating it poisons you', async () => {
      await out(); lightFire();
      for (const id of ['potato', 'pepper']) drop(id);
      const old = inv.hours() - 2000; inv.add(inv.carried, 'potato', 2, { made: old }); inv.add(inv.carried, 'pepper', 1, { made: old });
      const r = await C('meal', { action: 'cook', recipe: 'hash' }); putOut();
      const i = inv.carried.slots.findIndex((s) => s.id === 'hash__off'); if (i < 0) return JSON.stringify({ r });
      await C('god', { on: false }); g.needs.sick = null; const e = inv.use(i); await api._step(10);
      const sick = g.needs.sick?.kind;
      g.needs.sick = null; await C('god', { on: true });
      for (const t of ['off', 'poor', 'good', 'fine']) drop(`hash__${t}`);
      return r.ok && r.tier === 'off' && e.ok && sick === 'poisoning' ? true : JSON.stringify({ r, e, sick });
    });
    await check('cooking: a good meal restores food and hp, lifts morale and keeps you well fed - a little hp back every game hour', async () => {
      await out(); give('veg_stew__fine', 1); P().hp = 40; g.needs.food = 0.2;
      const m0 = g.deep.moraleNow(); const i = inv.carried.slots.findIndex((s) => s.id === 'veg_stew__fine'); const e = inv.use(i); await api._step(8);
      const m1 = g.deep.moraleNow(), wf = K.wellFed; const hp0 = P().hp; K.lastAt -= 1; K.update(0.016); const regen = P().hp - hp0;
      K.wellFed = null;
      return e.ok && g.needs.food > 0.45 && m1 > m0 && wf?.tier === 'fine' && regen > 0.4 ? true : JSON.stringify({ e, food: g.needs.food, m: [m0, m1], wf, regen });
    });
    await check('cooking: the crew COOK job makes a real recipe from the real stock (the ingredients leave the pack) and falls back to a plain meal only when no recipe fits', async () => {
      for (const r of RECIPES) for (const k of Object.keys(r.inputs)) drop(k);
      const J = (await import('../data/crewjobs.js')).CREW_JOB_BY_ID.cook;
      give('potato', 2); give('pepper', 1);
      const mem = { id: 'cook1', row: { skills: { cook: 4 } }, needs: { food: 0.2 }, c: null };
      const before = g.crew.stats.jobsDone; const ok = g.crew.jobCycle(mem, J);
      const left = cnt('potato') + cnt('pepper'); const fed = K.stats.crewBatches >= 1;
      // the stock the crew would otherwise use: nothing fits -> the plain meal path takes any food (or the job waits)
      for (const id of ['potato', 'pepper']) drop(id);
      return ok === true && left === 0 && fed && g.crew.stats.jobsDone === before + 1 ? true : JSON.stringify({ ok, left, fed });
    });
  } finally {
    putOutSafe(g);
    sweep();
    if (g.seasons !== was.seasons) g.seasons = was.seasons;
    delete F.clim;
    for (const id of stamped) { try { await C('citygen', { action: 'release', id }); } catch { /* released with the town */ } }
    if (synthetic && base) { S.bases.delete(base.id); inv.boxes.delete(base.stash); } else if (base) { S.unbase?.(base.id); }
    F.load(was.plots); K.load(was.cook);
    if (g.crew && !was.crewBase) g.crew.base = null;
    inv.carried.slots.length = 0; for (const s of pack0) inv.carried.slots.push({ ...s }); inv.carried.cap = cap0; inv.changed();
    g.zombies.enabled = was.z; g.raiderTimer = was.r; g.convoy.next = was.conv;
    await C('god', { on: was.god });
  }
}
function putOutSafe(g) { const F = g.throwables?.fires; if (F) for (let i = F.length - 1; i >= 0; i--) if (F[i].dur === 1e9 && F[i].by === null && F[i].r === 0.6) F.splice(i, 1); }
