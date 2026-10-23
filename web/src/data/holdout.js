// What a rebuilt holdout fills its open ground with (world/city.js fillHoldout). Rust Haven's blocks were four lots with a
// building on three and bare paving everywhere else: from the game camera, a town of empty squares (Robert, 2026-10-23:
// "look at how the cities are... burnt out but rebuilt"). A town that has lived through the fall farms, trades and stores
// water where it can guard it, so the open lot by the crossroads is a MARKET and the yards round each building hold
// gardens, tanks, washing lines and shade. Its own random stream, run after everything else: no building or spawn moves.
// Colours: canvas, rust red, saffron, teal, sky blue, olive. No purple (hue 270-320 is banned).

export const HOLDOUT = {
  seed: 5150,
  market: {
    square: 28,              // m: the paved square the market stands on (the plaza lot is 30)
    aisle: 6.5,              // m from the fire to each row of stalls
    slots: [-11, -7.4, -3.8, 3.8, 7.4, 11], // stall centres along a row (none on the fire)
    fill: 0.85,              // share of slots taken
    keepParking: 4.2,        // m clear of the plaza's parking spot
    awnings: ['#b8321e', '#d9861a', '#1f6f7a', '#2a5a9a', '#5f7f22', '#c4521f'],
    canvas: '#dccfae',
    rugs: ['#8a2a1e', '#2a4a6a', '#6a5a2a', '#9a5a2a', '#3a5a3a'],
    counter: ['#8a6a44', '#7a5e3e', '#9a7a52'],
    goods: ['#e0902a', '#c83a2a', '#7aa83a', '#e8c84a', '#d9d2b8', '#5a8a3a', '#b8622a'],
  },
  yard: {
    margin: 3.0,             // m between a building and its lot edge before anything goes in
    doorClear: 4.5,          // m clear of every door
    kinds: [['garden', 5], ['tank', 2], ['washing', 3], ['shade', 2]],
    soil: '#6a4a30', crops: ['#5f8a34', '#76a040', '#4f7a2e', '#8aa848'],
    tank: ['#4f86a0', '#5a7a8a', '#3f6f5a'],
    cloth: ['#c8452f', '#e8dcc0', '#3f6fa8', '#e0a03a', '#2f7f8a', '#d9d2b8', '#7a9a3a'],
    tarp: ['#3f6fa8', '#2f7f8a', '#c8452f', '#7a9a3a', '#e0a03a'],
    post: '#4a3a2a',
  },
  // Living trees. Before this every tree in the game was dead. Phoenix plants palms round its civic squares and palo
  // verde, citrus and mesquite in its yards; a holdout keeps the ones that bear fruit or shade alive with grey water.
  trees: {
    palm: { h: [8, 11.5], trunk: '#8a7258', fronds: ['#3f6a26', '#4a7a2c', '#56802f'], inset: 1.6 },
    yard: [['paloverde', 4], ['citrus', 3], ['mesquite', 3]],
    kinds: {
      paloverde: { h: [3.2, 4.4], r: [2.2, 3.0], squash: 0.5, trunk: '#7a8a4a', canopy: ['#9ab052', '#8aa848', '#a8b860'] },
      citrus: { h: [2.4, 3.0], r: [1.5, 1.9], squash: 0.8, trunk: '#5a4632', canopy: ['#3f6a2a', '#4a7a30', '#36602a'] },
      mesquite: { h: [3.4, 4.6], r: [2.4, 3.2], squash: 0.45, trunk: '#4a3a2a', canopy: ['#5a7a3a', '#6a8a42', '#506e34'] },
    },
    perLot: [1, 2],
    fromBuilding: 2.2,       // m clear of a building's walls (canopies may overhang, trunks may not crowd a wall)
    inset: 2.4,              // m in from the lot edge (the sidewalk is outside it)
  },
};
