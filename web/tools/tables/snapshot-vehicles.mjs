// Writes tools/fixtures/tables/vehicles.legacy.json: the vehicle-family data AS THE JS LITERALS HAD IT before the tables
// existed (commit 1d214828). The equality test compares the table-loaded data to this, field by field. Run once, against
// the pre-migration code; never regenerate it from the wrappers (that would compare the tables to themselves).
import { writeFileSync } from 'node:fs';
const { VEHICLES, DRIVING } = await import('../../src/systems/vehicles.js');
const core = structuredClone(VEHICLES);
const dr = structuredClone(DRIVING);
const T = await import('../../src/data/towing.js');
const TR = await import('../../src/data/trailers.js');
await import('../../src/systems/semis.js');
const semi = {}; for (const k of ['semi', 'boxtrailer', 'widetrailer']) semi[k] = VEHICLES[k];
const P = await import('../../src/data/parts.js');
const W = await import('../../src/data/workshop.js');
const snap = {
  VEHICLES: core, SEMI_VEHICLES: semi, TOW_VEHICLES: T.TOW_VEHICLES, DRIVING: dr,
  LINES: T.LINES, TOW: T.TOW, MUD: T.MUD, TRAILER: T.TRAILER, TOW_ITEMS: T.TOW_ITEMS,
  TRAILERS: TR.TRAILERS, HITCH: TR.HITCH, CARRY: TR.CARRY, ROAD_FIT: TR.ROAD_FIT, CLEARANCE: TR.CLEARANCE, LANE_W: TR.LANE_W, FIT_MARGIN: TR.FIT_MARGIN,
  PLATE: P.PLATE, PLATE_MAX: P.PLATE_MAX, LOAD: P.LOAD, MOUNTS: P.MOUNTS, MOUNT_OK: P.MOUNT_OK,
  ARMOR: W.ARMOR, CHASSIS: W.CHASSIS, PERF: W.PERF, POWER: W.POWER, MOUNT_WEAPONS: W.MOUNT_WEAPONS, UTILITY: W.UTILITY, AMMO_ITEMS: W.AMMO_ITEMS,
  PAINTS: W.PAINTS, REPAIR: W.REPAIR, WORKSHOPS: W.WORKSHOPS, ARENAS: W.ARENAS, LOANER: W.LOANER,
};
const txt = JSON.stringify(snap, (k, v) => (v === Infinity ? '__Infinity__' : v), 1);
writeFileSync(new URL('../fixtures/tables/vehicles.legacy.json', import.meta.url), txt + '\n');
console.log('snapshot', Object.keys(snap).map((k) => `${k}:${Object.keys(snap[k]).length}`).join(' '));
process.exit(0);
