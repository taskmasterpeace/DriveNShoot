// PULLS: why go out today (docs/design/WEB_PULLS.md). Rows for the KNOWLEDGE model (law 6: nobody knows what they weren't
// told) and the PULLS that ride on it: bars, people on the road, the radio, town boards, your own needs.
//
// A FACT is { what, where, who, when, source, age, confidence }. People and places HOLD facts; a fact moves only by a
// CHANNEL below. Every copy keeps where it came from and how old it is, and a copy is only as good as the one it was
// copied from (confidence multiplies down the chain). A fact is a snapshot: the hitchhiker it names has walked on since.
//
// A PULL is a real person or event in the world (a record with a position, a clock and a purse), and the only way to hear
// of one is a fact about it. Rewards come out of somebody's real stock (law 2): a purse, a shelf, a town's chest.

// ---- channels: how a fact travels -------------------------------------------------------------------------------------
//   conf     the copy's confidence = the teller's confidence x this
//   range    m: how far the channel carries (said: face to face; radio: from the transmitter)
//   speed    m per game hour (grapevine: a trader's truck between towns; the fact rides with it)
//   needs    what the hearer must have (radio: a set in a car or a portable in the pack)
export const CHANNELS = {
  saw:       { name: 'saw it', conf: 1.0, range: 70, rangeNight: 26, desc: 'with your own eyes (line of sight inside the sight range)' },
  said:      { name: 'told in person', conf: 0.9, range: 4, desc: 'face to face: a barkeep, a drinker, a rider, a stranger' },
  radio:     { name: 'heard on the radio', conf: 0.85, range: 2600, needs: 'radio', desc: 'a broadcast: only inside its range, only with a set' },
  board:     { name: 'read on a board', conf: 0.95, range: 3, desc: 'written on a town board: read where it hangs' },
  note:      { name: 'read a note', conf: 1.0, range: 2, desc: 'written by the one who left it' },
  grapevine: { name: 'the grapevine', conf: 0.8, speed: 450, hops: 3, desc: 'town to town with the traders: arrives after the road is driven' },
};

// ---- what a fact can be about -----------------------------------------------------------------------------------------
//   pull     the fact names a pull (it lands on the board); false: news, an outcome, a warning
//   life     game hours the told window lasts (the board shows it running out, then EXPIRED)
export const FACT_KINDS = {
  hitchhiker: { name: 'Hitchhiker', pull: true, life: 30, icon: 'thumb' },
  stranded:   { name: 'Stranded driver', pull: true, life: 20, icon: 'car' },
  caravan:    { name: 'Broken-down caravan', pull: true, life: 14, icon: 'wagon' },
  refugees:   { name: 'Refugees on the road', pull: true, life: 40, icon: 'people' },
  trader:     { name: "Lone trader's cart", pull: true, life: 40, icon: 'cart' },
  wreck:      { name: 'A body by a wreck', pull: true, life: 200, icon: 'wreck' },
  medic:      { name: 'Medic call', pull: true, life: 4, icon: 'cross' },
  distress:   { name: 'Distress call', pull: true, life: 8, icon: 'radio' },
  bounty:     { name: 'Bounty', pull: true, life: 96, icon: 'skull' },
  work:       { name: 'Work order', pull: true, life: 72, icon: 'board' },
  missing:    { name: 'Missing person', pull: true, life: 30, icon: 'eye' },
  weather:    { name: 'Weather warning', pull: true, life: 10, icon: 'cloud' },
  need:       { name: 'Your own need', pull: true, life: 999, icon: 'need' },
  funeral:    { name: 'Funeral', pull: true, life: 48, icon: 'news' },   // death rites' funerals, carried as word (systems/rites.js learn)
  outcome:    { name: 'What happened', pull: false, life: 999, icon: 'news' },
  place:      { name: 'A place', pull: false, life: 999, icon: 'pin' },
};

// ---- the rules ---------------------------------------------------------------------------------------------------------
export const PULL_RULES = {
  tick: 0.5,                 // s between record updates (nothing per frame)
  maxRoad: 8,                // road pulls alive in the world at once
  birthEvery: [3, 7],        // game hours between road births (each corridor near you)
  birthR: [450, 2600],       // m along the road from you a road person is born: never at you, never in sight
  viewPad: 10,               // m past the camera's ground radius that still counts as "in view" (never born in it)
  shoulder: 2.4,             // m past the road's edge a walker keeps to
  walk: 1.3,                 // m/s a walker walks (off screen on the world clock the same: walk / sky.timeScale m per game hour)
  promoteR: 170, demoteR: 260,
  townR: 420,                // m: a walker this close to the town they walk to has arrived
  rideDrop: 260,             // m: a rider asks to be let out this close to where they are going
  rideTalk: 25,              // s riding between the things a rider tells you
  robAfter: 18,              // s riding before a robber makes their move
  hireDays: 2,               // game days a hired gun stays on
  sightDay: 70, sightNight: 26, // m: seeing a road person is a fact you hold (saw)
  townHolds: 40, personHolds: 12, playerHolds: 80, // facts a holder keeps (oldest dropped)
  hopsMax: 3,
  radioEvery: 0.5,           // game hours between repeats of a live broadcast
  medicR: 3,                 // m: close enough to patch someone up
  needEvery: 2,              // s between reads of your own needs
};

// The pulls themselves (row per kind): who they are, how many, what they carry, what they pay, how they are heard.
//   heard    the channels this kind is born telling (the first holder: a town, its radio, its board, or nobody)
//   people   [min, max] in the record; purse [min, max] cash each; items: the real stock they carry
//   pay      [min, max] what they offer, never more than their purse holds; reward: what their TOWN pays out of its chest
//            when they are brought home (a missing person)
//   rob      share who rob the one who picks them up (they carry the gun to do it)
//   deadline game hours from birth until the clock decides it without you (die, get hit, move on)
export const PULL_KINDS = {
  hitchhiker: { road: true, walks: true, people: [1, 1], purse: [8, 60], pay: [10, 45], rob: 0.12, items: [['jerky', 1, 3], ['water_bottle', 0, 1]], heard: ['saw', 'said'], faction: 'drifter', name: ['Hitchhiker'] },
  stranded:   { road: true, people: [1, 2], purse: [20, 90], pay: [25, 70], needs: 'fuel_can', items: [['scrap', 0, 2]], heard: ['radio', 'saw'], car: 'sedan', faction: 'drifter', name: ['Stranded driver'] },
  caravan:    { road: true, people: [3, 4], purse: [30, 120], pay: [60, 140], deadline: [6, 12], stock: [['beans_tin', 4, 10], ['water_bottle', 3, 8], ['scrap', 4, 10], ['ammo_pistol', 12, 36]], heard: ['radio', 'grapevine'], car: 'pickup', faction: 'drifter', name: ['Caravan hand', 'Caravan boss'] },
  refugees:   { road: true, walks: true, people: [3, 5], purse: [0, 12], pay: [0, 0], needs: 'food', items: [['photograph', 0, 1]], heard: ['saw', 'grapevine'], faction: 'drifter', name: ['Refugee'] },
  trader:     { road: true, walks: true, people: [1, 1], purse: [40, 160], pay: [0, 0], stock: [['bandage', 2, 6], ['beans_tin', 2, 6], ['water_bottle', 2, 4], ['ammo_pistol', 12, 48], ['spark_plugs', 0, 2], ['rotgut', 0, 2]], heard: ['saw', 'grapevine', 'said'], faction: 'drifter', name: ['Trader'] },
  wreck:      { road: true, people: [1, 1], dead: true, purse: [5, 40], items: [['photograph', 1, 1], ['ammo_pistol', 0, 12], ['bandage', 0, 2]], heard: ['saw', 'grapevine'], car: 'sedan', name: ['Driver'] },
  medic:      { road: false, people: [1, 1], purse: [15, 70], pay: [20, 60], deadline: [2.5, 4], items: [['water_bottle', 0, 1]], heard: ['radio'], faction: 'drifter', name: ['Caller'] },
  missing:    { road: false, people: [1, 1], purse: [0, 20], reward: [30, 80], deadline: [18, 30], items: [['photograph', 1, 1]], heard: ['board', 'said'], faction: 'drifter', name: ['Missing'] },
  bounty:     { town: true, pay: [80, 200], kills: [2, 4], heard: ['board', 'radio', 'said'] },
  work:       { town: true, pay: [30, 90], want: [['scrap', 4, 10], ['beans_tin', 3, 6], ['fuel_can', 1, 1], ['bandage', 3, 6]], heard: ['board', 'said'] },
  weather:    { radio: true, heard: ['radio'] },
};

// Bars: a barkeep and drinkers in every saloon. A drink is a real bottle off the bar's own shelf (rolled once, never
// refilled unless somebody delivers: law 2). A rumour is a fact the barkeep actually holds.
export const BAR = {
  drink: 'rotgut', price: 6, stock: [10, 24],          // the bar's own bottles
  purse: [60, 200],                                    // the till: cards and bounties are paid out of it
  drinkers: [4, 6], drinkerPurse: [10, 60],          // two on the stools, the rest seated at the tables
  room: { tables: [3, 5], piano: 0.7, darts: 0.8 },   // how a bar is dressed (systems/pulls.js plan, furnish)
  cards: { stake: [5, 25], skill: 'luck' },            // a hand of cards against a drinker: the stake comes out of their purse
  gun: { share: 0.5, price: [40, 90], weapon: 'pistol', hp: 120 }, // a drinker who sells their gun hand by the day
  fight: { after: 2, chance: 0.35 },                  // a drinker you have beaten at cards this many times takes a swing
  names: { keep: ['Barkeep'], drinker: ['Drinker', 'Regular', 'Old hand', 'Drover'], gun: ['Hired gun'] },
  colors: { keep: { shirt: '#5a4632', pants: '#2e2a24', hat: '#2a241e', hatStyle: 'short' } },
};

// Words, our own (ip-lint scans them).
export const PULL_WORDS = {
  hitchhiker: (p) => `${p.who} walking ${p.road} toward ${p.toName}, thumb out`,
  stranded: (p) => `${p.who} stuck on ${p.road} with a dry tank, near mile ${p.mile}`,
  caravan: (p) => `a caravan broken down on ${p.road} near mile ${p.mile}, ${p.n} hands and a load. Raiders work that stretch`,
  refugees: (p) => `${p.n} people walking ${p.road} toward ${p.toName}, with nothing`,
  trader: (p) => `a trader pushing a cart up ${p.road} toward ${p.toName}, selling as they go`,
  wreck: (p) => `a wreck on ${p.road} near mile ${p.mile}, a body by it`,
  medic: (p) => `${p.who} bleeding out at ${p.placeName}. Needs a medic inside ${p.hours} hours`,
  missing: (p) => `${p.who} went out from ${p.fromName} and never came back. Last seen toward ${p.placeName}`,
  bounty: (p) => `${p.fromName} pays $${p.pay} for ${p.kills} Dustwolves put down at ${p.placeName}`,
  work: (p) => `${p.fromName} needs ${p.n} ${p.itemName}. Pays $${p.pay} at the bar`,
  weather: (p) => `${p.weatherName} coming in by ${p.hourName}`,
  need: (p) => p.text,
};

// ---- validation (the World Forge reads these) --------------------------------------------------------------------------
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const range = (v) => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) && v[0] <= v[1];

// The knowledge rows: channels with a confidence in (0, 1], ranges / speeds that are positive, fact kinds with a life.
export function validateKnowledge(rows = { CHANNELS, FACT_KINDS }) {
  const errors = [];
  for (const [id, c] of Object.entries(rows.CHANNELS ?? {})) {
    if (!num(c.conf) || c.conf <= 0 || c.conf > 1) errors.push(`channel ${id}: conf must be in (0, 1]`);
    if (c.range !== undefined && (!num(c.range) || c.range <= 0)) errors.push(`channel ${id}: range must be > 0`);
    if (c.speed !== undefined && (!num(c.speed) || c.speed <= 0)) errors.push(`channel ${id}: speed must be > 0`);
    if (c.range === undefined && c.speed === undefined) errors.push(`channel ${id}: needs a range (in person, a broadcast) or a speed (carried)`);
    if (!c.name) errors.push(`channel ${id}: no name`);
  }
  for (const [id, k] of Object.entries(rows.FACT_KINDS ?? {})) {
    if (!num(k.life) || k.life <= 0) errors.push(`fact kind ${id}: life must be > 0`);
    if (typeof k.pull !== 'boolean') errors.push(`fact kind ${id}: pull must be true or false`);
  }
  return { ok: errors.length === 0, errors };
}

// The pull rows: every kind is a fact kind, heard only by known channels, with sane ranges and real items.
export function validatePulls(rows = PULL_KINDS, items = null, channels = CHANNELS, facts = FACT_KINDS) {
  const errors = [];
  for (const [id, k] of Object.entries(rows)) {
    if (!facts[id]) errors.push(`pull ${id}: no fact kind of that name`);
    if (!Array.isArray(k.heard) || !k.heard.length) errors.push(`pull ${id}: heard must list its channels`);
    for (const ch of k.heard ?? []) if (!channels[ch]) errors.push(`pull ${id}: unknown channel ${ch}`);
    for (const f of ['people', 'purse', 'pay', 'reward', 'deadline', 'kills']) if (k[f] !== undefined && !range(k[f])) errors.push(`pull ${id}: ${f} must be [min, max]`);
    if (k.people && k.people[0] < 1) errors.push(`pull ${id}: a pull with people needs at least one`);
    if (k.pay && k.purse && k.pay[0] > k.purse[1]) errors.push(`pull ${id}: pays more than any purse could hold`);
    if (k.rob !== undefined && (!num(k.rob) || k.rob < 0 || k.rob > 1)) errors.push(`pull ${id}: rob is a share in [0, 1]`);
    for (const f of ['items', 'stock', 'want']) for (const r of k[f] ?? []) {
      if (!Array.isArray(r) || r.length !== 3 || !num(r[1]) || !num(r[2]) || r[1] > r[2]) errors.push(`pull ${id}: ${f} row ${JSON.stringify(r)} must be [item, min, max]`);
      else if (items && !items[r[0]]) errors.push(`pull ${id}: ${f} names an item that does not exist: ${r[0]}`);
    }
    if (k.needs && k.needs !== 'food' && items && !items[k.needs]) errors.push(`pull ${id}: needs an item that does not exist: ${k.needs}`);
  }
  if (items && !items[BAR.drink]) errors.push(`bar: the drink ${BAR.drink} is not an item`);
  if (!range(BAR.stock) || !range(BAR.drinkers) || !range(BAR.purse)) errors.push('bar: stock, drinkers and purse are [min, max]');
  if (!(PULL_RULES.birthR[0] > PULL_RULES.promoteR)) errors.push('rules: a road person must be born farther off than the promote radius (never born at you)');
  if (!(PULL_RULES.demoteR > PULL_RULES.promoteR)) errors.push('rules: demoteR must be past promoteR');
  return { ok: errors.length === 0, errors };
}
