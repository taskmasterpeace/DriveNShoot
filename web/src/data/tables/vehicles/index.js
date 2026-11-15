// The vehicle family's tables, read (src/data/tables/vehicles/*.csv + *.schema.json; loader: ../load.js). The JS data
// files (systems/vehicles.js, data/towing.js, trailers.js, parts.js, workshop.js) re-export these under their old names,
// so nothing that imports them changes. Edit the CSV, not the wrapper. Doc: docs/design/WEB_DATA_TABLES.md.
import { tableObjects, tableOne, tableRows } from '../load.js';

const F = 'vehicles';
export const rows = (table) => tableObjects(F, table);
export const one = (table) => tableOne(F, table);
// The Vehicles rows of one registering module: 'core' (systems/vehicles.js), 'semi' (systems/semis.js), 'tow' (data/towing.js).
export function vehicleBodies(group) {
  const out = {};
  for (const r of tableRows(F, 'Vehicles')) if (r.meta.Group === group) out[r.meta.GameKey ?? r.name] = r.obj;
  return out;
}
// MOUNT_OK is { body: [mount, ...] }: the table row holds the list as { ok: [...] }.
export const mountOk = () => Object.fromEntries(Object.entries(rows('PartMountOk')).map(([k, v]) => [k, v.ok]));
// CLEARANCE is { overpass, railBridge, lowBridge, margin }.
export function clearance() {
  return { ...Object.fromEntries(Object.entries(rows('Clearance')).map(([k, v]) => [k, v.clearance])), margin: one('TrailerConstants').clearanceMargin };
}
