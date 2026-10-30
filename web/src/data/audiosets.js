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
  // step.sand: the desert's footfall is the dirt takes (data STEPS sand pitches them down); shot.heavy: the .50's slam is
  // the marksman's rifle pitched low (a calibre with its own row in CALIBER_SOUND overrides this).
  common: { alias: { 'step.sand': ['common', 'step.dirt', { pitch: 0.95 }], 'shot.heavy': ['meridian', 'shot.rifle', { pitch: 0.8, gain: 1.2 }] } },
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

// ---- THE MIX (docs/design/WEB_SOUND.md, the 2026-10-29 sound pass) ---------------------------------------------------
// tools/audio-pick.mjs peak-normalises every take to -1 dBFS, so a footstep FILE is as hot as a gunshot file. Robert's
// playtest heard exactly that ("step of walking, you got fucked up"). These gains put each kind back in its place:
// the longest prefix of a kind wins; anything unlisted plays at 0.8 (creatures, barks).
export const MIX = {
  'shot.': 1, 'shot.far': 0.8, 'explosion.': 1, 'alarm.': 0.6, 'step.': 0.24, 'impact.': 0.5, 'impact.flesh': 0.6, bodyfall: 0.55,
  'door.': 0.5, 'door.kick': 0.7, 'glass.': 0.6, 'melee.': 0.45, 'reload.': 0.45, dry: 0.4, shell: 0.28, whiz: 0.55, ricochet: 0.45,
  'vehicle.horn': 0.42, 'vehicle.skid': 0.3, 'vehicle.door': 0.5, 'vehicle.crash': 0.85, 'radio.': 0.35, 'bark.': 0.7,
};
const MIX_KEYS = Object.keys(MIX).sort((a, b) => b.length - a.length);
const mixCache = new Map();
export function mixGain(kind) {
  let g = mixCache.get(kind);
  if (g === undefined) { const k = MIX_KEYS.find((p) => (p.endsWith('.') ? kind.startsWith(p) : kind === p)); g = k ? MIX[k] : 0.8; mixCache.set(kind, g); }
  return g;
}
// How often one sound may start (plays a second, per set/kind): an MG still rattles, a flood of footsteps or
// clinks never machine-guns the ear. The longest prefix wins.
export const RATE_CAP = { default: 14, 'step.': 6, 'shot.': 22, 'impact.': 10, 'vehicle.skid': 3, 'vehicle.horn': 2, shell: 8 };
const CAP_KEYS = Object.keys(RATE_CAP).filter((k) => k !== 'default').sort((a, b) => b.length - a.length);
export function rateCap(kind) { const k = CAP_KEYS.find((p) => (p.endsWith('.') ? kind.startsWith(p) : kind === p)); return k ? RATE_CAP[k] : RATE_CAP.default; }

// ---- FOOTSTEPS --------------------------------------------------------------------------------------------------------
// A surface (systems/audio.js footSurface) -> its takes (4-8 single footfalls each, never a walk loop cut blind) and a
// level and pitch of its own. A gait scales them: a run lands harder, a crouch is soft, a prone crawl is silent except
// on gravel. Every step: pitch +- STEP_RULES.jitter, never the same take twice running (systems/audio.js pick()).
export const STEPS = {
  dirt: { kind: 'step.dirt', vol: 1 }, sand: { kind: 'step.dirt', vol: 0.8, rate: 0.95 }, gravel: { kind: 'step.gravel', vol: 1.05 },
  road: { kind: 'step.road', vol: 0.9 }, floor: { kind: 'step.floor', vol: 1 }, metal: { kind: 'step.metal', vol: 0.85 },
  grass: { kind: 'step.grass', vol: 0.85 }, water: { kind: 'step.water', vol: 1.15 }, mud: { kind: 'step.water', vol: 0.75, rate: 0.85 },
  snow: { kind: 'step.snow', vol: 0.9 }, carpet: { kind: 'step.carpet', vol: 0.75 },
};
export const STEP_SURFACES = ['dirt', 'gravel', 'road', 'floor', 'metal', 'grass', 'water', 'snow']; // carpet (3 Kenney takes) waits for a rug to stand on
export const GAIT = { walk: { vol: 1, rate: 1 }, run: { vol: 1.3, rate: 1.03 }, crouch: { vol: 0.4, rate: 0.97 }, prone: { vol: 0, rate: 0.95 } };
export const STEP_RULES = { jitter: 0.04, proneLoud: { gravel: 0.3 }, range: 22, dist: 1.2 };

// ---- CALIBRES (data/ballistics.js ROUNDS) ------------------------------------------------------------------------------
// A round's own report on top of the shooter's faction set: [kind, { set (the gun that fires it, over the faction's),
// pitch, vol }]. The weapon's class (pistol/smg/rifle...) still picks the shot kind; the kind here names the round's
// natural class and is used only when it is not a shot (the crossbow bolt's release). A .22 pops, a .357 barks like
// Rust Haven's revolvers, a .50 is the marksman's rifle pitched down.
export const CALIBER_SOUND = {
  '22lr': ['shot.pistol', { pitch: 1.28, vol: 0.5 }], '9mm': ['shot.smg', {}], '45acp': ['shot.pistol', { pitch: 0.94 }],
  '357mag': ['shot.pistol', { set: 'rusthaven', vol: 1.1 }], '556': ['shot.rifle', {}], '762x39': ['shot.rifle', { set: 'dustwolves' }],
  '762x51': ['shot.rifle', { set: 'meridian', pitch: 1.04 }], '50bmg': ['shot.heavy', { vol: 1.15 }],
  '12ga': ['shot.shotgun', {}], '12ga_bird': ['shot.shotgun', { pitch: 1.06, vol: 0.85 }], '12ga_slug': ['shot.shotgun', { pitch: 0.95, vol: 1.05 }],
  bolt: ['melee.swing', { set: 'common', pitch: 1.5, vol: 0.7 }],
};

// Every common kind the code asks for by name (systems/audio.js, interiors.js, melee.js): the selftest proves each one
// resolves to a shipped file. ('crack', the supersonic snap, is synthesized on purpose: no take was sharp enough.)
export const COMMON_IDS = ['shot.far', 'shot.heavy', 'explosion.near', 'explosion.far', 'alarm.siren', 'glass.break', 'impact.wood', 'impact.flesh',
  'impact.metal', 'bodyfall', 'whiz', 'ricochet', 'reload.pistol', 'reload.rifle', 'reload.shotgun', 'dry', 'shell', 'melee.swing',
  'vehicle.crash', 'vehicle.horn', 'vehicle.skid', 'vehicle.door', 'door.open', 'door.metal', 'step.sand'];

// ---- THE VOLUME ROW (ui/qol.js settings; systems/audio.js setVolumes) ---------------------------------------------------
export const VOLUME_DEFAULTS = { master: 0.55, music: 0.8, sfx: 1 };

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
