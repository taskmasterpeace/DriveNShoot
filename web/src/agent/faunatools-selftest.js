// Selftest checks for the fauna layer (docs/design/WEB_FAUNA.md §8). The battery runs with the animals off
// (api.js runSelfTest); each check here turns them on in a quiet stage of its own (the open desert far off the
// interstate: no road, no traffic; the island's river bank for the gator, the Fused Flat for the hot ground), with the director's own spawning off so only the check's animals
// are about, and takes them away after. Staged positions are the documented exception; what the player does is done
// through commands (moveTo, fire, drive, butcher, cook).
import * as THREE from 'three';
import { outfit } from '../systems/characters.js';
import { SPECIES, ACTIVE, FAUNA_RULES } from '../data/fauna.js';

const STAGE = { x: 1500, z: 900 }; // the open desert 900 m off I-10: no road, no traffic, no town (presence 0)
const RIVER = { x: 398, z: -112 }; // the river's west bank (world/water.js RIVER, half-width 11 m)

export async function faunaChecks(api, check, C) {
  const g = api.g, F = g.fauna;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const since = (seq, type, pred = () => true) => g.events.filter((e) => e.seq > seq && e.type === type && pred(e));
  const steps = async (s) => { for (let t = 0; t < s; t += 0.5) await C('step', { seconds: Math.min(0.5, s - t) }); };
  const stage = async (fn, o = {}) => {
    const zOn = g.zombies.enabled, rt = g.raiderTimer, wOn = g.wilds.enabled;
    g.zombies.enabled = false; g.raiderTimer = 1e9; if (!o.wilds) g.wilds.enabled = false;
    for (const ev of [...g.society.director.active]) g.society.director.cancel(ev.id);
    if (g.player.inVehicle) g.exitVehicle(true);
    if (g.dialogue?.active) g.dialogue.close();
    if (g.invUI?.open) g.invUI.toggle(false);
    const at = o.at ?? STAGE;
    const tp = await C('teleport', at);
    const tpBad = !tp.ok || Math.hypot(g.player.x - at.x, g.player.z - at.z) > 6 ? `the stage teleport to ${at.x},${at.z} failed: ${tp.error ?? `stood at ${g.player.x.toFixed(1)},${g.player.z.toFixed(1)}`}` : null;
    for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - at.x, c.z - at.z) < 140) g.removeChar(c);
    for (const v of [...g.vehicles]) if (!v.driver && v.test) g.vehiclesSys?.remove?.(v);
    await C('setTime', { hour: o.hour ?? 12 }); await C('setWeather', { key: 'CLEAR', instant: true });
    g.throwables.fires.length = 0;
    F.enabled = true; F.spawning = !!o.spawning; F.clear(); F.bodies.clear(); F.job = null;
    const flash = g.flashOverride, hp = g.player.hp;
    try { return tpBad ?? await fn(); }
    finally {
      g.zombies.enabled = zOn; g.raiderTimer = rt; g.wilds.enabled = wOn; g.flashOverride = flash; g.player.hp = hp; g.aimOverride = null;
      g.throwables.fires.length = 0;
      for (const a of [...F.live]) F.remove(a);
      F.enabled = false; F.spawning = true; F.bodies.clear(); F.job = null;
      if (g.player.inVehicle) g.exitVehicle(true);
      for (const v of [...g.vehicles]) if (v.test && !v.driver) g.vehiclesSys.remove(v);
    }
  };
  const dummy = (x, z, extra = {}) => {
    const c = g.addChar({ x, z, faction: 'drifter', colors: outfit('drifter'), name: 'Fauna Dummy', flag: 'US', hp: extra.hp ?? 100 });
    c.home = { x: c.x, z: c.z }; c.wx = c.x; c.wz = c.z; c.hold = true; c.maxHp = extra.maxHp ?? 100; Object.assign(c, extra);
    g.society.factions.assign(c);
    return c;
  };
  const P = () => g.player;
  // A buggy 6 m ahead of you (+z), and you at its wheel. Found by where it was put, not by id alone: a restored world
  // can hold an older vehicle with the same id (the island's traffic), and enterVehicle id= would find that one.
  const car = async () => {
    const p = P(), at = { x: p.x, z: p.z + 6 };
    const { id } = await C('spawnVehicle', { type: 'buggy', x: at.x, z: at.z, heading: 0 });
    const v = g.vehicles.filter((o) => o.id === id).sort((a, b) => dist(a, at) - dist(b, at))[0];
    v.test = true;
    g.enterVehicle(v);
    return v;
  };

  // ---- 1. the formula ---------------------------------------------------------------------------------------------
  await check('fauna: the formula - a desert chunk holds more coyotes at night than by day, a town chunk next to none, gunfire thins it, and rolled records average the formula', async () => stage(async () => {
    const far = { cx: 5, cz: 1 }; // open desert east of the island on the corridor
    const day = F.density(far.cx, far.cz, { hour: 12 }), night = F.density(far.cx, far.cz, { hour: 23 }), dawn = F.density(far.cx, far.cz, { hour: 6 });
    const row = (D, s) => D.rows.find((r) => r.species === s)?.expected ?? 0;
    const ratio = row(night, 'coyote') / Math.max(1e-9, row(day, 'coyote')), want = ACTIVE.nocturnal.night / ACTIVE.nocturnal.day;
    const rabbitDawn = row(dawn, 'jackrabbit') > row(day, 'jackrabbit');
    // A built town's chunk on the corridor against the far one, at the same hour.
    const T = g.streamer.W.towns.find((t) => t.built && t.id !== 'phoenix');
    const town = F.density(Math.floor(T.x / FAUNA_RULES.chunk), Math.floor(T.z / FAUNA_RULES.chunk), { hour: 23, region: 'west' });
    const townOk = town.presence >= 0.85 && town.total <= night.total * 0.15;
    // A gunfight heats the far chunk: everything there thins by exactly (1 - presence).
    const cx = (far.cx + 0.5) * FAUNA_RULES.chunk, cz = (far.cz + 0.5) * FAUNA_RULES.chunk, before = F.density(far.cx, far.cz, { hour: 23 });
    F.addHeat(cx, cz, 1.2);
    const after = F.density(far.cx, far.cz, { hour: 23 });
    F.heat.clear();
    const k = (1 - after.presence) / (1 - before.presence), thin = after.presence > before.presence && Math.abs(row(after, 'coyote') - row(before, 'coyote') * k) < 1e-3;
    // The records: 600 rolls of the night chunk average its expected numbers (within 15%, for every row worth counting).
    const sums = {};
    for (let i = 0; i < 600; i++) { const c = F.rollCounts(night, 1000 + i * 7919); for (const [s, n] of Object.entries(c)) sums[s] = (sums[s] ?? 0) + n; }
    const off = night.rows.filter((r) => r.expected >= 0.15).map((r) => ({ s: r.species, want: r.expected, got: +((sums[r.species] ?? 0) / 600).toFixed(3) })).filter((r) => Math.abs(r.got - r.want) > r.want * 0.15);
    // And the director itself: the stage's own chunk comes alive with exactly its roll's records, every one in a fitting spot.
    F.spawning = true;
    await C('teleport', { x: 1400, z: 380 });
    await steps(1);
    const cell = F.cells.get(`${Math.floor(1400 / 256)},${Math.floor(380 / 256)}`);
    const recsOk = !!cell?.roll && cell.recs.length <= FAUNA_RULES.chunkBudget && cell.recs.every((r) => SPECIES[r.sp]);
    const ok = Math.abs(ratio - want) < want * 0.01 && rabbitDawn && townOk && thin && !off.length && recsOk;
    return ok ? true : JSON.stringify({ ratio, want, rabbitDawn, town: { p: town.presence, t: town.total, far: night.total }, thin: { b: before.presence, a: after.presence }, off, recs: cell?.recs.length, roll: cell?.roll }).slice(0, 500);
  }));

  // ---- 2. prey: a gunshot and a car ----------------------------------------------------------------------------------
  await check('fauna: a mule deer herd grazes calm, bolts at a gunshot, and runs from a car coming at it', async () => stage(async () => {
    const p = P();
    const herd = F.spawn('mule_deer', p.x + 34, p.z, 5, { test: true });
    await steps(2);
    const calm = herd.every((a) => a.state === 'graze' || a.state === 'idle' || a.state === 'alert');
    const d0 = herd.reduce((k, a) => k + dist(a, p), 0) / herd.length, seq = g.eventSeq;
    await C('fire', { x: p.x, z: p.z - 20, shots: 1 });
    await steps(3);
    const fled = herd.filter((a) => a.state === 'flee').length, d1 = herd.reduce((k, a) => k + dist(a, p), 0) / herd.length;
    const shot = since(seq, 'faunaFlee', (e) => e.species === 'mule_deer').length > 0;
    for (const a of herd) F.remove(a);
    // A car: a fresh herd 45 m ahead of a car you drive at it.
    const v = await car();
    const seq2 = g.eventSeq;
    const herd2 = F.spawn('mule_deer', v.x + 2, v.z + 55, 4, { test: true });
    await steps(1);
    const e0 = herd2.reduce((k, a) => k + dist(a, v), 0) / herd2.length;
    await C('drive', { throttle: 1, seconds: 2.2 });
    const carFlee = since(seq2, 'faunaFlee', (e) => e.species === 'mule_deer' && e.from === 'car').length > 0;
    const ran = herd2.filter((a) => a.state === 'flee' || a.dead).length;
    await C('exitVehicle', {});
    const ok = calm && fled >= 4 && d1 > d0 + 10 && shot && carFlee && ran >= 3;
    return ok ? true : JSON.stringify({ calm, states: herd.map((a) => a.state), fled, d0: +d0.toFixed(1), d1: +d1.toFixed(1), shot, carFlee, ran, e0: +e0.toFixed(1), h2: herd2.map((a) => a.state) }).slice(0, 500);
  }));

  // ---- 3. predators: the stalk, the fire, the beam -------------------------------------------------------------------------
  await check('fauna: a coyote pack stalks a lone wounded man on foot at night, closes on him, then backs off a fire and out of a flashlight beam', async () => stage(async () => {
    const p = P();
    g.flashOverride = false; // your own light off: this part is about the man on foot
    const w = dummy(p.x + 14, p.z + 4, { hp: 30, maxHp: 100 });
    const pack = F.spawn('coyote', w.x + 34, w.z + 6, 3, { test: true });
    const seq = g.eventSeq;
    let stalked = false, closest = Infinity;
    const start = pack.reduce((k, a) => k + dist(a, w), 0) / pack.length;
    for (let i = 0; i < 24 && !stalked; i++) { await C('step', { seconds: 0.5 }); stalked = pack[0].grp?.quarry === w && (pack[0].grp.mode === 'stalk' || pack[0].grp.mode === 'attack'); }
    for (let i = 0; i < 16; i++) { await C('step', { seconds: 0.5 }); closest = Math.min(closest, pack.reduce((k, a) => k + dist(a, w), 0) / pack.length); }
    const stalkEv = since(seq, 'faunaStalk', (e) => e.target === w.id).length > 0;
    // A fire where the man stands: the pack keeps off it.
    g.throwables.startFire(w.x, w.z, 1.6, 30, null);
    const seq2 = g.eventSeq;
    await steps(2.5);
    const fire = g.throwables.fires[0], keepOff = pack.filter((a) => !a.dead).every((a) => dist(a, fire) > fire.r + 2.5);
    const fireEv = since(seq2, 'faunaBackoff', (e) => e.from === 'fire').length > 0;
    g.throwables.fires.length = 0;
    // The flashlight: you, hurt, the quarry now; the beam on them and they back out of it.
    g.removeChar(w);
    p.hp = 30;
    const c0 = pack[0]; for (const a of pack) { a.x = p.x + 11 + (a === c0 ? 0 : 2); a.z = p.z + (a === c0 ? 0 : 2); a.backT = 0; }
    c0.grp.quarry = p; c0.grp.qk = 'person'; c0.grp.qs = 1.2; c0.grp.mode = 'stalk'; c0.grp.modeT = 0; c0.grp.stalkT = 99;
    g.aimOverride = { x: c0.x, z: c0.z }; // you turn your light on it (the beam follows your aim)
    g.flashOverride = true;
    const seq3 = g.eventSeq, b0 = dist(c0, p);
    await steps(2);
    const beamEv = since(seq3, 'faunaBackoff', (e) => e.from === 'flashlight').length > 0, b1 = dist(c0, p);
    const ok = stalked && stalkEv && closest < start - 8 && keepOff && fireEv && beamEv && b1 > b0;
    return ok ? true : JSON.stringify({ stalked, stalkEv, start: +start.toFixed(1), closest: +closest.toFixed(1), keepOff, fireEv, beamEv, b0: +b0.toFixed(1), b1: +b1.toFixed(1), mode: c0.grp?.mode, states: pack.map((a) => a.state) }).slice(0, 500);
  }, { hour: 23 }));

  // ---- 4. the rattlesnake's warning -----------------------------------------------------------------------------------------
  await check('fauna: a rattlesnake rattles before it strikes - you walk up to it, it warns at 4 m, and the strike comes only after the warning has run', async () => stage(async () => {
    const p = P();
    const [s] = F.spawn('rattlesnake', p.x + 7, p.z, 1, { test: true });
    await steps(0.5);
    const seq = g.eventSeq, played0 = g.audio.counts?.['fauna:rattle'] ?? 0;
    await C('moveTo', { x: s.x - 1.0, z: s.z, maxSeconds: 6, tolerance: 0.25 });
    await steps(2);
    const rattle = since(seq, 'rattle', (e) => e.id === s.id)[0], strike = since(seq, 'faunaAttack', (e) => e.id === s.id)[0];
    const gap = rattle && strike ? strike.t - rattle.t : -1;
    const heard = (g.audio.counts?.['fauna:rattle'] ?? 0) > played0;
    const ok = !!rattle && !!strike && rattle.seq < strike.seq && gap >= SPECIES.rattlesnake.warn.hold - 0.05 && rattle.dist <= SPECIES.rattlesnake.warn.r + 0.01 && heard && strike.target === p.id;
    return ok ? true : JSON.stringify({ rattle, strike, gap, heard, state: s.state, d: +dist(s, p).toFixed(2) }).slice(0, 500);
  }));

  // ---- 5. the gator --------------------------------------------------------------------------------------------------------
  await check('fauna: a gator lying at the water\'s edge lunges at a man on the bank, holds him in a death roll and drags him toward the water', async () => stage(async () => {
    const b = F.bankNear(RIVER.x, RIVER.z, 14);
    if (!b) return 'no river bank found near the stage';
    const [gt] = F.spawn('gator', b.wx, b.wz, 1, { test: true, hx: b.x, hz: b.z });
    gt.bank = b; gt.home.x = b.x; gt.home.z = b.z;
    await steps(1.5);
    const lurk = gt.state === 'lurk' && gt.water;
    const out = { x: b.x - b.wx, z: b.z - b.wz }, ol = Math.hypot(out.x, out.z) || 1;
    const man = dummy(b.wx + (out.x / ol) * 4.1, b.wz + (out.z / ol) * 4.1, { hp: 250, maxHp: 250 }); // on the bank, just past the edge
    const seq = g.eventSeq, w0 = F.depthAt(man.x, man.z), d0 = dist(man, { x: b.wx, z: b.wz });
    await steps(3);
    const lunge = since(seq, 'faunaLunge', (e) => e.id === gt.id && e.target === man.id)[0], roll = since(seq, 'faunaRoll', (e) => e.id === gt.id)[0];
    const hurt = man.hp < 250, dragged = dist(man, { x: b.wx, z: b.wz }) < d0 - 0.5;
    const ok = lurk && !!lunge && lunge.fromWater && !!roll && hurt && dragged;
    return ok ? true : JSON.stringify({ lurk, state: gt.state, water: gt.water, lunge, roll: !!roll, hp: man.hp, d0: +d0.toFixed(1), d1: +dist(man, { x: b.wx, z: b.wz }).toFixed(1), w0 }).slice(0, 500);
  }, { hour: 23, at: { x: RIVER.x - 12, z: RIVER.z } }));

  // ---- 6. the hunt: shoot, butcher, spoil, cook, eat -----------------------------------------------------------------------
  await check('fauna: a deer shot with a rifle is butchered with a knife into raw venison and a hide; the meat spoils on the game clock and cooks over a fire into a meal', async () => stage(async () => {
    const p = P(), inv = g.inventory;
    await C('give', { weapon: 'rifle', rifle: 30 }); await C('equip', { weapon: 'rifle' });
    const [d] = F.spawn('mule_deer', p.x + 9, p.z, 1, { hold: true, test: true });
    const seq = g.eventSeq;
    for (let i = 0; i < 4 && !d.dead; i++) await C('fire', { x: d.x, z: d.z, shots: 1 });
    const killed = since(seq, 'faunaKilled', (e) => e.id === d.id && e.by === p.id).length > 0;
    if (!inv.carried.count('knife')) inv.stow('knife', 1);
    for (const id of ['raw_venison', 'cooked_venison', 'deer_hide', 'torn_hide', 'bone']) inv.setCount(id, 0);
    inv.carried.cap = 999;
    const r = await C('butcher', { id: d.id, force: true });
    const raw = inv.carried.count('raw_venison'), hide = inv.carried.count('deer_hide') + inv.carried.count('torn_hide');
    const slot = inv.carried.slots.find((s) => s.id === 'raw_venison');
    const fresh0 = slot ? inv.freshness(slot) : null;
    const m0 = slot?.made ?? 0;
    if (slot) slot.made = m0 - 13; const stale = slot ? inv.freshness(slot) : null;
    if (slot) slot.made = m0 - 25; const rotten = slot ? inv.freshness(slot) : null;
    if (slot) slot.made = m0;
    const ck = await C('cook', { light: true });
    const cooked = inv.carried.count('cooked_venison'), rawLeft = inv.carried.count('raw_venison');
    const cs = inv.carried.slots.find((s) => s.id === 'cooked_venison');
    g.needs.food = 0.3;
    const i = inv.carried.slots.indexOf(cs), used = i >= 0 ? inv.use(i) : { ok: false };
    const food = g.needs.food;
    const ok = killed && r.ok && raw >= 3 && hide === 1 && fresh0 === 'fresh' && stale === 'stale' && rotten === 'rotten' && ck.ok && cooked === raw && rawLeft === 0 && inv.freshness(cs) === 'fresh' && used.ok && Math.abs(food - 0.66) < 0.02 && d.butchered;
    return ok ? true : JSON.stringify({ killed, dead: d.dead, butcher: r.ok ? r.items : r.error, raw, hide, fresh0, stale, rotten, cook: ck.ok ? ck.cooked : ck.error, cooked, rawLeft, used: used.ok, food }).slice(0, 500);
  }));

  // ---- 7. vultures ------------------------------------------------------------------------------------------------------
  await check('fauna: a body left in the open draws vultures within two game hours, and they circle over it', async () => stage(async () => {
    const p = P();
    const body = dummy(p.x + 6, p.z + 3);
    g.combat.damage(body, 999, null, 0, 0, 'bullet');
    const seq = g.eventSeq, t0 = g.time;
    let circling = [];
    for (let i = 0; i < 32 && circling.length < 2; i++) {
      await C('step', { seconds: 2.5 });
      circling = F.live.filter((a) => a.sp === 'vulture' && a.state === 'circle' && a.circ?.body?.ref === body && a.alt > 5 && Math.hypot(a.x - body.x, a.z - body.z) < a.circ.r + 3);
    }
    const called = since(seq, 'vulturesCalled', (e) => e.body === `c:${body.id}`)[0], mins = (g.time - t0) * (g.sky.timeScale * 60); // game minutes
    const drawn = F.r ? F.r.np : 0; // each bird is a dozen parts (and casts its own shadow on the ground)
    const ok = !!called && circling.length >= 2 && mins <= 120 && drawn >= circling.length * 10 && F.r.parts.castShadow;
    return ok ? true : JSON.stringify({ called, circling: circling.length, mins: +mins.toFixed(2), drawn, birds: F.live.filter((a) => a.sp === 'vulture').map((a) => [a.state, +a.alt.toFixed(1), +Math.hypot(a.x - body.x, a.z - body.z).toFixed(1)]) }).slice(0, 500);
  }));

  // ---- 8. territorial: the hog's warning and charge, and the infected -----------------------------------------------------
  await check('fauna: a wild hog huffs a warning at a man on its ground and then charges him; a hog charges one of the infected too', async () => stage(async () => {
    const p = P();
    const sounder = F.spawn('hog', p.x + 20, p.z + 10, 2, { test: true });
    await steps(1);
    const man = dummy(sounder[0].x - 7.5, sounder[0].z, { hp: 300, maxHp: 300 });
    const seq = g.eventSeq;
    await steps(4);
    const warn = since(seq, 'faunaWarn', (e) => e.species === 'hog' && e.target === man.id)[0], charge = since(seq, 'faunaCharge', (e) => e.species === 'hog' && e.target === man.id)[0];
    const hit = since(seq, 'faunaAttack', (e) => e.species === 'hog' && e.target === man.id).length > 0;
    g.removeChar(man);
    // One of the infected walks onto its ground.
    for (const a of sounder) { a.charge = null; a.wheelT = 0; a.fleeT = 0; a.warned = false; a.atkCd = 0; a.threat = null; }
    await steps(1);
    const h0 = sounder[0];
    const z0 = g.addChar({ x: h0.x - 5.5, z: h0.z + 1, faction: 'zombie', weapon: null, hp: 300, name: 'Infected', flag: 'US' });
    z0.maxHp = 300; z0.hold = true;
    const seq2 = g.eventSeq;
    await steps(4);
    const zCharge = since(seq2, 'faunaCharge', (e) => e.species === 'hog' && e.target === z0.id).length > 0, zHit = z0.hp < 300;
    const zIn = g.chars.includes(z0);
    g.removeChar(z0);
    const ok = !!warn && !!charge && warn.seq < charge.seq && hit && zCharge && zHit;
    return ok ? true : JSON.stringify({ warn: !!warn, charge: !!charge, hit, zCharge, zHit, zIn, states: sounder.map((a) => [a.state, a.tk, +a.tdist.toFixed(1), a.fleeT > 0]) }).slice(0, 500);
  }));

  // ---- 9. traps and dogs ------------------------------------------------------------------------------------------------
  await check('fauna: a snare catches a jackrabbit and holds it; a dog of yours sicced on a deer runs it down and bites', async () => stage(async () => {
    const p = P();
    const [hare] = F.spawn('jackrabbit', p.x + 10, p.z + 8, 1, { test: true });
    const t = g.traps.place('snare', hare.x, hare.z, null);
    const seq = g.eventSeq;
    await steps(1);
    const caught = since(seq, 'faunaTrapped', (e) => e.id === hare.id)[0], held = !!hare.held || hare.dead, sprung = t.state === 'sprung';
    g.traps.remove(t);
    // A dog of yours, SIC'd on a white-tail pinned 12 m off.
    const d = g.dogs.make('shepherd', p.x + 1.5, p.z, { name: 'Fauna Rex' }); d.test = true; d.bond = 30; g.dogs.adopt(d);
    const [deer] = F.spawn('whitetail', p.x - 12, p.z + 2, 1, { hold: true, test: true });
    g.aim.x = deer.x; g.aim.z = deer.z;
    const seq2 = g.eventSeq;
    g.dogs.command('sic');
    let bit = false;
    for (let i = 0; i < 20 && !bit; i++) { await C('step', { seconds: 0.5 }); bit = since(seq2, 'dogBite', (e) => e.target === deer.id).length > 0; }
    const hurt = deer.hp < deer.maxHp;
    g.dogs.dogs = g.dogs.dogs.filter((x) => !x.test);
    const ok = !!caught && held && sprung && bit && hurt;
    return ok ? true : JSON.stringify({ caught: !!caught, held, sprung, bit, hurt, dog: d.state, sic: d.sic?.id ?? null, deer: deer.hp }).slice(0, 500);
  }));

  // ---- 10. roadkill -----------------------------------------------------------------------------------------------------
  await check('fauna: a deer standing in the road is hit by a car at full speed: roadkill, and the car takes a dent', async () => stage(async () => {
    const v = await car();
    // 70 m of run-up with the throttle held: well past the speed that kills (55 hp / 2.4 = 23 m/s). The deer stands in
    // the road ahead; a buggy wanders a little on its line, so until the last 10 m the deer is kept on that line (staged).
    const [d] = F.spawn('mule_deer', v.x, v.z + 70, 1, { hold: true, test: true });
    const z0 = v.dmg ? { ...v.dmg.zones } : {}, seq = g.eventSeq;
    let hit = null, top = 0;
    for (let i = 0; i < 24 && !hit; i++) {
      const fx = Math.sin(v.h), fz = Math.cos(v.h), ahead = (d.x - v.x) * fx + (d.z - v.z) * fz;
      if (ahead > 10) { d.x = v.x + fx * ahead; d.z = v.z + fz * ahead; d.rec.x = d.x; d.rec.z = d.z; }
      await C('drive', { throttle: 1, seconds: 0.25 });
      top = Math.max(top, Math.hypot(v.vx, v.vz));
      hit = since(seq, 'faunaCarHit', (e) => e.id === d.id)[0];
    }
    const kill = since(seq, 'roadkill', (e) => e.id === d.id)[0];
    const dented = v.dmg ? Object.keys(v.dmg.zones).some((k) => v.dmg.zones[k] > (z0[k] ?? 0) + 0.02) : false;
    await C('exitVehicle', {});
    const ok = !!hit && hit.speed >= 23 && !!kill && d.dead && dented;
    return ok ? true : JSON.stringify({ hit, kill: !!kill, dead: d.dead, hp: d.hp, dented, top: +top.toFixed(1), zones: v.dmg?.zones, car: [+v.x.toFixed(1), +v.z.toFixed(1)], deer: [+d.x.toFixed(1), +d.z.toFixed(1)] }).slice(0, 500);
  }));

  // ---- 11. the hot ground's creatures -----------------------------------------------------------------------------------
  await check('fauna: the Fused Flat\'s Glasslings and the Lantern wear real bodies (no stand-in people), and twinbacks and the cinder swarm live on its hot ground at night', async () => stage(async () => {
    const H = g.hotground, Z = H.zones.find((z) => z.row.id === 'fused_flat');
    await C('teleport', { x: Z.row.x + 60, z: Z.row.z + 30 });
    await steps(1.5);
    const awake = Z.live && Z.fauna.length > 0;
    g.render(0);
    const bodyless = Z.fauna.every((c) => c.bodyless);
    const M = new THREE.Matrix4(), hidden = Z.fauna.every((c) => { g.charR.meshes.torso.getMatrixAt(c.slot, M); return Math.abs(M.elements[0]) + Math.abs(M.elements[5]) + Math.abs(M.elements[10]) < 1e-6; }); // the stand-in person is not drawn
    const parts = F.r.np;
    const D = F.density(Math.floor(Z.row.x / 256), Math.floor(Z.row.z / 256), { hour: 23 });
    const hotRows = ['twinback', 'cinders'].every((s) => D.rows.some((r) => r.species === s && r.expected > 0));
    // The swarm finds you in the dark.
    const [sw] = F.spawn('cinders', g.player.x + 6, g.player.z, 1, { test: true });
    const seq = g.eventSeq;
    await steps(4);
    const stung = since(seq, 'faunaAttack', (e) => e.id === sw.id && e.target === g.player.id).length > 0, glow = F.r.ng > 20;
    const ok = awake && bodyless && hidden && parts > 20 && hotRows && stung && glow;
    return ok ? true : JSON.stringify({ awake, n: Z.fauna.length, bodyless, parts, hot: D.hot, rows: D.rows.map((r) => r.species), stung, glow: F.r.ng, sw: sw?.state }).slice(0, 500);
  }, { hour: 23, wilds: true, at: { x: 120, z: -380 } }));

  // ---- 12. records ------------------------------------------------------------------------------------------------------
  await check('fauna: a carcass and a wounded animal outlast their chunk going away and a save and a load (records, not bodies)', async () => stage(async () => {
    const p = P();
    const herd = F.spawn('javelina', p.x + 80, p.z + 70, 2, { test: true, hold: true }); // out of sight when it comes back (nothing pops in where you look)
    F.hurt(herd[0], 999, null); F.hurt(herd[1], 15, null);
    const ids = herd.map((a) => a.id), x0 = herd[0].x;
    await C('teleport', { x: p.x + 900, z: p.z });
    await steps(1);
    const gone = !F.live.some((a) => ids.includes(a.id));
    const sv = (await C('save')).save;
    await C('load', { save: sv });
    await C('teleport', { x: STAGE.x, z: STAGE.z });
    F.spawning = true; // the director brings them back from their records
    await steps(1.5);
    const back = ids.map((id) => F.live.find((a) => a.id === id));
    const ok = gone && back[0]?.dead && Math.abs(back[0].x - x0) < 0.1 && back[1] && !back[1].dead && Math.round(back[1].hp) === 25;
    return ok ? true : JSON.stringify({ gone, back: back.map((a) => a && { dead: a.dead, hp: a.hp, x: a.x }), x0 }).slice(0, 500);
  }));

  // ---- 13. the budget ---------------------------------------------------------------------------------------------------
  await check('fauna: every kind of animal out at once, at the widest zoom by night - under 150 draw calls and within the renderers\' pools', async () => stage(async () => {
    const p = P();
    const out = [['mule_deer', 4], ['coyote', 3], ['javelina', 5], ['jackrabbit', 2], ['rattlesnake', 1], ['hog', 4], ['whitetail', 3], ['panther', 1], ['cottonmouth', 1], ['heron', 5], ['twinback', 3], ['cinders', 1], ['vulture', 4]];
    let k = 0;
    for (const [s, n] of out) { const ang = (k++ / out.length) * Math.PI * 2; F.spawn(s, p.x + Math.sin(ang) * 18, p.z + Math.cos(ang) * 18, n, { test: true }); }
    const b = F.bankNear(RIVER.x, RIVER.z, 14); if (b) F.spawn('gator', b.wx, b.wz, 1, { test: true, hx: b.x, hz: b.z });
    const z0 = await C('zoom', {}), lv0 = z0.level ?? 1;
    await C('zoom', { level: 'HIGH' });
    await steps(1);
    g.render(0);
    const perf = await C('perf');
    const pools = { quads: F.r.quad.nb, parts: F.r.np, glow: F.r.ng };
    await C('zoom', { level: String(lv0) });
    const ok = perf.drawCalls < 150 && F.live.length >= 32 && pools.parts < 900 && pools.glow < 220;
    return ok ? true : JSON.stringify({ calls: perf.drawCalls, live: F.live.length, pools }).slice(0, 300);
  }, { hour: 22 }));
}
