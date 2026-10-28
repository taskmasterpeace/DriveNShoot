// Selftest checks for L1 water and its L2 crossings (docs/design/WEB_RIVERS.md §8). runSelfTest calls this after the
// streamed world's checks and before its perf and runtime-error checks. Every drive runs the way the real-time loop runs
// (sliced streaming, a fixed 60 Hz step); every walk is a real moveTo on the nav grid.
import { WATER, WATER_ROWS, validateWater } from '../data/water.js';

const r2 = (v) => Math.round(v * 100) / 100;

export async function waterChecks(api, check, C) {
  const g = api.g, SW = g.streamer, WI = SW?.W, R = WI?.water;
  if (!R) { await check('water: the streamed world carries L1 water', async () => 'no streamed world'); return; }
  const home = async () => {
    if (g.needs) { g.needs.rest = Math.max(g.needs.rest, 0.9); g.needs.blackout = 0; }
    if (g.dialogue?.active) g.dialogue.close(); // an earlier check's conversation left open holds your feet and hands
    g.driveOverride = null;
    const v = g.player.inVehicle;
    if (v) { g.exitVehicle(true); g.vehiclesSys.remove(v); }
    await C('teleport', { x: 0, z: -40 });
  };
  const onI10 = async (type, s, dir) => {
    if (g.player.inVehicle) g.exitVehicle(true);
    const q = SW.lanePoint(s, dir, 0), f = WI.at(s);
    await C('teleport', { x: q.x, z: q.z });
    const r = await C('spawnVehicle', { type, x: q.x, z: q.z, heading: Math.atan2(f.tx * dir, f.tz * dir) });
    await C('enterVehicle', { id: r.id, force: true });
    await C('teleport', { x: q.x, z: q.z });
    return g.player.inVehicle;
  };
  const quiet = () => { const was = { z: g.zombies.enabled, r: g.raiderTimer, conv: g.convoy.next }; g.zombies.enabled = false; g.raiderTimer = 1e9; g.convoy.despawn(); g.convoy.next = 1e9; return () => { g.zombies.enabled = was.z; g.raiderTimer = was.r; g.convoy.next = was.conv; }; };
  const body = (id) => R.bodies.find((b) => b.id === id);
  const colorado = R.bridges.find((b) => b.kind === 'deck' && b.road === 'I-10' && b.river === 'colorado');
  const ford = R.fords.find((f) => f.river === 'colorado' && f.kind === 'river ford');
  // A point mid-river, deeper than `deep`, at least `away` metres from `from` (off the bridge, off the ford).
  const midRiver = (id, deep = 2, away = 300, from = null) => {
    const b = body(id);
    for (let i = 0; i < b.n; i += 3) { if (from && Math.hypot(b.x[i] - from.x, b.z[i] - from.z) < away) continue; if (R.depthAt(b.x[i], b.z[i]) > deep) return { x: b.x[i], z: b.z[i], i, b }; }
    return null;
  };
  const restore = quiet();
  try {
    await check('water: the L1 rows are valid (validateWater), depthAt is 0 on dry land and deeper than ford mid-river, and the island still answers its own lake', async () => {
      const bad = validateWater(WATER_ROWS, { phoenix: true });
      const dry = [];
      for (let s = 3000; s < WI.cl.L && dry.length < 4; s += 3700) { const f = WI.at(s), x = f.x + f.nx * 300, z = f.z + f.nz * 300; if (!R.near(x, z)) dry.push(g.water.depthAt(x, z)); }
      const m = midRiver('colorado', 2, 300, colorado), deep = m ? g.water.depthAt(m.x, m.z) : 0;
      const lake = g.water.depthAt(390, 398);
      return !bad.length && dry.length === 4 && dry.every((d) => d === 0) && deep > WATER.ford && lake > 5 && R.bodies.length >= 10 && !!colorado && !!ford
        ? true : JSON.stringify({ bad: bad.slice(0, 3), dry, deep, lake, bodies: R.bodies.length, colorado: !!colorado, ford: !!ford });
    });

    await check('water: every road/river crossing in the corridor has a deck, a culvert or a ford (none missing): no lane of I-10, no county road and no street meets water deeper than ford or a cut channel anywhere but on a deck', async () => {
      const bad = [];
      for (let s = 0; s < WI.cl.L && bad.length < 6; s += 4) for (const dir of [1, -1]) for (const lane of [0, 1]) {
        const q = SW.lanePoint(s, dir, lane);
        if ((Math.abs(q.x) < 470 && Math.abs(q.z) < 470) || !R.near(q.x, q.z)) continue;
        if (R.deckAt(q.x, q.z) >= 0) continue;
        const sm = R.sample(q.x, q.z);
        if (sm.depth > WATER.ford || sm.bedRel < -0.3) bad.push(`I-10 mile ${(s / 1609.344).toFixed(2)} ${dir > 0 ? 'E' : 'W'}${lane}: depth ${r2(sm.depth)}, cut ${r2(sm.bedRel)}`);
      }
      for (const rb of WI.ribbons) {
        if (rb.mainline || rb.water || rb.kind === 'ramp' || rb.deck) continue;
        for (let i = 0; i < rb.n; i++) { const x = rb.x[i], z = rb.z[i]; if (R.near(x, z) && R.deckAt(x, z) < 0 && R.depthAt(x, z) > WATER.ford) { bad.push(`${rb.id} point ${i}: depth ${r2(R.depthAt(x, z))}`); break; } }
      }
      // And every place a channel's line crosses I-10's has its crossing record (a deck spanning it, or a culvert at it).
      let lines = 0;
      const cl = WI.cl;
      for (const b of R.bodies) for (let i = 0; i < b.n - 1; i++) {
        if (b.f[i] <= 0) continue;
        for (const a of R.clSegs(WI, Math.min(b.x[i], b.x[i + 1]), Math.min(b.z[i], b.z[i + 1]), Math.max(b.x[i], b.x[i + 1]), Math.max(b.z[i], b.z[i + 1]))) {
          const rx = cl.x[a + 1] - cl.x[a], rz = cl.z[a + 1] - cl.z[a], sx = b.x[i + 1] - b.x[i], sz = b.z[i + 1] - b.z[i], den = rx * sz - rz * sx;
          if (Math.abs(den) < 1e-9) continue;
          const ta = ((b.x[i] - cl.x[a]) * sz - (b.z[i] - cl.z[a]) * sx) / den, tb = ((b.x[i] - cl.x[a]) * rz - (b.z[i] - cl.z[a]) * rx) / den;
          if (ta < 0 || ta > 1 || tb < 0 || tb > 1) continue;
          lines++;
          const s = cl.s[a] + (cl.s[a + 1] - cl.s[a]) * ta;
          const rec = R.bridges.find((B) => B.road === 'I-10' && (B.kind === 'deck' ? s >= B.s0 - 10 && s <= B.s1 + 10 : Math.abs(B.s - s) < 80));
          if (!rec) bad.push(`${b.id} crosses I-10 at mile ${(s / 1609.344).toFixed(2)} with no crossing`);
        }
      }
      // (on real terrain, the default since WEB_SITES_TERRAIN, every small crossing is a gorge under a fill: a deck, not a culvert)
      const n = (k) => R.bridges.filter((B) => B.kind === k).length;
      return !bad.length && lines >= 8 && n('deck') >= 4 && n('culvert') + n('ford') >= (WI.terrain ? 0 : 3) ? true : JSON.stringify({ bad: bad.slice(0, 6), lines, decks: n('deck'), culverts: n('culvert'), fords: n('ford') });
    });

    await check('water: a car crosses the Colorado bridge flat out (up the approach fill, over the deck above the river, down the other side: never in the water, never airborne, never below the deck)', async () => {
      await home();
      const D = colorado, v = await onI10('interceptor', D.s0 - D.ramp - 260, 1);
      let air = 0, wet = 0, low = Infinity, over = 0, fast = 0, s = 0;
      await SW.runFrames(40, () => {
        const a = SW.autopilot(v, 1, 0);
        g.driveOverride = { throttle: 1, steer: a.steer }; s = a.s;
        if (v.air) air++;
        if ((v.depth ?? 0) > 0) wet++;
        if (a.s > D.s0 + 4 && a.s < D.s1 - 4) { over++; low = Math.min(low, v.y - WI.groundAt(v.x, v.z) - D.lift); fast = Math.max(fast, Math.hypot(v.vx, v.vz)); }
        if (a.s > D.s1 + D.ramp + 80) return false;
      }, { renderEvery: 10 });
      const crossed = s > D.s1 + D.ramp + 60, flood = v.flood ?? 0, sunk = !!v.sunk;
      await home();
      return crossed && air === 0 && wet === 0 && over > 20 && low > -0.3 && fast > 20 && !sunk ? true : JSON.stringify({ crossed, s: Math.round(s), air, wet, over, low: r2(low), fast: r2(fast), flood, sunk });
    });

    await check('water: a car driven into the deep river stalls, floods and sinks; one up on the deck above it is dry', async () => {
      await home();
      const m = midRiver('colorado', 2.2, 300, colorado);
      const car = api.findVeh((await C('spawnVehicle', { type: 'sedan', x: m.x, z: m.z })).id);
      await C('teleport', { x: m.x + 60, z: m.z }); // nearby, so its chunk stays hot
      car.driver = g.player; car.throttle = 1; // somebody at the wheel, foot down: the engine drowns anyway
      await C('step', { seconds: 7 });
      car.driver = null;
      const sank = car.sunk, depth = car.depth;
      // Up on the deck: the same river under the car, and it is dry.
      const p = WI.at(colorado.s), deckY = WI.groundAt(p.x, p.z) + colorado.lift;
      const onDeck = g.water.depthAt(p.x + p.nx * 6, p.z + p.nz * 6, false, deckY), under = g.water.depthAt(p.x + p.nx * 6, p.z + p.nz * 6, false, deckY - 6);
      g.vehiclesSys.remove(car);
      await home();
      return sank && depth > 1.1 && onDeck === 0 && under > 1 ? true : JSON.stringify({ sank, flood: car.flood, depth: r2(depth), onDeck, under: r2(under) });
    });

    await check('water: someone on foot wades the Colorado\'s ford (wading, never swimming, out on the far bank by moveTo), and a car crosses it slowly, throwing spray, without flooding', async () => {
      await home();
      const b = body('colorado');
      let fi = 0, fd = Infinity; for (let i = 0; i < b.n; i++) { const d = Math.hypot(b.x[i] - ford.x, b.z[i] - ford.z); if (d < fd) { fd = d; fi = i; } }
      const nx = -b.tz[fi], nz = b.tx[fi], hw = b.w[fi] / 2 + 10;
      const A = { x: ford.x - nx * hw, z: ford.z - nz * hw }, B = { x: ford.x + nx * hw, z: ford.z + nz * hw };
      const mid = R.sample(ford.x, ford.z).depth;
      await C('teleport', A); await C('step', { seconds: 0.3 });
      const seq0 = g.eventSeq;
      const mv = await C('moveTo', { x: B.x, z: B.z, maxSeconds: 60 });
      const states = g.events.filter((e) => e.seq > seq0 && e.type === 'water').map((e) => e.state);
      const across = Math.hypot(g.player.x - B.x, g.player.z - B.z) < 3;
      // The car: across the bar at a crawl, foot down.
      await C('teleport', { x: A.x - nx * 8, z: A.z - nz * 8 });
      const car = api.findVeh((await C('spawnVehicle', { type: 'pickup', x: A.x - nx * 8, z: A.z - nz * 8, heading: Math.atan2(nx, nz) })).id);
      await C('enterVehicle', { id: car.id, force: true });
      let maxD = 0, slowest = Infinity, entry = 0, sprays = 0;
      await SW.runFrames(14, () => {
        const want = Math.atan2(B.x + nx * 12 - car.x, B.z + nz * 12 - car.z), diff = Math.atan2(Math.sin(want - car.h), Math.cos(want - car.h));
        g.driveOverride = { throttle: 1, steer: Math.max(-1, Math.min(1, diff * 2)) };
        const d = car.depth ?? 0, sp = Math.hypot(car.vx, car.vz); maxD = Math.max(maxD, d);
        if (d > 0.15) { slowest = Math.min(slowest, sp); sprays++; } else if (maxD === 0) entry = sp; // its speed as it reaches the water
        if (Math.hypot(car.x - (B.x + nx * 12), car.z - (B.z + nz * 12)) < 4) return false;
      }, { renderEvery: 10 });
      const carAcross = (car.x - ford.x) * nx + (car.z - ford.z) * nz > hw - 4, flooded = !!car.sunk;
      await home();
      return mv.ok !== false && across && states.includes('wade') && !states.includes('swim') && mid > 0.2 && mid < WATER.ford && carAcross && !flooded && maxD > 0.2 && sprays > 10 && slowest < entry * 0.8
        ? true : JSON.stringify({ moveTo: mv.ok, reason: mv.reason, across, states, mid: r2(mid), carAcross, flooded, maxD: r2(maxD), sprays, entry: r2(entry), slowest: r2(slowest) });
    });

    await check('water: nav routes over the bridge, not through the river (by car and on foot, bank to bank beside the Colorado bridge)', async () => {
      await home();
      const D = colorado, p0 = WI.at(D.s0 - 40), p1 = WI.at(D.s1 + 40);
      const out = [];
      for (const mode of ['car', 'foot']) {
        // From beside the road before the bridge to beside it after: the only dry way across is the deck.
        const a = { x: p0.x + p0.nx * 30, z: p0.z + p0.nz * 30 }, b = { x: p1.x + p1.nx * 30, z: p1.z + p1.nz * 30 };
        const r = await C('path', { fx: a.x, fz: a.z, x: b.x, z: b.z, mode });
        if (!r.found) { out.push(`${mode}: no route`); continue; }
        let wet = 0, onDeck = 0, px = a.x, pz = a.z;
        for (const w of r.waypoints) {
          for (let t = 0; t <= 1; t += 0.05) { const x = px + (w.x - px) * t, z = pz + (w.z - pz) * t; if (R.deckAt(x, z) >= 0) onDeck++; else if (R.sample(x, z).depth > (mode === 'car' ? WATER.ford : 1.2) + 0.1) wet++; }
          px = w.x; pz = w.z;
        }
        if (wet || !onDeck) out.push(`${mode}: ${wet} wet samples, ${onDeck} on the deck`);
      }
      return out.length ? out.join(' | ') : true;
    });

    await check('water: under the deck is the river (a swimmer there swims, a boat floats and runs), on top of it you are dry', async () => {
      await home();
      const D = colorado, p = WI.at(D.s), b = body('colorado');
      // The river's own centre under the deck.
      let bi = 0, bd = Infinity; for (let i = 0; i < b.n; i++) { const d = Math.hypot(b.x[i] - p.x, b.z[i] - p.z); if (d < bd) { bd = d; bi = i; } }
      const ux = b.x[bi], uz = b.z[bi];
      await C('teleport', { x: ux, z: uz }); await C('step', { seconds: 0.4 });
      const swims = g.player.swim === true, state = g.water.stateAt(ux, uz, g.player.gy), gy = g.player.gy;
      const boat = api.findVeh((await C('spawnVehicle', { type: 'airboat', x: b.x[Math.max(0, bi - 8)], z: b.z[Math.max(0, bi - 8)], heading: Math.atan2(b.tx[bi], b.tz[bi]) })).id);
      await C('enterVehicle', { id: boat.id, force: true });
      await C('drive', { throttle: 1, seconds: 2 });
      const moved = g.vehiclesSys.speed(boat), floatY = boat.group.position.y, surf = g.water.surfaceAt(boat.x, boat.z, NaN);
      await home(); g.vehiclesSys.remove(boat);
      const sec = WI.section(D.s), lx = p.x + p.nx * (sec.lane0 + 2), lz = p.z + p.nz * (sec.lane0 + 2); // a lane on the deck, over the river
      const deckDry = g.water.stateAt(lx, lz, WI.groundAt(lx, lz) + D.lift) === 'dry' && g.water.depthAt(lx, lz, false, WI.groundAt(lx, lz) + D.lift - 6) > 0;
      return swims && state === 'swim' && moved > 5 && Math.abs(floatY - surf) < 0.5 && deckDry ? true : JSON.stringify({ swims, state, gy: r2(gy), moved: r2(moved), floatY: r2(floatY), surf: r2(surf), deckDry });
    });

    await check('water: a chunk with a river and its bridge is a pure function of the data (the same hash built fresh in sync and in slices) and agrees with its neighbours at the seams', async () => {
      const a = await C('chunk', { x: colorado.x, z: colorado.z, build: true });
      const fs = (await C('chunk', { x: colorado.x, z: colorado.z, fresh: true, mode: 'sync' })).fresh, fl = (await C('chunk', { x: colorado.x, z: colorado.z, fresh: true, mode: 'sliced' })).fresh;
      const e = await C('chunk', { x: colorado.x + 256, z: colorado.z, build: true }), s = await C('chunk', { x: colorado.x, z: colorado.z + 256, build: true });
      const ok = fs.matches && fl.matches && a.edges.e === e.edges.w && a.edges.s === s.edges.n && (a.surfaces.water ?? 0) > 0;
      return ok ? true : JSON.stringify({ sync: fs.matches, sliced: fl.matches, east: [a.edges.e, e.edges.w], south: [a.edges.s, s.edges.n], water: a.surfaces.water });
    });

    await check('water: with real terrain on, the rivers lie in their valleys (the Colorado deep below I-10) and every crossing is still bridged (no lane over water or a gorge off a deck); back to how it was after (real terrain is the default now: WEB_SITES_TERRAIN), the world as it was', async () => {
      await home();
      const was = !!WI.terrain, t = await C('terrain', { on: true });
      try {
        const bad = [];
        for (let s = 0; s < WI.cl.L && bad.length < 6; s += 6) for (const dir of [1, -1]) {
          const q = SW.lanePoint(s, dir, 0);
          if ((Math.abs(q.x) < 470 && Math.abs(q.z) < 470) || !R.near(q.x, q.z) || R.deckAt(q.x, q.z) >= 0) continue;
          const sm = R.sample(q.x, q.z);
          if (sm.depth > WATER.ford || sm.bedRel < -0.3) bad.push(`mile ${(s / 1609.344).toFixed(2)}: depth ${r2(sm.depth)}, cut ${r2(sm.bedRel)}`);
        }
        const D = R.bridges.find((b) => b.kind === 'deck' && b.road === 'I-10' && b.river === 'colorado');
        const p = WI.at(D.s), road = WI.groundAt(p.x, p.z), b = body('colorado');
        let bi = 0, bd = Infinity; for (let i = 0; i < b.n; i++) { const d = Math.hypot(b.x[i] - p.x, b.z[i] - p.z); if (d < bd) { bd = d; bi = i; } }
        const m = midRiver('colorado', 2, 300, D), under = road - b.Y[bi]; // the river's own surface where the deck spans it
        return t.on && !bad.length && D && under > WATER.gorge && m ? true : JSON.stringify({ on: t.on, bad, deck: !!D, under: r2(under), mid: !!m });
      } finally {
        await C('terrain', { on: was });
        await home();
      }
    });

    await check('water: over the Colorado bridge at the widest zoom the frame stays under 150 draw calls', async () => {
      await home();
      const p = WI.at(colorado.s);
      await C('teleport', { x: p.x + p.nx * 20, z: p.z + p.nz * 20 });
      const z0 = g.zoomLevel;
      await C('zoom', { level: 'HIGH' }); await C('step', { seconds: 2 });
      g.render(0); const perf = await C('perf');
      await C('zoom', { level: String(z0 ?? 1) });
      await home();
      return perf.drawCalls < 150 ? true : `drawCalls=${perf.drawCalls}`;
    });
  } finally { restore(); g.driveOverride = null; }
}
