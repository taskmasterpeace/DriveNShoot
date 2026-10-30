// The selftest's Florida checks (docs/design/WEB_FLORIDA.md §8): the start region streams on the same chunk system as
// I-10, Meridian stands at I-95 exit 9 with its people, a new game starts there, its water is real, its alligators bite
// and die, its infected come at the region's density, and Phoenix is untouched byte for byte. Run inside runSelfTest
// (agent/api.js) with its check() and command caller; every check returns true or a JSON diagnostic.
import GOLDEN from '../data/golden.json';
import { START } from '../data/regions.js';
import { FLAGS } from '../ui/portrait.js';
import { waterDepth } from '../world/water.js';
import { regionWater } from '../world/regions.js';

export async function floridaChecks({ g, check, C }) {
  const SW = g.streamer, WI = SW.W, FL = WI.regions.florida, Rg = g.regions;
  const home = async () => {
    g.driveOverride = null;
    const v = g.player.inVehicle;
    if (v) { g.exitVehicle(true); g.vehiclesSys.remove(v); }
    await C('teleport', { x: 0, z: -40 });
  };
  const I95 = WI.corridors.find((c) => c.id === 'I-95'), I75 = WI.corridors.find((c) => c.id === 'I-75');
  const H = WI.holdouts.find((h) => h.id === 'meridian');

  await check('florida: P1 is untouched by the region (twelve pinned P1 chunk hashes, the island golden) and the region builds where its rows put it', async () => {
    const { layoutChunk, makeScratch } = await import('../world/chunkgen.js');
    const sc = makeScratch(), bad = [];
    // real terrain is the default (WEB_SITES_TERRAIN): the same twelve chunks have their own golden on the land
    const P1G = (WI.terrain ? GOLDEN.p1ChunksReal : GOLDEN.p1Chunks) ?? {};
    for (const [key, want] of Object.entries(P1G)) {
      const [cx, cz] = key.split(',').map(Number);
      const tiles = { foot: { a: new Uint8Array(65536), any: false }, car: { a: new Uint8Array(16384), any: false } };
      const gen = layoutChunk(WI, cx, cz, tiles, null, sc); let r; do r = gen.next(); while (!r.done);
      if (r.value.hash !== want) bad.push(`${key}: ${r.value.hash} != ${want}`);
    }
    const w = await C('world');
    const ok = !bad.length && Object.keys(P1G).length >= 12 && w.islandMatches !== false && SW.islandHash === GOLDEN.islandHash && FL && I95 && I75 && H;
    return ok ? true : JSON.stringify({ bad, island: SW.islandHash, golden: GOLDEN.islandHash, regions: Object.keys(WI.regions), corridors: WI.corridors.map((c) => c.id) });
  });

  await check('florida: I-95 and I-75 are interstates on the chunk system (exits by milepost, Meridian at I-95 exit 9, Alligator Alley on I-75), a Florida chunk is a pure function (sync and sliced the same hash, its edges matching its neighbours\')', async () => {
    const X9 = I95.exits.find((X) => X.number === 9), AA = I75.exits.find((X) => X.name === 'ALLIGATOR ALLEY');
    const loc = WI.locate('meridian');
    // A Florida chunk on the interstate by Meridian's exit, built twice (sync and sliced) and seam-checked against its east neighbour.
    const f = I95.at(X9.s + 900), cx = Math.floor(f.x / 256), cz = Math.floor(f.z / 256);
    await C('teleport', { x: f.x + 40, z: f.z });
    const a = await C('chunk', { x: f.x, z: f.z, fresh: true, mode: 'sliced' }), b = await C('chunk', { x: (cx + 1) * 256 + 5, z: f.z, build: true });
    const seam = a.edges?.e === b.edges?.w;
    const ok = X9 && X9.holdout === 'meridian' && X9.name === 'MERIDIAN' && Math.abs(X9.s / 1609.344 - 9) < 0.05 && AA && loc?.kind === 'holdout' && Math.hypot(loc.x - H.cx, loc.z - H.cz) < 1
      && a.region === 'florida' && a.fresh?.matches === true && seam && I95.L > 50000 && I75.L > 40000;
    return ok ? true : JSON.stringify({ X9: X9 && { n: X9.number, s: X9.s, holdout: X9.holdout }, AA: !!AA, loc, region: a.region, fresh: a.fresh, seam, edges: [a.edges?.e, b.edges?.w], L: [I95.L, I75.L] });
  });

  await check('florida: 40 s flat out north on I-95 past Meridian (sliced streaming, the fastest ground vehicle) streams with no cross or promote stalls, under 150 draw calls, on the road', async () => {
    await home();
    const s0 = 7.9 * 1609.344, q = SW.lanePoint(s0, 1, 0, I95), fr = I95.at(s0);
    await C('teleport', { x: q.x, z: q.z });
    const r = await C('spawnVehicle', { type: 'bike', x: q.x, z: q.z, heading: Math.atan2(fr.tx, fr.tz) });
    await C('enterVehicle', { id: r.id, force: true });
    await C('teleport', { x: q.x, z: q.z });
    const v = g.player.inVehicle, x0 = v.x, z0 = v.z, st0 = { ...SW.byCause };
    let off = 0, n = 0;
    const run = await SW.runFrames(40, (i) => { const ap = SW.autopilot(v, 1, 0, Infinity, I95); g.driveOverride = { throttle: 1, steer: ap.steer }; if (i % 60 === 0) { n++; if (ap.d > I95.section(ap.s).out + 2) off++; } }, { renderEvery: 3 });
    const dist = Math.hypot(v.x - x0, v.z - z0), cross = SW.byCause.cross - st0.cross, promote = SW.byCause.promote - st0.promote, mile = I95.project(v.x, v.z, 600).s / 1609.344;
    await home();
    return dist > 1500 && cross === 0 && promote === 0 && run.maxDrawCalls < 150 && off / n <= 0.1 && mile > 8.85 ? true : JSON.stringify({ dist: Math.round(dist), cross, promote, calls: run.maxDrawCalls, frameMs: run.frameMs, offRoad: off, samples: n, toMile: +mile.toFixed(2) });
  });

  await check('florida: Meridian stands at exit 9 - walled (the wall stops a walk, the west gate lets one in), its civic row and Main Street walk-in planned buildings, its people (nine named, deputies at the gates, townsfolk at work, a real flag on each), under 150 draw calls at the widest zoom over it', async () => {
    await home();
    await C('teleport', { x: H.cx, z: H.cz });
    await C('region', { action: 'promote', holdout: 'meridian' });
    await C('step', { seconds: 0.5 });
    const bad = [];
    // The wall: a walk from outside the north wall to inside is refused straight through (A* goes round by a gate).
    const out = { x: H.cx - 80, z: H.z0 - 12 }, inn = { x: H.cx - 80, z: H.z0 + 20 };
    const pth = await C('path', { fx: out.x, fz: out.z, x: inn.x, z: inn.z });
    const straight = Math.hypot(inn.x - out.x, inn.z - out.z);
    if (!pth.found || pth.length < straight * 1.5) bad.push(`wall: path ${pth.found} ${Math.round(pth.length ?? 0)} m vs ${Math.round(straight)} straight`);
    // In by the west gate on foot, from the end of the access road to Main Street.
    await C('teleport', { x: H.approach.x - 4, z: H.approach.z });
    const walk = await C('moveTo', { x: H.cx - 60, z: H.cz, run: true, maxSeconds: 60 });
    if (!walk.arrived) bad.push(`west gate walk: ${walk.interrupted ?? walk.reason ?? 'no'} ${walk.remaining ?? ''}`);
    const name = (await C('state')).player.location;
    if (!/^MERIDIAN/.test(name ?? '')) bad.push(`name ${name}`);
    // Its buildings: planned, walk-in, programmes in place; every keeper reached on foot from outside their door.
    const kinds = new Set(H.lots.map((L) => L.kind));
    for (const k of ['clinic', 'clonewing', 'sheriff', 'store', 'gunsmith', 'water', 'cantina', 'mechanic', 'townhall', 'house']) if (!kinds.has(k)) bad.push(`no ${k}`);
    const geo = WI.ring.geo(H.lotOf('clinic'));
    if (!geo.rooms.some((r) => r.type === 'ward') || !geo.boxesIn.length || !geo.doors.length) bad.push(`clinic plan: ${geo.rooms.map((r) => r.type)}`);
    const bay = Rg.clinic('meridian')?.bay;
    if (!bay) bad.push('no clone bay room');
    const v = Rg.view().holdouts.find((t) => t.id === 'meridian');
    const named = v.people.filter((p) => p.kind === 'named' && p.alive && p.char), deps = v.people.filter((p) => p.kind === 'deputy' && p.char), folk = v.people.filter((p) => p.kind === 'folk' && p.char);
    if (named.length < 9 || deps.length < 5 || folk.length < 10) bad.push(`people ${named.length}/${deps.length}/${folk.length}`);
    for (const p of v.people) if (!FLAGS[p.flag]) bad.push(`flag ${p.id} ${p.flag}`);
    for (const p of named) {
      const c = g.chars.find((o) => o.id === p.char), r = Rg.towns[0].recs.find((q) => q.id === p.id), L = r?.lot, post = L && Rg.postOf(L);
      if (!c || !L || c.x < L.x0 - 1 || c.x > L.x1 + 1 || c.z < L.z0 - 1 || c.z > L.z1 + 1) { bad.push(`${p.id} not in their building`); continue; }
      const pp = await C('path', { fx: post.door.x, fz: post.door.z, x: c.x, z: c.z });
      if (!pp.found) bad.push(`${p.id}: no path in from the door`);
    }
    // Traders own their shelves: a keeper's box is theirs.
    await C('step', { seconds: 1.5 });
    const store = Rg.towns[0].recs.find((r) => r.id === 'mer_store');
    const owned = [...g.inventory.boxes.values()].filter((b) => b.owner === store?.c?.id).length;
    if (!owned) bad.push('store shelves not the keeper\'s');
    // The widest zoom over the town: the draw-call budget.
    await C('teleport', { x: H.cx, z: H.cz + 4 });
    const z0 = g.zoomLevel; g.setZoom?.(4);
    const run = await SW.runFrames(1.5, null, { renderEvery: 1 });
    g.setZoom?.(z0);
    if (run.maxDrawCalls >= 150) bad.push(`draw calls ${run.maxDrawCalls}`);
    return bad.length ? JSON.stringify({ bad, calls: run.maxDrawCalls }) : true;
  });

  await check('florida: a new game starts at Meridian (players start in Florida, the harness in Phoenix; ?start= picks): on the clinic doorstep, the town around you; fall in Florida and you wake at Meridian\'s clinic', async () => {
    await home();
    const bad = [];
    if (START.player !== 'florida' || START.agent !== 'phoenix') bad.push(`START ${JSON.stringify(START)}`);
    if (Rg.start !== 'phoenix') bad.push(`this harness page starts in ${Rg.start}`);
    const r = await C('region', { action: 'start' });
    const cl = Rg.clinic('meridian'), p = g.player;
    if (!cl || Math.hypot(p.x - cl.door.x, p.z - cl.door.z) > 3) bad.push(`at ${p.x.toFixed(1)},${p.z.toFixed(1)} not the clinic door`);
    if (!/^MERIDIAN/.test(r.location ?? '')) bad.push(`location ${r.location}`);
    if (!Rg.intro || !Rg.towns[0].live) bad.push('town not live');
    // Fallen out in the swamp: the wake point is Meridian's clinic, not Rust Haven's.
    const f = I95.at(14 * 1609.344);
    p.x = f.x + 120; p.z = f.z;
    const rp = Rg.respawnPoint(p);
    if (!rp || rp.holdout !== 'meridian' || Math.hypot(rp.x - cl.door.x, rp.z - cl.door.z) > 0.5) bad.push(`respawn ${JSON.stringify(rp)}`);
    await home();
    if (Rg.respawnPoint(g.player)) bad.push('Phoenix respawn changed');
    return bad.length ? JSON.stringify(bad) : true;
  });

  await check('florida: the water is real - the sea, the lagoon, the canal and the sloughs are the depth authority (wade, swim, a car floods), the pier is dry, the laid-out grid agrees with the pure function, deep water is off the nav grids', async () => {
    await home();
    const bad = [];
    const sh = FL.shoreAt(H.cz), lagoonX = sh.x - sh.b - sh.l / 2;
    await C('teleport', { x: lagoonX, z: H.cz });
    await C('step', { seconds: 0.3 });
    const lag = waterDepth(lagoonX, H.cz), st = g.water.stateAt(lagoonX, H.cz);
    if (!(lag > 1.0) || st !== 'swim') bad.push(`lagoon ${lag} ${st}`);
    const sea = waterDepth(sh.x + 200, H.cz);
    if (!(sea > 5)) bad.push(`sea ${sea}`);
    if (waterDepth((H.pier.x0 + H.pier.x1) / 2, H.cz) !== 0) bad.push('pier wet');
    // The canal beside I-95, a mile and a half south of Meridian's exit (its side, its offset, its depth).
    const s = (9 - 2.5) * 1609.344, f = I95.at(s), cn = I95.canal, cxz = { x: f.x + f.nx * cn.side * cn.off, z: f.z + f.nz * cn.side * cn.off };
    await C('teleport', { x: cxz.x + 30 * f.nx * -cn.side, z: cxz.z });
    const cd = waterDepth(cxz.x, cxz.z);
    if (!(cd > 1.5)) bad.push(`canal ${cd}`);
    // The cached grid against the pure function, at points in the hot chunks.
    let worst = 0;
    for (const L of SW.hot.values()) {
      if (!L.water?.any) continue;
      for (let k = 0; k < 40; k++) { const x = L.cx * 256 + 4 * Math.floor(Math.random() * 64), z = L.cz * 256 + 4 * Math.floor(Math.random() * 64); worst = Math.max(worst, Math.abs(waterDepth(x, z) - regionWater(FL, x, z).d)); }
    }
    if (worst > 0.05) bad.push(`grid vs pure ${worst}`);
    // Deep canal water is off the car grid.
    const free = g.nav.car.free?.(cxz.x, cxz.z);
    if (free !== false && free !== undefined) bad.push('canal on the car nav grid');
    // A car driven into the canal floods (vehicles.js reads the same depth).
    // Stand beside it first: a car 4 km from you is not simulated, so whether it floods depended on where an earlier check
    // left you.
    await C('teleport', { x: cxz.x + 30, z: cxz.z });
    const r = await C('spawnVehicle', { type: 'interceptor', x: cxz.x, z: cxz.z, heading: 0 });
    await C('step', { seconds: 2 });
    const car = g.vehicles.find((o) => o.id === r.id);
    if (!car || !(car.flood > 0 || car.sunk || car.water > 0 || car.drown > 0 || car.dead)) bad.push(`car in the canal: ${JSON.stringify({ flood: car?.flood, water: car?.water, sunk: car?.sunk })}`);
    if (car) g.vehiclesSys.remove(car);
    await home();
    return bad.length ? JSON.stringify(bad) : true;
  });

  await check('florida: alligators (a FAUNA row) lie up at their water, notice, lunge and bite someone at the bank, die to gunfire and leave a gator to butcher; Meridian\'s sheriff counts them', async () => {
    await home();
    const bad = [];
    // A lair in a hot chunk near Meridian, or one staged at the canal.
    const s = (9 - 2.5) * 1609.344, f = I95.at(s), cn = I95.canal, lx = f.x + f.nx * cn.side * cn.off, lz = f.z + f.nz * cn.side * cn.off;
    await C('teleport', { x: lx - cn.side * f.nx * 40, z: lz });
    const sp = await C('region', { action: 'spawn', kind: 'gator', x: lx, z: lz });
    const gator = g.chars.find((c) => c.id === sp.id);
    // A man on the bank within its reach.
    const bx = lx - cn.side * f.nx * (cn.half + 2.5), bz = lz - f.nz * cn.side * (cn.half + 2.5);
    const dummy = g.addChar({ x: bx, z: bz, faction: 'drifter', weapon: null, hp: 300, name: 'Bank fisher (selftest)', flag: 'US' });
    dummy.hold = true;
    const since = g.eventSeq;
    await C('step', { seconds: 6 });
    const evs = g.events.filter((e) => e.seq > since);
    const lunged = evs.some((e) => e.type === 'faunaLunge' && e.id === gator.id), bit = evs.some((e) => e.type === 'faunaBite' && e.id === gator.id);
    if (!lunged || !bit || dummy.hp >= 300) bad.push(`lunge ${lunged} bite ${bit} hp ${dummy.hp}`);
    // Down it goes: a body with gator in it, the kill counted for the sheriff's job.
    g.quests.canal = 'active'; g.quests.canalStart = g.stats.gators ?? 0;
    await C('teleport', { x: gator.x - cn.side * f.nx * 12, z: gator.z });
    await C('give', { weapon: 'shotgun', shells: 30 }); await C('equip', { weapon: 'shotgun' });
    gator.fs.state = 'rest'; gator.hold = 0;
    for (let k = 0; k < 8 && gator.alive; k++) await C('fire', { id: gator.id, shots: 2 });
    await C('step', { seconds: 0.3 });
    if (gator.alive) bad.push(`gator hp ${gator.hp}`);
    const body = g.inventory.boxes.get(`body:${gator.id}`);
    if (!body || body.kind !== 'gator') bad.push(`body ${body?.kind}`);
    if ((g.stats.gators ?? 0) - g.quests.canalStart < 1) bad.push('not counted');
    delete g.quests.canal; delete g.quests.canalStart;
    g.removeChar(dummy);
    // The lairs a Florida layout finds by itself (out.life).
    const lairs = [...SW.layouts.values()].filter((L) => L.region === 'florida').reduce((n, L) => n + (L.life?.length ?? 0), 0);
    if (!lairs) bad.push('no lairs in the laid-out Florida chunks');
    await home();
    return bad.length ? JSON.stringify(bad) : true;
  });

  await check('florida: the infected at Florida\'s density - herds out of sight at night, never inside Meridian\'s wall or on the water', async () => {
    await home();
    const f = I95.at(14 * 1609.344);
    await C('teleport', { x: f.x - 160, z: f.z });
    await C('setTime', { hour: 23 }); await C('step', { seconds: 0.5 });
    const t0 = g.time; if (g.time < 200) g.time = 200;
    const before = g.chars.filter((c) => c.faction === 'zombie' && c.alive).length, since = g.eventSeq;
    const gate = { enabled: !!g.zombies?.enabled, free: g.freeSlots.length, night: +(g.sky.night ?? 0).toFixed(2) }; // herdPass's own gates (systems/regions.js), for a failure's report
    for (let k = 0; k < 4; k++) Rg.herdPass(SW.region ?? FL);
    const herds = g.events.filter((e) => e.seq > since && e.type === 'hordeSpawned' && e.region === 'florida');
    const after = g.chars.filter((c) => c.faction === 'zombie' && c.alive);
    const wrong = after.filter((c) => H.inCity(c.x, c.z, 10) || waterDepth(c.x, c.z) > 0.6).length;
    const seen = after.filter((c) => Math.hypot(c.x - g.player.x, c.z - g.player.z) < Math.min(60, g.viewR)).length;
    for (const c of after) if (Math.hypot(c.x - g.player.x, c.z - g.player.z) < 400) g.removeChar(c);
    g.time = Math.max(g.time, t0);
    await C('setTime', { hour: 12 });
    await home();
    return herds.length >= 1 && after.length > before && !wrong && !seen ? true : JSON.stringify({ herds: herds.length, before, after: after.length, wrong, seen, ...gate });
  });
}
