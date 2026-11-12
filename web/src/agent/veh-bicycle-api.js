// VEHICLES V2 slice 10, THE BICYCLE (Robert 11-12: "the bicycle"; docs/status/vehicles-v2.md on docs/web-veh-status):
// selftest checks. Rows: data/bicycle.js; the system: systems/bicycle.js.
import { VEHICLES } from '../systems/vehicles.js';
import { BICYCLE_ROW, PEDAL, BICYCLES, validateBicycle } from '../data/bicycle.js';
import { seedId } from '../systems/bicycle.js';

const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;

export async function vehBicycleChecks(api, check, C) {
  const g = api.g, I = g.input, made = [];
  const keys = ['KeyW', 'ShiftLeft'];
  const off = () => { for (const k of keys) I.down.delete(k); if (g.player.inVehicle) g.exitVehicle(true); for (const v of made.splice(0)) if (g.vehicles.includes(v)) g.vehiclesSys.remove(v); g.player.stamina = 1; };
  const yard = { x: 250, z: 430 };
  // Ride `frames` with the keys held from a standstill; how far, the top speed, the stamina spent.
  const ride = async (v, frames, stand) => {
    const x0 = v.x, z0 = v.z, s0 = g.player.stamina; let top = 0, lift = 0;
    I.down.add('KeyW'); if (stand) I.down.add('ShiftLeft');
    for (let f = 0; f < frames; f++) { await api._step(1); top = Math.max(top, g.vehiclesSys.speed(v)); lift = Math.max(lift, v.wheelie ?? 0); }
    I.down.delete('KeyW'); I.down.delete('ShiftLeft');
    return { far: Math.hypot(v.x - x0, v.z - z0), top, spent: s0 - g.player.stamina, lift };
  };
  const mount = async (h = 0) => {
    await C('teleport', { x: yard.x - 4, z: yard.z }); await api._step(2);
    const v = g.vehiclesSys.spawn('bicycle', yard.x, yard.z, h, '#2f6f8a'); made.push(v);
    g.enterVehicle(v); await api._step(2); return v;
  };

  await check('bicycle: the row validates; no engine and no tank, yet held W pedals it off at a bicycle\'s pace on your legs (stamina goes down); an empty tank stops nothing and a dented frame does not misfire, boil or leak', async () => {
    try {
      const bad = validateBicycle();
      const v = await mount(); g.player.stamina = 1; v.fuel = 0; v.dmg.engine = 0; v.dmg.tank = 0.1; v.dmg.radiator = 0; // staged: what would stop or bleed a car
      const trail0 = g.fuelTrail?.length ?? 0;
      const r = await ride(v, 240, false);
      const out = { bad, row: !!VEHICLES.bicycle, fuel: v.fuel, cap: v.fuelCap, far: r1(r.far), top: r1(r.top), spent: r2(r.spent), lean: !!v.bike, trail: (g.fuelTrail ?? []).slice(trail0).filter((e) => Math.hypot(e.x - v.x, e.z - v.z) < 25).length, hot: r2(v.dmg.temp ?? 0) };
      return !bad.length && out.row && v.noEngine && v.fuelCap === 0 && r.far > 12 && r.top > 5 && r.top <= BICYCLE_ROW.maxSpeed * 1.05 && r.spent > 0.05 && out.lean && out.trail === 0 && !(v.dmg.temp > 0.01) ? true : JSON.stringify(out);
    } finally { off(); }
  });

  await check('bicycle: SHIFT stands on the pedals - faster, and it costs more, with both wheels down (no motorcycle wheelie); winded you only creep; coasting gives the breath back', async () => {
    try {
      let v = await mount(); g.player.stamina = 1; const seated = await ride(v, 180, false); off();
      v = await mount(); g.player.stamina = 1; const standing = await ride(v, 180, true); off();
      v = await mount(); g.player.stamina = PEDAL.low * 0.5; const winded = await ride(v, 180, false); // staged: out of breath
      g.player.stamina = 0.3; const s0 = g.player.stamina; for (let f = 0; f < 120; f++) await api._step(1); const back = g.player.stamina - s0;
      const out = { seated: [r1(seated.far), r2(seated.spent)], standing: [r1(standing.far), r2(standing.spent), r2(standing.lift)], winded: r1(winded.far), back: r2(back) };
      return standing.far > seated.far * 1.08 && standing.spent > seated.spent * 1.5 && standing.lift < 0.02 && winded.far < seated.far * 0.6 && back > 0.1 ? true : JSON.stringify(out);
    } finally { off(); }
  });

  await check('bicycle: a few lean where you find them - placed once each, on dry ground, under an id the same on every page (so the shard can claim it once for everyone)', async () => {
    try {
      const B = BICYCLES[0];
      await C('teleport', { x: B.near.x + 6, z: B.near.z + 6 }); for (let f = 0; f < 6; f++) await api._step(1);
      const v = g.vehicles.find((q) => q.bicycleRow === B.id);
      if (!v) return JSON.stringify({ placed: g.bicycles.placed.has(B.id) });
      await C('teleport', { x: B.near.x + 600, z: B.near.z }); await api._step(4);
      await C('teleport', { x: B.near.x + 6, z: B.near.z + 6 }); await api._step(4);
      const n = g.vehicles.filter((q) => q.bicycleRow === B.id).length, near = Math.hypot(v.x - B.near.x, v.z - B.near.z), wet = g.water?.depthAt(v.x, v.z) ?? 0;
      return n === 1 && v.type === 'bicycle' && v.id === seedId(B.id) && near <= B.r + 3 && wet <= 0.05 ? true : JSON.stringify({ n, id: v.id, near: Math.round(near), wet: r2(wet) });
    } finally { off(); }
  });

  await check('bicycle: a save and a load keep a placed bicycle - the same one, still placed, and no second one leaned', async () => {
    try {
      const B = BICYCLES[0];
      await C('teleport', { x: B.near.x + 6, z: B.near.z + 6 }); for (let f = 0; f < 6; f++) await api._step(1);
      const v = g.vehicles.find((q) => q.bicycleRow === B.id); if (!v) return 'not placed';
      const snap = (await C('save')).save;
      g.vehiclesSys.remove(v); g.bicycles.placed.clear(); // gone: only the save can bring it back
      await C('load', { save: snap }); for (let f = 0; f < 6; f++) await api._step(1);
      const all = g.vehicles.filter((q) => q.bicycleRow === B.id || q.id === seedId(B.id));
      const out = { n: all.length, id: all[0]?.id, row: all[0]?.bicycleRow, placed: g.bicycles.placed.has(B.id) };
      return out.n === 1 && out.id === seedId(B.id) && out.row === B.id && out.placed ? true : JSON.stringify(out);
    } finally { off(); }
  });
}
