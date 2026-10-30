// THE MOVES AS ROWS (docs/design/WEB_MOVE_TOW.md). Every way of getting over, under, past or out of the way of something is
// a row here; systems/moves.js reads the ground ahead and picks one, the pose solver (systems/characters.js) draws it.
// SPACE (pad A) is one verb that reads what is in front of you:
//   a low wall, a fence, a car's hood within reach ahead          -> vault (waist high and under) or climb (chest high)
//   sprinting at the edge of a gap (a ditch, a channel, a drop)    -> jump it
//   crouched (CTRL held)                                           -> combat roll: low, quick, up on your feet
//   up on a roof deck at its edge                                  -> drop-hang: hang off the edge, let go, land soft
//   anything else                                                  -> dive: flat out forward, onto your belly (prone)
// Sprinting and pressing CTRL is a slide (feet first, low, on into a crouch).
//
// A row:
//   dur      seconds the move takes (the body is committed: no shooting, no turning)
//   dist     metres it carries you (a vault or a climb: over the thing, whatever its depth)
//   stamina  what it costs (0..1 of the tank); a move you can't pay for doesn't start
//   noise    how far it is heard (m; g.noise)
//   bodyH    the body's height through the move (m): what a round has to clear (LOW_BODY). Never 0: no i-frames.
//   cool     seconds before the next move
//   ends     what you are when it finishes: 'stand' | 'crouch' | 'prone'
//   pad      the pad context's button (data/controls.js reads the binding rows, this is the doc's)
export const MOVES = {
  dive:  { label: 'Dive', dur: 0.62, dist: 4.0, stamina: 0.22, noise: 9, bodyH: 0.75, cool: 0.6, ends: 'prone',
    desc: 'Flat out forward onto your belly, out of a line of fire. You land prone: low and slow to get up.' },
  roll:  { label: 'Combat roll', dur: 0.5, dist: 2.6, stamina: 0.16, noise: 6, bodyH: 0.85, cool: 0.45, ends: 'crouch',
    desc: 'Crouched, a tight shoulder roll sideways or ahead: low through it, up crouched at the end.' },
  slide: { label: 'Slide', dur: 0.7, dist: 4.4, stamina: 0.12, noise: 8, bodyH: 0.9, cool: 0.5, ends: 'crouch', minSpeed: 5.5,
    desc: 'At a sprint, CTRL drops you feet first into a slide that carries you on low into a crouch.' },
  vault: { label: 'Vault', dur: 0.48, stamina: 0.1, noise: 7, bodyH: 1.3, cool: 0.35, ends: 'stand', maxH: 1.25, maxDepth: 2.6,
    desc: 'A hand on it and over: a low wall, a fence rail, a car hood. Up to waist high.' },
  climb: { label: 'Climb over', dur: 1.05, stamina: 0.2, noise: 10, bodyH: 1.7, cool: 0.5, ends: 'stand', minH: 1.25, maxH: 1.75, maxDepth: 1.2,
    desc: 'Chest high: both arms up, a leg over, down the far side. Slow, and you can be shot on top.' },
  jump:  { label: 'Running jump', dur: 0.55, dist: 3.4, stamina: 0.14, noise: 6, bodyH: 1.5, cool: 0.4, ends: 'stand', minSpeed: 5.5, maxGap: 3.2,
    desc: 'At a sprint, SPACE at the lip of a gap (a ditch, a channel, a drop) clears up to 3.2 m of it.' },
  hang:  { label: 'Drop-hang', dur: 0.9, stamina: 0.08, noise: 3, bodyH: 1.8, cool: 0.4, ends: 'stand',
    desc: 'At the edge of a roof, SPACE lowers you to hang by your hands, then drop the last metre. Quiet, no hurt.' },
};

// Being hard to hit is honest: a round that lines up with a body only meets it if it clears the body's height at that
// range. share = how much of a standing man's height is still there (bodyH / standH), never below `floor`; within `close`
// metres a low body is as easy as a standing one (you don't miss a man at your feet).
//   P(hit | the ray crosses the body's circle) = lerp(max(floor, bodyH / standH), 1, clamp01((close - d) / close))
// Example: prone (0.45 m) at 20 m: max(0.3, 0.45 / 1.8 = 0.25) = 0.3 -> 3 rounds in 10 that line up land. At 2 m: 0.65.
export const LOW_BODY = { standH: 1.8, floor: 0.3, close: 4, prone: 0.45 };

// What the probe reads ahead (systems/moves.js probe):
//   reach    how far ahead an obstacle counts (m, from the body's edge)
//   gapLook  how far ahead a running jump looks for the far lip (m)
//   gapStep  the step it samples the ground at (m)
//   dropMin  ground this much lower than where you stand (m) is a gap; water deeper than wadeMax is one too
//   hoodH    a car's hood as an obstacle: a vehicle row's tall x this (most cars: ~1.0-1.2 m)
export const PROBE = { reach: 0.9, gapLook: 4.2, gapStep: 0.3, dropMin: 0.8, wadeMax: 0.7, hoodH: 0.62 };

export function validateMoves(rows = MOVES) {
  const bad = [];
  const ENDS = new Set(['stand', 'crouch', 'prone']);
  for (const [id, m] of Object.entries(rows)) {
    if (!(m.dur > 0 && m.dur < 3)) bad.push(`${id}: dur ${m.dur}`);
    if (!(m.stamina >= 0 && m.stamina <= 0.5)) bad.push(`${id}: stamina ${m.stamina}`);
    if (!(m.bodyH > 0.2 && m.bodyH <= LOW_BODY.standH)) bad.push(`${id}: bodyH ${m.bodyH} (no move makes you untouchable)`);
    if (!ENDS.has(m.ends)) bad.push(`${id}: ends ${m.ends}`);
    if (!(m.noise >= 0 && m.noise < 40)) bad.push(`${id}: noise ${m.noise}`);
    if (m.dist !== undefined && !(m.dist > 0 && m.dist < 8)) bad.push(`${id}: dist ${m.dist}`);
  }
  if (rows.vault && rows.climb && rows.vault.maxH !== rows.climb.minH) bad.push('vault.maxH must meet climb.minH');
  if (!(LOW_BODY.floor > 0 && LOW_BODY.floor < 1)) bad.push('LOW_BODY.floor');
  return { ok: !bad.length, bad };
}
