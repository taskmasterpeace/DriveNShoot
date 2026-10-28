// BUS HOME (docs/design/WEB_INSURANCE_JOURNEYS.md): the whole husk-run-home loop, played through public commands.
//   1. Your base is a camp a walk off the Sand Trap pole; you hold ROAD COVER signed at Rust Haven.
//   2. You die far from home, out west near Furnace Mile 9.
//   3. The city picker: you come up in a major centre (the home one, Phoenix: it is free and nearest your base).
//   4. The planner says which pole is nearest your base; you buy that punch and ride the real trundle east.
//   5. Something happens on the road (a breakdown, raiders, the bulls...): you survive it.
//   6. You pull the cord short of the pole, nearest your camp, and finish on foot.
// Run: node tools/dl.mjs scenario name=bus-home
export default async function (DL, game) {
  const log = [];
  const note = (m) => log.push(m);
  const g = game, T = g.travel;
  const at = () => ({ x: Math.round(g.player.x), z: Math.round(g.player.z) });
  const was = { zombies: g.zombies.enabled, raiderTimer: g.raiderTimer, convoyNext: g.convoy?.next }; // put back at the end
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.convoy?.despawn?.(); if (g.convoy) g.convoy.next = 1e9;
  await DL.call('god', { on: false });
  if (!g.player.alive) { g.respawnT = 0; await DL.call('step', { seconds: 0.5 }); }
  if (g.player.inVehicle) g.exitVehicle(true);
  await DL.call('setTime', { hour: 9 });

  // 1. The base: a dry camp 1.4 km off the Sand Trap pole. A policy signed at Rust Haven.
  const sand = T.node('sand_trap'), q = sand.poles[1], f = g.streamer.W.at(sand.s);
  const camp = { x: q.x + f.nx * 1400, z: q.z + f.nz * 1400 };
  await DL.call('insurance', { action: 'base', x: camp.x, z: camp.z, name: 'THE WASH CAMP' });
  g.cash = 900; g.clone.bank = 300;
  await DL.call('teleport', g.clone.vat('rust_haven').wake);
  const pol = await DL.call('insurance', { action: 'buy', policy: 'standard' });
  note(`Signed ${pol.insurance?.policy?.name ?? '?'} at Rust Haven for $${pol.cost}; base: THE WASH CAMP, ${Math.round(Math.hypot(camp.x - q.x, camp.z - q.z))} m off the Sand Trap pole.`);

  // 2. Die far from home.
  const furnace = T.node('furnace');
  await DL.call('teleport', { x: furnace.poles[1].x + 20, z: furnace.poles[1].z + 10 });
  const opts = (await DL.call('insurance', { action: 'options' })).options;
  note(`Out at Furnace Mile 9 (${JSON.stringify(at())}). The picker would offer: ${opts.map((o) => `${o.short}${o.home ? '*' : ''} ${o.kmBase} km to base${o.fee ? ` $${o.fee}` : ''}`).join(' | ')}`);
  const best = opts.filter((o) => o.can && o.onMap).sort((a, b) => (a.home2base?.hours ?? 1e9) - (b.home2base?.hours ?? 1e9))[0];
  const d = await DL.call('clone', { action: 'die', vat: best.id });
  note(`Died. Came up in ${d.wake?.vat} at ${JSON.stringify(at())} (chose the quickest way home: ${best.home2base?.first}, ${best.home2base?.hours} h).`);

  // 3-4. The planner: the pole nearest the base, the punch to it, the real trundle.
  await DL.call('travel', { action: 'goto', node: 'haven', dir: 'east' });
  const plan = await DL.call('travel', { action: 'plan', to: 'base' });
  note(`Planner: get off at ${plan.getOff} (nearest pole to your base: ${plan.nearestPole?.name}, ${plan.nearestPole?.km} km walk); ${plan.fare} scrip, ${plan.hours} h.`);
  g.cash = Math.max(g.cash, 60);
  const buy = await DL.call('travel', { action: 'buy', line: 'sun', to: plan.getOff ?? 'sand_trap' });
  note(`Bought a punch to ${buy.punch?.to} for $${buy.punch?.fare}.`);
  await DL.call('travel', { action: 'wait', dir: 'east' });
  for (let t = 0; t < 80 && T.bus?.state !== 'dwell'; t += 0.5) await DL.call('step', { seconds: 0.5 });
  const v = T.busVehicle();
  if (v) await DL.call('teleport', { x: v.x + Math.cos(v.h) * 2.2, z: v.z - Math.sin(v.h) * 2.2 });
  const bd = await DL.call('travel', { action: 'board', force: true });
  const pax = (T.bus?.pax ?? []).map((id) => g.chars.find((c) => c.id === id)).filter(Boolean);
  note(`Boarded (${bd.aboard}) with ${pax.length} passengers: ${pax.map((c) => `${c.name} (${c.flag})`).join(', ')}.`);

  // 5. The road turns something up: a fight with the raiders across the road, the way the scenario wants it played.
  for (let t = 0; t < 40 && v && g.vehiclesSys.speed(v) < 10; t += 0.5) await DL.call('step', { seconds: 0.5 });
  const inc = await DL.call('travel', { action: 'incident', kind: 'roadblock', choose: 'pay' });
  note(`On the road: ${inc.incident?.title ?? inc.error}. Chose ${inc.result?.choice}: paid $${inc.result?.paid ?? 0}${inc.result?.couldNotPay ? ' (could not pay: ' + inc.result.choice + ')' : ''}, hurt ${inc.result?.hurt ?? 0}.`);
  for (let t = 0; t < 30 && v && g.vehiclesSys.speed(v) < 9; t += 0.5) await DL.call('step', { seconds: 0.5 });

  // 6. Ride on toward the pole and pull the cord short of it, the side nearest camp; walk the rest.
  // The cord: where the road passes nearest the camp (less a stopping distance), not at the pole.
  const W = g.streamer.W, sCamp = W.project(camp.x, camp.z, 4096).s, dir = T.bus?.dir ?? 1;
  for (let t = 0; t < 1000 && T.ride; t += 0.5) {
    const s = W.project(v.x, v.z, 600).s;
    if ((sCamp - s) * dir < 140) break;
    await DL.call('step', { seconds: 0.5 });
  }
  const cord = T.ride ? await DL.call('travel', { action: 'cord' }) : { ok: false, why: 'the ride ended early' };
  note(`Pulled the cord: off at the roadside ${JSON.stringify(at())}, ${cord.dist ?? '?'} m from the coach; ${Math.round(Math.hypot(g.player.x - camp.x, g.player.z - camp.z))} m from camp.`);
  // On foot the rest of the way, a nav window at a time.
  let hops = 0, why = '';
  for (; hops < 10 && Math.hypot(g.player.x - camp.x, g.player.z - camp.z) > 30; hops++) {
    const dx = camp.x - g.player.x, dz = camp.z - g.player.z, d = Math.hypot(dx, dz), k = Math.min(1, 380 / d);
    const r = await DL.call('moveTo', { x: g.player.x + dx * k, z: g.player.z + dz * k, run: true, maxSeconds: 200 });
    if (r.ok === false) { why = r.error ?? r.why ?? ''; break; }
  }
  const left = Math.hypot(g.player.x - camp.x, g.player.z - camp.z);
  g.zombies.enabled = was.zombies; g.raiderTimer = was.raiderTimer; if (g.convoy && was.convoyNext !== undefined) g.convoy.next = was.convoyNext; // no state leaks past the scenario
  note(`Walked to camp in ${hops} legs: ${Math.round(left)} m left.${why ? ` (${why})` : ''}`);
  return { ok: !!(d.alive && bd.aboard && inc.result && cord.ok && left < 400), home: left < 60, metersFromCamp: Math.round(left), log };
}
