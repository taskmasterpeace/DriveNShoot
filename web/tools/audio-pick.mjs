#!/usr/bin/env node
// AUDIO PICK: the studio library on the NAS -> the game's sound sets (docs/design/WEB_VOICE_STATS.md §2).
//
//   node tools/audio-pick.mjs plan                 every slot, how many library files match, which would be picked
//   node tools/audio-pick.mjs build [--only re]    copy (never move) the picks off the NAS, cut, normalise, encode
//                                                  -> public/audio/<set>/<kind>.<n>.ogg + src/data/audio-manifest.json
//                                                  + SOUNDS-LICENSES.md
//   node tools/audio-pick.mjs size                 what public/audio weighs (the budget is 80 MB)
//
// The library: N:\assets\audio\library\<category>\<subcategory>\<file>, indexed by _MASTER-INDEX.csv (UCS categories).
// Its sources are mixed, so every pick is traced back to its license by its name and folder (the organize log's
// routing rules): *_PSE_BBC-* = Pro Sound Effects BBC; a file in the Gamemaster pack = Gamemaster Audio; a Kenney or
// OpenGameArt file = CC0; *_EF = Energetic Forms (terms unconfirmed: NEVER shipped); everything else was routed in from
// the Sonniss GDC bundles. None of it may ever be used to train or fine-tune a model (Gamemaster/PSE/Sonniss terms).
//
// A slot: { set, kind, q: [[category, subcategory|null, /name re/]...], not: /re/, n, mode, dur }
//   mode  shot   one-shot, mono: cut from its onset, `dur` s max, faded, peak-normalised (-1 dBFS)
//         slice  a file of many hits (footsteps, a burst, a take of shouts): split on its silences, each hit a variant
//         loop   mono loop (engines): a steady `dur` s from `at` (0..1 of the file), end crossfaded into its start
//         bed    stereo loop (ambience): as loop, longer, loudness-normalised quieter
// Deterministic: matches are sorted by name and picked evenly spread, so a rebuild picks the same files.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const NAS = process.env.AUDIO_NAS ?? 'N:/assets/audio';
const OUT = join(WEB, 'public', 'audio');
const MANIFEST = join(WEB, 'src', 'data', 'audio-manifest.json');
const LICENSES = join(WEB, 'SOUNDS-LICENSES.md');
const TMP = join(tmpdir(), 'audio-pick'); mkdirSync(TMP, { recursive: true });
const argv = process.argv.slice(2), cmd = argv[0] ?? 'plan';
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };

// ---- the index ------------------------------------------------------------------------------------------------------
function loadIndex() {
  const rows = [];
  for (const line of readFileSync(join(NAS, '_MASTER-INDEX.csv'), 'utf8').split(/\r?\n/).slice(1)) {
    const m = line.match(/^"([^"]*)","([^"]*)","(.*)"$/);
    if (m) rows.push({ cat: m[1], sub: m[2], file: m[3] });
  }
  return rows;
}
// The Kenney / OpenGameArt / Gamemaster names, from their own pack folders (so a routed file keeps its true license).
function packNames() {
  const out = { cc0: new Set(), gamemaster: new Set() };
  const walk = (dir, set) => { if (!existsSync(dir)) return; for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, set); else set.add(n); } };
  walk(join(NAS, 'free', 'kenney'), out.cc0); walk(join(NAS, 'free', 'opengameart'), out.cc0);
  walk(join(NAS, 'purchased', 'gamemaster-audio'), out.gamemaster);
  return out;
}
export const LICENSE = {
  pse: { name: 'Pro Sound Effects - BBC Original SFX Library', terms: 'PSE Individual EULA: royalty-free commercial use in our game, 1 user; NEVER used to train or fine-tune a model (EULA 2.16)' },
  gamemaster: { name: 'Gamemaster Audio - Gun Sound Pack', terms: 'Gamemaster EULA: royalty-free commercial use in our game, 1 user; NEVER used to train or fine-tune a model' },
  sonniss: { name: 'Sonniss GDC Game Audio Bundle', terms: 'Sonniss GDC license: royalty-free commercial use, no credit needed; never redistributed as raw files; NEVER used to train a model' },
  cc0: { name: 'Kenney / OpenGameArt', terms: 'CC0 1.0 (public domain)' },
  ef: { name: 'Energetic Forms', terms: 'UNCONFIRMED - not shipped until the terms are confirmed' },
};
function licenseOf(r, packs) {
  if (/_EF[_.]|_PSE_EF_/.test(r.file)) return 'ef';
  if (/_PSE_BBC-/.test(r.file)) return 'pse';
  if (r.sub === 'gamemaster' || packs.gamemaster.has(r.file)) return 'gamemaster';
  if (r.sub === 'kenney' || r.sub === 'opengameart' || packs.cc0.has(r.file)) return 'cc0';
  return 'sonniss';
}

// ---- the slots --------------------------------------------------------------------------------------------------------
const G = 'Guns', S = (y) => `sonniss-${y}`;
const anySon = /^sonniss-/;
// [category, subcategory (string | RegExp | null = any), name RegExp]
const SLOTS = [
  // ---- weapons: each faction's own guns, outdoor (dry, open air) and indoor (a room's tail) ----------------------
  // RUST HAVEN: wardens' revolvers, bolt rifles, a pump gun
  { set: 'rusthaven', kind: 'shot.pistol', q: [[G, 'gamemaster', /revolver_pistol_shot/], [G, anySon, /Python 357|M29_\.44|M66_\.357/]], n: 6, mode: 'slice', dur: 0.9 },
  { set: 'rusthaven', kind: 'shot.rifle', q: [[G, anySon, /M1903A3|K98k, Firing|Remington_700|MN0115|MNSD/]], n: 5, mode: 'slice', dur: 1.2 },
  { set: 'rusthaven', kind: 'shot.shotgun', q: [[G, anySon, /Remington_870|0003_Shotgun_Fire/]], n: 4, mode: 'slice', dur: 1.1 },
  { set: 'rusthaven', kind: 'shot.pistol.in', q: [[G, anySon, /Warehouse_Colt_M1911|Small Living Room/]], n: 4, mode: 'slice', dur: 1.3 },
  // DUSTWOLVES: cheap automatics, AKs, a sawn-off
  { set: 'dustwolves', kind: 'shot.smg', q: [[G, anySon, /Uzi_9mm|Mini_Uzi|Ingram_M10|Vz61_Scorpion|Grease_Gun|PPSh41|Thompson/]], n: 6, mode: 'slice', dur: 0.5 },
  { set: 'dustwolves', kind: 'shot.rifle', q: [[G, anySon, /AK47_|AKM_|AK0405|AKSD|AK4_long|AK5_valley/]], n: 6, mode: 'slice', dur: 0.9 },
  { set: 'dustwolves', kind: 'shot.shotgun', q: [[G, 'gamemaster', /gun_shotgun_shot/], [G, anySon, /SAIGA-12_12g_solid_slug_1m|USAS-12/]], n: 5, mode: 'slice', dur: 1.1 },
  { set: 'dustwolves', kind: 'shot.pistol', q: [[G, anySon, /TT33|Glock_18/]], n: 3, mode: 'slice', dur: 0.8 },
  // FEDERAL REMNANT: service rifles, the belt-fed, sidearms
  { set: 'remnant', kind: 'shot.rifle', q: [[G, anySon, /HK_416|G36C|Enfield_L85|FAMAS|Tavor|Assault Rifle - M4/]], n: 6, mode: 'slice', dur: 0.8 },
  { set: 'remnant', kind: 'shot.mg', q: [[G, anySon, /HK_MG4|L110A2|L7A2|M1919A4/], [G, 'gamemaster', /machinegun_auto_heavy_shot/]], not: /tail_only/, n: 5, mode: 'slice', dur: 0.7 },
  { set: 'remnant', kind: 'shot.pistol', q: [[G, anySon, /SIG_P229|Beretta_93R|M1911A1, Firing/]], n: 4, mode: 'slice', dur: 0.8 },
  { set: 'remnant', kind: 'shot.smg', q: [[G, anySon, /HK_MP5|HK_MP7|FN_P90|MP5_Burst/]], n: 4, mode: 'slice', dur: 0.5 },
  { set: 'remnant', kind: 'shot.rifle.in', q: [[G, anySon, /Small_Room_H&K_416|Medium_Warehouse_Browning/]], n: 3, mode: 'slice', dur: 1.3 },
  // DRIFTERS: whatever they found
  { set: 'drifter', kind: 'shot.pistol', q: [[G, 'gamemaster', /gun_pistol_shot_\d/]], n: 5, mode: 'shot', dur: 0.9 },
  { set: 'drifter', kind: 'shot.shotgun', q: [[G, anySon, /Shotgun_Fire_Round|PM_FSSF_GUN_SHOTGUN/]], n: 4, mode: 'slice', dur: 1.1 },
  { set: 'drifter', kind: 'shot.rifle', q: [[G, anySon, /\.22 Long Rifle|M38, Firing|FN_FAL/]], n: 4, mode: 'slice', dur: 1.0 },
  { set: 'drifter', kind: 'shot.smg', q: [[G, 'gamemaster', /submachine_auto_shot/]], not: /tail_only/, n: 5, mode: 'shot', dur: 0.45 },
  // MERIDIAN: marksmen's rifles and a good pump
  { set: 'meridian', kind: 'shot.rifle', q: [[G, anySon, /Sako_TRG|Barrett_M98B_\.338_Lapua_2m|HK_G3/]], n: 5, mode: 'slice', dur: 1.3 },
  { set: 'meridian', kind: 'shot.shotgun', q: [[G, anySon, /SPAS-12/]], n: 4, mode: 'slice', dur: 1.1 },
  { set: 'meridian', kind: 'shot.pistol', q: [[G, anySon, /FN_Five-seveN|HK_VP70|Desert Eagle/]], n: 4, mode: 'slice', dur: 0.8 },
  // the shared gun foley + distance
  { set: 'common', kind: 'shot.far', q: [[G, anySon, /55m_in_front|50m_behind|75m_behind|200m|long distance|far burst/]], n: 6, mode: 'slice', dur: 1.6 },
  { set: 'common', kind: 'reload.pistol', q: [[G, 'gamemaster', /gun_pistol_(insert_mag|slide_fast|remove_mag)/]], n: 4, mode: 'shot', dur: 0.8 },
  { set: 'common', kind: 'reload.rifle', q: [[G, 'gamemaster', /gun_(semi_auto_rifle|rifle)_magazine_load|gun_rifle_cock/]], n: 4, mode: 'shot', dur: 1.0 },
  { set: 'common', kind: 'reload.shotgun', q: [[G, 'gamemaster', /gun_shotgun_(load_bullet|cock)/]], n: 4, mode: 'shot', dur: 0.8 },
  { set: 'common', kind: 'dry', q: [[G, 'gamemaster', /dry_fire/]], n: 4, mode: 'shot', dur: 0.4 },
  { set: 'common', kind: 'whiz', q: [[G, anySon, /bullet_flyby|Passby_Whizzby/]], n: 4, mode: 'shot', dur: 0.6 },
  { set: 'common', kind: 'ricochet', q: [['Guns', anySon, /Bullet Impact|bullet_impact_ice/], ['Weapons', null, /ricochet|Ricochet/]], n: 4, mode: 'shot', dur: 0.8 },
  { set: 'common', kind: 'shell', q: [[G, anySon, /ShotgunShell_Land|Cartridges and Casings|bullet_shell_bounce/]], n: 3, mode: 'slice', dur: 0.5 },
  { set: 'common', kind: 'explosion.near', q: [[G, 'gamemaster', /explosion_(large|small)/], ['Explosions', null, /./]], not: /_EF|distant|Distant|far|Laser|[Ss]ci|Future|Magic/, n: 5, mode: 'shot', dur: 3.0 },
  { set: 'common', kind: 'explosion.far', q: [[G, 'gamemaster', /explosion_far_distant/], ['Explosions', null, /[Dd]istant|Far/]], not: /_EF/, n: 4, mode: 'shot', dur: 3.5 },

  // ---- footsteps by surface, impacts by material, doors and glass ---------------------------------------------------
  { set: 'common', kind: 'step.sand', q: [['Footsteps', null, /[Ss]and|[Dd]irt|Gravel|gravel/], ['Footsteps', 'kenney', /^footstep0d/], ['Foley', 'Feet', /Caves Caving/]], not: /Horse|Market|CHIL/, n: 8, mode: 'slice', dur: 0.32 },
  { set: 'common', kind: 'step.road', q: [['Footsteps', null, /Asphalt|asphalt|Concrete|concrete|BOOT_CONC/], ['Foley', 'Feet', /Road|Stone/]], n: 8, mode: 'slice', dur: 0.3 },
  { set: 'common', kind: 'step.floor', q: [['Footsteps', null, /[Ww]ood|Wooden/], ['Foley', 'Feet', /Wood|Floor/]], not: /Stairs/, n: 8, mode: 'slice', dur: 0.3 },
  { set: 'common', kind: 'step.metal', q: [['Footsteps', null, /Metal_Boot|Metal Soldier|Metal_Boots/], ['Foley', 'Feet', /Metal/]], n: 6, mode: 'slice', dur: 0.32 },
  { set: 'common', kind: 'step.grass', q: [['Footsteps', null, /[Gg]rass/]], n: 6, mode: 'slice', dur: 0.32 },
  { set: 'common', kind: 'step.water', q: [['Footsteps', null, /[Ww]ater|[Ss]plash|[Mm]ud/], ['Water', null, /[Ff]ootstep|[Ww]ading|Wade/]], n: 6, mode: 'slice', dur: 0.45 },
  { set: 'common', kind: 'impact.metal', q: [['Metal', 'Impact', /./], [G, 'gamemaster', /metal_sheet_impacts/]], n: 6, mode: 'slice', dur: 0.7 },
  { set: 'common', kind: 'impact.wood', q: [['Wood', 'Impact', /./]], n: 5, mode: 'slice', dur: 0.6 },
  { set: 'common', kind: 'impact.flesh', q: [[G, 'gamemaster', /punch_(grit_wet|general_body)_impact/], ['Guns', anySon, /bullet_impact_body/]], n: 6, mode: 'shot', dur: 0.45 },
  { set: 'common', kind: 'impact.concrete', q: [['Rocks', null, /Impact|impact|hit/]], not: /Bicycle|offload/, n: 5, mode: 'slice', dur: 0.6 },
  { set: 'common', kind: 'impact.dirt', q: [['Destruction', null, /dirt|DIRT|Sand/], ['Water', null, /Rock Hit Dirt|Rock into Gravel/]], n: 4, mode: 'slice', dur: 0.6 },
  { set: 'common', kind: 'impact.glass', q: [['Guns', anySon, /Bullet_Impact_Glass/], ['Glass', null, /[Ii]mpact|[Hh]it/]], n: 4, mode: 'slice', dur: 0.6 },
  { set: 'common', kind: 'bodyfall', q: [['Games', null, /bodyfall/], ['Fight', 'Bodyfall', /./]], n: 5, mode: 'slice', dur: 0.8 },
  { set: 'common', kind: 'door.open', q: [['Doors', 'Wood', /Doors House/], ['Doors', null, /[Oo]pen/]], not: /Stage/, n: 4, mode: 'shot', dur: 1.6 },
  { set: 'common', kind: 'door.close', q: [['Doors', null, /[Cc]lose|[Ss]lam/]], n: 4, mode: 'shot', dur: 1.4 },
  { set: 'common', kind: 'door.kick', q: [['Destruction', null, /wood_breaking|[Ww]ood.*([Bb]reak|[Cc]rack|[Ss]plinter)/], ['Wood', null, /[Bb]reak|[Ss]nap|[Ss]plinter|[Cc]rack/]], n: 4, mode: 'shot', dur: 1.2 },
  { set: 'common', kind: 'door.metal', q: [['Doors', 'Metal', /./]], n: 4, mode: 'shot', dur: 2.0 },
  { set: 'common', kind: 'glass.break', q: [['Glass', 'Break', /./], ['Glass', 'Crash & Debris', /./]], n: 6, mode: 'shot', dur: 1.6 },
  { set: 'common', kind: 'melee.swing', q: [['Swooshes', null, /[Ww]hoosh|[Ss]wish|[Ss]woosh/]], not: /_EF|Electronic|glow|Beep|[Ss]ci/, n: 4, mode: 'shot', dur: 0.5 },

  // ---- alarms, radio --------------------------------------------------------------------------------------------------
  { set: 'common', kind: 'alarm.siren', q: [['Alarms', 'Siren', /Air Raid/]], n: 3, mode: 'shot', dur: 6.0 },
  { set: 'common', kind: 'alarm.bell', q: [['Alarms', 'Bell', /./]], n: 3, mode: 'shot', dur: 3.0 },
  { set: 'common', kind: 'alarm.klaxon', q: [['Alarms', null, /[Kk]laxon|[Bb]uzzer|Electronic/], ['Alarms', 'Buzzer', /./]], n: 3, mode: 'shot', dur: 2.5 },
  { set: 'common', kind: 'radio.static', q: [['Communications', 'Static', /Static|Interfere|Receivers/], [G, 'gamemaster', /radio_(tv_electronic|walkie_talkie)_static/]], n: 4, mode: 'shot', dur: 2.0 },
  { set: 'common', kind: 'radio.stinger', q: [['Communications', 'Radio', /Morse|Receivers/], [G, 'gamemaster', /switch_button_push/]], n: 4, mode: 'shot', dur: 1.5 },

  // ---- vehicles: an engine class per kind of machine (idle / rev / strain loops); rows map onto them -----------------
  { set: 'engine.car', kind: 'idle', q: [['Vehicles', 'Car', /[Ii]dle|Exterior/]], n: 2, mode: 'loop', dur: 2.4, at: 0.15 },
  { set: 'engine.car', kind: 'rev', q: [['Vehicles', 'Car', /[Rr]ev|[Aa]ccel|Driving|driving/]], n: 2, mode: 'loop', dur: 2.4, at: 0.4 },
  { set: 'engine.car', kind: 'strain', q: [['Vehicles', 'Racing', /./], ['Vehicles', 'Car', /[Ff]ast|[Hh]igh|Pass/]], n: 2, mode: 'loop', dur: 2.4, at: 0.45 },
  { set: 'engine.truck', kind: 'idle', q: [['Vehicles', 'Truck Van & Suv', /Land Rover|Unimog|[Ii]dle/]], n: 2, mode: 'loop', dur: 2.6, at: 0.1 },
  { set: 'engine.truck', kind: 'rev', q: [['Vehicles', 'Truck Van & Suv', /[Aa]ccel|Pass|Drive/]], n: 2, mode: 'loop', dur: 2.6, at: 0.45 },
  { set: 'engine.truck', kind: 'strain', q: [['Vehicles', 'Truck Van & Suv', /Fire Engine|Lorr|Unimog/], ['Vehicles', 'Freight', /./]], n: 2, mode: 'loop', dur: 2.6, at: 0.5 },
  { set: 'engine.moto', kind: 'idle', q: [['Vehicles', 'Motorcycle', /[Ii]dle|Startup/]], n: 2, mode: 'loop', dur: 2.0, at: 0.2 },
  { set: 'engine.moto', kind: 'rev', q: [['Vehicles', 'Motorcycle', /[Aa]ccel|Racing|Pass/]], n: 2, mode: 'loop', dur: 2.0, at: 0.45 },
  { set: 'engine.moto', kind: 'strain', q: [['Vehicles', 'Motorcycle', /Racing|Fast/]], n: 2, mode: 'loop', dur: 2.0, at: 0.6 },
  { set: 'engine.heavy', kind: 'idle', q: [['Vehicles', 'Military', /Tanks/], ['Vehicles', anySon, /Infanterikanonvagn.*IDLE|Tankietka/]], n: 2, mode: 'loop', dur: 3.0, at: 0.1 },
  { set: 'engine.heavy', kind: 'rev', q: [['Vehicles', 'Military', /./], ['Vehicles', anySon, /GEARSHIFTS|Pvpjbv/]], n: 2, mode: 'loop', dur: 3.0, at: 0.4 },
  { set: 'engine.heavy', kind: 'strain', q: [['Vehicles', 'Military', /Chieftain|ECD100|ECD99/]], n: 2, mode: 'loop', dur: 3.0, at: 0.6 },
  { set: 'engine.boat', kind: 'idle', q: [['Boats', null, /Motor|Launch|Lifeboat|Outboard/]], n: 2, mode: 'loop', dur: 2.6, at: 0.15 },
  { set: 'engine.boat', kind: 'rev', q: [['Boats', null, /Speed|Motor|Racing|Power/]], n: 2, mode: 'loop', dur: 2.6, at: 0.5 },
  { set: 'engine.boat', kind: 'strain', q: [['Boats', null, /Speed|Racing|Power|Hovercraft|Jet/]], n: 2, mode: 'loop', dur: 2.6, at: 0.6 },
  { set: 'common', kind: 'vehicle.door', q: [['Vehicles', 'Door', /./]], n: 4, mode: 'shot', dur: 1.2 },
  { set: 'common', kind: 'vehicle.skid', q: [['Vehicles', 'Skid', /./], ['Vehicles', 'Tire', /./]], n: 3, mode: 'shot', dur: 1.4 },
  { set: 'common', kind: 'vehicle.crash', q: [['Vehicles', null, /[Cc]rash/], ['Destruction', null, /[Cc]ar|[Mm]etal [Cc]rash/], ['Metal', 'Crash & Debris', /./]], n: 5, mode: 'shot', dur: 2.0 },
  { set: 'common', kind: 'vehicle.horn', q: [['Vehicles', 'Horn', /./], ['Horns', null, /[Cc]ar/]], n: 3, mode: 'shot', dur: 1.0 },

  // ---- ambience beds: per biome, per kind of settlement -------------------------------------------------------------
  { set: 'bed.desert', kind: 'day', q: [['Wind', null, /Desert|desert/], [null, null, /Desert canyon|Uyuni_Desert|MOROCCO Desert/]], n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.desert', kind: 'night', q: [['Ambience', null, /[Cc]ricket|Night.*[Ii]nsect|vineyard evening/]], n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.ruins', kind: 'day', q: [['Wind', null, /Urban|Alley|Apartment|Flutter/]], n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.ruins', kind: 'night', q: [['Ambience', null, /City Night|QUIET STREET Night/]], n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.swamp', kind: 'day', q: [['Ambience', 'Swamp', /./], ['Ambience', 'Tropical', /./]], n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.swamp', kind: 'night', q: [['Animals', null, /[Ff]rog|[Tt]oad/], ['Ambience', 'Tropical', /[Nn]ight/], ['Animals', 'Insect', /./]], n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.forest', kind: 'day', q: [['Ambience', 'Forest', /./]], not: /Nighttime/, n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.forest', kind: 'night', q: [['Ambience', 'Forest', /Nighttime/], ['Ambience', null, /[Oo]wl|[Cc]icada/]], n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.coast', kind: 'day', q: [['Ambience', 'Nautical', /Birds|Atmosphere|Boatyards/], ['Water', 'Waves', /./]], n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.coast', kind: 'night', q: [['Ambience', 'Nautical', /Evening|Winter/], ['Water', 'Lapping', /./]], n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.plains', kind: 'day', q: [['Ambience', 'Rural', /Field|Farms|Atmos/]], n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.plains', kind: 'night', q: [['Ambience', 'Rural', /Dawn|Night|Evening/], ['Ambience', null, /Coyotes|coyotes/]], n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.market', kind: 'day', q: [['Ambience', 'Market', /Africa|Morocco|Auctions|Cattle/], ['Human', null, /Market souk/]], n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.market', kind: 'night', q: [['Ambience', 'Restaurant & Bar', /./], ['Crowds', 'Walla', /Int Chatter|Cafes/]], n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.gate', kind: 'day', q: [['Ambience', 'Industrial', /Bricklaying|Factories|Industry/], ['Ambience', 'Warfare', /Drill Army/]], n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.gate', kind: 'night', q: [['Ambience', 'Industrial', /Power Station/], ['Ambience', 'Warfare', /./]], not: /Air Raid|Anti Aircraft/, n: 2, mode: 'bed', dur: 36 },
  { set: 'bed.weather', kind: 'rain', q: [['Rain', null, /Rain|rain/]], not: /car window|CNC|SciFi/, n: 2, mode: 'bed', dur: 30 },
  { set: 'bed.weather', kind: 'wind', q: [['Wind', null, /Massive|Heavy|Gust/]], n: 2, mode: 'bed', dur: 30 },

  // ---- the infected, the howlers, the fauna --------------------------------------------------------------------------
  { set: 'shambler', kind: 'idle', q: [[null, null, /ZOMBIE Idle|Zombie Brat Groan|ZombieVocalizationsGeneral|Zombie Specimens/]], n: 6, mode: 'slice', dur: 2.2 },
  { set: 'shambler', kind: 'attack', q: [[null, null, /Zombie biting|ZombieVocalizationsGeneral|Zombie Specimens/]], n: 4, mode: 'slice', dur: 1.6 },
  { set: 'shambler', kind: 'pain', q: [[null, null, /GroanyMonster_Pain|Creature_Monster_Pain|troll_monster_hurt/]], n: 4, mode: 'slice', dur: 1.2 },
  { set: 'sprinter', kind: 'alert', q: [['Animals', null, /pain_scream|Monster Within|LargeMonster.*Roar/]], n: 4, mode: 'slice', dur: 1.4 },
  { set: 'sprinter', kind: 'idle', q: [['Human', 'Breath', /./]], n: 4, mode: 'slice', dur: 1.6 },
  { set: 'echo', kind: 'idle', q: [['Voices', 'Futzed', /./], ['Crowds', 'Walla', /Crowd Int Chatter/]], n: 4, mode: 'shot', dur: 2.2 },
  { set: 'choir', kind: 'idle', q: [['Designed', 'Eerie', /./], ['Electricity', null, /[Hh]um/]], not: /_EF/, n: 4, mode: 'shot', dur: 3.5 },
  { set: 'howler', kind: 'howl', q: [['Animals', 'Dog', /Howling/], [null, null, /Coyotes 2015|CloseCoyote|Steens Night/]], n: 4, mode: 'slice', dur: 3.5 },
  { set: 'howler', kind: 'snarl', q: [[null, null, /Growl Dry|Monster Growls|Dinosaur Growl/], ['Animals', 'Cat Domestic', /Growling/]], n: 4, mode: 'slice', dur: 1.4 },
  { set: 'fauna.coyote', kind: 'call', q: [[null, null, /Coyotes|coyotes/]], n: 3, mode: 'slice', dur: 3.0 },
  { set: 'fauna.dog', kind: 'bark', q: [['Animals', 'Dog', /Barking|Golde|Spring|Irish/]], n: 5, mode: 'slice', dur: 0.7 },
  { set: 'fauna.dog', kind: 'growl', q: [['Animals', 'Dog', /[Gg]rowl/], ['Animals', 'Cat Domestic', /Growling/]], n: 3, mode: 'slice', dur: 1.3 },
  { set: 'fauna.hog', kind: 'call', q: [['Animals', 'Farm', /Pigs/], ['Animals', null, /Pig_Grunt|Pig 07 Squeal/]], n: 4, mode: 'slice', dur: 1.2 },
  { set: 'fauna.snake', kind: 'call', q: [['Animals', null, /snake_hiss/], [null, null, /Rattle-Mechanics/]], n: 3, mode: 'slice', dur: 1.4 },
  { set: 'fauna.bird', kind: 'call', q: [['Birds', 'Bird Of Prey', /./], ['Birds', null, /Goshawk|Kite/]], n: 3, mode: 'slice', dur: 1.8 },
  { set: 'fauna.cat', kind: 'call', q: [['Animals', 'Wild', /Leopards/], ['Animals', 'Cat Domestic', /Growling/]], n: 3, mode: 'slice', dur: 1.8 },
  { set: 'fauna.gator', kind: 'call', q: [[null, null, /Swamp Fish Creature|Camel A, Grunt|Dinosaur Growl/]], n: 3, mode: 'slice', dur: 1.6 },

  // ---- BARK BEDS: the wordless half of every faction's voice (shouts, pain, alert, retreat) ---------------------------
  // Each faction draws from different takes so a Dustwolf scream never sounds like a warden's.
  { set: 'bark.male', kind: 'pain', q: [['Human', null, /Pain|Hurt|Grunts? \d|Male_Grunt|EMOTE/], ['Animals', null, /troll_monster_hurt/]], not: /Female|female|Woman|Child|laugh/, n: 8, mode: 'slice', dur: 0.9 },
  { set: 'bark.male', kind: 'shout', q: [['Human', null, /Battle Cry|Male_Grunt-Shout/], ['Crowds', null, /War Unit.*Shout/]], n: 6, mode: 'slice', dur: 1.2 },
  { set: 'bark.male', kind: 'death', q: [['Voices', 'Scream', /Male in Shock|Screams_PSE/]], n: 4, mode: 'slice', dur: 1.4 },
  { set: 'bark.female', kind: 'shout', q: [['Human', null, /Female|female|Woman|woman/]], not: /Breath|breath|Sneeze|Snore|Cough|laugh|Laugh/, n: 5, mode: 'slice', dur: 1.2 },
  { set: 'bark.crowd', kind: 'alert', q: [['Crowds', 'Angry', /./], ['Crowds', 'Battle', /./]], n: 4, mode: 'shot', dur: 2.5 },
  { set: 'bark.crowd', kind: 'retreat', q: [['Crowds', 'Reaction', /./], ['Crowds', null, /Jeers|Demo/]], n: 3, mode: 'shot', dur: 2.0 },
  { set: 'bark.whistle', kind: 'signal', q: [['Whistles', 'Human', /./], ['Whistles', 'Misc', /./]], not: /Comedy/, n: 4, mode: 'slice', dur: 1.2 },
];

// ---- matching ---------------------------------------------------------------------------------------------------------
const matchQ = (r, [cat, sub, re]) => (cat === null || r.cat === cat) && (sub === null || (sub instanceof RegExp ? sub.test(r.sub) : r.sub === sub)) && re.test(r.file);
function candidates(slot, idx, packs) {
  const seen = new Set(), out = [];
  for (const q of slot.q) for (const r of idx) {
    if (!matchQ(r, q) || seen.has(r.file) || (slot.not && slot.not.test(r.file))) continue;
    const lic = licenseOf(r, packs);
    if (lic === 'ef') continue; // never shipped until its terms are confirmed
    seen.add(r.file); out.push({ ...r, lic });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}
// Evenly spread through the sorted matches, so the picks come from different takes and sessions.
const spread = (list, n) => { if (list.length <= n) return list; const out = []; for (let i = 0; i < n; i++) out.push(list[Math.floor(((i + 0.5) * list.length) / n)]); return out; };

// ---- ffmpeg ------------------------------------------------------------------------------------------------------------
const FF = process.env.FFMPEG ?? 'ffmpeg';
const ff = (args) => execFileSync(FF, ['-hide_banner', '-nostdin', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
// ffmpeg's report (stderr) whether it succeeded or not: probing, silencedetect, volumedetect all print there.
const ffErr = (args) => String(spawnSync(FF, ['-hide_banner', '-nostdin', ...args], { maxBuffer: 64 << 20 }).stderr ?? '');
function probeDur(file) { const m = ffErr(['-i', file]).match(/Duration: (\d+):(\d+):([\d.]+)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0; }
// The loud parts of a file (its first 40 s): [start, end] pairs between silences.
function segments(file, floorDb, total) {
  const log = ffErr(['-t', '40', '-i', file, '-map', '0:a:0', '-af', `silencedetect=n=${floorDb}dB:d=0.05`, '-f', 'null', '-']);
  const segs = []; let cur = 0;
  for (const m of log.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    const t = +m[2];
    if (m[1] === 'start') { if (t - cur > 0.04) segs.push([cur, t]); } else cur = t;
  }
  if (Math.min(total, 40) - cur > 0.04) segs.push([cur, Math.min(total, 40)]);
  return segs;
}
function peakGain(file) { const m = ffErr(['-i', file, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-']).match(/max_volume: (-?[\d.]+) dB/); return m ? -1 - +m[1] : 0; }
// One-shot: from `ss` for up to `dur` s, mono, faded, peak-normalised, Opus.
function encodeShot(src, ss, dur, out) {
  const tmp = join(TMP, 'shot.wav');
  const fade = Math.min(0.25, dur * 0.3);
  ff(['-ss', ss.toFixed(3), '-t', dur.toFixed(3), '-i', src, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-af', `afade=t=in:d=0.004,afade=t=out:st=${Math.max(0, dur - fade).toFixed(3)}:d=${fade.toFixed(3)}`, tmp]);
  const g = peakGain(tmp);
  if (g > 40) throw new Error(`silent cut (peak ${(-1 - g).toFixed(0)} dB)`); // nothing in it: refuse rather than ship a blank
  ff(['-i', tmp, '-af', `volume=${g.toFixed(2)}dB`, '-c:a', 'libopus', '-b:a', '40k', '-vbr', 'on', out]);
}
// Loop / bed: a steady stretch, its last X s crossfaded over its first X s, so the buffer loops without a seam.
function encodeLoop(src, ss, dur, out, stereo) {
  const X = stereo ? 2.0 : 0.25, L = dur;
  const tmp = join(TMP, 'loop.wav');
  const fc = `[0:a:0]asplit=3[a][b][c];[a]atrim=0:${X},asetpts=PTS-STARTPTS,afade=t=in:d=${X}[h];[c]atrim=${L}:${L + X},asetpts=PTS-STARTPTS,afade=t=out:d=${X}[t];[h][t]amix=inputs=2:normalize=0[x];[b]atrim=${X}:${L},asetpts=PTS-STARTPTS[body];[x][body]concat=n=2:v=0:a=1[o]`;
  ff(['-ss', ss.toFixed(2), '-t', (L + X + 0.1).toFixed(2), '-i', src, '-ac', stereo ? '2' : '1', '-ar', '48000', '-filter_complex', fc, '-map', '[o]', tmp]);
  if (stereo) ff(['-i', tmp, '-af', 'loudnorm=I=-26:TP=-3:LRA=11', '-ar', '48000', '-c:a', 'libopus', '-b:a', '56k', out]);
  else { const g = peakGain(tmp); ff(['-i', tmp, '-af', `volume=${(g - 2).toFixed(2)}dB`, '-c:a', 'libopus', '-b:a', '40k', out]); }
}

// ---- the commands ------------------------------------------------------------------------------------------------------
const pathOf = (r) => join(NAS, 'library', r.cat, r.sub, r.file);

function plan() {
  const idx = loadIndex(), packs = packNames();
  let short = 0;
  for (const s of SLOTS) {
    const c = candidates(s, idx, packs), p = spread(c, s.n);
    if (c.length < 1) short++;
    console.log(`${(s.set + '/' + s.kind).padEnd(28)} ${String(c.length).padStart(4)} match  ${c.length ? '' : 'NONE '}${p.slice(0, 3).map((r) => `[${r.lic}] ${r.file.slice(0, 48)}`).join(' | ')}`);
  }
  console.log(`\n${SLOTS.length} slots, ${short} with no match`);
}

function build() {
  const only = opt('only') ? new RegExp(opt('only')) : null;
  const idx = loadIndex(), packs = packNames();
  const man = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { v: 1, sets: {} };
  man.note = 'tools/audio-pick.mjs writes this from the studio library; data/audiosets.js reads it. Files under public/audio/.';
  for (const s of SLOTS) {
    const id = `${s.set}/${s.kind}`;
    if (only && !only.test(id)) continue;
    const picks = spread(candidates(s, idx, packs), s.n);
    const dir = join(OUT, s.set); mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) if (f.startsWith(`${s.kind}.`) && f.endsWith('.ogg')) rmSync(join(dir, f));
    const files = [];
    // A slice slot takes several hits from each file until it has n; the others take one per file.
    const per = 1;
    const pool = s.mode === 'slice' ? spread(candidates(s, idx, packs), s.n * 2) : picks;
    // A slice slot deals its hits round-robin across its files (one hit from each, then a second from each...), so a
    // thin slot still fills to n and no one take dominates.
    if (s.mode === 'slice') {
      const decks = [];
      for (const r of pool) {
        const src = pathOf(r);
        if (!existsSync(src)) { console.log(`  missing ${src}`); continue; }
        const total = probeDur(src), pk = ffErr(['-t', '40', '-i', src, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-']).match(/max_volume: (-?[d.]+) dB/);
        const segs = segments(src, Math.min(-30, (pk ? +pk[1] : 0) - 24), total).filter(([a, b]) => b - a > 0.05);
        if (segs.length) decks.push({ r, src, total, segs, hits: spread(segs, s.n) });
      }
      for (let round = 0; files.length < s.n && decks.some((d) => d.hits.length > round); round++) {
        for (const D of decks) {
          if (files.length >= s.n || round >= D.hits.length) continue;
          const [a] = D.hits[round], out = join(dir, `${s.kind}.${files.length}.ogg`);
          // A hit keeps its tail (the room, the echo off the hills) up to the next hit's onset.
          const next = D.segs.find(([x]) => x > a + 0.03)?.[0] ?? D.total;
          const d = Math.min(s.dur, Math.max(0.08, next - a - 0.01));
          try { encodeShot(D.src, Math.max(0, a - 0.01), d, out); } catch (e) { console.log(`  FAIL ${D.r.file}: ${String(e.stderr ?? e.message).split('\n').filter(Boolean).slice(-1)}`); continue; }
          files.push({ f: `${s.set}/${basename(out)}`, src: `${D.r.cat}/${D.r.sub}/${D.r.file}`, lic: D.r.lic, at: +a.toFixed(2), dur: +d.toFixed(2) });
        }
      }
    }
    for (const r of s.mode === 'slice' ? [] : pool) {
      if (files.length >= s.n) break;
      const src = pathOf(r);
      if (!existsSync(src)) { console.log(`  missing ${src}`); continue; }
      const total = probeDur(src);
      try {
        if (s.mode === 'loop' || s.mode === 'bed') {
          const L = Math.min(s.dur, Math.max(1, total - (s.mode === 'bed' ? 2.2 : 0.4)));
          const ss = Math.max(0, Math.min(total - L - (s.mode === 'bed' ? 2.1 : 0.3), total * (s.at ?? 0.2)));
          const out = join(dir, `${s.kind}.${files.length}.ogg`);
          encodeLoop(src, ss, L, out, s.mode === 'bed');
          files.push({ f: `${s.set}/${basename(out)}`, src: `${r.cat}/${r.sub}/${r.file}`, lic: r.lic, at: +ss.toFixed(2), dur: +L.toFixed(2) });
        } else if (s.mode === 'slice') {
          const segs = segments(src, -34, total).filter(([a, b]) => b - a > 0.05);
          const take = spread(segs, per);
          for (const [a] of take) {
            if (files.length >= s.n) break;
            const out = join(dir, `${s.kind}.${files.length}.ogg`);
            // A hit keeps its tail (the room, the echo off the hills) up to the next hit's onset.
            const next = segs.find(([x]) => x > a + 0.03)?.[0] ?? total;
            const d = Math.min(s.dur, Math.max(0.08, next - a - 0.01));
            encodeShot(src, Math.max(0, a - 0.01), d, out);
            files.push({ f: `${s.set}/${basename(out)}`, src: `${r.cat}/${r.sub}/${r.file}`, lic: r.lic, at: +a.toFixed(2), dur: +d.toFixed(2) });
          }
        } else {
          const out = join(dir, `${s.kind}.${files.length}.ogg`);
          // From its first onset (a take with a breath of room tone in front starts on the sound).
          const pk = ffErr(['-t', '40', '-i', src, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-']).match(/max_volume: (-?[\d.]+) dB/);
          const at0 = segments(src, Math.min(-30, (pk ? +pk[1] : 0) - 24), total)[0]?.[0] ?? 0;
          const d = Math.min(s.dur, Math.max(0.1, total - at0));
          encodeShot(src, Math.max(0, at0 - 0.01), d, out);
          files.push({ f: `${s.set}/${basename(out)}`, src: `${r.cat}/${r.sub}/${r.file}`, lic: r.lic, at: +at0.toFixed(2), dur: +d.toFixed(2) });
        }
      } catch (e) { console.log(`  FAIL ${r.file}: ${String(e.stderr ?? e.message).split('\n').filter(Boolean).slice(-2).join(' ')}`); }
    }
    for (const x of files) x.bytes = statSync(join(OUT, x.f)).size;
    (man.sets[s.set] ??= {})[s.kind] = { mode: s.mode, files };
    console.log(`${id.padEnd(28)} ${files.length}/${s.n}  ${(files.reduce((n, x) => n + x.bytes, 0) / 1024).toFixed(0)} KB`);
  }
  man.bytes = Object.values(man.sets).flatMap((k) => Object.values(k)).flatMap((k) => k.files).reduce((n, x) => n + (x.bytes ?? 0), 0);
  writeFileSync(MANIFEST, JSON.stringify(man, null, 1));
  writeLicenses(man);
  console.log(`\nmanifest: ${(man.bytes / 1048576).toFixed(2)} MB in public/audio`);
}

function writeLicenses(man) {
  const rows = [], bySrc = new Map();
  for (const [set, kinds] of Object.entries(man.sets)) for (const [kind, k] of Object.entries(kinds)) for (const x of k.files) {
    rows.push(x);
    const e = bySrc.get(x.lic) ?? { n: 0, bytes: 0 }; e.n++; e.bytes += x.bytes ?? 0; bySrc.set(x.lic, e);
  }
  const L = [];
  L.push('# Sound licenses (DIVIDED STATES OF AMERICA, web/)', '');
  L.push('Every recorded sound the game ships, where it came from and under what terms. Written by `tools/audio-pick.mjs build` (do not edit by hand; edit the slots and rebuild). Everything not listed here is synthesized in code (`src/systems/audio.js`) or rendered by the voice forge (`public/voice/manifest.json`).', '');
  L.push('**The training law:** none of these files (Pro Sound Effects BBC, Gamemaster, Sonniss) may ever be used to train or fine-tune any model. Energetic Forms sounds are NOT shipped until their terms are confirmed.', '');
  L.push('## Sources', '', '| Source | Terms | Files | KB |', '|---|---|---:|---:|');
  for (const [lic, e] of bySrc) L.push(`| ${LICENSE[lic].name} | ${LICENSE[lic].terms} | ${e.n} | ${(e.bytes / 1024).toFixed(0)} |`);
  L.push(`| ${LICENSE.ef.name} | ${LICENSE.ef.terms} | 0 | 0 |`);
  L.push('', 'Studio receipts and license texts: the NAS, `N:\\assets\\audio\\CATALOG.csv` and each pack\'s `_license/`. Sonniss: https://sonniss.com/gdc-bundle-license/', '');
  L.push('## Files', '', '| File (public/audio/) | Source (NAS library/) | License | Cut at s | Len s |', '|---|---|---|---:|---:|');
  for (const x of rows) L.push(`| ${x.f} | ${x.src.replace(/\|/g, '/')} | ${x.lic} | ${x.at} | ${x.dur} |`);
  writeFileSync(LICENSES, L.join('\n') + '\n');
}

function size() {
  let n = 0, files = 0;
  const walk = (d) => { if (!existsSync(d)) return; for (const f of readdirSync(d)) { const p = join(d, f); const st = statSync(p); if (st.isDirectory()) walk(p); else { n += st.size; files++; } } };
  walk(OUT);
  console.log(JSON.stringify({ files, mb: +(n / 1048576).toFixed(2), budgetMb: 80 }));
}

if (cmd === 'plan') plan();
else if (cmd === 'build') build();
else if (cmd === 'size') size();
else console.log('usage: audio-pick.mjs plan | build [--only <re>] | size');
