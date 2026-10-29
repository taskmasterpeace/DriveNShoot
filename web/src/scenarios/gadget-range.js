// THE GADGET RANGE (docs/design/WEB_GADGETS.md §8): every gadget laid out on one stretch of open ground west of town,
// at noon, with a target for each - a car run over a chain, a raider for the crawler, a car over a buried mine, a raider
// through a fan mine's wire - then a flare, smoke and the drone up over it all. Reports what each one did.
// Run: node tools/dl.mjs scenario name=gadget-range   (then: screenshot --out range.jpg)
export default async function (DL, game) {
  const g = game, GX = g.gadgets;
  await DL.start();
  await DL.setTime({ hour: 12 });
  await DL.setWeather({ key: 'CLEAR', instant: true });
  if (g.player.inVehicle) await DL.exitVehicle();
  g.zombies.enabled = false; g.raiderTimer = 1e9;
  if (g.drones.d) { g.drones.d = null; g.drones.piloting = false; } // a drone still up from before would hold your car parked
  g.gadgets.list.length = 0; await DL.security({ clear: true });
  g.wanted = 0; g.security.lastWanted = 0;
  GX.list.length = 0;
  const X = -120, Z = -20, out = {};
  await DL.teleport({ x: X + 8, z: Z - 30 });
  // 1. A chain swung across the lane, a car driven over it.
  GX.throwOne('road_chain', g.player, X, Z);
  await DL.step({ seconds: 1.5 });
  const car = await DL.spawnVehicle({ type: 'interceptor', x: X, z: Z - 34, heading: 0 });
  await DL.teleport({ x: X + 3, z: Z - 34 });
  await DL.enterVehicle({ id: car.id, force: true });
  await DL.drive({ throttle: 1, seconds: 3 });
  const v = g.vehicles.find((c) => c.id === car.id);
  out.chain = Object.entries(v.dmg.tyres).filter(([, k]) => k <= 0).map(([w]) => w);
  await DL.exitVehicle();
  // 2. A crawler set down on the same line; a raider 15 m up it.
  g.vehiclesSys.remove(v);
  await DL.teleport({ x: X + 4, z: Z - 36 });
  const r = g.spawnRaider(X, Z - 15, Math.random, 'pistol'); r.hold = true; r.weapon = null;
  GX.place('crawler_mine', X, Z - 30, 0, g.player, { state: 'armed', armAt: 0 });
  await DL.step({ seconds: 5 });
  out.crawler = r.alive ? `raider alive (${Math.round(r.hp)} hp)` : 'raider killed';
  // 3. A buried mine in the road; a pickup driven over it.
  for (const p of [...GX.list]) GX.remove(p);
  GX.place('car_mine', X, Z - 20, 0, null, { state: 'armed', armAt: 0 });
  const c2 = await DL.spawnVehicle({ type: 'pickup', x: X, z: Z - 48, heading: 0 });
  await DL.teleport({ x: X + 3, z: Z - 48 });
  await DL.enterVehicle({ id: c2.id, force: true });
  await DL.drive({ throttle: 1, seconds: 2.4 });
  const v2 = g.vehicles.find((c) => c.id === c2.id);
  if (g.player.inVehicle) await DL.exitVehicle();
  out.mine = v2.dead || v2.onFire > 0 ? 'car killed' : `car hp ${Math.round(v2.hp)}`;
  // 4. The show: a fan mine with its wire, bells across a gap, a flare, smoke, a noise box, a remote charge, the drone up.
  await DL.teleport({ x: X + 2, z: Z - 50 });
  GX.place('road_chain', X, Z - 44, 0, g.player);
  GX.place('spike_strip', X, Z - 40, 0, g.player);
  GX.place('fan_mine', X + 2.5, Z - 36, 0, g.player);
  GX.place('tripwire_bells', X - 2.5, Z - 36, 0, g.player);
  GX.place('remote_charge', X, Z - 33, 0, g.player);
  GX.place('crawler_mine', X + 2, Z - 30, 0, g.player);
  GX.place('signal_flare', X - 2, Z - 30, 0, g.player, { state: 'armed', armAt: 0 });
  GX.place('noise_maker', X + 2, Z - 27, 0, g.player, { state: 'armed', armAt: 0 });
  GX.place('car_mine', X - 2, Z - 27, 0, g.player);
  await DL.step({ seconds: 2 });
  await DL.drone({ action: 'launch', kind: 'scout', give: true });
  await DL.drone({ action: 'fly', x: X + 1, z: Z - 38 });
  await DL.step({ seconds: 2 });
  out.drone = g.drones.view();
  out.gadgets = GX.list.map((p) => `${p.kind}:${p.state}`);
  out.counts = { ...GX.counts };
  return out;
}
