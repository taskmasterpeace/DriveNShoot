// CLONES AND THE TRAVEL NETWORK as COMMANDS rows and selftest checks (docs/design/WEB_CLONE_TRAVEL.md). buildCommands() in
// api.js spreads cloneCommands into COMMANDS (help, the CLI, the MCP tools, docs/COMMANDS.md); runSelfTest() calls
// cloneChecks near the end of the battery.

import { LINES, NODES } from '../data/travel.js';
import { CLONE_RULES } from '../data/clones.js';
import { ITEMS } from '../data/items.js';
import { outfit } from '../systems/characters.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function cloneCommands(api, need) {
  const g = api.g;
  const P = () => g.player;
  const stepUntil = async (pred, maxS, dt = 0.25) => { for (let t = 0; t < maxS; t += dt) { if (pred()) return true; await api._step(Math.round(dt * 60)); } return pred(); };
  return {
    clone: {
      group: 'player', desc: 'Cloning: pressings, husks, the brine (docs/design/WEB_CLONE_TRAVEL.md, rows in src/data/clones.js). action: status (your pressing: where, when, the skills it holds, how cold; the brine book; brine money owed; your husks: where, what is still on them, what the pickers took, your car and its trunk; the lineage of characters who died flat; every vat) | press (get pressed at the vat you stand at; vat=<id> with force=true to stage one anywhere; free=true costs nothing) | deposit / withdraw amount= (the brine book, at a vat counter; force=true anywhere) | die (an honest death right here: god off, a lethal hit, then the black and the waking; wait=false returns at the moment of death) | wake (cut the black short) | reclaim (take everything on your husk back: within 3.5 m, id=<husk> force=true from anywhere) | pick hours= (run the clock N game hours: the pickers work every husk) | upkeep (charge a day of brine money now).',
      args: { action: { type: 'string', default: 'status', enum: ['status', 'press', 'deposit', 'withdraw', 'die', 'wake', 'reclaim', 'pick', 'upkeep'] }, vat: { type: 'string' }, amount: { type: 'number' }, id: { type: 'string' }, hours: { type: 'number', default: 24 }, force: { type: 'boolean', default: false }, free: { type: 'boolean', default: false }, wait: { type: 'boolean', default: true } },
      run: async ({ action, vat, amount, id, hours, force, free, wait }) => {
        const C = g.clone;
        if (action === 'press') { const r = C.press(vat ?? null, { force, free }); need(r.ok, r.why); return { ...r, cash: g.cash, bank: C.bank }; }
        if (action === 'deposit' || action === 'withdraw') { need(amount > 0, 'amount= scrip'); const r = C[action](amount, { force }); need(r.ok, r.why); return r; }
        if (action === 'die') {
          const p = P();
          need(p.alive, 'already dead (step to wake, or clone action=wake)');
          const god = g.godMode; g.godMode = false; p.graceT = 0;
          g.combat.damage(p, 99999, null, 0, 0, 'bullet');
          g.godMode = god;
          need(!p.alive, 'the hit did not kill (god mode?)');
          const husk = C.husks[C.husks.length - 1];
          if (!wait) return { dead: true, husk: husk?.id ?? null };
          await stepUntil(() => p.alive || C.flat, CLONE_RULES.wakeDelay + 3);
          return { alive: p.alive, wake: C.lastWake, husk: husk ? C.view().husks.find((h) => h.id === husk.id) : null, pressing: C.pressingView() };
        }
        if (action === 'wake') { need(!P().alive, 'you are alive'); g.respawnT = 0; await api._step(2); return { alive: P().alive, wake: C.lastWake }; }
        if (action === 'reclaim') { const r = C.reclaim(id ?? null, { force }); need(r.ok, r.why); return r; }
        if (action === 'pick') { need(hours > 0 && hours <= 480, 'hours in (0, 480]'); g.travel.advanceHours(hours, 'pick'); return { hours, husks: C.view().husks }; }
        if (action === 'upkeep') { C.newDay(); return { bank: C.bank, owed: C.owed, pressing: C.pressingView() }; }
        return C.view();
      },
    },
    travel: {
      group: 'world', desc: 'The travel network back to your husk (docs/design/WEB_CLONE_TRAVEL.md, rows in src/data/travel.js): the SUN LINE trundle (bus) pole to pole on I-10 and the SALT LINE on Florida I-95 (the Meridian knot), the IRON LINE (the freight from Dust Bowl Station through the yards), FIVE CITY AIR (Los Angeles and four cities past the dust). action: status (where you stand, its board, your punches, the trundle if one is real, the arrivals hall, the last trips) | lines | nodes | buy line= to= (a punch at the board you stand at; flight=<i> for an air row; from= force=true to stage) | wait (run the clock until the next trundle or iron is nearly due here, and make it real) | board (climb aboard the trundle standing at your pole, as a passenger; force=true skips the reach check) | ride seconds= (step the sim while you ride, until you step off) | skip (sleep through it: the wait and the whole trip go by on the clock, the road rolls once; punch= seed= force=) | leave (get off the trundle) | goto node= dir=east|west (stand at a node\'s pole or counter, for staging) | panel node= (open its board on screen; close closes it) | hall (the arrivals hall you are held in) | leaveHall (staging: out of the hall, where you stand).',
      args: { action: { type: 'string', default: 'status', enum: ['status', 'lines', 'nodes', 'buy', 'wait', 'board', 'ride', 'skip', 'leave', 'goto', 'panel', 'close', 'hall', 'leaveHall'] }, line: { type: 'string' }, to: { type: 'string' }, from: { type: 'string' }, flight: { type: 'number' }, node: { type: 'string' }, dir: { type: 'string', enum: ['east', 'west'] }, punch: { type: 'string' }, seed: { type: 'number' }, seconds: { type: 'number', default: 120 }, force: { type: 'boolean', default: false } },
      run: async ({ action, line, to, from, flight, node, dir, punch, seed, seconds, force }) => {
        const T = g.travel, p = P();
        if (action === 'lines') return { lines: T.linesView() };
        if (action === 'nodes') return { nodes: T.nodesView() };
        if (action === 'buy') { need(line, 'line= (sun | iron | air)'); const r = T.buy(line, to, { from: from ?? null, force, flight: flight ?? null }); need(r.ok, r.why); return { ...r, cash: g.cash }; }
        if (action === 'wait') { const r = T.wait({ line: line ?? null, dir: dir ? (dir === 'west' ? -1 : 1) : null }); need(r.ok, r.why); return r; }
        if (action === 'board') {
          const v = T.busVehicle();
          need(v && !v.dead, 'no trundle here (travel action=wait)');
          need(force || Math.hypot(v.x - p.x, v.z - p.z) < 9, `the trundle is ${Math.round(Math.hypot(v.x - p.x, v.z - p.z))} m away`);
          need(T.bus.state === 'dwell' || force, 'the trundle is moving: wait for it to stop at the pole');
          g.enterVehicle(v, 'passenger');
          await api._step(2);
          return { aboard: p.inVehicle === v, ride: T.view().ride };
        }
        if (action === 'ride') {
          need(T.ride, 'not riding (buy a punch, wait, board)');
          const n0 = T.log.length;
          await stepUntil(() => !T.ride || T.log.length > n0, Math.min(600, seconds), 0.5);
          return { arrived: T.log.length > n0, trip: T.log[T.log.length - 1] ?? null, at: { x: r1(p.x), z: r1(p.z) }, here: T.view().here, riding: !!T.ride };
        }
        if (action === 'skip') { const r = T.skip({ punch: punch ?? null, seed: seed ?? null, force }); need(r.ok, r.why); return { ...r, at: { x: r1(p.x), z: r1(p.z) }, away: T.away, cash: g.cash }; }
        if (action === 'leave') { need(p.inVehicle, 'not aboard'); g.exitVehicle(); await api._step(2); return { aboard: !!p.inVehicle, ride: T.view().ride }; }
        if (action === 'goto') {
          const n = T.node(node);
          need(n, `no node ${node}; nodes: ${Object.keys(NODES).join(', ')}`);
          need(n.onMap, `${n.name} is past the dust (off the map)`);
          if (p.inVehicle) g.exitVehicle(true);
          const pole = n.road && !n.air, q = pole ? n.poles[dir === 'west' ? -1 : 1] : n.counter;
          T.leaveHall();
          await api.call('teleport', { x: q.x + (pole ? 0 : 1.2), z: q.z + (pole ? 0 : 1.2) });
          await api._step(2);
          return { node: n.id, x: r1(p.x), z: r1(p.z), here: T.view().here };
        }
        if (action === 'panel') { const id = node ?? T.nodeHere()?.id; need(id, 'node= or stand at a board'); return T.openBoard(id); }
        if (action === 'close') { T.ui.close(); return { open: T.ui.open }; }
        if (action === 'hall') return { away: T.away, panel: T.ui.open ? { title: T.ui.model?.title, hall: !!T.ui.model?.hall, rows: T.ui.model?.rows?.length } : null };
        if (action === 'leaveHall') { T.leaveHall(); return { away: T.away }; }
        return T.view();
      },
    },
  };
}

// ---- the selftest ---------------------------------------------------------------------------------------------------------
export async function cloneChecks(api, check, C) {
  const g = api.g;
  const STAGE = { x: 280, z: -120 };
  const CL = g.clone, TR = g.travel;
  const quiet = () => {
    for (const ev of [...g.society.director.active]) g.society.director.cancel(ev.id);
    for (const c of [...g.chars]) if (c !== g.player && !c.npc && !c.trundle && !c.husk && Math.hypot(c.x - g.player.x, c.z - g.player.z) < 90) g.removeChar(c);
  };
  const sv = (await C('save')).save; // the whole battery's state comes back after these checks
  const was = { zombies: g.zombies.enabled, raiders: g.raiderTimer, convoyNext: g.convoy.next };
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.convoy.despawn?.(); g.convoy.next = 1e9;
  const vatRow = CL.vat('rust_haven');
  let car = null, trunkItem = 'canteen', pack0 = null;
  try {
    await check('clone: a pressing costs scrip and holds your skills as they were that hour (xp earned after is not in it)', async () => {
      if (g.player.inVehicle) g.exitVehicle(true);
      await C('teleport', vatRow.wake); await C('step', { seconds: 0.2 });
      const S = g.skillsSys;
      S.load({ lv: { ...S.lv, strength: 2, dexterity: 1 }, xp: { ...S.xp, strength: 3.5 } });
      g.cash = 1000; CL.bank = 0; CL.pressing = null;
      const h0 = CL.hours(), here = CL.vatHere()?.id;
      const r = await C('clone', { action: 'press' });
      const price = CL.price(vatRow), hours = CL.hours() - h0;
      const held = JSON.parse(JSON.stringify(CL.pressing.skills));
      S.gain('strength', 500); S.gain('dexterity', 500); // later practice
      const after = CL.pressing.skills;
      const ok = here === 'rust_haven' && r.ok && g.cash === 1000 - price && price === CLONE_RULES.price && held.lv.strength === 2 && held.lv.dexterity === 1 && held.xp.strength === 3.5 && after.lv.strength === 2 && S.lv.strength > 2 && Math.abs(hours - CLONE_RULES.pressHours) < 0.05;
      return ok ? true : JSON.stringify({ here, r, cash: g.cash, price, held, after: after.lv, now: S.lv, hours });
    });
    await check('clone: brine money comes out of the brine book each new day; unpaid past the grace days, the vat drains the pressing', async () => {
      const keep = JSON.parse(JSON.stringify(CL.pressing)), due = CL.due(), g0 = CLONE_RULES.graceDays;
      CL.bank = due; CL.owed = 0;
      await C('clone', { action: 'upkeep' }); const paid = CL.bank === 0 && CL.owed === 0 && !!CL.pressing;
      const owed = []; for (let d = 0; d < g0; d++) { await C('clone', { action: 'upkeep' }); owed.push(CL.owed); }
      const still = !!CL.pressing;
      await C('clone', { action: 'upkeep' });
      const drained = !CL.pressing && g.events.some((e) => e.type === 'pressingLost');
      CL.pressing = keep; CL.owed = 0; // the pressing back for the checks after
      return due === CLONE_RULES.upkeepPerDay && paid && owed.join() === Array.from({ length: g0 }, (_, i) => i + 1).join() && still && drained ? true : JSON.stringify({ due, paid, owed, still, drained });
    });
    await check('clone: dying wakes you in the vat with the pressing\'s skills, nothing on you but the loaner, brine-sick, the brine book untouched', async () => {
      // Kit up: armor, a canteen, the SMG and rounds, cash; a pickup parked beside you with something in the trunk.
      await C('teleport', STAGE); await C('step', { seconds: 0.2 }); quiet();
      g.gear.put('soft_vest');
      g.inventory.add(g.inventory.carried, 'canteen', 1);
      g.inventory.gainGun('smg'); g.inv.ammo.smg = 40;
      g.cash = 600; CL.bank = 75;
      car = g.vehiclesSys.spawn('pickup', STAGE.x + 6, STAGE.z + 2, 0, '#6a4a2a');
      g.inventory.add(g.inventory.trunk(car), trunkItem, 1); g.inventory.add(g.inventory.trunk(car), 'ammo_pistol', 24);
      g.lastVehicle = car;
      pack0 = g.inventory.worn;
      const pressed = JSON.parse(JSON.stringify(CL.pressing.skills.lv)), at = { x: g.player.x, z: g.player.z };
      const d = await C('clone', { action: 'die' });
      const p = g.player, N = g.needs, inv = g.inventory, wake = vatRow.wake;
      const kit = inv.carried.slots.map((s) => s.id).sort().join(',');
      const ok = d.alive && Math.hypot(p.x - wake.x, p.z - wake.z) < 2.5 && JSON.stringify(g.skillsSys.lv) === JSON.stringify(pressed)
        && kit === 'rag,water_bottle' && !inv.worn && Object.keys(g.gear.save().worn).length === 0 && g.inv.weapons.join() === 'pistol' && (g.inv.mag.pistol ?? 0) === 0
        && N.sick?.kind === 'brine' && Math.abs(N.sick.until - CL.hours() - CLONE_RULES.sickHours) < 0.2 && g.cash === 0 && CL.bank === 75 && !CL.pressing && p.hp <= p.maxHp * CLONE_RULES.wakeHp + 0.01
        && d.husk && Math.hypot(d.husk.x - at.x, d.husk.z - at.z) < 0.5;
      return ok ? true : JSON.stringify({ alive: d.alive, at: [r1(p.x), r1(p.z)], skills: g.skillsSys.lv, pressed, kit, worn: inv.worn, gear: g.gear.save().worn, guns: g.inv.weapons, sick: N.sick, cash: g.cash, bank: CL.bank, pressing: CL.pressing, husk: d.husk });
    });
    await check('clone: your husk keeps all you had where you fell, your car and its trunk beside it, both marked on the map', async () => {
      const h = CL.husks[CL.husks.length - 1], box = g.inventory.boxes.get(h.id), ids = new Set(box?.slots.map((s) => s.id));
      const v = g.vehicles.find((x) => x.id === car.id), trunk = g.inventory.trunks.get(car.id)?.slots.map((s) => s.id) ?? [];
      // The map: the big map draws the husk and the car (systems/clone.js drawMap through qol's layers), the minimap pins it.
      const marks = []; const ctx = { set strokeStyle(v) {}, set fillStyle(v) {}, set lineWidth(v) {}, set font(v) {}, set textAlign(v) {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, strokeRect(...a) { marks.push(['rect', ...a]); }, strokeText(t) { marks.push(['text', t]); }, fillText(t) { marks.push(['text', t]); } };
      CL.drawMap(ctx, (x, z) => [x, z]);
      g.qol.drawBigMap(); g.hud.drawMinimap(g.player.x, g.player.z, 0); // the real draws run without error with a husk on them
      const marked = marks.some((m) => m[1] === 'YOUR HUSK') && marks.some((m) => m[0] === 'text' && /YOUR PICKUP/.test(m[1]));
      const ok = box && ids.has('soft_vest') && ids.has('canteen') && ids.has('gun_smg') && ids.has('gun_pistol') && ids.has('ammo_smg') && (!pack0 || ids.has(pack0)) && h.cash === 600
        && h.car?.id === car.id && v && Math.hypot(v.x - car.x, v.z - car.z) < 0.5 && trunk.includes(trunkItem) && trunk.includes('ammo_pistol') && marked && h.where;
      return ok ? true : JSON.stringify({ items: [...ids], cash: h.cash, car: h.car, trunk, marked, marks: marks.slice(0, 6) });
    });
    await check('clone: the pickers work a husk on the clock, the best thing first, the same hours the same way', async () => {
      const h = CL.husks[CL.husks.length - 1], box = g.inventory.boxes.get(h.id), inv = g.inventory;
      const keep = { slots: box.slots.map((s) => ({ ...s })), cash: h.cash, lost: h.lost.slice(), pickedTo: h.pickedTo, day: g.society.day, time: g.sky.time, trunk: inv.trunk(car).slots.map((s) => ({ ...s })), stripped: h.stripped };
      const bestItem = Math.max(0, ...box.slots.map((s) => (ITEMS[s.id]?.value ?? 1) * s.n)), scripVal = h.cash * CLONE_RULES.pick.cashShare;
      const run = async () => { await C('clone', { action: 'pick', hours: 96 }); return JSON.stringify(h.lost.slice(keep.lost.length)); };
      const back = () => { box.slots = keep.slots.map((s) => ({ ...s })); h.cash = keep.cash; h.lost = keep.lost.slice(); h.pickedTo = keep.pickedTo; inv.trunk(car).slots = keep.trunk.map((s) => ({ ...s })); h.stripped = keep.stripped; g.society.day = keep.day; g.sky.time = keep.time; g.society.lastHour = null; };
      const a = await run(), first = h.lost.slice(keep.lost.length).find((x) => x.from !== 'trunk'); // the husk's own first loss
      // The best thing first: the pocket scrip if its share is worth the most, else the stack worth most.
      const firstBest = !!first && (first.what === 'scrip' ? scripVal >= bestItem : scripVal < bestItem && Math.abs((ITEMS[first.what]?.value ?? 1) * first.n - bestItem) < 1e-6);
      back();
      const b = await run();
      back();
      const ok = a === b && JSON.parse(a).length >= 1 && firstBest;
      return ok ? true : JSON.stringify({ a: JSON.parse(a).slice(0, 5), same: a === b, first, bestItem, scripVal, where: h.where });
    });
    await check('clone: a picker caught at your husk runs with what they took, and dropped it is on their body', async () => {
      const h = CL.husks[CL.husks.length - 1], inv = g.inventory, box = inv.boxes.get(h.id), PS = CLONE_RULES.pick.seen, odds = PS.odds;
      // Stage the last hour's pick (the stack worth most), then come within sight of the husk from out of range.
      let bi = 0; box.slots.forEach((s2, i) => { if ((ITEMS[s2.id]?.value ?? 1) * s2.n > (ITEMS[box.slots[bi].id]?.value ?? 1) * box.slots[bi].n) bi = i; });
      const taken = box.slots.splice(bi, 1)[0];
      h.lost.push({ what: taken.id, n: taken.n, hour: CL.hours() - 1 });
      PS.odds = 1;
      try {
        await C('teleport', { x: h.x + 160, z: h.z }); await C('step', { seconds: 0.6 });
        await C('teleport', { x: h.x + 60, z: h.z }); await C('step', { seconds: 0.6 });
      } finally { PS.odds = odds; }
      const pk = g.chars.find((c) => c.picker === h.id);
      const crouched = !!pk && pk.hold && pk.loot?.some((l) => l.what === taken.id) && Math.hypot(pk.x - h.x, pk.z - h.z) < 2;
      if (!pk) { box.slots.push(taken); return JSON.stringify({ pk: null, lost: h.lost.slice(-2) }); }
      await C('teleport', { x: h.x + 12, z: h.z }); await C('step', { seconds: 0.6 });
      const ran = !pk.hold && pk.flee > 0;
      const god = g.godMode; g.combat.damage(pk, 999, g.player, 1, 0, 'bullet'); g.godMode = god;
      await C('step', { seconds: 0.6 });
      const body = inv.boxes.get(`body:${pk.id}`), onBody = body?.slots.some((s2) => s2.id === taken.id);
      // Your thing back into the husk for the checks after (they read the husk whole).
      if (body) { const i = body.slots.findIndex((s2) => s2.id === taken.id); if (i >= 0) body.slots.splice(i, 1); }
      box.slots.push(taken); h.lost = h.lost.filter((l) => l.what !== taken.id || !l.carried);
      if (g.chars.includes(pk)) g.removeChar(pk); if (body) g.inventory.boxes.delete(body.id); // the picker's body out of the way of the next check
      return crouched && ran && onBody ? true : JSON.stringify({ crouched, ran, onBody, pk: { hold: pk.hold, flee: pk.flee, loot: pk.loot }, taken: taken.id });
    });
    await check('clone: reaching your husk you take your things back (the scrip, the vest, the guns, the pack), and the trunk is still yours', async () => {
      const h = CL.husks[CL.husks.length - 1];
      await C('teleport', { x: h.x - 1.2, z: h.z }); await C('step', { seconds: 0.6 }); // the side away from the car (a car in reach takes the prompt)
      const prompt = g.hud.el?.prompt?.textContent ?? '';
      const r = await C('clone', { action: 'reclaim' });
      const inv = g.inventory, carried = inv.carried.slots.map((s) => s.id);
      const ok = r.ok && g.cash === 600 && Object.values(g.gear.save().worn).includes('soft_vest') && g.inv.weapons.includes('smg') && inv.worn === pack0 && carried.includes('canteen') && g.inv.ammo.smg >= 40
        && inv.trunks.get(car.id)?.slots.some((s) => s.id === trunkItem) && /husk/i.test(prompt);
      return ok ? true : JSON.stringify({ r, cash: g.cash, worn: g.gear.save().worn, guns: g.inv.weapons, pack: inv.worn, carried, smg: g.inv.ammo.smg, prompt });
    });
    await check('clone: with no pressing you die flat - on a shard the character is over; locally it is flagged and a fresh drifter walks in', async () => {
      await C('teleport', STAGE); await C('step', { seconds: 0.2 }); quiet();
      CL.pressing = null;
      const lin0 = CL.lineage.length, shard = g.shard;
      // On a shard: gone for good, no waking.
      g.shard = { state: 'inworld', flush() {} };
      let shardOk = false;
      try {
        await C('clone', { action: 'die', wait: false });
        await C('step', { seconds: CLONE_RULES.wakeDelay + 1.5 });
        shardOk = !g.player.alive && CL.flat?.name && CL.lineage.length === lin0 + 1;
      } finally { g.shard = shard; }
      // Locally (the same death read again without the shard): flagged in the lineage, a fresh drifter at Rust Haven's clinic.
      const name0 = g.player.name; CL.flat = null; CL.lineage.length = lin0; g.respawnT = 0.01;
      await C('step', { seconds: 0.5 });
      const p = g.player, zero = Object.values(g.skillsSys.lv).every((v) => v === 0);
      const ok = shardOk && p.alive && CL.lineage.length === lin0 + 1 && CL.lastWake?.flat && !CL.lastWake.shard && p.name !== name0 && zero && g.cash === 0 && CL.pressing?.free
        && g.events.some((e) => e.type === 'diedFlat');
      return ok ? true : JSON.stringify({ shardOk, alive: p.alive, lineage: CL.lineage, last: CL.lastWake, name: [name0, p.name], skills: g.skillsSys.lv, cash: g.cash, pressing: CL.pressingView() });
    });
    await check("clone: a Florida start is pressed at Meridian's clone bay and, dying in Florida, comes up in Meridian's vat; the SALT LINE runs the husk run from its knot", async () => {
      const R = g.regions, was = { start: R.start, at: R.startedAt };
      try {
        R.start = 'florida';
        const placed = R.placeAtStart('florida'); // a new Florida game: Meridian's clinic door
        CL.pressing = null; CL.press(CL.startVat(), { free: true, force: true }); // what clone.start does for a new character
        const vat = CL.pressing?.vat;
        await C('step', { seconds: 0.5 }); quiet();
        const d = await C('clone', { action: 'die' });
        const pl = CL.vatPlace(CL.vat('meridian')), p = g.player;
        const near = Math.hypot(p.x - pl.wake.x, p.z - pl.wake.z);
        const inFlorida = g.streamer.W.regionOf(d.husk?.x ?? 0, d.husk?.z ?? 0)?.id === 'florida' && g.streamer.W.regionOf(p.x, p.z)?.id === 'florida';
        const drawn = CL.vatMeshes.some((m) => Math.hypot(m.position.x - pl.x, m.position.z - pl.z) < 0.5);
        // The husk run in Florida: Meridian's knot is a real pole on I-95, and a punch north sleeps you to Daytona.
        await C('travel', { action: 'goto', node: 'meridian_knot', dir: 'east' });
        g.cash = 200;
        const b = await C('travel', { action: 'buy', line: 'salt', to: 'daytona' });
        const r = await C('travel', { action: 'skip', seed: 1 });
        const day = TR.node('daytona'), atDaytona = r.ok && r.trip?.to === 'daytona' && Math.hypot(p.x - day.poles[1].x, p.z - day.poles[1].z) < 4;
        const ok = placed && vat === 'meridian' && d.alive && near < 2.5 && CL.lastWake?.vat === 'meridian' && inFlorida && drawn && b.ok && atDaytona;
        return ok ? true : JSON.stringify({ placed, vat, alive: d.alive, near: r1(near), wake: CL.lastWake, inFlorida, drawn, buy: b.ok ?? b.error, trip: r.trip ?? r.error });
      } finally { R.start = was.start; R.startedAt = was.at; }
    });
    await check('travel: a punch takes you pole to pole on the trundle in real time, on the game clock, the fare paid', async () => {
      if (g.player.inVehicle) g.exitVehicle(true);
      await C('travel', { action: 'goto', node: 'iron_crossing', dir: 'east' }); quiet();
      g.cash = 500;
      const L = LINES.find((l) => l.id === 'sun');
      const b = await C('travel', { action: 'buy', line: 'sun', to: 'haven' });
      const fare = Math.round(L.fare.base + L.fare.perMile * Math.abs(TR.node('haven').s - TR.node('iron_crossing').s) / 1609.344);
      const paid = g.cash === 500 - fare && b.punch?.fare === fare;
      const w = await C('travel', { action: 'wait', dir: 'east' });
      const atPole = await (async () => { for (let t = 0; t < 70; t += 0.5) { if (TR.bus?.state === 'dwell' && TR.bus.next === L.stops.indexOf('iron_crossing')) return true; await C('step', { seconds: 0.5 }); } return false; })();
      const v = TR.busVehicle();
      if (v) await C('teleport', { x: v.x + Math.cos(v.h) * 2.2, z: v.z - Math.sin(v.h) * 2.2 });
      const bd = await C('travel', { action: 'board', force: true });
      const h0 = CL.hours();
      const r = await C('travel', { action: 'ride', seconds: 90 });
      const hours = CL.hours() - h0, pole = TR.node('haven').poles[1];
      const ok = paid && w.ok && atPole && bd.aboard && r.arrived && r.trip?.to === 'haven' && Math.hypot(g.player.x - pole.x, g.player.z - pole.z) < 4 && hours > 0.15 && hours < 2 && !TR.punches.length && !g.player.inVehicle;
      return ok ? true : JSON.stringify({ paid, cash: g.cash, fare, w, atPole, bus: TR.view().bus, bd, r, hours: r1(hours) });
    });
    await check('travel: sleeping through a trip runs the clock the whole way (the wait and the road) and the road can roll an event', async () => {
      await C('travel', { action: 'goto', node: 'haven', dir: 'west' }); quiet();
      g.cash = 800;
      const L = LINES.find((l) => l.id === 'sun'), i = L.stops.indexOf('haven'), j = L.stops.indexOf('la_knot');
      const now = CL.hours(), nb = TR.nextBus(L, i, -1, now), expect = (nb.at - now) + TR.busHours(L, i, j, -1);
      const miles = TR.milesBetween(L, 'haven', 'la_knot');
      // A seed that rolls something on this road (the roll is seeded: the same seed, the same night, the same thing).
      let seed = null, ev = null;
      for (let s = 1; s < 600 && !ev; s++) { const e = TR.roll(L, miles, nb.at, s); if (e && e.id !== 'toll') { seed = s; ev = e; } }
      let quietSeed = null; for (let s = 1; s < 600 && quietSeed === null; s++) if (!TR.roll(L, miles, nb.at, s)) quietSeed = s;
      await C('travel', { action: 'buy', line: 'sun', to: 'la_knot' });
      const cash0 = g.cash, h0 = CL.hours();
      const r = await C('travel', { action: 'skip', seed });
      const took = CL.hours() - h0, T = r.trip, la = TR.node('la_knot').poles[-1];
      const evOk = T.event?.id === ev.id && Math.abs(took - (expect + (ev.delay ?? 0))) < 0.05 && (!ev.cashShare || g.cash < cash0) && (!ev.hurt || g.player.hp < g.player.maxHp);
      const ok = r.ok && evOk && Math.hypot(g.player.x - la.x, g.player.z - la.z) < 4 && quietSeed !== null && !TR.roll(L, miles, nb.at, quietSeed) && T.waitHours >= 0 && T.rideHours > 30;
      return ok ? true : JSON.stringify({ ev, seed, trip: T, took: r1(took), expect: r1(expect), cash: [cash0, g.cash], at: [r1(g.player.x), r1(g.player.z)], la });
    });
    await check('travel: Five City Air flies two of its cities for the fare its row says; past the dust you wait in the arrivals hall and fly back onto the map', async () => {
      await C('travel', { action: 'goto', node: 'la_field' });
      g.cash = 4000;
      const A = LINES.find((l) => l.id === 'air'), row = A.flights.find((f) => f.from === 'la_field' && f.to === 'chi_field'), back = A.flights.find((f) => f.from === 'chi_field' && f.to === 'la_field');
      const b = await C('travel', { action: 'buy', line: 'air', to: 'chi_field' });
      const paid = g.cash === 4000 - row.fare;
      const h0 = CL.hours(), wait = TR.nextFlight(row, h0) - h0;
      const r = await C('travel', { action: 'skip' });
      const held = TR.away?.node === 'chi_field' && TR.ui.open && TR.ui.model?.hall && Math.abs(CL.hours() - h0 - (wait + row.hours)) < 0.05;
      const cash1 = g.cash;
      const b2 = await C('travel', { action: 'buy', line: 'air', to: 'la_field' });
      const r2 = await C('travel', { action: 'skip' });
      const field = TR.node('la_field').counter;
      const home = !TR.away && !TR.ui.open && Math.hypot(g.player.x - field.x, g.player.z - field.z) < 4 && cash1 - g.cash >= back.fare && r2.trip.to === 'la_field';
      return paid && held && home && b.punch.fare === row.fare && b2.punch.fare === back.fare ? true : JSON.stringify({ paid, held, home, away: TR.away, r: r.trip, r2: r2.trip, cash: g.cash, ui: TR.ui.open });
    });
    await check('clone + travel: a pressing, the brine book, a husk, punches, brine sickness and the arrivals hall all survive a save and a load', async () => {
      if (!CL.husks.some((h) => !h.gone)) { await C('travel', { action: 'goto', node: 'la_knot' }); await C('clone', { action: 'die' }); } // a husk to carry over (only= runs start without one)
      await C('clone', { action: 'press', vat: 'los_angeles', force: true, free: true });
      CL.bank = 321; g.needs.sick = { kind: 'brine', until: CL.hours() + 7 };
      await C('travel', { action: 'buy', line: 'sun', to: 'furnace', from: 'la_knot', force: true });
      TR.hold('ny_field', { why: 'staged' });
      const before = { pressing: CL.pressingView(), bank: CL.bank, husks: CL.view().husks.map((h) => ({ id: h.id, items: h.items.length, cash: h.cash, car: h.car?.id })), punches: TR.punches.map((p) => `${p.line}:${p.from}>${p.to}`), away: TR.away?.node, sick: g.needs.sick?.kind };
      const s = (await C('save')).save;
      // Mess it all up, then load.
      CL.pressing = null; CL.bank = 0; CL.husks = []; TR.punches = []; TR.leaveHall(); g.needs.sick = null;
      await C('load', { save: s });
      const after = { pressing: CL.pressingView(), bank: CL.bank, husks: CL.view().husks.map((h) => ({ id: h.id, items: h.items.length, cash: h.cash, car: h.car?.id })), punches: TR.punches.map((p) => `${p.line}:${p.from}>${p.to}`), away: TR.away?.node, sick: g.needs.sick?.kind };
      const same = JSON.stringify({ ...before, pressing: { ...before.pressing, staleHours: 0 } }) === JSON.stringify({ ...after, pressing: { ...after.pressing, staleHours: 0 } });
      const hallOpen = TR.ui.open && TR.ui.model?.hall;
      TR.leaveHall();
      return same && hallOpen && after.pressing?.vat === 'los_angeles' && after.husks.length >= 1 ? true : JSON.stringify({ before, after, hallOpen });
    });
    await check('travel: the trundle at its pole, the board and the vat stay inside the draw-call budget', async () => {
      await C('travel', { action: 'goto', node: 'haven', dir: 'east' });
      const L = LINES.find((l) => l.id === 'sun');
      if (!TR.bus) TR.spawnBus(L, L.stops.indexOf('haven'), 1, { atStop: true });
      await C('step', { seconds: 0.6 });
      g.render(0);
      const pr = await C('perf');
      const seen = TR.boardMesh?.visible && TR.poleMesh?.visible && !!TR.busVehicle();
      TR.despawnBus();
      return pr.drawCalls < 150 && seen ? true : JSON.stringify({ drawCalls: pr.drawCalls, seen, board: TR.boardMesh?.visible, poles: TR.poleMesh?.count });
    });
  } finally {
    if (TR.ui.open) TR.ui.close();
    TR.leaveHall(); TR.despawnBus();
    if (car && g.vehicles.includes(car)) { g.vehiclesSys.remove(car); g.inventory.trunks.delete(car.id); }
    g.zombies.enabled = was.zombies; g.raiderTimer = was.raiders; g.convoy.next = was.convoyNext;
    await C('load', { save: sv });
    if (!g.player.alive) { g.respawnT = 0; await C('step', { seconds: 0.2 }); }
  }
}
