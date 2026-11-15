import { rows, one } from './tables/vehicles/index.js';
// THE WORKSHOP (docs/design/WEB_WORKSHOP.md): building a car as a budget, as rows. Fan service for the car-duelling
// games (their SHAPES: armour on SIX FACES, weapons with firing arcs, a TAILGATE KIT of droppers, THE BREACH) in our own
// names and numbers. systems/garage.js wears these on a vehicle, systems/workshop.js fires them and runs the counter,
// ui/workshop.js is the screen. Every new plate, gun, gadget, round, arena or shop is a ROW here.
//
// Local vehicle frame (as everywhere): +z forward, +x the driver's left. Faces: front | rear | left | right | top | under
// (the screen says BACK for rear). A mount point is named for the face it sits on: hood = front, tail = rear, pods =
// left/right, roof turret = top. Bearings are radians off the nose, + toward the driver's left.

export const FACES6 = ['front', 'rear', 'left', 'right', 'top', 'under'];
export const FACE_LABEL = { front: 'FRONT', rear: 'BACK', left: 'LEFT', right: 'RIGHT', top: 'TOP', under: 'UNDER' };
export const FACE_BEARING = { front: 0, left: Math.PI / 2, right: -Math.PI / 2, rear: Math.PI, top: 0, under: 0 };

// ---- ARMOUR: what a face is plated with -------------------------------------------------------------------------------
// One kind per face; points are slabs. A point stops `absorb` hit points (x `vs[type]` for that kind of hit) and weighs kg.
//   faces    where it can go (a ram plate is a nose, spikes are flanks)
//   labour   game hours per point to weld on (and half that to cut off)
//   crash    multiplier on the dents THIS car takes on that face in a collision (a ram plate shrugs)
//   ram      multiplier on what that face does to whatever it hits (rams, plows, spikes)
//   grabbers spikes rip hands off: grip lost per second by anybody hanging on that face, and damage per second
// Damage types: bullet (rounds, the hood guns), fire (flame, beams), blast (rockets, mines, grenades), pierce (the rail gun).
export const ARMOR = rows('ArmorTypes');

// ---- CHASSIS: what each body can carry --------------------------------------------------------------------------------
// maxKg: everything bolted on (armour + mounts + utility) in kilograms; spaces: room for guns and gadgets; faces: plate
// points per face; mounts: the points a gun or dropper can go on, by face, with its size (1 small .. 3 heavy) and arc
// (half-angle, radians, about the face bearing; the turret is a full circle). A body not listed cannot be worked on.
export const CHASSIS = rows('Chassis');
// The old Kenji dialogue (data/parts.js PLATE_MAX) is a floor: every legacy face fits under these.

// ---- PERFORMANCE: what the load does (the formula, docs/design/WEB_WORKSHOP.md §4) -------------------------------------
//   mass   = base.mass + kg / 1000                          (tonnes)
//   ratio  = base.mass / mass
//   accel  = base.accel * ratio * turbo
//   top    = base.maxSpeed * (1 - topLoss * (1 - ratio)) * turbo.top
//   turn   = base.turn * ratio ^ turnExp
//   brake  = ratio ^ brakeExp                               (a multiplier on the brakes, vehicledamage.effects fx.brake)
//   over maxKg: refused at the counter; a body cannot be loaded past it
export const PERF = one('PerfSettings');

// ---- POWER: energy weapons drink it (laser, rail, EMP) ----------------------------------------------------------------
// Every engine has an alternator (cap, regen per second while it runs); batteries and the power plant add to it.
export const POWER = one('PowerSettings');

// ---- MOUNTS: guns, launchers and droppers -----------------------------------------------------------------------------
//   kind     hitscan | rocket | flame | beam | rail | harpoon | emp | drop
//   size     mount size it needs; faces: which mount points take it
//   group    which trigger fires it at the wheel: 1 aimed (hood, pods: LMB / pad LB), 2 the tail (B / pad B),
//            3 the turret (RMB / pad VIEW+RB) - set by the mount point it sits on unless the row says (droppers are 2)
//   mag      loaded rounds (or charges); ammo: the item that reloads it and perItem rounds one item gives
//   power    energy per shot; charge: seconds held before it fires (the rail gun); rare: 'prewar' tech is found, not bought
//   type     the damage type its hits do to armour (ARMOR.vs)
// The old ids (mg, oil, caltrops, smoke) are the same rows they always were (data/parts.js MOUNTS), with the new fields.
export const MOUNT_WEAPONS = rows('MountWeapons');

// ---- UTILITY: what is not a gun -------------------------------------------------------------------------------------
//   space     spaces it takes; mods: what it changes (read by garage.retune / workshop / the minimal hooks it names)
export const UTILITY = rows('Utility');

// ---- AMMO as items (registered into data/items.js ITEMS by systems/workshop.js) ----------------------------------------
export const AMMO_ITEMS = rows('AmmoItems');

// ---- PAINT: the body's colour (the shop's spray booth; cosmetic, priced, a row each) ----------------------------------
export const PAINTS = rows('Paints');

// ---- REPAIR prices (per point of plate, per part, at the counter) ---------------------------------------------------
export const REPAIR = one('RepairPrices');

// ---- THE SHOPS: where the workshop opens ------------------------------------------------------------------------------
//   keeper   an NPC id (open while they are there and awake); at x,z within r for a fixed site (the cities lane stamps
//            a town garage as a row like these); rate: scrip per labour hour; stock: which rows it sells (all, or a list);
//            rare: whether it deals in 'uncommon' / 'prewar' rows (otherwise they are installed only from your pack)
export const WORKSHOPS = rows('Workshops');

// ---- ARENAS: places the cities lane stamps (WEB_JUMPS ramps exist; these are the destruction sets) --------------------
//   kind      arena (a walled bowl) | track (a loop with checkpoints)
//   props     rows of things to put down: barrels (destructible stacks: hp, blast), kicker (a WEB_JUMPS ramp), wall, wreck
//   event     what runs there: 'loaner' lends you a junker for one race (win: keep it), 'derby' last car moving
export const ARENAS = rows('Arenas');
// The LOANER NIGHT: the promoter's junker, a race, and the title if you finish first.
export const LOANER = one('Loaner');

// ---- validation (the World Forge and selftest use it) ---------------------------------------------------------------
export function validateWorkshop(rows = { ARMOR, CHASSIS, MOUNT_WEAPONS, UTILITY, AMMO_ITEMS, ARENAS, WORKSHOPS }) {
  const bad = [];
  for (const [id, a] of Object.entries(rows.ARMOR)) {
    if (!(a.kg > 0 && a.absorb > 0 && a.price > 0)) bad.push(`armor ${id}: kg, absorb, price must be > 0`);
    for (const f of a.faces) if (!FACES6.includes(f)) bad.push(`armor ${id}: unknown face ${f}`);
  }
  for (const [id, c] of Object.entries(rows.CHASSIS)) {
    if (!(c.maxKg > 0)) bad.push(`chassis ${id}: maxKg`);
    for (const f of Object.keys(c.mounts)) if (!FACES6.includes(f)) bad.push(`chassis ${id}: mount on unknown face ${f}`);
  }
  for (const [id, w] of Object.entries(rows.MOUNT_WEAPONS)) {
    if (!['hitscan', 'rocket', 'flame', 'beam', 'rail', 'harpoon', 'emp', 'drop'].includes(w.kind)) bad.push(`mount ${id}: kind ${w.kind}`);
    if (!(w.size >= 1 && w.size <= 3)) bad.push(`mount ${id}: size 1..3`);
    if (w.ammo && !rows.AMMO_ITEMS[w.ammo]) bad.push(`mount ${id}: ammo item ${w.ammo} has no row`);
    if (w.kind === 'drop' && !w.faces.every((f) => f === 'rear' || f === 'top')) bad.push(`mount ${id}: droppers go on the tail`);
  }
  for (const [id, u] of Object.entries(rows.UTILITY)) {
    if (!(u.kg >= 0 && u.space >= 0 && u.price > 0)) bad.push(`utility ${id}: kg, space, price`);
    if (u.ammo && !rows.AMMO_ITEMS[u.ammo]) bad.push(`utility ${id}: ammo item ${u.ammo} has no row`);
    if (u.tread && !(u.tread.paved > 0 && u.tread.dirt > 0 && u.set === 'tread')) bad.push(`utility ${id}: a tread needs paved, dirt and set 'tread'`);
    if (u.chassis && !u.chassis.every((c) => rows.CHASSIS[c])) bad.push(`utility ${id}: unknown chassis`);
    if (u.needs && !Object.values(rows.MOUNT_WEAPONS).some((w) => w.kind === u.needs)) bad.push(`utility ${id}: needs a ${u.needs} mount that has no row`);
    if (u.slash && !(u.slash.r > 0 && u.slash.every > 0)) bad.push(`utility ${id}: slash r, every`);
    if (u.beam && !(u.beam.reach > 0 && u.beam.power >= 0)) bad.push(`utility ${id}: beam reach, power`);
  }
  for (const [id, a] of Object.entries(rows.ARENAS)) if (!['arena', 'track'].includes(a.kind) || !a.props?.length) bad.push(`arena ${id}: kind and props`);
  return { ok: bad.length === 0, bad };
}
