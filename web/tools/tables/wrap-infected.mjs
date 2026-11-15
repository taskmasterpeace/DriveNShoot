// `node tools/tables/wrap-infected.mjs hordes` is APPLIED (data/hordes.js is a wrapper). The infected.js half is STAGED, NOT APPLIED. Swaps the literals in data/infected.js and data/hordes.js for table wrappers. It is held back because the feat/web-zed-*
// branches (breeds, pound, ...) are rewriting data/infected.js right now (new rows and tables there); applying this first would make every one of
// them a merge conflict. When they have landed: regenerate the tables from the landed JS (snapshot-infected.mjs, extract-infected.mjs), then
//   node tools/tables/wrap-infected.mjs      and run: npm run tables:test
import { rewrite } from './wrap-lib.mjs';

const imp = (rel, names) => (s) => {
  const lines = s.split('\n'); let last = -1; lines.forEach((l, i) => { if (/^import .* from /.test(l)) last = i; });
  lines.splice(last + 1, 0, `import { ${names} } from '${rel}tables/infected/index.js';`);
  return lines.join('\n');
};
const only = process.argv[2]; // 'hordes' = just data/hordes.js (no zed branch touches it); no arg = both
if (only !== 'hordes') rewrite('src/data/infected.js', {
  INFECTED: "export const INFECTED = rows('Infected');", BREEDS: 'export const BREEDS = breedOrder();', FOOTSTEPS: "export const FOOTSTEPS = one('FootstepSettings');",
  DRIFT: "export const DRIFT = one('DriftSettings');", INSIDE: "export const INSIDE = rows('InsideBuildings');", CHOIR_SITES: 'export const CHOIR_SITES = choirSites();',
}, imp('./', 'rows, one, breedOrder, choirSites'));
rewrite('src/data/hordes.js', {
  BREED_ANSWERS: "export const BREED_ANSWERS = rows('BreedAnswers');", ECHO_MIND: "export const ECHO_MIND = one('EchoMind');",
  WARNINGS: "export const WARNINGS = one('WarningSettings');", MIGRATION: "export const MIGRATION = one('MigrationSettings');",
}, imp('./', 'rows, one'));
console.log('wrapped infected.js and hordes.js');
