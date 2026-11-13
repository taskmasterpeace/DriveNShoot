// DAMAGE YOU FEEL (VEHICLES V2, Robert 11-12: "if you get a flat tire, it feels like it, so on and so forth"). The car's
// parts were already tracked (systems/vehicledamage.js: engine, radiator, tank, lamps, four tyres, four dent zones); these
// rows say how each hurt reads WITHOUT the HUD - through the wheel, the body, the sound and what the car leaves behind:
//   a flat     pulls toward its side, caps the speed, the body sags onto it and shudders with the wheel; a front one
//              shimmies the steering, a rear one swings the tail; it flaps, then (fast, or once the rim is going) scrapes
//   the rim    driven on, it wears (sparks, less grip, less speed) until the wheel is gone
//   alignment  a hard hit to the front bends it: a steady pull even on good tyres
//   brakes     beaten by front hits (and worn, systems/upkeep.js): long stops, then a pedal that fades, then near nothing
//   heat       a holed radiator boils (steam) and then the engine SEIZES: no power until it has cooled right down
//   bumper     a caved-in end the bumper hangs from drags: sparks, a scrape, a little drag, and it tears off in the end
//   the engine hurt badly it smokes all the time (black when it is nearly gone) and misfires
//   glass      a hard front crash cracks the windshield (systems/carcombat.js shows the web)
//   the tank   a holed tank leaves its trail and runs you dry (vehicledamage.js, already)
// The fixes take real parts found in the world (loot rows below): a spare tyre AND a jack to change a wheel, a plug kit to
// plug a flat on a sound rim, a wrench to straighten the front and pull a hanging bumper, brake pads (and a wrench) for the
// brakes, coolant to bring a boiled engine back. systems/damagefeel.js runs all of it. Pure data: tools/damagefeel.test.mjs.

export const FLAT = {
  front: { pull: 0.11, shimmy: 0.05, grip: 0.12, top: 0.1 },   // pull: steering bias toward the flat; shimmy: its wobble
  rear: { pull: 0.045, tail: 0.16, grip: 0.14, top: 0.1 },      // tail: the yaw swing (rad/s at speed) a rear flat gives
  runflat: 0.4,                                                // run-flat inserts take this share of it (data/workshop.js)
  allFour: 0.35,                                               // four flats: the most of its top speed it can make (a crawl)
  sag: 0.045, shudder: 0.016,                                   // body roll toward a flat (rad), plus its once-a-turn shudder
  flapBelow: 13,                                               // m/s: under this a flat flaps; over it (or on a bad rim) it scrapes
  wheelR: 0.36,                                                // m: the wheel's radius (the shudder's rate is its turning)
};
export const RIM = {
  life: 1400,              // m on a flat until the wheel is gone (faster on the throttle)
  scrapeAt: 0.5,           // rim left under this: it scrapes at any speed
  gone: { grip: 0.14, top: 0.12, squat: 0.55 }, // a wheel with no rim left: more again, and the body sits lower on it
  sparks: [10, 30],        // sparks a second: on a fresh flat at speed, on a ruined rim
};
export const ALIGN = { perHit: 0.9, pull: 0.12, min: 0.12 };   // a front hit of k bends it k x perHit (toward the struck side)
export const BRAKES = { perHit: 0.5, fadeAt: 0.4, failAt: 0.12, fade: [0.2, 0.55], failed: 0.1, grindBelow: 0.5 };
export const HEAT = { seize: 1.25, restart: 0.5, cool: 0.07 }; // temp scale of vehicledamage.js (1 = the boil); cool: per s, seized
export const DRAG = { from: 0.45, top: 0.94, tearAfter: 450, sparks: 8 }; // dent to hang, speed share, m until it tears off
export const SMOKE = { below: 0.3, every: 0.25 };                // engine health under which it smokes all the time
export const GLASS = { perHit: 120 };                           // windshield hp taken by a front crash of k = 1

// The fixes. item: what it takes (spent), tool: what you must have (kept, it wears), secs: the hold, at: where you kneel.
export const FIXES = {
  tyre:  { label: 'Changing the tyre', item: 'spare_tyre', tool: 'car_jack', secs: 14, at: 'wheel' },
  plug:  { label: 'Plugging the tyre', item: 'tyre_plug', tool: null, secs: 6, at: 'wheel', rimMin: 0.6, gives: 0.85 },
  align: { label: 'Straightening the front', item: null, tool: 'wrench', secs: 10, at: 'front' },
  bumper: { label: 'Pulling the hanging bumper', item: null, tool: 'wrench', secs: 5, at: 'end' },
  brakes: { label: 'Fitting brake pads', item: 'brake_pads', tool: 'wrench', secs: 12, at: 'front' },
};
export const COOLANT = { drop: 0.85, radiator: 0.25, leakCap: 0.6 }; // a jug poured: the heat it takes off, the stop-leak it adds (never past leakCap: it slows a hole)

// The parts, as items, and where the world has them (loot rows: [item, weight, min, max] into data/items.js LOOT tables).
export const FEEL_ITEMS = {
  car_jack: { name: 'Car jack', kind: 'tool', kg: 4.5, bulk: 6, stack: 1, value: 30, tags: ['jack', 'steel'],
    desc: 'A scissor jack and its crank. With a spare, a flat is fourteen seconds on your knees.' },
  tyre_plug: { name: 'Tyre plug kit', kind: 'part', kg: 0.3, bulk: 0.4, stack: 3, value: 18,
    desc: 'Sticky cords and a reamer. Plugs a puncture if the rim under it is still round.' },
  brake_pads: { name: 'Brake pads', kind: 'part', kg: 1.2, bulk: 1, stack: 2, value: 26,
    desc: 'A set of pads in a greasy box. With a wrench, the pedal bites again.' },
  coolant_jug: { name: 'Coolant', kind: 'part', kg: 4, bulk: 4.2, stack: 2, value: 16, use: { act: 'coolant' },
    desc: 'A green jug, half of it water. Poured into a boiled engine it brings it back, and the stop-leak in it slows a holed radiator.' },
};
export const FEEL_LOOT = {
  garage: [['car_jack', 2, 1, 1], ['tyre_plug', 3, 1, 2], ['brake_pads', 2, 1, 1], ['coolant_jug', 3, 1, 1]],
  pumps: [['tyre_plug', 2, 1, 1], ['coolant_jug', 3, 1, 1], ['car_jack', 1, 1, 1]],
};

// Multiplayer: the state a passenger (or anyone looking) must see and hear, packed in one integer that rides the presence
// sample (net/protocol.js cleanPresence keeps it to DM_MAX).
export const DM_BITS = { flat: 0, rimGone: 4, smoke: 8, steam: 9, leak: 10, dragF: 11, dragR: 12, seized: 13, pullL: 14, pullR: 15, brakes: 16 };
export const DM_MAX = (1 << 17) - 1;
const TY = ['FL', 'FR', 'RL', 'RR'];
export function encodeDm(s) {
  let n = 0;
  TY.forEach((t, i) => { if (s.flat?.[t]) n |= 1 << (DM_BITS.flat + i); if (s.rimGone?.[t]) n |= 1 << (DM_BITS.rimGone + i); });
  for (const k of ['smoke', 'steam', 'leak', 'dragF', 'dragR', 'seized', 'pullL', 'pullR', 'brakes']) if (s[k]) n |= 1 << DM_BITS[k];
  return n;
}
export function decodeDm(n) {
  n = Math.max(0, Math.min(DM_MAX, Math.round(Number(n) || 0)));
  const s = { flat: {}, rimGone: {} };
  TY.forEach((t, i) => { s.flat[t] = !!(n & (1 << (DM_BITS.flat + i))); s.rimGone[t] = !!(n & (1 << (DM_BITS.rimGone + i))); });
  for (const k of ['smoke', 'steam', 'leak', 'dragF', 'dragR', 'seized', 'pullL', 'pullR', 'brakes']) s[k] = !!(n & (1 << DM_BITS[k]));
  return s;
}

export function validateFeel(ITEMS = null, LOOT = null) {
  const bad = [];
  if (!(FLAT.front.pull > FLAT.rear.pull)) bad.push('a front flat pulls the wheel harder than a rear one');
  if (!(FLAT.rear.tail > 0 && !FLAT.front.tail)) bad.push('only a rear flat swings the tail');
  if (!(FLAT.allFour < 0.5)) bad.push('four flats are a crawl');
  if (!(RIM.life > 200 && RIM.scrapeAt > 0 && RIM.scrapeAt < 1)) bad.push('a rim lasts a while, then scrapes');
  if (!(BRAKES.failAt < BRAKES.fadeAt && BRAKES.failed < BRAKES.fade[0])) bad.push('brakes fade before they fail');
  if (!(HEAT.restart < 1 && HEAT.seize > 1)) bad.push('it seizes past the boil and restarts well under it');
  for (const [k, F] of Object.entries(FIXES)) {
    for (const id of [F.item, F.tool]) if (id && !(FEEL_ITEMS[id] || ITEMS?.[id])) bad.push(`${k}: no item ${id}`);
    if (!(F.secs > 0)) bad.push(`${k}: a fix takes time`);
  }
  if (!FIXES.tyre.item || !FIXES.tyre.tool) bad.push('a wheel change takes a spare AND a jack');
  for (const [t, rows] of Object.entries(FEEL_LOOT)) {
    if (LOOT && !LOOT[t]) bad.push(`loot table ${t} is not one`);
    for (const [id] of rows) if (!FEEL_ITEMS[id]) bad.push(`loot ${t}: ${id} is not a feel item`);
  }
  const all = { flat: { FL: 1, FR: 1, RL: 1, RR: 1 }, rimGone: { FL: 1, FR: 1, RL: 1, RR: 1 }, smoke: 1, steam: 1, leak: 1, dragF: 1, dragR: 1, seized: 1, pullL: 1, pullR: 1, brakes: 1 };
  if (encodeDm(all) !== DM_MAX) bad.push('the damage word does not use every bit it says');
  return bad;
}
