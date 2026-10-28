// Selftest checks for DECKS-STANCE (docs/design/WEB_DECKS_STANCE.md §8): boat decks, the trundle's aisle, roofs by the
// ladder, prone (hidden in grass, a body that never sticks through a rail), the footing on a moving deck, and the turret
// seat. runSelfTest calls this right after the walk-vehicle checks, with their helpers. The player acts on held keys and
// the mouse; vehicles, drivers, targets and a patch of grass (concealOverride) are staged.
import { DECKS, DECK_RULES, validateDecks } from '../data/decks.js';
import { STANCES, PRONE, validateStance } from '../data/stance.js';
import { VEHICLES } from '../systems/vehicles.js';
import { LAKE } from '../world/water.js';
import { outfit } from '../systems/characters.js';

const r2 = (v) => Math.round(v * 100) / 100;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export async function decksStanceChecks(api, check, C, H) {
  const g = api.g, { hush, person, wvClean, wvReady, crewed, hk, tk, WV } = H;
  const P = () => g.player;
  const standUp = () => { const p = P(); if (p.prone) g.stance.setProne(p, false); p.proneT = 0; g.crouchOverride = false; p.crouch = false; delete p.concealOverride; p._cnT = undefined; };
  const local = (v, x, z) => { const dx = x - v.x, dz = z - v.z, c = Math.cos(v.h), s = Math.sin(v.h); return { x: dx * c - dz * s, z: dx * s + dz * c }; };
  const world = (v, lx, lz) => { const c = Math.cos(v.h), s = Math.sin(v.h); return { x: v.x + lx * c + lz * s, z: v.z - lx * s + lz * c }; };

  await check('decks-stance: the rows are valid (validateDecks, validateStance) and every walkable rig carries its decks - the airboat and gunboat decks, the trundle aisle, ladder roofs on the van, the RV and the trundle', async () => {
    const bad = [...validateDecks(), ...validateStance()];
    const want = { airboat: ['airboatDeck', undefined], gunboat: ['gunboatDeck', undefined], bus: ['busAisle', 'busRoof'], van: ['vanCargo', 'vanRoof'], rv: ['rvCoach', 'rvRoof'] };
    for (const [t, [d, r]] of Object.entries(want)) if (VEHICLES[t]?.deck !== d || VEHICLES[t]?.roofDeck !== r) bad.push(`${t}: ${VEHICLES[t]?.deck}/${VEHICLES[t]?.roofDeck}`);
    for (const k of ['vanRoof', 'rvRoof', 'busRoof']) if (!DECKS[k]?.ladders?.length) bad.push(`${k}: no ladder`);
    if (STANCES.prone.brace !== 3 || STANCES.crouch.brace !== 1.6) bad.push('D3 braces');
    return bad.length ? bad.join('; ') : true;
  });

  await check('decks-stance: boat deck - crouched on the airboat\'s deck through a full hard turn on the lake at speed, you ride it (never off the floor, perched on the deck above the water, the chop felt, the footing on the HUD prompt)', async () => hush(async () => {
    standUp(); wvClean([]);
    const parked = [];
    for (const b of g.vehicles) if (b.type === 'gunboat' && b.ai) { parked.push([b, b.ai]); b.ai = null; b.throttle = 0; } // the lake's patrol charges anyone afloat
    const moved = []; // idle boats an earlier check left on the lake: off it for the run (one ram at speed throws anyone)
    for (const b of g.vehicles) if (b.boat && !b.occ?.some(Boolean) && Math.hypot(b.x - LAKE.x, b.z - LAKE.z) < LAKE.r + 4) { moved.push([b, b.x, b.z]); b.x = LAKE.x + 300; b.z = LAKE.z + 300; b.vx = b.vz = 0; }
    const { v, d } = crewed('airboat', LAKE.x - 20, LAKE.z, Math.PI / 2);
    try {
      await api._step(10);
      await C('deck', { id: v.id, mount: 'player', force: true });
      g.crouchOverride = true;
      const h0 = v.h, F = v.deck.floor, r = DECK_RULES.radius;
      let off = 0, outside = 0, low = 0, maxSp = 0, turned = 0, chop = 0, footSeen = 0, prev = v.h;
      const seq = g.eventSeq;
      for (let f = 0; f < 60 * 14; f++) {
        const sNow = g.vehiclesSys.speed(v);
        v.throttle = sNow < 14 ? 1 : 0.2; v.steer = f > 90 ? 0.75 : 0; // ~14 m/s (30 mph), then hard over: a tight circle on the lake
        await api._step(1);
        const o = P().onDeck;
        if (o?.v !== v) { off++; break; }
        if (o.lx < F[0] + r - 0.01 || o.lx > F[1] - r + 0.01 || o.lz < F[2] + r - 0.01 || o.lz > F[3] - r + 0.01) outside++;
        if (P().gy < 0.3) low++;
        maxSp = Math.max(maxSp, g.vehiclesSys.speed(v)); chop = Math.max(chop, v._dkChop ?? 0);
        turned += Math.abs(wrap(v.h - prev)); prev = v.h;
        if (g.footingText(P())) footSeen++;
        if (turned > Math.PI * 2) break;
      }
      v.throttle = 0; v.steer = 0;
      const why = g.events.filter((e) => e.seq > seq && /deck|thrown|crash|collide/.test(e.type)).slice(-3);
      return !off && !outside && !low && maxSp > 8 && turned > Math.PI && chop > 0 && footSeen > 0 ? true : JSON.stringify({ off, outside, low, maxSp: r2(maxSp), turned: r2(turned), chop: r2(chop), footSeen, h0: r2(h0), at: [r2(v.x - LAKE.x), r2(v.z - LAKE.z)], why });
    } finally { g.crouchOverride = false; for (const [b, ai] of parked) b.ai = ai; for (const [b, x, z] of moved) { b.x = x; b.z = z; } wvClean([v, d]); }
  }));

  await check('decks-stance: the trundle\'s aisle - walk in its kerb door and down the aisle between the benches to the luggage at the back on held keys (the roof cuts away; never inside a bench, never off the floor)', async () => hush(async () => {
    standUp(); wvClean([]); wvReady();
    const v = g.vehiclesSys.spawn('bus', WV.x, WV.z, Math.PI, '#7a5a32'); // nose up the screen: the kerb door faces screen-right
    try {
      await api._step(5);
      const door = world(v, -2.9, 3.9);
      await C('teleport', { x: door.x, z: door.z }); await api._step(3);
      await hk('KeyA', 3, () => P().onDeck);
      const inside = P().onDeck?.v === v && P().onDeck.D === v.deck, roofCut = !!v.roof && !v.roof.visible;
      await hk('KeyA', 2, () => (P().onDeck?.lx ?? 0) > -0.06);
      let bad = 0;
      const D = v.deck, solid = [...D.fixtures, ...D.containers].filter((f) => f.h >= DECK_RULES.stepH);
      for (let f = 0; f < 60 * 4 && (P().onDeck?.lz ?? 9) > -3.9; f++) {
        g.input.down.add('KeyS'); await api._step(1);
        const o = P().onDeck;
        if (!o) break;
        for (const b of solid) { const cx = Math.max(b.box[0], Math.min(b.box[1], o.lx)), cz = Math.max(b.box[2], Math.min(b.box[3], o.lz)); if (Math.hypot(o.lx - cx, o.lz - cz) < DECK_RULES.radius - 0.02) bad++; }
      }
      g.input.down.delete('KeyS');
      const o = P().onDeck, at = o ? [r2(o.lx), r2(o.lz)] : null;
      return inside && roofCut && o?.v === v && o.lz < -3.5 && !bad && !P().stoop ? true : JSON.stringify({ inside, roofCut, at, bad, stoop: !!P().stoop });
    } finally { wvClean([v]); }
  }));

  await check('decks-stance: a van\'s cargo box is lower than you stand - you stoop inside it (the head never through the roof); the RV coach is tall enough to stand in', async () => hush(async () => {
    standUp(); wvClean([]); wvReady();
    const van = g.vehiclesSys.spawn('van', WV.x, WV.z, 0, '#5a5a48'), rv = g.vehiclesSys.spawn('rv', WV.x + 14, WV.z, 0, '#7a6a52');
    try {
      await api._step(5);
      await C('deck', { id: van.id, mount: 'player', force: true }); await api._step(3);
      const inVan = !!P().stoop && van.deck.ceil < STANCES.stand.body.h;
      await C('deck', { id: rv.id, mount: 'player', force: true }); await api._step(3);
      const inRv = !P().stoop;
      return inVan && inRv ? true : JSON.stringify({ inVan, inRv, ceil: van.deck.ceil });
    } finally { wvClean([van, rv]); }
  }));

  await check('decks-stance: roof climb - E at the foot of the RV\'s ladder climbs onto its roof (up at the roof\'s height, the roof stays on), walk it, E at the top climbs back down; the trundle\'s ladder too', async () => hush(async () => {
    standUp(); wvClean([]); wvReady();
    const rv = g.vehiclesSys.spawn('rv', WV.x, WV.z, Math.PI, '#7a6a52'), bus = g.vehiclesSys.spawn('bus', WV.x + 16, WV.z, Math.PI, '#7a5a32');
    try {
      await api._step(5);
      const out = [];
      for (const v of [rv, bus]) {
        const L = v.roofDeck.ladders[0], foot = world(v, L.at[0], L.at[1]);
        await C('teleport', { x: foot.x, z: foot.z }); await api._step(3);
        await tk('KeyE'); await api._step(2);
        const up = P().onDeck?.v === v && P().onDeck.D === v.roofDeck, y = P().gy, roofOn = !v.roof || v.roof.visible;
        await hk('KeyW', 0.6); // a few steps along the roof
        const walked = P().onDeck?.D === v.roofDeck;
        // back to the ladder's top and down
        const top = world(v, L.top[0], L.top[1]);
        for (let f = 0; f < 120 && Math.hypot(P().x - top.x, P().z - top.z) > 0.5; f++) { g.aimOverride = { x: top.x, z: top.z }; const dx = top.x - P().x, dz = top.z - P().z; const k = []; if (dz < -0.2) k.push('KeyW'); if (dz > 0.2) k.push('KeyS'); if (dx < -0.2) k.push('KeyA'); if (dx > 0.2) k.push('KeyD'); for (const q of k) g.input.down.add(q); await api._step(1); for (const q of k) g.input.down.delete(q); }
        await tk('KeyE'); await api._step(3);
        const down = !P().onDeck && (P().gy ?? 0) < 0.4;
        out.push({ v: v.type, up, y: r2(y), roofOn, walked, down });
      }
      g.aimOverride = null;
      return out.every((o) => o.up && o.y > 2.9 && o.roofOn && o.walked && o.down) ? true : JSON.stringify(out);
    } finally { g.aimOverride = null; wvClean([rv, bus]); }
  }));

  await check('decks-stance: prone hidden at 20 m in grass - a raider 20 m off never picks out a prone body lying in grass; the same body standing there is picked out; prone in the grass at 3 m is still seen (no invisibility)', async () => hush(async () => {
    standUp(); wvClean([]); wvReady();
    await C('setTime', { hour: 12 });
    const p = P(), god = g.godMode;
    const t = person('raider', 0, 20, { hp: 400, weapon: 'pistol' });
    const watch = async (s) => { t.target = null; t.state = 'idle'; for (let f = 0; f < s * 60; f++) { await api._step(1); if (t.target === p) return true; } return false; };
    try {
      g.godMode = true;
      p.concealOverride = 0.8; p._cnT = undefined;
      g.stance.setProne(p, true); await api._step(30);
      const proneSeen = await watch(3);
      const range = g.stance.seenRange(p, 34, 0.6, t.x, t.z, t);
      g.stance.setProne(p, false); await api._step(30);
      const standSeen = await watch(3);
      t.x = p.x; t.z = p.z + 3; t.wx = t.x; t.wz = t.z; t.home = { x: t.x, z: t.z };
      g.stance.setProne(p, true); await api._step(30);
      const closeSeen = await watch(3);
      return !proneSeen && standSeen && closeSeen && range < 20 ? true : JSON.stringify({ proneSeen, standSeen, closeSeen, range: r2(range), conceal: g.stance.conceal(p) });
    } finally { g.godMode = god; standUp(); wvClean([t]); }
  }));

  await check('decks-stance: the prone capsule never penetrates a rail - prone in a pickup\'s bed (any way you lie, the body turns or curls to fit) through a driven turn, head, hips and feet always on the floor and out of the toolbox, never thrown; on the street, crawling round against a wall, no circle ever inside the wall', async () => hush(async () => {
    standUp(); wvClean([]); wvReady();
    const { v, d } = crewed('pickup', WV.x, WV.z, 0);
    let wall = null;
    try {
      await api._step(5);
      await C('deck', { id: v.id, mount: 'player', force: true });
      await C('prone', { on: true, heading: v.h + Math.PI / 2 }); // across the bed: 2.2 m of body, 2.04 m of bed
      let worst = 0, off = 0, sp = 0, turned = 0, prev = v.h;
      for (let f = 0; f < 60 * 8; f++) {
        v.throttle = f < 300 ? 0.8 : 0.2; v.steer = f > 120 ? 0.8 : 0;
        if (f % 90 === 0) g.aimOverride = { x: P().x + Math.sin(f) * 5, z: P().z + Math.cos(f) * 5 }; // aim round: the body crawls toward it
        await api._step(1);
        if (P().onDeck?.v !== v) { off++; break; }
        worst = Math.max(worst, g.decks.proneOverhang(P()));
        sp = Math.max(sp, g.vehiclesSys.speed(v)); turned += Math.abs(wrap(v.h - prev)); prev = v.h;
      }
      v.throttle = 0; v.steer = 0; g.aimOverride = null;
      g.decks.dismount(P(), 'test', true); standUp();
      // the street: prone with its head toward a wall, aiming all the way round
      await C('teleport', { x: WV.x + 20, z: WV.z }); await api._step(3);
      wall = g.statics.add(P().x - 3, P().z + 0.9, P().x + 3, P().z + 1.5, 'wall', 2);
      await C('prone', { on: true, heading: 0 });
      let pen = 0;
      for (let f = 0; f < 60 * 6; f++) {
        const a = (f / 360) * Math.PI * 2;
        g.aimOverride = { x: P().x + Math.sin(a) * 6, z: P().z + Math.cos(a) * 6 };
        g.input.down.add('KeyS'); if (f % 2) g.input.down.add('KeyD'); else g.input.down.delete('KeyD');
        await api._step(1);
        if (g.stance.penetrates(P())) pen++;
      }
      g.input.down.delete('KeyS'); g.input.down.delete('KeyD');
      return !off && worst < 0.01 && sp > 6 && turned > 1 && !pen ? true : JSON.stringify({ off, worst: r2(worst), sp: r2(sp), turned: r2(turned), pen, len: P().proneLen });
    } finally { if (wall) { wall.minX = wall.maxX = wall.minZ = wall.maxZ = 1e6; } g.aimOverride = null; g.input.down.delete('KeyS'); g.input.down.delete('KeyD'); standUp(); wvClean([v, d]); }
  }));

  await check('decks-stance: crouch vs stand throw-out with the stat - one hard turn (staged felt pull) throws a standing ordinary rider out of the bed, not a crouched one (x1.6) or a prone one (never); a quick rider (QUICKNESS 10, +30%) stands a pull that throws an ordinary one (5)', async () => hush(async () => {
    standUp(); wvClean([]); wvReady();
    const v = g.vehiclesSys.spawn('pickup', WV.x, WV.z, 0, '#5a4a32');
    const A = g.deep.attrs, q0 = A.quickness, god = g.godMode;
    const T = DECK_RULES.open, sp = T.throwMinSpeed + 4, ref = { vx: 0, vz: sp, x: v.x, z: v.z, h: v.h };
    const trial = async (stance, q, felt) => {
      await C('deck', { id: v.id, mount: 'player', force: true });
      A.quickness = q; const p = P(); p.knockT = 0; p._dkCool = 0;
      if (stance === 'crouch') { p.crouch = true; } else if (stance === 'prone') { g.stance.setProne(p, true); p.proneT = 0; } else p.crouch = false;
      v._dkAx = felt; v._dkAz = 0;
      const seq = g.eventSeq;
      g.decks.feel(v, p, felt, 0, 0, sp, ref);
      const thrown = g.events.some((e) => e.seq > seq && e.type === 'thrown' && e.id === p.id);
      if (p.onDeck) g.decks.dismount(p, 'test', true);
      standUp(); p.knockT = 0;
      return thrown;
    };
    try {
      g.godMode = true;
      await api._step(3);
      const f1 = T.throwA * 1.3; // over a standing rider's line, under a crouched one's (x1.6)
      const standOrd = await trial('stand', 5, f1), crouchOrd = await trial('crouch', 5, f1), proneOrd = await trial('prone', 5, T.throwA * 4);
      const f2 = T.throwA * 1.15; // between 1.0 and 1.3: the quick rider keeps their feet
      const standQuick = await trial('stand', 10, f2), standOrd2 = await trial('stand', 5, f2);
      const foot = { stand: g.stance.footing({ crouch: false }), crouch: STANCES.crouch.brace, prone: STANCES.prone.brace };
      return standOrd && !crouchOrd && !proneOrd && !standQuick && standOrd2 ? true : JSON.stringify({ standOrd, crouchOrd, proneOrd, standQuick, standOrd2, foot });
    } finally { A.quickness = q0; g.godMode = god; standUp(); wvClean([v]); }
  }));

  await check('decks-stance: the turret seat - you ride as a passenger, hold RMB: you take the roof turret and it fires where YOU aim while your driver steers a turn; a crew passenger works a free turret on their own at a hostile', async () => hush(async () => {
    standUp(); wvClean([]); wvReady();
    const { v, d } = crewed('pickup', WV.x, WV.z, 0);
    let t = null, a = null;
    try {
      const r = g.workshop.install(v, { part: 'mg1', face: 'top', pay: false, time: false });
      if (!r.ok) return `install: ${r.why}`;
      const m = v.mounts.top; m.ammo = 200;
      await api._step(5);
      g.seats.board(P(), v, 1);
      const ammo0 = m.ammo, h0 = v.h;
      const aimAt = world(v, 14, 6);
      let owner = null;
      for (let f = 0; f < 60 * 3; f++) {
        v.throttle = 0.6; v.steer = 0.8;
        g.aimOverride = { x: aimAt.x, z: aimAt.z }; g.input.mouse.physRight = true; g.input.mouse.right = true;
        await api._step(1);
        owner ??= v.turretBy;
      }
      g.input.mouse.physRight = false; g.input.mouse.right = false; g.aimOverride = null; v.throttle = 0; v.steer = 0;
      const fired = ammo0 - m.ammo, turned = Math.abs(wrap(v.h - h0)), driver = v.driver === d;
      const yawOff = Math.abs(wrap((m.yaw ?? 0) - Math.atan2(aimAt.x - v.x, aimAt.z - v.z)));
      // Out again; a crew passenger takes the free turret and fires at a raider.
      g.exitVehicle(true); await api._step(5);
      const free = !v.turretBy;
      a = g.addChar({ x: v.x + 2, z: v.z, faction: 'drifter', weapon: 'pistol', colors: outfit('drifter'), name: 'Gunner (selftest)', flag: 'CA', hp: 300 });
      g.seats.recruit(a); g.seats.board(a, v, 1);
      g.seats.leave(d, true); g.seats.board(P(), v, 0); v.ai = null; // you at the wheel: the crew passenger mans the gun
      t = person('raider', 0, 0, { hp: 2000 }); const tp = world(v, -10, 14); t.x = tp.x; t.z = tp.z; t.home = { x: t.x, z: t.z };
      const ammo1 = m.ammo;
      for (let f = 0; f < 60 * 4 && m.ammo === ammo1; f++) await api._step(1);
      const crew = v.turretBy === a.id && m.ammo < ammo1;
      return owner === P().id && fired > 0 && turned > 0.4 && driver && yawOff < 0.3 && free && crew ? true : JSON.stringify({ owner, fired, turned: r2(turned), driver, yawOff: r2(yawOff), free, crew, by: v.turretBy, ammo: [ammo1, m.ammo], a: { veh: a.inVehicle?.id, seat: a.seat, fol: a.follower, fac: a.faction, tgt: a.target?.id ?? null, alive: a.alive }, hostile: g.ai.hostile(a, t), drv: v.driver?.id });
    } finally { g.input.mouse.physRight = false; g.input.mouse.right = false; g.aimOverride = null; if (P().inVehicle) g.exitVehicle(true); wvClean([v, d, t, a]); }
  }));
}
