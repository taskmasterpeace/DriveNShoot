// RING RUN (docs/design/WEB_CAROUSEL.md §8): the Carousel end to end. Park the rig by the hatch of PAPAGO DEEP east of
// Phoenix with two crew, go down, wake the station (its generator), read the ring's card, key the blast door open, arm
// the ring at its console and throw ROULETTE: out in a station in another region, the crew with you, the rig left parked
// in Arizona. Rest off a stack of ring-sick, wake the far station's generator and BACKSPIN home to the rig.
// Returns each beat, where you came out, who came, the rig's state on both sides, and the ring-sick stacks along the way.
export default async function (DL, game) {
  const g = game, S = g.carousel, U = g.under, out = { steps: [] };
  const log = (s) => out.steps.push(s);
  const step = async (secs) => { for (let t = 0; t < secs; t += 0.25) await DL.step({ seconds: 0.25 }); };
  await DL.start();
  await DL.god({ on: true });
  await DL.setTime({ hour: 21 }); await DL.setWeather({ key: 'CLEAR', instant: true });
  const papago = S.byId.get('papago');
  // 1. The rig, parked by the hatch; two crew.
  await DL.underground({ action: 'enter', id: papago.site.id, level: 0 });
  const v = g.vehiclesSys.spawn('pickup', g.player.x + 8, g.player.z + 5, 0.4, '#5d6b4a');
  await DL.enterVehicle({ id: v.id, force: true }); await DL.exitVehicle();
  const rig0 = { id: v.id, x: Math.round(v.x), z: Math.round(v.z), hp: Math.round(v.hp) };
  log(`rig parked at ${rig0.x}, ${rig0.z}`);
  for (const row of ['wall_veteran', 'field_medic']) { const r = await DL.crewJoin({ spawn: row }); log(`${r.name ?? row} joins`); }
  // 2. Down, the generator, the card, the blast door.
  await DL.underground({ action: 'enter', id: papago.site.id, level: 1 });
  const gen = await DL.generator({ action: 'start', fuel: 0.6, force: true }); log(`generator: power ${gen.power}`);
  await DL.underground({ action: 'enter', id: papago.site.id, level: 2 });
  const card = await DL.underground({ action: 'read', log: 'ring_card', force: true }); log(`read ${card.title}`);
  const R = S.liveStation();
  const kp = await DL.underground({ action: 'keypad', door: R.door.id }); log(`blast door: ${kp.already ? 'already open' : kp.ok ? `opened with ${kp.code}` : kp.error}`);
  // 3. Onto the deck with the crew; arm at the console, ROULETTE.
  const sl = S.slots(R, 3);
  g.player.x = sl[0].x; g.player.z = sl[0].z; g.standOn(g.player);
  g.crew.members.forEach((m, i) => { m.c.x = sl[i + 1].x; m.c.z = sl[i + 1].z; m.c.gy = R.y; g.standOn(m.c); });
  await DL.carousel({ action: 'console' });
  await DL.carousel({ action: 'pick', choice: 'arm' }); log('ring armed');
  await DL.carousel({ action: 'pick', choice: 'roulette' }); log('ROULETTE');
  const n0 = S.counts.throws;
  for (let t = 0; t < 8 && S.counts.throws === n0; t += 0.25) await DL.step({ seconds: 0.25 });
  const T = S.lastThrow;
  out.throw = { to: T.to, region: T.region, bad: T.bad, crew: T.crew.length, sick: T.sick };
  log(`thrown to ${T.to} (${T.region})${T.bad ? ' BADLY' : ''} with ${T.crew.length} crew; ring-sick ${T.sick}`);
  out.rigAfterThrow = { stays: g.vehicles.includes(v) && Math.hypot(v.x - rig0.x, v.z - rig0.z) < 2, km: Math.round(Math.hypot(g.player.x - v.x, g.player.z - v.z) / 1000) };
  await step(3.2);
  out.door = S.live?.door?.locked === false;
  // 4. Rest a while (a quiet room, the clock forward 21 game minutes): one stack goes.
  const s0 = S.st.sick;
  await DL.setTime({ hour: g.sky.time + 21 / 60 }); await step(0.5);
  out.decay = [s0, S.st.sick];
  log(`rested: ring-sick ${s0} -> ${S.st.sick}`);
  // 5. Wake this station and BACKSPIN home to the rig.
  await DL.generator({ action: 'start', fuel: 0.5, force: true });
  const here = S.liveStation(), sl2 = S.slots(here, 3);
  g.player.x = sl2[0].x; g.player.z = sl2[0].z; g.standOn(g.player);
  g.crew.members.forEach((m, i) => { if (m.c?.alive) { m.c.x = sl2[i + 1].x; m.c.z = sl2[i + 1].z; m.c.gy = here.y; g.standOn(m.c); } });
  const back = await DL.ringJump({ kind: 'backspin' });
  out.back = { to: back.to, crew: back.crew.length, sick: back.sick };
  log(`BACKSPIN to ${back.to}; ring-sick ${back.sick}`);
  out.rigHome = { there: g.vehicles.includes(v), x: Math.round(v.x), z: Math.round(v.z), hp: Math.round(v.hp), metres: Math.round(Math.hypot(g.player.x - v.x, g.player.z - v.z)) };
  out.ok = T.region !== 'arizona' && out.rigAfterThrow.stays && out.door && out.decay[1] === s0 - 1 && back.to === 'papago' && out.rigHome.metres < 80;
  return out;
}
