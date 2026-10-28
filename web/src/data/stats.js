// THE DEEP SHEET as rows (docs/design/WEB_VOICE_STATS.md §5; the design study docs/research/GENRE_DEPTH.md §1).
// Attributes, the numbers derived from them, 36 skills that grow by doing, perks at each skill tier, traits you are made
// with or earn, conditions on a ladder, injuries by body part, stress and morale, and four reputation axes.
// The crew lane reads the same rows for its people (g.deep.sheetFor(c), systems/stats.js).
//
// THE LAW: every number here moves play through ONE named consumer. All of them fold into g.deep.fx (systems/stats.js),
// a flat object of multipliers (1 = no change) and adds (0 = no change); each key has exactly one reader:
//   spreadMul reloadMul carryKg sprintDrainMul speedMul -> systems/skills.js recompute() (aim spread, reload, carry,
//                                                          stamina, move speed; already the engine's one source)
//   priceMul -> systems/trade.js counter prices         seenMul -> systems/gear.js seenMul() -> ai.js spotting
//   repair (+) -> gear.js repairMul() -> repairs         luck (+) -> gear.js luckRolls() -> first search of a box
//   drainMul -> survival.js hunger/thirst drain          wakeMul -> survival.js how far off a threat wakes you
//   healMul -> survival.js wound heal rate               meleeMul -> systems/melee.js blow damage
//   handling -> systems/vehicles.js steering (you at the wheel)   noiseMul -> main.js noise() (sounds YOU make)
//   lockMul -> systems/interiors.js lockpick/pry time    scentMul -> systems/zombies.js how far the infected smell you
//   damageMul -> systems/combat.js damage you take       xpMul -> systems/skills.js + stats.js learning
// A neutral survivor (every attribute 5, no traits, untrained, unhurt, calm) folds to exactly 1 / 0 everywhere: the
// sheet only ever moves a number away from today's game by something the player made or did.

// ---- attributes (1..10, 5 is an ordinary adult) -------------------------------------------------------------------
export const ATTRIBUTES = {
  brawn:     { label: 'BRAWN', short: 'BRN', does: 'melee damage, carry weight, kicking doors in, not being knocked down', creator: 'strength' },
  grit:      { label: 'GRIT', short: 'GRT', does: 'pain and blood you can lose, sickness, how fast wounds close', creator: 'endurance' },
  quickness: { label: 'QUICKNESS', short: 'QCK', does: 'move and reload speed, hands at the wheel', creator: 'dexterity' },
  eye:       { label: 'EYE', short: 'EYE', does: 'aim, spotting, finding what others miss, seeing at night', creator: 'perception' },
  wits:      { label: 'WITS', short: 'WIT', does: 'learning, repairs, medicine, locks', creator: 'wits' },
  nerve:     { label: 'NERVE', short: 'NRV', does: 'stress, panic, staring down a gun', creator: 'nerve' },
  charm:     { label: 'CHARM', short: 'CHA', does: 'prices, persuading, how fast people warm to you', creator: null },
};
export const ATTR_MIN = 1, ATTR_MAX = 10, ATTR_AVG = 5;
// A creator rank (data/creator.js 1..6, 2 = ORDINARY) -> an attribute (5 = ordinary).
export const rankToAttr = (r) => Math.max(ATTR_MIN, Math.min(ATTR_MAX, 3 + (r ?? 2)));

// ---- derived stats: the formulas (a = attributes, k = skill levels 0..100) ------------------------------------------
// Each returns a multiplier (or an add) relative to an ordinary adult; `to` is the fx key it feeds.
const d5 = (v) => (v ?? ATTR_AVG) - ATTR_AVG;
export const DERIVED = {
  carry:      { to: 'carryKg', label: 'Carry (kg, +)', f: (a) => d5(a.brawn) * 2.5, why: '+2.5 kg per Brawn over 5' },
  melee:      { to: 'meleeMul', label: 'Melee damage', f: (a) => 1 + d5(a.brawn) * 0.06, why: '+6% per Brawn' },
  aim:        { to: 'spreadMul', label: 'Aim spread', f: (a) => 1 - d5(a.eye) * 0.03, why: '-3% spread per Eye' },
  reload:     { to: 'reloadMul', label: 'Reload time', f: (a) => 1 - d5(a.quickness) * 0.04, why: '-4% per Quickness' },
  pace:       { to: 'speedMul', label: 'Move speed', f: (a) => 1 + d5(a.quickness) * 0.015, why: '+1.5% per Quickness' },
  wind:       { to: 'sprintDrainMul', label: 'Stamina drain', f: (a) => 1 - d5(a.grit) * 0.035, why: '-3.5% per Grit' },
  mend:       { to: 'healMul', label: 'Wound healing', f: (a) => 1 + d5(a.grit) * 0.06, why: '+6% per Grit' },
  hide:       { to: 'seenMul', label: 'Seen at (distance)', f: (a) => 1 - d5(a.eye) * 0.01, why: '-1% per Eye (you see them first)' },
  haggle:     { to: 'priceMul', label: 'Counter prices', f: (a) => 1 - d5(a.charm) * 0.025 - d5(a.wits) * 0.01, why: '-2.5% per Charm, -1% per Wits' },
  fix:        { to: 'repair', label: 'Repairs (+)', f: (a) => d5(a.wits) * 0.04, why: '+4% per Wits' },
  locks:      { to: 'lockMul', label: 'Lock time', f: (a) => 1 - d5(a.wits) * 0.05 - d5(a.quickness) * 0.02, why: '-5% per Wits, -2% per Quickness' },
  learn:      { to: 'xpMul', label: 'Learning', f: (a) => 1 + d5(a.wits) * 0.06, why: '+6% xp per Wits' },
  wake:       { to: 'wakeMul', label: 'Wakes to threats at', f: (a) => 1 + d5(a.eye) * 0.04, why: '+4% per Eye' },
  tough:      { to: 'damageMul', label: 'Damage taken', f: (a) => 1 - d5(a.grit) * 0.015, why: '-1.5% per Grit' },
  appetite:   { to: 'drainMul', label: 'Hunger and thirst', f: (a) => 1 - d5(a.grit) * 0.02, why: '-2% per Grit' },
  // Not fx: read by stress and checks.
  stressCap:  { to: null, label: 'Stress cap', f: (a) => 60 + (a.nerve ?? 5) * 8, why: '60 + 8 x Nerve' },
  panicAt:    { to: null, label: 'Panic at (% of cap)', f: (a) => 70 + (a.nerve ?? 5) * 2, why: '70% + 2% x Nerve' },
  painTol:    { to: null, label: 'Pain tolerance', f: (a) => (a.grit ?? 5) * 10, why: '10 x Grit' },
  infectRes:  { to: null, label: 'Infection resistance %', f: (a) => (a.grit ?? 5) * 3, why: '3% x Grit (read by checks; the bite ladder is survival.js)' },
  spotDay:    { to: null, label: 'Spot radius by day (m)', f: (a) => 30 + (a.eye ?? 5) * 4, why: '30 + 4 x Eye' },
  spotNight:  { to: null, label: 'Spot radius at night (m)', f: (a) => (30 + (a.eye ?? 5) * 4) * (0.35 + (a.eye ?? 5) * 0.03), why: 'day x (0.35 + 0.03 Eye)' },
};

// ---- skills (0..100, grown by doing; tiers at 20/40/60/80 each offer a perk) -----------------------------------------
// fx: what a level is worth (per point of skill, x the level), to a key; check: read by dialogue/quest checks.
// xp: the events (g.emit types) that teach it, and how much. weapon: the guns it governs (spread/reload while held).
export const SKILL_GROUPS = ['FIREARMS', 'CLOSE', 'ROAD', 'SURVIVAL', 'TECH & MEDICAL', 'SOCIAL & COMMAND', 'BODY'];
const S = (group, label, attr, more = {}) => ({ group, label, attr, ...more });
export const SKILLS = {
  pistols:    S('FIREARMS', 'Pistols', 'eye', { weapon: ['pistol', 'auto'], fx: { spreadMul: -0.0025, reloadMul: -0.002 } }),
  longguns:   S('FIREARMS', 'Long guns', 'eye', { weapon: ['rifle'], fx: { spreadMul: -0.0025, reloadMul: -0.002 } }),
  scatter:    S('FIREARMS', 'Scatterguns', 'brawn', { weapon: ['shotgun', 'pump'], fx: { spreadMul: -0.002, reloadMul: -0.0025 } }),
  automatics: S('FIREARMS', 'Automatics', 'quickness', { weapon: ['smg'], fx: { spreadMul: -0.0025, reloadMul: -0.002 } }),
  heavy:      S('FIREARMS', 'Heavy weapons', 'brawn', { weapon: ['mg'], fx: { spreadMul: -0.002 } }),
  mounted:    S('FIREARMS', 'Mounted guns', 'eye', { check: true, xp: { harpoon: 4 } }),
  blades:     S('CLOSE', 'Blades', 'quickness', { fx: { meleeMul: 0.002 }, xp: { meleeSwing: 0.3 } }),
  blunt:      S('CLOSE', 'Blunt', 'brawn', { fx: { meleeMul: 0.003 }, xp: { melee: 2 } }),
  unarmed:    S('CLOSE', 'Unarmed', 'brawn', { fx: { meleeMul: 0.002 }, xp: { pushed: 1, melee: 1 } }),
  thrown:     S('CLOSE', 'Thrown', 'eye', { check: true, xp: { thrown: 3, detonated: 1 } }),
  driving:    S('ROAD', 'Driving', 'quickness', { fx: { handling: 0.003 }, xp: { jump: 4, roadkill: 1, rammedThrough: 2 } }),
  gunnery:    S('ROAD', 'Vehicle gunnery', 'eye', { check: true, xp: { harpoon: 2 } }),
  mechanics:  S('ROAD', 'Mechanics', 'wits', { fx: { repair: 0.004 }, xp: { gunFixed: 6, gunCleaned: 3, jamCleared: 1 } }),
  fabrication:S('ROAD', 'Fabrication', 'wits', { check: true, xp: { trapcraft: 4 } }),
  navigation: S('ROAD', 'Navigation', 'wits', { fx: { drainMul: -0.0015 }, xp: { arrived: 3, waypoint: 1 } }),
  salvage:    S('ROAD', 'Salvage', 'brawn', { fx: { luck: 0.006 }, xp: { carStripped: 6 } }),
  scavenging: S('SURVIVAL', 'Scavenging', 'eye', { fx: { luck: 0.01 }, xp: { containerOpened: 1.5, itemFound: 0.5 } }),
  foraging:   S('SURVIVAL', 'Foraging', 'eye', { fx: { drainMul: -0.001 }, xp: { consumed: 0.5 } }),
  hunting:    S('SURVIVAL', 'Hunting & trapping', 'eye', { check: true, xp: { butchered: 5, faunaKilled: 3, snareSet: 2, faunaTrapped: 4 } }),
  cooking:    S('SURVIVAL', 'Cooking', 'wits', { fx: { drainMul: -0.0015 }, xp: { cooked: 4 } }),
  farming:    S('SURVIVAL', 'Farming', 'grit', { check: true }),
  fishing:    S('SURVIVAL', 'Fishing', 'nerve', { check: true }),
  fieldcraft: S('SURVIVAL', 'Fieldcraft', 'eye', { fx: { seenMul: -0.003, noiseMul: -0.003, scentMul: 0.002 }, xp: { camp: 4, trapSpotted: 3, trapDisarmed: 4 } }),
  firstaid:   S('TECH & MEDICAL', 'First aid', 'wits', { fx: { healMul: 0.005 }, xp: { treated: 5, revived: 8 } }),
  surgery:    S('TECH & MEDICAL', 'Surgery', 'wits', { check: true }),
  electrics:  S('TECH & MEDICAL', 'Electrics', 'wits', { check: true }),
  electronics:S('TECH & MEDICAL', 'Electronics', 'wits', { check: true, xp: { radio: 0.5 } }),
  chemistry:  S('TECH & MEDICAL', 'Chemistry', 'wits', { check: true, xp: { dose: 1 } }),
  lockcraft:  S('TECH & MEDICAL', 'Locks', 'quickness', { fx: { lockMul: -0.006 }, xp: { doorUnlocked: 6 } }),
  carpentry:  S('TECH & MEDICAL', 'Carpentry', 'brawn', { check: true, xp: { windowBoarded: 3 } }),
  barter:     S('SOCIAL & COMMAND', 'Barter', 'charm', { fx: { priceMul: -0.002 }, xp: { trade: 2, dealt: 2 } }),
  persuade:   S('SOCIAL & COMMAND', 'Persuade', 'charm', { check: true, xp: { dialogueCheck: 0 } }),
  intimidate: S('SOCIAL & COMMAND', 'Intimidate', 'nerve', { check: true, xp: { gunpoint: 2, robbed: 0, witnessCowed: 4, standoffOver: 3 } }),
  leadership: S('SOCIAL & COMMAND', 'Leadership', 'charm', { check: true, xp: { recruited: 10, sworn: 6 } }),
  tactics:    S('SOCIAL & COMMAND', 'Tactics', 'wits', { check: true }),
  // The hidden two: trained only by what happens to you (shown once they move).
  toughness:  S('BODY', 'Toughness', 'grit', { hidden: true, fx: { damageMul: -0.0015 }, xp: { hurt: 0.4 } }),
  awareness:  S('BODY', 'Awareness', 'eye', { hidden: true, fx: { wakeMul: 0.003, seenMul: -0.001 }, xp: { convoySpotted: 3, prowler: 3, trapSpotted: 2, wake: 2 } }),
};
export const SKILL_MAX = 100, TIERS_AT = [20, 40, 60, 80];
export const TIER_NAMES = ['UNTRAINED', 'NOVICE', 'COMPETENT', 'EXPERT', 'MASTER'];
export const tierOf = (v) => (v >= 80 ? 4 : v >= 60 ? 3 : v >= 40 ? 2 : v >= 20 ? 1 : 0);
export const TAGS = { count: 3, bonus: 15, xpMul: 1.5 }; // tag skills: start +15, learn at x1.5
// Learning slows as you climb: amount x learn x tag / (1 + level / 30).
export const XP_CURVE = 30;
// The firearms skill for the gun in your hands (combat.js WEAPONS ammo / sound).
export const GUN_SKILL = { pistol: 'pistols', auto: 'pistols', smg: 'automatics', rifle: 'longguns', shotgun: 'scatter', pump: 'scatter', mg: 'heavy' };

// ---- perks: two per tier per skill, pick one (perk skill=<id> pick=a|b) ---------------------------------------------
// Hand-authored where the game has the verb; the rest from templates by group. fx as traits.
const P = (a, b) => ({ a, b });
export const PERKS = {
  driving: [P({ id: 'smooth_hands', label: 'Smooth Hands', fx: { handling: 0.06 } }, { id: 'lead_foot', label: 'Lead Foot', fx: { handling: 0.03, noiseMul: 0.05 } }),
    P({ id: 'bootlegger', label: 'Bootlegger Turn', fx: { handling: 0.08 } }, { id: 'ram_brace', label: 'Ram Brace', fx: { damageMul: -0.05 } }),
    P({ id: 'two_wheel', label: 'Two Wheels', fx: { handling: 0.1 } }, { id: 'bulldozer', label: 'Bulldozer', fx: { damageMul: -0.04 } }),
    P({ id: 'getaway', label: 'Getaway Driver', fx: { handling: 0.12 } }, { id: 'iron_chariot', label: 'Iron Chariot', fx: { damageMul: -0.08 } })],
  mechanics: [P({ id: 'field_patch', label: 'Field Patch', fx: { repair: 0.1 } }, { id: 'scrounger', label: 'Scrounger', fx: { luck: 0.3 } }),
    P({ id: 'tune_up', label: 'Tune-up', fx: { handling: 0.05 } }, { id: 'quiet_muffler', label: 'Quiet Muffler', fx: { noiseMul: -0.1 } }),
    P({ id: 'hot_swap', label: 'Hot Swap', fx: { repair: 0.15 } }, { id: 'overclock', label: 'Overclock', fx: { handling: 0.06 } }),
    P({ id: 'miracle', label: 'Miracle Worker', fx: { repair: 0.25 } }, { id: 'master_builder', label: 'Master Builder', fx: { repair: 0.15, luck: 0.3 } })],
  longguns: [P({ id: 'steady', label: 'Steady', fx: { spreadMul: -0.05 } }, { id: 'snap', label: 'Snap Shot', fx: { reloadMul: -0.05 } }),
    P({ id: 'overwatch', label: 'Overwatch', fx: { spreadMul: -0.05 } }, { id: 'headhunter', label: 'Headhunter', fx: { spreadMul: -0.04 } }),
    P({ id: 'subsonic', label: 'Suppressor Discipline', fx: { noiseMul: -0.12 } }, { id: 'penetrator', label: 'Penetrator', fx: { spreadMul: -0.03 } }),
    P({ id: 'one_shot', label: 'One Shot', fx: { spreadMul: -0.08 } }, { id: 'spotter', label: 'Spotter Link', fx: { seenMul: -0.05 } })],
  firstaid: [P({ id: 'tourniquet', label: 'Tourniquet', fx: { healMul: 0.08 } }, { id: 'calm_voice', label: 'Calm Voice', fx: { healMul: 0.04 }, stressMul: 0.9 }),
    P({ id: 'splint', label: 'Splint', fx: { speedMul: 0.02 } }, { id: 'triage', label: 'Triage', fx: { healMul: 0.08 } }),
    P({ id: 'combat_medic', label: 'Combat Medic', fx: { healMul: 0.1 } }, { id: 'field_surgeon', label: 'Field Surgeon', fx: { healMul: 0.12 } }),
    P({ id: 'second_chance', label: 'Second Chance', fx: { damageMul: -0.05 } }, { id: 'infection_hunter', label: 'Infection Hunter', fx: { healMul: 0.1 } })],
  leadership: [P({ id: 'rally', label: 'Rally', stressMul: 0.85 }, { id: 'taskmaster', label: 'Taskmaster', fx: { xpMul: 0.05 } }),
    P({ id: 'drill', label: 'Drill Sergeant', fx: { xpMul: 0.08 } }, { id: 'shepherd', label: 'Shepherd', stressMul: 0.85 }),
    P({ id: 'inspiring', label: 'Inspiring', fx: { spreadMul: -0.03 } }, { id: 'iron_rule', label: 'Iron Rule', stressMul: 0.8 }),
    P({ id: 'legend', label: 'Legend', fx: { priceMul: -0.05 } }, { id: 'war_chief', label: 'War Chief', fx: { spreadMul: -0.04 } })],
  barter: [P({ id: 'eye_for_value', label: 'Eye for Value', fx: { priceMul: -0.04 } }, { id: 'regular', label: 'Regular', fx: { priceMul: -0.03 } }),
    P({ id: 'bulk', label: 'Bulk Buyer', fx: { priceMul: -0.05 } }, { id: 'fence', label: 'Fence', fx: { luck: 0.3 } }),
    P({ id: 'silver', label: 'Silver Tongue', fx: { priceMul: -0.06 } }, { id: 'broker', label: 'Broker', fx: { priceMul: -0.05 } }),
    P({ id: 'merchant_prince', label: 'Merchant Prince', fx: { priceMul: -0.08 } }, { id: 'kingmaker', label: 'Kingmaker', fx: { priceMul: -0.06 } })],
  fieldcraft: [P({ id: 'soft_step', label: 'Soft Step', fx: { noiseMul: -0.08 } }, { id: 'tracker', label: 'Tracker', fx: { wakeMul: 0.06 } }),
    P({ id: 'downwind', label: 'Downwind', fx: { scentMul: 0.1 } }, { id: 'camp_craft', label: 'Camp Craft', fx: { drainMul: -0.05 } }),
    P({ id: 'ghost', label: 'Ghost', fx: { seenMul: -0.08 } }, { id: 'weather_eye', label: 'Weather Eye', fx: { drainMul: -0.05 } }),
    P({ id: 'one_with_dust', label: 'One With the Dust', fx: { seenMul: -0.1, scentMul: 0.1 } }, { id: 'pathfinder', label: 'Pathfinder', fx: { speedMul: 0.03 } })],
  lockcraft: [P({ id: 'light_touch', label: 'Light Touch', fx: { lockMul: -0.1 } }, { id: 'shoulder', label: 'Shoulder', fx: { meleeMul: 0.04 } }),
    P({ id: 'raker', label: 'Raker', fx: { lockMul: -0.12 } }, { id: 'quiet_pry', label: 'Quiet Pry', fx: { noiseMul: -0.05 } }),
    P({ id: 'bump', label: 'Bump Key', fx: { lockMul: -0.15 } }, { id: 'safecracker', label: 'Safecracker', fx: { luck: 0.4 } }),
    P({ id: 'no_door', label: 'No Door Holds', fx: { lockMul: -0.2 } }, { id: 'master_key', label: 'Master Key', fx: { lockMul: -0.15, luck: 0.3 } })],
};
// Every other skill: its group's template (a small sure gain to the skill's own fx key, or a learning bonus).
const TEMPLATE = (id, def) => {
  const key = Object.keys(def.fx ?? {})[0], sign = key ? Math.sign(def.fx[key]) : 0, step = (n) => (key ? { [key]: sign * (key === 'luck' || key === 'carryKg' ? 0.25 * n : 0.025 * n) } : { xpMul: 0.02 * n });
  return [1, 2, 3, 4].map((n) => P({ id: `${id}_sure_${n}`, label: `${def.label}: Sure Hands ${'I'.repeat(n)}`, fx: step(n) }, { id: `${id}_quick_${n}`, label: `${def.label}: Quick Study ${'I'.repeat(n)}`, fx: { xpMul: 0.03 * n } }));
};
for (const [id, def] of Object.entries(SKILLS)) PERKS[id] ??= TEMPLATE(id, def);

// ---- traits: made with (cost / refund points, the creator's pool) or earned in play ------------------------------------
// fx: added straight into the fold. stressMul: stress gain x. night: only after dark. creator: the data/creator.js
// trait id this mirrors (a survivor made in THE CREATOR carries it here; no double counting - creator's own fx stay its).
const T = (cost, label, does, fx = {}, more = {}) => ({ cost, label, does, fx, ...more });
export const TRAITS = {
  // positive (cost)
  night_owl:   T(3, 'Night Owl', 'no night aim penalty, wakes to trouble sooner', { wakeMul: 0.1 }, { night: { spreadMul: -0.08 } }),
  iron_gut:    T(2, 'Iron Gut', 'eats what would sicken others', { drainMul: -0.05 }),
  fast_learner:T(6, 'Fast Learner', '+30% xp, every skill', { xpMul: 0.3 }),
  gearhead:    T(4, 'Gearhead', 'Mechanics tagged; hears what a car is telling you', { repair: 0.15, handling: 0.03 }, { tag: 'mechanics' }),
  quiet_step:  T(4, 'Quiet Step', '-40% footstep noise, harder to see', { noiseMul: -0.4, seenMul: -0.1 }),
  thick_skinned:T(5, 'Thick-Skinned', '-10% all damage', { damageMul: -0.1 }),
  lucky:       T(5, 'Lucky', 'one more roll on every first search', { luck: 1 }),
  born_leader: T(5, 'Born Leader', 'people warm to you; Leadership tagged', { priceMul: -0.04 }, { tag: 'leadership', stressMul: 0.95 }),
  steady_hands:T(3, 'Steady Hands', 'less sway, better patching', { spreadMul: -0.06, healMul: 0.1 }),
  light_sleeper:T(2, 'Light Sleeper', 'wakes at the first scrape', { wakeMul: 0.25 }),
  pack_mule:   T(3, 'Pack Mule', '+10 kg carry', { carryKg: 10 }),
  road_born:   T(4, 'Road-Born', '+15 Driving, a feel for the wheel', { handling: 0.1 }, { skills: { driving: 15 } }),
  resilient:   T(4, 'Resilient', 'wounds close faster, sickness passes', { healMul: 0.2 }),
  scav_eye:    T(3, 'Scav Eye', 'one more roll per container', { luck: 1 }),
  cool_head:   T(4, 'Cool Head', 'stress gain -25%', {}, { stressMul: 0.75 }),
  marksman:    T(4, "Marksman's Eye", '+10 every firearms skill', {}, { skills: { pistols: 10, longguns: 10, scatter: 10, automatics: 10, heavy: 10 } }),
  hardy:       T(3, 'Hardy', 'hunger and thirst -20%', { drainMul: -0.2 }),
  sprinter:    T(3, 'Sprinter', 'stamina lasts 20% longer', { sprintDrainMul: -0.2 }),
  // negative (refund)
  loudmouth:   T(-3, 'Loudmouth', 'everything you do is louder', { noiseMul: 0.25 }),
  coward:      T(-4, 'Coward', 'panics sooner', {}, { stressMul: 1.3, panicAdd: -20 }),
  hothead:     T(-3, 'Hothead', 'shoots before aiming', { spreadMul: 0.06, reloadMul: -0.05 }),
  klutz:       T(-3, 'Klutz', 'fumbles reloads and locks', { reloadMul: 0.12, lockMul: 0.25 }),
  asthmatic:   T(-4, 'Asthmatic', 'stamina -40%, dust makes you cough', { sprintDrainMul: 0.4, noiseMul: 0.1 }),
  night_blind: T(-3, 'Night Blind', 'the dark eats your aim', {}, { night: { spreadMul: 0.15, seenMul: 0.1 } }),
  heavy_sleeper:T(-2, 'Heavy Sleeper', 'sleeps through trouble', { wakeMul: -0.4 }),
  glutton:     T(-3, 'Glutton', 'eats and drinks 40% more', { drainMul: 0.4 }),
  bad_back:    T(-3, 'Bad Back', '-10 kg carry', { carryKg: -10 }),
  pacifist:    T(-6, 'Pacifist', 'hates the work: weak blows, shaky shots at people', { meleeMul: -0.3, spreadMul: 0.1 }),
  kleptomaniac:T(-2, 'Kleptomaniac', 'finds more, but traders watch you', { luck: 0.5, priceMul: 0.06 }),
  carsick:     T(-3, 'Carsick', 'loose at the wheel', { handling: -0.1 }),
  phobic_dark: T(-3, 'Afraid of the Dark', 'stress builds at night', {}, { night: { stressMul: 1.5 } }),
  slow_healer: T(-3, 'Slow Healer', 'wounds take 50% longer', { healMul: -0.33 }),
  smoker:      T(-1, 'Tobacco Habit', 'short of wind, calmer', { sprintDrainMul: 0.1 }, { stressMul: 0.92 }),
  grudge:      T(-2, 'Grudge-Holder', 'prices go up when you sour', { priceMul: 0.04 }),
  fragile:     T(-5, 'Fragile', 'takes 15% more damage', { damageMul: 0.15 }),
  loud_scent:  T(-2, 'Unwashed', 'the dead smell you farther off', { scentMul: -0.25 }),
  // earned in play only (cost null): the event that grants each lives in systems/stats.js EARN
  bitten_survivor: T(null, 'Bitten Survivor', 'beat a bite once; the body remembers', { healMul: 0.15 }),
  road_warrior:    T(null, 'Road Warrior', 'a hundred from behind the wheel', { handling: 0.08 }),
  shell_shocked:   T(null, 'Shell-Shocked', 'loud noise sets you shaking', { spreadMul: 0.04 }, { stressMul: 1.2 }),
  butcher:         T(null, 'Butcher', 'fifty people dead by your hand; folk flinch', { priceMul: 0.1 }),
  veteran:         T(null, 'Veteran', 'thirty fights walked away from', { spreadMul: -0.05 }, { stressMul: 0.9 }),
  wheelman:        T(null, 'Wheelman', 'ten chases survived', { handling: 0.06 }),
  survivors_guilt: T(null, "Survivor's Guilt", 'the only one who came back', {}, { stressMul: 1.15 }),
  hollow:          T(null, 'Hollow', 'lost too many to feel much', {}, { stressMul: 0.8, panicAdd: -10 }),
};
export const TRAIT_RULES = { maxPositive: 4, maxNegative: 3, budget: 2 }; // net cost within +-budget
// Earned traits: when they come (systems/stats.js counts the events).
export const EARN = {
  road_warrior: { count: 'carKills', at: 100 }, butcher: { count: 'humanKills', at: 50 }, veteran: { count: 'fights', at: 30 },
  wheelman: { count: 'jumps', at: 10 }, shell_shocked: { count: 'blasts', at: 12 }, bitten_survivor: { count: 'curedBites', at: 1 },
};

// ---- conditions: ladders (0 = none) ----------------------------------------------------------------------------------
// from: how systems/stats.js reads the level off live state (survival's meters, the sheet's stress, your load...).
// fx[level-1]: what that rung costs, folded into g.deep.fx. Survival's own meters already cost what they cost
// (survival.js); a condition here that mirrors one only NAMES it (fx: null) so the sheet shows it with its cure.
const C = (label, levels, from, cure, fx = null) => ({ label, levels, from, cure, fx });
export const CONDITIONS = {
  hungry:      C('Hungry', 4, 'needs.food', 'Eat'),
  thirsty:     C('Thirsty', 4, 'needs.water', 'Drink'),
  tired:       C('Tired', 4, 'needs.rest', 'Sleep'),
  exhausted:   C('Winded', 3, 'stamina', 'Stop and breathe', [{ meleeMul: -0.1 }, { meleeMul: -0.2 }, { meleeMul: -0.3 }]),
  stressed:    C('Stressed', 4, 'stress', 'Rest, a drink, a smoke, a friend', [{ spreadMul: 0.03 }, { spreadMul: 0.07 }, { spreadMul: 0.12, reloadMul: 0.05 }, { spreadMul: 0.18, reloadMul: 0.1 }]),
  panicked:    C('Panicked', 3, 'panic', 'Get away from the threat; time', [{ spreadMul: 0.15 }, { spreadMul: 0.25, reloadMul: 0.15 }, { spreadMul: 0.35, reloadMul: 0.25, speedMul: 0.05 }]),
  bored:       C('Bored', 3, 'idle', 'Something new to do'),
  lonely:      C('Lonely', 2, 'alone', 'Company (a crew, a dog)', null),
  pain:        C('Pain', 4, 'pain', 'Painkillers, a bandage, rest', [{ spreadMul: 0.04 }, { spreadMul: 0.08, speedMul: -0.04 }, { spreadMul: 0.14, speedMul: -0.08 }, { spreadMul: 0.2, speedMul: -0.15 }]),
  bleeding:    C('Bleeding', 4, 'wounds.open', 'A bandage or a tourniquet'),
  cold:        C('Cold', 4, 'weather.cold', 'Warm clothes, a fire, a car heater', [{ speedMul: -0.03 }, { speedMul: -0.06, reloadMul: 0.05 }, { speedMul: -0.1, reloadMul: 0.1 }, { speedMul: -0.15, reloadMul: 0.15 }]),
  hot:         C('Hot', 3, 'weather.hot', 'Shade, water, fewer layers', [{ drainMul: 0.2 }, { drainMul: 0.5 }, { drainMul: 1.0 }]),
  wet:         C('Wet', 3, 'weather.wet', 'Dry off by a fire or in a car', [{ noiseMul: 0.05 }, { noiseMul: 0.1, scentMul: 0.1 }, { noiseMul: 0.15, scentMul: 0.2 }]),
  sick:        C('Sick', 3, 'sick', 'Rest, medicine'),
  food_poisoned:C('Food Poisoned', 3, 'sick.food', 'Time, charcoal'),
  infected:    C('Infected', 5, 'infection', 'An experimental cure; early amputation'),
  drunk:       C('Drunk', 3, 'drunk', 'Time', [{ spreadMul: 0.08, stressDrop: 1 }, { spreadMul: 0.15, handling: -0.1 }, { spreadMul: 0.25, handling: -0.2, speedMul: -0.05 }]),
  withdrawal:  C('Withdrawal', 3, 'withdrawal', 'A fix, or 72 hours', [{ spreadMul: 0.05 }, { spreadMul: 0.1 }, { spreadMul: 0.15, reloadMul: 0.1 }]),
  concussed:   C('Concussed', 2, 'injury.head', '24-72 h rest', [{ spreadMul: 0.08, xpMul: -0.15 }, { spreadMul: 0.15, xpMul: -0.25 }]),
  encumbered:  C('Encumbered', 3, 'load', 'Drop weight'),
  deafened:    C('Ringing Ears', 2, 'deaf', 'Time', [{ wakeMul: -0.3 }, { wakeMul: -0.6 }]),
  grieving:    C('Grieving', 3, 'grief', 'Time, a grave, a friend', [{ xpMul: -0.1 }, { xpMul: -0.2 }, { xpMul: -0.3, spreadMul: 0.05 }]),
  inspired:    C('Inspired', 2, 'inspired', 'Wears off', [{ spreadMul: -0.05, xpMul: 0.1 }, { spreadMul: -0.1, xpMul: 0.2 }]),
  well_fed:    C('Well Fed', 2, 'fed', 'Good meals', [{ sprintDrainMul: -0.05 }, { sprintDrainMul: -0.1, healMul: 0.05 }]),
};

// ---- injuries by body part -------------------------------------------------------------------------------------------
// A wound you take lands on a zone (by weight; the head is aimed-at more by marksmen). Zone hp is a share of max hp;
// the zone heals at healMul. A zone below half hurts (pain), at zero it is disabled (the fx below).
export const ZONES = {
  head:  { label: 'Head', share: 0.15, weight: 8, hurt: { spreadMul: 0.08 }, disabled: { spreadMul: 0.25, xpMul: -0.2 } },
  torso: { label: 'Torso', share: 0.4, weight: 40, hurt: { sprintDrainMul: 0.1 }, disabled: { sprintDrainMul: 0.4, speedMul: -0.15 } },
  larm:  { label: 'Left arm', share: 0.1, weight: 12, hurt: { reloadMul: 0.15 }, disabled: { reloadMul: 1.0, spreadMul: 0.12 } },
  rarm:  { label: 'Right arm', share: 0.1, weight: 12, hurt: { spreadMul: 0.1, meleeMul: -0.15 }, disabled: { spreadMul: 0.4, meleeMul: -0.5 } },
  lleg:  { label: 'Left leg', share: 0.125, weight: 14, hurt: { speedMul: -0.08 }, disabled: { speedMul: -0.4, sprintDrainMul: 0.5 } },
  rleg:  { label: 'Right leg', share: 0.125, weight: 14, hurt: { speedMul: -0.08 }, disabled: { speedMul: -0.4, sprintDrainMul: 0.5 } },
};
// Injury types (rolled when a zone takes >= 25% of its hp in one hit), by the hurt event's cause.
export const INJURIES = {
  scratch:    { label: 'Scratch', from: ['claw', 'bite'], pain: 1, heal: 24, permanent: 0 },
  laceration: { label: 'Laceration', from: ['glass', 'blade', 'crash', 'bash'], pain: 2, heal: 72, permanent: 0 },
  bite:       { label: 'Bite', from: ['bite', 'zombie'], pain: 2, heal: 120, permanent: 0.05 },
  gunshot:    { label: 'Gunshot', from: ['bullet', 'shot', 'gun'], pain: 3, heal: 240, permanent: 0.1 },
  fracture:   { label: 'Fracture', from: ['fall', 'crash', 'bash', 'kick'], pain: 3, heal: 720, permanent: 0.15 },
  burn:       { label: 'Burn', from: ['fire', 'molotov', 'blast'], pain: 3, heal: 240, permanent: 0.2 },
  concussion: { label: 'Concussion', from: ['blast', 'crash', 'bash'], pain: 2, heal: 72, permanent: 0.05, zones: ['head'] },
};
export const INJURY_AT = 0.25; // share of a zone's hp in one hit that opens an injury

// ---- stress and morale -----------------------------------------------------------------------------------------------
// Stress: short-term, 0..cap (DERIVED.stressCap). Gains per event; falls out of the fight. Morale: long-term, -100..100,
// a sum of named, visible modifiers that decay.
export const STRESS = {
  gain: { shotNear: 3, hurt: 8, allyDown: 15, allyKilled: 25, infectedClose: 1, crash: 12, blast: 10, darkAlone: 0.5 },
  fall: { calmPerSec: 0.25, sleepPerHour: 8, drink: 20, smoke: 10 },
  // Rungs: stress share of cap -> the Stressed condition level; at panicAt the Panicked condition (3 rungs by how far over).
  rungs: [0.3, 0.5, 0.7, 0.85],
};
export const MORALE = {
  mods: {
    ate_well: { v: 5, hours: 12, label: 'A good meal' }, ate_raw: { v: -5, hours: 8, label: 'Ate it raw' }, slept_bed: { v: 4, hours: 16, label: 'Slept in a bed' },
    slept_rough: { v: -4, hours: 16, label: 'Slept rough' }, won_fight: { v: 4, hours: 6, label: 'Won a fight' }, friend_died: { v: -20, hours: 240, label: 'Lost a friend' },
    saw_horror: { v: -5, hours: 24, label: 'Saw something terrible' }, got_paid: { v: 3, hours: 12, label: 'Got paid' }, made_friend: { v: 3, hours: 24, label: 'Made a friend' },
    hunted: { v: -6, hours: 24, label: 'A price on your head' },
  },
  bands: [[30, 'HIGH'], [0, 'STEADY'], [-30, 'LOW'], [-60, 'BREAKING'], [-101, 'BROKEN']],
  fx: { HIGH: { xpMul: 0.1 }, STEADY: {}, LOW: { xpMul: -0.05 }, BREAKING: { xpMul: -0.1, spreadMul: 0.04 }, BROKEN: { xpMul: -0.2, spreadMul: 0.08 } },
};

// ---- reputation axes (beside per-faction standing, which stays data/society.js) ---------------------------------------
// Each moves on deed verbs (data/society.js VERBS) you are seen doing (systems/deeds.js 'deed' events).
export const REPUTATION = {
  mercy: { label: 'Mercy / Ruthless', range: [-100, 100], verbs: { heal: 4, rescue: 6, pay: 1, kill: -2, silence: -8, rob: -4, threaten: -2, betray: -6 } },
  fame:  { label: 'Known', range: [0, 100], verbs: { kill: 1, rescue: 2, stunt: 2, deliver: 1, defend: 2 }, decayPerDay: 1 },
  law:   { label: 'Road Law / Outlaw', range: [-100, 100], verbs: { deliver: 3, trade: 0.5, pay: 2, defend: 2, steal: -4, carjack: -5, rob: -5, trespass: -2, destroy: -2 } },
  fear:  { label: 'Fear', range: [0, 100], verbs: { kill: 2, silence: 4, threaten: 3, rob: 2, destroy: 1 }, decayPerDay: 2 },
};
// Fear makes armed strangers fold sooner; Mercy opens doors; Known brings hunters (read by checks: `stat:fear>=40`).

// ---- the attribute check (dialogue / quests; systems/stats.js check()) -------------------------------------------------
// A check is deterministic: value + the governing attribute's edge vs a difficulty. Skill checks: skill + 4 x (attr - 5).
export const CHECK = { attrStep: 4 };
