#!/usr/bin/env node
// Feeds the photo tour into the lead's status pane (docs/status/dsoa-status.json in the integrate worktree): for each
// system in groups[].items[], the tour shots that show it are ADDED to its `shots` (nothing removed, no duplicates), and a
// "Full game tour" group (id "tour") with one item per tour section is written (replaced on every run).
//   node tools/tour-status.mjs [--status <path to dsoa-status.json>] [--tour <docs/tour/latest dir>]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from './shard-kit.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const STATUS = arg('--status', 'D:/git/DriveNShoot/.worktrees/integrate/docs/status/dsoa-status.json');
const TOUR = resolve(arg('--tour', join(ROOT, '..', 'docs', 'tour', 'latest')));
const index = JSON.parse(readFileSync(join(TOUR, 'INDEX.json'), 'utf8'));
const ok = new Map(index.rows.filter((r) => r.status === 'ok').map((r) => [`${r.section}-${r.name}`, join(TOUR, r.file).replace(/\\/g, '/')]));

// status item name -> tour shots that show it (a trailing * takes every shot with that prefix)
const MAP = {
  'Deaths + smart Echoes': ['infected-echoes', 'infected-breeds-night', 'world-grave-dig'],
  'Semis': ['vehicles-semi-with-car'],
  'World voice': ['screens-dialogue'],
  'Workshop extras': ['screens-workshop-*'],
  'Bullet shells': ['combat-firefight-tracers', 'combat-firefight-aftermath'],
  'Real terrain + 251 sites': ['land-canyon', 'land-colorado-bridge', 'land-desert-high', 'land-forest-hills', 'land-florida-swamp', 'world-site-stamped'],
  'Roadsides': ['land-roadside-*', 'land-power-lines', 'land-gas-station'],
  'Back lots': ['world-back-alley'],
  'Storm drains': ['world-storm-drain-*'],
  'Water': ['vehicles-boat-*', 'land-colorado-bridge', 'land-gators'],
  'Military bases': ['world-military-*'],
  'Look and feel': ['world-town-day', 'world-town-night', 'world-town-dawn', 'hud-default-onfoot'],
  'Z-fighting': ['world-town-overview', 'world-ring-city'],
  'Faceted bodies': ['front-creator-5-look', 'infected-breeds-lineup', 'screens-doll-kitted'],
  'Pulls': ['screens-pulls-board', 'world-hitchhiker', 'world-bar', 'world-stranded-caravan'],
  'Roles + goal loop': ['screens-sheet-standing', 'screens-sheet-journal'],
  'Site stories + bounty guild': ['world-bounty-board', 'world-site-story'],
  'Gunfire reactions': ['combat-firefight-tracers'],
  'Card rooms and casinos': [],
  'Timed actions + ladders + break-ins': [],
  'Police and SWAT response': ['combat-wanted'],
  'Camps, bases, your own house': ['vehicles-rv-coach'],
  'Carry and drag bodies, two-person tasks': ['world-grave-dig'],
  'Decks + prone': ['vehicles-pickup-bed-rider', 'vehicles-pickup-bed-moving', 'vehicles-van-roof', 'vehicles-trundle-bus', 'combat-prone', 'combat-crouch'],
  'Bullet travel': ['combat-firefight-tracers'],
  'Gadgets 2': ['gadgets-*'],
  'Calibers + forensics': [],
  'Zombies': ['infected-shamblers', 'infected-sprinters', 'infected-horde', 'infected-horde-close', 'infected-crawler', 'infected-choir'],
  'Vein zombies': ['infected-breeds-lineup', 'infected-breeds-night', 'infected-shamblers', 'infected-sprinters', 'infected-echoes'],
  'Death rites': ['world-cemetery', 'world-grave-dig', 'world-funeral'],
  'HUD + panel editor': ['hud-f6-editor', 'hud-preset-*', 'screens-pause-game', 'screens-controls'],
  'World-building tools': [],
};
const pick = (pats) => [...new Set(pats.flatMap((p) => (p.endsWith('*') ? [...ok].filter(([k]) => k.startsWith(p.slice(0, -1))).map(([, v]) => v) : ok.has(p) ? [ok.get(p)] : [])))];

const status = JSON.parse(readFileSync(STATUS, 'utf8'));
status.groups = status.groups.filter((g) => g.id !== 'tour');
let added = 0;
for (const g of status.groups) for (const it of g.items) {
  it.shots ??= [];
  for (const f of pick(MAP[it.name] ?? [])) if (!it.shots.includes(f)) { it.shots.push(f); added++; }
}
const unmapped = status.groups.flatMap((g) => g.items.map((i) => i.name)).filter((n) => !(n in MAP));
const ICON = { front: '🚪', hud: '🧭', screens: '🗂️', vehicles: '🚗', combat: '🔫', infected: '🧟', gadgets: '🔦', world: '🗺️', land: '⛰️' };
status.groups.push({ id: 'tour', icon: '📸', title: 'Full game tour', items: index.sections.map((s) => ({
  icon: ICON[s.id] ?? '📸', name: s.title, state: 'main', sentence: s.blurb, expected: 'Re-run after each landing',
  shots: index.rows.filter((r) => r.section === s.id && r.status === 'ok').map((r) => join(TOUR, r.file).replace(/\\/g, '/')) })) });
status.updated = status.updated; // left as the lead set it
writeFileSync(STATUS, JSON.stringify(status, null, 2) + '\n');
JSON.parse(readFileSync(STATUS, 'utf8')); // valid JSON or throw
console.log(`status: +${added} shots on existing systems, tour group of ${index.sections.length} sections written${unmapped.length ? `; no mapping for: ${unmapped.join(', ')}` : ''}`);
