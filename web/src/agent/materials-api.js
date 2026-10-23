// The agent's side of what things are made of (systems/materials.js, systems/blood.js; docs/design/WEB_MATERIALS.md):
// COMMANDS rows (spread into api.js's table) and the selftest checks (called from api.js runSelfTest).
import { MATERIALS, PIECES, MATERIAL_RULES } from '../data/materials.js';
import { DOOR } from '../data/interiors.js';

const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;

export function materialCommands(api) {
  const g = api.g;
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };
  return {
    material: {
      group: 'world', desc: 'What a thing is made of (docs/design/WEB_MATERIALS.md, rows in src/data/materials.js), and its state. x,z: the door or window there, else the collision box under that point or the nearest within 1.5 m (a wall, a crate, a wreck, a tree; the island or the streamed ring), else a car: its material, WHY the rules say so (its tag; a building wall\'s building, outer wall or partition, and the finish its shader paints), the row (stop = round energy one pass soaks, ricochet chance and angle, spray, hp per m², breaks, breach width, blast resistance, fire), and its state (a wall\'s 1 m strips with their hp, the breaches in it, char, burning; a crate\'s hp; does not break). id=: a door or window id, a car (v<N>), or a piece from build (P<N>). No args: every row, the rules, the island counted by material, the counters (rounds through, glanced off, stopped; things broken, breaches, burnt, rams), the last things broken (what, how, where) and the last round\'s story.',
      args: { x: { type: 'number' }, z: { type: 'number' }, id: { type: 'string' } },
      run: async ({ x, z, id }) => {
        const M = g.materials;
        if (id) {
          if (M.placed.has(id)) return M.pieceView(id);
          const op = g.interiors.byId.get(id);
          if (op) return M.opView(op.leaves ? op.leaves[0] : op);
          const v = api.findVeh(id);
          need(v, `nothing with id ${id}: a door or window id (doors, windows), a car (v<N>) or a piece (build)`);
          return M.vehicleView(v);
        }
        if (x !== undefined || z !== undefined) { need(x !== undefined && z !== undefined, 'give both x and z'); return M.at(x, z); }
        return {
          rows: Object.keys(MATERIALS).map((k) => M.rowView(k)),
          rules: { tags: MATERIAL_RULES.tags, finish: MATERIAL_RULES.finish, partition: MATERIAL_RULES.partition, unknown: MATERIAL_RULES.unknown, breakable: MATERIAL_RULES.breakable },
          island: M.census(), stats: { ...M.stats }, burning: M.burning.size, broken: [...M.recs.values()].filter((r) => r.broken).length,
          pieces: [...M.placed.keys()], last: M.last, log: M.log.slice(-12),
        };
      },
    },
    build: {
      group: 'world', desc: `Stand a piece on the island (|x|, |z| < 448): a wall of a material ${Object.keys(PIECES).filter((k) => !PIECES[k].prop && !PIECES[k].shack).join(' | ')} (len m long, along axis x or z, centred on x,z), a crate, or a shack (four walls of mat=wood|sheet_metal round a 3.4 x 3 m floor, a door gap on its -z side). It is solid, blocks the nav grid, takes rounds, blasts, fire and rams by its material, breaks, and is in the save. remove=<id> takes one down. Returns its id and state (material id= reads it again).`,
      args: { kind: { type: 'string', enum: Object.keys(PIECES) }, x: { type: 'number' }, z: { type: 'number' }, axis: { type: 'string', default: 'x', enum: ['x', 'z'] }, len: { type: 'number' }, mat: { type: 'string', enum: Object.keys(MATERIALS) }, remove: { type: 'string' } },
      run: async ({ kind, x, z, axis, len, mat, remove }) => {
        const M = g.materials;
        if (remove) { need(M.placed.has(remove), `no piece ${remove}; pieces: ${[...M.placed.keys()].join(', ') || 'none'}`); M.unbuild(remove); return { removed: remove }; }
        need(kind && x !== undefined && z !== undefined, 'give kind, x and z (or remove=<id>)');
        let id;
        try { id = M.build(kind, x, z, axis, len ?? null, mat ?? null); } catch (e) { need(false, e.message); }
        return M.pieceView(id);
      },
    },
    breakAt: {
      group: 'world', desc: 'Hurt what is at x,z by cause, through the same paths the game uses: hit (dmg to the thing there: a wall\'s strip, a crate, a door), blast (a blast of radius r at x,z: everything in reach by its material, as a grenade does), fire (a fire patch of radius r for 8 s: what burns there catches; step the sim to watch it burn), ram (dmg as a car hitting it: a breach at least a car wide). Returns what broke or opened, and the thing\'s state.',
      args: { x: { type: 'number', required: true }, z: { type: 'number', required: true }, cause: { type: 'string', default: 'hit', enum: ['hit', 'blast', 'fire', 'ram'] }, dmg: { type: 'number', default: 400 }, r: { type: 'number', default: 3 } },
      run: async ({ x, z, cause, dmg, r }) => {
        const M = g.materials, s0 = { ...M.stats };
        if (cause === 'blast') { const out = M.blast(x, z, r, g.player, dmg > 0 ? dmg : undefined); return { cause, ...out, stats: diff(M.stats, s0) }; }
        if (cause === 'fire') { g.throwables.startFire(x, z, r, 8, g.player); return { cause, fire: { x: r1(x), z: r1(z), r, seconds: 8 }, hint: 'step the sim; material x= z= shows what caught' }; }
        const door = g.interiors.doors.find((d) => Math.hypot(d.x - x, d.z - z) < d.width / 2 + 0.3);
        if (door) { const res = M.hitDoor(door, dmg, cause, g.player, x, z); return { cause, door: door.id, result: res ?? (M.recs.get(`door:${door.id}`)?.broken ? 'broken already' : 'held'), state: M.recView(M.doorRec(door)) }; }
        const S = g.statics;
        let best = null, bd = 1.0;
        for (const b of S.boxes) { if (b.op) continue; const qx = Math.max(b.minX, Math.min(x, b.maxX)), qz = Math.max(b.minZ, Math.min(z, b.maxZ)), d = Math.hypot(qx - x, qz - z); if (d < bd) { bd = d; best = b; } }
        need(best, `nothing solid within 1 m of ${r1(x)},${r1(z)} on the island (material x= z= says what is where)`);
        need(M.breakable(best), `the ${best.tag} there is ${M.classify(best, x, z).key}: it does not break (it chips and holds)`);
        const res = M.hitBox(best, x, z, dmg, cause, g.player, cause === 'ram' ? 2.4 : 0);
        const rec = M.boxRec.get(best);
        return { cause, thing: best.tag, material: M.classify(best, x, z).key, result: res ?? 'held', state: M.recView(rec), stats: diff(M.stats, s0) };
      },
    },
    blood: {
      group: 'observe', desc: 'Blood and marks near x,z (default: you) within r (systems/blood.js): every decal on a wall, a door, a car or the floor (smears) with its tile (spray, drips, smear, hole_*, scorch), where, which way it faces, whether it is blood, its age in game hours, how dry (0 fresh .. 1 brown) and washed it is, outdoors or not, its colour now; the blood clock (game hours) and counters (wall splashes, cars, smears, washed away).',
      args: { x: { type: 'number' }, z: { type: 'number' }, r: { type: 'number', default: 6 } },
      run: async ({ x, z, r }) => g.blood.view(x ?? g.player.x, z ?? g.player.z, r),
    },
  };
}

function diff(a, b) { const o = {}; for (const k of Object.keys(a)) if (a[k] !== b[k]) o[k] = a[k] - b[k]; return o; }

// ---- selftest ------------------------------------------------------------------------------------------------------------
// ctx: { g, api, C, check, extra, clearAt, inRuins } from runSelfTest (api.js).
export async function materialChecks(ctx) {
  const { g, api, C, check, extra, clearAt, inRuins } = ctx;
  const M = g.materials;
  const before = M.save(); // everything this block stands, breaks and bleeds goes back to this at the end
  // ... and the whole world with it (the clock, the needs, the dead, the word on them): the block runs eight game hours
  // and a fire down, and the checks after it must not inherit a tired player or a town still talking about the killing.
  const world0 = (await C('save')).save;
  const cast = [];
  const man = (x, z) => { const c = extra('drifter', x, z, { hold: true }); cast.push(c); return c; };
  // An open stretch of the Glass Flats: nothing solid within 16 m, dry, off the roads' and camps' lines.
  const S = g.statics;
  let spot = null;
  for (let x = -420; x <= 420 && !spot; x += 24) for (let z = 300; z <= 430 && !spot; z += 22) {
    if (Math.abs(x) < 30 || (x > 330 && x < 440)) continue;
    let clear = true;
    for (const b of S.boxes) if (b.maxX > x - 16 && b.minX < x + 16 && b.maxZ > z - 16 && b.minZ < z + 16) { clear = false; break; }
    if (clear && g.water.depthAt(x, z) <= 0 && g.water.depthAt(x + 14, z) <= 0) spot = { x, z };
  }
  const stage = async (x, z) => {
    if (g.player.inVehicle) g.exitVehicle(true);
    g.autopilot = null; g.aimOverride = null;
    await C('setTime', { hour: 12 }); await C('setWeather', { key: 'CLEAR', instant: true });
    for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - x, c.z - z) < 40) g.removeChar(c);
    await C('teleport', { x, z });
    await api._step(2);
  };
  // A clean gun (the battery's earlier fights wear guns until they jam or break, and a broken one does not fire).
  const gun = async (w = 'pistol') => { await C('give', { [w === 'pistol' ? 'pistol' : w]: 60, ...(w !== 'pistol' ? { weapon: w } : {}) }); await C('equip', { weapon: w }); await C('gun', { cond: 1, jam: false }); };
  const shootAt = async (x, z, n = 1) => { for (let k = 0; k < n; k++) await C('fire', { x, z, shots: 1 }); };
  try {
    await check('materials: every box on the island has a material by rule (no tag left to the default), the town built of adobe, the ruins of stucco, block and brick, rooms split by drywall', async () => {
      const unknown = {}, census = {};
      for (const b of S.boxes) {
        if (b.op) continue;
        const c = M.classify(b);
        census[c.key] = (census[c.key] ?? 0) + 1;
        if (c.why.startsWith('no rule')) unknown[b.tag] = (unknown[b.tag] ?? 0) + 1;
      }
      const need = ['adobe', 'stucco', 'block', 'brick', 'drywall', 'wood', 'sheet_metal', 'chainlink', 'sandbags', 'steel', 'concrete', 'carbody', 'cloth', 'scrap_wall'];
      const missing = need.filter((k) => !census[k]);
      return !Object.keys(unknown).length && !missing.length ? true : JSON.stringify({ unknown, missing, census });
    });
    if (!spot) { await check('materials: an open stretch of the Glass Flats to stage on', async () => 'no clear 32 m square found in the flats'); return; }
    const { x: sx, z: sz } = spot;
    await check('materials: a round passes a plank wall and still hits the man behind it, and stops in a concrete-block wall', async () => {
      await stage(sx, sz - 6); await gun('pistol');
      const wood = M.build('plank_wall', sx, sz, 'x', 3), block = M.build('block_wall', sx + 9, sz, 'x', 3);
      const a = man(sx, sz + 2.5), hpA = a.hp;
      const s0 = { ...M.pstats };
      for (let k = 0; k < 3 && a.hp === hpA; k++) await shootAt(a.x, a.z);
      const through = a.hp < hpA && M.pstats.penetrated > s0.penetrated, lastA = M.plast;
      await C('teleport', { x: sx + 9, z: sz - 6 }); await api._step(2);
      const b = man(sx + 9, sz + 2.5), hpB = b.hp, st1 = M.pstats.stopped;
      await shootAt(b.x, b.z, 3);
      const stopped = b.hp === hpB && M.pstats.stopped === st1 + 3, lastB = M.plast;
      M.unbuild(wood); M.unbuild(block);
      return through && stopped && lastA?.material === 'wood' && lastB?.material === 'block' ? true
        : JSON.stringify({ through, hp: [hpA, a.hp], lastA, stopped, hpB: [hpB, b.hp], lastB });
    });
    await check('materials: a steel plate glances a round off that meets it at a shallow angle (and the man behind it is untouched), and stops one that meets it square', async () => {
      const plate = M.build('steel_plate', sx, sz, 'x', 2.4);
      const t = man(sx, sz + 2.2), hp0 = t.hp;
      // From 8 m off along the plate, 10 degrees off its face, at its middle.
      const ang = (10 * Math.PI) / 180;
      await stage(sx - 8 * Math.cos(ang), sz - 0.07 - 8 * Math.sin(ang)); await gun('pistol');
      g.player.face = Math.PI / 2;
      const r0 = M.pstats.ricochets;
      await shootAt(sx + 0.2, sz - 0.07 + 0.2 * Math.tan(ang));
      const glanced = M.pstats.ricochets === r0 + 1 && M.plast?.result === 'ricochet' && M.plast.graze < 20, lastG = M.plast;
      await C('teleport', { x: sx, z: sz - 6 }); await api._step(2);
      const r1c = M.pstats.ricochets, st = M.pstats.stopped;
      await shootAt(sx, sz + 2.2, 2);
      const square = M.pstats.ricochets === r1c && M.pstats.stopped === st + 2 && M.plast?.material === 'steel';
      const safe = t.hp === hp0;
      M.unbuild(plate);
      return glanced && square && safe ? true : JSON.stringify({ glanced, lastG, square, last: M.plast, safe, hp: [hp0, t.hp] });
    });
    await check('materials: a frag thrown at a wooden door blows it off its hinges (its gap open to walk through, the nav grid told) and leaves a concrete wall beside it standing', async () => {
      const I2 = g.interiors;
      const door = I2.doors.find((d) => d.material === 'wood' && !d.locked && !d.broken && d.kind === 'back' && d.leaves.length === 1 && inRuins(d) && clearAt(d, 4) && g.nav.foot.free(d.x + d.nx * 6, d.z + d.nz * 6));
      if (!door) return 'no wooden back door in the ruins with open ground in front of it';
      for (const L of door.leaves) { L.th = 0; L.w = 0; I2.orient(L); } I2.flush();
      // A concrete wall 2.5 m out from the door, off to one side of the throw, parallel to the building.
      const ux = door.axis === 'x' ? 1 : 0, uz = 1 - ux;
      const cw = M.build('concrete_wall', door.x + door.nx * 2.2 + ux * 2.6, door.z + door.nz * 2.2 + uz * 2.6, door.axis, 2);
      await stage(door.x + door.nx * 6, door.z + door.nz * 6);
      for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - door.x, c.z - door.z) < 30) g.removeChar(c);
      await C('give', { frag: 1 });
      const since = g.eventSeq;
      await C('throw', { type: 'frag', x: door.x + door.nx * 1.2, z: door.z + door.nz * 1.2 });
      await api._step(30);
      const det = g.events.filter((e) => e.seq > since && e.type === 'detonated').pop();
      const broken = !!door.broken && M.brokenDoors.has(door.id);
      const wall = [...M.recs.values()].find((r) => r.id === cw);
      const standing = wall && !wall.broken && !wall.gaps.length && wall.parts.length === 1;
      const gap = g.nav.foot.free(door.x, door.z) || g.nav.foot.free(door.x + door.nx * 0.5, door.z + door.nz * 0.5);
      g.statics.raycast(door.x + door.nx * 2, door.z + door.nz * 2, -door.nx, -door.nz, 4, 1);
      const seen = g.statics.hit.box?.op?.door !== door; // a look in through the doorway meets no leaf
      M.unbuild(cw);
      ctx.brokeDoor = door;
      return broken && standing && gap && seen ? true : JSON.stringify({ door: door.id, broken, det: det ? { x: r1(det.x), z: r1(det.z), d: r1(Math.hypot(det.x - door.x, det.z - door.z)) } : null, hp: M.recView(M.recs.get(`door:${door.id}`)), standing, gap, seen });
    });
    await check('materials: rounds into a drywall partition open a breach in it you see through and walk through (the nav grid told)', async () => {
      // An island partition (drywall) with open floor on both sides of its middle.
      const part = S.boxes.find((b) => b.tag === 'wall' && !M.mine.has(b) && M.classify(b).key === 'drywall' && Math.max(Math.abs(b.minX), Math.abs(b.minZ)) > 110 && Math.max(b.maxX - b.minX, b.maxZ - b.minZ) > 3.2 && (() => {
        const h = b.maxX - b.minX > b.maxZ - b.minZ, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
        return g.nav.foot.free(h ? cx : cx - 1.6, h ? cz - 1.6 : cz) && g.nav.foot.free(h ? cx : cx + 1.6, h ? cz + 1.6 : cz);
      })());
      if (!part) return 'no drywall partition with open floor both sides';
      const horiz = part.maxX - part.minX > part.maxZ - part.minZ, cx = (part.minX + part.maxX) / 2, cz = (part.minZ + part.maxZ) / 2;
      const ox = horiz ? cx : cx - 2.6, oz = horiz ? cz - 2.6 : cz, nav0 = g.nav.foot.free(cx, cz);
      await stage(ox, oz); await gun('pistol');
      g.nav.foot.focus(cx, cz);
      for (let k = 0; k < 10 && !M.boxRec.get(part)?.gaps.length; k++) await shootAt(horiz ? cx : cx + 1.5, horiz ? cz + 1.5 : cz);
      const rec = M.boxRec.get(part);
      const breached = rec?.gaps.length > 0;
      const gx = rec?.gaps[0] ? (rec.gaps[0][0] + rec.gaps[0][1]) / 2 : 0;
      const px = horiz ? gx : cx, pz = horiz ? cz : gx;
      const walk = g.nav.foot.free(px, pz);
      // A look across the breach meets nothing of the wall (the room beyond may have a chair in the way).
      g.statics.raycast(horiz ? px : px - 1.2, horiz ? pz - 1.2 : pz, horiz ? 0 : 1, horiz ? 1 : 0, 2.4, 1);
      const look = !g.statics.hit.box || M.boxRec.get(g.statics.hit.box) !== rec;
      return breached && !nav0 && walk && look ? true : JSON.stringify({ wall: M.keyOf(part), breached, gaps: rec?.gaps, nav0, walk, look, strips: rec ? Array.from(rec.cells, Math.round) : null });
    });
    await check('materials: a man shot in front of a wall leaves his blood on it, still there 10 s later and darker after hours of game time; a body dragged leaves a smear', async () => {
      const w = M.build('block_wall', sx, sz + 1, 'x', 4);
      await stage(sx, sz - 6); await gun('pistol');
      const t = man(sx, sz + 0.2), w0 = g.blood.stats.wall;
      for (let k = 0; k < 3 && g.blood.stats.wall === w0; k++) await shootAt(t.x, t.z);
      const onWall = () => g.blood.near(sx, sz + 1, 2.5, true).filter((i) => g.blood.d.ny[i] < 0.5 && Math.abs(g.blood.d.z[i] - (sz + 1 - 0.125)) < 0.2);
      const fresh = onWall();
      if (!fresh.length) return JSON.stringify({ wall: g.blood.stats.wall - w0, hp: t.hp, near: g.blood.view(sx, sz + 1, 3) });
      const i = fresh[fresh.length - 1], v0 = g.blood.info(i);
      await C('step', { seconds: 10 });
      const still = g.blood.d.alive[i] === 1 && onWall().includes(i), v10 = g.blood.info(i);
      const nw = g.sky.nextWeatherIn; g.sky.nextWeatherIn = 1e9; // no rain to wash it while the hours go by
      await C('setTime', { hour: 12, fast: true }); await C('step', { seconds: 6 }); await C('setTime', { hour: 12, fast: false });
      g.sky.nextWeatherIn = nw;
      const vH = g.blood.info(i);
      const darker = vH.value < v0.value * 0.8 && vH.dry > 0.8 && vH.ageHours >= 4 && g.blood.d.alive[i] === 1;
      // Drag him: a dead body that moves smears the floor.
      t.hp = 1; await C('fire', { x: t.x, z: t.z, shots: 1 }); for (let k = 0; k < 3 && t.alive; k++) await shootAt(t.x, t.z);
      const sm0 = g.blood.stats.smear;
      for (let k = 0; k < 40; k++) { t.x += 0.06; await api._step(1); }
      const smear = g.blood.stats.smear > sm0;
      M.unbuild(w);
      return still && darker && smear && !t.alive ? true : JSON.stringify({ still, v0, v10, vH, darker, smear, dead: !t.alive });
    });
    await check('materials: fire burns a wooden shack down to charred stumps and leaves the sheet-metal one beside it and a concrete wall standing', async () => {
      const shack = M.build('shack', sx, sz, 'x', null, 'wood'), tin = M.build('shack', sx + 9, sz, 'x', null, 'sheet_metal'), cw = M.build('concrete_wall', sx - 4.5, sz, 'z', 3);
      await stage(sx, sz - 9);
      await C('give', { molotov: 1 });
      await C('throw', { type: 'molotov', x: sx, z: sz - 1.6 });
      await api._step(30);
      const recs = (id) => M.placed.get(id).recs.map((k) => M.recs.get(k));
      let lit = false;
      for (let s = 0; s < 50 && !recs(shack).every((r) => r.broken); s++) { await C('step', { seconds: 1 }); lit = lit || recs(shack).some((r) => r.burning); }
      const burnt = recs(shack).every((r) => r.broken && r.burntOut && r.char === 1);
      const tinOk = recs(tin).every((r) => !r.broken && !r.burning), wallOk = recs(cw).every((r) => !r.broken && !r.burning && r.char === 0);
      ctx.shackId = shack;
      M.unbuild(tin); M.unbuild(cw);
      return lit && burnt && tinOk && wallOk ? true : JSON.stringify({ lit, shack: recs(shack).map((r) => M.recView(r)), tinOk, wallOk });
    });
    await check('materials: what is broken survives a save and a load (a breached wall, a door off its hinges, a burnt shack), and a save from before brings them back whole', async () => {
      const wall = M.build('plank_wall', sx + 9, sz, 'x', 3);
      const rec = M.recs.get(`piece:${wall}`);
      M.hitWall(rec, sx + 9, 9999, 'hit', g.player);
      const saved = (await C('save')).save;
      const gaps = JSON.stringify(rec.gaps), door = ctx.brokeDoor;
      await C('load', { save: { ...saved, materials: before } });
      const whole = !M.placed.has(wall) && !M.placed.has(ctx.shackId) && (!door || (!door.broken && !M.brokenDoors.has(door.id)));
      await C('load', { save: saved });
      const r2c = M.recs.get(`piece:${wall}`);
      const back = !!r2c && JSON.stringify(r2c.gaps) === gaps && r2c.parts.length === 2 && (!door || (g.interiors.byId.get(door.id)?.broken && M.brokenDoors.has(door.id)))
        && M.placed.get(ctx.shackId)?.recs.every((k) => M.recs.get(k).broken);
      // The breach is walkable after the load too.
      const walk = g.nav.foot.free(sx + 9, sz);
      return whole && back && walk ? true : JSON.stringify({ whole, back, gaps: [gaps, r2c ? JSON.stringify(r2c.gaps) : null], parts: r2c?.parts.length, door: door?.id, walk });
    });
  } finally {
    for (const c of cast) if (g.chars.includes(c)) g.removeChar(c);
    g.sky.fast = false;
    await C('load', { save: { ...world0, materials: before } });
    await api._step(2);
  }
}
