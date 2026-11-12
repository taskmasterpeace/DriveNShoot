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
            if (b.x === undefined || b.kind === 'ground' || b.kind === 'person' || b.kind === 'trunk' || (b.y ?? 0) > 0.5) continue;
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
      if (b.x === undefined || b.kind === 'ground' || b.kind === 'person' || b.kind === 'trunk' || b.unseen || (b.y ?? 0) > 0.5 || b.owner) continue;
      if (Math.max(Math.abs(b.x), Math.abs(b.z)) > 440) continue; // the island: always there
      const pair = wallPair(g, b.x, b.z, max);
      if (pair) return { b, ...pair };
    }
    return null;
  };

  await check('reach: the rows validate; a touch distance that would pass a hand through a thin wall, and a hand line under a counter, are both caught', async () => {
    const a = validateReach();
    const b = validateReach({ ...REACH, touch: 0.6 }), c = validateReach({ ...REACH, hand: 0.6 });
    return (a.length === 0 && b.length === 1 && c.length === 1) || { a, b, c };
  });

  await check('reach: the rule on a bare grid - a wall stops a hand, a counter does not, a shelf\'s own body does not, the same shelf from behind its wall does (standing pressed to the wall, and prone against a thin one), a floor between does, a big fixture is reached on its own collider, a car is stopped at its flank', async () => {
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
      pressed: T.to({ x: 0, z: 1.45, gy: 0, radius: 0.4 }, 0, 2.4), // pressed to the wall, the shelf 0.95 m off through it
      farShelf: T.to({ x: 0, z: 3.6, gy: 0 }, 0, 2.4), // from the shelf's own side
      armsLength: T.to({ x: 20, z: 0, gy: 0, radius: 0.4 }, 20.7, 0), // 0.7 m in the open: no line is cast
    };
    // a thin yard wall (0.2 m), a shelf's point 0.25 m past it, a PRONE body (radius 0.26) against it: 0.71 m apart
    S.add(30, 1.9, 40, 2.1, 'wall', 2.4);
    out.prone = T.to({ x: 35, z: 1.64, gy: 0, radius: 0.26 }, 35, 2.35);
    // a big fixture on its own collider (a 7.8 m cistern) from 4.3 m: reached as a fixture, not as a plain point
    S.add(-30 - 3.9, -3.9, -30 + 3.9, 3.9, 'dam', 2.4);
    out.fixture = T.fixture({ x: -30, z: 4.3, gy: 0, radius: 0.4 }, -30, 0);
    out.fixturePlain = T.to({ x: -30, z: 4.3, gy: 0, radius: 0.4 }, -30, 0);
    // a car (not on the grid) parked against the far side of the thin wall: the line stops at its flank and meets the wall
    out.carBehind = T.vehicle({ x: 35, z: 1.5, gy: 0, radius: 0.4 }, { x: 35, z: 3.2, wid: 1.9 });
    out.carBeside = T.vehicle({ x: 35, z: 1.5, gy: 0, radius: 0.4 }, { x: 35, z: -0.5, wid: 1.9 });
    // upstairs in a town lifted 6 m onto a hill: the partition stands on the BUILDING's ground (3.2 to 6.4 m over it)
    const part = S.add(50, 1.9, 60, 2.1, 'wall', 6.4); part.base = 3.0;
    const up = { x: 55, z: 0, gy: 9.2, storey: { y0: 6 }, ug: null, radius: 0.4 };
    out.upstairs = T.to(up, 55, 3.5);
    out.onStairs = T.to({ x: 0, z: 0, gy: 1.2, storey: { y0: 0 }, ug: null, radius: 0.4 }, 0, 3.5); // 1.2 m up a flight: still the street floor's wall
    const want = { wall: false, wallWhy: 'wall', shelfBehind: false, behindWhy: 'wall', counter: true, ownShelf: true, floor: false, floorWhy: 'floor', talkWall: false, pressed: false, farShelf: true, armsLength: true,
      prone: false, fixture: true, fixturePlain: false, carBehind: false, carBeside: true, upstairs: false, onStairs: false };
    return Object.keys(want).every((k) => out[k] === want[k]) || out;
  });

  await check('reach: NO LOOT THROUGH A WALL - outside a real building, a shelf 2 m away on the far side of its wall: E does not open it, the pack command does not make it the other side, the PACK screen does not list it and it is never rolled; from inside the same shelf opens; and a PACK left open on it lets go when you walk round the wall', async () => hush(async () => {
    await stage();
    g.godMode = true;
    const f = findBox();
    if (!f) return 'no island container with a wall beside it to test against';
    const { b, out, inn } = f, was = { rolled: !!b.rolled, n: b.slots.length };
    await C('teleport', { x: out.x, z: out.z }); await put(out); await shut();
    const d = Math.hypot(b.x - P().x, b.z - P().z);
    const reach = R.box(P(), b), why = R.last.why;
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
    // left open on it, you go back round the wall: within half a second it is not the other side any more
    const heldInside = g.invUI.other === b;
    await put(out); await api._step(40);
    const letGo = g.invUI.other !== b;
    await shut();
    g.godMode = false;
    const ok = d < NEAR_REACH && !reach && why === 'wall' && !eOpened && !listed && !other && untouched && reachIn && opensInside && listedInside && heldInside && letGo;
    return ok || { box: b.id, d: r1(d), reach, why, eOpened, listed, other, untouched, reachIn, opensInside, listedInside, heldInside, letGo };
  }));

  await check('reach: nobody to talk to, no bed and no car through a wall - a stranger, a mattress and a parked car 2 m off behind a wall give no prompt and E does nothing; with a clear line each one does', async () => hush(async () => {
    await stage();
    g.godMode = true;
    const f = findBox(1.7);
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
    const bed = { x: b.x, z: b.z, y: 0 }, beds = g.world.spawns.beds ?? (g.world.spawns.beds = []); // a mattress where the shelf stands: inside 1.8 m of you, the wall between
    beds.push(bed);
    const dBed = Math.hypot(bed.x - P().x, bed.z - P().z), bedPlain = g.bedNear(P().x, P().z, 0) === bed;
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
    bedIn = g.bedNear(P().x, P().z, 0, P());
    beds.splice(beds.indexOf(bed), 1);
    const carIn = R.vehicle(P(), { x: inn.x + 1.5, z: inn.z, wid: 1.9, len: 4.2 }) || R.vehicle(P(), { x: inn.x - 1.5, z: inn.z, wid: 1.9, len: 4.2 }) || R.vehicle(P(), { x: inn.x, z: inn.z + 1.5, wid: 1.9, len: 4.2 }) || R.vehicle(P(), { x: inn.x, z: inn.z - 1.5, wid: 1.9, len: 4.2 });
    g.godMode = false;
    const ok = dC < 2.8 && !talkOut && !/Talk to|Wake/.test(promptOut) && !dlgOut && dBed < 1.8 && bedPlain && bedOut !== bed && !carOut && talkIn && bedIn === bed && carIn;
    return ok || { dbg, dC: r1(dC), dBed: r1(dBed), bedPlain, talkOut, promptOut, dlgOut, bedOut: bedOut === bed, carOut, talkIn, bedIn: bedIn === bed, carIn };
  }));

  await check('reach: a door is worked from in front of it, never through a wall - every island door probed reaches from 1.2 m in front on both sides and is what E\'s own search (interiors.nearest) offers there; stand a wall in the hand\'s line and the same search stops offering it; take the wall away and it is offered again', async () => hush(async () => {
    await stage();
    const In = g.interiors, S = g.statics;
    // a wall piece put on the island grid for one assertion and taken off again (the grid has no remove of its own)
    const wallIn = (x0, z0, x1, z1) => S.add(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), 'wall', 3);
    const wallOut = (bx) => { const i = S.boxes.indexOf(bx); if (i >= 0) S.boxes.splice(i, 1); for (const list of S.cells) { const k = list.indexOf(bx); if (k >= 0) list.splice(k, 1); } };
    let probed = 0, fronts = 0, walled = 0;
    const wrong = [];
    const probe = { x: 0, z: 0, gy: 0, storey: null, ug: null, radius: 0.4 };
    for (const d of In.doors) {
      if (d.broken || d.ug || d.ring || d.nx === undefined || Math.max(Math.abs(d.x), Math.abs(d.z)) > 440 || (d.y ?? 0) > 0.5 || probed >= 40) continue;
      if (!d.locked && d.leaves.some((L) => Math.abs(L.th) > 0.3)) continue; // an open door is not E's to kick: skip it
      let any = false;
      for (const sd of [1, -1]) {
        probe.x = d.x + d.nx * 1.2 * sd; probe.z = d.z + d.nz * 1.2 * sd;
        if (S.pointBlocked(probe.x, probe.z, 0.4)) continue;
        any = true; fronts++;
        const reach = R.opening(probe, d), offered = In.nearest(probe) === d;
        if (!reach) { wrong.push({ door: d.id, side: sd, reach, why: R.last.why }); continue; }
        if (!offered) continue; // another door or a window is nearer on this side: E is that one's
        // a wall slab 0.55 m out from the door, across the hand's line
        const cx = d.x + d.nx * 0.55 * sd, cz = d.z + d.nz * 0.55 * sd;
        const slab = wallIn(cx - d.ux * 1.4 - d.nx * 0.08, cz - d.uz * 1.4 - d.nz * 0.08, cx + d.ux * 1.4 + d.nx * 0.08, cz + d.uz * 1.4 + d.nz * 0.08);
        let stopped = false, gone = false;
        try { stopped = !R.opening(probe, d) && R.last.why === 'wall'; gone = In.nearest(probe) !== d; } finally { wallOut(slab); }
        const back = In.nearest(probe) === d;
        walled++;
        if (!stopped || !gone || !back) wrong.push({ door: d.id, side: sd, stopped, gone, back });
      }
      if (any) probed++;
    }
    return (probed >= 10 && fronts >= 20 && walled >= 20 && wrong.length === 0) || { probed, fronts, walled, wrong: wrong.slice(0, 6), n: wrong.length };
  }));

  await check('reach: the other hands - a body behind a wall is not dragged (hold E) and the same body is from its own side; a body on the floor above is passed over and of two bodies the nearest one your hand can get to wins; a pile through the wall is not the ground at your feet; a junkyard hulk and the dam\'s cistern are offered by E from every side you can stand at', async () => hush(async () => {
    await stage();
    g.godMode = true;
    try {
    const S = g.statics, In = g.interiors;
    // a bare stretch of a real island wall: 0.6 m off each face free, a wall in the line, and nothing else E would take
    const bare = () => {
      const probe = { x: 0, z: 0, gy: 0, storey: null, ug: null, radius: 0.4 };
      for (const w of S.boxes) {
        if (w.tag !== 'wall' || w.height < 2.3 || w.base > 0 || w.holes) continue;
        const sx = w.maxX - w.minX, sz = w.maxZ - w.minZ, long = Math.max(sx, sz), thin = Math.min(sx, sz);
        if (long < 5 || thin > 0.6 || Math.max(Math.abs(w.minX), Math.abs(w.minZ), Math.abs(w.maxX), Math.abs(w.maxZ)) > 430) continue;
        const cx = (w.minX + w.maxX) / 2, cz = (w.minZ + w.maxZ) / 2, nx = sx < sz ? 1 : 0, nz = sx < sz ? 0 : 1, off = thin / 2 + 0.6;
        const A = { x: cx + nx * off, z: cz + nz * off }, B = { x: cx - nx * off, z: cz - nz * off }, B2 = { x: B.x + nz * 1.1, z: B.z + nx * 1.1 };
        if ([A, B, B2].some((q) => S.pointBlocked(q.x, q.z, 0.45) || !g.nav.foot.free(q.x, q.z))) continue;
        let clean = true;
        for (const q of [A, B2]) { probe.x = q.x; probe.z = q.z; if (In.nearest(probe) || inv.nearest(q.x, q.z, 2.6, true, 0) || g.bedNear(q.x, q.z, 0)) clean = false; }
        if (!clean) continue;
        probe.x = A.x; probe.z = A.z;
        if (R.to(probe, B.x, B.z) || R.last.why !== 'wall') continue;
        probe.x = B2.x; probe.z = B2.z;
        if (!R.to(probe, B.x, B.z)) continue;
        return { A, B, B2 };
      }
      return null;
    };
    const W = bare();
    if (!W) return 'no bare island wall with free ground both sides';
    const holdE = async (frames) => { g.input.down.add('KeyE'); g.input.pressed.add('KeyE'); for (let i = 0; i < frames; i++) await api._step(1); g.input.down.delete('KeyE'); await api._step(2); };
    // nobody and nothing by this wall that would take E instead (8 m: people not NPCs, body records, their boxes, piles in sight)
    const sweep = () => {
      const near = (q) => Math.hypot(q.x - W.A.x, q.z - W.A.z) < 8;
      for (const o of [...g.chars]) if (o !== g.player && !o.npc && near(o)) g.removeChar(o);
      const Bd = g.rites?.bodies;
      if (Bd) { for (const [k, q] of Bd) if (near(q.c ?? q)) Bd.delete(k); g.rites.dirty = true; }
      for (const [id, q] of [...inv.boxes]) if ((String(id).startsWith('body:') || (q.kind === 'ground' && !q.unseen)) && q.x !== undefined && near(q)) inv.boxes.delete(id); // (a body's box is kind 'person', id body:<who>)
      inv.opened = null; inv.drawPiles?.();
    };
    await C('teleport', { x: W.A.x, z: W.A.z }); await put(W.A); await shut();
    sweep();
    const sp = await C('spawn', { kind: 'drifter', x: W.B.x, z: W.B.z });
    const c = sp.ids?.[0] ? api.findChar(sp.ids[0]) : null;
    if (!c) return { spawn: sp };
    c.x = W.B.x; c.z = W.B.z;
    g.combat.damage(c, 9999, null, 0, 0, 'bullet');
    await api._step(45);
    for (const [id, q] of [...inv.boxes]) if (q.kind === 'ground' && Math.hypot(q.x - W.A.x, q.z - W.A.z) < 8) inv.boxes.delete(id); // what he dropped: the pile below must be the only one
    const lay = () => { c.x = W.B.x; c.z = W.B.z; c.vx = 0; c.vz = 0; }; // where he fell is staged: a dying man staggers
    lay();
    // from the far side of the wall: 1.7 m off, in bodyNear's plain range, and holding E drags nobody
    await put(W.A);
    const dBody = Math.hypot(c.x - P().x, c.z - P().z);
    const plain = !!g.rites.bodyNear(P().x, P().z, 1.8), mine = !!g.rites.bodyNear(P().x, P().z, 1.8, P());
    // (three goes each side: the same hold is also the body's search, and which wins a given press varies)
    const tryDrag = async (at) => { for (let k = 0; k < 3; k++) { lay(); await put(at); await shut(); await holdE(90); if (g.rites.drag) { g.rites.stopDrag(); return true; } } return false; };
    const dragged = await tryDrag(W.A);
    // a pile lying by the body: from your side of the wall it is not the ground at your feet
    const pile = inv.place(`ground:reachtest${Math.round(g.time * 10)}`, 'ground', W.B.x + (W.A.x - W.B.x) * 0.18, W.B.z + (W.A.z - W.B.z) * 0.18, 999, 'THE GROUND'); // against the wall's far face
    pile.rolled = true; inv.add(pile, 'rag', 1);
    await put(W.A);
    const dPile = Math.hypot(pile.x - P().x, pile.z - P().z);
    const farSide = (q) => q && q.kind === 'ground' && Math.hypot(q.x - W.A.x, q.z - W.A.z) > 0.7; // any pile that is not at your own feet
    const feet = inv.groundAt(P().x, P().z), feetIsPile = farSide(feet);
    const pk = await C('pack', { on: true });
    const listedPile = g.invUI.findNear().some(farSide) || farSide(g.invUI.other);
    await shut();
    // the control: from the body's own side the pile is the ground here and the same hold drags the body
    await put(W.B2);
    const feetIn = inv.groundAt(P().x, P().z) === pile; // from here the same pile IS the ground at your feet
    for (const [id, q] of [...inv.boxes]) if (q.kind === 'ground' && Math.hypot(q.x - W.A.x, q.z - W.A.z) < 6) inv.boxes.delete(id);
    inv.prune();
    lay(); await put(W.B2);
    const mineIn = !!g.rites.bodyNear(P().x, P().z, 1.8, P());
    const dbg = mineIn ? null : { why: R.last.why, tag: R.last.tag, pl: [r1(P().x - W.B2.x), r1(P().z - W.B2.z)], c: [r1(c.x - W.B.x), r1(c.z - W.B.z)], alive: c.alive, inChars: g.chars.includes(c), gy: [c.gy, P().gy], recs: [...g.rites.bodies.values()].filter((q) => Math.hypot((q.c ? q.c.x : q.x) - W.B.x, (q.c ? q.c.z : q.z) - W.B.z) < 4).map((q) => ({ hasC: !!q.c, x: r1((q.c ? q.c.x : q.x) - W.B.x), z: r1((q.c ? q.c.z : q.z) - W.B.z), y: q.y, buried: q.buried, burned: q.burned })) };
    const draggedIn = await tryDrag(W.B2);
    await shut();
    // floors, and the nearest REACHABLE one: staged body records (no person, no box) round you at B2
    const Bd = g.rites.bodies, fake = (id, x, z, y) => { Bd.set(id, { id, x, z, y, box: null, stage: 0 }); return Bd.get(id); };
    for (const [k, q] of [...Bd]) if (Math.hypot((q.c ?? q).x - W.A.x, (q.c ?? q).z - W.A.z) < 8) Bd.delete(k);
    await put(W.B2);
    const above = fake('reach:above', P().x + 0.5, P().z, 3.2);   // 0.5 m off, on the floor above
    const through = fake('reach:through', W.A.x + (W.B2.x - W.B.x), W.A.z + (W.B2.z - W.B.z), 0); // 1.7 m off, the wall between
    const beside = fake('reach:beside', W.B.x, W.B.z, 0);        // 1.1 m off, clear...
    const dT = Math.hypot(through.x - P().x, through.z - P().z), dB = Math.hypot(beside.x - P().x, beside.z - P().z);
    const anyBody = g.rites.bodyNear(P().x, P().z, 2.2), yours = g.rites.bodyNear(P().x, P().z, 2.2, P());
    Bd.delete(beside.id);
    const noneLeft = g.rites.bodyNear(P().x, P().z, 2.2, P());
    for (const q of [above, through, beside]) Bd.delete(q.id);
    g.rites.dirty = true;
    const floors = anyBody === above && yours === beside && noneLeft === null && dT < 2.2;
    sweep();
    // the roadside's big fixtures (a junkyard hulk, the dam's cistern): stand just clear of the thing's own collider on
    // each side you can and ask E's own search (roadside.spotNear) - it must offer that spot
    const RS = g.roadside.R;
    let spots = 0;
    const blocked = [];
    const picks = [RS?.spots.find((q) => q.kind === 'hulk'), RS?.spots.find((q) => q.kind === 'water' && q.source === 'cistern')].filter(Boolean);
    for (const q of picks) {
      await C('teleport', { x: q.x + q.r + 3, z: q.z });
      await C('step', { seconds: 1.2 });
      let stood = 0;
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let k = 0.5, fx = 0, fz = 0, found = false;
        for (; k < q.r - 0.3; k += 0.25) { fx = q.x + ox * k; fz = q.z + oz * k; if (!S.pointBlocked(fx, fz, 0.42)) { found = true; break; } }
        if (!found) continue;
        await put({ x: fx, z: fz });
        if (Math.hypot(P().x - q.x, P().z - q.z) > q.r) continue; // pushed out of its reach by something else standing there
        stood++;
        const got = g.roadside.spotNear(P());
        if (got?.id !== q.id) blocked.push({ id: q.id, kind: q.kind, side: [ox, oz], d: r1(Math.hypot(P().x - q.x, P().z - q.z)), got: got?.id ?? null, why: R.last.why, tag: R.last.tag });
      }
      if (stood) spots++;
    }
    const ok = plain && !mine && !dragged && dPile < 1.6 && !feetIsPile && !listedPile && feetIn && mineIn && draggedIn && floors && picks.length === 2 && spots === 2 && blocked.length === 0;
    return ok || { dbg, floors, dT: r1(dT), dB: r1(dB), dBody: r1(dBody), plain, mine, dragged, dPile: r1(dPile), feetIsPile, listedPile, feetIn, mineIn, draggedIn, picks: picks.length, spots, blocked: blocked.slice(0, 5), n: blocked.length };
    } finally { g.godMode = false; g.input.down.delete('KeyE'); }
  }));

  await check('reach: below the street the same hands work - on an underground level a dead man beside you is dragged by holding E, and the PACK screen held open on the ground there keeps the one pile (no new pile, no re-pick) for two seconds', async () => hush(async () => {
    await stage();
    g.godMode = true;
    try {
      const r = await C('underground', { action: 'enter', id: 'redrock_cave', level: 1 });
      if (!r.ok && r.error) return { enter: r.error };
      await api._step(20);
      const p = P();
      if (!p.ug) return { ug: null, gy: p.gy };
      // nobody and no body of an earlier run here (a second body's box beside this one would take E's search)
      const tidy = () => {
        const near = (q) => Math.hypot(q.x - p.x, q.z - p.z) < 12;
        for (const o of [...g.chars]) if (o !== p && !o.npc && near(o)) g.removeChar(o);
        const Bd = g.rites.bodies;
        for (const [k, q] of [...Bd]) if (near(q.c ?? q)) Bd.delete(k);
        g.rites.dirty = true;
        for (const [id, q] of [...inv.boxes]) if (String(id).startsWith('body:') && q.x !== undefined && near(q)) inv.boxes.delete(id);
        inv.opened = null;
      };
      tidy(); await shut();
      // the ground side held open
      const pk = await C('pack', { on: true });
      const g0 = g.invUI.other, n0 = inv.boxes.size, picks0 = inv.piles;
      await api._step(120);
      const same = g.invUI.other === g0, grew = inv.boxes.size - n0, minted = inv.piles - picks0, pileY = g0?.kind === 'ground' ? g0.y : 'not ground';
      await shut();
      // a dead man 1 m off on this level
      const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([ox, oz]) => ({ x: p.x + ox, z: p.z + oz })).find((q) => !g.statics.under?.pointBlocked?.(q.x, q.z, 0.4));
      if (!free) return 'no free spot beside you on the level';
      const sp = await C('spawn', { kind: 'drifter', x: free.x, z: free.z });
      const c = sp.ids?.[0] ? api.findChar(sp.ids[0]) : null;
      if (!c) return { spawn: sp };
      c.x = free.x; c.z = free.z; c.gy = p.gy; c.ug = p.ug; c.storey = p.storey;
      await api._step(2);
      const level = c.ug === p.ug;
      g.combat.damage(c, 9999, null, 0, 0, 'bullet');
      await api._step(45);
      c.x = free.x; c.z = free.z;
      const mine = !!g.rites.bodyNear(p.x, p.z, 1.8, p);
      let dragged = false;
      for (let k = 0; k < 3 && !dragged; k++) {
        c.x = free.x; c.z = free.z; await shut();
        g.input.down.add('KeyE'); g.input.pressed.add('KeyE'); for (let i = 0; i < 90; i++) await api._step(1); g.input.down.delete('KeyE'); await api._step(2);
        if (g.rites.drag) { dragged = true; g.rites.stopDrag(); }
      }
      await shut();
      tidy();
      const ok = same && grew === 0 && minted === 0 && typeof pileY === 'number' && pileY < -0.5 && level && mine && dragged;
      return ok || { o: g0 ? { kind: g0.kind, x: g0.x, z: g0.z, y: g0.y, d: r1(Math.hypot((g0.x ?? 0) - p.x, (g0.z ?? 0) - p.z)) } : null, bodies: g.rites.bodies.size, level: p.ug, gy: r1(p.gy ?? 0), other: pk.other?.id ?? null, same, grew, minted, pileY, onLevel: level, mine, dragged, corpseGy: c.gy };
    } finally { g.godMode = false; g.input.down.delete('KeyE'); if (g.invUI.open) g.invUI.toggle(false); }
  }));
}
