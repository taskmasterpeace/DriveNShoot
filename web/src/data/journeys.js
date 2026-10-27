// RISKY JOURNEYS AS ROWS (docs/design/WEB_INSURANCE_JOURNEYS.md). Robert, 2026-10-27: "You gotta literally catch a bus from
// one city to another and you gotta hope that nothing happens on the way there." And: "You should literally have to catch
// the bus back home... then you gotta find some transportation from there to go to where your base is." And: "make the
// game fun. But at the same time, it should be brutal."
//
// A trip is not a teleport. Each leg rolls for an INCIDENT from these rows, weighted by the stretch of road's danger, the
// hour, the weather and who holds the road. Near you (the leg in the streamed world) the incident plays out on the map
// with the real coach and its passengers; off the map (a long haul between cities past the dust, or a trip you sleep
// through) it is a card with choices and consequences. systems/journeys.js reads these; systems/travel.js calls it.
// No purple; our own words (tools/ip-lint.mjs).

export const JOURNEY_RULES = {
  // Real time aboard a coach on the map: one roll per `rollEveryM` metres of road with you aboard, one incident per leg.
  rollEveryM: 400,
  realMul: 1,            // real-time odds per metre = the leg's odds per mile scaled to the metres (x this)
  // A slept trip rolls once for the whole leg: p = min(maxP, (1 - (1 - perMile * danger)^miles) * night * weather).
  maxP: 0.85,
  night: { from: 20, to: 5 },
  // The cord: pull it and the driver stops at the roadside wherever the coach is (not at a pole); you step down beside it.
  cord: { brake: 3.4, stopSpeed: 1.0, dropR: 30, side: 3.2 },
  // Getting home on foot: the planner's walking legs (and its cost: shoe leather is cheap but slow).
  walk: { speed: 1.4, maxLegM: 3500, costPerKm: 6 },
  // Hitching: thumb out at the roadside of an interstate, and every `everyS` real seconds a car may come by; the odds it
  // stops go with what the road thinks of you (the standing of whoever drives it).
  hitch: { everyS: 18, base: 0.35, perStanding: 0.006, min: 0.05, max: 0.85, spawnBack: 260, rideMaxM: 9000, types: ['pickup', 'sedan'], refuseBelow: -40 },
  // Passengers aboard a real coach: [min, max], seated in the coach's rows. They are people with flags and factions.
  passengers: [2, 4],
  passengerKinds: [
    { faction: 'drifter', weight: 5, weapon: null },
    { faction: 'drifter', weight: 2, weapon: 'pistol' },
    { faction: 'drifter', weight: 1, weapon: 'shotgun' },
  ],
  // The town bulls take these off you at a checkpoint (what they tax, or call stolen).
  contraband: ['rotgut', 'lockpicks', 'gun_auto', 'gun_rifle', 'ammo_rifle', 'painkillers'],
};

// The road by stretches: how dangerous, and who holds it (their incidents weigh more there). road: a corridor id; from/to
// in miles along it. A trip's danger is the worst stretch it touches; off-map hauls name their own danger.
export const ROAD_STRETCHES = [
  { road: 'I-10', from: 0, to: 7, danger: 1.3, held: 'remnant', name: 'the Los Angeles approaches' },
  { road: 'I-10', from: 7, to: 22, danger: 1.6, held: 'dustwolves', name: 'the long desert' },
  { road: 'I-10', from: 22, to: 30, danger: 0.7, held: 'rusthaven', name: 'Rust Haven\'s road' },
  { road: 'I-10', from: 30, to: 60, danger: 1.5, held: 'dustwolves', name: 'the Sand Trap reach' },
  { road: 'I-95', from: 0, to: 6, danger: 1.2, held: null, name: 'the Miami causeways' },
  { road: 'I-95', from: 6, to: 12, danger: 0.6, held: 'rusthaven', name: 'Meridian\'s road' },
  { road: 'I-95', from: 12, to: 40, danger: 1.3, held: null, name: 'the Atlantic coast road' },
];
// Weather multiplies the odds (sky.weatherKey).
export const WEATHER_MUL = { CLEAR: 1, OVERCAST: 1, RAIN: 1.2, STORM: 1.5, DUST: 1.45, FOG: 1.3, ASHFALL: 1.25 };

// The incidents. kinds: which lines they happen on (bus = the trundle on the map, haul = the long haul past the dust);
// weight: base weight; night: weight multiplier at night; held: weight multiplier when that faction holds the stretch;
// weather: per-weather weight multiplier. choices: what you can do (the first is what happens if you do nothing: the
// default a sleeper, a timeout or an agent with no choice= gets). A choice's consequences:
//   delay [a,b] game hours · hurt [a,b] hp · cashShare (of your pockets) · cost [a,b] scrip (can't pay: the next choice)
//   bag (the best stack you carry is taken) · search (contraband taken, a fine [a,b] if any was found) · putOff (you are
//   left at the roadside where it happened: walk) · fight { odds, win: {...}, lose: {...} } (rolled: the passengers and the
//   guard fight with you) · back (the thief's take comes back) · stand (on-map: the bus waits for you to settle it).
// take: what happens before you choose (the thief's hand in your pocket).
export const INCIDENTS = [
  {
    id: 'breakdown', kinds: ['bus', 'haul'], weight: 3, night: 1, weather: { ASHFALL: 1.6, DUST: 1.4 },
    title: 'THE COACH THREW A BELT', text: 'Steam out of the grille, the driver down in the engine with a torch. Could be an hour, could be the night.',
    choices: [
      { id: 'wait', t: 'Wait with the others while the driver fixes it', delay: [1.5, 5] },
      { id: 'walk', t: 'Get your bag down and walk from here', putOff: true },
    ],
  },
  {
    id: 'roadblock', kinds: ['bus', 'haul'], weight: 2.5, night: 1.6, held: { dustwolves: 2.2 },
    title: 'RAIDERS ACROSS THE ROAD', text: 'Wrecks dragged across both lanes, rifles on the roofs. A man walks out with a tin cup for the toll.',
    choices: [
      { id: 'pay', t: 'Pay your share of the toll', cost: [15, 45] },
      { id: 'fight', t: 'Fight it out with the guard and the passengers', fight: { odds: 0.55, win: { delay: [0.3, 0.8], hurt: [0, 10] }, lose: { hurt: [18, 38], cashShare: 0.6, delay: [1, 2] } } },
      { id: 'bag', t: 'Hand over a bag', bag: true },
    ],
  },
  {
    id: 'infected', kinds: ['bus', 'haul'], weight: 2, night: 2, weather: { FOG: 1.6, STORM: 1.3 },
    title: 'THE DEAD ON THE ROAD', text: 'A herd across the lanes ahead, more coming out of the brush. The driver looks back at you all.',
    choices: [
      { id: 'push', t: 'Tell him to push through', hurt: [0, 12], delay: [0.2, 0.6] },
      { id: 'holdup', t: 'Kill the engine and wait them out', delay: [3, 6] },
    ],
  },
  {
    id: 'checkpoint', kinds: ['bus', 'haul'], weight: 1.6, night: 0.6, held: { rusthaven: 2.6, remnant: 2.8 },
    title: 'THE TOWN BULLS WAVE YOU DOWN', text: 'A checkpoint: sandbags, a flag on a pole, two of them with long guns. Everybody off with their bags.',
    choices: [
      { id: 'submit', t: 'Open your bag for the search', search: true, fine: [10, 30], delay: [0.4, 1] },
      { id: 'bribe', t: 'Fold some scrip into your papers', cost: [20, 55], delay: [0.1, 0.3] },
    ],
  },
  {
    id: 'thief', kinds: ['bus', 'haul'], weight: 1.8, night: 1.4,
    title: 'A HAND IN YOUR POCKET', text: 'You wake with your coat open. The passenger across the aisle will not meet your eye.',
    take: { cashShare: 0.3 },
    choices: [
      { id: 'let', t: 'Let it go' },
      { id: 'accuse', t: 'Grab them and take it back', fight: { odds: 0.6, win: { back: true }, lose: { hurt: [6, 18] } } },
    ],
  },
  {
    id: 'detour', kinds: ['bus', 'haul'], weight: 1.5, night: 1, weather: { STORM: 2, RAIN: 1.5 },
    title: 'THE ROAD IS OUT', text: 'A washed-out span, a sign hand-painted on a door. The driver takes the long way round the county roads.',
    choices: [{ id: 'ride', t: 'Sit back: nothing to do about it', delay: [1, 4] }],
  },
  {
    id: 'crash', kinds: ['bus', 'haul'], weight: 0.7, night: 1.8, weather: { FOG: 2, STORM: 1.6, DUST: 1.6 },
    title: 'THE COACH WENT OVER', text: 'A blowout at speed. Glass, dust, somebody screaming. The coach is on its side in the ditch and it is not getting up.',
    choices: [{ id: 'climb', t: 'Climb out through a window and walk', hurt: [8, 26], putOff: true }],
  },
];

// The LONG HAUL: overland coaches between the big cities, past the dust (off the map), on their own timetable. They are
// how a body that came up in Houston gets home to Arizona, or Florida to Texas. Each run is a leg that rolls an incident
// card. dep: the hour it leaves; everyDays; hours on the road; danger multiplies the per-mile odds; miles for the roll.
export const HAUL = {
  id: 'haul', kind: 'haul', name: 'THE LONG HAUL', slang: 'the long haul', perMile: 0.004,
  routes: [
    { from: 'houston_depot', to: 'paso_knot', dep: 5, everyDays: 1, hours: 30, fare: 140, miles: 740, danger: 1.4 },
    { from: 'paso_knot', to: 'houston_depot', dep: 18, everyDays: 1, hours: 30, fare: 140, miles: 740, danger: 1.4 },
    { from: 'houston_depot', to: 'nola_field', dep: 7, everyDays: 1, hours: 14, fare: 60, miles: 350, danger: 1.1 },
    { from: 'nola_field', to: 'houston_depot', dep: 16, everyDays: 1, hours: 14, fare: 60, miles: 350, danger: 1.1 },
    { from: 'nola_field', to: 'miami_knot', dep: 6, everyDays: 2, hours: 34, fare: 150, miles: 860, danger: 1.3 },
    { from: 'miami_knot', to: 'nola_field', dep: 20, everyDays: 2, hours: 34, fare: 150, miles: 860, danger: 1.3 },
    { from: 'chi_field', to: 'ohio_field', dep: 9, everyDays: 1, hours: 12, fare: 55, miles: 300, danger: 1.0 },
    { from: 'ohio_field', to: 'chi_field', dep: 14, everyDays: 1, hours: 12, fare: 55, miles: 300, danger: 1.0 },
  ],
};
