// Rounds in flight (systems/ballistics.js, docs/design/WEB_BALLISTICS.md). One row per round: the ammo key a gun fires
// (combat.js WEAPONS `ammo`) or a fire mode's own `round` (the sawn-off's slug).
//   velocity     m/s at the muzzle. Sound is BALLISTICS.sound (343 m/s): faster, the round CRACKS as it passes you;
//                slower, it whispers (the old whiz)
//   drag         1/s, linear: speed falls by drag x metres flown (v = velocity - drag * x), so no round flies further than
//                velocity / drag, and the time to a distance has a closed form (systems/ballistics.js flightTime)
//   tracerEvery  every Nth round a shooter fires of it draws a streak in flight (1: every round, 0: never)
//   tracerW      the streak's width (m)
//   tracerLen    the streak's longest length (m): it grows out of the muzzle to this, then runs ahead of its tail
// Gravity pulls every round down (BALLISTICS.gravity) with the same drag on its fall, so a round fired level from the hip
// meets the ground at last. At the game's ranges (22-68 m) the drop is centimetres; at 400 m a rifle round is about
// 1.4 m under its line (the `ballistics` command's test round reports it).
export const ROUNDS = {
  // The .45 revolver: a heavy, slow round, under the speed of sound (it whispers past; it never cracks).
  pistol: { velocity: 305, drag: 0.55, tracerEvery: 1, tracerW: 0.11, tracerLen: 5 },
  // The small fast round the SMGs and the self-loader eat: just over the speed of sound.
  smg:    { velocity: 380, drag: 0.9, tracerEvery: 3, tracerW: 0.1, tracerLen: 6 },
  // The Remnant's service rifle: fast and flat. A 300 m shot lands 0.40 s after the trigger, a 30 m one 0.036 s.
  rifle:  { velocity: 850, drag: 0.64, tracerEvery: 2, tracerW: 0.13, tracerLen: 10 },
  // Buckshot: eight pellets, quick off the muzzle, bled fast by the air (none flies past 180 m).
  shells: { velocity: 400, drag: 2.2, tracerEvery: 1, tracerW: 0.07, tracerLen: 3 },
  // The sawn-off's slug (its SLUG mode): one heavy lump, slower to lose speed than the shot.
  slug:   { velocity: 450, drag: 1.1, tracerEvery: 1, tracerW: 0.13, tracerLen: 4 },
  // A crossbow bolt (no gun fires it yet: the crossbow guards of the atlas are its first users). Slow enough to lead by
  // a body's width at 20 m, and you see it fly.
  bolt:   { velocity: 90, drag: 0.12, tracerEvery: 1, tracerW: 0.08, tracerLen: 0.9 },
};

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
//   playerLead the player's own rounds lead nothing (you aim them); AI lead lives in systems/ai.js (aimLead)
export const BALLISTICS = { gravity: 9.81, sound: 343, cap: 256, maxStep: 4, maxLife: 4, falloff: 0.5, nearMiss: 1.6, fade: 0.04 };

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
    for (const f of Object.keys(r)) if (!['velocity', 'drag', 'tracerEvery', 'tracerW', 'tracerLen'].includes(f)) bad.push(`${k}: unknown field ${f}`);
  }
  if (!num(cfg.gravity) || cfg.gravity < 0 || cfg.gravity > 30) bad.push(`gravity ${cfg.gravity}`);
  if (!num(cfg.sound) || cfg.sound <= 0) bad.push(`sound ${cfg.sound}`);
  if (!Number.isInteger(cfg.cap) || cfg.cap < 16 || cfg.cap > 1024) bad.push(`cap ${cfg.cap} (an integer 16..1024)`);
  if (!num(cfg.maxStep) || cfg.maxStep < 0.5 || cfg.maxStep > 20) bad.push(`maxStep ${cfg.maxStep} (0.5..20 m)`);
  if (!num(cfg.maxLife) || cfg.maxLife <= 0) bad.push(`maxLife ${cfg.maxLife}`);
  if (!num(cfg.falloff) || cfg.falloff < 0 || cfg.falloff > 1) bad.push(`falloff ${cfg.falloff} (0..1)`);
  if (!num(lead.smooth) || lead.smooth <= 0) bad.push(`lead.smooth ${lead.smooth}`);
  if (!num(lead.err) || lead.err < 0 || lead.err > 2) bad.push(`lead.err ${lead.err} (0..2)`);
  if (!num(lead.maxLead) || lead.maxLead <= 0) bad.push(`lead.maxLead ${lead.maxLead}`);
  if (!num(lead.coast) || lead.coast < 0 || lead.coast > 3) bad.push(`lead.coast ${lead.coast} (0..3 s)`);
  if (!num(lead.forget) || lead.forget <= 0) bad.push(`lead.forget ${lead.forget}`);
  if (!num(lead.coast) || lead.coast < 0 || lead.coast > 3) bad.push(`lead.coast ${lead.coast} (0..3 s)`);
  if (!num(lead.forget) || lead.forget <= 0) bad.push(`lead.forget ${lead.forget}`);
  return bad;
}
