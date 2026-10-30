// THE DEATH LIBRARY (docs/design/WEB_DEATHS.md): how people die, as rows. Robert, 2026-10-29: "deaths sell the game".
// Every death plays a CLIP (front or back shot, head, leg-to-crawl, blast, run over, burned, blunt, blade) on the shared
// pose solver (systems/characters.js ragPose), then blends into a cheap VERLET RAGDOLL on its last frames, so the body
// lands on what is really under it (stairs, a truck bed, a car's hood) and stays: the corpse is handed to death rites
// (systems/rites.js), which rots it to bones. Blood pools and smears go down as depth-law decals (engine/depthlayers.js).
//
// THE 12 DEATH POINTS (body-local while a clip plays: +x the character's LEFT, +z forward, y up, feet on y = 0):
//   0 hipL  1 hipR  2 kneeL  3 kneeR  4 ankleL  5 ankleR  6 shoulderL  7 shoulderR  8 elbowL  9 elbowR  10 handL  11 handR
// A clip is either BAKED frames (data/deathclips-ual.js: Robert's LSW motion packs, CC0 only) or procedural KEYS solved by
// systems/deaths.js procPose into the same 12 points at 30 fps when the module loads.
//
// A clip row:
//   name     what the death is
//   src      'proc' (keys below) or the id of a baked clip in UAL_CLIPS
//   keys     [{ t, pitch, roll, yaw, lean, slide, flex:[l,r], bend:[l,r], arm:[[pitch, splay, flex] x2] }]: s; rad; m.
//            pitch tips the whole body forward (+) or back (-); lean bends the torso at the waist; flex swings a thigh
//            forward, bend folds its knee; an arm's pitch swings it forward, splay out, flex folds the elbow. A key leaves
//            out what holds from the last one. The body rests on its lowest point (no clip floats or sinks).
//   rag      s into the clip where the ragdoll takes over (the pose still pulls it, fading to nothing at `end`)
//   end      s the clip lasts; past it the ragdoll is on its own until it settles
//   kick     { fwd, up, side, spin } m/s (spin rad/s about up) added to every point when the ragdoll takes over,
//            in the frame the body faced as it died (fwd = its forward)
//   pull     how hard the clip pulls the ragdoll back toward its pose while they blend (default 0.22; 0: a throw is all physics)
//   licence  where the motion came from (baked: the pack's licence; proc: our own keys)
export const DEATH_CLIPS = {
  front: {
    name: 'shot from the front', src: 'ual_death01', rag: 1.7, end: 2.375, kick: { fwd: -0.6, up: 0, side: 0, spin: 0 },
    licence: 'CC0-1.0, Quaternius Universal Animation Library (Death01), via LSW motion.hero-ual',
  },
  back: {
    name: 'shot in the back', src: 'proc', rag: 0.62, end: 0.95, kick: { fwd: 1.6, up: 0.2, side: 0, spin: 0 }, licence: 'own keys',
    keys: [
      { t: 0, pitch: 0, lean: 0.05, flex: [0, 0], bend: [0, 0], arm: [[0.1, 0.1, 0.2], [0.1, 0.1, 0.2]] },
      { t: 0.14, pitch: 0.1, lean: -0.35, arm: [[-0.5, 0.35, 0.3], [-0.5, 0.35, 0.3]] }, // the round arches the back
      { t: 0.4, pitch: 0.45, lean: 0.3, flex: [0.4, 0.1], bend: [0.7, 0.3], arm: [[0.6, 0.3, 0.4], [0.4, 0.4, 0.3]] },
      { t: 0.62, pitch: 1.05, lean: 0.25, flex: [0.25, 0.1], bend: [0.6, 0.2], arm: [[1.2, 0.4, 0.6], [1.0, 0.5, 0.5]] },
      { t: 0.95, pitch: 1.5, lean: 0.05, flex: [0.05, 0], bend: [0.25, 0.1], arm: [[1.9, 0.6, 0.6], [1.5, 0.7, 0.4]] },
    ],
  },
  head: {
    name: 'headshot', src: 'proc', rag: 0.3, end: 0.55, kick: { fwd: 0, up: 0, side: 0, spin: 0 }, licence: 'own keys',
    keys: [ // the strings cut: the knees go first, it folds straight down where it stood
      { t: 0, pitch: 0, lean: 0, flex: [0, 0], bend: [0, 0], arm: [[0.1, 0.1, 0.2], [0.1, 0.1, 0.2]] },
      { t: 0.16, pitch: -0.08, lean: 0.45, flex: [1.1, 1.0], bend: [2.0, 1.9], arm: [[0.1, 0.25, 0.15], [0.05, 0.3, 0.1]] },
      { t: 0.3, pitch: 0.35, lean: 0.9, flex: [1.4, 1.3], bend: [2.4, 2.3], arm: [[0.3, 0.4, 0.1], [0.2, 0.45, 0.1]] },
      { t: 0.55, pitch: 1.0, lean: 0.6, flex: [1.0, 1.2], bend: [2.2, 2.4], arm: [[0.6, 0.5, 0.2], [0.5, 0.5, 0.2]] },
    ],
  },
  leg: {
    name: 'leg shot: it drops, crawls, dies', src: 'proc', rag: 2.6, end: 2.9, kick: { fwd: 0.3, up: 0, side: 0, spin: 0 }, licence: 'own keys',
    keys: [
      { t: 0, pitch: 0, lean: 0.05, flex: [0, 0], bend: [0, 0], arm: [[0.1, 0.1, 0.2], [0.1, 0.1, 0.2]] },
      { t: 0.2, pitch: 0.15, roll: 0.25, lean: 0.35, flex: [0.9, 0.1], bend: [1.9, 0.3], arm: [[0.5, 0.4, 0.4], [0.3, 0.5, 0.3]] }, // the leg goes
      { t: 0.55, pitch: 0.2, roll: 0.05, lean: 0.4, flex: [1.4, 1.3], bend: [2.4, 2.3], arm: [[0.8, 0.3, 0.3], [0.8, 0.3, 0.3]] }, // on the knees
      { t: 0.9, pitch: 1.35, roll: 0, lean: 0.1, flex: [0.3, 0.3], bend: [0.6, 0.6], arm: [[2.0, 0.4, 0.9], [2.0, 0.4, 0.9]] }, // hands down
      { t: 1.3, slide: 0.25, arm: [[2.8, 0.3, 0.3], [1.6, 0.5, 1.2]], flex: [0.3, 0.0], bend: [1.0, 0.3] }, // it crawls: one hand reaching
      { t: 1.7, slide: 0.5, arm: [[1.6, 0.5, 1.2], [2.8, 0.3, 0.3]], flex: [0.0, 0.3], bend: [0.3, 1.0] },
      { t: 2.1, slide: 0.75, arm: [[2.8, 0.3, 0.3], [1.6, 0.5, 1.2]], flex: [0.3, 0.0], bend: [1.0, 0.3] },
      { t: 2.6, slide: 0.85, pitch: 1.5, arm: [[2.6, 0.5, 0.2], [2.2, 0.6, 0.4]], flex: [0.1, 0.05], bend: [0.3, 0.2] }, // and stops
      { t: 2.9, slide: 0.85, pitch: 1.55 },
    ],
  },
  blast: {
    name: 'blown up', src: 'ual_knockback', rag: 0.06, end: 0.5, kick: { fwd: -6.5, up: 6.5, side: 0, spin: 4 },
    licence: 'CC0-1.0, Quaternius Universal Animation Library 2 (Hit_Knockback), via LSW motion.hero-ual2',
  },
  runover: {
    name: 'run over', src: 'proc', rag: 0, end: 0.2, pull: 0, kick: { fwd: 0, up: 0, side: 0, spin: 0 }, licence: 'own keys (the launch is HOOD below)',
    keys: [{ t: 0, pitch: -0.2, lean: 0.3, flex: [0.4, -0.2], bend: [0.4, 0.2], arm: [[0.9, 0.7, 0.3], [0.7, 0.8, 0.2]] }],
  },
  burn: {
    name: 'burned', src: 'proc', rag: 3.1, end: 3.4, kick: { fwd: 0.4, up: 0, side: 0.4, spin: 0 }, licence: 'own keys',
    keys: [ // beating at the flames, staggering, down on the knees, and the fire's curl (fists up, knees drawn)
      { t: 0, pitch: 0, lean: 0.1, flex: [0, 0], bend: [0, 0], arm: [[1.4, 0.6, 1.6], [1.1, 0.7, 1.8]] },
      { t: 0.35, pitch: 0.05, yaw: 0.6, lean: 0.35, flex: [0.4, -0.1], bend: [0.5, 0.2], arm: [[2.3, 0.4, 1.0], [0.4, 0.9, 1.9]] },
      { t: 0.7, yaw: -0.4, lean: 0.2, flex: [-0.1, 0.45], bend: [0.2, 0.6], arm: [[0.5, 0.9, 1.9], [2.3, 0.4, 1.0]] },
      { t: 1.05, yaw: 0.5, lean: 0.4, flex: [0.4, -0.1], bend: [0.6, 0.2], arm: [[2.2, 0.5, 1.1], [0.6, 0.8, 1.8]] },
      { t: 1.6, yaw: 0.2, lean: 0.5, flex: [1.3, 1.2], bend: [2.3, 2.2], arm: [[1.6, 0.4, 2.0], [1.5, 0.4, 2.1]] },
      { t: 2.3, pitch: 0.4, roll: 0.3, lean: 0.8, flex: [1.4, 1.3], bend: [2.4, 2.3], arm: [[1.7, 0.3, 2.3], [1.6, 0.3, 2.3]] },
      { t: 3.1, pitch: 0.6, roll: 1.35, lean: 0.9, flex: [1.5, 1.4], bend: [2.2, 2.3], arm: [[1.8, 0.2, 2.4], [1.8, 0.2, 2.4]] },
      { t: 3.4, roll: 1.5 },
    ],
  },
  blunt: {
    name: 'beaten down (blunt)', src: 'proc', rag: 0.5, end: 0.8, kick: { fwd: -0.5, up: 0, side: 1.6, spin: 1.2 }, licence: 'own keys',
    keys: [ // the head snaps aside, the legs go out from under it
      { t: 0, pitch: 0, lean: 0.05, flex: [0, 0], bend: [0, 0], arm: [[0.1, 0.1, 0.2], [0.1, 0.1, 0.2]] },
      { t: 0.12, roll: -0.35, yaw: -0.3, lean: -0.15, arm: [[0.2, 0.9, 0.3], [0.5, 0.2, 1.2]] },
      { t: 0.35, roll: -0.7, pitch: -0.2, lean: 0.2, flex: [0.7, 0.3], bend: [1.4, 0.9], arm: [[0.4, 1.1, 0.2], [0.6, 0.6, 0.6]] },
      { t: 0.5, roll: -1.1, pitch: -0.3, flex: [0.9, 0.5], bend: [1.5, 1.0] },
      { t: 0.8, roll: -1.45, pitch: -0.35, arm: [[0.3, 1.3, 0.2], [0.9, 0.8, 0.4]] },
    ],
  },
  blade: {
    name: 'cut down (blade)', src: 'proc', rag: 1.3, end: 1.6, kick: { fwd: 0.4, up: 0, side: -0.4, spin: 0 }, licence: 'own keys',
    keys: [ // hands to the wound, bent over it, down on the knees, over on the side
      { t: 0, pitch: 0, lean: 0.05, flex: [0, 0], bend: [0, 0], arm: [[0.1, 0.1, 0.2], [0.1, 0.1, 0.2]] },
      { t: 0.22, lean: 0.55, flex: [0.2, 0.15], bend: [0.35, 0.3], arm: [[0.55, -0.15, 1.9], [0.5, -0.2, 2.0]] },
      { t: 0.6, lean: 0.75, flex: [0.6, 0.5], bend: [1.1, 0.9], arm: [[0.6, -0.15, 2.0], [0.55, -0.2, 2.1]] },
      { t: 1.0, pitch: 0.1, lean: 0.8, flex: [1.4, 1.3], bend: [2.4, 2.3], arm: [[0.7, -0.1, 2.1], [0.6, -0.15, 2.1]] },
      { t: 1.3, pitch: 0.45, roll: 0.6, lean: 0.85 },
      { t: 1.6, pitch: 0.6, roll: 1.3, lean: 0.8 },
    ],
  },
};

// Which clip a death plays (systems/deaths.js pick), first rule that matches wins:
//   cause fire -> burn; explosion -> blast; vehicle -> runover; bash with a blade (the knife, a machete) -> blade, else
//   blunt; a hit to the head -> head; to the legs -> leg; otherwise front or back by which way the round came (it came
//   from behind when it travelled the way the body faced: forward . shot > BACK_DOT).
export const BACK_DOT = 0.2;
export const BLADES = ['knife', 'machete', 'fire_axe'];

// The ragdoll: 12 verlet points (the death points), distance links at the rig's own lengths (characters.js RIG), a torso
// held square by its diagonals. It settles on what is really under each point: the land, a floor or a stair
// (stunts.heightAt), a vehicle's top (its hood, roof or deck floor: VEHICLE_TOP below).
//   gravity      m/s/s
//   iters        constraint passes per step (stiffness)
//   radius       m every point keeps above what it lies on (hips and shoulders a little more: RADIUS_TORSO)
//   friction     share of along-the-surface speed a point in contact loses per step
//   air          share of speed lost per second in the air
//   bounce       share of the into-the-surface speed kept (a body thuds, it doesn't bounce)
//   settleV      m/s: every point slower than this ...
//   settleT      s ... for this long and it has SETTLED (frozen, handed to death rites)
//   maxT         s a ragdoll is given before it is frozen where it is, whatever it is doing
//   maxActive    ragdolls stepped at once (the oldest live one is frozen to make room)
//   step         s the fixed physics step (frame-rate independent: same fall at 20 and 144 fps)
export const RAGDOLL = { gravity: 9.8, iters: 4, radius: 0.07, radiusTorso: 0.11, friction: 0.35, air: 0.12, bounce: 0.15, settleV: 0.15, settleT: 0.35, maxT: 5, maxActive: 16, step: 1 / 60 };

// What a body lands on when it lands on a vehicle (a box along the vehicle's heading). top: share of the vehicle's
// `tall` its top stands at over each lengthwise band (0 the nose, 1 the tail): a hood, then the cab's roof, then the
// cargo; a deck vehicle uses its real deck floor (systems/decks.js floorY) where the deck is.
export const VEHICLE_TOP = { bands: [[0, 0.32, 0.62], [0.32, 0.72, 1.0], [0.72, 1.01, 0.66]], within: 0.25 };

// A run-over body goes up and over the hood (systems/deaths.js runover): the car's speed carried at `carry` of it, the
// legs swept forward of the rest (`sweep` m/s more), thrown `up` m/s + `upPerMs` per m/s of the car's speed. Below
// `minSpeed` it is knocked down, not thrown (the clip still ends in the ragdoll on the road).
export const HOOD = { carry: 0.62, sweep: 3.2, up: 2.4, upPerMs: 0.16, minSpeed: 7, spin: 2.5 };

// A HEADSHOT drops one of the infected clean: a round to the head of `min` damage or more ends it whatever its hp
// (the head clip folds it where it stood). The living die by hp as always, but a head hit kills with the head clip.
export const HEADSHOT = { min: 14, causes: ['bullet'] };

// LIMBS COME OFF (dismemberment): a hit to an arm or a leg of `min` damage or more takes it off `chance` of the time
// (blade: the knife's cut on a limb; blast: `blastLimbs` limbs at random on a kill). A leg gone makes one of the living
// infected a crawler (it keeps coming); an arm gone, it bites one-handed. The limb lies where it fell (SEVERED) and the
// stump bleeds. bits: armL 1, armR 2, legL 4, legR 8.
export const SEVER = {
  arms: { min: 30, chance: 0.45 },
  legs: { min: 34, chance: 0.5 },
  blade: { arms: 0.35, legs: 0.15 },
  blastLimbs: [1, 3], blastMin: 60, // an explosion that kills with this much takes 1-3 limbs
  vehicle: { legs: 0.25, minSpeed: 14 }, // a fast car takes a leg off a quarter of the time
};
export const LIMB_BITS = { armL: 1, armR: 2, legL: 4, legR: 8 };

// Severed limbs: a small pool of loose pieces (one InstancedMesh, one draw call), two verlet points each, in the colour
// of the sleeve or the trouser. They stay `life` s (game) then go (death rites takes the body, not the pieces).
export const SEVERED = { max: 40, life: 900, radius: 0.06 };

// Blood (systems/fx.js decals on the `blood` depth layer): a pool spreads under the settled chest to `pool` m (more for a
// blast or a run-over), a stump leaves a fresh splash; a body sliding on the ground smears it (systems/blood.js, which
// skips a body in the air: deaths.js marks it `rag.air`).
export const BLOOD_ROWS = { pool: [2.0, 3.2], poolBig: 3.8, stump: 0.7, hoodSplash: true };

// The rows' shape for the World Forge and the selftest. [] = valid.
export function validateDeaths(clips = DEATH_CLIPS, baked = {}, R = RAGDOLL, sever = SEVER) {
  const bad = [];
  const num = (k, v, lo, hi) => { if (!(typeof v === 'number' && v >= lo && v <= hi)) bad.push(`${k} = ${v} out of ${lo}..${hi}`); };
  const need = ['front', 'back', 'head', 'leg', 'blast', 'runover', 'burn', 'blunt', 'blade'];
  for (const k of need) if (!clips[k]) bad.push(`no clip for ${k}`);
  for (const [k, c] of Object.entries(clips)) {
    if (!c) continue; // a missing row (named above)
    if (!c.name) bad.push(`${k}: no name`);
    if (!c.licence) bad.push(`${k}: no licence`);
    if (c.src === 'proc') {
      if (!Array.isArray(c.keys) || !c.keys.length) { bad.push(`${k}: proc with no keys`); continue; }
      if (c.keys[0].t !== 0) bad.push(`${k}: the first key is not at 0`);
      for (let i = 1; i < c.keys.length; i++) if (!(c.keys[i].t > c.keys[i - 1].t)) bad.push(`${k}: keys out of order at ${i}`);
      if (c.keys[c.keys.length - 1].t > c.end + 1e-6) bad.push(`${k}: a key past the end`);
    } else if (!baked[c.src]) bad.push(`${k}: baked clip ${c.src} missing`);
    else if (/proprietary|internal/i.test(baked[c.src].license ?? '')) bad.push(`${k}: ${c.src} is not licensed to ship`);
    num(`${k}.rag`, c.rag, 0, c.end); num(`${k}.end`, c.end, 0.1, 6);
    for (const f of ['fwd', 'up', 'side', 'spin']) num(`${k}.kick.${f}`, c.kick?.[f], -12, 12);
  }
  num('RAGDOLL.gravity', R.gravity, 1, 30); num('RAGDOLL.iters', R.iters, 1, 12); num('RAGDOLL.friction', R.friction, 0, 1);
  num('RAGDOLL.bounce', R.bounce, 0, 0.8); num('RAGDOLL.maxT', R.maxT, 1, 30); num('RAGDOLL.maxActive', R.maxActive, 1, 64);
  num('SEVER.arms.min', sever.arms.min, 5, 200); num('SEVER.legs.min', sever.legs.min, 5, 200);
  num('SEVER.arms.chance', sever.arms.chance, 0, 1); num('SEVER.legs.chance', sever.legs.chance, 0, 1);
  num('HEADSHOT.min', HEADSHOT.min, 1, 200);
  return bad;
}
