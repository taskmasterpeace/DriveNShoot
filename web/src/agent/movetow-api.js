// MOVE-AND-TOW for agents (docs/design/WEB_MOVE_TOW.md): the `move` and `tow` commands, and the selftest's checks. The
// player acts on held keys in every check (SPACE, CTRL, W/S, G); vehicles, a fence, a mud pit and a shooter are staged.
import { MOVES, LOW_BODY, validateMoves } from '../data/moves.js';
import { LINES, MUD, TRAILER, TOW_VEHICLES, validateTowing } from '../data/towing.js';
import { VEHICLES } from '../systems/vehicles.js';
import { ITEMS } from '../data/items.js';
import { LAKE } from '../world/water.js';

const r2 = (v) => Math.round(v * 100) / 100;
const KINDS = Object.keys(MOVES);
const BOATS = ['airboat', 'jetski', 'gunboat', 'skiff', 'barge'];

export function moveTowCommands(api, need) {
  const g = api.g, P = () => g.player;
  const findV = (id) => g.vehicles.find((v) => v.id === id) ?? null;
  return {
    move: {
      group: 'player',
      desc: `THE MOVES (data/moves.js; systems/moves.js; WEB_MOVE_TOW.md): ${KINDS.join(', ')}. SPACE (pad A) is one verb that reads the ground ahead - a waist-high wall, fence or car hood: vault; chest high: climb over; at a sprint at the lip of a gap: jump it; crouched: a combat roll; on a roof deck's edge: drop-hang; else a dive that lands you PRONE. CTRL at a sprint slides. No args / action=status: the rows, the counts, the last move, what SPACE would do now (probe ahead along your facing or x,z). kind=<move> does it now toward x,z (or your facing) through the same rules, and reports where you ended and how. Being low is honest (LOW_BODY): a round that lines up with a low body meets it at share = max(floor, bodyH/1.8), 1 within 4 m - never invincible.`,
      args: { kind: { type: 'string', enum: ['status', 'probe', ...KINDS] }, x: { type: 'number' }, z: { type: 'number' } },
      run: async ({ kind = 'status', x, z }) => {
        const p = P(), M = g.moves;
        const dx = x !== undefined ? x - p.x : Math.sin(p.face), dz = z !== undefined ? z - p.z : Math.cos(p.face);
        if (kind === 'status' || kind === 'probe') {
          const pr = M.probe(p, dx, dz);
          return { probe: { kind: pr.kind, h: r2(pr.h), depth: r2(pr.depth), what: pr.what, at: pr.t < Infinity ? r2(pr.t) : null }, stance: g.stance.kind(p), stamina: r2(p.stamina ?? 1), ...M.view(), rows: kind === 'status' ? MOVES : undefined, lowBody: LOW_BODY };
        }
        need(!p.inVehicle && p.alive, 'must be on foot');
        const x0 = p.x, z0 = p.z, hp0 = p.hp;
        let ok;
        if (kind === 'vault' || kind === 'climb' || kind === 'jump') { const pr = M.probe(p, dx, dz); need(pr.kind === kind, `nothing to ${kind} there (ahead: ${pr.kind ?? 'clear'}${pr.what ? ` - ${pr.what} ${r2(pr.h)} m high, ${r2(pr.depth)} m deep` : ''})`); ok = M.start(p, kind, dx, dz, pr); }
        else if (kind === 'hang') { need(M.edgeOfRoof(p), 'not at the edge of a roof deck'); ok = M.start(p, 'hang', dx, dz); }
        else ok = M.start(p, kind, dx, dz);
        need(ok, `can't ${kind} now (stamina ${r2(p.stamina ?? 1)}, cooldown, or busy)`);
        for (let i = 0; i < 180 && p.mv; i++) await api._step(1);
        return { kind, moved: r2(Math.hypot(p.x - x0, p.z - z0)), x: r2(p.x), z: r2(p.z), stance: g.stance.kind(p), hurt: r2(hp0 - p.hp), stamina: r2(p.stamina), last: M.last };
      },
    },
    tow: {
      group: 'vehicle',
      desc: 'TOWING (data/towing.js; systems/towing.js; WEB_MOVE_TOW.md): lines between vehicles - a tow rope (stretches, parts at 21), a tow chain (no give, 100), the winch cable (30 m, reels in, 48), the wrecker\'s boom (lifts the front wheels) and a trailer\'s hitch (both rigid: the towed body swings on the pivot). At the wheel G hitches what is behind you with the best line you carry (or drops it); hold G with a winch to reel in whatever is ahead; with a boat trailer at the water G launches the boat or hauls one up. Mud holds a car that spins in it (BOGGED past 0.55): a pull frees it. No args: every line (kind, ends, length, smoothed load vs its break load, taut, winching), mud pits, bogged cars, trailers and their boats. action=hitch from=<id> to=<id> kind=rope|chain|cable|boom|hitch (free=true spends no item: staging) | release id=<line> | winch id=<line> on=true|false | mud x z r (a pit; remove=id) | launch id=<trailer> | haul id=<trailer> boat=<id> | load id=<trailer> boat=<id> (staging: put it on the bunks) | spawn what=towtruck|boattrailer|skiff|barge|rig x z h (rig: a pickup, a trailer on its hitch, a skiff on the bunks) | give n= (tow_rope and tow_chain into your pack).',
      args: { action: { type: 'string', default: 'status', enum: ['status', 'hitch', 'release', 'winch', 'mud', 'launch', 'haul', 'load', 'spawn', 'give'] }, from: { type: 'string' }, to: { type: 'string' }, kind: { type: 'string', enum: Object.keys(LINES) }, id: { type: 'string' }, on: { type: 'boolean', default: true }, free: { type: 'boolean', default: false }, x: { type: 'number' }, z: { type: 'number' }, r: { type: 'number', default: 5 }, h: { type: 'number', default: 0 }, what: { type: 'string', default: 'rig' }, boat: { type: 'string' }, remove: { type: 'string' }, n: { type: 'number', default: 1 } },
      run: async (a) => {
        const T = g.towing; need(T, 'no towing system');
        const link = () => { const l = T.links.find((q) => q.id === a.id); need(l, `no line ${a.id} (tow lists them)`); return l; };
        switch (a.action) {
          case 'hitch': { const A = findV(a.from ?? P().inVehicle?.id), B = findV(a.to); need(A && B, 'from= and to= must be vehicle ids'); const r = T.hitch(A, B, a.kind ?? 'rope', { free: a.free }); need(r.ok, r.why); return T.view(); }
          case 'release': { need(T.release(link()), 'not released'); return T.view(); }
          case 'winch': { need(T.winch(link(), a.on), 'that line has no winch'); return T.view(); }
          case 'mud': { if (a.remove) { T.removePit(a.remove); return T.view(); } const pt = T.addPit(a.x ?? P().x, a.z ?? P().z, a.r); return { pit: pt, ...T.view() }; }
          case 'launch': { const t = findV(a.id); need(t?.boatTrailer, 'id= must be a trailer'); const r = T.launch(t); need(r.ok, r.why); return { ...r, ...T.view() }; }
          case 'haul': { const t = findV(a.id), b = findV(a.boat) ?? T.boatBehind(t); need(t?.boatTrailer && b, 'id= a trailer, boat= a boat at its tail'); const r = T.haul(t, b); need(r.ok, r.why); for (let i = 0; i < 600 && b.hauling; i++) await api._step(1); return { onTrailer: b.onTrailer === t, ...T.view() }; }
          case 'load': { const t = findV(a.id), b = findV(a.boat); need(t?.boatTrailer && b?.boat, 'id= a trailer, boat= a boat'); T.load(t, b); return T.view(); }
          case 'spawn': {
            const x = a.x ?? P().x + 6, z = a.z ?? P().z, h = a.h;
            if (a.what === 'rig') {
              const fx = Math.sin(h), fz = Math.cos(h);
              const truck = g.vehiclesSys.spawn('pickup', x, z, h, '#6a5434'), tr = g.vehiclesSys.spawn('boattrailer', x - fx * 5.6, z - fz * 5.6, h, '#4c4f4a');
              const sk = g.vehiclesSys.spawn('skiff', tr.x, tr.z, h, '#3f6a6a');
              T.hitch(truck, tr, 'hitch', { free: true }); T.load(tr, sk);
              await api._step(2);
              return { truck: truck.id, trailer: tr.id, boat: sk.id, ...T.view() };
            }
            need(TOW_VEHICLES[a.what] || VEHICLES[a.what], `no vehicle row ${a.what}`);
            const v = g.vehiclesSys.spawn(a.what, x, z, h, a.what === 'towtruck' ? '#8a6a1c' : '#4f6a5a');
            return { id: v.id, type: v.type, name: v.name };
          }
          case 'give': { const n = Math.max(1, a.n); g.inventory.stow('tow_rope', n); g.inventory.stow('tow_chain', n); return { rope: g.inventory.carried.count('tow_rope'), chain: g.inventory.carried.count('tow_chain') }; }
          default: return { ...T.view(), rows: { lines: LINES, mud: MUD, trailer: TRAILER } };
        }
      },
    },
  };
}

// ---- the checks (src/agent/api.js runSelfTest calls this with its helpers) --------------------------------------------
export async function moveTowChecks(api, check, C, H) {
  const g = api.g, { hush, wvClean, wvReady, hk, tk, WV } = H, P = () => g.player;
  const standUp = () => { const p = P(); if (p.prone) g.stance.setProne(p, false); p.proneT = 0; p.mv = null; p.vaultY = 0; p.dive = 0; g.crouchOverride = false; p.crouch = false; p.stamina = 1; p.moveCool = 0; };
  const extra = g.statics.extra;
  const wall = (x0, z0, x1, z1, h, tag = 'mt-fence') => { const b = { minX: Math.min(x0, x1), minZ: Math.min(z0, z1), maxX: Math.max(x0, x1), maxZ: Math.max(z0, z1), tag, height: h, mark: 0, op: null, holes: null, holeX: false, sill: 0, base: 0, owner: null }; extra.push(b); return b; };
  const unwall = (...bs) => { for (const b of bs) { const i = extra.indexOf(b); if (i >= 0) extra.splice(i, 1); } };
  const face = (ang) => { const p = P(); p.face = ang; g.aimOverride = { x: p.x + Math.sin(ang) * 10, z: p.z + Math.cos(ang) * 10 }; };
  // Open, dry ground near (x, z): no box and no water within 14 m of it, no vehicle within 24 m (the flats have rocks and
  // ruins; a check staged on one drives into it).
  const clear = (x, z) => {
    const S = g.statics, W = g.water;
    const ok = (cx, cz) => { for (let dx = -14; dx <= 14; dx += 2) for (let dz = -14; dz <= 14; dz += 2) if (S.pointBlocked(cx + dx, cz + dz, 1) || (W?.depthAt?.(cx + dx, cz + dz) ?? 0) > 0.02) return false; return !g.vehicles.some((v) => Math.hypot(v.x - cx, v.z - cz) < 24); };
    for (let r = 0; r < 300; r += 12) for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) { const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r; if (ok(cx, cz)) return { x: cx, z: cz }; if (!r) break; }
    return { x, z };
  };
  const stage = async (x, z) => { wvClean([]); wvReady(); standUp(); await C('teleport', { x, z }); await api._step(5); const c = clear(x, z); if (c.x !== x || c.z !== z) { await C('teleport', c); await api._step(5); } standUp(); };

  await check('move-tow: the rows are valid (validateMoves, validateTowing) - every move costs stamina and has a body height above 0 (nobody is invincible), a chain holds more than a rope; the wrecker, the boat trailer, the skiff and the barge are vehicle rows; the rope and the chain are items', async () => {
    const bad = [...validateMoves().bad, ...validateTowing().bad];
    for (const k of Object.keys(TOW_VEHICLES)) if (!VEHICLES[k]) bad.push(`no vehicle row ${k}`);
    for (const k of ['tow_rope', 'tow_chain']) if (!ITEMS[k]) bad.push(`no item ${k}`);
    return bad.length ? bad.join('; ') : true;
  });

  await check('move-tow: SPACE dives you forward onto your belly (prone at the end, ~4 m on), and a low body is honestly harder to hit: from a shooter 20 m off, every round that lines up meets a standing man, about 3 in 10 meet you prone, mid-dive some still do (never invincible), and at 2 m prone is easy again', async () => hush(async () => {
    await stage(WV.x, WV.z);
    const p = P(), x0 = p.x, z0 = p.z;
    face(0);
    g.input.down.add('KeyW'); await api._step(4);
    await tk('Space');
    let mid = null;
    for (let f = 0; f < 90 && (p.mv || p.dive > 0); f++) { if (f === 12) mid = { mv: p.mv?.kind, h: g.moves.bodyH(p) }; await api._step(1); }
    g.input.down.delete('KeyW');
    await api._step(3);
    const moved = Math.hypot(p.x - x0, p.z - z0), prone = !!p.prone;
    // the line of fire: a shooter 20 m east of you, rounds straight at your centre
    const sh = { id: 'mt-shooter', x: p.x + 20, z: p.z, alive: true, gy: 0, storey: null, ug: null, faction: 'raider' };
    const share = (dist) => { let hit = 0; const N = 400; const S = g.combat; for (let i = 0; i < N; i++) { const ox = p.x + dist, oz = p.z; S.segment(sh, sh, ox, oz, -1, 0, dist + 2, 0.0001, 0.0001, null, 0, false); const o = S.seg; if (o.kind === 'char' && Math.hypot(o.x - p.x, o.z - p.z) < 1.2) hit++; } return hit / N; };
    const proneFar = share(20), proneNear = share(2);
    const hp = p.hp;
    g.stance.setProne(p, false); p.proneT = 0;
    const standFar = share(20);
    p.mv = { kind: 'dive', t: 0.2, dur: MOVES.dive.dur, dx: 0, dz: -1 }; const diveFar = share(20); p.mv = null; // mid-dive, as the round sees it
    p.hp = hp; standUp();
    const ok = prone && moved > 3 && moved < 6 && mid?.mv === 'dive' && standFar > 0.97 && proneFar > 0.18 && proneFar < 0.45 && diveFar > 0.25 && diveFar < 0.7 && proneNear > 0.55;
    return ok ? true : JSON.stringify({ prone, moved: r2(moved), mid, standFar, proneFar, diveFar, proneNear });
  }));

  await check('move-tow: a vault clears a fence that walking can\'t - walking into a 1.05 m fence on held keys stops you; W + SPACE vaults it (over in under a second, a noise, on your feet the far side); a 1.5 m wall is a slower climb; a 2.4 m wall can\'t be vaulted (SPACE there is a dive into it)', async () => hush(async () => {
    await stage(WV.x, WV.z + 30);
    const p = P(), fz = p.z - 2.2;
    const f1 = wall(p.x - 4, fz - 0.06, p.x + 4, fz + 0.06, 1.05);
    try {
      face(Math.PI); // facing -z (up the screen: W)
      await hk('KeyW', 1.6);
      const walked = p.z > fz;
      const seq = g.eventSeq;
      g.input.down.add('KeyW'); await api._step(2); await tk('Space');
      let t = 0; for (let f = 0; f < 120 && (p.mv || f < 3); f++) { await api._step(1); if (p.mv) t += 1 / 60; }
      g.input.down.delete('KeyW');
      const over = p.z < fz - 0.3, vaultT = r2(t), heard = g.events.some((e) => e.seq > seq && e.type === 'moveStart' && e.kind === 'vault');
      unwall(f1);
      // a chest-high wall: a climb (slower); then a 2.4 m wall: nothing to go over
      await stage(WV.x + 12, WV.z + 30);
      const w2 = wall(p.x - 4, p.z - 2.2 - 0.15, p.x + 4, p.z - 2.2 + 0.15, 1.5);
      face(Math.PI); await hk('KeyW', 0.8);
      const pr = g.moves.probe(p, 0, -1), climbKind = pr.kind;
      g.input.down.add('KeyW'); await api._step(2); await tk('Space');
      let t2 = 0; for (let f = 0; f < 150 && (p.mv || f < 3); f++) { await api._step(1); if (p.mv) t2 += 1 / 60; }
      g.input.down.delete('KeyW');
      const climbed = p.z < w2.minZ - 0.3;
      unwall(w2); standUp();
      await stage(WV.x + 24, WV.z + 30);
      const w3 = wall(p.x - 4, p.z - 2.2 - 0.15, p.x + 4, p.z - 2.2 + 0.15, 2.4);
      face(Math.PI); await hk('KeyW', 0.8);
      const high = g.moves.probe(p, 0, -1).kind;
      unwall(w3);
      const ok = walked && over && vaultT > 0.3 && vaultT < 0.9 && heard && climbKind === 'climb' && climbed && t2 > vaultT && high === null;
      return ok ? true : JSON.stringify({ walked, over, vaultT, heard, climbKind, climbed, climbT: r2(t2), high, z: r2(p.z), fz: r2(fz) });
    } finally { unwall(f1); standUp(); g.aimOverride = null; }
  }));

  await check('move-tow: vault over a parked car\'s hood - W + SPACE at the side of a sedan\'s nose takes you over it to the far side on your feet; across its cabin (a roof, too high) there is nothing to vault', async () => hush(async () => {
    await stage(WV.x + 40, WV.z + 30);
    const p = P(), car = g.vehiclesSys.spawn('sedan', p.x + 2.0, p.z - 1.55, 0, '#5a4a3a'); // nose toward +z; its hood beside you to the east
    try {
      await api._step(5);
      face(Math.PI / 2); // east
      const pr = g.moves.probe(p, 1, 0), kind = pr.kind, what = pr.what;
      g.input.down.add('KeyD'); await api._step(1); await tk('Space');
      for (let f = 0; f < 90 && (p.mv || f < 3); f++) await api._step(1);
      g.input.down.delete('KeyD');
      const far = p.x > car.x + car.wid / 2;
      p.x = car.x - 1.5; p.z = car.z; await api._step(2); // beside the cabin
      const cabin = g.moves.probe(p, 1, 0).kind;
      return kind === 'vault' && /sedan/.test(what) && far && cabin === null ? true : JSON.stringify({ kind, what, far, x: r2(p.x), carX: r2(car.x), cabin });
    } finally { wvClean([car]); standUp(); g.aimOverride = null; }
  }));

  await check('move-tow: crouched, SPACE is a combat roll (low, ~2.5 m, up crouched); at a sprint CTRL is a slide that carries you ~4 m on low; on the RV\'s roof at its edge SPACE is a drop-hang - down on the ground beside it, unhurt and on your feet', async () => hush(async () => {
    await stage(WV.x + 60, WV.z + 30);
    const p = P(); face(0);
    let x0 = p.x, z0 = p.z;
    g.crouchOverride = true; await api._step(3);
    g.input.down.add('KeyD'); await api._step(2); await tk('Space');
    const rolled = p.mv?.kind;
    for (let f = 0; f < 60 && p.mv; f++) await api._step(1);
    g.input.down.delete('KeyD'); const roll = r2(Math.hypot(p.x - x0, p.z - z0)); g.crouchOverride = false; standUp(); await api._step(30);
    x0 = p.x; z0 = p.z;
    g.input.down.add('KeyW'); g.input.down.add('ShiftLeft'); await api._step(50);
    const sp = p.speed; g.input.down.add('ControlLeft'); g.input.pressed.add('ControlLeft'); await api._step(1);
    const slid = p.mv?.kind; const s0x = p.x, s0z = p.z;
    for (let f = 0; f < 60 && p.mv; f++) await api._step(1);
    for (const k of ['KeyW', 'ShiftLeft', 'ControlLeft']) g.input.down.delete(k);
    const slide = r2(Math.hypot(p.x - s0x, p.z - s0z)); standUp();
    // the RV roof: climb its ladder (E at the foot), walk to the edge, SPACE
    const rv = g.vehiclesSys.spawn('rv', p.x + 8, p.z, 0, '#7a6a52');
    let hang = null;
    try {
      await api._step(5);
      await C('deck', { id: rv.id, mount: 'player', force: true, deck: 'roof' }).catch(() => null);
      if (P().onDeck?.D !== rv.roofDeck) { g.decks.mount(p, rv, 0, 0, 'climbed', rv.roofDeck); await api._step(2); }
      const D = rv.roofDeck;
      face(Math.PI / 2); await hk('KeyA', 1.2); // across the roof to a side edge on held keys (A, and D the other way if A met none)
      if (!g.moves.edgeOfRoof(p)) await hk('KeyD', 1.6);
      const hp = p.hp, onRoof = p.onDeck?.D === D, y0 = p.gy, edge = g.moves.edgeOfRoof(p);
      await tk('Space');
      const k0 = p.mv?.kind;
      for (let f = 0; f < 120 && p.mv; f++) await api._step(1);
      hang = { onRoof, edge, y0: r2(y0), k0, ground: !p.onDeck && (p.gy ?? 0) < 0.4, hurt: r2(hp - p.hp), knock: p.knockT > 0, out: r2(Math.abs(p.x - rv.x)) };
    } finally { wvClean([rv]); standUp(); g.aimOverride = null; }
    const ok = rolled === 'roll' && roll > 1.6 && slid === 'slide' && sp > 5.5 && slide > 2.5 && hang?.onRoof && hang.k0 === 'hang' && hang.ground && hang.hurt === 0 && !hang.knock && hang.out > rv.wid / 2;
    return ok ? true : JSON.stringify({ rolled, roll, slid, sp: r2(sp), slide, hang });
  }));

  await check('move-tow: a car tows a dead car - G at a pickup\'s wheel hitches the burned-out sedan behind with the rope from your pack (the rope leaves your pack); held W tows it 20 m+, slower than the pickup runs alone; the rope goes taut under load and stays under its break load', async () => hush(async () => {
    await stage(WV.x, WV.z - 40);
    const p = P(), T = g.towing;
    const truck = g.vehiclesSys.spawn('pickup', p.x + 4, p.z, Math.PI, '#6a5434');
    try {
      await api._step(5);
      g.enterVehicle(truck); await api._step(3);
      // alone first: 4 s of throttle from rest
      const sx = truck.x, sz = truck.z;
      await hk('KeyW', 4);
      const solo = Math.hypot(truck.x - sx, truck.z - sz);
      await hk('KeyS', 2.5, () => g.vehiclesSys.speed(truck) < 0.3);
      g.exitVehicle(true); await api._step(2);
      truck.x = p.x + 4; truck.z = p.z; truck.h = Math.PI; truck.vx = truck.vz = 0; truck.av = 0;
      const dead = g.vehiclesSys.spawn('sedan', truck.x, truck.z + 7.4, Math.PI, '#4a4036'); dead.dead = true; dead.hp = 0; dead.mesh.material = g.vehiclesSys.wreckMat;
      g.inventory.setCount('tow_rope', 1); g.inventory.setCount('tow_chain', 0);
      await api._step(3);
      g.enterVehicle(truck); await api._step(3);
      await tk('KeyG'); await api._step(2);
      const L = T.links.find((l) => l.a === truck && l.b === dead), kind = L?.kind, ropeLeft = g.inventory.carried.count('tow_rope');
      const dx0 = dead.x, dz0 = dead.z;
      let taut = 0, peak = 0;
      const tx = truck.x, tz = truck.z;
      for (let f = 0; f < 240; f++) { g.input.down.add('KeyW'); await api._step(1); if (L && T.span(L) >= L.len) taut++; peak = Math.max(peak, L?.loadS ?? 0); }
      g.input.down.delete('KeyW');
      const towedRun = Math.hypot(truck.x - tx, truck.z - tz), dragged = Math.hypot(dead.x - dx0, dead.z - dz0), still = T.links.includes(L);
      await hk('KeyS', 2.5, () => g.vehiclesSys.speed(truck) < 0.3);
      const atStop = T.links.includes(L), seqG = g.eventSeq;
      await tk('KeyG'); await api._step(2);
      const relEv = g.events.filter((e) => e.seq > seqG).map((e) => e.type).join(',');
      const back = g.inventory.carried.count('tow_rope') + g.inventory.trunk(truck).count('tow_rope'); // back in your pack (or the trunk, when the pack is full)
      g.exitVehicle(true);
      wvClean([dead]);
      const ok = kind === 'rope' && ropeLeft === 0 && still && dragged > 20 && towedRun < solo * 0.92 && taut > 60 && peak < LINES.rope.breakLoad && back === 1;
      return ok ? true : JSON.stringify({ kind, ropeLeft, still, solo: r2(solo), towedRun: r2(towedRun), dragged: r2(dragged), taut, peak: r2(peak), back, atStop, relEv });
    } finally { for (const l of [...T.links]) if (l.a === truck) T.release(l, 'gone'); wvClean([truck]); }
  }));

  await check('move-tow: the rope parts above its load - snatched taut on a heavy armored carrier, the rope\'s smoothed tension passes its break load and it snaps (gone from the world, the line\'s gone); the same pull on a chain holds and drags the carrier', async () => hush(async () => {
    await stage(WV.x + 30, WV.z - 40);
    const p = P(), T = g.towing;
    const truck = g.vehiclesSys.spawn('pickup', p.x + 4, p.z, Math.PI, '#6a5434');
    const apc = g.vehiclesSys.spawn('apc', truck.x, truck.z + 7.0, Math.PI, '#4a5038'); apc.dead = true; apc.hp = 0;
    const out = {};
    try {
      await api._step(5);
      for (const kind of ['rope', 'chain']) {
        truck.x = p.x + 4; truck.z = p.z; truck.h = Math.PI; truck.vx = truck.vz = truck.av = 0;
        apc.x = truck.x; apc.z = truck.z + 7.0; apc.h = Math.PI; apc.vx = apc.vz = apc.av = 0;
        g.inventory.setCount('tow_rope', kind === 'rope' ? 1 : 0); g.inventory.setCount('tow_chain', kind === 'chain' ? 1 : 0);
        await api._step(2);
        g.enterVehicle(truck); await api._step(3);
        await tk('KeyG'); await api._step(2);
        const L = T.links.find((l) => l.a === truck && l.b === apc), seq = g.eventSeq;
        const a0 = { x: apc.x, z: apc.z };
        for (let f = 0; f < 200 && T.links.includes(L); f++) { g.input.down.add('KeyW'); await api._step(1); }
        g.input.down.delete('KeyW');
        const snapped = g.events.find((e) => e.seq > seq && e.type === 'towSnapped');
        out[kind] = { hooked: L?.kind, snapped: !!snapped, peak: r2(L?.peak ?? 0), moved: r2(Math.hypot(apc.x - a0.x, apc.z - a0.z)), left: g.inventory.carried.count(`tow_${kind}`) };
        if (T.links.includes(L)) T.release(L, 'gone');
        await hk('KeyS', 2.5, () => g.vehiclesSys.speed(truck) < 0.3);
        g.exitVehicle(true); await api._step(2);
      }
      const ok = out.rope.hooked === 'rope' && out.rope.snapped && out.rope.peak > LINES.rope.breakLoad && out.rope.left === 0 && out.chain.hooked === 'chain' && !out.chain.snapped && out.chain.moved > 6;
      return ok ? true : JSON.stringify(out);
    } finally { for (const l of [...T.links]) if (l.a === truck) T.release(l, 'gone'); wvClean([truck, apc]); }
  }));

  await check('move-tow: the winch pulls a stuck car out of the mud - a sedan driven into a mud pit on held keys spins and BOGS (held throttle no longer gets it out); from the wrecker\'s wheel 12 m off, holding G runs the cable to it and reels it in until it is free', async () => hush(async () => {
    await stage(WV.x + 60, WV.z - 40);
    const p = P(), T = g.towing;
    const pit = T.addPit(p.x + 4, p.z - 10, 4.5, 'mt-pit');
    const car = g.vehiclesSys.spawn('sedan', p.x + 4, p.z - 2, Math.PI, '#5a4a3a'); // nose up the screen, toward the pit
    const wk = g.vehiclesSys.spawn('towtruck', p.x + 4, p.z + 11, Math.PI, '#8a6a1c');
    try {
      await api._step(5);
      g.enterVehicle(car); await api._step(3);
      await hk('KeyW', 6, () => car.bog > MUD.stuckAt);
      const bogged = car.bog > MUD.stuckAt;
      const cx = car.x, cz = car.z;
      await hk('KeyW', 3);
      const spun = r2(Math.hypot(car.x - cx, car.z - cz)), stillStuck = car.bog > MUD.stuckAt;
      g.exitVehicle(true); await api._step(3);
      car.driver = null;
      g.enterVehicle(wk); await api._step(3);
      const seq = g.eventSeq, c0 = { x: car.x, z: car.z };
      await hk('KeyG', 20, () => !(car.bog > MUD.freeAt));
      await hk('KeyG', 1.5);
      const freed = !(car.bog > MUD.freeAt), pulled = r2(Math.hypot(car.x - c0.x, car.z - c0.z));
      const cable = g.events.find((e) => e.seq > seq && e.type === 'towHitched')?.kind;
      const unb = g.events.some((e) => e.seq > seq && e.type === 'unbogged');
      g.exitVehicle(true);
      const ok = bogged && stillStuck && spun < 2 && cable === 'cable' && freed && unb && pulled > 2;
      return ok ? true : JSON.stringify({ bogged, stillStuck, spun, cable, freed, unb, pulled, bog: r2(car.bog ?? 0) });
    } finally { for (const l of [...T.links]) if (l.a === wk || l.b === car) T.release(l, 'gone'); T.removePit('mt-pit'); wvClean([car, wk]); }
  }));

  await check('move-tow: a boat launches from its trailer at a ramp - backing the rig (pickup, trailer, skiff on the bunks) into the lake on held S, G at the water\'s edge floats the skiff off (afloat, off the bunks); G does nothing of the kind on dry land; G again hauls it back up onto the trailer', async () => hush(async () => {
    wvClean([]); wvReady(); standUp();
    const T = g.towing, W = g.water;
    // a straight run of shore: walk out from the lake's centre to where it is dry, then 9 m more
    const ang = -Math.PI * 0.75, ux = Math.sin(ang), uz = Math.cos(ang);
    let r = LAKE.r * 0.5; while (r < LAKE.r + 40 && W.depthAt(LAKE.x + ux * r, LAKE.z + uz * r) > 0.05) r += 0.5;
    const sx = LAKE.x + ux * (r + 11), sz = LAKE.z + uz * (r + 11);
    await C('teleport', { x: sx + uz * 4, z: sz - ux * 4 }); await api._step(5);
    const h = Math.atan2(ux, uz); // facing away from the water: reversing goes in
    const truck = g.vehiclesSys.spawn('pickup', sx, sz, h, '#6a5434'), tr = g.vehiclesSys.spawn('boattrailer', sx - ux * 5.6, sz - uz * 5.6, h, '#4c4f4a'), sk = g.vehiclesSys.spawn('skiff', tr.x, tr.z, h, '#3f6a6a');
    try {
      T.hitch(truck, tr, 'hitch', { free: true }); T.load(tr, sk);
      await api._step(5);
      g.enterVehicle(truck); await api._step(3);
      const dryRamp = T.atRamp(tr);
      await tk('KeyG'); await api._step(2);
      const dryKept = tr.boat === sk && sk.onTrailer === tr; // on land a tap of G drops the hitch, never the boat
      if (!T.links.some((l) => l.b === tr)) T.hitch(truck, tr, 'hitch', { free: true });
      await hk('KeyS', 12, () => T.atRamp(tr)); await hk('KeyS', 0.25); // just past the line, as a driver would
      await hk('KeyW', 2, () => g.vehiclesSys.speed(truck) < 0.25); await api._step(20); // on the brakes at the water's edge
      const ramp = T.atRamp(tr);
      await tk('KeyG'); await api._step(90);
      const afloat = !sk.onTrailer && tr.boat === null && W.depthAt(sk.x, sk.z) > 0.12 && (sk.depth ?? 0) > 0.12;
      // haul: the skiff nosed back to the trailer's tail
      const fx = Math.sin(tr.h), fz = Math.cos(tr.h);
      sk.vx = sk.vz = 0; sk.h = tr.h; sk.x = tr.x - fx * (tr.len / 2 + sk.len / 2 - 0.4); sk.z = tr.z - fz * (tr.len / 2 + sk.len / 2 - 0.4);
      await api._step(3);
      await tk('KeyG');
      for (let f = 0; f < 600 && sk.hauling; f++) await api._step(1);
      const back = tr.boat === sk && sk.onTrailer === tr;
      g.exitVehicle(true);
      const ok = !dryRamp && dryKept && ramp && afloat && back;
      return ok ? true : JSON.stringify({ dryRamp, dryKept, ramp, afloat, skDepth: r2(sk.depth ?? 0), back, hauling: !!sk.hauling, trailerAt: [r2(tr.x - LAKE.x), r2(tr.z - LAKE.z)] });
    } finally { for (const l of [...T.links]) if (l.a === truck) T.release(l, 'gone'); if (tr.boat) { tr.boat.onTrailer = null; tr.boat = null; } wvClean([truck, tr, sk]); }
  }));

  await check('move-tow: the rebuilt boats draw under the budget - the airboat, waterbike, gunboat, fishing skiff and pontoon barge, the boat trailer and the wrecker are each ONE merged mesh with real hull geometry (lofted: hundreds of vertices, a part id on every one), no heavier than the cars (under 12000 vertices each, the RV at 11820 the biggest car); all of them parked beside a sedan keep the frame under 150 draw calls', async () => hush(async () => {
    wvClean([]); wvReady(); standUp();
    await C('teleport', { x: LAKE.x, z: LAKE.z - LAKE.r * 0.4 }); await api._step(5);
    const list = [], bad = [];
    try {
      const types = [...BOATS, 'boattrailer', 'towtruck', 'sedan'];
      types.forEach((t, i) => list.push(g.vehiclesSys.spawn(t, LAKE.x - 18 + (i % 4) * 9, LAKE.z - LAKE.r * 0.4 + Math.floor(i / 4) * 10, 0, '#4f6a5a')));
      await api._step(10);
      for (const v of list) {
        const geo = v.mesh.geometry, n = geo.attributes.position.count;
        if (!geo.attributes.part) bad.push(`${v.type}: no part ids`);
        if (n > 12000) bad.push(`${v.type}: ${n} vertices`);
        if (BOATS.includes(v.type) && n < 600) bad.push(`${v.type}: only ${n} vertices`);
        if (v.group.children.length !== 1) bad.push(`${v.type}: ${v.group.children.length} meshes`);
      }
      g.render(0); const pf = await C('perf');
      if (pf.drawCalls >= 150) bad.push(`drawCalls ${pf.drawCalls}`);
      return bad.length ? bad.join('; ') : true;
    } finally { wvClean(list); }
  }));
}
