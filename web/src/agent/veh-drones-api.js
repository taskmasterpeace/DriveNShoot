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
  // Shoot at a drone the way a player does: the cursor on it (the aim at its height, main.js skyAim) and the trigger pulled,
  // a press at a time, until it falls or `tries` pulls. Returns the pulls.
  const shootAt = async (d, tries = 40) => {
    const ammo0 = { ...g.inv.ammo }, mag0 = { ...g.inv.mag }; let pulls = 0;
    try {
      for (let k = 0; k < tries && d.state !== 'falling' && d.state !== 'gone'; k++) {
        if (g.player.hp < 40) g.player.hp = 80;
        if (g.inv.mag[g.inv.current] <= 0) for (const a in g.inv.ammo) g.inv.ammo[a] = Math.max(g.inv.ammo[a], 30); // staged: rounds in the pocket
        g.aimOverride = { x: d.x + d.vx * 0.05, z: d.z + d.vz * 0.05, y: d.y };
        I.mouse.left = true; I.mouse.leftPressed = true; await api._step(1); I.mouse.left = false; I.mouse.leftPressed = false; pulls++;
        for (let f = 0; f < 14; f++) { g.aimOverride = { x: d.x, z: d.z, y: d.y }; await api._step(1); }
      }
    } finally { I.mouse.left = false; g.aimOverride = null; Object.assign(g.inv.ammo, ammo0); Object.assign(g.inv.mag, mag0); }
    return pulls;
  };
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
      reset(); const F = g.society.factions, st0 = F.standing[F.index.remnant]; F.set('remnant', 0); // staged: neutral with the Remnant (restored below)
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
      const out = { state: w.state, far: r1(far), calls, gun: s.state, hostile: S().hostile(nest(OUT.id)) }; F.set('remnant', st0);
      return w.state === 'track' && far < 12 && !out.hostile && calls === 0 && s.state === 'pad' ? true : JSON.stringify(out);
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
      // A hit counts only if it came along the line from the gun drone (dx, dz: the round's way).
      const dmg0 = g.combat.damage; let hits = 0; g.combat.damage = function (t, d, by, dx, dz, ...a) { if (t === g.player && !by && Number.isFinite(dx)) { const L = Math.hypot(g.player.x - s.x, g.player.z - s.z) || 1; if ((dx * (g.player.x - s.x) + dz * (g.player.z - s.z)) / L > 0.9) hits++; } return dmg0.call(this, t, d, by, dx, dz, ...a); };
      const hp0 = g.player.hp;
      let launched = false, minHp = hp0, closest = 1e9;
      for (let f = 0; f < 3600; f++) { // up to a minute: a raider's car between you and it takes rounds too
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
    } finally { delete g.combat.damage; off(); }
  });

  await check('sky drones: with the cursor on a gun drone your trigger shoots it down - it falls, breaks and leaves its parts on the ground; the nest has none for a day, then builds another', async () => {
    try {
      reset();
      const R = nest(ROOST.id), s = drone(`${ROOST.id}:striker`);
      await C('teleport', { x: ROOST.at.x + 30, z: ROOST.at.z + 30 }); await api._step(2);
      s.bat = s.D.battery; R.alert = { x: g.player.x, z: g.player.z, t: g.time }; // staged: the roost already wants you
      for (let f = 0; f < 600 && !(s.state === 'hunt' && s.y > s.D.alt * 0.8 && Math.hypot(s.x - g.player.x, s.z - g.player.z) < 25); f++) await api._step(1);
      // The cursor on it: a ray from the camera through the drone puts the aim on the drone at its height (main.js skyAim).
      const cam = g.camera.position, ty = S().ground(s.x, s.z) + s.y, L = Math.hypot(s.x - cam.x, ty - cam.y, s.z - cam.z);
      const aim = { x: 0, z: 0, y: 0 }, onIt = S().skyAim({ origin: cam, direction: { x: (s.x - cam.x) / L, y: (ty - cam.y) / L, z: (s.z - cam.z) / L } }, aim) === s && Math.hypot(aim.x - s.x, aim.z - s.z) < 0.01 && aim.y === s.y;
      const seq0 = g.eventSeq, scrap0 = g.inventory.groundAt(s.x, s.z, S().ground(s.x, s.z))?.count('scrap') ?? 0;
      const fired = await shootAt(s, 40);
      for (let f = 0; f < 600 && s.state !== 'gone'; f++) await api._step(1);
      const down = ((await C('events', { since: seq0, type: 'droneDown' })).events ?? []).some((e) => e.drone === s.id);
      const pile = g.inventory.groundAt(s.x, s.z, S().ground(s.x, s.z)), parts = (pile ? pile.count('scrap') : 0) - scrap0;
      const gone = s.state === 'gone', at = s.rebuildAt, wait = at - S().hours();
      const t0 = g.sky.time; g.sky.time = (t0 + 12) % 24; if (t0 + 12 >= 24) g.society.day += 1; await api._step(2); // staged: half a day goes by
      const half = s.state === 'gone';
      g.society.day = (g.society.day ?? 0) + 1; await api._step(2); // staged: and a whole one
      const back = s.state === 'pad';
      return onIt && down && gone && parts === s.D.salvage.find(([i]) => i === 'scrap')[1] && wait > 23 && half && back ? true : JSON.stringify({ onIt, fired, down, state: s.state, gone, parts, wait: r1(wait), half, back });
    } finally { off(); }
  });

  await check('sky drones: a save and a load keep a downed drone down until its nest has built it again, and a hurt one hurt', async () => {
    try {
      reset();
      const s = drone(`${ROOST.id}:striker`);
      s.state = 'gone'; s.rebuildAt = S().hours() + NEST_RULES.rebuild; // staged: shot down a moment ago
      const w = drone(`${ROOST.id}:watcher`); w.hp = 20; // staged: and its watcher winged
      const snap = (await C('save')).save;
      Object.assign(s, S().fresh(s.nest, s.kind)); Object.assign(w, S().fresh(w.nest, w.kind)); // the page forgets
      await C('load', { save: snap }); await api._step(2);
      const kept = s.state === 'gone' && Math.abs(s.rebuildAt - (S().hours() + NEST_RULES.rebuild)) < 1;
      return kept && w.hp === 20 ? true : JSON.stringify({ state: s.state, rebuildAt: r1(s.rebuildAt), now: r1(S().hours()), watcherHp: w.hp });
    } finally { S().drones.forEach((d) => { if (d.state === 'gone' || d.hp < d.D.hp) Object.assign(d, S().fresh(d.nest, d.kind)); }); off(); }
  });

  await check('sky drones: shooting a friendly faction drone is an attack on them - your standing with the Remnant drops, more when it comes down; a flat shot at a man passes under a drone over his head', async () => {
    const F = g.society.factions, st0 = F.standing[F.index.remnant];
    try {
      reset(); F.set('remnant', 10); // staged: on fine terms with them
      await C('teleport', { x: OUT.at.x + 40, z: OUT.at.z + 60 }); await api._step(2);
      const w = drone(`${OUT.id}:watcher`); w.bat = w.D.battery;
      for (let f = 0; f < 600 && !(w.state === 'patrol' && w.y > w.D.alt * 0.9); f++) await api._step(1);
      // Flat under it first: a ground-level round along a line under the drone does not touch it.
      const under = S().raycast(w.x - 10, w.z, 1, 0, 30, 0);
      await C('teleport', { x: w.x - 9, z: w.z - 9 }); await api._step(1);
      const s1 = F.standing[F.index.remnant];
      await shootAt(w, 1); const s2 = F.standing[F.index.remnant]; // one round: winged
      await shootAt(w, 30); for (let f = 0; f < 400 && w.state !== 'gone'; f++) await api._step(1);
      const s3 = F.standing[F.index.remnant];
      return !under && w.state === 'gone' && s2 <= s1 && s3 < s1 && s3 < s2 ? true : JSON.stringify({ under: !!under, state: w.state, standing: [r1(s1), r1(s2), r1(s3)] });
    } finally { F.set('remnant', st0); S().drones.forEach((d) => { if (d.state === 'gone') Object.assign(d, S().fresh(d.nest, d.kind)); }); off(); }
  });
}
