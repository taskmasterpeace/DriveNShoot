// VEHICLES V2 slice 4, CHAIN TOWING ON FOOT (Robert 11-12: "tow stuff: drive one vehicle up to another, get out, walk up
// to the back, if you got a chain you can do it"; docs/status/vehicles-v2.md on docs/web-veh-status): selftest checks.
// The rows: data/towing.js TOW_FOOT; the verbs: systems/towing.js footSpot / footKey / footDo / footTick.
import { LINES, TOW_FOOT } from '../data/towing.js';

const r1 = (v) => Math.round(v * 10) / 10;

export async function vehChainChecks(api, check, C) {
  const g = api.g, T = () => g.towing, I = g.input, inv = () => g.inventory;
  const made = [];
  let pack = null, cap0 = 0;
  const roomy = () => { if (pack) return; pack = inv().carried.slots.splice(0); cap0 = inv().carried.cap; inv().carried.cap = Math.max(cap0, 200); inv().changed?.(); };
  const off = () => {
    I.down.delete('KeyE'); I.down.delete('KeyW');
    if (T().carry) T().dropCarry('back in your pack');
    for (const l of [...T().links]) if (made.includes(l.a) || made.includes(l.b)) T().release(l, 'test');
    if (g.player.inVehicle) g.exitVehicle(true);
    for (const v of made.splice(0)) if (g.vehicles.includes(v)) g.vehiclesSys.remove(v);
    if (pack) { inv().carried.slots.splice(0, inv().carried.slots.length, ...pack); inv().carried.cap = cap0; pack = null; inv().changed?.(); }
  };
  const spawn = async (type, x, z, h = 0) => { const r = await C('spawnVehicle', { type, x, z, heading: h }); const v = g.vehicles.find((q) => q.id === r.id); made.push(v); return v; };
  // Walk on held keys to a world point (the real input; staging only where the documented exception allows).
  const walkTo = async (x, z, tol = 0.6) => {
    for (let f = 0; f < 600; f++) {
      const dx = x - g.player.x, dz = z - g.player.z;
      if (Math.hypot(dx, dz) < tol) break;
      g.autopilot = null; g.driveOverride = null;
      const keys = [];
      if (dz < -0.3) keys.push('KeyW'); if (dz > 0.3) keys.push('KeyS'); if (dx < -0.3) keys.push('KeyA'); if (dx > 0.3) keys.push('KeyD');
      for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) I.down.delete(k);
      for (const k of keys) I.down.add(k);
      await api._step(1);
    }
    for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) I.down.delete(k);
    await api._step(2);
  };
  const holdE = async (sec) => { I.down.add('KeyE'); I.pressed.add('KeyE'); try { await api._step(Math.round(sec * 60)); } finally { I.down.delete('KeyE'); } await api._step(2); };
  const endPoint = (v, end, out = 0.9) => { const o = end > 0 ? v.len / 2 + out : -(v.len / 2 + out); return { x: v.x + Math.sin(v.h) * o, z: v.z + Math.cos(v.h) * o }; };
  const clear = { x: 0, z: -70 };

  await check('chain towing: on foot with a tow chain - walk to the pickup\'s tail, hold E: one end is on; walk the free end to the dead sedan\'s nose, hold E: the two are chained; drive off and the sedan follows', async () => {
    try {
      roomy();
      inv().add(inv().carried, 'tow_chain', 1);
      const chains0 = inv().carried.count('tow_chain');
      // Staged: the truck, and a dead car 6 m behind it nose-on (the car you came to fetch).
      const truck = await spawn('pickup', clear.x, clear.z, Math.PI); // facing -z: its tail toward +z
      const dead = await spawn('sedan', clear.x, clear.z + truck.len / 2 + 3.6 + 2.4, Math.PI); // its nose toward the truck's tail
      dead.fuel = 0;
      await C('teleport', { x: clear.x + 3, z: clear.z }); await api._step(4);
      const tail = endPoint(truck, -1); await walkTo(tail.x, tail.z);
      const p1 = T().footSpot(g.player);
      await holdE(TOW_FOOT.hookTime + 0.2);
      const carrying = !!T().carry && T().carry.v === truck && inv().carried.count('tow_chain') === chains0 - 1;
      const nose = endPoint(dead, 1); await walkTo(nose.x, nose.z);
      const p2 = T().footSpot(g.player);
      await holdE(TOW_FOOT.hookTime + 0.2);
      const link = T().links.find((l) => l.a === truck && l.b === dead);
      // Drive the truck away (F into it, W held): the sedan comes too.
      g.enterVehicle(truck); await api._step(2);
      const d0 = Math.hypot(dead.x - clear.x, dead.z - clear.z);
      I.down.add('KeyW'); await api._step(180); I.down.delete('KeyW');
      const moved = Math.hypot(dead.x - clear.x, dead.z - clear.z) - d0, gap = Math.hypot(truck.x - dead.x, truck.z - dead.z);
      const ok = p1?.verb === 'hook' && carrying && p2?.verb === 'join' && !!link && link.kind === 'chain' && !T().carry && Math.abs(moved) > 4 && gap < truck.len / 2 + dead.len / 2 + LINES.chain.len + 1.5;
      return ok ? true : JSON.stringify({ p1: p1?.verb, carrying, p2: p2?.verb, link: !!link, moved: r1(moved), gap: r1(gap) });
    } finally { off(); }
  });

  await check('chain towing: no chain, no hook (the prompt says what you need); a carried end is a leash - you can\'t walk further than the chain; E at a hooked end unhooks it and the chain comes back to your pack', async () => {
    try {
      roomy();
      const a = await spawn('sedan', clear.x, clear.z, 0);
      const tail = endPoint(a, -1);
      await C('teleport', { x: tail.x + 2, z: tail.z }); await api._step(2); await walkTo(tail.x, tail.z);
      const none = T().footSpot(g.player);
      await holdE(TOW_FOOT.hookTime + 0.2);
      const noHook = !T().carry;
      inv().add(inv().carried, 'tow_chain', 1);
      await holdE(TOW_FOOT.hookTime + 0.2);
      const hooked = !!T().carry;
      // Walk straight away from it for 3 s: the chain stops you.
      I.down.add('KeyS'); await api._step(180); I.down.delete('KeyS'); await api._step(2);
      const A = T().anchor(a, -1, { x: 0, z: 0 }), far = Math.hypot(g.player.x - A.x, g.player.z - A.z);
      // Back to the hooked end: E takes it off; the chain is back in the pack.
      await walkTo(tail.x, tail.z);
      const back = T().footSpot(g.player);
      await holdE(TOW_FOOT.hookTime + 0.2);
      const ok = none?.verb === 'none' && /chain or rope/.test(none.text) && noHook && hooked && far <= LINES.chain.len + TOW_FOOT.leash + 0.05 && back?.verb === 'drop' && !T().carry && inv().carried.count('tow_chain') === 1;
      return ok ? true : JSON.stringify({ none: none?.text, noHook, hooked, far: r1(far), back: back?.verb, carry: !!T().carry, chains: inv().carried.count('tow_chain') });
    } finally { off(); }
  });

  await check('chain towing: a car chained on foot unhooks on foot - E at the towed car\'s nose takes the chain off and back to your pack', async () => {
    try {
      roomy();
      inv().add(inv().carried, 'tow_rope', 1);
      const a = await spawn('pickup', clear.x, clear.z, Math.PI), b = await spawn('sedan', clear.x, clear.z + a.len / 2 + b0(), Math.PI);
      function b0() { return 3.6 + 2.4; }
      let tail = endPoint(a, -1); await C('teleport', { x: tail.x + 2, z: tail.z }); await walkTo(tail.x, tail.z); await holdE(TOW_FOOT.hookTime + 0.2);
      const nose = endPoint(b, 1); await walkTo(nose.x, nose.z); await holdE(TOW_FOOT.hookTime + 0.2);
      const link = T().links.find((l) => l.a === a && l.b === b), kind = link?.kind;
      const s = T().footSpot(g.player);
      await holdE(TOW_FOOT.hookTime + 0.2);
      const gone = !T().links.includes(link);
      return kind === 'rope' && s?.verb === 'unhook' && gone && inv().carried.count('tow_rope') === 1 ? true : JSON.stringify({ kind, s: s?.verb, gone, ropes: inv().carried.count('tow_rope') });
    } finally { off(); }
  });
}
