// THE FOUND THINGS (docs/design/WEB_FAN_NODS.md). Eight rare, physical things a long-time player of the genre may stop
// and look at twice: a room, two pieces in a glass case, a blade in a ditch, a badge that clicks, a convoy that stops to
// trade, a storm the wrong colour, calendars left on one month, a meal that heats itself. Each is a row in a system that
// already exists (the underground's rooms, the loot tables, the weapons, the gadgets, the roadside, the sky, the props).
// None of them says anything: no sign, no note, no line of text points at where it came from. Objects and places only.
// No purple anywhere (hue 270-320 is banned): every tint below is amber, rust, bottle green, olive, smoke or sea green.

// ---- 1. the tinted-glass room ------------------------------------------------------------------------------------------
// Deep in a few SEALED military bases (data/milbases.js rows), on the deepest level of the bunker under the command post:
// a room holding a six-sided chamber whose walls are thick tinted glass, a different tint in each base. A dead keypad by
// its door, a scorched floor, a cold console. It hums. It does nothing: no machine, no loot, no way anywhere.
// world/undergen.js puts a `glassroom` room (data/underground.js ROOMS) first in the bottom level's programme of a site
// whose base is here; systems/underlook.js draws the glass; systems/underground.js gives its panels their colliders.
//   base   a data/milbases.js row id (must be sealed: nobody home); region: one each, so the rooms are far apart
//   tint   the glass (hex); hue is checked against the purple band by validateFanNods
export const GLASS_ROOMS = [
  { base: 'navajo_depot', region: 'southwest', tint: '#c8901e' },       // amber
  { base: 'avon_park', region: 'southeast', tint: '#3f8a4a' },          // bottle green
  { base: 'yakima_tc', region: 'northwest', tint: '#2f8a7c' },          // sea green
  { base: 'cheyenne_mountain', region: 'mountain', tint: '#a8442a' },   // rust red
  { base: 'fort_leavenworth', region: 'plains', tint: '#7a6450' },      // smoke brown
  { base: 'pease', region: 'northeast', tint: '#8f9a30' },              // olive gold
];
export const GLASS_BY_BASE = new Map(GLASS_ROOMS.map((G) => [G.base, G]));
// The chamber: r centre to corner (m), panel thickness and height, the glass's opacity, how far its hum carries (m) and
// how often it is heard (s), the scorch's radius share.
export const GLASS_CHAMBER = { r: 2.4, thick: 0.22, h: 2.45, opacity: 0.5, hum: 7, humEvery: 2.6, scorch: 0.78 };
// The chamber's six panels round (cx, cz): corners every 60 degrees from +x, so the side facing -z is level with the x
// axis; that side is the door (its leaf stands open). Each panel: its middle, length, the y-rotation that lays a box's
// local x along it, and colliders: small square boxes along it (one long one for the level side) a walker cannot slip
// between. Pure: systems/underground.js (the colliders) and systems/underlook.js (the look) read the same panels.
export function hexPanels(cx, cz, r = GLASS_CHAMBER.r, t = GLASS_CHAMBER.thick) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a0 = (i * Math.PI) / 3, a1 = ((i + 1) * Math.PI) / 3;
    const x0 = cx + r * Math.cos(a0), z0 = cz + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), z1 = cz + r * Math.sin(a1);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const door = i === 4, level = Math.abs(dz) < 1e-6, boxes = [];
    if (!door) {
      if (level) boxes.push({ x0: Math.min(x0, x1), z0: mz - t / 2, x1: Math.max(x0, x1), z1: mz + t / 2 });
      else for (const f of [1 / 6, 1 / 2, 5 / 6]) { const bx = x0 + dx * f, bz = z0 + dz * f, s = 0.42; boxes.push({ x0: bx - s, z0: bz - s, x1: bx + s, z1: bz + s }); }
    } else for (const [px, pz] of [[x0, z0], [x1, z1]]) boxes.push({ x0: px - 0.14, z0: pz - 0.14, x1: px + 0.14, z1: pz + 0.14 }); // the door's posts
    out.push({ i, x: mx, z: mz, len, rot: Math.atan2(-dz, dx), door, ends: [[x0, z0], [x1, z1]], boxes });
  }
  return out;
}

// ---- 2 and 3: the old pieces (rows folded into the shared tables: combat.js WEAPONS, data/ballistics.js ROUNDS,
// data/arms.js MELEE, data/items.js ITEMS and LOOT; one line each there) ------------------------------------------------
// A long-barrelled cap-and-ball revolver with a second, fatter barrel under the first (a real nineteenth-century design):
// nine chambers of lead ball, or flip the hammer's nose and it fires the under-barrel: a load of shot. Slow to load (a
// ball, a pinch of powder and a cap a chamber). It loads one box for both: ball, powder and caps (the shot barrel takes the
// same flask and a handful of the shot that comes in the tin). Generic: no maker's name.
export const FN_WEAPONS = {
  percussion: { name: 'PERCUSSION REVOLVER', short: 'PERCUSSION', cal: 'ball44', dmg: 34, rate: 0.42, mag: 9, reload: 4.2, spread: 0.03, range: 48, auto: false, pellets: 1, ammo: 'capball', sound: 'pistol', shake: 0.34, model: 'revolver', mode: 'ball',
    modes: [{ id: 'ball', name: 'BALL', burst: 1, rate: 0.42, spread: 1, kick: 0.42 },
      { id: 'shot', name: 'SHOT BARREL', burst: 1, rate: 0.9, spread: 4.6, kick: 0.75, dmg: 9, pellets: 9, range: 18, cal: 'capshot' }] },
};
// The rounds it fires: a soft lead ball over black powder (slow, heavy, no casing: you find nothing on the ground), and
// the under-barrel's loose shot. Both come out of the one box.
export const FN_ROUNDS = {
  ball44: { name: '.44 lead ball', short: '.44 ball', ammo: 'capball', velocity: 260, drag: 0.85, dmg: 34, punch: 0.8, sound: 'pistol', casing: null, tracerEvery: 1, tracerW: 0.04, tracerLen: 0.7 },
  capshot: { name: 'loose shot (the under-barrel)', short: 'shot', ammo: 'capball', velocity: 330, drag: 2.8, dmg: 9, punch: 0.35, sound: 'shotgun', casing: null, tracerEvery: 2, tracerW: 0.022, tracerLen: 0.4 },
};
export const FN_ROUND_OF = { capball: 'ball44' };
export const FN_AMMO_ITEM = { capball: 'ammo_capball' };
export const FN_GUN_ITEM = { percussion: 'gun_percussion' };

// The blades are rows of the melee system (data/melee.js MELEE_WEAPONS cane, caneblade, jungleblade; their items
// sword_cane and jungle_blade are MELEE_ITEMS there): the cane's held swing is the drawn blade (its heavy.as).
export const FN_BLADES = { cane: 'sword_cane', caneblade: 'sword_cane', jungleblade: 'jungle_blade' };

// ---- 4 and 8: the badge and the meal ------------------------------------------------------------------------------------
// The lapel counter (systems/fannods.js): carried, it ticks near hot ground (systems/hotground.js zones) before the
// body's own count would: from `reach` m outside a zone's edge, faster the nearer and the hotter. rate: ticks a second at
// the edge (min) and at the middle of the worst ground (max).
export const BADGE = { item: 'lapel_counter', reach: 60, rate: [0.6, 14], vol: 0.12 };
// The self-heating meal: use pulls the tab (a heater under the pouch, no flame), `wait` s later it is hot and in your
// pack as the hot meal; eaten within `hours` game hours it is a hot meal (systems/stats.js: a meal lifts the mood).
export const HEATER = { item: 'heater_meal', hot: 'hot_meal', wait: 25, noise: 3 };

export const FN_ITEMS = {
  gun_percussion: { name: 'Percussion revolver', kind: 'gun', kg: 1.9, bulk: 1.2, stack: 1, value: 520, weapon: 'percussion',
    desc: 'A long-barrelled cap-and-ball revolver, nine chambers round a second, fatter barrel slung under the first. Flip the hammer\'s nose down and it fires that one: a load of shot.' },
  ammo_capball: { name: 'Ball, powder and caps', kind: 'ammo', kg: 0.02, bulk: 0.01, stack: 60, value: 1.6, ammo: 'capball',
    desc: 'Soft lead balls, a flask of black powder, a tin of percussion caps and a bag of shot. Loads the cylinder and the barrel under it alike. Slowly.' },
  lapel_counter: { name: 'Lapel counter', kind: 'tool', kg: 0.05, bulk: 0.03, stack: 1, value: 95, tags: ['electronic'],
    desc: 'A clip-on counter the size of a matchbox. Carry it and it ticks near hot ground, long before you feel it: faster the nearer, faster the hotter.' },
  heater_meal: { name: 'Self-heating meal', kind: 'food', kg: 0.5, bulk: 0.6, stack: 4, value: 34, use: { act: 'heatmeal' },
    desc: 'A sealed meal pouch in a heater bag. Pull the tab and it hisses and warms with no flame; give it half a minute.' },
  hot_meal: { name: 'Hot meal pouch', kind: 'food', kg: 0.45, bulk: 0.5, stack: 4, value: 30, spoils: 2, use: { need: 'food', amount: 0.5, hp: 6, water: 0.02 },
    desc: 'Steaming in its bag. Beef and beans, or something that was. Eat it while it is hot.' },
};
// Where they are found. The case and the ditch are their own tables; `all`: every row once, no roll (systems/inventory.js).
// Each is a ring box: what you take stays taken.
export const FN_LOOT = {
  fn_case: { rolls: [1, 1], none: 0, all: true, rows: [['gun_percussion', 1, 1, 1], ['sword_cane', 1, 1, 1], ['ammo_capball', 1, 9, 18]] }, // the case, and the drawer under it
  fn_ditch: { rolls: [1, 1], none: 0, all: true, rows: [['jungle_blade', 1, 1, 1]] },                                                      // by the bones
};
// Rare rows added to tables that exist (weights against those tables' own; data/items.js folds them).
export const FN_LOOT_ADD = {
  military: [['heater_meal', 1, 1, 2], ['lapel_counter', 0.3, 1, 1]],
  soldier: [['heater_meal', 1, 1, 1]],
  mb_qm: [['heater_meal', 1, 1, 2]],
  mb_hospital: [['lapel_counter', 0.4, 1, 1]],
  ug_guard: [['heater_meal', 1, 1, 2]],
  ug_lab: [['lapel_counter', 0.3, 1, 1]],
  gunsmith: [['ammo_capball', 0.4, 6, 18]],
};

// ---- 6: the burning rain (systems/sky.js WEATHER.SICKSKY) ---------------------------------------------------------------
// chance: the share of weather changes that bring it (the rest roll as ever: about once in a long day's play). The rain's
// colour; dmg: hp a second on bare skin under the open sky (a roof, a hard-topped car, a box trailer or below ground is
// cover; a coat of armour on the chest halves it); warn: once a storm, the moment it first stings. No purple: every hue
// here is 20-140 (validateFanNods checks the sky's tint and the rain).
export const SICK_SKY = { weather: 'SICKSKY', chance: 0.035, rain: '#d8c440', light: '#c8a830', dmg: 1.6, from: 0.45, armorMul: 0.5, flee: 22 };

// ---- 3: the bones in the ditch ------------------------------------------------------------------------------------------
// Out on the interstate (the streamed corridor, systems/semis.js W): a skeleton face-down in the ditch past the shoulder,
// the broad blade in the gravel by its hand (a ring box of fn_ditch: taken once, stays taken). at: share of the corridor's
// length; side: 1 the corridor's +normal side, -1 the other; set: m out past the
// shoulder. Three on the whole road: rare by place.
export const DITCH_BONES = [
  { id: 'ditch_a', at: 0.21, side: 1, set: 3 },
  { id: 'ditch_b', at: 0.53, side: -1, set: 3.5 },
  { id: 'ditch_c', at: 0.86, side: 1, set: 2.8 },
];
export const DITCH = { near: 220, far: 300, reach: 2.2, bone: '#d9d0b8', cloth: '#4a4636', blade: '#7c7e78', grip: '#5a4a32' };

// ---- 5: the armoured trade convoy ---------------------------------------------------------------------------------------
// A freight run (systems/semis.js FREIGHT.rigs.armoured, folded in by systems/fannods.js) of three plated box rigs, slits
// cut along their trailers, two guards riding each trailer's roof. Out on the interstate it rolls up behind you; within
// `halt` m of you it pulls onto the shoulder (pull m out) and stops, the middle trailer's side opens, and a trader works
// the counter from its real boxes (the fn_convoy table, rolled once; trade.js prices: nobody cheats). After `stay` s, or
// when you have been gone `leave` s, the trader climbs back in and it rolls on down the same road, guards still up top.
// chance: a game check every `every` s while you are out on the interstate and no other freight is running.
export const CONVOY = {
  every: 60, chance: 0.06, halt: 120, pull: 6.5, stay: 300, leave: 40, guards: 2, guardHp: 150,
  rigs: [
    { role: 'rig', tractor: 'semi', trailer: 'box', gap: 0, paint: '#4b4c3c', trailerPaint: '#5d5c4a', cargo: [] },
    { role: 'rig', tractor: 'semi', trailer: 'box', gap: 26, paint: '#55503e', trailerPaint: '#605a48', cargo: [] },
    { role: 'rig', tractor: 'semi', trailer: 'box', gap: 52, paint: '#4b4c3c', trailerPaint: '#5d5c4a', cargo: [] },
  ],
  slits: 4, slit: '#141310', plate: '#3e3f34',
  trader: { id: 'fn_convoy', name: 'Convoy trader', deals: ['gun', 'ammo', 'food', 'water', 'med', 'tool', 'part', 'fuel', 'pack'] },
  boxes: 2,
};
// A box trailer's roof as a deck the guards stand on (data/decks.js row shape; no ladder: they ride up there).
export const CONVOY_ROOF = {
  open: true, y: 4.02, floor: [-1.2, 1.2, -5.6, 5.6],
  edges: { front: { h: 0.08 }, rear: { h: 0.08 }, left: { h: 0.08 }, right: { h: 0.08 } },
  doors: [], fixtures: [], containers: [], beds: [], wheel: null, cover: 0.2, throwMul: 0.75,
};
// The counter's real stock: what a hauler crew carries to sell (rolled once a box, as every shelf in the world).
Object.assign(FN_LOOT, {
  fn_convoy: { rolls: [4, 7], none: 0, rows: [['fuel_can', 4, 1, 2], ['ammo_rifle', 4, 20, 60], ['ammo_pistol', 3, 12, 36], ['ammo_shells', 3, 6, 18], ['water_bottle', 4, 1, 3], ['ration', 3, 1, 2], ['heater_meal', 2, 1, 2], ['bandage', 3, 1, 4], ['antibiotics', 1, 1, 1], ['spark_plugs', 2, 1, 2], ['duct_tape', 2, 1, 1], ['spare_tyre', 1, 1, 1]] },
});

// ---- 7: frozen calendars ------------------------------------------------------------------------------------------------
// A paper calendar on the wall of a sealed office or command room below ground (world/undergen.js, by a hash of the room:
// no change to anyone else's layout), turned to the year's first month and never turned again. A page with the month's
// grid; no year anywhere on it. share: the chance a room of each type has one.
export const CALENDAR = { rooms: { office: 0.35, command: 0.5, comms: 0.25, guard: 0.15 }, w: 0.42, h: 0.6, y: 1.55, month: 'JANUARY', firstDay: 1, days: 31 };

// ---- 2: the glass case (data/ring.js FURNITURE, folded in there) --------------------------------------------------------
// A collector's display case against a wall: a dark wood cabinet, a framed glass lid, red felt, and on the felt the long
// revolver (barrel, the fatter barrel under it, the cylinder, the grip) and the cane with its silver knob. Seen from above
// through the lid. Its box is fn_case: both pieces and the drawer's ball and powder, once.
// Where: a shop's sales floor in the Phoenix ring (a pawn shop's front: the ring has some four hundred), rarely: about six.
// data/floorplans.js ROOMS `rare`; the roll is a hash of the room, so no other room's furniture moves. Never on the island
// (world/furnish.js sets noRare): the start town stays as it was.
export const FN_CASE_RARE = { sales: 0.02 };
export const FN_CASE = {
  size: [1.8, 0.62, 1.0], colors: ['#3e2a1c', '#4a3020'], box: { label: 'GLASS CASE', cap: 12, loot: 'fn_case' }, solid: true,
  parts: [
    [0, 1, 0, 1, 0, 0.82, 1],                                   // the cabinet
    [0.03, 0.97, 0.06, 0.94, 0.82, 0.84, '#6a2a22'],            // the felt
    // the revolver: long barrel, the shot barrel under it, the cylinder, the frame, the grip
    [0.58, 0.86, 0.36, 0.42, 0.84, 0.88, '#2b2a28'], [0.6, 0.8, 0.43, 0.48, 0.84, 0.87, '#33312e'],
    [0.53, 0.59, 0.33, 0.5, 0.84, 0.9, '#3a3834'], [0.47, 0.54, 0.38, 0.47, 0.84, 0.88, '#2b2a28'], [0.4, 0.48, 0.44, 0.6, 0.84, 0.88, '#5a3a22'],
    // the cane: the shaft, the silver knob
    [0.07, 0.5, 0.74, 0.79, 0.84, 0.88, '#1c1a18'], [0.03, 0.08, 0.72, 0.81, 0.84, 0.9, '#cfd2c8'],
    // the lid: a glass sheet in a thin brass frame (edges drawn, the sheet faint)
    [0, 1, 0, 0.04, 0.84, 1.0, '#8a6a32'], [0, 1, 0.96, 1, 0.84, 1.0, '#8a6a32'], [0, 0.02, 0, 1, 0.84, 1.0, '#8a6a32'], [0.98, 1, 0, 1, 0.84, 1.0, '#8a6a32'],
  ],
};
// The calendar a room has (a hash of its corner, no rng: nobody else's layout moves), or null. It hangs at CALENDAR.y, facing
// in, on a clear stretch of wall: no tall piece (over 1.2 m: a locker, a shelf, a cabinet) in front of it and not beside the
// room's door. The north wall first (it faces the camera), then the others, the wall farthest from the door first; along
// each wall the middle, then either side.
const h01 = (a, b, c) => { let v = 2166136261 ^ Math.imul(Math.round(a * 10) | 0, 73856093) ^ Math.imul(Math.round(b * 10) | 0, 19349663) ^ Math.imul(c | 0, 83492791); v = Math.imul(v ^ (v >>> 15), 2246822507); v = Math.imul(v ^ (v >>> 13), 3266489909); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
export function calendarOn(room, doors, props = []) {
  const p = CALENDAR.rooms[room.type];
  if (!p || h01(room.x0, room.z0, 7) >= p) return null;
  const d = doors.find((q) => q.room === room.id), off = 0.03, w = room.x1 - room.x0, dd = room.z1 - room.z0;
  const walls = [
    { at: (t) => ({ x: room.x0 + w * t, z: room.z0 + off }), rot: 0, mid: { x: room.x0 + w / 2, z: room.z0 } },
    { at: (t) => ({ x: room.x0 + w * t, z: room.z1 - off }), rot: Math.PI, mid: { x: room.x0 + w / 2, z: room.z1 } },
    { at: (t) => ({ x: room.x0 + off, z: room.z0 + dd * t }), rot: Math.PI / 2, mid: { x: room.x0, z: room.z0 + dd / 2 } },
    { at: (t) => ({ x: room.x1 - off, z: room.z0 + dd * t }), rot: -Math.PI / 2, mid: { x: room.x1, z: room.z0 + dd / 2 } },
  ];
  const order = [walls[0], ...walls.slice(1).sort((a, b) => (d ? Math.hypot(b.mid.x - d.x, b.mid.z - d.z) - Math.hypot(a.mid.x - d.x, a.mid.z - d.z) : 0))];
  const clear = (q) => (!d || Math.hypot(q.x - d.x, q.z - d.z) > 1.4) && !props.some((b) => b.h > 1.2 && q.x > b.x0 - 0.4 && q.x < b.x1 + 0.4 && q.z > b.z0 - 0.4 && q.z < b.z1 + 0.4);
  for (const W of order) for (const t of [0.5, 0.3, 0.7, 0.18, 0.82]) { const q = W.at(t); if (clear(q)) return { x: q.x, z: q.z, rot: W.rot }; }
  return null;
}

// ---- the check (the selftest's and the World Forge's) -------------------------------------------------------------------
// The tables these rows lean on are passed in (no imports: this file is read by them). Returns a list of problems.
export const hueOf = (hex) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m; if (!d) return null; const h = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
export function validateFanNods({ milbases, rooms, props, items, loot, melee, weapons, weather, furniture, floorRooms } = {}) {
  const bad = [], purple = (hex) => { const h = hueOf(hex); return h !== null && h >= 255 && h <= 330; };
  const regions = new Set();
  for (const G of GLASS_ROOMS) {
    const M = milbases?.find((r) => r.id === G.base);
    if (milbases && !M) bad.push(`glass ${G.base}: no such base`);
    else if (M && M.status !== 'sealed') bad.push(`glass ${G.base}: ${M.status}, not sealed`);
    if (regions.has(G.region)) bad.push(`glass ${G.base}: a second room in ${G.region}`);
    regions.add(G.region);
    if (purple(G.tint)) bad.push(`glass ${G.base}: tint ${G.tint} is in the purple band`);
  }
  if (GLASS_ROOMS.length < 4 || GLASS_ROOMS.length > 8) bad.push(`glass rooms: ${GLASS_ROOMS.length} (a few: 4-8)`);
  if (new Set(GLASS_ROOMS.map((G) => G.tint)).size !== GLASS_ROOMS.length) bad.push('glass rooms: two share a tint');
  if (rooms && !rooms.glassroom) bad.push('no glassroom room row');
  if (props && !(props.glasshex?.hex && props.deadconsole)) bad.push('no glasshex / deadconsole prop rows');
  for (const [k, it] of Object.entries(FN_ITEMS)) if (items && items[k] !== it && !items[k]) bad.push(`item ${k}: not folded in`);
  for (const [k, T] of Object.entries(FN_LOOT)) for (const [id] of T.rows) if (items && !items[id]) bad.push(`loot ${k}: no item ${id}`);
  for (const [k, rows] of Object.entries(FN_LOOT_ADD)) for (const [id] of rows) if (items && !items[id]) bad.push(`loot add ${k}: no item ${id}`);
  for (const [w, it] of Object.entries(FN_BLADES)) { if (items && !items[it]) bad.push(`blade ${w}: no item ${it}`); if (melee && melee[w]?.item !== it) bad.push(`blade ${w}: no melee row carried by ${it}`); }
  if (melee && melee.cane?.heavy?.as !== 'caneblade') bad.push('the cane held does not draw its blade');
  if (weapons && !weapons.percussion?.modes?.some((m) => m.id === 'shot' && m.pellets > 1)) bad.push('the percussion revolver has no shot barrel');
  const W = weather?.[SICK_SKY.weather];
  if (weather && !W) bad.push('no burning-rain weather row');
  for (const hex of [W?.tint, SICK_SKY.rain, SICK_SKY.light].filter(Boolean)) { const h = hueOf(hex); if (h === null || h < 20 || h > 140) bad.push(`burning rain colour ${hex}: hue ${h} outside 20-140`); }
  if (!(SICK_SKY.chance > 0 && SICK_SKY.chance <= 0.06)) bad.push(`burning rain chance ${SICK_SKY.chance}: rare is at most 0.06`);
  if (!(DITCH_BONES.length >= 1 && DITCH_BONES.length <= 5 && DITCH_BONES.every((r) => r.at > 0 && r.at < 1 && Math.abs(r.side) === 1))) bad.push('ditch rows');
  if (!(CONVOY.chance > 0 && CONVOY.chance <= 0.1 && CONVOY.rigs.length >= 2 && CONVOY.rigs.length <= 3)) bad.push('convoy: rare, two or three rigs');
  for (const t of Object.keys(CALENDAR.rooms)) if (rooms && !rooms[t]) bad.push(`calendar: no room ${t}`);
  if (/\d{4}/.test(JSON.stringify(CALENDAR))) bad.push('calendar: a year');
  if (furniture && furniture.glasscase?.box?.loot !== 'fn_case') bad.push('no glasscase furniture with the fn_case box');
  for (const [k, p] of Object.entries(FN_CASE_RARE)) { if (!(p > 0 && p <= 0.2)) bad.push(`case ${k}: ${p} is not rare`); if (floorRooms && !floorRooms[k]?.rare?.some(([t]) => t === 'glasscase')) bad.push(`case: room ${k} has no rare row`); }
  if (loot && !(loot.fn_case?.all && loot.fn_ditch?.all && loot.fn_convoy)) bad.push('the case, ditch and convoy tables');
  return bad;
}
