// END-TO-END AGENT PLAYTHROUGH of the Dustwolf Bounty, using only public commands: no god mode, no teleport, no exec.
// The one piece of staging is the start (a clear morning). After that it plays the way a sensible person would:
//   1. Walk to Sheriff Okonkwo and take the job.
//   2. Gear up at Ike's counter. If he is asleep (the town sleeps 22:00-06:00) stand at his bed and wake him, the way
//      E does; if a locked door is in the way, pick it (or pry it, or kick it in) rather than walk into it for hours.
//   3. Take the Whaler (or the nearest sound, empty vehicle). Always get out before walking anywhere.
//   4. Hunt LIVE Dustwolves: every round asks the game where they are now (query faction=raider: the off-screen
//      faction sim decides which camps still field them), drives at the nearest pack, rams from the cab while the
//      engine holds, and fights on foot with `engage` when they are dug in where a car cannot go. Ambushed on foot, it
//      fights back instead of walking on; hurt, it pulls back out of the fight, patches up and lets its wounds settle.
//   5. Swaps a ride whose engine, tank or tyres are gone, and picks up what the dead drop once the shooting stops.
//   6. Drives home, walks in to the sheriff and collects the $250.
// Run: node tools/dl.mjs scenario name=bounty-run
export default async function (DL) { // public commands only: it never touches the game object
  const log = [];
  const wall0 = Date.now();
  const WALL_LIMIT = 6.5 * 60 * 1000;                     // leave time to go home inside the scenario's 900 s budget
  let clock = '--:--', lastPos = null;
  let lastNote = '', repeats = 0;
  const note = (m) => {
    if (m === lastNote) { repeats++; log[log.length - 1] = log[log.length - 1].replace(/ \(x\d+\)$/, '') + ` (x${repeats + 1})`; return; }
    lastNote = m; repeats = 0; log.push(`[${clock}] ${m}`);
  };
  const st = () => DL.state();
  const tick = async () => { const s = await st(); clock = s.world.time; if (s.player.alive) lastPos = { x: s.player.x, z: s.player.z, where: s.player.location }; return s; };
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const AMMO = { pistol: 'pistol', smg: 'smg', shotgun: 'shells', rifle: 'rifle' };
  let myRide = null, rigId = null, kenjiFixes = 0;
  let deaths = 0, rides = 0, rams = 0, footFights = 0, retreats = 0;
  const kills = (s) => (s.quests.bounty === 'active' || s.quests.bounty === 'done') ? s.stats.raiderKills - s.quests.bountyStart : 0;
  const late = () => Date.now() - wall0 > WALL_LIMIT;
  const gun = (s) => `${s.inventory.current} ${s.inventory.mag[s.inventory.current] ?? 0}+${s.inventory.ammo[AMMO[s.inventory.current]] ?? 0}`;
  // A ride is only a ride if it can make power and steer (vehicledamage.js: a dead engine or a dry tank is no power).
  const usable = (v) => v && !v.dead && !v.onFire && !v.sunk && v.hp > v.maxHp * 0.35 && (v.parts?.engine ?? 1) > 0.2 && (v.fuel ?? 1) > 3
    && flats(v) < 3;
  const flats = (v) => Object.values(v.parts?.tyres ?? {}).filter((t) => t <= 0.05).length;
  // Whose ride it is matters: a parked car nobody drives (ai none), or a Dustwolf buggy whose rider is gone. A
  // townsman's car with its door open is still his (he drags you out), and the Remnant's trucks bring the base down.
  const RIDE_PREF = { rig: 0, pickup: 1, interceptor: 2, rat_rod: 3, buggy: 3, atv: 4, motorcycle: 5, bike: 5 };
  const free = (v) => usable(v) && !v.boat && !v.driver && !v.fallen && v.type in RIDE_PREF && (v.ai == null || v.ai === 'none' || v.ai === 'raider');
  const carState = (v) => `${v.name} hp ${v.hp}/${v.maxHp}, engine ${Math.round((v.parts?.engine ?? 1) * 100)}%${flats(v) ? `, ${flats(v)} flat${flats(v) > 1 ? 's' : ''}` : ''}${(v.fuel ?? 9) <= 3 ? ', tank dry' : ''}`;

  // ---- the body: alive, on foot, patched up, rested ------------------------------------------------------------------
  const alive = async () => {
    const was = lastPos;
    let s = await tick();
    if (s.player.alive) return s;
    deaths++;
    // Who did it, from the game's own event log.
    const ev = ((await DL.events({ type: 'kill' })).events ?? []).filter((e) => e.victim === 'c1').pop();
    const killer = ev?.by ? ((await DL.query({ type: 'char', radius: 3000, limit: 500 })).items.find((c) => c.id === ev.by) ?? { name: ev.by }) : null;
    const how = ev ? ` (${ev.cause === 'vehicle' ? 'run over' : ev.cause}${killer ? ` by ${killer.name}${killer.faction ? `, ${killer.faction}` : ''}` : ''})` : '';
    for (let i = 0; i < 10 && !s.player.alive; i++) { await DL.step({ seconds: 2 }); s = await tick(); }
    note(`Went down${was ? ` near (${was.x}, ${was.z}), ${was.where}` : ''}${how}. Woke at the clinic (${s.player.x}, ${s.player.z}), hp ${s.player.hp}.`);
    return s;
  };
  const onFoot = async (why) => {
    const s = await st();
    if (!s.vehicle) return;
    const r = await DL.exitVehicle();
    note(`Out of the ${s.vehicle.name}${why ? ` (${why})` : ''}${r.fledBurningVehicle ? ': it was burning, ran clear' : ''}.`);
  };
  // Meds only, and only for a real wound: the V key's "whatever you need most" drinks the water first.
  const patchUp = async (why) => {
    for (let i = 0; i < 3; i++) {
      const s = await st();
      if (!s.player.alive || s.player.hp >= 60) return;
      const meds = ((await DL.inventory()).carried?.items ?? []).filter((it) => it.kind === 'med' && it.id !== 'antibiotics');
      const best = meds.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
      if (!best) return;
      const r = await DL.item({ use: best.id });
      if (!r.ok) return;
      note(`Patched up (${why}): ${best.name}, hp ${s.player.hp} -> ${(await st()).player.hp}.`);
    }
  };
  const hostilesNear = async (r) => ((await DL.query({ type: 'char', alive: true, radius: r, limit: 60 })).items ?? []).filter((c) => c.hostileToPlayer && !c.vehicle);
  // Wounds settle to 60% after 6 s without being hit (main.js QOL): wait for it where nobody is shooting.
  // Somebody hostile in sight: get clear first (once), then rest.
  const rest = async (why, canMove = true) => {
    let s = await st();
    if (!s.player.alive || s.player.hp >= 58) return;
    await patchUp(why);
    const foes = await hostilesNear(60);
    if (foes.length && canMove) return retreat(foes[0], `${why}, with ${foes[0].name} in sight`);
    const hp0 = (s = await st()).player.hp;
    for (let i = 0; i < 6 && s.player.alive && s.player.hp < 58; i++) {
      if ((await hostilesNear(45)).length) break;
      await DL.step({ seconds: 5 });
      s = await tick();
    }
    if (s.player.hp > hp0) note(`Caught my breath (${why}): hp ${hp0} -> ${s.player.hp}.`);
  };

  // ---- fighting on foot ----------------------------------------------------------------------------------------------
  const fight = async (why, radius = 70, minHp = 40) => {
    await onFoot('to fight');
    footFights++;
    const k0 = kills(await st());
    note(`Fighting on foot: ${why}.`);
    let out = 'time';
    for (let i = 0; i < 8; i++) {
      const e = await DL.engage({ seconds: 15, radius, minHp });
      if (!e.ok) { out = e.error; break; }
      if (e.stopped === 'no enemies in radius') { out = 'clear'; break; }
      if (e.stopped === 'died') { out = 'died'; break; }
      if (e.stopped === 'low health') { await patchUp('low in a fight'); if ((await st()).player.hp < minHp + 5) { out = 'hurt'; break; } continue; }
      if (e.stopped === 'out of ammo' || e.stopped === 'gun broken') { out = e.stopped; break; }
      if (e.stopped === 'unreachable target') { out = 'unreachable'; break; }
    }
    const s = await tick();
    note(`  ...${out}: ${kills(s) - k0} Dustwolves down in this fight, hp ${s.player.hp}, ${gun(s)}. Bounty ${kills(s)}/6.`);
    return out;
  };
  // Hurt: put distance between you and them (by car if the ride still runs), then rest.
  const retreat = async (from, why) => {
    retreats++;
    let s = await alive();
    const here = s.vehicle ?? s.player;
    const dx = here.x - from.x, dz = here.z - from.z, dd = Math.hypot(dx, dz) || 1;
    const back = { x: Math.max(-440, Math.min(440, here.x + (dx / dd) * 80)), z: Math.max(-440, Math.min(440, here.z + (dz / dd) * 80)) };
    note(`Pulling back (${why}), hp ${s.player.hp}.`);
    if (s.vehicle && !usable(s.vehicle)) { await onFoot(`the ${carState(s.vehicle)} will not take me anywhere`); s = await st(); }
    if (!s.vehicle) {
      const ride = ((await DL.query({ type: 'vehicle', radius: 25, limit: 10 })).items ?? []).find((v) => free(v) || (v.id === myRide && usable(v)));
      if (ride) { const m = await DL.moveTo({ id: ride.id, run: true, maxSeconds: 12 }); if (m.arrived && (await DL.enterVehicle({ id: ride.id })).ok) { myRide = ride.id; note(`Back in the ${ride.name}.`); } }
      s = await st();
    }
    if (s.vehicle && usable(s.vehicle)) await DL.drive({ x: back.x, z: back.z, seconds: 20 });
    else if (s.player.alive) await DL.moveTo({ x: back.x, z: back.z, run: true, maxSeconds: 15 });
    await rest(why, false);
  };

  // ---- the dead carry what you need: their rounds, and a gun you do not have yet ----------------------------------
  const scavenge = async () => {
    const bodies = ((await DL.query({ type: 'char', faction: 'raider', alive: false, radius: 35, limit: 5 })).items ?? []).slice(0, 3);
    const got = [];
    for (const b of bodies) {
      if ((await hostilesNear(80)).length) break;
      const m = await DL.moveTo({ x: b.x, z: b.z, run: true, maxSeconds: 12 });
      if (m.interrupted) { note(`Stopped searching the dead: ${m.interrupted}.`); break; }
      if (!m.arrived) continue;
      const box = (await DL.pack({ on: true })).other;
      const s0 = await st();
      for (const it of box?.items ?? []) {
        if (it.kind === 'ammo' || it.kind === 'med') { const r = await DL.item({ take: it.id, n: 999 }); if (r.ok) got.push(`${it.n ?? ''} ${it.name}`.trim()); }
        const w = { gun_smg: 'smg', gun_shotgun: 'shotgun', gun_rifle: 'rifle' }[it.id];
        if (w && !s0.inventory.weapons.includes(w) && (it.cond ?? 1) > 0.15) { const r = await DL.gun({ sling: it.id }); if (r.ok) got.push(`${it.name} (${Math.round((it.cond ?? 1) * 100)}%)`); }
      }
      await DL.pack({ on: false });
    }
    if (got.length) { const s1 = await st(); note(`Searched ${bodies.length} dead Dustwolves: ${got.join(', ')}. Now carrying ${s1.inventory.weapons.map((w) => `${w} ${(s1.inventory.mag[w] ?? 0) + (s1.inventory.ammo[AMMO[w]] ?? 0)}`).join(', ')}.`); }
  };

  // ---- walking: on foot, sized to the distance, and an ambush becomes a fight ---------------------------------------
  const walk = async (to, label) => {
    let last = { arrived: false };
    for (let k = 0; k < 4; k++) {
      await alive();
      await onFoot(`to walk to ${label}`);
      const s = await st();
      const tgt = to.id ? ((await DL.query({ type: 'char', radius: 2000, limit: 400 })).items.find((c) => c.id === to.id) ?? (await DL.query({ type: 'vehicle', radius: 2000, limit: 400 })).items.find((v) => v.id === to.id)) : to;
      if (!tgt) return { arrived: false, error: `${label} is gone` };
      last = await DL.moveTo({ ...(to.id ? { id: to.id } : { x: to.x, z: to.z }), run: true, maxSeconds: Math.min(300, 20 + d2(s.player, tgt) / 4) });
      if (!last.ok) { note(`Walk to ${label}: ${last.error}`); return last; }
      if (last.arrived) return last;
      if (/^under fire/.test(last.interrupted ?? '')) {
        note(`Walking to ${label}, came under fire at (${last.x}, ${last.z}).`);
        const f = await fight(`shot at on the way to ${label}`);
        if (f === 'hurt') await retreat(last, 'too hurt to walk on through it');
        continue;
      }
      if (last.interrupted === 'player died') continue;
      note(`Walk to ${label} stopped ${last.remaining} m short: ${last.hint ?? last.interrupted ?? 'no reason given'}.`);
    }
    return last;
  };

  // ---- getting through a locked door the honest way: pick, pry, or boot it --------------------------------------------
  const throughLocked = async (x, z, label) => {
    const locked = (await DL.doors({ x, z, radius: 14, locked: true })).items ?? [];
    for (const door of locked) {
      const w = await walk({ x: door.kickFrom.x, z: door.kickFrom.z }, `the locked ${door.kind} door of ${door.building?.name ?? label}`);
      if (!w.arrived) continue;
      const kit = (await DL.inventory()).carried?.items ?? [];
      const tool = ['lockpicks', 'crowbar'].find((t) => kit.some((it) => it.id === t));
      if (tool) {
        const u = await DL.item({ use: tool });
        if (u.used) { note(`The ${door.kind} door was locked: ${u.used.toLowerCase()} with the ${tool}.`); continue; }
      }
      for (let k = 0; k < 4; k++) {
        const r = await DL.door({ id: door.id, action: 'kick' });
        if (!r.ok) { note(`Kick at ${door.id}: ${r.error}`); break; }
        if (!r.locked) { note(`The ${door.kind} door was locked: kicked it in (${k + 1} kick${k ? 's' : ''}).`); break; }
      }
    }
    return locked.length;
  };

  // ---- a town errand: find them, deal with the night and the doors, open the talk -----------------------------------
  const errand = async (npc, label) => {
    for (let k = 0; k < 4; k++) {
      await alive();
      const who = (await DL.query({ type: 'char', named: true, radius: 2000, limit: 60 })).items.find((c) => c.npcId === npc);
      if (!who) { note(`${label}: nobody by that name in the world.`); return { ok: false }; }
      if (!who.alive) { note(`${label} is down; waiting.`); await DL.step({ seconds: 10 }); continue; }
      const w = await walk({ id: who.id }, label);
      if (!w.arrived) {
        const n = await throughLocked(who.x, who.z, label);
        if (!n) note(`Could not reach ${label} at (${who.x}, ${who.z}), and no locked door is in the way; trying again.`);
        continue;
      }
      const town = await DL.town({ radius: 8 });
      if (town.asleep?.some((c) => c.id === who.id)) {
        await DL.town({ wake: who.id }); // standing at the bedside: the E key's shake
        note(`${label} was asleep at ${clock} (the town sleeps 22:00-06:00); shook them awake.`);
      }
      const r = await DL.talk({ id: who.id });
      if (r.ok) return r;
      note(`Talk to ${label}: ${r.error}`);
      const back = /back on their feet in (\d+)s/.exec(r.error ?? '');
      if (back) await DL.step({ seconds: Number(back[1]) + 1 });
    }
    return { ok: false, choices: [] };
  };
  const pick = async (d, re) => { const i = (d.choices ?? []).findIndex((c) => re.test(c.text ?? '')); return i >= 0 ? DL.choose({ index: i }) : null; };
  const leave = async () => { for (let i = 0; i < 4; i++) { const d = await DL.dialogue(); if (!d.open) return; const j = d.choices.findIndex((c) => c.ends); await DL.choose({ index: j >= 0 ? j : d.choices.length - 1 }); } };

  // ---- rides: the current one if it still runs, else the nearest empty one that does --------------------------------
  // Kenji's "Repair my last ride" ($60): worth it while the wreck is still in one piece and close enough to walk to.
  const kenjiFix = async () => {
    const s = await st();
    const last = (await DL.query({ type: 'vehicle', radius: 3000, limit: 300 })).items.find((v) => v.id === myRide);
    if (!last || last.dead || last.onFire || last.boat || usable(last) || s.cash < 60 || kenjiFixes >= 3) return false;
    if (d2(last, { x: -26, z: -57 }) > 520 || d2(last, s.player) > 440) return false; // a walk of a minute or two, and inside getRide's search
    kenjiFixes++;
    const dk = await errand('kenji', 'Kenji at the garage');
    const fixed = dk.ok ? await pick(dk, /repair my last ride/i) : null;
    await leave();
    if (fixed) { note(`Paid Kenji $60 to fix the ${carState(last)} out at (${last.x}, ${last.z}).`); return true; }
    note(`Kenji would not fix the ${last.name}: ${(dk.choices ?? []).map((c) => c.text).join(' / ')}`);
    return false;
  };
  const getRide = async (prefer) => {
    let s = await alive();
    if (s.vehicle && usable(s.vehicle)) return s.vehicle;
    if (s.vehicle) await onFoot(`the ${carState(s.vehicle)} is done`);
    s = await st();
    // The Whaler is the weapon (its harpoon): if it was the last ride and it is down, Kenji fixes it before anything else.
    if (myRide && myRide === rigId && await kenjiFix()) return getRide(myRide);
    const cands = (await DL.query({ type: 'vehicle', radius: 450, limit: 120 })).items
      .filter((v) => free(v) && v.hp > v.maxHp * 0.5)
      .sort((a, b) => (b.type === prefer || b.id === prefer) - (a.type === prefer || a.id === prefer) || (a.dist + 25 * RIDE_PREF[a.type]) - (b.dist + 25 * RIDE_PREF[b.type]));
    for (const v of cands.slice(0, 4)) {
      for (let k = 0; k < 2; k++) {
        const w = await walk({ id: v.id }, `the ${v.name}`);
        if (!w.ok) break;
        const e = await DL.enterVehicle({ id: v.id });
        if (e.ok) { rides++; myRide = v.id; if (v.type === 'rig') rigId = v.id; note(`Took the ${v.name} (${v.type}, ${carState(e)}).`); return e; }
        note(`Could not take the ${v.name} yet: ${e.error}`);
      }
    }
    // Nothing runs nearby: pay Kenji to fix the last ride.
    if (myRide && await kenjiFix()) return getRide(myRide);
    note('No running, empty vehicle within reach.');
    return null;
  };
  // A car needs a road there: ask for a car route first (a point inside the ruins' walls has none, and `drive` would
  // beeline into the wall). No route: try nearer points on the way, then give up and let the caller walk.
  const carSpot = async (x, z) => {
    const s = await st(), from = s.vehicle ?? s.player;
    for (const f of [1, 0.85, 0.7, 0.5]) {
      for (const side of [0, 14, -14]) {
        const dx = x - from.x, dz = z - from.z, dd = Math.hypot(dx, dz) || 1;
        const px = from.x + dx * f + (-dz / dd) * side, pz = from.z + dz * f + (dx / dd) * side;
        if ((await DL.path({ x: px, z: pz, mode: 'car' })).found) return { x: px, z: pz, moved: f < 1 || side !== 0 };
      }
    }
    return null;
  };
  const driveTo = async (x, z, label) => {
    let r = null;
    for (let k = 0; k < 3; k++) {
      const s = await alive();
      if (!s.vehicle) { note(`Drive to ${label}: on foot (no ride).`); return { arrived: false, interrupted: 'no vehicle' }; }
      if (Math.hypot(s.vehicle.x - x, s.vehicle.z - z) < 14) { r = { arrived: true }; break; }
      const spot = await carSpot(x, z);
      if (!spot) { note(`No road for a car to ${label}; going on foot from here.`); return { arrived: false, interrupted: 'no road' }; }
      if (spot.moved) { x = spot.x; z = spot.z; }
      r = await DL.drive({ x, z, seconds: 90 });
      if (!r.ok) { note(`Drive to ${label}: ${r.error}`); return r; }
      if (r.arrived || r.interrupted) break;
    }
    const s = await tick();
    const at = s.vehicle ?? s.player;
    note(`Drove to ${label}: ${r?.arrived ? 'there' : r?.interrupted ?? `stopped ${Math.round(Math.hypot(at.x - x, at.z - z))} m short`}${s.vehicle ? `, ${carState(s.vehicle)}` : ''}.`);
    return r ?? { arrived: false };
  };
  // Get somewhere far: by road while a ride runs (swapping a dead one), on foot for the rest.
  const travel = async (x, z, label) => {
    let r = null;
    for (let k = 0; k < 3; k++) {
      if (!(await getRide())) break;
      r = await driveTo(x, z, label);
      if (r.arrived || r.interrupted === 'player died') return r;
      if (r.interrupted === 'no road' || /^stuck/.test(r.interrupted ?? '')) break;
    }
    const s = await alive();
    if (s.vehicle && usable(s.vehicle) && d2(s.vehicle, { x, z }) < 90) return r ?? { arrived: false }; // close enough to fight from the cab
    if (d2(s.vehicle ?? s.player, { x, z }) > 14) return walk({ x, z }, label);
    return { arrived: true };
  };

  // ---- where the Dustwolves are NOW ----------------------------------------------------------------------------------
  const map = await DL.map();
  const bases = map.bases ?? [];
  const nearBase = (c) => bases.some((b) => c.x > b.fence.x0 - 60 && c.x < b.fence.x1 + 60 && c.z > b.fence.z0 - 60 && c.z < b.fence.z1 + 60);
  const ring = (c) => Math.max(Math.abs(c.x), Math.abs(c.z));      // map: Rust Haven < 88, the ruins < 250, then the Glass Flats
  const wolves = async (radius = 2000) => (await DL.query({ type: 'char', faction: 'raider', alive: true, radius, limit: 300 })).items
    .filter((c) => !c.vehicle && ring(c) < 460 && !nearBase(c));
  const placeName = (c) => { const i = map.camps.findIndex((k) => Math.hypot(k.x - c.x, k.z - c.z) < 70); return i >= 0 ? `the camp at (${map.camps[i].x}, ${map.camps[i].z})` : `${ring(c) < 95 ? 'Rust Haven' : ring(c) < 250 ? 'the ruins' : 'the flats'} (${c.x}, ${c.z})`; };
  // In a car, pick a pack, not a straggler: near ones first, more company is better (the harpoon takes them one by one
  // from the cab). On foot it is the other way round: a pistol against a camp of five is a funeral, so stragglers first.
  // Raiders inside the wall are the wardens' fight (a car is no use in those streets); the ruins' walls stop a harpoon
  // and a bumper, so in a car the open flats come first.
  const pickTarget = (list, from, driving) => list.filter((c) => ring(c) >= 95).map((c) => ({ c, pack: list.filter((o) => d2(o, c) < 45).length }))
    .map((t) => ({ ...t, score: driving ? d2(t.c, from) * (ring(t.c) < 250 ? 1.5 : 1) / (1 + 0.6 * (t.pack - 1)) : d2(t.c, from) * (1 + 0.8 * (t.pack - 1)) }))
    .sort((a, b) => a.score - b.score)[0];

  // ---- the Whaler's harpoon: hook one, yank it (Kenji: "People... do not do well") -----------------------------------
  const harpoonOne = async (near, s) => {
    for (const c of near.filter((o) => d2(o, s.vehicle) < 44).slice(0, 3)) {
      const k0 = kills(s);
      const h = await DL.harpoon({ id: c.id });
      if (!h.ok) return false;
      if (h.state === 'attached') {
        await DL.step({ seconds: 0.3 });
        await DL.harpoon({ id: c.id }); // YANK
        await DL.step({ seconds: 1 });
        const s2 = await tick();
        if (kills(s2) > k0) { note(`Harpooned and yanked a Dustwolf ${Math.round(d2(c, s.vehicle))} m out (${carState(s2.vehicle ?? s.vehicle)}). Bounty ${kills(s2)}/6.`); return true; }
      } else await DL.step({ seconds: 0.6 }); // missed (moved, or a wall in the way): let the cable come home
    }
    return false;
  };

  // ======================================================================================================================
  await DL.start();
  await DL.setTime({ hour: 9 });
  await DL.setWeather({ key: 'CLEAR', instant: true });
  let s = await tick();
  const t0 = s.world.time, day0 = s.society?.day ?? 0;
  note(`Staged a clear morning. Start at (${s.player.x}, ${s.player.z}) with $${s.cash}, ${s.inventory.weapons.join('+')}.`);

  // 1. The job.
  let d = await errand('okonkwo', 'Sheriff Okonkwo');
  d = (await pick(d, /work/i)) ?? d;
  d = (await pick(d, /consider it done/i)) ?? d;
  await leave();
  s = await tick();
  note(s.quests.bounty === 'active' ? `Job accepted: ${(await DL.objective()).text}` : `The sheriff did not give the job (quests ${JSON.stringify(s.quests)}).`);

  // 2. Ammo from Ike (awake or woken, door locked or not).
  d = await errand('ike', 'Ike at the gunsmith');
  if (d.ok) {
    const bought = await pick(d, /ammo crate/i);
    note(bought ? `Bought Ike's ammo crate: $${bought.cash} left.` : `Ike had no ammo crate on offer (${(d.choices ?? []).map((c) => c.text).join(' / ')}).`);
    await leave();
  }

  // 3. The Whaler, if it is still on Kenji's lot; any running, empty ride otherwise.
  await getRide('rig');

  // 4. The hunt.
  for (let round = 0; round < 24 && kills(s = await alive()) < 6 && !late(); round++) {
    const list = await wolves();
    const driving = !!(s.vehicle && usable(s.vehicle)) || !!(await DL.query({ type: 'vehicle', radius: 450, limit: 120 })).items.find(free);
    const tgt = pickTarget(list, s.vehicle ?? s.player, driving);
    if (!tgt) { note(`No Dustwolf on foot outside the wall at ${clock}; waiting for them to ride out.`); await DL.step({ seconds: 20 }); continue; }
    if (s.player.hp < 55) await rest('before the next pack');
    s = await alive();
    const here = s.vehicle ?? s.player;
    note(`Round ${round + 1}: ${list.length} Dustwolves alive on foot. Going for a pack of ${tgt.pack} at ${placeName(tgt.c)}, ${Math.round(d2(tgt.c, here))} m off. Bounty ${kills(s)}/6.`);
    // Stop short: inside harpoon range of a straggler, outside a camp's walls and buggies (`drive` arrives at speed, and
    // a camp's wall at 19 m/s is most of an engine), then let the harpoon and the bumper close in.
    const atCamp = map.camps.some((k2) => d2(k2, tgt.c) < 70);
    const stand = atCamp ? 52 : 36;
    const far = d2(tgt.c, here), k = far > stand + 6 ? (far - stand) / far : 0;
    await travel(here.x + (tgt.c.x - here.x) * k, here.z + (tgt.c.z - here.z) * k, placeName(tgt.c));
    // Fight here until the pack is down: the harpoon from the cab, the bumper while the engine holds, `engage` on
    // foot when they are dug in where a car cannot go.
    let stuck = 0, misses = 0, pulls = 0;
    for (let t = 0; t < 30 && kills(s = await alive()) < 6 && !late(); t++) {
      const at = s.vehicle ?? s.player;
      const near = (await wolves()).filter((c) => d2(c, at) < 80);
      if (!near.length) { note(`Nobody left standing here. Bounty ${kills(s)}/6.`); break; }
      if (d2(at, tgt.c) > 160 && t) break; // respawned or chased off: plan again
      if (s.vehicle?.onFire) { await onFoot('it caught fire'); continue; }
      if (s.vehicle && usable(s.vehicle) && stuck < 2) {
        if (s.vehicle.harpoon && misses < 2) {
          if (await harpoonOne(near, s)) { misses = 0; stuck = 0; continue; }
          misses++;
        }
        const k0 = kills(s);
        const r = await DL.ram({ id: near[stuck % near.length].id, seconds: 7 });
        rams++; misses = 0;
        const s2 = await tick();
        if (kills(s2) > k0) { stuck = 0; note(`Ran down ${kills(s2) - k0} (${s2.vehicle ? carState(s2.vehicle) : 'on foot now'}). Bounty ${kills(s2)}/6.`); }
        else if (r.unreachable) stuck++;
        if (/fire/.test(r.interrupted ?? '')) await onFoot('it caught fire');
        else if (r.interrupted && !r.unreachable) note(`Ram stopped: ${r.interrupted}.`);
        continue;
      }
      // On foot: they are dug in where a car cannot go, or the ride is done.
      const dry = s.inventory.weapons.every((w) => (s.inventory.mag[w] ?? 0) + (s.inventory.ammo[AMMO[w]] ?? 0) === 0);
      if (dry) { note('No rounds left for a fight on foot; pulling out.'); await retreat(near[0], 'out of rounds'); break; }
      // Hurt: pull back and rest; if they keep coming (three pull-backs and still no rest), it is a fight anyway.
      if (s.player.hp < 50 && pulls < 3) { pulls++; await retreat(near[0], 'too hurt to walk into their guns'); continue; }
      if (s.player.hp < 50) {
        pulls = 0;
        const f = await fight('cornered: they keep coming, so it is a fight anyway', 60, 12);
        if (f === 'died') break;
        continue;
      }
      pulls = 0;
      const why = s.vehicle && !usable(s.vehicle) ? `the ${carState(s.vehicle)} is done` : stuck >= 2 ? 'they are dug in where the car cannot reach' : 'no ride here';
      const f = await fight(why, 80);
      stuck = 0;
      if (f === 'hurt') await retreat(near[0], 'the fight went bad');
      else if (f !== 'clear' && f !== 'time') break;
    }
    s = await alive();
    // Between fights: patch up, search the dead and pick up what they dropped (on foot, close by, once it is quiet).
    await rest('between fights');
    s = await st();
    if (s.player.alive && kills(s) < 6 && !(await hostilesNear(80)).length
      && ((await DL.query({ type: 'char', faction: 'raider', alive: false, radius: 35, limit: 3 })).items ?? []).length) {
      const ride = s.vehicle?.id;
      await scavenge();
      const loot = ((await DL.query({ type: 'pickup', radius: 30 })).items ?? []).slice(0, 4);
      for (const it of loot) if ((await DL.moveTo({ x: it.x, z: it.z, run: true, maxSeconds: 10 })).interrupted) break;
      if (loot.length) note(`Picked up ${loot.length} drops (${loot.map((l) => l.kind).join(', ')}).`);
      if (ride) { const m = await DL.moveTo({ id: ride, run: true, maxSeconds: 20 }); if (m.arrived) await DL.enterVehicle({ id: ride }); }
    }
    // Out of rounds and on foot: another crate at Ike's counter.
    s = await st();
    const dry = s.inventory.weapons.every((w) => (s.inventory.mag[w] ?? 0) + (s.inventory.ammo[AMMO[w]] ?? 0) === 0);
    if (dry && s.cash >= 50 && kills(s) < 6 && !(s.vehicle && usable(s.vehicle))) {
      note('Out of rounds: back to Ike for another crate.');
      await travel(-60, -8, 'the gunsmith');
      const di = await errand('ike', 'Ike at the gunsmith');
      if (di.ok && await pick(di, /ammo crate/i)) note(`Bought another crate: $${(await st()).cash} left.`);
      await leave();
    }
  }

  // 5. Home and paid.
  s = await alive();
  note(`Heading home with ${kills(s)}/6.${late() ? ' (Out of wall time for the hunt.)' : ''}`);
  const sheriff = (await DL.query({ type: 'char', named: true, radius: 2000, limit: 60 })).items.find((c) => c.npcId === 'okonkwo');
  if (sheriff && d2(sheriff, s.vehicle ?? s.player) > 90) await travel(sheriff.x, sheriff.z + 16, 'the sheriff at the north gate');
  await onFoot('to walk in to the sheriff');
  const cashBefore = (await st()).cash;
  d = await errand('okonkwo', 'Sheriff Okonkwo');
  const paid = await pick(d, /pay up/i);
  if (!paid) note(`The sheriff had no pay for us: "${d.text}"`);
  await leave();
  const final = await tick();
  note(`Sheriff paid $${final.cash - cashBefore}. Quest: ${final.quests.bounty}.`);
  return {
    completed: final.quests.bounty === 'done', bountyKills: kills(final), cashEarned: final.cash - cashBefore,
    gameStart: t0, gameEnd: final.world.time, gameDays: (final.society?.day ?? 0) - day0, wallSeconds: Math.round((Date.now() - wall0) / 1000),
    deaths, rides, rams, footFights, retreats, wanted: final.wanted, playerHp: final.player.hp, log,
  };
}
