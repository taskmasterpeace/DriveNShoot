import { rows, one, vehicleBodies } from './tables/vehicles/index.js';
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
export const LINES = rows('TowLines');

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
export const TOW = one('TowSettings');

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
export const MUD = one('MudSettings');
// Mud pits in the world (soft ground at water's edge). Only a pit holds a car: a wet surface alone never does (rain over
// the whole desert would bog every car on the road).
export const MUD_PITS = []; // rows { id, x, z, r, depth }: the world's soft spots (systems/towing.js adds the lake shore's at boot)

// THE BOAT TRAILER and the ramp. A ramp is any shore where the trailer's tail stands in water at least `tailDepth` deep
// while its wheels are no deeper than `wheelMax` (concrete or not: a gravel bank works). There a carried boat floats off
// (launch) and a boat nosed onto the bunks is winched up (haul out).
//   bunkY     the boat rides this high on the bunks (m); bunkZ its offset along the trailer
//   loadReach a boat's bow within this of the winch post, slow (< loadSpeed), straight (< loadAngle rad) can be hauled
//   haulSpeed the winch pulls it up the bunks this fast (m/s)
export const TRAILER = one('BoatTrailerSettings');

// The vehicles this lane adds (systems/towing.js folds them into VEHICLES with ??=, as systems/semis.js does).
// The bodies are systems/movetowbodies.js: the wrecker is a pickup cab with a boom bed, the trailer a frame with bunks.
export const TOW_VEHICLES = vehicleBodies('tow');

// The pack items (data/items.js rows; systems/towing.js registers them with ??=). Found where cars are: garages,
// junkyards, the pumps; bought from a trader who has them. Never conjured: a line you attach leaves your pack (it is on
// the cars now), unhitching gives it back, a line that parts is gone.
export const TOW_ITEMS = rows('TowItems');

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
