// THE FIFTY BASES (docs/design/WEB_BASES.md): one military installation per state from the atlas (data/atlas.js
// ATLAS_BASES, at the footprint rule), plus the installations a playable region needs that its state's atlas row is not
// (Florida's is Eglin, in the panhandle, outside the region box). Every base is a ROW: where it stands, how big, which
// SITE TEMPLATE lays it out (airfield, army post, naval station, missile field, depot, training range, research lab),
// who holds it (a Remnant garrison, a ruler's troops, raiders, the infected inside, nobody: abandoned and looted), its
// secret project and its way down (the underground system's hook). world/milbase.js lays a row out as a pure function
// of the data and the seed; systems/milbases.js runs its people, drones, alerts and lights.
//
// A row is BUILT (streamed, walk-in, garrisoned) when it stands inside a playable region (P1's dust-wall circle round
// Phoenix, the Florida box) and has a `build` block. Every other row is a row on the map (the World Forge MAP shows the
// atlas's fifty), ready to stream when its region comes: the same template lays it out the day it does.
//
// Our own words only (docs/design/WEB_FAN_SERVICE_BIBLE.md): real installations are real places, reimagined; nothing
// from the novels. No purple (hue 270-320 is banned).
import { ATLAS_BASES, ATLAS_XZ, RULERS, HOLDERS, footprint } from './atlas.js';

// ---- the site templates ------------------------------------------------------------------------------------------------
// min: the smallest fence side the template is built at (an airfield's runway needs room: the runway law, F3).
// canton: the built core inside the gate ([along the gate side, inward] metres, clamped to the fence). street: the
// programmes lined along the main street from the gate (data/ring.js KINDS, military zone), in order; apron: big sheds
// set along the apron facing the runway. features: what else the template lays out (world/milbase.js feature()).
// towerEvery: a watchtower along the wire every n metres (and at every corner and both sides of the gate).
// scatter: per 64 m cell of open ground inside the wire, [feature, chance] (the war's wreckage and the range's furniture).
export const MIL_TEMPLATES = {
  airfield: { name: 'AIRFIELD', min: 560, canton: [240, 150], towerEvery: 280,
    street: ['hq', 'barracks', 'armory', 'mess', 'barracks', 'motorpool'], apron: ['hangar', 'hangar', 'ctower'],
    features: ['runway', 'aircraft', 'fuelfarm', 'helipad'],
    scatter: [['crater', 0.05], ['hulk', 0.015], ['wreckplane', 0.01]] },
  army: { name: 'ARMY POST', min: 300, canton: [230, 170], towerEvery: 240,
    street: ['hq', 'barracks', 'armory', 'barracks', 'mess', 'stores', 'motorpool', 'barracks'], apron: [],
    features: ['parade', 'motoryard', 'fuelfarm', 'range'],
    scatter: [['crater', 0.05], ['hulk', 0.025], ['bunker', 0.012], ['trench', 0.02]] },
  naval: { name: 'NAVAL STATION', min: 240, canton: [200, 140], towerEvery: 220,
    street: ['hq', 'barracks', 'armory', 'stores', 'stores'], apron: [],
    features: ['piers', 'cranes', 'fuelfarm'],
    scatter: [['crater', 0.03], ['hulk', 0.01]] },
  missile: { name: 'MISSILE FIELD', min: 400, canton: [210, 150], towerEvery: 300,
    street: ['hq', 'barracks', 'armory', 'lab', 'mess', 'motorpool'], apron: [],
    features: ['silos', 'gantry', 'blockhouse'],
    scatter: [['crater', 0.04], ['silo', 0.006], ['bunker', 0.01], ['target', 0.012]] },
  depot: { name: 'DEPOT', min: 300, canton: [220, 160], towerEvery: 240,
    street: ['hq', 'barracks', 'armory', 'stores', 'stores', 'motorpool'], apron: [],
    features: ['igloos', 'fuelfarm'],
    scatter: [['crater', 0.03], ['igloo', 0.02], ['hulk', 0.01]] },
  range: { name: 'TRAINING RANGE', min: 600, canton: [230, 170], towerEvery: 320,
    street: ['hq', 'barracks', 'armory', 'mess', 'barracks', 'motorpool', 'stores'], apron: [],
    features: ['mocktown', 'range', 'fuelfarm'],
    scatter: [['crater', 0.06], ['hulk', 0.03], ['target', 0.02], ['bunker', 0.01], ['trench', 0.02]] },
  lab: { name: 'RESEARCH LAB', min: 400, canton: [220, 160], towerEvery: 260,
    street: ['hq', 'lab', 'barracks', 'armory', 'lab', 'stores'], apron: [],
    features: ['launchpad', 'domes', 'antennas'],
    scatter: [['crater', 0.03], ['hulk', 0.01], ['bunker', 0.008]] },
};
// The atlas's kind -> a template (a row's build block may name another: Irwin is a training range, White Sands a missile field).
export const KIND_TEMPLATE = { air: 'airfield', army: 'army', navy: 'naval', depot: 'depot', guard: 'range', space: 'lab' };

// ---- who holds a base, and what that means on the ground ---------------------------------------------------------------
// faction: the society faction its people answer to (registered by systems/milbases.js when it is not built in; a
// `ruler` holder's id is per state). arche: the AI archetype (data/society.js: 'soldier' keeps posts and goes by its
// faction's relations). look: the outfit. guns: what the garrison carries. ruin: the share of its buildings left as
// ruined shells. loot: what its containers roll (null: each its own table; 'wreck': picked over). gate: how the gate is
// dressed. garrison: the post's head count (posts first, then patrols). infected: the dead inside (an overrun base).
export const MIL_HOLDS = {
  remnant: { name: 'The Federal Remnant', faction: 'remnant', arche: 'soldier', look: 'soldier', guns: { rifle: 0.8, smg: 0.2 }, ruin: 0, loot: null, gate: 'boom', garrison: 14, flag: 'US' },
  ruler: { name: 'the state\'s ruler', faction: 'ruler', arche: 'soldier', look: 'warden', guns: { rifle: 0.5, smg: 0.3, shotgun: 0.2 }, ruin: 0.1, loot: null, gate: 'cars', garrison: 12, banner: true },
  raider: { name: 'raiders', faction: 'crimson_road', arche: 'soldier', look: 'raider', guns: { smg: 0.5, shotgun: 0.3, rifle: 0.2 }, ruin: 0.2, loot: null, gate: 'cars', garrison: 12, banner: true },
  overrun: { name: 'the infected', faction: 'infected', arche: null, ruin: 0.3, loot: null, gate: 'down', garrison: 0, infected: 14 },
  abandoned: { name: 'nobody', faction: null, arche: null, ruin: 0.5, loot: 'wreck', gate: 'down', garrison: 0 },
  automated: { name: 'the continuity network', faction: null, arche: null, ruin: 0, loot: null, gate: 'shut', garrison: 0 },
  contested: { name: 'contested', faction: 'remnant', arche: 'soldier', look: 'soldier', guns: { rifle: 0.7, smg: 0.3 }, ruin: 0.25, loot: null, gate: 'boom', garrison: 10 },
};
// The factions a built base brings in (systems/milbases.js registers them; colours are never purple).
export const MIL_FACTIONS = {
  crimson_road: { name: 'The Crimson Road', archetype: 'raiders', color: '#8a2e22', start: -60, relations: { remnant: -100, infected: -100, rusthaven: -60, drifters: -40 } },
  ruler_AZ: { name: 'The Sun Court', archetype: 'military', color: '#c9902e', start: -5, relations: { remnant: -40, infected: -100, crimson_road: -100, rusthaven: -10 } },
  ruler_NM: { name: 'The Atomic Priesthood', archetype: 'military', color: '#b8a14a', start: -10, relations: { remnant: -60, infected: -100, crimson_road: -100 } },
  ruler_TX: { name: 'The Republic', archetype: 'military', color: '#9a5a3a', start: -5, relations: { remnant: -30, infected: -100, crimson_road: -100 } },
  ruler_FL: { name: 'The Swamp Kingdoms', archetype: 'military', color: '#5e7a42', start: -10, relations: { remnant: -50, infected: -100, crimson_road: -100 } },
};

// ---- the extra rows (installations a playable region needs that are not its state's atlas row) -------------------------
// lat/lon is the real place; `area_km2` its real footprint (the footprint rule makes the fence). Placed by `build.anchor`
// (a corridor, a mile, a side and an offset, as an exit's community is) or `build.at` (world metres).
const X = (state, id, name, lat, lon, area_km2, areaSrc, kind, dsoa, holder, what) => ({ state, id, name, lat, lon, area_km2, areaSrc, kind, dsoa, holder, what, extra: true });
export const MIL_EXTRAS = [
  X('FL', 'patrick', 'Patrick Space Force Base', 28.2350, -80.6100, 9.47, 'other', 'air', 'remnant', 'remnant',
    'The Remnant\'s Atlantic airfield on the lagoon bank: one runway kept swept, a drone up every night.'),
  X('FL', 'canaveral', 'Cape Canaveral Space Force Station', 28.4880, -80.5770, 63.9, 'other', 'space', 'overrun', 'infected',
    'The launch complex. The crews never left; the countdown clock in the blockhouse still runs.'),
  X('FL', 'homestead', 'Homestead Air Reserve Base', 25.4880, -80.3840, 11.8, 'other', 'air', 'abandoned', 'none',
    'South of Miami. Storms flattened it twice; scavengers took the rest.'),
  X('TX', 'fort_bliss', 'Fort Bliss', 31.8120, -106.4210, 4550, 'other', 'army', 'ruler', 'ruler',
    'The Republic\'s western post above El Paso, its ranges running north into the desert.'),
  X('AZ', 'iron_railhead', 'The Iron Line Railhead', 33.47, -112.08, 25, 'ours', 'depot', 'remnant', 'remnant',
    'Our own: the Remnant\'s depot where the Iron Line runs out north of Phoenix; sealed cars wait in a locked yard.'),
];

// ---- the built rows: everything a playable base adds to its atlas row -----------------------------------------------------
// template: overrides the kind's. hold: overrides the atlas's dsoa. anchor: { road, mile, side (+1 east of a north-running
// interstate), off } | at: [x, z] world metres; extend: where the square hangs from its anchor (the anchor is the main post,
// the range runs on that way). approachMax: how far the gate may stand from the interstate's centreline (the scale law
// slides it in, F4); road: { to: [x, z] } an access road to a point instead of the interstate. drones: patrol drones.
// project: the secret project (one line, logs found in its records). down: the underground entrance hook (kind lift |
// hatch, levels: how deep the underground system may build).
export const MIL_BUILT = {
  patrick: { region: 'florida', template: 'airfield', hold: 'remnant', anchor: { road: 'I-95', mile: 16, side: 1, off: 1150 }, approachMax: 1300, drones: 1,
    vehicles: [['patrol', '#5c6142'], ['apc', '#6a6448']],
    project: { name: 'PROJECT LONG SHORE', line: 'Every night the drone flies the barrier island with its lamp lit; every night something out there flashes back.',
      logs: ['Night log 112: drone lamp on at 0200 over the inlet. Three long, two short from the dunes. Same as last night.',
        'Night log 140: sent a squad across the lagoon at dawn. Footprints to the waterline and none back. Squad returned. Do not send another.',
        'Night log 151: Captain orders the lamp kept on. Whatever answers has started answering first.'] },
    down: { kind: 'hatch', at: 'hq', levels: 2 } },
  canaveral: { region: 'florida', template: 'lab', hold: 'overrun', anchor: { road: 'I-95', mile: 21, side: 1, off: 1700 }, approachMax: 1500, drones: 1, droneHold: 'automated',
    project: { name: 'PROJECT SECOND SUNRISE', line: 'A rocket stands fuelled under its tarps on the pad; the blockhouse clock has counted down for a hundred years and is nearly there.',
      logs: ['T-minus log, shift 4: hold released. Payload is the relay, not a weapon. Tell the families that.',
        'T-minus log, shift 9: half the crew sick. The sick ones keep walking back to their stations. They still know the checklist.',
        'T-minus log, last: we locked the lift and left the clock running. If you can read this, the clock is still running.'] },
    down: { kind: 'lift', at: 'lab', levels: 3 } },
  homestead: { region: 'florida', template: 'airfield', hold: 'abandoned', at: [212950, 71500], approachMax: 4000, road: { to: [214300, 69050] }, drones: 0,
    project: { name: 'PROJECT WINDBREAK', line: 'They tried to steer the storms away from Miami with rockets of salt; the third storm came anyway and took the base.',
      logs: ['Seeding run 6: two cells broke up east of the keys. Command calls it proof.',
        'Seeding run 9: the cell we hit went north instead of out to sea. Miami took it.',
        'No more runs. Evacuate to the north field. Leave the canisters.'] },
    down: { kind: 'hatch', at: 'hq', levels: 1 } },
  davis_monthan: { region: 'arizona', template: 'airfield', approachMax: 1500, drones: 1,
    vehicles: [['patrol', '#8a6a3a']],
    project: { name: 'PROJECT LAST WING', line: 'Out of four thousand dead aircraft in the boneyard, the Sun Court is building one that flies.',
      logs: ['Parts list 30: two engines that turn over. One wing spar without a crack. We are close.',
        'Parts list 41: the pilot is ninety and blind in one eye. He says he only needs the one.',
        'Parts list 52: taxi test tonight. If it lifts, the Court flies it over Phoenix at dawn so they all see.'] },
    down: { kind: 'hatch', at: 'hq', levels: 2 } },
  iron_railhead: { region: 'arizona', template: 'army', hold: 'remnant', at: [-300, -2240], approachMax: 9e9, road: { to: [-240, -1540] }, drones: 1, rail: true, side: 380,
    vehicles: [['patrol', '#5c6142'], ['apc', '#6a6448']],
    project: { name: 'PROJECT IRON MULE', line: 'Sealed cars move north on the Iron Line by night under a manifest that says cold medical stock and nothing else.',
      logs: ['Manifest 7: four cars, sealed, cold. Escort rides on top. Do not open for inspection by anyone.',
        'Manifest 12: car 3 was warm at the stop. Something moved against the door. Escort put two rounds through the seal and it stopped.',
        'Manifest 19: orders to hold the cars in the yard until the line north is clear. The yard gate stays locked.'] },
    down: { kind: 'hatch', at: 'armory', levels: 2 } },
  fort_irwin: { region: 'arizona', template: 'range', approachMax: 1300, drones: 0,
    vehicles: [['buggy', '#7a2a1c'], ['patrol', '#6a3a22']],
    project: { name: 'PROJECT MIRROR TOWN', line: 'The mock town was built to match a real one street for street; the Crimson Road found the plans that say which one.',
      logs: ['Survey 3: every door, every window, the water tower on the right. Built to scale.',
        'Survey 8: the drills ran the street fight both ways for a month. Then the order came to stop and burn the plans.',
        'Survey 11 (in a raider\'s hand): plans not all burnt. It\'s a town on the river, two days east. We know the way in now.'] },
    down: { kind: 'hatch', at: 'hq', levels: 1 } },
  white_sands: { region: 'arizona', template: 'missile', extend: 'W', approachMax: 3200, drones: 1,
    vehicles: [['patrol', '#b8a14a']],
    project: { name: 'PROJECT GLASSWORK', line: 'Under the range the Priesthood keeps a test chamber where the sand turned to glass, and the glass has never cooled.',
      logs: ['Reading 1: chamber floor at 61 degrees. Unchanged since the first reading of the old staff.',
        'Reading 6: the pilgrims lay their hands on the hatch. Three came back burned. They call it a blessing.',
        'Reading 9: the chamber floor has risen 2 degrees. The elders forbid writing that down. I am writing it down.'] },
    down: { kind: 'lift', at: 'lab', levels: 3 } },
  fort_bliss: { region: 'arizona', template: 'army', hold: 'ruler', anchor: { road: 'I-10', mile: 51.6, side: -1, off: 1800 }, approachMax: 900, drones: 0,
    vehicles: [['patrol', '#9a5a3a'], ['apc', '#7a6448']],
    project: { name: 'PROJECT BORDER LANTERN', line: 'A chain of radio beacons along the river still answers the post\'s call sign every night, and the Republic still writes down what they say.',
      logs: ['Beacon log: Station 4 replies on schedule. Station 7 replies before it is called.',
        'Beacon log: Station 7 asked for us by name. Nobody here gave it a name.',
        'Beacon log: orders to keep listening and never to answer.'] },
    down: { kind: 'hatch', at: 'hq', levels: 2 } },
};

// ---- the tuning (WEB_BASES.md §7) -----------------------------------------------------------------------------------------
export const MIL_RULES = {
  clear: 170,          // a fence never stands nearer an interstate's centreline than this (metres)
  clearTown: 650,      // ... nor a town's centre than this plus the half side
  slideStep: 40,       // the scale law slides a base this far a step while it keeps clear / comes in to its road
  gateWidth: 10,       // the main gate's gap in the wire
  fenceH: 2.5, wire: 0.6, panel: 8,   // chain-link: height, razor wire on top, a post every panel
  road: 9,             // the access road's width (a gravel spur off the interstate, or to the point a row names)
  roadStop: 4,         // it ends this far outside the interstate's outer edge
  street: 10, walk: 3, // the main street inside the gate and its walks
  lotGap: 7, setback: 4, // between the buildings along the street; from the walk to a building's front wall
  runway: { w: 46, max: 1800, share: 0.82, min: 400 }, // the runway law: length = clamp(share x side, min, max)
  apron: 60,           // the apron between the hangars and the runway
  scatterCell: 64,     // the open ground's wreckage is laid one cell at a time
  tower: { size: 3.4, deck: 4.6, parapet: 1.05, lamp: 5.5 }, // as OUTPOST NINE's (data/bases.js TOWER)
  promoteR: 230,       // a guard post comes to life within this of you (its record is a person while you are near)...
  demoteR: 300,        // ... and goes back onto its record past this
  maxLive: 22,         // a base's people alive at once at most (towers far down the wire wait their turn)
  lightsR: 260,        // searchlights burn on the towers within this of you (the beams are a pool of 16)
  beams: 16, pools: 48,
  drone: { alt: 14, speed: 7, spotDay: 34, spotNight: 9, spotLight: 52, lightR: 5.5, loop: 0.75, hp: 30, call: 1.2 }, // spotLight: a flashlight seen this far at night
  logLabel: 'RECORDS', // the container whose search turns up the next log of the base's project
};

// What a base's people say (systems/milbases.js; OUTPOST NINE's are data/bases.js BASE_LINES). By holder.
export const MIL_LINES = {
  remnant: { warn: 'Federal installation. Turn around.', cleared: 'You\'re on the list. Go ahead.', returned: 'You were told once.', ceasefire: 'Cease fire inside the wire!', alarm: 'Contact! Open fire!' },
  ruler: { warn: 'This ground belongs to the Court. Walk back out.', cleared: 'The Court knows you. Pass.', returned: 'You came back. That was a mistake.', ceasefire: 'Hold your fire in here!', alarm: 'Thief on the wire! Take him!' },
  raider: { warn: 'Wrong gate, wrong day.', cleared: 'You ride with us. In you go.', returned: 'Told you.', ceasefire: 'Save it for the road!', alarm: 'Fresh meat! Light him up!' },
  drone: 'The drone\'s lamp swings onto you and its rotors climb to a scream.',
};

// ---- the rows ---------------------------------------------------------------------------------------------------------------
const HOLD_OF = { remnant: 'remnant', ruler: 'ruler', raider: 'raider', overrun: 'overrun', abandoned: 'abandoned', automated: 'automated', contested: 'contested' };
function rowOf(b) {
  const f = footprint(b.area_km2), B = MIL_BUILT[b.id] ?? null;
  const template = B?.template ?? KIND_TEMPLATE[b.kind] ?? 'army';
  const T = MIL_TEMPLATES[template];
  const hold = B?.hold ?? HOLD_OF[b.dsoa] ?? 'abandoned';
  const side = B?.side ?? Math.max(f.built_m, T.min);
  const xz = b.extra ? null : ATLAS_XZ.bases[b.id] ?? null;
  const holderName = b.holder === 'ruler' ? (RULERS[b.state] ?? 'the local ruler') : HOLDERS[b.holder]?.name ?? b.holder;
  return {
    id: b.id, name: b.name.toUpperCase(), real: b.name, state: b.state, lat: b.lat, lon: b.lon, area_km2: b.area_km2, kind: b.kind, template, hold,
    holder: b.holder, holderName, dsoa: b.dsoa, what: b.what, extra: !!b.extra,
    footprint: f, side, grown: side > f.built_m ? side - f.built_m : 0,
    xz: xz ? [xz[0], xz[1]] : null, snap: xz?.[2] ?? 0,
    build: B ? { ...B } : null,
  };
}
export const MIL_SITES = [...ATLAS_BASES.map(rowOf), ...MIL_EXTRAS.map(rowOf)];
export const MIL_BY_ID = Object.fromEntries(MIL_SITES.map((r) => [r.id, r]));

// ---- the validator (the World Forge's SITE tab runs it on a row before it pushes; the selftest runs it on every row) -------
// Returns a list of problems (empty: the row is good).
export function validateBaseRow(r) {
  const out = [];
  if (!r || typeof r !== 'object') return ['not a row'];
  if (!r.id || !/^[a-z0-9_]+$/.test(r.id)) out.push(`id "${r.id}" must be lower_snake_case`);
  if (!MIL_TEMPLATES[r.template]) out.push(`template "${r.template}" is not one of ${Object.keys(MIL_TEMPLATES).join(', ')}`);
  if (!MIL_HOLDS[r.hold]) out.push(`hold "${r.hold}" is not one of ${Object.keys(MIL_HOLDS).join(', ')}`);
  if (!(r.area_km2 > 0)) out.push('area_km2 must be > 0 (the real footprint)');
  const f = r.area_km2 > 0 ? footprint(r.area_km2) : null, T = MIL_TEMPLATES[r.template];
  if (f && T && !r.build?.side && r.side !== Math.max(f.built_m, T.min)) out.push(`side ${r.side} is not the footprint rule's max(${f.built_m}, ${T.min})`);
  if (!(r.side >= 64 && r.side <= 3000)) out.push(`side ${r.side} outside 64..3000`);
  if (!r.extra && r.xz === null && !['AK', 'HI'].includes(r.state)) out.push('no world position (ATLAS_XZ) for a mainland row');
  if (r.build) {
    const B = r.build;
    if (!B.region) out.push('a build block needs its region');
    if (r.extra && !B.anchor && !B.at) out.push('an extra row needs build.anchor or build.at');
    if (B.anchor && !(B.anchor.road && B.anchor.mile > 0 && Math.abs(B.anchor.side) === 1 && B.anchor.off > 0)) out.push('anchor needs road, mile > 0, side +-1, off > 0');
    if (B.project && (!B.project.name || !B.project.line || !(B.project.logs?.length >= 1))) out.push('project needs name, line and at least one log');
    if (B.down && !['lift', 'hatch'].includes(B.down.kind)) out.push(`down.kind "${B.down.kind}" is not lift | hatch`);
    if (B.drones !== undefined && !(B.drones >= 0 && B.drones <= 4)) out.push('drones 0..4');
  }
  return out;
}
