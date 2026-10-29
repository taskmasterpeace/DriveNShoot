#!/usr/bin/env node
// ROLE DIVERSITY: the first goal of the goal loop (docs/design/WEB_OCCUPATIONS.md §4; WEB_DEPTH_PLAN §5).
// Scores every peopled settlement of the planned country (tools/fixtures/settlements.json: the citygen plan's towns and
// sites, dumped from the running game by `town action=dump write=true`) against data/occupations.js GOAL:
//   Shannon diversity of its jobs >= 1.6, no job over 25% of its workforce, its nearest same-kind neighbour >= 0.3 apart
//   (Jaccard distance of their job sets).
// Prints ONE number on the last line: the score in [0, 1] (the share of settlement x criterion pairs that pass; 1 = met).
//   node tools/role-diversity.mjs            the score, after a one-line summary
//   node tools/role-diversity.mjs --json     the whole report (every settlement, its mix, what fails)
//   node tools/role-diversity.mjs --fails    the settlements that fail, one line each, then the score
//   node tools/role-diversity.mjs --refresh  first re-dump the fixture from a running game (DL_URL, default :3141)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluate } from '../src/world/occupations.js';

const root = fileURLToPath(new URL('..', import.meta.url));
if (process.argv.includes('--refresh')) {
  const base = process.env.DL_URL ?? 'http://localhost:3141';
  const r = await (await fetch(`${base}/agent/cmd`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cmd: 'town', args: { action: 'dump' } }) })).json();
  if (!r.ok) { console.error(`refresh failed: ${r.error}`); process.exit(1); }
  writeFileSync(`${root}tools/fixtures/settlements.json`, JSON.stringify({ note: r.note, records: r.records }).replace(/\},\{/g, '},\n{'));
  console.log(`refreshed: ${r.records.length} records from ${base}`);
}
const recs = JSON.parse(readFileSync(`${root}tools/fixtures/settlements.json`, 'utf8')).records;
const R = evaluate(recs);
const S = R.summary;
const arg = process.argv.slice(2);
if (arg.includes('--json')) { console.log(JSON.stringify(R, null, 1)); process.exit(0); }
if (arg.includes('--fails')) {
  for (const t of R.towns) if (!(t.pass.H && t.pass.cap && t.pass.jac)) {
    const why = [!t.pass.H && `H ${t.H}`, !t.pass.cap && `top ${t.top} ${Math.round(t.maxShare * 100)}%`, !t.pass.jac && `like ${t.nb} (jd ${t.jd})`].filter(Boolean).join(', ');
    console.log(`${t.id.padEnd(7)} ${t.key.padEnd(26)} n=${String(t.n).padEnd(3)} jobs=${String(t.kinds).padEnd(3)} ${why}  [${t.jobs.slice(0, 6).map((j) => `${j.id}:${j.n}`).join(' ')}]`);
  }
}
console.log(`settlements ${S.settlements} | H>=1.6 ${S.passH} | cap<=25% ${S.passCap} | neighbours>=0.3 ${S.passJac} | all three ${S.passAll} | min H ${S.minH} | mean H ${S.meanH} | worst share ${S.worstShare}`);
console.log(S.score);
