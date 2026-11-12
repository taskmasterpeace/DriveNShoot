// THE SHUT DOOR for agents (docs/design/WEB_DOOR_POUND.md; rules systems/interiors.js pound / shutDoor / brace and
// systems/zombies.js work / thump; rows data/interiors.js DOOR and data/infected.js sprinter.frenzy): the `pound` command
// and the named selftest checks. The player acts through the real E key (shut, lean); the infected walk and beat the door
// on their own minds; only positions, the door's starting state and who was told about you are staged.
import { DOOR } from '../data/interiors.js';
import { INFECTED, validateInfected } from '../data/infected.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function poundCommands(api, need) {
  const g = api.g, P = () => g.player;
  const view = (d) => {
    const I = g.interiors, H = I.doorHp(d);
    return { id: d.id, kind: d.kind, material: d.material, shut: I.isShut(d), locked: d.locked, barricade: d.barricade ?? null, broken: !!d.broken, hp: H.hp, max: H.max, left: r1(H.share), breaks: H.breaks,
      cracked: !!d.cracked, underAttack: I.underAttack(d), leaned: I.braced(d), shutBy: d.shutBy ?? null, dist: r1(Math.hypot(d.x - P().x, d.z - P().z)) };
  };
  return {
    pound: {
      group: 'world', desc: 'THE SHUT DOOR (docs/design/WEB_DOOR_POUND.md): the infected cannot work a latch, so a door pulled shut holds them until they beat it off its hinges. No args: every door within radius= m (default 12) - shut or not, locked, barricade, the leaf\'s hp and share left, whether it breaks at all (steel does not), cracked, under attack now, leaned on - who is beating which door, the counters and the rows. shut=<door id | nearest>: pull that door shut the way E does at an open door (you must be within reach with a clear line; refused while a body stands in the doorway). open=<id>: swing it open (testing). The player\'s keys: E at an open door shuts it (before anything else when the infected are within 24 m; never with a body in the doorway); with the infected about, E at a shut door leans on it (each blow does 0.45 of its damage) and never kicks it; walk into a door to open it. An Echo is not held by a latch.',
      args: { radius: { type: 'number', default: 12 }, shut: { type: 'string' }, open: { type: 'string' } },
      run: async ({ radius, shut, open }) => {
        const I = g.interiors, p = P();
        if (shut) {
          const d = shut === 'nearest' ? I.openDoorNear(p) : I.byId.get(shut) ?? I.doors.find((x) => String(x.id) === shut);
          need(d?.leaves, shut === 'nearest' ? 'no open door within reach (2 m, a clear line)' : `no door ${shut}`);
          need(Math.hypot(d.x - p.x, d.z - p.z) <= DOOR.shutReach && g.reach.opening(p, d), 'out of reach: stand within 2 m of it with a clear line (moveTo it first)');
          const r = I.shutDoor(d, p); need(r.ok, r.why);
          return { shut: view(d) };
        }
        if (open) {
          const d = I.byId.get(open) ?? I.doors.find((x) => String(x.id) === open);
          need(d?.leaves, `no door ${open}`); need(!d.locked, 'it is locked');
          for (const L of d.leaves) { L.th = 1.3; L.w = 0; I.orient(L); } I.flush();
          return { opened: view(d) };
        }
        const doors = I.doors.filter((d) => Math.hypot(d.x - p.x, d.z - p.z) < radius).map(view).sort((a, b) => a.dist - b.dist);
        const at = g.chars.filter((c) => c.alive && c.faction === 'zombie' && c.zblock?.leaves).map((c) => ({ id: c.id, breed: c.zkind ?? 'shambler', state: c.zs?.state ?? null, door: c.zblock.id }));
        return { doors, beating: at, counts: { thumps: g.zombies.counts.thumps, frenzy: g.zombies.counts.frenzy ?? 0, doorsBroken: g.zombies.counts.doorsBroken }, rows: { DOOR: { shutAngle: DOOR.shutAngle, shutReach: DOOR.shutReach, braceMul: DOOR.braceMul, crackAt: DOOR.crackAt, poundNoise: DOOR.poundNoise, frenzyNoise: DOOR.frenzyNoise }, shambler: INFECTED.shambler.door, sprinter: INFECTED.sprinter.frenzy, echo: INFECTED.echo.door } };
      },
    },
  };
}

export async function poundChecks({ g, api, C, check, stage, hush }) {
  const I = g.interiors, Z = g.zombies, M = g.materials, P = () => g.player;
  const out = (d, o) => (o.x - d.x) * d.nx + (o.z - d.z) * d.nz; // + outside the wall, - inside
  const free = (x, z) => g.nav.foot.free(x, z);
  const tap = async (code) => { g.input.down.add(code); g.input.pressed.add(code); await api._step(1); g.input.down.delete(code); await api._step(1); };
  const gone = (...cs) => { for (const c of cs) if (c && g.chars.includes(c)) g.removeChar(c); };
  const clearRound = (x, z, r) => {
    for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - x, c.z - z) < r) g.removeChar(c);
    const B = g.rites?.bodies;
    if (B) { for (const [k, R] of B) if (!R.c && Math.hypot(R.x - x, R.z - z) < r) B.delete(k); g.rites.dirty = true; }
  };
  // An island door with clear ground both sides (a single leaf, on the street floor, not below it).
  const pick = (material) => I.doors.find((d) => (d.kind === 'front' || d.kind === 'back') && d.leaves.length === 1 && !d.ug && !d.ring && (d.y ?? 0) < 0.5 && d.material === material && Math.max(Math.abs(d.x), Math.abs(d.z)) < 440
    && [1.5, 3, 6, 9].every((k) => free(d.x + d.nx * k, d.z + d.nz * k)) && [1.2, 2.2, 3.2].every((k) => free(d.x - d.nx * k, d.z - d.nz * k)));
  // The door as built, whole and unlocked, at angle th (0 = shut).
  const fresh = (d, th = 0) => {
    const rec = M.recs.get(`door:${d.id}`);
    if (rec) { M.dropRec?.(rec); M.recs.delete(rec.key); }
    M.brokenDoors.delete(d.id);
    if (g.gadgets.barred.some((b) => b.door === d)) g.gadgets.unbarricade(d);
    I.setLocked(d, false);
    d.broken = false; d.cracked = false; d.shutBy = null; d.poundAt = -99; d.braceAt = -99; d.shakeT = 0;
    for (const L of d.leaves) { L.th = th; L.w = 0; L.jamT = 0; I.orient(L); }
    I.tint(d); I.flush();
  };
  const inside = async (d, k) => { await C('teleport', { x: d.x - d.nx * k, z: d.z - d.nz * k }); const p = P(); p.x = d.x - d.nx * k; p.z = d.z - d.nz * k; p.vx = 0; p.vz = 0; await api._step(2); };
  const told = (c) => { c.ztarget = P(); Z.remember(c, P().x, P().z, 'told', P()); };
  const sprinterAt = (d, k) => { const c = Z.spawn(d.x + d.nx * k, d.z + d.nz * k, true); if (c) { c.x = d.x + d.nx * k; c.z = d.z + d.nz * k; told(c); Z.burst(c, 'check'); } return c; };
  // Step until fn() is truthy or cap seconds pass; returns the seconds it took, or null.
  const until = async (cap, fn, dt = 0.25) => { for (let t = 0; t < cap; t += dt) { await C('step', { seconds: dt }); if (fn()) return +(t + dt).toFixed(2); } return null; };
  const setup = async (d) => { await stage(); g.godMode = true; clearRound(d.x, d.z, 60); await C('setTime', { hour: 12 }); };
  const wrap = (fn) => hush(async () => { try { return await fn(); } finally { g.godMode = false; g.aimOverride = null; g.input.down.delete('KeyE'); } });

  await check('door pound: the rows - a sprinter in its frenzy pounds a door more than three times as hard as a shambler thumps it; a frenzy weaker than that is caught', async () => {
    const a = validateInfected();
    const weak = { ...INFECTED, sprinter: { ...INFECTED.sprinter, frenzy: { every: 2, dmg: 6, slam: 10, slamCool: 4 } } };
    const b = validateInfected(weak);
    return (a.length === 0 && b.some((s) => /frenzy/.test(s)) && DOOR.braceMul > 0 && DOOR.braceMul < 1 && DOOR.shutAngle < 0.45) || { a, b };
  });

  await check('door pound: THE LATCH - an open door lets a shambler that knows of you walk in; pulled shut with your own E (E\'s first with the infected near, even with someone beside you to talk to) the same door stops it: it never crosses, it beats on it, the leaf shudders and loses hp; E at the door you just shut leans on it and never kicks it open; and you cannot shut it standing in the doorway', async () => wrap(async () => {
    const d = pick('wood');
    if (!d) return 'no wooden island door with clear ground both sides';
    await setup(d);
    const made = [];
    try {
      // 1. open: it walks in
      fresh(d, 1.3);
      await inside(d, 5);
      const a = Z.spawn(d.x + d.nx * 4, d.z + d.nz * 4, false); made.push(a); a.x = d.x + d.nx * 4; a.z = d.z + d.nz * 4; a.zSpeed = 2.6; told(a);
      const tIn = await until(14, () => { if (a.alive && out(d, a) > 0) told(a); return out(d, a) < -0.6; });
      gone(a);
      // 2. shut by your hand: E at the open door with one of them 12 m out
      fresh(d, 1.3);
      await inside(d, 1.5);
      const b = Z.spawn(d.x + d.nx * 12, d.z + d.nz * 12, false); made.push(b); b.x = d.x + d.nx * 12; b.z = d.z + d.nz * 12; b.zSpeed = 2.6; b.timer = 99; b.wx = b.x; b.wz = b.z;
      // a stranger at your back (E would talk to them) - with one of the infected 12 m out, the door still comes first
      const pal = g.addChar({ x: P().x - d.nx * 1.2, z: P().z - d.nz * 1.2, faction: 'drifter', weapon: null, hp: 100, name: 'Bystander (selftest)', flag: 'US' }); made.push(pal);
      pal.timer = 99; pal.wx = pal.x; pal.wz = pal.z; // behind you, deeper in the room (clear floor: never shoved into the doorway)
      await api._step(3);
      const prompt = g.hud.s.prompt ?? '';
      await tap('KeyE'); await api._step(2);
      const shut = I.isShut(d), by = d.shutBy, talked = !!g.dialogue.npc;
      if (g.dialogue.npc) g.dialogue.close();
      // E again at the door you just shut, before any blow, the stranger still at your back: it leans (nobody takes
      // the key), it never kicks the door open, and it never opens a talk
      const kicks0 = g.events.filter((e) => e.type === 'doorKick').length;
      await inside(d, 1.75);
      await tap('KeyE'); await api._step(2); // from 1.75 m: a boot's reach, not a shoulder's
      const farPrompt = g.hud.s.prompt ?? '';
      await inside(d, 1.1);
      g.input.down.add('KeyE'); await api._step(6);
      const leanedEarly = I.braced(d), lean = g.hud.s.prompt ?? '';
      g.input.down.delete('KeyE'); await api._step(2);
      const talked2 = !!g.dialogue.npc;
      if (g.dialogue.npc) g.dialogue.close();
      gone(pal);
      const stillShut = I.isShut(d) && !talked2 && g.events.filter((e) => e.type === 'doorKick').length === kicks0;
      // the doorway: a car parked ALONG the wall 1.7 m clear of the door does not block it; one across it does; nor does
      // somebody on the floor above
      for (const L of d.leaves) { L.th = 1.3; L.w = 0; I.orient(L); } I.flush();
      await inside(d, 3.2);
      const fakeV = { x: d.x + d.nx * 2.9, z: d.z + d.nz * 2.9, h: Math.atan2(d.ux, d.uz), len: 4.4, wid: 1.9, type: 'sedan' };
      g.vehicles.push(fakeV);
      let carAlong = null, carAcross = null;
      try {
        carAlong = I.inDoorway(d) === fakeV;
        fakeV.x = d.x + d.nx * 0.4; fakeV.z = d.z + d.nz * 0.4; fakeV.h = Math.atan2(d.nx, d.nz);
        carAcross = I.inDoorway(d) === fakeV;
      } finally { g.vehicles.splice(g.vehicles.indexOf(fakeV), 1); }
      const up = g.addChar({ x: d.x, z: d.z, faction: 'drifter', weapon: null, hp: 100, name: 'Upstairs (selftest)', flag: 'US' }); made.push(up);
      up.x = d.x; up.z = d.z; up.gy = (d.y ?? 0) + 3.2;
      const upstairs = I.inDoorway(d) === up;
      gone(up);
      // standing IN the doorway you cannot shut it on yourself
      for (const L of d.leaves) { L.th = 1.3; L.w = 0; I.orient(L); } I.flush();
      const self = I.shutDoor(d, Object.assign(P(), { x: d.x, z: d.z }));
      for (const L of d.leaves) { L.th = 0; L.w = 0; I.orient(L); } I.flush();
      await inside(d, 2.2);
      const hp0 = I.doorHp(d).hp, th0 = Z.counts.thumps, ev0 = g.eventSeq;
      told(b);
      let crossed = false, shook = 0, minOut = 99;
      const tBeat = await until(40, () => { told(b); if (out(d, b) < 0.1 && !d.broken) crossed = true; shook = Math.max(shook, d.shakeT); minOut = Math.min(minOut, out(d, b)); return Z.counts.thumps - th0 >= 4 || d.broken; });
      const hp1 = I.doorHp(d).hp, thumps = Z.counts.thumps - th0;
      const pounds = g.events.filter((e) => e.seq > ev0 && e.type === 'doorPound' && e.door === d.id).length;
      const ok = tIn !== null && /class="warn">Shut the door/.test(prompt) && shut && by === P().id && !talked && /Step up to the door/.test(farPrompt) && leanedEarly && /LEANING/.test(lean) && stillShut && !self.ok && /doorway/.test(self.why) && carAlong === false && carAcross === true && upstairs === false
        && !crossed && tBeat !== null && thumps >= 4 && shook > 0 && hp1 < hp0 && pounds >= 3;
      return ok || { door: d.id, tIn, prompt, shut, by, talked, carAlong, carAcross, upstairs, farPrompt, leanedEarly, lean, stillShut, self, crossed, minOut: r1(minOut), tBeat, thumps, shook: r1(shook), hp0, hp1, pounds };
    } finally { gone(...made); fresh(d, 0); }
  }));

  await check('door pound: A SPRINTER AT THE DOOR - it screams, hits the shut door at a run (a slam), pounds it in a frenzy and has a wooden door off its hinges in under 15 s, then comes through; leaning on the door (hold E) makes it hold at least 1.5x as long, a locked door longer than a shut one (the lock is beaten, then the leaf), and a door barred with planks at least twice as long and longer than the lock alone', async () => wrap(async () => {
    const d = pick('wood');
    if (!d) return 'no wooden island door with clear ground both sides';
    await setup(d);
    const made = [];
    const run = async (how) => {
      fresh(d, 0);
      if (how === 'planks') { const r = g.gadgets.barricade(d, 'planks', null, false); if (!r.ok) return { err: r.why }; }
      if (how === 'lock') I.setLocked(d, true);
      await inside(d, how === 'lean' ? 1.1 : 2.4);
      clearRound(d.x, d.z, 60);
      const ev0 = g.eventSeq, fr0 = Z.counts.frenzy ?? 0;
      const c = sprinterAt(d, 9); made.push(c);
      // lean: E goes down (and stays down) once the door is being beaten - a press before that would kick it open
      let leaned = 0, n = 0, beaten = 0;
      const gave = () => d.broken || !I.isShut(d);
      const t = await until(how === 'bare' ? 30 : 120, () => { if (c.alive && !c.zsee) told(c); if (I.underAttack(d)) { beaten++; if (how === 'lean') g.input.down.add('KeyE'); n++; if (I.braced(d)) leaned++; } return gave(); });
      const through = gave() ? await until(8, () => { if (c.alive && !c.zsee) told(c); return out(d, c) < 0.2; }) : null;
      g.input.down.delete('KeyE');
      const ev = g.events.filter((e) => e.seq > ev0);
      const res = { t, through, slam: ev.some((e) => e.type === 'doorPound' && e.kind === 'slam' && e.door === d.id) || ev.some((e) => e.type === 'doorThump' && e.door === d.id), frenzy: (Z.counts.frenzy ?? 0) - fr0, scream: ev.some((e) => e.type === 'sprinterScream' && e.id === c.id), broken: !!d.broken, down: ev.some((e) => e.type === 'doorBrokenDown' && e.door === d.id), leaned: n ? r1(leaned / n) : 0, state: c.zs?.state };
      gone(c);
      return res;
    };
    try {
      const bare = await run('bare'), lean = await run('lean'), lock = await run('lock'), planks = await run('planks');
      const ok = bare.t !== null && bare.t < 15 && bare.through !== null && bare.slam && bare.frenzy >= 4 && bare.scream && bare.broken && bare.down
        && lean.t !== null && lean.t >= bare.t * 1.5 && lean.leaned > 0.4
        && lock.t !== null && lock.t >= bare.t * 1.2 && lock.broken // the lock first, then the leaf: a locked door is never the weaker one
        && !planks.err && planks.t !== null && planks.t >= bare.t * 2 && planks.t > lock.t && planks.broken;
      return ok || { door: d.id, bare, lean, lock, planks };
    } finally { gone(...made); fresh(d, 0); }
  }));

  await check('door pound: the noise draws more - a shambler resting 24 m off that knows of nothing hears the pounding (its memory is a heard sound, never your position) and walks to the door; nothing at the door, it stays where it was', async () => wrap(async () => {
    const d = pick('wood');
    if (!d) return 'no wooden island door with clear ground both sides';
    await setup(d);
    const made = [];
    try {
      fresh(d, 0);
      const rec = M.doorRec(d); rec.hp = rec.hpMax = 5000; // it must hold for the whole check
      await inside(d, 2.4);
      // the listener: off to one side of the door's line, 24 m out, facing away, nothing remembered
      const lx = d.x + d.nx * 16 + d.ux * 18, lz = d.z + d.nz * 16 + d.uz * 18;
      const spot = free(lx, lz) ? { x: lx, z: lz } : { x: d.x + d.nx * 16 - d.ux * 18, z: d.z + d.nz * 16 - d.uz * 18 };
      const s = Z.spawn(spot.x, spot.z, false); made.push(s); s.x = spot.x; s.z = spot.z; s.zSpeed = 2.4; s.timer = 99; s.wx = s.x; s.wz = s.z; s.face = Math.atan2(s.x - d.x, s.z - d.z);
      await C('step', { seconds: 4 });
      const d0 = Math.hypot(s.x - d.x, s.z - d.z), quiet = !Z.fresh(s);
      const c = sprinterAt(d, 7); made.push(c);
      let src = null;
      const tHear = await until(12, () => { if (c.alive && !c.zsee) told(c); if (Z.fresh(s)) src = s.zm.src; return src !== null; });
      await until(10, () => { if (c.alive && !c.zsee) told(c); return Math.hypot(s.x - d.x, s.z - d.z) < d0 - 8; });
      const d1 = Math.hypot(s.x - d.x, s.z - d.z), far = Math.hypot(s.zm.x - P().x, s.zm.z - P().z);
      const ok = quiet && tHear !== null && src === 'sound' && d1 < d0 - 6;
      return ok || { door: d.id, quiet, d0: r1(d0), d1: r1(d1), tHear, src, far: r1(far) };
    } finally { gone(...made); fresh(d, 0); }
  }));

  await check('door pound: it gives up - a steel door never breaks to fists (it only shudders); with TWO sprinters at it and you gone beyond their senses, both spend their bursts, stop beating it, search and forget (neither one\'s fists bring the other back), and the door still stands shut; a shambler that knows of nothing walks round a shut door instead of pressing at it', async () => wrap(async () => {
    const d = pick('metal');
    if (!d) return 'no steel island door with clear ground both sides';
    await setup(d);
    const made = [];
    try {
      fresh(d, 0);
      await inside(d, 2.4);
      const a = sprinterAt(d, 8), b = sprinterAt(d, 10); made.push(a, b);
      const both = () => [a, b].every((c) => c.zblock === d);
      const tBeat = await until(25, () => { for (const c of [a, b]) if (c.alive && !c.zsee) told(c); return both() && (Z.counts.frenzy ?? 0) > 0 && I.underAttack(d); });
      const H1 = I.doorHp(d);
      a.ztarget = null; b.ztarget = null;
      await C('teleport', { x: P().x - d.nx * 150, z: P().z - d.nz * 150 }); // out of all their senses (a position staged, as the memory check does)
      const S = INFECTED.sprinter;
      const tQuit = await until(S.burst + S.overheat + S.sense.memory + S.sense.search + 30, () => [a, b].every((c) => !c.zblock && !Z.fresh(c)), 0.5);
      const H2 = I.doorHp(d);
      await until(6, () => false, 0.5);
      const stayedQuit = [a, b].every((c) => !c.zblock);
      gone(a, b);
      // one that knows of nothing: its wander leads it at the shut door; it never presses there (no zdoor, it detours)
      await inside(d, 2.4); await C('teleport', { x: d.x - d.nx * 150, z: d.z - d.nz * 150 });
      const w = Z.spawn(d.x + d.nx * 3, d.z + d.nz * 3, false); made.push(w); w.x = d.x + d.nx * 3; w.z = d.z + d.nz * 3; w.zSpeed = 2.4;
      w.wx = d.x - d.nx * 4; w.wz = d.z - d.nz * 4; w.timer = 12;
      let pressed = 0, n = 0, blows0 = Z.counts.thumps, nearest = 99;
      await until(8, () => { n++; if (w.zblock || w.zdoor) pressed++; nearest = Math.min(nearest, Math.hypot(w.x - d.x, w.z - d.z)); if (out(d, w) > 2) { w.wx = d.x - d.nx * 4; w.wz = d.z - d.nz * 4; w.timer = 12; } return false; });
      // the same door LOCKED: pressed against it with nothing remembered, it takes nothing off the lock
      I.setLocked(d, true);
      const lock0 = d.lockHp;
      w.x = d.x + d.nx * 1.0; w.z = d.z + d.nz * 1.0; w.wx = d.x - d.nx * 4; w.wz = d.z - d.nz * 4; w.timer = 12;
      await until(5, () => { if (out(d, w) > 2) { w.wx = d.x - d.nx * 4; w.wz = d.z - d.nz * 4; w.timer = 12; } return false; });
      const lockKept = d.lockHp === lock0 && d.locked;
      I.setLocked(d, false);
      const idle = pressed === 0 && Z.counts.thumps === blows0 && out(d, w) > 0 && nearest < 1.6 && lockKept;
      const ok = tBeat !== null && !H1.breaks && H2.hp === H2.max && tQuit !== null && stayedQuit && I.isShut(d) && !d.broken && idle;
      return ok || { door: d.id, tBeat, tQuit, stayedQuit, H1, H2, shut: I.isShut(d), a: { st: a.zs?.state, fresh: Z.fresh(a), block: !!a.zblock }, b: { st: b.zs?.state, fresh: Z.fresh(b), block: !!b.zblock }, idle, pressed, nearest: r1(nearest), lockKept, wOut: r1(out(d, w)) };
    } finally { gone(...made); fresh(d, 0); await C('teleport', { x: d.x - d.nx * 3, z: d.z - d.nz * 3 }); }
  }));

  await check('door pound: shared - what a second player needs travels as plain rows: a hurt leaf is in the leaf keys (a standing door never as 0) and a shut door is told once; applied on a door as built they hurt it, shut it and (at 0) take it off its hinges; a row never heals a door or breaks a steel one; a row for a door not loaded here waits; a blow struck elsewhere makes this page\'s door shudder; a save and a load keep a hurt leaf', async () => wrap(async () => {
    const d = pick('wood'), st = pick('metal');
    if (!d || !st || !g.shard) return 'no wooden and steel door, or no shard client';
    await setup(d);
    const S = g.shard, keep = { sentL: S.sentL, waitL: S.waitL, shuts: S.shuts };
    try {
      S.sentL = {}; S.waitL = {}; S.shuts = [];
      fresh(d, 1.3);
      await inside(d, 1.5);
      const k0 = S.leafKeys()[d.id];
      const sh = I.shutDoor(d, P());
      M.hitDoor(d, 40, 'pound', null);
      const H = I.doorHp(d), k1 = S.leafKeys()[d.id], patch = S.diffLeaves(), again = S.diffLeaves();
      const rec = M.doorRec(d); const hpKeep = rec.hp; rec.hp = 0.3; const tiny = S.leafHp(d); rec.hp = hpKeep; // nearly gone is still standing
      const saved = M.save();
      // the same rows applied to the door as built (what the other page does)
      fresh(d, 1.3);
      await inside(d, 4);
      S.sentL = {};
      S.mergeLeaves({ [d.id]: { p: H.hp } });
      S.heardShuts([d.id]);
      const got = { shut: I.isShut(d), hp: I.doorHp(d).hp };
      S.mergeLeaves({ [d.id]: { p: H.max } }); // a row that would heal it
      const healed = I.doorHp(d).hp > H.hp;
      d.shakeT = 0; I.shaking.length = 0;
      S.heardPounds([{ d: d.id, k: 'frenzy', n: 5 }]);
      const shook = d.shakeT > 0 && I.underAttack(d);
      S.mergeLeaves({ [d.id]: { p: 0 } });
      const off = !!d.broken;
      // steel is never taken off its hinges by a row; a door that is not here waits for its row
      fresh(st, 0);
      S.mergeLeaves({ [st.id]: { p: 0 }, 'not:here:d9': { p: 12 } });
      const steelStands = !st.broken && I.isShut(st), waits = S.waitL['not:here:d9'] === 12;
      // a save and a load
      fresh(d, 0);
      M.load(saved);
      const kept = I.doorHp(d).hp;
      const ok = k0 === undefined && sh.ok && k1 === H.hp && patch?.[d.id]?.p === H.hp && again === null && tiny === 1 && got.shut && got.hp === H.hp && !healed && shook && off && steelStands && waits && kept === H.hp;
      return ok || { door: d.id, k0, sh: sh.ok, k1, H, patch, again, tiny, got, healed, shook, off, steelStands, waits, kept };
    } finally { fresh(d, 0); fresh(st, 0); S.sentL = { ...S.leafKeys() }; S.waitL = keep.waitL; S.shuts = keep.shuts; }
  }));
}
