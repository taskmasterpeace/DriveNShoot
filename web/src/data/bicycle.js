// THE BICYCLE (VEHICLES V2 slice 10, Robert 11-12: "the bicycle"). No engine, no fuel: your legs are the motor. It leans
// and seats you like a motorcycle (vehicles.js `bike`), it is quiet (no engine sound), it never runs dry - and it runs on
// your STAMINA: pedalling drains it, SHIFT stands on the pedals (faster, drains more), coasting gets it back, and winded you
// only creep. systems/bicycle.js registers the row and body, does the legs, and leans a few against walls in town (placed
// once, found, never minted). Pure data: tools/bicycle.test.mjs validates it in node.

export const BICYCLE_ROW = {
  name: 'BICYCLE', len: 1.8, wid: 0.62, tall: 1.15, maxSpeed: 10, reverse: 1.2, accel: 3.4, turn: 3.2, grip: 5.6, mass: 0.09,
  hp: 22, armor: 0.95, fuelCap: 0, open: true, bike: true, noEngine: true, pedal: true,
  seats: [{ id: 'driver', side: 'left', row: 0, exposed: 'bike' }],
};

// The legs. drain/stand: stamina a second at full pedal (seated / standing on the pedals with SHIFT); stand: the push it
// gives; winded: the push left when you are out of breath (below `low`); regen: a second, coasting (a little under on foot).
// basket: litres it carries (a wire basket on the rack; a motorcycle's saddlebags are 22).
export const PEDAL = { drain: 0.045, standDrain: 0.13, stand: 1.4, winded: 0.3, low: 0.05, regen: 0.16, basket: 12 };

// Where bicycles lean: near a town spot, on the nearest clear dry ground within r m. Placed once each, the first time you
// come near. paint: the frame colour (no purple).
// Kept away from Rust Haven's start (where the selftest stages its cars) on purpose.
export const BICYCLES = [
  { id: 'cottonwood_bicycle', near: { x: -2462, z: 14 }, r: 30, h: -1.2, paint: '#a33a2a' },
  { id: 'westroad_bicycle', near: { x: -320, z: 160 }, r: 40, h: 0.6, paint: '#2f6f8a' },
];

// The hue of a #rrggbb colour in degrees (-1 for a grey): the no-purple law is hues 260-330.
export function hue(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.04) return -1;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function validateBicycle() {
  const bad = [], R = BICYCLE_ROW;
  if (!R.noEngine || R.fuelCap !== 0) bad.push('a bicycle has no engine and no tank');
  if (!R.bike) bad.push('a bicycle leans and seats you like a bike');
  if (R.seats.length !== 1) bad.push('one rider');
  if (!(PEDAL.standDrain > PEDAL.drain && PEDAL.stand > 1 && PEDAL.winded < 1 && PEDAL.regen > 0)) bad.push('the legs: standing pushes harder and costs more, winded is weaker');
  if (new Set(BICYCLES.map((b) => b.id)).size !== BICYCLES.length) bad.push('a bicycle placed twice');
  for (const b of BICYCLES) { const h = hue(b.paint); if (h >= 260 && h <= 330) bad.push(`${b.id}: purple paint`); }
  return bad;
}
