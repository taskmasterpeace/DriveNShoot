// SITE STORIES + THE TALLY as COMMANDS rows and selftest checks (docs/design/WEB_SITE_STORIES.md). buildCommands() in
// api.js spreads siteStoriesCommands after the citygen rows: `site` keeps its stamping (id= at=) and gains
// action=state|story|log; `bounty` is the guild. runSelfTest() calls siteStoriesChecks in a stage of its own (the system
// is off for the rest of the battery) and loads the battery's save after.
import { citygenCommands } from './citygen-api.js';
import { validateSiteStories, GOODS, MOVERS, GUILD, PROBLEMS, STORY_RULES } from '../data/sitestories.js';
import { ITEMS } from '../data/items.js';

const r1 = (v) => Math.round(v * 10) / 10;

// The world clock forward, honestly: the sky's hour, the day (society), the pulls (grapevine, road people) and the
// stories ticking on the way. each(hours) runs after every step (return false to stop).
export async function waitStory(g, hours, stepH = 0.25, each = null) {
  let left = hours;
  while (left > 1e-6) {
    const h = Math.min(stepH, left); left -= h;
    g.sky.time += h; if (g.sky.time >= 24) g.sky.time -= 24;
    g.society.update(0);
    g.pulls.tick(0);
    g.stories.tick();
    if (each && each(g.pulls.hours()) === false) break;
  }
  return g.pulls.hours();
}

export function siteStoriesCommands(api, need) {
  const g = api.g, S = () => g.stories;
  const base = citygenCommands(api, need).site;
  const me = () => g.pulls.me();
  const placeOf = (id) => { const P = S(); P.ensure(); const m = me(); return id ? P.place(id) ?? [...P.places.values()].find((p) => p.name.toLowerCase() === String(id).toLowerCase()) : P.nearestPlace(m.x, m.z); };
  return {
    site: {
      ...base,
      desc: `${base.desc} SITE STORIES (docs/design/WEB_SITE_STORIES.md; rows data/sitestories.js): action=state id= (a place's living state: owner, problem, people, stock and prices, coin, defense, its links, who is on the road to and from it; no id: the nearest; all=true: every place in brief) | story (the stories: arcs of linked chronicle rows, each with its cause; id=<arc> or place=<id>; default the newest) | log (the story rows in the chronicle, newest first; limit=) | movers (every party on the roads: kind, from, to, how far along, load, who) | send kind=trader|raiders|refugees|allies|seekers from= to= (a party leaves now by the law: on the real road) | trouble id= problem=${Object.keys(PROBLEMS).join('|')} | wait hours= (the world clock forward, honestly) | validate.`,
      args: { ...base.args, action: { type: 'string', enum: ['stamp', 'state', 'story', 'log', 'movers', 'send', 'trouble', 'wait', 'validate'] }, place: { type: 'string' }, kind: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, problem: { type: 'string' }, hours: { type: 'number', default: 1 }, limit: { type: 'number', default: 20 }, all: { type: 'boolean', default: false } },
      run: async (a) => {
        const { action, id, place, kind, from, to, problem, hours, limit = 20, all } = a;
        if (!action || action === 'stamp') return base.run(a);
        const P = S(); need(P?.ensure(), 'site stories are not ready (no plan yet)');
        if (action === 'validate') return validateSiteStories(undefined, ITEMS);
        if (action === 'state') {
          if (all) return { hours: r1(P.hours()), places: [...P.places.values()].filter((p) => !p.spot).map((p) => ({ id: p.id, name: p.name, kind: p.kind, owner: p.owner.name, pop: Math.round(p.pop), fallen: p.fallen, problem: p.problem?.kind ?? null, beyond: p.beyond })) };
          const p = placeOf(id); need(p, `no place ${id}`);
          return { hours: r1(P.hours()), ...P.pview(p), story: p.arc ? P.arcView(P.arcs.find((x) => x.id === p.arc) ?? { id: p.arc, rows: [] }) : null };
        }
        if (action === 'story') {
          if (id) { const A = P.arcs.find((x) => x.id === id); need(A, `no story ${id}`); return P.arcView(A); }
          const L = place ? P.arcs.filter((x) => x.rows.some((r) => r.place === place)) : P.arcs;
          return { stories: L.slice(-Math.max(1, limit)).reverse().map((x) => P.arcView(x)) };
        }
        if (action === 'log') return { rows: g.society.chronicle.query({ limit: 512 }).filter((r) => r.src === 'story').slice(0, limit).map((r) => ({ seq: r.seq, day: r.day, hr: r.hr, arc: r.a, v: r.v, place: r.p, on: r.on, other: r.o, m: r.m })) };
        if (action === 'movers') return { hours: r1(P.hours()), movers: P.movers.filter((m) => all || m.state !== 'gone').map((m) => P.mview(m)) };
        if (action === 'send') {
          need(MOVERS[kind] && kind !== 'hunters', `kind= one of ${Object.keys(MOVERS).filter((k) => k !== 'hunters').join(', ')}`);
          const A = placeOf(from), B = placeOf(to); need(A && B && A !== B, 'from= and to= two places');
          if (kind === 'trader') { const r = P.trade(A, Math.random); need(r, `${A.name} has no surplus a neighbour would pay for`); return P.mview(r); }
          if (kind === 'raiders') { const r = P.raid(A, B); need(r, `${A.name} has no fighters to spare`); return P.mview(r); }
          return P.mview(P.send(kind, A, B, {}));
        }
        if (action === 'trouble') { const p = placeOf(id); need(p && PROBLEMS[problem], `id= a place, problem= ${Object.keys(PROBLEMS).join('|')}`); const r = P.trouble(p, problem); need(r, `${problem} could not come to ${p.name}`); return { row: r, state: P.pview(p) }; }
        if (action === 'wait') { const h = await waitStory(g, Math.max(0, Math.min(240, hours))); return { hours: r1(h), stats: P.stats }; }
        return { ok: false, error: `unknown action ${action}` };
      },
    },
    bounty: {
      group: 'world',
      desc: `THE TALLY, the bounty hunters' guild (docs/design/WEB_SITE_STORIES.md §3.4; rows data/sitestories.js GUILD). Halls in ${GUILD.halls} towns, boards in every place. action=board (what the board where you stand holds, and every posting you hold: only what reached you) | post target=player|<place id of a fallen place's master> by=<place> deed=<chronicle seq> pay= (a real person posts a real deed, paid out of their real chest into escrow) | take id= (at a board that has it pinned) | claim id= (the mark dead by your hand: collect at a Tally House) | pay id= (your own name off the board at a Tally House: ${GUILD.payOff}x, to the poster) | hunters (every pair: where, contract, the tip they ride on and who told them, what they know) | list (the guild's own book, god view).`,
      args: { action: { type: 'string', default: 'board', enum: ['board', 'post', 'take', 'claim', 'pay', 'hunters', 'list'] }, id: { type: 'string' }, target: { type: 'string' }, by: { type: 'string' }, deed: { type: 'number' }, pay: { type: 'number', default: 80 } },
      run: async ({ action = 'board', id, target, by, deed, pay = 80 }) => {
        const P = S(); need(P?.ensure(), 'site stories are not ready (no plan yet)');
        const K = P.k, m = me();
        if (action === 'list') return { halls: P.halls, bounties: P.bounties.map((b) => P.bview(b)) };
        if (action === 'hunters') return { hours: r1(P.hours()), hunters: P.movers.filter((x) => x.kind === 'hunters').map((x) => ({ ...P.mview(x), km: r1(Math.hypot(x.x - m.x, x.z - m.z) / 1000) })) };
        if (action === 'board') {
          const t = P.townAt(m.x, m.z), bd = t ? K.holders.get(P.boardOf(t)) : null;
          return { at: t?.name ?? null, hall: !!(t && P.isHall(t.id)), board: bd ? bd.facts.map((c) => K.view(c, m.x, m.z)) : [], yours: K.holder('player').facts.filter((c) => c.what === 'posting').map((c) => K.view(c, m.x, m.z)) };
        }
        if (action === 'post') {
          const at = placeOf(by); need(at, 'by= the place that posts it');
          need(deed, 'deed= the chronicle row of the deed');
          let tg;
          if (target === 'player' || !target) tg = { kind: 'player', name: P.youName() };
          else { const q = P.place(target); need(q?.garrison?.alive, `${target} has no living master to post`); tg = { kind: 'npc', place: q.id, name: q.garrison.name }; }
          const r = P.post({ target: tg, by: { name: at.name, place: at.id }, deed: { seq: deed, verb: 'deed', text: `the deed of record ${deed}` }, pay });
          need(r.ok, r.why);
          if (tg.kind === 'npc') P.place(target).garrison.bounty = r.bounty.id;
          return P.bview(r.bounty);
        }
        need(id, 'id= a bounty');
        const r = action === 'take' ? P.take(id) : action === 'claim' ? P.claim(id) : action === 'pay' ? P.payOff(id) : { ok: false, why: `unknown action ${action}` };
        need(r.ok, r.why);
        return r;
      },
    },
  };
}

// ---- the selftest's checks ------------------------------------------------------------------------------------------------
export async function siteStoriesChecks(api, check0, C) {
  // each check's wall time kept on the system (stories.checkMs), so a slow one shows itself
  const check = (name, fn) => check0(name, async () => { const t = performance.now(); try { return await fn(); } finally { (api.g.stories.checkMs ??= {})[name.slice(9, 50)] = Math.round(performance.now() - t); } });
  const g = api.g, S = g.stories, K = g.pulls.k, p = g.player;
  const sv = (await C('save')).save;
  const was = { zombies: g.zombies.enabled, raiders: g.raiderTimer, convoyNext: g.convoy.next, grapevine: g.grapevine?.enabled, director: g.society.director.paused, pulls: g.pulls.enabled, cash: g.cash };
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.convoy.despawn?.(); g.convoy.next = 1e9; if (g.grapevine) g.grapevine.enabled = false; g.society.director.paused = true;
  g.pulls.enabled = true; S.enabled = true; S.ensure(); S.tick(); // on again: its clock starts from this hour
  const out = async () => { if (p.inVehicle) g.exitVehicle(true); if (!p.alive) { g.respawnT = 0; await C('step', { seconds: 0.3 }); } };
  const stand = async (x, z) => { await out(); await C('teleport', { x, z }); g.camLook.x = p.x; g.camLook.z = p.z; await C('step', { seconds: 0.2 }); };
  // keep the world's own parties out of the way of a staged one (they would fill the live slots and the road)
  // a town (or else any peopled place) a place trades with: its links, nearest first (not Rust Haven, the town you stand
  // by: a truck you watch drives on frames, not on the clock)
  const linkedTown = (A) => { const L = S.linksOf(A).map((id) => S.place(id)).filter((q) => q && !q.fallen && q.pop > 0 && !S.raids(q) && !q.beyond && q.id !== 'rust_haven'); return L.find((q) => q.kind === 'town') ?? L[0] ?? null; };
  // two linked towns on a corridor, both kilometres from you (a truck you watch drives on frames, not on the clock)
  const townPair = () => {
    for (const A of S.places.values()) {
      if (A.kind !== 'town' || A.beyond || A.fallen || A.id === 'rust_haven' || Math.hypot(A.x - p.x, A.z - p.z) < 3000) continue;
      const B = S.linksOf(A).map((id) => S.place(id)).find((q) => q && q.kind === 'town' && !q.beyond && !q.fallen && q.id !== 'rust_haven' && Math.hypot(q.x - p.x, q.z - p.z) > 3000);
      if (B) return [A, B];
    }
    return [null, null];
  };
  const quiet = () => { S.hold = true; for (const m of S.movers) if (m.kind !== 'hunters' && m.state === 'road') { if (m.live) S.demote(m); m.state = 'gone'; } S.movers = S.movers.filter((m) => m.state !== 'gone'); };
  try {
    await check('stories: the rows validate - goods are real items, every place kind makes known goods and stands a guard, every problem names its place and runs its course, movers fit their cars, the guild is not purple; a broken row is caught', async () => {
      const ok = validateSiteStories(undefined, ITEMS);
      const bad = validateSiteStories({ STORY_RULES: { ...STORY_RULES, promoteR: 400 }, GOODS: { ...GOODS, food: { ...GOODS.food, item: 'no_such_item' } }, PLACE_KINDS: { x: { make: { gold: 1 }, guard: 2 } }, PROBLEMS: { p: { chance: 0.5, kills: 0, word: 'no place', lasts: [0, 0] } }, MOVERS: { m: { on: 'fly', people: [0, 9] } }, ECON: { fallAt: 2 }, STORY_VERBS: {}, STORY_FACT_KINDS: {}, GUILD: { ...GUILD, color: '#8a2be2' } }, ITEMS);
      const caught = ['promoteR', 'no_such_item', 'gold', 'guard', 'chance', 'name {place}', 'lasts', 'on must', 'people', 'fallAt', 'purple'].filter((w) => !bad.errors.some((e) => e.includes(w)));
      return ok.ok && !bad.ok && !caught.length ? true : JSON.stringify({ ok: ok.errors, missed: caught });
    });

    await check('stories: every planned town, site and camp has a living state (an owner, people, stock with a price, a clock); three Tally Houses and their hunters stand in towns', async () => {
      const L = [...S.places.values()].filter((q) => !q.spot), towns = L.filter((q) => q.kind === 'town'), sites = L.filter((q) => q.site);
      const bad = L.filter((q) => !q.owner?.kind || !Number.isFinite(q.pop) || Object.keys(GOODS).some((k) => !Number.isFinite(q.stock[k]) || !(q.price[k] > 0)));
      const hunters = S.movers.filter((m) => m.kind === 'hunters');
      const ok = towns.length === g.pulls.nodes().length && sites.length === g.citygen.plan.filter((r) => r.kind === 'site').length && !bad.length && S.halls.length === GUILD.halls && S.halls.every((h) => S.place(h)?.kind === 'town') && hunters.length === GUILD.halls * GUILD.hunters && hunters.every((m) => m.people.every((q) => q.flag && q.flag.length === 2)) && S.clock !== null;
      return ok ? true : JSON.stringify({ towns: towns.length, nodes: g.pulls.nodes().length, sites: sites.length, bad: bad.slice(0, 3).map((q) => q.id), halls: S.halls, hunters: hunters.length });
    });

    // a trader between two linked towns on the I-10 (Dead Suburb and the next exit west): the load leaves one stock and
    // lands in the other, and the truck covers the road at its pace (no jump)
    await check('stories: a trader\'s goods leave one site\'s stock and arrive in another\'s - the load comes off the first place\'s stock when the truck leaves, it covers the real road at its pace (never a jump), and the same units land in the second place\'s stock (paid for out of its chest) when it gets there', async () => {
      quiet();
      await stand(0, -40);
      const [A, B] = townPair();
      if (!A || !B) return 'no two linked towns';
      // only B is in the market for water: A is long on it, every other neighbour is full
      A.stock.water = 900; B.stock.water = 2; S.reprice(A); S.reprice(B);
      for (const id of S.linksOf(A)) if (id !== B.id) { const q = S.place(id); if (q) { q.stock.water = 9999; S.reprice(q); } }
      const a0 = A.stock.water, m = S.trade(A, () => 0.99);
      if (!m) return JSON.stringify({ why: 'no trade', A: S.pview(A).price, B: S.pview(B).price });
      const n = m.cargo.water ?? 0, left = a0 - A.stock.water;
      const pace = S.pace('drive'); let jump = 0, lastS = m.s, lastH = S.lastMove, before = null, after = null, coinB = B.coin, arrivedAt = null;
      await waitStory(g, Math.ceil(m.route.L / pace) + 3, 0.05, (h) => {
        const ds = m.s - lastS, dh = h - lastH; if (!m.back && ds > pace * dh + 2) jump++; lastS = m.s; lastH = h;
        if (!m.back) { before = B.stock.water; coinB = B.coin; } else if (arrivedAt === null) { after = B.stock.water; arrivedAt = h; return false; }
      });
      const landed = after - before;
      const ok = n > 0 && left === n && m.cor === 'I-10' && arrivedAt !== null && jump === 0 && Math.abs(landed - n) < 0.6 && m.sold?.n === n && B.coin === coinB - m.sold.cost && m.coin >= m.sold.cost;
      return ok ? true : JSON.stringify({ n, left, cor: m.cor, L: Math.round(m.route.L), arrivedAt, jump, before, after, landed: r1(landed), sold: m.sold, coin: [coinB, B.coin] });
    });

    // the raid: a Dustwolf-held place's party against a weak site; it falls; its people walk out on the road
    let arcId = null, fallen = null, refugees = null, heardBefore = null;
    await check('stories: a raid on a site changes its state and spawns refugees who walk the road - the raiders ride the road to it, it falls (a new owner, fewer people, its stock carried off), and the ones who walk out are real people on foot on the route toward the nearest town', async () => {
      quiet();
      const T = [...S.places.values()].find((q) => q.site && !q.beyond && !q.fallen && q.kind !== 'military' && Math.hypot(q.x, q.z) < 30000 && Math.hypot(q.x, q.z) > 6000);
      const Rd = S.place('camp_0');
      if (!T || !Rd) return 'no site to raid';
      T.pop = 14; T.walls = 'none'; T.stock.ammo = 0; T.guard = 0; T.problem = null; T.stock.food = 60; T.stock.water = 80; Rd.pop = 30;
      const owner0 = T.owner.name, pop0 = T.pop, food0 = T.stock.food;
      const m = S.raid(Rd, T, () => 0.99);
      if (!m) return 'no raid';
      m.people.forEach((q) => { q.dead = false; }); // a full party (staging)
      arcId = m.arc;
      await waitStory(g, Math.ceil(m.route.L / S.pace('drive')) + 3, 0.1, () => !(T.fallen || m.back));
      fallen = T;
      refugees = S.movers.find((x) => x.kind === 'refugees' && x.from === T.id);
      if (!T.fallen || !refugees) return JSON.stringify({ fallen: T.fallen, back: m.back, state: S.pview(T), stats: S.stats });
      const fellFact = [...K.facts.values()].find((f) => f.data?.place === T.id && f.data?.v === 'fell');
      heardBefore = fellFact ? K.holds('player', fellFact.id) : null;
      // they walk off screen a while (away from the raiders who hold the place now)
      await waitStory(g, 7, 0.25);
      // stand on their road ahead of them, out of their sight: they come to you walking
      const ahead = S.at(refugees, refugees.s + 150, {});
      await stand(ahead.x, ahead.z);
      S.tick(); // the records' tick (twice a second): one now, at the spot
      await C('step', { seconds: 0.6 });
      const live = refugees.people.filter((q) => q.c);
      if (!live.length) return JSON.stringify({ why: 'not promoted', d: Math.round(Math.hypot(refugees.x - p.x, refugees.z - p.z)), live: S.movers.filter((x) => x.live).length });
      const s0 = refugees.s, c = live[0].c, x0 = c.x, z0 = c.z;
      await C('step', { seconds: 12 });
      const moved = Math.hypot(c.x - x0, c.z - z0), onRoute = Math.hypot(c.x - S.at(refugees, S.project(refugees, c.x, c.z), {}).x, c.z - S.at(refugees, S.project(refugees, c.x, c.z), {}).z);
      const ok = T.owner.name !== owner0 && T.pop < pop0 && T.stock.food < food0 && T.garrison?.alive && live.length >= 4 && live.every((q) => q.c.alive && !q.c.inVehicle && q.flag?.length === 2) && moved > 8 && refugees.s > s0 && onRoute < 8 && refugees.to && S.place(refugees.to)?.kind === 'town';
      return ok ? true : JSON.stringify({ owner: [owner0, T.owner.name], pop: [pop0, Math.round(T.pop)], food: [food0, r1(T.stock.food)], live: live.length, moved: r1(moved), s: [r1(s0), r1(refugees.s)], onRoute: r1(onRoute), to: refugees.to });
    });

    await check('stories: a story chain writes 3+ linked chronicle rows - the raid, the fall, the walk-out (and the camp or the town that took them in) are rows of one arc, each caused by the one before; the place holds its news (law 6) and you hear it only standing there, from its people, with the source and the age on your board', async () => {
      const A = S.arcs.find((x) => x.id === arcId);
      if (!A) return `no arc ${arcId}`;
      // let the walkers walk on to their camp (or the town), off screen
      await stand(0, -40);
      const R = refugees; if (R) await waitStory(g, 40, 0.5, () => R.state !== 'gone');
      const rows = A.rows, chron = g.society.chronicle.query({ limit: 512 }).filter((r) => r.a === `arc:${A.id}`);
      const linked = rows.every((r, i) => i === 0 || rows.some((q) => q.seq === r.cause));
      const verbs = rows.map((r) => r.v);
      const fellRow = rows.find((r) => r.v === 'fell'), fact = [...K.facts.values()].find((f) => f.data?.seq === fellRow?.seq);
      const before = heardBefore, placeHolds = fact ? K.holds(fallen.holder, fact.id) : false;
      await stand(fallen.x + 200, fallen.z + 200); await C('step', { seconds: 1.2 });
      const got = fact ? K.copyOf('player', fact.id) : null, onBoard = g.pulls.board().find((b) => b.id === fact?.id);
      const ok = rows.length >= 3 && chron.length >= 3 && linked && ['raidout', 'raided', 'fell', 'fled'].every((v) => verbs.includes(v)) && (verbs.includes('camped') || verbs.includes('joined')) && fact && placeHolds && before === false && got?.source.channel === 'said' && got.source.fromName === fallen.name && onBoard && onBoard.ageH >= 0;
      await stand(0, -40);
      return ok ? true : JSON.stringify({ rows: rows.map((r) => [r.seq, r.v, r.cause]), chron: chron.length, linked, fact: !!fact, placeHolds, before, got: got?.source, onBoard: !!onBoard });
    });

    await check('stories: a hunter never moves toward the player before he has a tip or a sighting - with nothing, a pair rides its own round (seeded by the pair: the same wherever you stand); a sighting a far town made reaches them only by the grapevine, and then they ride to where you were SEEN, not where you are', async () => {
      quiet();
      const H = S.movers.find((m) => m.kind === 'hunters' && m.hall === S.halls[S.halls.length - 1]); // a Florida hall
      if (!H) return 'no Florida pair';
      const hall = S.place(H.hall);
      if (H.live) S.demote(H);
      Object.assign(H, { state: 'stay', at: H.hall, route: null, x: hall.x, z: hall.z, contract: null, huntH: undefined, tip: null, tipRode: undefined, waitUntil: null, roundIds: null, itin: 0, grudge: false });
      const HH = K.holders.get(H.holder); if (HH) HH.facts = HH.facts.filter((c) => c.subject !== 'sight:player' && c.what !== 'posting');
      // a real deed of yours on the chronicle (staged: a stranger you shot, far from anyone)
      await stand(0, -40);
      const vic = g.addChar({ x: p.x + 4, z: p.z, faction: 'drifter', weapon: null, name: 'Wes Hollis', flag: 'US' });
      g.combat.kill(vic, p, 0, 0, 'bullet');
      const row = g.society.chronicle.query({ verb: 'kill', actor: 'player', limit: 3 })[0];
      hall.coin = Math.max(hall.coin, 500);
      const b = S.post({ target: { kind: 'player', name: S.youName() }, by: { name: hall.name, place: hall.id }, deed: { seq: row.seq, verb: 'kill', text: 'a killing' }, pay: 120 });
      if (!b.ok) return JSON.stringify(b);
      for (const m of S.movers) if (m.kind === 'hunters' && m !== H) m.huntH = Infinity; // every other pair sits this one out (staging)
      // the round is the pair's alone: computed with you in Phoenix and with you in Miami, the same towns in the same order
      H.roundIds = null; const roundA = S.round(H).map((q) => q.id); const px = p.x, pz = p.z; p.x = 214500; p.z = 71400; H.roundIds = null; const roundB = S.round(H).map((q) => q.id); p.x = px; p.z = pz;
      const rides = []; const ride0 = S.ride.bind(S);
      S.ride = (m, x, z, id) => { if (m === H) rides.push({ x: Math.round(x), z: Math.round(z), id, tip: !!m.tip && Math.hypot(m.tip.x - x, m.tip.z - z) < 1, h: S.hours() }); return ride0(m, x, z, id); };
      let firstTipH = null;
      const holdsSight = () => K.holders.get(H.holder)?.facts.some((c) => c.subject === 'sight:player');
      try {
        await waitStory(g, 20, 0.25, (h) => { if (firstTipH === null && holdsSight()) firstTipH = h; });
        const blind = rides.slice();
        const blindOk = H.contract === b.bounty.id && firstTipH === null && blind.every((r) => !r.tip && roundA.includes(r.id));
        // you are seen in a Florida town 7-8 km from the hall, then you leave Florida for Phoenix
        const town = S.place('cg-289') ?? [...S.places.values()].find((q) => q.kind === 'town' && q.id !== hall.id && Math.hypot(q.x - hall.x, q.z - hall.z) < 14000);
        // the pair is home at its hall again (it may have ridden its round), asking around there
        if (H.live) S.demote(H);
        Object.assign(H, { state: 'stay', at: H.hall, route: null, x: hall.x, z: hall.z, huntH: undefined, waitUntil: S.hours() + 30 });
        await stand(town.x + 30, town.z + 30); S.tick(); await C('step', { seconds: 0.6 });
        const seenAt = { x: p.x, z: p.z }, seenH = S.hours();
        const sight = K.holders.get(town.holder)?.facts.filter((c) => c.subject === 'sight:player').sort((a2, b2) => b2.when - a2.when)[0];
        await stand(0, -40);
        let heardH = null;
        await waitStory(g, 40, 0.25, (h) => { if (heardH === null && holdsSight()) heardH = h; return !(heardH !== null && rides.some((r) => r.tip)); });
        const tipRide = rides.find((r) => r.tip), copy = K.holders.get(H.holder)?.facts.find((c) => c.subject === 'sight:player');
        const km = Math.hypot(town.x - hall.x, town.z - hall.z) / 1000, lag = heardH !== null ? heardH - seenH : null;
        const ok = blindOk && roundA.join() === roundB.join() && sight && heardH !== null && lag >= km / 0.45 - 1.5 && tipRide && Math.hypot(tipRide.x - seenAt.x, tipRide.z - seenAt.z) < 40 && Math.hypot(tipRide.x - p.x, tipRide.z - p.z) > 100000 && copy && copy.source.channel !== 'saw';
        return ok ? true : JSON.stringify({ dbg: { id: H.id, state: H.state, at: H.at, huntH: H.huntH, facts: K.holders.get(H.holder)?.facts.map((c) => [c.what, c.subject]), hall: K.holders.get(`hall:${H.hall}`)?.facts.map((c) => [c.what, c.subject]), inList: S.movers.includes(H) }, contract: [H.contract, b.bounty.id], firstTipH, blind, roundA, roundB, sight: !!sight, heardH, lag: lag && r1(lag), km: r1(km), tipRide, seenAt, copy: copy?.source, rides });
      } finally { S.ride = ride0; for (const m of S.movers) if (m.kind === 'hunters' && m.huntH === Infinity) m.huntH = undefined; }
    });

    await check('stories: a bounty posted on you reaches a far board only after a traveller carries it - the poster\'s board has it at once; the next town\'s board does not, while the trader who read it is on the road; it is pinned there when he arrives, told by him', async () => {
      quiet();
      await stand(0, -40);
      const [A, B] = townPair();
      if (!A || !B) return 'no two linked towns';
      const vic = g.addChar({ x: p.x + 4, z: p.z + 2, faction: 'drifter', weapon: null, name: 'Ona Pell', flag: 'CA' });
      g.combat.kill(vic, p, 0, 0, 'bullet');
      const row = g.society.chronicle.query({ verb: 'kill', actor: 'player', limit: 3 })[0];
      A.coin = Math.max(A.coin, 400);
      const r = S.post({ target: { kind: 'player', name: S.youName() }, by: { name: `the ${A.name} council`, place: A.id }, deed: { seq: row.seq, verb: 'kill', text: 'the killing of Ona Pell' }, pay: 90 });
      if (!r.ok) return JSON.stringify(r);
      const f = r.bounty.fact, boardA = K.holds(S.boardOf(A), f), farBefore = K.holds(S.boardOf(B), f);
      A.stock.scrap = 900; B.stock.scrap = 0; S.reprice(A); S.reprice(B);
      for (const id of S.linksOf(A)) if (id !== B.id) { const q = S.place(id); if (q) { q.stock.scrap = 9999; S.reprice(q); } }
      const m = S.trade(A, () => 0.99);
      if (!m || m.to !== B.id) return JSON.stringify({ why: 'no trader to B', to: m?.to });
      const carried = K.copyOf(m.holder, f);
      let early = 0, landedH = null;
      await waitStory(g, Math.ceil(m.route.L / S.pace('drive')) + 3, 0.1, (h) => { if (!m.back && K.holds(S.boardOf(B), f)) early++; if (m.back && landedH === null) { landedH = h; return false; } });
      const pinned = K.copyOf(S.boardOf(B), f);
      const ok = boardA && !farBefore && carried?.source.channel === 'board' && early === 0 && landedH !== null && pinned?.source.from === m.holder && pinned.source.fromName === m.people[0].name;
      return ok ? true : JSON.stringify({ boardA, farBefore, carried: carried?.source, early, landedH, pinned: pinned?.source });
    });

    await check('stories: the Tally - you take a bounty on a fallen place\'s master at a board that has it, kill him where he holds the place, and collect at a Tally House (the escrow less the guild\'s cut); your own name you pay off at a hall for more than it is worth, and a hunter on that contract quits only once he hears it', async () => {
      quiet();
      const T = fallen; if (!T?.garrison) return 'no fallen place from the raid check';
      // the master's name posted by the people he drove out (at a town board), or posted now by the nearest town
      let b = T.garrison.bounty ? S.bounty(T.garrison.bounty) : null;
      const row = S.arcs.find((x) => x.id === arcId)?.rows.find((r) => r.v === 'fell');
      const town = S.nearestPlace(T.x, T.z, 1e9, (q) => q.kind === 'town' && !q.fallen && !q.beyond);
      if (!b || b.state !== 'open') { town.coin = Math.max(town.coin, 400); const r = S.post({ target: { kind: 'npc', place: T.id, name: T.garrison.name }, by: { name: town.name, place: town.id }, deed: { seq: row.seq, verb: 'raid', text: `the fall of ${T.name}` }, pay: 150 }); if (!r.ok) return JSON.stringify(r); b = r.bounty; T.garrison.bounty = b.id; }
      for (const m of S.movers) if (m.kind === 'hunters' && m.contract === b.id) m.contract = null;
      for (const m of S.movers) if (m.kind === 'hunters') m.huntH = 1e9; // the guild's own pairs sit this one out (staging: it is yours)
      const poster = S.place(b.by.place);
      // at a town whose board never had it pinned, there is nothing to take
      const elsewhere = [...S.places.values()].find((q) => q.kind === 'town' && !q.beyond && q !== poster && !K.holds(S.boardOf(q), b.fact) && Math.hypot(q.x, q.z) < 40000);
      await stand(elsewhere.x + 20, elsewhere.z + 20);
      const notHere = S.take(b.id).ok;
      await stand(poster.x + 20, poster.z + 20);
      const took = S.take(b.id);
      // to the fallen place: its master stands in it
      await stand(T.x + 60, T.z + 60); await C('step', { seconds: 0.8 });
      const boss = T.garrison.c;
      if (!boss) return JSON.stringify({ why: 'master not standing', G: { ...T.garrison, c: null, guards: T.garrison.guards.length } });
      g.combat.kill(boss, p, 0, 0, 'bullet');
      for (const c of T.garrison.guards) if (c.alive) g.combat.kill(c, p, 0, 0, 'bullet');
      const hall = S.place(S.halls[0]);
      await stand(hall.x + 10, hall.z + 10);
      const cash0 = g.cash, esc = b.escrow, cl = S.claim(b.id);
      const paidRight = cl.ok && g.cash - cash0 === Math.round(esc * (1 - GUILD.cut)) && b.state === 'claimed' && b.escrow === 0;
      // your own name, paid off: a pair on that contract quits when the struck name reaches them, not before
      const vic = g.addChar({ x: p.x + 4, z: p.z + 2, faction: 'drifter', weapon: null, name: 'Sam Brede', flag: 'US' });
      g.combat.kill(vic, p, 0, 0, 'bullet');
      const kr = g.society.chronicle.query({ verb: 'kill', actor: 'player', limit: 3 })[0];
      const far = S.place(S.halls[S.halls.length - 1]); far.coin = Math.max(far.coin, 400);
      const mine = S.post({ target: { kind: 'player', name: S.youName() }, by: { name: far.name, place: far.id }, deed: { seq: kr.seq, verb: 'kill', text: 'killing Sam Brede' }, pay: 100 }).bounty;
      const pair = S.movers.find((m) => m.kind === 'hunters' && m.hall === far.id); pair.contract = mine.id; pair.huntH = -1e9; pair.state = 'stay'; pair.at = far.id;
      g.cash = 1000; const posterCoin = far.coin;
      const po = S.payOff(mine.id);
      const cost = Math.round(mine.pay * GUILD.payOff);
      S.hunt(pair, S.hours()); const stillOn = pair.contract === mine.id; // the hall at Rust Haven struck it; this pair is in Florida and has not heard
      K.put(`hall:${far.id}`, K.fact(mine.closedFact), { channel: 'grapevine', from: 'test' }, 0.8, 1); // the word reaches their hall
      Object.assign(pair, { huntH: -1e9, state: 'stay', at: far.id, route: null }); S.hunt(pair, S.hours()); const quit = pair.contract !== mine.id; // (it may take up another open posting it holds)
      for (const m of S.movers) if (m.kind === 'hunters') m.huntH = undefined;
      const ok = !notHere && took.ok && paidRight && po.ok && po.cost === cost && 1000 - g.cash === cost && far.coin > posterCoin && mine.state === 'paid' && stillOn && quit;
      return ok ? true : JSON.stringify({ notHere, took, cl, paidRight, po, cash: g.cash, coin: [posterCoin, far.coin], stillOn, quit });
    });

    await check('stories: kill a tallyman and his partner remembers - he saw who did it (a sighting he holds), he hunts you without a contract, and the Tally posts your name for it out of the hall\'s chest', async () => {
      quiet();
      await stand(0, -40);
      const H = S.movers.find((m) => m.kind === 'hunters' && m.hall === 'rust_haven' && m.people.every((q) => !q.dead));
      if (!H) return 'no pair at Rust Haven';
      if (!H.live) { H.x = p.x + 12; H.z = p.z; S.promote(H); }
      const [a, b] = H.people.map((q) => q.c);
      if (!a || !b) return 'pair not standing';
      a.x = p.x + 6; a.z = p.z; b.x = p.x + 9; b.z = p.z + 1;
      const posted0 = S.bounties.length;
      g.combat.kill(a, p, 0, 0, 'bullet');
      const sawIt = K.holders.get(H.holder)?.facts.some((c) => c.subject === 'sight:player' && c.source.channel === 'saw');
      const post = S.bounties.slice(posted0).find((x) => x.by.name === GUILD.name && x.target.kind === 'player');
      const row = post ? S.deedOf(a) : null;
      const ok = H.grudge && sawIt && post && row?.seq === post.deed.seq && post.escrow > 0;
      S.demote(H);
      return ok ? true : JSON.stringify({ grudge: H.grudge, sawIt, post: post && S.bview(post), row: row && { seq: row.seq, v: row.v, o: row.o, a: a.id }, posted: S.bounties.slice(posted0).map((x) => S.bview(x)) });
    });

    await check('stories: what it draws stays one instanced mesh (a hall\'s sign, a board with a paper for each posting, a raided place\'s scorch and rubble, a camp) and the frame stays under the draw-call budget', async () => {
      const hall = S.place('rust_haven');
      await stand(hall.x + 12, hall.z + 12); await C('step', { seconds: 0.5 });
      S.dirty = true; S.tick();
      g.render(0);
      const perf = await C('perf');
      const meshes = []; g.scene.traverse((o) => { if (o.name === 'site-stories') meshes.push(o); });
      const ok = meshes.length === 1 && S.dressN > 0 && S.dressed.some((d) => d.kind === 'hall') && S.dressed.some((d) => d.kind === 'board') && perf.drawCalls < 150;
      return ok ? true : JSON.stringify({ meshes: meshes.length, n: S.dressN, dressed: S.dressed.slice(0, 6), draws: perf.drawCalls });
    });
  } finally {
    S.hold = false;
    for (const m of S.movers) if (m.live) S.demote(m);
    g.zombies.enabled = was.zombies; g.raiderTimer = was.raiders; g.convoy.next = was.convoyNext; if (g.grapevine) g.grapevine.enabled = was.grapevine; g.society.director.paused = was.director; g.pulls.enabled = was.pulls; g.cash = was.cash;
    await out();
    await C('load', { save: sv });
  }
}
