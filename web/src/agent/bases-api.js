// The agent's side of THE FIFTY BASES (docs/design/WEB_BASES.md; rows in src/data/milbases.js, the ground in
// src/world/milbase.js, the life in src/systems/milbases.js): the `bases` COMMANDS row (spread into api.js's table) and
// the selftest checks (called from api.js runSelfTest). OUTPOST NINE on the island keeps its own `base` command.
import { MIL_SITES, MIL_RULES, validateBaseRow } from '../data/milbases.js';
import { footprint } from '../data/atlas.js';
import { LOOT } from '../data/items.js';
import { RAY_BULLET } from '../engine/collision.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function baseCommands(api) {
  const g = api.g;
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };
  const MB = () => g.milbases;
  const P = () => g.player;
  const row = (b) => {
    const r = b.row ?? b, s = MB()?.byId[r.id];
    return { id: r.id, name: r.name, state: r.state, template: r.template, hold: r.hold, holder: r.holderName, area_km2: r.area_km2, side: r.side, footprint: r.footprint.built_m, grown: r.grown,
      extra: r.extra, built: !!b.built, region: b.region ?? null, centre: b.placed ? [b.cx, b.cz] : null, moved: b.built ? Math.round(b.moved) : 0,
      project: r.build?.project?.name ?? null, alert: s?.alert ?? null, live: s?.live ?? false };
  };
  return {
    bases: {
      group: 'world', desc: 'THE FIFTY BASES (docs/design/WEB_BASES.md; rows in src/data/milbases.js): one military installation per state at the footprint rule (real area / 14², clamped 64 m..3 km; a template\'s minimum, e.g. an airfield\'s runway law), plus the ones a playable region needs. No args (action=list): every row: template (airfield, army, naval, missile, depot, range, lab), who holds it, side, built or a row on the map, where the scale law put it and how far it moved it, its secret project. action=near (x,z, default you): the nearest built base in full. id=<id>: one in full: fence, gate, the access road and where it meets the interstate, every building (locked ones), towers, runway, the rail yard and its gate (locked?) and cargo train, the garrison records (post, tower, patrol, the infected; alive; promoted as which character), drones (tracking you?), lights, the project and how many of its logs you have read, the containers inside the wire, the underground hook. action=alert id= level=alarm|calm|warn stages its trespass rule. action=enter id= puts you on its access road just outside the gate, facing in (vehicle=true: in a car). hooks=true: every built base\'s way down (lift | hatch, where, how many levels) for the underground system. validate=true runs the row validator on every row.',
      args: { action: { type: 'string', default: 'list', enum: ['list', 'near', 'alert', 'enter', 'status'] }, id: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' },
        level: { type: 'string', enum: ['alarm', 'calm', 'warn'] }, vehicle: { type: 'boolean', default: false }, hooks: { type: 'boolean', default: false }, validate: { type: 'boolean', default: false } },
      run: async ({ action = 'list', id, x, z, level, vehicle, hooks, validate }) => {
        const M = MB(), W = g.streamer.W;
        need(M, 'the bases system is not up');
        if (hooks) return { hooks: M.hooks() };
        if (validate) { const bad = MIL_SITES.map((r) => ({ id: r.id, problems: validateBaseRow(r) })).filter((q) => q.problems.length); return { rows: MIL_SITES.length, bad }; }
        if (action === 'near') {
          const px = x ?? P().x, pz = z ?? P().z;
          let best = null, bd = Infinity;
          for (const s of M.sites) { const f = s.fence, d = Math.hypot(Math.max(f.x0 - px, 0, px - f.x1), Math.max(f.z0 - pz, 0, pz - f.z1)); if (d < bd) { bd = d; best = s; } }
          need(best, 'no built base');
          return { distance: r1(bd), ...M.view(best) };
        }
        if (id && action === 'list') action = 'status';
        if (action === 'list') {
          const all = W.milbases.map(row);
          return { count: all.length, atlas: all.filter((r) => !r.extra).length, built: all.filter((r) => r.built).map((r) => r.id), rule: 'side = clamp(sqrt(area / 14^2), 64, 3000), at least the template minimum', bases: all };
        }
        const s = M.byId[id];
        need(s, `no built base "${id}"; built: ${Object.keys(M.byId).join(', ')} (every row: bases)`);
        if (action === 'alert') {
          need(level, 'give level=alarm|calm|warn');
          const B = g.bases;
          if (level === 'alarm') { need(s.guards.some((c) => c.alive), `${id} has nobody at home to raise (hold ${s.hold}); come within ${MIL_RULES.promoteR} m first`); B.alarm(s, 'agent', B.nearestGuard(s, P().x, P().z)); }
          else if (level === 'calm') { B.calm(s, 'agent'); s.warnedAt = -1e9; s.cleared = false; s.shotWarned = false; for (const d of s.drones) { d.tracking = false; d.seenT = 0; } }
          else { need(s.guards.some((c) => c.alive), `${id} has nobody at home to warn you`); B.warn(s, B.nearestGuard(s, P().x, P().z)); }
          return M.view(s);
        }
        if (action === 'enter') {
          const B = s.B, o = B.gateOut, face = Math.atan2(-B.nx, -B.nz);
          if (vehicle) {
            const r = await api.call('spawnVehicle', { type: 'sedan', x: o.x + B.nx * 8, z: o.z + B.nz * 8, heading: face });
            await api.call('enterVehicle', { id: r.id, force: true });
          }
          await api.call('teleport', { x: o.x, z: o.z });
          P().face = face;
          return { at: { x: r1(o.x), z: r1(o.z) }, facing: B.gate === 'N' ? 'south' : B.gate === 'S' ? 'north' : B.gate === 'W' ? 'east' : 'west', gate: { x: r1(B.gateAt.x), z: r1(B.gateAt.z) }, inside: { x: r1(B.gateIn.x), z: r1(B.gateIn.z) } };
        }
        return M.view(s);
      },
    },
  };
}

// ---- the selftest's checks (docs/design/WEB_BASES.md §8) -------------------------------------------------------------------
export async function baseChecks({ api, g, check, C, holdKey, keyFor }) {
  const M = g.milbases, W = g.streamer.W, F = g.society.factions;
  const home = async () => {
    g.driveOverride = null; g.flashOverride = undefined;
    const v = g.player.inVehicle;
    if (v) { g.exitVehicle(true); g.vehiclesSys.remove(v); }
    if (g.invUI?.open) g.invUI.toggle(false);
    g.inventory.opened = null;
    await C('setTime', { hour: 12 });
    await C('teleport', { x: 0, z: -40 });
  };
  const withStanding = async (s, standing, fn) => {
    const i = F.index[s.faction], s0 = i === undefined ? null : F.standing[i], l0 = i === undefined ? null : F.lifetime[i];
    const reset = () => { g.bases.calm(s, 'selftest', true); s.warnedAt = -1e9; s.cleared = false; s.shotWarned = false; for (const d of s.drones) { d.tracking = false; d.seenT = 0; } };
    reset(); if (i !== undefined && standing !== null) F.set(s.faction, standing);
    try { return await fn(); } finally { reset(); if (i !== undefined) { F.standing[i] = s0; F.lifetime[i] = l0; F.retier(i, false); } await home(); }
  };
  const built = W.milbases.filter((b) => b.built);

  await check('bases: every one of the fifty atlas bases has a row and a footprint at the scale rule (side = clamp(sqrt(area / 14²), 64, 3000), never under its template\'s minimum), the rows validate, and the built ones stand inside their region clear of the interstate', async () => {
    const atlas = MIL_SITES.filter((r) => !r.extra), bad = [];
    for (const r of MIL_SITES) {
      const f = footprint(r.area_km2), want = r.build?.side ?? Math.max(f.built_m, { airfield: 560, army: 300, naval: 240, missile: 400, depot: 300, range: 600, lab: 400 }[r.template]);
      if (r.side !== want) bad.push(`${r.id} side ${r.side} != ${want}`);
      const v = validateBaseRow(r); if (v.length) bad.push(`${r.id}: ${v.join('; ')}`);
    }
    const placed = W.milbases.filter((b) => b.placed).length;
    for (const B of built) {
      const R = B.region === 'arizona' ? null : W.regions[B.region];
      if (R ? !R.inBox(B.x0, B.z0) || !R.inBox(B.x1, B.z1) : Math.hypot(B.cx, B.cz) + B.hs > 45000) bad.push(`${B.id} outside its region`);
      let dmin = Infinity; for (let k = 0; k < 40; k++) { const t = k / 40, s2 = Math.floor(k / 10), e = (k % 10) / 10 * 2 - 1; const px = B.cx + (s2 === 0 ? e * B.hs : s2 === 1 ? B.hs : s2 === 2 ? -e * B.hs : -B.hs), pz = B.cz + (s2 === 0 ? -B.hs : s2 === 1 ? e * B.hs : s2 === 2 ? B.hs : -e * B.hs); void t; dmin = Math.min(dmin, W.projectAny(px, pz).d); }
      if (dmin < MIL_RULES.clear - 1) bad.push(`${B.id} fence ${Math.round(dmin)} m from an interstate`);
    }
    const states = new Set(atlas.map((r) => r.state));
    return atlas.length === 50 && states.size === 50 && placed >= 48 && built.length >= 6 && !bad.length ? true : JSON.stringify({ atlas: atlas.length, states: states.size, placed, built: built.map((b) => b.id), bad: bad.slice(0, 12) });
  });

  await check('bases: a built base\'s chunks are a pure function (sync and sliced the same hash) and P1\'s twelve pinned chunks are byte for byte', async () => {
    const out = [];
    for (const B of built.slice(0, 4)) {
      const c = await C('chunk', { x: B.gateAt.x, z: B.gateAt.z, fresh: true, mode: 'sliced' });
      out.push({ id: B.id, matches: c.fresh?.matches, hash: c.hash });
    }
    const w = await C('world');
    return out.every((q) => q.matches === true) && w.islandMatches !== false ? true : JSON.stringify(out);
  });

  await check('bases: every built base\'s gate is reachable from its access road on foot and by car (the nav grids), and the wire is the only other way (the fence blocks both)', async () => {
    const bad = [];
    for (const B of built) {
      // A point on the access road ~300 m out (or its end), to just inside the gate.
      const L = B.roads[0], len = Math.max(L.x1 - L.x0, L.z1 - L.z0), k = Math.min(len - 6, 300);
      const a = { x: B.gateAt.x + B.nx * k, z: B.gateAt.z + B.nz * k }, b = B.gateIn;
      await C('teleport', { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
      const foot = g.nav.foot.find(a.x, a.z, b.x, b.z), car = g.nav.car.find(a.x, a.z, b.x, b.z);
      // The path (string-pulled: few points) runs through the gap: some leg of it passes within 9 m of the gate's centre.
      const segD = (p, q, o) => { const dx = q.x - p.x, dz = q.z - p.z, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((o.x - p.x) * dx + (o.z - p.z) * dz) / l2)); return Math.hypot(p.x + dx * t - o.x, p.z + dz * t - o.z); };
      const viaGate = (p) => !!p && [a, ...p].some((q, i, L) => i > 0 && segD(L[i - 1], q, B.gateAt) < 9); // (a path lists the points after its start)
      // Straight through the wire beside the gate: no.
      const side = { x: B.gateAt.x + B.tx * 30, z: B.gateAt.z + B.tz * 30 };
      const wireBlocks = !g.nav.foot.free(side.x, side.z) || !g.nav.foot.free(side.x + B.tx * 0.3, side.z + B.tz * 0.3);
      if (!foot || !viaGate(foot) || !car || !wireBlocks) bad.push({ id: B.id, foot: !!foot, footGate: viaGate(foot), car: !!car, wireBlocks });
    }
    await home();
    return !bad.length ? true : JSON.stringify(bad);
  });

  // The Arizona army post with its rail yard: near the island, the test bed for the garrison's rules.
  const s = M.byId.iron_railhead;
  if (!s) { await check('bases: the Iron Line railhead is built', async () => 'no iron_railhead site'); return; }
  const B = s.B;
  const inside = { x: B.gateIn.x + B.tx * 4, z: B.gateIn.z - B.nz * 10 };

  await check('bases: the chain-link stops you on foot but not sight or a round; walk in through the gate and a sentry warns you once, stay and the post opens fire, a shot inside brings it down at once', async () => withStanding(s, 0, async () => {
    await C('setTime', { hour: 12 });
    // Walk into the wire from outside: held.
    const wx = B.gateAt.x + B.tx * 40, wz = B.gateAt.z + B.nz * 2.5;
    await C('teleport', { x: wx, z: wz });
    await api._step(30);
    await holdKey(keyFor(-B.nx, -B.nz), 2);
    const held = (g.player.z - B.gateAt.z) * B.nz > 0.1;
    const see = g.los(wx, wz + B.nz * 4, wx, wz - B.nz * 8);
    const round = g.statics.raycast(wx, wz + B.nz * 4, 0, -B.nz, 12, RAY_BULLET) >= 11.9;
    // In through the gate on your own feet.
    await C('teleport', { x: B.gateOut.x, z: B.gateOut.z });
    for (let k = 0; k < 20 && !s.guards.length; k++) await api._step(30); // the garrison comes to life round you
    const seq0 = g.eventSeq;
    await holdKey(keyFor(-B.nx, -B.nz), 5, () => (g.player.z - B.gateIn.z) * B.nz < -2);
    await api._step(30);
    const warned = s.alert === 'warned' && g.events.some((e) => e.seq > seq0 && e.type === 'baseWarning' && e.base === s.id);
    await api._step(Math.round((6 + 1.5) * 60));
    const hostile = s.alert === 'hostile' && s.guards.filter((c) => c.alive && g.ai.hostile(c, g.player)).length >= 4;
    const alarm = g.events.find((e) => e.seq > seq0 && e.type === 'baseAlarm' && e.base === s.id);
    // Calm again, inside: one shot.
    g.bases.calm(s, 'selftest', true); s.warnedAt = -1e9;
    await C('give', { pistol: 12 }); await C('equip', { weapon: 'pistol' });
    const seq2 = g.eventSeq;
    await C('fire', { x: g.player.x + 4, z: g.player.z - 9, shots: 1 });
    const shot = s.alert === 'hostile' && g.events.some((e) => e.seq > seq2 && e.type === 'baseAlarm' && e.why === 'shots' && e.base === s.id);
    return held && see && round && warned && hostile && alarm?.why === 'stayed' && shot ? true
      : JSON.stringify({ held, z: r1(g.player.z), see, round, warned, hostile, alarm: alarm ?? null, shot, guards: s.guards.length, alert: s.alert });
  }));

  await check('bases: the patrol drone spots you at night by your flashlight and calls it in (light off in the same spot, it does not)', async () => withStanding(s, 0, async () => {
    const d = s.drones[0];
    if (!d) return 'no drone';
    await C('setTime', { hour: 23 }); await api._step(10);
    // Stand 30 m from the drone's ground point inside the wire, out of every searchlight and floodlight.
    const stand = async () => { const q = { x: d.x + 30, z: d.z }; const qx = Math.min(B.x1 - 8, Math.max(B.x0 + 8, q.x)); await C('teleport', { x: qx, z: d.z }); d.tracking = false; d.seenT = 0; for (const t of s.towerState.values()) { t.x = 1e6; } };
    const loop0 = d.loop, freeze = () => { d.loop = [{ x: d.x, z: d.z }]; d.seg = 0; };
    freeze(); g.flashOverride = false; await stand();
    const guards0 = s.guards; s.guards = []; // the sentries out of it: the drone alone
    const seq0 = g.eventSeq;
    await api._step(150);
    const dark = !g.events.some((e) => e.seq > seq0 && e.type === 'droneSpotted');
    g.flashOverride = true; d.seenT = 0;
    await api._step(150);
    const ev = g.events.find((e) => e.seq > seq0 && e.type === 'droneSpotted'), tracking = d.tracking, seenT = d.seenT;
    s.guards = guards0; s.towerState.clear(); // the searchlights start their sweep afresh
    d.loop = loop0; d.seg = 0; d.tracking = false; d.seenT = 0;
    const ok = dark && ev?.by === 'flashlight' && tracking;
    return ok ? true : JSON.stringify({ dark, ev: ev ?? null, tracking, seenT: r1(seenT), dist: r1(Math.hypot(g.player.x - d.x, g.player.z - d.z)), night: r1(g.sky.night) });
  }));

  await check('bases: the armory is a locked steel door that holds you, and its crates and racks roll what its row says (military)', async () => withStanding(s, 40, async () => {
    const L = B.lotOf('armory'), geo = B.geo(L), d = geo.doors.find((q) => q.kind === 'front');
    await C('teleport', { x: d.x + d.nx * 3, z: d.z + d.nz * 3 });
    for (let k = 0; k < 10; k++) await api._step(10); // the interiors' scan hangs the leaves
    const door = g.interiors.byId.get(`${L.id}:d${geo.doors.indexOf(d)}`);
    if (!door) return JSON.stringify({ attached: false, id: L.id });
    await C('teleport', { x: d.x + d.nx * 1.6, z: d.z + d.nz * 1.6 });
    await api._step(6);
    await holdKey(keyFor(-d.nx, -d.nz), 1.5);
    const heldOut = ((g.player.x - d.x) * d.nx + (g.player.z - d.z) * d.nz) > 0.2 && door.locked && door.material === 'metal';
    const allowed = new Set(LOOT.military.rows.map((r) => r[0]));
    const boxes = geo.boxesIn.map((q) => g.inventory.boxes.get(q.id)).filter(Boolean);
    const rolls = boxes.map((b) => { const was = b.rolled; g.inventory.open(b); const ids = b.slots.map((x) => x.id); if (!was) { b.rolled = false; b.slots = []; } return { t: b.kind, ids }; });
    g.inventory.opened = null;
    const ok = heldOut && boxes.length >= 3 && rolls.every((r) => r.t === 'military' && r.ids.every((i) => allowed.has(i))) && rolls.some((r) => r.ids.length);
    return ok ? true : JSON.stringify({ heldOut, locked: door.locked, mat: door.material, boxes: boxes.length, rolls });
  }));

  await check('bases: the rail spur runs from the Iron Line into the yard; the yard gate is locked steel until you open it (kicked in), then you walk in and the cargo train\'s boxcars can be searched', async () => withStanding(s, 40, async () => {
    const y = B.yard, gate = y.gate;
    if (!B.spur || !(B.spur.z1 > B.z1)) return JSON.stringify({ spur: B.spur });
    await C('teleport', { x: gate.x + 3, z: gate.z });
    for (let k = 0; k < 10; k++) await api._step(10);
    const door = g.interiors.byId.get(`mb:${s.id}.yard:d0`);
    if (!door) return 'yard gate not hung';
    if (!door.locked) g.interiors.setLocked(door, true); // (a page that ran this before: the yard gate locked again)
    await C('teleport', { x: gate.x + 1.6, z: gate.z });
    await api._step(6);
    await holdKey('KeyA', 1.5);
    const held = g.player.x > gate.x + 0.2 && door.locked;
    let kicks = 0;
    while (door.locked && kicks < 6) { g.interiors.kick(door, g.player); kicks++; await api._step(20); }
    await C('teleport', { x: gate.x + 2.2, z: gate.z });
    await api._step(6);
    await holdKey('KeyA', 3, () => g.player.x < gate.x - 3);
    const inYard = g.player.x < gate.x - 2;
    const cars = B.train.filter((c) => c.kind !== 'loco');
    const boxes = [...g.inventory.boxes.values()].filter((b) => b.label?.includes('CARGO TRAIN'));
    return held && !door.locked && kicks >= 2 && inYard && cars.length >= 3 && boxes.length >= 3 ? true
      : JSON.stringify({ held, locked: door.locked, kicks, inYard, x: r1(g.player.x), gx: gate.x, cars: cars.length, boxes: boxes.length });
  }));

  await check('bases: an Arizona army post at night: the searchlights on the towers near you sweep and a sentry picks you out further in a beam than in the dark', async () => withStanding(s, 40, async () => {
    await C('setTime', { hour: 23 });
    await C('teleport', inside); for (let k = 0; k < 8; k++) await api._step(10);
    const on = M.poolMesh.visible && M.beamMesh.visible && M.beamMesh.count >= 2;
    const tw = B.towers.slice().sort((a, b) => Math.hypot(a.x - g.player.x, a.z - g.player.z) - Math.hypot(b.x - g.player.x, b.z - g.player.z))[0];
    const st = s.towerState.get(tw.id), p0 = st ? { x: st.x, z: st.z } : null;
    let far = 0; for (let k = 0; k < 24 && st; k++) { await api._step(10); far = Math.max(far, Math.hypot(st.x - p0.x, st.z - p0.z)); }
    // A sentry's reach: in the dark, then standing in a searchlight's pool.
    const guards0 = s.guards;
    for (const p of s.pools) p.x = 1e9;
    const dark = g.bases.spotRange(s), unlit = !g.bases.lit(s, g.player.x, g.player.z);
    s.pools[0].x = g.player.x; s.pools[0].z = g.player.z; s.pools[0].kind = 'search';
    const litR = g.bases.spotRange(s), lit = g.bases.lit(s, g.player.x, g.player.z);
    s.guards = guards0;
    await C('setTime', { hour: 12 }); await api._step(10);
    const off = !M.poolMesh.visible;
    return on && far > 1 && unlit && lit && litR > dark * 1.5 && off ? true : JSON.stringify({ on, beams: M.beamMesh.count, pools: M.poolMesh.count, far: r1(far), dark: r1(dark), litR: r1(litR), unlit, lit, off });
  }));

  await check('bases: the secret project\'s logs are in the base\'s records (each search turns up the next) and its way down is a hook the underground system can attach to', async () => withStanding(s, 40, async () => {
    const proj = B.B.project, hooks = M.hooks();
    const ids = [...s.logIds];
    if (!ids.length) return 'no records';
    const L = B.lots.find((q) => !q.yard && B.geo(q).boxesIn.some((b) => b.log)), rec = B.geo(L).boxesIn.find((b) => b.log);
    await C('teleport', { x: rec.x, z: rec.z }); for (let k = 0; k < 4; k++) await api._step(10);
    const box = g.inventory.boxes.get(rec.id);
    if (!box) return JSON.stringify({ registered: false, id: rec.id });
    const seq0 = g.eventSeq, read0 = s.logsRead;
    g.inventory.open(box); await api._step(2); g.inventory.opened = null; await api._step(2);
    const ev = g.events.find((e) => e.seq > seq0 && e.type === 'baseLog');
    const hookOk = built.every((b) => b.hook && Number.isFinite(b.hook.x) && b.inBase(b.hook.x, b.hook.z) && b.hook.levels >= 1) && hooks.length === built.length;
    return ev?.text === proj.logs[read0] && s.logsRead === read0 + 1 && hookOk ? true : JSON.stringify({ ev: ev ?? null, read: s.logsRead, hooks: hooks.length, built: built.length });
  }));

  await check('bases: under 150 draw calls at the widest zoom over a built airfield (Patrick, Florida) by day and at night', async () => {
    const P = M.byId.patrick?.B ?? built.find((b) => b.row.template === 'airfield');
    const lv0 = g.zoomLevel, out = {};
    await C('teleport', { x: (P.cantonW.x0 + P.cantonW.x1) / 2, z: (P.cantonW.z0 + P.cantonW.z1) / 2 + 40 });
    for (let k = 0; k < 6; k++) g.setZoom(g.zoomLevel + 1);
    for (const hour of [12, 23]) { await C('setTime', { hour }); await C('step', { seconds: 4 }); g.render(0); out[hour] = (await C('perf')).drawCalls; }
    g.setZoom(lv0); await C('step', { seconds: 3 });
    await home();
    return out[12] < 150 && out[23] < 150 ? true : JSON.stringify(out);
  });
}
