// The proof-of-concept scene: night, rain, Route 66. You drive the War Rig;
// a Dustwolf convoy runs ahead. Harpoon one, yank it, watch it roll.
// Run: node tools/dl.mjs scenario name=highway-heist
export default async function (DL, game) {
  await DL.start();
  await DL.setTime({ hour: 22.5 });
  await DL.setWeather({ key: 'RAIN', instant: true });
  if (game.player.inVehicle) await DL.exitVehicle();
  const rig = await DL.spawnVehicle({ type: 'rig', x: 140, z: 3.5, heading: Math.PI / 2, paint: '#7a3a1c' });
  await DL.enterVehicle({ id: rig.id, force: true });
  const convoy = [];
  for (let i = 0; i < 3; i++) {
    const v = await DL.spawnVehicle({ type: i === 1 ? 'pickup' : 'interceptor', x: 175 + i * 16, z: 3.5 + (i % 2 ? -7 : 0), heading: Math.PI / 2, paint: '#1c1f24', ai: 'traffic' });
    convoy.push(v.id);
  }
  await DL.drive({ throttle: 1, seconds: 1.5 });
  return { rig: rig.id, convoy, next: 'harpoon {id: convoy[0]} then harpoon again to yank' };
}
