// VEHICLES V2 slice 7, WAGONS (Robert 11-12: "we can get wagons, but make sure you can drive into the wagons";
// docs/status/vehicles-v2.md on docs/web-veh-status): the `wagon` command and selftest checks. Rows: data/wagons.js.
import { TEAM, WAGONS, validateWagons, teamPace } from '../data/wagons.js';
import { BREEDS } from '../data/horses.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function vehWagonsCommands(api, need) {
  const g = api.g;
  return {
    wagon: { group: 'vehicle', desc: 'WAGONS: every wagon, its hitched team (horse ids), its pace (maxSpeed m/s, accel) and who drives it.', args: {}, run: async () => ({ wagons: g.wagons?.view() ?? [], counts: g.wagons?.counts ?? null }) },
  };
}

export async function vehWagonsChecks(api, check, C) {
  const g = api.g, W = () => g.wagons, Hs = () => g.horses, I = g.input;
  const made = [], horses = [];
  const off = () => {
    for (const k of ['KeyW', 'KeyE', 'KeyF']) I.down.delete(k);
    if (g.player.inVehicle) g.exitVehicle(true);
    if (g.player.onDeck) g.decks?.dismount?.(g.player, 'test', true);
    for (const v of made.splice(0)) { while (W().teams.get(v.id)?.length) W().unhitch(v); if (g.vehicles.includes(v)) g.vehiclesSys.remove(v); }
    for (const H of horses.splice(0)) { H.hitched = null; Hs().dropBody?.(H, false); const i = Hs().list.indexOf(H); if (i >= 0) Hs().list.splice(i, 1); }
  };
  const tapE = async () => { I.down.add('KeyE'); I.pressed.add('KeyE'); I.phys?.add('KeyE'); I.physHit?.add('KeyE'); await api._step(1); I.down.delete('KeyE'); I.phys?.delete('KeyE'); await api._step(2); };
  const yard = { x: 250, z: 430 };
  // A wagon and a draft horse of yours on open ground (staged: the documented exception).
  const stage = async (breed = 'draft') => {
    await C('teleport', { x: yard.x - 6, z: yard.z }); await api._step(3);
    const v = g.vehiclesSys.spawn('wagon', yard.x, yard.z, 0, '#7a5a3a'); made.push(v);
    const t = W().tongue(v, { x: 0, z: 0 });
    const H = Hs().mk(breed, { x: t.x + 2.5, z: t.z + 1.5, owner: 'player', saddle: true, bond: 40 }); horses.push(H);
    H.tied = { x: H.x, z: H.z };
    for (let f = 0; f < 30; f++) await api._step(1); // its body comes up near you
    return { v, H, t };
  };

  await check('wagons: the rows validate; a covered wagon stands at the Cottonwood stable yard (placed once); it is a real body - a bed, a canvas bonnet on hoops (its roof), big spoked wheels, a tongue', async () => {
    const bad = validateWagons(BREEDS);
    await C('teleport', { x: WAGONS[0].x - 20, z: WAGONS[0].z - 20 }); await api._step(5); // come near the stable yard
    const w = g.vehicles.find((v) => v.type === 'wagon' && v.wagonRow === WAGONS[0].id);
    const n = g.vehicles.filter((v) => v.type === 'wagon' && v.wagonRow === WAGONS[0].id).length;
    const tris = w ? w.mesh.geometry.attributes.position.count / 3 : 0;
    return !bad.length && w && n === 1 && tris > 300 ? true : JSON.stringify({ bad, found: !!w, n, tris });
  });

  await check('wagons: nothing hitched, holding W on the box moves it nowhere; walk your draft horse to the tongue, E hitches it, and on the box W rolls the wagon along with the horse walking at the tongue', async () => {
    try {
      const { v, H, t } = await stage('draft');
      g.enterVehicle(v); await api._step(3);
      const x0 = v.x, z0 = v.z; I.down.add('KeyW'); await api._step(120); I.down.delete('KeyW');
      const still = Math.hypot(v.x - x0, v.z - z0);
      g.exitVehicle(true); await api._step(3);
      await C('teleport', { x: t.x + 0.6, z: t.z - 0.4 }); await api._step(3);
      const spot = W().footSpot(g.player);
      await tapE();
      const team = W().teams.get(v.id)?.length ?? 0;
      g.enterVehicle(v); await api._step(3);
      const x1 = v.x, z1 = v.z; I.down.add('KeyW'); await api._step(300); I.down.delete('KeyW');
      const rolled = Math.hypot(v.x - x1, v.z - z1);
      const HT = Hs().get((W().teams.get(v.id) ?? [])[0]) ?? H; // the horse actually hitched (your nearest free one)
      const a = Hs().bodyOf(HT), at = W().slot(v, 0, 1, { x: 0, z: 0 });
      const atTongue = a ? Math.hypot(a.x - at.x, a.z - at.z) : 99;
      return still < 0.3 && spot?.verb === 'hitch' && team === 1 && rolled > 6 && atTongue < 0.6 ? true : JSON.stringify({ still: r1(still), spot: spot?.verb, team, rolled: r1(rolled), atTongue: r1(atTongue), max: v.maxSpeed });
    } finally { off(); }
  });

  await check('wagons: walk into the bed by the open back (E at the tailboard) - you stand on its floor under the bonnet, and the bed rides along when the team pulls', async () => {
    try {
      const { v, H } = await stage('draft');
      W().hitch(v, H);
      const back = { x: v.x - Math.sin(v.h) * (v.len / 2 + 0.8), z: v.z - Math.cos(v.h) * (v.len / 2 + 0.8) };
      await C('teleport', back); await api._step(3);
      const canClimb = !!g.decks?.canClimb?.(v, g.player);
      await tapE(); await api._step(10);
      const onBed = g.player.onDeck?.v === v;
      // A driver of the company on the box (an NPC) pulls away; you ride in the bed.
      const d = g.addChar({ x: v.x, z: v.z, faction: 'drifter', name: 'Teamster (selftest)', flag: 'US', hp: 200 }); g.seats.board(d, v, 0); v.ai = null;
      const x0 = v.x, z0 = v.z;
      for (let f = 0; f < 180; f++) { v.throttle = 0.8; v.steer = 0; d.throttleHeld = true; await api._step(1); }
      const moved = Math.hypot(v.x - x0, v.z - z0), stillOn = g.player.onDeck?.v === v;
      g.seats.leave(d, true); g.removeChar?.(d);
      return canClimb && onBed && stillOn && moved > 3 ? true : JSON.stringify({ canClimb, onBed, stillOn, moved: r1(moved) });
    } finally { off(); }
  });

  await check('wagons: a draft horse pulls it faster than a pony, two faster than one; unhitched, the horse is left tied at the tongue', async () => {
    const one = teamPace(['draft'], BREEDS), pony = teamPace(['pony'], BREEDS), two = teamPace(['draft', 'draft'], BREEDS);
    try {
      const { v, H } = await stage('draft');
      W().hitch(v, H); const r = W().unhitch(v);
      const tied = !!H.tied && !H.hitched && v.maxSpeed <= 0.011 && v.accel === 0; // no team: no pull, a top speed of (almost) nothing
      return one.accel > pony.accel && two.accel > one.accel && r.ok && tied ? true : JSON.stringify({ one, pony, two, r, tied });
    } finally { off(); }
  });

  await check('wagons: a hitched team rides the save - load it and the same horse is at the tongue and the wagon keeps its pace', async () => {
    try {
      const { v, H } = await stage('draft');
      W().hitch(v, H);
      const sv = (await C('save')).save;
      await C('load', { save: sv });
      const w = g.vehicles.find((q) => q.id === v.id && q.type === 'wagon'), team = W().teams.get(v.id) ?? [];
      if (w && w !== v) made.push(w);
      const H2 = Hs().get(H.id);
      return w && team.includes(H.id) && H2?.hitched === v.id && w.maxSpeed > 0 ? true : JSON.stringify({ w: !!w, team, hitched: H2?.hitched, max: w?.maxSpeed });
    } finally { off(); }
  });
}
