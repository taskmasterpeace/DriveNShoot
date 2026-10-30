// THE WORKSHOP (docs/design/WEB_WORKSHOP.md): building a car as a budget, as rows. Fan service for the car-duelling
// games (their SHAPES: armour on SIX FACES, weapons with firing arcs, a TAILGATE KIT of droppers, THE BREACH) in our own
// names and numbers. systems/garage.js wears these on a vehicle, systems/workshop.js fires them and runs the counter,
// ui/workshop.js is the screen. Every new plate, gun, gadget, round, arena or shop is a ROW here.
//
// Local vehicle frame (as everywhere): +z forward, +x the driver's left. Faces: front | rear | left | right | top | under
// (the screen says BACK for rear). A mount point is named for the face it sits on: hood = front, tail = rear, pods =
// left/right, roof turret = top. Bearings are radians off the nose, + toward the driver's left.

export const FACES6 = ['front', 'rear', 'left', 'right', 'top', 'under'];
export const FACE_LABEL = { front: 'FRONT', rear: 'BACK', left: 'LEFT', right: 'RIGHT', top: 'TOP', under: 'UNDER' };
export const FACE_BEARING = { front: 0, left: Math.PI / 2, right: -Math.PI / 2, rear: Math.PI, top: 0, under: 0 };

// ---- ARMOUR: what a face is plated with -------------------------------------------------------------------------------
// One kind per face; points are slabs. A point stops `absorb` hit points (x `vs[type]` for that kind of hit) and weighs kg.
//   faces    where it can go (a ram plate is a nose, spikes are flanks)
//   labour   game hours per point to weld on (and half that to cut off)
//   crash    multiplier on the dents THIS car takes on that face in a collision (a ram plate shrugs)
//   ram      multiplier on what that face does to whatever it hits (rams, plows, spikes)
//   grabbers spikes rip hands off: grip lost per second by anybody hanging on that face, and damage per second
// Damage types: bullet (rounds, the hood guns), fire (flame, beams), blast (rockets, mines, grenades), pierce (the rail gun).
export const ARMOR = {
  plate:    { name: 'BOILER PLATE', kg: 25, price: 12, absorb: 10, labour: 0.05, faces: FACES6, vs: { bullet: 1, fire: 1, blast: 1, pierce: 0.5 },
              desc: 'Quarter-inch boiler steel cut from a dead refinery. The honest choice: stops a burst a slab and weighs like sin.' },
  sheet:    { name: 'SHEET STEEL', kg: 14, price: 6, absorb: 6, labour: 0.03, faces: FACES6, vs: { bullet: 1, fire: 0.9, blast: 0.8, pierce: 0.3 },
              desc: 'Road signs and fridge doors hammered flat. Light, cheap, and gone in a long burst.' },
  ablative: { name: 'ABLATIVE PACK', kg: 12, price: 20, absorb: 8, labour: 0.06, faces: FACES6, vs: { bullet: 0.8, fire: 1.9, blast: 1.4, pierce: 0.4 },
              desc: 'Ceramic tiles in fibre bags. It burns away so the steel under it does not. Laughs at flame.' },
  spaced:   { name: 'SPACED PLATE', kg: 22, price: 18, absorb: 9, labour: 0.08, faces: FACES6, vs: { bullet: 0.95, fire: 1, blast: 1.8, pierce: 0.9 },
              desc: 'Two skins with a hand-span of air between. A rocket spends itself on the first one.' },
  ram:      { name: 'RAM PLATE', kg: 35, price: 16, absorb: 11, labour: 0.08, faces: ['front', 'rear'], crash: 0.4, ram: 1.6, vs: { bullet: 1, fire: 1, blast: 1, pierce: 0.6 },
              desc: 'A wedge of grader blade. You stop caring what you hit.' },
  plow:     { name: 'COWCATCHER', kg: 30, price: 14, absorb: 7, labour: 0.07, faces: ['front'], crash: 0.5, ram: 1.25, plow: true, vs: { bullet: 0.9, fire: 1, blast: 0.9, pierce: 0.4 },
              desc: 'A railroad grille welded to the frame. The dead go under and to the side, not through the glass.' },
  spikes:   { name: 'SPIKE STRIP', kg: 18, price: 10, absorb: 5, labour: 0.05, faces: ['front', 'rear', 'left', 'right'], crash: 0.9, ram: 1.35, grabbers: { grip: 2.6, dps: 14 },
              vs: { bullet: 0.8, fire: 1, blast: 0.8, pierce: 0.3 },
              desc: 'Rebar points sharpened on a wheel. Nobody hangs onto this side for long.' },
};

// ---- CHASSIS: what each body can carry --------------------------------------------------------------------------------
// maxKg: everything bolted on (armour + mounts + utility) in kilograms; spaces: room for guns and gadgets; faces: plate
// points per face; mounts: the points a gun or dropper can go on, by face, with its size (1 small .. 3 heavy) and arc
// (half-angle, radians, about the face's bearing; the turret's is a full circle). A body not listed cannot be worked on.
const ARC = { hood: 0.45, pod: 0.6, tail: 0.6, turret: Math.PI };
const mp = (front, rear, left, right, top) => {
  const m = {};
  if (front) m.front = { size: front, arc: ARC.hood };
  if (rear) m.rear = { size: rear, arc: ARC.tail };
  if (left) m.left = { size: left, arc: ARC.pod };
  if (right) m.right = { size: right, arc: ARC.pod };
  if (top) m.top = { size: top, arc: ARC.turret };
  return m;
};
export const CHASSIS = {
  sedan:       { maxKg: 900,  spaces: 8,  faces: { front: 30, rear: 28, left: 24, right: 24, top: 14, under: 14 }, mounts: mp(2, 2, 1, 1, 2) },
  interceptor: { maxKg: 820,  spaces: 7,  faces: { front: 30, rear: 26, left: 22, right: 22, top: 12, under: 12 }, mounts: mp(2, 2, 1, 1, 2) },
  pickup:      { maxKg: 1400, spaces: 12, faces: { front: 36, rear: 32, left: 30, right: 30, top: 16, under: 18 }, mounts: mp(3, 2, 1, 1, 3) },
  van:         { maxKg: 1500, spaces: 14, faces: { front: 36, rear: 36, left: 34, right: 34, top: 20, under: 18 }, mounts: mp(2, 2, 2, 2, 3) },
  rv:          { maxKg: 1800, spaces: 16, faces: { front: 36, rear: 36, left: 36, right: 36, top: 24, under: 20 }, mounts: mp(2, 2, 2, 2, 3) },
  rig:         { maxKg: 4000, spaces: 24, faces: { front: 60, rear: 40, left: 48, right: 48, top: 30, under: 30 }, mounts: mp(3, 3, 2, 2, 3) },
  patrol:      { maxKg: 1600, spaces: 12, faces: { front: 40, rear: 34, left: 32, right: 32, top: 18, under: 20 }, mounts: mp(3, 2, 1, 1, 3) },
  apc:         { maxKg: 3200, spaces: 18, faces: { front: 60, rear: 44, left: 50, right: 50, top: 34, under: 34 }, mounts: mp(3, 2, 2, 2, 3) },
  buggy:       { maxKg: 420,  spaces: 4,  faces: { front: 12, rear: 8, left: 4, right: 4, top: 0, under: 8 },     mounts: mp(2, 1, 0, 0, 2) },
  atv:         { maxKg: 160,  spaces: 2,  faces: { front: 6, rear: 4, left: 0, right: 0, top: 0, under: 4 },      mounts: mp(1, 1, 0, 0, 0) },
  bike:        { maxKg: 110,  spaces: 2,  faces: { front: 4, rear: 0, left: 0, right: 0, top: 0, under: 0 },      mounts: mp(1, 1, 0, 0, 0) },
};
// The old Kenji dialogue (data/parts.js PLATE_MAX) is a floor: every legacy face fits under these.

// ---- PERFORMANCE: what the load does (the formula, docs/design/WEB_WORKSHOP.md §4) -------------------------------------
//   mass   = base.mass + kg / 1000                          (tonnes)
//   ratio  = base.mass / mass
//   accel  = base.accel * ratio * turbo
//   top    = base.maxSpeed * (1 - topLoss * (1 - ratio)) * turbo.top
//   turn   = base.turn * ratio ^ turnExp
//   brake  = ratio ^ brakeExp                               (a multiplier on the brakes, vehicledamage.effects fx.brake)
//   over maxKg: refused at the counter; a body cannot be loaded past it
export const PERF = { topLoss: 0.25, turnExp: 0.35, brakeExp: 0.5 };

// ---- POWER: energy weapons drink it (laser, rail, EMP) ----------------------------------------------------------------
// Every engine has an alternator (cap, regen per second while it runs); batteries and the power plant add to it.
export const POWER = { alternator: { cap: 20, regen: 4 } };

// ---- MOUNTS: guns, launchers and droppers -----------------------------------------------------------------------------
//   kind     hitscan | rocket | flame | beam | rail | harpoon | emp | drop
//   size     mount size it needs; faces: which mount points take it
//   group    which trigger fires it at the wheel: 1 aimed (hood, pods: LMB / pad LB), 2 the tail (B / pad B),
//            3 the turret (RMB / pad VIEW+RB) - set by the mount point it sits on unless the row says (droppers are 2)
//   mag      loaded rounds (or charges); ammo: the item that reloads it and perItem rounds one item gives
//   power    energy per shot; charge: seconds held before it fires (the rail gun); rare: 'prewar' tech is found, not bought
//   type     the damage type its hits do to armour (ARMOR.vs)
// The old ids (mg, oil, caltrops, smoke) are the same rows they always were (data/parts.js MOUNTS), with the new fields.
export const MOUNT_WEAPONS = {
  mg1:        { name: 'MACHINE GUN', kind: 'hitscan', size: 1, kg: 40, price: 180, labour: 0.5, faces: ['front', 'left', 'right', 'rear', 'top'], type: 'bullet',
                dmg: 12, rate: 0.11, spread: 0.04, range: 55, mag: 200, ammo: 'belt_mg', perItem: 100, sound: 'smg',
                desc: 'One belt-fed gun on a welded cradle. Cheap, reliable, chews through tyres.' },
  mg:         { name: 'TWIN MG', kind: 'hitscan', size: 1, kg: 60, price: 300, labour: 0.75, faces: ['front', 'left', 'right', 'rear', 'top'], type: 'bullet',
                dmg: 15, rate: 0.07, spread: 0.035, range: 60, mag: 240, ammo: 'belt_mg', perItem: 100, sound: 'smg',
                desc: 'Two guns on one trigger, alternating. The standard nose of anything that wants to live on the interstate.' },
  autocannon: { name: 'AUTOCANNON', kind: 'hitscan', size: 2, kg: 140, price: 650, labour: 1.5, faces: ['front', 'top', 'left', 'right'], type: 'bullet',
                dmg: 34, rate: 0.32, spread: 0.02, range: 75, mag: 60, ammo: 'ac_shells', perItem: 20, sound: 'shotgun',
                desc: 'A slow, heavy thump that dents plate a slab at a time. Every shot rocks the car.' },
  rockets:    { name: 'ROCKET POD', kind: 'rocket', size: 2, kg: 90, price: 520, labour: 1, faces: ['front', 'top', 'left', 'right', 'rear'], type: 'blast',
                dmg: 70, blast: 3.5, speed: 60, rate: 0.45, spread: 0.03, range: 110, mag: 6, ammo: 'rocket', perItem: 1,
                desc: 'Six tubes, dumb-fire. Point the car and pray. A hit opens a face like a tin.' },
  seeker:     { name: 'SEEKER POD', kind: 'rocket', size: 2, kg: 95, price: 900, labour: 1.25, faces: ['front', 'top'], type: 'blast', rare: 'uncommon',
                dmg: 60, blast: 3, speed: 48, rate: 0.6, spread: 0.02, range: 120, mag: 4, ammo: 'rocket', perItem: 1, lock: { time: 1.2, cone: 0.35, turn: 2.4 },
                desc: 'Four rockets with a dish in the nose. Hold on a car for a second and they follow it. Flares fool them.' },
  heavyrocket:{ name: 'HEAVY ROCKET', kind: 'rocket', size: 3, kg: 120, price: 700, labour: 1.5, faces: ['front', 'top'], type: 'blast', arc: 0.2,
                dmg: 160, blast: 5, speed: 45, rate: 2.5, spread: 0.01, range: 130, mag: 1, ammo: 'heavy_rocket', perItem: 1,
                desc: 'One fat tube on the hood. One shot, one car. Reload at a garage or carry the round yourself.' },
  flamer:     { name: 'FLAMETHROWER', kind: 'flame', size: 2, kg: 80, price: 450, labour: 1, faces: ['front', 'left', 'right', 'rear', 'top'], type: 'fire',
                dmg: 7, rate: 0.1, range: 14, cone: 0.25, mag: 60, ammo: 'napalm', perItem: 30,
                desc: 'A pump, a tank of jellied fuel and a pilot light. Ugly at close range, and the dead burn.' },
  laser:      { name: 'LASER', kind: 'beam', size: 2, kg: 70, price: 2400, labour: 2, faces: ['front', 'top', 'left', 'right'], type: 'fire', rare: 'prewar',
                dmg: 26, rate: 0.18, spread: 0, range: 90, mag: 0, power: 6,
                desc: 'Pre-war. A lens the size of a fist and a hum you feel in your teeth. Never runs dry while the power holds.' },
  rail:       { name: 'RAIL GUN', kind: 'rail', size: 3, kg: 160, price: 5200, labour: 3, faces: ['front', 'top'], type: 'pierce', rare: 'prewar', arc: 0.25,
                dmg: 220, rate: 3, spread: 0, range: 140, mag: 4, power: 60, charge: 1.6, pierce: 3, carry: 0.7, ammo: 'rail_slug', perItem: 2,
                desc: 'Pre-war. It drinks the whole battery, sings for a second and a half, then puts a slug through two cars and whoever stands behind them.' },
  harpoon:    { name: 'HARPOON GUN', kind: 'harpoon', size: 2, kg: 110, price: 600, labour: 1.5, faces: ['front', 'rear', 'top'], type: 'bullet',
                mag: 0, rate: 0.6, range: 40,
                desc: 'A whaling gun on a cable drum. Bite a car and tow it; fire again and yank it off its wheels.' },
  minedrop:   { name: 'MINE DROPPER', kind: 'drop', size: 1, kg: 50, price: 400, labour: 1, faces: ['rear'], group: 2, type: 'blast',
                mag: 4, ammo: 'car_mine', perItem: 1, mine: { arm: 1.2, r: 2.2, dmg: 120, blast: 5, life: 120 },
                desc: 'A chute of pressure mines. Arms a second after it lands; the next set of wheels over it goes up.' },
  oil:        { name: 'OIL SPRAYER', kind: 'drop', size: 1, kg: 40, price: 150, labour: 0.5, faces: ['rear'], group: 2,
                mag: 4, ammo: 'oil_drum', perItem: 2, slick: { r: 4.5, life: 40, grip: 0.12, spin: 2.2 },
                desc: 'A drum of waste oil and a nozzle under the bumper. Whoever is on your tail spins.' },
  caltrops:   { name: 'CALTROP DROPPER', kind: 'drop', size: 1, kg: 30, price: 120, labour: 0.5, faces: ['rear'], group: 2,
                mag: 5, ammo: 'caltrop_bag', perItem: 5, field: { r: 3.5, life: 45 },
                desc: 'Welded jacks by the bucket. Somebody behind you is changing a tyre.' },
  smoke:      { name: 'SMOKE LAYER', kind: 'drop', size: 1, kg: 20, price: 100, labour: 0.5, faces: ['rear'], group: 2,
                mag: 4, ammo: 'smoke_can', perItem: 2,
                desc: 'A smudge pot on a blower. Nothing behind you can see you, or the road.' },
  flares:     { name: 'FLARE DISPENSER', kind: 'drop', size: 1, kg: 15, price: 200, labour: 0.5, faces: ['rear', 'top'], group: 2,
                mag: 6, ammo: 'flare_pack', perItem: 3, flare: { r: 40, life: 3 },
                desc: 'Magnesium flares thrown high. A seeker or a drone chasing your heat chases them instead.' },
  paint:      { name: 'PAINT SPRAYER', kind: 'drop', size: 1, kg: 25, price: 180, labour: 0.5, faces: ['rear'], group: 2,
                mag: 6, ammo: 'paint_can', perItem: 3, cloud: { r: 4, life: 10, blind: 4 },
                desc: 'House paint and a compressor. A windshield behind you goes white and the driver goes wild.' },
  emp:        { name: 'EMP PROJECTOR', kind: 'emp', size: 2, kg: 90, price: 3800, labour: 2.5, faces: ['front', 'top'], rare: 'prewar',
                rate: 6, range: 25, cone: 0.6, power: 40, charge: 0.8, mag: 0, stall: 4,
                desc: 'Pre-war. A coil the length of your arm. Every engine in front of you dies for a few long seconds.' },
};

// ---- UTILITY: what is not a gun -------------------------------------------------------------------------------------
//   space     spaces it takes; mods: what it changes (read by garage.retune / workshop / the minimal hooks it names)
export const UTILITY = {
  battery:      { name: 'BATTERY BANK', kg: 40, space: 1, price: 400, labour: 0.5, power: { cap: 80, regen: 0 },
                  desc: 'Six truck batteries in a crate. Holds a charge for the energy guns; the alternator fills it.' },
  powerplant:   { name: 'POWER PLANT', kg: 80, space: 2, price: 1800, labour: 2, rare: 'prewar', power: { cap: 120, regen: 12 },
                  desc: 'Pre-war. A sealed cell that runs warm and never stops. What the rail gun was built to drink from.' },
  extinguisher: { name: 'FIRE SUPPRESSION', kg: 20, space: 1, price: 250, labour: 0.5, charges: 2, ammo: 'suppressant', perItem: 1,
                  desc: 'Two bottles and a ring of nozzles under the hood. Puts out a burning car twice.' },
  runflat:      { name: 'RUN-FLAT TYRES', kg: 30, space: 0, price: 200, labour: 0.5, flatMul: 0.4,
                  desc: 'Inserts in the rims. A blown tyre still rolls, badly, instead of dragging you into the ditch.' },
  solidtyres:   { name: 'PUNCTURE-PROOF TYRES', kg: 60, space: 0, price: 350, labour: 0.75, grip: 0.95,
                  desc: 'Solid rubber, no air to lose. Caltrops and rounds do nothing. The ride shakes your fillings out.' },
  nitrous:      { name: 'NITROUS', kg: 25, space: 1, price: 350, labour: 0.75, charges: 3, ammo: 'nitrous_bottle', perItem: 1, burst: { time: 2.5, accel: 1.8, top: 1.15 },
                  desc: 'A bottle and a button. Boost (Shift) at speed and the car jumps like it was kicked.' },
  turbo:        { name: 'TURBOCHARGER', kg: 30, space: 1, price: 500, labour: 1.5, accel: 1.12, top: 1.05,
                  desc: 'A scavenged turbo plumbed in with exhaust tube and hope. More shove everywhere.' },
  bumpers:      { name: 'REINFORCED BUMPERS', kg: 50, space: 0, price: 180, labour: 0.5, crash: 0.6,
                  desc: 'I-beam bumpers front and back. A shunt costs the other car more than you.' },
  fueltank:     { name: 'EXTRA FUEL TANK', kg: 45, space: 2, price: 160, labour: 0.75, fuel: 40,
                  desc: 'Forty more litres in the boot. The desert is wide.' },
  cargorack:    { name: 'CARGO RACK', kg: 25, space: 0, price: 90, labour: 0.25, trunk: 120,
                  desc: 'A roof cage and straps. More room in the trunk for what you find.' },
  gunports:     { name: 'GUN PORTS', kg: 10, space: 0, price: 120, labour: 0.5, ports: true,
                  desc: 'Slots cut in the doors with sliding covers. Your passengers shoot without losing the glass.' },
  targeting:    { name: 'TARGETING COMPUTER', kg: 15, space: 1, price: 1200, labour: 1, rare: 'uncommon', spread: 0.5, lock: 0.6,
                  desc: 'A pre-war fire-control box wired to the triggers. Tightens every gun and locks the seekers faster.' },
  // GADGETS-2 (docs/design/WEB_GADGETS2.md; systems/kit.js runs them). Scavenged, taped, powered by the car.
  hubspikes:    { name: 'HUB SPIKES', kg: 22, space: 0, price: 160, labour: 0.5, slash: { r: 1.1, tyres: 1, every: 0.4, dmg: 18 },
                  desc: 'Sharpened bolts welded to the wheel nuts. Rub a car alongside and its tyres go to ribbons.' },
  spotlight:    { name: 'ROOF SPOTLIGHT', kg: 12, space: 1, price: 220, labour: 0.5, beam: { reach: 2.1, power: 1.5, seen: 1.8 },
                  desc: 'A searchlight off a dead patrol boat, bolted to the roof bars. It turns night into a stage, and you are on it.' },
  winch:        { name: 'HARPOON WINCH', kg: 35, space: 1, price: 300, labour: 1, needs: 'harpoon', pull: { slack: 1.2, range: 30 },
                  desc: 'A tow drum geared down off a wrecker. Bite a door and drive away: the door comes with you. Gates too.' },
  dronebay:     { name: 'DRONE BAY', kg: 35, space: 1, price: 650, labour: 1, bodies: ['pickup', 'van', 'rv', 'rig', 'interceptor', 'patrol', 'apc'],
                  desc: 'A roof cradle with a charger and a latch. Its outrider flies ahead of you on its own and marks what waits up the road (the \\ key).' },
  radar:        { name: 'RADAR DETECTOR', kg: 5, space: 0, price: 150, labour: 0.25, warn: 120,
                  desc: 'A dash box that screams when something locks onto you, or an armed car closes within a long block.' },
};

// ---- AMMO as items (registered into data/items.js ITEMS by systems/workshop.js) ----------------------------------------
export const AMMO_ITEMS = {
  belt_mg:        { name: 'MG belt', kind: 'ammo', kg: 2.8, bulk: 1.6, stack: 4, value: 30, tags: ['car_ammo'], desc: 'A hundred linked rounds in a steel can. Feeds either hood gun.' },
  ac_shells:      { name: 'Autocannon shells', kind: 'ammo', kg: 6, bulk: 3, stack: 3, value: 60, tags: ['car_ammo'], desc: 'Twenty fat shells in a crate with rope handles.' },
  rocket:         { name: 'Rocket', kind: 'ammo', kg: 3, bulk: 2.4, stack: 6, value: 45, tags: ['car_ammo'], desc: 'A tube with fins and a bad attitude. Fits the pods.' },
  heavy_rocket:   { name: 'Heavy rocket', kind: 'ammo', kg: 9, bulk: 7, stack: 1, value: 110, tags: ['car_ammo'], desc: 'One round for the big tube. Carry it like it is asleep.' },
  napalm:         { name: 'Napalm can', kind: 'ammo', kg: 5, bulk: 5, stack: 2, value: 40, tags: ['car_ammo', 'fuel'], desc: 'Jellied fuel. It sticks, and it keeps burning.' },
  rail_slug:      { name: 'Rail slugs', kind: 'ammo', kg: 1.6, bulk: 0.4, stack: 6, value: 160, tags: ['car_ammo', 'prewar'], desc: 'Two pre-war tungsten slugs in foam. Nobody makes these any more.' },
  car_mine:       { name: 'Car mine', kind: 'ammo', kg: 6, bulk: 3, stack: 4, value: 55, tags: ['car_ammo'], desc: 'A pressure plate on a cake tin of explosive. Do not step on it either.' },
  oil_drum:       { name: 'Waste oil', kind: 'ammo', kg: 8, bulk: 8, stack: 2, value: 10, tags: ['car_ammo'], desc: 'Black sludge drained from a hundred dead engines. Two slicks.' },
  caltrop_bag:    { name: 'Caltrop bag', kind: 'ammo', kg: 3, bulk: 1.5, stack: 3, value: 12, tags: ['car_ammo'], desc: 'A sack of welded jacks.' },
  smoke_can:      { name: 'Smudge oil', kind: 'ammo', kg: 2, bulk: 2, stack: 4, value: 10, tags: ['car_ammo'], desc: 'Oil cut with tar for the smoke layer. Two clouds.' },
  flare_pack:     { name: 'Flare pack', kind: 'ammo', kg: 1.2, bulk: 1, stack: 4, value: 25, tags: ['car_ammo'], desc: 'Three magnesium flares and a striker.' },
  paint_can:      { name: 'Paint drum', kind: 'ammo', kg: 4, bulk: 4, stack: 3, value: 15, tags: ['car_ammo'], desc: 'White house paint, thinned for the sprayer.' },
  nitrous_bottle: { name: 'Nitrous bottle', kind: 'ammo', kg: 4, bulk: 3, stack: 3, value: 50, tags: ['car_ammo'], desc: 'A blue bottle that hisses. One burst.' },
  suppressant:    { name: 'Suppressant bottle', kind: 'ammo', kg: 3, bulk: 2.5, stack: 2, value: 35, tags: ['car_ammo'], desc: 'A charge for the car\'s fire system.' },
};

// ---- PAINT: the body's colour (the shop's spray booth; cosmetic, priced, a row each) ----------------------------------
export const PAINTS = {
  primer:  { name: 'PRIMER GREY', color: '#5f5b55', price: 20 },
  rust:    { name: 'RUST RED', color: '#7a3a22', price: 30 },
  sand:    { name: 'DESERT SAND', color: '#a88d5c', price: 30 },
  olive:   { name: 'DRAB OLIVE', color: '#4f5434', price: 30 },
  bone:    { name: 'BONE WHITE', color: '#cfc4ab', price: 40 },
  hazard:  { name: 'HAZARD YELLOW', color: '#c99a1c', price: 45 },
  ink:     { name: 'ROAD TAR', color: '#2a2622', price: 35 },
};

// ---- REPAIR prices (per point of plate, per part, at the counter) ---------------------------------------------------
export const REPAIR = { platePt: 0.5, plateLabour: 0.02, part: { engine: 80, radiator: 40, tank: 50, lights: 15, tyre: 20, body: 30 }, partLabour: 0.4 };

// ---- THE SHOPS: where the workshop opens ------------------------------------------------------------------------------
//   keeper   an NPC id (open while they are there and awake); at x,z within r for a fixed site (the cities lane stamps
//            a town garage as a row like these); rate: scrip per labour hour; stock: which rows it sells (all, or a list);
//            rare: whether it deals in 'uncommon' / 'prewar' rows (otherwise they are installed only from your pack)
export const WORKSHOPS = {
  kenji:      { name: "KENJI'S GARAGE", where: 'Rust Haven', keeper: 'kenji', r: 14, rate: 20, rare: ['uncommon'] },
  homebase:   { name: 'YOUR GARAGE', where: 'home', kind: 'base', r: 10, rate: 0, rare: [], selfWork: 1.5 }, // your own bench: no labour charge, it takes you longer
  remnant:    { name: 'MOTOR POOL', where: 'Outpost Nine', x: -290, z: -400, r: 18, rate: 35, rare: ['uncommon', 'prewar'], needStanding: 30 },
};

// ---- ARENAS: places the cities lane stamps (WEB_JUMPS ramps exist; these are the destruction sets) --------------------
//   kind      arena (a walled bowl) | track (a loop with checkpoints)
//   props     rows of things to put down: barrels (destructible stacks: hp, blast), kicker (a WEB_JUMPS ramp), wall, wreck
//   event     what runs there: 'loaner' lends you a junker for one race (win: keep it), 'derby' last car moving
export const ARENAS = {
  dustbowl:  { name: 'THE DUST BOWL', kind: 'arena', at: { town: 'rust_haven', dx: 420, dz: 140 }, w: 120, d: 90, wall: 'tyres',
               props: [{ kind: 'barrels', x: -30, z: 0, n: 6, hp: 40, blast: 4 }, { kind: 'barrels', x: 30, z: 0, n: 6, hp: 40, blast: 4 }, { kind: 'kicker', x: 0, z: -25, h: 1.4 }, { kind: 'wreck', x: 0, z: 22 }],
               event: 'derby', desc: 'A dried-out reservoir ringed with tyres. Friday nights, last car moving keeps the pot.' },
  loopline:  { name: 'LOOPLINE SPEEDWAY', kind: 'track', at: { town: 'tucson', dx: 0, dz: 300 }, w: 260, d: 140, wall: 'jersey',
               checkpoints: [[-110, 0], [0, -55], [110, 0], [0, 55]], laps: 3,
               props: [{ kind: 'barrels', x: -80, z: -40, n: 8, hp: 40, blast: 4 }, { kind: 'barrels', x: 80, z: 40, n: 8, hp: 40, blast: 4 }, { kind: 'kicker', x: 0, z: 55, h: 1.2 }],
               event: 'loaner', desc: 'An old county oval, the grandstand half burnt. The promoter lends junkers to anybody with nerve.' },
};
// The LOANER NIGHT: the promoter's junker, a race, and the title if you finish first.
export const LOANER = { arena: 'loopline', vehicle: 'sedan', build: { armor: { front: ['sheet', 8], rear: ['sheet', 6] }, mounts: { front: 'mg1' } }, field: 4, entry: 0, purse: 150, keep: 'win' };

// ---- validation (the World Forge and selftest use it) ---------------------------------------------------------------
export function validateWorkshop(rows = { ARMOR, CHASSIS, MOUNT_WEAPONS, UTILITY, AMMO_ITEMS, ARENAS, WORKSHOPS }) {
  const bad = [];
  for (const [id, a] of Object.entries(rows.ARMOR)) {
    if (!(a.kg > 0 && a.absorb > 0 && a.price > 0)) bad.push(`armor ${id}: kg, absorb, price must be > 0`);
    for (const f of a.faces) if (!FACES6.includes(f)) bad.push(`armor ${id}: unknown face ${f}`);
  }
  for (const [id, c] of Object.entries(rows.CHASSIS)) {
    if (!(c.maxKg > 0)) bad.push(`chassis ${id}: maxKg`);
    for (const f of Object.keys(c.mounts)) if (!FACES6.includes(f)) bad.push(`chassis ${id}: mount on unknown face ${f}`);
  }
  for (const [id, w] of Object.entries(rows.MOUNT_WEAPONS)) {
    if (!['hitscan', 'rocket', 'flame', 'beam', 'rail', 'harpoon', 'emp', 'drop'].includes(w.kind)) bad.push(`mount ${id}: kind ${w.kind}`);
    if (!(w.size >= 1 && w.size <= 3)) bad.push(`mount ${id}: size 1..3`);
    if (w.ammo && !rows.AMMO_ITEMS[w.ammo]) bad.push(`mount ${id}: ammo item ${w.ammo} has no row`);
    if (w.kind === 'drop' && !w.faces.every((f) => f === 'rear' || f === 'top')) bad.push(`mount ${id}: droppers go on the tail`);
  }
  for (const [id, u] of Object.entries(rows.UTILITY)) {
    if (!(u.kg >= 0 && u.space >= 0 && u.price > 0)) bad.push(`utility ${id}: kg, space, price`);
    if (u.ammo && !rows.AMMO_ITEMS[u.ammo]) bad.push(`utility ${id}: ammo item ${u.ammo} has no row`);
    if (u.needs && !Object.values(rows.MOUNT_WEAPONS).some((w) => w.kind === u.needs)) bad.push(`utility ${id}: needs a ${u.needs} mount that has no row`);
    if (u.slash && !(u.slash.r > 0 && u.slash.every > 0)) bad.push(`utility ${id}: slash r, every`);
    if (u.beam && !(u.beam.reach > 0 && u.beam.power >= 0)) bad.push(`utility ${id}: beam reach, power`);
  }
  for (const [id, a] of Object.entries(rows.ARENAS)) if (!['arena', 'track'].includes(a.kind) || !a.props?.length) bad.push(`arena ${id}: kind and props`);
  return { ok: bad.length === 0, bad };
}
