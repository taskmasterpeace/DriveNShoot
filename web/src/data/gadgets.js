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
  smoke_can: {
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
