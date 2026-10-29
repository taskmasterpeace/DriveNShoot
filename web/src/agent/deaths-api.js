// THE DEATH LIBRARY and ZOMBIE FUN for agents (docs/design/WEB_DEATHS.md; rows data/deaths.js, data/hordes.js; systems
// deaths.js, migrations.js, zombies.js): the `death` command (play any death, list the library, read a body), the
// `horde action=migrate|where|clear` extension of the horde command, and the lane's named selftest checks (each returns
// true or a JSON diagnostic). Deaths are staged (who dies, of what, from where); everything after the kill is the real path.
import { DEATH_CLIPS, SEVER, HOOD, validateDeaths } from '../data/deaths.js';
import { UAL_CLIPS } from '../data/deathclips-ual.js';
import { BREED_ANSWERS, WARNINGS, MIGRATION, ECHO_MIND, validateHordes } from '../data/hordes.js';
import { CLIPS } from '../systems/deaths.js';
import { outfit } from '../systems/characters.js';

const r1 = (v) => Math.round(v * 10) / 10;
export const DEATH_TYPES = Object.keys(DEATH_CLIPS);

// Kill c by `type` (a clip id): the cause, the part and the direction that clip is picked for. by: who did it.
export function stageDeath(g, c, type, by) {
  const dx0 = c.x - by.x, dz0 = c.z - by.z, d = Math.hypot(dx0, dz0) || 1, dx = dx0 / d, dz = dz0 / d;
  c.face = Math.atan2(-dx, -dz); // facing whoever does it
  if (type === 'back') c.face = Math.atan2(dx, dz); // its back to them
  const D = (dmg, cause, part) => g.combat.damage(c, dmg, by, dx, dz, cause, part);
  switch (type) {
    case 'front': D(999, 'bullet', 'torso'); break;
    case 'back': D(999, 'bullet', 'torso'); break;
    case 'head': D(999, 'bullet', 'head'); break;
    case 'leg': D(999, 'bullet', 'legs'); break;
    case 'blast': D(220, 'explosion', null); break;
    case 'burn': c.burning = 1; g.combat.damage(c, 999, null, 0, 0, 'fire'); break;
    case 'blunt': D(999, 'bash', 'head'); break;
    case 'blade': c._blade = true; D(999, 'bash', 'torso'); c._blade = false; break;
    default: return false;
  }
  return !c.alive;
}

export function deathsCommands(api, need) {
  const g = api.g, P = () => g.player;
  return {
    death: {
      group: 'world', desc: 'THE DEATH LIBRARY (docs/design/WEB_DEATHS.md; rows data/deaths.js; systems/deaths.js): every death plays a CLIP by how it happened (front or back shot, head, leg-to-crawl, blast, run over, burned, blunt, blade) on the shared pose solver, then blends into a cheap verlet RAGDOLL that settles on what is really under it (land, stairs, a truck bed, a car hood) and is left to death rites to rot. action=list (default): the library table (clip, source, licence, frames, rag/end, times played), the counters (deaths, settled, on vehicles, limbs severed, headshots, crawlers from a severed leg, pools) and every body still dying. action=play type=<clip> [x,z] [faction=drifter|infected]: someone dies that death there (default 6 m east of you; run over: a car comes at them at speed=16 m/s); returns the body. action=view id=: a body (phase clip|rag|still, clip time, airborne, the vehicle it lies on, its lowest and highest point, how far any point floats over what is under it, link stretch, lost limbs, how far it went, over-the-hood measure). action=points id=: its 12 world points.',
      args: { action: { type: 'string', default: 'list', enum: ['list', 'play', 'view', 'points'] }, type: { type: 'string', enum: DEATH_TYPES }, id: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' }, faction: { type: 'string', default: 'drifter', enum: ['drifter', 'infected'] }, speed: { type: 'number', default: 16 } },
      run: async ({ action, type, id, x, z, faction, speed }) => {
        const D = g.deaths;
        if (action === 'view' || action === 'points') {
          const c = api.findChar(id); need(c?.rag, `${id} is not a body the death library is holding`);
          return action === 'view' ? D.view(c) : { id: c.id, points: D.points(c) };
        }
        if (action === 'play') {
          need(DEATH_TYPES.includes(type), `type= one of ${DEATH_TYPES.join(', ')}`);
          const at = { x: x ?? P().x + 6, z: z ?? P().z };
          const c = faction === 'infected' ? g.zombies.spawn(at.x, at.z, false) : g.addChar({ x: at.x, z: at.z, faction: 'drifter', weapon: null, hp: 100, colors: outfit('drifter'), name: 'Drifter', flag: g.randomFlag(Math.random) });
          need(c, 'character budget full');
          c.hold = true;
          if (type === 'runover') {
            // the car at the bumper, at speed: the hit is the run-over's own (cause vehicle), the throw is the real path
            const h = Math.atan2(at.x - P().x, at.z - P().z), v = api.findVeh((await api.call('spawnVehicle', { type: 'interceptor', x: at.x - Math.sin(h) * 2.6, z: at.z - Math.cos(h) * 2.6, heading: h, ai: 'none' })).id);
            v.vx = Math.sin(h) * speed; v.vz = Math.cos(h) * speed;
            g.combat.damage(c, 999, null, Math.sin(h), Math.cos(h), 'vehicle');
            return { id: c.id, type, vehicle: v.id, body: D.view(c) };
          }
          stageDeath(g, c, type, P());
          return { id: c.id, type, body: D.view(c) };
        }
        return {
          library: Object.values(CLIPS).map((C) => ({ id: C.id, name: C.row.name, src: C.src, licence: C.row.licence, frames: C.n, dur: r1(C.dur), rag: C.rag, end: C.end, played: D.byClip[C.id] })),
          problems: validateDeaths(DEATH_CLIPS, UAL_CLIPS), counts: { ...D.counts },
          dying: D.bodies.filter((c) => c.rag && c.rag.phase !== 'still').slice(0, 20).map((c) => D.view(c)),
          bodies: D.bodies.length, severedPieces: D.pieces.filter((p) => p.on).length,
        };
      },
    },
  };
}

// The horde command's migration verbs (api.js horde: action=migrate|where|clear).
export function hordeAction(api, need, { action, x, z, size, dir, road, ahead }) {
  const g = api.g, M = g.migrations;
  need(M, 'no migrations system');
  if (action === 'migrate') {
    const m = M.start({ x, z, size, dir, road, ahead });
    need(m, 'no highway (or no overrun) here');
    return { horde: m.H.id, road: m.road, x: Math.round(m.H.x), z: Math.round(m.H.z), size: m.H.strength, dir: m.dir, walksTo: Math.round(m.end) };
  }
  if (action === 'clear') { const n = M.list.length; M.clear(); return { ended: n }; }
  return { migrations: M.view(), rows: MIGRATION, counts: { ...M.counts }, problems: validateHordes() };
}

// ---- the selftest (docs/design/WEB_DEATHS.md §8) -------------------------------------------------------------------------
export async function deathsChecks({ g, api, C, check, stage, hush }) {
  const D = g.deaths, Z = g.zombies, P = () => g.player;
  const FLATS = { x: 250, z: 430 };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const clearRound = (x, z, r) => { for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - x, c.z - z) < r) g.removeChar(c); for (const v of [...g.vehicles]) if (v !== P().inVehicle && Math.hypot(v.x - x, v.z - z) < r) g.vehiclesSys.remove(v); };
  const flats = async () => { await stage(); await C('teleport', FLATS); clearRound(FLATS.x, FLATS.z, 140); g.godMode = true; await C('step', { seconds: 0.2 }); };
  const gone = (...cs) => { for (const c of cs) if (c && g.chars.includes(c)) g.removeChar(c); };
  const drifter = (x, z) => { const c = g.addChar({ x, z, faction: 'drifter', weapon: null, hp: 100, colors: outfit('drifter'), name: 'Drifter', flag: g.randomFlag(Math.random) }); if (c) c.hold = true; return c; };
  const settle = async (c, max = 9) => { for (let t = 0; t < max && c.rag?.phase !== 'still'; t += 0.25) await C('step', { seconds: 0.25 }); return D.view(c); };

  await check('deaths: the library validates - nine death clips (front, back, head, leg, blast, run over, burned, blunt, blade), each with its licence, none proprietary; the breed answers are three different plays; a broken row is caught', async () => {
    const bad = validateDeaths(DEATH_CLIPS, UAL_CLIPS), hb = validateHordes();
    const broken = validateDeaths({ ...DEATH_CLIPS, head: undefined }, UAL_CLIPS).length > 0 && validateDeaths(DEATH_CLIPS, { ...UAL_CLIPS, ual_death01: { ...UAL_CLIPS.ual_death01, license: 'Proprietary-Internal' } }).length > 0;
    const same = validateHordes({ ...BREED_ANSWERS, echo: { ...BREED_ANSWERS.echo, answer: 'crowd' } }).length > 0;
    const baked = Object.values(CLIPS).filter((c) => c.src !== 'proc').map((c) => UAL_CLIPS[c.src].license);
    return !bad.length && !hb.length && broken && same && DEATH_TYPES.length === 9 && baked.length >= 2 && baked.every((l) => l === 'CC0-1.0') ? true : JSON.stringify({ bad, hb, broken, same, baked });
  });

  await check('deaths: every death type plays its own clip and ends in a settled ragdoll - resting on what is under it (no body hangs > 0.15 m in the air, no point sinks), links held, frozen, handed to death rites', async () => hush(async () => {
    await flats();
    const out = {}, made = [];
    try {
      for (const type of DEATH_TYPES) {
        const p = P(), at = { x: p.x + 8, z: p.z + (DEATH_TYPES.indexOf(type) - 4) * 7 };
        const r = await C('death', { action: 'play', type, x: at.x, z: at.z });
        const c = api.findChar(r.id); made.push(c);
        const v = await settle(c, 10);
        out[type] = v ? { clip: v.clip, cut: v.cut, phase: v.phase, gap: v.restGap, hang: v.hang, stretch: v.stretch, low: v.lowY, on: v.onVehicle } : null;
        if (r.vehicle) { const car = api.findVeh(r.vehicle); if (car) g.vehiclesSys.remove(car); }
      }
      const bad = Object.entries(out).filter(([k, v]) => !v || v.clip !== k || v.cut > 0.03 || v.phase !== 'still' || v.gap > 0.15 || v.stretch > 0.15);
      return bad.length ? JSON.stringify(out) : true;
    } finally { gone(...made); g.godMode = false; }
  }));

  await check('deaths: a headshot drops one of the infected clean - one round to the head ends a full-hp shambler on that hit, and it folds where it stood (< 0.8 m); a body round of the same weight does not', async () => hush(async () => {
    await flats();
    const p = P(), a = Z.spawn(p.x + 10, p.z, false), b = Z.spawn(p.x + 10, p.z + 6, false);
    try {
      a.zSpeed = 0; b.zSpeed = 0; const at = { x: a.x, z: a.z };
      a.hitPart = 'head'; g.combat.damage(a, 20, p, 1, 0, 'bullet');
      b.hitPart = 'torso'; g.combat.damage(b, 20, p, 1, 0, 'bullet');
      const dropped = !a.alive && a.rag?.id === 'head', torso = b.alive;
      const v = await settle(a, 8);
      return dropped && torso && v.phase === 'still' && dist(a, at) < 0.8 ? true : JSON.stringify({ dropped, torso, v, moved: r1(dist(a, at)) });
    } finally { gone(a, b); g.godMode = false; }
  }));

  await check('deaths: a leg-shot infected becomes a crawler - a heavy round to the leg takes it off (it is drawn without it, the limb lies on the ground), and it crawls on, still closing on you', async () => hush(async () => {
    await flats();
    const p = P(), s = Z.spawn(p.x + 14, p.z, false), ch0 = SEVER.legs.chance;
    try {
      SEVER.legs.chance = 1; // the row's knob: every heavy leg round takes the leg (the battery must not roll for it)
      s.hitPart = 'legs'; g.combat.damage(s, 40, p, 1, 0, 'bullet');
      SEVER.legs.chance = ch0;
      const off = (s.lost & 12) !== 0, piece = D.pieces.some((q) => q.on && q.age < 1);
      const d0 = dist(s, p);
      s.ztarget = p;
      await C('step', { seconds: 4 });
      const closed = d0 - dist(s, p);
      return off && piece && s.alive && s.crawl && s.prone && closed > 0.5 ? true : JSON.stringify({ off, lost: s.lost, piece, alive: s.alive, crawl: s.crawl, closed: r1(closed) });
    } finally { SEVER.legs.chance = ch0; gone(s); g.godMode = false; }
  }));

  await check('deaths: run over at speed, the body goes up and OVER the hood (thrown higher than the hood, carried back past the windscreen), lands on the road behind, and smears nothing while it flies', async () => hush(async () => {
    await flats();
    const p = P(), c = drifter(p.x + 20, p.z);
    const r = await C('spawnVehicle', { type: 'interceptor', x: p.x + 8, z: p.z, heading: Math.PI / 2, ai: 'none' });
    const v = api.findVeh(r.id);
    try {
      await C('enterVehicle', { id: v.id, force: true });
      v.h = Math.PI / 2; v.vx = 18; v.vz = 0;
      const sm0 = g.blood.stats.smear;
      let air = 0, smearAir = 0;
      for (let t = 0; t < 1.6 && c.alive; t += 0.05) await C('drive', { throttle: 1, seconds: 0.05 });
      for (let t = 0; t < 2.5; t += 1 / 60) { const s0 = g.blood.stats.smear, a0 = !!c.rag?.air; await C('drive', { throttle: 0.6, seconds: 1 / 60 }); if (a0 && c.rag?.air) { air++; smearAir += g.blood.stats.smear - s0; } }
      g.exitVehicle(true);
      const vw = await settle(c, 8), X = c.rag?.cross;
      const over = !!X && (X.overTop || X.aMin < -X.len / 2);
      return !c.alive && vw?.clip === 'runover' && vw.maxLift > 1.0 && over && vw.airT > 0.15 && smearAir === 0 && vw.phase === 'still' ? true : JSON.stringify({ alive: c.alive, vw, air, smearAir, smear: g.blood.stats.smear - sm0 });
    } finally { if (P().inVehicle) g.exitVehicle(true); g.vehiclesSys.remove(v); gone(c); g.godMode = false; }
  }));

  await check('deaths: a body dying on a flight of stairs settles ON the stairs - every point rests on its own step, no limb or torso cuts through a tread (segments probed along their length), the body spread over more than one step', async () => hush(async () => {
    await stage();
    await C('teleport', { x: 0, z: -40 });
    const S = g.storeys.list.find((s) => s.flights[0] && s.flights[0].len > 2.5);
    if (!S) return 'no storeyed building with a street flight on the island';
    const f = S.flights[0], mx = (f.minX + f.maxX) / 2, mz = (f.minZ + f.maxZ) / 2;
    await C('teleport', { x: mx + (f.ax === 'x' ? 0 : 3), z: mz + (f.ax === 'x' ? 3 : 0) });
    const c = drifter(mx, mz);
    try {
      c.gy = g.stunts.heightAt(mx, mz, (f.from + f.to) / 2); c.storey = S;
      const mid = c.gy;
      stageDeath(g, c, 'front', { x: mx + (f.ax === 'x' ? f.u * 3 : 0), z: mz + (f.ax === 'z' ? f.u * 3 : 0) });
      const v = await settle(c, 9);
      const ys = []; for (let i = 0; i < 12; i++) ys.push(c.rag.P[i * 3 + 1]);
      const spread = Math.max(...ys) - Math.min(...ys);
      return v.phase === 'still' && v.restGap < 0.15 && v.hang < 0.6 && v.cut < 0.03 && mid > 0.4 && spread > 0.25 && v.lowY > 0.1 ? true : JSON.stringify({ v, mid: r1(mid), spread: r1(spread), f: { from: f.from, to: f.to, len: f.len } });
    } finally { gone(c); }
  }));

  await check('deaths: a body killed over a pickup lands IN its bed (on the deck floor, not the road) and rides with it when it drives off', async () => hush(async () => {
    await flats();
    const p = P(), r = await C('spawnVehicle', { type: 'pickup', x: p.x + 10, z: p.z, heading: 0, ai: 'none' }), v = api.findVeh(r.id);
    await C('step', { seconds: 0.3 });
    const bx = v.x - Math.sin(v.h) * 1.4, bz = v.z - Math.cos(v.h) * 1.4, c = drifter(bx, bz);
    try {
      stageDeath(g, c, 'front', { x: bx + 4, z: bz });
      const vw = await settle(c, 8);
      const floor = g.decks.floorYCached(v, v.deck), low = vw.lowY;
      const x0 = c.x;
      v.vx = 4; v.vz = 0; for (let t = 0; t < 1.5; t += 0.1) { v.vx = 4; await C('step', { seconds: 0.1 }); }
      const rode = c.x - x0;
      return vw.onVehicle === v.id && low > floor - 0.05 && rode > 2 ? true : JSON.stringify({ vw, floor: r1(floor), rode: r1(rode) });
    } finally { gone(c); g.vehiclesSys.remove(v); g.godMode = false; }
  }));

  await check('infected fun: a car ploughs through 20 shamblers (it gets through, none hang on) but 3 sprinters scream, leap on and swarm it', async () => hush(async () => {
    await flats();
    const p = P(), made = [];
    const run = async (n, runner) => {
      const r = await C('spawnVehicle', { type: 'interceptor', x: p.x, z: p.z, heading: Math.PI / 2, ai: 'none' }), v = api.findVeh(r.id);
      await C('enterVehicle', { id: v.id, force: true });
      for (let i = 0; i < n; i++) { const c = Z.spawn(v.x + 22 + (i % 5) * 4, v.z + (Math.floor(i / 5) - 1.5) * 1.4 + (runner ? (i % 2 ? 3 : -3) : 0), runner); if (c) { c.zSpeed = runner ? c.zSpeed : 0.3; made.push(c); } }
      g.zombies.enabled = true;
      v.h = Math.PI / 2; v.vx = 16; v.vz = 0;
      const x0 = v.x;
      let latched = 0;
      for (let t = 0; t < 4; t += 0.1) { await C('drive', { throttle: 1, seconds: 0.1 }); latched = Math.max(latched, v.grabbers?.filter((gr) => gr.c?.faction === 'zombie').length ?? 0); }
      const through = v.x - x0;
      g.zombies.enabled = false;
      g.exitVehicle(true); for (const gr of [...(v.grabbers ?? [])]) if (gr.c) g.carCombat.letGo(gr.c); g.vehiclesSys.remove(v);
      gone(...made); made.length = 0;
      await C('teleport', FLATS);
      return { through: r1(through), latched };
    };
    try {
      const sh = await run(20, false), sp = await run(3, true);
      return sh.through > 45 && sh.latched === 0 && sp.latched >= 2 ? true : JSON.stringify({ shamblers: sh, sprinters: sp });
    } finally { gone(...made); if (P().inVehicle) g.exitVehicle(true); g.godMode = false; }
  }));

  await check('infected fun: the sprinter SCREAMS before it charges (a wind-up you can see and hear), charges along the line it locked, and a step aside makes it run past you', async () => hush(async () => {
    await flats();
    const p = P(), c = Z.spawn(p.x + 14, p.z, true);
    try {
      g.zombies.enabled = true; g.godMode = false; p.hp = p.maxHp ?? 100;
      const hp0 = p.hp;
      Z.burst(c, 'check'); c.ztarget = p; c.zsee = p; c.zhow = 'sight';
      const windup = c.zs.state === 'windup', still = c.speed < 0.2;
      await C('step', { seconds: BREED_ANSWERS.sprinter.windup * 0.5 });
      const reared = c.zs.state === 'windup' && c.handsUp;
      await C('step', { seconds: BREED_ANSWERS.sprinter.windup * 0.6 });
      const charging = c.zs.state === 'burst';
      // the step aside: 3.5 m off its line, the moment it charges
      await C('teleport', { x: p.x, z: p.z + 3.5 });
      let past = false, closest = Infinity;
      for (let t = 0; t < 3 && !past; t += 0.05) { await C('step', { seconds: 0.05 }); closest = Math.min(closest, dist(c, P())); past = past || !!c.zlock?.past; }
      const lost = hp0 - P().hp;
      return windup && still && reared && charging && past && closest > 1.3 && lost === 0 ? true : JSON.stringify({ windup, still, reared, charging, past, closest: r1(closest), lost, screams: Z.counts.screams });
    } finally { g.zombies.enabled = false; gone(c); g.godMode = false; }
  }));

  await check('infected fun: an Echo COPIES a gunshot it heard, and shamblers that never heard the shot walk to the copy (to the Echo); a knife-quiet kill near it copies nothing', async () => hush(async () => {
    await flats();
    const p = P(), e = Z.spawnKind('echo', p.x + 45, p.z), sh = [Z.spawn(p.x + 115, p.z - 4, false), Z.spawn(p.x + 115, p.z + 4, false)];
    try {
      g.zombies.enabled = true;
      for (const s of sh) { s.timer = 99; s.wx = s.x; s.wz = s.z; s.face = -Math.PI / 2; }
      const c0 = Z.counts.echoCopies ?? 0;
      g.noise(p.x, p.z, 3, p); // a knife-quiet kill: too soft to copy
      await C('step', { seconds: 2 });
      const quiet = (Z.counts.echoCopies ?? 0) === c0;
      g.noise(p.x, p.z, 45, p); // a revolver shot
      const heardShot = sh.map((s) => s.zm?.src ?? null);
      await C('step', { seconds: BREED_ANSWERS.echo.delay + 0.6 });
      const copied = (Z.counts.echoCopies ?? 0) > c0;
      const mem = sh.map((s) => (s.zm?.src ? { src: s.zm.src, toEcho: r1(Math.hypot(s.zm.x - e.x, s.zm.z - e.z)) } : null));
      const d0 = sh.map((s) => dist(s, e));
      await C('step', { seconds: 6 });
      const closed = sh.map((s, i) => r1(d0[i] - dist(s, e)));
      const ok = quiet && heardShot.every((x) => x === null) && copied && mem.every((m) => m && m.src === 'echo' && m.toEcho < 12) && closed.every((x) => x > 3);
      return ok ? true : JSON.stringify({ quiet, heardShot, copied, mem, closed });
    } finally { g.zombies.enabled = false; gone(e, ...sh); g.godMode = false; }
  }));

  // THE SMART ECHO (systems/echomind.js). Seen: inside your view cone (where you aim, ECHO_MIND.fov), inside ECHO_MIND.seen m,
  // a clear line - the truth, measured here, not the Echo's model of it.
  const inView = (e) => { const p = P(), d = dist(e, p); if (d > ECHO_MIND.seen) return false; const f = Math.atan2(g.aim.x - p.x, g.aim.z - p.z), a = Math.atan2(e.x - p.x, e.z - p.z); let da = Math.abs(a - f) % (Math.PI * 2); if (da > Math.PI) da = Math.PI * 2 - da; return da < ECHO_MIND.fov * Math.PI / 180 && g.sees(p, e); };
  const mindOf = (e) => Z.minds.view(e);

  await check('infected fun: a smart Echo that knows where you are stalks you without once stepping into your view (you stand still: anything that puts it in sight would be its own doing), closes in behind you, and slips away the moment you turn to it', async () => hush(async () => {
    await flats();
    const p = P(); g.aimOverride = { x: p.x + 20, z: p.z };
    const e = Z.spawnKind('echo', p.x - 21, p.z + 5);
    try {
      e.face = Math.atan2(p.x - e.x, p.z - e.z);
      Z.remember(e, p.x, p.z, 'sound', p); // it heard you
      g.zombies.enabled = true;
      let seenT = 0, d0 = dist(e, p), dMin = d0, states = new Set();
      for (let t = 0; t < 12; t += 0.1) { await C('step', { seconds: 0.1 }); if (inView(e)) seenT += 0.1; dMin = Math.min(dMin, dist(e, p)); states.add(mindOf(e).state); }
      const before = dist(e, p);
      const seq0 = g.eventSeq;
      g.aimOverride = { x: e.x, z: e.z }; // you turn to it
      let hid = false;
      for (let t = 0; t < 3; t += 0.1) { await C('step', { seconds: 0.1 }); hid = hid || g.events.some((v) => v.seq > seq0 && v.type === 'echoMind' && v.id === e.id && v.state === 'hide' && v.why === 'faced'); }
      const after = dist(e, p);
      const ok = seenT === 0 && states.has('stalk') && dMin < d0 - 4 && hid && after > before + 3;
      return ok ? true : JSON.stringify({ seenT: r1(seenT), states: [...states], d0: r1(d0), dMin: r1(dMin), hid, before: r1(before), after: r1(after), mind: mindOf(e) });
    } finally { g.aimOverride = null; g.zombies.enabled = false; gone(e); g.godMode = false; }
  }));

  await check('infected fun: a smart Echo that saw you walking to a door waits in ambush at that door (one it has seen itself), calling the dead there; an Echo that never saw that door does not wait at it', async () => hush(async () => {
    await stage(); await C('teleport', { x: 0, z: -40 });
    const n = g.nav.foot, p0 = P();
    // a door with open street out its front to 40 m, and a lane 6 m to one side of that
    const D = g.interiors.doors.filter((d) => !d.ug && Math.hypot(d.x - p0.x, d.z - p0.z) < 220).find((d) => [2, 8, 14, 20, 26, 32, 38, 42].every((k) => n.free(d.x + d.nx * k, d.z + d.nz * k) && n.free(d.x + d.nx * k - d.nz * 6, d.z + d.nz * k + d.nx * 6)) && g.los(d.x + d.nx, d.z + d.nz, d.x + d.nx * 42, d.z + d.nz * 42) && g.los(d.x + d.nx * 0.6, d.z + d.nz * 0.6, d.x + d.nx * 24 - d.nz * 6, d.z + d.nz * 24 + d.nx * 6));
    if (!D) return 'no door with 40 m of open street in front of it';
    const at = (k, side = 0) => ({ x: D.x + D.nx * k - D.nz * side, z: D.z + D.nz * k + D.nx * side });
    // you walk toward the door (staged steps), looking at it, then look off to the side, away from both
    const walk = async (e, from, to) => {
      const a = at(from), b = at(to);
      await C('teleport', a); g.godMode = true;
      e.face = Math.atan2(a.x - e.x, a.z - e.z); Z.remember(e, a.x, a.z, 'sound', P()); // it heard you come up the street
      g.aimOverride = { x: D.x, z: D.z };
      const N = 30;
      for (let i = 1; i <= N; i++) { const p = P(); p.x = a.x + (b.x - a.x) * i / N; p.z = a.z + (b.z - a.z) * i / N; p.speed = 1.4; await C('step', { seconds: 0.1 }); }
      P().speed = 0;
      const p = P(); g.aimOverride = { x: p.x + D.nz * 20, z: p.z - D.nx * 20 }; // the -side: away from the Echo's lane and from the door
    };
    let far = null, e = null;
    try {
      await C('teleport', at(30)); clearRound(D.x, D.z, 90); g.zombies.enabled = true;
      // FAR: 40 m out, the door past its sight - it sees you walking that way but has never seen the door
      const fa = at(42, 6);
      far = Z.spawnKind('echo', fa.x, fa.z);
      await walk(far, 36, 26);
      const farKnew = far.em?.known.has(D) ?? false;
      let farTrap = false;
      for (let t = 0; t < 2; t += 0.1) { await C('step', { seconds: 0.1 }); farTrap = farTrap || mindOf(far).door === D.id; }
      const farView = mindOf(far); gone(far); far = null;
      // NEAR: 24 m out, the door in its sight
      const ea = at(24, 6);
      e = Z.spawnKind('echo', ea.x, ea.z);
      await walk(e, 20, 10);
      // a shambler idling 18 m off you, inside the Echo's call of the door (it never heard your walk: it was not there)
      const sa = [at(14, 18), at(18, 14), at(8, 20), at(22, 10)].find((q) => n.free(q.x, q.z)) ?? at(20, 6), sh = Z.spawn(sa.x, sa.z, false); sh.timer = 99; sh.wx = sh.x; sh.wz = sh.z; sh.face = Math.atan2(D.nx, D.nz);
      const knew = e.em?.known.has(D) ?? false;
      let trap = false, there = 99, called = false;
      for (let t = 0; t < 14 && !(trap && there < 2.6 && called); t += 0.25) {
        await C('step', { seconds: 0.25 });
        const v = mindOf(e); trap = v.state === 'ambush' && v.door === D.id; there = r1(Math.hypot(e.x - D.x, e.z - D.z));
        called = called || (sh.zm?.src === 'echo' && Math.hypot(sh.zm.x - D.x, sh.zm.z - D.z) < 5);
      }
      const shv = { alive: sh.alive, in: g.chars.includes(sh), zm: sh.zm ? { src: sh.zm.src, x: r1(sh.zm.x), z: r1(sh.zm.z) } : null, see: sh.zsee?.id ?? null, toEcho: r1(dist(sh, e)), toDoor: r1(Math.hypot(sh.x - D.x, sh.z - D.z)), phraseT: r1(e.phraseT ?? -1) };
      gone(sh);
      const ok = !farKnew && !farTrap && knew && trap && there < 2.6 && called;
      return ok ? true : JSON.stringify({ door: D.id, farKnew, farTrap, farView, knew, trap, there, called, shv, mind: mindOf(e) });
    } finally { g.aimOverride = null; g.zombies.enabled = false; gone(far, e); g.godMode = false; }
  }));

  await check('infected fun: a smart Echo that lost sight of you calls out to lure you - and the call comes from exactly where it stands (its floater and stereo pan at its own x,z), so a sharp player can find it by ear', async () => hush(async () => {
    await flats();
    const p = P(), e = Z.spawnKind('echo', p.x + 28, p.z + 6);
    const seq0 = g.eventSeq;
    try {
      e.face = Math.atan2(e.x - p.x, e.z - p.z); // facing away: it never sees you
      Z.remember(e, p.x, p.z, 'sound', p);
      p.hidden = true; // you went to ground: it knows where you were, it cannot see you
      g.zombies.enabled = true;
      let lure = null, pos = null;
      for (let t = 0; t < 10 && !lure; t += 0.05) { await C('step', { seconds: 0.05 }); lure = g.events.find((v) => v.seq > seq0 && v.type === 'echoLure' && v.id === e.id) ?? null; if (lure) pos = { x: e.x, z: e.z, pan: g.pan(e.x) }; }
      const off = lure ? Math.hypot(lure.x - pos.x, lure.z - pos.z) : null;
      const ok = !!lure && off < 0.3 && Math.abs(lure.pan - pos.pan) < 0.03;
      return ok ? true : JSON.stringify({ lure, pos, off, mind: mindOf(e) });
    } finally { P().hidden = false; g.zombies.enabled = false; gone(e); g.godMode = false; }
  }));

  await check('infected fun: readable warnings - one you cannot see (behind a wall) groans to you before you see it; a crowd of eight on the move kicks up dust, one of them alone does not', async () => hush(async () => {
    await stage();
    await C('teleport', { x: 0, z: -40 });
    const p = P();
    // a spot 30-45 m off with no line of sight from you
    let spot = null;
    for (let a = 0; a < 24 && !spot; a++) for (const r of [32, 38, 44]) { const x = p.x + Math.cos(a / 24 * Math.PI * 2) * r, z = p.z + Math.sin(a / 24 * Math.PI * 2) * r; if (g.nav.foot.free(x, z) && !g.los(p.x, p.z, x, z)) { spot = { x, z }; break; } }
    if (!spot) return 'no hidden spot near the stage';
    const z1 = Z.spawn(spot.x, spot.z, false), made = [z1];
    const seq0 = g.eventSeq, heard = () => g.events.filter((e) => e.seq > seq0 && e.type === 'groanHeard');
    try {
      z1.zSpeed = 0; z1.timer = 99; z1.wx = z1.x; z1.wz = z1.z;
      g.zombies.enabled = true;
      for (let t = 0; t < 8 && !heard().some((e) => e.id === z1.id && !e.seen); t += 0.5) await C('step', { seconds: 0.5 });
      const groan = heard().some((e) => e.id === z1.id && !e.seen);
      g.zombies.enabled = false;
      // dust: a crowd of 8 walking, then one walker
      await C('teleport', FLATS); clearRound(FLATS.x, FLATS.z, 140);
      const M = g.migrations, cd0 = M.counts.crowdDust;
      const crowd = [];
      for (let i = 0; i < 8; i++) { const c = Z.spawn(FLATS.x + 30 + (i % 4) * 1.6, FLATS.z + Math.floor(i / 4) * 1.6, false); c.timer = 99; c.wx = c.x + 40; c.wz = c.z; crowd.push(c); made.push(c); }
      g.zombies.enabled = true;
      await C('step', { seconds: 2 });
      const dusty = M.counts.crowdDust > cd0;
      gone(...crowd);
      const one = Z.spawn(FLATS.x + 30, FLATS.z, false); one.timer = 99; one.wx = one.x + 40; one.wz = one.z; made.push(one);
      const cd1 = M.counts.crowdDust;
      await C('step', { seconds: 2 });
      const lone = M.counts.crowdDust === cd1;
      return groan && dusty && lone ? true : JSON.stringify({ groan, heard: heard().slice(-4), dusty, lone });
    } finally { g.zombies.enabled = false; gone(...made); }
  }));

  await check('hordes: a migration walks the highway on the world clock (on the road, never a jump), and the radio reports it ONLY after a witness with a set has seen it; you hear it on your radio', async () => hush(async () => {
    await stage();
    const M = g.migrations, O = g.citygen?.overrun, k = g.pulls?.k;
    if (!O || !k) return 'no overrun or knowledge in this world';
    const auto = O.auto, mAuto = M.auto; O.auto = false; M.auto = false;
    const W = g.streamer.W, cor = W.i10;
    // you: 3 km off the road, with a radio (in a car)
    const q = cor.project(P().x, P().z), s0 = Math.min(cor.L - 4000, Math.max(4000, q.s));
    const a0 = cor.at(s0);
    await C('teleport', { x: a0.x + a0.nx * 2600, z: a0.z + a0.nz * 2600 });
    const r = await C('spawnVehicle', { type: 'interceptor', x: P().x + 3, z: P().z, heading: 0, ai: 'none' });
    const car = api.findVeh(r.id);
    await C('enterVehicle', { id: car.id, force: true });
    const m = M.start({ x: a0.x, z: a0.z, size: 120, dir: 1, road: 'I-10' });
    const seq0 = g.eventSeq, reports = () => g.events.filter((e) => e.seq > seq0 && e.type === 'hordeReported');
    const witnessId = 'w:check';
    try {
      if (!m) return 'migration did not start';
      // no witness: hours on the clock, it walks, nobody reports
      let maxJump = 0, offRoad = 0, prev = { x: m.H.x, z: m.H.z };
      for (let t = 0; t < 60; t += 2) {
        await C('step', { seconds: 2 });
        maxJump = Math.max(maxJump, Math.hypot(m.H.x - prev.x, m.H.z - prev.z)); prev = { x: m.H.x, z: m.H.z };
        offRoad = Math.max(offRoad, cor.project(m.H.x, m.H.z, 300).d);
      }
      const walked = m.s - s0, before = { reported: m.reported, youKnow: !!k.copyOf('player', m.fact.id), reports: reports().length };
      // a witness ahead on the road: a man with a set, 120 m ahead of it
      const ahead = cor.at(m.s + 120);
      k.holder(witnessId, { name: 'a ham operator', kind: 'person', x: ahead.x + ahead.nx * 30, z: ahead.z + ahead.nz * 30, radio: true });
      let seenAt = null;
      for (let t = 0; t < 90 && !m.reported; t += 2) { await C('step', { seconds: 2 }); if (seenAt === null && m.seen.includes(witnessId)) seenAt = t; }
      const copy = k.copyOf('player', m.fact.id);
      const ok = walked > 60 && walked < 140 && maxJump < 8 && offRoad < MIGRATION.lane && !before.reported && !before.youKnow && before.reports === 0 && seenAt !== null && m.reported && copy?.source.channel === 'radio' && reports().some((e) => e.you);
      return ok ? true : JSON.stringify({ walked: r1(walked), maxJump: r1(maxJump), offRoad: r1(offRoad), before, seenAt, reported: m.reported, copy: copy ? copy.source : null, reports: reports(), seen: m.seen });
    } finally {
      k.drop(witnessId); M.clear(); O.clear(); O.auto = auto; M.auto = mAuto;
      if (P().inVehicle) g.exitVehicle(true); g.vehiclesSys.remove(car);
    }
  }));
}
