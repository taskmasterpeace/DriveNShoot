// VEHICLES V2 slice 3, CAR DOORS (Robert 11-12: "cars hold the doors open, and when you get in, give him a second to
// close the door, I want to be able to leave the door open"; docs/status/vehicles-v2.md on docs/web-veh-status):
// the `door` command and selftest checks. Rows and rules: data/cardoors.js; the system: systems/cardoors.js.
import { DOORS, DOOR_TYPES } from '../data/cardoors.js';
import { PART } from '../systems/vehiclebodies.js';

const r2 = (v) => Math.round(v * 100) / 100;

export function vehDoorsCommands(api, need) {
  const g = api.g;
  return {
    door: {
      group: 'vehicle', desc: 'CAR DOORS: view a car\'s doors (id=, default the one you are in or last drove), or open=true|false part=doorL|doorR|doorL2|doorR2 to swing one (testing).',
      args: { id: { type: 'string' }, part: { type: 'string', default: 'doorL', enum: ['doorL', 'doorR', 'doorL2', 'doorR2'] }, open: { type: 'boolean' } },
      run: async ({ id, part, open }) => {
        const v = id ? api.findVeh(id) : g.player.inVehicle ?? g.lastVehicle;
        need(v, `no vehicle ${id ?? '(in or last)'}`);
        if (open !== undefined) need(g.carDoors.set(v, part, open), `a ${v.name} has no ${part} (an open body, a bike, a boat, or it was torn off)`);
        return { id: v.id, type: v.type, doors: g.carDoors.view(v), has: Object.fromEntries(['doorL', 'doorR', 'doorL2', 'doorR2'].map((p) => [p, g.carDoors.has(v, p)])) };
      },
    },
  };
}

export async function vehDoorsChecks(api, check, C) {
  const g = api.g, D = () => g.carDoors, I = g.input;
  const made = [];
  const spawn = async (type, x, z, h = 0) => { const r = await C('spawnVehicle', { type, x, z, heading: h }); const v = g.vehicles.find((q) => q.id === r.id); made.push(v); return v; };
  const off = () => { I.down.delete('KeyF'); I.phys.delete('KeyF'); I.down.delete('KeyW'); if (g.player.inVehicle) g.exitVehicle(true); for (const v of made.splice(0)) if (g.vehicles.includes(v)) g.vehiclesSys.remove(v); };
  const tapF = async () => { I.down.add('KeyF'); I.pressed.add('KeyF'); I.phys.add('KeyF'); I.physHit.add('KeyF'); await api._step(1); I.down.delete('KeyF'); I.phys.delete('KeyF'); };
  const upF = () => { I.down.delete('KeyF'); I.phys.delete('KeyF'); };
  const pressF = async () => { I.down.add('KeyF'); I.pressed.add('KeyF'); I.phys.add('KeyF'); I.physHit.add('KeyF'); await api._step(1); }; // and keep holding (as the controls read it)
  const a = (v, p = 'doorL') => v.doors?.[p]?.a ?? 0;
  // How far the driver's door panel's back edge stands out from the body's side right now (the mesh itself).
  const swingOut = (v, part = 'doorL') => {
    const pa = v.mesh.geometry.attributes.part, pos = v.mesh.geometry.attributes.position, id = PART[part];
    let mx = 0; for (let i = 0; i < pa.count; i++) if (pa.array[i] === id) mx = Math.max(mx, Math.abs(pos.array[i * 3]));
    return mx - v.wid / 2;
  };
  const clear = { x: 0, z: -70 };
  const beside = async (v) => { const p = g.seats.doorPos(v, 0, 0.9); await C('teleport', { x: p.x, z: p.z }); await api._step(2); };

  await check('car doors: tap F at a sedan - you are in, the driver\'s door swings open (the panel itself stands out from the side) and shuts a beat after you sit', async () => {
    try {
      await C('teleport', clear);
      const v = await spawn('sedan', clear.x + 6, clear.z, 0);
      await beside(v);
      const rest = swingOut(v); // the panel shut (its mirror and handle stand a little proud of the body)
      await tapF();
      const inCar = g.player.inVehicle === v;
      await api._step(Math.round(DOORS.swing * 60) + 2);
      const opened = a(v), out = swingOut(v);
      await api._step(Math.round((DOORS.beat + DOORS.swing) * 60) + 6);
      const shut = a(v), outShut = swingOut(v);
      return inCar && opened > DOORS.open * 0.9 && out - rest > 0.4 && shut === 0 && Math.abs(outShut - rest) < 0.02 ? true : JSON.stringify({ inCar, rest: r2(rest), opened: r2(opened), out: r2(out), shut: r2(shut), outShut: r2(outShut) });
    } finally { off(); }
  });

  await check('car doors: hold F through the beat and the door stays open (and still is three seconds on); F again gets you out through it', async () => {
    try {
      await C('teleport', clear);
      const v = await spawn('pickup', clear.x + 6, clear.z, 0);
      await beside(v);
      await pressF();
      await api._step(Math.round((DOORS.swing + DOORS.beat) * 60) + 6);
      upF();
      await api._step(180);
      const held = a(v), left = D().stats.leftOpen;
      await tapF(); await api._step(10);
      const out = g.player.inVehicle === null;
      return held > DOORS.open * 0.9 && left > 0 && out ? true : JSON.stringify({ held: r2(held), left, out });
    } finally { off(); }
  });

  await check('car doors: get out and the door is left open; drive off with it open and past a jog the wind slams it shut', async () => {
    try {
      await C('teleport', clear);
      const v = await spawn('sedan', clear.x + 6, clear.z, Math.PI / 2);
      await beside(v);
      await tapF(); await api._step(150); // in, shut
      await tapF(); await api._step(300); // out: left open, five seconds
      const leftOpen = a(v) > DOORS.open * 0.9 && v.doors.doorL.want > 0;
      // In again holding F (it stays open), then drive.
      await beside(v);
      await pressF(); await api._step(Math.round((DOORS.swing + DOORS.beat) * 60) + 6); upF();
      const openDriving = a(v) > DOORS.open * 0.9;
      const s0 = D().stats.slammed;
      I.down.add('KeyW'); let fast = 0;
      for (let f = 0; f < 240 && a(v) > 0; f++) { await api._step(1); fast = Math.max(fast, Math.hypot(v.vx, v.vz)); }
      I.down.delete('KeyW');
      return leftOpen && openDriving && a(v) === 0 && D().stats.slammed > s0 && fast > DOORS.slamSpeed ? true : JSON.stringify({ leftOpen, openDriving, a: r2(a(v)), fast: r2(fast) });
    } finally { off(); }
  });

  await check('car doors: a side hit on an open door tears it off its hinges (a shut one dents and stays on)', async () => {
    try {
      await C('teleport', clear);
      const v = await spawn('sedan', clear.x + 6, clear.z, 0), w = await spawn('sedan', clear.x - 6, clear.z, 0);
      D().set(v, 'doorL', true); D().set(w, 'doorL', false);
      await api._step(30);
      // The damage system's own entry for a crash (what collision calls): a hit on each car's left side.
      for (const c of [v, w]) { const sx = c.x + Math.cos(c.h) * c.wid * 0.6, sz = c.z - Math.sin(c.h) * c.wid * 0.6; g.vehDamage.hit(c, sx, sz, 9, 'crash'); }
      await api._step(10);
      return v.dmg.off.doorL && !w.dmg.off.doorL && !v.doors?.doorL ? true : JSON.stringify({ openOff: !!v.dmg.off.doorL, shutOff: !!w.dmg.off.doorL, zones: [v.dmg.zones.left, w.dmg.zones.left] });
    } finally { off(); }
  });

  await check('car doors: an NPC getting into the driver\'s seat opens and shuts their door too; a bike, a buggy and a waterbike have no doors to swing', async () => {
    try {
      await C('teleport', clear);
      const v = await spawn('sedan', clear.x + 8, clear.z, 0);
      const c = g.spawnRaider(clear.x + 8, clear.z - 3, Math.random, 'pistol');
      g.seats.board(c, v, 0);
      await api._step(Math.round(DOORS.swing * 60) + 2);
      const opened = a(v);
      await api._step(Math.round((DOORS.beat + DOORS.swing) * 60) + 6);
      const shut = a(v);
      g.seats.leave(c, true); g.removeChar?.(c);
      const none = [];
      for (const t of ['bike', 'buggy', 'jetski']) { const b = await spawn(t, clear.x - 10, clear.z + made.length * 4, 0); if (D().has(b, 'doorL') || D().has(b, 'doorR')) none.push(t); }
      return opened > DOORS.open * 0.9 && shut === 0 && !none.length ? true : JSON.stringify({ opened: r2(opened), shut, hasDoors: none });
    } finally { off(); }
  });

  await check('car doors: the open doors ride the multiplayer presence as bits and swing open on a friend\'s ghost car', async () => {
    try {
      await C('teleport', clear);
      const v = await spawn('sedan', clear.x + 6, clear.z, 0), ghost = await spawn('sedan', clear.x - 6, clear.z, 0);
      D().set(v, 'doorL', true); D().set(v, 'doorR', true);
      await api._step(30);
      const bits = D().bits(v);
      D().applyBits(ghost, bits); await api._step(30);
      const both = a(ghost, 'doorL') > DOORS.open * 0.9 && a(ghost, 'doorR') > DOORS.open * 0.9;
      D().applyBits(ghost, 0); await api._step(30);
      return bits === 3 && both && a(ghost, 'doorL') === 0 ? true : JSON.stringify({ bits, both, after: r2(a(ghost, 'doorL')) });
    } finally { off(); }
  });

  await check('car doors: every body with hinged doors swings each one round its pillar (the front edge stays put within 2 cm, the back edge swings out); the APC skirts and bins and the van sliding door are not doors', async () => {
    const bad = [];
    try {
      await C('teleport', clear);
      let k = 0;
      for (const [type, parts] of Object.entries(DOOR_TYPES)) {
        const v = await spawn(type, clear.x + (k % 3) * 14 - 14, clear.z + Math.floor(k / 3) * 14 + 8, 0); k++;
        for (const part of parts) {
          const hg = D().hingeOf(v, part);
          if (!hg) { bad.push(`${type}.${part}: no hinge`); continue; }
          const pa = v.mesh.geometry.attributes.part, pos = v.mesh.geometry.attributes.position, base = v.basePos, id = PART[part];
          D().set(v, part, true); await api._step(Math.round(DOORS.swing * 60) + 4);
          let pillar = 0, swing = 0;
          for (let i = 0; i < pa.count; i++) {
            if (pa.array[i] !== id) continue;
            const dx = pos.array[i * 3] - base[i * 3], dz = pos.array[i * 3 + 2] - base[i * 3 + 2], m = Math.hypot(dx, dz);
            if (Math.abs(Math.abs(base[i * 3]) - Math.abs(hg.hx)) < 0.011 && Math.abs(base[i * 3 + 2] - hg.hz) < 0.011) pillar = Math.max(pillar, m);
            swing = Math.max(swing, m);
          }
          if (pillar > 0.02 || swing < 0.4) bad.push(`${type}.${part}: pillar ${r2(pillar)} swing ${r2(swing)}`);
          D().set(v, part, false); await api._step(Math.round(DOORS.swing * 60) + 4);
        }
      }
      const apc = await spawn('apc', clear.x + 30, clear.z, 0), van = made.find((q) => q.type === 'van');
      for (const p of ['doorL', 'doorR', 'doorL2', 'doorR2']) if (D().has(apc, p)) bad.push(`apc has ${p}`);
      if (van && D().has(van, 'doorR2')) bad.push('van doorR2 (sliding) swings');
      return bad.length ? JSON.stringify(bad) : true;
    } finally { off(); }
  });
}
