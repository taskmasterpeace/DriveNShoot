// Dustwolves hit Rust Haven's north gate at midnight in a dust storm.
// Wardens defend; you arrive with an SMG. Returns the body count after 20s.
export default async function (DL, game) {
  await DL.start();
  await DL.setTime({ hour: 0 });
  await DL.setWeather({ key: 'DUST', instant: true });
  await DL.give({ weapon: 'smg', smg: 160 });
  await DL.equip({ weapon: 'smg' });
  await DL.teleport({ x: 0, z: -70 });
  const spawned = await DL.spawn({ kind: 'raider', x: 0, z: -120, count: 10 });
  if (!spawned.ok) return { error: spawned.error };
  const { ids } = spawned;
  await DL.step({ seconds: 20 });
  const dead = ids.filter((id) => !game.chars.find((c) => c.id === id)?.alive).length;
  return { raiders: ids.length, deadAfter20s: dead };
}
