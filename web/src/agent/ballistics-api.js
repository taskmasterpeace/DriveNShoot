// BULLET SPEED's command and checks (systems/ballistics.js, data/ballistics.js, docs/design/WEB_BALLISTICS.md).
import { ROUNDS, BALLISTICS as BL, LEAD, validateRounds, roundRow, calOf } from '../data/ballistics.js';
import { WEAPONS } from '../systems/combat.js';
import { AMMO_ITEM } from '../data/items.js';
import { RAY_BULLET } from '../engine/collision.js';
import { outfit } from '../systems/characters.js';

const r3 = (v) => (v === null || v === undefined ? v : +(+v).toFixed(3));

// A straight clear line `len` m long on the island's flats (heading +x): no box within 2.5 m of it, dry.
function clearLine(g, len) {
  const S = g.statics;
  for (let z = 300; z <= 430; z += 9) for (let x = -440; x + len <= 440; x += 40) {
    let ok = true;
    for (const b of S.boxes) if (b.maxX > x - 2 && b.minX < x + len && b.maxZ > z - 2.5 && b.minZ < z + 2.5) { ok = false; break; }
    if (ok) { S.raycast(x, z, 1, 0, len, RAY_BULLET, -1); if (S.hit.box) ok = false; }
    if (ok && g.water.depthAt(x, z) <= 0 && g.water.depthAt(x + len, z) <= 0) return { x, z };
  }
  return null;
}

// Fly one round alone at a fixed frame (no world: a ghost meets nothing and never meets the ground) and read it where it
// crosses `dist` m: the time and how far it has fallen. The integrator's own answer, at any dt.
function ghostFlight(g, key, dist, dt) {
  const B = g.ballistics;
  const p = B.launch(null, 0, 0, 1, 0, dist + 50, 1, key, key, { ghost: true, noPlatform: true, y: 100 });
  let pf = 0, pt = 0, py = p.y, out = null;
  for (let k = 0; k < 20000 && p.live; k++) {
    B.fly(p, dt);
    if (p.flown >= dist) { const f = (dist - pf) / Math.max(1e-9, p.flown - pf); out = { t: pt + (p.t - pt) * f, drop: 100 - (py + (p.y - py) * f) }; break; }
    pf = p.flown; pt = p.t; py = p.y;
  }
  if (p.live) { p.live = false; B.live--; }
  return out;
}


// A real round at a man `dist` m down a clear line of the flats: fired through combat.hitscan (the shot's entry), the sim
// stepped at dt until it comes down. The measured time from the trigger to the hit, and the closed form to his skin.
async function testShot(api, round, dist, dt = 1 / 60, L0 = null) {
  const g = api.g, B = g.ballistics, C = (cmd, a) => api.call(cmd, a);
  const L = L0 ?? clearLine(g, Math.max(60, dist + 20));
  if (!L) throw new Error(`no clear ${dist + 20} m line on the flats`);
  if (g.player.inVehicle) g.exitVehicle(true);
  for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.abs(c.z - L.z) < 12 && c.x > L.x - 10 && c.x < L.x + dist + 20) g.removeChar(c);
  await C('teleport', { x: L.x, z: L.z }); await api._step(2);
  const p = g.player, d = g.addChar({ x: p.x + dist, z: p.z, faction: 'drifter', weapon: null, colors: outfit('drifter'), name: 'Target (ballistics)', flag: 'US', hp: 5000 });
  d.x = p.x + dist; d.z = p.z; d.hold = true;
  const hp0 = d.hp, t0 = B.clock, ox = p.x + 0.6, oz = p.z, n0 = B.stats.launched;
  g.combat.hitscan(p, ox, oz, 1, 0, dist + 10, 30, round, 0, round);
  const shot = B.stats.launched > n0 ? B.pool[(B.next - 1 + B.cap) % B.cap] : null;
  if (!shot) { g.removeChar(d); throw new Error('no round left the muzzle'); }
  const id = shot.id;
  for (let k = 0; k < 2000 && shot.live && shot.id === id; k++) await api._step(1, dt);
  const mine = shot.id === id && !shot.live, L2 = { kind: shot.hitKind, t: shot.hitT >= 0 ? shot.hitT : shot.t, x: shot.x, drop: 1.45 - shot.y }; // its own slot, not B.last (another round may land in the same frame)
  const out = { round, dist, dt: r3(dt), hit: mine ? L2.kind : null, hurt: d.hp < hp0, flightTime: mine ? r3(L2.t) : null, closedForm: r3(B.flightTime(round, dist - 0.6 - d.radius - 0.1)), at: mine ? { x: r3(L2.x - p.x), drop: r3(L2.drop) } : null, stepped: r3(B.clock - t0) };
  g.removeChar(d);
  return out;
}

export function ballisticsCommands(api) {
  const g = api.g;
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };
  return {
    ballistics: {
      group: 'world', desc: 'BULLET SPEED (docs/design/WEB_BALLISTICS.md, rows in src/data/ballistics.js): every round flies at its row\'s muzzle velocity, slowed by drag, pulled down by gravity, carried by the shooter\'s car or deck, and meets what is in its way when it gets there (the same hit order and materials law as the old hitscan). No args: the rows (velocity, drag, supersonic, the closed-form time to 30 m and 300 m, the drop at 100 m), the laws, rounds in the air, counters (launched, recycled, hits, ground, cracks, whispers), the last round down and the last shots (the shard record: seed, muzzle, heading, platform velocity). test=true fires a test round of round=<row> (default rifle) dist m: ghost=true flies it alone (no world, no ground) at dt and reports the time and the drop where it crosses dist against the closed form; otherwise a dummy stands dist m off on a clear line of the flats, you fire one round at it through combat.hitscan (range dist+10) and the sim steps at dt until it lands: what it hit, the flight time measured and the closed form. on=false makes every gun the old hitscan (on=true back).',
      args: { test: { type: 'boolean', default: false }, round: { type: 'string', default: 'rifle' }, dist: { type: 'number', default: 300 }, ghost: { type: 'boolean', default: false }, dt: { type: 'number', default: 1 / 60 }, on: { type: 'boolean' } },
      run: async ({ test, round, dist, ghost, dt, on }) => {
        const B = g.ballistics;
        need(B, 'no ballistics system');
        if (on !== undefined) B.on = !!on;
        if (!test) return B.view();
        need(roundRow(round), `unknown round; known: ${Object.keys(ROUNDS).join(',')} (or an ammo key)`);
        need(dist > 0 && dist <= 1200, 'dist 0..1200 m');
        need(dt >= 1 / 240 && dt <= 0.1, 'dt 1/240..0.1 s');
        const tExp = B.flightTime(round, dist), dExp = B.dropAt(round, dist);
        if (ghost) {
          const f = ghostFlight(g, round, dist, dt);
          need(f, `a ${round} round never flies ${dist} m (velocity / drag = ${Math.round(roundRow(round).velocity / roundRow(round).drag)} m)`);
          return { round, dist, dt: r3(dt), flightTime: r3(f.t), closedForm: r3(tExp), drop: r3(f.drop), closedFormDrop: r3(dExp), speedThere: r3(B.speedAt(round, dist)) };
        }
        return testShot(api, round, dist, dt);
      },
    },
  };
}

// ---- selftest ------------------------------------------------------------------------------------------------------------
// ctx: { g, api, C, check, extra } from runSelfTest (api.js).
export async function ballisticsChecks(ctx) {
  const { g, api, C, check, extra } = ctx;
  const B = g.ballistics;
  const cast = [];
  const dummy = (x, z, props = {}) => { const c = extra('drifter', x, z, { hold: true, hp: 5000, ...props }); cast.push(c); return c; };
  const settle = async (by, dt = 1 / 60, max = 240) => { for (let k = 0; k < max && B.inFlight(by); k++) await api._step(1, dt); };
  const line = clearLine(g, 330);
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };

  try {
    await check('ballistics: the round rows validate (velocity, drag, tracerEvery) and every gun and fire mode fires a round that has a row', async () => {
      const bad = validateRounds();
      const missing = [];
      for (const [k, w] of Object.entries(WEAPONS)) {
        if (!ROUNDS[B.rowKey(w)]) missing.push(k);
        for (const m of w.modes ?? []) if (!roundRow(m.cal ?? m.round ?? m.ammo ?? B.rowKey(w)) || (m.ammo && !AMMO_ITEM[m.ammo])) missing.push(`${k}.${m.id}`);
      }
      const broken = validateRounds({ x: { velocity: -1, drag: 0.5, tracerEvery: 1.5, tracerW: 0.05, tracerLen: 3, speed: 3 } });
      return !bad.length && !missing.length && broken.length >= 3 ? true : JSON.stringify({ bad, missing, broken });
    });

    await check('ballistics: a 300 m rifle round lands later than a 30 m one by the closed-form flight time (within a frame), and both hit the man', async () => {
      if (!line) return 'no clear 330 m line on the flats';
      const a = await testShot(api, 'rifle', 30, 1 / 60, line), b = await testShot(api, 'rifle', 300, 1 / 60, line);
      const dt = 1 / 60, gap = b.flightTime - a.flightTime, gapExp = b.closedForm - a.closedForm;
      const ok = a.hit === 'char' && b.hit === 'char' && a.hurt && b.hurt && Math.abs(a.flightTime - a.closedForm) <= dt + 1e-3 && Math.abs(b.flightTime - b.closedForm) <= dt + 1e-3 && Math.abs(gap - gapExp) <= dt + 1e-3 && gap > 0.3;
      return ok ? true : JSON.stringify({ a, b, gap: r3(gap), gapExp: r3(gapExp) });
    });

    await check('ballistics: a rifle round fired level is 1.38 m under its line at 400 m (the closed form, within 2%), the same at 20 fps and 144 fps', async () => {
      const exp = B.dropAt('rifle', 400), tExp = B.flightTime('rifle', 400);
      const lo = ghostFlight(g, 'rifle', 400, 1 / 20), hi = ghostFlight(g, 'rifle', 400, 1 / 144);
      const ok = lo && hi && exp > 1 && Math.abs(lo.drop - exp) / exp < 0.02 && Math.abs(hi.drop - exp) / exp < 0.02 && Math.abs(lo.t - tExp) / tExp < 0.01 && Math.abs(hi.t - tExp) / tExp < 0.01 && Math.abs(lo.drop - hi.drop) / exp < 0.01;
      return ok ? true : JSON.stringify({ exp: r3(exp), tExp: r3(tExp), lo, hi });
    });

    await check('ballistics: no round passes a poured-concrete wall at any frame rate (rifle and pistol, dt 1/20 and 1/144): the man behind it is untouched and every round stops in the wall', async () => {
      if (!line) return 'no clear line on the flats';
      const M = g.materials, x = line.x + 40, z = line.z;
      for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - x, c.z - z) < 40) g.removeChar(c);
      await C('teleport', { x: x - 20, z }); await api._step(2);
      const wall = M.build('concrete_wall', x, z, 'z', 3), man = dummy(x + 2.5, z), hp0 = man.hp, rows = [];
      try {
        for (const dt of [1 / 20, 1 / 144]) for (const key of ['rifle', 'pistol']) for (let k = 0; k < 3; k++) {
          const p = B.launch(g.player, x - 18, z + (k - 1) * 0.3, 1, 0, 60, 40, key, key), id = p.id;
          for (let n = 0; n < 400 && p.live && p.id === id; n++) await api._step(1, dt);
          rows.push({ dt: Math.round(1 / dt), key, kind: p.id === id && !p.live ? p.hitKind : 'lost', x: r3(p.x - x) }); // the round's own slot (B.last is whoever landed last)
        }
      } finally { M.unbuild(wall); }
      const ok = man.hp === hp0 && rows.every((r) => r.kind === 'wall' && r.x < 0.3 && r.x > -0.3);
      return ok ? true : JSON.stringify({ hp: [hp0, man.hp], rows });
    });

    await check('ballistics: a round fired out of a moving car\'s window carries the car\'s velocity (muzzle velocity plus the car\'s, its line bent forward)', async () => {
      if (!line) return 'no clear line on the flats';
      await C('teleport', { x: line.x + 60, z: line.z }); await api._step(2);
      const r = await C('spawnVehicle', { type: 'interceptor', x: line.x + 60, z: line.z, heading: Math.PI / 2 });
      const v = api.findVeh(r.id ?? r.vehicle?.id) ?? g.vehicles[g.vehicles.length - 1];
      g.enterVehicle(v); await api._step(2);
      await C('give', { pistol: 30 });
      v.h = Math.PI / 2; v.vx = 22; v.vz = 0; // rolling east at 22 m/s
      const p = g.player, n0 = B.stats.launched;
      const fired = g.carCombat.fireFromVehicle(p, v, 'pistol', 0, { ...WEAPONS.pistol, spread: 0, pellets: 1 }); // out of the right-hand window, due +z
      const rd = B.pool[(B.next - 1 + B.cap) % B.cap];
      // The gun's line is where fireFromVehicle turned the shooter (p.face, its moving-car wobble in it); the muzzle
      // velocity along that line plus the car's is what the round must carry.
      const V = roundRow('pistol').velocity, vx = rd.dx * rd.sp, vz = rd.dz * rd.sp, ex = Math.sin(p.face) * V + 22, ez = Math.cos(p.face) * V;
      const off = Math.hypot(vx - ex, vz - ez), still = Math.hypot(vx - Math.sin(p.face) * V, vz - Math.cos(p.face) * V);
      const bend = (Math.atan2(vx, vz) - p.face) * 180 / Math.PI;
      g.exitVehicle(true); g.vehiclesSys.remove?.(v);
      const ok = fired && B.stats.launched === n0 + 1 && off < 0.5 && still > 20 && bend > 2 && rd.shooter === p;
      return ok ? true : JSON.stringify({ fired, launched: B.stats.launched - n0, off: r3(off), still: r3(still), bend: r3(bend), face: r3(p.face) });
    });

    await check('ballistics: an AI shooter leads a man running across its line (with what it sees) and hits him more often than it does without the lead', async () => {
      if (!line) return 'no clear line on the flats';
      const x = line.x + 120, z = line.z;
      for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - x, c.z - z) < 60) g.removeChar(c);
      await C('teleport', { x: x - 30, z: z - 30 }); await api._step(2);
      const run = async (lead) => {
        const sh = dummy(x, z, { faction: 'raider', weapon: 'pistol' }), tg = dummy(x + 35, z - 12);
        sh.leadErr = LEAD.err;
        const steady = { ...WEAPONS.pistol, spread: 0.006, pellets: 1 };
        let hits = 0, shots = 0, vz = 7, cool = 0.4;
        sh._lead = null;
        for (let f = 0; f < 60 * 14 && shots < 24; f++) {
          tg.z += vz / 60; if (tg.z > z + 12) vz = -7; if (tg.z < z - 12) vz = 7; // back and forth across the line at 7 m/s
          g.ai.watch(sh, tg, 1 / 60);
          cool -= 1 / 60;
          if (cool <= 0 && Math.abs(tg.z - z) < 8) {
            const ang = lead ? g.ai.leadAngle(sh, tg, tg.x, tg.z, 'pistol') : Math.atan2(tg.x - sh.x, tg.z - sh.z);
            const hp = tg.hp; sh.face = ang;
            if (g.combat.fire(sh, 'pistol', ang, steady)) { shots++; for (let n = 0; n < 30 && B.inFlight(sh); n++) { tg.z += vz / 60; g.ai.watch(sh, tg, 1 / 60); await api._step(1); f++; } if (tg.hp < hp) hits++; }
            cool = 0.35;
          }
          await api._step(1);
        }
        g.removeChar(sh); g.removeChar(tg);
        return { hits, shots };
      };
      const led = await run(true), flat = await run(false);
      const ok = led.shots >= 16 && flat.shots >= 16 && led.hits / led.shots > 0.6 && led.hits > flat.hits * 1.5 + 2;
      return ok ? true : JSON.stringify({ led, flat });
    });

    await check('ballistics: law 6 - out of sight, a shooter aims where the man was heading when it last saw him, not where he really went', async () => {
      if (!line) return 'no clear line on the flats';
      const x = line.x + 200, z = line.z;
      const sh = dummy(x, z, { faction: 'raider', weapon: 'pistol' }), tg = dummy(x + 25, z - 6);
      sh._lead = null;
      for (let f = 0; f < 60; f++) { tg.z += 6 / 60; g.ai.watch(sh, tg, 1 / 60); await api._step(1); } // seen running +z at 6 m/s for 1 s
      const seenZ = tg.z;
      for (let f = 0; f < 30; f++) { tg.z -= 6 / 60; await api._step(1); } // behind cover he doubles back for 0.5 s: unseen, no watch
      const S = g.ai.seenAt(sh, tg, tg.x, tg.z), ang = Math.atan2(S.x - sh.x, S.z - sh.z);
      const believed = seenZ + 6 * 0.5, truth = tg.z;
      const ok = Math.abs(S.z - believed) < 0.6 && Math.abs(S.z - truth) > 4 && Math.abs(ang - Math.atan2(tg.x - sh.x, truth - sh.z)) > 0.1;
      return ok ? true : JSON.stringify({ S: { x: r3(S.x - x), z: r3(S.z - z) }, believed: r3(believed - z), truth: r3(truth - z) });
    });

    await check('ballistics: one seed flies one flight: a shotgun pull replayed from its shard record (seed, muzzle, heading) lays its eight pellets on the same lines', async () => {
      const p = g.player, ang = 0.7;
      const lines = () => { const out = []; for (let k = 0; k < 8; k++) { const rd = B.pool[(B.next - 8 + k + B.cap) % B.cap]; out.push(Math.atan2(rd.dx, rd.dz)); } return out; };
      if (p.inVehicle) g.exitVehicle(true);
      g.combat.fire(p, 'shotgun', ang); const a = lines(), rec = B.record(1)[0];
      B.reseed(rec.seed); g.combat.fire(p, 'shotgun', ang, undefined, rec.seed); const b = lines();
      const same = a.every((v, k) => Math.abs(v - b[k]) < 1e-9), spread = Math.max(...a) - Math.min(...a);
      await settle(p);
      return rec && rec.pellets === 8 && same && spread > 0.02 ? true : JSON.stringify({ rec, a: a.map(r3), b: b.map(r3), spread: r3(spread) });
    });

    await check('ballistics: the sawn-off loads BUCK, BIRD or SLUG from its own box in your pack: switching shell works the loaded ones back into the pack and the gun reloads the new kind; birdshot flies twice the pellets on its own row, the slug one on the slug row', async () => {
      const p = g.player, I = g.inv, A = g.arms;
      if (p.inVehicle) g.exitVehicle(true);
      const keep = { cur: I.current, weapons: [...I.weapons], mag: I.mag.shotgun, mode: A.mode.shotgun, shells: I.ammo.shells, birdshot: I.ammo.birdshot, slug: I.ammo.slug };
      const log = [];
      const load = async () => { g.reload(); for (let f = 0; f < 240 && (I.mag.shotgun ?? 0) < WEAPONS.shotgun.mag; f++) await api._step(1); };
      const shot = () => { g.combat.fire(p, 'shotgun', 0.4, A.row('shotgun')); const rec = B.record(1)[0], rd = B.pool[(B.next - 1 + B.cap) % B.cap]; return { pellets: rec?.pellets, key: rd.key }; };
      try {
        if (!I.weapons.includes('shotgun')) I.weapons.push('shotgun');
        I.current = 'shotgun'; A.setMode('shotgun', 'buck');
        I.ammo.shells = 10; I.ammo.birdshot = 10; I.ammo.slug = 4; I.mag.shotgun = 2; p.reloading = 0; p.cool = 0;
        const buck = shot();
        A.setMode('shotgun', 'bird');
        const back = { mag: I.mag.shotgun, shells: I.ammo.shells };
        await load();
        const bird = { mag: I.mag.shotgun, left: I.ammo.birdshot, ...shot() };
        A.setMode('shotgun', 'slug');
        await load();
        const slug = { mag: I.mag.shotgun, left: I.ammo.slug, birdBack: I.ammo.birdshot, ...shot() };
        log.push({ buck, back, bird, slug });
        const ok = buck.pellets === 8 && buck.key === calOf('shells') && back.mag === 0 && back.shells === 12
          && bird.mag === 2 && bird.left === 8 && bird.pellets === 16 && bird.key === calOf('birdshot')
          && slug.mag === 2 && slug.left === 2 && slug.birdBack === 10 && slug.pellets === 1 && slug.key === calOf('slug');
        return ok ? true : JSON.stringify(log);
      } finally {
        A.mode.shotgun = keep.mode; I.mag.shotgun = keep.mag; I.ammo.shells = keep.shells; I.ammo.birdshot = keep.birdshot; I.ammo.slug = keep.slug;
        I.weapons.length = 0; I.weapons.push(...keep.weapons); I.current = keep.cur; p.reloading = 0;
        await settle(p);
      }
    });
  } finally {
    for (const c of cast) if (g.chars.includes(c)) g.removeChar(c);
    B.on = true;
  }
}
