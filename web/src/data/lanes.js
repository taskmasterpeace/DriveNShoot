// LANE COUNTS THAT DEPEND ON THINGS (docs/design/WEB_TOWNS_ROADS.md §6). A road's lanes are not one number per road: they
// come from its CLASS, the PEOPLE near it (a city widens it, the open country narrows it), the GROUND it is on (no added
// lane on a bridge or up a mountain grade) and its REGION. lanesFor() is the one pure rule; world/townroads.js lays it on
// the streamed roads (an added lane each way on an interstate through a city, one lane or two on a town's access road)
// and validateLanes() checks the rows and what the world built against the rule.
//
// Classes (base lanes, total both ways; divided ones count per side as base / 2):
//   interstate  4 (2 each way), widened to 6 near a city or a metro (a metro reaches further); 8 is not built yet (max 6)
//   us_highway  4 divided in town, 2 in the country (no streamed road yet: the rule is ready for the next state)
//   state       2, 4 inside a city's reach
//   county      2 (a paved county road, an exit's cross road, a town's access road)
//   dirt        1 (a track: a hamlet's lane, a ranch road)
export const LANE_CLASSES = {
  interstate: { base: 4, min: 4, max: 6, divided: true, rural: 4, label: 'Interstate' },
  us_highway: { base: 2, min: 2, max: 4, divided: true, rural: 2, label: 'US highway' },
  state: { base: 2, min: 2, max: 4, divided: false, rural: 2, label: 'State road' },
  county: { base: 2, min: 1, max: 2, divided: false, rural: 2, label: 'County road' },
  dirt: { base: 1, min: 1, max: 1, divided: false, rural: 1, label: 'Dirt track' },
};
// People: the nearest place's SIZE (what it was before: the living are too few to count by) and how far its edge is. The
// first band that matches (largest size first) adds its lanes (total; a divided road adds them split both ways).
//   size  metro > city > town > hamlet (LANE_SIZE ranks them; placeSize() reads a place)
//   km    within this many km of the road point            add   lanes added            to   only these classes
export const LANE_SIZE = { hamlet: 0, town: 1, city: 2, metro: 3 };
export const LANE_PLACE = [
  { id: 'metro', size: 'metro', km: 8, add: 2, to: ['interstate', 'us_highway', 'state'] },
  { id: 'city', size: 'city', km: 4, add: 2, to: ['interstate', 'us_highway', 'state'] },
  { id: 'town', size: 'town', km: 1.2, add: 0, to: ['county'] },     // a town keeps its county road at two lanes
  { id: 'hamlet', size: 'hamlet', km: 1.2, add: -1, to: ['county'] }, // a hamlet's own road is one lane
];
// A place's size: a usmap city, the Phoenix island and a major metro are metros; a planned town by its archetype's
// largest extent (sizeM) and people (pop); a SITE row by its footprint and society.pop.
export const LANE_SIZE_RULE = { cityM: 420, siteCityM: 450, hamletPop: 15 };
export function placeSize({ kind, major = false, sizeM = 0, footprintM = 0, popMax = 100 }) {
  if (kind === 'city' || kind === 'island' || major) return 'metro';
  if (kind === 'holdout') return 'town';
  if (popMax <= LANE_SIZE_RULE.hamletPop) return 'hamlet';
  if (sizeM >= LANE_SIZE_RULE.cityM || footprintM >= LANE_SIZE_RULE.siteCityM) return 'city';
  return 'town';
}
// Ground: added lanes are not built where the road is hard to widen. 'cap' clamps the total.
export const LANE_TERRAIN = {
  flat: { cap: null },
  bridge: { cap: 'base', why: 'no added lane on a bridge or its fills' },
  mountain: { cap: 'base', why: 'no added lane up a mountain grade' },
  swamp: { cap: 'base', why: 'the causeway is as wide as it is' },
};
// Region: a nudge on the base (not on the city's widening). Florida's interstates were six lanes through every city; the
// desert's run four for a hundred miles. Same base today: the row is here so a region can differ without code.
export const LANE_REGION = { desert: 0, florida: 0, plains: 0, forest: 0, swamp: 0, coast: 0 };
// Where the rule is laid on a corridor (world/townroads.js laneProfile): the sample step, the shortest run an added lane
// is built for (shorter is dropped: a lane that comes and goes every 300 m is a mess), and its taper at each end.
export const LANE_LAY = { step: 200, minRun: 1200, taper: 180, laneW: 3.6 };

// THE RULE. ctx: { cls, size (the nearest place's: placeSize), km (to its edge), terrain: 'flat'|'bridge'|'mountain'|'swamp', region }
// -> { lanes (total), perDir (divided: lanes/2, else lanes), why: [strings] }
export function lanesFor({ cls, size = 'hamlet', km = Infinity, terrain = 'flat', region = 'desert' }) {
  const C = LANE_CLASSES[cls];
  if (!C) return { lanes: 2, perDir: 1, why: [`unknown class ${cls}: 2`] };
  let n = C.rural + (LANE_REGION[region] ?? 0);
  const why = [`${C.label}: ${C.rural} in the open`];
  for (const B of LANE_PLACE) {
    if (!B.to.includes(cls) || km > B.km || LANE_SIZE[size] !== LANE_SIZE[B.size]) continue;
    if (B.add) { n += B.add; why.push(`${B.add > 0 ? '+' : ''}${B.add} (a ${B.id} ${km.toFixed(1)} km away)`); }
    break;
  }
  const T = LANE_TERRAIN[terrain] ?? LANE_TERRAIN.flat;
  if (T.cap === 'base' && n > C.base) { n = C.base; why.push(T.why); }
  n = Math.max(C.min, Math.min(C.max, n));
  if (C.divided && n % 2) n += 1;
  return { lanes: n, perDir: C.divided ? n / 2 : n, why };
}

export function validateLanes() {
  const errors = [];
  for (const [k, C] of Object.entries(LANE_CLASSES)) {
    if (!(C.min <= C.base && C.base <= C.max && C.min <= C.rural && C.rural <= C.max)) errors.push(`LANE_CLASSES.${k}: min <= base, rural <= max`);
    if (C.divided && (C.base % 2 || C.max % 2 || C.min % 2)) errors.push(`LANE_CLASSES.${k}: a divided road's counts are even`);
  }
  for (const B of LANE_PLACE) { for (const c of B.to) if (!LANE_CLASSES[c]) errors.push(`LANE_PLACE.${B.id}: unknown class ${c}`); if (LANE_SIZE[B.size] === undefined) errors.push(`LANE_PLACE.${B.id}: unknown size ${B.size}`); }
  for (const [k, T] of Object.entries(LANE_TERRAIN)) if (T.cap !== null && T.cap !== 'base') errors.push(`LANE_TERRAIN.${k}: cap is null or 'base'`);
  if (!(LANE_LAY.minRun > 2 * LANE_LAY.taper)) errors.push('LANE_LAY: minRun must be longer than both tapers');
  // the rule's own promises (the cases Robert asked for): wider near a city, narrower in the country, no wider on a bridge
  const t = (o) => lanesFor({ region: 'desert', ...o }).lanes;
  if (!(t({ cls: 'interstate', size: 'city', km: 1 }) > t({ cls: 'interstate' }))) errors.push('rule: an interstate is not wider near a city');
  if (!(t({ cls: 'interstate', size: 'metro', km: 6 }) > t({ cls: 'interstate', size: 'city', km: 6 }))) errors.push('rule: a metro does not reach further than a city');
  if (t({ cls: 'interstate', size: 'city', km: 1, terrain: 'bridge' }) !== t({ cls: 'interstate' })) errors.push('rule: an interstate widens on a bridge');
  if (t({ cls: 'interstate', size: 'city', km: 1, terrain: 'mountain' }) !== t({ cls: 'interstate' })) errors.push('rule: an interstate widens up a mountain');
  if (!(t({ cls: 'county', size: 'hamlet', km: 0.2 }) < t({ cls: 'county', size: 'town', km: 0.2 }))) errors.push("rule: a hamlet's road is not narrower than a town's");
  if (!(t({ cls: 'state', size: 'city', km: 1 }) > t({ cls: 'state' }))) errors.push('rule: a state road is not wider in a city');
  return { ok: !errors.length, errors };
}
