// THE UNDERGROUND (docs/design/WEB_UNDERGROUND.md): caves, bunker levels and the secret facilities, as rows. A site is a
// surface entrance (a hatch, a cave mouth, a freight lift, a culvert) and the levels under it; a level is a pure function
// of its site row, its depth and a seed (world/undergen.js), a record until somebody goes down, geometry and people while
// they are there (systems/underground.js), written back when they leave. Basements are negative storeys of the storeys
// law (docs/design/WEB_STOREYS.md): a floor at a height, flights between floors, your level is where your feet are.
//
// Everything a level is made of is a row here: the kinds of place, the rooms, the facilities' projects, the logs you find
// (our own words: tools/ip-lint.mjs), the loot by room, the flights and entrances, and the tuning knobs. The World Forge's
// SITE tab (docs/design/WEB_WORLD_EDITOR_PLAN.md L4) edits these rows; validateUnderground() is the check it runs.
// No purple anywhere (hue 270-320 is banned): every colour below is earth, concrete, steel, olive, rust, amber or blood.

// ---- the knobs (WEB_UNDERGROUND.md §7 gives the safe ranges) ----------------------------------------------------------
//   below       a person this far under the surface is underground: their collision, sight, rounds and sound are the
//               level's, not the street's
//   viewBelow   the view goes below once your head is under the surface (a person on the hatch stair is still seen up top)
//   depth       the surface to level 1's floor; step: floor to floor between levels (the rock between is solid)
//   wallH       a wall's height off its floor; clipMin: the camera's near plane never cuts lower over your floor than this
//   size        a level's side in metres: at most 60, the reachability probe's window less its pad (world/floorplan.js)
//   attachR / releaseR   a surface entrance (its collar, its look) comes in within attachR of you, goes past releaseR
//   promoteNear level 1 is promoted when you stand this close to the entrance's top (its colliders exist before you step down)
//   demoteAfter a level you are off is written back after this long, unless somebody on it is hunting you within huntKeep
export const UG = {
  below: 0.5, viewBelow: 2.0, depth: 7.5, step: 7, wallH: 2.6, clipMin: 2.75,
  attachR: 140, releaseR: 190, promoteNear: 16, demoteAfter: 8, huntKeep: 30,
  cell: 1,
};

// The light below (systems/sky.js reads these through systems/underground.js). No new lights: the flashlight's cone, the
// emissive strips a running generator lights, chem-light glows, eyes that catch your light, and the sky's fill turned
// down to a breath. dark: the fill with nothing running; powered: with the generator on (the strips); cone: the
// flashlight's opacity below (0.55 up top).
export const LIGHT = {
  dark: 0.02, powered: 0.8, cone: 0.9,
  sky: '#2e3236', ground: '#120f0c', poweredSky: '#c9c2a8', poweredGround: '#3a3226',
  strip: '#ffd9a0', stripOff: '#2a2622', emergency: '#ff7a3a', chem: ['#9ef08a', '#f0c050', '#ff6a3a'], eye: '#f2e8b0',
  eyeR: 15, eyeCone: 40, // m and degrees: the infected's eyes catch your light this far, this close to the beam
  // The flashlight's spill: below, the second of the fire lights (systems/throwables.js: a light that is already in the
  // scene, so the light count never changes; nothing burns below, throws are the street's) is your lamp, ahead of you.
  lamp: { color: '#ffe8c4', intensity: 26, distance: 15, decay: 1.25, ahead: 2.6, up: 2.2 },
};

// Flights between floors (the storeys law: a slope between two decks, entered at its two ends). pitch: rise over run;
// w: across; speed: the walking pace on it (a ladder is slow); look: how it is drawn.
export const FLIGHTS = {
  stair: { pitch: 0.727, w: 1.6, speed: 0.8, look: 'stair' },
  companion: { pitch: 1.0, w: 1.5, speed: 0.7, look: 'stair' },     // a hatch's steep stair
  ladder: { pitch: 1.73, w: 1.0, speed: 0.42, look: 'ladder' },     // a ladderway beside a lift shaft
  ramp: { pitch: 0.42, w: 2.6, speed: 0.85, look: 'concrete' },     // a culvert's sloped pipe
  slope: { pitch: 0.6, w: 2.4, speed: 0.75, look: 'rubble' },       // a cave's scree slope
};

// Surface entrances. flight: the way down to level 1; lift: a freight lift beside it (needs the site's power); look: how
// the top reads from above. collar: the low wall round the opening (keeps the street from walking into the hole).
export const ENTRANCES = {
  hatch: { flight: 'companion', look: 'hatch', name: 'a hatch', collar: 1.0 },
  mouth: { flight: 'slope', look: 'mouth', name: 'a cave mouth', collar: 1.4 },
  lift: { flight: 'ladder', lift: true, look: 'lift', name: 'a freight lift', collar: 1.1 },
  culvert: { flight: 'ramp', look: 'culvert', name: 'a culvert', collar: 1.2 },
  manhole: { flight: 'ladder', look: 'manhole', name: 'a manhole', collar: 0 }, // UNDER THE STREET: a town's drains (world/understreet.js makes its flights)
};

// The freight lift: a platform in a shaft through every level it serves. It runs only on the site's power; the gate on a
// level the platform is not at stays shut. speed m/s; doorT: seconds the gate takes.
export const LIFT = { speed: 1.8, w: 4, d: 4, gateH: 2.2 };

// The generator (one a site, in its generator room). hold: seconds of E to prime and crank it; burn: tank share a game
// hour; can: tank share a fuel can pours; noise: metres it is heard down its corridors, every `every` s while it runs.
export const GENERATOR = { hold: 2.4, burn: 0.015, can: 0.5, noise: 24, every: 4 };

// Sound below (systems/underground.js noise): a noise carries along the level's corridors (a flood over its open cells,
// not a straight line), to the next level by a flight at `level` of what was left, and up a shaft to the street at `shaft`.
export const NOISE = { level: 0.5, shaft: 0.35 };

// A cave's loose roof: a loud noise (a shot, a blast, a kick) within `r` of a cracked span may bring it down: rubble fills
// it (it stays down: the record keeps it), and anyone under it takes `dmg`. Only on a passage that is one of two ways
// round (a loop), so a fall never seals a chamber off.
export const COLLAPSE = { r: 9, chance: 0.4, dmg: 45, minNoise: 30 };

// Blast doors: a door material row (data/interiors.js DOOR_MATERIALS takes it at boot): kicks it would take (it will not
// give to boots), lockHp a breaching charge takes. keypad: a powered keypad opens it with the code (a log has it); unpowered,
// a crowbar cranks the manual release (crank s of E, loud); a charge (a frag or a pipe bomb you carry) blows it.
export const BLAST = {
  material: { name: 'blast door', kicks: 40, lockHp: 360, bulletSlap: 0.004, colors: ['#7a7c72', '#86806a', '#6e7268'], lock: '#e0a030' },
  crank: 9, crankNoise: 30, charge: { hold: 2.0, fuse: 4, r: 6.5, dmg: 75, uses: ['pipe', 'frag'] }, codeLen: 4,
};

// ---- the kinds of place -----------------------------------------------------------------------------------------------
// built: rooms off corridors (bunker, facility, tunnels); natural: chambers joined by passages (cave). size: [min, max] m
// a side. levels: [min, max]. programme[k]: the rooms level k wants (the generator takes what fits, in this order).
// infected[k]: [min, max] of the dead living on level k when nobody holds it; runners: the share that are sprinters.
export const KINDS = {
  bunker: {
    name: 'bunker', built: true, size: [46, 56], levels: [2, 2], corridor: 3,
    programme: [
      ['vestibule', 'guard', 'bunks', 'mess', 'armory', 'comms', 'latrine', 'stores'],
      ['generator', 'command', 'medbay', 'stores', 'vault', 'bunks', 'latrine'],
      ['stores', 'vault', 'bunks', 'stores'],
    ],
    infected: [[1, 3], [2, 4], [2, 5]], runners: 0.2,
    logs: ['bunker_last', 'bunker_fuel', 'bunker_vault'],
  },
  facility: {
    name: 'secret facility', built: true, size: [50, 58], levels: [3, 3], corridor: 3,
    programme: [
      ['vestibule', 'guard', 'lockers', 'comms', 'medbay', 'stores'],
      ['generator', 'lab', 'office', 'lab', 'stores', 'latrine'],
      ['lab', 'office', 'vault', 'stores'],
    ],
    infected: [[1, 2], [2, 4], [2, 3]], runners: 0.25,
    logs: [],
  },
  tunnels: {
    name: 'service tunnels', built: true, size: [44, 54], levels: [1, 2], corridor: 2,
    programme: [['vestibule', 'pump', 'stores', 'latrine', 'stores', 'pump'], ['pump', 'stores', 'generator', 'stores']],
    infected: [[3, 6], [3, 6]], runners: 0.3,
    logs: ['tunnel_chalk', 'tunnel_pump'],
  },
  // A military base's VAST sealed bunker (docs/design/WEB_CITYGEN.md §3.5; placed by systems/citygen.js under a base's
  // HQ, far apart): entry vault, security, barracks, labs, storage, power, and the sealed ring-platform room the Carousel
  // will use (THE CAROUSEL, docs/design/WEB_DEATHLANDS_GAP.md G6: the room is here now, the machine is a later lane).
  vault: {
    name: 'sealed vault', built: true, size: [54, 58], levels: [5, 8], corridor: 3,
    programme: [
      ['vestibule', 'guard', 'guard', 'lockers', 'stores'],
      ['guard', 'armory', 'comms', 'lockers', 'latrine'],
      ['bunks', 'bunks', 'mess', 'latrine', 'medbay', 'stores'],
      ['lab', 'lab', 'office', 'cold', 'stores'],
      ['generator', 'pump', 'stores', 'vault', 'stores'],
      ['ringroom', 'command', 'guard', 'stores'],
      ['stores', 'cold', 'lab', 'stores'],
      ['ringroom', 'stores'],
    ],
    infected: [[1, 2], [1, 3], [2, 4], [2, 4], [1, 3], [2, 3], [2, 5], [3, 6]], runners: 0.25,
    logs: ['bunker_last', 'bunker_fuel', 'bunker_vault'],
  },
  // UNDER THE STREET (docs/design/WEB_UNDERSTREET.md): a town's storm drains and sewers, one level made from its street
  // plan by world/understreet.js (undergen's GEN.drains); its rows are data/understreet.js. size/programme are unused
  // (the town sets the frame) and kept only so every kind reads the same.
  drains: { name: 'storm drains', built: true, size: [20, 60], levels: [1, 1], corridor: 2, programme: [[]], infected: [[2, 5]], runners: 0.25, logs: [] },
  cave: {
    name: 'cave', built: false, size: [46, 58], levels: [1, 2], chambers: [6, 9], radius: [3.2, 6.6], tunnel: [2, 3],
    squeeze: 0.22, pools: [1, 3], collapse: [1, 2], nest: 0.75,
    infected: [[1, 3], [2, 4]], runners: 0.35, nestSize: [4, 6],
    logs: ['cave_chalk', 'cave_air', 'cave_roof'],
  },
};

// ---- rooms --------------------------------------------------------------------------------------------------------------
// w, d: [min, max] metres (walls are a metre of concrete either side, outside these). floor: the floor's colour. props:
// what it holds (PROPS rows), each as [prop, count] placed against its walls (or `mid` in its middle) by the generator,
// which drops any piece the reachability proof refuses. loot: the containers' table (UG_LOOT / data/items.js LOOT).
// door: the door's material; locked: the chance it starts locked; keypad: a code group (a powered keypad opens it); blast:
// its door is a blast door. log: a log turns up here. generator / beds: as it says.
export const ROOMS = {
  vestibule: { label: 'VESTIBULE', w: [4, 6], d: [4, 5], floor: '#5b5850', props: [['bench', 1], ['locker', 1]], loot: 'ug_bunks', door: 'metal', locked: 0 },
  guard: { label: 'GUARD POST', w: [4, 5], d: [4, 5], floor: '#565349', props: [['desk', 1], ['locker', 2]], loot: 'ug_guard', door: 'metal', locked: 0.15, log: true },
  bunks: { label: 'BUNK ROOM', w: [6, 9], d: [5, 7], floor: '#585246', props: [['bunk', 5], ['locker', 2]], loot: 'ug_bunks', door: 'wood', locked: 0.1, beds: true },
  mess: { label: 'MESS', w: [6, 9], d: [6, 8], floor: '#5e574a', props: [['counter', 2], ['table', 2, 'mid']], loot: 'ug_mess', door: 'wood', locked: 0 },
  armory: { label: 'ARMORY', w: [4, 6], d: [4, 6], floor: '#4e4e48', props: [['rack', 3], ['crate', 2]], loot: 'ug_armory', door: 'metal', locked: 1, keypad: 'armory' },
  generator: { label: 'GENERATOR ROOM', w: [6, 8], d: [6, 7], floor: '#4a4842', props: [['drum', 3], ['bench', 1]], loot: 'ug_gen', door: 'metal', locked: 0, generator: true, log: true },
  comms: { label: 'COMMS', w: [4, 6], d: [4, 5], floor: '#54554e', props: [['console', 2], ['cabinet', 1]], loot: 'ug_comms', door: 'metal', locked: 0.2, log: true },
  vault: { label: 'VAULT', w: [5, 7], d: [4, 6], floor: '#4c4a44', props: [['crate', 3], ['cabinet', 2]], loot: 'ug_vault', door: 'blast', locked: 1, keypad: 'vault', blast: true },
  medbay: { label: 'MEDBAY', w: [5, 7], d: [4, 6], floor: '#626660', props: [['cot', 3], ['cabinet', 2]], loot: 'ug_med', door: 'wood', locked: 0.1, beds: true },
  stores: { label: 'STORES', w: [5, 8], d: [4, 6], floor: '#57524a', props: [['shelf', 3], ['crate', 2]], loot: 'ug_stores', door: 'wood', locked: 0.35 },
  command: { label: 'COMMAND', w: [5, 7], d: [5, 6], floor: '#55534c', props: [['maptable', 1, 'mid'], ['desk', 1], ['cabinet', 1]], loot: 'ug_comms', door: 'metal', locked: 0.3, log: true },
  latrine: { label: 'LATRINE', w: [3, 4], d: [3, 4], floor: '#686a64', props: [['sink', 2]], loot: 'ug_med', door: 'wood', locked: 0 },
  lockers: { label: 'LOCKER ROOM', w: [4, 6], d: [4, 5], floor: '#5c5d57', props: [['locker', 4], ['bench', 1]], loot: 'ug_bunks', door: 'wood', locked: 0 },
  lab: { label: 'LAB', w: [6, 9], d: [5, 7], floor: '#6a6f6c', props: [['labbench', 3], ['cabinet', 1], ['table', 1, 'mid']], loot: 'ug_lab', door: 'metal', locked: 0.4, log: true },
  office: { label: 'OFFICE', w: [4, 6], d: [4, 5], floor: '#5f5a50', props: [['desk', 2], ['cabinet', 2]], loot: 'ug_office', door: 'wood', locked: 0.3, log: true },
  pump: { label: 'PUMP ROOM', w: [4, 6], d: [4, 6], floor: '#4c4f4a', props: [['pump', 1, 'mid'], ['drum', 2]], loot: 'ug_gen', door: 'metal', locked: 0.2 },
  // The vault's deepest room: a raised round platform under a ring of pylons, behind a blast door (the Carousel's room).
  ringroom: { label: 'RING PLATFORM', w: [10, 13], d: [9, 12], floor: '#4a4a46', props: [['pylon', 1, 'mid'], ['console', 2]], loot: 'ug_lab', door: 'blast', locked: 0.9, log: true },
  // A project's own rooms (PROJECTS rows put them in a facility's programme).
  ward: { label: 'WARD', w: [7, 10], d: [6, 8], floor: '#6c6e68', props: [['cot', 6], ['cabinet', 1]], loot: 'ug_med', door: 'metal', locked: 0.2, beds: true },
  cold: { label: 'COLD ROOM', w: [6, 9], d: [5, 7], floor: '#5d6a6c', props: [['shelf', 4], ['crate', 2]], loot: 'ug_seeds', door: 'metal', locked: 0.6, keypad: 'cold' },
  chamber: { label: 'TEST CHAMBER', w: [6, 9], d: [6, 8], floor: '#4f5554', props: [['console', 2], ['pylon', 1, 'mid']], loot: 'ug_lab', door: 'metal', locked: 0.3 },
};
// The generator's own extras (never in a programme): the corridor and the hall a downward flight stands in.
export const SPACES = {
  corridor: { label: 'CORRIDOR', floor: '#4f4c46' },
  stairwell: { label: 'STAIRWELL', floor: '#4d4a44' },
  lobby: { label: 'LIFT LOBBY', floor: '#57544c' },
  chamber: { label: 'CHAMBER' }, passage: { label: 'PASSAGE' }, nest: { label: 'THE NEST' },
};

// Furniture and fittings: a size (w x d metres, along the wall x out from it), height, colour, and what it is. container:
// a searchable box (inventory.js); bed: somewhere to sleep; low: no collider (a sink, a cot you can step over: no, cots
// stop you; a floor stain yes). Generic shapes, no make or model.
export const PROPS = {
  bench: { size: [2, 0.6], h: 0.5, color: '#5a4a36' },
  locker: { size: [0.9, 0.55], h: 1.9, color: '#66705c', container: 30, label: 'LOCKER' },
  desk: { size: [1.6, 0.8], h: 0.78, color: '#5c4b37', container: 20, label: 'DESK' },
  bunk: { size: [2.0, 0.95], h: 1.55, color: '#4f5442', bed: true },
  counter: { size: [2.4, 0.7], h: 0.95, color: '#6a675e', container: 30, label: 'COUNTER' },
  table: { size: [1.8, 1.0], h: 0.78, color: '#5f4d38' },
  rack: { size: [2.2, 0.5], h: 1.8, color: '#4a4c44', container: 50, label: 'GUN RACK' },
  crate: { size: [1.2, 0.8], h: 0.75, color: '#6b5632', container: 60, label: 'CRATE' },
  drum: { size: [0.7, 0.7], h: 1.0, color: '#6a3a24', container: 20, label: 'DRUM', round: true },
  console: { size: [2.0, 0.7], h: 1.1, color: '#4a514c', screen: true },
  cabinet: { size: [1.0, 0.6], h: 1.4, color: '#5d6056', container: 30, label: 'FILE CABINET' },
  cot: { size: [2.0, 0.9], h: 0.5, color: '#6c705e', bed: true },
  maptable: { size: [2.2, 1.4], h: 0.9, color: '#4e5a46' },
  sink: { size: [0.8, 0.5], h: 0.85, color: '#8a8c86' },
  shelf: { size: [2.0, 0.5], h: 1.9, color: '#5a4b38', container: 40, label: 'SHELF' },
  labbench: { size: [2.4, 0.8], h: 0.95, color: '#7a7e78', container: 30, label: 'LAB BENCH', screen: true },
  pump: { size: [1.6, 1.2], h: 1.3, color: '#5e6a5a' },
  pylon: { size: [1.2, 1.2], h: 2.2, color: '#6a6e60', screen: true },
  generator: { size: [2.6, 1.4], h: 1.6, color: '#7a6a3a' },
};

// ---- the secret facilities' projects (our own inventions) --------------------------------------------------------------
// rooms[k]: rooms the project adds to level k's programme (before the kind's own); sealed: the thing that should have
// stayed locked: its room (always behind a keypad door on the deepest level) and who is waiting in it; logs: what you can
// learn, in the order they turn up (the last is in the sealed room's antechamber). seal: the keypad group the sealed
// room's door answers to (a log has its code).
export const PROJECTS = {
  lullaby: {
    name: 'PROJECT LULLABY', what: 'a sleep ward: volunteers put under to sleep out the war and the decade after it',
    rooms: [[], ['ward'], ['ward']], sealed: { room: 'ward', label: 'WARD C', door: 'blast', seal: 'ward', spawns: [['shambler', 6], ['sprinter', 2]] },
    logs: ['lull_orientation', 'lull_fuel', 'lull_nurse', 'lull_memo', 'lull_override'],
  },
  seed_library: {
    name: 'THE SEED LIBRARY', what: 'a seed vault: every crop the country grew, kept cold against the day after',
    rooms: [[], ['cold'], ['cold']], sealed: { room: 'cold', label: 'DEEP COLD', door: 'blast', seal: 'cold', spawns: [['echo', 1], ['shambler', 3]] },
    logs: ['seed_welcome', 'seed_fuel', 'seed_cold', 'seed_north', 'seed_override'],
  },
  cloud_farm: {
    name: 'THE CLOUD FARM', what: 'a weather lab: seeding storms, then teaching them to burn',
    rooms: [[], ['chamber'], ['chamber']], sealed: { room: 'chamber', label: 'STORM CELL', door: 'blast', seal: 'cell', spawns: [['sprinter', 3], ['shambler', 3]] },
    logs: ['cloud_41', 'cloud_fuel', 'cloud_112', 'cloud_breaker', 'cloud_override'],
  },
  listening_room: {
    name: 'THE LISTENING ROOM', what: 'a sound lab: a tone that turns a crowd',
    rooms: [[], ['chamber'], ['chamber']], sealed: { room: 'chamber', label: 'THE DEEP CHAMBER', door: 'blast', seal: 'deep', spawns: [['choir', 1], ['shambler', 5]] },
    logs: ['listen_tone', 'listen_fuel', 'listen_hum', 'listen_answer', 'listen_override'],
  },
};

// ---- logs: short, our own words ----------------------------------------------------------------------------------------
// title, text; code: a keypad group whose code reading this teaches you ({code} in the text is that code). Paper logs lie
// on a desk or the floor; terminals glow on a console (they need power to read, unless `paper`).
export const LOGS = {
  // the Remnant's holdout under Outpost Nine
  hold_watch: { title: 'WATCH BILL', paper: true, code: 'armory', text: 'Two on the stair, one on the set, the bird flies the long corridor on the hour. Nobody goes topside without the Lieutenant\'s word. Armory is the founding day, same as always: {code}.' },
  hold_quarter: { title: 'QUARTERMASTER', paper: true, text: 'Rifles cleaned and counted: thirty-one. Rounds: not enough. Rations: enough if the new ones eat less. If you are reading this and you are not one of ours, put it back.' },
  hold_radio: { title: 'RADIO LOG', text: 'Day 4,112. Called the mountain on the hour, every hour. Static. Called anyway. The Lieutenant says the day they answer, we go home. Nobody asks her where home is.' },
  hold_vault: { title: 'LIEUTENANT\'S ORDERS', paper: true, code: 'vault', text: 'The vault stays shut until the mountain calls. If I fall, the code is {code}. Open it for the country, not for yourselves.' },
  // an abandoned bunker
  bunker_last: { title: 'NOTE ON THE DOOR', paper: true, text: 'Last one out, kill the lights. We went north for the trucks. If we are not back by the first frost we are not coming back. Feed the dog. Sgt. D. Abara' },
  bunker_fuel: { title: 'GENERATOR CARD', paper: true, text: 'Day tank first, then the choke, then crank till she catches. Lights and the stores keypad come back with her. Do not run her with the door shut.' },
  bunker_vault: { title: 'DUTY OFFICER', paper: true, code: 'vault', text: 'Vault combination for the relief crew: {code}. The relief crew never came. I am writing it down anyway, in case you are them.' },
  // a keypad nobody else wrote the code for: somebody always does
  armory_card: { title: 'CARD IN A LOCKER', paper: true, code: 'armory', text: 'Arms room combination, changed monthly, last changed I do not know when: {code}. Sign the book when you draw a weapon. Nobody signs the book.' },
  // service tunnels
  tunnel_chalk: { title: 'CHALK ON THE WALL', paper: true, text: 'ARROWS = WE CAME BACK. NO ARROW = WE DIDN\'T. KEEP LEFT AT THE PUMPS. DON\'T WAKE THE ONES IN THE SUMP.' },
  tunnel_pump: { title: 'PUMP HOUSE LOG', paper: true, text: 'Water in the sump to the second rung and rising. Pumps on the generator. If the generator goes, so does the lower tunnel. It went.' },
  // caves
  cave_chalk: { title: 'SCRATCHED IN THE ROCK', paper: true, text: 'Chalk arrows mean we came back. No arrow means we didn\'t. The Okafor party, five of us, one lamp.' },
  cave_air: { title: 'A WET NOTEBOOK', paper: true, text: 'The air moves down here. Somewhere the hill breathes. Follow it and you find water, or the things that drink it.' },
  cave_roof: { title: 'A TORN PAGE', paper: true, text: 'Do not shoot near the cracked roof by the big pool. Whitey did. We dug for two days and only found his boots.' },
  // PROJECT LULLABY
  lull_orientation: { title: 'ORIENTATION', text: 'PROJECT LULLABY. Volunteers sleep through the exchange and the ten years after. Cold beds, slow blood, a drip that does the eating. You wake to a cleaner country. Sign at the bottom.' },
  lull_fuel: { title: 'FUEL LOG', paper: true, text: 'Main tank forty percent. Day tank dry. Pump by hand into the day tank, then crank. The lift and the lights come back with her.' },
  lull_nurse: { title: 'NIGHT NURSE, WARD C', text: 'The drip ran dry in the third outage. We woke them by hand. They do not know their names. They do not stop walking. Ward C is sealed. Do not open Ward C.' },
  lull_memo: { title: 'DIRECTOR\'S MEMO', text: 'The board asks why the waking rate is zero. Tell the board the sleepers are awake. Tell them they are hungry. Then cut the line.' },
  lull_override: { title: 'TAPED UNDER THE DESK', paper: true, code: 'ward', text: 'Ward C override: {code}. Burn this. If you have not burned this, at least do not use it.' },
  // THE SEED LIBRARY
  seed_welcome: { title: 'VISITOR PLAQUE', paper: true, text: 'THE SEED LIBRARY. Eleven thousand kinds of everything that grows, kept at eighteen below. If the power holds, the country can be planted twice.' },
  seed_fuel: { title: 'PLANT NOTES', paper: true, text: 'Generator on the second level. Crank it and the cold rooms and the lift wake up. The cold rooms need it more than you do.' },
  seed_cold: { title: 'KEEPER\'S LOG', text: 'The cold went at day three hundred. The packets are still good if they stayed dry. One of us stayed in the deep cold to keep the door. He is still keeping it.' },
  seed_north: { title: 'LAST ENTRY', text: 'Take them north. Plant them where it still rains. Do not sell them to the first man with a gun. Sell them to the second, he will have learned something.' },
  seed_override: { title: 'KEY CARD SLEEVE', paper: true, code: 'cold', text: 'Deep cold, keeper\'s code {code}. He will not answer to his name now.' },
  // THE CLOUD FARM
  cloud_41: { title: 'TEST 41', text: 'Seeded the cell over the valley at dawn. Rain fell at noon. It fell green. Recommend dilution. Recommend gloves.' },
  cloud_fuel: { title: 'SHIFT CARD', paper: true, text: 'Generator, level two. Day tank, choke, crank. The towers do not need us: they run on the roof cells. Only the doors and the lift do.' },
  cloud_112: { title: 'TEST 112', text: 'We can make it rain on a city now. We can make it burn when it lands. They said that was the point. I said I thought the point was the farms.' },
  cloud_breaker: { title: 'A NOTE PINNED TO A BREAKER', paper: true, text: 'If the storms are still coming when you read this, the towers are still seeding. The kill switch is in the storm cell. Pull it. Then run.' },
  cloud_override: { title: 'CELL ACCESS', paper: true, code: 'cell', text: 'Storm cell, maintenance code {code}. Two people, suits on, never alone.' },
  // THE LISTENING ROOM
  listen_tone: { title: 'PROGRAMME BRIEF', text: 'THE LISTENING ROOM. A tone that turns a crowd. Pitched right, a stadium walks where you tell it and thanks you after.' },
  listen_fuel: { title: 'TECH CARD', paper: true, text: 'Power from the generator on two. The array runs on its own cells. It never needed us. It only needed listeners.' },
  listen_hum: { title: 'SUBJECT NOTES', text: 'The subjects follow the tone now even when it is off. They hum it back to us. They hum it to each other in the dark.' },
  listen_answer: { title: 'SCRAWLED ON A CONSOLE', paper: true, text: 'Something in the deep chamber is still humming. Do not answer it. Do not hum along. You will want to.' },
  listen_override: { title: 'CHAMBER CODE', paper: true, code: 'deep', text: 'Deep chamber: {code}. Earplugs in the drawer. Use them.' },
};
// The holdout's own (it is in the bunker under Outpost Nine).
export const HOLDOUT_LOGS = ['hold_watch', 'hold_quarter', 'hold_radio', 'hold_vault'];
// The log that teaches a keypad group's code when nothing else on the site does.
export const CODE_LOGS = { armory: 'armory_card', vault: 'bunker_vault' };

// ---- what is in the boxes ----------------------------------------------------------------------------------------------
// LOOT rows (data/items.js shape: rolls, none, rows of [item, weight, min, max]); systems/underground.js registers them
// into LOOT at boot, so the inventory rolls them like any other table. The armory has guns.
export const UG_LOOT = {
  ug_armory: { rolls: [2, 4], none: 1, rows: [['gun_rifle', 3, 1, 1], ['gun_smg', 2, 1, 1], ['gun_pump', 1, 1, 1], ['ammo_rifle', 6, 20, 60], ['ammo_smg', 3, 20, 60], ['ammo_shells', 2, 6, 14], ['cleaning_kit', 2, 1, 1]] },
  ug_guard: { rolls: [1, 2], none: 3, rows: [['ammo_rifle', 3, 6, 20], ['bandage', 3, 1, 2], ['jerky', 2, 1, 2], ['flare', 2, 1, 2], ['lockpicks', 1, 1, 1], ['photograph', 1, 1, 1]] },
  ug_bunks: { rolls: [1, 2], none: 4, rows: [['ration', 3, 1, 1], ['canteen', 2, 1, 1], ['photograph', 3, 1, 1], ['wristwatch', 1, 1, 1], ['bedroll', 1, 1, 1], ['ammo_pistol', 2, 6, 18], ['flare', 1, 1, 1]] },
  ug_mess: { rolls: [1, 3], none: 2, rows: [['ration', 4, 1, 2], ['beans_tin', 4, 1, 3], ['peaches_tin', 2, 1, 2], ['water_can', 1, 1, 1], ['can_opener', 2, 1, 1], ['coffee', 2, 1, 1]] },
  ug_gen: { rolls: [1, 3], none: 2, rows: [['fuel_can', 4, 1, 1], ['wrench', 3, 1, 1], ['duct_tape', 2, 1, 1], ['spark_plugs', 2, 1, 2], ['scrap', 3, 1, 3], ['crowbar', 1, 1, 1]] },
  ug_comms: { rolls: [1, 2], none: 3, rows: [['road_atlas', 2, 1, 1], ['photograph', 2, 1, 1], ['wristwatch', 1, 1, 1], ['flare', 2, 1, 1], ['lockpicks', 1, 1, 1]] },
  ug_office: { rolls: [1, 2], none: 3, rows: [['photograph', 3, 1, 1], ['painkillers', 2, 1, 1], ['wristwatch', 1, 1, 1], ['gold_ring', 1, 1, 1], ['lockpicks', 1, 1, 1], ['coffee', 1, 1, 1]] },
  ug_vault: { rolls: [3, 5], none: 0, rows: [['gun_rifle', 2, 1, 1], ['ammo_rifle', 4, 30, 90], ['first_aid', 3, 1, 1], ['antibiotics', 3, 1, 3], ['ration', 3, 2, 4], ['ruck', 1, 1, 1], ['gold_ring', 2, 1, 3]] },
  ug_med: { rolls: [1, 3], none: 2, rows: [['bandage', 4, 1, 3], ['antibiotics', 2, 1, 1], ['suture_kit', 2, 1, 1], ['painkillers', 3, 1, 1], ['first_aid', 1, 1, 1], ['rag', 2, 1, 3]] },
  ug_stores: { rolls: [1, 3], none: 2, rows: [['ration', 3, 1, 2], ['water_can', 1, 1, 1], ['canteen', 2, 1, 1], ['duct_tape', 2, 1, 1], ['scrap', 2, 1, 3], ['fuel_can', 1, 1, 1], ['bedroll', 1, 1, 1], ['flare', 2, 1, 2]] },
  ug_lab: { rolls: [1, 2], none: 3, rows: [['antibiotics', 2, 1, 2], ['painkillers', 2, 1, 1], ['first_aid', 1, 1, 1], ['photograph', 1, 1, 1], ['duct_tape', 1, 1, 1], ['suture_kit', 1, 1, 1]] },
  ug_seeds: { rolls: [2, 4], none: 1, rows: [['flatbread', 1, 1, 1], ['ration', 3, 1, 2], ['honey', 2, 1, 2], ['water_can', 1, 1, 1], ['gold_ring', 1, 1, 1]] },
  ug_cave: { rolls: [1, 2], none: 3, rows: [['flare', 3, 1, 2], ['rag', 3, 1, 2], ['canteen', 1, 1, 1], ['jerky', 2, 1, 2], ['knife', 1, 1, 1], ['photograph', 1, 1, 1], ['wristwatch', 1, 1, 1]] },
  ug_nest: { rolls: [2, 3], none: 1, rows: [['gold_ring', 2, 1, 2], ['wristwatch', 2, 1, 1], ['photograph', 3, 1, 1], ['ammo_pistol', 2, 4, 12], ['knife', 1, 1, 1], ['dog_collar', 1, 1, 1]] },
  drone: { rolls: [1, 2], none: 0, rows: [['scrap', 5, 2, 4], ['spark_plugs', 2, 1, 2], ['duct_tape', 1, 1, 1]] },
};

// ---- who lives down there ----------------------------------------------------------------------------------------------
// The Remnant holdout (a bunker row with holdout: true): soldiers at posts by room, a patrol on the corridor, a drone that
// flies one corridor end to end. warn: seconds between the challenge and the shooting (unless you are friendly with them).
// drone: hp, pace (m/s), how far it sees in its beam, its burst; the gun is the SMG's row at drone strength.
export const HOLDOUT = {
  posts: { guard: 2, comms: 1, armory: 1, mess: 1, command: 1, generator: 1 }, patrol: 1, warn: 5, hail: 'HALT. THIS LEVEL IS CLOSED.', hailOk: 'Move along, friend. Mind the bird.',
  drone: { hp: 55, pace: 2.4, beam: 13, cone: 32, dmg: 8, spread: 0.09, range: 24, burst: 4, rate: 0.11, rest: 1.1, alt: 1.75 },
};

// ---- the sites -------------------------------------------------------------------------------------------------------
// Authored sites near Phoenix (x, z: the entrance's top, world metres; dir: which way the entrance stair goes down - N E S
// W; on the island they sit on ground surveyed clear). Every atlas site with a sealed place under it, and every one of the
// fifty state bases, gets a site too (underSites below), placed on clear ground near its atlas point when you come close.
export const LOCAL_SITES = [
  { id: 'outpost9_deep', name: 'OUTPOST NINE · DOWNSTAIRS', kind: 'bunker', entrance: 'hatch', x: -285.5, z: -401.0, dir: 'W', levels: 2, holdout: 'remnant', base: 'outpost9', power: true, fuel: 0.8, seed: 9009,
    note: 'the Federal Remnant\'s holdout under its own outpost: the real garrison lives down here' },
  { id: 'redrock_cave', name: 'RED ROCK CAVE', kind: 'cave', entrance: 'mouth', x: -60.5, z: 347.5, dir: 'S', levels: 2, seed: 4471,
    note: 'a cave under the mesa south of Rust Haven: chambers, a pool, a cracked roof, a nest' },
  { id: 'the_lull', name: 'THE LULL', kind: 'facility', entrance: 'lift', x: 280.5, z: -280.5, dir: 'S', levels: 3, project: 'lullaby', power: false, fuel: 0.0, seed: 7313,
    note: 'a secret sleep ward under the Glass Flats: dead power, a freight lift, Ward C' },
];

// The atlas's sealed places (data/atlas.js ATLAS_SITES: a station, a depot, a lab, or a bunker or tunnel fight) and the
// fifty state bases, as underground sites. kind by the atlas row; a lab's project by a hash of its id. The entrance sits
// at the atlas point (moved to clear ground when you first come near: systems/underground.js place()).
const PROJECT_IDS = Object.keys(PROJECTS);
export function underSites(atlas) {
  const out = [];
  if (!atlas) return out;
  const h = (s) => { let v = 2166136261; for (let i = 0; i < s.length; i++) { v ^= s.charCodeAt(i); v = Math.imul(v, 16777619); } return v >>> 0; };
  for (const S of atlas.ATLAS_SITES ?? []) {
    const xz = atlas.ATLAS_XZ?.sites?.[S.id];
    if (!xz) continue;
    const sealed = S.kind === 'station' || S.kind === 'depot' || S.kind === 'lab' || S.situation === 'bunker_clear' || S.situation === 'tunnel_fight';
    if (!sealed) continue;
    const kind = S.kind === 'lab' ? 'facility' : S.situation === 'tunnel_fight' ? (S.biome === 'urban' ? 'tunnels' : 'cave') : 'bunker';
    const seed = h(S.id);
    out.push({ id: `atlas_${S.id}`, name: S.name, kind, entrance: kind === 'cave' ? 'mouth' : kind === 'tunnels' ? 'culvert' : kind === 'facility' ? 'lift' : 'hatch',
      x: xz[0], z: xz[1], dir: 'NESW'[seed % 4], levels: kind === 'facility' ? 3 : kind === 'cave' ? 1 + (seed % 2) : 2, project: kind === 'facility' ? PROJECT_IDS[seed % PROJECT_IDS.length] : undefined,
      power: false, fuel: (seed >>> 8) % 3 === 0 ? 0.6 : 0, seed, atlas: S.id, place: true, holder: S.holder });
  }
  for (const B of atlas.ATLAS_BASES ?? []) {
    const xz = atlas.ATLAS_XZ?.bases?.[B.id];
    if (!xz) continue;
    const seed = h(B.id);
    out.push({ id: `base_${B.id}`, name: `${B.name.toUpperCase()} · BELOW`, kind: 'bunker', entrance: 'hatch', x: xz[0], z: xz[1], dir: 'NESW'[seed % 4], levels: 2,
      holdout: B.dsoa === 'remnant' ? 'remnant' : undefined, power: B.dsoa === 'remnant' || B.dsoa === 'automated', fuel: B.dsoa === 'abandoned' ? 0 : 0.5, seed, base: B.id, place: true, holder: B.holder });
  }
  return out;
}

// ---- the check the World Forge's SITE tab runs ----------------------------------------------------------------------
// items: data/items.js ITEMS (the loot rows name real items). Returns a list of problems (empty: every row is sound).
export function validateUnderground(sites, items = null) {
  const bad = [], ids = new Set();
  const room = (r, where) => { if (!ROOMS[r]) bad.push(`${where}: no room "${r}"`); };
  for (const [k, K] of Object.entries(KINDS)) {
    if (!(K.size[0] >= 20 && K.size[1] <= 60 && K.size[0] <= K.size[1])) bad.push(`kind ${k}: size ${K.size} must sit within 20..60 m (the probe's window)`);
    for (const [i, P] of (K.programme ?? []).entries()) for (const r of P) room(r, `kind ${k} level ${i + 1}`);
    for (const L of K.logs ?? []) if (!LOGS[L]) bad.push(`kind ${k}: no log "${L}"`);
  }
  for (const [k, P] of Object.entries(PROJECTS)) {
    for (const rs of P.rooms) for (const r of rs) room(r, `project ${k}`);
    room(P.sealed.room, `project ${k} sealed`);
    for (const L of P.logs) if (!LOGS[L]) bad.push(`project ${k}: no log "${L}"`);
    if (!P.logs.some((L) => LOGS[L]?.code === P.sealed.seal)) bad.push(`project ${k}: no log teaches the sealed door's code (${P.sealed.seal})`);
  }
  for (const [k, R] of Object.entries(ROOMS)) {
    for (const [p] of R.props) if (!PROPS[p]) bad.push(`room ${k}: no prop "${p}"`);
    if (R.loot && !UG_LOOT[R.loot]) bad.push(`room ${k}: no loot table "${R.loot}"`);
    if (!(R.w[0] >= 3 && R.d[0] >= 3)) bad.push(`room ${k}: smaller than 3 m`);
  }
  for (const L of HOLDOUT_LOGS) if (!LOGS[L]) bad.push(`holdout: no log "${L}"`);
  for (const [k, L] of Object.entries(LOGS)) {
    if (!L.title || !L.text) bad.push(`log ${k}: title and text`);
    if (L.code && !L.text.includes('{code}')) bad.push(`log ${k}: teaches ${L.code} but never says {code}`);
    if (L.text.length > 320) bad.push(`log ${k}: ${L.text.length} chars (keep a log to a breath: 320)`);
  }
  if (items) for (const [k, T] of Object.entries(UG_LOOT)) for (const [id] of T.rows) if (!items[id]) bad.push(`loot ${k}: no item "${id}"`);
  for (const s of sites) {
    if (!s.id || ids.has(s.id)) bad.push(`site ${s.id}: missing or duplicate id`);
    ids.add(s.id);
    if (!KINDS[s.kind]) { bad.push(`site ${s.id}: no kind "${s.kind}"`); continue; }
    if (!ENTRANCES[s.entrance]) bad.push(`site ${s.id}: no entrance "${s.entrance}"`);
    if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) bad.push(`site ${s.id}: x, z`);
    if (!'NESW'.includes(s.dir) || s.dir.length !== 1) bad.push(`site ${s.id}: dir must be N, E, S or W`);
    const K = KINDS[s.kind];
    if (!(s.levels >= 1 && s.levels <= 3)) bad.push(`site ${s.id}: levels 1..3`);
    if (K.built && s.levels > K.programme.length) bad.push(`site ${s.id}: ${s.levels} levels but kind ${s.kind} has ${K.programme.length} programmes`);
    if (s.kind === 'facility' && !PROJECTS[s.project]) bad.push(`site ${s.id}: a facility needs a project (${Object.keys(PROJECTS).join(', ')})`);
    if (ENTRANCES[s.entrance]?.lift && !K.built) bad.push(`site ${s.id}: a lift needs a built kind`);
  }
  return bad;
}
