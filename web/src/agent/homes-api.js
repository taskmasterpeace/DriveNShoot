// CAMPS AND BASES as COMMANDS rows (docs/design/WEB_CAMPS_BASES.md; systems/homes.js, data/homes.js). buildCommands() in
// api.js spreads these into COMMANDS; homesChecks is the selftest share. Every verb is the player's own: you stand at the
// camp, in the base, beside the piece, in front of the owner. Work takes time on the game clock (wait=true steps it).
import { HOMES_ROWS, validateHomes, CAMP_KIT, CAMP_BELLS, CAMP_RULES, FORTIFY, FURNITURE, RAID } from '../data/homes.js';
import { ITEMS } from '../data/items.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function homesCommands(api, need) {
  const g = api.g, H = () => g.homes, P = () => g.player;
  // Start a piece of work and (wait=true) step the clock until it is done or stopped.
  const work = async (res, wait) => {
    if (!res?.ok || !res.secs || !wait) return res;
    const S = H(); let k = 0;
    while (S.job && k++ < 400) await api._step(30);
    return S.lastJob ?? { ok: false, why: 'stopped' };
  };
  const charById = (id) => g.chars.find((c) => String(c.id) === String(id)) ?? null;
  const vehById = (id) => (id ? g.vehicles.find((v) => String(v.id) === String(id)) : g.vehicles.filter((v) => !v.dead).sort((a, b) => Math.hypot(a.x - P().x, a.z - P().z) - Math.hypot(b.x - P().x, b.z - P().z))[0]) ?? null;
  const houseR = (id, x, z) => { if (id) { const R = H().liveR(id); need(R, `no live building ${id} (home action=list)`); return R; } const R = H().buildingNear(x ?? P().x, z ?? P().z); need(R, 'stand in (or give id= of) a building'); return R; };
  return {
    camp: {
      group: 'world',
      desc: 'A CAMP for the night (docs/design/WEB_CAMPS_BASES.md §3.1; data/homes.js CAMP_*). action=status (default): the camp - kit, fire, bells, how far it is seen now and by night/day, the smoke, the danger a game hour asleep and its factors (road, town, horde, fire, lookout), who stands watch. '
        + 'pitch kit=bedroll|tent [fire=true: the wilds\' fire pit, 3 deadwood] [bells=true: trip bells round it]: off the road (9 m+), on dry ground, out from under a roof; the kit leaves your pack. strike: the same kit back in your pack (the fire\'s wood is burnt). '
        + 'sleep: lie down in it (survival.js: tired enough, nothing hostile close). Work takes game seconds: wait=true (default) steps until done.',
      args: { action: { type: 'string', enum: ['status', 'pitch', 'strike', 'sleep'], default: 'status' }, kit: { type: 'string', enum: Object.keys(CAMP_KIT), default: 'bedroll' }, fire: { type: 'boolean', default: false }, bells: { type: 'boolean', default: false }, wait: { type: 'boolean', default: true } },
      run: async ({ action, kit, fire, bells, wait }) => {
        const S = H(); need(S, 'no homes system');
        if (action === 'pitch') return work(S.pitch({ kind: kit, fire, bells }), wait);
        if (action === 'strike') return work(S.strike(), wait);
        if (action === 'sleep') return S.sleep();
        return { camp: S.campView(), rules: { seen: CAMP_RULES.seen, fire: CAMP_RULES.fire, danger: CAMP_RULES.danger } };
      },
    },
    base: {
      group: 'world',
      desc: 'Your BASES (WEB_CAMPS_BASES.md §3.2). action=status (default): every base - how held (empty|cleared|taken|bought|rented), defense, boards and bars on the live openings, rooms and what they give, the stash, the raid odds a day. '
        + 'claim [x z]: the claimable building you stand in (empty, cleared of hostiles, or taken from a hostile or dead owner; a friendly owner\'s is rented or bought). fortify kind=board_windows|bar_doors|wall|gate|watchtower|turret: real planks/scrap/a found turret from your pack. '
        + 'pieces [r=]: furniture within reach (the building\'s own, or moved). lift [fid=]: into your arms (somebody else\'s: a theft). load / unload [veh=] [fid=]: a vehicle\'s bed. furnish room=bunk|infirmary|armory|kitchen|kennel|workshop|lounge|storage: set what you carry down in your base, in that room (outside a base: on the ground). '
        + 'raid id=: a burglar comes tonight (the roll forced; what he takes is the rule). raids: the log.',
      args: { action: { type: 'string', enum: ['status', 'claim', 'fortify', 'pieces', 'lift', 'load', 'unload', 'furnish', 'raid', 'raids'], default: 'status' }, kind: { type: 'string', enum: Object.keys(FORTIFY) }, fid: { type: 'string' }, room: { type: 'string' }, veh: { type: 'string' }, id: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' }, r: { type: 'number', default: 3.2 }, wait: { type: 'boolean', default: true } },
      run: async (a) => {
        const S = H(); need(S, 'no homes system');
        switch (a.action) {
          case 'claim': { const R = S.buildingNear(a.x ?? P().x, a.z ?? P().z); const r = S.claim(R); return r; }
          case 'fortify': need(a.kind, `kind= ${Object.keys(FORTIFY).join('|')}`); return work(S.fortify(a.kind), a.wait);
          case 'pieces': return { pieces: S.piecesNear(P().x, P().z, a.r), hauling: S.hauling };
          case 'lift': return work(S.lift(a.fid), a.wait);
          case 'load': return S.load(vehById(a.veh));
          case 'unload': return S.unload(vehById(a.veh), a.fid);
          case 'furnish': return work(S.set(a.room ?? null), a.wait);
          case 'raid': { const b = a.id ? S.bases.get(a.id) : [...S.bases.values()][0]; need(b, 'no such base'); return S.burgle(b); }
          case 'raids': return { raids: S.raids, burglars: S.burglars };
          default: return { bases: [...S.bases.values()].map((b) => S.baseView(b)), hauling: S.hauling, job: S.view().job };
        }
      },
    },
    home: {
      group: 'world',
      desc: 'OWNING A HOUSE in a town (WEB_CAMPS_BASES.md §3.3; data/homes.js TENURE). action=list (default) [r=]: the claimable houses near you - who owns them (a faction, a family, a landlord: name, flag, alive, the person at the door), price, rent a week, what they offer, your tenure. '
        + 'rent | buy id= from=<char id>: hand the money to the person in front of you (within 4 m) - only the real owner can take it; it lands in their purse. pay id=: rent to the owner in person, or a bought house\'s tax/protection in town. owners: every owner record (purse, dead).',
      args: { action: { type: 'string', enum: ['list', 'rent', 'buy', 'pay', 'owners'], default: 'list' }, id: { type: 'string' }, from: { type: 'string' }, r: { type: 'number', default: 300 } },
      run: async ({ action, id, from, r }) => {
        const S = H(); need(S, 'no homes system');
        if (action === 'rent' || action === 'buy') { const R = houseR(id); const c = from ? charById(from) : null; need(!from || c, `no character ${from}`); return S.deal(R, action, c); }
        if (action === 'pay') { need(id, 'id='); return S.pay(id); }
        if (action === 'owners') return { owners: [...S.owners.values()].map((O) => ({ id: O.id, kind: O.kind, name: O.name, flag: O.flag, faction: O.faction, town: O.town, purse: O.purse, dead: O.dead, at: O.c?.id ?? null })) };
        return { houses: S.houses(P().x, P().z, r), tenure: S.view().tenure };
      },
    },
  };
}

// ---- the selftest share ----------------------------------------------------------------------------------------------
export async function homesChecks(api, check, C) {
  const g = api.g, S = g.homes, P = () => g.player;
  if (!S) { await check('homes: the camps-and-bases system is live', async () => 'no g.homes'); return; }
  const inv = g.inventory, cnt = (id) => inv.carried.count(id);
  const give = (id, n) => { const k = n - cnt(id); if (k > 0) inv.add(inv.carried, id, k); return cnt(id) >= n; }; // never a loop: a full pack just comes up short
  const cap0 = inv.carried.cap; inv.carried.cap += 240; // room in the pack for the kit and the planks (put back after)
  const was = { z: g.zombies.enabled, r: g.raiderTimer, conv: g.convoy.next, hour: g.sky.time, cash: g.cash, god: !!g.godMode, cg: g.citygen.enabled };
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.convoy.despawn?.(); g.convoy.next = 1e9;
  await C('god', { on: true });
  const tmp = [];
  const spawn = (o) => { const c = g.addChar(o); if (c) { c.homesTest = true; tmp.push(c); } return c; };
  const sweep = () => { for (const c of tmp.splice(0)) if (g.chars.includes(c)) g.removeChar(c); };
  const out = async () => { if (g.dialogue?.active) g.dialogue.close(); if (g.invUI?.open) g.invUI.toggle(false); if (P().inVehicle) g.exitVehicle(true); if (g.survival.sleep) g.survival.wake('test'); S.job = null; };
  // An open spot off every road and out from under every roof near (x, z).
  const openSpot = (x, z) => {
    for (let r = 0; r < 400; r += 12) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
      if (S.roadDist(px, pz) > 30 && !g.citygen.buildingAt(px, pz) && !((g.water?.depthAt?.(px, pz) ?? 0) > 0) && !g.statics?.blocked?.(px, pz)) return { x: px, z: pz };
    }
    return null;
  };
  let stamped = [];
  try {
    await check('homes: the rows validate (validateHomes: a fire never hides a camp and shows far more by night, risk factors only raise it, every fortification costs real items, every piece serves a room, owner shares sum to 1, every owner flag a drawn flag)', async () => {
      const v = validateHomes(HOMES_ROWS);
      return v.ok ? true : v.bad.join('; ');
    });

    // ---- 1. the camp ----
    await check('homes: a lit camp is seen farther at night than a cold one (a raider 110 m off at night marks a lit camp and not a cold one; the fire is x16 the glow by night, x1.8 smoke by day)', async () => {
      await out();
      await C('teleport', { x: 2400, z: 380 });
      const s = openSpot(P().x, P().z); if (!s) return 'no open ground';
      await C('teleport', s); await api._step(10);
      await C('setTime', { hour: 23 }); await api._step(5);
      give('bedroll', 1); give('deadwood', 3);
      const r = await C('camp', { action: 'pitch', kit: 'bedroll', fire: true });
      if (!r.ok) return `pitch: ${r.why}`;
      const o = S.camp, litNight = S.seenR(true), litDay = S.seenR(false);
      const raider = spawn({ x: o.x + 110, z: o.z, faction: 'raider', weapon: 'smg', hp: 80, name: 'Test Watcher', flag: 'US' }); if (!raider) return 'no slot';
      await api._step(90);
      const sawLit = raider.campSeen === o.at;
      const pit = S.pitOf(); pit.fuel = 0; await api._step(90); // the fire dies on the camp's clock
      const coldNight = S.seenR(true);
      const raider2 = spawn({ x: o.x - 110, z: o.z, faction: 'raider', weapon: 'smg', hp: 80, name: 'Test Watcher Two', flag: 'MX' });
      await api._step(90);
      const sawCold = raider2?.campSeen === o.at;
      sweep();
      return sawLit && !sawCold && litNight > coldNight * 10 && litNight > litDay && !S.lit() ? true : JSON.stringify({ sawLit, sawCold, litNight, litDay, coldNight, lit: S.lit() });
    });
    await check('homes: risk rises near a road and with a fire at night, falls with a lookout (the danger factors survival.js rolls asleep)', async () => {
      if (!S.camp) return 'no camp';
      const d0 = S.danger(), f0 = { ...S.factors };
      const pit = S.pitOf(); pit.fuel = 3; await api._step(70);
      const dFire = S.danger();
      const o = S.camp, x0 = o.x, z0 = o.z, W = g.convoy?.W, pr = W?.project?.(x0, z0, 4000);
      let dRoad = null;
      if (pr) { const f = W.at(pr.s); o.x = f.x + f.nx * 30; o.z = f.z + f.nz * 30; dRoad = S.danger(); o.x = x0; o.z = z0; }
      const prof0 = g.survival.prof; g.survival.prof = { ...prof0, shelter: true }; // the battery runs with shelters off; this check is about one
      const sk = g.survival.shelterFor('camp'); g.survival.prof = prof0;
      return dFire > d0 && (dRoad === null || dRoad > dFire) && Math.abs(sk.danger - S.danger()) < 1e-9 && f0.road === 1 ? true : JSON.stringify({ d0, dFire, dRoad, f0, sk });
    });
    await check('homes: striking a camp returns its kit (the same bedroll, tent and bells back in the pack; the fire\'s wood is burnt)', async () => {
      await out();
      const o0 = S.camp; if (!o0) return 'no camp';
      await C('teleport', { x: o0.x + 1, z: o0.z }); await api._step(4);
      const b0 = cnt('bedroll');
      const r = await C('camp', { action: 'strike' }); if (!r.ok) return `strike: ${r.why}`;
      const b1 = cnt('bedroll');
      // a tent with bells: out of the pack while pitched, back when struck
      give('tent', 1); give('trip_bells', 1);
      const t0 = cnt('tent'), k0 = cnt('trip_bells');
      const s = openSpot(P().x + 30, P().z); if (s) { await C('teleport', s); await api._step(6); }
      const p2 = await C('camp', { action: 'pitch', kit: 'tent', bells: true }); if (!p2.ok) return `pitch tent: ${p2.why}`;
      const t1 = cnt('tent'), k1 = cnt('trip_bells');
      const s2 = await C('camp', { action: 'strike' }); if (!s2.ok) return `strike tent: ${s2.why}`;
      const t2 = cnt('tent'), k2 = cnt('trip_bells');
      return b1 === b0 + 1 && t1 === t0 - 1 && k1 === k0 - 1 && t2 === t0 && k2 === k0 && !S.camp ? true : JSON.stringify({ b0, b1, t0, t1, t2, k0, k1, k2, camp: !!S.camp });
    });
    await check('homes: asleep in a belled camp, one of the infected walking in rings the bells and wakes you', async () => {
      await out();
      const s = openSpot(P().x, P().z); if (!s) return 'no ground'; await C('teleport', s); await api._step(6);
      give('bedroll', 1); give('trip_bells', 1);
      const p = await C('camp', { action: 'pitch', kit: 'bedroll', bells: true }); if (!p.ok) return `pitch: ${p.why}`;
      const o = S.camp;
      await C('teleport', { x: o.x, z: o.z + 1 }); await api._step(4);
      g.needs.rest = 0.05;
      const sl = S.sleep(); if (!sl.ok) return `sleep: ${sl.why}`;
      g.zombies.enabled = true;
      const z = g.zombies.spawn(o.x + 26, o.z, false); if (!z) { g.zombies.enabled = false; return 'no infected spawned'; }
      z.homesTest = true; tmp.push(z); g.zombies.remember(z, o.x, o.z, 'test', P());
      let k = 0; while (g.survival.sleep && k++ < 60) await api._step(30);
      g.zombies.enabled = false;
      const why = g.survival.lastWake?.why;
      sweep();
      await C('camp', { action: 'strike' });
      return why === 'the bells' && S.stats.belled > 0 ? true : JSON.stringify({ why, belled: S.stats.belled, asleep: !!g.survival.sleep });
    });

    // ---- 2. the base ----
    // A homestead out in the open with an empty house (no owner: 40% of rural ones), and a holding town.
    let farm = null, bk = null, R = null;
    for (let seed = 1; seed < 12 && !R; seed++) {
      const t = await C('citygen', { action: 'stamp', rural: 'ranch', seed, at: `${2600 + seed * 160},560` }); stamped.push(t.id);
      await C('teleport', { x: t.x ?? 2600 + seed * 160, z: (t.z ?? 560) + 40 }); await api._step(6);
      const L = g.citygen.live.get(t.id);
      const e = L?.blds.find((q) => q.B.claimable && !S.ownerOf(q));
      if (e) { farm = t; R = e; bk = S.bkOf(e); }
    }
    await check('homes: claiming a building marks it yours and others treat it so (citygen B.owner, survival\'s hold, the crew\'s base, the town\'s ownerAt; nobody sells it to you; it stays yours when the town is torn down and rebuilt)', async () => {
      if (!R) return 'no empty homestead house found';
      await out();
      const cx = (R.minX + R.maxX) / 2, cz = (R.minZ + R.maxZ) / 2;
      await C('teleport', { x: cx, z: cz }); await api._step(6);
      const r = await C('base', { action: 'claim' }); if (!r.ok) return `claim: ${r.why}`;
      const marks = { owner: R.B.owner, at: S.ownerAt(cx, cz), hold: !!g.survival.hold, crew: !!g.crew?.base, how: r.how };
      const buy = S.deal(R, 'buy', null);
      await C('citygen', { action: 'release', id: farm.id }); await api._step(4);
      let k = 0; while (!g.citygen.live.has(farm.id) && k++ < 20) await api._step(30);
      await api._step(70);
      const R2 = S.liveR(bk);
      return marks.owner === 'player' && marks.at === 'player' && marks.hold && marks.crew && !buy.ok && R2?.B.owner === 'player' && S.bases.has(bk) ? true : JSON.stringify({ marks, buy, rebuilt: !!R2, owner2: R2?.B.owner });
    });
    await check('homes: a piece of furniture placed in the base is the same piece you found and carried (one place in the world, gone from where it stood, never a new one)', async () => {
      const b = S.bases.get(bk); if (!b) return 'no base';
      await out();
      const L = g.citygen.live.get(farm.id);
      const src = L.blds.find((q) => q !== S.liveR(bk) && S.piecesOf(q).some((p) => !S.moved.has(p.fid))) ?? S.liveR(bk);
      const piece = S.piecesOf(src).find((p) => !S.moved.has(p.fid)); if (!piece) return 'no piece anywhere';
      await C('teleport', { x: piece.x + 0.8, z: piece.z }); await api._step(6);
      const lift = await C('base', { action: 'lift', fid: piece.fid }); if (!lift.ok) return `lift: ${lift.why}`;
      const slow = P().haulSlow;
      const R2 = S.liveR(bk), tx = (R2.minX + R2.maxX) / 2, tz = (R2.minZ + R2.maxZ) / 2;
      await C('moveTo', { x: tx, z: tz, maxSeconds: 200 });
      const room = FURNITURE[piece.kind].uses[0];
      const set = await C('base', { action: 'furnish', room }); if (!set.ok) return `furnish: ${set.why}`;
      const again = S.piecesNear(piece.x, piece.z, 1).some((q) => q.fid === piece.fid && q.at === 'origin');
      await C('teleport', { x: piece.x + 0.8, z: piece.z }); await api._step(4);
      const relift = S.lift(piece.fid);
      return set.fid === piece.fid && set.at === 'base' && set.base === bk && b.pieces.includes(piece.fid) && S.placesOf(piece.fid) === 1 && !again && !relift.ok && slow < 1 && P().haulSlow === 1 ? true
        : JSON.stringify({ set, places: S.placesOf(piece.fid), again, relift, slow });
    });
    await check("homes: fortifying spends real planks on the building's own windows and doors (the interiors' boards and the gadgets' bars, one planks each), raises the defense, and the bars go back up when the town is rebuilt", async () => {
      const b = S.bases.get(bk); if (!b) return 'no base';
      await out();
      const R2 = S.liveR(bk); await C('teleport', { x: (R2.minX + R2.maxX) / 2, z: (R2.minZ + R2.maxZ) / 2 }); await api._step(30);
      const O = S.openingsOf(b); if (!O) return 'openings not attached';
      for (const W of O.windows) if (W.state === 'boarded') g.interiors.unboard(W, null); // staging: an abandoned place's old boards pulled (the check is about yours)
      const nw = O.windows.length, nd = O.doors.filter((d) => !d.barricade && !d.broken).length;
      give('planks', nw + nd + 2);
      const p0 = cnt('planks'), d0 = S.defense(b);
      const rw = await C('base', { action: 'fortify', kind: 'board_windows' }); if (!rw.ok) return `windows: ${rw.why}`;
      const boarded = S.openingsOf(b).windows.filter((W) => W.state === 'boarded').length, p1 = cnt('planks');
      const rd = nd ? await C('base', { action: 'fortify', kind: 'bar_doors' }) : { ok: true, n: 0 }; if (!rd.ok) return `doors: ${rd.why}`;
      const p2 = cnt('planks'), barred = S.openingsOf(b).doors.filter((d) => d.barricade).length;
      await C('citygen', { action: 'release', id: farm.id }); await api._step(4);
      let k = 0; while (!g.citygen.live.has(farm.id) && k++ < 20) await api._step(30);
      await api._step(90);
      const O2 = S.openingsOf(b), again = O2 ? O2.doors.filter((d) => d.barricade).length : -1;
      return rw.n === nw && boarded === nw && p0 - p1 === nw && p1 - p2 === nd && barred === nd && S.defense(b) > d0 && again === nd ? true : JSON.stringify({ nw, nd, rw: rw.n, rd: rd.n, boarded, barred, spentW: p0 - p1, spentD: p1 - p2, d0, d1: S.defense(b), again });
    });
    await check('homes: a burgled base loses exactly what the burglar carried off (his pack is the stash\'s loss, no more than he can lift; past the give-up defense he leaves with nothing)', async () => {
      const b = S.bases.get(bk); if (!b) return 'no base';
      const box = S.stashOf(b);
      box.slots.length = 0;
      for (const [id, n] of [['gold_ring', 3], ['ammo_rifle', 40], ['water_bottle', 4], ['bandage', 6], ['scrap', 6], ['canteen', 1]]) if (ITEMS[id]) inv.add(box, id, n);
      const before = new Map(); for (const s of box.slots) before.set(s.id, (before.get(s.id) ?? 0) + s.n);
      const keep = b.fort; b.fort = { windows: 0, doors: 0, parts: [] };
      let seed = 7; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const log = S.burgle(b, rng);
      const after = new Map(); for (const s of box.slots) after.set(s.id, (after.get(s.id) ?? 0) + s.n);
      const lost = new Map(); for (const [id, n] of before) { const d = n - (after.get(id) ?? 0); if (d) lost.set(id, d); }
      const took = new Map(); for (const t of log.took) took.set(t.id, (took.get(t.id) ?? 0) + t.n);
      const bur = S.burglars.at(-1), carried = new Map(); for (const t of bur?.carried ?? []) carried.set(t.id, (carried.get(t.id) ?? 0) + t.n);
      const same = (a, c) => a.size === c.size && [...a].every(([k, v]) => c.get(k) === v);
      let kg = 0; for (const [id, n] of took) kg += (ITEMS[id].kg ?? 0.5) * n;
      b.fort = { windows: 30, doors: 0, parts: ['wall', 'gate', 'watchtower'] }; // past giveUp
      const n0 = box.slots.reduce((s, x) => s + x.n, 0), log2 = S.burgle(b, rng), n1 = box.slots.reduce((s, x) => s + x.n, 0);
      b.fort = keep;
      return took.size > 0 && same(lost, took) && same(took, carried) && kg <= RAID.carryKg + 1e-6 && log2.gaveUp && n0 === n1 && !log2.took.length ? true : JSON.stringify({ lost: [...lost], took: [...took], carried: [...carried], kg, gaveUp: log2.gaveUp });
    });

    // ---- 3. a house in a town ----
    await check('homes: a house can only be bought from its real owner (the money goes into their purse; anyone else is refused)', async () => {
      await out();
      const t = await C('citygen', { action: 'stamp', archetype: 'county_seat', seed: 5, at: '3300,900' }); stamped.push(t.id);
      await C('teleport', { x: 3300, z: 900 }); await api._step(10);
      const L = g.citygen.live.get(t.id); if (!L) return 'town not live';
      const R3 = L.blds.find((q) => q.B.claimable && S.ownerOf(q) && S.ownerOf(q).kind !== 'player'); if (!R3) return 'no owned house';
      const O = S.ownerOf(R3), at = S.doorOf(R3);
      await C('teleport', { x: at.x + 1.2, z: at.z }); await api._step(70); // the owner comes to the door while you are near
      if (!O.c) return 'owner not at the door';
      const other = spawn({ x: P().x + 1, z: P().z + 1, faction: 'drifter', hp: 60, name: 'Not The Owner', flag: 'CA' });
      g.cash = Math.max(g.cash, S.houseView(R3).price + 50);
      const c0 = g.cash, purse0 = O.purse;
      const wrong = S.deal(R3, 'buy', other);
      await C('teleport', { x: O.c.x + 1.2, z: O.c.z }); await api._step(4);
      const right = S.deal(R3, 'buy', O.c);
      const price = right.cost;
      sweep();
      return !wrong.ok && right.ok && g.cash === c0 - price && O.purse === purse0 + price && S.tenure.get(S.bkOf(R3))?.mode === 'own' && S.ownerOf(R3).kind === 'player' ? true : JSON.stringify({ wrong, right, c0, cash: g.cash, purse0, purse: O.purse });
    });
    await check('homes: rent unpaid past the grace takes the house back (the base is gone, the stash is the owner\'s again)', async () => {
      const L = [...g.citygen.live.values()].find((t) => t.rec.kind === 'town'); if (!L) return 'no town';
      const R4 = L.blds.find((q) => q.B.claimable && S.ownerOf(q) && ['landlord', 'faction'].includes(S.ownerOf(q).kind)); if (!R4) return 'no house to rent';
      const O = S.ownerOf(R4), at = S.doorOf(R4);
      await C('teleport', { x: at.x + 1.2, z: at.z }); await api._step(70);
      if (!O.c) return 'owner not at the door';
      await C('teleport', { x: O.c.x + 1.2, z: O.c.z }); await api._step(4);
      if (S.bases.size >= 3) return 'base cap';
      g.cash += 500;
      const r = S.deal(R4, 'rent', O.c); if (!r.ok) return `rent: ${r.why}`;
      const id = S.bkOf(R4), b = S.bases.get(id);
      S.dueDay(S.tenure.get(id).paidTo + 3); // the clock past the grace
      const box = g.inventory.boxes.get(b.stash);
      return !S.bases.has(id) && !S.tenure.has(id) && box?.ownerName === O.name ? true : JSON.stringify({ base: S.bases.has(id), tenure: S.tenure.get(id), owner: box?.ownerName });
    });
    await check('homes: a save carries the bases, the moved pieces, the stash, the owners\' purses and the tenure (load gives the same back)', async () => {
      const s = S.save(), before = JSON.stringify({ b: [...S.bases.keys()].sort(), m: [...S.moved.keys()].sort(), t: [...S.tenure.keys()].sort(), st: [...S.bases.values()].map((b) => g.inventory.boxes.get(b.stash)?.slots.length ?? 0) });
      S.load(JSON.parse(JSON.stringify(s)));
      const after = JSON.stringify({ b: [...S.bases.keys()].sort(), m: [...S.moved.keys()].sort(), t: [...S.tenure.keys()].sort(), st: [...S.bases.values()].map((b) => g.inventory.boxes.get(b.stash)?.slots.length ?? 0) });
      return before === after ? true : `${before} != ${after}`;
    });
  } finally {
    sweep();
    for (const id of stamped) { try { await C('citygen', { action: 'remove', id }); } catch { /* gone */ } }
    S.load(null);
    inv.carried.cap = cap0;
    g.zombies.enabled = was.z; g.raiderTimer = was.r; g.convoy.next = was.conv; g.sky.time = was.hour; g.cash = was.cash;
    if (!was.god) await C('god', { on: false });
  }
}
