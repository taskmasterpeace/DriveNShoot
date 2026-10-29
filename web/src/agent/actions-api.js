// TIMED ACTIONS as COMMANDS rows and the selftest share (docs/design/WEB_TIMED_ACTIONS.md; systems/actions.js,
// systems/actposes.js; rows in data/actions.js). Every `act action=do` drives the REAL path: the interact key held (or
// tapped) through the game's own input, a direction key on a ladder, the pack's use for a carried ladder. Nothing is
// granted: a search ends when the row's seconds have been held, a lock gives when its verb lands.
import { ACTIONS, TOOLS, LOCK_KINDS, CONCEAL, LOOK, LADDER, LADDER_KINDS, BREAK_MARKS, validateActions } from '../data/actions.js';
import { POSES } from '../systems/actposes.js';
import { ITEMS } from '../data/items.js';
import { freeSpot } from './citygen-api.js';

const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const IDS = Object.keys(ACTIONS);
const keyFor = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'KeyD' : 'KeyA') : dz > 0 ? 'KeyS' : 'KeyW');

// The game's own keys, held and tapped (frames of the fixed 60 Hz step).
function keys(api) {
  const g = api.g;
  const tap = async (code) => { g.input.down.add(code); g.input.pressed.add(code); await api._step(1); g.input.down.delete(code); await api._step(1); };
  const hold = async (code, secs, until) => {
    g.input.down.add(code); g.input.pressed.add(code);
    let f = 0;
    try { for (; f < Math.round(secs * 60); f++) { await api._step(1); if (until?.()) break; } } finally { g.input.down.delete(code); }
    await api._step(1);
    return r2((f + 1) / 60);
  };
  return { tap, hold };
}

export function actionsCommands(api, need) {
  const g = api.g, A = () => g.actions;
  const { tap, hold } = keys(api);
  const table = () => IDS.map((id) => { const a = ACTIONS[id]; return { id, label: a.label, secs: a.dur, per: a.per, noise: a.noise[0], every: a.noise[1], bang: a.bang, pose: a.pose, tool: a.tool, wear: a.wear ?? 0, stop: a.stop, keep: a.keep, attr: a.attr ?? null, fx: a.fx ?? null }; });
  const nearBox = () => { const p = g.player; return g.inventory.nearest(p.x, p.z, 2.6, false, p.gy ?? 0); };
  const nearDoor = () => { const t = g.interiors.nearest(g.player); return t?.leaves ? t : null; };
  return {
    act: {
      group: 'player',
      desc: `TIMED ACTIONS (docs/design/WEB_TIMED_ACTIONS.md; rows in data/actions.js; systems/actions.js). Every interaction that takes time has a row: seconds, a pose on the shared solver, how far it is heard, what stops it (a hit, walking off, a threat in sight), a progress ring on the HUD, tool wear and attribute speed-ups. Held E keeps it going, letting go stops it (progress kept where the row says). action=list: the action table, tools, lock kinds, conceal rows, the rows check. action=status (default): what is running, the ring, your tools' wear, ladders/marks/unseen counts, the last results. action=do id=<${IDS.join('|')}>: does it the real way from where you stand - open/search_box/search_body at the box or body in reach (tap / hold E), look_around (hold E with nothing in reach, hold= s, default 8), kick/pick/pry/cut/sledge at the locked door or padlocked roll-up in reach (verb= is tried first; hold E), duck_under at a jammed roll-up, climb the ladder in reach (tap E, then the key toward the wall; down=true climbs down; fire=true holds the trigger the whole way to prove the hands are on the rungs), place_ladder (uses the ladder in your pack on the wall in front of you). hold= s caps how long the key is held (partial progress). action=cancel stops what runs. action=drop item= n= x= z=: STAGING - lay something small on the ground, unseen until someone looks. action=padlock on=true|false: STAGING - the nearest door's padlock and chain (locks it too). action=ladders: the ladders near you. action=marks: every break-in mark.`,
      args: { action: { type: 'string', default: 'status', enum: ['list', 'status', 'do', 'cancel', 'drop', 'padlock', 'ladders', 'marks'] }, id: { type: 'string', enum: IDS }, verb: { type: 'string', enum: ['kick', 'pick', 'pry', 'cut', 'sledge'] }, hold: { type: 'number' }, down: { type: 'boolean' }, fire: { type: 'boolean' }, item: { type: 'string' }, n: { type: 'number', default: 1 }, x: { type: 'number' }, z: { type: 'number' }, on: { type: 'boolean' } },
      run: async (a) => {
        const S = A(), p = g.player;
        const act = a.action ?? 'status';
        if (act === 'list') return { actions: table(), tools: TOOLS, locks: LOCK_KINDS, conceal: CONCEAL, look: LOOK, ladder: LADDER, ladderKinds: LADDER_KINDS, marks: BREAK_MARKS, poses: Object.keys(POSES), check: validateActions(undefined, ITEMS, POSES) };
        if (act === 'status') return S.view();
        if (act === 'cancel') { const was = S.cur?.id ?? null; if (S.cur) S.stop('cancel'); return { cancelled: was }; }
        if (act === 'drop') { need(ITEMS[a.item], `item= must be an item id`); const b = S.dropSmall(a.item, a.n ?? 1, a.x ?? p.x, a.z ?? p.z, p.gy ?? 0); return { id: b.id, item: a.item, x: r1(b.x), z: r1(b.z), unseen: b.unseen }; }
        if (act === 'padlock') { const d = nearDoor(); need(d, 'no door in reach'); if (a.on !== false) { g.interiors.setLocked(d, true); d.padlock = true; } else d.padlock = false; S.dirty = true; return { door: d.id, padlock: !!d.padlock, locked: d.locked }; }
        if (act === 'ladders') return { ladders: S.ladders.filter((L) => Math.hypot(L.x - p.x, L.z - p.z) < 200).map((L) => ({ id: L.id, kind: L.kind, x: r1(L.x), z: r1(L.z), h: r1(L.y1 - L.y0), rungs: S.rungsOf(L), retracted: L.retracted, d: r1(Math.hypot(L.x - p.x, L.z - p.z)) })) };
        if (act === 'marks') return { marks: [...S.marks].map(([id, m]) => ({ id, kind: m.kind, x: r1(m.x), z: r1(m.z) })) };
        need(a.id, 'action=do needs id=');
        const id = a.id, t0 = g.time;
        const res = (o) => ({ id, secs: r2(g.time - t0), log: S.log.slice(-1)[0] ?? null, ...o });
        if (id === 'open') { const b = nearBox(); need(b, 'no box or body in reach'); await tap('KeyE'); const o = g.invUI.other; const out = res({ box: o?.id ?? null, top: o?.slots.map((s) => s.id) ?? [], hidden: o?.hidden?.length ?? 0, searched: !!o?.searched }); if (g.invUI.open) g.invUI.toggle(false); return out; }
        if (id === 'search_box' || id === 'search_body') {
          const b = nearBox(); need(b, 'no box or body in reach');
          await hold('KeyE', a.hold ?? 30, () => b.searched || (!S.cur && g.invUI.open));
          const out = res({ box: b.id, searched: !!b.searched, slots: b.slots.map((s) => s.id), hidden: b.hidden?.length ?? 0, kept: r2(S.prog.get(`box:${b.id}`) ?? 0) });
          if (g.invUI.open) g.invUI.toggle(false);
          return out;
        }
        if (id === 'look_around') { S.found = []; await hold('KeyE', a.hold ?? 8); return res({ found: S.found.slice(), radius: r1(S.lookRadius()) }); }
        if (['kick', 'pick', 'pry', 'cut', 'sledge'].includes(id)) {
          const d = nearDoor(), bay = !d ? g.citygen?.bayAt(p.x, p.z)?.b : null;
          need(d?.locked || bay?.locked, 'no locked door or padlocked roll-up in reach');
          S.prefer = a.verb ?? id;
          const tgt = d ?? bay;
          try { await hold('KeyE', a.hold ?? 20, () => !tgt.locked); } finally { S.prefer = null; }
          return res({ target: tgt.id, unlocked: !tgt.locked, mark: S.marks.get(tgt.id)?.kind ?? null, broken: !!tgt.broken });
        }
        if (id === 'duck_under') {
          const q = g.citygen?.bayAt(p.x, p.z); need(q?.b.half, 'no jammed roll-up in reach');
          const x0 = p.x, z0 = p.z, side0 = (p.x - q.b.x) * q.b.nx + (p.z - q.b.z) * q.b.nz;
          let started = false;
          await hold('KeyE', a.hold ?? 4, () => { if (p.duck) started = true; return started && !p.duck; });
          const side1 = (p.x - q.b.x) * q.b.nx + (p.z - q.b.z) * q.b.nz;
          return res({ bay: q.b.id, through: Math.sign(side0) !== Math.sign(side1), moved: r1(Math.hypot(p.x - x0, p.z - z0)) });
        }
        if (id === 'climb') {
          const q = S.ladderNear(p); need(q, 'no ladder in reach (stand at its foot, or at its top)'); need(!q.L.retracted, 'that ladder is drawn up: pull it down first (hold E at its foot) or kick it down from the top');
          await tap('KeyE'); need(p.climb, 'did not get on the ladder');
          const L = q.L, up = !a.down, code = up ? keyFor(-L.nx, -L.nz) : keyFor(L.nx, L.nz), mag0 = { ...g.inv.mag }, b0 = S.counts.shotsBlocked;
          const rungs = [];
          const ev0 = g.eventSeq;
          if (a.fire) { g.input.mouse.left = true; g.input.mouse.leftPressed = true; }
          try { await hold(code, a.hold ?? 40, () => { if (a.fire) g.input.mouse.left = true; if (p.climb) rungs.push(p.climb.rung); return !p.climb; }); } finally { g.input.mouse.left = false; }
          const rungEvents = g.events.filter((e) => e.seq > ev0 && e.type === 'rung').length;
          return res({ ladder: L.id, top: up, gy: r2(p.gy ?? 0), y1: r2(L.y1), onTop: Math.abs((p.gy ?? 0) - (up ? L.y1 : L.y0)) < 0.3, rungsClimbed: rungEvents, distinctRungs: new Set(rungs).size, fired: JSON.stringify(mag0) !== JSON.stringify(g.inv.mag), shotsBlocked: S.counts.shotsBlocked - b0 });
        }
        if (id === 'place_ladder') {
          const i = g.inventory.carried.slots.findIndex((s) => s.id === 'ladder_portable'); need(i >= 0, 'you carry no ladder (item give=ladder_portable)');
          const r = g.inventory.use(i); need(r.ok, r.why ?? 'could not set it');
          for (let f = 0; f < 60 * 6 && S.cur?.id === 'place_ladder'; f++) await api._step(1);
          const L = S.ladders[S.ladders.length - 1];
          return res({ placed: L?.kind === 'portable' ? { id: L.id, h: r2(L.y1 - L.y0), rungs: S.rungsOf(L) } : null });
        }
        return need(false, `act do id=${id}: that one runs inside another (board_door is the barricade gadget's; kick_down / pull_down / take_ladder at a ladder: climb)`);
      },
    },
  };
}

// ---- the selftest share ---------------------------------------------------------------------------------------------
export async function actionsChecks(api, check, C) {
  const g = api.g, S = g.actions, P = () => g.player, inv = g.inventory;
  const { tap, hold } = keys(api);
  const was = { z: g.zombies.enabled, slots: inv.carried.slots.map((s) => ({ ...s })), worn: inv.worn, x: P().x, z: P().z };
  const made = [];
  const clean = () => { for (const c of [...g.chars]) if (c.taTest) g.removeChar(c); for (const id of made) inv.boxes.delete(id); made.length = 0; if (g.invUI.open) g.invUI.toggle(false); if (S.cur) S.stop('cancel'); };
  const stand = async (x, z, gy = 0) => {
    if (g.dialogue?.active) g.dialogue.close();
    if (P().inVehicle) g.exitVehicle(true);
    if (Math.hypot(P().x - x, P().z - z) > 60) await C('teleport', { x, z });
    const p = P(); p.x = x; p.z = z; p.gy = gy; p.climb = null; p.duck = null; p.perchY = 0; g.standOn(p);
    g.camLook.x = p.x; g.camLook.z = p.z; g.camFloor = p.gy;
    await api._step(3);
  };
  const strip = () => { inv.carried.slots = []; inv.changed?.(); };
  const give = (id, n = 1) => inv.stow(id, n);
  const box = (id, kind, x, z, items) => { const b = inv.place(id, kind, x, z, 40, kind.toUpperCase()); b.rolled = true; for (const [it, n] of items) inv.add(b, it, n); made.push(id); return b; };
  const lastEnd = (id) => { for (let i = g.events.length - 1; i >= 0; i--) { const e = g.events[i]; if (e.type === 'actionEnd' && e.id === id) return e; } return null; };
  // An open, quiet patch of the glass flats (no person, car, box or door near).
  const spot = () => {
    for (const [x, z] of [[-150, -230], [230, -150], [-230, 180], [150, 240], [-60, -300], [300, 60]]) {
      if (g.water?.depthAt?.(x, z)) continue;
      if (g.chars.some((c) => c.alive && Math.hypot(c.x - x, c.z - z) < 30 && c !== P())) continue;
      if (g.vehicles.some((v) => Math.hypot(v.x - x, v.z - z) < 12)) continue;
      if ([...inv.boxes.values()].some((b) => Math.hypot(b.x - x, b.z - z) < 6)) continue;
      if (g.interiors.nearest({ x, z })) continue;
      return { x, z };
    }
    return { x: -150, z: -230 };
  };
  strip();

  await check('timed actions: the rows check - validateActions over every action row, every tool is an item, every pose is on the solver, a boot never opens a padlock, no purple', async () => {
    const r = validateActions(undefined, ITEMS, POSES);
    const tools = Object.keys(TOOLS).every((t) => ITEMS[t]);
    return r.ok && tools && IDS.length >= 14 ? true : JSON.stringify(r.bad.slice(0, 6));
  });

  await check('timed actions: opening a crate shows what is on top at once, but a hidden item appears only after a full search (held E for the row\'s seconds, kneeling, the ring up)', async () => {
    clean(); const s = spot();
    await stand(s.x, s.z);
    const b = box('ta:crate:1', 'crate', s.x + 1.2, s.z, [['crowbar', 1], ['door_key', 1], ['water_bottle', 1]]);
    await tap('KeyE');
    const opened = g.invUI.open, top = g.invUI.other?.slots.map((q) => q.id) ?? [];
    if (g.invUI.open) g.invUI.toggle(false);
    await api._step(2);
    let pose = null, ring = 0;
    const secs = await hold('KeyE', 12, () => { if (P().act?.pose) pose = P().act.pose; if (S.ringState?.label) ring++; return b.searched; });
    const after = g.invUI.other?.slots.map((q) => q.id) ?? [];
    if (g.invUI.open) g.invUI.toggle(false);
    const ok = opened && top.includes('crowbar') && !top.includes('door_key') && b.searched && after.includes('door_key') && secs >= ACTIONS.search_box.dur * 0.8 && pose === 'kneel' && ring > 30;
    return ok ? true : JSON.stringify({ opened, top, after, searched: b.searched, secs, pose, ring });
  });

  await check('timed actions: searching a body takes longer than searching a crate, and opening one takes no time at all (pat-down pose on the body)', async () => {
    clean(); const s = spot();
    await stand(s.x, s.z);
    const crate = box('ta:crate:2', 'crate', s.x + 1.2, s.z, [['jerky', 1], ['photograph', 1]]);
    const t0 = g.time; await tap('KeyE'); const openSecs = g.invUI.open ? g.time - t0 : 99; if (g.invUI.open) g.invUI.toggle(false);
    await api._step(2);
    await hold('KeyE', 12, () => crate.searched); if (g.invUI.open) g.invUI.toggle(false);
    const cE = lastEnd('search_box');
    inv.boxes.delete(crate.id);
    const body = inv.place('body:ta-test', 'raider', s.x - 1.2, s.z, 20, 'BODY'); made.push(body.id);
    await stand(s.x, s.z); await api._step(2);
    let pose = null;
    await hold('KeyE', 14, () => { if (P().act?.pose) pose = P().act.pose; return body.searched; }); if (g.invUI.open) g.invUI.toggle(false);
    const bE = lastEnd('search_body');
    const ok = cE?.why === 'done' && bE?.why === 'done' && bE.secs > cE.secs && openSecs < 0.1 && pose === 'patdown';
    return ok ? true : JSON.stringify({ crate: cE, body: bE, openSecs: r2(openSecs), pose });
  });

  await check('timed actions: taking damage cancels a search - stopped on the hit, the hidden item still hidden, the progress kept on the crate', async () => {
    clean(); const s = spot();
    await stand(s.x, s.z);
    const b = box('ta:crate:3', 'crate', s.x + 1.2, s.z, [['door_key', 1], ['crowbar', 1]]);
    g.input.down.add('KeyE'); g.input.pressed.add('KeyE');
    try {
      for (let f = 0; f < 90; f++) await api._step(1); // 1.5 s into the search
      await C('god', { on: false }); P().hp = Math.max(P().hp, 80); P().graceT = 0;
      g.combat.damage(P(), 4, null, 0, 0, 'test');
      for (let f = 0; f < 10; f++) await api._step(1);
    } finally { g.input.down.delete('KeyE'); await C('god', { on: true }); }
    await api._step(2);
    const e = lastEnd('search_box'), kept = S.prog.get(`box:${b.id}`) ?? 0;
    await tap('KeyE'); const top = g.invUI.other?.slots.map((q) => q.id) ?? []; if (g.invUI.open) g.invUI.toggle(false); // and opened now: the key is still out of sight
    const ok = e?.why === 'damage' && !b.searched && !top.includes('door_key') && top.includes('crowbar') && kept > 1;
    return ok ? true : JSON.stringify({ end: e, searched: b.searched, top, kept: r2(kept) });
  });

  // A locked back door in the ruins with a clear step outside it.
  const I = g.interiors;
  const door = I.doors.slice(0, I.nIslandDoors).find((d) => d.kind === 'back' && d.leaves.length === 1 && Math.max(Math.abs(d.x), Math.abs(d.z)) > 120 && g.nav.foot.free(d.x + d.nx * 1.3, d.z + d.nz * 1.3) && !d.broken)
    ?? I.doors.slice(0, I.nIslandDoors).find((d) => d.leaves.length === 1 && !d.broken && g.nav.foot.free(d.x + d.nx * 1.3, d.z + d.nz * 1.3));
  const doorWas = door ? { locked: door.locked, padlock: door.padlock } : null;

  await check('timed actions: a kick is louder than a pick - the boot\'s noise draws one of the infected standing out of sight that the pick (quiet, 2.6 s) never reaches', async () => {
    if (!door) return 'no door';
    clean();
    const fx = door.x + door.nx * 1.3, fz = door.z + door.nz * 1.3;
    await stand(fx, fz);
    // a place past a shambler's sight (32 m by day) and inside a boot's earshot (30 m x 2 for the infected), on foot ground
    let zs = null;
    for (let r = 40; r <= 56 && !zs; r += 2) for (let k = 0; k < 36 && !zs; k++) {
      const a = (k / 36) * Math.PI * 2, x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r;
      if (g.nav.foot.free(x, z) && !g.water?.depthAt?.(x, z) && !g.chars.some((c) => c.alive && c !== P() && Math.hypot(c.x - x, c.z - z) < 45)) zs = { x, z }; // nobody else for it to see (it would stop listening)
    }
    if (!zs) return 'no hidden spot';
    // The infected's senses hold still (no sight ticks): what it learns here it learns by ear (zombies.onNoise is always live).
    const zOn = g.zombies.enabled; g.zombies.enabled = false;
    const zed = g.zombies.spawn(zs.x, zs.z, false); zed.taTest = true; zed.zkind = 'shambler'; zed.zSpeed = 0; if (zed.zm) zed.zm.src = null;
    const heard = () => zed.zm?.src === 'sound';
    const radii = []; const n0 = g.noise; g.noise = function (x, z, r, src) { if (src === P()) radii.push(r); return n0.call(this, x, z, r, src); };
    try {
      I.setLocked(door, true); door.padlock = false;
      strip(); give('lockpicks', 1);
      await hold('KeyE', 6, () => !door.locked);
      const pickOpen = !door.locked, pickHeard = heard(), pickMax = Math.max(0, ...radii);
      radii.length = 0;
      I.setLocked(door, true); strip(); await api._step(2);
      for (let k = 0; k < 6 && door.locked; k++) { await tap('KeyE'); await api._step(36); }
      const kickHeard = heard(), kickMax = Math.max(0, ...radii);
      const ok = pickOpen && !pickHeard && kickHeard && kickMax > pickMax && !door.locked;
      return ok ? true : JSON.stringify({ pickOpen, pickHeard, pickMax, kickHeard, kickMax, kicked: !door.locked, zm: zed.zm?.src ?? null });
    } finally { g.noise = n0; g.zombies.enabled = zOn; }
  });

  await check('timed actions: bolt cutters open a padlock that a kick does not - four boots and the chain holds (a thud, kicks left unchanged), the cutters take it in the row\'s seconds and leave a cut chain', async () => {
    if (!door) return 'no door';
    clean();
    await stand(door.x + door.nx * 1.3, door.z + door.nz * 1.3);
    I.setLocked(door, true); door.padlock = true; S.marks.delete(door.id); strip(); await api._step(2);
    const k0 = door.kicks;
    for (let k = 0; k < 4; k++) { await tap('KeyE'); await api._step(36); }
    const heldOut = door.locked && door.kicks === k0;
    give('bolt_cutters', 1);
    const secs = await hold('KeyE', 6, () => !door.locked);
    const s = S.toolSlot('bolt_cutters');
    const ok = heldOut && !door.locked && !door.padlock && S.marks.get(door.id)?.kind === 'cut' && s?.wear > 0 && secs >= ACTIONS.cut.dur * 0.6;
    return ok ? true : JSON.stringify({ heldOut, kicks: [k0, door.kicks], locked: door.locked, padlock: door.padlock, mark: S.marks.get(door.id)?.kind ?? null, wear: s?.wear ?? null, secs });
  });
  if (door) { door.padlock = doorWas.padlock; I.setLocked(door, !!doorWas.locked); }

  await check('timed actions: look-around finds a dropped key within its radius and not one outside it (head down, finds only what is there)', async () => {
    clean(); const s = spot();
    await stand(s.x, s.z);
    const R = S.lookRadius();
    const nearK = S.dropSmall('door_key', 1, s.x + R * 0.6, s.z + 0.4, 0, { id: 'lost:ta:near' }), farK = S.dropSmall('door_key', 1, s.x - R * 1.9, s.z, 0, { id: 'lost:ta:far' });
    made.push(nearK.id, farK.id);
    const tapNear = inv.nearest(nearK.x, nearK.z, 0.5) === nearK; // unseen: not even in reach to pick up
    let pose = null, head = false;
    S.found = [];
    await hold('KeyE', 7, () => { if (P().act?.pose) pose = P().act.pose; return false; });
    head = pose === 'lookdown';
    const ok = !tapNear && !nearK.unseen && farK.unseen && S.found.some((f) => f.id === nearK.id) && !S.found.some((f) => f.id === farK.id) && head;
    for (const id of ['lost:ta:near', 'lost:ta:far']) S.lost.delete(id);
    return ok ? true : JSON.stringify({ tapNear, nearUnseen: nearK.unseen, farUnseen: farK.unseen, found: S.found, R: r1(R), pose });
  });

  // A town of this lane's own: ladders on its buildings, jammed bays.
  let town = null;
  const stampTown = () => { if (town && g.citygen.live.has(town.rec.id)) return town; const s = freeSpot(g, 7000, 9000, 260); if (!s) return null; town = g.citygen.stampAt({ id: 'ta-selftest', arch: 'sonoran_sprawl', seed: 4417, x: s.x, z: s.z }); return town; };

  await check('timed actions: a climber reaches the roof rung by rung and cannot fire meanwhile - a drawn-up fire-escape ladder pulled down from below, citygen\'s building wears, climbed on the held key with the trigger held the whole way', async () => {
    clean();
    const t = stampTown(); if (!t) return 'no town';
    await stand(t.rec.x, t.rec.z); await api._step(5); S.dress();
    const mine = S.ladders.filter((L) => L.town === t.rec.id).sort((a, b) => (a.y1 - a.y0) - (b.y1 - b.y0));
    if (!mine.length) return `no ladders in the town (${t.blds.length} buildings)`;
    const L = mine.find((q) => q.kind === 'dropdown' && q.retracted) ?? mine[0]; // a fire escape's drawn-up ladder when the town has one
    const f = S.footOf(L);
    await stand(f.x, f.z, L.y0);
    const wasUp = L.retracted;
    if (L.retracted) await hold('KeyE', 4, () => !L.retracted);
    if (L.retracted) return 'could not pull the drawn-up ladder down';
    await api._step(3);
    g.inv.current = g.inv.weapons.includes('pistol') ? 'pistol' : g.inv.current;
    const r = await C('act', { action: 'do', id: 'climb', fire: true, hold: 30 });
    const want = S.rungsOf(L);
    const ok = r.ok !== false && r.onTop && r.rungsClimbed >= want - 1 && r.distinctRungs >= want - 1 && !r.fired && r.shotsBlocked > 0 && r.secs >= want * ACTIONS.climb.dur * 0.7;
    return ok ? true : JSON.stringify({ r, want, ladders: mine.length, kind: L.kind, wasUp });
  });

  await check('timed actions: a jammed roll-up is ducked under - bent double for the row\'s seconds, out the other side, no car gets through it', async () => {
    clean();
    const t = stampTown(); if (!t) return 'no town';
    const b = t.built.bays.find((q) => q.half);
    if (!b) return `no jammed bay (${t.built.bays.length} bays)`;
    await stand(b.x + b.nx * 1.2, b.z + b.nz * 1.2);
    let pose = null;
    const r = await (async () => { const x0 = P().x, z0 = P().z; await hold('KeyE', 4, () => { if (P().act?.pose) pose = P().act.pose; return pose && !P().duck; }); return { side0: (x0 - b.x) * b.nx + (z0 - b.z) * b.nz, side1: (P().x - b.x) * b.nx + (P().z - b.z) * b.nz }; })();
    const ok = Math.sign(r.side0) !== Math.sign(r.side1) && pose === 'duck' && b.box.base === 0 && lastEnd('duck_under')?.why === 'done';
    return ok ? true : JSON.stringify({ ...r, pose, base: b.box.base, end: lastEnd('duck_under') });
  });

  await check('timed actions: a hit knocks a climber off the ladder - down at its foot, on the floor, the fall hurts past the safe height', async () => {
    clean();
    const t = stampTown(); if (!t) return 'no town';
    const L = S.ladders.filter((q) => q.town === t.rec.id && q.y1 - q.y0 > LADDER.fall.safe + 1).sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0))[0];
    if (!L) return 'no tall ladder';
    L.retracted = false;
    const f = S.footOf(L); await stand(f.x, f.z, L.y0);
    await tap('KeyE'); if (!P().climb) return 'did not get on';
    const code = keyFor(-L.nx, -L.nz);
    await hold(code, 30, () => (P().perchY ?? 0) - L.y0 > LADDER.fall.safe + 0.8 || !P().climb);
    const h = (P().perchY ?? 0) - L.y0;
    await C('god', { on: false }); P().hp = 100; P().graceT = 0; const hp0 = P().hp;
    try { g.combat.damage(P(), 2, null, 0, 0, 'test'); await api._step(3); } finally { await C('god', { on: true }); }
    const fell = !P().climb && P().knockT > 0 && Math.abs((P().gy ?? 0) - L.y0) < 0.3 && hp0 - P().hp > 2.5;
    P().knockT = 0; P().hp = 100;
    return fell ? true : JSON.stringify({ h: r1(h), climb: !!P().climb, knock: P().knockT, gy: P().gy, hp: [hp0, P().hp] });
  });

  await check('timed actions: a carried ladder set against a one-storey roof from the pack (2 s, no key held), climbed, and the draw calls stay under 150', async () => {
    clean();
    const t = stampTown(); if (!t) return 'no town';
    const R = t.blds.filter((q) => q.S && q.S.n === 1 && q.B.parapet > 0 && !q.B.ruined && q.S.Y[1] - (q.S.y0 ?? 0) <= LADDER_KINDS.portable.maxH).find((q) => !S.ladders.some((L) => L.id === `ladder:${q.B.id}`));
    if (!R) return 'no one-storey roof';
    const Sx = R.S, sides = [[Sx.ix0 - 0.9, (Sx.iz0 + Sx.iz1) / 2, Math.PI / 2], [Sx.ix1 + 0.9, (Sx.iz0 + Sx.iz1) / 2, -Math.PI / 2], [(Sx.ix0 + Sx.ix1) / 2, Sx.iz0 - 0.9, 0], [(Sx.ix0 + Sx.ix1) / 2, Sx.iz1 + 0.9, Math.PI]];
    const sd = sides.find(([x, z]) => g.nav.foot.free(x, z)) ?? sides[0];
    await stand(sd[0], sd[1]); P().face = sd[2]; g.aimOverride = { x: sd[0] + Math.sin(sd[2]) * 4, z: sd[1] + Math.cos(sd[2]) * 4 };
    strip(); give('ladder_portable', 1);
    let r;
    try { r = await C('act', { action: 'do', id: 'place_ladder' }); } finally { g.aimOverride = null; }
    if (!r?.placed) return JSON.stringify(r);
    const L = S.ladders.find((q) => q.id === r.placed.id);
    const c = await C('act', { action: 'do', id: 'climb', hold: 20 });
    g.render(0); const perf = await C('perf');
    const ok = c.onTop && Math.abs(c.gy - Sx.Y[1]) < 0.3 && !S.has('ladder_portable') && perf.drawCalls < 150 && r.secs >= 1.5;
    if (L) S.removeLadder(L);
    return ok ? true : JSON.stringify({ placed: r, climb: c, draws: perf.drawCalls });
  });

  clean();
  if (town) g.citygen.remove(town.rec.id);
  inv.carried.slots = was.slots; inv.changed?.();
  await C('teleport', { x: was.x, z: was.z });
}
