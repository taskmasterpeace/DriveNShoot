// GADGETS, TRAPS AND TOWN SECURITY as rows (docs/design/WEB_GADGETS.md). systems/gadgets.js carries every row out;
// systems/drones.js flies the DRONES rows; systems/security.js runs the SECURITY rows (the PAPER LADDER).
// Our own names and words: no brand, no borrowed unit names (a crawler mine, never a franchise's).
//
// A gadget row:
//   name      what the HUD and the pack call it
//   item      { kg, bulk, value, stack, desc } -> folded into data/items.js ITEMS as kind 'gadget' (use: act 'gadget')
//   source    { craft: [[item id, n], ...], buy: scrip at a trader or the security quartermaster, loot: where it turns up }
//   verb      'throw' (an arc to the aim point, systems/throwables.js physics) | 'place' (at your feet, a stride ahead,
//             facing your aim) | 'attach' (onto the car or door in reach)
//   arm       seconds after it lands before it can go off (a mine you just set does not take your own foot)
//   trigger   'tyre' (a wheel over it) | 'pressure' (a foot or a wheel) | 'wire' (a body crosses its line) | 'hunt' (it goes
//             looking) | 'timer' | 'remote' (the detonate key / command) | 'touch' (a hand on what it is fixed to) |
//             'impact'
//   effect    what it does when it goes: blast { r, dmg, car }, cone { r, deg, dmg }, tyres (how many), lure { r, dur },
//             light { r, dur }, smoke { r, dur }, gas { r, dur, dps, blind }, noise (radius), breach (a door)
//   hurts     who it can hurt: 'all' (friendly fire on: yours, your crew, you) - every row here is 'all' but the lures
//   notice    how the AI notices it: spot (m in daylight, a third of it at night; drivers swerve or brake inside it),
//             tell (the faint sign a careful eye picks out, shown on the PACK screen and in `gadget` views)
//   pickup    true: walk over it and hold E to take it back while it is not spent (a chain, a strip, bells)
export const GADGETS = {
  road_chain: {
    name: 'Road chain', verb: 'throw', arm: 0.6, trigger: 'tyre', len: 7, wid: 0.5, pickup: true,
    effect: { tyres: 2, drag: 0.55 }, hurts: 'all', notice: { spot: 24, tell: 'a dark line of links across the road' },
    item: { kg: 6.5, bulk: 3.5, value: 45, stack: 1, desc: 'Fifteen feet of tow chain wrapped with welded spikes. Swing it across a lane and it eats tyres.' },
    source: { craft: [['scrap', 3], ['duct_tape', 1]], buy: 45, loot: 'garages, checkpoints' },
  },
  spike_strip: {
    name: 'Spike strip', verb: 'throw', arm: 0.4, trigger: 'tyre', len: 4.6, wid: 0.35, pickup: true,
    effect: { tyres: 4 }, hurts: 'all', notice: { spot: 16, tell: 'a flat black strip, teeth up' },
    item: { kg: 4.2, bulk: 2.5, value: 60, stack: 1, desc: 'An accordion of hollow teeth on a plastic spine. Unfolds across a lane in one throw.' },
    source: { craft: [['scrap', 2], ['knife', 1]], buy: 60, loot: 'the security station, patrol cars' },
  },
  // The same object the workshop's MINE DROPPER loads (data/workshop.js AMMO_ITEMS car_mine): one item id, one row in the
  // pack. Here it is buried by hand; there it drops off a car's tail. Its item fields match the workshop's row.
  car_mine: {
    name: 'Car mine', verb: 'place', arm: 3, trigger: 'pressure', r: 0.85, buried: true,
    effect: { blast: { r: 5.5, dmg: 230, car: 420 } }, hurts: 'all', notice: { spot: 3.2, tell: 'a fist of disturbed earth, a prong' },
    item: { kind: 'ammo', kg: 6, bulk: 3, stack: 4, value: 55, tags: ['car_ammo', 'gadget'], desc: 'A pressure plate on a cake tin of explosive. Bury it where the wheels go, or load it in a mine dropper. Do not step on it either.' },
    source: { craft: [['scrap', 2], ['fuel_can', 1], ['spark_plugs', 1]], buy: 55, loot: 'military caches, the workshop counter' },
  },
  fan_mine: {
    name: 'Fan mine', verb: 'place', arm: 4, trigger: 'wire', wire: 3.2, r: 0.5,
    effect: { cone: { r: 15, deg: 60, dmg: 190 } }, hurts: 'all', notice: { spot: 5, tell: 'a curved green box on legs, a wire at shin height' },
    item: { kg: 1.6, bulk: 1, value: 140, stack: 2, desc: 'A curved box of ball bearings on scissor legs. FRONT TOWARD THE ROAD, it says, in our own stencil.' },
    source: { craft: [['scrap', 2], ['ammo_shells', 12], ['fuel_can', 1]], buy: 140, loot: 'military caches' },
  },
  crawler_mine: {
    name: 'Crawler mine', verb: 'place', arm: 1.5, trigger: 'hunt', hunt: 22, speed: 5.2, life: 45, r: 0.9,
    effect: { blast: { r: 4, dmg: 240, car: 260 } }, hurts: 'all', notice: { spot: 12, tell: 'a ticking spider of scrap legs' },
    item: { kg: 2.2, bulk: 1.6, value: 220, stack: 1, desc: 'A charge on six scrap legs and a cheap eye. Set it down; it walks to the nearest thing that hates you and sits on it.' },
    source: { craft: [['scrap', 3], ['spark_plugs', 2], ['fuel_can', 1]], buy: 220, loot: 'military caches, the Remnant' },
  },
  noise_maker: {
    name: 'Noise box', verb: 'throw', arm: 0, trigger: 'timer', fuse: 1,
    effect: { lure: { r: 70, dur: 22 } }, hurts: 'none', notice: { spot: 30, tell: 'a clacking tin box' },
    item: { kg: 0.5, bulk: 0.4, value: 20, stack: 3, desc: 'A wind-up clacker in a tin. Twenty seconds of racket that every dead thing in a block walks toward.' },
    source: { craft: [['scrap', 1], ['wristwatch', 1]], buy: 20, loot: 'houses' },
  },
  bottle_lure: {
    name: 'Bottle', verb: 'throw', arm: 0, trigger: 'impact',
    effect: { noise: 38, lure: { r: 38, dur: 6 } }, hurts: 'none', notice: { spot: 0, tell: 'broken glass' },
    item: { kg: 0.4, bulk: 0.5, value: 1, stack: 4, desc: 'An empty bottle. Throw it where you want them to look.' },
    source: { craft: [['rotgut', 1]], buy: 1, loot: 'everywhere' },
  },
  signal_flare: {
    name: 'Signal flare', verb: 'throw', arm: 0, trigger: 'timer', fuse: 0.3,
    effect: { light: { r: 16, dur: 45 }, lure: { r: 45, dur: 45 } }, hurts: 'none', notice: { spot: 120, tell: 'red fire you see a mile off' },
    item: { kg: 0.3, bulk: 0.25, value: 10, stack: 6, desc: 'A long-burning red flare. Lights a street at night; every eye and every dead thing turns to it.' },
    source: { craft: [['flare', 2]], buy: 10, loot: 'cars, the security station' },
  },
  smoke_canister: {
    name: 'Smoke canister', verb: 'throw', arm: 0, trigger: 'timer', fuse: 1.2,
    effect: { smoke: { r: 8.5, dur: 26 } }, hurts: 'none', notice: { spot: 40, tell: 'a hissing can' },
    item: { kg: 0.6, bulk: 0.5, value: 25, stack: 3, desc: 'A fat grey can. A street of smoke for half a minute: nobody sees through it, you included.' },
    source: { craft: [['rag', 2], ['fuel_can', 1]], buy: 25, loot: 'the security station, the Remnant' },
  },
  gas_can: {
    name: 'Choke gas', verb: 'throw', arm: 0, trigger: 'timer', fuse: 1.2,
    effect: { smoke: { r: 6.5, dur: 18 }, gas: { r: 6.5, dur: 18, dps: 4, blind: 1.2 } }, hurts: 'all', notice: { spot: 30, tell: 'a yellow-banded can' },
    item: { kg: 0.6, bulk: 0.5, value: 45, stack: 3, desc: 'A banded can of something that burns the eyes and the throat. People in it cough, stumble and shoot wide.' },
    source: { craft: [['rotgut', 1], ['painkillers', 1], ['rag', 1]], buy: 45, loot: 'the security station' },
  },
  remote_charge: {
    name: 'Remote charge', verb: 'place', arm: 1, trigger: 'remote', r: 0.4,
    effect: { blast: { r: 6.5, dmg: 250, car: 380 } }, hurts: 'all', notice: { spot: 6, tell: 'a taped brick with a blinking eye' },
    item: { kg: 1.4, bulk: 0.9, value: 160, stack: 3, desc: 'A brick of charge taped round a radio receiver. Set it, walk away, press the button.' },
    source: { craft: [['scrap', 1], ['fuel_can', 1], ['spark_plugs', 1], ['duct_tape', 1]], buy: 160, loot: 'military caches' },
  },
  breach_charge: {
    name: 'Breach charge', verb: 'attach', arm: 0, trigger: 'timer', fuse: 3,
    effect: { breach: true, blast: { r: 2.6, dmg: 70, car: 60 } }, hurts: 'all', notice: { spot: 5, tell: 'a strip of charge on a door' },
    item: { kg: 0.9, bulk: 0.6, value: 90, stack: 3, desc: 'A frame of cord charge you press to a door. Three seconds, then it is not a door.' },
    source: { craft: [['scrap', 1], ['fuel_can', 1], ['duct_tape', 1]], buy: 90, loot: 'the security station' },
  },
  car_alarm: {
    name: 'Car alarm', verb: 'attach', arm: 2, trigger: 'touch', r: 2.6,
    effect: { noise: 70, wail: 14, lure: { r: 90, dur: 14 } }, hurts: 'none', notice: { spot: 4, tell: 'a blinking eye under the dash' },
    item: { kg: 0.8, bulk: 0.5, value: 35, stack: 2, desc: 'A siren and a motion box off a dead sedan, wired to a battery. Stick it in a car you want to come back to.' },
    source: { craft: [['scrap', 1], ['spark_plugs', 1]], buy: 35, loot: 'cars' },
  },
  tripwire_bells: {
    name: 'Tripwire bells', verb: 'place', arm: 1, trigger: 'wire', wire: 4.5, pickup: true, rearm: 2,
    effect: { noise: 26, alert: true }, hurts: 'none', notice: { spot: 2.8, tell: 'a thread at ankle height, tin bells' },
    item: { kg: 0.3, bulk: 0.3, value: 8, stack: 4, desc: 'Fishing line and a string of tin bells. Strung across a door or a gap, it tells you who came.' },
    source: { craft: [['rag', 1], ['silverware', 1]], buy: 8, loot: 'houses' },
  },
};

export const GADGET_ORDER = Object.keys(GADGETS);

// Drones: launched from the pack (data/items.js rows below), flown with WASD while your body stays put.
//   battery seconds of flight · speed m/s · range m from the pilot before the signal goes (weak past `weak` of it) ·
//   alt metres it flies at (fauna and birds' aim rules: shot at like any flier) · hp · mark radius it tags enemies in ·
//   bombs it carries (the bomb variant) · bomb: what one drop does
export const DRONES = {
  scout: { name: 'Scout drone', battery: 150, speed: 15, boost: 1.6, range: 160, weak: 0.8, alt: 9, hp: 30, mark: 38, markEvery: 0.5, bombs: 0, recharge: 60,
    item: { kg: 1.8, bulk: 3, value: 260, stack: 1, desc: 'Four rotors, a cracked camera, a battery that remembers better days. It sees what you cannot and tells on them.' },
    source: { craft: [['scrap', 2], ['spark_plugs', 2], ['wristwatch', 1]], buy: 260, loot: 'the Remnant, the security station' } },
  bomber: { name: 'Drop drone', battery: 110, speed: 12, boost: 1.4, range: 140, weak: 0.8, alt: 11, hp: 40, mark: 30, markEvery: 0.5, bombs: 3, recharge: 80,
    bomb: { r: 4.5, dmg: 180, car: 220, fall: 0.6 },
    item: { kg: 3.2, bulk: 4.5, value: 420, stack: 1, desc: 'A heavier frame with a claw under it that lets go of three pipe charges. Loud. Slow. Worth it.' },
    source: { craft: [['scrap', 4], ['spark_plugs', 2], ['fuel_can', 1], ['wristwatch', 1]], buy: 420, loot: 'the Remnant' } },
};

// THEIR drones (systems/drones.js foes): flown at you by someone else, off a car or a camp, never by the player.
//   hp what a round takes off (a pistol hits 38) · speed m/s · alt metres · orbit the circle it holds over what it
//   watches · sight how far it sees you (not in smoke) · call: every callEvery s it tells its own side within `call` m
//   where you are · life seconds before it turns for home · bombs / bombEvery / bomb: a drop drone's load
export const FOE_DRONES = {
  spotter: { name: 'Tracer spotter', hp: 50, speed: 13, alt: 10, orbit: 7, sight: 45, call: 80, callEvery: 1.5, life: 90, bombs: 0, look: '#4a4e44' },
  dropper: { name: 'Raider drop drone', hp: 70, speed: 11, alt: 11, orbit: 1.5, sight: 40, call: 0, callEvery: 0, life: 75, bombs: 2, bombEvery: 4,
    bomb: { r: 3.6, dmg: 110, car: 160, fall: 0.6 }, look: '#6a4a2e' },
};

// Against them: a round passing under one (2D, within shotR m of it) hits on shotHit of the time; a lit signal flare
// within flareR m pulls it off you (it circles the flare and drops what it carries there); smoke you stand in hides you
// from it (it circles where it last saw you). scrap: what one shot down leaves on the ground.
export const ANTI_DRONE = { shotR: 1.0, shotHit: 0.5, flareR: 32, scrap: 2 };

// THE BAY DRONE (systems/drones.js outrider): it rides a DRONE BAY on the car (data/workshop.js UTILITY.dronebay) and
// flies itself. Backslash sends it up and calls it home. It holds `lead` m ahead of the car along its heading (circles
// `orbit` m out while the car is parked), marks enemies inside `mark` m every `markEvery` s, and comes home past `range`
// m from the car or under `low` of its battery. Docked, it charges `charge` per second. Shot down, the bay stays empty
// until a `refill` from your pack goes in (Backslash again).
export const BAY_DRONE = { name: 'Outrider', battery: 120, speed: 24, alt: 8, lead: 25, orbit: 12, range: 90, low: 0.15, mark: 34, markEvery: 0.5, hp: 30, charge: 2, refill: 'drone_scout', look: '#4a3a22' };

// Things the security lane carries and drops: keys open the doors they belong to (`door` on the slot, or any door of a
// building `kind`), the bulls carry a ring; planks and a wedge barricade a door from inside.
export const DOOR_KIT = {
  door_key: { name: 'Door key', kind: 'tool', use: { act: 'keys' }, kg: 0.02, bulk: 0.02, stack: 1, value: 4, desc: 'A brass key on a tag. Somewhere there is a door it fits.' },
  key_ring: { name: 'Bull\'s key ring', kind: 'tool', use: { act: 'keys' }, kg: 0.15, bulk: 0.05, stack: 1, value: 40, tags: ['keys'], desc: 'A security man\'s ring of keys. Opens and locks the town\'s doors, quietly.' },
  planks: { name: 'Planks', kind: 'part', use: { act: 'barricade' }, kg: 6, bulk: 6, stack: 4, value: 6, tags: ['planks'], desc: 'Three lengths of board and a fistful of nails. Enough to bar one door.' },
  door_wedge: { name: 'Door wedge', kind: 'part', use: { act: 'wedge' }, kg: 0.2, bulk: 0.1, stack: 3, value: 3, tags: ['wedge'], desc: 'A rubber wedge. Kicked under a door it holds against a shove, not against a boot.' },
};

// Doors you hold shut (systems/gadgets.js barricade; systems/interiors.js keeps the lock). hp is added to the door's lock
// (what a boot, a shoulder or the infected's fists have to take off before it gives); kicks are added kicks; time is how
// long the work takes; noise is how far the hammering carries; needs: what you must carry (spent on use).
export const BARRICADES = {
  wedge: { name: 'wedged', hp: 25, kicks: 1, time: 0.8, noise: 4, needs: 'door_wedge' },
  planks: { name: 'barred with planks', hp: 300, kicks: 3, time: 4.5, noise: 32, needs: 'planks' },
  furniture: { name: 'barricaded with furniture', hp: 420, kicks: 4, time: 6, noise: 22, needs: null }, // whatever is in the room
};

// THE PAPER LADDER: who answers, by the wanted stars and what the town saw (docs/design/WEB_GADGETS.md §5).
//   stars    the wanted level that brings this tier · cars: patrol cars sent · foot: officers on foot per car ·
//   weapons  their guns (shares) · hp · roadblock: they chain the road ahead of you · follow: they cross county lines ·
//   arrest   they offer you the cuffs first (hands up, holstered) instead of shooting
export const SECURITY_TIERS = {
  bulls: { name: 'Town bulls', stars: 1, cars: 1, foot: 2, weapons: { pistol: 0.5, shotgun: 0.5 }, hp: 110, arrest: true, roadblock: false, follow: false, leash: 220 },
  posse: { name: 'County posse', stars: 3, cars: 2, foot: 2, weapons: { smg: 0.6, shotgun: 0.4 }, hp: 130, arrest: true, roadblock: true, follow: false, leash: 420 },
  tracers: { name: 'Skip tracers', stars: 5, cars: 1, foot: 2, weapons: { smg: 0.5, rifle: 0.5 }, hp: 150, arrest: false, roadblock: false, follow: true, leash: 2000 },
};

// The settlement's security: one row per town that keeps bulls. station: where the house stands (cities lane:
// building kind `security_station` with a garage; the stub placement is used until it lands). patrol: the loop the
// car drives (offsets from the station), the foot beat; fine: scrip a star; jail: game hours a star.
export const SECURITY = {
  rust_haven: {
    name: 'Rust Haven Security', faction: 'rusthaven', look: 'warden', station: { kind: 'security_station', stub: { x: -44, z: 40, rot: 0 } },
    patrol: [[0, 0], [60, 0], [60, -80], [-30, -80], [-30, 0]], beat: 3, fine: 40, jail: 6,
    car: { type: 'bullcar', paint: '#6e6a5e' },
  },
};

// The run-down look of a patrol car (systems/vehiclebodies.js reads s.look): mismatched panels, primer, a dead lightbar
// with a lens gone, a welded ram bar, dents put in at the station's own expense.
export const RUNDOWN = {
  primer: '#7d7a70', panels: ['#8c6a3a', '#5b6a5e', '#9a8f78', '#6e3a24'], rust: '#6a3a1e',
  dents: [['front', 0.35], ['left', 0.25], ['rear', 0.2]],
};

// ======================================================================================================================
// GADGETS-2: THE KIT YOU WEAR AND LOOK THROUGH (docs/design/WEB_GADGETS2.md; systems/kit.js carries every row out).
// Robert (2026-10-29): "Nothing clean or military-new: everything rebuilt, taped together and running on batteries you
// have to find." So every powered piece drinks CELLS (found, never regenerated: law 2), the mask drinks FILTERS, and
// nothing here knows anything its owner did not see, hear on a real broadcast, or smell through a real dog (law 6).
//
// A KIT row (an item of kind 'kit', use act 'kit': the PACK screen switches it on and off):
//   name, item       as GADGETS (folded into data/items.js ITEMS)
//   slot             'eyes' (one optic at a time: nvg | thermal) | 'glass' (held to the eye: binoculars | scope) |
//                    'beam' (one light: flashlight | headlamp) | 'ears' (the scanner) | 'face' (the mask)
//   power            { cell: item that feeds it, life: seconds of use one cell gives } (null: needs nothing)
//   the rest         the slot's own numbers (below, per row)
// Only things you CARRY work: a piece left in a trunk or a box is not on you.
export const KIT = {
  // NIGHT VISION: a green, grainy, amplified picture (the overlay pass + the renderer's exposure: no new light). It
  // drinks a cell; a bright thing in view (a flare, a fire, headlights pointed at you) BLINDS it: the picture whites out
  // and takes `recover` s to come back once the light is gone.
  nvg: { name: 'Night goggles', slot: 'eyes', power: { cell: 'battery_cell', life: 240 },
    gain: 4.2, grain: 0.22, tint: [0.34, 1.0, 0.38], blind: { flare: 30, fire: 18, headlights: 22, cone: 0.5, rate: 2.4, recover: 1.6, max: 1 },
    item: { kg: 0.9, bulk: 0.8, value: 380, stack: 1, desc: 'Two night tubes off a dead tank, epoxied into a welding mask. Green, grainy, priceless. A flare in your face and you see nothing for a while.' },
    source: { craft: [['scrap', 2], ['spark_plugs', 1], ['duct_tape', 2], ['wristwatch', 1]], buy: 380, loot: 'military caches, the Remnant' } },
  // THERMAL: the rare one. A white-hot ramp over a dark amber world, drawn above brush and smoke (a warm body shows
  // through the leaves). The infected read COLD: a cold shape that walks is one of the dead. Fresh corpses cool on the
  // HEAT rows' clock. Short-ranged, cell-hungry.
  thermal_scope: { name: 'Heat scope', slot: 'eyes', power: { cell: 'battery_cell', life: 150 }, range: 70,
    item: { kg: 1.3, bulk: 1, value: 900, stack: 1, desc: 'A pre-war heat camera in a box of foam and electrical tape. People glow white. The dead do not glow at all.' },
    source: { craft: null, buy: 900, loot: 'the Remnant, sealed bunkers (rare)' } },
  // GLASS: hold it to your eye. The camera rises and leans out along your aim (a top-down zoom out to see further),
  // and every person and car in the glass's cone, inside its range, that your eyes have a LINE OF SIGHT to is marked
  // for `mark` s (the minimap, the `kit` command). Nothing behind a wall is marked: NPCs don't cheat, neither do you.
  binoculars: { name: 'Binoculars', slot: 'glass', power: null, range: 150, cone: 0.55, lean: 70, h: 90, mark: 30, every: 0.4,
    item: { kg: 0.7, bulk: 0.6, value: 70, stack: 1, desc: 'Field glasses with one cracked lens and a bootlace strap. Scouting is how you live: nobody out there cheats.' },
    source: { craft: null, buy: 70, loot: 'houses, cars, the Remnant' } },
  rifle_scope: { name: 'Rifle scope', slot: 'glass', power: null, range: 220, cone: 0.3, lean: 110, h: 120, mark: 30, every: 0.4,
    item: { kg: 0.5, bulk: 0.4, value: 160, stack: 1, desc: 'A hunting scope off a deer rifle, the crosshair hairline crooked. Narrow, long, honest.' },
    source: { craft: null, buy: 160, loot: 'gun shops, hunters\' cabins, raiders' } },
  // LIGHT: the cone you already know (main.js flashlight), now a thing you carry. A lit body is SEEN FURTHER at night by
  // raiders (ai.js scan x seen) and drawn to by the dead (zombies.js lit / seekLight already read the beam).
  flashlight: { name: 'Flashlight', slot: 'beam', power: { cell: 'battery_cell', life: 1500 }, reach: 1, seen: 1.7,
    item: { kg: 0.5, bulk: 0.35, value: 18, stack: 1, desc: 'A steel torch with a cracked lens held in with tape. It shows you the street, and shows the street you.' },
    source: { craft: null, buy: 18, loot: 'garages, cars, houses' } },
  headlamp: { name: 'Headlamp', slot: 'beam', power: { cell: 'battery_cell', life: 2100 }, reach: 0.78, seen: 1.5, hands: true,
    item: { kg: 0.25, bulk: 0.2, value: 30, stack: 1, desc: 'A miner\'s lamp on a sweatband. Both hands free; it points where you look, and so does everyone who sees it.' },
    source: { craft: [['flashlight', 1], ['rag', 1], ['duct_tape', 1]], buy: 30, loot: 'mines, garages' } },
  // THE SCANNER: a CHANNEL of the knowledge model (data/pulls.js CHANNELS.scanner). It hears only what was really keyed
  // up: a convoy's drivers talking lead to tail, the bulls' dispatcher sending a car. Inside `range` of the transmitter,
  // with a live cell. What you heard is a copy with its source, its spot and its hour (law 6): it goes stale.
  radio_scanner: { name: 'Radio scanner', slot: 'ears', power: { cell: 'battery_cell', life: 1200 }, range: 1800,
    item: { kg: 0.8, bulk: 0.6, value: 140, stack: 1, desc: 'A police scanner with a coat-hanger aerial. It hears the convoys talk and the bulls dispatch. It only hears what somebody actually says.' },
    source: { craft: [['radio_portable', 1], ['scrap', 1], ['duct_tape', 1]], buy: 140, loot: 'patrol cars, the security station' } },
  // THE MASK: pulled on by itself in bad air (AIR_ZONES) while a filter lasts; each filter is `life` s of breathing.
  gas_mask: { name: 'Gas mask', slot: 'face', power: { cell: 'mask_filter', life: 300 },
    item: { kg: 0.7, bulk: 0.8, value: 85, stack: 1, desc: 'A cracked rubber mask with one good eyepiece and a filter thread wrapped in tape. Smoke, chemicals, the dead air down the drains.' },
    source: { craft: null, buy: 85, loot: 'military caches, fire stations, the security station' } },
};

// What feeds them. Found in boxes (LOOT adds in data/items.js), never made from nothing. A cell drains in the device;
// a fresh one is thumbed in from the pack when it goes flat (the old one is gone).
export const CELLS = {
  battery_cell: { name: 'Battery cell', kind: 'part', kg: 0.12, bulk: 0.05, stack: 8, value: 6, tags: ['cell'],
    desc: 'A fat dry cell, its label sun-bleached white. Maybe half a charge. Everything worth carrying runs on these.' },
  mask_filter: { name: 'Mask filter', kind: 'part', kg: 0.2, bulk: 0.2, stack: 6, value: 12, tags: ['filter'],
    desc: 'A screw-on charcoal canister, the seal still in its foil. Five minutes of air you can trust.' },
};
// Where they turn up: table -> [item, weight, min, max] rows added to data/items.js LOOT. The rare ones stay military.
export const KIT_LOOT_ADD = {
  garage: [['battery_cell', 3, 1, 3], ['flashlight', 2, 1, 1], ['headlamp', 1, 1, 1]],
  office: [['battery_cell', 2, 1, 2], ['binoculars', 1, 1, 1]],
  pumps: [['battery_cell', 3, 1, 3], ['flashlight', 1, 1, 1]],
  wreck: [['battery_cell', 2, 1, 2], ['flashlight', 1, 1, 1]],
  bedroom: [['binoculars', 1, 1, 1], ['battery_cell', 1, 1, 2]],
  military: [['battery_cell', 3, 2, 4], ['mask_filter', 3, 1, 3], ['gas_mask', 2, 1, 1], ['nvg', 1, 1, 1], ['binoculars', 1, 1, 1], ['rifle_scope', 1, 1, 1], ['thermal_scope', 0.25, 1, 1]],
  soldier: [['battery_cell', 2, 1, 2], ['mask_filter', 1, 1, 1]],
  raider: [['battery_cell', 1, 1, 2], ['rifle_scope', 0.3, 1, 1]],
};

// BODY HEAT (the thermal scope reads it; deg C). The living run at `living`; the infected at the air plus `infected`
// (they run cold: no fever, no blood moving); a corpse cools from `living` toward the air with time constant `tau`
// sim seconds (T = air + (living - air) * e^(-t / tau)); a running engine is warm. air: by day / by night.
export const HEAT = {
  living: 37, infected: 1.5, tau: 420, engine: 70, fire: 300, air: { day: 31, night: 14 },
  // The white-hot ramp (no violet anywhere): stops in deg C, colours from cold (black-brown) to white.
  ramp: [[0, '#0c0806'], [18, '#1c120a'], [26, '#5a1e0c'], [31, '#b0400e'], [34, '#e8861c'], [36, '#ffd36a'], [60, '#fff8e8']],
  world: [0.44, 0.31, 0.17], gain: 4, floor: [0.09, 0.055, 0.025], // the amber the world is multiplied to under the scope, and its night gain (the cold reads black against it)
};

// BAD AIR. Without a mask (or with a dry one) you take `dps`, cough (`cough` s between) and your aim shakes; with a
// filter you breathe and the filter drains. Kinds:
//   smoke     inside any smoke cloud (throwables.smokes: canisters, the smoke layer, choke gas)
//   chem      the CHEM_ZONES rows: burned-out chemical ground
//   under     below the street where the air is dead: an underground site of a kind in `kinds`, or one with no power
//             (the fans are off): the storm drains under every town (systems/understreet.js, kind drains), sewers
export const AIR_ZONES = {
  smoke: { name: 'SMOKE', dps: 1.6, cough: 2.2, shake: 0.4 },
  chem: { name: 'CHEMICALS', dps: 6, cough: 1.2, shake: 0.8 },
  under: { name: 'BAD AIR', dps: 2.5, cough: 1.8, shake: 0.5, kinds: ['drains', 'sewer', 'facility'], unpowered: true },
};
// Burned-out chemical ground (one decal each, the look all yellow-olive and rust: never purple).
export const CHEM_ZONES = [
  { id: 'tank_farm', name: 'THE TANK FARM', x: -215, z: -330, r: 22, look: { stain: '#8a8a2c', edge: '#5a4a1e' } },
];

// THE SCANNER'S CHATTER: who keys up, and what they say (the fact the scanner copies). Each row is a real source the
// kit polls: `convoy` while a convoy rolls (its lead's set, from where the lead really is, every `every` s); `bulls`
// when security sends a car (the dispatcher at the station); `party` a SITE STORIES party on the road in a car
// (traders and raiders: the set in their car, from the record's spot, every `every` s; systems/sitestories.js movers).
// Only these speak: nothing is made up to fill the air.
export const CHATTER = {
  convoy: { every: 40, life: 2, say: 'convoy chatter: {road}, {dir}bound, {n} rigs rolling' },
  bulls: { every: 0, life: 1, say: 'the bulls\' dispatcher: a car to {place}, {why}' },
  party: { every: 90, life: 3, kinds: ['trader', 'raiders'], say: '{who} on the road to {to}: {n} of them, one car' },
};

// The validator (the World Forge and the selftest): every powered row names a real consumable, slots are known, the
// ramp climbs, no colour is purple (hue 270-320).
export function validateKit(rows = { KIT, CELLS, HEAT, AIR_ZONES, CHEM_ZONES }, items = null) {
  const bad = [], SLOTS = ['eyes', 'glass', 'beam', 'ears', 'face'];
  const hue = (hex) => {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 0.08) return -1;
    let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
    h *= 60; return h < 0 ? h + 360 : h;
  };
  for (const [id, k] of Object.entries(rows.KIT)) {
    if (!SLOTS.includes(k.slot)) bad.push(`${id}: slot ${k.slot}`);
    if (!(k.item?.kg > 0) || !k.name) bad.push(`${id}: item`);
    if (k.power && (!rows.CELLS[k.power.cell] || !(k.power.life > 0))) bad.push(`${id}: power ${k.power?.cell}`);
    if (k.slot === 'glass' && !(k.range > 0 && k.cone > 0 && k.mark > 0)) bad.push(`${id}: glass numbers`);
    for (const [c] of k.source?.craft ?? []) if (items && !items[c]) bad.push(`${id}: recipe ${c}`);
  }
  let last = -1e9;
  for (const [t, c] of rows.HEAT.ramp) { if (t <= last) bad.push(`heat ramp not climbing at ${t}`); last = t; const h = hue(c); if (h >= 270 && h <= 320) bad.push(`heat ramp ${c} is purple`); }
  for (const z of rows.CHEM_ZONES) {
    if (!(z.r > 0) || !Number.isFinite(z.x) || !Number.isFinite(z.z)) bad.push(`chem ${z.id}: x z r`);
    for (const c of Object.values(z.look)) { const h = hue(c); if (h >= 270 && h <= 320) bad.push(`chem ${z.id}: ${c} is purple`); }
  }
  for (const [id, a] of Object.entries(rows.AIR_ZONES)) if (!(a.dps > 0)) bad.push(`air ${id}: dps`);
  return { ok: bad.length === 0, bad };
}
