// CREW RUN (docs/design/WEB_CREW.md §7): assemble a crew the way a player does - the Wheel Boss by talking to him in
// Rust Haven, the sutler's guard hired at his rate - drive the pickup out to the Dustwolf camp in the west flats, hit it
// in a wedge, cut the captives loose by dialogue (the third recruit), then make camp: a watch and a cook. Returns what
// happened: who rode, who fell, the kills, the trust moves, the tactics counters.
export default async function (DL, game) {
  const g = game, K = g.crew, out = { steps: [] };
  const log = (s) => out.steps.push(s);
  await DL.start();
  await DL.god({ on: true });
  await DL.setTime({ hour: 9 }); await DL.setWeather({ key: 'CLEAR', instant: true });
  g.cash = Math.max(g.cash, 200);
  await DL.give({ weapon: 'smg', smg: 160 }); await DL.equip({ weapon: 'smg' });
  const talkJoin = async (key, starts) => {
    const s = K.cands.get(key);
    if (!s?.c?.alive) { log(`${key}: not standing`); return false; }
    await DL.teleport({ x: s.c.x + 1.3, z: s.c.z });
    const t = await DL.talk({ id: s.c.id }); if (!t.ok) { log(`${key}: ${t.error}`); return false; }
    const d = DL.dialogueState(), i = d.choices.findIndex((c) => c.text.startsWith(starts));
    if (i < 0) { log(`${key}: no choice "${starts}"`); g.dialogue.close(); return false; }
    await DL.choose({ index: i }); if (g.dialogue.active) g.dialogue.close();
    log(`${key}: joined by dialogue`); return true;
  };
  // 1. Two in Rust Haven: talk and hire.
  await talkJoin('rh_wheelboss', 'Ride with me');
  await talkJoin('rh_guard', 'Hire on');
  // 2. The pickup by the east road, everyone aboard, out to camp 0 (the west flats).
  const v = g.vehicles.find((x) => x.type === 'pickup' && !x.dead && !x.driver) ?? g.vehiclesSys.spawn('pickup', 30, 3.5, -Math.PI / 2, '#56603f');
  await DL.teleport({ x: v.x + 3, z: v.z }); await DL.step({ seconds: 2 });
  await DL.enterVehicle({ id: v.id, force: true }); await DL.step({ seconds: 2 });
  out.aboard = K.members.filter((m) => m.c?.inVehicle === v || m.c?.onDeck?.v === v).length;
  const camp = g.world.spawns.camps[0];
  const dr = await DL.drive({ x: camp.x + 70, z: camp.z + 10, budget: 240 });
  log(`drive: ${dr.ok ? `arrived ${dr.arrived}` : dr.error}`);
  await DL.exitVehicle(); await DL.step({ seconds: 1.5 });
  // 3. The wedge assault: follow in a wedge, free fire, walk in.
  await DL.crewOrder({ order: 'wedge' }); await DL.crewOrder({ order: 'freefire' });
  const k0 = g.stats.raiderKills, seq = g.eventSeq;
  await DL.moveTo({ x: camp.x + 18, z: camp.z + 4 });
  await DL.fire({ id: 'hostile', shots: 40 });
  await DL.step({ seconds: 20 });
  out.assault = { kills: g.stats.raiderKills - k0, crewDowns: g.events.filter((e) => e.seq > seq && e.type === 'crewDown').length, flanks: g.tactics.stats.flanks, plans: g.tactics.stats.plans };
  for (const m of K.members) if (m.down) K.stabilize(m); // patch up who went down (the scenario's medic)
  // 4. The captives: cut loose by dialogue.
  await talkJoin('camp0_captive_a', 'Cut them loose. "Ride');
  await talkJoin('camp0_captive_b', 'Cut them loose. "Ride');
  // 5. Camp: a watch and a cook; a game hour on the job clock.
  await DL.crewOrder({ order: 'watch' });
  const cook = K.members.find((m) => m.row.skills.cook >= 3) ?? K.members[0], watch = K.members.find((m) => m !== cook);
  if (cook) await DL.crewJob({ id: String(cook.id), job: 'cook' });
  if (watch) await DL.crewJob({ id: String(watch.id), job: 'watch' });
  g.inventory.add(g.inventory.carried, 'jerky', 2);
  await DL.crewJob({ advance: 1 });
  out.crew = K.members.map((m) => ({ name: m.name, card: m.row.name, how: m.how, trust: +m.trust.toFixed(1), hp: Math.round(m.c?.hp ?? 0), job: m.job, kills: m.kills }));
  out.size = K.size(); out.graves = K.graves.length; out.tactics = { ...g.tactics.stats };
  return out;
}
