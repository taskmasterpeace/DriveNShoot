// REACH rows (docs/design/WEB_REACH.md; the rule is systems/reach.js).
//   hand      the height of the line a hand travels, above the reacher's floor (m). Anything no taller is reached over:
//             a shop counter (1.0), a sandbag row, a low fence. A wall (2.3 and up) is not.
//   touch     this many metres past the edge of your own body nothing fits between you and the thing: no line is cast.
//             It must stay under the thinnest wall plus a shelf's half depth (0.2 + 0.25), or a hand goes through. Your
//             body's radius is your own (0.4 standing, 0.26 prone: data/stance.js), `body` when a reacher has none.
//   own       how far outside a box the thing's own point may sit and the box still count as the thing's own body (m).
//   ownMax    the longest side a thing's own body may have (m). A longer box is a wall whatever it is tagged.
//   wallTags  box tags that are never a thing's own body, however short the piece.
export const REACH = {
  hand: 1.3,
  touch: 0.4,
  body: 0.4,
  own: 0.12,
  ownMax: 3.4,
  wallTags: ['wall', 'partition', 'fence', 'gate', 'rail', 'tower'],
};

export function validateReach(R = REACH) {
  const bad = [];
  if (!(R.hand >= 1.05 && R.hand <= 1.6)) bad.push(`hand ${R.hand}: 1.05-1.6 (over a 1.0 m counter, under a 2.3 m wall and a door's 2.0 m head)`);
  if (!(R.touch >= 0 && R.touch <= 0.44)) bad.push(`touch ${R.touch}: 0-0.44 (past 0.45 a hand goes through a 0.2 m wall to a shelf on its far side)`);
  if (!(R.body >= 0.2 && R.body <= 0.6)) bad.push(`body ${R.body}: 0.2-0.6`);
  if (!(R.own >= 0 && R.own <= 0.2)) bad.push(`own ${R.own}: 0-0.2 (a shelf's point sits 0.25 m off its wall)`);
  if (!(R.ownMax >= 1 && R.ownMax <= 5)) bad.push(`ownMax ${R.ownMax}: 1-5`);
  if (!R.wallTags?.includes('wall')) bad.push("wallTags must hold 'wall'");
  return bad;
}
