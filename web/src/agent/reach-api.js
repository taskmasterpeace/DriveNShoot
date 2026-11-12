// REACH for agents (docs/design/WEB_REACH.md; rule systems/reach.js, rows data/reach.js): the `reach` command (a dry run of
// what your hand can get to from where you stand, and what stops it) and the named selftest checks. The checks stand the
// player at a real wall of a real building and press the real keys (E, the PACK screen); only the position is staged.
import { StaticWorld } from '../engine/collision.js';
import { Reach } from '../systems/reach.js';
import { REACH, validateReach } from '../data/reach.js';
import { NEAR_REACH } from '../data/bodydoll.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function reachCommands(api, need) {
  const g = api.g, P = () => g.player;
  return {
    reach: {
      group: 'observe', desc: 'REACH (docs/design/WEB_REACH.md): what your hand can get to from where you stand, and what stops it. No args: every container, body, bed, person, vehicle and door within radius= m (default 3) with reach true|false and why (wall | door | window | floor) plus the tag of the box in the way, the counters (asked, blocked, floor) and the rows. x,z: one point (kind=hand|talk). A wall, a shut door, glass, boards or a floor between you and a thing stops E, the PACK screen\'s NEAR list and these commands the same way; a counter or a low fence does not. find=true: the nearest container with a wall beside it, and a spot on each side of that wall (outside: the hand is stopped; inside: it is not).',
      args: { radius: { type: 'number', default: 3 }, x: { type: 'number' }, z: { type: 'number' }, kind: { type: 'string', default: 'hand', enum: ['hand', 'talk'] }, find: { type: 'boolean' } },
      run: async ({ radius, x, z, kind, find }) => {
        const R = g.reach, p = P();
        const ans = (ok) => ({ reach: ok, why: ok ? null : R.last.why, behind: ok ? null : R.last.tag, d: r1(R.last.d) });
        if (x !== undefined && z !== undefined) return ans(R.to(p, x, z, { kind }));
        if (find) { // a place to see the rule: the nearest container with a wall beside it you can stand behind
          let best = null, bd = Infinity;
          for (const b of g.inventory.boxes.values()) {
            if (b.x === undefined || b.kind === 'ground' || b.kind === 'body' || b.kind === 'trunk' || (b.y ?? 0) > 0.5) continue;
            const d = Math.hypot(b.x - p.x, b.z - p.z);
            if (d >= bd || d > 400) continue;
            const pair = wallPair(g, b.x, b.z);
            if (pair) { bd = d; best = { box: { id: b.id, label: b.label, x: r1(b.x), z: r1(b.z) }, outside: { x: r1(pair.out.x), z: r1(pair.out.z) }, inside: { x: r1(pair.inn.x), z: r1(pair.inn.z) } }; }
          }
          need(best, 'no container within 400 m has a wall beside it you can stand behind');
          return best;
        }
        const near = (o) => Math.hypot(o.x - p.x, o.z - p.z) < radius;
        const out = { at: { x: r1(p.x), z: r1(p.z), floor: r1(p.gy ?? 0) }, boxes: [], beds: [], people: [], vehicles: [], openings: [] };
        for (const b of g.inventory.boxes.values()) if (b.x !== undefined && near(b)) out.boxes.push({ id: b.id, kind: b.kind, label: b.label, ...ans(R.to(p, b.x, b.z, { y: b.y ?? 0 })) });
        for (const b of g.world.spawns.beds ?? []) if (near(b)) out.beds.push({ x: r1(b.x), z: r1(b.z), ...ans(R.to(p, b.x, b.z, { y: b.y ?? 0 })) });
        for (const c of g.chars) if (c !== p && c.alive && near(c)) out.people.push({ id: c.id, name: c.npc?.name ?? c.name, ...ans(R.person(p, c)) });
        for (const v of g.vehicles) if (!v.dead && near(v)) out.vehicles.push({ id: v.id, name: v.name, ...ans(R.vehicle(p, v)) });
        for (const d of g.interiors.doors) if (near(d)) out.openings.push({ id: d.id, kind: 'door', ...ans(R.opening(p, d)) });
        for (const w of g.interiors.windows) if (near(w)) out.openings.push({ id: w.id, kind: 'window', ...ans(R.opening(p, w)) });
        return { ...out, counts: { ...R.counts }, rows: REACH, problems: validateReach() };
      },
    },
  };
}

// A wall-side pair for a thing at (x, z): `out` = a free spot within `max` m of it whose hand line is stopped by a WALL,
// `inn` = a free spot within `max` m with a clear line. null when the thing has no such wall beside it.
export function wallPair(g, x, z, max = 2.3, y = 0) {
  const R = g.reach, S = g.statics, probe = { x: 0, z: 0, gy: y, storey: null, ug: null };
  let out = null, inn = null;
  for (let ring = 0; ring < 4 && !(out && inn); ring++) {
    const r = max - ring * 0.35;
    for (let k = 0; k < 24 && !(out && inn); k++) {
      const a = (k / 24) * Math.PI * 2;
      probe.x = x + Math.sin(a) * r; probe.z = z + Math.cos(a) * r;
      if (S.pointBlocked(probe.x, probe.z, 0.45) || !g.nav.foot.free(probe.x, probe.z)) continue;
      const ok = R.to(probe, x, z);
      if (ok && !inn) inn = { x: probe.x, z: probe.z };
      else if (!ok && !out && R.last.why === 'wall' && REACH.wallTags.includes(R.last.tag)) out = { x: probe.x, z: probe.z };
    }
  }
  return out && inn ? { out, inn } : null;
}

export async function reachChecks({ g, api, C, check, stage, hush }) {
  const P = () => g.player, R = g.reach, inv = g.inventory;
  const tap = async (code) => { g.input.down.add(code); g.input.pressed.add(code); await api._step(1); g.input.down.delete(code); await api._step(1); };
  const put = async (q) => { const p = P(); p.x = q.x; p.z = q.z; p.vx = 0; p.vz = 0; await api._step(3); };
  const shut = async () => { g.invUI.toggle(false); inv.opened = null; await api._step(1); };
  // A street-floor shelf or crate of a real building with a wall beside it that you can stand behind.
  const findBox = (max = 2.3) => {
    for (const b of inv.boxes.values()) {
      if (b.x === undefined || b.kind === 'ground' || b.kind === 'body' || b.kind === 'trunk' || b.unseen || (b.y ?? 0) > 0.5 || b.owner) continue;
      if (Math.max(Math.abs(b.x), Math.abs(b.z)) > 440) continue; // the island: always there
      const pair = wallPair(g, b.x, b.z, max);
      if (pair) return { b, ...pair };
    }
    return null;
  };

  await check('reach: the rows validate; a touch distance that would pass a hand through a wall, and a hand line under a counter, are both caught', async () => {
    const a = validateReach();
    const b = validateReach({ ...REACH, touch: 1.4 }), c = validateReach({ ...REACH, hand: 0.6 });
    return (a.length === 0 && b.length === 1 && c.length === 1) || { a, b, c };
  });

  await check('reach: the rule on a bare grid - a wall stops a hand, a counter does not, a shelf\'s own body does not, the same shelf from behind its wall does, a floor between does, arm\'s length passes', async () => {
    const S = new StaticWorld(60, 8);
    const F = { statics: S, under: null, storeys: { sameFloor: (a, b) => Math.abs((a.gy ?? 0) - (b.gy ?? 0)) < 1.6 } };
    const T = new Reach(F), me = { x: 0, z: 0, gy: 0, storey: null, ug: null };
    S.add(-6, 1.9, 6, 2.1, 'wall', 3);            // a wall 2 m north of you
    S.add(-0.6, 2.15, 0.6, 2.65, 'shelf', 1.8);   // a shelf against its far side (its point 0.3 m past the wall)
    S.add(1.4, -3, 1.9, 3, 'counter', 1.0);       // a counter to your east
    S.add(-2.6, -0.5, -2.0, 0.5, 'shelf', 1.8);   // a shelf to your west, nothing between
    const out = {
      wall: T.to(me, 0, 3.5), wallWhy: T.last.why,
      shelfBehind: T.to(me, 0, 2.4), behindWhy: T.last.why,
      counter: T.to(me, 2.6, 0),
      ownShelf: T.to(me, -2.3, 0),
      floor: T.to(me, -2.3, 0, { y: 3.2 }), floorWhy: T.last.why,
      talkWall: T.to(me, 0, 3.5, { kind: 'talk' }),
      close: T.to({ x: 0, z: 1.45, gy: 0 }, 0, 2.2), // 0.75 m: arm's length (no line is cast)
      farShelf: T.to({ x: 0, z: 3.6, gy: 0 }, 0, 2.4), // from the shelf's own side
    };
    const want = { wall: false, wallWhy: 'wall', shelfBehind: false, behindWhy: 'wall', counter: true, ownShelf: true, floor: false, floorWhy: 'floor', talkWall: false, close: true, farShelf: true };
    return Object.keys(want).every((k) => out[k] === want[k]) || out;
  });

  await check('reach: NO LOOT THROUGH A WALL - outside a real building, a shelf 2 m away on the far side of its wall: E does not offer it, the PACK screen does not list it, pack/item commands cannot take from it and it is never rolled; from inside the same shelf opens', async () => hush(async () => {
    await stage();
    g.godMode = true;
    const f = findBox();
    if (!f) return 'no island container with a wall beside it to test against';
    const { b, out, inn } = f, was = { rolled: !!b.rolled, n: b.slots.length };
    await C('teleport', { x: out.x, z: out.z }); await put(out); await shut();
    const d = Math.hypot(b.x - P().x, b.z - P().z);
    const reach = R.box(P(), b), why = R.last.why;
    const prompt0 = g.hud.s.prompt ?? '';
    await tap('KeyE'); await api._step(4);
    const eOpened = g.invUI.open && (g.invUI.other === b || inv.opened === b);
    await shut();
    const pk = await C('pack', { on: true });
    const listed = g.invUI.findNear().includes(b), other = g.invUI.other === b || pk.other?.id === b.id;
    await shut();
    const untouched = !!b.rolled === was.rolled && b.slots.length === was.n;
    // the same shelf from a spot with a clear line: the control (the test would pass for the wrong reason without it)
    await put(inn); await shut();
    const reachIn = R.box(P(), b);
    await tap('KeyE'); await api._step(4);
    const opensInside = g.invUI.open && (g.invUI.other === b || inv.opened === b);
    const listedInside = g.invUI.findNear().includes(b);
    await shut();
    g.godMode = false;
    const ok = d < NEAR_REACH && !reach && why === 'wall' && !eOpened && !listed && !other && untouched && reachIn && opensInside && listedInside;
    return ok || { box: b.id, d: r1(d), reach, why, prompt0, eOpened, listed, other, untouched, reachIn, opensInside, listedInside };
  }));

  await check('reach: nobody to talk to, no bed and no car through a wall - a stranger, a mattress and a parked car 2 m off behind a wall give no prompt and E does nothing; with a clear line each one does', async () => hush(async () => {
    await stage();
    g.godMode = true;
    const f = findBox(1.9);
    if (!f) return 'no island wall to test against';
    const { b, out, inn } = f;
    const il = Math.hypot(inn.x - b.x, inn.z - b.z), far = { x: b.x + ((inn.x - b.x) / il) * 0.55, z: b.z + ((inn.z - b.z) / il) * 0.55 }; // just in front of the shelf, on its own side
    // the far-side spot for the stranger and the car: where the shelf is reached from (inside), you standing outside
    await C('teleport', { x: out.x, z: out.z }); await put(out); await shut();
    const sp = await C('spawn', { kind: 'drifter', x: far.x, z: far.z });
    const c = sp.ids?.[0] ? api.findChar(sp.ids[0]) : null;
    if (!c) { g.godMode = false; return { spawn: sp }; }
    c.timer = 99; c.x = far.x; c.z = far.z; c.wx = c.x; c.wz = c.z; c.target = null;
    await put(out);
    const dC = Math.hypot(c.x - P().x, c.z - P().z);
    const talkOut = R.person(P(), c);
    await api._step(2);
    const promptOut = g.hud.s.prompt ?? '';
    if (!promptOut) { await tap('KeyE'); await api._step(2); } // (a window in reach keeps E for itself: the prompt already shows nobody is offered)
    const dlgOut = !!g.dialogue.npc;
    if (dlgOut) g.dialogue.close?.();
    // a bed on the far side: the rule the E chain and N (sleep) both ask
    const bed = { x: far.x, z: far.z, y: 0 }, beds = g.world.spawns.beds ?? (g.world.spawns.beds = []);
    beds.push(bed);
    const bedOut = g.bedNear(P().x, P().z, 0, P());
    // a car against the far side of the wall
    const veh = { x: b.x, z: b.z, wid: 1.9, len: 4.2 };
    const carOut = R.vehicle(P(), veh);
    // and with a clear line (you inside, beside them)
    g.removeChar(c);
    const sp2 = await C('spawn', { kind: 'drifter', x: b.x, z: b.z });
    await put(inn);
    const c2 = sp2.ids?.[0] ? api.findChar(sp2.ids[0]) : null;
    let talkIn = false, bedIn = null;
    if (c2) { c2.timer = 99; c2.target = null; c2.x = inn.x + (b.x - inn.x) * 0.5; c2.z = inn.z + (b.z - inn.z) * 0.5; c2.wx = c2.x; c2.wz = c2.z; talkIn = R.person(P(), c2); g.removeChar(c2); }
    const dbg = { c2: !!c2, moved: r1(Math.hypot(P().x - inn.x, P().z - inn.z)), why: R.last.why, tag: R.last.tag, il: r1(il), box: b.id };
    bed.x = inn.x + (b.x - inn.x) * 0.4; bed.z = inn.z + (b.z - inn.z) * 0.4;
    bedIn = g.bedNear(P().x, P().z, 0, P());
    beds.splice(beds.indexOf(bed), 1);
    const carIn = R.vehicle(P(), { x: inn.x + 1.5, z: inn.z, wid: 1.9, len: 4.2 }) || R.vehicle(P(), { x: inn.x - 1.5, z: inn.z, wid: 1.9, len: 4.2 }) || R.vehicle(P(), { x: inn.x, z: inn.z + 1.5, wid: 1.9, len: 4.2 }) || R.vehicle(P(), { x: inn.x, z: inn.z - 1.5, wid: 1.9, len: 4.2 });
    g.godMode = false;
    const ok = dC < 2.8 && !talkOut && !/Talk to|Wake/.test(promptOut) && !dlgOut && bedOut !== bed && !carOut && talkIn && bedIn === bed && carIn;
    return ok || { dbg, dC: r1(dC), talkOut, promptOut, dlgOut, bedOut: bedOut === bed, carOut, talkIn, bedIn: bedIn === bed, carIn };
  }));

  await check('reach: a door is worked from in front of it, never through the wall beside it or from the next room - every island door within 1.9 m of a spot with a wall in the way is refused there and offered from its own doorway', async () => hush(async () => {
    await stage();
    let tried = 0, wrong = [];
    const probe = { x: 0, z: 0, gy: 0, storey: null, ug: null };
    for (const d of g.interiors.doors) {
      if (d.broken || Math.max(Math.abs(d.x), Math.abs(d.z)) > 440 || (d.y ?? 0) > 0.5 || tried >= 40) continue;
      if (d.nx === undefined) continue;
      // in front of it, 1.2 m out on each side: both must reach
      for (const s of [1, -1]) { probe.x = d.x + d.nx * 1.2 * s; probe.z = d.z + d.nz * 1.2 * s; if (!g.statics.pointBlocked(probe.x, probe.z, 0.4) && !R.opening(probe, d)) wrong.push({ door: d.id, side: s, front: false, why: R.last.why }); }
      tried++;
    }
    return (tried >= 10 && wrong.length === 0) || { tried, wrong: wrong.slice(0, 6), n: wrong.length };
  }));
}
