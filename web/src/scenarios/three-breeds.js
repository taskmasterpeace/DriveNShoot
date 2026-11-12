// THE THREE BREEDS, side by side (docs/design/WEB_BREEDS.md): a Shambler herd, a Sprinter (shown as it breaks), and an
// Echo standing at its post, each in its own lane 9 m apart on open ground with you 14 m in front of them. West to east:
// herd, sprinter, Echo (the Test Lab card says which is which; photo mode hides the HUD, so nothing is written over
// them). The summary carries the full cards (what it is, how you know it, what to do, the source). Frozen in photo mode
// so the shot holds still. Re-running restages it; `photo on=false` then `god on=false`
// lets them loose on you.
//   node tools/dl.mjs scenario name=three-breeds
//   node tools/dl.mjs screenshot zoom=17 --out breeds.jpg
//   node tools/dl.mjs photo on=false          (let them loose: the herd walks, the sprinter charges, the Echo looks for something to work at)
import { BREED_CARDS, BREEDS, INFECTED } from '../data/infected.js';

export default async function (DL, game) {
  const g = game, Z = g.zombies;
  const AT = { x: 250, z: 430 }; // the open flats south-east of the island: nothing else there
  if (g.qol.photo) g.qol.togglePhoto(false);
  await DL.start();
  await DL.setTime({ hour: 12 });
  await DL.setWeather({ key: 'CLEAR', instant: true });
  g.zombies.enabled = false; // no night herd wandering into the lineup
  if (g.player.inVehicle) await DL.exitVehicle();
  for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - AT.x, c.z - AT.z) < 80) g.removeChar(c);
  await DL.teleport({ x: AT.x, z: AT.z + 14 });
  g.godMode = true; // a lineup: nobody bites the photographer (photo off + `god on=false` to play it)
  const face = (c) => { c.face = Math.atan2(g.player.x - c.x, g.player.z - c.z); c.timer = 99; c.wx = c.x; c.wz = c.z; };
  // lane 1 (west): the herd - five shamblers, close together
  const herd = [];
  for (const [ox, oz] of [[0, 0], [1.2, 0.8], [-1.1, 0.9], [0.5, 1.9], [-0.7, 2.0]]) { const c = Z.spawn(AT.x - 9 + ox, AT.z - oz, false); if (c) { c.x = AT.x - 9 + ox; c.z = AT.z - oz; face(c); herd.push(c); } }
  // lane 2 (middle): the sprinter, reared back in its scream (the wind-up before the charge)
  const s = Z.spawn(AT.x, AT.z, true);
  if (s) { s.x = AT.x; s.z = AT.z; face(s); Z.remember(s, g.player.x, g.player.z, 'sight', g.player); s.ztarget = g.player; Z.burst(s, 'lineup'); }
  // lane 3 (east): the Echo, standing at its post
  const e = Z.spawnKind('echo', AT.x + 9, AT.z);
  if (e) { e.x = AT.x + 9; e.z = AT.z; face(e); }
  await DL.step({ seconds: 0.25 });
  if (!g.qol.photo) g.qol.togglePhoto(true);
  const row = (k) => ({ breed: k, ...BREED_CARDS[k], pace: `${(INFECTED[k].speed ?? INFECTED.shambler.speed).join('-')} m/s${INFECTED[k].burstSpeed ? `, ${INFECTED[k].burstSpeed} m/s in its burst` : ''}` });
  return {
    at: AT, lanes: { shambler: herd.map((c) => c.id), sprinter: s?.id ?? null, echo: e?.id ?? null },
    cards: BREEDS.map(row),
    next: 'screenshot zoom=17 · photo on=false lets them loose',
  };
}
