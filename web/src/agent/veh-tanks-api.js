// VEHICLES V2 slice 8, TANKS (Robert 11-12: "old tanks and new tanks"; docs/status/vehicles-v2.md on docs/web-veh-status):
// the `tank` command and selftest checks. Rows: data/tanks.js; the system: systems/tanks.js.
import { VEHICLES } from '../systems/vehicles.js';
import { CHASSIS, MOUNT_WEAPONS } from '../data/workshop.js';
import { ITEMS } from '../data/items.js';
import { MB_LOOT } from '../data/milbases.js';
import { TANK_ROWS, TANK_GUNS, TANKS_PLACED, validateTanks } from '../data/tanks.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function vehTanksCommands(api, need) {
  const g = api.g;
  return { tank: { group: 'vehicle', desc: 'TANKS: every tank in the world - its row, gun, rounds in the gun, fuel and hull.', args: {}, run: async () => ({ tanks: g.tanks?.view() ?? [], placed: [...(g.tanks?.placed ?? [])] }) } };
}

export async function vehTanksChecks(api, check, C) {
  const g = api.g, I = g.input, made = [];
  const off = () => { for (const k of ['KeyW']) I.down.delete(k); I.mouse.physRight = false; I.mouse.right = false; g.aimOverride = null; if (g.player.inVehicle) g.exitVehicle(true); for (const v of made.splice(0)) if (g.vehicles.includes(v)) g.vehiclesSys.remove(v); };
  const yard = { x: 250, z: 430 };

  await check('tanks: the rows validate; the old tank and the main battle tank are real tracked hulls (tracks, road wheels, a glacis), each with a chassis, a turret gun and its own shell item; the shells turn up in a base armory', async () => {
    const bad = validateTanks(MOUNT_WEAPONS, CHASSIS), out = {};
    for (const t of Object.keys(TANK_ROWS)) {
      const v = g.vehiclesSys.spawn(t, yard.x + Object.keys(out).length * 12, yard.z, 0, '#4e5a3a'); made.push(v);
      out[t] = { tris: v.mesh.geometry.attributes.position.count / 3, row: !!VEHICLES[t], chassis: !!CHASSIS[t] };
    }
    off();
    const guns = Object.entries(TANK_GUNS).every(([k, W]) => MOUNT_WEAPONS[k] && ITEMS[W.ammo]);
    const loot = (MB_LOOT.mb_armory?.rows ?? []).some((r) => r[0] === 'shell_75') && (MB_LOOT.mb_armory?.rows ?? []).some((r) => r[0] === 'shell_120');
    const bodies = Object.values(out).every((o) => o.tris > 400 && o.row && o.chassis);
    return !bad.length && guns && loot && bodies ? true : JSON.stringify({ bad, guns, loot, out });
  });

  await check('tanks: the old tank stands where it was left, placed once, with an empty gun and a dry tank - held W goes nowhere and the trigger only clicks until it is fed', async () => {
    try {
      const P = TANKS_PLACED.find((q) => q.type === 'tank_old');
      await C('teleport', { x: P.near.x - 20, z: P.near.z - 20 }); for (let f = 0; f < 10; f++) await api._step(1);
      const v = g.vehicles.find((q) => q.tankRow === P.id), n = g.vehicles.filter((q) => q.tankRow === P.id).length;
      if (!v) return JSON.stringify({ placed: g.tanks.placed.has(P.id), n });
      const r0 = v.mounts?.top?.ammo, f0 = v.fuel, fr0 = v.mounts?.front?.ammo ?? 0; // the hull gun is empty too
      g.enterVehicle(v); await api._step(3);
      const x0 = v.x, z0 = v.z; I.down.add('KeyW'); await api._step(120); I.down.delete('KeyW');
      const moved = Math.hypot(v.x - x0, v.z - z0);
      g.aimOverride = { x: v.x + Math.sin(v.h) * 30, z: v.z + Math.cos(v.h) * 30 }; I.mouse.physRight = true; I.mouse.right = true;
      const shots0 = g.workshop.stats?.shots ?? 0, ev0 = g.eventSeq ?? 0;
      await api._step(30); I.mouse.physRight = false; I.mouse.right = false;
      const fired = (g.events ?? []).some((e) => e.seq > ev0 && /rocketLaunch|mountFire|launch/i.test(e.type) && e.vehicle === v.id);
      g.exitVehicle(true);
      return n === 1 && v.id === `seed:${P.id}` && v.mounts?.top?.kind === 'cannon75' && r0 === 0 && fr0 === 0 && f0 === 0 && moved < 0.3 && !fired ? true : JSON.stringify({ n, id: v.id, gun: v.mounts?.top?.kind, r0, fr0, f0, moved: r1(moved), fired });
    } finally { off(); }
  });

  await check('tanks: the main battle tank drives on its tracks; the right mouse button swings the turret to the aim and a shell flies out of the barrel and wrecks a car 45 m off', async () => {
    try {
      await C('teleport', { x: yard.x - 8, z: yard.z }); await api._step(3);
      const v = g.vehiclesSys.spawn('tank_new', yard.x, yard.z, 0, '#6a6448'); made.push(v);
      g.garage.setMount(v, 'top', 'cannon120'); v.mounts.top.ammo = 3;
      const car = g.vehiclesSys.spawn('sedan', yard.x + 45, yard.z + 6, 0, '#777'); made.push(car);
      g.enterVehicle(v); await api._step(3);
      const x0 = v.x, z0 = v.z; I.down.add('KeyW'); await api._step(150); I.down.delete('KeyW'); await api._step(60);
      const moved = Math.hypot(v.x - x0, v.z - z0);
      const hp0 = car.hp, a0 = v.mounts.top.ammo;
      g.aimOverride = { x: car.x, z: car.z }; I.mouse.physRight = true; I.mouse.right = true;
      const ws = g.workshop, launch0 = ws.launch; let mz0 = null; ws.launch = function (vv, mz, ...rest) { if (vv === v && !mz0) mz0 = { x: mz.x, y: mz.y, z: mz.z, vx: vv.x, vz: vv.z }; return launch0.call(this, vv, mz, ...rest); };
      let lag = 0; try { for (let f = 0; f < 120 && v.mounts.top.ammo === a0; f++) { await api._step(1); lag = f; } } finally { ws.launch = launch0; }
      I.mouse.physRight = false; I.mouse.right = false;
      for (let f = 0; f < 90; f++) await api._step(1);
      const want = Math.atan2(car.x - v.x, car.z - v.z), yaw = v.mounts.top.yaw ?? 0, off_ = Math.abs(Math.atan2(Math.sin(yaw - want), Math.cos(yaw - want)));
      const spent = a0 - v.mounts.top.ammo, hurt = hp0 - car.hp;
      const at = g.garage.chassis(v).mounts.top.at, W = MOUNT_WEAPONS.cannon120, reach = W.turret[2] / 2 + 0.2 + W.barrel; // the barrel tip, from the turret's spot on the deck
      const tip = mz0 ? Math.hypot(mz0.x - mz0.vx, mz0.z - mz0.vz) : 0, tipOk = mz0 && tip > reach - 1.2 && tip < reach + 1.5 && mz0.y > at[1] && mz0.y < at[1] + W.turret[1];
      return moved > 5 && spent === 1 && off_ < 0.35 && lag > 15 && tipOk && (hurt > 150 || car.dead) ? true : JSON.stringify({ moved: r1(moved), spent, aimOff: r1(off_), lag, tip: r1(tip), reach: r1(reach), y: mz0 && r1(mz0.y), hurt: Math.round(hurt), dead: car.dead });
    } finally { off(); }
  });
}
