// WAGONS (VEHICLES V2 slice 7, Robert 11-12: "we can get wagons, but make sure you can drive into the wagons").
// WEB_ATLAS.md: the Border Wagon Road, the Wagon Master, the Carnival Caravan. A covered wagon is a vehicle with no engine:
// it goes when a horse is hitched to its tongue (a horse from the horses ledger, systems/horses.js: your own, standing near),
// at the team's pace. You drive it from the box; you walk into its covered bed by the open back (a deck, systems/decks.js).
// systems/wagons.js runs it. Pure data: tools/wagons.test.mjs validates it in node.

export const WAGON_ROW = {
  name: 'COVERED WAGON', len: 5.4, wid: 2.0, tall: 2.95, maxSpeed: 0, reverse: 1.2, accel: 0, turn: 1.0, grip: 5.2, mass: 1.3,
  hp: 220, armor: 0.55, fuelCap: 0, noEngine: true, open: true, team: 2,
  seats: [
    { id: 'driver', side: 'left', row: 0, exposed: 'bike', at: [0.42, 1.55, 1.95] },
    { id: 'box', side: 'right', row: 0, exposed: 'bike', at: [-0.42, 1.55, 1.95] },
  ],
  deck: 'wagonBed',
};

// The bed under the bonnet: a floor you stand on, the canvas sides and front, the open back you walk in by, a chest.
export const WAGON_DECK = {
  open: false, y: 1.0, floor: [-0.86, 0.86, -2.45, 1.35],
  edges: { front: { h: 1.7 }, rear: { h: 1.7 }, left: { h: 1.7 }, right: { h: 1.7 } },
  doors: [{ id: 'tail', edge: 'rear', span: [-0.78, 0.78] }],
  windows: { rear: [[-0.78, 0.78]] },
  fixtures: [],
  containers: [{ id: 'chest', label: 'WAGON CHEST', box: [0.3, 0.86, 0.75, 1.35], h: 0.55, cap: 120, loot: null }], // empty: what you put in it
  beds: [{ id: 'bedroll', box: [-0.86, -0.2, -1.9, -0.2], h: 0.12, at: [-0.53, -1.05], face: 0 }],
  wheel: null, seatsInside: false, ceil: 1.75,
};

// The team: how hard each breed pulls (data/horses.js BREEDS), the wagon's pace from the slowest, the hitch's places.
export const TEAM = {
  pull: { draft: 1.0, quarter: 0.8, mustang: 0.72, pony: 0.5 }, // a draft horse is made for it; a pony barely moves it
  pace: 0.62,        // the wagon's top speed: the slowest hitched horse's canter x this (a loaded wagon trots at best)
  accel: 1.6,        // per unit of pull
  max: 2,
  tongue: 0.5,       // m past the front of the bed: where the tongue's end is (the hitch spot you stand at)
  ahead: 2.1,        // m from the front of the bed to the horse's middle
  pair: 0.68,        // m either side for a pair
  reach: 2.4,        // m: how close to the tongue you stand to hitch or unhitch
  lead: 9,           // m: how near your horse must stand to be hitched (you lead it the last steps)
};

// Where the world has one (placed once, never minted): the stable yard at Cottonwood (data/horses.js STABLES), sold
// with nothing hitched - the stable's draft horse is for sale beside it.
export const WAGONS = [
  { id: 'cottonwood_wagon', x: -2486, z: 12, h: Math.PI / 2, paint: '#7a5a3a' },
];

export function validateWagons(BREEDS = null) {
  const bad = [];
  if (BREEDS) for (const b of Object.keys(BREEDS)) if (!(TEAM.pull[b] > 0)) bad.push(`no pull for breed ${b}`);
  const F = WAGON_DECK.floor;
  if (!(F[0] < F[1] && F[2] < F[3])) bad.push('the bed floor is inside out');
  if (F[3] > WAGON_ROW.len / 2 || F[2] < -WAGON_ROW.len / 2 || F[1] > WAGON_ROW.wid / 2) bad.push('the bed floor runs past the wagon');
  if (!WAGON_DECK.doors.some((d) => d.edge === 'rear')) bad.push('no way into the bed from the back');
  if (WAGON_ROW.fuelCap !== 0 || !WAGON_ROW.noEngine) bad.push('a wagon has no engine');
  const ids = new Set(); for (const w of WAGONS) { if (ids.has(w.id)) bad.push(`wagon ${w.id} twice`); ids.add(w.id); }
  return bad;
}
// The team's numbers from the hitched breeds: { maxSpeed, accel } (no team: it does not move).
export function teamPace(breeds, BREEDS) {
  if (!breeds.length) return { maxSpeed: 0, accel: 0 };
  let slow = Infinity, pull = 0;
  for (const b of breeds) { slow = Math.min(slow, BREEDS[b].speed.canter); pull += TEAM.pull[b] ?? 0.5; }
  return { maxSpeed: slow * TEAM.pace, accel: pull * TEAM.accel };
}
