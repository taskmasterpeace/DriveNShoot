// The garage (fan service for the car-duelling games: armour by facing, mounted guns, rear droppers; our own numbers
// and names). Armour is plate points on four faces; a point stops PLATE.absorb hit points from that side and weighs
// PLATE.kg. When a face is gone, hits go through to the hull and the parts behind it (THE BREACH).
export const PLATE = { absorb: 10, kg: 25, price: 12 };

// How many points each body can carry per face (0 = can't be plated: bikes, boats, the open buggy's sides).
export const PLATE_MAX = {
  sedan: { front: 10, rear: 10, left: 8, right: 8 },
  interceptor: { front: 12, rear: 10, left: 8, right: 8 },
  pickup: { front: 12, rear: 12, left: 10, right: 10 },
  van: { front: 12, rear: 14, left: 12, right: 12 },
  rig: { front: 24, rear: 16, left: 18, right: 18 },
  buggy: { front: 6, rear: 4, left: 2, right: 2 },
};

// Weight costs performance: accel scales by base mass / mass, top speed loses TOP_PER_TONNE per added tonne
// (relative), turning by (base / mass)^TURN_EXP.
export const LOAD = { topLossPerMassRatio: 0.25, turnExp: 0.35 };

// Mounts. front: a fixed gun that fires along the nose (it only fires when you aim within `arc` of straight ahead);
// rear: a dropper you trigger with B.
export const MOUNTS = {
  mg: { slot: 'front', name: 'TWIN MG', price: 300, kg: 60, dmg: 15, rate: 0.07, spread: 0.035, range: 60, arc: 0.45, ammo: 240, refill: 1 },
  oil: { slot: 'rear', name: 'OIL SPRAYER', price: 150, kg: 40, charges: 4, refill: 25, slick: { r: 4.5, life: 40, grip: 0.12, spin: 2.2 } },
  caltrops: { slot: 'rear', name: 'CALTROP DROPPER', price: 120, kg: 30, charges: 5, refill: 20, field: { r: 3.5, life: 45 } },
  smoke: { slot: 'rear', name: 'SMOKE LAYER', price: 100, kg: 20, charges: 4, refill: 15 },
};

// Which bodies take which mounts.
export const MOUNT_OK = {
  sedan: ['mg', 'oil', 'caltrops', 'smoke'], interceptor: ['mg', 'oil', 'caltrops', 'smoke'], pickup: ['mg', 'oil', 'caltrops', 'smoke'],
  van: ['mg', 'oil', 'caltrops', 'smoke'], rig: ['mg', 'oil', 'caltrops', 'smoke'], buggy: ['mg', 'caltrops', 'smoke'],
};
