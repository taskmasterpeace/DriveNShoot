// WORLD ENGINE v0.3 · family D: the ground between cities is not flat (Robert, 2026-09-23:
// "flat bands"). Every biome declares relief for the seam (relief.js resolves it on the built
// cell, masked away from the road bed, kit, buildings, crop fields and water):
//   forest     rolling wooded hills, drainage ditches both sides of the road
//   farmland   long gentle swells, a raised farm road (embankment + ramps) with ditches
//   grassland  broad prairie swells, a sunken grass median between divided carriageways,
//              ditches outside them
//   desert     wind-built sand dunes; the interstate rides an embankment across them (the
//              carriageway without the exit, so the ramps meet it at grade)
//   tundra     low snow-covered knolls, a raised road bed (snow roads shed drifts), ditches
//   wetland    low hummocks and raised banks on the dry ground round the swamp pools (the
//              causeway is already the raised road bed)
// Pure plan data; the only randomness is the plan's rng.
import { relief } from '../relief.js';
import { ROAD_CLASSES } from '../../../data/world-engine/between-cities.js';
import { H, PAINT, clamp } from './layout.js';
import { offsetLine } from './roads.js';

const AREA = { x0: -PAINT + 8, z0: -PAINT + 8, x1: PAINT - 8, z1: PAINT - 8 };
/** Rolling ground per biome (height u, wavelength u, cover paint or the base paint when unset). */
const ROLL = {
  forest: { height: 20, wavelength: 288 }, farmland: { height: 12, wavelength: 416 }, grassland: { height: 18, wavelength: 384 },
  tundra: { height: 12, wavelength: 256, material: 'snow' }, wetland: { height: 10, wavelength: 208 },
};
/** Roadside ditch (centre beyond the road pad), raised road beds per biome. */
const DITCH = { off: 38, width: 24, depth: 3 };
const BED = { farmland: { dy: 4, spread: 16 }, tundra: { dy: 5, spread: 16 }, desert: { dy: 6, spread: 16 } };
const inCell = pts => pts.map(p => ({ x: clamp(p.x, -H + 1, H - 1), z: clamp(p.z, -H + 1, H - 1) }));

export function biomeRelief(ctx) {
  const { R, biome } = ctx, rng = ctx.L.rng, out = [], C = ROAD_CLASSES[R.cls];
  // 1. The ground rolls (dunes in the desert), everywhere the skin left open.
  if (biome === 'desert') {
    const wind = rng() < 0.5 ? 'x' : 'z';
    out.push(relief.dunes('we:relief:bc:desert:dunes', { rect: AREA, height: 14, wavelength: 96 + Math.floor(rng() * 3) * 16, wind, material: 'sand' }));
    out.push(relief.hills('we:relief:bc:desert:swell', { rect: AREA, height: 10, wavelength: 448, material: 'sand' }));
  } else if (ROLL[biome]) out.push(relief.hills(`we:relief:bc:${biome}:hills`, { rect: AREA, ...ROLL[biome] }));
  // 2. The road: ditches both sides, a sunken median between divided carriageways, a raised bed.
  const main = R.main, own = R.roads.length > 0;
  if (main && own && biome !== 'wetland' && R.cls !== 'dirt') {
    for (const s of [-1, 1]) out.push(relief.ditch(`we:relief:bc:${biome}:ditch:${s > 0 ? 'l' : 'r'}`, { points: inCell(offsetLine(main.points, s * (main.pad + DITCH.off))), width: DITCH.width, depth: DITCH.depth }));
    if (C.divided) out.push(relief.ditch(`we:relief:bc:${biome}:median`, { points: inCell(R.centre), width: Math.max(24, C.median - 16), depth: 3 }));
  }
  const bed = BED[biome];
  if (bed && own) {
    // The carriageway(s) that carry no exit ramp: ramps must meet their road at grade.
    const roads = C.divided ? R.carriageways.filter(c => !R.exit || c.id !== R.exit.carriageway) : R.roads.filter(r => r.id === `${ctx.p}:road`);
    for (const r of roads) out.push(relief.roadbed(`we:relief:bc:${biome}:bed:${r.id.split(':').pop()}`, { road: r.id, dy: bed.dy, from: 0.14, to: 0.86, ramp: 128, spread: bed.spread }));
  }
  return out;
}
