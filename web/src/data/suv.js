// THE SUV's rows (VEHICLES V2 slice 5; systems/suv.js registers them and builds the body). Pure data: tools/suv.test.mjs
// checks it fits the LONGHAULER's box hold (data/trailers.js fitsHold) in node.
// Stats sit between the pickup and the van: heavier and taller than a sedan, softer off-road than the patrol truck.
const S4 = [{ id: 'driver', side: 'left', row: 0 }, { id: 'shotgun', side: 'right', row: 0 }, { id: 'backL', side: 'left', row: 1 }, { id: 'backR', side: 'right', row: 1 }];
export const SUV_ROW = {
  name: 'SUV', len: 4.9, wid: 2.0, tall: 2.24, maxSpeed: 37, reverse: 13, accel: 17, turn: 2.05, grip: 6.2, mass: 2.0,
  hp: 240, armor: 0.3, fuelCap: 78, seats: S4, // tall: the top of the roof load, the body's true top (a check measures the mesh)
};
// The glass (vehiclebodies GREENHOUSE shape): the windshield's foot zA, the roof from roofF back to roofR, the tailgate
// glass down to zC; belt yB, roof yR; wB/wR the width at the belt and the roof.
export const SUV_GLASS = { zA: 1.0, roofF: 0.42, roofR: -2.08, zC: -2.32, yB: 1.32, yR: 1.92, wB: 1.98, wR: 1.8, hp: 40 };
// The workshop (data/workshop.js CHASSIS shape): a pickup's capacity, a van's sides.
export const SUV_CHASSIS = { maxKg: 1300, spaces: 11, faces: { front: 34, rear: 32, left: 30, right: 30, top: 16, under: 18 },
  mounts: { front: { size: 2, arc: 0.45 }, rear: { size: 2, arc: 0.6 }, left: { size: 1, arc: 0.6 }, right: { size: 1, arc: 0.6 }, top: { size: 2, arc: Math.PI } } };
