// Selftest checks for the dev tools (docs/design/WEB_OBSERVER.md §8): the observer's reads and feed, the recorder,
// replay (positions within tolerance, through the disk), heatmaps, and each agent multiplier. runSelfTest calls this
// before its perf and runtime-error checks, so anything here that throws or leaks shows up there too.

import { outfit } from '../systems/characters.js';
import { REC } from './recorder.js';

const r2 = (v) => Math.round(v * 100) / 100;
const STAGE = { x: 296, z: -104 }; // open sand in the Glass Flats between two roads, out of the town's sight

export async function devtoolsChecks(api, check, C) {
  const g = api.g;
  const DEV = !!import.meta.env?.DEV;
  const quiet = async (fn) => {
    const zOn = g.zombies.enabled, rt = g.raiderTimer, dir = g.society.director.paused;
    g.zombies.enabled = false; g.raiderTimer = 1e9; g.society.director.paused = true;
    for (const ev of [...g.society.director.active]) g.society.director.cancel(ev.id);
    if (g.player.inVehicle) g.exitVehicle(true);
    await C('teleport', STAGE);
    for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - STAGE.x, c.z - STAGE.z) < 120) g.removeChar(c);
    await C('setTime', { hour: 12 }); await C('setWeather', { key: 'CLEAR', instant: true });
    try { return await fn(); } finally { g.zombies.enabled = zOn; g.raiderTimer = rt; g.society.director.paused = dir; }
  };
  const dummy = (dx, dz, extra = {}) => {
    const p = g.player, c = g.addChar({ x: p.x + dx, z: p.z + dz, faction: 'drifter', colors: outfit('drifter'), name: 'Observer Dummy', flag: 'MX', hp: 60 });
    c.home = { x: c.x, z: c.z }; c.wx = c.x; c.wz = c.z; c.hold = true; Object.assign(c, extra);
    g.society.factions.assign(c);
    return c;
  };

  await check('observer: observe lists the player card, every character with its faction, real flag code and AI state, every vehicle, perf, the doors in a box, a selected person\'s card', async () => quiet(async () => {
    const d = dummy(6, 0);
    try {
      const shop = g.world.spawns.shops.find((b) => b.shopName);
      const x = (shop.minX + shop.maxX) / 2, z = (shop.minZ + shop.maxZ) / 2;
      const r = await C('observe', { since: g.eventSeq - 5, x0: x - 60, z0: z - 60, x1: x + 60, z1: z + 60, sel: d.id, factions: true });
      const others = g.chars.length - 1;
      const row = r.chars?.find((c) => c[0] === d.id);
      const flagsOk = r.chars?.every((c) => c[5] === '' || /^[A-Z]{2}$/.test(c[5]));
      const card = r.detail?.[d.id];
      const ok = r.ok && r.player?.id === g.player.id && r.player.pack?.items?.length > 0 && r.chars.length === others && row && row[4] === 'drifters' && row[5] === 'MX' && row[6] === 'holding'
        && r.vehicles.length === g.vehicles.length && r.perf?.drawCalls >= 0 && Array.isArray(r.doors) && r.doors.length > 0 && card?.name === 'Observer Dummy' && card.flag === 'MX' && card.faction === 'drifters'
        && r.factions?.rusthaven?.color && flagsOk && Array.isArray(r.events);
      return ok ? true : JSON.stringify({ ok: r.ok, chars: r.chars?.length, others, row, doors: r.doors?.length, card: card && { name: card.name, flag: card.flag, faction: card.faction }, flagsOk, f: !!r.factions }).slice(0, 400);
    } finally { g.removeChar(d); }
  }));

  await check('observer: person shows a fighter\'s target and weapon, a named person\'s memory of you, and the player\'s vitals and pack', async () => {
    const sher = g.chars.find((c) => c.npc?.id === 'okonkwo');
    const a = await C('person', { id: 'okonkwo' }), me = await C('person', { id: 'player' });
    const bad = await C('person', { id: 'nobody-at-all' });
    const ok = a.ok && a.named && a.memory && Array.isArray(a.memory.memories) && a.flag === sher.flag && a.portrait?.seed !== undefined && me.ok && me.player && me.needs?.water !== undefined && Array.isArray(me.pack?.items) && !bad.ok;
    return ok ? true : JSON.stringify({ a: a.ok && { named: a.named, mem: !!a.memory, flag: a.flag }, me: me.ok && { p: me.player, needs: !!me.needs }, bad: bad.ok }).slice(0, 300);
  });

  await check('observer: mapBase gives the island map and I-10; mapTiles gives a laid-out chunk\'s tile and names the missing ones', async () => {
    const b = await C('mapBase');
    const key = [...g.streamer.layouts.keys()][0];
    const t = await C('mapTiles', { keys: `${key};999,999` });
    const ok = b.ok && b.island.image.startsWith('data:image/png') && b.i10.length > 100 && b.towns.length > 3 && t.ok && t.tiles[key]?.startsWith('data:image/png') && t.missing.includes('999,999');
    return ok ? true : JSON.stringify({ img: b.island?.image?.slice(0, 20), i10: b.i10?.length, towns: b.towns?.length, key, tile: !!t.tiles?.[key], missing: t.missing }).slice(0, 300);
  });

  await check('observer: while an observer watches, this tab pushes frames to the dev server feed (beside the command queue) with the events', async () => {
    if (!DEV) return true;
    const obs = `selftest${Math.random().toString(36).slice(2, 6)}`;
    const get = () => fetch(`/agent/feed?tab=${api.tabId}&obs=${obs}&since=0&sel=player`, { cache: 'no-store' }).then((r) => r.json());
    await get(); // now somebody is watching
    g.emit('observerProbe', { x: g.player.x, z: g.player.z });
    let f = null;
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 150)); f = await get(); if (f.snap && f.ageMs < 1000 && f.events.some((e) => e.type === 'observerProbe')) break; }
    const ok = f?.ok && f.snap?.boot === api.bootId && f.ageMs < 1000 && f.events.some((e) => e.type === 'observerProbe') && f.snap.chars.length > 0 && f.factions?.rusthaven;
    return ok ? true : JSON.stringify({ ok: f?.ok, boot: f?.snap?.boot, mine: api.bootId, age: f?.ageMs, probe: f?.events?.some((e) => e.type === 'observerProbe'), tab: api.tabId }).slice(0, 300);
  });

  await check('heal: a hurt person back to full and their bleeding stopped; the dead refused', async () => quiet(async () => {
    const d = dummy(5, 3);
    try {
      d.hp = 20; d.bleed = 0.6;
      const r = await C('heal', { id: d.id });
      const after = { hp: d.hp, bleed: d.bleed };
      await C('kill', { id: d.id });
      const dead = await C('heal', { id: d.id });
      return r.ok && after.hp === d.maxHp && after.bleed === 0 && !dead.ok ? true : JSON.stringify({ r, after, dead: dead.ok });
    } finally { if (g.chars.includes(d)) g.removeChar(d); }
  }));

  // The walk the recorder and replay checks share: a moveTo on held paths, stepped, the truth taken every 0.37 s.
  let walk = null;
  const recordWalk = async () => {
    if (walk) return walk;
    await C('record', { on: true, reset: true, rate: REC.rate });
    const t0 = g.time, truth = [];
    g.autopilot = null;
    await C('moveTo', { x: STAGE.x + 30, z: STAGE.z + 4, maxSeconds: 30 }); // an agent's walk: flags.auto, the 'arrived' event
    // Then a person's walk: A held down on the real input path (west, along open sand), the truth taken every 22 frames (0.367 s, off the
    // 0.25 s sample grid).
    const I = g.input;
    I.down.add('KeyA'); I.pressed.add('KeyA');
    try {
      for (let i = 0; i < 24; i++) { await api._step(22); truth.push({ t: g.time, x: g.player.x, z: g.player.z }); }
    } finally { I.down.delete('KeyA'); }
    await C('step', { seconds: 0.5 });
    walk = { t0, t1: g.time, truth, walked: Math.hypot(truth[23].x - truth[0].x, truth[23].z - truth[0].z) };
    return walk;
  };

  await check('recorder: a walk records a session on the game clock: ~4 samples a game second, positions that follow the player, keys and flags, the events (arrived)', async () => quiet(async () => {
    const w = await recordWalk();
    const v = (await C('record')), s = (await C('session', { full: true })).session;
    const span = w.t1 - w.t0, want = span * REC.rate;
    const lastX = s.cols.x[s.cols.x.length - 1];
    const arrived = s.events.some((e) => e.y === 'arrived');
    const autoBit = s.cols.flags.some((f) => f & s.flagBits.auto);
    const dHeld = s.cols.keys.filter((k) => k & s.keyBits.KeyA).length; // ~24 x 0.367 s x 4 Hz = ~35 samples with A down
    const ok = v.ok && v.on && Math.abs(s.n - want) <= 3 && Math.abs(lastX - g.player.x) < 1 && arrived && autoBit && dHeld >= 25 && w.walked > 10 && s.cols.keys.length === s.n && s.v === 1 && s.kind === 'dsoa-session';
    return ok ? true : JSON.stringify({ n: s.n, want: r2(want), lastX, px: r2(g.player.x), arrived, autoBit, dHeld, walked: r2(w.walked), on: v.on }).slice(0, 300);
  }));

  await check('replay: a session saved to disk and read back puts the player within 0.6 m of where they really were at 24 moments off the sample grid; goto stands you there', async () => quiet(async () => {
    const w = await recordWalk();
    let id = 'live';
    if (DEV) {
      const r = await C('record', { save: true });
      if (!r.ok || !r.savedNow?.path) return `save failed: ${JSON.stringify(r).slice(0, 200)}`;
      id = r.savedNow.id;
      api._sessions.delete(id); // read it back from the file, not the cache
    }
    let worst = 0;
    for (const p of w.truth) {
      const r = await C('replay', { id, at: p.t });
      if (!r.ok) return `replay failed: ${r.error}`;
      worst = Math.max(worst, Math.hypot(r.at.x - p.x, r.at.z - p.z));
    }
    const mid = w.truth[10];
    await C('teleport', { x: STAGE.x - 40, z: STAGE.z });
    const gt = await C('replay', { id, at: mid.t, goto: true });
    const there = Math.hypot(g.player.x - mid.x, g.player.z - mid.z);
    const list = DEV ? await C('session', { list: true }) : { ok: true, sessions: [{ id }] };
    const listed = list.sessions?.some((s) => s.id === id);
    return worst < 0.6 && gt.ok && there < 0.8 && listed ? true : JSON.stringify({ worst: r2(worst), there: r2(there), listed, id });
  }));

  await check('replay: heatmaps - went covers the walk, fought marks where you shot and the kill, died marks where you fell (and nowhere else)', async () => quiet(async () => {
    await C('record', { reset: true });
    await C('step', { seconds: 1 });
    const d = dummy(8, 0);
    await C('give', { pistol: 24 });
    await C('equip', { weapon: 'pistol' });
    await C('fire', { id: d.id, shots: 6 });
    await C('step', { seconds: 1 });
    const fellAt = { x: g.player.x, z: g.player.z };
    const god = g.godMode; g.godMode = false;
    await C('kill', { id: 'player' });
    await C('step', { seconds: 1 });
    g.godMode = god;
    const went = await C('replay', { heat: 'went' }), fought = await C('replay', { heat: 'fought' }), died = await C('replay', { heat: 'died', cell: 8 });
    // On your feet again (respawn) before anything else runs.
    for (let i = 0; i < 20 && !g.player.alive; i++) await C('step', { seconds: 1 });
    if (g.chars.includes(d)) g.removeChar(d);
    const top = died.heat?.top?.[0];
    const ok = went.heat?.cells > 0 && fought.heat?.total > 0 && !d.alive && died.heat?.total === 1 && top && Math.hypot(top.x - fellAt.x, top.z - fellAt.z) < 8 && g.player.alive;
    return ok ? true : JSON.stringify({ went: went.heat?.cells, fought: fought.heat?.total, dummyAlive: d.alive, died: died.heat, fellAt, alive: g.player.alive }).slice(0, 400);
  }));

  await check('recorder: a frame that is not a sample costs nothing measurable (a time check), a sample frame well under a microsecond-scale budget', async () => {
    const R = g.recorder, was = { on: R.on, next: R.nextT };
    R.on = true; R.nextT = g.time + 1e9;
    const N = 200000; let t = performance.now();
    for (let i = 0; i < N; i++) R.tick();
    const idle = ((performance.now() - t) / N) * 1e6; // ns per call
    R.nextT = g.time;
    t = performance.now();
    for (let i = 0; i < 2000; i++) { R.nextT = g.time; R.tick(); }
    const sample = ((performance.now() - t) / 2000) * 1e3; // us per sample
    R.on = was.on; R.nextT = was.next; R.reset(false);
    return idle < 100 && sample < 50 ? true : `idle ${r2(idle)} ns/frame, sample ${r2(sample)} us`;
  });

  await check('look: one call returns the screenshot and who is in it (pixel positions inside the image, faction, flag, state, hostile), vehicles, doors, a caption', async () => quiet(async () => {
    const d = dummy(4, 2), v = await C('spawnVehicle', { type: 'buggy', x: g.player.x - 6, z: g.player.z + 2 });
    try {
      const r = await C('look', { zoom: 30, width: 640, height: 360 });
      const me = r.people?.find((q) => q.id === d.id), car = r.vehicles?.find((q) => q.id === v.id);
      const inside = me && me.px[0] >= 0 && me.px[0] <= 640 && me.px[1] >= 0 && me.px[1] <= 360;
      const noImg = await C('look', { image: false });
      const ok = r.ok && r.image?.startsWith('data:image/jpeg') && inside && me.flag === 'MX' && me.faction === 'drifters' && car && /Observer Dummy|Drifters/.test(r.caption) && r.footprint?.every(Boolean) && noImg.ok && !noImg.image && noImg.people?.some((q) => q.id === d.id);
      return ok ? true : JSON.stringify({ img: !!r.image, me, car: !!car, caption: r.caption, fp: r.footprint, noImg: noImg.ok && noImg.people?.length }).slice(0, 400);
    } finally { g.removeChar(d); const vv = api.findVeh(v.id); if (vv) g.vehiclesSys.remove?.(vv); }
  }));

  await check('snap/diff: a killing, a spawn, a move and a cash change between two snaps all show up, with the events between counted', async () => quiet(async () => {
    const a = dummy(6, 0), b = dummy(-6, 0);
    try {
      await C('snap', { name: 'st-a' });
      await C('kill', { id: a.id });
      const c = dummy(0, 7);
      b.hold = false; b.x += 5; // moved 5 m
      await C('give', { cash: 13 });
      await C('step', { seconds: 0.3 });
      const r = await C('diff', { from: 'st-a' });
      g.removeChar(c);
      const ok = r.ok && r.people.died.some((q) => q.id === a.id) && r.people.spawned.some((q) => q.id === c.id) && r.people.moved.some((q) => q.id === b.id) && r.player.cash?.[1] - r.player.cash?.[0] === 13 && r.events.byType.kill >= 1 && typeof r.summary === 'string';
      const missing = await C('diff', { from: 'never-taken' });
      return ok && !missing.ok ? true : JSON.stringify({ died: r.people?.died, spawned: r.people?.spawned?.length, moved: r.people?.moved?.map((q) => q.id), cash: r.player?.cash, kills: r.events?.byType?.kill }).slice(0, 400);
    } finally { for (const c of [a, b]) if (g.chars.includes(c)) g.removeChar(c); }
  }));

  await check('watch: step mode returns the kill that matches type and id (not the noise around it), and its cursor picks up where it stopped', async () => quiet(async () => {
    const d = dummy(7, 0), e = dummy(-7, 0);
    try {
      g.emit('bark', { id: e.id, text: 'noise' });
      // Kill d two game seconds in, from inside the stepped sim, so watch has to wait for it.
      const due = g.time + 2;
      const hook = () => { if (g.time >= due && d.alive) g.combat.damage(d, 9999, null, 1, 0, 'bullet'); };
      const R = g.recorder, orig = R.tick;
      R.tick = function () { hook(); return orig.call(this); }; // the frame's own hook point: the kill lands mid-step
      let r;
      try { r = await C('watch', { type: 'kill', id: d.id, seconds: 6 }); } finally { delete R.tick; }
      const late = await C('watch', { type: 'kill', since: r.cursor, seconds: 0.5 });
      const ok = r.ok && r.done && r.matches.length === 1 && r.matches[0].victim === d.id && r.gameSeconds >= 1.8 && r.gameSeconds < 4 && late.ok && !late.done && late.matched === 0;
      return ok ? true : JSON.stringify({ r: { done: r.done, n: r.matches?.length, v: r.matches?.[0]?.victim, gs: r.gameSeconds }, late: { done: late.done, n: late.matched } });
    } finally { for (const c of [d, e]) if (g.chars.includes(c)) g.removeChar(c); }
  }));

  await C('record', { on: true, reset: true, rate: REC.rate }); // the battery's own session ends here; a fresh one from now
}
