// CASINO NIGHT (docs/design/WEB_CASINOS.md): a county seat stamped on open ground, late afternoon, and you on the street outside
// its gaming hall with $300 in your pocket (a real purse: it goes into the cage if you lose). Inside: three blackjack
// tables and a chess table (E at a seat: the door man wants dress or a fee), four guards, two cameras, and a security
// drone over the safe in the back office. Play for the house's money, or rob the place: the cage wants your gun up at the
// cashier, the safe wants E held with picks, a pry bar or a charge. Guards learn only what they see or hear.
// Run: node tools/dl.mjs scenario name=casino-night
export default async function (DL, game) {
  const g = game;
  await DL.start();
  await DL.setTime({ hour: 17.5 });
  await DL.setWeather({ key: 'CLEAR', instant: true });
  if (g.player.inVehicle) await DL.exitVehicle();
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.wanted = 0;
  const ID = 'tlab-casino-town';
  if (g.citygen.byId?.has(ID)) g.citygen.remove(ID);
  const spot = await DL.teleport({ x: 0, z: -300 }); // somewhere to build from; the stamp finds its own free ground
  const town = await DL.citygen({ action: 'stamp', archetype: 'county_seat', seed: 1, id: ID });
  await DL.teleport({ x: town.x, z: town.z });
  await DL.step({ seconds: 1 });
  const list = await DL.casino({ action: 'list' });
  const v = list.venues.find((q) => q.town === ID && q.kind === 'floor' && q.tables.some((t) => t.game === 'chess')) ?? list.venues.find((q) => q.town === ID && q.tables.length > 1);
  if (!v) return { ok: false, error: 'no gaming hall in the stamped town', town: town.id };
  const plan = await DL.casino({ action: 'plan', venue: v.id });
  const door = plan.front, c = v.at;
  const dx = door.x - c.x, dz = door.z - c.z, d = Math.hypot(dx, dz) || 1;
  await DL.teleport({ x: door.x + (dx / d) * 7, z: door.z + (dz / d) * 7 });
  g.cash = Math.max(g.cash, 0); g.cash += 300;
  await DL.step({ seconds: 1.5 });
  const info = await DL.casino({ action: 'info', venue: v.id });
  g.hud.toast(`CASINO NIGHT · ${v.name}`, 'info');
  g.hud.subtitle('GOAL: walk in, take a seat (E) and play blackjack or chess with your $300. Or case the guards, the cameras and the drone, and rob the safe.', 14);
  return { venue: v.id, name: v.name, tables: v.tables.map((t) => t.game), guards: v.guards.length, cameras: v.cameras, drones: v.drones, cash: g.cash, door, safe: plan.inside?.safe, info: !!info.ok };
}
