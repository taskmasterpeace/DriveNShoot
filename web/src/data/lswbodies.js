// LSW-BODIES (docs/design/WEB_LSW_BODIES.md): the people nearest the camera wear Robert's Living Superweapon bodies
// (Quaternius Universal Base Characters, CC0; public/models/lsw/PROVENANCE.md), posed every frame from DSOA's own joint
// solution (systems/characters.js). Everyone else stays on the instanced classic rig. These rows are the knobs.

// The body rows, after LSW's own packages body.hero-{standard,standard-female,lean,heavy}. mesh: which source body.
// limb / chest: width multipliers across the limbs and the trunk, from LSW's frame.bulk / frame.broad relative to its
// standard (lean damped to 30%: LSW's lean is a scaled-down hero, not a thin adult; DSOA's own build.w widens on top).
export const LSW_BODIES = {
  standard: { mesh: 'superhero-male', limb: 1, chest: 1, lsw: 'body.hero-standard' },
  'standard-female': { mesh: 'superhero-female', limb: 1, chest: 1, lsw: 'body.hero-standard-female' },
  lean: { mesh: 'superhero-male', limb: 0.88, chest: 0.9, lsw: 'body.hero-lean' },
  'lean-female': { mesh: 'superhero-female', limb: 0.88, chest: 0.9, lsw: 'body.hero-lean' },
  heavy: { mesh: 'superhero-male', limb: 1.13, chest: 1.09, lsw: 'body.hero-heavy' },
  'heavy-female': { mesh: 'superhero-female', limb: 1.13, chest: 1.09, lsw: 'body.hero-heavy' },
};

// A made character's build (data/creator.js BUILDS) picks the row family.
export const BUILD_TO_BODY = { average: 'standard', tall: 'standard', short: 'standard', lean: 'lean', wiry: 'lean', broad: 'heavy', heavy: 'heavy' };

// DSOA has no sex field on a character: the body follows the VOICE (data/voices.js): a named NPC's voice row gender,
// else genderOf(name), so how someone looks and how they sound never disagree.

export const LSW_RULES = {
  near: 24,            // how many people (nearest the camera) wear an LSW body; the rest are the classic rig
  maxNear: 32,         // the pool: GPU rows reserved for skinned bodies (near may be set up to this)
  keep: 0.8,           // hysteresis: someone already near is ranked at keep x their distance, so the edge doesn't flicker
  width: 1.2,          // all LSW bodies a touch wider than the source, to read at the top-down distance
  boot: [1.3, 1.25, 1.12], // the feet as boots: width, height, length multipliers
  headScale: 1.3,      // the head a touch bigger, for the same reason (hats and hair scale with it)
  stretch: 1.25,       // the most an LSW arm lengthens to reach a grip DSOA's wider shoulders could reach
  palm: 0.06,          // m from the wrist to where DSOA's hand point (the grip) sits
  waistUp: 0.08,       // DSOA's waist above the hip joints (characters.js WAIST_UP)
  grip: [1.1, 1.35, 1.1], // finger curl (rad) per joint when the hand closes on a gun, bars or a tool
  relax: 0.25,         // curl of an empty hand
  breath: 0.012,       // idle chest rise (fraction of torso height) at 0.25 Hz: the one thing DSOA has no pose for
  flag: { w: 0.12, h: 0.08, at: [0.15, 0.065, -0.045] }, // the shoulder flag patch: size (m) and where on the left shoulder (bind space, from the clavicle)
  default: 'lsw',      // the bodies setting: 'lsw' | 'classic'
};

export function validateLswBodies(rows = LSW_BODIES, rules = LSW_RULES) {
  const bad = [];
  for (const [k, r] of Object.entries(rows)) {
    if (!/^superhero-(male|female)$/.test(r.mesh)) bad.push(`${k}: mesh ${r.mesh}`);
    for (const f of ['limb', 'chest']) if (!(r[f] >= 0.7 && r[f] <= 1.4)) bad.push(`${k}: ${f} ${r[f]} outside 0.7..1.4`);
  }
  for (const b of Object.values(BUILD_TO_BODY)) if (!rows[b] || !rows[`${b}-female`] && b !== 'standard') bad.push(`build -> ${b} has no row`);
  if (!(rules.near >= 0 && rules.near <= rules.maxNear)) bad.push(`near ${rules.near} outside 0..${rules.maxNear}`);
  if (!['lsw', 'classic'].includes(rules.default)) bad.push(`default ${rules.default}`);
  return bad;
}
