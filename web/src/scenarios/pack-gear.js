// The PACK screen, kitted out: armor worn in the paperdoll's slots (data/gear.js), a dog of yours at heel, a body at
// your feet with a found vest on it, so the screen shows both sides. For screenshots of the DOM (the world `screenshot`
// command does not include the HUD) and for a look at the gear system in one go.
//   node tools/dl.mjs scenario name=pack-gear        then a browser screenshot of the page
//   node tools/dl.mjs pack on=false                  to close it
export default async function packGear(DL, g) {
  const C = (cmd, a) => DL.call(cmd, a);
  await C('start');
  await C('setWeather', { key: 'CLEAR', instant: true });
  await C('setTime', { hour: 10 });
  await C('teleport', { x: 236, z: -110 });
  g.gear.load(null);
  for (const id of ['combat_helmet', 'soft_vest', 'arm_guards', 'padded_leggings', 'trail_boots', 'utility_belt', 'ammo_bandolier', 'rabbit_foot']) {
    await C('gear', { give: id });
    await C('gear', { wear: id });
  }
  await C('item', { give: 'dried_meat', n: 2 });
  await C('item', { give: 'flare', n: 2 });
  await C('give', { weapon: 'pump' });
  // A dog of yours: fed until it followed (the feed path, not a flag).
  if (!g.dogs.mine().length) {
    const d = g.dogs.make('shepherd', g.player.x + 2, g.player.z + 1, { name: 'Rex' });
    d.leader = d; d.home = { x: d.x, z: d.z };
    await C('item', { give: 'jerky', n: 3 });
    for (let i = 0; i < 3; i++) await C('dog', { id: d.id, feed: true, force: true });
  }
  // Somebody dead at your feet with a vest on the body.
  const c = g.addChar({ x: g.player.x + 1.2, z: g.player.z, faction: 'raider', name: 'Dustwolf Scav', flag: 'US', weapon: 'smg' });
  await C('kill', { id: c.id });
  const box = g.inventory.boxes.get(`body:${c.id}`);
  if (box) { g.inventory.open(box); g.inventory.add(box, 'leather_vest', 1); g.inventory.add(box, 'brass_knuckles', 1); }
  await C('step', { seconds: 0.5 });
  const r = await C('pack', { on: true });
  // Select the worn vest's row in your list? The armor in the paperdoll is the point; pick the found vest on their side.
  const ui = g.invUI;
  if (ui.other?.slots) { const i = ui.other.slots.findIndex((s) => s.id === 'leather_vest'); if (i >= 0) { ui.side = 1; ui.sel[1] = i; ui.render(); } }
  return { pack: r.open, gear: g.gear.view().soak, dogs: g.dogs.mine().map((d) => d.name), other: r.other?.label };
}
