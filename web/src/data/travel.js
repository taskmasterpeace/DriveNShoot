// THE TRAVEL NETWORK AS ROWS (docs/design/WEB_CLONE_TRAVEL.md). How a body that just came up out of the brine gets back
// to its husk: the trundle (bus) on the interstate, the iron (the train), and the one airline that still flies five
// cities. Every stop is a NODE, every line a row of nodes with a timetable on the game clock, every knot (travel port) a
// place where lines meet. systems/travel.js reads it; the World Forge's MAP tab will write it.
//
// A node's `at` says where it is, in whatever the world knows:
//   { town: <usmap town id> }   the town's centre projected onto the line's road (W.locate)
//   { exit: <exit name or "exit N"> }   the same, for an exit
//   { s: <metres along I-10> }   a point on the corridor itself
//   { x, z }                    a world point (a station platform, a halt in the yards)
// A node whose town the map has not built is OFF THE MAP: a line may still run there (the airline does), and arriving
// holds you in its arrivals hall until you buy your way back onto the map.

import { HAUL } from './journeys.js';

export const TRAVEL_RULES = {
  poleOffset: 3.2,        // a pole stands this far off the road's outer shoulder (m)
  boardR: 14,             // you can buy a punch within this many metres of a pole or a counter
  busSpawnAhead: 700,     // the trundle is made real this far up the road from your pole, out of sight, when it is due
  busRealR: 120,          // ... when you are within this distance of the pole, waiting (otherwise the schedule is just a record)
  dueRealS: 50,           // ... this many real seconds before it is due at your pole
  // A skipped ride (napping through it): the clock runs the whole trip; your needs drain as if asleep, never below these.
  napFloor: { water: 0.18, food: 0.18 },
  hallPause: true,        // an off-map arrivals hall pauses the world (you are elsewhere)
  punchMax: 6,            // punches you can hold at once
  stowawayRisk: 0.35,     // riding the iron without a punch: the odds the brakeman throws you off before your stop
};

// ---- nodes -------------------------------------------------------------------------------------------------------------
export const NODES = {
  // THE SUN LINE (I-10, west to east). Knots: Los Angeles, the Iron Crossing, El Paso.
  la_knot:       { name: 'LOS ANGELES KNOT', short: 'LOS ANGELES', at: { s: 160 }, town: 'losangeles', knot: true },
  furnace:       { name: 'FURNACE MILE 9 POLE', short: 'FURNACE MILE 9', at: { exit: 'FURNACE MILE 9' } },
  iron_crossing: { name: 'IRON CROSSING KNOT', short: 'IRON CROSSING', at: { x: -342, z: 0 }, town: 'phoenix', knot: true },
  haven:         { name: 'RUST HAVEN POLE', short: 'RUST HAVEN', at: { x: -30, z: 0 }, town: 'phoenix' },
  sand_trap:     { name: 'SAND TRAP POLE', short: 'THE SAND TRAP', at: { exit: 'THE SAND TRAP' } },
  las_palmas:    { name: 'LAS PALMAS POLE', short: 'LAS PALMAS', at: { exit: 'LAS PALMAS STRIP' } },
  paso_knot:     { name: 'EL PASO KNOT', short: 'EL PASO', at: { town: 'elpaso' }, town: 'elpaso', knot: true },
  // THE SALT LINE (Florida's I-95, south to north: its arc length is miles from Miami). Knot: Meridian, the start.
  miami_knot:    { name: 'MIAMI KNOT', short: 'MIAMI', at: { s: 160, road: 'I-95' }, town: 'miami', knot: true }, // mile 0: the cloning centre's door
  little_river:  { name: 'LITTLE RIVER POLE', short: 'LITTLE RIVER', at: { exit: 'LITTLE RIVER', road: 'I-95' } },
  meridian_knot: { name: 'MERIDIAN KNOT', short: 'MERIDIAN', at: { exit: 'MERIDIAN', road: 'I-95' }, town: 'meridian', knot: true },
  sebastian:     { name: 'SEBASTIAN POLE', short: 'SEBASTIAN', at: { exit: 'SEBASTIAN', road: 'I-95' } },
  daytona:       { name: 'DAYTONA POLE', short: 'DAYTONA', at: { exit: 'DAYTONA', road: 'I-95' } },
  st_augustine:  { name: 'ST. AUGUSTINE POLE', short: 'ST. AUGUSTINE', at: { exit: 'ST. AUGUSTINE', road: 'I-95' } },
  rosewood:      { name: 'ROSEWOOD KNOT', short: 'ROSEWOOD', at: { exit: 'ROSEWOOD', road: 'I-95' }, knot: true },
  // THE IRON LINE (rail x = -360, the freight runs south and loops back in from the north).
  north_halt:    { name: 'NORTH YARD HALT', short: 'NORTH YARD', at: { x: -355.5, z: -1000 }, rail: true },
  dustbowl:      { name: 'DUST BOWL STATION', short: 'DUST BOWL', at: { x: -366, z: 96 }, rail: true, knotOf: 'iron_crossing' },
  south_halt:    { name: 'SOUTH YARD HALT', short: 'SOUTH YARD', at: { x: -355.5, z: 1000 }, rail: true },
  // FIVE CITY AIR. One field on the map (Los Angeles, at its knot); four past the dust.
  la_field:      { name: 'LOS ANGELES FIELD', short: 'LOS ANGELES', at: { s: 160 }, town: 'losangeles', air: true, knotOf: 'la_knot', side: -1 },
  chi_field:     { name: 'CHICAGO LAKE FIELD', short: 'CHICAGO', town: 'chicago', air: true },
  ny_field:      { name: 'NEW YORK HARBOR FIELD', short: 'NEW YORK', town: 'newyork', air: true },
  ohio_field:    { name: 'OHIO RIVER FIELD', short: 'OHIO', town: 'cincinnati', air: true },
  nola_field:    { name: 'NEW ORLEANS LEVEE FIELD', short: 'NEW ORLEANS', town: 'neworleans', air: true },
  // THE LONG HAUL (data/journeys.js HAUL): overland coaches between the big cities past the dust.
  houston_depot: { name: 'HOUSTON COACH DEPOT', short: 'HOUSTON', town: 'houston', haul: true },
};

// ---- lines -------------------------------------------------------------------------------------------------------------
// bus: stops in order along the road (west to east); departures from each end at `first` + k * `every` game hours.
// rail: stations in the order the train meets them; its timetable is the freight's own cycle (systems/train.js).
// air: flights as rows (from, to, the hour it leaves, every how many days, hours aloft, fare).
export const LINES = [
  {
    id: 'sun', kind: 'bus', name: 'SUN LINE', road: 'I-10', slang: 'the trundle',
    stops: ['la_knot', 'furnace', 'iron_crossing', 'haven', 'sand_trap', 'las_palmas', 'paso_knot'],
    first: 6, every: 8,                 // game hours: leaves each end at 06:00, 14:00, 22:00
    speed: 21,                          // m/s cruising (the trundle is slow and heavy)
    dwell: 14,                          // real seconds at a pole
    fare: { base: 6, perMile: 1.1 },    // scrip: base + per game mile
    risk: { perMile: 0.011, night: 1.6 }, // odds a mile of road turns something up; night multiplies
    vehicle: { type: 'bus', paint: '#b06a2a' },
    crew: [{ seat: 0, role: 'driver', weapon: null }, { seat: 1, role: 'guard', weapon: 'shotgun' }],
  },
  {
    // Florida's trundle: the same rules on I-95 (WEB_FLORIDA.md), Meridian's knot in the middle of it. dir +1 = north.
    id: 'salt', kind: 'bus', name: 'SALT LINE', road: 'I-95', dirs: ['NORTH', 'SOUTH'], slang: 'the trundle',
    stops: ['miami_knot', 'little_river', 'meridian_knot', 'sebastian', 'daytona', 'rosewood', 'st_augustine'], // in order up the road (Rosewood's exit is short of St. Augustine's)
    first: 7, every: 8,
    speed: 21, dwell: 14,
    fare: { base: 5, perMile: 1.0 },
    risk: { perMile: 0.012, night: 1.7 },
    vehicle: { type: 'bus', paint: '#3e7a6a' },
    crew: [{ seat: 0, role: 'driver', weapon: null }, { seat: 1, role: 'guard', weapon: 'shotgun' }],
  },
  {
    id: 'iron', kind: 'rail', name: 'IRON LINE', slang: 'the iron',
    stops: ['north_halt', 'dustbowl', 'south_halt'], loop: true,
    speed: 17,                          // the freight's cruise (systems/train.js)
    loopHours: 3,                       // game hours round the loop it runs off the map (south yard back to north yard)
    fare: { base: 4, perMile: 0.8 },
    risk: { perMile: 0.02, night: 1.4 },
  },
  {
    id: 'air', kind: 'air', name: 'FIVE CITY AIR', slang: 'the sky ticket',
    fields: ['la_field', 'chi_field', 'ny_field', 'ohio_field', 'nola_field'],
    flights: [
      { from: 'la_field', to: 'chi_field', dep: 9, everyDays: 2, hours: 5, fare: 1400 },
      { from: 'chi_field', to: 'la_field', dep: 15, everyDays: 2, hours: 5, fare: 1400 },
      { from: 'chi_field', to: 'ny_field', dep: 8, everyDays: 2, hours: 3, fare: 900 },
      { from: 'ny_field', to: 'chi_field', dep: 16, everyDays: 2, hours: 3, fare: 900 },
      { from: 'ny_field', to: 'ohio_field', dep: 10, everyDays: 3, hours: 2, fare: 700 },
      { from: 'ohio_field', to: 'ny_field', dep: 17, everyDays: 3, hours: 2, fare: 700 },
      { from: 'ohio_field', to: 'nola_field', dep: 9, everyDays: 3, hours: 3, fare: 800 },
      { from: 'nola_field', to: 'ohio_field', dep: 14, everyDays: 3, hours: 3, fare: 800 },
      { from: 'nola_field', to: 'la_field', dep: 7, everyDays: 3, hours: 5, fare: 1300 },
      { from: 'la_field', to: 'nola_field', dep: 13, everyDays: 3, hours: 5, fare: 1300 },
      { from: 'la_field', to: 'ny_field', dep: 6, everyDays: 4, hours: 7, fare: 2200 },
      { from: 'ny_field', to: 'la_field', dep: 6, everyDays: 4, hours: 7, fare: 2200 },
    ],
    risk: { perFlight: 0.06 },
  },
];

// THE LONG HAUL (docs/design/WEB_INSURANCE_JOURNEYS.md): its routes are rows in data/journeys.js; as a line its stops are
// every node a route touches. Bought and slept through like a flight (its incidents are cards: it runs past the dust).
LINES.push({ ...HAUL, stops: [...new Set(HAUL.routes.flatMap((r) => [r.from, r.to]))] });

// ---- what the road turns up (a ride's risk roll picks one by weight; `kinds` limits it to some lines) ---------------------
export const EN_ROUTE = [
  { id: 'ambush', weight: 3, kinds: ['bus', 'rail'], text: 'DUSTWOLVES ACROSS THE ROAD', cashShare: 0.3, hurt: [8, 26] },
  { id: 'breakdown', weight: 3, kinds: ['bus'], text: 'THE TRUNDLE THREW A BELT', delay: [2, 5] },
  { id: 'toll', weight: 2, kinds: ['bus'], text: 'A HOLDOUT CHECKPOINT WANTS ITS TOLL', toll: [10, 25] },
  { id: 'herd', weight: 2, kinds: ['bus', 'rail'], text: 'THE DEAD ON THE ROAD: WE PUSHED THROUGH', delay: [1, 2], hurt: [0, 8] },
  { id: 'washout', weight: 2, kinds: ['rail'], text: 'A WASHOUT: THE IRON CREPT FOR HOURS', delay: [2, 6] },
  { id: 'rough_air', weight: 2, kinds: ['air'], text: 'ROUGH AIR, A HARD LANDING', hurt: [4, 14] },
  { id: 'shakedown', weight: 1, kinds: ['air'], text: 'THE CREW SHOOK DOWN THE CABIN', cashShare: 0.15 },
];
