// Every SITE row (docs/design/WEB_LOCATION_BIBLE.md §3.1), gathered. A new region's rows land as data/sites/<region>.js
// (export an array) and are listed here; the stamper (world/citygen/site.js) and the `site` command read SITES.
import { SEED_SITES } from './_seed.js';

export const SITES = [...SEED_SITES];
export const SITES_BY_ID = new Map(SITES.map((s) => [s.id, s]));
