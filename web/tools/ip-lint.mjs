#!/usr/bin/env node
// IP lint: the clean-room "leak check" for a game that is fan service for other works.
// Mechanics may cross the wall; names, coined slang, characters and catchphrases may not.
// Scans every PLAYER-FACING string (JS/JSON string literals and HTML text, never identifiers
// or comments) against two lists:
//   DENY   - coined terms, titles, names, catchphrases. Any hit fails (exit 1).
//   REVIEW - ordinary English that is only a problem in context (a vehicle called "Interceptor",
//            a death screen that says "WASTED"). Printed, never fails.
// A deliberate use goes in tools/ip-allow.json as { "term": "...", "file": "...", "why": "..." }.
//   node tools/ip-lint.mjs            human report
//   node tools/ip-lint.mjs --json     machine report

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCAN = ['index.html', 'src', 'content'];

// Grouped by source so a reviewer can see why each term is here.
export const DENY = {
  'Deathlands (Axler)': ['deathlands', 'mutie', 'muties', 'stickie', 'stickies', 'nukecaust', 'skydark', 'fireblast', 'mat-trans', 'mattrans', 'sec man', 'sec men', 'gaudy house', 'jump dark', 'war wag', 'war wags', 'cawdor', 'krysty', 'doc tanner', 'jak lauren', 'mildred wyeth', 'jack lauren'],
  'Mad Max': ['war rig', 'fury road', 'immortan', 'witness me', 'bullet farm', 'gas town', 'thunderdome', 'bartertown', 'rockatansky', 'furiosa', 'war boy', 'war boys', 'doof warrior', 'pursuit special', 'v8 interceptor'],
  'Grand Theft Auto': ['grand theft auto', 'kill frenzy', 'liberty city', 'vice city', 'san andreas', 'anywhere city', 'zaibatsu'],
  'Project Zomboid': ['zomboid', 'moodle', 'moodles', 'knox event', 'knox county', 'muldraugh', 'this is how you died', 'spiffo'],
  "We're Alive": ["we're alive", 'scratchers', 'scratcher'],
  '28 Days Later': ['28 days later', 'rage virus'],
  'Car Wars / Autoduel': ['car wars', 'autoduel', 'aada', 'american autoduel association', "uncle al's", 'uncle albert', 'dueltrack'],
  'Fallout': ['fallout', 'vault-tec', 'vault boy', 'pip-boy', 'pipboy', 'nuka', 'brotherhood of steel', 'super mutant', 'deathclaw', 'radaway', 'rad-x'],
  'Walking Dead / Left 4 Dead / Twisted Metal': ['rick grimes', 'negan', 'left 4 dead', 'sweet tooth', 'calypso'],
};

export const REVIEW = {
  'Mad Max (the V8 car) / Ford trademark': ['interceptor', 'citadel', 'valhalla'],
  'GTA death/arrest screens': ['wasted', 'busted'],
  'Deathlands slang that is also plain English': ['ville', 'jolt', 'dark night', 'redoubt', 'blaster', 'blasters'],
  "Left 4 Dead special infected": ['boomer', 'smoker', 'spitter', 'jockey', 'witch', 'charger'],
  'Walking Dead zombie word': ['walker', 'walkers'],
};

const flat = (groups) => Object.entries(groups).flatMap(([src, terms]) => terms.map((t) => ({ t, src })));
const pattern = (t) => new RegExp(`(?<![a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i');
const DENY_LIST = flat(DENY).map((x) => ({ ...x, re: pattern(x.t) }));
const REVIEW_LIST = flat(REVIEW).map((x) => ({ ...x, re: pattern(x.t) }));

const allowPath = join(ROOT, 'tools/ip-allow.json');
const allow = existsSync(allowPath) ? JSON.parse(readFileSync(allowPath, 'utf8')) : [];
const allowed = (term, file) => allow.some((a) => a.term === term && (a.file === '*' || file.endsWith(a.file)));

function walk(p, out = []) {
  const abs = join(ROOT, p);
  if (!existsSync(abs)) return out;
  if (statSync(abs).isDirectory()) { for (const f of readdirSync(abs)) walk(join(p, f), out); return out; }
  if (['.js', '.mjs', '.json', '.html'].includes(extname(p))) out.push(p);
  return out;
}

// String literals of a JS/JSON file with the line each starts on. Skips comments; template
// literal ${...} expressions stay in (their identifiers rarely collide with the lists).
function jsStrings(src) {
  const out = [];
  let i = 0, line = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c, start = line;
      let s = '';
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') { s += src[i + 1] ?? ''; i += 2; continue; }
        if (src[i] === '\n') { line++; if (q !== '`') break; } // unterminated quote: stop at the line end
        s += src[i]; i++;
      }
      i++;
      if (s.trim()) out.push({ s, line: start });
      continue;
    }
    i++;
  }
  return out;
}

// Visible text of an HTML file (tags stripped, inline scripts and styles skipped).
function htmlStrings(src) {
  const out = [];
  const clean = src.replace(/<(script|style)[\s\S]*?<\/\1>/gi, (m) => m.replace(/[^\n]/g, ' '));
  clean.split('\n').forEach((l, k) => { const s = l.replace(/<[^>]*>/g, ' ').trim(); if (s) out.push({ s, line: k + 1 }); });
  return out;
}

const hits = { deny: [], review: [] };
for (const file of SCAN.flatMap((p) => walk(p)).map((p) => p.replace(/\\/g, '/'))) { // allow-list paths are posix
  const src = readFileSync(join(ROOT, file), 'utf8');
  const strs = file.endsWith('.html') ? htmlStrings(src) : jsStrings(src);
  for (const { s: raw, line } of strs) {
    const s = raw.replace(/<[^>]*>/g, ''); // markup must not hide a word: DEATH<span>LANDS</span>
    for (const [list, bucket] of [[DENY_LIST, hits.deny], [REVIEW_LIST, hits.review]]) {
      for (const { t, src: from, re } of list) {
        const m = re.exec(s);
        if (!m || allowed(t, file)) continue;
        const at = Math.max(0, m.index - 30);
        bucket.push({ file, line, term: t, source: from, context: s.slice(at, m.index + t.length + 30).replace(/\s+/g, ' ') });
      }
    }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: hits.deny.length === 0, deny: hits.deny, review: hits.review }, null, 2));
} else {
  const show = (title, list) => {
    if (!list.length) return;
    console.log(`\n${title} (${list.length})`);
    for (const h of list) console.log(`  ${h.file}:${h.line}  "${h.term}"  [${h.source}]  …${h.context}…`);
  };
  show('DENY — must be renamed', hits.deny);
  show('REVIEW — ordinary words, check the context', hits.review);
  console.log(`\nip-lint: ${hits.deny.length} deny, ${hits.review.length} review${hits.deny.length ? '' : ' — clean'}`);
}
process.exit(hits.deny.length ? 1 : 0);
