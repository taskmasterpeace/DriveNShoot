// PULLS as COMMANDS rows and selftest checks (docs/design/WEB_PULLS.md). buildCommands() in api.js spreads pullsCommands
// into COMMANDS; runSelfTest() calls pullsChecks near the end (it moves the world clock, then loads the battery's save).
import { PULL_KINDS, PULL_RULES as R, CHANNELS, BAR, validateKnowledge, validatePulls } from '../data/pulls.js';
import { ITEMS } from '../data/items.js';
import { freeSpot } from './citygen-api.js';

const r1 = (v) => Math.round(v * 10) / 10;

// Move the world clock forward honestly: the sky's hour (and the day when it wraps, society.update), the pulls ticking
// on the way (a broadcast repeats, a walker walks, a deadline comes due, a truck arrives).
export async function waitHours(g, hours, stepH = 0.25) {
  let left = hours;
  while (left > 1e-6) {
    const h = Math.min(stepH, left); left -= h;
    g.sky.time += h; if (g.sky.time >= 24) g.sky.time -= 24;
    g.society.update(0);
    g.pulls.tick(0);
  }
  return g.pulls.hours();
}

export function pullsCommands(api, need) {
  const g = api.g;
  const P = () => g.pulls;
  return {
    pulls: {
      group: 'world', desc: 'PULLS: why go out today (docs/design/WEB_PULLS.md, rows in src/data/pulls.js). Every pull is a real person or event on the world clock, and you hear of it only through a channel (law 6). action: list (the WORLD\'s own records, god view: who is where, alive, purse, whether you know) | board (only what reached you: kind, text, the channel and who told you, how old, how far, time left or EXPIRED, what you since learned of how it went) | hear channel=bar|board|radio|rider (do the real act: buy a drink from the barkeep you stand at, read the board in the bar, listen on the set you have, let a rider talk) | spawn kind=hitchhiker|stranded|caravan|refugees|trader|wreck (a road birth by the law: on the road near you, out of sight; seed= cor= s=) | call kind=medic (a radio call from a real place out of sight) | post kind=bounty|work|missing town= (a town posts it on its board) | facts holder= (a holder\'s copies: player, town:<id>, bar:<id>, board:<id>, p:<pull>:<n>) | knows holder= fact= | wire fact= (the grapevine trucks carrying it, and when each lands) | wait hours= (the world clock forward, honestly) | ride id= | help id= | buy id= item= | drink | cards n= | hire n= | bars | view id= | validate | stats.',
      args: { action: { type: 'string', default: 'board', enum: ['list', 'board', 'hear', 'spawn', 'call', 'post', 'facts', 'knows', 'wire', 'wait', 'ride', 'help', 'buy', 'drink', 'cards', 'hire', 'bars', 'view', 'validate', 'stats'] },
        channel: { type: 'string', enum: ['bar', 'board', 'radio', 'rider'] }, kind: { type: 'string' }, id: { type: 'string' }, holder: { type: 'string', default: 'player' }, fact: { type: 'string' },
        town: { type: 'string' }, seed: { type: 'number' }, cor: { type: 'string' }, s: { type: 'number' }, hours: { type: 'number', default: 1 }, item: { type: 'string' }, n: { type: 'number', default: 0 }, all: { type: 'boolean', default: false } },
      run: async ({ action, channel, kind, id, holder, fact, town, seed, cor, s, hours, item, n, all }) => {
        const S = P(); need(S, 'the pulls system is not running');
        const K = S.k;
        const nearBar = () => { const p = g.player; let best = null, bd = 4; for (const b of S.bars.values()) { const c = b.keep.c; if (!c?.alive) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = b; } } return best; };
        if (action === 'list') return { hours: r1(S.hours()), pulls: S.list.map((r) => S.view(r)), note: 'the world\'s own records (god view); the player\'s board is action=board' };
        if (action === 'board') return { hours: r1(S.hours()), board: S.board({ all }), chip: S.chip() };
        if (action === 'spawn') { need(PULL_KINDS[kind]?.road, `kind= one of ${Object.keys(PULL_KINDS).filter((k) => PULL_KINDS[k].road).join(', ')}`); const r = S.birth(kind, { seed: seed ?? null, force: true, cor: cor ?? null, s: s ?? null }); need(r.ok, r.why); return S.view(r.rec); }
        if (action === 'call') { const r = S.call(kind ?? 'medic', { seed: seed ?? null }); need(r.ok, r.why); return S.view(r.rec); }
        if (action === 'post') { const r = S.post(kind, town ?? null, { seed: seed ?? null }); need(r.ok, r.why); return S.view(r.rec); }
        if (action === 'facts') { const h = K.holders.get(holder); need(h, `no holder ${holder}`); const me = S.me(); return { holder: h.id, name: h.name, facts: h.facts.map((c) => K.view(c, me.x, me.z)) }; }
        if (action === 'knows') return { holder, fact, holds: K.holds(holder, fact), copy: K.copyOf(holder, fact) };
        if (action === 'wire') return { fact, inFlight: K.inFlight(fact), hours: r1(S.hours()) };
        if (action === 'wait') { const h = await waitHours(g, Math.max(0, Math.min(240, hours))); return { hours: r1(h), board: S.board().length }; }
        if (action === 'ride') { const rec = S.byId(id); need(rec, 'id= a pull'); const r = S.offerRide(rec); need(r.ok, r.why); return S.view(rec); }
        if (action === 'help') { const r = S.help(id); need(r.ok, r.why); return r; }
        if (action === 'buy') { const r = S.buy(id, item); need(r.ok, r.why); return r; }
        if (action === 'bars') return { bars: [...S.bars.values()].map((b) => ({ id: b.id, town: b.town, name: b.name, x: Math.round(b.x), z: Math.round(b.z), stock: b.stock, till: b.till, live: b.live, keep: b.keep.c?.id ?? null, drinkers: b.drinkers.map((d) => ({ n: d.n, name: d.name, gun: d.gun, purse: d.purse, hired: d.hired, c: d.c?.id ?? null })), holds: K.holders.get(`bar:${b.id}`)?.facts.length ?? 0 })) };
        if (action === 'view') { const rec = S.byId(id); need(rec, 'id= a pull'); return S.view(rec); }
        if (action === 'validate') return { knowledge: validateKnowledge(), pulls: validatePulls(PULL_KINDS, ITEMS) };
        if (action === 'stats') return { ...S.stats, knowledge: K.stats, records: S.list.length, holders: K.holders.size, facts: K.facts.size, wire: K.wireQ.length };
        if (action === 'drink' || (action === 'hear' && channel === 'bar')) { const b = nearBar(); need(b, 'stand at a barkeep (within 4 m)'); const r = S.drink(b.id); need(r.ok, r.why); return { ...r, bar: b.id, fact: r.fact ? K.view(r.fact) : null }; }
        if (action === 'cards') { const b = nearBar(); need(b, 'stand in a bar'); const r = S.cards(b.id, n); need(r.ok, r.why); return r; }
        if (action === 'hire') { const b = nearBar(); need(b, 'stand in a bar'); const r = S.hire(b.id, n); need(r.ok, r.why); return r; }
        if (action === 'hear') {
          need(channel, 'channel= bar|board|radio|rider');
          if (channel === 'board') { const b = nearBar(); need(b, 'the board hangs in a bar: stand at the barkeep'); return { read: S.readBoard(b.town).map((c) => K.view(c)) }; }
          if (channel === 'radio') { const r = S.listen(); need(r.ok, r.why); for (const rec of S.list) if (rec.radioAt !== undefined) rec.radioAt = Math.min(rec.radioAt, S.hours()); S.tick(0); return { heard: [...new Set([...r.heard, ...S.board().filter((x) => x.channel === 'radio').map((x) => x.id)])] }; }
          if (channel === 'rider') { const rec = S.list.find((x) => x.state === 'riding'); need(rec, 'nobody is riding with you'); const p = rec.people.find((q) => q.c?.inVehicle); const r = S.tellPlayer(`p:${rec.id}:${p.n}`); return { told: r ? K.view(r) : null }; }
        }
        return { ok: false, error: `unknown action ${action}` };
      },
    },
  };
}

// ---- the selftest -----------------------------------------------------------------------------------------------------------
export async function pullsChecks(api, check, C) {
  const g = api.g, S = g.pulls, K = S.k, p = g.player;
  const sv = (await C('save')).save;
  const was = { zombies: g.zombies.enabled, raiders: g.raiderTimer, convoyNext: g.convoy.next, grapevine: g.grapevine?.enabled, director: g.society.director.paused, cash: g.cash };
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.convoy.despawn?.(); g.convoy.next = 1e9; if (g.grapevine) g.grapevine.enabled = false; g.society.director.paused = true;
  const I10 = S.cor('I-10');
  const stageS = 37600; // the I-10, four km west of the island: open road between Phoenix and the dead suburbs
  const out = async () => { if (p.inVehicle) g.exitVehicle(true); if (!p.alive) { g.respawnT = 0; await C('step', { seconds: 0.3 }); } };
  const stand = async (x, z) => { await out(); await C('teleport', { x, z }); g.camLook.x = p.x; g.camLook.z = p.z; await C('step', { seconds: 0.2 }); };
  const atRoad = async (s, side = -1, off = 0) => { const q = S.onRoad(I10, s, side); await stand(q.x + off, q.z); return q; };
  const forget = (recs) => { for (const rec of recs) { S.demote(rec); rec.state = 'gone'; } S.list = S.list.filter((r) => !recs.includes(r)); };
  const madeBy = [];
  const born = (r) => { if (r.ok) madeBy.push(r.rec); return r; };
  try {
    await check('pulls: the rows validate - every channel has a confidence and a reach, every pull kind is a fact kind heard by real channels, with real items and sane ranges', async () => {
      const a = validateKnowledge(), b = validatePulls(PULL_KINDS, ITEMS);
      // and a broken row is caught
      const bad = validatePulls({ hitchhiker: { ...PULL_KINDS.hitchhiker, heard: ['telepathy'], items: [['moonbeam', 1, 2]] } }, ITEMS);
      return a.ok && b.ok && !bad.ok && bad.errors.length >= 2 ? true : JSON.stringify({ a: a.errors, b: b.errors, bad: bad.errors });
    });

    await check('pulls: no road person spawns inside the player\'s view - 60 births on the road round you, each one past the birth radius, out of sight, on the shoulder of a real road', async () => {
      const bad = [], made = [];
      for (let k = 0; k < 6; k++) {
        await atRoad(stageS - k * 900, k % 2 ? 1 : -1, 8);
        for (let i = 0; i < 10; i++) {
          const r = S.birth(['hitchhiker', 'stranded', 'caravan', 'refugees', 'trader', 'wreck'][i % 6], { seed: 1000 + k * 37 + i, force: true });
          if (!r.ok) continue;
          made.push(r.rec);
          const rec = r.rec, me = S.me(), d = Math.hypot(rec.x - me.x, rec.z - me.z), pr = I10.project(rec.x, rec.z, 200), edge = S.halfW(I10) + R.shoulder;
          if (d < R.birthR[0] || S.inView(rec.x, rec.z) || !pr || Math.abs(pr.d - edge) > 2 || rec.live) bad.push({ id: rec.id, d: Math.round(d), view: S.inView(rec.x, rec.z), road: pr && r1(pr.d), edge: r1(edge) });
        }
      }
      const n = made.length;
      forget(made);
      return n >= 50 && !bad.length ? true : JSON.stringify({ n, bad: bad.slice(0, 5) });
    });

    await check('pulls: a fact the player never heard is not on the board - a hitchhiker born out of reach is known to their town, not to you; a stranded driver\'s CB reaches you only with a set inside its range', async () => {
      await atRoad(stageS, -1, 8);
      const h = born(S.birth('hitchhiker', { seed: 4242, force: true })).rec;
      const st = born(S.birth('stranded', { seed: 777, force: true })).rec;
      const town = h.from ? `town:${h.from}` : null;
      const onBoard = () => S.board().some((r) => r.subject === h.id);
      const townKnows = town ? K.holds(town, h.fact) : true;
      // on foot, no set: the stranded driver's call goes out and you do not hear it
      g.inventory.carried.slots = g.inventory.carried.slots.filter((x) => x.id !== 'radio_portable');
      st.radioAt = S.hours(); S.tick(0);
      const deaf = !K.holds('player', st.fact);
      // in a car: the set is on (the next call)
      const q = S.onRoad(I10, stageS, -1);
      const car = g.vehiclesSys.spawn('sedan', q.x + 4, q.z, 0, '#5a4a3a'); g.enterVehicle(car); await C('step', { seconds: 0.2 });
      st.radioAt = S.hours(); S.tick(0);
      const row = S.board().find((r) => r.subject === st.id);
      const d = Math.round(Math.hypot(st.x - car.x, st.z - car.z));
      g.exitVehicle(true); g.vehiclesSys.remove(car);
      const ok = !onBoard() && !K.holds('player', h.fact) && townKnows && deaf && row && row.channel === 'radio' && Math.abs(row.distM - d) < 30 && row.from;
      return ok ? true : JSON.stringify({ onBoard: onBoard(), townKnows, deaf, row, d });
    });

    await check('pulls: a hitchhiker left behind is further down the road later - walking the shoulder toward their town at the walk pace, on the world clock', async () => {
      await atRoad(stageS, -1, 8);
      const h = born(S.birth('hitchhiker', { seed: 9090, force: true })).rec;
      const s0 = h.s, dir = h.dir, to = S.node(h.to);
      await waitHours(g, 2);
      const moved = h.s - s0, want = dir * S.walkPerHour() * 2, pr = I10.project(h.x, h.z, 200), edge = S.halfW(I10) + R.shoulder;
      const ok = h.state === 'walking' && Math.abs(moved - want) < 2 && Math.sign(moved) === dir && pr && Math.abs(pr.d - edge) < 2 && to && Math.sign(to.s - s0) === dir;
      return ok ? true : JSON.stringify({ state: h.state, s0: Math.round(s0), s: Math.round(h.s), moved: r1(moved), want: r1(want), road: pr && r1(pr.d), to: to?.id });
    });

    await check('pulls: a picked-up hitchhiker rides in a real seat - boards the passenger seat of your car, talks on the way, and pays out of their own purse when let out by their town', async () => {
      await atRoad(stageS, -1, 8);
      const h = born(S.birth('hitchhiker', { seed: 5151, force: true })).rec;
      const pp = h.people[0]; pp.rob = false; pp.weapon = null; pp.pay = Math.min(pp.purse, Math.max(pp.pay, 10));
      // come up the road toward them (out of sight first: they are promoted, never popped in front of you)
      const ahead = S.onRoad(I10, h.s - h.dir * 140, h.side);
      await stand(ahead.x, ahead.z); await C('step', { seconds: 0.6 });
      const promotedOut = h.live && pp.c && Math.hypot(pp.c.x - p.x, pp.c.z - p.z) > 100;
      const c = pp.c; if (!c) return JSON.stringify({ live: h.live, why: 'not promoted' });
      await stand(c.x + 3, c.z + 1);
      const car = g.vehiclesSys.spawn('pickup', c.x + 1.5, c.z + 2.5, 0, '#6a4a2a'); g.lastVehicle = car; await C('step', { seconds: 0.2 });
      const r = S.offerRide(h, car);
      for (let i = 0; i < 20 && h.state !== 'riding'; i++) await C('step', { seconds: 0.25 });
      const seat = c.seat, seated = c.inVehicle === car && car.occ?.[seat] === c && seat > 0 && h.state === 'riding';
      g.enterVehicle(car); await C('step', { seconds: 0.2 });
      // drive them home: the car by their town, stopped
      const to = S.node(h.to), cash0 = g.cash, purse0 = pp.purse, pay = pp.pay;
      car.x = to.x + 120; car.z = to.z; car.vx = 0; car.vz = 0; p.x = car.x; p.z = car.z; g.camLook.x = car.x; g.camLook.z = car.z;
      S.tick(0); await C('step', { seconds: 0.3 });
      const paid = g.cash === cash0 + pay && pp.purse === purse0 - pay && !c.inVehicle && (h.state === 'arrived' || h.state === 'gone');
      g.exitVehicle(true); g.vehiclesSys.remove(car);
      return r.ok && promotedOut && seated && paid ? true : JSON.stringify({ r, promotedOut, seat, seated, state: h.state, cash: [cash0, g.cash], purse: [purse0, pp.purse], pay });
    });

    await check('pulls: a medic call expires and the caller dies if nobody comes - you hear it on a set, the board runs the window out to EXPIRED, and the death is yours to know only once you see the body (what they carried is on it)', async () => {
      await atRoad(stageS, -1, 8);
      g.inventory.add(g.inventory.carried, 'radio_portable', 1);
      const m = born(S.call('medic', { seed: 6161 })).rec;
      S.tick(0);
      const heard = JSON.parse(JSON.stringify(K.copyOf('player', m.fact)));
      const row0 = S.board().find((r) => r.subject === m.id);
      await waitHours(g, m.deadline - S.hours() + 0.3);
      const dead = m.state === 'dead' && m.people.every((q) => q.dead);
      const row1 = S.board().find((r) => r.subject === m.id);
      const unknown = row1 && row1.expired && !row1.outcome && !K.holds('player', m.outcome);
      // go and look: up to them from out of sight, then close
      const dir = Math.atan2(m.x - p.x, m.z - p.z);
      await stand(m.x - Math.sin(dir) * 130, m.z - Math.cos(dir) * 130); await C('step', { seconds: 0.6 });
      const body = m.people[0].c;
      if (body) await stand(body.x + 4, body.z + 2);
      await C('step', { seconds: 0.6 });
      const row2 = S.board().find((r) => r.subject === m.id);
      const box = body && g.inventory.boxes.get(`body:${body.id}`);
      const carried = m.people[0].items.every(([it, n]) => (box?.count(it) ?? 0) >= n) && box?.rolled;
      g.inventory.spend('radio_portable', 1);
      const ok = heard?.source.channel === 'radio' && row0 && !row0.expired && dead && unknown && body && !body.alive && row2?.outcome && /died/i.test(row2.outcome) && carried;
      return ok ? true : JSON.stringify({ heard: heard?.source, row0, dead, state: m.state, row1, row2, body: !!body, carried, items: m.people[0].items, box: box?.slots });
    });

    await check('pulls: a grapevine fact reaches the next town only after travel time - posted in one town, it is in the next only once the road between them is driven at the grapevine\'s pace', async () => {
      const A = S.node('cg-237') ?? S.nodes().find((n) => n.cor === 'I-10' && n.id !== 'rust_haven');
      const r = born(S.post('work', A.id, { seed: 31 }));
      if (!r.ok) return `post: ${r.why}`;
      const f = r.rec.fact, nb = S.neighbours(A);
      const now0 = S.hours();
      await waitHours(g, 1.05, 0.05); // the hour's trucks leave
      const W = K.wireQ.filter((w) => w.fid === f);
      if (!W.length) return JSON.stringify({ why: 'no truck left', nb: nb.map((n) => n.id) });
      const w = W.sort((a, b) => a.at - b.at)[0], B = w.to, km = Math.hypot(S.node(B.slice(5)).x - A.x, S.node(B.slice(5)).z - A.z), want = km / CHANNELS.grapevine.speed;
      const before = w.at - 0.15 > S.hours() ? (await waitHours(g, w.at - 0.15 - S.hours(), 0.05), !K.holds(B, f)) : 'too short';
      await waitHours(g, 0.3, 0.05);
      const after = K.holds(B, f), copy = K.copyOf(B, f);
      const ok = before === true && after && copy?.source.channel === 'grapevine' && Math.abs(w.at - w.sent - want) < 0.01 && w.sent >= now0;
      return ok ? true : JSON.stringify({ before, after, at: r1(w.at), sent: r1(w.sent), want: r1(want), km: Math.round(km), src: copy?.source });
    });

    await check('pulls: a rumour bought in a bar is a fact the barkeep actually holds - a real bottle off the bar\'s own shelf, the cash in its till, and a copy whose source is that barkeep', async () => {
      const spot = freeSpot(g, -4000, 9000, 280);
      if (!spot) return 'no free ground for a town';
      let t = null, B = null;
      for (const [arch, seed] of [['badlands_crossroads', 4411], ['alpine_mining_stack', 52], ['military_town', 7], ['badlands_crossroads', 913], ['port_wharf', 21]]) {
        t = g.citygen.stampAt({ id: 'cg-pulls', arch, seed, x: spot.x, z: spot.z });
        B = t.T.buildings.find((b) => b.kind === 'saloon' && !b.ruined);
        if (B) break;
      }
      if (!B) { g.citygen.remove('cg-pulls'); return 'the stamp has no saloon'; }
      const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
      await stand(cx + 60, cz + 60); S.tick(0); await C('step', { seconds: 0.5 });
      // the town hears something (a missing person posted), and the barkeep hears what is said in town
      const post = born(S.post('missing', 'cg-pulls', { seed: 17 }));
      S.tick(0);
      const bar = S.bars.get(B.id), keep = bar?.keep.c;
      if (!keep) { g.citygen.remove('cg-pulls'); return JSON.stringify({ bar: !!bar, live: bar?.live }); }
      await stand(keep.x + 1.2, keep.z + 0.6);
      const stock0 = bar.stock, till0 = bar.till, bottles0 = g.inventory.carried.count(BAR.drink); g.cash = Math.max(g.cash, 50); const cash0 = g.cash;
      const keepHeld = post.ok && K.holds(`bar:${bar.id}`, post.rec.fact);
      const r = await C('pulls', { action: 'hear', channel: 'bar' });
      const copy = r.fact && K.copyOf('player', r.fact.id);
      const ok = r.ok && keepHeld && r.fact && K.holds(`bar:${bar.id}`, r.fact.id) && copy?.source.from === `bar:${bar.id}` && copy.source.channel === 'said'
        && bar.stock === stock0 - 1 && bar.till === till0 + BAR.price && g.cash === cash0 - BAR.price && g.inventory.carried.count(BAR.drink) === bottles0 + 1;
      // a barkeep who holds nothing new tells you nothing (no fact is made up to sell)
      const P0 = K.holders.get('player').facts.length;
      for (let i = 0; i < 12 && bar.stock > 0; i++) S.drink(bar.id);
      const fresh = K.holders.get(`bar:${bar.id}`).facts.filter((c) => !K.holds('player', c.id)).length;
      const minted = K.holders.get('player').facts.length - P0 > K.holders.get(`bar:${bar.id}`).facts.length;
      await out(); g.citygen.remove('cg-pulls');
      return ok && fresh === 0 && !minted ? true : JSON.stringify({ r, keepHeld, copy: copy?.source, stock: [stock0, bar.stock], till: [till0, bar.till], cash: [cash0, g.cash], fresh, minted });
    });

    await check('pulls: a death is news through the death rites - nothing in town before the family learns it; once they do (told by a neighbour), their town holds it as said, the funeral is word in town with its own end, and the next town has it only by the grapevine', async () => {
      const RS = g.residents, RT = g.rites;
      if (!RS || !RT) return 'no residents or rites';
      const pickRec = () => [...RS.recs.values()].find((r) => r.kind === 'family' && r.members?.some((m) => !m.dead)) ?? [...RS.recs.values()].find((r) => r.members?.some((m) => !m.dead));
      let rec = pickRec();
      for (const [hx, hz] of [[620, 40], [-640, 60], [40, 620]]) { if (rec) break; await stand(hx, hz); await C('step', { seconds: 3 }); rec = pickRec(); } // the ring's households are on record once their chunks are hot
      if (!rec) return `no household on record (${RS.recs.size})`;
      const now = S.hours(), x = (rec.x0 + rec.x1) / 2 + 40, z = (rec.z0 + rec.z1) / 2;
      const R = { id: 'pulls-test-body', name: 'Wes Hollis', flag: 'US', x, z, y: 0, at: now, stage: 0, decay: 0, c: null, by: 'unknown', place: null, house: rec.id, member: null,
        news: { house: rec.id, facts: [], learned: null, w: [], named: false, at: now, told: false, standing: false } };
      RT.bodies.set(R.id, R); RT.news.push(R);
      const n = S.nearestNode(x, z), town = `town:${n.id}`;
      const before = !K.holds(town, `death:${R.id}`);
      const r = RT.tell(R, 'a neighbour');
      const copy = K.copyOf(town, `death:${R.id}`), F = RT.funerals.find((q) => q.body === R.id), fc = F && K.copyOf(town, F.id);
      const other = S.neighbours(n)[0], otherBefore = other ? !K.holds(`town:${other.id}`, `death:${R.id}`) : true;
      await waitHours(g, 1.05, 0.05);
      const w = K.wireQ.find((q) => q.fid === `death:${R.id}`);
      const ok = before && r.ok && copy?.source.channel === 'said' && copy.source.fromName === 'a neighbour' && F && fc && fc.ends === F.end && otherBefore && (!other || (w && w.at > S.hours()));
      RT.bodies.delete(R.id); RT.news = RT.news.filter((q) => q !== R); RT.funerals = RT.funerals.filter((q) => q !== F);
      return ok ? true : JSON.stringify({ before, r: r.ok ?? r.why, copy: copy?.source, F: !!F, fc: fc && { ends: fc.ends, F: F?.end }, other: other?.id, otherBefore, w: w && { at: w.at, now: S.hours() } });
    });

    await check('pulls: rewards come out of real stock - a trader\'s cart sells from its own count into your pack, your cash into their purse; the board and the HUD chip show what reached you', async () => {
      await atRoad(stageS, -1, 8);
      const tr = born(S.birth('trader', { seed: 2323, force: true })).rec;
      const ahead = S.onRoad(I10, tr.s - tr.dir * 140, tr.side);
      await stand(ahead.x, ahead.z); await C('step', { seconds: 0.6 });
      const c = tr.people[0].c; if (!c) return 'not promoted';
      await stand(c.x + 2, c.z + 1); await C('step', { seconds: 0.3 });
      g.inventory.carried.slots = g.inventory.carried.slots.filter((x) => ITEMS[x.id]?.kind === 'water'); g.inventory.changed(); // room in the pack (staging; the battery's save comes back after)
      const row = tr.stock.find((x) => x[1] > 0), it = row?.[0], n0 = row?.[1], have0 = g.inventory.carried.count(it), purse0 = tr.people[0].purse;
      g.cash = 500;
      const r = S.buy(tr.id, it);
      S.tick(0); // the sighting is the pulls tick's (twice a second): one now, before reading the board
      const seen = S.board().find((x) => x.subject === tr.id);
      g.pullsUI.refresh();
      const chip = g.pullsUI.chipEl?.querySelector('b')?.textContent;
      const ok = r.ok && row[1] === n0 - 1 && g.inventory.carried.count(it) === have0 + 1 && tr.people[0].purse === purse0 + r.cost && g.cash === 500 - r.cost && seen?.channel === 'saw' && Number(chip) >= 1;
      return ok ? true : JSON.stringify({ r, it, n: [n0, row?.[1]], purse: [purse0, tr.people[0].purse], seen, chip, d: r1(Math.hypot(c.x - p.x, c.z - p.z)), sees: g.sees(p, c), night: g.sky.night, live: tr.live, alive: c.alive, inCar: !!p.inVehicle, holds: K.holds('player', tr.fact) });
    });
  } finally {
    forget(madeBy);
    g.zombies.enabled = was.zombies; g.raiderTimer = was.raiders; g.convoy.next = was.convoyNext; if (g.grapevine) g.grapevine.enabled = was.grapevine; g.society.director.paused = was.director;
    await out();
    await C('load', { save: sv });
  }
}
