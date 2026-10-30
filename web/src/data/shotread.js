// SHOT READ (docs/design/WEB_SHOT_READ.md): every round fired AT the player must be readable. "It doesn't feel like the
// AI is shooting back. If they are, I can't see where they're coming from." So a shot at you shows: a bigger muzzle
// flash at the shooter, a streak toward you on every round (the 1-in-N tracer rule is for rounds going elsewhere), the
// crack or whiz as it passes (systems/combat.js near miss), dust kicked up where it lands near you, and a small marker
// at the screen's edge pointing at where it came from.
//   reach      m: a round whose line passes within this of the player (ahead of the muzzle, inside its range) is AT you
//   minLen     m: the shortest streak a round at you draws (once it has flown that far); the row's speed sets the rest
//   lenT       s of flight the streak of a round at you shows (longer than BALLISTICS.streakT, still short)
//   maxLen     m: the longest streak a round at you draws
//   wMul       its width x the row's tracerW
//   fade       s a round at you stays drawn after it lands (so a near miss is seen, not only heard)
//   flashMul   the muzzle flash of a shot at you x this (size), its light x this (power)
//   puffR      m from the player inside which a round that lands kicks up dust
//   puffN      dust puffs per such landing
//   markLife   s a shot-at marker stays up (it fades out over the last half)
//   markMax    markers up at once (a pool: the oldest is reused)
//   markEdge   the marker ring as a share of the half screen (0.5 = the very edge)
//   markMin    s before the same shooter refreshes its marker again (a burst is one marker, not ten)
//   markReach  m: a round whose line passes within this of you marks its shooter as it is fired (the feel harness: with
//              only the 1.6 m near miss marking, a third of a raider's shots from off screen could not be placed;
//              docs/design/WEB_FEEL.md). 0 = near misses and hits only.
export const SHOT_READ = {
  reach: 5, minLen: 1.1, lenT: 0.0045, maxLen: 3.2, wMul: 1.8, fade: 0.1, flashMul: 1.35,
  puffR: 7, puffN: 3, markLife: 1.8, markMax: 4, markEdge: 0.44, markMin: 0.25, markReach: 5,
};

export function validateShotRead(S = SHOT_READ) {
  const bad = [], num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const want = { reach: [0.5, 20], minLen: [0.1, 5], lenT: [0.0005, 0.02], maxLen: [0.5, 10], wMul: [1, 5], fade: [0, 1], flashMul: [1, 3], puffR: [0, 30], puffN: [0, 10], markLife: [0.2, 6], markMax: [1, 8], markEdge: [0.2, 0.5], markMin: [0, 2], markReach: [0, 20] };
  for (const [k, [lo, hi]] of Object.entries(want)) if (!num(S[k], lo, hi)) bad.push(`${k} ${S[k]} (${lo}..${hi})`);
  for (const k of Object.keys(S)) if (!want[k]) bad.push(`unknown field ${k}`);
  if (S.minLen > S.maxLen) bad.push('minLen past maxLen');
  if (!Number.isInteger(S.markMax) || !Number.isInteger(S.puffN)) bad.push('markMax and puffN are integers');
  return bad;
}
