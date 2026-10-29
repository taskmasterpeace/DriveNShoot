// POLICE RESPONSE as rows (docs/design/WEB_POLICE_RESPONSE.md; systems/police.js carries every row out).
// Robert (2026-10-29): "certain cities should be able to have, like, the equivalent of SWAT teams. And they got to actually
// come from the police station too, though. And you should hear them coming close. They should have their routes around
// the city for certain."
// The laws these rows obey (docs/design/WEB_DEPTH_PLAN.md §0):
//   nobody cheats      a unit leaves its station's motor pool and drives the town's real streets; it never appears near you
//   nobody knows       a crime reaches the desk only by a CHANNEL below (a witness, a patrol's own eyes, an alarm, shots
//                      heard); the desk sends units to the REPORTED spot, never to where you really are
// Our own names: no real agency, no real unit name, no borrowed slang. Lights are red and blue only (no purple).

// ---- the station tiers: what a town of this size keeps (buildings = the town's lots, not a yard's shed) --------------
//   minBld     the town has this tier from this many buildings (citygen gives a police station from 30: layout.js)
//   cars       patrol cars in the motor pool (a car lost is gone: the pool shrinks, nothing refills it)
//   carBeats   patrol cars out on their beat per shift; footBeats: officers walking the main street per shift (pairs)
//   heavy      the town keeps a HEAVY TEAM (the breach truck and its six); also given to a `station` town whose wealth
//              reaches HEAVY_WEALTH, and to every major city (citygen ARCHETYPES.*.major)
//   officers   the roster the armory can arm (every unit drawn out counts against it; the dead are not replaced)
export const STATION_TIERS = {
  post: { name: 'constable\'s post', minBld: 30, cars: 2, carBeats: { day: 1, night: 1 }, footBeats: { day: 1, night: 0 }, heavy: false, officers: 8, cells: 2 },
  station: { name: 'station house', minBld: 60, cars: 3, carBeats: { day: 1, night: 2 }, footBeats: { day: 1, night: 1 }, heavy: false, officers: 14, cells: 4 },
  precinct: { name: 'precinct', minBld: 110, cars: 4, carBeats: { day: 2, night: 2 }, footBeats: { day: 2, night: 1 }, heavy: true, officers: 22, cells: 8 },
};
export const HEAVY_WEALTH = 0.6;

// ---- who the police ARE: the town's owner decides (systems/sitestories.js places; else the archetype) ------------------
//   look       the outfit (systems/characters.js outfit key); car: the patrol car row + its paint; title: what they're called
//   dispatcher the voice on the air (the scanner copies it: data/gadgets.js KIT.radio_scanner)
//   arrest     true: at low severity they offer the cuffs before they shoot (holster and stand still = a fine or the cell)
//   fine       scrip per severity point; jail: game hours per severity point (the cell is THIS station's)
//   heavyName  what their heavy team is called on the air
export const FORCES = {
  sheriff: { title: 'Sheriff\'s bulls', look: 'warden', car: { type: 'bullcar', paint: '#6e6a5e' }, dispatcher: 'the sheriff\'s desk', arrest: true, fine: 35, jail: 4, heavyName: 'the breach team' },
  militia: { title: 'Town militia', look: 'warden', car: { type: 'bullcar', paint: '#5b6a4e' }, dispatcher: 'the militia\'s radio shack', arrest: true, fine: 25, jail: 6, heavyName: 'the wall squad' },
  enforcers: { title: 'The boss\'s enforcers', look: 'raider', car: { type: 'bullcar', paint: '#5a3a2a' }, dispatcher: 'the boss\'s dispatcher', arrest: false, fine: 0, jail: 0, heavyName: 'the wrecking crew' },
};
// Owner -> force: a faction that raids for a living runs enforcers; a family runs a militia; a lawful faction or no
// owner on record falls to the archetype's default (FORCE_BY_ARCH), then to the sheriff.
export const FORCE_BY_ARCH = { walled_stronghold: 'militia', military_town: 'militia', company_town: 'enforcers', boom_strip: 'enforcers', hot_zone_ruin: 'militia', tundra_station: 'militia' };

// ---- the responses: what the desk sends ---------------------------------------------------------------------------
//   cars       how many cars (patrol / posse come out of the motor pool; heavy is the breach truck)
//   men        officers per car (the driver is one of them)
//   weapons    the armory's draw, by share; worn: what they wear (data/gear.js rows: NPC armor soaks through gear.soak)
//   siren      true: lights and siren the whole way (a patrol answering a small thing rolls quiet: lights only near)
//   cruise     m/s on the town's streets; search: seconds they look round the reported spot before they call it clear
//   perimeter  officers who hold the block's corners while the rest search; breach: they breach a building the report
//              names (the ram and the shield go first)
export const RESPONSES = {
  patrol: { name: 'a patrol car', cars: 1, men: 2, weapons: { pistol: 0.6, shotgun: 0.4 }, worn: { head: null, chest: 'leather_vest' }, siren: false, cruise: 14, search: 45, perimeter: 0, breach: false, hp: 110 },
  posse: { name: 'two cars', cars: 2, men: 2, weapons: { smg: 0.5, shotgun: 0.5 }, worn: { head: 'leather_cap', chest: 'scrap_vest' }, siren: true, cruise: 17, search: 70, perimeter: 2, breach: false, hp: 125 },
  heavy: { name: 'the heavy team', cars: 1, men: 6, vehicle: 'breach_truck', weapons: { rifle: 0.5, smg: 0.3, shotgun: 0.2 }, worn: { head: 'riot_helmet', chest: 'soft_vest', arms: 'arm_guards' }, siren: true, cruise: 13, search: 110, perimeter: 2, breach: true, hp: 150, shield: 1, ram: 1 },
};
// The breach truck (vehicles.js row registered by systems/police.js at boot): an armored box on the patrol truck's frame.
export const BREACH_TRUCK = { base: 'patrol', name: 'BREACH TRUCK', look: 'rundown', len: 5.6, wid: 2.4, tall: 2.5, maxSpeed: 30, reverse: 11, accel: 13, turn: 1.7, grip: 6.8, mass: 3.4, hp: 620, armor: 0.12, fuelCap: 120, paint: '#3e4038',
  seats: [{ id: 'driver', side: 'left', row: 0 }, { id: 'shotgun', side: 'right', row: 0 }, { id: 'backL', side: 'left', row: 1 }, { id: 'backR', side: 'right', row: 1 }, { id: 'rearL', side: 'left', row: 2 }, { id: 'rearR', side: 'right', row: 2 }] };

// ---- severity: what a crime is worth to the desk (the deed's verb, data/society.js VERBS, and how it was reported) --
//   verb     severity by the deed (unknown verbs: VERBS[v] rounded)
//   shots    shots heard and nobody saw who; alarm: an alarm wired to the desk
//   officer  +2 when the victim was one of their own (an officer down raises the call a whole rung)
//   ladder   the rung for a severity: below posse a patrol car, from heavy the heavy team (if the town keeps one, else a posse)
export const SEVERITY = {
  verb: { hurt: 1, threaten: 1, trespass: 1, steal: 2, carjack: 2, destroy: 2, rob: 3, kill: 4, silence: 5, betray: 3 },
  shots: 2, alarm: 2, officer: 2,
  ladder: { posse: 3, heavy: 5 },
};

// ---- the channels: how word of a crime reaches the desk (data/pulls.js CHANNELS are the player's; these are the desk's) --
//   witness  someone who saw it (deeds.js witness pass: identified witnesses) and lives in or is in the town runs to the
//            station: delay = their distance / run + tell; dead or gone before then = never told. A patrol officer on the
//            way hears it first (within `flag` m of the runner: the runner flags the officer down)
//   patrol   an officer saw it themself: on the radio after `radio` s, the spot exact
//   heard    shots or a blast heard: the station's own ears inside `stationEar` x the noise's radius; a resident who heard
//            runs it in (as a witness). The spot is where the hearer THINKS it was: off by `fuzz` x the hearer's distance
//   alarm    a door kicked or glass broken at a building with an alarm wired to the desk: `wire` m/s plus `delay`
//   minNoise noises smaller than this are not shots (a door bang is not a crime)
export const CHANNELS = {
  witness: { run: 3.4, tell: 6, flag: 18, maxR: 900 },
  patrol: { radio: 2 },
  heard: { stationEar: 2.2, minNoise: 40, fuzz: 0.25, tell: 6 },
  alarm: { wire: 300, delay: 2, kinds: ['shop', 'clinic', 'office', 'hotel', 'police_station', 'saloon', 'courthouse', 'hospital', 'gas_station'], share: 0.6 },
  merge: { r: 90, secs: 180 }, // a second report within r m and secs s of an open case is the same case (it firms it up)
};

// ---- the patrols: beats along the town's real streets, on shifts ---------------------------------------------------
//   shifts    { day: [from, to] game hours, night: ... }; a beat goes out at its shift's start and in at its end
//   car       the car beat: a loop of street corners `ring` blocks round the town's centre (the generator's own crossings),
//             driven at `cruise`; dwell: seconds parked at each corner; lights: true (seen far), siren: false
//   foot      the foot beat: up and down the main street's sidewalk at `walk`, turning at its ends (or `len` m from the
//             station either way, if shorter); they stop and look `look` s at each end
//   sightR    how far an officer on a beat spots a crime (daylight; the deeds witness pass decides who saw it)
export const PATROLS = {
  shifts: { day: [6, 18], night: [18, 6] },
  car: { ring: 1, cruise: 9, dwell: 4, corner: 9 },
  foot: { walk: 1.6, len: 120, look: 5 },
  sightR: 42,
};

// ---- the siren and the lights: how you hear them coming --------------------------------------------------------------
//   range     m it carries (audio.js spatial(): the same falloff every sound uses); wail: the up-and-down period (s)
//   audible   the gain at which you hear it (and the HUD names its direction)
//   lights    the bar's two colours (red and blue ONLY), the flash rate (Hz), the glow's size on the ground
export const SIREN = { range: 650, wail: 1.8, audible: 0.012, lights: { a: '#ff2a1e', b: '#1e5aff', hz: 3, glow: 9 } };

// ---- the air: what the desk says, said from the station (systems/kit.js keyUp: only a scanner in range copies it) ----
export const DISPATCH_LINES = {
  send: '{who}: {unit} to {place}, {what}{code}',
  scene: '{who}: {unit} on scene at {place}',
  stack: '{who}: {heavy} stacked at the door, going in',
  clear: '{who}: {unit} clear at {place}, nothing found, returning',
  contact: '{who}: {unit}, contact, suspect at {place}',
  down: '{who}: officer down at {place}, all units',
};
export const PLACE_WORDS = { N: 'north end', S: 'south end', E: 'east end', W: 'west end', C: 'downtown' };

// ---- INVESTIGATE: how anyone looks for someone (systems/investigate.js; police, hunters, a guard who heard something) --
//   hideR      the obvious hiding places are looked for this far round the spot (buildings, cover, parked cars, yards);
//              maxHides of them, nearest first; look: seconds spent looking at each (x1.5 inside a building)
//   rings      the sweep's radii (m) after the hiding places, perRing points each, split between the party
//   sightDay/Night  how far a searcher picks you out (crouch x0.6, prone by systems/stance.js)
//   brassR     casings within this of the spot are read (the shooter stood where the brass lies)
//   askR       a searcher this close to someone who SAW you goes and asks (ask: seconds); witnessR: how far people see
//   noseR      sign (blood, prints) is read within this of the lead; bootSkill: the tracking it takes to follow BOOTS
//              (anyone follows blood); trackSkill: a party's skill unless it brings a tracker; lookbackH: sign this many
//              game hours older than the search is not this incident
//   until      seconds without a fresh clue before they give up; giveGoal: seconds before a place they cannot reach is
//              given up; scanEvery: seconds between reads of the ground; speed / trailSpeed: walking pace
export const INVESTIGATE = {
  hideR: 34, maxHides: 10, look: 2.2, rings: [12, 24, 36], perRing: 6,
  sightDay: 38, sightNight: 15, brassR: 16, askR: 22, ask: 2, witnessR: 45,
  noseR: 20, bootSkill: 6, trackSkill: 3, lookbackH: 0.25,
  until: 75, giveGoal: 18, scanEvery: 1, speed: 2.4, trailSpeed: 3,
};

// The validator (the World Forge and the selftest): tiers climb, every force names a real look and car, every response
// names real weapons and gear, severities climb, colours are red and blue (never purple, hue 270-320).
export function validatePolice(rows = { STATION_TIERS, FORCES, RESPONSES, SEVERITY, CHANNELS, PATROLS, SIREN, BREACH_TRUCK }, ctx = {}) {
  const bad = [], { weapons = null, gear = null, vehicles = null } = ctx;
  const hue = (hex) => {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 0.08) return -1;
    let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
    h *= 60; return h < 0 ? h + 360 : h;
  };
  const purple = (c) => { const h = hue(c); return h >= 270 && h <= 320; };
  let last = 0;
  for (const [id, t] of Object.entries(rows.STATION_TIERS)) {
    if (!(t.minBld > last)) bad.push(`tier ${id}: minBld must climb`); last = t.minBld;
    if (!(t.cars >= 1) || !(t.officers >= t.cars * 2) || !(t.cells >= 1)) bad.push(`tier ${id}: cars/officers/cells`);
    for (const s of ['day', 'night']) if (!(t.carBeats[s] >= 0 && t.carBeats[s] <= t.cars) || !(t.footBeats[s] >= 0)) bad.push(`tier ${id}: beats ${s}`);
  }
  for (const [id, f] of Object.entries(rows.FORCES)) {
    if (!f.title || !f.dispatcher || !f.car?.type) bad.push(`force ${id}: title/dispatcher/car`);
    if (vehicles && !vehicles[f.car.type]) bad.push(`force ${id}: car ${f.car.type}`);
    if (purple(f.car.paint)) bad.push(`force ${id}: paint is purple`);
    if (f.arrest && !(f.fine > 0 && f.jail > 0)) bad.push(`force ${id}: an arresting force needs a fine and a jail`);
  }
  for (const [id, r] of Object.entries(rows.RESPONSES)) {
    let s = 0; for (const [w, p] of Object.entries(r.weapons)) { s += p; if (weapons && !weapons[w]) bad.push(`response ${id}: weapon ${w}`); }
    if (Math.abs(s - 1) > 0.01) bad.push(`response ${id}: weapon shares sum ${s}`);
    for (const gid of Object.values(r.worn ?? {})) if (gid && gear && !gear[gid]) bad.push(`response ${id}: gear ${gid}`);
    if (!(r.cars >= 1 && r.men >= 1 && r.cruise > 0 && r.search > 0 && r.hp > 0)) bad.push(`response ${id}: numbers`);
    if (r.perimeter >= r.cars * r.men) bad.push(`response ${id}: perimeter leaves nobody to search`);
  }
  if (!(rows.RESPONSES.heavy.breach && rows.RESPONSES.heavy.vehicle === 'breach_truck')) bad.push('heavy: breaches from the breach truck');
  if (rows.BREACH_TRUCK.seats.length < rows.RESPONSES.heavy.men) bad.push('breach truck: seats for the heavy team');
  if (purple(rows.BREACH_TRUCK.paint)) bad.push('breach truck: paint is purple');
  if (!(rows.SEVERITY.ladder.heavy > rows.SEVERITY.ladder.posse)) bad.push('severity ladder must climb');
  for (const c of [rows.SIREN.lights.a, rows.SIREN.lights.b]) if (purple(c)) bad.push(`siren light ${c} is purple`);
  const ha = hue(rows.SIREN.lights.a), hb = hue(rows.SIREN.lights.b);
  if (!((ha < 20 || ha > 340) && hb > 200 && hb < 250)) bad.push('siren lights must be one red and one blue');
  if (!(rows.SIREN.range > 100 && rows.SIREN.audible > 0)) bad.push('siren range/audible');
  if (!(rows.CHANNELS.witness.run > 0 && rows.CHANNELS.alarm.wire > 0 && rows.CHANNELS.heard.stationEar > 0)) bad.push('channel speeds');
  for (const s of ['day', 'night']) { const [a, b] = rows.PATROLS.shifts[s]; if (!(a >= 0 && a < 24 && b >= 0 && b < 24 && a !== b)) bad.push(`shift ${s}`); }
  return { ok: bad.length === 0, bad };
}
