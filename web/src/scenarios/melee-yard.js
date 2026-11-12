// THE MELEE YARD (docs/design/WEB_MELEE.md): the open desert block north of Route 66 at noon. On the dirt in front of you lie a baseball
// bat, a machete, a pair of brass knuckles and a silver-topped sword cane (stand on a pile and press I: the PACK shows the ground; fists up is H or
// holster the gun). Three raiders loiter 20 m north, two with bats and machetes; a fourth stands with his back to you, unarmed: walk
// up behind him unseen and G takes him by the neck for a hostage. Block with RMB, parry the blow as it lands.
// Run: node tools/dl.mjs scenario name=melee-yard
export default async function (DL, game) {
  const g = game;
  await DL.start();
  await DL.setTime({ hour: 12 });
  await DL.setWeather({ key: 'CLEAR', instant: true });
  if (g.player.inVehicle) await DL.exitVehicle();
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.wanted = 0;
  await DL.fight({ action: 'clear' });
  const X = 282, Z = -40; // the open desert block north of Route 66 between the two cross streets
  await DL.teleport({ x: X, z: Z + 20 });
  for (const c of [...g.chars]) if (c !== g.player && c.yard) g.removeChar(c);
  await DL.step({ seconds: 0.5 });
  const inv = g.inventory, p = g.player;
  // The weapons on the ground, a pile each, a few metres apart in front of you.
  const piles = [['baseball_bat', -3.2], ['machete', -1.1], ['brass_knuckles', 1.1], ['sword_cane', 3.2]];
  for (const [item, dx] of piles) { const gr = inv.groundAt(p.x + dx, p.z - 3); inv.add(gr, item, 1); }
  // Three raiders to fight (a bat, a machete, a knife) and one with his back to you.
  const made = [];
  for (const [w, dx, dz] of [['bat', -6, -22], ['machete', 0, -26], ['knife', 6, -22]]) {
    const r = await DL.fight({ action: 'spawn', kind: 'raider', weapon: w, x: p.x + dx, z: p.z + dz });
    made.push(r.id);
  }
  const hostage = await DL.fight({ action: 'spawn', kind: 'raider', weapon: 'fists', x: p.x + 14, z: p.z - 10 });
  const hc = g.chars.find((c) => c.id === hostage.id);
  if (hc) { hc.face = Math.PI; hc.hold = true; hc.state = 'idle'; hc.yard = true; hc.name = 'raider (back turned)'; }
  for (const id of made) { const c = g.chars.find((q) => q.id === id); if (c) c.yard = true; }
  g.hud.toast('MELEE YARD · four weapons on the ground, three raiders north', 'info');
  g.hud.subtitle('GOAL: the four weapons lie in the dirt just north of you: stand on a pile, press I and take one, holster your gun, fight the three raiders. Creep up behind the fourth and press G: take him hostage.', 14);
  return { weapons: piles.map((x) => x[0]), raiders: made, hostage: hostage.id, at: { x: Math.round(p.x), z: Math.round(p.z) } };
}
