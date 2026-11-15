// Writes tools/fixtures/tables/infected.legacy.json: data/infected.js and data/hordes.js as they were before the tables (commit 1d214828, i.e. the
// integrate line BEFORE the feat/web-zed-* branches land). Run once against the unmodified files.
import { writeFileSync } from 'node:fs';
const I = await import('../../src/data/infected.js'), H = await import('../../src/data/hordes.js');
const snap = structuredClone({
  INFECTED: I.INFECTED, BREEDS: I.BREEDS, FOOTSTEPS: I.FOOTSTEPS, DRIFT: I.DRIFT, INSIDE: I.INSIDE, CHOIR_SITES: I.CHOIR_SITES,
  BREED_ANSWERS: H.BREED_ANSWERS, ECHO_MIND: H.ECHO_MIND, WARNINGS: H.WARNINGS, MIGRATION: H.MIGRATION,
});
writeFileSync(new URL('../fixtures/tables/infected.legacy.json', import.meta.url), JSON.stringify(snap, null, 1) + '\n');
console.log(Object.entries(snap).map(([k, v]) => `${k}:${Object.keys(v).length}`).join(' '));
process.exit(0);
