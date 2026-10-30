// THE LONG ROAD (docs/design/WEB_LONG_ROAD.md): you sit in a full-tanked sedan at Phoenix's east edge on I-10, pointed
// at the next town down the corridor. Drive it: travellers by the shoulder, a stalled car, a checkpoint, roadside caches
// (E on a body or a wreck searches it, once), and at the far town's edge you stop and the trip log writes itself. Nothing
// is staged on the road: the beats are the ones the world's own long-road rows put there.
// Run: node tools/dl.mjs scenario name=long-road
export default async function (DL, game) {
  const g = game;
  await DL.start();
  await DL.setTime({ hour: 9 });
  await DL.setWeather({ key: 'CLEAR', instant: true });
  if (g.player.inVehicle) await DL.exitVehicle();
  const here = await DL.teleport({ mile: 27.4, dir: 'east' });
  for (const v of [...g.vehicles]) if (v.tlab && g.player.inVehicle?.id !== v.id) g.vehiclesSys.remove(v);
  const car = await DL.spawnVehicle({ type: 'sedan', x: g.player.x, z: g.player.z, heading: here.heading, paint: '#6a5a44' });
  await DL.step({ seconds: 0.5 }); // a far teleport can rebuild the vehicle objects: work on the live one
  const cv = g.vehicles.find((c) => c.id === car.id); cv.tlab = true; cv.fuel = cv.fuelCap; // a full tank: the trip is a city-to-city run
  await DL.enterVehicle({ id: car.id, force: true });
  if (g.player.inVehicle?.id !== car.id) { await DL.teleport({ x: car.x, z: car.z }); await DL.enterVehicle({ id: car.id, force: true }); }
  const towns = (g.streamer?.W?.towns ?? []).filter((t) => t.x > g.player.x + 3000).sort((a, b) => Math.hypot(a.x - g.player.x, a.z - g.player.z) - Math.hypot(b.x - g.player.x, b.z - g.player.z));
  const dest = towns[0];
  const miles = dest ? Math.round(Math.hypot(dest.x - g.player.x, dest.z - g.player.z) / 1609) : null;
  await DL.step({ seconds: 1 });
  g.hud.toast(`THE LONG ROAD · east on I-10${dest ? ' to ' + dest.name : ''}`, 'info');
  g.hud.subtitle(`GOAL: drive I-10 east${dest ? ` to ${dest.name} (about ${miles} miles)` : ''}, meeting what is on the road. Stop at the far town's edge for your trip log.`, 14);
  return { car: car.id, fuel: Math.round(cv.fuel), loc: here.location, to: dest?.name ?? null, miles, beats: (await DL.longRoad({ action: 'beats' })).count };
}
