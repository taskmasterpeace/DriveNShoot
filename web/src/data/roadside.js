// THE ROADSIDE as rows (docs/design/WEB_ROADSIDE.md): rung 3 of the content ladder ("then human-made stuff",
// WEB_WORLD_EDITOR_PLAN §3.3). Power lines and their pylons, billboards, gas stations, junkyards, farm belts and one dam.
// world/roadside.js lays them out (a pure function of these rows, the seed and the roads under them); systems/roadside.js
// runs what you can DO there: siphon a station's underground tank with a hose, strip a hulk for scrap, buy fuel and water
// from a holdout, turn the dam's gate wheel. Everything here is a row the World Forge's MAP and SITE tabs can edit; the
// validator at the bottom is the one the forge and the selftest both run.
//
// Where a row stands (an `anchor`), in whatever the map knows, so it follows the road when the road is re-laid:
//   { rib: '<ribbon id>', along, side, set }  `along` metres down a road ribbon (an exit's access road is '<exit id> access'),
//                                             on the traveller's right (side 1) or left (-1), `set` metres off its centre
//   { exit: '<exit id>', along, side, set }   the same down that exit's access road (a dead exit: on along its cross road)
//   { road: 'I-10', mile | s, u }              a point on an interstate: arc length (game miles or metres), `u` metres off
//                                             its centreline (+u is the right of travel in +s: south of I-10, east of I-95)
// Nothing here may reach a pinned P1 chunk (data/golden.json p1Chunks) or the island: the validator says so by name.
// Never purple (hue 270-320). Our own words and our own adverts only: no real brands (tools/ip-lint.mjs).

// ---- the knobs ------------------------------------------------------------------------------------------------------
export const ROADSIDE_RULES = {
  // A lattice transmission tower and the conductors it carries (metres). span: between towers along a line; sag: the
  // conductor's lowest point below its ends, as a share of the span; segs: straight pieces drawn per conductor per span.
  pylon: { h: 22, base: 4.2, arm: 6.4, armY: [17.5, 21], span: 112, slide: 48, clear: 9 },
  wire: { segs: 4, sag: 0.05, thick: 0.08, droop: 0.6 },
  // A fallen tower: lying on its side across whatever it hit, crumpled near its foot. Solid to people and cars.
  fallen: { h: 1.7, w: 3.2 },
  // A billboard: w x h face up on legs, set `off` metres beyond the outer shoulder, tilted back toward the camera as the
  // road signs are. keepExit: no billboard this close to an interchange's centre (its ramps run ~520 m).
  billboard: { w: 12, h: 4.2, lift: 4.6, off: 42, keepExit: 640 },
  // Gas stations. tank: litres left in a looted station's underground tank (the dregs below the old pump intake); a
  // holdout's is kept full and sold. sell: scrip a litre at a holdout's counter by the standing tier (data/trade.js tiers).
  station: { tank: [14, 34], holdoutTank: [360, 520], forecourt: 15, sell: { litres: 20, price: 1.6 }, water: { litres: 2, price: 3 }, hose: 15 },
  // A hulk in a junkyard: how many pieces of scrap it strips into, the game hours a piece takes with a wrench or a pry
  // bar (by hand, never), and how close you must stand. noise: metres a piece of work is heard (the infected come to it).
  hulk: { scrap: [3, 6], hoursPer: 0.25, reach: 3.4, noise: 18 },
  // People who keep a place (a station's holdout, a junkyard's squatters, the dam's sluice keepers): made real within
  // promoteR of you, back onto their record past demoteR (as the ring's households are).
  keeper: { promoteR: 170, demoteR: 260 },
  // Farm belts: field depth (m off the road), the gap between fields, crop row pitch by crop (m), row segment length (a
  // long row is cut into pieces no longer than this, so a chunk's hot bounds hold it).
  farm: { depth: [110, 170], gap: 9, seg: 40, setback: 14 },
  // Water a place gives: a farm's stock tank (a windmill pumps `perDay` litres a game day into it, up to `cap`), the
  // dam's cistern (filled only while its gates are open). E at the tank fills your water containers from it.
  tank: { windmill: { cap: 60, perDay: 24 }, cistern: { cap: 400, perDay: 600 } },
  // The dam (one authored site). crest: its height (m); grade: the approach ramps; halfW: the crest road's half-width.
  dam: { crest: 9, grade: 0.06, halfW: 4.2, parapet: 0.9 },
};

// Crops by what grows where (biome state rows). colour: the rows from above; h: row height; pitch: metres between rows;
// soil: a worked field's tilled ground between the rows; fallow: a field nobody works any more (its ground), stub: its
// rows of dead stalks. Darker than the desert on purpose: a field reads from the widest zoom.
export const CROPS = {
  cotton:    { name: 'COTTON', row: '#3e5626', top: '#e6e0cc', h: 0.85, w: 0.6, pitch: 1.0, soil: '#5e4630', fallow: '#7a6242', stub: '#8e7a52' },
  alfalfa:   { name: 'ALFALFA', row: '#3c6a20', top: null, h: 0.42, w: 0.9, pitch: 1.0, soil: '#4e3e2a', fallow: '#76603e', stub: '#8a7a4e' },
  pecan:     { name: 'PECANS', tree: 'liveoak', treeH: [6.5, 9], pitch: 9, soil: '#5a4630', fallow: '#6e5a3e' },
  sugarcane: { name: 'SUGARCANE', row: '#3e6a22', top: '#6e8e30', h: 2.6, w: 1.0, pitch: 1.6, soil: '#3a3222', fallow: '#5a5a32', stub: '#6e6a3a' },
  citrus:    { name: 'CITRUS', tree: 'citrus', treeH: [2.6, 3.6], pitch: 6, soil: '#4e4030', fallow: '#5e5438' },
};

// ---- power lines ----------------------------------------------------------------------------------------------------
// A line is a route of (s, u) points along an interstate: towers every `span` metres along it, three conductors from
// tower to tower. `down`: towers fallen (index along the line, or the one nearest `s`), toward `fall` ('road': across
// the carriageway it stands beside). `from`/`to`: what the line ties (a substation row id, the dam).
export const POWER_LINES = [
  {
    id: 'colorado_tie', name: 'THE COLORADO TIE', road: 'I-10', from: 'palo_verde', to: 'phx_west_sub',
    // From the dam's switchyard north of the road, in toward I-10 east of the state line, along its north side to Phoenix.
    // At mile 11 the line jogs close to the road round a wash, and there one tower is down across the westbound lanes.
    route: [[8180, -560], [9500, -600], [10300, -160], [10900, -110], [17300, -110], [17520, -52], [17660, -31], [17800, -52], [18020, -110], [39420, -110], [39560, -150]],
    down: [{ s: 17660, u: -29, fall: 'road' }], // (u: where it stood; it lies 22 m toward the road, over the shoulder and the outer westbound lane)
  },
  {
    id: 'paso_tie', name: 'THE PASO TIE', road: 'I-10', from: 'paso_sub', to: 'palmas_post',
    // El Paso's west edge out to the Las Palmas strip, south of the road (the old valley line).
    route: [[81250, 150], [79000, 120], [77400, 130], [77050, 210]],
    down: [],
  },
];

// ---- billboards -----------------------------------------------------------------------------------------------------
// kind 'exit': the next exit ahead in the direction of travel and its real distance in game miles (worked out from the
// map, never typed: the selftest checks it). kind 'advert': a pre-war advert of our own (ADVERTS). kind 'warning' and
// 'toll': a faction's paint over whatever was there (lines are theirs). dir: the traffic it faces (I-10 E|W, I-95/I-75
// N|S). cond: 'faded' | 'shot' | 'repainted' | 'peeled'.
export const BILLBOARDS = [
  { id: 'i10e_m12', road: 'I-10', mile: 12.4, dir: 'E', kind: 'exit', cond: 'faded', art: 'fuel' },
  { id: 'i10e_m7', road: 'I-10', mile: 7.4, dir: 'E', kind: 'toll', cond: 'repainted', lines: ['THE SLUICE', 'DAM ROAD TOLL 10 SCRIP', 'WATER SOLD · NO GUNS ON THE CREST'] },
  { id: 'i10w_m6', road: 'I-10', mile: 6.6, dir: 'W', kind: 'advert', ad: 'river_lots', cond: 'peeled' },
  { id: 'i10w_m19', road: 'I-10', mile: 19.6, dir: 'W', kind: 'exit', cond: 'shot', art: 'fuel' },
  { id: 'i10e_m17', road: 'I-10', mile: 17.2, dir: 'E', kind: 'advert', ad: 'motor_court', cond: 'faded' },
  { id: 'i10w_m22', road: 'I-10', mile: 22.4, dir: 'W', kind: 'advert', ad: 'jerky', cond: 'shot' },
  { id: 'i10e_m29', road: 'I-10', mile: 29.3, dir: 'E', kind: 'exit', cond: 'faded', art: 'none' },
  { id: 'i10w_m35', road: 'I-10', mile: 35.0, dir: 'W', kind: 'warning', cond: 'repainted', lines: ['TURN BACK', 'SAND TRAP IS DEAD', 'NOTHING OFF THIS EXIT BUT WOLVES'] },
  { id: 'i10e_m36', road: 'I-10', mile: 36.2, dir: 'E', kind: 'advert', ad: 'casino', cond: 'faded' },
  { id: 'i10e_m44', road: 'I-10', mile: 44.4, dir: 'E', kind: 'exit', cond: 'shot', art: 'trade' },
  { id: 'i10w_m50', road: 'I-10', mile: 50.4, dir: 'W', kind: 'exit', cond: 'faded', art: 'trade' },
  { id: 'i95n_m6', road: 'I-95', mile: 6.6, dir: 'N', kind: 'exit', cond: 'faded', art: 'town' },
  { id: 'i95n_m11', road: 'I-95', mile: 11.6, dir: 'N', kind: 'exit', cond: 'shot', art: 'trade' },
  { id: 'i95s_m12', road: 'I-95', mile: 12.2, dir: 'S', kind: 'exit', cond: 'faded', art: 'town' },
  { id: 'i95n_m17', road: 'I-95', mile: 16.8, dir: 'N', kind: 'warning', cond: 'repainted', lines: ['TITUSVILLE IS GONE', 'KEEP DRIVING', 'THE WATER TAKES CARS'] },
  { id: 'i95s_m22', road: 'I-95', mile: 21.6, dir: 'S', kind: 'advert', ad: 'gator_farm', cond: 'peeled' },
  { id: 'i75w_m15', road: 'I-75', mile: 15.4, dir: 'N', kind: 'advert', ad: 'orange_stand', cond: 'faded' },
  { id: 'i75e_m9', road: 'I-75', mile: 9.2, dir: 'S', kind: 'exit', cond: 'shot', art: 'fuel' },
];
// Pre-war adverts, ours: what they sold, in their own words. Colours are the board's paint (never purple).
export const ADVERTS = {
  motor_court:  { lines: ['SUNDOWN MOTOR COURT', 'COOL ROOMS · POOL · COLOR TV', 'NEXT EXIT'], bg: '#c9b06a', fg: '#7a2a1a', band: '#2f6a6a' },
  jerky:        { lines: ['BIG RAWHIDE JERKY', 'HAND CUT · PEPPER CURED', '40 MILES'], bg: '#8a2e1c', fg: '#f0e2c0', band: '#d8a43a' },
  casino:       { lines: ['THE LUCKY SPUR', 'SLOTS · STEAKS · STARS', 'OPEN ALL NIGHT'], bg: '#1f3f4a', fg: '#e8c86a', band: '#b8442a' },
  river_lots:   { lines: ['RIVER BEND ESTATES', 'LOTS FROM 499 DOWN', 'WATER RIGHTS INCLUDED'], bg: '#d8cfb2', fg: '#2a4a5a', band: '#5a8a3a' },
  gator_farm:   { lines: ['GATORLAND JUNCTION', 'SEE THEM FED · HOURLY', 'KIDS FREE'], bg: '#3a6a3a', fg: '#f2e6c4', band: '#d88a2a' },
  orange_stand: { lines: ['FRESH SQUEEZED', 'ORANGE JUICE · 25 CENTS', 'ALL YOU CAN DRINK'], bg: '#e8a23a', fg: '#2a3a1a', band: '#4a7a2a' },
};

// ---- sites ----------------------------------------------------------------------------------------------------------
// kind station: a canopy fuel stop (a walk-in kiosk from the floor-plan generator: ring.js KINDS.gas), its pump islands,
// the underground tank's fill caps (siphon point) and vent pipe, a price pole. state 'looted' (dregs in the tank) or
// 'holdout' (a keeper sells fuel and water; KEEPERS row). kind junkyard: a fenced lot of hulks in rows (scrap), a crane,
// a walk-in office (ring.js KINDS.shop), and a guard dog or squatters. kind farm: a belt of fields both sides of a road
// (CROPS), a farmstead (walk-in farmhouse, a pole barn, a silo, a windmill over a stock tank), a lined canal along the back.
// kind substation: a fenced yard of transformers and gantries where a line ends. kind dam: THE dam (one authored site).
export const SITES = [
  // EXIT 2 FURNACE MILE 9: a looted station, the boneyard across the road, cotton and alfalfa on to the community.
  { id: 'furnace_fuel', kind: 'station', name: 'FURNACE MILE 9 FUEL', anchor: { exit: 'I-10_X1', along: 80, side: 1, set: 26 }, state: 'looted', brand: 'DESERT STAR' },
  { id: 'furnace_boneyard', kind: 'junkyard', name: 'FURNACE BONEYARD', anchor: { exit: 'I-10_X1', along: 110, side: -1, set: 22 }, w: 64, d: 52, rows: 7, crane: true, guard: { dog: 'rottweiler', name: 'Rivet' } },
  { id: 'furnace_fields', kind: 'farm', name: 'FURNACE FIELDS', anchor: { exit: 'I-10_X1', along: 200, side: 1, set: 0 }, len: 1100, crops: ['cotton', 'alfalfa', 'cotton'], worked: 0.45, keptR: 420, stead: { along: 420, side: -1 }, canal: 'dry', water: 'windmill' },
  // The dam on the Colorado and the fields below it, watered off its canal while the gates are open.
  { id: 'palo_verde', kind: 'dam', name: 'PALO VERDE DAM', holdout: 'THE SLUICE', river: 'COLORADO', anchor: { road: 'I-10', s: 8200, u: -650 }, len: 220, from: { s: 8420 }, keepers: 'sluice' },
  { id: 'river_fields', kind: 'farm', name: 'RIVER BEND FIELDS', anchor: { rib: 'palo_verde road', along: 40, side: 1, set: 0 }, len: 300, crops: ['alfalfa', 'alfalfa'], worked: 0.8, sides: [1], stead: null, canal: 'dam', water: 'cistern' },
  // Phoenix's west substation, where the Colorado tie comes in at the edge of the dead city.
  { id: 'phx_west_sub', kind: 'substation', name: 'WEST VALLEY SUBSTATION', anchor: { road: 'I-10', s: 39640, u: -196 }, w: 46, d: 34 },
  // EXIT 4 THE SAND TRAP is dead: nothing built off it. EXIT 6 LAS PALMAS: a station a holdout still keeps.
  { id: 'palmas_post', kind: 'station', name: 'LAS PALMAS TRADING POST', anchor: { exit: 'I-10_X3', along: 120, side: -1, set: 26 }, state: 'holdout', keepers: 'palmas', brand: 'GOLD COAST' },
  { id: 'paso_sub', kind: 'substation', name: 'MESILLA SUBSTATION', anchor: { road: 'I-10', s: 81300, u: 196 }, w: 40, d: 30 },
  { id: 'paso_orchards', kind: 'farm', name: 'MESILLA PECANS', anchor: { exit: 'I-10_X3', along: 480, side: 1, set: 0 }, len: 700, crops: ['pecan', 'cotton'], worked: 0.3, sides: [1, -1], stead: { along: 300, side: 1 }, canal: 'dry', water: 'windmill' },
  // Florida (the start region): a holdout's trading post at Sebastian, a junkyard with squatters at the canal locks,
  // sugarcane along Alligator Alley's canal (real water: the region's own canal), a citrus belt inland of the coast road.
  { id: 'sebastian_post', kind: 'station', name: 'SEBASTIAN TRADING POST', anchor: { exit: 'FL-I-95-X14', along: 90, side: 1, set: 26 }, state: 'holdout', keepers: 'sebastian', brand: 'SUNSHINE' },
  { id: 'locks_junk', kind: 'junkyard', name: 'CANAL LOCKS SALVAGE', anchor: { exit: 'FL-I-95-X5', along: 120, side: 1, set: 44 }, w: 56, d: 48, rows: 4, crane: false, guard: { squatters: 'locks' } },
  { id: 'staug_fuel', kind: 'station', name: 'ST. AUGUSTINE FUEL', anchor: { exit: 'FL-I-95-X29', along: 120, side: -1, set: 26 }, state: 'looted', brand: 'SUNSHINE' },
  { id: 'alley_cane', kind: 'farm', name: 'ALLEY CANE', anchor: { road: 'I-75', s: 16400, u: 0 }, len: 1400, crops: ['sugarcane', 'sugarcane', 'sugarcane'], worked: 0.25, sides: [1], stead: { along: 700, side: 1 }, canal: 'region', water: 'windmill' },
  { id: 'indian_river_groves', kind: 'farm', name: 'INDIAN RIVER GROVES', anchor: { road: 'I-95', s: 19300, u: 0 }, len: 1100, crops: ['citrus', 'citrus'], worked: 0.5, sides: [1], stead: { along: 520, side: 1 }, canal: 'dry', water: 'windmill' },
];

// ---- the people who keep a place ------------------------------------------------------------------------------------
// Everybody's from somewhere: a real flag on each (ui/portrait.js FLAGS). job: 'fuel' sells fuel and water at the
// counter (dialogue in systems/roadside.js), 'squatter' lives in the boneyard, 'sluice' holds the dam's gate wheel.
// at: where they stand ('counter' just in from the kiosk's front door, 'forecourt', 'yard', 'crest', 'wheel').
export const KEEPERS = {
  palmas: [
    { id: 'palmas_keeper', name: 'Ofelia Barragan', title: 'Keeps the pumps · Las Palmas', flag: 'MX', job: 'fuel', at: 'counter', weapon: 'shotgun',
      portrait: { seed: 611, skin: '#9a6a44', hair: '#2a1e18', hat: 'cowboy', mood: 'neutral', shirt: '#7a4a2a', gear: 'bandolier' } },
    { id: 'palmas_guard', name: 'Teo Barragan', title: 'Watches the road · Las Palmas', flag: 'MX', job: 'guard', at: 'forecourt', weapon: 'smg',
      portrait: { seed: 612, skin: '#8a5a3a', hair: '#1a1410', hat: 'cap', mood: 'neutral', shirt: '#4a5a3a', gear: 'none' } },
  ],
  sebastian: [
    { id: 'sebastian_keeper', name: 'Darnell Pryce', title: 'Keeps the pumps · Sebastian', flag: 'JM', job: 'fuel', at: 'counter', weapon: 'pistol',
      portrait: { seed: 621, skin: '#4a2a18', hair: '#141010', hat: 'wrap', mood: 'smile', shirt: '#2f6a5a', gear: 'none' } },
  ],
  locks: [
    { id: 'locks_squat1', name: 'Wendell Haas', title: 'Squats the salvage yard', flag: 'US', job: 'squatter', at: 'yard', weapon: 'pistol',
      portrait: { seed: 631, skin: '#c8a07a', hair: '#6a5a4a', hat: 'long', mood: 'angry', shirt: '#5a5040', gear: 'scar' } },
    { id: 'locks_squat2', name: 'Rosalind Okafor', title: 'Squats the salvage yard', flag: 'NG', job: 'squatter', at: 'yard', weapon: null,
      portrait: { seed: 632, skin: '#5a3420', hair: '#141010', hat: 'wrap', mood: 'neutral', shirt: '#7a6a3a', gear: 'none' } },
  ],
  sluice: [
    { id: 'sluice_keeper', name: 'Hollis Redcloud', title: 'Holds the wheel · The Sluice', flag: 'US', job: 'sluice', at: 'wheel', weapon: 'rifle',
      portrait: { seed: 641, skin: '#8a5a3a', hair: '#1a1410', hat: 'cowboy', mood: 'neutral', shirt: '#3f5a62', gear: 'bandolier' } },
    { id: 'sluice_hand', name: 'Marta Lindqvist', title: 'Keeps the crest · The Sluice', flag: 'SE', job: 'guard', at: 'crest', weapon: 'smg',
      portrait: { seed: 642, skin: '#e0c0a0', hair: '#c8a060', hat: 'cap', mood: 'neutral', shirt: '#5a5a48', gear: 'goggles' } },
  ],
};

// ---- the validator (the forge's SITE and MAP tabs and the selftest run this) ----------------------------------------
// rows: { lines, billboards, sites } (these by default); W: a WorldIndex; built: world/roadside.js's laid-out result
// (optional: with it, the placed footprints are checked against the roads, the island and the pinned chunks).
// Returns { ok, errors: [..], warnings: [..] }: an error is a row that cannot stand; a warning is one that stands oddly.
export function validateRoadside(W, rows = { lines: POWER_LINES, billboards: BILLBOARDS, sites: SITES }, built = null, pinned = []) {
  const errors = [], warnings = [], ids = new Set();
  const corOf = (id) => (W.corridors ?? [W.i10]).find((c) => c.id === id) ?? null;
  const exitOf = (id) => W.exits.find((X) => X.id === id) ?? null;
  const ribOf = (id) => W.ribbons.find((r) => r.id === id) ?? null;
  const dupe = (id, what) => { if (!id) errors.push(`${what}: a row with no id`); else if (ids.has(id)) errors.push(`${what} ${id}: the id is used twice`); else ids.add(id); };
  const hexOk = (h) => typeof h !== 'string' || !/^#[0-9a-f]{6}$/i.test(h) || !isPurple(h);
  for (const L of rows.lines ?? []) {
    dupe(L.id, 'line');
    const cor = corOf(L.road);
    if (!cor) { errors.push(`line ${L.id}: road ${L.road} is not on the map`); continue; }
    if (!Array.isArray(L.route) || L.route.length < 2) errors.push(`line ${L.id}: a route needs two or more [s, u] points`);
    for (const [s] of L.route ?? []) if (!(s >= 0 && s <= cor.L)) errors.push(`line ${L.id}: s ${s} is off ${L.road} (0..${Math.round(cor.L)})`);
    for (const d of L.down ?? []) if (!(d.s >= Math.min(...L.route.map((p) => p[0])) && d.s <= Math.max(...L.route.map((p) => p[0])))) errors.push(`line ${L.id}: the fallen tower at s ${d.s} is not on its route`);
  }
  for (const B of rows.billboards ?? []) {
    dupe(B.id, 'billboard');
    const cor = corOf(B.road);
    if (!cor) { errors.push(`billboard ${B.id}: road ${B.road} is not on the map`); continue; }
    if (!['exit', 'advert', 'warning', 'toll'].includes(B.kind)) errors.push(`billboard ${B.id}: kind ${B.kind} is not exit|advert|warning|toll`);
    if (B.kind === 'advert' && !ADVERTS[B.ad]) errors.push(`billboard ${B.id}: advert ${B.ad} is not an ADVERTS row`);
    if ((B.kind === 'warning' || B.kind === 'toll') && !(B.lines?.length)) errors.push(`billboard ${B.id}: a ${B.kind} board needs its lines`);
    const s = (B.s ?? B.mile * 1609.344);
    if (!(s > 0 && s < cor.L)) errors.push(`billboard ${B.id}: mile ${B.mile} is off ${B.road}`);
    const near = cor.exits.find((X) => Math.abs(X.s - s) < ROADSIDE_RULES.billboard.keepExit);
    if (near) errors.push(`billboard ${B.id}: ${Math.round(Math.abs(near.s - s))} m from ${near.name}'s interchange (keep ${ROADSIDE_RULES.billboard.keepExit} m clear)`);
  }
  for (const S of rows.sites ?? []) {
    dupe(S.id, 'site');
    if (!['station', 'junkyard', 'farm', 'substation', 'dam'].includes(S.kind)) errors.push(`site ${S.id}: kind ${S.kind} is unknown`);
    const a = S.anchor ?? {};
    if (a.exit && !exitOf(a.exit)) errors.push(`site ${S.id}: exit ${a.exit} is not on the map`);
    if (a.rib && !ribOf(a.rib) && !(rows.sites ?? []).some((q) => `${q.id} road` === a.rib)) errors.push(`site ${S.id}: road ${a.rib} is not on the map`);
    if (a.road && !corOf(a.road)) errors.push(`site ${S.id}: road ${a.road} is not on the map`);
    if (!a.exit && !a.rib && !a.road) errors.push(`site ${S.id}: no anchor (exit, rib or road)`);
    if (S.kind === 'station' && !['looted', 'holdout'].includes(S.state)) errors.push(`site ${S.id}: state ${S.state} is not looted|holdout`);
    if (S.keepers && !KEEPERS[S.keepers]) errors.push(`site ${S.id}: keepers ${S.keepers} is not a KEEPERS row`);
    if (S.state === 'holdout' && !S.keepers) warnings.push(`site ${S.id}: a holdout station with nobody keeping it`);
    for (const c of S.crops ?? []) if (!CROPS[c]) errors.push(`site ${S.id}: crop ${c} is not a CROPS row`);
    if (S.guard?.dog === undefined && S.guard?.squatters && !KEEPERS[S.guard.squatters]) errors.push(`site ${S.id}: squatters ${S.guard.squatters} is not a KEEPERS row`);
  }
  for (const k of Object.values(KEEPERS)) for (const p of k) { if (!p.flag) errors.push(`keeper ${p.id}: no flag (everybody is from somewhere)`); if (!hexOk(p.portrait?.shirt)) errors.push(`keeper ${p.id}: a purple shirt`); }
  for (const [id, A] of Object.entries(ADVERTS)) for (const h of [A.bg, A.fg, A.band]) if (!hexOk(h)) errors.push(`advert ${id}: ${h} is purple`);
  // The laid-out result: every footprint clear of the island, the pinned chunks and every road it does not belong to.
  if (built) {
    const pin = new Set(pinned);
    for (const f of built.footprints) {
      if (Math.abs(f.x0) < 470 && Math.abs(f.z0) < 470 || Math.abs(f.x1) < 470 && Math.abs(f.z1) < 470) errors.push(`${f.id}: inside the island`);
      for (let cx = Math.floor(f.x0 / 256); cx <= Math.floor(f.x1 / 256); cx++) for (let cz = Math.floor(f.z0 / 256); cz <= Math.floor(f.z1 / 256); cz++) if (pin.has(`${cx},${cz}`)) errors.push(`${f.id}: reaches pinned P1 chunk ${cx},${cz} (data/golden.json)`);
      for (const r of f.roads ?? []) errors.push(`${f.id}: stands on ${r}`);
    }
    for (const w of built.warnings) warnings.push(w);
  }
  return { ok: !errors.length, errors, warnings };
}
// Hue of a #rrggbb colour in degrees, and whether it is in the banned band (270-320, saturated enough to read as purple).
export function isPurple(hex) {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.08) return false;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h >= 270 && h <= 320;
}
