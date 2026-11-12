// THE MONSTER TRUCK (VEHICLES V2 slice 9, Robert 11-12: "the monster truck body, I don't feel like those are monster trucks
// we got now"). Until now a monster truck was a pickup wearing the workshop's MONSTER TYRES (data/workshop.js UTILITY.monster).
// This is a body built for them: a short, bulbous show truck on a tube chassis and long-travel shocks, a roll cage through
// the cab, flared fenders as wide as the tyres, stacks behind the cab, a light bar - and the tractor tyres are part of it
// (it always wears UTILITY.monster: the same lift, crush and climb-over-cars rules the workshop's kit gives a pickup).
// systems/monster.js registers and places it. Pure data: tools/monster.test.mjs validates it in node.
const S2 = [{ id: 'driver', side: 'left', row: 0 }, { id: 'shotgun', side: 'right', row: 0 }];
export const MONSTER_ROW = {
  name: 'MONSTER TRUCK', len: 4.7, wid: 2.3, tall: 2.35, maxSpeed: 35, reverse: 11, accel: 21, turn: 1.85, grip: 6.4, mass: 2.6,
  hp: 380, armor: 0.24, fuelCap: 110, seats: S2, builtIn: { utility: ['monster'] },
};
// The cab's glass (vehiclebodies GREENHOUSE shape): small windows high up.
export const MONSTER_GLASS = { zA: 0.55, roofF: 0.15, roofR: -0.65, zC: -0.75, yB: 1.42, yR: 1.95, wB: 1.9, wR: 1.66, hp: 45 };
// The workshop (data/workshop.js CHASSIS shape): a show truck's frame takes plate and guns like a pickup's.
export const MONSTER_CHASSIS = { maxKg: 1500, spaces: 12, faces: { front: 36, rear: 32, left: 30, right: 30, top: 16, under: 22 },
  mounts: { front: { size: 2, arc: 0.45 }, rear: { size: 2, arc: 0.6 }, left: { size: 1, arc: 0.6 }, right: { size: 1, arc: 0.6 }, top: { size: 2, arc: Math.PI } } };
// Where the world has one: parked at the Dust Bowl (data/workshop.js ARENAS: Rust Haven + 420, 140), the arena's star.
// fuel: the share of its tank left in it (a show truck sits on fumes between shows: find gas before you go far).
export const MONSTERS = [{ id: 'dustbowl_monster', near: { x: 420, z: 128 }, r: 50, h: Math.PI / 2, paint: '#c8a032', fuel: 0.15 }];
export function validateMonster(UTILITY = null) {
  const bad = [];
  if (UTILITY && !UTILITY.monster) bad.push('no MONSTER TYRES utility to wear');
  for (const u of MONSTER_ROW.builtIn.utility) if (UTILITY && !UTILITY[u]) bad.push(`no utility ${u}`);
  const G = MONSTER_GLASS; if (!(G.roofF < G.zA && G.zC < G.roofR && G.yR > G.yB)) bad.push('the cab glass is inside out');
  if (new Set(MONSTERS.map((m) => m.id)).size !== MONSTERS.length) bad.push('a monster placed twice');
  for (const M of MONSTERS) if (!(M.fuel >= 0 && M.fuel <= 0.5)) bad.push(`${M.id}: parked with a full tank (free fuel)`);
  return bad;
}
