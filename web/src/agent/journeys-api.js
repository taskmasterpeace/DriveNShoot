// LIFE INSURANCE AND RISKY JOURNEYS as COMMANDS rows and selftest checks (docs/design/WEB_INSURANCE_JOURNEYS.md).
// buildCommands() in api.js spreads journeyCommands into COMMANDS; runSelfTest() calls journeyChecks right after the clone
// checks. The clone/travel rows they extend live in agent/clone-api.js (clone action=die vat=, travel cord|incident|plan).

import { POLICIES, MAJOR_CENTRES } from '../data/insurance.js';
import { LINES } from '../data/travel.js';
import { VATS } from '../data/clones.js';
import { JOURNEY_RULES } from '../data/journeys.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function journeyCommands(api, need) {
  const g = api.g;
  return {
    insurance: {
      group: 'player', desc: 'Life insurance (docs/design/WEB_INSURANCE_JOURNEYS.md, rows in src/data/insurance.js): the pressing with terms. action: status (your policy: its premium a day out of the brine book, grace, how cold the pressing is, the kit and brine sickness you come up with, the tow, the home centre; every major cloning centre and what a transfer to it costs; the pressing offices and their home centres; prices at the counter you stand at) | buy policy=basic|standard|premium (sign at the vat counter you stand at: a major centre or a small-town pressing office; vat= force=true to stage anywhere) | lapse (stop paying now: the vat pours the pressing out; the next death is flat) | base x= z= name= (where home is: the city picker and the planner measure to it) | options (the city picker: every centre, its distance to your husk and base, the way home from it, the transfer fee) | pick vat= (the centre the next waking takes, as if chosen on the picker).',
      args: { action: { type: 'string', default: 'status', enum: ['status', 'buy', 'lapse', 'base', 'options', 'pick'] }, policy: { type: 'string', enum: Object.keys(POLICIES) }, vat: { type: 'string' }, force: { type: 'boolean', default: false }, x: { type: 'number' }, z: { type: 'number' }, name: { type: 'string' } },
      run: async ({ action, policy, vat, force, x, z, name }) => {
        const C = g.clone, I = C.ins;
        if (action === 'buy') {
          need(policy && POLICIES[policy], `policy= ${Object.keys(POLICIES).join(' | ')}`);
          const r = C.press(vat ?? null, { force, policy });
          need(r.ok, r.why);
          return { ...r, cash: g.cash, bank: C.bank, insurance: I.view() };
        }
        if (action === 'lapse') { need(C.pressing, 'no policy in force'); return C.lapse('stopped paying'); }
        if (action === 'base') {
          const px = x ?? g.player.x, pz = z ?? g.player.z;
          return { base: I.setBase(px, pz, name ?? 'YOUR BASE'), nearestPole: g.travel.j.nearestPole({ x: px, z: pz }) };
        }
        if (action === 'options') return { options: I.options(), home: I.homeOf(), base: I.baseXZ() };
        if (action === 'pick') { need(vat && I.isMajor(vat), `vat= one of the major centres: ${I.centres().map((c) => c.id).join(', ')}`); I.pick = vat; return { pick: vat }; }
        return I.view();
      },
    },
  };
}

// ---- the selftest ---------------------------------------------------------------------------------------------------------
export async function journeyChecks(api, check, C) {
  const g = api.g, CL = g.clone, TR = g.travel, J = TR.j, I = CL.ins;
  const STAGE = { x: 280, z: -120 };
  const quiet = () => {
    for (const ev of [...g.society.director.active]) g.society.director.cancel(ev.id);
    for (const c of [...g.chars]) if (c !== g.player && !c.npc && !c.trundle && !c.husk && Math.hypot(c.x - g.player.x, c.z - g.player.z) < 90) g.removeChar(c);
  };
  const sv = (await C('save')).save;
  const was = { zombies: g.zombies.enabled, raiders: g.raiderTimer, convoyNext: g.convoy.next, base: I.base, grapevine: g.grapevine?.enabled };
  if (g.grapevine) g.grapevine.enabled = false; // the stalkers would walk into the coach's lane (it stops for anyone on foot)
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.convoy.despawn?.(); g.convoy.next = 1e9;
  const out = async () => { if (g.player.inVehicle) g.exitVehicle(true); if (!g.player.alive) { g.respawnT = 0; await C('step', { seconds: 0.3 }); } };
  let car = null;
  try {
    await check('insurance: premiums come out of the brine book each day; past the grace the policy lapses, and the next death is flat', async () => {
      await out();
      await C('teleport', CL.vat('rust_haven').wake); await C('step', { seconds: 0.2 });
      g.cash = 2000; CL.bank = 0;
      const b = await C('insurance', { action: 'buy', policy: 'standard' });
      const pol = POLICIES.standard, prem = I.premium();
      CL.bank = prem; // one day paid, then nothing
      await C('clone', { action: 'upkeep' });
      const paid = CL.bank === 0 && CL.owed === 0 && !!CL.pressing;
      const owed = []; for (let d = 0; d < pol.graceDays; d++) { await C('clone', { action: 'upkeep' }); owed.push(CL.owed); }
      const still = !!CL.pressing;
      await C('clone', { action: 'upkeep' });
      const lapsed = !CL.pressing && g.events.some((e) => e.type === 'policyLapsed');
      await C('teleport', STAGE); await C('step', { seconds: 0.2 }); quiet();
      const d = await C('clone', { action: 'die' });
      const flat = !!CL.lastWake?.flat && g.events.some((e) => e.type === 'diedFlat');
      const ok = b.ok && b.cost === Math.round(CL.price(CL.vat('rust_haven')) * pol.signMul) && prem === pol.premium && paid && owed.join() === Array.from({ length: pol.graceDays }, (_, i) => i + 1).join() && still && lapsed && flat && d.alive;
      return ok ? true : JSON.stringify({ b: b.ok ?? b.error, cost: b.cost, prem, paid, owed, still, lapsed, flat, wake: CL.lastWake });
    });
    await check('insurance: the city picker wakes you at the major centre you chose - the transfer out of the brine book, IRON COVER tows your car there and presses you again', async () => {
      await out();
      await C('teleport', CL.vat('rust_haven').wake); await C('step', { seconds: 0.2 });
      g.cash = 3000; CL.bank = 0;
      const b = await C('insurance', { action: 'buy', policy: 'premium' });
      CL.bank = 1500;
      await C('teleport', STAGE); await C('step', { seconds: 0.2 }); quiet();
      car = g.vehiclesSys.spawn('pickup', STAGE.x + 6, STAGE.z + 2, 0, '#6a4a2a'); g.lastVehicle = car;
      const opts = (await C('insurance', { action: 'options' })).options;
      const la = opts.find((o) => o.id === 'los_angeles'), fee = la?.fee ?? -1, bank0 = CL.bank;
      const d = await C('clone', { action: 'die', vat: 'los_angeles' });
      const pl = I.place(CL.vat('los_angeles')), p = g.player;
      const near = pl?.onMap ? Math.hypot(p.x - pl.wake.x, p.z - pl.wake.z) : 99;
      const towed = car && Math.hypot(car.x - pl.wake.x, car.z - pl.wake.z) < 25 && !!CL.husks[CL.husks.length - 1]?.car?.towed;
      const ids = opts.map((o) => o.id).sort().join(), major = [...MAJOR_CENTRES].sort().join();
      const rows = opts.every((o) => o.kmBase !== null && (o.home || o.fee > 0));
      const ok = b.ok && d.alive && CL.lastWake?.vat === 'los_angeles' && near < 3 && fee > 0 && CL.bank === bank0 - fee && towed && ids === major && rows && CL.pressing?.vat === 'los_angeles' && CL.pressing?.policy === 'premium';
      return ok ? true : JSON.stringify({ b: b.ok ?? b.error, alive: d.alive, wake: CL.lastWake, near: r1(near), fee, bank: [bank0, CL.bank], towed, car: car && [r1(car.x), r1(car.z)], ids, rows, pressing: CL.pressingView() });
    });
    await check('insurance: a small-town clinic is a pressing office - it scans you and sells the policy, but grows no body: you come up at its home centre', async () => {
      await out();
      await C('teleport', STAGE); await C('step', { seconds: 0.2 }); quiet();
      g.cash = 1000;
      const b = await C('insurance', { action: 'buy', policy: 'basic', vat: 'el_paso', force: true });
      const home = I.homeFor('el_paso'), offices = VATS.filter((v) => !v.major).map((v) => v.id);
      const noGrow = offices.every((id) => !I.canGrow(id)) && MAJOR_CENTRES.every((id) => I.canGrow(id));
      const d = await C('clone', { action: 'die' });
      const pl = I.place(CL.vat(home)), p = g.player, near = pl?.onMap ? Math.hypot(p.x - pl.wake.x, p.z - pl.wake.z) : 99;
      const paso = I.place(CL.vat('el_paso')), notThere = !paso?.onMap || Math.hypot(p.x - paso.x, p.z - paso.z) > 200;
      const ok = b.ok && CL.lastWake?.vat === home && home !== 'el_paso' && I.isMajor(home) && near < 3 && notThere && noGrow && offices.includes('meridian') && d.alive;
      return ok ? true : JSON.stringify({ b: b.ok ?? b.error, home, wake: CL.lastWake, near: r1(near), notThere, noGrow, offices });
    });
    await check('journeys: an incident roll is deterministic with a seed - the same seed, the same incident and the same costs - and who holds the road weighs it', async () => {
      const L = LINES.find((l) => l.id === 'sun');
      const ctx = J.ctxFor(L, 'haven', 'la_knot', 23);
      let seed = null; for (let s = 1; s < 900 && seed === null; s++) if (J.roll(ctx, s)) seed = s;
      const a = JSON.stringify(J.roll(ctx, seed)), b2 = JSON.stringify(J.roll(ctx, seed));
      let quietSeed = null; for (let s = 1; s < 900 && quietSeed === null; s++) if (!J.roll(ctx, s)) quietSeed = s;
      // Dustwolf road: roadblocks come up more than on Rust Haven's own (forced rolls, the same seeds, count them).
      const count = (held) => { let n = 0; for (let s = 1; s <= 400; s++) if (J.roll({ ...ctx, held }, s, { force: true })?.id === 'roadblock') n++; return n; };
      const wolves = count('dustwolves'), town = count('rusthaven');
      // A choice's consequences: paying the toll costs exactly what the roll said.
      const inc = J.roll(ctx, 7, { force: 'roadblock' }), pay = inc.choices.find((c) => c.id === 'pay');
      g.cash = 500; const res = J.resolve(inc, 'pay');
      const ok = seed !== null && a === b2 && JSON.parse(a).choices.length >= 1 && quietSeed !== null && wolves > town * 1.5 && res.paid === pay.cost && g.cash === 500 - pay.cost && ctx.danger >= 1.5;
      return ok ? true : JSON.stringify({ seed, same: a === b2, quietSeed, wolves, town, paid: res.paid, cost: pay.cost, danger: ctx.danger });
    });
    await check('journeys: a long haul past the dust plays its incident as a card with choices - hand over a bag and the bag is gone - and lands you on the map', async () => {
      await out();
      TR.hold('houston_depot', { why: 'staged' });
      g.cash = 400; g.inventory.add(g.inventory.carried, 'gold_ring', 1);
      const r0 = LINES.find((l) => l.id === 'haul').routes.find((x) => x.from === 'houston_depot' && x.to === 'paso_knot');
      const b = await C('travel', { action: 'buy', line: 'haul', to: 'paso_knot' });
      const L = LINES.find((l) => l.id === 'haul'), now = CL.hours(), dep = TR.nextFlight(r0, now);
      const ctx = J.ctxFor(L, 'houston_depot', 'paso_knot', dep, { miles: r0.miles, danger: r0.danger });
      let seed = null; for (let s = 1; s < 3000 && seed === null; s++) if (J.roll(ctx, s)?.id === 'roadblock') seed = s;
      const best = g.inventory.carried.slots[J.bestStack(g.inventory.carried)]?.id;
      const r = await C('travel', { action: 'skip', seed, choice: 'bag' });
      const gone = !g.inventory.carried.slots.some((s) => s.id === best);
      const paso = TR.node('paso_knot'), landed = !TR.away && paso.onMap && Math.hypot(g.player.x - paso.counter.x, g.player.z - paso.counter.z) < 30;
      const ok = b.ok && seed !== null && r.ok && r.trip?.event?.id === 'roadblock' && r.trip?.choice === 'bag' && gone && landed && r.trip.hours >= r0.hours;
      return ok ? true : JSON.stringify({ b: b.ok ?? b.error, seed, trip: r.trip ?? r.error, best, gone, landed, away: TR.away });
    });
    await check('journeys: a real coach carries passengers - people with flags and factions you can talk to', async () => {
      await out();
      await C('travel', { action: 'goto', node: 'haven', dir: 'east' }); quiet();
      const L = LINES.find((l) => l.id === 'sun');
      if (TR.bus) TR.despawnBus();
      const v = TR.spawnBus(L, L.stops.indexOf('haven'), 1, { atStop: true });
      await C('step', { seconds: 0.3 });
      const pax = (TR.bus?.pax ?? []).map((id) => g.chars.find((c) => c.id === id)).filter(Boolean);
      g.cash = 200; await C('travel', { action: 'buy', line: 'sun', to: 'sand_trap' }); // no punch, no ride
      g.enterVehicle(v, 'passenger'); await C('step', { seconds: 0.2 });
      const panel = J.openPassengers();
      const k = TR.ui.model?.onKey?.('Digit1'); TR.ui.refresh();
      const said = TR.ui.model?.note ?? '';
      const [a, b] = JOURNEY_RULES.passengers, seated = pax.every((c) => c.flag && c.faction && c.inVehicle === v);
      TR.ui.close(); g.exitVehicle(true); TR.despawnBus();
      const ok = pax.length >= a && pax.length <= b && seated && panel.ok && k && said.length > 8;
      return ok ? true : JSON.stringify({ pax: pax.map((c) => [c.name, c.flag, c.faction, !!c.inVehicle]), panel, said });
    });
    await check('journeys: pulling the cord stops the coach at the roadside - you step down within 30 m of it, between the poles', async () => {
      await out();
      await C('travel', { action: 'goto', node: 'haven', dir: 'west' }); quiet();
      g.cash = 500;
      await C('travel', { action: 'buy', line: 'sun', to: 'la_knot' });
      const w = await C('travel', { action: 'wait', dir: 'west' });
      for (let t = 0; t < 70 && TR.bus?.state !== 'dwell'; t += 0.5) await C('step', { seconds: 0.5 });
      const v = TR.busVehicle();
      if (v) await C('teleport', { x: v.x + Math.cos(v.h) * 2.2, z: v.z - Math.sin(v.h) * 2.2 });
      const bd = await C('travel', { action: 'board', force: true });
      const pole0 = TR.node('haven').poles[-1];
      for (let t = 0; t < 60 && !(v && g.vehiclesSys.speed(v) > 9 && Math.hypot(v.x - pole0.x, v.z - pole0.z) > 160); t += 0.5) await C('step', { seconds: 0.5 }); // well out between the poles
      const sp = v ? g.vehiclesSys.speed(v) : 0;
      const c = await C('travel', { action: 'cord' });
      const p = g.player, poles = Object.values(TR.nodes()).filter((n) => n.onMap && n.road).flatMap((n) => [n.poles[1], n.poles[-1]]);
      const toPole = Math.min(...poles.map((q) => Math.hypot(q.x - p.x, q.z - p.z)));
      const ok = w.ok && bd.aboard && sp > 9 && c.ok && c.dropped && c.dist < JOURNEY_RULES.cord.dropR && !p.inVehicle && !TR.ride && toPole > 60;
      TR.despawnBus();
      return ok ? true : JSON.stringify({ w: w.ok ?? w.error, bd, sp: r1(sp), c, toPole: Math.round(toPole) });
    });
    await check('journeys: the planner sends you to the pole nearest your base and tells you the walk from it', async () => {
      await out();
      const sand = TR.node('sand_trap'), q = sand.poles[1];
      const f = g.streamer.W.at(sand.s), base = { x: q.x + f.nx * 1800, z: q.z + f.nz * 1800 };
      await C('insurance', { action: 'base', x: base.x, z: base.z, name: 'THE STAGED CAMP' });
      await C('travel', { action: 'goto', node: 'haven', dir: 'east' });
      const r = await C('travel', { action: 'plan', to: 'base' });
      const walk = Math.hypot(base.x - q.x, base.z - q.z) / 1000;
      const ok = r.ok && r.nearestPole?.node === 'sand_trap' && r.getOff === 'sand_trap' && Math.abs(r.lastWalkKm - walk) < 0.35 && r.legs.some((l) => l.kind === 'bus' && l.to === 'sand_trap') && r.fare > 0;
      return ok ? true : JSON.stringify({ r, walk: r1(walk) });
    });
    await check('journeys: thumb out at the interstate and a car stops (the odds go with your standing), drives you up the road and lets you out when you ask', async () => {
      await out();
      await C('travel', { action: 'goto', node: 'sand_trap', dir: 'east' }); quiet();
      const F = g.society.factions, s0 = F.standing[F.index.drifters];
      F.set('drifters', -80); const refused = J.hitchOdds().p;
      F.set('drifters', 90); const odds = J.hitchOdds().p;
      const f = g.streamer.W.at(TR.node('sand_trap').s); g.player.face = Math.atan2(f.tx, f.tz); // facing east, up the road
      let h = null, v = null, c = null, sp = 0;
      try {
        h = await C('travel', { action: 'hitch', seed: 3, board: true, seconds: 200 });
        v = J.liftVehicle();
        for (let t = 0; t < 40 && !(v && g.vehiclesSys.speed(v) > 8); t += 0.5) await C('step', { seconds: 0.5 });
        sp = v ? g.vehiclesSys.speed(v) : 0;
        c = await C('travel', { action: 'cord' });
      } finally { F.set('drifters', s0); J.endLift('check'); }
      const ok = refused === 0 && odds > 0.8 && h?.ok && h.aboard && sp > 8 && c?.ok && c.dropped && c.dist < JOURNEY_RULES.cord.dropR && !g.player.inVehicle;
      return ok ? true : JSON.stringify({ refused, odds, h, sp: r1(sp), c });
    });
    await check('travel: the trundle waits short of the Route 66 level crossing while the freight is on it, and crosses once it has gone', async () => {
      await out();
      const L = LINES.find((l) => l.id === 'sun'), Tr = g.train, near0 = Tr.near, RX = -360;
      if (TR.bus) TR.despawnBus();
      await C('teleport', { x: RX - 40, z: -14 }); await C('step', { seconds: 0.2 }); quiet(); // watch from the verge, nobody on the road
      // Staged: nobody on foot in the eastbound lanes between the coach and the tracks (quiet() spares named people, and the
      // coach stops dead and leans on the horn for anyone in its path).
      const moved = [];
      for (const c of [...g.chars]) {
        if (c === g.player || !c.alive || c.inVehicle || c.x < -1150 || c.x > RX + 20 || Math.abs(c.z) > 40) continue;
        if (c.faction === 'grapevine' || c.faction === 'zombie') { g.removeChar(c); moved.push(`${c.faction} (removed)`); continue; }
        if (Math.abs(c.z) < 12) { moved.push(c.name ?? c.id); c.x = RX - 60; c.z = -30; c.wx = c.x; c.wz = c.z; }
      }
      const v = TR.spawnBus(L, L.stops.indexOf('iron_crossing'), 1); // 700 m up the road, westbound side of the tracks, heading east
      let held = false, minAhead = 1e9, crossed = false;
      try {
        Tr.near = () => true; // staged: the freight standing across the crossing (the documented exception)
        for (let t = 0; t < 70 && !held; t += 0.5) { await C('step', { seconds: 0.5 }); const sp = g.vehiclesSys.speed(v); minAhead = Math.min(minAhead, RX - v.x); held = sp < 0.4 && RX - v.x > 6.5 && RX - v.x < 25; }
        if (held) await C('step', { seconds: 3 });
        const stillShort = RX - v.x > 6.5;
        Tr.near = near0;
        for (let t = 0; t < 60 && !crossed; t += 0.5) { await C('step', { seconds: 0.5 }); crossed = v.x > RX + 8; }
        const waited = g.events.some((e) => e.type === 'trundleWaitsForTrain' && e.vehicle === v.id);
        const near = g.chars.filter((c) => c.alive && c !== g.player && Math.hypot(c.x - v.x, c.z - v.z) < 25).map((c) => [c.name, c.faction, r1(c.x), r1(c.z), !!c.inVehicle]);
        const nearV = g.vehicles.filter((o) => o !== v && Math.hypot(o.x - v.x, o.z - v.z) < 40).map((o) => [o.type, r1(o.x), r1(o.z)]);
        const bus = { state: TR.bus?.state, broke: TR.bus?.broke, lane: TR.bus?.lane, blk: TR.bus?.blk, thr: v.throttle };
        TR.despawnBus();
        return held && stillShort && crossed && waited ? true : JSON.stringify({ held, stillShort, crossed, waited, minAhead: r1(minAhead), x: r1(v.x), bus, near, nearV, moved });
      } finally { Tr.near = near0; }
    });
  } finally {
    if (TR.ui.open) TR.ui.close();
    TR.leaveHall(); TR.despawnBus(); J.endLift?.('check');
    if (car && g.vehicles.includes(car)) { g.vehiclesSys.remove(car); g.inventory.trunks.delete(car.id); }
    if (g.grapevine) g.grapevine.enabled = was.grapevine;
    g.zombies.enabled = was.zombies; g.raiderTimer = was.raiders; g.convoy.next = was.convoyNext;
    await C('load', { save: sv });
    I.base = was.base;
    if (!g.player.alive) { g.respawnT = 0; await C('step', { seconds: 0.2 }); }
  }
}
