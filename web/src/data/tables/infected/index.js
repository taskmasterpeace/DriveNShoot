// The infected family's tables, read (src/data/tables/infected/*.csv + *.schema.json; loader: ../load.js).
import { tableObjects, tableOne } from '../load.js';

const F = 'infected';
export const rows = (table) => tableObjects(F, table);
export const one = (table) => tableOne(F, table);
// BREEDS: the breed keys in horde order (HordeBreeds.Order).
export const breedOrder = () => Object.entries(rows('HordeBreeds')).sort((a, b) => a[1].order - b[1].order).map(([k]) => k);
// CHOIR_SITES is an array of { id, name, x, z, near }: the table rows are keyed by id.
export const choirSites = () => Object.entries(rows('ChoirSites')).map(([id, r]) => ({ id, ...r }));
