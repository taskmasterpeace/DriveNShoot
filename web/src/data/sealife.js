// SEA LIFE and WATER PLACES as rows (docs/design/WEB_WATER_LIFE.md; the engine is systems/sealife.js). Change a row, not
// the code. The comment after each knob is its safe range.
//
// The law (WEB_DEPTH_PLAN §0): nobody cheats. A creature SENSES - it smells blood in the water within its range, hears a
// splash or an engine or a shot within its range, sees a few metres through the murk - and goes where the sense came
// from. It never knows where you are. The big one is announced by its shape: a shadow that grows under you before
// anything breaks the surface. Our own world: no names from anybody's books. No purple: these are greens, teals,
// blue-blacks and greys.

// ---- species ---------------------------------------------------------------------------------------------------------
//   form      shark | leviathan | school (a fish school: silhouettes) | gulls (a flock over bait)
//   waters    the water kinds it lives in (world/waves.js kinds: ocean, lagoon, lake, river, canal, swamp)
//   minDepth  m of water it needs under it (it will not follow you shallower)
//   perKm2    how many per km2 of its water near you (the director; 0 = only placed rows)
//   hp        what it takes to kill (null: small arms cannot; only `onlyBy` causes hurt it)
//   len       m, nose to tail (the silhouette's size; the leviathan's body)
//   cruise / swim / strike   m/s
//   depth     [cruise depth, deep depth] m below the surface (a shark cruising at 0.35 shows its fin)
//   smell     m: blood in the water reaches it this far (scaled by how much blood)
//   hear      m: a splash, a kicking swimmer, an engine, a shot
//   see       m: what it can make out through the water (murky: short)
//   bite      damage per bite; biteCd s between bites
//   circle    [laps, start radius, end radius] before it commits
//   flee      share of hp under which it leaves
//   colour    its silhouette from above and its fin (never purple)
export const SEALIFE = {
  shark: {
    form: 'shark', name: 'BULL SHARK', waters: ['ocean', 'lagoon'], minDepth: 1.2, perKm2: 1.1, max: 3,
    hp: 260, len: 2.9, cruise: 2.6, swim: 5.2, strike: 10.5, depth: [0.32, 2.4],
    smell: 70, hear: 38, see: 9, bite: 26, biteCd: 1.6, circle: [2, 8, 3.5], flee: 0.35, search: 14,
    colour: { body: '#2c3a3c', fin: '#3b4446', belly: '#a9b2ad' },
    bulletDepthK: 1.4,      // a round loses e^(-k x depth) of its damage in the water before it reaches the fish (0.8-3)
    meat: 'meat_raw',       // what a dead one leaves on the surface (items.js; null for nothing)
  },
  leviathan: {
    form: 'leviathan', name: 'THE DEEP ONE', waters: ['ocean'], minDepth: 6.0, perKm2: 0, max: 1,
    hp: null, onlyBy: ['fire', 'blast', 'explosion'], driveOff: 140, // fire/blast damage that drives it down and away for `away` s
    away: 420, len: 26, cruise: 2.2, swim: 6.5, strike: 8.5, depth: [6.5, 3.2], // [patrol depth, the depth it rises to before it reaches]
    hear: 95, see: 14, rise: 5.0, // s from the first sense to its arms breaking the surface (the shape grows the whole time)
    arms: 8, reach: 11, grab: 9, grabHold: 7, drag: 2.4, armHp: 90, // arm count; how far an arm reaches from the body's centre; damage/s while held; s it holds; m/s it drags toward its body; bullet damage that makes one arm let go
    boatMax: ['jetski', 'airboat', 'raft'], // what it can drag under; anything bigger it only shakes (a deck rider feels it)
    colour: { body: '#0b1a1b', arm: '#1f3330', sucker: '#5d6b57' },
  },
  school: {
    form: 'school', name: 'BAIT FISH', waters: ['ocean', 'lagoon', 'lake'], minDepth: 1.5, perKm2: 6, max: 4,
    count: 14, len: 0.35, cruise: 1.2, swim: 6.0, depth: [0.6, 1.8], spread: 3.2, scatter: 7, // a school scatters from anything moving within `scatter` m
    colour: { body: '#33433f' },
  },
  gulls: {
    form: 'gulls', name: 'GULLS', waters: ['ocean', 'lagoon'], perKm2: 0, max: 3,
    count: 6, alt: [5, 9], radius: 7, over: 'school', bodyK: 0.8, // they wheel over a school near the surface (or a body in the water)
    colour: { body: '#d9d6cc', wing: '#8f938e' },
  },
};

// The director (systems/sealife.js direct): how often it rolls, the ring it spawns in (beyond what the camera shows, so
// nothing appears in view), how far a creature may stray from you before it is put away.
export const SEA_RULES = {
  tick: 1.5,                // s between the director's rolls (0.5-4)
  spawnPad: 24,             // m beyond the camera's view radius (x1.8) that a creature may appear (12-60)
  spawnFar: 220,            // m: the far edge of the spawn ring (120-400)
  despawn: 320,             // m from you past which a creature is put away (unseen) (200-600)
  bloodLife: 45,            // s a wound's blood stays in the water (20-120)
  splashLife: 5,            // s a splash is still something to swim toward (2-10)
  kickEvery: 0.6,           // s between the splashes a moving swimmer makes (0.3-1.5)
  engineHear: 1.4,          // x a species' hear range for a boat's engine under way (1-3)
  shotHear: 0.8,            // x a species' hear range for a gunshot over the water (0.3-1.5)
};

// ---- places (WEB_DEPTH_PLAN Wave 2 WATER-PLACE) -----------------------------------------------------------------------
// Placed off a region's coast: `near` is a holdout, `dz` metres north (-) or south (+) of it along the coast, `off` metres
// seaward of the shore there (negative: into the lagoon behind the barrier). A leviathan's water is a disc of radius r.
export const WATER_PLACES = [
  { id: 'the-deep-water', kind: 'leviathan', name: 'THE DEEP WATER', near: 'meridian', dz: -2600, off: 950, r: 420, species: 'leviathan',
    note: 'nine metres of dark water two kilometres south of Meridian: fishermen say not to cross it in anything small' },
  { id: 'drowned-blocks', kind: 'flooded', name: 'THE DROWNED BLOCKS', near: 'meridian', dz: 1900, off: 150, w: 210, d: 170, seed: 11,
    note: 'a beach town the sea took: its roofs and its water tower stand out of the swell, boats thread the old streets' },
  { id: 'gull-key', kind: 'ruins', name: 'GULL KEY', near: 'meridian', dz: -900, off: 560, r: 38, seed: 5,
    note: 'a sand key with the shell of a pre-war bait shop and a fallen radio mast; dry ground in open water' },
];
// Flooded-town kit: footprint and height ranges (metres) for the drowned buildings.
export const FLOODED = { lots: 22, size: [9, 18], height: [5, 14], street: 13, tower: true, colour: ['#8a7a66', '#7b6d5c', '#94846c', '#6e6455', '#a08d70'], roof: ['#4a4038', '#5a4a3c', '#3e3a34'] };

// ---- ferries and rafts (vehicles.js rows `raft` and `ferry`; decks in data/decks.js) --------------------------------
// A cable ferry shuttles between two banks on its own (no driver): it waits `wait` s at each landing.
export const FERRIES = [
  { id: 'colorado-ferry', name: 'REMNANT FERRY', at: 'island', a: [409, -250], b: [423, -250], speed: 2.2, wait: 8 },
];

// ---- the validator (selftest + World Forge) --------------------------------------------------------------------------
const KINDS = ['ocean', 'lagoon', 'lake', 'river', 'canal', 'swamp'];
const FORMS = ['shark', 'leviathan', 'school', 'gulls'];
export function validateSealife(rows = { SEALIFE, WATER_PLACES, FERRIES, SEA_RULES }) {
  const bad = [], num = (v) => typeof v === 'number' && Number.isFinite(v);
  const hexOk = (h) => {
    if (!/^#[0-9a-f]{6}$/i.test(h)) return false;
    const r = parseInt(h.slice(1, 3), 16) / 255, g = parseInt(h.slice(3, 5), 16) / 255, b = parseInt(h.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 0.06) return true; // a grey has no hue
    let hue = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
    hue = (hue * 60 + 360) % 360;
    return !(hue >= 270 && hue <= 320); // no purple
  };
  for (const [id, s] of Object.entries(rows.SEALIFE)) {
    const at = `sealife ${id}`;
    if (!FORMS.includes(s.form)) bad.push(`${at}: form ${s.form} is not one of ${FORMS.join('|')}`);
    if (!Array.isArray(s.waters) || !s.waters.length || s.waters.some((w) => !KINDS.includes(w))) bad.push(`${at}: waters must be kinds from ${KINDS.join('|')}`);
    if (s.perKm2 !== undefined && (!num(s.perKm2) || s.perKm2 < 0 || s.perKm2 > 50)) bad.push(`${at}: perKm2 ${s.perKm2} must be 0-50`);
    if (s.form === 'shark' || s.form === 'leviathan') {
      for (const k of ['len', 'cruise', 'swim', 'strike', 'hear', 'see', 'minDepth']) if (!num(s[k]) || s[k] <= 0) bad.push(`${at}: ${k} must be > 0`);
      if (!Array.isArray(s.depth) || s.depth.length !== 2 || !s.depth.every(num)) bad.push(`${at}: depth must be [cruise, deep]`);
      if (s.form === 'shark') {
        if (!num(s.hp) || s.hp <= 0) bad.push(`${at}: a shark needs hp`);
        if (!num(s.smell) || s.smell <= 0 || s.smell > 300) bad.push(`${at}: smell ${s.smell} must be 0-300 m`);
        if (!(s.depth[0] < 0.6)) bad.push(`${at}: cruise depth ${s.depth[0]} must be under 0.6 m (its fin shows)`);
        if (!num(s.bite) || s.bite <= 0) bad.push(`${at}: bite must be > 0`);
      } else {
        if (s.hp !== null) bad.push(`${at}: the leviathan is driven off, never killed (hp null)`);
        if (!Array.isArray(s.onlyBy) || !s.onlyBy.length) bad.push(`${at}: onlyBy must name what hurts it`);
        if (!num(s.rise) || s.rise < 3) bad.push(`${at}: rise ${s.rise} must be >= 3 s (it is announced by its shape, never a jump scare)`);
        if (!num(s.reach) || !num(s.arms) || s.arms < 2 || s.arms > 12) bad.push(`${at}: arms 2-12 and a reach`);
        if (!(s.minDepth >= 4)) bad.push(`${at}: minDepth must be >= 4 m (shallow water is the way out)`);
      }
    }
    for (const [k, h] of Object.entries(s.colour ?? {})) if (!hexOk(h)) bad.push(`${at}: colour ${k} ${h} is not a hex or is purple`);
  }
  const ids = new Set();
  for (const p of rows.WATER_PLACES) {
    const at = `place ${p.id ?? '?'}`;
    if (!p.id || ids.has(p.id)) bad.push(`${at}: needs a unique id`); else ids.add(p.id);
    if (!['leviathan', 'flooded', 'ruins'].includes(p.kind)) bad.push(`${at}: kind ${p.kind}`);
    if (!num(p.dz) || !num(p.off)) bad.push(`${at}: dz and off must be numbers`);
    if (p.kind === 'leviathan' && !(rows.SEALIFE[p.species]?.form === 'leviathan' && num(p.r) && p.r > 50)) bad.push(`${at}: names a leviathan species and r > 50`);
    if (p.kind === 'flooded' && !(num(p.w) && num(p.d) && p.w > 40 && p.d > 40)) bad.push(`${at}: w and d > 40`);
    if (p.kind === 'ruins' && !(num(p.r) && p.r >= 12 && p.r <= 120)) bad.push(`${at}: r 12-120`);
  }
  for (const f of rows.FERRIES) {
    if (!f.id || !Array.isArray(f.a) || !Array.isArray(f.b) || !num(f.speed) || f.speed <= 0 || f.speed > 8) bad.push(`ferry ${f.id ?? '?'}: needs id, a, b and speed 0-8`);
    else if (Math.hypot(f.a[0] - f.b[0], f.a[1] - f.b[1]) < 10) bad.push(`ferry ${f.id}: its landings are under 10 m apart`);
  }
  for (const k of ['tick', 'spawnPad', 'spawnFar', 'despawn', 'bloodLife']) if (!(rows.SEA_RULES[k] > 0)) bad.push(`rules.${k} must be > 0`);
  return bad;
}
