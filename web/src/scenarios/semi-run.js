// SEMIS (docs/design/WEB_SEMIS.md): you are in an interceptor on I-10 near mile 30, eastbound. 70 m ahead a car-hauler
// semi rolls along at its own pace with its slide-out ramp DOWN and the hold empty; behind it, 140 m out, a wide-load lowboy
// carries an RV under its banners. Catch the hauler, drive up its ramp (G inside works the ramp), get out and walk round
// your own car in the hold. Real rigs, real AI drivers (a hauler at the wheel of each tractor).
// Run: node tools/dl.mjs scenario name=semi-run
export default async function (DL, game) {
  const g = game;
  await DL.start();
  await DL.setTime({ hour: 11 });
  await DL.setWeather({ key: 'CLEAR', instant: true });
  if (g.player.inVehicle) await DL.exitVehicle();
  g.zombies.enabled = false; g.raiderTimer = 1e9;
  // The road bends, so the rigs are placed on I-10's own right lane at 70 m and 140 m (sampled with teleport), not on a straight line.
  const lane = {};
  for (const [k, mile] of [['hauler', 30.0435], ['lowboy', 30.087]]) lane[k] = await DL.teleport({ mile, dir: 'east' });
  const here = await DL.teleport({ mile: 30, dir: 'east' });
  await DL.semi({ action: 'clear' });
  for (const v of [...g.vehicles]) if (v.tlab && g.player.inVehicle?.id !== v.id) g.vehiclesSys.remove(v);
  const car = await DL.spawnVehicle({ type: 'interceptor', x: g.player.x, z: g.player.z, heading: here.heading, paint: '#7a3a1c' });
  await DL.step({ seconds: 0.5 }); // a far teleport can rebuild the vehicle objects: work on the live ones
  g.vehicles.find((c) => c.id === car.id).tlab = true;
  await DL.enterVehicle({ id: car.id, force: true });
  if (g.player.inVehicle?.id !== car.id) { await DL.teleport({ x: car.x, z: car.z }); await DL.enterVehicle({ id: car.id, force: true }); }
  const hauler = await DL.semi({ action: 'spawn', trailer: 'box', x: lane.hauler.x, z: lane.hauler.z, h: lane.hauler.heading, ai: 'semi' });
  await DL.semi({ action: 'ramp', id: hauler.trailer.id, down: true });
  const lowboy = await DL.semi({ action: 'spawn', trailer: 'wide', cargo: 'rv', x: lane.lowboy.x, z: lane.lowboy.z, h: lane.lowboy.heading, ai: 'semi' });
  for (const id of [hauler.tractor.id, hauler.trailer.id, lowboy.tractor.id, lowboy.trailer.id]) { const v = g.vehicles.find((c) => c.id === id); if (v) v.tlab = true; }
  await DL.step({ seconds: 1 });
  g.hud.toast('SEMIS · the car-hauler ahead has its ramp down', 'info');
  g.hud.subtitle('GOAL: catch the car-hauler on I-10 and drive up its ramp into the hold. Past it, a wide-load lowboy carries an RV.', 14);
  return { car: car.id, hauler: { tractor: hauler.tractor.id, trailer: hauler.trailer.id, ramp: (await DL.semi({ action: 'status' })).trailers.find((t) => t.id === hauler.trailer.id)?.ramp }, lowboy: { tractor: lowboy.tractor.id, trailer: lowboy.trailer.id, loaded: lowboy.loaded?.ok ?? null }, loc: here.location };
}
