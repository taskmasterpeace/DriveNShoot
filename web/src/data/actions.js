// TIMED ACTIONS AS ROWS (docs/design/WEB_TIMED_ACTIONS.md). Every interaction that takes a person's hands and their
// attention is a row here: how long it takes, the pose the body holds while doing it, how far it is heard, what stops
// it, and what a tool or a skill does to it. systems/actions.js runs every row the same way: hold the key and it
// goes on, let go and it stops (partial progress kept where the row says so), get hit, walk off or see a threat and it
// is cancelled. The HUD's progress ring is a layout row (data/hudlayout.js 'actring').
//
// An action row:
//   label     what the prompt and the ring say while it runs ("Searching the crate")
//   dur       seconds at the base rate (a 'hit' row: seconds per hit; a 'rung' row: seconds per rung; 0: instant)
//   per       once (one bar to fill) | hit (repeats, each hit does something: a kick, a swing) | rung (a ladder) |
//             scan (no end: look-around runs while held and finds things one at a time)
//   noise     [radius m, every s]: heard while it runs (0: silent). bang: radius heard when it lands (the lock gives)
//   pose      the shared pose solver's action pose (systems/actposes.js POSES)
//   stop      what cancels it: damage (any hit), move (m the body may drift before it counts as walking off;
//             false: the action moves you itself), threat (m: a hostile in sight inside it; 0: never)
//   keep      partial progress stays on the target when you let go or are interrupted (a half-searched crate)
//   tool      the item it needs in your pack (null: bare hands); wear: condition the tool loses per completion
//   attr      the deep-sheet attribute that speeds it, and mul: share of the time taken off per point over 5
//   fx        the deep sheet's flat multiplier on its time (g.deep.fx[fx], e.g. lockMul)
export const ACTIONS = {
  open:        { label: 'Opening', dur: 0, per: 'once', noise: [0, 0], bang: 0, pose: null, stop: { damage: false, move: false, threat: 0 }, keep: false, tool: null },
  search_box:  { label: 'Searching', dur: 4.0, per: 'once', noise: [3, 1.5], bang: 0, pose: 'kneel', stop: { damage: true, move: 0.6, threat: 12 }, keep: true, tool: null, attr: 'eye', mul: 0.05 },
  search_body: { label: 'Patting down the body', dur: 6.5, per: 'once', noise: [2, 2], bang: 0, pose: 'patdown', stop: { damage: true, move: 0.6, threat: 12 }, keep: true, tool: null, attr: 'eye', mul: 0.04 },
  look_around: { label: 'Looking around', dur: 0, per: 'scan', noise: [0, 0], bang: 0, pose: 'lookdown', stop: { damage: true, move: 0.5, threat: 12 }, keep: false, tool: null, attr: 'eye', mul: 0.06 },
  kick:        { label: 'Kicking the door', dur: 0.6, per: 'hit', noise: [0, 0], bang: 30, pose: 'kick', stop: { damage: true, move: 0.8, threat: 0 }, keep: true, tool: null, attr: 'brawn', mul: 0.04 },
  pick:        { label: 'Picking the lock', dur: 2.6, per: 'once', noise: [1.5, 1], bang: 0, pose: 'pick', stop: { damage: true, move: 0.5, threat: 10 }, keep: false, tool: 'lockpicks', wear: 0, fx: 'lockMul' },
  pry:         { label: 'Prying it open', dur: 1.3, per: 'once', noise: [8, 0.6], bang: 18, pose: 'pry', stop: { damage: true, move: 0.6, threat: 10 }, keep: true, tool: 'crowbar', wear: 0.05, attr: 'brawn', mul: 0.03, fx: 'lockMul' },
  cut:         { label: 'Cutting the chain', dur: 1.6, per: 'once', noise: [4, 0.8], bang: 6, pose: 'cut', stop: { damage: true, move: 0.6, threat: 10 }, keep: true, tool: 'bolt_cutters', wear: 0.08, attr: 'brawn', mul: 0.03 },
  sledge:      { label: 'Smashing it in', dur: 0.9, per: 'hit', noise: [0, 0], bang: 36, pose: 'sledge', stop: { damage: true, move: 0.8, threat: 0 }, keep: true, tool: 'sledgehammer', wear: 0.04, attr: 'brawn', mul: 0.05 },
  duck_under:  { label: 'Ducking under', dur: 1.1, per: 'once', noise: [2, 1], bang: 0, pose: 'duck', stop: { damage: true, move: false, threat: 0 }, keep: false, tool: null, attr: 'quickness', mul: 0.04 },
  climb:       { label: 'Climbing', dur: 0.28, per: 'rung', noise: [3, 0], bang: 0, pose: 'climb', stop: { damage: true, move: false, threat: 0 }, keep: true, tool: null, attr: 'quickness', mul: 0.04 },
  pull_down:   { label: 'Pulling the ladder down', dur: 1.4, per: 'once', noise: [0, 0], bang: 9, pose: 'reach', stop: { damage: true, move: 0.5, threat: 0 }, keep: false, tool: null, attr: 'brawn', mul: 0.03 },
  kick_down:   { label: 'Kicking the ladder down', dur: 0.6, per: 'once', noise: [0, 0], bang: 14, pose: 'kick', stop: { damage: true, move: 0.5, threat: 0 }, keep: false, tool: null },
  place_ladder:{ label: 'Setting the ladder', dur: 2.0, per: 'once', noise: [4, 1], bang: 0, pose: 'work', stop: { damage: true, move: 0.6, threat: 10 }, keep: false, tool: 'ladder_portable' },
  take_ladder: { label: 'Taking the ladder down', dur: 1.5, per: 'once', noise: [4, 1], bang: 0, pose: 'work', stop: { damage: true, move: 0.6, threat: 10 }, keep: false, tool: null },
  board_door:  { label: 'Boarding the doorway', dur: 3.5, per: 'once', noise: [12, 0.7], bang: 0, pose: 'board', stop: { damage: true, move: 0.6, threat: 10 }, keep: true, tool: 'hammer_nails' },
};

// What hurts the one doing it. kick: a boot on a locked door can turn an ankle (chance per kick, less per Brawn point).
export const HURT = { kick: { chance: 0.07, perBrawn: 0.012, hp: 4, why: 'turned an ankle on the door' } };

// THE TOOLS. A tool is an item (data/items.js) with wear: each completion takes `wear` off its condition (slot.wear
// climbs 0 -> 1); at 1 it breaks and is gone. verbs: the actions it does.
export const TOOLS = {
  lockpicks: { verbs: ['pick'], note: 'a pick per lock (its own uses)' },
  crowbar: { verbs: ['pry'] },
  bolt_cutters: { verbs: ['cut'] },
  sledgehammer: { verbs: ['sledge'] },
  hammer_nails: { verbs: ['board_door'] },
  ladder_portable: { verbs: ['place_ladder'] },
};

// WHAT OPENS WHAT. A lock is one of these kinds; its verbs are what work on it, in the order the held key tries them
// (quietest first). A verb not in the list does nothing to it (a boot does not open a padlock).
export const LOCK_KINDS = {
  door:    { name: 'lock', verbs: ['pick', 'pry', 'sledge', 'kick'] },
  padlock: { name: 'padlock and chain', verbs: ['cut', 'pick', 'sledge'] },
  bay:     { name: 'roll-up padlock', verbs: ['cut', 'pick', 'sledge'] },
  chain_fence: { name: 'chain-link', verbs: ['cut'] },
};
// sledge hits a lock takes, by door material (data/interiors.js materials); anything else: default.
export const SLEDGE_HITS = { wood: 2, metal: 3, default: 2 };
// The share of LOCKED back-lot gates that are held by a padlock and chain (seeded by the door's id).
export const PADLOCKS = { gate: 0.6, back: 0.15 };

// THE MARKS a break-in leaves (drawn by systems/actions.js in one instanced mesh, saved by door id). Picking leaves
// fresh scratches round the keyway; the rest leave the frame splintered, the chain cut, the leaf off its hinges.
export const BREAK_MARKS = {
  picked:  { name: 'scratched keyway', color: '#d8d2c0', splinters: 1 },
  kicked:  { name: 'splintered frame, boot print', color: '#c9a77a', splinters: 4 },
  pried:   { name: 'gouged and split at the lock', color: '#b88f5e', splinters: 3 },
  cut:     { name: 'cut chain on the ground', color: '#8a8a84', splinters: 2 },
  sledged: { name: 'smashed off its hinges', color: '#a07a50', splinters: 6, offHinges: true },
};

// OPEN vs SEARCH. Opening a container shows what is on top. A thorough search (search_box / search_body) finds the
// rest: what slid under, the hidden pocket, the envelope taped inside. Per container kind:
//   hide   chance a small item (bulk under SMALL) is out of sight when you only open it
//   dur    the search's time multiplier for this kind (a fridge is quick, a trunk slow)
// Guns and anything bulkier than BIG are always on top; HIDDEN items are always out of sight until searched.
export const CONCEAL = {
  default:  { hide: 0.45, dur: 1.0 },
  crate:    { hide: 0.5, dur: 1.1 },
  shelf:    { hide: 0.3, dur: 0.7 },
  cupboard: { hide: 0.4, dur: 0.8 },
  dresser:  { hide: 0.6, dur: 1.0 },
  desk:     { hide: 0.55, dur: 0.9 },
  trunk:    { hide: 0.5, dur: 1.3 },
  ground:   { hide: 0, dur: 0.5 },
  body:     { hide: 1, dur: 1.0 }, // the dead: nothing but the gun in the hand shows until you pat them down
};
export const CONCEAL_SIZE = { SMALL: 0.35, BIG: 1.0 };
export const HIDDEN = ['door_key', 'scrap_note', 'gold_ring', 'lockpicks', 'photograph'];

// LOOK AROUND. Head down, scanning the ground: small things lying in the radius are found one at a time, nearest
// first. Each find takes base + perM x distance seconds of looking. Only what is really there is found: things that
// were dropped or fell, unseen until someone looks (systems/actions.js drops), and tracks in the dirt (THE WILDS).
export const LOOK = { radius: 5, eyeRadius: 0.35, base: 0.8, perM: 0.45, tracks: true, maxFinds: 6 };

// LADDERS. A ladder is a world piece: a foot on the ground, a top where you step off, a facing (away from what it
// leans on). Rungs every RUNG m; the climb goes rung by rung. kinds:
//   wall      bolted to a building's side, up to its roof
//   dropdown  a fire escape's last flight: drawn up out of reach until pulled down from below or kicked from above
//   hatch     a roof hatch's ladder (rows only; the forge places them)
//   portable  carried as an item, set against a wall, taken back
// fall: hp per metre fallen when you are knocked off (hit while climbing), after `safe` m.
export const LADDER = { rung: 0.3, width: 0.5, fall: { safe: 2.2, hpPerM: 9 }, standOff: 0.42, stepIn: 0.85, reach: 1.3 };
export const LADDER_KINDS = {
  wall:     { name: 'wall ladder', color: '#5b5650', fixed: true },
  dropdown: { name: 'fire-escape ladder', color: '#3e3a36', fixed: true, retracted: true, upFrom: 1.6 },
  hatch:    { name: 'roof hatch ladder', color: '#6a645c', fixed: true },
  portable: { name: 'aluminium ladder', color: '#a8aaa4', fixed: false, maxH: 4.8, item: 'ladder_portable' },
};
// Where generated towns get them (systems/actions.js reads systems/citygen.js live towns). share: chance a building of
// that kind with a roof you can stand on gets a wall ladder up one side wall; escape: every fire escape's first flight
// gets a drop-down ladder at its landing with this chance.
export const LADDER_PLACE = { wallKinds: ['warehouse', 'auto_shop', 'shop', 'saloon', 'diner', 'motel', 'apartment', 'office', 'hotel', 'school', 'clinic', 'hospital', 'fire_station', 'police_station', 'truck_stop', 'mill', 'adobe', 'rowhouse'], wallShare: 0.45, anyShare: 0.15, escape: 1.0 };

// HALF-OPEN ROLL-UPS. A share of the unlocked roll-up bays in a town are jammed half up: no car gets in, a person
// ducks under. gap: m of clearance under the panel.
export const ROLLUP = { jammed: 0.3, gap: 0.95 };

// The HUD ring (a layout row 'actring' in data/hudlayout.js): its size in design px and its colours (warm, no purple).
export const RING = { size: 64, track: 'rgba(20,16,12,0.55)', fill: '#e8b04a', warn: '#ff6a3a' };

const NUM = (v, lo, hi) => typeof v === 'number' && v >= lo && v <= hi;
export function validateActions(rows = { ACTIONS, TOOLS, LOCK_KINDS, CONCEAL, LOOK, LADDER, LADDER_KINDS, BREAK_MARKS, SLEDGE_HITS, HURT, ROLLUP }, items = null, poses = null) {
  const bad = [];
  const PER = ['once', 'hit', 'rung', 'scan'];
  for (const [id, a] of Object.entries(rows.ACTIONS ?? {})) {
    if (!a.label) bad.push(`action ${id}: no label`);
    if (!PER.includes(a.per)) bad.push(`action ${id}: per must be ${PER.join('|')}`);
    if (!NUM(a.dur, 0, 30)) bad.push(`action ${id}: dur out of 0..30 s`);
    if ((a.per === 'once' || a.per === 'hit' || a.per === 'rung') && id !== 'open' && !(a.dur > 0)) bad.push(`action ${id}: a timed action must take time`);
    if (!Array.isArray(a.noise) || a.noise.length !== 2 || !NUM(a.noise[0], 0, 80) || !NUM(a.noise[1], 0, 10)) bad.push(`action ${id}: noise must be [radius 0..80, every 0..10]`);
    if (!NUM(a.bang ?? 0, 0, 80)) bad.push(`action ${id}: bang out of 0..80 m`);
    if (!a.stop || typeof a.stop.damage !== 'boolean') bad.push(`action ${id}: stop.damage must be true/false`);
    if (a.stop && a.stop.move !== false && !NUM(a.stop.move, 0.1, 3)) bad.push(`action ${id}: stop.move must be false or 0.1..3 m`);
    if (a.stop && !NUM(a.stop.threat, 0, 40)) bad.push(`action ${id}: stop.threat out of 0..40 m`);
    if (a.tool && items && !items[a.tool]) bad.push(`action ${id}: tool ${a.tool} is not an item`);
    if (a.wear !== undefined && !NUM(a.wear, 0, 1)) bad.push(`action ${id}: wear out of 0..1`);
    if (a.mul !== undefined && !NUM(a.mul, 0, 0.15)) bad.push(`action ${id}: mul out of 0..0.15 per point`);
    if (a.pose && poses && !poses[a.pose]) bad.push(`action ${id}: pose ${a.pose} is not a pose`);
  }
  for (const [id, t] of Object.entries(rows.TOOLS ?? {})) {
    if (items && !items[id]) bad.push(`tool ${id}: not an item`);
    for (const v of t.verbs ?? []) if (!rows.ACTIONS[v]) bad.push(`tool ${id}: verb ${v} is not an action`);
  }
  for (const [id, k] of Object.entries(rows.LOCK_KINDS ?? {})) {
    if (!k.verbs?.length) bad.push(`lock ${id}: nothing opens it`);
    for (const v of k.verbs ?? []) if (!rows.ACTIONS[v]) bad.push(`lock ${id}: verb ${v} is not an action`);
  }
  if (rows.LOCK_KINDS?.padlock?.verbs.includes('kick')) bad.push('a boot never opens a padlock');
  for (const [id, c] of Object.entries(rows.CONCEAL ?? {})) {
    if (!NUM(c.hide, 0, 1)) bad.push(`conceal ${id}: hide out of 0..1`);
    if (!NUM(c.dur, 0.2, 3)) bad.push(`conceal ${id}: dur out of 0.2..3`);
  }
  const L = rows.LOOK;
  if (L && (!NUM(L.radius, 1, 20) || !NUM(L.base, 0.1, 10) || !NUM(L.perM, 0, 5))) bad.push('look: radius 1..20, base 0.1..10, perM 0..5');
  const LD = rows.LADDER;
  if (LD && (!NUM(LD.rung, 0.15, 0.5) || !NUM(LD.fall?.hpPerM, 0, 40))) bad.push('ladder: rung 0.15..0.5 m, fall.hpPerM 0..40');
  for (const [id, k] of Object.entries(rows.LADDER_KINDS ?? {})) if (!k.name || !/^#[0-9a-f]{6}$/i.test(k.color ?? '')) bad.push(`ladder kind ${id}: name and a #rrggbb colour`);
  for (const [id, m] of Object.entries(rows.BREAK_MARKS ?? {})) if (!/^#[0-9a-f]{6}$/i.test(m.color ?? '') || !NUM(m.splinters, 0, 8)) bad.push(`mark ${id}: colour and 0..8 splinters`);
  // No purple anywhere (hue 270..320).
  const hue = (hex) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 0.08) return -1; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
  for (const c of [...Object.values(rows.LADDER_KINDS ?? {}).map((k) => k.color), ...Object.values(rows.BREAK_MARKS ?? {}).map((m) => m.color)]) { const h = hue(c); if (h >= 270 && h <= 320) bad.push(`${c} is purple`); }
  if (rows.ROLLUP && (!NUM(rows.ROLLUP.jammed, 0, 1) || !NUM(rows.ROLLUP.gap, 0.6, 1.4))) bad.push('rollup: jammed 0..1, gap 0.6..1.4 m');
  return { ok: bad.length === 0, bad };
}
