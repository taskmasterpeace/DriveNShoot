// THE MILITARY BASES for agents (docs/design/WEB_MILITARY_BASES.md; rows data/milbases.js, plan world/citygen/milbase.js,
// run systems/milbases.js): the `milbase` command (list the rows, go to one, its live state, stamp one anywhere, and the
// sealed puzzle's own verbs through the same functions E calls) and the lane's named selftest checks (each returns true or
// a JSON diagnostic). Staged bases stand on free desert near (-4000, -9000) by day; the player acts on their own keys.
import { MILBASES, MILBASES_BY_ID, MB_RULES, MB_MOTOR, validateMilbases } from '../data/milbases.js';
import { FACTIONS } from '../data/society.js';
import { BASE_RULES } from '../data/bases.js';
import { VEHICLES } from '../systems/vehicles.js';
import { LOOT } from '../data/items.js';
import { RAY_BULLET } from '../engine/collision.js';
import { freeSpot } from './citygen-api.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function milbasesCommands(api, need) {
  const g = api.g, P = () => g.player;
  const row = (id) => { const M = MILBASES_BY_ID.get(id); need(M, `no base "${id}" (milbase action=list names them)`); return M; };
  const recOf = (M) => g.citygen.plan.find((r) => r.milbase === M.id);
  const live = (id) => { const s = g.milbases.live.get(id); need(s, `base "${id}" is not built (milbase action=goto id=${id} stands you there)`); return s; };
  return {
    milbase: {
      group: 'world',
      desc: 'THE MILITARY BASES (docs/design/WEB_MILITARY_BASES.md; rows data/milbases.js): one large base per state at a real installation, plus the big ones the drivable world reaches (Arizona, Florida). Each a double chain-link perimeter with gates and towers, checkpoints on the approach, a command post over a bunker level, an armory (the best loot, rolled once, never refilled), a hospital, a motor pool of real dead vehicles, a fuel farm, housing; by shape a runway with hangars, piers and a dry dock, or igloo rows. And a STATE: held (a garrison that challenges once then fires, a quartermaster), overrun (a horde that pours out at a noise) or sealed (power, a code, the blast door). action=list: every row and where it stands; goto id=: stand at its west checkpoint (it builds); state id=: the live base; rows: the rows and their check; stamp id= x z: build one anywhere; power|read|keypad id= (code=): the sealed puzzle\'s verbs, from where you stand (E does the same).',
      args: { action: { type: 'string', default: 'list', enum: ['list', 'goto', 'state', 'rows', 'stamp', 'release', 'power', 'read', 'keypad'] }, id: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' }, code: { type: 'string' }, drive: { type: 'boolean' } },
      run: async ({ action, id, x, z, code, drive }) => {
        const MB = g.milbases, CG = g.citygen;
        if (action === 'rows') return { rows: MILBASES.length, problems: validateMilbases(MILBASES, FACTIONS), rules: MB_RULES };
        if (action === 'list') {
          const rows = MILBASES.filter((M) => !drive || M.drive).map((M) => MB.rowView(M));
          const by = {}; for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1;
          return { n: rows.length, states: new Set(rows.filter((r) => r.kind === 'state').map((r) => r.state)).size, byStatus: by, planned: rows.filter((r) => r.rec && !r.beyond).length, beyond: rows.filter((r) => r.beyond).length, live: [...MB.live.keys()], rows, report: CG.plan.milbaseReport ?? null };
        }
        if (action === 'stamp') {
          const M = row(id);
          if (x === undefined) { const s = freeSpot(g, P().x, P().z, M.size[0] / 2 + MB_RULES.approach.len + 20); need(s, 'no free ground near you (give x and z)'); x = s.x; z = s.z; }
          const t = CG.stampAt({ milbase: M.id, id: `mb-at-${M.id}`, x, z, seed: 1 });
          return MB.view(MB.live.get(M.id)) ?? { built: !!t };
        }
        if (action === 'release') { const M = row(id), rec = g.citygen.plan.find((r) => r.milbase === M.id && r.adhoc); if (rec) CG.remove(rec.id); else { const pr = recOf(M); if (pr) CG.release(pr.id); } return { released: !MB.live.has(M.id) }; }
        if (action === 'goto') {
          const M = row(id), rec = recOf(M);
          need(rec, `${M.name} has no record (off the grid)`);
          if (P().inVehicle) g.exitVehicle(true);
          const half = M.size[0] / 2;
          await api.call('teleport', { x: rec.x - half - MB_RULES.approach.checks[1] - 12, z: rec.z + 2 });
          if (!CG.live.has(rec.id)) CG.stamp(rec);
          await api._step(10);
          return MB.view(MB.live.get(M.id));
        }
        if (action === 'state') return MB.view(live(row(id).id));
        const s = live(row(id).id);
        if (action === 'power') return MB.power(s, P());
        if (action === 'read') return MB.read(s, P());
        if (action === 'keypad') return MB.keypad(s, code ?? '', P());
        return { ok: false };
      },
    },
  };
}

// ---- the selftest's checks (WEB_MILITARY_BASES.md §8) ------------------------------------------------------------------
export async function milbasesChecks({ api, g, check, C }) {
  const p = g.player, CG = g.citygen, MB = g.milbases, F = g.society.factions;
  const holdKey = async (code, seconds, until) => { g.input.down.add(code); g.input.pressed.add(code); try { for (let f = 0; f < seconds * 60; f++) { await api._step(1); if (until?.()) break; } } finally { g.input.down.delete(code); } };
  const stand = async (x, z) => {
    if (p.inVehicle) g.exitVehicle(true);
    if (Math.hypot(p.x - x, p.z - z) > 120) await C('teleport', { x, z });
    p.x = x; p.z = z; p.vx = 0; p.vz = 0; p.gy = g.streamer?.W?.groundAt?.(x, z) ?? p.gy; g.standOn?.(p);
    g.camLook.x = x; g.camLook.z = z;
    await api._step(2);
  };
  const stampBase = async (id, sx, sz) => {
    const M = MILBASES_BY_ID.get(id), half = M.size[0] / 2 + MB_RULES.approach.len + 20;
    const at = freeSpot(g, sx, sz, half);
    if (!at) return null;
    await C('teleport', { x: at.x - M.size[0] / 2 - 60, z: at.z });
    CG.stampAt({ milbase: id, id: `mb-test-${id}`, x: at.x, z: at.z, seed: 77 });
    await api._step(4);
    return MB.live.get(id) ?? null;
  };
  const unstamp = (id) => { CG.remove(`mb-test-${id}`); MB.recs.delete(id); };
  const clearNear = (x, z, r) => { for (const c of [...g.chars]) if (c !== p && !c.npc && !c.mbId && Math.hypot(c.x - x, c.z - z) < r) g.removeChar(c); };
  const gm = g.godMode;

  await check('milbases: the rows validate - 56 rows, 50 state rows (one per state, each at the atlas\'s own point, class, shape and state), 6 big ones the drivable world reaches (every shape and every state among them); the plan accounts for every row (the drivable ones planned on free ground in the streamed world, the rest beyond it or off the grid)', async () => {
    const bad = validateMilbases(MILBASES, FACTIONS), states = new Set(MILBASES.filter((M) => M.atlas).map((M) => M.state)).size;
    const rep = CG.plan.milbaseReport ?? [], drive = MILBASES.filter((M) => M.drive);
    const planned = drive.filter((M) => rep.find((r) => r.id === M.id)?.status === 'planned').length;
    const all = rep.length === MILBASES.length && rep.every((r) => ['planned', 'beyond', 'offmap'].includes(r.status));
    const sizes = Object.entries(MB_MOTOR.sizes).every(([k, [l, w, t]]) => VEHICLES[k] && Math.abs(VEHICLES[k].len - l) < 0.01 && Math.abs(VEHICLES[k].wid - w) < 0.01 && Math.abs(VEHICLES[k].tall - t) < 0.01);
    return !bad.length && MILBASES.length === 56 && states === 50 && planned === drive.length && all && sizes ? true : JSON.stringify({ bad: bad.slice(0, 8), n: MILBASES.length, states, planned, drive: drive.length, report: rep.filter((r) => r.status !== 'planned' && r.status !== 'beyond').map((r) => `${r.id}:${r.status}`), sizes });
  });

  // ---- a held base (Camp Blanding's row, the Remnant's): the perimeter, the armory, the gate rule, the motor pool ----
  const RI = F.index.remnant, s0 = F.standing[RI], l0 = F.lifetime[RI];
  await C('setTime', { hour: 12 });
  g.godMode = true;
  const H = await stampBase('camp_blanding', -4000, -9000);
  try {
    await check('milbases: a stamped base has a closed perimeter with gates - both chain-link fences ring the yard with no gap but the two gates; a walker into the wire stays outside, the way in is a gate, and sight and a round pass through it', async () => {
      if (!H) return 'no free ground for the base';
      const mb = H.mb, boxes = H.t.built.boxes.filter((b) => b.tag === 'mb-fence');
      const covered = (x, z) => boxes.some((b) => x >= b.minX - 0.05 && x <= b.maxX + 0.05 && z >= b.minZ - 0.05 && z <= b.maxZ + 0.05 && (b.base ?? 0) < 50);
      const gaps = [];
      for (const f of mb.fences) for (const s of ['N', 'S', 'W', 'E']) {
        const horiz = s === 'N' || s === 'S', fixed = s === 'N' ? f.z0 : s === 'S' ? f.z1 : s === 'W' ? f.x0 : f.x1, a0 = horiz ? f.x0 : f.z0, a1 = horiz ? f.x1 : f.z1;
        let open = null;
        for (let a = a0 + 0.25; a < a1; a += 0.5) {
          const ok = horiz ? covered(a, fixed) : covered(fixed, a);
          if (!ok && open === null) open = a; else if (ok && open !== null) { gaps.push({ fence: f.kind, s, a: r1(open), b: r1(a) }); open = null; }
        }
        if (open !== null) gaps.push({ fence: f.kind, s, a: r1(open), b: r1(a1) });
      }
      // every gap is a gate's (the outer gate's own leaf is open on a held base: its gap is the gate)
      const gateGap = (q) => (q.s === 'W' || q.s === 'E') && mb.gates.some((G) => G.side === q.s && Math.abs((q.a + q.b) / 2 - G.at) < 1 && q.b - q.a <= G.w + 1);
      const closed = gaps.every(gateGap) && gaps.length === 4;
      // walk into the south wire from outside: you stay outside
      const o = mb.fences[0], wx = o.x0 + MB_RULES.fence.towerEvery / 2 + 3; // between two towers
      await stand(wx, o.z1 + 2.2);
      await holdKey('KeyW', 2.5);
      const walker = p.z > o.z1;
      const path = g.nav.foot.find(o.x0 - 20, H.t.rec.z + 30, H.t.rec.x, H.t.rec.z + 60);
      const viaGate = !!path && path.some((q) => Math.abs(q.x - o.x0) < 3 && Math.abs(q.z - H.t.rec.z) < MB_RULES.fence.gate / 2 + 1);
      const see = g.los(wx, o.z1 + 6, wx, o.z1 - 6);
      const round = g.statics.raycast(wx, o.z1 + 6, 0, -1, 12, RAY_BULLET) >= 11.9;
      return closed && walker && viaGate && see && round ? true : JSON.stringify({ gaps, closed, walker, z: r1(p.z), fence: o.z1, viaGate, path: path?.length ?? null, see, round });
    });

    await check('milbases: the armory\'s loot rolls once and never refills - its doors are locked steel; a crate holds the armory\'s table; empty it, release the base and build it again: the crate is still empty', async () => {
      if (!H) return 'no base';
      const A = H.mb.armory, inv = g.inventory;
      await stand((A.x0 + A.x1) / 2, A.z0 - 4);
      CG.openings(p.x, p.z); // the armory's doors hang as you come near (citygen's scan; the battery holds it still) and lock
      await api._step(4);
      const crates = [...inv.boxes.values()].filter((b) => b.kind === 'mb_armory');
      const box = crates[0];
      if (!box) return JSON.stringify({ crates: crates.length });
      inv.open(box);
      const table = new Set(LOOT.mb_armory.rows.map((r) => r[0]));
      const first = box.slots.map((q) => q.id), fromTable = first.length > 0 && first.every((id) => table.has(id));
      inv.opened = null;
      box.slots.length = 0; // taken, every last round
      const id = box.id, locked = H.armoryLocked;
      const rec = H.t.rec;
      CG.release(rec.id); await api._step(2); CG.stamp(rec); await api._step(2);
      const again = inv.boxes.get(id);
      inv.open(again); const after = again.slots.length; inv.opened = null;
      return fromTable && locked && again && again.rolled && after === 0 ? true : JSON.stringify({ first, fromTable, locked, again: !!again, rolled: again?.rolled, after });
    });

    await check('milbases: a held base challenges a trespasser in sight once, then fires - walk in through the west gate on your own feet: one warning; stay past the grace and the garrison opens fire on you (a Remnant-friendly walker is waved through)', async () => {
      const s = MB.live.get('camp_blanding');
      if (!s) return 'no base';
      F.set('remnant', FACTIONS.remnant.start); MB.calm(s, 'selftest'); MB.rec(s.id).warnedAt = -1e9;
      const G = s.mb.gates[0], gx = G.x, gz = G.z;
      await stand(gx - 6, gz + 1.5);
      const seq0 = g.eventSeq;
      await holdKey('KeyD', 4, () => p.x > gx + 14);
      await api._step(20);
      const warned = s.alert === 'warned' && g.events.some((e) => e.seq > seq0 && e.type === 'milbaseWarning');
      const heldFire = s.guards.every((c) => !g.ai.hostile(c, p));
      const shots0 = g.events.filter((e) => e.seq > seq0 && e.type === 'shot').length;
      await api._step(Math.round((BASE_RULES.grace + 2) * 60));
      const hostile = s.alert === 'hostile' && s.guards.filter((c) => c.alive && g.ai.hostile(c, p)).length >= 2;
      const fired = s.guards.some((c) => c.target === p);
      const warnings = g.events.filter((e) => e.seq > seq0 && e.type === 'milbaseWarning').length;
      const alarm = g.events.find((e) => e.seq > seq0 && e.type === 'milbaseAlarm');
      // friendly: the same walk is waved through
      MB.calm(s, 'selftest'); MB.rec(s.id).warnedAt = -1e9; F.set('remnant', 40);
      await stand(gx - 6, gz + 1.5);
      const seq1 = g.eventSeq;
      await holdKey('KeyD', 4, () => p.x > gx + 14);
      await api._step(Math.round((BASE_RULES.grace + 1) * 60));
      const waved = s.alert === 'calm' && g.events.some((e) => e.seq > seq1 && e.type === 'milbaseCleared') && !g.events.some((e) => e.seq > seq1 && e.type === 'milbaseWarning');
      return warned && heldFire && hostile && fired && warnings === 1 && alarm?.why === 'stayed' && waved ? true : JSON.stringify({ warned, heldFire, hostile, fired, warnings, alarm: alarm ?? null, waved, alert: s.alert, shots0, at: [r1(p.x), r1(p.z)], guards: s.guards.length });
    });

    await check('milbases: draw calls stay under 150 standing in a motor pool of real dead vehicles (our own patrol trucks, carriers and pickups, one batch; the base one instanced mesh)', async () => {
      const s = MB.live.get('camp_blanding');
      if (!s?.mb.apron) return 'no motor pool';
      MB.calm(s, 'selftest'); F.set('remnant', 40);
      const ap = s.mb.apron;
      await stand((ap.x0 + ap.x1) / 2, ap.z1 + 2);
      await api._step(20);
      g.render(0);
      const perf = await C('perf');
      const dead = g.wrecks.list().filter((w) => w.key === `town:${s.t.rec.id}` && ['patrol', 'apc', 'pickup', 'van'].includes(w.type)).length;
      return perf.drawCalls < 150 && dead >= 8 ? true : JSON.stringify({ drawCalls: perf.drawCalls, dead });
    });
  } finally {
    F.standing[RI] = s0; F.lifetime[RI] = l0; F.retier(RI, false);
    unstamp('camp_blanding');
  }

  // ---- a sealed base (the Navajo depot's row) ----
  const S = await stampBase('navajo_depot', -4000, -9000);
  try {
    await check('milbases: a sealed base\'s blast door opens only with power and the code - dead keypad with neither, dead with the code but no power, a wrong code buzzes with power; the generator (a fuel can) and the duty log\'s code open it, and then you walk through', async () => {
      if (!S) return 'no free ground for the base';
      const R = MB.rec(S.id), B = S.mb.blast, Gn = S.mb.generator, L = S.mb.log, inv = g.inventory;
      await stand(B.x, B.z - 2.2);
      const a = MB.keypad(S, R.code, p); // no power, code not read: the right digits by luck still meet a dead keypad
      await stand(L.x, L.z);
      const rd = MB.read(S, p);
      await stand(B.x, B.z - 2.2);
      const b = MB.keypad(S, rd.code, p);
      await stand(Gn.x - 2.2, Gn.z);
      const dry = MB.power(S, p);
      const pack = inv.carried.slots.splice(0), cap0 = inv.carried.cap; // room in the pack for one can (put back after)
      inv.carried.cap = Math.max(cap0, 40); inv.add(inv.carried, 'fuel_can', 1);
      const pw = MB.power(S, p);
      await stand(B.x, B.z - 2.2);
      const c = MB.keypad(S, '0000' === R.code ? '1111' : '0000', p);
      const shut = S.run.blast.box.base === 0;
      const d = MB.keypad(S, rd.code, p);
      const open = S.run.blast.box.base > 50;
      await holdKey('KeyS', 1.6);
      const through = p.z > B.z + 1;
      inv.carried.slots.splice(0, inv.carried.slots.length, ...pack); inv.carried.cap = cap0;
      return !a.ok && rd.ok && !b.ok && !dry.ok && pw.ok && !c.ok && shut && d.ok && open && through ? true : JSON.stringify({ a, rd: rd.ok, b, dry, pw, c, shut, d, open, through, z: r1(p.z), door: B.z });
    });
  } finally { unstamp('navajo_depot'); }

  // ---- an overrun base (Yuma's row) ----
  // room in the 160 for the horde: the battery's leftover far people go (the far fold does this in play; it is off here)
  for (const c of [...g.chars]) if (c !== p && !c.npc && !c.mbId && !c.crewRec && !c.res && Math.hypot(c.x - p.x, c.z - p.z) > 200) g.removeChar(c);
  const O = await stampBase('yuma_pg', -4000, -9000);
  try {
    await check('milbases: an overrun base\'s horde comes out at a gunshot - quiet, the infected stand inside the wire; one shot fired 30 m outside the west gate and they hear it (and each other\'s moans) and pour out through the gate', async () => {
      if (!O) return 'no free ground for the base';
      const G = O.mb.gates[0], o = O.outer;
      const alive = () => O.horde.filter((c) => c.alive);
      const outside = () => alive().filter((c) => !MB.inside(O, c.x, c.z, -0.5)).length;
      await stand(G.x - 30, G.z - 12);
      clearNear(G.x - 30, G.z, 30);
      await api._step(120);
      const quiet = outside(), n = alive().length;
      await C('give', { pistol: 12 }); await C('equip', { weapon: 'pistol' });
      await C('fire', { x: p.x - 10, z: p.z, shots: 1 });
      p.hidden = true; // you shot and then you hid: they come to where the sound was, not to you
      let most = 0;
      for (let i = 0; i < 70; i++) { await api._step(60); most = Math.max(most, outside()); if (most >= 8) break; }
      p.hidden = false;
      return n >= 20 && quiet <= 2 && most >= 8 && MB.counts.relays > 0 ? true : JSON.stringify({ n, quiet, most, relays: MB.counts.relays, o });
    });
  } finally { unstamp('yuma_pg'); g.godMode = gm; }
}
