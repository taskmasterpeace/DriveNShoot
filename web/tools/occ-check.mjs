#!/usr/bin/env node
// The occupation rows' targeted checks (the goal loop's guard for the role-diversity goal; the selftest runs the same
// rules in the game over the live plan). Exit 0 = green. A change that games the diversity number by making the places
// read wrong (a port with no dock work, dock work in the desert, a mine with no diggers) fails here and is thrown away.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OCCUPATIONS, MIX, GOAL, validateOccupations } from '../src/data/occupations.js';
import { ITEMS } from '../src/data/items.js';
import { KINDS } from '../src/data/citygen.js';
import { evaluate, profileOf } from '../src/world/occupations.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const recs = JSON.parse(readFileSync(`${root}tools/fixtures/settlements.json`, 'utf8')).records;
const DEALS = ['gun', 'ammo', 'tool', 'med', 'part', 'pack', 'water', 'food', 'valuable', 'paper', 'hide'];
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

const v = validateOccupations(OCCUPATIONS, { items: ITEMS, kinds: KINDS, deals: DEALS });
ok(v.ok, `rows: ${v.errors.join('; ')}`);
// the knobs stay in their safe ranges (docs/design/WEB_OCCUPATIONS.md §7)
ok(MIX.jitter >= 0 && MIX.jitter <= 0.6, `MIX.jitter ${MIX.jitter} outside [0, 0.6]`);
ok(MIX.cap >= 0.15 && MIX.cap <= 0.4, `MIX.cap ${MIX.cap} outside [0.15, 0.4]`);
ok(MIX.tailN >= 0 && MIX.tailN <= 3 && MIX.tailKeep >= 0.5 && MIX.tailKeep <= 1 && MIX.tailCore >= 0.8 && MIX.tailCore <= 3 && MIX.tailFrom >= 12 && MIX.tailFrom <= 48, `MIX tail knobs outside tailN [0, 3] / tailKeep [0.5, 1] / tailCore [0.8, 3]`);
ok(MIX.workShare >= 0.4 && MIX.workShare <= 0.7, `MIX.workShare ${MIX.workShare} outside [0.4, 0.7]`);
ok(MIX.minWorkers >= 6 && MIX.minWorkers <= 12 && MIX.maxWorkers >= 40 && MIX.maxWorkers <= 80, 'MIX workforce bounds outside 6-12 / 40-80');
ok(GOAL.shannon === 1.6 && GOAL.maxShare === 0.25 && GOAL.jaccard === 0.3, 'GOAL is the target, not a knob');

const R = evaluate(recs);
const by = new Map(R.towns.map((t) => [t.id, t]));
const has = (t, ids) => ids.some((id) => t.set.includes(id));
const DOCK = Object.entries(OCCUPATIONS).filter(([, o]) => o.out === 'dock' || /pier|wharf|dock|slip|harbor/.test(o.hero ?? '')).map(([id]) => id).concat(['harbourmaster', 'shipwright']);
let ports = 0, farms = 0, mines = 0, raiders = 0, bases = 0, swamps = 0;
for (const rec of recs) {
  const P = profileOf(rec), t = P && by.get(P.id); if (!t) continue;
  if (P.arch === 'port_wharf') { ports++; ok(has(t, ['dockhand']) && has(t, ['harbourmaster']), `${t.id} (port) has no dockhand or harbourmaster`); }
  if (P.tags.has('desert') && !P.tags.has('water')) ok(!has(t, DOCK), `${t.id} (dry desert) has dock work: ${t.set.filter((j) => DOCK.includes(j)).join(' ')}`);
  if (P.kind === 'town' && ['plains_grain_town', 'county_seat', 'delta_river_town'].includes(P.arch)) { farms++; ok(has(t, ['grower', 'rancher']) && has(t, ['smith', 'miller', 'vet']), `${t.id} (farm town) lacks growers or a smith/miller/vet`); }
  if (P.tags.has('mine')) { mines++; ok(has(t, ['digger']), `${t.id} (mining) has no diggers`); }
  if (P.cls === 'raider') { raiders++; ok(has(t, ['scout', 'lookout']), `${t.id} (raider-held) has no scouts or lookouts`); ok(!has(t, ['teacher', 'judge']), `${t.id} (raider-held) has a teacher or a judge`); }
  if (P.arch === 'military_base' || P.key === 'site:military') { bases++; ok(has(t, ['sentry']), `${t.id} (military) has no sentry`); }
  if (P.tags.has('swamp')) { swamps++; ok(has(t, ['gator_hunter', 'boatman', 'moonshiner', 'moss_gatherer']), `${t.id} (swamp) has none of the swamp trades`); }
  ok(t.jobs.reduce((a, j) => a + j.n, 0) === t.n, `${t.id}: the mix does not add up to its workforce`);
}
ok(ports > 0 && farms > 0 && mines > 0 && raiders > 0 && bases > 0 && swamps > 0, `the fixture lacks a kind (ports ${ports} farms ${farms} mines ${mines} raiders ${raiders} bases ${bases} swamps ${swamps})`);
if (fails.length) { console.log(`occ-check: ${fails.length} failing\n  ${fails.slice(0, 30).join('\n  ')}`); process.exit(1); }
console.log(`occ-check: green (${Object.keys(OCCUPATIONS).length} jobs; ports ${ports}, farm towns ${farms}, mining ${mines}, raider-held ${raiders}, military ${bases}, swamp ${swamps})`);
