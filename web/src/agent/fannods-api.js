// THE FOUND THINGS for agents (docs/design/WEB_FAN_NODS.md; rows data/fannods.js, run systems/fannods.js): the `fannods`
// command (the rows and their check, the live state, and a verb to stand by each thing) and the lane's named checks, one a
// thing: it exists, it is rare, it is where it should be, and it works. Staging positions is the only shortcut; the player
// acts through the same functions the keys call.
import * as THREE from 'three';
import { GLASS_ROOMS, GLASS_CHAMBER, BADGE, HEATER, SICK_SKY, CONVOY, CONVOY_ROOF, DITCH_BONES, CALENDAR, FN_CASE_RARE, hexPanels, hueOf, validateFanNods } from '../data/fannods.js';
import { MILBASES } from '../data/milbases.js';
import { ROOMS as UG_ROOMS, PROPS as UG_PROPS, KINDS as UG_KINDS } from '../data/underground.js';
import { ROOMS as FLOOR_ROOMS } from '../data/floorplans.js';
import { FURNITURE } from '../data/ring.js';
import { ITEMS, LOOT } from '../data/items.js';
import { MELEE_WEAPONS } from '../data/melee.js';
import { WEAPONS } from '../systems/combat.js';
import { WEATHER } from '../systems/sky.js';
import { HOT_GROUND } from '../data/hotground.js';
import { genLevel } from '../world/undergen.js';
import { outfit } from '../systems/characters.js';
import { freeSpot } from './citygen-api.js';

const r1 = (v) => Math.round(v * 10) / 10;
const _v = new THREE.Vector3(), _c = new THREE.Color();
const rowsCheck = () => validateFanNods({ milbases: MILBASES, rooms: UG_ROOMS, props: UG_PROPS, items: ITEMS, loot: LOOT, melee: MELEE_WEAPONS, weapons: WEAPONS, weather: WEATHER, furniture: FURNITURE, floorRooms: FLOOR_ROOMS });

// The ring's planned buildings that have a gun shop or a study, and those with the glass case in them (the real furnishing:
// world/ring.js geo). -> { shops, studies, cases: [{ lot, room, x, z }] }
function ringCases(g, maxLots = 4000) {
  const RG = g.streamer?.W?.ring;
  const out = { shops: 0, studies: 0, sales: 0, cases: [], lots: 0 };
  if (!RG) return out;
  const n = Math.ceil(RG.reach / 256) + 1;
  for (let cx = -n; cx <= n; cx++) for (let cz = -n; cz <= n; cz++) for (const L of RG.owned(cx, cz)) {
    if (out.lots >= maxLots) return out;
    const geo = RG.geo(L);
    if (!geo.plan) continue;
    out.lots++;
    for (const r of geo.rooms ?? []) { if (r.type === 'gunshop') out.shops++; else if (r.type === 'study') out.studies++; else if (r.type === 'sales') out.sales++; }
    for (const b of geo.boxesIn ?? []) if (b.table === 'fn_case') { const r = geo.rooms.find((q) => b.x >= q.x0 - 0.5 && b.x <= q.x1 + 0.5 && b.z >= q.z0 - 0.5 && b.z <= q.z1 + 0.5); out.cases.push({ lot: L.id, room: r?.type ?? null, x: r1(b.x), z: r1(b.z), id: b.id }); }
  }
  return out;
}

export function fannodsCommands(api, need) {
  const g = api.g, P = () => g.player;
  return {
    fannods: {
      group: 'world',
      desc: 'THE FOUND THINGS (docs/design/WEB_FAN_NODS.md; rows data/fannods.js): eight rare physical things. A six-sided tinted-glass chamber deep in a few sealed bases (it hums, it does nothing); a collector\'s glass case with a long cap-and-ball revolver (a shot barrel under the main one) and a silver-topped cane with a blade inside; a broad jungle blade by bones in an interstate ditch; a lapel counter that ticks near hot ground; an armoured trade convoy that pulls over and trades from real stock; a burning orange-green rain; calendars left on January in sealed offices below ground; a self-heating meal. action=status: the live state; rows: the rows and their check; glass: the glass rooms and where they are; cases: the ring\'s glass cases; ditch id=: stand by a ditch\'s bones; convoy: start the convoy just ahead of you (out on the interstate); storm on=: the burning rain now (off: clear); give item=: one of the found things into your pack.',
      args: { action: { type: 'string', default: 'status', enum: ['status', 'rows', 'glass', 'cases', 'ditch', 'convoy', 'storm', 'give'] }, id: { type: 'string' }, on: { type: 'boolean', default: true }, item: { type: 'string' } },
      run: async ({ action, id, on, item }) => {
        const F = g.fannods;
        if (action === 'rows') return { problems: rowsCheck(), glass: GLASS_ROOMS, ditch: DITCH_BONES, convoy: { every: CONVOY.every, chance: CONVOY.chance, rigs: CONVOY.rigs.length }, sky: SICK_SKY, caseRare: FN_CASE_RARE, calendar: CALENDAR.rooms };
        if (action === 'glass') return { rooms: GLASS_ROOMS.map((G) => { const M = MILBASES.find((r) => r.id === G.base), s = g.under?.sites.find((q) => q.base === G.base); return { ...G, name: M?.name, state: M?.state, status: M?.status, site: s?.id ?? null, x: s?.x ?? M?.xz?.[0] ?? null, z: s?.z ?? M?.xz?.[1] ?? null, levels: s?.levels ?? null }; }) };
        if (action === 'cases') return ringCases(g);
        if (action === 'ditch') {
          const W = g.semis?.W, row = DITCH_BONES.find((r) => r.id === (id ?? DITCH_BONES[0].id));
          need(row, `no ditch "${id}" (${DITCH_BONES.map((r) => r.id).join(', ')})`);
          need(W, 'no interstate streamed');
          const q = F.ditchSpot(row, W), fx = Math.sin(q.h), fz = Math.cos(q.h);
          if (P().inVehicle) g.exitVehicle(true);
          await api.call('teleport', { x: q.x - fz * 2.4, z: q.z + fx * 2.4 });
          await api._step(40);
          return { id: row.id, x: r1(q.x), z: r1(q.z), live: F.ditch.has(row.id), box: g.inventory.boxes.get(`fn:${row.id}`)?.id ?? null };
        }
        if (action === 'convoy') { need(!F.convoy, 'a convoy is already out'); need(F.out(), 'out on the interstate only (fannods action=ditch stands you by its road)'); if (g.semis.freight) g.semis.despawnFreight(); const C = F.startConvoy(true); need(C, 'no convoy (out on the interstate? the freight running?)'); return F.status().convoy; }
        if (action === 'storm') { g.sky.setWeather(on ? SICK_SKY.weather : 'CLEAR'); Object.assign(g.sky.cur, WEATHER[on ? SICK_SKY.weather : 'CLEAR']); g.sky.cur.burn = on ? 1 : 0; g.sky.targetTint?.set?.(WEATHER[g.sky.weatherKey].tint); g.sky.curTint?.set?.(WEATHER[g.sky.weatherKey].tint); return { weather: g.sky.weatherKey, label: WEATHER[g.sky.weatherKey].label }; }
        if (action === 'give') { need(ITEMS[item] && ['gun_percussion', 'ammo_capball', 'sword_cane', 'jungle_blade', 'lapel_counter', 'heater_meal', 'hot_meal'].includes(item), 'item= gun_percussion | ammo_capball | sword_cane | jungle_blade | lapel_counter | heater_meal | hot_meal'); g.inventory.add(g.inventory.carried, item, item === 'ammo_capball' ? 18 : 1); g.inventory.changed(); return { item, carried: g.inventory.carried.count(item) }; }
        return F.status();
      },
    },
  };
}

export async function fannodsChecks({ api, g, check, C }) {
  const p = g.player, F = g.fannods, inv = g.inventory, I = g.input;
  const frames = (n) => api._step(n), secs = (s) => api._step(Math.max(1, Math.round(s * 60)));
  const mouseAt = (x0, z0) => { _v.set(x0, 1.2, z0).project(g.camera); I.mouseMove(((_v.x + 1) / 2) * innerWidth, ((1 - _v.y) / 2) * innerHeight); };
  const person = (x, z, hp = 900) => { const c = g.addChar({ x, z, faction: 'drifter', hp, colors: outfit('drifter'), name: 'Test Dummy', flag: 'US' }); if (c) { c.hold = true; c.fnTest = true; } return c; };
  const drop = (c) => { if (c && g.chars.includes(c)) g.removeChar(c); };
  const carry = (id, n = 1) => { inv.add(inv.carried, id, n); inv.changed(); };
  const unCarry = (id) => { const s = inv.carried; for (let i = s.slots.length - 1; i >= 0; i--) if (s.slots[i].id === id) inv.take(s, i, s.slots[i].n); inv.changed(); };
  const stand = async (x, z) => { if (p.inVehicle) g.exitVehicle(true); await C('teleport', { x, z }); p.vx = 0; p.vz = 0; await frames(3); };
  const gm = g.godMode;
  // the melee system's own way in (agent/melee-api.js): the gun holstered, fists up, the thing you carry in your hand; LMB swings
  const fistsUp = async (id) => { g.melee.clear?.(); I.mouseButton(0, false); I.mouseButton(2, false); g.aimOverride = null; g.arms.holster('test'); g.melee.wield(id); await frames(3); };
  const fistsDown = async () => { g.melee.clear?.(); I.mouseButton(0, false); I.mouseButton(2, false); g.arms.setStance('lowered'); await frames(2); };
  const lmb = async (c, hold) => { mouseAt(c.x, c.z); await frames(1); I.mouseButton(0, true); for (let i = 0; i < Math.max(1, Math.round(hold * 60)); i++) { mouseAt(c.x, c.z); await frames(1); } I.mouseButton(0, false); await frames(1); };

  await check('fan nods: the rows validate - six glass rooms in six sealed bases in six regions, every tint out of the purple band; the old revolver has a shot barrel, the cane a blade, every found thing an item and a table; the burning rain is hue 20-140 and rare; three ditches; the convoy rare with two or three rigs; calendars only in sealed offices, never a year', async () => {
    const bad = rowsCheck();
    return bad.length ? JSON.stringify(bad) : true;
  });

  await check('fan nods: the tinted-glass room - on the bottom level of each of its six sealed bases (and no other base, no other level) a room holding a six-sided chamber of tinted panels with its door side open; gone down into one, its panels stand as colliders, you step through the open side into the scorched middle, and the chamber hums', async () => {
    const out = {};
    for (const G of GLASS_ROOMS) {
      const site = { id: `mb_${G.base}`, kind: 'bunker', entrance: 'hatch', levels: 2, base: G.base, seed: 9001, x: 0, z: 0, dir: 'S' };
      const L2 = genLevel(site, 2), L1 = genLevel(site, 1);
      out[G.base] = !!L2.rooms.find((r) => r.type === 'glassroom') && !!L2.props.find((q) => q.kind === 'glasshex') && !L1.rooms.some((r) => r.type === 'glassroom');
    }
    const others = MILBASES.filter((M) => !GLASS_ROOMS.some((G) => G.base === M.id)).slice(0, 12).filter((M) => genLevel({ id: `mb_${M.id}`, kind: 'bunker', entrance: 'hatch', levels: 2, base: M.id, seed: 9001, x: 0, z: 0, dir: 'S' }, 2).rooms.some((r) => r.type === 'glassroom'));
    const panels = hexPanels(0, 0), doorSides = panels.filter((q) => q.door).length;
    // live: down into one. The glass bases' own sites stand out of the drivable world (or come only with a stamped base),
    // so the check stages one glass base's site row on free desert in Arizona, as the bases' own checks stage a base.
    const U = g.under, at = freeSpot(g, -4000, -9000, 60);
    const site = at ? { id: 'fn_glass_test', name: 'GLASS TEST · BELOW', kind: 'bunker', entrance: 'hatch', dir: 'S', levels: 2, seed: 4242, base: GLASS_ROOMS[0].base, x: at.x, z: at.z, place: true, power: false, fuel: 0 } : null;
    if (site) { U.sites.push(site); U.byId.set(site.id, site); }
    let live = null;
    if (site) {
      await C('underground', { action: 'enter', id: site.id, level: site.levels });
      await frames(20);
      const A = g.under.A, Pl = A?.levels.get(site.levels), hex = Pl?.L.props.find((q) => q.kind === 'glasshex');
      if (hex) {
        const cx = (hex.x0 + hex.x1) / 2, cz = (hex.z0 + hex.z1) / 2, door = panels.find((q) => q.door);
        const glass = Pl.boxes.filter((b) => b.tag === 'ug-glass').length;
        // walk in through the open side (-z): stand outside it, hold W/S toward the middle
        p.x = cx; p.z = cz - GLASS_CHAMBER.r - 1.2; p.vx = 0; p.vz = 0; await frames(4);
        const h0 = F.counts.hums;
        I.keyDown('KeyS'); // the camera's down is +z on screen? try both, keep whichever brings us in
        await secs(0.9); I.keyUp('KeyS'); await frames(2);
        if (Math.hypot(p.x - cx, p.z - cz) > GLASS_CHAMBER.r) { p.x = cx; p.z = cz - GLASS_CHAMBER.r - 1.2; await frames(2); I.keyDown('KeyW'); await secs(0.9); I.keyUp('KeyW'); await frames(2); }
        const inside = Math.hypot(p.x - cx, p.z - cz) < GLASS_CHAMBER.r * 0.8;
        // the far side (+z, opposite the door) is glass: a collider spans its middle
        const zf = cz + GLASS_CHAMBER.r * Math.cos(Math.PI / 6), shut = Pl.boxes.some((b) => b.tag === 'ug-glass' && cx >= b.minX && cx <= b.maxX && zf >= b.minZ - 0.05 && zf <= b.maxZ + 0.05);
        p.x = cx; p.z = cz; await secs(GLASS_CHAMBER.humEvery * 2 + 0.6);
        live = { glass, inside, shut, hums: F.counts.hums - h0, near: !!F.chamberNear(p), door: door && { x: r1(door.x), z: r1(door.z) } };
      }
      await C('teleport', { x: 0, z: 0 }); await frames(10);
      U.deactivate?.(); U.detach?.(site.id); U.sites.splice(U.sites.indexOf(site), 1); U.byId.delete(site.id); U.recs?.delete(site.id);
    }
    const ok = Object.values(out).every(Boolean) && !others.length && doorSides === 1 && live && live.glass >= 10 && live.inside && live.shut && live.hums > 0;
    return ok ? true : JSON.stringify({ out, others: others.map((M) => M.id), doorSides, site: site?.id ?? null, live });
  });

  await check('fan nods: the glass case - a rare piece (a gun shop, a shop\'s sales floor or a study, by a hash of the room): the ring\'s real furnishing puts it on a few of its shop floors (under one in ten of the rooms that may have one) and nowhere else; opened, it holds the long revolver, the cane and the box of ball and caps; the revolver\'s shot barrel throws nine pellets, the cane raps on a tap and, held, its blade comes out and cuts', async () => {
    const R = ringCases(g);
    const where = R.cases.every((c) => FN_CASE_RARE[c.room]), rooms = R.sales, share = rooms ? R.cases.length / rooms : 1;
    const island = [...inv.boxes.values()].filter((b) => b.kind === 'fn_case' && !b.id.startsWith('ring:')).length;
    // the contents (a case's own box, opened as any container)
    const box = inv.place('fn:test:case', 'fn_case', p.x, p.z, 12, 'GLASS CASE');
    inv.open(box);
    const holds = ['gun_percussion', 'sword_cane', 'ammo_capball'].every((id) => box.slots.some((s) => s.id === id));
    inv.opened = null; inv.boxes.delete('fn:test:case');
    // the shot barrel: nine pellets a pull
    await C('give', { weapon: 'percussion' }); await C('equip', { weapon: 'percussion' });
    g.inv.ammo.capball = (g.inv.ammo.capball ?? 0) + 18;
    g.arms.setMode('percussion', 'shot');
    const row = g.arms.row('percussion'), nine = row.pellets === 9 && row.cal === 'capshot';
    g.arms.setMode('percussion', 'ball');
    const ball = g.arms.row('percussion').pellets === 1 && g.arms.row('percussion').cal === 'ball44';
    // the cane: tap raps, held draws the blade (the real button)
    carry('sword_cane');
    const dummy = person(p.x, p.z + 1.05);
    let tap = null, held = null;
    try {
      for (let i = 0; i < 8; i++) { mouseAt(dummy.x, dummy.z); await frames(1); }
      await fistsUp('cane');
      p.stamina = 1; await lmb(dummy, 0.03); await secs(0.6);
      tap = g.melee.last?.weapon ?? null;
      p.stamina = 1; dummy.knockT = 0; const hp0 = dummy.hp;
      await lmb(dummy, 0.45); await secs(0.8);
      held = { kind: g.melee.last?.weapon ?? null, heavy: !!g.melee.last?.heavy, cut: hp0 - dummy.hp, bleed: (dummy.bleed ?? 0) > 0 };
    } finally { await fistsDown(); unCarry('sword_cane'); drop(dummy); }
    const ok = R.cases.length >= 1 && where && share < 0.1 && island === 0 && holds && nine && ball && tap === 'cane' && held?.kind === 'caneblade' && held.heavy && held.cut > 0 && held.bleed;
    return ok ? true : JSON.stringify({ cases: R.cases, sales: R.sales, island, lots: R.lots, share: +share.toFixed(3), where, holds, nine, ball, tap, held });
  });

  await check('fan nods: the jungle blade - bones face-down in three of the interstate\'s ditches (no more), past the shoulder; standing there they are drawn and their box holds the broad blade; carried, a tap is its heavy chop, harder than a fist', async () => {
    const r = await C('fannods', { action: 'ditch', id: DITCH_BONES[0].id });
    await frames(30);
    const live = F.ditch.get(DITCH_BONES[0].id), W = g.semis.W;
    let past = false;
    if (live && W) { const pr = W.project(live.x, live.z, 400), sec = W.section(pr.s); past = pr.d > sec.out; }
    const box = inv.boxes.get(`fn:${DITCH_BONES[0].id}`), drawn = F.n;
    if (box) inv.open(box);
    const blade = !!box?.slots.some((s) => s.id === 'jungle_blade');
    inv.opened = null;
    carry('jungle_blade');
    const dummy = person(p.x, p.z + 1.05);
    let hit = null;
    try {
      for (let i = 0; i < 8; i++) { mouseAt(dummy.x, dummy.z); await frames(1); }
      await fistsUp('jungleblade');
      p.stamina = 1; const hp0 = dummy.hp;
      await lmb(dummy, 0.03); await secs(0.8);
      hit = { kind: g.melee.last?.weapon ?? null, cut: hp0 - dummy.hp };
    } finally { await fistsDown(); unCarry('jungle_blade'); drop(dummy); }
    const ok = DITCH_BONES.length === 3 && live && past && drawn >= 8 && blade && hit?.kind === 'jungleblade' && hit.cut > MELEE_WEAPONS.fists.dmg;
    return ok ? true : JSON.stringify({ r, live: !!live, past, drawn, blade, hit });
  });

  await check('fan nods: the lapel counter - carried, it ticks near hot ground before you are on it: silent out of reach, a slow tick past the edge, fast in the middle; not carried, the badge says nothing', async () => {
    const Z = HOT_GROUND[0];
    await stand(Z.x + Z.r + BADGE.reach + 30, Z.z);
    carry('lapel_counter');
    const sample = async (x) => { p.x = x; p.z = Z.z; p.vx = 0; p.vz = 0; const t0 = F.counts.ticks; await secs(1.5); return { rate: r1(F.badge.rate), ticks: F.counts.ticks - t0 }; };
    const g0 = gm; g.godMode = true;
    let far, edge, mid, none;
    try {
      far = await sample(Z.x + Z.r + BADGE.reach + 30);
      edge = await sample(Z.x + Z.r + BADGE.reach * 0.4);
      mid = await sample(Z.x + 2);
      unCarry('lapel_counter');
      none = await sample(Z.x + 2);
    } finally { unCarry('lapel_counter'); g.godMode = g0; await stand(0, 0); }
    const ok = far.rate === 0 && far.ticks === 0 && edge.rate > 0 && mid.rate > edge.rate * 3 && mid.ticks > edge.ticks && none.ticks === 0;
    return ok ? true : JSON.stringify({ far, edge, mid, none });
  });

  await check('fan nods: the armoured convoy - out on the interstate three plated box rigs roll in with two guards on each trailer\'s roof; near you they pull onto the shoulder and stop, a side lets down into a counter, a trader sells from boxes rolled from the convoy\'s real stock at the trade\'s prices; then they close up and roll on down the same road, guards still up top', async () => {
    const W = g.semis.W;
    if (!W) return 'no interstate';
    const s = W.cl.L * 0.4, q = g.semis.lanePoint(s, 1);
    await stand(q.x, q.z);
    await frames(30);
    F.endConvoy(); if (g.semis.freight) g.semis.despawnFreight();
    const Cv = F.startConvoy(true);
    if (!Cv) return 'no convoy started';
    const guardsUp = () => Cv.guards.filter((c) => c.alive && c.onDeck?.D === CONVOY_ROOF && (c.gy ?? 0) > 3.5).length;
    const up0 = guardsUp();
    let halted = false, open = false;
    for (let i = 0; i < 100 && !open; i++) { await secs(0.5); halted ||= !!Cv.F.halt; open = Cv.phase === 'open'; }
    const T = Cv.mid, sh = T && F.shoulder(T), pr = T && W.project(T.x, T.z, 400), sec = pr && W.section(pr.s);
    const onShoulder = !!(pr && pr.d > sec.lane0 + 2);
    let stock = null;
    if (Cv.trader && Cv.boxes.length) {
      p.x = Cv.trader.x + (sh?.x ?? 0) * 1.6; p.z = Cv.trader.z + (sh?.z ?? 0) * 1.6; await frames(3);
      const items = g.trade.stock?.(Cv.trader) ?? [];
      stock = { boxes: Cv.boxes.length, items: Cv.boxes.reduce((a, b) => a + b.slots.length, 0), real: Cv.boxes.every((b) => b.slots.every((sl) => LOOT.fn_convoy.rows.some((r) => r[0] === sl.id))), list: Array.isArray(items) ? items.length : null };
      g.trade.openCounter(Cv.trader); await frames(2);
      stock.counter = !!inv.opened && Cv.boxes.includes(inv.opened); inv.opened = null;
    }
    const upHalt = guardsUp();
    F.closeSide(Cv);
    let rolling = false;
    for (let i = 0; i < 40 && !rolling; i++) { await secs(0.5); rolling = Cv.phase === 'leaving' && Cv.F.members.some((m) => g.vehiclesSys.speed(m.v) > 3); }
    const upRoll = guardsUp(), slits = F.n;
    F.endConvoy(); g.semis.despawnFreight();
    const ok = Cv.F.members.length === CONVOY.rigs.length && up0 === CONVOY.rigs.length * CONVOY.guards && halted && open && onShoulder && stock?.items > 0 && stock.real && stock.counter && upHalt === up0 && rolling && upRoll === up0 && slits > 0;
    return ok ? true : JSON.stringify({ rigs: Cv.F.members.length, up0, halted, open, onShoulder, stock, upHalt, rolling, upRoll, slits, phase: Cv.phase });
  });

  await check('fan nods: the burning rain - its own weather row, never in the common roll; the sky goes orange-green (hue 20-140) and the rain yellow; bare skin under it burns, a roof or a hard-topped car keeps it off, and the unarmed folk near you make for a door', async () => {
    const g0 = gm; g.godMode = false;
    const hp = () => p.hp;
    await stand(0, 0);
    p.hp = p.maxHp;
    await C('fannods', { action: 'storm', on: true });
    await secs(1);
    const fogHue = hueOf(`#${g.sky.fog.color.getHexString()}`), rainHue = hueOf(`#${g.sky.rain.material.color.getHexString()}`);
    // out in it
    const h0 = hp(); await secs(3); const outside = h0 - hp();
    // in a car (hard-topped)
    const car = g.vehiclesSys.spawn('pickup', p.x + 4, p.z, 0, '#5a5a48');
    let inCar = null;
    if (car) { await C('enterVehicle', { id: car.id, force: true }).catch(() => null); await frames(10); if (p.inVehicle) { p.hp = p.maxHp; const h1 = hp(); await secs(3); inCar = { took: h1 - hp(), shelter: g.survival?.shelterKind?.() }; g.exitVehicle(true); } g.vehiclesSys.remove(car); }
    // folk near you: an unarmed one makes for a door
    const door = (g.interiors?.doors ?? []).reduce((b, d) => (!b || Math.hypot(d.x, d.z) < Math.hypot(b.x, b.z) ? d : b), null); // a street door in town (Rust Haven's)
    if (door) await stand(door.x + 8, door.z + 8);
    const sh0 = F.counts.sheltered, walker = g.addChar({ x: p.x + 2, z: p.z + 2, faction: 'civilian', colors: outfit('civilian'), name: 'Passer-by', flag: 'US' });
    await secs(1.5);
    const ran = F.counts.sheltered > sh0 || (walker?.flee ?? 0) > 0;
    drop(walker);
    await C('fannods', { action: 'storm', on: false });
    await secs(1);
    const after = { burn: +(g.sky.cur.burn ?? 0).toFixed(2) };
    g.godMode = g0; p.hp = p.maxHp;
    const rare = !['SICKSKY'].some((k) => ['CLEAR', 'OVERCAST', 'RAIN', 'STORM', 'DUST', 'FOG', 'ASHFALL'].includes(k)) && SICK_SKY.chance <= 0.06;
    const ok = rare && fogHue >= 20 && fogHue <= 140 && rainHue >= 20 && rainHue <= 140 && outside > 0 && inCar && inCar.took === 0 && ran && after.burn < SICK_SKY.from;
    return ok ? true : JSON.stringify({ rare, fogHue, rainHue, outside, inCar, ran, after });
  });

  await check('fan nods: frozen calendars - across many sealed bunker and facility levels, a paper calendar hangs on a wall of about the row\'s share of offices and command rooms and of no other room type; it is on the room\'s own wall, away from its door; the page reads January and no year', async () => {
    const by = {}; let other = 0, offWall = 0;
    for (let s = 1; s <= 30; s++) for (const kind of ['bunker', 'facility']) {
      const site = { id: `cal_${kind}_${s}`, kind, entrance: kind === 'facility' ? 'lift' : 'hatch', levels: UG_KINDS[kind].levels[1], seed: s * 104729, x: 0, z: 0, dir: 'NESW'[s % 4], project: kind === 'facility' ? 'listening_room' : undefined };
      for (let k = 1; k <= site.levels; k++) {
        const L = genLevel(site, k);
        for (const r of L.rooms) {
          const c = L.calendars.find((q) => q.x >= r.x0 - 0.1 && q.x <= r.x1 + 0.1 && q.z >= r.z0 - 0.1 && q.z <= r.z1 + 0.1);
          if (!CALENDAR.rooms[r.type]) { if (c) other++; continue; }
          const b = (by[r.type] ??= { rooms: 0, cals: 0 }); b.rooms++;
          if (c) { b.cals++; const onWall = Math.min(Math.abs(c.x - r.x0), Math.abs(c.x - r.x1), Math.abs(c.z - r.z0), Math.abs(c.z - r.z1)) < 0.1; if (!onWall) offWall++; }
        }
      }
    }
    const share = Object.entries(by).every(([t, b]) => b.rooms < 8 || Math.abs(b.cals / b.rooms - CALENDAR.rooms[t]) < 0.25);
    const page = CALENDAR.month === 'JANUARY' && !/\d{4}/.test(JSON.stringify(CALENDAR));
    const any = Object.values(by).reduce((a, b) => a + b.cals, 0);
    return any > 0 && !other && !offWall && share && page ? true : JSON.stringify({ by, other, offWall, share, page });
  });

  await check('fan nods: the self-heating meal - pulling its tab spends the pouch and hisses; half a minute later a hot meal is in your pack, and eaten it feeds you and counts as a hot meal', async () => {
    await stand(0, 0);
    carry('heater_meal');
    const i = inv.carried.slots.findIndex((s) => s.id === 'heater_meal');
    const n0 = inv.carried.count('heater_meal'), r = inv.use(i);
    const spent = inv.carried.count('heater_meal') === n0 - 1;
    const early = inv.carried.count('hot_meal');
    await secs(HEATER.wait + 1);
    const hot = inv.carried.count('hot_meal') - early;
    const food0 = g.needs?.food ?? 0; if (g.needs) g.needs.food = Math.min(food0, 0.4);
    const f1 = g.needs?.food ?? 0;
    const e0 = g.eventSeq;
    const j = inv.carried.slots.findIndex((s) => s.id === 'hot_meal');
    const r2 = j >= 0 ? inv.use(j) : null;
    const fed = (g.needs?.food ?? 0) > f1;
    if (g.needs) g.needs.food = food0;
    unCarry('heater_meal'); unCarry('hot_meal');
    const ate = g.events.some((e) => e.seq > e0 && e.type === 'itemUsed' && e.item === 'hot_meal'); // systems/stats.js: a 'meal' eaten lifts the mood
    const ok = r.ok && spent && early === 0 && hot === 1 && r2?.ok && fed && ate;
    return ok ? true : JSON.stringify({ r, spent, early, hot, r2, fed, ate });
  });
}
