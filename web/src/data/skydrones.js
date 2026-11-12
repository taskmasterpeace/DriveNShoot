// SKY DRONES (VEHICLES V2 slice 11, Robert 11-12: "we definitely need drones"). The pack already carries your own (the scout
// and the drop drone, data/gadgets.js DRONES) and a casino flies security drones over its property (data/casinos.js). These
// are the factions' own, out in the open: a NEST at a base launches a WATCHER (recon: it flies a loop, and when it sees you
// it follows you overhead and, if its people want you dead, radios it in) and a GUN DRONE (armed: it sits on the pad until
// a watcher calls, then flies to you, circles and fires bursts). Both are real fliers: they hold their height, bank into
// turns, run their battery down and fly home to charge, can be shot down (aim at them) and fall and break, leaving what
// they were made of. A nest builds a lost drone again after a day. systems/skydrones.js flies them. Pure data:
// tools/skydrones.test.mjs validates it in node.

// sight: [day, night] m on the ground under and around it (a crouch cuts it by crouchMul); loop: the patrol circle's radius
// round the nest (m); battery: s in the air (boosting home costs nothing extra); recharge: s on the pad; call: s between
// radio calls while it sees you; gun: a burst of `burst` rounds `rate` s apart, then `rest` s, inside `range` m, each
// round `dmg` of calibre `cal` with `spread` rad of wobble; orbit: the circle it fires from (m).
export const SKY_DRONES = {
  watcher: { name: 'WATCHER DRONE', role: 'recon', alt: 10, speed: 9, hp: 35, sight: [32, 18], crouchMul: 0.6, battery: 260, recharge: 90, call: 3,
    color: '#5b5f52', eye: '#ff3b2a', salvage: [['scrap', 1], ['spark_plugs', 1]] },
  striker: { name: 'GUN DRONE', role: 'armed', alt: 7, speed: 15, hp: 70, sight: [40, 24], crouchMul: 0.7, battery: 160, recharge: 120, orbit: 16,
    gun: { dmg: 9, cal: 'smg', rate: 0.11, burst: 5, rest: 1.7, range: 38, spread: 0.05 },
    color: '#3e423a', eye: '#ffb02a', salvage: [['scrap', 2], ['spark_plugs', 1], ['ammo_smg', 12]] },
};
// How far a nest wakes (m from you: past it its drones sit on the pad, nothing is simulated), how long a watcher keeps a
// lost track before it gives up (s), when a gun drone gives up and goes home (s with no sighting), how long a nest takes to
// build a lost drone again (game hours), how far its people hear its radio (m).
// (wake is kept under the 380 m from Rust Haven's square to the nearest nest: in the starting town none is simulated.)
export const NEST_RULES = { wake: 260, lose: 6, giveUp: 12, rebuild: 24, radio: 300, low: 0.15 };

// The nests. at: the pad (world m); faction/fid: whose (a character's faction and its society faction id, systems/factions.js:
// your standing with it decides whether they call you in);
// loop: the watcher's circle; flies: what lives there.
export const DRONE_NESTS = [
  { id: 'outpost_nine_nest', name: 'OUTPOST NINE DRONE PAD', faction: 'soldier', fid: 'remnant', at: { x: -290, z: -386 }, loop: 75, flies: ['watcher', 'striker'] },
  // The Dustwolves' watch over the Last Chance Road in the Glass Flats: their riders work that road (radio reaches them).
  { id: 'dustwolf_roost', name: 'DUSTWOLF ROOST', faction: 'raider', fid: 'dustwolves', at: { x: -120, z: 380 }, loop: 85, flies: ['watcher', 'striker'] },
];

export function validateSkyDrones(ITEMS = null) {
  const bad = [];
  for (const [k, D] of Object.entries(SKY_DRONES)) {
    if (!(D.alt > 4 && D.speed > 0 && D.hp > 0 && D.battery > 0)) bad.push(`${k}: a flier needs height, speed, hp and a battery`);
    if (D.role === 'armed' && !(D.gun?.dmg > 0 && D.gun.range > 0 && D.orbit > 0)) bad.push(`${k}: an armed drone needs a gun and an orbit`);
    if (D.role === 'armed' && D.gun.range < D.orbit + 4) bad.push(`${k}: it cannot reach you from its orbit`);
    if (ITEMS) for (const [id] of D.salvage) if (!ITEMS[id]) bad.push(`${k}: salvage ${id} is not an item`);
  }
  const ids = new Set();
  for (const N of DRONE_NESTS) {
    if (ids.has(N.id)) bad.push(`${N.id}: twice`); ids.add(N.id);
    for (const f of N.flies) if (!SKY_DRONES[f]) bad.push(`${N.id}: no drone ${f}`);
    if (!N.faction) bad.push(`${N.id}: whose?`);
  }
  return bad;
}
