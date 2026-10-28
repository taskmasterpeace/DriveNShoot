// BACK LOTS AND ALLEYS (docs/design/WEB_BACK_LOTS.md). Rows only: world/citygen/layout.js plans the alleys, the yards and
// the docks from them, world/citygen/build.js stands them up, systems/backlots.js runs the fences, the gates and the
// locks. A new fence, a new yard prop or a new lock rule is a row here, not a code path.
//
// Robert (2026-10-28): "Back lots and alleys. Every block gets a service alley. Houses get backyards... Back doors would
// be the quiet way in. Lock, so kick, pry."

// ALLEYS: the service lane down the back of every block (between the two rows of lots, or along the back of a one-sided
// block). w: the drivable lane (a car needs 4.5 m); verge: the strip each side of it where the poles, bins and dumpsters
// stand (never in the lane); grip: a car's grip on it (vehicles.js roadGrip); zones: the block zones that get this row.
export const ALLEYS = {
  paved:  { name: 'paved service alley', w: 5.0, verge: 1.1, grip: 0.95, color: '#47464a', edge: '#5e5a54', zones: ['core', 'commercial', 'civic', 'industrial', 'rail', 'military'] },
  gravel: { name: 'gravel back lane', w: 4.8, verge: 1.1, grip: 0.82, color: '#857c6e', edge: '#948a78', zones: ['res'] },
  dirt:   { name: 'dirt back lane', w: 4.6, verge: 1.1, grip: 0.74, color: '#8a7458', edge: '#977f60', zones: ['farm'] },
};
// The plan: blocks grow by the alley's corridor (lane + both verges) so the lots keep the depth they had.
//   dirtPast: a res block this far out (0 centre .. 1 edge) gets the dirt lane instead of gravel.
export const ALLEY_PLAN = { grow: 7.2, dirtPast: 0.7, poleEvery: 28, dumpsterPer: 1, binChance: 0.5 };

// FENCES: what a back yard is closed with. h: height (m); t: thickness; tag: its collision tag (data/materials.js rules
// say what it is made of: bullets go through chain-link, splinter a picket); climb: seconds of holding E to get over it;
// climbNoise: m a climb is heard (chain-link rattles); kicks: boots to break a panel (0: it does not break: a wall);
// breakNoise: m a broken panel is heard; post: m between posts; color, postColor.
export const FENCES = {
  picket:  { name: 'picket fence', h: 1.1, t: 0.08, tag: 'bl-picket', climb: 0.9, climbNoise: 5, kicks: 2, breakNoise: 22, post: 2.4, color: '#d6cfbf', postColor: '#bcb4a2' },
  privacy: { name: 'board privacy fence', h: 1.9, t: 0.1, tag: 'bl-privacy', climb: 2.2, climbNoise: 8, kicks: 3, breakNoise: 26, post: 2.4, color: '#8a6a48', postColor: '#6e5236' },
  chain:   { name: 'chain-link fence', h: 1.8, t: 0.06, tag: 'bl-chain', climb: 2.6, climbNoise: 14, kicks: 0, breakNoise: 0, post: 3.0, color: '#9a9a92', postColor: '#7a7a74' },
  adobe:   { name: 'adobe yard wall', h: 1.6, t: 0.3, tag: 'bl-adobe', climb: 1.8, climbNoise: 4, kicks: 0, breakNoise: 0, post: 0, color: '#b98a5c', postColor: '#a77a50' },
  rail:    { name: 'split-rail fence', h: 1.2, t: 0.12, tag: 'bl-rail', climb: 0.7, climbNoise: 4, kicks: 3, breakNoise: 20, post: 3.0, color: '#7a5e40', postColor: '#5e4630' },
};
// Which fence a yard gets: the first row whose biomes hold the town's biome, then by the town's wealth (0..1): under
// poor -> poor, under rich -> mid, else rich.
export const FENCE_PICK = [
  { biomes: ['desert_sonoran', 'desert_mojave', 'high_plateau', 'badlands', 'salt_flat'], poor: 'chain', mid: 'adobe', rich: 'adobe', poorBelow: 0.3, richAbove: 0.6 },
  { biomes: ['great_plains', 'prairie_farm', 'alpine', 'tundra_north'], poor: 'rail', mid: 'chain', rich: 'picket', poorBelow: 0.3, richAbove: 0.55 },
  { biomes: ['gulf_coast', 'deep_south_swamp', 'river_delta'], poor: 'chain', mid: 'chain', rich: 'privacy', poorBelow: 0.35, richAbove: 0.55 },
  { biomes: ['*'], poor: 'chain', mid: 'privacy', rich: 'picket', poorBelow: 0.3, richAbove: 0.55 },
];

// GATES: a yard's alley gate (and the side gates beside the house) hang as real leaves from the interiors pool (kick,
// pick, pry; a locked one blocks the nav grid). w: the alley gate's width; side: a side yard narrower than sideMax gets
// one gate the yard's width, wider ones a gate of side.w and a panel; near: m from you a yard's gates hang (the leaf pool
// is shared with every door in town).
export const GATES = { w: 1.4, side: { w: 1.4, max: 2.6 }, near: 55 };

// LOCKS: the share of back doors, alley gates and dock doors locked, by building class x the town's state. A row per
// class; KIND_CLASS says which class a building kind is. Front doors keep their own rules (none locked).
export const LOCKS = {
  home:       { holding: 0.45, retaken: 0.3, overrun: 0.06, gate: 0.25 },
  shop:       { holding: 0.6, retaken: 0.4, overrun: 0.1, gate: 0.15 },
  civic:      { holding: 0.5, retaken: 0.35, overrun: 0.08, gate: 0.1 },
  industrial: { holding: 0.55, retaken: 0.4, overrun: 0.12, gate: 0.2 },
  law:        { holding: 0.85, retaken: 0.6, overrun: 0.2, gate: 0.5 },
};
export const KIND_CLASS = {
  house: 'home', bungalow: 'home', rowhouse: 'home', adobe: 'home', stilt_house: 'home', cabin: 'home', trailer: 'home', farmhouse: 'home', ranch_house: 'home', apartment: 'home', motel: 'home', garage: 'home',
  shop: 'shop', saloon: 'shop', diner: 'shop', gas_station: 'shop', office: 'shop', hotel: 'shop', truck_stop: 'shop',
  church: 'civic', school: 'civic', clinic: 'civic', hospital: 'civic', courthouse: 'civic', fire_station: 'civic',
  auto_shop: 'industrial', parking: 'industrial', warehouse: 'industrial', quonset: 'industrial', barn: 'industrial', grain_elevator: 'industrial', mill: 'industrial',
  police_station: 'law', cloning_center: 'law', barracks: 'law', hq: 'law', guardhouse: 'law',
};

// NOISE: how far each way in is heard (m; main.js noise()). The door's own rows (data/interiors.js DOOR.kickNoise,
// inventory.js forceLock: picks make none, a bar 18) are the truth for doors; these are the back lot's own.
export const NOISE = { gateKick: 26, gatePick: 0, gatePry: 18, gateSwing: 0 };

// YARDS: which kinds of building get a fenced back yard (a home with its own lot), and its least depth.
//   minYard: m of yard behind the house the plan keeps (a lot too shallow for it takes another kind); walk: m kept clear
//   along the house's back wall (the way round the house); spacing: m between a yard home and its neighbours (a side
//   yard each side wide enough to walk and hang a side gate).
export const YARD = {
  kinds: ['house', 'bungalow', 'cabin', 'stilt_house', 'trailer', 'farmhouse', 'ranch_house', 'rowhouse', 'adobe'],
  minYard: 6, walk: 2.2, spacing: [4.2, 7], sideGateAt: 1.2,
};
// Yard props: what stands in a back yard. chance: per yard (x the town's wealth lean `lean`: + richer, - poorer);
// w, d, h: size (m); tag: collision (null: walk over it); col: colour; pen: a chain-link run (posts and wire, a gate gap).
export const YARD_PROPS = {
  shed:        { name: 'tool shed', chance: 0.55, lean: 0.2, w: 2.4, d: 2.0, h: 2.2, tag: 'bl-shed', col: '#7a6a52', roof: '#5a4a3a' },
  dog_run:     { name: 'dog run', chance: 0.3, lean: 0, w: 2.4, d: 4.0, h: 1.6, tag: 'bl-chain', col: '#9a9a92', pen: true },
  clothesline: { name: 'clothesline', chance: 0.5, lean: -0.1, w: 4.0, d: 0.1, h: 1.9, tag: null, col: '#c8c2b4', line: true },
  garden:      { name: 'vegetable garden', chance: 0.45, lean: 0, w: 3.0, d: 2.2, h: 0.25, tag: null, col: '#4e5a2e', bed: true },
  burn_barrel: { name: 'burn barrel', chance: 0.4, lean: -0.3, w: 0.7, d: 0.7, h: 0.9, tag: 'bl-barrel', col: '#5a4434' },
  car_blocks:  { name: 'car on blocks', chance: 0.22, lean: -0.4, w: 4.2, d: 1.9, h: 1.3, tag: 'bl-carblocks', col: '#6a4a3a' },
};
// A detached garage on the alley (its roll-up bay opens onto the lane): the chance a yard home gets one, the yard depth
// it needs, and the clear gap kept to its lot lines (a way round it).
export const GARAGE = { chance: 0.35, needYard: 15, side: 1.8, kind: 'garage' };

// DOCKS: commercial and industrial lots get a loading dock on the alley: a back roll-up bay (bay: [width, height]) with a
// raised platform beside it (dock: [length, depth, height], concrete, bumpers), an apron, pallets; kinds: who gets one.
export const DOCKS = {
  kinds: ['shop', 'saloon', 'diner', 'office', 'hotel', 'clinic', 'hospital', 'school', 'mill', 'courthouse', 'apartment'],
  bay: [3.2, 3.4], dock: [4.2, 2.4, 1.2], apron: 6, pallets: 2, minLen: 12,
};
// Alley props: dumpsters behind commercial lots, utility poles down the verge, bins behind homes.
export const ALLEY_PROPS = {
  dumpster: { name: 'dumpster', w: 2.0, d: 1.3, h: 1.4, tag: 'bl-dumpster', col: '#3e5a46' },
  pole:     { name: 'utility pole', w: 0.32, d: 0.32, h: 8.5, tag: 'bl-pole', col: '#5e4a36', cross: '#4a3a2a' },
  bin:      { name: 'trash bin', w: 0.7, d: 0.7, h: 1.1, tag: 'bl-bin', col: '#3a4a3e' },
};

// Every collision tag the back lots stand up (data/materials.js MATERIAL_RULES.tags must name each one).
export const BACKLOT_TAGS = [...new Set([...Object.values(FENCES).map((f) => f.tag), ...Object.values(YARD_PROPS).map((p) => p.tag).filter(Boolean), ...Object.values(ALLEY_PROPS).map((p) => p.tag), 'bl-dock', 'bl-gatepost'])];

const hueOf = (hex) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 0.04) return -1; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
const purple = (hex) => { const h = hueOf(hex); return h >= 270 && h <= 320; };

// The World Forge's check (and the selftest's): every row whole, in range, no purple, every tag ruled.
// rows: { ALLEYS, FENCES, FENCE_PICK, LOCKS, KIND_CLASS, YARD, YARD_PROPS, GARAGE, DOCKS, ALLEY_PROPS, NOISE, ALLEY_PLAN }; rules: MATERIAL_RULES.tags
export function validateBacklots(rows = { ALLEYS, ALLEY_PLAN, FENCES, FENCE_PICK, GATES, LOCKS, KIND_CLASS, NOISE, YARD, YARD_PROPS, GARAGE, DOCKS, ALLEY_PROPS }, rules = null, kinds = null) {
  const bad = [], cols = [];
  const R = rows;
  for (const [id, a] of Object.entries(R.ALLEYS)) {
    if (!(a.w >= 4.5)) bad.push(`alley ${id}: a car needs 4.5 m (w ${a.w})`);
    if (!(a.verge >= 0.8)) bad.push(`alley ${id}: verge under 0.8 m`);
    if (!(a.grip > 0.5 && a.grip <= 1)) bad.push(`alley ${id}: grip out of 0.5..1`);
    cols.push(a.color, a.edge);
  }
  const zones = new Set(Object.values(R.ALLEYS).flatMap((a) => a.zones));
  for (const z of ['core', 'commercial', 'res', 'farm', 'industrial', 'civic']) if (!zones.has(z)) bad.push(`no alley row for zone ${z}`);
  const grow = R.ALLEY_PLAN.grow, widest = Math.max(...Object.values(R.ALLEYS).map((a) => a.w + 2 * a.verge));
  if (grow < widest - 0.01) bad.push(`ALLEY_PLAN.grow ${grow} < the widest alley corridor ${widest}`);
  for (const [id, f] of Object.entries(R.FENCES)) {
    if (!(f.h >= 0.9 && f.h <= 2.6)) bad.push(`fence ${id}: h out of 0.9..2.6`);
    if (!(f.climb > 0)) bad.push(`fence ${id}: climb must take time`);
    if (!(f.kicks >= 0) || (f.kicks > 0 && !(f.breakNoise > 0))) bad.push(`fence ${id}: a fence that breaks must be heard`);
    if (!f.tag) bad.push(`fence ${id}: no tag`);
    cols.push(f.color, f.postColor);
  }
  for (const p of R.FENCE_PICK) for (const k of ['poor', 'mid', 'rich']) if (!R.FENCES[p[k]]) bad.push(`FENCE_PICK ${p.biomes[0]}: no fence "${p[k]}"`);
  if (!R.FENCE_PICK.some((p) => p.biomes.includes('*'))) bad.push('FENCE_PICK: no catch-all row');
  for (const [id, L] of Object.entries(R.LOCKS)) for (const k of ['holding', 'retaken', 'overrun', 'gate']) if (!(L[k] >= 0 && L[k] <= 1)) bad.push(`lock ${id}.${k} out of 0..1`);
  for (const [k, c] of Object.entries(R.KIND_CLASS)) if (!R.LOCKS[c]) bad.push(`kind ${k}: no lock class ${c}`);
  if (kinds) for (const k of kinds) if (!R.KIND_CLASS[k]) bad.push(`building kind ${k} has no lock class`);
  if (!(R.YARD.spacing[0] >= 4)) bad.push('YARD.spacing: under 4 m a side yard has no room to walk');
  if (!(R.YARD.walk >= 1.6)) bad.push('YARD.walk: the way round the house needs 1.6 m');
  for (const [id, p] of Object.entries({ ...R.YARD_PROPS, ...R.ALLEY_PROPS })) {
    if (!(p.w > 0 && p.d > 0 && p.h > 0)) bad.push(`prop ${id}: size`);
    cols.push(p.col); if (p.roof) cols.push(p.roof); if (p.cross) cols.push(p.cross);
    if (p.chance !== undefined && !(p.chance >= 0 && p.chance <= 1)) bad.push(`prop ${id}: chance`);
  }
  if (!(R.DOCKS.dock[2] > 0.95)) bad.push('DOCKS.dock: a platform you can step onto is not a dock');
  if (!(R.NOISE.gateKick > R.NOISE.gatePry && R.NOISE.gatePry > R.NOISE.gatePick)) bad.push('NOISE: kick > pry > pick');
  for (const c of cols) if (purple(c)) bad.push(`purple ${c}`);
  if (rules) for (const t of BACKLOT_TAGS) if (!rules[t]) bad.push(`tag ${t}: no MATERIAL_RULES rule`);
  return { ok: !bad.length, bad, alleys: Object.keys(R.ALLEYS).length, fences: Object.keys(R.FENCES).length, props: Object.keys(R.YARD_PROPS).length, tags: BACKLOT_TAGS.length };
}
