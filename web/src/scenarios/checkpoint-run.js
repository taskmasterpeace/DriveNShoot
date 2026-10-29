// CHECKPOINT RUN (docs/design/WEB_GADGETS.md §8): you're driving out of Rust Haven with three stars on you. The county
// posse rolls from the station and throws a ROADBLOCK across the road ahead - two run-down bull cars side on, a road chain
// between them, two men behind. Run it (the chain takes your tyres) or stop and take the cuffs.
// Run: node tools/dl.mjs scenario name=checkpoint-run   then drive, or: security surrender=true
export default async function (DL, game) {
  const g = game;
  await DL.start();
  await DL.setTime({ hour: 17.5 });
  if (g.player.inVehicle) await DL.exitVehicle();
  g.security.auto = true;
  if (g.drones.d) { g.drones.d = null; g.drones.piloting = false; } // a drone still up from before would hold your car parked
  g.gadgets.list.length = 0; await DL.security({ clear: true });
  g.wanted = 0; g.security.lastWanted = 0;
  const X = -120, Z = -60;
  const car = await DL.spawnVehicle({ type: 'interceptor', x: X, z: Z, heading: 0, paint: '#5a3a24' });
  await DL.teleport({ x: X + 3, z: Z });
  await DL.enterVehicle({ id: car.id, force: true });
  await DL.drive({ throttle: 1, seconds: 1 });
  g.raiseWanted(3); // the posse's rung: two cars and a roadblock ahead of the car you drive
  await DL.step({ seconds: 0.3 });
  const sec = g.security.view();
  const block = sec.roadblocks[0];
  await DL.drive({ throttle: 1, seconds: 2.4 });
  const v = g.vehicles.find((c) => c.id === car.id);
  return {
    wanted: g.wanted, roadblock: block, responses: sec.responses.map((r) => ({ id: r.id, tier: r.tier, cars: r.cars.map((c) => c.id) })),
    yourTyres: v?.dmg?.tyres, ranIt: block ? Math.hypot(v.x - block.x, v.z - block.z) : null,
    next: 'screenshot --out checkpoint.jpg; security surrender=true to take the cuffs',
  };
}
