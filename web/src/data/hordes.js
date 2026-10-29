// ZOMBIE FUN (docs/design/WEB_DEATHS.md §3.1-3.4): three breeds that ask three answers, warnings you can read, and hordes
// that migrate down the highways as events. Robert, 2026-10-29: "Fun comes from switching how you play, not from more
// health." The breeds' own rows are data/infected.js; these are the ANSWERS each one demands, tuned so it demands it.

// THE ANSWERS (read by systems/zombies.js):
//   shambler  CROWD  a car ploughs through them (they are knocked down and under, never onto a fast car: a shambler
//                    only latches below `latchBelow` m/s), and a choke point lines them up.
//   sprinter  REFLEX it SCREAMS for `windup` s (rearing back: the tell), then charges along the heading it locked at the
//                    scream, turning at most `steer` rad/s: step aside and it runs past (`overshoot` m before it can turn
//                    back), then it is bent double for the overheat. A car is no answer: it LEAPS onto one inside
//                    `carLeap` m at any speed and claws in through the glass.
//   echo     STEALTH it copies what it hears: a noise of `minR` m or more inside `hear` m comes back from where it stands
//                    `delay` s later, `gain` as loud, at most once every `every` s; the infected round it walk to the copy
//                    (and so to it). Loud fighting near an Echo doubles every crowd; a knife does not.
export const BREED_ANSWERS = {
  shambler: { answer: 'crowd', latchBelow: 7 },
  sprinter: { answer: 'reflex', windup: 0.6, steer: 1.1, overshoot: 4, carLeap: 5.5 },
  echo: { answer: 'stealth', hear: 60, minR: 10, delay: 1.4, gain: 1.0, every: 4 },
};

// READABLE WARNINGS:
//   groan   the nearest of the infected you CAN'T see inside `range` m groans every `every` s (a positional sound: pan and
//           distance); ones you can see groan as before. You hear them before you see them.
//   scream  a sprinter's wind-up scream carries `range` m (the cue to step aside).
//   dust    a crowd of `crowd` or more on the move within `radius` m of each other kicks up dust over its middle (a pale
//           haze puff every `every` s), seen from far further than the bodies: a herd reads at a distance.
export const WARNINGS = {
  groan: { range: 50, every: [1.4, 3.0] },
  scream: { range: 70 },
  dust: { crowd: 6, radius: 12, every: 0.35, scan: 0.5, size: [3.5, 6] },
};

// HORDES AS EVENTS (systems/migrations.js): every so often a horde MIGRATES down a highway. It is a record on the world
// clock (overrun.js) walking the corridor's centreline at `speed` m/s; near you its bodies stand up and walk it; at any
// distance its dust rises over it (a plume seen to `dustSeen` m). The radio reports it only once someone has SEEN it
// (law 6, the pulls knowledge law): a witness with a set (a town, a road person, a radio man) inside `witness` m
// broadcasts it after `report` game minutes, and you hear it only with a radio inside the broadcast's range.
//   every     game hours between migrations [min, max] (the world clock; off for the battery)
//   size      bodies [min, max]
//   length    m of highway one migration walks before it breaks up off the road
//   from      m ahead of you along the corridor it starts (never in sight)
export const MIGRATION = {
  speed: 1.5, every: [20, 40], size: [80, 220], length: 6000, from: [1800, 3200],
  dustSeen: 2200, witness: 220, report: 6, lane: 18, maxLive: 2,
};

export function validateHordes(A = BREED_ANSWERS, W = WARNINGS, M = MIGRATION) {
  const bad = [];
  const num = (k, v, lo, hi) => { if (!(typeof v === 'number' && v >= lo && v <= hi)) bad.push(`${k} = ${v} out of ${lo}..${hi}`); };
  const ans = Object.values(A).map((r) => r.answer);
  if (new Set(ans).size !== ans.length) bad.push('two breeds share an answer: each must demand its own play');
  num('shambler.latchBelow', A.shambler.latchBelow, 2, 12);
  num('sprinter.windup', A.sprinter.windup, 0.2, 2); num('sprinter.steer', A.sprinter.steer, 0.2, 4); num('sprinter.carLeap', A.sprinter.carLeap, 1, 12);
  if (A.sprinter.carLeap <= 0 || A.shambler.latchBelow >= 12) bad.push('a car must beat shamblers and not sprinters');
  num('echo.hear', A.echo.hear, 10, 150); num('echo.delay', A.echo.delay, 0.2, 10); num('echo.gain', A.echo.gain, 0.3, 1.5); num('echo.every', A.echo.every, 0.5, 60);
  num('WARNINGS.groan.range', W.groan.range, 10, 120); num('WARNINGS.scream.range', W.scream.range, 10, 200);
  num('WARNINGS.dust.crowd', W.dust.crowd, 2, 40); num('WARNINGS.dust.radius', W.dust.radius, 3, 40);
  num('MIGRATION.speed', M.speed, 0.3, 4); num('MIGRATION.witness', M.witness, 20, 1000); num('MIGRATION.report', M.report, 0, 240);
  if (!(M.size[0] >= 5 && M.size[1] >= M.size[0])) bad.push('MIGRATION.size');
  if (!(M.every[0] > 0 && M.every[1] >= M.every[0])) bad.push('MIGRATION.every');
  return bad;
}
