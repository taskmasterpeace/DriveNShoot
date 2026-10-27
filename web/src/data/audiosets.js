// THE SOUND SETS (docs/design/WEB_VOICE_STATS.md §2). Recorded sound from the studio library, picked by
// tools/audio-pick.mjs into public/audio/<set>/<kind>.<n>.ogg and listed in ./audio-manifest.json. This file says who
// uses which: a faction's guns and its wordless barks, a creature's voice, a vehicle's engine, a place's ambience bed.
// Pure data plus one pure resolver (resolve), shared by systems/audio.js, the commands and the selftest.
//
// A set row:  { inherit: '<set>', alias: { <kind>: ['<set>', '<kind>', { pitch, sub: [variant indices], gain }] } }
// resolve(set, kind): the set's own files -> its alias -> its inherit chain -> FALLBACK for the kind. Never throws; a
// kind nothing provides resolves to null and the caller plays its synthesized sound (systems/audio.js), as before.
import MANIFEST from './audio-manifest.json';

export const AUDIO_MANIFEST = MANIFEST;
export const AUDIO_BASE = 'audio/';

// What every faction must be able to sound like (the selftest walks FACTIONS x FACTION_KINDS).
export const FACTION_KINDS = ['shot.pistol', 'shot.smg', 'shot.rifle', 'shot.shotgun', 'shot.mg', 'shot.pistol.in', 'shot.rifle.in',
  'reload.pistol', 'reload.rifle', 'reload.shotgun', 'bark.alert', 'bark.shout', 'bark.pain', 'bark.retreat', 'bark.death', 'step.sand'];
export const CREATURE_KINDS = ['idle', 'alert', 'attack', 'pain', 'death'];

// Wordless barks: each faction its own takes, its own pitch (a Dustwolf yelp never sounds like a warden's grunt).
const barks = (pitch, pain, shout, alert, retreat, death) => ({
  'bark.pain': ['bark.male', 'pain', { pitch, sub: pain }],
  'bark.shout': shout,
  'bark.alert': alert,
  'bark.retreat': retreat,
  'bark.death': ['bark.male', 'death', { pitch: pitch * 0.97, sub: death }],
});

export const SETS = {
  common: {},
  // RUST HAVEN: wardens with revolvers and bolt rifles; calm, low, a whistle to call the wall.
  rusthaven: { inherit: 'common', alias: {
    'shot.smg': ['drifter', 'shot.smg', { pitch: 0.96 }], 'shot.mg': ['remnant', 'shot.mg', { pitch: 0.94 }],
    'shot.rifle.in': ['remnant', 'shot.rifle.in', { pitch: 0.95 }],
    ...barks(0.93, [0, 2, 4, 6], ['bark.male', 'shout', { pitch: 0.92, sub: [0, 2, 4] }], ['bark.whistle', 'signal', { sub: [0, 1] }], ['bark.male', 'shout', { pitch: 0.9, sub: [1, 3] }], [0, 2]),
  } },
  // THE DUSTWOLVES: cheap automatics, AKs, a sawn-off; high, wild, the pack's jeer.
  dustwolves: { inherit: 'common', alias: {
    'shot.mg': ['remnant', 'shot.mg', { pitch: 1.04 }], 'shot.pistol.in': ['rusthaven', 'shot.pistol.in', { pitch: 1.05 }], 'shot.rifle.in': ['remnant', 'shot.rifle.in', { pitch: 1.06 }],
    ...barks(1.07, [1, 3, 5, 7], ['bark.male', 'shout', { pitch: 1.1, sub: [1, 3, 5] }], ['bark.crowd', 'alert', { pitch: 1.05 }], ['bark.crowd', 'retreat', { pitch: 1.08 }], [1, 3]),
  } },
  // THE FEDERAL REMNANT: service rifles, the belt-fed; clipped, a whistle for orders.
  remnant: { inherit: 'common', alias: {
    'shot.shotgun': ['meridian', 'shot.shotgun', { pitch: 0.97 }], 'shot.pistol.in': ['rusthaven', 'shot.pistol.in', { pitch: 0.98 }],
    ...barks(0.98, [0, 1, 2, 3], ['bark.male', 'shout', { pitch: 0.97, sub: [0, 1] }], ['bark.whistle', 'signal', { pitch: 1.04, sub: [2, 3] }], ['bark.whistle', 'signal', { pitch: 0.96 }], [2, 3]),
  } },
  // DRIFTERS: whatever they found.
  drifter: { inherit: 'common', alias: {
    'shot.mg': ['remnant', 'shot.mg', { pitch: 1.0 }], 'shot.pistol.in': ['rusthaven', 'shot.pistol.in'], 'shot.rifle.in': ['remnant', 'shot.rifle.in'],
    ...barks(1.0, [4, 5, 6, 7], ['bark.male', 'shout', { sub: [2, 4] }], ['bark.male', 'shout', { pitch: 1.03, sub: [5] }], ['bark.crowd', 'retreat', { pitch: 0.97 }], [0, 1, 2, 3]),
  } },
  // MERIDIAN: marksmen and a good pump; their wall has as many women on it as men.
  meridian: { inherit: 'common', alias: {
    'shot.smg': ['remnant', 'shot.smg', { pitch: 1.02 }], 'shot.mg': ['remnant', 'shot.mg'], 'shot.pistol.in': ['rusthaven', 'shot.pistol.in'], 'shot.rifle.in': ['remnant', 'shot.rifle.in'],
    ...barks(1.02, [2, 4, 6], ['bark.female', 'shout', { sub: [0, 1, 2] }], ['bark.female', 'shout', { pitch: 1.05, sub: [3, 4] }], ['bark.whistle', 'signal', { pitch: 1.1 }], [1, 2]),
  } },
  // The infected (data/infected.js kinds). A sprinter alert is a scream; an Echo is a voice with no words left.
  shambler: { alias: { alert: ['shambler', 'idle', { pitch: 1.12 }], death: ['shambler', 'pain', { pitch: 0.8 }] } },
  sprinter: { alias: { attack: ['sprinter', 'alert', { pitch: 1.1 }], pain: ['shambler', 'pain', { pitch: 1.25 }], death: ['shambler', 'pain', { pitch: 1.05 }] } },
  echo: { alias: { alert: ['echo', 'idle', { pitch: 1.08 }], attack: ['shambler', 'attack', { pitch: 0.9 }], pain: ['shambler', 'pain'], death: ['shambler', 'pain', { pitch: 0.85 }] } },
  choir: { alias: { alert: ['choir', 'idle', { pitch: 1.06 }], attack: ['shambler', 'attack', { pitch: 0.8 }], pain: ['shambler', 'pain', { pitch: 0.75 }], death: ['choir', 'idle', { pitch: 0.7 }] } },
  greyborn: { inherit: 'shambler', alias: { idle: ['shambler', 'idle', { pitch: 0.82 }] } },
  // HOWLERS: they own the night.
  howler: { alias: { idle: ['howler', 'howl'], alert: ['howler', 'howl', { pitch: 1.1 }], attack: ['howler', 'snarl'], pain: ['howler', 'snarl', { pitch: 1.3 }], death: ['howler', 'howl', { pitch: 0.75 }] } },
  // The fauna (data/fauna.js species -> a voice set).
  'fauna.coyote': { alias: { idle: ['fauna.coyote', 'call'], alert: ['fauna.coyote', 'call', { pitch: 1.1 }], attack: ['fauna.dog', 'growl', { pitch: 1.1 }], pain: ['fauna.coyote', 'call', { pitch: 1.3 }], death: ['fauna.coyote', 'call', { pitch: 0.8 }] } },
  'fauna.dog': { alias: { idle: ['fauna.dog', 'bark'], alert: ['fauna.dog', 'bark', { pitch: 1.05 }], attack: ['fauna.dog', 'growl'], pain: ['fauna.dog', 'bark', { pitch: 1.4 }], death: ['fauna.dog', 'growl', { pitch: 0.8 }] } },
  'fauna.hog': { alias: { idle: ['fauna.hog', 'call'], alert: ['fauna.hog', 'call', { pitch: 1.15 }], attack: ['fauna.hog', 'call', { pitch: 0.9 }], pain: ['fauna.hog', 'call', { pitch: 1.3 }], death: ['fauna.hog', 'call', { pitch: 0.8 }] } },
  'fauna.snake': { alias: { idle: ['fauna.snake', 'call'], alert: ['fauna.snake', 'call', { pitch: 1.1 }], attack: ['fauna.snake', 'call', { pitch: 1.2 }], pain: ['fauna.snake', 'call', { pitch: 1.4 }], death: ['fauna.snake', 'call', { pitch: 0.7 }] } },
  'fauna.bird': { alias: { idle: ['fauna.bird', 'call'], alert: ['fauna.bird', 'call', { pitch: 1.1 }], attack: ['fauna.bird', 'call', { pitch: 1.2 }], pain: ['fauna.bird', 'call', { pitch: 1.3 }], death: ['fauna.bird', 'call', { pitch: 0.8 }] } },
  'fauna.cat': { alias: { idle: ['fauna.cat', 'call'], alert: ['fauna.cat', 'call', { pitch: 1.1 }], attack: ['fauna.cat', 'call', { pitch: 0.9 }], pain: ['fauna.cat', 'call', { pitch: 1.3 }], death: ['fauna.cat', 'call', { pitch: 0.75 }] } },
  'fauna.gator': { alias: { idle: ['fauna.gator', 'call'], alert: ['fauna.gator', 'call', { pitch: 1.1 }], attack: ['fauna.gator', 'call', { pitch: 0.85 }], pain: ['fauna.gator', 'call', { pitch: 1.2 }], death: ['fauna.gator', 'call', { pitch: 0.7 }] } },
};

// Who sounds like whom: a character's faction (or kind) -> its set.
export const FACTION_SET = {
  rusthaven: 'rusthaven', warden: 'rusthaven', dustwolves: 'dustwolves', raider: 'dustwolves', remnant: 'remnant', soldier: 'remnant',
  drifter: 'drifter', drifters: 'drifter', meridian: 'meridian', player: 'drifter',
};
export const FACTIONS = ['rusthaven', 'dustwolves', 'remnant', 'drifter', 'meridian'];
export const CREATURES = ['shambler', 'sprinter', 'echo', 'choir', 'greyborn', 'howler', 'fauna.coyote', 'fauna.dog', 'fauna.hog', 'fauna.snake', 'fauna.bird', 'fauna.cat', 'fauna.gator'];
export const SPECIES_SET = {
  coyote: 'fauna.coyote', javelina: 'fauna.hog', hog: 'fauna.hog', mule_deer: 'fauna.hog', whitetail: 'fauna.hog', jackrabbit: 'fauna.bird',
  rattlesnake: 'fauna.snake', cottonmouth: 'fauna.snake', vulture: 'fauna.bird', heron: 'fauna.bird', gator: 'fauna.gator', panther: 'fauna.cat', dog: 'fauna.dog',
};
export function setFor(c) {
  if (!c) return 'drifter';
  if (c.faction === 'zombie') return SETS[c.zkind] ? c.zkind : 'shambler';
  if (c.faction === 'howler' || c.howler) return 'howler';
  return FACTION_SET[c.faction] ?? FACTION_SET[c.fid] ?? 'drifter';
}

// Last resorts for a kind no set in the chain provides: [set, kind, opts].
export const FALLBACK = {
  'shot.pistol.in': ['rusthaven', 'shot.pistol.in'], 'shot.rifle.in': ['remnant', 'shot.rifle.in'],
  'shot.smg.in': ['remnant', 'shot.rifle.in', { pitch: 1.15 }], 'shot.shotgun.in': ['rusthaven', 'shot.pistol.in', { pitch: 0.8 }], 'shot.mg.in': ['remnant', 'shot.rifle.in'],
  'shot.pump': ['meridian', 'shot.shotgun'], 'shot.auto': ['drifter', 'shot.pistol', { pitch: 1.05 }],
  'shot.mg': ['remnant', 'shot.mg'], 'shot.smg': ['drifter', 'shot.smg'], 'shot.rifle': ['drifter', 'shot.rifle'], 'shot.shotgun': ['drifter', 'shot.shotgun'], 'shot.pistol': ['drifter', 'shot.pistol'],
};

// Vehicle rows (systems/vehicles.js TYPES) -> an engine class and its own pitch, so every row sounds like itself.
export const ENGINES = {
  rig: ['engine.heavy', 0.92], interceptor: ['engine.car', 1.12], buggy: ['engine.moto', 0.8], pickup: ['engine.truck', 1.0], sedan: ['engine.car', 1.0],
  van: ['engine.truck', 1.06], rv: ['engine.truck', 0.86], airboat: ['engine.boat', 1.2], jetski: ['engine.boat', 1.45], gunboat: ['engine.boat', 0.84],
  atv: ['engine.moto', 0.92], bike: ['engine.moto', 1.04], patrol: ['engine.truck', 0.96], apc: ['engine.heavy', 1.04],
};
export const ENGINE_KINDS = ['idle', 'rev', 'strain'];

// Ambience beds: a place kind -> its set (each has day and night).
export const BEDS = { desert: 'bed.desert', ruins: 'bed.ruins', swamp: 'bed.swamp', forest: 'bed.forest', coast: 'bed.coast', plains: 'bed.plains', market: 'bed.market', gate: 'bed.gate' };
export const BED_GAIN = { desert: 0.5, ruins: 0.55, swamp: 0.5, forest: 0.5, coast: 0.5, plains: 0.45, market: 0.42, gate: 0.4, rain: 0.55, wind: 0.5 };

// How sound carries (systems/audio.js spatial()). m: full level inside ref, gone at max; a voice cap.
export const SPATIAL = {
  ref: 4, rolloff: 0.9, cutoffMax: 18000, cutoffMin: 650, indoorCut: 900, indoorGain: 0.55, voiceCap: 24,
  range: { shot: 220, mg: 260, far: 520, step: 22, impact: 45, bark: 60, creature: 70, door: 35, glass: 50, explosion: 600, alarm: 320, engine: 80, default: 60 },
  jitter: 0.06, // pitch: +- this share, every play
};

// ---- the resolver ----------------------------------------------------------------------------------------------------
const own = (set, kind) => MANIFEST.sets?.[set]?.[kind]?.files?.length ? MANIFEST.sets[set][kind].files : null;
// -> { set, kind, files: [{f, ...}], pitch, gain, via } | null
export function resolve(set, kind, depth = 0) {
  if (!set || !kind || depth > 6) return null;
  const f = own(set, kind);
  if (f) return { set, kind, files: f, pitch: 1, gain: 1, via: set };
  const row = SETS[set];
  const a = row?.alias?.[kind];
  if (a) {
    const r = resolve(a[0], a[1], depth + 1);
    if (r) {
      const o = a[2] ?? {}, sub = o.sub?.filter((i) => i < r.files.length);
      return { ...r, files: sub?.length ? sub.map((i) => r.files[i]) : r.files, pitch: r.pitch * (o.pitch ?? 1), gain: r.gain * (o.gain ?? 1), via: `${set}>${r.via}` };
    }
  }
  if (row?.inherit) { const r = resolve(row.inherit, kind, depth + 1); if (r) return { ...r, via: `${set}>${r.via}` }; }
  if (set !== 'common' && own('common', kind)) return resolve('common', kind, depth + 1);
  const fb = depth === 0 ? FALLBACK[kind] : null;
  if (fb && fb[0] !== set) { const r = resolve(fb[0], fb[1], depth + 1); if (r) return { ...r, pitch: r.pitch * (fb[2]?.pitch ?? 1), via: `${set}~${r.via}` }; }
  return null;
}
