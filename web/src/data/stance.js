// STANCES as rows (docs/design/WEB_DECKS_STANCE.md): standing, crouched, prone. systems/stance.js reads these; nothing
// here is code. A stance decides four things at once, and every one of them has exactly one reader:
//   body      the collision body: `r` the circle radius, `len` its length along the body (0: a circle; > 0: a capsule
//             of three circles head / hip / feet), `h` how tall it stands above the floor (a cabin lower than that
//             forces a stoop: systems/decks.js)                               -> systems/stance.js fit(), decks.js
//   speed     m/s on foot (before the skill, need and pack multipliers main.js already applies)  -> main.js
//   seen      how far off a watcher picks you out, times their normal range. `crouch` keeps each watcher's OWN crouch
//             multiplier (ai 0.6, bases crouchMul, fauna 0.55, witnesses 0.6...): this row only says prone's        -> stance.seenRange()
//   brace     how much harder a moving floor has to throw you (every DECK_RULES throw/stagger line times this)  -> decks.feel()
export const STANCES = {
  stand:  { body: { r: 0.4, len: 0, h: 1.8 }, speed: 4.6, seen: 1, brace: 1 },
  crouch: { body: { r: 0.4, len: 0, h: 1.2 }, speed: 2.2, seen: null, brace: 1.6 },
  // D2 (WEB_DEPTH_PLAN §3): unseen past 12 m in cover or grass, 0.25 x spotting in the open, 0.8 m/s, aim only forward
  // +-40 degrees, never in a cabin. On an open deck you can't be thrown out, and nobody off the vehicle sees you past
  // the rail. The body lies along its own heading: head 0.85 m ahead of the hips, feet 0.85 m behind (1.7 m + radius).
  prone:  { body: { r: 0.26, len: 0.85, h: 0.45 }, speed: 0.8, seen: 0.25, brace: 3 },
};

// Prone's own rules (D2 defaults; the tuning knobs in WEB_DECKS_STANCE.md §7).
export const PRONE = {
  hiddenPast: 12,     // m: in cover or grass, a prone body is unseen past this
  concealAt: 0.45,    // 0..1: concealment at or over this counts as "in grass" (CONCEAL below)
  aimArc: 40,         // degrees either side of the body's heading the gun can point
  turnRate: 1.6,      // rad/s: the body crawls round toward where you aim (or move)
  downT: 0.35,        // s: getting down (or up) takes this long; no shooting while it does
  grassCut: 0.6,      // in grass the 0.25x range is cut by this x the concealment (cover counts as 1)
  coverY: 0.35,       // m: a sight line at this height that a wall, a rail or a crate stops = you are "in cover"
  railHide: true,     // on an open deck, a watcher off the vehicle never sees a prone rider past the rail
};

// What hides a prone body (0 open ground .. 1 thick cover), the max of every source. Biome letters are the usmap
// legend's (streamer.W.biomeAt): Florida's swamp, flatwoods, prairie and wetland stand in tall grass and palmetto; the
// desert's scrub hides little. Brush layers are THE BRUSH's painted rows (world/brush.js layerAt).
export const CONCEAL = {
  biome: { s: 0.8, F: 0.7, f: 0.55, a: 0.35, p: 0.7, u: 0.4, w: 0.85, '.': 0.15, d: 0.1, m: 0.05, g: 0.6 },
  brush: { brush: 1, forest: 0.8 },
  refresh: 0.25,      // s: how often a prone body's concealment is re-read (it only matters to a moving one)
};

// THE FOOTING on a moving deck (D3): the throw and stagger lines scale with QUICKNESS (data/stats.js ATTRIBUTES: move
// speed, hands - the sheet's agility), +-30% across 1..10 with 5 the ordinary adult; the stance's brace multiplies
// on top. footing = (1 + (q - 5) / 5 * spread) * brace. The HUD prompt shows it while you ride an open deck.
export const FOOTING = {
  attr: 'quickness', spread: 0.3, min: 0.7, max: 1.3,
  // The HUD words for the footing a rider has against what the floor is doing right now (felt / their throw line).
  bands: [[0.5, 'SURE FOOTING'], [0.8, 'SWAYING'], [1, 'LOSING FOOTING'], [Infinity, 'GOING OVER']],
};

// A stance row's shape, for the World Forge (and the selftest). [] = valid.
export function validateStance(S = STANCES, P = PRONE, F = FOOTING) {
  const bad = [];
  for (const k of ['stand', 'crouch', 'prone']) if (!S[k]) bad.push(`missing stance ${k}`);
  for (const [k, s] of Object.entries(S)) {
    const b = s.body;
    if (!b || !(b.r > 0.1 && b.r < 0.6)) bad.push(`${k}: body.r out of 0.1..0.6`);
    if (!(b?.len >= 0 && b.len < 1.2)) bad.push(`${k}: body.len out of 0..1.2`);
    if (!(b?.h > 0.2 && b.h < 2.2)) bad.push(`${k}: body.h out of 0.2..2.2`);
    if (!(s.speed > 0 && s.speed < 9)) bad.push(`${k}: speed out of 0..9`);
    if (s.seen !== null && !(s.seen > 0 && s.seen <= 1)) bad.push(`${k}: seen out of 0..1 (or null: the watcher's own crouch number)`);
    if (!(s.brace >= 1 && s.brace <= 5)) bad.push(`${k}: brace out of 1..5`);
  }
  if (S.prone && S.crouch && !(S.prone.brace > S.crouch.brace && S.prone.body.h < S.crouch.body.h)) bad.push('prone must brace more and stand lower than crouch');
  if (!(P.hiddenPast > 2 && P.hiddenPast < 60)) bad.push('PRONE.hiddenPast out of 2..60');
  if (!(P.aimArc > 5 && P.aimArc <= 90)) bad.push('PRONE.aimArc out of 5..90');
  if (!(F.spread >= 0 && F.spread < 1 && F.min <= 1 && F.max >= 1)) bad.push('FOOTING spread/min/max');
  for (const [k, v] of Object.entries(CONCEAL.biome)) if (!(v >= 0 && v <= 1)) bad.push(`CONCEAL.biome.${k} out of 0..1`);
  return bad;
}
