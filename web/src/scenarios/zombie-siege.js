// Night siege on Route 66: a horde surrounds your parked car, claws the glass in,
// latches on, and reaches for you. Shoot out of the windows, then floor it and swerve
// to shake them off. Afterwards: hop onto a passing car and ride it.
// Run: node tools/dl.mjs scenario name=zombie-siege
export default async function (DL, game) {
  const log = [];
  const note = (m) => log.push(`[${game.time.toFixed(1)}s] ${m}`);
  const since = game.eventSeq;
  await DL.start();
  await DL.setTime({ hour: 23 });
  await DL.setWeather({ key: 'FOG', instant: true });
  await DL.zombies({ on: false }); // only our horde, for a clean read
  if (game.player.inVehicle) await DL.exitVehicle();
  const car = await DL.spawnVehicle({ type: 'interceptor', x: 300, z: 3.5, heading: Math.PI / 2, paint: '#1c1f24' });
  await DL.give({ weapon: 'smg', smg: 400 });
  await DL.equip({ weapon: 'smg' });
  await DL.enterVehicle({ id: car.id, force: true });
  const hp0 = game.player.hp;

  // 1. The horde arrives and goes for the glass. Wait until the first pane gives (as a player would), not a fixed
  // time: once the glass is out, an arm reaches in through every open side (8 a bite, one arm a side every 1.2 s), and
  // a driver who sits out 14 s of a 14-strong horde is dead - the old fixed wait crashed this scenario on a null car.
  await DL.horde({ x: 300, z: 26, count: 14, runners: 0.3, radius: 6 });
  let v = null;
  for (let t = 0; t < 14; t += 0.5) {
    v = (await DL.step({ seconds: 0.5 })).vehicle;
    if (!v || game.events.some((e) => e.seq > since && e.type === 'windowBroken' && !e.fromInside)) break;
  }
  if (!v) return { playerAlive: game.player.alive, diedInTheCar: true, log: [...log, 'the horde got in before a window broke'] };
  note(`first pane gone: windows ${JSON.stringify(v.windows)}, ${v.grabbers.length} hanging on, player hp ${Math.round(game.player.hp)}`);

  // 2. Shoot out of the windows at whatever is closest (first shot knocks our own glass out).
  for (let i = 0; i < 8; i++) {
    const r = await DL.fire({ id: 'hostile', shots: 6 });
    if (r.fired === 0 && r.note) break;
  }
  v = (await DL.state()).vehicle;
  if (!v) return { playerAlive: game.player.alive, diedInTheCar: true, kills: game.stats.kills, log: [...log, 'dragged down while shooting back'] };
  note(`after shooting out of the windows: windows ${JSON.stringify(v.windows)}, kills so far ${game.stats.kills}`);

  // 3. Floor it and swerve to fling off anyone still hanging on.
  const shake = await DL.shakeOff({ seconds: 4 });
  note(`shakeOff flung ${shake.flung.length}, still on ${shake.stillOn.length}`);
  await DL.drive({ throttle: 1, steer: 0, seconds: 2 });

  // 4. Out on foot: grab onto a passing car and ride it.
  await DL.exitVehicle();
  const ride = await DL.spawnVehicle({ type: 'pickup', x: game.player.x + 3, z: game.player.z + 2.5, heading: Math.PI / 2, ai: 'traffic' });
  const grab = await DL.grab({ id: ride.id });
  await DL.step({ seconds: 3 });
  const onCar = !!game.player.grabbing;
  const travelled = Math.hypot(game.player.x - ride.x, game.player.z - ride.z);
  const drop = onCar ? await DL.letGo() : null;
  note(`car-surfing: grabbed=${grab.ok} stillOnAfter3s=${onCar} rode ${Math.round(travelled)}m, dropped at ${drop?.speedWhenDropped ?? '-'} m/s`);

  const ev = game.events.filter((e) => e.seq > since);
  const count = (t) => ev.filter((e) => e.type === t).length;
  return {
    windowsBrokenByZombies: ev.filter((e) => e.type === 'windowBroken' && !e.fromInside).length,
    windowsShotOutFromInside: ev.filter((e) => e.type === 'windowBroken' && e.fromInside).length,
    shotsFromWindows: count('windowShot'),
    zombieGrabs: ev.filter((e) => e.type === 'grabbed' && e.faction === 'zombie').length,
    flungOff: count('flung'),
    playerDamageTaken: Math.round(hp0 - Math.min(hp0, game.player.hp)) || (game.player.alive ? 0 : hp0),
    zombieKills: ev.filter((e) => e.type === 'kill' && e.faction === 'zombie').length,
    playerAlive: game.player.alive,
    carSurfing: { grabbed: grab.ok, rode: onCar },
    log,
  };
}
