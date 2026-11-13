// VEHICLES V2, DAMAGE YOU FEEL (Robert 11-12: "if you get a flat tire, it feels like it, so on and so forth";
// docs/status/vehicles-v2.md on docs/web-veh-status): the `carfeel` command and selftest checks. Rows: data/damagefeel.js;
// the system: systems/damagefeel.js. Each check drives with the keys (W, S, E held); only the damage itself is staged.
import { ITEMS, LOOT } from '../data/items.js';
import { resolve } from '../data/audiosets.js';
import { FLAT, RIM, DRAG, HEAT, FIXES, FEEL_ITEMS, FEEL_LOOT, validateFeel, decodeDm } from '../data/damagefeel.js';
import { cleanPresence } from '../net/protocol.js';

const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;

export function vehDmgFeelCommands(api, need) {
  const g = api.g;
  return { carfeel: { group: 'vehicle', desc: 'DAMAGE YOU FEEL: the car you are in (or id=): its flats, rims, alignment, brakes, a seized engine, a dragging bumper, the body roll, its loops, the damage word other players get.', args: { id: { type: 'string' } },
    run: async ({ id }) => { const v = id ? api.findVeh(id) : g.player.inVehicle; need(v, 'not in a vehicle (or give id=)'); return { id: v.id, feel: g.dmgFeel.view(v), counts: g.dmgFeel.counts }; } } };
}

export async function vehDmgFeelChecks(api, check, C) {
  const g = api.g, I = g.input, F = () => g.dmgFeel, made = [];
  const yard = { x: 250, z: 400 }, LOT = { x: 120, z: -20 }; // the yard: open ground to drive; the lot by Rust Haven: quiet, to kneel and work
  let quiet = null; // the world held still while you kneel (no new raiders or infected; the ones near are put away)
  const hush = () => { if (quiet) return; quiet = { z: g.zombies.enabled, rt: g.raiderTimer, w: g.wilds.enabled, th: g.actions.threatInSight }; g.actions.threatInSight = () => false; /* staged: no hostile walks in and cancels the job (not what these checks test) */ g.zombies.enabled = false; g.raiderTimer = 1e9; g.wilds.enabled = false; for (const c of g.chars) if (c.alive && c !== g.player && (c.faction === 'raider' || c.faction === 'zombie' || c.target === g.player) && Math.hypot(c.x - LOT.x, c.z - LOT.z) < 160) { if (c.faction === 'raider' || c.faction === 'zombie') { c.alive = false; c.hp = 0; } else { c.target = null; c.state = 'idle'; c.grudge = null; } } };
  const unhush = () => { if (!quiet) return; delete g.actions.threatInSight; g.zombies.enabled = quiet.z; g.raiderTimer = quiet.rt; g.wilds.enabled = quiet.w; quiet = null; };
  const toLot = async (v) => { hush(); if (g.player.inVehicle) g.exitVehicle(true); Object.assign(v, { x: LOT.x, z: LOT.z, h: 0, vx: 0, vz: 0, av: 0 }); await C('teleport', { x: LOT.x - 4, z: LOT.z }); await api._step(4); }; // staged: towed to the lot
  const keys = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyE', 'Space'];
  const off = () => { unhush(); for (const k of keys) I.down.delete(k); if (g.player.inVehicle) g.exitVehicle(true); for (const v of made.splice(0)) if (g.vehicles.includes(v)) g.vehiclesSys.remove(v); };
  // A fresh sedan in the open, heading north (+z), you at the wheel; `stage` hurts it before you drive.
  const car = async (stage = null, at = yard) => {
    await C('teleport', { x: at.x - 5, z: at.z }); await api._step(2);
    const v = g.vehiclesSys.spawn('sedan', at.x, at.z, 0, '#777'); made.push(v);
    F().ensure(v.dmg); if (stage) stage(v.dmg, v);
    g.enterVehicle(v); await api._step(2); return v;
  };
  // Hold the keys for `frames`: how far it went sideways (+ = toward its left), its top speed, the turn's wobble, the body's roll.
  const drive = async (v, frames, ks = ['KeyW']) => {
    for (const k of ks) I.down.add(k);
    const x0 = v.x, z0 = v.z, h0 = v.h; let top = 0, av = 0, avSq = 0, n = 0, roll = 0, rollSq = 0;
    for (let f = 0; f < frames; f++) { await api._step(1); top = Math.max(top, g.vehiclesSys.speed(v)); if (f > 40) { av += v.av; avSq += v.av * v.av; roll += v.dmgRoll ?? 0; rollSq += (v.dmgRoll ?? 0) ** 2; n++; } }
    for (const k of ks) I.down.delete(k);
    const mean = roll / Math.max(1, n);
    const am = av / Math.max(1, n);
    return { side: v.x - x0, ahead: v.z - z0, turn: Math.atan2(Math.sin(v.h - h0), Math.cos(v.h - h0)), top, av: Math.sqrt(Math.max(0, avSq / Math.max(1, n) - am * am)), roll: mean, shudder: Math.sqrt(Math.max(0, rollSq / Math.max(1, n) - mean * mean)) };
  };

  await check('car feel: the rows validate; the parts (a jack, a plug kit, brake pads, coolant) are items found in garages and at the pumps; every damage sound is a set of recorded takes on disk', async () => {
    const bad = validateFeel(ITEMS, LOOT);
    const items = Object.keys(FEEL_ITEMS).every((k) => ITEMS[k]);
    const loot = Object.entries(FEEL_LOOT).every(([t, rows]) => rows.every(([id]) => LOOT[t].rows.some((r) => r[0] === id)));
    const kinds = ['tyre.flap', 'rim.scrape', 'bumper.drag', 'steam.hiss', 'brake.grind', 'engine.misfire', 'tyre.blowout'];
    const takes = {}; for (const k of kinds) takes[k] = resolve('vehdmg', k)?.files.length ?? 0;
    const fetched = await Promise.all(kinds.map((k) => fetch(`audio/vehdmg/${k}.0.ogg`).then((r) => r.ok).catch(() => false)));
    return !bad.length && items && loot && kinds.every((k) => takes[k] >= 2) && fetched.every(Boolean) ? true : JSON.stringify({ bad, items, loot, takes, fetched });
  });

  await check('car feel: a front-left flat with W held drags the car left, caps its speed, sags the body onto it and shudders it with the wheel, flaps slow and scrapes fast - all of it without the HUD', async () => {
    try {
      const hud0 = g.hud?.root?.style?.display; if (g.hud?.root) g.hud.root.style.display = 'none'; // the HUD off: what is left to read it by
      let v = await car(); const good = await drive(v, 300); off();
      v = await car((d) => { d.tyres.FL = 0; });
      I.down.add('KeyW'); let flap = 0, scrape = 0, ftop = 0;
      for (let f = 0; f < 300; f++) { await api._step(1); ftop = Math.max(ftop, g.vehiclesSys.speed(v)); const s = F().sound(); if (s.flap > 0 && g.vehiclesSys.speed(v) < FLAT.flapBelow) flap++; if (s.scrape > 0 && g.vehiclesSys.speed(v) > FLAT.flapBelow) scrape++; }
      I.down.delete('KeyW');
      const flatRun = { side: v.x - (yard.x), top: ftop };
      const pos = g.vehiclesSys.speed(v);
      if (g.hud?.root) g.hud.root.style.display = hud0 ?? '';
      const out = { good: { side: r1(good.side), top: r1(good.top) }, flat: { side: r1(flatRun.side), speed: r1(pos) }, roll: r2(v.dmgRoll ?? 0), flap, scrape };
      // re-drive the flat car for the numbers (top, roll, shudder) on the same keys
      const fr = await drive(v, 200); out.flat.top = r1(fr.top); out.flat.roll = r2(fr.roll); out.flat.shudder = r2(fr.shudder * 1000) / 1000;
      out.flat.top0 = r1(ftop);
      return flatRun.side > Math.abs(good.side) + 1.5 && ftop < good.top - 0.7 && fr.roll > 0.01 && fr.shudder > 0.002 && flap > 10 && scrape > 10 ? true : JSON.stringify(out);
    } finally { off(); }
  });

  await check('car feel: a rear flat walks the tail (the turn wobbles far more than with a front flat) and pulls the wheel far less', async () => {
    try {
      let v = await car((d) => { d.tyres.FL = 0; }); const front = await drive(v, 300); off();
      v = await car((d) => { d.tyres.RL = 0; }); const rear = await drive(v, 300);
      const out = { front: { turn: r2(front.turn), wobble: r2(front.av) }, rear: { turn: r2(rear.turn), wobble: r2(rear.av) } };
      return rear.av > front.av * 1.4 && Math.abs(rear.turn) < Math.abs(front.turn) * 0.7 ? true : JSON.stringify(out);
    } finally { off(); }
  });

  await check('car feel: driven on, a flat wears its rim down - sparks, less grip and speed - until the wheel is gone and the car sits lower on it', async () => {
    try {
      const v = await car((d) => { d.tyres.FL = 0; });
      const topY = () => { const pa = v.mesh.geometry.attributes.part, P = v.mesh.geometry.attributes.position; let m = -9; for (let i = 0; i < pa.count; i++) if (pa.array[i] === 10) m = Math.max(m, P.array[i * 3 + 1]); return m; }; // the tyre's top edge
      const fresh = await drive(v, 360), rim1 = F().view(v).rim.FL; await api._step(15); const y1 = topY();
      v.dmg.rim.FL = 0.02; // staged: most of a kilometre later
      const seq0 = g.eventSeq;
      I.down.add('KeyS'); for (let f = 0; f < 300 && g.vehiclesSys.speed(v) > 0.5; f++) await api._step(1); I.down.delete('KeyS'); // to a stop, then the same run again
      await C('teleport', { x: yard.x - 5, z: yard.z }); Object.assign(v, { x: yard.x, z: yard.z, h: 0, vx: 0, vz: 0, av: 0 }); await api._step(2); // staged: back to the start line
      const gone = await drive(v, 360); await api._step(15); const y2 = topY();
      const ev = ((await C('events', { since: seq0, type: 'rimGone' })).events ?? []).some((e) => e.vehicle === v.id);
      const out = { rimAfterRun: rim1, fresh: r1(fresh.top), gone: r1(gone.top), rimNow: v.dmg.rim.FL, ev, y: [r2(y1), r2(y2)] };
      return rim1 < 1 && v.dmg.rim.FL === 0 && ev && gone.top < fresh.top - 0.5 && y2 < y1 - 0.02 ? true : JSON.stringify(out);
    } finally { off(); }
  });

  await check('car feel: two flats on one side pull harder than one; all four and it only crawls', async () => {
    try {
      let v = await car((d) => { d.tyres.FL = 0; }); const one = await drive(v, 240); off();
      v = await car((d) => { d.tyres.FL = 0; d.tyres.RL = 0; }); const two = await drive(v, 240); off();
      v = await car((d) => { for (const t of ['FL', 'FR', 'RL', 'RR']) d.tyres[t] = 0; }); const four = await drive(v, 300);
      const out = { one: r2(one.turn), two: r2(two.turn), four: r1(four.top), cap: r1(v.maxSpeed * FLAT.allFour) };
      return two.turn > one.turn * 1.2 && one.turn > 0.05 && four.top <= v.maxSpeed * FLAT.allFour + 0.3 && four.top > 0.5 ? true : JSON.stringify(out);
    } finally { off(); }
  });

  await check('car feel: a hard hit to the front bends it (a steady pull on good tyres), beats the brakes and cracks the windshield; hold E at the front with a wrench straightens it', async () => {
    try {
      const v = await car((d, c) => { g.vehDamage.hit(c, c.x - 0.6, c.z + c.len / 2, 22, 'crash'); for (const t of ['FL', 'FR', 'RL', 'RR']) d.tyres[t] = 1; }); // staged: the hit (from the front-left)
      const align = v.dmg.align, brakes = v.dmg.brakes, glass = v.windows?.front?.hp ?? null, glass0 = g.carCombat?.layout?.(v) ? 1 : 0;
      const bent = await drive(v, 240);
      await toLot(v);
      const had = g.inventory.carried.count('wrench'); if (!had) g.inventory.stow('wrench', 1); // staged: a wrench in the pack
      const J = F().spot(v, 'front'); await C('teleport', J); await api._step(2);
      for (let k = 0; k < 3 && Math.abs(v.dmg.align) > 0.01; k++) { I.down.add('KeyE'); for (let f = 0; f < 60 * (FIXES.align.secs + 2) && Math.abs(v.dmg.align) > 0.01 && !(k === 0 && v.dmg.off.bumperF); f++) await api._step(1); I.down.delete('KeyE'); await api._step(10); } // the hanging bumper first, then the front
      const fixed = Math.abs(v.dmg.align) <= 0.01;
      if (!had) g.inventory.spend('wrench', 1);
      const out = { align: r2(align), brakes: r2(brakes), glass, side: r1(bent.side), fixed, log: g.actions.log.slice(-3), prompt: g.hud?.lastPrompt ?? null };
      return Math.abs(align) > 0.12 && Math.sign(bent.side) === Math.sign(align) && Math.abs(bent.side) > 1 && brakes < 1 && glass0 && glass !== null && glass < (v.windows?.front?.max ?? 0) && fixed ? true : JSON.stringify(out);
    } finally { off(); }
  });

  let prof = null, up0;
  await check('car feel: beaten brakes stop long, then fade, and grind when they bite; hold E at the front with pads and a wrench and the pedal bites again', async () => {
    try {
      prof = g.survival?.prof; up0 = prof?.upkeep; if (prof) prof.upkeep = true; // the full game's upkeep on (it used to overwrite the brakes)
      const stop = async (stage) => { const v = await car(stage); await drive(v, 150); const z0 = v.z; let lo = 9, hi = 0; I.down.add('KeyS'); let f = 0; for (; f < 600 && g.vehiclesSys.speed(v) > 0.6; f++) { await api._step(1); lo = Math.min(lo, v.feelBrake ?? 1); hi = Math.max(hi, v.feelBrake ?? 1); } I.down.delete('KeyS'); return { v, d: v.z - z0, f, fade: hi - lo }; };
      const good = await stop(); off();
      const g0 = F().counts.grinds;
      const bad = await stop((d) => { d.brakes = 0.25; });
      const grinds = F().counts.grinds - g0;
      await toLot(bad.v);
      const w0 = g.inventory.carried.count('wrench'), p0 = g.inventory.carried.count('brake_pads');
      if (!w0) g.inventory.stow('wrench', 1); g.inventory.stow('brake_pads', 1); // staged: the parts
      await C('teleport', F().spot(bad.v, 'front')); await api._step(2);
      I.down.add('KeyE'); for (let f = 0; f < 60 * (FIXES.brakes.secs + 2) && bad.v.dmg.brakes < 1; f++) await api._step(1); I.down.delete('KeyE');
      const fixed = bad.v.dmg.brakes === 1, spent = g.inventory.carried.count('brake_pads') === p0;
      if (!w0) g.inventory.spend('wrench', 1);
      const out = { good: r1(good.d), bad: r1(bad.d), fade: r2(bad.fade), grinds, fixed, spent, log: g.actions.log.slice(-3) };
      return bad.d > good.d * 1.6 && bad.fade > 0.02 && grinds > 0 && fixed && spent ? true : JSON.stringify(out);
    } finally { if (prof) prof.upkeep = up0; off(); }
  });

  await check('car feel: a holed radiator boils (steam), then the engine seizes and the car rolls to a stop with W held; it frees once cool, and coolant brings it back at once', async () => {
    try {
      const v = await car((d) => { d.radiator = 0; d.temp = 1.1; }); // staged: holed and near the boil
      const seq0 = g.eventSeq;
      I.down.add('KeyW'); let seizedAt = -1, stopped = false, steam = 0;
      for (let f = 0; f < 1500; f++) { await api._step(1); if (F().sound().steam > 0) steam++; if (v.dmg.seized && seizedAt < 0) seizedAt = f; if (seizedAt >= 0 && f > seizedAt + 60 && g.vehiclesSys.speed(v) < 0.5) { stopped = true; break; } }
      I.down.delete('KeyW');
      const ev = ((await C('events', { since: seq0, type: 'engineSeized' })).events ?? []).some((e) => e.vehicle === v.id);
      for (let f = 0; f < 60 * 12 && v.dmg.seized; f++) await api._step(1);
      const freed = !v.dmg.seized;
      v.dmg.temp = HEAT.seize + 0.1; v.dmg.seized = true; // staged: seized again
      const c0 = g.inventory.carried.count('coolant_jug'); g.inventory.stow('coolant_jug', 1);
      const r = g.inventory.use(g.inventory.carried.slots.findIndex((q) => q.id === 'coolant_jug')); // poured from the pack, sitting in it
      const back = !v.dmg.seized, used = g.inventory.carried.count('coolant_jug') === c0;
      const out = { seizedAt, stopped, ev, steam, freed, coolant: r?.ok ?? r, back, used };
      return seizedAt >= 0 && stopped && ev && steam > 30 && freed && back && used ? true : JSON.stringify(out);
    } finally { off(); }
  });

  await check('car feel: a caved-in front with its bumper still on hangs it low and drags it - sparks, a scrape, less speed - until it tears off', async () => {
    try {
      const v = await car((d) => { d.zones.front = 0.55; d.dirty = true; }); // staged: caved in, bumper still on
      await api._step(20);
      const pa = v.mesh.geometry.attributes.part, P = v.mesh.geometry.attributes.position; let low = 0;
      for (let i = 0; i < pa.count; i++) if (pa.array[i] === 1 && P.array[i * 3 + 1] < v.basePos[i * 3 + 1] - 0.1) low++;
      const seq0 = g.eventSeq; let drag = 0;
      I.down.add('KeyW');
      for (let f = 0; f < 60 * 50 && !v.dmg.off.bumperF; f++) { await api._step(1); if (F().sound().drag > 0) drag++; }
      I.down.delete('KeyW');
      const torn = ((await C('events', { since: seq0, type: 'panelLost' })).events ?? []).some((e) => e.vehicle === v.id && e.part === 'bumperF');
      const out = { low, drag, torn, odo: Math.round(v.dmg.drag.F) };
      return low > 0 && drag > 60 && torn ? true : JSON.stringify(out);
    } finally { off(); }
  });

  await check('car feel: a flat is changed on your knees at the wheel - not without a jack, and with one the spare goes on (spent) and the jack stays; a plug kit plugs a flat on a sound rim', async () => {
    try {
      const v = await car((d) => { d.tyres.FR = 0; d.tyres.RR = 0; d.rim.RR = 0.9; });
      await toLot(v);
      const jack0 = g.inventory.carried.count('car_jack'), spare0 = g.inventory.carried.count('spare_tyre'), plug0 = g.inventory.carried.count('tyre_plug');
      if (jack0) g.inventory.spend('car_jack', jack0); const T = g.inventory.trunk(v); g.inventory.add(T, 'spare_tyre', 1); // staged: a spare in its trunk, no jack
      await C('teleport', F().spot(v, 'wheel', 'FR')); await api._step(2);
      I.down.add('KeyE'); for (let f = 0; f < 60 * 4; f++) await api._step(1); I.down.delete('KeyE'); await api._step(2);
      const noJack = v.dmg.tyres.FR === 0;
      g.inventory.stow('car_jack', 1);
      I.down.add('KeyE'); for (let f = 0; f < 60 * (FIXES.tyre.secs + 3) && v.dmg.tyres.FR === 0; f++) await api._step(1); I.down.delete('KeyE'); await api._step(2);
      const changed = v.dmg.tyres.FR === 1 && v.dmg.rim.FR === 1, spareSpent = T.count('spare_tyre') === 0, jackKept = g.inventory.carried.count('car_jack') === 1;
      g.inventory.spend('car_jack', 1); g.inventory.stow('tyre_plug', 1);
      await C('teleport', F().spot(v, 'wheel', 'RR')); await api._step(2);
      I.down.add('KeyE'); for (let f = 0; f < 60 * (FIXES.plug.secs + 3) && v.dmg.tyres.RR === 0; f++) await api._step(1); I.down.delete('KeyE'); await api._step(2);
      const plugged = v.dmg.tyres.RR > 0 && g.inventory.carried.count('tyre_plug') === plug0;
      if (jack0) g.inventory.stow('car_jack', jack0);
      const out = { noJack, changed, spareSpent, jackKept, plugged, log: g.actions.log.slice(-3), job: F().jobAt(v, g.player) };
      return noJack && changed && spareSpent && jackKept && plugged ? true : JSON.stringify(out);
    } finally { off(); }
  });

  await check('car feel: the damage word survives the shard\'s own cleaner and puts the same flats, rim, smoke, steam and hanging bumper on the other car; boats have no tyres to lose, a bike only two', async () => {
    try {
      const a = g.vehiclesSys.spawn('sedan', yard.x, yard.z, 0, '#777'), b = g.vehiclesSys.spawn('sedan', yard.x + 8, yard.z, 0, '#777'); made.push(a, b);
      Object.assign(a.dmg.tyres, { FL: 0, RR: 0 }); F().ensure(a.dmg); a.dmg.rim.RR = 0; a.dmg.engine = 0.2; a.dmg.temp = 1.1; a.dmg.zones.rear = 0.5; a.dmg.align = 0.4;
      const msg = cleanPresence({ x: a.x, z: a.z, v: { t: a.type, x: a.x, z: a.z, h: a.h, c: '#777777', seat: 0, dm: F().encode(a) } }); // through the shard's own cleaner
      b.netGhost = { char: 'a friend' }; F().decode(b, msg.v.dm); // b stands in for their car on this page
      const s = decodeDm(msg.v.dm), same = F().encode(b) === F().encode(a);
      const boat = g.vehiclesSys.spawn('gunboat', yard.x + 30, yard.z + 30, 0, '#777'); made.push(boat);
      g.vehDamage.popTyre(boat, 'FL'); const boatKept = boat.dmg.tyres.FL === 1;
      const bike = g.vehiclesSys.spawn('bike', yard.x - 8, yard.z, 0, '#777'); made.push(bike);
      g.vehDamage.popTyre(bike, 'FR'); const bikeFront = bike.dmg.tyres.FL === 0 && bike.dmg.tyres.FR === 1;
      const out = { dm: msg.v.dm, same, flats: s.flat, rimRR: s.rimGone.RR, boatKept, bikeFront };
      return msg.v.dm > 0 && same && s.flat.FL && s.flat.RR && s.rimGone.RR && s.smoke && s.steam && s.dragR && s.pullL && boatKept && bikeFront ? true : JSON.stringify(out);
    } finally { off(); }
  });

  await check('car feel: beside a flat front wheel F still opens the door (the fix only takes E), and the prompt says what holding E would do', async () => {
    try {
      const v = await car((d) => { d.tyres.FL = 0; }); await toLot(v);
      await C('teleport', F().spot(v, 'wheel', 'FL')); await api._step(3);
      const q0 = { ...F().spot(v, 'wheel', 'FL') }; const J0 = F().jobAt(v, g.player)?.job ?? null;
      F().fixKey(g.player, v, I, 1 / 60); const hint = F().hint ?? ''; // E up: it only leaves its hint for the car's prompt
      I.down.add('KeyF'); I.pressed.add('KeyF'); await api._step(1); I.down.delete('KeyF'); await api._step(4);
      const inIt = g.player.inVehicle === v;
      return inIt && /hold|spare|jack/i.test(hint) ? true : JSON.stringify({ inIt, hint, job: J0, at: [r1(g.player.x), r1(g.player.z)], spot: [r1(q0.x), r1(q0.z)], car: [r1(v.x), r1(v.z)] });
    } finally { off(); }
  });

  await check('car feel: a save and a load keep a car\'s felt damage - its flats, a worn rim, the bent front, beaten brakes', async () => {
    try {
      const v = g.vehiclesSys.spawn('sedan', yard.x, yard.z, 0, '#777'); made.push(v); F().ensure(v.dmg);
      Object.assign(v.dmg.tyres, { FL: 0 }); v.dmg.rim.FL = 0.3; v.dmg.align = -0.4; v.dmg.brakes = 0.2; v.dmg.zones.front = 0.5;
      const snap = (await C('save')).save;
      g.vehDamage.repair(v); // the page forgets
      await C('load', { save: snap }); await api._step(2);
      const w = g.vehicles.find((q) => q.id === v.id) ?? v, d = w.dmg;
      const out = { FL: d.tyres.FL, rim: d.rim?.FL, align: d.align, brakes: d.brakes, front: d.zones.front };
      return d.tyres.FL === 0 && Math.abs(d.rim.FL - 0.3) < 0.01 && Math.abs(d.align + 0.4) < 0.01 && Math.abs(d.brakes - 0.2) < 0.01 && Math.abs(d.zones.front - 0.5) < 0.01 ? true : JSON.stringify(out);
    } finally { off(); }
  });
}
