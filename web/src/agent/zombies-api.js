// THE INFECTED's minds for agents (docs/design/WEB_ZOMBIES.md; rows data/infected.js, brain systems/zombies.js): the
// `zombies` command (the three breeds' rows, every mind near you - what it perceives, what it remembers and how it
// learned it - the hordes on the move) and the lane's named selftest checks (each returns true or a JSON diagnostic).
// The player acts through the real body (stance, the flashlight, the shot's noise); the infected, doors and fires are staged.
import * as THREE from 'three';
import { INFECTED, BREEDS, FOOTSTEPS, DRIFT, INSIDE, validateInfected } from '../data/infected.js';
import { TRACK_KINDS } from '../data/outdoors.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function zombiesCommands(api, need) {
  const g = api.g, P = () => g.player;
  const mind = (c) => {
    const m = c.zm, fresh = g.zombies.fresh(c);
    return {
      id: c.id, kind: c.zkind ?? 'shambler', hp: Math.round(c.hp), crawl: !!c.crawl, down: c.knockT > 0, pace: r1(c.zSpeed ?? 0),
      sees: c.zsee?.id ?? null, how: c.zhow ?? null,
      memory: m && m.src !== null ? { src: m.src, of: m.who, age: r1(g.time - m.t), x: r1(m.x), z: r1(m.z), searching: m.searchT > 0 ? r1(m.searchT) : 0, fresh } : null,
      working: c.zblock ? `${c.zblock.kind === 'window' ? 'window' : 'door'} ${c.zblock.id}` : c.work ? (c.work.W ? `window ${c.work.W.id}` : c.work.door ? `door ${c.work.door.id}` : 'boards') : null,
      fire: c.zfire ? { x: r1(c.zfire.x), z: r1(c.zfire.z) } : null, dist: r1(Math.hypot(c.x - P().x, c.z - P().z)),
    };
  };
  return {
    zombies: {
      group: 'world', desc: "THE INFECTED's minds (docs/design/WEB_INFECTED.md and its Wave 2 lane doc; rows data/infected.js): three breeds (shambler, sprinter, echo; the Choir-Touched is a site special) and what each one KNOWS (law 6: only what it saw, heard or smelled; a last-known spot it walks to, searches round and forgets; never your true position). No args: the breeds' rows in short, validateInfected, the counters (remembered, forgot, thumps, doors broken, crawlers, lunges, falls, lights, fire), every mind within radius= m (sees, how, memory src/age/spot/searching, what door or window it is working, a fire it keeps from) and the hordes on the move (a drift toward a noise they heard). id=<id>: that one mind. spawn=shambler|sprinter|echo at x,z (default 14 m east of you). crawl=<id> takes its legs (a crawler). leg=<id> dmg= puts a leg hit on it as a shot would. occupy=<kind> fills a w x d box at x,z with who is inside that kind of building (INSIDE rows). rows=true: the full rows.",
      args: { radius: { type: 'number', default: 60 }, id: { type: 'string' }, spawn: { type: 'string', enum: BREEDS }, x: { type: 'number' }, z: { type: 'number' }, crawl: { type: 'string' }, leg: { type: 'string' }, dmg: { type: 'number', default: 40 }, occupy: { type: 'string' }, w: { type: 'number', default: 10 }, d: { type: 'number', default: 10 }, rows: { type: 'boolean' } },
      run: async ({ radius, id, spawn, x, z, crawl, leg, dmg, occupy, w, d, rows }) => {
        const Z = g.zombies;
        if (rows) return { INFECTED, BREEDS, FOOTSTEPS, DRIFT, INSIDE, problems: validateInfected() };
        if (spawn) {
          const at = { x: x ?? P().x + 14, z: z ?? P().z };
          const c = spawn === 'echo' ? Z.spawnKind('echo', at.x, at.z) : Z.spawn(at.x, at.z, spawn === 'sprinter');
          need(c, 'character budget full'); return mind(c);
        }
        if (crawl) { const c = api.findChar(crawl); need(c?.faction === 'zombie' && c.alive, `${crawl} is not one of the living infected`); Z.crawler(c, 'agent'); return mind(c); }
        if (leg) { const c = api.findChar(leg); need(c?.faction === 'zombie' && c.alive, `${leg} is not one of the living infected`); c.hitPart = 'legs'; g.combat.damage(c, dmg, P(), 0, 0, 'bullet'); return mind(c); }
        if (occupy) { const ids = Z.occupy({ x: x ?? P().x, z: z ?? P().z, w, d, kind: occupy }); return { kind: occupy, rule: INSIDE[occupy] ?? INSIDE.default, ids }; }
        if (id) { const c = api.findChar(id); need(c?.faction === 'zombie', `${id} is not one of the infected`); return mind(c); }
        const near = g.chars.filter((c) => c.alive && c.faction === 'zombie' && !c.wild && Math.hypot(c.x - P().x, c.z - P().z) < radius);
        return {
          breeds: BREEDS.map((k) => { const R = INFECTED[k], S = R.sense; return { kind: k, name: R.name, hp: R.hp, sight: S.sight, night: S.night, cone: S.cone, smell: S.smell, memory: S.memory, search: S.search, door: `${R.door.dmg}/${R.door.every}s`, legs: R.legs, lunge: R.lunge ? `${R.lunge.at} m` : null, fire: R.fire, light: R.light }; }),
          special: Object.keys(INFECTED).filter((k) => INFECTED[k].site),
          problems: validateInfected(), counts: { ...Z.counts },
          minds: near.sort((a, b) => Math.hypot(a.x - P().x, a.z - P().z) - Math.hypot(b.x - P().x, b.z - P().z)).slice(0, 40).map(mind),
          hordes: g.citygen?.overrun?.view() ?? [],
        };
      },
    },
  };
}

// The selftest's ZOMBIES checks (docs/design/WEB_ZOMBIES.md §8). Open desert (WV in api.js: no camps, no town) by day.
export async function zombiesChecks({ g, api, C, check, stage, hush }) {
  const Z = g.zombies, P = () => g.player;
  const FLATS = { x: 250, z: 430 };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const clearRound = (x, z, r) => { for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - x, c.z - z) < r) g.removeChar(c); };
  const flats = async () => { await stage(); await C('teleport', FLATS); clearRound(FLATS.x, FLATS.z, 140); g.godMode = true; await C('step', { seconds: 0.2 }); };
  const facing = (c, o) => { c.face = Math.atan2(o.x - c.x, o.z - c.z); };
  const standStill = (c) => { c.timer = 99; c.wx = c.x; c.wz = c.z; };
  const gone = (...cs) => { for (const c of cs) if (c && g.chars.includes(c)) g.removeChar(c); };
  const upright = () => { const p = P(); if (p.prone) g.stance.setProne(p, false); p.proneT = 0; delete p.concealOverride; p._cnT = undefined; };

  await check('infected minds: the three breeds are rows (shambler, sprinter, echo) and validate; the Choir-Touched is a site special, not a breed; a broken row is caught', async () => {
    const bad = validateInfected();
    const special = Object.keys(INFECTED).filter((k) => INFECTED[k].site);
    const broken = validateInfected({ ...INFECTED, echo: { ...INFECTED.echo, door: { every: 2.2, dmg: 6 } } }); // an Echo no better at doors than a shambler
    const four = validateInfected(INFECTED, [...BREEDS, 'choir']);
    return !bad.length && BREEDS.join() === 'shambler,sprinter,echo' && special.join() === 'choir' && broken.length > 0 && four.length > 0 ? true : JSON.stringify({ bad, special, broken, four });
  });

  await check('infected minds: memory - it sees you, you go beyond its senses; it walks to where it LAST saw you (never toward where you are), searches round that spot, and forgets', async () => hush(async () => {
    await flats();
    const p = P(), s = Z.spawn(p.x + 20, p.z, false);
    try {
      s.zSpeed = 2.3; facing(s, p); standStill(s);
      let saw = false;
      for (let t = 0; t < 3 && !saw; t += 0.25) { await C('step', { seconds: 0.25 }); saw = s.zsee === p && s.zhow === 'sight'; }
      const last = { x: p.x, z: p.z };
      await C('teleport', { x: FLATS.x - 30, z: FLATS.z + 75 }); // out of sight, earshot and smell
      const real = { x: P().x, z: P().z };
      let reached = false, searched = false, forgot = false, closest = Infinity, seenAgain = false, maxOff = 0, t = 0;
      const f0 = Z.counts.forgot;
      for (; t < 60 && !forgot; t += 0.5) {
        await C('step', { seconds: 0.5 });
        if (s.zsee) seenAgain = true;
        closest = Math.min(closest, dist(s, real));
        if (dist(s, last) < 2.2) reached = true;
        if (s.zm?.searchT > 0) { searched = true; maxOff = Math.max(maxOff, dist(s, last)); }
        forgot = s.zm?.src === null && Z.counts.forgot > f0;
      }
      const S = INFECTED.shambler.sense;
      return saw && reached && searched && forgot && !seenAgain && closest > 45 && maxOff < S.searchR + 3 ? true
        : JSON.stringify({ saw, reached, searched, forgot, seenAgain, closest: r1(closest), maxOff: r1(maxOff), t, mem: s.zm });
    } finally { gone(s); g.godMode = false; }
  }));

  await check('infected minds: stance - prone in grass 20 m in front of a shambler looking at you, it never picks you out; stand up on the same spot and it does', async () => hush(async () => {
    await flats();
    const p = P(), s = Z.spawn(p.x + 20, p.z, false);
    try {
      s.zSpeed = 0; facing(s, p); standStill(s);
      p.concealOverride = 0.8; p._cnT = undefined; // a patch of tall grass
      const down = g.stance.setProne(p, true);
      await C('step', { seconds: 0.5 });
      let spotted = 0;
      for (let t = 0; t < 4; t += 0.25) { facing(s, p); await C('step', { seconds: 0.25 }); if (s.zsee === p) spotted++; }
      upright();
      let seenStanding = false;
      for (let t = 0; t < 3 && !seenStanding; t += 0.25) { facing(s, p); await C('step', { seconds: 0.25 }); seenStanding = s.zsee === p; }
      return down.ok !== false && spotted === 0 && seenStanding ? true : JSON.stringify({ down, spotted, seenStanding, mem: s.zm?.src ?? null });
    } finally { upright(); gone(s); g.godMode = false; }
  }));

  await check('infected minds: horde drift - a gunshot pulls a horde record 300 m away (by day, when it would sit); it WALKS there on the world clock (never a jump), arrives and stays', async () => hush(async () => {
    await flats();
    const O = g.citygen?.overrun;
    if (!O) return 'no overrun (citygen) in this world';
    const auto = O.auto; O.auto = false;
    // South over dry flats (east of x 290 is the island's lake: the dead don't swim). The shot goes off here; then you go
    // 450 m north, so the horde stays a RECORD the whole way (no bodies stand up near you): the off-screen walk itself.
    const p = P(), H = O.spawnHorde({ x: p.x, z: p.z + 300, size: 12 });
    try {
      await C('step', { seconds: 4 });
      const sat = dist(H, { x: p.x, z: p.z + 300 }) < 2; // by day a horde with no reason digs in
      const shot = { x: p.x, z: p.z };
      g.noise(p.x, p.z, 45, p); // the shot's noise (combat.js: every round fired is a 45 m noise)
      const heard = !!H.drift;
      await C('teleport', { x: shot.x, z: shot.z - 450 });
      let prev = { x: H.x, z: H.z }, maxJump = 0, arrived = false, t = 0;
      const d0 = dist(H, p);
      for (; t < 280 && !arrived; t += 2) {
        await C('step', { seconds: 2 });
        maxJump = Math.max(maxJump, dist(H, prev)); prev = { x: H.x, z: H.z };
        arrived = dist(H, shot) < DRIFT.arrive + 5;
        if (H.bodies.length) break; // bodies stood up: not the record's walk any more
      }
      const d1 = dist(H, shot);
      return sat && heard && arrived && d0 > 290 && d1 < DRIFT.arrive + 10 && maxJump < 4.5 && !H.bodies.length ? true : JSON.stringify({ sat, heard, arrived, d0: r1(d0), d1: r1(d1), maxJump: r1(maxJump), t, state: H.state, bodies: H.bodies.length });
    } finally { O.dematerialize(H); const i = O.hordes.indexOf(H); if (i >= 0) O.hordes.splice(i, 1); O.auto = auto; g.godMode = false; }
  }));

  await check('infected minds: doors - an Echo thumps a barricaded door open on its own; three shamblers smelling you behind the same door take far longer', async () => hush(async () => {
    await stage();
    const I = g.interiors, n = g.nav.foot;
    const ok = (x, z) => n.free(x, z);
    const door = I.doors.find((d) => (d.kind === 'front' || d.kind === 'back') && !d.ug && !d.locked && !d.broken && d.material === 'wood' && ok(d.x + d.nx * 1.6, d.z + d.nz * 1.6) && ok(d.x - d.nx * 3.5, d.z - d.nz * 3.5) && ok(d.x + d.nx * 1.6 - d.nz, d.z + d.nz * 1.6 + d.nx) && ok(d.x + d.nx * 1.6 + d.nz, d.z + d.nz * 1.6 - d.nx));
    if (!door) return 'no wooden front or back door with clear ground both sides';
    const bar = () => { I.setLocked(door, false); I.setLocked(door, true); return g.gadgets.barricade(door, 'planks', null, false); };
    const made = [];
    try {
      g.godMode = true;
      await C('teleport', { x: door.x - door.nx * 3.5, z: door.z - door.nz * 3.5 });
      clearRound(door.x, door.z, 40);
      g.aimOverride = { x: door.x - door.nx * 12, z: door.z - door.nz * 12 }; // looking away, into the room
      const b1 = bar(), hp0 = Math.round(door.lockHp);
      const e = Z.spawnKind('echo', door.x + door.nx * 1.4, door.z + door.nz * 1.4); made.push(e);
      let echoT = null;
      for (let t = 0; t < 45 && echoT === null; t += 0.5) { await C('step', { seconds: 0.5 }); if (!door.locked) echoT = t + 0.5; }
      const mind = Z.minds?.view(e), ed = +Math.hypot(e.x - door.x, e.z - door.z).toFixed(1);
      gone(e);
      const b2 = bar(), th0 = Z.counts.thumps;
      const ux = -door.nz, uz = door.nx;
      for (const k of [-1, 0, 1]) { const s = Z.spawn(door.x + door.nx * 1.6 + ux * k, door.z + door.nz * 1.6 + uz * k, false); if (s) { s.zSpeed = 2.3; made.push(s); } }
      let shamT = null;
      const cap = Math.max(60, (echoT ?? 30) * 4);
      for (let t = 0; t < cap && shamT === null; t += 0.5) { await C('step', { seconds: 0.5 }); if (!door.locked) shamT = t + 0.5; }
      const thumped = Z.counts.thumps - th0;
      return b1.ok && b2.ok && echoT !== null && echoT < 35 && thumped > 3 && (shamT === null || shamT > echoT * 1.5) ? true
        : JSON.stringify({ b1: b1.ok, b2: b2.ok, hp0, echoT, shamT, thumped, lockHp: Math.round(door.lockHp), cap, mind, ed });
    } finally {
      g.aimOverride = null; gone(...made); g.godMode = false;
      if (g.gadgets.barred.some((b) => b.door === door)) g.gadgets.unbarricade(door); else I.setLocked(door, false);
    }
  }));

  await check('infected minds: a leg shot past its legs makes a crawler (low, slow, still coming); the same hit to the torso does not', async () => hush(async () => {
    await flats();
    const p = P(), a = Z.spawn(p.x + 8, p.z + 2, false), b = Z.spawn(p.x + 8, p.z - 2, false);
    try {
      for (const c of [a, b]) { c.zSpeed = 2.4; c.hp = c.maxHp = 200; c._zhp = 200; }
      a.hitPart = 'legs'; g.combat.damage(a, 40, p, -1, 0, 'bullet');
      b.hitPart = 'torso'; g.combat.damage(b, 40, p, -1, 0, 'bullet');
      a.knockT = 0; b.knockT = 0;
      let top = 0;
      const d0 = dist(a, p);
      for (let t = 0; t < 3; t += 0.25) { await C('step', { seconds: 0.25 }); top = Math.max(top, a.speed ?? 0); }
      const d1 = dist(a, p);
      return a.crawl && a.prone && a.alive && !b.crawl && top <= INFECTED.shambler.crawl + 0.05 && d1 < d0 ? true
        : JSON.stringify({ crawl: !!a.crawl, prone: !!a.prone, alive: a.alive, torsoCrawl: !!b.crawl, top: r1(top), d0: r1(d0), d1: r1(d1) });
    } finally { gone(a, b); g.godMode = false; }
  }));

  await check('infected minds: law 6 - shot from 60 m out of its senses, it knows which way the hit came from (a spot up to 20 m back along it), never the shooter\'s position', async () => hush(async () => {
    await flats();
    const p = P(), s = Z.spawn(p.x + 60, p.z, false);
    try {
      s.zSpeed = 2.3; s.face = Math.atan2(1, 0); standStill(s); // looking away
      await C('step', { seconds: 0.6 });
      const before = s.zsee;
      g.combat.damage(s, 8, p, 1, 0, 'bullet');
      const m = s.zm ? { src: s.zm.src, x: s.zm.x, z: s.zm.z } : null;
      const back = m ? dist(m, s) : 0, toYou = m ? dist(m, p) : 0;
      await C('step', { seconds: 3 });
      return !before && m?.src === 'hurt' && back <= 20.5 && toYou > 35 && dist(s, p) < 60 ? true : JSON.stringify({ before: before?.id ?? null, m, back: r1(back), toYou: r1(toYou), now: r1(dist(s, p)) });
    } finally { gone(s); g.godMode = false; }
  }));

  await check('infected minds: fire - a shambler coming at you round a fire patch keeps out of it (it goes round, never through)', async () => hush(async () => {
    await flats();
    const p = P(), s = Z.spawn(p.x + 16, p.z, false), F = { x: p.x + 8, z: p.z, r: 2.2, t: 0, dur: 30, by: null };
    g.throwables.fires.push(F);
    try {
      s.zSpeed = 2.3; facing(s, p);
      let minF = Infinity, fled = 0;
      for (let t = 0; t < 10; t += 0.25) { await C('step', { seconds: 0.25 }); minF = Math.min(minF, dist(s, F)); if (s.zfire) fled++; }
      return minF > F.r + 2 && fled > 0 && s.alive ? true : JSON.stringify({ minF: r1(minF), fled, hp: Math.round(s.hp), at: r1(dist(s, p)) });
    } finally { const i = g.throwables.fires.indexOf(F); if (i >= 0) g.throwables.fires.splice(i, 1); gone(s); g.godMode = false; }
  }));

  await check('infected minds: light - at night, a shambler 45 m off in the dark stays put while your flashlight is off and comes to it when you switch it on', async () => hush(async () => {
    await flats();
    await C('setTime', { hour: 23 });
    const p = P(), s = Z.spawn(p.x + 45, p.z, false);
    const fo = g.flashOverride;
    try {
      s.zSpeed = 2.3; standStill(s); p.face = Math.atan2(1, 0); // you face it
      g.flashOverride = false;
      for (let t = 0; t < 3; t += 0.5) await C('step', { seconds: 0.5 });
      const dark = { src: s.zm?.src ?? null, d: dist(s, p) };
      g.flashOverride = true;
      let pulled = null;
      for (let t = 0; t < 8 && !pulled; t += 0.5) { await C('step', { seconds: 0.5 }); if (s.zm?.src === 'light' || s.zm?.src === 'sight') pulled = s.zm.src; }
      for (let t = 0; t < 3; t += 0.5) await C('step', { seconds: 0.5 });
      const lit = dist(s, p);
      return !dark.src && dark.d > 42 && pulled && lit < dark.d - 4 ? true : JSON.stringify({ dark, pulled, lit: r1(lit), night: r1(g.sky.night) });
    } finally { g.flashOverride = fo; gone(s); g.godMode = false; await C('setTime', { hour: 12 }); }
  }));

  await check('infected minds: an Echo\'s phrase calls the infected in earshot that know of nothing better to where it works', async () => hush(async () => {
    await flats();
    const p = P(), e = Z.spawnKind('echo', p.x + 40, p.z + 40), s = Z.spawn(p.x + 40 + 22, p.z + 40, false);
    try {
      s.zSpeed = 2.3; standStill(s); s.face = Math.atan2(1, 0);
      g.aimOverride = { x: p.x - 30, z: p.z - 30 };
      let called = false;
      for (let t = 0; t < 8 && !called; t += 0.5) { await C('step', { seconds: 0.5 }); called = s.zm?.src === 'echo'; }
      const d0 = dist(s, e);
      await C('step', { seconds: 4 });
      return called && dist(s, e) < d0 - 3 ? true : JSON.stringify({ called, src: s.zm?.src ?? null, d0: r1(d0), d1: r1(dist(s, e)) });
    } finally { g.aimOverride = null; gone(e, s); g.godMode = false; }
  }));
  await check("infected minds: the herd's trail is its own sign - shuffling scuffs, a crawler's drag, smears from the wounded (never boot prints) - drawn dark: the sign mesh multiplies the ground, and an old print fades toward white (gone), never pale", async () => hush(async () => {
    await flats();
    const O = g.outdoors, KINDS = Object.keys(TRACK_KINDS), p = P();
    if (!O?.mesh) return 'no sign mesh';
    const walk = Z.spawn(p.x - 3, p.z + 16, false), hurt = Z.spawn(p.x, p.z + 16, false), crawl = Z.spawn(p.x + 3, p.z + 10, false);
    try {
      for (const c of [walk, hurt, crawl]) { c.zSpeed = 2.2; Z.remember(c, c.x, p.z, 'told'); }
      hurt.hp = hurt.maxHp * 0.4; hurt._zhp = hurt.hp; Z.crawler(crawl, 'check');
      for (let t = 0; t < 8; t += 0.5) await C('step', { seconds: 0.5 });
      const of = (c) => { const n = {}; for (let i = 0; i < O.count; i++) if (O.tw[i] === c.id) { const k = KINDS[O.tk[i]]; n[k] = (n[k] ?? 0) + 1; } return n; };
      const a = of(walk), b = of(hurt), c = of(crawl);
      O.drawTracks();
      const m = O.mesh, col = m.instanceColor.array, mean = (n) => (col[n * 3] + col[n * 3 + 1] + col[n * 3 + 2]) / 3;
      const fresh = mean(0);
      const i = O.lay('scuff', p.x, p.z + 2, 0, 'check-old', 'infected');
      O.tt[i] = O.hours() - O.maxAge(i, 0) * 0.85; // most of the way through what an untrained eye can read of it
      O.drawTracks();
      const old = mean(0);
      const multiply = m.material.blending === THREE.MultiplyBlending && m.material.toneMapped === false;
      const ok = a.scuff > 2 && !a.boot && c.drag > 2 && !c.boot && (b.smear ?? 0) > 0 && multiply && m.count > 0 && fresh < 0.35 && old > fresh + 0.3;
      return ok ? true : JSON.stringify({ walk: a, hurt: b, crawl: c, multiply, drawn: m.count, fresh: r1(fresh * 100) / 100, old: r1(old * 100) / 100 });
    } finally { gone(walk, hurt, crawl); g.godMode = false; }
  }));

  await check('infected minds: a herd from above reads as people, not one blob - twelve of them wear at least six different shirts and four different skins', async () => hush(async () => {
    await flats();
    const p = P(), made = [];
    try {
      for (let i = 0; i < 12; i++) { const c = Z.spawn(p.x + (i % 4) * 1.2, p.z + 12 + Math.floor(i / 4) * 1.2, false); if (c) { c.zSpeed = 0; made.push(c); } }
      const shirts = new Set(made.map((c) => c.colors.shirt)), skins = new Set(made.map((c) => c.colors.skin)), blood = Math.max(...made.map((c) => c.blood));
      return made.length === 12 && shirts.size >= 6 && skins.size >= 4 && blood <= 0.6 ? true : JSON.stringify({ n: made.length, shirts: shirts.size, skins: skins.size, blood: r1(blood) });
    } finally { gone(...made); g.godMode = false; }
  }));
}
