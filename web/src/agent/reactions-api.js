// GUNFIRE REACTIONS as COMMANDS rows and selftest checks (docs/design/WEB_GUNFIRE_REACTIONS.md; systems/reactions.js,
// data/reactions.js). buildCommands() spreads reactionsCommands into COMMANDS; runSelfTest calls reactionsChecks.
// Every shot in the checks is a real one (combat.fire: the muzzle, the noise, the hearing); the people are staged.
import { REACT, REACT_ROWS, validateReactions } from '../data/reactions.js';
import { outfit } from '../systems/characters.js';
import { dirWord } from '../systems/reactions.js';

const r1 = (v) => Math.round(v * 10) / 10;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const R2D = 180 / Math.PI;
const ACTIONS = ['summary', 'profile', 'test', 'hear', 'places', 'validate', 'clear'];

// The street scene: who stands where, in a door's frame (a = metres out from the wall along its outward normal, b =
// along the wall), what they are. The shooter stands out in the street and fires away from the building.
export const STREET_CAST = [
  { role: 'deputy', a: 6, b: 14, faction: 'warden', weapon: 'pistol', title: 'deputy', flag: 'US', name: 'Deputy Rhee', temper: 'steady' },
  { role: 'medic', a: 4, b: -10, title: 'medic', occ: 'medic', flag: 'PH', name: 'Doc Abella', temper: 'steady' },
  { role: 'trader', a: 1.6, b: 2.5, title: 'storekeeper', occ: 'storekeeper', flag: 'MX', name: 'Ofelia Vargas', temper: 'steady' },
  { role: 'mother', a: 5, b: -4, title: 'washer', occ: 'washer', flag: 'JM', name: 'Marcia Brown', temper: 'nervous' },
  { role: 'child', a: 7, b: 9, child: true, flag: 'JM', name: 'Little Dev Brown', temper: 'nervous' },
  { role: 'drunk', a: 9, b: -14, title: 'drifter', flag: 'IE', name: 'Old Fennick', temper: 'drunk' },
  { role: 'veteran', a: 3, b: 18, weapon: 'auto', title: 'veteran', occ: 'scout', flag: 'NG', name: 'Sgt. Okafor', temper: 'steady' },
  { role: 'coward', a: 8, b: 3, title: 'porter', flag: 'CA', name: 'Lyle Pruitt', temper: 'coward' },
  { role: 'preacher', a: 2.5, b: -16, title: 'preacher', occ: 'preacher', flag: 'GH', name: 'Brother Mensah', temper: 'devout' },
  { role: 'radio', a: 10, b: -7, title: 'radio operator', occ: 'radio_operator', flag: 'KR', name: 'Min-ji Park', temper: 'steady' },
];
const SHOOTER_AT = { a: 26, b: 0 };

export function reactionsCommands(api, need) {
  const g = api.g, RX = () => g.reactions;
  return {
    react: {
      group: 'world',
      desc: 'GUNFIRE REACTIONS (docs/design/WEB_GUNFIRE_REACTIONS.md, rows in data/reactions.js). A shot is HEARD, never known: each listener gets a loudness, a band (near|mid|far), a bearing with an error that grows with distance and walls, and a guessed distance; '
        + 'their profile (child, parent, lawman, medic, veteran, trader, faithful, wire, hand, armed, civilian), temperament (steady, nervous, brave, coward, drunk, devout, hothead), gun, sleep and the place\'s jumpiness pick the reaction '
        + '(freeze, cover, flee, drop_run, hide (inside, door slammed and barred), hide_low (under a bed), run_kin, look (to the HEARD spot), tend, return_fire (only a shooter in sight), call_in (a fact into the knowledge model), scream (noise for the infected), pray, keep_working, ignore). '
        + 'action=summary (default): stats, who is reacting now, jumpy places, barred doors, the last shot. profile [id=] [r=]: one person (or everyone within r of you): profile, temperament, kin, odds per band, what they are doing. '
        + 'test [x= z=] [seconds=1.2] [keep=false]: stage a street (ten townsfolk by a door: deputy, medic, trader, mother and child, drunk, veteran, coward, preacher, radio operator) and fire ONE real shot; returns every reaction. keep=true leaves them (for screenshots). '
        + 'hear x= z= [gun=pistol]: the hearing alone at that spot (no bullet, no muzzle). places: jumpiness by place. validate: validateReactions. clear: end every reaction (doors unbarred) and remove a staged street.',
      args: { action: { type: 'string', enum: ACTIONS, default: 'summary' }, id: { type: 'string' }, r: { type: 'number', default: 30 }, x: { type: 'number' }, z: { type: 'number' }, seconds: { type: 'number', default: 1.2 }, keep: { type: 'boolean', default: false }, gun: { type: 'string', default: 'pistol' } },
      run: async (a) => {
        const S = RX();
        need(S, 'no reactions system');
        switch (a.action) {
          case 'summary': return S.summary();
          case 'validate': return validateReactions(REACT_ROWS);
          case 'places': return { places: S.summary().places, cell: REACT.jump.cell, halfLife: REACT.jump.halfLife };
          case 'clear': { S.clear(); const n = unstage(g); return { ok: true, removed: n }; }
          case 'hear': { need(a.x !== undefined && a.z !== undefined, 'x= z= of the shot'); const s = S.onShot(a.x, a.z, 45, a.gun, null); return s; }
          case 'profile': {
            if (a.id) { const c = api.findChar(a.id); need(c, `no character ${a.id}`); return S.profileView(c); }
            const p = g.player, out = [];
            for (const c of g.chars) if (c !== p && c.alive && Math.hypot(c.x - p.x, c.z - p.z) <= a.r && S.listens(c, null)) out.push(S.profileView(c));
            return { n: out.length, people: out.slice(0, 30) };
          }
          case 'test': {
            const st = await stageStreet(api, a.x, a.z);
            need(st.door, st.why ?? 'no door to stage at');
            const res = await shootStreet(api, st, a.seconds);
            if (!a.keep) { S.clear(); unstage(g); }
            return res;
          }
          default: need(false, `action one of ${ACTIONS.join('|')}`);
        }
        return null;
      },
    },
  };
}

// ---- staging -------------------------------------------------------------------------------------------------------------
function unstage(g) { let n = 0; for (const c of [...g.chars]) if (c.rxStaged) { g.removeChar(c); n++; } return n; }
const at = (D, a, b) => ({ x: D.x + D.nx * a + D.ux * b, z: D.z + D.nz * a + D.uz * b });

// A street door with room in front for the cast and the shooter (nothing solid where anyone stands, the shooter's line
// to the door open). Near (x, z) if given, else near the player.
export function streetDoor(g, x = g.player.x, z = g.player.z, R = 260) {
  let best = null, bd = R;
  for (const D of g.interiors.doors) {
    if (D.ug || D.broken || D.locked || D.kind === 'stair' || (D.y ?? 0) > 0.5 || D.kind === 'inner') continue;
    const d = Math.hypot(D.x - x, D.z - z);
    if (d >= bd) continue;
    const pts = [...STREET_CAST, SHOOTER_AT].map((s) => at(D, s.a, s.b));
    if (pts.some((p) => g.statics.pointBlocked(p.x, p.z, 0.55))) continue;
    const S = at(D, SHOOTER_AT.a, SHOOTER_AT.b);
    if (!g.los(S.x, S.z, D.x + D.nx * 2, D.z + D.nz * 2)) continue;
    const inside = { x: D.x - D.nx * REACT.inside, z: D.z - D.nz * REACT.inside };
    if (g.statics.pointBlocked(inside.x, inside.z, 0.4)) continue;
    bd = d; best = D;
  }
  return best;
}

export async function stageStreet(api, x, z) {
  const g = api.g;
  unstage(g); g.reactions.clear();
  if (g.player.inVehicle) g.exitVehicle(true);
  const D = streetDoor(g, x, z) ?? streetDoor(g, 0, -40, 900);
  if (!D) return { door: null, why: 'no street door with room in front near you' };
  const S0 = at(D, SHOOTER_AT.a, SHOOTER_AT.b);
  // You watch from across the street, out of everyone's way.
  const P0 = at(D, SHOOTER_AT.a - 4, -22);
  await api.call('teleport', { x: P0.x, z: P0.z });
  await api._step(20);
  // The street cleared of strangers (a resident walking home through the shot would only muddle the read).
  for (const c of [...g.chars]) if (c !== g.player && !c.npc && !c.inVehicle && Math.hypot(c.x - S0.x, c.z - S0.z) < 70 && (c.faction === 'zombie' || c.faction === 'raider' || c.faction === 'drifter')) g.removeChar(c);
  const cast = [];
  for (const s of STREET_CAST) {
    const p = at(D, s.a, s.b);
    const c = g.addChar({ x: p.x, z: p.z, faction: s.faction ?? 'drifter', weapon: s.weapon ?? null, hp: 200, colors: outfit(s.faction ?? 'drifter'), name: s.name, flag: s.flag });
    if (!c) continue;
    c.rxStaged = true; c.rxTemper = s.temper; c.title = s.title ?? null; c.occ = s.occ ?? null; c.child = !!s.child;
    c.home = { x: p.x, z: p.z }; c.wx = p.x; c.wz = p.z; c.timer = 99;
    c.face = Math.atan2(S0.x - p.x, S0.z - p.z) + (cast.length % 3 - 1) * 0.6;
    cast.push({ role: s.role, c });
  }
  const mom = cast.find((k) => k.role === 'mother')?.c, kid = cast.find((k) => k.role === 'child')?.c;
  if (mom && kid) mom.kin = kid.id;
  const sh = g.addChar({ x: S0.x, z: S0.z, faction: 'drifter', weapon: 'pistol', hp: 200, colors: outfit('drifter'), name: 'Shooter (staged)', flag: 'CU' });
  if (sh) { sh.rxStaged = true; sh.hold = true; sh.face = Math.atan2(D.nx, D.nz); }
  return { door: D, shooter: sh, cast, P0 };
}

// One real shot, out over the street away from the building; `seconds` later, who is doing what.
export async function shootStreet(api, st, seconds = 1.2) {
  const g = api.g, D = st.door, sh = st.shooter;
  const ang = Math.atan2(D.nx, D.nz);
  const since = g.eventSeq;
  const fired = g.combat.fire(sh, 'pistol', ang);
  const shot = g.reactions.last;
  await api.call('step', { seconds });
  const rows = st.cast.map(({ role, c }) => {
    const v = g.reactions.view(c);
    const ev = g.events.find((e) => e.seq > since && e.type === 'gunReact' && e.id === c.id);
    return { role, name: c.name, flag: c.flag, kind: ev?.kind ?? v?.kind ?? 'none', profile: ev?.profile ?? null, temper: ev?.temper ?? null, band: ev?.band ?? null, d: ev?.d ?? null, err: ev?.err ?? null, delay: ev?.delay ?? null,
      doing: v ? { kind: v.kind, started: v.started, phase: v.phase, door: v.door } : null, pose: { crouch: !!c.crouch, handsUp: !!c.handsUp, aiming: !!c.aiming, stoop: !!c.stoop, speed: r1(c.speed ?? 0) }, target: c.target ? `${c.target.id}:${c.target.faction}@${r1(Math.hypot(c.target.x - c.x, c.target.z - c.z))}` : null, cower: r1(c.cowerT ?? 0) };
  });
  const kinds = [...new Set(rows.map((r) => r.kind).filter((k) => k !== 'none'))];
  return { fired, door: D.id, doorLocked: D.locked, near: st.cast.map(({ role, c }) => `${role}:${g.reactions.doorNear(c)?.id ?? '-'}`).join(' '), shooter: sh?.id, shot: shot ? { seq: shot.seq, heard: shot.heard.length, deaf: shot.deaf } : null, kinds, distinct: kinds.length, rows,
    slams: g.events.filter((e) => e.seq > since && e.type === 'doorSlam').length, calledIn: g.events.filter((e) => e.seq > since && e.type === 'shotCalledIn').length };
}

// ---- the selftest share --------------------------------------------------------------------------------------------------
export async function reactionsChecks(api, check, C) {
  const g = api.g, RX = g.reactions;
  if (!RX) { await check('react: the gunfire reactions system is live', async () => 'no g.reactions'); return; }
  const quiet = () => { const was = { z: g.zombies.enabled, r: g.raiderTimer }; g.zombies.enabled = false; g.raiderTimer = 1e9; for (const c of [...g.chars]) if (c.faction === 'zombie' || c.faction === 'raider') g.removeChar(c); for (const ev of [...g.society.director.active]) g.society.director.cancel(ev.id); return () => { g.zombies.enabled = was.z; g.raiderTimer = was.r; }; };
  const hour0 = g.sky.time;
  const restore = quiet();
  // Open desert far from every camp (the walk-vehicle checks' flats): no building between anyone and the shot.
  const OPEN = { x: 250, z: 430 };
  const person = (x, z, o = {}) => {
    const c = g.addChar({ x, z, faction: o.faction ?? 'drifter', weapon: o.weapon ?? null, hp: 300, colors: outfit(o.faction ?? 'drifter'), name: o.name ?? 'Listener (selftest)', flag: o.flag ?? 'US' });
    if (!c) return null;
    c.rxStaged = true; c.rxTemper = o.temper ?? 'steady'; c.title = o.title ?? null; if (o.profile) c.rxProfile = o.profile; if (o.pick) c.rxPick = o.pick;
    c.home = { x, z }; c.wx = x; c.wz = z; c.timer = 99; if (o.hold) c.hold = true;
    return c;
  };
  // A spot dist from (cx, cz) in the open with a clear line to it (no rock or wall between: that would muffle the shot and
  // double the error, a different check). Tries the compass round from `from` radians.
  const clearSpot = (cx, cz, dist, from = 0) => {
    for (let k = 0; k < 24; k++) {
      const a = from + k * Math.PI / 12, x = cx + Math.sin(a) * dist, z = cz + Math.cos(a) * dist;
      if (!g.statics.pointBlocked(x, z, 0.6) && g.los(cx, cz, x, z)) return { x, z };
    }
    return null;
  };
  const shooterAt = (x, z) => { const s = person(x, z, { weapon: 'pistol', name: 'Shooter (selftest)', flag: 'CU' }); s.hold = true; return s; };
  const openGround = async () => {
    RX.clear(); unstage(g);
    await C('setTime', { hour: 12 });
    await C('teleport', { x: OPEN.x - 30, z: OPEN.z + 40 });
    await api._step(20);
    for (const c of [...g.chars]) if (c !== g.player && !c.npc && !c.inVehicle && Math.hypot(c.x - OPEN.x, c.z - OPEN.z) < 260) g.removeChar(c);
  };
  try {
    await check('react: the rows are valid (validateReactions: 16 reactions, 7 temperaments, 11 profiles, the last matches everyone; a sleeper\'s wake starts after an awake delay ends)', async () => {
      const v = validateReactions(REACT_ROWS);
      return v.ok && v.counts.reactions >= 12 && v.counts.temperaments >= 6 && v.counts.profiles >= 9 ? true : JSON.stringify(v);
    });

    await check('react: ONE real shot in a town street makes at least four different reactions (the deputy, medic, trader, mother, child, drunk, veteran, coward, preacher and radio operator each by their own profile and temperament), every one of them flagged', async () => {
      const st = await stageStreet(api);
      if (!st.door) return st.why;
      try {
        const res = await shootStreet(api, st, 1.2);
        const flags = st.cast.every(({ c }) => c.flag && c.flag.length === 2);
        const drunk = res.rows.find((r) => r.role === 'drunk'), coward = res.rows.find((r) => r.role === 'coward');
        const ok = res.fired && res.distinct >= 4 && flags && drunk?.kind === 'ignore' && coward?.kind === 'drop_run';
        return ok ? true : JSON.stringify({ fired: res.fired, distinct: res.distinct, kinds: res.kinds, rows: res.rows.map((r) => `${r.role}:${r.kind}/${r.band}`) });
      } finally { RX.clear(); unstage(g); }
    });

    await check('react: an unarmed parent goes to their child (the mother runs to her boy, he falls in at her heels, she gets them inside and the door slams and bars behind them; it comes unbarred when they come out)', async () => {
      const st = await stageStreet(api);
      if (!st.door) return st.why;
      try {
        const mom = st.cast.find((k) => k.role === 'mother').c, kid = st.cast.find((k) => k.role === 'child').c;
        for (const { c } of st.cast) if (c !== mom && c !== kid) g.removeChar(c); // this check is the family's: nobody else bars the door first
        const since = g.eventSeq;
        g.combat.fire(st.shooter, 'pistol', Math.atan2(st.door.nx, st.door.nz));
        const kind0 = mom.rx?.kind;
        let reached = false, follow = false, slam = null;
        for (let t = 0; t < 22 && !slam; t += 0.25) {
          await C('step', { seconds: 0.25 });
          reached ||= g.events.some((e) => e.seq > since && e.type === 'kinReached' && e.id === mom.id && e.kin === kid.id);
          follow ||= kid.rx?.kind === 'follow';
          slam = g.events.find((e) => e.seq > since && e.type === 'doorSlam' && e.by === mom.id) ?? null;
        }
        const D = slam ? g.interiors.byId.get(slam.door) : null, barred = !!D?.locked;
        const inside = D ? ((mom.x - D.x) * D.nx + (mom.z - D.z) * D.nz) < -0.5 : false;
        const kidIn = D ? ((kid.x - D.x) * D.nx + (kid.z - D.z) * D.nz) < 0.5 : false;
        if (mom.rx) mom.rx.t1 = g.time; // their time is up: out they come
        await C('step', { seconds: 0.5 });
        const unbarred = D ? !D.locked : false;
        const ok = kind0 === 'run_kin' && reached && follow && !!slam && barred && inside && kidIn && unbarred;
        return ok ? true : JSON.stringify({ kind0, reached, follow, slam: slam?.door ?? null, barred, inside, kidIn, unbarred, mom: [r1(mom.x), r1(mom.z)], kid: [r1(kid.x), r1(kid.z)], rx: RX.view(mom), ends: g.events.filter((e) => e.seq > since && (e.type === 'reactEnd' || e.type === 'gunReact')).map((e) => `${e.type}:${e.id}:${e.kind}@${e.t}`).slice(0, 10), t: g.time });
      } finally { RX.clear(); unstage(g); }
    });

    await check('react: a deputy moves toward the HEARD bearing, never the shooter\'s true position, and the error grows with distance (12 shots: mean |error| at 115 m above that at 55 m, each inside its bound; then both walk the heard line)', async () => {
      await openGround();
      const S = shooterAt(OPEN.x, OPEN.z);
      const pn = clearSpot(OPEN.x, OPEN.z, 55, Math.PI / 2), pf = clearSpot(OPEN.x, OPEN.z, 115, 0);
      if (!pn || !pf) return JSON.stringify({ noClearSpot: { pn, pf } });
      const near = person(pn.x, pn.z, { faction: 'warden', weapon: 'pistol', title: 'deputy', pick: 'look', hold: true, name: 'Deputy Near', flag: 'US' });
      const far = person(pf.x, pf.z, { faction: 'warden', weapon: 'pistol', title: 'deputy', pick: 'look', hold: true, name: 'Deputy Far', flag: 'MX' });
      try {
        const errs = { near: [], far: [] }, bounds = { near: 0, far: 0 };
        for (let k = 0; k < 12; k++) {
          g.combat.fire(S, 'pistol', Math.PI * 0.75); // into the empty south-west
          for (const [key, c] of [['near', near], ['far', far]]) if (c.rx) { errs[key].push(c.rx.err); bounds[key] = c.rx.errBound; }
        }
        const mean = (a) => a.reduce((s, v) => s + Math.abs(v), 0) / Math.max(1, a.length);
        const inBound = errs.near.every((e) => Math.abs(e) <= bounds.near + 1e-6) && errs.far.every((e) => Math.abs(e) <= bounds.far + 1e-6);
        // Let them go: one more shot, and they walk.
        near.hold = false; far.hold = false;
        g.combat.fire(S, 'pistol', Math.PI * 0.75);
        const start = { near: { x: near.x, z: near.z, b: near.rx?.heard.bearing, t: Math.atan2(S.x - near.x, S.z - near.z), e: near.rx?.err }, far: { x: far.x, z: far.z, b: far.rx?.heard.bearing, t: Math.atan2(S.x - far.x, S.z - far.z), e: far.rx?.err } };
        await C('step', { seconds: 3 });
        const walk = {};
        let discriminated = 0;
        for (const [key, c] of [['near', near], ['far', far]]) {
          const s0 = start[key], dx = c.x - s0.x, dz = c.z - s0.z, ang = Math.atan2(dx, dz);
          const offHeard = Math.abs(wrap(ang - s0.b)) * R2D, offTrue = Math.abs(wrap(ang - s0.t)) * R2D;
          walk[key] = { moved: r1(Math.hypot(dx, dz)), offHeard: r1(offHeard), offTrue: r1(offTrue), err: s0.e };
          if (Math.abs(s0.e) >= 4 && offHeard < offTrue) discriminated++;
          walk[key].ok = Math.hypot(dx, dz) > 4 && offHeard < 12 && (Math.abs(s0.e) < 4 || offHeard < offTrue);
        }
        const ok = errs.near.length === 12 && errs.far.length === 12 && bounds.far > bounds.near && mean(errs.far) > mean(errs.near) && inBound && walk.near.ok && walk.far.ok && discriminated >= 1;
        return ok ? true : JSON.stringify({ meanNear: r1(mean(errs.near)), meanFar: r1(mean(errs.far)), bounds, inBound, walk, discriminated, n: [errs.near.length, errs.far.length] });
      } finally { RX.clear(); unstage(g); }
    });

    await check('react: a person out of earshot does nothing (230 m from a pistol shot in the open: no reaction, no flight, no cower; one at 60 m hears it)', async () => {
      await openGround();
      const S = shooterAt(OPEN.x, OPEN.z);
      const deaf = person(OPEN.x - 230, OPEN.z, { name: 'Far Off', flag: 'IT' }), ear = person(OPEN.x - 60, OPEN.z, { name: 'Close Enough', flag: 'DE', profile: 'civilian' });
      try {
        const since = g.eventSeq;
        g.combat.fire(S, 'pistol', Math.PI * 0.5);
        await C('step', { seconds: 1 });
        const any = g.events.some((e) => e.seq > since && e.type === 'gunReact' && e.id === deaf.id);
        const heard = g.events.some((e) => e.seq > since && e.type === 'gunReact' && e.id === ear.id);
        const ok = !any && !deaf.rx && !(deaf.flee > 0) && !(deaf.cowerT > 0) && heard;
        return ok ? true : JSON.stringify({ any, rx: RX.view(deaf), flee: deaf.flee, cower: deaf.cowerT, heard, range: 45 * REACT.earMul });
      } finally { RX.clear(); unstage(g); }
    });

    await check('react: someone asleep wakes slower (two alike at 50 m, one asleep: the awake one is moving inside a second, the sleeper still lies asleep then, and is up and reacting by 6 s)', async () => {
      await openGround();
      const S = shooterAt(OPEN.x, OPEN.z);
      const awake = person(OPEN.x + 50, OPEN.z + 6, { profile: 'civilian', pick: 'flee', name: 'Awake One', flag: 'BR' });
      const sleeper = person(OPEN.x + 50, OPEN.z - 6, { profile: 'civilian', pick: 'flee', name: 'Sleeper', flag: 'HT' });
      try {
        sleeper.sleeping = true; // laid down in the same frame as the shot (by day, the AI would wake them at once)
        const since = g.eventSeq;
        g.combat.fire(S, 'pistol', Math.PI);
        const dA = awake.rx?.delay, dS = sleeper.rx?.delay;
        await C('step', { seconds: 1 });
        const awakeGoing = !!awake.rx?.started, stillAsleep = !!sleeper.sleeping && !sleeper.rx?.started;
        let woke = false;
        for (let t = 1; t < 6 && !woke; t += 0.5) { await C('step', { seconds: 0.5 }); woke = g.events.some((e) => e.seq > since && e.type === 'npcWoke' && e.id === sleeper.id && e.why === 'gunfire'); }
        const ok = dS > dA && awakeGoing && stillAsleep && woke && sleeper.rx?.started;
        return ok ? true : JSON.stringify({ dA, dS, awakeGoing, stillAsleep, woke, rx: RX.view(sleeper) });
      } finally { RX.clear(); unstage(g); }
    });

    await check('react: repeated shots raise a town\'s jumpiness, which then decays in the quiet (6 shots: up from 0; 30 s of quiet: down by about a fifth; a jumpy town reacts faster)', async () => {
      await openGround();
      const S = shooterAt(OPEN.x, OPEN.z);
      const ear = person(OPEN.x + 40, OPEN.z, { profile: 'civilian', pick: 'freeze', hold: true, name: 'Townsman', flag: 'CO' });
      try {
        RX.places.clear();
        const j0 = RX.place(ear.x, ear.z);
        g.combat.fire(S, 'pistol', Math.PI); const d1 = ear.rx?.delay;
        for (let k = 0; k < 5; k++) g.combat.fire(S, 'pistol', Math.PI);
        const j1 = RX.place(ear.x, ear.z);
        await C('step', { seconds: 30 });
        const j2 = RX.place(ear.x, ear.z);
        RX.end(ear); g.combat.fire(S, 'pistol', Math.PI); const d2 = ear.rx?.delay, jr = ear.rx?.j ?? 0; // the same ear, a jumpier town
        const fall = j2 / j1, want = Math.pow(0.5, 30 / REACT.jump.halfLife);
        // jumpy: the delay is cut by delayCut x j (the most a steady ear can take is REACT.delay[1] x that)
        const faster = jr > 0.3 && d2 <= REACT.delay[1] * (1 - REACT.jump.delayCut * jr) + 0.01 && d1 <= REACT.delay[1] + 0.01;
        const ok = j0 === 0 && j1 > 0.4 && j2 < j1 && Math.abs(fall - want) < 0.06 && faster;
        return ok ? true : JSON.stringify({ j0, j1: r1(j1 * 100) / 100, j2: r1(j2 * 100) / 100, fall: r1(fall * 100) / 100, want: r1(want * 100) / 100, d1, d2, jr });
      } finally { RX.clear(); unstage(g); RX.places.clear(); }
    });

    await check('react: calling it in puts what they HEARD (their guessed spot, not the shot\'s true spot) into the knowledge model as a gunfire fact, on the radio', async () => {
      await openGround();
      const S = shooterAt(OPEN.x, OPEN.z);
      const op = person(OPEN.x + 70, OPEN.z + 20, { profile: 'wire', pick: 'call_in', name: 'Radio Operator', flag: 'KR' });
      try {
        const since = g.eventSeq;
        g.combat.fire(S, 'pistol', Math.PI);
        await C('step', { seconds: 1.5 });
        const ev = g.events.find((e) => e.seq > since && e.type === 'shotCalledIn' && e.id === op.id);
        const f = ev ? g.pulls.k.fact(ev.fact) : null;
        const guess = f?.where, off = guess ? Math.hypot(guess.x - S.x, guess.z - S.z) : null;
        const ok = !!f && f.what === 'gunfire' && off > 0.5 && g.pulls.k.holds(`rx:${op.id}`, f.id) && /Shots fired/.test(f.text);
        return ok ? true : JSON.stringify({ ev, f, off });
      } finally { RX.clear(); unstage(g); }
    });
  } finally {
    RX.clear(); unstage(g); restore();
    await C('setTime', { hour: hour0 });
  }
}

export { dirWord };
