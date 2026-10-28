// SITE row checker (docs/design/WEB_LOCATION_BIBLE.md §3.1/§3.3/§3.4): plain data in, a list of problems out.
// Shared by tools/sites-merge.mjs (before it writes rows) and index.js (validateSites for the selftest).

export const BIOMES = ['desert_sonoran', 'desert_mojave', 'high_plateau', 'great_plains', 'prairie_farm', 'temperate_forest',
  'appalachian', 'deep_south_swamp', 'gulf_coast', 'atlantic_coast', 'great_lakes_rust', 'northern_pine', 'alpine', 'pacific_rain',
  'tundra_north', 'badlands', 'salt_flat', 'river_delta', 'hot_ground'];

export const LAYOUTS = ['grid_downtown', 'main_street_strip', 'courthouse_square', 'river_fork_terraced', 'mesa_pueblo', 'canyon_stack',
  'star_fort', 'bastion_fort', 'company_town', 'mill_town_river', 'port_wharf', 'stilt_village', 'interchange_ring', 'campus_quad',
  'mall_island', 'refinery_maze', 'rail_yard', 'dam_and_spillway', 'military_base_grid', 'missile_field', 'prison_compound',
  'stadium_bowl', 'amusement_park', 'cemetery_hill', 'mine_head', 'plantation_row', 'oasis_ring', 'tank_farm', 'airport_apron',
  'cooling_tower_field'];

export const KINDS = ['holdout', 'ruin', 'station', 'fort', 'industrial', 'camp', 'landmark', 'trade', 'farm', 'military'];
export const HEIGHT_PROFILES = ['flat', 'center_peak', 'stepped_up_slope', 'edge_tall', 'scattered'];
export const REGION_KEYS = ['FL', 'SW', 'CA', 'GULF', 'MW', 'NE', 'SE', 'NW', 'PLAINS', 'AK', 'HI', 'INTL'];

// Hue of a #rrggbb colour in degrees (null for a pure grey, which has no hue).
export function hexHue(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return null;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
export const bannedHue = (hex) => { const h = hexHue(hex); return h !== null && h >= 270 && h <= 320; };

const num = (x) => typeof x === 'number' && Number.isFinite(x);
const storeyList = (s) => (Array.isArray(s) ? s : [s]);

export function validateSites(rows) {
  const problems = [];
  const ids = new Set(), names = new Set();
  rows.forEach((r, i) => {
    const at = r && r.id ? r.id : `#${i}`;
    const bad = (msg) => problems.push(`${at}: ${msg}`);
    if (!r || typeof r !== 'object') { bad('not an object'); return; }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id || '')) bad('id must be kebab-case');
    if (ids.has(r.id)) bad('duplicate id'); ids.add(r.id);
    if (typeof r.name !== 'string' || !r.name || r.name !== r.name.toUpperCase()) bad('name must be ALL CAPS');
    if (names.has(r.name)) bad(`duplicate name ${r.name}`); names.add(r.name);
    const re = r.real || {};
    if (!re.place || !re.state) bad('real.place/state missing');
    if (!num(re.lat) || !num(re.lon) || Math.abs(re.lat) > 90 || Math.abs(re.lon) > 180) bad('real.lat/lon invalid');
    if (!Array.isArray(re.refs) || !re.refs.length || re.refs.some((u) => !/^https?:\/\//.test(u))) bad('real.refs needs at least one URL');
    if (typeof r.shape !== 'string' || !r.shape) bad('shape missing');
    if (!BIOMES.includes(r.biome)) bad(`biome ${r.biome} not in §3.3`);
    if (!KINDS.includes(r.kind)) bad(`kind ${r.kind} unknown`);
    if (!Array.isArray(r.footprint) || r.footprint.length !== 2 || r.footprint.some((m) => !num(m) || m < 150 || m > 600)) bad('footprint must be [x,z] in 150..600 m');
    if (!LAYOUTS.includes(r.layout)) bad(`layout ${r.layout} not in §3.4`);
    if (!r.terrain || typeof r.terrain !== 'object') bad('terrain missing');
    if (!Array.isArray(r.structures) || !r.structures.length) bad('structures empty');
    else r.structures.forEach((s) => {
      if (!s.kind) bad('structure without kind');
      if (storeyList(s.storeys).some((n) => !num(n) || n < 0 || n > 6)) bad(`structure ${s.kind} storeys must be 0..6`);
    });
    if (!Array.isArray(r.landmarks)) bad('landmarks must be an array');
    if (!r.walls || typeof r.walls.type !== 'string') bad('walls.type missing');
    if (!num(r.density) || r.density < 0 || r.density > 1) bad('density must be 0..1');
    if (!HEIGHT_PROFILES.includes(r.heightProfile)) bad(`heightProfile ${r.heightProfile} unknown`);
    if (!r.society || typeof r.society !== 'object') bad('society missing');
    if (!r.economy || typeof r.economy !== 'object') bad('economy missing');
    for (const k of ['hazards', 'creatures', 'loot']) if (!Array.isArray(r[k])) bad(`${k} must be an array`);
    if (!Array.isArray(r.palette) || !r.palette.length) bad('palette empty');
    else r.palette.forEach((c) => { if (hexHue(c) === null && !/^#[0-9a-f]{6}$/i.test(c)) bad(`palette ${c} not #rrggbb`); if (bannedHue(c)) bad(`palette ${c} hue 270-320`); });
    if (typeof r.notes !== 'string') bad('notes missing');
    if (!REGION_KEYS.includes(r.region)) bad(`region ${r.region} unknown`);
    const src = r.source || {};
    // An empty book list is allowed only for a regional pick (the 'recurring geography' rows: a real archetype the series keeps returning to).
    if (!Array.isArray(src.book) || src.book.some((b) => !Number.isInteger(b) || b < 0)) bad('source.book must be book numbers');
    else if (!src.book.length && src.anchor !== 'regional_pick') bad('source.book empty on a named row');
    if (!['named', 'regional_pick'].includes(src.anchor)) bad('source.anchor must be named|regional_pick');
  });
  return problems;
}
