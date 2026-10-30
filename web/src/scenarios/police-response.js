// POLICE RESPONSE (docs/design/WEB_POLICE_RESPONSE.md): a county seat with a sheriff's station stamped on open ground, you
// on its main street in the afternoon, 40 to 90 m from the station doors, a pistol on your hip. Patrol cars loop the centre and
// officers walk the street. Fire a shot (LMB) and see who heard it: the dispatch, the sirens, the cars rolling out, the
// search of the spot from what they actually saw (brass, a witness, a blood trail). The Observer (/observe.html) shows the
// open cases and the units live.
// Run: node tools/dl.mjs scenario name=police-response
export default async function (DL, game) {
  const g = game;
  await DL.start();
  await DL.setTime({ hour: 15 });
  await DL.setWeather({ key: 'CLEAR', instant: true });
  if (g.player.inVehicle) await DL.exitVehicle();
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.wanted = 0;
  await DL.police({ action: 'clear' });
  const ID = 'tlab-police-town';
  if (g.citygen.byId?.has(ID)) g.citygen.remove(ID);
  await DL.teleport({ x: 0, z: -300 });
  const town = await DL.citygen({ action: 'stamp', archetype: 'county_seat', seed: 1, id: ID });
  await DL.teleport({ x: town.x, z: town.z });
  await DL.step({ seconds: 2 });
  const desk = (await DL.police({ action: 'stations' })).stations.find((s) => s.town === ID);
  if (!desk?.station) return { ok: false, error: 'the stamped town has no station', town: town.id };
  const st = desk.station;
  // On a street crossing of the patrol loop that lies 40-90 m from the station doors (a street, not a building).
  const beat = (await DL.police({ action: 'patrols' })).beats.find((q) => q.town === ID && q.kind === 'car');
  const cross = (beat?.route ?? []).map((q) => ({ ...q, d: Math.hypot(q.x - st.x, q.z - st.z) })).sort((a, b) => Math.abs(a.d - 60) - Math.abs(b.d - 60))[0];
  await DL.teleport({ x: cross?.x ?? st.x + 32, z: cross?.z ?? st.z + 32 });
  if (!g.player.weapon) await DL.give({ weapon: 'pistol' });
  if (g.inventory.carried.count('ammo_pistol') < 12) await DL.give({ pistol: 12 }); // a pistol and a dozen rounds: the setup, not a stash
  await DL.equip({ weapon: 'pistol' });
  await DL.step({ seconds: 2 });
  g.hud.toast(`POLICE · ${desk.title} · ${desk.tierName}`, 'info');
  g.hud.subtitle('GOAL: fire a shot (LMB) on the main street, then watch the response come: the sirens, the patrol cars, the search of where you stood. Slip away or take them on.', 14);
  return { town: ID, tier: desk.tier, force: desk.force, station: st, cars: desk.motorPool?.cars, you: { x: Math.round(g.player.x), z: Math.round(g.player.z) } };
}
