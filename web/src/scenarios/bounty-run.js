// END-TO-END AGENT PLAYTHROUGH of the Dustwolf Bounty, using only public commands.
// No god mode, no teleport, no exec. Walk to the sheriff, take the job, buy ammo from Ike,
// take the War Rig, hit raider camps until 6 Dustwolves are down (ram + drive-by, bail out
// if the rig burns, then fight on foot with `engage`), hijack a ride home, collect the $250.
// Run: node tools/dl.mjs scenario name=bounty-run
export default async function (DL, game) {
  const log = [];
  const note = (m) => log.push(`[${game.sky.clock}] ${m}`);
  const t0 = game.time;
  const st = () => DL.state();
  // Approach a character and open dialogue; retries if they wandered off (never crashes the run).
  const chat = async (id) => {
    for (let k = 0; k < 5; k++) {
      if (!(await st()).player.alive) await DL.step({ seconds: 6 });
      if ((await st()).vehicle) await DL.exitVehicle();
      const m = await DL.moveTo({ id, run: true, maxSeconds: 300 });
      if (!m.ok) note(`walk to ${id}: ${m.error}`);
      const r = await DL.talk({ id });
      if (r.ok) return r;
      note(`talk ${id} retry: ${r.error}`);
      const back = /back on their feet in (\d+)s/.exec(r.error ?? '');
      if (back) await DL.step({ seconds: Number(back[1]) + 1 });
    }
    return { ok: false, choices: [] };
  };
  const pick = async (d, re) => { const i = (d.choices ?? []).findIndex((c) => re.test(c.text)); return i >= 0 ? DL.choose({ index: i }) : d; };
  const walk = async (x, z) => {
    if (!(await st()).player.alive) await DL.step({ seconds: 6 }); // wait out the respawn first
    const r = await DL.moveTo(typeof x === 'string' ? { id: x, run: true, maxSeconds: 300 } : { x, z, run: true, maxSeconds: 300 });
    if (!r.arrived) note(`walk stopped: ${r.error ?? r.interrupted ?? `time ran out at ${r.x},${r.z} (${r.remaining}m left)`}`);
    return r;
  };
  await DL.start();
  await DL.setTime({ hour: 9 });
  await DL.setWeather({ key: 'CLEAR' });

  // 1. Take the job.
  const map = await DL.map();
  const npc = (id) => map.namedNpcs.find((n) => n.npc === id);
  let d = await chat('okonkwo');
  d = await pick(d, /work/i);
  d = await pick(d, /done/i);
  if (d.open) await DL.choose({ index: 0 });
  note(`Job accepted: ${(await DL.objective()).text}`);

  // 2. Gear up at Ike's (walks through the shop door via A*).
  d = await chat('ike');
  const crate = (d.choices ?? []).findIndex((c) => /ammo/i.test(c.text));
  if (crate >= 0) { d = await DL.choose({ index: crate }); note(`Bought ammo crate, cash left $${d.cash}`); }
  if ((await DL.dialogue()).open) await DL.choose({ index: (await DL.dialogue()).choices.length - 1 });

  // 3. Into the Whaler.
  const rig = (await DL.query({ type: 'vehicle', radius: 300, limit: 60 })).items.find((v) => v.type === 'rig');
  await walk(rig.id);
  const took = await DL.enterVehicle({ id: rig.id });
  note(took.ok ? 'Took the Whaler' : `Could not take the Whaler: ${took.error}`);

  const kills = () => game.stats.raiderKills - game.quests.bountyStart;
  const getRide = async () => {
    const s = await st();
    if (s.vehicle && !s.vehicle.onFire && s.vehicle.hp > s.vehicle.maxHp * 0.3) return true;
    if (s.vehicle) await DL.exitVehicle(); // too damaged: swap rides
    const ride = (await DL.query({ type: 'vehicle', radius: 250, limit: 60 })).items.find((v) => !v.dead && !v.onFire && v.hp > v.maxHp * 0.5);
    if (!ride) return false;
    await walk(ride.id);
    const e = await DL.enterVehicle({ id: ride.id });
    if (e.ok) note(`Hijacked a ${ride.type}`);
    return e.ok;
  };

  // 4. Camp to camp (nearest first) until the bounty is met.
  const camps = (await DL.query({ type: 'camp' })).items;
  const visited = new Set();
  for (let round = 0; round < 10 && kills() < 6; round++) {
    let s = await st();
    if (!s.player.alive) { await DL.step({ seconds: 6 }); note('Respawned at the clinic'); s = await st(); }
    const target = camps.filter((c) => !visited.has(c.id)).sort((a, b) => Math.hypot(a.x - s.player.x, a.z - s.player.z) - Math.hypot(b.x - s.player.x, b.z - s.player.z))[0] ?? camps[round % camps.length];
    visited.add(target.id);
    if (await getRide()) {
      const r = await DL.drive({ x: target.x, z: target.z + 40, seconds: 120 });
      note(`Drove to camp (${target.x},${target.z}) via ${r.waypoints} waypoints, vehicle hp ${r.hp}`);
    } else {
      await walk(target.x, target.z + 30);
      note(`Walked to camp (${target.x},${target.z})`);
    }
    // Fight here: ram from the vehicle while it lives, then engage on foot.
    for (let t = 0; t < 40 && kills() < 6; t++) {
      s = await st();
      if (!s.player.alive) { note('Died in the fight'); break; }
      if (s.vehicle?.onFire) { note('Vehicle on fire — bailed'); await DL.exitVehicle(); continue; }
      const foes = (await DL.query({ type: 'char', faction: 'raider', alive: true, radius: 70 })).items.filter((f) => !f.vehicle);
      if (!foes.length) break;
      if (s.vehicle && s.vehicle.hp < s.vehicle.maxHp * 0.3) {
        note(`Vehicle badly damaged (${s.vehicle.hp}) — pulling out to swap`);
        await DL.drive({ x: s.player.x + (s.player.x > 0 ? -60 : 60), z: s.player.z + (s.player.z > 0 ? -60 : 60), seconds: 10 });
        break;
      }
      if (s.vehicle) {
        const r = await DL.ram({ id: foes[0].id, seconds: 6 });
        if (r.kills) note(`Ran down ${r.kills} (vehicle hp ${r.hp})`);
        if (r.unreachable) { note('Raiders dug in behind walls — going in on foot'); await DL.exitVehicle(); }
      } else {
        const e = await DL.engage({ seconds: 20, radius: 80, minHp: 25 });
        if (e.stopped === 'low health') { note(`Low health (${e.hp}) — falling back`); break; }
        if (e.stopped === 'out of ammo') { note('Out of ammo'); break; }
      }
    }
    note(`Bounty progress ${kills()}/6`);
    // Between fights: loot what the Dustwolves dropped (ammo, med kits, cash).
    s = await st();
    if (s.player.alive && !s.vehicle && kills() < 6) {
      const loot = (await DL.query({ type: 'pickup', radius: 35 })).items.slice(0, 4);
      for (const it of loot) await DL.moveTo({ x: it.x, z: it.z, run: true });
      if (loot.length) note(`Looted ${loot.length} drops`);
    }
    // Hurt and can afford it: get patched up at Doc Reyes before the next camp.
    s = await st();
    if (s.player.alive && s.player.hp < 55 && s.cash >= 40 && kills() < 6) {
      const doc = npc('reyes');
      if (await getRide()) await DL.drive({ x: doc.x, z: doc.z + 30, seconds: 120 });
      if ((await st()).vehicle) await DL.exitVehicle();
      const dd = await chat('reyes');
      const heal = dd.choices?.findIndex((c) => /patch/i.test(c.text)) ?? -1;
      if (heal >= 0) { await DL.choose({ index: heal }); note(`Healed by Doc Reyes (hp ${(await st()).player.hp})`); }
      if ((await DL.dialogue()).open) await DL.choose({ index: (await DL.dialogue()).choices.length - 1 });
    }
  }

  // 5. Home and get paid (retry: respawn if dead, ride if far, then walk in).
  const sh = npc('okonkwo');
  for (let attempt = 0; attempt < 5; attempt++) {
    let s = await st();
    if (!s.player.alive) { await DL.step({ seconds: 6 }); note('Respawned at the clinic'); s = await st(); }
    const far = Math.hypot(s.player.x - sh.x, s.player.z - sh.z);
    if (far < 4) break;
    if (far > 120 && (await getRide())) {
      const r = await DL.drive({ x: sh.x, z: sh.z - 14, seconds: 150 });
      note(`Drove home: ${r.arrived ? 'arrived' : r.interrupted ?? 'stopped'}`);
      if ((await st()).vehicle) await DL.exitVehicle();
    }
    const w = await walk('okonkwo');
    if (w.arrived) break;
  }
  const cashBefore = game.cash;
  d = await chat('okonkwo');
  const payIdx = d.choices?.findIndex((c) => /pay/i.test(c.text)) ?? -1;
  if (payIdx >= 0) await DL.choose({ index: payIdx });
  else if (d.open) await DL.choose({ index: d.choices.length - 1 });
  const final = await st();
  note(`Sheriff paid $${final.cash - cashBefore}. Quest: ${final.quests.bounty}`);
  return {
    completed: final.quests.bounty === 'done', bountyKills: kills(), cashEarned: final.cash - cashBefore,
    gameMinutesPlayed: +((game.time - t0) / 60).toFixed(1), playerHp: final.player.hp, log,
  };
}
