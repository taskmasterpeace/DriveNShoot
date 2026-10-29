// THE WORLD'S VOICE as COMMANDS rows and selftest checks (docs/design/WEB_WORLD_VOICE.md). buildCommands() in api.js
// spreads worldVoiceCommands into COMMANDS; runSelfTest() calls worldVoiceChecks (it turns the four systems on for its
// own stage, moves the world clock, then loads the battery's save).
import { validateWorldVoice, FAR, CAMPFIRE as CF, AMBIENT_LAYERS } from '../data/worldvoice.js';
import { STATIONS } from '../data/radio.js';
import { WEAPONS } from '../systems/combat.js';
import { CREW_ROWS } from '../data/crew.js';
import { waitHours } from './pulls-api.js';
import { bearingOf } from '../systems/farsound.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function worldVoiceCommands(api, need) {
  const g = api.g;
  return {
    farsound: {
      group: 'world', desc: 'THE FAR SOUND (WEB_WORLD_VOICE.md §3.1-3.2): ambience layers by biome and region (insects, frogs, wind, surf), and real events heard far off from their bearing after distance / 343 m/s. action: view (biome, the live mix, what is in the air, the last heard) | heard kind= n= (the ledger: kind, source, bearing, distance, delay vs expected) | biome x= z= (the biome name there and the mix it calls for, day and night) | layers | clear (empty the queue and the ledger) | on value=true|false.',
      args: { action: { type: 'string', default: 'view', enum: ['view', 'heard', 'biome', 'layers', 'clear', 'on'] }, kind: { type: 'string' }, n: { type: 'number', default: 12 }, x: { type: 'number' }, z: { type: 'number' }, value: { type: 'boolean', default: true } },
      run: async ({ action, kind, n, x, z, value }) => {
        const F = g.farsound; need(F, 'no far sound');
        if (action === 'heard') return { heard: F.heard(n, kind ?? null), pending: F.pending() };
        if (action === 'biome') { const b = F.biomeAt(x ?? g.player.x, z ?? g.player.z); return { ...b, day: F.target(b.name, b.region, 0, {}, false), night: F.target(b.name, b.region, 1, {}, false) }; }
        if (action === 'layers') return AMBIENT_LAYERS;
        if (action === 'clear') { F.clear(); return { ok: true }; }
        if (action === 'on') { F.on = value; return { on: F.on }; }
        return F.view();
      },
    },
    feed: {
      group: 'world', desc: 'THE RADIO AS A WORLD FEED (WEB_WORLD_VOICE.md §3.3): feed stations (data/radio.js kind feed: THE WIRE 1480 AM, TALLY NIGHTLY 1590 AM) read out what the nearest town actually holds, with its age, hedged or wrong when the copy is shaky. action: view | log | air station=wire|tally (one line now, if the mast has anything) | mast station= (the mast for where you stand and what it could read) | tune station= (tune the car radio to it) | news (read new chronicle rows into facts now; who saw each).',
      args: { action: { type: 'string', default: 'view', enum: ['view', 'log', 'air', 'mast', 'tune', 'news'] }, station: { type: 'string', default: 'wire' } },
      run: async ({ action, station }) => {
        const F = g.feed; need(F, 'no feed');
        const S = STATIONS.find((s) => s.id === station); need(S?.kind === 'feed' || action === 'view' || action === 'log' || action === 'news', `station= one of ${STATIONS.filter((s) => s.kind === 'feed').map((s) => s.id).join(', ')}`);
        if (action === 'log') return { log: F.log };
        if (action === 'news') { const f = F.readChronicle(); return { made: f.map((x) => ({ id: x.id, text: x.text })), stats: F.stats }; }
        if (action === 'tune') { g.radio.tune(STATIONS.indexOf(S)); return g.radio.view(); }
        if (action === 'mast') { const me = g.pulls.me(), m = F.mastFor(S, me.x, me.z); return { mast: m ? { id: m.id, name: m.name, d: Math.round(Math.hypot(m.x - me.x, m.z - me.z)) } : null, could: m ? F.candidates(S, m).map((c) => ({ id: c.id, what: c.what, text: c.text, conf: c.conf, heard: r1(c.heard) })) : [] }; }
        if (action === 'air') { const row = F.air(S, { force: true }); return row ?? { aired: null, why: 'the mast holds nothing new of the kinds this station reads' }; }
        return F.view();
      },
    },
    marks: {
      group: 'world', desc: 'READABLE LEFTOVERS (WEB_WORLD_VOICE.md §3.4): raiders\' tags, tally marks, warnings, DON\'T GO <dir>, words on graves, cold fire rings, each from a real chronicle row, grave or held fact. action: list kind= place= | near (what is drawn round you) | survey (look now) | view id=.',
      args: { action: { type: 'string', default: 'list', enum: ['list', 'near', 'survey', 'view'] }, kind: { type: 'string' }, place: { type: 'string' }, id: { type: 'string' } },
      run: async ({ action, kind, place, id }) => {
        const M = g.marks; need(M, 'no marks');
        if (action === 'survey') { M.readChronicle(); M.survey(); M.draw(); return { made: M.list.length, near: M.near.length, stats: M.stats }; }
        if (action === 'near') { M.draw(); return { near: M.near.map((m) => M.view(m)), drawn: M.mesh?.count ?? 0, posts: M.posts?.count ?? 0 }; }
        if (action === 'view') { const m = M.list.find((x) => x.id === id); need(m, `no mark ${id}`); return M.view(m); }
        return { marks: M.find({ kind, place }).map((m) => M.view(m)), stats: M.stats };
      },
    },
    campfire: {
      group: 'world', desc: 'THE CAMPFIRE (WEB_WORLD_VOICE.md §3.5): stop at night out of the car with your crew near and nothing hunting you, and after a few still seconds a fire is made; the crew talk from your stats, the land and real recent events, the clock passes, rest and morale. action: view (burning or why not, the lines so far) | light (now, if the rules allow) | out | line (one exchange now) | lines (what it could say now, and from what).',
      args: { action: { type: 'string', default: 'view', enum: ['view', 'light', 'out', 'line', 'lines'] } },
      run: async ({ action }) => {
        const F = g.campfire; need(F, 'no campfire');
        if (action === 'light') { const r = F.light(); need(r.ok, r.why); return r; }
        if (action === 'out') return F.out('put out') ?? { why: 'no fire' };
        if (action === 'line') { need(F.fire, 'no fire burning'); return F.exchange() ?? { why: 'nothing to say' }; }
        if (action === 'lines') return { lines: F.candidates().map((c) => ({ id: c.row.id, text: c.text, ref: c.ref, w: c.w })) };
        return F.view();
      },
    },
  };
}

export async function worldVoiceChecks(api, check, C) {
  const g = api.g, p = g.player;
  const sv = (await C('save')).save;
  const was = { stories: g.stories?.enabled, zombies: g.zombies.enabled, raiders: g.raiderTimer, convoyNext: g.convoy.next, director: g.society.director.paused, pulls: g.pulls.enabled, time: g.sky.time, wilds: g.wilds?.enabled };
  const on = { far: g.farsound.on, feed: g.feed.on, marks: g.marks.on, fire: g.campfire.on };
  if (g.stories) { g.stories.enabled = false; g.stories.sleep?.(); } // site stories hold still: these checks write their rows by hand
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.convoy.despawn?.(); g.convoy.next = 1e9; g.society.director.paused = true; g.pulls.enabled = true; if (g.wilds) g.wilds.enabled = false;
  g.farsound.on = true; g.feed.on = true; g.marks.on = true; g.campfire.on = false;
  const out = async () => { if (p.inVehicle) g.exitVehicle(true); if (!p.alive) { g.respawnT = 0; await C('step', { seconds: 0.3 }); } };
  const stand = async (x, z) => { await out(); await C('teleport', { x, z }); g.camLook.x = p.x; g.camLook.z = p.z; await C('step', { seconds: 0.2 }); };
  const made = [];
  const nodes = () => g.pulls.nodes();
  // Open desert far from any town and from the island (the dogs and engines of a place stay out of earshot).
  const lonely = () => { for (let k = 0; k < 40; k++) { const x = 6000 + k * 1700, z = 5200 - k * 300; if (nodes().every((n) => Math.hypot(n.x - x, n.z - z) > 4200) && (g.citygen?.plan ?? []).every((r) => Math.hypot(r.x - x, r.z - z) > 3200)) return { x, z }; } return { x: 18000, z: 9000 }; };
  try {
    await check('world voice: the rows validate - every layer, biome mix, far kind, feed line, mark kind, tag colour and campfire line; a broken row is caught', async () => {
      const a = validateWorldVoice();
      const bad = validateWorldVoice({ AMBIENT_LAYERS: { x: { src: 'banjo', gain: 9 } }, BIOME_AMBIENCE: { desert: { day: { ghosts: 1 } } }, FAR: { c: 900, kinds: { shot: { range: 10, near: 20 } }, verbs: { raid: 'nope' } }, FEED: { lines: {}, shaky: 0.2, errorAt: 0.5 }, NEWS: { verbs: { kill: 'a thing' } }, MARK_KINDS: { tag: { on: ['sky'], w: 0, h: 1 } }, TAGS: { x: { text: 'X', word: 'Y', color: '#9a3fd0' } }, CAMP_LINES: [{ id: 'q', when: 'mood', w: 1, text: ['{spooky}'] }], CAMPFIRE: { leaveR: 1, sitR: 2, glow: { color: '#a040e0' } } });
      return a.ok && !bad.ok && bad.errors.length >= 10 ? true : JSON.stringify({ good: a.errors, bad: bad.errors.length });
    });

    await check('world voice: biome ambience switches at a biome border - two spots 200 m apart, two biome names, two different mixes, one border heard', async () => {
      const F = g.farsound, W = g.streamer.W;
      let A = null, B = null;
      for (let i = 0; i < 400 && !A; i++) {
        const x = -9000 + (i % 20) * 900, z = -6000 + Math.floor(i / 20) * 600;
        const a = F.biomeAt(x, z), b = F.biomeAt(x + 200, z);
        if (a.name !== b.name && W.biomeAt(x, z) && (Math.abs(x) > 600 || Math.abs(z) > 600)) { A = { x, z, ...a }; B = { x: x + 200, z, ...b }; }
      }
      if (!A) return 'no border found in the sweep';
      g.sky.time = 14;
      await stand(A.x, A.z); F.mixT = 0; await C('step', { seconds: 1.2 });
      const b0 = F.biome, mix0 = { ...F.mix }, borders0 = F.borders;
      await stand(B.x, B.z); F.mixT = 0; await C('step', { seconds: 1.2 });
      const b1 = F.biome, mix1 = { ...F.mix };
      const differs = Object.keys(mix0).some((k) => Math.abs(mix0[k] - mix1[k]) > 0.05);
      // and night is its own mix (the crickets come up)
      g.sky.time = 23; F.mixT = 0; await C('step', { seconds: 1.2 }); const night = { ...F.mix }; g.sky.time = 14;
      const nightDiffers = Object.keys(night).some((k) => Math.abs(night[k] - mix1[k]) > 0.05);
      return b0 === A.name && b1 === B.name && b0 !== b1 && differs && F.borders > borders0 && nightDiffers ? true : JSON.stringify({ A: A.name, B: B.name, b0, b1, mix0, mix1, night, borders: [borders0, F.borders] });
    });

    await check('world voice: a distant gunshot is heard only if a shot was really fired - silence when nobody shoots, then a real round 1.2 km north-east lands after d/343 s from its bearing; one at 300 m is left to the near sound', async () => {
      const F = g.farsound, L = lonely();
      await stand(L.x, L.z); F.clear(); F.chronSeq = g.society.chronicle.seq;
      await C('step', { seconds: 6 });
      const quiet = F.heard(40).filter((e) => e.kind === 'shot' || e.kind === 'volley');
      if (quiet.length) return `heard shots nobody fired: ${JSON.stringify(quiet)}`;
      const dx = 850, dz = -850, c = g.spawnRaider(p.x + dx, p.z + dz, Math.random, 'rifle'); if (!c) return 'no raider';
      made.push(c);
      const w = WEAPONS.rifle, ang = Math.atan2(-dx, -dz); // aimed away from you
      const fired = g.combat.fire(c, 'rifle', ang, w);
      const t0 = g.time, d = Math.hypot(dx, dz), expect = d / FAR.c;
      if (!fired) return 'the round was not fired';
      const pend = F.pending().filter((s) => s.kind === 'shot');
      if (pend.length !== 1) return `pending ${JSON.stringify(F.pending())}`;
      await C('step', { seconds: expect - 0.6 });
      const early = F.heard(40, 'shot').length;
      await C('step', { seconds: 1.2 });
      const e = F.heard(40, 'shot')[0];
      if (!e || early) return JSON.stringify({ early, e, expect });
      const b = bearingOf(dx, dz);
      // a near round: the ordinary sound plays it at once, the far layer stays out of it
      const c2 = g.spawnRaider(p.x + 300, p.z, Math.random, 'rifle'); if (c2) { made.push(c2); g.combat.fire(c2, 'rifle', 0, w); }
      const nearPend = F.pending().filter((s) => s.kind === 'shot').length;
      const ok = Math.abs(e.delay - expect) < 0.12 && e.dir === 'NE' && Math.abs(e.deg - b.deg) <= 1 && e.src === 'shot' && e.id === String(c.id) && Math.abs(e.d - d) < 3 && nearPend === 0;
      return ok ? true : JSON.stringify({ e, expect: r1(expect), t0, nearPend, b });
    });

    await check('world voice: an off-screen fight is heard as a volley only from a real chronicle row (the sim\'s skirmish), from where it was', async () => {
      const F = g.farsound, L = lonely();
      await stand(L.x, L.z); F.clear(); F.chronSeq = g.society.chronicle.seq;
      const x = p.x - 1600, z = p.z + 400;
      const row = g.society.chronicle.add({ t: +g.time.toFixed(2), day: g.society.day, hr: g.sky.time, a: 'dustwolves', af: 'dustwolves', v: 'skirmish', of: 'remnant', p: '', x, z, m: 3, src: 'sim' });
      F.scanT = 0; await C('step', { seconds: 0.2 });
      const pend = F.pending().find((s) => s.kind === 'volley');
      await C('step', { seconds: 1700 / FAR.c + 0.8 });
      const e = F.heard(20, 'volley')[0];
      return pend && e && e.id === `chron:${row.seq}` && (e.dir === 'W' || e.dir === 'SW' || e.dir === 'NW') && e.n >= FAR.kinds.volley.shots[0] ? true : JSON.stringify({ pend, e });
    });

    await check('world voice: the radio never reports an event before a witness - an unseen fight is never news; a fight a far town saw is read on the near town\'s set only after the grapevine brings it, with its age', async () => {
      const F = g.feed, K = g.pulls.k, S = STATIONS.find((s) => s.id === 'wire');
      // two neighbouring towns 5-13 km apart
      let T1 = null, T2 = null;
      for (const a of nodes()) { for (const b of g.pulls.neighbours(a)) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (d > 5000 && d < 13000 && a.id !== 'rust_haven') { T1 = a; T2 = b; break; } } if (T1) break; }
      if (!T1) return 'no pair of neighbouring towns';
      await stand(T1.x + 40, T1.z + 40);
      // a radio you can hear, tuned to the feed
      g.inventory.add(g.inventory.carried, 'radio_portable', 1); g.inventory.changed?.();
      g.radio.tune(STATIONS.indexOf(S));
      F.readChronicle();
      // 1. a fight nobody saw: open country, no town inside witnessR, no witnesses
      const L = lonely();
      const r0 = g.society.chronicle.add({ t: g.time, day: g.society.day, hr: g.sky.time, a: 'dustwolves', af: 'dustwolves', v: 'skirmish', of: 'remnant', p: '', x: L.x, z: L.z, m: 2, ws: 0, src: 'sim' });
      F.readChronicle();
      const unseen = K.fact(`news:${r0.seq}`);
      // 2. a fight T2 saw (beside its walls)
      const r1_ = g.society.chronicle.add({ t: g.time, day: g.society.day, hr: g.sky.time, a: 'dustwolves', af: 'dustwolves', v: 'skirmish', of: 'remnant', on: T2.name, p: T2.id, x: T2.x + 120, z: T2.z - 80, m: 4, ws: 0, src: 'sim' });
      F.readChronicle();
      const fid = `news:${r1_.seq}`, f = K.fact(fid);
      const t2 = K.holds(`town:${T2.id}`, fid), t1Before = K.holds(`town:${T1.id}`, fid);
      // T1's mast reads now: it must not read this one
      for (const c of K.holders.get(`town:${T1.id}`)?.facts ?? []) F.aired.set(`${T1.id}|${c.id}`, F.hours()); // what it already had is read already
      const before = F.air(S, { force: true });
      const youBefore = K.holds('player', fid);
      // the grapevine: the next truck leaves on the hour and drives distance / speed
      const d = Math.hypot(T1.x - T2.x, T1.z - T2.z);
      // the truck leaves on T2's next hour; read when it lands from the grapevine's own queue
      let truck = null;
      for (let k = 0; k < 12 && !truck; k++) { await waitHours(g, 0.25, 0.25); truck = K.inFlight(fid).find((w) => w.to === `town:${T1.id}`) ?? null; }
      if (!truck) return `no truck left ${T2.name} for ${T1.name}`;
      if (Math.abs(truck.at - truck.sent - d / 450) > 0.15) return `truck time ${JSON.stringify(truck)} vs ${r1(d / 450)} h`;
      await waitHours(g, Math.max(0.05, truck.at - g.pulls.hours() - 0.3), 0.25);
      // read the mast out (everything it holds now): this fight is not among it before the truck lands
      const readOut = () => { const ids = []; for (let k = 0; k < 40; k++) { const r = F.air(S, { force: true }); if (!r) break; ids.push(r.fid); if (r.fid === fid) break; } return ids; };
      const midHeld = K.holds(`town:${T1.id}`, fid), midIds = readOut(), mid = { fid: midIds.includes(fid) ? fid : null };
      await waitHours(g, 0.8, 0.25);
      const t1After = K.holds(`town:${T1.id}`, fid), copyT1 = K.copyOf(`town:${T1.id}`, fid);
      const afterIds = readOut(), after = F.log.find((row) => row.fid === fid && row.mast === T1.id) ?? null, you = K.copyOf('player', fid);
      // every line ever aired came from a copy the mast held, heard no earlier than the thing happened
      const lawful = F.log.every((row) => row.mastHeard >= row.fact.when - 0.01);
      const ok = !unseen && F.stats.unwitnessed > 0 && t2 && !t1Before && before?.fid !== fid && !youBefore && !midHeld && mid?.fid !== fid
        && t1After && copyT1.source.channel === 'grapevine' && after?.fid === fid && after.mast === T1.id && after.ageH >= d / 450 && you?.source.channel === 'radio' && lawful;
      return ok ? true : JSON.stringify({ unseen: !!unseen, t2, t1Before, before: before?.fid, mid: mid?.fid, midHeld, t1After, ch: copyT1?.source?.channel, after: after && { fid: after.fid, mast: after.mast, age: after.ageH, text: after.text }, you: you?.source, lawful, need: r1(d / 450) });
    });

    await check('world voice: a raided site gets the raiders\' tag - a camp the sim says was taken, and a town raided, carry the raiders\' letters (in their colour, on its walls) with the chronicle row as the cause', async () => {
      const M = g.marks, Sim = g.society.sim;
      M.readChronicle();
      // the sim's own path: a take of a society place (its record writes the chronicle row)
      const camp = Object.keys(g.society.places).find((k) => k.startsWith('camp_'));
      const iw = Sim.F.ids.indexOf('remnant'), il = Sim.F.ids.indexOf('dustwolves');
      Sim.record('took', iw, il, camp, 8);
      const row = g.society.chronicle.last();
      M.readChronicle();
      const tags = M.find({ kind: 'tag', place: camp });
      const okCamp = tags.length >= 2 && tags.every((m) => m.by === 'remnant' && m.cause.seq === row.seq && m.lines[0] === 'FR');
      // a built town: raiders out of the Dustwolves hit it (the row site stories write), and its walls are painted
      const town = [...g.citygen.live.values()][0] ?? null;
      let okTown = true, wall = null;
      if (town) {
        const r = g.society.chronicle.add({ t: g.time, day: g.society.day, hr: g.sky.time, a: 'arc:t', af: 'drifters', v: 'raided', o: 'camp_0', on: town.rec.name, of: 'dustwolves', p: town.rec.id, x: town.rec.x, z: town.rec.z, m: 4, src: 'story' });
        M.readChronicle();
        const tt = M.find({ kind: 'tag', place: town.rec.id });
        wall = tt.find((m) => m.on === 'wall');
        okTown = tt.length >= 2 && tt.every((m) => m.by === 'dustwolves' && m.cause.seq === r.seq) && !!wall;
        await stand(town.rec.x, town.rec.z); M.draw();
        okTown &&= M.mesh.count >= 1 && M.near.some((m) => m.cause.seq === r.seq);
      }
      return okCamp && okTown ? true : JSON.stringify({ camp: tags.map((m) => M.view(m)), town: town?.rec.id ?? null, wall: wall && M.view(wall), drawn: M.mesh?.count });
    });

    await check('world voice: deaths leave tally marks - kill rows at a place are counted in strokes on its wall, one tally that grows', async () => {
      const M = g.marks, place = Object.keys(g.society.places).find((k) => k.startsWith('camp_'));
      const T0 = M.byKey.get(`tally|${place}`)?.n ?? 0;
      for (let i = 0; i < 3; i++) g.society.chronicle.add({ t: g.time, day: g.society.day, hr: g.sky.time, a: 'player', af: 'player', v: 'kill', on: `Dustwolf ${i}`, of: 'dustwolves', p: place, x: 0, z: 0, m: 2, src: 'world' });
      M.readChronicle();
      const T = M.byKey.get(`tally|${place}`);
      return T && T.n === T0 + 3 && T.cause.rows.length >= 3 && M.find({ kind: 'tally', place }).length === 1 ? true : JSON.stringify(T && M.view(T));
    });

    await check('world voice: "DON\'T GO <dir>" is painted only by a town that holds news of the fall, pointing at it', async () => {
      const M = g.marks, K = g.pulls.k;
      let A = null, B = null, Cn = null;
      for (const a of nodes()) { const near = nodes().filter((b) => b !== a && Math.hypot(a.x - b.x, a.z - b.z) < 12000); if (near.length >= 2) { A = a; B = near[0]; Cn = near[1]; break; } }
      if (!A) return 'no three towns';
      await stand(A.x + 30, A.z + 30);
      const r = g.society.chronicle.add({ t: g.time, day: g.society.day, hr: g.sky.time, a: 'dustwolves', af: 'dustwolves', v: 'took', of: 'drifters', on: B.name, p: B.id, x: B.x, z: B.z, m: 8, src: 'sim' });
      g.feed.readChronicle();
      const fid = `news:${r.seq}`, f = K.fact(fid);
      // B saw it. A has not heard: nothing on A's road.
      M.survey();
      const before = M.byKey.get(`dontgo|${A.id}|${B.id}`);
      // A hears it (a traveller tells it, face to face)
      K.holder(`town:${A.id}`); K.put(`town:${A.id}`, f, { channel: 'said', from: `town:${B.id}`, fromName: B.name }, 0.9, 1);
      M.survey();
      const m = M.byKey.get(`dontgo|${A.id}|${B.id}`), b = bearingOf(B.x - A.x, B.z - A.z);
      const cOk = !M.byKey.get(`dontgo|${Cn.id}|${B.id}`) || K.holds(`town:${Cn.id}`, fid);
      return !before && m && m.lines[0].includes({ N: 'NORTH', NE: 'NORTHEAST', E: 'EAST', SE: 'SOUTHEAST', S: 'SOUTH', SW: 'SOUTHWEST', W: 'WEST', NW: 'NORTHWEST' }[b.dir]) && m.cause.fact === fid && m.place === A.id && cOk ? true : JSON.stringify({ before: !!before, m: m && M.view(m), dir: b.dir, cOk });
    });

    await check('world voice: a campfire line references a real recent event - at night with a crew member, stopped, a fire is made; the first line names the raider you shot, with that chronicle row as its ref; the clock moves, rest and morale rise, and walking off leaves a ring of ash', async () => {
      const F = g.campfire, L = lonely();
      await stand(L.x, L.z);
      g.sky.time = 22.5; g.campfire.on = true;
      // a crew member
      const R = CREW_ROWS[0], cm = g.addChar({ x: p.x + 2, z: p.z + 1.5, faction: 'drifter', weapon: R.weapon, hp: R.hp, name: R.names[0], flag: R.flags[0], colors: g.crew.colors(R, 7) });
      if (!cm) return 'no crew body';
      const j = g.crew.joinChar(cm, 'hire', R.id); if (!j.ok) return `join: ${j.why}`;
      // the raider you shoot (a real round, a real kill: the deeds write the row)
      const c = g.spawnRaider(p.x, p.z + 7, Math.random, 'pistol'); if (!c) return 'no raider';
      c.hp = 1; c.target = null; c.state = 'idle';
      g.combat.fire(p, 'rifle', 0, WEAPONS.rifle);
      await C('step', { seconds: 0.3 });
      if (c.alive) return 'the raider still stands';
      const row = g.society.chronicle.query({ verb: 'kill', limit: 5 }).find((r) => r.a === 'player');
      if (!row) return 'no kill row';
      const rest0 = g.needs.rest, clock0 = g.pulls.hours();
      F.still = 0; F.lx = p.x; F.lz = p.z;
      await C('step', { seconds: CF.stillSecs + 1.2 });
      if (!F.fire) return `no fire: ${F.why()}`;
      await C('step', { seconds: 3 });
      const line = F.fire.log[0];
      if (!line) return 'no line yet';
      const ref = line.ref, real = ref?.type === 'chronicle' && g.society.chronicle.query({ limit: 200 }).some((r) => r.seq === ref.seq);
      const named = ref && (line.text.includes(ref.on) || line.text.includes(ref.place));
      const morale = g.deep?.morale?.some((m) => m.id === 'campfire');
      const moved = g.pulls.hours() - clock0 >= CF.hoursPerLine - 0.01, rested = g.needs.rest > rest0;
      const id = F.fire.id;
      await stand(p.x + CF.leaveR + 6, p.z); await C('step', { seconds: 0.4 });
      const ash = g.marks.find({ kind: 'ash' }).find((m) => m.cause.fire === id);
      g.crew.leave?.(g.crew.members.find((m) => m.c === cm), 'test');
      return real && ref.seq === row.seq && named && morale && moved && rested && !F.fire && ash ? true : JSON.stringify({ line, row: row.seq, real, named, morale, moved, rested, fire: !!F.fire, ash: !!ash });
    });

    await check('world voice: draws - marks and a burning fire stay under 150 draw calls; nothing drawn when nothing is near', async () => {
      const M = g.marks, L = lonely();
      await stand(L.x + 2400, L.z - 1800); M.draw();
      const empty = M.mesh.count === 0 && !M.mesh.visible && !M.posts.visible;
      g.render(0); const pf = await C('perf');
      return empty && pf.drawCalls < 150 ? true : JSON.stringify({ empty, count: M.mesh.count, draws: pf.drawCalls });
    });
  } finally {
    for (const c of made) if (c && g.chars.includes(c)) g.removeChar(c);
    g.campfire.out('test over');
    if (g.stories) g.stories.enabled = was.stories;
    g.zombies.enabled = was.zombies; g.raiderTimer = was.raiders; g.convoy.next = was.convoyNext; g.society.director.paused = was.director; g.pulls.enabled = was.pulls; if (g.wilds) g.wilds.enabled = was.wilds;
    g.farsound.on = on.far; g.feed.on = on.feed; g.marks.on = on.marks; g.campfire.on = on.fire;
    g.radio.tune(0);
    await out();
    await C('load', { save: sv });
    g.sky.time = was.time;
  }
}
