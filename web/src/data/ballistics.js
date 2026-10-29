// CALIBERS (docs/design/WEB_CALIBERS.md; the flight: systems/ballistics.js, docs/design/WEB_BALLISTICS.md). One row per
// round a gun can fire. Every gun (combat.js WEAPONS `cal`), every shotgun shell (its mode's `cal`) and every vehicle mount
// that fires bullets (data/workshop.js MOUNT_WEAPONS `cal`) names one, and the round it fires IS that row: how fast it
// leaves the muzzle, how the air slows it, what it punches through, what it sounds like, the casing it leaves on the
// ground and the wound it leaves in a man (systems/forensics.js reads a body back by it).
//   name         what a body search or a casing on the ground calls it (".45 ACP", "7.62x39mm", "12 gauge buckshot")
//   short        the clue's word ("two 7.62 wounds"): the calibre as a man who knows guns says it
//   ammo         the pack's ammo key it loads from (data/items.js AMMO_ITEM: the box in your pack); null: none (a bolt)
//   velocity     m/s at the muzzle. Sound is BALLISTICS.sound (343 m/s): faster, the round CRACKS as it passes you;
//                slower, it whispers (the old whiz)
//   drag         1/s, linear: speed falls by drag x metres flown (v = velocity - drag * x), so no round flies further than
//                velocity / drag, and the time to a distance has a closed form (systems/ballistics.js flightTime)
//   dmg          the hit a typical barrel gives it (one pellet, for shot); a gun row's own dmg is its barrel (a carbine
//                and a machine gun on one calibre differ a little). The validator holds every gun within 0.5x..1.6x
//   punch        how hard it carries through things (systems/materials.js: the energy a wall must soak is dmg x punch).
//                A .50 goes through a block wall that eats a 9mm
//   sound        the report's family (systems/audio.js gun): pistol | smg | rifle | shotgun | heavy. A gun row may
//                name its own (the self-loader's 9mm barks like a pistol)
//   casing       what it drops on the ground (systems/ambient.js brass): size x the stock casing (0.11 m), its colour
//                (brass, lacquered steel, a red, green or black hull); null: nothing (a bolt)
//   tracerEvery  every Nth round a shooter fires of it draws a streak in flight (1: every round, 0: never)
//   tracerW      the streak's width (m)
//   tracerLen    the streak's longest length (m). A streak is as long as the round flies in BALLISTICS.streakT s, never
//                longer than this: a slow pistol round barely streaks, a rifle round draws a needle, and a round
//                shortens as the air slows it. Robert, 2026-10-29: the first streaks read as planks, the second as too
//                long; these caps are half the second's (TRACER_BEFORE).
// Gravity pulls every round down (BALLISTICS.gravity) with the same drag on its fall, so a round fired level from the hip
// meets the ground at last. At the game's ranges (22-68 m) the drop is centimetres; at 400 m a 5.56 round is about
// 1.4 m under its line (the `ballistics` command's test round reports it).
const BRASS = '#c9a24a';
export const ROUNDS = {
  // .22 rimfire: a squirrel round. Quiet, slow, light; it stops in a car door and wounds more than it kills.
  '22lr':   { name: '.22 LR', short: '.22', ammo: '22lr', velocity: 330, drag: 1.0, dmg: 12, punch: 0.45, sound: 'pistol', casing: { size: 0.4, color: '#d6b45e' }, tracerEvery: 0, tracerW: 0.02, tracerLen: 0.5 },
  // 9mm: the small fast round the SMGs and the self-loader eat, just over the speed of sound.
  '9mm':    { name: '9mm', short: '9mm', ammo: 'smg', velocity: 380, drag: 0.9, dmg: 19, punch: 1.0, sound: 'smg', casing: { size: 0.55, color: BRASS }, tracerEvery: 3, tracerW: 0.035, tracerLen: 1.3 },
  // .45 ACP: the revolver's heavy, slow round, under the speed of sound (it whispers past; it never cracks).
  '45acp':  { name: '.45 ACP', short: '.45', ammo: 'pistol', velocity: 305, drag: 0.55, dmg: 36, punch: 1.0, sound: 'pistol', casing: { size: 0.65, color: BRASS }, tracerEvery: 1, tracerW: 0.04, tracerLen: 1.1 },
  // .357 Magnum: a revolver round that hits like a carbine's at short range, and cracks past.
  '357mag': { name: '.357 Magnum', short: '.357', ammo: '357mag', velocity: 440, drag: 0.6, dmg: 46, punch: 1.4, sound: 'pistol', casing: { size: 0.7, color: '#d9b25c' }, tracerEvery: 1, tracerW: 0.04, tracerLen: 1.2 },
  // 5.56: the Remnant's service rifle and the light machine gun. Fast and flat: a 300 m shot lands 0.40 s after the
  // trigger, a 30 m one 0.036 s.
  '556':    { name: '5.56mm', short: '5.56', ammo: 'rifle', velocity: 850, drag: 0.64, dmg: 24, punch: 1.9, sound: 'rifle', casing: { size: 0.85, color: BRASS }, tracerEvery: 2, tracerW: 0.035, tracerLen: 2 },
  // 7.62x39: the surplus carbine's short fat round in lacquered steel cases. Slower than the 5.56; it hits harder.
  '762x39': { name: '7.62x39mm', short: '7.62', ammo: '762x39', velocity: 715, drag: 0.75, dmg: 30, punch: 2.0, sound: 'rifle', casing: { size: 0.85, color: '#6c6a52' }, tracerEvery: 3, tracerW: 0.035, tracerLen: 1.9 },
  // 7.62x51 (.308): the battle rifle and the medium machine guns, hand-held and on a car's cradle.
  '762x51': { name: '7.62x51mm (.308)', short: '.308', ammo: '762x51', velocity: 840, drag: 0.5, dmg: 38, punch: 2.6, sound: 'rifle', casing: { size: 1.0, color: BRASS }, tracerEvery: 4, tracerW: 0.04, tracerLen: 2.1 },
  // .50 (12.7mm): the heavy machine gun on a mount and the anti-materiel rifle. Through a block wall, through a car.
  '50bmg':  { name: '.50 BMG (12.7mm)', short: '.50', ammo: '50bmg', velocity: 890, drag: 0.32, dmg: 110, punch: 6.0, sound: 'heavy', casing: { size: 1.7, color: '#b8913e' }, tracerEvery: 4, tracerW: 0.06, tracerLen: 2.2 },
  // 12 gauge buckshot (the BUCK shell): eight fat pellets, quick off the muzzle, bled fast by the air (none past 180 m).
  '12ga':   { name: '12 gauge buckshot', short: '12-gauge buck', ammo: 'shells', velocity: 400, drag: 2.2, dmg: 14, punch: 0.5, sound: 'shotgun', casing: { size: 1.1, color: '#a8322a' }, tracerEvery: 1, tracerW: 0.025, tracerLen: 0.55 },
  // 12 gauge birdshot (the BIRD shell): a cloud of tiny pellets, slower and bled faster still. Peppers at 10 m, stings
  // at 20, nothing past about 110 m.
  '12ga_bird': { name: '12 gauge birdshot', short: '12-gauge bird', ammo: 'birdshot', velocity: 370, drag: 3.4, dmg: 4, punch: 0.25, sound: 'shotgun', casing: { size: 1.1, color: '#3f6b3a' }, tracerEvery: 2, tracerW: 0.018, tracerLen: 0.3 },
  // 12 gauge slug (the SLUG shell): one heavy lump, slower to lose speed than the shot.
  '12ga_slug': { name: '12 gauge slug', short: '12-gauge slug', ammo: 'slug', velocity: 450, drag: 1.1, dmg: 82, punch: 1.3, sound: 'shotgun', casing: { size: 1.1, color: '#2a2724' }, tracerEvery: 1, tracerW: 0.045, tracerLen: 0.9 },
  // A crossbow bolt (no gun fires it yet: the crossbow guards of the atlas are its first users). Slow enough to lead by
  // a body's width at 20 m, and you see it fly. It leaves no casing (you find the bolt).
  bolt:     { name: 'crossbow bolt', short: 'bolt', ammo: null, velocity: 90, drag: 0.12, dmg: 40, punch: 0.6, sound: 'pistol', casing: null, tracerEvery: 1, tracerW: 0.04, tracerLen: 0.45 },
};
// The pack's old ammo keys name a calibre (a round asked for by its box: an ammo key, a save, an older check).
export const ROUND_OF = { pistol: '45acp', smg: '9mm', rifle: '556', shells: '12ga', birdshot: '12ga_bird', slug: '12ga_slug' };
// The calibre key for a calibre, an ammo key or an old round name; its row. null when there is none.
export const calOf = (k) => (k == null ? null : ROUNDS[k] ? k : ROUND_OF[k] ?? null);
export const roundRow = (k) => ROUNDS[calOf(k)] ?? null;
// The streaks' longest lengths before Robert's second pass (2026-10-29), by calibre: the check measures against these.
export const TRACER_BEFORE = { '45acp': 2.2, '9mm': 2.6, '556': 4, '12ga': 1.1, '12ga_bird': 0.6, '12ga_slug': 1.8, bolt: 0.9 };

// The flight's laws.
//   gravity    m/s2 down
//   sound      m/s: the speed a round must beat to crack
//   cap        rounds in the air at once; a new round past it takes the oldest's slot (oldest-first recycle)
//   maxStep    m one sub-step of a round may fly: its swept ray is resolved against people, cars, dogs and animals at
//              their positions this frame, so it stays short enough that a running man moves little within one
//   maxLife    s a round may fly before it is dropped (a round that never meets anything)
//   falloff    share of the damage a round loses as it slows: dmg x (1 - falloff x (1 - v / velocity)); 0 keeps it whole
//   nearMiss   m from the player's body a round must pass for the whiz or the crack
//   fade       s a streak lingers at the impact point after the round stops (so a close shot still draws muzzle to hit)
//   streakT    s of flight a streak shows: its length is the round's speed x this, never past the row's tracerLen
//   playerLead the player's own rounds lead nothing (you aim them); AI lead lives in systems/ai.js (aimLead)
export const BALLISTICS = { gravity: 9.81, sound: 343, cap: 256, maxStep: 4, maxLife: 4, falloff: 0.5, nearMiss: 1.6, fade: 0.04, streakT: 0.0022 };

// How a shooter who is not the player leads a moving target (systems/ai.js): it watches the target's position with its
// own eyes (only while it sees them) and smooths a velocity out of what it saw; the lead is where that velocity puts
// the target when the round gets there, off by the shooter's error.
//   smooth   s: the time constant of the velocity a watcher keeps (a fresh sighting moves the estimate by dt / smooth)
//   err      fraction of the lead an average shooter gets wrong (+/- err, rolled per shot); skill scales it
//   minSpeed m/s under which the target counts as standing still (no lead)
//   maxLead  m: the furthest ahead a shooter will lead (a target the round would take seconds to reach is not chased)
//   coast    s: out of sight, a shooter carries the last sighting on along the motion it saw for at most this long (law 6:
//            the man who ducked behind cover is shot at where he was heading, never where he really is)
//   forget   s out of sight after which the next sighting starts a fresh estimate (the old motion is stale)
export const LEAD = { smooth: 0.25, err: 0.35, minSpeed: 0.6, maxLead: 12, coast: 0.8, forget: 2 };

// The World Forge's check (and the selftest's): a list of what is wrong with the rows, empty when they are fine.
export function validateRounds(rows = ROUNDS, cfg = BALLISTICS, lead = LEAD) {
  const bad = [];
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  for (const [k, r] of Object.entries(rows)) {
    if (!r || typeof r !== 'object') { bad.push(`${k}: not a row`); continue; }
    if (!num(r.velocity) || r.velocity < 20 || r.velocity > 2000) bad.push(`${k}: velocity ${r.velocity} (20..2000 m/s)`);
    if (!num(r.drag) || r.drag < 0 || r.drag > 10) bad.push(`${k}: drag ${r.drag} (0..10 /s)`);
    if (!Number.isInteger(r.tracerEvery) || r.tracerEvery < 0 || r.tracerEvery > 20) bad.push(`${k}: tracerEvery ${r.tracerEvery} (an integer 0..20)`);
    if (!num(r.tracerW) || r.tracerW <= 0 || r.tracerW > 0.3) bad.push(`${k}: tracerW ${r.tracerW} (0..0.3 m)`);
    if (!num(r.tracerLen) || r.tracerLen <= 0 || r.tracerLen > 20) bad.push(`${k}: tracerLen ${r.tracerLen} (0..20 m)`);
    if (typeof r.name !== 'string' || !r.name || typeof r.short !== 'string' || !r.short) bad.push(`${k}: name and short`);
    if (!num(r.dmg) || r.dmg <= 0 || r.dmg > 400) bad.push(`${k}: dmg ${r.dmg} (0..400)`);
    if (!num(r.punch) || r.punch <= 0 || r.punch > 12) bad.push(`${k}: punch ${r.punch} (0..12)`);
    if (!['pistol', 'smg', 'rifle', 'shotgun', 'heavy'].includes(r.sound)) bad.push(`${k}: sound ${r.sound}`);
    if (r.casing !== null && !(r.casing && num(r.casing.size) && r.casing.size > 0.1 && r.casing.size < 3 && /^#[0-9a-f]{6}$/i.test(r.casing.color))) bad.push(`${k}: casing { size 0.1..3, color #rrggbb } or null`);
    for (const f of Object.keys(r)) if (!['name', 'short', 'ammo', 'velocity', 'drag', 'dmg', 'punch', 'sound', 'casing', 'tracerEvery', 'tracerW', 'tracerLen'].includes(f)) bad.push(`${k}: unknown field ${f}`);
  }
  if (!num(cfg.gravity) || cfg.gravity < 0 || cfg.gravity > 30) bad.push(`gravity ${cfg.gravity}`);
  if (!num(cfg.sound) || cfg.sound <= 0) bad.push(`sound ${cfg.sound}`);
  if (!Number.isInteger(cfg.cap) || cfg.cap < 16 || cfg.cap > 1024) bad.push(`cap ${cfg.cap} (an integer 16..1024)`);
  if (!num(cfg.maxStep) || cfg.maxStep < 0.5 || cfg.maxStep > 20) bad.push(`maxStep ${cfg.maxStep} (0.5..20 m)`);
  if (!num(cfg.maxLife) || cfg.maxLife <= 0) bad.push(`maxLife ${cfg.maxLife}`);
  if (!num(cfg.falloff) || cfg.falloff < 0 || cfg.falloff > 1) bad.push(`falloff ${cfg.falloff} (0..1)`);
  if (!num(cfg.streakT) || cfg.streakT <= 0 || cfg.streakT > 0.02) bad.push(`streakT ${cfg.streakT} (0..0.02 s)`);
  for (const [a, c] of Object.entries(ROUND_OF)) if (!rows[c]) bad.push(`ROUND_OF ${a}: no calibre ${c}`);
  if (!num(lead.smooth) || lead.smooth <= 0) bad.push(`lead.smooth ${lead.smooth}`);
  if (!num(lead.err) || lead.err < 0 || lead.err > 2) bad.push(`lead.err ${lead.err} (0..2)`);
  if (!num(lead.maxLead) || lead.maxLead <= 0) bad.push(`lead.maxLead ${lead.maxLead}`);
  if (!num(lead.coast) || lead.coast < 0 || lead.coast > 3) bad.push(`lead.coast ${lead.coast} (0..3 s)`);
  if (!num(lead.forget) || lead.forget <= 0) bad.push(`lead.forget ${lead.forget}`);
  return bad;
}
