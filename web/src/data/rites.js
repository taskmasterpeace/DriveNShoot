// DEATH RITES as rows (docs/design/WEB_DEATH_RITES.md; WEB_DEPTH_PLAN.md §6). What happens to the dead: a body goes
// fresh -> bloated -> rotting -> bones on the game clock and stays where it fell until somebody buries, burns or drags it;
// every settlement and every site has its cemetery (the formula below), its old graves tell its history, and a resident
// who dies with family gets a funeral their people walk to. systems/rites.js runs it; validateRites(rows) is the World
// Forge's check. No loot regeneration (§0 law 2): a body keeps exactly what it had, a buried one takes it into the grave.

// ---- the body on the clock ------------------------------------------------------------------------------------------
// at: the game hour (decay hours, after the climate multipliers) a stage starts. tint: the colour a body's clothes and
// skin go toward (k: how far); swell: torso scale; smell: the radius (m) it draws flies, dogs and the infected from;
// sick: the chance a minute of handling (searching, dragging, burying) makes you sick.
export const DECAY = {
  stages: [
    { id: 'fresh', at: 0, tint: '#6a2a20', k: 0.1, swell: 1, smell: 0, flies: 0, sick: 0 },
    { id: 'bloated', at: 24, tint: '#3c4426', k: 0.5, swell: 1.45, smell: 30, flies: 6, sick: 0.12 },
    { id: 'rotting', at: 72, tint: '#2a2218', k: 0.72, swell: 1.15, smell: 42, flies: 9, sick: 0.25 },
    { id: 'bones', at: 240, tint: '#d8d0b8', k: 1, swell: 0, smell: 0, flies: 0, sick: 0 },
  ],
  // the climate: air above hot (C) runs the clock x heat, below cold x cold; a body in water (depth > wet m) x water
  hot: 30, cold: 5, heat: 1.5, coldMul: 0.5, wet: 0.15, water: 1.3,
  tick: 0.5,          // s between decay passes (every record is cheap: a few multiplies)
  smellEvery: 2,      // s between pulls on the infected near a smelling body
  sickSickness: 'grave_sickness', // the SICKNESS row a handler catches (registered by systems/rites.js)
};

// The off-screen record (like data/population.js FOLD): a body out of view is folded to a record and drawn as a cheap
// instanced corpse; nothing deletes it. Over cap the oldest far records go straight to bones (an event says so); bones
// over boneCap are drawn only nearest-first, never forgotten.
export const BODY_FOLD = { foldAfter: 90, foldR: 70, cap: 400, boneCap: 1200, drawR: 160, drawMax: 140 };

// The sickness a handler catches (merged into data/survival.js SICKNESS at load).
export const GRAVE_SICKNESS = { hours: 14, eff: { staminaRegen: 0.7, waterMul: 1.4, foodMul: 1.2, sway: 1.04 }, over: 'THE GRAVE SICKNESS PASSES' };

// ---- the cemetery formula -------------------------------------------------------------------------------------------
// graves = max(min, ceil(pop x years_settled x rate x (1 + danger)))
export const FORMULA = { rate: 0.02, min: 6, dangerCap: 1 };
// years settled, by a town archetype's age, a site row's kind, rural and bases (seeded +-jitter per place)
export const YEARS = {
  age: { colonial: 100, victorian: 95, '1920s': 85, postwar: 70, sprawl: 55 },
  kind: { holdout: 80, fort: 90, trade: 60, camp: 12, station: 45, ruin: 100, military: 100, industrial: 50, landmark: 70, farm: 75 },
  rural: 40, base: 100, fixed: 90, jitter: 0.15,
};
// danger 0..1: a town by its archetype (damage and the lack of defense), a site by its kind plus its hazards
export const DANGER = {
  town: { damage: 0.6, undefended: 0.4 },
  kind: { ruin: 0.5, military: 0.4, camp: 0.45, fort: 0.35, holdout: 0.25, trade: 0.2, station: 0.3, industrial: 0.35, landmark: 0.3, farm: 0.15 },
  perHazard: 0.15, rural: 0.3, base: 0.5,
};
// pop for places whose rows carry none
export const POP = { rural: { farmstead: 6, ranch: 8, roadside_motel: 5, cabin_camp: 4, trailer_park: 14, truck_stop: 6, stilt_camp: 5 }, ruralDefault: 6, base: 40, site: { ruin: 4, military: 30, landmark: 12, camp: 20, station: 15, industrial: 25 } };

// A site is a BATTLE site (its graves dug as one trench, a mass grave) when its words say a fight happened there.
export const BATTLE_WORDS = /battle|massacre|siege|last stand|mass grave|slaughter|war cemetery|pow_cemetery|national_cemetery|battlefield/i;

// ---- what a cemetery looks like, by kind --------------------------------------------------------------------------
// at: 'edge' (outside a town's built ground), 'on' (inside a site's own footprint), 'plot' (a rural parcel's corner),
// 'lot' (an empty ring lot). layout: 'rows' (sections of family plots in rows that follow the land), 'trench' (one long
// mound, one post a row), 'vault' (a concrete crypt: niches in a wall). mix: a middling family's marker shares (stone,
// wood cross, cairn, iron cross, bare mound; a rich plot leans to stone and iron, a poor one to wood, cairns and bare
// earth: CEM_LAYOUT.wealth). sp: spacing [across, along] in m. wall: what runs round it ('stone' a low dry wall,
// 'rail' posts and two rails, 'picket', 'iron' a low iron railing, 'wire' posts and strands), one gate on the side that
// faces its place. trees: how many stand at its edge (0..3). uniform: every plot the same (no family names, no means).
export const CEMETERY_KINDS = {
  town_cemetery: { name: 'TOWN CEMETERY', at: 'edge', layout: 'rows', mix: { stone: 0.5, cross: 0.25, cairn: 0.05, iron: 0.08, mound: 0.12 }, sp: [2.2, 3.0], wall: 'stone', trees: 2 },
  boot_hill: { name: 'BOOT HILL', at: 'edge', layout: 'rows', mix: { stone: 0.12, cross: 0.45, cairn: 0.18, iron: 0.02, mound: 0.23 }, sp: [2.0, 2.8], wall: 'rail', trees: 1 },
  site_plot: { name: 'BURIAL GROUND', at: 'on', layout: 'rows', mix: { stone: 0.25, cross: 0.35, cairn: 0.12, iron: 0.03, mound: 0.25 }, sp: [2.0, 2.8], wall: 'rail', trees: 1 },
  mass_grave: { name: 'MASS GRAVE', at: 'on', layout: 'trench', mix: { stone: 0, cross: 0.2, cairn: 0, iron: 0, mound: 0.8 }, sp: [1.0, 3.2], wall: 'wire', trees: 0 },
  crypt: { name: 'BUNKER CRYPT', at: 'on', layout: 'vault', mix: { stone: 1, cross: 0, cairn: 0, iron: 0, mound: 0 }, sp: [0.7, 1.0], wall: null, trees: 0 },
  family_plot: { name: 'FAMILY PLOT', at: 'plot', layout: 'rows', mix: { stone: 0.35, cross: 0.4, cairn: 0.08, iron: 0.07, mound: 0.1 }, sp: [2.0, 2.6], wall: 'picket', trees: 1 },
  war_graves: { name: 'WAR GRAVES', at: 'edge', layout: 'rows', mix: { stone: 0.1, cross: 0.85, cairn: 0, iron: 0.05, mound: 0 }, sp: [1.8, 2.6], wall: 'iron', trees: 2, uniform: true },
  lot_yard: { name: 'LOT YARD', at: 'lot', layout: 'rows', mix: { stone: 0.15, cross: 0.35, cairn: 0.15, iron: 0.0, mound: 0.35 }, sp: [2.0, 2.6], wall: 'wire', trees: 0 },
};
// How a 'rows' cemetery is laid out (systems/rites.js lay()). Its grave count stays the formula's; this only decides
// where they lie. A section is at most secW x secD metres; a big cemetery is split into sections either side of a main
// path from the gate, with cross paths between section rows. Graves go in family plots of plot[0]..plot[1] with a
// gap between plots; rows bend with the land (bend m over bendLen m) and each section turns a little (turn rad).
// keep: metres round the wall where the world's scatter (rocks, scrub, trees) stays off. wealth: plot shares
// [poor, middling, rich] and the marker shares a poor and a rich plot use (a middling plot uses its kind's mix).
// spare: room for new graves past the history [min, max, share of the count].
// sunk: past this many years an old mound has sunk to a hollow (some of them); fall: share of old markers down.
export const CEM_LAYOUT = {
  secW: 26, secD: 22, path: 2.4, mainPath: 3.2, margin: 1.8, plot: [2, 5], plotGap: 0.7, bend: 0.7, bendLen: 18, turn: 0.06,
  keep: 4, spare: [6, 24, 0.25], gate: 3.2,
  wealth: { share: [0.4, 0.45, 0.15], poor: { stone: 0.03, cross: 0.42, cairn: 0.25, iron: 0, mound: 0.3 }, rich: { stone: 0.62, cross: 0.06, cairn: 0, iron: 0.3, mound: 0.02 } },
  sunk: 40, fall: 0.14, kerb: 0.6,
};
export const ARCH_BOOT_HILL = ['walled_stronghold', 'oasis_ring', 'badlands_crossroads', 'boom_strip', 'refinery_town', 'interstate_exit'];

// Fixed places that are not citygen plan records (the island town, the Florida holdouts, the ring's quarters).
export const FIXED_CEMETERIES = [
  // out past the grid in the south-west Glass Flats: the island's blocks are built solid and its roads run every 80 m
  { id: 'rust_haven', name: 'RUST HAVEN', kind: 'boot_hill', x: -396, z: 392, pop: 120, years: 90, danger: 0.35 },
];
// The ring's quarters (WEB_STREAMING §1.3): one lot yard per quarter that has households, on its emptiest lot.
export const RING_YARD = { pop: 30, years: 60, danger: 0.4, maxR: 220 };

// ---- the history a cemetery tells (pre-seeded graves) ---------------------------------------------------------------
// The calendar: years After the Fracture. `now` is the setting's year; a grave died somewhere in the place's years.
export const CALENDAR = { now: 100, tag: 'A.F.' };
// causes by weight, scaled by danger (the `d` weight is added x danger); our own words for the old ways to die
export const CAUSES = [
  ['old age', 6, -3], ['the fever', 5, 0], ['bad water', 4, 1], ['the cold winter', 3, 0], ['childbirth', 3, -1],
  ['a raider\'s bullet', 2, 4], ['the infected', 2, 4], ['a fall', 2, 0], ['the burning sickness', 2, 1], ['a knife', 1, 3],
  ['the dust storm', 1, 1], ['hunger', 2, 1], ['a snakebite', 1, 0], ['the hot ground', 1, 2], ['a wreck on the road', 1, 2],
];
export const EPITAPHS = ['REST NOW', 'GONE AHEAD', 'SHE KEPT THE WELL', 'HE HELD THE GATE', 'NO MORE ROAD', 'LOVED', 'FOUND AT LAST', 'WE REMEMBER', 'SLEEP EASY', ''];

// ---- burial verbs --------------------------------------------------------------------------------------------------
// dig: seconds to dig a grave with a shovel (hands: x handMul); each `noiseEvery` s of digging is a `noise` m sound.
// burn: a fuel can's litres it takes, seconds it burns; mark: what an item puts on a grave. stoneCost: what the
// stonecutter takes for a stone at a funeral.
export const BURIAL = {
  dig: 18, handMul: 3, noise: 18, noiseEvery: 2, reach: 3, dragSpeed: 1.6, holdE: 0.4,
  burn: { item: 'fuel_can', s: 12, ash: '#1c1814' },
  mark: { grave_cross: 'cross', headstone: 'stone' },
  stoneCost: 40,
  shovels: ['shovel'],
};
// Items this lane adds (merged into data/items.js ITEMS at load; new keys only, never a change to an existing row).
export const RITES_ITEMS = {
  shovel: { name: 'Shovel', kind: 'tool', kg: 2.2, bulk: 2.4, stack: 1, value: 22, desc: 'A long-handled spade, the blade worn bright. Digs a grave in a third of the time hands do.' },
  grave_cross: { name: 'Grave cross', kind: 'part', kg: 1.6, bulk: 2, stack: 1, value: 6, desc: 'Two boards nailed square, a name burned in. It marks a grave.' },
  headstone: { name: 'Headstone', kind: 'part', kg: 18, bulk: 9, stack: 1, value: 40, desc: 'A cut stone with a name on it. Heavy enough that people know you meant it.' },
};
// The sexton's box at every town cemetery and boot hill (a LOOT table merged into data/items.js LOOT: a new key).
export const SEXTON_LOOT = { rolls: [1, 2], none: 0, rows: [['shovel', 6, 1, 1], ['grave_cross', 5, 1, 2], ['rag', 2, 1, 2]] };

// ---- funerals ------------------------------------------------------------------------------------------------------
// delay: game hours after the death [min, max]; start hour of day; length h; mourners walk at walk m/s; the town's mood
// and standing toward the killer (the player: standing with the dead's faction) move by these.
export const FUNERAL = {
  delay: [24, 48], hour: 10, length: 2, walk: 1.4, attendR: 18,
  wait: 2,      // game hours a funeral waits past its end for a body that is being carried there
  toldAfter: 2, // game hours before a witness of the killing has carried the word to the family (law 6: only what they were told)
  standing: { killer: -8, attended: 3, dug: 4, stone: 6 },
  mood: { gloom: 0.15 },
  ties: ['family'], // RESIDENTS kinds whose members have ties (data/ring.js: a family mourns its own)
};

// ---- the loot law audit (WEB_DEPTH_PLAN §0 law 2): every path that puts goods back -----------------------------------
// state: 'gated' (now needs a visible delivery), 'allowed' (the law keeps it), 'todo' (a later lane's), 'none'.
export const LOOT_LAW = [
  { path: 'trader shelves restock (systems/trade.js restock)', was: 'a new roll of the table every game day', state: 'gated', now: 'only goods a delivery() brought (a courier, a caravan, a producing building)' },
  { path: 'trader keeps (systems/trade.js keep: Ike always has rounds)', was: 'topped up to the row every game day', state: 'gated', now: 'the opening stock once per trader; afterwards only deliveries' },
  { path: 'world containers (inventory.js roll)', was: 'rolled once, box.rolled', state: 'none', now: 'unchanged: rolled once, never refills' },
  { path: 'the dead (body:<id> boxes)', was: 'deleted with their loot (MAX_BODIES on empty-looking, 90 s fold, grapevine eat)', state: 'gated', now: 'kept: folded records, bones keep the box, a burial takes it into a grave:<id> box' },
  { path: 'island pickups (main.js pickups)', was: 'placed once at boot, never respawn', state: 'none', now: 'unchanged' },
  { path: 'foraging regrowth (systems/outdoors.js regrowPerDay)', was: 'plants grow back', state: 'allowed', now: 'the law keeps it (plants grow)' },
  { path: 'rain catchers (systems/outdoors.js refill)', was: 'water from the sky', state: 'allowed', now: 'the law keeps it (rain falls)' },
  { path: 'water/fuel refill items (data/items.js refill)', was: 'fill at a source', state: 'allowed', now: 'only at a real source (river, pump, tank)' },
  { path: 'the mechanic\'s "refill the guns and droppers" (data/npcs.js)', was: 'paid, rounds from nowhere', state: 'todo', now: 'TODO COURIER lane: draw from the mechanic\'s own shelves' },
  { path: 'dialogue give:{ammo,weapon} (content packs, quests)', was: 'a reward minted', state: 'todo', now: 'TODO: quest rewards from the giver\'s own boxes' },
  { path: 'RV / deck water tanks (systems/decks.js)', was: 'filled at a source', state: 'allowed', now: 'unchanged (filled from water that exists)' },
];
export const DELIVERY = { sources: ['courier', 'caravan', 'producer', 'player'] };

// ---- the check -------------------------------------------------------------------------------------------------------
export const RITES_ROWS = { DECAY, BODY_FOLD, FORMULA, YEARS, DANGER, POP, CEMETERY_KINDS, CEM_LAYOUT, FIXED_CEMETERIES, RING_YARD, CAUSES, BURIAL, RITES_ITEMS, FUNERAL, LOOT_LAW };

export function validateRites(rows = RITES_ROWS) {
  const bad = [];
  const S = rows.DECAY?.stages ?? [];
  if (S.map((s) => s.id).join() !== 'fresh,bloated,rotting,bones') bad.push('DECAY.stages must be fresh, bloated, rotting, bones');
  for (let i = 1; i < S.length; i++) if (!(S[i].at > S[i - 1].at)) bad.push(`DECAY stage ${S[i].id} starts before ${S[i - 1].id}`);
  for (const s of S) { if (!/^#[0-9a-f]{6}$/i.test(s.tint)) bad.push(`${s.id}.tint not a hex`); else if (purple(s.tint)) bad.push(`${s.id}.tint is purple`); if (!(s.sick >= 0 && s.sick <= 1)) bad.push(`${s.id}.sick 0..1`); }
  const D = rows.DECAY ?? {};
  if (!(D.heat > 1 && D.coldMul < 1 && D.water > 1)) bad.push('DECAY: heat > 1, coldMul < 1, water > 1');
  const F = rows.FORMULA ?? {};
  if (!(F.rate > 0 && F.min >= 1)) bad.push('FORMULA rate > 0, min >= 1');
  for (const [k, c] of Object.entries(rows.CEMETERY_KINDS ?? {})) {
    if (!['edge', 'on', 'plot', 'lot'].includes(c.at)) bad.push(`${k}.at`);
    if (!['rows', 'trench', 'vault'].includes(c.layout)) bad.push(`${k}.layout`);
    const m = c.mix ?? {}, t = (m.stone ?? 0) + (m.cross ?? 0) + (m.cairn ?? 0) + (m.iron ?? 0) + (m.mound ?? 0);
    if (c.wall && !['stone', 'rail', 'picket', 'iron', 'wire'].includes(c.wall)) bad.push(`${k}.wall ${c.wall}`);
    if (!(c.trees >= 0 && c.trees <= 3)) bad.push(`${k}.trees`);
    if (Math.abs(t - 1) > 0.01) bad.push(`${k}.mix sums to ${t}`);
    if (!(c.sp?.[0] > 0 && c.sp?.[1] > 0)) bad.push(`${k}.sp`);
  }
  const L = rows.CEM_LAYOUT;
  if (L) {
    if (!(L.spare?.[0] >= 1 && L.spare[1] >= L.spare[0])) bad.push('CEM_LAYOUT.spare');
    if (!(L.secW >= 8 && L.secD >= 6 && L.path > 0 && L.mainPath > 0 && L.keep >= 0 && L.plot[0] >= 1 && L.plot[1] >= L.plot[0])) bad.push('CEM_LAYOUT sizes');
    if (Math.abs(L.wealth.share.reduce((a, b) => a + b, 0) - 1) > 0.01) bad.push('CEM_LAYOUT.wealth.share sums to 1');
    for (const w of ['poor', 'rich']) { const m = L.wealth[w]; if (Math.abs(m.stone + m.cross + m.cairn + m.iron + m.mound - 1) > 0.01) bad.push(`CEM_LAYOUT.wealth.${w} sums to 1`); }
  }
  for (const f of rows.FIXED_CEMETERIES ?? []) if (!rows.CEMETERY_KINDS?.[f.kind]) bad.push(`fixed ${f.id}: kind ${f.kind}`);
  for (const c of rows.CAUSES ?? []) if (!(typeof c[0] === 'string' && c[1] > 0)) bad.push(`cause ${c[0]}`);
  const U = rows.FUNERAL ?? {};
  if (!(U.delay?.[0] >= 24 && U.delay?.[1] <= 48 && U.delay[0] <= U.delay[1])) bad.push('FUNERAL.delay within 1-2 game days');
  for (const r of rows.LOOT_LAW ?? []) if (!['gated', 'allowed', 'todo', 'none'].includes(r.state)) bad.push(`LOOT_LAW ${r.path}: state ${r.state}`);
  return { ok: !bad.length, bad };
}
function purple(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.08) return false;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360;
  return h >= 270 && h <= 320;
}
