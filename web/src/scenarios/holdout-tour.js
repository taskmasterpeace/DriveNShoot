// HOLDOUT TOUR (docs/design/WEB_HOLDOUTS.md): every generated holdout, one after another - stand at its gate, read its
// Keyholder's card and HOUSE RULES, count its guards and its buildings - then the gate check at SEBASTIAN played through:
// stopped at the gate, the rules read, comply (guns to the locker, the water tithe), walk in, the card, walk out (guns
// back). Ends at Sebastian's gate at noon with the card up.
// Run: node tools/dl.mjs scenario name=holdout-tour   then: screenshot --out tour.jpg
export default async function (DL, game) {
  const g = game, L = g.holdoutLaw, Rg = g.regions;
  await DL.start();
  await DL.setTime({ hour: 12 }); await DL.setWeather({ key: 'CLEAR', instant: true });
  if (g.player.inVehicle) await DL.exitVehicle();
  const was = L.enabled; L.enabled = true;
  const towns = [];
  for (const H of L.towns) {
    const gt = L.mainGate(H), d = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] }[gt.side];
    await DL.teleport({ x: gt.x + d[0] * 30, z: gt.z + d[1] * 30 });
    const T = Rg.towns.find((t) => t.H === H); if (!T.live) Rg.promote(T);
    await DL.step({ seconds: 0.4 });
    const v = L.view(H.id);
    towns.push({ id: H.id, name: H.name, region: H.R.id, exit: v.exit, keyholder: `${v.card.title} ${v.card.name} (${v.card.flag})`, vice: v.card.vice, law: v.card.law,
      rules: v.rules.map((r) => r.name), paper: v.scrip.name, guards: v.guards.length, buildings: v.lots, size: v.size });
  }
  // The gate check at Sebastian, played through.
  const H = L.byId.sebastian, gt = L.mainGate(H);
  L.st = {};
  if (L.waterSlot() < 0) g.inventory.add(g.inventory.carried, 'water_bottle', 1);
  await DL.teleport({ x: gt.x + 20, z: gt.z });
  await DL.step({ seconds: 0.3 });
  await DL.teleport({ x: gt.x + 3.2, z: gt.z + 0.4 });
  await DL.step({ seconds: 0.4 });
  const stop = await DL.dialogue();
  const i = stop.open ? stop.choices.findIndex((c) => /^Comply/.test(c.text)) : -1;
  const comply = i >= 0 ? await DL.choose({ index: i }) : null;
  if (g.dialogue.active) await DL.choose({ index: 0 });
  const inside = L.view(H.id).standing;
  await DL.teleport({ x: H.cx + 40, z: H.cz + 9 }); await DL.step({ seconds: 1 });
  await DL.teleport({ x: gt.x + 90, z: gt.z }); await DL.step({ seconds: 0.6 });
  const out = { weapons: [...g.inv.weapons], standing: L.view(H.id).standing };
  await DL.teleport({ x: gt.x + 14, z: gt.z + 2 });
  L.card.show(H, 30);
  L.enabled = was;
  return { towns, gate: { stopped: !!stop.open, text: stop.text, choices: stop.choices?.map((c) => c.text), comply: comply?.text ?? null, inside, out }, next: 'screenshot --out tour.jpg' };
}
