// One-off: swaps the JS literals for table wrappers (the migration). Not re-runnable (the literals are gone after).
import { readFileSync, writeFileSync } from 'node:fs';
function span(src, name) {
  const start = src.search(new RegExp(`^export const ${name} =`, 'm'));
  if (start < 0) throw new Error('no export ' + name);
  let i = src.indexOf('=', start) + 1, depth = 0;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { const q = c; for (i++; src[i] !== q; i++) if (src[i] === String.fromCharCode(92)) i++; continue; }
    if ('{[('.includes(c)) depth++;
    else if ('}])'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return [start, i + 1];
  }
  throw new Error('unterminated ' + name);
}
function wrap(file, repl, importLine, extra = (s) => s) {
  let s = readFileSync(file, 'utf8');
  for (const [name, code] of Object.entries(repl)) { const [a, b] = span(s, name); s = s.slice(0, a) + code + s.slice(b); }
  s = extra(s);
  // import after the last top-of-file import
  const lines = s.split('\n'); let last = -1; lines.forEach((l, i) => { if (/^import .* from /.test(l)) last = i; });
  lines.splice(last + 1, 0, importLine);
  writeFileSync(file, lines.join('\n'));
}
const R = (t) => `rows('${t}')`, O = (t) => `one('${t}')`;
wrap('src/systems/vehicles.js', { VEHICLES: `export const VEHICLES = vehicleBodies('core');`, DRIVING: `export const DRIVING = one('Driving');` },
  `import { vehicleBodies, one } from '../data/tables/vehicles/index.js';`,
  (s) => s.replace(/^const S2 = .*\n/m, '').replace(/^const S4 = .*\n/m, ''));
wrap('src/data/towing.js', { LINES: `export const LINES = ${R('TowLines')};`, TOW: `export const TOW = ${O('TowSettings')};`, MUD: `export const MUD = ${O('MudSettings')};`,
  TRAILER: `export const TRAILER = ${O('BoatTrailerSettings')};`, TOW_VEHICLES: `export const TOW_VEHICLES = vehicleBodies('tow');`, TOW_ITEMS: `export const TOW_ITEMS = ${R('TowItems')};` },
  `import { rows, one, vehicleBodies } from './tables/vehicles/index.js';`, (s) => s.replace(/^const STAND = 'stand';\n/m, ''));
wrap('src/data/trailers.js', { TRAILERS: `export const TRAILERS = ${R('Trailers')};`, HITCH: `export const HITCH = ${O('HitchSettings')};`, CARRY: `export const CARRY = ${O('CarrySettings')};`,
  ROAD_FIT: `export const ROAD_FIT = ${R('RoadFit')};`, CLEARANCE: `export const CLEARANCE = clearance();`, LANE_W: `export const LANE_W = one('TrailerConstants').laneW;`, FIT_MARGIN: `export const FIT_MARGIN = one('TrailerConstants').fitMargin;` },
  `import { rows, one, clearance } from './tables/vehicles/index.js';`);
wrap('src/data/parts.js', { PLATE: `export const PLATE = ${O('PlateSettings')};`, PLATE_MAX: `export const PLATE_MAX = ${R('PlateMax')};`, LOAD: `export const LOAD = ${O('LoadSettings')};`, MOUNTS: `export const MOUNTS = ${R('PartMounts')};`, MOUNT_OK: `export const MOUNT_OK = mountOk();` },
  `import { rows, one, mountOk } from './tables/vehicles/index.js';`);
wrap('src/data/workshop.js', { ARMOR: `export const ARMOR = ${R('ArmorTypes')};`, CHASSIS: `export const CHASSIS = ${R('Chassis')};`, PERF: `export const PERF = ${O('PerfSettings')};`, POWER: `export const POWER = ${O('PowerSettings')};`,
  MOUNT_WEAPONS: `export const MOUNT_WEAPONS = ${R('MountWeapons')};`, UTILITY: `export const UTILITY = ${R('Utility')};`, AMMO_ITEMS: `export const AMMO_ITEMS = ${R('AmmoItems')};`, PAINTS: `export const PAINTS = ${R('Paints')};`,
  REPAIR: `export const REPAIR = ${O('RepairPrices')};`, WORKSHOPS: `export const WORKSHOPS = ${R('Workshops')};`, ARENAS: `export const ARENAS = ${R('Arenas')};`, LOANER: `export const LOANER = ${O('Loaner')};` },
  `import { rows, one } from './tables/vehicles/index.js';`);
console.log('wrapped');
