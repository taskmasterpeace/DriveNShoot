// OUT OF AN UPPER WINDOW, for agents (docs/design/WEB_WINDOW_EXIT.md; systems/windowexit.js; rows data/interiors.js
// WINDOW_EXIT): the `windowExit` command and the checks. The player's part is the real E key held; where they stand and
// which way they face is staged.
import { WINDOW_EXIT, validateWindowExit } from '../data/interiors.js';
import { LADDER } from '../data/actions.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function windowExitCommands(api) {
  const g = api.g;
  return {
    windowExit: {
      group: 'player', desc: 'OUT OF AN UPPER WINDOW (docs/design/WEB_WINDOW_EXIT.md): upstairs, facing a window opening in an outside wall, hold E to climb out, hang and drop to the street. This reads it: the window you face (where, the drop in m, what it will cost in hp, what is in the way below), whether you are high enough for one to be a way out, the last one you took (a sprinter in its burst may follow for 25 s), counts, and the rows. To do it: stand at the window facing out and hold E (holdKey code=KeyE seconds=1.2).',
      args: {},
      run: async () => ({ ...g.windowExit.view(), problems: validateWindowExit() }),
    },
  };
}

export async function windowExitChecks({ g, api, C, check, hush }) {
  const WE = g.windowExit, P = () => g.player, Z = g.zombies, I = g.input;
  // A window on floor k of storeyed building S: walk the inside of each outer wall facing out until the rule finds one.
  const windowOn = (S, k, wantClear = true) => {
    const p = P(), b = S.b, y = S.Y[k] + (S.y0 ?? 0), keep = { x: p.x, z: p.z, gy: p.gy, face: p.face };
    const sides = [[0, -1, 'z', b.minZ], [0, 1, 'z', b.maxZ], [-1, 0, 'x', b.minX], [1, 0, 'x', b.maxX]];
    for (const [nx, nz, ax, edge] of sides) for (let a = (ax === 'z' ? b.minX : b.minZ) + 1; a < (ax === 'z' ? b.maxX : b.maxZ) - 1; a += 0.4) {
      p.x = ax === 'z' ? a : edge - nx * 1.0; p.z = ax === 'z' ? edge - nz * 1.0 : a; p.gy = y; p.face = Math.atan2(nx, nz); g.standOn(p);
      if (Math.abs((p.gy ?? 0) - y) > 0.3 || p.storey !== S) continue;
      const F = WE.find(p);
      if (F && (!wantClear || !F.blocked)) return { x: p.x, z: p.z, face: p.face, y, nx, nz, drop: F.drop, land: { ...F.land } };
    }
    Object.assign(p, keep); g.standOn(p);
    return null;
  };
  // A dog at your heel takes E (feed it, call it) before a window does, as it should: the checks stand the dogs aside.
  const dogsAside = () => { const moved = []; for (const d of g.dogs?.dogs ?? []) if (Math.hypot(d.x - P().x, d.z - P().z) < 60) { moved.push([d, d.x, d.z]); d.x += 300; d.z += 300; } return () => { for (const [d, x, z] of moved) { d.x = x; d.z = z; } }; };
  const stand = async (w) => { const p = P(); p.x = w.x; p.z = w.z; p.gy = w.y; p.face = w.face; p.vx = 0; p.vz = 0; g.standOn(p); g.aimOverride = { x: w.x + w.nx * 6, z: w.z + w.nz * 6 }; await api._step(3); };

  await check('window exit: the rows validate (a hang longer than a storey, a hold of no time and an unknown follower kind are each caught); on the street floor a window is not a way out, and upstairs a blank wall is not one', async () => {
    const a = validateWindowExit(), W = WINDOW_EXIT, keep = { hang: W.hang, hold: W.hold, kinds: W.follow.kinds };
    W.hang = 9; const b = validateWindowExit(); W.hang = keep.hang;
    W.hold = 0; const c = validateWindowExit(); W.hold = keep.hold;
    W.follow.kinds = ['dragon']; const d = validateWindowExit(); W.follow.kinds = keep.kinds;
    await C('start');
    const S = g.storeys.list.slice().sort((x, y) => y.Y.length - x.Y.length)[0];
    await C('teleport', { x: (S.b.minX + S.b.maxX) / 2, z: (S.b.minZ + S.b.maxZ) / 2 }); await api._step(4);
    const street = WE.find(P()); // on the street floor: never
    await C('teleport', { x: (S.b.minX + S.b.maxX) / 2, z: (S.b.minZ + S.b.maxZ) / 2, floor: 2 }); await api._step(4);
    const p = P(); p.face = 0; const mid = WE.find(p); // the middle of the floor, nothing in reach
    return (a.length === 0 && b.length === 1 && c.length === 1 && d.length === 1 && validateWindowExit().length === 0 && street === null && mid === null) || { a, b, c, d, street: !!street, mid: !!mid };
  });

  await check('window exit: out of a third-floor window - upstairs in the six-storey tower, facing a window, the prompt offers the drop and what it will cost; E held for a second puts you on the street below, outside the building, hurt by the fall rule (the height less the hang, past the safe height, through the same damage call as any hurt) and down for a moment; nothing happens on a tap; from the floor above the street floor in a low building the drop is inside the safe height and costs nothing', async () => hush(async () => {
    await C('start'); g.godMode = false;
    const S = g.storeys.list.slice().sort((x, y) => y.Y.length - x.Y.length)[0];
    let dogsBack = () => {};
    try {
      await C('teleport', { x: (S.b.minX + S.b.maxX) / 2, z: (S.b.minZ + S.b.maxZ) / 2, floor: 2 }); await api._step(6);
      const w = windowOn(S, 2); if (!w) return 'no clear window on floor 3 of the tower';
      dogsBack = dogsAside();
      await stand(w);
      const p = P(); p.hp = p.maxHp ?? 100;
      const prompt = g.hud.s.prompt ?? '', view = await C('windowExit', {});
      // a tap: nothing
      I.keyDown('KeyE'); await api._step(6); I.keyUp('KeyE'); await api._step(6);
      const afterTap = { gy: r1(p.gy ?? 0), storey: p.storey === S };
      await stand(w);
      const hp0 = p.hp, ev0 = g.eventSeq, want = Math.max(0, w.drop - LADDER.fall.safe) * LADDER.fall.hpPerM;
      I.keyDown('KeyE'); await api._step(Math.ceil(60 * (WINDOW_EXIT.hold + 0.25))); I.keyUp('KeyE'); await api._step(2);
      const out = { gy: r1(p.gy ?? 0), storey: p.storey ? 'in' : null, at: Math.hypot(p.x - w.land.x, p.z - w.land.z), inB: p.x > S.b.minX && p.x < S.b.maxX && p.z > S.b.minZ && p.z < S.b.maxZ, lost: hp0 - p.hp, down: p.knockT > 0 || p.knockMax > 0 };
      const ev = g.events.filter((e) => e.seq > ev0 && e.type === 'windowExit');
      // a low building: one floor up, the drop is inside the safe height
      const low = g.storeys.list.find((s) => s !== S && s.Y.length >= 2 && s.Y[1] - WINDOW_EXIT.hang <= LADDER.fall.safe && s.Y[1] >= WINDOW_EXIT.minUp);
      let lowRes = 'no low building';
      if (low) {
        await C('teleport', { x: (low.b.minX + low.b.maxX) / 2, z: (low.b.minZ + low.b.maxZ) / 2, floor: 1 }); await api._step(6);
        const w2 = windowOn(low, 1);
        if (w2) { p.knockT = 0; p.knockMax = 0; await api._step(30); await stand(w2); p.hp = p.maxHp ?? 100; const h0 = p.hp; I.keyDown('KeyE'); await api._step(Math.ceil(60 * (WINDOW_EXIT.hold + 0.25))); I.keyUp('KeyE'); await api._step(2); lowRes = { lost: h0 - p.hp, gy: r1(p.gy ?? 0), out: !p.storey }; }
        else lowRes = 'no clear window';
      }
      const ok = /Climb out and drop/.test(prompt) && view.window && Math.abs(view.window.drop - w.drop) < 0.05 && view.window.hurt === Math.round(want) && want > 5
        && afterTap.storey && Math.abs(afterTap.gy - r1(w.y)) < 0.2
        && out.storey === null && Math.abs(out.gy - r1(w.land.y)) < 0.2 && out.at < 0.6 && !out.inB && out.lost > 5 && out.lost <= want + 1 && out.down && ev.length === 1 && ev[0].you === true
        && typeof lowRes !== 'string' && lowRes.lost === 0 && lowRes.out;
      return ok || JSON.stringify({ prompt, view: view.window, afterTap, out, want: r1(want), drop: r1(w.drop), ev: ev.length, lowRes });
    } finally { dogsBack(); g.aimOverride = null; I.keyUp('KeyE'); const p = P(); p.hp = p.maxHp ?? 100; p.knockT = 0; p.knockMax = 0; g.godMode = false; await C('teleport', { x: 0, z: -40 }); await api._step(4); }
  }));

  await check('window exit: who follows - after you go out, a sprinter in its burst that reaches the sill jumps after you (it lands outside, takes the fall, a windowExit event of its kind); a shambler standing at the same sill does not; 25 s later nobody does', async () => hush(async () => {
    await C('start'); g.godMode = true;
    const S = g.storeys.list.slice().sort((x, y) => y.Y.length - x.Y.length)[0], made = [];
    let dogsBack = () => {};
    try {
      await C('teleport', { x: (S.b.minX + S.b.maxX) / 2, z: (S.b.minZ + S.b.maxZ) / 2, floor: 2 }); await api._step(6);
      const w = windowOn(S, 2); if (!w) return 'no clear window';
      dogsBack = dogsAside();
      for (const c of [...g.chars]) if (c !== P() && !c.npc && Math.hypot(c.x - w.x, c.z - w.z) < 40) g.removeChar(c);
      await stand(w);
      I.keyDown('KeyE'); await api._step(Math.ceil(60 * (WINDOW_EXIT.hold + 0.25))); I.keyUp('KeyE'); await api._step(2);
      if (P().storey) return JSON.stringify({ why: 'you did not get out', prompt: g.hud.s.prompt, knock: P().knockT, find: !!WE.find(P()), hold: WE.hold, gy: r1(P().gy ?? 0) });
      const at = (kind) => { const c = Z.spawn(w.x - w.nx * 0.4, w.z - w.nz * 0.4, kind === 'sprinter'); if (!c) return null; made.push(c); c.x = w.x - w.nx * 0.4; c.z = w.z - w.nz * 0.4; c.gy = w.y; g.standOn(c); c.ztarget = P(); Z.remember(c, P().x, P().z, 'told', P()); return c; };
      const sh = at('shambler'); await api._step(60);
      const shStays = !!sh && sh.storey === S && Math.abs((sh.gy ?? 0) - w.y) < 0.5;
      const ev0 = g.eventSeq, sp = at('sprinter'); if (sp) Z.burst(sp, 'check');
      let jumped = false; for (let i = 0; i < 40 && !jumped; i++) { if (sp && sp.zs?.state !== 'burst' && sp.storey === S) Z.burst(sp, 'check'); await api._step(6); jumped = !!sp && sp.storey !== S && Math.abs((sp.gy ?? 0) - w.land.y) < 0.6; }
      const ev = g.events.filter((e) => e.seq > ev0 && e.type === 'windowExit' && e.kind === 'sprinter');
      const hpLost = sp ? (sp.maxHp ?? 100) - sp.hp : 0;
      // long after: the way out is forgotten
      if (WE.last) WE.last.t = g.time - WINDOW_EXIT.follow.secs - 1; await api._step(2);
      const sp2 = at('sprinter'); if (sp2) Z.burst(sp2, 'check'); await api._step(60);
      const later = !!sp2 && sp2.storey === S;
      const ok = shStays && jumped && ev.length === 1 && hpLost > 0 && WE.last === null && later;
      return ok || JSON.stringify({ shStays, jumped, ev: ev.length, hpLost, last: WE.last === null, later, spGy: sp ? r1(sp.gy ?? 0) : null });
    } finally { dogsBack(); for (const c of made) if (c && g.chars.includes(c)) g.removeChar(c); g.aimOverride = null; I.keyUp('KeyE'); g.godMode = false; P().knockT = 0; await C('teleport', { x: 0, z: -40 }); await api._step(4); }
  }));
}
