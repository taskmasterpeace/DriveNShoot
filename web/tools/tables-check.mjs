// GENERATOR CHECK: every table in src/data/tables/<family>/ agrees with its schema. Fails (exit 1) on the first disagreement,
// naming file and line. Also checks the things a loader alone would not: every CSV has a schema and the other way round,
// every schema column is in the header, unit-bearing columns are named for their unit, no purple colours, no real brand
// names (tools/ip-terms), a Source on every row. Run: node --import ./tools/tables/register-json.mjs tools/tables-check.mjs
import { allFamilies, loadFamily, tableFiles, TableError } from '../src/data/tables/load.js';

const bad = [];
let tables = 0, rows = 0;
const hue = (hex) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx - mn < 0.08) return -1; const h = mx === r ? ((g - b) / (mx - mn)) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn); return (h * 60 + 360) % 360; };
const SUFFIX = { m: 'm', mps: 'mps', mps2: 'mps2', kg: 'kg', t: 't', L: 'L', s: 's', rad: 'rad', radps: 'radps', gh: 'gh', hit_points: 'hp', scrip: 'scrip', per_s: 'per_s' };
import { denyHits } from './ip-terms.mjs';

try {
  for (const family of allFamilies()) {
    for (const t of loadFamily(family).values()) {
      tables++; rows += t.rows.length;
      for (const c of t.schema.columns) {
        if (c.unit && SUFFIX[c.unit] && !c.name.endsWith('_' + SUFFIX[c.unit])) bad.push(`${t.file}: column ${c.name} has unit ${c.unit} but is not named *_${SUFFIX[c.unit]}`);
        if (!c.unit && /_(m|mps|mps2|kg|t|L|s|rad|radps|gh|hp|scrip|per_s)$/.test(c.name) && c.type !== 'string') bad.push(`${t.file}: column ${c.name} is named for a unit but the schema says none`);
      }
      for (const r of t.rows) for (const [k, v] of Object.entries(r.cells)) {
        if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) { const h = hue(v); if (h >= 270 && h <= 320) bad.push(`${t.file}:${r.line}: ${k} ${v} is purple`); }
        if (typeof v === 'string') for (const h of denyHits(v)) bad.push(`${t.file}:${r.line}: ${k} carries the IP-lint term "${h.term}" (${h.source})`);
      }
    }
  }
} catch (e) {
  if (e instanceof TableError) bad.push(e.message); else throw e;
}
if (!allFamilies().length) bad.push('no table families found');
void tableFiles;
if (bad.length) { console.error(`TABLES: ${bad.length} problem(s)\n` + bad.map((b) => '  ' + b).join('\n')); process.exit(1); }
console.log(`TABLES ok: ${tables} tables, ${rows} rows`);
