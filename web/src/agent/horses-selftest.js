// Selftest checks for the horses (docs/design/WEB_HORSES.md §8). The battery runs with the animals off (api.js runSelfTest);
// each check here turns the fauna layer on in a quiet stage of its own (the open desert far off the interstate; a plains
// stretch for grazing; Cottonwood Stables for the theft), puts its own horses in the ledger, and takes them away after.
// Staged positions are the documented exception; what the player does is done through commands (mount, rideTo, horseCare,
// butcher) and the real keys' code path (S.ride is what main.js calls every frame).
import { BREEDS, CARE, GAITS, STABLES, validateHorses } from '../data/horses.js';
import { SPECIES } from '../data/fauna.js';
import { ITEMS } from '../data/items.js';

const STAGE = { x: 1500, z: 900 };        // the open desert 900 m off I-10
const PLAINS = { x: -2500, z: -7500 };    // plains and flatwoods: a grazing patch
const STREET = { x: -270, z: -320 };      // Dead Man Rd on the island: a 14 m street, clear for 500 m (the statics grid only answers inside the island)
const COTTON = STABLES.find((s) => s.id === 'cottonwood');

export async function horseChecks(api, check, C) {
  const g = api.g, S = g.horses, F = g.fauna;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const steps = async (s) => { for (let t = 0; t < s; t += 0.5) await C('step', { seconds: Math.min(0.5, s - t) }); };
  const since = (seq, type, pred = () => true) => g.events.filter((e) => e.seq > seq && e.type === type && pred(e));
  const rnd = async (v, fn) => { const r = Math.random; Math.random = () => v; try { return await fn(); } finally { Math.random = r; } };
  const P = () => g.player;
  const made = [];
  const mkH = (o = {}) => {
    const p = P();
    const H = S.mk(o.breed ?? 'quarter', { x: o.x ?? p.x + 2.4, z: o.z ?? p.z, owner: o.owner ?? 'player', bond: o.bond ?? 50, saddle: o.saddle ?? true, bags: !!o.bags, name: o.name });
    made.push(H.id); H.noGraze = !o.graze; H.noLame = !o.lame; // the checks are about one thing at a time: no grazing, no random limp
    if (o.bags) S.ensureBags(H);
    S.spawnBody(H);
    return H;
  };
  const stage = async (fn, at = STAGE) => {
    const cap0 = g.inventory.carried.cap, zOn = g.zombies.enabled, rt = g.raiderTimer, cash = g.cash, socF = g.society.factions.save(), wanted = g.wanted, inv0 = JSON.parse(JSON.stringify(g.inventory.save()));
    g.zombies.enabled = false; g.raiderTimer = 1e9; g.inventory.carried.cap = 160;
    for (const ev of [...g.society.director.active]) g.society.director.cancel(ev.id);
    if (P().mount) S.dismount(P(), 'stage', false);
    if (P().inVehicle) g.exitVehicle(true);
    if (g.dialogue?.active) g.dialogue.close();
    if (g.invUI?.open) g.invUI.toggle(false);
    await C('teleport', at);
    for (const c of [...g.chars]) if (c !== P() && !c.npc && !c.stableHand && Math.hypot(c.x - at.x, c.z - at.z) < 140) g.removeChar(c);
    await C('setTime', { hour: 12 }); await C('setWeather', { key: 'CLEAR', instant: true });
    F.enabled = true; F.spawning = false; F.clear();
    const flash = g.flashOverride;
    try { return await fn(); }
    finally {
      if (P().mount) S.dismount(P(), 'stage', false);
      for (const id of made.splice(0)) { const H = S.get(id); if (H) { S.dropBody(H); S.dropBags(H); S.list.splice(S.list.indexOf(H), 1); } }
      for (const a of [...F.live]) if (a.horse) { F.remove(a); } else F.remove(a);
      for (const R of [...S.rails]) if (R.test) S.rails.splice(S.rails.indexOf(R), 1);
      F.enabled = false; F.spawning = true;
      g.zombies.enabled = zOn; g.raiderTimer = rt; g.flashOverride = flash; g.crouchOverride = false; g.aimOverride = null;
      g.cash = cash; g.wanted = wanted; g.witnesses?.clear?.(); g.inventory.load(inv0); g.inventory.carried.cap = cap0;
      if (P().knockT > 0) P().knockT = 0;
      g.society.factions.load(socF); for (const r of g.society.deeds?.rumors ?? []) r.live = false; // a theft's word does not travel on into the rest of the battery
      for (const c of [...g.chars]) if (c.stableHand) { c.stableHand = null; g.removeChar(c); }
    }
  };
  const bad = (o) => JSON.stringify(o);

  // ---- 0. the rows ------------------------------------------------------------------------------------------------------------
  await check('horses: the breed, herd, stable and gait rows validate, every breed is a fauna species with a butcher row, and a purple coat is refused', async () => {
    const issues = validateHorses();
    const species = Object.keys(BREEDS).every((b) => SPECIES[`horse_${b}`]?.butcher && SPECIES[`horse_${b}`].form === 'quad');
    const purple = validateHorses({ BREEDS: { x: { name: 'x', body: { coat: '#9a40d0' }, speed: { walk: 1, trot: 2, canter: 3, gallop: 4 }, hp: 1, tire: 1, carryKg: 1, bagL: 1, spook: 0.5, feedDay: 0.3, waterDay: 0.3, price: 1 } }, GAITS });
    const slow = validateHorses({ BREEDS: { y: { name: 'y', body: {}, speed: { walk: 5, trot: 2, canter: 3, gallop: 4 }, hp: 1, tire: 1, carryKg: 1, bagL: 1, spook: 0.5, feedDay: 0.3, waterDay: 0.3, price: 1 } }, GAITS });
    const items = ['hay', 'oats', 'saddle', 'saddlebags', 'lead_rope', 'horse_brush', 'hoof_pick'].every((i) => ITEMS[i]);
    return !issues.length && species && purple.some((m) => /purple/.test(m)) && slow.some((m) => /gait speeds/.test(m)) && items ? true : bad({ issues, species, purple, slow, items });
  });

  // ---- 1. mount and dismount ---------------------------------------------------------------------------------------------------
  await check('horses: mount and dismount - swing up beside it, drawn in the saddle, it carries you, E gets down, a rail ties it, bareback and a stranger\'s horse are different', async () => stage(async () => {
    const p = P(), H = mkH(); await steps(0.5);
    const prompt = S.nearFor(p);
    const seq = g.eventSeq;
    const r = await C('mount', { id: H.id });
    await steps(1.5);
    const up = p.mount === H && p.seatPose?.kind === 'ride' && p.seatPose.y > 0.5 && p.seatPose.y < 2.4;
    const x0 = p.x;
    await C('rideTo', { x: p.x + 12, z: p.z, gait: 'walk', maxSeconds: 25 });
    const together = Math.hypot(p.x - H.x, p.z - H.z) < 0.05 && p.x - x0 > 8;
    const rail = { x: H.x, z: H.z + 1.8, test: true }; S.rails.push(rail);
    await C('dismount');
    const tied = !!H.tied?.post && !p.mount && p.seatPose === null && dist(p, H) > 0.8 && dist(p, H) < 2.2;
    const ev = since(seq, 'mounted').length === 1 && since(seq, 'dismounted', (e) => e.tied).length === 1;
    // E in the saddle goes through the real update code (main.js hands S.ride the input)
    await C('mount', { id: H.id }); await steps(1.2);
    const stay = S.ride(p, { key: () => false, hit: () => false }, 0.016), stillUp = p.mount === H;
    const gotOff = S.ride(p, { key: () => false, hit: (k) => k === 'KeyE' }, 0.016) === false && !p.mount;
    const gotBy = stay && stillUp && gotOff;
    H.tied = null;
    // bareback: aim taxed more, no melee; a stranger's horse (bond 0, no saddle) may throw you
    const sad = H.saddle; H.saddle = false; H.v = 6;
    p.mount = H; const tb = S.aimTax(p), mb = S.canMelee(p); H.saddle = sad; const ts = S.aimTax(p), ms = S.canMelee(p); p.mount = null; p.seatPose = null; H.v = 0;
    return prompt?.verb === 'mount' && r.ok && up && together && tied && ev && gotBy && tb > ts && !mb && ms ? true : bad({ verb: prompt?.verb, up, together, tied, ev, gotBy, tb, ts, mb, ms, seat: p.seatPose });
  }));

  // ---- 2. stamina ------------------------------------------------------------------------------------------------------------------
  await check('horses: stamina - a gallop drains the tank at its gait\'s rate, empty is BLOWN and it can only walk, rest refills and it runs again', async () => stage(async () => {
    const p = P(), H = mkH({ breed: 'quarter' }); await steps(0.5);
    await C('mount', { id: H.id }); await steps(1.2);
    const seq = g.eventSeq, biome = F.biomeAt(H.x, H.z), T = CARE.terrain[biome] ?? { tire: 1.15 };
    H.stamina = 0.45; H.goto = { x: p.x, z: p.z + 380, gait: 'gallop', tol: 1 };   // south: the desert stage is clear for 400 m that way
    // sample every quarter second: the drain per gallop second, and what the horse does once it is blown
    let gall = 0, drop = 0, wantSum = 0, last = H.stamina, blownMaxV = 0, blownSeen = false, blownT = 0, t = 0; const trace = [];
    while (H.goto && t < 70 && p.mount === H) {
      await C('step', { seconds: 0.25 }); t += 0.25;
      if (H.gait === 'gallop' && !H.blown && H.stamina < last) { gall += 0.25; drop += last - H.stamina; wantSum += GAITS.gallop.drain * BREEDS.quarter.tire * (CARE.terrain[F.biomeAt(H.x, H.z)]?.tire ?? 1.15) * 0.25; }
      if (H.blown) { blownSeen = true; blownT += 0.25; if (blownT > 1.5) blownMaxV = Math.max(blownMaxV, H.v); } else blownT = 0; // 1.5 s to shed the speed it had
      last = H.stamina;
      if (Math.round(t * 4) % 16 === 0) trace.push([t, H.gait, +H.stamina.toFixed(2), +H.v.toFixed(1), Math.round(H.x)]);
    }
    const rate = gall > 3 ? drop / gall : 0, want = wantSum / Math.max(0.25, gall);
    const rateOk = gall > 3 && Math.abs(drop - wantSum) < wantSum * 0.25;
    const blown = since(seq, 'horseBlown').length >= 1 && blownSeen;
    const walking = blownMaxV <= BREEDS.quarter.speed.trot;
    const lasted = 1 / (GAITS.gallop.drain * BREEDS.quarter.tire) > 15;   // a full tank is a believable gallop: 20-40 s, not 5
    // rest (the rider just sits): the tank refills and the wind comes back
    H.goto = null; const blownNow = H.blown; await steps(16);
    const rested = H.stamina > 0.4 && !H.blown;
    H.goto = { x: p.x, z: p.z + 60, gait: 'gallop', tol: 1 }; await steps(5);
    const galloped = H.v > BREEDS.quarter.speed.canter * T.v * 0.9; H.goto = null;
    return blown && walking && lasted && rateOk && rested && galloped ? true : bad({ trace: JSON.stringify(trace), ended: { t, goto: !!H.goto, mounted: p.mount === H, bolts: since(seq, 'horseBolt').length, thrown: since(seq, 'thrown').length, lame: H.lame, x: +(p.x - 0).toFixed(1) }, rate: +rate.toFixed(4), want: +want.toFixed(4), gall, blown, blownMaxV: +blownMaxV.toFixed(2), walking, lasted, blownNow, rested, stamina: H.stamina, galloped, v: H.v, biome });
  }));

  // ---- 3. feed and water --------------------------------------------------------------------------------------------------------
  await check('horses: feed - hunger and thirst run on the game clock at the breed\'s rate, hay and oats fill the tank, the starving lose hp, a plains horse grazes and the patch thins', async () => stage(async () => {
    const p = P(), H = mkH({ breed: 'quarter' }); await steps(0.5);
    H.feed = 0.6; H.water = 0.6; const h0 = S.hours(), f0 = H.feed, w0 = H.water;
    await steps(10);
    const dh = S.hours() - h0;
    const expF = BREEDS.quarter.feedDay * dh / 24, expW = BREEDS.quarter.waterDay * dh / 24;
    const fAfter = H.feed, wAfter = H.water;
    const rateOk = Math.abs((f0 - fAfter) - expF) < expF * 0.2 + 0.003 && Math.abs((w0 - wAfter) - expW) < expW * 0.2 + 0.003 && dh > 0.1;
    // items
    H.feed = 0.2; g.inventory.stow('hay', 2); g.inventory.stow('oats', 2);
    const seq = g.eventSeq;
    await C('horseCare', { id: H.id, action: 'feed', item: 'hay' });
    const afterHay = H.feed;
    H.stamina = 0.3;
    await C('horseCare', { id: H.id, action: 'feed', item: 'oats' });
    const oatsOk = H.stamina >= 0.3 + CARE.oatsStamina - 0.01 && H.feed > afterHay;
    const hayLeft = g.inventory.carried.count('hay'), fedEv = since(seq, 'horseFed').length;
    const hayOk = Math.abs(afterHay - (0.2 + CARE.hay)) < 0.03 && hayLeft === 1 && fedEv === 2;
    // starving: the tank at 0 costs hp by the hour
    H.feed = 0; const hp0 = H.hp, h1 = S.hours(); await steps(18);
    const lost = hp0 - H.hp, hrs = S.hours() - h1;
    const starve = lost > 0.4 && Math.abs(lost - CARE.starveHpPerHour * hrs) < CARE.starveHpPerHour * hrs * 0.35 + 0.5;
    // a hungry horse feeds off the land where there is grass
    await C('teleport', PLAINS); await steps(1);
    const Hg = mkH({ breed: 'pony', x: PLAINS.x + 3, z: PLAINS.z, graze: true }); Hg.feed = 0.3; Hg.water = 0.9; Hg.tied = null; await steps(0.6);
    const b = F.biomeAt(Hg.x, Hg.z), patch0 = g.outdoors.patch(Hg.x, Hg.z).r;
    await steps(12);
    const patch1 = g.outdoors.patch(Hg.x, Hg.z).r, grazed = Hg.feed > 0.3 + 0.04 && patch1 < patch0 - 0.005;
    return rateOk && hayOk && oatsOk && starve && grazed ? true : bad({ rateOk, dh, expF, expW, drop: [f0 - fAfter, w0 - wAfter], hayOk, hayLeft, fedEv, afterHay, oatsOk, starve, lost, hrs, biome: b, graze: { feed: Hg.feed, patch0, patch1 } });
  }));

  // ---- 4. fright ------------------------------------------------------------------------------------------------------------------
  await check('horses: a bang bolts a horse that does not know you, a raised one holds, a ridden bolt overrides the reins, and a hard fright throws a rider who is not bonded', async () => stage(async () => {
    const p = P(), seq = g.eventSeq;
    const wild = mkH({ breed: 'mustang', bond: 0, x: p.x + 30, z: p.z, saddle: false }); await steps(0.5);
    const bang = (from) => g.noise(from.x - 25, from.z, 70, p);          // through main.noise -> horses.onNoise
    await rnd(0, async () => { bang(wild); });
    await steps(1.2);
    const x0 = wild.x;
    const bolted = since(seq, 'horseBolt', (e) => e.id === wild.id).length === 1 && wild.boltT > 0 && wild.v > 5;
    await steps(1);
    const away = wild.x - x0 > 3;                                          // the bang was to its west: it runs east, away
    const calm = mkH({ breed: 'mustang', bond: 100, x: p.x + 40, z: p.z + 10 }); await steps(0.3);
    const s2 = g.eventSeq;
    await rnd(0.5, async () => { g.noise(calm.x - 25, calm.z, 70, p); });
    await steps(0.5);
    const held = !since(s2, 'horseBolt', (e) => e.id === calm.id).length && calm.fearCd > 0;
    // ridden and bonded: the bolt takes the reins, no throw
    for (const h of [wild, calm]) { S.dropBody(h); S.list.splice(S.list.indexOf(h), 1); }
    const R = mkH({ breed: 'quarter', bond: 100 }); await steps(0.3);
    await C('mount', { id: R.id, force: true }); await steps(1.2);
    await rnd(0, async () => { S.frighten(R, p.x - 20, p.z, 1, 1); });
    R.goto = { x: p.x - 30, z: p.z, gait: 'walk', tol: 1 };            // the rider asks it to walk west, toward the noise
    const px0 = p.x; await steps(1.4);
    const reins = R.boltT > 0 && p.mount === R && p.x - px0 > 3 && R.v > BREEDS.quarter.speed.trot;
    R.goto = null; R.boltT = 0; await C('dismount'); S.dropBody(R); S.list.splice(S.list.indexOf(R), 1);
    // ridden and unbonded under a blast: thrown
    const T = mkH({ breed: 'mustang', bond: 0 }); await steps(0.3);
    const tm = await C('mount', { id: T.id, force: true }); await steps(1.2);
    const s3 = g.eventSeq;
    await rnd(0, async () => { S.onNoise(p.x - 20, p.z, 100, {}); });
    await steps(0.6);
    const thrownEv = since(s3, 'thrown', (e) => e.from === 'horse'), thrown = !p.mount && thrownEv.length >= 1;
    return bolted && away && held && reins && thrown ? true : bad({ bolted, boltT: wild.boltT, v: wild.v, away, held, reins, rboltT: R.boltT, rv: R.v, rx: p.x - px0, thrown, thrownEv: thrownEv.length, mounted: !!p.mount, tbolt: T.boltT, tm: tm.text ?? tm.error });
  }));

  // ---- 5. theft --------------------------------------------------------------------------------------------------------------------
  await check('horses: a stable\'s horse is bought with real cash or taken - taking it under its keeper\'s eye is a steal deed naming the horse', async () => stage(async () => {
    const p = P(), at = { x: COTTON.x, z: COTTON.z - 4 };
    await C('teleport', at); await steps(0.5); S.hands(); await steps(0.5); S.hands();
    const hand = S.handOf('cottonwood');
    // its own two horses at the rails (the real stock is not touched: a battery earlier in the day may have sold it)
    const H = mkH({ breed: 'quarter', owner: 'stable:cottonwood', name: 'Testbiscuit', bond: 20, x: COTTON.x + 9, z: COTTON.z + 5.8 }); H.tied = { x: H.x, z: H.z, post: true }; H.price = BREEDS.quarter.price;
    const B = mkH({ breed: 'pony', owner: 'stable:cottonwood', name: 'Testpepper', bond: 20, x: COTTON.x + 14, z: COTTON.z + 5.8 }); B.tied = { x: B.x, z: B.z, post: true }; B.price = BREEDS.pony.price;
    if (!hand || !H) return bad({ hand: !!hand, horse: !!H });
    await steps(1);
    P().x = H.x - 1.2; P().z = H.z;
    const o = S.nearFor(P());
    const price = Math.round(H.price);
    // too poor: refused, nothing changes
    g.cash = price - 5;
    P().x = H.x - 1.2; P().z = H.z; const poor = S.interact({ h: H, verb: 'buy' }, 'KeyE');
    // take her: a witnessed theft deed
    const seq = g.eventSeq;
    P().x = H.x - 1.2; P().z = H.z;
    const near0 = S.nearFor(P()), at0 = { px: +P().x.toFixed(1), pz: +P().z.toFixed(1), hx: +H.x.toFixed(1), hz: +H.z.toFixed(1), near: near0 && near0.h.name, nn: S.nearest(P().x, P().z, 3.2)?.id, nnName: S.nearest(P().x, P().z, 3.2)?.name, hid: H.id, nnBody: !!S.bodyOf(S.nearest(P().x, P().z, 3.2) ?? {}), body: !!S.bodyOf(H), fOn: F.enabled, live: F.live.length, mount: !!P().mount, alive: P().alive, veh: !!P().inVehicle };
    const r = await C('mount', { id: H.id, force: false });
    const deed = since(seq, 'deed', (e) => e.verb === 'steal' && e.witnesses >= 1);
    const stolen = since(seq, 'horseStolen', (e) => e.witnessed).length === 1 && H.stolen && H.owner === 'player' && P().mount === H;
    await C('dismount');
    // restore the stable's stock for the rest of the battery
    H.owner = 'stable:cottonwood'; H.stolen = null; H.tied = { x: H.x, z: H.z, post: true };
    // buy another: cash goes, ownership changes, no deed
    g.cash = 500; const s2 = g.eventSeq, c0 = g.cash;
    P().x = B.x - 1.2; P().z = B.z; await steps(0.3);
    const bought = await C('mount', { id: B.id, buy: true });
    const paid = c0 - g.cash === Math.round(B.price) && B.owner === 'player' && !since(s2, 'deed', (e) => e.verb === 'steal').length;
    await C('dismount'); B.owner = 'stable:cottonwood'; B.tied = { x: B.x, z: B.z, post: true };
    return o?.verb === 'buy' && !poor.ok && /\$/.test(poor.why) && deed.length === 1 && stolen && paid ? true : bad({ verb: o?.verb, poor, deed: deed.length, stolen, paid, r: r.text ?? r.error, bought: bought.text, hand: !!hand, at0, stolenv: H.stolen, owner: H.owner, mount: P().mount?.id });
  }, { x: COTTON.x, z: COTTON.z - 4 }));

  // ---- 6. saddlebags -----------------------------------------------------------------------------------------------------------
  await check('horses: saddlebags carry by breed in litres, the PACK screen finds them beside the horse, loaded bags slow a light breed, and a dead horse spills them where it fell', async () => stage(async () => {
    const p = P(), H = mkH({ breed: 'pony', bags: true, saddle: true }), D = mkH({ breed: 'draft', bags: true, saddle: true, x: p.x + 8 }); await steps(0.6);
    const capOk = H.bagBox.cap === BREEDS.pony.bagL && D.bagBox.cap === BREEDS.draft.bagL && D.bagBox.cap > H.bagBox.cap;
    // fill them from your pack with a real item
    const wb0 = g.inventory.carried.count('water_bottle'); g.inventory.stow('water_bottle', 3); g.inventory.stow('beans_tin', 4);
    const put = await C('horseBags', { id: H.id, put: 'water_bottle', n: 3 }); await C('horseBags', { id: H.id, put: 'beans_tin', n: 4 });
    const held = put.items.filter((i) => i.id === 'water_bottle').reduce((a, i) => a + i.n, 0) === 3 && g.inventory.carried.count('water_bottle') === wb0;
    // the pack finds the bags beside the horse (E or I opens the nearest box)
    p.x = H.x - 1.5; p.z = H.z; const near = g.inventory.nearest(p.x, p.z, 2.6, true);
    const pack = near?.id === `bags:${H.id}`;
    // the weight: rider + pack over the breed's carryKg slows it; the draft horse does not mind
    const wt = (h) => g.inventory.kg() + S.carryKg(h) + 70 - BREEDS[h.breed].carryKg;
    const heavy = { ...g.inventory.carried }; void heavy;
    g.inventory.stow('scrap', 12); g.inventory.stow('fuel_can', 2);
    const overPony = wt(H), overDraft = wt(D);
    const slows = overPony > 0 && overDraft < overPony;
    // take it back out
    const tk = await C('horseBags', { id: H.id, take: 'beans_tin', n: 4 });
    const back = g.inventory.carried.count('beans_tin') === 4 && !tk.items.some((i) => i.id === 'beans_tin');
    // a dead horse spills what it carried at its feet
    await C('horseSet', { id: H.id, kill: true }); await steps(0.8);
    const gr = g.inventory.groundAt(H.x, H.z, 0);
    const spilled = !H.alive && gr.slots.some((s) => s.id === 'water_bottle') && !g.inventory.boxes.has(`bags:${H.id}`);
    return capOk && held && pack && slows && back && spilled ? true : bad({ capOk, held, pack, slows, overPony, overDraft, back, spilled, ground: gr.slots.map((s) => s.id) });
  }));

  // ---- 7. the world's horses: tied, loose, wild, tamed ---------------------------------------------------------------------------
  await check('horses: a tied horse stays put, a loose one stays near where it was left, and a wild one bolts from a person but lets one with oats close and is gentled to a rope', async () => stage(async () => {
    const p = P();
    const T = mkH({ x: p.x + 20, z: p.z }); await steps(0.4); await C('horseSet', { id: T.id, tied: true });
    const L = mkH({ x: p.x + 20, z: p.z + 12 }); await steps(0.4);
    const tx = T.x, lx = L.x, lz = L.z;
    await steps(8);
    const tiedStay = dist(T, { x: tx, z: p.z }) < 0.6;
    const looseNear = dist(L, { x: lx, z: lz }) < 12;
    // wild: no feed in your pack -> the herd bolts (the fauna layer's own fright)
    const W = mkH({ breed: 'mustang', owner: 'wild', bond: 0, saddle: false, x: p.x + 13, z: p.z - 12 }); W.hx = W.x; W.hz = W.z; await steps(0.3);
    const aW = S.bodyOf(W); F.groupUp();
    await steps(2.2);
    const bolts = aW.state === 'flee' || aW.fleeT > 0;
    // with oats, still: it lets you close
    const W2 = mkH({ breed: 'mustang', owner: 'wild', bond: 0, saddle: false, x: p.x + 14, z: p.z + 26 }); await steps(0.3);
    g.inventory.stow('oats', 5); g.inventory.stow('lead_rope', 1);
    const a2 = S.bodyOf(W2); F.groupUp();
    await C('teleport', { x: W2.x - 9, z: W2.z }); await steps(2.4);
    const calm = !(a2.fleeT > 0) && W2.alive;
    await C('teleport', { x: W2.x - 1.6, z: W2.z });
    let r; const seq = g.eventSeq;
    for (let k = 0; k < 4; k++) { r = await C('horseCare', { id: W2.id, action: 'gentle', force: true }); if (W2.bond >= CARE.tameBond) break; }
    const trusting = W2.bond >= CARE.tameBond && W2.owner === 'wild';
    const rr = await C('horseCare', { id: W2.id, action: 'gentle', force: true });
    const tamed = W2.owner === 'player' && since(seq, 'horseTamed').length === 1 && g.inventory.carried.count('oats') < 5 && S.bodyOf(W2)?.ctl === true;
    return tiedStay && looseNear && bolts && calm && trusting && tamed ? true : bad({ tiedStay, looseNear, bolts, state: aW.state, calm, flee: a2.fleeT, tk: a2.tk, tdist: a2.tdist, speed: p.speed, gentle: a2.gentle?.(p), bond: W2.bond, trusting, owner: W2.owner, r: r?.text, rr: rr?.text });
  }));

  // ---- 8. obstacles ------------------------------------------------------------------------------------------------------------------
  await check('horses: it hops a low fence at a trot or better and a tall wall stops it', async () => stage(async () => {
    const p = P(), H = mkH({ breed: 'quarter' }); await steps(0.4);
    await C('mount', { id: H.id }); await steps(1.2);
    const x0 = p.x, z0 = p.z, boxes = [];
    boxes.push(g.statics.add(x0 + 14, z0 - 9, x0 + 14.5, z0 + 9, 'wall', 0.9));   // a rail fence
    boxes.push(g.statics.add(x0 + 44, z0 - 9, x0 + 44.5, z0 + 9, 'wall', 3));     // a wall
    try {
      const seq = g.eventSeq;
      await C('rideTo', { x: x0 + 30, z: z0, gait: 'canter', hop: true, maxSeconds: 14, tolerance: 1.5 });
      const hopped = p.x > x0 + 15 && since(seq, 'horseHop').length >= 1;
      await C('rideTo', { x: x0 + 70, z: z0, gait: 'canter', hop: true, maxSeconds: 8, tolerance: 1.5 });
      const stopped = p.x < x0 + 44 && p.x > x0 + 38;
      // a walk does not hop (the formula wants trot or better): at a walk the fence stops it
      return hopped && stopped ? true : bad({ hopped, stopped, x: +(p.x - x0).toFixed(1), hops: since(seq, 'horseHop').length });
    } finally { for (const b of boxes) { b.minX = b.maxX = b.minZ = b.maxZ = 1e9; } }
  }, STREET));

  // ---- 9. combat from the saddle --------------------------------------------------------------------------------------------------
  await check('horses: a hit throws the rider, a dead horse is a carcass that butchers into meat and a hide, and a horse of yours can be buried', async () => stage(async () => {
    const p = P(), H = mkH({ breed: 'quarter', bond: 70 }); await steps(0.4);
    await C('mount', { id: H.id }); await steps(1.2);
    const seq = g.eventSeq, a = S.bodyOf(H);
    F.hurt(a, 30, null, 1, 0, 'bullet');
    await steps(0.6);
    const thrown = !p.mount && since(seq, 'thrown', (e) => e.why === 'hit').length === 1 && since(seq, 'horseHit').length >= 1;
    p.knockT = 0;
    F.hurt(a, 1e6, null, 1, 0, 'bullet'); await steps(0.8);
    const dead = !H.alive && a.dead && since(seq, 'horseDied').length === 1;
    g.inventory.stow('knife', 1);
    p.x = a.x + 1.4; p.z = a.z;
    const b = await C('butcher', { id: a.id, force: true });
    const items = (b.items ?? []).map((i) => i.item);
    const meatN = g.inventory.carried.count('raw_venison'), meat = items.includes('raw_venison') && meatN >= 5;
    // and a grave
    const G = mkH({ breed: 'pony' }); await steps(0.3); await C('horseSet', { id: G.id, kill: true }); await steps(0.6);
    g.inventory.stow('crowbar', 1);
    const n0 = S.graves.length, br = await C('horseCare', { id: G.id, action: 'bury', force: true });
    const grave = S.graves.length === n0 + 1 && G.buried;
    S.graves.length = n0;
    return thrown && dead && meat && grave ? true : bad({ thrown, dead, items, meat, meatN, grave, br, graves: S.graves.length, n0, buried: G.buried, alive: G.alive });
  }));

  // ---- 10. the noise of it ------------------------------------------------------------------------------------------------------------
  await check('horses: noise goes by gait - a walk is nearly silent, a gallop carries 30 m, and the HUD chip says what the horse has left', async () => stage(async () => {
    const p = P(), H = mkH({ breed: 'quarter' }); await steps(0.4);
    await C('mount', { id: H.id }); await steps(1.2);
    const radii = [], n0 = g.noise.bind(g);
    g.noise = (x, z, r, src) => { if (src === p) radii.push(r); return n0(x, z, r, src); };
    try {
      await C('rideTo', { x: p.x + 14, z: p.z, gait: 'walk', maxSeconds: 20, tolerance: 1 });
      const walk = Math.max(0, ...radii); radii.length = 0;
      H.stamina = 1;
      await C('rideTo', { x: p.x + 50, z: p.z, gait: 'gallop', maxSeconds: 12, tolerance: 1 });
      const gallop = Math.max(0, ...radii);
      const chip = S.chip(p), hud = g.hud.s?.footing ?? '';
      return walk <= GAITS.walk.noise && gallop >= GAITS.gallop.noise - 0.1 && /FEED/.test(chip) && chip.includes(H.name.toUpperCase()) && hud.includes(H.name.toUpperCase()) ? true : bad({ walk, gallop, chip: chip.slice(0, 80), hud: String(hud).slice(0, 60) });
    } finally { delete g.noise; }
  }));

  // ---- 11. lameness ------------------------------------------------------------------------------------------------------------------
  await check('horses: a lame horse cannot canter and slows, heals only at rest and fed, and a bandage halves the time', async () => stage(async () => {
    const p = P(), H = mkH({ breed: 'quarter' }); await steps(0.4);
    await C('mount', { id: H.id }); await steps(1.2);
    S.lame(H, 'a stone in the hoof', true);
    const r = await C('rideTo', { x: p.x + 60, z: p.z, gait: 'gallop', maxSeconds: 12, tolerance: 1 });
    const slow = H.v <= BREEDS.quarter.speed.trot * CARE.lame.slowMul * 1.05 + 0.2 && ['trot', 'walk'].includes(H.gait);
    await C('dismount'); const a = S.bodyOf(H);
    a.speed = 0; const l0 = H.lame; S.care(H, a, 3); const rested = l0 - H.lame > 2.5;
    H.feed = 0; const l1 = H.lame; S.care(H, a, 2); const hungry = H.lame >= l1 - 1e-6;
    H.feed = 0.9; g.inventory.stow('bandage', 1);
    const l2 = H.lame; const tr = await C('horseCare', { id: H.id, action: 'treat', force: true });
    const halved = Math.abs(H.lame - l2 * CARE.lame.bandageMul) < 0.01;
    return slow && rested && hungry && halved ? true : bad({ slow, v: H.v, gait: H.gait, rested, hungry, halved, lame: H.lame, l2, tr, r: r.gait });
  }));

  // ---- 12. the ledger and the save ------------------------------------------------------------------------------------------------------
  await check('horses: save and load round trip - owners, bond, feed, lameness, tack and the saddlebags\' contents come back, the herds are not laid again and a dead wild horse stays dead', async () => stage(async () => {
    const p = P(), H = mkH({ breed: 'draft', bags: true, saddle: true, bond: 63, name: 'Judge2' }); await steps(0.4);
    H.feed = 0.42; H.water = 0.31; H.lame = 4; H.tied = { x: H.x, z: H.z, post: false };
    g.inventory.stow('water_bottle', 2); await C('horseBags', { id: H.id, put: 'water_bottle', n: 2 });
    const wildAlive = () => S.list.filter((h) => h.alive && h.owner === 'wild').length;
    const w = S.list.find((h) => h.alive && h.owner === 'wild'); w.hp = 0; S.died(w, 'staged');
    const n0 = S.list.length, wa0 = wildAlive(), placed0 = [...S.placed].sort().join();
    const snapG = (await C('save')).save, inSnap = !!snapG.horses && snapG.horses.list.some((r) => r.id === H.id);
    const snap = JSON.parse(JSON.stringify(S.save()));
    H.feed = 0; H.bond = 1; H.lame = 0; H.saddle = false; S.releaseBags(H);
    S.load(snap);
    const R = S.get(H.id);
    const ok = R && R.bond === 63 && R.feed === 0.42 && R.water === 0.31 && R.lame === 4 && R.saddle && R.bags && R.owner === 'player' && R.name === 'Judge2' && !!R.tied
      && R.bagBox?.slots.filter((s) => s.id === 'water_bottle').reduce((a, s) => a + s.n, 0) === 2 && g.inventory.boxes.get(`bags:${H.id}`) === R.bagBox
      && S.list.length === n0 && wildAlive() === wa0 && [...S.placed].sort().join() === placed0 && !S.get(w.id).alive;
    // a mounted save comes back in the saddle
    p.x = R.x - 1.4; p.z = R.z; await steps(0.5);
    await C('mount', { id: R.id, force: true }); await steps(1.2);
    const snap2 = JSON.parse(JSON.stringify(S.save())), mountedSaved = snap2.mounted === R.id;
    S.load(snap2); await steps(0.8);
    const back = P().mount?.id === R.id && P().seatPose?.kind === 'ride';
    await C('dismount');
    return ok && inSnap && mountedSaved && back ? true : bad({ ok: !!ok, owner: R?.owner, name: R?.name, water: R?.water, tiedv: R?.tied, bagslot: R?.bagBox?.slots, boxIs: g.inventory.boxes.get(`bags:${H.id}`) === R?.bagBox, dead: S.get(w.id)?.alive, inSnap, mountedSaved, back, R: R && { bond: R.bond, feed: R.feed, lame: R.lame, saddle: R.saddle, bags: R.bags, tied: !!R.tied, bag: R.bagBox?.slots.length }, n: [S.list.length, n0], wa: [wildAlive(), wa0] });
  }));

  // ---- 13. the stray ---------------------------------------------------------------------------------------------------------------------
  await check('horses: a stray horse is something the world can say - strayNear names the nearest wild horse and its herd', async () => {
    const s = S.strayNear(-5000, 0, 1e9);
    return s && s.breed && s.herd && Number.isFinite(s.dist) ? true : bad(s);
  });
}
