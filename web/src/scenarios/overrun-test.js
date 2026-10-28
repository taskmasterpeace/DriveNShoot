// OVERRUN TEST (docs/design/WEB_CITYGEN.md §3.6, §8): a mid-size town gets hit by a 200-strong horde at dusk and falls or
// holds by its defenses. Two runs on the same footing: a county seat with no wall (defense 0.3: it falls), a walled
// stronghold behind containers (defense 1.5: it holds). You watch from 260 m off, so the horde stays a record (no bodies in
// the street) and the outcome is the siege's own arithmetic. Run: node tools/dl.mjs scenario name=overrun-test
export default async function (DL, game) {
  const CG = game.citygen, O = CG.overrun;
  const autoWas = O.auto, enabledWas = CG.enabled;
  O.auto = false; CG.enabled = true;
  if (game.player.inVehicle) game.exitVehicle(true);
  await DL.setTime({ hour: 19.5 });
  const run = async (tag, archetype, walls, defense) => {
    const t = await DL.citygen({ action: 'stamp', archetype, seed: 4242, walls, defense, id: `overrun-${tag}` });
    const rec = CG.byId.get(t.id);
    await DL.teleport({ x: rec.x, z: rec.z - rec.half - 260 });
    const H = O.spawnHorde({ x: rec.x + rec.half + 70, z: rec.z, size: 200, toward: rec.id });
    let outcome = null, s = 0;
    for (; s < 300; s += 2) {
      await DL.step({ seconds: 2 });
      if (rec.state === 'overrun') { outcome = 'fell'; break; }
      if (H.strength <= 0 || !O.hordes.includes(H)) { outcome = 'held'; break; }
    }
    const res = { town: rec.id, archetype, wall: t.wall, defense: +(rec.defense ?? 0).toFixed(2), outcome: outcome ?? 'unresolved', seconds: s, infestation: +rec.infestation.toFixed(3), hordeLeft: Math.round(H.strength), bodiesInStreet: H.bodies.length };
    O.clear();
    CG.remove(rec.id);
    return res;
  };
  const weak = await run('weak', 'county_seat', 'none', 0);
  const strong = await run('strong', 'walled_stronghold', 'container', 0.4);
  O.auto = autoWas; CG.enabled = enabledWas;
  return { weak, strong, resolved: weak.outcome !== 'unresolved' && strong.outcome !== 'unresolved' };
}
