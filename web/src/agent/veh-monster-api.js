// VEHICLES V2 slice 9, THE MONSTER TRUCK (Robert 11-12: "the monster truck body, I don't feel like those are monster trucks
// we got now"; docs/status/vehicles-v2.md on docs/web-veh-status): selftest checks. Rows: data/monster.js; the system:
// systems/monster.js (body, built-in MONSTER TYRES, parked once at the Dust Bowl).
import * as THREE from 'three';
import { VEHICLES } from '../systems/vehicles.js';
import { CHASSIS, UTILITY } from '../data/workshop.js';
import { MONSTER_ROW, MONSTERS, validateMonster } from '../data/monster.js';

const r2 = (v) => Math.round(v * 100) / 100;

export async function vehMonsterChecks(api, check, C) {
  const g = api.g, made = [];
  const off = () => { g.driveOverride = null; if (g.player.inVehicle) g.exitVehicle(true); for (const v of made.splice(0)) if (g.vehicles.includes(v)) g.vehiclesSys.remove(v); };
  const yard = { x: 250, z: 470 };

  await check('monster truck: the row validates; a monster truck is its own body (a tube frame, a cab high on long shocks), always on MONSTER TYRES that lift it, and they cannot be sold off it', async () => {
    try {
      const bad = validateMonster(UTILITY);
      await C('teleport', { x: yard.x - 10, z: yard.z }); await api._step(2);
      const v = g.vehiclesSys.spawn('monster_truck', yard.x, yard.z, 0, '#c8a032'); made.push(v);
      await api._step(2);
      const box = new THREE.Box3().setFromObject(v.mesh), tall = box.max.y - box.min.y;
      const pickup = g.vehiclesSys.spawn('pickup', yard.x + 12, yard.z, 0, '#777'); made.push(pickup);
      const boxP = new THREE.Box3().setFromObject(pickup.mesh);
      const sameGeo = v.mesh.geometry === pickup.mesh.geometry || Math.abs(v.mesh.geometry.attributes.position.count - pickup.mesh.geometry.attributes.position.count) === 0;
      const ride = r2(v.liftY ?? 0), cash0 = g.cash ?? 0;
      const sold = g.workshop.remove(v, { part: 'monster', pay: true, time: false });
      const still = !!v.utility?.monster, cash1 = g.cash ?? 0;
      const out = { bad, row: !!VEHICLES.monster_truck, chassis: !!CHASSIS.monster_truck, fits: UTILITY.monster.chassis.includes('monster_truck'), tyres: !!v.utility?.monster, ride, tall: r2(tall), pickupTall: r2(boxP.max.y - boxP.min.y), sameGeo, sold: sold.ok, still, cash: [cash0, cash1] };
      return !bad.length && out.row && out.chassis && out.fits && out.tyres && ride === UTILITY.monster.monster.lift && tall > 1.8 && tall <= MONSTER_ROW.tall + 0.05 && !sameGeo && !sold.ok && still && cash1 === cash0 ? true : JSON.stringify(out);
    } finally { off(); }
  });

  await check('monster truck: one is parked at the Dust Bowl the first time you come near, once, on dry ground, on fumes (not a full tank)', async () => {
    try {
      const M = MONSTERS[0];
      await C('teleport', { x: M.near.x - 30, z: M.near.z - 30 }); for (let f = 0; f < 10; f++) await api._step(1);
      const vs = g.vehicles.filter((q) => q.monsterRow === M.id), v = vs[0];
      if (!v) return JSON.stringify({ placed: g.monsters.placed.has(M.id), n: 0 });
      await C('teleport', { x: M.near.x + 400, z: M.near.z }); await api._step(5);
      await C('teleport', { x: M.near.x - 30, z: M.near.z - 30 }); await api._step(5);
      const n = g.vehicles.filter((q) => q.monsterRow === M.id).length, share = (v.fuel ?? 0) / (v.fuelCap || 1), near = Math.hypot(v.x - M.near.x, v.z - M.near.z), wet = g.water?.depthAt(v.x, v.z) ?? 0;
      return n === 1 && v.type === 'monster_truck' && v.utility?.monster && share <= M.fuel + 0.02 && near <= M.r + 6 && wet <= 0.05 ? true : JSON.stringify({ n, type: v.type, tyres: !!v.utility?.monster, share: r2(share), near: Math.round(near), wet: r2(wet) });
    } finally { off(); }
  });

  await check('monster truck: driven flat out at a car broadside it goes up and over it and caves its roof', async () => {
    try {
      await C('teleport', { x: yard.x - 14, z: yard.z + 20 }); await api._step(2);
      const m = g.vehiclesSys.spawn('monster_truck', yard.x, yard.z, Math.PI / 2, '#c8a032'); made.push(m);
      const o = g.vehiclesSys.spawn('sedan', yard.x + 26, yard.z, 0, '#777'); made.push(o);
      const hp0 = o.hp, seq0 = g.eventSeq;
      g.enterVehicle(m); await api._step(2);
      g.driveOverride = { throttle: 1, steer: 0 };
      let peak = 0;
      for (let i = 0; i < 240; i++) { await api._step(1); peak = Math.max(peak, m.climbY ?? 0); if (m.x > o.x + 8) break; }
      g.driveOverride = null;
      const climbed = ((await C('events', { since: seq0, type: 'monsterClimb' })).events ?? []).some((e) => e.over === o.id);
      const out = { climbed, peak: r2(peak), hp: [Math.round(hp0), Math.round(o.hp)], crushed: r2(o.crushed ?? 0) };
      return climbed && peak > 1 && out.crushed > 0 && o.hp < hp0 ? true : JSON.stringify(out);
    } finally { off(); }
  });
}
