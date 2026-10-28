#!/usr/bin/env node
// Merge the location research (docs/research/deathlands-locations/part-1..4.json) into SITE rows
// (docs/design/WEB_LOCATION_BIBLE.md §3.1) and write web/src/data/sites/<region>.js + index.js.
//   node tools/sites-merge.mjs           merge, check, write
//   node tools/sites-merge.mjs --dry     merge and check only (prints the report, writes nothing)
// Steps: dedupe the same real place, normalise biome/layout, clamp storeys and footprints, drop banned
// palette hues, assign a region from the state, make ids and names unique, IP-check every string, validate.
// No dependencies. _seed.js belongs to the city lane: this tool never writes or reads it.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DENY, REVIEW, denyHits } from './ip-terms.mjs';
import { BIOMES, LAYOUTS, validateSites, bannedHue } from '../src/data/sites/validate.js';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const REPO = join(WEB, '..');
const IN_DIR = join(REPO, 'docs/research/deathlands-locations');
const OUT_DIR = join(WEB, 'src/data/sites');
const DRY = process.argv.includes('--dry');

// ---------- regions ----------
const REGION_OF = {
  FL: ['FL'], CA: ['CA'], AK: ['AK'], HI: ['HI'],
  SW: ['AZ', 'NM', 'NV', 'UT', 'CO'],          // + TX west of 99°W
  GULF: ['LA', 'MS', 'AL'],                     // + TX east of 99°W
  MW: ['OH', 'IN', 'IL', 'MI', 'WI', 'MN', 'IA', 'MO'],
  PLAINS: ['ND', 'SD', 'NE', 'KS', 'OK'],
  NW: ['WA', 'OR', 'ID', 'MT', 'WY'],
  NE: ['ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA', 'DE', 'MD', 'DC'],
  SE: ['VA', 'WV', 'NC', 'SC', 'GA', 'TN', 'KY', 'AR'],
};
export const SITE_REGIONS = {
  FL: 'Florida', SW: 'The Southwest (AZ NM NV UT CO, west Texas)', CA: 'California', GULF: 'The Gulf (east Texas, LA MS AL)',
  MW: 'The Midwest and Great Lakes', NE: 'The Northeast and the capital', SE: 'The Southeast and Appalachia', NW: 'The Northwest and northern Rockies',
  PLAINS: 'The Great Plains', AK: 'Alaska', HI: 'Hawaii', INTL: 'Off the map (territories and abroad)',
};
const TX_SPLIT_LON = -99;
function regionFor(state, lon) {
  const s = String(state).split('/')[0].trim();          // 'OR/ID' -> OR, 'TX/NM' -> TX
  if (s === 'TX') return lon < TX_SPLIT_LON || /NM/.test(state) ? 'SW' : 'GULF';
  for (const [k, list] of Object.entries(REGION_OF)) if (list.includes(s)) return k;
  return 'INTL';                                         // PR, VI, MH, ON, MX, CDMX, RU, JP, AQ, NZ ...
}

// ---------- biome / layout normalisation ----------
const BIOME_NEAREST = {
  desert: 'desert_sonoran', sonoran: 'desert_sonoran', mojave: 'desert_mojave', plateau: 'high_plateau', mesa: 'high_plateau',
  plains: 'great_plains', prairie: 'prairie_farm', farm: 'prairie_farm', forest: 'temperate_forest', woodland: 'temperate_forest',
  mountain: 'alpine', alpine: 'alpine', swamp: 'deep_south_swamp', bayou: 'deep_south_swamp', marsh: 'deep_south_swamp',
  tropical: 'gulf_coast', jungle: 'gulf_coast', island: 'gulf_coast', gulf: 'gulf_coast', atlantic: 'atlantic_coast', coast: 'atlantic_coast',
  lakes: 'great_lakes_rust', rust: 'great_lakes_rust', pine: 'northern_pine', boreal: 'northern_pine', rain: 'pacific_rain',
  tundra: 'tundra_north', arctic: 'tundra_north', ice: 'tundra_north', polar: 'tundra_north', badland: 'badlands', salt: 'salt_flat',
  delta: 'river_delta', river: 'river_delta', hot: 'hot_ground', crater: 'hot_ground',
};
function normBiome(r, log) {
  if (BIOMES.includes(r.biome)) return;
  const raw = String(r.biome || '');
  const key = Object.keys(BIOME_NEAREST).find((k) => raw.toLowerCase().includes(k));
  const to = key ? BIOME_NEAREST[key] : 'temperate_forest';
  r.biome_note = [raw && `research said ${raw}`, r.biome_note].filter(Boolean).join('; ');
  log.push(`${r.id}: biome ${raw} -> ${to}`);
  r.biome = to;
}
// The same proposed id spelled three ways for one place; fold to one.
const LAYOUT_NEW_ALIAS = { canyon_rim: 'rim_edge_village', canyon_rim_village: 'rim_edge_village' };
function normLayout(r, log) {
  let fresh = [].concat(r.layout_new || []);
  if (!LAYOUTS.includes(r.layout)) { fresh.push(r.layout); log.push(`${r.id}: layout ${r.layout} -> main_street_strip (kept in layout_new)`); r.layout = 'main_street_strip'; }
  fresh = [...new Set(fresh.map((x) => LAYOUT_NEW_ALIAS[x] || x))];
  if (fresh.length) r.layout_new = fresh.length === 1 ? fresh[0] : fresh; else delete r.layout_new;
}

// ---------- clamps ----------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function clampRow(r, log) {
  const fp = r.footprint.map((m) => clamp(Math.round(m), 150, 600));
  if (fp.join() !== r.footprint.join()) log.push(`${r.id}: footprint ${r.footprint} -> ${fp}`);
  r.footprint = fp;
  for (const s of r.structures) {
    const cl = (n) => clamp(n, 0, 6);
    const next = Array.isArray(s.storeys) ? s.storeys.map(cl) : cl(s.storeys);
    if (JSON.stringify(next) !== JSON.stringify(s.storeys)) log.push(`${r.id}: ${s.kind} storeys ${JSON.stringify(s.storeys)} -> ${JSON.stringify(next)}`);
    s.storeys = next;
  }
  const kept = r.palette.filter((c) => !bannedHue(c));
  if (kept.length !== r.palette.length) log.push(`${r.id}: palette dropped ${r.palette.filter(bannedHue).join(',')}`);
  r.palette = kept.length ? kept : ['#8a7a62'];
  r.density = clamp(r.density, 0, 1);
}

// ---------- source normalisation ----------
const PICK_RE = /\bour (pick|anchor|guess|choice|stand-in)\b|\bregional[_ ]pick\b|recurring-geography/i;
const PICK_CAPS = /\bOUR\b/; // part 1 flags its own anchors in capitals ('Houma is OUR anchor')
function normSource(r) {
  const src = r.source || {};
  const books = [].concat(src.book || []).map((b) => (typeof b === 'number' ? b : parseInt(String(b).replace(/^#/, ''), 10))).filter(Number.isInteger);
  const anchor = src.anchor === 'regional_pick' || src.anchor === 'named' ? src.anchor
    : PICK_RE.test(`${r.notes} ${src.notes || ''}`) || PICK_CAPS.test(`${r.notes} ${src.notes || ''}`) || r.anchor || !books.length ? 'regional_pick' : 'named';
  r.source = { book: [...new Set(books)].sort((a, b) => a - b), anchor, notes: src.notes || '' };
  delete r.anchor;
}

// ---------- dedupe ----------
const R_EARTH = 6371;
function km(a, b) {
  const t = (x) => (x * Math.PI) / 180;
  const h = Math.sin(t(b.lat - a.lat) / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(t(b.lon - a.lon) / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}
const normPlace = (r) => `${r.real.place.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '')}|${r.real.state}`;
// Words that say nothing about WHICH place (city names, generic nouns). Two rows inside 3 km merge only when
// they also share a word outside this list: Times Square and Grand Central sit 0.9 km apart but are two sites.
const STOP = new Set(('the and of at on in near to a an by its with as old new us u s st saint city town downtown midtown lower upper north south east west ' +
  'center centre district historic park state national station point river lake hill area main street avenue end square site plaza ' +
  'manhattan nyc york chicago seattle denver louis milwaukee baltimore detroit washington dc mexico san juan mesa grounds and').split(/\s+/));
const tokens = (r) => new Set(r.real.place.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const samePlace = (a, b) => {
  if (normPlace(a) === normPlace(b) || a.id === b.id) return true;
  if (a.real.state !== b.real.state) return false;
  const d = km(a.real, b.real);
  if (d < 0.2) return true;
  if (d >= 3) return false;
  const ta = tokens(a);
  return [...tokens(b)].some((w) => ta.has(w));
};
const richness = (r) => JSON.stringify(r).length;
function mergeInto(keep, drop) {
  keep.real.refs = [...new Set([...keep.real.refs, ...drop.real.refs])];
  keep.source.book = [...new Set([...keep.source.book, ...drop.source.book])].sort((a, b) => a - b);
  if (drop.source.notes && !keep.source.notes.includes(drop.source.notes)) keep.source.notes = [keep.source.notes, drop.source.notes].filter(Boolean).join(' / ');
  if (keep.source.anchor !== drop.source.anchor) keep.source.anchor = 'named'; // any book that names it outright wins
  if (!keep.bunker && drop.bunker) keep.bunker = drop.bunker;
  if (!keep.biome_note && drop.biome_note) keep.biome_note = drop.biome_note;
  const ln = [...new Set([...[].concat(keep.layout_new || []), ...[].concat(drop.layout_new || [])].map((x) => LAYOUT_NEW_ALIAS[x] || x))];
  if (ln.length) keep.layout_new = ln.length === 1 ? ln[0] : ln;
  keep.merged_from = [...new Set([...(keep.merged_from || []), drop.id, ...(drop.merged_from || [])])].filter((x) => x !== keep.id);
}
function dedupe(rows, log) {
  const out = [];
  for (const r of rows) {
    const hit = out.find((o) => samePlace(o, r));
    if (!hit) { out.push(r); continue; }
    const [keep, drop] = richness(r) > richness(hit) ? [r, hit] : [hit, r];
    mergeInto(keep, drop);
    log.push(`merge ${drop.id} (part ${drop._part}) into ${keep.id} (part ${keep._part})`);
    if (keep !== hit) out[out.indexOf(hit)] = keep;
  }
  return out;
}

// ---------- hand fixes: IP rewording + respect ----------
// Each entry is applied after the merge. `set` paths are dotted; values replace. Keep reasons in `why`.
const FIXES = {
  'front-royal-va': { why: 'the town name is on the deny list (book slang for the hero valley); the row keeps the real geography',
    set: { 'real.place': 'Warren County seat at the forks of the Shenandoah (VA-55 / US-340)' } },
  'acoma-sky-city': { why: 'Acoma is a living Pueblo nation; the book-shape (a pueblo that sacrifices strangers) is never pinned on it',
    set: { shape: 'a mesa-top stone village reached only by rock stairs, wary of armed strangers', 'society.houseRules': ['no_strangers_after_sundown', 'no_guns_on_the_stairs'], loot: ['water', 'dried_corn'] } },
  'utqiagvik': { why: 'a living Inupiat city; the book-shape (wants outsiders as an offering) is dropped',
    set: { shape: 'an arctic coast town on pilings that trades fuel and meat for news from the south' } },
  'cliff-palace': { why: 'ancestral Pueblo site; the squatter cult is not a Pueblo people',
    set: { 'society.faction': 'raider', loot: ['herbs', 'water'] } },
  'chaco-canyon-nm': { why: 'ancestral Pueblo site; no artifact loot',
    set: { loot: ['water', 'scrap'] } },
  'chapin-mesa': { why: 'park museum of ancestral Pueblo collections; no artifact loot',
    set: { loot: ['maps', 'tools'] } },
  'taos-pueblo': { why: 'a living Pueblo (UNESCO); never hostile, no cultural loot',
    set: { loot: ['trade_goods', 'water'] } },
  'el-tajin-mx': { why: 'a real Totonac heritage site; the invented tribe is post-collapse and fictional, no sacrifice rule',
    set: { 'society.houseRules': ['tribute_at_the_pyramid', 'no_fires_on_the_steps'] } },
  'nakijin-castle-jp': { why: 'Ryukyu heritage site; drop the stereotype house rule',
    set: { 'society.houseRules': ['guests_under_protection', 'no_blades_drawn_in_the_courts'] } },
  'el-morro-fortress': { why: 'review term (citadel) reworded; the real fort is a hornwork castle',
    set: { shape: 'six-level stone castle on a headland, the scientist keep with a teleport room', 'structures.0.kind': 'castle_terraces' } },
  'willamette-national-cemetery': { why: 'an active veterans cemetery; no grave-robbing',
    set: { shape: 'a hilltop of white headstone rows where rival crews fight over the high ground and the groundskeepers\' yard',
      'society.rulerTitle': 'the Yard Bosses', 'society.houseRules': ['no_digging', 'claims_by_the_yard_only'], loot: ['tools', 'fuel', 'tarps'],
      hazards: ['mud_slides', 'rain'] } },
};
// Respect notes ride the row so the generator / writers see them where they use the place.
const RESPECT = {
  'taos-pueblo': 'Living Taos Pueblo community (UNESCO). Never an enemy faction, no raids on it, no cultural loot; kivas and the San Geronimo cemetery are off-limits geometry.',
  'acoma-sky-city': 'Living Acoma Pueblo (Sky City). Never hostile or sacrificial; kivas are off-limits geometry; no cultural loot.',
  'chaco-canyon-nm': 'Ancestral Pueblo great house, sacred to living Pueblo and Dine peoples. Ruin is a backdrop: squatters are outsiders, no pottery or turquoise loot, kivas never a fight floor.',
  'cliff-palace': 'Ancestral Pueblo cliff dwelling (Mesa Verde, UNESCO). The cult squatting here is fictional and not Pueblo; no artifact loot.',
  'chapin-mesa': 'Mesa Verde park headquarters; the museum holds ancestral Pueblo collections. No artifact loot.',
  'el-tajin-mx': 'Totonac heritage city (UNESCO). The jungle tribe is an invented post-collapse group, not the Totonac people; no human sacrifice on screen.',
  'oak-alley-la': 'A plantation built on enslaved labour. Never a glamorous estate: show the reconstructed slave quarters, name the history in the world text, and the night family is a horror villain, not a romance.',
  'st-helena-island-sc': 'Gullah Geechee community of freedmen\'s descendants. Shown as capable and self-governing, never as a prize to raid.',
  'bikini-atoll': 'Nuclear test site whose Marshallese people were displaced. The warlord is an outsider; the ground stays hot for a reason the world text names.',
  'nyc-lower-manhattan-2001': 'The World Trade Center as it stood in 2001. Calm daytime backdrop only: no attack, collapse, fire or plane imagery; no loot from the towers.',
  'willamette-national-cemetery': 'Active national veterans cemetery. No grave-robbing, no open graves, no medals or dog-tag loot; fights stay on the paths and the maintenance yard.',
  'devils-tower': 'Bear Lodge is sacred to Lakota, Cheyenne, Kiowa and other Plains nations. No climbing set-piece on the tower face; the sacred valley is fiction.',
  'mount-rushmore-sd': 'The Black Hills are sacred to the Lakota and were taken in breach of treaty; the world text says so. The vault inside is fiction.',
  'utqiagvik': 'Living Inupiat city. Townsfolk are traders and hunters, never villains; no whale-hunt as spectacle.',
  'salt-lake-temple-square': 'Active temple of a living faith. The occupiers are the villains; the temple interior is never a fight space or a loot room.',
  'shiloh-tn': 'Civil War battlefield and national cemetery. The warlord base is new-built beside it; graves are never dug or looted.',
  'bull-run-manassas': 'Civil War battlefield. No grave loot; relic finds stay field scrap, not remains.',
  'nakijin-castle-jp': 'Ryukyu Kingdom castle (UNESCO). The warlord court is fiction; no samurai-stereotype rules.',
  'wv-penitentiary-moundsville': 'Real prison where people died. Breakout play is fine; no torture or execution set-pieces.',
};

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}

// ---------- IP scan ----------
const flat = (groups) => Object.entries(groups).flatMap(([src, terms]) => terms.map((t) => ({ t, src })));
const pattern = (t) => new RegExp(`(?<![a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i');
const REVIEW_LIST = flat(REVIEW).map((x) => ({ ...x, re: pattern(x.t) }));
void DENY;
function strings(v, path, out) {
  if (path === 'source.book') return out;
  if (typeof v === 'string') out.push({ path, s: v });
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strings(x, path ? `${path}.${k}` : k, out);
  return out;
}
function ipScan(rows) {
  const deny = [], review = [];
  for (const r of rows) for (const { path, s } of strings(r, '', [])) {
    for (const h of denyHits(s)) deny.push(`${r.id} ${path}: "${h.term}" [${h.source}] in "${s.slice(0, 90)}"`);
    for (const { t, src, re } of REVIEW_LIST) if (re.test(s)) review.push(`${r.id} ${path}: "${t}" [${src}]`);
  }
  return { deny, review };
}

// ---------- layout_new descriptions (for the city generator lane) ----------
const LAYOUT_NEW_DESC = {
  barrier_island_strip: 'one road and one bridge onto a long thin sand island; camps on pilings either side of the spine',
  battlefield_ridges: 'open rolling ridges and creek bottoms with a single stone bridge; sparse farm buildings',
  bayou_linear_town: 'a town strung for kilometres along converging bayous, drawbridges at the crossings',
  bluff_castle: 'a ruined stone mansion on a bluff over a spring-fed lake, a cave maze below',
  boneyard_rows: 'endless parade-ground rows of parked aircraft on a desert apron, hangars at one edge',
  buried_film_set_dunes: 'giant plaster set pieces half-buried in shifting coastal dunes',
  butte_and_river_valley: 'a lone column butte over a forested river valley, camps on the valley floor',
  caldera_rim: 'a ring road on the cliff rim of a crater lake, one trail down to the shore',
  canyon_floor_camp: 'a stone camp on a narrow canyon floor, suspension footbridges over the river',
  canyon_highway: 'highway and rail stacked on ledges along a deep river slot canyon',
  canyon_ranch: 'a ranch compound in a red-cliff box canyon, one way in',
  causeway_island_chain: 'a chain of keys tied by long low bridges and causeways over open water',
  ceremonial_plaza: 'stepped pyramids and ball courts around open plazas, jungle pressing in',
  cinder_cone_island: 'a steep cinder cone rising from a lake, a summit crater and a landing cove',
  dacha_village: 'wooden country houses scattered in birch woods around a church and a rail halt',
  estate_grounds: 'one great house behind iron fences inside wide formal lawns',
  glacier_cirque: 'a high bowl of cliffs around a shrinking glacier and its meltwater lake',
  gorge_bridge_span: 'a single high bridge over a sheer gorge on flat mesa, rest stop at one end',
  grand_resort_lawn: 'a huge resort hotel on manicured lawns with cottages, a bunker under one wing',
  hill_crown_residential: 'a hilltop grid of big frame houses with public stairs dropping down every side',
  hilltop_castle_terraces: 'curving stone walls in nested terraces climbing a hilltop to an inner court',
  island_ranch_cove: 'a ranch house and outbuildings in a cove valley of a rugged island, pier at the beach',
  lake_lodge: 'a lodge and boathouse on a glassy mountain lake, carriage roads around the shore',
  lakefront_park_harbor: 'a formal lakefront park of fountains and lawns with a breakwater harbor',
  monument_cliff_terrace: 'a viewing terrace and approach avenue under a carved cliff face',
  monumental_mall: 'a long axial lawn lined with monumental halls, an obelisk and a reflecting pool',
  mountain_pass_summit: 'a forested pass summit: lodge strip, lake, dead rail tunnel portal',
  park_market_meadow: 'a big city park meadow inside a ring of towers, paths and a reservoir',
  prairie_ranch_spread: 'a stone ranch manor and barns scattered over rolling tallgrass hills',
  rim_edge_village: 'a hotel-and-depot village strung along a canyon lip, rail spur behind',
  river_bluff_city: 'a downtown grid on a bluff over a big river, cobbled landing below',
  river_canyon_bridges: 'a river channel walled by towers with lift bridges every block',
  salt_raceway: 'a perfectly flat white salt pan with one marked course and no cover',
  suburban_cul_de_sac: 'curving cul-de-sac subdivisions and dry canals across a flat desert basin',
  summit_road_loop: 'a bald granite summit reached by one switchback road ending in a loop',
  swamp_causeway: 'a raised road and canals through open sawgrass, a lone tower at the loop end',
  volcano_flank: 'ash slopes and lava ridges on a volcano flank, a lodge and a pass road',
};

// ---------- run ----------
const log = [];
const parts = [1, 2, 3, 4].map((n) => JSON.parse(readFileSync(join(IN_DIR, `part-${n}.json`), 'utf8')));
const rowsIn = parts.flatMap((p, i) => p.sites.map((r) => ({ ...structuredClone(r), _part: i + 1 })));

for (const r of rowsIn) { normSource(r); normBiome(r, log); normLayout(r, log); clampRow(r, log); }
let rows = dedupe(rowsIn, log);

for (const r of rows) {
  const f = FIXES[r.id];
  if (f) { for (const [p, v] of Object.entries(f.set)) setPath(r, p, v); log.push(`fix ${r.id}: ${f.why}`); }
  if (RESPECT[r.id]) r.respect = RESPECT[r.id];
  r.region = regionFor(r.real.state, r.real.lon);
}
const missingFix = [...Object.keys(FIXES), ...Object.keys(RESPECT)].filter((id) => !rows.some((r) => r.id === id));
if (missingFix.length) log.push(`WARN fix/respect ids not found: ${[...new Set(missingFix)].join(', ')}`);

// Unique ids and names (the merge keeps the richer id; a clash after that gets the state appended).
const seenId = new Set(), seenName = new Set();
for (const r of rows) {
  let id = r.id;
  if (seenId.has(id)) { id = `${r.id}-${String(r.real.state).toLowerCase().replace(/[^a-z]/g, '')}`; log.push(`id ${r.id} -> ${id}`); }
  for (let k = 2; seenId.has(id); k++) id = `${r.id}-${k}`;
  r.id = id; seenId.add(id);
  let name = String(r.name).toUpperCase();
  if (seenName.has(name)) { name = `${name} (${String(r.real.state).toUpperCase()})`; log.push(`name ${r.name} -> ${name}`); }
  for (let k = 2; seenName.has(name); k++) name = `${r.name} ${k}`;
  r.name = name; seenName.add(name);
}

// Field order as the bible lists it, extras after.
const ORDER = ['id', 'name', 'region', 'real', 'shape', 'biome', 'biome_note', 'kind', 'footprint', 'layout', 'layout_new', 'terrain', 'structures',
  'landmarks', 'walls', 'density', 'heightProfile', 'society', 'economy', 'hazards', 'creatures', 'loot', 'audio', 'palette', 'bunker', 'notes',
  'respect', 'source', 'merged_from'];
rows = rows.map((r) => {
  delete r._part;
  const o = {};
  for (const k of ORDER) if (r[k] !== undefined) o[k] = r[k];
  for (const k of Object.keys(r)) if (!(k in o)) o[k] = r[k];
  return o;
});
rows.sort((a, b) => a.region.localeCompare(b.region) || a.real.state.localeCompare(b.real.state) || a.id.localeCompare(b.id));

// Bunker regions (parts 2 and 4), deduped by the same place rule.
const bunkersIn = parts.flatMap((p) => p.bunker_regions || []);
const BUNKER_REGIONS = [];
for (const b of bunkersIn) {
  const dup = BUNKER_REGIONS.find((o) => o.state === b.state && (km(o, b) < 3 || o.real_base.toLowerCase() === b.real_base.toLowerCase()));
  if (dup) { if (b.notes && !dup.notes.includes(b.notes)) dup.notes += ` / ${b.notes}`; continue; }
  BUNKER_REGIONS.push({ ...b, region: regionFor(b.state, b.lon) });
}

// layout_new census.
const lnCount = {};
for (const r of rows) for (const l of [].concat(r.layout_new || [])) lnCount[l] = (lnCount[l] || 0) + 1;
const LAYOUT_NEW = Object.keys(lnCount).sort().map((id) => ({ id, rows: lnCount[id], desc: LAYOUT_NEW_DESC[id] || '' }));
for (const l of LAYOUT_NEW) if (!l.desc) log.push(`WARN layout_new ${l.id} has no description`);

const ip = ipScan(rows);
const problems = validateSites(rows);

// ---------- report ----------
const byRegion = {};
for (const r of rows) byRegion[r.region] = (byRegion[r.region] || 0) + 1;
console.log(`sites-merge: ${rowsIn.length} rows in -> ${rows.length} after dedupe`);
console.log('per region:', JSON.stringify(byRegion));
console.log(`bunker rows: ${rows.filter((r) => r.bunker).length}, bunker regions: ${BUNKER_REGIONS.length} (from ${bunkersIn.length})`);
console.log(`anchor: ${rows.filter((r) => r.source.anchor === 'named').length} named, ${rows.filter((r) => r.source.anchor === 'regional_pick').length} regional_pick`);
console.log(`layout_new (${LAYOUT_NEW.length}): ${LAYOUT_NEW.map((l) => `${l.id}×${l.rows}`).join(', ')}`);
console.log(`invented_skipped: ${parts.reduce((n, p) => n + (p.invented_skipped || []).length, 0)}`);
console.log(`\nlog (${log.length}):\n  ${log.join('\n  ')}`);
console.log(`\nIP deny hits (${ip.deny.length})${ip.deny.length ? ':\n  ' + ip.deny.join('\n  ') : ''}`);
console.log(`IP review hits (${ip.review.length})${ip.review.length ? ':\n  ' + ip.review.join('\n  ') : ''}`);
console.log(`validateSites: ${problems.length} problems${problems.length ? ':\n  ' + problems.join('\n  ') : ''}`);

if (DRY) process.exit(ip.deny.length || problems.length ? 1 : 0);
if (ip.deny.length || problems.length) { console.error('\nnot writing: fix the deny hits / problems first'); process.exit(1); }

// ---------- write ----------
mkdirSync(OUT_DIR, { recursive: true });
const regions = Object.keys(SITE_REGIONS).filter((k) => byRegion[k]);
for (const k of regions) {
  const list = rows.filter((r) => r.region === k);
  const body = `// SITE rows for ${SITE_REGIONS[k]} (${list.length}) - generated by tools/sites-merge.mjs from docs/research/deathlands-locations; edit the research or the tool, not this file.\n` +
    `export const SITES_${k} = ${JSON.stringify(list, null, 2)};\n`;
  writeFileSync(join(OUT_DIR, `${k.toLowerCase()}.js`), body);
}
const index = `// The SITE catalogue (docs/design/WEB_LOCATION_BIBLE.md §3.1) - generated by tools/sites-merge.mjs; the city lane adds _seed.js itself.
${regions.map((k) => `import { SITES_${k} } from './${k.toLowerCase()}.js';`).join('\n')}
export { validateSites } from './validate.js';

export const SITES = [${regions.map((k) => `...SITES_${k}`).join(', ')}];

export const SITE_REGIONS = ${JSON.stringify(Object.fromEntries(Object.entries(SITE_REGIONS).map(([k, label]) => [k, { label, states: REGION_OF[k] || [], rows: byRegion[k] || 0 }])), null, 2)};

// Real bases the books jump through without naming a site row (research parts 2 and 4, deduped).
export const BUNKER_REGIONS = ${JSON.stringify(BUNKER_REGIONS, null, 2)};

// Layout ids the research proposed beyond §3.4 (each row keeps a §3.4 \`layout\` as the fallback); for the city generator lane.
export const LAYOUT_NEW = ${JSON.stringify(LAYOUT_NEW, null, 2)};
`;
writeFileSync(join(OUT_DIR, 'index.js'), index);
console.log(`\nwrote ${regions.length} region files + index.js to ${OUT_DIR}`);
