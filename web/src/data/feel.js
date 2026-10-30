// FEEL bands (docs/design/WEB_FEEL.md): the numbers driving and gunplay are tuned to, as rows. The `feel` command
// (agent/feel-api.js) measures them through the real code; the selftest's feel checks fail when a later change pushes
// one outside its band, so nobody can quietly ruin the feel. [lo, hi]; null = no bound on that side.
//
// Driving is measured on a sandbox car at a fixed 60 Hz (Vehicles.drive), a hard-surface ground unless named.
//   steerDelay   s from a full-lock key press to 90% of the settled turn rate at 15 m/s (a tap is a nudge, not a twitch)
//   cornerSlip   m/s of sideways slip in a steady full-lock corner at 15 m/s (weight you feel, never a skate)
//   hbSlide      m/s of peak sideways slip in a 0.8 s full-lock handbrake at 20 m/s (it really slides)
//   hbSwing      degrees the nose swings in that handbrake (a J-turn is ~90-180)
//   catchT       s from letting go to slip under 1 m/s (catchable: not instant, never a spin-out)
//   t060         s from rest to 60 mph (26.8 m/s), for the rows that get there
export const FEEL_BANDS = {
  drive: {
    steerDelay: [0.22, 0.4],
    cornerSlip: [0.3, 3.5],
    hbSlide: [3, 14],
    hbSwing: [45, 200],
    catchT: [0.15, 1.6],
  },
  // per-row 0-60 bands (s): sports and light rigs quick, trucks slower; a null hi means "may never reach 60".
  t060: { interceptor: [1.6, 3.2], buggy: [1.4, 3], bike: [1, 2.4], atv: [1.3, 3], sedan: [2.4, 4.5], pickup: [3, 5.5], patrol: [3, 5.5] },
  // Gunplay: a still player at a still target (the cursor is the aim in a top-down game, so close is near-certain).
  //   hit<d>      share of rounds that land at d metres (seeded spread, 40 rounds)
  //   foeFirst    s from an angry raider seeing you at 20 m to its first shot (it answers, not instantly)
  //   foeOnScreen share of its shots fired from inside your view (you can see who is shooting)
  gun: {
    pistol: { hit5: [0.85, 1], hit15: [0.45, 0.9] },
    smg: { hit5: [0.6, 1], hit15: [0.3, 0.8] },
    foeFirst: [0.1, 1.5],
    foeOnScreen: [0.8, 1],
  },
  // Probe settings: the speeds the corner and handbrake runs start from, and the surfaces (data/citygen.js grip rows).
  probe: { corner: 15, handbrake: 20, hbHold: 0.8, surfaces: { blacktop: 1, gravel: 0.8, dirt: 0.72 } },
};

export function validateFeel(B = FEEL_BANDS) {
  const bad = [];
  const band = (k, b) => { if (!Array.isArray(b) || b.length !== 2 || (b[0] !== null && b[1] !== null && b[0] > b[1])) bad.push(k); };
  for (const [k, b] of Object.entries(B.drive)) band(`drive.${k}`, b);
  for (const [k, b] of Object.entries(B.t060)) band(`t060.${k}`, b);
  for (const [gk, row] of Object.entries(B.gun)) if (Array.isArray(row)) band(`gun.${gk}`, row); else for (const [k, b] of Object.entries(row)) band(`gun.${gk}.${k}`, b);
  return bad;
}
