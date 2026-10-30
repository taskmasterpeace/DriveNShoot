// LSW-BODIES (docs/design/WEB_LSW_BODIES.md): the people nearest the camera wear Living Superweapon's FACETED bodies,
// the cubed modular-hero kit (public/models/lsw-faceted/PROVENANCE.md), posed every frame from DSOA's own joint solution
// (systems/characters.js). Everyone else stays on the instanced classic rig. These rows are the knobs.
//
// LSW builds a civilian from a RECIPE (src/tool/facetnpc-variants.js, engine/modular-costume.js): which kit modules show,
// a frame (width ratios), muscle, head size, hair, glasses, a face. DSOA does the same per person (facetRecipe below), so
// everyone gets their own body; LSW's six FACETNPC1 civilians are the presets it starts from.

// LSW's MODULAR_FRAMES (x width, y height, z depth). DSOA's joints set the lengths, so only x and z are used.
export const FACET_FRAMES = { hero: [1, 1, 1], heavy: [1.38, 0.92, 1.18], agile: [0.83, 0.98, 0.88] };

// The six FACETNPC1 variants (LSW facetnpc-variants.js VARIANTS), ported as presets: frame, muscle (0.8..1.3), hair
// module, glasses, the baked face (faces/<face>.png), and which DSOA people they dress.
export const FACET_PRESETS = {
  worker: { frame: 'heavy', muscle: 0.89, hair: 'swept', face: 'worker', for: 'working men: drifters, wasteland hands' },
  'cop-off-duty': { frame: 'agile', muscle: 0.89, hair: 'swept', face: 'cop-off-duty', for: 'the law: wardens, the player' },
  nurse: { frame: 'agile', muscle: 0.89, hair: 'bun', face: 'nurse', female: true, for: 'women (by voice)' },
  kid: { frame: 'agile', muscle: 0.85, hair: 'afro', face: 'kid', scale: 0.7, for: 'children: DSOA has no child characters yet, kept for when it does' },
  elder: { frame: 'agile', muscle: 0.89, hair: 'swept', face: 'elder', glasses: true, for: 'grey-haired people' },
  'gang-member': { frame: 'agile', muscle: 0.89, hair: 'braids', face: 'gang-member', for: 'raiders and gangs' },
};

// Faction -> preset (anything unlisted is a drifter). Soldiers and remnants are worker-built; the infected keep the
// preset of who they were, the way LSW's infected recipes are civilians with the hollow skin (the classic rig's colour).
export const FACTION_PRESET = {
  warden: 'cop-off-duty', player: 'cop-off-duty', ally: 'cop-off-duty',
  raider: 'gang-member', dustwolves: 'gang-member',
  soldier: 'worker', remnant: 'worker', rusthaven: 'worker', drifter: 'worker', drifters: 'worker', zombie: 'worker',
};

// DSOA's hair styles (characters.js hatStyle) -> the kit's hair modules. A style the kit has no module for (mohawk) or a
// hat keeps the classic piece on the faceted head; null = no hair module.
export const HAIR_MODULE = { short: 'swept', long: 'bun', bald: null };

// A made character's build (data/creator.js BUILDS) picks the frame.
export const BUILD_TO_FRAME = { average: 'hero', tall: 'hero', short: 'hero', lean: 'agile', wiry: 'agile', broad: 'heavy', heavy: 'heavy' };

// DSOA has no sex field on a character: the body follows the VOICE (data/voices.js): a named NPC's voice row gender,
// else genderOf(name), so how someone looks and how they sound never disagree.

// THE VEIN INFECTED (LSW src/engine/modular-surfaces.js INFECTION_STYLES + modular-costume.js, Robert 10-19): a near
// infected person's bare skin wears a vein map over its own (already infected) complexion. A breed reads by its veins
// (Robert 10-29): the shamblers, the common slow walkers, LSW's RED rupture veins (glowing fissures, open wounds); the
// sprinters BLACK veins; the smart ones (the echoes) NEON GREEN, radioactive, glowing. Breed is characters' zkind (a
// plain shambler has none). The Choir-Touched stays ash-pale (null: no veins).
//   mark   the vein colour drawn into the map           width  the vein stroke (px on the 256 px tile)
//   glow   the colour the veins glow (null: they don't)  wounds rupture's three open wounds
//   skin   hollow only: the bare skin lerps `skinMix` toward it instead of taking a map
export const VEIN_STYLES = {
  rupture: { mark: '#bb1725', width: 13, wounds: true, glow: '#ff2a1a' },
  black: { mark: '#120f0e', width: 9, glow: null },
  neon: { mark: '#2fd25a', width: 7, glow: '#3dff6e' },
  hollow: { mark: '#493a34', width: 5, skin: '#857b74', skinMix: 0.3, noMap: true },
};
export const VEIN_BY_BREED = { shambler: 'rupture', sprinter: 'black', echo: 'neon', greyborn: 'hollow', choir: null };
export const VEIN_RULES = {
  glowIntensity: 0.9,                   // LSW's emissive strength on the glowing veins
  clothes: '#5b4a38', clothesMix: 0.14, // the clothes take a little of the grave (LSW: 14%, not grey)
};

export const LSW_RULES = {
  near: 24,            // how many people (nearest the camera) wear a faceted body; the rest are the classic rig
  maxNear: 32,         // the pool: GPU rows reserved for skinned bodies (near may be set up to this)
  keep: 0.8,           // hysteresis: someone already near is ranked at keep x their distance, so the edge doesn't flicker
  width: 1.15,         // all bodies a touch wider than the kit, to read at the top-down distance
  boot: [1, 1, 1],     // the kit already wears boots
  headScale: 1.25,     // the head a touch bigger, for the same reason (hats and hair scale with it)
  stretch: 1.35,       // the most an arm lengthens to reach a grip DSOA's wider shoulders could reach
  palm: 0.06,          // m from the wrist to where DSOA's hand point (the grip) sits
  waistUp: 0.08,       // DSOA's waist above the hip joints (characters.js WAIST_UP)
  grip: [1.1, 1.35, 1.1], // finger curl (rad) per joint when the hand closes on a gun, bars or a tool
  relax: 0.25,         // curl of an empty hand
  breath: 0.012,       // idle chest rise (fraction of torso height) at 0.25 Hz: the one thing DSOA has no pose for
  // The flag patches on BOTH shoulder tops (Robert 10-29: the flag ON the person, read from the top-down camera, not
  // floating over them; the shoulder tops either side of the head are what the camera always sees): size (m), where on
  // the left shoulder (bind space, from the shoulder joint; the right one is its mirror), and how far each tilts out
  // over its shoulder (rad).
  flag: { w: 0.19, h: 0.125, at: [0.16, 0.05, -0.02], tilt: 0.38, lift: 0.025 },
  default: 'lsw',      // the bodies setting: 'lsw' | 'classic'
};

// A small deterministic hash of the person, so their body never changes between frames or sessions.
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; }
function grey(hex) {
  const n = parseInt(String(hex ?? '#000').slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx > 0.5 && mx - mn < 0.13; // light and nearly colourless: grey or white hair
}

// The generator (LSW generateCivilian -> validateModularRecipe, for DSOA people): one recipe per person.
//   female      from the voice (the caller passes it)
//   preset      elder if their hair has gone grey, else by sex, else by faction
//   frame       their build, else the preset's
//   muscle      the preset's, fighters (raiders, soldiers) heavier, spread by a seed
//   hair        their own style (short -> swept or an afro, long -> a bun or braids), none under a hat
//   head        width / height / depth 0.93..1.07 by the seed (LSW's 0.85..1.15 range, narrowed)
export function facetRecipe(ch, female) {
  const c = ch.colors ?? {}, seed = hash(`${ch.npc?.id ?? ch.name ?? ''}|${c.skin}|${c.shirt}|${c.hair}|${c.hatStyle}`);
  const preset = grey(c.hair) && c.hatStyle !== 'bald' ? 'elder' : female ? 'nurse' : FACTION_PRESET[ch.faction] ?? 'worker';
  const P = FACET_PRESETS[preset];
  const build = ch.build ? (ch.build.w >= 1.08 ? 'heavy' : ch.build.w <= 0.92 ? 'agile' : null) : BUILD_TO_FRAME[ch.look?.build] ?? null;
  const frame = build ?? (preset === 'worker' && seed < 0.5 ? 'hero' : P.frame);
  const fighter = ch.faction === 'raider' || ch.faction === 'soldier' || ch.faction === 'remnant';
  const muscle = Math.min(1.3, Math.max(0.8, P.muscle + (fighter ? 0.12 : 0) + (seed - 0.5) * 0.1));
  const style = c.hatStyle ?? 'short';
  let hair = Object.hasOwn(HAIR_MODULE, style) ? HAIR_MODULE[style] : undefined; // undefined: the classic piece stays
  if (hair === 'swept' && !female && seed > 0.72) hair = 'afro';
  if (hair === 'bun' && !female) hair = seed > 0.5 ? 'braids' : 'swept';
  if (preset === 'gang-member' && (hair === 'swept' || hair === 'afro')) hair = 'braids';
  const h = (k) => 0.93 + 0.14 * hash(`${seed}${k}`);
  return { preset, female: !!female, frame, muscle, hair, glasses: !!P.glasses, face: P.face, head: [h('w'), h('h'), h('d')] };
}

export function validateLswBodies(presets = FACET_PRESETS, rules = LSW_RULES) {
  const bad = [];
  const faces = new Set(['worker', 'cop-off-duty', 'nurse', 'kid', 'elder', 'gang-member']), hairs = new Set(['swept', 'afro', 'bun', 'braids']);
  for (const [k, p] of Object.entries(presets)) {
    if (!FACET_FRAMES[p.frame]) bad.push(`${k}: frame ${p.frame}`);
    if (!(p.muscle >= 0.8 && p.muscle <= 1.3)) bad.push(`${k}: muscle ${p.muscle} outside 0.8..1.3`);
    if (!hairs.has(p.hair)) bad.push(`${k}: hair ${p.hair}`);
    if (!faces.has(p.face)) bad.push(`${k}: face ${p.face}`);
  }
  for (const p of Object.values(FACTION_PRESET)) if (!presets[p]) bad.push(`faction -> ${p} has no preset`);
  for (const f of Object.values(BUILD_TO_FRAME)) if (!FACET_FRAMES[f]) bad.push(`build -> ${f} has no frame`);
  for (const m of Object.values(HAIR_MODULE)) if (m !== null && !hairs.has(m)) bad.push(`hair -> ${m}`);
  if (!(rules.near >= 0 && rules.near <= rules.maxNear)) bad.push(`near ${rules.near} outside 0..${rules.maxNear}`);
  if (!['lsw', 'classic'].includes(rules.default)) bad.push(`default ${rules.default}`);
  return bad;
}
