// VEHICLES V2 slice 2, GUNS ON BOATS (Robert 11-12: "we do need guns on boats"; docs/status/vehicles-v2.md on
// docs/web-veh-status): selftest checks. runSelfTest() in api.js calls vehBoatGunsChecks.
// Rows: data/workshop.js CHASSIS (gunboat, barge, airboat, skiff, jetski) and BOAT_KIT (the raider gunboat's own .50).
import { CHASSIS, MOUNT_WEAPONS, BOAT_KIT } from '../data/workshop.js';
import { LAKE } from '../world/water.js';

const r1 = (v) => Math.round(v * 10) / 10;
const BOATS = ['gunboat', 'barge', 'airboat', 'skiff', 'jetski'];

export async function vehBoatGunsChecks(api, check, C) {
  const g = api.g, G = g.garage;
  const made = [];
  const spawn = async (type, x, z, h = 0, ai) => { const r = await C('spawnVehicle', { type, x, z, heading: h, ...(ai ? { ai } : {}) }); const v = g.vehicles.find((q) => q.id === r.id); made.push(v); return v; };
  const off = () => { if (g.player.inVehicle) g.exitVehicle(true); for (const v of made.splice(0)) if (g.vehicles.includes(v)) g.vehiclesSys.remove(v); g.input.mouse.physRight = false; g.input.mouse.right = false; g.aimOverride = null; };

  await check('boat guns: every powered boat can be worked on - a machine gun goes on each one\'s bow (the gunboat\'s on its pintle), plate on its topsides, none below the waterline', async () => {
    const out = {};
    for (const t of BOATS) {
      const v = await spawn(t, LAKE.x, LAKE.z - 20 - made.length * 6);
      const face = t === 'gunboat' ? 'top' : 'front';
      out[t] = { chassis: !!G.chassis(v), mg: G.canMount(v, face, 'mg1') ?? 'ok', under: CHASSIS[t].faces.under };
    }
    off();
    const bad = Object.entries(out).filter(([, o]) => !o.chassis || o.mg !== 'ok' || o.under !== 0);
    return bad.length ? JSON.stringify(out) : true;
  });

  await check('boat guns: the raider gunboat on the lake carries its own .50 on the foredeck pintle with a belt in it (it came on the water full), drawn where the sandbags are', async () => {
    const gb = g.vehicles.find((v) => v.type === 'gunboat' && v.ai === 'boatPatrol' && !v.dead);
    if (!gb) return 'no lake gunboat';
    const m = gb.mounts?.top, kit = BOAT_KIT.gunboat.top;
    const at = CHASSIS.gunboat.mounts.top.at;
    return m?.kind === kit && m.ammo > 0 && m.ammo <= MOUNT_WEAPONS[kit].mag && at && at[2] > 0 ? true : JSON.stringify({ mounts: gb.mounts, at });
  });

  await check('boat guns: the lake gunboat opens up on a player in a boat - its deck gun fires (the belt runs down) and the airboat takes hits', async () => {
    const gb = g.vehicles.find((v) => v.type === 'gunboat' && v.ai === 'boatPatrol' && !v.dead);
    if (!gb?.mounts?.top) return 'no armed lake gunboat';
    const ammo0 = gb.mounts.top.ammo, saved = { x: gb.x, z: gb.z, h: gb.h, hp: gb.hp };
    const god0 = g.godMode;
    let crew = null;
    try {
      g.godMode = true;
      // Staged (the documented exception): if an earlier check left it without a man at the wheel, a raider takes it.
      if (!gb.occ?.[0]?.alive) { crew = g.spawnRaider(gb.x, gb.z, Math.random, 'smg'); if (crew) g.seats.board(crew, gb, 0); }
      gb.mounts.top.ammo = Math.max(ammo0, 20); const belt0 = gb.mounts.top.ammo;
      // Staged (the documented exception): the player in an airboat 30 m off the gunboat's bow, on open water.
      const ab = await spawn('airboat', gb.x + Math.sin(gb.h) * 30, gb.z + Math.cos(gb.h) * 30, gb.h + Math.PI);
      g.enterVehicle(ab);
      const hp0 = ab.hp;
      for (let f = 0; f < 6 * 60; f++) { await api._step(1); if (gb.mounts.top.ammo < belt0 - 3 && ab.hp < hp0) break; }
      const spent = belt0 - gb.mounts.top.ammo, hurt = hp0 - ab.hp;
      return spent > 0 && hurt > 0 ? true : JSON.stringify({ spent, hurt: r1(hurt), d: r1(Math.hypot(ab.x - gb.x, ab.z - gb.z)), driver: !!gb.driver, ai: gb.ai });
    } finally {
      off(); g.godMode = god0; if (crew) { if (crew.inVehicle) g.seats.leave?.(crew); g.removeChar?.(crew); }
      Object.assign(gb, { x: saved.x, z: saved.z, h: saved.h, hp: saved.hp, vx: 0, vz: 0 }); gb.mounts.top.ammo = ammo0;
    }
  });

  await check('boat guns: at the gunboat\'s wheel, the right mouse button swings the pintle gun round and fires it where you aim (behind you too)', async () => {
    try {
      const v = await spawn('gunboat', LAKE.x - 10, LAKE.z + 10, 0);
      G.setMount(v, 'top', 'hmg');
      g.enterVehicle(v);
      const a0 = v.mounts.top.ammo;
      g.aimOverride = { x: v.x, z: v.z - 25 }; // aim dead astern (the mouse's point, held)
      g.input.mouse.physRight = true; g.input.mouse.right = true;
      await api._step(40);
      g.input.mouse.physRight = false; g.input.mouse.right = false;
      const spent = a0 - v.mounts.top.ammo, yaw = v.mounts.top.yaw;
      const astern = Math.abs(Math.atan2(Math.sin(yaw - (v.h + Math.PI)), Math.cos(yaw - (v.h + Math.PI))));
      return spent > 0 && astern < 0.3 ? true : JSON.stringify({ spent, yaw: r1(yaw), h: r1(v.h), astern: r1(astern) });
    } finally { off(); }
  });
}
