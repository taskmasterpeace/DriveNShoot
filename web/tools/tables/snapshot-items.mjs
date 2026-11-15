// Writes tools/fixtures/tables/items.legacy.json from the items.js that existed BEFORE the item tables (commit 1d214828).
//   inline: the JS literals in items.js itself, evaluated from the old source text (git show), so they are exactly what was typed.
//   composed: the final ITEMS / LOOT / AMMO_ITEM / GUN_ITEM the game saw once items.js had folded in gear, gadgets, melee ...
// Run once, with the pre-migration items.js in the tree (the wrapper must not be what is snapshotted).
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const src = execSync('git show 1d214828:web/src/data/items.js', { cwd: new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), encoding: 'utf8', maxBuffer: 1 << 26 });
function literal(re) {
  const m = re.exec(src); if (!m) throw new Error('no match ' + re);
  let i = re.source.startsWith('^Object') ? m.index + m[0].length - 1 : src.indexOf('=', m.index) + 1;
  while (/\s/.test(src[i])) i++;
  const start = i; let depth = 0;
  if (!'{['.includes(src[start])) return new Function(`return (${src.slice(start, src.indexOf(';', start))});`)();
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { const q = c; for (i++; src[i] !== q; i++) if (src[i] === String.fromCharCode(92)) i++; continue; }
    if ('{[('.includes(c)) depth++; else if ('}])'.includes(c)) { depth--; if (depth === 0) { i++; break; } }
  }
  return new Function(`return (${src.slice(start, i)});`)();
}
const inline = {
  ITEMS: literal(/^export const ITEMS = /m),
  GATOR_ITEMS: literal(/^Object\.assign\(ITEMS, \{/m),
  LOOT: literal(/^export const LOOT = /m),
  AMMO_ITEM: literal(/^export const AMMO_ITEM = /m), GUN_ITEM: literal(/^export const GUN_ITEM = /m),
  GUN_WEAR: literal(/^export const GUN_WEAR = /m), GUN_CARE: literal(/^export const GUN_CARE = /m), GUN_FOUND: literal(/^export const GUN_FOUND = /m),
  START_KIT: literal(/^export const START_KIT = /m), BODY_LITRES: literal(/^export const BODY_LITRES = /m),
};
const m = await import('../../src/data/items.js');
const composed = structuredClone({ ITEMS: m.ITEMS, LOOT: m.LOOT, AMMO_ITEM: m.AMMO_ITEM, GUN_ITEM: m.GUN_ITEM, GUN_WEAR: m.GUN_WEAR, GUN_CARE: m.GUN_CARE, GUN_FOUND: m.GUN_FOUND, START_KIT: m.START_KIT, BODY_LITRES: m.BODY_LITRES });
writeFileSync(new URL('../fixtures/tables/items.legacy.json', import.meta.url), JSON.stringify({ inline, composed }, (k, v) => (v === Infinity ? '__Infinity__' : v), 1) + '\n');
console.log('inline', Object.entries(inline).map(([k, v]) => `${k}:${typeof v === 'object' ? Object.keys(v).length : v}`).join(' '));
console.log('composed', Object.entries(composed).map(([k, v]) => `${k}:${typeof v === 'object' ? Object.keys(v).length : v}`).join(' '));
process.exit(0);
