// The car photo booth: every stock body side by side on the Glass Flats road, noses up, a driver in
// each so the lamps are lit. A second row shows the glass under fire: windshields at 30% and 70%
// damage (the crack web spreading), a shot-out windshield and a shot-out side window, so you can
// see into the cab. Re-running replaces the previous lineup.
//   node tools/dl.mjs scenario name=garage-lineup
//   node tools/dl.mjs screenshot x=21.5 z=326 zoom=30 --out lineup.jpg   (add setTime hour=23 for lamps)
// The booth is cleared by AREA, not only by the lineup flag: a hot-reload restore brings the cars
// back without the flag, and a stale copy parked inside a fresh one hides the damage being shown.
const BOOTH = { x0: -8, x1: 53, z0: 310, z1: 345 };
export default async (DL, game) => {
  const inBooth = (v) => v.x > BOOTH.x0 && v.x < BOOTH.x1 && v.z > BOOTH.z0 && v.z < BOOTH.z1;
  for (const v of [...game.vehicles]) {
    if (!(v.lineup || inBooth(v)) || game.player.inVehicle === v) continue;
    const crew = (v.occ ?? []).filter((o) => o && o !== game.player); // drivers spawned for the booth leave with it
    game.vehiclesSys.remove(v);
    for (const o of crew) game.removeChar(o);
  }
  // Drivers stranded by an earlier clear-out (a hot reload drops the crew link) stand in the shot.
  for (const c of [...game.chars]) if (c !== game.player && !c.npc && !c.inVehicle && inBooth(c)) game.removeChar(c);
  const row = async (z, specs) => {
    const ids = [];
    for (const [type, x, glass] of specs) {
      const r = await DL.spawnVehicle({ type, x, z, heading: Math.PI, ai: 'none', withDriver: true });
      const v = game.vehicles.find((c) => c.id === r.id);
      v.lineup = true;
      if (glass) {
        game.carCombat.ensure(v);
        for (const [side, frac] of Object.entries(glass)) { const w = v.windows?.[side]; if (w) game.carCombat.damageWindow(v, side, w.max * frac, null); }
      }
      ids.push(r.id);
    }
    return ids;
  };
  const bodies = await row(320, [['rig', 0], ['interceptor', 9], ['sedan', 16], ['pickup', 23], ['van', 30], ['buggy', 37], ['bike', 43], ['atv', 48]]);
  const damaged = await row(333, [['sedan', 9, { front: 0.3 }], ['sedan', 16, { front: 0.7 }], ['interceptor', 23, { front: 1 }], ['van', 30, { left: 1, front: 0.5 }]]);
  await DL.teleport({ x: 22, z: 350 });
  await DL.step({ seconds: 0.3 });
  // For a player: the camera sits on the lineup (not on you); `.` and `,` step it along both rows, a car at a time.
  const xs = [0, 9, 16, 23, 30, 37, 43, 48], names = ['Rig', 'Interceptor', 'Sedan', 'Pickup', 'Van', 'Buggy', 'Bike', 'ATV'];
  const stops = [{ x: 24, z: 326, h: 30, tilt: 0.14, label: 'GARAGE LINEUP: every car body, and below them the glass under fire' }];
  xs.forEach((x, i) => stops.push({ x, z: 320, h: 9, tilt: 0.14, label: names[i] }));
  [[9, 'Sedan · windshield 30% cracked'], [16, 'Sedan · windshield 70% cracked'], [23, 'Interceptor · windshield shot out'], [30, 'Van · side window out, windshield 50%']].forEach(([x, label]) => stops.push({ x, z: 333, h: 9, tilt: 0.14, label }));
  if (!game.qol.photo) game.qol.togglePhoto(true);
  Object.assign(game.qol.photo, { x: 24, z: 326, h: 30, tilt: 0.14 });
  game.qol.lookStops(stops, 0);
  return { bodies, damaged, look: { x: 21.5, z: 326, zoom: 30 } };
};
