// VEHICLES V2 slice 11, SKY DRONES (Robert 11-12: "we definitely need drones"; docs/status/vehicles-v2.md on
// docs/web-veh-status): the `skydrones` command and selftest checks. Rows: data/skydrones.js; the system: systems/skydrones.js.
import { ITEMS } from '../data/items.js';
import { SKY_DRONES, DRONE_NESTS, NEST_RULES, validateSkyDrones } from '../data/skydrones.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function vehDronesCommands(api, need) {
  const g = api.g;
  return { skydrones: { group: 'world', desc: 'SKY DRONES: every faction drone - its nest, state (pad, patrol, track, hunt, home, falling, gone), where, height, hp, battery, when a lost one is built again.', args: {}, run: async () => ({ drones: g.skydrones?.view() ?? [], counts: g.skydrones?.counts ?? null }) } };
}

export async function vehDronesChecks(api, check, C) {
  const g = api.g, S = () => g.skydrones, I = g.input;
  const nest = (id) => S().nests.find((N) => N.id === id), drone = (id) => S().drones.find((d) => d.id === id);
  const OUT = DRONE_NESTS.find((N) => N.fid === 'remnant'), ROOST = DRONE_NESTS.find((N) => N.fid === 'dustwolves');
  const reset = () => { for (const d of S().drones) S().dock(d); for (const N of S().nests) N.alert = null; };
  const off = () => { I.down.delete('KeyW'); g.aimOverride = null; reset(); g.player.hp = g.player.maxHp ?? 100; g.player.alive = true; };
  // Stand where the watcher's loop will bring it over you: on the circle a quarter turn ahead of it (staging).
  const ahead = (d, N) => { const a = d.loopA + 0.6; return { x: N.at.x + Math.cos(a) * N.loop, z: N.at.z + Math.sin(a) * N.loop }; };

  await check('sky drones: the rows validate; come near a nest and its watcher lifts off and flies its loop at height, banking into the turn, while the gun drone stays on the pad', async () => {
    try {
      const bad = validateSkyDrones(ITEMS);
      reset();
      await C('teleport', { x: OUT.at.x + 40, z: OUT.at.z + 60 }); await api._step(2);
      const w = drone(`${OUT.id}:watcher`), s = drone(`${OUT.id}:striker`); w.bat = w.D.battery; // staged: a charged watcher
      const x0 = w.x, z0 = w.z; let bank = 0, top = 0;
      for (let f = 0; f < 600; f++) { await api._step(1); bank = Math.max(bank, Math.abs(w.bank)); top = Math.max(top, w.y); }
      const moved = Math.hypot(w.x - x0, w.z - z0), fromNest = Math.hypot(w.x - OUT.at.x, w.z - OUT.at.z);
      const out = { bad, state: w.state, top: r1(top), moved: r1(moved), fromNest: r1(fromNest), bank: r1(bank * 100) / 100, gun: s.state, awake: nest(OUT.id).awake };
      return !bad.length && out.awake && (w.state === 'patrol' || w.state === 'track') && top > w.D.alt * 0.8 && moved > 20 && bank > 0.05 && s.state === 'pad' ? true : JSON.stringify(out);
    } finally { off(); }
  });

  await check('sky drones: a watcher that sees you comes over you and stays on you as you walk; the Remnant at your standing only watch (no call, no gun drone)', async () => {
    try {
      reset();
      await C('teleport', { x: OUT.at.x + 40, z: OUT.at.z + 60 }); await api._step(2);
      const w = drone(`${OUT.id}:watcher`), s = drone(`${OUT.id}:striker`); w.bat = w.D.battery;
      for (let f = 0; f < 240 && w.state !== 'patrol'; f++) await api._step(1);
      const spot = ahead(w, nest(OUT.id)); await C('teleport', spot); // staging: on its line
      const seq0 = g.eventSeq;
      for (let f = 0; f < 900 && w.state !== 'track'; f++) await api._step(1);
      if (w.state !== 'track') return JSON.stringify({ state: w.state, at: [r1(w.x), r1(w.z)], you: [r1(g.player.x), r1(g.player.z)] });
      I.down.add('KeyW'); let far = 0;
      for (let f = 0; f < 360; f++) { await api._step(1); if (f > 200) far = Math.max(far, Math.hypot(w.x - g.player.x, w.z - g.player.z)); } // once it has closed in
      I.down.delete('KeyW');
      const calls = ((await C('events', { since: seq0, type: 'droneCall' })).events ?? []).filter((e) => e.nest === OUT.id).length;
      const out = { state: w.state, far: r1(far), calls, gun: s.state, hostile: S().hostile(nest(OUT.id)) };
      return w.state === 'track' && far < 12 && (out.hostile || (calls === 0 && s.state === 'pad')) ? true : JSON.stringify(out);
    } finally { off(); }
  });

  await check('sky drones: at the Dustwolf roost the watcher radios you in, the gun drone launches, comes to you and fires real rounds that hit you', async () => {
    try {
      reset();
      const R = nest(ROOST.id), w = drone(`${ROOST.id}:watcher`), s = drone(`${ROOST.id}:striker`);
      await C('teleport', { x: ROOST.at.x + 40, z: ROOST.at.z + 60 }); await api._step(2);
      w.bat = w.D.battery; s.bat = s.D.battery;
      for (let f = 0; f < 240 && w.state !== 'patrol'; f++) await api._step(1);
      await C('teleport', ahead(w, R));
      const seq0 = g.eventSeq, shots0 = S().counts.shots;
      // Count the rounds that reach you from nobody's hand (the drone's: combat.hitscan with no shooter), god mode or not.
      const dmg0 = g.combat.damage; let hits = 0; g.combat.damage = function (t, d, by, ...a) { if (t === g.player && !by) hits++; return dmg0.call(this, t, d, by, ...a); };
      const hp0 = g.player.hp;
      let launched = false, minHp = hp0, closest = 1e9;
      for (let f = 0; f < 1500; f++) {
        await api._step(1);
        if (s.state === 'hunt') launched = true;
        if (launched) closest = Math.min(closest, Math.hypot(s.x - g.player.x, s.z - g.player.z));
        minHp = Math.min(minHp, g.player.hp);
        if (S().counts.shots - shots0 >= 6 && hits > 0) break;
      }
      g.combat.damage = dmg0;
      const calls = ((await C('events', { since: seq0, type: 'droneCall' })).events ?? []).filter((e) => e.nest === ROOST.id).length;
      const out = { watcher: w.state, calls, launched, closest: r1(closest), shots: S().counts.shots - shots0, hits, hostile: S().hostile(R) };
      return out.hostile && calls > 0 && launched && closest < s.D.orbit + 8 && out.shots > 0 && hits > 0 ? true : JSON.stringify(out);
    } finally { off(); }
  });

  await check('sky drones: you can shoot a gun drone down - it falls, breaks and leaves its parts on the ground; the nest builds another after a day', async () => {
    try {
      reset();
      const R = nest(ROOST.id), s = drone(`${ROOST.id}:striker`);
      await C('teleport', { x: ROOST.at.x + 30, z: ROOST.at.z + 30 }); await api._step(2);
      s.bat = s.D.battery; R.alert = { x: g.player.x, z: g.player.z, t: g.time }; // staged: the roost already wants you
      for (let f = 0; f < 600 && !(s.state === 'hunt' && s.y > s.D.alt * 0.8 && Math.hypot(s.x - g.player.x, s.z - g.player.z) < 25); f++) await api._step(1);
      const seq0 = g.eventSeq; let fired = 0; const ammo0 = { ...g.inv.ammo }, mag0 = { ...g.inv.mag }; // put back after (a full pack fails later checks)
      for (let k = 0; k < 40 && s.state !== 'falling' && s.state !== 'gone'; k++) {
        if (g.player.hp < 40) g.player.hp = 80;
        const r = await C('fire', { x: s.x, z: s.z, shots: 1 }); fired += r.fired ?? 0;
        if (r.error === 'out of ammo') for (const k in g.inv.ammo) g.inv.ammo[k] = 60; // staged: a pocketful more
        await api._step(6);
      }
      for (let f = 0; f < 600 && s.state !== 'gone'; f++) await api._step(1);
      Object.assign(g.inv.ammo, ammo0); Object.assign(g.inv.mag, mag0);
      const down = ((await C('events', { since: seq0, type: 'droneDown' })).events ?? []).some((e) => e.drone === s.id);
      const pile = g.inventory.groundAt(s.x, s.z), parts = pile ? pile.count('scrap') : 0;
      const gone = s.state === 'gone', at = s.rebuildAt;
      g.society.day = (g.society.day ?? 0) + 1; await api._step(2); // staged: a day goes by
      const back = s.state === 'pad';
      return down && gone && parts > 0 && back ? true : JSON.stringify({ fired, down, state: s.state, gone, parts, at: r1(at), back });
    } finally { off(); }
  });

  await check('sky drones: a save and a load keep a downed drone down until its nest has built it again', async () => {
    try {
      reset();
      const s = drone(`${ROOST.id}:striker`);
      s.state = 'gone'; s.rebuildAt = S().hours() + NEST_RULES.rebuild; // staged: shot down a moment ago
      const snap = (await C('save')).save;
      Object.assign(s, S().fresh(s.nest, s.kind)); // the page forgets
      await C('load', { save: snap }); await api._step(2);
      const kept = s.state === 'gone' && Math.abs(s.rebuildAt - (S().hours() + NEST_RULES.rebuild)) < 1;
      return kept ? true : JSON.stringify({ state: s.state, rebuildAt: r1(s.rebuildAt), now: r1(S().hours()) });
    } finally { S().drones.forEach((d) => { if (d.state === 'gone') Object.assign(d, S().fresh(d.nest, d.kind)); }); off(); }
  });
}
