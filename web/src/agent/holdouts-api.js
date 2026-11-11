// COMMANDS rows and selftest checks for THE HOLDOUTS (docs/design/WEB_HOLDOUTS.md; G7 of WEB_DEATHLANDS_GAP.md).
//   holdouts   the generated holdouts: each town's Keyholder card, HOUSE RULES, paper, gate terms, your standing (local
//              wanted, pass, gate locker), its guards; validate the rows; generate one from a seed (pure, not placed);
//              actions: promote, gate (walk up to the gate), card, clear, fine, paper (buy/sell), wallet
// Checks drive the real paths (the gate check through the dialogue's choices, a break seen by the real witness pass);
// staged positions (a bull put where it can or cannot see you) are the documented exception.
import { generateHoldout, validateHoldouts, hashHoldout } from '../world/holdoutgen.js';
import { SEEDS, HOUSE_RULES, SCRIP, KEYHOLDERS, SIZES, PALETTE, WANTED } from '../data/holdoutgen.js';
import { HOLDOUTS } from '../data/holdouts.js';
import { FLAG_KEYS, FLAGS } from '../ui/portrait.js';
import GOLDEN from '../data/golden.json';

// Meridian's layout pinned before the generator came in (the authored holdout must not move: golden behaviour).
export const MERIDIAN_LAYOUT = '22729e79';
export function meridianHash(H) {
  const r = (v) => (typeof v === 'number' ? Math.round(v * 1000) : v);
  const fill = H.lots.map((L) => { const f = H.fillOf(L); return [f.items.length, f.boxes.length, f.wrecks.length]; });
  const s = JSON.stringify({ c: [H.cx, H.cz], lots: H.lots.map((L) => [L.id, L.kind, L.x0, L.z0, L.x1, L.z1, L.seed, L.programme, L.burnt]), items: H.items.map((i) => i.e), boxes: H.boxes, dc: H.deadCars.map((d) => [d.x, d.z, d.rot]), streets: H.streetList.map((q) => [q.name, q.x0, q.z0, q.x1, q.z1]), gates: H.gates.map((q) => [q.side, q.x, q.z]), spots: H.spots, flora: H.flora, fill }, (k, v) => r(v));
  let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}

export function holdoutsCommands(api, need) {
  const g = api.g, P = () => g.player, L = () => g.holdoutLaw;
  const town = (id) => { const H = L().byId[id] ?? L().towns.find((h) => h.name.toLowerCase() === String(id).toLowerCase()); need(H, `no holdout ${id}; holdouts: ${L().towns.map((h) => h.id).join(', ')}`); return H; };
  return {
    holdouts: {
      group: 'world', desc: 'THE HOLDOUTS (systems/holdouts.js, world/holdoutgen.js, data/holdoutgen.js, docs/design/WEB_HOLDOUTS.md): every generated walled town at an exit (Arizona I-10, Florida I-95/I-75; Meridian is the authored one, see region). No args: each town (id, name, region, centre, size, main gate, exit, the Keyholder card: name, title, vice, law, flag, hall; its HOUSE RULES; its paper and what a note is worth where you stand; the gate terms: toll, bribe, the Persuade a lie needs, incorruptible; your standing: local wanted 0..3, pass and how, the gate locker, the last break and who saw it; its guards: gatemen, bulls and the Keyholder with gun, mag and the rounds they carry, vendetta), your wallet, counters. id= one town. validate=true checks every row (Meridian and each seed) with validateHoldouts. generate=true (seed= size=small|medium|large wealth=0..1 keyholder=<kind> region=florida|arizona side=W|E|N|S) returns a holdout made from that spec without placing it, and its hash. action=promote id= brings a town\'s people in now; action=gate id= walks you up to its main gate from 40 m out (the gate check stops you: then use choose); action=card id= shows the Keyholder\'s card; action=clear id= clears your local wanted there (testing); action=fine id= pays the fine (a gateman takes it at the gate in play); action=paper id= n= mode=buy|sell buys that town\'s paper or sells it where you stand; action=wallet id= n= sets what you carry (testing).',
      args: { id: { type: 'string' }, validate: { type: 'boolean' }, generate: { type: 'boolean' }, seed: { type: 'number' }, size: { type: 'string', default: 'medium' }, wealth: { type: 'number', default: 0.5 },
        keyholder: { type: 'string', default: 'broker' }, region: { type: 'string', default: 'florida' }, side: { type: 'string', default: 'W' },
        action: { type: 'string', enum: ['view', 'promote', 'gate', 'card', 'clear', 'fine', 'paper', 'wallet'] }, n: { type: 'number', default: 10 }, mode: { type: 'string', default: 'buy', enum: ['buy', 'sell'] } },
      run: async ({ id, validate, generate, seed, size, wealth, keyholder, region, side, action, n, mode }) => {
        need(L(), 'no holdouts system');
        if (validate) return validateHoldouts([HOLDOUTS.meridian, ...SEEDS.map((s) => generateHoldout(s))], { flags: FLAG_KEYS });
        if (generate) {
          need(SIZES[size], `size is one of ${Object.keys(SIZES)}`); need(KEYHOLDERS[keyholder], `keyholder is one of ${Object.keys(KEYHOLDERS)}`); need(PALETTE[region], `region is one of ${Object.keys(PALETTE)}`);
          const G = generateHoldout({ id: `gen_${seed ?? 1}`, seed: seed ?? 1, size, wealth, keyholder, region, side });
          return { hash: hashHoldout(G), card: G.card, rules: G.rules, scrip: G.scrip, gate: G.gate, wealth: G.wealth, size: G.row.size, mainGate: G.row.mainGate, blocks: G.row.blocks.map((b) => ({ at: b.at, name: b.name ?? null, open: b.open ?? null, lots: (b.lots ?? []).map((q) => q.label ?? q.kind ?? q) })), people: { named: G.people.named.map((p) => ({ id: p.id, name: p.name, job: p.job, flag: p.flag })), gatemen: G.people.gatemen.count, bulls: G.people.bulls.count }, validation: validateHoldouts([G], { flags: FLAG_KEYS }) };
        }
        if (action === 'promote') { const H = town(id), T = g.regions.towns.find((t) => t.H === H); if (!T.live) g.regions.promote(T); return L().view(H.id); }
        if (action === 'gate') {
          const H = town(id), gt = L().mainGate(H), dir = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] }[gt.side];
          await api.call('teleport', { x: gt.x + dir[0] * 40, z: gt.z + dir[1] * 40 });
          const T = g.regions.towns.find((t) => t.H === H); if (!T.live) g.regions.promote(T);
          await api.call('moveTo', { x: gt.x - dir[0] * 2, z: gt.z - dir[1] * 2, maxSeconds: 25 });
          return { stopped: g.dialogue.active, ...api.dialogueState(), standing: L().view(H.id).standing };
        }
        if (action === 'card') { const H = town(id); L().card?.show(H, 12); return { shown: H.id, card: H.gen.card }; }
        if (action === 'clear') { const H = town(id); L().clearWanted(H, 'agent'); return L().view(H.id).standing; }
        if (action === 'fine') { const H = town(id), S = L().S(H.id), f = WANTED.fine * Math.ceil(S.wanted); need(S.wanted > 0, 'not wanted there'); need(g.cash >= f, `the fine is $${f}, you have $${g.cash}`); L().payFine(H); return { paid: f, cash: g.cash, standing: L().view(H.id).standing }; }
        if (action === 'paper') { const H = town(id), r = L().exchange(H.id, n, mode); need(r.ok, r.why); return { ...r, cash: g.cash, wallet: L().wallet }; }
        if (action === 'wallet') { const H = town(id); L().wallet[H.id] = Math.max(0, n); return { wallet: L().wallet }; }
        if (id) return L().view(town(id).id);
        return L().view();
      },
    },
  };
}

export async function holdoutsChecks(api, check, C) {
  const g = api.g, Law = g.holdoutLaw, W = g.streamer.W, Rg = g.regions, I = g.input;
  const steps = async (s) => { for (let t = 0; t < s; t += 0.5) await C('step', { seconds: Math.min(0.5, s - t) }); };
  const since = (seq, type, pred = () => true) => g.events.filter((e) => e.seq > seq && e.type === type && pred(e));
  const TOWN = 'sebastian';
  const H = Law.byId[TOWN];
  // A stage of the holdouts' own: the law on (the battery keeps it off), nothing wandering in, noon, a clean standing.
  const stage = async (fn, o = {}) => {
    const was = Law.enabled, zOn = g.zombies.enabled, rt = g.raiderTimer, wOn = g.wilds?.enabled, cash = g.cash;
    Law.enabled = true; g.zombies.enabled = false; g.raiderTimer = 1e9; if (g.wilds) g.wilds.enabled = false;
    if (g.player.inVehicle) g.exitVehicle(true);
    if (g.dialogue?.active) g.dialogue.close();
    g.gunpoint?.clear?.(); g.arms?.lower?.();
    await C('setTime', { hour: o.hour ?? 12 }); await C('setWeather', { key: 'CLEAR', instant: true });
    for (const T of Law.towns) Law.clearWanted(T, 'stage');
    Law.st = {}; Law.wallet = {};
    const hp = g.player.hp;
    try { return await fn(); }
    finally {
      if (g.dialogue?.active) g.dialogue.close();
      for (const T of Law.towns) { const S = Law.S(T.id); if (S.locker) Law.returnGuns(T); Law.clearWanted(T, 'stage'); }
      Law.st = {}; Law.wallet = {}; Law.enabled = was;
      g.zombies.enabled = zOn; g.raiderTimer = rt; if (g.wilds) g.wilds.enabled = wOn; g.player.hp = hp; g.cash = cash; g.aimOverride = null;
      g.arms?.lower?.();
      await C('teleport', { x: 0, z: -40 });
    }
  };
  // Fresh people for the town (a promote after a demote: the guards on their posts, their rounds full).
  const fresh = (H) => { const T = Rg.towns.find((t) => t.H === H); if (T.live) Rg.demote(T); Rg.promote(T); return T; };
  const gatemanNear = (H) => Law.guards.find((c) => c.alive && c.guardOf === H.id && c.guardKind === 'gateman');
  // Up to the gate from outside: the gate check stops you (the dialogue opens with a gateman).
  const toGate = async (H) => {
    const gt = Law.mainGate(H), d = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] }[gt.side];
    await C('teleport', { x: gt.x + d[0] * 20, z: gt.z + d[1] * 20 });
    fresh(H);
    await C('step', { seconds: 0.3 });
    await C('teleport', { x: gt.x + d[0] * 3.2, z: gt.z + d[1] * 3.2 + 0.4 });
    await C('step', { seconds: 0.4 });
    return g.dialogue.active ? await C('dialogue') : null;
  };
  const pick = async (re) => { const d = await C('dialogue'); const i = d.choices.findIndex((c) => re.test(c.text)); if (i < 0) return { missing: re.source, choices: d.choices.map((c) => c.text) }; return C('choose', { index: i }); };

  await check('holdouts: the generator is deterministic per seed (same spec, same hash; another seed, another town), every seeded row validates (Meridian too), each town in the world is its seed\'s', async () => {
    const bad = [];
    for (const s of SEEDS) {
      const a = hashHoldout(generateHoldout(s)), b = hashHoldout(generateHoldout({ ...s })), c = hashHoldout(generateHoldout({ ...s, seed: s.seed + 1 }));
      if (a !== b) bad.push(`${s.id}: ${a} != ${b}`);
      if (a === c) bad.push(`${s.id}: seed+1 made the same town`);
      const T = Law.byId[s.id];
      if (!T) bad.push(`${s.id}: not in the world`); else if (hashHoldout(T.gen) !== a) bad.push(`${s.id}: the world's town is not its seed's`);
    }
    const v = validateHoldouts([HOLDOUTS.meridian, ...SEEDS.map((s) => generateHoldout(s))], { flags: FLAG_KEYS });
    if (!v.ok) bad.push(...v.errors.slice(0, 6));
    const regions = new Set(Law.towns.map((T) => T.R.id));
    if (!regions.has('arizona') || !regions.has('florida') || Law.towns.length < 6) bad.push(`towns ${Law.towns.map((T) => `${T.id}@${T.R.id}`)}`);
    for (const T of Law.towns) { if (!T.exit) bad.push(`${T.id}: no exit`); const kinds = new Set(T.lots.map((q) => q.kind)); for (const k of ['townhall', 'sheriff', 'clinic', 'cantina', 'store']) if (!kinds.has(k)) bad.push(`${T.id}: no ${k} laid out`); for (const o of ['market', 'arena', 'tower']) if (!T.blocks.some((b) => b.open === o)) bad.push(`${T.id}: no ${o}`); }
    return bad.length ? JSON.stringify(bad) : true;
  });

  await check('holdouts: every generated holdout passes the walkability audit (the gate is reachable from the exit road, the Swap, the pit and every keeper\'s building from the gate, each building walked into from its door)', async () => {
    const bad = [];
    for (const T of Law.towns) {
      await C('teleport', { x: T.cx, z: T.cz });
      await C('step', { seconds: 0.2 });
      const gt = Law.mainGate(T), d = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] }[gt.side], out = { x: gt.x + d[0] * 12, z: gt.z + d[1] * 12 };
      // From the end of the exit's access road to the gate.
      const acc = T.exit?.access, a0 = acc ? { x: acc.x[Math.max(0, acc.n - 4)], z: acc.z[Math.max(0, acc.n - 4)] } : T.approach;
      const p0 = await C('path', { fx: a0.x, fz: a0.z, x: out.x, z: out.z });
      if (!p0.found) bad.push(`${T.id}: no way from the road to the gate`);
      const goal = (b) => ({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 });
      for (const o of ['market', 'arena']) { const b = T.blocks.find((q) => q.open === o), q = goal(b); const p = await C('path', { fx: out.x, fz: out.z, x: q.x + (o === 'arena' ? 0 : 0), z: q.z + (o === 'market' ? 9 : 0) }); if (!p.found) bad.push(`${T.id}: no way to ${o}`); }
      for (const k of ['townhall', 'sheriff', 'clinic', 'cantina', 'store']) {
        const L = T.lotOf(k), post = Rg.postOf(L);
        if (!post.door) { bad.push(`${T.id}: ${k} has no door`); continue; }
        const p1 = await C('path', { fx: out.x, fz: out.z, x: post.door.x, z: post.door.z }), p2 = await C('path', { fx: post.door.x, fz: post.door.z, x: post.x, z: post.z });
        if (!p1.found) bad.push(`${T.id}: no way to the ${k} door`);
        if (!p2.found) bad.push(`${T.id}: ${k} not enterable`);
      }
    }
    await C('teleport', { x: 0, z: -40 });
    return bad.length ? JSON.stringify(bad) : true;
  });

  await check('holdouts: the gate check stops you at the gate and reads the HOUSE RULES (subtitled), and each way through works: comply (guns to the locker, the tithe taken, back on the way out), bribe (dollars, guns kept), lie (a Persuade check: greyed below it, through above it), fight (wanted there, the bulls come)', async () => stage(async () => {
    const bad = [];
    g.cash = 500;
    // comply
    const d0 = await toGate(H);
    if (!d0) return 'the gate check did not stop you';
    for (const r of Law.rulesOf(H)) if (!d0.text.includes(HOUSE_RULES[r].name)) bad.push(`rule ${r} not read`);
    if (!d0.choices.some((c) => /Comply/.test(c.text))) bad.push('no comply');
    if (Law.waterSlot() < 0) g.inventory.add(g.inventory.carried, 'water_bottle', 1);
    const guns0 = [...g.inv.weapons], water0 = g.inventory.carried.slots.filter((s) => s.id === 'water_bottle').reduce((a, s) => a + s.n, 0);
    await pick(/^Comply/); await pick(/Go in/);
    const S = Law.S(H.id);
    if (!S.pass || S.how !== 'comply' || g.inv.weapons.length || !S.locker?.guns.length) bad.push(`comply: pass ${S.pass} ${S.how} weapons ${g.inv.weapons} locker ${S.locker?.guns.map((q) => q.k)}`);
    const water1 = g.inventory.carried.slots.filter((s) => s.id === 'water_bottle').reduce((a, s) => a + s.n, 0);
    if (Law.rulesOf(H).includes('water_tithe') && !(water1 < water0 || S.tithe)) bad.push('no tithe taken');
    // in, then out past the wall: the guns come back
    await C('teleport', { x: H.cx, z: H.cz + 9 }); await steps(1);
    const gt = Law.mainGate(H), dd = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] }[gt.side];
    await C('teleport', { x: gt.x + dd[0] * 90, z: gt.z + dd[1] * 90 }); await steps(0.6);
    if (String(g.inv.weapons) !== String(guns0)) bad.push(`guns back: ${g.inv.weapons} vs ${guns0}`);
    // bribe
    Law.st = {};
    await toGate(H);
    const c0 = g.cash, b = H.gen.gate.bribe, r1 = await pick(/Slip the gateman/);
    if (r1.missing) bad.push('no bribe'); else if (g.cash !== c0 - b || !Law.S(H.id).pass || Law.S(H.id).how !== 'bribe' || !g.inv.weapons.length) bad.push(`bribe: cash ${c0}->${g.cash} (${b}) pass ${Law.S(H.id).how} guns ${g.inv.weapons}`);
    if (g.dialogue.active) g.dialogue.close();
    // lie: low Persuade greys it with the reason; high Persuade passes it
    Law.st = {};
    const pers0 = g.deep.skill.persuade;
    g.deep.skill.persuade = 0;
    await toGate(H);
    const lieRe = /^"/, lseq = g.eventSeq;
    await pick(lieRe);
    if (Law.S(H.id).pass) bad.push('lie passed with no Persuade');
    if (!since(lseq, 'dialogueLocked').length) bad.push('the lie was not greyed');
    if (g.dialogue.active) g.dialogue.close();
    Law.st = {};
    g.deep.skill.persuade = 99;
    await toGate(H);
    await pick(lieRe);
    if (!Law.S(H.id).pass || Law.S(H.id).how !== 'lie' || !g.inv.weapons.length) bad.push(`lie: ${Law.S(H.id).how} guns ${g.inv.weapons}`);
    g.deep.skill.persuade = pers0;
    if (g.dialogue.active) g.dialogue.close();
    // fight
    Law.st = {};
    const gw0 = g.wanted;
    await toGate(H);
    const seq = g.eventSeq;
    await pick(/Draw on the gateman/);
    const S2 = Law.S(H.id), hunters = Law.guards.filter((c) => c.alive && c.guardOf === H.id && c.vendetta);
    if (S2.wanted < 2 || !hunters.length || !since(seq, 'deed', (e) => e.verb === 'threaten').length) bad.push(`fight: wanted ${S2.wanted} hunters ${hunters.length}`);
    if (g.wanted !== gw0) bad.push(`global wanted moved ${gw0}->${g.wanted}`);
    for (const T of Law.towns) if (T !== H && Law.S(T.id).wanted) bad.push(`${T.id} wants you too`);
    return bad.length ? JSON.stringify(bad) : true;
  }));

  await check('holdouts: a HOUSE RULE broken in sight of a bull makes you wanted in that town only (the deed on the record, its bulls hunt you); the same break out of sight does nothing', async () => stage(async () => {
    const bad = [];
    g.cash = 500;
    // In through the gate with a bribe (guns kept), then raise a gun inside: GUNS CHECKED AT THE GATE.
    await toGate(H); await pick(/Slip the gateman/); if (g.dialogue.active) g.dialogue.close();
    const at = { x: H.cx - 6, z: H.cz + 9.5 };
    await C('teleport', at); await C('step', { seconds: 0.3 });
    const bull = Law.guards.find((c) => c.alive && c.guardOf === H.id && c.guardKind === 'bull' && c.weapon);
    if (!bull) return 'no bull';
    for (const c of Law.guards) if (c.guardOf === H.id && c !== bull && c.alive) { c.x = H.cx + 120; c.z = H.cz - 60; c.home = c.post = { x: c.x, z: c.z }; } // the others out of the way (staged)
    // Out of sight: the bull 40 m off, looking away.
    bull.x = at.x + 40; bull.z = at.z; bull.post = bull.home = { x: bull.x, z: bull.z }; bull.face = Math.PI / 2; bull.hold = true;
    let seq = g.eventSeq;
    g.arms.raise('test'); await C('step', { seconds: 1.2 });
    const S = Law.S(H.id);
    if (S.wanted !== 0) bad.push(`out of sight: wanted ${S.wanted}`);
    if (!since(seq, 'houseRuleUnseen').length) bad.push('the unseen break was not noticed as unseen');
    g.arms.lower('test'); await C('step', { seconds: 1.2 });
    // In sight: the bull 9 m off, facing you.
    bull.x = at.x + 9; bull.z = at.z; bull.post = bull.home = { x: bull.x, z: bull.z }; bull.face = Math.atan2(at.x - bull.x, at.z - bull.z);
    seq = g.eventSeq;
    const gw0 = g.wanted;
    g.arms.raise('test'); await C('step', { seconds: 1.2 });
    const broke = since(seq, 'houseRuleBroken'), deed = since(seq, 'deed', (e) => e.verb === 'trespass');
    if (!(S.wanted >= HOUSE_RULES.guns_checked.heat) || !broke.length || !broke[0].by.includes(bull.id) || !deed.length) bad.push(`in sight: wanted ${S.wanted} broke ${broke.length} deed ${deed.length}`);
    if (!bull.vendetta) bad.push('the bull does not hunt you');
    if (!g.ai.hostile?.(bull, g.player) && !bull.vendetta) bad.push('not hostile');
    if (g.wanted !== gw0) bad.push(`global wanted moved ${gw0}->${g.wanted}`);
    for (const T of Law.towns) if (T !== H && Law.S(T.id).wanted) bad.push(`${T.id} wants you too`);
    g.arms.lower('test');
    return bad.length ? JSON.stringify(bad) : true;
  }));

  await check('holdouts: bulls carry real rounds (a reload comes out of their pockets, dry they put the gun up) and their body holds exactly what was left', async () => stage(async () => {
    const bad = [];
    await C('teleport', { x: H.cx, z: H.cz + 30 });
    fresh(H); await C('step', { seconds: 0.2 });
    const b = Law.guards.find((c) => c.alive && c.guardOf === H.id && c.guardKind === 'bull' && c.weapon);
    if (!b) return 'no bull';
    const W0 = b.weapon, full = (await import('../systems/combat.js')).WEAPONS[W0].mag;
    b.rounds = 3; b.mag = 0; b.reloading = 0.4; b._load = undefined;
    await C('step', { seconds: 0.1 });
    if (b.rounds !== 0 || b._load !== 3) bad.push(`reload: rounds ${b.rounds} load ${b._load}`);
    await C('step', { seconds: 1.5 });
    if (b.mag > 3) bad.push(`mag ${b.mag} > the 3 it had (full ${full})`);
    // dry: empty mag and no rounds -> the gun goes up
    b.mag = 0; b.reloading = 0.2; b._load = undefined;
    await C('step', { seconds: 1 });
    if (b.weapon) bad.push(`dry bull still has ${b.weapon} (mag ${b.mag})`);
    // a second bull, killed with 2 in the mag and 7 in the pocket: the body holds that
    const b2 = Law.guards.find((c) => c.alive && c.guardOf === H.id && c.guardKind === 'bull' && c.weapon && c !== b);
    if (!b2) return JSON.stringify([...bad, 'no second bull']);
    b2.mag = 2; b2.rounds = 7;
    g.combat.damage(b2, 9999, null, 1, 0, 'test');
    await C('step', { seconds: 0.4 });
    const box = g.inventory.boxes.get(`body:${b2.id}`);
    if (!box) bad.push('no body'); else {
      const gun = box.slots.find((s) => s.id.startsWith('gun_')), ammo = box.slots.filter((s) => s.id.startsWith('ammo_')).reduce((a, s) => a + s.n, 0);
      if (!gun || gun.loaded !== 2 || ammo !== 7) bad.push(`body: gun ${gun?.id} loaded ${gun?.loaded} ammo ${ammo}`);
    }
    return bad.length ? JSON.stringify(bad) : true;
  }));

  await check('holdouts: house paper - face at home, discounted by distance from home (formula), bought at its own gate, sold anywhere for less the farther from home', async () => stage(async () => {
    const bad = [], LR = Law.byId.little_river;
    const km = Math.hypot(LR.cx - H.cx, LR.cz - H.cz) / 1000, edge = Math.max(H.hw, H.hd) / 1000;
    const want = SCRIP.face * Math.max(SCRIP.floor, 1 - SCRIP.perKm * (km - edge));
    if (Math.abs(Law.rate(H.id, H.cx, H.cz) - SCRIP.face) > 1e-9) bad.push(`at home ${Law.rate(H.id, H.cx, H.cz)}`);
    if (Math.abs(Law.rate(H.id, LR.cx, LR.cz) - want) > 1e-6) bad.push(`at Little River ${Law.rate(H.id, LR.cx, LR.cz)} vs ${want}`);
    const AZ = Law.towns.find((T) => T.R.id === 'arizona');
    if (Math.abs(Law.rate(H.id, AZ.cx, AZ.cz) - SCRIP.floor * SCRIP.face) > 1e-9) bad.push(`across the country ${Law.rate(H.id, AZ.cx, AZ.cz)} (floor ${SCRIP.floor})`);
    g.cash = 1000;
    await C('teleport', { x: H.cx, z: H.cz });
    const r = Law.exchange(H.id, 40, 'buy');
    if (!r.ok || g.cash !== 1000 - Math.ceil(40 * SCRIP.buy) || Law.wallet[H.id] !== 40) bad.push(`buy ${JSON.stringify(r)}`);
    const home = Law.quote(H.id, 20, H.cx, H.cz, SCRIP.cashOut), far = Law.quote(H.id, 20, LR.cx, LR.cz, 1 - SCRIP.cut);
    if (!(far < home)) bad.push(`far ${far} not less than home ${home}`);
    const c0 = g.cash; Law.exchange(H.id, 20, 'sell');
    if (g.cash - c0 !== home) bad.push(`sold at home for ${g.cash - c0}, quote ${home}`);
    await C('teleport', { x: LR.cx, z: LR.cz });
    const c1 = g.cash; Law.exchange(H.id, 20, 'sell');
    if (g.cash - c1 !== far) bad.push(`sold at Little River for ${g.cash - c1}, quote ${far}`);
    return bad.length ? JSON.stringify(bad) : true;
  }));

  await check('holdouts: save and load keep the local wanted, the gate locker (your guns) and the paper you carry', async () => stage(async () => {
    const bad = [], T2 = Law.byId.furnace_mile;
    g.cash = 500;
    await toGate(H); await pick(/^Comply/); if (g.dialogue.active) g.dialogue.close();
    Law.raise(T2, 2, 'curfew', null);
    Law.wallet[H.id] = 17; Law.wallet[T2.id] = 5;
    const sv = (await C('save')).save;
    if (!sv.holdouts) return 'no holdouts in the save';
    Law.clearWanted(T2, 'x'); Law.st = {}; Law.wallet = {};
    await C('load', { save: sv });
    const S = Law.S(H.id), S2 = Law.S(T2.id);
    if (!S.pass || !S.locker?.guns.length) bad.push(`locker ${JSON.stringify(S.locker)}`);
    if (S2.wanted !== 2 || S2.last?.rule !== 'curfew') bad.push(`wanted ${S2.wanted} ${S2.last?.rule}`);
    if (Law.wallet[H.id] !== 17 || Law.wallet[T2.id] !== 5) bad.push(`wallet ${JSON.stringify(Law.wallet)}`);
    return bad.length ? JSON.stringify(bad) : true;
  }));

  await check('holdouts: Meridian is unchanged (its pinned layout hash, the region\'s first holdout, its people) and the island golden holds', async () => {
    const M = W.holdouts.find((h) => h.id === 'meridian'), bad = [];
    const h = meridianHash(M);
    if (h !== MERIDIAN_LAYOUT) bad.push(`meridian layout ${h} != ${MERIDIAN_LAYOUT}`);
    if (W.holdouts[0] !== M || W.regions.florida.holdouts[0] !== M || Rg.towns[0].H !== M) bad.push('Meridian is not the first holdout');
    if (M.gen || M.row.place) bad.push('Meridian went through the generator');
    if (g.streamer.islandHash !== GOLDEN.islandHash) bad.push(`island ${g.streamer.islandHash}`);
    return bad.length ? JSON.stringify(bad) : true;
  });

  await check('holdouts: a generated holdout from the game camera at the widest zoom stays under 150 draw calls; every person in it carries a real flag; the Keyholder card shows with the flag behind it', async () => stage(async () => {
    const bad = [], T = Law.byId.las_palmas;
    await C('teleport', { x: T.cx, z: T.cz });
    fresh(T); await C('step', { seconds: 0.5 });
    const z0 = g.zoomLevel; g.setZoom?.(4);
    const run = await g.streamer.runFrames(1.2, null, { renderEvery: 1 });
    g.setZoom?.(z0);
    if (run.maxDrawCalls >= 150) bad.push(`draw calls ${run.maxDrawCalls}`);
    const tw = Rg.towns.find((t) => t.H === T);
    for (const r of tw.recs) { const f = r.named?.flag ?? r.flag; if (!FLAGS[f]) bad.push(`flag ${r.id} ${f}`); }
    Law.card.show(T, 3);
    const el = Law.card.el;
    if (el.classList.contains('hidden') || !el.querySelector('canvas.hkc-flag') || !el.textContent.includes(T.gen.card.name)) bad.push('card');
    Law.card.hide();
    return bad.length ? JSON.stringify({ bad, calls: run.maxDrawCalls }) : true;
  }));
}
