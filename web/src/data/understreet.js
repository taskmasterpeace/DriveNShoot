// UNDER THE STREET (docs/design/WEB_UNDERSTREET.md): the storm drains and sewers under every generated town and the
// Phoenix ring, as rows. A town's network is one underground site of kind `drains` (data/underground.js KINDS.drains) made
// from the town's own street plan (world/understreet.js, pure): a trunk sewer under the main street, laterals under the
// side streets and the alleys, junction chambers where the trunk meets them, a pump station in a big town, the outfall at
// the water (or the dry wash at the town's low edge), a box culvert under the road out of town. Its ways in are flights
// from the street (the storeys law: a slope between two decks, entered at its ends): manholes, kerb grates, the outfall's
// ramp, a basement breach up into a store, the culvert's two ramps. Going down is the underground's own `p.ug`: no load,
// no cut, the view goes below when your head does.
//
// Everything here is a knob the World Forge can turn (validateUnderstreet below is the check it runs). Colours are
// concrete, brick, rust, silt and murk: nothing in hue 270-320.

// ---- the frame ---------------------------------------------------------------------------------------------------------
//   depth     the street to the sewer's floor (shallower than a bunker: a manhole's ladder is two metres of run)
//   margin    metres of rock kept round the network's frame
//   attachPad a town's ways appear on the street within its half-size + this of you
//   lazyR     who lives below is stood up within this of you (the rest stays a record: 160 people is the whole world's cap)
//   dropR     ...and folded back into the record past this (unless they are after you)
//   carry     a noise in a pipe travels 1/carry metres for every metre through open ground: a pipe is a speaking tube
export const SEWER = { depth: 4.2, margin: 6, attachPad: 70, lazyR: 70, dropR: 105, carry: 0.6, fill: '#15130f' };

// The pipes. w: across in metres (whole metres: the level is a 1 m grid); lift: how far its floor stands over the
// trunk's channel (water pools in the lowest first); bench: dry walkways each side of a trunk's channel; floor/wall:
// its colours. A trunk is old brick, a lateral is concrete pipe, the culvert is a box.
export const PIPES = {
  trunk: { name: 'trunk sewer', w: 4, lift: 0, bench: 1, floor: '#3a352c', bench_c: '#5b5447', wall: '#7a5a44' },
  lateral: { name: 'storm lateral', w: 2, lift: 0.14, floor: '#4a463d', wall: '#7d786c' },
  alley: { name: 'alley drain', w: 2, lift: 0.18, floor: '#4c463b', wall: '#76705f' },
  connector: { name: 'old service passage', w: 2, lift: 0.22, floor: '#4d483e', wall: '#6e685c' },
  outfall: { name: 'outfall pipe', w: 3, lift: 0, floor: '#3a352c', wall: '#827c70' },
  culvert: { name: 'box culvert', w: 4, lift: 0, floor: '#433e35', wall: '#8a857a' },
};

// The rooms. w x d metres; lift as a pipe's. junction: where the trunk meets a lateral (an eight-metre chamber, a weir,
// a ledge); pump: the big town's pump station (its generator runs the pumps that pull a flood down: the underground's
// own generator rules, data/underground.js GENERATOR); basement: the old cellar under a store a breach comes up through.
export const CHAMBERS = {
  junction: { name: 'junction chamber', w: 8, d: 8, lift: 0.08, floor: '#454036', wall: '#7a5a44' },
  pump: { name: 'pump station', w: 14, d: 10, lift: 0.55, floor: '#5a564c', wall: '#868276', minSize: 300 },
  basement: { name: 'old cellar', w: 6, d: 5, lift: 0.7, floor: '#5a4c3c', wall: '#6a5a48' },
};

// The ways in and out. flight: the slope (pitch: rise over run; w: across; speed: the pace on it).
//   manhole  a lid in the street or the alley every `every` m along a pipe; hold E to lift it (a crowbar `bar` s, by
//            hand `hand` s), heard `noise` m; from below you shoulder it up the same way
//   grate    a kerb inlet every `every` m along a street pipe; light falls through it by day; `enter` of them are loose
//            (prise one up: `prise` s, heard `noise` m, a crowbar needed), the rest are welded or too narrow
//   outfall  where the network empties: a ramp up to the bank; `bars` of them are barred (a grille: pry it with a crowbar
//            `pry` s, loud; cut it with a hacksaw `cut` s, quiet); search: how far past the town to look for water
//   breach   the quiet way into a store from below: a cellar under it and a hole up through its floor; `per` stores a
//            town, only these kinds, only `minDepth` m deep or more
//   culvert  a box culvert under the main road `out` m past the town's edge, a ramp up each side
export const WAYS = {
  manhole: { name: 'a manhole', flight: { pitch: 2.1, w: 1, speed: 0.4 }, every: 64, bar: 1.2, hand: 3.0, noise: 22, lid: true },
  grate: { name: 'a kerb grate', flight: { pitch: 2.1, w: 1, speed: 0.38 }, every: 30, enter: 0.3, prise: 2.4, noise: 26, lid: true },
  outfall: { name: 'the outfall', flight: { pitch: 0.42, w: 3, speed: 0.85 }, bars: 0.65, pry: 3.2, cut: 7, search: 110, noise: 34 },
  breach: { name: 'a breach into a store', flight: { pitch: 1.0, w: 1, speed: 0.6 }, per: [1, 3], minDepth: 13.5, kinds: ['shop', 'saloon', 'diner', 'clinic', 'gas_station', 'auto_shop', 'office', 'police_station'] },
  culvert: { name: 'a box culvert', flight: { pitch: 0.42, w: 3, speed: 0.85 }, out: 30 },
};

// The water. level: metres over the trunk's channel floor. dry: the trickle that is always there; rain: what a rain
// brings up to (knee deep in the trunk); storm: an acid storm's flood (the trunk full to the soffit). rise/fall: metres
// a game minute; pump: what a running pump station takes off a game minute. wade/swim: depths (the water lane's own
// 0.25 / 1.3, data/water.js); air: below this much headroom you are under (breath, then drowning).
export const FLOOD = { dry: 0.1, rain: 0.5, storm: 2.45, rise: 0.02, fall: 0.006, pump: 0.03, wade: 0.25, swim: 1.3, air: 0.3, drown: 9, colour: '#3b3a2a', murk: 0.85 };

// The current: water runs toward the outfall at k m/s per metre of depth (at most max); it carries whoever stands in it
// (a swimmer at full speed, a wader at `wade` of it).
export const CURRENT = { k: 0.55, max: 1.5, wade: 0.35 };

// Who lives below. nests: one per `nestPer` m of town size (at least 1); a nest is nestSize of the dead round a
// junction or a dead end (runners: sprinters' share); loose: the dead wandering the pipes; squat: the chance a town has a
// squatters' camp (squatters people, a cache, a cold camp); rats: the rats in a live network (cosmetic and loud).
export const LIFE = { nestPer: 170, nestSize: [3, 5], loose: [2, 5], runners: 0.25, squat: 0.6, squatters: [2, 4], rats: 36, ratFlee: 6 };

// What is down there (containers roll once and never refill: the inventory's ring law). flotsam: what the water brought
// down and left at bends and chambers (submerged: the share that lie under the murk with nothing on show).
export const CACHES = { flotsam: [3, 7], submerged: 0.45, squat: 1 };

export const US_LOOT = {
  us_flotsam: { rolls: [1, 2], none: 3, rows: [['scrap', 4, 1, 3], ['rag', 3, 1, 2], ['ammo_pistol', 2, 2, 8], ['canteen', 1, 1, 1], ['wristwatch', 1, 1, 1], ['gold_ring', 1, 1, 1], ['knife', 1, 1, 1], ['duct_tape', 1, 1, 1]] },
  us_squat: { rolls: [2, 4], none: 0, rows: [['ration', 3, 1, 2], ['water_can', 2, 1, 1], ['jerky', 2, 1, 2], ['bandage', 2, 1, 2], ['lockpicks', 1, 1, 1], ['ammo_pistol', 2, 4, 10], ['hacksaw', 1, 1, 1]] },
  us_pump: { rolls: [1, 3], none: 1, rows: [['fuel_can', 2, 1, 1], ['spark_plugs', 2, 1, 2], ['duct_tape', 2, 1, 1], ['crowbar', 1, 1, 1], ['scrap', 3, 1, 3]] },
  us_nest: { rolls: [2, 3], none: 1, rows: [['gold_ring', 2, 1, 2], ['wristwatch', 2, 1, 1], ['photograph', 3, 1, 1], ['ammo_pistol', 2, 4, 12], ['dog_collar', 1, 1, 1]] },
};

// Notes below (our own words; tools/ip-lint.mjs reads them). The pump station's card tells you how to start it.
export const US_LOGS = {
  us_chalk: { title: 'CHALK ON THE BRICK', paper: true, text: 'Arrows point to the river. Up the iron where the light comes through. Never sleep in the big pipe when the sky goes green: it fills to the roof in the time it takes to pack.' },
  us_squat: { title: 'CAMP RULES', paper: true, text: 'No fires. No shooting. Lids stay down. Whoever brings the horde down here walks back up with it. Water from the cistern only, boiled. The cellar under the hardware store is ours.' },
  us_pump: { title: 'PUMP STATION CARD', paper: true, text: 'Day tank, choke, crank. With her running the pumps pull the trunk down faster than any storm fills it. She is heard the length of the trunk. Keep the cans dry.' },
  us_flood: { title: 'WATER LINE', paper: true, text: 'Somebody painted a line on the wall at the height of a man and wrote under it: SHE CAME UP TO HERE IN AN HOUR. Under that, in another hand: AND HIGHER.' },
};

// A bar door at an outfall: the interiors' door rules (data/interiors.js DOOR_MATERIALS takes it at boot). It will not
// give to boots or to rounds; a crowbar pries the hinge pins (loud), a hacksaw cuts a bar (slow, quiet).
export const BARS = { name: 'iron grille', kicks: 30, lockHp: 300, bulletSlap: 0, bulletLock: 0, colors: ['#5a4a3a', '#4e463c', '#62503e'], lock: '#8a6a3a' };

// ---- the check the World Forge runs ------------------------------------------------------------------------------------
// items: data/items.js ITEMS (loot rows name real items). Returns { ok, bad: [...], counts }.
export function validateUnderstreet(rows = { SEWER, PIPES, CHAMBERS, WAYS, FLOOD, CURRENT, LIFE, CACHES, US_LOOT, US_LOGS }, items = null) {
  const bad = [], R = rows, hueOk = (hex) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx - mn < 0.08) return true; let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; h = (h * 60 + 360) % 360; return h < 270 || h > 320; };
  const colours = [];
  if (!(R.SEWER.depth >= 3.4 && R.SEWER.depth <= 6)) bad.push(`SEWER.depth ${R.SEWER.depth}: 3.4..6 (a manhole's ladder must clear the wall height and stay short)`);
  if (!(R.SEWER.carry > 0.3 && R.SEWER.carry < 1)) bad.push('SEWER.carry: 0.3..1 (a pipe carries sound further than open ground)');
  for (const [k, P] of Object.entries(R.PIPES)) {
    if (!(Number.isInteger(P.w) && P.w >= 2 && P.w <= 6)) bad.push(`pipe ${k}: w ${P.w} must be a whole 2..6 m`);
    if (!(P.lift >= 0 && P.lift < 1)) bad.push(`pipe ${k}: lift 0..1`);
    colours.push(P.floor, P.wall, P.bench_c ?? P.floor);
  }
  if (R.PIPES.trunk.w - 2 * R.PIPES.trunk.bench < 2) bad.push('trunk: its channel must be 2 m or more between the benches');
  for (const [k, C] of Object.entries(R.CHAMBERS)) { if (!(C.w >= 4 && C.d >= 4)) bad.push(`chamber ${k}: at least 4 x 4`); colours.push(C.floor, C.wall); }
  for (const [k, W] of Object.entries(R.WAYS)) {
    const F = W.flight;
    if (!(F.pitch > 0.3 && F.pitch <= 2.5 && F.w >= 1 && F.speed > 0.2 && F.speed <= 1)) bad.push(`way ${k}: flight pitch 0.3..2.5, w >= 1, speed 0.2..1`);
  }
  if (Math.ceil(R.SEWER.depth / R.WAYS.manhole.flight.pitch) > 3) bad.push('manhole: its shaft must stay within 3 m of run (it stands beside the pipe, under the street)');
  if (!(R.WAYS.grate.enter >= 0 && R.WAYS.grate.enter <= 1 && R.WAYS.outfall.bars >= 0 && R.WAYS.outfall.bars <= 1)) bad.push('grate.enter and outfall.bars are shares 0..1');
  if (R.WAYS.outfall.cut <= R.WAYS.outfall.pry) bad.push('outfall: a cut is slower than a pry (and quiet)');
  if (!(R.FLOOD.dry < R.FLOOD.rain && R.FLOOD.rain < R.FLOOD.storm)) bad.push('FLOOD: dry < rain < storm');
  if (R.FLOOD.storm < 2.6 - R.FLOOD.air) bad.push('FLOOD.storm must fill the trunk to the soffit (wall 2.6 less the air gap): a storm can trap you');
  if (!(R.FLOOD.rain >= R.FLOOD.wade && R.FLOOD.rain < R.FLOOD.swim)) bad.push('FLOOD.rain: knee deep (wade..swim)');
  if (!(R.CURRENT.k > 0 && R.CURRENT.max <= 2.5)) bad.push('CURRENT: k > 0, max <= 2.5 m/s');
  if (!(R.LIFE.nestSize[0] >= 1 && R.LIFE.nestSize[0] <= R.LIFE.nestSize[1] && R.LIFE.rats <= 64)) bad.push('LIFE: nestSize, rats <= 64 (one instanced mesh)');
  for (const [k, T] of Object.entries(R.US_LOOT)) for (const [id] of T.rows) if (items && !items[id]) bad.push(`loot ${k}: no item "${id}"`);
  for (const [k, L] of Object.entries(R.US_LOGS)) { if (!L.title || !L.text) bad.push(`log ${k}: title and text`); if (L.text.length > 320) bad.push(`log ${k}: keep a log to 320 chars`); }
  colours.push(R.FLOOD.colour, R.SEWER.fill, ...BARS.colors);
  for (const c of colours) if (!/^#[0-9a-f]{6}$/i.test(c) || !hueOk(c)) bad.push(`colour ${c}: hue 270-320 is banned (or not #rrggbb)`);
  return { ok: !bad.length, bad, counts: { pipes: Object.keys(R.PIPES).length, chambers: Object.keys(R.CHAMBERS).length, ways: Object.keys(R.WAYS).length, loot: Object.keys(R.US_LOOT).length, logs: Object.keys(R.US_LOGS).length, colours: colours.length } };
}
