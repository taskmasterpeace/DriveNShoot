// SITE STORIES + THE TALLY (docs/design/WEB_SITE_STORIES.md). Rows for the living state of every site and town, the
// things that move between them on real roads, the stories their chains write, and the bounty hunters' guild.
//
// A PLACE is a planned town, a SITE row, the island's Rust Haven, or a camp refugees founded. Each one holds a STATE:
// an owner (a faction, a family, or no one), a problem, a stock of goods with a price for each, its people, and a clock
// (the hour it last ran). The clock is the world's (law 3: it runs only while someone is logged in).
// A MOVER is a party on the road between two places: traders with a load, raiders with guns, refugees on foot, allies
// answering a feud, hunters on a contract. Off screen it is a record that covers the ground at the pace its bodies
// would (law 1: no teleports); near you it is real people (and the car they drive).
// A STORY (an arc) is a chain of these events, each a chronicle row whose cause is the row before it; each is also a
// fact in the knowledge model (systems/knowledge.js), heard only by those it reached (law 6).

// ---- the clock ---------------------------------------------------------------------------------------------------------
export const STORY_RULES = {
  tick: 0.5,               // s between record updates (nothing per frame)
  maxCatchUp: 240,         // game hours a tick may run at once (a long sleep)
  linkKm: 32,              // places within this many km trade, raid and hear each other (the 4 nearest)
  links: 4,
  drive: 12,               // m/s a mover's vehicle keeps on screen; off screen drive / sky.timeScale m per game hour (360)
  walk: 1.3,               // m/s on foot (refugees), the same pace as pulls' walkers (39 m per game hour)
  promoteR: 170, demoteR: 260, maxLive: 3, // bodies near you, records far from you, at most three parties at once
  arriveR: 120,            // m from a place's middle a mover has arrived
  hereR: 600,              // m: you stand in a place (its people tell you its news)
  freshH: 48,              // a place's news younger than this rides out with whoever leaves
  campAfter: [22, 34],     // game hours refugees walk before they stop and make camp (if they have not arrived)
  maxMovers: 40,           // parties on the roads at once (the world's, not yours)
  maxPlaces: 320,          // planned places + camps
  dayHour: 6,              // the hour each place does its day (trade, raids, the sick)
};

// ---- goods: a place's stock, and the real items a load turns into when you can see it (law 2) -------------------------
//   base   price per unit in a place that holds a week of it
//   item   the real item a unit becomes in a trunk on screen (a load is the same units, counted)
//   eat    units a person uses per game day (food, water) - a place without them loses people
export const GOODS = {
  food:  { name: 'food',  base: 4,  item: 'beans_tin',    eat: 0.12 },
  water: { name: 'water', base: 3,  item: 'water_bottle', eat: 0.15 },
  fuel:  { name: 'fuel',  base: 9,  item: 'fuel_can' },
  ammo:  { name: 'rounds', base: 7, item: 'ammo_pistol' },
  meds:  { name: 'medicine', base: 12, item: 'bandage' },
  scrap: { name: 'scrap', base: 2,  item: 'scrap' },
};

// ---- what a place's work makes (docs/design/WEB_OCCUPATIONS.md): an occupation's `makes` item counts as one unit of a good.
// An item not named here goes by its ITEMS kind (food, water, med, ammo); anything else (parts, tools, hides, armour) is
// trade goods, counted as scrap. rotgut is drink, not food.
export const MAKES_GOOD = { fuel_can: 'fuel', rotgut: 'scrap', canteen: 'water' };
export const ITEM_KIND_GOOD = { food: 'food', water: 'water', med: 'meds', ammo: 'ammo' };

// ---- military bases as places (data/milbases.js): who holds a base by its row's status and holder
//   pop      people of a held base (its garrison and their hangers-on); an overrun or sealed base has none
//   holders  a row's holder that is not a faction id: 'ruler' (a warlord's base, a family), 'contested' (no one yet)
export const BASE_PLACE = { pop: [30, 70], holders: { ruler: 'family', contested: 'none' } };

// ---- what a place makes, by its kind (the FALLBACK: a place with no workforce of its own - Rust Haven, a camp, a base,
// a dead ruin - or water from a well where nobody's work carries it) (site rows' kind; towns by archetype family) -----------------------------------------
//   make  units per person per game day of each good; want: goods it keeps a week of before it sends a trader out
//   guard share of its people who stand on the wall; wall: the row's wall adds this to defense
export const PLACE_KINDS = {
  town:       { make: { food: 0.05, water: 0.16, scrap: 0.04, fuel: 0.01 }, guard: 0.18 },
  holdout:    { make: { water: 0.17, food: 0.06, ammo: 0.02 }, guard: 0.25 },
  trade:      { make: { scrap: 0.06, fuel: 0.03, water: 0.13, food: 0.04 }, guard: 0.15 },
  farm:       { make: { food: 0.3, water: 0.16 }, guard: 0.1 },
  fort:       { make: { ammo: 0.05, water: 0.15, food: 0.04 }, guard: 0.4 },
  military:   { make: { ammo: 0.04, fuel: 0.03, water: 0.14, food: 0.03 }, guard: 0.35 },
  industrial: { make: { scrap: 0.12, fuel: 0.06, water: 0.12, food: 0.02 }, guard: 0.15 },
  station:    { make: { fuel: 0.04, scrap: 0.04, water: 0.14, food: 0.04 }, guard: 0.15 },
  camp:       { make: { water: 0.14, food: 0.05 }, guard: 0.2 },
  ruin:       { make: { scrap: 0.08, water: 0.12, food: 0.04 }, guard: 0.1 },
  landmark:   { make: { water: 0.14, food: 0.06, scrap: 0.02 }, guard: 0.12 },
  refuge:     { make: { water: 0.1, food: 0.04 }, guard: 0.1 }, // a camp refugees made where they stopped
};
export const WALL_DEFENSE = { none: 0, fence: 4, snow_fence: 2, chainlink: 6, car_husk: 6, palisade: 10, earth_berm: 10, container: 12, adobe: 14, wall: 16, stone_terrace: 16, stone: 18, concrete: 20 };

// ---- owners ------------------------------------------------------------------------------------------------------------
// A site row's society.faction names who holds it. The registered factions keep their own; any other name is a local
// family or council (a family owner), and a row with no people is no one's.
export const OWNER_KINDS = { faction: 'a faction', family: 'a family', none: 'no one' };
export const RAIDERS = ['dustwolves'];  // owners who send raids for a living (and the side a fallen place goes to)

// ---- problems ----------------------------------------------------------------------------------------------------------
//   chance   per place per game day of rising on its own (the world has troubles without you)
//   lasts    [min, max] game days before it runs its course (a sickness or a nest ends sooner if it is healed)
//   kills    share of the people lost a day at full severity; grows: severity a day; heals: with what (and how much)
//   spreads  rides with travellers (a party that leaves a sick place carries it, odds = severity)
//   word     the fact a place holds about it ({place}, {other})
export const PROBLEMS = {
  sickness: { name: 'a sickness', chance: 0.004, lasts: [6, 14], grows: 0.08, kills: 0.03, heals: { meds: 0.15 }, spreads: true, word: 'There is a sickness at {place}: the sick lie in the old school' },
  toll:     { name: 'a raider toll', chance: 0.004, lasts: [4, 10], grows: 0.05, kills: 0, takes: 0.2, word: 'Raiders sit on the road into {place} and take a fifth of every load' },
  dry_well: { name: 'a dry well', chance: 0.003, lasts: [5, 12], grows: 0.1, kills: 0.01, stops: 'water', word: 'The well at {place} has gone dry: they will pay for water' },
  feud:     { name: 'a feud', chance: 0.003, lasts: [6, 16], grows: 0.04, kills: 0, word: '{place} and {other} have fallen out: there has been shooting' },
  cache:    { name: 'a buried cache rumour', chance: 0.003, lasts: [4, 8], grows: 0, kills: 0, draws: true, word: 'They say somebody buried a cache near {place} before the bombs' },
  nest:     { name: 'an infected nest', chance: 0.003, lasts: [8, 20], grows: 0.06, kills: 0.04, word: 'An infected nest has opened under {place}: they lose people at night' },
};

// ---- movers ------------------------------------------------------------------------------------------------------------
//   on       'drive' (a vehicle; type is the car) or 'walk'
//   people   [min, max]; weapon: what they carry; faction: who they are on screen
//   cargo    units of goods they carry at most (traders), what they took (raiders) or what they could carry (refugees)
export const MOVERS = {
  trader:   { on: 'drive', car: 'pickup', people: [2, 2], weapon: ['pistol', null], faction: 'drifter', cargo: 10, names: ['Trader', 'Teamster'], word: 'A trader\'s truck out of {from} for {to}' },
  raiders:  { on: 'drive', car: 'buggy', people: [4, 6], weapon: ['smg', 'shotgun', 'pistol'], faction: 'raider', cargo: 16, names: ['Raid boss', 'Raider'], word: 'A raiding party left {from}: they are headed for {to}' },
  refugees: { on: 'walk', people: [4, 9], weapon: [null], faction: 'drifter', cargo: 6, names: ['Refugee'], word: 'Refugees from {from} on the road toward {to}' },
  allies:   { on: 'drive', car: 'pickup', people: [3, 4], weapon: ['shotgun', 'pistol'], faction: 'drifter', cargo: 0, names: ['Ally'], word: 'Guns from {from} going to stand with {to}' },
  seekers:  { on: 'drive', car: 'sedan', people: [2, 3], weapon: ['pistol', null], faction: 'drifter', cargo: 0, names: ['Digger'], word: 'Diggers out of {from} after the cache near {to}' },
  hunters:  { on: 'drive', car: 'sedan', people: [2, 2], weapon: ['shotgun', 'smg'], faction: 'drifter', cargo: 0, names: ['Tallyman'], word: 'Two tallymen out of {from}' },
};

// ---- the day's decisions ------------------------------------------------------------------------------------------------
export const ECON = {
  weekOf: 7,           // a place wants a week of each good it eats
  surplus: 2.0,        // x what it wants before it will sell a load
  priceMin: 0.5, priceMax: 3.5, // a price never leaves this band of base
  raidChance: 0.35,    // a raider place sends a party on a day it has fighters to spare
  raidMin: 18,         // a raider place keeps at least this many at home
  fallAt: 0.35,        // a place whose defenders drop below this share of its pop (or that loses its fight) falls
  fleeShare: [0.3, 0.6], // of the people of a fallen place who walk out
  allyChance: 0.6,     // a place with a feud asks its owner's other places for help
  seekChance: 0.5,     // a cache rumour sends diggers from the nearest town
};

// ---- the stories: chronicle verbs and how a row reads -------------------------------------------------------------------
// Every row is chronicle-shaped (systems/chronicle.js: a = the arc, v = the verb, p = the place, src = 'story') and
// carries a cause (the row before it in its arc). m: its weight in the chronicle (8+ goes to the legend).
export const STORY_VERBS = {
  trouble:   { m: 2, say: '{problem} came to {place}' },
  traded:    { m: 1, say: 'A trader brought {n} {good} from {from} to {place}' },
  raidout:   { m: 3, say: 'A raiding party of {n} left {from} for {place}' },
  raided:    { m: 5, say: '{from}\'s raiders hit {place}: {lost} dead, {took} goods taken' },
  repelled:  { m: 4, say: '{place} beat off {from}\'s raiders' },
  fell:      { m: 8, say: '{place} fell to {owner}' },
  fled:      { m: 5, say: '{n} people walked out of {from} toward {place}' },
  camped:    { m: 4, say: 'Refugees from {from} made camp at {place}' },
  joined:    { m: 2, say: 'Refugees from {from} were taken in at {place}' },
  sickened:  { m: 3, say: 'Travellers from {from} brought the sickness to {place}' },
  allied:    { m: 3, say: '{from} sent guns to stand with {place}' },
  posted:    { m: 3, say: '{by} posted a bounty of ${pay} on {target}' },
  claimed:   { m: 5, say: '{who} collected the bounty on {target}' },
  paid:      { m: 3, say: '{target} paid off the bounty at {place}' },
  hunterdown:{ m: 6, say: '{who}, a tallyman, was killed by {target}' },
};
// The facts a story's events become (registered into the knowledge model's kinds, data/pulls.js FACT_KINDS):
// pull: true lands on the board (news you could act on), with its told window.
export const STORY_FACT_KINDS = {
  story:    { name: 'News from a place', pull: true, life: 120, icon: 'news' },
  sighting: { name: 'A sighting', pull: false, life: 72, icon: 'eye' },
  posting:  { name: 'Tally bounty', pull: true, life: 240, icon: 'skull' },
};

// ---- THE TALLY: the bounty hunters' guild ------------------------------------------------------------------------------
// A faction of hunters with halls in a few towns and boards in every one. A bounty is posted by a real person or place
// for a real deed (a chronicle row), paid out of the poster's real purse into the guild's escrow (law 2), and carried to
// far boards only by travellers who read it and walk on (law 6). Hunters are real people who ride in pairs, ask at boards
// and in towns, and track from sightings and tips: never from the true position of the one they hunt.
export const GUILD = {
  id: 'tally', name: 'The Tally', hallName: 'Tally House', color: '#b8862e',
  halls: 3,                   // halls in the towns spread furthest apart (Rust Haven always one)
  hunters: 2,                 // pairs per hall
  hunterHp: 130, hunterNames: ['Ash', 'Brodie', 'Cass', 'Dekker', 'Esme', 'Flint', 'Greer', 'Hale', 'Ives', 'Jory', 'Kett', 'Lark', 'Mott', 'Nash', 'Orr', 'Pike'],
  surnames: ['Varga', 'Okoro', 'Lindqvist', 'Tran', 'Moreau', 'Castillo', 'Abernathy', 'Kaur', 'Novak', 'Achebe', 'Sato', 'Petrov'],
  pay: { kill: [60, 160], rob: [30, 80], steal: [20, 60], hunter: [200, 320], raid: [120, 260] }, // by the deed's verb
  payOff: 1.5,                // x the bounty to buy your name off the board (paid to the poster, the guild's cut on top)
  cut: 0.15,                  // the guild's share of a payout
  askEvery: 1,                // game hours between a hunter's questions at the town he is in
  waitAsk: [6, 12],           // hours a pair asks around a town with nothing before they ride to the next
  tipFresh: 96,               // hours a sighting stays worth riding to
  closeR: 300,                // m: at the tip's spot with nothing newer, they ask again
  sightR: 60,                 // m: a hunter on screen who sees his mark knows where he is (saw)
  townSeesR: 420,             // m: a town sees you when you stand in it (a sighting it holds)
  sightEvery: 6,              // game hours between two sightings a place records of you (sooner if you moved 250 m)
  witnessR: 40,               // m: someone of the victim's place who sees a killing makes it a deed worth a bounty
};
// Words on the board (the bounty fact's text) and what a hunter says.
export const GUILD_WORDS = {
  posting: (o) => `WANTED by ${o.by}: ${o.target}, for ${o.deed}. $${o.pay} at any Tally House`,
  paid: (o) => `The bounty on ${o.target} is paid off. The Tally has struck the name`,
  claimed: (o) => `The bounty on ${o.target} was collected by ${o.who}`,
  sighting: (o) => `${o.who} was seen at ${o.place}`,
  hunter: ['"Seen this face?"', '"We are asking, not accusing. Yet."', '"The Tally pays for a straight answer."'],
};

// ---- the World Forge: rows check themselves ----------------------------------------------------------------------------
export function validateSiteStories(D = { STORY_RULES, GOODS, PLACE_KINDS, PROBLEMS, MOVERS, ECON, STORY_VERBS, STORY_FACT_KINDS, GUILD }, items = null, factions = null) {
  const errors = [], warn = [];
  const E = (s) => errors.push(s);
  const R = D.STORY_RULES;
  if (!(R.promoteR < R.demoteR)) E('STORY_RULES: promoteR must be under demoteR');
  if (!(R.drive > R.walk)) E('STORY_RULES: drive must be faster than walk');
  if (!(R.maxLive >= 1 && R.maxLive <= 6)) E('STORY_RULES.maxLive must be 1..6 (each live party is people and a car on screen)');
  if (!(R.linkKm > 0)) E('STORY_RULES.linkKm must be positive');
  for (const [k, gd] of Object.entries(D.GOODS)) {
    if (!(gd.base > 0)) E(`GOODS.${k}: base price must be positive`);
    if (items && !items[gd.item]) E(`GOODS.${k}: item ${gd.item} is not an item`);
  }
  for (const [k, pk] of Object.entries(D.PLACE_KINDS)) {
    for (const g of Object.keys(pk.make ?? {})) if (!D.GOODS[g]) E(`PLACE_KINDS.${k}: makes unknown good ${g}`);
    if (!(pk.guard > 0 && pk.guard < 1)) E(`PLACE_KINDS.${k}: guard must be a share (0..1)`);
    if (!((pk.make?.water ?? 0) > 0)) warn.push(`PLACE_KINDS.${k}: makes no water (it lives on traders)`);
  }
  for (const [k, P] of Object.entries(D.PROBLEMS)) {
    if (!(P.chance >= 0 && P.chance < 0.2)) E(`PROBLEMS.${k}: chance a day must be 0..0.2`);
    if (!(P.kills >= 0 && P.kills < 0.2)) E(`PROBLEMS.${k}: kills must be 0..0.2 a day`);
    if (P.stops && !D.GOODS[P.stops]) E(`PROBLEMS.${k}: stops unknown good ${P.stops}`);
    for (const g of Object.keys(P.heals ?? {})) if (!D.GOODS[g]) E(`PROBLEMS.${k}: heals with unknown good ${g}`);
    if (!P.word?.includes('{place}')) E(`PROBLEMS.${k}: word must name {place}`);
    if (!(P.lasts?.[0] >= 1 && P.lasts[1] >= P.lasts[0])) E(`PROBLEMS.${k}: lasts must be [min>=1, max>=min] days`);
  }
  for (const [k, M] of Object.entries(D.MOVERS)) {
    if (!['drive', 'walk'].includes(M.on)) E(`MOVERS.${k}: on must be drive or walk`);
    if (M.on === 'drive' && !M.car) E(`MOVERS.${k}: a driving party needs a car`);
    if (!(M.people[0] >= 1 && M.people[1] >= M.people[0])) E(`MOVERS.${k}: people must be [min>=1, max>=min]`);
    if (M.on === 'drive' && M.people[1] > 6) E(`MOVERS.${k}: no car seats more than 6`);
  }
  if (!(D.ECON.fallAt > 0 && D.ECON.fallAt < 1)) E('ECON.fallAt must be a share');
  for (const [k, V] of Object.entries(D.STORY_VERBS)) if (!(V.m > 0) || !V.say) E(`STORY_VERBS.${k}: needs m and say`);
  for (const [k, F] of Object.entries(D.STORY_FACT_KINDS)) if (!(F.life > 0)) E(`STORY_FACT_KINDS.${k}: life must be positive`);
  const G = D.GUILD;
  if (!(G.halls >= 1 && G.halls <= 8)) E('GUILD.halls must be 1..8');
  if (!(G.payOff >= 1)) E('GUILD.payOff must be at least 1 (you never buy your name off for less than it is worth)');
  if (!(G.cut >= 0 && G.cut < 0.5)) E('GUILD.cut must be 0..0.5');
  if (G.hunterNames.length < G.halls * G.hunters * 2) E('GUILD.hunterNames: not enough names for every hunter');
  const hue = hueOf(G.color); if (hue >= 270 && hue <= 320) E(`GUILD.color ${G.color} is purple (the art law)`);
  if (factions && !factions[G.id] && factions.ids && !factions.ids.includes(G.id)) warn.push('the guild faction is registered at runtime');
  return { ok: !errors.length, errors, warn };
}
function hueOf(hex) {
  const n = parseInt(String(hex).slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return -1;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
