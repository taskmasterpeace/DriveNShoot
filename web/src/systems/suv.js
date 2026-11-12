// THE SUV (VEHICLES V2 slice 5, Robert 11-12: "the 18-wheeler. You gotta be able to drive an SUV inside of it").
// A generic pre-war four-door utility wagon (no make, no model): a square nose, a tall greenhouse that runs back to the
// tailgate, four doors, a roof rack, a spare on the back door. It fits the LONGHAULER's box hold (data/trailers.js
// fitsHold: 2.0 m wide, 4.9 m long, 1.98 m tall under the 2.25 m door) and drives up its ramp like any car (systems/semis.js
// THE HOLD). Placed in the world, never minted: the freight's first box rig carries one in its hold (data/trailers.js
// FREIGHT), beside its sedan.
// This module registers everything the SUV needs where the engine looks for it, as systems/towing.js does for its rows:
// the vehicle row (VEHICLES), the body builder (HULLS, which vehiclebodies.buildBody asks first), its glass (GREENHOUSE,
// for the windows and the cutaway) and the workshop's chassis row (CHASSIS).
import { VEHICLES } from './vehicles.js';
import { HULLS } from './movetowbodies.js';
import { CHASSIS } from '../data/workshop.js';
import { SUV_ROW, SUV_GLASS, SUV_CHASSIS } from '../data/suv.js';

VEHICLES.suv ??= SUV_ROW;
CHASSIS.suv ??= SUV_CHASSIS;
HULLS.suv ??= suvBody;

const GRILLE = '#1c1b19', BUMPER = '#2e2c2a', CHROME = '#a7a39b', CARPET = '#3a3430', SEAT = '#4a4038', DASH = '#232120', TYRE = '#141312', PLATE = '#d8d2b8', RACK = '#262624', FLARE = '#1f1e1c';

// (parts, s, paint, K): K is vehiclebodies' kit (tag, slab, beam, coloredBox, wheel, axle, greenhouse, GREENHOUSE, PART).
function suvBody(parts, s, paint, K) {
  K.GREENHOUSE.suv ??= SUV_GLASS; // the glass layout (windows, the cutaway) reads it by base
  const { slab, beam, axle, greenhouse, PART } = K, G = K.GREENHOUSE.suv;
  const L = s.len, hw = s.wid / 2, yHood = 1.22, yFloor = 0.66, r = 0.45, zf = L / 2 - 0.95, zr = -L / 2 + 0.98;
  // Nose: the block, the hood (tears off), a square grille between the lamps, the bumper with a skid plate under it.
  parts.push(slab(-hw, hw, 0.5, yHood - 0.06, G.zA - 0.05, L / 2 - 0.06, paint));
  parts.push(slab(-hw + 0.07, hw - 0.07, yHood - 0.06, yHood, G.zA + 0.02, L / 2 - 0.14, paint, PART.hood));
  parts.push(slab(-hw + 0.32, hw - 0.32, 0.72, yHood - 0.12, L / 2 - 0.08, L / 2 - 0.01, GRILLE));
  for (let k = 0; k < 4; k++) { const y = 0.78 + k * 0.1; parts.push(slab(-hw + 0.34, hw - 0.34, y, y + 0.025, L / 2 - 0.02, L / 2 + 0.005, CHROME)); }
  parts.push(slab(-hw - 0.04, hw + 0.04, 0.48, 0.74, L / 2 - 0.08, L / 2 + 0.14, BUMPER, PART.bumperF));
  parts.push(slab(-0.55, 0.55, 0.36, 0.5, L / 2 - 0.4, L / 2 + 0.06, '#3a3836', PART.bumperF));
  // Square fender flares over the wheels and a rocker step down each side.
  for (const sd of [1, -1]) {
    for (const z of [zf, zr]) parts.push(slab(sd * (hw - 0.02), sd * (hw + 0.07), 0.7, 0.98, z - 0.62, z + 0.62, FLARE));
    parts.push(slab(sd * (hw - 0.05), sd * (hw + 0.1), 0.44, 0.5, zr + 0.62, zf - 0.62, '#2a2928'));
  }
  // The tub: a floor, four doors (the back pair behind the B-pillar), the cargo walls behind them, the handles, mirrors.
  const zB = (G.roofF + G.zA) / 2 - 0.9, zD = zB - 1.05; // the B-pillar, and the back of the rear door
  parts.push(slab(-hw + 0.1, hw - 0.1, 0.5, yFloor, G.zC, G.zA, CARPET));
  for (const sd of [1, -1]) {
    const x0 = sd * (hw - 0.1), x1 = sd * hw;
    parts.push(slab(x0, x1, 0.5, G.yB, zB, G.zA, paint, sd > 0 ? PART.doorL : PART.doorR));
    parts.push(slab(x0, x1, 0.5, G.yB, zD, zB, paint, sd > 0 ? PART.doorL2 : PART.doorR2));
    parts.push(slab(x0, x1, 0.5, G.yB, G.zC, zD, paint)); // the cargo quarter
    parts.push(slab(sd * (hw + 0.01), sd * (hw + 0.035), G.yB - 0.2, G.yB - 0.15, G.zA - 0.5, G.zA - 0.3, CHROME, sd > 0 ? PART.doorL : PART.doorR));
    parts.push(slab(sd * (hw + 0.01), sd * (hw + 0.035), G.yB - 0.2, G.yB - 0.15, zB - 0.5, zB - 0.3, CHROME, sd > 0 ? PART.doorL2 : PART.doorR2));
    parts.push(slab(sd * (hw + 0.02), sd * (hw + 0.24), G.yB + 0.06, G.yB + 0.28, G.zA - 0.12, G.zA + 0.02, '#1e1d1c', sd > 0 ? PART.doorL : PART.doorR)); // mirror
  }
  // Inside: the dash, two rows of seats, the cargo floor behind.
  parts.push(slab(-hw + 0.14, hw - 0.14, yFloor, 1.12, G.zA - 0.42, G.zA - 0.05, DASH));
  for (const zs of [G.zA - 1.0, zB - 0.62]) for (const x of zs > zB ? [0.42, -0.42] : [0]) parts.push(slab(x - (zs > zB ? 0.24 : 0.7), x + (zs > zB ? 0.24 : 0.7), yFloor, yFloor + 0.42, zs - 0.26, zs + 0.24, SEAT));
  for (const zs of [G.zA - 1.0, zB - 0.62]) for (const x of zs > zB ? [0.42, -0.42] : [0]) parts.push(slab(x - (zs > zB ? 0.24 : 0.7), x + (zs > zB ? 0.24 : 0.7), yFloor + 0.42, yFloor + 0.95, zs - 0.3, zs - 0.18, SEAT));
  // The glass: windshield, side glass through to the back, the tailgate window; the roof on top.
  greenhouse(parts, G, paint, paint, zB);
  for (const sd of [1, -1]) parts.push(beam([sd * (G.wB / 2 - 0.035), G.yB, zD], [sd * (G.wR / 2 - 0.035), G.yR + 0.02, zD], 0.07, paint, PART.body)); // the C-pillar
  // A roof rack: two rails, three crossbars, a jerry can and a rolled tarp lashed down.
  for (const sd of [1, -1]) parts.push(slab(sd * (G.wR / 2 - 0.12), sd * (G.wR / 2 - 0.05), G.yR + 0.07, G.yR + 0.15, G.roofR + 0.15, G.roofF - 0.1, RACK));
  for (let k = 0; k < 3; k++) { const z = G.roofR + 0.25 + k * ((G.roofF - G.roofR - 0.5) / 2); parts.push(slab(-G.wR / 2 + 0.05, G.wR / 2 - 0.05, G.yR + 0.15, G.yR + 0.19, z - 0.03, z + 0.03, RACK)); }
  parts.push(slab(0.2, 0.55, G.yR + 0.19, G.yR + 0.52, G.roofR + 0.35, G.roofR + 0.6, '#4e5438'));
  parts.push(slab(-0.5, 0.05, G.yR + 0.19, G.yR + 0.42, G.roofR + 0.3, G.roofR + 0.95, '#7b6a4a')); // the tarp
  // The tail: the tailgate (its window is the greenhouse's rear glass), a spare on it, the bumper and the plate.
  parts.push(slab(-hw + 0.04, hw - 0.04, 0.5, G.yB, -L / 2 + 0.02, -L / 2 + 0.1, paint, PART.bumperR));
  parts.push(K.coloredBox(0.78, 0.78, 0.26, 0, G.yB - 0.4, -L / 2 - 0.12, TYRE, PART.bumperR));
  parts.push(K.coloredBox(0.4, 0.4, 0.28, 0, G.yB - 0.4, -L / 2 - 0.13, '#5a554c', PART.bumperR));
  parts.push(slab(-hw - 0.04, hw + 0.04, 0.48, 0.72, -L / 2 - 0.12, -L / 2 + 0.08, BUMPER, PART.bumperR));
  parts.push(slab(-0.22, 0.22, 0.55, 0.68, -L / 2 - 0.14, -L / 2 - 0.12, PLATE, PART.bumperR));
  axle(parts, zf, r, 0.34, hw - 0.1, true);
  axle(parts, zr, r, 0.34, hw - 0.1, false);
}
