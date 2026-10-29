// CAMPS AND BASES (docs/design/WEB_CAMPS_BASES.md): a camp for a night, a base for good, a house you rent or buy.
// systems/homes.js runs these rows (g.homes); agent/homes-api.js is the COMMANDS share (camp, base, home) and its checks.
// The laws: nobody cheats (an owner is a real person you stand in front of; a burglar carries off only what he can lift),
// no loot regeneration (a sofa in your base is a sofa somebody else's house no longer has), the world is our own.
import { ITEMS } from './items.js';

// ---- 1. the camp kit: what you carry and what pitching it makes -------------------------------------------------------
// Pitching takes the kit OUT of your pack (it is on the ground now, as one thing you can see); striking puts the same
// pieces back. The fire is the wilds' fire pit (data/outdoors.js CAMP.firepit: 3 deadwood, a real fire you cook on); its
// wood is burnt, so striking leaves the ash ring and returns nothing for it.
export const CAMP_KIT = {
  bedroll: { item: 'bedroll', sleep: 'bedroll', rest: 0.85, warm: 0, hide: 1, size: [0.8, 0.12, 2.0], colour: '#6b5a3c' },
  tent: { item: 'tent', sleep: 'bedroll', rest: 0.95, warm: 4, hide: 0.85, size: [2.2, 1.25, 2.4], colour: '#6e6a4a' }, // walls between you and the eyes: a little harder to see you asleep
};
export const CAMP_BELLS = { item: 'trip_bells', r: 18, posts: 10, colour: '#a08a4a' }; // a cord of bells on stakes round the camp, out past a sleeper's own ear (data/survival.js SLEEP.wakeR 12 m)

// ---- 2. the camp's rules -----------------------------------------------------------------------------------------------
// SEEN: how far off someone notices the camp: base (day | night) x the fire's multiplier (a lit fire at night is a beacon,
// by day a smoke column) x the kit's hide. SMELT: woodsmoke carries `smellR` m (the infected and dogs lift their heads).
// RISK: the prowl odds a game hour asleep (survival.js rolls it the way it rolls any shelter's `danger`):
//   danger = base x road x town x horde x fire x lookout   (each factor applies only inside its band)
export const CAMP_RULES = {
  seen: { day: 40, night: 14 },                     // m, a cold camp
  fire: { day: 1.8, night: 16, smellR: 140 },       // a lit fire: x1.8 by day (smoke), x16 at night (the glow)
  danger: 0.12,                                     // a game hour, bare (the rough sleeper's 0.18 is the open roadside)
  road: { r: 60, mul: 2.2 },                        // within 60 m of a road: passers-by
  town: { r: 450, mul: 1.7 },                       // within 450 m of a settlement's edge
  horde: { r: 220, mul: 2.6, min: 6 },              // 6+ of the infected within 220 m
  fireMul: { day: 1.2, night: 2.0 },                // a fire you can see draws them to it
  lookout: { mul: 0.45, warnR: 46, warnRNight: 30 },// someone on watch: the danger roll falls, and you are woken at warnR
  keepOff: { road: 9, water: 0.05 },                // pitch at least 9 m off a road's edge, on dry ground
  bellsWake: true,                                  // a hostile crossing the bells wakes the camp
  watchHours: 2,                                    // the lookout rotation: each crew member stands a 2-hour watch
  pitchS: 20, strikeS: 14,                          // seconds of work (the timed-actions lane's clock when it lands)
};

// ---- 3. fortification: what you add to a claimed building ----------------------------------------------------------
// def: points toward the base's DEFENSE (capped at BASE_RULES.defenseCap). Every one costs real things from your pack.
// windows/doors are per opening of the building (the interiors' own boards and the gadgets' planks barricade); the rest
// are one-offs drawn round the yard. A turret needs a turret you FOUND (turret_kit: in no loot table yet - a content call).
export const FORTIFY = {
  board_windows: { name: 'boarded windows', per: 'window', cost: [['planks', 1]], def: 0.03, secs: 6 },
  bar_doors: { name: 'barred doors', per: 'door', cost: [['planks', 1]], def: 0.06, secs: 5 },
  wall: { name: 'yard wall', cost: [['scrap', 8], ['planks', 4]], def: 0.22, secs: 90, part: { kind: 'wall', h: 2.2, t: 0.35, colour: '#5d5446' } },
  gate: { name: 'gate', needs: 'wall', cost: [['scrap', 4], ['planks', 2]], def: 0.06, secs: 40, part: { kind: 'gate', h: 2.4, w: 4, colour: '#4a4038' } },
  watchtower: { name: 'watchtower', cost: [['planks', 6], ['scrap', 3]], def: 0.12, secs: 120, part: { kind: 'tower', h: 4.5, w: 2.2, colour: '#6a5236' }, warnR: 70 },
  turret: { name: 'turret', cost: [['turret_kit', 1], ['ammo_rifle', 30]], def: 0.15, secs: 60, part: { kind: 'turret', h: 1.4, w: 0.9, colour: '#3d3b37' } },
};

// ---- 4. furniture: pieces of the world, carried home -----------------------------------------------------------------
// Every lived-in building holds pieces (systems/homes.js piecesOf: seeded from the building's id, the same every visit).
// A piece has ONE place in the world: where it was made, your hands, a vehicle, or a room in your base. Lifting it from
// a house somebody owns is a theft (the steal deed). hands: carried in your arms (you walk at `slow`, no gun up).
export const FURNITURE = {
  sofa: { name: 'sofa', kg: 42, bulk: 900, slow: 0.55, size: [2.0, 0.85, 0.9], colour: '#7a5a42', uses: ['bunk', 'lounge'] },
  armchair: { name: 'armchair', kg: 18, bulk: 420, slow: 0.7, size: [0.9, 0.9, 0.9], colour: '#6a4a3a', uses: ['lounge'] },
  bed_frame: { name: 'bed', kg: 35, bulk: 800, slow: 0.6, size: [1.4, 0.55, 2.0], colour: '#8a7a62', uses: ['bunk', 'infirmary'] },
  cot: { name: 'cot', kg: 8, bulk: 200, slow: 0.85, size: [0.75, 0.45, 1.9], colour: '#5f6a52', uses: ['bunk', 'infirmary'] },
  table: { name: 'table', kg: 22, bulk: 500, slow: 0.7, size: [1.5, 0.75, 0.9], colour: '#7c6446', uses: ['kitchen', 'armory', 'workshop'] },
  cabinet: { name: 'cabinet', kg: 28, bulk: 450, slow: 0.65, size: [1.0, 1.8, 0.5], colour: '#6c5a44', uses: ['kitchen', 'infirmary', 'storage'], holds: 120 },
  gun_rack: { name: 'gun rack', kg: 14, bulk: 260, slow: 0.8, size: [1.2, 1.6, 0.35], colour: '#4e4236', uses: ['armory'], holds: 160 },
  stove: { name: 'wood stove', kg: 60, bulk: 300, slow: 0.45, size: [0.8, 0.9, 0.7], colour: '#3a3836', uses: ['kitchen'] },
  workbench: { name: 'workbench', kg: 40, bulk: 700, slow: 0.55, size: [1.8, 0.9, 0.8], colour: '#6e5a3e', uses: ['workshop', 'armory'] },
  dog_bed: { name: 'dog bed', kg: 4, bulk: 120, slow: 0.95, size: [0.9, 0.2, 0.7], colour: '#7a6a4a', uses: ['kennel'] },
  locker: { name: 'steel locker', kg: 30, bulk: 400, slow: 0.6, size: [0.6, 1.9, 0.5], colour: '#59605a', uses: ['armory', 'storage'], holds: 140 },
};
// What each kind of building holds (a seeded draw: n pieces from its list).
export const FURNISHED = {
  house: { n: [3, 5], from: ['sofa', 'armchair', 'bed_frame', 'table', 'cabinet', 'stove', 'dog_bed'] },
  bungalow: { n: [3, 5], from: ['sofa', 'armchair', 'bed_frame', 'table', 'cabinet', 'stove'] },
  cabin: { n: [2, 3], from: ['cot', 'table', 'stove', 'cabinet'] },
  trailer: { n: [2, 3], from: ['cot', 'sofa', 'table', 'cabinet'] },
  farmhouse: { n: [4, 6], from: ['sofa', 'bed_frame', 'bed_frame', 'table', 'cabinet', 'stove', 'workbench', 'dog_bed'] },
  ranch_house: { n: [4, 6], from: ['sofa', 'armchair', 'bed_frame', 'table', 'cabinet', 'gun_rack', 'stove'] },
  adobe: { n: [2, 4], from: ['cot', 'table', 'cabinet', 'stove'] },
  rowhouse: { n: [2, 4], from: ['sofa', 'bed_frame', 'table', 'cabinet'] },
  stilt_house: { n: [2, 3], from: ['cot', 'table', 'cabinet'] },
  motel: { n: [3, 6], from: ['bed_frame', 'bed_frame', 'cot', 'table', 'armchair'] },
  apartment: { n: [3, 5], from: ['sofa', 'bed_frame', 'table', 'cabinet', 'armchair'] },
  truck_stop: { n: [2, 4], from: ['workbench', 'locker', 'table', 'cabinet'] },
  _default: { n: [1, 3], from: ['table', 'cabinet', 'cot'] },
};
// Hauling: what a vehicle's bed or cargo box holds (litres of bulk); a car with no bed holds none.
export const HAUL = { reach: 3.2, liftS: 3, setS: 3, vehicle: { pickup: 1800, van: 2600, rv: 1400, truck: 3400, semi: 6000, _default: 0 } };

// ---- 5. rooms: what a room of the base is for, when it has what it needs ------------------------------------------
// needs: furniture kinds that must be placed in it; gives: what a working room does (read by systems/homes.js).
export const ROOMS = {
  bunk: { name: 'bunkroom', needs: ['bunk'], gives: { crewBeds: 1 } },             // one crew bed per piece used as a bunk
  infirmary: { name: 'infirmary', needs: ['infirmary'], gives: { rest: 0.08, heal: 1.5 } },
  armory: { name: 'armory', needs: ['armory'], gives: { stash: 160 } },
  kitchen: { name: 'kitchen', needs: ['kitchen'], gives: { stash: 80, cook: true } },
  kennel: { name: 'kennel', needs: ['kennel'], gives: { dogRest: true } },
  workshop: { name: 'workshop', needs: ['workshop'], gives: { repair: 1.25 } },
  lounge: { name: 'lounge', needs: ['lounge'], gives: { mood: 0.04 } },
  storage: { name: 'storeroom', needs: ['storage'], gives: { stash: 120 } },
};

// ---- 6. the base -----------------------------------------------------------------------------------------------------
// claim: a CLAIMABLE building (data/citygen.js KINDS claimable) that is EMPTY (no living owner), CLEARED (no hostile alive
// inside it), or TAKEN (its owner was hostile or is dead: the taking is a deed against them). A friendly owner's house is
// rented or bought (TENURE), never claimed.
export const BASE_RULES = {
  stash: 240, defenseCap: 0.85, clearR: 2,          // the base stash's litres before rooms; a hostile within the walls (+2 m) blocks a claim
  max: 3,                                           // bases one player may hold on the shard
  trespassR: 0,                                     // a non-friend inside a base is a trespasser (reported; others steer by ownerAt)
};
// Raids on a base you are away from (the old metaworld rule: walls thin raids). A game day's odds:
//   p = base x exposure x (1 - defense) x (stash worth > worthFloor ? 1 : 0.3) x (protection paid ? protect : 1)
// exposure: in a holding town townR, in a fallen one fallenR, out in the open open (x horde when 6+ infected are near).
// A raid sends ONE burglar (a person record: name, flag, faction); he breaks in (each point of defense is time, and
// `giveUp` of defense sends him home with nothing), then takes the best worth-per-kg he can carry (carryKg) and walks off.
export const RAID = {
  base: 0.22, away: 150, exposure: { town: 0.7, fallen: 1.5, open: 1.0, horde: 1.8 }, worthFloor: 60, protect: 0.4,
  carryKg: 24, carryL: 60, giveUp: 0.6, factions: ['raider', 'drifter'],
  names: ['Coyle', 'Ash Pruitt', 'Little Moss', 'Varga', 'Dell Sutter', 'Old Tam', 'Rook', 'Nita Shay', 'Gus Ebert', 'Lorne'],
};

// ---- 7. owning a house in a town: rent or buy from whoever really owns it --------------------------------------------
// An owner is a record (systems/homes.js owners): a FACTION (the town's holder, data via systems/sitestories.js), a
// FAMILY (a household: the head deals) or a LANDLORD (one person who owns a share of a town's houses). The family head or
// landlord is a real person at the house's door when the town is near; a faction's houses are dealt by its quartermaster
// (the same: a person at the door). Money goes into the owner's purse; it never vanishes.
//   price = round(perM2 x floor area x storeys x kindMul x stateMul), rent = round(price x rentShare) a week
export const TENURE = {
  perM2: 5.5, rentShare: 0.06, kindMul: { trailer: 0.5, cabin: 0.6, stilt_house: 0.7, adobe: 0.8, bungalow: 0.95, house: 1, rowhouse: 0.9, farmhouse: 1.2, ranch_house: 1.3, motel: 1.6, apartment: 1.8, truck_stop: 1.7 },
  stateMul: { holding: 1, overrun: 0.4 }, reach: 4, graceDays: 2, weekDays: 7,
  tax: { share: 0.025, graceDays: 3, burnAfter: 2 },  // property tax / protection to the town's holder: share of price a week
  owners: { faction: 0.25, family: 0.45, landlord: 0.30 }, ruralEmpty: 0.4,
  surnames: ['Hollis', 'Marchetti', 'Okafor', 'Duval', 'Brandt', 'Ruiz', 'Takeda', 'Lindqvist', 'Abernathy', 'Kowal', 'Nakamura', 'Ferreira', 'Boateng', 'Quill', 'Haddad'],
  given: ['Ada', 'Bo', 'Cal', 'Dina', 'Ezra', 'Fay', 'Gil', 'Hana', 'Ivo', 'June', 'Kip', 'Lu', 'Mae', 'Ned', 'Ora', 'Pim'],
  flags: ['US', 'MX', 'CA', 'IE', 'IT', 'NG', 'CU', 'DE', 'JP', 'JM', 'CO', 'BR', 'GH', 'HT', 'PH', 'KR'], // every one drawn in ui/portrait.js FLAGS
};

// ---- 8. new things (rows added to ITEMS the way the wilds add skills: only if nobody has them) --------------------------
// tent and trip bells are in no loot table yet (a content call, like the portable radio); `camp give=` hands them in tests.
export const HOME_ITEMS = {
  tent: { name: 'Tent', kind: 'tool', kg: 2.8, bulk: 9, stack: 1, value: 40, desc: 'A two-pole ridge tent, patched at one corner. Walls against the wind, and against the eyes.' },
  trip_bells: { name: 'Trip Bells', kind: 'tool', kg: 0.7, bulk: 2, stack: 1, value: 14, desc: 'A coil of cord strung with sheep bells and eight stakes. Anything that walks into it rings.' },
  turret_kit: { name: 'Salvaged Turret', kind: 'part', kg: 22, bulk: 30, stack: 1, value: 420, desc: 'A pintle gun on a tripod with a motion trip, pulled off something that is not coming back.' },
};
for (const [k, row] of Object.entries(HOME_ITEMS)) if (!ITEMS[k]) ITEMS[k] = row;

export const HOMES_ROWS = { CAMP_KIT, CAMP_BELLS, CAMP_RULES, FORTIFY, FURNITURE, FURNISHED, HAUL, ROOMS, BASE_RULES, RAID, TENURE, HOME_ITEMS };

// The World Forge's check: every number in its range, every reference resolves.
export function validateHomes(R = HOMES_ROWS) {
  const bad = [];
  const pos = (v, w) => { if (!(typeof v === 'number' && v > 0 && Number.isFinite(v))) bad.push(`${w} must be > 0 (${v})`); };
  for (const [k, K] of Object.entries(R.CAMP_KIT)) { if (!ITEMS[K.item]) bad.push(`CAMP_KIT.${k}: no item ${K.item}`); if (!(K.hide > 0 && K.hide <= 1)) bad.push(`CAMP_KIT.${k}.hide 0..1`); pos(K.rest, `CAMP_KIT.${k}.rest`); }
  const C = R.CAMP_RULES;
  if (!(C.fire.night > C.fire.day && C.fire.day >= 1)) bad.push('CAMP_RULES.fire: night must beat day, day >= 1 (a fire never hides you)');
  if (!(C.seen.day > C.seen.night)) bad.push('CAMP_RULES.seen: a cold camp is seen farther by day than by night');
  if (!(C.lookout.mul > 0 && C.lookout.mul < 1)) bad.push('CAMP_RULES.lookout.mul 0..1');
  for (const k of ['road', 'town', 'horde']) if (!(C[k].mul >= 1)) bad.push(`CAMP_RULES.${k}.mul >= 1 (risk rises)`);
  for (const [k, F] of Object.entries(R.FORTIFY)) { pos(F.def, `FORTIFY.${k}.def`); for (const [id, n] of F.cost) { if (!ITEMS[id]) bad.push(`FORTIFY.${k}: no item ${id}`); pos(n, `FORTIFY.${k} ${id}`); } if (F.needs && !R.FORTIFY[F.needs]) bad.push(`FORTIFY.${k}.needs ${F.needs}`); }
  const uses = new Set(Object.values(R.FURNITURE).flatMap((f) => f.uses));
  for (const [k, F] of Object.entries(R.FURNITURE)) { pos(F.kg, `FURNITURE.${k}.kg`); if (!(F.slow > 0 && F.slow <= 1)) bad.push(`FURNITURE.${k}.slow 0..1`); for (const u of F.uses) if (!R.ROOMS[u]) bad.push(`FURNITURE.${k}: no room ${u}`); }
  for (const [k, L] of Object.entries(R.FURNISHED)) { if (!(L.n[0] >= 0 && L.n[1] >= L.n[0])) bad.push(`FURNISHED.${k}.n`); for (const f of L.from) if (!R.FURNITURE[f]) bad.push(`FURNISHED.${k}: no piece ${f}`); }
  for (const [k, Rm] of Object.entries(R.ROOMS)) for (const n of Rm.needs) if (!uses.has(n)) bad.push(`ROOMS.${k}: nothing serves ${n}`);
  const T = R.TENURE, o = T.owners;
  if (Math.abs(o.faction + o.family + o.landlord - 1) > 1e-6) bad.push('TENURE.owners must sum to 1');
  if (!(T.rentShare > 0 && T.rentShare < 0.5)) bad.push('TENURE.rentShare 0..0.5');
  if (T.flags.some((f) => !/^[A-Z]{2}$/.test(f))) bad.push('TENURE.flags: two-letter country codes');
  if (!(R.RAID.giveUp > 0 && R.RAID.giveUp <= R.BASE_RULES.defenseCap)) bad.push('RAID.giveUp must be reachable under the defense cap');
  pos(R.RAID.carryKg, 'RAID.carryKg');
  return { ok: !bad.length, bad, rows: { kit: Object.keys(R.CAMP_KIT).length, fortify: Object.keys(R.FORTIFY).length, furniture: Object.keys(R.FURNITURE).length, rooms: Object.keys(R.ROOMS).length } };
}
