// TANKS (VEHICLES V2 slice 8, Robert 11-12: "old tanks and new tanks"). Two tracked bodies, no make or model: an OLD TANK
// (a riveted pre-war hull, a short gun in a round turret, slow and loud) and a MAIN BATTLE TANK (a flat angular hull and
// turret, a long gun, quick for its weight). Each is a vehicle row, a workshop chassis (its gun a TOP mount at the turret's
// own spot, systems/garage.js draws the turret there and it swings to aim), a gun row (a shell is a heavy rocket: it flies
// and bursts) with its own shell item, and a place in the world. Placed once; the old one stands on its plinth with an
// empty gun and a dry tank (find shells and diesel), the new one sits at the Remnant's outpost with a few rounds in it.
// systems/tanks.js registers and places them. Pure data: tools/tanks.test.mjs validates it in node.

const HULL = (o) => ({ armor: 0.03, open: false, tracked: true, ...o });
export const TANK_ROWS = {
  tank_old: HULL({ name: 'OLD TANK', len: 6.2, wid: 2.9, tall: 2.45, maxSpeed: 11, reverse: 4, accel: 7, turn: 0.95, grip: 8.6, mass: 9, hp: 1500,
    fuelCap: 320, seats: [{ id: 'driver', side: 'left', row: 0 }, { id: 'commander', side: 'right', row: 1, exposed: 'stand', at: [0, 2.35, -0.55] }] }),
  tank_new: HULL({ name: 'MAIN BATTLE TANK', len: 7.6, wid: 3.5, tall: 2.45, maxSpeed: 18, reverse: 7, accel: 10, turn: 1.05, grip: 9.2, mass: 11, hp: 2600, armor: 0.02,
    fuelCap: 520, seats: [{ id: 'driver', side: 'left', row: 0 }, { id: 'commander', side: 'right', row: 1, exposed: 'stand', at: [0.55, 2.45, -0.7] }] }),
};

// The guns: a shell flies like a heavy rocket and bursts; `turret` [w, h, d] and `barrel` (m) are what garage.js draws.
export const TANK_GUNS = {
  cannon75: { name: '75 MM GUN', kind: 'rocket', size: 3, kg: 1100, price: 4200, labour: 4, faces: ['top'], type: 'blast', rare: 'prewar',
    dmg: 260, blast: 4.5, speed: 110, rate: 3.2, spread: 0.008, range: 190, mag: 12, ammo: 'shell_75', perItem: 1, turret: [1.9, 0.75, 2.2], barrel: 2.6, bore: 0.17,
    desc: 'A short gun in a riveted turret, older than anyone who could tell you about it. Every round shakes the dust out of the hull.' },
  cannon120: { name: '120 MM GUN', kind: 'rocket', size: 3, kg: 1600, price: 9000, labour: 6, faces: ['top'], type: 'blast', rare: 'prewar',
    dmg: 420, blast: 6, speed: 160, rate: 4.0, spread: 0.005, range: 240, mag: 16, ammo: 'shell_120', perItem: 1, turret: [2.5, 0.7, 2.9], barrel: 4.4, bore: 0.15,
    desc: 'A long smoothbore in a flat turret. It does not miss so much as arrive.' },
};
export const TANK_AMMO = {
  shell_75: { name: '75 mm shell', kind: 'ammo', kg: 9, bulk: 6, stack: 2, value: 120, tags: ['car_ammo'], desc: 'A brass case as long as your forearm. The old gun takes them one at a time.' },
  shell_120: { name: '120 mm round', kind: 'ammo', kg: 20, bulk: 11, stack: 1, value: 260, tags: ['car_ammo', 'prewar'], desc: 'A combustible case, a dart of a round. Two people carry these if they are smart.' },
};

// The workshop (data/workshop.js CHASSIS shape; `at` = the turret's spot in the body frame).
export const TANK_CHASSIS = {
  tank_old: { maxKg: 6000, spaces: 22, faces: { front: 80, rear: 50, left: 64, right: 64, top: 40, under: 30 },
    mounts: { front: { size: 1, arc: 0.3 }, top: { size: 3, arc: Math.PI, at: [0, 2.0, -0.25] } } },
  tank_new: { maxKg: 9000, spaces: 28, faces: { front: 110, rear: 60, left: 80, right: 80, top: 50, under: 40 },
    mounts: { front: { size: 1, arc: 0.3 }, top: { size: 3, arc: Math.PI, at: [0, 2.02, -0.55] } } },
};

// Where the world has them. near: the spot asked for; the system puts it on the nearest clear ground within `r` m.
// kit: the gun it carries and how many rounds are in it (the old one's is empty), its fuel (the old one's is dry).
export const TANKS_PLACED = [
  { id: 'memorial_tank', type: 'tank_old', near: { x: 46, z: -46 }, r: 40, h: 0.6, paint: '#4e5a3a', kit: { top: 'cannon75', rounds: 0, front: 'mg1' }, fuel: 0, plinth: true },
  { id: 'outpost_tank', type: 'tank_new', near: { x: -250, z: -350 }, r: 60, h: -2.2, paint: '#6a6448', kit: { top: 'cannon120', rounds: 4, front: 'mg' }, fuel: 0.35 },
];

export function validateTanks(MW = {}, CHASSIS_ = {}) {
  const bad = [];
  for (const [id, r] of Object.entries(TANK_ROWS)) {
    if (!TANK_CHASSIS[id]) bad.push(`${id}: no chassis`);
    if (!(r.hp > 1000 && r.armor < 0.06)) bad.push(`${id}: not armoured like a tank`);
    if (!r.seats.some((s) => s.exposed)) bad.push(`${id}: no hatch`);
  }
  for (const [id, W] of Object.entries(TANK_GUNS)) {
    if (!TANK_AMMO[W.ammo]) bad.push(`${id}: no ammo item ${W.ammo}`);
    if (W.kind !== 'rocket' || !(W.blast > 0)) bad.push(`${id}: a shell bursts`);
    if (MW[id] && MW[id] !== W) bad.push(`${id}: a different mount row of that name exists`);
  }
  for (const P of TANKS_PLACED) {
    if (!TANK_ROWS[P.type]) bad.push(`${P.id}: no row ${P.type}`);
    const W = TANK_GUNS[P.kit.top]; if (!W) bad.push(`${P.id}: no gun ${P.kit.top}`);
    else if (P.kit.rounds > W.mag) bad.push(`${P.id}: more rounds than the gun holds`);
    const C = TANK_CHASSIS[P.type]; if (C && W && W.size > C.mounts.top.size) bad.push(`${P.id}: the gun is too big for the turret ring`);
  }
  return bad;
}
