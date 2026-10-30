// TOWING AS ROWS (docs/design/WEB_MOVE_TOW.md). Lines between two vehicles (or a vehicle and a gate, a wreck), the winch,
// the wrecker's boom, the boat trailer, the mud that holds a car. systems/towing.js reads every number here.
//
// A LINE row:
//   item      what you carry to make it (data/items.js row this file registers); null = part of a vehicle (a winch, a boom)
//   len       its length when it is fixed (m); a winch's cable pays out to `range` and reels in
//   k, damp   a spring that only pulls: tension = k * stretch + damp * stretch rate (never below 0). A rope gives, a chain doesn't
//   maxStretch  past this it is a hard stop (the line holds the two ends at len + maxStretch)
//   breakLoad tension (smoothed over `filter`) that parts it: a rope snaps, a chain's link opens. Units: vehicle mass x m/s^2
//   rigid     a bar: it pushes as well as pulls, and the towed body swings on the pivot (an articulated hitch)
//   lift      the boom lifts the towed car's front wheels: it rolls on two, with less drag, and can't steer itself
export const LINES = {
  rope:  { name: 'tow rope', item: 'tow_rope', len: 5, k: 38, damp: 5, maxStretch: 1.4, breakLoad: 21, color: '#c8b48a', sag: 0.9, w: 0.05 },
  chain: { name: 'tow chain', item: 'tow_chain', len: 4, k: 150, damp: 14, maxStretch: 0.35, breakLoad: 100, color: '#6f6b64', sag: 0.45, w: 0.07 },
  cable: { name: 'winch cable', item: null, len: 30, range: 30, k: 120, damp: 12, maxStretch: 0.5, breakLoad: 48, color: '#a39d92', sag: 0.3, w: 0.04, winch: true },
  boom:  { name: "wrecker's boom", item: null, len: 0.35, rigid: true, lift: true, breakLoad: 400, color: '#2a2622', sag: 0, w: 0.12 },
  hitch: { name: 'trailer hitch', item: null, len: 0.25, rigid: true, breakLoad: 400, color: '#2a2622', sag: 0, w: 0.1 },
};

// The system's own numbers.
//   reach         how far behind the puller's tail (or ahead of its nose, for a winch) the hook finds something (m)
//   filter        the tension is smoothed over ~1/filter s before it can break a line (one bad frame snaps nothing)
//   towedDrag     a towed car rolls in neutral: this much rolling drag (/s; a car left alone brakes at 1.4/s)
//   liftedDrag    on the boom: two wheels up, less drag still
//   deadDrag      a burned-out car drags on its rims (x towedDrag)
//   reelSpeed     the winch takes in this much cable a second while held (m/s); it stalls under stallLoad
//   inertia       a body's turn resistance = mass x len^2 x inertia (how hard a line at its nose swings it round)
//   snapFling     a parted line whips: sparks and this much shake at the puller's tail
//   gate          a gate or a door on a line comes down past this tension; a static wreck pulls loose past wreckLoad
//   tieSlack      a rope or a chain is tied off with only this much slack (m): you take it up as you hook on; a line
//                 left long snatches, and a snatch from a run-up parts a rope
export const TOW = {
  reach: 4.5, filter: 6, towedDrag: 0.3, liftedDrag: 0.14, deadDrag: 1.8, reelSpeed: 1.3, stallLoad: 44, inertia: 0.09, snapFling: 0.5,
  gateLoad: 9, wreckLoad: 6, tieSlack: 0.4, segs: 10, maxLinks: 12,
};

// MUD: soft ground holds a car that sits or spins its wheels in it. A pit is a row { x, z, r, depth } (data below, plus
// any the world or a command stages). bog 0..1: how deep the car is in.
//   sink       bog gained a second while the wheels spin in it (throttle, slow), sinkIdle while it just sits there
//   firm       bog lost a second when the wheels are on firm ground again
//   power      the engine's pull is x (1 - bog * power): at bog 1 it barely turns the wheels
//   drag       rolling drag added (/s, x bog)
//   stuckAt    past this the car is BOGGED: it won't drive itself out (the HUD says so)
//   pullFree   a line's tension frees it: bog -= tension / (mass x pullFree) a second (a winch or a tow)
//   freeAt     under this it is out
//   soft, softPower  in a pit before it holds: rolling drag (/s) and the engine's pull lost, x the pit's depth
export const MUD = { soft: 2.4, softPower: 0.55, sink: 0.55, sinkIdle: 0.04, firm: 0.5, power: 0.96, drag: 6, stuckAt: 0.55, pullFree: 22, freeAt: 0.12, spinSpeed: 3, maxBog: 1 };
// Mud pits in the world (soft ground at water's edge). Only a pit holds a car: a wet surface alone never does (rain over
// the whole desert would bog every car on the road).
export const MUD_PITS = []; // rows { id, x, z, r, depth }: the world's soft spots (systems/towing.js adds the lake shore's at boot)

// THE BOAT TRAILER and the ramp. A ramp is any shore where the trailer's tail stands in water at least `tailDepth` deep
// while its wheels are no deeper than `wheelMax` (concrete or not: a gravel bank works). There a carried boat floats off
// (launch) and a boat nosed onto the bunks is winched up (haul out).
//   bunkY     the boat rides this high on the bunks (m); bunkZ its offset along the trailer
//   loadReach a boat's bow within this of the winch post, slow (< loadSpeed), straight (< loadAngle rad) can be hauled
//   haulSpeed the winch pulls it up the bunks this fast (m/s)
export const TRAILER = { tailDepth: 0.3, wheelMax: 0.95, bunkY: 0.62, bunkZ: -0.2, loadReach: 3.2, loadSpeed: 2.5, loadAngle: 0.55, haulSpeed: 1.2, launchPush: 2.2 };

// The vehicles this lane adds (systems/towing.js folds them into VEHICLES with ??=, as systems/semis.js does).
// The bodies are systems/movetowbodies.js: the wrecker is a pickup cab with a boom bed, the trailer a frame with bunks.
const STAND = 'stand';
export const TOW_VEHICLES = {
  towtruck:    { name: 'WRECKER', base: 'pickup', look: 'wrecker', len: 5.6, wid: 2.25, tall: 2.0, maxSpeed: 33, reverse: 11, accel: 16, turn: 1.95, grip: 6.4, mass: 2.6, hp: 300, armor: 0.24, fuelCap: 95,
                 seats: [{ id: 'driver', side: 'left', row: 0 }, { id: 'shotgun', side: 'right', row: 0 }], tow: 'boom', winch: true },
  boattrailer: { name: 'BOAT TRAILER', base: 'boattrailer', len: 5.4, wid: 2.1, tall: 0.95, maxSpeed: 30, reverse: 10, accel: 0, turn: 0, grip: 6, mass: 0.45, hp: 120, armor: 0.5, fuelCap: 0,
                 trailer: true, noEngine: true, seats: [] },
  // A fishing skiff: an outboard, a tiller console, two thwarts, a fish box. Light and shallow.
  skiff:       { name: 'FISHING SKIFF', base: 'skiff', len: 4.8, wid: 1.9, tall: 1.3, maxSpeed: 24, reverse: 6, accel: 14, turn: 2.2, grip: 2.4, mass: 0.8, hp: 110, armor: 0.5, fuelCap: 40, open: true, boat: true, shallow: true,
                 seats: [{ id: 'driver', side: 'left', row: 1, exposed: STAND, at: [0.25, 0.5, -1.55] }, { id: 'bow', side: 'right', row: 0, exposed: STAND, at: [-0.15, 0.5, 0.9] }] },
  // A pontoon barge: a plank deck on two steel tubes, rails, a canopy, an outboard. Slow; carries a crowd and their gear.
  barge:       { name: 'PONTOON BARGE', base: 'barge', len: 7.4, wid: 3.0, tall: 2.4, maxSpeed: 12, reverse: 5, accel: 6, turn: 0.9, grip: 2.0, mass: 2.6, hp: 260, armor: 0.4, fuelCap: 60, open: true, boat: true, shallow: true,
                 seats: [{ id: 'driver', side: 'left', row: 1, exposed: STAND, at: [0.75, 0.62, -2.6] }, { id: 'p1', side: 'right', row: 0, exposed: STAND, at: [-0.8, 0.62, 1.4] }, { id: 'p2', side: 'left', row: 0, exposed: STAND, at: [0.8, 0.62, 1.4] }] },
};

// The pack items (data/items.js rows; systems/towing.js registers them with ??=). Found where cars are: garages,
// junkyards, the pumps; bought from a trader who has them. Never conjured: a line you attach leaves your pack (it is on
// the cars now), unhitching gives it back, a line that parts is gone.
export const TOW_ITEMS = {
  tow_rope:  { name: 'Tow rope', kind: 'tool', kg: 2.2, bulk: 1.2, stack: 1, value: 22, tags: ['tow'],
    desc: 'Six metres of braided nylon with a hook spliced in each end. It stretches and it takes a jerk, until it doesn\'t.' },
  tow_chain: { name: 'Tow chain', kind: 'tool', kg: 7.5, bulk: 1.6, stack: 1, value: 40, tags: ['tow', 'steel'],
    desc: 'Five metres of grade chain with a grab hook. Heavy, no give at all, and it will drag a truck.' },
};

export function validateTowing(rows = LINES, vehicles = TOW_VEHICLES) {
  const bad = [];
  for (const [id, L] of Object.entries(rows)) {
    if (!(L.len > 0)) bad.push(`${id}: len`);
    if (!(L.breakLoad > 0)) bad.push(`${id}: breakLoad`);
    if (!L.rigid && !(L.k > 0 && L.damp >= 0 && L.maxStretch > 0)) bad.push(`${id}: spring`);
    if (L.item && !TOW_ITEMS[L.item]) bad.push(`${id}: item ${L.item} has no row`);
    if (isPurple(L.color)) bad.push(`${id}: purple`);
  }
  if (rows.rope && rows.chain && !(rows.chain.breakLoad > rows.rope.breakLoad)) bad.push('a chain must hold more than a rope');
  for (const [id, v] of Object.entries(vehicles)) if (!(v.len > 0 && v.mass > 0 && v.hp > 0)) bad.push(`vehicle ${id}`);
  if (!(MUD.stuckAt > MUD.freeAt)) bad.push('MUD: stuckAt must exceed freeAt');
  if (!(TRAILER.wheelMax > TRAILER.tailDepth)) bad.push('TRAILER: wheelMax must exceed tailDepth');
  return { ok: !bad.length, bad };
}
function isPurple(hex) {
  const n = parseInt(hex.replace('#', ''), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx - mn < 0.08) return false;
  let h = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn); h = (h * 60 + 360) % 360;
  return h >= 270 && h <= 320;
}
