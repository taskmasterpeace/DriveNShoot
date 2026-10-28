// DOCTRINE as rows: how each side fights (docs/design/WEB_CREW.md §6; systems/tactics.js reads them).
// Shared by the crew and every hostile faction: one tactical brain, many temperaments. Keyed by a character's faction.
//   name        who this is (for the panel and the debug)
//   on          false: the faction keeps its own brain (the infected swarm by noise in systems/zombies.js)
//   coverPref   0-1: how much a cover point's protection outweighs the walk to it
//   flank       0-1: the share of a squad that goes round while the rest pin
//   flankWide   x the band: how far out a flanker swings (Dustwolves swing wide)
//   suppress    0-1: how much the pinning element shoots at cover it cannot see past (suppressive fire)
//   bound       true: bounding overwatch (half move while half hold and shoot, then swap every boundS seconds)
//   breakAt     morale under which the unit falls back to regroup (drifters break early)
//   regroupS    seconds a broken unit spends falling back before it rejoins
//   bandMul     x the weapon's distance band (aggressive sides close in)
//   holdR       > 0: never strays more than this from home/post (Rust Haven's bulls hold the gate)
//   rush        true: a squad with a vehicle drives at you first (systems/vehicles.js raider AI already rams)
//   highGround  bonus for a cover point higher than the ground around it (marksmen)
export const DOCTRINE = {
  raider: { name: 'Dustwolves', on: true, coverPref: 0.45, flank: 0.55, flankWide: 1.25, suppress: 0.45, bound: false, boundS: 0, breakAt: 0.3, regroupS: 6, bandMul: 1, holdR: 0, rush: true, highGround: 0.2 },
  soldier: { name: 'Federal Remnant', on: true, coverPref: 0.85, flank: 0.35, flankWide: 1, suppress: 0.9, bound: true, boundS: 3.2, breakAt: 0.2, regroupS: 8, bandMul: 1, holdR: 0, rush: false, highGround: 0.6 },
  warden: { name: 'Rust Haven bulls', on: true, coverPref: 0.8, flank: 0.1, flankWide: 0.8, suppress: 0.6, bound: false, boundS: 0, breakAt: 0.25, regroupS: 6, bandMul: 1, holdR: 26, rush: false, highGround: 0.5 },
  drifter: { name: 'drifters', on: true, coverPref: 0.7, flank: 0.15, flankWide: 1, suppress: 0.2, bound: false, boundS: 0, breakAt: 0.6, regroupS: 10, bandMul: 1.1, holdR: 0, rush: false, highGround: 0.2 },
  ally: { name: 'your crew', on: true, coverPref: 0.65, flank: 0.4, flankWide: 1, suppress: 0.5, bound: false, boundS: 2.8, breakAt: 0.35, regroupS: 6, bandMul: 1, holdR: 0, rush: false, highGround: 0.4 },
  zombie: { name: 'the infected', on: false, coverPref: 0, flank: 0, flankWide: 0, suppress: 0, bound: false, boundS: 0, breakAt: 0, regroupS: 0, bandMul: 0, holdR: 0, rush: false, highGround: 0, swarm: 'noise' },
};

// Preferred distance bands by weapon (m): units keep their band (shotgun close, rifle long).
export const BANDS = { none: [1, 3], pistol: [7, 18], auto: [8, 20], smg: [9, 22], shotgun: [3, 9], pump: [3, 10], rifle: [25, 45] };

export const TACTICS = {
  thinkHz: 3,            // each unit re-plans this often...
  perFrame: 3,           // ...and no more than this many plan in one frame (staggered)
  squadR: 30,            // allies this close fighting the same target are one squad
  coverR: 14,            // how far a unit looks for cover
  probes: 8,             // directions tried per plan (fixed: no allocation)
  crouchY: 0.6, standY: 1.4, // the heights a cover point is tested at: covered crouched, and able to shoot standing (low cover)
  w: { exposure: 3, band: 1.5, travel: 0.05, elevation: 0.6, crowd: 1.2, vehicle: 0.4, flank: 2.5, stay: 0.6 },
  suppress: { coneDeg: 10, r: 45, add: 0.3, decay: 0.4, aimMul: 1.6, hugAt: 0.55, fireMul: 1.6 },
  flank: { minDeg: 60, maxDeg: 120, goalDeg: 90 },
  retreat: { dist: 22 },
  speed: { run: 4.6, bound: 5.2, creep: 2.6, retreat: 5.4 },
  arrive: 0.9,           // m: at the goal
  peek: { out: 1.6, in: 1.8 }, // s: leaning out of cover to shoot, then back behind it
  pathR: 6,              // a goal further than this, or not in a straight line, walks the foot nav path
  repathS: 1.2,          // a path is re-planned at most this often
};

export function validateDoctrine(rows = DOCTRINE, bands = BANDS, weapons = null) {
  const errors = [];
  for (const [k, d] of Object.entries(rows)) {
    for (const f of ['coverPref', 'flank', 'suppress', 'breakAt']) if (!(d[f] >= 0 && d[f] <= 1)) errors.push(`doctrine ${k}: ${f} 0-1`);
    if (typeof d.on !== 'boolean') errors.push(`doctrine ${k}: on must be boolean`);
    if (d.bound && !(d.boundS > 0)) errors.push(`doctrine ${k}: bound needs boundS`);
  }
  for (const [k, b] of Object.entries(bands)) if (!(b[0] > 0 && b[1] > b[0])) errors.push(`band ${k}: [min, max]`);
  if (weapons) for (const w of weapons) if (!bands[w]) errors.push(`weapon ${w} has no band`); // the built-in guns (a pack's gun falls back to the pistol's band)

  return { ok: !errors.length, errors };
}
