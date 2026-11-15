import { rows, one, mountOk } from './tables/vehicles/index.js';
// The garage (fan service for the car-duelling games: armour by facing, mounted guns, rear droppers; our own numbers
// and names). Armour is plate points on four faces; a point stops PLATE.absorb hit points from that side and weighs
// PLATE.kg. When a face is gone, hits go through to the hull and the parts behind it (THE BREACH).
export const PLATE = one('PlateSettings');

// How many points each body can carry per face (0 = can't be plated: bikes, boats, the open buggy's sides).
export const PLATE_MAX = rows('PlateMax');

// Weight costs performance: accel scales by base mass / mass, top speed loses TOP_PER_TONNE per added tonne
// (relative), turning by (base / mass)^TURN_EXP.
export const LOAD = one('LoadSettings');

// Mounts. front: a fixed gun that fires along the nose (it only fires when you aim within `arc` of straight ahead);
// rear: a dropper you trigger with B.
export const MOUNTS = rows('PartMounts');

// Which bodies take which mounts.
export const MOUNT_OK = mountOk();
