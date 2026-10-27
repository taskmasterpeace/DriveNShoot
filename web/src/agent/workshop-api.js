// The agent's side of THE WORKSHOP (systems/workshop.js, systems/garage.js, ui/workshop.js; docs/design/WEB_WORKSHOP.md):
// COMMANDS rows (spread into api.js's table) and the selftest checks (called from api.js runSelfTest after the garage's).
import { VEHICLES } from '../systems/vehicles.js';
import { ITEMS } from '../data/items.js';
import { PLATE_MAX } from '../data/parts.js';
import { FACES6, ARMOR, CHASSIS, PERF, MOUNT_WEAPONS, UTILITY, ARENAS, LOANER, WORKSHOPS, validateWorkshop } from '../data/workshop.js';

const r2 = (v) => Math.round(v * 100) / 100;

export function workshopCommands(api) {
  const g = api.g, P = () => g.player;
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };
  const car = (id) => {
    const v = id ? api.findVeh(id) : g.workshop.carFor() ?? P().inVehicle ?? g.lastVehicle;
    need(v && !v.dead, id ? `no live vehicle ${id}` : 'not in (or near) a vehicle; pass vehicle=');
    return v;
  };
  return {
    workshop: {
      group: 'vehicle', desc: 'THE WORKSHOP (docs/design/WEB_WORKSHOP.md, rows in src/data/workshop.js). action=stats (default: the car\'s six faces, mount points with arcs and groups, utility, weight, spaces, power, the numbers the load leaves it) | rows (every armour, mount, utility, ammo, paint, arena and shop row; validated) | open (the WORKSHOP screen at a garage: Kenji, a town garage, your own; force=true opens a field bench anywhere; returns its tabs and rows) | close | install part=<armour|mount|utility id> face=<front|rear|left|right|top|under|sides|all> n=<points> | remove face= (the gun on it, else its plate; part=plate for the plate) or part=<utility id> | repair face= or part=engine|radiator|tank|lights|tyres|body | reload face= or part=<utility id> (from your pack, the trunk, then bought) | paint part=<paint id>. pay=false skips the till, time=false skips the clock. In the game: U at a garage with your car parked close, or ask Kenji.',
      args: { action: { type: 'string', default: 'stats', enum: ['stats', 'rows', 'open', 'close', 'install', 'remove', 'repair', 'reload', 'paint'] }, part: { type: 'string' }, face: { type: 'string' }, n: { type: 'number', default: 4 },
        vehicle: { type: 'string' }, pay: { type: 'boolean', default: true }, time: { type: 'boolean', default: true }, force: { type: 'boolean', default: false }, tab: { type: 'string' } },
      run: async ({ action, part, face, n, vehicle, pay, time, force, tab }) => {
        const W = g.workshop;
        if (action === 'rows') return W.rows();
        if (action === 'open') {
          const r = g.workshopUI.toggle(true, force); need(r.ok, r.why);
          if (tab) { const i = ['armor', 'weapons', 'utility', 'ammo', 'repair', 'paint'].indexOf(tab); need(i >= 0, 'tab=armor|weapons|utility|ammo|repair|paint'); g.workshopUI.tab = i; g.workshopUI.render(); }
          return { ...g.workshopUI.view(), site: W.site, car: W.car.id };
        }
        if (action === 'close') { g.workshopUI.toggle(false); return { open: false }; }
        const v = car(vehicle);
        if (action === 'stats') return W.report(v);
        if (!W.site && pay) { const o = W.open(force); need(o.ok, `${o.why} (or pay=false, or force=true for a field bench)`); }
        const r = action === 'install' ? W.install(v, { part, face, n, pay, time })
          : action === 'remove' ? W.remove(v, { part, face, pay, time })
          : action === 'repair' ? W.repair(v, { part, face, pay, time })
          : action === 'reload' ? W.reload(v, { part, face, pay })
          : W.paint(v, part);
        need(r.ok, r.why);
        if (g.workshopUI.open) g.workshopUI.render();
        return { ...r, cash: g.cash, clock: g.sky.clock, stats: W.report(v) };
      },
    },
    mount: {
      group: 'vehicle', desc: 'Fire a trigger group of the car\'s mounts (docs/design/WEB_WORKSHOP.md §3): group=1 aimed (hood + pods; LMB / pad LB at the wheel), 2 the tail (droppers, a tail gun; B / pad B), 3 the roof turret (RMB / pad VIEW+RB). Aims at id= or x,z (default straight down that face). hold=<seconds> keeps the trigger down (the rail gun and the EMP charge while held). vehicle= fires another car\'s mounts as its driver would (the tactics lane\'s verb: fireMount). Returns what was in arc, what fired, what dropped, rockets in flight.',
      args: { action: { type: 'string', default: 'fire', enum: ['fire'] }, group: { type: 'number', default: 1 }, x: { type: 'number' }, z: { type: 'number' }, id: { type: 'string' }, hold: { type: 'number', default: 0 }, vehicle: { type: 'string' } },
      run: async ({ group, x, z, id, hold, vehicle }) => {
        const v = vehicle ? api.findVeh(vehicle) : P().inVehicle;
        need(v && !v.dead, vehicle ? `no live vehicle ${vehicle}` : 'drive a car with mounts (workshop action=install)');
        need(v.mounts, `the ${v.name} has no mounts`);
        need([1, 2, 3].includes(group), 'group=1|2|3');
        const t = id ? api.findChar(id) ?? api.findVeh(id) : null;
        if (id) need(t, `no target ${id}`);
        const shooter = v.driver ?? (vehicle ? null : P());
        const frames = Math.max(1, Math.round(hold * 60));
        let inArc = 0, fired = 0, dropped = null, charging = 0;
        for (let i = 0; i < frames; i++) {
          const fx = group === 2 ? Math.sin(v.h + Math.PI) : Math.sin(v.h), fz = group === 2 ? Math.cos(v.h + Math.PI) : Math.cos(v.h);
          const tx = t ? t.x : x ?? v.x + fx * 20, tz = t ? t.z : z ?? v.z + fz * 20;
          const r = g.workshop.fireMount(v, group, Math.atan2(tx - v.x, tz - v.z), shooter);
          inArc = Math.max(inArc, r.inArc); fired += r.fired; dropped = r.dropped ?? dropped; if (r.charging) charging++;
          if (frames > 1) await api._step(1);
        }
        return { group, inArc, fired, dropped, chargingFrames: charging, rockets: g.workshop.rockets.filter((r) => r.on).length, beam: g.workshop.lastBeam ?? null, power: v.power ? Math.round(v.power.e) : null,
          target: t ? { id: t.id, hp: Math.round(t.hp), alive: t.alive ?? !t.dead } : null };
      },
    },
    arena: {
      group: 'world', desc: 'The destruction sets as rows (src/data/workshop.js ARENAS, LOANER): the dust-bowl arena and the speedway, their props (destructible barrel stacks, kickers, wrecks), the event each runs, and the loaner night (the promoter lends a junker; finish first and keep it). Data for the cities lane to stamp; loaner=true hands you the loaner build on a car here, as the promoter would.',
      args: { loaner: { type: 'boolean', default: false } },
      run: async ({ loaner }) => {
        const out = { arenas: ARENAS, loaner: LOANER };
        if (!loaner) return out;
        const p = P(), v = g.vehiclesSys.spawn(LOANER.vehicle, p.x + 6, p.z, 0, '#6a5a3a');
        for (const [f, [k, pts]] of Object.entries(LOANER.build.armor)) g.workshop.install(v, { part: k, face: f, n: pts, pay: false, time: false });
        for (const [f, k] of Object.entries(LOANER.build.mounts)) g.workshop.install(v, { part: k, face: f, pay: false, time: false });
        v.loaner = true;
        return { ...out, vehicle: v.id, stats: g.workshop.report(v) };
      },
    },
  };
}

// ---- the checks ------------------------------------------------------------------------------------------------------
// ctx: { g, api, C, check, stage, person } from runSelfTest (the garage block's staging: open sand at the world-memory STAGE).
export async function workshopChecks({ g, api, C, check, stage, person }) {
  const spawn = async (type, dx, dz, heading = 0, extra = {}) => api.findVeh((await C('spawnVehicle', { type, x: g.player.x + dx, z: g.player.z + dz, heading, ...extra })).id);
  const cleanup = (...vs) => { for (const v of vs) if (v && g.vehicles.includes(v)) g.vehiclesSys.remove(v); g.garage.hazards.length = 0; for (const R of g.workshop.rockets) R.on = false; };
  const fit = (v, part, face, n) => g.workshop.install(v, { part, face, n, pay: false, time: false });
  const drive = async (v, seconds, throttle = 1) => {
    await C('enterVehicle', { id: v.id, force: true });
    g.driveOverride = { throttle, steer: 0 }; await api._step(Math.round(seconds * 60)); g.driveOverride = null;
  };

  await check('workshop: the rows validate, and every body that can be worked on carries every legacy face', async () => {
    const r = validateWorkshop();
    const floor = Object.entries(PLATE_MAX).every(([k, m]) => Object.entries(m).every(([f, n]) => (CHASSIS[k]?.faces[f] ?? 0) >= n));
    const ammo = [...Object.values(MOUNT_WEAPONS), ...Object.values(UTILITY)].every((w) => !w.ammo || ITEMS[w.ammo]?.kind === 'ammo'); // the rounds are things you carry
    return r.ok && floor && ammo ? true : JSON.stringify({ bad: r.bad, floor, ammo });
  });

  await check('workshop: armour weight slows a car by the formula (pull, top speed, handling, braking), and slower off the line for real', async () => {
    await stage();
    const light = await spawn('sedan', 14, -8, Math.PI / 2), heavy = await spawn('sedan', 14, 8, Math.PI / 2);
    const s = VEHICLES.sedan;
    for (const f of ['front', 'rear', 'left', 'right']) fit(heavy, 'sheet', f, 12);
    fit(heavy, 'sheet', 'top', 6);
    const kg = g.garage.kgOn(heavy), mass = s.mass + kg / 1000, ratio = s.mass / mass;
    const want = { accel: s.accel * ratio, maxSpeed: s.maxSpeed * (1 - PERF.topLoss * (1 - ratio)), turn: s.turn * ratio ** PERF.turnExp, brake: ratio ** PERF.brakeExp };
    const formula = Math.abs(heavy.accel - want.accel) < 1e-6 && Math.abs(heavy.maxSpeed - want.maxSpeed) < 1e-6 && Math.abs(heavy.turn - want.turn) < 1e-6 && Math.abs(heavy.brakeMul - want.brake) < 1e-6;
    // 1.5 s from rest (the Thrill Show's fences are 50 m east of the stage: a full-speed run would meet them)
    await drive(light, 1.5); const vl = g.vehiclesSys.speed(light); g.exitVehicle(true);
    await drive(heavy, 1.5); const vh = g.vehiclesSys.speed(heavy); g.exitVehicle(true);
    const over = g.garage.plate(heavy, 'front', 12, 'sheet').ok; // the body's load is a ceiling: no plate past maxKg (756 + 168 > 900)
    cleanup(light, heavy);
    return formula && vh < vl * 0.95 && kg === 54 * ARMOR.sheet.kg && !over ? true : JSON.stringify({ formula, kg, want: Object.fromEntries(Object.entries(want).map(([k, x]) => [k, r2(x)])), got: { accel: r2(heavy.accel), top: r2(heavy.maxSpeed), turn: r2(heavy.turn), brake: r2(heavy.brakeMul) }, vl: r2(vl), vh: r2(vh), over });
  });

  await check('workshop: THE BREACH - a plated nose keeps rounds off the engine; shot bare, the next rounds reach the engine behind it', async () => {
    await stage();
    const v = await spawn('sedan', 12, 0, -Math.PI / 2); // nose toward you
    fit(v, 'sheet', 'front', 3); // 18 hit points of sheet steel
    const seq0 = g.eventSeq;
    for (let i = 0; i < 3 && v.plates.front > 0; i++) await C('fire', { id: v.id, shots: 1 });
    const heldEngine = v.dmg.engine, breached = v.plates.front === 0;
    for (let i = 0; i < 6; i++) await C('fire', { id: v.id, shots: 1 });
    const ev = (await C('events', { since: seq0 })).events ?? [];
    const breachEv = ev.some((e) => e.type === 'breach' && e.vehicle === v.id && e.face === 'front');
    const reached = ev.filter((e) => e.type === 'breachHit' && e.vehicle === v.id && e.face === 'front').length;
    const out = { heldEngine: r2(heldEngine), breached, engine: r2(v.dmg.engine), radiator: r2(v.dmg.radiator), breachEv, reached, rearUntouched: v.dmg.tank === 1 };
    cleanup(v);
    return heldEngine === 1 && breached && breachEv && reached > 0 && out.engine < 1 && out.radiator < 1 && out.rearUntouched ? true : JSON.stringify(out);
  });

  await check('workshop: a rear oil slick spins a pursuing raider car', async () => {
    await stage();
    const mine = await spawn('sedan', 0, 0, Math.PI / 2); // facing east
    fit(mine, 'oil', 'rear');
    const chaser = await spawn('sedan', -16, 0, Math.PI / 2, { ai: 'raider' });
    await C('enterVehicle', { id: mine.id, force: true });
    const seq0 = g.eventSeq;
    g.driveOverride = { throttle: 0.55, steer: 0 }; await api._step(30);
    const d = await C('mount', { group: 2 });
    let spun = false, av = 0;
    for (let i = 0; i < 300 && !spun; i++) { await api._step(1); av = Math.max(av, Math.abs(chaser.av)); spun = (await C('events', { since: seq0, type: 'slipped' })).events?.some((e) => e.vehicle === chaser.id); }
    g.driveOverride = null;
    const out = { dropped: d.dropped, spun, av: r2(av), grip: r2(chaser.gripMul ?? 1), chaserDriver: !!chaser.driver };
    g.exitVehicle(true); if (chaser.driver) g.removeChar(chaser.driver); cleanup(mine, chaser);
    return d.dropped === 'oil' && spun && av > 1 ? true : JSON.stringify(out);
  });

  await check('workshop: a hood rocket inside its arc fires and lands; aimed outside the arc it does not fire', async () => {
    await stage();
    const v = await spawn('sedan', 0, 0, Math.PI / 2);
    fit(v, 'rockets', 'front');
    const target = await spawn('van', 28, 0, 0);
    await C('enterVehicle', { id: v.id, force: true });
    const hp0 = target.hp, seq0 = g.eventSeq;
    const behind = await C('mount', { group: 1, x: v.x - 30, z: v.z });
    const ahead = await C('mount', { group: 1, id: target.id });
    let landed = false;
    for (let i = 0; i < 120 && !landed; i++) { await api._step(1); landed = (await C('events', { since: seq0, type: 'rocketHit' })).events?.some((e) => e.vehicle === target.id); }
    const out = { behind: { inArc: behind.inArc, fired: behind.fired }, ahead: { inArc: ahead.inArc, fired: ahead.fired }, landed, hp0: Math.round(hp0), hp: Math.round(target.hp), ammo: v.mounts.front.ammo };
    g.exitVehicle(true); cleanup(v, target);
    return behind.fired === 0 && behind.inArc === 0 && ahead.fired === 1 && landed && out.hp < out.hp0 && out.ammo === MOUNT_WEAPONS.rockets.mag - 1 ? true : JSON.stringify(out);
  });

  await check('workshop: the rail gun wants power, charges while held, then one slug goes through two cars', async () => {
    await stage();
    const v = await spawn('pickup', 0, 0, Math.PI / 2);
    fit(v, 'rail', 'front');
    const a = await spawn('sedan', 16, 0, 0), b = await spawn('sedan', 24, 0, 0);
    await C('enterVehicle', { id: v.id, force: true });
    const seq0 = g.eventSeq;
    const starved = await C('mount', { group: 1, id: a.id, hold: 2 }); // the alternator alone: 20 of the 60 it drinks
    fit(v, 'battery'); v.power.e = v.power.cap;
    const tap = await C('mount', { group: 1, id: a.id }); // one frame: charging, not fired
    const ha = a.hp, hb = b.hp;
    const held = await C('mount', { group: 1, id: a.id, hold: MOUNT_WEAPONS.rail.charge + 0.3 });
    const hits = ((await C('events', { since: seq0, type: 'railHit' })).events ?? []).filter((e) => e.kind === 'veh');
    const out = { starved: starved.fired, tap: { fired: tap.fired, charging: tap.chargingFrames }, held: held.fired, chargeFrames: held.chargingFrames, a: [Math.round(ha), Math.round(a.hp)], b: [Math.round(hb), Math.round(b.hp)], hits: hits.map((e) => `${e.id}#${e.n}`), power: held.power };
    g.exitVehicle(true); cleanup(v, a, b);
    return starved.fired === 0 && tap.fired === 0 && tap.chargingFrames === 1 && held.fired === 1 && held.chargingFrames > 60 && a.hp < ha && b.hp < hb && hits.some((e) => e.n === 2) ? true : JSON.stringify(out);
  });

  await check('workshop: fitting at the counter costs scrip and passes time; broke, it refuses', async () => {
    await stage();
    const v = await spawn('sedan', 6, 0, 0);
    g.lastVehicle = v;
    const open = g.workshop.open(true);
    const q = g.workshop.quote(v, 'install', { part: 'mg1' }), cost = q.price + q.labour;
    g.cash = 1000; const t0 = g.sky.time;
    const r = await C('workshop', { action: 'install', part: 'mg1', face: 'front' });
    const paid = 1000 - g.cash, dt = ((g.sky.time - t0) + 24) % 24;
    g.cash = 5;
    const why = (r) => (r?.ok === false ? String(r.error) : 'fitted'); // commands never throw: a refusal is { ok: false, error }
    const broke = why(await C('workshop', { action: 'install', part: 'autocannon', face: 'top' }));
    const plates = why(await C('workshop', { action: 'install', part: 'ram', face: 'left', pay: false })); // a ram plate is a nose or a tail
    g.cash = 120; g.workshop.site = null;
    const out = { open: open.ok, cost, paid, hours: r2(dt), want: MOUNT_WEAPONS.mg1.labour, broke, plates, gun: v.mounts?.front?.kind };
    cleanup(v);
    return open.ok && paid === cost && cost > 0 && Math.abs(dt - MOUNT_WEAPONS.mg1.labour) < 1e-6 && /scrip/.test(broke) && /does not go/.test(plates) && out.gun === 'mg1' ? true : JSON.stringify(out);
  });

  await check('workshop: the screen opens with its tabs, every tab lists rows, and the keys walk the tabs and fit a part', async () => {
    await stage();
    const v = await spawn('sedan', 6, 0, 0);
    g.lastVehicle = v; g.cash = 2000;
    const o = await C('workshop', { action: 'open', force: true });
    const U = g.workshopUI, tabs = o.tabs.map((t) => [t.id, t.rows.length]);
    const allRows = o.tabs.every((t) => t.rows.length > 0) && o.tabs.length === 6 && o.dom.tabs === 6 && o.dom.rack > 0;
    // Real keys: F walks to the next tab, E fits the picked row (the first armour onto the picked face).
    U.tab = 0; U.sel = 0; U.face = 'front'; U.render();
    g.input.pressed.add('KeyE'); await api._step(2);
    const fitted = (v.plates?.front ?? 0) > 0;
    g.input.pressed.add('KeyF'); await api._step(2);
    const tab = U.view().tab;
    const visible = !U.el.menu.classList.contains('hidden') && U.el.rack.children.length > 0;
    g.input.pressed.add('Escape'); await api._step(2);
    const closed = !U.open;
    g.cash = 120; cleanup(v);
    return allRows && fitted && tab === 'weapons' && visible && closed ? true : JSON.stringify({ tabs, dom: o.dom, fitted, tab, visible, closed });
  });

  await check('workshop: what the car wears (plate kinds, every mount, gadgets, paint) rides a save and a load', async () => {
    await stage();
    const v = await spawn('pickup', 6, 0, 0);
    fit(v, 'ablative', 'left', 6); fit(v, 'spikes', 'right', 4); fit(v, 'flamer', 'top'); fit(v, 'minedrop', 'rear'); fit(v, 'nitrous'); g.workshop.paint(v, 'hazard', true);
    const save = (await C('save')).save;
    g.workshop.remove(v, { face: 'top', pay: false, time: false }); g.workshop.remove(v, { part: 'nitrous', pay: false, time: false }); v.plateKind.left = 'plate';
    await C('load', { save });
    const w = api.findVeh(v.id);
    const out = { kind: w?.plateKind, top: w?.mounts?.top?.kind, rear: w?.mounts?.rear?.kind, util: Object.keys(w?.utility ?? {}), paint: w?.paintKey, kg: Math.round(g.garage.kgOn(w)) };
    cleanup(w);
    return out.kind?.left === 'ablative' && out.kind?.right === 'spikes' && out.top === 'flamer' && out.rear === 'minedrop' && out.util.includes('nitrous') && out.paint === 'hazard' ? true : JSON.stringify(out);
  });
}
