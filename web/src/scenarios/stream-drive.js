// stream-drive: the P1 proof of the streamed world (docs/design/WEB_STREAMING.md §8 items 9, 13 and 14), run the way
// the real-time loop runs (sliced streaming, a render every frame, GPU-synced frame times; the rAF loop held off).
//   vref     each rig's flat-out speed on I-10, measured (the MOTORCYCLE is the fastest ground vehicle there is; the
//            LAWMAN's row says 46 m/s, but its flat-out speed under the driving model is lower: see the result).
//   gate     60 s at FULL THROTTLE east on I-10 out of Phoenix, by day, on the fastest ground vehicle. Passes when it ends
//            more than 2,400 m from the start, with zero cross/promote stalls, under 150 draw calls, and at least 90% of
//            the 1 Hz samples on the road (within the road's half-width + 2 m).
//   perf     the spec's perf case: night, an acid storm, the widest zoom, two raider buggies chasing, 120 s held at
//            V_ref = 46 m/s across an interchange (speed held like a steady foot: no rig reaches 46 flat out) after a
//            15 s warm-up; max draw calls, frame ms, pump ms, stalls, heap growth.
//   ring     the Phoenix ring (WEB_STREAMING §1.3): night, an acid storm, the widest zoom, 46 m/s on I-10 across the dead
//            city, then 25 s up the arterial x = 640 through its blocks: draw calls, layout ms, pools, zero cross/promote.
//   ceiling  60 s held at 60 m/s (the spec's speed-ceiling probe): zero stalls.
//   florida  WEB_FLORIDA §8: 60 s flat out north on I-95 past Meridian; 90 s held at 46 m/s at night in a storm through
//            Alligator Alley on I-75 (game.streamDrive = { phases: ['florida'] } runs just this: "corridor=florida").
// game.streamDrive = { phases: ['gate'] } (set with exec first) runs only some. Run: node tools/dl.mjs scenario name=stream-drive
export default async function (DL, game) {
  const S = game.streamer, W = S.W, phases = game.streamDrive?.phases ?? ['vref', 'gate', 'perf', 'ring', 'ceiling', 'florida'];
  const out = {};
  await DL.start();
  await DL.god({ on: true });
  const directorWas = game.society.director.paused;
  game.society.director.paused = true; // no hunters dropped into a timing run
  game.convoy.despawn(); const convoyNext = game.convoy.next; game.convoy.next = 1e9; // nor a convoy in the lane
  const stalls = () => ({ cross: S.byCause.cross, promote: S.byCause.promote });
  const spawned = [];
  // A rig in a lane of I-10 at arc length s, facing along it, you at the wheel (the teleport builds its hot ring: an
  // expected `teleport` stall, never a `cross` one).
  const put = async (type, s, dir) => {
    if (game.player.inVehicle) game.exitVehicle(true);
    const q = S.lanePoint(s, dir, 0), f = W.at(s);
    await DL.teleport({ x: q.x, z: q.z });
    const r = await DL.spawnVehicle({ type, x: q.x, z: q.z, heading: Math.atan2(f.tx * dir, f.tz * dir), paint: '#6a2a1a' });
    await DL.enterVehicle({ id: r.id, force: true });
    await DL.teleport({ x: q.x, z: q.z });
    spawned.push(game.player.inVehicle);
    return game.player.inVehicle;
  };
  const clear = () => { game.driveOverride = null; if (game.player.inVehicle) game.exitVehicle(true); for (const v of spawned.splice(0)) if (game.vehicles.includes(v)) game.vehiclesSys.remove(v); };

  if (phases.includes('vref')) {
    out.vref = {};
    for (const type of ['bike', 'interceptor', 'buggy']) {
      const v = await put(type, W.sIslW - 600, -1);
      await S.runFrames(25, () => { game.driveOverride = { throttle: 1, steer: S.autopilot(v, -1).steer }; }, { renderEvery: 30 });
      out.vref[type] = { name: v.name, rowMaxSpeed: v.maxSpeed, flatOut: +Math.hypot(v.vx, v.vz).toFixed(1) };
      clear();
    }
  }

  if (phases.includes('gate')) {
    await DL.setTime({ hour: 10 }); await DL.setWeather({ key: 'CLEAR', instant: true });
    game.setZoom?.(1);
    const s0 = W.sIslE + 200, v = await put('bike', s0, 1), x0 = v.x, z0 = v.z, st0 = stalls(), samples = [];
    const run = await S.runFrames(60, (i) => {
      const a = S.autopilot(v, 1, 0);
      game.driveOverride = { throttle: 1, steer: a.steer };
      if (i % 60 === 0) samples.push(a.d <= W.section(a.s).out + 2 ? 1 : 0);
    });
    const dist = Math.hypot(v.x - x0, v.z - z0), st = stalls(), onRoad = samples.reduce((s, k) => s + k, 0) / samples.length;
    out.gate = { vehicle: v.name, metres: Math.round(dist), avgSpeed: +(dist / 60).toFixed(1), topSpeed: +Math.hypot(v.vx, v.vz).toFixed(1), crossStalls: st.cross - st0.cross, promoteStalls: st.promote - st0.promote,
      maxDrawCalls: run.maxDrawCalls, frameMs: run.frameMs, onRoad: +onRoad.toFixed(2), from: `mile ${(s0 / 1609.344).toFixed(1)}`, to: `mile ${(W.project(v.x, v.z, 600).s / 1609.344).toFixed(1)}`,
      pass: dist > 2400 && st.cross === st0.cross && st.promote === st0.promote && run.maxDrawCalls < 150 && onRoad >= 0.9 };
    clear();
  }

  if (phases.includes('perf')) {
    await DL.setTime({ hour: 23 }); await DL.setWeather({ key: 'STORM', instant: true });
    game.setZoom?.(4);
    const s0 = 47000, v = await put('interceptor', s0, 1);
    // Two Dustwolf buggies right behind you, hunting.
    for (const k of [1, 2]) {
      const q = S.lanePoint(s0 - 25 * k, 1, k % 2);
      const r = await DL.spawnVehicle({ type: 'buggy', x: q.x, z: q.z, heading: v.h, ai: 'raider', paint: '#4a2018' });
      spawned.push(game.vehicles.find((o) => o.id === r.id));
    }
    const hold = (sp) => () => { const a = S.autopilot(v, 1, 0); game.driveOverride = { throttle: 1, steer: a.steer }; v.vx = Math.sin(v.h) * sp; v.vz = Math.cos(v.h) * sp; };
    await S.runFrames(15, hold(46)); // the warm-up lap
    const st0 = stalls();
    S.pumpN = 0; S.pumpMax = 0;
    const x0 = v.x, z0 = v.z;
    // Heap growth: on a page that exposes gc() (Chrome with --js-flags=--expose-gc) the live heap after a full GC before
    // and after the run; otherwise the lowest reading in the first and last 20 s, a rough floor (one reading either side
    // swung by +-40 MB with a major GC landing between them).
    const gcNow = typeof globalThis.gc === 'function' ? globalThis.gc : null;
    let heap0 = Infinity, heap1 = Infinity;
    if (gcNow) { gcNow(); heap0 = performance.memory.usedJSHeapSize; }
    const drive = hold(46);
    const run = await S.runFrames(120, (i) => {
      drive(i);
      if (!gcNow && i % 15 === 0 && performance.memory) { const h = performance.memory.usedJSHeapSize; if (i < 1200) heap0 = Math.min(heap0, h); else if (i >= 6000) heap1 = Math.min(heap1, h); }
    });
    if (gcNow) { gcNow(); heap1 = performance.memory.usedJSHeapSize; }
    if (!performance.memory) heap0 = heap1 = 0;
    const st = stalls(), pump = S.pumpStats();
    out.perf = { vehicle: v.name, heldAt: 46, metres: Math.round(Math.hypot(v.x - x0, v.z - z0)), to: `mile ${(W.project(v.x, v.z, 600).s / 1609.344).toFixed(1)}`, maxDrawCalls: run.maxDrawCalls, maxTriangles: run.maxTriangles,
      frameMs: run.frameMs, pumpMs: pump, crossStalls: st.cross - st0.cross, promoteStalls: st.promote - st0.promote, heapGrowthMB: +((heap1 - heap0) / 1048576).toFixed(1), heapMethod: gcNow ? 'gc' : 'floor',
      pass: run.maxDrawCalls < 150 && run.frameMs.p95 < 8 && run.frameMs.max < 25 && pump.p95 <= 2.5 && st.cross === st0.cross && st.promote === st0.promote && (heap1 - heap0) < 15 * 1048576 };
    clear();
  }

  if (phases.includes('ring')) {
    // The Phoenix ring (world/ring.js): night, an acid storm, the widest zoom, held at 46 m/s on I-10 out of the island
    // east through the dead city to its edge (the strip and the houses either side), then 25 s up an arterial through the
    // densest blocks (the line x = 640, north). Ring chunks are the dearest to lay out: zero cross/promote stalls here
    // is the streamer keeping ahead of them.
    await DL.setTime({ hour: 23 }); await DL.setWeather({ key: 'STORM', instant: true });
    game.setZoom?.(4);
    const s0 = W.sIslE + 20, v = await put('interceptor', s0, 1), st0 = stalls(), x0 = v.x, z0 = v.z;
    S.pumpN = 0; S.pumpMax = 0;
    const built0 = S.built;
    const a = await S.runFrames(32, () => { const q = S.autopilot(v, 1, 0); game.driveOverride = { throttle: 1, steer: q.steer }; v.vx = Math.sin(v.h) * 46; v.vz = Math.cos(v.h) * 46; });
    clear();
    // Up the arterial: straight north along x = 640 from the freeway's edge.
    const r = await DL.spawnVehicle({ type: 'interceptor', x: 640, z: -60, heading: Math.PI, paint: '#6a2a1a' });
    await DL.enterVehicle({ id: r.id, force: true }); await DL.teleport({ x: 640, z: -60 });
    const u = game.player.inVehicle; spawned.push(u);
    const b = await S.runFrames(25, () => { game.driveOverride = { throttle: 1, steer: 0 }; u.h = Math.PI; u.vx = 0; u.vz = -30; }); // held on the line (a probe, like the speed holds above)
    const nb = Math.min(S.built - built0, S.buildCosts.length), st = stalls(), pump = S.pumpStats(), costs = S.buildCosts.slice(S.buildCosts.length - nb).sort((p, q) => p - q);
    out.ring = { freeway: { metres: Math.round(Math.hypot(v.x - x0, v.z - z0)), maxDrawCalls: a.maxDrawCalls, frameMs: a.frameMs }, arterial: { to: [Math.round(u.x), Math.round(u.z)], maxDrawCalls: b.maxDrawCalls, frameMs: b.frameMs },
      pumpMs: pump, crossStalls: st.cross - st0.cross, promoteStalls: st.promote - st0.promote, layouts: costs.length, layoutMs: costs.length ? { p50: costs[Math.floor(costs.length / 2)], p95: costs[Math.floor(costs.length * 0.95)], max: costs[costs.length - 1] } : null,
      pools: Object.fromEntries(Object.entries(S.pools).map(([k, p]) => [k, { used: p.used, high: p.high, cap: p.cap, full: p.full }])),
      pass: Math.max(a.maxDrawCalls, b.maxDrawCalls) < 150 && st.cross === st0.cross && st.promote === st0.promote && Object.values(S.pools).every((p) => !p.full) };
    clear();
  }

  if (phases.includes('ceiling')) {
    await DL.setTime({ hour: 14 }); await DL.setWeather({ key: 'CLEAR', instant: true });
    game.setZoom?.(1);
    await DL.registerVehicle({ key: 'probe', def: { base: 'interceptor', maxSpeed: 60 } });
    const s0 = 2000, v = await put('probe', s0, 1), st0 = stalls(), x0 = v.x, z0 = v.z;
    const run = await S.runFrames(60, () => { const a = S.autopilot(v, 1, 0); game.driveOverride = { throttle: 1, steer: a.steer }; v.vx = Math.sin(v.h) * 60; v.vz = Math.cos(v.h) * 60; }, { renderEvery: 2 });
    const st = stalls();
    out.ceiling = { vehicle: 'probe (a LAWMAN row with maxSpeed 60, held at 60 m/s)', metres: Math.round(Math.hypot(v.x - x0, v.z - z0)), crossStalls: st.cross - st0.cross, promoteStalls: st.promote - st0.promote, maxDrawCalls: run.maxDrawCalls, pass: st.cross === st0.cross && st.promote === st0.promote };
    clear();
  }

  if (phases.includes('florida')) {
    // Florida (docs/design/WEB_FLORIDA.md §8): the start region on the same streamer. (a) 60 s flat out north on I-95 on
    // the bike from mile 7, past Meridian's exit 9, by day. (b) The swamp at its worst for the streamer: night, a storm,
    // the widest zoom, held at 46 m/s for 90 s along I-75 from mile 4 through ALLIGATOR ALLEY (sloughs, cypress, canal).
    const cor = (id) => W.corridors.find((c) => c.id === id);
    const onCor = async (type, c, s, dir) => {
      if (game.player.inVehicle) game.exitVehicle(true);
      const q = S.lanePoint(s, dir, 0, c), f = c.at(s);
      await DL.teleport({ x: q.x, z: q.z });
      const r = await DL.spawnVehicle({ type, x: q.x, z: q.z, heading: Math.atan2(f.tx * dir, f.tz * dir), paint: '#6a2a1a' });
      await DL.enterVehicle({ id: r.id, force: true });
      await DL.teleport({ x: q.x, z: q.z });
      spawned.push(game.player.inVehicle);
      return game.player.inVehicle;
    };
    const I95 = cor('I-95'), I75 = cor('I-75');
    await DL.setTime({ hour: 10 }); await DL.setWeather({ key: 'CLEAR', instant: true });
    game.setZoom?.(1);
    let v = await onCor('bike', I95, 7 * 1609.344, 1);
    let st0 = stalls(), x0 = v.x, z0 = v.z, samples = [];
    const a = await S.runFrames(60, (i) => { const q = S.autopilot(v, 1, 0, Infinity, I95); game.driveOverride = { throttle: 1, steer: q.steer }; if (i % 60 === 0) samples.push(q.d <= I95.section(q.s).out + 2 ? 1 : 0); });
    let st = stalls();
    const gate = { metres: Math.round(Math.hypot(v.x - x0, v.z - z0)), to: `I-95 mile ${(I95.project(v.x, v.z, 600).s / 1609.344).toFixed(1)}`, crossStalls: st.cross - st0.cross, promoteStalls: st.promote - st0.promote, maxDrawCalls: a.maxDrawCalls, frameMs: a.frameMs, onRoad: +(samples.reduce((s, k) => s + k, 0) / samples.length).toFixed(2) };
    gate.pass = gate.metres > 2400 && !gate.crossStalls && !gate.promoteStalls && gate.maxDrawCalls < 150 && gate.onRoad >= 0.9;
    clear();
    await DL.setTime({ hour: 23 }); await DL.setWeather({ key: 'STORM', instant: true });
    game.setZoom?.(4);
    v = await onCor('interceptor', I75, 4 * 1609.344, 1);
    st0 = stalls(); x0 = v.x; z0 = v.z; S.pumpN = 0; S.pumpMax = 0;
    const built0 = S.built;
    const b = await S.runFrames(90, () => { const q = S.autopilot(v, 1, 0, Infinity, I75); game.driveOverride = { throttle: 1, steer: q.steer }; v.vx = Math.sin(v.h) * 46; v.vz = Math.cos(v.h) * 46; });
    st = stalls();
    const nb = Math.min(S.built - built0, S.buildCosts.length), costs = S.buildCosts.slice(S.buildCosts.length - nb).sort((p, q) => p - q), pump = S.pumpStats();
    const swamp = { metres: Math.round(Math.hypot(v.x - x0, v.z - z0)), to: `I-75 mile ${(I75.project(v.x, v.z, 600).s / 1609.344).toFixed(1)}`, crossStalls: st.cross - st0.cross, promoteStalls: st.promote - st0.promote, maxDrawCalls: b.maxDrawCalls, maxTriangles: b.maxTriangles,
      frameMs: b.frameMs, pumpMs: pump, layouts: costs.length, layoutMs: costs.length ? { p50: costs[Math.floor(costs.length / 2)], p95: costs[Math.floor(costs.length * 0.95)], max: costs[costs.length - 1] } : null,
      pools: Object.fromEntries(Object.entries(S.pools).filter(([, p]) => p.used || p.full).map(([k, p]) => [k, { used: p.used, high: p.high, cap: p.cap, full: p.full }])) };
    swamp.pass = !swamp.crossStalls && !swamp.promoteStalls && swamp.maxDrawCalls < 150 && Object.values(S.pools).every((p) => !p.full);
    out.florida = { gate, swamp, pass: gate.pass && swamp.pass };
    clear();
  }

  game.convoy.next = convoyNext;
  game.society.director.paused = directorWas;
  await DL.teleport({ x: 0, z: -40 });
  await DL.setWeather({ key: 'CLEAR', instant: true });
  game.setZoom?.(1);
  await DL.god({ on: false });
  out.world = (({ layout, hot, stream }) => ({ layout, hot, stream }))(S.view());
  return out;
}
