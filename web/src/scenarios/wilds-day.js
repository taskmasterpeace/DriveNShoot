// A day lived off the land (docs/design/WEB_WILDS.md): out past the town at the island lake with a rod, a knife, a
// sawn-off and a coil of snare wire, and nothing to eat. Forage for grubs and deadwood, set a snare, put up a flock of
// ducks and shoot one out of the air, butcher it, fish off the dock, build a fire pit and cook, hang meat on a rack,
// read the ground, sleep the day round (the clock moves on), take the rack and the snare, eat. Every step is a command
// a player's keys would also do; the summary is what the day brought in and what it taught.
//   node tools/dl.mjs scenario name=wilds-day
export default async function wildsDay(DL, g) {
  const C = (cmd, a = {}) => DL.call(cmd, a);
  const log = [];
  const note = (step, r) => { log.push({ step, ok: r?.ok !== false, ...(r?.ok === false ? { why: r.error } : {}) }); return r; };
  await C('start');
  await C('setWeather', { key: 'CLEAR', instant: true });
  await C('setTime', { hour: 6.5 });
  const BANK = { x: 342, z: 352 };
  if (g.player.inVehicle) g.exitVehicle(true);
  await C('teleport', BANK);
  await C('step', { seconds: 1 });
  const inv = g.inventory;
  g.outdoors.load(null); // a fresh day: no camp, no traps out yet
  inv.carried.slots.length = 0; // out with nothing but the kit below
  inv.wear('ruck'); // a frame ruck: a day out takes room (deadwood is bulky)
  inv.stow('water_bottle', 1);
  for (const [id, n] of [['fishing_rod', 1], ['fish_hook', 4], ['knife', 1], ['snare_wire', 2]]) if (inv.carried.count(id) < n) inv.stow(id, n - inv.carried.count(id));
  await C('give', { weapon: 'shotgun', shells: 12 }); await C('equip', { weapon: 'shotgun' });
  g.needs.food = 0.35; g.needs.water = 0.5;
  const food0 = g.needs.food;

  // Morning: the ground first - grubs for bait, deadwood for a fire, whatever grows.
  const fg = note('forage', await C('forage', { times: 4, spread: true }));
  await C('teleport', BANK); await C('step', { seconds: 0.5 });
  note('snare', await C('trap', { set: 'snare' }));
  // Ducks put up off the water beyond you come over low: pass-shooting, the shot taken as they cross.
  const ducks = g.fauna.spawn('duck', BANK.x + 30, BANK.z + 6, 6, { test: true });
  await C('step', { seconds: 0.5 });
  for (const d of ducks) g.fauna.takeOff(d, BANK.x + 60, BANK.z + 8);
  let near = null;
  for (let i = 0; i < 40 && !near; i++) { await C('step', { seconds: 0.1 }); near = ducks.find((d) => d.air && Math.hypot(d.x - g.player.x, d.z - g.player.z) < 9); }
  const shot = note('shoot a duck', await C('hunt', { shoot: near?.id ?? 'bird', shots: 2 }));
  const duck = ducks.find((d) => d.dead);
  if (duck) note('butcher the duck', await C('butcher', { id: duck.id, force: true }));
  // Mid-morning: the dock and the rod (grubs from the forage, a raw cut if not).
  await C('teleport', { x: 381, z: 382 }); await C('step', { seconds: 1.5 });
  if (!inv.carried.count('grubs')) inv.stow('grubs', 3);
  const fish = note('fish', await C('fish', { casts: 5, react: 0.3, face: 0 }));
  // Noon: back on the bank, a fire pit (deadwood from the morning) and the catch on it.
  await C('teleport', { x: BANK.x + 3, z: BANK.z }); await C('step', { seconds: 0.5 });
  if (inv.carried.count('deadwood') < 7) inv.stow('deadwood', 7 - inv.carried.count('deadwood')); // the rest gathered by hand
  note('fire pit', await C('camp', { build: 'firepit' }));
  await C('step', { seconds: 1.5 });
  const raw0 = g.fauna.rawCount();
  const cooked = note('cook', await C('cook'));
  // A deer track by the water: read it.
  const read = await C('track', { radius: 30 });
  // The rack: whatever raw is left (the next catch), dried by evening.
  g.player.x += 3; await C('step', { seconds: 0.3 });
  note('rack', await C('camp', { build: 'rack' }));
  inv.stow('fish_panfish', 2);
  note('hang', await C('camp', { hang: true }));
  // The day goes round: evening.
  await C('setTime', { hour: 19 });
  await C('step', { seconds: 1.2 });
  const dried = note('rack off', await C('camp', { take: true }));
  await C('teleport', BANK); await C('step', { seconds: 0.5 });
  const snare = note('snare', await C('trap', { check: true }));
  // Supper.
  for (const id of ['cooked_fowl', 'cooked_fish', 'dried_meat']) { const i = inv.carried.slots.findIndex((s) => s.id === id); if (i >= 0) inv.use(i); }
  const O = g.outdoors.view();
  return {
    food: { start: +food0.toFixed(2), end: +g.needs.food.toFixed(2) },
    foraged: fg?.found?.map((x) => `${x.n} ${x.item}`) ?? [],
    ducks: { down: ducks.filter((d) => d.dead).length, shot: shot?.killed ? { down: shot.down, hits: shot.hits } : { missed: true, alt: shot?.alt, near: near ? { alt: +near.alt.toFixed(1), d: +Math.hypot(near.x - g.player.x, near.z - g.player.z).toFixed(1) } : null } },
    fish: fish?.fish ?? [], cooked: cooked?.cooked?.map((x) => `${x.n} ${x.to}`) ?? [], rawBeforeCooking: raw0,
    dried: dried?.n ?? 0, snare: snare?.items?.map((x) => `${x.n} ${x.item}`) ?? [],
    ground: read?.said, xp: Object.fromEntries(Object.keys(O.skills).map((k) => [k, +g.skillsSys.xp[k].toFixed(1)])), camp: O.camp.map((o) => o.kind), log,
  };
}
